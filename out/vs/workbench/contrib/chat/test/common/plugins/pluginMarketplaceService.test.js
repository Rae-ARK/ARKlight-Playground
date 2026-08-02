import assert from "assert";
import { timeout } from "../../../../../../base/common/async.js";
import { bufferToStream, VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Event } from "../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { joinPath } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { AGENT_PLUGIN_SCHEMA } from "../../../../../../platform/agentPlugins/common/agentPluginParser.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IRequestService } from "../../../../../../platform/request/common/request.js";
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { IEnvironmentService } from "../../../../../../platform/environment/common/environment.js";
import { IExtensionsWorkbenchService } from "../../../../extensions/common/extensions.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IAgentPluginRepositoryService } from "../../../common/plugins/agentPluginRepositoryService.js";
import { MarketplaceReferenceKind, MarketplaceType, PluginMarketplaceService, PluginSourceKind, extraKnownMarketplacesToConfigDict, getPluginSourceLabel, parseMarketplaceReference, parseMarketplaceReferences, parsePluginSource, readConfiguredMarketplaces } from "../../../common/plugins/pluginMarketplaceService.js";
import { IWorkspacePluginSettingsService } from "../../../common/plugins/workspacePluginSettingsService.js";
suite("PluginMarketplaceService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("parses GitHub shorthand marketplace", () => {
    const parsed = parseMarketplaceReference("microsoft/vscode");
    assert.ok(parsed);
    if (!parsed) {
      return;
    }
    assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitHubShorthand);
    assert.strictEqual(parsed.cloneUrl, "https://github.com/microsoft/vscode.git");
    assert.strictEqual(parsed.canonicalId, "github:microsoft/vscode");
    assert.strictEqual(parsed.displayLabel, "microsoft/vscode");
    assert.deepStrictEqual(parsed.cacheSegments, ["github.com", "microsoft", "vscode"]);
    assert.strictEqual(parsed.githubRepo, "microsoft/vscode");
  });
  test("parses GitHub shorthand marketplace with ref suffix", () => {
    const parsed = parseMarketplaceReference("microsoft/vscode#marketplace");
    assert.ok(parsed);
    if (!parsed) {
      return;
    }
    assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitHubShorthand);
    assert.strictEqual(parsed.cloneUrl, "https://github.com/microsoft/vscode.git");
    assert.strictEqual(parsed.canonicalId, "github:microsoft/vscode#marketplace");
    assert.strictEqual(parsed.displayLabel, "microsoft/vscode#marketplace");
    assert.deepStrictEqual(parsed.cacheSegments, ["github.com", "microsoft", "vscode", "ref_marketplace"]);
    assert.strictEqual(parsed.ref, "marketplace");
    assert.strictEqual(parsed.githubRepo, "microsoft/vscode");
  });
  test("parses direct HTTPS and SSH marketplaces ending in .git", () => {
    const https = parseMarketplaceReference("https://example.com/org/repo.git");
    assert.ok(https);
    if (!https) {
      return;
    }
    assert.strictEqual(https.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(https.displayLabel, "https://example.com/org/repo.git");
    assert.deepStrictEqual(https.cacheSegments, ["example.com", "org", "repo"]);
    const ssh = parseMarketplaceReference("ssh://git@example.com/org/repo.git");
    assert.ok(ssh);
    if (!ssh) {
      return;
    }
    assert.strictEqual(ssh.kind, MarketplaceReferenceKind.GitUri);
    assert.deepStrictEqual(ssh.cacheSegments, ["git@example.com", "org", "repo"]);
  });
  test("parses scp-like git URI marketplaces", () => {
    const parsed = parseMarketplaceReference("git@example.com:org/repo.git");
    assert.ok(parsed);
    if (!parsed) {
      return;
    }
    assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(parsed.cloneUrl, "git@example.com:org/repo.git");
    assert.strictEqual(parsed.canonicalId, "git:example.com/org/repo.git");
    assert.deepStrictEqual(parsed.cacheSegments, ["example.com", "org", "repo"]);
    assert.strictEqual(parsed.githubRepo, void 0);
  });
  test("parses git URI marketplaces with ref suffix", () => {
    const https = parseMarketplaceReference("https://example.com/org/repo.git#marketplace");
    assert.ok(https);
    assert.strictEqual(https?.cloneUrl, "https://example.com/org/repo.git");
    assert.strictEqual(https?.canonicalId, "git:example.com/org/repo.git#marketplace");
    assert.deepStrictEqual(https?.cacheSegments, ["example.com", "org", "repo", "ref_marketplace"]);
    assert.strictEqual(https?.ref, "marketplace");
    const scp = parseMarketplaceReference("git@example.com:org/repo.git#marketplace");
    assert.ok(scp);
    assert.strictEqual(scp?.cloneUrl, "git@example.com:org/repo.git");
    assert.strictEqual(scp?.canonicalId, "git:example.com/org/repo.git#marketplace");
    assert.deepStrictEqual(scp?.cacheSegments, ["example.com", "org", "repo", "ref_marketplace"]);
    assert.strictEqual(scp?.ref, "marketplace");
  });
  test("populates githubRepo for GitHub HTTPS URLs", () => {
    const withGit = parseMarketplaceReference("https://github.com/owner/repo.git");
    assert.ok(withGit);
    assert.strictEqual(withGit?.githubRepo, "owner/repo");
    const withoutGit = parseMarketplaceReference("https://github.com/owner/repo");
    assert.ok(withoutGit);
    assert.strictEqual(withoutGit?.githubRepo, "owner/repo");
  });
  test("populates githubRepo for GitHub SCP-style URLs", () => {
    const parsed = parseMarketplaceReference("git@github.com:owner/repo.git");
    assert.ok(parsed);
    assert.strictEqual(parsed?.githubRepo, "owner/repo");
  });
  test("does not populate githubRepo for non-GitHub URLs", () => {
    const https = parseMarketplaceReference("https://example.com/org/repo.git");
    assert.ok(https);
    assert.strictEqual(https?.githubRepo, void 0);
    const scp = parseMarketplaceReference("git@gitlab.com:org/repo.git");
    assert.ok(scp);
    assert.strictEqual(scp?.githubRepo, void 0);
  });
  test("parses local file marketplace references", () => {
    const parsed = parseMarketplaceReference("file:///tmp/marketplace-repo");
    assert.ok(parsed);
    if (!parsed) {
      return;
    }
    assert.strictEqual(parsed.kind, MarketplaceReferenceKind.LocalFileUri);
    assert.strictEqual(parsed.localRepositoryUri?.scheme, "file");
    assert.strictEqual(parsed.cloneUrl, "file:///tmp/marketplace-repo");
    assert.deepStrictEqual(parsed.cacheSegments, []);
  });
  test("accepts HTTPS and SSH marketplace entries without .git suffix", () => {
    const https = parseMarketplaceReference("https://example.com/org/repo");
    assert.ok(https);
    assert.strictEqual(https?.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(https?.canonicalId, "git:example.com/org/repo.git");
    assert.deepStrictEqual(https?.cacheSegments, ["example.com", "org", "repo"]);
    const ssh = parseMarketplaceReference("ssh://git@example.com/org/repo");
    assert.ok(ssh);
    assert.strictEqual(ssh?.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(ssh?.canonicalId, "git:git@example.com/org/repo.git");
    assert.strictEqual(parseMarketplaceReference("git@example.com:org/repo"), void 0);
  });
  test("accepts host-only HTTPS marketplace endpoints (per ADR-002 git.url is any string)", () => {
    const parsed = parseMarketplaceReference("https://plugins.internal.example.com");
    assert.ok(parsed);
    assert.strictEqual(parsed?.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(parsed?.cloneUrl, "https://plugins.internal.example.com/");
    assert.strictEqual(parsed?.canonicalId, "git:plugins.internal.example.com/");
    assert.deepStrictEqual(parsed?.cacheSegments, ["plugins.internal.example.com"]);
    assert.strictEqual(parsed?.githubRepo, void 0);
    const withSlash = parseMarketplaceReference("https://plugins.internal.example.com/");
    assert.strictEqual(withSlash?.canonicalId, "git:plugins.internal.example.com/");
  });
  test("readConfiguredMarketplaces converts policy dict to named marketplace entries", () => {
    const configService = new TestConfigurationService({
      [ChatConfiguration.ExtraMarketplaces]: {
        "acme-internal": '{"source":"https://plugins.internal.acme.com","autoUpdate":true}',
        "acme-public": '{"source":"https://copilot-plugins.acme.io","autoUpdate":false}',
        "vscode-team-kit": "microsoft/vscode-team-kit",
        "invalid": null
      }
    });
    const { extraValues, effectiveValues } = readConfiguredMarketplaces(configService);
    const refs = parseMarketplaceReferences(extraValues);
    assert.strictEqual(refs.length, 3);
    assert.deepStrictEqual(refs.map((r) => r.displayLabel), ["acme-internal", "acme-public", "vscode-team-kit"]);
    assert.strictEqual(refs[0].kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(refs[2].kind, MarketplaceReferenceKind.GitHubShorthand);
    assert.deepStrictEqual(refs.map((r) => r.autoUpdate), [true, false, void 0]);
    assert.strictEqual(effectiveValues.length, extraValues.length);
  });
  test("extraKnownMarketplacesToConfigDict: returns undefined for empty/missing input", () => {
    assert.strictEqual(extraKnownMarketplacesToConfigDict(void 0), void 0);
    assert.strictEqual(extraKnownMarketplacesToConfigDict([]), void 0);
  });
  test("extraKnownMarketplacesToConfigDict: github source becomes owner/repo shorthand", () => {
    const dict = extraKnownMarketplacesToConfigDict([
      { name: "vscode-team-kit", source: { source: "github", repo: "microsoft/vscode-team-kit" } }
    ]);
    assert.deepStrictEqual(dict, { "vscode-team-kit": "microsoft/vscode-team-kit" });
  });
  test("extraKnownMarketplacesToConfigDict: preserves explicit autoUpdate values", () => {
    const dict = extraKnownMarketplacesToConfigDict([
      { name: "always", autoUpdate: true, source: { source: "github", repo: "microsoft/always" } },
      { name: "never", autoUpdate: false, source: { source: "github", repo: "microsoft/never" } },
      { name: "default", source: { source: "github", repo: "microsoft/default" } }
    ]);
    assert.deepStrictEqual(dict, {
      always: '{"source":"microsoft/always","autoUpdate":true}',
      never: '{"source":"microsoft/never","autoUpdate":false}',
      default: "microsoft/default"
    });
  });
  test("managed autoUpdate survives a duplicate user marketplace reference", () => {
    const configService = new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: ["microsoft/plugins"],
      [ChatConfiguration.ExtraMarketplaces]: {
        managed: '{"source":"microsoft/plugins","autoUpdate":true}'
      }
    });
    const refs = parseMarketplaceReferences(readConfiguredMarketplaces(configService).effectiveValues);
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].autoUpdate, true);
  });
  test("extraKnownMarketplacesToConfigDict: github source with ref appends #ref", () => {
    const dict = extraKnownMarketplacesToConfigDict([
      { name: "team-kit-beta", source: { source: "github", repo: "microsoft/vscode-team-kit", ref: "beta" } }
    ]);
    assert.deepStrictEqual(dict, { "team-kit-beta": "microsoft/vscode-team-kit#beta" });
  });
  test("extraKnownMarketplacesToConfigDict: git source becomes raw URL (with optional #ref)", () => {
    const dict = extraKnownMarketplacesToConfigDict([
      { name: "acme-internal", source: { source: "git", url: "https://plugins.internal.acme.com" } },
      { name: "acme-tagged", source: { source: "git", url: "https://git.acme.com/plugins.git", ref: "v1" } }
    ]);
    assert.deepStrictEqual(dict, {
      "acme-internal": "https://plugins.internal.acme.com",
      "acme-tagged": "https://git.acme.com/plugins.git#v1"
    });
  });
  test("extraKnownMarketplacesToConfigDict: end-to-end policy \u2192 config dict \u2192 readConfiguredMarketplaces \u2192 parseMarketplaceReferences", () => {
    const policyEntries = [
      { name: "acme-internal", source: { source: "git", url: "https://plugins.internal.acme.com" } },
      { name: "acme-public", source: { source: "git", url: "https://copilot-plugins.acme.io" } },
      { name: "vscode-team-kit", source: { source: "github", repo: "microsoft/vscode-team-kit" } }
    ];
    const dict = extraKnownMarketplacesToConfigDict(policyEntries);
    assert.ok(dict);
    const roundTripped = JSON.parse(JSON.stringify(dict));
    const configService = new TestConfigurationService({
      [ChatConfiguration.ExtraMarketplaces]: roundTripped
    });
    const { extraValues } = readConfiguredMarketplaces(configService);
    const refs = parseMarketplaceReferences(extraValues);
    assert.strictEqual(refs.length, 3, "all three policy entries are surfaced as marketplace references");
    assert.deepStrictEqual(
      refs.map((r) => r.displayLabel),
      ["acme-internal", "acme-public", "vscode-team-kit"],
      'displayLabel must equal the policy `name` so enabledPlugins["plugin@<name>"] keys resolve'
    );
    assert.strictEqual(refs[0].kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(refs[1].kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(refs[2].kind, MarketplaceReferenceKind.GitHubShorthand);
  });
  test("parses Azure DevOps HTTPS clone URLs without .git suffix", () => {
    const parsed = parseMarketplaceReference("https://dev.azure.com/org/project/_git/repo");
    assert.ok(parsed);
    assert.strictEqual(parsed?.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(parsed?.cloneUrl, "https://dev.azure.com/org/project/_git/repo");
    assert.strictEqual(parsed?.canonicalId, "git:dev.azure.com/org/project/_git/repo.git");
    assert.deepStrictEqual(parsed?.cacheSegments, ["dev.azure.com", "org", "project", "_git", "repo"]);
  });
  test("deduplicates Azure DevOps URLs with and without .git suffix", () => {
    const parsed = parseMarketplaceReferences([
      "https://dev.azure.com/org/project/_git/repo",
      "https://dev.azure.com/org/project/_git/repo.git"
    ]);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].canonicalId, "git:dev.azure.com/org/project/_git/repo.git");
  });
  test("github.com URI form and GitHub shorthand form share the same canonicalId (policy trust comparisons must match)", () => {
    const shorthand = parseMarketplaceReference("microsoft/vscode-team-kit");
    const httpsWithGit = parseMarketplaceReference("https://github.com/microsoft/vscode-team-kit.git");
    const httpsWithoutGit = parseMarketplaceReference("https://github.com/microsoft/vscode-team-kit");
    const scp = parseMarketplaceReference("git@github.com:microsoft/vscode-team-kit.git");
    assert.ok(shorthand);
    assert.ok(httpsWithGit);
    assert.ok(httpsWithoutGit);
    assert.ok(scp);
    assert.strictEqual(httpsWithGit.canonicalId, shorthand.canonicalId);
    assert.strictEqual(httpsWithoutGit.canonicalId, shorthand.canonicalId);
    assert.strictEqual(scp.canonicalId, shorthand.canonicalId);
    const deduped = parseMarketplaceReferences([
      "microsoft/vscode-team-kit",
      "https://github.com/microsoft/vscode-team-kit.git",
      "https://github.com/microsoft/vscode-team-kit",
      "git@github.com:microsoft/vscode-team-kit.git"
    ]);
    assert.strictEqual(deduped.length, 1);
  });
  test("parses HTTPS URI with trailing slash after .git", () => {
    const parsed = parseMarketplaceReference("https://example.com/org/repo.git/");
    assert.ok(parsed);
    if (!parsed) {
      return;
    }
    assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(parsed.canonicalId, "git:example.com/org/repo.git");
    assert.deepStrictEqual(parsed.cacheSegments, ["example.com", "org", "repo"]);
  });
  test("deduplicates github.com URI, SSH, and shorthand to the same canonical id", () => {
    const parsed = parseMarketplaceReferences([
      "microsoft/vscode",
      "https://github.com/microsoft/vscode.git",
      "git@github.com:microsoft/vscode.git"
    ]);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].canonicalId, "github:microsoft/vscode");
  });
  test("parseMarketplaceReferences ignores invalid entries (null, numbers, malformed objects)", () => {
    const parsed = parseMarketplaceReferences([null, 42, {}, "microsoft/vscode"]);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].canonicalId, "github:microsoft/vscode");
  });
  test("parseMarketplaceReferences accepts policy-shape objects and uses name as displayLabel", () => {
    const parsed = parseMarketplaceReferences([
      { name: "vscode-team-kit", source: { source: "github", repo: "microsoft/vscode-team-kit" } },
      { name: "acme-public", source: { source: "git", url: "https://copilot-plugins.acme.io", ref: "main" } }
    ]);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].displayLabel, "vscode-team-kit");
    assert.strictEqual(parsed[0].canonicalId, "github:microsoft/vscode-team-kit");
    assert.strictEqual(parsed[1].displayLabel, "acme-public");
    assert.strictEqual(parsed[1].ref, "main");
  });
  test("treats different marketplace refs as distinct references", () => {
    const parsed = parseMarketplaceReferences([
      "microsoft/vscode#main",
      "microsoft/vscode#marketplace",
      "https://github.com/microsoft/vscode.git#marketplace"
    ]);
    assert.deepStrictEqual(parsed.map((r) => r.canonicalId), [
      "github:microsoft/vscode#main",
      "github:microsoft/vscode#marketplace"
    ]);
  });
});
suite("PluginMarketplaceService - GitHub marketplace refs", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("fetches GitHub marketplace definitions from the configured ref", async () => {
    const requestUrls = [];
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: ["microsoft/vscode#marketplace"],
      [ChatConfiguration.PluginsEnabled]: true
    }));
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IFileService, {});
    instantiationService.stub(IAgentPluginRepositoryService, {
      agentPluginsHome: URI.file("/agent-plugins"),
      ensureRepository: async () => {
        throw new Error("should not clone for 5xx responses");
      }
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IRequestService, {
      request: async (options) => {
        requestUrls.push(options.url);
        return { res: { headers: {}, statusCode: 500 }, stream: bufferToStream(VSBuffer.fromString("")) };
      }
    });
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    instantiationService.stub(IWorkspacePluginSettingsService, {
      extraMarketplaces: observableValue("test.extraMarketplaces", []),
      enabledPlugins: observableValue("test.enabledPlugins", /* @__PURE__ */ new Map())
    });
    instantiationService.stub(IWorkspaceTrustManagementService, {
      isWorkspaceTrusted: () => true,
      onDidChangeTrust: Event.None
    });
    instantiationService.stub(IExtensionsWorkbenchService, {
      getAutoUpdateValue: () => "on"
    });
    const service = store.add(instantiationService.createInstance(PluginMarketplaceService));
    await service.fetchMarketplacePlugins(CancellationToken.None);
    assert.ok(requestUrls.length > 0);
    assert.ok(requestUrls.every((url) => url.includes("/marketplace/")));
    assert.ok(requestUrls.every((url) => !url.includes("/main/")));
  });
});
suite("PluginMarketplaceService - Agent Plugin direct install probes", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  class ProbeFileService {
    constructor() {
      this.files = /* @__PURE__ */ new Map();
    }
    async exists(resource) {
      return this.files.has(resource.toString());
    }
    async readFile(resource) {
      const value = this.files.get(resource.toString());
      if (value === void 0) {
        throw new Error(`Missing file: ${resource.toString()}`);
      }
      return { value: VSBuffer.fromString(value) };
    }
    createWatcher() {
      return { onDidChange: Event.None, dispose: () => {
      } };
    }
  }
  function createService(fileService) {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: [],
      [ChatConfiguration.PluginsEnabled]: true
    }));
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IAgentPluginRepositoryService, { agentPluginsHome: URI.file("/agent-plugins") });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IRequestService, {});
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    instantiationService.stub(IWorkspacePluginSettingsService, {
      extraMarketplaces: observableValue("test.extraMarketplaces", []),
      enabledPlugins: observableValue("test.enabledPlugins", /* @__PURE__ */ new Map())
    });
    instantiationService.stub(IWorkspaceTrustManagementService, {
      isWorkspaceTrusted: () => true,
      onDidChangeTrust: Event.None
    });
    instantiationService.stub(IExtensionsWorkbenchService, {
      getAutoUpdateValue: () => "off"
    });
    return store.add(instantiationService.createInstance(PluginMarketplaceService));
  }
  function seedCompatibleManifest(fileService, repoDir) {
    fileService.files.set(joinPath(repoDir, "plugin.json").toString(), JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA.replace("/1.0.0/", "/1.0.1/"),
      name: "compatible-plugin"
    }));
  }
  test("reads a Git direct-source manifest with a compatible schema revision", async () => {
    const fileService = new ProbeFileService();
    const repoDir = URI.file("/repos/compatible");
    seedCompatibleManifest(fileService, repoDir);
    const service = createService(fileService);
    const result = await service.readSinglePluginManifest(repoDir, parseMarketplaceReference("owner/compatible"));
    assert.strictEqual(result?.name, "compatible-plugin");
  });
  test("recognizes a local directory with a compatible schema revision", async () => {
    const fileService = new ProbeFileService();
    const repoDir = URI.file("/plugins/compatible");
    seedCompatibleManifest(fileService, repoDir);
    const service = createService(fileService);
    const result = await service.isPluginDirectory(repoDir);
    assert.strictEqual(result, true);
  });
});
suite("PluginMarketplaceService - getMarketplacePluginMetadata", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const marketplaceRef = parseMarketplaceReference("microsoft/plugins");
  function createService(autoUpdate = "on", extraMarketplaces = {}) {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: ["microsoft/plugins"],
      [ChatConfiguration.ExtraMarketplaces]: extraMarketplaces,
      [ChatConfiguration.PluginsEnabled]: true
    }));
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IFileService, {});
    instantiationService.stub(IAgentPluginRepositoryService, { agentPluginsHome: URI.file("/agent-plugins") });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IRequestService, {});
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    instantiationService.stub(IWorkspacePluginSettingsService, {
      extraMarketplaces: observableValue("test.extraMarketplaces", []),
      enabledPlugins: observableValue("test.enabledPlugins", /* @__PURE__ */ new Map())
    });
    instantiationService.stub(IWorkspaceTrustManagementService, {
      isWorkspaceTrusted: () => true,
      onDidChangeTrust: Event.None
    });
    instantiationService.stub(IExtensionsWorkbenchService, {
      getAutoUpdateValue: () => autoUpdate
    });
    return store.add(instantiationService.createInstance(PluginMarketplaceService));
  }
  test("returns metadata for an installed plugin", () => {
    const service = createService();
    const pluginUri = URI.file("/cache/agentPlugins/my-plugin");
    const plugin = {
      name: "my-plugin",
      description: "A test plugin",
      version: "2.0.0",
      source: "plugins/my-plugin",
      sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/my-plugin" },
      marketplace: marketplaceRef.displayLabel,
      marketplaceReference: marketplaceRef,
      marketplaceType: MarketplaceType.Copilot
    };
    service.addInstalledPlugin(pluginUri, plugin);
    const result = service.getMarketplacePluginMetadata(pluginUri);
    assert.deepStrictEqual(result, plugin);
  });
  test("returns undefined for a URI that is not installed", () => {
    const service = createService();
    const result = service.getMarketplacePluginMetadata(URI.file("/some/other/path"));
    assert.strictEqual(result, void 0);
  });
  test("returns undefined when no plugins are installed", () => {
    const service = createService();
    const result = service.getMarketplacePluginMetadata(URI.file("/any/path"));
    assert.strictEqual(result, void 0);
  });
  test("managed marketplace autoUpdate overrides the global setting by canonical identity", () => {
    const service = createService("off", {
      always: '{"source":"microsoft/always","autoUpdate":true}',
      never: '{"source":"microsoft/never","autoUpdate":false}',
      inherited: "microsoft/inherited"
    });
    assert.deepStrictEqual({
      always: service.isMarketplaceAutoUpdateEnabled(parseMarketplaceReference("https://github.com/microsoft/always.git")),
      never: service.isMarketplaceAutoUpdateEnabled(parseMarketplaceReference("microsoft/never")),
      inherited: service.isMarketplaceAutoUpdateEnabled(parseMarketplaceReference("microsoft/inherited")),
      unmanaged: service.isMarketplaceAutoUpdateEnabled(parseMarketplaceReference("microsoft/unmanaged"))
    }, {
      always: true,
      never: false,
      inherited: false,
      unmanaged: false
    });
  });
});
suite("PluginMarketplaceService - installed plugins lifecycle", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const marketplaceRef = parseMarketplaceReference("microsoft/plugins");
  function makePlugin(name, source) {
    return {
      name,
      description: `${name} description`,
      version: "1.0.0",
      source,
      sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: source },
      marketplace: marketplaceRef.displayLabel,
      marketplaceReference: marketplaceRef,
      marketplaceType: MarketplaceType.Copilot
    };
  }
  function createService() {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: ["microsoft/plugins"],
      [ChatConfiguration.PluginsEnabled]: true
    }));
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IFileService, {});
    instantiationService.stub(IAgentPluginRepositoryService, { agentPluginsHome: URI.file("/agent-plugins") });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IRequestService, {});
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    instantiationService.stub(IWorkspacePluginSettingsService, {
      extraMarketplaces: observableValue("test.extraMarketplaces", []),
      enabledPlugins: observableValue("test.enabledPlugins", /* @__PURE__ */ new Map())
    });
    instantiationService.stub(IWorkspaceTrustManagementService, {
      isWorkspaceTrusted: () => true,
      onDidChangeTrust: Event.None
    });
    instantiationService.stub(IExtensionsWorkbenchService, {
      getAutoUpdateValue: () => "on"
    });
    return store.add(instantiationService.createInstance(PluginMarketplaceService));
  }
  test("installedPlugins observable is empty with no plugins", () => {
    const service = createService();
    assert.deepStrictEqual(service.installedPlugins.get(), []);
  });
  test("addInstalledPlugin makes plugin appear in installedPlugins", () => {
    const service = createService();
    const uri = URI.file("/agent-plugins/github.com/microsoft/plugins/my-plugin");
    const plugin = makePlugin("my-plugin", "my-plugin");
    service.addInstalledPlugin(uri, plugin);
    const installed = service.installedPlugins.get();
    assert.strictEqual(installed.length, 1);
    assert.strictEqual(installed[0].plugin.name, "my-plugin");
  });
  test("removeInstalledPlugin removes plugin from installedPlugins and metadata", () => {
    const service = createService();
    const uri = URI.file("/agent-plugins/github.com/microsoft/plugins/my-plugin");
    const plugin = makePlugin("my-plugin", "my-plugin");
    service.addInstalledPlugin(uri, plugin);
    assert.strictEqual(service.installedPlugins.get().length, 1);
    service.removeInstalledPlugin(uri);
    assert.strictEqual(service.installedPlugins.get().length, 0);
    assert.strictEqual(service.getMarketplacePluginMetadata(uri), void 0);
  });
  test("addInstalledPlugin updates metadata for existing entry", () => {
    const service = createService();
    const uri = URI.file("/agent-plugins/github.com/microsoft/plugins/my-plugin");
    const v1 = makePlugin("my-plugin", "my-plugin");
    const v2 = { ...v1, version: "2.0.0", description: "updated" };
    service.addInstalledPlugin(uri, v1);
    service.addInstalledPlugin(uri, v2);
    const installed = service.installedPlugins.get();
    assert.strictEqual(installed.length, 1);
    assert.strictEqual(installed[0].plugin.version, "2.0.0");
    assert.strictEqual(installed[0].plugin.description, "updated");
  });
  test("getMarketplacePluginMetadata finds metadata for child URI", () => {
    const service = createService();
    const uri = URI.file("/agent-plugins/github.com/microsoft/plugins");
    const plugin = makePlugin("my-plugin", "my-plugin");
    service.addInstalledPlugin(uri, plugin);
    const childUri = URI.file("/agent-plugins/github.com/microsoft/plugins/subdir/file.ts");
    const result = service.getMarketplacePluginMetadata(childUri);
    assert.strictEqual(result?.name, "my-plugin");
  });
  test("multiple plugins can be installed independently", () => {
    const service = createService();
    const uri1 = URI.file("/agent-plugins/github.com/microsoft/plugins/plugin-a");
    const uri2 = URI.file("/agent-plugins/github.com/microsoft/plugins/plugin-b");
    const pluginA = makePlugin("plugin-a", "plugin-a");
    const pluginB = makePlugin("plugin-b", "plugin-b");
    service.addInstalledPlugin(uri1, pluginA);
    service.addInstalledPlugin(uri2, pluginB);
    assert.strictEqual(service.installedPlugins.get().length, 2);
    service.removeInstalledPlugin(uri1);
    const remaining = service.installedPlugins.get();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].plugin.name, "plugin-b");
  });
});
suite("PluginMarketplaceService - hydration after restart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const CACHE_ROOT = URI.file("/agent-plugins");
  class TestFileService {
    constructor() {
      this.files = /* @__PURE__ */ new Map();
      this.folders = /* @__PURE__ */ new Set();
    }
    async exists(resource) {
      const key = resource.toString();
      return this.files.has(key) || this.folders.has(key);
    }
    async readFile(resource) {
      const key = resource.toString();
      const value = this.files.get(key);
      if (value === void 0) {
        throw new Error(`Missing file: ${key}`);
      }
      return { value: VSBuffer.fromString(value) };
    }
    async writeFile(resource, content) {
      this.files.set(resource.toString(), content.toString());
      return {};
    }
    async createFolder(resource) {
      this.folders.add(resource.toString());
      return {};
    }
    createWatcher() {
      return { onDidChange: Event.None, dispose: () => {
      } };
    }
    setFile(resource, content) {
      this.files.set(resource.toString(), content);
    }
  }
  function createPluginRepositoryStub() {
    const getRepositoryUri = (marketplace) => URI.joinPath(CACHE_ROOT, ...marketplace.cacheSegments);
    const getPluginSourceInstallUri = (descriptor) => {
      if (descriptor.kind === PluginSourceKind.GitHub) {
        const [owner, repo] = descriptor.repo.split("/");
        const base = URI.joinPath(CACHE_ROOT, "github.com", owner, repo);
        return descriptor.path ? URI.joinPath(base, descriptor.path) : base;
      }
      if (descriptor.kind === PluginSourceKind.RelativePath) {
        throw new Error("RelativePath should not reach getPluginSourceInstallUri in hydration tests");
      }
      throw new Error(`Unhandled source kind in test stub: ${descriptor.kind}`);
    };
    return {
      agentPluginsHome: CACHE_ROOT,
      getRepositoryUri,
      getPluginInstallUri: (plugin) => {
        if (plugin.sourceDescriptor.kind !== PluginSourceKind.RelativePath) {
          return getPluginSourceInstallUri(plugin.sourceDescriptor);
        }
        const repoDir = getRepositoryUri(plugin.marketplaceReference);
        return plugin.source ? URI.joinPath(repoDir, plugin.source) : repoDir;
      },
      getPluginSourceInstallUri
    };
  }
  function makeAzurePlugin(marketplaceReference) {
    return {
      name: "azure",
      description: "Microsoft Azure MCP Server and skills",
      version: "1.0.0",
      source: "",
      sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "microsoft/azure-skills", path: ".github/plugins/azure-skills" },
      marketplace: marketplaceReference.displayLabel,
      marketplaceReference,
      marketplaceType: MarketplaceType.Copilot
    };
  }
  function storeMarketplaceCache(storageService, marketplaceReference, plugin) {
    storageService.store("chat.plugins.marketplaces.githubCache.v1", JSON.stringify({
      [marketplaceReference.canonicalId]: {
        plugins: [plugin],
        expiresAt: Date.now() + 6e4,
        referenceRawValue: marketplaceReference.rawValue
      }
    }), StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  test("hydrates a github-sourced plugin from installed.json name and marketplace cache after restart", async () => {
    const storageService = store.add(new InMemoryStorageService());
    const fileService = new TestFileService();
    const awesomeCopilot = parseMarketplaceReference("github/awesome-copilot#marketplace");
    const azurePlugin = makeAzurePlugin(awesomeCopilot);
    storeMarketplaceCache(storageService, awesomeCopilot, azurePlugin);
    const azurePluginUri = URI.joinPath(CACHE_ROOT, "github.com", "microsoft", "azure-skills", ".github", "plugins", "azure-skills");
    const installedJson = URI.joinPath(CACHE_ROOT, "installed.json");
    fileService.setFile(installedJson, JSON.stringify({
      version: 1,
      installed: [{
        pluginUri: azurePluginUri.toString(),
        marketplace: awesomeCopilot.rawValue,
        name: "azure"
      }]
    }));
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: ["github/awesome-copilot#marketplace"],
      [ChatConfiguration.PluginsEnabled]: true
    }));
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IAgentPluginRepositoryService, createPluginRepositoryStub());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IRequestService, {});
    instantiationService.stub(IStorageService, storageService);
    instantiationService.stub(IWorkspacePluginSettingsService, {
      extraMarketplaces: observableValue("test.extraMarketplaces", []),
      enabledPlugins: observableValue("test.enabledPlugins", /* @__PURE__ */ new Map())
    });
    instantiationService.stub(IWorkspaceTrustManagementService, {
      isWorkspaceTrusted: () => true,
      onDidChangeTrust: Event.None
    });
    instantiationService.stub(IExtensionsWorkbenchService, {
      getAutoUpdateValue: () => "on"
    });
    const service = store.add(instantiationService.createInstance(PluginMarketplaceService));
    for (let i = 0; i < 50; i++) {
      if (service.installedPlugins.get().length === 1) {
        break;
      }
      await timeout(10);
    }
    const installed = service.installedPlugins.get();
    assert.strictEqual(installed.length, 1, "azure plugin should be hydrated from marketplace data");
    assert.strictEqual(installed[0].plugin.name, "azure");
    assert.strictEqual(installed[0].plugin.sourceDescriptor.kind, PluginSourceKind.GitHub);
    assert.strictEqual(installed[0].plugin.marketplaceReference.canonicalId, awesomeCopilot.canonicalId);
  });
  test("persists plugin name when a plugin is added so it survives a restart", async () => {
    const storageService = store.add(new InMemoryStorageService());
    const fileService = new TestFileService();
    const awesomeCopilot = parseMarketplaceReference("github/awesome-copilot#marketplace");
    const azurePluginUri = URI.joinPath(CACHE_ROOT, "github.com", "microsoft", "azure-skills", ".github", "plugins", "azure-skills");
    const azurePlugin = makeAzurePlugin(awesomeCopilot);
    storeMarketplaceCache(storageService, awesomeCopilot, azurePlugin);
    function makeService() {
      const instantiationService = store.add(new TestInstantiationService());
      instantiationService.stub(IConfigurationService, new TestConfigurationService({
        [ChatConfiguration.PluginMarketplaces]: ["github/awesome-copilot#marketplace"],
        [ChatConfiguration.PluginsEnabled]: true
      }));
      instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
      instantiationService.stub(IFileService, fileService);
      instantiationService.stub(IAgentPluginRepositoryService, createPluginRepositoryStub());
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(IRequestService, {});
      instantiationService.stub(IStorageService, storageService);
      instantiationService.stub(IWorkspacePluginSettingsService, {
        extraMarketplaces: observableValue("test.extraMarketplaces", []),
        enabledPlugins: observableValue("test.enabledPlugins", /* @__PURE__ */ new Map())
      });
      instantiationService.stub(IWorkspaceTrustManagementService, {
        isWorkspaceTrusted: () => true,
        onDidChangeTrust: Event.None
      });
      instantiationService.stub(IExtensionsWorkbenchService, {
        getAutoUpdateValue: () => "on"
      });
      return store.add(instantiationService.createInstance(PluginMarketplaceService));
    }
    const first = makeService();
    await timeout(20);
    first.addInstalledPlugin(azurePluginUri, azurePlugin);
    await timeout(200);
    const installedJson = URI.joinPath(CACHE_ROOT, "installed.json");
    const persisted = JSON.parse(fileService.files.get(installedJson.toString()));
    assert.strictEqual(persisted.installed.length, 1);
    assert.deepStrictEqual(persisted.installed[0], {
      pluginUri: azurePluginUri.toString(),
      marketplace: awesomeCopilot.rawValue,
      name: "azure"
    });
    const second = makeService();
    for (let i = 0; i < 50; i++) {
      if (second.installedPlugins.get().length === 1) {
        break;
      }
      await timeout(10);
    }
    const installed = second.installedPlugins.get();
    assert.strictEqual(installed.length, 1);
    assert.strictEqual(installed[0].plugin.name, "azure");
    assert.strictEqual(installed[0].plugin.sourceDescriptor.kind, PluginSourceKind.GitHub);
  });
});
suite("parsePluginSource", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const logContext = {
    pluginName: "test",
    logService: new NullLogService(),
    logPrefix: "[test]"
  };
  test("parses string source as RelativePath", () => {
    const result = parsePluginSource("./my-plugin", void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.RelativePath, path: "my-plugin" });
  });
  test("parses string source with pluginRoot", () => {
    const result = parsePluginSource("sub", "plugins", logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.RelativePath, path: "plugins/sub" });
  });
  test("parses undefined source as RelativePath using pluginRoot", () => {
    const result = parsePluginSource(void 0, "root", logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.RelativePath, path: "root" });
  });
  test("parses empty string source as RelativePath using pluginRoot", () => {
    const result = parsePluginSource("", "base", logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.RelativePath, path: "base" });
  });
  test("returns base dir for empty source without pluginRoot", () => {
    assert.deepStrictEqual(parsePluginSource("", void 0, logContext), { kind: PluginSourceKind.RelativePath, path: "" });
  });
  test("returns base dir for undefined source without pluginRoot", () => {
    assert.deepStrictEqual(parsePluginSource(void 0, void 0, logContext), { kind: PluginSourceKind.RelativePath, path: "" });
  });
  test("parses github object source", () => {
    const result = parsePluginSource({ source: "github", repo: "owner/repo" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitHub, repo: "owner/repo", ref: void 0, sha: void 0, path: void 0 });
  });
  test("parses github object source with ref and sha", () => {
    const result = parsePluginSource({ source: "github", repo: "owner/repo", ref: "v2.0.0", sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitHub, repo: "owner/repo", ref: "v2.0.0", sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0", path: void 0 });
  });
  test("parses github object source with path", () => {
    const result = parsePluginSource({ source: "github", repo: "owner/repo", path: "plugins/my-plugin" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitHub, repo: "owner/repo", ref: void 0, sha: void 0, path: "plugins/my-plugin" });
  });
  test("returns undefined for github source missing repo", () => {
    assert.strictEqual(parsePluginSource({ source: "github" }, void 0, logContext), void 0);
  });
  test("returns undefined for github source with invalid repo format", () => {
    assert.strictEqual(parsePluginSource({ source: "github", repo: "owner" }, void 0, logContext), void 0);
  });
  test("returns undefined for github source with invalid sha", () => {
    assert.strictEqual(parsePluginSource({ source: "github", repo: "owner/repo", sha: "abc123" }, void 0, logContext), void 0);
  });
  test("returns undefined for github source with non-string path", () => {
    assert.strictEqual(parsePluginSource({ source: "github", repo: "owner/repo", path: 42 }, void 0, logContext), void 0);
  });
  test("parses url object source", () => {
    const result = parsePluginSource({ source: "url", url: "https://gitlab.com/team/plugin.git" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitUrl, url: "https://gitlab.com/team/plugin.git", ref: void 0, sha: void 0, path: void 0 });
  });
  test("returns undefined for url source missing url field", () => {
    assert.strictEqual(parsePluginSource({ source: "url" }, void 0, logContext), void 0);
  });
  test("returns undefined for url source not ending in .git", () => {
    assert.strictEqual(parsePluginSource({ source: "url", url: "https://gitlab.com/team/plugin" }, void 0, logContext), void 0);
  });
  test("parses git-subdir object source", () => {
    const result = parsePluginSource({ source: "git-subdir", url: "https://github.com/acme/monorepo.git", path: "tools/claude-plugin" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitUrl, url: "https://github.com/acme/monorepo.git", ref: void 0, sha: void 0, path: "tools/claude-plugin" });
  });
  test("parses git-subdir object source with ref and sha", () => {
    const result = parsePluginSource({ source: "git-subdir", url: "https://example.com/repo.git", path: "plugins/foo", ref: "v2.0.0", sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitUrl, url: "https://example.com/repo.git", ref: "v2.0.0", sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0", path: "plugins/foo" });
  });
  test("parses git-subdir source without .git suffix", () => {
    const result = parsePluginSource({ source: "git-subdir", url: "https://dev.azure.com/org/project/_git/repo", path: "plugins/foo" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitUrl, url: "https://dev.azure.com/org/project/_git/repo", ref: void 0, sha: void 0, path: "plugins/foo" });
  });
  test("returns undefined for git-subdir source missing url field", () => {
    assert.strictEqual(parsePluginSource({ source: "git-subdir", path: "plugins/foo" }, void 0, logContext), void 0);
  });
  test("returns undefined for git-subdir source missing path field", () => {
    assert.strictEqual(parsePluginSource({ source: "git-subdir", url: "https://example.com/repo.git" }, void 0, logContext), void 0);
  });
  test("parses npm object source", () => {
    const result = parsePluginSource({ source: "npm", package: "@acme/claude-plugin" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.Npm, package: "@acme/claude-plugin", version: void 0, registry: void 0 });
  });
  test("parses npm object source with version and registry", () => {
    const result = parsePluginSource({ source: "npm", package: "@acme/claude-plugin", version: "2.1.0", registry: "https://npm.example.com" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.Npm, package: "@acme/claude-plugin", version: "2.1.0", registry: "https://npm.example.com" });
  });
  test("returns undefined for npm source missing package", () => {
    assert.strictEqual(parsePluginSource({ source: "npm" }, void 0, logContext), void 0);
  });
  test("returns undefined for npm source with non-string version", () => {
    assert.strictEqual(parsePluginSource({ source: "npm", package: "@acme/claude-plugin", version: 123 }, void 0, logContext), void 0);
  });
  test("parses pip object source", () => {
    const result = parsePluginSource({ source: "pip", package: "my-plugin" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.Pip, package: "my-plugin", version: void 0, registry: void 0 });
  });
  test("parses pip object source with version and registry", () => {
    const result = parsePluginSource({ source: "pip", package: "my-plugin", version: "1.0.0", registry: "https://pypi.example.com" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.Pip, package: "my-plugin", version: "1.0.0", registry: "https://pypi.example.com" });
  });
  test("returns undefined for pip source missing package", () => {
    assert.strictEqual(parsePluginSource({ source: "pip" }, void 0, logContext), void 0);
  });
  test("returns undefined for pip source with non-string registry", () => {
    assert.strictEqual(parsePluginSource({ source: "pip", package: "my-plugin", registry: 42 }, void 0, logContext), void 0);
  });
  test("returns undefined for unknown source kind", () => {
    assert.strictEqual(parsePluginSource({ source: "unknown" }, void 0, logContext), void 0);
  });
  test("returns undefined for object source without source discriminant", () => {
    assert.strictEqual(parsePluginSource({ package: "test" }, void 0, logContext), void 0);
  });
});
suite("getPluginSourceLabel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("formats relative path", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.RelativePath, path: "plugins/foo" }), "plugins/foo");
  });
  test("formats empty relative path", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.RelativePath, path: "" }), ".");
  });
  test("formats github source", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.GitHub, repo: "owner/repo" }), "owner/repo");
  });
  test("formats github source with path", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.GitHub, repo: "owner/repo", path: "plugins/foo" }), "owner/repo/plugins/foo");
  });
  test("formats url source", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.GitUrl, url: "https://example.com/repo.git" }), "https://example.com/repo.git");
  });
  test("formats url source with path", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.GitUrl, url: "https://example.com/repo.git", path: "plugins/foo" }), "https://example.com/repo.git/plugins/foo");
  });
  test("formats npm source without version", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.Npm, package: "@acme/plugin" }), "@acme/plugin");
  });
  test("formats npm source with version", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.Npm, package: "@acme/plugin", version: "1.0.0" }), "@acme/plugin@1.0.0");
  });
  test("formats pip source without version", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.Pip, package: "my-plugin" }), "my-plugin");
  });
  test("formats pip source with version", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.Pip, package: "my-plugin", version: "2.0" }), "my-plugin==2.0");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcGx1Z2lucy9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBidWZmZXJUb1N0cmVhbSwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEFHRU5UX1BMVUdJTl9TQ0hFTUEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudFBsdWdpbnMvY29tbW9uL2FnZW50UGx1Z2luUGFyc2VyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBJRmlsZVN5c3RlbVdhdGNoZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgQXV0b1VwZGF0ZUNvbmZpZ3VyYXRpb25WYWx1ZSwgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZXRwbGFjZVBsdWdpbiwgSU1hcmtldHBsYWNlUmVmZXJlbmNlLCBJUGx1Z2luU291cmNlRGVzY3JpcHRvciwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLCBNYXJrZXRwbGFjZVR5cGUsIFBsdWdpbk1hcmtldHBsYWNlU2VydmljZSwgUGx1Z2luU291cmNlS2luZCwgZXh0cmFLbm93bk1hcmtldHBsYWNlc1RvQ29uZmlnRGljdCwgZ2V0UGx1Z2luU291cmNlTGFiZWwsIHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UsIHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzLCBwYXJzZVBsdWdpblNvdXJjZSwgcmVhZENvbmZpZ3VyZWRNYXJrZXRwbGFjZXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGx1Z2lucy9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbHVnaW5zL3dvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZS5qcyc7XG5cbnN1aXRlKCdQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3BhcnNlcyBHaXRIdWIgc2hvcnRoYW5kIG1hcmtldHBsYWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ21pY3Jvc29mdC92c2NvZGUnKTtcblx0XHRhc3NlcnQub2socGFyc2VkKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmtpbmQsIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5HaXRIdWJTaG9ydGhhbmQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuY2xvbmVVcmwsICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS5naXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmNhbm9uaWNhbElkLCAnZ2l0aHViOm1pY3Jvc29mdC92c2NvZGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmRpc3BsYXlMYWJlbCwgJ21pY3Jvc29mdC92c2NvZGUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZC5jYWNoZVNlZ21lbnRzLCBbJ2dpdGh1Yi5jb20nLCAnbWljcm9zb2Z0JywgJ3ZzY29kZSddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmdpdGh1YlJlcG8sICdtaWNyb3NvZnQvdnNjb2RlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBHaXRIdWIgc2hvcnRoYW5kIG1hcmtldHBsYWNlIHdpdGggcmVmIHN1ZmZpeCcsICgpID0+IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdtaWNyb3NvZnQvdnNjb2RlI21hcmtldHBsYWNlJyk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnNlZCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5raW5kLCBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuR2l0SHViU2hvcnRoYW5kKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmNsb25lVXJsLCAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUuZ2l0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5jYW5vbmljYWxJZCwgJ2dpdGh1YjptaWNyb3NvZnQvdnNjb2RlI21hcmtldHBsYWNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5kaXNwbGF5TGFiZWwsICdtaWNyb3NvZnQvdnNjb2RlI21hcmtldHBsYWNlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQuY2FjaGVTZWdtZW50cywgWydnaXRodWIuY29tJywgJ21pY3Jvc29mdCcsICd2c2NvZGUnLCAncmVmX21hcmtldHBsYWNlJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQucmVmLCAnbWFya2V0cGxhY2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmdpdGh1YlJlcG8sICdtaWNyb3NvZnQvdnNjb2RlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBkaXJlY3QgSFRUUFMgYW5kIFNTSCBtYXJrZXRwbGFjZXMgZW5kaW5nIGluIC5naXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHR0cHMgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdodHRwczovL2V4YW1wbGUuY29tL29yZy9yZXBvLmdpdCcpO1xuXHRcdGFzc2VydC5vayhodHRwcyk7XG5cdFx0aWYgKCFodHRwcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaHR0cHMua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdFVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGh0dHBzLmRpc3BsYXlMYWJlbCwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vb3JnL3JlcG8uZ2l0Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChodHRwcy5jYWNoZVNlZ21lbnRzLCBbJ2V4YW1wbGUuY29tJywgJ29yZycsICdyZXBvJ10pO1xuXG5cdFx0Y29uc3Qgc3NoID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnc3NoOi8vZ2l0QGV4YW1wbGUuY29tL29yZy9yZXBvLmdpdCcpO1xuXHRcdGFzc2VydC5vayhzc2gpO1xuXHRcdGlmICghc3NoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzc2gua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdFVyaSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzc2guY2FjaGVTZWdtZW50cywgWydnaXRAZXhhbXBsZS5jb20nLCAnb3JnJywgJ3JlcG8nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBzY3AtbGlrZSBnaXQgVVJJIG1hcmtldHBsYWNlcycsICgpID0+IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdnaXRAZXhhbXBsZS5jb206b3JnL3JlcG8uZ2l0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnNlZCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5raW5kLCBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuR2l0VXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmNsb25lVXJsLCAnZ2l0QGV4YW1wbGUuY29tOm9yZy9yZXBvLmdpdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuY2Fub25pY2FsSWQsICdnaXQ6ZXhhbXBsZS5jb20vb3JnL3JlcG8uZ2l0Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQuY2FjaGVTZWdtZW50cywgWydleGFtcGxlLmNvbScsICdvcmcnLCAncmVwbyddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmdpdGh1YlJlcG8sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBnaXQgVVJJIG1hcmtldHBsYWNlcyB3aXRoIHJlZiBzdWZmaXgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHR0cHMgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdodHRwczovL2V4YW1wbGUuY29tL29yZy9yZXBvLmdpdCNtYXJrZXRwbGFjZScpO1xuXHRcdGFzc2VydC5vayhodHRwcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGh0dHBzPy5jbG9uZVVybCwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vb3JnL3JlcG8uZ2l0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGh0dHBzPy5jYW5vbmljYWxJZCwgJ2dpdDpleGFtcGxlLmNvbS9vcmcvcmVwby5naXQjbWFya2V0cGxhY2UnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGh0dHBzPy5jYWNoZVNlZ21lbnRzLCBbJ2V4YW1wbGUuY29tJywgJ29yZycsICdyZXBvJywgJ3JlZl9tYXJrZXRwbGFjZSddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaHR0cHM/LnJlZiwgJ21hcmtldHBsYWNlJyk7XG5cblx0XHRjb25zdCBzY3AgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdnaXRAZXhhbXBsZS5jb206b3JnL3JlcG8uZ2l0I21hcmtldHBsYWNlJyk7XG5cdFx0YXNzZXJ0Lm9rKHNjcCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjcD8uY2xvbmVVcmwsICdnaXRAZXhhbXBsZS5jb206b3JnL3JlcG8uZ2l0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjcD8uY2Fub25pY2FsSWQsICdnaXQ6ZXhhbXBsZS5jb20vb3JnL3JlcG8uZ2l0I21hcmtldHBsYWNlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzY3A/LmNhY2hlU2VnbWVudHMsIFsnZXhhbXBsZS5jb20nLCAnb3JnJywgJ3JlcG8nLCAncmVmX21hcmtldHBsYWNlJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY3A/LnJlZiwgJ21hcmtldHBsYWNlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BvcHVsYXRlcyBnaXRodWJSZXBvIGZvciBHaXRIdWIgSFRUUFMgVVJMcycsICgpID0+IHtcblx0XHRjb25zdCB3aXRoR2l0ID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8uZ2l0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHdpdGhHaXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aXRoR2l0Py5naXRodWJSZXBvLCAnb3duZXIvcmVwbycpO1xuXG5cdFx0Y29uc3Qgd2l0aG91dEdpdCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvJyk7XG5cdFx0YXNzZXJ0Lm9rKHdpdGhvdXRHaXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aXRob3V0R2l0Py5naXRodWJSZXBvLCAnb3duZXIvcmVwbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdwb3B1bGF0ZXMgZ2l0aHViUmVwbyBmb3IgR2l0SHViIFNDUC1zdHlsZSBVUkxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2dpdEBnaXRodWIuY29tOm93bmVyL3JlcG8uZ2l0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnNlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZD8uZ2l0aHViUmVwbywgJ293bmVyL3JlcG8nKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcG9wdWxhdGUgZ2l0aHViUmVwbyBmb3Igbm9uLUdpdEh1YiBVUkxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0dHBzID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9vcmcvcmVwby5naXQnKTtcblx0XHRhc3NlcnQub2soaHR0cHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChodHRwcz8uZ2l0aHViUmVwbywgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHNjcCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2dpdEBnaXRsYWIuY29tOm9yZy9yZXBvLmdpdCcpO1xuXHRcdGFzc2VydC5vayhzY3ApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY3A/LmdpdGh1YlJlcG8sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBsb2NhbCBmaWxlIG1hcmtldHBsYWNlIHJlZmVyZW5jZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnZmlsZTovLy90bXAvbWFya2V0cGxhY2UtcmVwbycpO1xuXHRcdGFzc2VydC5vayhwYXJzZWQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkxvY2FsRmlsZVVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5sb2NhbFJlcG9zaXRvcnlVcmk/LnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmNsb25lVXJsLCAnZmlsZTovLy90bXAvbWFya2V0cGxhY2UtcmVwbycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLmNhY2hlU2VnbWVudHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXB0cyBIVFRQUyBhbmQgU1NIIG1hcmtldHBsYWNlIGVudHJpZXMgd2l0aG91dCAuZ2l0IHN1ZmZpeCcsICgpID0+IHtcblx0XHRjb25zdCBodHRwcyA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vb3JnL3JlcG8nKTtcblx0XHRhc3NlcnQub2soaHR0cHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChodHRwcz8ua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdFVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGh0dHBzPy5jYW5vbmljYWxJZCwgJ2dpdDpleGFtcGxlLmNvbS9vcmcvcmVwby5naXQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGh0dHBzPy5jYWNoZVNlZ21lbnRzLCBbJ2V4YW1wbGUuY29tJywgJ29yZycsICdyZXBvJ10pO1xuXG5cdFx0Y29uc3Qgc3NoID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnc3NoOi8vZ2l0QGV4YW1wbGUuY29tL29yZy9yZXBvJyk7XG5cdFx0YXNzZXJ0Lm9rKHNzaCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNzaD8ua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdFVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNzaD8uY2Fub25pY2FsSWQsICdnaXQ6Z2l0QGV4YW1wbGUuY29tL29yZy9yZXBvLmdpdCcpO1xuXG5cdFx0Ly8gU0NQLXN0eWxlIChnaXRAaG9zdDpwYXRoKSBzdGlsbCByZXF1aXJlcyAuZ2l0IGJlY2F1c2UgdGhlIGNvbG9uLXBhdGggc3ludGF4IGlzXG5cdFx0Ly8gdW5hbWJpZ3VvdXMgb25seSBmb3IgdHJhZGl0aW9uYWwgZ2l0IFNTSCBVUkxzIHdoZXJlIC5naXQgaXMgY29udmVudGlvbmFsLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdnaXRAZXhhbXBsZS5jb206b3JnL3JlcG8nKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXB0cyBob3N0LW9ubHkgSFRUUFMgbWFya2V0cGxhY2UgZW5kcG9pbnRzIChwZXIgQURSLTAwMiBnaXQudXJsIGlzIGFueSBzdHJpbmcpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2h0dHBzOi8vcGx1Z2lucy5pbnRlcm5hbC5leGFtcGxlLmNvbScpO1xuXHRcdGFzc2VydC5vayhwYXJzZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQ/LmtpbmQsIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5HaXRVcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQ/LmNsb25lVXJsLCAnaHR0cHM6Ly9wbHVnaW5zLmludGVybmFsLmV4YW1wbGUuY29tLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQ/LmNhbm9uaWNhbElkLCAnZ2l0OnBsdWdpbnMuaW50ZXJuYWwuZXhhbXBsZS5jb20vJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQ/LmNhY2hlU2VnbWVudHMsIFsncGx1Z2lucy5pbnRlcm5hbC5leGFtcGxlLmNvbSddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkPy5naXRodWJSZXBvLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gVHJhaWxpbmcgc2xhc2ggY29sbGFwc2VzIHRvIHRoZSBob3N0LW9ubHkgZm9ybS5cblx0XHRjb25zdCB3aXRoU2xhc2ggPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdodHRwczovL3BsdWdpbnMuaW50ZXJuYWwuZXhhbXBsZS5jb20vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpdGhTbGFzaD8uY2Fub25pY2FsSWQsICdnaXQ6cGx1Z2lucy5pbnRlcm5hbC5leGFtcGxlLmNvbS8nKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZENvbmZpZ3VyZWRNYXJrZXRwbGFjZXMgY29udmVydHMgcG9saWN5IGRpY3QgdG8gbmFtZWQgbWFya2V0cGxhY2UgZW50cmllcycsICgpID0+IHtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRXh0cmFNYXJrZXRwbGFjZXNdOiB7XG5cdFx0XHRcdCdhY21lLWludGVybmFsJzogJ3tcInNvdXJjZVwiOlwiaHR0cHM6Ly9wbHVnaW5zLmludGVybmFsLmFjbWUuY29tXCIsXCJhdXRvVXBkYXRlXCI6dHJ1ZX0nLFxuXHRcdFx0XHQnYWNtZS1wdWJsaWMnOiAne1wic291cmNlXCI6XCJodHRwczovL2NvcGlsb3QtcGx1Z2lucy5hY21lLmlvXCIsXCJhdXRvVXBkYXRlXCI6ZmFsc2V9Jyxcblx0XHRcdFx0J3ZzY29kZS10ZWFtLWtpdCc6ICdtaWNyb3NvZnQvdnNjb2RlLXRlYW0ta2l0Jyxcblx0XHRcdFx0J2ludmFsaWQnOiBudWxsLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCB7IGV4dHJhVmFsdWVzLCBlZmZlY3RpdmVWYWx1ZXMgfSA9IHJlYWRDb25maWd1cmVkTWFya2V0cGxhY2VzKGNvbmZpZ1NlcnZpY2UgYXMgdW5rbm93biBhcyBJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHJlZnMgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcyhleHRyYVZhbHVlcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZnMubWFwKHIgPT4gci5kaXNwbGF5TGFiZWwpLCBbJ2FjbWUtaW50ZXJuYWwnLCAnYWNtZS1wdWJsaWMnLCAndnNjb2RlLXRlYW0ta2l0J10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZzWzBdLmtpbmQsIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5HaXRVcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZzWzJdLmtpbmQsIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5HaXRIdWJTaG9ydGhhbmQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVmcy5tYXAociA9PiByLmF1dG9VcGRhdGUpLCBbdHJ1ZSwgZmFsc2UsIHVuZGVmaW5lZF0pO1xuXHRcdC8vIEVmZmVjdGl2ZSB2YWx1ZXMgdW5pb24gdXNlciArIGV4dHJhXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVmZmVjdGl2ZVZhbHVlcy5sZW5ndGgsIGV4dHJhVmFsdWVzLmxlbmd0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhS25vd25NYXJrZXRwbGFjZXNUb0NvbmZpZ0RpY3Q6IHJldHVybnMgdW5kZWZpbmVkIGZvciBlbXB0eS9taXNzaW5nIGlucHV0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYUtub3duTWFya2V0cGxhY2VzVG9Db25maWdEaWN0KHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhS25vd25NYXJrZXRwbGFjZXNUb0NvbmZpZ0RpY3QoW10pLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYUtub3duTWFya2V0cGxhY2VzVG9Db25maWdEaWN0OiBnaXRodWIgc291cmNlIGJlY29tZXMgb3duZXIvcmVwbyBzaG9ydGhhbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGljdCA9IGV4dHJhS25vd25NYXJrZXRwbGFjZXNUb0NvbmZpZ0RpY3QoW1xuXHRcdFx0eyBuYW1lOiAndnNjb2RlLXRlYW0ta2l0Jywgc291cmNlOiB7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdtaWNyb3NvZnQvdnNjb2RlLXRlYW0ta2l0JyB9IH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWN0LCB7ICd2c2NvZGUtdGVhbS1raXQnOiAnbWljcm9zb2Z0L3ZzY29kZS10ZWFtLWtpdCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhS25vd25NYXJrZXRwbGFjZXNUb0NvbmZpZ0RpY3Q6IHByZXNlcnZlcyBleHBsaWNpdCBhdXRvVXBkYXRlIHZhbHVlcycsICgpID0+IHtcblx0XHRjb25zdCBkaWN0ID0gZXh0cmFLbm93bk1hcmtldHBsYWNlc1RvQ29uZmlnRGljdChbXG5cdFx0XHR7IG5hbWU6ICdhbHdheXMnLCBhdXRvVXBkYXRlOiB0cnVlLCBzb3VyY2U6IHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ21pY3Jvc29mdC9hbHdheXMnIH0gfSxcblx0XHRcdHsgbmFtZTogJ25ldmVyJywgYXV0b1VwZGF0ZTogZmFsc2UsIHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnbWljcm9zb2Z0L25ldmVyJyB9IH0sXG5cdFx0XHR7IG5hbWU6ICdkZWZhdWx0Jywgc291cmNlOiB7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdtaWNyb3NvZnQvZGVmYXVsdCcgfSB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGljdCwge1xuXHRcdFx0YWx3YXlzOiAne1wic291cmNlXCI6XCJtaWNyb3NvZnQvYWx3YXlzXCIsXCJhdXRvVXBkYXRlXCI6dHJ1ZX0nLFxuXHRcdFx0bmV2ZXI6ICd7XCJzb3VyY2VcIjpcIm1pY3Jvc29mdC9uZXZlclwiLFwiYXV0b1VwZGF0ZVwiOmZhbHNlfScsXG5cdFx0XHRkZWZhdWx0OiAnbWljcm9zb2Z0L2RlZmF1bHQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW5hZ2VkIGF1dG9VcGRhdGUgc3Vydml2ZXMgYSBkdXBsaWNhdGUgdXNlciBtYXJrZXRwbGFjZSByZWZlcmVuY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbk1hcmtldHBsYWNlc106IFsnbWljcm9zb2Z0L3BsdWdpbnMnXSxcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FeHRyYU1hcmtldHBsYWNlc106IHtcblx0XHRcdFx0bWFuYWdlZDogJ3tcInNvdXJjZVwiOlwibWljcm9zb2Z0L3BsdWdpbnNcIixcImF1dG9VcGRhdGVcIjp0cnVlfScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlZnMgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcyhyZWFkQ29uZmlndXJlZE1hcmtldHBsYWNlcyhjb25maWdTZXJ2aWNlIGFzIHVua25vd24gYXMgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKS5lZmZlY3RpdmVWYWx1ZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnNbMF0uYXV0b1VwZGF0ZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhS25vd25NYXJrZXRwbGFjZXNUb0NvbmZpZ0RpY3Q6IGdpdGh1YiBzb3VyY2Ugd2l0aCByZWYgYXBwZW5kcyAjcmVmJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpY3QgPSBleHRyYUtub3duTWFya2V0cGxhY2VzVG9Db25maWdEaWN0KFtcblx0XHRcdHsgbmFtZTogJ3RlYW0ta2l0LWJldGEnLCBzb3VyY2U6IHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ21pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQnLCByZWY6ICdiZXRhJyB9IH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWN0LCB7ICd0ZWFtLWtpdC1iZXRhJzogJ21pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQjYmV0YScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhS25vd25NYXJrZXRwbGFjZXNUb0NvbmZpZ0RpY3Q6IGdpdCBzb3VyY2UgYmVjb21lcyByYXcgVVJMICh3aXRoIG9wdGlvbmFsICNyZWYpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpY3QgPSBleHRyYUtub3duTWFya2V0cGxhY2VzVG9Db25maWdEaWN0KFtcblx0XHRcdHsgbmFtZTogJ2FjbWUtaW50ZXJuYWwnLCBzb3VyY2U6IHsgc291cmNlOiAnZ2l0JywgdXJsOiAnaHR0cHM6Ly9wbHVnaW5zLmludGVybmFsLmFjbWUuY29tJyB9IH0sXG5cdFx0XHR7IG5hbWU6ICdhY21lLXRhZ2dlZCcsIHNvdXJjZTogeyBzb3VyY2U6ICdnaXQnLCB1cmw6ICdodHRwczovL2dpdC5hY21lLmNvbS9wbHVnaW5zLmdpdCcsIHJlZjogJ3YxJyB9IH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWN0LCB7XG5cdFx0XHQnYWNtZS1pbnRlcm5hbCc6ICdodHRwczovL3BsdWdpbnMuaW50ZXJuYWwuYWNtZS5jb20nLFxuXHRcdFx0J2FjbWUtdGFnZ2VkJzogJ2h0dHBzOi8vZ2l0LmFjbWUuY29tL3BsdWdpbnMuZ2l0I3YxJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFLbm93bk1hcmtldHBsYWNlc1RvQ29uZmlnRGljdDogZW5kLXRvLWVuZCBwb2xpY3kgXHUyMTkyIGNvbmZpZyBkaWN0IFx1MjE5MiByZWFkQ29uZmlndXJlZE1hcmtldHBsYWNlcyBcdTIxOTIgcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZXMnLCAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGVzIHRoZSBmdWxsIENoYXRFeHRyYU1hcmtldHBsYWNlcyBwb2xpY3kgZGVsaXZlcnkgcGlwZWxpbmU6XG5cdFx0Ly8gIDEuIG1hbmFnZWRfc2V0dGluZ3MgcmVzcG9uc2UgaXMgYWRhcHRlZCBpbnRvIElFeHRyYUtub3duTWFya2V0cGxhY2VFbnRyeVtdXG5cdFx0Ly8gIDIuIGV4dHJhS25vd25NYXJrZXRwbGFjZXNUb0NvbmZpZ0RpY3QgY29udmVydHMgdG8gdGhlIGRpY3Qgc2hhcGUgdGhlXG5cdFx0Ly8gICAgIGBjaGF0LnBsdWdpbnMuZXh0cmFNYXJrZXRwbGFjZXNgIHNldHRpbmcgc3RvcmVzXG5cdFx0Ly8gIDMuIFRoZSBwb2xpY3kgZnJhbWV3b3JrIHNlcmlhbGl6ZXMvZGVzZXJpYWxpemVzIHRoYXQgYXMgSlNPTlxuXHRcdC8vICA0LiByZWFkQ29uZmlndXJlZE1hcmtldHBsYWNlcyByZXZlcnNlcyBpdCBiYWNrIHRvIG5lc3RlZCBlbnRyeSBzaGFwZVxuXHRcdC8vICA1LiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcyByZXNvbHZlcyBtYXJrZXRwbGFjZSByZWZlcmVuY2VzIHRoYXRcblx0XHQvLyAgICAgcHJlc2VydmUgYGRpc3BsYXlMYWJlbCA9IG5hbWVgIChyZXF1aXJlZCBmb3IgYHBsdWdpbkA8bmFtZT5gIGtleXMpXG5cdFx0Y29uc3QgcG9saWN5RW50cmllcyA9IFtcblx0XHRcdHsgbmFtZTogJ2FjbWUtaW50ZXJuYWwnLCBzb3VyY2U6IHsgc291cmNlOiAnZ2l0JyBhcyBjb25zdCwgdXJsOiAnaHR0cHM6Ly9wbHVnaW5zLmludGVybmFsLmFjbWUuY29tJyB9IH0sXG5cdFx0XHR7IG5hbWU6ICdhY21lLXB1YmxpYycsIHNvdXJjZTogeyBzb3VyY2U6ICdnaXQnIGFzIGNvbnN0LCB1cmw6ICdodHRwczovL2NvcGlsb3QtcGx1Z2lucy5hY21lLmlvJyB9IH0sXG5cdFx0XHR7IG5hbWU6ICd2c2NvZGUtdGVhbS1raXQnLCBzb3VyY2U6IHsgc291cmNlOiAnZ2l0aHViJyBhcyBjb25zdCwgcmVwbzogJ21pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQnIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZGljdCA9IGV4dHJhS25vd25NYXJrZXRwbGFjZXNUb0NvbmZpZ0RpY3QocG9saWN5RW50cmllcyk7XG5cdFx0YXNzZXJ0Lm9rKGRpY3QpO1xuXG5cdFx0Ly8gSlNPTiByb3VuZC10cmlwIG1pcnJvcnMgd2hhdCBBY2NvdW50UG9saWN5U2VydmljZSAvIFBvbGljeUNvbmZpZ3VyYXRpb24gZG8uXG5cdFx0Y29uc3Qgcm91bmRUcmlwcGVkID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShkaWN0KSk7XG5cblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRXh0cmFNYXJrZXRwbGFjZXNdOiByb3VuZFRyaXBwZWQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBleHRyYVZhbHVlcyB9ID0gcmVhZENvbmZpZ3VyZWRNYXJrZXRwbGFjZXMoY29uZmlnU2VydmljZSBhcyB1bmtub3duIGFzIElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcmVmcyA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzKGV4dHJhVmFsdWVzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZzLmxlbmd0aCwgMywgJ2FsbCB0aHJlZSBwb2xpY3kgZW50cmllcyBhcmUgc3VyZmFjZWQgYXMgbWFya2V0cGxhY2UgcmVmZXJlbmNlcycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRyZWZzLm1hcChyID0+IHIuZGlzcGxheUxhYmVsKSxcblx0XHRcdFsnYWNtZS1pbnRlcm5hbCcsICdhY21lLXB1YmxpYycsICd2c2NvZGUtdGVhbS1raXQnXSxcblx0XHRcdCdkaXNwbGF5TGFiZWwgbXVzdCBlcXVhbCB0aGUgcG9saWN5IGBuYW1lYCBzbyBlbmFibGVkUGx1Z2luc1tcInBsdWdpbkA8bmFtZT5cIl0ga2V5cyByZXNvbHZlJyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZzWzBdLmtpbmQsIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5HaXRVcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZzWzFdLmtpbmQsIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5HaXRVcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZzWzJdLmtpbmQsIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5HaXRIdWJTaG9ydGhhbmQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgQXp1cmUgRGV2T3BzIEhUVFBTIGNsb25lIFVSTHMgd2l0aG91dCAuZ2l0IHN1ZmZpeCcsICgpID0+IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdodHRwczovL2Rldi5henVyZS5jb20vb3JnL3Byb2plY3QvX2dpdC9yZXBvJyk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnNlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZD8ua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdFVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZD8uY2xvbmVVcmwsICdodHRwczovL2Rldi5henVyZS5jb20vb3JnL3Byb2plY3QvX2dpdC9yZXBvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZD8uY2Fub25pY2FsSWQsICdnaXQ6ZGV2LmF6dXJlLmNvbS9vcmcvcHJvamVjdC9fZ2l0L3JlcG8uZ2l0Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQ/LmNhY2hlU2VnbWVudHMsIFsnZGV2LmF6dXJlLmNvbScsICdvcmcnLCAncHJvamVjdCcsICdfZ2l0JywgJ3JlcG8nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlZHVwbGljYXRlcyBBenVyZSBEZXZPcHMgVVJMcyB3aXRoIGFuZCB3aXRob3V0IC5naXQgc3VmZml4JywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzKFtcblx0XHRcdCdodHRwczovL2Rldi5henVyZS5jb20vb3JnL3Byb2plY3QvX2dpdC9yZXBvJyxcblx0XHRcdCdodHRwczovL2Rldi5henVyZS5jb20vb3JnL3Byb2plY3QvX2dpdC9yZXBvLmdpdCcsXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRbMF0uY2Fub25pY2FsSWQsICdnaXQ6ZGV2LmF6dXJlLmNvbS9vcmcvcHJvamVjdC9fZ2l0L3JlcG8uZ2l0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dpdGh1Yi5jb20gVVJJIGZvcm0gYW5kIEdpdEh1YiBzaG9ydGhhbmQgZm9ybSBzaGFyZSB0aGUgc2FtZSBjYW5vbmljYWxJZCAocG9saWN5IHRydXN0IGNvbXBhcmlzb25zIG11c3QgbWF0Y2gpJywgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb246IHVuZGVyIHN0cmljdE1hcmtldHBsYWNlcywgaXNNYXJrZXRwbGFjZVRydXN0ZWQgY29tcGFyZXNcblx0XHQvLyBjYW5vbmljYWxJZC4gQSBwbHVnaW4gZGlzY292ZXJlZCBmcm9tIGBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS10ZWFtLWtpdC5naXRgXG5cdFx0Ly8gd2FzIGJlaW5nIGJsb2NrZWQgZXZlbiB0aG91Z2ggYG1pY3Jvc29mdC92c2NvZGUtdGVhbS1raXRgIHdhcyBpbiB0aGVcblx0XHQvLyB0cnVzdGVkIGxpc3QsIGJlY2F1c2UgdGhlIFVSSSBwYXJzZXIgcHJvZHVjZWQgYSBgZ2l0OmAgY2Fub25pY2FsSWRcblx0XHQvLyB3aGlsZSB0aGUgc2hvcnRoYW5kIHBhcnNlciBwcm9kdWNlZCBhIGBnaXRodWI6YCBvbmUuXG5cdFx0Y29uc3Qgc2hvcnRoYW5kID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnbWljcm9zb2Z0L3ZzY29kZS10ZWFtLWtpdCcpO1xuXHRcdGNvbnN0IGh0dHBzV2l0aEdpdCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLXRlYW0ta2l0LmdpdCcpO1xuXHRcdGNvbnN0IGh0dHBzV2l0aG91dEdpdCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLXRlYW0ta2l0Jyk7XG5cdFx0Y29uc3Qgc2NwID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnZ2l0QGdpdGh1Yi5jb206bWljcm9zb2Z0L3ZzY29kZS10ZWFtLWtpdC5naXQnKTtcblx0XHRhc3NlcnQub2soc2hvcnRoYW5kKTtcblx0XHRhc3NlcnQub2soaHR0cHNXaXRoR2l0KTtcblx0XHRhc3NlcnQub2soaHR0cHNXaXRob3V0R2l0KTtcblx0XHRhc3NlcnQub2soc2NwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaHR0cHNXaXRoR2l0IS5jYW5vbmljYWxJZCwgc2hvcnRoYW5kIS5jYW5vbmljYWxJZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGh0dHBzV2l0aG91dEdpdCEuY2Fub25pY2FsSWQsIHNob3J0aGFuZCEuY2Fub25pY2FsSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY3AhLmNhbm9uaWNhbElkLCBzaG9ydGhhbmQhLmNhbm9uaWNhbElkKTtcblxuXHRcdC8vIEFsbCBmb3VyIGZvcm1zIHNob3VsZCBjb2xsYXBzZSB0byBhIHNpbmdsZSBlbnRyeSB3aGVuIGRlZHVwbGljYXRlZC5cblx0XHRjb25zdCBkZWR1cGVkID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZXMoW1xuXHRcdFx0J21pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQnLFxuXHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLXRlYW0ta2l0LmdpdCcsXG5cdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQnLFxuXHRcdFx0J2dpdEBnaXRodWIuY29tOm1pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQuZ2l0Jyxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVkdXBlZC5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgSFRUUFMgVVJJIHdpdGggdHJhaWxpbmcgc2xhc2ggYWZ0ZXIgLmdpdCcsICgpID0+IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdodHRwczovL2V4YW1wbGUuY29tL29yZy9yZXBvLmdpdC8nKTtcblx0XHRhc3NlcnQub2socGFyc2VkKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmtpbmQsIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5HaXRVcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuY2Fub25pY2FsSWQsICdnaXQ6ZXhhbXBsZS5jb20vb3JnL3JlcG8uZ2l0Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQuY2FjaGVTZWdtZW50cywgWydleGFtcGxlLmNvbScsICdvcmcnLCAncmVwbyddKTtcblx0fSk7XG5cblx0dGVzdCgnZGVkdXBsaWNhdGVzIGdpdGh1Yi5jb20gVVJJLCBTU0gsIGFuZCBzaG9ydGhhbmQgdG8gdGhlIHNhbWUgY2Fub25pY2FsIGlkJywgKCkgPT4ge1xuXHRcdC8vIEFsbCB0aHJlZSBmb3JtcyByZWZlciB0byB0aGUgc2FtZSBtYXJrZXRwbGFjZSwgc28gcG9saWN5IHRydXN0XG5cdFx0Ly8gY29tcGFyaXNvbnMgKHdoaWNoIG1hdGNoIGJ5IGNhbm9uaWNhbElkKSBtdXN0IGNvbGxhcHNlIHRoZW0uXG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZXMoW1xuXHRcdFx0J21pY3Jvc29mdC92c2NvZGUnLFxuXHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLmdpdCcsXG5cdFx0XHQnZ2l0QGdpdGh1Yi5jb206bWljcm9zb2Z0L3ZzY29kZS5naXQnLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRbMF0uY2Fub25pY2FsSWQsICdnaXRodWI6bWljcm9zb2Z0L3ZzY29kZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcyBpZ25vcmVzIGludmFsaWQgZW50cmllcyAobnVsbCwgbnVtYmVycywgbWFsZm9ybWVkIG9iamVjdHMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzKFtudWxsLCA0Miwge30sICdtaWNyb3NvZnQvdnNjb2RlJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkWzBdLmNhbm9uaWNhbElkLCAnZ2l0aHViOm1pY3Jvc29mdC92c2NvZGUnKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZXMgYWNjZXB0cyBwb2xpY3ktc2hhcGUgb2JqZWN0cyBhbmQgdXNlcyBuYW1lIGFzIGRpc3BsYXlMYWJlbCcsICgpID0+IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcyhbXG5cdFx0XHR7IG5hbWU6ICd2c2NvZGUtdGVhbS1raXQnLCBzb3VyY2U6IHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ21pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQnIH0gfSxcblx0XHRcdHsgbmFtZTogJ2FjbWUtcHVibGljJywgc291cmNlOiB7IHNvdXJjZTogJ2dpdCcsIHVybDogJ2h0dHBzOi8vY29waWxvdC1wbHVnaW5zLmFjbWUuaW8nLCByZWY6ICdtYWluJyB9IH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRbMF0uZGlzcGxheUxhYmVsLCAndnNjb2RlLXRlYW0ta2l0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFswXS5jYW5vbmljYWxJZCwgJ2dpdGh1YjptaWNyb3NvZnQvdnNjb2RlLXRlYW0ta2l0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFsxXS5kaXNwbGF5TGFiZWwsICdhY21lLXB1YmxpYycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRbMV0ucmVmLCAnbWFpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmVhdHMgZGlmZmVyZW50IG1hcmtldHBsYWNlIHJlZnMgYXMgZGlzdGluY3QgcmVmZXJlbmNlcycsICgpID0+IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcyhbXG5cdFx0XHQnbWljcm9zb2Z0L3ZzY29kZSNtYWluJyxcblx0XHRcdCdtaWNyb3NvZnQvdnNjb2RlI21hcmtldHBsYWNlJyxcblx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS5naXQjbWFya2V0cGxhY2UnLFxuXHRcdF0pO1xuXG5cdFx0Ly8gYGh0dHBzOi8vZ2l0aHViLmNvbS8uLi4jbWFya2V0cGxhY2VgIGNvbGxhcHNlcyB3aXRoIHRoZSBzaG9ydGhhbmRcblx0XHQvLyAoc2FtZSBjYW5vbmljYWwgaWQpLCBzbyB3ZSBleHBlY3QgMiBkaXN0aW5jdCByZWZzIG5vdCAzLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLm1hcChyID0+IHIuY2Fub25pY2FsSWQpLCBbXG5cdFx0XHQnZ2l0aHViOm1pY3Jvc29mdC92c2NvZGUjbWFpbicsXG5cdFx0XHQnZ2l0aHViOm1pY3Jvc29mdC92c2NvZGUjbWFya2V0cGxhY2UnLFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIC0gR2l0SHViIG1hcmtldHBsYWNlIHJlZnMnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZmV0Y2hlcyBHaXRIdWIgbWFya2V0cGxhY2UgZGVmaW5pdGlvbnMgZnJvbSB0aGUgY29uZmlndXJlZCByZWYnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVxdWVzdFVybHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzXTogWydtaWNyb3NvZnQvdnNjb2RlI21hcmtldHBsYWNlJ10sXG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luc0VuYWJsZWRdOiB0cnVlLFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFNlcnZpY2UsIHsgY2FjaGVIb21lOiBVUkkuZmlsZSgnL2NhY2hlJykgfSBhcyBQYXJ0aWFsPElFbnZpcm9ubWVudFNlcnZpY2U+IGFzIElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCB7fSBhcyB1bmtub3duIGFzIElGaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSwge1xuXHRcdFx0YWdlbnRQbHVnaW5zSG9tZTogVVJJLmZpbGUoJy9hZ2VudC1wbHVnaW5zJyksXG5cdFx0XHRlbnN1cmVSZXBvc2l0b3J5OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignc2hvdWxkIG5vdCBjbG9uZSBmb3IgNXh4IHJlc3BvbnNlcycpO1xuXHRcdFx0fSxcblx0XHR9IGFzIFBhcnRpYWw8SUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2U+IGFzIElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVxdWVzdFNlcnZpY2UsIHtcblx0XHRcdHJlcXVlc3Q6IGFzeW5jIChvcHRpb25zOiB7IHVybDogc3RyaW5nIH0pID0+IHtcblx0XHRcdFx0cmVxdWVzdFVybHMucHVzaChvcHRpb25zLnVybCk7XG5cdFx0XHRcdHJldHVybiB7IHJlczogeyBoZWFkZXJzOiB7fSwgc3RhdHVzQ29kZTogNTAwIH0sIHN0cmVhbTogYnVmZmVyVG9TdHJlYW0oVlNCdWZmZXIuZnJvbVN0cmluZygnJykpIH07XG5cdFx0XHR9LFxuXHRcdH0gYXMgUGFydGlhbDxJUmVxdWVzdFNlcnZpY2U+IGFzIElSZXF1ZXN0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLCB7XG5cdFx0XHRleHRyYU1hcmtldHBsYWNlczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmV4dHJhTWFya2V0cGxhY2VzJywgW10pLFxuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5lbmFibGVkUGx1Z2lucycsIG5ldyBNYXAoKSksXG5cdFx0fSBhcyBQYXJ0aWFsPElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2U+IGFzIElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIHtcblx0XHRcdGlzV29ya3NwYWNlVHJ1c3RlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdG9uRGlkQ2hhbmdlVHJ1c3Q6IEV2ZW50Lk5vbmUsXG5cdFx0fSBhcyBQYXJ0aWFsPElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlPiBhcyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIHtcblx0XHRcdGdldEF1dG9VcGRhdGVWYWx1ZTogKCkgPT4gJ29uJyxcblx0XHR9IGFzIFBhcnRpYWw8SUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlPiBhcyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmZldGNoTWFya2V0cGxhY2VQbHVnaW5zKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlcXVlc3RVcmxzLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5vayhyZXF1ZXN0VXJscy5ldmVyeSh1cmwgPT4gdXJsLmluY2x1ZGVzKCcvbWFya2V0cGxhY2UvJykpKTtcblx0XHRhc3NlcnQub2socmVxdWVzdFVybHMuZXZlcnkodXJsID0+ICF1cmwuaW5jbHVkZXMoJy9tYWluLycpKSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgLSBBZ2VudCBQbHVnaW4gZGlyZWN0IGluc3RhbGwgcHJvYmVzJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNsYXNzIFByb2JlRmlsZVNlcnZpY2Uge1xuXHRcdHJlYWRvbmx5IGZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHRcdGFzeW5jIGV4aXN0cyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5maWxlcy5oYXMocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8eyB2YWx1ZTogVlNCdWZmZXIgfT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSB0aGlzLmZpbGVzLmdldChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTWlzc2luZyBmaWxlOiAke3Jlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyh2YWx1ZSkgfTtcblx0XHR9XG5cblx0XHRjcmVhdGVXYXRjaGVyKCk6IElGaWxlU3lzdGVtV2F0Y2hlciB7XG5cdFx0XHRyZXR1cm4geyBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZShmaWxlU2VydmljZTogUHJvYmVGaWxlU2VydmljZSk6IFBsdWdpbk1hcmtldHBsYWNlU2VydmljZSB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzXTogW10sXG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luc0VuYWJsZWRdOiB0cnVlLFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFNlcnZpY2UsIHsgY2FjaGVIb21lOiBVUkkuZmlsZSgnL2NhY2hlJykgfSBhcyBQYXJ0aWFsPElFbnZpcm9ubWVudFNlcnZpY2U+IGFzIElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSBhcyB1bmtub3duIGFzIElGaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSwgeyBhZ2VudFBsdWdpbnNIb21lOiBVUkkuZmlsZSgnL2FnZW50LXBsdWdpbnMnKSB9IGFzIHVua25vd24gYXMgSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZXF1ZXN0U2VydmljZSwge30gYXMgdW5rbm93biBhcyBJUmVxdWVzdFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSwge1xuXHRcdFx0ZXh0cmFNYXJrZXRwbGFjZXM6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5leHRyYU1hcmtldHBsYWNlcycsIFtdKSxcblx0XHRcdGVuYWJsZWRQbHVnaW5zOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuZW5hYmxlZFBsdWdpbnMnLCBuZXcgTWFwKCkpLFxuXHRcdH0gYXMgUGFydGlhbDxJV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlPiBhcyBJV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCB7XG5cdFx0XHRpc1dvcmtzcGFjZVRydXN0ZWQ6ICgpID0+IHRydWUsXG5cdFx0XHRvbkRpZENoYW5nZVRydXN0OiBFdmVudC5Ob25lLFxuXHRcdH0gYXMgUGFydGlhbDxJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZT4gYXMgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCB7XG5cdFx0XHRnZXRBdXRvVXBkYXRlVmFsdWU6ICgpID0+ICdvZmYnLFxuXHRcdH0gYXMgUGFydGlhbDxJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U+IGFzIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNlZWRDb21wYXRpYmxlTWFuaWZlc3QoZmlsZVNlcnZpY2U6IFByb2JlRmlsZVNlcnZpY2UsIHJlcG9EaXI6IFVSSSk6IHZvaWQge1xuXHRcdGZpbGVTZXJ2aWNlLmZpbGVzLnNldChqb2luUGF0aChyZXBvRGlyLCAncGx1Z2luLmpzb24nKS50b1N0cmluZygpLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHQkc2NoZW1hOiBBR0VOVF9QTFVHSU5fU0NIRU1BLnJlcGxhY2UoJy8xLjAuMC8nLCAnLzEuMC4xLycpLFxuXHRcdFx0bmFtZTogJ2NvbXBhdGlibGUtcGx1Z2luJyxcblx0XHR9KSk7XG5cdH1cblxuXHR0ZXN0KCdyZWFkcyBhIEdpdCBkaXJlY3Qtc291cmNlIG1hbmlmZXN0IHdpdGggYSBjb21wYXRpYmxlIHNjaGVtYSByZXZpc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBQcm9iZUZpbGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVwb0RpciA9IFVSSS5maWxlKCcvcmVwb3MvY29tcGF0aWJsZScpO1xuXHRcdHNlZWRDb21wYXRpYmxlTWFuaWZlc3QoZmlsZVNlcnZpY2UsIHJlcG9EaXIpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGZpbGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVhZFNpbmdsZVBsdWdpbk1hbmlmZXN0KHJlcG9EaXIsIHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ293bmVyL2NvbXBhdGlibGUnKSEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8ubmFtZSwgJ2NvbXBhdGlibGUtcGx1Z2luJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29nbml6ZXMgYSBsb2NhbCBkaXJlY3Rvcnkgd2l0aCBhIGNvbXBhdGlibGUgc2NoZW1hIHJldmlzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IFByb2JlRmlsZVNlcnZpY2UoKTtcblx0XHRjb25zdCByZXBvRGlyID0gVVJJLmZpbGUoJy9wbHVnaW5zL2NvbXBhdGlibGUnKTtcblx0XHRzZWVkQ29tcGF0aWJsZU1hbmlmZXN0KGZpbGVTZXJ2aWNlLCByZXBvRGlyKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShmaWxlU2VydmljZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmlzUGx1Z2luRGlyZWN0b3J5KHJlcG9EaXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgLSBnZXRNYXJrZXRwbGFjZVBsdWdpbk1ldGFkYXRhJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IG1hcmtldHBsYWNlUmVmID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnbWljcm9zb2Z0L3BsdWdpbnMnKSE7XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZShhdXRvVXBkYXRlOiBBdXRvVXBkYXRlQ29uZmlndXJhdGlvblZhbHVlID0gJ29uJywgZXh0cmFNYXJrZXRwbGFjZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge30pOiBQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2Uge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzXTogWydtaWNyb3NvZnQvcGx1Z2lucyddLFxuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkV4dHJhTWFya2V0cGxhY2VzXTogZXh0cmFNYXJrZXRwbGFjZXMsXG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luc0VuYWJsZWRdOiB0cnVlLFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFNlcnZpY2UsIHsgY2FjaGVIb21lOiBVUkkuZmlsZSgnL2NhY2hlJykgfSBhcyBQYXJ0aWFsPElFbnZpcm9ubWVudFNlcnZpY2U+IGFzIElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCB7fSBhcyB1bmtub3duIGFzIElGaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSwgeyBhZ2VudFBsdWdpbnNIb21lOiBVUkkuZmlsZSgnL2FnZW50LXBsdWdpbnMnKSB9IGFzIHVua25vd24gYXMgSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZXF1ZXN0U2VydmljZSwge30gYXMgdW5rbm93biBhcyBJUmVxdWVzdFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSwge1xuXHRcdFx0ZXh0cmFNYXJrZXRwbGFjZXM6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5leHRyYU1hcmtldHBsYWNlcycsIFtdKSxcblx0XHRcdGVuYWJsZWRQbHVnaW5zOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuZW5hYmxlZFBsdWdpbnMnLCBuZXcgTWFwKCkpLFxuXHRcdH0gYXMgUGFydGlhbDxJV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlPiBhcyBJV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCB7XG5cdFx0XHRpc1dvcmtzcGFjZVRydXN0ZWQ6ICgpID0+IHRydWUsXG5cdFx0XHRvbkRpZENoYW5nZVRydXN0OiBFdmVudC5Ob25lLFxuXHRcdH0gYXMgUGFydGlhbDxJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZT4gYXMgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCB7XG5cdFx0XHRnZXRBdXRvVXBkYXRlVmFsdWU6ICgpID0+IGF1dG9VcGRhdGUsXG5cdFx0fSBhcyBQYXJ0aWFsPElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZT4gYXMgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlKSk7XG5cdH1cblxuXHR0ZXN0KCdyZXR1cm5zIG1ldGFkYXRhIGZvciBhbiBpbnN0YWxsZWQgcGx1Z2luJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcGx1Z2luVXJpID0gVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvbXktcGx1Z2luJyk7XG5cdFx0Y29uc3QgcGx1Z2luID0ge1xuXHRcdFx0bmFtZTogJ215LXBsdWdpbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0EgdGVzdCBwbHVnaW4nLFxuXHRcdFx0dmVyc2lvbjogJzIuMC4wJyxcblx0XHRcdHNvdXJjZTogJ3BsdWdpbnMvbXktcGx1Z2luJyxcblx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICdwbHVnaW5zL215LXBsdWdpbicgfSBhcyBjb25zdCxcblx0XHRcdG1hcmtldHBsYWNlOiBtYXJrZXRwbGFjZVJlZi5kaXNwbGF5TGFiZWwsXG5cdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogbWFya2V0cGxhY2VSZWYsXG5cdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdH07XG5cblx0XHRzZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbihwbHVnaW5VcmksIHBsdWdpbik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNYXJrZXRwbGFjZVBsdWdpbk1ldGFkYXRhKHBsdWdpblVyaSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgcGx1Z2luKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGEgVVJJIHRoYXQgaXMgbm90IGluc3RhbGxlZCcsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWFya2V0cGxhY2VQbHVnaW5NZXRhZGF0YShVUkkuZmlsZSgnL3NvbWUvb3RoZXIvcGF0aCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIHBsdWdpbnMgYXJlIGluc3RhbGxlZCcsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWFya2V0cGxhY2VQbHVnaW5NZXRhZGF0YShVUkkuZmlsZSgnL2FueS9wYXRoJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbmFnZWQgbWFya2V0cGxhY2UgYXV0b1VwZGF0ZSBvdmVycmlkZXMgdGhlIGdsb2JhbCBzZXR0aW5nIGJ5IGNhbm9uaWNhbCBpZGVudGl0eScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgnb2ZmJywge1xuXHRcdFx0YWx3YXlzOiAne1wic291cmNlXCI6XCJtaWNyb3NvZnQvYWx3YXlzXCIsXCJhdXRvVXBkYXRlXCI6dHJ1ZX0nLFxuXHRcdFx0bmV2ZXI6ICd7XCJzb3VyY2VcIjpcIm1pY3Jvc29mdC9uZXZlclwiLFwiYXV0b1VwZGF0ZVwiOmZhbHNlfScsXG5cdFx0XHRpbmhlcml0ZWQ6ICdtaWNyb3NvZnQvaW5oZXJpdGVkJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWx3YXlzOiBzZXJ2aWNlLmlzTWFya2V0cGxhY2VBdXRvVXBkYXRlRW5hYmxlZChwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L2Fsd2F5cy5naXQnKSEpLFxuXHRcdFx0bmV2ZXI6IHNlcnZpY2UuaXNNYXJrZXRwbGFjZUF1dG9VcGRhdGVFbmFibGVkKHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ21pY3Jvc29mdC9uZXZlcicpISksXG5cdFx0XHRpbmhlcml0ZWQ6IHNlcnZpY2UuaXNNYXJrZXRwbGFjZUF1dG9VcGRhdGVFbmFibGVkKHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ21pY3Jvc29mdC9pbmhlcml0ZWQnKSEpLFxuXHRcdFx0dW5tYW5hZ2VkOiBzZXJ2aWNlLmlzTWFya2V0cGxhY2VBdXRvVXBkYXRlRW5hYmxlZChwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdtaWNyb3NvZnQvdW5tYW5hZ2VkJykhKSxcblx0XHR9LCB7XG5cdFx0XHRhbHdheXM6IHRydWUsXG5cdFx0XHRuZXZlcjogZmFsc2UsXG5cdFx0XHRpbmhlcml0ZWQ6IGZhbHNlLFxuXHRcdFx0dW5tYW5hZ2VkOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1BsdWdpbk1hcmtldHBsYWNlU2VydmljZSAtIGluc3RhbGxlZCBwbHVnaW5zIGxpZmVjeWNsZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBtYXJrZXRwbGFjZVJlZiA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ21pY3Jvc29mdC9wbHVnaW5zJykhO1xuXG5cdGZ1bmN0aW9uIG1ha2VQbHVnaW4obmFtZTogc3RyaW5nLCBzb3VyY2U6IHN0cmluZyk6IElNYXJrZXRwbGFjZVBsdWdpbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogYCR7bmFtZX0gZGVzY3JpcHRpb25gLFxuXHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdHNvdXJjZSxcblx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6IHNvdXJjZSB9IGFzIGNvbnN0LFxuXHRcdFx0bWFya2V0cGxhY2U6IG1hcmtldHBsYWNlUmVmLmRpc3BsYXlMYWJlbCxcblx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBtYXJrZXRwbGFjZVJlZixcblx0XHRcdG1hcmtldHBsYWNlVHlwZTogTWFya2V0cGxhY2VUeXBlLkNvcGlsb3QsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNlcnZpY2UoKTogUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbk1hcmtldHBsYWNlc106IFsnbWljcm9zb2Z0L3BsdWdpbnMnXSxcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5zRW5hYmxlZF06IHRydWUsXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwgeyBjYWNoZUhvbWU6IFVSSS5maWxlKCcvY2FjaGUnKSB9IGFzIFBhcnRpYWw8SUVudmlyb25tZW50U2VydmljZT4gYXMgSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIHt9IGFzIHVua25vd24gYXMgSUZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLCB7IGFnZW50UGx1Z2luc0hvbWU6IFVSSS5maWxlKCcvYWdlbnQtcGx1Z2lucycpIH0gYXMgdW5rbm93biBhcyBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlcXVlc3RTZXJ2aWNlLCB7fSBhcyB1bmtub3duIGFzIElSZXF1ZXN0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLCB7XG5cdFx0XHRleHRyYU1hcmtldHBsYWNlczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmV4dHJhTWFya2V0cGxhY2VzJywgW10pLFxuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5lbmFibGVkUGx1Z2lucycsIG5ldyBNYXAoKSksXG5cdFx0fSBhcyBQYXJ0aWFsPElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2U+IGFzIElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIHtcblx0XHRcdGlzV29ya3NwYWNlVHJ1c3RlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdG9uRGlkQ2hhbmdlVHJ1c3Q6IEV2ZW50Lk5vbmUsXG5cdFx0fSBhcyBQYXJ0aWFsPElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlPiBhcyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIHtcblx0XHRcdGdldEF1dG9VcGRhdGVWYWx1ZTogKCkgPT4gJ29uJyxcblx0XHR9IGFzIFBhcnRpYWw8SUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlPiBhcyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UpKTtcblx0fVxuXG5cdHRlc3QoJ2luc3RhbGxlZFBsdWdpbnMgb2JzZXJ2YWJsZSBpcyBlbXB0eSB3aXRoIG5vIHBsdWdpbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuaW5zdGFsbGVkUGx1Z2lucy5nZXQoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRJbnN0YWxsZWRQbHVnaW4gbWFrZXMgcGx1Z2luIGFwcGVhciBpbiBpbnN0YWxsZWRQbHVnaW5zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9hZ2VudC1wbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3BsdWdpbnMvbXktcGx1Z2luJyk7XG5cdFx0Y29uc3QgcGx1Z2luID0gbWFrZVBsdWdpbignbXktcGx1Z2luJywgJ215LXBsdWdpbicpO1xuXG5cdFx0c2VydmljZS5hZGRJbnN0YWxsZWRQbHVnaW4odXJpLCBwbHVnaW4pO1xuXG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gc2VydmljZS5pbnN0YWxsZWRQbHVnaW5zLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YWxsZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFsbGVkWzBdLnBsdWdpbi5uYW1lLCAnbXktcGx1Z2luJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZUluc3RhbGxlZFBsdWdpbiByZW1vdmVzIHBsdWdpbiBmcm9tIGluc3RhbGxlZFBsdWdpbnMgYW5kIG1ldGFkYXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9hZ2VudC1wbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3BsdWdpbnMvbXktcGx1Z2luJyk7XG5cdFx0Y29uc3QgcGx1Z2luID0gbWFrZVBsdWdpbignbXktcGx1Z2luJywgJ215LXBsdWdpbicpO1xuXG5cdFx0c2VydmljZS5hZGRJbnN0YWxsZWRQbHVnaW4odXJpLCBwbHVnaW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmluc3RhbGxlZFBsdWdpbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblxuXHRcdHNlcnZpY2UucmVtb3ZlSW5zdGFsbGVkUGx1Z2luKHVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaW5zdGFsbGVkUGx1Z2lucy5nZXQoKS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldE1hcmtldHBsYWNlUGx1Z2luTWV0YWRhdGEodXJpKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkSW5zdGFsbGVkUGx1Z2luIHVwZGF0ZXMgbWV0YWRhdGEgZm9yIGV4aXN0aW5nIGVudHJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9hZ2VudC1wbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3BsdWdpbnMvbXktcGx1Z2luJyk7XG5cdFx0Y29uc3QgdjEgPSBtYWtlUGx1Z2luKCdteS1wbHVnaW4nLCAnbXktcGx1Z2luJyk7XG5cdFx0Y29uc3QgdjIgPSB7IC4uLnYxLCB2ZXJzaW9uOiAnMi4wLjAnLCBkZXNjcmlwdGlvbjogJ3VwZGF0ZWQnIH07XG5cblx0XHRzZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbih1cmksIHYxKTtcblx0XHRzZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbih1cmksIHYyKTtcblxuXHRcdGNvbnN0IGluc3RhbGxlZCA9IHNlcnZpY2UuaW5zdGFsbGVkUGx1Z2lucy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFsbGVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbGxlZFswXS5wbHVnaW4udmVyc2lvbiwgJzIuMC4wJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbGxlZFswXS5wbHVnaW4uZGVzY3JpcHRpb24sICd1cGRhdGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE1hcmtldHBsYWNlUGx1Z2luTWV0YWRhdGEgZmluZHMgbWV0YWRhdGEgZm9yIGNoaWxkIFVSSScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvYWdlbnQtcGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC9wbHVnaW5zJyk7XG5cdFx0Y29uc3QgcGx1Z2luID0gbWFrZVBsdWdpbignbXktcGx1Z2luJywgJ215LXBsdWdpbicpO1xuXG5cdFx0c2VydmljZS5hZGRJbnN0YWxsZWRQbHVnaW4odXJpLCBwbHVnaW4pO1xuXG5cdFx0Y29uc3QgY2hpbGRVcmkgPSBVUkkuZmlsZSgnL2FnZW50LXBsdWdpbnMvZ2l0aHViLmNvbS9taWNyb3NvZnQvcGx1Z2lucy9zdWJkaXIvZmlsZS50cycpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWFya2V0cGxhY2VQbHVnaW5NZXRhZGF0YShjaGlsZFVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8ubmFtZSwgJ215LXBsdWdpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBwbHVnaW5zIGNhbiBiZSBpbnN0YWxsZWQgaW5kZXBlbmRlbnRseScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IHVyaTEgPSBVUkkuZmlsZSgnL2FnZW50LXBsdWdpbnMvZ2l0aHViLmNvbS9taWNyb3NvZnQvcGx1Z2lucy9wbHVnaW4tYScpO1xuXHRcdGNvbnN0IHVyaTIgPSBVUkkuZmlsZSgnL2FnZW50LXBsdWdpbnMvZ2l0aHViLmNvbS9taWNyb3NvZnQvcGx1Z2lucy9wbHVnaW4tYicpO1xuXHRcdGNvbnN0IHBsdWdpbkEgPSBtYWtlUGx1Z2luKCdwbHVnaW4tYScsICdwbHVnaW4tYScpO1xuXHRcdGNvbnN0IHBsdWdpbkIgPSBtYWtlUGx1Z2luKCdwbHVnaW4tYicsICdwbHVnaW4tYicpO1xuXG5cdFx0c2VydmljZS5hZGRJbnN0YWxsZWRQbHVnaW4odXJpMSwgcGx1Z2luQSk7XG5cdFx0c2VydmljZS5hZGRJbnN0YWxsZWRQbHVnaW4odXJpMiwgcGx1Z2luQik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pbnN0YWxsZWRQbHVnaW5zLmdldCgpLmxlbmd0aCwgMik7XG5cblx0XHRzZXJ2aWNlLnJlbW92ZUluc3RhbGxlZFBsdWdpbih1cmkxKTtcblx0XHRjb25zdCByZW1haW5pbmcgPSBzZXJ2aWNlLmluc3RhbGxlZFBsdWdpbnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbWFpbmluZy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1haW5pbmdbMF0ucGx1Z2luLm5hbWUsICdwbHVnaW4tYicpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIC0gaHlkcmF0aW9uIGFmdGVyIHJlc3RhcnQnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgQ0FDSEVfUk9PVCA9IFVSSS5maWxlKCcvYWdlbnQtcGx1Z2lucycpO1xuXG5cdGNsYXNzIFRlc3RGaWxlU2VydmljZSB7XG5cdFx0cmVhZG9ubHkgZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdHJlYWRvbmx5IGZvbGRlcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdGFzeW5jIGV4aXN0cyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0XHRjb25zdCBrZXkgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0cmV0dXJuIHRoaXMuZmlsZXMuaGFzKGtleSkgfHwgdGhpcy5mb2xkZXJzLmhhcyhrZXkpO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHsgdmFsdWU6IFZTQnVmZmVyIH0+IHtcblx0XHRcdGNvbnN0IGtleSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuZmlsZXMuZ2V0KGtleSk7XG5cdFx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgZmlsZTogJHtrZXl9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyh2YWx1ZSkgfTtcblx0XHR9XG5cblx0XHRhc3luYyB3cml0ZUZpbGUocmVzb3VyY2U6IFVSSSwgY29udGVudDogVlNCdWZmZXIpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRcdHRoaXMuZmlsZXMuc2V0KHJlc291cmNlLnRvU3RyaW5nKCksIGNvbnRlbnQudG9TdHJpbmcoKSk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXG5cdFx0YXN5bmMgY3JlYXRlRm9sZGVyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRcdHRoaXMuZm9sZGVycy5hZGQocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXG5cdFx0Y3JlYXRlV2F0Y2hlcigpOiBJRmlsZVN5c3RlbVdhdGNoZXIge1xuXHRcdFx0cmV0dXJuIHsgb25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdH1cblxuXHRcdHNldEZpbGUocmVzb3VyY2U6IFVSSSwgY29udGVudDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHR0aGlzLmZpbGVzLnNldChyZXNvdXJjZS50b1N0cmluZygpLCBjb250ZW50KTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVQbHVnaW5SZXBvc2l0b3J5U3R1YigpOiBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSB7XG5cdFx0Y29uc3QgZ2V0UmVwb3NpdG9yeVVyaSA9IChtYXJrZXRwbGFjZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlKSA9PiBVUkkuam9pblBhdGgoQ0FDSEVfUk9PVCwgLi4ubWFya2V0cGxhY2UuY2FjaGVTZWdtZW50cyk7XG5cdFx0Y29uc3QgZ2V0UGx1Z2luU291cmNlSW5zdGFsbFVyaSA9IChkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcikgPT4ge1xuXHRcdFx0aWYgKGRlc2NyaXB0b3Iua2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5HaXRIdWIpIHtcblx0XHRcdFx0Y29uc3QgW293bmVyLCByZXBvXSA9IGRlc2NyaXB0b3IucmVwby5zcGxpdCgnLycpO1xuXHRcdFx0XHRjb25zdCBiYXNlID0gVVJJLmpvaW5QYXRoKENBQ0hFX1JPT1QsICdnaXRodWIuY29tJywgb3duZXIsIHJlcG8pO1xuXHRcdFx0XHRyZXR1cm4gZGVzY3JpcHRvci5wYXRoID8gVVJJLmpvaW5QYXRoKGJhc2UsIGRlc2NyaXB0b3IucGF0aCkgOiBiYXNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRlc2NyaXB0b3Iua2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgpIHtcblx0XHRcdFx0Ly8gVGVzdHMgdXNpbmcgdGhpcyBzdHViIG9ubHkgZXhlcmNpc2Ugbm9uLXJlbGF0aXZlIGRlc2NyaXB0b3JzIHZpYSB0aGlzIGVudHJ5IHBvaW50LlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JlbGF0aXZlUGF0aCBzaG91bGQgbm90IHJlYWNoIGdldFBsdWdpblNvdXJjZUluc3RhbGxVcmkgaW4gaHlkcmF0aW9uIHRlc3RzJyk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuaGFuZGxlZCBzb3VyY2Uga2luZCBpbiB0ZXN0IHN0dWI6ICR7ZGVzY3JpcHRvci5raW5kfWApO1xuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFnZW50UGx1Z2luc0hvbWU6IENBQ0hFX1JPT1QsXG5cdFx0XHRnZXRSZXBvc2l0b3J5VXJpLFxuXHRcdFx0Z2V0UGx1Z2luSW5zdGFsbFVyaTogKHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luKSA9PiB7XG5cdFx0XHRcdGlmIChwbHVnaW4uc291cmNlRGVzY3JpcHRvci5raW5kICE9PSBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCkge1xuXHRcdFx0XHRcdHJldHVybiBnZXRQbHVnaW5Tb3VyY2VJbnN0YWxsVXJpKHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZXBvRGlyID0gZ2V0UmVwb3NpdG9yeVVyaShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UpO1xuXHRcdFx0XHRyZXR1cm4gcGx1Z2luLnNvdXJjZSA/IFVSSS5qb2luUGF0aChyZXBvRGlyLCBwbHVnaW4uc291cmNlKSA6IHJlcG9EaXI7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0UGx1Z2luU291cmNlSW5zdGFsbFVyaSxcblx0XHR9IGFzIHVua25vd24gYXMgSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2U7XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlQXp1cmVQbHVnaW4obWFya2V0cGxhY2VSZWZlcmVuY2U6IElNYXJrZXRwbGFjZVJlZmVyZW5jZSk6IElNYXJrZXRwbGFjZVBsdWdpbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6ICdhenVyZScsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ01pY3Jvc29mdCBBenVyZSBNQ1AgU2VydmVyIGFuZCBza2lsbHMnLFxuXHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdHNvdXJjZTogJycsXG5cdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnbWljcm9zb2Z0L2F6dXJlLXNraWxscycsIHBhdGg6ICcuZ2l0aHViL3BsdWdpbnMvYXp1cmUtc2tpbGxzJyB9LFxuXHRcdFx0bWFya2V0cGxhY2U6IG1hcmtldHBsYWNlUmVmZXJlbmNlLmRpc3BsYXlMYWJlbCxcblx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlLFxuXHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gc3RvcmVNYXJrZXRwbGFjZUNhY2hlKHN0b3JhZ2VTZXJ2aWNlOiBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBtYXJrZXRwbGFjZVJlZmVyZW5jZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlLCBwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbik6IHZvaWQge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdjaGF0LnBsdWdpbnMubWFya2V0cGxhY2VzLmdpdGh1YkNhY2hlLnYxJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0W21hcmtldHBsYWNlUmVmZXJlbmNlLmNhbm9uaWNhbElkXToge1xuXHRcdFx0XHRwbHVnaW5zOiBbcGx1Z2luXSxcblx0XHRcdFx0ZXhwaXJlc0F0OiBEYXRlLm5vdygpICsgNjBfMDAwLFxuXHRcdFx0XHRyZWZlcmVuY2VSYXdWYWx1ZTogbWFya2V0cGxhY2VSZWZlcmVuY2UucmF3VmFsdWUsXG5cdFx0XHR9LFxuXHRcdH0pLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHR0ZXN0KCdoeWRyYXRlcyBhIGdpdGh1Yi1zb3VyY2VkIHBsdWdpbiBmcm9tIGluc3RhbGxlZC5qc29uIG5hbWUgYW5kIG1hcmtldHBsYWNlIGNhY2hlIGFmdGVyIHJlc3RhcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGVzOiB1c2VyIGluc3RhbGxzIHRoZSBcImF6dXJlXCIgcGx1Z2luIGZyb20gdGhlXG5cdFx0Ly8gXCJnaXRodWIvYXdlc29tZS1jb3BpbG90I21hcmtldHBsYWNlXCIgbWFya2V0cGxhY2UgKGZldGNoZWQgdmlhIEhUVFAsIG5ldmVyXG5cdFx0Ly8gY2xvbmVkKS4gQWZ0ZXIgcmVzdGFydCwgaW5zdGFsbGVkLmpzb24gY29udGFpbnMgb25seSB0aGUgZHVyYWJsZVxuXHRcdC8vIGlkZW50aXR5IGZvciB0aGF0IHBsdWdpbjsgdGhlIGZ1bGwgZGVzY3JpcHRvciBpcyByZWNvdmVyZWQgZnJvbVxuXHRcdC8vIG1hcmtldHBsYWNlIGRhdGEgY2FjaGVkIGZyb20gdGhlIHByaW9yIGZldGNoLlxuXG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgVGVzdEZpbGVTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBhd2Vzb21lQ29waWxvdCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2dpdGh1Yi9hd2Vzb21lLWNvcGlsb3QjbWFya2V0cGxhY2UnKSE7XG5cdFx0Y29uc3QgYXp1cmVQbHVnaW4gPSBtYWtlQXp1cmVQbHVnaW4oYXdlc29tZUNvcGlsb3QpO1xuXHRcdHN0b3JlTWFya2V0cGxhY2VDYWNoZShzdG9yYWdlU2VydmljZSwgYXdlc29tZUNvcGlsb3QsIGF6dXJlUGx1Z2luKTtcblx0XHRjb25zdCBhenVyZVBsdWdpblVyaSA9IFVSSS5qb2luUGF0aChDQUNIRV9ST09ULCAnZ2l0aHViLmNvbScsICdtaWNyb3NvZnQnLCAnYXp1cmUtc2tpbGxzJywgJy5naXRodWInLCAncGx1Z2lucycsICdhenVyZS1za2lsbHMnKTtcblxuXHRcdGNvbnN0IGluc3RhbGxlZEpzb24gPSBVUkkuam9pblBhdGgoQ0FDSEVfUk9PVCwgJ2luc3RhbGxlZC5qc29uJyk7XG5cdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZShpbnN0YWxsZWRKc29uLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0aW5zdGFsbGVkOiBbe1xuXHRcdFx0XHRwbHVnaW5Vcmk6IGF6dXJlUGx1Z2luVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdG1hcmtldHBsYWNlOiBhd2Vzb21lQ29waWxvdC5yYXdWYWx1ZSxcblx0XHRcdFx0bmFtZTogJ2F6dXJlJyxcblx0XHRcdH1dLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbk1hcmtldHBsYWNlc106IFsnZ2l0aHViL2F3ZXNvbWUtY29waWxvdCNtYXJrZXRwbGFjZSddLFxuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbnNFbmFibGVkXTogdHJ1ZSxcblx0XHR9KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRW52aXJvbm1lbnRTZXJ2aWNlLCB7IGNhY2hlSG9tZTogVVJJLmZpbGUoJy9jYWNoZScpIH0gYXMgUGFydGlhbDxJRW52aXJvbm1lbnRTZXJ2aWNlPiBhcyBJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UgYXMgdW5rbm93biBhcyBJRmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UsIGNyZWF0ZVBsdWdpblJlcG9zaXRvcnlTdHViKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZXF1ZXN0U2VydmljZSwge30gYXMgdW5rbm93biBhcyBJUmVxdWVzdFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLCB7XG5cdFx0XHRleHRyYU1hcmtldHBsYWNlczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmV4dHJhTWFya2V0cGxhY2VzJywgW10pLFxuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5lbmFibGVkUGx1Z2lucycsIG5ldyBNYXAoKSksXG5cdFx0fSBhcyBQYXJ0aWFsPElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2U+IGFzIElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIHtcblx0XHRcdGlzV29ya3NwYWNlVHJ1c3RlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdG9uRGlkQ2hhbmdlVHJ1c3Q6IEV2ZW50Lk5vbmUsXG5cdFx0fSBhcyBQYXJ0aWFsPElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlPiBhcyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIHtcblx0XHRcdGdldEF1dG9VcGRhdGVWYWx1ZTogKCkgPT4gJ29uJyxcblx0XHR9IGFzIFBhcnRpYWw8SUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlPiBhcyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UpKTtcblxuXHRcdC8vIEZpbGVCYWNrZWRJbnN0YWxsZWRQbHVnaW5zU3RvcmUgaW5pdGlhbGlzZXMgYXN5bmNocm9ub3VzbHkuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG5cdFx0XHRpZiAoc2VydmljZS5pbnN0YWxsZWRQbHVnaW5zLmdldCgpLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc3RhbGxlZCA9IHNlcnZpY2UuaW5zdGFsbGVkUGx1Z2lucy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFsbGVkLmxlbmd0aCwgMSwgJ2F6dXJlIHBsdWdpbiBzaG91bGQgYmUgaHlkcmF0ZWQgZnJvbSBtYXJrZXRwbGFjZSBkYXRhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbGxlZFswXS5wbHVnaW4ubmFtZSwgJ2F6dXJlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbGxlZFswXS5wbHVnaW4uc291cmNlRGVzY3JpcHRvci5raW5kLCBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1Yik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbGxlZFswXS5wbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UuY2Fub25pY2FsSWQsIGF3ZXNvbWVDb3BpbG90LmNhbm9uaWNhbElkKTtcblx0fSk7XG5cblx0dGVzdCgncGVyc2lzdHMgcGx1Z2luIG5hbWUgd2hlbiBhIHBsdWdpbiBpcyBhZGRlZCBzbyBpdCBzdXJ2aXZlcyBhIHJlc3RhcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gRmlyc3Qgc2VydmljZSB3cml0ZXMgaW5zdGFsbGVkLmpzb24sIHNlY29uZCBzZXJ2aWNlIChzaGFyaW5nIHRoZVxuXHRcdC8vIHNhbWUgZmlsZSBzeXN0ZW0gKyBzdG9yYWdlKSByZWFkcyBpdCBiYWNrIGFuZCBtdXN0IHJlY29uc3RydWN0XG5cdFx0Ly8gdGhlIHBsdWdpbiBmcm9tIGl0cyBzdG9yZWQgbmFtZSBwbHVzIG1hcmtldHBsYWNlIGRhdGEuXG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgVGVzdEZpbGVTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBhd2Vzb21lQ29waWxvdCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2dpdGh1Yi9hd2Vzb21lLWNvcGlsb3QjbWFya2V0cGxhY2UnKSE7XG5cdFx0Y29uc3QgYXp1cmVQbHVnaW5VcmkgPSBVUkkuam9pblBhdGgoQ0FDSEVfUk9PVCwgJ2dpdGh1Yi5jb20nLCAnbWljcm9zb2Z0JywgJ2F6dXJlLXNraWxscycsICcuZ2l0aHViJywgJ3BsdWdpbnMnLCAnYXp1cmUtc2tpbGxzJyk7XG5cdFx0Y29uc3QgYXp1cmVQbHVnaW4gPSBtYWtlQXp1cmVQbHVnaW4oYXdlc29tZUNvcGlsb3QpO1xuXHRcdHN0b3JlTWFya2V0cGxhY2VDYWNoZShzdG9yYWdlU2VydmljZSwgYXdlc29tZUNvcGlsb3QsIGF6dXJlUGx1Z2luKTtcblxuXHRcdGZ1bmN0aW9uIG1ha2VTZXJ2aWNlKCk6IFBsdWdpbk1hcmtldHBsYWNlU2VydmljZSB7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzXTogWydnaXRodWIvYXdlc29tZS1jb3BpbG90I21hcmtldHBsYWNlJ10sXG5cdFx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5zRW5hYmxlZF06IHRydWUsXG5cdFx0XHR9KSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFNlcnZpY2UsIHsgY2FjaGVIb21lOiBVUkkuZmlsZSgnL2NhY2hlJykgfSBhcyBQYXJ0aWFsPElFbnZpcm9ubWVudFNlcnZpY2U+IGFzIElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlIGFzIHVua25vd24gYXMgSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UsIGNyZWF0ZVBsdWdpblJlcG9zaXRvcnlTdHViKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVxdWVzdFNlcnZpY2UsIHt9IGFzIHVua25vd24gYXMgSVJlcXVlc3RTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UsIHtcblx0XHRcdFx0ZXh0cmFNYXJrZXRwbGFjZXM6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5leHRyYU1hcmtldHBsYWNlcycsIFtdKSxcblx0XHRcdFx0ZW5hYmxlZFBsdWdpbnM6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5lbmFibGVkUGx1Z2lucycsIG5ldyBNYXAoKSksXG5cdFx0XHR9IGFzIFBhcnRpYWw8SVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZT4gYXMgSVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCB7XG5cdFx0XHRcdGlzV29ya3NwYWNlVHJ1c3RlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VUcnVzdDogRXZlbnQuTm9uZSxcblx0XHRcdH0gYXMgUGFydGlhbDxJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZT4gYXMgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIHtcblx0XHRcdFx0Z2V0QXV0b1VwZGF0ZVZhbHVlOiAoKSA9PiAnb24nLFxuXHRcdFx0fSBhcyBQYXJ0aWFsPElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZT4gYXMgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRcdHJldHVybiBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlKSk7XG5cdFx0fVxuXG5cdFx0Ly8gRmlyc3Qgc2Vzc2lvbjogaW5zdGFsbCB0aGUgcGx1Z2luLlxuXHRcdGNvbnN0IGZpcnN0ID0gbWFrZVNlcnZpY2UoKTtcblx0XHQvLyBXYWl0IGZvciBGaWxlQmFja2VkSW5zdGFsbGVkUGx1Z2luc1N0b3JlIHRvIGZpbmlzaCBpbml0aWFsaXNhdGlvblxuXHRcdC8vIHNvIHRoYXQgc3Vic2VxdWVudCB3cml0ZXMgYXJlIGZsdXNoZWQgdG8gdGhlIGZpbGUgc2VydmljZS5cblx0XHRhd2FpdCB0aW1lb3V0KDIwKTtcblx0XHRmaXJzdC5hZGRJbnN0YWxsZWRQbHVnaW4oYXp1cmVQbHVnaW5VcmksIGF6dXJlUGx1Z2luKTtcblx0XHQvLyBXYWl0IGZvciB0aGUgdGhyb3R0bGVkIHdyaXRlIHRvIGxhbmQuXG5cdFx0YXdhaXQgdGltZW91dCgyMDApO1xuXG5cdFx0Y29uc3QgaW5zdGFsbGVkSnNvbiA9IFVSSS5qb2luUGF0aChDQUNIRV9ST09ULCAnaW5zdGFsbGVkLmpzb24nKTtcblx0XHRjb25zdCBwZXJzaXN0ZWQgPSBKU09OLnBhcnNlKGZpbGVTZXJ2aWNlLmZpbGVzLmdldChpbnN0YWxsZWRKc29uLnRvU3RyaW5nKCkpISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlcnNpc3RlZC5pbnN0YWxsZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBlcnNpc3RlZC5pbnN0YWxsZWRbMF0sIHtcblx0XHRcdHBsdWdpblVyaTogYXp1cmVQbHVnaW5VcmkudG9TdHJpbmcoKSxcblx0XHRcdG1hcmtldHBsYWNlOiBhd2Vzb21lQ29waWxvdC5yYXdWYWx1ZSxcblx0XHRcdG5hbWU6ICdhenVyZScsXG5cdFx0fSk7XG5cblx0XHQvLyBTZWNvbmQgc2Vzc2lvbjogcmVzdGFydCB3aXRoIHNoYXJlZCBzdG9yYWdlICsgZmlsZSBzeXN0ZW0uIFRoZVxuXHRcdC8vIHBsdWdpbiBtdXN0IGJlIHJlY29uc3RydWN0ZWQgZnJvbSBpbnN0YWxsZWQuanNvbiArIG1hcmtldHBsYWNlIGRhdGEuXG5cdFx0Y29uc3Qgc2Vjb25kID0gbWFrZVNlcnZpY2UoKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwOyBpKyspIHtcblx0XHRcdGlmIChzZWNvbmQuaW5zdGFsbGVkUGx1Z2lucy5nZXQoKS5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHR9XG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gc2Vjb25kLmluc3RhbGxlZFBsdWdpbnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbGxlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YWxsZWRbMF0ucGx1Z2luLm5hbWUsICdhenVyZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YWxsZWRbMF0ucGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZCwgUGx1Z2luU291cmNlS2luZC5HaXRIdWIpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgncGFyc2VQbHVnaW5Tb3VyY2UnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGxvZ0NvbnRleHQgPSB7XG5cdFx0cGx1Z2luTmFtZTogJ3Rlc3QnLFxuXHRcdGxvZ1NlcnZpY2U6IG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdGxvZ1ByZWZpeDogJ1t0ZXN0XScsXG5cdH07XG5cblx0dGVzdCgncGFyc2VzIHN0cmluZyBzb3VyY2UgYXMgUmVsYXRpdmVQYXRoJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUGx1Z2luU291cmNlKCcuL215LXBsdWdpbicsIHVuZGVmaW5lZCwgbG9nQ29udGV4dCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICdteS1wbHVnaW4nIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgc3RyaW5nIHNvdXJjZSB3aXRoIHBsdWdpblJvb3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VQbHVnaW5Tb3VyY2UoJ3N1YicsICdwbHVnaW5zJywgbG9nQ29udGV4dCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICdwbHVnaW5zL3N1YicgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyB1bmRlZmluZWQgc291cmNlIGFzIFJlbGF0aXZlUGF0aCB1c2luZyBwbHVnaW5Sb290JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUGx1Z2luU291cmNlKHVuZGVmaW5lZCwgJ3Jvb3QnLCBsb2dDb250ZXh0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3Jvb3QnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgZW1wdHkgc3RyaW5nIHNvdXJjZSBhcyBSZWxhdGl2ZVBhdGggdXNpbmcgcGx1Z2luUm9vdCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVBsdWdpblNvdXJjZSgnJywgJ2Jhc2UnLCBsb2dDb250ZXh0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ2Jhc2UnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGJhc2UgZGlyIGZvciBlbXB0eSBzb3VyY2Ugd2l0aG91dCBwbHVnaW5Sb290JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VQbHVnaW5Tb3VyY2UoJycsIHVuZGVmaW5lZCwgbG9nQ29udGV4dCksIHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICcnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGJhc2UgZGlyIGZvciB1bmRlZmluZWQgc291cmNlIHdpdGhvdXQgcGx1Z2luUm9vdCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlUGx1Z2luU291cmNlKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KSwgeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJycgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBnaXRodWIgb2JqZWN0IHNvdXJjZScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVBsdWdpblNvdXJjZSh7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdvd25lci9yZXBvJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycsIHJlZjogdW5kZWZpbmVkLCBzaGE6IHVuZGVmaW5lZCwgcGF0aDogdW5kZWZpbmVkIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgZ2l0aHViIG9iamVjdCBzb3VyY2Ugd2l0aCByZWYgYW5kIHNoYScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVBsdWdpblNvdXJjZSh7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdvd25lci9yZXBvJywgcmVmOiAndjIuMC4wJywgc2hhOiAnYTFiMmMzZDRlNWY2YTdiOGM5ZDBlMWYyYTNiNGM1ZDZlN2Y4YTliMCcgfSwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nLCByZWY6ICd2Mi4wLjAnLCBzaGE6ICdhMWIyYzNkNGU1ZjZhN2I4YzlkMGUxZjJhM2I0YzVkNmU3ZjhhOWIwJywgcGF0aDogdW5kZWZpbmVkIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgZ2l0aHViIG9iamVjdCBzb3VyY2Ugd2l0aCBwYXRoJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ293bmVyL3JlcG8nLCBwYXRoOiAncGx1Z2lucy9teS1wbHVnaW4nIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIHJlcG86ICdvd25lci9yZXBvJywgcmVmOiB1bmRlZmluZWQsIHNoYTogdW5kZWZpbmVkLCBwYXRoOiAncGx1Z2lucy9teS1wbHVnaW4nIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZ2l0aHViIHNvdXJjZSBtaXNzaW5nIHJlcG8nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnZ2l0aHViJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZ2l0aHViIHNvdXJjZSB3aXRoIGludmFsaWQgcmVwbyBmb3JtYXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ293bmVyJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZ2l0aHViIHNvdXJjZSB3aXRoIGludmFsaWQgc2hhJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVBsdWdpblNvdXJjZSh7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdvd25lci9yZXBvJywgc2hhOiAnYWJjMTIzJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZ2l0aHViIHNvdXJjZSB3aXRoIG5vbi1zdHJpbmcgcGF0aCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnb3duZXIvcmVwbycsIHBhdGg6IDQyIH0gYXMgbmV2ZXIsIHVuZGVmaW5lZCwgbG9nQ29udGV4dCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyB1cmwgb2JqZWN0IHNvdXJjZScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVBsdWdpblNvdXJjZSh7IHNvdXJjZTogJ3VybCcsIHVybDogJ2h0dHBzOi8vZ2l0bGFiLmNvbS90ZWFtL3BsdWdpbi5naXQnIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRVcmwsIHVybDogJ2h0dHBzOi8vZ2l0bGFiLmNvbS90ZWFtL3BsdWdpbi5naXQnLCByZWY6IHVuZGVmaW5lZCwgc2hhOiB1bmRlZmluZWQsIHBhdGg6IHVuZGVmaW5lZCB9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHVybCBzb3VyY2UgbWlzc2luZyB1cmwgZmllbGQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAndXJsJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgdXJsIHNvdXJjZSBub3QgZW5kaW5nIGluIC5naXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAndXJsJywgdXJsOiAnaHR0cHM6Ly9naXRsYWIuY29tL3RlYW0vcGx1Z2luJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgZ2l0LXN1YmRpciBvYmplY3Qgc291cmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnZ2l0LXN1YmRpcicsIHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9hY21lL21vbm9yZXBvLmdpdCcsIHBhdGg6ICd0b29scy9jbGF1ZGUtcGx1Z2luJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0VXJsLCB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vYWNtZS9tb25vcmVwby5naXQnLCByZWY6IHVuZGVmaW5lZCwgc2hhOiB1bmRlZmluZWQsIHBhdGg6ICd0b29scy9jbGF1ZGUtcGx1Z2luJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIGdpdC1zdWJkaXIgb2JqZWN0IHNvdXJjZSB3aXRoIHJlZiBhbmQgc2hhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnZ2l0LXN1YmRpcicsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vcmVwby5naXQnLCBwYXRoOiAncGx1Z2lucy9mb28nLCByZWY6ICd2Mi4wLjAnLCBzaGE6ICdhMWIyYzNkNGU1ZjZhN2I4YzlkMGUxZjJhM2I0YzVkNmU3ZjhhOWIwJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0VXJsLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3JlcG8uZ2l0JywgcmVmOiAndjIuMC4wJywgc2hhOiAnYTFiMmMzZDRlNWY2YTdiOGM5ZDBlMWYyYTNiNGM1ZDZlN2Y4YTliMCcsIHBhdGg6ICdwbHVnaW5zL2ZvbycgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBnaXQtc3ViZGlyIHNvdXJjZSB3aXRob3V0IC5naXQgc3VmZml4JywgKCkgPT4ge1xuXHRcdC8vIGdpdC1zdWJkaXIgZG9lcyBub3QgcmVxdWlyZSAuZ2l0IHN1ZmZpeCAoQXp1cmUgRGV2T3BzIC8gQVdTIENvZGVDb21taXQgY29tcGF0aWJpbGl0eSlcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVBsdWdpblNvdXJjZSh7IHNvdXJjZTogJ2dpdC1zdWJkaXInLCB1cmw6ICdodHRwczovL2Rldi5henVyZS5jb20vb3JnL3Byb2plY3QvX2dpdC9yZXBvJywgcGF0aDogJ3BsdWdpbnMvZm9vJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0VXJsLCB1cmw6ICdodHRwczovL2Rldi5henVyZS5jb20vb3JnL3Byb2plY3QvX2dpdC9yZXBvJywgcmVmOiB1bmRlZmluZWQsIHNoYTogdW5kZWZpbmVkLCBwYXRoOiAncGx1Z2lucy9mb28nIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZ2l0LXN1YmRpciBzb3VyY2UgbWlzc2luZyB1cmwgZmllbGQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnZ2l0LXN1YmRpcicsIHBhdGg6ICdwbHVnaW5zL2ZvbycgfSwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGdpdC1zdWJkaXIgc291cmNlIG1pc3NpbmcgcGF0aCBmaWVsZCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICdnaXQtc3ViZGlyJywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9yZXBvLmdpdCcgfSwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIG5wbSBvYmplY3Qgc291cmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnbnBtJywgcGFja2FnZTogJ0BhY21lL2NsYXVkZS1wbHVnaW4nIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogUGx1Z2luU291cmNlS2luZC5OcG0sIHBhY2thZ2U6ICdAYWNtZS9jbGF1ZGUtcGx1Z2luJywgdmVyc2lvbjogdW5kZWZpbmVkLCByZWdpc3RyeTogdW5kZWZpbmVkIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgbnBtIG9iamVjdCBzb3VyY2Ugd2l0aCB2ZXJzaW9uIGFuZCByZWdpc3RyeScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVBsdWdpblNvdXJjZSh7IHNvdXJjZTogJ25wbScsIHBhY2thZ2U6ICdAYWNtZS9jbGF1ZGUtcGx1Z2luJywgdmVyc2lvbjogJzIuMS4wJywgcmVnaXN0cnk6ICdodHRwczovL25wbS5leGFtcGxlLmNvbScgfSwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgcGFja2FnZTogJ0BhY21lL2NsYXVkZS1wbHVnaW4nLCB2ZXJzaW9uOiAnMi4xLjAnLCByZWdpc3RyeTogJ2h0dHBzOi8vbnBtLmV4YW1wbGUuY29tJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIG5wbSBzb3VyY2UgbWlzc2luZyBwYWNrYWdlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVBsdWdpblNvdXJjZSh7IHNvdXJjZTogJ25wbScgfSwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIG5wbSBzb3VyY2Ugd2l0aCBub24tc3RyaW5nIHZlcnNpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnbnBtJywgcGFja2FnZTogJ0BhY21lL2NsYXVkZS1wbHVnaW4nLCB2ZXJzaW9uOiAxMjMgfSBhcyBuZXZlciwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIHBpcCBvYmplY3Qgc291cmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAncGlwJywgcGFja2FnZTogJ215LXBsdWdpbicgfSwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlBpcCwgcGFja2FnZTogJ215LXBsdWdpbicsIHZlcnNpb246IHVuZGVmaW5lZCwgcmVnaXN0cnk6IHVuZGVmaW5lZCB9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIHBpcCBvYmplY3Qgc291cmNlIHdpdGggdmVyc2lvbiBhbmQgcmVnaXN0cnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICdwaXAnLCBwYWNrYWdlOiAnbXktcGx1Z2luJywgdmVyc2lvbjogJzEuMC4wJywgcmVnaXN0cnk6ICdodHRwczovL3B5cGkuZXhhbXBsZS5jb20nIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogUGx1Z2luU291cmNlS2luZC5QaXAsIHBhY2thZ2U6ICdteS1wbHVnaW4nLCB2ZXJzaW9uOiAnMS4wLjAnLCByZWdpc3RyeTogJ2h0dHBzOi8vcHlwaS5leGFtcGxlLmNvbScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBwaXAgc291cmNlIG1pc3NpbmcgcGFja2FnZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICdwaXAnIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBwaXAgc291cmNlIHdpdGggbm9uLXN0cmluZyByZWdpc3RyeScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICdwaXAnLCBwYWNrYWdlOiAnbXktcGx1Z2luJywgcmVnaXN0cnk6IDQyIH0gYXMgbmV2ZXIsIHVuZGVmaW5lZCwgbG9nQ29udGV4dCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB1bmtub3duIHNvdXJjZSBraW5kJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVBsdWdpblNvdXJjZSh7IHNvdXJjZTogJ3Vua25vd24nIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBvYmplY3Qgc291cmNlIHdpdGhvdXQgc291cmNlIGRpc2NyaW1pbmFudCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VQbHVnaW5Tb3VyY2UoeyBwYWNrYWdlOiAndGVzdCcgfSBhcyBuZXZlciwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KSwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2dldFBsdWdpblNvdXJjZUxhYmVsJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmb3JtYXRzIHJlbGF0aXZlIHBhdGgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFBsdWdpblNvdXJjZUxhYmVsKHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICdwbHVnaW5zL2ZvbycgfSksICdwbHVnaW5zL2ZvbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JtYXRzIGVtcHR5IHJlbGF0aXZlIHBhdGgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFBsdWdpblNvdXJjZUxhYmVsKHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICcnIH0pLCAnLicpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JtYXRzIGdpdGh1YiBzb3VyY2UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFBsdWdpblNvdXJjZUxhYmVsKHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIHJlcG86ICdvd25lci9yZXBvJyB9KSwgJ293bmVyL3JlcG8nKTtcblx0fSk7XG5cblx0dGVzdCgnZm9ybWF0cyBnaXRodWIgc291cmNlIHdpdGggcGF0aCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UGx1Z2luU291cmNlTGFiZWwoeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nLCBwYXRoOiAncGx1Z2lucy9mb28nIH0pLCAnb3duZXIvcmVwby9wbHVnaW5zL2ZvbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JtYXRzIHVybCBzb3VyY2UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFBsdWdpblNvdXJjZUxhYmVsKHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRVcmwsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vcmVwby5naXQnIH0pLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9yZXBvLmdpdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JtYXRzIHVybCBzb3VyY2Ugd2l0aCBwYXRoJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQbHVnaW5Tb3VyY2VMYWJlbCh7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0VXJsLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3JlcG8uZ2l0JywgcGF0aDogJ3BsdWdpbnMvZm9vJyB9KSwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vcmVwby5naXQvcGx1Z2lucy9mb28nKTtcblx0fSk7XG5cblx0dGVzdCgnZm9ybWF0cyBucG0gc291cmNlIHdpdGhvdXQgdmVyc2lvbicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UGx1Z2luU291cmNlTGFiZWwoeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgcGFja2FnZTogJ0BhY21lL3BsdWdpbicgfSksICdAYWNtZS9wbHVnaW4nKTtcblx0fSk7XG5cblx0dGVzdCgnZm9ybWF0cyBucG0gc291cmNlIHdpdGggdmVyc2lvbicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UGx1Z2luU291cmNlTGFiZWwoeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgcGFja2FnZTogJ0BhY21lL3BsdWdpbicsIHZlcnNpb246ICcxLjAuMCcgfSksICdAYWNtZS9wbHVnaW5AMS4wLjAnKTtcblx0fSk7XG5cblx0dGVzdCgnZm9ybWF0cyBwaXAgc291cmNlIHdpdGhvdXQgdmVyc2lvbicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UGx1Z2luU291cmNlTGFiZWwoeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlBpcCwgcGFja2FnZTogJ215LXBsdWdpbicgfSksICdteS1wbHVnaW4nKTtcblx0fSk7XG5cblx0dGVzdCgnZm9ybWF0cyBwaXAgc291cmNlIHdpdGggdmVyc2lvbicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UGx1Z2luU291cmNlTGFiZWwoeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlBpcCwgcGFja2FnZTogJ215LXBsdWdpbicsIHZlcnNpb246ICcyLjAnIH0pLCAnbXktcGx1Z2luPT0yLjAnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0IsZ0JBQWdCO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBd0M7QUFDakQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQix3QkFBd0IsY0FBYyxxQkFBcUI7QUFDckYsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUywyQkFBMkI7QUFDcEMsU0FBdUMsbUNBQW1DO0FBQzFFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUNBQXFDO0FBQzlDLFNBQTZFLDBCQUEwQixpQkFBaUIsMEJBQTBCLGtCQUFrQixv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
