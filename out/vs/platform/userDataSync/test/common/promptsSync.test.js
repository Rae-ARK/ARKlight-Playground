import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { IFileService } from "../../../files/common/files.js";
import { assertDefined } from "../../../../base/common/types.js";
import { dirname, joinPath } from "../../../../base/common/resources.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { IUserDataSyncStoreService, PREVIEW_DIR_NAME, SyncResource, SyncStatus } from "../../common/userDataSync.js";
const PROMPT1_TEXT = "Write a poem about a programmer who falls in love with their code.";
const PROMPT2_TEXT = "Explain quantum physics using only emojis and cat memes.";
const PROMPT3_TEXT = "Create a dialogue between a toaster and a refrigerator about their daily routines.";
const PROMPT4_TEXT = "Describe a day in the life of a rubber duck debugging session.";
const PROMPT5_TEXT = "Write a short story where a bug in the code becomes a superhero.";
const PROMPT6_TEXT = "Imagine a world where all software bugs are sentient.\nWhat do they talk about?";
suite("PromptsSync", () => {
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
    const maybeSynchronizer = testClient.getSynchronizer(SyncResource.Prompts);
    assertDefined(
      maybeSynchronizer,
      "Prompts synchronizer object must be defined."
    );
    testObject = maybeSynchronizer;
    client2 = disposableStore.add(new UserDataSyncClient(server));
    await client2.setUp(true);
  });
  test("when prompts does not exist", async () => {
    const fileService = testClient.instantiationService.get(IFileService);
    const promptsResource = testClient.instantiationService.get(IUserDataProfilesService).defaultProfile.promptsHome;
    assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
    let manifest = await testClient.getLatestRef(SyncResource.Prompts);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
    assert.ok(!await fileService.exists(promptsResource));
    const lastSyncUserData = await testObject.getLastSyncUserData();
    assertDefined(
      lastSyncUserData,
      "Last sync user data must be defined."
    );
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
    assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
    assert.strictEqual(lastSyncUserData.syncData, null);
    manifest = await testClient.getLatestRef(SyncResource.Prompts);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
    manifest = await testClient.getLatestRef(SyncResource.Prompts);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, []);
  });
  test("when prompt is created after first sync", async () => {
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, testClient);
    let lastSyncUserData = await testObject.getLastSyncUserData();
    const manifest = await testClient.getLatestRef(SyncResource.Prompts);
    server.reset();
    await testObject.sync(manifest);
    assert.deepStrictEqual(server.requests, [
      { type: "POST", url: `${server.url}/v1/resource/${testObject.resource}`, headers: { "If-Match": lastSyncUserData?.ref } }
    ]);
    lastSyncUserData = await testObject.getLastSyncUserData();
    assertDefined(
      lastSyncUserData,
      "Last sync user data must be defined."
    );
    const remoteUserData = await testObject.getRemoteUserData(null);
    assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
    assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
    assertDefined(
      lastSyncUserData.syncData,
      "Last sync user sync data must be defined."
    );
    assert.deepStrictEqual(
      lastSyncUserData.syncData.content,
      JSON.stringify({ "prompt3.prompt.md": PROMPT3_TEXT })
    );
  });
  test("first time sync - outgoing to server (no prompts)", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, testClient);
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(
      actual,
      {
        "prompt3.prompt.md": PROMPT3_TEXT,
        "prompt1.prompt.md": PROMPT1_TEXT
      }
    );
  });
  test("first time sync - incoming from server (no prompts)", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT3_TEXT);
    const actual2 = await readPrompt("prompt1.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT1_TEXT);
  });
  test("first time sync when prompts exists", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT3_TEXT);
    const actual2 = await readPrompt("prompt1.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT1_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(
      actual,
      {
        "prompt3.prompt.md": PROMPT3_TEXT,
        "prompt1.prompt.md": PROMPT1_TEXT
      }
    );
  });
  test("first time sync when prompts exists - has conflicts", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await updatePrompt("prompt3.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(
      environmentService.userDataSyncHome,
      testObject.resource,
      PREVIEW_DIR_NAME,
      "prompt3.prompt.md"
    );
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("first time sync when prompts exists - has conflicts and accept conflicts", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await updatePrompt("prompt3.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    const conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, PROMPT3_TEXT);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT3_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "prompt3.prompt.md": PROMPT3_TEXT });
  });
  test("first time sync when prompts exists - has multiple conflicts", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("prompt3.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("prompt1.prompt.md", PROMPT2_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local1 = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "prompt3.prompt.md");
    const local2 = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "prompt1.prompt.md");
    assertPreviews(testObject.conflicts.conflicts, [local1, local2]);
  });
  test("first time sync when prompts exists - has multiple conflicts and accept one conflict", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("prompt3.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("prompt1.prompt.md", PROMPT2_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    let conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, PROMPT4_TEXT);
    conflicts = testObject.conflicts.conflicts;
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "prompt1.prompt.md");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("first time sync when prompts exists - has multiple conflicts and accept all conflicts", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("prompt3.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("prompt1.prompt.md", PROMPT2_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    const conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, PROMPT4_TEXT);
    await testObject.accept(conflicts[1].previewResource, PROMPT1_TEXT);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT4_TEXT);
    const actual2 = await readPrompt("prompt1.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT1_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "prompt3.prompt.md": PROMPT4_TEXT, "prompt1.prompt.md": PROMPT1_TEXT });
  });
  test("sync adding a prompt", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT3_TEXT);
    const actual2 = await readPrompt("prompt1.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT1_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "prompt3.prompt.md": PROMPT3_TEXT, "prompt1.prompt.md": PROMPT1_TEXT });
  });
  test("sync adding a prompt - accept", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("prompt1.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT3_TEXT);
    const actual2 = await readPrompt("prompt1.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT1_TEXT);
  });
  test("sync updating a prompt", async () => {
    await updatePrompt("default.prompt.md", PROMPT3_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("default.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("default.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT4_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "default.prompt.md": PROMPT4_TEXT });
  });
  test("sync updating a prompt - accept", async () => {
    await updatePrompt("my.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("my.prompt.md", PROMPT4_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("my.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT4_TEXT);
  });
  test("sync updating a prompt - conflict", async () => {
    await updatePrompt("some.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("some.prompt.md", PROMPT4_TEXT, client2);
    await client2.sync();
    await updatePrompt("some.prompt.md", PROMPT5_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "some.prompt.md");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("sync updating a prompt - resolve conflict", async () => {
    await updatePrompt("advanced.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("advanced.prompt.md", PROMPT4_TEXT, client2);
    await client2.sync();
    await updatePrompt("advanced.prompt.md", PROMPT5_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await testObject.accept(testObject.conflicts.conflicts[0].previewResource, PROMPT4_TEXT);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("advanced.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT4_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "advanced.prompt.md": PROMPT4_TEXT });
  });
  test("sync removing a prompt", async () => {
    await updatePrompt("another.prompt.md", PROMPT3_TEXT, testClient);
    await updatePrompt("chat.prompt.md", PROMPT1_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await removePrompt("another.prompt.md", testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("chat.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT1_TEXT);
    const actual2 = await readPrompt("another.prompt.md", testClient);
    assert.strictEqual(actual2, null);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "chat.prompt.md": PROMPT1_TEXT });
  });
  test("sync removing a prompt - accept", async () => {
    await updatePrompt("my-query.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("summarize.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await removePrompt("my-query.prompt.md", client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("summarize.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT1_TEXT);
    const actual2 = await readPrompt("my-query.prompt.md", testClient);
    assert.strictEqual(actual2, null);
  });
  test("sync removing a prompt locally and updating it remotely", async () => {
    await updatePrompt("some.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("important.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await updatePrompt("some.prompt.md", PROMPT4_TEXT, client2);
    await client2.sync();
    await removePrompt("some.prompt.md", testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("important.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT1_TEXT);
    const actual2 = await readPrompt("some.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT4_TEXT);
  });
  test("sync removing a prompt - conflict", async () => {
    await updatePrompt("common.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("rare.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await removePrompt("common.prompt.md", client2);
    await client2.sync();
    await updatePrompt("common.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "common.prompt.md");
    assertPreviews(testObject.conflicts.conflicts, [local]);
  });
  test("sync removing a prompt - resolve conflict", async () => {
    await updatePrompt("uncommon.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("hot.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await removePrompt("uncommon.prompt.md", client2);
    await client2.sync();
    await updatePrompt("uncommon.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await testObject.accept(testObject.conflicts.conflicts[0].previewResource, PROMPT5_TEXT);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("hot.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT1_TEXT);
    const actual2 = await readPrompt("uncommon.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT5_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "hot.prompt.md": PROMPT1_TEXT, "uncommon.prompt.md": PROMPT5_TEXT });
  });
  test("sync removing a prompt - resolve conflict by removing", async () => {
    await updatePrompt("prompt3.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("refactor.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await removePrompt("prompt3.prompt.md", client2);
    await client2.sync();
    await updatePrompt("prompt3.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    await testObject.accept(testObject.conflicts.conflicts[0].previewResource, null);
    await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("refactor.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT1_TEXT);
    const actual2 = await readPrompt("prompt3.prompt.md", testClient);
    assert.strictEqual(actual2, null);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "refactor.prompt.md": PROMPT1_TEXT });
  });
  test("sync prompts", async () => {
    await updatePrompt("first.prompt.md", PROMPT6_TEXT, client2);
    await updatePrompt("roaming.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("roaming.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT3_TEXT);
    const actual2 = await readPrompt("first.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT6_TEXT);
    const { content } = await testClient.read(testObject.resource);
    assertDefined(
      content,
      "Test object content must be defined."
    );
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "roaming.prompt.md": PROMPT3_TEXT, "first.prompt.md": PROMPT6_TEXT });
  });
  test("sync should ignore non prompts", async () => {
    await updatePrompt("my.prompt.md", PROMPT6_TEXT, client2);
    await updatePrompt("html.html", PROMPT3_TEXT, client2);
    await updatePrompt("shared.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    const actual1 = await readPrompt("shared.prompt.md", testClient);
    assert.strictEqual(actual1, PROMPT1_TEXT);
    const actual2 = await readPrompt("my.prompt.md", testClient);
    assert.strictEqual(actual2, PROMPT6_TEXT);
    const actual3 = await readPrompt("html.html", testClient);
    assert.strictEqual(actual3, null);
    const { content } = await testClient.read(testObject.resource);
    assert.ok(content !== null);
    const actual = parsePrompts(content);
    assert.deepStrictEqual(actual, { "shared.prompt.md": PROMPT1_TEXT, "my.prompt.md": PROMPT6_TEXT });
  });
  test("previews are reset after all conflicts resolved", async () => {
    await updatePrompt("html.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("css.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("html.prompt.md", PROMPT4_TEXT, testClient);
    await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts));
    const conflicts = testObject.conflicts.conflicts;
    await testObject.accept(conflicts[0].previewResource, PROMPT4_TEXT);
    await testObject.apply(false);
    const fileService = testClient.instantiationService.get(IFileService);
    assert.ok(!await fileService.exists(dirname(conflicts[0].previewResource)));
  });
  test("merge when there are multiple prompts and all prompts are merged", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updatePrompt("sublime.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("tests.prompt.md", PROMPT2_TEXT, testClient);
    const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "sublime.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "tests.prompt.md")
      ]
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple prompts and all prompts are merged and applied", async () => {
    await updatePrompt("short.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("long.prompt.md", PROMPT2_TEXT, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    preview = await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.strictEqual(preview, null);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple prompts and one prompt has no changes and one prompt is merged", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updatePrompt("coding.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await updatePrompt("coding.prompt.md", PROMPT3_TEXT, testClient);
    await updatePrompt("exploring.prompt.md", PROMPT2_TEXT, testClient);
    const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "exploring.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "coding.prompt.md")
      ]
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple prompts and one prompt has no changes and prompts is merged and applied", async () => {
    await updatePrompt("quick.prompt.md", PROMPT3_TEXT, client2);
    await client2.sync();
    await updatePrompt("quick.prompt.md", PROMPT3_TEXT, testClient);
    await updatePrompt("databases.prompt.md", PROMPT2_TEXT, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    preview = await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.strictEqual(preview, null);
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("merge when there are multiple prompts with conflicts and all prompts are merged", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updatePrompt("reverse.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("recycle.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("reverse.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("recycle.prompt.md", PROMPT2_TEXT, testClient);
    const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "reverse.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "recycle.prompt.md")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "reverse.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "recycle.prompt.md")
      ]
    );
  });
  test("accept when there are multiple prompts with conflicts and only one prompt is accepted", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updatePrompt("current.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("future.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("current.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("future.prompt.md", PROMPT2_TEXT, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "current.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "future.prompt.md")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "current.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "future.prompt.md")
      ]
    );
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource, PROMPT4_TEXT);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "current.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "future.prompt.md")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "future.prompt.md")
      ]
    );
  });
  test("accept when there are multiple prompts with conflicts and all prompts are accepted", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updatePrompt("dynamic.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("static.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("dynamic.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("static.prompt.md", PROMPT2_TEXT, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "dynamic.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "static.prompt.md")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "dynamic.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "static.prompt.md")
      ]
    );
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource, PROMPT4_TEXT);
    preview = await testObject.accept(preview.resourcePreviews[1].previewResource, PROMPT2_TEXT);
    assert.strictEqual(testObject.status, SyncStatus.Syncing);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "dynamic.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "static.prompt.md")
      ]
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("accept when there are multiple prompts with conflicts and all prompts are accepted and applied", async () => {
    const environmentService = testClient.instantiationService.get(IEnvironmentService);
    await updatePrompt("edicational.prompt.md", PROMPT3_TEXT, client2);
    await updatePrompt("unknown.prompt.md", PROMPT1_TEXT, client2);
    await client2.sync();
    await updatePrompt("edicational.prompt.md", PROMPT4_TEXT, testClient);
    await updatePrompt("unknown.prompt.md", PROMPT2_TEXT, testClient);
    let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Prompts), true);
    assertDefined(
      preview,
      "Preview must be defined."
    );
    assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
    assertPreviews(
      preview.resourcePreviews,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "edicational.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "unknown.prompt.md")
      ]
    );
    assertPreviews(
      testObject.conflicts.conflicts,
      [
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "edicational.prompt.md"),
        joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, "unknown.prompt.md")
      ]
    );
    preview = await testObject.accept(preview.resourcePreviews[0].previewResource, PROMPT4_TEXT);
    assertDefined(
      preview,
      "Preview must be defined after accept."
    );
    preview = await testObject.accept(preview.resourcePreviews[1].previewResource, PROMPT2_TEXT);
    preview = await testObject.apply(false);
    assert.strictEqual(testObject.status, SyncStatus.Idle);
    assert.strictEqual(
      preview,
      null,
      "Preview after the last apply must be `null`."
    );
    assert.deepStrictEqual(testObject.conflicts.conflicts, []);
  });
  test("sync profile prompts", async () => {
    const client22 = disposableStore.add(new UserDataSyncClient(server));
    await client22.setUp(true);
    const profile = await client22.instantiationService.get(IUserDataProfilesService).createNamedProfile("profile1");
    await updatePrompt("my.prompt.md", PROMPT3_TEXT, client22, profile);
    await client22.sync();
    await testClient.sync();
    const syncedProfile = testClient.instantiationService.get(IUserDataProfilesService).profiles.find((p) => p.id === profile.id);
    const content = await readPrompt("my.prompt.md", testClient, syncedProfile);
    assert.strictEqual(content, PROMPT3_TEXT);
  });
  function parsePrompts(content) {
    const syncData = JSON.parse(content);
    return JSON.parse(syncData.content);
  }
  async function updatePrompt(name, content, client, profile) {
    const fileService = client.instantiationService.get(IFileService);
    const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
    const promptsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).promptsHome, name);
    await fileService.writeFile(promptsResource, VSBuffer.fromString(content));
  }
  async function removePrompt(name, client) {
    const fileService = client.instantiationService.get(IFileService);
    const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
    const promptsResource = joinPath(userDataProfilesService.defaultProfile.promptsHome, name);
    await fileService.del(promptsResource);
  }
  async function readPrompt(name, client, profile) {
    const fileService = client.instantiationService.get(IFileService);
    const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
    const promptsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).promptsHome, name);
    if (await fileService.exists(promptsResource)) {
      const content = await fileService.readFile(promptsResource);
      return content.value.toString();
    }
    return null;
  }
  function assertPreviews(actual, expected) {
    assert.deepStrictEqual(
      actual.map(({ previewResource }) => previewResource.toString()),
      expected.map((uri) => uri.toString())
    );
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy90ZXN0L2NvbW1vbi9wcm9tcHRzU3luYy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnREZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzU3luY2hyb25pemVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdHNTeW5jL3Byb21wdHNTeW5jLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFTeW5jQ2xpZW50LCBVc2VyRGF0YVN5bmNUZXN0U2VydmVyIH0gZnJvbSAnLi91c2VyRGF0YVN5bmNDbGllbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VQcmV2aWV3LCBJU3luY0RhdGEsIElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIFBSRVZJRVdfRElSX05BTUUsIFN5bmNSZXNvdXJjZSwgU3luY1N0YXR1cyB9IGZyb20gJy4uLy4uL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuXG5jb25zdCBQUk9NUFQxX1RFWFQgPSAnV3JpdGUgYSBwb2VtIGFib3V0IGEgcHJvZ3JhbW1lciB3aG8gZmFsbHMgaW4gbG92ZSB3aXRoIHRoZWlyIGNvZGUuJztcbmNvbnN0IFBST01QVDJfVEVYVCA9ICdFeHBsYWluIHF1YW50dW0gcGh5c2ljcyB1c2luZyBvbmx5IGVtb2ppcyBhbmQgY2F0IG1lbWVzLic7XG5jb25zdCBQUk9NUFQzX1RFWFQgPSAnQ3JlYXRlIGEgZGlhbG9ndWUgYmV0d2VlbiBhIHRvYXN0ZXIgYW5kIGEgcmVmcmlnZXJhdG9yIGFib3V0IHRoZWlyIGRhaWx5IHJvdXRpbmVzLic7XG5jb25zdCBQUk9NUFQ0X1RFWFQgPSAnRGVzY3JpYmUgYSBkYXkgaW4gdGhlIGxpZmUgb2YgYSBydWJiZXIgZHVjayBkZWJ1Z2dpbmcgc2Vzc2lvbi4nO1xuY29uc3QgUFJPTVBUNV9URVhUID0gJ1dyaXRlIGEgc2hvcnQgc3Rvcnkgd2hlcmUgYSBidWcgaW4gdGhlIGNvZGUgYmVjb21lcyBhIHN1cGVyaGVyby4nO1xuY29uc3QgUFJPTVBUNl9URVhUID0gJ0ltYWdpbmUgYSB3b3JsZCB3aGVyZSBhbGwgc29mdHdhcmUgYnVncyBhcmUgc2VudGllbnQuXFxuV2hhdCBkbyB0aGV5IHRhbGsgYWJvdXQ/Jztcblxuc3VpdGUoJ1Byb21wdHNTeW5jJywgKCkgPT4ge1xuXHRjb25zdCBzZXJ2ZXIgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRsZXQgdGVzdENsaWVudDogVXNlckRhdGFTeW5jQ2xpZW50O1xuXHRsZXQgY2xpZW50MjogVXNlckRhdGFTeW5jQ2xpZW50O1xuXG5cdGxldCB0ZXN0T2JqZWN0OiBQcm9tcHRzU3luY2hyb25pemVyO1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKS5jbGVhcigpO1xuXHR9KTtcblxuXHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0dGVzdENsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRhd2FpdCB0ZXN0Q2xpZW50LnNldFVwKHRydWUpO1xuXG5cdFx0Y29uc3QgbWF5YmVTeW5jaHJvbml6ZXIgPSB0ZXN0Q2xpZW50LmdldFN5bmNocm9uaXplcihTeW5jUmVzb3VyY2UuUHJvbXB0cykgYXMgKFByb21wdHNTeW5jaHJvbml6ZXIgfCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0RGVmaW5lZChcblx0XHRcdG1heWJlU3luY2hyb25pemVyLFxuXHRcdFx0J1Byb21wdHMgc3luY2hyb25pemVyIG9iamVjdCBtdXN0IGJlIGRlZmluZWQuJyxcblx0XHQpO1xuXG5cdFx0dGVzdE9iamVjdCA9IG1heWJlU3luY2hyb25pemVyO1xuXG5cdFx0Y2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHByb21wdHMgZG9lcyBub3QgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb21wdHNSZXNvdXJjZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUucHJvbXB0c0hvbWU7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpLCBudWxsKTtcblx0XHRsZXQgbWFuaWZlc3QgPSBhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cyk7XG5cdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cdFx0YXNzZXJ0Lm9rKCEoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKHByb21wdHNSZXNvdXJjZSkpKTtcblxuXHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblxuXHRcdGFzc2VydERlZmluZWQoXG5cdFx0XHRsYXN0U3luY1VzZXJEYXRhLFxuXHRcdFx0J0xhc3Qgc3luYyB1c2VyIGRhdGEgbXVzdCBiZSBkZWZpbmVkLicsXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEucmVmLCByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSwgcmVtb3RlVXNlckRhdGEuc3luY0RhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhLnN5bmNEYXRhLCBudWxsKTtcblxuXHRcdG1hbmlmZXN0ID0gYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpO1xuXHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhtYW5pZmVzdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtdKTtcblxuXHRcdG1hbmlmZXN0ID0gYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpO1xuXHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhtYW5pZmVzdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiBwcm9tcHQgaXMgY3JlYXRlZCBhZnRlciBmaXJzdCBzeW5jJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIHRlc3RDbGllbnQpO1xuXG5cdFx0bGV0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKTtcblx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMobWFuaWZlc3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtcblx0XHRcdHsgdHlwZTogJ1BPU1QnLCB1cmw6IGAke3NlcnZlci51cmx9L3YxL3Jlc291cmNlLyR7dGVzdE9iamVjdC5yZXNvdXJjZX1gLCBoZWFkZXJzOiB7ICdJZi1NYXRjaCc6IGxhc3RTeW5jVXNlckRhdGE/LnJlZiB9IH0sXG5cdFx0XSk7XG5cblx0XHRsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cblx0XHRhc3NlcnREZWZpbmVkKFxuXHRcdFx0bGFzdFN5bmNVc2VyRGF0YSxcblx0XHRcdCdMYXN0IHN5bmMgdXNlciBkYXRhIG11c3QgYmUgZGVmaW5lZC4nLFxuXHRcdCk7XG5cblx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhLnJlZiwgcmVtb3RlVXNlckRhdGEucmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEsIHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhKTtcblxuXHRcdGFzc2VydERlZmluZWQoXG5cdFx0XHRsYXN0U3luY1VzZXJEYXRhLnN5bmNEYXRhLFxuXHRcdFx0J0xhc3Qgc3luYyB1c2VyIHN5bmMgZGF0YSBtdXN0IGJlIGRlZmluZWQuJyxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEuY29udGVudCxcblx0XHRcdEpTT04uc3RyaW5naWZ5KHsgJ3Byb21wdDMucHJvbXB0Lm1kJzogUFJPTVBUM19URVhUIH0pLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IHRpbWUgc3luYyAtIG91dGdvaW5nIHRvIHNlcnZlciAobm8gcHJvbXB0cyknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQxLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgdGVzdENsaWVudCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydERlZmluZWQoXG5cdFx0XHRjb250ZW50LFxuXHRcdFx0J1Rlc3Qgb2JqZWN0IGNvbnRlbnQgbXVzdCBiZSBkZWZpbmVkLicsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlUHJvbXB0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0YWN0dWFsLFxuXHRcdFx0e1xuXHRcdFx0XHQncHJvbXB0My5wcm9tcHQubWQnOiBQUk9NUFQzX1RFWFQsXG5cdFx0XHRcdCdwcm9tcHQxLnByb21wdC5tZCc6IFBST01QVDFfVEVYVCxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJzdCB0aW1lIHN5bmMgLSBpbmNvbWluZyBmcm9tIHNlcnZlciAobm8gcHJvbXB0cyknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQxLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBQUk9NUFQzX1RFWFQpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkUHJvbXB0KCdwcm9tcHQxLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBQUk9NUFQxX1RFWFQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJzdCB0aW1lIHN5bmMgd2hlbiBwcm9tcHRzIGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0MS5wcm9tcHQubWQnLCBQUk9NUFQxX1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIFBST01QVDNfVEVYVCk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRQcm9tcHQoJ3Byb21wdDEucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIFBST01QVDFfVEVYVCk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnREZWZpbmVkKFxuXHRcdFx0Y29udGVudCxcblx0XHRcdCdUZXN0IG9iamVjdCBjb250ZW50IG11c3QgYmUgZGVmaW5lZC4nLFxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVByb21wdHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGFjdHVhbCxcblx0XHRcdHtcblx0XHRcdFx0J3Byb21wdDMucHJvbXB0Lm1kJzogUFJPTVBUM19URVhULFxuXHRcdFx0XHQncHJvbXB0MS5wcm9tcHQubWQnOiBQUk9NUFQxX1RFWFQsXG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jIHdoZW4gcHJvbXB0cyBleGlzdHMgLSBoYXMgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDRfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblxuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvY2FsID0gam9pblBhdGgoXG5cdFx0XHRlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSxcblx0XHRcdHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsXG5cdFx0XHQncHJvbXB0My5wcm9tcHQubWQnLFxuXHRcdCk7XG5cblx0XHRhc3NlcnRQcmV2aWV3cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtsb2NhbF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJzdCB0aW1lIHN5bmMgd2hlbiBwcm9tcHRzIGV4aXN0cyAtIGhhcyBjb25mbGljdHMgYW5kIGFjY2VwdCBjb25mbGljdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblx0XHRjb25zdCBjb25mbGljdHMgPSB0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHM7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQoY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSwgUFJPTVBUM19URVhUKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIFBST01QVDNfVEVYVCk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnREZWZpbmVkKFxuXHRcdFx0Y29udGVudCxcblx0XHRcdCdUZXN0IG9iamVjdCBjb250ZW50IG11c3QgYmUgZGVmaW5lZC4nLFxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVByb21wdHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ3Byb21wdDMucHJvbXB0Lm1kJzogUFJPTVBUM19URVhUIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJzdCB0aW1lIHN5bmMgd2hlbiBwcm9tcHRzIGV4aXN0cyAtIGhhcyBtdWx0aXBsZSBjb25mbGljdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQxLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDEucHJvbXB0Lm1kJywgUFJPTVBUMl9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvY2FsMSA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAncHJvbXB0My5wcm9tcHQubWQnKTtcblx0XHRjb25zdCBsb2NhbDIgPSBqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3Byb21wdDEucHJvbXB0Lm1kJyk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbbG9jYWwxLCBsb2NhbDJdKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jIHdoZW4gcHJvbXB0cyBleGlzdHMgLSBoYXMgbXVsdGlwbGUgY29uZmxpY3RzIGFuZCBhY2NlcHQgb25lIGNvbmZsaWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0MS5wcm9tcHQubWQnLCBQUk9NUFQxX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDRfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQxLnByb21wdC5tZCcsIFBST01QVDJfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRsZXQgY29uZmxpY3RzID0gdGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KGNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UsIFBST01QVDRfVEVYVCk7XG5cblx0XHRjb25mbGljdHMgPSB0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0Y29uc3QgbG9jYWwgPSBqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3Byb21wdDEucHJvbXB0Lm1kJyk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbbG9jYWxdKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jIHdoZW4gcHJvbXB0cyBleGlzdHMgLSBoYXMgbXVsdGlwbGUgY29uZmxpY3RzIGFuZCBhY2NlcHQgYWxsIGNvbmZsaWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Byb21wdDEucHJvbXB0Lm1kJywgUFJPTVBUMV9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCBQUk9NUFQ0X1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0MS5wcm9tcHQubWQnLCBQUk9NUFQyX1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXG5cdFx0Y29uc3QgY29uZmxpY3RzID0gdGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KGNvbmZsaWN0c1swXS5wcmV2aWV3UmVzb3VyY2UsIFBST01QVDRfVEVYVCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQoY29uZmxpY3RzWzFdLnByZXZpZXdSZXNvdXJjZSwgUFJPTVBUMV9URVhUKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRQcm9tcHQoJ3Byb21wdDMucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIFBST01QVDRfVEVYVCk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRQcm9tcHQoJ3Byb21wdDEucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIFBST01QVDFfVEVYVCk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnREZWZpbmVkKFxuXHRcdFx0Y29udGVudCxcblx0XHRcdCdUZXN0IG9iamVjdCBjb250ZW50IG11c3QgYmUgZGVmaW5lZC4nLFxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVByb21wdHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ3Byb21wdDMucHJvbXB0Lm1kJzogUFJPTVBUNF9URVhULCAncHJvbXB0MS5wcm9tcHQubWQnOiBQUk9NUFQxX1RFWFQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgYWRkaW5nIGEgcHJvbXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQxLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgUFJPTVBUM19URVhUKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFByb21wdCgncHJvbXB0MS5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgUFJPTVBUMV9URVhUKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVByb21wdHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ3Byb21wdDMucHJvbXB0Lm1kJzogUFJPTVBUM19URVhULCAncHJvbXB0MS5wcm9tcHQubWQnOiBQUk9NUFQxX1RFWFQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgYWRkaW5nIGEgcHJvbXB0IC0gYWNjZXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQxLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBQUk9NUFQzX1RFWFQpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkUHJvbXB0KCdwcm9tcHQxLnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBQUk9NUFQxX1RFWFQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHVwZGF0aW5nIGEgcHJvbXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnZGVmYXVsdC5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdkZWZhdWx0LnByb21wdC5tZCcsIFBST01QVDRfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFByb21wdCgnZGVmYXVsdC5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgUFJPTVBUNF9URVhUKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVByb21wdHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ2RlZmF1bHQucHJvbXB0Lm1kJzogUFJPTVBUNF9URVhUIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHVwZGF0aW5nIGEgcHJvbXB0IC0gYWNjZXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnbXkucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnbXkucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRQcm9tcHQoJ215LnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBQUk9NUFQ0X1RFWFQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHVwZGF0aW5nIGEgcHJvbXB0IC0gY29uZmxpY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdzb21lLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3NvbWUucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnc29tZS5wcm9tcHQubWQnLCBQUk9NUFQ1X1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvY2FsID0gam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdzb21lLnByb21wdC5tZCcpO1xuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW2xvY2FsXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgdXBkYXRpbmcgYSBwcm9tcHQgLSByZXNvbHZlIGNvbmZsaWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnYWR2YW5jZWQucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnYWR2YW5jZWQucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnYWR2YW5jZWQucHJvbXB0Lm1kJywgUFJPTVBUNV9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBQUk9NUFQ0X1RFWFQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFByb21wdCgnYWR2YW5jZWQucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIFBST01QVDRfVEVYVCk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnQub2soY29udGVudCAhPT0gbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VQcm9tcHRzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7ICdhZHZhbmNlZC5wcm9tcHQubWQnOiBQUk9NUFQ0X1RFWFQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgcmVtb3ZpbmcgYSBwcm9tcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdhbm90aGVyLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdjaGF0LnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRhd2FpdCByZW1vdmVQcm9tcHQoJ2Fub3RoZXIucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFByb21wdCgnY2hhdC5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgUFJPTVBUMV9URVhUKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFByb21wdCgnYW5vdGhlci5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgbnVsbCk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnREZWZpbmVkKFxuXHRcdFx0Y29udGVudCxcblx0XHRcdCdUZXN0IG9iamVjdCBjb250ZW50IG11c3QgYmUgZGVmaW5lZC4nLFxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVByb21wdHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ2NoYXQucHJvbXB0Lm1kJzogUFJPTVBUMV9URVhUIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHJlbW92aW5nIGEgcHJvbXB0IC0gYWNjZXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnbXktcXVlcnkucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3N1bW1hcml6ZS5wcm9tcHQubWQnLCBQUk9NUFQxX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXG5cdFx0YXdhaXQgcmVtb3ZlUHJvbXB0KCdteS1xdWVyeS5wcm9tcHQubWQnLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRQcm9tcHQoJ3N1bW1hcml6ZS5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgUFJPTVBUMV9URVhUKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFByb21wdCgnbXktcXVlcnkucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHJlbW92aW5nIGEgcHJvbXB0IGxvY2FsbHkgYW5kIHVwZGF0aW5nIGl0IHJlbW90ZWx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnc29tZS5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnaW1wb3J0YW50LnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3NvbWUucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHJlbW92ZVByb21wdCgnc29tZS5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRQcm9tcHQoJ2ltcG9ydGFudC5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgUFJPTVBUMV9URVhUKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFByb21wdCgnc29tZS5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgUFJPTVBUNF9URVhUKTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyByZW1vdmluZyBhIHByb21wdCAtIGNvbmZsaWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnY29tbW9uLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdyYXJlLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRhd2FpdCByZW1vdmVQcm9tcHQoJ2NvbW1vbi5wcm9tcHQubWQnLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnY29tbW9uLnByb21wdC5tZCcsIFBST01QVDRfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2NhbCA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnY29tbW9uLnByb21wdC5tZCcpO1xuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW2xvY2FsXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgcmVtb3ZpbmcgYSBwcm9tcHQgLSByZXNvbHZlIGNvbmZsaWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgndW5jb21tb24ucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2hvdC5wcm9tcHQubWQnLCBQUk9NUFQxX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXG5cdFx0YXdhaXQgcmVtb3ZlUHJvbXB0KCd1bmNvbW1vbi5wcm9tcHQubWQnLCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgndW5jb21tb24ucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBQUk9NUFQ1X1RFWFQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgcmVhZFByb21wdCgnaG90LnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBQUk9NUFQxX1RFWFQpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCByZWFkUHJvbXB0KCd1bmNvbW1vbi5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgUFJPTVBUNV9URVhUKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydERlZmluZWQoXG5cdFx0XHRjb250ZW50LFxuXHRcdFx0J1Rlc3Qgb2JqZWN0IGNvbnRlbnQgbXVzdCBiZSBkZWZpbmVkLicsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHBhcnNlUHJvbXB0cyhjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyAnaG90LnByb21wdC5tZCc6IFBST01QVDFfVEVYVCwgJ3VuY29tbW9uLnByb21wdC5tZCc6IFBST01QVDVfVEVYVCB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyByZW1vdmluZyBhIHByb21wdCAtIHJlc29sdmUgY29uZmxpY3QgYnkgcmVtb3ZpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdyZWZhY3Rvci5wcm9tcHQubWQnLCBQUk9NUFQxX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXG5cdFx0YXdhaXQgcmVtb3ZlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdwcm9tcHQzLnByb21wdC5tZCcsIFBST01QVDRfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSwgbnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCByZWFkUHJvbXB0KCdyZWZhY3Rvci5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgUFJPTVBUMV9URVhUKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFByb21wdCgncHJvbXB0My5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgbnVsbCk7XG5cblx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRlc3RDbGllbnQucmVhZCh0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRhc3NlcnREZWZpbmVkKFxuXHRcdFx0Y29udGVudCxcblx0XHRcdCdUZXN0IG9iamVjdCBjb250ZW50IG11c3QgYmUgZGVmaW5lZC4nLFxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVByb21wdHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ3JlZmFjdG9yLnByb21wdC5tZCc6IFBST01QVDFfVEVYVCB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyBwcm9tcHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnZmlyc3QucHJvbXB0Lm1kJywgUFJPTVBUNl9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3JvYW1pbmcucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRQcm9tcHQoJ3JvYW1pbmcucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIFBST01QVDNfVEVYVCk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHJlYWRQcm9tcHQoJ2ZpcnN0LnByb21wdC5tZCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLCBQUk9NUFQ2X1RFWFQpO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0ZXN0Q2xpZW50LnJlYWQodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0RGVmaW5lZChcblx0XHRcdGNvbnRlbnQsXG5cdFx0XHQnVGVzdCBvYmplY3QgY29udGVudCBtdXN0IGJlIGRlZmluZWQuJyxcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VQcm9tcHRzKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7ICdyb2FtaW5nLnByb21wdC5tZCc6IFBST01QVDNfVEVYVCwgJ2ZpcnN0LnByb21wdC5tZCc6IFBST01QVDZfVEVYVCB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyBzaG91bGQgaWdub3JlIG5vbiBwcm9tcHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnbXkucHJvbXB0Lm1kJywgUFJPTVBUNl9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2h0bWwuaHRtbCcsIFBST01QVDNfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdzaGFyZWQucHJvbXB0Lm1kJywgUFJPTVBUMV9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHJlYWRQcm9tcHQoJ3NoYXJlZC5wcm9tcHQubWQnLCB0ZXN0Q2xpZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMSwgUFJPTVBUMV9URVhUKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgcmVhZFByb21wdCgnbXkucHJvbXB0Lm1kJywgdGVzdENsaWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIFBST01QVDZfVEVYVCk7XG5cdFx0Y29uc3QgYWN0dWFsMyA9IGF3YWl0IHJlYWRQcm9tcHQoJ2h0bWwuaHRtbCcsIHRlc3RDbGllbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwzLCBudWxsKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGVzdENsaWVudC5yZWFkKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhjb250ZW50ICE9PSBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZVByb21wdHMoY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgJ3NoYXJlZC5wcm9tcHQubWQnOiBQUk9NUFQxX1RFWFQsICdteS5wcm9tcHQubWQnOiBQUk9NUFQ2X1RFWFQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXZpZXdzIGFyZSByZXNldCBhZnRlciBhbGwgY29uZmxpY3RzIHJlc29sdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnaHRtbC5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnY3NzLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2h0bWwucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpKTtcblxuXHRcdGNvbnN0IGNvbmZsaWN0cyA9IHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cztcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChjb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBQUk9NUFQ0X1RFWFQpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayghYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGRpcm5hbWUoY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSkpKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgcHJvbXB0cyBhbmQgYWxsIHByb21wdHMgYXJlIG1lcmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnc3VibGltZS5wcm9tcHQubWQnLCBQUk9NUFQ0X1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgndGVzdHMucHJvbXB0Lm1kJywgUFJPTVBUMl9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRjb25zdCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuU3luY2luZyk7XG5cdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdzdWJsaW1lLnByb21wdC5tZCcpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3Rlc3RzLnByb21wdC5tZCcpLFxuXHRcdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgcHJvbXB0cyBhbmQgYWxsIHByb21wdHMgYXJlIG1lcmdlZCBhbmQgYXBwbGllZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Nob3J0LnByb21wdC5tZCcsIFBST01QVDRfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdsb25nLnByb21wdC5tZCcsIFBST01QVDJfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpLCB0cnVlKTtcblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXZpZXcsIG51bGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gdGhlcmUgYXJlIG11bHRpcGxlIHByb21wdHMgYW5kIG9uZSBwcm9tcHQgaGFzIG5vIGNoYW5nZXMgYW5kIG9uZSBwcm9tcHQgaXMgbWVyZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdjb2RpbmcucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnY29kaW5nLnByb21wdC5tZCcsIFBST01QVDNfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdleHBsb3JpbmcucHJvbXB0Lm1kJywgUFJPTVBUMl9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRjb25zdCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuU3luY2luZyk7XG5cdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdleHBsb3JpbmcucHJvbXB0Lm1kJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnY29kaW5nLnByb21wdC5tZCcpLFxuXHRcdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgcHJvbXB0cyBhbmQgb25lIHByb21wdCBoYXMgbm8gY2hhbmdlcyBhbmQgcHJvbXB0cyBpcyBtZXJnZWQgYW5kIGFwcGxpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdxdWljay5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdxdWljay5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnZGF0YWJhc2VzLnByb21wdC5tZCcsIFBST01QVDJfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgdGVzdENsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlByb21wdHMpLCB0cnVlKTtcblxuXHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJldmlldywgbnVsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgcHJvbXB0cyB3aXRoIGNvbmZsaWN0cyBhbmQgYWxsIHByb21wdHMgYXJlIG1lcmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncmV2ZXJzZS5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgncmVjeWNsZS5wcm9tcHQubWQnLCBQUk9NUFQxX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdyZXZlcnNlLnByb21wdC5tZCcsIFBST01QVDRfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdyZWN5Y2xlLnByb21wdC5tZCcsIFBST01QVDJfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0Y29uc3QgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cyksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdyZXZlcnNlLnByb21wdC5tZCcpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3JlY3ljbGUucHJvbXB0Lm1kJyksXG5cdFx0XHRdKTtcblx0XHRhc3NlcnRQcmV2aWV3cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAncmV2ZXJzZS5wcm9tcHQubWQnKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdyZWN5Y2xlLnByb21wdC5tZCcpLFxuXHRcdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2VwdCB3aGVuIHRoZXJlIGFyZSBtdWx0aXBsZSBwcm9tcHRzIHdpdGggY29uZmxpY3RzIGFuZCBvbmx5IG9uZSBwcm9tcHQgaXMgYWNjZXB0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGVzdENsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2N1cnJlbnQucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2Z1dHVyZS5wcm9tcHQubWQnLCBQUk9NUFQxX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdjdXJyZW50LnByb21wdC5tZCcsIFBST01QVDRfVEVYVCwgdGVzdENsaWVudCk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbXB0KCdmdXR1cmUucHJvbXB0Lm1kJywgUFJPTVBUMl9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRsZXQgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cyksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdjdXJyZW50LnByb21wdC5tZCcpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2Z1dHVyZS5wcm9tcHQubWQnKSxcblx0XHRcdF0pO1xuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdjdXJyZW50LnByb21wdC5tZCcpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2Z1dHVyZS5wcm9tcHQubWQnKSxcblx0XHRcdF0pO1xuXG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ucHJldmlld1Jlc291cmNlLCBQUk9NUFQ0X1RFWFQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdjdXJyZW50LnByb21wdC5tZCcpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2Z1dHVyZS5wcm9tcHQubWQnKSxcblx0XHRcdF0pO1xuXHRcdGFzc2VydFByZXZpZXdzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cyxcblx0XHRcdFtcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdmdXR1cmUucHJvbXB0Lm1kJyksXG5cdFx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXB0IHdoZW4gdGhlcmUgYXJlIG11bHRpcGxlIHByb21wdHMgd2l0aCBjb25mbGljdHMgYW5kIGFsbCBwcm9tcHRzIGFyZSBhY2NlcHRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0ZXN0Q2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnZHluYW1pYy5wcm9tcHQubWQnLCBQUk9NUFQzX1RFWFQsIGNsaWVudDIpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnc3RhdGljLnByb21wdC5tZCcsIFBST01QVDFfVEVYVCwgY2xpZW50Mik7XG5cdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ2R5bmFtaWMucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3N0YXRpYy5wcm9tcHQubWQnLCBQUk9NUFQyX1RFWFQsIHRlc3RDbGllbnQpO1xuXHRcdGxldCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IHRlc3RDbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5Qcm9tcHRzKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2R5bmFtaWMucHJvbXB0Lm1kJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnc3RhdGljLnByb21wdC5tZCcpLFxuXHRcdFx0XSk7XG5cdFx0YXNzZXJ0UHJldmlld3ModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2R5bmFtaWMucHJvbXB0Lm1kJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnc3RhdGljLnByb21wdC5tZCcpLFxuXHRcdFx0XSk7XG5cblx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5wcmV2aWV3UmVzb3VyY2UsIFBST01QVDRfVEVYVCk7XG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMV0ucHJldmlld1Jlc291cmNlLCBQUk9NUFQyX1RFWFQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLlN5bmNpbmcpO1xuXHRcdGFzc2VydFByZXZpZXdzKHByZXZpZXchLnJlc291cmNlUHJldmlld3MsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnZHluYW1pYy5wcm9tcHQubWQnKSxcblx0XHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRlc3RPYmplY3QucmVzb3VyY2UsIFBSRVZJRVdfRElSX05BTUUsICdzdGF0aWMucHJvbXB0Lm1kJyksXG5cdFx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHQgd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgcHJvbXB0cyB3aXRoIGNvbmZsaWN0cyBhbmQgYWxsIHByb21wdHMgYXJlIGFjY2VwdGVkIGFuZCBhcHBsaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnZWRpY2F0aW9uYWwucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Vua25vd24ucHJvbXB0Lm1kJywgUFJPTVBUMV9URVhULCBjbGllbnQyKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnZWRpY2F0aW9uYWwucHJvbXB0Lm1kJywgUFJPTVBUNF9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRhd2FpdCB1cGRhdGVQcm9tcHQoJ3Vua25vd24ucHJvbXB0Lm1kJywgUFJPTVBUMl9URVhULCB0ZXN0Q2xpZW50KTtcblx0XHRsZXQgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCB0ZXN0Q2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuUHJvbXB0cyksIHRydWUpO1xuXG5cdFx0YXNzZXJ0RGVmaW5lZChcblx0XHRcdHByZXZpZXcsXG5cdFx0XHQnUHJldmlldyBtdXN0IGJlIGRlZmluZWQuJyxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0UHJldmlld3MocHJldmlldy5yZXNvdXJjZVByZXZpZXdzLFxuXHRcdFx0W1xuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ2VkaWNhdGlvbmFsLnByb21wdC5tZCcpLFxuXHRcdFx0XHRqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgdGVzdE9iamVjdC5yZXNvdXJjZSwgUFJFVklFV19ESVJfTkFNRSwgJ3Vua25vd24ucHJvbXB0Lm1kJyksXG5cdFx0XHRdKTtcblx0XHRhc3NlcnRQcmV2aWV3cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsXG5cdFx0XHRbXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAnZWRpY2F0aW9uYWwucHJvbXB0Lm1kJyksXG5cdFx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVN5bmNIb21lLCB0ZXN0T2JqZWN0LnJlc291cmNlLCBQUkVWSUVXX0RJUl9OQU1FLCAndW5rbm93bi5wcm9tcHQubWQnKSxcblx0XHRcdF0pO1xuXG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXcucmVzb3VyY2VQcmV2aWV3c1swXS5wcmV2aWV3UmVzb3VyY2UsIFBST01QVDRfVEVYVCk7XG5cblx0XHRhc3NlcnREZWZpbmVkKFxuXHRcdFx0cHJldmlldyxcblx0XHRcdCdQcmV2aWV3IG11c3QgYmUgZGVmaW5lZCBhZnRlciBhY2NlcHQuJyxcblx0XHQpO1xuXG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXcucmVzb3VyY2VQcmV2aWV3c1sxXS5wcmV2aWV3UmVzb3VyY2UsIFBST01QVDJfVEVYVCk7XG5cdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cHJldmlldyxcblx0XHRcdG51bGwsXG5cdFx0XHQnUHJldmlldyBhZnRlciB0aGUgbGFzdCBhcHBseSBtdXN0IGJlIGBudWxsYC4nLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIHByb2ZpbGUgcHJvbXB0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IGF3YWl0IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuY3JlYXRlTmFtZWRQcm9maWxlKCdwcm9maWxlMScpO1xuXHRcdGF3YWl0IHVwZGF0ZVByb21wdCgnbXkucHJvbXB0Lm1kJywgUFJPTVBUM19URVhULCBjbGllbnQyLCBwcm9maWxlKTtcblx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdGF3YWl0IHRlc3RDbGllbnQuc3luYygpO1xuXG5cdFx0Y29uc3Qgc3luY2VkUHJvZmlsZSA9IHRlc3RDbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkucHJvZmlsZXMuZmluZChwID0+IHAuaWQgPT09IHByb2ZpbGUuaWQpITtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgcmVhZFByb21wdCgnbXkucHJvbXB0Lm1kJywgdGVzdENsaWVudCwgc3luY2VkUHJvZmlsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsIFBST01QVDNfVEVYVCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHBhcnNlUHJvbXB0cyhjb250ZW50OiBzdHJpbmcpOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IHtcblx0XHRjb25zdCBzeW5jRGF0YTogSVN5bmNEYXRhID0gSlNPTi5wYXJzZShjb250ZW50KTtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZShzeW5jRGF0YS5jb250ZW50KTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZVByb21wdChcblx0XHRuYW1lOiBzdHJpbmcsXG5cdFx0Y29udGVudDogc3RyaW5nLFxuXHRcdGNsaWVudDogVXNlckRhdGFTeW5jQ2xpZW50LFxuXHRcdHByb2ZpbGU/OiBJVXNlckRhdGFQcm9maWxlLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9tcHRzUmVzb3VyY2UgPSBqb2luUGF0aCgocHJvZmlsZSA/PyB1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSkucHJvbXB0c0hvbWUsIG5hbWUpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwcm9tcHRzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gcmVtb3ZlUHJvbXB0KG5hbWU6IHN0cmluZywgY2xpZW50OiBVc2VyRGF0YVN5bmNDbGllbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9tcHRzUmVzb3VyY2UgPSBqb2luUGF0aCh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5wcm9tcHRzSG9tZSwgbmFtZSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuZGVsKHByb21wdHNSZXNvdXJjZSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiByZWFkUHJvbXB0KG5hbWU6IHN0cmluZywgY2xpZW50OiBVc2VyRGF0YVN5bmNDbGllbnQsIHByb2ZpbGU/OiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSk7XG5cdFx0Y29uc3QgcHJvbXB0c1Jlc291cmNlID0gam9pblBhdGgoKHByb2ZpbGUgPz8gdXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUpLnByb21wdHNIb21lLCBuYW1lKTtcblx0XHRpZiAoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKHByb21wdHNSZXNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShwcm9tcHRzUmVzb3VyY2UpO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRQcmV2aWV3cyhhY3R1YWw6IElSZXNvdXJjZVByZXZpZXdbXSwgZXhwZWN0ZWQ6IFVSSVtdKSB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGFjdHVhbC5tYXAoKHsgcHJldmlld1Jlc291cmNlIH0pID0+IHByZXZpZXdSZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdGV4cGVjdGVkLm1hcCh1cmkgPT4gdXJpLnRvU3RyaW5nKCkpLFxuXHRcdCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsU0FBUyxnQkFBZ0I7QUFHbEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0IsOEJBQThCO0FBQzNELFNBQVMsK0NBQStDO0FBQ3hELFNBQTJCLGdDQUFnQztBQUMzRCxTQUFzQywyQkFBMkIsa0JBQWtCLGNBQWMsa0JBQWtCO0FBRW5ILE1BQU0sZUFBZTtBQUNyQixNQUFNLGVBQWU7QUFDckIsTUFBTSxlQUFlO0FBQ3JCLE1BQU0sZUFBZTtBQUNyQixNQUFNLGVBQWU7QUFDckIsTUFBTSxlQUFlO0FBRXJCLE1BQU0sZUFBZSxNQUFNO0FBQzFCLFFBQU0sU0FBUyxJQUFJLHVCQUF1QjtBQUMxQyxNQUFJO0FBQ0osTUFBSTtBQUVKLE1BQUk7QUFFSixXQUFTLFlBQVk7QUFDcEIsVUFBTSxXQUFXLHFCQUFxQixJQUFJLHlCQUF5QixFQUFFLE1BQU07QUFBQSxFQUM1RSxDQUFDO0FBRUQsUUFBTSxrQkFBa0Isd0NBQXdDO0FBRWhFLFFBQU0sWUFBWTtBQUNqQixpQkFBYSxnQkFBZ0IsSUFB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
