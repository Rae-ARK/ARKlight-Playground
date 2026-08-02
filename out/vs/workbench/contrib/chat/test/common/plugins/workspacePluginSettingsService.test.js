import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { waitForState } from "../../../../../../base/common/observable.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { TestContextService } from "../../../../../test/common/workbenchTestServices.js";
import { testWorkspace } from "../../../../../../platform/workspace/test/common/testWorkspace.js";
import { WorkspacePluginSettingsService } from "../../../common/plugins/workspacePluginSettingsService.js";
suite("WorkspacePluginSettingsService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const logService = new NullLogService();
  let fileService;
  let workspaceContextService;
  const workspaceRoot = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
  setup(() => {
    workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    fileService = store.add(new FileService(logService));
    store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
  });
  function createService() {
    return store.add(new WorkspacePluginSettingsService(
      fileService,
      workspaceContextService,
      logService
    ));
  }
  async function writeClaudeSettings(content) {
    const uri = URI.from({ scheme: Schemas.inMemory, path: "/workspace/.claude/settings.json" });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
  }
  async function writeClaudeLocalSettings(content) {
    const uri = URI.from({ scheme: Schemas.inMemory, path: "/workspace/.claude/settings.local.json" });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
  }
  async function writeCopilotSettings(content) {
    const uri = URI.from({ scheme: Schemas.inMemory, path: "/workspace/.github/copilot/settings.json" });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
  }
  test("parses enabledPlugins from Claude settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      enabledPlugins: {
        "my-plugin@my-marketplace": true,
        "disabled-plugin@my-marketplace": false
      }
    }));
    const service = createService();
    await waitForState(service.enabledPlugins, (v) => v.size > 0);
    const enabled = service.enabledPlugins.get();
    assert.strictEqual(enabled.get("my-plugin@my-marketplace"), true);
    assert.strictEqual(enabled.get("disabled-plugin@my-marketplace"), false);
    assert.strictEqual(enabled.size, 2);
  }));
  test("settings.local.json overrides settings.json for enabledPlugins", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      enabledPlugins: {
        "my-plugin@mp": true,
        "other-plugin@mp": true
      }
    }));
    await writeClaudeLocalSettings(JSON.stringify({
      enabledPlugins: {
        "my-plugin@mp": false
      }
    }));
    const service = createService();
    await waitForState(service.enabledPlugins, (v) => v.size > 0);
    const enabled = service.enabledPlugins.get();
    assert.strictEqual(enabled.get("my-plugin@mp"), false, "local should override shared");
    assert.strictEqual(enabled.get("other-plugin@mp"), true, "non-overridden key preserved");
  }));
  test("merges enabledPlugins from Claude and Copilot settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      enabledPlugins: { "from-claude@mp": true }
    }));
    await writeCopilotSettings(JSON.stringify({
      enabledPlugins: { "from-copilot@mp": true }
    }));
    const service = createService();
    await waitForState(service.enabledPlugins, (v) => v.size >= 2);
    const enabled = service.enabledPlugins.get();
    assert.strictEqual(enabled.get("from-claude@mp"), true);
    assert.strictEqual(enabled.get("from-copilot@mp"), true);
  }));
  test("Claude enabledPlugins take precedence over Copilot for same key", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      enabledPlugins: { "shared-plugin@mp": false }
    }));
    await writeCopilotSettings(JSON.stringify({
      enabledPlugins: { "shared-plugin@mp": true }
    }));
    const service = createService();
    await waitForState(service.enabledPlugins, (v) => v.size > 0);
    const enabled = service.enabledPlugins.get();
    assert.strictEqual(enabled.get("shared-plugin@mp"), false, "Claude should win");
  }));
  test("parses GitHub shorthand from extraKnownMarketplaces", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      extraKnownMarketplaces: {
        "my-marketplace": {
          source: "github",
          repo: "owner/repo"
        }
      }
    }));
    const service = createService();
    await waitForState(service.extraMarketplaces, (v) => v.length > 0);
    const marketplaces = service.extraMarketplaces.get();
    assert.strictEqual(marketplaces.length, 1);
    assert.strictEqual(marketplaces[0].name, "my-marketplace");
    assert.strictEqual(marketplaces[0].reference.displayLabel, "my-marketplace");
    assert.strictEqual(marketplaces[0].reference.githubRepo, "owner/repo");
  }));
  test("parses marketplace refs from extraKnownMarketplaces", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      extraKnownMarketplaces: {
        "my-marketplace": {
          source: "github",
          repo: "owner/repo",
          ref: "marketplace"
        }
      }
    }));
    const service = createService();
    await waitForState(service.extraMarketplaces, (v) => v.length > 0);
    const marketplaces = service.extraMarketplaces.get();
    assert.strictEqual(marketplaces[0].reference.ref, "marketplace");
    assert.strictEqual(marketplaces[0].reference.canonicalId, "github:owner/repo#marketplace");
  }));
  test("parses nested source object from extraKnownMarketplaces", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      extraKnownMarketplaces: {
        "nested-mp": {
          source: {
            source: "github",
            repo: "nested-owner/nested-repo"
          }
        }
      }
    }));
    const service = createService();
    await waitForState(service.extraMarketplaces, (v) => v.length > 0);
    const marketplaces = service.extraMarketplaces.get();
    assert.strictEqual(marketplaces.length, 1);
    assert.strictEqual(marketplaces[0].reference.githubRepo, "nested-owner/nested-repo");
    assert.strictEqual(marketplaces[0].reference.displayLabel, "nested-mp");
  }));
  test("deduplicates marketplaces across Claude and Copilot by canonical ID", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      extraKnownMarketplaces: {
        "claude-name": { source: "github", repo: "owner/repo" }
      }
    }));
    await writeCopilotSettings(JSON.stringify({
      extraKnownMarketplaces: {
        "copilot-name": { source: "github", repo: "owner/repo" }
      }
    }));
    const service = createService();
    await waitForState(service.extraMarketplaces, (v) => v.length > 0);
    const marketplaces = service.extraMarketplaces.get();
    assert.strictEqual(marketplaces.length, 1, "should deduplicate by canonical ID");
    assert.strictEqual(marketplaces[0].name, "claude-name", "Claude entry should win");
  }));
  test("ignores invalid enabledPlugins shapes", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      enabledPlugins: "not-an-object"
    }));
    const service = createService();
    await new Promise((r) => queueMicrotask(r));
    assert.strictEqual(service.enabledPlugins.get().size, 0);
  }));
  test("ignores non-boolean values in enabledPlugins", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      enabledPlugins: {
        "valid@mp": true,
        "number@mp": 42,
        "string@mp": "yes"
      }
    }));
    const service = createService();
    await waitForState(service.enabledPlugins, (v) => v.size > 0);
    const enabled = service.enabledPlugins.get();
    assert.strictEqual(enabled.size, 1);
    assert.strictEqual(enabled.get("valid@mp"), true);
  }));
  test("ignores non-object marketplace entries", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      extraKnownMarketplaces: {
        "valid": { source: "github", repo: "owner/repo" },
        "invalid-string": "not-valid",
        "invalid-number": 42
      }
    }));
    const service = createService();
    await waitForState(service.extraMarketplaces, (v) => v.length > 0);
    const marketplaces = service.extraMarketplaces.get();
    assert.strictEqual(marketplaces.length, 1);
    assert.strictEqual(marketplaces[0].name, "valid");
  }));
  test("returns empty observables when no settings files exist", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const service = createService();
    await new Promise((r) => queueMicrotask(r));
    assert.strictEqual(service.enabledPlugins.get().size, 0);
    assert.strictEqual(service.extraMarketplaces.get().length, 0);
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcGx1Z2lucy93b3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyB3YWl0Rm9yU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IHRlc3RXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvdGVzdC9jb21tb24vdGVzdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGx1Z2lucy93b3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UuanMnO1xuXG5zdWl0ZSgnV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cblx0bGV0IGZpbGVTZXJ2aWNlOiBGaWxlU2VydmljZTtcblx0bGV0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBUZXN0Q29udGV4dFNlcnZpY2U7XG5cdGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy93b3Jrc3BhY2UnIH0pO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IG5ldyBUZXN0Q29udGV4dFNlcnZpY2UodGVzdFdvcmtzcGFjZSh3b3Jrc3BhY2VSb290KSk7XG5cdFx0ZmlsZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0XHRzdG9yZS5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmluTWVtb3J5LCBzdG9yZS5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNlcnZpY2UoKTogV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlIHtcblx0XHRyZXR1cm4gc3RvcmUuYWRkKG5ldyBXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UoXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHQpKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHdyaXRlQ2xhdWRlU2V0dGluZ3MoY29udGVudDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlLy5jbGF1ZGUvc2V0dGluZ3MuanNvbicgfSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiB3cml0ZUNsYXVkZUxvY2FsU2V0dGluZ3MoY29udGVudDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlLy5jbGF1ZGUvc2V0dGluZ3MubG9jYWwuanNvbicgfSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiB3cml0ZUNvcGlsb3RTZXR0aW5ncyhjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90L3NldHRpbmdzLmpzb24nIH0pO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHR9XG5cblx0Ly8gLS0tIGVuYWJsZWRQbHVnaW5zIHBhcnNpbmcgLS0tXG5cblx0dGVzdCgncGFyc2VzIGVuYWJsZWRQbHVnaW5zIGZyb20gQ2xhdWRlIHNldHRpbmdzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd3JpdGVDbGF1ZGVTZXR0aW5ncyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRlbmFibGVkUGx1Z2luczoge1xuXHRcdFx0XHQnbXktcGx1Z2luQG15LW1hcmtldHBsYWNlJzogdHJ1ZSxcblx0XHRcdFx0J2Rpc2FibGVkLXBsdWdpbkBteS1tYXJrZXRwbGFjZSc6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHNlcnZpY2UuZW5hYmxlZFBsdWdpbnMsIHYgPT4gdi5zaXplID4gMCk7XG5cblx0XHRjb25zdCBlbmFibGVkID0gc2VydmljZS5lbmFibGVkUGx1Z2lucy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZC5nZXQoJ215LXBsdWdpbkBteS1tYXJrZXRwbGFjZScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZC5nZXQoJ2Rpc2FibGVkLXBsdWdpbkBteS1tYXJrZXRwbGFjZScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWQuc2l6ZSwgMik7XG5cdH0pKTtcblxuXHR0ZXN0KCdzZXR0aW5ncy5sb2NhbC5qc29uIG92ZXJyaWRlcyBzZXR0aW5ncy5qc29uIGZvciBlbmFibGVkUGx1Z2lucycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlQ2xhdWRlU2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IHtcblx0XHRcdFx0J215LXBsdWdpbkBtcCc6IHRydWUsXG5cdFx0XHRcdCdvdGhlci1wbHVnaW5AbXAnOiB0cnVlLFxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUNsYXVkZUxvY2FsU2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IHtcblx0XHRcdFx0J215LXBsdWdpbkBtcCc6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHNlcnZpY2UuZW5hYmxlZFBsdWdpbnMsIHYgPT4gdi5zaXplID4gMCk7XG5cblx0XHRjb25zdCBlbmFibGVkID0gc2VydmljZS5lbmFibGVkUGx1Z2lucy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZC5nZXQoJ215LXBsdWdpbkBtcCcpLCBmYWxzZSwgJ2xvY2FsIHNob3VsZCBvdmVycmlkZSBzaGFyZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZC5nZXQoJ290aGVyLXBsdWdpbkBtcCcpLCB0cnVlLCAnbm9uLW92ZXJyaWRkZW4ga2V5IHByZXNlcnZlZCcpO1xuXHR9KSk7XG5cblx0dGVzdCgnbWVyZ2VzIGVuYWJsZWRQbHVnaW5zIGZyb20gQ2xhdWRlIGFuZCBDb3BpbG90IHNldHRpbmdzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd3JpdGVDbGF1ZGVTZXR0aW5ncyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRlbmFibGVkUGx1Z2luczogeyAnZnJvbS1jbGF1ZGVAbXAnOiB0cnVlIH1cblx0XHR9KSk7XG5cdFx0YXdhaXQgd3JpdGVDb3BpbG90U2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IHsgJ2Zyb20tY29waWxvdEBtcCc6IHRydWUgfVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHNlcnZpY2UuZW5hYmxlZFBsdWdpbnMsIHYgPT4gdi5zaXplID49IDIpO1xuXG5cdFx0Y29uc3QgZW5hYmxlZCA9IHNlcnZpY2UuZW5hYmxlZFBsdWdpbnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWQuZ2V0KCdmcm9tLWNsYXVkZUBtcCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZC5nZXQoJ2Zyb20tY29waWxvdEBtcCcpLCB0cnVlKTtcblx0fSkpO1xuXG5cdHRlc3QoJ0NsYXVkZSBlbmFibGVkUGx1Z2lucyB0YWtlIHByZWNlZGVuY2Ugb3ZlciBDb3BpbG90IGZvciBzYW1lIGtleScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlQ2xhdWRlU2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IHsgJ3NoYXJlZC1wbHVnaW5AbXAnOiBmYWxzZSB9XG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlQ29waWxvdFNldHRpbmdzKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGVuYWJsZWRQbHVnaW5zOiB7ICdzaGFyZWQtcGx1Z2luQG1wJzogdHJ1ZSB9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc2VydmljZS5lbmFibGVkUGx1Z2lucywgdiA9PiB2LnNpemUgPiAwKTtcblxuXHRcdGNvbnN0IGVuYWJsZWQgPSBzZXJ2aWNlLmVuYWJsZWRQbHVnaW5zLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkLmdldCgnc2hhcmVkLXBsdWdpbkBtcCcpLCBmYWxzZSwgJ0NsYXVkZSBzaG91bGQgd2luJyk7XG5cdH0pKTtcblxuXHQvLyAtLS0gZXh0cmFLbm93bk1hcmtldHBsYWNlcyBwYXJzaW5nIC0tLVxuXG5cdHRlc3QoJ3BhcnNlcyBHaXRIdWIgc2hvcnRoYW5kIGZyb20gZXh0cmFLbm93bk1hcmtldHBsYWNlcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlQ2xhdWRlU2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0ZXh0cmFLbm93bk1hcmtldHBsYWNlczoge1xuXHRcdFx0XHQnbXktbWFya2V0cGxhY2UnOiB7XG5cdFx0XHRcdFx0c291cmNlOiAnZ2l0aHViJyxcblx0XHRcdFx0XHRyZXBvOiAnb3duZXIvcmVwbycsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzZXJ2aWNlLmV4dHJhTWFya2V0cGxhY2VzLCB2ID0+IHYubGVuZ3RoID4gMCk7XG5cblx0XHRjb25zdCBtYXJrZXRwbGFjZXMgPSBzZXJ2aWNlLmV4dHJhTWFya2V0cGxhY2VzLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXRwbGFjZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2V0cGxhY2VzWzBdLm5hbWUsICdteS1tYXJrZXRwbGFjZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXRwbGFjZXNbMF0ucmVmZXJlbmNlLmRpc3BsYXlMYWJlbCwgJ215LW1hcmtldHBsYWNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtldHBsYWNlc1swXS5yZWZlcmVuY2UuZ2l0aHViUmVwbywgJ293bmVyL3JlcG8nKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3BhcnNlcyBtYXJrZXRwbGFjZSByZWZzIGZyb20gZXh0cmFLbm93bk1hcmtldHBsYWNlcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlQ2xhdWRlU2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0ZXh0cmFLbm93bk1hcmtldHBsYWNlczoge1xuXHRcdFx0XHQnbXktbWFya2V0cGxhY2UnOiB7XG5cdFx0XHRcdFx0c291cmNlOiAnZ2l0aHViJyxcblx0XHRcdFx0XHRyZXBvOiAnb3duZXIvcmVwbycsXG5cdFx0XHRcdFx0cmVmOiAnbWFya2V0cGxhY2UnLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc2VydmljZS5leHRyYU1hcmtldHBsYWNlcywgdiA9PiB2Lmxlbmd0aCA+IDApO1xuXG5cdFx0Y29uc3QgbWFya2V0cGxhY2VzID0gc2VydmljZS5leHRyYU1hcmtldHBsYWNlcy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2V0cGxhY2VzWzBdLnJlZmVyZW5jZS5yZWYsICdtYXJrZXRwbGFjZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXRwbGFjZXNbMF0ucmVmZXJlbmNlLmNhbm9uaWNhbElkLCAnZ2l0aHViOm93bmVyL3JlcG8jbWFya2V0cGxhY2UnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3BhcnNlcyBuZXN0ZWQgc291cmNlIG9iamVjdCBmcm9tIGV4dHJhS25vd25NYXJrZXRwbGFjZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3cml0ZUNsYXVkZVNldHRpbmdzKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGV4dHJhS25vd25NYXJrZXRwbGFjZXM6IHtcblx0XHRcdFx0J25lc3RlZC1tcCc6IHtcblx0XHRcdFx0XHRzb3VyY2U6IHtcblx0XHRcdFx0XHRcdHNvdXJjZTogJ2dpdGh1YicsXG5cdFx0XHRcdFx0XHRyZXBvOiAnbmVzdGVkLW93bmVyL25lc3RlZC1yZXBvJyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzZXJ2aWNlLmV4dHJhTWFya2V0cGxhY2VzLCB2ID0+IHYubGVuZ3RoID4gMCk7XG5cblx0XHRjb25zdCBtYXJrZXRwbGFjZXMgPSBzZXJ2aWNlLmV4dHJhTWFya2V0cGxhY2VzLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXRwbGFjZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2V0cGxhY2VzWzBdLnJlZmVyZW5jZS5naXRodWJSZXBvLCAnbmVzdGVkLW93bmVyL25lc3RlZC1yZXBvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtldHBsYWNlc1swXS5yZWZlcmVuY2UuZGlzcGxheUxhYmVsLCAnbmVzdGVkLW1wJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkZWR1cGxpY2F0ZXMgbWFya2V0cGxhY2VzIGFjcm9zcyBDbGF1ZGUgYW5kIENvcGlsb3QgYnkgY2Fub25pY2FsIElEJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd3JpdGVDbGF1ZGVTZXR0aW5ncyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRleHRyYUtub3duTWFya2V0cGxhY2VzOiB7XG5cdFx0XHRcdCdjbGF1ZGUtbmFtZSc6IHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ293bmVyL3JlcG8nIH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0YXdhaXQgd3JpdGVDb3BpbG90U2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0ZXh0cmFLbm93bk1hcmtldHBsYWNlczoge1xuXHRcdFx0XHQnY29waWxvdC1uYW1lJzogeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnb3duZXIvcmVwbycgfVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHNlcnZpY2UuZXh0cmFNYXJrZXRwbGFjZXMsIHYgPT4gdi5sZW5ndGggPiAwKTtcblxuXHRcdGNvbnN0IG1hcmtldHBsYWNlcyA9IHNlcnZpY2UuZXh0cmFNYXJrZXRwbGFjZXMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtldHBsYWNlcy5sZW5ndGgsIDEsICdzaG91bGQgZGVkdXBsaWNhdGUgYnkgY2Fub25pY2FsIElEJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtldHBsYWNlc1swXS5uYW1lLCAnY2xhdWRlLW5hbWUnLCAnQ2xhdWRlIGVudHJ5IHNob3VsZCB3aW4nKTtcblx0fSkpO1xuXG5cdC8vIC0tLSBJbnZhbGlkIGlucHV0IGhhbmRsaW5nIC0tLVxuXG5cdHRlc3QoJ2lnbm9yZXMgaW52YWxpZCBlbmFibGVkUGx1Z2lucyBzaGFwZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3cml0ZUNsYXVkZVNldHRpbmdzKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGVuYWJsZWRQbHVnaW5zOiAnbm90LWFuLW9iamVjdCdcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdC8vIEdpdmUgdGhlIGFzeW5jIHJlYWQgYSBjaGFuY2UgdG8gY29tcGxldGUgd2l0aCBmYWtlZCB0aW1lcnMuXG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ociA9PiBxdWV1ZU1pY3JvdGFzayhyKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5lbmFibGVkUGx1Z2lucy5nZXQoKS5zaXplLCAwKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2lnbm9yZXMgbm9uLWJvb2xlYW4gdmFsdWVzIGluIGVuYWJsZWRQbHVnaW5zJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd3JpdGVDbGF1ZGVTZXR0aW5ncyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRlbmFibGVkUGx1Z2luczoge1xuXHRcdFx0XHQndmFsaWRAbXAnOiB0cnVlLFxuXHRcdFx0XHQnbnVtYmVyQG1wJzogNDIsXG5cdFx0XHRcdCdzdHJpbmdAbXAnOiAneWVzJyxcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzZXJ2aWNlLmVuYWJsZWRQbHVnaW5zLCB2ID0+IHYuc2l6ZSA+IDApO1xuXG5cdFx0Y29uc3QgZW5hYmxlZCA9IHNlcnZpY2UuZW5hYmxlZFBsdWdpbnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWQuc2l6ZSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWQuZ2V0KCd2YWxpZEBtcCcpLCB0cnVlKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2lnbm9yZXMgbm9uLW9iamVjdCBtYXJrZXRwbGFjZSBlbnRyaWVzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd3JpdGVDbGF1ZGVTZXR0aW5ncyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRleHRyYUtub3duTWFya2V0cGxhY2VzOiB7XG5cdFx0XHRcdCd2YWxpZCc6IHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ293bmVyL3JlcG8nIH0sXG5cdFx0XHRcdCdpbnZhbGlkLXN0cmluZyc6ICdub3QtdmFsaWQnLFxuXHRcdFx0XHQnaW52YWxpZC1udW1iZXInOiA0Mixcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzZXJ2aWNlLmV4dHJhTWFya2V0cGxhY2VzLCB2ID0+IHYubGVuZ3RoID4gMCk7XG5cblx0XHRjb25zdCBtYXJrZXRwbGFjZXMgPSBzZXJ2aWNlLmV4dHJhTWFya2V0cGxhY2VzLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXRwbGFjZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2V0cGxhY2VzWzBdLm5hbWUsICd2YWxpZCcpO1xuXHR9KSk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSBvYnNlcnZhYmxlcyB3aGVuIG5vIHNldHRpbmdzIGZpbGVzIGV4aXN0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHF1ZXVlTWljcm90YXNrKHIpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmVuYWJsZWRQbHVnaW5zLmdldCgpLnNpemUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmV4dHJhTWFya2V0cGxhY2VzLmdldCgpLmxlbmd0aCwgMCk7XG5cdH0pKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQ0FBc0M7QUFFL0MsTUFBTSxrQ0FBa0MsTUFBTTtBQUM3QyxRQUFNLFFBQVEsd0NBQXdDO0FBQ3RELFFBQU0sYUFBYSxJQUFJLGVBQWU7QUFFdEMsTUFBSTtBQUNKLE1BQUk7QUFDSixRQUFNLGdCQUFnQixJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLGFBQWEsQ0FBQztBQUUvRSxRQUFNLE1BQU07QUFDWCw4QkFBMEIsSUFBSSxtQkFBbUIsY0FBYyxhQUFhLENBQUM7QUFDN0Usa0JBQWMsTUFBTSxJQUFJLElBQUksWUFBWSxVQUFVLENBQUM7QUFDbkQs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
