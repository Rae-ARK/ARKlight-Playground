import assert from "assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { raceTimeout } from "../../../../../../base/common/async.js";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { PROTOCOL_VERSION } from "../../../../common/state/protocol/version/registry.js";
import { ContentEncoding, ResourceType, ResourceWriteMode } from "../../../../common/state/protocol/common/commands.js";
import { ResourceChangeType } from "../../../../common/state/protocol/channels-resource-watch/state.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { AhpErrorCodes } from "../../../../common/state/sessionProtocol.js";
import { CustomizationLoadStatus, CustomizationType, ROOT_STATE_URI } from "../../../../common/state/sessionState.js";
import { createRealSession } from "../harness/agentHostE2ETestHarness.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { conformanceTest } from "./e2eTestContext.js";
function defineClientFilesystemTests(context) {
  const { config, createdSessions, tempDirs, isWindows } = context;
  function createWorkspace(prefix) {
    const workspace = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(workspace);
    return workspace;
  }
  function fileUri(root, ...segments) {
    return URI.file(join(root, ...segments)).toString();
  }
  async function initializeClient(purpose) {
    await context.client.call("initialize", {
      channel: ROOT_STATE_URI,
      protocolVersions: [PROTOCOL_VERSION],
      clientId: `${purpose}-${config.provider}`
    });
  }
  async function writeText(uri, data, options = {}) {
    await context.client.call("resourceWrite", {
      channel: ROOT_STATE_URI,
      uri,
      data,
      encoding: ContentEncoding.Utf8,
      ...options
    });
  }
  conformanceTest(context, "resource commands round-trip a file through the host filesystem", async function() {
    await initializeClient("resource-roundtrip");
    const root = createWorkspace("ahp-resource-rw-");
    const directory = fileUri(root, "nested", "inner");
    const file = fileUri(root, "nested", "inner", "note.txt");
    await context.client.call("resourceRequest", {
      channel: ROOT_STATE_URI,
      uri: URI.file(root).toString(),
      read: true,
      write: true
    });
    await context.client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: directory });
    await context.client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: directory });
    await context.client.call("resourceWrite", {
      channel: ROOT_STATE_URI,
      uri: file,
      data: "RESOURCE_ROUNDTRIP",
      encoding: ContentEncoding.Utf8
    });
    const read = await context.client.call("resourceRead", {
      channel: ROOT_STATE_URI,
      uri: file,
      encoding: ContentEncoding.Utf8
    });
    const resolvedDirectory = await context.client.call("resourceResolve", {
      channel: ROOT_STATE_URI,
      uri: directory
    });
    const resolvedFile = await context.client.call("resourceResolve", {
      channel: ROOT_STATE_URI,
      uri: file
    });
    assert.deepStrictEqual({
      data: read.data,
      encoding: read.encoding,
      directoryType: resolvedDirectory.type,
      fileType: resolvedFile.type,
      size: resolvedFile.size
    }, {
      data: "RESOURCE_ROUNDTRIP",
      encoding: ContentEncoding.Utf8,
      directoryType: ResourceType.Directory,
      fileType: ResourceType.File,
      size: "RESOURCE_ROUNDTRIP".length
    });
  });
  conformanceTest(context, "resourceList reports directory entries and their types", async function() {
    await initializeClient("resource-list");
    const root = createWorkspace("ahp-resource-list-");
    mkdirSync(join(root, "child-dir"));
    writeFileSync(join(root, "child-file.txt"), "CHILD");
    const listed = await context.client.call("resourceList", {
      channel: ROOT_STATE_URI,
      uri: URI.file(root).toString()
    });
    assert.deepStrictEqual([...listed.entries].sort((a, b) => a.name.localeCompare(b.name)), [
      { name: "child-dir", type: "directory" },
      { name: "child-file.txt", type: "file" }
    ]);
  });
  conformanceTest(context, "resourceCopy, resourceMove, and resourceDelete mutate the tree", async function() {
    await initializeClient("resource-mutate");
    const root = createWorkspace("ahp-resource-mutate-");
    writeFileSync(join(root, "origin.txt"), "MUTATE");
    await context.client.call("resourceCopy", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "origin.txt"),
      destination: fileUri(root, "copy.txt")
    });
    await context.client.call("resourceMove", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "copy.txt"),
      destination: fileUri(root, "moved.txt")
    });
    await context.client.call("resourceDelete", { channel: ROOT_STATE_URI, uri: fileUri(root, "origin.txt") });
    const listed = await context.client.call("resourceList", {
      channel: ROOT_STATE_URI,
      uri: URI.file(root).toString()
    });
    const moved = await context.client.call("resourceRead", {
      channel: ROOT_STATE_URI,
      uri: fileUri(root, "moved.txt"),
      encoding: ContentEncoding.Utf8
    });
    assert.deepStrictEqual({
      remaining: listed.entries.map((entry) => entry.name).sort(),
      movedContents: moved.data
    }, {
      remaining: ["moved.txt"],
      movedContents: "MUTATE"
    });
  });
  conformanceTest(context, "resource watch reports changes on its subscribed channel", async function() {
    await initializeClient("resource-watch");
    const root = createWorkspace("ahp-resource-watch-");
    const rootUri = URI.file(root).toString();
    const watchedFile = fileUri(root, "watched.txt");
    const watch = await context.client.call("createResourceWatch", {
      channel: ROOT_STATE_URI,
      uri: rootUri,
      recursive: false
    });
    let subscribed = false;
    try {
      const subscribedWatch = await context.client.call("subscribe", { channel: watch.channel });
      subscribed = true;
      const descriptor = subscribedWatch.snapshot.state;
      context.client.clearReceived();
      const changed = context.client.waitForNotification((n) => {
        if (!isActionNotification(n, "resourceWatch/changed") || getActionEnvelope(n).channel !== watch.channel) {
          return false;
        }
        const action2 = getActionEnvelope(n).action;
        return action2.changes.items.some(
          (change) => change.uri === watchedFile && (change.type === ResourceChangeType.Added || change.type === ResourceChangeType.Updated)
        );
      }, 3e4);
      let changedNotification;
      for (let attempt = 1; attempt <= 30 && !changedNotification; attempt++) {
        await context.client.call("resourceWrite", {
          channel: ROOT_STATE_URI,
          uri: watchedFile,
          data: `WATCHED-${attempt}`,
          encoding: ContentEncoding.Utf8
        });
        changedNotification = await raceTimeout(changed, 1e3);
      }
      const action = getActionEnvelope(changedNotification ?? await changed).action;
      const observed = action.changes.items.find((change) => change.uri === watchedFile);
      assert.deepStrictEqual({
        scheme: URI.parse(watch.channel).scheme,
        descriptor,
        observedUri: observed?.uri,
        observedMutation: observed?.type === ResourceChangeType.Added || observed?.type === ResourceChangeType.Updated
      }, {
        scheme: "ahp-resource-watch",
        descriptor: {
          root: rootUri,
          recursive: false
        },
        observedUri: watchedFile,
        observedMutation: true
      });
    } finally {
      if (subscribed) {
        context.client.notify("unsubscribe", { channel: watch.channel });
      }
    }
  }, !isWindows);
  conformanceTest(context, "resource watch subscription preserves its descriptor", async function() {
    await initializeClient("resource-watch-descriptor");
    const root = createWorkspace("ahp-resource-watch-descriptor-");
    const rootUri = URI.file(root).toString();
    const watch = await context.client.call("createResourceWatch", {
      channel: ROOT_STATE_URI,
      uri: rootUri,
      recursive: true,
      excludes: { items: ["**/*.tmp"] },
      includes: { items: ["**/*.txt"] }
    });
    const subscribed = await context.client.call("subscribe", { channel: watch.channel });
    assert.deepStrictEqual(subscribed.snapshot.state, {
      root: rootUri,
      recursive: true,
      excludes: { items: ["**/*.tmp"] },
      includes: { items: ["**/*.txt"] }
    });
  });
  conformanceTest(context, "creating a resource watch for a missing root is rejected", async function() {
    await initializeClient("resource-watch-missing");
    const root = createWorkspace("ahp-resource-watch-missing-");
    await assert.rejects(context.client.call("createResourceWatch", {
      channel: ROOT_STATE_URI,
      uri: fileUri(root, "missing"),
      recursive: true
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "resourceWrite appends at the end of a file", async function() {
    await initializeClient("resource-append");
    const root = createWorkspace("ahp-resource-append-");
    const file = fileUri(root, "append.txt");
    writeFileSync(join(root, "append.txt"), "BEGIN");
    await writeText(file, "-END", { mode: ResourceWriteMode.Append });
    assert.strictEqual(readFileSync(join(root, "append.txt"), "utf8"), "BEGIN-END");
  });
  conformanceTest(context, "resourceWrite append position counts backwards from EOF", async function() {
    await initializeClient("resource-append-offset");
    const root = createWorkspace("ahp-resource-append-offset-");
    const file = fileUri(root, "append-offset.txt");
    writeFileSync(join(root, "append-offset.txt"), "BEGIN-END");
    await writeText(file, "-MIDDLE", { mode: ResourceWriteMode.Append, position: 4 });
    assert.strictEqual(readFileSync(join(root, "append-offset.txt"), "utf8"), "BEGIN-MIDDLE-END");
  });
  conformanceTest(context, "resourceWrite inserts without replacing existing bytes", async function() {
    await initializeClient("resource-insert");
    const root = createWorkspace("ahp-resource-insert-");
    const file = fileUri(root, "insert.txt");
    writeFileSync(join(root, "insert.txt"), "ABCD");
    await writeText(file, "12", { mode: ResourceWriteMode.Insert, position: 2 });
    assert.strictEqual(readFileSync(join(root, "insert.txt"), "utf8"), "AB12CD");
  });
  conformanceTest(context, "resourceWrite truncates from the requested position", async function() {
    await initializeClient("resource-truncate");
    const root = createWorkspace("ahp-resource-truncate-");
    const file = fileUri(root, "truncate.txt");
    writeFileSync(join(root, "truncate.txt"), "PREFIX-OLD-SUFFIX");
    await writeText(file, "NEW", { mode: ResourceWriteMode.Truncate, position: 7 });
    assert.strictEqual(readFileSync(join(root, "truncate.txt"), "utf8"), "PREFIX-NEW");
  });
  conformanceTest(context, "resourceWrite createOnly rejects an existing file", async function() {
    await initializeClient("resource-create-only");
    const root = createWorkspace("ahp-resource-create-only-");
    const file = fileUri(root, "existing.txt");
    writeFileSync(join(root, "existing.txt"), "original");
    await assert.rejects(writeText(file, "replacement", { createOnly: true }), { code: AhpErrorCodes.AlreadyExists });
    assert.strictEqual(readFileSync(join(root, "existing.txt"), "utf8"), "original");
  });
  conformanceTest(context, "resourceWrite ifMatch rejects a stale etag", async function() {
    await initializeClient("resource-if-match");
    const root = createWorkspace("ahp-resource-if-match-");
    const file = fileUri(root, "etag.txt");
    writeFileSync(join(root, "etag.txt"), "before");
    const resolved = await context.client.call("resourceResolve", {
      channel: ROOT_STATE_URI,
      uri: file
    });
    if (resolved.etag === void 0) {
      this.skip();
    }
    await writeText(file, "first", { ifMatch: resolved.etag });
    await assert.rejects(writeText(file, "stale", { ifMatch: resolved.etag }), { code: AhpErrorCodes.Conflict });
    assert.strictEqual(readFileSync(join(root, "etag.txt"), "utf8"), "first");
  });
  conformanceTest(context, "resourceCopy failIfExists preserves the destination", async function() {
    await initializeClient("resource-copy-conflict");
    const root = createWorkspace("ahp-resource-copy-conflict-");
    writeFileSync(join(root, "source.txt"), "source");
    writeFileSync(join(root, "destination.txt"), "destination");
    await assert.rejects(context.client.call("resourceCopy", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "source.txt"),
      destination: fileUri(root, "destination.txt"),
      failIfExists: true
    }), { code: AhpErrorCodes.AlreadyExists });
    assert.strictEqual(readFileSync(join(root, "destination.txt"), "utf8"), "destination");
  });
  conformanceTest(context, "resourceMove failIfExists preserves both files", async function() {
    await initializeClient("resource-move-conflict");
    const root = createWorkspace("ahp-resource-move-conflict-");
    writeFileSync(join(root, "source.txt"), "source");
    writeFileSync(join(root, "destination.txt"), "destination");
    await assert.rejects(context.client.call("resourceMove", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "source.txt"),
      destination: fileUri(root, "destination.txt"),
      failIfExists: true
    }), { code: AhpErrorCodes.AlreadyExists });
    assert.deepStrictEqual({
      source: readFileSync(join(root, "source.txt"), "utf8"),
      destination: readFileSync(join(root, "destination.txt"), "utf8")
    }, {
      source: "source",
      destination: "destination"
    });
  });
  conformanceTest(context, "resourceMkdir rejects a path occupied by a file", async function() {
    await initializeClient("resource-mkdir-file");
    const root = createWorkspace("ahp-resource-mkdir-file-");
    const file = fileUri(root, "occupied");
    writeFileSync(join(root, "occupied"), "file");
    await assert.rejects(context.client.call("resourceMkdir", {
      channel: ROOT_STATE_URI,
      uri: file
    }), { code: AhpErrorCodes.AlreadyExists });
  });
  conformanceTest(context, "resourceDelete recursively removes a directory tree", async function() {
    await initializeClient("resource-delete-tree");
    const root = createWorkspace("ahp-resource-delete-tree-");
    const tree = join(root, "tree");
    mkdirSync(join(tree, "nested"), { recursive: true });
    writeFileSync(join(tree, "nested", "file.txt"), "delete");
    await context.client.call("resourceDelete", {
      channel: ROOT_STATE_URI,
      uri: URI.file(tree).toString(),
      recursive: true
    });
    assert.strictEqual(existsSync(tree), false);
  });
  conformanceTest(context, "resourceWrite decodes base64 content", async function() {
    await initializeClient("resource-base64");
    const root = createWorkspace("ahp-resource-base64-");
    const file = fileUri(root, "base64.txt");
    await context.client.call("resourceWrite", {
      channel: ROOT_STATE_URI,
      uri: file,
      data: Buffer.from("BASE64_CONTENT").toString("base64"),
      encoding: ContentEncoding.Base64
    });
    assert.strictEqual(readFileSync(join(root, "base64.txt"), "utf8"), "BASE64_CONTENT");
  });
  conformanceTest(context, "resourceWrite append creates a missing file", async function() {
    await initializeClient("resource-append-create");
    const root = createWorkspace("ahp-resource-append-create-");
    const file = fileUri(root, "created.txt");
    await writeText(file, "created", { mode: ResourceWriteMode.Append });
    assert.strictEqual(readFileSync(join(root, "created.txt"), "utf8"), "created");
  });
  conformanceTest(context, "resourceWrite insert creates a missing file", async function() {
    await initializeClient("resource-insert-create");
    const root = createWorkspace("ahp-resource-insert-create-");
    const file = fileUri(root, "created.txt");
    await writeText(file, "created", { mode: ResourceWriteMode.Insert, position: 0 });
    assert.strictEqual(readFileSync(join(root, "created.txt"), "utf8"), "created");
  });
  conformanceTest(context, "resourceWrite accepts the current etag", async function() {
    await initializeClient("resource-if-match-current");
    const root = createWorkspace("ahp-resource-if-match-current-");
    const file = fileUri(root, "etag.txt");
    writeFileSync(join(root, "etag.txt"), "before");
    const resolved = await context.client.call("resourceResolve", {
      channel: ROOT_STATE_URI,
      uri: file
    });
    if (resolved.etag === void 0) {
      this.skip();
    }
    await writeText(file, "after", { ifMatch: resolved.etag });
    assert.strictEqual(readFileSync(join(root, "etag.txt"), "utf8"), "after");
  });
  conformanceTest(context, "resourceWrite ifMatch rejects a missing file", async function() {
    await initializeClient("resource-if-match-missing");
    const root = createWorkspace("ahp-resource-if-match-missing-");
    await assert.rejects(writeText(fileUri(root, "missing.txt"), "content", { ifMatch: "missing-etag" }), {
      code: AhpErrorCodes.Conflict
    });
  });
  conformanceTest(context, "resourceCopy recursively copies a directory", async function() {
    await initializeClient("resource-copy-directory");
    const root = createWorkspace("ahp-resource-copy-directory-");
    mkdirSync(join(root, "source", "nested"), { recursive: true });
    writeFileSync(join(root, "source", "nested", "file.txt"), "copied");
    await context.client.call("resourceCopy", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "source"),
      destination: fileUri(root, "destination")
    });
    assert.strictEqual(readFileSync(join(root, "destination", "nested", "file.txt"), "utf8"), "copied");
  });
  conformanceTest(context, "resourceCopy overwrites an existing destination by default", async function() {
    await initializeClient("resource-copy-overwrite");
    const root = createWorkspace("ahp-resource-copy-overwrite-");
    writeFileSync(join(root, "source.txt"), "source");
    writeFileSync(join(root, "destination.txt"), "destination");
    await context.client.call("resourceCopy", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "source.txt"),
      destination: fileUri(root, "destination.txt")
    });
    assert.strictEqual(readFileSync(join(root, "destination.txt"), "utf8"), "source");
  });
  conformanceTest(context, "resourceCopy reports a missing source", async function() {
    await initializeClient("resource-copy-missing");
    const root = createWorkspace("ahp-resource-copy-missing-");
    await assert.rejects(context.client.call("resourceCopy", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "missing.txt"),
      destination: fileUri(root, "destination.txt")
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "resourceMove relocates a directory tree", async function() {
    await initializeClient("resource-move-directory");
    const root = createWorkspace("ahp-resource-move-directory-");
    mkdirSync(join(root, "source", "nested"), { recursive: true });
    writeFileSync(join(root, "source", "nested", "file.txt"), "moved");
    await context.client.call("resourceMove", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "source"),
      destination: fileUri(root, "destination")
    });
    assert.deepStrictEqual({
      sourceExists: existsSync(join(root, "source")),
      contents: readFileSync(join(root, "destination", "nested", "file.txt"), "utf8")
    }, {
      sourceExists: false,
      contents: "moved"
    });
  });
  conformanceTest(context, "resourceMove overwrites an existing destination by default", async function() {
    await initializeClient("resource-move-overwrite");
    const root = createWorkspace("ahp-resource-move-overwrite-");
    writeFileSync(join(root, "source.txt"), "source");
    writeFileSync(join(root, "destination.txt"), "destination");
    await context.client.call("resourceMove", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "source.txt"),
      destination: fileUri(root, "destination.txt")
    });
    assert.deepStrictEqual({
      sourceExists: existsSync(join(root, "source.txt")),
      contents: readFileSync(join(root, "destination.txt"), "utf8")
    }, {
      sourceExists: false,
      contents: "source"
    });
  });
  conformanceTest(context, "resourceMove reports a missing source", async function() {
    await initializeClient("resource-move-missing");
    const root = createWorkspace("ahp-resource-move-missing-");
    await assert.rejects(context.client.call("resourceMove", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "missing.txt"),
      destination: fileUri(root, "destination.txt")
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "resourceDelete requires recursive mode for a non-empty directory", async function() {
    await initializeClient("resource-delete-non-recursive");
    const root = createWorkspace("ahp-resource-delete-non-recursive-");
    const directory = join(root, "directory");
    mkdirSync(directory);
    writeFileSync(join(directory, "file.txt"), "preserved");
    await assert.rejects(context.client.call("resourceDelete", {
      channel: ROOT_STATE_URI,
      uri: URI.file(directory).toString()
    }));
    assert.strictEqual(readFileSync(join(directory, "file.txt"), "utf8"), "preserved");
  });
  conformanceTest(context, "resourceDelete reports a missing resource", async function() {
    await initializeClient("resource-delete-missing");
    const root = createWorkspace("ahp-resource-delete-missing-");
    await assert.rejects(context.client.call("resourceDelete", {
      channel: ROOT_STATE_URI,
      uri: fileUri(root, "missing.txt")
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "resourceRead reports a missing file", async function() {
    await initializeClient("resource-read-missing");
    const root = createWorkspace("ahp-resource-read-missing-");
    await assert.rejects(context.client.call("resourceRead", {
      channel: ROOT_STATE_URI,
      uri: fileUri(root, "missing.txt")
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "resourceList reports a missing directory", async function() {
    await initializeClient("resource-list-missing");
    const root = createWorkspace("ahp-resource-list-missing-");
    await assert.rejects(context.client.call("resourceList", {
      channel: ROOT_STATE_URI,
      uri: fileUri(root, "missing")
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "resourceList rejects a file resource", async function() {
    await initializeClient("resource-list-file");
    const root = createWorkspace("ahp-resource-list-file-");
    const file = fileUri(root, "file.txt");
    writeFileSync(join(root, "file.txt"), "content");
    await assert.rejects(context.client.call("resourceList", {
      channel: ROOT_STATE_URI,
      uri: file
    }));
  });
  conformanceTest(context, "resourceWrite reports a missing parent directory", async function() {
    await initializeClient("resource-write-missing-parent");
    const root = createWorkspace("ahp-resource-write-missing-parent-");
    await assert.rejects(writeText(fileUri(root, "missing", "file.txt"), "content"), {
      code: AhpErrorCodes.NotFound
    });
  });
  conformanceTest(context, "resourceResolve reports a missing resource", async function() {
    await initializeClient("resource-resolve-missing");
    const root = createWorkspace("ahp-resource-resolve-missing-");
    await assert.rejects(context.client.call("resourceResolve", {
      channel: ROOT_STATE_URI,
      uri: fileUri(root, "missing")
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "host reads a client-hosted plugin through reverse resource requests", async function() {
    const pluginRoot = createWorkspace("ahp-client-plugin-");
    writeFileSync(join(pluginRoot, "plugin.json"), JSON.stringify({ name: "e2e-client-plugin", version: "1.0.0" }));
    const sessionUri = await createRealSession(context.client, config, `client-fs-${config.provider}`, createdSessions, URI.file(createWorkspace("ahp-client-fs-ws-")));
    context.client.clearReceived();
    context.client.dispatch({
      channel: sessionUri,
      clientSeq: 1,
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: `client-fs-${config.provider}`,
          displayName: "Test Client",
          tools: [],
          customizations: [{
            id: generateUuid(),
            uri: URI.file(pluginRoot).toString(),
            name: "e2e-client-plugin",
            type: CustomizationType.Plugin,
            enabled: true,
            nonce: "nonce-1"
          }]
        }
      }
    });
    const updated = await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, "session/customizationUpdated")) {
        return false;
      }
      const customization = getActionEnvelope(n).action.customization;
      return customization?.uri === URI.file(pluginRoot).toString() && customization?.load?.kind !== void 0;
    }, 6e4);
    const loadKind = getActionEnvelope(updated).action.customization?.load?.kind;
    const pluginRootPaths = [pluginRoot, realpathSync(pluginRoot)].map((path) => URI.file(path).fsPath);
    const servedForPlugin = context.client.servedReverseRequests.filter((request) => {
      const uri = request.uri;
      if (uri === void 0) {
        return false;
      }
      const requested = URI.parse(uri).fsPath;
      return pluginRootPaths.some((root) => requested.startsWith(root));
    });
    assert.deepStrictEqual({
      loadKind,
      reachedBackToClient: servedForPlugin.length > 0,
      readThePluginFile: servedForPlugin.some((request) => request.method === "resourceRead")
    }, {
      loadKind: CustomizationLoadStatus.Loaded,
      reachedBackToClient: true,
      readThePluginFile: true
    }, `served reverse requests: ${JSON.stringify(context.client.servedReverseRequests)}`);
  });
}
export {
  defineClientFilesystemTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvZTJlL3N1aXRlcy9jbGllbnRGaWxlc3lzdGVtU3VpdGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIFRoZSBmaWxlc3lzdGVtIGhhbGYgb2YgdGhlIEFnZW50IEhvc3QgUHJvdG9jb2wsIGluIGJvdGggZGlyZWN0aW9ucy5cbiAqXG4gKiAqKkNsaWVudCB0byBzZXJ2ZXIqKiBcdTIwMTQgdGhlIGByZXNvdXJjZSpgIGNvbW1hbmQgc3VyZmFjZSwgZXhlY3V0ZWQgYnkgdGhlIGhvc3RcbiAqIGFnYWluc3QgdGhlIGZpbGVzeXN0ZW0gaXQgcnVucyBvbi5cbiAqXG4gKiAqKlNlcnZlciB0byBjbGllbnQqKiBcdTIwMTQgdGhlIHNhbWUgc3VyZmFjZSB0cmF2ZWxsaW5nIHRoZSBvdGhlciB3YXkuIFRoZSBob3N0XG4gKiBhZGRyZXNzZXMgY2xpZW50LXNpZGUgZmlsZXMgdGhyb3VnaCB0aGUgYHZzY29kZS1hZ2VudC1jbGllbnRgIHNjaGVtZSBhbmRcbiAqIHNlcnZlcyB0aGVtIGJ5IHNlbmRpbmcgcmV2ZXJzZSByZXF1ZXN0cyBiYWNrIGRvd24gdGhlIGNvbm5lY3Rpb24sIHNvIGEgZmlsZVxuICogdGhhdCBleGlzdHMgb25seSBvbiB0aGUgY2xpZW50IGlzIHN0aWxsIHJlYWNoYWJsZS4gTm90aGluZyBlbHNlIGluIHRoZSBFMkVcbiAqIHN1aXRlIHB1dHMgdGhlIGhvc3QgaW4gdGhhdCBjb25maWd1cmF0aW9uLlxuICpcbiAqIEJvdGggYXJlIGhvc3Qtb3duZWQgYW5kIHByb3ZpZGVyLWludmFyaWFudCwgc28gdGhleSBsaXZlIGluIHRoZSBjb25mb3JtYW5jZVxuICogdGllciBhbmQgbmV2ZXIgY3Jvc3MgdGhlIG1vZGVsIGJvdW5kYXJ5LlxuICovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGV4aXN0c1N5bmMsIG1rZGlyU3luYywgbWtkdGVtcFN5bmMsIHJlYWRGaWxlU3luYywgcmVhbHBhdGhTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBQUk9UT0NPTF9WRVJTSU9OIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vcmVnaXN0cnkuanMnO1xuaW1wb3J0IHR5cGUge1xuXHRDcmVhdGVSZXNvdXJjZVdhdGNoUmVzdWx0LFxuXHRSZXNvdXJjZUxpc3RSZXN1bHQsXG5cdFJlc291cmNlUmVhZFJlc3VsdCxcblx0UmVzb3VyY2VSZXNvbHZlUmVzdWx0LFxuXHRTdWJzY3JpYmVSZXN1bHQsXG59IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZW50RW5jb2RpbmcsIFJlc291cmNlVHlwZSwgUmVzb3VyY2VXcml0ZU1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFJlc291cmNlQ2hhbmdlVHlwZSwgdHlwZSBSZXNvdXJjZUNoYW5nZSwgdHlwZSBSZXNvdXJjZVdhdGNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtcmVzb3VyY2Utd2F0Y2gvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBaHBFcnJvckNvZGVzLCB0eXBlIEFocE5vdGlmaWNhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMsIEN1c3RvbWl6YXRpb25UeXBlLCBST09UX1NUQVRFX1VSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlUmVhbFNlc3Npb24gfSBmcm9tICcuLi9oYXJuZXNzL2FnZW50SG9zdEUyRVRlc3RIYXJuZXNzLmpzJztcbmltcG9ydCB7IGdldEFjdGlvbkVudmVsb3BlLCBpc0FjdGlvbk5vdGlmaWNhdGlvbiB9IGZyb20gJy4uLy4uL3NlcnZlckludGVncmF0aW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgY29uZm9ybWFuY2VUZXN0LCB0eXBlIElBZ2VudEhvc3RFMkVUZXN0Q29udGV4dCB9IGZyb20gJy4vZTJlVGVzdENvbnRleHQuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lQ2xpZW50RmlsZXN5c3RlbVRlc3RzKGNvbnRleHQ6IElBZ2VudEhvc3RFMkVUZXN0Q29udGV4dCk6IHZvaWQge1xuXHRjb25zdCB7IGNvbmZpZywgY3JlYXRlZFNlc3Npb25zLCB0ZW1wRGlycywgaXNXaW5kb3dzIH0gPSBjb250ZXh0O1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVdvcmtzcGFjZShwcmVmaXg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgcHJlZml4KSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdHJldHVybiB3b3Jrc3BhY2U7XG5cdH1cblxuXHQvKiogQSBgZmlsZTpgIFVSSSBzdHJpbmcgdW5kZXIgYHJvb3RgLCBhcyB0aGUgcHJvdG9jb2wgY2FycmllcyB0aGVtLiAqL1xuXHRmdW5jdGlvbiBmaWxlVXJpKHJvb3Q6IHN0cmluZywgLi4uc2VnbWVudHM6IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gVVJJLmZpbGUoam9pbihyb290LCAuLi5zZWdtZW50cykpLnRvU3RyaW5nKCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcGxldGVzIHRoZSBoYW5kc2hha2UuIFJlc291cmNlIGNvbW1hbmRzIGFyZSBvbmx5IHJvdXRlZCBvbmNlIHRoZVxuXHQgKiBjb25uZWN0aW9uIGhhcyBhIHJlZ2lzdGVyZWQgY2xpZW50OyBiZWZvcmUgdGhhdCB0aGUgc2VydmVyIGFuc3dlcnNcblx0ICogYE1ldGhvZCBub3QgZm91bmRgLlxuXHQgKi9cblx0YXN5bmMgZnVuY3Rpb24gaW5pdGlhbGl6ZUNsaWVudChwdXJwb3NlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdpbml0aWFsaXplJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sXG5cdFx0XHRjbGllbnRJZDogYCR7cHVycG9zZX0tJHtjb25maWcucHJvdmlkZXJ9YCxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHdyaXRlVGV4dCh1cmk6IHN0cmluZywgZGF0YTogc3RyaW5nLCBvcHRpb25zOiB7XG5cdFx0cmVhZG9ubHkgY3JlYXRlT25seT86IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgaWZNYXRjaD86IHN0cmluZztcblx0XHRyZWFkb25seSBtb2RlPzogUmVzb3VyY2VXcml0ZU1vZGU7XG5cdFx0cmVhZG9ubHkgcG9zaXRpb24/OiBudW1iZXI7XG5cdH0gPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlV3JpdGUnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHVyaSxcblx0XHRcdGRhdGEsXG5cdFx0XHRlbmNvZGluZzogQ29udGVudEVuY29kaW5nLlV0ZjgsXG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdH0pO1xuXHR9XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZSBjb21tYW5kcyByb3VuZC10cmlwIGEgZmlsZSB0aHJvdWdoIHRoZSBob3N0IGZpbGVzeXN0ZW0nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2Utcm91bmR0cmlwJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLXJ3LScpO1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IGZpbGVVcmkocm9vdCwgJ25lc3RlZCcsICdpbm5lcicpO1xuXHRcdGNvbnN0IGZpbGUgPSBmaWxlVXJpKHJvb3QsICduZXN0ZWQnLCAnaW5uZXInLCAnbm90ZS50eHQnKTtcblxuXHRcdC8vIE5lZ290aWF0aW5nIGFjY2VzcyBpcyB0aGUgZG9jdW1lbnRlZCBwcmVhbWJsZSB0byB1c2luZyB0aGUgcmVzb3VyY2Vcblx0XHQvLyBjb21tYW5kcywgc28gdGhlIHJvdW5kLXRyaXAgc3RhcnRzIHdoZXJlIGEgcmVhbCBjYWxsZXIgd291bGQuXG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VSZXF1ZXN0Jywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogVVJJLmZpbGUocm9vdCkudG9TdHJpbmcoKSwgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUsXG5cdFx0fSk7XG5cblx0XHQvLyBgbWtkaXIgLXBgIHNlbWFudGljcywgYW5kIGlkZW1wb3RlbnQgZm9yIGEgZGlyZWN0b3J5IHRoYXQgZXhpc3RzLlxuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlTWtkaXInLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGRpcmVjdG9yeSB9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZU1rZGlyJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBkaXJlY3RvcnkgfSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VXcml0ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGZpbGUsIGRhdGE6ICdSRVNPVVJDRV9ST1VORFRSSVAnLCBlbmNvZGluZzogQ29udGVudEVuY29kaW5nLlV0ZjgsXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZWFkID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxSZXNvdXJjZVJlYWRSZXN1bHQ+KCdyZXNvdXJjZVJlYWQnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBmaWxlLCBlbmNvZGluZzogQ29udGVudEVuY29kaW5nLlV0ZjgsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzb2x2ZWREaXJlY3RvcnkgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFJlc291cmNlUmVzb2x2ZVJlc3VsdD4oJ3Jlc291cmNlUmVzb2x2ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGRpcmVjdG9yeSxcblx0XHR9KTtcblx0XHRjb25zdCByZXNvbHZlZEZpbGUgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFJlc291cmNlUmVzb2x2ZVJlc3VsdD4oJ3Jlc291cmNlUmVzb2x2ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGZpbGUsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRhdGE6IHJlYWQuZGF0YSxcblx0XHRcdGVuY29kaW5nOiByZWFkLmVuY29kaW5nLFxuXHRcdFx0ZGlyZWN0b3J5VHlwZTogcmVzb2x2ZWREaXJlY3RvcnkudHlwZSxcblx0XHRcdGZpbGVUeXBlOiByZXNvbHZlZEZpbGUudHlwZSxcblx0XHRcdHNpemU6IHJlc29sdmVkRmlsZS5zaXplLFxuXHRcdH0sIHtcblx0XHRcdGRhdGE6ICdSRVNPVVJDRV9ST1VORFRSSVAnLFxuXHRcdFx0ZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4LFxuXHRcdFx0ZGlyZWN0b3J5VHlwZTogUmVzb3VyY2VUeXBlLkRpcmVjdG9yeSxcblx0XHRcdGZpbGVUeXBlOiBSZXNvdXJjZVR5cGUuRmlsZSxcblx0XHRcdHNpemU6ICdSRVNPVVJDRV9ST1VORFRSSVAnLmxlbmd0aCxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZUxpc3QgcmVwb3J0cyBkaXJlY3RvcnkgZW50cmllcyBhbmQgdGhlaXIgdHlwZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtbGlzdCcpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1saXN0LScpO1xuXHRcdG1rZGlyU3luYyhqb2luKHJvb3QsICdjaGlsZC1kaXInKSk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHJvb3QsICdjaGlsZC1maWxlLnR4dCcpLCAnQ0hJTEQnKTtcblxuXHRcdGNvbnN0IGxpc3RlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8UmVzb3VyY2VMaXN0UmVzdWx0PigncmVzb3VyY2VMaXN0Jywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogVVJJLmZpbGUocm9vdCkudG9TdHJpbmcoKSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmxpc3RlZC5lbnRyaWVzXS5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpKSwgW1xuXHRcdFx0eyBuYW1lOiAnY2hpbGQtZGlyJywgdHlwZTogJ2RpcmVjdG9yeScgfSxcblx0XHRcdHsgbmFtZTogJ2NoaWxkLWZpbGUudHh0JywgdHlwZTogJ2ZpbGUnIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VDb3B5LCByZXNvdXJjZU1vdmUsIGFuZCByZXNvdXJjZURlbGV0ZSBtdXRhdGUgdGhlIHRyZWUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtbXV0YXRlJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLW11dGF0ZS0nKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ29yaWdpbi50eHQnKSwgJ01VVEFURScpO1xuXG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VDb3B5Jywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHNvdXJjZTogZmlsZVVyaShyb290LCAnb3JpZ2luLnR4dCcpLCBkZXN0aW5hdGlvbjogZmlsZVVyaShyb290LCAnY29weS50eHQnKSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZU1vdmUnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgc291cmNlOiBmaWxlVXJpKHJvb3QsICdjb3B5LnR4dCcpLCBkZXN0aW5hdGlvbjogZmlsZVVyaShyb290LCAnbW92ZWQudHh0JyksXG5cdFx0fSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VEZWxldGUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGZpbGVVcmkocm9vdCwgJ29yaWdpbi50eHQnKSB9KTtcblxuXHRcdGNvbnN0IGxpc3RlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8UmVzb3VyY2VMaXN0UmVzdWx0PigncmVzb3VyY2VMaXN0Jywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogVVJJLmZpbGUocm9vdCkudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0XHRjb25zdCBtb3ZlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8UmVzb3VyY2VSZWFkUmVzdWx0PigncmVzb3VyY2VSZWFkJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogZmlsZVVyaShyb290LCAnbW92ZWQudHh0JyksIGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVtYWluaW5nOiBsaXN0ZWQuZW50cmllcy5tYXAoZW50cnkgPT4gZW50cnkubmFtZSkuc29ydCgpLFxuXHRcdFx0bW92ZWRDb250ZW50czogbW92ZWQuZGF0YSxcblx0XHR9LCB7XG5cdFx0XHRyZW1haW5pbmc6IFsnbW92ZWQudHh0J10sXG5cdFx0XHRtb3ZlZENvbnRlbnRzOiAnTVVUQVRFJyxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZSB3YXRjaCByZXBvcnRzIGNoYW5nZXMgb24gaXRzIHN1YnNjcmliZWQgY2hhbm5lbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS13YXRjaCcpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS13YXRjaC0nKTtcblx0XHRjb25zdCByb290VXJpID0gVVJJLmZpbGUocm9vdCkudG9TdHJpbmcoKTtcblx0XHRjb25zdCB3YXRjaGVkRmlsZSA9IGZpbGVVcmkocm9vdCwgJ3dhdGNoZWQudHh0Jyk7XG5cblx0XHRjb25zdCB3YXRjaCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8Q3JlYXRlUmVzb3VyY2VXYXRjaFJlc3VsdD4oJ2NyZWF0ZVJlc291cmNlV2F0Y2gnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiByb290VXJpLCByZWN1cnNpdmU6IGZhbHNlLFxuXHRcdH0pO1xuXHRcdGxldCBzdWJzY3JpYmVkID0gZmFsc2U7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3Vic2NyaWJlZFdhdGNoID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHdhdGNoLmNoYW5uZWwgfSk7XG5cdFx0XHRzdWJzY3JpYmVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGRlc2NyaXB0b3IgPSBzdWJzY3JpYmVkV2F0Y2guc25hcHNob3QhLnN0YXRlIGFzIFJlc291cmNlV2F0Y2hTdGF0ZTtcblx0XHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Jlc291cmNlV2F0Y2gvY2hhbmdlZCcpIHx8IGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IHdhdGNoLmNoYW5uZWwpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgcmVhZG9ubHkgY2hhbmdlczogeyByZWFkb25seSBpdGVtczogcmVhZG9ubHkgUmVzb3VyY2VDaGFuZ2VbXSB9IH07XG5cdFx0XHRcdHJldHVybiBhY3Rpb24uY2hhbmdlcy5pdGVtcy5zb21lKGNoYW5nZSA9PlxuXHRcdFx0XHRcdGNoYW5nZS51cmkgPT09IHdhdGNoZWRGaWxlXG5cdFx0XHRcdFx0JiYgKGNoYW5nZS50eXBlID09PSBSZXNvdXJjZUNoYW5nZVR5cGUuQWRkZWQgfHwgY2hhbmdlLnR5cGUgPT09IFJlc291cmNlQ2hhbmdlVHlwZS5VcGRhdGVkKVxuXHRcdFx0XHQpO1xuXHRcdFx0fSwgMzBfMDAwKTtcblxuXHRcdFx0bGV0IGNoYW5nZWROb3RpZmljYXRpb246IEFocE5vdGlmaWNhdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRcdC8vIFRoZSBPUyB3YXRjaGVyIGF0dGFjaGVzIGFzeW5jaHJvbm91c2x5LCBzbyBrZWVwIHByb2R1Y2luZyBjaGFuZ2UgZWRnZXMgdW50aWwgaXQgaXMgcmVhZHkuXG5cdFx0XHRmb3IgKGxldCBhdHRlbXB0ID0gMTsgYXR0ZW1wdCA8PSAzMCAmJiAhY2hhbmdlZE5vdGlmaWNhdGlvbjsgYXR0ZW1wdCsrKSB7XG5cdFx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlV3JpdGUnLCB7XG5cdFx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogd2F0Y2hlZEZpbGUsIGRhdGE6IGBXQVRDSEVELSR7YXR0ZW1wdH1gLCBlbmNvZGluZzogQ29udGVudEVuY29kaW5nLlV0ZjgsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjaGFuZ2VkTm90aWZpY2F0aW9uID0gYXdhaXQgcmFjZVRpbWVvdXQoY2hhbmdlZCwgMV8wMDApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShjaGFuZ2VkTm90aWZpY2F0aW9uID8/IGF3YWl0IGNoYW5nZWQpLmFjdGlvbiBhcyB7IHJlYWRvbmx5IGNoYW5nZXM6IHsgcmVhZG9ubHkgaXRlbXM6IHJlYWRvbmx5IFJlc291cmNlQ2hhbmdlW10gfSB9O1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZWQgPSBhY3Rpb24uY2hhbmdlcy5pdGVtcy5maW5kKGNoYW5nZSA9PiBjaGFuZ2UudXJpID09PSB3YXRjaGVkRmlsZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c2NoZW1lOiBVUkkucGFyc2Uod2F0Y2guY2hhbm5lbCkuc2NoZW1lLFxuXHRcdFx0XHRkZXNjcmlwdG9yLFxuXHRcdFx0XHRvYnNlcnZlZFVyaTogb2JzZXJ2ZWQ/LnVyaSxcblx0XHRcdFx0b2JzZXJ2ZWRNdXRhdGlvbjogb2JzZXJ2ZWQ/LnR5cGUgPT09IFJlc291cmNlQ2hhbmdlVHlwZS5BZGRlZCB8fCBvYnNlcnZlZD8udHlwZSA9PT0gUmVzb3VyY2VDaGFuZ2VUeXBlLlVwZGF0ZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNjaGVtZTogJ2FocC1yZXNvdXJjZS13YXRjaCcsXG5cdFx0XHRcdGRlc2NyaXB0b3I6IHtcblx0XHRcdFx0XHRyb290OiByb290VXJpLFxuXHRcdFx0XHRcdHJlY3Vyc2l2ZTogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9ic2VydmVkVXJpOiB3YXRjaGVkRmlsZSxcblx0XHRcdFx0b2JzZXJ2ZWRNdXRhdGlvbjogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoc3Vic2NyaWJlZCkge1xuXHRcdFx0XHRjb250ZXh0LmNsaWVudC5ub3RpZnkoJ3Vuc3Vic2NyaWJlJywgeyBjaGFubmVsOiB3YXRjaC5jaGFubmVsIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSwgIWlzV2luZG93cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZSB3YXRjaCBzdWJzY3JpcHRpb24gcHJlc2VydmVzIGl0cyBkZXNjcmlwdG9yJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLXdhdGNoLWRlc2NyaXB0b3InKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2Utd2F0Y2gtZGVzY3JpcHRvci0nKTtcblx0XHRjb25zdCByb290VXJpID0gVVJJLmZpbGUocm9vdCkudG9TdHJpbmcoKTtcblx0XHRjb25zdCB3YXRjaCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8eyBjaGFubmVsOiBzdHJpbmcgfT4oJ2NyZWF0ZVJlc291cmNlV2F0Y2gnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHVyaTogcm9vdFVyaSxcblx0XHRcdHJlY3Vyc2l2ZTogdHJ1ZSxcblx0XHRcdGV4Y2x1ZGVzOiB7IGl0ZW1zOiBbJyoqLyoudG1wJ10gfSxcblx0XHRcdGluY2x1ZGVzOiB7IGl0ZW1zOiBbJyoqLyoudHh0J10gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN1YnNjcmliZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogd2F0Y2guY2hhbm5lbCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3Vic2NyaWJlZC5zbmFwc2hvdCEuc3RhdGUgYXMgUmVzb3VyY2VXYXRjaFN0YXRlLCB7XG5cdFx0XHRyb290OiByb290VXJpLFxuXHRcdFx0cmVjdXJzaXZlOiB0cnVlLFxuXHRcdFx0ZXhjbHVkZXM6IHsgaXRlbXM6IFsnKiovKi50bXAnXSB9LFxuXHRcdFx0aW5jbHVkZXM6IHsgaXRlbXM6IFsnKiovKi50eHQnXSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2NyZWF0aW5nIGEgcmVzb3VyY2Ugd2F0Y2ggZm9yIGEgbWlzc2luZyByb290IGlzIHJlamVjdGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLXdhdGNoLW1pc3NpbmcnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2Utd2F0Y2gtbWlzc2luZy0nKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbnRleHQuY2xpZW50LmNhbGwoJ2NyZWF0ZVJlc291cmNlV2F0Y2gnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHVyaTogZmlsZVVyaShyb290LCAnbWlzc2luZycpLFxuXHRcdFx0cmVjdXJzaXZlOiB0cnVlLFxuXHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQgfSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VXcml0ZSBhcHBlbmRzIGF0IHRoZSBlbmQgb2YgYSBmaWxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWFwcGVuZCcpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1hcHBlbmQtJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGZpbGVVcmkocm9vdCwgJ2FwcGVuZC50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ2FwcGVuZC50eHQnKSwgJ0JFR0lOJyk7XG5cblx0XHRhd2FpdCB3cml0ZVRleHQoZmlsZSwgJy1FTkQnLCB7IG1vZGU6IFJlc291cmNlV3JpdGVNb2RlLkFwcGVuZCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoam9pbihyb290LCAnYXBwZW5kLnR4dCcpLCAndXRmOCcpLCAnQkVHSU4tRU5EJyk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VXcml0ZSBhcHBlbmQgcG9zaXRpb24gY291bnRzIGJhY2t3YXJkcyBmcm9tIEVPRicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1hcHBlbmQtb2Zmc2V0Jyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLWFwcGVuZC1vZmZzZXQtJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGZpbGVVcmkocm9vdCwgJ2FwcGVuZC1vZmZzZXQudHh0Jyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHJvb3QsICdhcHBlbmQtb2Zmc2V0LnR4dCcpLCAnQkVHSU4tRU5EJyk7XG5cblx0XHRhd2FpdCB3cml0ZVRleHQoZmlsZSwgJy1NSURETEUnLCB7IG1vZGU6IFJlc291cmNlV3JpdGVNb2RlLkFwcGVuZCwgcG9zaXRpb246IDQgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGpvaW4ocm9vdCwgJ2FwcGVuZC1vZmZzZXQudHh0JyksICd1dGY4JyksICdCRUdJTi1NSURETEUtRU5EJyk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VXcml0ZSBpbnNlcnRzIHdpdGhvdXQgcmVwbGFjaW5nIGV4aXN0aW5nIGJ5dGVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWluc2VydCcpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1pbnNlcnQtJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGZpbGVVcmkocm9vdCwgJ2luc2VydC50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ2luc2VydC50eHQnKSwgJ0FCQ0QnKTtcblxuXHRcdGF3YWl0IHdyaXRlVGV4dChmaWxlLCAnMTInLCB7IG1vZGU6IFJlc291cmNlV3JpdGVNb2RlLkluc2VydCwgcG9zaXRpb246IDIgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGpvaW4ocm9vdCwgJ2luc2VydC50eHQnKSwgJ3V0ZjgnKSwgJ0FCMTJDRCcpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlV3JpdGUgdHJ1bmNhdGVzIGZyb20gdGhlIHJlcXVlc3RlZCBwb3NpdGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS10cnVuY2F0ZScpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS10cnVuY2F0ZS0nKTtcblx0XHRjb25zdCBmaWxlID0gZmlsZVVyaShyb290LCAndHJ1bmNhdGUudHh0Jyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHJvb3QsICd0cnVuY2F0ZS50eHQnKSwgJ1BSRUZJWC1PTEQtU1VGRklYJyk7XG5cblx0XHRhd2FpdCB3cml0ZVRleHQoZmlsZSwgJ05FVycsIHsgbW9kZTogUmVzb3VyY2VXcml0ZU1vZGUuVHJ1bmNhdGUsIHBvc2l0aW9uOiA3IH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICd0cnVuY2F0ZS50eHQnKSwgJ3V0ZjgnKSwgJ1BSRUZJWC1ORVcnKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZVdyaXRlIGNyZWF0ZU9ubHkgcmVqZWN0cyBhbiBleGlzdGluZyBmaWxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWNyZWF0ZS1vbmx5Jyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLWNyZWF0ZS1vbmx5LScpO1xuXHRcdGNvbnN0IGZpbGUgPSBmaWxlVXJpKHJvb3QsICdleGlzdGluZy50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ2V4aXN0aW5nLnR4dCcpLCAnb3JpZ2luYWwnKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHdyaXRlVGV4dChmaWxlLCAncmVwbGFjZW1lbnQnLCB7IGNyZWF0ZU9ubHk6IHRydWUgfSksIHsgY29kZTogQWhwRXJyb3JDb2Rlcy5BbHJlYWR5RXhpc3RzIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoam9pbihyb290LCAnZXhpc3RpbmcudHh0JyksICd1dGY4JyksICdvcmlnaW5hbCcpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlV3JpdGUgaWZNYXRjaCByZWplY3RzIGEgc3RhbGUgZXRhZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1pZi1tYXRjaCcpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1pZi1tYXRjaC0nKTtcblx0XHRjb25zdCBmaWxlID0gZmlsZVVyaShyb290LCAnZXRhZy50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ2V0YWcudHh0JyksICdiZWZvcmUnKTtcblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PigncmVzb3VyY2VSZXNvbHZlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IGZpbGUsXG5cdFx0fSk7XG5cdFx0aWYgKHJlc29sdmVkLmV0YWcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5za2lwKCk7XG5cdFx0fVxuXHRcdGF3YWl0IHdyaXRlVGV4dChmaWxlLCAnZmlyc3QnLCB7IGlmTWF0Y2g6IHJlc29sdmVkLmV0YWcgfSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyh3cml0ZVRleHQoZmlsZSwgJ3N0YWxlJywgeyBpZk1hdGNoOiByZXNvbHZlZC5ldGFnIH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuQ29uZmxpY3QgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICdldGFnLnR4dCcpLCAndXRmOCcpLCAnZmlyc3QnKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZUNvcHkgZmFpbElmRXhpc3RzIHByZXNlcnZlcyB0aGUgZGVzdGluYXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtY29weS1jb25mbGljdCcpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1jb3B5LWNvbmZsaWN0LScpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnc291cmNlLnR4dCcpLCAnc291cmNlJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHJvb3QsICdkZXN0aW5hdGlvbi50eHQnKSwgJ2Rlc3RpbmF0aW9uJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZUNvcHknLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHNvdXJjZTogZmlsZVVyaShyb290LCAnc291cmNlLnR4dCcpLFxuXHRcdFx0ZGVzdGluYXRpb246IGZpbGVVcmkocm9vdCwgJ2Rlc3RpbmF0aW9uLnR4dCcpLFxuXHRcdFx0ZmFpbElmRXhpc3RzOiB0cnVlLFxuXHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuQWxyZWFkeUV4aXN0cyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGpvaW4ocm9vdCwgJ2Rlc3RpbmF0aW9uLnR4dCcpLCAndXRmOCcpLCAnZGVzdGluYXRpb24nKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZU1vdmUgZmFpbElmRXhpc3RzIHByZXNlcnZlcyBib3RoIGZpbGVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLW1vdmUtY29uZmxpY3QnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtbW92ZS1jb25mbGljdC0nKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ3NvdXJjZS50eHQnKSwgJ3NvdXJjZScpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnZGVzdGluYXRpb24udHh0JyksICdkZXN0aW5hdGlvbicpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VNb3ZlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRzb3VyY2U6IGZpbGVVcmkocm9vdCwgJ3NvdXJjZS50eHQnKSxcblx0XHRcdGRlc3RpbmF0aW9uOiBmaWxlVXJpKHJvb3QsICdkZXN0aW5hdGlvbi50eHQnKSxcblx0XHRcdGZhaWxJZkV4aXN0czogdHJ1ZSxcblx0XHR9KSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLkFscmVhZHlFeGlzdHMgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzb3VyY2U6IHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICdzb3VyY2UudHh0JyksICd1dGY4JyksXG5cdFx0XHRkZXN0aW5hdGlvbjogcmVhZEZpbGVTeW5jKGpvaW4ocm9vdCwgJ2Rlc3RpbmF0aW9uLnR4dCcpLCAndXRmOCcpLFxuXHRcdH0sIHtcblx0XHRcdHNvdXJjZTogJ3NvdXJjZScsXG5cdFx0XHRkZXN0aW5hdGlvbjogJ2Rlc3RpbmF0aW9uJyxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZU1rZGlyIHJlamVjdHMgYSBwYXRoIG9jY3VwaWVkIGJ5IGEgZmlsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1ta2Rpci1maWxlJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLW1rZGlyLWZpbGUtJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGZpbGVVcmkocm9vdCwgJ29jY3VwaWVkJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHJvb3QsICdvY2N1cGllZCcpLCAnZmlsZScpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VNa2RpcicsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBmaWxlLFxuXHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuQWxyZWFkeUV4aXN0cyB9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZURlbGV0ZSByZWN1cnNpdmVseSByZW1vdmVzIGEgZGlyZWN0b3J5IHRyZWUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtZGVsZXRlLXRyZWUnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtZGVsZXRlLXRyZWUtJyk7XG5cdFx0Y29uc3QgdHJlZSA9IGpvaW4ocm9vdCwgJ3RyZWUnKTtcblx0XHRta2RpclN5bmMoam9pbih0cmVlLCAnbmVzdGVkJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbih0cmVlLCAnbmVzdGVkJywgJ2ZpbGUudHh0JyksICdkZWxldGUnKTtcblxuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlRGVsZXRlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IFVSSS5maWxlKHRyZWUpLnRvU3RyaW5nKCksXG5cdFx0XHRyZWN1cnNpdmU6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyh0cmVlKSwgZmFsc2UpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlV3JpdGUgZGVjb2RlcyBiYXNlNjQgY29udGVudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1iYXNlNjQnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtYmFzZTY0LScpO1xuXHRcdGNvbnN0IGZpbGUgPSBmaWxlVXJpKHJvb3QsICdiYXNlNjQudHh0Jyk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZVdyaXRlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IGZpbGUsXG5cdFx0XHRkYXRhOiBCdWZmZXIuZnJvbSgnQkFTRTY0X0NPTlRFTlQnKS50b1N0cmluZygnYmFzZTY0JyksXG5cdFx0XHRlbmNvZGluZzogQ29udGVudEVuY29kaW5nLkJhc2U2NCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoam9pbihyb290LCAnYmFzZTY0LnR4dCcpLCAndXRmOCcpLCAnQkFTRTY0X0NPTlRFTlQnKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZVdyaXRlIGFwcGVuZCBjcmVhdGVzIGEgbWlzc2luZyBmaWxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWFwcGVuZC1jcmVhdGUnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtYXBwZW5kLWNyZWF0ZS0nKTtcblx0XHRjb25zdCBmaWxlID0gZmlsZVVyaShyb290LCAnY3JlYXRlZC50eHQnKTtcblxuXHRcdGF3YWl0IHdyaXRlVGV4dChmaWxlLCAnY3JlYXRlZCcsIHsgbW9kZTogUmVzb3VyY2VXcml0ZU1vZGUuQXBwZW5kIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICdjcmVhdGVkLnR4dCcpLCAndXRmOCcpLCAnY3JlYXRlZCcpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlV3JpdGUgaW5zZXJ0IGNyZWF0ZXMgYSBtaXNzaW5nIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtaW5zZXJ0LWNyZWF0ZScpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1pbnNlcnQtY3JlYXRlLScpO1xuXHRcdGNvbnN0IGZpbGUgPSBmaWxlVXJpKHJvb3QsICdjcmVhdGVkLnR4dCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVUZXh0KGZpbGUsICdjcmVhdGVkJywgeyBtb2RlOiBSZXNvdXJjZVdyaXRlTW9kZS5JbnNlcnQsIHBvc2l0aW9uOiAwIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICdjcmVhdGVkLnR4dCcpLCAndXRmOCcpLCAnY3JlYXRlZCcpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlV3JpdGUgYWNjZXB0cyB0aGUgY3VycmVudCBldGFnJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWlmLW1hdGNoLWN1cnJlbnQnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtaWYtbWF0Y2gtY3VycmVudC0nKTtcblx0XHRjb25zdCBmaWxlID0gZmlsZVVyaShyb290LCAnZXRhZy50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ2V0YWcudHh0JyksICdiZWZvcmUnKTtcblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PigncmVzb3VyY2VSZXNvbHZlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IGZpbGUsXG5cdFx0fSk7XG5cdFx0aWYgKHJlc29sdmVkLmV0YWcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5za2lwKCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgd3JpdGVUZXh0KGZpbGUsICdhZnRlcicsIHsgaWZNYXRjaDogcmVzb2x2ZWQuZXRhZyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoam9pbihyb290LCAnZXRhZy50eHQnKSwgJ3V0ZjgnKSwgJ2FmdGVyJyk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VXcml0ZSBpZk1hdGNoIHJlamVjdHMgYSBtaXNzaW5nIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtaWYtbWF0Y2gtbWlzc2luZycpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1pZi1tYXRjaC1taXNzaW5nLScpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMod3JpdGVUZXh0KGZpbGVVcmkocm9vdCwgJ21pc3NpbmcudHh0JyksICdjb250ZW50JywgeyBpZk1hdGNoOiAnbWlzc2luZy1ldGFnJyB9KSwge1xuXHRcdFx0Y29kZTogQWhwRXJyb3JDb2Rlcy5Db25mbGljdCxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZUNvcHkgcmVjdXJzaXZlbHkgY29waWVzIGEgZGlyZWN0b3J5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWNvcHktZGlyZWN0b3J5Jyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLWNvcHktZGlyZWN0b3J5LScpO1xuXHRcdG1rZGlyU3luYyhqb2luKHJvb3QsICdzb3VyY2UnLCAnbmVzdGVkJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnc291cmNlJywgJ25lc3RlZCcsICdmaWxlLnR4dCcpLCAnY29waWVkJyk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZUNvcHknLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHNvdXJjZTogZmlsZVVyaShyb290LCAnc291cmNlJyksXG5cdFx0XHRkZXN0aW5hdGlvbjogZmlsZVVyaShyb290LCAnZGVzdGluYXRpb24nKSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoam9pbihyb290LCAnZGVzdGluYXRpb24nLCAnbmVzdGVkJywgJ2ZpbGUudHh0JyksICd1dGY4JyksICdjb3BpZWQnKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZUNvcHkgb3ZlcndyaXRlcyBhbiBleGlzdGluZyBkZXN0aW5hdGlvbiBieSBkZWZhdWx0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWNvcHktb3ZlcndyaXRlJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLWNvcHktb3ZlcndyaXRlLScpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnc291cmNlLnR4dCcpLCAnc291cmNlJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHJvb3QsICdkZXN0aW5hdGlvbi50eHQnKSwgJ2Rlc3RpbmF0aW9uJyk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZUNvcHknLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHNvdXJjZTogZmlsZVVyaShyb290LCAnc291cmNlLnR4dCcpLFxuXHRcdFx0ZGVzdGluYXRpb246IGZpbGVVcmkocm9vdCwgJ2Rlc3RpbmF0aW9uLnR4dCcpLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICdkZXN0aW5hdGlvbi50eHQnKSwgJ3V0ZjgnKSwgJ3NvdXJjZScpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlQ29weSByZXBvcnRzIGEgbWlzc2luZyBzb3VyY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtY29weS1taXNzaW5nJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLWNvcHktbWlzc2luZy0nKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlQ29weScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0c291cmNlOiBmaWxlVXJpKHJvb3QsICdtaXNzaW5nLnR4dCcpLFxuXHRcdFx0ZGVzdGluYXRpb246IGZpbGVVcmkocm9vdCwgJ2Rlc3RpbmF0aW9uLnR4dCcpLFxuXHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQgfSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VNb3ZlIHJlbG9jYXRlcyBhIGRpcmVjdG9yeSB0cmVlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLW1vdmUtZGlyZWN0b3J5Jyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLW1vdmUtZGlyZWN0b3J5LScpO1xuXHRcdG1rZGlyU3luYyhqb2luKHJvb3QsICdzb3VyY2UnLCAnbmVzdGVkJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnc291cmNlJywgJ25lc3RlZCcsICdmaWxlLnR4dCcpLCAnbW92ZWQnKTtcblxuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlTW92ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0c291cmNlOiBmaWxlVXJpKHJvb3QsICdzb3VyY2UnKSxcblx0XHRcdGRlc3RpbmF0aW9uOiBmaWxlVXJpKHJvb3QsICdkZXN0aW5hdGlvbicpLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzb3VyY2VFeGlzdHM6IGV4aXN0c1N5bmMoam9pbihyb290LCAnc291cmNlJykpLFxuXHRcdFx0Y29udGVudHM6IHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICdkZXN0aW5hdGlvbicsICduZXN0ZWQnLCAnZmlsZS50eHQnKSwgJ3V0ZjgnKSxcblx0XHR9LCB7XG5cdFx0XHRzb3VyY2VFeGlzdHM6IGZhbHNlLFxuXHRcdFx0Y29udGVudHM6ICdtb3ZlZCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VNb3ZlIG92ZXJ3cml0ZXMgYW4gZXhpc3RpbmcgZGVzdGluYXRpb24gYnkgZGVmYXVsdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1tb3ZlLW92ZXJ3cml0ZScpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1tb3ZlLW92ZXJ3cml0ZS0nKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ3NvdXJjZS50eHQnKSwgJ3NvdXJjZScpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnZGVzdGluYXRpb24udHh0JyksICdkZXN0aW5hdGlvbicpO1xuXG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VNb3ZlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRzb3VyY2U6IGZpbGVVcmkocm9vdCwgJ3NvdXJjZS50eHQnKSxcblx0XHRcdGRlc3RpbmF0aW9uOiBmaWxlVXJpKHJvb3QsICdkZXN0aW5hdGlvbi50eHQnKSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c291cmNlRXhpc3RzOiBleGlzdHNTeW5jKGpvaW4ocm9vdCwgJ3NvdXJjZS50eHQnKSksXG5cdFx0XHRjb250ZW50czogcmVhZEZpbGVTeW5jKGpvaW4ocm9vdCwgJ2Rlc3RpbmF0aW9uLnR4dCcpLCAndXRmOCcpLFxuXHRcdH0sIHtcblx0XHRcdHNvdXJjZUV4aXN0czogZmFsc2UsXG5cdFx0XHRjb250ZW50czogJ3NvdXJjZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VNb3ZlIHJlcG9ydHMgYSBtaXNzaW5nIHNvdXJjZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1tb3ZlLW1pc3NpbmcnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtbW92ZS1taXNzaW5nLScpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VNb3ZlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRzb3VyY2U6IGZpbGVVcmkocm9vdCwgJ21pc3NpbmcudHh0JyksXG5cdFx0XHRkZXN0aW5hdGlvbjogZmlsZVVyaShyb290LCAnZGVzdGluYXRpb24udHh0JyksXG5cdFx0fSksIHsgY29kZTogQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCB9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZURlbGV0ZSByZXF1aXJlcyByZWN1cnNpdmUgbW9kZSBmb3IgYSBub24tZW1wdHkgZGlyZWN0b3J5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWRlbGV0ZS1ub24tcmVjdXJzaXZlJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLWRlbGV0ZS1ub24tcmVjdXJzaXZlLScpO1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IGpvaW4ocm9vdCwgJ2RpcmVjdG9yeScpO1xuXHRcdG1rZGlyU3luYyhkaXJlY3RvcnkpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihkaXJlY3RvcnksICdmaWxlLnR4dCcpLCAncHJlc2VydmVkJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZURlbGV0ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBVUkkuZmlsZShkaXJlY3RvcnkpLnRvU3RyaW5nKCksXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoam9pbihkaXJlY3RvcnksICdmaWxlLnR4dCcpLCAndXRmOCcpLCAncHJlc2VydmVkJyk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VEZWxldGUgcmVwb3J0cyBhIG1pc3NpbmcgcmVzb3VyY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtZGVsZXRlLW1pc3NpbmcnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtZGVsZXRlLW1pc3NpbmctJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZURlbGV0ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBmaWxlVXJpKHJvb3QsICdtaXNzaW5nLnR4dCcpLFxuXHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQgfSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VSZWFkIHJlcG9ydHMgYSBtaXNzaW5nIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtcmVhZC1taXNzaW5nJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLXJlYWQtbWlzc2luZy0nKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlUmVhZCcsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBmaWxlVXJpKHJvb3QsICdtaXNzaW5nLnR4dCcpLFxuXHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQgfSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VMaXN0IHJlcG9ydHMgYSBtaXNzaW5nIGRpcmVjdG9yeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1saXN0LW1pc3NpbmcnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtbGlzdC1taXNzaW5nLScpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VMaXN0Jywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IGZpbGVVcmkocm9vdCwgJ21pc3NpbmcnKSxcblx0XHR9KSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kIH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlTGlzdCByZWplY3RzIGEgZmlsZSByZXNvdXJjZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1saXN0LWZpbGUnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtbGlzdC1maWxlLScpO1xuXHRcdGNvbnN0IGZpbGUgPSBmaWxlVXJpKHJvb3QsICdmaWxlLnR4dCcpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnZmlsZS50eHQnKSwgJ2NvbnRlbnQnKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlTGlzdCcsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBmaWxlLFxuXHRcdH0pKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZVdyaXRlIHJlcG9ydHMgYSBtaXNzaW5nIHBhcmVudCBkaXJlY3RvcnknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2Utd3JpdGUtbWlzc2luZy1wYXJlbnQnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2Utd3JpdGUtbWlzc2luZy1wYXJlbnQtJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyh3cml0ZVRleHQoZmlsZVVyaShyb290LCAnbWlzc2luZycsICdmaWxlLnR4dCcpLCAnY29udGVudCcpLCB7XG5cdFx0XHRjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlUmVzb2x2ZSByZXBvcnRzIGEgbWlzc2luZyByZXNvdXJjZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1yZXNvbHZlLW1pc3NpbmcnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtcmVzb2x2ZS1taXNzaW5nLScpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VSZXNvbHZlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IGZpbGVVcmkocm9vdCwgJ21pc3NpbmcnKSxcblx0XHR9KSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kIH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2hvc3QgcmVhZHMgYSBjbGllbnQtaG9zdGVkIHBsdWdpbiB0aHJvdWdoIHJldmVyc2UgcmVzb3VyY2UgcmVxdWVzdHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gVGhlIHBsdWdpbiBpcyBwdWJsaXNoZWQgYXMgYmVsb25naW5nIHRvIHRoaXMgY2xpZW50LCBzbyB0aGUgaG9zdFxuXHRcdC8vIGFkZHJlc3NlcyBpdCB0aHJvdWdoIHRoZSBgdnNjb2RlLWFnZW50LWNsaWVudGAgc2NoZW1lIGFuZCBmZXRjaGVzIGl0XG5cdFx0Ly8gb3ZlciB0aGUgY29ubmVjdGlvbi4gQm90aCBwcm9jZXNzZXMgc2hhcmUgYSBmaWxlc3lzdGVtIGhlcmUsIHNvIGl0IGlzXG5cdFx0Ly8gdGhlIGFzc2VydGlvbiBvbiBgc2VydmVkUmV2ZXJzZVJlcXVlc3RzYCBcdTIwMTQgbm90IHdoZXJlIHRoZSBkaXJlY3Rvcnlcblx0XHQvLyBzaXRzIFx1MjAxNCB0aGF0IHByb3ZlcyB0aGUgcmV2ZXJzZSBwYXRoIHdhcyBhY3R1YWxseSB1c2VkLlxuXHRcdGNvbnN0IHBsdWdpblJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1jbGllbnQtcGx1Z2luLScpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihwbHVnaW5Sb290LCAncGx1Z2luLmpzb24nKSwgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAnZTJlLWNsaWVudC1wbHVnaW4nLCB2ZXJzaW9uOiAnMS4wLjAnIH0pKTtcblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgY2xpZW50LWZzLSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUoY3JlYXRlV29ya3NwYWNlKCdhaHAtY2xpZW50LWZzLXdzLScpKSk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiBgY2xpZW50LWZzLSR7Y29uZmlnLnByb3ZpZGVyfWAsXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IENsaWVudCcsXG5cdFx0XHRcdFx0dG9vbHM6IFtdLFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbe1xuXHRcdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdFx0dXJpOiBVUkkuZmlsZShwbHVnaW5Sb290KS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0bmFtZTogJ2UyZS1jbGllbnQtcGx1Z2luJyxcblx0XHRcdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRub25jZTogJ25vbmNlLTEnLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdC8vIGBzZXNzaW9uL2N1c3RvbWl6YXRpb25VcGRhdGVkYCBpcyBlbWl0dGVkIG9uIGJvdGggdGhlIHN1Y2Nlc3MgYW5kIHRoZVxuXHRcdC8vIGZhaWx1cmUgcGF0aCB3aXRoIHRoZSBzYW1lIGB1cmlgLCBzbyB0aGUgbG9hZCBzdGF0ZSBpcyB3aGF0IHNlcGFyYXRlc1xuXHRcdC8vIFwibWF0ZXJpYWxpemVkIGZyb20gdGhlIGNsaWVudFwiIGZyb20gXCJ0cmllZCBhbmQgZmFpbGVkXCIuXG5cdFx0Y29uc3QgdXBkYXRlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdzZXNzaW9uL2N1c3RvbWl6YXRpb25VcGRhdGVkJykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbiA9IChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyBjdXN0b21pemF0aW9uPzogeyB1cmk/OiBzdHJpbmc7IGxvYWQ/OiB7IGtpbmQ/OiBzdHJpbmcgfSB9IH0pLmN1c3RvbWl6YXRpb247XG5cdFx0XHRyZXR1cm4gY3VzdG9taXphdGlvbj8udXJpID09PSBVUkkuZmlsZShwbHVnaW5Sb290KS50b1N0cmluZygpICYmIGN1c3RvbWl6YXRpb24/LmxvYWQ/LmtpbmQgIT09IHVuZGVmaW5lZDtcblx0XHR9LCA2MF8wMDApO1xuXG5cdFx0Y29uc3QgbG9hZEtpbmQgPSAoZ2V0QWN0aW9uRW52ZWxvcGUodXBkYXRlZCkuYWN0aW9uIGFzIHsgY3VzdG9taXphdGlvbj86IHsgbG9hZD86IHsga2luZD86IHN0cmluZyB9IH0gfSkuY3VzdG9taXphdGlvbj8ubG9hZD8ua2luZDtcblx0XHQvLyBDb21wYXJlIGJvdGggc2lkZXMgdGhyb3VnaCBgVVJJYCwgbmV2ZXIgYSByYXcgZmlsZXN5c3RlbSBwYXRoOiBgZnNQYXRoYFxuXHRcdC8vIGxvd2VyLWNhc2VzIHRoZSBXaW5kb3dzIGRyaXZlIGxldHRlciwgc28gYSBzZXJ2ZWRcblx0XHQvLyBgZmlsZTovLy9jJTNBLy4uLmAgYW5kIGEgYHBsdWdpblJvb3RgIG9mIGBDOlxcLi4uYCBkZXNjcmliZSB0aGUgc2FtZVxuXHRcdC8vIGRpcmVjdG9yeSBidXQgZG8gbm90IG1hdGNoIGFzIHN0cmluZ3MuIGB0bXBkaXIoKWAgYW5kIGl0cyBjYW5vbmljYWxcblx0XHQvLyBmb3JtIGFsc28gZGlmZmVyIG9uIG1hY09TIChgL3ZhcmAgdnMgYC9wcml2YXRlL3ZhcmApLCBzbyBib3RoXG5cdFx0Ly8gc3BlbGxpbmdzIG9mIHRoZSByb290IGFyZSBhY2NlcHRlZC5cblx0XHRjb25zdCBwbHVnaW5Sb290UGF0aHMgPSBbcGx1Z2luUm9vdCwgcmVhbHBhdGhTeW5jKHBsdWdpblJvb3QpXS5tYXAocGF0aCA9PiBVUkkuZmlsZShwYXRoKS5mc1BhdGgpO1xuXHRcdGNvbnN0IHNlcnZlZEZvclBsdWdpbiA9IGNvbnRleHQuY2xpZW50LnNlcnZlZFJldmVyc2VSZXF1ZXN0cy5maWx0ZXIocmVxdWVzdCA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSByZXF1ZXN0LnVyaTtcblx0XHRcdGlmICh1cmkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXF1ZXN0ZWQgPSBVUkkucGFyc2UodXJpKS5mc1BhdGg7XG5cdFx0XHRyZXR1cm4gcGx1Z2luUm9vdFBhdGhzLnNvbWUocm9vdCA9PiByZXF1ZXN0ZWQuc3RhcnRzV2l0aChyb290KSk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxvYWRLaW5kLFxuXHRcdFx0cmVhY2hlZEJhY2tUb0NsaWVudDogc2VydmVkRm9yUGx1Z2luLmxlbmd0aCA+IDAsXG5cdFx0XHRyZWFkVGhlUGx1Z2luRmlsZTogc2VydmVkRm9yUGx1Z2luLnNvbWUocmVxdWVzdCA9PiByZXF1ZXN0Lm1ldGhvZCA9PT0gJ3Jlc291cmNlUmVhZCcpLFxuXHRcdH0sIHtcblx0XHRcdGxvYWRLaW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQsXG5cdFx0XHRyZWFjaGVkQmFja1RvQ2xpZW50OiB0cnVlLFxuXHRcdFx0cmVhZFRoZVBsdWdpbkZpbGU6IHRydWUsXG5cdFx0fSwgYHNlcnZlZCByZXZlcnNlIHJlcXVlc3RzOiAke0pTT04uc3RyaW5naWZ5KGNvbnRleHQuY2xpZW50LnNlcnZlZFJldmVyc2VSZXF1ZXN0cyl9YCk7XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBcUJBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFlBQVksV0FBVyxhQUFhLGNBQWMsY0FBYyxxQkFBcUI7QUFDOUYsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx3QkFBd0I7QUFRakMsU0FBUyxpQkFBaUIsY0FBYyx5QkFBeUI7QUFDakUsU0FBUywwQkFBd0U7QUFDakYsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxxQkFBMkM7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
