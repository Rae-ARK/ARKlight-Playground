import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IFileService } from "../../../files/common/files.js";
import { ILogService } from "../../../log/common/log.js";
import { IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { getTasksContentFromSyncContent } from "../../common/tasksSync.js";
import { Change, IUserDataSyncStoreService, MergeState, SyncResource, SyncStatus } from "../../common/userDataSync.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
suite("TasksSync", () => {
  const server = new UserDataSyncTestServer();
  let client;
  let testObject;
  teardown(async () => {
    await client.instantiationService.get(IUserDataSyncStoreService).clear();
  });
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  setup(async () => {
    client = disposableStore.add(new UserDataSyncClient(server));
    await client.setUp(true);
    testObject = client.getSynchronizer(SyncResource.Tasks);
  });
  test("when tasks file does not exist", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
      let manifest = await client.getLatestRef(SyncResource.Tasks);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, []);
      assert.ok(!await fileService.exists(tasksResource));
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
      assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
      assert.strictEqual(lastSyncUserData.syncData, null);
      manifest = await client.getLatestRef(SyncResource.Tasks);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, []);
      manifest = await client.getLatestRef(SyncResource.Tasks);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, []);
    });
  });
  test("when tasks file does not exist and remote has changes", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.instantiationService.get(IFileService).writeFile(tasksResource2, VSBuffer.fromString(content));
      await client2.sync();
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file exists locally and remote has no tasks", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      fileService.writeFile(tasksResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
    });
  });
  test("first time sync: when tasks file exists locally with same content as remote", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.instantiationService.get(IFileService).writeFile(tasksResource2, VSBuffer.fromString(content));
      await client2.sync();
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await fileService.writeFile(tasksResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file locally has moved forward", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      fileService.writeFile(tasksResource, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      fileService.writeFile(tasksResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
    });
  });
  test("when tasks file remotely has moved forward", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      fileService2.writeFile(tasksResource2, VSBuffer.fromString(content));
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file has moved forward locally and remotely with same changes", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      fileService2.writeFile(tasksResource2, VSBuffer.fromString(content));
      await client2.sync();
      fileService.writeFile(tasksResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file has moved forward locally and remotely - accept preview", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch"
        }]
      })));
      await client2.sync();
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      fileService.writeFile(tasksResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const previewContent = (await fileService.readFile(testObject.conflicts.conflicts[0].previewResource)).value.toString();
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      assert.deepStrictEqual(testObject.conflicts.conflicts.length, 1);
      assert.deepStrictEqual(testObject.conflicts.conflicts[0].mergeState, MergeState.Conflict);
      assert.deepStrictEqual(testObject.conflicts.conflicts[0].localChange, Change.Modified);
      assert.deepStrictEqual(testObject.conflicts.conflicts[0].remoteChange, Change.Modified);
      await testObject.accept(testObject.conflicts.conflicts[0].previewResource);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), previewContent);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), previewContent);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), previewContent);
    });
  });
  test("when tasks file has moved forward locally and remotely - accept modified preview", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch"
        }]
      })));
      await client2.sync();
      fileService.writeFile(tasksResource, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch 2"
        }]
      });
      await testObject.accept(testObject.conflicts.conflicts[0].previewResource, content);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file has moved forward locally and remotely - accept remote", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch"
        }]
      });
      fileService2.writeFile(tasksResource2, VSBuffer.fromString(content));
      await client2.sync();
      fileService.writeFile(tasksResource, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].remoteResource);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file has moved forward locally and remotely - accept local", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch"
        }]
      })));
      await client2.sync();
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      fileService.writeFile(tasksResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].localResource);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file was removed in one client", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await fileService.writeFile(tasksResource, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      await client2.sync();
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      fileService2.del(tasksResource2);
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), null);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), null);
      assert.strictEqual(await fileService.exists(tasksResource), false);
    });
  });
  test("when tasks file is created after first sync", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      await fileService.createFile(tasksResource, VSBuffer.fromString(content));
      let lastSyncUserData = await testObject.getLastSyncUserData();
      const manifest = await client.getLatestRef(SyncResource.Tasks);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, [
        { type: "POST", url: `${server.url}/v1/resource/${testObject.resource}`, headers: { "If-Match": lastSyncUserData?.ref } }
      ]);
      lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
      assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
    });
  });
  test("apply remote when tasks file does not exist", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      if (await fileService.exists(tasksResource)) {
        await fileService.del(tasksResource);
      }
      const preview = await testObject.sync(await client.getLatestRef(SyncResource.Tasks), true);
      server.reset();
      const content = await testObject.resolveContent(preview.resourcePreviews[0].remoteResource);
      await testObject.accept(preview.resourcePreviews[0].remoteResource, content);
      await testObject.apply(false);
      assert.deepStrictEqual(server.requests, []);
    });
  });
  test("sync profile tasks", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const profile = await client2.instantiationService.get(IUserDataProfilesService).createNamedProfile("profile1");
      const expected = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      await client2.instantiationService.get(IFileService).createFile(profile.tasksResource, VSBuffer.fromString(expected));
      await client2.sync();
      await client.sync();
      const syncedProfile = client.instantiationService.get(IUserDataProfilesService).profiles.find((p) => p.id === profile.id);
      const actual = (await client.instantiationService.get(IFileService).readFile(syncedProfile.tasksResource)).value.toString();
      assert.strictEqual(actual, expected);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy90ZXN0L2NvbW1vbi90YXNrc1N5bmMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudCwgVGFza3NTeW5jaHJvbmlzZXIgfSBmcm9tICcuLi8uLi9jb21tb24vdGFza3NTeW5jLmpzJztcbmltcG9ydCB7IENoYW5nZSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgTWVyZ2VTdGF0ZSwgU3luY1Jlc291cmNlLCBTeW5jU3RhdHVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNDbGllbnQsIFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIgfSBmcm9tICcuL3VzZXJEYXRhU3luY0NsaWVudC5qcyc7XG5cbnN1aXRlKCdUYXNrc1N5bmMnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc2VydmVyID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0bGV0IGNsaWVudDogVXNlckRhdGFTeW5jQ2xpZW50O1xuXG5cdGxldCB0ZXN0T2JqZWN0OiBUYXNrc1N5bmNocm9uaXNlcjtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKS5jbGVhcigpO1xuXHR9KTtcblxuXHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCh0cnVlKTtcblx0XHR0ZXN0T2JqZWN0ID0gY2xpZW50LmdldFN5bmNocm9uaXplcihTeW5jUmVzb3VyY2UuVGFza3MpIGFzIFRhc2tzU3luY2hyb25pc2VyO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHRhc2tzIGZpbGUgZG9lcyBub3QgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKSwgbnVsbCk7XG5cdFx0XHRsZXQgbWFuaWZlc3QgPSBhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcyk7XG5cdFx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhtYW5pZmVzdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cdFx0XHRhc3NlcnQub2soIWF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyh0YXNrc1Jlc291cmNlKSk7XG5cblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEucmVmLCByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSwgcmVtb3RlVXNlckRhdGEuc3luY0RhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhLCBudWxsKTtcblxuXHRcdFx0bWFuaWZlc3QgPSBhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcyk7XG5cdFx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhtYW5pZmVzdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW10pO1xuXG5cdFx0XHRtYW5pZmVzdCA9IGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKTtcblx0XHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gdGFza3MgZmlsZSBkb2VzIG5vdCBleGlzdCBhbmQgcmVtb3RlIGhhcyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFt7XG5cdFx0XHRcdFx0J3R5cGUnOiAnbnBtJyxcblx0XHRcdFx0XHQnc2NyaXB0JzogJ3dhdGNoJyxcblx0XHRcdFx0XHQnbGFiZWwnOiAnV2F0Y2gnXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKS53cml0ZUZpbGUodGFza3NSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuVGFza3MpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZSh0YXNrc1Jlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gdGFza3MgZmlsZSBleGlzdHMgbG9jYWxseSBhbmQgcmVtb3RlIGhhcyBubyB0YXNrcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbe1xuXHRcdFx0XHRcdCd0eXBlJzogJ25wbScsXG5cdFx0XHRcdFx0J3NjcmlwdCc6ICd3YXRjaCcsXG5cdFx0XHRcdFx0J2xhYmVsJzogJ1dhdGNoJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUodGFza3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IHRpbWUgc3luYzogd2hlbiB0YXNrcyBmaWxlIGV4aXN0cyBsb2NhbGx5IHdpdGggc2FtZSBjb250ZW50IGFzIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbe1xuXHRcdFx0XHRcdCd0eXBlJzogJ25wbScsXG5cdFx0XHRcdFx0J3NjcmlwdCc6ICd3YXRjaCcsXG5cdFx0XHRcdFx0J2xhYmVsJzogJ1dhdGNoJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZTtcblx0XHRcdGF3YWl0IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSkud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodGFza3NSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHRhc2tzIGZpbGUgbG9jYWxseSBoYXMgbW92ZWQgZm9yd2FyZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFtdXG5cdFx0XHR9KSkpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuVGFza3MpKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbe1xuXHRcdFx0XHRcdCd0eXBlJzogJ25wbScsXG5cdFx0XHRcdFx0J3NjcmlwdCc6ICd3YXRjaCcsXG5cdFx0XHRcdFx0J2xhYmVsJzogJ1dhdGNoJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUodGFza3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gdGFza3MgZmlsZSByZW1vdGVseSBoYXMgbW92ZWQgZm9yd2FyZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UyLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW11cblx0XHRcdH0pKSk7XG5cblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFt7XG5cdFx0XHRcdFx0J3R5cGUnOiAnbnBtJyxcblx0XHRcdFx0XHQnc2NyaXB0JzogJ3dhdGNoJyxcblx0XHRcdFx0XHQnbGFiZWwnOiAnV2F0Y2gnXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHRcdGZpbGVTZXJ2aWNlMi53cml0ZUZpbGUodGFza3NSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRhc2tzUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpLCBjb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiB0YXNrcyBmaWxlIGhhcyBtb3ZlZCBmb3J3YXJkIGxvY2FsbHkgYW5kIHJlbW90ZWx5IHdpdGggc2FtZSBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZTIud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbXVxuXHRcdFx0fSkpKTtcblxuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW3tcblx0XHRcdFx0XHQndHlwZSc6ICducG0nLFxuXHRcdFx0XHRcdCdzY3JpcHQnOiAnd2F0Y2gnLFxuXHRcdFx0XHRcdCdsYWJlbCc6ICdXYXRjaCdcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdFx0ZmlsZVNlcnZpY2UyLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodGFza3NSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHRhc2tzIGZpbGUgaGFzIG1vdmVkIGZvcndhcmQgbG9jYWxseSBhbmQgcmVtb3RlbHkgLSBhY2NlcHQgcHJldmlldycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UyLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW11cblx0XHRcdH0pKSk7XG5cblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXG5cdFx0XHRmaWxlU2VydmljZTIud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbe1xuXHRcdFx0XHRcdCd0eXBlJzogJ25wbScsXG5cdFx0XHRcdFx0J3NjcmlwdCc6ICd3YXRjaCcsXG5cdFx0XHRcdH1dXG5cdFx0XHR9KSkpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW3tcblx0XHRcdFx0XHQndHlwZSc6ICducG0nLFxuXHRcdFx0XHRcdCdzY3JpcHQnOiAnd2F0Y2gnLFxuXHRcdFx0XHRcdCdsYWJlbCc6ICdXYXRjaCdcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cblx0XHRcdGNvbnN0IHByZXZpZXdDb250ZW50ID0gKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLm1lcmdlU3RhdGUsIE1lcmdlU3RhdGUuQ29uZmxpY3QpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ubG9jYWxDaGFuZ2UsIENoYW5nZS5Nb2RpZmllZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5yZW1vdGVDaGFuZ2UsIENoYW5nZS5Nb2RpZmllZCk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBwcmV2aWV3Q29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIHByZXZpZXdDb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodGFza3NSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIHByZXZpZXdDb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiB0YXNrcyBmaWxlIGhhcyBtb3ZlZCBmb3J3YXJkIGxvY2FsbHkgYW5kIHJlbW90ZWx5IC0gYWNjZXB0IG1vZGlmaWVkIHByZXZpZXcnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlMi53cml0ZUZpbGUodGFza3NSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFtdXG5cdFx0XHR9KSkpO1xuXG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZTtcblxuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuVGFza3MpKTtcblxuXHRcdFx0ZmlsZVNlcnZpY2UyLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW3tcblx0XHRcdFx0XHQndHlwZSc6ICducG0nLFxuXHRcdFx0XHRcdCdzY3JpcHQnOiAnd2F0Y2gnLFxuXHRcdFx0XHR9XVxuXHRcdFx0fSkpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUodGFza3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW3tcblx0XHRcdFx0XHQndHlwZSc6ICducG0nLFxuXHRcdFx0XHRcdCdzY3JpcHQnOiAnd2F0Y2gnLFxuXHRcdFx0XHRcdCdsYWJlbCc6ICdXYXRjaCdcblx0XHRcdFx0fV1cblx0XHRcdH0pKSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuVGFza3MpKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbe1xuXHRcdFx0XHRcdCd0eXBlJzogJ25wbScsXG5cdFx0XHRcdFx0J3NjcmlwdCc6ICd3YXRjaCcsXG5cdFx0XHRcdFx0J2xhYmVsJzogJ1dhdGNoIDInXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UsIGNvbnRlbnQpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRhc2tzUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpLCBjb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiB0YXNrcyBmaWxlIGhhcyBtb3ZlZCBmb3J3YXJkIGxvY2FsbHkgYW5kIHJlbW90ZWx5IC0gYWNjZXB0IHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UyLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW11cblx0XHRcdH0pKSk7XG5cblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFt7XG5cdFx0XHRcdFx0J3R5cGUnOiAnbnBtJyxcblx0XHRcdFx0XHQnc2NyaXB0JzogJ3dhdGNoJyxcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdFx0ZmlsZVNlcnZpY2UyLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFt7XG5cdFx0XHRcdFx0J3R5cGUnOiAnbnBtJyxcblx0XHRcdFx0XHQnc2NyaXB0JzogJ3dhdGNoJyxcblx0XHRcdFx0XHQnbGFiZWwnOiAnV2F0Y2gnXG5cdFx0XHRcdH1dXG5cdFx0XHR9KSkpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5yZW1vdGVSZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodGFza3NSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHRhc2tzIGZpbGUgaGFzIG1vdmVkIGZvcndhcmQgbG9jYWxseSBhbmQgcmVtb3RlbHkgLSBhY2NlcHQgbG9jYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlMi53cml0ZUZpbGUodGFza3NSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFtdXG5cdFx0XHR9KSkpO1xuXG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZTtcblxuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuVGFza3MpKTtcblxuXHRcdFx0ZmlsZVNlcnZpY2UyLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW3tcblx0XHRcdFx0XHQndHlwZSc6ICducG0nLFxuXHRcdFx0XHRcdCdzY3JpcHQnOiAnd2F0Y2gnLFxuXHRcdFx0XHR9XVxuXHRcdFx0fSkpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFt7XG5cdFx0XHRcdFx0J3R5cGUnOiAnbnBtJyxcblx0XHRcdFx0XHQnc2NyaXB0JzogJ3dhdGNoJyxcblx0XHRcdFx0XHQnbGFiZWwnOiAnV2F0Y2gnXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ubG9jYWxSZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodGFza3NSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHRhc2tzIGZpbGUgd2FzIHJlbW92ZWQgaW4gb25lIGNsaWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFtdXG5cdFx0XHR9KSkpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGZpbGVTZXJ2aWNlMi5kZWwodGFza3NSZXNvdXJjZTIpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKHRhc2tzUmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gdGFza3MgZmlsZSBpcyBjcmVhdGVkIGFmdGVyIGZpcnN0IHN5bmMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFt7XG5cdFx0XHRcdFx0J3R5cGUnOiAnbnBtJyxcblx0XHRcdFx0XHQnc2NyaXB0JzogJ3dhdGNoJyxcblx0XHRcdFx0XHQnbGFiZWwnOiAnV2F0Y2gnXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZpbGUodGFza3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cblx0XHRcdGxldCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKTtcblx0XHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtcblx0XHRcdFx0eyB0eXBlOiAnUE9TVCcsIHVybDogYCR7c2VydmVyLnVybH0vdjEvcmVzb3VyY2UvJHt0ZXN0T2JqZWN0LnJlc291cmNlfWAsIGhlYWRlcnM6IHsgJ0lmLU1hdGNoJzogbGFzdFN5bmNVc2VyRGF0YT8ucmVmIH0gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEhLnJlZiwgcmVtb3RlVXNlckRhdGEucmVmKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEsIHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5IHJlbW90ZSB3aGVuIHRhc2tzIGZpbGUgZG9lcyBub3QgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZTtcblx0XHRcdGlmIChhd2FpdCBmaWxlU2VydmljZS5leGlzdHModGFza3NSZXNvdXJjZSkpIHtcblx0XHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuZGVsKHRhc2tzUmVzb3VyY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcmV2aWV3ID0gKGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcyksIHRydWUpKSE7XG5cblx0XHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRlc3RPYmplY3QucmVzb2x2ZUNvbnRlbnQocHJldmlldy5yZXNvdXJjZVByZXZpZXdzWzBdLnJlbW90ZVJlc291cmNlKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXcucmVzb3VyY2VQcmV2aWV3c1swXS5yZW1vdGVSZXNvdXJjZSwgY29udGVudCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgcHJvZmlsZSB0YXNrcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgcHJvZmlsZSA9IGF3YWl0IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuY3JlYXRlTmFtZWRQcm9maWxlKCdwcm9maWxlMScpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW3tcblx0XHRcdFx0XHQndHlwZSc6ICducG0nLFxuXHRcdFx0XHRcdCdzY3JpcHQnOiAnd2F0Y2gnLFxuXHRcdFx0XHRcdCdsYWJlbCc6ICdXYXRjaCdcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKS5jcmVhdGVGaWxlKHByb2ZpbGUudGFza3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhleHBlY3RlZCkpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGF3YWl0IGNsaWVudC5zeW5jKCk7XG5cblx0XHRcdGNvbnN0IHN5bmNlZFByb2ZpbGUgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkucHJvZmlsZXMuZmluZChwID0+IHAuaWQgPT09IHByb2ZpbGUuaWQpITtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IChhd2FpdCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSkucmVhZEZpbGUoc3luY2VkUHJvZmlsZS50YXNrc1Jlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0XHR9KTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0NBQXlEO0FBQ2xFLFNBQVMsUUFBUSwyQkFBMkIsWUFBWSxjQUFjLGtCQUFrQjtBQUN4RixTQUFTLG9CQUFvQiw4QkFBOEI7QUFFM0QsTUFBTSxhQUFhLE1BQU07QUFFeEIsUUFBTSxTQUFTLElBQUksdUJBQXVCO0FBQzFDLE1BQUk7QUFFSixNQUFJO0FBRUosV0FBUyxZQUFZO0FBQ3BCLFVBQU0sT0FBTyxxQkFBcUIsSUFBSSx5QkFBeUIsRUFBRSxNQUFNO0FBQUEsRUFDeEUsQ0FBQztBQUVELFFBQU0sa0JBQWtCLHdDQUF3QztBQUVoRSxRQUFNLFlBQVk7QUFDakIsYUFBUyxnQkFBZ0IsSUFBSSxJQUFJLG1CQUFtQixNQUFNLENBQUM7QUFDM0QsVUFBTSxPQUFPLE1BQU0sSUFBSTtBQUN2QixpQkFBYSxPQUFPLGdCQUFnQixhQUFhLEtBQUs7QUFBQSxFQUN2RCxDQUFDO0FBRUQsT0FBSyxrQ0FBa0MsWUFBWTtBQUNsRCxVQUFNLG1CQUF5QixDQUFDLEdBQUcsWUFBWTtBQUM5QyxZQUFNLGNBQWMsT0FBTyxxQkFBcUIsSUFBSSxZQUFZO0FBQ2hFLFlBQU0sZ0JBQWdCLE9BQU8scUJBQXFCLElBQUksd0JBQXdCLEVBQUUsZUFBZTtBQUUvRixhQUFPLGdCQUFnQixN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
