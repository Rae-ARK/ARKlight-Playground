import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { upcastPartial } from "../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { ActionListItemKind } from "../../../../../platform/actionWidget/browser/actionList.js";
import { RemoteAgentHostConnectionStatus, IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { TestStorageService } from "../../../../../workbench/test/common/workbenchTestServices.js";
import { IPreferencesService } from "../../../../../workbench/services/preferences/common/preferences.js";
import { IOutputService } from "../../../../../workbench/services/output/common/output.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { extUri } from "../../../../../base/common/resources.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE } from "../../../../services/sessions/common/session.js";
import { WorkspacePicker } from "../../browser/sessionWorkspacePicker.js";
import { ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService } from "../../../../services/sessions/browser/sessionsRecentWorkspacesService.js";
import { AutomationsWorkspacePicker } from "../../../automations/browser/automationDialog.js";
import { AutomationIsolationModel } from "../../../automations/common/isolationGroupModel.js";
import { buildMobileWorkspacePickerRows, showMobileWorkspacePickerSheet } from "../../browser/mobile/mobileWorkspacePickerSheet.js";
import { IWorkspacesService } from "../../../../../platform/workspaces/common/workspaces.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IMenuService } from "../../../../../platform/actions/common/actions.js";
import { INotificationService, NoOpNotification } from "../../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../../platform/notification/test/common/testNotificationService.js";
const STORAGE_KEY_RECENT_WORKSPACES = "sessions.recentlyPickedWorkspaces";
const MOCK_PROVIDER_PATH_PREFIXES = {
  "agenthost-remote-1": "/remote",
  "local-1": "/local",
  "default-copilot": "/copilot",
  "local-agent-host": "/agent-host"
};
function createMockProvider(id, opts) {
  const pathPrefix = MOCK_PROVIDER_PATH_PREFIXES[id];
  const canResolve = (uri) => !pathPrefix || uri.path === pathPrefix || uri.path.startsWith(`${pathPrefix}/`);
  const base = {
    id,
    label: `Provider ${id}`,
    icon: Codicon.remote,
    order: 0,
    sessionTypes: [],
    onDidChangeSessionTypes: Event.None,
    browseActions: opts?.browseActions ?? [],
    resolveWorkspace: (uri) => {
      if (!canResolve(uri)) {
        return void 0;
      }
      return {
        uri,
        label: uri.path.substring(1) || uri.path,
        icon: Codicon.folder,
        folders: [{
          root: uri,
          workingDirectory: uri,
          name: uri.path.substring(1) || uri.path,
          description: void 0,
          gitRepository: { uri, workTreeUri: void 0, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
        }],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      };
    },
    onDidChangeSessions: Event.None,
    getSessions: () => [],
    createNewSession: () => {
      throw new Error("Not implemented");
    },
    createQuickChat: () => {
      throw new Error("Not implemented");
    },
    deleteNewSession: () => {
    },
    getSessionTypes: () => [],
    renameChat: async () => {
    },
    renameSession: async () => {
    },
    getModelsSnapshot: () => ({ models: [], desiredModelResolution: { kind: "notRequested" }, modelTarget: void 0 }),
    getModelPickerOptions: () => ({ useGroupedModelPicker: true, showFeatured: true, showUnavailableFeatured: false, showManageModelsAction: false }),
    onDidChangeModels: Event.None,
    setModel: () => {
    },
    archiveSession: async () => {
    },
    unarchiveSession: async () => {
    },
    setSessionReadState: async () => {
    },
    deleteSession: async () => {
    },
    deleteSessions: async () => {
    },
    deleteChat: async () => true,
    createNewChat: async () => {
      throw new Error("Not implemented");
    },
    forkChat: async () => {
      throw new Error("Not implemented");
    },
    createSideChat: async () => {
      throw new Error("Not implemented");
    },
    sendRequest: async (_sessionId, _chatResource, _options) => {
      throw new Error("Not implemented");
    }
  };
  if (opts?.connectionStatus) {
    return {
      ...base,
      canConnectOnDemand: opts.canConnectOnDemand,
      connect: opts.connect,
      connectionStatus: opts.connectionStatus,
      onDidReportConnectProgress: opts.onDidReportConnectProgress,
      remoteAddress: opts.remoteAddress,
      onDidChangeSessionConfig: Event.None,
      getSessionConfig: () => void 0,
      setSessionConfigValue: async () => {
      },
      replaceSessionConfig: async () => {
      },
      getSessionConfigCompletions: async () => [],
      getCreateSessionConfig: () => void 0,
      clearSessionConfig: () => {
      },
      onDidChangeRootConfig: Event.None,
      getRootConfig: () => void 0,
      setRootConfigValue: async () => {
      },
      replaceRootConfig: async () => {
      }
    };
  }
  return base;
}
class MockSessionsProvidersService extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChangeProviders = this._register(new Emitter());
    this.onDidChangeProviders = this._onDidChangeProviders.event;
    this._providers = [];
  }
  setProviders(providers) {
    const oldProviders = this._providers;
    this._providers = providers;
    const oldIds = new Set(oldProviders.map((p) => p.id));
    const newIds = new Set(providers.map((p) => p.id));
    this._onDidChangeProviders.fire({
      added: providers.filter((p) => !oldIds.has(p.id)),
      removed: oldProviders.filter((p) => !newIds.has(p.id))
    });
  }
  getProviders() {
    return this._providers;
  }
  getProvider(providerId) {
    return this._providers.find((p) => p.id === providerId);
  }
  resolveWorkspace(folderUri, preferredProviderId) {
    if (preferredProviderId) {
      const preferred = this.getProvider(preferredProviderId);
      const workspace = preferred?.resolveWorkspace(folderUri);
      if (workspace) {
        return { providerId: preferredProviderId, workspace };
      }
    }
    for (const provider of this.getProviders()) {
      const workspace = provider.resolveWorkspace(folderUri);
      if (workspace) {
        return { providerId: provider.id, workspace };
      }
    }
    return void 0;
  }
}
class RecordingNotificationHandle extends NoOpNotification {
  constructor(message) {
    super();
    this.closed = false;
    this.messages = [];
    this.messages.push(message);
  }
  updateMessage(message) {
    this.messages.push(message);
  }
  close() {
    this.closed = true;
  }
}
class RecordingNotificationService extends TestNotificationService {
  constructor() {
    super(...arguments);
    this.handles = [];
    this.errors = [];
  }
  notify(notification) {
    const handle = new RecordingNotificationHandle(notification.message);
    this.handles.push(handle);
    return handle;
  }
  error(error) {
    this.errors.push(error);
    return super.error(error);
  }
}
class DispatchingWorkspacePicker extends WorkspacePicker {
  dispatchFolder(folderUri, providerId) {
    return this._dispatchPickerItem({ folderUri, providerId });
  }
}
class TestAutomationsWorkspacePicker extends AutomationsWorkspacePicker {
  getItems() {
    return this._buildItems();
  }
  getItemStates() {
    return this.getItems().filter((entry) => entry.item).map((entry) => ({ label: entry.label ?? "", checked: entry.item?.checked === true }));
  }
  async select(label) {
    const entry = this.getItems().find((candidate) => candidate.label === label);
    assert.ok(entry?.item, `Expected picker item '${label}'`);
    await this._dispatchPickerItem(entry.item);
  }
}
function seedStorage(storageService, entries) {
  const stored = entries.map((e) => ({
    uri: e.uri.toJSON(),
    providerId: e.providerId,
    checked: e.checked
  }));
  storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
}
function createTestPicker(disposables, providersService, storageService, notificationService = new TestNotificationService(), pickerCtor = WorkspacePicker, fileDialogService = {}, workspacesService = { getRecentlyOpened: async () => ({ workspaces: [], files: [] }), onDidChangeRecentlyOpened: Event.None }, recentWorkspacesService, options) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const storage = storageService ?? disposables.add(new TestStorageService());
  instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => {
  }, show: () => {
  } });
  instantiationService.stub(IContextViewService, { showContextView: () => ({ close: () => {
  } }), hideContextView: () => {
  }, layout: () => {
  } });
  instantiationService.stub(IStorageService, storage);
  instantiationService.stub(IUriIdentityService, { extUri });
  instantiationService.stub(ISessionsProvidersService, providersService);
  instantiationService.stub(IRemoteAgentHostService, {});
  instantiationService.stub(IQuickInputService, {});
  instantiationService.stub(IClipboardService, {});
  instantiationService.stub(IPreferencesService, {});
  instantiationService.stub(IOutputService, {});
  instantiationService.stub(IConfigurationService, new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true }));
  instantiationService.stub(ICommandService, { executeCommand: async () => {
  } });
  instantiationService.stub(IFileDialogService, fileDialogService);
  instantiationService.stub(IContextKeyService, new MockContextKeyService());
  instantiationService.stub(IMenuService, {
    createMenu: () => ({ onDidChange: Event.None, getActions: () => [], dispose: () => {
    } }),
    getMenuActions: () => []
  });
  instantiationService.stub(INotificationService, notificationService);
  instantiationService.stub(IWorkspacesService, workspacesService);
  instantiationService.stub(ISessionsRecentWorkspacesService, recentWorkspacesService ?? disposables.add(instantiationService.createInstance(SessionsRecentWorkspacesService)));
  instantiationService.stub(ITelemetryService, NullTelemetryService);
  return disposables.add(instantiationService.createInstance(pickerCtor, options ?? {}));
}
async function createResolvedRecentWorkspacesService(disposables, storageService, providersService, workspacesService) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.stub(IStorageService, storageService);
  instantiationService.stub(IUriIdentityService, { extUri });
  instantiationService.stub(IWorkspacesService, workspacesService);
  instantiationService.stub(ISessionsProvidersService, providersService);
  const recentWorkspacesService = disposables.add(instantiationService.createInstance(SessionsRecentWorkspacesService));
  await new Promise((resolve) => {
    const listener = recentWorkspacesService.onDidChangeRecentWorkspaces(() => {
      listener.dispose();
      resolve();
    });
  });
  return recentWorkspacesService;
}
function assertSelectedProvider(picker, expectedProviderId, message) {
  assert.strictEqual(picker.selectedResolved?.providerId, expectedProviderId, message);
}
suite("WorkspacePicker - Connection Status", () => {
  const disposables = new DisposableStore();
  let providersService;
  setup(() => {
    providersService = new MockSessionsProvidersService();
    disposables.add(providersService);
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("restore picks checked entry even when remote is disconnected (before grace period)", () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const localProvider = createMockProvider("local-1");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true },
      { uri: URI.file("/local/project"), providerId: "local-1", checked: false }
    ]);
    providersService.setProviders([remoteProvider, localProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "agenthost-remote-1");
  });
  test("restore ignores VS Code's global recents, using only the sessions' own history", async () => {
    const localProvider = createMockProvider("local-1");
    providersService.setProviders([localProvider]);
    const ownUri = URI.file("/local/own-project");
    const globalUri = URI.file("/local/global-only-project");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [{ uri: ownUri, providerId: "local-1", checked: false }]);
    const workspacesService = { getRecentlyOpened: async () => ({ workspaces: [{ folderUri: globalUri }], files: [] }), onDidChangeRecentlyOpened: Event.None };
    const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);
    assert.deepStrictEqual(
      recentWorkspacesService.getRecentWorkspaces().map((r) => r.workspace.uri.toString()),
      [ownUri.toString(), globalUri.toString()]
    );
    assert.deepStrictEqual(
      recentWorkspacesService.getRecentWorkspaces(false).map((r) => r.workspace.uri.toString()),
      [ownUri.toString()]
    );
    const picker = createTestPicker(disposables, providersService, storage, void 0, void 0, void 0, workspacesService, recentWorkspacesService);
    assert.strictEqual(picker.selectedFolderUri?.toString(), ownUri.toString(), "restore selects only the sessions-owned entry, not the VS Code global recent");
  });
  test("restore selects nothing when own history is empty, even with VS Code global recents present", async () => {
    const localProvider = createMockProvider("local-1");
    providersService.setProviders([localProvider]);
    const globalUri = URI.file("/local/global-only-project");
    const storage = disposables.add(new TestStorageService());
    const workspacesService = { getRecentlyOpened: async () => ({ workspaces: [{ folderUri: globalUri }], files: [] }), onDidChangeRecentlyOpened: Event.None };
    const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);
    const picker = createTestPicker(disposables, providersService, storage, void 0, void 0, void 0, workspacesService, recentWorkspacesService);
    assert.strictEqual(picker.selectedFolderUri, void 0, "restore selects nothing when there is no owned history to restore from");
  });
  test("filters worktree checkout folders from VS Code global recents only", async () => {
    const provider = createMockProvider("provider");
    providersService.setProviders([provider]);
    const ownWorktreeUri = URI.file("/code/owned.worktrees/feature");
    const globalWorktreeUri = URI.file("/code/vscode.worktrees/feature");
    const globalUppercaseWorktreeUri = URI.file("/code/VSCode.WORKTREES/other-feature");
    const globalSimilarUri = URI.file("/code/vscode.worktrees-backup/feature");
    const globalRegularUri = URI.file("/code/vscode/feature");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [{ uri: ownWorktreeUri, providerId: "provider", checked: false }]);
    const workspacesService = {
      getRecentlyOpened: async () => ({
        workspaces: [
          { folderUri: globalWorktreeUri },
          { folderUri: globalUppercaseWorktreeUri },
          { folderUri: globalSimilarUri },
          { folderUri: globalRegularUri }
        ],
        files: []
      }),
      onDidChangeRecentlyOpened: Event.None
    };
    const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);
    assert.deepStrictEqual(
      recentWorkspacesService.getRecentWorkspaces().map((recent) => recent.workspace.uri.toString()),
      [ownWorktreeUri, globalSimilarUri, globalRegularUri].map((uri) => uri.toString())
    );
  });
  test("restored remote that never connects falls back after grace period", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "agenthost-remote-1", "Selection is restored synchronously");
    const events = [];
    disposables.add(picker.onDidSelectWorkspace((e) => events.push(e)));
    await timeout(1e4);
    assertSelectedProvider(picker, void 0, "Selection cleared after grace period");
    assert.deepStrictEqual(events, [void 0], "onDidSelectWorkspace fired with undefined");
  }));
  test("restored remote that connects within grace period keeps selection", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    await timeout(100);
    remoteStatus.set(RemoteAgentHostConnectionStatus.connecting, void 0);
    await timeout(500);
    remoteStatus.set(RemoteAgentHostConnectionStatus.connected, void 0);
    await timeout(1e4);
    assertSelectedProvider(picker, "agenthost-remote-1", "Selection preserved after successful connect");
  }));
  test("user pick during connect cancels the fallback", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const localProvider = createMockProvider("local-1");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider, localProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    picker.setSelectedWorkspace(URI.file("/local/picked"), { fireEvent: false });
    await timeout(1e4);
    assertSelectedProvider(picker, "local-1", "User pick preserved across grace-period elapse");
  }));
  test("restore picks checked entry while remote is connecting (no fallback flicker)", () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const localProvider = createMockProvider("local-1");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true },
      { uri: URI.file("/local/project"), providerId: "local-1", checked: false }
    ]);
    providersService.setProviders([remoteProvider, localProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "agenthost-remote-1");
    remoteStatus.set(RemoteAgentHostConnectionStatus.connecting, void 0);
    assertSelectedProvider(picker, "agenthost-remote-1");
    remoteStatus.set(RemoteAgentHostConnectionStatus.connected, void 0);
    assertSelectedProvider(picker, "agenthost-remote-1");
  });
  test("connecting provider that fails falls back to no selection", () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "agenthost-remote-1", "Selection is restored while connecting");
    const events = [];
    disposables.add(picker.onDidSelectWorkspace((e) => events.push(e)));
    remoteStatus.set(RemoteAgentHostConnectionStatus.connecting, void 0);
    assertSelectedProvider(picker, "agenthost-remote-1", "Selection preserved while connecting");
    remoteStatus.set(RemoteAgentHostConnectionStatus.disconnected, void 0);
    assertSelectedProvider(picker, void 0, "Selection cleared after connection failure");
    assert.deepStrictEqual(events, [void 0], "onDidSelectWorkspace fired with undefined");
  });
  test("restore picks connected remote provider", () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.connected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "agenthost-remote-1");
  });
  test("disconnect preserves selection (renders grayed; no auto-clear)", () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.connected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "agenthost-remote-1");
    remoteStatus.set(RemoteAgentHostConnectionStatus.disconnected, void 0);
    assertSelectedProvider(picker, "agenthost-remote-1", "Selection should be preserved on disconnect");
  });
  test("failed on-demand recent connect closes progress notification and reports error", async () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const progress = new Emitter();
    disposables.add(progress);
    let connectCalls = 0;
    const remoteProvider = createMockProvider("agenthost-remote-1", {
      connectionStatus: remoteStatus,
      canConnectOnDemand: true,
      remoteAddress: "wsl:Ubuntu-24.04",
      onDidReportConnectProgress: progress.event,
      connect: async () => {
        connectCalls++;
        progress.fire({ connectionKey: "wsl:Ubuntu-24.04", message: "Opening WSL..." });
        throw new Error("boom");
      }
    });
    const notifications = new RecordingNotificationService();
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, void 0, notifications, DispatchingWorkspacePicker);
    await picker.dispatchFolder(URI.file("/remote/project"), "agenthost-remote-1");
    assert.deepStrictEqual({
      connectCalls,
      progressClosed: notifications.handles[0]?.closed,
      progressMessages: notifications.handles[0]?.messages,
      errors: notifications.errors.map((error) => String(error)),
      selectedProvider: picker.selectedResolved?.providerId
    }, {
      connectCalls: 1,
      progressClosed: true,
      progressMessages: ["Connecting to Provider agenthost-remote-1...", "Opening WSL..."],
      errors: ["Failed to connect to Provider agenthost-remote-1."],
      selectedProvider: void 0
    });
  });
  test("reconnect keeps the selection (no extra event fires)", () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.connected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "agenthost-remote-1");
    remoteStatus.set(RemoteAgentHostConnectionStatus.disconnected, void 0);
    remoteStatus.set(RemoteAgentHostConnectionStatus.connected, void 0);
    assertSelectedProvider(picker, "agenthost-remote-1");
    assert.strictEqual(
      picker.selectedResolved?.workspace.folders[0]?.root.path,
      "/remote/project"
    );
  });
  test("checked is globally unique after persist", () => {
    const localProvider = createMockProvider("local-1");
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.connected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true },
      { uri: URI.file("/local/project"), providerId: "local-1", checked: false }
    ]);
    providersService.setProviders([remoteProvider, localProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    const resolvedWorkspace = localProvider.resolveWorkspace(URI.file("/local/project"));
    assert.ok(resolvedWorkspace, "resolveWorkspace should resolve file:// URIs");
    picker.setSelectedWorkspace(URI.file("/local/project"), { fireEvent: false });
    const raw = storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE);
    assert.ok(raw, "Storage should have recent workspaces");
    const stored = JSON.parse(raw);
    const checkedEntries = stored.filter((e) => e.checked);
    assert.strictEqual(checkedEntries.length, 1, "Only one entry should be checked");
    assert.strictEqual(checkedEntries[0].uri.path, "/local/project", "The local entry should be checked");
  });
  test("programmatic workspace initialization can avoid persisting recents", () => {
    const localProvider = createMockProvider("local-1");
    const storage = disposables.add(new TestStorageService());
    providersService.setProviders([localProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    const folder = URI.file("/local/proposed");
    picker.setSelectedWorkspace(folder, { fireEvent: false, persist: false });
    assert.deepStrictEqual({
      selected: picker.selectedFolderUri?.toString(),
      stored: storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE)
    }, {
      selected: folder.toString(),
      stored: void 0
    });
  });
  test("local provider is never treated as unavailable", () => {
    const localProvider = createMockProvider("local-1");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/local/project"), providerId: "local-1", checked: true }
    ]);
    providersService.setProviders([localProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "local-1", "Local provider workspace should always be selectable");
  });
  test("restore picks the stored workspace when its provider registers after another provider", () => {
    const copilotProvider = createMockProvider("default-copilot");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/copilot/old-project"), providerId: "default-copilot", checked: false },
      { uri: URI.file("/agent-host/project"), providerId: "local-agent-host", checked: true }
    ]);
    providersService.setProviders([copilotProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    const agentHostProvider = createMockProvider("local-agent-host");
    providersService.setProviders([copilotProvider, agentHostProvider]);
    assertSelectedProvider(picker, "local-agent-host", "Stored workspace should be restored once its provider registers");
  });
  test("late-registering provider does not move selection out from under user", () => {
    const copilotProvider = createMockProvider("default-copilot");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/agent-host/project"), providerId: "local-agent-host", checked: true }
    ]);
    providersService.setProviders([copilotProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, void 0, "No fallback while checked entry pending");
    picker.setSelectedWorkspace(URI.file("/copilot/picked"), { fireEvent: false });
    assertSelectedProvider(picker, "default-copilot", "User pick is honored");
    const agentHostProvider = createMockProvider("local-agent-host");
    providersService.setProviders([copilotProvider, agentHostProvider]);
    assertSelectedProvider(picker, "default-copilot", "User selection is preserved across late provider registration");
  });
});
suite("AutomationsWorkspacePicker", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("selects No workspace and restores a folder through the same picker", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const provider = createMockProvider("local-1");
    const folderUri = URI.file("/local/project");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [{ uri: folderUri, providerId: provider.id, checked: true }]);
    providersService.setProviders([provider]);
    const picker = createTestPicker(
      disposables,
      providersService,
      storage,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker
    );
    const state = {
      isQuickChat: false,
      folderUri,
      isolationMode: "workspace",
      branch: void 0
    };
    const model = new AutomationIsolationModel(state);
    picker.setTargetModel(model);
    const container = document.createElement("div");
    picker.render(container);
    const readPresentation = () => ({
      triggerLabel: container.querySelector(".sessions-chat-dropdown-label")?.textContent,
      triggerAriaLabel: container.querySelector(".action-label")?.getAttribute("aria-label"),
      items: picker.getItemStates().filter((item) => item.label === "No workspace" || item.label === "local/project"),
      isQuickChat: model.isQuickChat,
      folderUri: model.folderUri?.toString()
    });
    const workspace = readPresentation();
    await picker.select("No workspace");
    const noWorkspace = readPresentation();
    await picker.select("local/project");
    assert.deepStrictEqual({
      workspace,
      noWorkspace,
      restoredWorkspace: readPresentation()
    }, {
      workspace: {
        triggerLabel: "local/project",
        triggerAriaLabel: "Automation target, local/project",
        items: [
          { label: "No workspace", checked: false },
          { label: "local/project", checked: true }
        ],
        isQuickChat: false,
        folderUri: folderUri.toString()
      },
      noWorkspace: {
        triggerLabel: "No workspace",
        triggerAriaLabel: "Automation target, No workspace",
        items: [
          { label: "No workspace", checked: true },
          { label: "local/project", checked: false }
        ],
        isQuickChat: true,
        folderUri: void 0
      },
      restoredWorkspace: {
        triggerLabel: "local/project",
        triggerAriaLabel: "Automation target, local/project",
        items: [
          { label: "No workspace", checked: false },
          { label: "local/project", checked: true }
        ],
        isQuickChat: false,
        folderUri: folderUri.toString()
      }
    });
  });
  test("user workspace selections do not update recent workspaces", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const provider = createMockProvider("local-1");
    const originalFolder = URI.file("/local/original");
    const proposedFolder = URI.file("/local/proposed");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: originalFolder, providerId: provider.id, checked: true },
      { uri: proposedFolder, providerId: provider.id, checked: false }
    ]);
    providersService.setProviders([provider]);
    const before = storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE);
    const picker = createTestPicker(
      disposables,
      providersService,
      storage,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker
    );
    picker.setTargetModel(new AutomationIsolationModel({
      isQuickChat: false,
      folderUri: originalFolder,
      isolationMode: "workspace",
      branch: void 0
    }));
    await picker.select("local/proposed");
    assert.deepStrictEqual({
      selected: picker.selectedFolderUri?.toString(),
      storageUnchanged: storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE) === before
    }, {
      selected: proposedFolder.toString(),
      storageUnchanged: true
    });
  });
  test("keeps the previous workspace when trust is declined", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const provider = createMockProvider("local-1");
    const selectedFolder = URI.file("/local/selected");
    const candidateFolder = URI.file("/local/candidate");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: selectedFolder, providerId: provider.id, checked: true },
      { uri: candidateFolder, providerId: provider.id, checked: false }
    ]);
    providersService.setProviders([provider]);
    const trustRequests = [];
    const picker = createTestPicker(
      disposables,
      providersService,
      storage,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker,
      {},
      void 0,
      void 0,
      {
        canSelectWorkspace: async (folderUri, providerId) => {
          trustRequests.push({ folderUri: folderUri.toString(), providerId });
          return false;
        }
      }
    );
    const model = new AutomationIsolationModel({
      isQuickChat: false,
      folderUri: selectedFolder,
      isolationMode: "workspace",
      branch: void 0
    });
    picker.setTargetModel(model);
    await picker.select("local/candidate");
    assert.deepStrictEqual({
      trustRequests,
      modelFolderUri: model.folderUri?.toString(),
      pickerFolderUri: picker.selectedFolderUri?.toString()
    }, {
      trustRequests: [{ folderUri: candidateFolder.toString(), providerId: provider.id }],
      modelFolderUri: selectedFolder.toString(),
      pickerFolderUri: selectedFolder.toString()
    });
  });
  test("a stale trust grant cannot override a newer No workspace choice", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const provider = createMockProvider("local-1");
    const selectedFolder = URI.file("/local/selected");
    const candidateFolder = URI.file("/local/candidate");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: selectedFolder, providerId: provider.id, checked: true },
      { uri: candidateFolder, providerId: provider.id, checked: false }
    ]);
    providersService.setProviders([provider]);
    const trustResult = new DeferredPromise();
    const picker = createTestPicker(
      disposables,
      providersService,
      storage,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker,
      {},
      void 0,
      void 0,
      { canSelectWorkspace: () => trustResult.p }
    );
    const model = new AutomationIsolationModel({
      isQuickChat: false,
      folderUri: selectedFolder,
      isolationMode: "workspace",
      branch: void 0
    });
    picker.setTargetModel(model);
    const staleSelection = picker.select("local/candidate");
    await picker.select("No workspace");
    await trustResult.complete(true);
    await staleSelection;
    assert.deepStrictEqual({
      isQuickChat: model.isQuickChat,
      folderUri: model.folderUri,
      pickerFolderUri: picker.selectedFolderUri?.toString()
    }, {
      isQuickChat: true,
      folderUri: void 0,
      pickerFolderUri: selectedFolder.toString()
    });
  });
  test("a stale remote selection cannot override a newer No workspace choice", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const localProvider = createMockProvider("local-1");
    const remoteStatus = observableValue("remoteStatus", RemoteAgentHostConnectionStatus.disconnected);
    const connectStarted = new DeferredPromise();
    const finishConnect = new DeferredPromise();
    const remoteProvider = createMockProvider("agenthost-remote-1", {
      connectionStatus: remoteStatus,
      canConnectOnDemand: true,
      connect: async () => {
        await connectStarted.complete();
        await finishConnect.p;
        remoteStatus.set(RemoteAgentHostConnectionStatus.connected, void 0);
      }
    });
    const localFolder = URI.file("/local/project");
    const remoteFolder = URI.file("/remote/project");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: localFolder, providerId: localProvider.id, checked: true },
      { uri: remoteFolder, providerId: remoteProvider.id, checked: false }
    ]);
    providersService.setProviders([localProvider, remoteProvider]);
    const picker = createTestPicker(
      disposables,
      providersService,
      storage,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker
    );
    const model = new AutomationIsolationModel({
      isQuickChat: false,
      folderUri: localFolder,
      isolationMode: "workspace",
      branch: void 0
    });
    picker.setTargetModel(model);
    const staleSelection = picker.select("remote/project");
    await connectStarted.p;
    await picker.select("No workspace");
    await finishConnect.complete();
    await staleSelection;
    assert.deepStrictEqual({
      isQuickChat: model.isQuickChat,
      folderUri: model.folderUri,
      pickerFolderUri: picker.selectedFolderUri?.toString()
    }, {
      isQuickChat: true,
      folderUri: void 0,
      pickerFolderUri: localFolder.toString()
    });
  });
  test("browsing to a folder exits No workspace mode", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const fallbackProvider = createMockProvider("fallback");
    const localProvider = { ...createMockProvider("local-1"), supportsLocalWorkspaces: true };
    const producingProvider = { ...createMockProvider("local-agent-host"), supportsLocalWorkspaces: true };
    const browsedFolder = URI.file("/agent-host/browsed");
    providersService.setProviders([fallbackProvider, localProvider, producingProvider]);
    const trustRequests = [];
    const picker = createTestPicker(
      disposables,
      providersService,
      void 0,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker,
      { showOpenDialog: async () => [browsedFolder] },
      void 0,
      void 0,
      {
        canSelectWorkspace: async (folderUri, providerId) => {
          trustRequests.push({ folderUri: folderUri.toString(), providerId });
          return true;
        }
      }
    );
    const model = new AutomationIsolationModel({
      isQuickChat: true,
      folderUri: void 0,
      isolationMode: void 0,
      branch: void 0
    });
    picker.setTargetModel(model);
    await picker.select("Select...");
    assert.deepStrictEqual({
      isQuickChat: model.isQuickChat,
      folderUri: model.folderUri?.toString(),
      pickerFolderUri: picker.selectedFolderUri?.toString(),
      trustRequests
    }, {
      isQuickChat: false,
      folderUri: browsedFolder.toString(),
      pickerFolderUri: browsedFolder.toString(),
      trustRequests: [{ folderUri: browsedFolder.toString(), providerId: producingProvider.id }]
    });
  });
  test("stays in No workspace mode when trust is declined for a browsed folder", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const provider = { ...createMockProvider("local-1"), supportsLocalWorkspaces: true };
    const browsedFolder = URI.file("/local/browsed");
    providersService.setProviders([provider]);
    const picker = createTestPicker(
      disposables,
      providersService,
      void 0,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker,
      { showOpenDialog: async () => [browsedFolder] },
      void 0,
      void 0,
      { canSelectWorkspace: async () => false }
    );
    const model = new AutomationIsolationModel({
      isQuickChat: true,
      folderUri: void 0,
      isolationMode: void 0,
      branch: void 0
    });
    picker.setTargetModel(model);
    await picker.select("Select...");
    assert.deepStrictEqual({
      isQuickChat: model.isQuickChat,
      folderUri: model.folderUri,
      pickerFolderUri: picker.selectedFolderUri
    }, {
      isQuickChat: true,
      folderUri: void 0,
      pickerFolderUri: void 0
    });
  });
  test("a stale browse result does not request trust after a newer choice", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const provider = { ...createMockProvider("local-1"), supportsLocalWorkspaces: true };
    const browsedFolder = URI.file("/local/browsed");
    const browseResult = new DeferredPromise();
    providersService.setProviders([provider]);
    let trustRequestCount = 0;
    const picker = createTestPicker(
      disposables,
      providersService,
      void 0,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker,
      { showOpenDialog: () => browseResult.p },
      void 0,
      void 0,
      {
        canSelectWorkspace: async () => {
          trustRequestCount++;
          return true;
        }
      }
    );
    const model = new AutomationIsolationModel({
      isQuickChat: true,
      folderUri: void 0,
      isolationMode: void 0,
      branch: void 0
    });
    picker.setTargetModel(model);
    const staleSelection = picker.select("Select...");
    await picker.select("No workspace");
    await browseResult.complete([browsedFolder]);
    await staleSelection;
    assert.deepStrictEqual({
      isQuickChat: model.isQuickChat,
      folderUri: model.folderUri,
      pickerFolderUri: picker.selectedFolderUri,
      trustRequestCount
    }, {
      isQuickChat: true,
      folderUri: void 0,
      pickerFolderUri: void 0,
      trustRequestCount: 0
    });
  });
  test("No workspace is represented as a checked mobile sheet row", () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const picker = createTestPicker(
      disposables,
      providersService,
      void 0,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker
    );
    const model = new AutomationIsolationModel({
      isQuickChat: true,
      folderUri: void 0,
      isolationMode: void 0,
      branch: void 0
    });
    picker.setTargetModel(model);
    const rows = buildMobileWorkspacePickerRows(picker.getItems(), () => {
    });
    assert.deepStrictEqual(rows.map((row) => row.sheetItem), [{
      id: "item:0",
      label: "No workspace",
      description: "Run without a backing workspace",
      icon: Codicon.commentDiscussion,
      checked: true,
      disabled: void 0,
      sectionTitle: void 0
    }]);
  });
  test("mobile workspace header action dispatches browsing after the sheet closes", async () => {
    const workbench = document.createElement("div");
    document.body.append(workbench);
    disposables.add({ dispose: () => workbench.remove() });
    const trigger = workbench.appendChild(document.createElement("button"));
    const dispatched = [];
    const sheet = showMobileWorkspacePickerSheet(
      upcastPartial({ mainContainer: workbench }),
      trigger,
      [
        {
          kind: ActionListItemKind.Action,
          label: "No workspace",
          group: { title: "", icon: Codicon.commentDiscussion },
          item: { run: () => {
          } }
        },
        {
          kind: ActionListItemKind.Action,
          label: "Select...",
          group: { title: "", icon: Codicon.folderOpened },
          item: { browseActionIndex: 0 }
        }
      ],
      (item) => dispatched.push(item),
      [makeBrowseAction("local-1", SESSION_WORKSPACE_GROUP_LOCAL, "Select...")]
    );
    const headerAction = workbench.querySelector(".mobile-picker-sheet-header-action");
    assert.ok(headerAction);
    headerAction.click();
    await sheet;
    assert.deepStrictEqual(dispatched, [{ browseActionIndex: 0 }]);
  });
});
class TestablePicker extends WorkspacePicker {
  getAvailableTabs() {
    return this._getAvailableTabs().map((t) => t.id);
  }
}
function makeBrowseAction(providerId, group, label = "browse") {
  return {
    label,
    group,
    icon: Codicon.folder,
    providerId,
    run: async () => void 0
  };
}
function createTestablePicker(disposables, providersService, remoteAgentHostsEnabled = true) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => {
  }, show: () => {
  } });
  instantiationService.stub(IContextViewService, { showContextView: () => ({ close: () => {
  } }), hideContextView: () => {
  }, layout: () => {
  } });
  instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
  instantiationService.stub(IUriIdentityService, { extUri });
  instantiationService.stub(ISessionsProvidersService, providersService);
  instantiationService.stub(IRemoteAgentHostService, {});
  instantiationService.stub(IQuickInputService, {});
  instantiationService.stub(IClipboardService, {});
  instantiationService.stub(IPreferencesService, {});
  instantiationService.stub(IOutputService, {});
  instantiationService.stub(IConfigurationService, new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: remoteAgentHostsEnabled }));
  instantiationService.stub(ICommandService, { executeCommand: async () => {
  } });
  instantiationService.stub(IFileDialogService, {});
  instantiationService.stub(IContextKeyService, new MockContextKeyService());
  instantiationService.stub(IMenuService, { createMenu: () => ({ onDidChange: Event.None, getActions: () => [], dispose: () => {
  } }) });
  instantiationService.stub(INotificationService, new TestNotificationService());
  instantiationService.stub(IWorkspacesService, {
    getRecentlyOpened: async () => ({ workspaces: [], files: [] }),
    onDidChangeRecentlyOpened: Event.None
  });
  instantiationService.stub(ISessionsRecentWorkspacesService, disposables.add(instantiationService.createInstance(SessionsRecentWorkspacesService)));
  instantiationService.stub(ITelemetryService, NullTelemetryService);
  return disposables.add(instantiationService.createInstance(TestablePicker, {}));
}
suite("WorkspacePicker - Tab discovery", () => {
  const disposables = new DisposableStore();
  let providersService;
  setup(() => {
    providersService = new MockSessionsProvidersService();
    disposables.add(providersService);
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns Remote group even when no providers contribute groups", () => {
    providersService.setProviders([createMockProvider("p1")]);
    const picker = createTestablePicker(disposables, providersService);
    assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_REMOTE]);
  });
  test("hides Remote group when remote agent hosts are disabled", () => {
    providersService.setProviders([
      createMockProvider("p1", { browseActions: [makeBrowseAction("p1", SESSION_WORKSPACE_GROUP_REMOTE)] })
    ]);
    const picker = createTestablePicker(disposables, providersService, false);
    assert.deepStrictEqual(picker.getAvailableTabs(), []);
  });
  test("orders well-known groups Local first, then alphabetical", () => {
    providersService.setProviders([
      createMockProvider("remote", { browseActions: [makeBrowseAction("remote", SESSION_WORKSPACE_GROUP_REMOTE)] }),
      createMockProvider("cloud", { browseActions: [makeBrowseAction("cloud", "Cloud")] }),
      createMockProvider("local", { browseActions: [makeBrowseAction("local", SESSION_WORKSPACE_GROUP_LOCAL)] })
    ]);
    const picker = createTestablePicker(disposables, providersService);
    assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_LOCAL, "Cloud", SESSION_WORKSPACE_GROUP_REMOTE]);
  });
  test("deduplicates groups contributed by multiple providers / actions", () => {
    providersService.setProviders([
      createMockProvider("p1", { browseActions: [makeBrowseAction("p1", SESSION_WORKSPACE_GROUP_LOCAL)] }),
      createMockProvider("p2", { browseActions: [makeBrowseAction("p2", SESSION_WORKSPACE_GROUP_LOCAL), makeBrowseAction("p2", SESSION_WORKSPACE_GROUP_LOCAL)] })
    ]);
    const picker = createTestablePicker(disposables, providersService);
    assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE]);
  });
  test("appends custom group labels after Local", () => {
    providersService.setProviders([
      createMockProvider("p1", { browseActions: [makeBrowseAction("p1", "Custom A"), makeBrowseAction("p1", SESSION_WORKSPACE_GROUP_LOCAL)] }),
      createMockProvider("p2", { browseActions: [makeBrowseAction("p2", "Custom B"), makeBrowseAction("p2", SESSION_WORKSPACE_GROUP_REMOTE)] })
    ]);
    const picker = createTestablePicker(disposables, providersService);
    const tabs = picker.getAvailableTabs();
    assert.strictEqual(tabs[0], SESSION_WORKSPACE_GROUP_LOCAL);
    assert.deepStrictEqual(tabs.slice(1).sort(), ["Custom A", "Custom B", SESSION_WORKSPACE_GROUP_REMOTE]);
  });
  test("ignores browse actions without a group", () => {
    providersService.setProviders([
      createMockProvider("p1", { browseActions: [makeBrowseAction("p1", void 0), makeBrowseAction("p1", SESSION_WORKSPACE_GROUP_LOCAL)] })
    ]);
    const picker = createTestablePicker(disposables, providersService);
    assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE]);
  });
  test("discovers groups from recent workspaces does not add extra tabs", () => {
    const provider = {
      ...createMockProvider("p1"),
      resolveWorkspace: (uri) => ({
        uri,
        label: uri.path,
        icon: Codicon.folder,
        group: "Cloud",
        folders: [{
          root: uri,
          workingDirectory: uri,
          name: uri.path,
          description: void 0,
          gitRepository: { uri, workTreeUri: void 0, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
        }],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      })
    };
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [{ uri: URI.file("/repo"), providerId: "p1", checked: false }]);
    providersService.setProviders([provider]);
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => {
    }, show: () => {
    } });
    instantiationService.stub(IContextViewService, { showContextView: () => ({ close: () => {
    } }), hideContextView: () => {
    }, layout: () => {
    } });
    instantiationService.stub(IStorageService, storage);
    instantiationService.stub(IUriIdentityService, { extUri });
    instantiationService.stub(ISessionsProvidersService, providersService);
    instantiationService.stub(IRemoteAgentHostService, {});
    instantiationService.stub(IQuickInputService, {});
    instantiationService.stub(IClipboardService, {});
    instantiationService.stub(IPreferencesService, {});
    instantiationService.stub(IOutputService, {});
    instantiationService.stub(IConfigurationService, new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true }));
    instantiationService.stub(ICommandService, { executeCommand: async () => {
    } });
    instantiationService.stub(IFileDialogService, {});
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IMenuService, { createMenu: () => ({ onDidChange: Event.None, getActions: () => [], dispose: () => {
    } }) });
    instantiationService.stub(IWorkspacesService, {
      getRecentlyOpened: async () => ({ workspaces: [], files: [] }),
      onDidChangeRecentlyOpened: Event.None
    });
    instantiationService.stub(ISessionsRecentWorkspacesService, disposables.add(instantiationService.createInstance(SessionsRecentWorkspacesService)));
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    const picker = disposables.add(instantiationService.createInstance(TestablePicker, {}));
    assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_REMOTE]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvc2Vzc2lvbldvcmtzcGFjZVBpY2tlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25MaXN0LmpzJztcbmltcG9ydCB7IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMsIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgZXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc0NoYW5nZUV2ZW50LCBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlbmRSZXF1ZXN0T3B0aW9ucywgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uV29ya3NwYWNlLCBJU2Vzc2lvbldvcmtzcGFjZUJyb3dzZUFjdGlvbiwgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VQaWNrZXJJdGVtLCBJV29ya3NwYWNlUGlja2VyT3B0aW9ucywgV29ya3NwYWNlUGlja2VyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uV29ya3NwYWNlUGlja2VyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLCBTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyIH0gZnJvbSAnLi4vLi4vLi4vYXV0b21hdGlvbnMvYnJvd3Nlci9hdXRvbWF0aW9uRGlhbG9nLmpzJztcbmltcG9ydCB7IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCB9IGZyb20gJy4uLy4uLy4uL2F1dG9tYXRpb25zL2NvbW1vbi9pc29sYXRpb25Hcm91cE1vZGVsLmpzJztcbmltcG9ydCB7IGJ1aWxkTW9iaWxlV29ya3NwYWNlUGlja2VyUm93cywgc2hvd01vYmlsZVdvcmtzcGFjZVBpY2tlclNoZWV0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tb2JpbGUvbW9iaWxlV29ya3NwYWNlUGlja2VyU2hlZXQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb24sIElOb3RpZmljYXRpb25IYW5kbGUsIElOb3RpZmljYXRpb25TZXJ2aWNlLCBOb09wTm90aWZpY2F0aW9uLCBOb3RpZmljYXRpb25NZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vdGVzdC9jb21tb24vdGVzdE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuXG4vLyAtLS0tIFN0b3JhZ2Uga2V5IChtdXN0IG1hdGNoIHRoZSBvbmUgaW4gc2Vzc2lvbldvcmtzcGFjZVBpY2tlci50cykgLS0tLS0tLS0tLVxuY29uc3QgU1RPUkFHRV9LRVlfUkVDRU5UX1dPUktTUEFDRVMgPSAnc2Vzc2lvbnMucmVjZW50bHlQaWNrZWRXb3Jrc3BhY2VzJztcblxuLy8gLS0tLSBNb2NrIHByb3ZpZGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLy8gTWFwcyBtb2NrIHByb3ZpZGVyIGlkIFx1MjE5MiBVUkkgcGF0aCBwcmVmaXggaXQgcmVzb2x2ZXMuIEluIHByb2R1Y3Rpb24sIHRoZVxuLy8gVVJJJ3MgYXV0aG9yaXR5L3NjaGVtZSBkZXRlcm1pbmVzIHdoaWNoIHByb3ZpZGVyIGNhbiByZXNvbHZlIGl0OyB0aGVcbi8vIHRlc3RzIHVzZSBmaWxlIFVSSXMgb25seSwgc28gd2UgbWFwIHByb3ZpZGVyIGlkcyB0byB0aGVpciBjb252ZW50aW9uYWxcbi8vIHBhdGggcm9vdHMgKGUuZy4gL3JlbW90ZSwgL2xvY2FsLCAvY29waWxvdCwgL2FnZW50LWhvc3QpLlxuY29uc3QgTU9DS19QUk9WSURFUl9QQVRIX1BSRUZJWEVTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHQnYWdlbnRob3N0LXJlbW90ZS0xJzogJy9yZW1vdGUnLFxuXHQnbG9jYWwtMSc6ICcvbG9jYWwnLFxuXHQnZGVmYXVsdC1jb3BpbG90JzogJy9jb3BpbG90Jyxcblx0J2xvY2FsLWFnZW50LWhvc3QnOiAnL2FnZW50LWhvc3QnLFxufTtcblxuZnVuY3Rpb24gY3JlYXRlTW9ja1Byb3ZpZGVyKGlkOiBzdHJpbmcsIG9wdHM/OiB7XG5cdGNvbm5lY3Rpb25TdGF0dXM/OiBJU2V0dGFibGVPYnNlcnZhYmxlPFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM+O1xuXHRicm93c2VBY3Rpb25zPzogcmVhZG9ubHkgSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb25bXTtcblx0Y2FuQ29ubmVjdE9uRGVtYW5kPzogYm9vbGVhbjtcblx0Y29ubmVjdD86ICgpID0+IFByb21pc2U8dm9pZD47XG5cdG9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzPzogRXZlbnQ8eyByZWFkb25seSBjb25uZWN0aW9uS2V5OiBzdHJpbmc7IHJlYWRvbmx5IG1lc3NhZ2U6IHN0cmluZyB9Pjtcblx0cmVtb3RlQWRkcmVzcz86IHN0cmluZztcbn0pOiBJU2Vzc2lvbnNQcm92aWRlciB7XG5cdGNvbnN0IHBhdGhQcmVmaXggPSBNT0NLX1BST1ZJREVSX1BBVEhfUFJFRklYRVNbaWRdO1xuXHRjb25zdCBjYW5SZXNvbHZlID0gKHVyaTogVVJJKSA9PiAhcGF0aFByZWZpeCB8fCB1cmkucGF0aCA9PT0gcGF0aFByZWZpeCB8fCB1cmkucGF0aC5zdGFydHNXaXRoKGAke3BhdGhQcmVmaXh9L2ApO1xuXHRjb25zdCBiYXNlID0ge1xuXHRcdGlkLFxuXHRcdGxhYmVsOiBgUHJvdmlkZXIgJHtpZH1gLFxuXHRcdGljb246IENvZGljb24ucmVtb3RlLFxuXHRcdG9yZGVyOiAwLFxuXHRcdHNlc3Npb25UeXBlczogW10sXG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9uVHlwZXM6IEV2ZW50Lk5vbmUsXG5cdFx0YnJvd3NlQWN0aW9uczogb3B0cz8uYnJvd3NlQWN0aW9ucyA/PyBbXSxcblx0XHRyZXNvbHZlV29ya3NwYWNlOiAodXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRpZiAoIWNhblJlc29sdmUodXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRsYWJlbDogdXJpLnBhdGguc3Vic3RyaW5nKDEpIHx8IHVyaS5wYXRoLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmZvbGRlcixcblx0XHRcdFx0Zm9sZGVyczogW3tcblx0XHRcdFx0XHRyb290OiB1cmksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogdXJpLFxuXHRcdFx0XHRcdG5hbWU6IHVyaS5wYXRoLnN1YnN0cmluZygxKSB8fCB1cmkucGF0aCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGdpdFJlcG9zaXRvcnk6IHsgdXJpLCB3b3JrVHJlZVVyaTogdW5kZWZpbmVkLCBiYXNlQnJhbmNoTmFtZTogdW5kZWZpbmVkLCBnaXRIdWJJbmZvOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSB9LFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0XHRcdGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2UsXG5cdFx0XHR9O1xuXHRcdH0sXG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9uczogRXZlbnQuTm9uZSxcblx0XHRnZXRTZXNzaW9uczogKCkgPT4gW10sXG5cdFx0Y3JlYXRlTmV3U2Vzc2lvbjogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdGNyZWF0ZVF1aWNrQ2hhdDogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdGRlbGV0ZU5ld1Nlc3Npb246ICgpID0+IHsgfSxcblx0XHRnZXRTZXNzaW9uVHlwZXM6ICgpID0+IFtdLFxuXHRcdHJlbmFtZUNoYXQ6IGFzeW5jICgpID0+IHsgfSxcblx0XHRyZW5hbWVTZXNzaW9uOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0Z2V0TW9kZWxzU25hcHNob3Q6ICgpID0+ICh7IG1vZGVsczogW10sIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHsga2luZDogJ25vdFJlcXVlc3RlZCcgYXMgY29uc3QgfSwgbW9kZWxUYXJnZXQ6IHVuZGVmaW5lZCB9KSxcblx0XHRnZXRNb2RlbFBpY2tlck9wdGlvbnM6ICgpID0+ICh7IHVzZUdyb3VwZWRNb2RlbFBpY2tlcjogdHJ1ZSwgc2hvd0ZlYXR1cmVkOiB0cnVlLCBzaG93VW5hdmFpbGFibGVGZWF0dXJlZDogZmFsc2UsIHNob3dNYW5hZ2VNb2RlbHNBY3Rpb246IGZhbHNlIH0pLFxuXHRcdG9uRGlkQ2hhbmdlTW9kZWxzOiBFdmVudC5Ob25lLFxuXHRcdHNldE1vZGVsOiAoKSA9PiB7IH0sXG5cdFx0YXJjaGl2ZVNlc3Npb246IGFzeW5jICgpID0+IHsgfSxcblx0XHR1bmFyY2hpdmVTZXNzaW9uOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0c2V0U2Vzc2lvblJlYWRTdGF0ZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdGRlbGV0ZVNlc3Npb246IGFzeW5jICgpID0+IHsgfSxcblx0XHRkZWxldGVTZXNzaW9uczogYXN5bmMgKCkgPT4geyB9LFxuXHRcdGRlbGV0ZUNoYXQ6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0Y3JlYXRlTmV3Q2hhdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdGZvcmtDaGF0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7IH0sXG5cdFx0Y3JlYXRlU2lkZUNoYXQ6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQnKTsgfSxcblx0XHRzZW5kUmVxdWVzdDogYXN5bmMgKF9zZXNzaW9uSWQ6IHN0cmluZywgX2NoYXRSZXNvdXJjZTogVVJJLCBfb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucykgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHR9O1xuXHRpZiAob3B0cz8uY29ubmVjdGlvblN0YXR1cykge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5iYXNlLFxuXHRcdFx0Y2FuQ29ubmVjdE9uRGVtYW5kOiBvcHRzLmNhbkNvbm5lY3RPbkRlbWFuZCxcblx0XHRcdGNvbm5lY3Q6IG9wdHMuY29ubmVjdCxcblx0XHRcdGNvbm5lY3Rpb25TdGF0dXM6IG9wdHMuY29ubmVjdGlvblN0YXR1cyxcblx0XHRcdG9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzOiBvcHRzLm9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzLFxuXHRcdFx0cmVtb3RlQWRkcmVzczogb3B0cy5yZW1vdGVBZGRyZXNzLFxuXHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnOiBFdmVudC5Ob25lLFxuXHRcdFx0Z2V0U2Vzc2lvbkNvbmZpZzogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRyZXBsYWNlU2Vzc2lvbkNvbmZpZzogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0Z2V0U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdGdldENyZWF0ZVNlc3Npb25Db25maWc6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGNsZWFyU2Vzc2lvbkNvbmZpZzogKCkgPT4geyB9LFxuXHRcdFx0b25EaWRDaGFuZ2VSb290Q29uZmlnOiBFdmVudC5Ob25lLFxuXHRcdFx0Z2V0Um9vdENvbmZpZzogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c2V0Um9vdENvbmZpZ1ZhbHVlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRyZXBsYWNlUm9vdENvbmZpZzogYXN5bmMgKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcjtcblx0fVxuXHRyZXR1cm4gYmFzZTtcbn1cblxuY2xhc3MgTW9ja1Nlc3Npb25zUHJvdmlkZXJzU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVByb3ZpZGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTZXNzaW9uc1Byb3ZpZGVyc0NoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm92aWRlcnM6IEV2ZW50PElTZXNzaW9uc1Byb3ZpZGVyc0NoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlUHJvdmlkZXJzLmV2ZW50O1xuXG5cdHByaXZhdGUgX3Byb3ZpZGVyczogSVNlc3Npb25zUHJvdmlkZXJbXSA9IFtdO1xuXG5cdHNldFByb3ZpZGVycyhwcm92aWRlcnM6IElTZXNzaW9uc1Byb3ZpZGVyW10pOiB2b2lkIHtcblx0XHRjb25zdCBvbGRQcm92aWRlcnMgPSB0aGlzLl9wcm92aWRlcnM7XG5cdFx0dGhpcy5fcHJvdmlkZXJzID0gcHJvdmlkZXJzO1xuXHRcdGNvbnN0IG9sZElkcyA9IG5ldyBTZXQob2xkUHJvdmlkZXJzLm1hcChwID0+IHAuaWQpKTtcblx0XHRjb25zdCBuZXdJZHMgPSBuZXcgU2V0KHByb3ZpZGVycy5tYXAocCA9PiBwLmlkKSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm92aWRlcnMuZmlyZSh7XG5cdFx0XHRhZGRlZDogcHJvdmlkZXJzLmZpbHRlcihwID0+ICFvbGRJZHMuaGFzKHAuaWQpKSxcblx0XHRcdHJlbW92ZWQ6IG9sZFByb3ZpZGVycy5maWx0ZXIocCA9PiAhbmV3SWRzLmhhcyhwLmlkKSksXG5cdFx0fSk7XG5cdH1cblxuXHRnZXRQcm92aWRlcnMoKTogSVNlc3Npb25zUHJvdmlkZXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVycztcblx0fVxuXG5cdGdldFByb3ZpZGVyPFQgZXh0ZW5kcyBJU2Vzc2lvbnNQcm92aWRlcj4ocHJvdmlkZXJJZDogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVycy5maW5kKHAgPT4gcC5pZCA9PT0gcHJvdmlkZXJJZCkgYXMgVCB8IHVuZGVmaW5lZDtcblx0fVxuXG5cdHJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpOiBVUkksIHByZWZlcnJlZFByb3ZpZGVySWQ/OiBzdHJpbmcpIHtcblx0XHRpZiAocHJlZmVycmVkUHJvdmlkZXJJZCkge1xuXHRcdFx0Y29uc3QgcHJlZmVycmVkID0gdGhpcy5nZXRQcm92aWRlcihwcmVmZXJyZWRQcm92aWRlcklkKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHByZWZlcnJlZD8ucmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmkpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdFx0XHRyZXR1cm4geyBwcm92aWRlcklkOiBwcmVmZXJyZWRQcm92aWRlcklkLCB3b3Jrc3BhY2UgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLmdldFByb3ZpZGVycygpKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBwcm92aWRlci5yZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaSk7XG5cdFx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRcdHJldHVybiB7IHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLCB3b3Jrc3BhY2UgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5jbGFzcyBSZWNvcmRpbmdOb3RpZmljYXRpb25IYW5kbGUgZXh0ZW5kcyBOb09wTm90aWZpY2F0aW9uIHtcblx0Y2xvc2VkID0gZmFsc2U7XG5cdG1lc3NhZ2VzOiBOb3RpZmljYXRpb25NZXNzYWdlW10gPSBbXTtcblxuXHRjb25zdHJ1Y3RvcihtZXNzYWdlOiBOb3RpZmljYXRpb25NZXNzYWdlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm1lc3NhZ2VzLnB1c2gobWVzc2FnZSk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVNZXNzYWdlKG1lc3NhZ2U6IE5vdGlmaWNhdGlvbk1lc3NhZ2UpOiB2b2lkIHtcblx0XHR0aGlzLm1lc3NhZ2VzLnB1c2gobWVzc2FnZSk7XG5cdH1cblxuXHRvdmVycmlkZSBjbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNsb3NlZCA9IHRydWU7XG5cdH1cbn1cblxuY2xhc3MgUmVjb3JkaW5nTm90aWZpY2F0aW9uU2VydmljZSBleHRlbmRzIFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIHtcblx0cmVhZG9ubHkgaGFuZGxlczogUmVjb3JkaW5nTm90aWZpY2F0aW9uSGFuZGxlW10gPSBbXTtcblx0cmVhZG9ubHkgZXJyb3JzOiBBcnJheTxzdHJpbmcgfCBFcnJvcj4gPSBbXTtcblxuXHRvdmVycmlkZSBub3RpZnkobm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uKTogSU5vdGlmaWNhdGlvbkhhbmRsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gbmV3IFJlY29yZGluZ05vdGlmaWNhdGlvbkhhbmRsZShub3RpZmljYXRpb24ubWVzc2FnZSk7XG5cdFx0dGhpcy5oYW5kbGVzLnB1c2goaGFuZGxlKTtcblx0XHRyZXR1cm4gaGFuZGxlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZXJyb3IoZXJyb3I6IHN0cmluZyB8IEVycm9yKTogSU5vdGlmaWNhdGlvbkhhbmRsZSB7XG5cdFx0dGhpcy5lcnJvcnMucHVzaChlcnJvcik7XG5cdFx0cmV0dXJuIHN1cGVyLmVycm9yKGVycm9yKTtcblx0fVxufVxuXG5jbGFzcyBEaXNwYXRjaGluZ1dvcmtzcGFjZVBpY2tlciBleHRlbmRzIFdvcmtzcGFjZVBpY2tlciB7XG5cdGRpc3BhdGNoRm9sZGVyKGZvbGRlclVyaTogVVJJLCBwcm92aWRlcklkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fZGlzcGF0Y2hQaWNrZXJJdGVtKHsgZm9sZGVyVXJpLCBwcm92aWRlcklkIH0pO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RBdXRvbWF0aW9uc1dvcmtzcGFjZVBpY2tlciBleHRlbmRzIEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyIHtcblx0Z2V0SXRlbXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1aWxkSXRlbXMoKTtcblx0fVxuXG5cdGdldEl0ZW1TdGF0ZXMoKTogQXJyYXk8eyByZWFkb25seSBsYWJlbDogc3RyaW5nOyByZWFkb25seSBjaGVja2VkOiBib29sZWFuIH0+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRJdGVtcygpXG5cdFx0XHQuZmlsdGVyKGVudHJ5ID0+IGVudHJ5Lml0ZW0pXG5cdFx0XHQubWFwKGVudHJ5ID0+ICh7IGxhYmVsOiBlbnRyeS5sYWJlbCA/PyAnJywgY2hlY2tlZDogZW50cnkuaXRlbT8uY2hlY2tlZCA9PT0gdHJ1ZSB9KSk7XG5cdH1cblxuXHRhc3luYyBzZWxlY3QobGFiZWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5nZXRJdGVtcygpLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5sYWJlbCA9PT0gbGFiZWwpO1xuXHRcdGFzc2VydC5vayhlbnRyeT8uaXRlbSwgYEV4cGVjdGVkIHBpY2tlciBpdGVtICcke2xhYmVsfSdgKTtcblx0XHRhd2FpdCB0aGlzLl9kaXNwYXRjaFBpY2tlckl0ZW0oZW50cnkuaXRlbSk7XG5cdH1cbn1cblxuLy8gLS0tLSBUZXN0IGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gc2VlZFN0b3JhZ2Uoc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSwgZW50cmllczogeyB1cmk6IFVSSTsgcHJvdmlkZXJJZDogc3RyaW5nOyBjaGVja2VkOiBib29sZWFuIH1bXSk6IHZvaWQge1xuXHRjb25zdCBzdG9yZWQgPSBlbnRyaWVzLm1hcChlID0+ICh7XG5cdFx0dXJpOiBlLnVyaS50b0pTT04oKSxcblx0XHRwcm92aWRlcklkOiBlLnByb3ZpZGVySWQsXG5cdFx0Y2hlY2tlZDogZS5jaGVja2VkLFxuXHR9KSk7XG5cdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNUT1JBR0VfS0VZX1JFQ0VOVF9XT1JLU1BBQ0VTLCBKU09OLnN0cmluZ2lmeShzdG9yZWQpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGVzdFBpY2tlcihcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0cHJvdmlkZXJzU2VydmljZTogTW9ja1Nlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0c3RvcmFnZVNlcnZpY2U/OiBJU3RvcmFnZVNlcnZpY2UsXG5cdG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlID0gbmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdHBpY2tlckN0b3I6IHR5cGVvZiBXb3Jrc3BhY2VQaWNrZXIgPSBXb3Jrc3BhY2VQaWNrZXIsXG5cdGZpbGVEaWFsb2dTZXJ2aWNlOiBQYXJ0aWFsPElGaWxlRGlhbG9nU2VydmljZT4gPSB7fSxcblx0d29ya3NwYWNlc1NlcnZpY2U6IElXb3Jrc3BhY2VzU2VydmljZSA9IHsgZ2V0UmVjZW50bHlPcGVuZWQ6IGFzeW5jICgpID0+ICh7IHdvcmtzcGFjZXM6IFtdLCBmaWxlczogW10gfSksIG9uRGlkQ2hhbmdlUmVjZW50bHlPcGVuZWQ6IEV2ZW50Lk5vbmUgfSBhcyB1bmtub3duIGFzIElXb3Jrc3BhY2VzU2VydmljZSxcblx0cmVjZW50V29ya3NwYWNlc1NlcnZpY2U/OiBJU2Vzc2lvbnNSZWNlbnRXb3Jrc3BhY2VzU2VydmljZSxcblx0b3B0aW9ucz86IElXb3Jrc3BhY2VQaWNrZXJPcHRpb25zLFxuKTogV29ya3NwYWNlUGlja2VyIHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0Y29uc3Qgc3RvcmFnZSA9IHN0b3JhZ2VTZXJ2aWNlID8/IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFjdGlvbldpZGdldFNlcnZpY2UsIHsgaXNWaXNpYmxlOiBmYWxzZSwgaGlkZTogKCkgPT4geyB9LCBzaG93OiAoKSA9PiB7IH0gfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRWaWV3U2VydmljZSwgeyBzaG93Q29udGV4dFZpZXc6ICgpID0+ICh7IGNsb3NlOiAoKSA9PiB7IH0gfSksIGhpZGVDb250ZXh0VmlldzogKCkgPT4geyB9LCBsYXlvdXQ6ICgpID0+IHsgfSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIHsgZXh0VXJpIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIHByb3ZpZGVyc1NlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCB7fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVF1aWNrSW5wdXRTZXJ2aWNlLCB7fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNsaXBib2FyZFNlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJlZmVyZW5jZXNTZXJ2aWNlLCB7fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU91dHB1dFNlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBbUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWRdOiB0cnVlIH0pKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29tbWFuZFNlcnZpY2UsIHsgZXhlY3V0ZUNvbW1hbmQ6IGFzeW5jICgpID0+IHsgfSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZURpYWxvZ1NlcnZpY2UsIGZpbGVEaWFsb2dTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1lbnVTZXJ2aWNlLCB7XG5cdFx0Y3JlYXRlTWVudTogKCkgPT4gKHsgb25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsIGdldEFjdGlvbnM6ICgpID0+IFtdLCBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0Z2V0TWVudUFjdGlvbnM6ICgpID0+IFtdLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90aWZpY2F0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZXNTZXJ2aWNlLCB3b3Jrc3BhY2VzU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UsIHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlID8/IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShwaWNrZXJDdG9yLCBvcHRpb25zID8/IHt9KSk7XG59XG5cbi8qKlxuICogQnVpbGRzIGEge0BsaW5rIFNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2V9IGFuZCB3YWl0cyBmb3IgaXRzIGluaXRpYWxcbiAqIChhc3luY2hyb25vdXMpIFZTIENvZGUgcmVjZW50cyBmZXRjaCB0byBjb21wbGV0ZSwgc28gYSBwaWNrZXIgY29uc3RydWN0ZWRcbiAqIGFnYWluc3QgaXQgYWZ0ZXJ3YXJkcyByZXN0b3JlcyBhZ2FpbnN0IGEgZnVsbHktcG9wdWxhdGVkIHJlY2VudHMgbGlzdFxuICogaW5zdGVhZCBvZiByYWNpbmcgdGhlIGZldGNoIChhcyBoYXBwZW5zIHdoZW4ge0BsaW5rIGNyZWF0ZVRlc3RQaWNrZXJ9XG4gKiBidWlsZHMgaXRzIG93biBzZXJ2aWNlIGlubGluZSkuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVJlc29sdmVkUmVjZW50V29ya3NwYWNlc1NlcnZpY2UoXG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsXG5cdHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdHByb3ZpZGVyc1NlcnZpY2U6IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdHdvcmtzcGFjZXNTZXJ2aWNlOiBJV29ya3NwYWNlc1NlcnZpY2UsXG4pOiBQcm9taXNlPElTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlPiB7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmkgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZXNTZXJ2aWNlLCB3b3Jrc3BhY2VzU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgcHJvdmlkZXJzU2VydmljZSk7XG5cdGNvbnN0IHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UpKTtcblx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSByZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5vbkRpZENoYW5nZVJlY2VudFdvcmtzcGFjZXMoKCkgPT4ge1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0cmVzb2x2ZSgpO1xuXHRcdH0pO1xuXHR9KTtcblx0cmV0dXJuIHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlO1xufVxuXG4vLyAtLS0tIEFzc2VydGlvbiBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBhc3NlcnRTZWxlY3RlZFByb3ZpZGVyKHBpY2tlcjogV29ya3NwYWNlUGlja2VyLCBleHBlY3RlZFByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgbWVzc2FnZT86IHN0cmluZyk6IHZvaWQge1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwocGlja2VyLnNlbGVjdGVkUmVzb2x2ZWQ/LnByb3ZpZGVySWQsIGV4cGVjdGVkUHJvdmlkZXJJZCwgbWVzc2FnZSk7XG59XG5cbi8vIC0tLS0gVGVzdHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbnN1aXRlKCdXb3Jrc3BhY2VQaWNrZXIgLSBDb25uZWN0aW9uIFN0YXR1cycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHByb3ZpZGVyc1NlcnZpY2U6IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHByb3ZpZGVyc1NlcnZpY2UgPSBuZXcgTW9ja1Nlc3Npb25zUHJvdmlkZXJzU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlcnNTZXJ2aWNlKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Jlc3RvcmUgcGlja3MgY2hlY2tlZCBlbnRyeSBldmVuIHdoZW4gcmVtb3RlIGlzIGRpc2Nvbm5lY3RlZCAoYmVmb3JlIGdyYWNlIHBlcmlvZCknLCAoKSA9PiB7XG5cdFx0Ly8gUmVzdG9yZSBpcyBob25vcmVkIHN5bmNocm9ub3VzbHk6IHRoZSBwaWNrZXIgc2hvd3MgdGhlIGNoZWNrZWQgZW50cnlcblx0XHQvLyB3aGlsZSB3ZSB3YWl0IHRvIHNlZSBpZiB0aGUgY29ubmVjdGlvbiBjb21lcyB1cC4gVGhlIGdyYWNlLXBlcmlvZFxuXHRcdC8vIGZhbGxiYWNrIChjb3ZlcmVkIGluIGEgc2VwYXJhdGUgdGVzdCkgb25seSBmaXJlcyBsYXRlci5cblx0XHRjb25zdCByZW1vdGVTdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWU8UmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cz4oJ3N0YXR1cycsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkKTtcblx0XHRjb25zdCByZW1vdGVQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignYWdlbnRob3N0LXJlbW90ZS0xJywgeyBjb25uZWN0aW9uU3RhdHVzOiByZW1vdGVTdGF0dXMgfSk7XG5cdFx0Y29uc3QgbG9jYWxQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtMScpO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3JlbW90ZS9wcm9qZWN0JyksIHByb3ZpZGVySWQ6ICdhZ2VudGhvc3QtcmVtb3RlLTEnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9sb2NhbC9wcm9qZWN0JyksIHByb3ZpZGVySWQ6ICdsb2NhbC0xJywgY2hlY2tlZDogZmFsc2UgfSxcblx0XHRdKTtcblxuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtyZW1vdGVQcm92aWRlciwgbG9jYWxQcm92aWRlcl0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoZGlzcG9zYWJsZXMsIHByb3ZpZGVyc1NlcnZpY2UsIHN0b3JhZ2UpO1xuXG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdhZ2VudGhvc3QtcmVtb3RlLTEnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZSBpZ25vcmVzIFZTIENvZGVcXCdzIGdsb2JhbCByZWNlbnRzLCB1c2luZyBvbmx5IHRoZSBzZXNzaW9uc1xcJyBvd24gaGlzdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbFByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC0xJyk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2xvY2FsUHJvdmlkZXJdKTtcblxuXHRcdGNvbnN0IG93blVyaSA9IFVSSS5maWxlKCcvbG9jYWwvb3duLXByb2plY3QnKTtcblx0XHRjb25zdCBnbG9iYWxVcmkgPSBVUkkuZmlsZSgnL2xvY2FsL2dsb2JhbC1vbmx5LXByb2plY3QnKTtcblxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZWVkU3RvcmFnZShzdG9yYWdlLCBbeyB1cmk6IG93blVyaSwgcHJvdmlkZXJJZDogJ2xvY2FsLTEnLCBjaGVja2VkOiBmYWxzZSB9XSk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VzU2VydmljZSA9IHsgZ2V0UmVjZW50bHlPcGVuZWQ6IGFzeW5jICgpID0+ICh7IHdvcmtzcGFjZXM6IFt7IGZvbGRlclVyaTogZ2xvYmFsVXJpIH1dLCBmaWxlczogW10gfSksIG9uRGlkQ2hhbmdlUmVjZW50bHlPcGVuZWQ6IEV2ZW50Lk5vbmUgfSBhcyB1bmtub3duIGFzIElXb3Jrc3BhY2VzU2VydmljZTtcblx0XHRjb25zdCByZWNlbnRXb3Jrc3BhY2VzU2VydmljZSA9IGF3YWl0IGNyZWF0ZVJlc29sdmVkUmVjZW50V29ya3NwYWNlc1NlcnZpY2UoZGlzcG9zYWJsZXMsIHN0b3JhZ2UsIHByb3ZpZGVyc1NlcnZpY2UsIHdvcmtzcGFjZXNTZXJ2aWNlKTtcblxuXHRcdC8vIFNhbml0eTogdGhlIG1lcmdlZCAoZGlzcGxheSkgbGlzdCBpbmNsdWRlcyBib3RoIGVudHJpZXMuLi5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cmVjZW50V29ya3NwYWNlc1NlcnZpY2UuZ2V0UmVjZW50V29ya3NwYWNlcygpLm1hcChyID0+IHIud29ya3NwYWNlLnVyaS50b1N0cmluZygpKSxcblx0XHRcdFtvd25VcmkudG9TdHJpbmcoKSwgZ2xvYmFsVXJpLnRvU3RyaW5nKCldLFxuXHRcdCk7XG5cdFx0Ly8gLi4uYnV0IHRoZSBvd24tb25seSBxdWVyeSB1c2VkIGZvciByZXN0b3JhdGlvbiBleGNsdWRlcyB0aGUgZ2xvYmFsIG9uZS5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cmVjZW50V29ya3NwYWNlc1NlcnZpY2UuZ2V0UmVjZW50V29ya3NwYWNlcyhmYWxzZSkubWFwKHIgPT4gci53b3Jrc3BhY2UudXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0W293blVyaS50b1N0cmluZygpXSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSwgc3RvcmFnZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgd29ya3NwYWNlc1NlcnZpY2UsIHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCksIG93blVyaS50b1N0cmluZygpLCAncmVzdG9yZSBzZWxlY3RzIG9ubHkgdGhlIHNlc3Npb25zLW93bmVkIGVudHJ5LCBub3QgdGhlIFZTIENvZGUgZ2xvYmFsIHJlY2VudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlIHNlbGVjdHMgbm90aGluZyB3aGVuIG93biBoaXN0b3J5IGlzIGVtcHR5LCBldmVuIHdpdGggVlMgQ29kZSBnbG9iYWwgcmVjZW50cyBwcmVzZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKTtcblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbbG9jYWxQcm92aWRlcl0pO1xuXG5cdFx0Y29uc3QgZ2xvYmFsVXJpID0gVVJJLmZpbGUoJy9sb2NhbC9nbG9iYWwtb25seS1wcm9qZWN0Jyk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlc1NlcnZpY2UgPSB7IGdldFJlY2VudGx5T3BlbmVkOiBhc3luYyAoKSA9PiAoeyB3b3Jrc3BhY2VzOiBbeyBmb2xkZXJVcmk6IGdsb2JhbFVyaSB9XSwgZmlsZXM6IFtdIH0pLCBvbkRpZENoYW5nZVJlY2VudGx5T3BlbmVkOiBFdmVudC5Ob25lIH0gYXMgdW5rbm93biBhcyBJV29ya3NwYWNlc1NlcnZpY2U7XG5cdFx0Y29uc3QgcmVjZW50V29ya3NwYWNlc1NlcnZpY2UgPSBhd2FpdCBjcmVhdGVSZXNvbHZlZFJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlKGRpc3Bvc2FibGVzLCBzdG9yYWdlLCBwcm92aWRlcnNTZXJ2aWNlLCB3b3Jrc3BhY2VzU2VydmljZSk7XG5cblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB3b3Jrc3BhY2VzU2VydmljZSwgcmVjZW50V29ya3NwYWNlc1NlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlci5zZWxlY3RlZEZvbGRlclVyaSwgdW5kZWZpbmVkLCAncmVzdG9yZSBzZWxlY3RzIG5vdGhpbmcgd2hlbiB0aGVyZSBpcyBubyBvd25lZCBoaXN0b3J5IHRvIHJlc3RvcmUgZnJvbScpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWx0ZXJzIHdvcmt0cmVlIGNoZWNrb3V0IGZvbGRlcnMgZnJvbSBWUyBDb2RlIGdsb2JhbCByZWNlbnRzIG9ubHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ3Byb3ZpZGVyJyk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3Byb3ZpZGVyXSk7XG5cblx0XHRjb25zdCBvd25Xb3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvY29kZS9vd25lZC53b3JrdHJlZXMvZmVhdHVyZScpO1xuXHRcdGNvbnN0IGdsb2JhbFdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy9jb2RlL3ZzY29kZS53b3JrdHJlZXMvZmVhdHVyZScpO1xuXHRcdGNvbnN0IGdsb2JhbFVwcGVyY2FzZVdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy9jb2RlL1ZTQ29kZS5XT1JLVFJFRVMvb3RoZXItZmVhdHVyZScpO1xuXHRcdGNvbnN0IGdsb2JhbFNpbWlsYXJVcmkgPSBVUkkuZmlsZSgnL2NvZGUvdnNjb2RlLndvcmt0cmVlcy1iYWNrdXAvZmVhdHVyZScpO1xuXHRcdGNvbnN0IGdsb2JhbFJlZ3VsYXJVcmkgPSBVUkkuZmlsZSgnL2NvZGUvdnNjb2RlL2ZlYXR1cmUnKTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VlZFN0b3JhZ2Uoc3RvcmFnZSwgW3sgdXJpOiBvd25Xb3JrdHJlZVVyaSwgcHJvdmlkZXJJZDogJ3Byb3ZpZGVyJywgY2hlY2tlZDogZmFsc2UgfV0pO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlc1NlcnZpY2UgPSB7XG5cdFx0XHRnZXRSZWNlbnRseU9wZW5lZDogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0d29ya3NwYWNlczogW1xuXHRcdFx0XHRcdHsgZm9sZGVyVXJpOiBnbG9iYWxXb3JrdHJlZVVyaSB9LFxuXHRcdFx0XHRcdHsgZm9sZGVyVXJpOiBnbG9iYWxVcHBlcmNhc2VXb3JrdHJlZVVyaSB9LFxuXHRcdFx0XHRcdHsgZm9sZGVyVXJpOiBnbG9iYWxTaW1pbGFyVXJpIH0sXG5cdFx0XHRcdFx0eyBmb2xkZXJVcmk6IGdsb2JhbFJlZ3VsYXJVcmkgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0ZmlsZXM6IFtdLFxuXHRcdFx0fSksXG5cdFx0XHRvbkRpZENoYW5nZVJlY2VudGx5T3BlbmVkOiBFdmVudC5Ob25lLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJV29ya3NwYWNlc1NlcnZpY2U7XG5cdFx0Y29uc3QgcmVjZW50V29ya3NwYWNlc1NlcnZpY2UgPSBhd2FpdCBjcmVhdGVSZXNvbHZlZFJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlKGRpc3Bvc2FibGVzLCBzdG9yYWdlLCBwcm92aWRlcnNTZXJ2aWNlLCB3b3Jrc3BhY2VzU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cmVjZW50V29ya3NwYWNlc1NlcnZpY2UuZ2V0UmVjZW50V29ya3NwYWNlcygpLm1hcChyZWNlbnQgPT4gcmVjZW50LndvcmtzcGFjZS51cmkudG9TdHJpbmcoKSksXG5cdFx0XHRbb3duV29ya3RyZWVVcmksIGdsb2JhbFNpbWlsYXJVcmksIGdsb2JhbFJlZ3VsYXJVcmldLm1hcCh1cmkgPT4gdXJpLnRvU3RyaW5nKCkpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVkIHJlbW90ZSB0aGF0IG5ldmVyIGNvbm5lY3RzIGZhbGxzIGJhY2sgYWZ0ZXIgZ3JhY2UgcGVyaW9kJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhlIHByb3ZpZGVyIGlzIHJlZ2lzdGVyZWQgYXMgRGlzY29ubmVjdGVkIGFuZCBuZXZlciB0cmFuc2l0aW9ucyBcdTIwMTRcblx0XHQvLyBlLmcuIFNTSCBob3N0IGlzIHVucmVhY2hhYmxlIGFuZCB0aGUgc3RhdHVzIHdhcyBzZXQgYmVmb3JlIHRoZSBwaWNrZXJcblx0XHQvLyBjb3VsZCBzdWJzY3JpYmUuIFRoZSBwaWNrZXIgc2hvdWxkIGZhbGwgYmFjayB0byBubyBzZWxlY3Rpb24gYWZ0ZXJcblx0XHQvLyB0aGUgZ3JhY2UgcGVyaW9kIHNvIHRoZSB2aWV3IHBhbmUgZHJvcHMgdGhlIHN0YWxlIHNlc3Npb24uXG5cdFx0Y29uc3QgcmVtb3RlU3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlPFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM+KCdzdGF0dXMnLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmRpc2Nvbm5lY3RlZCk7XG5cdFx0Y29uc3QgcmVtb3RlUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2FnZW50aG9zdC1yZW1vdGUtMScsIHsgY29ubmVjdGlvblN0YXR1czogcmVtb3RlU3RhdHVzIH0pO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3JlbW90ZS9wcm9qZWN0JyksIHByb3ZpZGVySWQ6ICdhZ2VudGhvc3QtcmVtb3RlLTEnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XSk7XG5cblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcmVtb3RlUHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblxuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCAnYWdlbnRob3N0LXJlbW90ZS0xJywgJ1NlbGVjdGlvbiBpcyByZXN0b3JlZCBzeW5jaHJvbm91c2x5Jyk7XG5cblx0XHRjb25zdCBldmVudHM6IEFycmF5PFVSSSB8IHVuZGVmaW5lZD4gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkU2VsZWN0V29ya3NwYWNlKGUgPT4gZXZlbnRzLnB1c2goZSkpKTtcblxuXHRcdC8vIEFkdmFuY2UgcGFzdCB0aGUgZ3JhY2UgcGVyaW9kLlxuXHRcdGF3YWl0IHRpbWVvdXQoMTBfMDAwKTtcblxuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCB1bmRlZmluZWQsICdTZWxlY3Rpb24gY2xlYXJlZCBhZnRlciBncmFjZSBwZXJpb2QnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW3VuZGVmaW5lZF0sICdvbkRpZFNlbGVjdFdvcmtzcGFjZSBmaXJlZCB3aXRoIHVuZGVmaW5lZCcpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVzdG9yZWQgcmVtb3RlIHRoYXQgY29ubmVjdHMgd2l0aGluIGdyYWNlIHBlcmlvZCBrZWVwcyBzZWxlY3Rpb24nLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZW1vdGVTdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWU8UmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cz4oJ3N0YXR1cycsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkKTtcblx0XHRjb25zdCByZW1vdGVQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignYWdlbnRob3N0LXJlbW90ZS0xJywgeyBjb25uZWN0aW9uU3RhdHVzOiByZW1vdGVTdGF0dXMgfSk7XG5cblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VlZFN0b3JhZ2Uoc3RvcmFnZSwgW1xuXHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcmVtb3RlL3Byb2plY3QnKSwgcHJvdmlkZXJJZDogJ2FnZW50aG9zdC1yZW1vdGUtMScsIGNoZWNrZWQ6IHRydWUgfSxcblx0XHRdKTtcblxuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtyZW1vdGVQcm92aWRlcl0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoZGlzcG9zYWJsZXMsIHByb3ZpZGVyc1NlcnZpY2UsIHN0b3JhZ2UpO1xuXG5cdFx0Ly8gQ29ubmVjdGlvbiBzdWNjZWVkcyBxdWlja2x5LlxuXHRcdGF3YWl0IHRpbWVvdXQoMTAwKTtcblx0XHRyZW1vdGVTdGF0dXMuc2V0KFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGluZywgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDUwMCk7XG5cdFx0cmVtb3RlU3RhdHVzLnNldChSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZCwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIEFkdmFuY2UgcGFzdCB0aGUgZ3JhY2UgcGVyaW9kIFx1MjAxNCBzaG91bGQgbm90IGZhbGwgYmFjayBzaW5jZSB3ZSBjb25uZWN0ZWQuXG5cdFx0YXdhaXQgdGltZW91dCgxMF8wMDApO1xuXG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdhZ2VudGhvc3QtcmVtb3RlLTEnLCAnU2VsZWN0aW9uIHByZXNlcnZlZCBhZnRlciBzdWNjZXNzZnVsIGNvbm5lY3QnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3VzZXIgcGljayBkdXJpbmcgY29ubmVjdCBjYW5jZWxzIHRoZSBmYWxsYmFjaycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIElmIHRoZSB1c2VyIHBpY2tzIGEgZGlmZmVyZW50IHdvcmtzcGFjZSB3aGlsZSB0aGUgcmVzdG9yZS1ncmFjZS1wZXJpb2Rcblx0XHQvLyB0aW1lciBpcyBydW5uaW5nLCB0aGUgdGltZXIgbXVzdCBub3QgbGF0ZXIgY2xlYXIgdGhlIHVzZXIncyBzZWxlY3Rpb24uXG5cdFx0Y29uc3QgcmVtb3RlU3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlPFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM+KCdzdGF0dXMnLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmRpc2Nvbm5lY3RlZCk7XG5cdFx0Y29uc3QgcmVtb3RlUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2FnZW50aG9zdC1yZW1vdGUtMScsIHsgY29ubmVjdGlvblN0YXR1czogcmVtb3RlU3RhdHVzIH0pO1xuXHRcdGNvbnN0IGxvY2FsUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKTtcblxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZWVkU3RvcmFnZShzdG9yYWdlLCBbXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9yZW1vdGUvcHJvamVjdCcpLCBwcm92aWRlcklkOiAnYWdlbnRob3N0LXJlbW90ZS0xJywgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdF0pO1xuXG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3JlbW90ZVByb3ZpZGVyLCBsb2NhbFByb3ZpZGVyXSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSwgc3RvcmFnZSk7XG5cblx0XHQvLyBVc2VyIHBpY2tzIGEgbG9jYWwgd29ya3NwYWNlIHdoaWxlIHRoZSByZW1vdGUgaXMgc3RpbGwgdHJ5aW5nIHRvIGNvbm5lY3QuXG5cdFx0cGlja2VyLnNldFNlbGVjdGVkV29ya3NwYWNlKFVSSS5maWxlKCcvbG9jYWwvcGlja2VkJyksIHsgZmlyZUV2ZW50OiBmYWxzZSB9KTtcblxuXHRcdC8vIEdyYWNlIHBlcmlvZCBlbGFwc2VzOyByZW1vdGUgc3RpbGwgZGlzY29ubmVjdGVkIFx1MjAxNCBtdXN0IG5vdCBhZmZlY3QgdXNlciBwaWNrLlxuXHRcdGF3YWl0IHRpbWVvdXQoMTBfMDAwKTtcblxuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCAnbG9jYWwtMScsICdVc2VyIHBpY2sgcHJlc2VydmVkIGFjcm9zcyBncmFjZS1wZXJpb2QgZWxhcHNlJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZXN0b3JlIHBpY2tzIGNoZWNrZWQgZW50cnkgd2hpbGUgcmVtb3RlIGlzIGNvbm5lY3RpbmcgKG5vIGZhbGxiYWNrIGZsaWNrZXIpJywgKCkgPT4ge1xuXHRcdC8vIFNTSCByZW1vdGU6IHByb3ZpZGVyIHJlZ2lzdGVycyBpbiBEaXNjb25uZWN0ZWQgc3RhdGUgYW5kIGltbWVkaWF0ZWx5XG5cdFx0Ly8gc3RhcnRzIGNvbm5lY3RpbmcuIFdlIHJlc3RvcmUgdGhlIGNoZWNrZWQgZW50cnkgaW1tZWRpYXRlbHkgcmF0aGVyIHRoYW5cblx0XHQvLyBmYWxsaW5nIGJhY2sgdG8gYSBkaWZmZXJlbnQgd29ya3NwYWNlIGFuZCBzd2FwcGluZyBsYXRlci5cblx0XHRjb25zdCByZW1vdGVTdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWU8UmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cz4oJ3N0YXR1cycsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkKTtcblx0XHRjb25zdCByZW1vdGVQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignYWdlbnRob3N0LXJlbW90ZS0xJywgeyBjb25uZWN0aW9uU3RhdHVzOiByZW1vdGVTdGF0dXMgfSk7XG5cdFx0Y29uc3QgbG9jYWxQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtMScpO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3JlbW90ZS9wcm9qZWN0JyksIHByb3ZpZGVySWQ6ICdhZ2VudGhvc3QtcmVtb3RlLTEnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9sb2NhbC9wcm9qZWN0JyksIHByb3ZpZGVySWQ6ICdsb2NhbC0xJywgY2hlY2tlZDogZmFsc2UgfSxcblx0XHRdKTtcblxuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtyZW1vdGVQcm92aWRlciwgbG9jYWxQcm92aWRlcl0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoZGlzcG9zYWJsZXMsIHByb3ZpZGVyc1NlcnZpY2UsIHN0b3JhZ2UpO1xuXG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdhZ2VudGhvc3QtcmVtb3RlLTEnKTtcblxuXHRcdC8vIENvbm5lY3Rpb24gYXR0ZW1wdCBzdGFydHMgKG5vIGZhbGxiYWNrIHdoaWxlIGNvbm5lY3RpbmcpLlxuXHRcdHJlbW90ZVN0YXR1cy5zZXQoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0aW5nLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCAnYWdlbnRob3N0LXJlbW90ZS0xJyk7XG5cblx0XHQvLyBBZnRlciBjb25uZWN0aW9uIGNvbXBsZXRlcywgc2VsZWN0aW9uIGlzIHVuY2hhbmdlZC5cblx0XHRyZW1vdGVTdGF0dXMuc2V0KFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGVkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCAnYWdlbnRob3N0LXJlbW90ZS0xJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nvbm5lY3RpbmcgcHJvdmlkZXIgdGhhdCBmYWlscyBmYWxscyBiYWNrIHRvIG5vIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHQvLyBSZWFsIFNTSCByZW1vdGUgbGlmZWN5Y2xlOiBzdGFydHMgRGlzY29ubmVjdGVkLCB0cmFuc2l0aW9ucyBDb25uZWN0aW5nLFxuXHRcdC8vIHRoZW4gZmFpbHMgYmFjayB0byBEaXNjb25uZWN0ZWQuIFRoZSBwaWNrZXIgbXVzdCBjbGVhciB0aGUgc2VsZWN0aW9uXG5cdFx0Ly8gYW5kIGZpcmUgb25EaWRTZWxlY3RXb3Jrc3BhY2UodW5kZWZpbmVkKSBzbyB0aGUgdmlldyBwYW5lIGNhbGxzIHVuc2V0TmV3U2Vzc2lvbigpLlxuXHRcdGNvbnN0IHJlbW90ZVN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPignc3RhdHVzJywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRcdGNvbnN0IHJlbW90ZVByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdhZ2VudGhvc3QtcmVtb3RlLTEnLCB7IGNvbm5lY3Rpb25TdGF0dXM6IHJlbW90ZVN0YXR1cyB9KTtcblxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZWVkU3RvcmFnZShzdG9yYWdlLCBbXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9yZW1vdGUvcHJvamVjdCcpLCBwcm92aWRlcklkOiAnYWdlbnRob3N0LXJlbW90ZS0xJywgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdF0pO1xuXG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3JlbW90ZVByb3ZpZGVyXSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSwgc3RvcmFnZSk7XG5cblx0XHRhc3NlcnRTZWxlY3RlZFByb3ZpZGVyKHBpY2tlciwgJ2FnZW50aG9zdC1yZW1vdGUtMScsICdTZWxlY3Rpb24gaXMgcmVzdG9yZWQgd2hpbGUgY29ubmVjdGluZycpO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBBcnJheTxVUkkgfCB1bmRlZmluZWQ+ID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZFNlbGVjdFdvcmtzcGFjZShlID0+IGV2ZW50cy5wdXNoKGUpKSk7XG5cblx0XHQvLyBTU0ggdHVubmVsIGJlZ2lucy5cblx0XHRyZW1vdGVTdGF0dXMuc2V0KFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGluZywgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnRTZWxlY3RlZFByb3ZpZGVyKHBpY2tlciwgJ2FnZW50aG9zdC1yZW1vdGUtMScsICdTZWxlY3Rpb24gcHJlc2VydmVkIHdoaWxlIGNvbm5lY3RpbmcnKTtcblxuXHRcdC8vIFNTSCB0dW5uZWwgZmFpbHMuXG5cdFx0cmVtb3RlU3RhdHVzLnNldChSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmRpc2Nvbm5lY3RlZCwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCB1bmRlZmluZWQsICdTZWxlY3Rpb24gY2xlYXJlZCBhZnRlciBjb25uZWN0aW9uIGZhaWx1cmUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW3VuZGVmaW5lZF0sICdvbkRpZFNlbGVjdFdvcmtzcGFjZSBmaXJlZCB3aXRoIHVuZGVmaW5lZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlIHBpY2tzIGNvbm5lY3RlZCByZW1vdGUgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVtb3RlU3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlPFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM+KCdzdGF0dXMnLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZCk7XG5cdFx0Y29uc3QgcmVtb3RlUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2FnZW50aG9zdC1yZW1vdGUtMScsIHsgY29ubmVjdGlvblN0YXR1czogcmVtb3RlU3RhdHVzIH0pO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3JlbW90ZS9wcm9qZWN0JyksIHByb3ZpZGVySWQ6ICdhZ2VudGhvc3QtcmVtb3RlLTEnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XSk7XG5cblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcmVtb3RlUHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblxuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCAnYWdlbnRob3N0LXJlbW90ZS0xJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2Nvbm5lY3QgcHJlc2VydmVzIHNlbGVjdGlvbiAocmVuZGVycyBncmF5ZWQ7IG5vIGF1dG8tY2xlYXIpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlbW90ZVN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPignc3RhdHVzJywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQpO1xuXHRcdGNvbnN0IHJlbW90ZVByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdhZ2VudGhvc3QtcmVtb3RlLTEnLCB7IGNvbm5lY3Rpb25TdGF0dXM6IHJlbW90ZVN0YXR1cyB9KTtcblxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZWVkU3RvcmFnZShzdG9yYWdlLCBbXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9yZW1vdGUvcHJvamVjdCcpLCBwcm92aWRlcklkOiAnYWdlbnRob3N0LXJlbW90ZS0xJywgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdF0pO1xuXG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3JlbW90ZVByb3ZpZGVyXSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSwgc3RvcmFnZSk7XG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdhZ2VudGhvc3QtcmVtb3RlLTEnKTtcblxuXHRcdC8vIERpc2Nvbm5lY3QgXHUyMDE0IHNlbGVjdGlvbiBpcyBwcmVzZXJ2ZWQgKHRoZSB1c2VyIHBpY2tlZCBpdDsgd2Uga2VlcCBob25vcmluZyBpdCkuXG5cdFx0cmVtb3RlU3RhdHVzLnNldChSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmRpc2Nvbm5lY3RlZCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnRTZWxlY3RlZFByb3ZpZGVyKHBpY2tlciwgJ2FnZW50aG9zdC1yZW1vdGUtMScsICdTZWxlY3Rpb24gc2hvdWxkIGJlIHByZXNlcnZlZCBvbiBkaXNjb25uZWN0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhaWxlZCBvbi1kZW1hbmQgcmVjZW50IGNvbm5lY3QgY2xvc2VzIHByb2dyZXNzIG5vdGlmaWNhdGlvbiBhbmQgcmVwb3J0cyBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZW1vdGVTdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWU8UmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cz4oJ3N0YXR1cycsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkKTtcblx0XHRjb25zdCBwcm9ncmVzcyA9IG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgY29ubmVjdGlvbktleTogc3RyaW5nOyByZWFkb25seSBtZXNzYWdlOiBzdHJpbmcgfT4oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvZ3Jlc3MpO1xuXHRcdGxldCBjb25uZWN0Q2FsbHMgPSAwO1xuXHRcdGNvbnN0IHJlbW90ZVByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdhZ2VudGhvc3QtcmVtb3RlLTEnLCB7XG5cdFx0XHRjb25uZWN0aW9uU3RhdHVzOiByZW1vdGVTdGF0dXMsXG5cdFx0XHRjYW5Db25uZWN0T25EZW1hbmQ6IHRydWUsXG5cdFx0XHRyZW1vdGVBZGRyZXNzOiAnd3NsOlVidW50dS0yNC4wNCcsXG5cdFx0XHRvbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzczogcHJvZ3Jlc3MuZXZlbnQsXG5cdFx0XHRjb25uZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbm5lY3RDYWxscysrO1xuXHRcdFx0XHRwcm9ncmVzcy5maXJlKHsgY29ubmVjdGlvbktleTogJ3dzbDpVYnVudHUtMjQuMDQnLCBtZXNzYWdlOiAnT3BlbmluZyBXU0wuLi4nIH0pO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Jvb20nKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9ucyA9IG5ldyBSZWNvcmRpbmdOb3RpZmljYXRpb25TZXJ2aWNlKCk7XG5cblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcmVtb3RlUHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCB1bmRlZmluZWQsIG5vdGlmaWNhdGlvbnMsIERpc3BhdGNoaW5nV29ya3NwYWNlUGlja2VyKSBhcyBEaXNwYXRjaGluZ1dvcmtzcGFjZVBpY2tlcjtcblxuXHRcdGF3YWl0IHBpY2tlci5kaXNwYXRjaEZvbGRlcihVUkkuZmlsZSgnL3JlbW90ZS9wcm9qZWN0JyksICdhZ2VudGhvc3QtcmVtb3RlLTEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29ubmVjdENhbGxzLFxuXHRcdFx0cHJvZ3Jlc3NDbG9zZWQ6IG5vdGlmaWNhdGlvbnMuaGFuZGxlc1swXT8uY2xvc2VkLFxuXHRcdFx0cHJvZ3Jlc3NNZXNzYWdlczogbm90aWZpY2F0aW9ucy5oYW5kbGVzWzBdPy5tZXNzYWdlcyxcblx0XHRcdGVycm9yczogbm90aWZpY2F0aW9ucy5lcnJvcnMubWFwKGVycm9yID0+IFN0cmluZyhlcnJvcikpLFxuXHRcdFx0c2VsZWN0ZWRQcm92aWRlcjogcGlja2VyLnNlbGVjdGVkUmVzb2x2ZWQ/LnByb3ZpZGVySWQsXG5cdFx0fSwge1xuXHRcdFx0Y29ubmVjdENhbGxzOiAxLFxuXHRcdFx0cHJvZ3Jlc3NDbG9zZWQ6IHRydWUsXG5cdFx0XHRwcm9ncmVzc01lc3NhZ2VzOiBbJ0Nvbm5lY3RpbmcgdG8gUHJvdmlkZXIgYWdlbnRob3N0LXJlbW90ZS0xLi4uJywgJ09wZW5pbmcgV1NMLi4uJ10sXG5cdFx0XHRlcnJvcnM6IFsnRmFpbGVkIHRvIGNvbm5lY3QgdG8gUHJvdmlkZXIgYWdlbnRob3N0LXJlbW90ZS0xLiddLFxuXHRcdFx0c2VsZWN0ZWRQcm92aWRlcjogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3Qga2VlcHMgdGhlIHNlbGVjdGlvbiAobm8gZXh0cmEgZXZlbnQgZmlyZXMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlbW90ZVN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPignc3RhdHVzJywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQpO1xuXHRcdGNvbnN0IHJlbW90ZVByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdhZ2VudGhvc3QtcmVtb3RlLTEnLCB7IGNvbm5lY3Rpb25TdGF0dXM6IHJlbW90ZVN0YXR1cyB9KTtcblxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZWVkU3RvcmFnZShzdG9yYWdlLCBbXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9yZW1vdGUvcHJvamVjdCcpLCBwcm92aWRlcklkOiAnYWdlbnRob3N0LXJlbW90ZS0xJywgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdF0pO1xuXG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3JlbW90ZVByb3ZpZGVyXSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSwgc3RvcmFnZSk7XG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdhZ2VudGhvc3QtcmVtb3RlLTEnKTtcblxuXHRcdC8vIERpc2Nvbm5lY3QgLyByZWNvbm5lY3QgY3ljbGUgXHUyMDE0IHNlbGVjdGlvbiBwcmVzZXJ2ZWQgdGhyb3VnaG91dC5cblx0XHRyZW1vdGVTdGF0dXMuc2V0KFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkLCB1bmRlZmluZWQpO1xuXHRcdHJlbW90ZVN0YXR1cy5zZXQoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdhZ2VudGhvc3QtcmVtb3RlLTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwaWNrZXIuc2VsZWN0ZWRSZXNvbHZlZD8ud29ya3NwYWNlLmZvbGRlcnNbMF0/LnJvb3QucGF0aCxcblx0XHRcdCcvcmVtb3RlL3Byb2plY3QnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoZWNrZWQgaXMgZ2xvYmFsbHkgdW5pcXVlIGFmdGVyIHBlcnNpc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtMScpO1xuXHRcdGNvbnN0IHJlbW90ZVN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPignc3RhdHVzJywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQpO1xuXHRcdGNvbnN0IHJlbW90ZVByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdhZ2VudGhvc3QtcmVtb3RlLTEnLCB7IGNvbm5lY3Rpb25TdGF0dXM6IHJlbW90ZVN0YXR1cyB9KTtcblxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZWVkU3RvcmFnZShzdG9yYWdlLCBbXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9yZW1vdGUvcHJvamVjdCcpLCBwcm92aWRlcklkOiAnYWdlbnRob3N0LXJlbW90ZS0xJywgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvbG9jYWwvcHJvamVjdCcpLCBwcm92aWRlcklkOiAnbG9jYWwtMScsIGNoZWNrZWQ6IGZhbHNlIH0sXG5cdFx0XSk7XG5cblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcmVtb3RlUHJvdmlkZXIsIGxvY2FsUHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblxuXHRcdC8vIFNlbGVjdCB0aGUgbG9jYWwgd29ya3NwYWNlXG5cdFx0Y29uc3QgcmVzb2x2ZWRXb3Jrc3BhY2UgPSBsb2NhbFByb3ZpZGVyLnJlc29sdmVXb3Jrc3BhY2UoVVJJLmZpbGUoJy9sb2NhbC9wcm9qZWN0JykpO1xuXHRcdGFzc2VydC5vayhyZXNvbHZlZFdvcmtzcGFjZSwgJ3Jlc29sdmVXb3Jrc3BhY2Ugc2hvdWxkIHJlc29sdmUgZmlsZTovLyBVUklzJyk7XG5cdFx0cGlja2VyLnNldFNlbGVjdGVkV29ya3NwYWNlKFVSSS5maWxlKCcvbG9jYWwvcHJvamVjdCcpLCB7IGZpcmVFdmVudDogZmFsc2UgfSk7XG5cblx0XHQvLyBWZXJpZnkgc3RvcmFnZTogb25seSB0aGUgbG9jYWwgZW50cnkgc2hvdWxkIGJlIGNoZWNrZWRcblx0XHRjb25zdCByYXcgPSBzdG9yYWdlLmdldChTVE9SQUdFX0tFWV9SRUNFTlRfV09SS1NQQUNFUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGFzc2VydC5vayhyYXcsICdTdG9yYWdlIHNob3VsZCBoYXZlIHJlY2VudCB3b3Jrc3BhY2VzJyk7XG5cdFx0Y29uc3Qgc3RvcmVkID0gSlNPTi5wYXJzZShyYXchKSBhcyB7IHVyaTogeyBwYXRoOiBzdHJpbmcgfTsgY2hlY2tlZDogYm9vbGVhbiB9W107XG5cdFx0Y29uc3QgY2hlY2tlZEVudHJpZXMgPSBzdG9yZWQuZmlsdGVyKGUgPT4gZS5jaGVja2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hlY2tlZEVudHJpZXMubGVuZ3RoLCAxLCAnT25seSBvbmUgZW50cnkgc2hvdWxkIGJlIGNoZWNrZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hlY2tlZEVudHJpZXNbMF0udXJpLnBhdGgsICcvbG9jYWwvcHJvamVjdCcsICdUaGUgbG9jYWwgZW50cnkgc2hvdWxkIGJlIGNoZWNrZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncHJvZ3JhbW1hdGljIHdvcmtzcGFjZSBpbml0aWFsaXphdGlvbiBjYW4gYXZvaWQgcGVyc2lzdGluZyByZWNlbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2xvY2FsUHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblx0XHRjb25zdCBmb2xkZXIgPSBVUkkuZmlsZSgnL2xvY2FsL3Byb3Bvc2VkJyk7XG5cblx0XHRwaWNrZXIuc2V0U2VsZWN0ZWRXb3Jrc3BhY2UoZm9sZGVyLCB7IGZpcmVFdmVudDogZmFsc2UsIHBlcnNpc3Q6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZWxlY3RlZDogcGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpPy50b1N0cmluZygpLFxuXHRcdFx0c3RvcmVkOiBzdG9yYWdlLmdldChTVE9SQUdFX0tFWV9SRUNFTlRfV09SS1NQQUNFUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpLFxuXHRcdH0sIHtcblx0XHRcdHNlbGVjdGVkOiBmb2xkZXIudG9TdHJpbmcoKSxcblx0XHRcdHN0b3JlZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NhbCBwcm92aWRlciBpcyBuZXZlciB0cmVhdGVkIGFzIHVuYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKTtcblxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZWVkU3RvcmFnZShzdG9yYWdlLCBbXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9sb2NhbC9wcm9qZWN0JyksIHByb3ZpZGVySWQ6ICdsb2NhbC0xJywgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdF0pO1xuXG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2xvY2FsUHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblxuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCAnbG9jYWwtMScsICdMb2NhbCBwcm92aWRlciB3b3Jrc3BhY2Ugc2hvdWxkIGFsd2F5cyBiZSBzZWxlY3RhYmxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmUgcGlja3MgdGhlIHN0b3JlZCB3b3Jrc3BhY2Ugd2hlbiBpdHMgcHJvdmlkZXIgcmVnaXN0ZXJzIGFmdGVyIGFub3RoZXIgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogcHJldmlvdXNseSB0aGUgcGlja2VyIGZpbHRlcmVkIHJlc3RvcmUgdGhyb3VnaCBgYWN0aXZlUHJvdmlkZXJJZGAsXG5cdFx0Ly8gd2hpY2ggYXV0by1sb2NrZWQgdG8gd2hpY2hldmVyIHByb3ZpZGVyIHJlZ2lzdGVyZWQgZmlyc3QuIElmIHRoZSBzdG9yZWRcblx0XHQvLyB3b3Jrc3BhY2UgYmVsb25nZWQgdG8gYSBwcm92aWRlciB0aGF0IHJlZ2lzdGVyZWQgbGF0ZXIgdGhhbiBhbm90aGVyIGF2YWlsYWJsZVxuXHRcdC8vIHByb3ZpZGVyIChmb3IgZXhhbXBsZSwgbG9jYWwtYWdlbnQtaG9zdCByZWdpc3RlcmluZyBhZnRlciBkZWZhdWx0LWNvcGlsb3QpLFxuXHRcdC8vIHRoZSBzdG9yZWQgZW50cnkgd2FzIGZpbHRlcmVkIG91dCBhbmQgbmV2ZXIgcmVzdG9yZWQuXG5cdFx0Ly9cblx0XHQvLyBSZWFsaXN0aWMgc2hhcGU6IHN0b3JhZ2UgaG9sZHMgQk9USCBhIChub24tY2hlY2tlZCkgcmVjZW50IGZvciB0aGVcblx0XHQvLyBlYXJseS1yZWdpc3RlcmluZyBwcm92aWRlciBhbmQgYSAoY2hlY2tlZCkgcmVjZW50IGZvciB0aGUgbGF0ZS1yZWdpc3RlcmluZ1xuXHRcdC8vIHByb3ZpZGVyLiBUaGUgcGlja2VyIG1heSBicmllZmx5IHNob3cgdGhlIGVhcmx5IHJlY2VudCBhcyBhIGZhbGxiYWNrLCBidXRcblx0XHQvLyBvbmNlIHRoZSBjaGVja2VkIGVudHJ5J3MgcHJvdmlkZXIgcmVnaXN0ZXJzLCB0aGUgcGlja2VyIG11c3QgdXBncmFkZSB0byBpdC5cblx0XHRjb25zdCBjb3BpbG90UHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2RlZmF1bHQtY29waWxvdCcpO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL2NvcGlsb3Qvb2xkLXByb2plY3QnKSwgcHJvdmlkZXJJZDogJ2RlZmF1bHQtY29waWxvdCcsIGNoZWNrZWQ6IGZhbHNlIH0sXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9hZ2VudC1ob3N0L3Byb2plY3QnKSwgcHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XSk7XG5cblx0XHQvLyBDb25zdHJ1Y3QgcGlja2VyIHdpdGggb25seSB0aGUgZWFybHktcmVnaXN0ZXJpbmcgcHJvdmlkZXIgYXZhaWxhYmxlLlxuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtjb3BpbG90UHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblxuXHRcdC8vIFRoZSBmYWxsYmFjayBtYXkgYmUgc2VsZWN0ZWQgaW5pdGlhbGx5IChlYXJseSBwcm92aWRlcidzIHJlY2VudCksXG5cdFx0Ly8gc2luY2UgdGhlIHVzZXIncyBjaGVja2VkIGVudHJ5J3MgcHJvdmlkZXIgaXNuJ3QgcmVhZHkgeWV0LlxuXHRcdC8vIE5vdyB0aGUgbGF0ZSBwcm92aWRlciBhcnJpdmVzLlxuXHRcdGNvbnN0IGFnZW50SG9zdFByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC1hZ2VudC1ob3N0Jyk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2NvcGlsb3RQcm92aWRlciwgYWdlbnRIb3N0UHJvdmlkZXJdKTtcblxuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCAnbG9jYWwtYWdlbnQtaG9zdCcsICdTdG9yZWQgd29ya3NwYWNlIHNob3VsZCBiZSByZXN0b3JlZCBvbmNlIGl0cyBwcm92aWRlciByZWdpc3RlcnMnKTtcblx0fSk7XG5cblx0dGVzdCgnbGF0ZS1yZWdpc3RlcmluZyBwcm92aWRlciBkb2VzIG5vdCBtb3ZlIHNlbGVjdGlvbiBvdXQgZnJvbSB1bmRlciB1c2VyJywgKCkgPT4ge1xuXHRcdC8vIEFmdGVyIHRoZSB1c2VyIGhhcyBleHBsaWNpdGx5IHBpY2tlZCBhIHdvcmtzcGFjZSwgYSBwcm92aWRlclxuXHRcdC8vIHJlZ2lzdGVyaW5nIGxhdGVyIGluIHRoZSBzZXNzaW9uIG11c3Qgbm90IHN3aXRjaCB0aGUgc2VsZWN0aW9uIHRvIGl0c1xuXHRcdC8vIHN0b3JlZCBcImNoZWNrZWRcIiBlbnRyeS4gV2Ugb25seSBkbyB0aGF0IGF1dG8tdXBncmFkZSBkdXJpbmcgaW5pdGlhbFxuXHRcdC8vIHN0YXJ0dXAgYmVmb3JlIHRoZSB1c2VyIGhhcyBhY3RlZC5cblx0XHRjb25zdCBjb3BpbG90UHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2RlZmF1bHQtY29waWxvdCcpO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL2FnZW50LWhvc3QvcHJvamVjdCcpLCBwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsIGNoZWNrZWQ6IHRydWUgfSxcblx0XHRdKTtcblxuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtjb3BpbG90UHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblxuXHRcdC8vIFN1cHByZXNzaW9uIGtpY2tlZCBpbjogbm8gZmFsbGJhY2sgc2VsZWN0aW9uIHdoaWxlIGNoZWNrZWQgZW50cnkgaXMgcGVuZGluZy5cblx0XHRhc3NlcnRTZWxlY3RlZFByb3ZpZGVyKHBpY2tlciwgdW5kZWZpbmVkLCAnTm8gZmFsbGJhY2sgd2hpbGUgY2hlY2tlZCBlbnRyeSBwZW5kaW5nJyk7XG5cblx0XHQvLyBVc2VyIGV4cGxpY2l0bHkgcGlja3MgYSBDb3BpbG90IHdvcmtzcGFjZS5cblx0XHRwaWNrZXIuc2V0U2VsZWN0ZWRXb3Jrc3BhY2UoVVJJLmZpbGUoJy9jb3BpbG90L3BpY2tlZCcpLCB7IGZpcmVFdmVudDogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdkZWZhdWx0LWNvcGlsb3QnLCAnVXNlciBwaWNrIGlzIGhvbm9yZWQnKTtcblxuXHRcdC8vIE5vdyB0aGUgbGF0ZSBwcm92aWRlciBmb3IgdGhlIChzdGlsbC1zdG9yZWQpIGNoZWNrZWQgZW50cnkgYXJyaXZlcy5cblx0XHRjb25zdCBhZ2VudEhvc3RQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtYWdlbnQtaG9zdCcpO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtjb3BpbG90UHJvdmlkZXIsIGFnZW50SG9zdFByb3ZpZGVyXSk7XG5cblx0XHRhc3NlcnRTZWxlY3RlZFByb3ZpZGVyKHBpY2tlciwgJ2RlZmF1bHQtY29waWxvdCcsICdVc2VyIHNlbGVjdGlvbiBpcyBwcmVzZXJ2ZWQgYWNyb3NzIGxhdGUgcHJvdmlkZXIgcmVnaXN0cmF0aW9uJyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBdXRvbWF0aW9uc1dvcmtzcGFjZVBpY2tlcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2VsZWN0cyBObyB3b3Jrc3BhY2UgYW5kIHJlc3RvcmVzIGEgZm9sZGVyIHRocm91Z2ggdGhlIHNhbWUgcGlja2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKTtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkuZmlsZSgnL2xvY2FsL3Byb2plY3QnKTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VlZFN0b3JhZ2Uoc3RvcmFnZSwgW3sgdXJpOiBmb2xkZXJVcmksIHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLCBjaGVja2VkOiB0cnVlIH1dKTtcblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcHJvdmlkZXJdKTtcblxuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdHByb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0bmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRUZXN0QXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXIsXG5cdFx0KSBhcyBUZXN0QXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXI7XG5cdFx0Y29uc3Qgc3RhdGUgPSB7XG5cdFx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRmb2xkZXJVcmksXG5cdFx0XHRpc29sYXRpb25Nb2RlOiAnd29ya3NwYWNlJyxcblx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgQXV0b21hdGlvbklzb2xhdGlvbk1vZGVsKHN0YXRlKTtcblx0XHRwaWNrZXIuc2V0VGFyZ2V0TW9kZWwobW9kZWwpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHBpY2tlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb25zdCByZWFkUHJlc2VudGF0aW9uID0gKCkgPT4gKHtcblx0XHRcdHRyaWdnZXJMYWJlbDogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5zZXNzaW9ucy1jaGF0LWRyb3Bkb3duLWxhYmVsJyk/LnRleHRDb250ZW50LFxuXHRcdFx0dHJpZ2dlckFyaWFMYWJlbDogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5hY3Rpb24tbGFiZWwnKT8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHRpdGVtczogcGlja2VyLmdldEl0ZW1TdGF0ZXMoKS5maWx0ZXIoaXRlbSA9PiBpdGVtLmxhYmVsID09PSAnTm8gd29ya3NwYWNlJyB8fCBpdGVtLmxhYmVsID09PSAnbG9jYWwvcHJvamVjdCcpLFxuXHRcdFx0aXNRdWlja0NoYXQ6IG1vZGVsLmlzUXVpY2tDaGF0LFxuXHRcdFx0Zm9sZGVyVXJpOiBtb2RlbC5mb2xkZXJVcmk/LnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSByZWFkUHJlc2VudGF0aW9uKCk7XG5cdFx0YXdhaXQgcGlja2VyLnNlbGVjdCgnTm8gd29ya3NwYWNlJyk7XG5cdFx0Y29uc3Qgbm9Xb3Jrc3BhY2UgPSByZWFkUHJlc2VudGF0aW9uKCk7XG5cdFx0YXdhaXQgcGlja2VyLnNlbGVjdCgnbG9jYWwvcHJvamVjdCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3b3Jrc3BhY2UsXG5cdFx0XHRub1dvcmtzcGFjZSxcblx0XHRcdHJlc3RvcmVkV29ya3NwYWNlOiByZWFkUHJlc2VudGF0aW9uKCksXG5cdFx0fSwge1xuXHRcdFx0d29ya3NwYWNlOiB7XG5cdFx0XHRcdHRyaWdnZXJMYWJlbDogJ2xvY2FsL3Byb2plY3QnLFxuXHRcdFx0XHR0cmlnZ2VyQXJpYUxhYmVsOiAnQXV0b21hdGlvbiB0YXJnZXQsIGxvY2FsL3Byb2plY3QnLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHsgbGFiZWw6ICdObyB3b3Jrc3BhY2UnLCBjaGVja2VkOiBmYWxzZSB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6ICdsb2NhbC9wcm9qZWN0JywgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRcdGZvbGRlclVyaTogZm9sZGVyVXJpLnRvU3RyaW5nKCksXG5cdFx0XHR9LFxuXHRcdFx0bm9Xb3Jrc3BhY2U6IHtcblx0XHRcdFx0dHJpZ2dlckxhYmVsOiAnTm8gd29ya3NwYWNlJyxcblx0XHRcdFx0dHJpZ2dlckFyaWFMYWJlbDogJ0F1dG9tYXRpb24gdGFyZ2V0LCBObyB3b3Jrc3BhY2UnLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHsgbGFiZWw6ICdObyB3b3Jrc3BhY2UnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJ2xvY2FsL3Byb2plY3QnLCBjaGVja2VkOiBmYWxzZSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRpc1F1aWNrQ2hhdDogdHJ1ZSxcblx0XHRcdFx0Zm9sZGVyVXJpOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0cmVzdG9yZWRXb3Jrc3BhY2U6IHtcblx0XHRcdFx0dHJpZ2dlckxhYmVsOiAnbG9jYWwvcHJvamVjdCcsXG5cdFx0XHRcdHRyaWdnZXJBcmlhTGFiZWw6ICdBdXRvbWF0aW9uIHRhcmdldCwgbG9jYWwvcHJvamVjdCcsXG5cdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0eyBsYWJlbDogJ05vIHdvcmtzcGFjZScsIGNoZWNrZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJ2xvY2FsL3Byb2plY3QnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGlzUXVpY2tDaGF0OiBmYWxzZSxcblx0XHRcdFx0Zm9sZGVyVXJpOiBmb2xkZXJVcmkudG9TdHJpbmcoKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXIgd29ya3NwYWNlIHNlbGVjdGlvbnMgZG8gbm90IHVwZGF0ZSByZWNlbnQgd29ya3NwYWNlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlcnNTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC0xJyk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxGb2xkZXIgPSBVUkkuZmlsZSgnL2xvY2FsL29yaWdpbmFsJyk7XG5cdFx0Y29uc3QgcHJvcG9zZWRGb2xkZXIgPSBVUkkuZmlsZSgnL2xvY2FsL3Byb3Bvc2VkJyk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBvcmlnaW5hbEZvbGRlciwgcHJvdmlkZXJJZDogcHJvdmlkZXIuaWQsIGNoZWNrZWQ6IHRydWUgfSxcblx0XHRcdHsgdXJpOiBwcm9wb3NlZEZvbGRlciwgcHJvdmlkZXJJZDogcHJvdmlkZXIuaWQsIGNoZWNrZWQ6IGZhbHNlIH0sXG5cdFx0XSk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3Byb3ZpZGVyXSk7XG5cdFx0Y29uc3QgYmVmb3JlID0gc3RvcmFnZS5nZXQoU1RPUkFHRV9LRVlfUkVDRU5UX1dPUktTUEFDRVMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRwcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZSxcblx0XHRcdG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRcdFx0VGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyLFxuXHRcdCkgYXMgVGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyO1xuXHRcdHBpY2tlci5zZXRUYXJnZXRNb2RlbChuZXcgQXV0b21hdGlvbklzb2xhdGlvbk1vZGVsKHtcblx0XHRcdGlzUXVpY2tDaGF0OiBmYWxzZSxcblx0XHRcdGZvbGRlclVyaTogb3JpZ2luYWxGb2xkZXIsXG5cdFx0XHRpc29sYXRpb25Nb2RlOiAnd29ya3NwYWNlJyxcblx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHBpY2tlci5zZWxlY3QoJ2xvY2FsL3Byb3Bvc2VkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlbGVjdGVkOiBwaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHRzdG9yYWdlVW5jaGFuZ2VkOiBzdG9yYWdlLmdldChTVE9SQUdFX0tFWV9SRUNFTlRfV09SS1NQQUNFUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpID09PSBiZWZvcmUsXG5cdFx0fSwge1xuXHRcdFx0c2VsZWN0ZWQ6IHByb3Bvc2VkRm9sZGVyLnRvU3RyaW5nKCksXG5cdFx0XHRzdG9yYWdlVW5jaGFuZ2VkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0aGUgcHJldmlvdXMgd29ya3NwYWNlIHdoZW4gdHJ1c3QgaXMgZGVjbGluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1Nlc3Npb25zUHJvdmlkZXJzU2VydmljZSgpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtMScpO1xuXHRcdGNvbnN0IHNlbGVjdGVkRm9sZGVyID0gVVJJLmZpbGUoJy9sb2NhbC9zZWxlY3RlZCcpO1xuXHRcdGNvbnN0IGNhbmRpZGF0ZUZvbGRlciA9IFVSSS5maWxlKCcvbG9jYWwvY2FuZGlkYXRlJyk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBzZWxlY3RlZEZvbGRlciwgcHJvdmlkZXJJZDogcHJvdmlkZXIuaWQsIGNoZWNrZWQ6IHRydWUgfSxcblx0XHRcdHsgdXJpOiBjYW5kaWRhdGVGb2xkZXIsIHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLCBjaGVja2VkOiBmYWxzZSB9LFxuXHRcdF0pO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtwcm92aWRlcl0pO1xuXHRcdGNvbnN0IHRydXN0UmVxdWVzdHM6IEFycmF5PHsgZm9sZGVyVXJpOiBzdHJpbmc7IHByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9PiA9IFtdO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdHByb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0bmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRUZXN0QXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXIsXG5cdFx0XHR7fSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0Y2FuU2VsZWN0V29ya3NwYWNlOiBhc3luYyAoZm9sZGVyVXJpLCBwcm92aWRlcklkKSA9PiB7XG5cdFx0XHRcdFx0dHJ1c3RSZXF1ZXN0cy5wdXNoKHsgZm9sZGVyVXJpOiBmb2xkZXJVcmkudG9TdHJpbmcoKSwgcHJvdmlkZXJJZCB9KTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdCkgYXMgVGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRmb2xkZXJVcmk6IHNlbGVjdGVkRm9sZGVyLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmtzcGFjZScsXG5cdFx0XHRicmFuY2g6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRwaWNrZXIuc2V0VGFyZ2V0TW9kZWwobW9kZWwpO1xuXG5cdFx0YXdhaXQgcGlja2VyLnNlbGVjdCgnbG9jYWwvY2FuZGlkYXRlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRydXN0UmVxdWVzdHMsXG5cdFx0XHRtb2RlbEZvbGRlclVyaTogbW9kZWwuZm9sZGVyVXJpPy50b1N0cmluZygpLFxuXHRcdFx0cGlja2VyRm9sZGVyVXJpOiBwaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0dHJ1c3RSZXF1ZXN0czogW3sgZm9sZGVyVXJpOiBjYW5kaWRhdGVGb2xkZXIudG9TdHJpbmcoKSwgcHJvdmlkZXJJZDogcHJvdmlkZXIuaWQgfV0sXG5cdFx0XHRtb2RlbEZvbGRlclVyaTogc2VsZWN0ZWRGb2xkZXIudG9TdHJpbmcoKSxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogc2VsZWN0ZWRGb2xkZXIudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBzdGFsZSB0cnVzdCBncmFudCBjYW5ub3Qgb3ZlcnJpZGUgYSBuZXdlciBObyB3b3Jrc3BhY2UgY2hvaWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKTtcblx0XHRjb25zdCBzZWxlY3RlZEZvbGRlciA9IFVSSS5maWxlKCcvbG9jYWwvc2VsZWN0ZWQnKTtcblx0XHRjb25zdCBjYW5kaWRhdGVGb2xkZXIgPSBVUkkuZmlsZSgnL2xvY2FsL2NhbmRpZGF0ZScpO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZWVkU3RvcmFnZShzdG9yYWdlLCBbXG5cdFx0XHR7IHVyaTogc2VsZWN0ZWRGb2xkZXIsIHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XHR7IHVyaTogY2FuZGlkYXRlRm9sZGVyLCBwcm92aWRlcklkOiBwcm92aWRlci5pZCwgY2hlY2tlZDogZmFsc2UgfSxcblx0XHRdKTtcblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcHJvdmlkZXJdKTtcblx0XHRjb25zdCB0cnVzdFJlc3VsdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8Ym9vbGVhbj4oKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRwcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZSxcblx0XHRcdG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRcdFx0VGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyLFxuXHRcdFx0e30sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7IGNhblNlbGVjdFdvcmtzcGFjZTogKCkgPT4gdHJ1c3RSZXN1bHQucCB9LFxuXHRcdCkgYXMgVGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRmb2xkZXJVcmk6IHNlbGVjdGVkRm9sZGVyLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmtzcGFjZScsXG5cdFx0XHRicmFuY2g6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRwaWNrZXIuc2V0VGFyZ2V0TW9kZWwobW9kZWwpO1xuXG5cdFx0Y29uc3Qgc3RhbGVTZWxlY3Rpb24gPSBwaWNrZXIuc2VsZWN0KCdsb2NhbC9jYW5kaWRhdGUnKTtcblx0XHRhd2FpdCBwaWNrZXIuc2VsZWN0KCdObyB3b3Jrc3BhY2UnKTtcblx0XHRhd2FpdCB0cnVzdFJlc3VsdC5jb21wbGV0ZSh0cnVlKTtcblx0XHRhd2FpdCBzdGFsZVNlbGVjdGlvbjtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aXNRdWlja0NoYXQ6IG1vZGVsLmlzUXVpY2tDaGF0LFxuXHRcdFx0Zm9sZGVyVXJpOiBtb2RlbC5mb2xkZXJVcmksXG5cdFx0XHRwaWNrZXJGb2xkZXJVcmk6IHBpY2tlci5zZWxlY3RlZEZvbGRlclVyaT8udG9TdHJpbmcoKSxcblx0XHR9LCB7XG5cdFx0XHRpc1F1aWNrQ2hhdDogdHJ1ZSxcblx0XHRcdGZvbGRlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0cGlja2VyRm9sZGVyVXJpOiBzZWxlY3RlZEZvbGRlci50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHN0YWxlIHJlbW90ZSBzZWxlY3Rpb24gY2Fubm90IG92ZXJyaWRlIGEgbmV3ZXIgTm8gd29ya3NwYWNlIGNob2ljZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlcnNTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxvY2FsUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKTtcblx0XHRjb25zdCByZW1vdGVTdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWU8UmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cz4oJ3JlbW90ZVN0YXR1cycsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkKTtcblx0XHRjb25zdCBjb25uZWN0U3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBmaW5pc2hDb25uZWN0ID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHJlbW90ZVByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdhZ2VudGhvc3QtcmVtb3RlLTEnLCB7XG5cdFx0XHRjb25uZWN0aW9uU3RhdHVzOiByZW1vdGVTdGF0dXMsXG5cdFx0XHRjYW5Db25uZWN0T25EZW1hbmQ6IHRydWUsXG5cdFx0XHRjb25uZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IGNvbm5lY3RTdGFydGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGF3YWl0IGZpbmlzaENvbm5lY3QucDtcblx0XHRcdFx0cmVtb3RlU3RhdHVzLnNldChSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZCwgdW5kZWZpbmVkKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgbG9jYWxGb2xkZXIgPSBVUkkuZmlsZSgnL2xvY2FsL3Byb2plY3QnKTtcblx0XHRjb25zdCByZW1vdGVGb2xkZXIgPSBVUkkuZmlsZSgnL3JlbW90ZS9wcm9qZWN0Jyk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBsb2NhbEZvbGRlciwgcHJvdmlkZXJJZDogbG9jYWxQcm92aWRlci5pZCwgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdFx0eyB1cmk6IHJlbW90ZUZvbGRlciwgcHJvdmlkZXJJZDogcmVtb3RlUHJvdmlkZXIuaWQsIGNoZWNrZWQ6IGZhbHNlIH0sXG5cdFx0XSk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2xvY2FsUHJvdmlkZXIsIHJlbW90ZVByb3ZpZGVyXSk7XG5cblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRwcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZSxcblx0XHRcdG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRcdFx0VGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyLFxuXHRcdCkgYXMgVGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRmb2xkZXJVcmk6IGxvY2FsRm9sZGVyLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmtzcGFjZScsXG5cdFx0XHRicmFuY2g6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRwaWNrZXIuc2V0VGFyZ2V0TW9kZWwobW9kZWwpO1xuXG5cdFx0Y29uc3Qgc3RhbGVTZWxlY3Rpb24gPSBwaWNrZXIuc2VsZWN0KCdyZW1vdGUvcHJvamVjdCcpO1xuXHRcdGF3YWl0IGNvbm5lY3RTdGFydGVkLnA7XG5cdFx0YXdhaXQgcGlja2VyLnNlbGVjdCgnTm8gd29ya3NwYWNlJyk7XG5cdFx0YXdhaXQgZmluaXNoQ29ubmVjdC5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHN0YWxlU2VsZWN0aW9uO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogbW9kZWwuaXNRdWlja0NoYXQsXG5cdFx0XHRmb2xkZXJVcmk6IG1vZGVsLmZvbGRlclVyaSxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogcGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpPy50b1N0cmluZygpLFxuXHRcdH0sIHtcblx0XHRcdGlzUXVpY2tDaGF0OiB0cnVlLFxuXHRcdFx0Zm9sZGVyVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRwaWNrZXJGb2xkZXJVcmk6IGxvY2FsRm9sZGVyLnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jyb3dzaW5nIHRvIGEgZm9sZGVyIGV4aXRzIE5vIHdvcmtzcGFjZSBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZmFsbGJhY2tQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignZmFsbGJhY2snKTtcblx0XHRjb25zdCBsb2NhbFByb3ZpZGVyID0geyAuLi5jcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKSwgc3VwcG9ydHNMb2NhbFdvcmtzcGFjZXM6IHRydWUgfTtcblx0XHRjb25zdCBwcm9kdWNpbmdQcm92aWRlciA9IHsgLi4uY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC1hZ2VudC1ob3N0JyksIHN1cHBvcnRzTG9jYWxXb3Jrc3BhY2VzOiB0cnVlIH07XG5cdFx0Y29uc3QgYnJvd3NlZEZvbGRlciA9IFVSSS5maWxlKCcvYWdlbnQtaG9zdC9icm93c2VkJyk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2ZhbGxiYWNrUHJvdmlkZXIsIGxvY2FsUHJvdmlkZXIsIHByb2R1Y2luZ1Byb3ZpZGVyXSk7XG5cdFx0Y29uc3QgdHJ1c3RSZXF1ZXN0czogQXJyYXk8eyBmb2xkZXJVcmk6IHN0cmluZzsgcHJvdmlkZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkIH0+ID0gW107XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0cHJvdmlkZXJzU2VydmljZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRcdFx0VGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyLFxuXHRcdFx0eyBzaG93T3BlbkRpYWxvZzogYXN5bmMgKCkgPT4gW2Jyb3dzZWRGb2xkZXJdIH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdGNhblNlbGVjdFdvcmtzcGFjZTogYXN5bmMgKGZvbGRlclVyaSwgcHJvdmlkZXJJZCkgPT4ge1xuXHRcdFx0XHRcdHRydXN0UmVxdWVzdHMucHVzaCh7IGZvbGRlclVyaTogZm9sZGVyVXJpLnRvU3RyaW5nKCksIHByb3ZpZGVySWQgfSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdCkgYXMgVGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogdHJ1ZSxcblx0XHRcdGZvbGRlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogdW5kZWZpbmVkLFxuXHRcdFx0YnJhbmNoOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0cGlja2VyLnNldFRhcmdldE1vZGVsKG1vZGVsKTtcblxuXHRcdGF3YWl0IHBpY2tlci5zZWxlY3QoJ1NlbGVjdC4uLicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogbW9kZWwuaXNRdWlja0NoYXQsXG5cdFx0XHRmb2xkZXJVcmk6IG1vZGVsLmZvbGRlclVyaT8udG9TdHJpbmcoKSxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogcGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpPy50b1N0cmluZygpLFxuXHRcdFx0dHJ1c3RSZXF1ZXN0cyxcblx0XHR9LCB7XG5cdFx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRmb2xkZXJVcmk6IGJyb3dzZWRGb2xkZXIudG9TdHJpbmcoKSxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogYnJvd3NlZEZvbGRlci50b1N0cmluZygpLFxuXHRcdFx0dHJ1c3RSZXF1ZXN0czogW3sgZm9sZGVyVXJpOiBicm93c2VkRm9sZGVyLnRvU3RyaW5nKCksIHByb3ZpZGVySWQ6IHByb2R1Y2luZ1Byb3ZpZGVyLmlkIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF5cyBpbiBObyB3b3Jrc3BhY2UgbW9kZSB3aGVuIHRydXN0IGlzIGRlY2xpbmVkIGZvciBhIGJyb3dzZWQgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB7IC4uLmNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtMScpLCBzdXBwb3J0c0xvY2FsV29ya3NwYWNlczogdHJ1ZSB9O1xuXHRcdGNvbnN0IGJyb3dzZWRGb2xkZXIgPSBVUkkuZmlsZSgnL2xvY2FsL2Jyb3dzZWQnKTtcblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRwcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRUZXN0QXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXIsXG5cdFx0XHR7IHNob3dPcGVuRGlhbG9nOiBhc3luYyAoKSA9PiBbYnJvd3NlZEZvbGRlcl0gfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHsgY2FuU2VsZWN0V29ya3NwYWNlOiBhc3luYyAoKSA9PiBmYWxzZSB9LFxuXHRcdCkgYXMgVGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogdHJ1ZSxcblx0XHRcdGZvbGRlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogdW5kZWZpbmVkLFxuXHRcdFx0YnJhbmNoOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0cGlja2VyLnNldFRhcmdldE1vZGVsKG1vZGVsKTtcblxuXHRcdGF3YWl0IHBpY2tlci5zZWxlY3QoJ1NlbGVjdC4uLicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogbW9kZWwuaXNRdWlja0NoYXQsXG5cdFx0XHRmb2xkZXJVcmk6IG1vZGVsLmZvbGRlclVyaSxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogcGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpLFxuXHRcdH0sIHtcblx0XHRcdGlzUXVpY2tDaGF0OiB0cnVlLFxuXHRcdFx0Zm9sZGVyVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRwaWNrZXJGb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBzdGFsZSBicm93c2UgcmVzdWx0IGRvZXMgbm90IHJlcXVlc3QgdHJ1c3QgYWZ0ZXIgYSBuZXdlciBjaG9pY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1Nlc3Npb25zUHJvdmlkZXJzU2VydmljZSgpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHsgLi4uY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC0xJyksIHN1cHBvcnRzTG9jYWxXb3Jrc3BhY2VzOiB0cnVlIH07XG5cdFx0Y29uc3QgYnJvd3NlZEZvbGRlciA9IFVSSS5maWxlKCcvbG9jYWwvYnJvd3NlZCcpO1xuXHRcdGNvbnN0IGJyb3dzZVJlc3VsdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8VVJJW10gfCB1bmRlZmluZWQ+KCk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3Byb3ZpZGVyXSk7XG5cdFx0bGV0IHRydXN0UmVxdWVzdENvdW50ID0gMDtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRwcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRUZXN0QXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXIsXG5cdFx0XHR7IHNob3dPcGVuRGlhbG9nOiAoKSA9PiBicm93c2VSZXN1bHQucCB9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRjYW5TZWxlY3RXb3Jrc3BhY2U6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0cnVzdFJlcXVlc3RDb3VudCsrO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHQpIGFzIFRlc3RBdXRvbWF0aW9uc1dvcmtzcGFjZVBpY2tlcjtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwoe1xuXHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0XHRmb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdGlzb2xhdGlvbk1vZGU6IHVuZGVmaW5lZCxcblx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdHBpY2tlci5zZXRUYXJnZXRNb2RlbChtb2RlbCk7XG5cblx0XHRjb25zdCBzdGFsZVNlbGVjdGlvbiA9IHBpY2tlci5zZWxlY3QoJ1NlbGVjdC4uLicpO1xuXHRcdGF3YWl0IHBpY2tlci5zZWxlY3QoJ05vIHdvcmtzcGFjZScpO1xuXHRcdGF3YWl0IGJyb3dzZVJlc3VsdC5jb21wbGV0ZShbYnJvd3NlZEZvbGRlcl0pO1xuXHRcdGF3YWl0IHN0YWxlU2VsZWN0aW9uO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogbW9kZWwuaXNRdWlja0NoYXQsXG5cdFx0XHRmb2xkZXJVcmk6IG1vZGVsLmZvbGRlclVyaSxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogcGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpLFxuXHRcdFx0dHJ1c3RSZXF1ZXN0Q291bnQsXG5cdFx0fSwge1xuXHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0XHRmb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0dHJ1c3RSZXF1ZXN0Q291bnQ6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ05vIHdvcmtzcGFjZSBpcyByZXByZXNlbnRlZCBhcyBhIGNoZWNrZWQgbW9iaWxlIHNoZWV0IHJvdycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlcnNTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdHByb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKSxcblx0XHRcdFRlc3RBdXRvbWF0aW9uc1dvcmtzcGFjZVBpY2tlcixcblx0XHQpIGFzIFRlc3RBdXRvbWF0aW9uc1dvcmtzcGFjZVBpY2tlcjtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwoe1xuXHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0XHRmb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdGlzb2xhdGlvbk1vZGU6IHVuZGVmaW5lZCxcblx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdHBpY2tlci5zZXRUYXJnZXRNb2RlbChtb2RlbCk7XG5cblx0XHRjb25zdCByb3dzID0gYnVpbGRNb2JpbGVXb3Jrc3BhY2VQaWNrZXJSb3dzKHBpY2tlci5nZXRJdGVtcygpLCAoKSA9PiB7IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyb3dzLm1hcChyb3cgPT4gcm93LnNoZWV0SXRlbSksIFt7XG5cdFx0XHRpZDogJ2l0ZW06MCcsXG5cdFx0XHRsYWJlbDogJ05vIHdvcmtzcGFjZScsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ1J1biB3aXRob3V0IGEgYmFja2luZyB3b3Jrc3BhY2UnLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jb21tZW50RGlzY3Vzc2lvbixcblx0XHRcdGNoZWNrZWQ6IHRydWUsXG5cdFx0XHRkaXNhYmxlZDogdW5kZWZpbmVkLFxuXHRcdFx0c2VjdGlvblRpdGxlOiB1bmRlZmluZWQsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2JpbGUgd29ya3NwYWNlIGhlYWRlciBhY3Rpb24gZGlzcGF0Y2hlcyBicm93c2luZyBhZnRlciB0aGUgc2hlZXQgY2xvc2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtiZW5jaCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kKHdvcmtiZW5jaCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gd29ya2JlbmNoLnJlbW92ZSgpIH0pO1xuXHRcdGNvbnN0IHRyaWdnZXIgPSB3b3JrYmVuY2guYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJykpO1xuXHRcdGNvbnN0IGRpc3BhdGNoZWQ6IElXb3Jrc3BhY2VQaWNrZXJJdGVtW10gPSBbXTtcblx0XHRjb25zdCBzaGVldCA9IHNob3dNb2JpbGVXb3Jrc3BhY2VQaWNrZXJTaGVldChcblx0XHRcdHVwY2FzdFBhcnRpYWw8SVdvcmtiZW5jaExheW91dFNlcnZpY2U+KHsgbWFpbkNvbnRhaW5lcjogd29ya2JlbmNoIH0pLFxuXHRcdFx0dHJpZ2dlcixcblx0XHRcdFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdFx0bGFiZWw6ICdObyB3b3Jrc3BhY2UnLFxuXHRcdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogQ29kaWNvbi5jb21tZW50RGlzY3Vzc2lvbiB9LFxuXHRcdFx0XHRcdGl0ZW06IHsgcnVuOiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdFx0bGFiZWw6ICdTZWxlY3QuLi4nLFxuXHRcdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogQ29kaWNvbi5mb2xkZXJPcGVuZWQgfSxcblx0XHRcdFx0XHRpdGVtOiB7IGJyb3dzZUFjdGlvbkluZGV4OiAwIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0aXRlbSA9PiBkaXNwYXRjaGVkLnB1c2goaXRlbSksXG5cdFx0XHRbbWFrZUJyb3dzZUFjdGlvbignbG9jYWwtMScsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMLCAnU2VsZWN0Li4uJyldLFxuXHRcdCk7XG5cdFx0Y29uc3QgaGVhZGVyQWN0aW9uID0gd29ya2JlbmNoLnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcubW9iaWxlLXBpY2tlci1zaGVldC1oZWFkZXItYWN0aW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKGhlYWRlckFjdGlvbik7XG5cblx0XHRoZWFkZXJBY3Rpb24uY2xpY2soKTtcblx0XHRhd2FpdCBzaGVldDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlzcGF0Y2hlZCwgW3sgYnJvd3NlQWN0aW9uSW5kZXg6IDAgfV0pO1xuXHR9KTtcbn0pO1xuXG4vLyAtLS0tIFRhYiBkaXNjb3ZlcnkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKiogTWluaW1hbCBzdWJjbGFzcyB0aGF0IGV4cG9zZXMgdGhlIHByb3RlY3RlZCBgX2dldEF2YWlsYWJsZVRhYnNgIGZvciB0ZXN0aW5nLiAqL1xuY2xhc3MgVGVzdGFibGVQaWNrZXIgZXh0ZW5kcyBXb3Jrc3BhY2VQaWNrZXIge1xuXHRnZXRBdmFpbGFibGVUYWJzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QXZhaWxhYmxlVGFicygpLm1hcCh0ID0+IHQuaWQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1ha2VCcm93c2VBY3Rpb24ocHJvdmlkZXJJZDogc3RyaW5nLCBncm91cDogc3RyaW5nIHwgdW5kZWZpbmVkLCBsYWJlbCA9ICdicm93c2UnKTogSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb24ge1xuXHRyZXR1cm4ge1xuXHRcdGxhYmVsLFxuXHRcdGdyb3VwLFxuXHRcdGljb246IENvZGljb24uZm9sZGVyLFxuXHRcdHByb3ZpZGVySWQsXG5cdFx0cnVuOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVRlc3RhYmxlUGlja2VyKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIHByb3ZpZGVyc1NlcnZpY2U6IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIHJlbW90ZUFnZW50SG9zdHNFbmFibGVkID0gdHJ1ZSk6IFRlc3RhYmxlUGlja2VyIHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWN0aW9uV2lkZ2V0U2VydmljZSwgeyBpc1Zpc2libGU6IGZhbHNlLCBoaWRlOiAoKSA9PiB7IH0sIHNob3c6ICgpID0+IHsgfSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dFZpZXdTZXJ2aWNlLCB7IHNob3dDb250ZXh0VmlldzogKCkgPT4gKHsgY2xvc2U6ICgpID0+IHsgfSB9KSwgaGlkZUNvbnRleHRWaWV3OiAoKSA9PiB7IH0sIGxheW91dDogKCkgPT4geyB9IH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIHsgZXh0VXJpIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIHByb3ZpZGVyc1NlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCB7fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVF1aWNrSW5wdXRTZXJ2aWNlLCB7fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNsaXBib2FyZFNlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJlZmVyZW5jZXNTZXJ2aWNlLCB7fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU91dHB1dFNlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBbUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWRdOiByZW1vdGVBZ2VudEhvc3RzRW5hYmxlZCB9KSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCB7IGV4ZWN1dGVDb21tYW5kOiBhc3luYyAoKSA9PiB7IH0gfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVEaWFsb2dTZXJ2aWNlLCB7fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElNZW51U2VydmljZSwgeyBjcmVhdGVNZW51OiAoKSA9PiAoeyBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSwgZ2V0QWN0aW9uczogKCkgPT4gW10sIGRpc3Bvc2U6ICgpID0+IHsgfSB9KSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90aWZpY2F0aW9uU2VydmljZSwgbmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VzU2VydmljZSwge1xuXHRcdGdldFJlY2VudGx5T3BlbmVkOiBhc3luYyAoKSA9PiAoeyB3b3Jrc3BhY2VzOiBbXSwgZmlsZXM6IFtdIH0pLFxuXHRcdG9uRGlkQ2hhbmdlUmVjZW50bHlPcGVuZWQ6IEV2ZW50Lk5vbmUsXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNSZWNlbnRXb3Jrc3BhY2VzU2VydmljZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RhYmxlUGlja2VyLCB7fSkpO1xufVxuXG5zdWl0ZSgnV29ya3NwYWNlUGlja2VyIC0gVGFiIGRpc2NvdmVyeScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHByb3ZpZGVyc1NlcnZpY2U6IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHByb3ZpZGVyc1NlcnZpY2UgPSBuZXcgTW9ja1Nlc3Npb25zUHJvdmlkZXJzU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlcnNTZXJ2aWNlKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyBSZW1vdGUgZ3JvdXAgZXZlbiB3aGVuIG5vIHByb3ZpZGVycyBjb250cmlidXRlIGdyb3VwcycsICgpID0+IHtcblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbY3JlYXRlTW9ja1Byb3ZpZGVyKCdwMScpXSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdGFibGVQaWNrZXIoZGlzcG9zYWJsZXMsIHByb3ZpZGVyc1NlcnZpY2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlja2VyLmdldEF2YWlsYWJsZVRhYnMoKSwgW1NFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRlcyBSZW1vdGUgZ3JvdXAgd2hlbiByZW1vdGUgYWdlbnQgaG9zdHMgYXJlIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtcblx0XHRcdGNyZWF0ZU1vY2tQcm92aWRlcigncDEnLCB7IGJyb3dzZUFjdGlvbnM6IFttYWtlQnJvd3NlQWN0aW9uKCdwMScsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URSldIH0pLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RhYmxlUGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrZXIuZ2V0QXZhaWxhYmxlVGFicygpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29yZGVycyB3ZWxsLWtub3duIGdyb3VwcyBMb2NhbCBmaXJzdCwgdGhlbiBhbHBoYWJldGljYWwnLCAoKSA9PiB7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW1xuXHRcdFx0Y3JlYXRlTW9ja1Byb3ZpZGVyKCdyZW1vdGUnLCB7IGJyb3dzZUFjdGlvbnM6IFttYWtlQnJvd3NlQWN0aW9uKCdyZW1vdGUnLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEUpXSB9KSxcblx0XHRcdGNyZWF0ZU1vY2tQcm92aWRlcignY2xvdWQnLCB7IGJyb3dzZUFjdGlvbnM6IFttYWtlQnJvd3NlQWN0aW9uKCdjbG91ZCcsICdDbG91ZCcpXSB9KSxcblx0XHRcdGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwnLCB7IGJyb3dzZUFjdGlvbnM6IFttYWtlQnJvd3NlQWN0aW9uKCdsb2NhbCcsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMKV0gfSksXG5cdFx0XSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdGFibGVQaWNrZXIoZGlzcG9zYWJsZXMsIHByb3ZpZGVyc1NlcnZpY2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlja2VyLmdldEF2YWlsYWJsZVRhYnMoKSwgW1NFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMLCAnQ2xvdWQnLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEVdKTtcblx0fSk7XG5cblx0dGVzdCgnZGVkdXBsaWNhdGVzIGdyb3VwcyBjb250cmlidXRlZCBieSBtdWx0aXBsZSBwcm92aWRlcnMgLyBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtcblx0XHRcdGNyZWF0ZU1vY2tQcm92aWRlcigncDEnLCB7IGJyb3dzZUFjdGlvbnM6IFttYWtlQnJvd3NlQWN0aW9uKCdwMScsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMKV0gfSksXG5cdFx0XHRjcmVhdGVNb2NrUHJvdmlkZXIoJ3AyJywgeyBicm93c2VBY3Rpb25zOiBbbWFrZUJyb3dzZUFjdGlvbigncDInLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCksIG1ha2VCcm93c2VBY3Rpb24oJ3AyJywgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwpXSB9KSxcblx0XHRdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0YWJsZVBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrZXIuZ2V0QXZhaWxhYmxlVGFicygpLCBbU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmRzIGN1c3RvbSBncm91cCBsYWJlbHMgYWZ0ZXIgTG9jYWwnLCAoKSA9PiB7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW1xuXHRcdFx0Y3JlYXRlTW9ja1Byb3ZpZGVyKCdwMScsIHsgYnJvd3NlQWN0aW9uczogW21ha2VCcm93c2VBY3Rpb24oJ3AxJywgJ0N1c3RvbSBBJyksIG1ha2VCcm93c2VBY3Rpb24oJ3AxJywgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwpXSB9KSxcblx0XHRcdGNyZWF0ZU1vY2tQcm92aWRlcigncDInLCB7IGJyb3dzZUFjdGlvbnM6IFttYWtlQnJvd3NlQWN0aW9uKCdwMicsICdDdXN0b20gQicpLCBtYWtlQnJvd3NlQWN0aW9uKCdwMicsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URSldIH0pLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RhYmxlUGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlKTtcblx0XHRjb25zdCB0YWJzID0gcGlja2VyLmdldEF2YWlsYWJsZVRhYnMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFic1swXSwgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFicy5zbGljZSgxKS5zb3J0KCksIFsnQ3VzdG9tIEEnLCAnQ3VzdG9tIEInLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEVdKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBicm93c2UgYWN0aW9ucyB3aXRob3V0IGEgZ3JvdXAnLCAoKSA9PiB7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW1xuXHRcdFx0Y3JlYXRlTW9ja1Byb3ZpZGVyKCdwMScsIHsgYnJvd3NlQWN0aW9uczogW21ha2VCcm93c2VBY3Rpb24oJ3AxJywgdW5kZWZpbmVkKSwgbWFrZUJyb3dzZUFjdGlvbigncDEnLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCldIH0pLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RhYmxlUGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2tlci5nZXRBdmFpbGFibGVUYWJzKCksIFtTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCwgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfUkVNT1RFXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2NvdmVycyBncm91cHMgZnJvbSByZWNlbnQgd29ya3NwYWNlcyBkb2VzIG5vdCBhZGQgZXh0cmEgdGFicycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlcjogSVNlc3Npb25zUHJvdmlkZXIgPSB7XG5cdFx0XHQuLi5jcmVhdGVNb2NrUHJvdmlkZXIoJ3AxJyksXG5cdFx0XHRyZXNvbHZlV29ya3NwYWNlOiAodXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSA9PiAoe1xuXHRcdFx0XHR1cmksXG5cdFx0XHRcdGxhYmVsOiB1cmkucGF0aCxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0XHRcdGdyb3VwOiAnQ2xvdWQnLFxuXHRcdFx0XHRmb2xkZXJzOiBbe1xuXHRcdFx0XHRcdHJvb3Q6IHVyaSxcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB1cmksXG5cdFx0XHRcdFx0bmFtZTogdXJpLnBhdGgsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRnaXRSZXBvc2l0b3J5OiB7IHVyaSwgd29ya1RyZWVVcmk6IHVuZGVmaW5lZCwgYmFzZUJyYW5jaE5hbWU6IHVuZGVmaW5lZCwgZ2l0SHViSW5mbzogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCkgfSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdFx0fSksXG5cdFx0fTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VlZFN0b3JhZ2Uoc3RvcmFnZSwgW3sgdXJpOiBVUkkuZmlsZSgnL3JlcG8nKSwgcHJvdmlkZXJJZDogJ3AxJywgY2hlY2tlZDogZmFsc2UgfV0pO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtwcm92aWRlcl0pO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBY3Rpb25XaWRnZXRTZXJ2aWNlLCB7IGlzVmlzaWJsZTogZmFsc2UsIGhpZGU6ICgpID0+IHsgfSwgc2hvdzogKCkgPT4geyB9IH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRWaWV3U2VydmljZSwgeyBzaG93Q29udGV4dFZpZXc6ICgpID0+ICh7IGNsb3NlOiAoKSA9PiB7IH0gfSksIGhpZGVDb250ZXh0VmlldzogKCkgPT4geyB9LCBsYXlvdXQ6ICgpID0+IHsgfSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXJpSWRlbnRpdHlTZXJ2aWNlLCB7IGV4dFVyaSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIHByb3ZpZGVyc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElRdWlja0lucHV0U2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNsaXBib2FyZFNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcmVmZXJlbmNlc1NlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElPdXRwdXRTZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBbUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWRdOiB0cnVlIH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgeyBleGVjdXRlQ29tbWFuZDogYXN5bmMgKCkgPT4geyB9IH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVEaWFsb2dTZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTWVudVNlcnZpY2UsIHsgY3JlYXRlTWVudTogKCkgPT4gKHsgb25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsIGdldEFjdGlvbnM6ICgpID0+IFtdLCBkaXNwb3NlOiAoKSA9PiB7IH0gfSkgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlc1NlcnZpY2UsIHtcblx0XHRcdGdldFJlY2VudGx5T3BlbmVkOiBhc3luYyAoKSA9PiAoeyB3b3Jrc3BhY2VzOiBbXSwgZmlsZXM6IFtdIH0pLFxuXHRcdFx0b25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZDogRXZlbnQuTm9uZSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNSZWNlbnRXb3Jrc3BhY2VzU2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0Y29uc3QgcGlja2VyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RhYmxlUGlja2VyLCB7fSkpO1xuXHRcdC8vIFJlY2VudCB3b3Jrc3BhY2UgZ3JvdXAgKCdDbG91ZCcpIGlzIG5vdCBhZGRlZCBhcyBhIHRhYiBcdTIwMTQgb25seVxuXHRcdC8vIGJyb3dzZSBhY3Rpb25zIGFuZCB0aGUgYWx3YXlzLXByZXNlbnQgUmVtb3RlIGdyb3VwIGNvbnRyaWJ1dGUgdGFicy5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2tlci5nZXRBdmFpbGFibGVUYWJzKCksIFtTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEVdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsaUJBQXNDLHVCQUF1QjtBQUN0RSxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxpQ0FBaUMseUJBQXlCLHdDQUF3QztBQUMzRyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGNBQWM7QUFDdkIsU0FBd0MsaUNBQWlDO0FBR3pFLFNBQTJELCtCQUErQixzQ0FBc0M7QUFDaEksU0FBd0QsdUJBQXVCO0FBQy9FLFNBQVMsa0NBQWtDLHVDQUF1QztBQUNsRixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQyxzQ0FBc0M7QUFFL0UsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7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
