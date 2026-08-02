import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IFileService } from "../../../files/common/files.js";
import { ILogService } from "../../../log/common/log.js";
import { IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { getMcpContentFromSyncContent } from "../../common/mcpSync.js";
import { Change, IUserDataSyncStoreService, MergeState, SyncResource, SyncStatus } from "../../common/userDataSync.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
suite("McpSync", () => {
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
    testObject = client.getSynchronizer(SyncResource.Mcp);
  });
  test("when mcp file does not exist", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
      let manifest = await client.getLatestRef(SyncResource.Mcp);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, []);
      assert.ok(!await fileService.exists(mcpResource));
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
      assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
      assert.strictEqual(lastSyncUserData.syncData, null);
      manifest = await client.getLatestRef(SyncResource.Mcp);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, []);
      manifest = await client.getLatestRef(SyncResource.Mcp);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, []);
    });
  });
  test("when mcp file does not exist and remote has changes", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.instantiationService.get(IFileService).writeFile(mcpResource2, VSBuffer.fromString(content));
      await client2.sync();
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file exists locally and remote has no mcp", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      fileService.writeFile(mcpResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
    });
  });
  test("first time sync: when mcp file exists locally with same content as remote", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.instantiationService.get(IFileService).writeFile(mcpResource2, VSBuffer.fromString(content));
      await client2.sync();
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await fileService.writeFile(mcpResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file locally has moved forward", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      fileService.writeFile(mcpResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
    });
  });
  test("when mcp file remotely has moved forward", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      fileService2.writeFile(mcpResource2, VSBuffer.fromString(content));
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file has moved forward locally and remotely with same changes", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      fileService2.writeFile(mcpResource2, VSBuffer.fromString(content));
      await client2.sync();
      fileService.writeFile(mcpResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file has moved forward locally and remotely - accept preview", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {
          "server1": {
            "command": "node",
            "args": ["./server1.js"]
          }
        }
      })));
      await client2.sync();
      const content = JSON.stringify({
        "mcpServers": {
          "server2": {
            "command": "node",
            "args": ["./server2.js"]
          }
        }
      });
      fileService.writeFile(mcpResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
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
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), previewContent);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), previewContent);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), previewContent);
    });
  });
  test("when mcp file has moved forward locally and remotely - accept modified preview", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {
          "server1": {
            "command": "node",
            "args": ["./server1.js"]
          }
        }
      })));
      await client2.sync();
      fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {
          "server2": {
            "command": "node",
            "args": ["./server2.js"]
          }
        }
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const content = JSON.stringify({
        "mcpServers": {
          "server1": {
            "command": "node",
            "args": ["./server1.js"]
          },
          "server2": {
            "command": "node",
            "args": ["./server2.js"]
          }
        }
      });
      await testObject.accept(testObject.conflicts.conflicts[0].previewResource, content);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file has moved forward locally and remotely - accept remote", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const content = JSON.stringify({
        "mcpServers": {
          "server1": {
            "command": "node",
            "args": ["./server1.js"]
          }
        }
      });
      fileService2.writeFile(mcpResource2, VSBuffer.fromString(content));
      await client2.sync();
      fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {
          "server2": {
            "command": "node",
            "args": ["./server2.js"]
          }
        }
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].remoteResource);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file has moved forward locally and remotely - accept local", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {
          "server1": {
            "command": "node",
            "args": ["./server1.js"]
          }
        }
      })));
      await client2.sync();
      const content = JSON.stringify({
        "mcpServers": {
          "server2": {
            "command": "node",
            "args": ["./server2.js"]
          }
        }
      });
      fileService.writeFile(mcpResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].localResource);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file was removed in one client", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      await client2.sync();
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      fileService2.del(mcpResource2);
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), null);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), null);
      assert.strictEqual(await fileService.exists(mcpResource), false);
    });
  });
  test("when mcp file is created after first sync", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      await fileService.createFile(mcpResource, VSBuffer.fromString(content));
      let lastSyncUserData = await testObject.getLastSyncUserData();
      const manifest = await client.getLatestRef(SyncResource.Mcp);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, [
        { type: "POST", url: `${server.url}/v1/resource/${testObject.resource}`, headers: { "If-Match": lastSyncUserData?.ref } }
      ]);
      lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
      assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
    });
  });
  test("apply remote when mcp file does not exist", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      if (await fileService.exists(mcpResource)) {
        await fileService.del(mcpResource);
      }
      const preview = await testObject.sync(await client.getLatestRef(SyncResource.Mcp), true);
      server.reset();
      const content = await testObject.resolveContent(preview.resourcePreviews[0].remoteResource);
      await testObject.accept(preview.resourcePreviews[0].remoteResource, content);
      await testObject.apply(false);
      assert.deepStrictEqual(server.requests, []);
    });
  });
  test("sync profile mcp", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const profile = await client2.instantiationService.get(IUserDataProfilesService).createNamedProfile("profile1");
      const expected = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      await client2.instantiationService.get(IFileService).createFile(profile.mcpResource, VSBuffer.fromString(expected));
      await client2.sync();
      await client.sync();
      const syncedProfile = client.instantiationService.get(IUserDataProfilesService).profiles.find((p) => p.id === profile.id);
      const actual = (await client.instantiationService.get(IFileService).readFile(syncedProfile.mcpResource)).value.toString();
      assert.strictEqual(actual, expected);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy90ZXN0L2NvbW1vbi9tY3BTeW5jLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50LCBNY3BTeW5jaHJvbmlzZXIgfSBmcm9tICcuLi8uLi9jb21tb24vbWNwU3luYy5qcyc7XG5pbXBvcnQgeyBDaGFuZ2UsIElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIE1lcmdlU3RhdGUsIFN5bmNSZXNvdXJjZSwgU3luY1N0YXR1cyB9IGZyb20gJy4uLy4uL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFTeW5jQ2xpZW50LCBVc2VyRGF0YVN5bmNUZXN0U2VydmVyIH0gZnJvbSAnLi91c2VyRGF0YVN5bmNDbGllbnQuanMnO1xuXG5zdWl0ZSgnTWNwU3luYycsICgpID0+IHtcblxuXHRjb25zdCBzZXJ2ZXIgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRsZXQgY2xpZW50OiBVc2VyRGF0YVN5bmNDbGllbnQ7XG5cblx0bGV0IHRlc3RPYmplY3Q6IE1jcFN5bmNocm9uaXNlcjtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKS5jbGVhcigpO1xuXHR9KTtcblxuXHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCh0cnVlKTtcblx0XHR0ZXN0T2JqZWN0ID0gY2xpZW50LmdldFN5bmNocm9uaXplcihTeW5jUmVzb3VyY2UuTWNwKSBhcyBNY3BTeW5jaHJvbmlzZXI7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gbWNwIGZpbGUgZG9lcyBub3QgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpLCBudWxsKTtcblx0XHRcdGxldCBtYW5pZmVzdCA9IGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCk7XG5cdFx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhtYW5pZmVzdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cdFx0XHRhc3NlcnQub2soIWF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhtY3BSZXNvdXJjZSkpO1xuXG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEhLnJlZiwgcmVtb3RlVXNlckRhdGEucmVmKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEsIHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSwgbnVsbCk7XG5cblx0XHRcdG1hbmlmZXN0ID0gYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKTtcblx0XHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cblx0XHRcdG1hbmlmZXN0ID0gYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKTtcblx0XHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gbWNwIGZpbGUgZG9lcyBub3QgZXhpc3QgYW5kIHJlbW90ZSBoYXMgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7XG5cdFx0XHRcdFx0J3Rlc3Qtc2VydmVyJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIuanMnXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKS53cml0ZUZpbGUobWNwUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShtY3BSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIG1jcCBmaWxlIGV4aXN0cyBsb2NhbGx5IGFuZCByZW1vdGUgaGFzIG5vIG1jcCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHtcblx0XHRcdFx0XHQndGVzdC1zZXJ2ZXInOiB7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6ICdub2RlJyxcblx0XHRcdFx0XHRcdCdhcmdzJzogWycuL3NlcnZlci5qcyddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtY3BSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IHRpbWUgc3luYzogd2hlbiBtY3AgZmlsZSBleGlzdHMgbG9jYWxseSB3aXRoIHNhbWUgY29udGVudCBhcyByZW1vdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdFx0XHRcdCd0ZXN0LXNlcnZlcic6IHtcblx0XHRcdFx0XHRcdCdjb21tYW5kJzogJ25vZGUnLFxuXHRcdFx0XHRcdFx0J2FyZ3MnOiBbJy4vc2VydmVyLmpzJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRcdGF3YWl0IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSkud3JpdGVGaWxlKG1jcFJlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtY3BSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1jcFJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gbWNwIGZpbGUgbG9jYWxseSBoYXMgbW92ZWQgZm9yd2FyZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUobWNwUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHt9XG5cdFx0XHR9KSkpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdFx0XHRcdCd0ZXN0LXNlcnZlcic6IHtcblx0XHRcdFx0XHRcdCdjb21tYW5kJzogJ25vZGUnLFxuXHRcdFx0XHRcdFx0J2FyZ3MnOiBbJy4vc2VydmVyLmpzJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1jcFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiBtY3AgZmlsZSByZW1vdGVseSBoYXMgbW92ZWQgZm9yd2FyZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZTIud3JpdGVGaWxlKG1jcFJlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge31cblx0XHRcdH0pKSk7XG5cblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHtcblx0XHRcdFx0XHQndGVzdC1zZXJ2ZXInOiB7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6ICdub2RlJyxcblx0XHRcdFx0XHRcdCdhcmdzJzogWycuL3NlcnZlci5qcyddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGZpbGVTZXJ2aWNlMi53cml0ZUZpbGUobWNwUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblxuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShtY3BSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIG1jcCBmaWxlIGhhcyBtb3ZlZCBmb3J3YXJkIGxvY2FsbHkgYW5kIHJlbW90ZWx5IHdpdGggc2FtZSBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlMi53cml0ZUZpbGUobWNwUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7fVxuXHRcdFx0fSkpKTtcblxuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblxuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdFx0XHRcdCd0ZXN0LXNlcnZlcic6IHtcblx0XHRcdFx0XHRcdCdjb21tYW5kJzogJ25vZGUnLFxuXHRcdFx0XHRcdFx0J2FyZ3MnOiBbJy4vc2VydmVyLmpzJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0ZmlsZVNlcnZpY2UyLndyaXRlRmlsZShtY3BSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtY3BSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShtY3BSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIG1jcCBmaWxlIGhhcyBtb3ZlZCBmb3J3YXJkIGxvY2FsbHkgYW5kIHJlbW90ZWx5IC0gYWNjZXB0IHByZXZpZXcnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UyLndyaXRlRmlsZShtY3BSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHt9XG5cdFx0XHR9KSkpO1xuXG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApKTtcblxuXHRcdFx0ZmlsZVNlcnZpY2UyLndyaXRlRmlsZShtY3BSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHtcblx0XHRcdFx0XHQnc2VydmVyMSc6IHtcblx0XHRcdFx0XHRcdCdjb21tYW5kJzogJ25vZGUnLFxuXHRcdFx0XHRcdFx0J2FyZ3MnOiBbJy4vc2VydmVyMS5qcyddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSkpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdFx0XHRcdCdzZXJ2ZXIyJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIyLmpzJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1jcFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApKTtcblxuXHRcdFx0Y29uc3QgcHJldmlld0NvbnRlbnQgPSAoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ubWVyZ2VTdGF0ZSwgTWVyZ2VTdGF0ZS5Db25mbGljdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5sb2NhbENoYW5nZSwgQ2hhbmdlLk1vZGlmaWVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLnJlbW90ZUNoYW5nZSwgQ2hhbmdlLk1vZGlmaWVkKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBwcmV2aWV3Q29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBwcmV2aWV3Q29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1jcFJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgcHJldmlld0NvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIG1jcCBmaWxlIGhhcyBtb3ZlZCBmb3J3YXJkIGxvY2FsbHkgYW5kIHJlbW90ZWx5IC0gYWNjZXB0IG1vZGlmaWVkIHByZXZpZXcnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UyLndyaXRlRmlsZShtY3BSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHt9XG5cdFx0XHR9KSkpO1xuXG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApKTtcblxuXHRcdFx0ZmlsZVNlcnZpY2UyLndyaXRlRmlsZShtY3BSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHtcblx0XHRcdFx0XHQnc2VydmVyMSc6IHtcblx0XHRcdFx0XHRcdCdjb21tYW5kJzogJ25vZGUnLFxuXHRcdFx0XHRcdFx0J2FyZ3MnOiBbJy4vc2VydmVyMS5qcyddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSkpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtY3BSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdFx0XHRcdCdzZXJ2ZXIyJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIyLmpzJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdFx0XHRcdCdzZXJ2ZXIxJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIxLmpzJ11cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdzZXJ2ZXIyJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIyLmpzJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSwgY29udGVudCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShtY3BSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIG1jcCBmaWxlIGhhcyBtb3ZlZCBmb3J3YXJkIGxvY2FsbHkgYW5kIHJlbW90ZWx5IC0gYWNjZXB0IHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZTIud3JpdGVGaWxlKG1jcFJlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge31cblx0XHRcdH0pKSk7XG5cblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHtcblx0XHRcdFx0XHQnc2VydmVyMSc6IHtcblx0XHRcdFx0XHRcdCdjb21tYW5kJzogJ25vZGUnLFxuXHRcdFx0XHRcdFx0J2FyZ3MnOiBbJy4vc2VydmVyMS5qcyddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGZpbGVTZXJ2aWNlMi53cml0ZUZpbGUobWNwUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUobWNwUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHtcblx0XHRcdFx0XHQnc2VydmVyMic6IHtcblx0XHRcdFx0XHRcdCdjb21tYW5kJzogJ25vZGUnLFxuXHRcdFx0XHRcdFx0J2FyZ3MnOiBbJy4vc2VydmVyMi5qcyddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSkpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucmVtb3RlUmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUobWNwUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpLCBjb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiBtY3AgZmlsZSBoYXMgbW92ZWQgZm9yd2FyZCBsb2NhbGx5IGFuZCByZW1vdGVseSAtIGFjY2VwdCBsb2NhbCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZTIud3JpdGVGaWxlKG1jcFJlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge31cblx0XHRcdH0pKSk7XG5cblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXG5cdFx0XHRmaWxlU2VydmljZTIud3JpdGVGaWxlKG1jcFJlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdFx0XHRcdCdzZXJ2ZXIxJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIxLmpzJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7XG5cdFx0XHRcdFx0J3NlcnZlcjInOiB7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6ICdub2RlJyxcblx0XHRcdFx0XHRcdCdhcmdzJzogWycuL3NlcnZlcjIuanMnXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUobWNwUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ubG9jYWxSZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShtY3BSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIG1jcCBmaWxlIHdhcyByZW1vdmVkIGluIG9uZSBjbGllbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1jcFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7fVxuXHRcdFx0fSkpKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApKTtcblxuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRmaWxlU2VydmljZTIuZGVsKG1jcFJlc291cmNlMik7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMobWNwUmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gbWNwIGZpbGUgaXMgY3JlYXRlZCBhZnRlciBmaXJzdCBzeW5jJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7XG5cdFx0XHRcdFx0J3Rlc3Qtc2VydmVyJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIuanMnXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGaWxlKG1jcFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblxuXHRcdFx0bGV0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKTtcblx0XHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtcblx0XHRcdFx0eyB0eXBlOiAnUE9TVCcsIHVybDogYCR7c2VydmVyLnVybH0vdjEvcmVzb3VyY2UvJHt0ZXN0T2JqZWN0LnJlc291cmNlfWAsIGhlYWRlcnM6IHsgJ0lmLU1hdGNoJzogbGFzdFN5bmNVc2VyRGF0YT8ucmVmIH0gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEhLnJlZiwgcmVtb3RlVXNlckRhdGEucmVmKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEsIHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseSByZW1vdGUgd2hlbiBtY3AgZmlsZSBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdFx0XHRpZiAoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKG1jcFJlc291cmNlKSkge1xuXHRcdFx0XHRhd2FpdCBmaWxlU2VydmljZS5kZWwobWNwUmVzb3VyY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcmV2aWV3ID0gKGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApLCB0cnVlKSkhO1xuXG5cdFx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlc29sdmVDb250ZW50KHByZXZpZXcucmVzb3VyY2VQcmV2aWV3c1swXS5yZW1vdGVSZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3LnJlc291cmNlUHJldmlld3NbMF0ucmVtb3RlUmVzb3VyY2UsIGNvbnRlbnQpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHByb2ZpbGUgbWNwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRjb25zdCBwcm9maWxlID0gYXdhaXQgY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5jcmVhdGVOYW1lZFByb2ZpbGUoJ3Byb2ZpbGUxJyk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7XG5cdFx0XHRcdFx0J3Rlc3Qtc2VydmVyJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIuanMnXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpLmNyZWF0ZUZpbGUocHJvZmlsZS5tY3BSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhleHBlY3RlZCkpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGF3YWl0IGNsaWVudC5zeW5jKCk7XG5cblx0XHRcdGNvbnN0IHN5bmNlZFByb2ZpbGUgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkucHJvZmlsZXMuZmluZChwID0+IHAuaWQgPT09IHByb2ZpbGUuaWQpITtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IChhd2FpdCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSkucmVhZEZpbGUoc3luY2VkUHJvZmlsZS5tY3BSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLG9CQUFvQjtBQUM3QixT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QUFHLFlBQVk7QUFDOUMsWUFBTSxjQUFjLE9BQU8scUJBQXFCLElBQUksWUFBWTtBQUNoRSxZQUFNLGNBQWMsT0FBTyxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxlQUFlO0FBQzdGLFVBQUksTUFBTSxZQUFZLE9BQU8sV0FBVyxHQUFHO0FBQzFDLGNBQU0sWUFBWSxJQUFJLFdBQVc7QUFBQSxNQUNsQztBQUVBLFlBQU0sVUFBVyxNQUFNLFdBQVcsS0FBSyxNQUFNLE9BQU8sYUFBYSxhQUFhLEdBQUcsR0FBRyxJQUFJO0FBRXhGLGFBQU8sTUFBTTtBQUNiLFlBQU0sVUFBVSxNQUFNLFdBQVcsZUFBZSxRQUFRLGlCQUFpQixDQUFDLEVBQUUsY0FBYztBQUMxRixZQUFNLFdBQVcsT0FBTyxRQUFRLGlCQUFpQixDQUFDLEVBQUUsZ0JBQWdCLE9BQU87QUFDM0UsWUFBTSxXQUFXLE1BQU0sS0FBSztBQUM1QixhQUFPLGdCQUFnQixPQUFPLFVBQVUsQ0FBQyxDQUFDO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0JBQW9CLFlBQVk7QUFDcEMsVUFBTSxtQkFBeUIsQ0FBQyxHQUFHLFlBQVk7QUFDOUMsWUFBTSxVQUFVLGdCQUFnQixJQUFJLElBQUksbUJBQW1CLE1BQU0sQ0FBQztBQUNsRSxZQUFNLFFBQVEsTUFBTSxJQUFJO0FBQ3hCLFlBQU0sVUFBVSxNQUFNLFFBQVEscUJBQXFCLElBQUksd0JBQXdCLEVBQUUsbUJBQW1CLFVBQVU7QUFDOUcsWUFBTSxXQUFXLEtBQUssVUFBVTtBQUFBLFFBQy9CLGNBQWM7QUFBQSxVQUNiLGVBQWU7QUFBQSxZQUNkLFdBQVc7QUFBQSxZQUNYLFFBQVEsQ0FBQyxhQUFhO0FBQUEsVUFDdkI7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxRQUFRLHFCQUFxQixJQUFJLFlBQVksRUFBRSxXQUFXLFFBQVEsYUFBYSxTQUFTLFdBQVcsUUFBUSxDQUFDO0FBQ2xILFlBQU0sUUFBUSxLQUFLO0FBRW5CLFlBQU0sT0FBTyxLQUFLO0FBRWxCLFlBQU0sZ0JBQWdCLE9BQU8scUJBQXFCLElBQUksd0JBQXdCLEVBQUUsU0FBUyxLQUFLLE9BQUssRUFBRSxPQUFPLFFBQVEsRUFBRTtBQUN0SCxZQUFNLFVBQVUsTUFBTSxPQUFPLHFCQUFxQixJQUFJLFlBQVksRUFBRSxTQUFTLGNBQWMsV0FBVyxHQUFHLE1BQU0sU0FBUztBQUN4SCxhQUFPLFlBQVksUUFBUSxRQUFRO0FBQUEsSUFDcEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
