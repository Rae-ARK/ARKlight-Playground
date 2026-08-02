var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Workbench as SessionsWorkbench } from "../browser/workbench.js";
import { SessionsBrowserMain } from "../browser/web.main.js";
import { Emitter, Event } from "../../base/common/event.js";
import { observableValue } from "../../base/common/observable.js";
import { ChatEntitlement, IChatEntitlementService } from "../../workbench/services/chat/common/chatEntitlementService.js";
import { IDefaultAccountService } from "../../platform/defaultAccount/common/defaultAccount.js";
import { IChatAgentService } from "../../workbench/contrib/chat/common/participants/chatAgents.js";
import { ChatAgentLocation, ChatModeKind } from "../../workbench/contrib/chat/common/constants.js";
import { ExtensionIdentifier } from "../../platform/extensions/common/extensions.js";
import { IStorageService, StorageScope, StorageTarget } from "../../platform/storage/common/storage.js";
import { URI } from "../../base/common/uri.js";
import { Disposable } from "../../base/common/lifecycle.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../workbench/common/contributions.js";
import { IChatSessionsService, ChatSessionStatus } from "../../workbench/contrib/chat/common/chatSessionsService.js";
import { IGitService } from "../../workbench/contrib/git/common/gitService.js";
import { IFileService } from "../../platform/files/common/files.js";
import { ITerminalService } from "../../workbench/contrib/terminal/browser/terminal.js";
import { TerminalExtensions } from "../../platform/terminal/common/terminal.js";
import { Registry } from "../../platform/registry/common/platform.js";
import { InMemoryFileSystemProvider } from "../../platform/files/common/inMemoryFilesystemProvider.js";
import { VSBuffer } from "../../base/common/buffer.js";
import { SyncDescriptor } from "../../platform/instantiation/common/descriptors.js";
import { getSingletonServiceDescriptors } from "../../platform/instantiation/common/extensions.js";
import { isEqual } from "../../base/common/resources.js";
const MOCK_FS_FILES = {
  "/mock-repo/src/index.ts": 'export function main() {\n	console.log("Hello from mock repo");\n}\n',
  "/mock-repo/src/utils.ts": "export function add(a: number, b: number): number {\n	return a + b;\n}\n",
  "/mock-repo/package.json": '{\n	"name": "mock-repo",\n	"version": "1.0.0"\n}\n',
  "/mock-repo/README.md": "# Mock Repository\n\nThis is a mock repository for E2E testing.\n"
};
function registerMockFileSystemProvider(serviceCollection) {
  const fileService = serviceCollection.get(IFileService);
  const provider = new InMemoryFileSystemProvider();
  fileService.registerProvider("mock-fs", provider);
  for (const [filePath, content] of Object.entries(MOCK_FS_FILES)) {
    const uri = URI.from({ scheme: "mock-fs", authority: "mock-repo", path: filePath });
    fileService.writeFile(uri, VSBuffer.fromString(content));
  }
  console.log("[Sessions Web Test] Registered mock-fs:// provider with pre-seeded files");
}
const MOCK_ACCOUNT = {
  authenticationProvider: { id: "github", name: "GitHub (Mock)", enterprise: false },
  accountName: "e2e-test-user",
  sessionId: "mock-session-1",
  enterprise: false
};
class MockChatEntitlementService {
  constructor() {
    this.onDidChangeEntitlement = Event.None;
    this.onDidChangeQuotaExceeded = Event.None;
    this.onDidChangeQuotaRemaining = Event.None;
    this.onDidChangeUsageBasedBilling = Event.None;
    this.onDidChangeSentiment = Event.None;
    this.onDidChangeAnonymous = Event.None;
    this.entitlement = ChatEntitlement.Free;
    this.entitlementObs = observableValue("entitlement", ChatEntitlement.Free);
    this.clientByokEnabled = false;
    this.hasByokModels = false;
    this.organisations = void 0;
    this.isInternal = false;
    this.sku = "free";
    this.copilotTrackingId = "mock-tracking-id";
    this.quotas = {};
    this.sentiment = { completed: true, registered: true };
    this.sentimentObs = observableValue("sentiment", { completed: true, registered: true });
    this.anonymous = false;
    this.anonymousObs = observableValue("anonymous", false);
  }
  acceptQuotas() {
  }
  clearQuotas() {
  }
  markAnonymousRateLimited() {
  }
  markSetupCompleted() {
  }
  setForceHidden(_hidden) {
  }
  async update(_token) {
  }
}
class MockDefaultAccountService {
  constructor() {
    this.onDidChangeDefaultAccount = Event.None;
    this.onDidChangePolicyData = Event.None;
    this.policyData = null;
    this.currentDefaultAccount = MOCK_ACCOUNT;
    this.copilotTokenInfo = null;
    this.onDidChangeCopilotTokenInfo = Event.None;
    this.managedSettingsFetchStatus = null;
    this.managedSettingsFetchedAt = null;
    this.managedSettingsRawResponse = null;
  }
  async getDefaultAccount() {
    return MOCK_ACCOUNT;
  }
  getDefaultAccountAuthenticationProvider() {
    return MOCK_ACCOUNT.authenticationProvider;
  }
  resolveGitHubUrl(path) {
    return `https://github.com/${path}`;
  }
  setDefaultAccountProvider() {
  }
  async refresh() {
    return MOCK_ACCOUNT;
  }
  async signIn() {
    return MOCK_ACCOUNT;
  }
  async signOut() {
  }
}
const EXISTING_MOCK_FILES = /* @__PURE__ */ new Set(["/mock-repo/src/index.ts", "/mock-repo/src/utils.ts", "/mock-repo/package.json", "/mock-repo/README.md"]);
function emitFileEdits(fileEdits, progress) {
  for (const edit of fileEdits) {
    const isExistingFile = EXISTING_MOCK_FILES.has(edit.uri.path);
    const range = isExistingFile ? { startLineNumber: 1, startColumn: 1, endLineNumber: 99999, endColumn: 1 } : { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
    console.log(`[Sessions Web Test] Emitting textEdit for ${edit.uri.toString()} (existing: ${isExistingFile}, range: ${range.startLineNumber}-${range.endLineNumber})`);
    progress([{
      kind: "textEdit",
      uri: edit.uri,
      edits: [{ range, text: edit.content }],
      done: true
    }]);
  }
}
function getMockResponseWithEdits(message) {
  if (/build|compile|create/i.test(message)) {
    return {
      text: "I'll help you build the project. Here are the changes:",
      fileEdits: [
        {
          // Modify existing file — adds build import + call
          uri: URI.from({ scheme: "mock-fs", authority: "mock-repo", path: "/mock-repo/src/index.ts" }),
          content: 'import { build } from "./build";\n\nexport function main() {\n	console.log("Hello from mock repo");\n	build();\n}\n'
        },
        {
          // New file — creates build script
          uri: URI.from({ scheme: "mock-fs", authority: "mock-repo", path: "/mock-repo/src/build.ts" }),
          content: 'export async function build() {\n	console.log("Building...");\n	console.log("Build complete!");\n}\n'
        },
        {
          // Modify existing file — adds build script
          uri: URI.from({ scheme: "mock-fs", authority: "mock-repo", path: "/mock-repo/package.json" }),
          content: '{\n	"name": "mock-repo",\n	"version": "1.0.0",\n	"scripts": {\n		"build": "node src/build.ts"\n	}\n}\n'
        }
      ]
    };
  }
  if (/fix|bug/i.test(message)) {
    return {
      text: "I found the issue and applied the fix. The input validation has been added.",
      fileEdits: [
        {
          // Modify existing file — adds input validation
          uri: URI.from({ scheme: "mock-fs", authority: "mock-repo", path: "/mock-repo/src/utils.ts" }),
          content: 'export function add(a: number, b: number): number {\n	if (typeof a !== "number" || typeof b !== "number") {\n		throw new TypeError("Both arguments must be numbers");\n	}\n	return a + b;\n}\n'
        }
      ]
    };
  }
  if (/explain|describe/i.test(message)) {
    return {
      text: "This project has a simple structure with a main entry point and utility functions."
    };
  }
  return {
    text: "I understand your request. Let me work on that.\n\n1. Review the codebase\n2. Make changes\n3. Run tests"
  };
}
let MockChatAgentContribution = class extends Disposable {
  constructor(chatAgentService, chatSessionsService, terminalService) {
    super();
    this.chatAgentService = chatAgentService;
    this.chatSessionsService = chatSessionsService;
    this.terminalService = terminalService;
    this._sessionItems = [];
    this._itemsChangedEmitter = new Emitter();
    this._sessionHistory = /* @__PURE__ */ new Map();
    this._worktreeCounter = 0;
    this._register(this._itemsChangedEmitter);
    this.registerMockAgents();
    this.registerMockSessionProvider();
    this.registerMockTerminalBackend();
  }
  /**
   * Track a session for sidebar display and history re-opening.
   *
   * Populates `IChatSessionItem.changes` with file change metadata so the
   * ChangesViewPane can render them for background (copilotcli) sessions.
   * Background sessions read changes from `IAgentSessionsService.model`
   * which flows through from `IChatSessionItemController.items`.
   */
  addSessionItem(resource, message, responseText, fileEdits) {
    const key = resource.toString();
    const now = Date.now();
    if (!this._sessionHistory.has(key)) {
      this._sessionHistory.set(key, []);
    }
    this._sessionHistory.get(key).push(
      { type: "request", prompt: message, participant: "copilot" },
      { type: "response", parts: [{ kind: "markdownContent", content: { value: responseText, isTrusted: false, supportThemeIcons: false, supportHtml: false } }], participant: "copilot" }
    );
    const changes = fileEdits?.map((edit) => ({
      modifiedUri: edit.uri,
      insertions: edit.content.split("\n").length,
      deletions: EXISTING_MOCK_FILES.has(edit.uri.path) ? 1 : 0
    }));
    const existingIndex = this._sessionItems.findIndex((s) => isEqual(s.resource, resource));
    let addedOrUpdated = existingIndex !== -1 ? { ...this._sessionItems[existingIndex] } : void 0;
    if (addedOrUpdated) {
      addedOrUpdated.timing = { ...addedOrUpdated.timing, lastRequestStarted: now, lastRequestEnded: now };
      if (changes) {
        addedOrUpdated.changes = changes;
      }
      this._sessionItems[existingIndex] = addedOrUpdated;
    } else {
      addedOrUpdated = {
        resource,
        label: message.slice(0, 50) || "Mock Session",
        status: ChatSessionStatus.Completed,
        timing: { created: now, lastRequestStarted: now, lastRequestEnded: now },
        metadata: { worktreePath: `/mock-worktrees/session-${++this._worktreeCounter}` },
        ...changes ? { changes } : {}
      };
      this._sessionItems.push(addedOrUpdated);
    }
    if (addedOrUpdated) {
      this._itemsChangedEmitter.fire({ addedOrUpdated: [addedOrUpdated] });
    }
  }
  registerMockAgents() {
    const agentIds = ["copilotcli", "copilot-cloud-agent"];
    const extensionId = new ExtensionIdentifier("vscode.sessions-e2e-mock");
    const self = this;
    for (const agentId of agentIds) {
      const agentData = {
        id: agentId,
        name: agentId,
        fullName: `Mock Agent (${agentId})`,
        description: "Mock chat agent for E2E testing",
        extensionId,
        extensionVersion: "0.0.1",
        extensionPublisherId: "vscode",
        extensionDisplayName: "Sessions E2E Mock",
        isDefault: agentId === "copilotcli",
        metadata: {},
        slashCommands: [],
        locations: [ChatAgentLocation.Chat],
        modes: [ChatModeKind.Agent],
        disambiguation: []
      };
      const agentImpl = {
        async invoke(request, progress, _history, _token) {
          console.log(`[Sessions Web Test] Mock agent "${agentId}" invoked: "${request.message}"`);
          const response = getMockResponseWithEdits(request.message);
          progress([{
            kind: "markdownContent",
            content: { value: response.text, isTrusted: false, supportThemeIcons: false, supportHtml: false }
          }]);
          if (response.fileEdits) {
            emitFileEdits(response.fileEdits, progress);
            console.log(`[Sessions Web Test] Emitted ${response.fileEdits.length} file edits OK`);
          }
          self.addSessionItem(request.sessionResource, request.message, response.text, response.fileEdits);
          return { metadata: { mock: true } };
        }
      };
      try {
        this._register(this.chatAgentService.registerDynamicAgent(agentData, agentImpl));
        console.log(`[Sessions Web Test] Registered mock agent: ${agentId}`);
      } catch (err) {
        console.warn(`[Sessions Web Test] Failed to register agent ${agentId}:`, err);
      }
    }
  }
  registerMockSessionProvider() {
    const schemes = ["copilotcli", "copilot-cloud-agent"];
    const self = this;
    for (const scheme of schemes) {
      try {
        this._register(this.chatSessionsService.registerChatSessionContentProvider(scheme, {
          async provideChatSessionContent(sessionResource, _token) {
            const key = sessionResource.toString();
            if (!self._sessionHistory.has(key)) {
              self._sessionHistory.set(key, []);
            }
            const history = self._sessionHistory.get(key);
            console.log(`[Sessions Web Test] Opening session ${key} (${history.length} history items)`);
            const disposeEmitter = new Emitter();
            const isComplete = observableValue("isComplete", history.length > 0);
            return {
              sessionResource,
              history,
              isCompleteObs: isComplete,
              onWillDispose: disposeEmitter.event,
              async requestHandler(request, progress, _history, _token2) {
                console.log(`[Sessions Web Test] Session request: "${request.message}"`);
                const response = getMockResponseWithEdits(request.message);
                progress([{
                  kind: "markdownContent",
                  content: { value: response.text, isTrusted: false, supportThemeIcons: false, supportHtml: false }
                }]);
                if (response.fileEdits) {
                  emitFileEdits(response.fileEdits, progress);
                }
                isComplete.set(true, void 0);
              },
              dispose() {
                disposeEmitter.fire();
                disposeEmitter.dispose();
              }
            };
          }
        }));
        const controllerItems = scheme === "copilotcli" ? this._sessionItems : [];
        this._register(this.chatSessionsService.registerChatSessionItemController(scheme, {
          onDidChangeChatSessionItems: this._itemsChangedEmitter.event,
          get items() {
            return controllerItems;
          },
          async refresh() {
          }
        }));
        console.log(`[Sessions Web Test] Registered session provider for scheme: ${scheme}`);
      } catch (err) {
        console.warn(`[Sessions Web Test] Failed to register session provider for ${scheme}:`, err);
      }
    }
  }
  registerMockTerminalBackend() {
    const terminalService = this.terminalService;
    const backend = this.createMockTerminalBackend();
    Registry.as(TerminalExtensions.Backend).registerTerminalBackend(backend);
    terminalService.registerProcessSupport(true);
    console.log("[Sessions Web Test] Registered mock terminal backend");
  }
  createMockTerminalBackend() {
    return {
      remoteAuthority: void 0,
      isVirtualProcess: false,
      isResponsive: true,
      whenReady: Promise.resolve(),
      setReady: () => {
      },
      onDidRequestDetach: Event.None,
      attachToProcess: async () => {
        throw new Error("Not supported");
      },
      attachToRevivedProcess: async () => {
        throw new Error("Not supported");
      },
      listProcesses: async () => [],
      getProfiles: async () => [],
      getDefaultProfile: async () => void 0,
      getDefaultSystemShell: async () => "/bin/mock-shell",
      getShellEnvironment: async () => ({}),
      setTerminalLayoutInfo: async () => {
      },
      getTerminalLayoutInfo: async () => void 0,
      reduceConnectionGraceTime: () => {
      },
      requestDetachInstance: () => {
      },
      acceptDetachInstanceReply: () => {
      },
      persistTerminalState: () => {
      },
      createProcess: async (_shellLaunchConfig, _cwd, _cols, _rows, _unicodeVersion, _env, _options, _shouldPersist) => {
        const onProcessData = new Emitter();
        const onProcessReady = new Emitter();
        const onProcessExit = new Emitter();
        const onDidChangeHasChildProcesses = new Emitter();
        const onDidChangeProperty = new Emitter();
        const rawCwd = _cwd || _shellLaunchConfig.cwd;
        const cwd = !rawCwd ? "/" : typeof rawCwd === "string" ? rawCwd : rawCwd.path;
        console.log(`[Sessions Web Test] Mock terminal createProcess cwd: '${cwd}' (raw _cwd: '${_cwd}', slc.cwd: '${_shellLaunchConfig.cwd}')`);
        setTimeout(() => {
          onProcessReady.fire({ pid: 1, cwd, windowsPty: void 0 });
        }, 0);
        return {
          id: 0,
          shouldPersist: false,
          onProcessData: onProcessData.event,
          onProcessReady: onProcessReady.event,
          onDidChangeHasChildProcesses: onDidChangeHasChildProcesses.event,
          onDidChangeProperty: onDidChangeProperty.event,
          onProcessExit: onProcessExit.event,
          start: async () => void 0,
          shutdown: async () => {
          },
          input: async () => {
          },
          resize: () => {
          },
          clearBuffer: () => {
          },
          acknowledgeDataEvent: () => {
          },
          setUnicodeVersion: async () => {
          },
          getInitialCwd: async () => cwd,
          getCwd: async () => cwd,
          getLatency: async () => [],
          processBinary: async () => {
          },
          refreshProperty: async (property) => {
            throw new Error(`Not supported: ${property}`);
          },
          updateProperty: async () => {
          },
          clearUnrespondedRequest: () => {
          }
        };
      },
      getWslPath: async (original, _direction) => original,
      getEnvironment: async () => ({}),
      getLatency: async () => [],
      getPerformanceMarks: () => [],
      updateTitle: async () => {
      },
      updateIcon: async () => {
      },
      setNextCommandId: async () => {
      },
      restartPtyHost: () => {
      },
      installAutoReply: async () => {
      },
      uninstallAllAutoReplies: async () => {
      },
      onPtyHostUnresponsive: Event.None,
      onPtyHostResponsive: Event.None,
      onPtyHostRestart: Event.None,
      onPtyHostConnected: Event.None
    };
  }
};
MockChatAgentContribution.ID = "sessions.test.mockChatAgent";
MockChatAgentContribution = __decorateClass([
  __decorateParam(0, IChatAgentService),
  __decorateParam(1, IChatSessionsService),
  __decorateParam(2, ITerminalService)
], MockChatAgentContribution);
registerWorkbenchContribution2(MockChatAgentContribution.ID, MockChatAgentContribution, WorkbenchPhase.BlockStartup);
class MockGitService {
  constructor() {
    this.repositories = [];
  }
  setDelegate(_delegate) {
    return Disposable.None;
  }
  async openRepository(_uri) {
    return void 0;
  }
}
class TestSessionsBrowserMain extends SessionsBrowserMain {
  constructor() {
    super(...arguments);
    this._savedDescriptors = [];
  }
  async open() {
    const registry = getSingletonServiceDescriptors();
    const overrides = [
      [IChatEntitlementService, new SyncDescriptor(MockChatEntitlementService)],
      [IDefaultAccountService, new SyncDescriptor(MockDefaultAccountService)],
      [IGitService, new SyncDescriptor(MockGitService)]
    ];
    for (const [serviceId, mockDescriptor] of overrides) {
      const idx = registry.findIndex(([id]) => id === serviceId);
      if (idx !== -1) {
        this._savedDescriptors.push([serviceId, registry[idx][1]]);
        registry[idx] = [serviceId, mockDescriptor];
      } else {
        registry.push([serviceId, mockDescriptor]);
      }
    }
    const workbench = await super.open();
    for (const [serviceId, original] of this._savedDescriptors) {
      const idx = registry.findIndex(([id]) => id === serviceId);
      if (idx !== -1) {
        registry[idx] = [serviceId, original];
      }
    }
    return workbench;
  }
  preseedFolder(storageService) {
    const mockFolderUri = URI.from({ scheme: "mock-fs", authority: "mock-repo", path: "/mock-repo" });
    const providerId = "default-copilot";
    const recentWorkspaces = JSON.stringify([{ uri: mockFolderUri.toJSON(), providerId, checked: true }]);
    storageService.store("sessions.recentlyPickedWorkspaces", recentWorkspaces, StorageScope.PROFILE, StorageTarget.MACHINE);
    console.log(`[Sessions Web Test] Pre-seeded folder: ${mockFolderUri.toString()}`);
  }
  createWorkbench(domElement, serviceCollection, logService) {
    registerMockFileSystemProvider(serviceCollection);
    this.preseedFolder(serviceCollection.get(IStorageService));
    return new SessionsWorkbench(domElement, void 0, serviceCollection, logService);
  }
}
export {
  TestSessionsBrowserMain
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL3Rlc3Qvd2ViLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJNYWluV29ya2JlbmNoIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvd2ViLm1haW4uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoIGFzIFNlc3Npb25zV29ya2JlbmNoIH0gZnJvbSAnLi4vYnJvd3Nlci93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNCcm93c2VyTWFpbiB9IGZyb20gJy4uL2Jyb3dzZXIvd2ViLm1haW4uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBJQ2hhdFNlbnRpbWVudCB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50LCBJRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBJQ29waWxvdFRva2VuSW5mbywgSVBvbGljeURhdGEgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSwgSUNoYXRBZ2VudERhdGEsIElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbiB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRQcm9ncmVzcyB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBJQ2hhdFNlc3Npb25JdGVtLCBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlLCBDaGF0U2Vzc2lvblN0YXR1cywgSUNoYXRTZXNzaW9uSGlzdG9yeUl0ZW0sIElDaGF0U2Vzc2lvbkl0ZW1zRGVsdGEgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElHaXRTZXJ2aWNlLCBJR2l0RXh0ZW5zaW9uRGVsZWdhdGUsIElHaXRSZXBvc2l0b3J5IH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvZ2l0L2NvbW1vbi9naXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxCYWNrZW5kLCBJVGVybWluYWxCYWNrZW5kUmVnaXN0cnksIElQcm9jZXNzUmVhZHlFdmVudCwgSVByb2Nlc3NQcm9wZXJ0eSwgUHJvY2Vzc1Byb3BlcnR5VHlwZSwgVGVybWluYWxFeHRlbnNpb25zLCBJVGVybWluYWxQcm9jZXNzT3B0aW9ucywgSVNoZWxsTGF1bmNoQ29uZmlnIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElQcm9jZXNzRW52aXJvbm1lbnQgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IGdldFNpbmdsZXRvblNlcnZpY2VEZXNjcmlwdG9ycyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2ggfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvYnJvd3Nlci93ZWIuYXBpLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuXG4vKipcbiAqIE1vY2sgZmlsZXMgcHJlLXNlZWRlZCBpbiB0aGUgaW4tbWVtb3J5IGZpbGUgc3lzdGVtLiBUaGVzZSBtYXRjaCB0aGVcbiAqIHBhdGhzIGluIEVYSVNUSU5HX01PQ0tfRklMRVMgYW5kIGFyZSB1c2VkIGJ5IHRoZSBDaGF0RWRpdGluZ1NlcnZpY2VcbiAqIHRvIGNvbXB1dGUgYmVmb3JlL2FmdGVyIGRpZmZzLlxuICovXG5jb25zdCBNT0NLX0ZTX0ZJTEVTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHQnL21vY2stcmVwby9zcmMvaW5kZXgudHMnOiAnZXhwb3J0IGZ1bmN0aW9uIG1haW4oKSB7XFxuXFx0Y29uc29sZS5sb2coXCJIZWxsbyBmcm9tIG1vY2sgcmVwb1wiKTtcXG59XFxuJyxcblx0Jy9tb2NrLXJlcG8vc3JjL3V0aWxzLnRzJzogJ2V4cG9ydCBmdW5jdGlvbiBhZGQoYTogbnVtYmVyLCBiOiBudW1iZXIpOiBudW1iZXIge1xcblxcdHJldHVybiBhICsgYjtcXG59XFxuJyxcblx0Jy9tb2NrLXJlcG8vcGFja2FnZS5qc29uJzogJ3tcXG5cXHRcIm5hbWVcIjogXCJtb2NrLXJlcG9cIixcXG5cXHRcInZlcnNpb25cIjogXCIxLjAuMFwiXFxufVxcbicsXG5cdCcvbW9jay1yZXBvL1JFQURNRS5tZCc6ICcjIE1vY2sgUmVwb3NpdG9yeVxcblxcblRoaXMgaXMgYSBtb2NrIHJlcG9zaXRvcnkgZm9yIEUyRSB0ZXN0aW5nLlxcbicsXG59O1xuXG4vKipcbiAqIFJlZ2lzdGVyIHRoZSBtb2NrLWZzOi8vIGZpbGUgc3lzdGVtIHByb3ZpZGVyIGRpcmVjdGx5IGluIHRoZSB3b3JrYmVuY2hcbiAqIHNvIGl0IGlzIGF2YWlsYWJsZSBpbW1lZGlhdGVseSBhdCBzdGFydHVwIFx1MjAxNCBiZWZvcmUgYW55IHNlcnZpY2VcbiAqIChTbmlwcGV0c1NlcnZpY2UsIFByb21wdEZpbGVzTG9jYXRvciwgTUNQLCBldGMuKSB0cmllcyB0byByZXNvbHZlXG4gKiBmaWxlcyBpbnNpZGUgdGhlIHdvcmtzcGFjZSBmb2xkZXIuXG4gKi9cbmZ1bmN0aW9uIHJlZ2lzdGVyTW9ja0ZpbGVTeXN0ZW1Qcm92aWRlcihzZXJ2aWNlQ29sbGVjdGlvbjogU2VydmljZUNvbGxlY3Rpb24pOiB2b2lkIHtcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBzZXJ2aWNlQ29sbGVjdGlvbi5nZXQoSUZpbGVTZXJ2aWNlKSBhcyBJRmlsZVNlcnZpY2U7XG5cdGNvbnN0IHByb3ZpZGVyID0gbmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCk7XG5cdGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ21vY2stZnMnLCBwcm92aWRlcik7XG5cblx0Ly8gUHJlLXBvcHVsYXRlIHRoZSBmaWxlcyBzbyBDaGF0RWRpdGluZ1NlcnZpY2UgY2FuIHJlYWQgb3JpZ2luYWxzIGZvciBkaWZmc1xuXHRmb3IgKGNvbnN0IFtmaWxlUGF0aCwgY29udGVudF0gb2YgT2JqZWN0LmVudHJpZXMoTU9DS19GU19GSUxFUykpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ21vY2stZnMnLCBhdXRob3JpdHk6ICdtb2NrLXJlcG8nLCBwYXRoOiBmaWxlUGF0aCB9KTtcblx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0fVxuXHRjb25zb2xlLmxvZygnW1Nlc3Npb25zIFdlYiBUZXN0XSBSZWdpc3RlcmVkIG1vY2stZnM6Ly8gcHJvdmlkZXIgd2l0aCBwcmUtc2VlZGVkIGZpbGVzJyk7XG59XG5cbmNvbnN0IE1PQ0tfQUNDT1VOVDogSURlZmF1bHRBY2NvdW50ID0ge1xuXHRhdXRoZW50aWNhdGlvblByb3ZpZGVyOiB7IGlkOiAnZ2l0aHViJywgbmFtZTogJ0dpdEh1YiAoTW9jayknLCBlbnRlcnByaXNlOiBmYWxzZSB9LFxuXHRhY2NvdW50TmFtZTogJ2UyZS10ZXN0LXVzZXInLFxuXHRzZXNzaW9uSWQ6ICdtb2NrLXNlc3Npb24tMScsXG5cdGVudGVycHJpc2U6IGZhbHNlLFxufTtcblxuLyoqXG4gKiBNb2NrIGltcGxlbWVudGF0aW9uIG9mIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHRoYXQgbWFrZXMgdGhlIFNlc3Npb25zXG4gKiB3aW5kb3cgdGhpbmsgdGhlIHVzZXIgaXMgc2lnbmVkIGluIHdpdGggYSBGcmVlIENvcGlsb3QgcGxhbi5cbiAqL1xuY2xhc3MgTW9ja0NoYXRFbnRpdGxlbWVudFNlcnZpY2UgaW1wbGVtZW50cyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFbnRpdGxlbWVudCA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUXVvdGFFeGNlZWRlZCA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVVzYWdlQmFzZWRCaWxsaW5nID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZW50aW1lbnQgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFub255bW91cyA9IEV2ZW50Lk5vbmU7XG5cblx0cmVhZG9ubHkgZW50aXRsZW1lbnQgPSBDaGF0RW50aXRsZW1lbnQuRnJlZTtcblx0cmVhZG9ubHkgZW50aXRsZW1lbnRPYnM6IElPYnNlcnZhYmxlPENoYXRFbnRpdGxlbWVudD4gPSBvYnNlcnZhYmxlVmFsdWUoJ2VudGl0bGVtZW50JywgQ2hhdEVudGl0bGVtZW50LkZyZWUpO1xuXG5cdHJlYWRvbmx5IGNsaWVudEJ5b2tFbmFibGVkID0gZmFsc2U7XG5cdHJlYWRvbmx5IGhhc0J5b2tNb2RlbHMgPSBmYWxzZTtcblx0cmVhZG9ubHkgb3JnYW5pc2F0aW9uczogc3RyaW5nW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzSW50ZXJuYWwgPSBmYWxzZTtcblx0cmVhZG9ubHkgc2t1ID0gJ2ZyZWUnO1xuXHRyZWFkb25seSBjb3BpbG90VHJhY2tpbmdJZCA9ICdtb2NrLXRyYWNraW5nLWlkJztcblxuXHRyZWFkb25seSBxdW90YXMgPSB7fTtcblxuXHRyZWFkb25seSBzZW50aW1lbnQ6IElDaGF0U2VudGltZW50ID0geyBjb21wbGV0ZWQ6IHRydWUsIHJlZ2lzdGVyZWQ6IHRydWUgfTtcblx0cmVhZG9ubHkgc2VudGltZW50T2JzOiBJT2JzZXJ2YWJsZTxJQ2hhdFNlbnRpbWVudD4gPSBvYnNlcnZhYmxlVmFsdWUoJ3NlbnRpbWVudCcsIHsgY29tcGxldGVkOiB0cnVlLCByZWdpc3RlcmVkOiB0cnVlIH0pO1xuXG5cdHJlYWRvbmx5IGFub255bW91cyA9IGZhbHNlO1xuXHRyZWFkb25seSBhbm9ueW1vdXNPYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKCdhbm9ueW1vdXMnLCBmYWxzZSk7XG5cblx0YWNjZXB0UXVvdGFzKCk6IHZvaWQgeyB9XG5cdGNsZWFyUXVvdGFzKCk6IHZvaWQgeyB9XG5cdG1hcmtBbm9ueW1vdXNSYXRlTGltaXRlZCgpOiB2b2lkIHsgfVxuXHRtYXJrU2V0dXBDb21wbGV0ZWQoKTogdm9pZCB7IH1cblx0c2V0Rm9yY2VIaWRkZW4oX2hpZGRlbjogYm9vbGVhbik6IHZvaWQgeyB9XG5cdGFzeW5jIHVwZGF0ZShfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7IH1cbn1cblxuLyoqXG4gKiBNb2NrIGltcGxlbWVudGF0aW9uIG9mIElEZWZhdWx0QWNjb3VudFNlcnZpY2UgdGhhdCByZXR1cm5zIGEgZmFrZVxuICogc2lnbmVkLWluIGFjY291bnQgc28gdGhlIFwiU2lnbiBJblwiIGJ1dHRvbiBpbiB0aGUgc2lkZWJhciBpcyBoaWRkZW4uXG4gKi9cbmNsYXNzIE1vY2tEZWZhdWx0QWNjb3VudFNlcnZpY2UgaW1wbGVtZW50cyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZURlZmF1bHRBY2NvdW50ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQb2xpY3lEYXRhID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgcG9saWN5RGF0YTogSVBvbGljeURhdGEgfCBudWxsID0gbnVsbDtcblx0cmVhZG9ubHkgY3VycmVudERlZmF1bHRBY2NvdW50OiBJRGVmYXVsdEFjY291bnQgfCBudWxsID0gTU9DS19BQ0NPVU5UO1xuXHRyZWFkb25seSBjb3BpbG90VG9rZW5JbmZvOiBJQ29waWxvdFRva2VuSW5mbyB8IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvcGlsb3RUb2tlbkluZm8gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBtYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1czogbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IG1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdDogbnVsbCA9IG51bGw7XG5cdHJlYWRvbmx5IG1hbmFnZWRTZXR0aW5nc1Jhd1Jlc3BvbnNlOiB1bmtub3duID0gbnVsbDtcblxuXHRhc3luYyBnZXREZWZhdWx0QWNjb3VudCgpOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudCB8IG51bGw+IHsgcmV0dXJuIE1PQ0tfQUNDT1VOVDsgfVxuXHRnZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTogSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlciB7IHJldHVybiBNT0NLX0FDQ09VTlQuYXV0aGVudGljYXRpb25Qcm92aWRlcjsgfVxuXHRyZXNvbHZlR2l0SHViVXJsKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7IHJldHVybiBgaHR0cHM6Ly9naXRodWIuY29tLyR7cGF0aH1gOyB9XG5cdHNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIoKTogdm9pZCB7IH1cblx0YXN5bmMgcmVmcmVzaCgpOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudCB8IG51bGw+IHsgcmV0dXJuIE1PQ0tfQUNDT1VOVDsgfVxuXHRhc3luYyBzaWduSW4oKTogUHJvbWlzZTxJRGVmYXVsdEFjY291bnQgfCBudWxsPiB7IHJldHVybiBNT0NLX0FDQ09VTlQ7IH1cblx0YXN5bmMgc2lnbk91dCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIE1vY2sgY2hhdCByZXNwb25zZXMgYW5kIGZpbGUgY2hhbmdlc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogUGF0aHMgdGhhdCBleGlzdCBpbiB0aGUgbW9jay1mcyBmaWxlIHN0b3JlIHByZS1zZWVkZWQgYnkgdGhlIG1vY2sgZXh0ZW5zaW9uLlxuICogVXNlZCB0byBkZXRlcm1pbmUgd2hldGhlciBhIHRleHRFZGl0IHNob3VsZCByZXBsYWNlIGZpbGUgY29udGVudCAoZXhpc3RpbmcpXG4gKiBvciBpbnNlcnQgaW50byBhbiBlbXB0eSBidWZmZXIgKG5ldyBmaWxlKSwgc28gdGhlIHJlYWwgQ2hhdEVkaXRpbmdTZXJ2aWNlXG4gKiBjb21wdXRlcyBtZWFuaW5nZnVsIGJlZm9yZS9hZnRlciBkaWZmcy5cbiAqL1xuY29uc3QgRVhJU1RJTkdfTU9DS19GSUxFUyA9IG5ldyBTZXQoWycvbW9jay1yZXBvL3NyYy9pbmRleC50cycsICcvbW9jay1yZXBvL3NyYy91dGlscy50cycsICcvbW9jay1yZXBvL3BhY2thZ2UuanNvbicsICcvbW9jay1yZXBvL1JFQURNRS5tZCddKTtcblxuaW50ZXJmYWNlIE1vY2tGaWxlRWRpdCB7XG5cdHVyaTogVVJJO1xuXHRjb250ZW50OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBNb2NrUmVzcG9uc2Uge1xuXHR0ZXh0OiBzdHJpbmc7XG5cdGZpbGVFZGl0cz86IE1vY2tGaWxlRWRpdFtdO1xufVxuXG4vKipcbiAqIEVtaXQgdGV4dEVkaXQgcHJvZ3Jlc3MgaXRlbXMgZm9yIGVhY2ggZmlsZSBlZGl0IHVzaW5nIHRoZSByZWFsIENoYXRNb2RlbFxuICogcGlwZWxpbmUuIEV4aXN0aW5nIGZpbGVzIHVzZSBhIGZ1bGwtZmlsZSByZXBsYWNlbWVudCByYW5nZSBzbyB0aGUgcmVhbFxuICogQ2hhdEVkaXRpbmdTZXJ2aWNlIGNvbXB1dGVzIGFuIGFjY3VyYXRlIGRpZmYuIE5ldyBmaWxlcyB1c2UgYW5cbiAqIGluc2VydC1hdC1iZWdpbm5pbmcgcmFuZ2UuXG4gKi9cbmZ1bmN0aW9uIGVtaXRGaWxlRWRpdHMoZmlsZUVkaXRzOiBNb2NrRmlsZUVkaXRbXSwgcHJvZ3Jlc3M6IChwYXJ0czogSUNoYXRQcm9ncmVzc1tdKSA9PiB2b2lkKTogdm9pZCB7XG5cdGZvciAoY29uc3QgZWRpdCBvZiBmaWxlRWRpdHMpIHtcblx0XHRjb25zdCBpc0V4aXN0aW5nRmlsZSA9IEVYSVNUSU5HX01PQ0tfRklMRVMuaGFzKGVkaXQudXJpLnBhdGgpO1xuXHRcdGNvbnN0IHJhbmdlID0gaXNFeGlzdGluZ0ZpbGVcblx0XHRcdD8geyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiA5OTk5OSwgZW5kQ29sdW1uOiAxIH1cblx0XHRcdDogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDEgfTtcblx0XHRjb25zb2xlLmxvZyhgW1Nlc3Npb25zIFdlYiBUZXN0XSBFbWl0dGluZyB0ZXh0RWRpdCBmb3IgJHtlZGl0LnVyaS50b1N0cmluZygpfSAoZXhpc3Rpbmc6ICR7aXNFeGlzdGluZ0ZpbGV9LCByYW5nZTogJHtyYW5nZS5zdGFydExpbmVOdW1iZXJ9LSR7cmFuZ2UuZW5kTGluZU51bWJlcn0pYCk7XG5cdFx0cHJvZ3Jlc3MoW3tcblx0XHRcdGtpbmQ6ICd0ZXh0RWRpdCcsXG5cdFx0XHR1cmk6IGVkaXQudXJpLFxuXHRcdFx0ZWRpdHM6IFt7IHJhbmdlLCB0ZXh0OiBlZGl0LmNvbnRlbnQgfV0sXG5cdFx0XHRkb25lOiB0cnVlLFxuXHRcdH1dKTtcblx0fVxufVxuXG4vKipcbiAqIFJldHVybiBjYW5uZWQgcmVzcG9uc2UgdGV4dCBhbmQgZmlsZSBlZGl0cyBrZXllZCBieSB1c2VyIG1lc3NhZ2Uga2V5d29yZHMuXG4gKlxuICogRmlsZSBlZGl0cyB0YXJnZXQgVVJJcyBpbiB0aGUgbW9jay1mczovLyBmaWxlc3lzdGVtLiBFZGl0cyBmb3IgZXhpc3RpbmdcbiAqIGZpbGVzIHByb2R1Y2UgcmVhbCBkaWZmcyAob3JpZ2luYWwgY29udGVudCBmcm9tIG1vY2stZnMgXHUyMTkyIG5ldyBjb250ZW50IGhlcmUpLlxuICogRWRpdHMgZm9yIG5ldyBmaWxlcyBwcm9kdWNlIFwiZmlsZSBjcmVhdGVkXCIgZW50cmllcy5cbiAqL1xuZnVuY3Rpb24gZ2V0TW9ja1Jlc3BvbnNlV2l0aEVkaXRzKG1lc3NhZ2U6IHN0cmluZyk6IE1vY2tSZXNwb25zZSB7XG5cdGlmICgvYnVpbGR8Y29tcGlsZXxjcmVhdGUvaS50ZXN0KG1lc3NhZ2UpKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRleHQ6ICdJXFwnbGwgaGVscCB5b3UgYnVpbGQgdGhlIHByb2plY3QuIEhlcmUgYXJlIHRoZSBjaGFuZ2VzOicsXG5cdFx0XHRmaWxlRWRpdHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC8vIE1vZGlmeSBleGlzdGluZyBmaWxlIFx1MjAxNCBhZGRzIGJ1aWxkIGltcG9ydCArIGNhbGxcblx0XHRcdFx0XHR1cmk6IFVSSS5mcm9tKHsgc2NoZW1lOiAnbW9jay1mcycsIGF1dGhvcml0eTogJ21vY2stcmVwbycsIHBhdGg6ICcvbW9jay1yZXBvL3NyYy9pbmRleC50cycgfSksXG5cdFx0XHRcdFx0Y29udGVudDogJ2ltcG9ydCB7IGJ1aWxkIH0gZnJvbSBcIi4vYnVpbGRcIjtcXG5cXG5leHBvcnQgZnVuY3Rpb24gbWFpbigpIHtcXG5cXHRjb25zb2xlLmxvZyhcIkhlbGxvIGZyb20gbW9jayByZXBvXCIpO1xcblxcdGJ1aWxkKCk7XFxufVxcbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQvLyBOZXcgZmlsZSBcdTIwMTQgY3JlYXRlcyBidWlsZCBzY3JpcHRcblx0XHRcdFx0XHR1cmk6IFVSSS5mcm9tKHsgc2NoZW1lOiAnbW9jay1mcycsIGF1dGhvcml0eTogJ21vY2stcmVwbycsIHBhdGg6ICcvbW9jay1yZXBvL3NyYy9idWlsZC50cycgfSksXG5cdFx0XHRcdFx0Y29udGVudDogJ2V4cG9ydCBhc3luYyBmdW5jdGlvbiBidWlsZCgpIHtcXG5cXHRjb25zb2xlLmxvZyhcIkJ1aWxkaW5nLi4uXCIpO1xcblxcdGNvbnNvbGUubG9nKFwiQnVpbGQgY29tcGxldGUhXCIpO1xcbn1cXG4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ly8gTW9kaWZ5IGV4aXN0aW5nIGZpbGUgXHUyMDE0IGFkZHMgYnVpbGQgc2NyaXB0XG5cdFx0XHRcdFx0dXJpOiBVUkkuZnJvbSh7IHNjaGVtZTogJ21vY2stZnMnLCBhdXRob3JpdHk6ICdtb2NrLXJlcG8nLCBwYXRoOiAnL21vY2stcmVwby9wYWNrYWdlLmpzb24nIH0pLFxuXHRcdFx0XHRcdGNvbnRlbnQ6ICd7XFxuXFx0XCJuYW1lXCI6IFwibW9jay1yZXBvXCIsXFxuXFx0XCJ2ZXJzaW9uXCI6IFwiMS4wLjBcIixcXG5cXHRcInNjcmlwdHNcIjoge1xcblxcdFxcdFwiYnVpbGRcIjogXCJub2RlIHNyYy9idWlsZC50c1wiXFxuXFx0fVxcbn1cXG4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9O1xuXHR9XG5cdGlmICgvZml4fGJ1Zy9pLnRlc3QobWVzc2FnZSkpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dGV4dDogJ0kgZm91bmQgdGhlIGlzc3VlIGFuZCBhcHBsaWVkIHRoZSBmaXguIFRoZSBpbnB1dCB2YWxpZGF0aW9uIGhhcyBiZWVuIGFkZGVkLicsXG5cdFx0XHRmaWxlRWRpdHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC8vIE1vZGlmeSBleGlzdGluZyBmaWxlIFx1MjAxNCBhZGRzIGlucHV0IHZhbGlkYXRpb25cblx0XHRcdFx0XHR1cmk6IFVSSS5mcm9tKHsgc2NoZW1lOiAnbW9jay1mcycsIGF1dGhvcml0eTogJ21vY2stcmVwbycsIHBhdGg6ICcvbW9jay1yZXBvL3NyYy91dGlscy50cycgfSksXG5cdFx0XHRcdFx0Y29udGVudDogJ2V4cG9ydCBmdW5jdGlvbiBhZGQoYTogbnVtYmVyLCBiOiBudW1iZXIpOiBudW1iZXIge1xcblxcdGlmICh0eXBlb2YgYSAhPT0gXCJudW1iZXJcIiB8fCB0eXBlb2YgYiAhPT0gXCJudW1iZXJcIikge1xcblxcdFxcdHRocm93IG5ldyBUeXBlRXJyb3IoXCJCb3RoIGFyZ3VtZW50cyBtdXN0IGJlIG51bWJlcnNcIik7XFxuXFx0fVxcblxcdHJldHVybiBhICsgYjtcXG59XFxuJyxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fTtcblx0fVxuXHRpZiAoL2V4cGxhaW58ZGVzY3JpYmUvaS50ZXN0KG1lc3NhZ2UpKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRleHQ6ICdUaGlzIHByb2plY3QgaGFzIGEgc2ltcGxlIHN0cnVjdHVyZSB3aXRoIGEgbWFpbiBlbnRyeSBwb2ludCBhbmQgdXRpbGl0eSBmdW5jdGlvbnMuJyxcblx0XHR9O1xuXHR9XG5cdHJldHVybiB7XG5cdFx0dGV4dDogJ0kgdW5kZXJzdGFuZCB5b3VyIHJlcXVlc3QuIExldCBtZSB3b3JrIG9uIHRoYXQuXFxuXFxuMS4gUmV2aWV3IHRoZSBjb2RlYmFzZVxcbjIuIE1ha2UgY2hhbmdlc1xcbjMuIFJ1biB0ZXN0cycsXG5cdH07XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gV29ya2JlbmNoIGNvbnRyaWJ1dGlvbiBcdTIwMTQgcmVnaXN0ZXJzIG1vY2sgY2hhdCBhZ2VudCBhbmQgcHJlLXNlZWRzIGZvbGRlclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNsYXNzIE1vY2tDaGF0QWdlbnRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3Nlc3Npb25zLnRlc3QubW9ja0NoYXRBZ2VudCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkl0ZW1zOiBJQ2hhdFNlc3Npb25JdGVtW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfaXRlbXNDaGFuZ2VkRW1pdHRlciA9IG5ldyBFbWl0dGVyPElDaGF0U2Vzc2lvbkl0ZW1zRGVsdGE+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25IaXN0b3J5ID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtW10+KCk7XG5cdHByaXZhdGUgX3dvcmt0cmVlQ291bnRlciA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faXRlbXNDaGFuZ2VkRW1pdHRlcik7XG5cdFx0dGhpcy5yZWdpc3Rlck1vY2tBZ2VudHMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyTW9ja1Nlc3Npb25Qcm92aWRlcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJNb2NrVGVybWluYWxCYWNrZW5kKCk7XG5cdH1cblxuXHQvKipcblx0ICogVHJhY2sgYSBzZXNzaW9uIGZvciBzaWRlYmFyIGRpc3BsYXkgYW5kIGhpc3RvcnkgcmUtb3BlbmluZy5cblx0ICpcblx0ICogUG9wdWxhdGVzIGBJQ2hhdFNlc3Npb25JdGVtLmNoYW5nZXNgIHdpdGggZmlsZSBjaGFuZ2UgbWV0YWRhdGEgc28gdGhlXG5cdCAqIENoYW5nZXNWaWV3UGFuZSBjYW4gcmVuZGVyIHRoZW0gZm9yIGJhY2tncm91bmQgKGNvcGlsb3RjbGkpIHNlc3Npb25zLlxuXHQgKiBCYWNrZ3JvdW5kIHNlc3Npb25zIHJlYWQgY2hhbmdlcyBmcm9tIGBJQWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWxgXG5cdCAqIHdoaWNoIGZsb3dzIHRocm91Z2ggZnJvbSBgSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIuaXRlbXNgLlxuXHQgKi9cblx0cHJpdmF0ZSBhZGRTZXNzaW9uSXRlbShyZXNvdXJjZTogVVJJLCBtZXNzYWdlOiBzdHJpbmcsIHJlc3BvbnNlVGV4dDogc3RyaW5nLCBmaWxlRWRpdHM/OiBNb2NrRmlsZUVkaXRbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblxuXHRcdC8vIFN0b3JlIGNvbnZlcnNhdGlvbiBoaXN0b3J5IGZvciB0aGlzIHNlc3Npb24gKG5lZWRlZCBmb3IgcmUtb3BlbmluZylcblx0XHRpZiAoIXRoaXMuX3Nlc3Npb25IaXN0b3J5LmhhcyhrZXkpKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uSGlzdG9yeS5zZXQoa2V5LCBbXSk7XG5cdFx0fVxuXHRcdHRoaXMuX3Nlc3Npb25IaXN0b3J5LmdldChrZXkpIS5wdXNoKFxuXHRcdFx0eyB0eXBlOiAncmVxdWVzdCcsIHByb21wdDogbWVzc2FnZSwgcGFydGljaXBhbnQ6ICdjb3BpbG90JyB9LFxuXHRcdFx0eyB0eXBlOiAncmVzcG9uc2UnLCBwYXJ0czogW3sga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IHsgdmFsdWU6IHJlc3BvbnNlVGV4dCwgaXNUcnVzdGVkOiBmYWxzZSwgc3VwcG9ydFRoZW1lSWNvbnM6IGZhbHNlLCBzdXBwb3J0SHRtbDogZmFsc2UgfSB9XSwgcGFydGljaXBhbnQ6ICdjb3BpbG90JyB9LFxuXHRcdCk7XG5cblx0XHQvLyBCdWlsZCBmaWxlIGNoYW5nZXMgZm9yIHRoZSBzZXNzaW9uIGxpc3QgKHVzZWQgYnkgQ2hhbmdlc1ZpZXdQYW5lIGZvciBiYWNrZ3JvdW5kIHNlc3Npb25zKVxuXHRcdGNvbnN0IGNoYW5nZXM6IElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2VbXSB8IHVuZGVmaW5lZCA9IGZpbGVFZGl0cz8ubWFwKGVkaXQgPT4gKHtcblx0XHRcdG1vZGlmaWVkVXJpOiBlZGl0LnVyaSxcblx0XHRcdGluc2VydGlvbnM6IGVkaXQuY29udGVudC5zcGxpdCgnXFxuJykubGVuZ3RoLFxuXHRcdFx0ZGVsZXRpb25zOiBFWElTVElOR19NT0NLX0ZJTEVTLmhhcyhlZGl0LnVyaS5wYXRoKSA/IDEgOiAwLFxuXHRcdH0pKTtcblxuXHRcdC8vIEFkZCBvciB1cGRhdGUgc2Vzc2lvbiBpbiBsaXN0XG5cdFx0Y29uc3QgZXhpc3RpbmdJbmRleCA9IHRoaXMuX3Nlc3Npb25JdGVtcy5maW5kSW5kZXgocyA9PiBpc0VxdWFsKHMucmVzb3VyY2UsIHJlc291cmNlKSk7XG5cdFx0bGV0IGFkZGVkT3JVcGRhdGVkID0gZXhpc3RpbmdJbmRleCAhPT0gLTEgPyB7IC4uLnRoaXMuX3Nlc3Npb25JdGVtc1tleGlzdGluZ0luZGV4XSB9IDogdW5kZWZpbmVkO1xuXHRcdGlmIChhZGRlZE9yVXBkYXRlZCkge1xuXHRcdFx0YWRkZWRPclVwZGF0ZWQudGltaW5nID0geyAuLi5hZGRlZE9yVXBkYXRlZC50aW1pbmcsIGxhc3RSZXF1ZXN0U3RhcnRlZDogbm93LCBsYXN0UmVxdWVzdEVuZGVkOiBub3cgfTtcblx0XHRcdGlmIChjaGFuZ2VzKSB7XG5cdFx0XHRcdGFkZGVkT3JVcGRhdGVkLmNoYW5nZXMgPSBjaGFuZ2VzO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2Vzc2lvbkl0ZW1zW2V4aXN0aW5nSW5kZXhdID0gYWRkZWRPclVwZGF0ZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFkZGVkT3JVcGRhdGVkID0ge1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0bGFiZWw6IG1lc3NhZ2Uuc2xpY2UoMCwgNTApIHx8ICdNb2NrIFNlc3Npb24nLFxuXHRcdFx0XHRzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dGltaW5nOiB7IGNyZWF0ZWQ6IG5vdywgbGFzdFJlcXVlc3RTdGFydGVkOiBub3csIGxhc3RSZXF1ZXN0RW5kZWQ6IG5vdyB9LFxuXHRcdFx0XHRtZXRhZGF0YTogeyB3b3JrdHJlZVBhdGg6IGAvbW9jay13b3JrdHJlZXMvc2Vzc2lvbi0keysrdGhpcy5fd29ya3RyZWVDb3VudGVyfWAgfSxcblx0XHRcdFx0Li4uKGNoYW5nZXMgPyB7IGNoYW5nZXMgfSA6IHt9KSxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9zZXNzaW9uSXRlbXMucHVzaChhZGRlZE9yVXBkYXRlZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGFkZGVkT3JVcGRhdGVkKSB7XG5cdFx0XHR0aGlzLl9pdGVtc0NoYW5nZWRFbWl0dGVyLmZpcmUoeyBhZGRlZE9yVXBkYXRlZDogW2FkZGVkT3JVcGRhdGVkXSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTW9ja0FnZW50cygpOiB2b2lkIHtcblx0XHRjb25zdCBhZ2VudElkcyA9IFsnY29waWxvdGNsaScsICdjb3BpbG90LWNsb3VkLWFnZW50J107XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndnNjb2RlLnNlc3Npb25zLWUyZS1tb2NrJyk7XG5cdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cblx0XHRmb3IgKGNvbnN0IGFnZW50SWQgb2YgYWdlbnRJZHMpIHtcblx0XHRcdGNvbnN0IGFnZW50RGF0YTogSUNoYXRBZ2VudERhdGEgPSB7XG5cdFx0XHRcdGlkOiBhZ2VudElkLFxuXHRcdFx0XHRuYW1lOiBhZ2VudElkLFxuXHRcdFx0XHRmdWxsTmFtZTogYE1vY2sgQWdlbnQgKCR7YWdlbnRJZH0pYCxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdNb2NrIGNoYXQgYWdlbnQgZm9yIEUyRSB0ZXN0aW5nJyxcblx0XHRcdFx0ZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdGV4dGVuc2lvblZlcnNpb246ICcwLjAuMScsXG5cdFx0XHRcdGV4dGVuc2lvblB1Ymxpc2hlcklkOiAndnNjb2RlJyxcblx0XHRcdFx0ZXh0ZW5zaW9uRGlzcGxheU5hbWU6ICdTZXNzaW9ucyBFMkUgTW9jaycsXG5cdFx0XHRcdGlzRGVmYXVsdDogYWdlbnRJZCA9PT0gJ2NvcGlsb3RjbGknLFxuXHRcdFx0XHRtZXRhZGF0YToge30sXG5cdFx0XHRcdHNsYXNoQ29tbWFuZHM6IFtdLFxuXHRcdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdFx0bW9kZXM6IFtDaGF0TW9kZUtpbmQuQWdlbnRdLFxuXHRcdFx0XHRkaXNhbWJpZ3VhdGlvbjogW10sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBhZ2VudEltcGw6IElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbiA9IHtcblx0XHRcdFx0YXN5bmMgaW52b2tlKHJlcXVlc3QsIHByb2dyZXNzOiAocGFydHM6IElDaGF0UHJvZ3Jlc3NbXSkgPT4gdm9pZCwgX2hpc3RvcnksIF90b2tlbikge1xuXHRcdFx0XHRcdGNvbnNvbGUubG9nKGBbU2Vzc2lvbnMgV2ViIFRlc3RdIE1vY2sgYWdlbnQgXCIke2FnZW50SWR9XCIgaW52b2tlZDogXCIke3JlcXVlc3QubWVzc2FnZX1cImApO1xuXHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gZ2V0TW9ja1Jlc3BvbnNlV2l0aEVkaXRzKHJlcXVlc3QubWVzc2FnZSk7XG5cblx0XHRcdFx0XHQvLyBTdHJlYW0gdGhlIHRleHQgcmVzcG9uc2Vcblx0XHRcdFx0XHRwcm9ncmVzcyhbe1xuXHRcdFx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdFx0XHRjb250ZW50OiB7IHZhbHVlOiByZXNwb25zZS50ZXh0LCBpc1RydXN0ZWQ6IGZhbHNlLCBzdXBwb3J0VGhlbWVJY29uczogZmFsc2UsIHN1cHBvcnRIdG1sOiBmYWxzZSB9LFxuXHRcdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRcdC8vIEVtaXQgZmlsZSBlZGl0cyB0aHJvdWdoIHRoZSByZWFsIENoYXRNb2RlbCBwaXBlbGluZSBzb1xuXHRcdFx0XHRcdC8vIENoYXRFZGl0aW5nU2VydmljZSBjb21wdXRlcyBhY3R1YWwgZGlmZnNcblx0XHRcdFx0XHRpZiAocmVzcG9uc2UuZmlsZUVkaXRzKSB7XG5cdFx0XHRcdFx0XHRlbWl0RmlsZUVkaXRzKHJlc3BvbnNlLmZpbGVFZGl0cywgcHJvZ3Jlc3MpO1xuXHRcdFx0XHRcdFx0Y29uc29sZS5sb2coYFtTZXNzaW9ucyBXZWIgVGVzdF0gRW1pdHRlZCAke3Jlc3BvbnNlLmZpbGVFZGl0cy5sZW5ndGh9IGZpbGUgZWRpdHMgT0tgKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRzZWxmLmFkZFNlc3Npb25JdGVtKHJlcXVlc3Quc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0Lm1lc3NhZ2UsIHJlc3BvbnNlLnRleHQsIHJlc3BvbnNlLmZpbGVFZGl0cyk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgbWV0YWRhdGE6IHsgbW9jazogdHJ1ZSB9IH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJEeW5hbWljQWdlbnQoYWdlbnREYXRhLCBhZ2VudEltcGwpKTtcblx0XHRcdFx0Y29uc29sZS5sb2coYFtTZXNzaW9ucyBXZWIgVGVzdF0gUmVnaXN0ZXJlZCBtb2NrIGFnZW50OiAke2FnZW50SWR9YCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBbU2Vzc2lvbnMgV2ViIFRlc3RdIEZhaWxlZCB0byByZWdpc3RlciBhZ2VudCAke2FnZW50SWR9OmAsIGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck1vY2tTZXNzaW9uUHJvdmlkZXIoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2NoZW1lcyA9IFsnY29waWxvdGNsaScsICdjb3BpbG90LWNsb3VkLWFnZW50J107XG5cdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdFx0Zm9yIChjb25zdCBzY2hlbWUgb2Ygc2NoZW1lcykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoc2NoZW1lLCB7XG5cdFx0XHRcdFx0YXN5bmMgcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIF90b2tlbikge1xuXHRcdFx0XHRcdFx0Y29uc3Qga2V5ID0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0XHQvLyBFbnN1cmUgdGhlIGhpc3RvcnkgYXJyYXkgaXMgc3RvcmVkIGluIF9zZXNzaW9uSGlzdG9yeSBzb1xuXHRcdFx0XHRcdFx0Ly8gYWRkU2Vzc2lvbkl0ZW0gcHVzaGVzIGludG8gdGhlIFNBTUUgcmVmZXJlbmNlIHJldHVybmVkIGhlcmUuXG5cdFx0XHRcdFx0XHRpZiAoIXNlbGYuX3Nlc3Npb25IaXN0b3J5LmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0XHRcdHNlbGYuX3Nlc3Npb25IaXN0b3J5LnNldChrZXksIFtdKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGhpc3RvcnkgPSBzZWxmLl9zZXNzaW9uSGlzdG9yeS5nZXQoa2V5KSE7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmxvZyhgW1Nlc3Npb25zIFdlYiBUZXN0XSBPcGVuaW5nIHNlc3Npb24gJHtrZXl9ICgke2hpc3RvcnkubGVuZ3RofSBoaXN0b3J5IGl0ZW1zKWApO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzcG9zZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdFx0XHRcdFx0Y29uc3QgaXNDb21wbGV0ZSA9IG9ic2VydmFibGVWYWx1ZSgnaXNDb21wbGV0ZScsIGhpc3RvcnkubGVuZ3RoID4gMCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdGhpc3RvcnksXG5cdFx0XHRcdFx0XHRcdGlzQ29tcGxldGVPYnM6IGlzQ29tcGxldGUsXG5cdFx0XHRcdFx0XHRcdG9uV2lsbERpc3Bvc2U6IGRpc3Bvc2VFbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRcdFx0XHRhc3luYyByZXF1ZXN0SGFuZGxlcihyZXF1ZXN0LCBwcm9ncmVzcywgX2hpc3RvcnksIF90b2tlbikge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnNvbGUubG9nKGBbU2Vzc2lvbnMgV2ViIFRlc3RdIFNlc3Npb24gcmVxdWVzdDogXCIke3JlcXVlc3QubWVzc2FnZX1cImApO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gZ2V0TW9ja1Jlc3BvbnNlV2l0aEVkaXRzKHJlcXVlc3QubWVzc2FnZSk7XG5cdFx0XHRcdFx0XHRcdFx0cHJvZ3Jlc3MoW3tcblx0XHRcdFx0XHRcdFx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudDogeyB2YWx1ZTogcmVzcG9uc2UudGV4dCwgaXNUcnVzdGVkOiBmYWxzZSwgc3VwcG9ydFRoZW1lSWNvbnM6IGZhbHNlLCBzdXBwb3J0SHRtbDogZmFsc2UgfSxcblx0XHRcdFx0XHRcdFx0XHR9XSk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHJlc3BvbnNlLmZpbGVFZGl0cykge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZW1pdEZpbGVFZGl0cyhyZXNwb25zZS5maWxlRWRpdHMsIHByb2dyZXNzKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0aXNDb21wbGV0ZS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZGlzcG9zZSgpIHsgZGlzcG9zZUVtaXR0ZXIuZmlyZSgpOyBkaXNwb3NlRW1pdHRlci5kaXNwb3NlKCk7IH0sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBSZWdpc3RlciBhbiBpdGVtIGNvbnRyb2xsZXIgc28gc2Vzc2lvbnMgYXBwZWFyIGluIHRoZSBzaWRlYmFyIGxpc3QuXG5cdFx0XHRcdC8vIE9ubHkgY29waWxvdGNsaSAoQmFja2dyb3VuZCkgc2Vzc2lvbnMgbmVlZCByZWFsIGl0ZW1zIFx1MjAxNCB0aGVcblx0XHRcdFx0Ly8gY29waWxvdC1jbG91ZC1hZ2VudCBjb250cm9sbGVyIG11c3QgcmV0dXJuIGFuIGVtcHR5IGFycmF5IHRvXG5cdFx0XHRcdC8vIHByZXZlbnQgaXQgZnJvbSBvdmVyd3JpdGluZyBzZXNzaW9ucyB3aXRoIHRoZSB3cm9uZyBwcm92aWRlclR5cGVcblx0XHRcdFx0Ly8gZHVyaW5nIGEgZnVsbCBtb2RlbCByZXNvbHZlLlxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVySXRlbXMgPSBzY2hlbWUgPT09ICdjb3BpbG90Y2xpJyA/IHRoaXMuX3Nlc3Npb25JdGVtcyA6IFtdO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKHNjaGVtZSwge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtczogdGhpcy5faXRlbXNDaGFuZ2VkRW1pdHRlci5ldmVudCxcblx0XHRcdFx0XHRnZXQgaXRlbXMoKSB7IHJldHVybiBjb250cm9sbGVySXRlbXM7IH0sXG5cdFx0XHRcdFx0YXN5bmMgcmVmcmVzaCgpIHsgLyogaW4tbWVtb3J5LCBuby1vcCAqLyB9LFxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Y29uc29sZS5sb2coYFtTZXNzaW9ucyBXZWIgVGVzdF0gUmVnaXN0ZXJlZCBzZXNzaW9uIHByb3ZpZGVyIGZvciBzY2hlbWU6ICR7c2NoZW1lfWApO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybihgW1Nlc3Npb25zIFdlYiBUZXN0XSBGYWlsZWQgdG8gcmVnaXN0ZXIgc2Vzc2lvbiBwcm92aWRlciBmb3IgJHtzY2hlbWV9OmAsIGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck1vY2tUZXJtaW5hbEJhY2tlbmQoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWxTZXJ2aWNlID0gdGhpcy50ZXJtaW5hbFNlcnZpY2U7XG5cdFx0Y29uc3QgYmFja2VuZCA9IHRoaXMuY3JlYXRlTW9ja1Rlcm1pbmFsQmFja2VuZCgpO1xuXHRcdFJlZ2lzdHJ5LmFzPElUZXJtaW5hbEJhY2tlbmRSZWdpc3RyeT4oVGVybWluYWxFeHRlbnNpb25zLkJhY2tlbmQpLnJlZ2lzdGVyVGVybWluYWxCYWNrZW5kKGJhY2tlbmQpO1xuXHRcdHRlcm1pbmFsU2VydmljZS5yZWdpc3RlclByb2Nlc3NTdXBwb3J0KHRydWUpO1xuXHRcdGNvbnNvbGUubG9nKCdbU2Vzc2lvbnMgV2ViIFRlc3RdIFJlZ2lzdGVyZWQgbW9jayB0ZXJtaW5hbCBiYWNrZW5kJyk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1vY2tUZXJtaW5hbEJhY2tlbmQoKTogSVRlcm1pbmFsQmFja2VuZCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlbW90ZUF1dGhvcml0eTogdW5kZWZpbmVkLFxuXHRcdFx0aXNWaXJ0dWFsUHJvY2VzczogZmFsc2UsXG5cdFx0XHRpc1Jlc3BvbnNpdmU6IHRydWUsXG5cdFx0XHR3aGVuUmVhZHk6IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0c2V0UmVhZHk6ICgpID0+IHsgfSxcblx0XHRcdG9uRGlkUmVxdWVzdERldGFjaDogRXZlbnQuTm9uZSxcblx0XHRcdGF0dGFjaFRvUHJvY2VzczogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTsgfSxcblx0XHRcdGF0dGFjaFRvUmV2aXZlZFByb2Nlc3M6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkJyk7IH0sXG5cdFx0XHRsaXN0UHJvY2Vzc2VzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdGdldFByb2ZpbGVzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdGdldERlZmF1bHRQcm9maWxlOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRnZXREZWZhdWx0U3lzdGVtU2hlbGw6IGFzeW5jICgpID0+ICcvYmluL21vY2stc2hlbGwnLFxuXHRcdFx0Z2V0U2hlbGxFbnZpcm9ubWVudDogYXN5bmMgKCkgPT4gKHt9KSxcblx0XHRcdHNldFRlcm1pbmFsTGF5b3V0SW5mbzogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0Z2V0VGVybWluYWxMYXlvdXRJbmZvOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRyZWR1Y2VDb25uZWN0aW9uR3JhY2VUaW1lOiAoKSA9PiB7IH0sXG5cdFx0XHRyZXF1ZXN0RGV0YWNoSW5zdGFuY2U6ICgpID0+IHsgfSxcblx0XHRcdGFjY2VwdERldGFjaEluc3RhbmNlUmVwbHk6ICgpID0+IHsgfSxcblx0XHRcdHBlcnNpc3RUZXJtaW5hbFN0YXRlOiAoKSA9PiB7IH0sXG5cdFx0XHRjcmVhdGVQcm9jZXNzOiBhc3luYyAoX3NoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsIF9jd2Q6IHN0cmluZyB8IFVSSSwgX2NvbHM6IG51bWJlciwgX3Jvd3M6IG51bWJlciwgX3VuaWNvZGVWZXJzaW9uOiBzdHJpbmcsIF9lbnY6IElQcm9jZXNzRW52aXJvbm1lbnQsIF9vcHRpb25zOiBJVGVybWluYWxQcm9jZXNzT3B0aW9ucywgX3Nob3VsZFBlcnNpc3Q6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0Y29uc3Qgb25Qcm9jZXNzRGF0YSA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0XHRcdFx0Y29uc3Qgb25Qcm9jZXNzUmVhZHkgPSBuZXcgRW1pdHRlcjxJUHJvY2Vzc1JlYWR5RXZlbnQ+KCk7XG5cdFx0XHRcdGNvbnN0IG9uUHJvY2Vzc0V4aXQgPSBuZXcgRW1pdHRlcjxudW1iZXIgfCB1bmRlZmluZWQ+KCk7XG5cdFx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlSGFzQ2hpbGRQcm9jZXNzZXMgPSBuZXcgRW1pdHRlcjxib29sZWFuPigpO1xuXHRcdFx0XHRjb25zdCBvbkRpZENoYW5nZVByb3BlcnR5ID0gbmV3IEVtaXR0ZXI8SVByb2Nlc3NQcm9wZXJ0eTxQcm9jZXNzUHJvcGVydHlUeXBlPj4oKTtcblxuXHRcdFx0XHQvLyBSZXNvbHZlIGN3ZCBmcm9tIGNyZWF0ZVByb2Nlc3MgYXJnIG9yIHNoZWxsTGF1bmNoQ29uZmlnXG5cdFx0XHRcdGNvbnN0IHJhd0N3ZCA9IF9jd2QgfHwgX3NoZWxsTGF1bmNoQ29uZmlnLmN3ZDtcblx0XHRcdFx0Y29uc3QgY3dkID0gIXJhd0N3ZCA/ICcvJyA6IHR5cGVvZiByYXdDd2QgPT09ICdzdHJpbmcnID8gcmF3Q3dkIDogcmF3Q3dkLnBhdGg7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGBbU2Vzc2lvbnMgV2ViIFRlc3RdIE1vY2sgdGVybWluYWwgY3JlYXRlUHJvY2VzcyBjd2Q6ICcke2N3ZH0nIChyYXcgX2N3ZDogJyR7X2N3ZH0nLCBzbGMuY3dkOiAnJHtfc2hlbGxMYXVuY2hDb25maWcuY3dkfScpYCk7XG5cblx0XHRcdFx0Ly8gRmlyZSByZWFkeSBhZnRlciBhIG1pY3JvdGFzayBzbyB0aGUgdGVybWluYWwgc2VydmljZSBjYW4gd2lyZSB1cCBsaXN0ZW5lcnNcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0b25Qcm9jZXNzUmVhZHkuZmlyZSh7IHBpZDogMSwgY3dkLCB3aW5kb3dzUHR5OiB1bmRlZmluZWQgfSk7XG5cdFx0XHRcdH0sIDApO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IDAsXG5cdFx0XHRcdFx0c2hvdWxkUGVyc2lzdDogZmFsc2UsXG5cdFx0XHRcdFx0b25Qcm9jZXNzRGF0YTogb25Qcm9jZXNzRGF0YS5ldmVudCxcblx0XHRcdFx0XHRvblByb2Nlc3NSZWFkeTogb25Qcm9jZXNzUmVhZHkuZXZlbnQsXG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VIYXNDaGlsZFByb2Nlc3Nlczogb25EaWRDaGFuZ2VIYXNDaGlsZFByb2Nlc3Nlcy5ldmVudCxcblx0XHRcdFx0XHRvbkRpZENoYW5nZVByb3BlcnR5OiBvbkRpZENoYW5nZVByb3BlcnR5LmV2ZW50LFxuXHRcdFx0XHRcdG9uUHJvY2Vzc0V4aXQ6IG9uUHJvY2Vzc0V4aXQuZXZlbnQsXG5cdFx0XHRcdFx0c3RhcnQ6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzaHV0ZG93bjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRcdGlucHV0OiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0cmVzaXplOiAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0Y2xlYXJCdWZmZXI6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRhY2tub3dsZWRnZURhdGFFdmVudDogKCkgPT4geyB9LFxuXHRcdFx0XHRcdHNldFVuaWNvZGVWZXJzaW9uOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0Z2V0SW5pdGlhbEN3ZDogYXN5bmMgKCkgPT4gY3dkLFxuXHRcdFx0XHRcdGdldEN3ZDogYXN5bmMgKCkgPT4gY3dkLFxuXHRcdFx0XHRcdGdldExhdGVuY3k6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRcdHByb2Nlc3NCaW5hcnk6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0XHRyZWZyZXNoUHJvcGVydHk6IGFzeW5jIChwcm9wZXJ0eTogUHJvY2Vzc1Byb3BlcnR5VHlwZSkgPT4geyB0aHJvdyBuZXcgRXJyb3IoYE5vdCBzdXBwb3J0ZWQ6ICR7cHJvcGVydHl9YCk7IH0sXG5cdFx0XHRcdFx0dXBkYXRlUHJvcGVydHk6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0XHRjbGVhclVucmVzcG9uZGVkUmVxdWVzdDogKCkgPT4geyB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHRcdGdldFdzbFBhdGg6IGFzeW5jIChvcmlnaW5hbDogc3RyaW5nLCBfZGlyZWN0aW9uOiAndW5peC10by13aW4nIHwgJ3dpbi10by11bml4JykgPT4gb3JpZ2luYWwsXG5cdFx0XHRnZXRFbnZpcm9ubWVudDogYXN5bmMgKCkgPT4gKHt9KSxcblx0XHRcdGdldExhdGVuY3k6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0Z2V0UGVyZm9ybWFuY2VNYXJrczogKCkgPT4gW10sXG5cdFx0XHR1cGRhdGVUaXRsZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0dXBkYXRlSWNvbjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0c2V0TmV4dENvbW1hbmRJZDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0cmVzdGFydFB0eUhvc3Q6ICgpID0+IHsgfSxcblx0XHRcdGluc3RhbGxBdXRvUmVwbHk6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdHVuaW5zdGFsbEFsbEF1dG9SZXBsaWVzOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRvblB0eUhvc3RVbnJlc3BvbnNpdmU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvblB0eUhvc3RSZXNwb25zaXZlOiBFdmVudC5Ob25lLFxuXHRcdFx0b25QdHlIb3N0UmVzdGFydDogRXZlbnQuTm9uZSxcblx0XHRcdG9uUHR5SG9zdENvbm5lY3RlZDogRXZlbnQuTm9uZSxcblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsQmFja2VuZDtcblx0fVxuXG5cbn1cblxuLy8gUmVnaXN0ZXIgdGhlIGNvbnRyaWJ1dGlvbiBzbyBpdCBydW5zIGR1cmluZyB3b3JrYmVuY2ggc3RhcnR1cFxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKE1vY2tDaGF0QWdlbnRDb250cmlidXRpb24uSUQsIE1vY2tDaGF0QWdlbnRDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gTW9ja0dpdFNlcnZpY2UgXHUyMDE0IHJlc29sdmVzIGltbWVkaWF0ZWx5IGluc3RlYWQgb2Ygd2FpdGluZyAxMHMgZm9yIGRlbGVnYXRlXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgTW9ja0dpdFNlcnZpY2UgaW1wbGVtZW50cyBJR2l0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSByZXBvc2l0b3JpZXM6IEl0ZXJhYmxlPElHaXRSZXBvc2l0b3J5PiA9IFtdO1xuXHRzZXREZWxlZ2F0ZShfZGVsZWdhdGU6IElHaXRFeHRlbnNpb25EZWxlZ2F0ZSkgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG5cdGFzeW5jIG9wZW5SZXBvc2l0b3J5KF91cmk6IFVSSSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gVGVzdFNlc3Npb25zQnJvd3Nlck1haW5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFRlc3QgdmFyaWFudCBvZiBTZXNzaW9uc0Jyb3dzZXJNYWluIHRoYXQgaW5qZWN0cyBtb2NrIHNlcnZpY2VzXG4gKiBmb3IgRTJFIHRlc3RpbmcuIE1vY2sgc2luZ2xldG9ucyBhcmUgcGF0Y2hlZCBpbnRvIHRoZSBnbG9iYWxcbiAqIHNpbmdsZXRvbiByZWdpc3RyeSBiZWZvcmUgYHN1cGVyLm9wZW4oKWAgc28gdGhleSB0YWtlIGVmZmVjdFxuICogZHVyaW5nIGJvdGggYEJyb3dzZXJNYWluLmluaXRTZXJ2aWNlcygpYCBhbmQgYFdvcmtiZW5jaC5pbml0U2VydmljZXMoKWAuXG4gKiBPcmlnaW5hbCBkZXNjcmlwdG9ycyBhcmUgcmVzdG9yZWQgd2hlbiB0aGUgd29ya2JlbmNoIHNodXRzIGRvd24uXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXN0U2Vzc2lvbnNCcm93c2VyTWFpbiBleHRlbmRzIFNlc3Npb25zQnJvd3Nlck1haW4ge1xuXG5cdHByaXZhdGUgX3NhdmVkRGVzY3JpcHRvcnM6IFtTZXJ2aWNlSWRlbnRpZmllcjxhbnk+LCBTeW5jRGVzY3JpcHRvcjxhbnk+XVtdID0gW107XG5cblx0b3ZlcnJpZGUgYXN5bmMgb3BlbigpOiBQcm9taXNlPElXb3JrYmVuY2g+IHtcblx0XHQvLyBQYXRjaCB0aGUgZ2xvYmFsIHNpbmdsZXRvbiByZWdpc3RyeSBCRUZPUkUgc3VwZXIub3BlbigpIGNhbGxzIGluaXRTZXJ2aWNlcygpLlxuXHRcdC8vIGdldFNpbmdsZXRvblNlcnZpY2VEZXNjcmlwdG9ycygpIHJldHVybnMgdGhlIG11dGFibGUgaW50ZXJuYWwgYXJyYXksIHNvXG5cdFx0Ly8gcmVwbGFjaW5nIGVudHJpZXMgaGVyZSBlbnN1cmVzIGJvdGggQnJvd3Nlck1haW4gYW5kIFdvcmtiZW5jaCBwaWNrIHVwIG1vY2tzLlxuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gZ2V0U2luZ2xldG9uU2VydmljZURlc2NyaXB0b3JzKCk7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzOiBbU2VydmljZUlkZW50aWZpZXI8YW55PiwgU3luY0Rlc2NyaXB0b3I8YW55Pl1bXSA9IFtcblx0XHRcdFtJQ2hhdEVudGl0bGVtZW50U2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKE1vY2tDaGF0RW50aXRsZW1lbnRTZXJ2aWNlKV0sXG5cdFx0XHRbSURlZmF1bHRBY2NvdW50U2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKE1vY2tEZWZhdWx0QWNjb3VudFNlcnZpY2UpXSxcblx0XHRcdFtJR2l0U2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKE1vY2tHaXRTZXJ2aWNlKV0sXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IFtzZXJ2aWNlSWQsIG1vY2tEZXNjcmlwdG9yXSBvZiBvdmVycmlkZXMpIHtcblx0XHRcdGNvbnN0IGlkeCA9IHJlZ2lzdHJ5LmZpbmRJbmRleCgoW2lkXSkgPT4gaWQgPT09IHNlcnZpY2VJZCk7XG5cdFx0XHRpZiAoaWR4ICE9PSAtMSkge1xuXHRcdFx0XHR0aGlzLl9zYXZlZERlc2NyaXB0b3JzLnB1c2goW3NlcnZpY2VJZCwgcmVnaXN0cnlbaWR4XVsxXV0pO1xuXHRcdFx0XHRyZWdpc3RyeVtpZHhdID0gW3NlcnZpY2VJZCwgbW9ja0Rlc2NyaXB0b3JdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVnaXN0cnkucHVzaChbc2VydmljZUlkLCBtb2NrRGVzY3JpcHRvcl0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtiZW5jaCA9IGF3YWl0IHN1cGVyLm9wZW4oKTtcblxuXHRcdC8vIFJlc3RvcmUgb3JpZ2luYWwgZGVzY3JpcHRvcnMgbm93IHRoYXQgdGhlIHdvcmtiZW5jaCBoYXMgc3RhcnRlZCxcblx0XHQvLyBzbyBzdWJzZXF1ZW50IHRlc3RzIGluIHRoZSBzYW1lIHByb2Nlc3MgYXJlIG5vdCBhZmZlY3RlZC5cblx0XHRmb3IgKGNvbnN0IFtzZXJ2aWNlSWQsIG9yaWdpbmFsXSBvZiB0aGlzLl9zYXZlZERlc2NyaXB0b3JzKSB7XG5cdFx0XHRjb25zdCBpZHggPSByZWdpc3RyeS5maW5kSW5kZXgoKFtpZF0pID0+IGlkID09PSBzZXJ2aWNlSWQpO1xuXHRcdFx0aWYgKGlkeCAhPT0gLTEpIHtcblx0XHRcdFx0cmVnaXN0cnlbaWR4XSA9IFtzZXJ2aWNlSWQsIG9yaWdpbmFsXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gd29ya2JlbmNoO1xuXHR9XG5cblx0cHJpdmF0ZSBwcmVzZWVkRm9sZGVyKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpOiB2b2lkIHtcblx0XHRjb25zdCBtb2NrRm9sZGVyVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdtb2NrLWZzJywgYXV0aG9yaXR5OiAnbW9jay1yZXBvJywgcGF0aDogJy9tb2NrLXJlcG8nIH0pO1xuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSAnZGVmYXVsdC1jb3BpbG90JztcblxuXHRcdC8vIFNlZWQgcmVjZW50IHdvcmtzcGFjZXMgc28gcmVzb2x2ZVdvcmtzcGFjZSgpIGNhbiBoeWRyYXRlIHRoZSBzZWxlY3Rpb25cblx0XHRjb25zdCByZWNlbnRXb3Jrc3BhY2VzID0gSlNPTi5zdHJpbmdpZnkoW3sgdXJpOiBtb2NrRm9sZGVyVXJpLnRvSlNPTigpLCBwcm92aWRlcklkLCBjaGVja2VkOiB0cnVlIH1dKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnc2Vzc2lvbnMucmVjZW50bHlQaWNrZWRXb3Jrc3BhY2VzJywgcmVjZW50V29ya3NwYWNlcywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRjb25zb2xlLmxvZyhgW1Nlc3Npb25zIFdlYiBUZXN0XSBQcmUtc2VlZGVkIGZvbGRlcjogJHttb2NrRm9sZGVyVXJpLnRvU3RyaW5nKCl9YCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlV29ya2JlbmNoKGRvbUVsZW1lbnQ6IEhUTUxFbGVtZW50LCBzZXJ2aWNlQ29sbGVjdGlvbjogU2VydmljZUNvbGxlY3Rpb24sIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKTogSUJyb3dzZXJNYWluV29ya2JlbmNoIHtcblx0XHQvLyBSZWdpc3RlciBtb2NrLWZzOi8vIHByb3ZpZGVyIHNvIGFsbCBzZXJ2aWNlcyBjYW4gcmVzb2x2ZSB3b3Jrc3BhY2UgZmlsZXNcblx0XHRyZWdpc3Rlck1vY2tGaWxlU3lzdGVtUHJvdmlkZXIoc2VydmljZUNvbGxlY3Rpb24pO1xuXG5cdFx0dGhpcy5wcmVzZWVkRm9sZGVyKHNlcnZpY2VDb2xsZWN0aW9uLmdldChJU3RvcmFnZVNlcnZpY2UpIGFzIElTdG9yYWdlU2VydmljZSk7XG5cblx0XHRyZXR1cm4gbmV3IFNlc3Npb25zV29ya2JlbmNoKGRvbUVsZW1lbnQsIHVuZGVmaW5lZCwgc2VydmljZUNvbGxlY3Rpb24sIGxvZ1NlcnZpY2UpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQVFBLFNBQVMsYUFBYSx5QkFBeUI7QUFDL0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxTQUFTLGFBQWE7QUFFL0IsU0FBc0IsdUJBQXVCO0FBQzdDLFNBQVMsaUJBQWlCLCtCQUErQztBQUN6RSxTQUFTLDhCQUE4QjtBQUV2QyxTQUFTLHlCQUFtRTtBQUM1RSxTQUFTLG1CQUFtQixvQkFBb0I7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUIsY0FB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LFlBQTZEO0FBQUEsTUFDbEUsQ0FBQyx5QkFBeUIsSUFBSSxlQUFlLDBCQUEwQixDQUFDO0FBQUEsTUFDeEUsQ0FBQyx3QkFBd0IsSUFBSSxlQUFlLHlCQUF5QixDQUFDO0FBQUEsTUFDdEUsQ0FBQyxhQUFhLElBQUksZUFBZSxjQUFjLENBQUM7QUFBQSxJQUNqRDtBQUNBLGVBQVcsQ0FBQyxXQUFXLGNBQWMsS0FBSyxXQUFXO0FBQ3BELFlBQU0sTUFBTSxTQUFTLFVBQVUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxPQUFPLFNBQVM7QUFDekQsVUFBSSxRQUFRLElBQUk7QUFDZixhQUFLLGtCQUFrQixLQUFLLENBQUMsV0FBVyxTQUFTLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUN6RCxpQkFBUyxHQUFHLElBQUksQ0FBQyxXQUFXLGNBQWM7QUFBQSxNQUMzQyxPQUFPO0FBQ04saUJBQVMsS0FBSyxDQUFDLFdBQVcsY0FBYyxDQUFDO0FBQUEsTUFDMUM7QUFBQSxJQUNEO0FBRUEsVUFBTSxZQUFZLE1BQU0sTUFBTSxLQUFLO0FBSW5DLGVBQVcsQ0FBQyxXQUFXLFFBQVEsS0FBSyxLQUFLLG1CQUFtQjtBQUMzRCxZQUFNLE1BQU0sU0FBUyxVQUFVLENBQUMsQ0FBQyxFQUFFLE1BQU0sT0FBTyxTQUFTO0FBQ3pELFVBQUksUUFBUSxJQUFJO0FBQ2YsaUJBQVMsR0FBRyxJQUFJLENBQUMsV0FBVyxRQUFRO0FBQUEsTUFDckM7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGNBQWMsZ0JBQXVDO0FBQzVELFVBQU0sZ0JBQWdCLElBQUksS0FBSyxFQUFFLFFBQVEsV0FBVyxXQUFXLGFBQWEsTUFBTSxhQUFhLENBQUM7QUFDaEcsVUFBTSxhQUFhO0FBR25CLFVBQU0sbUJBQW1CLEtBQUssVUFBVSxDQUFDLEVBQUUsS0FBSyxjQUFjLE9BQU8sR0FBRyxZQUFZLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFDcEcsbUJBQWUsTUFBTSxxQ0FBcUMsa0JBQWtCLGFBQWEsU0FBUyxjQUFjLE9BQU87QUFFdkgsWUFBUSxJQUFJLDBDQUEwQyxjQUFjLFNBQVMsQ0FBQyxFQUFFO0FBQUEsRUFDakY7QUFBQSxFQUVtQixnQkFBZ0IsWUFBeUIsbUJBQXNDLFlBQWdEO0FBRWpKLG1DQUErQixpQkFBaUI7QUFFaEQsU0FBSyxjQUFjLGtCQUFrQixJQUFJLGVBQWUsQ0FBb0I7QUFFNUUsV0FBTyxJQUFJLGtCQUFrQixZQUFZLFFBQVcsbUJBQW1CLFVBQVU7QUFBQSxFQUNsRjtBQUNEOyIsCiAgIm5hbWVzIjogWyJfdG9rZW4iXQp9Cg==
