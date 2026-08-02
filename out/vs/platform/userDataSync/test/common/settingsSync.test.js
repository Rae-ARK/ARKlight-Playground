import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Event } from "../../../../base/common/event.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { ConfigurationScope, Extensions } from "../../../configuration/common/configurationRegistry.js";
import { IFileService } from "../../../files/common/files.js";
import { Registry } from "../../../registry/common/platform.js";
import { IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { parseSettingsSyncContent } from "../../common/settingsSync.js";
import { IUserDataSyncStoreService, SyncResource, SyncStatus, UserDataSyncError, UserDataSyncErrorCode } from "../../common/userDataSync.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
suite("SettingsSync - Auto", () => {
  const server = new UserDataSyncTestServer();
  let client;
  let testObject;
  teardown(async () => {
    await client.instantiationService.get(IUserDataSyncStoreService).clear();
  });
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  setup(async () => {
    Registry.as(Extensions.Configuration).registerConfiguration({
      "id": "settingsSync",
      "type": "object",
      "properties": {
        "settingsSync.machine": {
          "type": "string",
          "scope": ConfigurationScope.MACHINE
        },
        "settingsSync.machineOverridable": {
          "type": "string",
          "scope": ConfigurationScope.MACHINE_OVERRIDABLE
        }
      }
    });
    client = disposableStore.add(new UserDataSyncClient(server));
    await client.setUp(true);
    testObject = client.getSynchronizer(SyncResource.Settings);
  });
  test("when settings file does not exist", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const fileService = client.instantiationService.get(IFileService);
    const settingResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource;
    assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
    let manifest = await client.getLatestRef(SyncResource.Settings);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
    assert.ok(!await fileService.exists(settingResource));
    const lastSyncUserData = await testObject.getLastSyncUserData();
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
    assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
    assert.strictEqual(lastSyncUserData.syncData, null);
    manifest = await client.getLatestRef(SyncResource.Settings);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
    manifest = await client.getLatestRef(SyncResource.Settings);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
  }));
  test("when settings file is empty and remote has no changes", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const fileService = client.instantiationService.get(IFileService);
    const settingsResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource;
    await fileService.writeFile(settingsResource, VSBuffer.fromString(""));
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const lastSyncUserData = await testObject.getLastSyncUserData();
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.strictEqual(parseSettingsSyncContent(lastSyncUserData.syncData.content)?.settings, "{}");
    assert.strictEqual(parseSettingsSyncContent(remoteUserData.syncData.content)?.settings, "{}");
    assert.strictEqual((await fileService.readFile(settingsResource)).value.toString(), "");
  }));
  test("when settings file is empty and remote has changes", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const client2 = disposableStore.add(new UserDataSyncClient(server));
    await client2.setUp(true);
    const content = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",
	"workbench.tree.indent": 20,
	"workbench.colorCustomizations": {
		"editorLineNumber.activeForeground": "#ff0000",
		"[GitHub Sharp]": {
			"statusBarItem.remoteBackground": "#24292E",
			"editorPane.background": "#f3f1f11a"
		}
	},

	"gitBranch.base": "remote-repo/master",

	// Experimental
	"workbench.view.experimental.allowMovingToNewContainer": true,
}`;
    await client2.instantiationService.get(IFileService).writeFile(client2.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource, VSBuffer.fromString(content));
    await client2.sync();
    const fileService = client.instantiationService.get(IFileService);
    const settingsResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource;
    await fileService.writeFile(settingsResource, VSBuffer.fromString(""));
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const lastSyncUserData = await testObject.getLastSyncUserData();
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.strictEqual(parseSettingsSyncContent(lastSyncUserData.syncData.content)?.settings, content);
    assert.strictEqual(parseSettingsSyncContent(remoteUserData.syncData.content)?.settings, content);
    assert.strictEqual((await fileService.readFile(settingsResource)).value.toString(), content);
  }));
  test("when settings file is created after first sync", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const fileService = client.instantiationService.get(IFileService);
    const settingsResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.settingsResource;
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    await fileService.createFile(settingsResource, VSBuffer.fromString("{}"));
    let lastSyncUserData = await testObject.getLastSyncUserData();
    const manifest = await client.getLatestRef(SyncResource.Settings);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, [
      { type: "POST", url: `${server.url}/v1/resource/${testObject.resource}`, headers: { "If-Match": lastSyncUserData?.ref } }
    ]);
    lastSyncUserData = await testObject.getLastSyncUserData();
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
    assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
    assert.strictEqual(parseSettingsSyncContent(lastSyncUserData.syncData.content)?.settings, "{}");
  }));
  test("sync for first time to the server", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const expected = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",
	"workbench.tree.indent": 20,
	"workbench.colorCustomizations": {
		"editorLineNumber.activeForeground": "#ff0000",
		"[GitHub Sharp]": {
			"statusBarItem.remoteBackground": "#24292E",
			"editorPane.background": "#f3f1f11a"
		}
	},

	"gitBranch.base": "remote-repo/master",

	// Experimental
	"workbench.view.experimental.allowMovingToNewContainer": true,
}`;
    await updateSettings(expected, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, expected);
  }));
  test("do not sync machine settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Machine
	"settingsSync.machine": "someValue",
	"settingsSync.machineOverridable": "someValue"
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp"
}`);
  }));
  test("do not sync machine settings when spread across file", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"settingsSync.machine": "someValue",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Machine
	"settingsSync.machineOverridable": "someValue"
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp"
}`);
  }));
  test("do not sync machine settings when spread across file - 2", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"settingsSync.machine": "someValue",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Machine
	"settingsSync.machineOverridable": "someValue",
	"files.simpleDialog.enable": true,
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",
	"files.simpleDialog.enable": true,
}`);
  }));
  test("sync when all settings are machine settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Machine
	"settingsSync.machine": "someValue",
	"settingsSync.machineOverridable": "someValue"
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
}`);
  }));
  test("sync when all settings are machine settings with trailing comma", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Machine
	"settingsSync.machine": "someValue",
	"settingsSync.machineOverridable": "someValue",
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	,
}`);
  }));
  test("local change event is triggered when settings are changed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const content = `{
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,
}`;
    await updateSettings(content, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const promise = Event.toPromise(testObject.onDidChangeLocal);
    await updateSettings(`{
	"files.autoSave": "off",
	"files.simpleDialog.enable": true,
}`, client);
    await promise;
  }));
  test("do not sync ignored settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Editor
	"editor.fontFamily": "Fira Code",

	// Terminal
	"terminal.integrated.shell.osx": "some path",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	]
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	]
}`);
  }));
  test("do not sync ignored and machine settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Editor
	"editor.fontFamily": "Fira Code",

	// Terminal
	"terminal.integrated.shell.osx": "some path",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	],

	// Machine
	"settingsSync.machine": "someValue",
}`;
    await updateSettings(settingsContent, client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	],
}`);
  }));
  test("sync throws invalid content error", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const expected = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",
	"workbench.tree.indent": 20,
	"workbench.colorCustomizations": {
		"editorLineNumber.activeForeground": "#ff0000",
		"[GitHub Sharp]": {
			"statusBarItem.remoteBackground": "#24292E",
			"editorPane.background": "#f3f1f11a"
		}
	}

	"gitBranch.base": "remote-repo/master",

	// Experimental
	"workbench.view.experimental.allowMovingToNewContainer": true,
}`;
    await updateSettings(expected, client);
    try {
      await testObject.sync(await client.getLatestRef(SyncResource.Settings));
      assert.fail("should fail with invalid content error");
    } catch (e) {
      assert.ok(e instanceof UserDataSyncError);
      assert.deepStrictEqual(e.code, UserDataSyncErrorCode.LocalInvalidContent);
    }
  }));
  test("sync throws invalid content error - content is an array", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await updateSettings("[]", client);
    try {
      await testObject.sync(await client.getLatestRef(SyncResource.Settings));
      assert.fail("should fail with invalid content error");
    } catch (e) {
      assert.ok(e instanceof UserDataSyncError);
      assert.deepStrictEqual(e.code, UserDataSyncErrorCode.LocalInvalidContent);
    }
  }));
  test("sync when there are conflicts", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const client2 = disposableStore.add(new UserDataSyncClient(server));
    await client2.setUp(true);
    await updateSettings(JSON.stringify({
      "a": 1,
      "b": 2,
      "settingsSync.ignoredSettings": ["a"]
    }), client2);
    await client2.sync();
    await updateSettings(JSON.stringify({
      "a": 2,
      "b": 1,
      "settingsSync.ignoredSettings": ["a"]
    }), client);
    await testObject.sync(await client.getLatestRef(SyncResource.Settings));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assert.strictEqual(testObject.conflicts.conflicts[0].localResource.toString(), testObject.localResource.toString());
    const fileService = client.instantiationService.get(IFileService);
    const mergeContent = (await fileService.readFile(testObject.conflicts.conflicts[0].previewResource)).value.toString();
    assert.strictEqual(mergeContent, "");
  }));
  test("sync profile settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const client2 = disposableStore.add(new UserDataSyncClient(server));
    await client2.setUp(true);
    const profile = await client2.instantiationService.get(IUserDataProfilesService).createNamedProfile("profile1");
    await updateSettings(JSON.stringify({
      "a": 1,
      "b": 2
    }), client2, profile);
    await client2.sync();
    await client.sync();
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    const syncedProfile = client.instantiationService.get(IUserDataProfilesService).profiles.find((p) => p.id === profile.id);
    const content = (await client.instantiationService.get(IFileService).readFile(syncedProfile.settingsResource)).value.toString();
    assert.deepStrictEqual(JSON.parse(content), {
      "a": 1,
      "b": 2
    });
  }));
});
suite("SettingsSync - Manual", () => {
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
    testObject = client.getSynchronizer(SyncResource.Settings);
  });
  test("do not sync ignored settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const settingsContent = `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Editor
	"editor.fontFamily": "Fira Code",

	// Terminal
	"terminal.integrated.shell.osx": "some path",

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	]
}`;
    await updateSettings(settingsContent, client);
    let preview = await testObject.sync(await client.getLatestRef(SyncResource.Settings), true);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource);
    preview = await testObject.apply(false);
    const { content } = await client.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSettings(content);
    assert.deepStrictEqual(actual, `{
	// Always
	"files.autoSave": "afterDelay",
	"files.simpleDialog.enable": true,

	// Workbench
	"workbench.colorTheme": "GitHub Sharp",

	// Ignored
	"settingsSync.ignoredSettings": [
		"editor.fontFamily",
		"terminal.integrated.shell.osx"
	]
}`);
  }));
});
function parseSettings(content) {
  const syncData = JSON.parse(content);
  const settingsSyncContent = JSON.parse(syncData.content);
  return settingsSyncContent.settings;
}
async function updateSettings(content, client, profile) {
  await client.instantiationService.get(IFileService).writeFile((profile ?? client.instantiationService.get(IUserDataProfilesService).defaultProfile).settingsResource, VSBuffer.fromString(content));
  await client.instantiationService.get(IConfigurationService).reloadConfiguration();
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy90ZXN0L2NvbW1vbi9zZXR0aW5nc1N5bmMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElTZXR0aW5nc1N5bmNDb250ZW50LCBwYXJzZVNldHRpbmdzU3luY0NvbnRlbnQsIFNldHRpbmdzU3luY2hyb25pc2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NldHRpbmdzU3luYy5qcyc7XG5pbXBvcnQgeyBJU3luY0RhdGEsIElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIFN5bmNSZXNvdXJjZSwgU3luY1N0YXR1cywgVXNlckRhdGFTeW5jRXJyb3IsIFVzZXJEYXRhU3luY0Vycm9yQ29kZSB9IGZyb20gJy4uLy4uL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFTeW5jQ2xpZW50LCBVc2VyRGF0YVN5bmNUZXN0U2VydmVyIH0gZnJvbSAnLi91c2VyRGF0YVN5bmNDbGllbnQuanMnO1xuXG5zdWl0ZSgnU2V0dGluZ3NTeW5jIC0gQXV0bycsICgpID0+IHtcblxuXHRjb25zdCBzZXJ2ZXIgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRsZXQgY2xpZW50OiBVc2VyRGF0YVN5bmNDbGllbnQ7XG5cdGxldCB0ZXN0T2JqZWN0OiBTZXR0aW5nc1N5bmNocm9uaXNlcjtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKS5jbGVhcigpO1xuXHR9KTtcblxuXHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0UmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ3NldHRpbmdzU3luYycsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzZXR0aW5nc1N5bmMubWFjaGluZSc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdzZXR0aW5nc1N5bmMubWFjaGluZU92ZXJyaWRhYmxlJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLk1BQ0hJTkVfT1ZFUlJJREFCTEVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRhd2FpdCBjbGllbnQuc2V0VXAodHJ1ZSk7XG5cdFx0dGVzdE9iamVjdCA9IGNsaWVudC5nZXRTeW5jaHJvbml6ZXIoU3luY1Jlc291cmNlLlNldHRpbmdzKSBhcyBTZXR0aW5nc1N5bmNocm9uaXNlcjtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiBzZXR0aW5ncyBmaWxlIGRvZXMgbm90IGV4aXN0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3Qgc2V0dGluZ1Jlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2U7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpLCBudWxsKTtcblx0XHRsZXQgbWFuaWZlc3QgPSBhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncyk7XG5cdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cdFx0YXNzZXJ0Lm9rKCFhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoc2V0dGluZ1Jlc291cmNlKSk7XG5cblx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEucmVmLCByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEsIHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEsIG51bGwpO1xuXG5cdFx0bWFuaWZlc3QgPSBhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncyk7XG5cdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW10pO1xuXG5cdFx0bWFuaWZlc3QgPSBhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncyk7XG5cdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW10pO1xuXHR9KSk7XG5cblx0dGVzdCgnd2hlbiBzZXR0aW5ncyBmaWxlIGlzIGVtcHR5IGFuZCByZW1vdGUgaGFzIG5vIGNoYW5nZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXR0aW5nc1Jlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2U7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNldHRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJycpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncykpO1xuXG5cdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VTZXR0aW5nc1N5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50KT8uc2V0dGluZ3MsICd7fScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVNldHRpbmdzU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQpPy5zZXR0aW5ncywgJ3t9Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShzZXR0aW5nc1Jlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgJycpO1xuXHR9KSk7XG5cblx0dGVzdCgnd2hlbiBzZXR0aW5ncyBmaWxlIGlzIGVtcHR5IGFuZCByZW1vdGUgaGFzIGNoYW5nZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0Y29uc3QgY29udGVudCA9XG5cdFx0XHRge1xuXHQvLyBBbHdheXNcblx0XCJmaWxlcy5hdXRvU2F2ZVwiOiBcImFmdGVyRGVsYXlcIixcblx0XCJmaWxlcy5zaW1wbGVEaWFsb2cuZW5hYmxlXCI6IHRydWUsXG5cblx0Ly8gV29ya2JlbmNoXG5cdFwid29ya2JlbmNoLmNvbG9yVGhlbWVcIjogXCJHaXRIdWIgU2hhcnBcIixcblx0XCJ3b3JrYmVuY2gudHJlZS5pbmRlbnRcIjogMjAsXG5cdFwid29ya2JlbmNoLmNvbG9yQ3VzdG9taXphdGlvbnNcIjoge1xuXHRcdFwiZWRpdG9yTGluZU51bWJlci5hY3RpdmVGb3JlZ3JvdW5kXCI6IFwiI2ZmMDAwMFwiLFxuXHRcdFwiW0dpdEh1YiBTaGFycF1cIjoge1xuXHRcdFx0XCJzdGF0dXNCYXJJdGVtLnJlbW90ZUJhY2tncm91bmRcIjogXCIjMjQyOTJFXCIsXG5cdFx0XHRcImVkaXRvclBhbmUuYmFja2dyb3VuZFwiOiBcIiNmM2YxZjExYVwiXG5cdFx0fVxuXHR9LFxuXG5cdFwiZ2l0QnJhbmNoLmJhc2VcIjogXCJyZW1vdGUtcmVwby9tYXN0ZXJcIixcblxuXHQvLyBFeHBlcmltZW50YWxcblx0XCJ3b3JrYmVuY2gudmlldy5leHBlcmltZW50YWwuYWxsb3dNb3ZpbmdUb05ld0NvbnRhaW5lclwiOiB0cnVlLFxufWA7XG5cdFx0YXdhaXQgY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKS53cml0ZUZpbGUoY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHNldHRpbmdzUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnJykpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKSk7XG5cblx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVNldHRpbmdzU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQpPy5zZXR0aW5ncywgY29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlU2V0dGluZ3NTeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCk/LnNldHRpbmdzLCBjb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHNldHRpbmdzUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpLCBjb250ZW50KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3doZW4gc2V0dGluZ3MgZmlsZSBpcyBjcmVhdGVkIGFmdGVyIGZpcnN0IHN5bmMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNldHRpbmdzUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU2V0dGluZ3MpKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGaWxlKHNldHRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3t9JykpO1xuXG5cdFx0bGV0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKTtcblx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMobWFuaWZlc3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtcblx0XHRcdHsgdHlwZTogJ1BPU1QnLCB1cmw6IGAke3NlcnZlci51cmx9L3YxL3Jlc291cmNlLyR7dGVzdE9iamVjdC5yZXNvdXJjZX1gLCBoZWFkZXJzOiB7ICdJZi1NYXRjaCc6IGxhc3RTeW5jVXNlckRhdGE/LnJlZiB9IH0sXG5cdFx0XSk7XG5cblx0XHRsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEucmVmLCByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEsIHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VTZXR0aW5nc1N5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50KT8uc2V0dGluZ3MsICd7fScpO1xuXHR9KSk7XG5cblx0dGVzdCgnc3luYyBmb3IgZmlyc3QgdGltZSB0byB0aGUgc2VydmVyJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPVxuXHRcdFx0YHtcblx0Ly8gQWx3YXlzXG5cdFwiZmlsZXMuYXV0b1NhdmVcIjogXCJhZnRlckRlbGF5XCIsXG5cdFwiZmlsZXMuc2ltcGxlRGlhbG9nLmVuYWJsZVwiOiB0cnVlLFxuXG5cdC8vIFdvcmtiZW5jaFxuXHRcIndvcmtiZW5jaC5jb2xvclRoZW1lXCI6IFwiR2l0SHViIFNoYXJwXCIsXG5cdFwid29ya2JlbmNoLnRyZWUuaW5kZW50XCI6IDIwLFxuXHRcIndvcmtiZW5jaC5jb2xvckN1c3RvbWl6YXRpb25zXCI6IHtcblx0XHRcImVkaXRvckxpbmVOdW1iZXIuYWN0aXZlRm9yZWdyb3VuZFwiOiBcIiNmZjAwMDBcIixcblx0XHRcIltHaXRIdWIgU2hhcnBdXCI6IHtcblx0XHRcdFwic3RhdHVzQmFySXRlbS5yZW1vdGVCYWNrZ3JvdW5kXCI6IFwiIzI0MjkyRVwiLFxuXHRcdFx0XCJlZGl0b3JQYW5lLmJhY2tncm91bmRcIjogXCIjZjNmMWYxMWFcIlxuXHRcdH1cblx0fSxcblxuXHRcImdpdEJyYW5jaC5iYXNlXCI6IFwicmVtb3RlLXJlcG8vbWFzdGVyXCIsXG5cblx0Ly8gRXhwZXJpbWVudGFsXG5cdFwid29ya2JlbmNoLnZpZXcuZXhwZXJpbWVudGFsLmFsbG93TW92aW5nVG9OZXdDb250YWluZXJcIjogdHJ1ZSxcbn1gO1xuXG5cdFx0YXdhaXQgdXBkYXRlU2V0dGluZ3MoZXhwZWN0ZWQsIGNsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IGNsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVNldHRpbmdzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkbyBub3Qgc3luYyBtYWNoaW5lIHNldHRpbmdzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dGluZ3NDb250ZW50ID1cblx0XHRcdGB7XG5cdC8vIEFsd2F5c1xuXHRcImZpbGVzLmF1dG9TYXZlXCI6IFwiYWZ0ZXJEZWxheVwiLFxuXHRcImZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGVcIjogdHJ1ZSxcblxuXHQvLyBXb3JrYmVuY2hcblx0XCJ3b3JrYmVuY2guY29sb3JUaGVtZVwiOiBcIkdpdEh1YiBTaGFycFwiLFxuXG5cdC8vIE1hY2hpbmVcblx0XCJzZXR0aW5nc1N5bmMubWFjaGluZVwiOiBcInNvbWVWYWx1ZVwiLFxuXHRcInNldHRpbmdzU3luYy5tYWNoaW5lT3ZlcnJpZGFibGVcIjogXCJzb21lVmFsdWVcIlxufWA7XG5cdFx0YXdhaXQgdXBkYXRlU2V0dGluZ3Moc2V0dGluZ3NDb250ZW50LCBjbGllbnQpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IGNsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVNldHRpbmdzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBge1xuXHQvLyBBbHdheXNcblx0XCJmaWxlcy5hdXRvU2F2ZVwiOiBcImFmdGVyRGVsYXlcIixcblx0XCJmaWxlcy5zaW1wbGVEaWFsb2cuZW5hYmxlXCI6IHRydWUsXG5cblx0Ly8gV29ya2JlbmNoXG5cdFwid29ya2JlbmNoLmNvbG9yVGhlbWVcIjogXCJHaXRIdWIgU2hhcnBcIlxufWApO1xuXHR9KSk7XG5cblx0dGVzdCgnZG8gbm90IHN5bmMgbWFjaGluZSBzZXR0aW5ncyB3aGVuIHNwcmVhZCBhY3Jvc3MgZmlsZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNldHRpbmdzQ29udGVudCA9XG5cdFx0XHRge1xuXHQvLyBBbHdheXNcblx0XCJmaWxlcy5hdXRvU2F2ZVwiOiBcImFmdGVyRGVsYXlcIixcblx0XCJzZXR0aW5nc1N5bmMubWFjaGluZVwiOiBcInNvbWVWYWx1ZVwiLFxuXHRcImZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGVcIjogdHJ1ZSxcblxuXHQvLyBXb3JrYmVuY2hcblx0XCJ3b3JrYmVuY2guY29sb3JUaGVtZVwiOiBcIkdpdEh1YiBTaGFycFwiLFxuXG5cdC8vIE1hY2hpbmVcblx0XCJzZXR0aW5nc1N5bmMubWFjaGluZU92ZXJyaWRhYmxlXCI6IFwic29tZVZhbHVlXCJcbn1gO1xuXHRcdGF3YWl0IHVwZGF0ZVNldHRpbmdzKHNldHRpbmdzQ29udGVudCwgY2xpZW50KTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncykpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCBjbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VTZXR0aW5ncyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgYHtcblx0Ly8gQWx3YXlzXG5cdFwiZmlsZXMuYXV0b1NhdmVcIjogXCJhZnRlckRlbGF5XCIsXG5cdFwiZmlsZXMuc2ltcGxlRGlhbG9nLmVuYWJsZVwiOiB0cnVlLFxuXG5cdC8vIFdvcmtiZW5jaFxuXHRcIndvcmtiZW5jaC5jb2xvclRoZW1lXCI6IFwiR2l0SHViIFNoYXJwXCJcbn1gKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2RvIG5vdCBzeW5jIG1hY2hpbmUgc2V0dGluZ3Mgd2hlbiBzcHJlYWQgYWNyb3NzIGZpbGUgLSAyJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dGluZ3NDb250ZW50ID1cblx0XHRcdGB7XG5cdC8vIEFsd2F5c1xuXHRcImZpbGVzLmF1dG9TYXZlXCI6IFwiYWZ0ZXJEZWxheVwiLFxuXHRcInNldHRpbmdzU3luYy5tYWNoaW5lXCI6IFwic29tZVZhbHVlXCIsXG5cblx0Ly8gV29ya2JlbmNoXG5cdFwid29ya2JlbmNoLmNvbG9yVGhlbWVcIjogXCJHaXRIdWIgU2hhcnBcIixcblxuXHQvLyBNYWNoaW5lXG5cdFwic2V0dGluZ3NTeW5jLm1hY2hpbmVPdmVycmlkYWJsZVwiOiBcInNvbWVWYWx1ZVwiLFxuXHRcImZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGVcIjogdHJ1ZSxcbn1gO1xuXHRcdGF3YWl0IHVwZGF0ZVNldHRpbmdzKHNldHRpbmdzQ29udGVudCwgY2xpZW50KTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncykpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCBjbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VTZXR0aW5ncyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgYHtcblx0Ly8gQWx3YXlzXG5cdFwiZmlsZXMuYXV0b1NhdmVcIjogXCJhZnRlckRlbGF5XCIsXG5cblx0Ly8gV29ya2JlbmNoXG5cdFwid29ya2JlbmNoLmNvbG9yVGhlbWVcIjogXCJHaXRIdWIgU2hhcnBcIixcblx0XCJmaWxlcy5zaW1wbGVEaWFsb2cuZW5hYmxlXCI6IHRydWUsXG59YCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdzeW5jIHdoZW4gYWxsIHNldHRpbmdzIGFyZSBtYWNoaW5lIHNldHRpbmdzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dGluZ3NDb250ZW50ID1cblx0XHRcdGB7XG5cdC8vIE1hY2hpbmVcblx0XCJzZXR0aW5nc1N5bmMubWFjaGluZVwiOiBcInNvbWVWYWx1ZVwiLFxuXHRcInNldHRpbmdzU3luYy5tYWNoaW5lT3ZlcnJpZGFibGVcIjogXCJzb21lVmFsdWVcIlxufWA7XG5cdFx0YXdhaXQgdXBkYXRlU2V0dGluZ3Moc2V0dGluZ3NDb250ZW50LCBjbGllbnQpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IGNsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVNldHRpbmdzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBge1xufWApO1xuXHR9KSk7XG5cblx0dGVzdCgnc3luYyB3aGVuIGFsbCBzZXR0aW5ncyBhcmUgbWFjaGluZSBzZXR0aW5ncyB3aXRoIHRyYWlsaW5nIGNvbW1hJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dGluZ3NDb250ZW50ID1cblx0XHRcdGB7XG5cdC8vIE1hY2hpbmVcblx0XCJzZXR0aW5nc1N5bmMubWFjaGluZVwiOiBcInNvbWVWYWx1ZVwiLFxuXHRcInNldHRpbmdzU3luYy5tYWNoaW5lT3ZlcnJpZGFibGVcIjogXCJzb21lVmFsdWVcIixcbn1gO1xuXHRcdGF3YWl0IHVwZGF0ZVNldHRpbmdzKHNldHRpbmdzQ29udGVudCwgY2xpZW50KTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncykpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCBjbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VTZXR0aW5ncyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgYHtcblx0LFxufWApO1xuXHR9KSk7XG5cblx0dGVzdCgnbG9jYWwgY2hhbmdlIGV2ZW50IGlzIHRyaWdnZXJlZCB3aGVuIHNldHRpbmdzIGFyZSBjaGFuZ2VkJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9XG5cdFx0XHRge1xuXHRcImZpbGVzLmF1dG9TYXZlXCI6IFwiYWZ0ZXJEZWxheVwiLFxuXHRcImZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGVcIjogdHJ1ZSxcbn1gO1xuXG5cdFx0YXdhaXQgdXBkYXRlU2V0dGluZ3MoY29udGVudCwgY2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU2V0dGluZ3MpKTtcblxuXHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UodGVzdE9iamVjdC5vbkRpZENoYW5nZUxvY2FsKTtcblx0XHRhd2FpdCB1cGRhdGVTZXR0aW5ncyhge1xuXHRcImZpbGVzLmF1dG9TYXZlXCI6IFwib2ZmXCIsXG5cdFwiZmlsZXMuc2ltcGxlRGlhbG9nLmVuYWJsZVwiOiB0cnVlLFxufWAsIGNsaWVudCk7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblx0fSkpO1xuXG5cdHRlc3QoJ2RvIG5vdCBzeW5jIGlnbm9yZWQgc2V0dGluZ3MnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXR0aW5nc0NvbnRlbnQgPVxuXHRcdFx0YHtcblx0Ly8gQWx3YXlzXG5cdFwiZmlsZXMuYXV0b1NhdmVcIjogXCJhZnRlckRlbGF5XCIsXG5cdFwiZmlsZXMuc2ltcGxlRGlhbG9nLmVuYWJsZVwiOiB0cnVlLFxuXG5cdC8vIEVkaXRvclxuXHRcImVkaXRvci5mb250RmFtaWx5XCI6IFwiRmlyYSBDb2RlXCIsXG5cblx0Ly8gVGVybWluYWxcblx0XCJ0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNoZWxsLm9zeFwiOiBcInNvbWUgcGF0aFwiLFxuXG5cdC8vIFdvcmtiZW5jaFxuXHRcIndvcmtiZW5jaC5jb2xvclRoZW1lXCI6IFwiR2l0SHViIFNoYXJwXCIsXG5cblx0Ly8gSWdub3JlZFxuXHRcInNldHRpbmdzU3luYy5pZ25vcmVkU2V0dGluZ3NcIjogW1xuXHRcdFwiZWRpdG9yLmZvbnRGYW1pbHlcIixcblx0XHRcInRlcm1pbmFsLmludGVncmF0ZWQuc2hlbGwub3N4XCJcblx0XVxufWA7XG5cdFx0YXdhaXQgdXBkYXRlU2V0dGluZ3Moc2V0dGluZ3NDb250ZW50LCBjbGllbnQpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNldHRpbmdzKSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IGNsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVNldHRpbmdzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBge1xuXHQvLyBBbHdheXNcblx0XCJmaWxlcy5hdXRvU2F2ZVwiOiBcImFmdGVyRGVsYXlcIixcblx0XCJmaWxlcy5zaW1wbGVEaWFsb2cuZW5hYmxlXCI6IHRydWUsXG5cblx0Ly8gV29ya2JlbmNoXG5cdFwid29ya2JlbmNoLmNvbG9yVGhlbWVcIjogXCJHaXRIdWIgU2hhcnBcIixcblxuXHQvLyBJZ25vcmVkXG5cdFwic2V0dGluZ3NTeW5jLmlnbm9yZWRTZXR0aW5nc1wiOiBbXG5cdFx0XCJlZGl0b3IuZm9udEZhbWlseVwiLFxuXHRcdFwidGVybWluYWwuaW50ZWdyYXRlZC5zaGVsbC5vc3hcIlxuXHRdXG59YCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkbyBub3Qgc3luYyBpZ25vcmVkIGFuZCBtYWNoaW5lIHNldHRpbmdzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dGluZ3NDb250ZW50ID1cblx0XHRcdGB7XG5cdC8vIEFsd2F5c1xuXHRcImZpbGVzLmF1dG9TYXZlXCI6IFwiYWZ0ZXJEZWxheVwiLFxuXHRcImZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGVcIjogdHJ1ZSxcblxuXHQvLyBFZGl0b3Jcblx0XCJlZGl0b3IuZm9udEZhbWlseVwiOiBcIkZpcmEgQ29kZVwiLFxuXG5cdC8vIFRlcm1pbmFsXG5cdFwidGVybWluYWwuaW50ZWdyYXRlZC5zaGVsbC5vc3hcIjogXCJzb21lIHBhdGhcIixcblxuXHQvLyBXb3JrYmVuY2hcblx0XCJ3b3JrYmVuY2guY29sb3JUaGVtZVwiOiBcIkdpdEh1YiBTaGFycFwiLFxuXG5cdC8vIElnbm9yZWRcblx0XCJzZXR0aW5nc1N5bmMuaWdub3JlZFNldHRpbmdzXCI6IFtcblx0XHRcImVkaXRvci5mb250RmFtaWx5XCIsXG5cdFx0XCJ0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNoZWxsLm9zeFwiXG5cdF0sXG5cblx0Ly8gTWFjaGluZVxuXHRcInNldHRpbmdzU3luYy5tYWNoaW5lXCI6IFwic29tZVZhbHVlXCIsXG59YDtcblx0XHRhd2FpdCB1cGRhdGVTZXR0aW5ncyhzZXR0aW5nc0NvbnRlbnQsIGNsaWVudCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU2V0dGluZ3MpKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgY2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU2V0dGluZ3MoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGB7XG5cdC8vIEFsd2F5c1xuXHRcImZpbGVzLmF1dG9TYXZlXCI6IFwiYWZ0ZXJEZWxheVwiLFxuXHRcImZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGVcIjogdHJ1ZSxcblxuXHQvLyBXb3JrYmVuY2hcblx0XCJ3b3JrYmVuY2guY29sb3JUaGVtZVwiOiBcIkdpdEh1YiBTaGFycFwiLFxuXG5cdC8vIElnbm9yZWRcblx0XCJzZXR0aW5nc1N5bmMuaWdub3JlZFNldHRpbmdzXCI6IFtcblx0XHRcImVkaXRvci5mb250RmFtaWx5XCIsXG5cdFx0XCJ0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNoZWxsLm9zeFwiXG5cdF0sXG59YCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdzeW5jIHRocm93cyBpbnZhbGlkIGNvbnRlbnQgZXJyb3InLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHBlY3RlZCA9XG5cdFx0XHRge1xuXHQvLyBBbHdheXNcblx0XCJmaWxlcy5hdXRvU2F2ZVwiOiBcImFmdGVyRGVsYXlcIixcblx0XCJmaWxlcy5zaW1wbGVEaWFsb2cuZW5hYmxlXCI6IHRydWUsXG5cblx0Ly8gV29ya2JlbmNoXG5cdFwid29ya2JlbmNoLmNvbG9yVGhlbWVcIjogXCJHaXRIdWIgU2hhcnBcIixcblx0XCJ3b3JrYmVuY2gudHJlZS5pbmRlbnRcIjogMjAsXG5cdFwid29ya2JlbmNoLmNvbG9yQ3VzdG9taXphdGlvbnNcIjoge1xuXHRcdFwiZWRpdG9yTGluZU51bWJlci5hY3RpdmVGb3JlZ3JvdW5kXCI6IFwiI2ZmMDAwMFwiLFxuXHRcdFwiW0dpdEh1YiBTaGFycF1cIjoge1xuXHRcdFx0XCJzdGF0dXNCYXJJdGVtLnJlbW90ZUJhY2tncm91bmRcIjogXCIjMjQyOTJFXCIsXG5cdFx0XHRcImVkaXRvclBhbmUuYmFja2dyb3VuZFwiOiBcIiNmM2YxZjExYVwiXG5cdFx0fVxuXHR9XG5cblx0XCJnaXRCcmFuY2guYmFzZVwiOiBcInJlbW90ZS1yZXBvL21hc3RlclwiLFxuXG5cdC8vIEV4cGVyaW1lbnRhbFxuXHRcIndvcmtiZW5jaC52aWV3LmV4cGVyaW1lbnRhbC5hbGxvd01vdmluZ1RvTmV3Q29udGFpbmVyXCI6IHRydWUsXG59YDtcblxuXHRcdGF3YWl0IHVwZGF0ZVNldHRpbmdzKGV4cGVjdGVkLCBjbGllbnQpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncykpO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ3Nob3VsZCBmYWlsIHdpdGggaW52YWxpZCBjb250ZW50IGVycm9yJyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0YXNzZXJ0Lm9rKGUgaW5zdGFuY2VvZiBVc2VyRGF0YVN5bmNFcnJvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKCg8VXNlckRhdGFTeW5jRXJyb3I+ZSkuY29kZSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkxvY2FsSW52YWxpZENvbnRlbnQpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHRlc3QoJ3N5bmMgdGhyb3dzIGludmFsaWQgY29udGVudCBlcnJvciAtIGNvbnRlbnQgaXMgYW4gYXJyYXknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTZXR0aW5ncygnW10nLCBjbGllbnQpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU2V0dGluZ3MpKTtcblx0XHRcdGFzc2VydC5mYWlsKCdzaG91bGQgZmFpbCB3aXRoIGludmFsaWQgY29udGVudCBlcnJvcicpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGFzc2VydC5vayhlIGluc3RhbmNlb2YgVXNlckRhdGFTeW5jRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoPFVzZXJEYXRhU3luY0Vycm9yPmUpLmNvZGUsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Mb2NhbEludmFsaWRDb250ZW50KTtcblx0XHR9XG5cdH0pKTtcblxuXHR0ZXN0KCdzeW5jIHdoZW4gdGhlcmUgYXJlIGNvbmZsaWN0cycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRhd2FpdCB1cGRhdGVTZXR0aW5ncyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDIsXG5cdFx0XHQnc2V0dGluZ3NTeW5jLmlnbm9yZWRTZXR0aW5ncyc6IFsnYSddXG5cdFx0fSksIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyLFxuXHRcdFx0J2InOiAxLFxuXHRcdFx0J3NldHRpbmdzU3luYy5pZ25vcmVkU2V0dGluZ3MnOiBbJ2EnXVxuXHRcdH0pLCBjbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5sb2NhbFJlc291cmNlLnRvU3RyaW5nKCksIHRlc3RPYmplY3QubG9jYWxSZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IG1lcmdlQ29udGVudCA9IChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZSh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVyZ2VDb250ZW50LCAnJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdzeW5jIHByb2ZpbGUgc2V0dGluZ3MnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IGF3YWl0IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuY3JlYXRlTmFtZWRQcm9maWxlKCdwcm9maWxlMScpO1xuXHRcdGF3YWl0IHVwZGF0ZVNldHRpbmdzKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHRcdCdiJzogMixcblx0XHR9KSwgY2xpZW50MiwgcHJvZmlsZSk7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCBjbGllbnQuc3luYygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXG5cdFx0Y29uc3Qgc3luY2VkUHJvZmlsZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5wcm9maWxlcy5maW5kKHAgPT4gcC5pZCA9PT0gcHJvZmlsZS5pZCkhO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAoYXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpLnJlYWRGaWxlKHN5bmNlZFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKGNvbnRlbnQpLCB7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDIsXG5cdFx0fSk7XG5cdH0pKTtcblxufSk7XG5cbnN1aXRlKCdTZXR0aW5nc1N5bmMgLSBNYW51YWwnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc2VydmVyID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0bGV0IGNsaWVudDogVXNlckRhdGFTeW5jQ2xpZW50O1xuXHRsZXQgdGVzdE9iamVjdDogU2V0dGluZ3NTeW5jaHJvbmlzZXI7XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSkuY2xlYXIoKTtcblx0fSk7XG5cblx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRhd2FpdCBjbGllbnQuc2V0VXAodHJ1ZSk7XG5cdFx0dGVzdE9iamVjdCA9IGNsaWVudC5nZXRTeW5jaHJvbml6ZXIoU3luY1Jlc291cmNlLlNldHRpbmdzKSBhcyBTZXR0aW5nc1N5bmNocm9uaXNlcjtcblx0fSk7XG5cblx0dGVzdCgnZG8gbm90IHN5bmMgaWdub3JlZCBzZXR0aW5ncycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNldHRpbmdzQ29udGVudCA9XG5cdFx0XHRge1xuXHQvLyBBbHdheXNcblx0XCJmaWxlcy5hdXRvU2F2ZVwiOiBcImFmdGVyRGVsYXlcIixcblx0XCJmaWxlcy5zaW1wbGVEaWFsb2cuZW5hYmxlXCI6IHRydWUsXG5cblx0Ly8gRWRpdG9yXG5cdFwiZWRpdG9yLmZvbnRGYW1pbHlcIjogXCJGaXJhIENvZGVcIixcblxuXHQvLyBUZXJtaW5hbFxuXHRcInRlcm1pbmFsLmludGVncmF0ZWQuc2hlbGwub3N4XCI6IFwic29tZSBwYXRoXCIsXG5cblx0Ly8gV29ya2JlbmNoXG5cdFwid29ya2JlbmNoLmNvbG9yVGhlbWVcIjogXCJHaXRIdWIgU2hhcnBcIixcblxuXHQvLyBJZ25vcmVkXG5cdFwic2V0dGluZ3NTeW5jLmlnbm9yZWRTZXR0aW5nc1wiOiBbXG5cdFx0XCJlZGl0b3IuZm9udEZhbWlseVwiLFxuXHRcdFwidGVybWluYWwuaW50ZWdyYXRlZC5zaGVsbC5vc3hcIlxuXHRdXG59YDtcblx0XHRhd2FpdCB1cGRhdGVTZXR0aW5ncyhzZXR0aW5nc0NvbnRlbnQsIGNsaWVudCk7XG5cblx0XHRsZXQgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TZXR0aW5ncyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5wcmV2aWV3UmVzb3VyY2UpO1xuXHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgY2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU2V0dGluZ3MoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGB7XG5cdC8vIEFsd2F5c1xuXHRcImZpbGVzLmF1dG9TYXZlXCI6IFwiYWZ0ZXJEZWxheVwiLFxuXHRcImZpbGVzLnNpbXBsZURpYWxvZy5lbmFibGVcIjogdHJ1ZSxcblxuXHQvLyBXb3JrYmVuY2hcblx0XCJ3b3JrYmVuY2guY29sb3JUaGVtZVwiOiBcIkdpdEh1YiBTaGFycFwiLFxuXG5cdC8vIElnbm9yZWRcblx0XCJzZXR0aW5nc1N5bmMuaWdub3JlZFNldHRpbmdzXCI6IFtcblx0XHRcImVkaXRvci5mb250RmFtaWx5XCIsXG5cdFx0XCJ0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNoZWxsLm9zeFwiXG5cdF1cbn1gKTtcblx0fSkpO1xuXG59KTtcblxuZnVuY3Rpb24gcGFyc2VTZXR0aW5ncyhjb250ZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBzeW5jRGF0YTogSVN5bmNEYXRhID0gSlNPTi5wYXJzZShjb250ZW50KTtcblx0Y29uc3Qgc2V0dGluZ3NTeW5jQ29udGVudDogSVNldHRpbmdzU3luY0NvbnRlbnQgPSBKU09OLnBhcnNlKHN5bmNEYXRhLmNvbnRlbnQpO1xuXHRyZXR1cm4gc2V0dGluZ3NTeW5jQ29udGVudC5zZXR0aW5ncztcbn1cblxuYXN5bmMgZnVuY3Rpb24gdXBkYXRlU2V0dGluZ3MoY29udGVudDogc3RyaW5nLCBjbGllbnQ6IFVzZXJEYXRhU3luY0NsaWVudCwgcHJvZmlsZT86IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0YXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpLndyaXRlRmlsZSgocHJvZmlsZSA/PyBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUpLnNldHRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRhd2FpdCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkucmVsb2FkQ29uZmlndXJhdGlv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
