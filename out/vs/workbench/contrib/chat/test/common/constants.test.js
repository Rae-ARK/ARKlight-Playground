import assert from "assert";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IAgentHostEnablementService } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService, Workspace, toWorkspaceFolder } from "../../../../../platform/workspace/common/workspace.js";
import { ChatConfiguration, ChatPermissionLevel, getChatPermissionLevelFromDefaultConfiguration, getComputedDefaultSessionResource, getComputedDefaultSessionType, getDefaultNewChatSessionResource, getDefaultNewChatSessionType, isEditorLocalAgentEnabled, isNewChatSessionTypeUsable, isVisibleEditorChatSessionType, recordUserSelectedSessionType, resolveDefaultNewChatSessionType } from "../../common/constants.js";
import { localChatSessionType, SessionType, IChatSessionsService } from "../../common/chatSessionsService.js";
import { MockChatSessionsService } from "./mockChatSessionsService.js";
import { TestContextService, TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { getRememberedSessionType, hasPreferredCopilotHarness, markPreferredCopilotHarness } from "../../common/chatSessionTypePreference.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
suite("ChatConfiguration defaults", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const localWorkspace = createWorkspace(URI.file("/workspace"));
  function createWorkspace(...resources) {
    return new Workspace(
      resources.map((resource) => resource.toString()).join(","),
      resources.map(toWorkspaceFolder),
      false,
      null,
      () => false
    );
  }
  function createChatSessionsService(...types) {
    const service = new MockChatSessionsService();
    service.setContributions(types.map((type) => ({
      type,
      name: type,
      displayName: type,
      description: type
    })));
    return service;
  }
  function resolveSessionType(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options) {
    const accessor = disposables.add(new TestInstantiationService());
    accessor.set(IConfigurationService, configurationService);
    accessor.set(IChatSessionsService, chatSessionsService);
    accessor.set(IStorageService, storageService);
    accessor.set(IWorkspaceContextService, new TestContextService(workspace));
    accessor.set(IAgentHostEnablementService, { _serviceBrand: void 0, enabled: constObservable(agentHostEnabled) });
    return resolveDefaultNewChatSessionType(accessor, options);
  }
  test("default permission configuration maps Allow All to the Agent Host value", () => {
    assert.deepStrictEqual({
      default: getChatPermissionLevelFromDefaultConfiguration("default"),
      assisted: getChatPermissionLevelFromDefaultConfiguration("assisted"),
      allowAll: getChatPermissionLevelFromDefaultConfiguration("allowAll"),
      legacyAutoApprove: getChatPermissionLevelFromDefaultConfiguration("autoApprove"),
      invalid: getChatPermissionLevelFromDefaultConfiguration("invalid")
    }, {
      default: ChatPermissionLevel.Default,
      assisted: ChatPermissionLevel.Assisted,
      allowAll: ChatPermissionLevel.AutoApprove,
      legacyAutoApprove: ChatPermissionLevel.AutoApprove,
      invalid: void 0
    });
  });
  test("editor default returns local when agent host disabled and local enabled", () => {
    const configurationService = new TestConfigurationService();
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, false),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false),
      localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace)
    }, {
      computed: localChatSessionType,
      rememberedAware: localChatSessionType,
      localVisible: true
    });
  });
  test("editor default prefers agent host Copilot when the agent host is enabled", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true),
      localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace)
    }, {
      computed: SessionType.AgentHostCopilot,
      rememberedAware: SessionType.AgentHostCopilot,
      localVisible: true
    });
  });
  test("editor default stays local when the agent host is enabled but the Copilot default is not opted in", () => {
    const configurationService = new TestConfigurationService();
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true)
    }, {
      computed: localChatSessionType,
      rememberedAware: localChatSessionType
    });
  });
  test("editor default keeps agent host Copilot before contribution registers", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true,
      [ChatConfiguration.EditorLocalAgentEnabled]: false
    });
    const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true),
      localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace)
    }, {
      computed: SessionType.AgentHostCopilot,
      rememberedAware: SessionType.AgentHostCopilot,
      localVisible: false
    });
  });
  test("editor default skips hidden extension host Copilot CLI", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorLocalAgentEnabled]: false,
      [ChatConfiguration.CopilotCliHideExtensionHostEditor]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI, SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, false),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false),
      extensionHostVisible: isVisibleEditorChatSessionType(SessionType.CopilotCLI, configurationService, chatSessionsService, localWorkspace)
    }, {
      computed: SessionType.AgentHostCopilot,
      rememberedAware: SessionType.AgentHostCopilot,
      extensionHostVisible: false
    });
  });
  test("hidden remembered extension host Copilot CLI falls back for a new chat", async () => {
    const configurationService = new TestConfigurationService();
    const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI, SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.CopilotCLI, true);
    await configurationService.setUserConfiguration(ChatConfiguration.CopilotCliHideExtensionHostEditor, true);
    assert.deepStrictEqual({
      remembered: getRememberedSessionType(storageService),
      rememberedUsable: isNewChatSessionTypeUsable(SessionType.CopilotCLI, configurationService, chatSessionsService, localWorkspace),
      newSessionType: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true)
    }, {
      remembered: SessionType.CopilotCLI,
      rememberedUsable: false,
      newSessionType: localChatSessionType
    });
  });
  test("hidden current extension host Copilot CLI is not inherited by a new chat", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.CopilotCliHideExtensionHostEditor]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI, SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual(
      resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.CopilotCLI }),
      { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false }
    );
  });
  test("visible current extension host Copilot CLI is inherited by a new chat", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI, SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual(
      resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.CopilotCLI }),
      { sessionType: SessionType.CopilotCLI, isPreferCopilotHarnessSwap: false }
    );
  });
  test("editor default keeps local as last resort when local is disabled without any provider", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorLocalAgentEnabled]: false
    });
    const chatSessionsService = createChatSessionsService();
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, false),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false),
      localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace)
    }, {
      computed: localChatSessionType,
      rememberedAware: localChatSessionType,
      localVisible: true
    });
  });
  test("remembered non-local selection wins over the agent host default", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, true);
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
      remembered: getRememberedSessionType(storageService),
      rememberedAware: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType })
    }, {
      computed: SessionType.AgentHostCopilot,
      remembered: SessionType.AgentHostClaude,
      rememberedAware: { sessionType: SessionType.AgentHostClaude, isPreferCopilotHarnessSwap: false }
    });
  });
  test("explicit override wins over remembered selection", () => {
    const configurationService = new TestConfigurationService();
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, false);
    assert.deepStrictEqual({
      remembered: getRememberedSessionType(storageService),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { explicitOverride: SessionType.AgentHostCopilot })
    }, {
      remembered: SessionType.AgentHostClaude,
      rememberedAware: SessionType.AgentHostCopilot
    });
  });
  test("current session type is fallback after remembered selection", () => {
    const configurationService = new TestConfigurationService();
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      withoutRemembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { currentSessionType: SessionType.AgentHostCopilot })
    }, {
      withoutRemembered: SessionType.AgentHostCopilot
    });
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, false);
    assert.deepStrictEqual({
      withRemembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { currentSessionType: SessionType.AgentHostCopilot })
    }, {
      withRemembered: SessionType.AgentHostClaude
    });
  });
  test("preferCopilotHarness resolves the swap without consuming the marker until applied", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorPreferCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
    const storageService = disposables.add(new TestStorageService());
    const firstResolve = resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType });
    const markerBeforeApply = hasPreferredCopilotHarness(storageService);
    const secondResolveBeforeApply = resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType });
    markPreferredCopilotHarness(storageService);
    const afterApply = resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType });
    assert.deepStrictEqual({
      firstResolve,
      markerBeforeApply,
      secondResolveBeforeApply,
      afterApply,
      markerAfterApply: hasPreferredCopilotHarness(storageService)
    }, {
      firstResolve: { sessionType: SessionType.AgentHostCopilot, isPreferCopilotHarnessSwap: true },
      markerBeforeApply: false,
      secondResolveBeforeApply: { sessionType: SessionType.AgentHostCopilot, isPreferCopilotHarnessSwap: true },
      // Once marked, the one-time swap no longer fires; with no remembered
      // selection the current local session type is returned.
      afterApply: { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false },
      markerAfterApply: true
    });
  });
  test("one-time Copilot swap is skipped and unmarked when the agent host is disabled", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorPreferCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    const resolved = resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { currentSessionType: localChatSessionType });
    assert.deepStrictEqual({
      resolved,
      preferenceApplied: hasPreferredCopilotHarness(storageService)
    }, {
      resolved: { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false },
      preferenceApplied: false
    });
  });
  test("selecting computed default clears remembered selection", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, true);
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostCopilot, true);
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
      remembered: getRememberedSessionType(storageService),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true)
    }, {
      computed: SessionType.AgentHostCopilot,
      remembered: void 0,
      rememberedAware: SessionType.AgentHostCopilot
    });
  });
  test("selecting local while the agent host default is Copilot remembers local as an opt-out", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, localChatSessionType, true);
    assert.deepStrictEqual({
      remembered: getRememberedSessionType(storageService),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true)
    }, {
      remembered: localChatSessionType,
      rememberedAware: localChatSessionType
    });
  });
  test("one-time Copilot swap overrides a remembered local opt-out and stays redundant when agent host is enabled", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true,
      [ChatConfiguration.EditorPreferCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, localChatSessionType, true);
    const swapped = resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType });
    assert.deepStrictEqual({
      swapped,
      preferenceApplied: hasPreferredCopilotHarness(storageService)
    }, {
      swapped: { sessionType: SessionType.AgentHostCopilot, isPreferCopilotHarnessSwap: true },
      preferenceApplied: false
    });
  });
  test("new chat from a local session preserves local even when the agent host default is Copilot", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      resolved: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
      preferenceApplied: hasPreferredCopilotHarness(storageService)
    }, {
      resolved: { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false },
      preferenceApplied: false
    });
  });
  test("explicit New Local Chat wins over a non-local current session even when the agent host default is Copilot", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      resolved: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { explicitOverride: localChatSessionType, currentSessionType: SessionType.AgentHostCopilot })
    }, {
      resolved: { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false }
    });
  });
  test("default session resource follows the agent host default", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      computedWithAgentHost: getChatSessionType(getComputedDefaultSessionResource(configurationService, chatSessionsService, localWorkspace, true)),
      computedWithoutAgentHost: getChatSessionType(getComputedDefaultSessionResource(configurationService, chatSessionsService, localWorkspace, false)),
      defaultNewWithAgentHost: getChatSessionType(getDefaultNewChatSessionResource(configurationService, chatSessionsService, storageService, localWorkspace, true)),
      defaultNewWithoutAgentHost: getChatSessionType(getDefaultNewChatSessionResource(configurationService, chatSessionsService, storageService, localWorkspace, false))
    }, {
      computedWithAgentHost: SessionType.AgentHostCopilot,
      computedWithoutAgentHost: localChatSessionType,
      defaultNewWithAgentHost: SessionType.AgentHostCopilot,
      defaultNewWithoutAgentHost: localChatSessionType
    });
  });
  test("virtual workspace defaults implicit new chats to local", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.DefaultToCopilotHarness]: true,
      [ChatConfiguration.EditorLocalAgentEnabled]: false,
      [ChatConfiguration.EditorPreferCopilotHarness]: true
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
    const rememberedStorageService = disposables.add(new TestStorageService());
    const currentStorageService = disposables.add(new TestStorageService());
    const workspace = createWorkspace(URI.parse("vscode-vfs://github/microsoft/vscode"));
    recordUserSelectedSessionType(rememberedStorageService, configurationService, chatSessionsService, workspace, SessionType.AgentHostClaude, true);
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, true),
      remembered: getRememberedSessionType(rememberedStorageService),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, rememberedStorageService, workspace, true),
      currentAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, currentStorageService, workspace, true, { currentSessionType: SessionType.AgentHostCopilot }),
      resolvedRemembered: resolveSessionType(configurationService, chatSessionsService, rememberedStorageService, workspace, true, { currentSessionType: SessionType.AgentHostCopilot }),
      resolvedCurrent: resolveSessionType(configurationService, chatSessionsService, currentStorageService, workspace, true, { currentSessionType: SessionType.AgentHostCopilot }),
      resolvedPreferMigration: resolveSessionType(configurationService, chatSessionsService, currentStorageService, workspace, true, { currentSessionType: localChatSessionType }),
      explicitOverride: resolveSessionType(configurationService, chatSessionsService, currentStorageService, workspace, true, { explicitOverride: SessionType.AgentHostClaude }),
      localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, workspace),
      localRememberedUsable: isNewChatSessionTypeUsable(localChatSessionType, configurationService, chatSessionsService, workspace)
    }, {
      computed: localChatSessionType,
      remembered: SessionType.AgentHostClaude,
      rememberedAware: localChatSessionType,
      currentAware: localChatSessionType,
      resolvedRemembered: { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false },
      resolvedCurrent: { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false },
      resolvedPreferMigration: { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false },
      explicitOverride: { sessionType: SessionType.AgentHostClaude, isPreferCopilotHarnessSwap: false },
      localVisible: true,
      localRememberedUsable: true
    });
  });
  test("remembered agent host is usable before contribution registers", () => {
    const configurationService = new TestConfigurationService();
    const chatSessionsService = createChatSessionsService();
    const storageService = disposables.add(new TestStorageService());
    assert.deepStrictEqual({
      agentHost: isNewChatSessionTypeUsable(SessionType.AgentHostClaude, configurationService, chatSessionsService, localWorkspace),
      agentHostCurrent: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostClaude }),
      extensionContributed: isNewChatSessionTypeUsable("my-extension-agent", configurationService, chatSessionsService, localWorkspace)
    }, {
      agentHost: true,
      agentHostCurrent: { sessionType: SessionType.AgentHostClaude, isPreferCopilotHarnessSwap: false },
      extensionContributed: false
    });
  });
  test("local agent setting is ignored only in fully virtual workspaces", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorLocalAgentEnabled]: false
    });
    const remoteWorkspace = createWorkspace(URI.parse("vscode-remote://ssh-remote+test/workspace"));
    const remoteRepositoriesWorkspace = createWorkspace(URI.parse("vscode-vfs://github/microsoft/vscode"));
    const customVirtualWorkspace = createWorkspace(URI.parse("custom-vfs://provider/workspace"));
    const mixedWorkspace = createWorkspace(URI.file("/workspace"), URI.parse("custom-vfs://provider/workspace"));
    assert.deepStrictEqual({
      local: isEditorLocalAgentEnabled(configurationService, localWorkspace),
      remote: isEditorLocalAgentEnabled(configurationService, remoteWorkspace),
      remoteRepositories: isEditorLocalAgentEnabled(configurationService, remoteRepositoriesWorkspace),
      customVirtual: isEditorLocalAgentEnabled(configurationService, customVirtualWorkspace),
      mixed: isEditorLocalAgentEnabled(configurationService, mixedWorkspace)
    }, {
      local: false,
      remote: false,
      remoteRepositories: true,
      customVirtual: true,
      mixed: false
    });
  });
  test("virtual workspace keeps local available when setting is disabled", () => {
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorLocalAgentEnabled]: false
    });
    const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
    const storageService = disposables.add(new TestStorageService());
    const workspace = createWorkspace(URI.parse("vscode-vfs://github/microsoft/vscode"));
    assert.deepStrictEqual({
      computed: getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, false),
      rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace, false),
      localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, workspace),
      localRememberedUsable: isNewChatSessionTypeUsable(localChatSessionType, configurationService, chatSessionsService, workspace)
    }, {
      computed: localChatSessionType,
      rememberedAware: localChatSessionType,
      localVisible: true,
      localRememberedUsable: true
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vY29uc3RhbnRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya3NwYWNlLCB0b1dvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBDaGF0UGVybWlzc2lvbkxldmVsLCBnZXRDaGF0UGVybWlzc2lvbkxldmVsRnJvbURlZmF1bHRDb25maWd1cmF0aW9uLCBnZXRDb21wdXRlZERlZmF1bHRTZXNzaW9uUmVzb3VyY2UsIGdldENvbXB1dGVkRGVmYXVsdFNlc3Npb25UeXBlLCBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25SZXNvdXJjZSwgZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZSwgSURlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGVPcHRpb25zLCBpc0VkaXRvckxvY2FsQWdlbnRFbmFibGVkLCBpc05ld0NoYXRTZXNzaW9uVHlwZVVzYWJsZSwgaXNWaXNpYmxlRWRpdG9yQ2hhdFNlc3Npb25UeXBlLCByZWNvcmRVc2VyU2VsZWN0ZWRTZXNzaW9uVHlwZSwgcmVzb2x2ZURlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBTZXNzaW9uVHlwZSwgSUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50LCBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi9tb2NrQ2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29udGV4dFNlcnZpY2UsIFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBnZXRSZW1lbWJlcmVkU2Vzc2lvblR5cGUsIGhhc1ByZWZlcnJlZENvcGlsb3RIYXJuZXNzLCBtYXJrUHJlZmVycmVkQ29waWxvdEhhcm5lc3MgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25UeXBlUHJlZmVyZW5jZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5cbnN1aXRlKCdDaGF0Q29uZmlndXJhdGlvbiBkZWZhdWx0cycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRjb25zdCBsb2NhbFdvcmtzcGFjZSA9IGNyZWF0ZVdvcmtzcGFjZShVUkkuZmlsZSgnL3dvcmtzcGFjZScpKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVXb3Jrc3BhY2UoLi4ucmVzb3VyY2VzOiBVUklbXSk6IFdvcmtzcGFjZSB7XG5cdFx0cmV0dXJuIG5ldyBXb3Jrc3BhY2UoXG5cdFx0XHRyZXNvdXJjZXMubWFwKHJlc291cmNlID0+IHJlc291cmNlLnRvU3RyaW5nKCkpLmpvaW4oJywnKSxcblx0XHRcdHJlc291cmNlcy5tYXAodG9Xb3Jrc3BhY2VGb2xkZXIpLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRudWxsLFxuXHRcdFx0KCkgPT4gZmFsc2UsXG5cdFx0KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoLi4udHlwZXM6IHN0cmluZ1tdKTogTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2Uge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLnNldENvbnRyaWJ1dGlvbnModHlwZXMubWFwKHR5cGUgPT4gKHtcblx0XHRcdHR5cGUsXG5cdFx0XHRuYW1lOiB0eXBlLFxuXHRcdFx0ZGlzcGxheU5hbWU6IHR5cGUsXG5cdFx0XHRkZXNjcmlwdGlvbjogdHlwZSxcblx0XHR9IHNhdGlzZmllcyBJQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnQpKSk7XG5cdFx0cmV0dXJuIHNlcnZpY2U7XG5cdH1cblxuXHRmdW5jdGlvbiByZXNvbHZlU2Vzc2lvblR5cGUoXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdHdvcmtzcGFjZTogV29ya3NwYWNlLFxuXHRcdGFnZW50SG9zdEVuYWJsZWQ6IGJvb2xlYW4sXG5cdFx0b3B0aW9ucz86IElEZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlT3B0aW9ucyxcblx0KSB7XG5cdFx0Y29uc3QgYWNjZXNzb3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRhY2Nlc3Nvci5zZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0YWNjZXNzb3Iuc2V0KElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRhY2Nlc3Nvci5zZXQoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0YWNjZXNzb3Iuc2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IFRlc3RDb250ZXh0U2VydmljZSh3b3Jrc3BhY2UpKTtcblx0XHRhY2Nlc3Nvci5zZXQoSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgZW5hYmxlZDogY29uc3RPYnNlcnZhYmxlKGFnZW50SG9zdEVuYWJsZWQpIH0pO1xuXHRcdHJldHVybiByZXNvbHZlRGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShhY2Nlc3Nvciwgb3B0aW9ucyk7XG5cdH1cblxuXHR0ZXN0KCdkZWZhdWx0IHBlcm1pc3Npb24gY29uZmlndXJhdGlvbiBtYXBzIEFsbG93IEFsbCB0byB0aGUgQWdlbnQgSG9zdCB2YWx1ZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRlZmF1bHQ6IGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGcm9tRGVmYXVsdENvbmZpZ3VyYXRpb24oJ2RlZmF1bHQnKSxcblx0XHRcdGFzc2lzdGVkOiBnZXRDaGF0UGVybWlzc2lvbkxldmVsRnJvbURlZmF1bHRDb25maWd1cmF0aW9uKCdhc3Npc3RlZCcpLFxuXHRcdFx0YWxsb3dBbGw6IGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGcm9tRGVmYXVsdENvbmZpZ3VyYXRpb24oJ2FsbG93QWxsJyksXG5cdFx0XHRsZWdhY3lBdXRvQXBwcm92ZTogZ2V0Q2hhdFBlcm1pc3Npb25MZXZlbEZyb21EZWZhdWx0Q29uZmlndXJhdGlvbignYXV0b0FwcHJvdmUnKSxcblx0XHRcdGludmFsaWQ6IGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGcm9tRGVmYXVsdENvbmZpZ3VyYXRpb24oJ2ludmFsaWQnKSxcblx0XHR9LCB7XG5cdFx0XHRkZWZhdWx0OiBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQsXG5cdFx0XHRhc3Npc3RlZDogQ2hhdFBlcm1pc3Npb25MZXZlbC5Bc3Npc3RlZCxcblx0XHRcdGFsbG93QWxsOiBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlLFxuXHRcdFx0bGVnYWN5QXV0b0FwcHJvdmU6IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUsXG5cdFx0XHRpbnZhbGlkOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvciBkZWZhdWx0IHJldHVybnMgbG9jYWwgd2hlbiBhZ2VudCBob3N0IGRpc2FibGVkIGFuZCBsb2NhbCBlbmFibGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXB1dGVkOiBnZXRDb21wdXRlZERlZmF1bHRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIGZhbHNlKSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCBmYWxzZSksXG5cdFx0XHRsb2NhbFZpc2libGU6IGlzVmlzaWJsZUVkaXRvckNoYXRTZXNzaW9uVHlwZShsb2NhbENoYXRTZXNzaW9uVHlwZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlKSxcblx0XHR9LCB7XG5cdFx0XHRjb21wdXRlZDogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0bG9jYWxWaXNpYmxlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlZGl0b3IgZGVmYXVsdCBwcmVmZXJzIGFnZW50IGhvc3QgQ29waWxvdCB3aGVuIHRoZSBhZ2VudCBob3N0IGlzIGVuYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0VG9Db3BpbG90SGFybmVzc106IHRydWUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tcHV0ZWQ6IGdldENvbXB1dGVkRGVmYXVsdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSksXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSksXG5cdFx0XHRsb2NhbFZpc2libGU6IGlzVmlzaWJsZUVkaXRvckNoYXRTZXNzaW9uVHlwZShsb2NhbENoYXRTZXNzaW9uVHlwZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlKSxcblx0XHR9LCB7XG5cdFx0XHRjb21wdXRlZDogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCxcblx0XHRcdGxvY2FsVmlzaWJsZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZWRpdG9yIGRlZmF1bHQgc3RheXMgbG9jYWwgd2hlbiB0aGUgYWdlbnQgaG9zdCBpcyBlbmFibGVkIGJ1dCB0aGUgQ29waWxvdCBkZWZhdWx0IGlzIG5vdCBvcHRlZCBpbicsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90KTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0Ly8gVGhlIGFnZW50IGhvc3QgaXMgZW5hYmxlZCBidXQgYGNoYXQuZGVmYXVsdFRvQ29waWxvdEhhcm5lc3NgIGlzIG9mZiAoaXRzXG5cdFx0Ly8gZGVmYXVsdCksIHNvIHRoZSBjb21wdXRlZCBkZWZhdWx0IHJlbWFpbnMgdGhlIGxvY2FsIGhhcm5lc3MuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21wdXRlZDogZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlKSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlKSxcblx0XHR9LCB7XG5cdFx0XHRjb21wdXRlZDogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlZGl0b3IgZGVmYXVsdCBrZWVwcyBhZ2VudCBob3N0IENvcGlsb3QgYmVmb3JlIGNvbnRyaWJ1dGlvbiByZWdpc3RlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0VG9Db3BpbG90SGFybmVzc106IHRydWUsXG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWRdOiBmYWxzZSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5Db3BpbG90Q0xJKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21wdXRlZDogZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlKSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlKSxcblx0XHRcdGxvY2FsVmlzaWJsZTogaXNWaXNpYmxlRWRpdG9yQ2hhdFNlc3Npb25UeXBlKGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UpLFxuXHRcdH0sIHtcblx0XHRcdGNvbXB1dGVkOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LFxuXHRcdFx0bG9jYWxWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZWRpdG9yIGRlZmF1bHQgc2tpcHMgaGlkZGVuIGV4dGVuc2lvbiBob3N0IENvcGlsb3QgQ0xJJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWRdOiBmYWxzZSxcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5Db3BpbG90Q2xpSGlkZUV4dGVuc2lvbkhvc3RFZGl0b3JdOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKFNlc3Npb25UeXBlLkNvcGlsb3RDTEksIFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXB1dGVkOiBnZXRDb21wdXRlZERlZmF1bHRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIGZhbHNlKSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCBmYWxzZSksXG5cdFx0XHRleHRlbnNpb25Ib3N0VmlzaWJsZTogaXNWaXNpYmxlRWRpdG9yQ2hhdFNlc3Npb25UeXBlKFNlc3Npb25UeXBlLkNvcGlsb3RDTEksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSksXG5cdFx0fSwge1xuXHRcdFx0Y29tcHV0ZWQ6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsXG5cdFx0XHRleHRlbnNpb25Ib3N0VmlzaWJsZTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGRlbiByZW1lbWJlcmVkIGV4dGVuc2lvbiBob3N0IENvcGlsb3QgQ0xJIGZhbGxzIGJhY2sgZm9yIGEgbmV3IGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQ29waWxvdENMSSwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdHJlY29yZFVzZXJTZWxlY3RlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIFNlc3Npb25UeXBlLkNvcGlsb3RDTEksIHRydWUpO1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkNvcGlsb3RDbGlIaWRlRXh0ZW5zaW9uSG9zdEVkaXRvciwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlbWVtYmVyZWQ6IGdldFJlbWVtYmVyZWRTZXNzaW9uVHlwZShzdG9yYWdlU2VydmljZSksXG5cdFx0XHRyZW1lbWJlcmVkVXNhYmxlOiBpc05ld0NoYXRTZXNzaW9uVHlwZVVzYWJsZShTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UpLFxuXHRcdFx0bmV3U2Vzc2lvblR5cGU6IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSksXG5cdFx0fSwge1xuXHRcdFx0cmVtZW1iZXJlZDogU2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHRcdHJlbWVtYmVyZWRVc2FibGU6IGZhbHNlLFxuXHRcdFx0bmV3U2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRkZW4gY3VycmVudCBleHRlbnNpb24gaG9zdCBDb3BpbG90IENMSSBpcyBub3QgaW5oZXJpdGVkIGJ5IGEgbmV3IGNoYXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5Db3BpbG90Q2xpSGlkZUV4dGVuc2lvbkhvc3RFZGl0b3JdOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKFNlc3Npb25UeXBlLkNvcGlsb3RDTEksIFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cmVzb2x2ZVNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUsIHsgY3VycmVudFNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5Db3BpbG90Q0xJIH0pLFxuXHRcdFx0eyBzZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUsIGlzUHJlZmVyQ29waWxvdEhhcm5lc3NTd2FwOiBmYWxzZSB9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndmlzaWJsZSBjdXJyZW50IGV4dGVuc2lvbiBob3N0IENvcGlsb3QgQ0xJIGlzIGluaGVyaXRlZCBieSBhIG5ldyBjaGF0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFRvQ29waWxvdEhhcm5lc3NdOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKFNlc3Npb25UeXBlLkNvcGlsb3RDTEksIFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cmVzb2x2ZVNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUsIHsgY3VycmVudFNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5Db3BpbG90Q0xJIH0pLFxuXHRcdFx0eyBzZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQ29waWxvdENMSSwgaXNQcmVmZXJDb3BpbG90SGFybmVzc1N3YXA6IGZhbHNlIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlZGl0b3IgZGVmYXVsdCBrZWVwcyBsb2NhbCBhcyBsYXN0IHJlc29ydCB3aGVuIGxvY2FsIGlzIGRpc2FibGVkIHdpdGhvdXQgYW55IHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWRdOiBmYWxzZSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXB1dGVkOiBnZXRDb21wdXRlZERlZmF1bHRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIGZhbHNlKSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCBmYWxzZSksXG5cdFx0XHRsb2NhbFZpc2libGU6IGlzVmlzaWJsZUVkaXRvckNoYXRTZXNzaW9uVHlwZShsb2NhbENoYXRTZXNzaW9uVHlwZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlKSxcblx0XHR9LCB7XG5cdFx0XHRjb21wdXRlZDogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0bG9jYWxWaXNpYmxlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1lbWJlcmVkIG5vbi1sb2NhbCBzZWxlY3Rpb24gd2lucyBvdmVyIHRoZSBhZ2VudCBob3N0IGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0VG9Db3BpbG90SGFybmVzc106IHRydWUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0cmVjb3JkVXNlclNlbGVjdGVkU2Vzc2lvblR5cGUoc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlLCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tcHV0ZWQ6IGdldENvbXB1dGVkRGVmYXVsdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSksXG5cdFx0XHRyZW1lbWJlcmVkOiBnZXRSZW1lbWJlcmVkU2Vzc2lvblR5cGUoc3RvcmFnZVNlcnZpY2UpLFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiByZXNvbHZlU2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSwgeyBjdXJyZW50U2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0pLFxuXHRcdH0sIHtcblx0XHRcdGNvbXB1dGVkOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LFxuXHRcdFx0cmVtZW1iZXJlZDogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlLFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiB7IHNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUsIGlzUHJlZmVyQ29waWxvdEhhcm5lc3NTd2FwOiBmYWxzZSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBsaWNpdCBvdmVycmlkZSB3aW5zIG92ZXIgcmVtZW1iZXJlZCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0cmVjb3JkVXNlclNlbGVjdGVkU2Vzc2lvblR5cGUoc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlbWVtYmVyZWQ6IGdldFJlbWVtYmVyZWRTZXNzaW9uVHlwZShzdG9yYWdlU2VydmljZSksXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgZmFsc2UsIHsgZXhwbGljaXRPdmVycmlkZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCB9KSxcblx0XHR9LCB7XG5cdFx0XHRyZW1lbWJlcmVkOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUsXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnJlbnQgc2Vzc2lvbiB0eXBlIGlzIGZhbGxiYWNrIGFmdGVyIHJlbWVtYmVyZWQgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsIFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d2l0aG91dFJlbWVtYmVyZWQ6IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgZmFsc2UsIHsgY3VycmVudFNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90IH0pLFxuXHRcdH0sIHtcblx0XHRcdHdpdGhvdXRSZW1lbWJlcmVkOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LFxuXHRcdH0pO1xuXG5cdFx0cmVjb3JkVXNlclNlbGVjdGVkU2Vzc2lvblR5cGUoc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdpdGhSZW1lbWJlcmVkOiBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIGZhbHNlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCB9KSxcblx0XHR9LCB7XG5cdFx0XHR3aXRoUmVtZW1iZXJlZDogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVmZXJDb3BpbG90SGFybmVzcyByZXNvbHZlcyB0aGUgc3dhcCB3aXRob3V0IGNvbnN1bWluZyB0aGUgbWFya2VyIHVudGlsIGFwcGxpZWQnLCAoKSA9PiB7XG5cdFx0Ly8gRGVmYXVsdFRvQ29waWxvdEhhcm5lc3Mgc3RheXMgdW5zZXQgc28gdGhpcyBwcm92ZXMgdGhlIG9uZS10aW1lIHN3YXBcblx0XHQvLyBmaXJlcyBzb2xlbHkgYmVjYXVzZSBFZGl0b3JQcmVmZXJDb3BpbG90SGFybmVzcyBpcyBlbmFibGVkLCBpbmRlcGVuZGVudFxuXHRcdC8vIG9mIHRoZSBuZXcgZGVmYXVsdCBnYXRlLlxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRWRpdG9yUHJlZmVyQ29waWxvdEhhcm5lc3NdOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsIFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdC8vIFJlc29sdmluZyBkb2VzIG5vdCBjb25zdW1lIHRoZSBtYXJrZXIgb24gaXRzIG93bjogcmVwZWF0ZWQgcmVzb2x2ZXMga2VlcFxuXHRcdC8vIHJldHVybmluZyB0aGUgc3dhcCB1bnRpbCB0aGUgY2FsbGVyIGFwcGxpZXMgaXQgYW5kIG1hcmtzIGl0LlxuXHRcdGNvbnN0IGZpcnN0UmVzb2x2ZSA9IHJlc29sdmVTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSk7XG5cdFx0Y29uc3QgbWFya2VyQmVmb3JlQXBwbHkgPSBoYXNQcmVmZXJyZWRDb3BpbG90SGFybmVzcyhzdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vjb25kUmVzb2x2ZUJlZm9yZUFwcGx5ID0gcmVzb2x2ZVNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUsIHsgY3VycmVudFNlc3Npb25UeXBlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSB9KTtcblxuXHRcdC8vIFRoZSBjYWxsZXIgYXBwbGllcyB0aGUgc3dhcCBhbmQgbWFya3MgaXQ7IGZ1cnRoZXIgcmVzb2x2ZXMgbm8gbG9uZ2VyIHN3YXAuXG5cdFx0bWFya1ByZWZlcnJlZENvcGlsb3RIYXJuZXNzKHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBhZnRlckFwcGx5ID0gcmVzb2x2ZVNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIHRydWUsIHsgY3VycmVudFNlc3Npb25UeXBlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zmlyc3RSZXNvbHZlLFxuXHRcdFx0bWFya2VyQmVmb3JlQXBwbHksXG5cdFx0XHRzZWNvbmRSZXNvbHZlQmVmb3JlQXBwbHksXG5cdFx0XHRhZnRlckFwcGx5LFxuXHRcdFx0bWFya2VyQWZ0ZXJBcHBseTogaGFzUHJlZmVycmVkQ29waWxvdEhhcm5lc3Moc3RvcmFnZVNlcnZpY2UpLFxuXHRcdH0sIHtcblx0XHRcdGZpcnN0UmVzb2x2ZTogeyBzZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCwgaXNQcmVmZXJDb3BpbG90SGFybmVzc1N3YXA6IHRydWUgfSxcblx0XHRcdG1hcmtlckJlZm9yZUFwcGx5OiBmYWxzZSxcblx0XHRcdHNlY29uZFJlc29sdmVCZWZvcmVBcHBseTogeyBzZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCwgaXNQcmVmZXJDb3BpbG90SGFybmVzc1N3YXA6IHRydWUgfSxcblx0XHRcdC8vIE9uY2UgbWFya2VkLCB0aGUgb25lLXRpbWUgc3dhcCBubyBsb25nZXIgZmlyZXM7IHdpdGggbm8gcmVtZW1iZXJlZFxuXHRcdFx0Ly8gc2VsZWN0aW9uIHRoZSBjdXJyZW50IGxvY2FsIHNlc3Npb24gdHlwZSBpcyByZXR1cm5lZC5cblx0XHRcdGFmdGVyQXBwbHk6IHsgc2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBpc1ByZWZlckNvcGlsb3RIYXJuZXNzU3dhcDogZmFsc2UgfSxcblx0XHRcdG1hcmtlckFmdGVyQXBwbHk6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uZS10aW1lIENvcGlsb3Qgc3dhcCBpcyBza2lwcGVkIGFuZCB1bm1hcmtlZCB3aGVuIHRoZSBhZ2VudCBob3N0IGlzIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRWRpdG9yUHJlZmVyQ29waWxvdEhhcm5lc3NdOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHQvLyBXaXRoIHRoZSBhZ2VudCBob3N0IGRpc2FibGVkIChlLmcuIG9uIHdlYikgdGhlIHN3YXAgbXVzdCBub3QgZmlyZSwgc28gaXRcblx0XHQvLyBuZWl0aGVyIHJldHVybnMgYW4gdW5yZXNvbHZhYmxlIENvcGlsb3QgdHlwZSBub3IgbWFya3MgdGhlIHRyYW5zaXRpb24uXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlU2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgZmFsc2UsIHsgY3VycmVudFNlc3Npb25UeXBlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzb2x2ZWQsXG5cdFx0XHRwcmVmZXJlbmNlQXBwbGllZDogaGFzUHJlZmVycmVkQ29waWxvdEhhcm5lc3Moc3RvcmFnZVNlcnZpY2UpLFxuXHRcdH0sIHtcblx0XHRcdHJlc29sdmVkOiB7IHNlc3Npb25UeXBlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSwgaXNQcmVmZXJDb3BpbG90SGFybmVzc1N3YXA6IGZhbHNlIH0sXG5cdFx0XHRwcmVmZXJlbmNlQXBwbGllZDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdGluZyBjb21wdXRlZCBkZWZhdWx0IGNsZWFycyByZW1lbWJlcmVkIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRUb0NvcGlsb3RIYXJuZXNzXTogdHJ1ZSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRyZWNvcmRVc2VyU2VsZWN0ZWRTZXNzaW9uVHlwZShzdG9yYWdlU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUsIHRydWUpO1xuXHRcdHJlY29yZFVzZXJTZWxlY3RlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21wdXRlZDogZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlKSxcblx0XHRcdHJlbWVtYmVyZWQ6IGdldFJlbWVtYmVyZWRTZXNzaW9uVHlwZShzdG9yYWdlU2VydmljZSksXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSksXG5cdFx0fSwge1xuXHRcdFx0Y29tcHV0ZWQ6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsXG5cdFx0XHRyZW1lbWJlcmVkOiB1bmRlZmluZWQsXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdGluZyBsb2NhbCB3aGlsZSB0aGUgYWdlbnQgaG9zdCBkZWZhdWx0IGlzIENvcGlsb3QgcmVtZW1iZXJzIGxvY2FsIGFzIGFuIG9wdC1vdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0VG9Db3BpbG90SGFybmVzc106IHRydWUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdC8vIFdpdGggdGhlIGFnZW50IGhvc3QgZW5hYmxlZCB0aGUgY29tcHV0ZWQgZGVmYXVsdCBpcyBDb3BpbG90LCBzbyBwaWNraW5nXG5cdFx0Ly8gbG9jYWwgZGlmZmVycyBmcm9tIHRoZSBkZWZhdWx0IGFuZCBtdXN0IGJlIHBlcnNpc3RlZCBhcyBhbiBleHBsaWNpdCBvcHQtb3V0LlxuXHRcdHJlY29yZFVzZXJTZWxlY3RlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIGxvY2FsQ2hhdFNlc3Npb25UeXBlLCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVtZW1iZXJlZDogZ2V0UmVtZW1iZXJlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlKSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlKSxcblx0XHR9LCB7XG5cdFx0XHRyZW1lbWJlcmVkOiBsb2NhbENoYXRTZXNzaW9uVHlwZSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uZS10aW1lIENvcGlsb3Qgc3dhcCBvdmVycmlkZXMgYSByZW1lbWJlcmVkIGxvY2FsIG9wdC1vdXQgYW5kIHN0YXlzIHJlZHVuZGFudCB3aGVuIGFnZW50IGhvc3QgaXMgZW5hYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRUb0NvcGlsb3RIYXJuZXNzXTogdHJ1ZSxcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FZGl0b3JQcmVmZXJDb3BpbG90SGFybmVzc106IHRydWUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdC8vIFJlbWVtYmVyIGxvY2FsIChvbmx5IHJlYWNoYWJsZSBiZWNhdXNlIHRoZSBjb21wdXRlZCBkZWZhdWx0IGlzIENvcGlsb3QpLlxuXHRcdHJlY29yZFVzZXJTZWxlY3RlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIGxvY2FsQ2hhdFNlc3Npb25UeXBlLCB0cnVlKTtcblxuXHRcdC8vIFRoZSBgcmVtZW1iZXJlZCAhPT0gbG9jYWxgIGd1YXJkIGxldHMgdGhlIG9uZS10aW1lIHN3YXAgcmVwbGFjZSB0aGVcblx0XHQvLyByZW1lbWJlcmVkIGxvY2FsLCBldmVuIHRob3VnaCB0aGUgY29tcHV0ZWQgZGVmYXVsdCBpcyBhbHJlYWR5IENvcGlsb3QuXG5cdFx0Ly8gVGhlIHJlc29sdmVyIHJlcG9ydHMgdGhlIHN3YXAgYnV0IGRvZXMgbm90IG1hcmsgaXQgKHRoZSBjYWxsZXIgZG9lcykuXG5cdFx0Y29uc3Qgc3dhcHBlZCA9IHJlc29sdmVTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN3YXBwZWQsXG5cdFx0XHRwcmVmZXJlbmNlQXBwbGllZDogaGFzUHJlZmVycmVkQ29waWxvdEhhcm5lc3Moc3RvcmFnZVNlcnZpY2UpLFxuXHRcdH0sIHtcblx0XHRcdHN3YXBwZWQ6IHsgc2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsIGlzUHJlZmVyQ29waWxvdEhhcm5lc3NTd2FwOiB0cnVlIH0sXG5cdFx0XHRwcmVmZXJlbmNlQXBwbGllZDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25ldyBjaGF0IGZyb20gYSBsb2NhbCBzZXNzaW9uIHByZXNlcnZlcyBsb2NhbCBldmVuIHdoZW4gdGhlIGFnZW50IGhvc3QgZGVmYXVsdCBpcyBDb3BpbG90JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFRvQ29waWxvdEhhcm5lc3NdOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHQvLyBObyByZW1lbWJlcmVkIHNlbGVjdGlvbiBhbmQgbm8gcHJlZmVycmVkLWhhcm5lc3Mgc2V0dGluZzogdGhlIGN1cnJlbnRcblx0XHQvLyBzZXNzaW9uIHR5cGUgd2lucyBvdmVyIHRoZSBDb3BpbG90IGNvbXB1dGVkIGRlZmF1bHQgKHNlc3Npb24gcHJlc2VydmF0aW9uKS5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc29sdmVkOiByZXNvbHZlU2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSwgeyBjdXJyZW50U2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0pLFxuXHRcdFx0cHJlZmVyZW5jZUFwcGxpZWQ6IGhhc1ByZWZlcnJlZENvcGlsb3RIYXJuZXNzKHN0b3JhZ2VTZXJ2aWNlKSxcblx0XHR9LCB7XG5cdFx0XHRyZXNvbHZlZDogeyBzZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUsIGlzUHJlZmVyQ29waWxvdEhhcm5lc3NTd2FwOiBmYWxzZSB9LFxuXHRcdFx0cHJlZmVyZW5jZUFwcGxpZWQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBsaWNpdCBOZXcgTG9jYWwgQ2hhdCB3aW5zIG92ZXIgYSBub24tbG9jYWwgY3VycmVudCBzZXNzaW9uIGV2ZW4gd2hlbiB0aGUgYWdlbnQgaG9zdCBkZWZhdWx0IGlzIENvcGlsb3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0VG9Db3BpbG90SGFybmVzc106IHRydWUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdC8vIFwiTmV3IExvY2FsIENoYXRcIiBmcm9tIGEgQ29waWxvdCBzZXNzaW9uIG11c3QgcmVzb2x2ZSB0byBsb2NhbDogdGhlIGV4cGxpY2l0XG5cdFx0Ly8gb3ZlcnJpZGUgb3V0cmFua3MgYm90aCB0aGUgY3VycmVudCBzZXNzaW9uIHR5cGUgYW5kIHRoZSBjb21wdXRlZCBkZWZhdWx0LFxuXHRcdC8vIHNvIHRoZSBjbGVhciBwYXRoIG9wZW5zIGEgbG9jYWwgc2Vzc2lvbiBpbnN0ZWFkIG9mIGRyb3BwaW5nIHRoZSByZXF1ZXN0LlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzb2x2ZWQ6IHJlc29sdmVTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlLCB7IGV4cGxpY2l0T3ZlcnJpZGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBjdXJyZW50U2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QgfSksXG5cdFx0fSwge1xuXHRcdFx0cmVzb2x2ZWQ6IHsgc2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBpc1ByZWZlckNvcGlsb3RIYXJuZXNzU3dhcDogZmFsc2UgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVmYXVsdCBzZXNzaW9uIHJlc291cmNlIGZvbGxvd3MgdGhlIGFnZW50IGhvc3QgZGVmYXVsdCcsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRUb0NvcGlsb3RIYXJuZXNzXTogdHJ1ZSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlc3Npb25zU2VydmljZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90KTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21wdXRlZFdpdGhBZ2VudEhvc3Q6IGdldENoYXRTZXNzaW9uVHlwZShnZXRDb21wdXRlZERlZmF1bHRTZXNzaW9uUmVzb3VyY2UoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlKSksXG5cdFx0XHRjb21wdXRlZFdpdGhvdXRBZ2VudEhvc3Q6IGdldENoYXRTZXNzaW9uVHlwZShnZXRDb21wdXRlZERlZmF1bHRTZXNzaW9uUmVzb3VyY2UoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCBmYWxzZSkpLFxuXHRcdFx0ZGVmYXVsdE5ld1dpdGhBZ2VudEhvc3Q6IGdldENoYXRTZXNzaW9uVHlwZShnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25SZXNvdXJjZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxvY2FsV29ya3NwYWNlLCB0cnVlKSksXG5cdFx0XHRkZWZhdWx0TmV3V2l0aG91dEFnZW50SG9zdDogZ2V0Q2hhdFNlc3Npb25UeXBlKGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblJlc291cmNlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbG9jYWxXb3Jrc3BhY2UsIGZhbHNlKSksXG5cdFx0fSwge1xuXHRcdFx0Y29tcHV0ZWRXaXRoQWdlbnRIb3N0OiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LFxuXHRcdFx0Y29tcHV0ZWRXaXRob3V0QWdlbnRIb3N0OiBsb2NhbENoYXRTZXNzaW9uVHlwZSxcblx0XHRcdGRlZmF1bHROZXdXaXRoQWdlbnRIb3N0OiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LFxuXHRcdFx0ZGVmYXVsdE5ld1dpdGhvdXRBZ2VudEhvc3Q6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd2aXJ0dWFsIHdvcmtzcGFjZSBkZWZhdWx0cyBpbXBsaWNpdCBuZXcgY2hhdHMgdG8gbG9jYWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0VG9Db3BpbG90SGFybmVzc106IHRydWUsXG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWRdOiBmYWxzZSxcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FZGl0b3JQcmVmZXJDb3BpbG90SGFybmVzc106IHRydWUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZUNoYXRTZXNzaW9uc1NlcnZpY2UoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlKTtcblx0XHRjb25zdCByZW1lbWJlcmVkU3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBjdXJyZW50U3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVXb3Jrc3BhY2UoVVJJLnBhcnNlKCd2c2NvZGUtdmZzOi8vZ2l0aHViL21pY3Jvc29mdC92c2NvZGUnKSk7XG5cdFx0cmVjb3JkVXNlclNlbGVjdGVkU2Vzc2lvblR5cGUocmVtZW1iZXJlZFN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgd29ya3NwYWNlLCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21wdXRlZDogZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHdvcmtzcGFjZSwgdHJ1ZSksXG5cdFx0XHRyZW1lbWJlcmVkOiBnZXRSZW1lbWJlcmVkU2Vzc2lvblR5cGUocmVtZW1iZXJlZFN0b3JhZ2VTZXJ2aWNlKSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgcmVtZW1iZXJlZFN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2UsIHRydWUpLFxuXHRcdFx0Y3VycmVudEF3YXJlOiBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBjdXJyZW50U3RvcmFnZVNlcnZpY2UsIHdvcmtzcGFjZSwgdHJ1ZSwgeyBjdXJyZW50U2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QgfSksXG5cdFx0XHRyZXNvbHZlZFJlbWVtYmVyZWQ6IHJlc29sdmVTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgcmVtZW1iZXJlZFN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2UsIHRydWUsIHsgY3VycmVudFNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90IH0pLFxuXHRcdFx0cmVzb2x2ZWRDdXJyZW50OiByZXNvbHZlU2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGN1cnJlbnRTdG9yYWdlU2VydmljZSwgd29ya3NwYWNlLCB0cnVlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCB9KSxcblx0XHRcdHJlc29sdmVkUHJlZmVyTWlncmF0aW9uOiByZXNvbHZlU2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGN1cnJlbnRTdG9yYWdlU2VydmljZSwgd29ya3NwYWNlLCB0cnVlLCB7IGN1cnJlbnRTZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSksXG5cdFx0XHRleHBsaWNpdE92ZXJyaWRlOiByZXNvbHZlU2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGN1cnJlbnRTdG9yYWdlU2VydmljZSwgd29ya3NwYWNlLCB0cnVlLCB7IGV4cGxpY2l0T3ZlcnJpZGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSB9KSxcblx0XHRcdGxvY2FsVmlzaWJsZTogaXNWaXNpYmxlRWRpdG9yQ2hhdFNlc3Npb25UeXBlKGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgd29ya3NwYWNlKSxcblx0XHRcdGxvY2FsUmVtZW1iZXJlZFVzYWJsZTogaXNOZXdDaGF0U2Vzc2lvblR5cGVVc2FibGUobG9jYWxDaGF0U2Vzc2lvblR5cGUsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCB3b3Jrc3BhY2UpLFxuXHRcdH0sIHtcblx0XHRcdGNvbXB1dGVkOiBsb2NhbENoYXRTZXNzaW9uVHlwZSxcblx0XHRcdHJlbWVtYmVyZWQ6IFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSxcblx0XHRcdHJlbWVtYmVyZWRBd2FyZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRjdXJyZW50QXdhcmU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0cmVzb2x2ZWRSZW1lbWJlcmVkOiB7IHNlc3Npb25UeXBlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSwgaXNQcmVmZXJDb3BpbG90SGFybmVzc1N3YXA6IGZhbHNlIH0sXG5cdFx0XHRyZXNvbHZlZEN1cnJlbnQ6IHsgc2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBpc1ByZWZlckNvcGlsb3RIYXJuZXNzU3dhcDogZmFsc2UgfSxcblx0XHRcdHJlc29sdmVkUHJlZmVyTWlncmF0aW9uOiB7IHNlc3Npb25UeXBlOiBsb2NhbENoYXRTZXNzaW9uVHlwZSwgaXNQcmVmZXJDb3BpbG90SGFybmVzc1N3YXA6IGZhbHNlIH0sXG5cdFx0XHRleHBsaWNpdE92ZXJyaWRlOiB7IHNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUsIGlzUHJlZmVyQ29waWxvdEhhcm5lc3NTd2FwOiBmYWxzZSB9LFxuXHRcdFx0bG9jYWxWaXNpYmxlOiB0cnVlLFxuXHRcdFx0bG9jYWxSZW1lbWJlcmVkVXNhYmxlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1lbWJlcmVkIGFnZW50IGhvc3QgaXMgdXNhYmxlIGJlZm9yZSBjb250cmlidXRpb24gcmVnaXN0ZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWdlbnRIb3N0OiBpc05ld0NoYXRTZXNzaW9uVHlwZVVzYWJsZShTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSksXG5cdFx0XHRhZ2VudEhvc3RDdXJyZW50OiByZXNvbHZlU2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSwgdHJ1ZSwgeyBjdXJyZW50U2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZSB9KSxcblx0XHRcdGV4dGVuc2lvbkNvbnRyaWJ1dGVkOiBpc05ld0NoYXRTZXNzaW9uVHlwZVVzYWJsZSgnbXktZXh0ZW5zaW9uLWFnZW50JywgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsV29ya3NwYWNlKSxcblx0XHR9LCB7XG5cdFx0XHRhZ2VudEhvc3Q6IHRydWUsXG5cdFx0XHRhZ2VudEhvc3RDdXJyZW50OiB7IHNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGUsIGlzUHJlZmVyQ29waWxvdEhhcm5lc3NTd2FwOiBmYWxzZSB9LFxuXHRcdFx0ZXh0ZW5zaW9uQ29udHJpYnV0ZWQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NhbCBhZ2VudCBzZXR0aW5nIGlzIGlnbm9yZWQgb25seSBpbiBmdWxseSB2aXJ0dWFsIHdvcmtzcGFjZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FZGl0b3JMb2NhbEFnZW50RW5hYmxlZF06IGZhbHNlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZVdvcmtzcGFjZSA9IGNyZWF0ZVdvcmtzcGFjZShVUkkucGFyc2UoJ3ZzY29kZS1yZW1vdGU6Ly9zc2gtcmVtb3RlK3Rlc3Qvd29ya3NwYWNlJykpO1xuXHRcdGNvbnN0IHJlbW90ZVJlcG9zaXRvcmllc1dvcmtzcGFjZSA9IGNyZWF0ZVdvcmtzcGFjZShVUkkucGFyc2UoJ3ZzY29kZS12ZnM6Ly9naXRodWIvbWljcm9zb2Z0L3ZzY29kZScpKTtcblx0XHRjb25zdCBjdXN0b21WaXJ0dWFsV29ya3NwYWNlID0gY3JlYXRlV29ya3NwYWNlKFVSSS5wYXJzZSgnY3VzdG9tLXZmczovL3Byb3ZpZGVyL3dvcmtzcGFjZScpKTtcblx0XHRjb25zdCBtaXhlZFdvcmtzcGFjZSA9IGNyZWF0ZVdvcmtzcGFjZShVUkkuZmlsZSgnL3dvcmtzcGFjZScpLCBVUkkucGFyc2UoJ2N1c3RvbS12ZnM6Ly9wcm92aWRlci93b3Jrc3BhY2UnKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxvY2FsOiBpc0VkaXRvckxvY2FsQWdlbnRFbmFibGVkKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsb2NhbFdvcmtzcGFjZSksXG5cdFx0XHRyZW1vdGU6IGlzRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWQoY29uZmlndXJhdGlvblNlcnZpY2UsIHJlbW90ZVdvcmtzcGFjZSksXG5cdFx0XHRyZW1vdGVSZXBvc2l0b3JpZXM6IGlzRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWQoY29uZmlndXJhdGlvblNlcnZpY2UsIHJlbW90ZVJlcG9zaXRvcmllc1dvcmtzcGFjZSksXG5cdFx0XHRjdXN0b21WaXJ0dWFsOiBpc0VkaXRvckxvY2FsQWdlbnRFbmFibGVkKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjdXN0b21WaXJ0dWFsV29ya3NwYWNlKSxcblx0XHRcdG1peGVkOiBpc0VkaXRvckxvY2FsQWdlbnRFbmFibGVkKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtaXhlZFdvcmtzcGFjZSksXG5cdFx0fSwge1xuXHRcdFx0bG9jYWw6IGZhbHNlLFxuXHRcdFx0cmVtb3RlOiBmYWxzZSxcblx0XHRcdHJlbW90ZVJlcG9zaXRvcmllczogdHJ1ZSxcblx0XHRcdGN1c3RvbVZpcnR1YWw6IHRydWUsXG5cdFx0XHRtaXhlZDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZpcnR1YWwgd29ya3NwYWNlIGtlZXBzIGxvY2FsIGF2YWlsYWJsZSB3aGVuIHNldHRpbmcgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FZGl0b3JMb2NhbEFnZW50RW5hYmxlZF06IGZhbHNlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBjcmVhdGVDaGF0U2Vzc2lvbnNTZXJ2aWNlKFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlV29ya3NwYWNlKFVSSS5wYXJzZSgndnNjb2RlLXZmczovL2dpdGh1Yi9taWNyb3NvZnQvdnNjb2RlJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21wdXRlZDogZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHdvcmtzcGFjZSwgZmFsc2UpLFxuXHRcdFx0cmVtZW1iZXJlZEF3YXJlOiBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgd29ya3NwYWNlLCBmYWxzZSksXG5cdFx0XHRsb2NhbFZpc2libGU6IGlzVmlzaWJsZUVkaXRvckNoYXRTZXNzaW9uVHlwZShsb2NhbENoYXRTZXNzaW9uVHlwZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHdvcmtzcGFjZSksXG5cdFx0XHRsb2NhbFJlbWVtYmVyZWRVc2FibGU6IGlzTmV3Q2hhdFNlc3Npb25UeXBlVXNhYmxlKGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgd29ya3NwYWNlKSxcblx0XHR9LCB7XG5cdFx0XHRjb21wdXRlZDogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRyZW1lbWJlcmVkQXdhcmU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0bG9jYWxWaXNpYmxlOiB0cnVlLFxuXHRcdFx0bG9jYWxSZW1lbWJlcmVkVXNhYmxlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQixXQUFXLHlCQUF5QjtBQUN2RSxTQUFTLG1CQUFtQixxQkFBcUIsZ0RBQWdELG1DQUFtQywrQkFBK0Isa0NBQWtDLDhCQUFpRSwyQkFBMkIsNEJBQTRCLGdDQUFnQywrQkFBK0Isd0NBQXdDO0FBQ3BhLFNBQVMsc0JBQXNCLGFBQTBDLDRCQUE0QjtBQUNyRyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG9CQUFvQiwwQkFBMEI7QUFDdkQsU0FBUywwQkFBMEIsNEJBQTRCLG1DQUFtQztBQUNsRyxTQUFTLDBCQUEwQjtBQUVuQyxNQUFNLDhCQUE4QixNQUFNO0FBRXpDLFFBQU0sY0FBYyx3Q0FBd0M7QUFDNUQsUUFBTSxpQkFBaUIsZ0JBQWdCLElBQUksS0FBSyxZQUFZLENBQUM7QUFFN0QsV0FBUyxtQkFBbUIsV0FBNkI7QUFDeEQsV0FBTyxJQUFJO0FBQUEsTUFDVixVQUFVLElBQUksY0FBWSxTQUFTLFNBQVMsQ0FBQyxFQUFFLEtBQUssR0FBRztBQUFBLE1BQ3ZELFVBQVUsSUFBSSxpQkFBaUI7QUFBQSxNQUMvQjtBQUFBLE1BQ0E7QUFBQSxNQUNBLE1BQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUVBLFdBQVMsNkJBQTZCLE9BQTBDO0FBQy9FLFVBQU0sVUFBVSxJQUFJLHdCQUF3QjtBQUM1QyxZQUFRLGlCQUFpQixNQUFNLElBQUksV0FBUztBQUFBLE1BQzNDO0FBQUEsTUFDQSxNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixhQUFhO0FBQUEsSUFDZCxFQUF3QyxDQUFDO0FBQ3pDLFdBQU87QUFBQSxFQUNSO0FBRUEsV0FBUyxtQkFDUixzQkFDQSxxQkFDQSxnQkFDQSxXQUNBLGtCQUNBLFNBQ0M7QUFDRCxVQUFNLFdBQVcsWUFBWSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDL0QsYUFBUyxJQUFJLHVCQUF1QixvQkFBb0I7QUFDeEQsYUFBUyxJQUFJLHNCQUFzQixtQkFBbUI7QUFDdEQsYUFBUyxJQUFJLGlCQUFpQixjQUFjO0FBQzVDLGFBQVMsSUFBSSwwQkFBMEIsSUFBSSxtQkFBbUIsU0FBUyxDQUFDO0FBQ3hFLGFBQVMsSUFBSSw2QkFBNkIsRUFBRSxlQUFlLFFBQVcsU0FBUyxnQkFBZ0IsZ0JBQWdCLEVBQUUsQ0FBQztBQUNsSCxXQUFPLGlDQUFpQyxVQUFVLE9BQU87QUFBQSxFQUMxRDtBQUVBLE9BQUssMkVBQTJFLE1BQU07QUFDckYsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixTQUFTLCtDQUErQyxTQUFTO0FBQUEsTUFDakUsVUFBVSwrQ0FBK0MsVUFBVTtBQUFBLE1BQ25FLFVBQVUsK0NBQStDLFVBQVU7QUFBQSxNQUNuRSxtQkFBbUIsK0NBQStDLGFBQWE7QUFBQSxNQUMvRSxTQUFTLCtDQUErQyxTQUFTO0FBQUEsSUFDbEUsR0FBRztBQUFBLE1BQ0YsU0FBUyxvQkFBb0I7QUFBQSxNQUM3QixVQUFVLG9CQUFvQjtBQUFBLE1BQzlCLFVBQVUsb0JBQW9CO0FBQUEsTUFDOUIsbUJBQW1CLG9CQUFvQjtBQUFBLE1BQ3ZDLFNBQVM7QUFBQSxJQUNWLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJFQUEyRSxNQUFNO0FBQ3JGLFVBQU0sdUJBQXVCLElBQUkseUJBQXlCO0FBQzFELFVBQU0sc0JBQXNCLDBCQUEwQixZQUFZLGdCQUFnQjtBQUNsRixVQUFNLGlCQUFpQixZQUFZLElBQUksSUFBSSxtQkFBbUIsQ0FBQztBQUUvRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFVBQVUsOEJBQThCLHNCQUFzQixxQkFBcUIsZ0JBQWdCLEtBQUs7QUFBQSxNQUN4RyxpQkFBaUIsNkJBQTZCLHNCQUFzQixxQkFBcUIsZ0JBQWdCLGdCQUFnQixLQUFLO0FBQUEsTUFDOUgsY0FBYywrQkFBK0Isc0JBQXNCLHNCQUFzQixxQkFBcUIsY0FBYztBQUFBLElBQzdILEdBQUc7QUFBQSxNQUNGLFVBQVU7QUFBQSxNQUNWLGlCQUFpQjtBQUFBLE1BQ2pCLGNBQWM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFVBQU0sdUJBQXVCLElBQUkseUJBQXlCO0FBQUEsTUFDekQsQ0FBQyxrQkFBa0IsdUJBQXVCLEdBQUc7QUFBQSxJQUM5QyxDQUFDO0FBQ0QsVUFBTSxzQkFBc0IsMEJBQTBCLFlBQVksZ0JBQWdCO0FBQ2xGLFVBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBRS9ELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsVUFBVSw4QkFBOEIsc0JBQXNCLHFCQUFxQixnQkFBZ0IsSUFBSTtBQUFBLE1BQ3ZHLGlCQUFpQiw2QkFBNkIsc0JBQXNCLHFCQUFxQixnQkFBZ0IsZ0JBQWdCLElBQUk7QUFBQSxNQUM3SCxjQUFjLCtCQUErQixzQkFBc0Isc0JBQXNCLHFCQUFxQixjQUFjO0FBQUEsSUFDN0gsR0FBRztBQUFBLE1BQ0YsVUFBVSxZQUFZO0FBQUEsTUFDdEIsaUJBQWlCLFlBQVk7QUFBQSxNQUM3QixjQUFjO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxR0FBcUcsTUFBTTtBQUMvRyxVQUFNLHVCQUF1QixJQUFJLHlCQUF5QjtBQUMxRCxVQUFNLHNCQUFzQiwwQkFBMEIsWUFBWSxnQkFBZ0I7QUFDbEYsVUFBTSxpQkFBaUIsWUFBWSxJQUFJLElBQUksbUJBQW1CLENBQUM7QUFJL0QsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixVQUFVLDhCQUE4QixzQkFBc0IscUJBQXFCLGdCQUFnQixJQUFJO0FBQUEsTUFDdkcsaUJBQWlCLDZCQUE2QixzQkFBc0IscUJBQXFCLGdCQUFnQixnQkFBZ0IsSUFBSTtBQUFBLElBQzlILEdBQUc7QUFBQSxNQUNGLFVBQVU7QUFBQSxNQUNWLGlCQUFpQjtBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHlFQUF5RSxNQUFNO0FBQ25GLFVBQU0sdUJBQXVCLElBQUkseUJBQXlCO0FBQUEsTUFDekQsQ0FBQyxrQkFBa0IsdUJBQXVCLEdBQUc7QUFBQSxNQUM3QyxDQUFDLGtCQUFrQix1QkFBdUIsR0FBRztBQUFBLElBQzlDLENBQUM7QUFDRCxVQUFNLHNCQUFzQiwwQkFBMEIsWUFBWSxVQUFVO0FBQzVFLFVBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBRS9ELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsVUFBVSw4QkFBOEIsc0JBQXNCLHFCQUFxQixnQkFBZ0IsSUFBSTtBQUFBLE1BQ3ZHLGlCQUFpQiw2QkFBNkIsc0JBQXNCLHFCQUFxQixnQkFBZ0IsZ0JBQWdCLElBQUk7QUFBQSxNQUM3SCxjQUFjLCtCQUErQixzQkFBc0Isc0JBQXNCLHFCQUFxQixjQUFjO0FBQUEsSUFDN0gsR0FBRztBQUFBLE1BQ0YsVUFBVSxZQUFZO0FBQUEsTUFDdEIsaUJBQWlCLFlBQVk7QUFBQSxNQUM3QixjQUFjO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwREFBMEQsTUFBTTtBQUNwRSxVQUFNLHVCQUF1QixJQUFJLHlCQUF5QjtBQUFBLE1BQ3pELENBQUMsa0JBQWtCLHVCQUF1QixHQUFHO0FBQUEsTUFDN0MsQ0FBQyxrQkFBa0IsaUNBQWlDLEdBQUc7QUFBQSxJQUN4RCxDQUFDO0FBQ0QsVUFBTSxzQkFBc0IsMEJBQTBCLFlBQVksWUFBWSxZQUFZLGdCQUFnQjtBQUMxRyxVQUFNLGlCQUFpQixZQUFZLElBQUksSUFBSSxtQkFBbUIsQ0FBQztBQUUvRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFVBQVUsOEJBQThCLHNCQUFzQixxQkFBcUIsZ0JBQWdCLEtBQUs7QUFBQSxNQUN4RyxpQkFBaUIsNkJBQTZCLHNCQUFzQixxQkFBcUIsZ0JBQWdCLGdCQUFnQixLQUFLO0FBQUEsTUFDOUgsc0JBQXNCLCtCQUErQixZQUFZLFlBQVksc0JBQXNCLHFCQUFxQixjQUFjO0FBQUEsSUFDdkksR0FBRztBQUFBLE1BQ0YsVUFBVSxZQUFZO0FBQUEsTUFDdEIsaUJBQWlCLFlBQVk7QUFBQSxNQUM3QixzQkFBc0I7QUFBQSxJQUN2QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwRUFBMEUsWUFBWTtBQUMxRixVQUFNLHVCQUF1QixJQUFJLHlCQUF5QjtBQUMxRCxVQUFNLHNCQUFzQiwwQkFBMEIsWUFBWSxZQUFZLFlBQVksZ0JBQWdCO0FBQzFHLFVBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBRS9ELGtDQUE4QixnQkFBZ0Isc0JBQXNCLHFCQUFxQixnQkFBZ0IsWUFBWSxZQUFZLElBQUk7QUFDckksVUFBTSxxQkFBcUIscUJBQXFCLGtCQUFrQixtQ0FBbUMsSUFBSTtBQUV6RyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFlBQVkseUJBQXlCLGNBQWM7QUFBQSxNQUNuRCxrQkFBa0IsMkJBQTJCLFlBQVksWUFBWSxzQkFBc0IscUJBQXFCLGNBQWM7QUFBQSxNQUM5SCxnQkFBZ0IsNkJBQTZCLHNCQUFzQixxQkFBcUIsZ0JBQWdCLGdCQUFnQixJQUFJO0FBQUEsSUFDN0gsR0FBRztBQUFBLE1BQ0YsWUFBWSxZQUFZO0FBQUEsTUFDeEIsa0JBQWtCO0FBQUEsTUFDbEIsZ0JBQWdCO0FBQUEsSUFDakIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNEVBQTRFLE1BQU07QUFDdEYsVUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFBQSxNQUN6RCxDQUFDLGtCQUFrQixpQ0FBaUMsR0FBRztBQUFBLElBQ3hELENBQUM7QUFDRCxVQUFNLHNCQUFzQiwwQkFBMEIsWUFBWSxZQUFZLFlBQVksZ0JBQWdCO0FBQzFHLFVBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBRS9ELFdBQU87QUFBQSxNQUNOLG1CQUFtQixzQkFBc0IscUJBQXFCLGdCQUFnQixnQkFBZ0IsTUFBTSxFQUFFLG9CQUFvQixZQUFZLFdBQVcsQ0FBQztBQUFBLE1BQ2xKLEVBQUUsYUFBYSxzQkFBc0IsNEJBQTRCLE1BQU07QUFBQSxJQUN4RTtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsseUVBQXlFLE1BQU07QUFDbkYsVUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFBQSxNQUN6RCxDQUFDLGtCQUFrQix1QkFBdUIsR0FBRztBQUFBLElBQzlDLENBQUM7QUFDRCxVQUFNLHNCQUFzQiwwQkFBMEIsWUFBWSxZQUFZLFlBQVksZ0JBQWdCO0FBQzFHLFVBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBRS9ELFdBQU87QUFBQSxNQUNOLG1CQUFtQixzQkFBc0IscUJBQXFCLGdCQUFnQixnQkFBZ0IsTUFBTSxFQUFFLG9CQUFvQixZQUFZLFdBQVcsQ0FBQztBQUFBLE1BQ2xKLEVBQUUsYUFBYSxZQUFZLFlBQVksNEJBQTRCLE1BQU07QUFBQSxJQUMxRTtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsseUZBQXlGLE1BQU07QUFDbkcsVUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFBQSxNQUN6RCxDQUFDLGtCQUFrQix1QkFBdUIsR0FBRztBQUFBLElBQzlDLENBQUM7QUFDRCxVQUFNLHNCQUFzQiwwQkFBMEI7QUFDdEQsVUFBTSxpQkFBaUIsWUFBWSxJQUFJLElBQUksbUJBQW1CLENBQUM7QUFFL0QsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixVQUFVLDhCQUE4QixzQkFBc0IscUJBQXFCLGdCQUFnQixLQUFLO0FBQUEsTUFDeEcsaUJBQWlCLDZCQUE2QixzQkFBc0IscUJBQXFCLGdCQUFnQixnQkFBZ0IsS0FBSztBQUFBLE1BQzlILGNBQWMsK0JBQStCLHNCQUFzQixzQkFBc0IscUJBQXFCLGNBQWM7QUFBQSxJQUM3SCxHQUFHO0FBQUEsTUFDRixVQUFVO0FBQUEsTUFDVixpQkFBaUI7QUFBQSxNQUNqQixjQUFjO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxVQUFNLHVCQUF1QixJQUFJLHlCQUF5QjtBQUFBLE1BQ3pELENBQUMsa0JBQWtCLHVCQUF1QixHQUFHO0FBQUEsSUFDOUMsQ0FBQztBQUNELFVBQU0sc0JBQXNCLDBCQUEwQixZQUFZLGtCQUFrQixZQUFZLGVBQWU7QUFDL0csVUFBTSxpQkFBaUIsWUFBWSxJQUFJLElBQUksbUJBQW1CLENBQUM7QUFFL0Qsa0NBQThCLGdCQUFnQixzQkFBc0IscUJBQXFCLGdCQUFnQixZQUFZLGlCQUFpQixJQUFJO0FBRTFJLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsVUFBVSw4QkFBOEIsc0JBQXNCLHFCQUFxQixnQkFBZ0IsSUFBSTtBQUFBLE1BQ3ZHLFlBQVkseUJBQXlCLGNBQWM7QUFBQSxNQUNuRCxpQkFBaUIsbUJBQW1CLHNCQUFzQixxQkFBcUIsZ0JBQWdCLGdCQUFnQixNQUFNLEVBQUUsb0JBQW9CLHFCQUFxQixDQUFDO0FBQUEsSUFDbEssR0FBRztBQUFBLE1BQ0YsVUFBVSxZQUFZO0FBQUEsTUFDdEIsWUFBWSxZQUFZO0FBQUEsTUFDeEIsaUJBQWlCLEVBQUUsYUFBYSxZQUFZLGlCQUFpQiw0QkFBNEIsTUFBTTtBQUFBLElBQ2hHLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG9EQUFvRCxNQUFNO0FBQzlELFVBQU0sdUJBQXVCLElBQUkseUJBQXlCO0FBQzFELFVBQU0sc0JBQXNCLDBCQUEwQixZQUFZLGtCQUFrQixZQUFZLGVBQWU7QUFDL0csVUFBTSxpQkFBaUIsWUFBWSxJQUFJLElBQUksbUJBQW1CLENBQUM7QUFFL0Qsa0NBQThCLGdCQUFnQixzQkFBc0IscUJBQXFCLGdCQUFnQixZQUFZLGlCQUFpQixLQUFLO0FBRTNJLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsWUFBWSx5QkFBeUIsY0FBYztBQUFBLE1BQ25ELGlCQUFpQiw2QkFBNkIsc0JBQXNCLHFCQUFxQixnQkFBZ0IsZ0JBQWdCLE9BQU8sRUFBRSxrQkFBa0IsWUFBWSxpQkFBaUIsQ0FBQztBQUFBLElBQ25MLEdBQUc7QUFBQSxNQUNGLFlBQVksWUFBWTtBQUFBLE1BQ3hCLGlCQUFpQixZQUFZO0FBQUEsSUFDOUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0RBQStELE1BQU07QUFDekUsVUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFDMUQsVUFBTSxzQkFBc0IsMEJBQTBCLFlBQVksa0JBQWtCLFlBQVksZUFBZTtBQUMvRyxVQUFNLGlCQUFpQixZQUFZLElBQUksSUFBSSxtQkFBbUIsQ0FBQztBQUUvRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLG1CQUFtQiw2QkFBNkIsc0JBQXNCLHFCQUFxQixnQkFBZ0IsZ0JBQWdCLE9BQU8sRUFBRSxvQkFBb0IsWUFBWSxpQkFBaUIsQ0FBQztBQUFBLElBQ3ZMLEdBQUc7QUFBQSxNQUNGLG1CQUFtQixZQUFZO0FBQUEsSUFDaEMsQ0FBQztBQUVELGtDQUE4QixnQkFBZ0Isc0JBQXNCLHFCQUFxQixnQkFBZ0IsWUFBWSxpQkFBaUIsS0FBSztBQUUzSSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGdCQUFnQiw2QkFBNkIsc0JBQXNCLHFCQUFxQixnQkFBZ0IsZ0JBQWdCLE9BQU8sRUFBRSxvQkFBb0IsWUFBWSxpQkFBaUIsQ0FBQztBQUFBLElBQ3BMLEdBQUc7QUFBQSxNQUNGLGdCQUFnQixZQUFZO0FBQUEsSUFDN0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscUZBQXFGLE1BQU07QUFJL0YsVUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFBQSxNQUN6RCxDQUFDLGtCQUFrQiwwQkFBMEIsR0FBRztBQUFBLElBQ2pELENBQUM7QUFDRCxVQUFNLHNCQUFzQiwwQkFBMEIsWUFBWSxrQkFBa0IsWUFBWSxlQUFlO0FBQy9HLFVBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBSS9ELFVBQU0sZUFBZSxtQkFBbUIsc0JBQXNCLHFCQUFxQixnQkFBZ0IsZ0JBQWdCLE1BQU0sRUFBRSxvQkFBb0IscUJBQXFCLENBQUM7QUFDckssVUFBTSxvQkFBb0IsMkJBQTJCLGNBQWM7QUFDbkUsVUFBTSwyQkFBMkIsbUJBQW1CLHNCQUFzQixxQkFBcUIsZ0JBQWdCLGdCQUFnQixNQUFNLEVBQUUsb0JBQW9CLHFCQUFxQixDQUFDO0FBR2pMLGdDQUE0QixjQUFjO0FBQzFDLFVBQU0sYUFBYSxtQkFBbUIsc0JBQXNCLHFCQUFxQixnQkFBZ0IsZ0JBQWdCLE1BQU0sRUFBRSxvQkFBb0IscUJBQXFCLENBQUM7QUFFbkssV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0Esa0JBQWtCLDJCQUEyQixjQUFjO0FBQUEsSUFDNUQsR0FBRztBQUFBLE1BQ0YsY0FBYyxFQUFFLGFBQWEsWUFBWSxrQkFBa0IsNEJBQTRCLEtBQUs7QUFBQSxNQUM1RixtQkFBbUI7QUFBQSxNQUNuQiwwQkFBMEIsRUFBRSxhQUFhLFlBQVksa0JBQWtCLDRCQUE0QixLQUFLO0FBQUE7QUFBQTtBQUFBLE1BR3hHLFlBQVksRUFBRSxhQUFhLHNCQUFzQiw0QkFBNEIsTUFBTTtBQUFBLE1BQ25GLGtCQUFrQjtBQUFBLElBQ25CLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlGQUFpRixNQUFNO0FBQzNGLFVBQU0sdUJBQXVCLElBQUkseUJBQXlCO0FBQUEsTUFDekQsQ0FBQyxrQkFBa0IsMEJBQTBCLEdBQUc7QUFBQSxJQUNqRCxDQUFDO0FBQ0QsVUFBTSxzQkFBc0IsMEJBQTBCLFlBQVksZ0JBQWdCO0FBQ2xGLFVBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBSS9ELFVBQU0sV0FBVyxtQkFBbUIsc0JBQXNCLHFCQUFxQixnQkFBZ0IsZ0JBQWdCLE9BQU8sRUFBRSxvQkFBb0IscUJBQXFCLENBQUM7QUFFbEssV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsbUJBQW1CLDJCQUEyQixjQUFjO0FBQUEsSUFDN0QsR0FBRztBQUFBLE1BQ0YsVUFBVSxFQUFFLGFBQWEsc0JBQXNCLDRCQUE0QixNQUFNO0FBQUEsTUFDakYsbUJBQW1CO0FBQUEsSUFDcEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMERBQTBELE1BQU07QUFDcEUsVUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFBQSxNQUN6RCxDQUFDLGtCQUFrQix1QkFBdUIsR0FBRztBQUFBLElBQzlDLENBQUM7QUFDRCxVQUFNLHNCQUFzQiwwQkFBMEIsWUFBWSxrQkFBa0IsWUFBWSxlQUFlO0FBQy9HLFVBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBRS9ELGtDQUE4QixnQkFBZ0Isc0JBQXNCLHFCQUFxQixnQkFBZ0IsWUFBWSxpQkFBaUIsSUFBSTtBQUMxSSxrQ0FBOEIsZ0JBQWdCLHNCQUFzQixxQkFBcUIsZ0JBQWdCLFlBQVksa0JBQWtCLElBQUk7QUFFM0ksV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixVQUFVLDhCQUE4QixzQkFBc0IscUJBQXFCLGdCQUFnQixJQUFJO0FBQUEsTUFDdkcsWUFBWSx5QkFBeUIsY0FBYztBQUFBLE1BQ25ELGlCQUFpQiw2QkFBNkIsc0JBQXNCLHFCQUFxQixnQkFBZ0IsZ0JBQWdCLElBQUk7QUFBQSxJQUM5SCxHQUFHO0FBQUEsTUFDRixVQUFVLFlBQVk7QUFBQSxNQUN0QixZQUFZO0FBQUEsTUFDWixpQkFBaUIsWUFBWTtBQUFBLElBQzlCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHlGQUF5RixNQUFNO0FBQ25HLFVBQU0sdUJBQXVCLElBQUkseUJBQXlCO0FBQUEsTUFDekQsQ0FBQyxrQkFBa0IsdUJBQXVCLEdBQUc7QUFBQSxJQUM5QyxDQUFDO0FBQ0QsVUFBTSxzQkFBc0IsMEJBQTBCLFlBQVksZ0JBQWdCO0FBQ2xGLFVBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBSS9ELGtDQUE4QixnQkFBZ0Isc0JBQXNCLHFCQUFxQixnQkFBZ0Isc0JBQXNCLElBQUk7QUFFbkksV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixZQUFZLHlCQUF5QixjQUFjO0FBQUEsTUFDbkQsaUJBQWlCLDZCQUE2QixzQkFBc0IscUJBQXFCLGdCQUFnQixnQkFBZ0IsSUFBSTtBQUFBLElBQzlILEdBQUc7QUFBQSxNQUNGLFlBQVk7QUFBQSxNQUNaLGlCQUFpQjtBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZHQUE2RyxNQUFNO0FBQ3ZILFVBQU0sdUJBQXVCLElBQUkseUJBQXlCO0FBQUEsTUFDekQsQ0FBQyxrQkFBa0IsdUJBQXVCLEdBQUc7QUFBQSxNQUM3QyxDQUFDLGtCQUFrQiwwQkFBMEIsR0FBRztBQUFBLElBQ2pELENBQUM7QUFDRCxVQUFNLHNCQUFzQiwwQkFBMEIsWUFBWSxnQkFBZ0I7QUFDbEYsVUFBTSxpQkFBaUIsWUFBWSxJQUFJLElBQUksbUJBQW1CLENBQUM7QUFHL0Qsa0NBQThCLGdCQUFnQixzQkFBc0IscUJBQXFCLGdCQUFnQixzQkFBc0IsSUFBSTtBQUtuSSxVQUFNLFVBQVUsbUJBQW1CLHNCQUFzQixxQkFBcUIsZ0JBQWdCLGdCQUFnQixNQUFNLEVBQUUsb0JBQW9CLHFCQUFxQixDQUFDO0FBRWhLLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBLG1CQUFtQiwyQkFBMkIsY0FBYztBQUFBLElBQzdELEdBQUc7QUFBQSxNQUNGLFNBQVMsRUFBRSxhQUFhLFlBQVksa0JBQWtCLDRCQUE0QixLQUFLO0FBQUEsTUFDdkYsbUJBQW1CO0FBQUEsSUFDcEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkZBQTZGLE1BQU07QUFDdkcsVUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFBQSxNQUN6RCxDQUFDLGtCQUFrQix1QkFBdUIsR0FBRztBQUFBLElBQzlDLENBQUM7QUFDRCxVQUFNLHNCQUFzQiwwQkFBMEIsWUFBWSxnQkFBZ0I7QUFDbEYsVUFBTSxpQkFBaUIsWUFBWSxJQUFJLElBQUksbUJBQW1CLENBQUM7QUFJL0QsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixVQUFVLG1CQUFtQixzQkFBc0IscUJBQXFCLGdCQUFnQixnQkFBZ0IsTUFBTSxFQUFFLG9CQUFvQixxQkFBcUIsQ0FBQztBQUFBLE1BQzFKLG1CQUFtQiwyQkFBMkIsY0FBYztBQUFBLElBQzdELEdBQUc7QUFBQSxNQUNGLFVBQVUsRUFBRSxhQUFhLHNCQUFzQiw0QkFBNEIsTUFBTTtBQUFBLE1BQ2pGLG1CQUFtQjtBQUFBLElBQ3BCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZHQUE2RyxNQUFNO0FBQ3ZILFVBQU0sdUJBQXVCLElBQUkseUJBQXlCO0FBQUEsTUFDekQsQ0FBQyxrQkFBa0IsdUJBQXVCLEdBQUc7QUFBQSxJQUM5QyxDQUFDO0FBQ0QsVUFBTSxzQkFBc0IsMEJBQTBCLFlBQVksZ0JBQWdCO0FBQ2xGLFVBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBSy9ELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsVUFBVSxtQkFBbUIsc0JBQXNCLHFCQUFxQixnQkFBZ0IsZ0JBQWdCLE1BQU0sRUFBRSxrQkFBa0Isc0JBQXNCLG9CQUFvQixZQUFZLGlCQUFpQixDQUFDO0FBQUEsSUFDM00sR0FBRztBQUFBLE1BQ0YsVUFBVSxFQUFFLGFBQWEsc0JBQXNCLDRCQUE0QixNQUFNO0FBQUEsSUFDbEYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMkRBQTJELE1BQU07QUFDckUsVUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFBQSxNQUN6RCxDQUFDLGtCQUFrQix1QkFBdUIsR0FBRztBQUFBLElBQzlDLENBQUM7QUFDRCxVQUFNLHNCQUFzQiwwQkFBMEIsWUFBWSxnQkFBZ0I7QUFDbEYsVUFBTSxpQkFBaUIsWUFBWSxJQUFJLElBQUksbUJBQW1CLENBQUM7QUFFL0QsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0Qix1QkFBdUIsbUJBQW1CLGtDQUFrQyxzQkFBc0IscUJBQXFCLGdCQUFnQixJQUFJLENBQUM7QUFBQSxNQUM1SSwwQkFBMEIsbUJBQW1CLGtDQUFrQyxzQkFBc0IscUJBQXFCLGdCQUFnQixLQUFLLENBQUM7QUFBQSxNQUNoSix5QkFBeUIsbUJBQW1CLGlDQUFpQyxzQkFBc0IscUJBQXFCLGdCQUFnQixnQkFBZ0IsSUFBSSxDQUFDO0FBQUEsTUFDN0osNEJBQTRCLG1CQUFtQixpQ0FBaUMsc0JBQXNCLHFCQUFxQixnQkFBZ0IsZ0JBQWdCLEtBQUssQ0FBQztBQUFBLElBQ2xLLEdBQUc7QUFBQSxNQUNGLHVCQUF1QixZQUFZO0FBQUEsTUFDbkMsMEJBQTBCO0FBQUEsTUFDMUIseUJBQXlCLFlBQVk7QUFBQSxNQUNyQyw0QkFBNEI7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwREFBMEQsTUFBTTtBQUNwRSxVQUFNLHVCQUF1QixJQUFJLHlCQUF5QjtBQUFBLE1BQ3pELENBQUMsa0JBQWtCLHVCQUF1QixHQUFHO0FBQUEsTUFDN0MsQ0FBQyxrQkFBa0IsdUJBQXVCLEdBQUc7QUFBQSxNQUM3QyxDQUFDLGtCQUFrQiwwQkFBMEIsR0FBRztBQUFBLElBQ2pELENBQUM7QUFDRCxVQUFNLHNCQUFzQiwwQkFBMEIsWUFBWSxrQkFBa0IsWUFBWSxlQUFlO0FBQy9HLFVBQU0sMkJBQTJCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBQ3pFLFVBQU0sd0JBQXdCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBQ3RFLFVBQU0sWUFBWSxnQkFBZ0IsSUFBSSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLGtDQUE4QiwwQkFBMEIsc0JBQXNCLHFCQUFxQixXQUFXLFlBQVksaUJBQWlCLElBQUk7QUFFL0ksV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixVQUFVLDhCQUE4QixzQkFBc0IscUJBQXFCLFdBQVcsSUFBSTtBQUFBLE1BQ2xHLFlBQVkseUJBQXlCLHdCQUF3QjtBQUFBLE1BQzdELGlCQUFpQiw2QkFBNkIsc0JBQXNCLHFCQUFxQiwwQkFBMEIsV0FBVyxJQUFJO0FBQUEsTUFDbEksY0FBYyw2QkFBNkIsc0JBQXNCLHFCQUFxQix1QkFBdUIsV0FBVyxNQUFNLEVBQUUsb0JBQW9CLFlBQVksaUJBQWlCLENBQUM7QUFBQSxNQUNsTCxvQkFBb0IsbUJBQW1CLHNCQUFzQixxQkFBcUIsMEJBQTBCLFdBQVcsTUFBTSxFQUFFLG9CQUFvQixZQUFZLGlCQUFpQixDQUFDO0FBQUEsTUFDakwsaUJBQWlCLG1CQUFtQixzQkFBc0IscUJBQXFCLHVCQUF1QixXQUFXLE1BQU0sRUFBRSxvQkFBb0IsWUFBWSxpQkFBaUIsQ0FBQztBQUFBLE1BQzNLLHlCQUF5QixtQkFBbUIsc0JBQXNCLHFCQUFxQix1QkFBdUIsV0FBVyxNQUFNLEVBQUUsb0JBQW9CLHFCQUFxQixDQUFDO0FBQUEsTUFDM0ssa0JBQWtCLG1CQUFtQixzQkFBc0IscUJBQXFCLHVCQUF1QixXQUFXLE1BQU0sRUFBRSxrQkFBa0IsWUFBWSxnQkFBZ0IsQ0FBQztBQUFBLE1BQ3pLLGNBQWMsK0JBQStCLHNCQUFzQixzQkFBc0IscUJBQXFCLFNBQVM7QUFBQSxNQUN2SCx1QkFBdUIsMkJBQTJCLHNCQUFzQixzQkFBc0IscUJBQXFCLFNBQVM7QUFBQSxJQUM3SCxHQUFHO0FBQUEsTUFDRixVQUFVO0FBQUEsTUFDVixZQUFZLFlBQVk7QUFBQSxNQUN4QixpQkFBaUI7QUFBQSxNQUNqQixjQUFjO0FBQUEsTUFDZCxvQkFBb0IsRUFBRSxhQUFhLHNCQUFzQiw0QkFBNEIsTUFBTTtBQUFBLE1BQzNGLGlCQUFpQixFQUFFLGFBQWEsc0JBQXNCLDRCQUE0QixNQUFNO0FBQUEsTUFDeEYseUJBQXlCLEVBQUUsYUFBYSxzQkFBc0IsNEJBQTRCLE1BQU07QUFBQSxNQUNoRyxrQkFBa0IsRUFBRSxhQUFhLFlBQVksaUJBQWlCLDRCQUE0QixNQUFNO0FBQUEsTUFDaEcsY0FBYztBQUFBLE1BQ2QsdUJBQXVCO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssaUVBQWlFLE1BQU07QUFDM0UsVUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFDMUQsVUFBTSxzQkFBc0IsMEJBQTBCO0FBQ3RELFVBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBRS9ELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsV0FBVywyQkFBMkIsWUFBWSxpQkFBaUIsc0JBQXNCLHFCQUFxQixjQUFjO0FBQUEsTUFDNUgsa0JBQWtCLG1CQUFtQixzQkFBc0IscUJBQXFCLGdCQUFnQixnQkFBZ0IsTUFBTSxFQUFFLG9CQUFvQixZQUFZLGdCQUFnQixDQUFDO0FBQUEsTUFDekssc0JBQXNCLDJCQUEyQixzQkFBc0Isc0JBQXNCLHFCQUFxQixjQUFjO0FBQUEsSUFDakksR0FBRztBQUFBLE1BQ0YsV0FBVztBQUFBLE1BQ1gsa0JBQWtCLEVBQUUsYUFBYSxZQUFZLGlCQUFpQiw0QkFBNEIsTUFBTTtBQUFBLE1BQ2hHLHNCQUFzQjtBQUFBLElBQ3ZCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1FQUFtRSxNQUFNO0FBQzdFLFVBQU0sdUJBQXVCLElBQUkseUJBQXlCO0FBQUEsTUFDekQsQ0FBQyxrQkFBa0IsdUJBQXVCLEdBQUc7QUFBQSxJQUM5QyxDQUFDO0FBQ0QsVUFBTSxrQkFBa0IsZ0JBQWdCLElBQUksTUFBTSwyQ0FBMkMsQ0FBQztBQUM5RixVQUFNLDhCQUE4QixnQkFBZ0IsSUFBSSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3JHLFVBQU0seUJBQXlCLGdCQUFnQixJQUFJLE1BQU0saUNBQWlDLENBQUM7QUFDM0YsVUFBTSxpQkFBaUIsZ0JBQWdCLElBQUksS0FBSyxZQUFZLEdBQUcsSUFBSSxNQUFNLGlDQUFpQyxDQUFDO0FBRTNHLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsT0FBTywwQkFBMEIsc0JBQXNCLGNBQWM7QUFBQSxNQUNyRSxRQUFRLDBCQUEwQixzQkFBc0IsZUFBZTtBQUFBLE1BQ3ZFLG9CQUFvQiwwQkFBMEIsc0JBQXNCLDJCQUEyQjtBQUFBLE1BQy9GLGVBQWUsMEJBQTBCLHNCQUFzQixzQkFBc0I7QUFBQSxNQUNyRixPQUFPLDBCQUEwQixzQkFBc0IsY0FBYztBQUFBLElBQ3RFLEdBQUc7QUFBQSxNQUNGLE9BQU87QUFBQSxNQUNQLFFBQVE7QUFBQSxNQUNSLG9CQUFvQjtBQUFBLE1BQ3BCLGVBQWU7QUFBQSxNQUNmLE9BQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBQzlFLFVBQU0sdUJBQXVCLElBQUkseUJBQXlCO0FBQUEsTUFDekQsQ0FBQyxrQkFBa0IsdUJBQXVCLEdBQUc7QUFBQSxJQUM5QyxDQUFDO0FBQ0QsVUFBTSxzQkFBc0IsMEJBQTBCLFlBQVksZ0JBQWdCO0FBQ2xGLFVBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBQy9ELFVBQU0sWUFBWSxnQkFBZ0IsSUFBSSxNQUFNLHNDQUFzQyxDQUFDO0FBRW5GLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsVUFBVSw4QkFBOEIsc0JBQXNCLHFCQUFxQixXQUFXLEtBQUs7QUFBQSxNQUNuRyxpQkFBaUIsNkJBQTZCLHNCQUFzQixxQkFBcUIsZ0JBQWdCLFdBQVcsS0FBSztBQUFBLE1BQ3pILGNBQWMsK0JBQStCLHNCQUFzQixzQkFBc0IscUJBQXFCLFNBQVM7QUFBQSxNQUN2SCx1QkFBdUIsMkJBQTJCLHNCQUFzQixzQkFBc0IscUJBQXFCLFNBQVM7QUFBQSxJQUM3SCxHQUFHO0FBQUEsTUFDRixVQUFVO0FBQUEsTUFDVixpQkFBaUI7QUFBQSxNQUNqQixjQUFjO0FBQUEsTUFDZCx1QkFBdUI7QUFBQSxJQUN4QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
