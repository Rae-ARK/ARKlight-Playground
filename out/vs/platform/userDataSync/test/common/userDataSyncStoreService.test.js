import assert from "assert";
import { timeout } from "../../../../base/common/async.js";
import { newWriteableBufferStream } from "../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { isWeb } from "../../../../base/common/platform.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { IProductService } from "../../../product/common/productService.js";
import { IUserDataSyncStoreService, SyncResource, UserDataSyncErrorCode, UserDataSyncStoreError } from "../../common/userDataSync.js";
import { RequestsSession, UserDataSyncStoreService } from "../../common/userDataSyncStoreService.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
suite("UserDataSyncStoreService", () => {
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  test("test read manifest for the first time", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    const productService = client.instantiationService.get(IProductService);
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Client-Name"], `${productService.applicationName}${isWeb ? "-web" : ""}`);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Client-Version"], productService.version);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test read manifest for the second time when session is not yet created", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test session id header is not set in the first manifest request after session is created", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test session id header is set from the second manifest request after session is created", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test headers are send for write request", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    await testObject.manifest(null);
    target.reset();
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test headers are send for read request", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    await testObject.manifest(null);
    target.reset();
    await testObject.readResource(SyncResource.Settings, null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test headers are reset after session is cleared ", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    await testObject.manifest(null);
    await testObject.clear();
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test old headers are sent after session is changed on server ", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    const userSessionId = target.requestsWithAllHeaders[0].headers["X-User-Session-Id"];
    await target.clear();
    const client2 = disposableStore.add(new UserDataSyncClient(target));
    await client2.setUp();
    const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
    await testObject2.writeResource(SyncResource.Settings, "some content", null);
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], userSessionId);
  });
  test("test old headers are reset from second request after session is changed on server ", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    const userSessionId = target.requestsWithAllHeaders[0].headers["X-User-Session-Id"];
    await target.clear();
    const client2 = disposableStore.add(new UserDataSyncClient(target));
    await client2.setUp();
    const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
    await testObject2.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], userSessionId);
  });
  test("test old headers are sent after session is cleared from another server ", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    const userSessionId = target.requestsWithAllHeaders[0].headers["X-User-Session-Id"];
    const client2 = disposableStore.add(new UserDataSyncClient(target));
    await client2.setUp();
    const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
    await testObject2.clear();
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], userSessionId);
  });
  test("test headers are reset after session is cleared from another server ", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    const client2 = disposableStore.add(new UserDataSyncClient(target));
    await client2.setUp();
    const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
    await testObject2.clear();
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test headers are reset after session is cleared from another server - started syncing again", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    const userSessionId = target.requestsWithAllHeaders[0].headers["X-User-Session-Id"];
    const client2 = disposableStore.add(new UserDataSyncClient(target));
    await client2.setUp();
    const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
    await testObject2.clear();
    await testObject.manifest(null);
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], userSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test rate limit on server with retry after", async () => {
    const target = new UserDataSyncTestServer(1, 1);
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const promise = Event.toPromise(testObject.onDidChangeDonotMakeRequestsUntil);
    try {
      await testObject.manifest(null);
      assert.fail("should fail");
    } catch (e) {
      assert.ok(e instanceof UserDataSyncStoreError);
      assert.deepStrictEqual(e.code, UserDataSyncErrorCode.TooManyRequestsAndRetryAfter);
      await promise;
      assert.ok(!!testObject.donotMakeRequestsUntil);
    }
  });
  test("test donotMakeRequestsUntil is reset after retry time is finished", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const client = disposableStore.add(new UserDataSyncClient(new UserDataSyncTestServer(1, 0.25)));
      await client.setUp();
      const testObject = client.instantiationService.get(IUserDataSyncStoreService);
      await testObject.manifest(null);
      try {
        await testObject.manifest(null);
        assert.fail("should fail");
      } catch (e) {
      }
      const promise = Event.toPromise(testObject.onDidChangeDonotMakeRequestsUntil);
      await timeout(300);
      await promise;
      assert.ok(!testObject.donotMakeRequestsUntil);
    });
  });
  test("test donotMakeRequestsUntil is retrieved", async () => {
    const client = disposableStore.add(new UserDataSyncClient(new UserDataSyncTestServer(1, 1)));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    try {
      await testObject.manifest(null);
    } catch (e) {
    }
    const target = disposableStore.add(client.instantiationService.createInstance(UserDataSyncStoreService));
    assert.strictEqual(target.donotMakeRequestsUntil?.getTime(), testObject.donotMakeRequestsUntil?.getTime());
  });
  test("test donotMakeRequestsUntil is checked and reset after retreived", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const client = disposableStore.add(new UserDataSyncClient(new UserDataSyncTestServer(1, 0.25)));
      await client.setUp();
      const testObject = client.instantiationService.get(IUserDataSyncStoreService);
      await testObject.manifest(null);
      try {
        await testObject.manifest(null);
        assert.fail("should fail");
      } catch (e) {
      }
      await timeout(300);
      const target = disposableStore.add(client.instantiationService.createInstance(UserDataSyncStoreService));
      assert.ok(!target.donotMakeRequestsUntil);
    });
  });
  test("test read resource request handles 304", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    await client.sync();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    const expected = await testObject.readResource(SyncResource.Settings, null);
    const actual = await testObject.readResource(SyncResource.Settings, expected);
    assert.strictEqual(actual, expected);
  });
});
suite("UserDataSyncRequestsSession", () => {
  const requestService = {
    _serviceBrand: void 0,
    onDidCompleteRequest: Event.None,
    async request() {
      return { res: { headers: {} }, stream: newWriteableBufferStream() };
    },
    async resolveProxy() {
      return void 0;
    },
    async lookupAuthorization() {
      return void 0;
    },
    async lookupKerberosAuthorization() {
      return void 0;
    },
    async loadCertificates() {
      return [];
    }
  };
  ensureNoDisposablesAreLeakedInTestSuite();
  test("too many requests are thrown when limit exceeded", async () => {
    const testObject = new RequestsSession(1, 500, requestService, new NullLogService());
    await testObject.request("url", { callSite: "test" }, CancellationToken.None);
    try {
      await testObject.request("url", { callSite: "test" }, CancellationToken.None);
    } catch (error) {
      assert.ok(error instanceof UserDataSyncStoreError);
      assert.strictEqual(error.code, UserDataSyncErrorCode.LocalTooManyRequests);
      return;
    }
    assert.fail("Should fail with limit exceeded");
  });
  test("requests are handled after session is expired", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const testObject = new RequestsSession(1, 100, requestService, new NullLogService());
    await testObject.request("url", { callSite: "test" }, CancellationToken.None);
    await timeout(125);
    await testObject.request("url", { callSite: "test" }, CancellationToken.None);
  }));
  test("too many requests are thrown after session is expired", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const testObject = new RequestsSession(1, 100, requestService, new NullLogService());
    await testObject.request("url", { callSite: "test" }, CancellationToken.None);
    await timeout(125);
    await testObject.request("url", { callSite: "test" }, CancellationToken.None);
    try {
      await testObject.request("url", { callSite: "test" }, CancellationToken.None);
    } catch (error) {
      assert.ok(error instanceof UserDataSyncStoreError);
      assert.strictEqual(error.code, UserDataSyncErrorCode.LocalTooManyRequests);
      return;
    }
    assert.fail("Should fail with limit exceeded");
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy90ZXN0L2NvbW1vbi91c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RDb21wbGV0ZUV2ZW50LCBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIFN5bmNSZXNvdXJjZSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLCBVc2VyRGF0YVN5bmNTdG9yZUVycm9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBSZXF1ZXN0c1Nlc3Npb24sIFVzZXJEYXRhU3luY1N0b3JlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi91c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFTeW5jQ2xpZW50LCBVc2VyRGF0YVN5bmNUZXN0U2VydmVyIH0gZnJvbSAnLi91c2VyRGF0YVN5bmNDbGllbnQuanMnO1xuXG5zdWl0ZSgnVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Rlc3QgcmVhZCBtYW5pZmVzdCBmb3IgdGhlIGZpcnN0IHRpbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJUHJvZHVjdFNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1DbGllbnQtTmFtZSddLCBgJHtwcm9kdWN0U2VydmljZS5hcHBsaWNhdGlvbk5hbWV9JHtpc1dlYiA/ICctd2ViJyA6ICcnfWApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1DbGllbnQtVmVyc2lvbiddLCBwcm9kdWN0U2VydmljZS52ZXJzaW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ10sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IHJlYWQgbWFuaWZlc3QgZm9yIHRoZSBzZWNvbmQgdGltZSB3aGVuIHNlc3Npb24gaXMgbm90IHlldCBjcmVhdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNldHVwIHRoZSBjbGllbnRcblx0XHRjb25zdCB0YXJnZXQgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRhd2FpdCBjbGllbnQuc2V0VXAoKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0Y29uc3QgbWFjaGluZVNlc3Npb25JZCA9IHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddO1xuXG5cdFx0dGFyZ2V0LnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgbWFjaGluZVNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IHNlc3Npb24gaWQgaGVhZGVyIGlzIG5vdCBzZXQgaW4gdGhlIGZpcnN0IG1hbmlmZXN0IHJlcXVlc3QgYWZ0ZXIgc2Vzc2lvbiBpcyBjcmVhdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNldHVwIHRoZSBjbGllbnRcblx0XHRjb25zdCB0YXJnZXQgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRhd2FpdCBjbGllbnQuc2V0VXAoKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0Y29uc3QgbWFjaGluZVNlc3Npb25JZCA9IHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVSZXNvdXJjZShTeW5jUmVzb3VyY2UuU2V0dGluZ3MsICdzb21lIGNvbnRlbnQnLCBudWxsKTtcblxuXHRcdHRhcmdldC5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ10sIG1hY2hpbmVTZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1Vc2VyLVNlc3Npb24tSWQnXSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndGVzdCBzZXNzaW9uIGlkIGhlYWRlciBpcyBzZXQgZnJvbSB0aGUgc2Vjb25kIG1hbmlmZXN0IHJlcXVlc3QgYWZ0ZXIgc2Vzc2lvbiBpcyBjcmVhdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNldHVwIHRoZSBjbGllbnRcblx0XHRjb25zdCB0YXJnZXQgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRhd2FpdCBjbGllbnQuc2V0VXAoKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0Y29uc3QgbWFjaGluZVNlc3Npb25JZCA9IHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVSZXNvdXJjZShTeW5jUmVzb3VyY2UuU2V0dGluZ3MsICdzb21lIGNvbnRlbnQnLCBudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXG5cdFx0dGFyZ2V0LnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgbWFjaGluZVNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IGhlYWRlcnMgYXJlIHNlbmQgZm9yIHdyaXRlIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRjb25zdCBtYWNoaW5lU2Vzc2lvbklkID0gdGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ107XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZVJlc291cmNlKFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgJ3NvbWUgY29udGVudCcsIG51bGwpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblxuXHRcdHRhcmdldC5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVSZXNvdXJjZShTeW5jUmVzb3VyY2UuU2V0dGluZ3MsICdzb21lIGNvbnRlbnQnLCBudWxsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgbWFjaGluZVNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IGhlYWRlcnMgYXJlIHNlbmQgZm9yIHJlYWQgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXR1cCB0aGUgY2xpZW50XG5cdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdGNvbnN0IG1hY2hpbmVTZXNzaW9uSWQgPSB0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlUmVzb3VyY2UoU3luY1Jlc291cmNlLlNldHRpbmdzLCAnc29tZSBjb250ZW50JywgbnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXG5cdFx0dGFyZ2V0LnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5yZWFkUmVzb3VyY2UoU3luY1Jlc291cmNlLlNldHRpbmdzLCBudWxsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgbWFjaGluZVNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IGhlYWRlcnMgYXJlIHJlc2V0IGFmdGVyIHNlc3Npb24gaXMgY2xlYXJlZCAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRjb25zdCBtYWNoaW5lU2Vzc2lvbklkID0gdGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ107XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZVJlc291cmNlKFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgJ3NvbWUgY29udGVudCcsIG51bGwpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmNsZWFyKCk7XG5cblx0XHR0YXJnZXQucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgbWFjaGluZVNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IG9sZCBoZWFkZXJzIGFyZSBzZW50IGFmdGVyIHNlc3Npb24gaXMgY2hhbmdlZCBvbiBzZXJ2ZXIgJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNldHVwIHRoZSBjbGllbnRcblx0XHRjb25zdCB0YXJnZXQgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRhd2FpdCBjbGllbnQuc2V0VXAoKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZVJlc291cmNlKFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgJ3NvbWUgY29udGVudCcsIG51bGwpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0dGFyZ2V0LnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRjb25zdCBtYWNoaW5lU2Vzc2lvbklkID0gdGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ107XG5cdFx0Y29uc3QgdXNlclNlc3Npb25JZCA9IHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddO1xuXHRcdGF3YWl0IHRhcmdldC5jbGVhcigpO1xuXG5cdFx0Ly8gY2xpZW50IDJcblx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudDIuc2V0VXAoKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0MiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QyLndyaXRlUmVzb3VyY2UoU3luY1Jlc291cmNlLlNldHRpbmdzLCAnc29tZSBjb250ZW50JywgbnVsbCk7XG5cblx0XHR0YXJnZXQucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgbWFjaGluZVNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1Vc2VyLVNlc3Npb24tSWQnXSwgdXNlclNlc3Npb25JZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3Qgb2xkIGhlYWRlcnMgYXJlIHJlc2V0IGZyb20gc2Vjb25kIHJlcXVlc3QgYWZ0ZXIgc2Vzc2lvbiBpcyBjaGFuZ2VkIG9uIHNlcnZlciAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlUmVzb3VyY2UoU3luY1Jlc291cmNlLlNldHRpbmdzLCAnc29tZSBjb250ZW50JywgbnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHR0YXJnZXQucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdGNvbnN0IG1hY2hpbmVTZXNzaW9uSWQgPSB0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXTtcblx0XHRjb25zdCB1c2VyU2Vzc2lvbklkID0gdGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ107XG5cdFx0YXdhaXQgdGFyZ2V0LmNsZWFyKCk7XG5cblx0XHQvLyBjbGllbnQgMlxuXHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdDIud3JpdGVSZXNvdXJjZShTeW5jUmVzb3VyY2UuU2V0dGluZ3MsICdzb21lIGNvbnRlbnQnLCBudWxsKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0dGFyZ2V0LnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ10sIG1hY2hpbmVTZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1Vc2VyLVNlc3Npb24tSWQnXSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ10sIHVzZXJTZXNzaW9uSWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IG9sZCBoZWFkZXJzIGFyZSBzZW50IGFmdGVyIHNlc3Npb24gaXMgY2xlYXJlZCBmcm9tIGFub3RoZXIgc2VydmVyICcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXR1cCB0aGUgY2xpZW50XG5cdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVSZXNvdXJjZShTeW5jUmVzb3VyY2UuU2V0dGluZ3MsICdzb21lIGNvbnRlbnQnLCBudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdHRhcmdldC5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0Y29uc3QgbWFjaGluZVNlc3Npb25JZCA9IHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddO1xuXHRcdGNvbnN0IHVzZXJTZXNzaW9uSWQgPSB0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1Vc2VyLVNlc3Npb24tSWQnXTtcblxuXHRcdC8vIGNsaWVudCAyXG5cdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRhd2FpdCBjbGllbnQyLnNldFVwKCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdDIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Mi5jbGVhcigpO1xuXG5cdFx0dGFyZ2V0LnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ10sIG1hY2hpbmVTZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1Vc2VyLVNlc3Npb24tSWQnXSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ10sIHVzZXJTZXNzaW9uSWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IGhlYWRlcnMgYXJlIHJlc2V0IGFmdGVyIHNlc3Npb24gaXMgY2xlYXJlZCBmcm9tIGFub3RoZXIgc2VydmVyICcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXR1cCB0aGUgY2xpZW50XG5cdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVSZXNvdXJjZShTeW5jUmVzb3VyY2UuU2V0dGluZ3MsICdzb21lIGNvbnRlbnQnLCBudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdHRhcmdldC5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0Y29uc3QgbWFjaGluZVNlc3Npb25JZCA9IHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddO1xuXG5cdFx0Ly8gY2xpZW50IDJcblx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudDIuc2V0VXAoKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0MiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QyLmNsZWFyKCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdHRhcmdldC5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ10sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddLCBtYWNoaW5lU2Vzc2lvbklkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3QgaGVhZGVycyBhcmUgcmVzZXQgYWZ0ZXIgc2Vzc2lvbiBpcyBjbGVhcmVkIGZyb20gYW5vdGhlciBzZXJ2ZXIgLSBzdGFydGVkIHN5bmNpbmcgYWdhaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlUmVzb3VyY2UoU3luY1Jlc291cmNlLlNldHRpbmdzLCAnc29tZSBjb250ZW50JywgbnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHR0YXJnZXQucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdGNvbnN0IG1hY2hpbmVTZXNzaW9uSWQgPSB0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXTtcblx0XHRjb25zdCB1c2VyU2Vzc2lvbklkID0gdGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ107XG5cblx0XHQvLyBjbGllbnQgMlxuXHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdDIuY2xlYXIoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZVJlc291cmNlKFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgJ3NvbWUgY29udGVudCcsIG51bGwpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0dGFyZ2V0LnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ10sIG1hY2hpbmVTZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1Vc2VyLVNlc3Npb24tSWQnXSwgdXNlclNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IHJhdGUgbGltaXQgb24gc2VydmVyIHdpdGggcmV0cnkgYWZ0ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoMSwgMSk7XG5cdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblxuXHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UodGVzdE9iamVjdC5vbkRpZENoYW5nZURvbm90TWFrZVJlcXVlc3RzVW50aWwpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ3Nob3VsZCBmYWlsJyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0YXNzZXJ0Lm9rKGUgaW5zdGFuY2VvZiBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKDxVc2VyRGF0YVN5bmNTdG9yZUVycm9yPmUpLmNvZGUsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ub29NYW55UmVxdWVzdHNBbmRSZXRyeUFmdGVyKTtcblx0XHRcdGF3YWl0IHByb21pc2U7XG5cdFx0XHRhc3NlcnQub2soISF0ZXN0T2JqZWN0LmRvbm90TWFrZVJlcXVlc3RzVW50aWwpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgndGVzdCBkb25vdE1ha2VSZXF1ZXN0c1VudGlsIGlzIHJlc2V0IGFmdGVyIHJldHJ5IHRpbWUgaXMgZmluaXNoZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKDEsIDAuMjUpKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQuc2V0VXAoKTtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRcdFx0YXNzZXJ0LmZhaWwoJ3Nob3VsZCBmYWlsJyk7XG5cdFx0XHR9IGNhdGNoIChlKSB7IH1cblxuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlRG9ub3RNYWtlUmVxdWVzdHNVbnRpbCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDMwMCk7XG5cdFx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdFx0YXNzZXJ0Lm9rKCF0ZXN0T2JqZWN0LmRvbm90TWFrZVJlcXVlc3RzVW50aWwpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IGRvbm90TWFrZVJlcXVlc3RzVW50aWwgaXMgcmV0cmlldmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigxLCAxKSkpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHR9IGNhdGNoIChlKSB7IH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhU3luY1N0b3JlU2VydmljZSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZG9ub3RNYWtlUmVxdWVzdHNVbnRpbD8uZ2V0VGltZSgpLCB0ZXN0T2JqZWN0LmRvbm90TWFrZVJlcXVlc3RzVW50aWw/LmdldFRpbWUoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3QgZG9ub3RNYWtlUmVxdWVzdHNVbnRpbCBpcyBjaGVja2VkIGFuZCByZXNldCBhZnRlciByZXRyZWl2ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKDEsIDAuMjUpKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQuc2V0VXAoKTtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRcdFx0YXNzZXJ0LmZhaWwoJ3Nob3VsZCBmYWlsJyk7XG5cdFx0XHR9IGNhdGNoIChlKSB7IH1cblxuXHRcdFx0YXdhaXQgdGltZW91dCgzMDApO1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKSk7XG5cdFx0XHRhc3NlcnQub2soIXRhcmdldC5kb25vdE1ha2VSZXF1ZXN0c1VudGlsKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGVzdCByZWFkIHJlc291cmNlIHJlcXVlc3QgaGFuZGxlcyAzMDQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdGF3YWl0IGNsaWVudC5zeW5jKCk7XG5cblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IGF3YWl0IHRlc3RPYmplY3QucmVhZFJlc291cmNlKFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgdGVzdE9iamVjdC5yZWFkUmVzb3VyY2UoU3luY1Jlc291cmNlLlNldHRpbmdzLCBleHBlY3RlZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG59KTtcblxuc3VpdGUoJ1VzZXJEYXRhU3luY1JlcXVlc3RzU2Vzc2lvbicsICgpID0+IHtcblxuXHRjb25zdCByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlID0ge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRvbkRpZENvbXBsZXRlUmVxdWVzdDogRXZlbnQuTm9uZSBhcyBFdmVudDxJUmVxdWVzdENvbXBsZXRlRXZlbnQ+LFxuXHRcdGFzeW5jIHJlcXVlc3QoKSB7IHJldHVybiB7IHJlczogeyBoZWFkZXJzOiB7fSB9LCBzdHJlYW06IG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSgpIH07IH0sXG5cdFx0YXN5bmMgcmVzb2x2ZVByb3h5KCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9LFxuXHRcdGFzeW5jIGxvb2t1cEF1dGhvcml6YXRpb24oKSB7IHJldHVybiB1bmRlZmluZWQ7IH0sXG5cdFx0YXN5bmMgbG9va3VwS2VyYmVyb3NBdXRob3JpemF0aW9uKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9LFxuXHRcdGFzeW5jIGxvYWRDZXJ0aWZpY2F0ZXMoKSB7IHJldHVybiBbXTsgfVxuXHR9O1xuXG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndG9vIG1hbnkgcmVxdWVzdHMgYXJlIHRocm93biB3aGVuIGxpbWl0IGV4Y2VlZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgUmVxdWVzdHNTZXNzaW9uKDEsIDUwMCwgcmVxdWVzdFNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnJlcXVlc3QoJ3VybCcsIHsgY2FsbFNpdGU6ICd0ZXN0JyB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnJlcXVlc3QoJ3VybCcsIHsgY2FsbFNpdGU6ICd0ZXN0JyB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgVXNlckRhdGFTeW5jU3RvcmVFcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxVc2VyRGF0YVN5bmNTdG9yZUVycm9yPmVycm9yKS5jb2RlLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTG9jYWxUb29NYW55UmVxdWVzdHMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIGZhaWwgd2l0aCBsaW1pdCBleGNlZWRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1ZXN0cyBhcmUgaGFuZGxlZCBhZnRlciBzZXNzaW9uIGlzIGV4cGlyZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IFJlcXVlc3RzU2Vzc2lvbigxLCAxMDAsIHJlcXVlc3RTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5yZXF1ZXN0KCd1cmwnLCB7IGNhbGxTaXRlOiAndGVzdCcgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMjUpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QucmVxdWVzdCgndXJsJywgeyBjYWxsU2l0ZTogJ3Rlc3QnIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9KSk7XG5cblx0dGVzdCgndG9vIG1hbnkgcmVxdWVzdHMgYXJlIHRocm93biBhZnRlciBzZXNzaW9uIGlzIGV4cGlyZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IFJlcXVlc3RzU2Vzc2lvbigxLCAxMDAsIHJlcXVlc3RTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5yZXF1ZXN0KCd1cmwnLCB7IGNhbGxTaXRlOiAndGVzdCcgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMjUpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QucmVxdWVzdCgndXJsJywgeyBjYWxsU2l0ZTogJ3Rlc3QnIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QucmVxdWVzdCgndXJsJywgeyBjYWxsU2l0ZTogJ3Rlc3QnIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPFVzZXJEYXRhU3luY1N0b3JlRXJyb3I+ZXJyb3IpLmNvZGUsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Mb2NhbFRvb01hbnlSZXF1ZXN0cyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFzc2VydC5mYWlsKCdTaG91bGQgZmFpbCB3aXRoIGxpbWl0IGV4Y2VlZGVkJyk7XG5cdH0pKTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGFBQWE7QUFDdEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUywyQkFBMkIsY0FBYyx1QkFBdUIsOEJBQThCO0FBQ3ZHLFNBQVMsaUJBQWlCLGdDQUFnQztBQUMxRCxTQUFTLG9CQUFvQiw4QkFBOEI7QUFFM0QsTUFBTSw0QkFBNEIsTUFBTTtBQUV2QyxRQUFNLGtCQUFrQix3Q0FBd0M7QUFFaEUsT0FBSyx5Q0FBeUMsWUFBWTtBQUV6RCxVQUFNLFNBQVMsSUFBSSx1QkFBdUI7QUFDMUMsVUFBTSxTQUFTLGdCQUFnQixJQUFJLElBQUksbUJBQW1CLE1BQU0sQ0FBQztBQUNqRSxVQUFNLE9BQU8sTUFBTTtBQUNuQixVQUFNLGFBQWEsT0FBTyxxQkFBcUIsSUFBSSx5QkFBeUI7QUFDNUUsVUFBTSxpQkFBaUIsT0FBTyxxQkFBcUIsSUFBSSxlQUFlO0FBRXRFLFVBQU0sV0FBVyxTQUFTLElBQUk7QUFFOUIsV0FBTyxZQUFZLE9BQU8sdUJBQXVCLFFBQVEsQ0FBQztBQUMxRCxXQUFPLFlBQVksT0FBTyx1QkFBdUIsQ0FBQyxFQUFFLFFBQVMsZUFBZSxHQUFHLEdBQUcsZUFBZSxlQUFlLEdBQUcsUUFBUSxTQUFTLEVBQUUsRUFBRTtBQUN4SSxXQUFPLFlBQVksT0FBTyx1QkFBdUIsQ0FBQyxFQUFFLFFBQVMsa0JBQWtCLEdBQUcsZUFBZSxPQUFPO0FBQ3hHLFdBQU8sZUFBZSxPQUFPLHVCQUF1QixDQUFDLEVBQUUsUUFBUyxzQkFB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
