import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { dirname, joinPath } from "../../../../base/common/resources.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { IFileService } from "../../../files/common/files.js";
import { IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { IUserDataSyncStoreService, PREVIEW_DIR_NAME, SyncResource, SyncStatus } from "../../common/userDataSync.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
const tsSnippet1 = `{

	// Place your snippets for TypeScript here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position, Placeholders with the
	// same ids are connected.
	"Print to console": {
	// Example:
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console",
	}

}`;
const tsSnippet2 = `{

	// Place your snippets for TypeScript here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position, Placeholders with the
	// same ids are connected.
	"Print to console": {
	// Example:
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console always",
	}

}`;
const htmlSnippet1 = `{
/*
	// Place your snippets for HTML here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
*/
"Div": {
	"prefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"description": "New div"
	}
}`;
const htmlSnippet2 = `{
/*
	// Place your snippets for HTML here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
*/
"Div": {
	"prefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"description": "New div changed"
	}
}`;
const htmlSnippet3 = `{
/*
	// Place your snippets for HTML here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
*/
"Div": {
	"prefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"description": "New div changed again"
	}
}`;
const globalSnippet = `{
	// Place your global snippets here. Each snippet is defined under a snippet name and has a scope, prefix, body and
	// description. Add comma separated ids of the languages where the snippet is applicable in the scope field. If scope
	// is left empty or omitted, the snippet gets applied to all languages. The prefix is what is
	// used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position, and {1: label}, { 2: another } for placeholders.
	// Placeholders with the same ids are connected.
	// Example:
	// "Print to console": {
	// 	"scope": "javascript,typescript",
	// 	"prefix": "log",
	// 	"body": [
	// 		"console.log('$1');",
	// 		"$2"
	// 	],
	// 	"description": "Log output to console"
	// }
}`;
suite("SnippetsSync", () => {
  const server = new UserDataSyncTestServer();
  let testClient;
  let client2;
  let testObject;
  teardown(async () => {
    await testClient.instantiationService.get(IUserDataSyncStoreService).clear();
  });
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  setup(async () => {
    testClient = disposableStore.add(new UserDataSyncClient(server));
    await testClient.setUp(true);
    testObject = testClient.getSynchronizer(SyncResource.Snippets);
    client2 = disposableStore.add(new UserDataSyncClient(server));
    await client2.setUp(true);
  });
  test("when snippets does not exist", async () => {
    const fileService = testClient.instantiationService.get(IFileService);
    const snippetsResource = testClient.instantiationService.get(IUserDataProfilesService).defaultProfile.snippetsHome;
    assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
    let manifest = await testClient.getLatestRef(SyncResource.Snippets);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
    assert.ok(!await fileService.exists(snippetsResource));
    const lastSyncUserData = await testObject.getLastSyncUserData();
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
    assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
    assert.strictEqual(lastSyncUserData.syncData, null);
    manifest = await testClient.getLatestRef(SyncResource.Snippets);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
    manifest = await testClient.getLatestRef(SyncResource.Snippets);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
  });
  test("when snippet is created after first sync", async () => {
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("html.json", htmlSnippet1, testClient);
    let lastSyncUserData = await testObject.getLastSyncUserData();
    const manifest = await testClient.getLatestRef(SyncResource.Snippets);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, [
      { type: "POST", url: `${server.url}/v1/resource/${testObject.resource}`, headers: { "If-Match": lastSyncUserData?.ref } }
    ]);
    lastSyncUserData = await testObject.getLastSyncUserData();
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
    assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
    assert.deepStrictEqual(lastSyncUserData.syncData.content, JSON.stringify({ "html.json": htmlSnippet1 }));
  });
  test("first time sync - outgoing to server (no snippets)", async () => {
    await updateSnippet("html.json", htmlSnippet1, testClient);
    await updateSnippet("typescript.json", tsSnippet1, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 });
  });
  test("first time sync - incoming from server (no snippets)", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet1);
    const actual2 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual2, tsSnippet1);
  });
  test("first time sync when snippets exists", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await updateSnippet("typescript.json", tsSnippet1, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet1);
    const actual2 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual2, tsSnippet1);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 });
  });
  test("first time sync when snippets exists - has conflicts", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("first time sync when snippets exists - has conflicts and accept conflicts", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    const conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, htmlSnippet1);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet1);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet1 });
  });
  test("first time sync when snippets exists - has multiple conflicts", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local1 = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json");
    const local2 = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json");
    assertPreviews(testObject.conflicts.conflicts, [local1, local2]);
  });
  test("first time sync when snippets exists - has multiple conflicts and accept one conflict", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    let conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, htmlSnippet2);
    conflicts = testObject.conflicts.conflicts;
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("first time sync when snippets exists - has multiple conflicts and accept all conflicts", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    const conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, htmlSnippet2);
    await testObject.accept(conflicts[1].previewResource, tsSnippet1);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet2);
    const actual2 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual2, tsSnippet1);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet2, "typescript.json": tsSnippet1 });
  });
  test("sync adding a snippet", async () => {
    await updateSnippet("html.json", htmlSnippet1, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("typescript.json", tsSnippet1, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet1);
    const actual2 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual2, tsSnippet1);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet1, "typescript.json": tsSnippet1 });
  });
  test("sync adding a snippet - accept", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet1);
    const actual2 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual2, tsSnippet1);
  });
  test("sync updating a snippet", async () => {
    await updateSnippet("html.json", htmlSnippet1, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet2);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet2 });
  });
  test("sync updating a snippet - accept", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("html.json", htmlSnippet2, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet2);
  });
  test("sync updating a snippet - conflict", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("html.json", htmlSnippet2, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet3, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("sync updating a snippet - resolve conflict", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("html.json", htmlSnippet2, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet3, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await testObject.accept(testObject.conflicts.conflicts[0].previewResource, htmlSnippet2);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet2);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet2 });
  });
  test("sync removing a snippet", async () => {
    await updateSnippet("html.json", htmlSnippet1, testClient);
    await updateSnippet("typescript.json", tsSnippet1, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await removeSnippet("html.json", testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual1, tsSnippet1);
    const actual2 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual2, null);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "typescript.json": tsSnippet1 });
  });
  test("sync removing a snippet - accept", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await removeSnippet("html.json", client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual1, tsSnippet1);
    const actual2 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual2, null);
  });
  test("sync removing a snippet locally and updating it remotely", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await updateSnippet("html.json", htmlSnippet2, client2);
    await client2.sync();
    await removeSnippet("html.json", testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual1, tsSnippet1);
    const actual2 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual2, htmlSnippet2);
  });
  test("sync removing a snippet - conflict", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await removeSnippet("html.json", client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("sync removing a snippet - resolve conflict", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await removeSnippet("html.json", client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await testObject.accept(testObject.conflicts.conflicts[0].previewResource, htmlSnippet3);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual1, tsSnippet1);
    const actual2 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual2, htmlSnippet3);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "typescript.json": tsSnippet1, "html.json": htmlSnippet3 });
  });
  test("sync removing a snippet - resolve conflict by removing", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await removeSnippet("html.json", client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    await testObject.accept(testObject.conflicts.conflicts[0].previewResource, null);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual1, tsSnippet1);
    const actual2 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual2, null);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "typescript.json": tsSnippet1 });
  });
  test("sync global and language snippet", async () => {
    await updateSnippet("global.code-snippets", globalSnippet, client2);
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("html.json", testClient);
    assert.strictEqual(actual1, htmlSnippet1);
    const actual2 = await readSnippet("global.code-snippets", testClient);
    assert.strictEqual(actual2, globalSnippet);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "html.json": htmlSnippet1, "global.code-snippets": globalSnippet });
  });
  test("sync should ignore non snippets", async () => {
    await updateSnippet("global.code-snippets", globalSnippet, client2);
    await updateSnippet("html.html", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readSnippet("typescript.json", testClient);
    assert.strictEqual(actual1, tsSnippet1);
    const actual2 = await readSnippet("global.code-snippets", testClient);
    assert.strictEqual(actual2, globalSnippet);
    const actual3 = await readSnippet("html.html", testClient);
    assert.strictEqual(actual3, null);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parseSnippets(content);
    assert.deepStrictEqual(actual, { "typescript.json": tsSnippet1, "global.code-snippets": globalSnippet });
  });
  test("previews are reset after all conflicts resolved", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
    const conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, htmlSnippet2);
    await testObject.apply(false);
    const fileService = testClient.instantiationService.get(IFileService);
    assert.ok(!await fileService.exists(dirname(conflicts[0].previewResource)));
  });
  test("merge when there are multiple snippets and all snippets are merged", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple snippets and all snippets are merged and applied", async () => {
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    preview = await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.strictEqual(preview, null);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple snippets and one snippet has no changes and one snippet is merged", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet1, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json")
      ]
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple snippets and one snippet has no changes and snippets is merged and applied", async () => {
    await updateSnippet("html.json", htmlSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet1, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    preview = await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.strictEqual(preview, null);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple snippets with conflicts and all snippets are merged", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
  });
  test("accept when there are multiple snippets with conflicts and only one snippet is accepted", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource, htmlSnippet2);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
  });
  test("accept when there are multiple snippets with conflicts and all snippets are accepted", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource, htmlSnippet2);
    preview = await testObject.accept(preview.resourcePreviews[1].previewResource, tsSnippet2);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("accept when there are multiple snippets with conflicts and all snippets are accepted and applied", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updateSnippet("html.json", htmlSnippet1, client2);
    await updateSnippet("typescript.json", tsSnippet1, client2);
    await client2.sync();
    await updateSnippet("html.json", htmlSnippet2, testClient);
    await updateSnippet("typescript.json", tsSnippet2, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "html.json"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "typescript.json")
      ]
    );
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource, htmlSnippet2);
    preview = await testObject.accept(preview.resourcePreviews[1].previewResource, tsSnippet2);
    preview = await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.strictEqual(preview, null);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("sync profile snippets", async () => {
    const client22 = disposableStore.add(new UserDataSyncClient(server));
    await client22.setUp(true);
    const profile = await client22.instantiationService.get(IUserDataProfilesService).createNamedProfile("profile1");
    await updateSnippet("html.json", htmlSnippet1, client22, profile);
    await client22.sync();
    await testClient.sync();
    const syncedProfile = testClient.instantiationService.get(IUserDataProfilesService).profiles.find((p) => p.id === profile.id);
    const content = await readSnippet("html.json", testClient, syncedProfile);
    assert.strictEqual(content, htmlSnippet1);
  });
  function parseSnippets(content) {
    const syncData = JSON.parse(content);
    return JSON.parse(syncData.content);
  }
  async function updateSnippet(name, content, client, profile) {
    const fileService = client.instantiationService.get(IFileService);
    const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
    const snippetsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).snippetsHome, name);
    await fileService.writeFile(snippetsResource, VSBuffer.fromString(content));
  }
  async function removeSnippet(name, client) {
    const fileService = client.instantiationService.get(IFileService);
    const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
    const snippetsResource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, name);
    await fileService.del(snippetsResource);
  }
  async function readSnippet(name, client, profile) {
    const fileService = client.instantiationService.get(IFileService);
    const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
    const snippetsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).snippetsHome, name);
    if (await fileService.exists(snippetsResource)) {
      const content = await fileService.readFile(snippetsResource);
      return content.value.toString();
    }
    return null;
  }
  function assertPreviews(actual, expected) {
    assert.deepStrictEqual(actual.map(({ previewResource }) => previewResource.toString()), expected.map((uri) => uri.toString()));
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy90ZXN0L2NvbW1vbi9zbmlwcGV0c1N5bmMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgU25pcHBldHNTeW5jaHJvbmlzZXIgfSBmcm9tICcuLi8uLi9jb21tb24vc25pcHBldHNTeW5jLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZVByZXZpZXcsIElTeW5jRGF0YSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgUFJFVklFV19ESVJfTkFNRSwgU3luY1Jlc291cmNlLCBTeW5jU3RhdHVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNDbGllbnQsIFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIgfSBmcm9tICcuL3VzZXJEYXRhU3luY0NsaWVudC5qcyc7XG5cbmNvbnN0IHRzU25pcHBldDEgPSBge1xuXG5cdC8vIFBsYWNlIHlvdXIgc25pcHBldHMgZm9yIFR5cGVTY3JpcHQgaGVyZS4gRWFjaCBzbmlwcGV0IGlzIGRlZmluZWQgdW5kZXIgYSBzbmlwcGV0IG5hbWUgYW5kIGhhcyBhIHByZWZpeCwgYm9keSBhbmRcblx0Ly8gZGVzY3JpcHRpb24uIFRoZSBwcmVmaXggaXMgd2hhdCBpcyB1c2VkIHRvIHRyaWdnZXIgdGhlIHNuaXBwZXQgYW5kIHRoZSBib2R5IHdpbGwgYmUgZXhwYW5kZWQgYW5kIGluc2VydGVkLiBQb3NzaWJsZSB2YXJpYWJsZXMgYXJlOlxuXHQvLyAkMSwgJDIgZm9yIHRhYiBzdG9wcywgJDAgZm9yIHRoZSBmaW5hbCBjdXJzb3IgcG9zaXRpb24sIFBsYWNlaG9sZGVycyB3aXRoIHRoZVxuXHQvLyBzYW1lIGlkcyBhcmUgY29ubmVjdGVkLlxuXHRcIlByaW50IHRvIGNvbnNvbGVcIjoge1xuXHQvLyBFeGFtcGxlOlxuXHRcInByZWZpeFwiOiBcImxvZ1wiLFxuXHRcdFwiYm9keVwiOiBbXG5cdFx0XHRcImNvbnNvbGUubG9nKCckMScpO1wiLFxuXHRcdFx0XCIkMlwiXG5cdFx0XSxcblx0XHRcdFwiZGVzY3JpcHRpb25cIjogXCJMb2cgb3V0cHV0IHRvIGNvbnNvbGVcIixcblx0fVxuXG59YDtcblxuY29uc3QgdHNTbmlwcGV0MiA9IGB7XG5cblx0Ly8gUGxhY2UgeW91ciBzbmlwcGV0cyBmb3IgVHlwZVNjcmlwdCBoZXJlLiBFYWNoIHNuaXBwZXQgaXMgZGVmaW5lZCB1bmRlciBhIHNuaXBwZXQgbmFtZSBhbmQgaGFzIGEgcHJlZml4LCBib2R5IGFuZFxuXHQvLyBkZXNjcmlwdGlvbi4gVGhlIHByZWZpeCBpcyB3aGF0IGlzIHVzZWQgdG8gdHJpZ2dlciB0aGUgc25pcHBldCBhbmQgdGhlIGJvZHkgd2lsbCBiZSBleHBhbmRlZCBhbmQgaW5zZXJ0ZWQuIFBvc3NpYmxlIHZhcmlhYmxlcyBhcmU6XG5cdC8vICQxLCAkMiBmb3IgdGFiIHN0b3BzLCAkMCBmb3IgdGhlIGZpbmFsIGN1cnNvciBwb3NpdGlvbiwgUGxhY2Vob2xkZXJzIHdpdGggdGhlXG5cdC8vIHNhbWUgaWRzIGFyZSBjb25uZWN0ZWQuXG5cdFwiUHJpbnQgdG8gY29uc29sZVwiOiB7XG5cdC8vIEV4YW1wbGU6XG5cdFwicHJlZml4XCI6IFwibG9nXCIsXG5cdFx0XCJib2R5XCI6IFtcblx0XHRcdFwiY29uc29sZS5sb2coJyQxJyk7XCIsXG5cdFx0XHRcIiQyXCJcblx0XHRdLFxuXHRcdFx0XCJkZXNjcmlwdGlvblwiOiBcIkxvZyBvdXRwdXQgdG8gY29uc29sZSBhbHdheXNcIixcblx0fVxuXG59YDtcblxuY29uc3QgaHRtbFNuaXBwZXQxID0gYHtcbi8qXG5cdC8vIFBsYWNlIHlvdXIgc25pcHBldHMgZm9yIEhUTUwgaGVyZS4gRWFjaCBzbmlwcGV0IGlzIGRlZmluZWQgdW5kZXIgYSBzbmlwcGV0IG5hbWUgYW5kIGhhcyBhIHByZWZpeCwgYm9keSBhbmRcblx0Ly8gZGVzY3JpcHRpb24uIFRoZSBwcmVmaXggaXMgd2hhdCBpcyB1c2VkIHRvIHRyaWdnZXIgdGhlIHNuaXBwZXQgYW5kIHRoZSBib2R5IHdpbGwgYmUgZXhwYW5kZWQgYW5kIGluc2VydGVkLlxuXHQvLyBFeGFtcGxlOlxuXHRcIlByaW50IHRvIGNvbnNvbGVcIjoge1xuXHRcInByZWZpeFwiOiBcImxvZ1wiLFxuXHRcdFwiYm9keVwiOiBbXG5cdFx0XHRcImNvbnNvbGUubG9nKCckMScpO1wiLFxuXHRcdFx0XCIkMlwiXG5cdFx0XSxcblx0XHRcdFwiZGVzY3JpcHRpb25cIjogXCJMb2cgb3V0cHV0IHRvIGNvbnNvbGVcIlxuXHR9XG4qL1xuXCJEaXZcIjoge1xuXHRcInByZWZpeFwiOiBcImRpdlwiLFxuXHRcdFwiYm9keVwiOiBbXG5cdFx0XHRcIjxkaXY+XCIsXG5cdFx0XHRcIlwiLFxuXHRcdFx0XCI8L2Rpdj5cIlxuXHRcdF0sXG5cdFx0XHRcImRlc2NyaXB0aW9uXCI6IFwiTmV3IGRpdlwiXG5cdH1cbn1gO1xuXG5jb25zdCBodG1sU25pcHBldDIgPSBge1xuLypcblx0Ly8gUGxhY2UgeW91ciBzbmlwcGV0cyBmb3IgSFRNTCBoZXJlLiBFYWNoIHNuaXBwZXQgaXMgZGVmaW5lZCB1bmRlciBhIHNuaXBwZXQgbmFtZSBhbmQgaGFzIGEgcHJlZml4LCBib2R5IGFuZFxuXHQvLyBkZXNjcmlwdGlvbi4gVGhlIHByZWZpeCBpcyB3aGF0IGlzIHVzZWQgdG8gdHJpZ2dlciB0aGUgc25pcHBldCBhbmQgdGhlIGJvZHkgd2lsbCBiZSBleHBhbmRlZCBhbmQgaW5zZXJ0ZWQuXG5cdC8vIEV4YW1wbGU6XG5cdFwiUHJpbnQgdG8gY29uc29sZVwiOiB7XG5cdFwicHJlZml4XCI6IFwibG9nXCIsXG5cdFx0XCJib2R5XCI6IFtcblx0XHRcdFwiY29uc29sZS5sb2coJyQxJyk7XCIsXG5cdFx0XHRcIiQyXCJcblx0XHRdLFxuXHRcdFx0XCJkZXNjcmlwdGlvblwiOiBcIkxvZyBvdXRwdXQgdG8gY29uc29sZVwiXG5cdH1cbiovXG5cIkRpdlwiOiB7XG5cdFwicHJlZml4XCI6IFwiZGl2XCIsXG5cdFx0XCJib2R5XCI6IFtcblx0XHRcdFwiPGRpdj5cIixcblx0XHRcdFwiXCIsXG5cdFx0XHRcIjwvZGl2PlwiXG5cdFx0XSxcblx0XHRcdFwiZGVzY3JpcHRpb25cIjogXCJOZXcgZGl2IGNoYW5nZWRcIlxuXHR9XG59YDtcblxuY29uc3QgaHRtbFNuaXBwZXQzID0gYHtcbi8qXG5cdC8vIFBsYWNlIHlvdXIgc25pcHBldHMgZm9yIEhUTUwgaGVyZS4gRWFjaCBzbmlwcGV0IGlzIGRlZmluZWQgdW5kZXIgYSBzbmlwcGV0IG5hbWUgYW5kIGhhcyBhIHByZWZpeCwgYm9keSBhbmRcblx0Ly8gZGVzY3JpcHRpb24uIFRoZSBwcmVmaXggaXMgd2hhdCBpcyB1c2VkIHRvIHRyaWdnZXIgdGhlIHNuaXBwZXQgYW5kIHRoZSBib2R5IHdpbGwgYmUgZXhwYW5kZWQgYW5kIGluc2VydGVkLlxuXHQvLyBFeGFtcGxlOlxuXHRcIlByaW50IHRvIGNvbnNvbGVcIjoge1xuXHRcInByZWZpeFwiOiBcImxvZ1wiLFxuXHRcdFwiYm9keVwiOiBbXG5cdFx0XHRcImNvbnNvbGUubG9nKCckMScpO1wiLFxuXHRcdFx0XCIkMlwiXG5cdFx0XSxcblx0XHRcdFwiZGVzY3JpcHRpb25cIjogXCJMb2cgb3V0cHV0IHRvIGNvbnNvbGVcIlxuXHR9XG4qL1xuXCJEaXZcIjoge1xuXHRcInByZWZpeFwiOiBcImRpdlwiLFxuXHRcdFwiYm9keVwiOiBbXG5cdFx0XHRcIjxkaXY+XCIsXG5cdFx0XHRcIlwiLFxuXHRcdFx0XCI8L2Rpdj5cIlxuXHRcdF0sXG5cdFx0XHRcImRlc2NyaXB0aW9uXCI6IFwiTmV3IGRpdiBjaGFuZ2VkIGFnYWluXCJcblx0fVxufWA7XG5cbmNvbnN0IGdsb2JhbFNuaXBwZXQgPSBge1xuXHQvLyBQbGFjZSB5b3VyIGdsb2JhbCBzbmlwcGV0cyBoZXJlLiBFYWNoIHNuaXBwZXQgaXMgZGVmaW5lZCB1bmRlciBhIHNuaXBwZXQgbmFtZSBhbmQgaGFzIGEgc2NvcGUsIHByZWZpeCwgYm9keSBhbmRcblx0Ly8gZGVzY3JpcHRpb24uIEFkZCBjb21tYSBzZXBhcmF0ZWQgaWRzIG9mIHRoZSBsYW5ndWFnZXMgd2hlcmUgdGhlIHNuaXBwZXQgaXMgYXBwbGljYWJsZSBpbiB0aGUgc2NvcGUgZmllbGQuIElmIHNjb3BlXG5cdC8vIGlzIGxlZnQgZW1wdHkgb3Igb21pdHRlZCwgdGhlIHNuaXBwZXQgZ2V0cyBhcHBsaWVkIHRvIGFsbCBsYW5ndWFnZXMuIFRoZSBwcmVmaXggaXMgd2hhdCBpc1xuXHQvLyB1c2VkIHRvIHRyaWdnZXIgdGhlIHNuaXBwZXQgYW5kIHRoZSBib2R5IHdpbGwgYmUgZXhwYW5kZWQgYW5kIGluc2VydGVkLiBQb3NzaWJsZSB2YXJpYWJsZXMgYXJlOlxuXHQvLyAkMSwgJDIgZm9yIHRhYiBzdG9wcywgJDAgZm9yIHRoZSBmaW5hbCBjdXJzb3IgcG9zaXRpb24sIGFuZCB7MTogbGFiZWx9LCB7IDI6IGFub3RoZXIgfSBmb3IgcGxhY2Vob2xkZXJzLlxuXHQvLyBQbGFjZWhvbGRlcnMgd2l0aCB0aGUgc2FtZSBpZHMgYXJlIGNvbm5lY3RlZC5cblx0Ly8gRXhhbXBsZTpcblx0Ly8gXCJQcmludCB0byBjb25zb2xlXCI6IHtcblx0Ly8gXHRcInNjb3BlXCI6IFwiamF2YXNjcmlwdCx0eXBlc2NyaXB0XCIsXG5cdC8vIFx0XCJwcmVmaXhcIjogXCJsb2dcIixcblx0Ly8gXHRcImJvZHlcIjogW1xuXHQvLyBcdFx0XCJjb25zb2xlLmxvZygnJDEnKTtcIixcblx0Ly8gXHRcdFwiJDJcIlxuXHQvLyBcdF0sXG5cdC8vIFx0XCJkZXNjcmlwdGlvblwiOiBcIkxvZyBvdXRwdXQgdG8gY29uc29sZVwiXG5cdC8vIH1cbn1gO1xuXG5zdWl0ZSgnU25pcHBldHNTeW5jJywgKCkgPT4ge1xuXG5cdGNvbnN0IHNlcnZlciA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdGxldCB0ZXN0Q2xpZW50OiBVc2VyRGF0YVN5bmNDbGllbnQ7XG5cdGxldCBjbGllbnQyOiBVc2VyRGF0YVN5bmNDbGllbnQ7XG5cblx0bGV0IHRlc3RPYmplY3Q6IFNuaXBwZXRzU3luY2hyb25pc2VyO1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKS5jbGVhcigpO1xuXHR9KTtcblxuXHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0dGVzdENsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRhd2FpdCB0ZXN0Q2xpZW50LnNldFVwKHRydWUpO1xuXHRcdHRlc3RPYmplY3QgPSB0ZXN0Q2xpZW50LmdldFN5bmNocm9uaXplcihTeW5jUmVzb3VyY2UuU25pcHBldHMpIGFzIFNuaXBwZXRzU3luY2hyb25pc2VyO1xuXG5cdFx0Y2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHNuaXBwZXRzIGRvZXMgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBzbmlwcGV0c1Jlc291cmNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWU7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpLCBudWxsKTtcblx0XHRsZXQgbWFuaWZlc3QgPSBhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpO1xuXHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhtYW5pZmVzdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW10pO1xuXHRcdGFzc2VydC5vayghYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKHNuaXBwZXRzUmVzb3VyY2UpKTtcblxuXHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5yZWYsIHJlbW90ZVVzZXJEYXRhLnJlZik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSwgcmVtb3RlVXNlckRhdGEuc3luY0RhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSwgbnVsbCk7XG5cblx0XHRtYW5pZmVzdCA9IGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cyk7XG5cdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW10pO1xuXG5cdFx0bWFuaWZlc3QgPSBhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpO1xuXHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhtYW5pZmVzdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiBzbmlwcGV0IGlzIGNyZWF0ZWQgYWZ0ZXIgZmlyc3Qgc3luYycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCB0ZXN0Q2xpZW50KTtcblxuXHRcdGxldCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpO1xuXHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhtYW5pZmVzdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW1xuXHRcdFx0eyB0eXBlOiAnUE9TVCcsIHVybDogYCR7c2VydmVyLnVybH0vdjEvcmVzb3VyY2UvJHt0ZXN0T2JqZWN0LnJlc291cmNlfWAsIGhlYWRlcnM6IHsgJ0lmLU1hdGNoJzogbGFzdFN5bmNVc2VyRGF0YT8ucmVmIH0gfSxcblx0XHRdKTtcblxuXHRcdGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5yZWYsIHJlbW90ZVVzZXJEYXRhLnJlZik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSwgcmVtb3RlVXNlckRhdGEuc3luY0RhdGEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQsIEpTT04uc3RyaW5naWZ5KHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IHRpbWUgc3luYyAtIG91dGdvaW5nIHRvIHNlcnZlciAobm8gc25pcHBldHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgdGVzdENsaWVudCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VTbmlwcGV0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jIC0gaW5jb21pbmcgZnJvbSBzZXJ2ZXIgKG5vIHNuaXBwZXRzKScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRTbmlwcGV0KCdodG1sLmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgaHRtbFNuaXBwZXQxKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCB0c1NuaXBwZXQxKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jIHdoZW4gc25pcHBldHMgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQxLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2h0bWwuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBodG1sU25pcHBldDEpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIHRzU25pcHBldDEpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU25pcHBldHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IHRpbWUgc3luYyB3aGVuIHNuaXBwZXRzIGV4aXN0cyAtIGhhcyBjb25mbGljdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0Y29uc3QgbG9jYWwgPSBqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2h0bWwuanNvbicpO1xuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW2xvY2FsXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IHRpbWUgc3luYyB3aGVuIHNuaXBwZXRzIGV4aXN0cyAtIGhhcyBjb25mbGljdHMgYW5kIGFjY2VwdCBjb25mbGljdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXHRcdGNvbnN0IGNvbmZsaWN0cyA9IHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cztcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChjb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBodG1sU25pcHBldDEpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2h0bWwuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBodG1sU25pcHBldDEpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU25pcHBldHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jIHdoZW4gc25pcHBldHMgZXhpc3RzIC0gaGFzIG11bHRpcGxlIGNvbmZsaWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2NhbDEgPSBqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2h0bWwuanNvbicpO1xuXHRcdGNvbnN0IGxvY2FsMiA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAndHlwZXNjcmlwdC5qc29uJyk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbbG9jYWwxLCBsb2NhbDJdKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jIHdoZW4gc25pcHBldHMgZXhpc3RzIC0gaGFzIG11bHRpcGxlIGNvbmZsaWN0cyBhbmQgYWNjZXB0IG9uZSBjb25mbGljdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cblx0XHRsZXQgY29uZmxpY3RzID0gdGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KGNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UsIGh0bWxTbmlwcGV0Mik7XG5cblx0XHRjb25mbGljdHMgPSB0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0Y29uc3QgbG9jYWwgPSBqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3R5cGVzY3JpcHQuanNvbicpO1xuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW2xvY2FsXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IHRpbWUgc3luYyB3aGVuIHNuaXBwZXRzIGV4aXN0cyAtIGhhcyBtdWx0aXBsZSBjb25mbGljdHMgYW5kIGFjY2VwdCBhbGwgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGNvbnN0IGNvbmZsaWN0cyA9IHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cztcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChjb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBodG1sU25pcHBldDIpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KGNvbmZsaWN0c1sxXS5wcmV2aWV3UmVzb3VyY2UsIHRzU25pcHBldDEpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2h0bWwuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBodG1sU25pcHBldDIpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIHRzU25pcHBldDEpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU25pcHBldHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MiwgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgYWRkaW5nIGEgc25pcHBldCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkU25pcHBldCgnaHRtbC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIGh0bWxTbmlwcGV0MSk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgdHNTbmlwcGV0MSk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VTbmlwcGV0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAnaHRtbC5qc29uJzogaHRtbFNuaXBwZXQxLCAndHlwZXNjcmlwdC5qc29uJzogdHNTbmlwcGV0MSB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyBhZGRpbmcgYSBzbmlwcGV0IC0gYWNjZXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2h0bWwuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBodG1sU25pcHBldDEpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIHRzU25pcHBldDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHVwZGF0aW5nIGEgc25pcHBldCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRTbmlwcGV0KCdodG1sLmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgaHRtbFNuaXBwZXQyKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVNuaXBwZXRzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDIgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgdXBkYXRpbmcgYSBzbmlwcGV0IC0gYWNjZXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkU25pcHBldCgnaHRtbC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIGh0bWxTbmlwcGV0Mik7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgdXBkYXRpbmcgYSBzbmlwcGV0IC0gY29uZmxpY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDIsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQzLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0Y29uc3QgbG9jYWwgPSBqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2h0bWwuanNvbicpO1xuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW2xvY2FsXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgdXBkYXRpbmcgYSBzbmlwcGV0IC0gcmVzb2x2ZSBjb25mbGljdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MiwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDMsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBodG1sU25pcHBldDIpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2h0bWwuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBodG1sU25pcHBldDIpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU25pcHBldHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ2h0bWwuanNvbic6IGh0bWxTbmlwcGV0MiB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyByZW1vdmluZyBhIHNuaXBwZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQxLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cblx0XHRhd2FpdCByZW1vdmVTbmlwcGV0KCdodG1sLmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCB0c1NuaXBwZXQxKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2h0bWwuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBudWxsKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVNuaXBwZXRzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7ICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHJlbW92aW5nIGEgc25pcHBldCAtIGFjY2VwdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGF3YWl0IHJlbW92ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgdHNTbmlwcGV0MSk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRTbmlwcGV0KCdodG1sLmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgcmVtb3ZpbmcgYSBzbmlwcGV0IGxvY2FsbHkgYW5kIHVwZGF0aW5nIGl0IHJlbW90ZWx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHJlbW92ZVNuaXBwZXQoJ2h0bWwuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgdHNTbmlwcGV0MSk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRTbmlwcGV0KCdodG1sLmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgaHRtbFNuaXBwZXQyKTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyByZW1vdmluZyBhIHNuaXBwZXQgLSBjb25mbGljdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGF3YWl0IHJlbW92ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2NhbCA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnaHRtbC5qc29uJyk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbbG9jYWxdKTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyByZW1vdmluZyBhIHNuaXBwZXQgLSByZXNvbHZlIGNvbmZsaWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXG5cdFx0YXdhaXQgcmVtb3ZlU25pcHBldCgnaHRtbC5qc29uJywgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBodG1sU25pcHBldDMpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCB0c1NuaXBwZXQxKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2h0bWwuanNvbicsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBodG1sU25pcHBldDMpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU25pcHBldHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEsICdodG1sLmpzb24nOiBodG1sU25pcHBldDMgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgcmVtb3ZpbmcgYSBzbmlwcGV0IC0gcmVzb2x2ZSBjb25mbGljdCBieSByZW1vdmluZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblxuXHRcdGF3YWl0IHJlbW92ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSwgbnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIHRzU25pcHBldDEpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkU25pcHBldCgnaHRtbC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIG51bGwpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQgIT09IG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlU25pcHBldHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ3R5cGVzY3JpcHQuanNvbic6IHRzU25pcHBldDEgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgZ2xvYmFsIGFuZCBsYW5ndWFnZSBzbmlwcGV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2dsb2JhbC5jb2RlLXNuaXBwZXRzJywgZ2xvYmFsU25pcHBldCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkU25pcHBldCgnaHRtbC5qc29uJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIGh0bWxTbmlwcGV0MSk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRTbmlwcGV0KCdnbG9iYWwuY29kZS1zbmlwcGV0cycsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBnbG9iYWxTbmlwcGV0KTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVNuaXBwZXRzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7ICdodG1sLmpzb24nOiBodG1sU25pcHBldDEsICdnbG9iYWwuY29kZS1zbmlwcGV0cyc6IGdsb2JhbFNuaXBwZXQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgc2hvdWxkIGlnbm9yZSBub24gc25pcHBldHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnZ2xvYmFsLmNvZGUtc25pcHBldHMnLCBnbG9iYWxTbmlwcGV0LCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmh0bWwnLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgdHNTbmlwcGV0MSk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRTbmlwcGV0KCdnbG9iYWwuY29kZS1zbmlwcGV0cycsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBnbG9iYWxTbmlwcGV0KTtcblx0XHRjb25zdCBhY3R1YWwzID0gYXdhaXQgcmVhZFNuaXBwZXQoJ2h0bWwuaHRtbCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwzLCBudWxsKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVNuaXBwZXRzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7ICd0eXBlc2NyaXB0Lmpzb24nOiB0c1NuaXBwZXQxLCAnZ2xvYmFsLmNvZGUtc25pcHBldHMnOiBnbG9iYWxTbmlwcGV0IH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmV2aWV3cyBhcmUgcmVzZXQgYWZ0ZXIgYWxsIGNvbmZsaWN0cyByZXNvbHZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSk7XG5cblx0XHRjb25zdCBjb25mbGljdHMgPSB0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHM7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQoY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSwgaHRtbFNuaXBwZXQyKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2soIWF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhkaXJuYW1lKGNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gdGhlcmUgYXJlIG11bHRpcGxlIHNuaXBwZXRzIGFuZCBhbGwgc25pcHBldHMgYXJlIG1lcmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0Y29uc3QgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2h0bWwuanNvbicpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3R5cGVzY3JpcHQuanNvbicpLFxuXHRcdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgc25pcHBldHMgYW5kIGFsbCBzbmlwcGV0cyBhcmUgbWVyZ2VkIGFuZCBhcHBsaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSwgdHJ1ZSk7XG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2aWV3LCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHRoZXJlIGFyZSBtdWx0aXBsZSBzbmlwcGV0cyBhbmQgb25lIHNuaXBwZXQgaGFzIG5vIGNoYW5nZXMgYW5kIG9uZSBzbmlwcGV0IGlzIG1lcmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGNvbnN0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuU3luY2luZyk7XG5cdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICd0eXBlc2NyaXB0Lmpzb24nKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdodG1sLmpzb24nKSxcblx0XHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gdGhlcmUgYXJlIG11bHRpcGxlIHNuaXBwZXRzIGFuZCBvbmUgc25pcHBldCBoYXMgbm8gY2hhbmdlcyBhbmQgc25pcHBldHMgaXMgbWVyZ2VkIGFuZCBhcHBsaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGxldCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cyksIHRydWUpO1xuXG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2aWV3LCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHRoZXJlIGFyZSBtdWx0aXBsZSBzbmlwcGV0cyB3aXRoIGNvbmZsaWN0cyBhbmQgYWxsIHNuaXBwZXRzIGFyZSBtZXJnZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRjb25zdCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cyksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdodG1sLmpzb24nKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICd0eXBlc2NyaXB0Lmpzb24nKSxcblx0XHRcdF0pO1xuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdodG1sLmpzb24nKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICd0eXBlc2NyaXB0Lmpzb24nKSxcblx0XHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHQgd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgc25pcHBldHMgd2l0aCBjb25mbGljdHMgYW5kIG9ubHkgb25lIHNuaXBwZXQgaXMgYWNjZXB0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDEsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQyLCB0ZXN0Q2xpZW50KTtcblx0XHRsZXQgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuU25pcHBldHMpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydFByZXZpZXdzKHByZXZpZXchLnJlc291cmNlUHJldmlld3MsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnaHRtbC5qc29uJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAndHlwZXNjcmlwdC5qc29uJyksXG5cdFx0XHRdKTtcblx0XHRhc3NlcnRQcmV2aWV3cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnaHRtbC5qc29uJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAndHlwZXNjcmlwdC5qc29uJyksXG5cdFx0XHRdKTtcblxuXHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLnByZXZpZXdSZXNvdXJjZSwgaHRtbFNuaXBwZXQyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydFByZXZpZXdzKHByZXZpZXchLnJlc291cmNlUHJldmlld3MsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnaHRtbC5qc29uJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAndHlwZXNjcmlwdC5qc29uJyksXG5cdFx0XHRdKTtcblx0XHRhc3NlcnRQcmV2aWV3cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAndHlwZXNjcmlwdC5qc29uJyksXG5cdFx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXB0IHdoZW4gdGhlcmUgYXJlIG11bHRpcGxlIHNuaXBwZXRzIHdpdGggY29uZmxpY3RzIGFuZCBhbGwgc25pcHBldHMgYXJlIGFjY2VwdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgnaHRtbC5qc29uJywgaHRtbFNuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCd0eXBlc2NyaXB0Lmpzb24nLCB0c1NuaXBwZXQxLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MiwgdGVzdENsaWVudCk7XG5cdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlNuaXBwZXRzKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2h0bWwuanNvbicpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3R5cGVzY3JpcHQuanNvbicpLFxuXHRcdFx0XSk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2h0bWwuanNvbicpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3R5cGVzY3JpcHQuanNvbicpLFxuXHRcdFx0XSk7XG5cblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5wcmV2aWV3UmVzb3VyY2UsIGh0bWxTbmlwcGV0Mik7XG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMV0ucHJldmlld1Jlc291cmNlLCB0c1NuaXBwZXQyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2h0bWwuanNvbicpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3R5cGVzY3JpcHQuanNvbicpLFxuXHRcdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXB0IHdoZW4gdGhlcmUgYXJlIG11bHRpcGxlIHNuaXBwZXRzIHdpdGggY29uZmxpY3RzIGFuZCBhbGwgc25pcHBldHMgYXJlIGFjY2VwdGVkIGFuZCBhcHBsaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ2h0bWwuanNvbicsIGh0bWxTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlU25pcHBldCgndHlwZXNjcmlwdC5qc29uJywgdHNTbmlwcGV0MSwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVNuaXBwZXQoJ3R5cGVzY3JpcHQuanNvbicsIHRzU25pcHBldDIsIHRlc3RDbGllbnQpO1xuXHRcdGxldCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5TbmlwcGV0cyksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdodG1sLmpzb24nKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICd0eXBlc2NyaXB0Lmpzb24nKSxcblx0XHRcdF0pO1xuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdodG1sLmpzb24nKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICd0eXBlc2NyaXB0Lmpzb24nKSxcblx0XHRcdF0pO1xuXG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ucHJldmlld1Jlc291cmNlLCBodG1sU25pcHBldDIpO1xuXHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzFdLnByZXZpZXdSZXNvdXJjZSwgdHNTbmlwcGV0Mik7XG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2aWV3LCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHByb2ZpbGUgc25pcHBldHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdGNvbnN0IHByb2ZpbGUgPSBhd2FpdCBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmNyZWF0ZU5hbWVkUHJvZmlsZSgncHJvZmlsZTEnKTtcblx0XHRhd2FpdCB1cGRhdGVTbmlwcGV0KCdodG1sLmpzb24nLCBodG1sU25pcHBldDEsIGNsaWVudDIsIHByb2ZpbGUpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdGVzdENsaWVudC5zeW5jKCk7XG5cblx0XHRjb25zdCBzeW5jZWRQcm9maWxlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5wcm9maWxlcy5maW5kKHAgPT4gcC5pZCA9PT0gcHJvZmlsZS5pZCkhO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCByZWFkU25pcHBldCgnaHRtbC5qc29uJywgdGVzdENsaWVudCwgc3luY2VkUHJvZmlsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsIGh0bWxTbmlwcGV0MSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHBhcnNlU25pcHBldHMoY29udGVudDogc3RyaW5nKTogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiB7XG5cdFx0Y29uc3Qgc3luY0RhdGE6IElTeW5jRGF0YSA9IEpTT04ucGFyc2UoY29udGVudCk7XG5cdFx0cmV0dXJuIEpTT04ucGFyc2Uoc3luY0RhdGEuY29udGVudCk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiB1cGRhdGVTbmlwcGV0KG5hbWU6IHN0cmluZywgY29udGVudDogc3RyaW5nLCBjbGllbnQ6IFVzZXJEYXRhU3luY0NsaWVudCwgcHJvZmlsZT86IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBzbmlwcGV0c1Jlc291cmNlID0gam9pblBhdGgoKHByb2ZpbGUgPz8gdXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUpLnNuaXBwZXRzSG9tZSwgbmFtZSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNuaXBwZXRzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gcmVtb3ZlU25pcHBldChuYW1lOiBzdHJpbmcsIGNsaWVudDogVXNlckRhdGFTeW5jQ2xpZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSk7XG5cdFx0Y29uc3Qgc25pcHBldHNSZXNvdXJjZSA9IGpvaW5QYXRoKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSwgbmFtZSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuZGVsKHNuaXBwZXRzUmVzb3VyY2UpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gcmVhZFNuaXBwZXQobmFtZTogc3RyaW5nLCBjbGllbnQ6IFVzZXJEYXRhU3luY0NsaWVudCwgcHJvZmlsZT86IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBzbmlwcGV0c1Jlc291cmNlID0gam9pblBhdGgoKHByb2ZpbGUgPz8gdXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUpLnNuaXBwZXRzSG9tZSwgbmFtZSk7XG5cdFx0aWYgKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhzbmlwcGV0c1Jlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHNuaXBwZXRzUmVzb3VyY2UpO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRQcmV2aWV3cyhhY3R1YWw6IElSZXNvdXJjZVByZXZpZXdbXSwgZXhwZWN0ZWQ6IFVSSVtdKSB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubWFwKCh7IHByZXZpZXdSZXNvdXJjZSB9KSA9PiBwcmV2aWV3UmVzb3VyY2UudG9TdHJpbmcoKSksIGV4cGVjdGVkLm1hcCh1cmkgPT4gdXJpLnRvU3RyaW5nKCkpKTtcblx0fVxuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLFNBQVMsZ0JBQWdCO0FBRWxDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQTJCLGdDQUFnQztBQUUzRCxTQUFzQywyQkFBMkIsa0JBQWtCLGNBQWMsa0JBQWtCO0FBQ25ILFNBQVMsb0JBQW9CLDhCQUE4QjtBQUUzRCxNQUFNLGFB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
