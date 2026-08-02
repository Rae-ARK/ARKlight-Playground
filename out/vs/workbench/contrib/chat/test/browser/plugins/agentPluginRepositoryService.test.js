import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IEnvironmentService } from "../../../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { IProgressService } from "../../../../../../platform/progress/common/progress.js";
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { IUserDataProfileService } from "../../../../../services/userDataProfile/common/userDataProfile.js";
import { AgentPluginRepositoryService } from "../../../browser/agentPluginRepositoryService.js";
import { MarketplaceType, parseMarketplaceReference, PluginSourceKind } from "../../../common/plugins/pluginMarketplaceService.js";
import { IPluginGitService } from "../../../common/plugins/pluginGitService.js";
suite("AgentPluginRepositoryService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function stubPluginGit(overrides) {
    return {
      _serviceBrand: void 0,
      cloneRepository: async () => {
      },
      pull: async () => false,
      checkout: async () => {
      },
      revParse: async () => "",
      fetch: async () => {
      },
      fetchRepository: async () => {
      },
      revListCount: async () => 0,
      ...overrides
    };
  }
  function createPlugin(marketplace, source) {
    const marketplaceReference = parseMarketplaceReference(marketplace);
    assert.ok(marketplaceReference);
    if (!marketplaceReference) {
      throw new Error("Expected marketplace reference to parse.");
    }
    return {
      name: "test-plugin",
      description: "",
      version: "",
      source,
      sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: source },
      marketplace: marketplaceReference.displayLabel,
      marketplaceReference,
      marketplaceType: MarketplaceType.Copilot
    };
  }
  function createService(onExists, onExecuteCommand, pluginGitStub) {
    const instantiationService = store.add(new TestInstantiationService());
    const fileService = {
      exists: async (resource) => onExists ? onExists(resource) : true
    };
    const progressService = {
      withProgress: async (_options, callback) => callback()
    };
    instantiationService.stub(ICommandService, {
      executeCommand: async (id, ...args) => {
        onExecuteCommand?.(id, ...args);
        return void 0;
      }
    });
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file("/cache/agentPlugins") } });
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(INotificationService, { notify: () => void 0 });
    instantiationService.stub(IPluginGitService, stubPluginGit({
      ...pluginGitStub
    }));
    instantiationService.stub(IProgressService, progressService);
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    return instantiationService.createInstance(AgentPluginRepositoryService);
  }
  test("uses cacheSegments path for GitHub shorthand plugin references", () => {
    const service = createService();
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
    assert.strictEqual(uri.path, "/cache/agentPlugins/github.com/microsoft/vscode");
  });
  test("uses ref-specific cache path for GitHub shorthand plugin references", () => {
    const service = createService();
    const plugin = createPlugin("microsoft/vscode#marketplace", "plugins/myPlugin");
    const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
    assert.strictEqual(uri.path, "/cache/agentPlugins/github.com/microsoft/vscode/ref_marketplace");
  });
  test("uses marketplaces cache path for direct git URI plugin references", () => {
    const service = createService();
    const plugin = createPlugin("https://example.com/org/repo.git", "plugins/myPlugin");
    const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
    assert.strictEqual(uri.path, "/cache/agentPlugins/example.com/org/repo");
  });
  test("uses same cache path for equivalent GitHub shorthand and URI references", () => {
    const service = createService();
    const shorthandPlugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const uriPlugin = createPlugin("https://github.com/microsoft/vscode.git", "plugins/myPlugin");
    const shorthandUri = service.getRepositoryUri(shorthandPlugin.marketplaceReference, shorthandPlugin.marketplaceType);
    const uriRefUri = service.getRepositoryUri(uriPlugin.marketplaceReference, uriPlugin.marketplaceType);
    assert.strictEqual(shorthandUri.path, "/cache/agentPlugins/github.com/microsoft/vscode");
    assert.strictEqual(uriRefUri.path, "/cache/agentPlugins/github.com/microsoft/vscode");
  });
  test("ensures plugin repositories via cacheSegments path", async () => {
    let checkedPath;
    const service = createService(async (resource) => {
      checkedPath = resource.path;
      return true;
    });
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const uri = await service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType });
    assert.strictEqual(checkedPath, "/cache/agentPlugins/github.com/microsoft/vscode");
    assert.strictEqual(uri.path, "/cache/agentPlugins/github.com/microsoft/vscode");
  });
  test("passes marketplace refs through cloneRepository", async () => {
    let clonedRef;
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(ICommandService, { executeCommand: async () => void 0 });
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file("/cache/agentPlugins") } });
    instantiationService.stub(IFileService, {
      exists: async () => false,
      createFolder: async () => void 0
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(INotificationService, { notify: () => void 0 });
    instantiationService.stub(IPluginGitService, stubPluginGit({
      cloneRepository: async (_cloneUrl, _targetDir, ref) => {
        clonedRef = ref;
      }
    }));
    instantiationService.stub(IProgressService, {
      withProgress: async (_options, callback) => callback()
    });
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    const service = instantiationService.createInstance(AgentPluginRepositoryService);
    const plugin = createPlugin("microsoft/vscode#marketplace", "plugins/myPlugin");
    await service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType });
    assert.strictEqual(clonedRef, "marketplace");
  });
  test("concurrent ensureRepository calls for the same marketplace clone only once", async () => {
    let cloneCount = 0;
    const instantiationService = store.add(new TestInstantiationService());
    let repoExists = false;
    const fileService = {
      exists: async (_resource) => repoExists,
      createFolder: async () => void 0
    };
    const progressService = {
      withProgress: async (_options, callback) => callback()
    };
    instantiationService.stub(ICommandService, {
      executeCommand: async () => void 0
    });
    instantiationService.stub(IPluginGitService, stubPluginGit({
      cloneRepository: async () => {
        cloneCount++;
        await new Promise((r) => setTimeout(r, 0));
        repoExists = true;
      }
    }));
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file("/cache/agentPlugins") } });
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(INotificationService, { notify: () => void 0 });
    instantiationService.stub(IProgressService, progressService);
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    const service = instantiationService.createInstance(AgentPluginRepositoryService);
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const [uri1, uri2] = await Promise.all([
      service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType }),
      service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType })
    ]);
    assert.strictEqual(cloneCount, 1);
    assert.strictEqual(uri1.path, "/cache/agentPlugins/github.com/microsoft/vscode");
    assert.strictEqual(uri2.path, "/cache/agentPlugins/github.com/microsoft/vscode");
  });
  test("builds install URI from source inside repository root", () => {
    const service = createService();
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const uri = service.getPluginInstallUri(plugin);
    assert.strictEqual(uri.path, "/cache/agentPlugins/github.com/microsoft/vscode/plugins/myPlugin");
  });
  test("uses indexed repository URI when available", () => {
    const storage = store.add(new InMemoryStorageService());
    storage.store("chat.plugins.marketplaces.index.v1", JSON.stringify({
      "github:microsoft/vscode": {
        repositoryUri: URI.file("/cache/agentPlugins/indexed/microsoft/vscode"),
        marketplaceType: MarketplaceType.Copilot
      }
    }), StorageScope.APPLICATION, StorageTarget.MACHINE);
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(ICommandService, { executeCommand: async () => void 0 });
    instantiationService.stub(IPluginGitService, stubPluginGit());
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file("/cache/agentPlugins") } });
    instantiationService.stub(IFileService, { exists: async () => true });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(INotificationService, { notify: () => void 0 });
    instantiationService.stub(IProgressService, { withProgress: async (_options, callback) => callback() });
    instantiationService.stub(IStorageService, storage);
    const service = instantiationService.createInstance(AgentPluginRepositoryService);
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
    assert.strictEqual(uri.path, "/cache/agentPlugins/indexed/microsoft/vscode");
  });
  test("rejects plugin source paths that escape repository root", () => {
    const service = createService();
    const plugin = createPlugin("microsoft/vscode", "../outside");
    assert.throws(() => service.getPluginInstallUri(plugin));
  });
  test("uses local repository URI for file marketplace references", () => {
    const service = createService();
    const plugin = createPlugin("file:///tmp/marketplace-repo", "plugins/myPlugin");
    const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
    assert.strictEqual(uri.scheme, "file");
    assert.strictEqual(uri.path, "/tmp/marketplace-repo");
  });
  test("does not invoke clone command when ensuring existing local file repository", async () => {
    let commandInvocationCount = 0;
    const service = createService(async () => true, () => {
      commandInvocationCount++;
    });
    const plugin = createPlugin("file:///tmp/marketplace-repo", "plugins/myPlugin");
    const uri = await service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType });
    assert.strictEqual(uri.path, "/tmp/marketplace-repo");
    assert.strictEqual(commandInvocationCount, 0);
  });
  test("builds revision-aware install URI for github plugin sources", () => {
    const service = createService();
    const uri = service.getPluginSourceInstallUri({
      kind: PluginSourceKind.GitHub,
      repo: "owner/repo",
      ref: "release/v1"
    });
    assert.strictEqual(uri.path, "/cache/agentPlugins/github.com/owner/repo/ref_release_v1");
  });
  test("updates git plugin source by pulling and checking out requested revision", async () => {
    const calls = [];
    const service = createService(async () => true, void 0, {
      revParse: async () => {
        calls.push("revParse");
        return "";
      },
      fetch: async () => {
        calls.push("fetch");
      },
      checkout: async () => {
        calls.push("checkout");
      },
      pull: async () => {
        calls.push("pull");
        return false;
      }
    });
    await service.updatePluginSource({
      name: "my-plugin",
      description: "",
      version: "",
      source: "",
      sourceDescriptor: {
        kind: PluginSourceKind.GitHub,
        repo: "owner/repo",
        sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
      },
      marketplace: "owner/repo",
      marketplaceReference: parseMarketplaceReference("owner/repo"),
      marketplaceType: MarketplaceType.Copilot
    }, {
      pluginName: "my-plugin",
      failureLabel: "my-plugin",
      marketplaceType: MarketplaceType.Copilot
    });
    assert.deepStrictEqual(calls, ["revParse", "fetch", "checkout", "revParse"]);
  });
  suite("cleanupPluginSource", () => {
    function createServiceWithDel(onDel, options) {
      const instantiationService = store.add(new TestInstantiationService());
      instantiationService.stub(ICommandService, { executeCommand: async () => void 0 });
      instantiationService.stub(IPluginGitService, stubPluginGit());
      instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
      instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file("/cache/agentPlugins") } });
      instantiationService.stub(IFileService, {
        exists: async () => true,
        del: async (resource) => {
          onDel(resource);
        },
        createFolder: async () => void 0,
        resolve: async (resource) => options?.resolve?.(resource) ?? { children: [] }
      });
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(INotificationService, { notify: () => void 0 });
      instantiationService.stub(IProgressService, { withProgress: async (_o, cb) => cb() });
      instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
      return instantiationService.createInstance(AgentPluginRepositoryService);
    }
    test("does not delete files for relative-path (marketplace) plugin", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource({
        name: "marketplace-plugin",
        description: "",
        version: "",
        source: "plugins/foo",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/foo" },
        marketplace: "microsoft/vscode",
        marketplaceReference: parseMarketplaceReference("microsoft/vscode"),
        marketplaceType: MarketplaceType.Copilot
      });
      assert.strictEqual(deleted.length, 0);
    });
    test("deletes cache for github plugin source", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource({
        name: "gh-plugin",
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" },
        marketplace: "owner/marketplace",
        marketplaceReference: parseMarketplaceReference("owner/marketplace"),
        marketplaceType: MarketplaceType.Copilot
      });
      assert.ok(deleted.length >= 1);
      assert.ok(deleted[0].includes("github.com/owner/repo"));
    });
    test("deletes parent cache dir for npm plugin source", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource({
        name: "npm-plugin",
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "@acme/plugin" },
        marketplace: "owner/marketplace",
        marketplaceReference: parseMarketplaceReference("owner/marketplace"),
        marketplaceType: MarketplaceType.Copilot
      });
      assert.ok(deleted.length >= 1);
      assert.ok(deleted[0].includes("/npm/"), `Expected npm path, got: ${deleted[0]}`);
    });
    test("deletes cache for pip plugin source", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource({
        name: "pip-plugin",
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pip-pkg" },
        marketplace: "owner/marketplace",
        marketplaceReference: parseMarketplaceReference("owner/marketplace"),
        marketplaceType: MarketplaceType.Copilot
      });
      assert.ok(deleted.length >= 1);
      assert.ok(deleted[0].includes("pip/my-pip-pkg"));
    });
    test("does not throw when delete fails", async () => {
      const instantiationService = store.add(new TestInstantiationService());
      instantiationService.stub(ICommandService, { executeCommand: async () => void 0 });
      instantiationService.stub(IPluginGitService, stubPluginGit());
      instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
      instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file("/cache/agentPlugins") } });
      instantiationService.stub(IFileService, {
        exists: async () => true,
        del: async () => {
          throw new Error("permission denied");
        },
        createFolder: async () => void 0,
        resolve: async () => ({ children: [] })
      });
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(INotificationService, { notify: () => void 0 });
      instantiationService.stub(IProgressService, { withProgress: async (_o, cb) => cb() });
      instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
      const service = instantiationService.createInstance(AgentPluginRepositoryService);
      await service.cleanupPluginSource({
        name: "gh-plugin",
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" },
        marketplace: "owner/marketplace",
        marketplaceReference: parseMarketplaceReference("owner/marketplace"),
        marketplaceType: MarketplaceType.Copilot
      });
    });
    test("prunes empty parent directories up to cache root", async () => {
      const deleted = [];
      const service = createServiceWithDel(
        (r) => deleted.push(r.path),
        { resolve: () => ({ children: [] }) }
      );
      await service.cleanupPluginSource({
        name: "gh-plugin",
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" },
        marketplace: "owner/marketplace",
        marketplaceReference: parseMarketplaceReference("owner/marketplace"),
        marketplaceType: MarketplaceType.Copilot
      });
      assert.ok(deleted.length >= 2, `Expected at least 2 deletions (repo + parent), got ${deleted.length}: ${deleted.join(", ")}`);
      assert.ok(deleted[0].includes("github.com/owner/repo"), "First delete should be the repo dir");
      assert.ok(deleted.some((p) => p.endsWith("/owner")), "Should prune empty owner directory");
    });
    test("stops pruning at non-empty parent", async () => {
      const deleted = [];
      const service = createServiceWithDel(
        (r) => deleted.push(r.path),
        {
          resolve: (resource) => {
            if (resource.path.endsWith("/owner")) {
              return { children: [{ name: "other-repo" }] };
            }
            return { children: [] };
          }
        }
      );
      await service.cleanupPluginSource({
        name: "gh-plugin",
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" },
        marketplace: "owner/marketplace",
        marketplaceReference: parseMarketplaceReference("owner/marketplace"),
        marketplaceType: MarketplaceType.Copilot
      });
      assert.strictEqual(deleted.length, 1);
      assert.ok(deleted[0].includes("github.com/owner/repo"));
    });
    test("skips deletion when another installed plugin shares the same cleanup target", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource(
        {
          name: "plugin-a",
          description: "",
          version: "",
          source: "",
          sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo", path: "plugins/a" },
          marketplace: "owner/marketplace",
          marketplaceReference: parseMarketplaceReference("owner/marketplace"),
          marketplaceType: MarketplaceType.Copilot
        },
        // Another plugin from the same repo still installed
        [{ kind: PluginSourceKind.GitHub, repo: "owner/repo", path: "plugins/b" }]
      );
      assert.strictEqual(deleted.length, 0);
    });
    test("proceeds with deletion when no other plugin shares the cleanup target", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource(
        {
          name: "plugin-a",
          description: "",
          version: "",
          source: "",
          sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo", path: "plugins/a" },
          marketplace: "owner/marketplace",
          marketplaceReference: parseMarketplaceReference("owner/marketplace"),
          marketplaceType: MarketplaceType.Copilot
        },
        // Only unrelated plugins remain
        [{ kind: PluginSourceKind.GitHub, repo: "other-owner/other-repo" }]
      );
      assert.ok(deleted.length >= 1);
      assert.ok(deleted[0].includes("github.com/owner/repo"));
    });
    test("proceeds with deletion when otherInstalledDescriptors is empty", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource(
        {
          name: "plugin-a",
          description: "",
          version: "",
          source: "",
          sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" },
          marketplace: "owner/marketplace",
          marketplaceReference: parseMarketplaceReference("owner/marketplace"),
          marketplaceType: MarketplaceType.Copilot
        },
        []
      );
      assert.ok(deleted.length >= 1);
      assert.ok(deleted[0].includes("github.com/owner/repo"));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3BsdWdpbnMvYWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZXRwbGFjZVBsdWdpbiwgTWFya2V0cGxhY2VUeXBlLCBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlLCBQbHVnaW5Tb3VyY2VLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQbHVnaW5HaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luR2l0U2VydmljZS5qcyc7XG5cbnN1aXRlKCdBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHN0dWJQbHVnaW5HaXQob3ZlcnJpZGVzPzogUGFydGlhbDxJUGx1Z2luR2l0U2VydmljZT4pOiBJUGx1Z2luR2l0U2VydmljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGNsb25lUmVwb3NpdG9yeTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0cHVsbDogYXN5bmMgKCkgPT4gZmFsc2UsXG5cdFx0XHRjaGVja291dDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0cmV2UGFyc2U6IGFzeW5jICgpID0+ICcnLFxuXHRcdFx0ZmV0Y2g6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdGZldGNoUmVwb3NpdG9yeTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0cmV2TGlzdENvdW50OiBhc3luYyAoKSA9PiAwLFxuXHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdH0gYXMgSVBsdWdpbkdpdFNlcnZpY2U7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVQbHVnaW4obWFya2V0cGxhY2U6IHN0cmluZywgc291cmNlOiBzdHJpbmcpOiBJTWFya2V0cGxhY2VQbHVnaW4ge1xuXHRcdGNvbnN0IG1hcmtldHBsYWNlUmVmZXJlbmNlID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZShtYXJrZXRwbGFjZSk7XG5cdFx0YXNzZXJ0Lm9rKG1hcmtldHBsYWNlUmVmZXJlbmNlKTtcblx0XHRpZiAoIW1hcmtldHBsYWNlUmVmZXJlbmNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIG1hcmtldHBsYWNlIHJlZmVyZW5jZSB0byBwYXJzZS4nKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogJ3Rlc3QtcGx1Z2luJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0c291cmNlLFxuXHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogc291cmNlIH0sXG5cdFx0XHRtYXJrZXRwbGFjZTogbWFya2V0cGxhY2VSZWZlcmVuY2UuZGlzcGxheUxhYmVsLFxuXHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2UsXG5cdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKFxuXHRcdG9uRXhpc3RzPzogKHJlc291cmNlOiBVUkkpID0+IFByb21pc2U8Ym9vbGVhbj4sXG5cdFx0b25FeGVjdXRlQ29tbWFuZD86IChpZDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQsXG5cdFx0cGx1Z2luR2l0U3R1Yj86IFBhcnRpYWw8SVBsdWdpbkdpdFNlcnZpY2U+LFxuXHQpOiBBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlIHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSB7XG5cdFx0XHRleGlzdHM6IGFzeW5jIChyZXNvdXJjZTogVVJJKSA9PiBvbkV4aXN0cyA/IG9uRXhpc3RzKHJlc291cmNlKSA6IHRydWUsXG5cdFx0fSBhcyB1bmtub3duIGFzIElGaWxlU2VydmljZTtcblxuXHRcdGNvbnN0IHByb2dyZXNzU2VydmljZSA9IHtcblx0XHRcdHdpdGhQcm9ncmVzczogYXN5bmMgKF9vcHRpb25zOiB1bmtub3duLCBjYWxsYmFjazogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gUHJvbWlzZTx1bmtub3duPikgPT4gY2FsbGJhY2soKSxcblx0XHR9IGFzIHVua25vd24gYXMgSVByb2dyZXNzU2VydmljZTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCB7XG5cdFx0XHRleGVjdXRlQ29tbWFuZDogYXN5bmMgKGlkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0XHRvbkV4ZWN1dGVDb21tYW5kPy4oaWQsIC4uLmFyZ3MpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFNlcnZpY2UsIHsgY2FjaGVIb21lOiBVUkkuZmlsZSgnL2NhY2hlJykgfSBhcyB1bmtub3duIGFzIElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIHsgY3VycmVudFByb2ZpbGU6IHsgYWdlbnRQbHVnaW5zSG9tZTogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMnKSB9IH0gYXMgdW5rbm93biBhcyBJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90aWZpY2F0aW9uU2VydmljZSwgeyBub3RpZnk6ICgpID0+IHVuZGVmaW5lZCB9IGFzIHVua25vd24gYXMgSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVBsdWdpbkdpdFNlcnZpY2UsIHN0dWJQbHVnaW5HaXQoe1xuXHRcdFx0Li4ucGx1Z2luR2l0U3R1Yixcblx0XHR9KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBwcm9ncmVzc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UpO1xuXHR9XG5cblx0dGVzdCgndXNlcyBjYWNoZVNlZ21lbnRzIHBhdGggZm9yIEdpdEh1YiBzaG9ydGhhbmQgcGx1Z2luIHJlZmVyZW5jZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXHRcdGNvbnN0IHVyaSA9IHNlcnZpY2UuZ2V0UmVwb3NpdG9yeVVyaShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHBsdWdpbi5tYXJrZXRwbGFjZVR5cGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5wYXRoLCAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyByZWYtc3BlY2lmaWMgY2FjaGUgcGF0aCBmb3IgR2l0SHViIHNob3J0aGFuZCBwbHVnaW4gcmVmZXJlbmNlcycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbignbWljcm9zb2Z0L3ZzY29kZSNtYXJrZXRwbGFjZScsICdwbHVnaW5zL215UGx1Z2luJyk7XG5cdFx0Y29uc3QgdXJpID0gc2VydmljZS5nZXRSZXBvc2l0b3J5VXJpKHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgcGx1Z2luLm1hcmtldHBsYWNlVHlwZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9yZWZfbWFya2V0cGxhY2UnKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBtYXJrZXRwbGFjZXMgY2FjaGUgcGF0aCBmb3IgZGlyZWN0IGdpdCBVUkkgcGx1Z2luIHJlZmVyZW5jZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ2h0dHBzOi8vZXhhbXBsZS5jb20vb3JnL3JlcG8uZ2l0JywgJ3BsdWdpbnMvbXlQbHVnaW4nKTtcblx0XHRjb25zdCB1cmkgPSBzZXJ2aWNlLmdldFJlcG9zaXRvcnlVcmkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCBwbHVnaW4ubWFya2V0cGxhY2VUeXBlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkucGF0aCwgJy9jYWNoZS9hZ2VudFBsdWdpbnMvZXhhbXBsZS5jb20vb3JnL3JlcG8nKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBzYW1lIGNhY2hlIHBhdGggZm9yIGVxdWl2YWxlbnQgR2l0SHViIHNob3J0aGFuZCBhbmQgVVJJIHJlZmVyZW5jZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBzaG9ydGhhbmRQbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXHRcdGNvbnN0IHVyaVBsdWdpbiA9IGNyZWF0ZVBsdWdpbignaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUuZ2l0JywgJ3BsdWdpbnMvbXlQbHVnaW4nKTtcblxuXHRcdGNvbnN0IHNob3J0aGFuZFVyaSA9IHNlcnZpY2UuZ2V0UmVwb3NpdG9yeVVyaShzaG9ydGhhbmRQbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHNob3J0aGFuZFBsdWdpbi5tYXJrZXRwbGFjZVR5cGUpO1xuXHRcdGNvbnN0IHVyaVJlZlVyaSA9IHNlcnZpY2UuZ2V0UmVwb3NpdG9yeVVyaSh1cmlQbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHVyaVBsdWdpbi5tYXJrZXRwbGFjZVR5cGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3J0aGFuZFVyaS5wYXRoLCAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpUmVmVXJpLnBhdGgsICcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbnN1cmVzIHBsdWdpbiByZXBvc2l0b3JpZXMgdmlhIGNhY2hlU2VnbWVudHMgcGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY2hlY2tlZFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyByZXNvdXJjZSA9PiB7XG5cdFx0XHRjaGVja2VkUGF0aCA9IHJlc291cmNlLnBhdGg7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXHRcdGNvbnN0IHVyaSA9IGF3YWl0IHNlcnZpY2UuZW5zdXJlUmVwb3NpdG9yeShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHsgbWFya2V0cGxhY2VUeXBlOiBwbHVnaW4ubWFya2V0cGxhY2VUeXBlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoZWNrZWRQYXRoLCAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXNzZXMgbWFya2V0cGxhY2UgcmVmcyB0aHJvdWdoIGNsb25lUmVwb3NpdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY2xvbmVkUmVmOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgeyBleGVjdXRlQ29tbWFuZDogYXN5bmMgKCkgPT4gdW5kZWZpbmVkIH0gYXMgdW5rbm93biBhcyBJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwgeyBjYWNoZUhvbWU6IFVSSS5maWxlKCcvY2FjaGUnKSB9IGFzIHVua25vd24gYXMgSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlU2VydmljZSwgeyBjdXJyZW50UHJvZmlsZTogeyBhZ2VudFBsdWdpbnNIb21lOiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucycpIH0gfSBhcyB1bmtub3duIGFzIElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge1xuXHRcdFx0ZXhpc3RzOiBhc3luYyAoKSA9PiBmYWxzZSxcblx0XHRcdGNyZWF0ZUZvbGRlcjogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJRmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCB7IG5vdGlmeTogKCkgPT4gdW5kZWZpbmVkIH0gYXMgdW5rbm93biBhcyBJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUGx1Z2luR2l0U2VydmljZSwgc3R1YlBsdWdpbkdpdCh7XG5cdFx0XHRjbG9uZVJlcG9zaXRvcnk6IGFzeW5jIChfY2xvbmVVcmwsIF90YXJnZXREaXIsIHJlZikgPT4ge1xuXHRcdFx0XHRjbG9uZWRSZWYgPSByZWY7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIHtcblx0XHRcdHdpdGhQcm9ncmVzczogYXN5bmMgKF9vcHRpb25zOiB1bmtub3duLCBjYWxsYmFjazogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gUHJvbWlzZTx1bmtub3duPikgPT4gY2FsbGJhY2soKSxcblx0XHR9IGFzIHVua25vd24gYXMgSVByb2dyZXNzU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSk7XG5cdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKCdtaWNyb3NvZnQvdnNjb2RlI21hcmtldHBsYWNlJywgJ3BsdWdpbnMvbXlQbHVnaW4nKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmVuc3VyZVJlcG9zaXRvcnkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCB7IG1hcmtldHBsYWNlVHlwZTogcGx1Z2luLm1hcmtldHBsYWNlVHlwZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9uZWRSZWYsICdtYXJrZXRwbGFjZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25jdXJyZW50IGVuc3VyZVJlcG9zaXRvcnkgY2FsbHMgZm9yIHRoZSBzYW1lIG1hcmtldHBsYWNlIGNsb25lIG9ubHkgb25jZScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY2xvbmVDb3VudCA9IDA7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblxuXHRcdC8vIFRyYWNrIHdoZXRoZXIgdGhlIHJlcG8gZXhpc3RzIChzZXQgdG8gdHJ1ZSBhZnRlciB0aGUgZmlyc3QgY2xvbmUgY29tcGxldGVzKVxuXHRcdGxldCByZXBvRXhpc3RzID0gZmFsc2U7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSB7XG5cdFx0XHRleGlzdHM6IGFzeW5jIChfcmVzb3VyY2U6IFVSSSkgPT4gcmVwb0V4aXN0cyxcblx0XHRcdGNyZWF0ZUZvbGRlcjogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJRmlsZVNlcnZpY2U7XG5cblx0XHRjb25zdCBwcm9ncmVzc1NlcnZpY2UgPSB7XG5cdFx0XHR3aXRoUHJvZ3Jlc3M6IGFzeW5jIChfb3B0aW9uczogdW5rbm93biwgY2FsbGJhY2s6ICguLi5hcmdzOiB1bmtub3duW10pID0+IFByb21pc2U8dW5rbm93bj4pID0+IGNhbGxiYWNrKCksXG5cdFx0fSBhcyB1bmtub3duIGFzIElQcm9ncmVzc1NlcnZpY2U7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwge1xuXHRcdFx0ZXhlY3V0ZUNvbW1hbmQ6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHR9IGFzIHVua25vd24gYXMgSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQbHVnaW5HaXRTZXJ2aWNlLCBzdHViUGx1Z2luR2l0KHtcblx0XHRcdGNsb25lUmVwb3NpdG9yeTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjbG9uZUNvdW50Kys7XG5cdFx0XHRcdC8vIFNpbXVsYXRlIGFzeW5jIGNsb25lIGJ5IHlpZWxkaW5nLCB0aGVuIG1hcmsgcmVwbyBhcyBleGlzdGluZ1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXHRcdFx0XHRyZXBvRXhpc3RzID0gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwgeyBjYWNoZUhvbWU6IFVSSS5maWxlKCcvY2FjaGUnKSB9IGFzIHVua25vd24gYXMgSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlU2VydmljZSwgeyBjdXJyZW50UHJvZmlsZTogeyBhZ2VudFBsdWdpbnNIb21lOiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucycpIH0gfSBhcyB1bmtub3duIGFzIElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCB7IG5vdGlmeTogKCkgPT4gdW5kZWZpbmVkIH0gYXMgdW5rbm93biBhcyBJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBwcm9ncmVzc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UpO1xuXHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbignbWljcm9zb2Z0L3ZzY29kZScsICdwbHVnaW5zL215UGx1Z2luJyk7XG5cblx0XHQvLyBGaXJlIHR3byBjb25jdXJyZW50IGVuc3VyZVJlcG9zaXRvcnkgY2FsbHMgZm9yIHRoZSBzYW1lIG1hcmtldHBsYWNlXG5cdFx0Y29uc3QgW3VyaTEsIHVyaTJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0c2VydmljZS5lbnN1cmVSZXBvc2l0b3J5KHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgeyBtYXJrZXRwbGFjZVR5cGU6IHBsdWdpbi5tYXJrZXRwbGFjZVR5cGUgfSksXG5cdFx0XHRzZXJ2aWNlLmVuc3VyZVJlcG9zaXRvcnkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCB7IG1hcmtldHBsYWNlVHlwZTogcGx1Z2luLm1hcmtldHBsYWNlVHlwZSB9KSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9uZUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpMS5wYXRoLCAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpMi5wYXRoLCAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnKTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRzIGluc3RhbGwgVVJJIGZyb20gc291cmNlIGluc2lkZSByZXBvc2l0b3J5IHJvb3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXHRcdGNvbnN0IHVyaSA9IHNlcnZpY2UuZ2V0UGx1Z2luSW5zdGFsbFVyaShwbHVnaW4pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5wYXRoLCAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcGx1Z2lucy9teVBsdWdpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGluZGV4ZWQgcmVwb3NpdG9yeSBVUkkgd2hlbiBhdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlLnN0b3JlKCdjaGF0LnBsdWdpbnMubWFya2V0cGxhY2VzLmluZGV4LnYxJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0J2dpdGh1YjptaWNyb3NvZnQvdnNjb2RlJzoge1xuXHRcdFx0XHRyZXBvc2l0b3J5VXJpOiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9pbmRleGVkL21pY3Jvc29mdC92c2NvZGUnKSxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHRcdH0sXG5cdFx0fSksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29tbWFuZFNlcnZpY2UsIHsgZXhlY3V0ZUNvbW1hbmQ6IGFzeW5jICgpID0+IHVuZGVmaW5lZCB9IGFzIHVua25vd24gYXMgSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQbHVnaW5HaXRTZXJ2aWNlLCBzdHViUGx1Z2luR2l0KCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwgeyBjYWNoZUhvbWU6IFVSSS5maWxlKCcvY2FjaGUnKSB9IGFzIHVua25vd24gYXMgSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlU2VydmljZSwgeyBjdXJyZW50UHJvZmlsZTogeyBhZ2VudFBsdWdpbnNIb21lOiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucycpIH0gfSBhcyB1bmtub3duIGFzIElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgeyBleGlzdHM6IGFzeW5jICgpID0+IHRydWUgfSBhcyB1bmtub3duIGFzIElGaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIHsgbm90aWZ5OiAoKSA9PiB1bmRlZmluZWQgfSBhcyB1bmtub3duIGFzIElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIHsgd2l0aFByb2dyZXNzOiBhc3luYyAoX29wdGlvbnM6IHVua25vd24sIGNhbGxiYWNrOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiBQcm9taXNlPHVua25vd24+KSA9PiBjYWxsYmFjaygpIH0gYXMgdW5rbm93biBhcyBJUHJvZ3Jlc3NTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSk7XG5cdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKCdtaWNyb3NvZnQvdnNjb2RlJywgJ3BsdWdpbnMvbXlQbHVnaW4nKTtcblx0XHRjb25zdCB1cmkgPSBzZXJ2aWNlLmdldFJlcG9zaXRvcnlVcmkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCBwbHVnaW4ubWFya2V0cGxhY2VUeXBlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkucGF0aCwgJy9jYWNoZS9hZ2VudFBsdWdpbnMvaW5kZXhlZC9taWNyb3NvZnQvdnNjb2RlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgcGx1Z2luIHNvdXJjZSBwYXRocyB0aGF0IGVzY2FwZSByZXBvc2l0b3J5IHJvb3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAnLi4vb3V0c2lkZScpO1xuXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBzZXJ2aWNlLmdldFBsdWdpbkluc3RhbGxVcmkocGx1Z2luKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgbG9jYWwgcmVwb3NpdG9yeSBVUkkgZm9yIGZpbGUgbWFya2V0cGxhY2UgcmVmZXJlbmNlcycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbignZmlsZTovLy90bXAvbWFya2V0cGxhY2UtcmVwbycsICdwbHVnaW5zL215UGx1Z2luJyk7XG5cdFx0Y29uc3QgdXJpID0gc2VydmljZS5nZXRSZXBvc2l0b3J5VXJpKHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgcGx1Z2luLm1hcmtldHBsYWNlVHlwZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvdG1wL21hcmtldHBsYWNlLXJlcG8nKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgaW52b2tlIGNsb25lIGNvbW1hbmQgd2hlbiBlbnN1cmluZyBleGlzdGluZyBsb2NhbCBmaWxlIHJlcG9zaXRvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGNvbW1hbmRJbnZvY2F0aW9uQ291bnQgPSAwO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jICgpID0+IHRydWUsICgpID0+IHtcblx0XHRcdGNvbW1hbmRJbnZvY2F0aW9uQ291bnQrKztcblx0XHR9KTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ2ZpbGU6Ly8vdG1wL21hcmtldHBsYWNlLXJlcG8nLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXG5cdFx0Y29uc3QgdXJpID0gYXdhaXQgc2VydmljZS5lbnN1cmVSZXBvc2l0b3J5KHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgeyBtYXJrZXRwbGFjZVR5cGU6IHBsdWdpbi5tYXJrZXRwbGFjZVR5cGUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvdG1wL21hcmtldHBsYWNlLXJlcG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tbWFuZEludm9jYXRpb25Db3VudCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkcyByZXZpc2lvbi1hd2FyZSBpbnN0YWxsIFVSSSBmb3IgZ2l0aHViIHBsdWdpbiBzb3VyY2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdXJpID0gc2VydmljZS5nZXRQbHVnaW5Tb3VyY2VJbnN0YWxsVXJpKHtcblx0XHRcdGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLFxuXHRcdFx0cmVwbzogJ293bmVyL3JlcG8nLFxuXHRcdFx0cmVmOiAncmVsZWFzZS92MScsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvcmVwby9yZWZfcmVsZWFzZV92MScpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIGdpdCBwbHVnaW4gc291cmNlIGJ5IHB1bGxpbmcgYW5kIGNoZWNraW5nIG91dCByZXF1ZXN0ZWQgcmV2aXNpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKCkgPT4gdHJ1ZSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRyZXZQYXJzZTogYXN5bmMgKCkgPT4geyBjYWxscy5wdXNoKCdyZXZQYXJzZScpOyByZXR1cm4gJyc7IH0sXG5cdFx0XHRmZXRjaDogYXN5bmMgKCkgPT4geyBjYWxscy5wdXNoKCdmZXRjaCcpOyB9LFxuXHRcdFx0Y2hlY2tvdXQ6IGFzeW5jICgpID0+IHsgY2FsbHMucHVzaCgnY2hlY2tvdXQnKTsgfSxcblx0XHRcdHB1bGw6IGFzeW5jICgpID0+IHsgY2FsbHMucHVzaCgncHVsbCcpOyByZXR1cm4gZmFsc2U7IH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnVwZGF0ZVBsdWdpblNvdXJjZSh7XG5cdFx0XHRuYW1lOiAnbXktcGx1Z2luJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0c291cmNlOiAnJyxcblx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHtcblx0XHRcdFx0a2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsXG5cdFx0XHRcdHJlcG86ICdvd25lci9yZXBvJyxcblx0XHRcdFx0c2hhOiAnYTFiMmMzZDRlNWY2YTdiOGM5ZDBlMWYyYTNiNGM1ZDZlN2Y4YTliMCcsXG5cdFx0XHR9LFxuXHRcdFx0bWFya2V0cGxhY2U6ICdvd25lci9yZXBvJyxcblx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdvd25lci9yZXBvJykhLFxuXHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHR9LCB7XG5cdFx0XHRwbHVnaW5OYW1lOiAnbXktcGx1Z2luJyxcblx0XHRcdGZhaWx1cmVMYWJlbDogJ215LXBsdWdpbicsXG5cdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWydyZXZQYXJzZScsICdmZXRjaCcsICdjaGVja291dCcsICdyZXZQYXJzZSddKTtcblx0fSk7XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBjbGVhbnVwUGx1Z2luU291cmNlIFx1MjAxNCBpc3N1ZSAjMjk3MjUxIHJlZ3Jlc3Npb25cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHN1aXRlKCdjbGVhbnVwUGx1Z2luU291cmNlJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZVdpdGhEZWwoXG5cdFx0XHRvbkRlbDogKHJlc291cmNlOiBVUkkpID0+IHZvaWQsXG5cdFx0XHRvcHRpb25zPzogeyByZXNvbHZlPzogKHJlc291cmNlOiBVUkkpID0+IHsgY2hpbGRyZW4/OiB1bmtub3duW10gfSB9LFxuXHRcdCkge1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCB7IGV4ZWN1dGVDb21tYW5kOiBhc3luYyAoKSA9PiB1bmRlZmluZWQgfSBhcyB1bmtub3duIGFzIElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQbHVnaW5HaXRTZXJ2aWNlLCBzdHViUGx1Z2luR2l0KCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRW52aXJvbm1lbnRTZXJ2aWNlLCB7IGNhY2hlSG9tZTogVVJJLmZpbGUoJy9jYWNoZScpIH0gYXMgdW5rbm93biBhcyBJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIHsgY3VycmVudFByb2ZpbGU6IHsgYWdlbnRQbHVnaW5zSG9tZTogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMnKSB9IH0gYXMgdW5rbm93biBhcyBJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge1xuXHRcdFx0XHRleGlzdHM6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0XHRcdGRlbDogYXN5bmMgKHJlc291cmNlOiBVUkkpID0+IHsgb25EZWwocmVzb3VyY2UpOyB9LFxuXHRcdFx0XHRjcmVhdGVGb2xkZXI6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzb2x2ZTogYXN5bmMgKHJlc291cmNlOiBVUkkpID0+IG9wdGlvbnM/LnJlc29sdmU/LihyZXNvdXJjZSkgPz8geyBjaGlsZHJlbjogW10gfSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJRmlsZVNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90aWZpY2F0aW9uU2VydmljZSwgeyBub3RpZnk6ICgpID0+IHVuZGVmaW5lZCB9IGFzIHVua25vd24gYXMgSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCB7IHdpdGhQcm9ncmVzczogYXN5bmMgKF9vOiB1bmtub3duLCBjYjogKC4uLmE6IHVua25vd25bXSkgPT4gUHJvbWlzZTx1bmtub3duPikgPT4gY2IoKSB9IGFzIHVua25vd24gYXMgSVByb2dyZXNzU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmUuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBkZWxldGUgZmlsZXMgZm9yIHJlbGF0aXZlLXBhdGggKG1hcmtldHBsYWNlKSBwbHVnaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWxldGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2VXaXRoRGVsKHIgPT4gZGVsZXRlZC5wdXNoKHIucGF0aCkpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNsZWFudXBQbHVnaW5Tb3VyY2Uoe1xuXHRcdFx0XHRuYW1lOiAnbWFya2V0cGxhY2UtcGx1Z2luJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHR2ZXJzaW9uOiAnJyxcblx0XHRcdFx0c291cmNlOiAncGx1Z2lucy9mb28nLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncGx1Z2lucy9mb28nIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdtaWNyb3NvZnQvdnNjb2RlJykhLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxldGVzIGNhY2hlIGZvciBnaXRodWIgcGx1Z2luIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZVdpdGhEZWwociA9PiBkZWxldGVkLnB1c2goci5wYXRoKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuY2xlYW51cFBsdWdpblNvdXJjZSh7XG5cdFx0XHRcdG5hbWU6ICdnaC1wbHVnaW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0XHRzb3VyY2U6ICcnLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycgfSxcblx0XHRcdFx0bWFya2V0cGxhY2U6ICdvd25lci9tYXJrZXRwbGFjZScsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdvd25lci9tYXJrZXRwbGFjZScpISxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZC5sZW5ndGggPj0gMSk7XG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZFswXS5pbmNsdWRlcygnZ2l0aHViLmNvbS9vd25lci9yZXBvJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRlcyBwYXJlbnQgY2FjaGUgZGlyIGZvciBucG0gcGx1Z2luIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZVdpdGhEZWwociA9PiBkZWxldGVkLnB1c2goci5wYXRoKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuY2xlYW51cFBsdWdpblNvdXJjZSh7XG5cdFx0XHRcdG5hbWU6ICducG0tcGx1Z2luJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHR2ZXJzaW9uOiAnJyxcblx0XHRcdFx0c291cmNlOiAnJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgcGFja2FnZTogJ0BhY21lL3BsdWdpbicgfSxcblx0XHRcdFx0bWFya2V0cGxhY2U6ICdvd25lci9tYXJrZXRwbGFjZScsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdvd25lci9tYXJrZXRwbGFjZScpISxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZC5sZW5ndGggPj0gMSk7XG5cdFx0XHQvLyBGaXJzdCBkZWxldGUgc2hvdWxkIGJlIHRoZSBucG0vPHNhbml0aXplZC1wYWNrYWdlPiBjYWNoZSBkaXJcblx0XHRcdGFzc2VydC5vayhkZWxldGVkWzBdLmluY2x1ZGVzKCcvbnBtLycpLCBgRXhwZWN0ZWQgbnBtIHBhdGgsIGdvdDogJHtkZWxldGVkWzBdfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRlcyBjYWNoZSBmb3IgcGlwIHBsdWdpbiBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWxldGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2VXaXRoRGVsKHIgPT4gZGVsZXRlZC5wdXNoKHIucGF0aCkpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNsZWFudXBQbHVnaW5Tb3VyY2Uoe1xuXHRcdFx0XHRuYW1lOiAncGlwLXBsdWdpbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdFx0dmVyc2lvbjogJycsXG5cdFx0XHRcdHNvdXJjZTogJycsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5QaXAsIHBhY2thZ2U6ICdteS1waXAtcGtnJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogJ293bmVyL21hcmtldHBsYWNlJyxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ293bmVyL21hcmtldHBsYWNlJykhLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhkZWxldGVkLmxlbmd0aCA+PSAxKTtcblx0XHRcdGFzc2VydC5vayhkZWxldGVkWzBdLmluY2x1ZGVzKCdwaXAvbXktcGlwLXBrZycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHRocm93IHdoZW4gZGVsZXRlIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCB7IGV4ZWN1dGVDb21tYW5kOiBhc3luYyAoKSA9PiB1bmRlZmluZWQgfSBhcyB1bmtub3duIGFzIElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQbHVnaW5HaXRTZXJ2aWNlLCBzdHViUGx1Z2luR2l0KCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRW52aXJvbm1lbnRTZXJ2aWNlLCB7IGNhY2hlSG9tZTogVVJJLmZpbGUoJy9jYWNoZScpIH0gYXMgdW5rbm93biBhcyBJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIHsgY3VycmVudFByb2ZpbGU6IHsgYWdlbnRQbHVnaW5zSG9tZTogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMnKSB9IH0gYXMgdW5rbm93biBhcyBJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge1xuXHRcdFx0XHRleGlzdHM6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0XHRcdGRlbDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3Blcm1pc3Npb24gZGVuaWVkJyk7IH0sXG5cdFx0XHRcdGNyZWF0ZUZvbGRlcjogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXNvbHZlOiBhc3luYyAoKSA9PiAoeyBjaGlsZHJlbjogW10gfSksXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIHsgbm90aWZ5OiAoKSA9PiB1bmRlZmluZWQgfSBhcyB1bmtub3duIGFzIElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2dyZXNzU2VydmljZSwgeyB3aXRoUHJvZ3Jlc3M6IGFzeW5jIChfbzogdW5rbm93biwgY2I6ICguLi5hOiB1bmtub3duW10pID0+IFByb21pc2U8dW5rbm93bj4pID0+IGNiKCkgfSBhcyB1bmtub3duIGFzIElQcm9ncmVzc1NlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSk7XG5cblx0XHRcdC8vIFNob3VsZCBub3QgdGhyb3cgXHUyMDE0IGNsZWFudXAgaXMgYmVzdC1lZmZvcnRcblx0XHRcdGF3YWl0IHNlcnZpY2UuY2xlYW51cFBsdWdpblNvdXJjZSh7XG5cdFx0XHRcdG5hbWU6ICdnaC1wbHVnaW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0XHRzb3VyY2U6ICcnLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycgfSxcblx0XHRcdFx0bWFya2V0cGxhY2U6ICdvd25lci9tYXJrZXRwbGFjZScsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdvd25lci9tYXJrZXRwbGFjZScpISxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJ1bmVzIGVtcHR5IHBhcmVudCBkaXJlY3RvcmllcyB1cCB0byBjYWNoZSByb290JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQWZ0ZXIgZGVsZXRpbmcgZ2l0aHViLmNvbS9vd25lci9yZXBvLCB0aGUgXCJvd25lclwiIGRpciBpcyBlbXB0eVxuXHRcdFx0Ly8gYW5kIHNob3VsZCBhbHNvIGJlIHJlbW92ZWQuXG5cdFx0XHRjb25zdCBkZWxldGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2VXaXRoRGVsKFxuXHRcdFx0XHRyID0+IGRlbGV0ZWQucHVzaChyLnBhdGgpLFxuXHRcdFx0XHR7IHJlc29sdmU6ICgpID0+ICh7IGNoaWxkcmVuOiBbXSB9KSB9LFxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5jbGVhbnVwUGx1Z2luU291cmNlKHtcblx0XHRcdFx0bmFtZTogJ2doLXBsdWdpbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdFx0dmVyc2lvbjogJycsXG5cdFx0XHRcdHNvdXJjZTogJycsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIHJlcG86ICdvd25lci9yZXBvJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogJ293bmVyL21hcmtldHBsYWNlJyxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ293bmVyL21hcmtldHBsYWNlJykhLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFNob3VsZCBoYXZlIGRlbGV0ZWQgdGhlIHJlcG8gZGlyICsgZW1wdHkgcGFyZW50cyAob3duZXIsIGdpdGh1Yi5jb20pXG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZC5sZW5ndGggPj0gMiwgYEV4cGVjdGVkIGF0IGxlYXN0IDIgZGVsZXRpb25zIChyZXBvICsgcGFyZW50KSwgZ290ICR7ZGVsZXRlZC5sZW5ndGh9OiAke2RlbGV0ZWQuam9pbignLCAnKX1gKTtcblx0XHRcdGFzc2VydC5vayhkZWxldGVkWzBdLmluY2x1ZGVzKCdnaXRodWIuY29tL293bmVyL3JlcG8nKSwgJ0ZpcnN0IGRlbGV0ZSBzaG91bGQgYmUgdGhlIHJlcG8gZGlyJyk7XG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZC5zb21lKHAgPT4gcC5lbmRzV2l0aCgnL293bmVyJykpLCAnU2hvdWxkIHBydW5lIGVtcHR5IG93bmVyIGRpcmVjdG9yeScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcHMgcHJ1bmluZyBhdCBub24tZW1wdHkgcGFyZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVsZXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlV2l0aERlbChcblx0XHRcdFx0ciA9PiBkZWxldGVkLnB1c2goci5wYXRoKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHJlc29sdmU6IChyZXNvdXJjZTogVVJJKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBvd25lciBkaXIgc3RpbGwgaGFzIGFub3RoZXIgcmVwb1xuXHRcdFx0XHRcdFx0aWYgKHJlc291cmNlLnBhdGguZW5kc1dpdGgoJy9vd25lcicpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IGNoaWxkcmVuOiBbeyBuYW1lOiAnb3RoZXItcmVwbycgfV0gfTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiB7IGNoaWxkcmVuOiBbXSB9O1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNsZWFudXBQbHVnaW5Tb3VyY2Uoe1xuXHRcdFx0XHRuYW1lOiAnZ2gtcGx1Z2luJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHR2ZXJzaW9uOiAnJyxcblx0XHRcdFx0c291cmNlOiAnJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiAnb3duZXIvbWFya2V0cGxhY2UnLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnb3duZXIvbWFya2V0cGxhY2UnKSEsXG5cdFx0XHRcdG1hcmtldHBsYWNlVHlwZTogTWFya2V0cGxhY2VUeXBlLkNvcGlsb3QsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU2hvdWxkIG9ubHkgZGVsZXRlIHRoZSByZXBvIGRpciwgc3RvcCBhdCBub24tZW1wdHkgb3duZXIgZGlyXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsZXRlZC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRlbGV0ZWRbMF0uaW5jbHVkZXMoJ2dpdGh1Yi5jb20vb3duZXIvcmVwbycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIGRlbGV0aW9uIHdoZW4gYW5vdGhlciBpbnN0YWxsZWQgcGx1Z2luIHNoYXJlcyB0aGUgc2FtZSBjbGVhbnVwIHRhcmdldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZVdpdGhEZWwociA9PiBkZWxldGVkLnB1c2goci5wYXRoKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuY2xlYW51cFBsdWdpblNvdXJjZShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6ICdwbHVnaW4tYScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0XHRcdHNvdXJjZTogJycsXG5cdFx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nLCBwYXRoOiAncGx1Z2lucy9hJyB9LFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlOiAnb3duZXIvbWFya2V0cGxhY2UnLFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdvd25lci9tYXJrZXRwbGFjZScpISxcblx0XHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBBbm90aGVyIHBsdWdpbiBmcm9tIHRoZSBzYW1lIHJlcG8gc3RpbGwgaW5zdGFsbGVkXG5cdFx0XHRcdFt7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycsIHBhdGg6ICdwbHVnaW5zL2InIH1dLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGV0ZWQubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb2NlZWRzIHdpdGggZGVsZXRpb24gd2hlbiBubyBvdGhlciBwbHVnaW4gc2hhcmVzIHRoZSBjbGVhbnVwIHRhcmdldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZVdpdGhEZWwociA9PiBkZWxldGVkLnB1c2goci5wYXRoKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuY2xlYW51cFBsdWdpblNvdXJjZShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6ICdwbHVnaW4tYScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0XHRcdHNvdXJjZTogJycsXG5cdFx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nLCBwYXRoOiAncGx1Z2lucy9hJyB9LFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlOiAnb3duZXIvbWFya2V0cGxhY2UnLFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdvd25lci9tYXJrZXRwbGFjZScpISxcblx0XHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBPbmx5IHVucmVsYXRlZCBwbHVnaW5zIHJlbWFpblxuXHRcdFx0XHRbeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ290aGVyLW93bmVyL290aGVyLXJlcG8nIH1dLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGRlbGV0ZWQubGVuZ3RoID49IDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRlbGV0ZWRbMF0uaW5jbHVkZXMoJ2dpdGh1Yi5jb20vb3duZXIvcmVwbycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb2NlZWRzIHdpdGggZGVsZXRpb24gd2hlbiBvdGhlckluc3RhbGxlZERlc2NyaXB0b3JzIGlzIGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVsZXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlV2l0aERlbChyID0+IGRlbGV0ZWQucHVzaChyLnBhdGgpKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5jbGVhbnVwUGx1Z2luU291cmNlKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ3BsdWdpbi1hJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRcdFx0dmVyc2lvbjogJycsXG5cdFx0XHRcdFx0c291cmNlOiAnJyxcblx0XHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycgfSxcblx0XHRcdFx0XHRtYXJrZXRwbGFjZTogJ293bmVyL21hcmtldHBsYWNlJyxcblx0XHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnb3duZXIvbWFya2V0cGxhY2UnKSEsXG5cdFx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHRcdFx0fSxcblx0XHRcdFx0W10sXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZC5sZW5ndGggPj0gMSk7XG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZFswXS5pbmNsdWRlcygnZ2l0aHViLmNvbS9vd25lci9yZXBvJykpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsaUJBQWlCLHdCQUF3QixjQUFjLHFCQUFxQjtBQUNyRixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG9DQUFvQztBQUM3QyxTQUE2QixpQkFBaUIsMkJBQTJCLHdCQUF3QjtBQUNqRyxTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLGdDQUFnQyxNQUFNO0FBQzNDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsV0FBUyxjQUFjLFdBQTJEO0FBQ2pGLFdBQU87QUFBQSxNQUNOLGVBQWU7QUFBQSxNQUNmLGlCQUFpQixZQUFZO0FBQUEsTUFBRTtBQUFBLE1BQy9CLE1BQU0sWUFBWTtBQUFBLE1BQ2xCLFVBQVUsWUFBWTtBQUFBLE1BQUU7QUFBQSxNQUN4QixVQUFVLFlBQVk7QUFBQSxNQUN0QixPQUFPLFlBQVk7QUFBQSxNQUFFO0FBQUEsTUFDckIsaUJBQWlCLFlBQVk7QUFBQSxNQUFFO0FBQUEsTUFDL0IsY0FBYyxZQUFZO0FBQUEsTUFDMUIsR0FBRztBQUFBLElBQ0o7QUFBQSxFQUNEO0FBRUEsV0FBUyxhQUFhLGFBQXFCLFFBQW9DO0FBQzlFLFVBQU0sdUJBQXVCLDBCQUEwQixXQUFXO0FBQ2xFLFdBQU8sR0FBRyxvQkFBb0I7QUFDOUIsUUFBSSxDQUFDLHNCQUFzQjtBQUMxQixZQUFNLElBQUksTUFBTSwwQ0FBMEM7QUFBQSxJQUMzRDtBQUVBLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLGFBQWE7QUFBQSxNQUNiLFNBQVM7QUFBQSxNQUNUO0FBQUEsTUFDQSxrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixjQUFjLE1BQU0sT0FBTztBQUFBLE1BQ3RFLGFBQWEscUJBQXFCO0FBQUEsTUFDbEM7QUFBQSxNQUNBLGlCQUFpQixnQkFBZ0I7QUFBQSxJQUNsQztBQUFBLEVBQ0Q7QUFFQSxXQUFTLGNBQ1IsVUFDQSxrQkFDQSxlQUMrQjtBQUMvQixVQUFNLHVCQUF1QixNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUVyRSxVQUFNLGNBQWM7QUFBQSxNQUNuQixRQUFRLE9BQU8sYUFBa0IsV0FBVyxTQUFTLFFBQVEsSUFBSTtBQUFBLElBQ2xFO0FBRUEsVUFBTSxrQkFBa0I7QUFBQSxNQUN2QixjQUFjLE9BQU8sVUFBbUIsYUFBdUQsU0FBUztBQUFBLElBQ3pHO0FBRUEseUJBQXFCLEtBQUssaUJBQWlCO0FBQUEsTUFDMUMsZ0JBQWdCLE9BQU8sT0FBZSxTQUFvQjtBQUN6RCwyQkFBbUIsSUFBSSxHQUFHLElBQUk7QUFDOUIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQStCO0FBQy9CLHlCQUFxQixLQUFLLHFCQUFxQixFQUFFLFdBQVcsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFtQztBQUNsSCx5QkFBcUIsS0FBSyx5QkFBeUIsRUFBRSxnQkFBZ0IsRUFBRSxrQkFBa0IsSUFBSSxLQUFLLHFCQUFxQixFQUFFLEVBQUUsQ0FBdUM7QUFDbEsseUJBQXFCLEtBQUssY0FBYyxXQUFXO0FBQ25ELHlCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDM0QseUJBQXFCLEtBQUssc0JBQXNCLEVBQUUsUUFBUSxNQUFNLE9BQVUsQ0FBb0M7QUFDOUcseUJBQXFCLEtBQUssbUJBQW1CLGNBQWM7QUFBQSxNQUMxRCxHQUFHO0FBQUEsSUFDSixDQUFDLENBQUM7QUFDRix5QkFBcUIsS0FBSyxrQkFBa0IsZUFBZTtBQUMzRCx5QkFBcUIsS0FBSyxpQkFBaUIsTUFBTSxJQUFJLElBQUksdUJBQXVCLENBQUMsQ0FBQztBQUVsRixXQUFPLHFCQUFxQixlQUFlLDRCQUE0QjtBQUFBLEVBQ3hFO0FBRUEsT0FBSyxrRUFBa0UsTUFBTTtBQUM1RSxVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLFNBQVMsYUFBYSxvQkFBb0Isa0JBQWtCO0FBQ2xFLFVBQU0sTUFBTSxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixPQUFPLGVBQWU7QUFFeEYsV0FBTyxZQUFZLElBQUksTUFBTSxpREFBaUQ7QUFBQSxFQUMvRSxDQUFDO0FBRUQsT0FBSyx1RUFBdUUsTUFBTTtBQUNqRixVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLFNBQVMsYUFBYSxnQ0FBZ0Msa0JBQWtCO0FBQzlFLFVBQU0sTUFBTSxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixPQUFPLGVBQWU7QUFFeEYsV0FBTyxZQUFZLElBQUksTUFBTSxpRUFBaUU7QUFBQSxFQUMvRixDQUFDO0FBRUQsT0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLFNBQVMsYUFBYSxvQ0FBb0Msa0JBQWtCO0FBQ2xGLFVBQU0sTUFBTSxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixPQUFPLGVBQWU7QUFFeEYsV0FBTyxZQUFZLElBQUksTUFBTSwwQ0FBMEM7QUFBQSxFQUN4RSxDQUFDO0FBRUQsT0FBSywyRUFBMkUsTUFBTTtBQUNyRixVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLGtCQUFrQixhQUFhLG9CQUFvQixrQkFBa0I7QUFDM0UsVUFBTSxZQUFZLGFBQWEsMkNBQTJDLGtCQUFrQjtBQUU1RixVQUFNLGVBQWUsUUFBUSxpQkFBaUIsZ0JBQWdCLHNCQUFzQixnQkFBZ0IsZUFBZTtBQUNuSCxVQUFNLFlBQVksUUFBUSxpQkFBaUIsVUFBVSxzQkFBc0IsVUFBVSxlQUFlO0FBRXBHLFdBQU8sWUFBWSxhQUFhLE1BQU0saURBQWlEO0FBQ3ZGLFdBQU8sWUFBWSxVQUFVLE1BQU0saURBQWlEO0FBQUEsRUFDckYsQ0FBQztBQUVELE9BQUssc0RBQXNELFlBQVk7QUFDdEUsUUFBSTtBQUNKLFVBQU0sVUFBVSxjQUFjLE9BQU0sYUFBWTtBQUMvQyxvQkFBYyxTQUFTO0FBQ3ZCLGFBQU87QUFBQSxJQUNSLENBQUM7QUFDRCxVQUFNLFNBQVMsYUFBYSxvQkFBb0Isa0JBQWtCO0FBQ2xFLFVBQU0sTUFBTSxNQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLEVBQUUsaUJBQWlCLE9BQU8sZ0JBQWdCLENBQUM7QUFFbkgsV0FBTyxZQUFZLGFBQWEsaURBQWlEO0FBQ2pGLFdBQU8sWUFBWSxJQUFJLE1BQU0saURBQWlEO0FBQUEsRUFDL0UsQ0FBQztBQUVELE9BQUssbURBQW1ELFlBQVk7QUFDbkUsUUFBSTtBQUNKLFVBQU0sdUJBQXVCLE1BQU0sSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQ3JFLHlCQUFxQixLQUFLLGlCQUFpQixFQUFFLGdCQUFnQixZQUFZLE9BQVUsQ0FBK0I7QUFDbEgseUJBQXFCLEtBQUsscUJBQXFCLEVBQUUsV0FBVyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQW1DO0FBQ2xILHlCQUFxQixLQUFLLHlCQUF5QixFQUFFLGdCQUFnQixFQUFFLGtCQUFrQixJQUFJLEtBQUsscUJBQXFCLEVBQUUsRUFBRSxDQUF1QztBQUNsSyx5QkFBcUIsS0FBSyxjQUFjO0FBQUEsTUFDdkMsUUFBUSxZQUFZO0FBQUEsTUFDcEIsY0FBYyxZQUFZO0FBQUEsSUFDM0IsQ0FBNEI7QUFDNUIseUJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUMzRCx5QkFBcUIsS0FBSyxzQkFBc0IsRUFBRSxRQUFRLE1BQU0sT0FBVSxDQUFvQztBQUM5Ryx5QkFBcUIsS0FBSyxtQkFBbUIsY0FBYztBQUFBLE1BQzFELGlCQUFpQixPQUFPLFdBQVcsWUFBWSxRQUFRO0FBQ3RELG9CQUFZO0FBQUEsTUFDYjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YseUJBQXFCLEtBQUssa0JBQWtCO0FBQUEsTUFDM0MsY0FBYyxPQUFPLFVBQW1CLGFBQXVELFNBQVM7QUFBQSxJQUN6RyxDQUFnQztBQUNoQyx5QkFBcUIsS0FBSyxpQkFBaUIsTUFBTSxJQUFJLElBQUksdUJBQXVCLENBQUMsQ0FBQztBQUVsRixVQUFNLFVBQVUscUJBQXFCLGVBQWUsNEJBQTRCO0FBQ2hGLFVBQU0sU0FBUyxhQUFhLGdDQUFnQyxrQkFBa0I7QUFDOUUsVUFBTSxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixFQUFFLGlCQUFpQixPQUFPLGdCQUFnQixDQUFDO0FBRXZHLFdBQU8sWUFBWSxXQUFXLGFBQWE7QUFBQSxFQUM1QyxDQUFDO0FBRUQsT0FBSyw4RUFBOEUsWUFBWTtBQUM5RixRQUFJLGFBQWE7QUFDakIsVUFBTSx1QkFBdUIsTUFBTSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFHckUsUUFBSSxhQUFhO0FBQ2pCLFVBQU0sY0FBYztBQUFBLE1BQ25CLFFBQVEsT0FBTyxjQUFtQjtBQUFBLE1BQ2xDLGNBQWMsWUFBWTtBQUFBLElBQzNCO0FBRUEsVUFBTSxrQkFBa0I7QUFBQSxNQUN2QixjQUFjLE9BQU8sVUFBbUIsYUFBdUQsU0FBUztBQUFBLElBQ3pHO0FBRUEseUJBQXFCLEtBQUssaUJBQWlCO0FBQUEsTUFDMUMsZ0JBQWdCLFlBQVk7QUFBQSxJQUM3QixDQUErQjtBQUMvQix5QkFBcUIsS0FBSyxtQkFBbUIsY0FBYztBQUFBLE1BQzFELGlCQUFpQixZQUFZO0FBQzVCO0FBRUEsY0FBTSxJQUFJLFFBQWMsT0FBSyxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBQzdDLHFCQUFhO0FBQUEsTUFDZDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YseUJBQXFCLEtBQUsscUJBQXFCLEVBQUUsV0FBVyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQW1DO0FBQ2xILHlCQUFxQixLQUFLLHlCQUF5QixFQUFFLGdCQUFnQixFQUFFLGtCQUFrQixJQUFJLEtBQUsscUJBQXFCLEVBQUUsRUFBRSxDQUF1QztBQUNsSyx5QkFBcUIsS0FBSyxjQUFjLFdBQVc7QUFDbkQseUJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUMzRCx5QkFBcUIsS0FBSyxzQkFBc0IsRUFBRSxRQUFRLE1BQU0sT0FBVSxDQUFvQztBQUM5Ryx5QkFBcUIsS0FBSyxrQkFBa0IsZUFBZTtBQUMzRCx5QkFBcUIsS0FBSyxpQkFBaUIsTUFBTSxJQUFJLElBQUksdUJBQXVCLENBQUMsQ0FBQztBQUVsRixVQUFNLFVBQVUscUJBQXFCLGVBQWUsNEJBQTRCO0FBQ2hGLFVBQU0sU0FBUyxhQUFhLG9CQUFvQixrQkFBa0I7QUFHbEUsVUFBTSxDQUFDLE1BQU0sSUFBSSxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQUEsTUFDdEMsUUFBUSxpQkFBaUIsT0FBTyxzQkFBc0IsRUFBRSxpQkFBaUIsT0FBTyxnQkFBZ0IsQ0FBQztBQUFBLE1BQ2pHLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLEVBQUUsaUJBQWlCLE9BQU8sZ0JBQWdCLENBQUM7QUFBQSxJQUNsRyxDQUFDO0FBRUQsV0FBTyxZQUFZLFlBQVksQ0FBQztBQUNoQyxXQUFPLFlBQVksS0FBSyxNQUFNLGlEQUFpRDtBQUMvRSxXQUFPLFlBQVksS0FBSyxNQUFNLGlEQUFpRDtBQUFBLEVBQ2hGLENBQUM7QUFFRCxPQUFLLHlEQUF5RCxNQUFNO0FBQ25FLFVBQU0sVUFBVSxjQUFjO0FBQzlCLFVBQU0sU0FBUyxhQUFhLG9CQUFvQixrQkFBa0I7QUFDbEUsVUFBTSxNQUFNLFFBQVEsb0JBQW9CLE1BQU07QUFFOUMsV0FBTyxZQUFZLElBQUksTUFBTSxrRUFBa0U7QUFBQSxFQUNoRyxDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsTUFBTTtBQUN4RCxVQUFNLFVBQVUsTUFBTSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdEQsWUFBUSxNQUFNLHNDQUFzQyxLQUFLLFVBQVU7QUFBQSxNQUNsRSwyQkFBMkI7QUFBQSxRQUMxQixlQUFlLElBQUksS0FBSyw4Q0FBOEM7QUFBQSxRQUN0RSxpQkFBaUIsZ0JBQWdCO0FBQUEsTUFDbEM7QUFBQSxJQUNELENBQUMsR0FBRyxhQUFhLGFBQWEsY0FBYyxPQUFPO0FBRW5ELFVBQU0sdUJBQXVCLE1BQU0sSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQ3JFLHlCQUFxQixLQUFLLGlCQUFpQixFQUFFLGdCQUFnQixZQUFZLE9BQVUsQ0FBK0I7QUFDbEgseUJBQXFCLEtBQUssbUJBQW1CLGNBQWMsQ0FBQztBQUM1RCx5QkFBcUIsS0FBSyxxQkFBcUIsRUFBRSxXQUFXLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBbUM7QUFDbEgseUJBQXFCLEtBQUsseUJBQXlCLEVBQUUsZ0JBQWdCLEVBQUUsa0JBQWtCLElBQUksS0FBSyxxQkFBcUIsRUFBRSxFQUFFLENBQXVDO0FBQ2xLLHlCQUFxQixLQUFLLGNBQWMsRUFBRSxRQUFRLFlBQVksS0FBSyxDQUE0QjtBQUMvRix5QkFBcUIsS0FBSyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQzNELHlCQUFxQixLQUFLLHNCQUFzQixFQUFFLFFBQVEsTUFBTSxPQUFVLENBQW9DO0FBQzlHLHlCQUFxQixLQUFLLGtCQUFrQixFQUFFLGNBQWMsT0FBTyxVQUFtQixhQUF1RCxTQUFTLEVBQUUsQ0FBZ0M7QUFDeEwseUJBQXFCLEtBQUssaUJBQWlCLE9BQU87QUFFbEQsVUFBTSxVQUFVLHFCQUFxQixlQUFlLDRCQUE0QjtBQUNoRixVQUFNLFNBQVMsYUFBYSxvQkFBb0Isa0JBQWtCO0FBQ2xFLFVBQU0sTUFBTSxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixPQUFPLGVBQWU7QUFFeEYsV0FBTyxZQUFZLElBQUksTUFBTSw4Q0FBOEM7QUFBQSxFQUM1RSxDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLFNBQVMsYUFBYSxvQkFBb0IsWUFBWTtBQUU1RCxXQUFPLE9BQU8sTUFBTSxRQUFRLG9CQUFvQixNQUFNLENBQUM7QUFBQSxFQUN4RCxDQUFDO0FBRUQsT0FBSyw2REFBNkQsTUFBTTtBQUN2RSxVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLFNBQVMsYUFBYSxnQ0FBZ0Msa0JBQWtCO0FBQzlFLFVBQU0sTUFBTSxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixPQUFPLGVBQWU7QUFFeEYsV0FBTyxZQUFZLElBQUksUUFBUSxNQUFNO0FBQ3JDLFdBQU8sWUFBWSxJQUFJLE1BQU0sdUJBQXVCO0FBQUEsRUFDckQsQ0FBQztBQUVELE9BQUssOEVBQThFLFlBQVk7QUFDOUYsUUFBSSx5QkFBeUI7QUFDN0IsVUFBTSxVQUFVLGNBQWMsWUFBWSxNQUFNLE1BQU07QUFDckQ7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFNBQVMsYUFBYSxnQ0FBZ0Msa0JBQWtCO0FBRTlFLFVBQU0sTUFBTSxNQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLEVBQUUsaUJBQWlCLE9BQU8sZ0JBQWdCLENBQUM7QUFFbkgsV0FBTyxZQUFZLElBQUksTUFBTSx1QkFBdUI7QUFDcEQsV0FBTyxZQUFZLHdCQUF3QixDQUFDO0FBQUEsRUFDN0MsQ0FBQztBQUVELE9BQUssK0RBQStELE1BQU07QUFDekUsVUFBTSxVQUFVLGNBQWM7QUFDOUIsVUFBTSxNQUFNLFFBQVEsMEJBQTBCO0FBQUEsTUFDN0MsTUFBTSxpQkFBaUI7QUFBQSxNQUN2QixNQUFNO0FBQUEsTUFDTixLQUFLO0FBQUEsSUFDTixDQUFDO0FBRUQsV0FBTyxZQUFZLElBQUksTUFBTSwwREFBMEQ7QUFBQSxFQUN4RixDQUFDO0FBRUQsT0FBSyw0RUFBNEUsWUFBWTtBQUM1RixVQUFNLFFBQWtCLENBQUM7QUFDekIsVUFBTSxVQUFVLGNBQWMsWUFBWSxNQUFNLFFBQVc7QUFBQSxNQUMxRCxVQUFVLFlBQVk7QUFBRSxjQUFNLEtBQUssVUFBVTtBQUFHLGVBQU87QUFBQSxNQUFJO0FBQUEsTUFDM0QsT0FBTyxZQUFZO0FBQUUsY0FBTSxLQUFLLE9BQU87QUFBQSxNQUFHO0FBQUEsTUFDMUMsVUFBVSxZQUFZO0FBQUUsY0FBTSxLQUFLLFVBQVU7QUFBQSxNQUFHO0FBQUEsTUFDaEQsTUFBTSxZQUFZO0FBQUUsY0FBTSxLQUFLLE1BQU07QUFBRyxlQUFPO0FBQUEsTUFBTztBQUFBLElBQ3ZELENBQUM7QUFFRCxVQUFNLFFBQVEsbUJBQW1CO0FBQUEsTUFDaEMsTUFBTTtBQUFBLE1BQ04sYUFBYTtBQUFBLE1BQ2IsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1Isa0JBQWtCO0FBQUEsUUFDakIsTUFBTSxpQkFBaUI7QUFBQSxRQUN2QixNQUFNO0FBQUEsUUFDTixLQUFLO0FBQUEsTUFDTjtBQUFBLE1BQ0EsYUFBYTtBQUFBLE1BQ2Isc0JBQXNCLDBCQUEwQixZQUFZO0FBQUEsTUFDNUQsaUJBQWlCLGdCQUFnQjtBQUFBLElBQ2xDLEdBQUc7QUFBQSxNQUNGLFlBQVk7QUFBQSxNQUNaLGNBQWM7QUFBQSxNQUNkLGlCQUFpQixnQkFBZ0I7QUFBQSxJQUNsQyxDQUFDO0FBRUQsV0FBTyxnQkFBZ0IsT0FBTyxDQUFDLFlBQVksU0FBUyxZQUFZLFVBQVUsQ0FBQztBQUFBLEVBQzVFLENBQUM7QUFNRCxRQUFNLHVCQUF1QixNQUFNO0FBRWxDLGFBQVMscUJBQ1IsT0FDQSxTQUNDO0FBQ0QsWUFBTSx1QkFBdUIsTUFBTSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDckUsMkJBQXFCLEtBQUssaUJBQWlCLEVBQUUsZ0JBQWdCLFlBQVksT0FBVSxDQUErQjtBQUNsSCwyQkFBcUIsS0FBSyxtQkFBbUIsY0FBYyxDQUFDO0FBQzVELDJCQUFxQixLQUFLLHFCQUFxQixFQUFFLFdBQVcsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFtQztBQUNsSCwyQkFBcUIsS0FBSyx5QkFBeUIsRUFBRSxnQkFBZ0IsRUFBRSxrQkFBa0IsSUFBSSxLQUFLLHFCQUFxQixFQUFFLEVBQUUsQ0FBdUM7QUFDbEssMkJBQXFCLEtBQUssY0FBYztBQUFBLFFBQ3ZDLFFBQVEsWUFBWTtBQUFBLFFBQ3BCLEtBQUssT0FBTyxhQUFrQjtBQUFFLGdCQUFNLFFBQVE7QUFBQSxRQUFHO0FBQUEsUUFDakQsY0FBYyxZQUFZO0FBQUEsUUFDMUIsU0FBUyxPQUFPLGFBQWtCLFNBQVMsVUFBVSxRQUFRLEtBQUssRUFBRSxVQUFVLENBQUMsRUFBRTtBQUFBLE1BQ2xGLENBQTRCO0FBQzVCLDJCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDM0QsMkJBQXFCLEtBQUssc0JBQXNCLEVBQUUsUUFBUSxNQUFNLE9BQVUsQ0FBb0M7QUFDOUcsMkJBQXFCLEtBQUssa0JBQWtCLEVBQUUsY0FBYyxPQUFPLElBQWEsT0FBOEMsR0FBRyxFQUFFLENBQWdDO0FBQ25LLDJCQUFxQixLQUFLLGlCQUFpQixNQUFNLElBQUksSUFBSSx1QkFBdUIsQ0FBQyxDQUFDO0FBQ2xGLGFBQU8scUJBQXFCLGVBQWUsNEJBQTRCO0FBQUEsSUFDeEU7QUFFQSxTQUFLLGdFQUFnRSxZQUFZO0FBQ2hGLFlBQU0sVUFBb0IsQ0FBQztBQUMzQixZQUFNLFVBQVUscUJBQXFCLE9BQUssUUFBUSxLQUFLLEVBQUUsSUFBSSxDQUFDO0FBRTlELFlBQU0sUUFBUSxvQkFBb0I7QUFBQSxRQUNqQyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixTQUFTO0FBQUEsUUFDVCxRQUFRO0FBQUEsUUFDUixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixjQUFjLE1BQU0sY0FBYztBQUFBLFFBQzdFLGFBQWE7QUFBQSxRQUNiLHNCQUFzQiwwQkFBMEIsa0JBQWtCO0FBQUEsUUFDbEUsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQ2xDLENBQUM7QUFFRCxhQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFBQSxJQUNyQyxDQUFDO0FBRUQsU0FBSywwQ0FBMEMsWUFBWTtBQUMxRCxZQUFNLFVBQW9CLENBQUM7QUFDM0IsWUFBTSxVQUFVLHFCQUFxQixPQUFLLFFBQVEsS0FBSyxFQUFFLElBQUksQ0FBQztBQUU5RCxZQUFNLFFBQVEsb0JBQW9CO0FBQUEsUUFDakMsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLFFBQ1Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxNQUFNLGFBQWE7QUFBQSxRQUN0RSxhQUFhO0FBQUEsUUFDYixzQkFBc0IsMEJBQTBCLG1CQUFtQjtBQUFBLFFBQ25FLGlCQUFpQixnQkFBZ0I7QUFBQSxNQUNsQyxDQUFDO0FBRUQsYUFBTyxHQUFHLFFBQVEsVUFBVSxDQUFDO0FBQzdCLGFBQU8sR0FBRyxRQUFRLENBQUMsRUFBRSxTQUFTLHVCQUF1QixDQUFDO0FBQUEsSUFDdkQsQ0FBQztBQUVELFNBQUssa0RBQWtELFlBQVk7QUFDbEUsWUFBTSxVQUFvQixDQUFDO0FBQzNCLFlBQU0sVUFBVSxxQkFBcUIsT0FBSyxRQUFRLEtBQUssRUFBRSxJQUFJLENBQUM7QUFFOUQsWUFBTSxRQUFRLG9CQUFvQjtBQUFBLFFBQ2pDLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLFNBQVM7QUFBQSxRQUNULFFBQVE7QUFBQSxRQUNSLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLEtBQUssU0FBUyxlQUFlO0FBQUEsUUFDeEUsYUFBYTtBQUFBLFFBQ2Isc0JBQXNCLDBCQUEwQixtQkFBbUI7QUFBQSxRQUNuRSxpQkFBaUIsZ0JBQWdCO0FBQUEsTUFDbEMsQ0FBQztBQUVELGFBQU8sR0FBRyxRQUFRLFVBQVUsQ0FBQztBQUU3QixhQUFPLEdBQUcsUUFBUSxDQUFDLEVBQUUsU0FBUyxPQUFPLEdBQUcsMkJBQTJCLFFBQVEsQ0FBQyxDQUFDLEVBQUU7QUFBQSxJQUNoRixDQUFDO0FBRUQsU0FBSyx1Q0FBdUMsWUFBWTtBQUN2RCxZQUFNLFVBQW9CLENBQUM7QUFDM0IsWUFBTSxVQUFVLHFCQUFxQixPQUFLLFFBQVEsS0FBSyxFQUFFLElBQUksQ0FBQztBQUU5RCxZQUFNLFFBQVEsb0JBQW9CO0FBQUEsUUFDakMsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLFFBQ1Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsS0FBSyxTQUFTLGFBQWE7QUFBQSxRQUN0RSxhQUFhO0FBQUEsUUFDYixzQkFBc0IsMEJBQTBCLG1CQUFtQjtBQUFBLFFBQ25FLGlCQUFpQixnQkFBZ0I7QUFBQSxNQUNsQyxDQUFDO0FBRUQsYUFBTyxHQUFHLFFBQVEsVUFBVSxDQUFDO0FBQzdCLGFBQU8sR0FBRyxRQUFRLENBQUMsRUFBRSxTQUFTLGdCQUFnQixDQUFDO0FBQUEsSUFDaEQsQ0FBQztBQUVELFNBQUssb0NBQW9DLFlBQVk7QUFDcEQsWUFBTSx1QkFBdUIsTUFBTSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDckUsMkJBQXFCLEtBQUssaUJBQWlCLEVBQUUsZ0JBQWdCLFlBQVksT0FBVSxDQUErQjtBQUNsSCwyQkFBcUIsS0FBSyxtQkFBbUIsY0FBYyxDQUFDO0FBQzVELDJCQUFxQixLQUFLLHFCQUFxQixFQUFFLFdBQVcsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFtQztBQUNsSCwyQkFBcUIsS0FBSyx5QkFBeUIsRUFBRSxnQkFBZ0IsRUFBRSxrQkFBa0IsSUFBSSxLQUFLLHFCQUFxQixFQUFFLEVBQUUsQ0FBdUM7QUFDbEssMkJBQXFCLEtBQUssY0FBYztBQUFBLFFBQ3ZDLFFBQVEsWUFBWTtBQUFBLFFBQ3BCLEtBQUssWUFBWTtBQUFFLGdCQUFNLElBQUksTUFBTSxtQkFBbUI7QUFBQSxRQUFHO0FBQUEsUUFDekQsY0FBYyxZQUFZO0FBQUEsUUFDMUIsU0FBUyxhQUFhLEVBQUUsVUFBVSxDQUFDLEVBQUU7QUFBQSxNQUN0QyxDQUE0QjtBQUM1QiwyQkFBcUIsS0FBSyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQzNELDJCQUFxQixLQUFLLHNCQUFzQixFQUFFLFFBQVEsTUFBTSxPQUFVLENBQW9DO0FBQzlHLDJCQUFxQixLQUFLLGtCQUFrQixFQUFFLGNBQWMsT0FBTyxJQUFhLE9BQThDLEdBQUcsRUFBRSxDQUFnQztBQUNuSywyQkFBcUIsS0FBSyxpQkFBaUIsTUFBTSxJQUFJLElBQUksdUJBQXVCLENBQUMsQ0FBQztBQUNsRixZQUFNLFVBQVUscUJBQXFCLGVBQWUsNEJBQTRCO0FBR2hGLFlBQU0sUUFBUSxvQkFBb0I7QUFBQSxRQUNqQyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixTQUFTO0FBQUEsUUFDVCxRQUFRO0FBQUEsUUFDUixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixRQUFRLE1BQU0sYUFBYTtBQUFBLFFBQ3RFLGFBQWE7QUFBQSxRQUNiLHNCQUFzQiwwQkFBMEIsbUJBQW1CO0FBQUEsUUFDbkUsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQ2xDLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLG9EQUFvRCxZQUFZO0FBR3BFLFlBQU0sVUFBb0IsQ0FBQztBQUMzQixZQUFNLFVBQVU7QUFBQSxRQUNmLE9BQUssUUFBUSxLQUFLLEVBQUUsSUFBSTtBQUFBLFFBQ3hCLEVBQUUsU0FBUyxPQUFPLEVBQUUsVUFBVSxDQUFDLEVBQUUsR0FBRztBQUFBLE1BQ3JDO0FBRUEsWUFBTSxRQUFRLG9CQUFvQjtBQUFBLFFBQ2pDLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLFNBQVM7QUFBQSxRQUNULFFBQVE7QUFBQSxRQUNSLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLFFBQVEsTUFBTSxhQUFhO0FBQUEsUUFDdEUsYUFBYTtBQUFBLFFBQ2Isc0JBQXNCLDBCQUEwQixtQkFBbUI7QUFBQSxRQUNuRSxpQkFBaUIsZ0JBQWdCO0FBQUEsTUFDbEMsQ0FBQztBQUdELGFBQU8sR0FBRyxRQUFRLFVBQVUsR0FBRyxzREFBc0QsUUFBUSxNQUFNLEtBQUssUUFBUSxLQUFLLElBQUksQ0FBQyxFQUFFO0FBQzVILGFBQU8sR0FBRyxRQUFRLENBQUMsRUFBRSxTQUFTLHVCQUF1QixHQUFHLHFDQUFxQztBQUM3RixhQUFPLEdBQUcsUUFBUSxLQUFLLE9BQUssRUFBRSxTQUFTLFFBQVEsQ0FBQyxHQUFHLG9DQUFvQztBQUFBLElBQ3hGLENBQUM7QUFFRCxTQUFLLHFDQUFxQyxZQUFZO0FBQ3JELFlBQU0sVUFBb0IsQ0FBQztBQUMzQixZQUFNLFVBQVU7QUFBQSxRQUNmLE9BQUssUUFBUSxLQUFLLEVBQUUsSUFBSTtBQUFBLFFBQ3hCO0FBQUEsVUFDQyxTQUFTLENBQUMsYUFBa0I7QUFFM0IsZ0JBQUksU0FBUyxLQUFLLFNBQVMsUUFBUSxHQUFHO0FBQ3JDLHFCQUFPLEVBQUUsVUFBVSxDQUFDLEVBQUUsTUFBTSxhQUFhLENBQUMsRUFBRTtBQUFBLFlBQzdDO0FBQ0EsbUJBQU8sRUFBRSxVQUFVLENBQUMsRUFBRTtBQUFBLFVBQ3ZCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFFBQVEsb0JBQW9CO0FBQUEsUUFDakMsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLFFBQ1Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxNQUFNLGFBQWE7QUFBQSxRQUN0RSxhQUFhO0FBQUEsUUFDYixzQkFBc0IsMEJBQTBCLG1CQUFtQjtBQUFBLFFBQ25FLGlCQUFpQixnQkFBZ0I7QUFBQSxNQUNsQyxDQUFDO0FBR0QsYUFBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLGFBQU8sR0FBRyxRQUFRLENBQUMsRUFBRSxTQUFTLHVCQUF1QixDQUFDO0FBQUEsSUFDdkQsQ0FBQztBQUVELFNBQUssK0VBQStFLFlBQVk7QUFDL0YsWUFBTSxVQUFvQixDQUFDO0FBQzNCLFlBQU0sVUFBVSxxQkFBcUIsT0FBSyxRQUFRLEtBQUssRUFBRSxJQUFJLENBQUM7QUFFOUQsWUFBTSxRQUFRO0FBQUEsUUFDYjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsU0FBUztBQUFBLFVBQ1QsUUFBUTtBQUFBLFVBQ1Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxNQUFNLGNBQWMsTUFBTSxZQUFZO0FBQUEsVUFDekYsYUFBYTtBQUFBLFVBQ2Isc0JBQXNCLDBCQUEwQixtQkFBbUI7QUFBQSxVQUNuRSxpQkFBaUIsZ0JBQWdCO0FBQUEsUUFDbEM7QUFBQTtBQUFBLFFBRUEsQ0FBQyxFQUFFLE1BQU0saUJBQWlCLFFBQVEsTUFBTSxjQUFjLE1BQU0sWUFBWSxDQUFDO0FBQUEsTUFDMUU7QUFFQSxhQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFBQSxJQUNyQyxDQUFDO0FBRUQsU0FBSyx5RUFBeUUsWUFBWTtBQUN6RixZQUFNLFVBQW9CLENBQUM7QUFDM0IsWUFBTSxVQUFVLHFCQUFxQixPQUFLLFFBQVEsS0FBSyxFQUFFLElBQUksQ0FBQztBQUU5RCxZQUFNLFFBQVE7QUFBQSxRQUNiO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixTQUFTO0FBQUEsVUFDVCxRQUFRO0FBQUEsVUFDUixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixRQUFRLE1BQU0sY0FBYyxNQUFNLFlBQVk7QUFBQSxVQUN6RixhQUFhO0FBQUEsVUFDYixzQkFBc0IsMEJBQTBCLG1CQUFtQjtBQUFBLFVBQ25FLGlCQUFpQixnQkFBZ0I7QUFBQSxRQUNsQztBQUFBO0FBQUEsUUFFQSxDQUFDLEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxNQUFNLHlCQUF5QixDQUFDO0FBQUEsTUFDbkU7QUFFQSxhQUFPLEdBQUcsUUFBUSxVQUFVLENBQUM7QUFDN0IsYUFBTyxHQUFHLFFBQVEsQ0FBQyxFQUFFLFNBQVMsdUJBQXVCLENBQUM7QUFBQSxJQUN2RCxDQUFDO0FBRUQsU0FBSyxrRUFBa0UsWUFBWTtBQUNsRixZQUFNLFVBQW9CLENBQUM7QUFDM0IsWUFBTSxVQUFVLHFCQUFxQixPQUFLLFFBQVEsS0FBSyxFQUFFLElBQUksQ0FBQztBQUU5RCxZQUFNLFFBQVE7QUFBQSxRQUNiO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixTQUFTO0FBQUEsVUFDVCxRQUFRO0FBQUEsVUFDUixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixRQUFRLE1BQU0sYUFBYTtBQUFBLFVBQ3RFLGFBQWE7QUFBQSxVQUNiLHNCQUFzQiwwQkFBMEIsbUJBQW1CO0FBQUEsVUFDbkUsaUJBQWlCLGdCQUFnQjtBQUFBLFFBQ2xDO0FBQUEsUUFDQSxDQUFDO0FBQUEsTUFDRjtBQUVBLGFBQU8sR0FBRyxRQUFRLFVBQVUsQ0FBQztBQUM3QixhQUFPLEdBQUcsUUFBUSxDQUFDLEVBQUUsU0FBUyx1QkFBdUIsQ0FBQztBQUFBLElBQ3ZELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
