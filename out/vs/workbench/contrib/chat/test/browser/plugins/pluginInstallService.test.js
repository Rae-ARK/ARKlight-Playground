import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../../../base/common/errors.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { IProgressService } from "../../../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { IPathService } from "../../../../../services/path/common/pathService.js";
import { ITerminalService } from "../../../../terminal/browser/terminal.js";
import { PluginInstallService } from "../../../browser/pluginInstallService.js";
import { IAgentPluginRepositoryService } from "../../../common/plugins/agentPluginRepositoryService.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IPluginMarketplaceService, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from "../../../common/plugins/pluginMarketplaceService.js";
suite("PluginInstallService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function makeMarketplaceRef(marketplace) {
    const ref = parseMarketplaceReference(marketplace);
    assert.ok(ref);
    return ref;
  }
  function createPlugin(overrides) {
    return {
      name: overrides.name ?? "test-plugin",
      description: overrides.description ?? "",
      version: overrides.version ?? "",
      source: overrides.source ?? "",
      sourceDescriptor: overrides.sourceDescriptor,
      marketplace: overrides.marketplace ?? "microsoft/vscode",
      marketplaceReference: overrides.marketplaceReference ?? makeMarketplaceRef("microsoft/vscode"),
      marketplaceType: overrides.marketplaceType ?? MarketplaceType.Copilot,
      readmeUri: overrides.readmeUri
    };
  }
  function createDefaults() {
    return {
      notifications: [],
      addedPlugins: [],
      dialogConfirmResult: true,
      fileExistsResult: true,
      ensureRepositoryResult: URI.file("/cache/agentPlugins/github.com/microsoft/vscode"),
      ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-package"),
      pluginSourceInstallUris: /* @__PURE__ */ new Map(),
      terminalCommands: [],
      terminalExitCode: 0,
      terminalCompletes: true,
      pullRepositoryCalls: [],
      updatePluginSourceCalls: [],
      marketplaceTrusted: true,
      strictMarketplacePolicyActive: false,
      installedPlugins: [],
      fetchedMarketplacePlugins: [],
      fetchMarketplaceCalls: [],
      autoUpdateByMarketplace: /* @__PURE__ */ new Map(),
      clearUpdatesAvailableCalls: 0,
      trustedMarketplaces: [],
      readPluginsResult: [],
      singlePluginManifestResult: void 0,
      quickPickResult: void 0,
      quickInputResult: void 0,
      configuredMarketplaces: [],
      updatedMarketplaces: void 0,
      resolveIsDirectory: true,
      isPluginDirectoryResult: false,
      configuredPluginLocations: {},
      updatedPluginLocations: void 0,
      userHome: "/home/user"
    };
  }
  function createService(stateOverrides) {
    const state = { ...createDefaults(), ...stateOverrides };
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IFileService, {
      exists: async (resource) => {
        if (typeof state.fileExistsResult === "function") {
          return state.fileExistsResult(resource);
        }
        return state.fileExistsResult;
      },
      resolve: async (resource) => ({ resource, isDirectory: state.resolveIsDirectory })
    });
    instantiationService.stub(INotificationService, {
      notify: (notification) => {
        state.notifications.push({ severity: notification.severity, message: notification.message });
        notification.actions?.primary?.forEach((action) => action.dispose());
        return void 0;
      }
    });
    instantiationService.stub(IDialogService, {
      confirm: async () => ({ confirmed: state.dialogConfirmResult })
    });
    instantiationService.stub(ITerminalService, {
      createTerminal: async () => {
        let finishedCallback;
        return {
          processReady: Promise.resolve(),
          dispose: () => {
          },
          runCommand: (command, _addNewLine) => {
            state.terminalCommands.push(command);
            if (finishedCallback) {
              finishedCallback({ id: "command", exitCode: state.terminalExitCode });
            }
          },
          capabilities: {
            get: () => state.terminalCompletes ? {
              onCommandFinished: (callback) => {
                finishedCallback = callback;
                return { dispose() {
                } };
              }
            } : void 0,
            onDidAddCommandDetectionCapability: () => ({ dispose() {
            } })
          }
        };
      },
      setActiveInstance: () => {
      }
    });
    instantiationService.stub(IProgressService, {
      withProgress: async (_options, callback) => callback()
    });
    instantiationService.stub(ILogService, new NullLogService());
    const makeMockPackageRepo = (kind) => ({
      kind,
      getCleanupTarget: () => URI.file("/mock-cleanup"),
      getInstallUri: () => URI.file("/mock"),
      ensure: async () => state.ensurePluginSourceResult,
      update: async () => true,
      getLabel: (d) => kind === PluginSourceKind.Npm ? d.package : d.package,
      runInstall: async (_installDir, pluginDir, plugin) => {
        if (!state.dialogConfirmResult) {
          return void 0;
        }
        const descriptor = plugin.sourceDescriptor;
        let args;
        if (kind === PluginSourceKind.Npm) {
          const npm = descriptor;
          const packageSpec = npm.version ? `${npm.package}@${npm.version}` : npm.package;
          args = ["npm", "install", "--prefix", _installDir.fsPath, packageSpec];
          if (npm.registry) {
            args.push("--registry", npm.registry);
          }
        } else {
          const pip = descriptor;
          const packageSpec = pip.version ? `${pip.package}==${pip.version}` : pip.package;
          args = ["pip", "install", "--target", _installDir.fsPath, packageSpec];
          if (pip.registry) {
            args.push("--index-url", pip.registry);
          }
        }
        const command = args.join(" ");
        state.terminalCommands.push(command);
        if (state.terminalExitCode !== 0) {
          state.notifications.push({ severity: 3, message: `Plugin installation command failed: Command exited with code ${state.terminalExitCode}` });
          return void 0;
        }
        const exists = typeof state.fileExistsResult === "function" ? await state.fileExistsResult(pluginDir) : state.fileExistsResult;
        if (!exists) {
          const label = kind === PluginSourceKind.Npm ? "npm" : "pip";
          const pkg = descriptor.package;
          state.notifications.push({ severity: 3, message: `${label} package '${pkg}' was not found after installation.` });
          return void 0;
        }
        return { pluginDir };
      }
    });
    const mockSourceRepos = /* @__PURE__ */ new Map([
      [PluginSourceKind.RelativePath, { kind: PluginSourceKind.RelativePath, getCleanupTarget: () => void 0, getInstallUri: () => {
        throw new Error();
      }, ensure: async () => {
        throw new Error();
      }, update: async () => {
        throw new Error();
      }, getLabel: (d) => d.path || "." }],
      [PluginSourceKind.GitHub, { kind: PluginSourceKind.GitHub, getCleanupTarget: () => URI.file("/mock"), getInstallUri: () => URI.file("/mock"), ensure: async () => URI.file("/mock"), update: async () => true, getLabel: (d) => d.repo }],
      [PluginSourceKind.GitUrl, { kind: PluginSourceKind.GitUrl, getCleanupTarget: () => URI.file("/mock"), getInstallUri: () => URI.file("/mock"), ensure: async () => URI.file("/mock"), update: async () => true, getLabel: (d) => d.url }],
      [PluginSourceKind.Npm, makeMockPackageRepo(PluginSourceKind.Npm)],
      [PluginSourceKind.Pip, makeMockPackageRepo(PluginSourceKind.Pip)]
    ]);
    instantiationService.stub(IAgentPluginRepositoryService, {
      getPluginInstallUri: (plugin) => {
        if (plugin.sourceDescriptor.kind !== PluginSourceKind.RelativePath) {
          return state.pluginSourceInstallUris.get(plugin.sourceDescriptor.kind) ?? URI.file(`/cache/agentPlugins/${plugin.sourceDescriptor.kind}/default`);
        }
        return URI.joinPath(state.ensureRepositoryResult, plugin.source);
      },
      getRepositoryUri: () => state.ensureRepositoryResult,
      ensureRepository: async (_marketplace, _options) => {
        return state.ensureRepositoryResult;
      },
      pullRepository: async (marketplace, options) => {
        state.pullRepositoryCalls.push({ marketplace, options });
      },
      getPluginSourceInstallUri: (descriptor) => {
        const key = descriptor.kind;
        return state.pluginSourceInstallUris.get(key) ?? URI.file(`/cache/agentPlugins/${key}/default`);
      },
      ensurePluginSource: async () => state.ensurePluginSourceResult,
      updatePluginSource: async (plugin, options) => {
        state.updatePluginSourceCalls.push({ plugin, options });
      },
      getPluginSource: (kind) => mockSourceRepos.get(kind),
      cleanupPluginSource: async () => {
      }
    });
    instantiationService.stub(IPluginMarketplaceService, {
      installedPlugins: observableValue("test.installedPlugins", state.installedPlugins),
      addInstalledPlugin: (uri, plugin) => {
        state.addedPlugins.push({ uri: uri.toString(), plugin });
      },
      isMarketplaceTrusted: () => state.marketplaceTrusted,
      isStrictMarketplacePolicyActive: () => state.strictMarketplacePolicyActive ?? false,
      isMarketplaceAutoUpdateEnabled: (ref) => state.autoUpdateByMarketplace.get(ref.canonicalId) ?? true,
      fetchMarketplacePlugins: async (_token, marketplaceIds) => {
        state.fetchMarketplaceCalls.push([...marketplaceIds ?? []]);
        return state.fetchedMarketplacePlugins.filter((plugin) => !marketplaceIds || marketplaceIds.has(plugin.marketplaceReference.canonicalId));
      },
      clearUpdatesAvailable: () => state.clearUpdatesAvailableCalls++,
      trustMarketplace: (ref) => {
        state.trustedMarketplaces.push(ref.canonicalId);
      },
      readPluginsFromDirectory: async () => state.readPluginsResult,
      readSinglePluginManifest: async () => state.singlePluginManifestResult,
      isPluginDirectory: async () => state.isPluginDirectoryResult
    });
    instantiationService.stub(IConfigurationService, {
      getValue: (key) => {
        if (key === ChatConfiguration.PluginMarketplaces) {
          return state.configuredMarketplaces;
        }
        if (key === ChatConfiguration.PluginLocations) {
          return state.configuredPluginLocations;
        }
        return void 0;
      },
      inspect: (key) => {
        if (key === ChatConfiguration.PluginMarketplaces) {
          return { userValue: state.configuredMarketplaces, defaultValue: void 0, policyValue: void 0 };
        }
        if (key === ChatConfiguration.PluginLocations) {
          return { userValue: state.configuredPluginLocations, defaultValue: void 0, policyValue: void 0 };
        }
        return { userValue: void 0, defaultValue: void 0, policyValue: void 0 };
      },
      updateValue: async (key, value) => {
        if (key === ChatConfiguration.PluginMarketplaces) {
          state.updatedMarketplaces = value;
        }
        if (key === ChatConfiguration.PluginLocations) {
          state.updatedPluginLocations = value;
        }
      }
    });
    instantiationService.stub(IPathService, {
      userHome: async () => URI.file(state.userHome)
    });
    instantiationService.stub(IQuickInputService, {
      input: async () => state.quickInputResult,
      pick: async (picks) => {
        if (!state.quickPickResult) {
          return void 0;
        }
        return picks.find((p) => p.label === state.quickPickResult.label);
      }
    });
    const service = instantiationService.createInstance(PluginInstallService);
    return { service, state };
  }
  suite("getPluginInstallUri", () => {
    test("delegates to getPluginInstallUri for relative-path plugins", () => {
      const { service } = createService();
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      const uri = service.getPluginInstallUri(plugin);
      assert.strictEqual(uri.path, "/cache/agentPlugins/github.com/microsoft/vscode/plugins/myPlugin");
    });
    test("delegates to getPluginSourceInstallUri for npm plugins", () => {
      const npmUri = URI.file("/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg");
      const { service } = createService({
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["npm", npmUri]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      const uri = service.getPluginInstallUri(plugin);
      assert.strictEqual(uri.path, npmUri.path);
    });
    test("delegates to getPluginSourceInstallUri for pip plugins", () => {
      const pipUri = URI.file("/cache/agentPlugins/pip/my-pkg");
      const { service } = createService({
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["pip", pipUri]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg" }
      });
      const uri = service.getPluginInstallUri(plugin);
      assert.strictEqual(uri.path, pipUri.path);
    });
    test("delegates to getPluginSourceInstallUri for github plugins", () => {
      const ghUri = URI.file("/cache/agentPlugins/github.com/owner/repo");
      const { service } = createService({
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["github", ghUri]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" }
      });
      const uri = service.getPluginInstallUri(plugin);
      assert.strictEqual(uri.path, ghUri.path);
    });
  });
  suite("installPlugin \u2014 relative path", () => {
    test("installs a relative-path plugin when directory exists", async () => {
      const { service, state } = createService();
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.ok(state.addedPlugins[0].uri.includes("plugins/myPlugin"));
      assert.strictEqual(state.notifications.length, 0);
    });
    test("notifies error when plugin directory does not exist", async () => {
      const { service, state } = createService({ fileExistsResult: false });
      const plugin = createPlugin({
        source: "plugins/missing",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/missing" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.notifications.length, 1);
      assert.ok(state.notifications[0].message.includes("not found"));
    });
    test("does not install when ensureRepository throws", async () => {
      const { state } = createService();
      const instantiationService = store.add(new TestInstantiationService());
      const repoService = {
        ensureRepository: async () => {
          throw new Error("clone failed");
        },
        getPluginInstallUri: () => URI.file("/x"),
        getPluginSourceInstallUri: () => URI.file("/x")
      };
      instantiationService.stub(IAgentPluginRepositoryService, repoService);
      instantiationService.stub(IFileService, { exists: async () => true });
      instantiationService.stub(INotificationService, { notify: (n) => {
        state.notifications.push(n);
      } });
      instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed: true }) });
      instantiationService.stub(ITerminalService, {});
      instantiationService.stub(IProgressService, { withProgress: async (_o, cb) => cb() });
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(IPluginMarketplaceService, { addInstalledPlugin: () => {
      } });
      instantiationService.stub(IPluginMarketplaceService, "isMarketplaceTrusted", () => true);
      instantiationService.stub(IPluginMarketplaceService, "trustMarketplace", () => {
      });
      const svc = instantiationService.createInstance(PluginInstallService);
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      await svc.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
  });
  suite("installPlugin \u2014 git sources", () => {
    test("installs a GitHub plugin when source exists after clone", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/repo")
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.notifications.length, 0);
    });
    test("installs a GitUrl plugin when source exists after clone", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/example.com/repo")
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitUrl, url: "https://example.com/repo.git" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.notifications.length, 0);
    });
    test("notifies error when cloned directory does not exist", async () => {
      const { service, state } = createService({
        fileExistsResult: false,
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/repo")
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.notifications.length, 1);
      assert.ok(state.notifications[0].message.includes("not found"));
    });
  });
  suite("installPlugin \u2014 npm", () => {
    test("runs npm install and registers plugin on success", async () => {
      const npmInstallUri = URI.file("/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg");
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["npm", npmInstallUri]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("npm"));
      assert.ok(state.terminalCommands[0].includes("install"));
      assert.ok(state.terminalCommands[0].includes("my-pkg"));
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.notifications.length, 0);
    });
    test("includes version in npm install command", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["npm", URI.file("/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg", version: "1.2.3" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("my-pkg@1.2.3"));
    });
    test("includes registry in npm install command", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["npm", URI.file("/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg", registry: "https://custom.registry.com" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("--registry"));
      assert.ok(state.terminalCommands[0].includes("https://custom.registry.com"));
    });
    test("does not install when user declines confirmation", async () => {
      const { service, state } = createService({ dialogConfirmResult: false });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 0);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("notifies error when npm package directory not found after install", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        // exists returns true for ensurePluginSource but false for the final check
        fileExistsResult: false
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.notifications.length, 1);
      assert.ok(state.notifications[0].message.includes("not found"));
    });
    test("notifies error when terminal command fails with non-zero exit code", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        terminalExitCode: 1
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.notifications.length, 1);
      assert.ok(state.notifications[0].message.includes("failed"));
    });
  });
  suite("installPlugin \u2014 pip", () => {
    test("runs pip install and registers plugin on success", async () => {
      const pipInstallUri = URI.file("/cache/agentPlugins/pip/my-pkg");
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/pip/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["pip", pipInstallUri]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("pip"));
      assert.ok(state.terminalCommands[0].includes("install"));
      assert.ok(state.terminalCommands[0].includes("my-pkg"));
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.notifications.length, 0);
    });
    test("includes version with == syntax in pip install command", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/pip/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["pip", URI.file("/cache/agentPlugins/pip/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg", version: "2.0.0" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("my-pkg==2.0.0"));
    });
    test("includes registry with --index-url in pip install command", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/pip/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["pip", URI.file("/cache/agentPlugins/pip/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg", registry: "https://pypi.custom.com/simple" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("--index-url"));
      assert.ok(state.terminalCommands[0].includes("https://pypi.custom.com/simple"));
    });
    test("does not install when user declines confirmation", async () => {
      const { service, state } = createService({ dialogConfirmResult: false });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 0);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("notifies error when pip package directory not found after install", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/pip/my-pkg"),
        fileExistsResult: false
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.notifications.length, 1);
      assert.ok(state.notifications[0].message.includes("not found"));
    });
  });
  suite("updatePlugin", () => {
    test("calls updatePluginSource for relative-path plugins", async () => {
      const { service, state } = createService();
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      await service.updatePlugin(plugin);
      assert.strictEqual(state.updatePluginSourceCalls.length, 1);
    });
    test("calls updatePluginSource for GitHub plugins", async () => {
      const { service, state } = createService();
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" }
      });
      await service.updatePlugin(plugin);
      assert.strictEqual(state.updatePluginSourceCalls.length, 1);
    });
    test("calls updatePluginSource for GitUrl plugins", async () => {
      const { service, state } = createService();
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitUrl, url: "https://example.com/repo.git" }
      });
      await service.updatePlugin(plugin);
      assert.strictEqual(state.updatePluginSourceCalls.length, 1);
    });
    test("blocks direct updates when the strict marketplace policy disallows the source", async () => {
      const { service, state } = createService({
        strictMarketplacePolicyActive: true,
        marketplaceTrusted: false
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" }
      });
      const updated = await service.updatePlugin(plugin);
      assert.deepStrictEqual({
        updated,
        updateCalls: state.updatePluginSourceCalls.length,
        notifications: state.notifications.map((notification) => notification.message)
      }, {
        updated: false,
        updateCalls: 0,
        notifications: ["Updates from 'microsoft/vscode' are blocked by your organization's policy."]
      });
    });
    test("re-installs for npm plugin updates", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["npm", URI.file("/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      await service.updatePlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("npm"));
    });
    test("does not report npm plugin as updated when install is declined", async () => {
      const { service, state } = createService({
        dialogConfirmResult: false,
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["npm", URI.file("/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      const updated = await service.updatePlugin(plugin);
      assert.strictEqual(updated, false);
      assert.strictEqual(state.terminalCommands.length, 0);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("re-installs for pip plugin updates", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/pip/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["pip", URI.file("/cache/agentPlugins/pip/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg" }
      });
      await service.updatePlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("pip"));
    });
    test("does not report pip plugin as updated when install is declined", async () => {
      const { service, state } = createService({
        dialogConfirmResult: false,
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/pip/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["pip", URI.file("/cache/agentPlugins/pip/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg" }
      });
      const updated = await service.updatePlugin(plugin);
      assert.strictEqual(updated, false);
      assert.strictEqual(state.terminalCommands.length, 0);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
  });
  suite("updateAllPlugins", () => {
    function installedPlugin(name, marketplace) {
      const marketplaceReference = makeMarketplaceRef(marketplace);
      const plugin = createPlugin({
        name,
        marketplace,
        marketplaceReference,
        source: `plugins/${name}`,
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: `plugins/${name}` }
      });
      return { pluginUri: URI.file(`/plugins/${name}`), plugin };
    }
    test("updates only the targeted marketplace", async () => {
      const first = installedPlugin("first", "microsoft/first");
      const second = installedPlugin("second", "microsoft/second");
      const { service, state } = createService({ installedPlugins: [first, second] });
      await service.updateAllPlugins({
        silent: true,
        automatic: true,
        marketplaceIds: /* @__PURE__ */ new Set([first.plugin.marketplaceReference.canonicalId])
      }, CancellationToken.None);
      assert.deepStrictEqual({
        pulled: state.pullRepositoryCalls.map((call) => call.marketplace.canonicalId),
        fetched: state.fetchMarketplaceCalls
      }, {
        pulled: [first.plugin.marketplaceReference.canonicalId],
        fetched: [[first.plugin.marketplaceReference.canonicalId]]
      });
    });
    test("rechecks managed auto-update policy before an automatic update", async () => {
      const installed = installedPlugin("blocked", "microsoft/blocked");
      const { service, state } = createService({
        installedPlugins: [installed],
        autoUpdateByMarketplace: /* @__PURE__ */ new Map([[installed.plugin.marketplaceReference.canonicalId, false]])
      });
      await service.updateAllPlugins({
        silent: true,
        automatic: true,
        marketplaceIds: /* @__PURE__ */ new Set([installed.plugin.marketplaceReference.canonicalId])
      }, CancellationToken.None);
      assert.deepStrictEqual(state.pullRepositoryCalls, []);
      assert.deepStrictEqual(state.fetchMarketplaceCalls, []);
    });
    test("blocks updates when the strict marketplace policy disallows the source", async () => {
      const installed = installedPlugin("blocked", "microsoft/blocked");
      const { service, state } = createService({
        installedPlugins: [installed],
        strictMarketplacePolicyActive: true,
        marketplaceTrusted: false
      });
      const result = await service.updateAllPlugins({ silent: true }, CancellationToken.None);
      assert.deepStrictEqual(result.failedNames, [installed.plugin.marketplaceReference.displayLabel]);
      assert.deepStrictEqual(state.pullRepositoryCalls, []);
    });
  });
  suite("installPlugin \u2014 marketplace trust", () => {
    test("skips trust prompt when marketplace is already trusted", async () => {
      const { service, state } = createService({ marketplaceTrusted: true });
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.trustedMarketplaces.length, 0, "should not re-trust");
    });
    test("shows trust prompt and installs when user confirms", async () => {
      const { service, state } = createService({ marketplaceTrusted: false, dialogConfirmResult: true });
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.trustedMarketplaces.length, 1);
      assert.strictEqual(state.addedPlugins.length, 1);
    });
    test("does not install when user declines trust", async () => {
      const { service, state } = createService({ marketplaceTrusted: false, dialogConfirmResult: false });
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      await assert.rejects(() => service.installPlugin(plugin), (err) => isCancellationError(err));
      assert.strictEqual(state.trustedMarketplaces.length, 0);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("trust prompt applies to all source kinds", async () => {
      const { service, state } = createService({ marketplaceTrusted: false, dialogConfirmResult: false });
      const kinds = [
        { kind: PluginSourceKind.RelativePath, path: "p" },
        { kind: PluginSourceKind.GitHub, repo: "owner/repo" },
        { kind: PluginSourceKind.GitUrl, url: "https://example.com/repo.git" },
        { kind: PluginSourceKind.Npm, package: "my-pkg" },
        { kind: PluginSourceKind.Pip, package: "my-pkg" }
      ];
      for (const sourceDescriptor of kinds) {
        await assert.rejects(() => service.installPlugin(createPlugin({ sourceDescriptor })), (err) => isCancellationError(err));
      }
      assert.strictEqual(state.addedPlugins.length, 0, "no plugins should be installed when trust is declined");
    });
  });
  suite("installPluginFromSource", () => {
    test("rejects invalid source strings", async () => {
      const { service, state } = createService();
      const result = await service.installPluginFromSource("not a valid source");
      assert.strictEqual(result.success, false);
      assert.ok(result.message);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("validatePluginSource accepts git and local sources and rejects garbage", () => {
      const { service } = createService();
      assert.strictEqual(service.validatePluginSource("owner/repo"), void 0);
      assert.strictEqual(service.validatePluginSource("https://github.com/owner/repo.git"), void 0);
      assert.strictEqual(service.validatePluginSource("file:///some/path"), void 0);
      assert.strictEqual(service.validatePluginSource("/abs/path"), void 0);
      assert.strictEqual(service.validatePluginSource("~/plugins/foo"), void 0);
      assert.ok(service.validatePluginSource("not a valid source"));
    });
    test("installs a local folder marketplace and registers it under chat.plugins.marketplaces", async () => {
      const ref = makeMarketplaceRef("file:///some/marketplace");
      const discoveredPlugin = createPlugin({
        name: "local-marketplace-plugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.OpenPlugin
      });
      const { service, state } = createService({
        readPluginsResult: [discoveredPlugin]
      });
      await service.installPluginFromSource("file:///some/marketplace");
      assert.strictEqual(state.notifications.length, 0);
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.addedPlugins[0].plugin.name, "local-marketplace-plugin");
      assert.deepStrictEqual(state.updatedMarketplaces, ["file:///some/marketplace"]);
      assert.strictEqual(state.updatedPluginLocations, void 0);
    });
    test("does not persist a local marketplace to config when trust is declined", async () => {
      const ref = makeMarketplaceRef("file:///some/marketplace");
      const discoveredPlugin = createPlugin({
        name: "local-marketplace-plugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.OpenPlugin
      });
      const { service, state } = createService({
        readPluginsResult: [discoveredPlugin],
        marketplaceTrusted: false,
        dialogConfirmResult: false
      });
      const result = await service.installPluginFromSource("file:///some/marketplace");
      assert.strictEqual(result.success, false);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.updatedMarketplaces, void 0);
    });
    test("registers a local folder standalone plugin under chat.pluginLocations", async () => {
      const { service, state } = createService({
        readPluginsResult: [],
        isPluginDirectoryResult: true
      });
      await service.installPluginFromSource("/abs/my-plugin");
      assert.strictEqual(state.notifications.length, 0);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.deepStrictEqual(state.updatedPluginLocations, { "/abs/my-plugin": true });
      assert.strictEqual(state.updatedMarketplaces, void 0);
    });
    test("expands ~ paths but persists the original form in chat.pluginLocations", async () => {
      const { service, state } = createService({
        readPluginsResult: [],
        isPluginDirectoryResult: true,
        userHome: "/home/user"
      });
      await service.installPluginFromSource("~/my-plugin");
      assert.deepStrictEqual(state.updatedPluginLocations, { "~/my-plugin": true });
    });
    test("registers a file:// standalone plugin using its filesystem path", async () => {
      const { service, state } = createService({
        readPluginsResult: [],
        isPluginDirectoryResult: true
      });
      await service.installPluginFromSource("file:///some/plugin");
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.ok(state.updatedPluginLocations);
      assert.deepStrictEqual(Object.values(state.updatedPluginLocations), [true]);
      assert.strictEqual(Object.keys(state.updatedPluginLocations).length, 1);
    });
    test("shows error when local folder does not exist", async () => {
      const { service, state } = createService({
        resolveIsDirectory: false
      });
      const result = await service.installPluginFromSource("/abs/missing");
      assert.strictEqual(result.success, false);
      assert.ok(result.message);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.updatedPluginLocations, void 0);
    });
    test("shows error when local folder is neither a marketplace nor a plugin", async () => {
      const { service, state } = createService({
        readPluginsResult: [],
        isPluginDirectoryResult: false
      });
      const result = await service.installPluginFromSource("/abs/empty");
      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes("No plugin or marketplace found"));
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.updatedPluginLocations, void 0);
    });
    test("installs single plugin from GitHub shorthand with marketplace.json", async () => {
      const ref = makeMarketplaceRef("owner/my-plugin");
      const discoveredPlugin = createPlugin({
        name: "my-discovered-plugin",
        description: "A discovered plugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.OpenPlugin
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/my-plugin"),
        readPluginsResult: [discoveredPlugin]
      });
      await service.installPluginFromSource("owner/my-plugin");
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.addedPlugins[0].plugin.name, "my-discovered-plugin");
    });
    test("shows error when no marketplace.json found", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/cool-tool"),
        readPluginsResult: []
      });
      const result = await service.installPluginFromSource("owner/cool-tool");
      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes("No plugins found"));
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("shows quick pick for multi-plugin repos", async () => {
      const ref = makeMarketplaceRef("owner/multi-repo");
      const pluginA = createPlugin({
        name: "plugin-a",
        source: "plugins/a",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/a" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref
      });
      const pluginB = createPlugin({
        name: "plugin-b",
        source: "plugins/b",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/b" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/multi-repo"),
        readPluginsResult: [pluginA, pluginB],
        quickPickResult: { label: "plugin-b" }
      });
      await service.installPluginFromSource("owner/multi-repo");
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.addedPlugins[0].plugin.name, "plugin-b");
      assert.ok(state.addedPlugins[0].uri.includes("plugins/b"));
    });
    test("does not install when quick pick is cancelled", async () => {
      const ref = makeMarketplaceRef("owner/multi-repo");
      const pluginA = createPlugin({
        name: "plugin-a",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/a" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref
      });
      const pluginB = createPlugin({
        name: "plugin-b",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/b" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/multi-repo"),
        readPluginsResult: [pluginA, pluginB],
        quickPickResult: void 0
      });
      await service.installPluginFromSource("owner/multi-repo");
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("does not install when trust is declined", async () => {
      const { service, state } = createService({
        marketplaceTrusted: false,
        dialogConfirmResult: false,
        readPluginsResult: []
      });
      await service.installPluginFromSource("owner/repo");
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("shows error when no plugins found in git URL", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/my-tool"),
        readPluginsResult: []
      });
      const result = await service.installPluginFromSource("https://github.com/owner/my-tool.git");
      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes("No plugins found"));
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("shows error when clone directory does not exist", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/missing"),
        fileExistsResult: false
      });
      const result = await service.installPluginFromSource("owner/missing");
      assert.strictEqual(result.success, false);
      assert.ok(result.message);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("adds marketplace to config after installing single plugin", async () => {
      const ref = makeMarketplaceRef("owner/my-plugin");
      const discoveredPlugin = createPlugin({
        name: "my-discovered-plugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.OpenPlugin
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/my-plugin"),
        readPluginsResult: [discoveredPlugin]
      });
      await service.installPluginFromSource("owner/my-plugin");
      assert.deepStrictEqual(state.updatedMarketplaces, ["owner/my-plugin"]);
    });
    test("adds marketplace to config after picking from multi-plugin repo", async () => {
      const ref = makeMarketplaceRef("owner/multi-repo");
      const pluginA = createPlugin({
        name: "plugin-a",
        source: "plugins/a",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/a" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref
      });
      const pluginB = createPlugin({
        name: "plugin-b",
        source: "plugins/b",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/b" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/multi-repo"),
        readPluginsResult: [pluginA, pluginB],
        quickPickResult: { label: "plugin-a" }
      });
      await service.installPluginFromSource("owner/multi-repo");
      assert.deepStrictEqual(state.updatedMarketplaces, ["owner/multi-repo"]);
    });
    test("does not duplicate marketplace in config", async () => {
      const ref = makeMarketplaceRef("owner/my-plugin");
      const discoveredPlugin = createPlugin({
        name: "my-discovered-plugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.OpenPlugin
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/my-plugin"),
        readPluginsResult: [discoveredPlugin],
        configuredMarketplaces: ["owner/my-plugin"]
      });
      await service.installPluginFromSource("owner/my-plugin");
      assert.strictEqual(state.updatedMarketplaces, void 0);
    });
    test("falls back to single-plugin manifest when no marketplace.json exists", async () => {
      const ref = makeMarketplaceRef("owner/single-plugin-repo");
      const singlePlugin = createPlugin({
        name: "single-plugin-repo",
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/single-plugin-repo" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.Claude
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/single-plugin-repo"),
        readPluginsResult: [],
        singlePluginManifestResult: singlePlugin
      });
      await service.installPluginFromSource("owner/single-plugin-repo");
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.addedPlugins[0].plugin.name, "single-plugin-repo");
      assert.strictEqual(state.notifications.length, 0);
      assert.strictEqual(state.updatedMarketplaces, void 0);
    });
    test("reports error when single-plugin manifest name does not match options.plugin", async () => {
      const ref = makeMarketplaceRef("owner/single-plugin-repo");
      const singlePlugin = createPlugin({
        name: "actual-name",
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/single-plugin-repo" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.Claude
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/single-plugin-repo"),
        readPluginsResult: [],
        singlePluginManifestResult: singlePlugin
      });
      const result = await service.installPluginFromSource("owner/single-plugin-repo", { plugin: "requested-name" });
      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes("not found"));
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test('still reports "no plugins found" when neither marketplace.json nor single-plugin manifest exists', async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/empty-repo"),
        readPluginsResult: [],
        singlePluginManifestResult: void 0
      });
      const result = await service.installPluginFromSource("owner/empty-repo");
      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes("No plugins found"));
      assert.strictEqual(state.addedPlugins.length, 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3BsdWdpbnMvcGx1Z2luSW5zdGFsbFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgUGx1Z2luSW5zdGFsbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BsdWdpbkluc3RhbGxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLCBJRW5zdXJlUmVwb3NpdG9yeU9wdGlvbnMsIElQdWxsUmVwb3NpdG9yeU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTWFya2V0cGxhY2VJbnN0YWxsZWRQbHVnaW4sIElNYXJrZXRwbGFjZVBsdWdpbiwgSU1hcmtldHBsYWNlUmVmZXJlbmNlLCBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLCBJUGx1Z2luU291cmNlRGVzY3JpcHRvciwgTWFya2V0cGxhY2VUeXBlLCBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlLCBQbHVnaW5Tb3VyY2VLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQbHVnaW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGx1Z2lucy9wbHVnaW5Tb3VyY2UuanMnO1xuXG5zdWl0ZSgnUGx1Z2luSW5zdGFsbFNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tIEZhY3RvcnkgaGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0ZnVuY3Rpb24gbWFrZU1hcmtldHBsYWNlUmVmKG1hcmtldHBsYWNlOiBzdHJpbmcpOiBJTWFya2V0cGxhY2VSZWZlcmVuY2Uge1xuXHRcdGNvbnN0IHJlZiA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UobWFya2V0cGxhY2UpO1xuXHRcdGFzc2VydC5vayhyZWYpO1xuXHRcdHJldHVybiByZWYhO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlUGx1Z2luKG92ZXJyaWRlczogUGFydGlhbDxJTWFya2V0cGxhY2VQbHVnaW4+ICYgeyBzb3VyY2VEZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvciB9KTogSU1hcmtldHBsYWNlUGx1Z2luIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogb3ZlcnJpZGVzLm5hbWUgPz8gJ3Rlc3QtcGx1Z2luJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBvdmVycmlkZXMuZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHR2ZXJzaW9uOiBvdmVycmlkZXMudmVyc2lvbiA/PyAnJyxcblx0XHRcdHNvdXJjZTogb3ZlcnJpZGVzLnNvdXJjZSA/PyAnJyxcblx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IG92ZXJyaWRlcy5zb3VyY2VEZXNjcmlwdG9yLFxuXHRcdFx0bWFya2V0cGxhY2U6IG92ZXJyaWRlcy5tYXJrZXRwbGFjZSA/PyAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogb3ZlcnJpZGVzLm1hcmtldHBsYWNlUmVmZXJlbmNlID8/IG1ha2VNYXJrZXRwbGFjZVJlZignbWljcm9zb2Z0L3ZzY29kZScpLFxuXHRcdFx0bWFya2V0cGxhY2VUeXBlOiBvdmVycmlkZXMubWFya2V0cGxhY2VUeXBlID8/IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdFx0cmVhZG1lVXJpOiBvdmVycmlkZXMucmVhZG1lVXJpLFxuXHRcdH07XG5cdH1cblxuXHQvLyAtLS0gTW9jayB0cmFja2luZyB0eXBlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRpbnRlcmZhY2UgTW9ja1N0YXRlIHtcblx0XHRub3RpZmljYXRpb25zOiB7IHNldmVyaXR5OiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZyB9W107XG5cdFx0YWRkZWRQbHVnaW5zOiB7IHVyaTogc3RyaW5nOyBwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiB9W107XG5cdFx0ZGlhbG9nQ29uZmlybVJlc3VsdDogYm9vbGVhbjtcblx0XHRmaWxlRXhpc3RzUmVzdWx0OiBib29sZWFuIHwgKCh1cmk6IFVSSSkgPT4gUHJvbWlzZTxib29sZWFuPik7XG5cdFx0ZW5zdXJlUmVwb3NpdG9yeVJlc3VsdDogVVJJO1xuXHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJO1xuXHRcdC8qKiBQbHVnaW4gc291cmNlIGluc3RhbGwgVVJJLCBwZXIga2luZCAqL1xuXHRcdHBsdWdpblNvdXJjZUluc3RhbGxVcmlzOiBNYXA8c3RyaW5nLCBVUkk+O1xuXHRcdC8qKiBUaGUgY29tbWFuZHMgdGhhdCB3ZXJlIHNlbnQgdG8gdGhlIHRlcm1pbmFsICovXG5cdFx0dGVybWluYWxDb21tYW5kczogc3RyaW5nW107XG5cdFx0LyoqIFNpbXVsYXRlZCBleGl0IGNvZGUgZnJvbSB0ZXJtaW5hbCAqL1xuXHRcdHRlcm1pbmFsRXhpdENvZGU6IG51bWJlcjtcblx0XHQvKiogV2hldGhlciB0aGUgdGVybWluYWwgcmVzb2x2ZXMgdGhlIGNvbW1hbmQgY29tcGxldGlvbiBhdCBhbGwgKi9cblx0XHR0ZXJtaW5hbENvbXBsZXRlczogYm9vbGVhbjtcblx0XHRwdWxsUmVwb3NpdG9yeUNhbGxzOiB7IG1hcmtldHBsYWNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2U7IG9wdGlvbnM/OiBJUHVsbFJlcG9zaXRvcnlPcHRpb25zIH1bXTtcblx0XHR1cGRhdGVQbHVnaW5Tb3VyY2VDYWxsczogeyBwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbjsgb3B0aW9ucz86IElQdWxsUmVwb3NpdG9yeU9wdGlvbnMgfVtdO1xuXHRcdC8qKiBXaGV0aGVyIHRoZSBtYXJrZXRwbGFjZSBpcyBhbHJlYWR5IHRydXN0ZWQgKi9cblx0XHRtYXJrZXRwbGFjZVRydXN0ZWQ6IGJvb2xlYW47XG5cdFx0LyoqIFdoZXRoZXIgdGhlIHN0cmljdC1tYXJrZXRwbGFjZSBlbnRlcnByaXNlIHBvbGljeSBpcyBhY3RpdmUgKi9cblx0XHRzdHJpY3RNYXJrZXRwbGFjZVBvbGljeUFjdGl2ZT86IGJvb2xlYW47XG5cdFx0aW5zdGFsbGVkUGx1Z2luczogSU1hcmtldHBsYWNlSW5zdGFsbGVkUGx1Z2luW107XG5cdFx0ZmV0Y2hlZE1hcmtldHBsYWNlUGx1Z2luczogSU1hcmtldHBsYWNlUGx1Z2luW107XG5cdFx0ZmV0Y2hNYXJrZXRwbGFjZUNhbGxzOiBzdHJpbmdbXVtdO1xuXHRcdGF1dG9VcGRhdGVCeU1hcmtldHBsYWNlOiBNYXA8c3RyaW5nLCBib29sZWFuPjtcblx0XHRjbGVhclVwZGF0ZXNBdmFpbGFibGVDYWxsczogbnVtYmVyO1xuXHRcdC8qKiBDYW5vbmljYWwgSURzIHRoYXQgd2VyZSB0cnVzdGVkIHZpYSB0cnVzdE1hcmtldHBsYWNlKCkgKi9cblx0XHR0cnVzdGVkTWFya2V0cGxhY2VzOiBzdHJpbmdbXTtcblx0XHQvKiogUGx1Z2lucyByZXR1cm5lZCBieSByZWFkUGx1Z2luc0Zyb21EaXJlY3RvcnkgKi9cblx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogSU1hcmtldHBsYWNlUGx1Z2luW107XG5cdFx0LyoqIFBsdWdpbiByZXR1cm5lZCBieSByZWFkU2luZ2xlUGx1Z2luTWFuaWZlc3QgKHNpbmdsZS1wbHVnaW4gcmVwbyBmYWxsYmFjaykgKi9cblx0XHRzaW5nbGVQbHVnaW5NYW5pZmVzdFJlc3VsdDogSU1hcmtldHBsYWNlUGx1Z2luIHwgdW5kZWZpbmVkO1xuXHRcdC8qKiBSZXN1bHQgb2YgdGhlIHF1aWNrIHBpY2sgZGlhbG9nICovXG5cdFx0cXVpY2tQaWNrUmVzdWx0OiB7IGxhYmVsOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHQvKiogUmVzdWx0IG9mIHRoZSBxdWljayBpbnB1dCBkaWFsb2cgKi9cblx0XHRxdWlja0lucHV0UmVzdWx0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0LyoqIEN1cnJlbnQgY29uZmlndXJlZCBtYXJrZXRwbGFjZSB2YWx1ZXMgKi9cblx0XHRjb25maWd1cmVkTWFya2V0cGxhY2VzOiBzdHJpbmdbXTtcblx0XHQvKiogVXBkYXRlZCBtYXJrZXRwbGFjZSBjb25maWcgdmFsdWVzICovXG5cdFx0dXBkYXRlZE1hcmtldHBsYWNlczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdFx0LyoqIFdoZXRoZXIgcmVhZFJlc3VsdCByZXNvbHZlcyB0byBhIGRpcmVjdG9yeSAoSUZpbGVTZXJ2aWNlLnJlc29sdmUpICovXG5cdFx0cmVzb2x2ZUlzRGlyZWN0b3J5OiBib29sZWFuO1xuXHRcdC8qKiBXaGV0aGVyIHRoZSBkaXJlY3RvcnkgaXMgYSBzdGFuZGFsb25lIHBsdWdpbiAoaXNQbHVnaW5EaXJlY3RvcnkpICovXG5cdFx0aXNQbHVnaW5EaXJlY3RvcnlSZXN1bHQ6IGJvb2xlYW47XG5cdFx0LyoqIEN1cnJlbnQgY29uZmlndXJlZCBwbHVnaW4gbG9jYXRpb24gdmFsdWVzICovXG5cdFx0Y29uZmlndXJlZFBsdWdpbkxvY2F0aW9uczogUmVjb3JkPHN0cmluZywgYm9vbGVhbj47XG5cdFx0LyoqIFVwZGF0ZWQgcGx1Z2luIGxvY2F0aW9uIGNvbmZpZyB2YWx1ZXMgKi9cblx0XHR1cGRhdGVkUGx1Z2luTG9jYXRpb25zOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiB8IHVuZGVmaW5lZDtcblx0XHQvKiogVXNlciBob21lIGRpcmVjdG9yeSB1c2VkIHRvIGV4cGFuZCBgfmAgcGF0aHMgKi9cblx0XHR1c2VySG9tZTogc3RyaW5nO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlRGVmYXVsdHMoKTogTW9ja1N0YXRlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bm90aWZpY2F0aW9uczogW10sXG5cdFx0XHRhZGRlZFBsdWdpbnM6IFtdLFxuXHRcdFx0ZGlhbG9nQ29uZmlybVJlc3VsdDogdHJ1ZSxcblx0XHRcdGZpbGVFeGlzdHNSZXN1bHQ6IHRydWUsXG5cdFx0XHRlbnN1cmVSZXBvc2l0b3J5UmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnKSxcblx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvbnBtL215LXBhY2thZ2UnKSxcblx0XHRcdHBsdWdpblNvdXJjZUluc3RhbGxVcmlzOiBuZXcgTWFwKCksXG5cdFx0XHR0ZXJtaW5hbENvbW1hbmRzOiBbXSxcblx0XHRcdHRlcm1pbmFsRXhpdENvZGU6IDAsXG5cdFx0XHR0ZXJtaW5hbENvbXBsZXRlczogdHJ1ZSxcblx0XHRcdHB1bGxSZXBvc2l0b3J5Q2FsbHM6IFtdLFxuXHRcdFx0dXBkYXRlUGx1Z2luU291cmNlQ2FsbHM6IFtdLFxuXHRcdFx0bWFya2V0cGxhY2VUcnVzdGVkOiB0cnVlLFxuXHRcdFx0c3RyaWN0TWFya2V0cGxhY2VQb2xpY3lBY3RpdmU6IGZhbHNlLFxuXHRcdFx0aW5zdGFsbGVkUGx1Z2luczogW10sXG5cdFx0XHRmZXRjaGVkTWFya2V0cGxhY2VQbHVnaW5zOiBbXSxcblx0XHRcdGZldGNoTWFya2V0cGxhY2VDYWxsczogW10sXG5cdFx0XHRhdXRvVXBkYXRlQnlNYXJrZXRwbGFjZTogbmV3IE1hcCgpLFxuXHRcdFx0Y2xlYXJVcGRhdGVzQXZhaWxhYmxlQ2FsbHM6IDAsXG5cdFx0XHR0cnVzdGVkTWFya2V0cGxhY2VzOiBbXSxcblx0XHRcdHJlYWRQbHVnaW5zUmVzdWx0OiBbXSxcblx0XHRcdHNpbmdsZVBsdWdpbk1hbmlmZXN0UmVzdWx0OiB1bmRlZmluZWQsXG5cdFx0XHRxdWlja1BpY2tSZXN1bHQ6IHVuZGVmaW5lZCxcblx0XHRcdHF1aWNrSW5wdXRSZXN1bHQ6IHVuZGVmaW5lZCxcblx0XHRcdGNvbmZpZ3VyZWRNYXJrZXRwbGFjZXM6IFtdLFxuXHRcdFx0dXBkYXRlZE1hcmtldHBsYWNlczogdW5kZWZpbmVkLFxuXHRcdFx0cmVzb2x2ZUlzRGlyZWN0b3J5OiB0cnVlLFxuXHRcdFx0aXNQbHVnaW5EaXJlY3RvcnlSZXN1bHQ6IGZhbHNlLFxuXHRcdFx0Y29uZmlndXJlZFBsdWdpbkxvY2F0aW9uczoge30sXG5cdFx0XHR1cGRhdGVkUGx1Z2luTG9jYXRpb25zOiB1bmRlZmluZWQsXG5cdFx0XHR1c2VySG9tZTogJy9ob21lL3VzZXInLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKHN0YXRlT3ZlcnJpZGVzPzogUGFydGlhbDxNb2NrU3RhdGU+KTogeyBzZXJ2aWNlOiBQbHVnaW5JbnN0YWxsU2VydmljZTsgc3RhdGU6IE1vY2tTdGF0ZSB9IHtcblx0XHRjb25zdCBzdGF0ZTogTW9ja1N0YXRlID0geyAuLi5jcmVhdGVEZWZhdWx0cygpLCAuLi5zdGF0ZU92ZXJyaWRlcyB9O1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHQvLyBJRmlsZVNlcnZpY2Vcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge1xuXHRcdFx0ZXhpc3RzOiBhc3luYyAocmVzb3VyY2U6IFVSSSkgPT4ge1xuXHRcdFx0XHRpZiAodHlwZW9mIHN0YXRlLmZpbGVFeGlzdHNSZXN1bHQgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0XHRyZXR1cm4gc3RhdGUuZmlsZUV4aXN0c1Jlc3VsdChyZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN0YXRlLmZpbGVFeGlzdHNSZXN1bHQ7XG5cdFx0XHR9LFxuXHRcdFx0cmVzb2x2ZTogYXN5bmMgKHJlc291cmNlOiBVUkkpID0+ICh7IHJlc291cmNlLCBpc0RpcmVjdG9yeTogc3RhdGUucmVzb2x2ZUlzRGlyZWN0b3J5IH0pLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJRmlsZVNlcnZpY2UpO1xuXG5cdFx0Ly8gSU5vdGlmaWNhdGlvblNlcnZpY2Vcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRub3RpZnk6IChub3RpZmljYXRpb246IHsgc2V2ZXJpdHk6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nOyBhY3Rpb25zPzogeyBwcmltYXJ5PzogcmVhZG9ubHkgeyBkaXNwb3NlKCk6IHZvaWQgfVtdIH0gfSkgPT4ge1xuXHRcdFx0XHRzdGF0ZS5ub3RpZmljYXRpb25zLnB1c2goeyBzZXZlcml0eTogbm90aWZpY2F0aW9uLnNldmVyaXR5LCBtZXNzYWdlOiBub3RpZmljYXRpb24ubWVzc2FnZSB9KTtcblx0XHRcdFx0bm90aWZpY2F0aW9uLmFjdGlvbnM/LnByaW1hcnk/LmZvckVhY2goYWN0aW9uID0+IGFjdGlvbi5kaXNwb3NlKCkpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0Ly8gSURpYWxvZ1NlcnZpY2Vcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWFsb2dTZXJ2aWNlLCB7XG5cdFx0XHRjb25maXJtOiBhc3luYyAoKSA9PiAoeyBjb25maXJtZWQ6IHN0YXRlLmRpYWxvZ0NvbmZpcm1SZXN1bHQgfSksXG5cdFx0fSBhcyB1bmtub3duIGFzIElEaWFsb2dTZXJ2aWNlKTtcblxuXHRcdC8vIElUZXJtaW5hbFNlcnZpY2UgXHUyMDE0IHRoZSBtb2NrIGNvb3JkaW5hdGVzIHJ1bkNvbW1hbmQgYW5kIG9uQ29tbWFuZEZpbmlzaGVkXG5cdFx0Ly8gc28gdGhlIGNvbW1hbmQgSUQgbWF0Y2hlcywganVzdCBsaWtlIGEgcmVhbCB0ZXJtaW5hbCB3b3VsZC5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbFNlcnZpY2UsIHtcblx0XHRcdGNyZWF0ZVRlcm1pbmFsOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxldCBmaW5pc2hlZENhbGxiYWNrOiAoKGNtZDogeyBpZDogc3RyaW5nOyBleGl0Q29kZTogbnVtYmVyIH0pID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHByb2Nlc3NSZWFkeTogUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0XHRcdHJ1bkNvbW1hbmQ6IChjb21tYW5kOiBzdHJpbmcsIF9hZGROZXdMaW5lPzogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRcdFx0c3RhdGUudGVybWluYWxDb21tYW5kcy5wdXNoKGNvbW1hbmQpO1xuXHRcdFx0XHRcdFx0Ly8gU2ltdWxhdGUgY29tbWFuZCBjb21wbGV0aW5nIGFmdGVyIHJ1bkNvbW1hbmQgaXMgY2FsbGVkXG5cdFx0XHRcdFx0XHRpZiAoZmluaXNoZWRDYWxsYmFjaykge1xuXHRcdFx0XHRcdFx0XHRmaW5pc2hlZENhbGxiYWNrKHsgaWQ6ICdjb21tYW5kJywgZXhpdENvZGU6IHN0YXRlLnRlcm1pbmFsRXhpdENvZGUgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0XHRcdGdldDogKCkgPT4gc3RhdGUudGVybWluYWxDb21wbGV0ZXMgPyB7XG5cdFx0XHRcdFx0XHRcdG9uQ29tbWFuZEZpbmlzaGVkOiAoY2FsbGJhY2s6IChjbWQ6IHsgaWQ6IHN0cmluZzsgZXhpdENvZGU6IG51bWJlciB9KSA9PiB2b2lkKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0ZmluaXNoZWRDYWxsYmFjayA9IGNhbGxiYWNrO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB7IGRpc3Bvc2UoKSB7IH0gfTtcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRvbkRpZEFkZENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5OiAoKSA9PiAoeyBkaXNwb3NlKCkgeyB9IH0pLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdFx0c2V0QWN0aXZlSW5zdGFuY2U6ICgpID0+IHsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsU2VydmljZSk7XG5cblx0XHQvLyBJUHJvZ3Jlc3NTZXJ2aWNlXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCB7XG5cdFx0XHR3aXRoUHJvZ3Jlc3M6IGFzeW5jIChfb3B0aW9uczogdW5rbm93biwgY2FsbGJhY2s6ICguLi5hcmdzOiB1bmtub3duW10pID0+IFByb21pc2U8dW5rbm93bj4pID0+IGNhbGxiYWNrKCksXG5cdFx0fSBhcyB1bmtub3duIGFzIElQcm9ncmVzc1NlcnZpY2UpO1xuXG5cdFx0Ly8gSUxvZ1NlcnZpY2Vcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHQvLyBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZVxuXHRcdC8vIEJ1aWxkIG1vY2sgc291cmNlIHJlcG9zaXRvcmllcyBmb3IgbnBtL3BpcCB0aGF0IHNpbXVsYXRlIHRlcm1pbmFsLWJhc2VkIGluc3RhbGxcblx0XHRjb25zdCBtYWtlTW9ja1BhY2thZ2VSZXBvID0gKGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQpOiBJUGx1Z2luU291cmNlID0+ICh7XG5cdFx0XHRraW5kLFxuXHRcdFx0Z2V0Q2xlYW51cFRhcmdldDogKCkgPT4gVVJJLmZpbGUoJy9tb2NrLWNsZWFudXAnKSxcblx0XHRcdGdldEluc3RhbGxVcmk6ICgpID0+IFVSSS5maWxlKCcvbW9jaycpLFxuXHRcdFx0ZW5zdXJlOiBhc3luYyAoKSA9PiBzdGF0ZS5lbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQsXG5cdFx0XHR1cGRhdGU6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0XHRnZXRMYWJlbDogKGQpID0+IGtpbmQgPT09IFBsdWdpblNvdXJjZUtpbmQuTnBtID8gKGQgYXMgeyBwYWNrYWdlOiBzdHJpbmcgfSkucGFja2FnZSA6IChkIGFzIHsgcGFja2FnZTogc3RyaW5nIH0pLnBhY2thZ2UsXG5cdFx0XHRydW5JbnN0YWxsOiBhc3luYyAoX2luc3RhbGxEaXI6IFVSSSwgcGx1Z2luRGlyOiBVUkksIHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luKSA9PiB7XG5cdFx0XHRcdC8vIFNpbXVsYXRlIGNvbmZpcm1hdGlvbiBkaWFsb2dcblx0XHRcdFx0aWYgKCFzdGF0ZS5kaWFsb2dDb25maXJtUmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNpbXVsYXRlIGJ1aWxkaW5nIGFuZCBydW5uaW5nIHRoZSBjb21tYW5kXG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0b3IgPSBwbHVnaW4uc291cmNlRGVzY3JpcHRvcjtcblx0XHRcdFx0bGV0IGFyZ3M6IHN0cmluZ1tdO1xuXHRcdFx0XHRpZiAoa2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5OcG0pIHtcblx0XHRcdFx0XHRjb25zdCBucG0gPSBkZXNjcmlwdG9yIGFzIHsgcGFja2FnZTogc3RyaW5nOyB2ZXJzaW9uPzogc3RyaW5nOyByZWdpc3RyeT86IHN0cmluZyB9O1xuXHRcdFx0XHRcdGNvbnN0IHBhY2thZ2VTcGVjID0gbnBtLnZlcnNpb24gPyBgJHtucG0ucGFja2FnZX1AJHtucG0udmVyc2lvbn1gIDogbnBtLnBhY2thZ2U7XG5cdFx0XHRcdFx0YXJncyA9IFsnbnBtJywgJ2luc3RhbGwnLCAnLS1wcmVmaXgnLCBfaW5zdGFsbERpci5mc1BhdGgsIHBhY2thZ2VTcGVjXTtcblx0XHRcdFx0XHRpZiAobnBtLnJlZ2lzdHJ5KSB7XG5cdFx0XHRcdFx0XHRhcmdzLnB1c2goJy0tcmVnaXN0cnknLCBucG0ucmVnaXN0cnkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBwaXAgPSBkZXNjcmlwdG9yIGFzIHsgcGFja2FnZTogc3RyaW5nOyB2ZXJzaW9uPzogc3RyaW5nOyByZWdpc3RyeT86IHN0cmluZyB9O1xuXHRcdFx0XHRcdGNvbnN0IHBhY2thZ2VTcGVjID0gcGlwLnZlcnNpb24gPyBgJHtwaXAucGFja2FnZX09PSR7cGlwLnZlcnNpb259YCA6IHBpcC5wYWNrYWdlO1xuXHRcdFx0XHRcdGFyZ3MgPSBbJ3BpcCcsICdpbnN0YWxsJywgJy0tdGFyZ2V0JywgX2luc3RhbGxEaXIuZnNQYXRoLCBwYWNrYWdlU3BlY107XG5cdFx0XHRcdFx0aWYgKHBpcC5yZWdpc3RyeSkge1xuXHRcdFx0XHRcdFx0YXJncy5wdXNoKCctLWluZGV4LXVybCcsIHBpcC5yZWdpc3RyeSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBhcmdzLmpvaW4oJyAnKTtcblx0XHRcdFx0c3RhdGUudGVybWluYWxDb21tYW5kcy5wdXNoKGNvbW1hbmQpO1xuXG5cdFx0XHRcdGlmIChzdGF0ZS50ZXJtaW5hbEV4aXRDb2RlICE9PSAwKSB7XG5cdFx0XHRcdFx0c3RhdGUubm90aWZpY2F0aW9ucy5wdXNoKHsgc2V2ZXJpdHk6IDMsIG1lc3NhZ2U6IGBQbHVnaW4gaW5zdGFsbGF0aW9uIGNvbW1hbmQgZmFpbGVkOiBDb21tYW5kIGV4aXRlZCB3aXRoIGNvZGUgJHtzdGF0ZS50ZXJtaW5hbEV4aXRDb2RlfWAgfSk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENoZWNrIGlmIHBsdWdpbiBkaXIgZXhpc3RzXG5cdFx0XHRcdGNvbnN0IGV4aXN0cyA9IHR5cGVvZiBzdGF0ZS5maWxlRXhpc3RzUmVzdWx0ID09PSAnZnVuY3Rpb24nXG5cdFx0XHRcdFx0PyBhd2FpdCBzdGF0ZS5maWxlRXhpc3RzUmVzdWx0KHBsdWdpbkRpcilcblx0XHRcdFx0XHQ6IHN0YXRlLmZpbGVFeGlzdHNSZXN1bHQ7XG5cdFx0XHRcdGlmICghZXhpc3RzKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBraW5kID09PSBQbHVnaW5Tb3VyY2VLaW5kLk5wbSA/ICducG0nIDogJ3BpcCc7XG5cdFx0XHRcdFx0Y29uc3QgcGtnID0gKGRlc2NyaXB0b3IgYXMgeyBwYWNrYWdlOiBzdHJpbmcgfSkucGFja2FnZTtcblx0XHRcdFx0XHRzdGF0ZS5ub3RpZmljYXRpb25zLnB1c2goeyBzZXZlcml0eTogMywgbWVzc2FnZTogYCR7bGFiZWx9IHBhY2thZ2UgJyR7cGtnfScgd2FzIG5vdCBmb3VuZCBhZnRlciBpbnN0YWxsYXRpb24uYCB9KTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHsgcGx1Z2luRGlyIH07XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbW9ja1NvdXJjZVJlcG9zID0gbmV3IE1hcDxQbHVnaW5Tb3VyY2VLaW5kLCBJUGx1Z2luU291cmNlPihbXG5cdFx0XHRbUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIGdldENsZWFudXBUYXJnZXQ6ICgpID0+IHVuZGVmaW5lZCwgZ2V0SW5zdGFsbFVyaTogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoKTsgfSwgZW5zdXJlOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9LCB1cGRhdGU6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCk7IH0sIGdldExhYmVsOiAoZCkgPT4gKGQgYXMgeyBwYXRoOiBzdHJpbmcgfSkucGF0aCB8fCAnLicgfV0sXG5cdFx0XHRbUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIGdldENsZWFudXBUYXJnZXQ6ICgpID0+IFVSSS5maWxlKCcvbW9jaycpLCBnZXRJbnN0YWxsVXJpOiAoKSA9PiBVUkkuZmlsZSgnL21vY2snKSwgZW5zdXJlOiBhc3luYyAoKSA9PiBVUkkuZmlsZSgnL21vY2snKSwgdXBkYXRlOiBhc3luYyAoKSA9PiB0cnVlLCBnZXRMYWJlbDogKGQpID0+IChkIGFzIHsgcmVwbzogc3RyaW5nIH0pLnJlcG8gfV0sXG5cdFx0XHRbUGx1Z2luU291cmNlS2luZC5HaXRVcmwsIHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRVcmwsIGdldENsZWFudXBUYXJnZXQ6ICgpID0+IFVSSS5maWxlKCcvbW9jaycpLCBnZXRJbnN0YWxsVXJpOiAoKSA9PiBVUkkuZmlsZSgnL21vY2snKSwgZW5zdXJlOiBhc3luYyAoKSA9PiBVUkkuZmlsZSgnL21vY2snKSwgdXBkYXRlOiBhc3luYyAoKSA9PiB0cnVlLCBnZXRMYWJlbDogKGQpID0+IChkIGFzIHsgdXJsOiBzdHJpbmcgfSkudXJsIH1dLFxuXHRcdFx0W1BsdWdpblNvdXJjZUtpbmQuTnBtLCBtYWtlTW9ja1BhY2thZ2VSZXBvKFBsdWdpblNvdXJjZUtpbmQuTnBtKV0sXG5cdFx0XHRbUGx1Z2luU291cmNlS2luZC5QaXAsIG1ha2VNb2NrUGFja2FnZVJlcG8oUGx1Z2luU291cmNlS2luZC5QaXApXSxcblx0XHRdKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UsIHtcblx0XHRcdGdldFBsdWdpbkluc3RhbGxVcmk6IChwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbikgPT4ge1xuXHRcdFx0XHRpZiAocGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZCAhPT0gUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgpIHtcblx0XHRcdFx0XHRyZXR1cm4gc3RhdGUucGx1Z2luU291cmNlSW5zdGFsbFVyaXMuZ2V0KHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmQpID8/IFVSSS5maWxlKGAvY2FjaGUvYWdlbnRQbHVnaW5zLyR7cGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZH0vZGVmYXVsdGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBVUkkuam9pblBhdGgoc3RhdGUuZW5zdXJlUmVwb3NpdG9yeVJlc3VsdCwgcGx1Z2luLnNvdXJjZSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0UmVwb3NpdG9yeVVyaTogKCkgPT4gc3RhdGUuZW5zdXJlUmVwb3NpdG9yeVJlc3VsdCxcblx0XHRcdGVuc3VyZVJlcG9zaXRvcnk6IGFzeW5jIChfbWFya2V0cGxhY2U6IElNYXJrZXRwbGFjZVJlZmVyZW5jZSwgX29wdGlvbnM/OiBJRW5zdXJlUmVwb3NpdG9yeU9wdGlvbnMpID0+IHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlLmVuc3VyZVJlcG9zaXRvcnlSZXN1bHQ7XG5cdFx0XHR9LFxuXHRcdFx0cHVsbFJlcG9zaXRvcnk6IGFzeW5jIChtYXJrZXRwbGFjZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlLCBvcHRpb25zPzogSVB1bGxSZXBvc2l0b3J5T3B0aW9ucykgPT4ge1xuXHRcdFx0XHRzdGF0ZS5wdWxsUmVwb3NpdG9yeUNhbGxzLnB1c2goeyBtYXJrZXRwbGFjZSwgb3B0aW9ucyB9KTtcblx0XHRcdH0sXG5cdFx0XHRnZXRQbHVnaW5Tb3VyY2VJbnN0YWxsVXJpOiAoZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gZGVzY3JpcHRvci5raW5kO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGUucGx1Z2luU291cmNlSW5zdGFsbFVyaXMuZ2V0KGtleSkgPz8gVVJJLmZpbGUoYC9jYWNoZS9hZ2VudFBsdWdpbnMvJHtrZXl9L2RlZmF1bHRgKTtcblx0XHRcdH0sXG5cdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2U6IGFzeW5jICgpID0+IHN0YXRlLmVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdCxcblx0XHRcdHVwZGF0ZVBsdWdpblNvdXJjZTogYXN5bmMgKHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luLCBvcHRpb25zPzogSVB1bGxSZXBvc2l0b3J5T3B0aW9ucykgPT4ge1xuXHRcdFx0XHRzdGF0ZS51cGRhdGVQbHVnaW5Tb3VyY2VDYWxscy5wdXNoKHsgcGx1Z2luLCBvcHRpb25zIH0pO1xuXHRcdFx0fSxcblx0XHRcdGdldFBsdWdpblNvdXJjZTogKGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQpID0+IG1vY2tTb3VyY2VSZXBvcy5nZXQoa2luZCkhLFxuXHRcdFx0Y2xlYW51cFBsdWdpblNvdXJjZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSk7XG5cblx0XHQvLyBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLCB7XG5cdFx0XHRpbnN0YWxsZWRQbHVnaW5zOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuaW5zdGFsbGVkUGx1Z2lucycsIHN0YXRlLmluc3RhbGxlZFBsdWdpbnMpLFxuXHRcdFx0YWRkSW5zdGFsbGVkUGx1Z2luOiAodXJpOiBVUkksIHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luKSA9PiB7XG5cdFx0XHRcdHN0YXRlLmFkZGVkUGx1Z2lucy5wdXNoKHsgdXJpOiB1cmkudG9TdHJpbmcoKSwgcGx1Z2luIH0pO1xuXHRcdFx0fSxcblx0XHRcdGlzTWFya2V0cGxhY2VUcnVzdGVkOiAoKSA9PiBzdGF0ZS5tYXJrZXRwbGFjZVRydXN0ZWQsXG5cdFx0XHRpc1N0cmljdE1hcmtldHBsYWNlUG9saWN5QWN0aXZlOiAoKSA9PiBzdGF0ZS5zdHJpY3RNYXJrZXRwbGFjZVBvbGljeUFjdGl2ZSA/PyBmYWxzZSxcblx0XHRcdGlzTWFya2V0cGxhY2VBdXRvVXBkYXRlRW5hYmxlZDogKHJlZjogSU1hcmtldHBsYWNlUmVmZXJlbmNlKSA9PiBzdGF0ZS5hdXRvVXBkYXRlQnlNYXJrZXRwbGFjZS5nZXQocmVmLmNhbm9uaWNhbElkKSA/PyB0cnVlLFxuXHRcdFx0ZmV0Y2hNYXJrZXRwbGFjZVBsdWdpbnM6IGFzeW5jIChfdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBtYXJrZXRwbGFjZUlkcz86IFJlYWRvbmx5U2V0PHN0cmluZz4pID0+IHtcblx0XHRcdFx0c3RhdGUuZmV0Y2hNYXJrZXRwbGFjZUNhbGxzLnB1c2goWy4uLm1hcmtldHBsYWNlSWRzID8/IFtdXSk7XG5cdFx0XHRcdHJldHVybiBzdGF0ZS5mZXRjaGVkTWFya2V0cGxhY2VQbHVnaW5zLmZpbHRlcihwbHVnaW4gPT4gIW1hcmtldHBsYWNlSWRzIHx8IG1hcmtldHBsYWNlSWRzLmhhcyhwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UuY2Fub25pY2FsSWQpKTtcblx0XHRcdH0sXG5cdFx0XHRjbGVhclVwZGF0ZXNBdmFpbGFibGU6ICgpID0+IHN0YXRlLmNsZWFyVXBkYXRlc0F2YWlsYWJsZUNhbGxzKyssXG5cdFx0XHR0cnVzdE1hcmtldHBsYWNlOiAocmVmOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UpID0+IHtcblx0XHRcdFx0c3RhdGUudHJ1c3RlZE1hcmtldHBsYWNlcy5wdXNoKHJlZi5jYW5vbmljYWxJZCk7XG5cdFx0XHR9LFxuXHRcdFx0cmVhZFBsdWdpbnNGcm9tRGlyZWN0b3J5OiBhc3luYyAoKSA9PiBzdGF0ZS5yZWFkUGx1Z2luc1Jlc3VsdCxcblx0XHRcdHJlYWRTaW5nbGVQbHVnaW5NYW5pZmVzdDogYXN5bmMgKCkgPT4gc3RhdGUuc2luZ2xlUGx1Z2luTWFuaWZlc3RSZXN1bHQsXG5cdFx0XHRpc1BsdWdpbkRpcmVjdG9yeTogYXN5bmMgKCkgPT4gc3RhdGUuaXNQbHVnaW5EaXJlY3RvcnlSZXN1bHQsXG5cdFx0fSBhcyB1bmtub3duIGFzIElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UpO1xuXG5cdFx0Ly8gSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIHtcblx0XHRcdGdldFZhbHVlOiAoa2V5OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0aWYgKGtleSA9PT0gQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHN0YXRlLmNvbmZpZ3VyZWRNYXJrZXRwbGFjZXM7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGtleSA9PT0gQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTG9jYXRpb25zKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHN0YXRlLmNvbmZpZ3VyZWRQbHVnaW5Mb2NhdGlvbnM7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRpbnNwZWN0OiAoa2V5OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0aWYgKGtleSA9PT0gQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdXNlclZhbHVlOiBzdGF0ZS5jb25maWd1cmVkTWFya2V0cGxhY2VzLCBkZWZhdWx0VmFsdWU6IHVuZGVmaW5lZCwgcG9saWN5VmFsdWU6IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChrZXkgPT09IENoYXRDb25maWd1cmF0aW9uLlBsdWdpbkxvY2F0aW9ucykge1xuXHRcdFx0XHRcdHJldHVybiB7IHVzZXJWYWx1ZTogc3RhdGUuY29uZmlndXJlZFBsdWdpbkxvY2F0aW9ucywgZGVmYXVsdFZhbHVlOiB1bmRlZmluZWQsIHBvbGljeVZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyB1c2VyVmFsdWU6IHVuZGVmaW5lZCwgZGVmYXVsdFZhbHVlOiB1bmRlZmluZWQsIHBvbGljeVZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHRcdH0sXG5cdFx0XHR1cGRhdGVWYWx1ZTogYXN5bmMgKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRpZiAoa2V5ID09PSBDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5NYXJrZXRwbGFjZXMpIHtcblx0XHRcdFx0XHRzdGF0ZS51cGRhdGVkTWFya2V0cGxhY2VzID0gdmFsdWUgYXMgc3RyaW5nW107XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGtleSA9PT0gQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTG9jYXRpb25zKSB7XG5cdFx0XHRcdFx0c3RhdGUudXBkYXRlZFBsdWdpbkxvY2F0aW9ucyA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+O1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Ly8gSVBhdGhTZXJ2aWNlXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUGF0aFNlcnZpY2UsIHtcblx0XHRcdHVzZXJIb21lOiBhc3luYyAoKSA9PiBVUkkuZmlsZShzdGF0ZS51c2VySG9tZSksXG5cdFx0fSBhcyB1bmtub3duIGFzIElQYXRoU2VydmljZSk7XG5cblx0XHQvLyBJUXVpY2tJbnB1dFNlcnZpY2Vcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElRdWlja0lucHV0U2VydmljZSwge1xuXHRcdFx0aW5wdXQ6IGFzeW5jICgpID0+IHN0YXRlLnF1aWNrSW5wdXRSZXN1bHQsXG5cdFx0XHRwaWNrOiBhc3luYyAocGlja3M6IHsgbGFiZWw6IHN0cmluZyB9W10pID0+IHtcblx0XHRcdFx0aWYgKCFzdGF0ZS5xdWlja1BpY2tSZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBwaWNrcy5maW5kKHAgPT4gcC5sYWJlbCA9PT0gc3RhdGUucXVpY2tQaWNrUmVzdWx0IS5sYWJlbCk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBsdWdpbkluc3RhbGxTZXJ2aWNlKTtcblx0XHRyZXR1cm4geyBzZXJ2aWNlLCBzdGF0ZSB9O1xuXHR9XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBnZXRQbHVnaW5JbnN0YWxsVXJpXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuXHRzdWl0ZSgnZ2V0UGx1Z2luSW5zdGFsbFVyaScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2RlbGVnYXRlcyB0byBnZXRQbHVnaW5JbnN0YWxsVXJpIGZvciByZWxhdGl2ZS1wYXRoIHBsdWdpbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZTogJ3BsdWdpbnMvbXlQbHVnaW4nLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncGx1Z2lucy9teVBsdWdpbicgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgdXJpID0gc2VydmljZS5nZXRQbHVnaW5JbnN0YWxsVXJpKHBsdWdpbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wbHVnaW5zL215UGx1Z2luJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxlZ2F0ZXMgdG8gZ2V0UGx1Z2luU291cmNlSW5zdGFsbFVyaSBmb3IgbnBtIHBsdWdpbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBucG1VcmkgPSBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9ucG0vbXktcGtnL25vZGVfbW9kdWxlcy9teS1wa2cnKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdHBsdWdpblNvdXJjZUluc3RhbGxVcmlzOiBuZXcgTWFwKFtbJ25wbScsIG5wbVVyaV1dKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgcGFja2FnZTogJ215LXBrZycgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgdXJpID0gc2VydmljZS5nZXRQbHVnaW5JbnN0YWxsVXJpKHBsdWdpbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsIG5wbVVyaS5wYXRoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGVnYXRlcyB0byBnZXRQbHVnaW5Tb3VyY2VJbnN0YWxsVXJpIGZvciBwaXAgcGx1Z2lucycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBpcFVyaSA9IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL3BpcC9teS1wa2cnKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdHBsdWdpblNvdXJjZUluc3RhbGxVcmlzOiBuZXcgTWFwKFtbJ3BpcCcsIHBpcFVyaV1dKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlBpcCwgcGFja2FnZTogJ215LXBrZycgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgdXJpID0gc2VydmljZS5nZXRQbHVnaW5JbnN0YWxsVXJpKHBsdWdpbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsIHBpcFVyaS5wYXRoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGVnYXRlcyB0byBnZXRQbHVnaW5Tb3VyY2VJbnN0YWxsVXJpIGZvciBnaXRodWIgcGx1Z2lucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGdoVXJpID0gVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvZ2l0aHViLmNvbS9vd25lci9yZXBvJyk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRwbHVnaW5Tb3VyY2VJbnN0YWxsVXJpczogbmV3IE1hcChbWydnaXRodWInLCBnaFVyaV1dKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHVyaSA9IHNlcnZpY2UuZ2V0UGx1Z2luSW5zdGFsbFVyaShwbHVnaW4pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5wYXRoLCBnaFVyaS5wYXRoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBpbnN0YWxsUGx1Z2luIFx1MjAxNCByZWxhdGl2ZSBwYXRoXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuXHRzdWl0ZSgnaW5zdGFsbFBsdWdpbiBcdTIwMTQgcmVsYXRpdmUgcGF0aCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2luc3RhbGxzIGEgcmVsYXRpdmUtcGF0aCBwbHVnaW4gd2hlbiBkaXJlY3RvcnkgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlOiAncGx1Z2lucy9teVBsdWdpbicsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICdwbHVnaW5zL215UGx1Z2luJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUuYWRkZWRQbHVnaW5zWzBdLnVyaS5pbmNsdWRlcygncGx1Z2lucy9teVBsdWdpbicpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5ub3RpZmljYXRpb25zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub3RpZmllcyBlcnJvciB3aGVuIHBsdWdpbiBkaXJlY3RvcnkgZG9lcyBub3QgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHsgZmlsZUV4aXN0c1Jlc3VsdDogZmFsc2UgfSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2U6ICdwbHVnaW5zL21pc3NpbmcnLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncGx1Z2lucy9taXNzaW5nJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUubm90aWZpY2F0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLm5vdGlmaWNhdGlvbnNbMF0ubWVzc2FnZS5pbmNsdWRlcygnbm90IGZvdW5kJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgaW5zdGFsbCB3aGVuIGVuc3VyZVJlcG9zaXRvcnkgdGhyb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0Ly8gT3ZlcnJpZGUgZW5zdXJlUmVwb3NpdG9yeSB0byB0aHJvd1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHJlcG9TZXJ2aWNlID0ge1xuXHRcdFx0XHRlbnN1cmVSZXBvc2l0b3J5OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignY2xvbmUgZmFpbGVkJyk7IH0sXG5cdFx0XHRcdGdldFBsdWdpbkluc3RhbGxVcmk6ICgpID0+IFVSSS5maWxlKCcveCcpLFxuXHRcdFx0XHRnZXRQbHVnaW5Tb3VyY2VJbnN0YWxsVXJpOiAoKSA9PiBVUkkuZmlsZSgnL3gnKSxcblx0XHRcdH07XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLCByZXBvU2VydmljZSBhcyB1bmtub3duIGFzIElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCB7IGV4aXN0czogYXN5bmMgKCkgPT4gdHJ1ZSB9IGFzIHVua25vd24gYXMgSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIHsgbm90aWZ5OiAobjogeyBzZXZlcml0eTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmcgfSkgPT4geyBzdGF0ZS5ub3RpZmljYXRpb25zLnB1c2gobik7IH0gfSBhcyB1bmtub3duIGFzIElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpYWxvZ1NlcnZpY2UsIHsgY29uZmlybTogYXN5bmMgKCkgPT4gKHsgY29uZmlybWVkOiB0cnVlIH0pIH0gYXMgdW5rbm93biBhcyBJRGlhbG9nU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbFNlcnZpY2UsIHt9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIHsgd2l0aFByb2dyZXNzOiBhc3luYyAoX286IHVua25vd24sIGNiOiAoKSA9PiBQcm9taXNlPHVua25vd24+KSA9PiBjYigpIH0gYXMgdW5rbm93biBhcyBJUHJvZ3Jlc3NTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSwgeyBhZGRJbnN0YWxsZWRQbHVnaW46ICgpID0+IHsgfSB9IGFzIHVua25vd24gYXMgSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsICdpc01hcmtldHBsYWNlVHJ1c3RlZCcsICgpID0+IHRydWUpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLCAndHJ1c3RNYXJrZXRwbGFjZScsICgpID0+IHsgfSk7XG5cdFx0XHRjb25zdCBzdmMgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQbHVnaW5JbnN0YWxsU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZTogJ3BsdWdpbnMvbXlQbHVnaW4nLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncGx1Z2lucy9teVBsdWdpbicgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgc3ZjLmluc3RhbGxQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0Ly8gU2hvdWxkIHJldHVybiB3aXRob3V0IGluc3RhbGxpbmcgb3IgY3Jhc2hpbmdcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBpbnN0YWxsUGx1Z2luIFx1MjAxNCBHaXRIdWIgLyBHaXRVcmxcblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHN1aXRlKCdpbnN0YWxsUGx1Z2luIFx1MjAxNCBnaXQgc291cmNlcycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2luc3RhbGxzIGEgR2l0SHViIHBsdWdpbiB3aGVuIHNvdXJjZSBleGlzdHMgYWZ0ZXIgY2xvbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL293bmVyL3JlcG8nKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5ub3RpZmljYXRpb25zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnN0YWxscyBhIEdpdFVybCBwbHVnaW4gd2hlbiBzb3VyY2UgZXhpc3RzIGFmdGVyIGNsb25lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvZXhhbXBsZS5jb20vcmVwbycpLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0VXJsLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3JlcG8uZ2l0JyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUubm90aWZpY2F0aW9ucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm90aWZpZXMgZXJyb3Igd2hlbiBjbG9uZWQgZGlyZWN0b3J5IGRvZXMgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGZpbGVFeGlzdHNSZXN1bHQ6IGZhbHNlLFxuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvcmVwbycpLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm5vdGlmaWNhdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZS5ub3RpZmljYXRpb25zWzBdLm1lc3NhZ2UuaW5jbHVkZXMoJ25vdCBmb3VuZCcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBpbnN0YWxsUGx1Z2luIFx1MjAxNCBucG1cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHN1aXRlKCdpbnN0YWxsUGx1Z2luIFx1MjAxNCBucG0nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdydW5zIG5wbSBpbnN0YWxsIGFuZCByZWdpc3RlcnMgcGx1Z2luIG9uIHN1Y2Nlc3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBucG1JbnN0YWxsVXJpID0gVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvbnBtL215LXBrZy9ub2RlX21vZHVsZXMvbXktcGtnJyk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9ucG0vbXktcGtnJyksXG5cdFx0XHRcdHBsdWdpblNvdXJjZUluc3RhbGxVcmlzOiBuZXcgTWFwKFtbJ25wbScsIG5wbUluc3RhbGxVcmldXSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5OcG0sIHBhY2thZ2U6ICdteS1wa2cnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50ZXJtaW5hbENvbW1hbmRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUudGVybWluYWxDb21tYW5kc1swXS5pbmNsdWRlcygnbnBtJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHNbMF0uaW5jbHVkZXMoJ2luc3RhbGwnKSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUudGVybWluYWxDb21tYW5kc1swXS5pbmNsdWRlcygnbXktcGtnJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm5vdGlmaWNhdGlvbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIHZlcnNpb24gaW4gbnBtIGluc3RhbGwgY29tbWFuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL25wbS9teS1wa2cnKSxcblx0XHRcdFx0cGx1Z2luU291cmNlSW5zdGFsbFVyaXM6IG5ldyBNYXAoW1snbnBtJywgVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvbnBtL215LXBrZy9ub2RlX21vZHVsZXMvbXktcGtnJyldXSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5OcG0sIHBhY2thZ2U6ICdteS1wa2cnLCB2ZXJzaW9uOiAnMS4yLjMnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50ZXJtaW5hbENvbW1hbmRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUudGVybWluYWxDb21tYW5kc1swXS5pbmNsdWRlcygnbXktcGtnQDEuMi4zJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgcmVnaXN0cnkgaW4gbnBtIGluc3RhbGwgY29tbWFuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL25wbS9teS1wa2cnKSxcblx0XHRcdFx0cGx1Z2luU291cmNlSW5zdGFsbFVyaXM6IG5ldyBNYXAoW1snbnBtJywgVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvbnBtL215LXBrZy9ub2RlX21vZHVsZXMvbXktcGtnJyldXSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5OcG0sIHBhY2thZ2U6ICdteS1wa2cnLCByZWdpc3RyeTogJ2h0dHBzOi8vY3VzdG9tLnJlZ2lzdHJ5LmNvbScgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZS50ZXJtaW5hbENvbW1hbmRzWzBdLmluY2x1ZGVzKCctLXJlZ2lzdHJ5JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHNbMF0uaW5jbHVkZXMoJ2h0dHBzOi8vY3VzdG9tLnJlZ2lzdHJ5LmNvbScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGluc3RhbGwgd2hlbiB1c2VyIGRlY2xpbmVzIGNvbmZpcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2UoeyBkaWFsb2dDb25maXJtUmVzdWx0OiBmYWxzZSB9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5OcG0sIHBhY2thZ2U6ICdteS1wa2cnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50ZXJtaW5hbENvbW1hbmRzLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub3RpZmllcyBlcnJvciB3aGVuIG5wbSBwYWNrYWdlIGRpcmVjdG9yeSBub3QgZm91bmQgYWZ0ZXIgaW5zdGFsbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL25wbS9teS1wa2cnKSxcblx0XHRcdFx0Ly8gZXhpc3RzIHJldHVybnMgdHJ1ZSBmb3IgZW5zdXJlUGx1Z2luU291cmNlIGJ1dCBmYWxzZSBmb3IgdGhlIGZpbmFsIGNoZWNrXG5cdFx0XHRcdGZpbGVFeGlzdHNSZXN1bHQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuTnBtLCBwYWNrYWdlOiAnbXktcGtnJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUubm90aWZpY2F0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLm5vdGlmaWNhdGlvbnNbMF0ubWVzc2FnZS5pbmNsdWRlcygnbm90IGZvdW5kJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm90aWZpZXMgZXJyb3Igd2hlbiB0ZXJtaW5hbCBjb21tYW5kIGZhaWxzIHdpdGggbm9uLXplcm8gZXhpdCBjb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvbnBtL215LXBrZycpLFxuXHRcdFx0XHR0ZXJtaW5hbEV4aXRDb2RlOiAxLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuTnBtLCBwYWNrYWdlOiAnbXktcGtnJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUubm90aWZpY2F0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLm5vdGlmaWNhdGlvbnNbMF0ubWVzc2FnZS5pbmNsdWRlcygnZmFpbGVkJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cdC8vIGluc3RhbGxQbHVnaW4gXHUyMDE0IHBpcFxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cblx0c3VpdGUoJ2luc3RhbGxQbHVnaW4gXHUyMDE0IHBpcCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3J1bnMgcGlwIGluc3RhbGwgYW5kIHJlZ2lzdGVycyBwbHVnaW4gb24gc3VjY2VzcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBpcEluc3RhbGxVcmkgPSBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9waXAvbXktcGtnJyk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9waXAvbXktcGtnJyksXG5cdFx0XHRcdHBsdWdpblNvdXJjZUluc3RhbGxVcmlzOiBuZXcgTWFwKFtbJ3BpcCcsIHBpcEluc3RhbGxVcmldXSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5QaXAsIHBhY2thZ2U6ICdteS1wa2cnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50ZXJtaW5hbENvbW1hbmRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUudGVybWluYWxDb21tYW5kc1swXS5pbmNsdWRlcygncGlwJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHNbMF0uaW5jbHVkZXMoJ2luc3RhbGwnKSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUudGVybWluYWxDb21tYW5kc1swXS5pbmNsdWRlcygnbXktcGtnJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm5vdGlmaWNhdGlvbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIHZlcnNpb24gd2l0aCA9PSBzeW50YXggaW4gcGlwIGluc3RhbGwgY29tbWFuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL3BpcC9teS1wa2cnKSxcblx0XHRcdFx0cGx1Z2luU291cmNlSW5zdGFsbFVyaXM6IG5ldyBNYXAoW1sncGlwJywgVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvcGlwL215LXBrZycpXV0pLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUGlwLCBwYWNrYWdlOiAnbXktcGtnJywgdmVyc2lvbjogJzIuMC4wJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudGVybWluYWxDb21tYW5kcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHNbMF0uaW5jbHVkZXMoJ215LXBrZz09Mi4wLjAnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyByZWdpc3RyeSB3aXRoIC0taW5kZXgtdXJsIGluIHBpcCBpbnN0YWxsIGNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9waXAvbXktcGtnJyksXG5cdFx0XHRcdHBsdWdpblNvdXJjZUluc3RhbGxVcmlzOiBuZXcgTWFwKFtbJ3BpcCcsIFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL3BpcC9teS1wa2cnKV1dKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlBpcCwgcGFja2FnZTogJ215LXBrZycsIHJlZ2lzdHJ5OiAnaHR0cHM6Ly9weXBpLmN1c3RvbS5jb20vc2ltcGxlJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudGVybWluYWxDb21tYW5kcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHNbMF0uaW5jbHVkZXMoJy0taW5kZXgtdXJsJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHNbMF0uaW5jbHVkZXMoJ2h0dHBzOi8vcHlwaS5jdXN0b20uY29tL3NpbXBsZScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGluc3RhbGwgd2hlbiB1c2VyIGRlY2xpbmVzIGNvbmZpcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2UoeyBkaWFsb2dDb25maXJtUmVzdWx0OiBmYWxzZSB9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5QaXAsIHBhY2thZ2U6ICdteS1wa2cnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50ZXJtaW5hbENvbW1hbmRzLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub3RpZmllcyBlcnJvciB3aGVuIHBpcCBwYWNrYWdlIGRpcmVjdG9yeSBub3QgZm91bmQgYWZ0ZXIgaW5zdGFsbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL3BpcC9teS1wa2cnKSxcblx0XHRcdFx0ZmlsZUV4aXN0c1Jlc3VsdDogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5QaXAsIHBhY2thZ2U6ICdteS1wa2cnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5ub3RpZmljYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUubm90aWZpY2F0aW9uc1swXS5tZXNzYWdlLmluY2x1ZGVzKCdub3QgZm91bmQnKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0Ly8gdXBkYXRlUGx1Z2luXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuXHRzdWl0ZSgndXBkYXRlUGx1Z2luJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY2FsbHMgdXBkYXRlUGx1Z2luU291cmNlIGZvciByZWxhdGl2ZS1wYXRoIHBsdWdpbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2U6ICdwbHVnaW5zL215UGx1Z2luJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvbXlQbHVnaW4nIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS51cGRhdGVQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnVwZGF0ZVBsdWdpblNvdXJjZUNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYWxscyB1cGRhdGVQbHVnaW5Tb3VyY2UgZm9yIEdpdEh1YiBwbHVnaW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS51cGRhdGVQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnVwZGF0ZVBsdWdpblNvdXJjZUNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYWxscyB1cGRhdGVQbHVnaW5Tb3VyY2UgZm9yIEdpdFVybCBwbHVnaW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdFVybCwgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9yZXBvLmdpdCcgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnVwZGF0ZVBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudXBkYXRlUGx1Z2luU291cmNlQ2FsbHMubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Jsb2NrcyBkaXJlY3QgdXBkYXRlcyB3aGVuIHRoZSBzdHJpY3QgbWFya2V0cGxhY2UgcG9saWN5IGRpc2FsbG93cyB0aGUgc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdHN0cmljdE1hcmtldHBsYWNlUG9saWN5QWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVRydXN0ZWQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB1cGRhdGVkID0gYXdhaXQgc2VydmljZS51cGRhdGVQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHVwZGF0ZWQsXG5cdFx0XHRcdHVwZGF0ZUNhbGxzOiBzdGF0ZS51cGRhdGVQbHVnaW5Tb3VyY2VDYWxscy5sZW5ndGgsXG5cdFx0XHRcdG5vdGlmaWNhdGlvbnM6IHN0YXRlLm5vdGlmaWNhdGlvbnMubWFwKG5vdGlmaWNhdGlvbiA9PiBub3RpZmljYXRpb24ubWVzc2FnZSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHVwZGF0ZWQ6IGZhbHNlLFxuXHRcdFx0XHR1cGRhdGVDYWxsczogMCxcblx0XHRcdFx0bm90aWZpY2F0aW9uczogWydVcGRhdGVzIGZyb20gXFwnbWljcm9zb2Z0L3ZzY29kZVxcJyBhcmUgYmxvY2tlZCBieSB5b3VyIG9yZ2FuaXphdGlvblxcJ3MgcG9saWN5LiddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZS1pbnN0YWxscyBmb3IgbnBtIHBsdWdpbiB1cGRhdGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvbnBtL215LXBrZycpLFxuXHRcdFx0XHRwbHVnaW5Tb3VyY2VJbnN0YWxsVXJpczogbmV3IE1hcChbWyducG0nLCBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9ucG0vbXktcGtnL25vZGVfbW9kdWxlcy9teS1wa2cnKV1dKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgcGFja2FnZTogJ215LXBrZycgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnVwZGF0ZVBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHQvLyBucG0gdXBkYXRlIGdvZXMgdGhyb3VnaCB0aGUgc2FtZSBpbnN0YWxsIGZsb3dcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50ZXJtaW5hbENvbW1hbmRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUudGVybWluYWxDb21tYW5kc1swXS5pbmNsdWRlcygnbnBtJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgcmVwb3J0IG5wbSBwbHVnaW4gYXMgdXBkYXRlZCB3aGVuIGluc3RhbGwgaXMgZGVjbGluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZGlhbG9nQ29uZmlybVJlc3VsdDogZmFsc2UsXG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvbnBtL215LXBrZycpLFxuXHRcdFx0XHRwbHVnaW5Tb3VyY2VJbnN0YWxsVXJpczogbmV3IE1hcChbWyducG0nLCBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9ucG0vbXktcGtnL25vZGVfbW9kdWxlcy9teS1wa2cnKV1dKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgcGFja2FnZTogJ215LXBrZycgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB1cGRhdGVkID0gYXdhaXQgc2VydmljZS51cGRhdGVQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVwZGF0ZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50ZXJtaW5hbENvbW1hbmRzLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZS1pbnN0YWxscyBmb3IgcGlwIHBsdWdpbiB1cGRhdGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvcGlwL215LXBrZycpLFxuXHRcdFx0XHRwbHVnaW5Tb3VyY2VJbnN0YWxsVXJpczogbmV3IE1hcChbWydwaXAnLCBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9waXAvbXktcGtnJyldXSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5QaXAsIHBhY2thZ2U6ICdteS1wa2cnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS51cGRhdGVQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZS50ZXJtaW5hbENvbW1hbmRzWzBdLmluY2x1ZGVzKCdwaXAnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZXBvcnQgcGlwIHBsdWdpbiBhcyB1cGRhdGVkIHdoZW4gaW5zdGFsbCBpcyBkZWNsaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRkaWFsb2dDb25maXJtUmVzdWx0OiBmYWxzZSxcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9waXAvbXktcGtnJyksXG5cdFx0XHRcdHBsdWdpblNvdXJjZUluc3RhbGxVcmlzOiBuZXcgTWFwKFtbJ3BpcCcsIFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL3BpcC9teS1wa2cnKV1dKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlBpcCwgcGFja2FnZTogJ215LXBrZycgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB1cGRhdGVkID0gYXdhaXQgc2VydmljZS51cGRhdGVQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVwZGF0ZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50ZXJtaW5hbENvbW1hbmRzLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd1cGRhdGVBbGxQbHVnaW5zJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gaW5zdGFsbGVkUGx1Z2luKG5hbWU6IHN0cmluZywgbWFya2V0cGxhY2U6IHN0cmluZyk6IElNYXJrZXRwbGFjZUluc3RhbGxlZFBsdWdpbiB7XG5cdFx0XHRjb25zdCBtYXJrZXRwbGFjZVJlZmVyZW5jZSA9IG1ha2VNYXJrZXRwbGFjZVJlZihtYXJrZXRwbGFjZSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRtYXJrZXRwbGFjZSxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2UsXG5cdFx0XHRcdHNvdXJjZTogYHBsdWdpbnMvJHtuYW1lfWAsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6IGBwbHVnaW5zLyR7bmFtZX1gIH0sXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB7IHBsdWdpblVyaTogVVJJLmZpbGUoYC9wbHVnaW5zLyR7bmFtZX1gKSwgcGx1Z2luIH07XG5cdFx0fVxuXG5cdFx0dGVzdCgndXBkYXRlcyBvbmx5IHRoZSB0YXJnZXRlZCBtYXJrZXRwbGFjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpcnN0ID0gaW5zdGFsbGVkUGx1Z2luKCdmaXJzdCcsICdtaWNyb3NvZnQvZmlyc3QnKTtcblx0XHRcdGNvbnN0IHNlY29uZCA9IGluc3RhbGxlZFBsdWdpbignc2Vjb25kJywgJ21pY3Jvc29mdC9zZWNvbmQnKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2UoeyBpbnN0YWxsZWRQbHVnaW5zOiBbZmlyc3QsIHNlY29uZF0gfSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlQWxsUGx1Z2lucyh7XG5cdFx0XHRcdHNpbGVudDogdHJ1ZSxcblx0XHRcdFx0YXV0b21hdGljOiB0cnVlLFxuXHRcdFx0XHRtYXJrZXRwbGFjZUlkczogbmV3IFNldChbZmlyc3QucGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLmNhbm9uaWNhbElkXSksXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHB1bGxlZDogc3RhdGUucHVsbFJlcG9zaXRvcnlDYWxscy5tYXAoY2FsbCA9PiBjYWxsLm1hcmtldHBsYWNlLmNhbm9uaWNhbElkKSxcblx0XHRcdFx0ZmV0Y2hlZDogc3RhdGUuZmV0Y2hNYXJrZXRwbGFjZUNhbGxzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwdWxsZWQ6IFtmaXJzdC5wbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UuY2Fub25pY2FsSWRdLFxuXHRcdFx0XHRmZXRjaGVkOiBbW2ZpcnN0LnBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZS5jYW5vbmljYWxJZF1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWNoZWNrcyBtYW5hZ2VkIGF1dG8tdXBkYXRlIHBvbGljeSBiZWZvcmUgYW4gYXV0b21hdGljIHVwZGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbGxlZCA9IGluc3RhbGxlZFBsdWdpbignYmxvY2tlZCcsICdtaWNyb3NvZnQvYmxvY2tlZCcpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGluc3RhbGxlZFBsdWdpbnM6IFtpbnN0YWxsZWRdLFxuXHRcdFx0XHRhdXRvVXBkYXRlQnlNYXJrZXRwbGFjZTogbmV3IE1hcChbW2luc3RhbGxlZC5wbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UuY2Fub25pY2FsSWQsIGZhbHNlXV0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlQWxsUGx1Z2lucyh7XG5cdFx0XHRcdHNpbGVudDogdHJ1ZSxcblx0XHRcdFx0YXV0b21hdGljOiB0cnVlLFxuXHRcdFx0XHRtYXJrZXRwbGFjZUlkczogbmV3IFNldChbaW5zdGFsbGVkLnBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZS5jYW5vbmljYWxJZF0pLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUucHVsbFJlcG9zaXRvcnlDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5mZXRjaE1hcmtldHBsYWNlQ2FsbHMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Jsb2NrcyB1cGRhdGVzIHdoZW4gdGhlIHN0cmljdCBtYXJrZXRwbGFjZSBwb2xpY3kgZGlzYWxsb3dzIHRoZSBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YWxsZWQgPSBpbnN0YWxsZWRQbHVnaW4oJ2Jsb2NrZWQnLCAnbWljcm9zb2Z0L2Jsb2NrZWQnKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRpbnN0YWxsZWRQbHVnaW5zOiBbaW5zdGFsbGVkXSxcblx0XHRcdFx0c3RyaWN0TWFya2V0cGxhY2VQb2xpY3lBY3RpdmU6IHRydWUsXG5cdFx0XHRcdG1hcmtldHBsYWNlVHJ1c3RlZDogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS51cGRhdGVBbGxQbHVnaW5zKHsgc2lsZW50OiB0cnVlIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5mYWlsZWROYW1lcywgW2luc3RhbGxlZC5wbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UuZGlzcGxheUxhYmVsXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLnB1bGxSZXBvc2l0b3J5Q2FsbHMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBpbnN0YWxsUGx1Z2luIFx1MjAxNCBtYXJrZXRwbGFjZSB0cnVzdFxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cblx0c3VpdGUoJ2luc3RhbGxQbHVnaW4gXHUyMDE0IG1hcmtldHBsYWNlIHRydXN0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc2tpcHMgdHJ1c3QgcHJvbXB0IHdoZW4gbWFya2V0cGxhY2UgaXMgYWxyZWFkeSB0cnVzdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7IG1hcmtldHBsYWNlVHJ1c3RlZDogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZTogJ3BsdWdpbnMvbXlQbHVnaW4nLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncGx1Z2lucy9teVBsdWdpbicgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnRydXN0ZWRNYXJrZXRwbGFjZXMubGVuZ3RoLCAwLCAnc2hvdWxkIG5vdCByZS10cnVzdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgdHJ1c3QgcHJvbXB0IGFuZCBpbnN0YWxscyB3aGVuIHVzZXIgY29uZmlybXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHsgbWFya2V0cGxhY2VUcnVzdGVkOiBmYWxzZSwgZGlhbG9nQ29uZmlybVJlc3VsdDogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZTogJ3BsdWdpbnMvbXlQbHVnaW4nLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncGx1Z2lucy9teVBsdWdpbicgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnRydXN0ZWRNYXJrZXRwbGFjZXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGluc3RhbGwgd2hlbiB1c2VyIGRlY2xpbmVzIHRydXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7IG1hcmtldHBsYWNlVHJ1c3RlZDogZmFsc2UsIGRpYWxvZ0NvbmZpcm1SZXN1bHQ6IGZhbHNlIH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlOiAncGx1Z2lucy9teVBsdWdpbicsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICdwbHVnaW5zL215UGx1Z2luJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pLCAoZXJyOiB1bmtub3duKSA9PiBpc0NhbmNlbGxhdGlvbkVycm9yKGVyciBhcyBFcnJvcikpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudHJ1c3RlZE1hcmtldHBsYWNlcy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJ1c3QgcHJvbXB0IGFwcGxpZXMgdG8gYWxsIHNvdXJjZSBraW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2UoeyBtYXJrZXRwbGFjZVRydXN0ZWQ6IGZhbHNlLCBkaWFsb2dDb25maXJtUmVzdWx0OiBmYWxzZSB9KTtcblxuXHRcdFx0Y29uc3Qga2luZHM6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yW10gPSBbXG5cdFx0XHRcdHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICdwJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycgfSxcblx0XHRcdFx0eyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdFVybCwgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9yZXBvLmdpdCcgfSxcblx0XHRcdFx0eyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgcGFja2FnZTogJ215LXBrZycgfSxcblx0XHRcdFx0eyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlBpcCwgcGFja2FnZTogJ215LXBrZycgfSxcblx0XHRcdF07XG5cblx0XHRcdGZvciAoY29uc3Qgc291cmNlRGVzY3JpcHRvciBvZiBraW5kcykge1xuXHRcdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLmluc3RhbGxQbHVnaW4oY3JlYXRlUGx1Z2luKHsgc291cmNlRGVzY3JpcHRvciB9KSksIChlcnI6IHVua25vd24pID0+IGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyIGFzIEVycm9yKSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwLCAnbm8gcGx1Z2lucyBzaG91bGQgYmUgaW5zdGFsbGVkIHdoZW4gdHJ1c3QgaXMgZGVjbGluZWQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBpbnN0YWxsUGx1Z2luRnJvbVNvdXJjZVxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cblx0c3VpdGUoJ2luc3RhbGxQbHVnaW5Gcm9tU291cmNlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVqZWN0cyBpbnZhbGlkIHNvdXJjZSBzdHJpbmdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnbm90IGEgdmFsaWQgc291cmNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQubWVzc2FnZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWxpZGF0ZVBsdWdpblNvdXJjZSBhY2NlcHRzIGdpdCBhbmQgbG9jYWwgc291cmNlcyBhbmQgcmVqZWN0cyBnYXJiYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS52YWxpZGF0ZVBsdWdpblNvdXJjZSgnb3duZXIvcmVwbycpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudmFsaWRhdGVQbHVnaW5Tb3VyY2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvLmdpdCcpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudmFsaWRhdGVQbHVnaW5Tb3VyY2UoJ2ZpbGU6Ly8vc29tZS9wYXRoJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS52YWxpZGF0ZVBsdWdpblNvdXJjZSgnL2Ficy9wYXRoJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS52YWxpZGF0ZVBsdWdpblNvdXJjZSgnfi9wbHVnaW5zL2ZvbycpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlcnZpY2UudmFsaWRhdGVQbHVnaW5Tb3VyY2UoJ25vdCBhIHZhbGlkIHNvdXJjZScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luc3RhbGxzIGEgbG9jYWwgZm9sZGVyIG1hcmtldHBsYWNlIGFuZCByZWdpc3RlcnMgaXQgdW5kZXIgY2hhdC5wbHVnaW5zLm1hcmtldHBsYWNlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZiA9IG1ha2VNYXJrZXRwbGFjZVJlZignZmlsZTovLy9zb21lL21hcmtldHBsYWNlJyk7XG5cdFx0XHRjb25zdCBkaXNjb3ZlcmVkUGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0bmFtZTogJ2xvY2FsLW1hcmtldHBsYWNlLXBsdWdpbicsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICcnIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiByZWYuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5PcGVuUGx1Z2luLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0cmVhZFBsdWdpbnNSZXN1bHQ6IFtkaXNjb3ZlcmVkUGx1Z2luXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCdmaWxlOi8vL3NvbWUvbWFya2V0cGxhY2UnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm5vdGlmaWNhdGlvbnMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnNbMF0ucGx1Z2luLm5hbWUsICdsb2NhbC1tYXJrZXRwbGFjZS1wbHVnaW4nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUudXBkYXRlZE1hcmtldHBsYWNlcywgWydmaWxlOi8vL3NvbWUvbWFya2V0cGxhY2UnXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudXBkYXRlZFBsdWdpbkxvY2F0aW9ucywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHBlcnNpc3QgYSBsb2NhbCBtYXJrZXRwbGFjZSB0byBjb25maWcgd2hlbiB0cnVzdCBpcyBkZWNsaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZiA9IG1ha2VNYXJrZXRwbGFjZVJlZignZmlsZTovLy9zb21lL21hcmtldHBsYWNlJyk7XG5cdFx0XHRjb25zdCBkaXNjb3ZlcmVkUGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0bmFtZTogJ2xvY2FsLW1hcmtldHBsYWNlLXBsdWdpbicsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICcnIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiByZWYuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5PcGVuUGx1Z2luLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0cmVhZFBsdWdpbnNSZXN1bHQ6IFtkaXNjb3ZlcmVkUGx1Z2luXSxcblx0XHRcdFx0bWFya2V0cGxhY2VUcnVzdGVkOiBmYWxzZSxcblx0XHRcdFx0ZGlhbG9nQ29uZmlybVJlc3VsdDogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnZmlsZTovLy9zb21lL21hcmtldHBsYWNlJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VjY2VzcywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnVwZGF0ZWRNYXJrZXRwbGFjZXMsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWdpc3RlcnMgYSBsb2NhbCBmb2xkZXIgc3RhbmRhbG9uZSBwbHVnaW4gdW5kZXIgY2hhdC5wbHVnaW5Mb2NhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0cmVhZFBsdWdpbnNSZXN1bHQ6IFtdLFxuXHRcdFx0XHRpc1BsdWdpbkRpcmVjdG9yeVJlc3VsdDogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCcvYWJzL215LXBsdWdpbicpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUubm90aWZpY2F0aW9ucy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS51cGRhdGVkUGx1Z2luTG9jYXRpb25zLCB7ICcvYWJzL215LXBsdWdpbic6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudXBkYXRlZE1hcmtldHBsYWNlcywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4cGFuZHMgfiBwYXRocyBidXQgcGVyc2lzdHMgdGhlIG9yaWdpbmFsIGZvcm0gaW4gY2hhdC5wbHVnaW5Mb2NhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0cmVhZFBsdWdpbnNSZXN1bHQ6IFtdLFxuXHRcdFx0XHRpc1BsdWdpbkRpcmVjdG9yeVJlc3VsdDogdHJ1ZSxcblx0XHRcdFx0dXNlckhvbWU6ICcvaG9tZS91c2VyJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCd+L215LXBsdWdpbicpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLnVwZGF0ZWRQbHVnaW5Mb2NhdGlvbnMsIHsgJ34vbXktcGx1Z2luJzogdHJ1ZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlZ2lzdGVycyBhIGZpbGU6Ly8gc3RhbmRhbG9uZSBwbHVnaW4gdXNpbmcgaXRzIGZpbGVzeXN0ZW0gcGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW10sXG5cdFx0XHRcdGlzUGx1Z2luRGlyZWN0b3J5UmVzdWx0OiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UoJ2ZpbGU6Ly8vc29tZS9wbHVnaW4nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLnVwZGF0ZWRQbHVnaW5Mb2NhdGlvbnMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChPYmplY3QudmFsdWVzKHN0YXRlLnVwZGF0ZWRQbHVnaW5Mb2NhdGlvbnMhKSwgW3RydWVdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3Qua2V5cyhzdGF0ZS51cGRhdGVkUGx1Z2luTG9jYXRpb25zISkubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3dzIGVycm9yIHdoZW4gbG9jYWwgZm9sZGVyIGRvZXMgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdHJlc29sdmVJc0RpcmVjdG9yeTogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnL2Ficy9taXNzaW5nJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VjY2VzcywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5tZXNzYWdlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS51cGRhdGVkUGx1Z2luTG9jYXRpb25zLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgZXJyb3Igd2hlbiBsb2NhbCBmb2xkZXIgaXMgbmVpdGhlciBhIG1hcmtldHBsYWNlIG5vciBhIHBsdWdpbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW10sXG5cdFx0XHRcdGlzUGx1Z2luRGlyZWN0b3J5UmVzdWx0OiBmYWxzZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCcvYWJzL2VtcHR5Jyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VjY2VzcywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5tZXNzYWdlPy5pbmNsdWRlcygnTm8gcGx1Z2luIG9yIG1hcmtldHBsYWNlIGZvdW5kJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnVwZGF0ZWRQbHVnaW5Mb2NhdGlvbnMsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnN0YWxscyBzaW5nbGUgcGx1Z2luIGZyb20gR2l0SHViIHNob3J0aGFuZCB3aXRoIG1hcmtldHBsYWNlLmpzb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWYgPSBtYWtlTWFya2V0cGxhY2VSZWYoJ293bmVyL215LXBsdWdpbicpO1xuXHRcdFx0Y29uc3QgZGlzY292ZXJlZFBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdG5hbWU6ICdteS1kaXNjb3ZlcmVkLXBsdWdpbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnQSBkaXNjb3ZlcmVkIHBsdWdpbicsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICcnIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiByZWYuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5PcGVuUGx1Z2luLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL293bmVyL215LXBsdWdpbicpLFxuXHRcdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW2Rpc2NvdmVyZWRQbHVnaW5dLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UoJ293bmVyL215LXBsdWdpbicpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zWzBdLnBsdWdpbi5uYW1lLCAnbXktZGlzY292ZXJlZC1wbHVnaW4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3dzIGVycm9yIHdoZW4gbm8gbWFya2V0cGxhY2UuanNvbiBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvY29vbC10b29sJyksXG5cdFx0XHRcdHJlYWRQbHVnaW5zUmVzdWx0OiBbXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCdvd25lci9jb29sLXRvb2wnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0Lm1lc3NhZ2U/LmluY2x1ZGVzKCdObyBwbHVnaW5zIGZvdW5kJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgcXVpY2sgcGljayBmb3IgbXVsdGktcGx1Z2luIHJlcG9zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVmID0gbWFrZU1hcmtldHBsYWNlUmVmKCdvd25lci9tdWx0aS1yZXBvJyk7XG5cdFx0XHRjb25zdCBwbHVnaW5BID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0bmFtZTogJ3BsdWdpbi1hJyxcblx0XHRcdFx0c291cmNlOiAncGx1Z2lucy9hJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvYScgfSxcblx0XHRcdFx0bWFya2V0cGxhY2U6IHJlZi5kaXNwbGF5TGFiZWwsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiByZWYsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbkIgPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRuYW1lOiAncGx1Z2luLWInLFxuXHRcdFx0XHRzb3VyY2U6ICdwbHVnaW5zL2InLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncGx1Z2lucy9iJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogcmVmLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHJlZixcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvZ2l0aHViLmNvbS9vd25lci9tdWx0aS1yZXBvJyksXG5cdFx0XHRcdHJlYWRQbHVnaW5zUmVzdWx0OiBbcGx1Z2luQSwgcGx1Z2luQl0sXG5cdFx0XHRcdHF1aWNrUGlja1Jlc3VsdDogeyBsYWJlbDogJ3BsdWdpbi1iJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UoJ293bmVyL211bHRpLXJlcG8nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2luc1swXS5wbHVnaW4ubmFtZSwgJ3BsdWdpbi1iJyk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUuYWRkZWRQbHVnaW5zWzBdLnVyaS5pbmNsdWRlcygncGx1Z2lucy9iJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgaW5zdGFsbCB3aGVuIHF1aWNrIHBpY2sgaXMgY2FuY2VsbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVmID0gbWFrZU1hcmtldHBsYWNlUmVmKCdvd25lci9tdWx0aS1yZXBvJyk7XG5cdFx0XHRjb25zdCBwbHVnaW5BID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0bmFtZTogJ3BsdWdpbi1hJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvYScgfSxcblx0XHRcdFx0bWFya2V0cGxhY2U6IHJlZi5kaXNwbGF5TGFiZWwsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiByZWYsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbkIgPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRuYW1lOiAncGx1Z2luLWInLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncGx1Z2lucy9iJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogcmVmLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHJlZixcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvZ2l0aHViLmNvbS9vd25lci9tdWx0aS1yZXBvJyksXG5cdFx0XHRcdHJlYWRQbHVnaW5zUmVzdWx0OiBbcGx1Z2luQSwgcGx1Z2luQl0sXG5cdFx0XHRcdHF1aWNrUGlja1Jlc3VsdDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UoJ293bmVyL211bHRpLXJlcG8nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgaW5zdGFsbCB3aGVuIHRydXN0IGlzIGRlY2xpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdG1hcmtldHBsYWNlVHJ1c3RlZDogZmFsc2UsXG5cdFx0XHRcdGRpYWxvZ0NvbmZpcm1SZXN1bHQ6IGZhbHNlLFxuXHRcdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW10sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnb3duZXIvcmVwbycpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBlcnJvciB3aGVuIG5vIHBsdWdpbnMgZm91bmQgaW4gZ2l0IFVSTCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvbXktdG9vbCcpLFxuXHRcdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW10sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL215LXRvb2wuZ2l0Jyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VjY2VzcywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5tZXNzYWdlPy5pbmNsdWRlcygnTm8gcGx1Z2lucyBmb3VuZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3dzIGVycm9yIHdoZW4gY2xvbmUgZGlyZWN0b3J5IGRvZXMgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvZ2l0aHViLmNvbS9vd25lci9taXNzaW5nJyksXG5cdFx0XHRcdGZpbGVFeGlzdHNSZXN1bHQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UoJ293bmVyL21pc3NpbmcnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0Lm1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWRkcyBtYXJrZXRwbGFjZSB0byBjb25maWcgYWZ0ZXIgaW5zdGFsbGluZyBzaW5nbGUgcGx1Z2luJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVmID0gbWFrZU1hcmtldHBsYWNlUmVmKCdvd25lci9teS1wbHVnaW4nKTtcblx0XHRcdGNvbnN0IGRpc2NvdmVyZWRQbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRuYW1lOiAnbXktZGlzY292ZXJlZC1wbHVnaW4nLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAnJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogcmVmLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHJlZixcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuT3BlblBsdWdpbixcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvZ2l0aHViLmNvbS9vd25lci9teS1wbHVnaW4nKSxcblx0XHRcdFx0cmVhZFBsdWdpbnNSZXN1bHQ6IFtkaXNjb3ZlcmVkUGx1Z2luXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCdvd25lci9teS1wbHVnaW4nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS51cGRhdGVkTWFya2V0cGxhY2VzLCBbJ293bmVyL215LXBsdWdpbiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZHMgbWFya2V0cGxhY2UgdG8gY29uZmlnIGFmdGVyIHBpY2tpbmcgZnJvbSBtdWx0aS1wbHVnaW4gcmVwbycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZiA9IG1ha2VNYXJrZXRwbGFjZVJlZignb3duZXIvbXVsdGktcmVwbycpO1xuXHRcdFx0Y29uc3QgcGx1Z2luQSA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdG5hbWU6ICdwbHVnaW4tYScsXG5cdFx0XHRcdHNvdXJjZTogJ3BsdWdpbnMvYScsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICdwbHVnaW5zL2EnIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiByZWYuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW5CID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0bmFtZTogJ3BsdWdpbi1iJyxcblx0XHRcdFx0c291cmNlOiAncGx1Z2lucy9iJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvYicgfSxcblx0XHRcdFx0bWFya2V0cGxhY2U6IHJlZi5kaXNwbGF5TGFiZWwsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiByZWYsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvbXVsdGktcmVwbycpLFxuXHRcdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW3BsdWdpbkEsIHBsdWdpbkJdLFxuXHRcdFx0XHRxdWlja1BpY2tSZXN1bHQ6IHsgbGFiZWw6ICdwbHVnaW4tYScgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCdvd25lci9tdWx0aS1yZXBvJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUudXBkYXRlZE1hcmtldHBsYWNlcywgWydvd25lci9tdWx0aS1yZXBvJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZHVwbGljYXRlIG1hcmtldHBsYWNlIGluIGNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZiA9IG1ha2VNYXJrZXRwbGFjZVJlZignb3duZXIvbXktcGx1Z2luJyk7XG5cdFx0XHRjb25zdCBkaXNjb3ZlcmVkUGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0bmFtZTogJ215LWRpc2NvdmVyZWQtcGx1Z2luJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJycgfSxcblx0XHRcdFx0bWFya2V0cGxhY2U6IHJlZi5kaXNwbGF5TGFiZWwsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiByZWYsXG5cdFx0XHRcdG1hcmtldHBsYWNlVHlwZTogTWFya2V0cGxhY2VUeXBlLk9wZW5QbHVnaW4sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvbXktcGx1Z2luJyksXG5cdFx0XHRcdHJlYWRQbHVnaW5zUmVzdWx0OiBbZGlzY292ZXJlZFBsdWdpbl0sXG5cdFx0XHRcdGNvbmZpZ3VyZWRNYXJrZXRwbGFjZXM6IFsnb3duZXIvbXktcGx1Z2luJ10sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnb3duZXIvbXktcGx1Z2luJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS51cGRhdGVkTWFya2V0cGxhY2VzLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBzaW5nbGUtcGx1Z2luIG1hbmlmZXN0IHdoZW4gbm8gbWFya2V0cGxhY2UuanNvbiBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWYgPSBtYWtlTWFya2V0cGxhY2VSZWYoJ293bmVyL3NpbmdsZS1wbHVnaW4tcmVwbycpO1xuXHRcdFx0Y29uc3Qgc2luZ2xlUGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0bmFtZTogJ3NpbmdsZS1wbHVnaW4tcmVwbycsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIHJlcG86ICdvd25lci9zaW5nbGUtcGx1Z2luLXJlcG8nIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiByZWYuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5DbGF1ZGUsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvc2luZ2xlLXBsdWdpbi1yZXBvJyksXG5cdFx0XHRcdHJlYWRQbHVnaW5zUmVzdWx0OiBbXSxcblx0XHRcdFx0c2luZ2xlUGx1Z2luTWFuaWZlc3RSZXN1bHQ6IHNpbmdsZVBsdWdpbixcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCdvd25lci9zaW5nbGUtcGx1Z2luLXJlcG8nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2luc1swXS5wbHVnaW4ubmFtZSwgJ3NpbmdsZS1wbHVnaW4tcmVwbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm5vdGlmaWNhdGlvbnMubGVuZ3RoLCAwKTtcblx0XHRcdC8vIFNpbmdsZS1wbHVnaW4gcmVwb3MgYXJlIG5vdCBtYXJrZXRwbGFjZXMgXHUyMDE0IGNvbmZpZyBtdXN0IE5PVCBiZSB0b3VjaGVkLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnVwZGF0ZWRNYXJrZXRwbGFjZXMsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXBvcnRzIGVycm9yIHdoZW4gc2luZ2xlLXBsdWdpbiBtYW5pZmVzdCBuYW1lIGRvZXMgbm90IG1hdGNoIG9wdGlvbnMucGx1Z2luJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVmID0gbWFrZU1hcmtldHBsYWNlUmVmKCdvd25lci9zaW5nbGUtcGx1Z2luLXJlcG8nKTtcblx0XHRcdGNvbnN0IHNpbmdsZVBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdG5hbWU6ICdhY3R1YWwtbmFtZScsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIHJlcG86ICdvd25lci9zaW5nbGUtcGx1Z2luLXJlcG8nIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiByZWYuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5DbGF1ZGUsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvc2luZ2xlLXBsdWdpbi1yZXBvJyksXG5cdFx0XHRcdHJlYWRQbHVnaW5zUmVzdWx0OiBbXSxcblx0XHRcdFx0c2luZ2xlUGx1Z2luTWFuaWZlc3RSZXN1bHQ6IHNpbmdsZVBsdWdpbixcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCdvd25lci9zaW5nbGUtcGx1Z2luLXJlcG8nLCB7IHBsdWdpbjogJ3JlcXVlc3RlZC1uYW1lJyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0Lm1lc3NhZ2U/LmluY2x1ZGVzKCdub3QgZm91bmQnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdGlsbCByZXBvcnRzIFwibm8gcGx1Z2lucyBmb3VuZFwiIHdoZW4gbmVpdGhlciBtYXJrZXRwbGFjZS5qc29uIG5vciBzaW5nbGUtcGx1Z2luIG1hbmlmZXN0IGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvZW1wdHktcmVwbycpLFxuXHRcdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW10sXG5cdFx0XHRcdHNpbmdsZVBsdWdpbk1hbmlmZXN0UmVzdWx0OiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnb3duZXIvZW1wdHktcmVwbycpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQubWVzc2FnZT8uaW5jbHVkZXMoJ05vIHBsdWdpbnMgZm91bmQnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFB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
