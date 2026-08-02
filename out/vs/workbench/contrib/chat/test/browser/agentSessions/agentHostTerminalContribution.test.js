import assert from "assert";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { OS } from "../../../../../../base/common/platform.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IDefaultAccountService } from "../../../../../../platform/defaultAccount/common/defaultAccount.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IAgentHostEnablementService } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { AgentHostCustomTerminalToolEnabledSettingId, CopilotCliConfigKey } from "../../../../../../platform/agentHost/common/copilotCliConfig.js";
import { AgentHostConfigKey } from "../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { TerminalSettingId } from "../../../../../../platform/terminal/common/terminal.js";
import { ITerminalProfileResolverService, ITerminalProfileService } from "../../../../terminal/common/terminal.js";
import { IAgentHostTerminalService } from "../../../../terminal/browser/agentHostTerminalService.js";
import { AgentHostTerminalContribution } from "../../../browser/agentSessions/agentHost/agentHostTerminalContribution.js";
class MockAgentHostService extends mock() {
  constructor() {
    super(...arguments);
    this.clientId = "test-window-1";
    this._onAgentHostStart = new Emitter();
    this.onAgentHostStart = this._onAgentHostStart.event;
    this.onAgentHostExit = Event.None;
    this._onDidAction = new Emitter();
    this.onDidAction = this._onDidAction.event;
    this._onDidNotification = new Emitter();
    this.onDidNotification = this._onDidNotification.event;
    this.dispatchedActions = [];
    this._rootStateValue = void 0;
    this._rootStateOnDidChange = new Emitter();
    this.rootState = (() => {
      const self = this;
      return {
        get value() {
          return self._rootStateValue;
        },
        get verifiedValue() {
          return self._rootStateValue;
        },
        onDidChange: this._rootStateOnDidChange.event,
        onWillApplyAction: Event.None,
        onDidApplyAction: Event.None
      };
    })();
  }
  dispatch(channel, action) {
    this.dispatchedActions.push({ channel, action });
  }
  /** Test helper: set rootState value and fire onDidChange. */
  setRootState(state) {
    this._rootStateValue = state;
    this._rootStateOnDidChange.fire(state);
  }
  fireAgentHostStart() {
    this._onAgentHostStart.fire();
  }
  dispose() {
    this._onAgentHostStart.dispose();
    this._onDidAction.dispose();
    this._onDidNotification.dispose();
    this._rootStateOnDidChange.dispose();
  }
}
class MockTerminalProfileResolverService extends mock() {
  constructor() {
    super(...arguments);
    this.profile = {
      profileName: "Bash",
      path: "/bin/bash",
      args: [],
      isDefault: true
    };
  }
  async getDefaultProfile(options) {
    this.lastOptions = options;
    this.onResolve?.();
    if (this.profile instanceof Error) {
      throw this.profile;
    }
    return this.profile;
  }
}
class MockTerminalProfileService extends mock() {
  constructor() {
    super(...arguments);
    this._onDidChangeAvailableProfiles = new Emitter();
    this.onDidChangeAvailableProfiles = this._onDidChangeAvailableProfiles.event;
  }
  fireAvailableProfilesChanged() {
    this._onDidChangeAvailableProfiles.fire([]);
  }
  dispose() {
    this._onDidChangeAvailableProfiles.dispose();
  }
}
class MockDefaultAccountService extends mock() {
  constructor() {
    super(...arguments);
    this._onDidChangeDefaultAccount = new Emitter();
    this.onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;
    this.enterprise = false;
    this.gitHubBaseUrl = "https://github.com";
  }
  getDefaultAccountAuthenticationProvider() {
    return { id: "github", name: "GitHub", enterprise: this.enterprise };
  }
  resolveGitHubUrl(path) {
    return `${this.gitHubBaseUrl}/${path}`;
  }
  fireChange() {
    this._onDidChangeDefaultAccount.fire(null);
  }
  dispose() {
    this._onDidChangeDefaultAccount.dispose();
  }
}
function makeRootStateWithSchema(properties) {
  return {
    agents: [],
    config: {
      schema: { type: "object", properties },
      values: {}
    }
  };
}
function rootStateWithDefaultShellKey() {
  return makeRootStateWithSchema({
    [AgentHostConfigKey.DefaultShell]: { type: "string", title: "Default Shell" }
  });
}
function rootStateWithoutDefaultShellKey() {
  return makeRootStateWithSchema({
    // Schema published by an older / third-party host that doesn't know
    // about defaultShell.
    [AgentHostConfigKey.Customizations]: { type: "array", title: "Customizations" }
  });
}
function rootStateWithEnableCustomTerminalToolKey() {
  return makeRootStateWithSchema({
    [CopilotCliConfigKey.EnableCustomTerminalTool]: { type: "boolean", title: "Use Agent Host Terminal Tool" }
  });
}
function rootStateWithGithubEnterpriseUriKey() {
  return makeRootStateWithSchema({
    [AgentHostConfigKey.GithubEnterpriseUri]: { type: "string", title: "GitHub Enterprise URI" }
  });
}
function setup(disposables, agentHostEnabled = true) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const agentHostService = new MockAgentHostService();
  disposables.add({ dispose: () => agentHostService.dispose() });
  const resolver = new MockTerminalProfileResolverService();
  const profileService = new MockTerminalProfileService();
  disposables.add({ dispose: () => profileService.dispose() });
  const defaultAccountService = new MockDefaultAccountService();
  disposables.add({ dispose: () => defaultAccountService.dispose() });
  const configurationService = new TestConfigurationService({
    [AgentHostCustomTerminalToolEnabledSettingId]: true
  });
  instantiationService.stub(IAgentHostService, agentHostService);
  instantiationService.stub(IConfigurationService, configurationService);
  instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: void 0, enabled: observableValue("agentHostEnabled", agentHostEnabled) });
  instantiationService.stub(ITerminalProfileResolverService, resolver);
  instantiationService.stub(ITerminalProfileService, profileService);
  instantiationService.stub(IDefaultAccountService, defaultAccountService);
  instantiationService.stub(IAgentHostTerminalService, {
    registerEntry: () => ({ dispose() {
    } }),
    profiles: observableValue("test", [])
  });
  const contribution = disposables.add(instantiationService.createInstance(AgentHostTerminalContribution));
  return { contribution, agentHostService, resolver, profileService, configurationService, defaultAccountService };
}
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}
suite("AgentHostTerminalContribution", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("does not dispatch when chat.agentHost.enabled is false", async () => {
    const { agentHostService } = setup(
      disposables,
      /*agentHostEnabled*/
      false
    );
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    agentHostService.fireAgentHostStart();
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("does not dispatch while rootState has not hydrated", async () => {
    const { agentHostService } = setup(disposables);
    agentHostService.fireAgentHostStart();
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("does not dispatch when host schema does not advertise defaultShell", async () => {
    const { agentHostService } = setup(disposables);
    agentHostService.setRootState(rootStateWithoutDefaultShellKey());
    agentHostService.fireAgentHostStart();
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("dispatches RootConfigChanged with resolved shell path when host schema includes defaultShell", async () => {
    const { agentHostService, resolver } = setup(disposables);
    resolver.profile = { profileName: "Git Bash", path: "/usr/bin/bash", args: [], isDefault: true };
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const action = agentHostService.dispatchedActions[0].action;
    assert.strictEqual(action.type, ActionType.RootConfigChanged);
    assert.deepStrictEqual(action.config, {
      [AgentHostConfigKey.DefaultShell]: "/usr/bin/bash"
    });
    assert.strictEqual(resolver.lastOptions?.allowAgentHostShell, true);
    assert.strictEqual(resolver.lastOptions?.os, OS);
  });
  test("retries the push when rootState hydrates after agentHostStart", async () => {
    const { agentHostService } = setup(disposables);
    agentHostService.fireAgentHostStart();
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
  });
  test("re-dispatches when an agent-host-shell-dependent setting changes", async () => {
    const { agentHostService, resolver, configurationService } = setup(disposables);
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    const initialCount = agentHostService.dispatchedActions.length;
    assert.strictEqual(initialCount, 1);
    resolver.profile = { profileName: "PowerShell", path: "/usr/bin/pwsh", args: [], isDefault: true };
    configurationService.onDidChangeConfigurationEmitter.fire({
      affectedKeys: /* @__PURE__ */ new Set([TerminalSettingId.AgentHostProfileLinux]),
      affectsConfiguration: (key) => key === TerminalSettingId.AgentHostProfileLinux,
      source: 1,
      // ConfigurationTarget.USER
      change: { keys: [TerminalSettingId.AgentHostProfileLinux], overrides: [] }
    });
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, initialCount + 1);
    const last = agentHostService.dispatchedActions[agentHostService.dispatchedActions.length - 1].action;
    assert.deepStrictEqual(last.config, {
      [AgentHostConfigKey.DefaultShell]: "/usr/bin/pwsh"
    });
  });
  test("re-dispatches when terminal profiles become available", async () => {
    const { agentHostService, profileService } = setup(disposables);
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    const initialCount = agentHostService.dispatchedActions.length;
    profileService.fireAvailableProfilesChanged();
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, initialCount + 1);
  });
  test("skips dispatch when the resolver returns a profile without a path", async () => {
    const { agentHostService, resolver } = setup(disposables);
    resolver.profile = { profileName: "Empty", path: "", args: [], isDefault: false };
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("skips dispatch when the resolver throws", async () => {
    const { agentHostService, resolver } = setup(disposables);
    resolver.profile = new Error("resolver failed");
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("skips dispatch when the schema retracts the key while resolving", async () => {
    const { agentHostService, resolver } = setup(disposables);
    resolver.profile = { profileName: "Bash", path: "/usr/bin/bash", args: [], isDefault: true };
    resolver.onResolve = () => {
      agentHostService.setRootState(rootStateWithoutDefaultShellKey());
    };
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("uses the local OS when resolving the profile", async () => {
    const { agentHostService, resolver } = setup(disposables);
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.strictEqual(resolver.lastOptions?.os, OS);
    assert.strictEqual(resolver.lastOptions?.remoteAuthority, void 0);
  });
  test("dispatches enableCustomTerminalTool from the VS Code setting", async () => {
    const { agentHostService, configurationService } = setup(disposables);
    configurationService.setUserConfiguration(AgentHostCustomTerminalToolEnabledSettingId, false);
    agentHostService.setRootState(rootStateWithEnableCustomTerminalToolKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    assert.deepStrictEqual(agentHostService.dispatchedActions[0].action.config, {
      [CopilotCliConfigKey.EnableCustomTerminalTool]: false
    });
  });
  test("dispatches enableCustomTerminalTool true when the setting is enabled", async () => {
    const { agentHostService } = setup(disposables);
    agentHostService.setRootState(rootStateWithEnableCustomTerminalToolKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    assert.deepStrictEqual(agentHostService.dispatchedActions[0].action.config, {
      [CopilotCliConfigKey.EnableCustomTerminalTool]: true
    });
  });
  test("re-dispatches enableCustomTerminalTool when the enabled setting changes", async () => {
    const { agentHostService, configurationService } = setup(disposables);
    const rootState = rootStateWithEnableCustomTerminalToolKey();
    rootState.config.values[CopilotCliConfigKey.EnableCustomTerminalTool] = true;
    agentHostService.setRootState(rootState);
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
    configurationService.setUserConfiguration(AgentHostCustomTerminalToolEnabledSettingId, false);
    configurationService.onDidChangeConfigurationEmitter.fire({
      affectedKeys: /* @__PURE__ */ new Set([AgentHostCustomTerminalToolEnabledSettingId]),
      affectsConfiguration: (key) => key === AgentHostCustomTerminalToolEnabledSettingId,
      source: 1,
      // ConfigurationTarget.USER
      change: { keys: [AgentHostCustomTerminalToolEnabledSettingId], overrides: [] }
    });
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    assert.deepStrictEqual(agentHostService.dispatchedActions[0].action.config, {
      [CopilotCliConfigKey.EnableCustomTerminalTool]: false
    });
  });
  test("does not re-dispatch when another window changes the shared root config value (no schema change)", async () => {
    const { agentHostService } = setup(disposables);
    agentHostService.setRootState(rootStateWithDefaultShellKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const updated = rootStateWithDefaultShellKey();
    updated.config.values[AgentHostConfigKey.DefaultShell] = "C:/other/window/shell.exe";
    agentHostService.setRootState(updated);
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
  });
  test("does not re-dispatch enableCustomTerminalTool on a value-only root-state change", async () => {
    const { agentHostService } = setup(disposables);
    const rootState = rootStateWithEnableCustomTerminalToolKey();
    rootState.config.values[CopilotCliConfigKey.EnableCustomTerminalTool] = true;
    agentHostService.setRootState(rootState);
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
    const updated = rootStateWithEnableCustomTerminalToolKey();
    updated.config.values[CopilotCliConfigKey.EnableCustomTerminalTool] = false;
    agentHostService.setRootState(updated);
    await flush();
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("dispatches the enterprise base when signed in via a GHE provider", async () => {
    const { agentHostService, defaultAccountService } = setup(disposables);
    defaultAccountService.enterprise = true;
    defaultAccountService.gitHubBaseUrl = "https://acme.ghe.com";
    agentHostService.setRootState(rootStateWithGithubEnterpriseUriKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    assert.deepStrictEqual(agentHostService.dispatchedActions[0].action.config, {
      [AgentHostConfigKey.GithubEnterpriseUri]: "https://acme.ghe.com"
    });
  });
  test("dispatches an empty enterprise URI for a github.com account", async () => {
    const { agentHostService } = setup(disposables);
    agentHostService.setRootState(rootStateWithGithubEnterpriseUriKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    assert.deepStrictEqual(agentHostService.dispatchedActions[0].action.config, {
      [AgentHostConfigKey.GithubEnterpriseUri]: ""
    });
  });
  test("re-dispatches the enterprise URI when the default account changes", async () => {
    const { agentHostService, defaultAccountService } = setup(disposables);
    agentHostService.setRootState(rootStateWithGithubEnterpriseUriKey());
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    defaultAccountService.enterprise = true;
    defaultAccountService.gitHubBaseUrl = "https://acme.ghe.com";
    defaultAccountService.fireChange();
    await flush();
    assert.strictEqual(agentHostService.dispatchedActions.length, 2);
    assert.deepStrictEqual(agentHostService.dispatchedActions[1].action.config, {
      [AgentHostConfigKey.GithubEnterpriseUri]: "https://acme.ghe.com"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0VGVybWluYWxDb250cmlidXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBPUywgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB0eXBlIHsgSURlZmF1bHRBY2NvdW50LCBJRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWQsIENvcGlsb3RDbGlDb25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2NvcGlsb3RDbGlDb25maWcuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RDdXN0b21pemF0aW9uQ29uZmlnLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IEFjdGlvbkVudmVsb3BlLCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24sIElOb3RpZmljYXRpb24sIFNlc3Npb25BY3Rpb24sIFRlcm1pbmFsQWN0aW9uLCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBSb290U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFNldHRpbmdJZCwgdHlwZSBJVGVybWluYWxQcm9maWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsIElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLCB0eXBlIElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL2FnZW50SG9zdFRlcm1pbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RUZXJtaW5hbENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0VGVybWluYWxDb250cmlidXRpb24uanMnO1xuXG4vLyAtLS0tIE1vY2sgYWdlbnQgaG9zdCBzZXJ2aWNlIChtaW5pbWFsIFx1MjAxNCBvbmx5IHdoYXQgdGhlIGNvbnRyaWJ1dGlvbiB0b3VjaGVzKSAtLS0tXG5cbmNsYXNzIE1vY2tBZ2VudEhvc3RTZXJ2aWNlIGV4dGVuZHMgbW9jazxJQWdlbnRIb3N0U2VydmljZT4oKSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IGNsaWVudElkID0gJ3Rlc3Qtd2luZG93LTEnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQWdlbnRIb3N0U3RhcnQgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkFnZW50SG9zdFN0YXJ0ID0gdGhpcy5fb25BZ2VudEhvc3RTdGFydC5ldmVudDtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25BZ2VudEhvc3RFeGl0ID0gRXZlbnQuTm9uZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFjdGlvbiA9IG5ldyBFbWl0dGVyPEFjdGlvbkVudmVsb3BlPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFjdGlvbiA9IHRoaXMuX29uRGlkQWN0aW9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE5vdGlmaWNhdGlvbiA9IG5ldyBFbWl0dGVyPElOb3RpZmljYXRpb24+KCk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uID0gdGhpcy5fb25EaWROb3RpZmljYXRpb24uZXZlbnQ7XG5cblx0cHVibGljIGRpc3BhdGNoZWRBY3Rpb25zOiB7IGNoYW5uZWw6IHN0cmluZzsgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiB9W10gPSBbXTtcblxuXHRvdmVycmlkZSBkaXNwYXRjaChjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLmRpc3BhdGNoZWRBY3Rpb25zLnB1c2goeyBjaGFubmVsLCBhY3Rpb24gfSk7XG5cdH1cblxuXHRwcml2YXRlIF9yb290U3RhdGVWYWx1ZTogUm9vdFN0YXRlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yb290U3RhdGVPbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPFJvb3RTdGF0ZT4oKTtcblxuXHRvdmVycmlkZSByZWFkb25seSByb290U3RhdGU6IElBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+ID0gKCgpID0+IHtcblx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0IHZhbHVlKCkgeyByZXR1cm4gc2VsZi5fcm9vdFN0YXRlVmFsdWU7IH0sXG5cdFx0XHRnZXQgdmVyaWZpZWRWYWx1ZSgpIHsgcmV0dXJuIHNlbGYuX3Jvb3RTdGF0ZVZhbHVlOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMuX3Jvb3RTdGF0ZU9uRGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0b25XaWxsQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdH0pKCk7XG5cblx0LyoqIFRlc3QgaGVscGVyOiBzZXQgcm9vdFN0YXRlIHZhbHVlIGFuZCBmaXJlIG9uRGlkQ2hhbmdlLiAqL1xuXHRzZXRSb290U3RhdGUoc3RhdGU6IFJvb3RTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZVZhbHVlID0gc3RhdGU7XG5cdFx0dGhpcy5fcm9vdFN0YXRlT25EaWRDaGFuZ2UuZmlyZShzdGF0ZSk7XG5cdH1cblxuXHRmaXJlQWdlbnRIb3N0U3RhcnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25BZ2VudEhvc3RTdGFydC5maXJlKCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uQWdlbnRIb3N0U3RhcnQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQWN0aW9uLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZE5vdGlmaWNhdGlvbi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcm9vdFN0YXRlT25EaWRDaGFuZ2UuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vIC0tLS0gTW9jayB0ZXJtaW5hbCBwcm9maWxlIHJlc29sdmVyIChyZXR1cm5zIGEgY29uZmlndXJhYmxlIHByb2ZpbGUpIC0tLS1cblxuY2xhc3MgTW9ja1Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSBleHRlbmRzIG1vY2s8SVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZT4oKSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBwcm9maWxlOiBJVGVybWluYWxQcm9maWxlIHwgRXJyb3IgPSB7XG5cdFx0cHJvZmlsZU5hbWU6ICdCYXNoJyxcblx0XHRwYXRoOiAnL2Jpbi9iYXNoJyxcblx0XHRhcmdzOiBbXSxcblx0XHRpc0RlZmF1bHQ6IHRydWUsXG5cdH07XG5cdHB1YmxpYyBsYXN0T3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cblx0LyoqIE9wdGlvbmFsIGhvb2sgaW52b2tlZCBpbnNpZGUgZ2V0RGVmYXVsdFByb2ZpbGUsIGJlZm9yZSBpdCByZXNvbHZlcy4gKi9cblx0cHVibGljIG9uUmVzb2x2ZTogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIGFzeW5jIGdldERlZmF1bHRQcm9maWxlKG9wdGlvbnM6IElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zKTogUHJvbWlzZTxJVGVybWluYWxQcm9maWxlPiB7XG5cdFx0dGhpcy5sYXN0T3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5vblJlc29sdmU/LigpO1xuXHRcdGlmICh0aGlzLnByb2ZpbGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5wcm9maWxlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5wcm9maWxlO1xuXHR9XG59XG5cbi8vIC0tLS0gTW9jayB0ZXJtaW5hbCBwcm9maWxlIHNlcnZpY2UgKG9ubHkgb25EaWRDaGFuZ2VBdmFpbGFibGVQcm9maWxlcyBpcyB1c2VkKSAtLS0tXG5cbmNsYXNzIE1vY2tUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIGV4dGVuZHMgbW9jazxJVGVybWluYWxQcm9maWxlU2VydmljZT4oKSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQXZhaWxhYmxlUHJvZmlsZXMgPSBuZXcgRW1pdHRlcjxJVGVybWluYWxQcm9maWxlW10+KCk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXZhaWxhYmxlUHJvZmlsZXMgPSB0aGlzLl9vbkRpZENoYW5nZUF2YWlsYWJsZVByb2ZpbGVzLmV2ZW50O1xuXG5cdGZpcmVBdmFpbGFibGVQcm9maWxlc0NoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBdmFpbGFibGVQcm9maWxlcy5maXJlKFtdKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBdmFpbGFibGVQcm9maWxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLy8gLS0tLSBNb2NrIGRlZmF1bHQgYWNjb3VudCBzZXJ2aWNlIChlbnRlcnByaXNlIHN0YXRlICsgR2l0SHViIGJhc2UgVVJMKSAtLS0tXG5cbmNsYXNzIE1vY2tEZWZhdWx0QWNjb3VudFNlcnZpY2UgZXh0ZW5kcyBtb2NrPElEZWZhdWx0QWNjb3VudFNlcnZpY2U+KCkge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50ID0gbmV3IEVtaXR0ZXI8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4oKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudCA9IHRoaXMuX29uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQuZXZlbnQ7XG5cblx0cHVibGljIGVudGVycHJpc2UgPSBmYWxzZTtcblx0cHVibGljIGdpdEh1YkJhc2VVcmwgPSAnaHR0cHM6Ly9naXRodWIuY29tJztcblxuXHRvdmVycmlkZSBnZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTogSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlciB7XG5cdFx0cmV0dXJuIHsgaWQ6ICdnaXRodWInLCBuYW1lOiAnR2l0SHViJywgZW50ZXJwcmlzZTogdGhpcy5lbnRlcnByaXNlIH07XG5cdH1cblxuXHRvdmVycmlkZSByZXNvbHZlR2l0SHViVXJsKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMuZ2l0SHViQmFzZVVybH0vJHtwYXRofWA7XG5cdH1cblxuXHRmaXJlQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQuZmlyZShudWxsKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLy8gLS0tLSBIZWxwZXJzIC0tLS1cblxuZnVuY3Rpb24gbWFrZVJvb3RTdGF0ZVdpdGhTY2hlbWEocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBSb290U3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdGFnZW50czogW10sXG5cdFx0Y29uZmlnOiB7XG5cdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHByb3BlcnRpZXMgYXMgUmVjb3JkPHN0cmluZywgbmV2ZXI+IH0sXG5cdFx0XHR2YWx1ZXM6IHt9LFxuXHRcdH0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIHJvb3RTdGF0ZVdpdGhEZWZhdWx0U2hlbGxLZXkoKTogUm9vdFN0YXRlIHtcblx0cmV0dXJuIG1ha2VSb290U3RhdGVXaXRoU2NoZW1hKHtcblx0XHRbQWdlbnRIb3N0Q29uZmlnS2V5LkRlZmF1bHRTaGVsbF06IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnRGVmYXVsdCBTaGVsbCcgfSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHJvb3RTdGF0ZVdpdGhvdXREZWZhdWx0U2hlbGxLZXkoKTogUm9vdFN0YXRlIHtcblx0cmV0dXJuIG1ha2VSb290U3RhdGVXaXRoU2NoZW1hKHtcblx0XHQvLyBTY2hlbWEgcHVibGlzaGVkIGJ5IGFuIG9sZGVyIC8gdGhpcmQtcGFydHkgaG9zdCB0aGF0IGRvZXNuJ3Qga25vd1xuXHRcdC8vIGFib3V0IGRlZmF1bHRTaGVsbC5cblx0XHRbQWdlbnRIb3N0Q29uZmlnS2V5LkN1c3RvbWl6YXRpb25zXTogeyB0eXBlOiAnYXJyYXknLCB0aXRsZTogJ0N1c3RvbWl6YXRpb25zJyB9LFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gcm9vdFN0YXRlV2l0aEVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbEtleSgpOiBSb290U3RhdGUge1xuXHRyZXR1cm4gbWFrZVJvb3RTdGF0ZVdpdGhTY2hlbWEoe1xuXHRcdFtDb3BpbG90Q2xpQ29uZmlnS2V5LkVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbF06IHsgdHlwZTogJ2Jvb2xlYW4nLCB0aXRsZTogJ1VzZSBBZ2VudCBIb3N0IFRlcm1pbmFsIFRvb2wnIH0sXG5cdH0pO1xufVxuXG5mdW5jdGlvbiByb290U3RhdGVXaXRoR2l0aHViRW50ZXJwcmlzZVVyaUtleSgpOiBSb290U3RhdGUge1xuXHRyZXR1cm4gbWFrZVJvb3RTdGF0ZVdpdGhTY2hlbWEoe1xuXHRcdFtBZ2VudEhvc3RDb25maWdLZXkuR2l0aHViRW50ZXJwcmlzZVVyaV06IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnR2l0SHViIEVudGVycHJpc2UgVVJJJyB9LFxuXHR9KTtcbn1cblxuaW50ZXJmYWNlIElUZXN0U2V0dXAge1xuXHRjb250cmlidXRpb246IEFnZW50SG9zdFRlcm1pbmFsQ29udHJpYnV0aW9uO1xuXHRhZ2VudEhvc3RTZXJ2aWNlOiBNb2NrQWdlbnRIb3N0U2VydmljZTtcblx0cmVzb2x2ZXI6IE1vY2tUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2U7XG5cdHByb2ZpbGVTZXJ2aWNlOiBNb2NrVGVybWluYWxQcm9maWxlU2VydmljZTtcblx0Y29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlOiBNb2NrRGVmYXVsdEFjY291bnRTZXJ2aWNlO1xufVxuXG5mdW5jdGlvbiBzZXR1cChkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBhZ2VudEhvc3RFbmFibGVkOiBib29sZWFuID0gdHJ1ZSk6IElUZXN0U2V0dXAge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRjb25zdCBhZ2VudEhvc3RTZXJ2aWNlID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGFnZW50SG9zdFNlcnZpY2UuZGlzcG9zZSgpIH0pO1xuXHRjb25zdCByZXNvbHZlciA9IG5ldyBNb2NrVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlKCk7XG5cdGNvbnN0IHByb2ZpbGVTZXJ2aWNlID0gbmV3IE1vY2tUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlKCk7XG5cdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHByb2ZpbGVTZXJ2aWNlLmRpc3Bvc2UoKSB9KTtcblx0Y29uc3QgZGVmYXVsdEFjY291bnRTZXJ2aWNlID0gbmV3IE1vY2tEZWZhdWx0QWNjb3VudFNlcnZpY2UoKTtcblx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gZGVmYXVsdEFjY291bnRTZXJ2aWNlLmRpc3Bvc2UoKSB9KTtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRbQWdlbnRIb3N0Q3VzdG9tVGVybWluYWxUb29sRW5hYmxlZFNldHRpbmdJZF06IHRydWUsXG5cdH0pO1xuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdFNlcnZpY2UsIGFnZW50SG9zdFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGVuYWJsZWQ6IG9ic2VydmFibGVWYWx1ZSgnYWdlbnRIb3N0RW5hYmxlZCcsIGFnZW50SG9zdEVuYWJsZWQpIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsIHJlc29sdmVyKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxQcm9maWxlU2VydmljZSwgcHJvZmlsZVNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEZWZhdWx0QWNjb3VudFNlcnZpY2UsIGRlZmF1bHRBY2NvdW50U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdFRlcm1pbmFsU2VydmljZSwge1xuXHRcdHJlZ2lzdGVyRW50cnk6ICgpOiBJRGlzcG9zYWJsZSA9PiAoeyBkaXNwb3NlKCkgeyB9IH0pLFxuXHRcdHByb2ZpbGVzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCBbXSksXG5cdH0pO1xuXG5cdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RUZXJtaW5hbENvbnRyaWJ1dGlvbikpO1xuXHRyZXR1cm4geyBjb250cmlidXRpb24sIGFnZW50SG9zdFNlcnZpY2UsIHJlc29sdmVyLCBwcm9maWxlU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGRlZmF1bHRBY2NvdW50U2VydmljZSB9O1xufVxuXG4vKiogV2FpdCBmb3IgYW55IGluLWZsaWdodCBgX3B1c2hEZWZhdWx0U2hlbGxgIHByb21pc2VzIHRvIHNldHRsZS4gKi9cbmFzeW5jIGZ1bmN0aW9uIGZsdXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHQvLyBUd28gbWljcm90YXNrIGhvcHM6IG9uZSBmb3IgdGhlIGF3YWl0IG9uIGdldERlZmF1bHRQcm9maWxlLCBvbmUgZm9yXG5cdC8vIHRoZSByZXNvbHZlXHUyMTkyZGlzcGF0Y2ggc2VxdWVuY2UuXG5cdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuc3VpdGUoJ0FnZW50SG9zdFRlcm1pbmFsQ29udHJpYnV0aW9uJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBkaXNwYXRjaCB3aGVuIGNoYXQuYWdlbnRIb3N0LmVuYWJsZWQgaXMgZmFsc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgLyphZ2VudEhvc3RFbmFibGVkKi8gZmFsc2UpO1xuXG5cdFx0Ly8gRXZlbiB3aXRoIGEgZnVsbHktaHlkcmF0ZWQgcm9vdFN0YXRlLCBub3RoaW5nIHNob3VsZCBmaXJlIGJlY2F1c2Vcblx0XHQvLyB0aGUgY29udHJpYnV0aW9uIHNob3J0LWNpcmN1aXRzIGluIF91cGRhdGVFbmFibGVkLlxuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhEZWZhdWx0U2hlbGxLZXkoKSk7XG5cdFx0YWdlbnRIb3N0U2VydmljZS5maXJlQWdlbnRIb3N0U3RhcnQoKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGRpc3BhdGNoIHdoaWxlIHJvb3RTdGF0ZSBoYXMgbm90IGh5ZHJhdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYWdlbnRIb3N0U2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXG5cdFx0Ly8gcm9vdFN0YXRlLnZhbHVlIGlzIHVuZGVmaW5lZCBcdTIwMTQgc2NoZW1hIGdhdGUgYmFpbHMgYmVmb3JlIGRpc3BhdGNoLlxuXHRcdGFnZW50SG9zdFNlcnZpY2UuZmlyZUFnZW50SG9zdFN0YXJ0KCk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBkaXNwYXRjaCB3aGVuIGhvc3Qgc2NoZW1hIGRvZXMgbm90IGFkdmVydGlzZSBkZWZhdWx0U2hlbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcyk7XG5cblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRob3V0RGVmYXVsdFNoZWxsS2V5KCkpO1xuXHRcdGFnZW50SG9zdFNlcnZpY2UuZmlyZUFnZW50SG9zdFN0YXJ0KCk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwYXRjaGVzIFJvb3RDb25maWdDaGFuZ2VkIHdpdGggcmVzb2x2ZWQgc2hlbGwgcGF0aCB3aGVuIGhvc3Qgc2NoZW1hIGluY2x1ZGVzIGRlZmF1bHRTaGVsbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGFnZW50SG9zdFNlcnZpY2UsIHJlc29sdmVyIH0gPSBzZXR1cChkaXNwb3NhYmxlcyk7XG5cdFx0cmVzb2x2ZXIucHJvZmlsZSA9IHsgcHJvZmlsZU5hbWU6ICdHaXQgQmFzaCcsIHBhdGg6ICcvdXNyL2Jpbi9iYXNoJywgYXJnczogW10sIGlzRGVmYXVsdDogdHJ1ZSB9O1xuXG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aERlZmF1bHRTaGVsbEtleSgpKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0Ly8gVGhlIGhvc3Qtc3RhcnQgZmlyZSBmcm9tIHNldFJvb3RTdGF0ZSdzIG9uRGlkQ2hhbmdlIGxpc3RlbmVyIHNob3VsZFxuXHRcdC8vIGhhdmUgcHJvZHVjZWQgZXhhY3RseSBvbmUgZGlzcGF0Y2ggd2l0aCB0aGUgcmVzb2x2ZWQgcGF0aC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGFjdGlvbiA9IGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnNbMF0uYWN0aW9uO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb24udHlwZSwgQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYWN0aW9uIGFzIElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbikuY29uZmlnLCB7XG5cdFx0XHRbQWdlbnRIb3N0Q29uZmlnS2V5LkRlZmF1bHRTaGVsbF06ICcvdXNyL2Jpbi9iYXNoJyxcblx0XHR9KTtcblxuXHRcdC8vIFJlc29sdmVyIHNob3VsZCBoYXZlIGJlZW4gY2FsbGVkIHdpdGggdGhlIGFnZW50LWhvc3Qtc2hlbGwgZmxhZy5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZXIubGFzdE9wdGlvbnM/LmFsbG93QWdlbnRIb3N0U2hlbGwsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlci5sYXN0T3B0aW9ucz8ub3MsIE9TKTtcblx0fSk7XG5cblx0dGVzdCgncmV0cmllcyB0aGUgcHVzaCB3aGVuIHJvb3RTdGF0ZSBoeWRyYXRlcyBhZnRlciBhZ2VudEhvc3RTdGFydCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGFnZW50SG9zdFNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIEluaXRpYWwgc3RhcnQgaGFwcGVucyBiZWZvcmUgcm9vdFN0YXRlIGh5ZHJhdGlvbiBcdTIwMTQgcHVzaCBpcyBnYXRlZC5cblx0XHRhZ2VudEhvc3RTZXJ2aWNlLmZpcmVBZ2VudEhvc3RTdGFydCgpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLCBbXSk7XG5cblx0XHQvLyBTY2hlbWEgYXJyaXZlcyBcdTIwMTQgb25EaWRDaGFuZ2UgbGlzdGVuZXIgdHJpZ2dlcnMgdGhlIHJldHJ5LlxuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhEZWZhdWx0U2hlbGxLZXkoKSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlLWRpc3BhdGNoZXMgd2hlbiBhbiBhZ2VudC1ob3N0LXNoZWxsLWRlcGVuZGVudCBzZXR0aW5nIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlLCByZXNvbHZlciwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzKTtcblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoRGVmYXVsdFNoZWxsS2V5KCkpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cdFx0Y29uc3QgaW5pdGlhbENvdW50ID0gYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGg7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluaXRpYWxDb3VudCwgMSk7XG5cblx0XHQvLyBVc2VyIGNoYW5nZXMgdGhlaXIgYWdlbnQtaG9zdCBwcm9maWxlIHNldHRpbmcuXG5cdFx0cmVzb2x2ZXIucHJvZmlsZSA9IHsgcHJvZmlsZU5hbWU6ICdQb3dlclNoZWxsJywgcGF0aDogJy91c3IvYmluL3B3c2gnLCBhcmdzOiBbXSwgaXNEZWZhdWx0OiB0cnVlIH07XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbVGVybWluYWxTZXR0aW5nSWQuQWdlbnRIb3N0UHJvZmlsZUxpbnV4XSksXG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09IFRlcm1pbmFsU2V0dGluZ0lkLkFnZW50SG9zdFByb2ZpbGVMaW51eCxcblx0XHRcdHNvdXJjZTogMSwgLy8gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSXG5cdFx0XHRjaGFuZ2U6IHsga2V5czogW1Rlcm1pbmFsU2V0dGluZ0lkLkFnZW50SG9zdFByb2ZpbGVMaW51eF0sIG92ZXJyaWRlczogW10gfSxcblx0XHR9KTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCBpbml0aWFsQ291bnQgKyAxKTtcblx0XHRjb25zdCBsYXN0ID0gYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9uc1thZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCAtIDFdLmFjdGlvbjtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChsYXN0IGFzIElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbikuY29uZmlnLCB7XG5cdFx0XHRbQWdlbnRIb3N0Q29uZmlnS2V5LkRlZmF1bHRTaGVsbF06ICcvdXNyL2Jpbi9wd3NoJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmUtZGlzcGF0Y2hlcyB3aGVuIHRlcm1pbmFsIHByb2ZpbGVzIGJlY29tZSBhdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlLCBwcm9maWxlU2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhEZWZhdWx0U2hlbGxLZXkoKSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblx0XHRjb25zdCBpbml0aWFsQ291bnQgPSBhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aDtcblxuXHRcdC8vIFByb2ZpbGUgZGV0ZWN0aW9uIGZpbmlzaGVkIChlLmcuIGNvbGQtc3RhcnQgcmFjZSkuXG5cdFx0cHJvZmlsZVNlcnZpY2UuZmlyZUF2YWlsYWJsZVByb2ZpbGVzQ2hhbmdlZCgpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIGluaXRpYWxDb3VudCArIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBkaXNwYXRjaCB3aGVuIHRoZSByZXNvbHZlciByZXR1cm5zIGEgcHJvZmlsZSB3aXRob3V0IGEgcGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGFnZW50SG9zdFNlcnZpY2UsIHJlc29sdmVyIH0gPSBzZXR1cChkaXNwb3NhYmxlcyk7XG5cdFx0cmVzb2x2ZXIucHJvZmlsZSA9IHsgcHJvZmlsZU5hbWU6ICdFbXB0eScsIHBhdGg6ICcnLCBhcmdzOiBbXSwgaXNEZWZhdWx0OiBmYWxzZSB9O1xuXG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aERlZmF1bHRTaGVsbEtleSgpKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIGRpc3BhdGNoIHdoZW4gdGhlIHJlc29sdmVyIHRocm93cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGFnZW50SG9zdFNlcnZpY2UsIHJlc29sdmVyIH0gPSBzZXR1cChkaXNwb3NhYmxlcyk7XG5cdFx0cmVzb2x2ZXIucHJvZmlsZSA9IG5ldyBFcnJvcigncmVzb2x2ZXIgZmFpbGVkJyk7XG5cblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoRGVmYXVsdFNoZWxsS2V5KCkpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgZGlzcGF0Y2ggd2hlbiB0aGUgc2NoZW1hIHJldHJhY3RzIHRoZSBrZXkgd2hpbGUgcmVzb2x2aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYWdlbnRIb3N0U2VydmljZSwgcmVzb2x2ZXIgfSA9IHNldHVwKGRpc3Bvc2FibGVzKTtcblx0XHRyZXNvbHZlci5wcm9maWxlID0geyBwcm9maWxlTmFtZTogJ0Jhc2gnLCBwYXRoOiAnL3Vzci9iaW4vYmFzaCcsIGFyZ3M6IFtdLCBpc0RlZmF1bHQ6IHRydWUgfTtcblxuXHRcdC8vIFdoaWxlIGdldERlZmF1bHRQcm9maWxlIGlzIGluIGZsaWdodCAoZS5nLiBhIGhvc3QgcmVzdGFydCAvIHNjaGVtYVxuXHRcdC8vIHJlZnJlc2ggbGFuZHMpLCBzd2FwIHRvIGEgc2NoZW1hIHRoYXQgbm8gbG9uZ2VyIGFkdmVydGlzZXNcblx0XHQvLyBkZWZhdWx0U2hlbGwuIFRoZSBwb3N0LWF3YWl0IHNjaGVtYSBnYXRlIG11c3QgY2F0Y2ggdGhpcyBhbmQgYmFpbC5cblx0XHRyZXNvbHZlci5vblJlc29sdmUgPSAoKSA9PiB7XG5cdFx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRob3V0RGVmYXVsdFNoZWxsS2V5KCkpO1xuXHRcdH07XG5cblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoRGVmYXVsdFNoZWxsS2V5KCkpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB0aGUgbG9jYWwgT1Mgd2hlbiByZXNvbHZpbmcgdGhlIHByb2ZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlLCByZXNvbHZlciB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhEZWZhdWx0U2hlbGxLZXkoKSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlci5sYXN0T3B0aW9ucz8ub3MsIE9TIGFzIE9wZXJhdGluZ1N5c3RlbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVyLmxhc3RPcHRpb25zPy5yZW1vdGVBdXRob3JpdHksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3BhdGNoZXMgZW5hYmxlQ3VzdG9tVGVybWluYWxUb29sIGZyb20gdGhlIFZTIENvZGUgc2V0dGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGFnZW50SG9zdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcyk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQWdlbnRIb3N0Q3VzdG9tVGVybWluYWxUb29sRW5hYmxlZFNldHRpbmdJZCwgZmFsc2UpO1xuXG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aEVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbEtleSgpKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zWzBdLmFjdGlvbiBhcyBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pLmNvbmZpZywge1xuXHRcdFx0W0NvcGlsb3RDbGlDb25maWdLZXkuRW5hYmxlQ3VzdG9tVGVybWluYWxUb29sXTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3BhdGNoZXMgZW5hYmxlQ3VzdG9tVGVybWluYWxUb29sIHRydWUgd2hlbiB0aGUgc2V0dGluZyBpcyBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYWdlbnRIb3N0U2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aEVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbEtleSgpKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zWzBdLmFjdGlvbiBhcyBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pLmNvbmZpZywge1xuXHRcdFx0W0NvcGlsb3RDbGlDb25maWdLZXkuRW5hYmxlQ3VzdG9tVGVybWluYWxUb29sXTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmUtZGlzcGF0Y2hlcyBlbmFibGVDdXN0b21UZXJtaW5hbFRvb2wgd2hlbiB0aGUgZW5hYmxlZCBzZXR0aW5nIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHJvb3RTdGF0ZSA9IHJvb3RTdGF0ZVdpdGhFbmFibGVDdXN0b21UZXJtaW5hbFRvb2xLZXkoKTtcblx0XHRyb290U3RhdGUuY29uZmlnIS52YWx1ZXNbQ29waWxvdENsaUNvbmZpZ0tleS5FbmFibGVDdXN0b21UZXJtaW5hbFRvb2xdID0gdHJ1ZTtcblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGUpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zIGFzIHJlYWRvbmx5IHVua25vd25bXSwgW10pO1xuXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQWdlbnRIb3N0Q3VzdG9tVGVybWluYWxUb29sRW5hYmxlZFNldHRpbmdJZCwgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoW0FnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWRdKSxcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoa2V5OiBzdHJpbmcpID0+IGtleSA9PT0gQWdlbnRIb3N0Q3VzdG9tVGVybWluYWxUb29sRW5hYmxlZFNldHRpbmdJZCxcblx0XHRcdHNvdXJjZTogMSwgLy8gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSXG5cdFx0XHRjaGFuZ2U6IHsga2V5czogW0FnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWRdLCBvdmVycmlkZXM6IFtdIH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9uc1swXS5hY3Rpb24gYXMgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKS5jb25maWcsIHtcblx0XHRcdFtDb3BpbG90Q2xpQ29uZmlnS2V5LkVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbF06IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZS1kaXNwYXRjaCB3aGVuIGFub3RoZXIgd2luZG93IGNoYW5nZXMgdGhlIHNoYXJlZCByb290IGNvbmZpZyB2YWx1ZSAobm8gc2NoZW1hIGNoYW5nZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcyk7XG5cblx0XHQvLyBTY2hlbWEgaHlkcmF0ZXMgXHUyMTkyIGluaXRpYWwgcHVzaCBmb3IgZGVmYXVsdFNoZWxsLlxuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhEZWZhdWx0U2hlbGxLZXkoKSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gQW5vdGhlciB3aW5kb3cgd3JpdGVzIGEgKmRpZmZlcmVudCogdmFsdWUgaW50byB0aGUgc2hhcmVkIHJvb3QgY29uZmlnLlxuXHRcdC8vIFRoZSBzY2hlbWEgaXMgdW5jaGFuZ2VkIC0gb25seSB0aGUgdmFsdWUgZGlmZmVycy4gVGhpcyBtdXN0IE5PVCB0cmlnZ2VyXG5cdFx0Ly8gYSByZS1wdXNoLCBvdGhlcndpc2UgdHdvIHdpbmRvd3Mgd2l0aCBkaWZmZXJlbnQgc2V0dGluZ3MgcGluZy1wb25nXG5cdFx0Ly8gZm9yZXZlciAodGhlIGxvb3AgdGhpcyBndWFyZHMgYWdhaW5zdCkuXG5cdFx0Y29uc3QgdXBkYXRlZCA9IHJvb3RTdGF0ZVdpdGhEZWZhdWx0U2hlbGxLZXkoKTtcblx0XHR1cGRhdGVkLmNvbmZpZyEudmFsdWVzW0FnZW50SG9zdENvbmZpZ0tleS5EZWZhdWx0U2hlbGxdID0gJ0M6L290aGVyL3dpbmRvdy9zaGVsbC5leGUnO1xuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHVwZGF0ZWQpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZS1kaXNwYXRjaCBlbmFibGVDdXN0b21UZXJtaW5hbFRvb2wgb24gYSB2YWx1ZS1vbmx5IHJvb3Qtc3RhdGUgY2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYWdlbnRIb3N0U2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXG5cdFx0Ly8gU2NoZW1hIGh5ZHJhdGVzIHdpdGggb3VyIHByZWZlcnJlZCB2YWx1ZSBhbHJlYWR5IHByZXNlbnQgXHUyMTkyIG5vIHB1c2guXG5cdFx0Y29uc3Qgcm9vdFN0YXRlID0gcm9vdFN0YXRlV2l0aEVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbEtleSgpO1xuXHRcdHJvb3RTdGF0ZS5jb25maWchLnZhbHVlc1tDb3BpbG90Q2xpQ29uZmlnS2V5LkVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbF0gPSB0cnVlO1xuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMgYXMgcmVhZG9ubHkgdW5rbm93bltdLCBbXSk7XG5cblx0XHQvLyBBbm90aGVyIHdpbmRvdyBmbGlwcyB0aGUgc2hhcmVkIHZhbHVlLiBTY2hlbWEgdW5jaGFuZ2VkIFx1MjE5MiBubyBmaWdodC5cblx0XHRjb25zdCB1cGRhdGVkID0gcm9vdFN0YXRlV2l0aEVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbEtleSgpO1xuXHRcdHVwZGF0ZWQuY29uZmlnIS52YWx1ZXNbQ29waWxvdENsaUNvbmZpZ0tleS5FbmFibGVDdXN0b21UZXJtaW5hbFRvb2xdID0gZmFsc2U7XG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUodXBkYXRlZCk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucyBhcyByZWFkb25seSB1bmtub3duW10sIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcGF0Y2hlcyB0aGUgZW50ZXJwcmlzZSBiYXNlIHdoZW4gc2lnbmVkIGluIHZpYSBhIEdIRSBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGFnZW50SG9zdFNlcnZpY2UsIGRlZmF1bHRBY2NvdW50U2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5lbnRlcnByaXNlID0gdHJ1ZTtcblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2UuZ2l0SHViQmFzZVVybCA9ICdodHRwczovL2FjbWUuZ2hlLmNvbSc7XG5cblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoR2l0aHViRW50ZXJwcmlzZVVyaUtleSgpKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zWzBdLmFjdGlvbiBhcyBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pLmNvbmZpZywge1xuXHRcdFx0W0FnZW50SG9zdENvbmZpZ0tleS5HaXRodWJFbnRlcnByaXNlVXJpXTogJ2h0dHBzOi8vYWNtZS5naGUuY29tJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcGF0Y2hlcyBhbiBlbXB0eSBlbnRlcnByaXNlIFVSSSBmb3IgYSBnaXRodWIuY29tIGFjY291bnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcyk7IC8vIGRlZmF1bHQgYWNjb3VudCBpcyBub3QgZW50ZXJwcmlzZVxuXG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aEdpdGh1YkVudGVycHJpc2VVcmlLZXkoKSk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9uc1swXS5hY3Rpb24gYXMgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKS5jb25maWcsIHtcblx0XHRcdFtBZ2VudEhvc3RDb25maWdLZXkuR2l0aHViRW50ZXJwcmlzZVVyaV06ICcnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZS1kaXNwYXRjaGVzIHRoZSBlbnRlcnByaXNlIFVSSSB3aGVuIHRoZSBkZWZhdWx0IGFjY291bnQgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGFnZW50SG9zdFNlcnZpY2UsIGRlZmF1bHRBY2NvdW50U2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMpO1xuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhHaXRodWJFbnRlcnByaXNlVXJpS2V5KCkpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTsgLy8gaW5pdGlhbCAnJyBwdXNoXG5cblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2UuZW50ZXJwcmlzZSA9IHRydWU7XG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLmdpdEh1YkJhc2VVcmwgPSAnaHR0cHM6Ly9hY21lLmdoZS5jb20nO1xuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5maXJlQ2hhbmdlKCk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9uc1sxXS5hY3Rpb24gYXMgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKS5jb25maWcsIHtcblx0XHRcdFtBZ2VudEhvc3RDb25maWdLZXkuR2l0aHViRW50ZXJwcmlzZVVyaV06ICdodHRwczovL2FjbWUuZ2hlLmNvbScsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxTQUFTLGFBQWE7QUFD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
