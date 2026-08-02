import assert from "assert";
import { timeout } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../../base/common/map.js";
import { derived, observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { PluginFormat } from "../../../../../../platform/agentPlugins/common/pluginParsers.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { AICustomizationItemsModel } from "../../../browser/aiCustomization/aiCustomizationItemsModel.js";
import { AICustomizationManagementSection, AICustomizationSources, BUILTIN_STORAGE, IAICustomizationWorkspaceService } from "../../../common/aiCustomizationWorkspaceService.js";
import { ICustomizationHarnessService } from "../../../common/customizationHarnessService.js";
import { ContributionEnablementState } from "../../../common/enablement.js";
import { IAgentPluginService } from "../../../common/plugins/agentPluginService.js";
import { PromptsType, Target } from "../../../common/promptSyntax/promptTypes.js";
import { IAgentSource, IPromptsService, PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { getChatSessionType } from "../../../common/model/chatUri.js";
import { basename } from "../../../../../../base/common/resources.js";
suite("AICustomizationItemsModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("basics", () => {
    let disposables;
    let instaService;
    let activeSessionResource;
    let activeHarness;
    let availableHarnesses;
    let descriptorA;
    let descriptorB;
    let providerA_didChange;
    let providerA_callCount;
    let providerA_items;
    let plugins;
    let listPromptFilesResult;
    let disabledPromptFilesResult;
    function createDescriptor(id, provider, syncProvider) {
      return {
        id,
        label: id,
        icon: Codicon.settingsGear,
        itemProvider: provider,
        syncProvider
      };
    }
    setup(() => {
      disposables = new DisposableStore();
      providerA_didChange = disposables.add(new Emitter());
      providerA_callCount = 0;
      providerA_items = [];
      listPromptFilesResult = [];
      disabledPromptFilesResult = new ResourceSet();
      const providerA = {
        onDidChange: providerA_didChange.event,
        provideChatSessionCustomizations: (sessionResource, token) => {
          providerA_callCount++;
          return Promise.resolve(providerA_items.slice());
        }
      };
      const providerB = {
        onDidChange: Event.None,
        provideChatSessionCustomizations: (sessionResource, token) => Promise.resolve([])
      };
      descriptorA = createDescriptor("A", providerA);
      descriptorB = createDescriptor("B", providerB);
      activeSessionResource = observableValue("activeSessionResource", URI.parse(`A:///session`));
      activeHarness = derived((reader) => getChatSessionType(activeSessionResource.read(reader)));
      availableHarnesses = observableValue("availableHarnesses", [descriptorA, descriptorB]);
      plugins = observableValue("plugins", []);
      instaService = workbenchInstantiationService({}, disposables);
      function customAgentFromPromptPath(promptFile) {
        return {
          id: promptFile.uri.toString(),
          uri: promptFile.uri,
          name: promptFile.name ?? basename(promptFile.uri),
          description: promptFile.description,
          target: Target.VSCode,
          visibility: { agentInvocable: true, userInvocable: true },
          enabled: !disabledPromptFilesResult.has(promptFile.uri),
          source: IAgentSource.fromPromptPath(promptFile),
          agentInstructions: { content: "", toolReferences: [] }
        };
      }
      instaService.stub(IPromptsService, {
        onDidChangeCustomAgents: Event.None,
        onDidChangeSlashCommands: Event.None,
        onDidChangeSkills: Event.None,
        onDidChangeHooks: Event.None,
        onDidChangeInstructions: Event.None,
        onDidChangeAgentInstructions: Event.None,
        listPromptFiles: async (type) => listPromptFilesResult.filter((f) => f.type === type),
        listPromptFilesForStorage: async () => [],
        getCustomAgents: async () => listPromptFilesResult.filter((f) => f.type === PromptsType.agent).map(customAgentFromPromptPath),
        findAgentSkills: async () => [],
        getHooks: async () => void 0,
        getInstructionFiles: async () => [],
        getPromptSlashCommands: async () => [],
        listAgentInstructions: async () => [],
        getDisabledPromptFiles: () => disabledPromptFilesResult
      });
      instaService.stub(IAICustomizationWorkspaceService, {
        activeProjectRoot: observableValue("test", void 0),
        getActiveProjectRoot: () => void 0,
        managementSections: [AICustomizationManagementSection.Agents],
        isSessionsWindow: false,
        welcomePageFeatures: { showGettingStartedBanner: false },
        getSkillUIIntegrations: () => /* @__PURE__ */ new Map(),
        hasOverrideProjectRoot: observableValue("test", false),
        commitFiles: async () => {
        },
        deleteFiles: async () => {
        },
        generateCustomization: async () => {
        },
        setOverrideProjectRoot: () => {
        },
        clearOverrideProjectRoot: () => {
        }
      });
      instaService.stub(ICustomizationHarnessService, {
        activeSessionResource,
        activeHarness,
        availableHarnesses,
        setActiveSession: (sessionResource) => {
          activeSessionResource.set(sessionResource, void 0);
        },
        getActiveDescriptor: () => availableHarnesses.get().find((d) => d.id === activeHarness.get()),
        findHarnessById: (id) => availableHarnesses.get().find((d) => d.id === id),
        registerExternalHarness: () => ({ dispose() {
        } })
      });
      instaService.stub(IAgentPluginService, {
        plugins,
        enablementModel: {
          readEnabled: () => ContributionEnablementState.EnabledProfile,
          setEnabled: () => {
          },
          remove: () => {
          }
        }
      });
    });
    function createLocalPlugin(name) {
      return {
        uri: URI.parse(`plugin-test://${name}`),
        format: PluginFormat.Copilot,
        label: name,
        enablement: observableValue("pluginEnablement", ContributionEnablementState.EnabledProfile),
        remove: () => {
        },
        hooks: observableValue("pluginHooks", []),
        commands: observableValue("pluginCommands", []),
        skills: observableValue("pluginSkills", []),
        agents: observableValue("pluginAgents", []),
        instructions: observableValue("pluginInstructions", []),
        mcpServerDefinitions: observableValue("pluginMcpServerDefinitions", [])
      };
    }
    teardown(() => disposables.dispose());
    test("exposes per-section observables for all prompts-based sections", () => {
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      assert.ok(model.getItems(AICustomizationManagementSection.Agents));
      assert.ok(model.getItems(AICustomizationManagementSection.Skills));
      assert.ok(model.getItems(AICustomizationManagementSection.Instructions));
      assert.ok(model.getItems(AICustomizationManagementSection.Prompts));
      assert.ok(model.getItems(AICustomizationManagementSection.Hooks));
    });
    test("does not fetch on construction (lazy)", async () => {
      disposables.add(instaService.createInstance(AICustomizationItemsModel));
      await timeout(0);
      assert.strictEqual(providerA_callCount, 0);
    });
    test("first read of a section triggers a fetch", async () => {
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      model.getItems(AICustomizationManagementSection.Agents);
      await timeout(0);
      assert.strictEqual(providerA_callCount, 1);
      model.getItems(AICustomizationManagementSection.Skills);
      await timeout(0);
      assert.strictEqual(providerA_callCount, 1);
      providerA_didChange.fire();
      await timeout(0);
      assert.strictEqual(providerA_callCount, 2);
      model.getItems(AICustomizationManagementSection.Agents);
      assert.strictEqual(providerA_callCount, 2);
    });
    test("source.onDidChange refetches only previously-observed sections", async () => {
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      model.getItems(AICustomizationManagementSection.Agents);
      await timeout(0);
      const before = providerA_callCount;
      providerA_didChange.fire();
      await timeout(0);
      assert.strictEqual(providerA_callCount, before + 1);
    });
    test("switching harness re-binds and refetches observed sections", async () => {
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      model.getItems(AICustomizationManagementSection.Agents);
      await timeout(0);
      const sourceA = model.getActiveItemSource();
      activeSessionResource.set(URI.parse("B://session"), void 0);
      await timeout(0);
      const sourceB = model.getActiveItemSource();
      assert.notStrictEqual(sourceA, sourceB);
    });
    test("preserves provider-supplied plugin storage when pluginUri is omitted", async () => {
      providerA_items = [{
        uri: URI.parse("agent-host://test-authority/plugins/my-plugin/skills/my-skill/SKILL.md"),
        type: PromptsType.skill,
        name: "My Skill",
        source: PromptsStorage.plugin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: true
      }];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const items = model.getItems(AICustomizationManagementSection.Skills);
      await model.whenSectionLoaded(AICustomizationManagementSection.Skills);
      assert.deepStrictEqual(items.get().map((item) => ({
        name: item.name,
        source: item.source
      })), [{
        name: "My Skill",
        source: AICustomizationSources.plugin
      }]);
    });
    test("preserves provider-supplied builtin storage when groupKey is omitted", async () => {
      providerA_items = [{
        uri: URI.parse("agent-host://test-authority/builtin/skills/github/SKILL.md"),
        type: PromptsType.skill,
        name: "Built-in Skill",
        source: AICustomizationSources.builtin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: true
      }];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const items = model.getItems(AICustomizationManagementSection.Skills);
      await model.whenSectionLoaded(AICustomizationManagementSection.Skills);
      assert.deepStrictEqual(items.get().map((item) => ({
        name: item.name,
        source: item.source,
        groupKey: item.groupKey,
        isBuiltin: item.isBuiltin
      })), [{
        name: "Built-in Skill",
        source: AICustomizationSources.builtin,
        groupKey: BUILTIN_STORAGE,
        isBuiltin: true
      }]);
    });
    test("preserves builtin grouping when only groupKey is set (no storage/extensionId/pluginUri)", async () => {
      providerA_items = [{
        uri: URI.parse("agent-app://builtin/coder.agent.md"),
        type: PromptsType.agent,
        name: "Coder",
        groupKey: BUILTIN_STORAGE,
        enabled: true,
        extensionId: void 0,
        pluginUri: void 0,
        source: AICustomizationSources.builtin
        // Ignored, should be overridden by groupKey
      }];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const items = model.getItems(AICustomizationManagementSection.Agents);
      await model.whenSectionLoaded(AICustomizationManagementSection.Agents);
      assert.deepStrictEqual(items.get().map((item) => ({
        name: item.name,
        groupKey: item.groupKey,
        isBuiltin: item.isBuiltin
      })), [{
        name: "Coder",
        groupKey: BUILTIN_STORAGE,
        isBuiltin: true
      }]);
    });
    test("prompt service items preserve storage grouping, metadata, and disabled state without sync provider", async () => {
      availableHarnesses.set([createDescriptor("A", void 0), descriptorB], void 0);
      activeSessionResource.set(URI.parse("A:///session2"), void 0);
      listPromptFilesResult = [{
        uri: URI.parse("file:///workspace/agents/team-agent.agent.md"),
        storage: PromptsStorage.local,
        type: PromptsType.agent,
        name: "Team Agent",
        description: "Workspace agent description"
      }];
      disabledPromptFilesResult = new ResourceSet([listPromptFilesResult[0].uri]);
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const items = model.getItems(AICustomizationManagementSection.Agents);
      await model.whenSectionLoaded(AICustomizationManagementSection.Agents);
      assert.deepStrictEqual(items.get().map((item) => ({
        id: item.id,
        uri: item.uri.toString(),
        name: item.name,
        description: item.description,
        source: item.source,
        disabled: item.disabled,
        groupKey: item.groupKey,
        syncable: item.syncable,
        synced: item.synced
      })), [{
        id: "file:///workspace/agents/team-agent.agent.md",
        uri: "file:///workspace/agents/team-agent.agent.md",
        name: "Team Agent",
        description: "Workspace agent description",
        source: AICustomizationSources.local,
        disabled: true,
        groupKey: void 0,
        syncable: void 0,
        synced: void 0
      }]);
    });
    test("plugin count includes provider-supplied plugin items", async () => {
      providerA_items = [
        {
          uri: URI.parse("agent-host://test-authority/plugins/remote-one"),
          type: "plugin",
          name: "Remote One",
          source: AICustomizationSources.plugin,
          extensionId: void 0,
          pluginUri: void 0,
          userInvocable: void 0
        },
        {
          uri: URI.parse("agent-host://test-authority/plugins/remote-two"),
          type: AICustomizationManagementSection.Plugins,
          name: "Remote Two",
          source: AICustomizationSources.plugin,
          extensionId: void 0,
          pluginUri: void 0,
          userInvocable: void 0
        },
        {
          uri: URI.parse("agent-host://test-authority/plugins/remote-two/skills/my-skill/SKILL.md"),
          type: PromptsType.skill,
          name: "My Skill",
          source: AICustomizationSources.plugin,
          extensionId: void 0,
          pluginUri: void 0,
          userInvocable: true
        },
        {
          uri: URI.parse("agent-host://test-authority/plugins/local-synced"),
          type: "plugin",
          name: "Local Synced",
          source: AICustomizationSources.plugin,
          groupKey: "remote-client",
          extensionId: void 0,
          pluginUri: void 0,
          userInvocable: void 0
        }
      ];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      assert.strictEqual(count.get(), 2);
    });
    test("local plugin changes update plugin count without refetching provider customizations", async () => {
      providerA_items = [{
        uri: URI.parse("agent-host://test-authority/plugins/remote-one"),
        type: "plugin",
        name: "Remote One",
        source: AICustomizationSources.plugin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: void 0
      }];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      const callsAfterInitialCount = providerA_callCount;
      plugins.set([createLocalPlugin("local-one")], void 0);
      await timeout(0);
      assert.deepStrictEqual({
        count: count.get(),
        providerA_callCount
      }, {
        count: 2,
        providerA_callCount: callsAfterInitialCount
      });
    });
    test("plugin count dedupes provider plugins that are also installed locally", async () => {
      providerA_items = [{
        uri: URI.parse("agent-host://test-authority/plugins/model-council"),
        type: "plugin",
        name: "model-council",
        source: AICustomizationSources.plugin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: void 0
      }];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      assert.strictEqual(count.get(), 1, "before local install: only the harness-reported plugin counts");
      plugins.set([createLocalPlugin("model-council")], void 0);
      await timeout(0);
      assert.strictEqual(count.get(), 1, "after local install: harness duplicate is folded into the local count");
    });
    test("does not double-count local syncable items when itemProvider and syncProvider are both present", async () => {
      const syncProvider_didChange = disposables.add(new Emitter());
      const syncProvider = {
        onDidChange: syncProvider_didChange.event,
        isDisabled: () => false,
        setDisabled: () => {
        }
      };
      const providerWithSync = {
        onDidChange: providerA_didChange.event,
        provideChatSessionCustomizations: (sessionResource, token) => {
          providerA_callCount++;
          return Promise.resolve(providerA_items.slice());
        }
      };
      availableHarnesses.set([createDescriptor("A", providerWithSync, syncProvider), descriptorB], void 0);
      providerA_items = [{
        uri: URI.parse("agent-host://test-authority/agents/coder.agent.md"),
        type: PromptsType.agent,
        name: "Coder",
        source: AICustomizationSources.user,
        extensionId: void 0,
        pluginUri: void 0
      }];
      listPromptFilesResult = [{
        uri: URI.parse("file:///user/agents/coder.agent.md"),
        storage: PromptsStorage.user,
        type: PromptsType.agent
      }];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const items = model.getItems(AICustomizationManagementSection.Agents);
      await model.whenSectionLoaded(AICustomizationManagementSection.Agents);
      assert.deepStrictEqual(items.get().map((i) => i.name), ["Coder"]);
    });
    test("syncProvider.onDidChange does not refetch when itemProvider is present", async () => {
      const syncProvider_didChange = disposables.add(new Emitter());
      const syncProvider = {
        onDidChange: syncProvider_didChange.event,
        isDisabled: () => false,
        setDisabled: () => {
        }
      };
      const providerWithSync = {
        onDidChange: providerA_didChange.event,
        provideChatSessionCustomizations: (sessionResource, token) => {
          providerA_callCount++;
          return Promise.resolve(providerA_items.slice());
        }
      };
      availableHarnesses.set([createDescriptor("A", providerWithSync, syncProvider), descriptorB], void 0);
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      model.getItems(AICustomizationManagementSection.Agents);
      await timeout(0);
      const before = providerA_callCount;
      syncProvider_didChange.fire();
      await timeout(0);
      assert.strictEqual(providerA_callCount, before, "syncProvider events must not trigger refetches when itemProvider owns the data path");
    });
  });
  suite("data sources", () => {
    let disposables;
    let instaService;
    let providerDidChange;
    let providerItems;
    let plugins;
    setup(() => {
      disposables = new DisposableStore();
      providerDidChange = disposables.add(new Emitter());
      providerItems = [];
      plugins = observableValue("plugins", []);
      const provider = {
        onDidChange: providerDidChange.event,
        provideChatSessionCustomizations: (sessionResource2, token) => Promise.resolve(providerItems.slice())
      };
      const descriptor = {
        id: "A",
        label: "A",
        icon: Codicon.settingsGear,
        itemProvider: provider
      };
      const sessionResource = URI.parse("A:///active-session");
      const availableHarnesses = observableValue("availableHarnesses", [descriptor]);
      instaService = workbenchInstantiationService({}, disposables);
      instaService.stub(IPromptsService, {
        onDidChangeCustomAgents: Event.None,
        onDidChangeSlashCommands: Event.None,
        onDidChangeSkills: Event.None,
        onDidChangeHooks: Event.None,
        onDidChangeInstructions: Event.None,
        onDidChangeAgentInstructions: Event.None,
        listPromptFiles: async () => [],
        listPromptFilesForStorage: async () => [],
        getCustomAgents: async () => [],
        findAgentSkills: async () => [],
        getHooks: async () => void 0,
        getInstructionFiles: async () => [],
        getDisabledPromptFiles: () => new ResourceSet()
      });
      instaService.stub(IAICustomizationWorkspaceService, {
        activeProjectRoot: observableValue("test", void 0),
        getActiveProjectRoot: () => void 0,
        managementSections: [AICustomizationManagementSection.Agents],
        isSessionsWindow: false,
        welcomePageFeatures: { showGettingStartedBanner: false },
        getSkillUIIntegrations: () => /* @__PURE__ */ new Map(),
        hasOverrideProjectRoot: observableValue("test", false),
        commitFiles: async () => {
        },
        deleteFiles: async () => {
        },
        generateCustomization: async () => {
        },
        setOverrideProjectRoot: () => {
        },
        clearOverrideProjectRoot: () => {
        }
      });
      const activeSessionResource = observableValue("activeSessionResource", sessionResource);
      const activeHarness = derived((reader) => getChatSessionType(activeSessionResource.read(reader)));
      instaService.stub(ICustomizationHarnessService, {
        activeSessionResource,
        activeHarness,
        availableHarnesses,
        setActiveSession: (sessionResource2) => {
          activeSessionResource.set(sessionResource2, void 0);
        },
        getActiveDescriptor: () => availableHarnesses.get().find((d) => d.id === activeHarness.get()),
        findHarnessById: (id) => availableHarnesses.get().find((d) => d.id === id),
        registerExternalHarness: () => ({ dispose() {
        } })
      });
      instaService.stub(IAgentPluginService, {
        plugins,
        enablementModel: {
          readEnabled: () => ContributionEnablementState.EnabledProfile,
          setEnabled: () => {
          },
          remove: () => {
          }
        }
      });
    });
    teardown(() => disposables.dispose());
    function localPlugin(name) {
      return {
        uri: URI.parse(`plugin-test://${name}`),
        format: PluginFormat.Copilot,
        label: name,
        enablement: observableValue("pluginEnablement", ContributionEnablementState.EnabledProfile),
        remove: () => {
        },
        hooks: observableValue("pluginHooks", []),
        commands: observableValue("pluginCommands", []),
        skills: observableValue("pluginSkills", []),
        agents: observableValue("pluginAgents", []),
        instructions: observableValue("pluginInstructions", []),
        mcpServerDefinitions: observableValue("pluginMcpServerDefinitions", [])
      };
    }
    function harnessPluginRow(name, overrides = {}) {
      return {
        uri: URI.parse(`agent-host://t/plugins/${name}`),
        type: "plugin",
        name,
        source: AICustomizationSources.plugin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: void 0,
        ...overrides
      };
    }
    function providerSkill(name, uri = `agent-host://t/skills/${name}/SKILL.md`) {
      return {
        uri: URI.parse(uri),
        type: PromptsType.skill,
        name,
        source: AICustomizationSources.plugin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: true
      };
    }
    function providerOfType(type, name) {
      return {
        uri: URI.parse(`agent-host://t/${type}/${name}`),
        type,
        name,
        // Hooks pre-expanded items are kept under `plugin` storage; using
        // plugin storage uniformly avoids the file-system expansion path
        // in tests for non-hook types as well.
        source: AICustomizationSources.plugin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: true
      };
    }
    const sectionsByType = [
      [AICustomizationManagementSection.Agents, PromptsType.agent],
      [AICustomizationManagementSection.Skills, PromptsType.skill],
      [AICustomizationManagementSection.Instructions, PromptsType.instructions],
      [AICustomizationManagementSection.Prompts, PromptsType.prompt],
      [AICustomizationManagementSection.Hooks, PromptsType.hook]
    ];
    for (const [section, type] of sectionsByType) {
      test(`getCount(${section}) mirrors provider items filtered by type=${type}`, async () => {
        providerItems = [
          providerOfType(type, "a"),
          providerOfType(type, "b"),
          providerOfType(PromptsType.agent, "unrelated-1"),
          providerOfType(PromptsType.skill, "unrelated-2")
        ];
        const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
        const count = model.getCount(section);
        await model.whenSectionLoaded(section);
        const expected = providerItems.filter((i) => i.type === type).length;
        assert.strictEqual(count.get(), expected, `${section} count should equal provider items where type === ${type}`);
      });
    }
    test("getCount reacts to provider onDidChange for observed sections", async () => {
      providerItems = [providerSkill("one")];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getCount(AICustomizationManagementSection.Skills);
      await model.whenSectionLoaded(AICustomizationManagementSection.Skills);
      assert.strictEqual(count.get(), 1, "initial fetch reflects provider state");
      providerItems = [providerSkill("one"), providerSkill("two")];
      providerDidChange.fire();
      await timeout(0);
      assert.strictEqual(count.get(), 2, "count refetches after provider change");
    });
    test("getPluginCount returns local plugin count when harness has no plugin rows", async () => {
      providerItems = [providerSkill("not-a-plugin-row")];
      plugins.set([localPlugin("local-a"), localPlugin("local-b")], void 0);
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      assert.strictEqual(count.get(), 2, "plugin count uses local plugins when the harness exposes none");
    });
    test("getPluginCount returns harness plugin row count when no local plugins are installed", async () => {
      providerItems = [
        harnessPluginRow("x"),
        harnessPluginRow("y", { type: AICustomizationManagementSection.Plugins }),
        harnessPluginRow("synced", { groupKey: "remote-client" })
      ];
      plugins.set([], void 0);
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      assert.strictEqual(count.get(), 2, 'remote-client harness rows are excluded; both internal "plugin" and API "plugins" types are recognised');
    });
    test("getPluginCount sums local plugins and unique harness plugin rows", async () => {
      providerItems = [
        harnessPluginRow("dup"),
        harnessPluginRow("uniq")
      ];
      plugins.set([localPlugin("dup"), localPlugin("local-only")], void 0);
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      assert.strictEqual(count.get(), 3, "dup is counted once via the local source; uniq adds, local-only adds");
    });
    test("getPluginCount dedups against URI basename when local plugin label is empty", async () => {
      providerItems = [harnessPluginRow("basename-match")];
      const labelless = {
        ...localPlugin("basename-match"),
        uri: URI.parse("plugin-test:///basename-match"),
        label: ""
      };
      plugins.set([labelless], void 0);
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      assert.strictEqual(count.get(), 1, "remote row is folded into the labelless local plugin via basename");
    });
  });
  suite("agent host item source caches all types", () => {
    let disposables;
    let instaService;
    let providerItems;
    setup(() => {
      disposables = new DisposableStore();
      providerItems = [];
      const sessionType = "agent-host-test";
      const provider = {
        onDidChange: Event.None,
        provideChatSessionCustomizations: () => Promise.resolve(providerItems.slice())
      };
      const descriptor = {
        id: sessionType,
        label: "Agent Host Test",
        icon: Codicon.settingsGear,
        itemProvider: provider
      };
      const sessionResource = URI.parse(`${sessionType}:///active-session`);
      const availableHarnesses = observableValue("availableHarnesses", [descriptor]);
      instaService = workbenchInstantiationService({}, disposables);
      instaService.stub(IPromptsService, {
        onDidChangeCustomAgents: Event.None,
        onDidChangeSlashCommands: Event.None,
        onDidChangeSkills: Event.None,
        onDidChangeHooks: Event.None,
        onDidChangeInstructions: Event.None,
        onDidChangeAgentInstructions: Event.None,
        listPromptFiles: async () => [],
        listPromptFilesForStorage: async () => [],
        getCustomAgents: async () => [],
        findAgentSkills: async () => [],
        getHooks: async () => void 0,
        getInstructionFiles: async () => [],
        getDisabledPromptFiles: () => new ResourceSet()
      });
      instaService.stub(IAICustomizationWorkspaceService, {
        activeProjectRoot: observableValue("test", void 0),
        getActiveProjectRoot: () => void 0,
        managementSections: [AICustomizationManagementSection.Agents],
        isSessionsWindow: false,
        welcomePageFeatures: { showGettingStartedBanner: false },
        getSkillUIIntegrations: () => /* @__PURE__ */ new Map(),
        hasOverrideProjectRoot: observableValue("test", false),
        commitFiles: async () => {
        },
        deleteFiles: async () => {
        },
        generateCustomization: async () => {
        },
        setOverrideProjectRoot: () => {
        },
        clearOverrideProjectRoot: () => {
        }
      });
      const activeSessionResource = observableValue("activeSessionResource", sessionResource);
      const activeHarness = derived((reader) => getChatSessionType(activeSessionResource.read(reader)));
      instaService.stub(ICustomizationHarnessService, {
        activeSessionResource,
        activeHarness,
        availableHarnesses,
        setActiveSession: (next) => activeSessionResource.set(next, void 0),
        getActiveDescriptor: () => availableHarnesses.get().find((d) => d.id === activeHarness.get()),
        findHarnessById: (id) => availableHarnesses.get().find((d) => d.id === id),
        registerExternalHarness: () => ({ dispose() {
        } })
      });
      instaService.stub(IAgentPluginService, {
        plugins: observableValue("plugins", []),
        enablementModel: {
          readEnabled: () => ContributionEnablementState.EnabledProfile,
          setEnabled: () => {
          },
          remove: () => {
          }
        }
      });
    });
    teardown(() => disposables.dispose());
    test("observing one section does not hide items of other sections", async () => {
      providerItems = [
        { uri: URI.parse("agent-host://t/agents/coder.agent.md"), type: PromptsType.agent, name: "coder", source: AICustomizationSources.plugin, extensionId: void 0, pluginUri: void 0, userInvocable: true },
        { uri: URI.parse("agent-host://t/rules/style.instructions.md"), type: PromptsType.instructions, name: "style", source: AICustomizationSources.plugin, extensionId: void 0, pluginUri: void 0, userInvocable: void 0 },
        { uri: URI.parse("agent-host://t/skills/repo/SKILL.md"), type: PromptsType.skill, name: "repo", source: AICustomizationSources.plugin, extensionId: void 0, pluginUri: void 0, userInvocable: true }
      ];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const agentItems = model.getItems(AICustomizationManagementSection.Agents);
      await model.whenSectionLoaded(AICustomizationManagementSection.Agents);
      const instructionItems = model.getItems(AICustomizationManagementSection.Instructions);
      await model.whenSectionLoaded(AICustomizationManagementSection.Instructions);
      assert.deepStrictEqual(
        {
          agents: agentItems.get().map((i) => i.name).sort(),
          instructions: instructionItems.get().map((i) => i.name).sort()
        },
        {
          agents: ["coder"],
          instructions: ["style"]
        }
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25JdGVtc01vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIElPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFBsdWdpbkZvcm1hdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24sIEFJQ3VzdG9taXphdGlvblNvdXJjZXMsIEJVSUxUSU5fU1RPUkFHRSwgSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLCBJQ3VzdG9taXphdGlvbkl0ZW0sIElDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyLCBJQ3VzdG9taXphdGlvblN5bmNQcm92aWRlciwgSUhhcm5lc3NEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW5TZXJ2aWNlLCB0eXBlIElBZ2VudFBsdWdpbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSwgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTb3VyY2UsIElDdXN0b21BZ2VudCwgSVByb21wdFBhdGgsIElQcm9tcHRzU2VydmljZSwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuXG5zdWl0ZSgnQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2Jhc2ljcycsICgpID0+IHtcblxuXHRcdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRcdGxldCBpbnN0YVNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHRsZXQgYWN0aXZlU2Vzc2lvblJlc291cmNlOiBJU2V0dGFibGVPYnNlcnZhYmxlPFVSST47XG5cdFx0bGV0IGFjdGl2ZUhhcm5lc3M6IElPYnNlcnZhYmxlPHN0cmluZz47XG5cdFx0bGV0IGF2YWlsYWJsZUhhcm5lc3NlczogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBJSGFybmVzc0Rlc2NyaXB0b3JbXT47XG5cdFx0bGV0IGRlc2NyaXB0b3JBOiBJSGFybmVzc0Rlc2NyaXB0b3I7XG5cdFx0bGV0IGRlc2NyaXB0b3JCOiBJSGFybmVzc0Rlc2NyaXB0b3I7XG5cdFx0bGV0IHByb3ZpZGVyQV9kaWRDaGFuZ2U6IEVtaXR0ZXI8dm9pZD47XG5cdFx0bGV0IHByb3ZpZGVyQV9jYWxsQ291bnQ6IG51bWJlcjtcblx0XHRsZXQgcHJvdmlkZXJBX2l0ZW1zOiBJQ3VzdG9taXphdGlvbkl0ZW1bXTtcblx0XHRsZXQgcGx1Z2luczogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBJQWdlbnRQbHVnaW5bXT47XG5cdFx0bGV0IGxpc3RQcm9tcHRGaWxlc1Jlc3VsdDogQXdhaXRlZDxSZXR1cm5UeXBlPElQcm9tcHRzU2VydmljZVsnbGlzdFByb21wdEZpbGVzJ10+Pjtcblx0XHRsZXQgZGlzYWJsZWRQcm9tcHRGaWxlc1Jlc3VsdDogUmVzb3VyY2VTZXQ7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVEZXNjcmlwdG9yKGlkOiBzdHJpbmcsIHByb3ZpZGVyOiBJQ3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciB8IHVuZGVmaW5lZCwgc3luY1Byb3ZpZGVyPzogSUN1c3RvbWl6YXRpb25TeW5jUHJvdmlkZXIpOiBJSGFybmVzc0Rlc2NyaXB0b3Ige1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGxhYmVsOiBpZCxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5zZXR0aW5nc0dlYXIsXG5cdFx0XHRcdGl0ZW1Qcm92aWRlcjogcHJvdmlkZXIsXG5cdFx0XHRcdHN5bmNQcm92aWRlcixcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRwcm92aWRlckFfZGlkQ2hhbmdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0cHJvdmlkZXJBX2NhbGxDb3VudCA9IDA7XG5cdFx0XHRwcm92aWRlckFfaXRlbXMgPSBbXTtcblx0XHRcdGxpc3RQcm9tcHRGaWxlc1Jlc3VsdCA9IFtdO1xuXHRcdFx0ZGlzYWJsZWRQcm9tcHRGaWxlc1Jlc3VsdCA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlckE6IElDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyID0ge1xuXHRcdFx0XHRvbkRpZENoYW5nZTogcHJvdmlkZXJBX2RpZENoYW5nZS5ldmVudCxcblx0XHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdFx0cHJvdmlkZXJBX2NhbGxDb3VudCsrO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocHJvdmlkZXJBX2l0ZW1zLnNsaWNlKCkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyQjogSUN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIgPSB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uczogKHNlc3Npb25SZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2UucmVzb2x2ZShbXSksXG5cdFx0XHR9O1xuXHRcdFx0ZGVzY3JpcHRvckEgPSBjcmVhdGVEZXNjcmlwdG9yKCdBJywgcHJvdmlkZXJBKTtcblx0XHRcdGRlc2NyaXB0b3JCID0gY3JlYXRlRGVzY3JpcHRvcignQicsIHByb3ZpZGVyQik7XG5cblx0XHRcdGFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IG9ic2VydmFibGVWYWx1ZSgnYWN0aXZlU2Vzc2lvblJlc291cmNlJywgVVJJLnBhcnNlKGBBOi8vL3Nlc3Npb25gKSk7XG5cdFx0XHRhY3RpdmVIYXJuZXNzID0gZGVyaXZlZChyZWFkZXIgPT4gZ2V0Q2hhdFNlc3Npb25UeXBlKGFjdGl2ZVNlc3Npb25SZXNvdXJjZS5yZWFkKHJlYWRlcikpKTtcblx0XHRcdGF2YWlsYWJsZUhhcm5lc3NlcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJSGFybmVzc0Rlc2NyaXB0b3JbXT4oJ2F2YWlsYWJsZUhhcm5lc3NlcycsIFtkZXNjcmlwdG9yQSwgZGVzY3JpcHRvckJdKTtcblx0XHRcdHBsdWdpbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luW10+KCdwbHVnaW5zJywgW10pO1xuXG5cdFx0XHRpbnN0YVNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7fSwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRmdW5jdGlvbiBjdXN0b21BZ2VudEZyb21Qcm9tcHRQYXRoKHByb21wdEZpbGU6IElQcm9tcHRQYXRoKTogSUN1c3RvbUFnZW50IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogcHJvbXB0RmlsZS51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHR1cmk6IHByb21wdEZpbGUudXJpLFxuXHRcdFx0XHRcdG5hbWU6IHByb21wdEZpbGUubmFtZSA/PyBiYXNlbmFtZShwcm9tcHRGaWxlLnVyaSksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHByb21wdEZpbGUuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuVlNDb2RlLFxuXHRcdFx0XHRcdHZpc2liaWxpdHk6IHsgYWdlbnRJbnZvY2FibGU6IHRydWUsIHVzZXJJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0XHRlbmFibGVkOiAhZGlzYWJsZWRQcm9tcHRGaWxlc1Jlc3VsdC5oYXMocHJvbXB0RmlsZS51cmkpLFxuXHRcdFx0XHRcdHNvdXJjZTogSUFnZW50U291cmNlLmZyb21Qcm9tcHRQYXRoKHByb21wdEZpbGUpLFxuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7IGNvbnRlbnQ6ICcnLCB0b29sUmVmZXJlbmNlczogW10gfSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZVNsYXNoQ29tbWFuZHM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlU2tpbGxzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZUhvb2tzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZUluc3RydWN0aW9uczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VBZ2VudEluc3RydWN0aW9uczogRXZlbnQuTm9uZSxcblx0XHRcdFx0bGlzdFByb21wdEZpbGVzOiBhc3luYyAodHlwZTogUHJvbXB0c1R5cGUpID0+IGxpc3RQcm9tcHRGaWxlc1Jlc3VsdC5maWx0ZXIoZiA9PiBmLnR5cGUgPT09IHR5cGUpLFxuXHRcdFx0XHRsaXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdFx0Z2V0Q3VzdG9tQWdlbnRzOiBhc3luYyAoKSA9PiBsaXN0UHJvbXB0RmlsZXNSZXN1bHQuZmlsdGVyKGYgPT4gZi50eXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCkubWFwKGN1c3RvbUFnZW50RnJvbVByb21wdFBhdGgpLFxuXHRcdFx0XHRmaW5kQWdlbnRTa2lsbHM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRnZXRIb29rczogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRnZXRJbnN0cnVjdGlvbkZpbGVzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdFx0Z2V0UHJvbXB0U2xhc2hDb21tYW5kczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGxpc3RBZ2VudEluc3RydWN0aW9uczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldERpc2FibGVkUHJvbXB0RmlsZXM6ICgpID0+IGRpc2FibGVkUHJvbXB0RmlsZXNSZXN1bHQsXG5cdFx0XHR9KTtcblxuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsIHtcblx0XHRcdFx0YWN0aXZlUHJvamVjdFJvb3Q6IG9ic2VydmFibGVWYWx1ZSgndGVzdCcsIHVuZGVmaW5lZCksXG5cdFx0XHRcdGdldEFjdGl2ZVByb2plY3RSb290OiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdG1hbmFnZW1lbnRTZWN0aW9uczogW0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50c10sXG5cdFx0XHRcdGlzU2Vzc2lvbnNXaW5kb3c6IGZhbHNlLFxuXHRcdFx0XHR3ZWxjb21lUGFnZUZlYXR1cmVzOiB7IHNob3dHZXR0aW5nU3RhcnRlZEJhbm5lcjogZmFsc2UgfSxcblx0XHRcdFx0Z2V0U2tpbGxVSUludGVncmF0aW9uczogKCkgPT4gbmV3IE1hcCgpLFxuXHRcdFx0XHRoYXNPdmVycmlkZVByb2plY3RSb290OiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCBmYWxzZSksXG5cdFx0XHRcdGNvbW1pdEZpbGVzOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdGRlbGV0ZUZpbGVzOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdGdlbmVyYXRlQ3VzdG9taXphdGlvbjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRzZXRPdmVycmlkZVByb2plY3RSb290OiAoKSA9PiB7IH0sXG5cdFx0XHRcdGNsZWFyT3ZlcnJpZGVQcm9qZWN0Um9vdDogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGluc3RhU2VydmljZS5zdHViKElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIHtcblx0XHRcdFx0YWN0aXZlU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRhY3RpdmVIYXJuZXNzLFxuXHRcdFx0XHRhdmFpbGFibGVIYXJuZXNzZXMsXG5cdFx0XHRcdHNldEFjdGl2ZVNlc3Npb246IChzZXNzaW9uUmVzb3VyY2U6IFVSSSkgPT4ge1xuXHRcdFx0XHRcdGFjdGl2ZVNlc3Npb25SZXNvdXJjZS5zZXQoc2Vzc2lvblJlc291cmNlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRBY3RpdmVEZXNjcmlwdG9yOiAoKSA9PiBhdmFpbGFibGVIYXJuZXNzZXMuZ2V0KCkuZmluZChkID0+IGQuaWQgPT09IGFjdGl2ZUhhcm5lc3MuZ2V0KCkpISxcblx0XHRcdFx0ZmluZEhhcm5lc3NCeUlkOiAoaWQ6IHN0cmluZykgPT4gYXZhaWxhYmxlSGFybmVzc2VzLmdldCgpLmZpbmQoZCA9PiBkLmlkID09PSBpZCksXG5cdFx0XHRcdHJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzOiAoKSA9PiAoeyBkaXNwb3NlKCkgeyB9IH0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGluc3RhU2VydmljZS5zdHViKElBZ2VudFBsdWdpblNlcnZpY2UsIHtcblx0XHRcdFx0cGx1Z2lucyxcblx0XHRcdFx0ZW5hYmxlbWVudE1vZGVsOiB7XG5cdFx0XHRcdFx0cmVhZEVuYWJsZWQ6ICgpID0+IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSxcblx0XHRcdFx0XHRzZXRFbmFibGVkOiAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0cmVtb3ZlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZUxvY2FsUGx1Z2luKG5hbWU6IHN0cmluZyk6IElBZ2VudFBsdWdpbiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZShgcGx1Z2luLXRlc3Q6Ly8ke25hbWV9YCksXG5cdFx0XHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkNvcGlsb3QsXG5cdFx0XHRcdGxhYmVsOiBuYW1lLFxuXHRcdFx0XHRlbmFibGVtZW50OiBvYnNlcnZhYmxlVmFsdWUoJ3BsdWdpbkVuYWJsZW1lbnQnLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUpLFxuXHRcdFx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0XHRcdFx0aG9va3M6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luSG9va3MnLCBbXSksXG5cdFx0XHRcdGNvbW1hbmRzOiBvYnNlcnZhYmxlVmFsdWUoJ3BsdWdpbkNvbW1hbmRzJywgW10pLFxuXHRcdFx0XHRza2lsbHM6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luU2tpbGxzJywgW10pLFxuXHRcdFx0XHRhZ2VudHM6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luQWdlbnRzJywgW10pLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luSW5zdHJ1Y3Rpb25zJywgW10pLFxuXHRcdFx0XHRtY3BTZXJ2ZXJEZWZpbml0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCdwbHVnaW5NY3BTZXJ2ZXJEZWZpbml0aW9ucycsIFtdKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblxuXHRcdHRlc3QoJ2V4cG9zZXMgcGVyLXNlY3Rpb24gb2JzZXJ2YWJsZXMgZm9yIGFsbCBwcm9tcHRzLWJhc2VkIHNlY3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpKTtcblx0XHRcdGFzc2VydC5vayhtb2RlbC5nZXRJdGVtcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMpKTtcblx0XHRcdGFzc2VydC5vayhtb2RlbC5nZXRJdGVtcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMpKTtcblx0XHRcdGFzc2VydC5vayhtb2RlbC5nZXRJdGVtcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMpKTtcblx0XHRcdGFzc2VydC5vayhtb2RlbC5nZXRJdGVtcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Qcm9tcHRzKSk7XG5cdFx0XHRhc3NlcnQub2sobW9kZWwuZ2V0SXRlbXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSG9va3MpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGZldGNoIG9uIGNvbnN0cnVjdGlvbiAobGF6eSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJBX2NhbGxDb3VudCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaXJzdCByZWFkIG9mIGEgc2VjdGlvbiB0cmlnZ2VycyBhIGZldGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpKTtcblx0XHRcdG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyQV9jYWxsQ291bnQsIDEpO1xuXHRcdFx0Ly8gUmVhZGluZyBhIGRpZmZlcmVudCBzZWN0aW9uIGRvZXMgbm90IHRyaWdnZXIsIGFzIHRoZSBpdGVtcyBhcmUgY2FjaGVkXG5cdFx0XHRtb2RlbC5nZXRJdGVtcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlckFfY2FsbENvdW50LCAxKTtcblxuXHRcdFx0cHJvdmlkZXJBX2RpZENoYW5nZS5maXJlKCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyQV9jYWxsQ291bnQsIDIpO1xuXHRcdFx0bW9kZWwuZ2V0SXRlbXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlckFfY2FsbENvdW50LCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NvdXJjZS5vbkRpZENoYW5nZSByZWZldGNoZXMgb25seSBwcmV2aW91c2x5LW9ic2VydmVkIHNlY3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpKTtcblx0XHRcdG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0Y29uc3QgYmVmb3JlID0gcHJvdmlkZXJBX2NhbGxDb3VudDtcblx0XHRcdHByb3ZpZGVyQV9kaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdC8vIE9uZSByZWZldGNoIGZvciB0aGUgb25lIG9ic2VydmVkIHNlY3Rpb24gXHUyMDE0IG5vdCA1LlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyQV9jYWxsQ291bnQsIGJlZm9yZSArIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3dpdGNoaW5nIGhhcm5lc3MgcmUtYmluZHMgYW5kIHJlZmV0Y2hlcyBvYnNlcnZlZCBzZWN0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRtb2RlbC5nZXRJdGVtcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGNvbnN0IHNvdXJjZUEgPSBtb2RlbC5nZXRBY3RpdmVJdGVtU291cmNlKCk7XG5cdFx0XHRhY3RpdmVTZXNzaW9uUmVzb3VyY2Uuc2V0KFVSSS5wYXJzZSgnQjovL3Nlc3Npb24nKSwgdW5kZWZpbmVkKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRjb25zdCBzb3VyY2VCID0gbW9kZWwuZ2V0QWN0aXZlSXRlbVNvdXJjZSgpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHNvdXJjZUEsIHNvdXJjZUIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIHByb3ZpZGVyLXN1cHBsaWVkIHBsdWdpbiBzdG9yYWdlIHdoZW4gcGx1Z2luVXJpIGlzIG9taXR0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRwcm92aWRlckFfaXRlbXMgPSBbe1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDovL3Rlc3QtYXV0aG9yaXR5L3BsdWdpbnMvbXktcGx1Z2luL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCxcblx0XHRcdFx0bmFtZTogJ015IFNraWxsJyxcblx0XHRcdFx0c291cmNlOiBQcm9tcHRzU3RvcmFnZS5wbHVnaW4sXG5cdFx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHR1c2VySW52b2NhYmxlOiB0cnVlLFxuXHRcdFx0fV07XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyk7XG5cdFx0XHRhd2FpdCBtb2RlbC53aGVuU2VjdGlvbkxvYWRlZChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLmdldCgpLm1hcChpdGVtID0+ICh7XG5cdFx0XHRcdG5hbWU6IGl0ZW0ubmFtZSxcblx0XHRcdFx0c291cmNlOiBpdGVtLnNvdXJjZSxcblx0XHRcdH0pKSwgW3tcblx0XHRcdFx0bmFtZTogJ015IFNraWxsJyxcblx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbixcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBwcm92aWRlci1zdXBwbGllZCBidWlsdGluIHN0b3JhZ2Ugd2hlbiBncm91cEtleSBpcyBvbWl0dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cHJvdmlkZXJBX2l0ZW1zID0gW3tcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2FnZW50LWhvc3Q6Ly90ZXN0LWF1dGhvcml0eS9idWlsdGluL3NraWxscy9naXRodWIvU0tJTEwubWQnKSxcblx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsXG5cdFx0XHRcdG5hbWU6ICdCdWlsdC1pbiBTa2lsbCcsXG5cdFx0XHRcdHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlcy5idWlsdGluLFxuXHRcdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwbHVnaW5Vcmk6IHVuZGVmaW5lZCxcblx0XHRcdFx0dXNlckludm9jYWJsZTogdHJ1ZSxcblx0XHRcdH1dO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBtb2RlbC5nZXRJdGVtcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMpO1xuXHRcdFx0YXdhaXQgbW9kZWwud2hlblNlY3Rpb25Mb2FkZWQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5nZXQoKS5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0XHRuYW1lOiBpdGVtLm5hbWUsXG5cdFx0XHRcdHNvdXJjZTogaXRlbS5zb3VyY2UsXG5cdFx0XHRcdGdyb3VwS2V5OiBpdGVtLmdyb3VwS2V5LFxuXHRcdFx0XHRpc0J1aWx0aW46IGl0ZW0uaXNCdWlsdGluLFxuXHRcdFx0fSkpLCBbe1xuXHRcdFx0XHRuYW1lOiAnQnVpbHQtaW4gU2tpbGwnLFxuXHRcdFx0XHRzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuYnVpbHRpbixcblx0XHRcdFx0Z3JvdXBLZXk6IEJVSUxUSU5fU1RPUkFHRSxcblx0XHRcdFx0aXNCdWlsdGluOiB0cnVlLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIGJ1aWx0aW4gZ3JvdXBpbmcgd2hlbiBvbmx5IGdyb3VwS2V5IGlzIHNldCAobm8gc3RvcmFnZS9leHRlbnNpb25JZC9wbHVnaW5VcmkpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gUmVwcm8gb2YgXCJBZ2VudHMgYXBwIGJ1aWx0LWluIHNob3duIGFzIFVzZXJcIjogdGhlIEFnZW50cyBhcHBcblx0XHRcdC8vIGN1c3RvbWl6YXRpb24gcHJvdmlkZXIgZGVjbGFyZXMgaXRzIGJ1aWx0LWluIGFnZW50cyBvbmx5IHZpYVxuXHRcdFx0Ly8gYGdyb3VwS2V5OiBCVUlMVElOX1NUT1JBR0VgIFx1MjAxNCB3aXRob3V0IGBzdG9yYWdlYCwgYGV4dGVuc2lvbklkYCxcblx0XHRcdC8vIGBwbHVnaW5VcmlgLCBvciBhIHdvcmtzcGFjZS1hbmNob3JlZCBVUkkuIFRoZSBVUkktc25pZmZpbmdcblx0XHRcdC8vIGZhbGxiYWNrIGluIHRoZSBub3JtYWxpemVyIG11c3QgcHJlc2VydmUgZ3JvdXBLZXkvaXNCdWlsdGluIHNvXG5cdFx0XHQvLyB0aGUgbGlzdCB3aWRnZXQgcmVuZGVycyB0aGVtIHVuZGVyIFwiQnVpbHQtaW5cIiBpbnN0ZWFkIG9mIFwiVXNlclwiLlxuXHRcdFx0cHJvdmlkZXJBX2l0ZW1zID0gW3tcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2FnZW50LWFwcDovL2J1aWx0aW4vY29kZXIuYWdlbnQubWQnKSxcblx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsXG5cdFx0XHRcdG5hbWU6ICdDb2RlcicsXG5cdFx0XHRcdGdyb3VwS2V5OiBCVUlMVElOX1NUT1JBR0UsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuYnVpbHRpbiwgLy8gSWdub3JlZCwgc2hvdWxkIGJlIG92ZXJyaWRkZW4gYnkgZ3JvdXBLZXlcblx0XHRcdH1dO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBtb2RlbC5nZXRJdGVtcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMpO1xuXHRcdFx0YXdhaXQgbW9kZWwud2hlblNlY3Rpb25Mb2FkZWQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5nZXQoKS5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0XHRuYW1lOiBpdGVtLm5hbWUsXG5cdFx0XHRcdGdyb3VwS2V5OiBpdGVtLmdyb3VwS2V5LFxuXHRcdFx0XHRpc0J1aWx0aW46IGl0ZW0uaXNCdWlsdGluLFxuXHRcdFx0fSkpLCBbe1xuXHRcdFx0XHRuYW1lOiAnQ29kZXInLFxuXHRcdFx0XHRncm91cEtleTogQlVJTFRJTl9TVE9SQUdFLFxuXHRcdFx0XHRpc0J1aWx0aW46IHRydWUsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm9tcHQgc2VydmljZSBpdGVtcyBwcmVzZXJ2ZSBzdG9yYWdlIGdyb3VwaW5nLCBtZXRhZGF0YSwgYW5kIGRpc2FibGVkIHN0YXRlIHdpdGhvdXQgc3luYyBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGF2YWlsYWJsZUhhcm5lc3Nlcy5zZXQoW2NyZWF0ZURlc2NyaXB0b3IoJ0EnLCB1bmRlZmluZWQpLCBkZXNjcmlwdG9yQl0sIHVuZGVmaW5lZCk7XG5cdFx0XHRhY3RpdmVTZXNzaW9uUmVzb3VyY2Uuc2V0KFVSSS5wYXJzZSgnQTovLy9zZXNzaW9uMicpLCB1bmRlZmluZWQpO1xuXHRcdFx0bGlzdFByb21wdEZpbGVzUmVzdWx0ID0gW3tcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlL2FnZW50cy90ZWFtLWFnZW50LmFnZW50Lm1kJyksXG5cdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCxcblx0XHRcdFx0bmFtZTogJ1RlYW0gQWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtzcGFjZSBhZ2VudCBkZXNjcmlwdGlvbicsXG5cdFx0XHR9XTtcblx0XHRcdGRpc2FibGVkUHJvbXB0RmlsZXNSZXN1bHQgPSBuZXcgUmVzb3VyY2VTZXQoW2xpc3RQcm9tcHRGaWxlc1Jlc3VsdFswXS51cmldKTtcblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gbW9kZWwuZ2V0SXRlbXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzKTtcblx0XHRcdGF3YWl0IG1vZGVsLndoZW5TZWN0aW9uTG9hZGVkKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMuZ2V0KCkubWFwKGl0ZW0gPT4gKHtcblx0XHRcdFx0aWQ6IGl0ZW0uaWQsXG5cdFx0XHRcdHVyaTogaXRlbS51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0bmFtZTogaXRlbS5uYW1lLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogaXRlbS5kZXNjcmlwdGlvbixcblx0XHRcdFx0c291cmNlOiBpdGVtLnNvdXJjZSxcblx0XHRcdFx0ZGlzYWJsZWQ6IGl0ZW0uZGlzYWJsZWQsXG5cdFx0XHRcdGdyb3VwS2V5OiBpdGVtLmdyb3VwS2V5LFxuXHRcdFx0XHRzeW5jYWJsZTogaXRlbS5zeW5jYWJsZSxcblx0XHRcdFx0c3luY2VkOiBpdGVtLnN5bmNlZCxcblx0XHRcdH0pKSwgW3tcblx0XHRcdFx0aWQ6ICdmaWxlOi8vL3dvcmtzcGFjZS9hZ2VudHMvdGVhbS1hZ2VudC5hZ2VudC5tZCcsXG5cdFx0XHRcdHVyaTogJ2ZpbGU6Ly8vd29ya3NwYWNlL2FnZW50cy90ZWFtLWFnZW50LmFnZW50Lm1kJyxcblx0XHRcdFx0bmFtZTogJ1RlYW0gQWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtzcGFjZSBhZ2VudCBkZXNjcmlwdGlvbicsXG5cdFx0XHRcdHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlcy5sb2NhbCxcblx0XHRcdFx0ZGlzYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGdyb3VwS2V5OiB1bmRlZmluZWQsXG5cdFx0XHRcdHN5bmNhYmxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN5bmNlZDogdW5kZWZpbmVkLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGx1Z2luIGNvdW50IGluY2x1ZGVzIHByb3ZpZGVyLXN1cHBsaWVkIHBsdWdpbiBpdGVtcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHByb3ZpZGVyQV9pdGVtcyA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdhZ2VudC1ob3N0Oi8vdGVzdC1hdXRob3JpdHkvcGx1Z2lucy9yZW1vdGUtb25lJyksXG5cdFx0XHRcdFx0dHlwZTogJ3BsdWdpbicsXG5cdFx0XHRcdFx0bmFtZTogJ1JlbW90ZSBPbmUnLFxuXHRcdFx0XHRcdHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwbHVnaW5Vcmk6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1c2VySW52b2NhYmxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDovL3Rlc3QtYXV0aG9yaXR5L3BsdWdpbnMvcmVtb3RlLXR3bycpLFxuXHRcdFx0XHRcdHR5cGU6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMsXG5cdFx0XHRcdFx0bmFtZTogJ1JlbW90ZSBUd28nLFxuXHRcdFx0XHRcdHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwbHVnaW5Vcmk6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1c2VySW52b2NhYmxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDovL3Rlc3QtYXV0aG9yaXR5L3BsdWdpbnMvcmVtb3RlLXR3by9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSxcblx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCxcblx0XHRcdFx0XHRuYW1lOiAnTXkgU2tpbGwnLFxuXHRcdFx0XHRcdHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwbHVnaW5Vcmk6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1c2VySW52b2NhYmxlOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2FnZW50LWhvc3Q6Ly90ZXN0LWF1dGhvcml0eS9wbHVnaW5zL2xvY2FsLXN5bmNlZCcpLFxuXHRcdFx0XHRcdHR5cGU6ICdwbHVnaW4nLFxuXHRcdFx0XHRcdG5hbWU6ICdMb2NhbCBTeW5jZWQnLFxuXHRcdFx0XHRcdHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sXG5cdFx0XHRcdFx0Z3JvdXBLZXk6ICdyZW1vdGUtY2xpZW50Jyxcblx0XHRcdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVzZXJJbnZvY2FibGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRjb25zdCBjb3VudCA9IG1vZGVsLmdldFBsdWdpbkNvdW50KCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQuZ2V0KCksIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbG9jYWwgcGx1Z2luIGNoYW5nZXMgdXBkYXRlIHBsdWdpbiBjb3VudCB3aXRob3V0IHJlZmV0Y2hpbmcgcHJvdmlkZXIgY3VzdG9taXphdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRwcm92aWRlckFfaXRlbXMgPSBbe1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDovL3Rlc3QtYXV0aG9yaXR5L3BsdWdpbnMvcmVtb3RlLW9uZScpLFxuXHRcdFx0XHR0eXBlOiAncGx1Z2luJyxcblx0XHRcdFx0bmFtZTogJ1JlbW90ZSBPbmUnLFxuXHRcdFx0XHRzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLFxuXHRcdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwbHVnaW5Vcmk6IHVuZGVmaW5lZCxcblx0XHRcdFx0dXNlckludm9jYWJsZTogdW5kZWZpbmVkLFxuXHRcdFx0fV07XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRjb25zdCBjb3VudCA9IG1vZGVsLmdldFBsdWdpbkNvdW50KCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0Y29uc3QgY2FsbHNBZnRlckluaXRpYWxDb3VudCA9IHByb3ZpZGVyQV9jYWxsQ291bnQ7XG5cblx0XHRcdHBsdWdpbnMuc2V0KFtjcmVhdGVMb2NhbFBsdWdpbignbG9jYWwtb25lJyldLCB1bmRlZmluZWQpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNvdW50OiBjb3VudC5nZXQoKSxcblx0XHRcdFx0cHJvdmlkZXJBX2NhbGxDb3VudCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y291bnQ6IDIsXG5cdFx0XHRcdHByb3ZpZGVyQV9jYWxsQ291bnQ6IGNhbGxzQWZ0ZXJJbml0aWFsQ291bnQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BsdWdpbiBjb3VudCBkZWR1cGVzIHByb3ZpZGVyIHBsdWdpbnMgdGhhdCBhcmUgYWxzbyBpbnN0YWxsZWQgbG9jYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRcdHByb3ZpZGVyQV9pdGVtcyA9IFt7XG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdhZ2VudC1ob3N0Oi8vdGVzdC1hdXRob3JpdHkvcGx1Z2lucy9tb2RlbC1jb3VuY2lsJyksXG5cdFx0XHRcdHR5cGU6ICdwbHVnaW4nLFxuXHRcdFx0XHRuYW1lOiAnbW9kZWwtY291bmNpbCcsXG5cdFx0XHRcdHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sXG5cdFx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHR1c2VySW52b2NhYmxlOiB1bmRlZmluZWQsXG5cdFx0XHR9XTtcblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpKTtcblx0XHRcdGNvbnN0IGNvdW50ID0gbW9kZWwuZ2V0UGx1Z2luQ291bnQoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQuZ2V0KCksIDEsICdiZWZvcmUgbG9jYWwgaW5zdGFsbDogb25seSB0aGUgaGFybmVzcy1yZXBvcnRlZCBwbHVnaW4gY291bnRzJyk7XG5cblx0XHRcdHBsdWdpbnMuc2V0KFtjcmVhdGVMb2NhbFBsdWdpbignbW9kZWwtY291bmNpbCcpXSwgdW5kZWZpbmVkKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudC5nZXQoKSwgMSwgJ2FmdGVyIGxvY2FsIGluc3RhbGw6IGhhcm5lc3MgZHVwbGljYXRlIGlzIGZvbGRlZCBpbnRvIHRoZSBsb2NhbCBjb3VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZG91YmxlLWNvdW50IGxvY2FsIHN5bmNhYmxlIGl0ZW1zIHdoZW4gaXRlbVByb3ZpZGVyIGFuZCBzeW5jUHJvdmlkZXIgYXJlIGJvdGggcHJlc2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFJlZ3Jlc3Npb246IFByb3ZpZGVyQ3VzdG9taXphdGlvbkl0ZW1Tb3VyY2UuZmV0Y2hJdGVtcyB1c2VkIHRvIHVuY29uZGl0aW9uYWxseVxuXHRcdFx0Ly8gYXBwZW5kIGZldGNoTG9jYWxTeW5jYWJsZUl0ZW1zIGV2ZW4gd2hlbiBhbiBpdGVtUHJvdmlkZXIgd2FzIHByZXNlbnQsIGNhdXNpbmdcblx0XHRcdC8vIGl0ZW1zIHJlcG9ydGVkIGJ5IHRoZSBwcm92aWRlciB0byBhbHNvIHNob3cgdXAgdmlhIGxvY2FsIGVudW1lcmF0aW9uLlxuXHRcdFx0Y29uc3Qgc3luY1Byb3ZpZGVyX2RpZENoYW5nZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdGNvbnN0IHN5bmNQcm92aWRlcjogSUN1c3RvbWl6YXRpb25TeW5jUHJvdmlkZXIgPSB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlOiBzeW5jUHJvdmlkZXJfZGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0XHRpc0Rpc2FibGVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0RGlzYWJsZWQ6ICgpID0+IHsgfSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwcm92aWRlcldpdGhTeW5jOiBJQ3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciA9IHtcblx0XHRcdFx0b25EaWRDaGFuZ2U6IHByb3ZpZGVyQV9kaWRDaGFuZ2UuZXZlbnQsXG5cdFx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiAoc2Vzc2lvblJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRcdHByb3ZpZGVyQV9jYWxsQ291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHByb3ZpZGVyQV9pdGVtcy5zbGljZSgpKTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRhdmFpbGFibGVIYXJuZXNzZXMuc2V0KFtjcmVhdGVEZXNjcmlwdG9yKCdBJywgcHJvdmlkZXJXaXRoU3luYywgc3luY1Byb3ZpZGVyKSwgZGVzY3JpcHRvckJdLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRwcm92aWRlckFfaXRlbXMgPSBbe1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDovL3Rlc3QtYXV0aG9yaXR5L2FnZW50cy9jb2Rlci5hZ2VudC5tZCcpLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCxcblx0XHRcdFx0bmFtZTogJ0NvZGVyJyxcblx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnVzZXIsXG5cdFx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0fV07XG5cdFx0XHRsaXN0UHJvbXB0RmlsZXNSZXN1bHQgPSBbe1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy91c2VyL2FnZW50cy9jb2Rlci5hZ2VudC5tZCcpLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCxcblx0XHRcdH1dO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBtb2RlbC5nZXRJdGVtcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMpO1xuXHRcdFx0YXdhaXQgbW9kZWwud2hlblNlY3Rpb25Mb2FkZWQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5nZXQoKS5tYXAoaSA9PiBpLm5hbWUpLCBbJ0NvZGVyJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3luY1Byb3ZpZGVyLm9uRGlkQ2hhbmdlIGRvZXMgbm90IHJlZmV0Y2ggd2hlbiBpdGVtUHJvdmlkZXIgaXMgcHJlc2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRoZSBkYXRhIHBhdGggZWFybHktcmV0dXJucyB0byBwcm92aWRlciBpdGVtcyBvbmx5IHdoZW4gaXRlbVByb3ZpZGVyIGV4aXN0cyxcblx0XHRcdC8vIHNvIHN1YnNjcmliaW5nIHRvIHN5bmNQcm92aWRlci9wcm9tcHRzU2VydmljZSBldmVudHMgd291bGQgY2F1c2UgZHVwbGljYXRlXG5cdFx0XHQvLyByZWZyZXNoZXMgZm9yIHByb3ZpZGVycyB0aGF0IGFscmVhZHkgZm9yd2FyZCB0aG9zZSB1bmRlcmx5aW5nIGV2ZW50cy5cblx0XHRcdGNvbnN0IHN5bmNQcm92aWRlcl9kaWRDaGFuZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0XHRjb25zdCBzeW5jUHJvdmlkZXI6IElDdXN0b21pemF0aW9uU3luY1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRvbkRpZENoYW5nZTogc3luY1Byb3ZpZGVyX2RpZENoYW5nZS5ldmVudCxcblx0XHRcdFx0aXNEaXNhYmxlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHNldERpc2FibGVkOiAoKSA9PiB7IH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJXaXRoU3luYzogSUN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIgPSB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlOiBwcm92aWRlckFfZGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uczogKHNlc3Npb25SZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0XHRwcm92aWRlckFfY2FsbENvdW50Kys7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShwcm92aWRlckFfaXRlbXMuc2xpY2UoKSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0YXZhaWxhYmxlSGFybmVzc2VzLnNldChbY3JlYXRlRGVzY3JpcHRvcignQScsIHByb3ZpZGVyV2l0aFN5bmMsIHN5bmNQcm92aWRlciksIGRlc2NyaXB0b3JCXSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpKTtcblx0XHRcdG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0Y29uc3QgYmVmb3JlID0gcHJvdmlkZXJBX2NhbGxDb3VudDtcblxuXHRcdFx0c3luY1Byb3ZpZGVyX2RpZENoYW5nZS5maXJlKCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJBX2NhbGxDb3VudCwgYmVmb3JlLCAnc3luY1Byb3ZpZGVyIGV2ZW50cyBtdXN0IG5vdCB0cmlnZ2VyIHJlZmV0Y2hlcyB3aGVuIGl0ZW1Qcm92aWRlciBvd25zIHRoZSBkYXRhIHBhdGgnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2RhdGEgc291cmNlcycsICgpID0+IHtcblxuXHRcdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRcdGxldCBpbnN0YVNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRcdGxldCBwcm92aWRlckRpZENoYW5nZTogRW1pdHRlcjx2b2lkPjtcblx0XHRsZXQgcHJvdmlkZXJJdGVtczogSUN1c3RvbWl6YXRpb25JdGVtW107XG5cdFx0bGV0IHBsdWdpbnM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSUFnZW50UGx1Z2luW10+O1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRwcm92aWRlckRpZENoYW5nZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdHByb3ZpZGVySXRlbXMgPSBbXTtcblx0XHRcdHBsdWdpbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luW10+KCdwbHVnaW5zJywgW10pO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlcjogSUN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIgPSB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlOiBwcm92aWRlckRpZENoYW5nZS5ldmVudCxcblx0XHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlLnJlc29sdmUocHJvdmlkZXJJdGVtcy5zbGljZSgpKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBkZXNjcmlwdG9yOiBJSGFybmVzc0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRcdGlkOiAnQScsXG5cdFx0XHRcdGxhYmVsOiAnQScsXG5cdFx0XHRcdGljb246IENvZGljb24uc2V0dGluZ3NHZWFyLFxuXHRcdFx0XHRpdGVtUHJvdmlkZXI6IHByb3ZpZGVyLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnQTovLy9hY3RpdmUtc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgYXZhaWxhYmxlSGFybmVzc2VzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElIYXJuZXNzRGVzY3JpcHRvcltdPignYXZhaWxhYmxlSGFybmVzc2VzJywgW2Rlc2NyaXB0b3JdKTtcblxuXHRcdFx0aW5zdGFTZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe30sIGRpc3Bvc2FibGVzKTtcblx0XHRcdGluc3RhU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwge1xuXHRcdFx0XHRvbkRpZENoYW5nZUN1c3RvbUFnZW50czogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZVNraWxsczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VIb29rczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VJbnN0cnVjdGlvbnM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQWdlbnRJbnN0cnVjdGlvbnM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGxpc3RQcm9tcHRGaWxlczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2U6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRnZXRDdXN0b21BZ2VudHM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRmaW5kQWdlbnRTa2lsbHM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRnZXRIb29rczogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRnZXRJbnN0cnVjdGlvbkZpbGVzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdFx0Z2V0RGlzYWJsZWRQcm9tcHRGaWxlczogKCkgPT4gbmV3IFJlc291cmNlU2V0KCksXG5cdFx0XHR9KTtcblx0XHRcdGluc3RhU2VydmljZS5zdHViKElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLCB7XG5cdFx0XHRcdGFjdGl2ZVByb2plY3RSb290OiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRnZXRBY3RpdmVQcm9qZWN0Um9vdDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRtYW5hZ2VtZW50U2VjdGlvbnM6IFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHNdLFxuXHRcdFx0XHRpc1Nlc3Npb25zV2luZG93OiBmYWxzZSxcblx0XHRcdFx0d2VsY29tZVBhZ2VGZWF0dXJlczogeyBzaG93R2V0dGluZ1N0YXJ0ZWRCYW5uZXI6IGZhbHNlIH0sXG5cdFx0XHRcdGdldFNraWxsVUlJbnRlZ3JhdGlvbnM6ICgpID0+IG5ldyBNYXAoKSxcblx0XHRcdFx0aGFzT3ZlcnJpZGVQcm9qZWN0Um9vdDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgZmFsc2UpLFxuXHRcdFx0XHRjb21taXRGaWxlczogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRkZWxldGVGaWxlczogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRnZW5lcmF0ZUN1c3RvbWl6YXRpb246IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0c2V0T3ZlcnJpZGVQcm9qZWN0Um9vdDogKCkgPT4geyB9LFxuXHRcdFx0XHRjbGVhck92ZXJyaWRlUHJvamVjdFJvb3Q6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvblJlc291cmNlID0gb2JzZXJ2YWJsZVZhbHVlKCdhY3RpdmVTZXNzaW9uUmVzb3VyY2UnLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgYWN0aXZlSGFybmVzcyA9IGRlcml2ZWQocmVhZGVyID0+IGdldENoYXRTZXNzaW9uVHlwZShhY3RpdmVTZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpKSk7XG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLCB7XG5cdFx0XHRcdGFjdGl2ZVNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0YWN0aXZlSGFybmVzcyxcblx0XHRcdFx0YXZhaWxhYmxlSGFybmVzc2VzLFxuXHRcdFx0XHRzZXRBY3RpdmVTZXNzaW9uOiAoc2Vzc2lvblJlc291cmNlOiBVUkkpID0+IHtcblx0XHRcdFx0XHRhY3RpdmVTZXNzaW9uUmVzb3VyY2Uuc2V0KHNlc3Npb25SZXNvdXJjZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0QWN0aXZlRGVzY3JpcHRvcjogKCkgPT4gYXZhaWxhYmxlSGFybmVzc2VzLmdldCgpLmZpbmQoZCA9PiBkLmlkID09PSBhY3RpdmVIYXJuZXNzLmdldCgpKSEsXG5cdFx0XHRcdGZpbmRIYXJuZXNzQnlJZDogKGlkOiBzdHJpbmcpID0+IGF2YWlsYWJsZUhhcm5lc3Nlcy5nZXQoKS5maW5kKGQgPT4gZC5pZCA9PT0gaWQpLFxuXHRcdFx0XHRyZWdpc3RlckV4dGVybmFsSGFybmVzczogKCkgPT4gKHsgZGlzcG9zZSgpIHsgfSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUFnZW50UGx1Z2luU2VydmljZSwge1xuXHRcdFx0XHRwbHVnaW5zLFxuXHRcdFx0XHRlbmFibGVtZW50TW9kZWw6IHtcblx0XHRcdFx0XHRyZWFkRW5hYmxlZDogKCkgPT4gQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlLFxuXHRcdFx0XHRcdHNldEVuYWJsZWQ6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblxuXHRcdGZ1bmN0aW9uIGxvY2FsUGx1Z2luKG5hbWU6IHN0cmluZyk6IElBZ2VudFBsdWdpbiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZShgcGx1Z2luLXRlc3Q6Ly8ke25hbWV9YCksXG5cdFx0XHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkNvcGlsb3QsXG5cdFx0XHRcdGxhYmVsOiBuYW1lLFxuXHRcdFx0XHRlbmFibGVtZW50OiBvYnNlcnZhYmxlVmFsdWUoJ3BsdWdpbkVuYWJsZW1lbnQnLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUpLFxuXHRcdFx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0XHRcdFx0aG9va3M6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luSG9va3MnLCBbXSksXG5cdFx0XHRcdGNvbW1hbmRzOiBvYnNlcnZhYmxlVmFsdWUoJ3BsdWdpbkNvbW1hbmRzJywgW10pLFxuXHRcdFx0XHRza2lsbHM6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luU2tpbGxzJywgW10pLFxuXHRcdFx0XHRhZ2VudHM6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luQWdlbnRzJywgW10pLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luSW5zdHJ1Y3Rpb25zJywgW10pLFxuXHRcdFx0XHRtY3BTZXJ2ZXJEZWZpbml0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCdwbHVnaW5NY3BTZXJ2ZXJEZWZpbml0aW9ucycsIFtdKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gaGFybmVzc1BsdWdpblJvdyhuYW1lOiBzdHJpbmcsIG92ZXJyaWRlczogUGFydGlhbDxJQ3VzdG9taXphdGlvbkl0ZW0+ID0ge30pOiBJQ3VzdG9taXphdGlvbkl0ZW0ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoYGFnZW50LWhvc3Q6Ly90L3BsdWdpbnMvJHtuYW1lfWApLFxuXHRcdFx0XHR0eXBlOiAncGx1Z2luJyxcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbixcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGx1Z2luVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzZXJJbnZvY2FibGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBwcm92aWRlclNraWxsKG5hbWU6IHN0cmluZywgdXJpOiBzdHJpbmcgPSBgYWdlbnQtaG9zdDovL3Qvc2tpbGxzLyR7bmFtZX0vU0tJTEwubWRgKTogSUN1c3RvbWl6YXRpb25JdGVtIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKHVyaSksXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnNraWxsLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLFxuXHRcdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwbHVnaW5Vcmk6IHVuZGVmaW5lZCxcblx0XHRcdFx0dXNlckludm9jYWJsZTogdHJ1ZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gcHJvdmlkZXJPZlR5cGUodHlwZTogUHJvbXB0c1R5cGUsIG5hbWU6IHN0cmluZyk6IElDdXN0b21pemF0aW9uSXRlbSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZShgYWdlbnQtaG9zdDovL3QvJHt0eXBlfS8ke25hbWV9YCksXG5cdFx0XHRcdHR5cGUsXG5cdFx0XHRcdG5hbWUsXG5cdFx0XHRcdC8vIEhvb2tzIHByZS1leHBhbmRlZCBpdGVtcyBhcmUga2VwdCB1bmRlciBgcGx1Z2luYCBzdG9yYWdlOyB1c2luZ1xuXHRcdFx0XHQvLyBwbHVnaW4gc3RvcmFnZSB1bmlmb3JtbHkgYXZvaWRzIHRoZSBmaWxlLXN5c3RlbSBleHBhbnNpb24gcGF0aFxuXHRcdFx0XHQvLyBpbiB0ZXN0cyBmb3Igbm9uLWhvb2sgdHlwZXMgYXMgd2VsbC5cblx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbixcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGx1Z2luVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzZXJJbnZvY2FibGU6IHRydWUsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlY3Rpb25zQnlUeXBlID0gW1xuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cywgUHJvbXB0c1R5cGUuYWdlbnRdLFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscywgUHJvbXB0c1R5cGUuc2tpbGxdLFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkluc3RydWN0aW9ucywgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zXSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Qcm9tcHRzLCBQcm9tcHRzVHlwZS5wcm9tcHRdLFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzLCBQcm9tcHRzVHlwZS5ob29rXSxcblx0XHRdIGFzIGNvbnN0O1xuXG5cdFx0Zm9yIChjb25zdCBbc2VjdGlvbiwgdHlwZV0gb2Ygc2VjdGlvbnNCeVR5cGUpIHtcblx0XHRcdHRlc3QoYGdldENvdW50KCR7c2VjdGlvbn0pIG1pcnJvcnMgcHJvdmlkZXIgaXRlbXMgZmlsdGVyZWQgYnkgdHlwZT0ke3R5cGV9YCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRwcm92aWRlckl0ZW1zID0gW1xuXHRcdFx0XHRcdHByb3ZpZGVyT2ZUeXBlKHR5cGUsICdhJyksXG5cdFx0XHRcdFx0cHJvdmlkZXJPZlR5cGUodHlwZSwgJ2InKSxcblx0XHRcdFx0XHRwcm92aWRlck9mVHlwZShQcm9tcHRzVHlwZS5hZ2VudCwgJ3VucmVsYXRlZC0xJyksXG5cdFx0XHRcdFx0cHJvdmlkZXJPZlR5cGUoUHJvbXB0c1R5cGUuc2tpbGwsICd1bnJlbGF0ZWQtMicpLFxuXHRcdFx0XHRdO1xuXG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRcdGNvbnN0IGNvdW50ID0gbW9kZWwuZ2V0Q291bnQoc2VjdGlvbik7XG5cdFx0XHRcdGF3YWl0IG1vZGVsLndoZW5TZWN0aW9uTG9hZGVkKHNlY3Rpb24pO1xuXG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkID0gcHJvdmlkZXJJdGVtcy5maWx0ZXIoaSA9PiBpLnR5cGUgPT09IHR5cGUpLmxlbmd0aDtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LmdldCgpLCBleHBlY3RlZCwgYCR7c2VjdGlvbn0gY291bnQgc2hvdWxkIGVxdWFsIHByb3ZpZGVyIGl0ZW1zIHdoZXJlIHR5cGUgPT09ICR7dHlwZX1gKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2dldENvdW50IHJlYWN0cyB0byBwcm92aWRlciBvbkRpZENoYW5nZSBmb3Igb2JzZXJ2ZWQgc2VjdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRwcm92aWRlckl0ZW1zID0gW3Byb3ZpZGVyU2tpbGwoJ29uZScpXTtcblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpKTtcblx0XHRcdGNvbnN0IGNvdW50ID0gbW9kZWwuZ2V0Q291bnQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzKTtcblx0XHRcdGF3YWl0IG1vZGVsLndoZW5TZWN0aW9uTG9hZGVkKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQuZ2V0KCksIDEsICdpbml0aWFsIGZldGNoIHJlZmxlY3RzIHByb3ZpZGVyIHN0YXRlJyk7XG5cblx0XHRcdHByb3ZpZGVySXRlbXMgPSBbcHJvdmlkZXJTa2lsbCgnb25lJyksIHByb3ZpZGVyU2tpbGwoJ3R3bycpXTtcblx0XHRcdHByb3ZpZGVyRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudC5nZXQoKSwgMiwgJ2NvdW50IHJlZmV0Y2hlcyBhZnRlciBwcm92aWRlciBjaGFuZ2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFBsdWdpbkNvdW50IHJldHVybnMgbG9jYWwgcGx1Z2luIGNvdW50IHdoZW4gaGFybmVzcyBoYXMgbm8gcGx1Z2luIHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRwcm92aWRlckl0ZW1zID0gW3Byb3ZpZGVyU2tpbGwoJ25vdC1hLXBsdWdpbi1yb3cnKV07XG5cdFx0XHRwbHVnaW5zLnNldChbbG9jYWxQbHVnaW4oJ2xvY2FsLWEnKSwgbG9jYWxQbHVnaW4oJ2xvY2FsLWInKV0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRjb25zdCBjb3VudCA9IG1vZGVsLmdldFBsdWdpbkNvdW50KCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQuZ2V0KCksIDIsICdwbHVnaW4gY291bnQgdXNlcyBsb2NhbCBwbHVnaW5zIHdoZW4gdGhlIGhhcm5lc3MgZXhwb3NlcyBub25lJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRQbHVnaW5Db3VudCByZXR1cm5zIGhhcm5lc3MgcGx1Z2luIHJvdyBjb3VudCB3aGVuIG5vIGxvY2FsIHBsdWdpbnMgYXJlIGluc3RhbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHByb3ZpZGVySXRlbXMgPSBbXG5cdFx0XHRcdGhhcm5lc3NQbHVnaW5Sb3coJ3gnKSxcblx0XHRcdFx0aGFybmVzc1BsdWdpblJvdygneScsIHsgdHlwZTogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucyB9KSxcblx0XHRcdFx0aGFybmVzc1BsdWdpblJvdygnc3luY2VkJywgeyBncm91cEtleTogJ3JlbW90ZS1jbGllbnQnIH0pLFxuXHRcdFx0XTtcblx0XHRcdHBsdWdpbnMuc2V0KFtdLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0Y29uc3QgY291bnQgPSBtb2RlbC5nZXRQbHVnaW5Db3VudCgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LmdldCgpLCAyLCAncmVtb3RlLWNsaWVudCBoYXJuZXNzIHJvd3MgYXJlIGV4Y2x1ZGVkOyBib3RoIGludGVybmFsIFwicGx1Z2luXCIgYW5kIEFQSSBcInBsdWdpbnNcIiB0eXBlcyBhcmUgcmVjb2duaXNlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0UGx1Z2luQ291bnQgc3VtcyBsb2NhbCBwbHVnaW5zIGFuZCB1bmlxdWUgaGFybmVzcyBwbHVnaW4gcm93cycsIGFzeW5jICgpID0+IHtcblx0XHRcdHByb3ZpZGVySXRlbXMgPSBbXG5cdFx0XHRcdGhhcm5lc3NQbHVnaW5Sb3coJ2R1cCcpLFxuXHRcdFx0XHRoYXJuZXNzUGx1Z2luUm93KCd1bmlxJyksXG5cdFx0XHRdO1xuXHRcdFx0cGx1Z2lucy5zZXQoW2xvY2FsUGx1Z2luKCdkdXAnKSwgbG9jYWxQbHVnaW4oJ2xvY2FsLW9ubHknKV0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRjb25zdCBjb3VudCA9IG1vZGVsLmdldFBsdWdpbkNvdW50KCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQuZ2V0KCksIDMsICdkdXAgaXMgY291bnRlZCBvbmNlIHZpYSB0aGUgbG9jYWwgc291cmNlOyB1bmlxIGFkZHMsIGxvY2FsLW9ubHkgYWRkcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0UGx1Z2luQ291bnQgZGVkdXBzIGFnYWluc3QgVVJJIGJhc2VuYW1lIHdoZW4gbG9jYWwgcGx1Z2luIGxhYmVsIGlzIGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gTWlycm9ycyBQbHVnaW5MaXN0V2lkZ2V0OiB3aGVuIGFuIGluc3RhbGxlZCBwbHVnaW4gaGFzIG5vIGxhYmVsXG5cdFx0XHQvLyAoYGxhYmVsID09PSAnJ2ApLCB0aGUgZWRpdG9yIHJlbmRlcnMgaXQgdW5kZXIgYGJhc2VuYW1lKHBsdWdpbi51cmkpYFxuXHRcdFx0Ly8gYW5kIGRlZHVwcyByZW1vdGUgcm93cyBhZ2FpbnN0IHRoYXQuIFRoZSBtb2RlbCBtdXN0IHVzZSB0aGUgc2FtZVxuXHRcdFx0Ly8gZmFsbGJhY2sgb3IgdGhlIHNpZGViYXIgY291bnQgZHJpZnRzIGFib3ZlIHRoZSBlZGl0b3IgY291bnQuXG5cdFx0XHRwcm92aWRlckl0ZW1zID0gW2hhcm5lc3NQbHVnaW5Sb3coJ2Jhc2VuYW1lLW1hdGNoJyldO1xuXHRcdFx0Y29uc3QgbGFiZWxsZXNzOiBJQWdlbnRQbHVnaW4gPSB7XG5cdFx0XHRcdC4uLmxvY2FsUGx1Z2luKCdiYXNlbmFtZS1tYXRjaCcpLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgncGx1Z2luLXRlc3Q6Ly8vYmFzZW5hbWUtbWF0Y2gnKSxcblx0XHRcdFx0bGFiZWw6ICcnLFxuXHRcdFx0fTtcblx0XHRcdHBsdWdpbnMuc2V0KFtsYWJlbGxlc3NdLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0Y29uc3QgY291bnQgPSBtb2RlbC5nZXRQbHVnaW5Db3VudCgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LmdldCgpLCAxLCAncmVtb3RlIHJvdyBpcyBmb2xkZWQgaW50byB0aGUgbGFiZWxsZXNzIGxvY2FsIHBsdWdpbiB2aWEgYmFzZW5hbWUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gUmVncmVzc2lvbiBjb3ZlcmFnZSBmb3IgdGhlIGFnZW50LWhvc3QgaGFybmVzcyBwYXRoXG5cdC8vIChgUHVyZUl0ZW1Qcm92aWRlckl0ZW1Tb3VyY2VgKS4gVGhlIGl0ZW0tc291cmNlIGNhY2hlcyB0aGUgcHJvdmlkZXInc1xuXHQvLyBpdGVtcyBhbmQgYXBwbGllcyBlYWNoIHNlY3Rpb24ncyBgcHJvbXB0VHlwZWAgZmlsdGVyIGF0IGZldGNoIHRpbWUsXG5cdC8vIHNvIHJlYWRpbmcgb25lIHNlY3Rpb24gKGUuZy4gQWdlbnRzKSBtdXN0IG5vdCBwb2lzb24gdGhlIGNhY2hlZFxuXHQvLyBpdGVtcyBmb3IgYW55IG90aGVyIHNlY3Rpb24gKGUuZy4gSW5zdHJ1Y3Rpb25zKS5cblx0c3VpdGUoJ2FnZW50IGhvc3QgaXRlbSBzb3VyY2UgY2FjaGVzIGFsbCB0eXBlcycsICgpID0+IHtcblxuXHRcdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRcdGxldCBpbnN0YVNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHRsZXQgcHJvdmlkZXJJdGVtczogSUN1c3RvbWl6YXRpb25JdGVtW107XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHByb3ZpZGVySXRlbXMgPSBbXTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSAnYWdlbnQtaG9zdC10ZXN0Jztcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQ3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciA9IHtcblx0XHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiAoKSA9PiBQcm9taXNlLnJlc29sdmUocHJvdmlkZXJJdGVtcy5zbGljZSgpKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBkZXNjcmlwdG9yOiBJSGFybmVzc0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRcdGlkOiBzZXNzaW9uVHlwZSxcblx0XHRcdFx0bGFiZWw6ICdBZ2VudCBIb3N0IFRlc3QnLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNldHRpbmdzR2Vhcixcblx0XHRcdFx0aXRlbVByb3ZpZGVyOiBwcm92aWRlcixcblx0XHRcdH07XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoYCR7c2Vzc2lvblR5cGV9Oi8vL2FjdGl2ZS1zZXNzaW9uYCk7XG5cdFx0XHRjb25zdCBhdmFpbGFibGVIYXJuZXNzZXMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUhhcm5lc3NEZXNjcmlwdG9yW10+KCdhdmFpbGFibGVIYXJuZXNzZXMnLCBbZGVzY3JpcHRvcl0pO1xuXG5cdFx0XHRpbnN0YVNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7fSwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZVNsYXNoQ29tbWFuZHM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlU2tpbGxzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZUhvb2tzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZUluc3RydWN0aW9uczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VBZ2VudEluc3RydWN0aW9uczogRXZlbnQuTm9uZSxcblx0XHRcdFx0bGlzdFByb21wdEZpbGVzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdFx0bGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZTogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldEN1c3RvbUFnZW50czogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGZpbmRBZ2VudFNraWxsczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldEhvb2tzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldEluc3RydWN0aW9uRmlsZXM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRnZXREaXNhYmxlZFByb21wdEZpbGVzOiAoKSA9PiBuZXcgUmVzb3VyY2VTZXQoKSxcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsIHtcblx0XHRcdFx0YWN0aXZlUHJvamVjdFJvb3Q6IG9ic2VydmFibGVWYWx1ZSgndGVzdCcsIHVuZGVmaW5lZCksXG5cdFx0XHRcdGdldEFjdGl2ZVByb2plY3RSb290OiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdG1hbmFnZW1lbnRTZWN0aW9uczogW0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50c10sXG5cdFx0XHRcdGlzU2Vzc2lvbnNXaW5kb3c6IGZhbHNlLFxuXHRcdFx0XHR3ZWxjb21lUGFnZUZlYXR1cmVzOiB7IHNob3dHZXR0aW5nU3RhcnRlZEJhbm5lcjogZmFsc2UgfSxcblx0XHRcdFx0Z2V0U2tpbGxVSUludGVncmF0aW9uczogKCkgPT4gbmV3IE1hcCgpLFxuXHRcdFx0XHRoYXNPdmVycmlkZVByb2plY3RSb290OiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCBmYWxzZSksXG5cdFx0XHRcdGNvbW1pdEZpbGVzOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdGRlbGV0ZUZpbGVzOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdGdlbmVyYXRlQ3VzdG9taXphdGlvbjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRzZXRPdmVycmlkZVByb2plY3RSb290OiAoKSA9PiB7IH0sXG5cdFx0XHRcdGNsZWFyT3ZlcnJpZGVQcm9qZWN0Um9vdDogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSBvYnNlcnZhYmxlVmFsdWUoJ2FjdGl2ZVNlc3Npb25SZXNvdXJjZScsIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBhY3RpdmVIYXJuZXNzID0gZGVyaXZlZChyZWFkZXIgPT4gZ2V0Q2hhdFNlc3Npb25UeXBlKGFjdGl2ZVNlc3Npb25SZXNvdXJjZS5yZWFkKHJlYWRlcikpKTtcblx0XHRcdGluc3RhU2VydmljZS5zdHViKElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIHtcblx0XHRcdFx0YWN0aXZlU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRhY3RpdmVIYXJuZXNzLFxuXHRcdFx0XHRhdmFpbGFibGVIYXJuZXNzZXMsXG5cdFx0XHRcdHNldEFjdGl2ZVNlc3Npb246IChuZXh0OiBVUkkpID0+IGFjdGl2ZVNlc3Npb25SZXNvdXJjZS5zZXQobmV4dCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0Z2V0QWN0aXZlRGVzY3JpcHRvcjogKCkgPT4gYXZhaWxhYmxlSGFybmVzc2VzLmdldCgpLmZpbmQoZCA9PiBkLmlkID09PSBhY3RpdmVIYXJuZXNzLmdldCgpKSEsXG5cdFx0XHRcdGZpbmRIYXJuZXNzQnlJZDogKGlkOiBzdHJpbmcpID0+IGF2YWlsYWJsZUhhcm5lc3Nlcy5nZXQoKS5maW5kKGQgPT4gZC5pZCA9PT0gaWQpLFxuXHRcdFx0XHRyZWdpc3RlckV4dGVybmFsSGFybmVzczogKCkgPT4gKHsgZGlzcG9zZSgpIHsgfSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUFnZW50UGx1Z2luU2VydmljZSwge1xuXHRcdFx0XHRwbHVnaW5zOiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50UGx1Z2luW10+KCdwbHVnaW5zJywgW10pLFxuXHRcdFx0XHRlbmFibGVtZW50TW9kZWw6IHtcblx0XHRcdFx0XHRyZWFkRW5hYmxlZDogKCkgPT4gQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlLFxuXHRcdFx0XHRcdHNldEVuYWJsZWQ6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblxuXHRcdHRlc3QoJ29ic2VydmluZyBvbmUgc2VjdGlvbiBkb2VzIG5vdCBoaWRlIGl0ZW1zIG9mIG90aGVyIHNlY3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cHJvdmlkZXJJdGVtcyA9IFtcblx0XHRcdFx0eyB1cmk6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDovL3QvYWdlbnRzL2NvZGVyLmFnZW50Lm1kJyksIHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBuYW1lOiAnY29kZXInLCBzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBleHRlbnNpb25JZDogdW5kZWZpbmVkLCBwbHVnaW5Vcmk6IHVuZGVmaW5lZCwgdXNlckludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHVyaTogVVJJLnBhcnNlKCdhZ2VudC1ob3N0Oi8vdC9ydWxlcy9zdHlsZS5pbnN0cnVjdGlvbnMubWQnKSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBuYW1lOiAnc3R5bGUnLCBzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBleHRlbnNpb25JZDogdW5kZWZpbmVkLCBwbHVnaW5Vcmk6IHVuZGVmaW5lZCwgdXNlckludm9jYWJsZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsgdXJpOiBVUkkucGFyc2UoJ2FnZW50LWhvc3Q6Ly90L3NraWxscy9yZXBvL1NLSUxMLm1kJyksIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAncmVwbycsIHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sIGV4dGVuc2lvbklkOiB1bmRlZmluZWQsIHBsdWdpblVyaTogdW5kZWZpbmVkLCB1c2VySW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0Ly8gT2JzZXJ2ZSB0aGUgQWdlbnRzIHNlY3Rpb24gZmlyc3QgXHUyMDE0IHRoaXMgcHJpbWVzIHRoZSB1bmRlcmx5aW5nXG5cdFx0XHQvLyBjYWNoZS4gVGhlbiBvYnNlcnZlIEluc3RydWN0aW9ucyBvbiB0aGUgc2FtZSBtb2RlbDsgdGhlIGJ1Z1xuXHRcdFx0Ly8gY2F1c2VkIHRoaXMgc2Vjb25kIG9ic2VydmF0aW9uIHRvIHNlZSBhbiBlbXB0eSBsaXN0IGJlY2F1c2Vcblx0XHRcdC8vIHRoZSBjYWNoZSBoYWQgYWxyZWFkeSBiZWVuIG5vcm1hbGl6ZWQgZm9yIGBQcm9tcHRzVHlwZS5hZ2VudGAuXG5cdFx0XHRjb25zdCBhZ2VudEl0ZW1zID0gbW9kZWwuZ2V0SXRlbXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzKTtcblx0XHRcdGF3YWl0IG1vZGVsLndoZW5TZWN0aW9uTG9hZGVkKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyk7XG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvbkl0ZW1zID0gbW9kZWwuZ2V0SXRlbXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSW5zdHJ1Y3Rpb25zKTtcblx0XHRcdGF3YWl0IG1vZGVsLndoZW5TZWN0aW9uTG9hZGVkKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkluc3RydWN0aW9ucyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhZ2VudHM6IGFnZW50SXRlbXMuZ2V0KCkubWFwKGkgPT4gaS5uYW1lKS5zb3J0KCksXG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBpbnN0cnVjdGlvbkl0ZW1zLmdldCgpLm1hcChpID0+IGkubmFtZSkuc29ydCgpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YWdlbnRzOiBbJ2NvZGVyJ10sXG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBbJ3N0eWxlJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUV4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FB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
