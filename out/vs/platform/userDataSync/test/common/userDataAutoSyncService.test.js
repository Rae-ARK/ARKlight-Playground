import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Event } from "../../../../base/common/event.js";
import { joinPath } from "../../../../base/common/resources.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { IFileService } from "../../../files/common/files.js";
import { IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { UserDataAutoSyncService } from "../../common/userDataAutoSyncService.js";
import { IUserDataSyncService, SyncResource, UserDataAutoSyncError, UserDataSyncErrorCode, UserDataSyncStoreError } from "../../common/userDataSync.js";
import { IUserDataSyncMachinesService } from "../../common/userDataSyncMachines.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
class TestUserDataAutoSyncService extends UserDataAutoSyncService {
  startAutoSync() {
    return false;
  }
  getSyncTriggerDelayTime() {
    return 50;
  }
  sync() {
    return this.triggerSync(["sync"]);
  }
}
suite("UserDataAutoSyncService", () => {
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  test("test auto sync with sync resource change triggers sync", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer();
      const client = disposableStore.add(new UserDataSyncClient(target));
      await client.setUp();
      await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();
      target.reset();
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestUserDataAutoSyncService));
      await testObject.triggerSync([SyncResource.Settings]);
      const actual = target.requests.filter((request) => !request.url.startsWith(`${target.url}/v1/resource/machines`));
      assert.deepStrictEqual(actual, [{ type: "GET", url: `${target.url}/v1/manifest`, headers: {} }]);
    });
  });
  test("test auto sync with sync resource change triggers sync for every change", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer();
      const client = disposableStore.add(new UserDataSyncClient(target));
      await client.setUp();
      await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();
      target.reset();
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestUserDataAutoSyncService));
      for (let counter = 0; counter < 2; counter++) {
        await testObject.triggerSync([SyncResource.Settings]);
      }
      const actual = target.requests.filter((request) => !request.url.startsWith(`${target.url}/v1/resource/machines`));
      assert.deepStrictEqual(actual, [
        { type: "GET", url: `${target.url}/v1/manifest`, headers: {} },
        { type: "GET", url: `${target.url}/v1/manifest`, headers: { "If-None-Match": "1" } }
      ]);
    });
  });
  test("test auto sync with non sync resource change triggers sync", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer();
      const client = disposableStore.add(new UserDataSyncClient(target));
      await client.setUp();
      await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();
      target.reset();
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestUserDataAutoSyncService));
      await testObject.triggerSync(["windowFocus"]);
      const actual = target.requests.filter((request) => !request.url.startsWith(`${target.url}/v1/resource/machines`));
      assert.deepStrictEqual(actual, [{ type: "GET", url: `${target.url}/v1/manifest`, headers: {} }]);
    });
  });
  test("test auto sync with non sync resource change does not trigger continuous syncs", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer();
      const client = disposableStore.add(new UserDataSyncClient(target));
      await client.setUp();
      await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();
      target.reset();
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestUserDataAutoSyncService));
      for (let counter = 0; counter < 2; counter++) {
        await testObject.triggerSync(["windowFocus"], { skipIfSyncedRecently: true });
      }
      const actual = target.requests.filter((request) => !request.url.startsWith(`${target.url}/v1/resource/machines`));
      assert.deepStrictEqual(actual, [{ type: "GET", url: `${target.url}/v1/manifest`, headers: {} }]);
    });
  });
  test("test first auto sync requests", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer();
      const client = disposableStore.add(new UserDataSyncClient(target));
      await client.setUp();
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestUserDataAutoSyncService));
      await testObject.sync();
      assert.deepStrictEqual(target.requests, [
        // Manifest
        { type: "GET", url: `${target.url}/v1/manifest`, headers: {} },
        // Machines
        { type: "GET", url: `${target.url}/v1/resource/machines/latest`, headers: {} },
        // Settings
        { type: "POST", url: `${target.url}/v1/resource/settings`, headers: { "If-Match": "0" } },
        // Keybindings
        { type: "POST", url: `${target.url}/v1/resource/keybindings`, headers: { "If-Match": "0" } },
        // Snippets
        { type: "POST", url: `${target.url}/v1/resource/snippets`, headers: { "If-Match": "0" } },
        // Tasks
        { type: "POST", url: `${target.url}/v1/resource/tasks`, headers: { "If-Match": "0" } },
        // Global state
        { type: "POST", url: `${target.url}/v1/resource/globalState`, headers: { "If-Match": "0" } },
        // Prompts
        { type: "POST", url: `${target.url}/v1/resource/prompts`, headers: { "If-Match": "0" } },
        // Manifest
        { type: "GET", url: `${target.url}/v1/manifest`, headers: {} },
        // Machines
        { type: "POST", url: `${target.url}/v1/resource/machines`, headers: { "If-Match": "0" } }
      ]);
    });
  });
  test("test further auto sync requests without changes", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer();
      const client = disposableStore.add(new UserDataSyncClient(target));
      await client.setUp();
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestUserDataAutoSyncService));
      await testObject.sync();
      target.reset();
      await testObject.sync();
      assert.deepStrictEqual(target.requests, [
        // Manifest
        { type: "GET", url: `${target.url}/v1/manifest`, headers: { "If-None-Match": "1" } }
      ]);
    });
  });
  test("test further auto sync requests with changes", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer();
      const client = disposableStore.add(new UserDataSyncClient(target));
      await client.setUp();
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestUserDataAutoSyncService));
      await testObject.sync();
      target.reset();
      const fileService = client.instantiationService.get(IFileService);
      const environmentService = client.instantiationService.get(IEnvironmentService);
      const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
      await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ "editor.fontSize": 14 })));
      await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ "command": "abcd", "key": "cmd+c" }])));
      await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.snippetsHome, "html.json"), VSBuffer.fromString(`{}`));
      await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.promptsHome, "h1.prompt.md"), VSBuffer.fromString(" "));
      await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ "locale": "de" })));
      await testObject.sync();
      assert.deepStrictEqual(target.requests, [
        // Manifest
        { type: "GET", url: `${target.url}/v1/manifest`, headers: { "If-None-Match": "1" } },
        // Settings
        { type: "POST", url: `${target.url}/v1/resource/settings`, headers: { "If-Match": "1" } },
        // Keybindings
        { type: "POST", url: `${target.url}/v1/resource/keybindings`, headers: { "If-Match": "1" } },
        // Snippets
        { type: "POST", url: `${target.url}/v1/resource/snippets`, headers: { "If-Match": "1" } },
        // Global state
        { type: "POST", url: `${target.url}/v1/resource/globalState`, headers: { "If-Match": "1" } },
        // Prompts
        { type: "POST", url: `${target.url}/v1/resource/prompts`, headers: { "If-Match": "1" } }
      ]);
    });
  });
  test("test auto sync send execution id header", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer();
      const client = disposableStore.add(new UserDataSyncClient(target));
      await client.setUp();
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestUserDataAutoSyncService));
      await testObject.sync();
      target.reset();
      await testObject.sync();
      for (const request of target.requestsWithAllHeaders) {
        const hasExecutionIdHeader = request.headers && request.headers["X-Execution-Id"] && request.headers["X-Execution-Id"].length > 0;
        if (request.url.startsWith(`${target.url}/v1/resource/machines`)) {
          assert.ok(!hasExecutionIdHeader, `Should not have execution header: ${request.url}`);
        } else {
          assert.ok(hasExecutionIdHeader, `Should have execution header: ${request.url}`);
        }
      }
    });
  });
  test("test delete on one client throws turned off error on other client while syncing", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer();
      const client = disposableStore.add(new UserDataSyncClient(target));
      await client.setUp();
      await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();
      const testClient = disposableStore.add(new UserDataSyncClient(target));
      await testClient.setUp();
      const testObject = disposableStore.add(testClient.instantiationService.createInstance(TestUserDataAutoSyncService));
      await testObject.sync();
      await client.instantiationService.get(IUserDataSyncService).reset();
      target.reset();
      const errorPromise = Event.toPromise(testObject.onError);
      await testObject.sync();
      const e = await errorPromise;
      assert.ok(e instanceof UserDataAutoSyncError);
      assert.deepStrictEqual(e.code, UserDataSyncErrorCode.TurnedOff);
      assert.deepStrictEqual(target.requests, [
        // Manifest
        { type: "GET", url: `${target.url}/v1/manifest`, headers: { "If-None-Match": "1" } },
        // Machine
        { type: "GET", url: `${target.url}/v1/resource/machines/latest`, headers: { "If-None-Match": "1" } }
      ]);
    });
  });
  test("test disabling the machine turns off sync", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer();
      const testClient = disposableStore.add(new UserDataSyncClient(target));
      await testClient.setUp();
      const testObject = disposableStore.add(testClient.instantiationService.createInstance(TestUserDataAutoSyncService));
      await testObject.sync();
      const userDataSyncMachinesService = testClient.instantiationService.get(IUserDataSyncMachinesService);
      const machines = await userDataSyncMachinesService.getMachines();
      const currentMachine = machines.find((m) => m.isCurrent);
      await userDataSyncMachinesService.setEnablements([[currentMachine.id, false]]);
      target.reset();
      const errorPromise = Event.toPromise(testObject.onError);
      await testObject.sync();
      const e = await errorPromise;
      assert.ok(e instanceof UserDataAutoSyncError);
      assert.deepStrictEqual(e.code, UserDataSyncErrorCode.TurnedOff);
      assert.deepStrictEqual(target.requests, [
        // Manifest
        { type: "GET", url: `${target.url}/v1/manifest`, headers: { "If-None-Match": "1" } },
        // Machine
        { type: "GET", url: `${target.url}/v1/resource/machines/latest`, headers: { "If-None-Match": "2" } },
        { type: "POST", url: `${target.url}/v1/resource/machines`, headers: { "If-Match": "2" } }
      ]);
    });
  });
  test("test removing the machine adds machine back", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer();
      const testClient = disposableStore.add(new UserDataSyncClient(target));
      await testClient.setUp();
      const testObject = disposableStore.add(testClient.instantiationService.createInstance(TestUserDataAutoSyncService));
      await testObject.sync();
      await testClient.instantiationService.get(IUserDataSyncMachinesService).removeCurrentMachine();
      target.reset();
      await testObject.sync();
      assert.deepStrictEqual(target.requests, [
        // Manifest
        { type: "GET", url: `${target.url}/v1/manifest`, headers: { "If-None-Match": "1" } },
        // Machine
        { type: "POST", url: `${target.url}/v1/resource/machines`, headers: { "If-Match": "2" } }
      ]);
    });
  });
  test("test creating new session from one client throws session expired error on another client while syncing", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer();
      const client = disposableStore.add(new UserDataSyncClient(target));
      await client.setUp();
      await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();
      const testClient = disposableStore.add(new UserDataSyncClient(target));
      await testClient.setUp();
      const testObject = disposableStore.add(testClient.instantiationService.createInstance(TestUserDataAutoSyncService));
      await testObject.sync();
      await client.instantiationService.get(IUserDataSyncService).reset();
      await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();
      target.reset();
      const errorPromise = Event.toPromise(testObject.onError);
      await testObject.sync();
      const e = await errorPromise;
      assert.ok(e instanceof UserDataAutoSyncError);
      assert.deepStrictEqual(e.code, UserDataSyncErrorCode.SessionExpired);
      assert.deepStrictEqual(target.requests, [
        // Manifest
        { type: "GET", url: `${target.url}/v1/manifest`, headers: { "If-None-Match": "1" } },
        // Machine
        { type: "GET", url: `${target.url}/v1/resource/machines/latest`, headers: { "If-None-Match": "1" } }
      ]);
    });
  });
  test("test rate limit on server", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer(5);
      const testClient = disposableStore.add(new UserDataSyncClient(target));
      await testClient.setUp();
      const testObject = disposableStore.add(testClient.instantiationService.createInstance(TestUserDataAutoSyncService));
      const errorPromise = Event.toPromise(testObject.onError);
      while (target.requests.length < 5) {
        await testObject.sync();
      }
      const e = await errorPromise;
      assert.ok(e instanceof UserDataSyncStoreError);
      assert.deepStrictEqual(e.code, UserDataSyncErrorCode.TooManyRequests);
    });
  });
  test("test auto sync is suspended when server donot accepts requests", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer(5, 1);
      const testClient = disposableStore.add(new UserDataSyncClient(target));
      await testClient.setUp();
      const testObject = disposableStore.add(testClient.instantiationService.createInstance(TestUserDataAutoSyncService));
      while (target.requests.length < 5) {
        await testObject.sync();
      }
      target.reset();
      await testObject.sync();
      assert.deepStrictEqual(target.requests, []);
    });
  });
  test("test cache control header with no cache is sent when triggered with disable cache option", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer(5, 1);
      const testClient = disposableStore.add(new UserDataSyncClient(target));
      await testClient.setUp();
      const testObject = disposableStore.add(testClient.instantiationService.createInstance(TestUserDataAutoSyncService));
      await testObject.triggerSync(["some reason"], { disableCache: true });
      assert.strictEqual(target.requestsWithAllHeaders[0].headers["Cache-Control"], "no-cache");
    });
  });
  test("test cache control header is not sent when triggered without disable cache option", async () => {
    await runWithFakedTimers({}, async () => {
      const target = new UserDataSyncTestServer(5, 1);
      const testClient = disposableStore.add(new UserDataSyncClient(target));
      await testClient.setUp();
      const testObject = disposableStore.add(testClient.instantiationService.createInstance(TestUserDataAutoSyncService));
      await testObject.triggerSync(["some reason"]);
      assert.strictEqual(target.requestsWithAllHeaders[0].headers["Cache-Control"], void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy90ZXN0L2NvbW1vbi91c2VyRGF0YUF1dG9TeW5jU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YUF1dG9TeW5jU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi91c2VyRGF0YUF1dG9TeW5jU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jU2VydmljZSwgU3luY1Jlc291cmNlLCBVc2VyRGF0YUF1dG9TeW5jRXJyb3IsIFVzZXJEYXRhU3luY0Vycm9yQ29kZSwgVXNlckRhdGFTeW5jU3RvcmVFcnJvciB9IGZyb20gJy4uLy4uL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi91c2VyRGF0YVN5bmNNYWNoaW5lcy5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNDbGllbnQsIFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIgfSBmcm9tICcuL3VzZXJEYXRhU3luY0NsaWVudC5qcyc7XG5cbmNsYXNzIFRlc3RVc2VyRGF0YUF1dG9TeW5jU2VydmljZSBleHRlbmRzIFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlIHtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIHN0YXJ0QXV0b1N5bmMoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0U3luY1RyaWdnZXJEZWxheVRpbWUoKTogbnVtYmVyIHsgcmV0dXJuIDUwOyB9XG5cblx0c3luYygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy50cmlnZ2VyU3luYyhbJ3N5bmMnXSk7XG5cdH1cbn1cblxuc3VpdGUoJ1VzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Rlc3QgYXV0byBzeW5jIHdpdGggc3luYyByZXNvdXJjZSBjaGFuZ2UgdHJpZ2dlcnMgc3luYycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFNldHVwIHRoZSBjbGllbnRcblx0XHRcdGNvbnN0IHRhcmdldCA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0XHRhd2FpdCBjbGllbnQuc2V0VXAoKTtcblxuXHRcdFx0Ly8gU3luYyBvbmNlIGFuZCByZXNldCByZXF1ZXN0c1xuXHRcdFx0YXdhaXQgKGF3YWl0IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1NlcnZpY2UpLmNyZWF0ZVN5bmNUYXNrKG51bGwpKS5ydW4oKTtcblx0XHRcdHRhcmdldC5yZXNldCgpO1xuXG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBVc2VyRGF0YUF1dG9TeW5jU2VydmljZSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RVc2VyRGF0YUF1dG9TeW5jU2VydmljZSkpO1xuXG5cdFx0XHQvLyBUcmlnZ2VyIGF1dG8gc3luYyB3aXRoIHNldHRpbmdzIGNoYW5nZVxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC50cmlnZ2VyU3luYyhbU3luY1Jlc291cmNlLlNldHRpbmdzXSk7XG5cblx0XHRcdC8vIEZpbHRlciBvdXQgbWFjaGluZSByZXF1ZXN0c1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gdGFyZ2V0LnJlcXVlc3RzLmZpbHRlcihyZXF1ZXN0ID0+ICFyZXF1ZXN0LnVybC5zdGFydHNXaXRoKGAke3RhcmdldC51cmx9L3YxL3Jlc291cmNlL21hY2hpbmVzYCkpO1xuXG5cdFx0XHQvLyBNYWtlIHN1cmUgb25seSBvbmUgbWFuaWZlc3QgcmVxdWVzdCBpcyBtYWRlXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW3sgdHlwZTogJ0dFVCcsIHVybDogYCR7dGFyZ2V0LnVybH0vdjEvbWFuaWZlc3RgLCBoZWFkZXJzOiB7fSB9XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3QgYXV0byBzeW5jIHdpdGggc3luYyByZXNvdXJjZSBjaGFuZ2UgdHJpZ2dlcnMgc3luYyBmb3IgZXZlcnkgY2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXG5cdFx0XHQvLyBTeW5jIG9uY2UgYW5kIHJlc2V0IHJlcXVlc3RzXG5cdFx0XHRhd2FpdCAoYXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU2VydmljZSkuY3JlYXRlU3luY1Rhc2sobnVsbCkpLnJ1bigpO1xuXHRcdFx0dGFyZ2V0LnJlc2V0KCk7XG5cblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlKSk7XG5cblx0XHRcdC8vIFRyaWdnZXIgYXV0byBzeW5jIHdpdGggc2V0dGluZ3MgY2hhbmdlIG11bHRpcGxlIHRpbWVzXG5cdFx0XHRmb3IgKGxldCBjb3VudGVyID0gMDsgY291bnRlciA8IDI7IGNvdW50ZXIrKykge1xuXHRcdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnRyaWdnZXJTeW5jKFtTeW5jUmVzb3VyY2UuU2V0dGluZ3NdKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlsdGVyIG91dCBtYWNoaW5lIHJlcXVlc3RzXG5cdFx0XHRjb25zdCBhY3R1YWwgPSB0YXJnZXQucmVxdWVzdHMuZmlsdGVyKHJlcXVlc3QgPT4gIXJlcXVlc3QudXJsLnN0YXJ0c1dpdGgoYCR7dGFyZ2V0LnVybH0vdjEvcmVzb3VyY2UvbWFjaGluZXNgKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdHsgdHlwZTogJ0dFVCcsIHVybDogYCR7dGFyZ2V0LnVybH0vdjEvbWFuaWZlc3RgLCBoZWFkZXJzOiB7fSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdHRVQnLCB1cmw6IGAke3RhcmdldC51cmx9L3YxL21hbmlmZXN0YCwgaGVhZGVyczogeyAnSWYtTm9uZS1NYXRjaCc6ICcxJyB9IH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IGF1dG8gc3luYyB3aXRoIG5vbiBzeW5jIHJlc291cmNlIGNoYW5nZSB0cmlnZ2VycyBzeW5jJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXG5cdFx0XHQvLyBTeW5jIG9uY2UgYW5kIHJlc2V0IHJlcXVlc3RzXG5cdFx0XHRhd2FpdCAoYXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU2VydmljZSkuY3JlYXRlU3luY1Rhc2sobnVsbCkpLnJ1bigpO1xuXHRcdFx0dGFyZ2V0LnJlc2V0KCk7XG5cblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlKSk7XG5cblx0XHRcdC8vIFRyaWdnZXIgYXV0byBzeW5jIHdpdGggd2luZG93IGZvY3VzIG9uY2Vcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QudHJpZ2dlclN5bmMoWyd3aW5kb3dGb2N1cyddKTtcblxuXHRcdFx0Ly8gRmlsdGVyIG91dCBtYWNoaW5lIHJlcXVlc3RzXG5cdFx0XHRjb25zdCBhY3R1YWwgPSB0YXJnZXQucmVxdWVzdHMuZmlsdGVyKHJlcXVlc3QgPT4gIXJlcXVlc3QudXJsLnN0YXJ0c1dpdGgoYCR7dGFyZ2V0LnVybH0vdjEvcmVzb3VyY2UvbWFjaGluZXNgKSk7XG5cblx0XHRcdC8vIE1ha2Ugc3VyZSBvbmx5IG9uZSBtYW5pZmVzdCByZXF1ZXN0IGlzIG1hZGVcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbeyB0eXBlOiAnR0VUJywgdXJsOiBgJHt0YXJnZXQudXJsfS92MS9tYW5pZmVzdGAsIGhlYWRlcnM6IHt9IH1dKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGVzdCBhdXRvIHN5bmMgd2l0aCBub24gc3luYyByZXNvdXJjZSBjaGFuZ2UgZG9lcyBub3QgdHJpZ2dlciBjb250aW51b3VzIHN5bmNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXG5cdFx0XHQvLyBTeW5jIG9uY2UgYW5kIHJlc2V0IHJlcXVlc3RzXG5cdFx0XHRhd2FpdCAoYXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU2VydmljZSkuY3JlYXRlU3luY1Rhc2sobnVsbCkpLnJ1bigpO1xuXHRcdFx0dGFyZ2V0LnJlc2V0KCk7XG5cblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlKSk7XG5cblx0XHRcdC8vIFRyaWdnZXIgYXV0byBzeW5jIHdpdGggd2luZG93IGZvY3VzIG11bHRpcGxlIHRpbWVzXG5cdFx0XHRmb3IgKGxldCBjb3VudGVyID0gMDsgY291bnRlciA8IDI7IGNvdW50ZXIrKykge1xuXHRcdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnRyaWdnZXJTeW5jKFsnd2luZG93Rm9jdXMnXSwgeyBza2lwSWZTeW5jZWRSZWNlbnRseTogdHJ1ZSB9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlsdGVyIG91dCBtYWNoaW5lIHJlcXVlc3RzXG5cdFx0XHRjb25zdCBhY3R1YWwgPSB0YXJnZXQucmVxdWVzdHMuZmlsdGVyKHJlcXVlc3QgPT4gIXJlcXVlc3QudXJsLnN0YXJ0c1dpdGgoYCR7dGFyZ2V0LnVybH0vdjEvcmVzb3VyY2UvbWFjaGluZXNgKSk7XG5cblx0XHRcdC8vIE1ha2Ugc3VyZSBvbmx5IG9uZSBtYW5pZmVzdCByZXF1ZXN0IGlzIG1hZGVcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbeyB0eXBlOiAnR0VUJywgdXJsOiBgJHt0YXJnZXQudXJsfS92MS9tYW5pZmVzdGAsIGhlYWRlcnM6IHt9IH1dKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGVzdCBmaXJzdCBhdXRvIHN5bmMgcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBTZXR1cCB0aGUgY2xpZW50XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0VXNlckRhdGFBdXRvU3luY1NlcnZpY2UgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VXNlckRhdGFBdXRvU3luY1NlcnZpY2UpKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzLCBbXG5cdFx0XHRcdC8vIE1hbmlmZXN0XG5cdFx0XHRcdHsgdHlwZTogJ0dFVCcsIHVybDogYCR7dGFyZ2V0LnVybH0vdjEvbWFuaWZlc3RgLCBoZWFkZXJzOiB7fSB9LFxuXHRcdFx0XHQvLyBNYWNoaW5lc1xuXHRcdFx0XHR7IHR5cGU6ICdHRVQnLCB1cmw6IGAke3RhcmdldC51cmx9L3YxL3Jlc291cmNlL21hY2hpbmVzL2xhdGVzdGAsIGhlYWRlcnM6IHt9IH0sXG5cdFx0XHRcdC8vIFNldHRpbmdzXG5cdFx0XHRcdHsgdHlwZTogJ1BPU1QnLCB1cmw6IGAke3RhcmdldC51cmx9L3YxL3Jlc291cmNlL3NldHRpbmdzYCwgaGVhZGVyczogeyAnSWYtTWF0Y2gnOiAnMCcgfSB9LFxuXHRcdFx0XHQvLyBLZXliaW5kaW5nc1xuXHRcdFx0XHR7IHR5cGU6ICdQT1NUJywgdXJsOiBgJHt0YXJnZXQudXJsfS92MS9yZXNvdXJjZS9rZXliaW5kaW5nc2AsIGhlYWRlcnM6IHsgJ0lmLU1hdGNoJzogJzAnIH0gfSxcblx0XHRcdFx0Ly8gU25pcHBldHNcblx0XHRcdFx0eyB0eXBlOiAnUE9TVCcsIHVybDogYCR7dGFyZ2V0LnVybH0vdjEvcmVzb3VyY2Uvc25pcHBldHNgLCBoZWFkZXJzOiB7ICdJZi1NYXRjaCc6ICcwJyB9IH0sXG5cdFx0XHRcdC8vIFRhc2tzXG5cdFx0XHRcdHsgdHlwZTogJ1BPU1QnLCB1cmw6IGAke3RhcmdldC51cmx9L3YxL3Jlc291cmNlL3Rhc2tzYCwgaGVhZGVyczogeyAnSWYtTWF0Y2gnOiAnMCcgfSB9LFxuXHRcdFx0XHQvLyBHbG9iYWwgc3RhdGVcblx0XHRcdFx0eyB0eXBlOiAnUE9TVCcsIHVybDogYCR7dGFyZ2V0LnVybH0vdjEvcmVzb3VyY2UvZ2xvYmFsU3RhdGVgLCBoZWFkZXJzOiB7ICdJZi1NYXRjaCc6ICcwJyB9IH0sXG5cdFx0XHRcdC8vIFByb21wdHNcblx0XHRcdFx0eyB0eXBlOiAnUE9TVCcsIHVybDogYCR7dGFyZ2V0LnVybH0vdjEvcmVzb3VyY2UvcHJvbXB0c2AsIGhlYWRlcnM6IHsgJ0lmLU1hdGNoJzogJzAnIH0gfSxcblx0XHRcdFx0Ly8gTWFuaWZlc3Rcblx0XHRcdFx0eyB0eXBlOiAnR0VUJywgdXJsOiBgJHt0YXJnZXQudXJsfS92MS9tYW5pZmVzdGAsIGhlYWRlcnM6IHt9IH0sXG5cdFx0XHRcdC8vIE1hY2hpbmVzXG5cdFx0XHRcdHsgdHlwZTogJ1BPU1QnLCB1cmw6IGAke3RhcmdldC51cmx9L3YxL3Jlc291cmNlL21hY2hpbmVzYCwgaGVhZGVyczogeyAnSWYtTWF0Y2gnOiAnMCcgfSB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGVzdCBmdXJ0aGVyIGF1dG8gc3luYyByZXF1ZXN0cyB3aXRob3V0IGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBTZXR1cCB0aGUgY2xpZW50XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0VXNlckRhdGFBdXRvU3luY1NlcnZpY2UgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VXNlckRhdGFBdXRvU3luY1NlcnZpY2UpKTtcblxuXHRcdFx0Ly8gU3luYyBvbmNlIGFuZCByZXNldCByZXF1ZXN0c1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKCk7XG5cdFx0XHR0YXJnZXQucmVzZXQoKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzLCBbXG5cdFx0XHRcdC8vIE1hbmlmZXN0XG5cdFx0XHRcdHsgdHlwZTogJ0dFVCcsIHVybDogYCR7dGFyZ2V0LnVybH0vdjEvbWFuaWZlc3RgLCBoZWFkZXJzOiB7ICdJZi1Ob25lLU1hdGNoJzogJzEnIH0gfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3QgZnVydGhlciBhdXRvIHN5bmMgcmVxdWVzdHMgd2l0aCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlKSk7XG5cblx0XHRcdC8vIFN5bmMgb25jZSBhbmQgcmVzZXQgcmVxdWVzdHNcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYygpO1xuXHRcdFx0dGFyZ2V0LnJlc2V0KCk7XG5cblx0XHRcdC8vIERvIGNoYW5nZXMgaW4gdGhlIGNsaWVudFxuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdlZGl0b3IuZm9udFNpemUnOiAxNCB9KSkpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmtleWJpbmRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoW3sgJ2NvbW1hbmQnOiAnYWJjZCcsICdrZXknOiAnY21kK2MnIH1dKSkpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGpvaW5QYXRoKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSwgJ2h0bWwuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGB7fWApKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShqb2luUGF0aCh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5wcm9tcHRzSG9tZSwgJ2gxLnByb21wdC5tZCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcgJykpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGVudmlyb25tZW50U2VydmljZS5hcmd2UmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnbG9jYWxlJzogJ2RlJyB9KSkpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzLCBbXG5cdFx0XHRcdC8vIE1hbmlmZXN0XG5cdFx0XHRcdHsgdHlwZTogJ0dFVCcsIHVybDogYCR7dGFyZ2V0LnVybH0vdjEvbWFuaWZlc3RgLCBoZWFkZXJzOiB7ICdJZi1Ob25lLU1hdGNoJzogJzEnIH0gfSxcblx0XHRcdFx0Ly8gU2V0dGluZ3Ncblx0XHRcdFx0eyB0eXBlOiAnUE9TVCcsIHVybDogYCR7dGFyZ2V0LnVybH0vdjEvcmVzb3VyY2Uvc2V0dGluZ3NgLCBoZWFkZXJzOiB7ICdJZi1NYXRjaCc6ICcxJyB9IH0sXG5cdFx0XHRcdC8vIEtleWJpbmRpbmdzXG5cdFx0XHRcdHsgdHlwZTogJ1BPU1QnLCB1cmw6IGAke3RhcmdldC51cmx9L3YxL3Jlc291cmNlL2tleWJpbmRpbmdzYCwgaGVhZGVyczogeyAnSWYtTWF0Y2gnOiAnMScgfSB9LFxuXHRcdFx0XHQvLyBTbmlwcGV0c1xuXHRcdFx0XHR7IHR5cGU6ICdQT1NUJywgdXJsOiBgJHt0YXJnZXQudXJsfS92MS9yZXNvdXJjZS9zbmlwcGV0c2AsIGhlYWRlcnM6IHsgJ0lmLU1hdGNoJzogJzEnIH0gfSxcblx0XHRcdFx0Ly8gR2xvYmFsIHN0YXRlXG5cdFx0XHRcdHsgdHlwZTogJ1BPU1QnLCB1cmw6IGAke3RhcmdldC51cmx9L3YxL3Jlc291cmNlL2dsb2JhbFN0YXRlYCwgaGVhZGVyczogeyAnSWYtTWF0Y2gnOiAnMScgfSB9LFxuXHRcdFx0XHQvLyBQcm9tcHRzXG5cdFx0XHRcdHsgdHlwZTogJ1BPU1QnLCB1cmw6IGAke3RhcmdldC51cmx9L3YxL3Jlc291cmNlL3Byb21wdHNgLCBoZWFkZXJzOiB7ICdJZi1NYXRjaCc6ICcxJyB9IH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGVzdCBhdXRvIHN5bmMgc2VuZCBleGVjdXRpb24gaWQgaGVhZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlKSk7XG5cblx0XHRcdC8vIFN5bmMgb25jZSBhbmQgcmVzZXQgcmVxdWVzdHNcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYygpO1xuXHRcdFx0dGFyZ2V0LnJlc2V0KCk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYygpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2YgdGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnMpIHtcblx0XHRcdFx0Y29uc3QgaGFzRXhlY3V0aW9uSWRIZWFkZXIgPSByZXF1ZXN0LmhlYWRlcnMgJiYgcmVxdWVzdC5oZWFkZXJzWydYLUV4ZWN1dGlvbi1JZCddICYmIHJlcXVlc3QuaGVhZGVyc1snWC1FeGVjdXRpb24tSWQnXS5sZW5ndGggPiAwO1xuXHRcdFx0XHRpZiAocmVxdWVzdC51cmwuc3RhcnRzV2l0aChgJHt0YXJnZXQudXJsfS92MS9yZXNvdXJjZS9tYWNoaW5lc2ApKSB7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKCFoYXNFeGVjdXRpb25JZEhlYWRlciwgYFNob3VsZCBub3QgaGF2ZSBleGVjdXRpb24gaGVhZGVyOiAke3JlcXVlc3QudXJsfWApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFzc2VydC5vayhoYXNFeGVjdXRpb25JZEhlYWRlciwgYFNob3VsZCBoYXZlIGV4ZWN1dGlvbiBoZWFkZXI6ICR7cmVxdWVzdC51cmx9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGVzdCBkZWxldGUgb24gb25lIGNsaWVudCB0aHJvd3MgdHVybmVkIG9mZiBlcnJvciBvbiBvdGhlciBjbGllbnQgd2hpbGUgc3luY2luZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cblx0XHRcdC8vIFNldCB1cCBhbmQgc3luYyBmcm9tIHRoZSBjbGllbnRcblx0XHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdFx0YXdhaXQgKGF3YWl0IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1NlcnZpY2UpLmNyZWF0ZVN5bmNUYXNrKG51bGwpKS5ydW4oKTtcblxuXHRcdFx0Ly8gU2V0IHVwIGFuZCBzeW5jIGZyb20gdGhlIHRlc3QgY2xpZW50XG5cdFx0XHRjb25zdCB0ZXN0Q2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdFx0YXdhaXQgdGVzdENsaWVudC5zZXRVcCgpO1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlID0gZGlzcG9zYWJsZVN0b3JlLmFkZCh0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RVc2VyRGF0YUF1dG9TeW5jU2VydmljZSkpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKCk7XG5cblx0XHRcdC8vIFJlc2V0IGZyb20gdGhlIGZpcnN0IGNsaWVudFxuXHRcdFx0YXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU2VydmljZSkucmVzZXQoKTtcblxuXHRcdFx0Ly8gU3luYyBmcm9tIHRoZSB0ZXN0IGNsaWVudFxuXHRcdFx0dGFyZ2V0LnJlc2V0KCk7XG5cblx0XHRcdGNvbnN0IGVycm9yUHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh0ZXN0T2JqZWN0Lm9uRXJyb3IpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKCk7XG5cblx0XHRcdGNvbnN0IGUgPSBhd2FpdCBlcnJvclByb21pc2U7XG5cdFx0XHRhc3NlcnQub2soZSBpbnN0YW5jZW9mIFVzZXJEYXRhQXV0b1N5bmNFcnJvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKCg8VXNlckRhdGFBdXRvU3luY0Vycm9yPmUpLmNvZGUsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5UdXJuZWRPZmYpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHMsIFtcblx0XHRcdFx0Ly8gTWFuaWZlc3Rcblx0XHRcdFx0eyB0eXBlOiAnR0VUJywgdXJsOiBgJHt0YXJnZXQudXJsfS92MS9tYW5pZmVzdGAsIGhlYWRlcnM6IHsgJ0lmLU5vbmUtTWF0Y2gnOiAnMScgfSB9LFxuXHRcdFx0XHQvLyBNYWNoaW5lXG5cdFx0XHRcdHsgdHlwZTogJ0dFVCcsIHVybDogYCR7dGFyZ2V0LnVybH0vdjEvcmVzb3VyY2UvbWFjaGluZXMvbGF0ZXN0YCwgaGVhZGVyczogeyAnSWYtTm9uZS1NYXRjaCc6ICcxJyB9IH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGVzdCBkaXNhYmxpbmcgdGhlIG1hY2hpbmUgdHVybnMgb2ZmIHN5bmMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXG5cdFx0XHQvLyBTZXQgdXAgYW5kIHN5bmMgZnJvbSB0aGUgdGVzdCBjbGllbnRcblx0XHRcdGNvbnN0IHRlc3RDbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0XHRhd2FpdCB0ZXN0Q2xpZW50LnNldFVwKCk7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0VXNlckRhdGFBdXRvU3luY1NlcnZpY2UgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlKSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoKTtcblxuXHRcdFx0Ly8gRGlzYWJsZSBjdXJyZW50IG1hY2hpbmVcblx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbWFjaGluZXMgPSBhd2FpdCB1c2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UuZ2V0TWFjaGluZXMoKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRNYWNoaW5lID0gbWFjaGluZXMuZmluZChtID0+IG0uaXNDdXJyZW50KSE7XG5cdFx0XHRhd2FpdCB1c2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2Uuc2V0RW5hYmxlbWVudHMoW1tjdXJyZW50TWFjaGluZS5pZCwgZmFsc2VdXSk7XG5cblx0XHRcdHRhcmdldC5yZXNldCgpO1xuXG5cdFx0XHRjb25zdCBlcnJvclByb21pc2UgPSBFdmVudC50b1Byb21pc2UodGVzdE9iamVjdC5vbkVycm9yKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYygpO1xuXG5cdFx0XHRjb25zdCBlID0gYXdhaXQgZXJyb3JQcm9taXNlO1xuXHRcdFx0YXNzZXJ0Lm9rKGUgaW5zdGFuY2VvZiBVc2VyRGF0YUF1dG9TeW5jRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoPFVzZXJEYXRhQXV0b1N5bmNFcnJvcj5lKS5jb2RlLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVHVybmVkT2ZmKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzLCBbXG5cdFx0XHRcdC8vIE1hbmlmZXN0XG5cdFx0XHRcdHsgdHlwZTogJ0dFVCcsIHVybDogYCR7dGFyZ2V0LnVybH0vdjEvbWFuaWZlc3RgLCBoZWFkZXJzOiB7ICdJZi1Ob25lLU1hdGNoJzogJzEnIH0gfSxcblx0XHRcdFx0Ly8gTWFjaGluZVxuXHRcdFx0XHR7IHR5cGU6ICdHRVQnLCB1cmw6IGAke3RhcmdldC51cmx9L3YxL3Jlc291cmNlL21hY2hpbmVzL2xhdGVzdGAsIGhlYWRlcnM6IHsgJ0lmLU5vbmUtTWF0Y2gnOiAnMicgfSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdQT1NUJywgdXJsOiBgJHt0YXJnZXQudXJsfS92MS9yZXNvdXJjZS9tYWNoaW5lc2AsIGhlYWRlcnM6IHsgJ0lmLU1hdGNoJzogJzInIH0gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IHJlbW92aW5nIHRoZSBtYWNoaW5lIGFkZHMgbWFjaGluZSBiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblxuXHRcdFx0Ly8gU2V0IHVwIGFuZCBzeW5jIGZyb20gdGhlIHRlc3QgY2xpZW50XG5cdFx0XHRjb25zdCB0ZXN0Q2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdFx0YXdhaXQgdGVzdENsaWVudC5zZXRVcCgpO1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlID0gZGlzcG9zYWJsZVN0b3JlLmFkZCh0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RVc2VyRGF0YUF1dG9TeW5jU2VydmljZSkpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKCk7XG5cblx0XHRcdC8vIFJlbW92ZSBjdXJyZW50IG1hY2hpbmVcblx0XHRcdGF3YWl0IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UpLnJlbW92ZUN1cnJlbnRNYWNoaW5lKCk7XG5cblx0XHRcdHRhcmdldC5yZXNldCgpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzLCBbXG5cdFx0XHRcdC8vIE1hbmlmZXN0XG5cdFx0XHRcdHsgdHlwZTogJ0dFVCcsIHVybDogYCR7dGFyZ2V0LnVybH0vdjEvbWFuaWZlc3RgLCBoZWFkZXJzOiB7ICdJZi1Ob25lLU1hdGNoJzogJzEnIH0gfSxcblx0XHRcdFx0Ly8gTWFjaGluZVxuXHRcdFx0XHR7IHR5cGU6ICdQT1NUJywgdXJsOiBgJHt0YXJnZXQudXJsfS92MS9yZXNvdXJjZS9tYWNoaW5lc2AsIGhlYWRlcnM6IHsgJ0lmLU1hdGNoJzogJzInIH0gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IGNyZWF0aW5nIG5ldyBzZXNzaW9uIGZyb20gb25lIGNsaWVudCB0aHJvd3Mgc2Vzc2lvbiBleHBpcmVkIGVycm9yIG9uIGFub3RoZXIgY2xpZW50IHdoaWxlIHN5bmNpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXG5cdFx0XHQvLyBTZXQgdXAgYW5kIHN5bmMgZnJvbSB0aGUgY2xpZW50XG5cdFx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0XHRhd2FpdCBjbGllbnQuc2V0VXAoKTtcblx0XHRcdGF3YWl0IChhd2FpdCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTZXJ2aWNlKS5jcmVhdGVTeW5jVGFzayhudWxsKSkucnVuKCk7XG5cblx0XHRcdC8vIFNldCB1cCBhbmQgc3luYyBmcm9tIHRoZSB0ZXN0IGNsaWVudFxuXHRcdFx0Y29uc3QgdGVzdENsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRcdGF3YWl0IHRlc3RDbGllbnQuc2V0VXAoKTtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RVc2VyRGF0YUF1dG9TeW5jU2VydmljZSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQodGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VXNlckRhdGFBdXRvU3luY1NlcnZpY2UpKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYygpO1xuXG5cdFx0XHQvLyBSZXNldCBmcm9tIHRoZSBmaXJzdCBjbGllbnRcblx0XHRcdGF3YWl0IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1NlcnZpY2UpLnJlc2V0KCk7XG5cblx0XHRcdC8vIFN5bmMgYWdhaW4gZnJvbSB0aGUgZmlyc3QgY2xpZW50IHRvIGNyZWF0ZSBuZXcgc2Vzc2lvblxuXHRcdFx0YXdhaXQgKGF3YWl0IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1NlcnZpY2UpLmNyZWF0ZVN5bmNUYXNrKG51bGwpKS5ydW4oKTtcblxuXHRcdFx0Ly8gU3luYyBmcm9tIHRoZSB0ZXN0IGNsaWVudFxuXHRcdFx0dGFyZ2V0LnJlc2V0KCk7XG5cblx0XHRcdGNvbnN0IGVycm9yUHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh0ZXN0T2JqZWN0Lm9uRXJyb3IpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKCk7XG5cblx0XHRcdGNvbnN0IGUgPSBhd2FpdCBlcnJvclByb21pc2U7XG5cdFx0XHRhc3NlcnQub2soZSBpbnN0YW5jZW9mIFVzZXJEYXRhQXV0b1N5bmNFcnJvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKCg8VXNlckRhdGFBdXRvU3luY0Vycm9yPmUpLmNvZGUsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5TZXNzaW9uRXhwaXJlZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0cywgW1xuXHRcdFx0XHQvLyBNYW5pZmVzdFxuXHRcdFx0XHR7IHR5cGU6ICdHRVQnLCB1cmw6IGAke3RhcmdldC51cmx9L3YxL21hbmlmZXN0YCwgaGVhZGVyczogeyAnSWYtTm9uZS1NYXRjaCc6ICcxJyB9IH0sXG5cdFx0XHRcdC8vIE1hY2hpbmVcblx0XHRcdFx0eyB0eXBlOiAnR0VUJywgdXJsOiBgJHt0YXJnZXQudXJsfS92MS9yZXNvdXJjZS9tYWNoaW5lcy9sYXRlc3RgLCBoZWFkZXJzOiB7ICdJZi1Ob25lLU1hdGNoJzogJzEnIH0gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IHJhdGUgbGltaXQgb24gc2VydmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoNSk7XG5cblx0XHRcdC8vIFNldCB1cCBhbmQgc3luYyBmcm9tIHRoZSB0ZXN0IGNsaWVudFxuXHRcdFx0Y29uc3QgdGVzdENsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRcdGF3YWl0IHRlc3RDbGllbnQuc2V0VXAoKTtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RVc2VyRGF0YUF1dG9TeW5jU2VydmljZSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQodGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VXNlckRhdGFBdXRvU3luY1NlcnZpY2UpKTtcblxuXHRcdFx0Y29uc3QgZXJyb3JQcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25FcnJvcik7XG5cdFx0XHR3aGlsZSAodGFyZ2V0LnJlcXVlc3RzLmxlbmd0aCA8IDUpIHtcblx0XHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGUgPSBhd2FpdCBlcnJvclByb21pc2U7XG5cdFx0XHRhc3NlcnQub2soZSBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY1N0b3JlRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoPFVzZXJEYXRhU3luY1N0b3JlRXJyb3I+ZSkuY29kZSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlRvb01hbnlSZXF1ZXN0cyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3QgYXV0byBzeW5jIGlzIHN1c3BlbmRlZCB3aGVuIHNlcnZlciBkb25vdCBhY2NlcHRzIHJlcXVlc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoNSwgMSk7XG5cblx0XHRcdC8vIFNldCB1cCBhbmQgc3luYyBmcm9tIHRoZSB0ZXN0IGNsaWVudFxuXHRcdFx0Y29uc3QgdGVzdENsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRcdGF3YWl0IHRlc3RDbGllbnQuc2V0VXAoKTtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RVc2VyRGF0YUF1dG9TeW5jU2VydmljZSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQodGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VXNlckRhdGFBdXRvU3luY1NlcnZpY2UpKTtcblxuXHRcdFx0d2hpbGUgKHRhcmdldC5yZXF1ZXN0cy5sZW5ndGggPCA1KSB7XG5cdFx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYygpO1xuXHRcdFx0fVxuXG5cdFx0XHR0YXJnZXQucmVzZXQoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0cywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IGNhY2hlIGNvbnRyb2wgaGVhZGVyIHdpdGggbm8gY2FjaGUgaXMgc2VudCB3aGVuIHRyaWdnZXJlZCB3aXRoIGRpc2FibGUgY2FjaGUgb3B0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoNSwgMSk7XG5cblx0XHRcdC8vIFNldCB1cCBhbmQgc3luYyBmcm9tIHRoZSB0ZXN0IGNsaWVudFxuXHRcdFx0Y29uc3QgdGVzdENsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRcdGF3YWl0IHRlc3RDbGllbnQuc2V0VXAoKTtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RVc2VyRGF0YUF1dG9TeW5jU2VydmljZSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQodGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VXNlckRhdGFBdXRvU3luY1NlcnZpY2UpKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC50cmlnZ2VyU3luYyhbJ3NvbWUgcmVhc29uJ10sIHsgZGlzYWJsZUNhY2hlOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydDYWNoZS1Db250cm9sJ10sICduby1jYWNoZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IGNhY2hlIGNvbnRyb2wgaGVhZGVyIGlzIG5vdCBzZW50IHdoZW4gdHJpZ2dlcmVkIHdpdGhvdXQgZGlzYWJsZSBjYWNoZSBvcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcig1LCAxKTtcblxuXHRcdFx0Ly8gU2V0IHVwIGFuZCBzeW5jIGZyb20gdGhlIHRlc3QgY2xpZW50XG5cdFx0XHRjb25zdCB0ZXN0Q2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdFx0YXdhaXQgdGVzdENsaWVudC5zZXRVcCgpO1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlID0gZGlzcG9zYWJsZVN0b3JlLmFkZCh0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RVc2VyRGF0YUF1dG9TeW5jU2VydmljZSkpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnRyaWdnZXJTeW5jKFsnc29tZSByZWFzb24nXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ0NhY2hl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
