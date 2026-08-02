import { ok, strictEqual } from "assert";
import { Separator } from "../../../../../../base/common/actions.js";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { constObservable } from "../../../../../../base/common/observable.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { isLinux, isWindows, OperatingSystem } from "../../../../../../base/common/platform.js";
import { count } from "../../../../../../base/common/strings.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ITreeSitterLibraryService } from "../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js";
import { OffsetRange } from "../../../../../../editor/common/core/ranges/offsetRange.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { ConfigurationTarget } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { IWorkspaceContextService, toWorkspaceFolder } from "../../../../../../platform/workspace/common/workspace.js";
import { Workspace } from "../../../../../../platform/workspace/test/common/testWorkspace.js";
import { IHistoryService } from "../../../../../services/history/common/history.js";
import { TreeSitterLibraryService } from "../../../../../services/treeSitter/browser/treeSitterLibraryService.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { TestContextService } from "../../../../../test/common/workbenchTestServices.js";
import { TestIPCFileSystemProvider } from "../../../../../test/electron-browser/workbenchTestServices.js";
import { TerminalToolConfirmationStorageKeys } from "../../../../chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js";
import { IChatService } from "../../../../chat/common/chatService/chatService.js";
import { IChatWidgetService } from "../../../../chat/browser/chat.js";
import { ChatAgentLocation, ChatPermissionLevel } from "../../../../chat/common/constants.js";
import { ChatModel } from "../../../../chat/common/model/chatModel.js";
import { LocalChatSessionUri } from "../../../../chat/common/model/chatUri.js";
import { ChatRequestTextPart } from "../../../../chat/common/requestParser/chatParserTypes.js";
import { ITerminalSandboxService, TerminalSandboxPrerequisiteCheck, TerminalSandboxPreCheckRemediation } from "../../common/terminalSandboxService.js";
import { ILanguageModelToolsService, ToolDataSource, ToolSet } from "../../../../chat/common/tools/languageModelToolsService.js";
import { IToolResultCompressor } from "../../../../chat/common/tools/toolResultCompressor.js";
import { ITerminalChatService, ITerminalService } from "../../../../terminal/browser/terminal.js";
import { ITerminalProfileResolverService } from "../../../../terminal/common/terminal.js";
import { createRunInTerminalToolData, outputLooksBubblewrapHostRestricted, RunInTerminalTool, shouldAutomaticallyRetryAllowNetworkInSandboxed, shouldAutomaticallyRetryUnsandboxed } from "../../browser/tools/runInTerminalTool.js";
import { ShellIntegrationQuality } from "../../browser/toolTerminalCreator.js";
import { terminalChatAgentToolsConfiguration, TerminalChatAgentToolsSettingId } from "../../common/terminalChatAgentToolsConfiguration.js";
import { AgentNetworkDomainSettingId } from "../../../../../../platform/networkFilter/common/settings.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from "../../../../../../platform/sandbox/common/settings.js";
import { TerminalChatService } from "../../../chat/browser/terminalChatService.js";
import { IAgentSessionsService } from "../../../../chat/browser/agentSessions/agentSessionsService.js";
import { isDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ChatAgentToolsContribution } from "../../browser/terminal.chatAgentTools.contribution.js";
import { TerminalToolId } from "../../browser/tools/toolIds.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ILanguageModelsService } from "../../../../chat/common/languageModels.js";
class TestRunInTerminalTool extends RunInTerminalTool {
  constructor() {
    super(...arguments);
    this._osBackend = Promise.resolve(OperatingSystem.Windows);
  }
  get sessionTerminalAssociations() {
    return this._sessionTerminalAssociations;
  }
  get sessionTerminalInstances() {
    return this._sessionTerminalInstances;
  }
  get profileFetcher() {
    return this._profileFetcher;
  }
  get commandLinePresenters() {
    return this["_commandLinePresenters"];
  }
  getBubblewrapHostRestrictedResult() {
    return this["_getBubblewrapHostRestrictedResult"]();
  }
  disableProcessIdAssociation() {
    this["_setupProcessIdAssociation"] = async () => {
    };
  }
  setBackendOs(os) {
    this._osBackend = Promise.resolve(os);
  }
}
suite("RunInTerminalTool", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let fileService;
  let storageService;
  let workspaceContextService;
  let terminalServiceDisposeEmitter;
  let chatServiceDisposeEmitter;
  let chatSessionArchivedEmitter;
  let capturedSteeringRequests;
  let sandboxEnabled;
  let sandboxPrereqResult;
  let terminalSandboxService;
  let createdTerminalInstance;
  let createTerminalCallCount;
  let chatSessions;
  let runInTerminalTool;
  function isDefaultChatPermissionSandboxPrecheckInputs(precheckInputs) {
    return precheckInputs?.isDefaultApprovalPermissionEnabled !== false;
  }
  setup(() => {
    configurationService = new TestConfigurationService();
    workspaceContextService = new TestContextService();
    const logService = new NullLogService();
    fileService = store.add(new FileService(logService));
    const fileSystemProvider = new TestIPCFileSystemProvider();
    store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
    setConfig(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, "outsideWorkspace");
    setConfig(TerminalChatAgentToolsSettingId.TerminalProfileLinux, Object.freeze({ path: "bash" }));
    setConfig(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, true);
    setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
    setConfig(AgentSandboxSettingId.AgentSandboxAllowAutoApprove, false);
    sandboxEnabled = false;
    sandboxPrereqResult = {
      enabled: false,
      sandboxConfigPath: void 0,
      failedCheck: void 0
    };
    const commandFinishedEmitter = new Emitter();
    const onDisposedEmitter = new Emitter();
    const onExitEmitter = new Emitter();
    const onDidAddCapabilityEmitter = new Emitter();
    const onDidInputDataEmitter = new Emitter();
    const onDataEmitter = new Emitter();
    const marker = {
      line: 0,
      dispose: () => {
      },
      onDispose: Event.None
    };
    const xterm = {
      getContentsAsText: () => "",
      raw: {
        onData: onDataEmitter.event,
        registerMarker: () => marker,
        buffer: {
          active: {},
          alternate: {},
          onBufferChange: Event.None
        }
      }
    };
    createTerminalCallCount = 0;
    createdTerminalInstance = {
      instanceId: 1,
      processId: 1,
      processReady: Promise.resolve(),
      xtermReadyPromise: Promise.resolve(xterm),
      onData: onDataEmitter.event,
      onExit: onExitEmitter.event,
      sendText: async (_text) => {
        queueMicrotask(() => {
          onDataEmitter.fire("\x1B]633;C\x07\x1B]633;A\x07");
          commandFinishedEmitter.fire({ exitCode: 0, getOutput: () => "" });
        });
      },
      focus: () => {
      },
      capabilities: {
        get: (cap) => {
          if (cap === TerminalCapability.CommandDetection) {
            return {
              commands: [],
              onCommandFinished: commandFinishedEmitter.event
            };
          }
          return void 0;
        },
        onDidAddCapability: onDidAddCapabilityEmitter.event
      },
      onDidInputData: onDidInputDataEmitter.event,
      onDisposed: onDisposedEmitter.event,
      dispose: () => {
        onExitEmitter.fire(0);
        onDisposedEmitter.fire(createdTerminalInstance);
      },
      getCwdResource: async () => void 0,
      isDisposed: false
    };
    terminalServiceDisposeEmitter = new Emitter();
    chatServiceDisposeEmitter = new Emitter();
    chatSessionArchivedEmitter = new Emitter();
    capturedSteeringRequests = [];
    chatSessions = /* @__PURE__ */ new Map();
    instantiationService = workbenchInstantiationService({
      configurationService: () => configurationService,
      fileService: () => fileService
    }, store);
    const chatServiceStub = {
      onDidDisposeSession: chatServiceDisposeEmitter.event,
      getSession: (sessionResource) => chatSessions.get(sessionResource.toString()),
      sendRequest: async (sessionResource, message, options) => {
        capturedSteeringRequests.push({ sessionResource, message, options });
        return { kind: "rejected", reason: "test" };
      },
      acquireExistingSession: () => ({
        object: {
          lastRequest: void 0,
          lastRequestObs: constObservable(void 0),
          onDidChange: Event.None
        },
        dispose: () => {
        }
      })
    };
    instantiationService.stub(IChatService, chatServiceStub);
    instantiationService.stub(IAgentSessionsService, {
      onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
      model: {
        onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event
      }
    });
    instantiationService.stub(ITerminalService, {
      createTerminal: async () => {
        createTerminalCallCount++;
        return createdTerminalInstance;
      },
      foregroundInstances: [],
      createOnInstanceCapabilityEvent: () => ({ event: Event.None, dispose: () => {
      } }),
      onDidDisposeInstance: terminalServiceDisposeEmitter.event,
      onDidChangeInstances: Event.None,
      revealTerminal: async () => {
      },
      setActiveInstance: () => {
      },
      setNextCommandId: async () => {
      }
    });
    instantiationService.stub(ITerminalChatService, store.add(instantiationService.createInstance(TerminalChatService)));
    instantiationService.stub(IWorkspaceContextService, workspaceContextService);
    instantiationService.stub(IHistoryService, {
      getLastActiveWorkspaceRoot: () => void 0
    });
    terminalSandboxService = {
      _serviceBrand: void 0,
      isEnabled: async (precheckInputs) => sandboxEnabled && isDefaultChatPermissionSandboxPrecheckInputs(precheckInputs),
      isSandboxAllowNetworkEnabled: async () => false,
      wrapCommand: async (command, requestUnsandboxedExecution) => ({
        command: requestUnsandboxedExecution ? `unsandboxed:${command}` : `sandbox:${command}`,
        isSandboxWrapped: !requestUnsandboxedExecution
      }),
      checkFileAccess: async () => ({ allowed: true, denied: [] }),
      getSandboxConfigPath: async () => sandboxEnabled ? "/tmp/sandbox.json" : void 0,
      checkForSandboxingPrereqs: async (_forceRefresh, precheckInputs) => isDefaultChatPermissionSandboxPrecheckInputs(precheckInputs) ? sandboxPrereqResult : { enabled: false, sandboxConfigPath: void 0, failedCheck: void 0 },
      getTempDir: () => void 0,
      setNeedsForceUpdateConfigFile: () => {
      },
      getOS: async () => OperatingSystem.Linux,
      getResolvedNetworkDomains: () => ({ allowedDomains: [], deniedDomains: [] }),
      getMissingSandboxDependencies: async () => [],
      installMissingSandboxDependencies: async (missingDependencies, _sessionResource, _token, options) => {
        const terminal = await options.createTerminal();
        await options.focusTerminal(terminal);
        await terminal.sendText(`sudo apt install -y ${missingDependencies.join(" ")}`, true);
        return { exitCode: 0 };
      },
      runSandboxRemediation: async () => ({ exitCode: 0 })
    };
    instantiationService.stub(ITerminalSandboxService, terminalSandboxService);
    const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
    treeSitterLibraryService.isTest = true;
    instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);
    instantiationService.stub(ILanguageModelToolsService, {
      getTools() {
        return [];
      }
    });
    instantiationService.stub(ILanguageModelsService, {
      selectLanguageModels: async () => ["copilot/copilot-utility-small"]
    });
    instantiationService.stub(ITerminalProfileResolverService, {
      getDefaultProfile: async () => ({ path: "bash" })
    });
    storageService = instantiationService.get(IStorageService);
    storageService.store(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, true, StorageScope.APPLICATION, StorageTarget.USER);
    runInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
  });
  function setAutoApprove(value) {
    setConfig(TerminalChatAgentToolsSettingId.AutoApprove, value);
  }
  function setConfig(key, value) {
    configurationService.setUserConfiguration(key, value);
    configurationService.onDidChangeConfigurationEmitter.fire({
      affectsConfiguration: () => true,
      affectedKeys: /* @__PURE__ */ new Set([key]),
      source: ConfigurationTarget.USER,
      change: null
    });
  }
  function clearAutoApproveWarningAcceptedState() {
    storageService.remove(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION);
  }
  async function executeToolTest(params) {
    const context = {
      parameters: {
        command: "echo hello",
        explanation: "Print hello to the console",
        goal: "Print hello",
        ...params
      }
    };
    const result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
    return result;
  }
  async function invokeToolTest(params, selectedCustomButton) {
    const parameters = {
      command: "echo hello",
      explanation: "Print hello to the console",
      goal: "Print hello",
      ...params
    };
    const preparedInvocation = await runInTerminalTool.prepareToolInvocation({ parameters }, CancellationToken.None);
    ok(preparedInvocation?.toolSpecificData, "Expected toolSpecificData to be defined");
    const countTokens = async () => 0;
    const noProgress = { report() {
    } };
    return runInTerminalTool.invoke({
      callId: "test-call",
      toolId: TerminalToolId.RunInTerminal,
      parameters,
      context: { sessionResource: LocalChatSessionUri.forSession("run-in-terminal-test") },
      toolSpecificData: preparedInvocation.toolSpecificData,
      selectedCustomButton
    }, countTokens, noProgress, CancellationToken.None);
  }
  function isSeparator(action) {
    return action instanceof Separator;
  }
  function assertAutoApproved(preparedInvocation) {
    ok(preparedInvocation, "Expected prepared invocation to be defined");
    ok(!preparedInvocation.confirmationMessages, "Expected no confirmation messages for auto-approved command");
  }
  function assertConfirmationRequired(preparedInvocation, expectedTitle) {
    ok(preparedInvocation, "Expected prepared invocation to be defined");
    ok(preparedInvocation.confirmationMessages, "Expected confirmation messages for non-approved command");
    if (expectedTitle) {
      strictEqual(preparedInvocation.confirmationMessages.title, expectedTitle);
    }
  }
  function createChatModeInfo(permissionLevel) {
    return {
      kind: void 0,
      isBuiltin: true,
      modeInstructions: void 0,
      telemetryModeId: "agent",
      applyCodeBlockSuggestionId: void 0,
      permissionLevel
    };
  }
  function createChatModelWithRequest(sessionResource, modeInfo, requestId) {
    const model = store.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "retry";
    model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0, modeInfo, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0, requestId);
    chatSessions.set(sessionResource.toString(), model);
    return model;
  }
  function confirmAutomaticSandboxRetry(tool, retryKind, sessionResource, command, shell, blockedDomains) {
    return tool["_confirmAutomaticSandboxRetry"](retryKind, sessionResource, command, shell, blockedDomains, void 0, CancellationToken.None);
  }
  function confirmAutomaticUnsandboxRetry(tool, sessionResource, command, shell, blockedDomains) {
    return confirmAutomaticSandboxRetry(tool, "unsandboxed", sessionResource, command, shell, blockedDomains);
  }
  function confirmAutomaticAllowNetworkRetry(tool, sessionResource, command, shell, blockedDomains) {
    return confirmAutomaticSandboxRetry(tool, "allowNetwork", sessionResource, command, shell, blockedDomains);
  }
  async function assertAutomaticUnsandboxRetryElicitation(tool, sessionResource, command, shell, blockedDomains) {
    const model = createChatModelWithRequest(sessionResource);
    const shouldRetry = confirmAutomaticUnsandboxRetry(tool, sessionResource, command, shell, blockedDomains);
    const request = model.getRequests().at(-1);
    const response = request?.response;
    ok(response, "Expected chat request with response");
    const elicitation = response.response.value.find((part) => part.kind === "elicitation2");
    ok(elicitation?.kind === "elicitation2", "Expected automatic unsandbox retry elicitation");
    const reject = elicitation.reject;
    ok(reject, "Expected automatic unsandbox retry elicitation to have a reject action");
    await reject();
    strictEqual(await shouldRetry, false);
  }
  async function assertAutomaticAllowNetworkRetryElicitation(tool, sessionResource, command, shell, blockedDomains, expectedTitle) {
    const model = createChatModelWithRequest(sessionResource);
    const shouldRetry = confirmAutomaticAllowNetworkRetry(tool, sessionResource, command, shell, blockedDomains);
    const request = model.getRequests().at(-1);
    const response = request?.response;
    ok(response, "Expected chat request with response");
    const elicitation = response.response.value.find((part) => part.kind === "elicitation2");
    ok(elicitation?.kind === "elicitation2", "Expected automatic allow-network retry elicitation");
    const title = elicitation.title;
    ok(typeof title !== "string", "Expected automatic allow-network retry title to be markdown");
    strictEqual(title.value, expectedTitle);
    const reject = elicitation.reject;
    ok(reject, "Expected automatic allow-network retry elicitation to have a reject action");
    await reject();
    strictEqual(await shouldRetry, false);
  }
  function getAutomaticSandboxRetryTitle(tool, retryKind, shellType, blockedDomains) {
    return tool["_getAutomaticSandboxRetryTitle"](retryKind, shellType, blockedDomains);
  }
  function getAutomaticUnsandboxRetryTitle(tool, shellType, blockedDomains) {
    return getAutomaticSandboxRetryTitle(tool, "unsandboxed", shellType, blockedDomains);
  }
  function getAutomaticAllowNetworkRetryTitle(tool, shellType, blockedDomains) {
    return getAutomaticSandboxRetryTitle(tool, "allowNetwork", shellType, blockedDomains);
  }
  suite("sandbox invocation messaging", () => {
    test("should instruct models to use $TMPDIR instead of /tmp when sandboxed", async () => {
      sandboxEnabled = true;
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      ok(toolData.modelDescription?.includes("Use $TMPDIR for temporary files"), "Expected sandboxed tool description to require $TMPDIR usage");
      ok(toolData.modelDescription?.includes("/tmp may not be writable"), "Expected sandboxed tool description to discourage /tmp usage");
    });
    test("should include sandbox escalation requests in schema when sandbox is enabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
      sandboxEnabled = true;
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      const properties = toolData.inputSchema?.properties;
      const requestUnsandboxedExecutionProperty = properties?.["requestUnsandboxedExecution"];
      const requestUnsandboxedExecutionReasonProperty = properties?.["requestUnsandboxedExecutionReason"];
      const requestAllowNetworkProperty = properties?.["requestAllowNetwork"];
      const requestAllowNetworkReasonProperty = properties?.["requestAllowNetworkReason"];
      const requestFileValidationCheckProperty = properties?.["requestFileValidationCheck"];
      const requestFileValidationCheckReasonProperty = properties?.["requestFileValidationCheckReason"];
      ok(properties?.["requestUnsandboxedExecution"], "Expected requestUnsandboxedExecution in schema when sandbox is enabled");
      ok(properties?.["requestUnsandboxedExecutionReason"], "Expected requestUnsandboxedExecutionReason in schema when sandbox is enabled");
      ok(properties?.["requestAllowNetwork"], "Expected requestAllowNetwork in schema when sandbox is enabled");
      ok(properties?.["requestAllowNetworkReason"], "Expected requestAllowNetworkReason in schema when sandbox is enabled");
      ok(properties?.["requestFileValidationCheck"], "Expected requestFileValidationCheck in schema when sandbox is enabled");
      ok(properties?.["requestFileValidationCheckReason"], "Expected requestFileValidationCheckReason in schema when sandbox is enabled");
      ok(requestUnsandboxedExecutionProperty?.description?.includes("Only set this when the command clearly needs unsandboxed access"), "Expected schema description to require a clear need for unsandboxed access");
      ok(requestUnsandboxedExecutionReasonProperty?.description?.includes("why this command must run outside the terminal sandbox"), "Expected reason schema description to require concrete sandbox justification");
      ok(requestAllowNetworkProperty?.description?.includes("remain in the terminal sandbox but run with unrestricted network access"), "Expected network schema description to retain sandboxing");
      ok(requestAllowNetworkReasonProperty?.description?.includes("needs unrestricted network access"), "Expected network reason schema description to request justification");
      strictEqual(requestFileValidationCheckProperty?.type, "array", "Expected file validation schema to accept file paths");
      strictEqual(requestFileValidationCheckProperty?.items?.type, "string", "Expected file validation paths to be strings");
      ok(requestFileValidationCheckProperty?.description?.includes("before running the command"), "Expected file validation schema description to describe pre-execution access checks");
      ok(requestFileValidationCheckReasonProperty?.description?.includes("these file paths"), "Expected file validation reason schema description to request justification");
    });
    test("should omit unsandboxed execution requests from schema when unsandboxed commands are disabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, false);
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
      sandboxEnabled = true;
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      const properties = toolData.inputSchema?.properties;
      ok(!properties?.["requestUnsandboxedExecution"], "Expected no requestUnsandboxedExecution in schema when unsandboxed commands are disabled");
      ok(!properties?.["requestUnsandboxedExecutionReason"], "Expected no requestUnsandboxedExecutionReason in schema when unsandboxed commands are disabled");
      ok(properties?.["requestAllowNetwork"], "Expected requestAllowNetwork to remain in schema when per-command network access is enabled");
      ok(properties?.["requestAllowNetworkReason"], "Expected requestAllowNetworkReason to remain in schema when per-command network access is enabled");
      ok(toolData.modelDescription?.includes("Running commands outside the sandbox is disabled"), "Expected model description to explain that unsandboxed commands are disabled");
    });
    test("should not recommend allow-network requests in model description when per-command network access is disabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, false);
      sandboxEnabled = true;
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      const properties = toolData.inputSchema?.properties;
      ok(!properties?.["requestAllowNetwork"], "Expected no requestAllowNetwork in schema when per-command network access is disabled");
      ok(!properties?.["requestAllowNetworkReason"], "Expected no requestAllowNetworkReason in schema when per-command network access is disabled");
      ok(!toolData.modelDescription?.includes("requestAllowNetwork=true"), "Expected model description not to recommend allow-network requests when per-command network access is disabled");
    });
    test("should not include requestUnsandboxedExecution in schema when sandbox is disabled", async () => {
      sandboxEnabled = false;
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      const properties = toolData.inputSchema?.properties;
      ok(!properties?.["allowToRunUnsandboxedCommands"], "Expected no allowToRunUnsandboxedCommands when sandbox is disabled");
      ok(!properties?.["requestUnsandboxedExecution"], "Expected no requestUnsandboxedExecution in schema when sandbox is disabled");
      ok(!properties?.["requestUnsandboxedExecutionReason"], "Expected no requestUnsandboxedExecutionReason in schema when sandbox is disabled");
      ok(!properties?.["requestAllowNetwork"], "Expected no requestAllowNetwork in schema when sandbox is disabled");
      ok(!properties?.["requestAllowNetworkReason"], "Expected no requestAllowNetworkReason in schema when sandbox is disabled");
      ok(!properties?.["requestFileValidationCheck"], "Expected no requestFileValidationCheck when sandbox is disabled");
      ok(!properties?.["requestFileValidationCheckReason"], "Expected no requestFileValidationCheckReason when sandbox is disabled");
    });
    test("should reflect sandbox setting changes in tool data", async () => {
      sandboxEnabled = false;
      const toolDataBefore = await instantiationService.invokeFunction(createRunInTerminalToolData);
      const propertiesBefore = toolDataBefore.inputSchema?.properties;
      ok(!propertiesBefore?.["requestUnsandboxedExecution"], "Expected no requestUnsandboxedExecution before enabling sandbox");
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      const toolDataAfter = await instantiationService.invokeFunction(createRunInTerminalToolData);
      const propertiesAfter = toolDataAfter.inputSchema?.properties;
      ok(propertiesAfter?.["requestUnsandboxedExecution"], "Expected requestUnsandboxedExecution after enabling sandbox");
      ok(toolDataAfter.modelDescription?.includes("Sandboxing:"), "Expected sandbox instructions in description after enabling sandbox");
    });
    test("should show confirmation to install missing sandbox dependencies when prereq check fails", async () => {
      sandboxEnabled = false;
      sandboxPrereqResult = {
        enabled: false,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
        missingDependencies: ["bubblewrap"],
        canInstallMissingDependencies: true
      };
      const result = await executeToolTest({
        command: "echo hello",
        explanation: "Print hello",
        goal: "Print hello"
      });
      ok(result, "Expected prepared invocation to be defined");
      ok(result?.confirmationMessages, "Expected confirmationMessages when deps are missing");
      ok(result?.confirmationMessages?.customOptions?.length === 2, "Expected two custom options");
      strictEqual(result?.toolSpecificData?.missingSandboxDependencies?.length, 1);
    });
    test("should request manual installation when no supported package manager is available", async () => {
      sandboxEnabled = false;
      sandboxPrereqResult = {
        enabled: false,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
        missingDependencies: ["bubblewrap"],
        canInstallMissingDependencies: false
      };
      const prepared = await executeToolTest({ command: "echo hello" });
      const result = await invokeToolTest({ command: "echo hello" });
      strictEqual(prepared?.confirmationMessages?.customOptions, void 0);
      ok(result.content[0].value?.includes("system package manager"));
      strictEqual(createTerminalCallCount, 0);
    });
    test("should automatically schedule AppArmor remediation without a repair prompt", async () => {
      setAutoApprove({ echo: true });
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: TerminalSandboxPrerequisiteCheck.Bubblewrap,
        remediations: [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction]
      };
      const result = await executeToolTest({ command: "echo hello" });
      const terminalData = result?.toolSpecificData;
      strictEqual(result?.confirmationMessages, void 0, "Expected no repair confirmation");
      strictEqual(terminalData?.sandboxRemediations?.length, 1, "Expected one repair option in terminal invocation data");
      strictEqual(terminalData?.missingSandboxDependencies, void 0, "Should not classify unusable bubblewrap as missing");
    });
    test("should recheck bubblewrap after dependency installation and not execute when it remains unavailable", async () => {
      let forceRefreshCalled = false;
      terminalSandboxService.checkForSandboxingPrereqs = async (forceRefresh) => {
        if (forceRefresh) {
          forceRefreshCalled = true;
          return {
            enabled: true,
            sandboxConfigPath: "/tmp/sandbox.json",
            failedCheck: TerminalSandboxPrerequisiteCheck.Bubblewrap,
            remediations: [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction]
          };
        }
        return {
          enabled: true,
          sandboxConfigPath: "/tmp/sandbox.json",
          failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
          missingDependencies: ["bubblewrap"],
          canInstallMissingDependencies: true
        };
      };
      const result = await invokeToolTest({ command: "echo hello" }, "install");
      strictEqual(forceRefreshCalled, true, "Expected dependency installation to force a new prerequisite check");
      strictEqual(createTerminalCallCount, 1, "Expected only the installation terminal, not original command execution");
      ok(result.content[0].value?.includes("bubblewrap"), "Expected result to identify the failed bubblewrap verification");
    });
    test("should suggest reloading and retrying if the issue persists after sandbox dependency installation", async () => {
      terminalSandboxService.checkForSandboxingPrereqs = async (forceRefresh) => forceRefresh ? {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      } : {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
        missingDependencies: ["bubblewrap", "socat"],
        canInstallMissingDependencies: true
      };
      const result = await invokeToolTest({ command: "echo hello" }, "install");
      strictEqual(createTerminalCallCount, 1, "Expected only the installation terminal, not original command execution");
      ok(result.content[0].value?.includes("If the issue persists, reload the window and try running the command again"), "Expected conditional reload and retry guidance");
    });
    test("should automatically repair AppArmor, probe again, and execute", async () => {
      runInTerminalTool.disableProcessIdAssociation();
      let forceRefreshCalled = false;
      terminalSandboxService.checkForSandboxingPrereqs = async (forceRefresh) => {
        forceRefreshCalled ||= forceRefresh === true;
        return forceRefresh ? {
          enabled: true,
          sandboxConfigPath: "/tmp/sandbox.json",
          failedCheck: void 0
        } : {
          enabled: true,
          sandboxConfigPath: "/tmp/sandbox.json",
          failedCheck: TerminalSandboxPrerequisiteCheck.Bubblewrap,
          remediations: [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction]
        };
      };
      let remediationCalled = false;
      terminalSandboxService.runSandboxRemediation = async () => {
        remediationCalled = true;
        return { exitCode: 0 };
      };
      const result = await invokeToolTest({ command: "echo hello" });
      createdTerminalInstance.dispose();
      strictEqual(remediationCalled, true);
      strictEqual(forceRefreshCalled, true, "Expected a probe after AppArmor remediation");
      strictEqual(createTerminalCallCount, 1, "Expected the original command to execute");
      ok(result.content.length > 0);
    });
    test("should report sandboxing unsupported when bubblewrap repair execution fails or is indeterminate", async () => {
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: TerminalSandboxPrerequisiteCheck.Bubblewrap,
        remediations: [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction]
      };
      let previousMessage;
      for (const exitCode of [1, void 0]) {
        terminalSandboxService.runSandboxRemediation = async () => ({ exitCode });
        const result = await invokeToolTest({ command: "echo hello" });
        strictEqual(createTerminalCallCount, 0, "Expected the original command not to execute");
        const message = result.content[0].value ?? "";
        ok(message.includes("Sandboxing is not supported in this environment"), "Expected unsupported environment guidance after repair execution failure");
        ok(message.includes("chat.agent.sandbox.enabled"), "Expected guidance to identify the sandbox setting");
        if (previousMessage !== void 0) {
          strictEqual(message, previousMessage, "Expected the same message irrespective of the remediation exit code");
        }
        previousMessage = message;
        ok(typeof result.toolResultMessage !== "string" && result.toolResultMessage?.value.includes("command:workbench.action.openSettings"), "Expected a settings command link in the user-facing message");
      }
    });
    test("should not execute when bubblewrap is unusable and no supported remediation is available", async () => {
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: TerminalSandboxPrerequisiteCheck.Bubblewrap
      };
      const result = await invokeToolTest({ command: "echo hello" });
      strictEqual(createTerminalCallCount, 0, "Expected no terminal execution for unusable bubblewrap");
      ok(result.content[0].value?.includes("Bubblewrap"), "Expected a bubblewrap capability failure message");
    });
    test("should include allowed and denied network domains in model description", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
      sandboxEnabled = true;
      terminalSandboxService.getResolvedNetworkDomains = () => ({
        allowedDomains: ["github.com", "npmjs.org"],
        deniedDomains: ["evil.com"]
      });
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      ok(toolData.modelDescription?.includes("github.com, npmjs.org"), "Expected allowed domains in description");
      ok(toolData.modelDescription?.includes("evil.com"), "Expected denied domains in description");
      ok(toolData.modelDescription?.includes("requestAllowNetwork=true"), "Expected model description to recommend network-enabled sandbox execution first");
      ok(toolData.modelDescription?.includes("reactively after a network failure"), "Expected model description to allow reactive allow-network requests after a sandbox network failure");
      ok(toolData.modelDescription?.includes("HTTP code 403"), "Expected model description to contain HTTP code 403 as evidence of blocked network access");
    });
    test("should exclude denied domains from effective allowed list", async () => {
      sandboxEnabled = true;
      terminalSandboxService.getResolvedNetworkDomains = () => ({
        allowedDomains: ["github.com", "evil.com", "npmjs.org"],
        deniedDomains: ["evil.com"]
      });
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      ok(toolData.modelDescription?.includes("github.com, npmjs.org"), "Expected effective allowed list without denied domain");
      ok(!toolData.modelDescription?.includes("accessible in the sandbox (all other network access is blocked): github.com, evil.com"), "Expected denied domain removed from allowed list");
    });
    test("should use sandbox labels when command is sandbox wrapped", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/vscode-sandbox-settings.json",
        failedCheck: void 0
      };
      terminalSandboxService.wrapCommand = async (command) => ({
        command: `sandbox-runtime ${command}`,
        isSandboxWrapped: true
      });
      const preparedInvocation = await executeToolTest({ command: "echo hello" });
      ok(preparedInvocation, "Expected prepared invocation to be defined");
      strictEqual(preparedInvocation.invocationMessage.value, "Running `echo hello` in sandbox");
      const terminalData = preparedInvocation.toolSpecificData;
      strictEqual(terminalData.commandLine.isSandboxWrapped, true);
    });
    test("should enable sandboxing when chat permission level is default", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/vscode-sandbox-settings.json",
        failedCheck: void 0
      };
      const sessionResource = LocalChatSessionUri.forSession("sandbox-default-permission-session");
      instantiationService.stub(IChatWidgetService, {
        getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.Default } } })),
        lastFocusedWidget: void 0
      });
      const defaultPermissionTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const preparedInvocation = await defaultPermissionTool.prepareToolInvocation({
        parameters: {
          command: "echo hello",
          explanation: "Print hello",
          goal: "Print hello",
          mode: "sync"
        },
        chatSessionResource: sessionResource
      }, CancellationToken.None);
      const terminalData = preparedInvocation.toolSpecificData;
      strictEqual(terminalData.commandLine.isSandboxWrapped, true);
      strictEqual(preparedInvocation.invocationMessage.value, "Running `echo hello` in sandbox");
    });
    test("should disable sandboxing when chat permission level is elevated", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/vscode-sandbox-settings.json",
        failedCheck: void 0
      };
      const originalWrapCommand = terminalSandboxService.wrapCommand.bind(terminalSandboxService);
      for (const permissionLevel of [ChatPermissionLevel.AutoApprove, ChatPermissionLevel.Autopilot]) {
        let wrapCalls = 0;
        terminalSandboxService.wrapCommand = async (...args) => {
          wrapCalls++;
          return originalWrapCommand(...args);
        };
        const sessionResource = LocalChatSessionUri.forSession(`sandbox-${permissionLevel}-permission-session`);
        instantiationService.stub(IChatWidgetService, {
          getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel } } })),
          lastFocusedWidget: void 0
        });
        const elevatedPermissionTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
        const preparedInvocation = await elevatedPermissionTool.prepareToolInvocation({
          parameters: {
            command: "echo hello",
            explanation: "Print hello",
            goal: "Print hello",
            mode: "sync"
          },
          chatSessionResource: sessionResource
        }, CancellationToken.None);
        const terminalData = preparedInvocation.toolSpecificData;
        strictEqual(terminalData.commandLine.isSandboxWrapped, false, `Expected no sandbox wrapping for ${permissionLevel}`);
        strictEqual(terminalData.requestUnsandboxedExecution, false, `Expected no unsandbox confirmation for ${permissionLevel}`);
        strictEqual(preparedInvocation.invocationMessage.value, "Running `echo hello`");
        strictEqual(wrapCalls, 0, `Expected sandbox wrapping to be skipped for ${permissionLevel}`);
        terminalSandboxService.wrapCommand = originalWrapCommand;
      }
    });
    test("should use request permission level before current widget permission level", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/vscode-sandbox-settings.json",
        failedCheck: void 0
      };
      const sessionResource = LocalChatSessionUri.forSession("sandbox-request-permission-session");
      const requestId = "sandbox-request-permission-request";
      createChatModelWithRequest(sessionResource, createChatModeInfo(ChatPermissionLevel.AutoApprove), requestId);
      instantiationService.stub(IChatWidgetService, {
        getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.Default } } })),
        lastFocusedWidget: void 0
      });
      const requestPermissionTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const preparedInvocation = await requestPermissionTool.prepareToolInvocation({
        parameters: {
          command: "echo hello",
          explanation: "Print hello",
          goal: "Print hello",
          mode: "sync"
        },
        chatSessionResource: sessionResource,
        chatRequestId: requestId
      }, CancellationToken.None);
      const terminalData = preparedInvocation.toolSpecificData;
      strictEqual(terminalData.commandLine.isSandboxWrapped, false);
      strictEqual(preparedInvocation.invocationMessage.value, "Running `echo hello`");
    });
    test("should not show sandbox wrapper in chat when sandboxed async command is detached", async () => {
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      setConfig(TerminalChatAgentToolsSettingId.DetachBackgroundProcesses, true);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/vscode-sandbox-settings.json",
        failedCheck: void 0
      };
      terminalSandboxService.wrapCommand = async (command) => ({
        command: `sandbox-runtime ${command}`,
        isSandboxWrapped: true
      });
      const preparedInvocation = await executeToolTest({ command: "echo hello", mode: "async" });
      ok(preparedInvocation, "Expected prepared invocation to be defined");
      strictEqual(preparedInvocation.invocationMessage.value, "Running `echo hello` in sandbox");
      const terminalData = preparedInvocation.toolSpecificData;
      strictEqual(terminalData.commandLine.forDisplay, "echo hello");
      strictEqual(terminalData.commandLine.toolEdited, "nohup sandbox-runtime echo hello & disown");
    });
  });
  suite("automatic sandbox retry", () => {
    const baseRetryOptions = {
      allowUnsandboxedCommands: true,
      didSandboxWrapCommand: true,
      requestUnsandboxedExecution: false,
      isPersistentSession: false,
      isBackgroundExecution: false,
      didTimeout: false,
      exitCode: 1,
      output: "/bin/bash: /workspace/out.txt: Operation not permitted"
    };
    const baseAllowNetworkRetryOptions = {
      retryWithAllowNetworkRequests: true,
      didSandboxWrapCommand: true,
      requestUnsandboxedExecution: false,
      requestAllowNetwork: false,
      isPersistentSession: false,
      isBackgroundExecution: false,
      didTimeout: false,
      exitCode: 1,
      output: "connect: Operation not permitted"
    };
    test("should retry completed foreground sandbox commands when output indicates sandbox block", () => {
      strictEqual(shouldAutomaticallyRetryUnsandboxed(baseRetryOptions), true);
    });
    test("should detect bubblewrap host restrictions across wrapped output lines", () => {
      strictEqual(outputLooksBubblewrapHostRestricted("bwrap: No permissions to create new\nnamespace"), true);
      strictEqual(outputLooksBubblewrapHostRestricted("bwrap: failed to bind mount"), false);
    });
    test("should direct the user to disable sandboxing when bubblewrap is restricted by the host", () => {
      const result = runInTerminalTool.getBubblewrapHostRestrictedResult();
      const message = result.content[0].value;
      ok(message?.includes(AgentSandboxSettingId.AgentSandboxEnabled));
      ok(message?.includes("Sandboxing can be disabled by setting"));
      strictEqual(result.toolResultMessage, message);
    });
    test("should not retry when unsandboxed commands are disabled", () => {
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        allowUnsandboxedCommands: false
      }), false);
    });
    test("should not retry when the command is already unsandboxed", () => {
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        requestUnsandboxedExecution: true
      }), false);
    });
    test("should not automatically retry outside the sandbox for apparent network failures", () => {
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        output: "connect: Operation not permitted"
      }), false);
    });
    test("should retry in the sandbox by allowing network for apparent network failures", () => {
      strictEqual(shouldAutomaticallyRetryAllowNetworkInSandboxed(baseAllowNetworkRetryOptions), true);
    });
    test("should not retry with allow-network when disabled or already requested", () => {
      strictEqual(shouldAutomaticallyRetryAllowNetworkInSandboxed({
        ...baseAllowNetworkRetryOptions,
        retryWithAllowNetworkRequests: false
      }), false);
      strictEqual(shouldAutomaticallyRetryAllowNetworkInSandboxed({
        ...baseAllowNetworkRetryOptions,
        requestAllowNetwork: true
      }), false);
      strictEqual(shouldAutomaticallyRetryAllowNetworkInSandboxed({
        ...baseAllowNetworkRetryOptions,
        requestUnsandboxedExecution: true
      }), false);
      strictEqual(shouldAutomaticallyRetryAllowNetworkInSandboxed({
        ...baseAllowNetworkRetryOptions,
        output: "regular command failure"
      }), false);
    });
    test("should not retry background, timed-out, successful, or non-sandbox-blocked results", () => {
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        isBackgroundExecution: true
      }), false);
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        didTimeout: true
      }), false);
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        exitCode: 0
      }), false);
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        output: "regular command failure"
      }), false);
    });
    test("should show retry elicitation when prepared invocation was auto-approved", async () => {
      setAutoApprove({ echo: true });
      const sessionResource = LocalChatSessionUri.forSession("auto-retry-auto-approved-session");
      const preparedInvocation = await executeToolTest({ command: "echo hello" });
      assertAutoApproved(preparedInvocation);
      await assertAutomaticUnsandboxRetryElicitation(runInTerminalTool, sessionResource, "echo hello", "bash", void 0);
    });
    test("should auto-retry without elicitation when session is in auto-approve permission level", async () => {
      const sessionResource = LocalChatSessionUri.forSession("auto-retry-approval-session");
      instantiationService.stub(IChatWidgetService, {
        getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } } })),
        lastFocusedWidget: void 0
      });
      const autoApproveRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const preparedInvocation = await autoApproveRunInTerminalTool.prepareToolInvocation({
        parameters: {
          command: "rm dangerous-file.txt",
          explanation: "Remove a file",
          goal: "Remove a file",
          mode: "sync",
          timeout: 3e4
        },
        chatSessionResource: sessionResource
      }, CancellationToken.None);
      assertAutoApproved(preparedInvocation);
      const model = createChatModelWithRequest(sessionResource);
      const shouldRetry = await confirmAutomaticUnsandboxRetry(autoApproveRunInTerminalTool, sessionResource, "rm dangerous-file.txt", "bash", void 0);
      strictEqual(shouldRetry, true, "Expected auto-approve session to retry without prompting");
      const elicitation = model.getRequests().at(-1)?.response?.response.value.find((part) => part.kind === "elicitation2");
      ok(!elicitation, "Expected no elicitation in auto-approve session");
    });
    test("should show retry elicitation when prepared invocation required confirmation", async () => {
      setAutoApprove({});
      const preparedInvocation = await executeToolTest({ command: "rm dangerous-file.txt" });
      assertConfirmationRequired(preparedInvocation);
      await assertAutomaticUnsandboxRetryElicitation(runInTerminalTool, LocalChatSessionUri.forSession("auto-retry-confirmation-required-session"), "rm dangerous-file.txt", "bash", void 0);
    });
    test("should use retry confirmation title without sandbox link", () => {
      const title = getAutomaticUnsandboxRetryTitle(runInTerminalTool, "bash", void 0);
      strictEqual(title.value, "Run `bash` command outside the sandbox?");
    });
    test("should use retry confirmation title without sandbox link for blocked domains", () => {
      const title = getAutomaticUnsandboxRetryTitle(runInTerminalTool, "bash", ["example.com"]);
      strictEqual(title.value, "Run `bash` command outside the sandbox to access `example.com`?");
    });
    test("should use allow-network retry confirmation title without sandbox link", () => {
      const title = getAutomaticAllowNetworkRetryTitle(runInTerminalTool, "bash", void 0);
      strictEqual(title.value, "Retry `bash` command in the sandbox by allowing network access?");
    });
    test("should use allow-network retry confirmation title without sandbox link for blocked domains", () => {
      const title = getAutomaticAllowNetworkRetryTitle(runInTerminalTool, "bash", ["example.com"]);
      strictEqual(title.value, "Retry `bash` command in the sandbox by allowing network access to `example.com`?");
    });
    test("should show allow-network retry elicitation with sandbox-preserving title", async () => {
      await assertAutomaticAllowNetworkRetryElicitation(
        runInTerminalTool,
        LocalChatSessionUri.forSession("auto-retry-allow-network-session"),
        "curl https://example.com",
        "bash",
        void 0,
        "Retry `bash` command in the sandbox by allowing network access?"
      );
    });
    test("should show retry elicitation when sandbox force-approved command would otherwise require confirmation", async () => {
      setAutoApprove({});
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/vscode-sandbox-settings.json",
        failedCheck: void 0
      };
      const preparedInvocation = await executeToolTest({ command: "rm dangerous-file.txt" });
      assertAutoApproved(preparedInvocation);
      const terminalData = preparedInvocation.toolSpecificData;
      strictEqual(terminalData.commandLine.isSandboxWrapped, true);
      await assertAutomaticUnsandboxRetryElicitation(runInTerminalTool, LocalChatSessionUri.forSession("auto-retry-sandbox-force-approved-session"), "rm dangerous-file.txt", "bash", void 0);
    });
  });
  suite("default auto-approve rules", () => {
    const defaults = terminalChatAgentToolsConfiguration[TerminalChatAgentToolsSettingId.AutoApprove].default;
    suiteSetup(() => {
      ok(Object.keys(defaults).length > 50);
    });
    setup(() => {
      setAutoApprove(defaults);
    });
    const autoApprovedTestCases = [
      // Safe commands
      "echo abc",
      'echo "abc"',
      "echo 'abc'",
      "ls -la",
      "dir",
      "pwd",
      "cat file.txt",
      "head -n 10 file.txt",
      "tail -f log.txt",
      "findstr pattern file.txt",
      "wc -l file.txt",
      "tr a-z A-Z",
      "cut -d: -f1",
      "cmp file1 file2",
      "which node",
      "basename /path/to/file",
      "dirname /path/to/file",
      "realpath .",
      "readlink symlink",
      "stat file.txt",
      "file document.pdf",
      "du -sh folder",
      "df -h",
      "sleep 5",
      "cd /home/user",
      "nl -ba path/to/file.txt",
      // Safe git sub-commands
      "git status",
      "git log --oneline",
      "git show HEAD",
      "git diff main",
      'git grep "TODO"',
      // PowerShell commands
      "Get-ChildItem",
      "Get-Date",
      "Get-Random",
      "Get-Location",
      "Set-Location C:\\Users\\test",
      'Write-Host "Hello"',
      'Write-Output "Test"',
      "Out-String",
      "Split-Path C:\\Users\\test",
      "Join-Path C:\\Users test",
      "Start-Sleep 2",
      // PowerShell safe verbs (regex patterns)
      "Select-Object Name",
      "Measure-Object Length",
      "Compare-Object $a $b",
      "Format-Table",
      "Sort-Object Name",
      // Commands with acceptable arguments
      "column data.txt",
      "date +%Y-%m-%d",
      'find . -name "*.txt"',
      "grep pattern file.txt",
      "rg pattern file.txt",
      "rg --json pattern .",
      'rg -i --color=never "TODO" src/',
      'sed "s/foo/bar/g"',
      'sed -n "1,10p" file.txt',
      "sed -n '45,80p' /foo/bar/Example.java",
      "sed -n '45,80p' extensions/markdown-language-features/src/test/copyFile.test.ts",
      "sort file.txt",
      "tree directory",
      // od
      "od somefile",
      "od -A x somefile",
      // xxd
      "xxd",
      "xxd somefile",
      "xxd -l100 somefile",
      "xxd -r somefile",
      "xxd -rp somefile",
      // docker readonly sub-commands
      "docker ps",
      "docker ps -a",
      "docker images",
      "docker info",
      "docker version",
      "docker inspect mycontainer",
      "docker logs mycontainer",
      "docker top mycontainer",
      "docker stats",
      "docker port mycontainer",
      "docker diff mycontainer",
      "docker search nginx",
      "docker events",
      "docker container ls",
      "docker container ps",
      "docker container inspect mycontainer",
      "docker image ls",
      "docker image history myimage",
      "docker image inspect myimage",
      "docker network ls",
      "docker network inspect mynetwork",
      "docker volume ls",
      "docker volume inspect myvolume",
      "docker context ls",
      "docker context inspect mycontext",
      "docker context show",
      "docker system df",
      "docker system info",
      "docker compose ps",
      "docker compose ls",
      "docker compose top",
      "docker compose logs",
      "docker compose images",
      "docker compose config",
      "docker compose version",
      "docker compose port",
      "docker compose events"
    ];
    const confirmationRequiredTestCases = [
      // git log file output
      "git log --output=log.txt",
      // Dangerous file operations
      "rm README.md",
      "rmdir folder",
      "del file.txt",
      "Remove-Item file.txt",
      "ri file.txt",
      "rd folder",
      "erase file.txt",
      "dd if=/dev/zero of=file",
      // Process management
      "kill 1234",
      "ps aux",
      "top",
      "Stop-Process -Id 1234",
      "spps notepad",
      "taskkill /f /im notepad.exe",
      "taskkill.exe /f /im cmd.exe",
      // Web requests
      "curl https://example.com",
      "wget https://example.com/file",
      "Invoke-RestMethod https://api.example.com",
      "Invoke-WebRequest https://example.com",
      "irm https://example.com",
      "iwr https://example.com",
      // File permissions
      "chmod 755 file.sh",
      "chown user:group file.txt",
      "Set-ItemProperty file.txt IsReadOnly $true",
      "sp file.txt IsReadOnly $true",
      "Set-Acl file.txt $acl",
      // Command execution
      "jq '.name' file.json",
      "xargs rm",
      'eval "echo hello"',
      'Invoke-Expression "Get-Date"',
      'iex "Write-Host test"',
      // Commands with dangerous arguments
      "column -c 10000 file.txt",
      'date --set="2023-01-01"',
      "find . -delete",
      "find . -exec rm {} \\;",
      "find . -execdir rm {} \\;",
      "find . -fprint output.txt",
      "rg --pre cat pattern .",
      "rg --hostname-bin hostname pattern .",
      'sed --in-place "s/foo/bar/" file.txt',
      'sed -e "s/a/b/" file.txt',
      "sed -f script.sed file.txt",
      'sed --expression "s/a/b/" file.txt',
      "sed --file script.sed file.txt",
      'sed "s/foo/bar/e" file.txt',
      'sed "s/foo/bar/w output.txt" file.txt',
      'sed ";W output.txt" file.txt',
      "sort -o /etc/passwd file.txt",
      "sort -S 100G file.txt",
      "tree -o output.txt",
      // Transient environment variables
      'ls="test" curl https://api.example.com',
      "API_KEY=secret curl https://api.example.com",
      "HTTP_PROXY=proxy:8080 wget https://example.com",
      "VAR1=value1 VAR2=value2 echo test",
      "A=1 B=2 C=3 ./script.sh",
      // xxd with outfile or ambiguous args
      "xxd infile outfile",
      "xxd -l 100 somefile",
      // docker write/execute sub-commands
      "docker run nginx",
      "docker exec mycontainer bash",
      "docker rm mycontainer",
      "docker rmi myimage",
      "docker build .",
      "docker push myimage",
      "docker pull nginx",
      "docker compose up",
      "docker compose down"
    ];
    suite.skip("auto approved", () => {
      for (const command of autoApprovedTestCases) {
        test(command.replaceAll("\n", "\\n"), async () => {
          assertAutoApproved(await executeToolTest({ command }));
        });
      }
    });
    suite("confirmation required", () => {
      for (const command of confirmationRequiredTestCases) {
        test(command.replaceAll("\n", "\\n"), async () => {
          assertConfirmationRequired(await executeToolTest({ command }));
        });
      }
    });
  });
  suite("retry outside sandbox", () => {
    test("should mention denied domains when sandbox denies network access explicitly", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      terminalSandboxService.wrapCommand = async (command) => ({
        command: `unsandboxed:${command}`,
        isSandboxWrapped: false,
        requiresUnsandboxConfirmation: true,
        blockedDomains: ["evil.com"],
        deniedDomains: ["evil.com"]
      });
      const result = await executeToolTest({ command: "curl https://evil.com" });
      assertConfirmationRequired(result, "Run `bash` command outside the [sandbox](https://aka.ms/vscode-sandboxing) to access `evil.com`?");
      const confirmationMessage = result?.confirmationMessages?.message;
      ok(confirmationMessage && typeof confirmationMessage !== "string");
      if (!confirmationMessage || typeof confirmationMessage === "string") {
        throw new Error("Expected markdown confirmation message");
      }
      ok(confirmationMessage.value.includes("Reason for leaving the sandbox: This command accesses evil.com, which is blocked by chat.agent.deniedNetworkDomains."));
    });
    test("should force confirmation for explicit sandboxed allow-network requests", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      terminalSandboxService.wrapCommand = async (command, _requestUnsandboxedExecution, _shell, _cwd, _details, requestAllowNetwork) => ({
        command: requestAllowNetwork ? `network-sandbox:${command}` : `sandbox:${command}`,
        isSandboxWrapped: true,
        requiresAllowNetworkConfirmation: requestAllowNetwork ? true : void 0
      });
      const result = await executeToolTest({
        requestAllowNetwork: true,
        requestAllowNetworkReason: "Needs registry access while remaining sandboxed"
      });
      assertConfirmationRequired(result, "Allow bash command to access the network?");
      const terminalData = result?.toolSpecificData;
      strictEqual(terminalData.requestAllowNetwork, true);
      strictEqual(terminalData.requestAllowNetworkReason, "Needs registry access while remaining sandboxed");
      strictEqual(terminalData.commandLine.toolEdited, "network-sandbox:echo hello");
      const confirmationMessage = result?.confirmationMessages?.message;
      ok(confirmationMessage && typeof confirmationMessage !== "string");
      if (!confirmationMessage || typeof confirmationMessage === "string") {
        throw new Error("Expected markdown confirmation message");
      }
      ok(confirmationMessage.value.includes("Reason for allowing unrestricted network access in the sandbox: Needs registry access while remaining sandboxed"));
    });
    test("should use allow-network confirmation for blocked domains selected before execution", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      terminalSandboxService.wrapCommand = async (command) => ({
        command: `network-sandbox:${command}`,
        isSandboxWrapped: true,
        requiresAllowNetworkConfirmation: true,
        blockedDomains: ["evil.com"],
        deniedDomains: ["evil.com"]
      });
      const result = await executeToolTest({ command: "curl https://evil.com" });
      assertConfirmationRequired(result, "Allow bash command to access the network?");
      const terminalData = result?.toolSpecificData;
      strictEqual(terminalData.requestAllowNetwork, true);
      strictEqual(terminalData.requestUnsandboxedExecution, false);
      const confirmationMessage = result?.confirmationMessages?.message;
      ok(confirmationMessage && typeof confirmationMessage !== "string");
      if (!confirmationMessage || typeof confirmationMessage === "string") {
        throw new Error("Expected markdown confirmation message");
      }
      ok(confirmationMessage.value.includes("Reason for allowing unrestricted network access in the sandbox: This command accesses evil.com, which is blocked by chat.agent.deniedNetworkDomains."));
    });
    test("should reject explicit allow-network requests when per-command network access is disabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, false);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      const prepared = await executeToolTest({ requestAllowNetwork: true, requestAllowNetworkReason: "Needs registry access" });
      ok(prepared, "Expected prepared invocation to be defined");
      ok(!prepared.confirmationMessages, "Expected no confirmation because the command will not run");
      ok(prepared.invocationMessage.value.includes("unrestricted network access in the sandbox is disabled"));
      const result = await invokeToolTest({ requestAllowNetwork: true, requestAllowNetworkReason: "Needs registry access" });
      strictEqual(createTerminalCallCount, 0, "Expected no terminal to be created");
      ok(result.toolResultError, "Expected the rejected request to be returned as a tool error");
      ok(result.content[0].kind === "text" && result.content[0].value.includes("chat.agent.sandbox.retryWithAllowNetworkRequests"));
    });
    test("should not create a terminal when sandbox file access is denied", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      terminalSandboxService.checkFileAccess = async (permission, paths) => {
        strictEqual(permission, "write", "Expected file validation to check write access");
        return { allowed: false, denied: [...paths] };
      };
      const result = await invokeToolTest({
        requestFileValidationCheck: ["/home/user/outside-workspace-file"],
        requestFileValidationCheckReason: "The command writes an outside-workspace file"
      });
      strictEqual(createTerminalCallCount, 0, "Expected no terminal to be created");
      ok(result.toolResultError, "Expected denied file access to be returned as a tool error");
      ok(result.content[0].kind === "text" && result.content[0].value.includes("Access Denied"));
      ok(result.content[0].kind === "text" && result.content[0].value.includes("write: /home/user/outside-workspace-file"));
    });
    test("should force confirmation for explicit unsandboxed execution requests", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      const result = await executeToolTest({
        requestUnsandboxedExecution: true,
        requestUnsandboxedExecutionReason: "Needs network access outside the sandbox"
      });
      assertConfirmationRequired(result, "Run `bash` command outside the [sandbox](https://aka.ms/vscode-sandboxing)?");
      strictEqual(result?.confirmationMessages?.allowAutoConfirm, void 0);
      const terminalData = result?.toolSpecificData;
      strictEqual(terminalData.requestUnsandboxedExecution, true);
      strictEqual(terminalData.requestUnsandboxedExecutionReason, "Needs network access outside the sandbox");
      strictEqual(terminalData.commandLine.toolEdited, "unsandboxed:echo hello");
      const confirmationMessage = result?.confirmationMessages?.message;
      ok(confirmationMessage && typeof confirmationMessage !== "string");
      if (!confirmationMessage || typeof confirmationMessage === "string") {
        throw new Error("Expected markdown confirmation message");
      }
      ok(confirmationMessage.value.includes("Reason for leaving the sandbox: Needs network access outside the sandbox"));
      strictEqual(result?.confirmationMessages?.disclaimer, void 0);
      const actions = result?.confirmationMessages?.terminalCustomActions;
      ok(actions, "Expected custom actions to be defined");
      strictEqual(actions.length, 11);
      ok(!isSeparator(actions[0]));
      strictEqual(actions[0].label, "Allow `echo \u2026` in this Session");
      ok(!isSeparator(actions[4]));
      strictEqual(actions[4].label, "Allow Exact Command Line in this Session");
      ok(!isSeparator(actions[10]));
      strictEqual(actions[10].label, "Configure Auto Approve...");
    });
    test("should reject explicit unsandboxed execution requests when unsandboxed commands are disabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, false);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      const result = await executeToolTest({
        requestUnsandboxedExecution: true,
        requestUnsandboxedExecutionReason: "Needs network access outside the sandbox"
      });
      ok(result, "Expected prepared invocation to be defined");
      ok(!result.confirmationMessages, "Expected no confirmation because the command will not run");
      ok(result.invocationMessage.value.includes("Not running `echo hello` because unsandboxed execution is disabled"));
      const terminalData = result.toolSpecificData;
      strictEqual(terminalData.requestUnsandboxedExecution, false);
      strictEqual(terminalData.requestUnsandboxedExecutionReason, void 0);
      strictEqual(terminalData.commandLine.toolEdited, void 0);
    });
    test("should reject explicit unsandboxed execution requests when allow argument is false", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      const result = await executeToolTest({
        allowToRunUnsandboxedCommands: false,
        requestUnsandboxedExecution: true,
        requestUnsandboxedExecutionReason: "Needs network access outside the sandbox"
      });
      ok(result, "Expected prepared invocation to be defined");
      ok(!result.confirmationMessages, "Expected no confirmation because the command will not run");
      ok(result.invocationMessage.value.includes("Not running `echo hello` because unsandboxed execution is disabled"));
      const terminalData = result.toolSpecificData;
      strictEqual(terminalData.requestUnsandboxedExecution, false);
      strictEqual(terminalData.requestUnsandboxedExecutionReason, void 0);
      strictEqual(terminalData.commandLine.toolEdited, void 0);
    });
    test("should not create a terminal for rejected explicit unsandboxed execution requests", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, false);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      const result = await invokeToolTest({
        requestUnsandboxedExecution: true,
        requestUnsandboxedExecutionReason: "Needs network access outside the sandbox"
      });
      strictEqual(createTerminalCallCount, 0, "Expected no terminal to be created");
      ok(result.toolResultError, "Expected the rejected request to be returned as a tool error");
      ok(result.content[0].kind === "text" && result.content[0].value.includes("The command was not executed"));
      ok(result.content[0].kind === "text" && result.content[0].value.includes("chat.agent.sandbox.allowUnsandboxedCommands"));
    });
    test("should auto-approve sandboxed commands when sandbox auto approve is enabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxAllowAutoApprove, true);
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      const result = await executeToolTest({ command: "rm dangerous-file.txt" });
      assertAutoApproved(result);
      const terminalData = result.toolSpecificData;
      strictEqual(terminalData.commandLine.isSandboxWrapped, true);
    });
    test("should use existing approval flow for sandboxed commands when sandbox auto approve is disabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxAllowAutoApprove, false);
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      const result = await executeToolTest({ command: "rm dangerous-file.txt" });
      assertConfirmationRequired(result);
      const terminalData = result.toolSpecificData;
      strictEqual(terminalData.commandLine.isSandboxWrapped, true);
    });
  });
  suite("prepareToolInvocation - auto approval behavior", () => {
    test("should auto-approve commands in allow list", async () => {
      setAutoApprove({
        echo: true
      });
      const result = await executeToolTest({ command: "echo hello world" });
      assertAutoApproved(result);
    });
    test("should require confirmation for commands not in allow list", async () => {
      setAutoApprove({
        ls: true
      });
      const result = await executeToolTest({
        command: "rm file.txt",
        explanation: "Remove a file",
        goal: "Remove a file"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
    });
    test("should require confirmation for commands in deny list even if in allow list", async () => {
      setAutoApprove({
        rm: false,
        echo: true
      });
      const result = await executeToolTest({
        command: "rm dangerous-file.txt",
        explanation: "Remove a dangerous file",
        goal: "Remove a dangerous file"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
    });
    test("should handle background commands with confirmation", async () => {
      setAutoApprove({
        ls: true
      });
      const result = await executeToolTest({
        command: "npm run watch",
        explanation: "Start watching for file changes",
        goal: "Start watching for file changes",
        mode: "async"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
    });
    test("should support legacy isBackground input as async mode", async () => {
      setAutoApprove({
        ls: true
      });
      const result = await executeToolTest({
        command: "npm run watch",
        explanation: "Start watching for file changes",
        goal: "Start watching for file changes",
        isBackground: true
      });
      assertConfirmationRequired(result, "Run `bash` command?");
    });
    test("should auto-approve background commands in allow list", async () => {
      setAutoApprove({
        npm: true
      });
      const result = await executeToolTest({
        command: "npm run watch",
        explanation: "Start watching for file changes",
        goal: "Start watching for file changes",
        mode: "async"
      });
      assertAutoApproved(result);
    });
    test("should include auto-approve info for background commands", async () => {
      setAutoApprove({
        npm: true
      });
      const result = await executeToolTest({
        command: "npm run watch",
        explanation: "Start watching for file changes",
        goal: "Start watching for file changes",
        mode: "async"
      });
      assertAutoApproved(result);
      ok(result?.toolSpecificData, "Expected toolSpecificData to be defined");
      const terminalData = result.toolSpecificData;
      ok(terminalData.autoApproveInfo, "Expected autoApproveInfo to be defined for auto-approved background command");
      ok(terminalData.autoApproveInfo.value, "Expected autoApproveInfo to have a value");
      ok(terminalData.autoApproveInfo.value.includes("npm"), "Expected autoApproveInfo to mention the approved rule");
    });
    test("should handle regex patterns in allow list", async () => {
      setAutoApprove({
        "/^git (status|log)/": true
      });
      const result = await executeToolTest({ command: "git status --porcelain" });
      assertAutoApproved(result);
    });
    test("should handle complex command chains with sub-commands", async () => {
      setAutoApprove({
        echo: true,
        ls: true
      });
      const result = await executeToolTest({ command: 'echo "hello" && ls -la' });
      assertAutoApproved(result);
    });
    test("should require confirmation when one sub-command is not approved", async () => {
      setAutoApprove({
        echo: true
      });
      const result = await executeToolTest({ command: 'echo "hello" && rm file.txt' });
      assertConfirmationRequired(result);
    });
    test("should handle empty command strings", async () => {
      setAutoApprove({
        echo: true
      });
      const result = await executeToolTest({
        command: "",
        explanation: "Empty command",
        goal: "Empty command"
      });
      assertAutoApproved(result);
    });
    test("should handle matchCommandLine: true patterns", async () => {
      setAutoApprove({
        "/dangerous/": { approve: false, matchCommandLine: true },
        "echo": { approve: true, matchCommandLine: true }
      });
      const result1 = await executeToolTest({ command: "echo hello world" });
      assertAutoApproved(result1);
      const result2 = await executeToolTest({ command: "echo this is a dangerous command" });
      assertConfirmationRequired(result2);
    });
    test("should only approve when neither sub-commands or command lines are denied", async () => {
      setAutoApprove({
        "foo": true,
        "/^foo$/": { approve: false, matchCommandLine: true }
      });
      const result1 = await executeToolTest({ command: "foo" });
      assertConfirmationRequired(result1);
      const result2 = await executeToolTest({ command: "foo bar" });
      assertAutoApproved(result2);
    });
  });
  suite("confirmation title with presentation overrides", () => {
    function injectMockPresenter(tool, languageDisplayName) {
      tool.commandLinePresenters.unshift({
        present: (options) => ({
          commandLine: options.commandLine.forDisplay,
          processOtherPresenters: false,
          languageDisplayName
        })
      });
    }
    test("should use withoutLanguage title when presenter returns no languageDisplayName", async () => {
      injectMockPresenter(runInTerminalTool);
      const result = await executeToolTest({
        command: "rm file.txt",
        explanation: "Remove a file",
        goal: "Remove a file"
      });
      assertConfirmationRequired(result, "Run command in `bash`?");
    });
    test("should use withoutLanguage background title when presenter returns no languageDisplayName", async () => {
      injectMockPresenter(runInTerminalTool);
      const result = await executeToolTest({
        command: "npm run watch",
        explanation: "Start watching",
        goal: "Start watching",
        mode: "async"
      });
      assertConfirmationRequired(result, "Run command in `bash`?");
    });
    test("should use withLanguage title when presenter returns languageDisplayName", async () => {
      const result = await executeToolTest({
        command: 'node -e "console.log(1)"',
        explanation: "Run node command",
        goal: "Run node command"
      });
      assertConfirmationRequired(result, "Run `Node.js` command in `bash`?");
    });
    test("should use withLanguage background title when presenter returns languageDisplayName", async () => {
      const result = await executeToolTest({
        command: 'node -e "console.log(1)"',
        explanation: "Run node command",
        goal: "Run node command",
        mode: "async"
      });
      assertConfirmationRequired(result, "Run `Node.js` command in `bash`?");
    });
    test("should use withoutLanguage inDirectory title when presenter returns no languageDisplayName with cd prefix", async () => {
      const workspaceFolder = URI.file(isWindows ? "C:\\workspace\\project" : "/workspace/project");
      const workspace = new Workspace("test", [toWorkspaceFolder(workspaceFolder)]);
      workspaceContextService.setWorkspace(workspace);
      instantiationService.stub(IHistoryService, {
        getLastActiveWorkspaceRoot: () => workspaceFolder
      });
      const toolWithWorkspace = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      injectMockPresenter(toolWithWorkspace);
      const context = {
        parameters: {
          command: "cd /tmp && rm file.txt",
          explanation: "Remove a file in /tmp",
          goal: "Remove a file in /tmp",
          mode: "sync",
          timeout: 3e4
        }
      };
      const result = await toolWithWorkspace.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result, `Run command in \`bash\` within \`${isWindows ? "\\tmp" : "~/tmp"}\`?`);
    });
    test("should not show undefined in confirmation message when explanation and goal are missing", async () => {
      const params = {
        command: "rm file.txt"
      };
      delete params.explanation;
      delete params.goal;
      const result = await executeToolTest(params);
      assertConfirmationRequired(result);
      const message = result?.confirmationMessages?.message;
      ok(message, "Expected confirmation message to be defined");
      const messageText = typeof message === "string" ? message : message.value;
      ok(!messageText.includes("undefined"), `Confirmation message should not contain "undefined", got: ${messageText}`);
    });
    test("should use withLanguage inDirectory title when presenter returns languageDisplayName with cd prefix", async () => {
      const workspaceFolder = URI.file(isWindows ? "C:\\workspace\\project" : "/workspace/project");
      const workspace = new Workspace("test", [toWorkspaceFolder(workspaceFolder)]);
      workspaceContextService.setWorkspace(workspace);
      instantiationService.stub(IHistoryService, {
        getLastActiveWorkspaceRoot: () => workspaceFolder
      });
      const toolWithWorkspace = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const context = {
        parameters: {
          command: 'cd /tmp && node -e "console.log(1)"',
          explanation: "Run node command in /tmp",
          goal: "Run node command in /tmp",
          mode: "sync",
          timeout: 3e4
        }
      };
      const result = await toolWithWorkspace.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result, `Run \`Node.js\` command in \`bash\` within \`${isWindows ? "\\tmp" : "~/tmp"}\`?`);
    });
  });
  suite("prepareToolInvocation - custom actions for dropdown", () => {
    function assertDropdownActions(result, items) {
      const actions = result?.confirmationMessages?.terminalCustomActions;
      ok(actions, "Expected custom actions to be defined");
      strictEqual(actions.length, items.length);
      for (const [i, item] of items.entries()) {
        const action = actions[i];
        if (item === "---") {
          ok(isSeparator(action));
        } else {
          ok(!isSeparator(action));
          if (item === "configure") {
            strictEqual(action.label, "Configure Auto Approve...");
            strictEqual(action.data.type, "configure");
          } else if (item === "sessionApproval") {
            strictEqual(action.label, "Allow All Commands in this Session");
            strictEqual(action.data.type, "sessionApproval");
          } else if (hasKey(item, { commandLine: true })) {
            const expectedLabel = item.scope === "session" ? "Allow Exact Command Line in this Session" : item.scope === "workspace" ? "Allow Exact Command Line in this Workspace" : "Always Allow Exact Command Line";
            strictEqual(action.label, expectedLabel);
            strictEqual(action.data.type, "newRule");
            ok(!Array.isArray(action.data.rule), "Expected rule to be an object");
          } else {
            const subCommandLabel = Array.isArray(item.subCommand) ? `Commands ${item.subCommand.map((e) => `\`${e} \u2026\``).join(", ")}` : `\`${item.subCommand} \u2026\``;
            const expectedLabel = item.scope === "session" ? `Allow ${subCommandLabel} in this Session` : item.scope === "workspace" ? `Allow ${subCommandLabel} in this Workspace` : `Always Allow ${subCommandLabel}`;
            strictEqual(action.label, expectedLabel);
            strictEqual(action.data.type, "newRule");
            ok(Array.isArray(action.data.rule), "Expected rule to be an array");
          }
        }
      }
    }
    test("should generate custom actions for non-auto-approved commands", async () => {
      setAutoApprove({
        ls: true
      });
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Build the project",
        goal: "Build the project"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      assertDropdownActions(result, [
        { subCommand: "npm run build", scope: "session" },
        { subCommand: "npm run build", scope: "workspace" },
        { subCommand: "npm run build", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should generate custom actions for single word commands", async () => {
      const result = await executeToolTest({
        command: "foo",
        explanation: "Run foo command",
        goal: "Run foo command"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "foo", scope: "session" },
        { subCommand: "foo", scope: "workspace" },
        { subCommand: "foo", scope: "user" },
        "---",
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not generate custom actions for auto-approved commands", async () => {
      setAutoApprove({
        npm: true
      });
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Build the project",
        goal: "Build the project"
      });
      assertAutoApproved(result);
    });
    test("should only generate configure action for explicitly denied commands", async () => {
      setAutoApprove({
        npm: { approve: false }
      });
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Build the project",
        goal: "Build the project"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      assertDropdownActions(result, [
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should handle && in command line labels with proper mnemonic escaping", async () => {
      const result = await executeToolTest({
        command: "npm install && npm run build",
        explanation: "Install dependencies and build",
        goal: "Install dependencies and build"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      assertDropdownActions(result, [
        { subCommand: ["npm install", "npm run build"], scope: "session" },
        { subCommand: ["npm install", "npm run build"], scope: "workspace" },
        { subCommand: ["npm install", "npm run build"], scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not show approved commands in custom actions dropdown", async () => {
      setAutoApprove({
        head: true
        // head is approved by default in real scenario
      });
      const result = await executeToolTest({
        command: "foo | head -20",
        explanation: "Run foo command and show first 20 lines",
        goal: "Run foo command and show first 20 lines"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      assertDropdownActions(result, [
        { subCommand: "foo", scope: "session" },
        { subCommand: "foo", scope: "workspace" },
        { subCommand: "foo", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not show any command-specific actions when all sub-commands are approved", async () => {
      setAutoApprove({
        foo: true,
        head: true
      });
      const result = await executeToolTest({
        command: "foo | head -20",
        explanation: "Run foo command and show first 20 lines",
        goal: "Run foo command and show first 20 lines"
      });
      assertAutoApproved(result);
    });
    test("should handle mixed approved and unapproved commands correctly", async () => {
      setAutoApprove({
        head: true,
        tail: true
      });
      const result = await executeToolTest({
        command: "foo | head -20 && bar | tail -10",
        explanation: "Run multiple piped commands",
        goal: "Run multiple piped commands"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      assertDropdownActions(result, [
        { subCommand: ["foo", "bar"], scope: "session" },
        { subCommand: ["foo", "bar"], scope: "workspace" },
        { subCommand: ["foo", "bar"], scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest subcommand for git commands", async () => {
      const result = await executeToolTest({
        command: "git status",
        explanation: "Check git status",
        goal: "Check git status"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "git status", scope: "session" },
        { subCommand: "git status", scope: "workspace" },
        { subCommand: "git status", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest subcommand for npm commands", async () => {
      const result = await executeToolTest({
        command: "npm test",
        explanation: "Run npm tests",
        goal: "Run npm tests"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "npm test", scope: "session" },
        { subCommand: "npm test", scope: "workspace" },
        { subCommand: "npm test", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest 3-part subcommand for npm run commands", async () => {
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Run build script",
        goal: "Run build script"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "npm run build", scope: "session" },
        { subCommand: "npm run build", scope: "workspace" },
        { subCommand: "npm run build", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest 3-part subcommand for yarn run commands", async () => {
      const result = await executeToolTest({
        command: "yarn run test",
        explanation: "Run test script",
        goal: "Run test script"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "yarn run test", scope: "session" },
        { subCommand: "yarn run test", scope: "workspace" },
        { subCommand: "yarn run test", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not suggest subcommand for commands with flags", async () => {
      const result = await executeToolTest({
        command: "foo --foo --bar",
        explanation: "Run foo with flags",
        goal: "Run foo with flags"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "foo", scope: "session" },
        { subCommand: "foo", scope: "workspace" },
        { subCommand: "foo", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not suggest subcommand for npm run with flags", async () => {
      const result = await executeToolTest({
        command: "npm run abc --some-flag",
        explanation: "Run npm run abc with flags",
        goal: "Run npm run abc with flags"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "npm run abc", scope: "session" },
        { subCommand: "npm run abc", scope: "workspace" },
        { subCommand: "npm run abc", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should handle mixed npm run and other commands", async () => {
      const result = await executeToolTest({
        command: "npm run build && git status",
        explanation: "Build and check status",
        goal: "Build and check status"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: ["npm run build", "git status"], scope: "session" },
        { subCommand: ["npm run build", "git status"], scope: "workspace" },
        { subCommand: ["npm run build", "git status"], scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest mixed subcommands and base commands", async () => {
      const result = await executeToolTest({
        command: 'git push && echo "done"',
        explanation: "Push and print done",
        goal: "Push and print done"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: ["git push", "echo"], scope: "session" },
        { subCommand: ["git push", "echo"], scope: "workspace" },
        { subCommand: ["git push", "echo"], scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest subcommands for multiple git commands", async () => {
      const result = await executeToolTest({
        command: "git status && git log --oneline",
        explanation: "Check status and log",
        goal: "Check status and log"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: ["git status", "git log"], scope: "session" },
        { subCommand: ["git status", "git log"], scope: "workspace" },
        { subCommand: ["git status", "git log"], scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest base command for non-subcommand tools", async () => {
      const result = await executeToolTest({
        command: "foo bar",
        explanation: "Download from example.com",
        goal: "Download from example.com"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "foo", scope: "session" },
        { subCommand: "foo", scope: "workspace" },
        { subCommand: "foo", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should handle single word commands from subcommand-aware tools", async () => {
      const result = await executeToolTest({
        command: "git",
        explanation: "Run git command",
        goal: "Run git command"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should deduplicate identical subcommand suggestions", async () => {
      const result = await executeToolTest({
        command: "npm test && npm test --verbose",
        explanation: "Run tests twice",
        goal: "Run tests twice"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "npm test", scope: "session" },
        { subCommand: "npm test", scope: "workspace" },
        { subCommand: "npm test", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should handle flags differently than subcommands for suggestion logic", async () => {
      const result = await executeToolTest({
        command: "foo --version",
        explanation: "Check foo version",
        goal: "Check foo version"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "foo", scope: "session" },
        { subCommand: "foo", scope: "workspace" },
        { subCommand: "foo", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not suggest overly permissive subcommand rules", async () => {
      const result = await executeToolTest({
        command: 'bash -c "echo hello"',
        explanation: "Run bash command",
        goal: "Run bash command"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not show command line option when it's rejected", async () => {
      setAutoApprove({
        echo: true,
        "/\\(.+\\)/s": { approve: false, matchCommandLine: true }
      });
      const result = await executeToolTest({
        command: "echo (abc)"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should prevent auto approval when writing to a file outside the workspace", async () => {
      setConfig(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, "outsideWorkspace");
      setAutoApprove({});
      const workspaceFolder = URI.file(isWindows ? "C:/workspace/project" : "/workspace/project");
      const workspace = new Workspace("test", [toWorkspaceFolder(workspaceFolder)]);
      workspaceContextService.setWorkspace(workspace);
      instantiationService.stub(IHistoryService, {
        getLastActiveWorkspaceRoot: () => workspaceFolder
      });
      const result = await executeToolTest({
        command: 'echo "abc" > ../file.txt'
      });
      assertConfirmationRequired(result);
      strictEqual(result?.confirmationMessages?.terminalCustomActions, void 0, "Expected no custom actions when file write is blocked");
    });
  });
  suite("chat session disposal cleanup", () => {
    const createMockTerminal = (processId) => ({
      dispose: () => {
      },
      processId
    });
    test("should restore all terminals into the session terminal map and dispose them when archived", () => {
      const sessionId = "test-session-restored-archive";
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      let terminal1Disposed = false;
      let terminal2Disposed = false;
      const terminal1DisposedEmitter = new Emitter();
      const terminal2DisposedEmitter = new Emitter();
      const mockTerminal1 = {
        dispose: () => {
          terminal1Disposed = true;
          terminal1DisposedEmitter.fire();
        },
        onDisposed: terminal1DisposedEmitter.event,
        processId: 55555
      };
      const mockTerminal2 = {
        dispose: () => {
          terminal2Disposed = true;
          terminal2DisposedEmitter.fire();
        },
        onDisposed: terminal2DisposedEmitter.event,
        processId: 66666
      };
      storageService.store("chat.terminalSessions", JSON.stringify({
        [mockTerminal1.processId]: {
          sessionId,
          id: "restored-1",
          shellIntegrationQuality: ShellIntegrationQuality.None,
          isBackground: true
        },
        [mockTerminal2.processId]: {
          sessionId,
          id: "restored-2",
          shellIntegrationQuality: ShellIntegrationQuality.None,
          isBackground: false
        }
      }), StorageScope.WORKSPACE, StorageTarget.USER);
      instantiationService.stub(ITerminalService, {
        onDidDisposeInstance: terminalServiceDisposeEmitter.event,
        instances: [mockTerminal1, mockTerminal2],
        foregroundInstances: [],
        setNextCommandId: async () => {
        }
      });
      const restoredRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const restoredSessionTerminals = restoredRunInTerminalTool.sessionTerminalInstances.get(sessionResource);
      strictEqual(restoredSessionTerminals?.size, 2, "Both restored terminals should be tracked for the session");
      chatSessionArchivedEmitter.fire({
        resource: sessionResource,
        isArchived: () => true
      });
      strictEqual(terminal1Disposed, true, "Restored background terminal should have been disposed");
      strictEqual(terminal2Disposed, true, "Restored foreground terminal should have been disposed");
      ok(!restoredRunInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Foreground terminal association should be removed after archive");
      ok(!restoredRunInTerminalTool.sessionTerminalInstances.has(sessionResource), "All restored terminals for the session should be removed after archive");
    });
    test("should dispose all terminals associated with a single chat session when archived", () => {
      const sessionId = "test-session-archive";
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      const mockTerminal1 = { dispose: () => {
      }, processId: 33333 };
      const mockTerminal2 = { dispose: () => {
      }, processId: 44444 };
      let terminal1Disposed = false;
      let terminal2Disposed = false;
      mockTerminal1.dispose = () => {
        terminal1Disposed = true;
      };
      mockTerminal2.dispose = () => {
        terminal2Disposed = true;
      };
      runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
        instance: mockTerminal2,
        shellIntegrationQuality: ShellIntegrationQuality.None
      });
      runInTerminalTool.sessionTerminalInstances.set(sessionResource, /* @__PURE__ */ new Set([mockTerminal1, mockTerminal2]));
      const ensureArchivedSessionListener = runInTerminalTool["_ensureArchivedSessionListener"];
      ensureArchivedSessionListener.call(runInTerminalTool);
      chatSessionArchivedEmitter.fire({
        resource: sessionResource,
        isArchived: () => true
      });
      strictEqual(terminal1Disposed, true, "Terminal 1 should have been disposed");
      strictEqual(terminal2Disposed, true, "Terminal 2 should have been disposed");
      ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Terminal association should be removed after archive");
      ok(!runInTerminalTool.sessionTerminalInstances.has(sessionResource), "All tracked terminals for the session should be removed after archive");
    });
    test("should not access agent sessions model when initializing archive listener", () => {
      let modelAccessed = false;
      instantiationService.stub(IAgentSessionsService, {
        onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
        get model() {
          modelAccessed = true;
          throw new Error("model should not be accessed when wiring archive listener");
        }
      });
      const noModelAccessRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const ensureArchivedSessionListener = noModelAccessRunInTerminalTool["_ensureArchivedSessionListener"];
      ensureArchivedSessionListener.call(noModelAccessRunInTerminalTool);
      strictEqual(modelAccessed, false, "Agent sessions model should not be accessed when initializing archive listener");
    });
    test("should dispose all terminals associated with a single chat session", () => {
      const sessionId = "test-session-multiple-terminals";
      const mockTerminal1 = createMockTerminal(11111);
      const mockTerminal2 = createMockTerminal(22222);
      let terminal1Disposed = false;
      let terminal2Disposed = false;
      mockTerminal1.dispose = () => {
        terminal1Disposed = true;
      };
      mockTerminal2.dispose = () => {
        terminal2Disposed = true;
      };
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
        instance: mockTerminal2,
        shellIntegrationQuality: ShellIntegrationQuality.None
      });
      runInTerminalTool.sessionTerminalInstances.set(sessionResource, /* @__PURE__ */ new Set([mockTerminal1, mockTerminal2]));
      chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource], reason: "cleared" });
      strictEqual(terminal1Disposed, true, "Terminal 1 should have been disposed");
      strictEqual(terminal2Disposed, true, "Terminal 2 should have been disposed");
      ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Terminal association should be removed after disposal");
      ok(!runInTerminalTool.sessionTerminalInstances.has(sessionResource), "All tracked terminals for the session should be removed after disposal");
    });
    test("should dispose associated terminals when chat session is disposed", () => {
      const sessionId = "test-session-123";
      const mockTerminal = createMockTerminal(12345);
      let terminalDisposed = false;
      mockTerminal.dispose = () => {
        terminalDisposed = true;
      };
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
        instance: mockTerminal,
        shellIntegrationQuality: ShellIntegrationQuality.None
      });
      ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Terminal association should exist before disposal");
      chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource], reason: "cleared" });
      strictEqual(terminalDisposed, true, "Terminal should have been disposed");
      ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Terminal association should be removed after disposal");
    });
    test("should not affect other sessions when one session is disposed", () => {
      const sessionId1 = "test-session-1";
      const sessionId2 = "test-session-2";
      const mockTerminal1 = createMockTerminal(12345);
      const mockTerminal2 = createMockTerminal(67890);
      let terminal1Disposed = false;
      let terminal2Disposed = false;
      mockTerminal1.dispose = () => {
        terminal1Disposed = true;
      };
      mockTerminal2.dispose = () => {
        terminal2Disposed = true;
      };
      const sessionResource1 = LocalChatSessionUri.forSession(sessionId1);
      const sessionResource2 = LocalChatSessionUri.forSession(sessionId2);
      runInTerminalTool.sessionTerminalAssociations.set(sessionResource1, {
        instance: mockTerminal1,
        shellIntegrationQuality: ShellIntegrationQuality.None
      });
      runInTerminalTool.sessionTerminalAssociations.set(sessionResource2, {
        instance: mockTerminal2,
        shellIntegrationQuality: ShellIntegrationQuality.None
      });
      ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource1), "Session 1 terminal association should exist");
      ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource2), "Session 2 terminal association should exist");
      chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource1], reason: "cleared" });
      strictEqual(terminal1Disposed, true, "Terminal 1 should have been disposed");
      strictEqual(terminal2Disposed, false, "Terminal 2 should NOT have been disposed");
      ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource1), "Session 1 terminal association should be removed");
      ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource2), "Session 2 terminal association should remain");
    });
    test("should not dispose user-revealed terminals when chat session is disposed", () => {
      const sessionId = "test-session-revealed";
      const mockTerminal1 = createMockTerminal(11111);
      const mockTerminal2 = createMockTerminal(22222);
      let terminal1Disposed = false;
      let terminal2Disposed = false;
      mockTerminal1.dispose = () => {
        terminal1Disposed = true;
      };
      mockTerminal2.dispose = () => {
        terminal2Disposed = true;
      };
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      runInTerminalTool.sessionTerminalInstances.set(sessionResource, /* @__PURE__ */ new Set([mockTerminal1, mockTerminal2]));
      instantiationService.get(ITerminalService).foregroundInstances.push(mockTerminal2);
      chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource], reason: "cleared" });
      strictEqual(terminal1Disposed, true, "Hidden terminal should have been disposed");
      strictEqual(terminal2Disposed, false, "User-revealed terminal should NOT have been disposed");
      instantiationService.get(ITerminalService).foregroundInstances.length = 0;
    });
    test("should preserve terminals when output location is terminal", () => {
      setConfig(TerminalChatAgentToolsSettingId.OutputLocation, "terminal");
      const sessionId = "test-session-output-location-terminal";
      const mockTerminal1 = createMockTerminal(33333);
      const mockTerminal2 = createMockTerminal(44444);
      let terminal1Disposed = false;
      let terminal2Disposed = false;
      mockTerminal1.dispose = () => {
        terminal1Disposed = true;
      };
      mockTerminal2.dispose = () => {
        terminal2Disposed = true;
      };
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      runInTerminalTool.sessionTerminalInstances.set(sessionResource, /* @__PURE__ */ new Set([mockTerminal1, mockTerminal2]));
      chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource], reason: "cleared" });
      strictEqual(terminal1Disposed, false, "Terminal should persist when output location is terminal");
      strictEqual(terminal2Disposed, false, "Terminal should persist when output location is terminal");
    });
    test("should handle disposal of non-existent session gracefully", () => {
      strictEqual(runInTerminalTool.sessionTerminalAssociations.size, 0, "No associations should exist initially");
      chatServiceDisposeEmitter.fire({ sessionResources: [LocalChatSessionUri.forSession("non-existent-session")], reason: "cleared" });
      strictEqual(runInTerminalTool.sessionTerminalAssociations.size, 0, "No associations should exist after handling non-existent session");
    });
    test("should not reuse a disposed cached terminal", () => {
      const sessionResource = LocalChatSessionUri.forSession("disposed-terminal-session");
      const disposedTerminal = {
        isDisposed: true,
        dispose: () => {
        },
        processId: 99999
      };
      runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
        instance: disposedTerminal,
        shellIntegrationQuality: ShellIntegrationQuality.None,
        isBackground: false
      });
      const cachedTerminal = runInTerminalTool.sessionTerminalAssociations.get(sessionResource);
      ok(cachedTerminal, "Cached terminal should exist in the map");
      strictEqual(cachedTerminal.instance.isDisposed, true, "Cached terminal should be disposed");
      const wouldReuse = cachedTerminal !== void 0 && !cachedTerminal.isBackground && !cachedTerminal.instance.isDisposed;
      strictEqual(wouldReuse, false, "Should not reuse a disposed cached terminal");
    });
  });
  test("should use the conversation model and preserve previous agent for background completion notifications", async () => {
    const termId = "test-completion-model-term";
    const sessionResource = LocalChatSessionUri.forSession("test-completion-model-session");
    const commandFinishedEmitter = new Emitter();
    const terminalDisposedEmitter = new Emitter();
    const inputDataEmitter = new Emitter();
    const terminalInstance = {
      capabilities: {
        get: (cap) => cap === TerminalCapability.CommandDetection ? { onCommandFinished: commandFinishedEmitter.event } : void 0
      },
      dispose: () => {
      },
      onDisposed: terminalDisposedEmitter.event,
      onDidInputData: inputDataEmitter.event
    };
    const previousModelId = "claude-opus-4-8";
    const previousAgentId = "local-agent";
    const previousRequest = { modelId: previousModelId, response: { agent: { id: previousAgentId }, isCanceled: false, onDidChange: Event.None } };
    const chatService = instantiationService.get(IChatService);
    chatService.acquireExistingSession = () => ({
      object: {
        lastRequest: previousRequest,
        lastRequestObs: constObservable(previousRequest),
        onDidChange: Event.None
      },
      dispose: () => {
      }
    });
    runInTerminalTool.constructor._activeExecutions.set(termId, {
      getOutput: () => "done",
      dispose: () => {
      },
      instance: terminalInstance
    });
    const toolSpecificData = { kind: "terminal", commandLine: { original: "npm test" }, language: "bash" };
    runInTerminalTool._registerCompletionNotification(terminalInstance, termId, sessionResource, "npm test", toolSpecificData);
    await new Promise((resolve) => setTimeout(resolve, 0));
    commandFinishedEmitter.fire({ exitCode: 0 });
    strictEqual(capturedSteeringRequests.length, 1, "Expected a completion steering notification");
    strictEqual(capturedSteeringRequests[0].options?.userSelectedModelId, previousModelId, "Completion notification should use the conversation model");
    strictEqual(capturedSteeringRequests[0].options?.agentIdSilent, previousAgentId, "Completion notification should continue with the previous request agent");
  });
  test("should dedupe rapid repeated background input-needed notifications", () => {
    const termId = "test-input-needed-term";
    const sessionResource = LocalChatSessionUri.forSession("test-input-needed-session");
    let output = "Enter value:";
    const commandFinishedEmitter = new Emitter();
    const terminalDisposedEmitter = new Emitter();
    const inputNeededEmitter = new Emitter();
    const inputDataEmitter = new Emitter();
    const terminalInstance = {
      capabilities: {
        get: (cap) => cap === TerminalCapability.CommandDetection ? { onCommandFinished: commandFinishedEmitter.event } : void 0
      },
      onDisposed: terminalDisposedEmitter.event,
      onDidInputData: inputDataEmitter.event
    };
    const outputMonitor = {
      onDidDetectInputNeeded: inputNeededEmitter.event,
      onDidDetectSensitiveInputNeeded: Event.None,
      continueMonitoringAsync: () => {
      },
      dispose: () => {
      }
    };
    const toolSpecificData = { kind: "terminal", commandLine: { original: "npm init" }, language: "bash" };
    runInTerminalTool.constructor._activeExecutions.set(termId, {
      getOutput: () => output
    });
    runInTerminalTool._registerCompletionNotification(terminalInstance, termId, sessionResource, "npm init", toolSpecificData, outputMonitor);
    inputNeededEmitter.fire();
    inputNeededEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 1, "Expected duplicate rapid input-needed events to be suppressed");
    output = "Confirm (y/N):";
    inputNeededEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 2, "Expected a changed prompt to trigger a new notification");
  });
  test("should suppress input-needed after disposal and omit successful exit code from terminal-exited notice", () => {
    const termId = "test-input-needed-disposed-term";
    const sessionResource = LocalChatSessionUri.forSession("test-input-needed-disposed-session");
    const output = "Press ENTER or type command to continue";
    const commandFinishedEmitter = new Emitter();
    const terminalDisposedEmitter = new Emitter();
    const inputNeededEmitter = new Emitter();
    const inputDataEmitter = new Emitter();
    let isDisposed = false;
    const terminalInstance = {
      capabilities: {
        get: (cap) => cap === TerminalCapability.CommandDetection ? { onCommandFinished: commandFinishedEmitter.event } : void 0
      },
      onDisposed: terminalDisposedEmitter.event,
      onDidInputData: inputDataEmitter.event,
      exitCode: 0,
      get isDisposed() {
        return isDisposed;
      }
    };
    const outputMonitor = {
      onDidDetectInputNeeded: inputNeededEmitter.event,
      onDidDetectSensitiveInputNeeded: Event.None,
      continueMonitoringAsync: () => {
      },
      dispose: () => {
      }
    };
    const toolSpecificData = { kind: "terminal", commandLine: { original: "git --no-pager diff -- foo.ts" }, language: "bash" };
    runInTerminalTool.constructor._activeExecutions.set(termId, {
      getOutput: () => output
    });
    runInTerminalTool._registerCompletionNotification(terminalInstance, termId, sessionResource, "git --no-pager diff -- foo.ts", toolSpecificData, outputMonitor);
    isDisposed = true;
    inputNeededEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 0, "Closing the terminal should not produce a spurious input-needed chat turn");
    terminalDisposedEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 1, "Closing the terminal should send one terminal-exited notification");
    ok(capturedSteeringRequests[0].message.includes("terminal exited."), "Successful terminal exit should be reported without qualification");
    ok(!capturedSteeringRequests[0].message.includes("exit code 0"), "Successful terminal exit should not print exit code 0 to chat");
  });
  test("should suppress redundant input-needed notification for output already returned via foreground inputNeeded", () => {
    const termId = "test-input-needed-already-notified-term";
    const sessionResource = LocalChatSessionUri.forSession("test-input-needed-already-notified-session");
    let output = "package name: (test_npm_init) ";
    const commandFinishedEmitter = new Emitter();
    const terminalDisposedEmitter = new Emitter();
    const inputNeededEmitter = new Emitter();
    const inputDataEmitter = new Emitter();
    const terminalInstance = {
      capabilities: {
        get: (cap) => cap === TerminalCapability.CommandDetection ? { onCommandFinished: commandFinishedEmitter.event } : void 0
      },
      onDisposed: terminalDisposedEmitter.event,
      onDidInputData: inputDataEmitter.event
    };
    const outputMonitor = {
      onDidDetectInputNeeded: inputNeededEmitter.event,
      onDidDetectSensitiveInputNeeded: Event.None,
      continueMonitoringAsync: () => {
      },
      dispose: () => {
      }
    };
    const toolSpecificData = { kind: "terminal", commandLine: { original: "mkdir -p foo && cd foo && npm init" }, language: "bash" };
    runInTerminalTool.constructor._activeExecutions.set(termId, {
      getOutput: () => output
    });
    runInTerminalTool._registerCompletionNotification(terminalInstance, termId, sessionResource, "mkdir -p foo && cd foo && npm init", toolSpecificData, outputMonitor, output);
    inputNeededEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 0, "Should not re-notify for output the agent already received via the foreground inputNeeded race");
    output = "version: (1.0.0) ";
    inputNeededEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 1, "Expected a new notification once the prompt output changes");
  });
  test("should preserve session terminal association after inputNeeded so fg terminal is reused", () => {
    const termId = "test-input-cleanup-term";
    const sessionResource = LocalChatSessionUri.forSession("test-input-cleanup-session");
    const commandFinishedEmitter = new Emitter();
    const terminalDisposedEmitter = new Emitter();
    const inputNeededEmitter = new Emitter();
    const inputDataEmitter = new Emitter();
    const terminalInstance = {
      capabilities: {
        get: (cap) => cap === TerminalCapability.CommandDetection ? { onCommandFinished: commandFinishedEmitter.event } : void 0
      },
      shellLaunchConfig: { hideFromUser: false },
      onDisposed: terminalDisposedEmitter.event,
      onDidInputData: inputDataEmitter.event
    };
    const outputMonitor = {
      onDidDetectInputNeeded: inputNeededEmitter.event,
      onDidDetectSensitiveInputNeeded: Event.None,
      continueMonitoringAsync: () => {
      },
      dispose: () => {
      }
    };
    const toolSpecificData = { kind: "terminal", commandLine: { original: "ssh host" }, language: "bash" };
    instantiationService.get(ITerminalService).foregroundInstances.push(terminalInstance);
    runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
      instance: terminalInstance,
      shellIntegrationQuality: ShellIntegrationQuality.Rich,
      isBackground: false
    });
    runInTerminalTool.constructor._activeExecutions.set(termId, {
      getOutput: () => "Password:",
      dispose: () => {
      }
    });
    runInTerminalTool._registerCompletionNotification(terminalInstance, termId, sessionResource, "ssh host", toolSpecificData, outputMonitor);
    inputNeededEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 1, "Should send steering request for input needed");
    ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Session terminal association should be preserved for fg reuse");
    strictEqual(runInTerminalTool.sessionTerminalAssociations.get(sessionResource).isBackground, false, "Terminal should remain foreground");
    commandFinishedEmitter.fire({ exitCode: 0 });
    strictEqual(capturedSteeringRequests.length, 2, "Should send a completion steering request");
    ok(capturedSteeringRequests[1].message.includes("command completed."), "Successful completion should be reported without qualification");
    ok(!capturedSteeringRequests[1].message.includes("exit code 0"), "Successful completion should not print exit code 0 to chat");
    ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Session terminal association should still be preserved after command finishes");
    strictEqual(runInTerminalTool.sessionTerminalAssociations.get(sessionResource).isBackground, false, "Terminal should still be foreground after command finishes");
  });
  suite("auto approve warning acceptance mechanism", () => {
    test("should require confirmation for auto-approvable commands when warning not accepted", async () => {
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
      setAutoApprove({
        echo: true
      });
      clearAutoApproveWarningAcceptedState();
      assertConfirmationRequired(await executeToolTest({ command: "echo hello world" }), "Run `bash` command?");
    });
    test("should include autoApproveInfo when command would be auto-approved but warning not accepted", async () => {
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
      setAutoApprove({
        echo: true
      });
      clearAutoApproveWarningAcceptedState();
      const result = await executeToolTest({ command: "echo hello world" });
      assertConfirmationRequired(result, "Run `bash` command?");
      const terminalData = result.toolSpecificData;
      ok(terminalData.autoApproveInfo, "autoApproveInfo should be set for commands that would be auto-approved");
    });
    test("should auto-approve commands when both auto-approve enabled and warning accepted", async () => {
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
      setAutoApprove({
        echo: true
      });
      assertAutoApproved(await executeToolTest({ command: "echo hello world" }));
    });
    test("should require confirmation when auto-approve disabled regardless of warning acceptance", async () => {
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);
      setAutoApprove({
        echo: true
      });
      const result = await executeToolTest({ command: "echo hello world" });
      assertConfirmationRequired(result, "Run `bash` command?");
    });
  });
  suite("input-needed steering text", () => {
    function buildSteeringText(hungHint) {
      const sessionResource = LocalChatSessionUri.forSession("input-needed-steering-session");
      return runInTerminalTool._buildInputNeededSteeringText(sessionResource, "test-term-id", hungHint);
    }
    test("none mode does not mention timeout, idle silence, or kill_terminal", () => {
      const text = buildSteeringText("none");
      ok(!text.toLowerCase().includes("timeout"), "Expected no mention of timeout in the input-needed (none) hint");
      ok(!text.toLowerCase().includes("no output"), "Expected no mention of idle silence in the input-needed (none) hint");
      ok(!text.includes(TerminalToolId.KillTerminal), "Expected kill_terminal not to be advertised in the input-needed (none) hint");
    });
    test("timeout mode advertises kill_terminal and mentions timeout", () => {
      const text = buildSteeringText("timeout");
      ok(text.toLowerCase().includes("timeout"), 'Expected timeout hint to mention "timeout"');
      ok(text.includes(TerminalToolId.KillTerminal), "Expected timeout hint to advertise kill_terminal");
    });
    test('idleSilence mode advertises kill_terminal without saying "timeout"', () => {
      const text = buildSteeringText("idleSilence");
      ok(!text.toLowerCase().includes("timeout"), "Idle-silence hint must not refer to a timeout");
      ok(text.toLowerCase().includes("no output"), "Expected idle-silence hint to describe the no-output condition");
      ok(text.includes(TerminalToolId.KillTerminal), "Expected idle-silence hint to advertise kill_terminal");
    });
  });
  suite("unique rules deduplication", () => {
    test("should properly deduplicate rules with same sourceText in auto-approve info", async () => {
      setAutoApprove({
        echo: true
      });
      const result = await executeToolTest({ command: "echo hello && echo world" });
      assertAutoApproved(result);
      const autoApproveInfo = result.toolSpecificData.autoApproveInfo;
      ok(autoApproveInfo);
      ok(autoApproveInfo.value.includes("Auto approved by rule "), 'should contain singular "rule", not plural');
      strictEqual(count(autoApproveInfo.value, "echo"), 1);
    });
  });
  suite("session auto approval", () => {
    test("should auto approve all commands when session has auto approval enabled", async () => {
      const sessionId = "test-session-123";
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      const terminalChatService = instantiationService.get(ITerminalChatService);
      const context = {
        parameters: {
          command: "rm dangerous-file.txt",
          explanation: "Remove a file",
          goal: "Remove a file",
          mode: "sync",
          timeout: 3e4
        },
        chatSessionResource: sessionResource
      };
      let result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result);
      terminalChatService.setChatSessionAutoApproval(sessionResource, true);
      result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
      assertAutoApproved(result);
      const terminalData = result.toolSpecificData;
      ok(terminalData.autoApproveInfo, "Expected autoApproveInfo to be defined");
      ok(terminalData.autoApproveInfo.value.includes("Auto approved for this session"), "Expected session approval message");
    });
    test("should bypass terminal auto-approve feature in Autopilot mode", async () => {
      setAutoApprove({
        curl: false
      });
      const sessionResource = LocalChatSessionUri.forSession("autopilot-session");
      instantiationService.stub(IChatWidgetService, {
        getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.Autopilot } } })),
        lastFocusedWidget: void 0
      });
      const autopilotRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const result = await autopilotRunInTerminalTool.prepareToolInvocation({
        parameters: {
          command: "curl https://example.com",
          explanation: "Fetch a URL",
          goal: "Download content",
          mode: "sync",
          timeout: 3e4
        },
        chatSessionResource: sessionResource
      }, CancellationToken.None);
      assertAutoApproved(result);
      const terminalData = result.toolSpecificData;
      strictEqual(terminalData.autoApproveInfo, void 0, "Expected no terminal auto-approve info in Autopilot mode");
    });
    test("should bypass terminal auto-approve feature in Bypass Approvals mode", async () => {
      setAutoApprove({
        curl: false
      });
      const sessionResource = LocalChatSessionUri.forSession("bypass-session");
      instantiationService.stub(IChatWidgetService, {
        getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } } })),
        lastFocusedWidget: void 0
      });
      const bypassRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const result = await bypassRunInTerminalTool.prepareToolInvocation({
        parameters: {
          command: "curl https://example.com",
          explanation: "Fetch a URL",
          goal: "Download content",
          mode: "sync",
          timeout: 3e4
        },
        chatSessionResource: sessionResource
      }, CancellationToken.None);
      assertAutoApproved(result);
      const terminalData = result.toolSpecificData;
      strictEqual(terminalData.autoApproveInfo, void 0, "Expected no terminal auto-approve info in Bypass Approvals mode");
    });
  });
  suite("TerminalProfileFetcher", () => {
    suite("getCopilotProfile", () => {
      (isWindows ? test : test.skip)("should return custom profile when configured", async () => {
        runInTerminalTool.setBackendOs(OperatingSystem.Windows);
        const customProfile = Object.freeze({ path: "C:\\Windows\\System32\\powershell.exe", args: ["-NoProfile"] });
        setConfig(TerminalChatAgentToolsSettingId.TerminalProfileWindows, customProfile);
        const result = await runInTerminalTool.profileFetcher.getCopilotProfile();
        strictEqual(result, customProfile);
      });
      (isLinux ? test : test.skip)("should fall back to default shell when no custom profile is configured", async () => {
        runInTerminalTool.setBackendOs(OperatingSystem.Linux);
        setConfig(TerminalChatAgentToolsSettingId.TerminalProfileLinux, null);
        const result = await runInTerminalTool.profileFetcher.getCopilotProfile();
        strictEqual(typeof result, "object");
        strictEqual(result.path, "bash");
      });
    });
  });
  suite("denial info in disclaimers", () => {
    function getDisclaimerValue(disclaimer) {
      if (!disclaimer) {
        return void 0;
      }
      return typeof disclaimer === "string" ? disclaimer : disclaimer.value;
    }
    test("should include denial reason in disclaimer when command is denied by rule", async () => {
      setAutoApprove({
        npm: { approve: false }
      });
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Build the project",
        goal: "Build the project"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
      ok(disclaimerValue, "Expected disclaimer to be defined");
      ok(disclaimerValue.includes("denied"), "Expected disclaimer to mention denial");
      ok(disclaimerValue.includes("npm"), "Expected disclaimer to mention the denied rule");
    });
    test("should include link to settings in denial disclaimer", async () => {
      setAutoApprove({
        rm: { approve: false }
      });
      const result = await executeToolTest({
        command: "rm -rf temp",
        explanation: "Remove temp folder",
        goal: "Remove temp folder"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      ok(result?.confirmationMessages?.disclaimer, "Expected disclaimer to be defined");
      const disclaimer = result.confirmationMessages.disclaimer;
      ok(typeof disclaimer !== "string" && disclaimer.isTrusted, "Expected disclaimer to be trusted for command links");
    });
    test("should include denial reason for multiple denied sub-commands", async () => {
      setAutoApprove({
        rm: { approve: false },
        sudo: { approve: false }
      });
      const result = await executeToolTest({
        command: "sudo rm -rf /",
        explanation: "Dangerous command",
        goal: "Dangerous command"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
      ok(disclaimerValue, "Expected disclaimer to be defined");
      ok(disclaimerValue.includes("denied"), "Expected disclaimer to mention denial");
    });
    test("should not include denial info when auto-approve is disabled", async () => {
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);
      setAutoApprove({
        npm: { approve: false }
      });
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Build the project",
        goal: "Build the project"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
      if (disclaimerValue) {
        ok(!disclaimerValue.includes("denied"), "Should not mention denial when auto-approve is disabled");
      }
    });
    test("should not include denial info for commands that are simply not approved", async () => {
      setAutoApprove({
        echo: true
      });
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Build the project",
        goal: "Build the project"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
      if (disclaimerValue) {
        ok(!disclaimerValue.includes("denied"), "Should not mention denial for non-denied commands");
      }
    });
  });
  suite("ConfirmTerminalCommandTool", () => {
    test("should require confirmation when sandbox is enabled but sandbox rewriting is disabled", async () => {
      sandboxEnabled = true;
      const { ConfirmTerminalCommandTool } = await import("../../browser/tools/runInTerminalConfirmationTool.js");
      const confirmTool = store.add(instantiationService.createInstance(ConfirmTerminalCommandTool));
      const context = {
        parameters: {
          command: "ping google.com",
          explanation: "Ping google.com",
          goal: "Ping google.com",
          mode: "sync",
          timeout: 3e4
        }
      };
      const result = await confirmTool.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result);
    });
    test("should require confirmation when sandbox is disabled", async () => {
      sandboxEnabled = false;
      setAutoApprove({});
      const { ConfirmTerminalCommandTool } = await import("../../browser/tools/runInTerminalConfirmationTool.js");
      const confirmTool = store.add(instantiationService.createInstance(ConfirmTerminalCommandTool));
      const context = {
        parameters: {
          command: "echo hello",
          explanation: "Print hello",
          goal: "Print hello",
          mode: "sync",
          timeout: 3e4
        }
      };
      const result = await confirmTool.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result);
    });
    test("should surface a sandbox-bypass title and reason when sandboxBypass is set, even with sandbox disabled", async () => {
      sandboxEnabled = false;
      setAutoApprove({});
      const { ConfirmTerminalCommandTool } = await import("../../browser/tools/runInTerminalConfirmationTool.js");
      const confirmTool = store.add(instantiationService.createInstance(ConfirmTerminalCommandTool));
      const context = {
        parameters: {
          command: "cat ~/secret",
          explanation: "Read secret",
          goal: "Read secret",
          mode: "sync",
          timeout: 3e4,
          sandboxBypass: true,
          sandboxBypassReason: "Needs access outside the workspace"
        }
      };
      const result = await confirmTool.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result, "Run in terminal outside the sandbox?");
      const message = result.confirmationMessages.message;
      const messageText = typeof message === "string" ? message : message?.value ?? "";
      ok(/outside the sandbox/i.test(messageText), `expected message to mention the sandbox, got: ${messageText}`);
      ok(messageText.includes("Needs access outside the workspace"), `expected message to include the reason, got: ${messageText}`);
    });
    test("should force a sandbox-bypass confirmation even when the command would be auto-approved", async () => {
      sandboxEnabled = false;
      setAutoApprove({ cat: true });
      const { ConfirmTerminalCommandTool } = await import("../../browser/tools/runInTerminalConfirmationTool.js");
      const confirmTool = store.add(instantiationService.createInstance(ConfirmTerminalCommandTool));
      const context = {
        parameters: {
          command: "cat ~/secret",
          explanation: "Read secret",
          goal: "Read secret",
          mode: "sync",
          timeout: 3e4,
          sandboxBypass: true
        }
      };
      const result = await confirmTool.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result, "Run in terminal outside the sandbox?");
    });
  });
});
suite("ChatAgentToolsContribution - tool registration refresh", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let registeredToolData;
  let pendingToolDataRegistration;
  let sandboxEnabled;
  setup(() => {
    configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, true);
    registeredToolData = /* @__PURE__ */ new Map();
    pendingToolDataRegistration = void 0;
    sandboxEnabled = false;
    const logService = new NullLogService();
    const fileService = store.add(new FileService(logService));
    const fileSystemProvider = new TestIPCFileSystemProvider();
    store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    const terminalServiceDisposeEmitter = store.add(new Emitter());
    const chatServiceDisposeEmitter = store.add(new Emitter());
    const chatSessionArchivedEmitter = store.add(new Emitter());
    instantiationService = workbenchInstantiationService({
      configurationService: () => configurationService,
      fileService: () => fileService
    }, store);
    instantiationService.stub(IChatService, {
      onDidDisposeSession: chatServiceDisposeEmitter.event,
      getSession: () => void 0
    });
    instantiationService.stub(IAgentSessionsService, {
      onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
      model: {
        onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event
      }
    });
    const terminalInstancesChangedEmitter = store.add(new Emitter());
    instantiationService.stub(ITerminalService, {
      onDidDisposeInstance: terminalServiceDisposeEmitter.event,
      onDidChangeInstances: terminalInstancesChangedEmitter.event,
      foregroundInstances: [],
      setNextCommandId: async () => {
      }
    });
    instantiationService.stub(ITerminalChatService, store.add(instantiationService.createInstance(TerminalChatService)));
    instantiationService.stub(IHistoryService, {
      getLastActiveWorkspaceRoot: () => void 0
    });
    const terminalSandboxService = {
      _serviceBrand: void 0,
      isEnabled: async () => sandboxEnabled,
      isSandboxAllowNetworkEnabled: async () => false,
      wrapCommand: async (command) => ({
        command: `sandbox:${command}`,
        isSandboxWrapped: true
      }),
      checkFileAccess: async () => ({ allowed: true, denied: [] }),
      getSandboxConfigPath: async () => sandboxEnabled ? "/tmp/sandbox.json" : void 0,
      checkForSandboxingPrereqs: async () => ({ enabled: sandboxEnabled, sandboxConfigPath: sandboxEnabled ? "/tmp/sandbox.json" : void 0, failedCheck: void 0 }),
      getTempDir: () => void 0,
      setNeedsForceUpdateConfigFile: () => {
      },
      getOS: async () => OperatingSystem.Linux,
      getResolvedNetworkDomains: () => ({ allowedDomains: [], deniedDomains: [] }),
      getMissingSandboxDependencies: async () => [],
      installMissingSandboxDependencies: async () => ({ exitCode: 0 }),
      runSandboxRemediation: async () => ({ exitCode: 0 })
    };
    instantiationService.stub(ITerminalSandboxService, terminalSandboxService);
    const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
    treeSitterLibraryService.isTest = true;
    instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);
    instantiationService.stub(ITerminalProfileResolverService, {
      getDefaultProfile: async () => ({ path: "bash" })
    });
    const contextKeyService = instantiationService.get(IContextKeyService);
    const registeredToolImpls = /* @__PURE__ */ new Map();
    const mockToolsService = {
      _serviceBrand: void 0,
      onDidChangeTools: Event.None,
      registerToolData(toolData) {
        registeredToolData.set(toolData.id, toolData);
        pendingToolDataRegistration?.complete();
        return toDisposable(() => registeredToolData.delete(toolData.id));
      },
      registerToolImplementation(id, tool) {
        registeredToolImpls.set(id, tool);
        return toDisposable(() => registeredToolImpls.delete(id));
      },
      registerTool(toolData, tool) {
        registeredToolData.set(toolData.id, toolData);
        registeredToolImpls.set(toolData.id, tool);
        return toDisposable(() => {
          registeredToolData.delete(toolData.id);
          registeredToolImpls.delete(toolData.id);
          if (isDisposable(tool)) {
            tool.dispose();
          }
        });
      },
      getTools() {
        return registeredToolData.values();
      },
      executeToolSet: new ToolSet("execute", "execute", Codicon.play, ToolDataSource.Internal, void 0, void 0, void 0, void 0, void 0, contextKeyService),
      readToolSet: new ToolSet("read", "read", Codicon.book, ToolDataSource.Internal, void 0, void 0, void 0, void 0, void 0, contextKeyService)
    };
    instantiationService.stub(ILanguageModelToolsService, mockToolsService);
    instantiationService.stub(IToolResultCompressor, {
      _serviceBrand: void 0,
      registerFilter: () => {
      },
      registerCache: () => {
      },
      maybeCompress: () => void 0
    });
  });
  async function waitForToolDataRegistration(trigger) {
    const registration = new DeferredPromise();
    pendingToolDataRegistration = registration;
    try {
      trigger();
      await registration.p;
    } finally {
      pendingToolDataRegistration = void 0;
    }
  }
  async function createContribution() {
    let contribution;
    await waitForToolDataRegistration(() => {
      contribution = store.add(instantiationService.createInstance(ChatAgentToolsContribution));
    });
    ok(contribution);
    return contribution;
  }
  test("should register run_in_terminal tool on construction", async () => {
    await createContribution();
    ok(registeredToolData.has(TerminalToolId.RunInTerminal), "Expected run_in_terminal tool to be registered");
  });
  test("should refresh run_in_terminal tool data when sandbox setting changes", async () => {
    await createContribution();
    const toolDataBefore = registeredToolData.get(TerminalToolId.RunInTerminal);
    ok(toolDataBefore, "Expected run_in_terminal tool to be registered");
    const propertiesBefore = toolDataBefore.inputSchema?.properties;
    ok(!propertiesBefore?.["requestUnsandboxedExecution"], "Expected no requestUnsandboxedExecution before enabling sandbox");
    await waitForToolDataRegistration(() => {
      sandboxEnabled = true;
      configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.On);
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: (key) => key === AgentSandboxSettingId.AgentSandboxEnabled,
        affectedKeys: /* @__PURE__ */ new Set([AgentSandboxSettingId.AgentSandboxEnabled]),
        source: ConfigurationTarget.USER,
        change: null
      });
    });
    const toolDataAfter = registeredToolData.get(TerminalToolId.RunInTerminal);
    ok(toolDataAfter, "Expected run_in_terminal tool to still be registered");
    const propertiesAfter = toolDataAfter.inputSchema?.properties;
    ok(propertiesAfter?.["requestUnsandboxedExecution"], "Expected requestUnsandboxedExecution after enabling sandbox");
  });
  test("should refresh run_in_terminal tool data when unsandboxed command allowance changes", async () => {
    sandboxEnabled = true;
    await createContribution();
    const toolDataBefore = registeredToolData.get(TerminalToolId.RunInTerminal);
    ok(toolDataBefore, "Expected run_in_terminal tool to be registered");
    const propertiesBefore = toolDataBefore.inputSchema?.properties;
    ok(propertiesBefore?.["requestUnsandboxedExecution"], "Expected requestUnsandboxedExecution before disabling unsandboxed commands");
    await waitForToolDataRegistration(() => {
      configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, false);
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: (key) => key === AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands,
        affectedKeys: /* @__PURE__ */ new Set([AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]),
        source: ConfigurationTarget.USER,
        change: null
      });
    });
    const toolDataAfter = registeredToolData.get(TerminalToolId.RunInTerminal);
    ok(toolDataAfter, "Expected run_in_terminal tool to still be registered");
    const propertiesAfter = toolDataAfter.inputSchema?.properties;
    ok(!propertiesAfter?.["requestUnsandboxedExecution"], "Expected requestUnsandboxedExecution to be removed after disabling unsandboxed commands");
  });
  test("should refresh run_in_terminal tool data when sandbox network setting changes", async () => {
    sandboxEnabled = true;
    await createContribution();
    const toolDataBefore = registeredToolData.get(TerminalToolId.RunInTerminal);
    ok(toolDataBefore, "Expected run_in_terminal tool to be registered");
    await waitForToolDataRegistration(() => {
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: (key) => key === AgentNetworkDomainSettingId.AllowedNetworkDomains,
        affectedKeys: /* @__PURE__ */ new Set([AgentNetworkDomainSettingId.AllowedNetworkDomains]),
        source: ConfigurationTarget.USER,
        change: null
      });
    });
    const toolDataAfter = registeredToolData.get(TerminalToolId.RunInTerminal);
    ok(toolDataAfter, "Expected run_in_terminal tool to still be registered after network setting change");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvcnVuSW5UZXJtaW5hbFRvb2wudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG9rLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4LCBpc1dpbmRvd3MsIE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGNvdW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBoYXNLZXksIHR5cGUgU2luZ2xlT3JNYW55IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdHJlZVNpdHRlci90cmVlU2l0dGVyTGlicmFyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2ZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCB0b1dvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS90ZXN0L2NvbW1vbi90ZXN0V29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2hpc3RvcnkvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvdHJlZVNpdHRlci9icm93c2VyL3RyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3RJUENGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsVG9vbENvbmZpcm1hdGlvblN0b3JhZ2VLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFRlcm1pbmFsVG9vbENvbmZpcm1hdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlLCB0eXBlIElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCB0eXBlIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWwsIHR5cGUgSUNoYXRSZXF1ZXN0TW9kZUluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RUZXh0UGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNhbmRib3hTZXJ2aWNlLCBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjaywgVGVybWluYWxTYW5kYm94UHJlQ2hlY2tSZW1lZGlhdGlvbiwgdHlwZSBJVGVybWluYWxTYW5kYm94Q29tbWFuZCwgdHlwZSBJVGVybWluYWxTYW5kYm94UHJlY2hlY2tJbnB1dHMsIHR5cGUgSVRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrUmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsU2FuZGJveFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCBJVG9vbERhdGEsIElUb29sSW1wbCwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIElUb29sUmVzdWx0LCBUb29sRGF0YVNvdXJjZSwgVG9vbFByb2dyZXNzLCBUb29sU2V0LCB0eXBlIFRvb2xDb25maXJtYXRpb25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUb29sUmVzdWx0Q29tcHJlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL3Rvb2xSZXN1bHRDb21wcmVzc29yLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENoYXRTZXJ2aWNlLCBJVGVybWluYWxTZXJ2aWNlLCB0eXBlIElUZXJtaW5hbEluc3RhbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvbW1hbmRMaW5lUHJlc2VudGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29scy9jb21tYW5kTGluZVByZXNlbnRlci9jb21tYW5kTGluZVByZXNlbnRlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSdW5JblRlcm1pbmFsVG9vbERhdGEsIG91dHB1dExvb2tzQnViYmxld3JhcEhvc3RSZXN0cmljdGVkLCBSdW5JblRlcm1pbmFsVG9vbCwgc2hvdWxkQXV0b21hdGljYWxseVJldHJ5QWxsb3dOZXR3b3JrSW5TYW5kYm94ZWQsIHNob3VsZEF1dG9tYXRpY2FsbHlSZXRyeVVuc2FuZGJveGVkLCB0eXBlIElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXMgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL3J1bkluVGVybWluYWxUb29sLmpzJztcbmltcG9ydCB7IFNoZWxsSW50ZWdyYXRpb25RdWFsaXR5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29sVGVybWluYWxDcmVhdG9yLmpzJztcbmltcG9ydCB7IHRlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uLCBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25ldHdvcmtGaWx0ZXIvY29tbW9uL3NldHRpbmdzLmpzJztcbmltcG9ydCB7IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZSwgQWdlbnRTYW5kYm94U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc2FuZGJveC9jb21tb24vc2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci90ZXJtaW5hbENoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBpc0Rpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRUb29sc0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWwuY2hhdEFnZW50VG9vbHMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsVG9vbElkIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29scy90b29sSWRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5cbmNsYXNzIFRlc3RSdW5JblRlcm1pbmFsVG9vbCBleHRlbmRzIFJ1bkluVGVybWluYWxUb29sIHtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vc0JhY2tlbmQ6IFByb21pc2U8T3BlcmF0aW5nU3lzdGVtPiA9IFByb21pc2UucmVzb2x2ZShPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cblx0Z2V0IHNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucygpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9uczsgfVxuXHRnZXQgc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzOyB9XG5cdGdldCBwcm9maWxlRmV0Y2hlcigpIHsgcmV0dXJuIHRoaXMuX3Byb2ZpbGVGZXRjaGVyOyB9XG5cdGdldCBjb21tYW5kTGluZVByZXNlbnRlcnMoKTogSUNvbW1hbmRMaW5lUHJlc2VudGVyW10geyByZXR1cm4gKHRoaXMgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCBJQ29tbWFuZExpbmVQcmVzZW50ZXJbXT4pWydfY29tbWFuZExpbmVQcmVzZW50ZXJzJ107IH1cblx0Z2V0QnViYmxld3JhcEhvc3RSZXN0cmljdGVkUmVzdWx0KCk6IElUb29sUmVzdWx0IHtcblx0XHRyZXR1cm4gKHRoaXMgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCAoKSA9PiBJVG9vbFJlc3VsdD4pWydfZ2V0QnViYmxld3JhcEhvc3RSZXN0cmljdGVkUmVzdWx0J10oKTtcblx0fVxuXHRkaXNhYmxlUHJvY2Vzc0lkQXNzb2NpYXRpb24oKTogdm9pZCB7XG5cdFx0KHRoaXMgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCAoKSA9PiBQcm9taXNlPHZvaWQ+PilbJ19zZXR1cFByb2Nlc3NJZEFzc29jaWF0aW9uJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdH1cblxuXHRzZXRCYWNrZW5kT3Mob3M6IE9wZXJhdGluZ1N5c3RlbSkge1xuXHRcdHRoaXMuX29zQmFja2VuZCA9IFByb21pc2UucmVzb2x2ZShvcyk7XG5cdH1cbn1cblxuc3VpdGUoJ1J1bkluVGVybWluYWxUb29sJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2U7XG5cdGxldCBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlO1xuXHRsZXQgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IFRlc3RDb250ZXh0U2VydmljZTtcblx0bGV0IHRlcm1pbmFsU2VydmljZURpc3Bvc2VFbWl0dGVyOiBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPjtcblx0bGV0IGNoYXRTZXJ2aWNlRGlzcG9zZUVtaXR0ZXI6IEVtaXR0ZXI8eyBzZXNzaW9uUmVzb3VyY2VzOiBVUklbXTsgcmVhc29uOiAnY2xlYXJlZCcgfT47XG5cdGxldCBjaGF0U2Vzc2lvbkFyY2hpdmVkRW1pdHRlcjogRW1pdHRlcjxJQWdlbnRTZXNzaW9uPjtcblx0bGV0IGNhcHR1cmVkU3RlZXJpbmdSZXF1ZXN0czogeyBzZXNzaW9uUmVzb3VyY2U6IFVSSTsgbWVzc2FnZTogc3RyaW5nOyBvcHRpb25zPzogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgfVtdO1xuXHRsZXQgc2FuZGJveEVuYWJsZWQ6IGJvb2xlYW47XG5cdGxldCBzYW5kYm94UHJlcmVxUmVzdWx0OiBJVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2tSZXN1bHQ7XG5cdGxldCB0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlOiBJVGVybWluYWxTYW5kYm94U2VydmljZTtcblx0bGV0IGNyZWF0ZWRUZXJtaW5hbEluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZTtcblx0bGV0IGNyZWF0ZVRlcm1pbmFsQ2FsbENvdW50OiBudW1iZXI7XG5cdGxldCBjaGF0U2Vzc2lvbnM6IE1hcDxzdHJpbmcsIENoYXRNb2RlbD47XG5cblx0bGV0IHJ1bkluVGVybWluYWxUb29sOiBUZXN0UnVuSW5UZXJtaW5hbFRvb2w7XG5cblx0ZnVuY3Rpb24gaXNEZWZhdWx0Q2hhdFBlcm1pc3Npb25TYW5kYm94UHJlY2hlY2tJbnB1dHMocHJlY2hlY2tJbnB1dHM6IElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBwcmVjaGVja0lucHV0cz8uaXNEZWZhdWx0QXBwcm92YWxQZXJtaXNzaW9uRW5hYmxlZCAhPT0gZmFsc2U7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0ZmlsZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBmaWxlU3lzdGVtUHJvdmlkZXIgPSBuZXcgVGVzdElQQ0ZpbGVTeXN0ZW1Qcm92aWRlcigpO1xuXHRcdHN0b3JlLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgZmlsZVN5c3RlbVByb3ZpZGVyKSk7XG5cblx0XHRzZXRDb25maWcoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmFibGVBdXRvQXBwcm92ZSwgdHJ1ZSk7XG5cdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQmxvY2tEZXRlY3RlZEZpbGVXcml0ZXMsICdvdXRzaWRlV29ya3NwYWNlJyk7XG5cdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuVGVybWluYWxQcm9maWxlTGludXgsIE9iamVjdC5mcmVlemUoeyBwYXRoOiAnYmFzaCcgfSkpO1xuXHRcdHNldENvbmZpZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dVbnNhbmRib3hlZENvbW1hbmRzLCB0cnVlKTtcblx0XHRzZXRDb25maWcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzLCB0cnVlKTtcblx0XHRzZXRDb25maWcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93QXV0b0FwcHJvdmUsIGZhbHNlKTtcblx0XHRzYW5kYm94RW5hYmxlZCA9IGZhbHNlO1xuXHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdHNhbmRib3hDb25maWdQYXRoOiB1bmRlZmluZWQsXG5cdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdH07XG5cblx0XHRjb25zdCBjb21tYW5kRmluaXNoZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkOyBnZXRPdXRwdXQoKTogc3RyaW5nIH0+KCk7XG5cdFx0Y29uc3Qgb25EaXNwb3NlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKTtcblx0XHRjb25zdCBvbkV4aXRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8bnVtYmVyIHwgdW5kZWZpbmVkPigpO1xuXHRcdGNvbnN0IG9uRGlkQWRkQ2FwYWJpbGl0eUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx7IGlkOiBUZXJtaW5hbENhcGFiaWxpdHkgfT4oKTtcblx0XHRjb25zdCBvbkRpZElucHV0RGF0YUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdFx0Y29uc3Qgb25EYXRhRW1pdHRlciA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0XHRjb25zdCBtYXJrZXIgPSB7XG5cdFx0XHRsaW5lOiAwLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0b25EaXNwb3NlOiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdFx0Y29uc3QgeHRlcm0gPSB7XG5cdFx0XHRnZXRDb250ZW50c0FzVGV4dDogKCkgPT4gJycsXG5cdFx0XHRyYXc6IHtcblx0XHRcdFx0b25EYXRhOiBvbkRhdGFFbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRyZWdpc3Rlck1hcmtlcjogKCkgPT4gbWFya2VyLFxuXHRcdFx0XHRidWZmZXI6IHtcblx0XHRcdFx0XHRhY3RpdmU6IHt9LFxuXHRcdFx0XHRcdGFsdGVybmF0ZToge30sXG5cdFx0XHRcdFx0b25CdWZmZXJDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y3JlYXRlVGVybWluYWxDYWxsQ291bnQgPSAwO1xuXHRcdGNyZWF0ZWRUZXJtaW5hbEluc3RhbmNlID0ge1xuXHRcdFx0aW5zdGFuY2VJZDogMSxcblx0XHRcdHByb2Nlc3NJZDogMSxcblx0XHRcdHByb2Nlc3NSZWFkeTogUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHR4dGVybVJlYWR5UHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKHh0ZXJtKSxcblx0XHRcdG9uRGF0YTogb25EYXRhRW1pdHRlci5ldmVudCxcblx0XHRcdG9uRXhpdDogb25FeGl0RW1pdHRlci5ldmVudCxcblx0XHRcdHNlbmRUZXh0OiBhc3luYyAoX3RleHQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHQvLyBTaW11bGF0ZSBzdWNjZXNzZnVsIGNvbW1hbmQgY29tcGxldGlvbiBhZnRlciBzZW5kVGV4dFxuXHRcdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRcdFx0b25EYXRhRW1pdHRlci5maXJlKCdcXHgxYl02MzM7Q1xceDA3XFx4MWJdNjMzO0FcXHgwNycpO1xuXHRcdFx0XHRcdGNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIuZmlyZSh7IGV4aXRDb2RlOiAwLCBnZXRPdXRwdXQ6ICgpID0+ICcnIH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRmb2N1czogKCkgPT4geyB9LFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdGdldDogKGNhcDogVGVybWluYWxDYXBhYmlsaXR5KSA9PiB7XG5cdFx0XHRcdFx0aWYgKGNhcCA9PT0gVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGNvbW1hbmRzOiBbXSxcblx0XHRcdFx0XHRcdFx0b25Db21tYW5kRmluaXNoZWQ6IGNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkRpZEFkZENhcGFiaWxpdHk6IG9uRGlkQWRkQ2FwYWJpbGl0eUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHR9LFxuXHRcdFx0b25EaWRJbnB1dERhdGE6IG9uRGlkSW5wdXREYXRhRW1pdHRlci5ldmVudCxcblx0XHRcdG9uRGlzcG9zZWQ6IG9uRGlzcG9zZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRvbkV4aXRFbWl0dGVyLmZpcmUoMCk7XG5cdFx0XHRcdG9uRGlzcG9zZWRFbWl0dGVyLmZpcmUoY3JlYXRlZFRlcm1pbmFsSW5zdGFuY2UpO1xuXHRcdFx0fSxcblx0XHRcdGdldEN3ZFJlc291cmNlOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRpc0Rpc3Bvc2VkOiBmYWxzZSxcblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0dGVybWluYWxTZXJ2aWNlRGlzcG9zZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKTtcblx0XHRjaGF0U2VydmljZURpc3Bvc2VFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBzZXNzaW9uUmVzb3VyY2VzOiBVUklbXTsgcmVhc29uOiAnY2xlYXJlZCcgfT4oKTtcblx0XHRjaGF0U2Vzc2lvbkFyY2hpdmVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPElBZ2VudFNlc3Npb24+KCk7XG5cdFx0Y2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzID0gW107XG5cdFx0Y2hhdFNlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIENoYXRNb2RlbD4oKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0ZmlsZVNlcnZpY2U6ICgpID0+IGZpbGVTZXJ2aWNlLFxuXHRcdH0sIHN0b3JlKTtcblxuXHRcdGNvbnN0IGNoYXRTZXJ2aWNlU3R1YiA9IHtcblx0XHRcdG9uRGlkRGlzcG9zZVNlc3Npb246IGNoYXRTZXJ2aWNlRGlzcG9zZUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRnZXRTZXNzaW9uOiAoc2Vzc2lvblJlc291cmNlOiBVUkkpID0+IGNoYXRTZXNzaW9ucy5nZXQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jIChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgbWVzc2FnZTogc3RyaW5nLCBvcHRpb25zPzogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMpID0+IHtcblx0XHRcdFx0Y2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzLnB1c2goeyBzZXNzaW9uUmVzb3VyY2UsIG1lc3NhZ2UsIG9wdGlvbnMgfSk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdyZWplY3RlZCcsIHJlYXNvbjogJ3Rlc3QnIH07XG5cdFx0XHR9LFxuXHRcdFx0YWNxdWlyZUV4aXN0aW5nU2Vzc2lvbjogKCkgPT4gKHtcblx0XHRcdFx0b2JqZWN0OiB7XG5cdFx0XHRcdFx0bGFzdFJlcXVlc3Q6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdE9iczogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pIGFzIHVua25vd24gYXMgTm9uTnVsbGFibGU8UmV0dXJuVHlwZTxJQ2hhdFNlcnZpY2VbJ2FjcXVpcmVFeGlzdGluZ1Nlc3Npb24nXT4+LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFNlcnZpY2U7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIGNoYXRTZXJ2aWNlU3R1Yik7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGU6IGNoYXRTZXNzaW9uQXJjaGl2ZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0bW9kZWw6IHtcblx0XHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZTogY2hhdFNlc3Npb25BcmNoaXZlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHR9IGFzIElBZ2VudFNlc3Npb25zU2VydmljZVsnbW9kZWwnXVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsU2VydmljZSwge1xuXHRcdFx0Y3JlYXRlVGVybWluYWw6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y3JlYXRlVGVybWluYWxDYWxsQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZWRUZXJtaW5hbEluc3RhbmNlO1xuXHRcdFx0fSxcblx0XHRcdGZvcmVncm91bmRJbnN0YW5jZXM6IFtdLFxuXHRcdFx0Y3JlYXRlT25JbnN0YW5jZUNhcGFiaWxpdHlFdmVudDogKCkgPT4gKHsgZXZlbnQ6IEV2ZW50Lk5vbmUsIGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRcdG9uRGlkRGlzcG9zZUluc3RhbmNlOiB0ZXJtaW5hbFNlcnZpY2VEaXNwb3NlRW1pdHRlci5ldmVudCxcblx0XHRcdG9uRGlkQ2hhbmdlSW5zdGFuY2VzOiBFdmVudC5Ob25lLFxuXHRcdFx0cmV2ZWFsVGVybWluYWw6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdHNldEFjdGl2ZUluc3RhbmNlOiAoKSA9PiB7IH0sXG5cdFx0XHRzZXROZXh0Q29tbWFuZElkOiBhc3luYyAoKSA9PiB7IH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbENoYXRTZXJ2aWNlLCBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxDaGF0U2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhpc3RvcnlTZXJ2aWNlLCB7XG5cdFx0XHRnZXRMYXN0QWN0aXZlV29ya3NwYWNlUm9vdDogKCkgPT4gdW5kZWZpbmVkXG5cdFx0fSk7XG5cdFx0dGVybWluYWxTYW5kYm94U2VydmljZSA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGlzRW5hYmxlZDogYXN5bmMgKHByZWNoZWNrSW5wdXRzKSA9PiBzYW5kYm94RW5hYmxlZCAmJiBpc0RlZmF1bHRDaGF0UGVybWlzc2lvblNhbmRib3hQcmVjaGVja0lucHV0cyhwcmVjaGVja0lucHV0cyksXG5cdFx0XHRpc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkOiBhc3luYyAoKSA9PiBmYWxzZSxcblx0XHRcdHdyYXBDb21tYW5kOiBhc3luYyAoY29tbWFuZDogc3RyaW5nLCByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24/OiBib29sZWFuKSA9PiAoe1xuXHRcdFx0XHRjb21tYW5kOiByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gPyBgdW5zYW5kYm94ZWQ6JHtjb21tYW5kfWAgOiBgc2FuZGJveDoke2NvbW1hbmR9YCxcblx0XHRcdFx0aXNTYW5kYm94V3JhcHBlZDogIXJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbixcblx0XHRcdH0pLFxuXHRcdFx0Y2hlY2tGaWxlQWNjZXNzOiBhc3luYyAoKSA9PiAoeyBhbGxvd2VkOiB0cnVlLCBkZW5pZWQ6IFtdIH0pLFxuXHRcdFx0Z2V0U2FuZGJveENvbmZpZ1BhdGg6IGFzeW5jICgpID0+IHNhbmRib3hFbmFibGVkID8gJy90bXAvc2FuZGJveC5qc29uJyA6IHVuZGVmaW5lZCxcblx0XHRcdGNoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXM6IGFzeW5jIChfZm9yY2VSZWZyZXNoPzogYm9vbGVhbiwgcHJlY2hlY2tJbnB1dHM/OiBJVGVybWluYWxTYW5kYm94UHJlY2hlY2tJbnB1dHMpID0+IGlzRGVmYXVsdENoYXRQZXJtaXNzaW9uU2FuZGJveFByZWNoZWNrSW5wdXRzKHByZWNoZWNrSW5wdXRzKVxuXHRcdFx0XHQ/IHNhbmRib3hQcmVyZXFSZXN1bHRcblx0XHRcdFx0OiB7IGVuYWJsZWQ6IGZhbHNlLCBzYW5kYm94Q29uZmlnUGF0aDogdW5kZWZpbmVkLCBmYWlsZWRDaGVjazogdW5kZWZpbmVkIH0sXG5cdFx0XHRnZXRUZW1wRGlyOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzZXROZWVkc0ZvcmNlVXBkYXRlQ29uZmlnRmlsZTogKCkgPT4geyB9LFxuXHRcdFx0Z2V0T1M6IGFzeW5jICgpID0+IE9wZXJhdGluZ1N5c3RlbS5MaW51eCxcblx0XHRcdGdldFJlc29sdmVkTmV0d29ya0RvbWFpbnM6ICgpID0+ICh7IGFsbG93ZWREb21haW5zOiBbXSwgZGVuaWVkRG9tYWluczogW10gfSksXG5cdFx0XHRnZXRNaXNzaW5nU2FuZGJveERlcGVuZGVuY2llczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRpbnN0YWxsTWlzc2luZ1NhbmRib3hEZXBlbmRlbmNpZXM6IGFzeW5jIChtaXNzaW5nRGVwZW5kZW5jaWVzLCBfc2Vzc2lvblJlc291cmNlLCBfdG9rZW4sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0Y29uc3QgdGVybWluYWwgPSBhd2FpdCBvcHRpb25zLmNyZWF0ZVRlcm1pbmFsKCk7XG5cdFx0XHRcdGF3YWl0IG9wdGlvbnMuZm9jdXNUZXJtaW5hbCh0ZXJtaW5hbCk7XG5cdFx0XHRcdGF3YWl0IHRlcm1pbmFsLnNlbmRUZXh0KGBzdWRvIGFwdCBpbnN0YWxsIC15ICR7bWlzc2luZ0RlcGVuZGVuY2llcy5qb2luKCcgJyl9YCwgdHJ1ZSk7XG5cdFx0XHRcdHJldHVybiB7IGV4aXRDb2RlOiAwIH07XG5cdFx0XHR9LFxuXHRcdFx0cnVuU2FuZGJveFJlbWVkaWF0aW9uOiBhc3luYyAoKSA9PiAoeyBleGl0Q29kZTogMCB9KSxcblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsU2FuZGJveFNlcnZpY2UsIHRlcm1pbmFsU2FuZGJveFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSkpO1xuXHRcdHRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS5pc1Rlc3QgPSB0cnVlO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSwgdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIHtcblx0XHRcdGdldFRvb2xzKCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxzU2VydmljZSwge1xuXHRcdFx0c2VsZWN0TGFuZ3VhZ2VNb2RlbHM6IGFzeW5jICgpID0+IFsnY29waWxvdC9jb3BpbG90LXV0aWxpdHktc21hbGwnXSxcblx0XHR9IGFzIHVua25vd24gYXMgSUxhbmd1YWdlTW9kZWxzU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCB7XG5cdFx0XHRnZXREZWZhdWx0UHJvZmlsZTogYXN5bmMgKCkgPT4gKHsgcGF0aDogJ2Jhc2gnIH0gYXMgSVRlcm1pbmFsUHJvZmlsZSlcblx0XHR9KTtcblxuXHRcdHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoVGVybWluYWxUb29sQ29uZmlybWF0aW9uU3RvcmFnZUtleXMuVGVybWluYWxBdXRvQXBwcm92ZVdhcm5pbmdBY2NlcHRlZCwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0cnVuSW5UZXJtaW5hbFRvb2wgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFJ1bkluVGVybWluYWxUb29sKSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHNldEF1dG9BcHByb3ZlKHZhbHVlOiB7IFtrZXk6IHN0cmluZ106IHsgYXBwcm92ZTogYm9vbGVhbjsgbWF0Y2hDb21tYW5kTGluZT86IGJvb2xlYW4gfSB8IGJvb2xlYW4gfSkge1xuXHRcdHNldENvbmZpZyhUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlLCB2YWx1ZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzZXRDb25maWcoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKSB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oa2V5LCB2YWx1ZSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoKSA9PiB0cnVlLFxuXHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtrZXldKSxcblx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0Y2hhbmdlOiBudWxsISxcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNsZWFyQXV0b0FwcHJvdmVXYXJuaW5nQWNjZXB0ZWRTdGF0ZSgpIHtcblx0XHRzdG9yYWdlU2VydmljZS5yZW1vdmUoVGVybWluYWxUb29sQ29uZmlybWF0aW9uU3RvcmFnZUtleXMuVGVybWluYWxBdXRvQXBwcm92ZVdhcm5pbmdBY2NlcHRlZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFeGVjdXRlcyBhIHRlc3Qgc2NlbmFyaW8gZm9yIHRoZSBSdW5JblRlcm1pbmFsVG9vbFxuXHQgKi9cblx0YXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVRvb2xUZXN0KFxuXHRcdHBhcmFtczogUGFydGlhbDxJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zPlxuXHQpOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0ID0ge1xuXHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnUHJpbnQgaGVsbG8gdG8gdGhlIGNvbnNvbGUnLFxuXHRcdFx0XHRnb2FsOiAnUHJpbnQgaGVsbG8nLFxuXHRcdFx0XHQuLi5wYXJhbXNcblx0XHRcdH0gYXMgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtc1xuXHRcdH0gYXMgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuSW5UZXJtaW5hbFRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBpbnZva2VUb29sVGVzdChcblx0XHRwYXJhbXM6IFBhcnRpYWw8SVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcz4sXG5cdFx0c2VsZWN0ZWRDdXN0b21CdXR0b24/OiBzdHJpbmcsXG5cdCk6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBwYXJhbWV0ZXJzID0ge1xuXHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0ZXhwbGFuYXRpb246ICdQcmludCBoZWxsbyB0byB0aGUgY29uc29sZScsXG5cdFx0XHRnb2FsOiAnUHJpbnQgaGVsbG8nLFxuXHRcdFx0Li4ucGFyYW1zXG5cdFx0fSBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zO1xuXHRcdGNvbnN0IHByZXBhcmVkSW52b2NhdGlvbiA9IGF3YWl0IHJ1bkluVGVybWluYWxUb29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7IHBhcmFtZXRlcnMgfSBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdG9rKHByZXBhcmVkSW52b2NhdGlvbj8udG9vbFNwZWNpZmljRGF0YSwgJ0V4cGVjdGVkIHRvb2xTcGVjaWZpY0RhdGEgdG8gYmUgZGVmaW5lZCcpO1xuXG5cdFx0Y29uc3QgY291bnRUb2tlbnMgPSBhc3luYyAoKSA9PiAwO1xuXHRcdGNvbnN0IG5vUHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcyA9IHsgcmVwb3J0KCkgeyB9IH07XG5cdFx0cmV0dXJuIHJ1bkluVGVybWluYWxUb29sLmludm9rZSh7XG5cdFx0XHRjYWxsSWQ6ICd0ZXN0LWNhbGwnLFxuXHRcdFx0dG9vbElkOiBUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsLFxuXHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdGNvbnRleHQ6IHsgc2Vzc2lvblJlc291cmNlOiBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3J1bi1pbi10ZXJtaW5hbC10ZXN0JykgfSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHByZXBhcmVkSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0c2VsZWN0ZWRDdXN0b21CdXR0b24sXG5cdFx0fSBhcyBJVG9vbEludm9jYXRpb24sIGNvdW50VG9rZW5zLCBub1Byb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGlzU2VwYXJhdG9yKGFjdGlvbjogVG9vbENvbmZpcm1hdGlvbkFjdGlvbik6IGFjdGlvbiBpcyBTZXBhcmF0b3Ige1xuXHRcdHJldHVybiBhY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3I7XG5cdH1cblxuXHQvKipcblx0ICogSGVscGVyIHRvIGFzc2VydCB0aGF0IGEgY29tbWFuZCBzaG91bGQgYmUgYXV0by1hcHByb3ZlZCAobm8gY29uZmlybWF0aW9uIHJlcXVpcmVkKVxuXHQgKi9cblx0ZnVuY3Rpb24gYXNzZXJ0QXV0b0FwcHJvdmVkKHByZXBhcmVkSW52b2NhdGlvbjogSVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQpIHtcblx0XHRvayhwcmVwYXJlZEludm9jYXRpb24sICdFeHBlY3RlZCBwcmVwYXJlZCBpbnZvY2F0aW9uIHRvIGJlIGRlZmluZWQnKTtcblx0XHRvayghcHJlcGFyZWRJbnZvY2F0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCAnRXhwZWN0ZWQgbm8gY29uZmlybWF0aW9uIG1lc3NhZ2VzIGZvciBhdXRvLWFwcHJvdmVkIGNvbW1hbmQnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIZWxwZXIgdG8gYXNzZXJ0IHRoYXQgYSBjb21tYW5kIHJlcXVpcmVzIGNvbmZpcm1hdGlvblxuXHQgKi9cblx0ZnVuY3Rpb24gYXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocHJlcGFyZWRJbnZvY2F0aW9uOiBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZCwgZXhwZWN0ZWRUaXRsZT86IHN0cmluZykge1xuXHRcdG9rKHByZXBhcmVkSW52b2NhdGlvbiwgJ0V4cGVjdGVkIHByZXBhcmVkIGludm9jYXRpb24gdG8gYmUgZGVmaW5lZCcpO1xuXHRcdG9rKHByZXBhcmVkSW52b2NhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcywgJ0V4cGVjdGVkIGNvbmZpcm1hdGlvbiBtZXNzYWdlcyBmb3Igbm9uLWFwcHJvdmVkIGNvbW1hbmQnKTtcblx0XHRpZiAoZXhwZWN0ZWRUaXRsZSkge1xuXHRcdFx0c3RyaWN0RXF1YWwocHJlcGFyZWRJbnZvY2F0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzIS50aXRsZSwgZXhwZWN0ZWRUaXRsZSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlQ2hhdE1vZGVJbmZvKHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCk6IElDaGF0UmVxdWVzdE1vZGVJbmZvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogdW5kZWZpbmVkLFxuXHRcdFx0aXNCdWlsdGluOiB0cnVlLFxuXHRcdFx0bW9kZUluc3RydWN0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0dGVsZW1ldHJ5TW9kZUlkOiAnYWdlbnQnLFxuXHRcdFx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHBlcm1pc3Npb25MZXZlbCxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlQ2hhdE1vZGVsV2l0aFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlOiBVUkksIG1vZGVJbmZvPzogSUNoYXRSZXF1ZXN0TW9kZUluZm8sIHJlcXVlc3RJZD86IHN0cmluZyk6IENoYXRNb2RlbCB7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGVsLCB1bmRlZmluZWQsIHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9KSk7XG5cdFx0Y29uc3QgdGV4dCA9ICdyZXRyeSc7XG5cdFx0bW9kZWwuYWRkUmVxdWVzdCh7IHRleHQsIHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIHRleHQubGVuZ3RoLCAxLCB0ZXh0Lmxlbmd0aCksIHRleHQpXSB9LCB7IHZhcmlhYmxlczogW10gfSwgMCwgbW9kZUluZm8sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCByZXF1ZXN0SWQpO1xuXHRcdGNoYXRTZXNzaW9ucy5zZXQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIG1vZGVsKTtcblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHR0eXBlIEF1dG9tYXRpY1NhbmRib3hSZXRyeUtpbmRGb3JUZXN0ID0gJ3Vuc2FuZGJveGVkJyB8ICdhbGxvd05ldHdvcmsnO1xuXG5cdGZ1bmN0aW9uIGNvbmZpcm1BdXRvbWF0aWNTYW5kYm94UmV0cnkodG9vbDogUnVuSW5UZXJtaW5hbFRvb2wsIHJldHJ5S2luZDogQXV0b21hdGljU2FuZGJveFJldHJ5S2luZEZvclRlc3QsIHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBjb21tYW5kOiBzdHJpbmcsIHNoZWxsOiBzdHJpbmcsIGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiAodG9vbCBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIChyZXRyeUtpbmQ6IEF1dG9tYXRpY1NhbmRib3hSZXRyeUtpbmRGb3JUZXN0LCBzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgY29tbWFuZDogc3RyaW5nLCBzaGVsbDogc3RyaW5nLCBibG9ja2VkRG9tYWluczogc3RyaW5nW10gfCB1bmRlZmluZWQsIHJpc2tBc3Nlc3NtZW50OiB7IHRvb2xJZDogc3RyaW5nOyBwYXJhbWV0ZXJzOiB1bmtub3duIH0gfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTxib29sZWFuPj4pWydfY29uZmlybUF1dG9tYXRpY1NhbmRib3hSZXRyeSddKHJldHJ5S2luZCwgc2Vzc2lvblJlc291cmNlLCBjb21tYW5kLCBzaGVsbCwgYmxvY2tlZERvbWFpbnMsIHVuZGVmaW5lZCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjb25maXJtQXV0b21hdGljVW5zYW5kYm94UmV0cnkodG9vbDogUnVuSW5UZXJtaW5hbFRvb2wsIHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBjb21tYW5kOiBzdHJpbmcsIHNoZWxsOiBzdHJpbmcsIGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBjb25maXJtQXV0b21hdGljU2FuZGJveFJldHJ5KHRvb2wsICd1bnNhbmRib3hlZCcsIHNlc3Npb25SZXNvdXJjZSwgY29tbWFuZCwgc2hlbGwsIGJsb2NrZWREb21haW5zKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbmZpcm1BdXRvbWF0aWNBbGxvd05ldHdvcmtSZXRyeSh0b29sOiBSdW5JblRlcm1pbmFsVG9vbCwgc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGNvbW1hbmQ6IHN0cmluZywgc2hlbGw6IHN0cmluZywgYmxvY2tlZERvbWFpbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIGNvbmZpcm1BdXRvbWF0aWNTYW5kYm94UmV0cnkodG9vbCwgJ2FsbG93TmV0d29yaycsIHNlc3Npb25SZXNvdXJjZSwgY29tbWFuZCwgc2hlbGwsIGJsb2NrZWREb21haW5zKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGFzc2VydEF1dG9tYXRpY1Vuc2FuZGJveFJldHJ5RWxpY2l0YXRpb24odG9vbDogUnVuSW5UZXJtaW5hbFRvb2wsIHNlc3Npb25SZXNvdXJjZTogVVJJLCBjb21tYW5kOiBzdHJpbmcsIHNoZWxsOiBzdHJpbmcsIGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlQ2hhdE1vZGVsV2l0aFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBzaG91bGRSZXRyeSA9IGNvbmZpcm1BdXRvbWF0aWNVbnNhbmRib3hSZXRyeSh0b29sLCBzZXNzaW9uUmVzb3VyY2UsIGNvbW1hbmQsIHNoZWxsLCBibG9ja2VkRG9tYWlucyk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVxdWVzdD8ucmVzcG9uc2U7XG5cdFx0b2socmVzcG9uc2UsICdFeHBlY3RlZCBjaGF0IHJlcXVlc3Qgd2l0aCByZXNwb25zZScpO1xuXHRcdGNvbnN0IGVsaWNpdGF0aW9uID0gcmVzcG9uc2UucmVzcG9uc2UudmFsdWUuZmluZChwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ2VsaWNpdGF0aW9uMicpO1xuXHRcdG9rKGVsaWNpdGF0aW9uPy5raW5kID09PSAnZWxpY2l0YXRpb24yJywgJ0V4cGVjdGVkIGF1dG9tYXRpYyB1bnNhbmRib3ggcmV0cnkgZWxpY2l0YXRpb24nKTtcblx0XHRjb25zdCByZWplY3QgPSBlbGljaXRhdGlvbi5yZWplY3Q7XG5cdFx0b2socmVqZWN0LCAnRXhwZWN0ZWQgYXV0b21hdGljIHVuc2FuZGJveCByZXRyeSBlbGljaXRhdGlvbiB0byBoYXZlIGEgcmVqZWN0IGFjdGlvbicpO1xuXG5cdFx0YXdhaXQgcmVqZWN0KCk7XG5cdFx0c3RyaWN0RXF1YWwoYXdhaXQgc2hvdWxkUmV0cnksIGZhbHNlKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGFzc2VydEF1dG9tYXRpY0FsbG93TmV0d29ya1JldHJ5RWxpY2l0YXRpb24odG9vbDogUnVuSW5UZXJtaW5hbFRvb2wsIHNlc3Npb25SZXNvdXJjZTogVVJJLCBjb21tYW5kOiBzdHJpbmcsIHNoZWxsOiBzdHJpbmcsIGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgZXhwZWN0ZWRUaXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVDaGF0TW9kZWxXaXRoUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHNob3VsZFJldHJ5ID0gY29uZmlybUF1dG9tYXRpY0FsbG93TmV0d29ya1JldHJ5KHRvb2wsIHNlc3Npb25SZXNvdXJjZSwgY29tbWFuZCwgc2hlbGwsIGJsb2NrZWREb21haW5zKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gbW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSByZXF1ZXN0Py5yZXNwb25zZTtcblx0XHRvayhyZXNwb25zZSwgJ0V4cGVjdGVkIGNoYXQgcmVxdWVzdCB3aXRoIHJlc3BvbnNlJyk7XG5cdFx0Y29uc3QgZWxpY2l0YXRpb24gPSByZXNwb25zZS5yZXNwb25zZS52YWx1ZS5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSAnZWxpY2l0YXRpb24yJyk7XG5cdFx0b2soZWxpY2l0YXRpb24/LmtpbmQgPT09ICdlbGljaXRhdGlvbjInLCAnRXhwZWN0ZWQgYXV0b21hdGljIGFsbG93LW5ldHdvcmsgcmV0cnkgZWxpY2l0YXRpb24nKTtcblx0XHRjb25zdCB0aXRsZSA9IGVsaWNpdGF0aW9uLnRpdGxlO1xuXHRcdG9rKHR5cGVvZiB0aXRsZSAhPT0gJ3N0cmluZycsICdFeHBlY3RlZCBhdXRvbWF0aWMgYWxsb3ctbmV0d29yayByZXRyeSB0aXRsZSB0byBiZSBtYXJrZG93bicpO1xuXHRcdHN0cmljdEVxdWFsKHRpdGxlLnZhbHVlLCBleHBlY3RlZFRpdGxlKTtcblx0XHRjb25zdCByZWplY3QgPSBlbGljaXRhdGlvbi5yZWplY3Q7XG5cdFx0b2socmVqZWN0LCAnRXhwZWN0ZWQgYXV0b21hdGljIGFsbG93LW5ldHdvcmsgcmV0cnkgZWxpY2l0YXRpb24gdG8gaGF2ZSBhIHJlamVjdCBhY3Rpb24nKTtcblxuXHRcdGF3YWl0IHJlamVjdCgpO1xuXHRcdHN0cmljdEVxdWFsKGF3YWl0IHNob3VsZFJldHJ5LCBmYWxzZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRBdXRvbWF0aWNTYW5kYm94UmV0cnlUaXRsZSh0b29sOiBSdW5JblRlcm1pbmFsVG9vbCwgcmV0cnlLaW5kOiBBdXRvbWF0aWNTYW5kYm94UmV0cnlLaW5kRm9yVGVzdCwgc2hlbGxUeXBlOiBzdHJpbmcsIGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IElNYXJrZG93blN0cmluZyB7XG5cdFx0cmV0dXJuICh0b29sIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgKHJldHJ5S2luZDogQXV0b21hdGljU2FuZGJveFJldHJ5S2luZEZvclRlc3QsIHNoZWxsVHlwZTogc3RyaW5nLCBibG9ja2VkRG9tYWluczogc3RyaW5nW10gfCB1bmRlZmluZWQpID0+IElNYXJrZG93blN0cmluZz4pWydfZ2V0QXV0b21hdGljU2FuZGJveFJldHJ5VGl0bGUnXShyZXRyeUtpbmQsIHNoZWxsVHlwZSwgYmxvY2tlZERvbWFpbnMpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0QXV0b21hdGljVW5zYW5kYm94UmV0cnlUaXRsZSh0b29sOiBSdW5JblRlcm1pbmFsVG9vbCwgc2hlbGxUeXBlOiBzdHJpbmcsIGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IElNYXJrZG93blN0cmluZyB7XG5cdFx0cmV0dXJuIGdldEF1dG9tYXRpY1NhbmRib3hSZXRyeVRpdGxlKHRvb2wsICd1bnNhbmRib3hlZCcsIHNoZWxsVHlwZSwgYmxvY2tlZERvbWFpbnMpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0QXV0b21hdGljQWxsb3dOZXR3b3JrUmV0cnlUaXRsZSh0b29sOiBSdW5JblRlcm1pbmFsVG9vbCwgc2hlbGxUeXBlOiBzdHJpbmcsIGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IElNYXJrZG93blN0cmluZyB7XG5cdFx0cmV0dXJuIGdldEF1dG9tYXRpY1NhbmRib3hSZXRyeVRpdGxlKHRvb2wsICdhbGxvd05ldHdvcmsnLCBzaGVsbFR5cGUsIGJsb2NrZWREb21haW5zKTtcblx0fVxuXG5cdHN1aXRlKCdzYW5kYm94IGludm9jYXRpb24gbWVzc2FnaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBpbnN0cnVjdCBtb2RlbHMgdG8gdXNlICRUTVBESVIgaW5zdGVhZCBvZiAvdG1wIHdoZW4gc2FuZGJveGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXG5cdFx0XHRjb25zdCB0b29sRGF0YSA9IGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGNyZWF0ZVJ1bkluVGVybWluYWxUb29sRGF0YSk7XG5cblx0XHRcdG9rKHRvb2xEYXRhLm1vZGVsRGVzY3JpcHRpb24/LmluY2x1ZGVzKCdVc2UgJFRNUERJUiBmb3IgdGVtcG9yYXJ5IGZpbGVzJyksICdFeHBlY3RlZCBzYW5kYm94ZWQgdG9vbCBkZXNjcmlwdGlvbiB0byByZXF1aXJlICRUTVBESVIgdXNhZ2UnKTtcblx0XHRcdG9rKHRvb2xEYXRhLm1vZGVsRGVzY3JpcHRpb24/LmluY2x1ZGVzKCcvdG1wIG1heSBub3QgYmUgd3JpdGFibGUnKSwgJ0V4cGVjdGVkIHNhbmRib3hlZCB0b29sIGRlc2NyaXB0aW9uIHRvIGRpc2NvdXJhZ2UgL3RtcCB1c2FnZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgc2FuZGJveCBlc2NhbGF0aW9uIHJlcXVlc3RzIGluIHNjaGVtYSB3aGVuIHNhbmRib3ggaXMgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldENvbmZpZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94UmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMsIHRydWUpO1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXG5cdFx0XHRjb25zdCB0b29sRGF0YSA9IGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGNyZWF0ZVJ1bkluVGVybWluYWxUb29sRGF0YSk7XG5cdFx0XHRjb25zdCBwcm9wZXJ0aWVzID0gdG9vbERhdGEuaW5wdXRTY2hlbWE/LnByb3BlcnRpZXMgYXMgUmVjb3JkPHN0cmluZywgb2JqZWN0PiB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblByb3BlcnR5ID0gcHJvcGVydGllcz8uWydyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24nXSBhcyB7IGRlc2NyaXB0aW9uPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb25Qcm9wZXJ0eSA9IHByb3BlcnRpZXM/LlsncmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uJ10gYXMgeyBkZXNjcmlwdGlvbj86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVxdWVzdEFsbG93TmV0d29ya1Byb3BlcnR5ID0gcHJvcGVydGllcz8uWydyZXF1ZXN0QWxsb3dOZXR3b3JrJ10gYXMgeyBkZXNjcmlwdGlvbj86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVxdWVzdEFsbG93TmV0d29ya1JlYXNvblByb3BlcnR5ID0gcHJvcGVydGllcz8uWydyZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uJ10gYXMgeyBkZXNjcmlwdGlvbj86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2tQcm9wZXJ0eSA9IHByb3BlcnRpZXM/LlsncmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2snXSBhcyB7IGRlc2NyaXB0aW9uPzogc3RyaW5nOyB0eXBlPzogc3RyaW5nOyBpdGVtcz86IHsgdHlwZT86IHN0cmluZyB9IH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCByZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVja1JlYXNvblByb3BlcnR5ID0gcHJvcGVydGllcz8uWydyZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVja1JlYXNvbiddIGFzIHsgZGVzY3JpcHRpb24/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0b2socHJvcGVydGllcz8uWydyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24nXSwgJ0V4cGVjdGVkIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiBpbiBzY2hlbWEgd2hlbiBzYW5kYm94IGlzIGVuYWJsZWQnKTtcblx0XHRcdG9rKHByb3BlcnRpZXM/LlsncmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uJ10sICdFeHBlY3RlZCByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24gaW4gc2NoZW1hIHdoZW4gc2FuZGJveCBpcyBlbmFibGVkJyk7XG5cdFx0XHRvayhwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RBbGxvd05ldHdvcmsnXSwgJ0V4cGVjdGVkIHJlcXVlc3RBbGxvd05ldHdvcmsgaW4gc2NoZW1hIHdoZW4gc2FuZGJveCBpcyBlbmFibGVkJyk7XG5cdFx0XHRvayhwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24nXSwgJ0V4cGVjdGVkIHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24gaW4gc2NoZW1hIHdoZW4gc2FuZGJveCBpcyBlbmFibGVkJyk7XG5cdFx0XHRvayhwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrJ10sICdFeHBlY3RlZCByZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVjayBpbiBzY2hlbWEgd2hlbiBzYW5kYm94IGlzIGVuYWJsZWQnKTtcblx0XHRcdG9rKHByb3BlcnRpZXM/LlsncmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2tSZWFzb24nXSwgJ0V4cGVjdGVkIHJlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrUmVhc29uIGluIHNjaGVtYSB3aGVuIHNhbmRib3ggaXMgZW5hYmxlZCcpO1xuXHRcdFx0b2socmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUHJvcGVydHk/LmRlc2NyaXB0aW9uPy5pbmNsdWRlcygnT25seSBzZXQgdGhpcyB3aGVuIHRoZSBjb21tYW5kIGNsZWFybHkgbmVlZHMgdW5zYW5kYm94ZWQgYWNjZXNzJyksICdFeHBlY3RlZCBzY2hlbWEgZGVzY3JpcHRpb24gdG8gcmVxdWlyZSBhIGNsZWFyIG5lZWQgZm9yIHVuc2FuZGJveGVkIGFjY2VzcycpO1xuXHRcdFx0b2socmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uUHJvcGVydHk/LmRlc2NyaXB0aW9uPy5pbmNsdWRlcygnd2h5IHRoaXMgY29tbWFuZCBtdXN0IHJ1biBvdXRzaWRlIHRoZSB0ZXJtaW5hbCBzYW5kYm94JyksICdFeHBlY3RlZCByZWFzb24gc2NoZW1hIGRlc2NyaXB0aW9uIHRvIHJlcXVpcmUgY29uY3JldGUgc2FuZGJveCBqdXN0aWZpY2F0aW9uJyk7XG5cdFx0XHRvayhyZXF1ZXN0QWxsb3dOZXR3b3JrUHJvcGVydHk/LmRlc2NyaXB0aW9uPy5pbmNsdWRlcygncmVtYWluIGluIHRoZSB0ZXJtaW5hbCBzYW5kYm94IGJ1dCBydW4gd2l0aCB1bnJlc3RyaWN0ZWQgbmV0d29yayBhY2Nlc3MnKSwgJ0V4cGVjdGVkIG5ldHdvcmsgc2NoZW1hIGRlc2NyaXB0aW9uIHRvIHJldGFpbiBzYW5kYm94aW5nJyk7XG5cdFx0XHRvayhyZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uUHJvcGVydHk/LmRlc2NyaXB0aW9uPy5pbmNsdWRlcygnbmVlZHMgdW5yZXN0cmljdGVkIG5ldHdvcmsgYWNjZXNzJyksICdFeHBlY3RlZCBuZXR3b3JrIHJlYXNvbiBzY2hlbWEgZGVzY3JpcHRpb24gdG8gcmVxdWVzdCBqdXN0aWZpY2F0aW9uJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVja1Byb3BlcnR5Py50eXBlLCAnYXJyYXknLCAnRXhwZWN0ZWQgZmlsZSB2YWxpZGF0aW9uIHNjaGVtYSB0byBhY2NlcHQgZmlsZSBwYXRocycpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2tQcm9wZXJ0eT8uaXRlbXM/LnR5cGUsICdzdHJpbmcnLCAnRXhwZWN0ZWQgZmlsZSB2YWxpZGF0aW9uIHBhdGhzIHRvIGJlIHN0cmluZ3MnKTtcblx0XHRcdG9rKHJlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrUHJvcGVydHk/LmRlc2NyaXB0aW9uPy5pbmNsdWRlcygnYmVmb3JlIHJ1bm5pbmcgdGhlIGNvbW1hbmQnKSwgJ0V4cGVjdGVkIGZpbGUgdmFsaWRhdGlvbiBzY2hlbWEgZGVzY3JpcHRpb24gdG8gZGVzY3JpYmUgcHJlLWV4ZWN1dGlvbiBhY2Nlc3MgY2hlY2tzJyk7XG5cdFx0XHRvayhyZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVja1JlYXNvblByb3BlcnR5Py5kZXNjcmlwdGlvbj8uaW5jbHVkZXMoJ3RoZXNlIGZpbGUgcGF0aHMnKSwgJ0V4cGVjdGVkIGZpbGUgdmFsaWRhdGlvbiByZWFzb24gc2NoZW1hIGRlc2NyaXB0aW9uIHRvIHJlcXVlc3QganVzdGlmaWNhdGlvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG9taXQgdW5zYW5kYm94ZWQgZXhlY3V0aW9uIHJlcXVlc3RzIGZyb20gc2NoZW1hIHdoZW4gdW5zYW5kYm94ZWQgY29tbWFuZHMgYXJlIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0Q29uZmlnKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMsIGZhbHNlKTtcblx0XHRcdHNldENvbmZpZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94UmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMsIHRydWUpO1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXG5cdFx0XHRjb25zdCB0b29sRGF0YSA9IGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGNyZWF0ZVJ1bkluVGVybWluYWxUb29sRGF0YSk7XG5cdFx0XHRjb25zdCBwcm9wZXJ0aWVzID0gdG9vbERhdGEuaW5wdXRTY2hlbWE/LnByb3BlcnRpZXMgYXMgUmVjb3JkPHN0cmluZywgb2JqZWN0PiB8IHVuZGVmaW5lZDtcblxuXHRcdFx0b2soIXByb3BlcnRpZXM/LlsncmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uJ10sICdFeHBlY3RlZCBubyByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gaW4gc2NoZW1hIHdoZW4gdW5zYW5kYm94ZWQgY29tbWFuZHMgYXJlIGRpc2FibGVkJyk7XG5cdFx0XHRvayghcHJvcGVydGllcz8uWydyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24nXSwgJ0V4cGVjdGVkIG5vIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiBpbiBzY2hlbWEgd2hlbiB1bnNhbmRib3hlZCBjb21tYW5kcyBhcmUgZGlzYWJsZWQnKTtcblx0XHRcdG9rKHByb3BlcnRpZXM/LlsncmVxdWVzdEFsbG93TmV0d29yayddLCAnRXhwZWN0ZWQgcmVxdWVzdEFsbG93TmV0d29yayB0byByZW1haW4gaW4gc2NoZW1hIHdoZW4gcGVyLWNvbW1hbmQgbmV0d29yayBhY2Nlc3MgaXMgZW5hYmxlZCcpO1xuXHRcdFx0b2socHJvcGVydGllcz8uWydyZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uJ10sICdFeHBlY3RlZCByZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uIHRvIHJlbWFpbiBpbiBzY2hlbWEgd2hlbiBwZXItY29tbWFuZCBuZXR3b3JrIGFjY2VzcyBpcyBlbmFibGVkJyk7XG5cdFx0XHRvayh0b29sRGF0YS5tb2RlbERlc2NyaXB0aW9uPy5pbmNsdWRlcygnUnVubmluZyBjb21tYW5kcyBvdXRzaWRlIHRoZSBzYW5kYm94IGlzIGRpc2FibGVkJyksICdFeHBlY3RlZCBtb2RlbCBkZXNjcmlwdGlvbiB0byBleHBsYWluIHRoYXQgdW5zYW5kYm94ZWQgY29tbWFuZHMgYXJlIGRpc2FibGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJlY29tbWVuZCBhbGxvdy1uZXR3b3JrIHJlcXVlc3RzIGluIG1vZGVsIGRlc2NyaXB0aW9uIHdoZW4gcGVyLWNvbW1hbmQgbmV0d29yayBhY2Nlc3MgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRDb25maWcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzLCBmYWxzZSk7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cblx0XHRcdGNvbnN0IHRvb2xEYXRhID0gYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oY3JlYXRlUnVuSW5UZXJtaW5hbFRvb2xEYXRhKTtcblx0XHRcdGNvbnN0IHByb3BlcnRpZXMgPSB0b29sRGF0YS5pbnB1dFNjaGVtYT8ucHJvcGVydGllcyBhcyBSZWNvcmQ8c3RyaW5nLCBvYmplY3Q+IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRvayghcHJvcGVydGllcz8uWydyZXF1ZXN0QWxsb3dOZXR3b3JrJ10sICdFeHBlY3RlZCBubyByZXF1ZXN0QWxsb3dOZXR3b3JrIGluIHNjaGVtYSB3aGVuIHBlci1jb21tYW5kIG5ldHdvcmsgYWNjZXNzIGlzIGRpc2FibGVkJyk7XG5cdFx0XHRvayghcHJvcGVydGllcz8uWydyZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uJ10sICdFeHBlY3RlZCBubyByZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uIGluIHNjaGVtYSB3aGVuIHBlci1jb21tYW5kIG5ldHdvcmsgYWNjZXNzIGlzIGRpc2FibGVkJyk7XG5cdFx0XHRvayghdG9vbERhdGEubW9kZWxEZXNjcmlwdGlvbj8uaW5jbHVkZXMoJ3JlcXVlc3RBbGxvd05ldHdvcms9dHJ1ZScpLCAnRXhwZWN0ZWQgbW9kZWwgZGVzY3JpcHRpb24gbm90IHRvIHJlY29tbWVuZCBhbGxvdy1uZXR3b3JrIHJlcXVlc3RzIHdoZW4gcGVyLWNvbW1hbmQgbmV0d29yayBhY2Nlc3MgaXMgZGlzYWJsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgaW5jbHVkZSByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gaW4gc2NoZW1hIHdoZW4gc2FuZGJveCBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IHRvb2xEYXRhID0gYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oY3JlYXRlUnVuSW5UZXJtaW5hbFRvb2xEYXRhKTtcblx0XHRcdGNvbnN0IHByb3BlcnRpZXMgPSB0b29sRGF0YS5pbnB1dFNjaGVtYT8ucHJvcGVydGllcyBhcyBSZWNvcmQ8c3RyaW5nLCBvYmplY3Q+IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRvayghcHJvcGVydGllcz8uWydhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcyddLCAnRXhwZWN0ZWQgbm8gYWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHMgd2hlbiBzYW5kYm94IGlzIGRpc2FibGVkJyk7XG5cdFx0XHRvayghcHJvcGVydGllcz8uWydyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24nXSwgJ0V4cGVjdGVkIG5vIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiBpbiBzY2hlbWEgd2hlbiBzYW5kYm94IGlzIGRpc2FibGVkJyk7XG5cdFx0XHRvayghcHJvcGVydGllcz8uWydyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24nXSwgJ0V4cGVjdGVkIG5vIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiBpbiBzY2hlbWEgd2hlbiBzYW5kYm94IGlzIGRpc2FibGVkJyk7XG5cdFx0XHRvayghcHJvcGVydGllcz8uWydyZXF1ZXN0QWxsb3dOZXR3b3JrJ10sICdFeHBlY3RlZCBubyByZXF1ZXN0QWxsb3dOZXR3b3JrIGluIHNjaGVtYSB3aGVuIHNhbmRib3ggaXMgZGlzYWJsZWQnKTtcblx0XHRcdG9rKCFwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24nXSwgJ0V4cGVjdGVkIG5vIHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24gaW4gc2NoZW1hIHdoZW4gc2FuZGJveCBpcyBkaXNhYmxlZCcpO1xuXHRcdFx0b2soIXByb3BlcnRpZXM/LlsncmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2snXSwgJ0V4cGVjdGVkIG5vIHJlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrIHdoZW4gc2FuZGJveCBpcyBkaXNhYmxlZCcpO1xuXHRcdFx0b2soIXByb3BlcnRpZXM/LlsncmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2tSZWFzb24nXSwgJ0V4cGVjdGVkIG5vIHJlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrUmVhc29uIHdoZW4gc2FuZGJveCBpcyBkaXNhYmxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlZmxlY3Qgc2FuZGJveCBzZXR0aW5nIGNoYW5nZXMgaW4gdG9vbCBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgdG9vbERhdGFCZWZvcmUgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjcmVhdGVSdW5JblRlcm1pbmFsVG9vbERhdGEpO1xuXHRcdFx0Y29uc3QgcHJvcGVydGllc0JlZm9yZSA9IHRvb2xEYXRhQmVmb3JlLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzIGFzIFJlY29yZDxzdHJpbmcsIG9iamVjdD4gfCB1bmRlZmluZWQ7XG5cdFx0XHRvayghcHJvcGVydGllc0JlZm9yZT8uWydyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24nXSwgJ0V4cGVjdGVkIG5vIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiBiZWZvcmUgZW5hYmxpbmcgc2FuZGJveCcpO1xuXG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRvb2xEYXRhQWZ0ZXIgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjcmVhdGVSdW5JblRlcm1pbmFsVG9vbERhdGEpO1xuXHRcdFx0Y29uc3QgcHJvcGVydGllc0FmdGVyID0gdG9vbERhdGFBZnRlci5pbnB1dFNjaGVtYT8ucHJvcGVydGllcyBhcyBSZWNvcmQ8c3RyaW5nLCBvYmplY3Q+IHwgdW5kZWZpbmVkO1xuXHRcdFx0b2socHJvcGVydGllc0FmdGVyPy5bJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiddLCAnRXhwZWN0ZWQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uIGFmdGVyIGVuYWJsaW5nIHNhbmRib3gnKTtcblx0XHRcdG9rKHRvb2xEYXRhQWZ0ZXIubW9kZWxEZXNjcmlwdGlvbj8uaW5jbHVkZXMoJ1NhbmRib3hpbmc6JyksICdFeHBlY3RlZCBzYW5kYm94IGluc3RydWN0aW9ucyBpbiBkZXNjcmlwdGlvbiBhZnRlciBlbmFibGluZyBzYW5kYm94Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc2hvdyBjb25maXJtYXRpb24gdG8gaW5zdGFsbCBtaXNzaW5nIHNhbmRib3ggZGVwZW5kZW5jaWVzIHdoZW4gcHJlcmVxIGNoZWNrIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkRlcGVuZGVuY2llcyxcblx0XHRcdFx0bWlzc2luZ0RlcGVuZGVuY2llczogWydidWJibGV3cmFwJ10sXG5cdFx0XHRcdGNhbkluc3RhbGxNaXNzaW5nRGVwZW5kZW5jaWVzOiB0cnVlLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1ByaW50IGhlbGxvJyxcblx0XHRcdFx0Z29hbDogJ1ByaW50IGhlbGxvJ1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRoZSB0b29sIHNob3VsZCByZXR1cm4gY29uZmlybWF0aW9uIG1lc3NhZ2VzIGZvciB0aGUgdXNlclxuXHRcdFx0b2socmVzdWx0LCAnRXhwZWN0ZWQgcHJlcGFyZWQgaW52b2NhdGlvbiB0byBiZSBkZWZpbmVkJyk7XG5cdFx0XHRvayhyZXN1bHQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCAnRXhwZWN0ZWQgY29uZmlybWF0aW9uTWVzc2FnZXMgd2hlbiBkZXBzIGFyZSBtaXNzaW5nJyk7XG5cdFx0XHRvayhyZXN1bHQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5jdXN0b21PcHRpb25zPy5sZW5ndGggPT09IDIsICdFeHBlY3RlZCB0d28gY3VzdG9tIG9wdGlvbnMnKTtcblx0XHRcdC8vIG1pc3NpbmdEZXBlbmRlbmNpZXMgc2hvdWxkIGJlIGluIHRvb2xTcGVjaWZpY0RhdGEgc28gaW52b2tlIGNhbiBoYW5kbGUgaXRcblx0XHRcdHN0cmljdEVxdWFsKChyZXN1bHQ/LnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB8IHVuZGVmaW5lZCk/Lm1pc3NpbmdTYW5kYm94RGVwZW5kZW5jaWVzPy5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlcXVlc3QgbWFudWFsIGluc3RhbGxhdGlvbiB3aGVuIG5vIHN1cHBvcnRlZCBwYWNrYWdlIG1hbmFnZXIgaXMgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkRlcGVuZGVuY2llcyxcblx0XHRcdFx0bWlzc2luZ0RlcGVuZGVuY2llczogWydidWJibGV3cmFwJ10sXG5cdFx0XHRcdGNhbkluc3RhbGxNaXNzaW5nRGVwZW5kZW5jaWVzOiBmYWxzZSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHByZXBhcmVkID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlVG9vbFRlc3QoeyBjb21tYW5kOiAnZWNobyBoZWxsbycgfSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKHByZXBhcmVkPy5jb25maXJtYXRpb25NZXNzYWdlcz8uY3VzdG9tT3B0aW9ucywgdW5kZWZpbmVkKTtcblx0XHRcdG9rKChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlPzogc3RyaW5nIH0pLnZhbHVlPy5pbmNsdWRlcygnc3lzdGVtIHBhY2thZ2UgbWFuYWdlcicpKTtcblx0XHRcdHN0cmljdEVxdWFsKGNyZWF0ZVRlcm1pbmFsQ2FsbENvdW50LCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhdXRvbWF0aWNhbGx5IHNjaGVkdWxlIEFwcEFybW9yIHJlbWVkaWF0aW9uIHdpdGhvdXQgYSByZXBhaXIgcHJvbXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoeyBlY2hvOiB0cnVlIH0pO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3NhbmRib3guanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5CdWJibGV3cmFwLFxuXHRcdFx0XHRyZW1lZGlhdGlvbnM6IFtUZXJtaW5hbFNhbmRib3hQcmVDaGVja1JlbWVkaWF0aW9uLkRpc2FibGVVbnByaXZpbGFnZWR1c2VybmFtZXNwYWNlUmVzdHJpY3Rpb25dLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nIH0pO1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gcmVzdWx0Py50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfCB1bmRlZmluZWQ7XG5cblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uY29uZmlybWF0aW9uTWVzc2FnZXMsIHVuZGVmaW5lZCwgJ0V4cGVjdGVkIG5vIHJlcGFpciBjb25maXJtYXRpb24nKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGF0YT8uc2FuZGJveFJlbWVkaWF0aW9ucz8ubGVuZ3RoLCAxLCAnRXhwZWN0ZWQgb25lIHJlcGFpciBvcHRpb24gaW4gdGVybWluYWwgaW52b2NhdGlvbiBkYXRhJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGE/Lm1pc3NpbmdTYW5kYm94RGVwZW5kZW5jaWVzLCB1bmRlZmluZWQsICdTaG91bGQgbm90IGNsYXNzaWZ5IHVudXNhYmxlIGJ1YmJsZXdyYXAgYXMgbWlzc2luZycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlY2hlY2sgYnViYmxld3JhcCBhZnRlciBkZXBlbmRlbmN5IGluc3RhbGxhdGlvbiBhbmQgbm90IGV4ZWN1dGUgd2hlbiBpdCByZW1haW5zIHVuYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGZvcmNlUmVmcmVzaENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0dGVybWluYWxTYW5kYm94U2VydmljZS5jaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzID0gYXN5bmMgZm9yY2VSZWZyZXNoID0+IHtcblx0XHRcdFx0aWYgKGZvcmNlUmVmcmVzaCkge1xuXHRcdFx0XHRcdGZvcmNlUmVmcmVzaENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0XHRcdGZhaWxlZENoZWNrOiBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5CdWJibGV3cmFwLFxuXHRcdFx0XHRcdFx0cmVtZWRpYXRpb25zOiBbVGVybWluYWxTYW5kYm94UHJlQ2hlY2tSZW1lZGlhdGlvbi5EaXNhYmxlVW5wcml2aWxhZ2VkdXNlcm5hbWVzcGFjZVJlc3RyaWN0aW9uXSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0XHRmYWlsZWRDaGVjazogVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suRGVwZW5kZW5jaWVzLFxuXHRcdFx0XHRcdG1pc3NpbmdEZXBlbmRlbmNpZXM6IFsnYnViYmxld3JhcCddLFxuXHRcdFx0XHRcdGNhbkluc3RhbGxNaXNzaW5nRGVwZW5kZW5jaWVzOiB0cnVlLFxuXHRcdFx0XHR9O1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlVG9vbFRlc3QoeyBjb21tYW5kOiAnZWNobyBoZWxsbycgfSwgJ2luc3RhbGwnKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoZm9yY2VSZWZyZXNoQ2FsbGVkLCB0cnVlLCAnRXhwZWN0ZWQgZGVwZW5kZW5jeSBpbnN0YWxsYXRpb24gdG8gZm9yY2UgYSBuZXcgcHJlcmVxdWlzaXRlIGNoZWNrJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjcmVhdGVUZXJtaW5hbENhbGxDb3VudCwgMSwgJ0V4cGVjdGVkIG9ubHkgdGhlIGluc3RhbGxhdGlvbiB0ZXJtaW5hbCwgbm90IG9yaWdpbmFsIGNvbW1hbmQgZXhlY3V0aW9uJyk7XG5cdFx0XHRvaygocmVzdWx0LmNvbnRlbnRbMF0gYXMgeyB2YWx1ZT86IHN0cmluZyB9KS52YWx1ZT8uaW5jbHVkZXMoJ2J1YmJsZXdyYXAnKSwgJ0V4cGVjdGVkIHJlc3VsdCB0byBpZGVudGlmeSB0aGUgZmFpbGVkIGJ1YmJsZXdyYXAgdmVyaWZpY2F0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCByZWxvYWRpbmcgYW5kIHJldHJ5aW5nIGlmIHRoZSBpc3N1ZSBwZXJzaXN0cyBhZnRlciBzYW5kYm94IGRlcGVuZGVuY3kgaW5zdGFsbGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVybWluYWxTYW5kYm94U2VydmljZS5jaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzID0gYXN5bmMgZm9yY2VSZWZyZXNoID0+IGZvcmNlUmVmcmVzaFxuXHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHRcdH1cblx0XHRcdFx0OiB7XG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0XHRmYWlsZWRDaGVjazogVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suRGVwZW5kZW5jaWVzLFxuXHRcdFx0XHRcdG1pc3NpbmdEZXBlbmRlbmNpZXM6IFsnYnViYmxld3JhcCcsICdzb2NhdCddLFxuXHRcdFx0XHRcdGNhbkluc3RhbGxNaXNzaW5nRGVwZW5kZW5jaWVzOiB0cnVlLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2VUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyB9LCAnaW5zdGFsbCcpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChjcmVhdGVUZXJtaW5hbENhbGxDb3VudCwgMSwgJ0V4cGVjdGVkIG9ubHkgdGhlIGluc3RhbGxhdGlvbiB0ZXJtaW5hbCwgbm90IG9yaWdpbmFsIGNvbW1hbmQgZXhlY3V0aW9uJyk7XG5cdFx0XHRvaygocmVzdWx0LmNvbnRlbnRbMF0gYXMgeyB2YWx1ZT86IHN0cmluZyB9KS52YWx1ZT8uaW5jbHVkZXMoJ0lmIHRoZSBpc3N1ZSBwZXJzaXN0cywgcmVsb2FkIHRoZSB3aW5kb3cgYW5kIHRyeSBydW5uaW5nIHRoZSBjb21tYW5kIGFnYWluJyksICdFeHBlY3RlZCBjb25kaXRpb25hbCByZWxvYWQgYW5kIHJldHJ5IGd1aWRhbmNlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYXV0b21hdGljYWxseSByZXBhaXIgQXBwQXJtb3IsIHByb2JlIGFnYWluLCBhbmQgZXhlY3V0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJ1bkluVGVybWluYWxUb29sLmRpc2FibGVQcm9jZXNzSWRBc3NvY2lhdGlvbigpO1xuXHRcdFx0bGV0IGZvcmNlUmVmcmVzaENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0dGVybWluYWxTYW5kYm94U2VydmljZS5jaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzID0gYXN5bmMgZm9yY2VSZWZyZXNoID0+IHtcblx0XHRcdFx0Zm9yY2VSZWZyZXNoQ2FsbGVkIHx8PSBmb3JjZVJlZnJlc2ggPT09IHRydWU7XG5cdFx0XHRcdHJldHVybiBmb3JjZVJlZnJlc2ggPyB7XG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0XHR9IDoge1xuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3NhbmRib3guanNvbicsXG5cdFx0XHRcdFx0ZmFpbGVkQ2hlY2s6IFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkJ1YmJsZXdyYXAsXG5cdFx0XHRcdFx0cmVtZWRpYXRpb25zOiBbVGVybWluYWxTYW5kYm94UHJlQ2hlY2tSZW1lZGlhdGlvbi5EaXNhYmxlVW5wcml2aWxhZ2VkdXNlcm5hbWVzcGFjZVJlc3RyaWN0aW9uXSxcblx0XHRcdFx0fTtcblx0XHRcdH07XG5cdFx0XHRsZXQgcmVtZWRpYXRpb25DYWxsZWQgPSBmYWxzZTtcblx0XHRcdHRlcm1pbmFsU2FuZGJveFNlcnZpY2UucnVuU2FuZGJveFJlbWVkaWF0aW9uID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRyZW1lZGlhdGlvbkNhbGxlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB7IGV4aXRDb2RlOiAwIH07XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2VUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyB9KTtcblx0XHRcdGNyZWF0ZWRUZXJtaW5hbEluc3RhbmNlLmRpc3Bvc2UoKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwocmVtZWRpYXRpb25DYWxsZWQsIHRydWUpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZm9yY2VSZWZyZXNoQ2FsbGVkLCB0cnVlLCAnRXhwZWN0ZWQgYSBwcm9iZSBhZnRlciBBcHBBcm1vciByZW1lZGlhdGlvbicpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY3JlYXRlVGVybWluYWxDYWxsQ291bnQsIDEsICdFeHBlY3RlZCB0aGUgb3JpZ2luYWwgY29tbWFuZCB0byBleGVjdXRlJyk7XG5cdFx0XHRvayhyZXN1bHQuY29udGVudC5sZW5ndGggPiAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXBvcnQgc2FuZGJveGluZyB1bnN1cHBvcnRlZCB3aGVuIGJ1YmJsZXdyYXAgcmVwYWlyIGV4ZWN1dGlvbiBmYWlscyBvciBpcyBpbmRldGVybWluYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3NhbmRib3guanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5CdWJibGV3cmFwLFxuXHRcdFx0XHRyZW1lZGlhdGlvbnM6IFtUZXJtaW5hbFNhbmRib3hQcmVDaGVja1JlbWVkaWF0aW9uLkRpc2FibGVVbnByaXZpbGFnZWR1c2VybmFtZXNwYWNlUmVzdHJpY3Rpb25dLFxuXHRcdFx0fTtcblxuXHRcdFx0bGV0IHByZXZpb3VzTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCBleGl0Q29kZSBvZiBbMSwgdW5kZWZpbmVkXSBhcyBjb25zdCkge1xuXHRcdFx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLnJ1blNhbmRib3hSZW1lZGlhdGlvbiA9IGFzeW5jICgpID0+ICh7IGV4aXRDb2RlIH0pO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2VUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyB9KTtcblxuXHRcdFx0XHRzdHJpY3RFcXVhbChjcmVhdGVUZXJtaW5hbENhbGxDb3VudCwgMCwgJ0V4cGVjdGVkIHRoZSBvcmlnaW5hbCBjb21tYW5kIG5vdCB0byBleGVjdXRlJyk7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSAocmVzdWx0LmNvbnRlbnRbMF0gYXMgeyB2YWx1ZT86IHN0cmluZyB9KS52YWx1ZSA/PyAnJztcblx0XHRcdFx0b2sobWVzc2FnZS5pbmNsdWRlcygnU2FuZGJveGluZyBpcyBub3Qgc3VwcG9ydGVkIGluIHRoaXMgZW52aXJvbm1lbnQnKSwgJ0V4cGVjdGVkIHVuc3VwcG9ydGVkIGVudmlyb25tZW50IGd1aWRhbmNlIGFmdGVyIHJlcGFpciBleGVjdXRpb24gZmFpbHVyZScpO1xuXHRcdFx0XHRvayhtZXNzYWdlLmluY2x1ZGVzKCdjaGF0LmFnZW50LnNhbmRib3guZW5hYmxlZCcpLCAnRXhwZWN0ZWQgZ3VpZGFuY2UgdG8gaWRlbnRpZnkgdGhlIHNhbmRib3ggc2V0dGluZycpO1xuXHRcdFx0XHRpZiAocHJldmlvdXNNZXNzYWdlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbChtZXNzYWdlLCBwcmV2aW91c01lc3NhZ2UsICdFeHBlY3RlZCB0aGUgc2FtZSBtZXNzYWdlIGlycmVzcGVjdGl2ZSBvZiB0aGUgcmVtZWRpYXRpb24gZXhpdCBjb2RlJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cHJldmlvdXNNZXNzYWdlID0gbWVzc2FnZTtcblx0XHRcdFx0b2sodHlwZW9mIHJlc3VsdC50b29sUmVzdWx0TWVzc2FnZSAhPT0gJ3N0cmluZycgJiYgcmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlPy52YWx1ZS5pbmNsdWRlcygnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncycpLCAnRXhwZWN0ZWQgYSBzZXR0aW5ncyBjb21tYW5kIGxpbmsgaW4gdGhlIHVzZXItZmFjaW5nIG1lc3NhZ2UnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZXhlY3V0ZSB3aGVuIGJ1YmJsZXdyYXAgaXMgdW51c2FibGUgYW5kIG5vIHN1cHBvcnRlZCByZW1lZGlhdGlvbiBpcyBhdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkJ1YmJsZXdyYXAsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2VUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyB9KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoY3JlYXRlVGVybWluYWxDYWxsQ291bnQsIDAsICdFeHBlY3RlZCBubyB0ZXJtaW5hbCBleGVjdXRpb24gZm9yIHVudXNhYmxlIGJ1YmJsZXdyYXAnKTtcblx0XHRcdG9rKChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlPzogc3RyaW5nIH0pLnZhbHVlPy5pbmNsdWRlcygnQnViYmxld3JhcCcpLCAnRXhwZWN0ZWQgYSBidWJibGV3cmFwIGNhcGFiaWxpdHkgZmFpbHVyZSBtZXNzYWdlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBhbGxvd2VkIGFuZCBkZW5pZWQgbmV0d29yayBkb21haW5zIGluIG1vZGVsIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0Q29uZmlnKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cywgdHJ1ZSk7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmdldFJlc29sdmVkTmV0d29ya0RvbWFpbnMgPSAoKSA9PiAoe1xuXHRcdFx0XHRhbGxvd2VkRG9tYWluczogWydnaXRodWIuY29tJywgJ25wbWpzLm9yZyddLFxuXHRcdFx0XHRkZW5pZWREb21haW5zOiBbJ2V2aWwuY29tJ10sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdG9vbERhdGEgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjcmVhdGVSdW5JblRlcm1pbmFsVG9vbERhdGEpO1xuXG5cdFx0XHRvayh0b29sRGF0YS5tb2RlbERlc2NyaXB0aW9uPy5pbmNsdWRlcygnZ2l0aHViLmNvbSwgbnBtanMub3JnJyksICdFeHBlY3RlZCBhbGxvd2VkIGRvbWFpbnMgaW4gZGVzY3JpcHRpb24nKTtcblx0XHRcdG9rKHRvb2xEYXRhLm1vZGVsRGVzY3JpcHRpb24/LmluY2x1ZGVzKCdldmlsLmNvbScpLCAnRXhwZWN0ZWQgZGVuaWVkIGRvbWFpbnMgaW4gZGVzY3JpcHRpb24nKTtcblx0XHRcdG9rKHRvb2xEYXRhLm1vZGVsRGVzY3JpcHRpb24/LmluY2x1ZGVzKCdyZXF1ZXN0QWxsb3dOZXR3b3JrPXRydWUnKSwgJ0V4cGVjdGVkIG1vZGVsIGRlc2NyaXB0aW9uIHRvIHJlY29tbWVuZCBuZXR3b3JrLWVuYWJsZWQgc2FuZGJveCBleGVjdXRpb24gZmlyc3QnKTtcblx0XHRcdG9rKHRvb2xEYXRhLm1vZGVsRGVzY3JpcHRpb24/LmluY2x1ZGVzKCdyZWFjdGl2ZWx5IGFmdGVyIGEgbmV0d29yayBmYWlsdXJlJyksICdFeHBlY3RlZCBtb2RlbCBkZXNjcmlwdGlvbiB0byBhbGxvdyByZWFjdGl2ZSBhbGxvdy1uZXR3b3JrIHJlcXVlc3RzIGFmdGVyIGEgc2FuZGJveCBuZXR3b3JrIGZhaWx1cmUnKTtcblx0XHRcdG9rKHRvb2xEYXRhLm1vZGVsRGVzY3JpcHRpb24/LmluY2x1ZGVzKCdIVFRQIGNvZGUgNDAzJyksICdFeHBlY3RlZCBtb2RlbCBkZXNjcmlwdGlvbiB0byBjb250YWluIEhUVFAgY29kZSA0MDMgYXMgZXZpZGVuY2Ugb2YgYmxvY2tlZCBuZXR3b3JrIGFjY2VzcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4Y2x1ZGUgZGVuaWVkIGRvbWFpbnMgZnJvbSBlZmZlY3RpdmUgYWxsb3dlZCBsaXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0dGVybWluYWxTYW5kYm94U2VydmljZS5nZXRSZXNvbHZlZE5ldHdvcmtEb21haW5zID0gKCkgPT4gKHtcblx0XHRcdFx0YWxsb3dlZERvbWFpbnM6IFsnZ2l0aHViLmNvbScsICdldmlsLmNvbScsICducG1qcy5vcmcnXSxcblx0XHRcdFx0ZGVuaWVkRG9tYWluczogWydldmlsLmNvbSddLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRvb2xEYXRhID0gYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oY3JlYXRlUnVuSW5UZXJtaW5hbFRvb2xEYXRhKTtcblxuXHRcdFx0b2sodG9vbERhdGEubW9kZWxEZXNjcmlwdGlvbj8uaW5jbHVkZXMoJ2dpdGh1Yi5jb20sIG5wbWpzLm9yZycpLCAnRXhwZWN0ZWQgZWZmZWN0aXZlIGFsbG93ZWQgbGlzdCB3aXRob3V0IGRlbmllZCBkb21haW4nKTtcblx0XHRcdG9rKCF0b29sRGF0YS5tb2RlbERlc2NyaXB0aW9uPy5pbmNsdWRlcygnYWNjZXNzaWJsZSBpbiB0aGUgc2FuZGJveCAoYWxsIG90aGVyIG5ldHdvcmsgYWNjZXNzIGlzIGJsb2NrZWQpOiBnaXRodWIuY29tLCBldmlsLmNvbScpLCAnRXhwZWN0ZWQgZGVuaWVkIGRvbWFpbiByZW1vdmVkIGZyb20gYWxsb3dlZCBsaXN0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIHNhbmRib3ggbGFiZWxzIHdoZW4gY29tbWFuZCBpcyBzYW5kYm94IHdyYXBwZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvdnNjb2RlLXNhbmRib3gtc2V0dGluZ3MuanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0dGVybWluYWxTYW5kYm94U2VydmljZS53cmFwQ29tbWFuZCA9IGFzeW5jIChjb21tYW5kOiBzdHJpbmcpID0+ICh7XG5cdFx0XHRcdGNvbW1hbmQ6IGBzYW5kYm94LXJ1bnRpbWUgJHtjb21tYW5kfWAsXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcHJlcGFyZWRJbnZvY2F0aW9uID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nIH0pO1xuXG5cdFx0XHRvayhwcmVwYXJlZEludm9jYXRpb24sICdFeHBlY3RlZCBwcmVwYXJlZCBpbnZvY2F0aW9uIHRvIGJlIGRlZmluZWQnKTtcblx0XHRcdHN0cmljdEVxdWFsKChwcmVwYXJlZEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UgYXMgSU1hcmtkb3duU3RyaW5nKS52YWx1ZSwgJ1J1bm5pbmcgYGVjaG8gaGVsbG9gIGluIHNhbmRib3gnKTtcblxuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gcHJlcGFyZWRJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS5pc1NhbmRib3hXcmFwcGVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBlbmFibGUgc2FuZGJveGluZyB3aGVuIGNoYXQgcGVybWlzc2lvbiBsZXZlbCBpcyBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3ZzY29kZS1zYW5kYm94LXNldHRpbmdzLmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignc2FuZGJveC1kZWZhdWx0LXBlcm1pc3Npb24tc2Vzc2lvbicpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHtcblx0XHRcdFx0Z2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2U6ICgoKSA9PiAoeyBpbnB1dDogeyBjdXJyZW50TW9kZUluZm86IHsgcGVybWlzc2lvbkxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQgfSB9IH0pKSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0U2VydmljZVsnZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UnXSxcblx0XHRcdFx0bGFzdEZvY3VzZWRXaWRnZXQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZGVmYXVsdFBlcm1pc3Npb25Ub29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RSdW5JblRlcm1pbmFsVG9vbCkpO1xuXG5cdFx0XHRjb25zdCBwcmVwYXJlZEludm9jYXRpb24gPSBhd2FpdCBkZWZhdWx0UGVybWlzc2lvblRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0XHRleHBsYW5hdGlvbjogJ1ByaW50IGhlbGxvJyxcblx0XHRcdFx0XHRnb2FsOiAnUHJpbnQgaGVsbG8nLFxuXHRcdFx0XHRcdG1vZGU6ICdzeW5jJyxcblx0XHRcdFx0fSBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR9IGFzIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHByZXBhcmVkSW52b2NhdGlvbiEudG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLmlzU2FuZGJveFdyYXBwZWQsIHRydWUpO1xuXHRcdFx0c3RyaWN0RXF1YWwoKHByZXBhcmVkSW52b2NhdGlvbiEuaW52b2NhdGlvbk1lc3NhZ2UgYXMgSU1hcmtkb3duU3RyaW5nKS52YWx1ZSwgJ1J1bm5pbmcgYGVjaG8gaGVsbG9gIGluIHNhbmRib3gnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkaXNhYmxlIHNhbmRib3hpbmcgd2hlbiBjaGF0IHBlcm1pc3Npb24gbGV2ZWwgaXMgZWxldmF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvdnNjb2RlLXNhbmRib3gtc2V0dGluZ3MuanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBvcmlnaW5hbFdyYXBDb21tYW5kID0gdGVybWluYWxTYW5kYm94U2VydmljZS53cmFwQ29tbWFuZC5iaW5kKHRlcm1pbmFsU2FuZGJveFNlcnZpY2UpO1xuXHRcdFx0Zm9yIChjb25zdCBwZXJtaXNzaW9uTGV2ZWwgb2YgW0NoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUsIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90XSkge1xuXHRcdFx0XHRsZXQgd3JhcENhbGxzID0gMDtcblx0XHRcdFx0dGVybWluYWxTYW5kYm94U2VydmljZS53cmFwQ29tbWFuZCA9IGFzeW5jICguLi5hcmdzKSA9PiB7XG5cdFx0XHRcdFx0d3JhcENhbGxzKys7XG5cdFx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsV3JhcENvbW1hbmQoLi4uYXJncyk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKGBzYW5kYm94LSR7cGVybWlzc2lvbkxldmVsfS1wZXJtaXNzaW9uLXNlc3Npb25gKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHtcblx0XHRcdFx0XHRnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZTogKCgpID0+ICh7IGlucHV0OiB7IGN1cnJlbnRNb2RlSW5mbzogeyBwZXJtaXNzaW9uTGV2ZWwgfSB9IH0pKSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0U2VydmljZVsnZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UnXSxcblx0XHRcdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgZWxldmF0ZWRQZXJtaXNzaW9uVG9vbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UnVuSW5UZXJtaW5hbFRvb2wpKTtcblxuXHRcdFx0XHRjb25zdCBwcmVwYXJlZEludm9jYXRpb24gPSBhd2FpdCBlbGV2YXRlZFBlcm1pc3Npb25Ub29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRcdFx0ZXhwbGFuYXRpb246ICdQcmludCBoZWxsbycsXG5cdFx0XHRcdFx0XHRnb2FsOiAnUHJpbnQgaGVsbG8nLFxuXHRcdFx0XHRcdFx0bW9kZTogJ3N5bmMnLFxuXHRcdFx0XHRcdH0gYXMgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcyxcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdH0gYXMgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSBwcmVwYXJlZEludm9jYXRpb24hLnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblx0XHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLmlzU2FuZGJveFdyYXBwZWQsIGZhbHNlLCBgRXhwZWN0ZWQgbm8gc2FuZGJveCB3cmFwcGluZyBmb3IgJHtwZXJtaXNzaW9uTGV2ZWx9YCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGF0YS5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24sIGZhbHNlLCBgRXhwZWN0ZWQgbm8gdW5zYW5kYm94IGNvbmZpcm1hdGlvbiBmb3IgJHtwZXJtaXNzaW9uTGV2ZWx9YCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKChwcmVwYXJlZEludm9jYXRpb24hLmludm9jYXRpb25NZXNzYWdlIGFzIElNYXJrZG93blN0cmluZykudmFsdWUsICdSdW5uaW5nIGBlY2hvIGhlbGxvYCcpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbCh3cmFwQ2FsbHMsIDAsIGBFeHBlY3RlZCBzYW5kYm94IHdyYXBwaW5nIHRvIGJlIHNraXBwZWQgZm9yICR7cGVybWlzc2lvbkxldmVsfWApO1xuXHRcdFx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLndyYXBDb21tYW5kID0gb3JpZ2luYWxXcmFwQ29tbWFuZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgcmVxdWVzdCBwZXJtaXNzaW9uIGxldmVsIGJlZm9yZSBjdXJyZW50IHdpZGdldCBwZXJtaXNzaW9uIGxldmVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3ZzY29kZS1zYW5kYm94LXNldHRpbmdzLmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdzYW5kYm94LXJlcXVlc3QtcGVybWlzc2lvbi1zZXNzaW9uJyk7XG5cdFx0XHRjb25zdCByZXF1ZXN0SWQgPSAnc2FuZGJveC1yZXF1ZXN0LXBlcm1pc3Npb24tcmVxdWVzdCc7XG5cdFx0XHRjcmVhdGVDaGF0TW9kZWxXaXRoUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsIGNyZWF0ZUNoYXRNb2RlSW5mbyhDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlKSwgcmVxdWVzdElkKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCB7XG5cdFx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlOiAoKCkgPT4gKHsgaW5wdXQ6IHsgY3VycmVudE1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0IH0gfSB9KSkgYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldFNlcnZpY2VbJ2dldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlJ10sXG5cdFx0XHRcdGxhc3RGb2N1c2VkV2lkZ2V0OiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlcXVlc3RQZXJtaXNzaW9uVG9vbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UnVuSW5UZXJtaW5hbFRvb2wpKTtcblxuXHRcdFx0Y29uc3QgcHJlcGFyZWRJbnZvY2F0aW9uID0gYXdhaXQgcmVxdWVzdFBlcm1pc3Npb25Ub29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHtcblx0XHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0ZXhwbGFuYXRpb246ICdQcmludCBoZWxsbycsXG5cdFx0XHRcdFx0Z29hbDogJ1ByaW50IGhlbGxvJyxcblx0XHRcdFx0XHRtb2RlOiAnc3luYycsXG5cdFx0XHRcdH0gYXMgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRjaGF0UmVxdWVzdElkOiByZXF1ZXN0SWQsXG5cdFx0XHR9IGFzIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHByZXBhcmVkSW52b2NhdGlvbiEudG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLmlzU2FuZGJveFdyYXBwZWQsIGZhbHNlKTtcblx0XHRcdHN0cmljdEVxdWFsKChwcmVwYXJlZEludm9jYXRpb24hLmludm9jYXRpb25NZXNzYWdlIGFzIElNYXJrZG93blN0cmluZykudmFsdWUsICdSdW5uaW5nIGBlY2hvIGhlbGxvYCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBzaG93IHNhbmRib3ggd3JhcHBlciBpbiBjaGF0IHdoZW4gc2FuZGJveGVkIGFzeW5jIGNvbW1hbmQgaXMgZGV0YWNoZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRydW5JblRlcm1pbmFsVG9vbC5zZXRCYWNrZW5kT3MoT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHNldENvbmZpZyhUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkRldGFjaEJhY2tncm91bmRQcm9jZXNzZXMsIHRydWUpO1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3ZzY29kZS1zYW5kYm94LXNldHRpbmdzLmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdHRlcm1pbmFsU2FuZGJveFNlcnZpY2Uud3JhcENvbW1hbmQgPSBhc3luYyAoY29tbWFuZDogc3RyaW5nKSA9PiAoe1xuXHRcdFx0XHRjb21tYW5kOiBgc2FuZGJveC1ydW50aW1lICR7Y29tbWFuZH1gLFxuXHRcdFx0XHRpc1NhbmRib3hXcmFwcGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHByZXBhcmVkSW52b2NhdGlvbiA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJywgbW9kZTogJ2FzeW5jJyB9KTtcblxuXHRcdFx0b2socHJlcGFyZWRJbnZvY2F0aW9uLCAnRXhwZWN0ZWQgcHJlcGFyZWQgaW52b2NhdGlvbiB0byBiZSBkZWZpbmVkJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCgocHJlcGFyZWRJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlIGFzIElNYXJrZG93blN0cmluZykudmFsdWUsICdSdW5uaW5nIGBlY2hvIGhlbGxvYCBpbiBzYW5kYm94Jyk7XG5cblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHByZXBhcmVkSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUuZm9yRGlzcGxheSwgJ2VjaG8gaGVsbG8nKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS50b29sRWRpdGVkLCAnbm9odXAgc2FuZGJveC1ydW50aW1lIGVjaG8gaGVsbG8gJiBkaXNvd24nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2F1dG9tYXRpYyBzYW5kYm94IHJldHJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VSZXRyeU9wdGlvbnMgPSB7XG5cdFx0XHRhbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHM6IHRydWUsXG5cdFx0XHRkaWRTYW5kYm94V3JhcENvbW1hbmQ6IHRydWUsXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IGZhbHNlLFxuXHRcdFx0aXNQZXJzaXN0ZW50U2Vzc2lvbjogZmFsc2UsXG5cdFx0XHRpc0JhY2tncm91bmRFeGVjdXRpb246IGZhbHNlLFxuXHRcdFx0ZGlkVGltZW91dDogZmFsc2UsXG5cdFx0XHRleGl0Q29kZTogMSxcblx0XHRcdG91dHB1dDogJy9iaW4vYmFzaDogL3dvcmtzcGFjZS9vdXQudHh0OiBPcGVyYXRpb24gbm90IHBlcm1pdHRlZCcsXG5cdFx0fTtcblx0XHRjb25zdCBiYXNlQWxsb3dOZXR3b3JrUmV0cnlPcHRpb25zID0ge1xuXHRcdFx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRkaWRTYW5kYm94V3JhcENvbW1hbmQ6IHRydWUsXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IGZhbHNlLFxuXHRcdFx0cmVxdWVzdEFsbG93TmV0d29yazogZmFsc2UsXG5cdFx0XHRpc1BlcnNpc3RlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdGlzQmFja2dyb3VuZEV4ZWN1dGlvbjogZmFsc2UsXG5cdFx0XHRkaWRUaW1lb3V0OiBmYWxzZSxcblx0XHRcdGV4aXRDb2RlOiAxLFxuXHRcdFx0b3V0cHV0OiAnY29ubmVjdDogT3BlcmF0aW9uIG5vdCBwZXJtaXR0ZWQnLFxuXHRcdH07XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0cnkgY29tcGxldGVkIGZvcmVncm91bmQgc2FuZGJveCBjb21tYW5kcyB3aGVuIG91dHB1dCBpbmRpY2F0ZXMgc2FuZGJveCBibG9jaycsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZEF1dG9tYXRpY2FsbHlSZXRyeVVuc2FuZGJveGVkKGJhc2VSZXRyeU9wdGlvbnMpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZXRlY3QgYnViYmxld3JhcCBob3N0IHJlc3RyaWN0aW9ucyBhY3Jvc3Mgd3JhcHBlZCBvdXRwdXQgbGluZXMnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChvdXRwdXRMb29rc0J1YmJsZXdyYXBIb3N0UmVzdHJpY3RlZCgnYndyYXA6IE5vIHBlcm1pc3Npb25zIHRvIGNyZWF0ZSBuZXdcXG5uYW1lc3BhY2UnKSwgdHJ1ZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChvdXRwdXRMb29rc0J1YmJsZXdyYXBIb3N0UmVzdHJpY3RlZCgnYndyYXA6IGZhaWxlZCB0byBiaW5kIG1vdW50JyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkaXJlY3QgdGhlIHVzZXIgdG8gZGlzYWJsZSBzYW5kYm94aW5nIHdoZW4gYnViYmxld3JhcCBpcyByZXN0cmljdGVkIGJ5IHRoZSBob3N0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcnVuSW5UZXJtaW5hbFRvb2wuZ2V0QnViYmxld3JhcEhvc3RSZXN0cmljdGVkUmVzdWx0KCk7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gKHJlc3VsdC5jb250ZW50WzBdIGFzIHsgdmFsdWU/OiBzdHJpbmcgfSkudmFsdWU7XG5cblx0XHRcdG9rKG1lc3NhZ2U/LmluY2x1ZGVzKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkKSk7XG5cdFx0XHRvayhtZXNzYWdlPy5pbmNsdWRlcygnU2FuZGJveGluZyBjYW4gYmUgZGlzYWJsZWQgYnkgc2V0dGluZycpKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdC50b29sUmVzdWx0TWVzc2FnZSwgbWVzc2FnZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJldHJ5IHdoZW4gdW5zYW5kYm94ZWQgY29tbWFuZHMgYXJlIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoc2hvdWxkQXV0b21hdGljYWxseVJldHJ5VW5zYW5kYm94ZWQoe1xuXHRcdFx0XHQuLi5iYXNlUmV0cnlPcHRpb25zLFxuXHRcdFx0XHRhbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHM6IGZhbHNlLFxuXHRcdFx0fSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcmV0cnkgd2hlbiB0aGUgY29tbWFuZCBpcyBhbHJlYWR5IHVuc2FuZGJveGVkJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoc2hvdWxkQXV0b21hdGljYWxseVJldHJ5VW5zYW5kYm94ZWQoe1xuXHRcdFx0XHQuLi5iYXNlUmV0cnlPcHRpb25zLFxuXHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHRydWUsXG5cdFx0XHR9KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBhdXRvbWF0aWNhbGx5IHJldHJ5IG91dHNpZGUgdGhlIHNhbmRib3ggZm9yIGFwcGFyZW50IG5ldHdvcmsgZmFpbHVyZXMnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlVbnNhbmRib3hlZCh7XG5cdFx0XHRcdC4uLmJhc2VSZXRyeU9wdGlvbnMsXG5cdFx0XHRcdG91dHB1dDogJ2Nvbm5lY3Q6IE9wZXJhdGlvbiBub3QgcGVybWl0dGVkJyxcblx0XHRcdH0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0cnkgaW4gdGhlIHNhbmRib3ggYnkgYWxsb3dpbmcgbmV0d29yayBmb3IgYXBwYXJlbnQgbmV0d29yayBmYWlsdXJlcycsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZEF1dG9tYXRpY2FsbHlSZXRyeUFsbG93TmV0d29ya0luU2FuZGJveGVkKGJhc2VBbGxvd05ldHdvcmtSZXRyeU9wdGlvbnMpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcmV0cnkgd2l0aCBhbGxvdy1uZXR3b3JrIHdoZW4gZGlzYWJsZWQgb3IgYWxyZWFkeSByZXF1ZXN0ZWQnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlBbGxvd05ldHdvcmtJblNhbmRib3hlZCh7XG5cdFx0XHRcdC4uLmJhc2VBbGxvd05ldHdvcmtSZXRyeU9wdGlvbnMsXG5cdFx0XHRcdHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiBmYWxzZSxcblx0XHRcdH0pLCBmYWxzZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlBbGxvd05ldHdvcmtJblNhbmRib3hlZCh7XG5cdFx0XHRcdC4uLmJhc2VBbGxvd05ldHdvcmtSZXRyeU9wdGlvbnMsXG5cdFx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcms6IHRydWUsXG5cdFx0XHR9KSwgZmFsc2UpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc2hvdWxkQXV0b21hdGljYWxseVJldHJ5QWxsb3dOZXR3b3JrSW5TYW5kYm94ZWQoe1xuXHRcdFx0XHQuLi5iYXNlQWxsb3dOZXR3b3JrUmV0cnlPcHRpb25zLFxuXHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHRydWUsXG5cdFx0XHR9KSwgZmFsc2UpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc2hvdWxkQXV0b21hdGljYWxseVJldHJ5QWxsb3dOZXR3b3JrSW5TYW5kYm94ZWQoe1xuXHRcdFx0XHQuLi5iYXNlQWxsb3dOZXR3b3JrUmV0cnlPcHRpb25zLFxuXHRcdFx0XHRvdXRwdXQ6ICdyZWd1bGFyIGNvbW1hbmQgZmFpbHVyZScsXG5cdFx0XHR9KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCByZXRyeSBiYWNrZ3JvdW5kLCB0aW1lZC1vdXQsIHN1Y2Nlc3NmdWwsIG9yIG5vbi1zYW5kYm94LWJsb2NrZWQgcmVzdWx0cycsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZEF1dG9tYXRpY2FsbHlSZXRyeVVuc2FuZGJveGVkKHtcblx0XHRcdFx0Li4uYmFzZVJldHJ5T3B0aW9ucyxcblx0XHRcdFx0aXNCYWNrZ3JvdW5kRXhlY3V0aW9uOiB0cnVlLFxuXHRcdFx0fSksIGZhbHNlKTtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZEF1dG9tYXRpY2FsbHlSZXRyeVVuc2FuZGJveGVkKHtcblx0XHRcdFx0Li4uYmFzZVJldHJ5T3B0aW9ucyxcblx0XHRcdFx0ZGlkVGltZW91dDogdHJ1ZSxcblx0XHRcdH0pLCBmYWxzZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlVbnNhbmRib3hlZCh7XG5cdFx0XHRcdC4uLmJhc2VSZXRyeU9wdGlvbnMsXG5cdFx0XHRcdGV4aXRDb2RlOiAwLFxuXHRcdFx0fSksIGZhbHNlKTtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZEF1dG9tYXRpY2FsbHlSZXRyeVVuc2FuZGJveGVkKHtcblx0XHRcdFx0Li4uYmFzZVJldHJ5T3B0aW9ucyxcblx0XHRcdFx0b3V0cHV0OiAncmVndWxhciBjb21tYW5kIGZhaWx1cmUnLFxuXHRcdFx0fSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzaG93IHJldHJ5IGVsaWNpdGF0aW9uIHdoZW4gcHJlcGFyZWQgaW52b2NhdGlvbiB3YXMgYXV0by1hcHByb3ZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHsgZWNobzogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignYXV0by1yZXRyeS1hdXRvLWFwcHJvdmVkLXNlc3Npb24nKTtcblxuXHRcdFx0Y29uc3QgcHJlcGFyZWRJbnZvY2F0aW9uID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nIH0pO1xuXHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKHByZXBhcmVkSW52b2NhdGlvbik7XG5cblx0XHRcdGF3YWl0IGFzc2VydEF1dG9tYXRpY1Vuc2FuZGJveFJldHJ5RWxpY2l0YXRpb24ocnVuSW5UZXJtaW5hbFRvb2wsIHNlc3Npb25SZXNvdXJjZSwgJ2VjaG8gaGVsbG8nLCAnYmFzaCcsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYXV0by1yZXRyeSB3aXRob3V0IGVsaWNpdGF0aW9uIHdoZW4gc2Vzc2lvbiBpcyBpbiBhdXRvLWFwcHJvdmUgcGVybWlzc2lvbiBsZXZlbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignYXV0by1yZXRyeS1hcHByb3ZhbC1zZXNzaW9uJyk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwge1xuXHRcdFx0XHRnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZTogKCgpID0+ICh7IGlucHV0OiB7IGN1cnJlbnRNb2RlSW5mbzogeyBwZXJtaXNzaW9uTGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUgfSB9IH0pKSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0U2VydmljZVsnZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UnXSxcblx0XHRcdFx0bGFzdEZvY3VzZWRXaWRnZXQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgYXV0b0FwcHJvdmVSdW5JblRlcm1pbmFsVG9vbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UnVuSW5UZXJtaW5hbFRvb2wpKTtcblx0XHRcdGNvbnN0IHByZXBhcmVkSW52b2NhdGlvbiA9IGF3YWl0IGF1dG9BcHByb3ZlUnVuSW5UZXJtaW5hbFRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdybSBkYW5nZXJvdXMtZmlsZS50eHQnLFxuXHRcdFx0XHRcdGV4cGxhbmF0aW9uOiAnUmVtb3ZlIGEgZmlsZScsXG5cdFx0XHRcdFx0Z29hbDogJ1JlbW92ZSBhIGZpbGUnLFxuXHRcdFx0XHRcdG1vZGU6ICdzeW5jJyxcblx0XHRcdFx0XHR0aW1lb3V0OiAzMDAwMCxcblx0XHRcdFx0fSBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR9IGFzIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChwcmVwYXJlZEludm9jYXRpb24pO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZUNoYXRNb2RlbFdpdGhSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBzaG91bGRSZXRyeSA9IGF3YWl0IGNvbmZpcm1BdXRvbWF0aWNVbnNhbmRib3hSZXRyeShhdXRvQXBwcm92ZVJ1bkluVGVybWluYWxUb29sLCBzZXNzaW9uUmVzb3VyY2UsICdybSBkYW5nZXJvdXMtZmlsZS50eHQnLCAnYmFzaCcsIHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRSZXRyeSwgdHJ1ZSwgJ0V4cGVjdGVkIGF1dG8tYXBwcm92ZSBzZXNzaW9uIHRvIHJldHJ5IHdpdGhvdXQgcHJvbXB0aW5nJyk7XG5cdFx0XHRjb25zdCBlbGljaXRhdGlvbiA9IG1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpPy5yZXNwb25zZT8ucmVzcG9uc2UudmFsdWUuZmluZChwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ2VsaWNpdGF0aW9uMicpO1xuXHRcdFx0b2soIWVsaWNpdGF0aW9uLCAnRXhwZWN0ZWQgbm8gZWxpY2l0YXRpb24gaW4gYXV0by1hcHByb3ZlIHNlc3Npb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzaG93IHJldHJ5IGVsaWNpdGF0aW9uIHdoZW4gcHJlcGFyZWQgaW52b2NhdGlvbiByZXF1aXJlZCBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7fSk7XG5cblx0XHRcdGNvbnN0IHByZXBhcmVkSW52b2NhdGlvbiA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdybSBkYW5nZXJvdXMtZmlsZS50eHQnIH0pO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocHJlcGFyZWRJbnZvY2F0aW9uKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0QXV0b21hdGljVW5zYW5kYm94UmV0cnlFbGljaXRhdGlvbihydW5JblRlcm1pbmFsVG9vbCwgTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdhdXRvLXJldHJ5LWNvbmZpcm1hdGlvbi1yZXF1aXJlZC1zZXNzaW9uJyksICdybSBkYW5nZXJvdXMtZmlsZS50eHQnLCAnYmFzaCcsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIHJldHJ5IGNvbmZpcm1hdGlvbiB0aXRsZSB3aXRob3V0IHNhbmRib3ggbGluaycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRpdGxlID0gZ2V0QXV0b21hdGljVW5zYW5kYm94UmV0cnlUaXRsZShydW5JblRlcm1pbmFsVG9vbCwgJ2Jhc2gnLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbCh0aXRsZS52YWx1ZSwgJ1J1biBgYmFzaGAgY29tbWFuZCBvdXRzaWRlIHRoZSBzYW5kYm94PycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSByZXRyeSBjb25maXJtYXRpb24gdGl0bGUgd2l0aG91dCBzYW5kYm94IGxpbmsgZm9yIGJsb2NrZWQgZG9tYWlucycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRpdGxlID0gZ2V0QXV0b21hdGljVW5zYW5kYm94UmV0cnlUaXRsZShydW5JblRlcm1pbmFsVG9vbCwgJ2Jhc2gnLCBbJ2V4YW1wbGUuY29tJ10pO1xuXG5cdFx0XHRzdHJpY3RFcXVhbCh0aXRsZS52YWx1ZSwgJ1J1biBgYmFzaGAgY29tbWFuZCBvdXRzaWRlIHRoZSBzYW5kYm94IHRvIGFjY2VzcyBgZXhhbXBsZS5jb21gPycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBhbGxvdy1uZXR3b3JrIHJldHJ5IGNvbmZpcm1hdGlvbiB0aXRsZSB3aXRob3V0IHNhbmRib3ggbGluaycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRpdGxlID0gZ2V0QXV0b21hdGljQWxsb3dOZXR3b3JrUmV0cnlUaXRsZShydW5JblRlcm1pbmFsVG9vbCwgJ2Jhc2gnLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbCh0aXRsZS52YWx1ZSwgJ1JldHJ5IGBiYXNoYCBjb21tYW5kIGluIHRoZSBzYW5kYm94IGJ5IGFsbG93aW5nIG5ldHdvcmsgYWNjZXNzPycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBhbGxvdy1uZXR3b3JrIHJldHJ5IGNvbmZpcm1hdGlvbiB0aXRsZSB3aXRob3V0IHNhbmRib3ggbGluayBmb3IgYmxvY2tlZCBkb21haW5zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBnZXRBdXRvbWF0aWNBbGxvd05ldHdvcmtSZXRyeVRpdGxlKHJ1bkluVGVybWluYWxUb29sLCAnYmFzaCcsIFsnZXhhbXBsZS5jb20nXSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKHRpdGxlLnZhbHVlLCAnUmV0cnkgYGJhc2hgIGNvbW1hbmQgaW4gdGhlIHNhbmRib3ggYnkgYWxsb3dpbmcgbmV0d29yayBhY2Nlc3MgdG8gYGV4YW1wbGUuY29tYD8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzaG93IGFsbG93LW5ldHdvcmsgcmV0cnkgZWxpY2l0YXRpb24gd2l0aCBzYW5kYm94LXByZXNlcnZpbmcgdGl0bGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBhc3NlcnRBdXRvbWF0aWNBbGxvd05ldHdvcmtSZXRyeUVsaWNpdGF0aW9uKFxuXHRcdFx0XHRydW5JblRlcm1pbmFsVG9vbCxcblx0XHRcdFx0TG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdhdXRvLXJldHJ5LWFsbG93LW5ldHdvcmstc2Vzc2lvbicpLFxuXHRcdFx0XHQnY3VybCBodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0J2Jhc2gnLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCdSZXRyeSBgYmFzaGAgY29tbWFuZCBpbiB0aGUgc2FuZGJveCBieSBhbGxvd2luZyBuZXR3b3JrIGFjY2Vzcz8nXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNob3cgcmV0cnkgZWxpY2l0YXRpb24gd2hlbiBzYW5kYm94IGZvcmNlLWFwcHJvdmVkIGNvbW1hbmQgd291bGQgb3RoZXJ3aXNlIHJlcXVpcmUgY29uZmlybWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe30pO1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3ZzY29kZS1zYW5kYm94LXNldHRpbmdzLmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcHJlcGFyZWRJbnZvY2F0aW9uID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ3JtIGRhbmdlcm91cy1maWxlLnR4dCcgfSk7XG5cblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChwcmVwYXJlZEludm9jYXRpb24pO1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gcHJlcGFyZWRJbnZvY2F0aW9uIS50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUuaXNTYW5kYm94V3JhcHBlZCwgdHJ1ZSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydEF1dG9tYXRpY1Vuc2FuZGJveFJldHJ5RWxpY2l0YXRpb24ocnVuSW5UZXJtaW5hbFRvb2wsIExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignYXV0by1yZXRyeS1zYW5kYm94LWZvcmNlLWFwcHJvdmVkLXNlc3Npb24nKSwgJ3JtIGRhbmdlcm91cy1maWxlLnR4dCcsICdiYXNoJywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHR9KTtcblxuXHRzdWl0ZSgnZGVmYXVsdCBhdXRvLWFwcHJvdmUgcnVsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGVmYXVsdHMgPSB0ZXJtaW5hbENoYXRBZ2VudFRvb2xzQ29uZmlndXJhdGlvbltUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlXS5kZWZhdWx0IGFzIFJlY29yZDxzdHJpbmcsIGJvb2xlYW4gfCB7IGFwcHJvdmU6IGJvb2xlYW47IG1hdGNoQ29tbWFuZExpbmU/OiBib29sZWFuIH0+O1xuXG5cdFx0c3VpdGVTZXR1cCgoKSA9PiB7XG5cdFx0XHQvLyBTYW5pdHkgY2hlY2sgb24gZW50cmllcyB0byBtYWtlIHN1cmUgdGhhdCB0aGUgZGVmYXVsdHMgYXJlIGFjdHVhbGx5IHB1bGxlZCBpblxuXHRcdFx0b2soT2JqZWN0LmtleXMoZGVmYXVsdHMpLmxlbmd0aCA+IDUwKTtcblx0XHR9KTtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZShkZWZhdWx0cyk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhdXRvQXBwcm92ZWRUZXN0Q2FzZXMgPSBbXG5cdFx0XHQvLyBTYWZlIGNvbW1hbmRzXG5cdFx0XHQnZWNobyBhYmMnLFxuXHRcdFx0J2VjaG8gXCJhYmNcIicsXG5cdFx0XHQnZWNobyBcXCdhYmNcXCcnLFxuXHRcdFx0J2xzIC1sYScsXG5cdFx0XHQnZGlyJyxcblx0XHRcdCdwd2QnLFxuXHRcdFx0J2NhdCBmaWxlLnR4dCcsXG5cdFx0XHQnaGVhZCAtbiAxMCBmaWxlLnR4dCcsXG5cdFx0XHQndGFpbCAtZiBsb2cudHh0Jyxcblx0XHRcdCdmaW5kc3RyIHBhdHRlcm4gZmlsZS50eHQnLFxuXHRcdFx0J3djIC1sIGZpbGUudHh0Jyxcblx0XHRcdCd0ciBhLXogQS1aJyxcblx0XHRcdCdjdXQgLWQ6IC1mMScsXG5cdFx0XHQnY21wIGZpbGUxIGZpbGUyJyxcblx0XHRcdCd3aGljaCBub2RlJyxcblx0XHRcdCdiYXNlbmFtZSAvcGF0aC90by9maWxlJyxcblx0XHRcdCdkaXJuYW1lIC9wYXRoL3RvL2ZpbGUnLFxuXHRcdFx0J3JlYWxwYXRoIC4nLFxuXHRcdFx0J3JlYWRsaW5rIHN5bWxpbmsnLFxuXHRcdFx0J3N0YXQgZmlsZS50eHQnLFxuXHRcdFx0J2ZpbGUgZG9jdW1lbnQucGRmJyxcblx0XHRcdCdkdSAtc2ggZm9sZGVyJyxcblx0XHRcdCdkZiAtaCcsXG5cdFx0XHQnc2xlZXAgNScsXG5cdFx0XHQnY2QgL2hvbWUvdXNlcicsXG5cdFx0XHQnbmwgLWJhIHBhdGgvdG8vZmlsZS50eHQnLFxuXG5cdFx0XHQvLyBTYWZlIGdpdCBzdWItY29tbWFuZHNcblx0XHRcdCdnaXQgc3RhdHVzJyxcblx0XHRcdCdnaXQgbG9nIC0tb25lbGluZScsXG5cdFx0XHQnZ2l0IHNob3cgSEVBRCcsXG5cdFx0XHQnZ2l0IGRpZmYgbWFpbicsXG5cdFx0XHQnZ2l0IGdyZXAgXCJUT0RPXCInLFxuXG5cdFx0XHQvLyBQb3dlclNoZWxsIGNvbW1hbmRzXG5cdFx0XHQnR2V0LUNoaWxkSXRlbScsXG5cdFx0XHQnR2V0LURhdGUnLFxuXHRcdFx0J0dldC1SYW5kb20nLFxuXHRcdFx0J0dldC1Mb2NhdGlvbicsXG5cdFx0XHQnU2V0LUxvY2F0aW9uIEM6XFxcXFVzZXJzXFxcXHRlc3QnLFxuXHRcdFx0J1dyaXRlLUhvc3QgXCJIZWxsb1wiJyxcblx0XHRcdCdXcml0ZS1PdXRwdXQgXCJUZXN0XCInLFxuXHRcdFx0J091dC1TdHJpbmcnLFxuXHRcdFx0J1NwbGl0LVBhdGggQzpcXFxcVXNlcnNcXFxcdGVzdCcsXG5cdFx0XHQnSm9pbi1QYXRoIEM6XFxcXFVzZXJzIHRlc3QnLFxuXHRcdFx0J1N0YXJ0LVNsZWVwIDInLFxuXG5cdFx0XHQvLyBQb3dlclNoZWxsIHNhZmUgdmVyYnMgKHJlZ2V4IHBhdHRlcm5zKVxuXHRcdFx0J1NlbGVjdC1PYmplY3QgTmFtZScsXG5cdFx0XHQnTWVhc3VyZS1PYmplY3QgTGVuZ3RoJyxcblx0XHRcdCdDb21wYXJlLU9iamVjdCAkYSAkYicsXG5cdFx0XHQnRm9ybWF0LVRhYmxlJyxcblx0XHRcdCdTb3J0LU9iamVjdCBOYW1lJyxcblxuXHRcdFx0Ly8gQ29tbWFuZHMgd2l0aCBhY2NlcHRhYmxlIGFyZ3VtZW50c1xuXHRcdFx0J2NvbHVtbiBkYXRhLnR4dCcsXG5cdFx0XHQnZGF0ZSArJVktJW0tJWQnLFxuXHRcdFx0J2ZpbmQgLiAtbmFtZSBcIioudHh0XCInLFxuXHRcdFx0J2dyZXAgcGF0dGVybiBmaWxlLnR4dCcsXG5cdFx0XHQncmcgcGF0dGVybiBmaWxlLnR4dCcsXG5cdFx0XHQncmcgLS1qc29uIHBhdHRlcm4gLicsXG5cdFx0XHQncmcgLWkgLS1jb2xvcj1uZXZlciBcIlRPRE9cIiBzcmMvJyxcblx0XHRcdCdzZWQgXCJzL2Zvby9iYXIvZ1wiJyxcblx0XHRcdCdzZWQgLW4gXCIxLDEwcFwiIGZpbGUudHh0Jyxcblx0XHRcdCdzZWQgLW4gXFwnNDUsODBwXFwnIC9mb28vYmFyL0V4YW1wbGUuamF2YScsXG5cdFx0XHQnc2VkIC1uIFxcJzQ1LDgwcFxcJyBleHRlbnNpb25zL21hcmtkb3duLWxhbmd1YWdlLWZlYXR1cmVzL3NyYy90ZXN0L2NvcHlGaWxlLnRlc3QudHMnLFxuXHRcdFx0J3NvcnQgZmlsZS50eHQnLFxuXHRcdFx0J3RyZWUgZGlyZWN0b3J5JyxcblxuXHRcdFx0Ly8gb2Rcblx0XHRcdCdvZCBzb21lZmlsZScsXG5cdFx0XHQnb2QgLUEgeCBzb21lZmlsZScsXG5cblx0XHRcdC8vIHh4ZFxuXHRcdFx0J3h4ZCcsXG5cdFx0XHQneHhkIHNvbWVmaWxlJyxcblx0XHRcdCd4eGQgLWwxMDAgc29tZWZpbGUnLFxuXHRcdFx0J3h4ZCAtciBzb21lZmlsZScsXG5cdFx0XHQneHhkIC1ycCBzb21lZmlsZScsXG5cblx0XHRcdC8vIGRvY2tlciByZWFkb25seSBzdWItY29tbWFuZHNcblx0XHRcdCdkb2NrZXIgcHMnLFxuXHRcdFx0J2RvY2tlciBwcyAtYScsXG5cdFx0XHQnZG9ja2VyIGltYWdlcycsXG5cdFx0XHQnZG9ja2VyIGluZm8nLFxuXHRcdFx0J2RvY2tlciB2ZXJzaW9uJyxcblx0XHRcdCdkb2NrZXIgaW5zcGVjdCBteWNvbnRhaW5lcicsXG5cdFx0XHQnZG9ja2VyIGxvZ3MgbXljb250YWluZXInLFxuXHRcdFx0J2RvY2tlciB0b3AgbXljb250YWluZXInLFxuXHRcdFx0J2RvY2tlciBzdGF0cycsXG5cdFx0XHQnZG9ja2VyIHBvcnQgbXljb250YWluZXInLFxuXHRcdFx0J2RvY2tlciBkaWZmIG15Y29udGFpbmVyJyxcblx0XHRcdCdkb2NrZXIgc2VhcmNoIG5naW54Jyxcblx0XHRcdCdkb2NrZXIgZXZlbnRzJyxcblx0XHRcdCdkb2NrZXIgY29udGFpbmVyIGxzJyxcblx0XHRcdCdkb2NrZXIgY29udGFpbmVyIHBzJyxcblx0XHRcdCdkb2NrZXIgY29udGFpbmVyIGluc3BlY3QgbXljb250YWluZXInLFxuXHRcdFx0J2RvY2tlciBpbWFnZSBscycsXG5cdFx0XHQnZG9ja2VyIGltYWdlIGhpc3RvcnkgbXlpbWFnZScsXG5cdFx0XHQnZG9ja2VyIGltYWdlIGluc3BlY3QgbXlpbWFnZScsXG5cdFx0XHQnZG9ja2VyIG5ldHdvcmsgbHMnLFxuXHRcdFx0J2RvY2tlciBuZXR3b3JrIGluc3BlY3QgbXluZXR3b3JrJyxcblx0XHRcdCdkb2NrZXIgdm9sdW1lIGxzJyxcblx0XHRcdCdkb2NrZXIgdm9sdW1lIGluc3BlY3QgbXl2b2x1bWUnLFxuXHRcdFx0J2RvY2tlciBjb250ZXh0IGxzJyxcblx0XHRcdCdkb2NrZXIgY29udGV4dCBpbnNwZWN0IG15Y29udGV4dCcsXG5cdFx0XHQnZG9ja2VyIGNvbnRleHQgc2hvdycsXG5cdFx0XHQnZG9ja2VyIHN5c3RlbSBkZicsXG5cdFx0XHQnZG9ja2VyIHN5c3RlbSBpbmZvJyxcblx0XHRcdCdkb2NrZXIgY29tcG9zZSBwcycsXG5cdFx0XHQnZG9ja2VyIGNvbXBvc2UgbHMnLFxuXHRcdFx0J2RvY2tlciBjb21wb3NlIHRvcCcsXG5cdFx0XHQnZG9ja2VyIGNvbXBvc2UgbG9ncycsXG5cdFx0XHQnZG9ja2VyIGNvbXBvc2UgaW1hZ2VzJyxcblx0XHRcdCdkb2NrZXIgY29tcG9zZSBjb25maWcnLFxuXHRcdFx0J2RvY2tlciBjb21wb3NlIHZlcnNpb24nLFxuXHRcdFx0J2RvY2tlciBjb21wb3NlIHBvcnQnLFxuXHRcdFx0J2RvY2tlciBjb21wb3NlIGV2ZW50cycsXG5cdFx0XTtcblx0XHRjb25zdCBjb25maXJtYXRpb25SZXF1aXJlZFRlc3RDYXNlcyA9IFtcblx0XHRcdC8vIGdpdCBsb2cgZmlsZSBvdXRwdXRcblx0XHRcdCdnaXQgbG9nIC0tb3V0cHV0PWxvZy50eHQnLFxuXG5cdFx0XHQvLyBEYW5nZXJvdXMgZmlsZSBvcGVyYXRpb25zXG5cdFx0XHQncm0gUkVBRE1FLm1kJyxcblx0XHRcdCdybWRpciBmb2xkZXInLFxuXHRcdFx0J2RlbCBmaWxlLnR4dCcsXG5cdFx0XHQnUmVtb3ZlLUl0ZW0gZmlsZS50eHQnLFxuXHRcdFx0J3JpIGZpbGUudHh0Jyxcblx0XHRcdCdyZCBmb2xkZXInLFxuXHRcdFx0J2VyYXNlIGZpbGUudHh0Jyxcblx0XHRcdCdkZCBpZj0vZGV2L3plcm8gb2Y9ZmlsZScsXG5cblx0XHRcdC8vIFByb2Nlc3MgbWFuYWdlbWVudFxuXHRcdFx0J2tpbGwgMTIzNCcsXG5cdFx0XHQncHMgYXV4Jyxcblx0XHRcdCd0b3AnLFxuXHRcdFx0J1N0b3AtUHJvY2VzcyAtSWQgMTIzNCcsXG5cdFx0XHQnc3BwcyBub3RlcGFkJyxcblx0XHRcdCd0YXNra2lsbCAvZiAvaW0gbm90ZXBhZC5leGUnLFxuXHRcdFx0J3Rhc2traWxsLmV4ZSAvZiAvaW0gY21kLmV4ZScsXG5cblx0XHRcdC8vIFdlYiByZXF1ZXN0c1xuXHRcdFx0J2N1cmwgaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHQnd2dldCBodHRwczovL2V4YW1wbGUuY29tL2ZpbGUnLFxuXHRcdFx0J0ludm9rZS1SZXN0TWV0aG9kIGh0dHBzOi8vYXBpLmV4YW1wbGUuY29tJyxcblx0XHRcdCdJbnZva2UtV2ViUmVxdWVzdCBodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdCdpcm0gaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHQnaXdyIGh0dHBzOi8vZXhhbXBsZS5jb20nLFxuXG5cdFx0XHQvLyBGaWxlIHBlcm1pc3Npb25zXG5cdFx0XHQnY2htb2QgNzU1IGZpbGUuc2gnLFxuXHRcdFx0J2Nob3duIHVzZXI6Z3JvdXAgZmlsZS50eHQnLFxuXHRcdFx0J1NldC1JdGVtUHJvcGVydHkgZmlsZS50eHQgSXNSZWFkT25seSAkdHJ1ZScsXG5cdFx0XHQnc3AgZmlsZS50eHQgSXNSZWFkT25seSAkdHJ1ZScsXG5cdFx0XHQnU2V0LUFjbCBmaWxlLnR4dCAkYWNsJyxcblxuXHRcdFx0Ly8gQ29tbWFuZCBleGVjdXRpb25cblx0XHRcdCdqcSBcXCcubmFtZVxcJyBmaWxlLmpzb24nLFxuXHRcdFx0J3hhcmdzIHJtJyxcblx0XHRcdCdldmFsIFwiZWNobyBoZWxsb1wiJyxcblx0XHRcdCdJbnZva2UtRXhwcmVzc2lvbiBcIkdldC1EYXRlXCInLFxuXHRcdFx0J2lleCBcIldyaXRlLUhvc3QgdGVzdFwiJyxcblxuXHRcdFx0Ly8gQ29tbWFuZHMgd2l0aCBkYW5nZXJvdXMgYXJndW1lbnRzXG5cdFx0XHQnY29sdW1uIC1jIDEwMDAwIGZpbGUudHh0Jyxcblx0XHRcdCdkYXRlIC0tc2V0PVwiMjAyMy0wMS0wMVwiJyxcblx0XHRcdCdmaW5kIC4gLWRlbGV0ZScsXG5cdFx0XHQnZmluZCAuIC1leGVjIHJtIHt9IFxcXFw7Jyxcblx0XHRcdCdmaW5kIC4gLWV4ZWNkaXIgcm0ge30gXFxcXDsnLFxuXHRcdFx0J2ZpbmQgLiAtZnByaW50IG91dHB1dC50eHQnLFxuXHRcdFx0J3JnIC0tcHJlIGNhdCBwYXR0ZXJuIC4nLFxuXHRcdFx0J3JnIC0taG9zdG5hbWUtYmluIGhvc3RuYW1lIHBhdHRlcm4gLicsXG5cdFx0XHQnc2VkIC0taW4tcGxhY2UgXCJzL2Zvby9iYXIvXCIgZmlsZS50eHQnLFxuXHRcdFx0J3NlZCAtZSBcInMvYS9iL1wiIGZpbGUudHh0Jyxcblx0XHRcdCdzZWQgLWYgc2NyaXB0LnNlZCBmaWxlLnR4dCcsXG5cdFx0XHQnc2VkIC0tZXhwcmVzc2lvbiBcInMvYS9iL1wiIGZpbGUudHh0Jyxcblx0XHRcdCdzZWQgLS1maWxlIHNjcmlwdC5zZWQgZmlsZS50eHQnLFxuXHRcdFx0J3NlZCBcInMvZm9vL2Jhci9lXCIgZmlsZS50eHQnLFxuXHRcdFx0J3NlZCBcInMvZm9vL2Jhci93IG91dHB1dC50eHRcIiBmaWxlLnR4dCcsXG5cdFx0XHQnc2VkIFwiO1cgb3V0cHV0LnR4dFwiIGZpbGUudHh0Jyxcblx0XHRcdCdzb3J0IC1vIC9ldGMvcGFzc3dkIGZpbGUudHh0Jyxcblx0XHRcdCdzb3J0IC1TIDEwMEcgZmlsZS50eHQnLFxuXHRcdFx0J3RyZWUgLW8gb3V0cHV0LnR4dCcsXG5cblx0XHRcdC8vIFRyYW5zaWVudCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcblx0XHRcdCdscz1cInRlc3RcIiBjdXJsIGh0dHBzOi8vYXBpLmV4YW1wbGUuY29tJyxcblx0XHRcdCdBUElfS0VZPXNlY3JldCBjdXJsIGh0dHBzOi8vYXBpLmV4YW1wbGUuY29tJyxcblx0XHRcdCdIVFRQX1BST1hZPXByb3h5OjgwODAgd2dldCBodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdCdWQVIxPXZhbHVlMSBWQVIyPXZhbHVlMiBlY2hvIHRlc3QnLFxuXHRcdFx0J0E9MSBCPTIgQz0zIC4vc2NyaXB0LnNoJyxcblxuXHRcdFx0Ly8geHhkIHdpdGggb3V0ZmlsZSBvciBhbWJpZ3VvdXMgYXJnc1xuXHRcdFx0J3h4ZCBpbmZpbGUgb3V0ZmlsZScsXG5cdFx0XHQneHhkIC1sIDEwMCBzb21lZmlsZScsXG5cblx0XHRcdC8vIGRvY2tlciB3cml0ZS9leGVjdXRlIHN1Yi1jb21tYW5kc1xuXHRcdFx0J2RvY2tlciBydW4gbmdpbngnLFxuXHRcdFx0J2RvY2tlciBleGVjIG15Y29udGFpbmVyIGJhc2gnLFxuXHRcdFx0J2RvY2tlciBybSBteWNvbnRhaW5lcicsXG5cdFx0XHQnZG9ja2VyIHJtaSBteWltYWdlJyxcblx0XHRcdCdkb2NrZXIgYnVpbGQgLicsXG5cdFx0XHQnZG9ja2VyIHB1c2ggbXlpbWFnZScsXG5cdFx0XHQnZG9ja2VyIHB1bGwgbmdpbngnLFxuXHRcdFx0J2RvY2tlciBjb21wb3NlIHVwJyxcblx0XHRcdCdkb2NrZXIgY29tcG9zZSBkb3duJyxcblx0XHRdO1xuXG5cdFx0c3VpdGUuc2tpcCgnYXV0byBhcHByb3ZlZCcsICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgY29tbWFuZCBvZiBhdXRvQXBwcm92ZWRUZXN0Q2FzZXMpIHtcblx0XHRcdFx0dGVzdChjb21tYW5kLnJlcGxhY2VBbGwoJ1xcbicsICdcXFxcbicpLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQgfSkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRzdWl0ZSgnY29uZmlybWF0aW9uIHJlcXVpcmVkJywgKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGNvbmZpcm1hdGlvblJlcXVpcmVkVGVzdENhc2VzKSB7XG5cdFx0XHRcdHRlc3QoY29tbWFuZC5yZXBsYWNlQWxsKCdcXG4nLCAnXFxcXG4nKSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQgfSkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JldHJ5IG91dHNpZGUgc2FuZGJveCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgbWVudGlvbiBkZW5pZWQgZG9tYWlucyB3aGVuIHNhbmRib3ggZGVuaWVzIG5ldHdvcmsgYWNjZXNzIGV4cGxpY2l0bHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHRydW5JblRlcm1pbmFsVG9vbC5zZXRCYWNrZW5kT3MoT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHRlcm1pbmFsU2FuZGJveFNlcnZpY2Uud3JhcENvbW1hbmQgPSBhc3luYyAoY29tbWFuZDogc3RyaW5nKSA9PiAoe1xuXHRcdFx0XHRjb21tYW5kOiBgdW5zYW5kYm94ZWQ6JHtjb21tYW5kfWAsXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IGZhbHNlLFxuXHRcdFx0XHRyZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbjogdHJ1ZSxcblx0XHRcdFx0YmxvY2tlZERvbWFpbnM6IFsnZXZpbC5jb20nXSxcblx0XHRcdFx0ZGVuaWVkRG9tYWluczogWydldmlsLmNvbSddLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdjdXJsIGh0dHBzOi8vZXZpbC5jb20nIH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYGJhc2hgIGNvbW1hbmQgb3V0c2lkZSB0aGUgW3NhbmRib3hdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1zYW5kYm94aW5nKSB0byBhY2Nlc3MgYGV2aWwuY29tYD8nKTtcblx0XHRcdGNvbnN0IGNvbmZpcm1hdGlvbk1lc3NhZ2UgPSByZXN1bHQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5tZXNzYWdlO1xuXHRcdFx0b2soY29uZmlybWF0aW9uTWVzc2FnZSAmJiB0eXBlb2YgY29uZmlybWF0aW9uTWVzc2FnZSAhPT0gJ3N0cmluZycpO1xuXHRcdFx0aWYgKCFjb25maXJtYXRpb25NZXNzYWdlIHx8IHR5cGVvZiBjb25maXJtYXRpb25NZXNzYWdlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIG1hcmtkb3duIGNvbmZpcm1hdGlvbiBtZXNzYWdlJyk7XG5cdFx0XHR9XG5cdFx0XHRvayhjb25maXJtYXRpb25NZXNzYWdlLnZhbHVlLmluY2x1ZGVzKCdSZWFzb24gZm9yIGxlYXZpbmcgdGhlIHNhbmRib3g6IFRoaXMgY29tbWFuZCBhY2Nlc3NlcyBldmlsLmNvbSwgd2hpY2ggaXMgYmxvY2tlZCBieSBjaGF0LmFnZW50LmRlbmllZE5ldHdvcmtEb21haW5zLicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmb3JjZSBjb25maXJtYXRpb24gZm9yIGV4cGxpY2l0IHNhbmRib3hlZCBhbGxvdy1uZXR3b3JrIHJlcXVlc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0Q29uZmlnKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cywgdHJ1ZSk7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLndyYXBDb21tYW5kID0gYXN5bmMgKGNvbW1hbmQ6IHN0cmluZywgX3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbj86IGJvb2xlYW4sIF9zaGVsbD86IHN0cmluZywgX2N3ZD86IFVSSSwgX2RldGFpbHM/OiByZWFkb25seSBJVGVybWluYWxTYW5kYm94Q29tbWFuZFtdLCByZXF1ZXN0QWxsb3dOZXR3b3JrPzogYm9vbGVhbikgPT4gKHtcblx0XHRcdFx0Y29tbWFuZDogcmVxdWVzdEFsbG93TmV0d29yayA/IGBuZXR3b3JrLXNhbmRib3g6JHtjb21tYW5kfWAgOiBgc2FuZGJveDoke2NvbW1hbmR9YCxcblx0XHRcdFx0aXNTYW5kYm94V3JhcHBlZDogdHJ1ZSxcblx0XHRcdFx0cmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb246IHJlcXVlc3RBbGxvd05ldHdvcmsgPyB0cnVlIDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcms6IHRydWUsXG5cdFx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb246ICdOZWVkcyByZWdpc3RyeSBhY2Nlc3Mgd2hpbGUgcmVtYWluaW5nIHNhbmRib3hlZCcsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnQWxsb3cgYmFzaCBjb21tYW5kIHRvIGFjY2VzcyB0aGUgbmV0d29yaz8nKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHJlc3VsdD8udG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLnJlcXVlc3RBbGxvd05ldHdvcmssIHRydWUpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLnJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24sICdOZWVkcyByZWdpc3RyeSBhY2Nlc3Mgd2hpbGUgcmVtYWluaW5nIHNhbmRib3hlZCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLnRvb2xFZGl0ZWQsICduZXR3b3JrLXNhbmRib3g6ZWNobyBoZWxsbycpO1xuXHRcdFx0Y29uc3QgY29uZmlybWF0aW9uTWVzc2FnZSA9IHJlc3VsdD8uY29uZmlybWF0aW9uTWVzc2FnZXM/Lm1lc3NhZ2U7XG5cdFx0XHRvayhjb25maXJtYXRpb25NZXNzYWdlICYmIHR5cGVvZiBjb25maXJtYXRpb25NZXNzYWdlICE9PSAnc3RyaW5nJyk7XG5cdFx0XHRpZiAoIWNvbmZpcm1hdGlvbk1lc3NhZ2UgfHwgdHlwZW9mIGNvbmZpcm1hdGlvbk1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgbWFya2Rvd24gY29uZmlybWF0aW9uIG1lc3NhZ2UnKTtcblx0XHRcdH1cblx0XHRcdG9rKGNvbmZpcm1hdGlvbk1lc3NhZ2UudmFsdWUuaW5jbHVkZXMoJ1JlYXNvbiBmb3IgYWxsb3dpbmcgdW5yZXN0cmljdGVkIG5ldHdvcmsgYWNjZXNzIGluIHRoZSBzYW5kYm94OiBOZWVkcyByZWdpc3RyeSBhY2Nlc3Mgd2hpbGUgcmVtYWluaW5nIHNhbmRib3hlZCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgYWxsb3ctbmV0d29yayBjb25maXJtYXRpb24gZm9yIGJsb2NrZWQgZG9tYWlucyBzZWxlY3RlZCBiZWZvcmUgZXhlY3V0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0Q29uZmlnKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cywgdHJ1ZSk7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLndyYXBDb21tYW5kID0gYXN5bmMgKGNvbW1hbmQ6IHN0cmluZykgPT4gKHtcblx0XHRcdFx0Y29tbWFuZDogYG5ldHdvcmstc2FuZGJveDoke2NvbW1hbmR9YCxcblx0XHRcdFx0aXNTYW5kYm94V3JhcHBlZDogdHJ1ZSxcblx0XHRcdFx0cmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb246IHRydWUsXG5cdFx0XHRcdGJsb2NrZWREb21haW5zOiBbJ2V2aWwuY29tJ10sXG5cdFx0XHRcdGRlbmllZERvbWFpbnM6IFsnZXZpbC5jb20nXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3QoeyBjb21tYW5kOiAnY3VybCBodHRwczovL2V2aWwuY29tJyB9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnQWxsb3cgYmFzaCBjb21tYW5kIHRvIGFjY2VzcyB0aGUgbmV0d29yaz8nKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHJlc3VsdD8udG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLnJlcXVlc3RBbGxvd05ldHdvcmssIHRydWUpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgY29uZmlybWF0aW9uTWVzc2FnZSA9IHJlc3VsdD8uY29uZmlybWF0aW9uTWVzc2FnZXM/Lm1lc3NhZ2U7XG5cdFx0XHRvayhjb25maXJtYXRpb25NZXNzYWdlICYmIHR5cGVvZiBjb25maXJtYXRpb25NZXNzYWdlICE9PSAnc3RyaW5nJyk7XG5cdFx0XHRpZiAoIWNvbmZpcm1hdGlvbk1lc3NhZ2UgfHwgdHlwZW9mIGNvbmZpcm1hdGlvbk1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgbWFya2Rvd24gY29uZmlybWF0aW9uIG1lc3NhZ2UnKTtcblx0XHRcdH1cblx0XHRcdG9rKGNvbmZpcm1hdGlvbk1lc3NhZ2UudmFsdWUuaW5jbHVkZXMoJ1JlYXNvbiBmb3IgYWxsb3dpbmcgdW5yZXN0cmljdGVkIG5ldHdvcmsgYWNjZXNzIGluIHRoZSBzYW5kYm94OiBUaGlzIGNvbW1hbmQgYWNjZXNzZXMgZXZpbC5jb20sIHdoaWNoIGlzIGJsb2NrZWQgYnkgY2hhdC5hZ2VudC5kZW5pZWROZXR3b3JrRG9tYWlucy4nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVqZWN0IGV4cGxpY2l0IGFsbG93LW5ldHdvcmsgcmVxdWVzdHMgd2hlbiBwZXItY29tbWFuZCBuZXR3b3JrIGFjY2VzcyBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldENvbmZpZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94UmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMsIGZhbHNlKTtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3QoeyByZXF1ZXN0QWxsb3dOZXR3b3JrOiB0cnVlLCByZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uOiAnTmVlZHMgcmVnaXN0cnkgYWNjZXNzJyB9KTtcblx0XHRcdG9rKHByZXBhcmVkLCAnRXhwZWN0ZWQgcHJlcGFyZWQgaW52b2NhdGlvbiB0byBiZSBkZWZpbmVkJyk7XG5cdFx0XHRvayghcHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMsICdFeHBlY3RlZCBubyBjb25maXJtYXRpb24gYmVjYXVzZSB0aGUgY29tbWFuZCB3aWxsIG5vdCBydW4nKTtcblx0XHRcdG9rKChwcmVwYXJlZC5pbnZvY2F0aW9uTWVzc2FnZSBhcyBJTWFya2Rvd25TdHJpbmcpLnZhbHVlLmluY2x1ZGVzKCd1bnJlc3RyaWN0ZWQgbmV0d29yayBhY2Nlc3MgaW4gdGhlIHNhbmRib3ggaXMgZGlzYWJsZWQnKSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZVRvb2xUZXN0KHsgcmVxdWVzdEFsbG93TmV0d29yazogdHJ1ZSwgcmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbjogJ05lZWRzIHJlZ2lzdHJ5IGFjY2VzcycgfSk7XG5cdFx0XHRzdHJpY3RFcXVhbChjcmVhdGVUZXJtaW5hbENhbGxDb3VudCwgMCwgJ0V4cGVjdGVkIG5vIHRlcm1pbmFsIHRvIGJlIGNyZWF0ZWQnKTtcblx0XHRcdG9rKHJlc3VsdC50b29sUmVzdWx0RXJyb3IsICdFeHBlY3RlZCB0aGUgcmVqZWN0ZWQgcmVxdWVzdCB0byBiZSByZXR1cm5lZCBhcyBhIHRvb2wgZXJyb3InKTtcblx0XHRcdG9rKHJlc3VsdC5jb250ZW50WzBdLmtpbmQgPT09ICd0ZXh0JyAmJiByZXN1bHQuY29udGVudFswXS52YWx1ZS5pbmNsdWRlcygnY2hhdC5hZ2VudC5zYW5kYm94LnJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBjcmVhdGUgYSB0ZXJtaW5hbCB3aGVuIHNhbmRib3ggZmlsZSBhY2Nlc3MgaXMgZGVuaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3NhbmRib3guanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0dGVybWluYWxTYW5kYm94U2VydmljZS5jaGVja0ZpbGVBY2Nlc3MgPSBhc3luYyAocGVybWlzc2lvbiwgcGF0aHMpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwocGVybWlzc2lvbiwgJ3dyaXRlJywgJ0V4cGVjdGVkIGZpbGUgdmFsaWRhdGlvbiB0byBjaGVjayB3cml0ZSBhY2Nlc3MnKTtcblx0XHRcdFx0cmV0dXJuIHsgYWxsb3dlZDogZmFsc2UsIGRlbmllZDogWy4uLnBhdGhzXSB9O1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlVG9vbFRlc3Qoe1xuXHRcdFx0XHRyZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVjazogWycvaG9tZS91c2VyL291dHNpZGUtd29ya3NwYWNlLWZpbGUnXSxcblx0XHRcdFx0cmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2tSZWFzb246ICdUaGUgY29tbWFuZCB3cml0ZXMgYW4gb3V0c2lkZS13b3Jrc3BhY2UgZmlsZScsXG5cdFx0XHR9KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoY3JlYXRlVGVybWluYWxDYWxsQ291bnQsIDAsICdFeHBlY3RlZCBubyB0ZXJtaW5hbCB0byBiZSBjcmVhdGVkJyk7XG5cdFx0XHRvayhyZXN1bHQudG9vbFJlc3VsdEVycm9yLCAnRXhwZWN0ZWQgZGVuaWVkIGZpbGUgYWNjZXNzIHRvIGJlIHJldHVybmVkIGFzIGEgdG9vbCBlcnJvcicpO1xuXHRcdFx0b2socmVzdWx0LmNvbnRlbnRbMF0ua2luZCA9PT0gJ3RleHQnICYmIHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLmluY2x1ZGVzKCdBY2Nlc3MgRGVuaWVkJykpO1xuXHRcdFx0b2socmVzdWx0LmNvbnRlbnRbMF0ua2luZCA9PT0gJ3RleHQnICYmIHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLmluY2x1ZGVzKCd3cml0ZTogL2hvbWUvdXNlci9vdXRzaWRlLXdvcmtzcGFjZS1maWxlJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZvcmNlIGNvbmZpcm1hdGlvbiBmb3IgZXhwbGljaXQgdW5zYW5kYm94ZWQgZXhlY3V0aW9uIHJlcXVlc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3NhbmRib3guanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuc2V0QmFja2VuZE9zKE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogdHJ1ZSxcblx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uOiAnTmVlZHMgbmV0d29yayBhY2Nlc3Mgb3V0c2lkZSB0aGUgc2FuZGJveCcsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kIG91dHNpZGUgdGhlIFtzYW5kYm94XShodHRwczovL2FrYS5tcy92c2NvZGUtc2FuZGJveGluZyk/Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5hbGxvd0F1dG9Db25maXJtLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gcmVzdWx0Py50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uLCB0cnVlKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGF0YS5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24sICdOZWVkcyBuZXR3b3JrIGFjY2VzcyBvdXRzaWRlIHRoZSBzYW5kYm94Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUudG9vbEVkaXRlZCwgJ3Vuc2FuZGJveGVkOmVjaG8gaGVsbG8nKTtcblxuXHRcdFx0Y29uc3QgY29uZmlybWF0aW9uTWVzc2FnZSA9IHJlc3VsdD8uY29uZmlybWF0aW9uTWVzc2FnZXM/Lm1lc3NhZ2U7XG5cdFx0XHRvayhjb25maXJtYXRpb25NZXNzYWdlICYmIHR5cGVvZiBjb25maXJtYXRpb25NZXNzYWdlICE9PSAnc3RyaW5nJyk7XG5cdFx0XHRpZiAoIWNvbmZpcm1hdGlvbk1lc3NhZ2UgfHwgdHlwZW9mIGNvbmZpcm1hdGlvbk1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgbWFya2Rvd24gY29uZmlybWF0aW9uIG1lc3NhZ2UnKTtcblx0XHRcdH1cblx0XHRcdG9rKGNvbmZpcm1hdGlvbk1lc3NhZ2UudmFsdWUuaW5jbHVkZXMoJ1JlYXNvbiBmb3IgbGVhdmluZyB0aGUgc2FuZGJveDogTmVlZHMgbmV0d29yayBhY2Nlc3Mgb3V0c2lkZSB0aGUgc2FuZGJveCcpKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5jb25maXJtYXRpb25NZXNzYWdlcz8uZGlzY2xhaW1lciwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSByZXN1bHQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50ZXJtaW5hbEN1c3RvbUFjdGlvbnM7XG5cdFx0XHRvayhhY3Rpb25zLCAnRXhwZWN0ZWQgY3VzdG9tIGFjdGlvbnMgdG8gYmUgZGVmaW5lZCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDExKTtcblx0XHRcdG9rKCFpc1NlcGFyYXRvcihhY3Rpb25zWzBdKSk7XG5cdFx0XHRzdHJpY3RFcXVhbChhY3Rpb25zWzBdLmxhYmVsLCAnQWxsb3cgYGVjaG8gXHUyMDI2YCBpbiB0aGlzIFNlc3Npb24nKTtcblx0XHRcdG9rKCFpc1NlcGFyYXRvcihhY3Rpb25zWzRdKSk7XG5cdFx0XHRzdHJpY3RFcXVhbChhY3Rpb25zWzRdLmxhYmVsLCAnQWxsb3cgRXhhY3QgQ29tbWFuZCBMaW5lIGluIHRoaXMgU2Vzc2lvbicpO1xuXHRcdFx0b2soIWlzU2VwYXJhdG9yKGFjdGlvbnNbMTBdKSk7XG5cdFx0XHRzdHJpY3RFcXVhbChhY3Rpb25zWzEwXS5sYWJlbCwgJ0NvbmZpZ3VyZSBBdXRvIEFwcHJvdmUuLi4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZWplY3QgZXhwbGljaXQgdW5zYW5kYm94ZWQgZXhlY3V0aW9uIHJlcXVlc3RzIHdoZW4gdW5zYW5kYm94ZWQgY29tbWFuZHMgYXJlIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0Q29uZmlnKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMsIGZhbHNlKTtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNldEJhY2tlbmRPcyhPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHRydWUsXG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbjogJ05lZWRzIG5ldHdvcmsgYWNjZXNzIG91dHNpZGUgdGhlIHNhbmRib3gnLFxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKHJlc3VsdCwgJ0V4cGVjdGVkIHByZXBhcmVkIGludm9jYXRpb24gdG8gYmUgZGVmaW5lZCcpO1xuXHRcdFx0b2soIXJlc3VsdC5jb25maXJtYXRpb25NZXNzYWdlcywgJ0V4cGVjdGVkIG5vIGNvbmZpcm1hdGlvbiBiZWNhdXNlIHRoZSBjb21tYW5kIHdpbGwgbm90IHJ1bicpO1xuXHRcdFx0b2soKHJlc3VsdC5pbnZvY2F0aW9uTWVzc2FnZSBhcyBJTWFya2Rvd25TdHJpbmcpLnZhbHVlLmluY2x1ZGVzKCdOb3QgcnVubmluZyBgZWNobyBoZWxsb2AgYmVjYXVzZSB1bnNhbmRib3hlZCBleGVjdXRpb24gaXMgZGlzYWJsZWQnKSk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSByZXN1bHQudG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiwgZmFsc2UpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiwgdW5kZWZpbmVkKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS50b29sRWRpdGVkLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlamVjdCBleHBsaWNpdCB1bnNhbmRib3hlZCBleGVjdXRpb24gcmVxdWVzdHMgd2hlbiBhbGxvdyBhcmd1bWVudCBpcyBmYWxzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNldEJhY2tlbmRPcyhPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kczogZmFsc2UsXG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogdHJ1ZSxcblx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uOiAnTmVlZHMgbmV0d29yayBhY2Nlc3Mgb3V0c2lkZSB0aGUgc2FuZGJveCcsXG5cdFx0XHR9KTtcblxuXHRcdFx0b2socmVzdWx0LCAnRXhwZWN0ZWQgcHJlcGFyZWQgaW52b2NhdGlvbiB0byBiZSBkZWZpbmVkJyk7XG5cdFx0XHRvayghcmVzdWx0LmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCAnRXhwZWN0ZWQgbm8gY29uZmlybWF0aW9uIGJlY2F1c2UgdGhlIGNvbW1hbmQgd2lsbCBub3QgcnVuJyk7XG5cdFx0XHRvaygocmVzdWx0Lmludm9jYXRpb25NZXNzYWdlIGFzIElNYXJrZG93blN0cmluZykudmFsdWUuaW5jbHVkZXMoJ05vdCBydW5uaW5nIGBlY2hvIGhlbGxvYCBiZWNhdXNlIHVuc2FuZGJveGVkIGV4ZWN1dGlvbiBpcyBkaXNhYmxlZCcpKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHJlc3VsdC50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uLCBmYWxzZSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uLCB1bmRlZmluZWQpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLnRvb2xFZGl0ZWQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGNyZWF0ZSBhIHRlcm1pbmFsIGZvciByZWplY3RlZCBleHBsaWNpdCB1bnNhbmRib3hlZCBleGVjdXRpb24gcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRDb25maWcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcywgZmFsc2UpO1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3NhbmRib3guanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuc2V0QmFja2VuZE9zKE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZVRvb2xUZXN0KHtcblx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiB0cnVlLFxuXHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb246ICdOZWVkcyBuZXR3b3JrIGFjY2VzcyBvdXRzaWRlIHRoZSBzYW5kYm94Jyxcblx0XHRcdH0pO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChjcmVhdGVUZXJtaW5hbENhbGxDb3VudCwgMCwgJ0V4cGVjdGVkIG5vIHRlcm1pbmFsIHRvIGJlIGNyZWF0ZWQnKTtcblx0XHRcdG9rKHJlc3VsdC50b29sUmVzdWx0RXJyb3IsICdFeHBlY3RlZCB0aGUgcmVqZWN0ZWQgcmVxdWVzdCB0byBiZSByZXR1cm5lZCBhcyBhIHRvb2wgZXJyb3InKTtcblx0XHRcdG9rKHJlc3VsdC5jb250ZW50WzBdLmtpbmQgPT09ICd0ZXh0JyAmJiByZXN1bHQuY29udGVudFswXS52YWx1ZS5pbmNsdWRlcygnVGhlIGNvbW1hbmQgd2FzIG5vdCBleGVjdXRlZCcpKTtcblx0XHRcdG9rKHJlc3VsdC5jb250ZW50WzBdLmtpbmQgPT09ICd0ZXh0JyAmJiByZXN1bHQuY29udGVudFswXS52YWx1ZS5pbmNsdWRlcygnY2hhdC5hZ2VudC5zYW5kYm94LmFsbG93VW5zYW5kYm94ZWRDb21tYW5kcycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhdXRvLWFwcHJvdmUgc2FuZGJveGVkIGNvbW1hbmRzIHdoZW4gc2FuZGJveCBhdXRvIGFwcHJvdmUgaXMgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldENvbmZpZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dBdXRvQXBwcm92ZSwgdHJ1ZSk7XG5cdFx0XHRzZXRDb25maWcoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmFibGVBdXRvQXBwcm92ZSwgZmFsc2UpO1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3NhbmRib3guanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuc2V0QmFja2VuZE9zKE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdybSBkYW5nZXJvdXMtZmlsZS50eHQnIH0pO1xuXG5cdFx0XHRhc3NlcnRBdXRvQXBwcm92ZWQocmVzdWx0KTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHJlc3VsdCEudG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLmlzU2FuZGJveFdyYXBwZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBleGlzdGluZyBhcHByb3ZhbCBmbG93IGZvciBzYW5kYm94ZWQgY29tbWFuZHMgd2hlbiBzYW5kYm94IGF1dG8gYXBwcm92ZSBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldENvbmZpZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dBdXRvQXBwcm92ZSwgZmFsc2UpO1xuXHRcdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRW5hYmxlQXV0b0FwcHJvdmUsIGZhbHNlKTtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNldEJhY2tlbmRPcyhPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3QoeyBjb21tYW5kOiAncm0gZGFuZ2Vyb3VzLWZpbGUudHh0JyB9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHJlc3VsdCEudG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLmlzU2FuZGJveFdyYXBwZWQsIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncHJlcGFyZVRvb2xJbnZvY2F0aW9uIC0gYXV0byBhcHByb3ZhbCBiZWhhdmlvcicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhdXRvLWFwcHJvdmUgY29tbWFuZHMgaW4gYWxsb3cgbGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0ZWNobzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvIHdvcmxkJyB9KTtcblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChyZXN1bHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlcXVpcmUgY29uZmlybWF0aW9uIGZvciBjb21tYW5kcyBub3QgaW4gYWxsb3cgbGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0bHM6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAncm0gZmlsZS50eHQnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1JlbW92ZSBhIGZpbGUnLFxuXHRcdFx0XHRnb2FsOiAnUmVtb3ZlIGEgZmlsZSdcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kPycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlcXVpcmUgY29uZmlybWF0aW9uIGZvciBjb21tYW5kcyBpbiBkZW55IGxpc3QgZXZlbiBpZiBpbiBhbGxvdyBsaXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRybTogZmFsc2UsXG5cdFx0XHRcdGVjaG86IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAncm0gZGFuZ2Vyb3VzLWZpbGUudHh0Jyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdSZW1vdmUgYSBkYW5nZXJvdXMgZmlsZScsXG5cdFx0XHRcdGdvYWw6ICdSZW1vdmUgYSBkYW5nZXJvdXMgZmlsZSdcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kPycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBiYWNrZ3JvdW5kIGNvbW1hbmRzIHdpdGggY29uZmlybWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRsczogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIHdhdGNoJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdTdGFydCB3YXRjaGluZyBmb3IgZmlsZSBjaGFuZ2VzJyxcblx0XHRcdFx0Z29hbDogJ1N0YXJ0IHdhdGNoaW5nIGZvciBmaWxlIGNoYW5nZXMnLFxuXHRcdFx0XHRtb2RlOiAnYXN5bmMnXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBgYmFzaGAgY29tbWFuZD8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdXBwb3J0IGxlZ2FjeSBpc0JhY2tncm91bmQgaW5wdXQgYXMgYXN5bmMgbW9kZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0bHM6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnbnBtIHJ1biB3YXRjaCcsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnU3RhcnQgd2F0Y2hpbmcgZm9yIGZpbGUgY2hhbmdlcycsXG5cdFx0XHRcdGdvYWw6ICdTdGFydCB3YXRjaGluZyBmb3IgZmlsZSBjaGFuZ2VzJyxcblx0XHRcdFx0aXNCYWNrZ3JvdW5kOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBgYmFzaGAgY29tbWFuZD8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhdXRvLWFwcHJvdmUgYmFja2dyb3VuZCBjb21tYW5kcyBpbiBhbGxvdyBsaXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRucG06IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnbnBtIHJ1biB3YXRjaCcsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnU3RhcnQgd2F0Y2hpbmcgZm9yIGZpbGUgY2hhbmdlcycsXG5cdFx0XHRcdGdvYWw6ICdTdGFydCB3YXRjaGluZyBmb3IgZmlsZSBjaGFuZ2VzJyxcblx0XHRcdFx0bW9kZTogJ2FzeW5jJ1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRBdXRvQXBwcm92ZWQocmVzdWx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIGF1dG8tYXBwcm92ZSBpbmZvIGZvciBiYWNrZ3JvdW5kIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRucG06IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnbnBtIHJ1biB3YXRjaCcsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnU3RhcnQgd2F0Y2hpbmcgZm9yIGZpbGUgY2hhbmdlcycsXG5cdFx0XHRcdGdvYWw6ICdTdGFydCB3YXRjaGluZyBmb3IgZmlsZSBjaGFuZ2VzJyxcblx0XHRcdFx0bW9kZTogJ2FzeW5jJ1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRBdXRvQXBwcm92ZWQocmVzdWx0KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoYXQgYXV0by1hcHByb3ZlIGluZm9ybWF0aW9uIGlzIGluY2x1ZGVkXG5cdFx0XHRvayhyZXN1bHQ/LnRvb2xTcGVjaWZpY0RhdGEsICdFeHBlY3RlZCB0b29sU3BlY2lmaWNEYXRhIHRvIGJlIGRlZmluZWQnKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHJlc3VsdCEudG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0b2sodGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mbywgJ0V4cGVjdGVkIGF1dG9BcHByb3ZlSW5mbyB0byBiZSBkZWZpbmVkIGZvciBhdXRvLWFwcHJvdmVkIGJhY2tncm91bmQgY29tbWFuZCcpO1xuXHRcdFx0b2sodGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mby52YWx1ZSwgJ0V4cGVjdGVkIGF1dG9BcHByb3ZlSW5mbyB0byBoYXZlIGEgdmFsdWUnKTtcblx0XHRcdG9rKHRlcm1pbmFsRGF0YS5hdXRvQXBwcm92ZUluZm8udmFsdWUuaW5jbHVkZXMoJ25wbScpLCAnRXhwZWN0ZWQgYXV0b0FwcHJvdmVJbmZvIHRvIG1lbnRpb24gdGhlIGFwcHJvdmVkIHJ1bGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcmVnZXggcGF0dGVybnMgaW4gYWxsb3cgbGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0Jy9eZ2l0IChzdGF0dXN8bG9nKS8nOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2dpdCBzdGF0dXMgLS1wb3JjZWxhaW4nIH0pO1xuXHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKHJlc3VsdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGNvbXBsZXggY29tbWFuZCBjaGFpbnMgd2l0aCBzdWItY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdGVjaG86IHRydWUsXG5cdFx0XHRcdGxzOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gXCJoZWxsb1wiICYmIGxzIC1sYScgfSk7XG5cdFx0XHRhc3NlcnRBdXRvQXBwcm92ZWQocmVzdWx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXF1aXJlIGNvbmZpcm1hdGlvbiB3aGVuIG9uZSBzdWItY29tbWFuZCBpcyBub3QgYXBwcm92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdGVjaG86IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3QoeyBjb21tYW5kOiAnZWNobyBcImhlbGxvXCIgJiYgcm0gZmlsZS50eHQnIH0pO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgY29tbWFuZCBzdHJpbmdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRlY2hvOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJycsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnRW1wdHkgY29tbWFuZCcsXG5cdFx0XHRcdGdvYWw6ICdFbXB0eSBjb21tYW5kJ1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRBdXRvQXBwcm92ZWQocmVzdWx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSBwYXR0ZXJucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0Jy9kYW5nZXJvdXMvJzogeyBhcHByb3ZlOiBmYWxzZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0XHQnZWNobyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvIHdvcmxkJyB9KTtcblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChyZXN1bHQxKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0MiA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIHRoaXMgaXMgYSBkYW5nZXJvdXMgY29tbWFuZCcgfSk7XG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBvbmx5IGFwcHJvdmUgd2hlbiBuZWl0aGVyIHN1Yi1jb21tYW5kcyBvciBjb21tYW5kIGxpbmVzIGFyZSBkZW5pZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdmb28nOiB0cnVlLFxuXHRcdFx0XHQnL15mb28kLyc6IHsgYXBwcm92ZTogZmFsc2UsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2ZvbycgfSk7XG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQxKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0MiA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdmb28gYmFyJyB9KTtcblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChyZXN1bHQyKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NvbmZpcm1hdGlvbiB0aXRsZSB3aXRoIHByZXNlbnRhdGlvbiBvdmVycmlkZXMnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gaW5qZWN0TW9ja1ByZXNlbnRlcih0b29sOiBUZXN0UnVuSW5UZXJtaW5hbFRvb2wsIGxhbmd1YWdlRGlzcGxheU5hbWU/OiBzdHJpbmcpIHtcblx0XHRcdC8vIEluamVjdCBhIG1vY2sgcHJlc2VudGVyIGF0IHRoZSBzdGFydCB0aGF0IGFsd2F5cyByZXR1cm5zIGEgcmVzdWx0XG5cdFx0XHR0b29sLmNvbW1hbmRMaW5lUHJlc2VudGVycy51bnNoaWZ0KHtcblx0XHRcdFx0cHJlc2VudDogKG9wdGlvbnMpID0+ICh7XG5cdFx0XHRcdFx0Y29tbWFuZExpbmU6IG9wdGlvbnMuY29tbWFuZExpbmUuZm9yRGlzcGxheSxcblx0XHRcdFx0XHRwcm9jZXNzT3RoZXJQcmVzZW50ZXJzOiBmYWxzZSxcblx0XHRcdFx0XHRsYW5ndWFnZURpc3BsYXlOYW1lLFxuXHRcdFx0XHR9KSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2Ugd2l0aG91dExhbmd1YWdlIHRpdGxlIHdoZW4gcHJlc2VudGVyIHJldHVybnMgbm8gbGFuZ3VhZ2VEaXNwbGF5TmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGluamVjdE1vY2tQcmVzZW50ZXIocnVuSW5UZXJtaW5hbFRvb2wpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAncm0gZmlsZS50eHQnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1JlbW92ZSBhIGZpbGUnLFxuXHRcdFx0XHRnb2FsOiAnUmVtb3ZlIGEgZmlsZSdcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGNvbW1hbmQgaW4gYGJhc2hgPycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSB3aXRob3V0TGFuZ3VhZ2UgYmFja2dyb3VuZCB0aXRsZSB3aGVuIHByZXNlbnRlciByZXR1cm5zIG5vIGxhbmd1YWdlRGlzcGxheU5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpbmplY3RNb2NrUHJlc2VudGVyKHJ1bkluVGVybWluYWxUb29sKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ25wbSBydW4gd2F0Y2gnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1N0YXJ0IHdhdGNoaW5nJyxcblx0XHRcdFx0Z29hbDogJ1N0YXJ0IHdhdGNoaW5nJyxcblx0XHRcdFx0bW9kZTogJ2FzeW5jJ1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gY29tbWFuZCBpbiBgYmFzaGA/Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIHdpdGhMYW5ndWFnZSB0aXRsZSB3aGVuIHByZXNlbnRlciByZXR1cm5zIGxhbmd1YWdlRGlzcGxheU5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnbm9kZSAtZSBcImNvbnNvbGUubG9nKDEpXCInLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biBub2RlIGNvbW1hbmQnLFxuXHRcdFx0XHRnb2FsOiAnUnVuIG5vZGUgY29tbWFuZCdcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBOb2RlLmpzYCBjb21tYW5kIGluIGBiYXNoYD8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2Ugd2l0aExhbmd1YWdlIGJhY2tncm91bmQgdGl0bGUgd2hlbiBwcmVzZW50ZXIgcmV0dXJucyBsYW5ndWFnZURpc3BsYXlOYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ25vZGUgLWUgXCJjb25zb2xlLmxvZygxKVwiJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdSdW4gbm9kZSBjb21tYW5kJyxcblx0XHRcdFx0Z29hbDogJ1J1biBub2RlIGNvbW1hbmQnLFxuXHRcdFx0XHRtb2RlOiAnYXN5bmMnXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBgTm9kZS5qc2AgY29tbWFuZCBpbiBgYmFzaGA/Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIHdpdGhvdXRMYW5ndWFnZSBpbkRpcmVjdG9yeSB0aXRsZSB3aGVuIHByZXNlbnRlciByZXR1cm5zIG5vIGxhbmd1YWdlRGlzcGxheU5hbWUgd2l0aCBjZCBwcmVmaXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSBVUkkuZmlsZShpc1dpbmRvd3MgPyAnQzpcXFxcd29ya3NwYWNlXFxcXHByb2plY3QnIDogJy93b3Jrc3BhY2UvcHJvamVjdCcpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gbmV3IFdvcmtzcGFjZSgndGVzdCcsIFt0b1dvcmtzcGFjZUZvbGRlcih3b3Jrc3BhY2VGb2xkZXIpXSk7XG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2Uod29ya3NwYWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhpc3RvcnlTZXJ2aWNlLCB7XG5cdFx0XHRcdGdldExhc3RBY3RpdmVXb3Jrc3BhY2VSb290OiAoKSA9PiB3b3Jrc3BhY2VGb2xkZXJcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0b29sV2l0aFdvcmtzcGFjZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UnVuSW5UZXJtaW5hbFRvb2wpKTtcblx0XHRcdGluamVjdE1vY2tQcmVzZW50ZXIodG9vbFdpdGhXb3Jrc3BhY2UpO1xuXG5cdFx0XHRjb25zdCBjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQgPSB7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHtcblx0XHRcdFx0XHRjb21tYW5kOiAnY2QgL3RtcCAmJiBybSBmaWxlLnR4dCcsXG5cdFx0XHRcdFx0ZXhwbGFuYXRpb246ICdSZW1vdmUgYSBmaWxlIGluIC90bXAnLFxuXHRcdFx0XHRcdGdvYWw6ICdSZW1vdmUgYSBmaWxlIGluIC90bXAnLFxuXHRcdFx0XHRcdG1vZGU6ICdzeW5jJyxcblx0XHRcdFx0XHR0aW1lb3V0OiAzMDAwMCxcblx0XHRcdFx0fSBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zXG5cdFx0XHR9IGFzIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dDtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2xXaXRoV29ya3NwYWNlLnByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgYFJ1biBjb21tYW5kIGluIFxcYGJhc2hcXGAgd2l0aGluIFxcYCR7aXNXaW5kb3dzID8gJ1xcXFx0bXAnIDogJ34vdG1wJ31cXGA/YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHNob3cgdW5kZWZpbmVkIGluIGNvbmZpcm1hdGlvbiBtZXNzYWdlIHdoZW4gZXhwbGFuYXRpb24gYW5kIGdvYWwgYXJlIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJhbXM6IFBhcnRpYWw8SVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcz4gPSB7XG5cdFx0XHRcdGNvbW1hbmQ6ICdybSBmaWxlLnR4dCcsXG5cdFx0XHR9O1xuXHRcdFx0ZGVsZXRlIHBhcmFtcy5leHBsYW5hdGlvbjtcblx0XHRcdGRlbGV0ZSBwYXJhbXMuZ29hbDtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdChwYXJhbXMpO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSByZXN1bHQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5tZXNzYWdlO1xuXHRcdFx0b2sobWVzc2FnZSwgJ0V4cGVjdGVkIGNvbmZpcm1hdGlvbiBtZXNzYWdlIHRvIGJlIGRlZmluZWQnKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2VUZXh0ID0gdHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnID8gbWVzc2FnZSA6IG1lc3NhZ2UudmFsdWU7XG5cdFx0XHRvayghbWVzc2FnZVRleHQuaW5jbHVkZXMoJ3VuZGVmaW5lZCcpLCBgQ29uZmlybWF0aW9uIG1lc3NhZ2Ugc2hvdWxkIG5vdCBjb250YWluIFwidW5kZWZpbmVkXCIsIGdvdDogJHttZXNzYWdlVGV4dH1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2Ugd2l0aExhbmd1YWdlIGluRGlyZWN0b3J5IHRpdGxlIHdoZW4gcHJlc2VudGVyIHJldHVybnMgbGFuZ3VhZ2VEaXNwbGF5TmFtZSB3aXRoIGNkIHByZWZpeCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IFVSSS5maWxlKGlzV2luZG93cyA/ICdDOlxcXFx3b3Jrc3BhY2VcXFxccHJvamVjdCcgOiAnL3dvcmtzcGFjZS9wcm9qZWN0Jyk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBuZXcgV29ya3NwYWNlKCd0ZXN0JywgW3RvV29ya3NwYWNlRm9sZGVyKHdvcmtzcGFjZUZvbGRlcildKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh3b3Jrc3BhY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSGlzdG9yeVNlcnZpY2UsIHtcblx0XHRcdFx0Z2V0TGFzdEFjdGl2ZVdvcmtzcGFjZVJvb3Q6ICgpID0+IHdvcmtzcGFjZUZvbGRlclxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRvb2xXaXRoV29ya3NwYWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RSdW5JblRlcm1pbmFsVG9vbCkpO1xuXG5cdFx0XHRjb25zdCBjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQgPSB7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHtcblx0XHRcdFx0XHRjb21tYW5kOiAnY2QgL3RtcCAmJiBub2RlIC1lIFwiY29uc29sZS5sb2coMSlcIicsXG5cdFx0XHRcdFx0ZXhwbGFuYXRpb246ICdSdW4gbm9kZSBjb21tYW5kIGluIC90bXAnLFxuXHRcdFx0XHRcdGdvYWw6ICdSdW4gbm9kZSBjb21tYW5kIGluIC90bXAnLFxuXHRcdFx0XHRcdG1vZGU6ICdzeW5jJyxcblx0XHRcdFx0XHR0aW1lb3V0OiAzMDAwMCxcblx0XHRcdFx0fSBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zXG5cdFx0XHR9IGFzIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dDtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2xXaXRoV29ya3NwYWNlLnByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgYFJ1biBcXGBOb2RlLmpzXFxgIGNvbW1hbmQgaW4gXFxgYmFzaFxcYCB3aXRoaW4gXFxgJHtpc1dpbmRvd3MgPyAnXFxcXHRtcCcgOiAnfi90bXAnfVxcYD9gKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3ByZXBhcmVUb29sSW52b2NhdGlvbiAtIGN1c3RvbSBhY3Rpb25zIGZvciBkcm9wZG93bicsICgpID0+IHtcblxuXHRcdHR5cGUgQWN0aW9uSXRlbVR5cGUgPSB7IHN1YkNvbW1hbmQ6IFNpbmdsZU9yTWFueTxzdHJpbmc+OyBzY29wZTogJ3Nlc3Npb24nIHwgJ3dvcmtzcGFjZScgfCAndXNlcicgfSB8IHsgY29tbWFuZExpbmU6IHRydWU7IHNjb3BlOiAnc2Vzc2lvbicgfCAnd29ya3NwYWNlJyB8ICd1c2VyJyB9IHwgJy0tLScgfCAnY29uZmlndXJlJyB8ICdzZXNzaW9uQXBwcm92YWwnO1xuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0RHJvcGRvd25BY3Rpb25zKHJlc3VsdDogSVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQsIGl0ZW1zOiBBY3Rpb25JdGVtVHlwZVtdKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gcmVzdWx0Py5jb25maXJtYXRpb25NZXNzYWdlcz8udGVybWluYWxDdXN0b21BY3Rpb25zITtcblx0XHRcdG9rKGFjdGlvbnMsICdFeHBlY3RlZCBjdXN0b20gYWN0aW9ucyB0byBiZSBkZWZpbmVkJyk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCBpdGVtcy5sZW5ndGgpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IFtpLCBpdGVtXSBvZiBpdGVtcy5lbnRyaWVzKCkpIHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gYWN0aW9uc1tpXTtcblx0XHRcdFx0aWYgKGl0ZW0gPT09ICctLS0nKSB7XG5cdFx0XHRcdFx0b2soaXNTZXBhcmF0b3IoYWN0aW9uKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b2soIWlzU2VwYXJhdG9yKGFjdGlvbikpO1xuXHRcdFx0XHRcdGlmIChpdGVtID09PSAnY29uZmlndXJlJykge1xuXHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoYWN0aW9uLmxhYmVsLCAnQ29uZmlndXJlIEF1dG8gQXBwcm92ZS4uLicpO1xuXHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoYWN0aW9uLmRhdGEudHlwZSwgJ2NvbmZpZ3VyZScpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXRlbSA9PT0gJ3Nlc3Npb25BcHByb3ZhbCcpIHtcblx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKGFjdGlvbi5sYWJlbCwgJ0FsbG93IEFsbCBDb21tYW5kcyBpbiB0aGlzIFNlc3Npb24nKTtcblx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKGFjdGlvbi5kYXRhLnR5cGUsICdzZXNzaW9uQXBwcm92YWwnKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc0tleShpdGVtLCB7IGNvbW1hbmRMaW5lOiB0cnVlIH0pKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBleHBlY3RlZExhYmVsID0gaXRlbS5zY29wZSA9PT0gJ3Nlc3Npb24nID8gJ0FsbG93IEV4YWN0IENvbW1hbmQgTGluZSBpbiB0aGlzIFNlc3Npb24nXG5cdFx0XHRcdFx0XHRcdDogaXRlbS5zY29wZSA9PT0gJ3dvcmtzcGFjZScgPyAnQWxsb3cgRXhhY3QgQ29tbWFuZCBMaW5lIGluIHRoaXMgV29ya3NwYWNlJ1xuXHRcdFx0XHRcdFx0XHRcdDogJ0Fsd2F5cyBBbGxvdyBFeGFjdCBDb21tYW5kIExpbmUnO1xuXHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoYWN0aW9uLmxhYmVsLCBleHBlY3RlZExhYmVsKTtcblx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKGFjdGlvbi5kYXRhLnR5cGUsICduZXdSdWxlJyk7XG5cdFx0XHRcdFx0XHRvayghQXJyYXkuaXNBcnJheShhY3Rpb24uZGF0YS5ydWxlKSwgJ0V4cGVjdGVkIHJ1bGUgdG8gYmUgYW4gb2JqZWN0Jyk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IHN1YkNvbW1hbmRMYWJlbCA9IEFycmF5LmlzQXJyYXkoaXRlbS5zdWJDb21tYW5kKVxuXHRcdFx0XHRcdFx0XHQ/IGBDb21tYW5kcyAke2l0ZW0uc3ViQ29tbWFuZC5tYXAoZSA9PiBgXFxgJHtlfSBcXHUyMDI2XFxgYCkuam9pbignLCAnKX1gXG5cdFx0XHRcdFx0XHRcdDogYFxcYCR7aXRlbS5zdWJDb21tYW5kfSBcXHUyMDI2XFxgYDtcblx0XHRcdFx0XHRcdGNvbnN0IGV4cGVjdGVkTGFiZWwgPSBpdGVtLnNjb3BlID09PSAnc2Vzc2lvbicgPyBgQWxsb3cgJHtzdWJDb21tYW5kTGFiZWx9IGluIHRoaXMgU2Vzc2lvbmBcblx0XHRcdFx0XHRcdFx0OiBpdGVtLnNjb3BlID09PSAnd29ya3NwYWNlJyA/IGBBbGxvdyAke3N1YkNvbW1hbmRMYWJlbH0gaW4gdGhpcyBXb3Jrc3BhY2VgXG5cdFx0XHRcdFx0XHRcdFx0OiBgQWx3YXlzIEFsbG93ICR7c3ViQ29tbWFuZExhYmVsfWA7XG5cdFx0XHRcdFx0XHRzdHJpY3RFcXVhbChhY3Rpb24ubGFiZWwsIGV4cGVjdGVkTGFiZWwpO1xuXHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoYWN0aW9uLmRhdGEudHlwZSwgJ25ld1J1bGUnKTtcblx0XHRcdFx0XHRcdG9rKEFycmF5LmlzQXJyYXkoYWN0aW9uLmRhdGEucnVsZSksICdFeHBlY3RlZCBydWxlIHRvIGJlIGFuIGFycmF5Jyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2hvdWxkIGdlbmVyYXRlIGN1c3RvbSBhY3Rpb25zIGZvciBub24tYXV0by1hcHByb3ZlZCBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0bHM6IHRydWUsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdCdWlsZCB0aGUgcHJvamVjdCcsXG5cdFx0XHRcdGdvYWw6ICdCdWlsZCB0aGUgcHJvamVjdCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYGJhc2hgIGNvbW1hbmQ/Jyk7XG5cdFx0XHRhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ25wbSBydW4gYnVpbGQnLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ25wbSBydW4gYnVpbGQnLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnbnBtIHJ1biBidWlsZCcsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdzZXNzaW9uQXBwcm92YWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2NvbmZpZ3VyZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBnZW5lcmF0ZSBjdXN0b20gYWN0aW9ucyBmb3Igc2luZ2xlIHdvcmQgY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnZm9vJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdSdW4gZm9vIGNvbW1hbmQnLFxuXHRcdFx0XHRnb2FsOiAnUnVuIGZvbyBjb21tYW5kJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ2ZvbycsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnZm9vJywgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ2ZvbycsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnc2Vzc2lvbkFwcHJvdmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdjb25maWd1cmUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGdlbmVyYXRlIGN1c3RvbSBhY3Rpb25zIGZvciBhdXRvLWFwcHJvdmVkIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRucG06IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ25wbSBydW4gYnVpbGQnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ0J1aWxkIHRoZSBwcm9qZWN0Jyxcblx0XHRcdFx0Z29hbDogJ0J1aWxkIHRoZSBwcm9qZWN0J1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChyZXN1bHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG9ubHkgZ2VuZXJhdGUgY29uZmlndXJlIGFjdGlvbiBmb3IgZXhwbGljaXRseSBkZW5pZWQgY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdG5wbTogeyBhcHByb3ZlOiBmYWxzZSB9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdCdWlsZCB0aGUgcHJvamVjdCcsXG5cdFx0XHRcdGdvYWw6ICdCdWlsZCB0aGUgcHJvamVjdCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYGJhc2hgIGNvbW1hbmQ/Jyk7XG5cdFx0XHRhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdCdzZXNzaW9uQXBwcm92YWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2NvbmZpZ3VyZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgJiYgaW4gY29tbWFuZCBsaW5lIGxhYmVscyB3aXRoIHByb3BlciBtbmVtb25pYyBlc2NhcGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gaW5zdGFsbCAmJiBucG0gcnVuIGJ1aWxkJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdJbnN0YWxsIGRlcGVuZGVuY2llcyBhbmQgYnVpbGQnLFxuXHRcdFx0XHRnb2FsOiAnSW5zdGFsbCBkZXBlbmRlbmNpZXMgYW5kIGJ1aWxkJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBgYmFzaGAgY29tbWFuZD8nKTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiBbJ25wbSBpbnN0YWxsJywgJ25wbSBydW4gYnVpbGQnXSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6IFsnbnBtIGluc3RhbGwnLCAnbnBtIHJ1biBidWlsZCddLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiBbJ25wbSBpbnN0YWxsJywgJ25wbSBydW4gYnVpbGQnXSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBzaG93IGFwcHJvdmVkIGNvbW1hbmRzIGluIGN1c3RvbSBhY3Rpb25zIGRyb3Bkb3duJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRoZWFkOiB0cnVlICAvLyBoZWFkIGlzIGFwcHJvdmVkIGJ5IGRlZmF1bHQgaW4gcmVhbCBzY2VuYXJpb1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnZm9vIHwgaGVhZCAtMjAnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biBmb28gY29tbWFuZCBhbmQgc2hvdyBmaXJzdCAyMCBsaW5lcycsXG5cdFx0XHRcdGdvYWw6ICdSdW4gZm9vIGNvbW1hbmQgYW5kIHNob3cgZmlyc3QgMjAgbGluZXMnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kPycpO1xuXHRcdFx0YXNzZXJ0RHJvcGRvd25BY3Rpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICdmb28nLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ2ZvbycsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICdmb28nLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnc2Vzc2lvbkFwcHJvdmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdjb25maWd1cmUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHNob3cgYW55IGNvbW1hbmQtc3BlY2lmaWMgYWN0aW9ucyB3aGVuIGFsbCBzdWItY29tbWFuZHMgYXJlIGFwcHJvdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRmb286IHRydWUsXG5cdFx0XHRcdGhlYWQ6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ2ZvbyB8IGhlYWQgLTIwJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdSdW4gZm9vIGNvbW1hbmQgYW5kIHNob3cgZmlyc3QgMjAgbGluZXMnLFxuXHRcdFx0XHRnb2FsOiAnUnVuIGZvbyBjb21tYW5kIGFuZCBzaG93IGZpcnN0IDIwIGxpbmVzJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChyZXN1bHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtaXhlZCBhcHByb3ZlZCBhbmQgdW5hcHByb3ZlZCBjb21tYW5kcyBjb3JyZWN0bHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdGhlYWQ6IHRydWUsXG5cdFx0XHRcdHRhaWw6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ2ZvbyB8IGhlYWQgLTIwICYmIGJhciB8IHRhaWwgLTEwJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdSdW4gbXVsdGlwbGUgcGlwZWQgY29tbWFuZHMnLFxuXHRcdFx0XHRnb2FsOiAnUnVuIG11bHRpcGxlIHBpcGVkIGNvbW1hbmRzJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBgYmFzaGAgY29tbWFuZD8nKTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiBbJ2ZvbycsICdiYXInXSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6IFsnZm9vJywgJ2JhciddLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiBbJ2ZvbycsICdiYXInXSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN1Z2dlc3Qgc3ViY29tbWFuZCBmb3IgZ2l0IGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ2dpdCBzdGF0dXMnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ0NoZWNrIGdpdCBzdGF0dXMnLFxuXHRcdFx0XHRnb2FsOiAnQ2hlY2sgZ2l0IHN0YXR1cydcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0RHJvcGRvd25BY3Rpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICdnaXQgc3RhdHVzJywgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICdnaXQgc3RhdHVzJywgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ2dpdCBzdGF0dXMnLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnc2Vzc2lvbkFwcHJvdmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdjb25maWd1cmUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCBzdWJjb21tYW5kIGZvciBucG0gY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnbnBtIHRlc3QnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biBucG0gdGVzdHMnLFxuXHRcdFx0XHRnb2FsOiAnUnVuIG5wbSB0ZXN0cydcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0RHJvcGRvd25BY3Rpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICducG0gdGVzdCcsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnbnBtIHRlc3QnLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnbnBtIHRlc3QnLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnc2Vzc2lvbkFwcHJvdmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdjb25maWd1cmUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCAzLXBhcnQgc3ViY29tbWFuZCBmb3IgbnBtIHJ1biBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdSdW4gYnVpbGQgc2NyaXB0Jyxcblx0XHRcdFx0Z29hbDogJ1J1biBidWlsZCBzY3JpcHQnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnbnBtIHJ1biBidWlsZCcsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnbnBtIHJ1biBidWlsZCcsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkJywgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN1Z2dlc3QgMy1wYXJ0IHN1YmNvbW1hbmQgZm9yIHlhcm4gcnVuIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ3lhcm4gcnVuIHRlc3QnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biB0ZXN0IHNjcmlwdCcsXG5cdFx0XHRcdGdvYWw6ICdSdW4gdGVzdCBzY3JpcHQnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAneWFybiBydW4gdGVzdCcsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAneWFybiBydW4gdGVzdCcsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICd5YXJuIHJ1biB0ZXN0Jywgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBzdWdnZXN0IHN1YmNvbW1hbmQgZm9yIGNvbW1hbmRzIHdpdGggZmxhZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnZm9vIC0tZm9vIC0tYmFyJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdSdW4gZm9vIHdpdGggZmxhZ3MnLFxuXHRcdFx0XHRnb2FsOiAnUnVuIGZvbyB3aXRoIGZsYWdzJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ2ZvbycsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnZm9vJywgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ2ZvbycsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdzZXNzaW9uQXBwcm92YWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2NvbmZpZ3VyZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3Qgc3VnZ2VzdCBzdWJjb21tYW5kIGZvciBucG0gcnVuIHdpdGggZmxhZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnbnBtIHJ1biBhYmMgLS1zb21lLWZsYWcnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biBucG0gcnVuIGFiYyB3aXRoIGZsYWdzJyxcblx0XHRcdFx0Z29hbDogJ1J1biBucG0gcnVuIGFiYyB3aXRoIGZsYWdzJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ25wbSBydW4gYWJjJywgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICducG0gcnVuIGFiYycsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICducG0gcnVuIGFiYycsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdzZXNzaW9uQXBwcm92YWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2NvbmZpZ3VyZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWl4ZWQgbnBtIHJ1biBhbmQgb3RoZXIgY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnbnBtIHJ1biBidWlsZCAmJiBnaXQgc3RhdHVzJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdCdWlsZCBhbmQgY2hlY2sgc3RhdHVzJyxcblx0XHRcdFx0Z29hbDogJ0J1aWxkIGFuZCBjaGVjayBzdGF0dXMnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiBbJ25wbSBydW4gYnVpbGQnLCAnZ2l0IHN0YXR1cyddLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogWyducG0gcnVuIGJ1aWxkJywgJ2dpdCBzdGF0dXMnXSwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogWyducG0gcnVuIGJ1aWxkJywgJ2dpdCBzdGF0dXMnXSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN1Z2dlc3QgbWl4ZWQgc3ViY29tbWFuZHMgYW5kIGJhc2UgY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnZ2l0IHB1c2ggJiYgZWNobyBcImRvbmVcIicsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnUHVzaCBhbmQgcHJpbnQgZG9uZScsXG5cdFx0XHRcdGdvYWw6ICdQdXNoIGFuZCBwcmludCBkb25lJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogWydnaXQgcHVzaCcsICdlY2hvJ10sIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiBbJ2dpdCBwdXNoJywgJ2VjaG8nXSwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogWydnaXQgcHVzaCcsICdlY2hvJ10sIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdzZXNzaW9uQXBwcm92YWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2NvbmZpZ3VyZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdWdnZXN0IHN1YmNvbW1hbmRzIGZvciBtdWx0aXBsZSBnaXQgY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnZ2l0IHN0YXR1cyAmJiBnaXQgbG9nIC0tb25lbGluZScsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnQ2hlY2sgc3RhdHVzIGFuZCBsb2cnLFxuXHRcdFx0XHRnb2FsOiAnQ2hlY2sgc3RhdHVzIGFuZCBsb2cnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiBbJ2dpdCBzdGF0dXMnLCAnZ2l0IGxvZyddLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogWydnaXQgc3RhdHVzJywgJ2dpdCBsb2cnXSwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogWydnaXQgc3RhdHVzJywgJ2dpdCBsb2cnXSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN1Z2dlc3QgYmFzZSBjb21tYW5kIGZvciBub24tc3ViY29tbWFuZCB0b29scycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdmb28gYmFyJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdEb3dubG9hZCBmcm9tIGV4YW1wbGUuY29tJyxcblx0XHRcdFx0Z29hbDogJ0Rvd25sb2FkIGZyb20gZXhhbXBsZS5jb20nXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnZm9vJywgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICdmb28nLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnZm9vJywgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBzaW5nbGUgd29yZCBjb21tYW5kcyBmcm9tIHN1YmNvbW1hbmQtYXdhcmUgdG9vbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnZ2l0Jyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdSdW4gZ2l0IGNvbW1hbmQnLFxuXHRcdFx0XHRnb2FsOiAnUnVuIGdpdCBjb21tYW5kJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdCdzZXNzaW9uQXBwcm92YWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2NvbmZpZ3VyZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZWR1cGxpY2F0ZSBpZGVudGljYWwgc3ViY29tbWFuZCBzdWdnZXN0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gdGVzdCAmJiBucG0gdGVzdCAtLXZlcmJvc2UnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biB0ZXN0cyB0d2ljZScsXG5cdFx0XHRcdGdvYWw6ICdSdW4gdGVzdHMgdHdpY2UnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnbnBtIHRlc3QnLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ25wbSB0ZXN0Jywgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ25wbSB0ZXN0Jywgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBmbGFncyBkaWZmZXJlbnRseSB0aGFuIHN1YmNvbW1hbmRzIGZvciBzdWdnZXN0aW9uIGxvZ2ljJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ2ZvbyAtLXZlcnNpb24nLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ0NoZWNrIGZvbyB2ZXJzaW9uJyxcblx0XHRcdFx0Z29hbDogJ0NoZWNrIGZvbyB2ZXJzaW9uJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ2ZvbycsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnZm9vJywgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ2ZvbycsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdzZXNzaW9uQXBwcm92YWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2NvbmZpZ3VyZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3Qgc3VnZ2VzdCBvdmVybHkgcGVybWlzc2l2ZSBzdWJjb21tYW5kIHJ1bGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ2Jhc2ggLWMgXCJlY2hvIGhlbGxvXCInLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biBiYXNoIGNvbW1hbmQnLFxuXHRcdFx0XHRnb2FsOiAnUnVuIGJhc2ggY29tbWFuZCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0RHJvcGRvd25BY3Rpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnc2Vzc2lvbkFwcHJvdmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdjb25maWd1cmUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHNob3cgY29tbWFuZCBsaW5lIG9wdGlvbiB3aGVuIGl0XFwncyByZWplY3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0ZWNobzogdHJ1ZSxcblx0XHRcdFx0Jy9cXFxcKC4rXFxcXCkvcyc6IHsgYXBwcm92ZTogZmFsc2UsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIChhYmMpJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdCdzZXNzaW9uQXBwcm92YWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2NvbmZpZ3VyZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBwcmV2ZW50IGF1dG8gYXBwcm92YWwgd2hlbiB3cml0aW5nIHRvIGEgZmlsZSBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRDb25maWcoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5CbG9ja0RldGVjdGVkRmlsZVdyaXRlcywgJ291dHNpZGVXb3Jrc3BhY2UnKTtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHt9KTtcblxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gVVJJLmZpbGUoaXNXaW5kb3dzID8gJ0M6L3dvcmtzcGFjZS9wcm9qZWN0JyA6ICcvd29ya3NwYWNlL3Byb2plY3QnKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IG5ldyBXb3Jrc3BhY2UoJ3Rlc3QnLCBbdG9Xb3Jrc3BhY2VGb2xkZXIod29ya3NwYWNlRm9sZGVyKV0pO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHdvcmtzcGFjZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElIaXN0b3J5U2VydmljZSwge1xuXHRcdFx0XHRnZXRMYXN0QWN0aXZlV29ya3NwYWNlUm9vdDogKCkgPT4gd29ya3NwYWNlRm9sZGVyXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gXCJhYmNcIiA+IC4uL2ZpbGUudHh0J1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50ZXJtaW5hbEN1c3RvbUFjdGlvbnMsIHVuZGVmaW5lZCwgJ0V4cGVjdGVkIG5vIGN1c3RvbSBhY3Rpb25zIHdoZW4gZmlsZSB3cml0ZSBpcyBibG9ja2VkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjaGF0IHNlc3Npb24gZGlzcG9zYWwgY2xlYW51cCcsICgpID0+IHtcblx0XHRjb25zdCBjcmVhdGVNb2NrVGVybWluYWwgPSAocHJvY2Vzc0lkOiBudW1iZXIpOiBJVGVybWluYWxJbnN0YW5jZSA9PiAoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyAvKiBNb2NrIGRpc3Bvc2UgKi8gfSxcblx0XHRcdHByb2Nlc3NJZFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzdG9yZSBhbGwgdGVybWluYWxzIGludG8gdGhlIHNlc3Npb24gdGVybWluYWwgbWFwIGFuZCBkaXNwb3NlIHRoZW0gd2hlbiBhcmNoaXZlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25JZCA9ICd0ZXN0LXNlc3Npb24tcmVzdG9yZWQtYXJjaGl2ZSc7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkKTtcblxuXHRcdFx0bGV0IHRlcm1pbmFsMURpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRsZXQgdGVybWluYWwyRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsMURpc3Bvc2VkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbDJEaXNwb3NlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdFx0Y29uc3QgbW9ja1Rlcm1pbmFsMSA9IHtcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdHRlcm1pbmFsMURpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0XHR0ZXJtaW5hbDFEaXNwb3NlZEVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkRpc3Bvc2VkOiB0ZXJtaW5hbDFEaXNwb3NlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdHByb2Nlc3NJZDogNTU1NTUsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0XHRjb25zdCBtb2NrVGVybWluYWwyID0ge1xuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGVybWluYWwyRGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHRlcm1pbmFsMkRpc3Bvc2VkRW1pdHRlci5maXJlKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRGlzcG9zZWQ6IHRlcm1pbmFsMkRpc3Bvc2VkRW1pdHRlci5ldmVudCxcblx0XHRcdFx0cHJvY2Vzc0lkOiA2NjY2Nixcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblxuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2NoYXQudGVybWluYWxTZXNzaW9ucycsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0W21vY2tUZXJtaW5hbDEucHJvY2Vzc0lkIV06IHtcblx0XHRcdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRcdFx0aWQ6ICdyZXN0b3JlZC0xJyxcblx0XHRcdFx0XHRzaGVsbEludGVncmF0aW9uUXVhbGl0eTogU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHkuTm9uZSxcblx0XHRcdFx0XHRpc0JhY2tncm91bmQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFttb2NrVGVybWluYWwyLnByb2Nlc3NJZCFdOiB7XG5cdFx0XHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0XHRcdGlkOiAncmVzdG9yZWQtMicsXG5cdFx0XHRcdFx0c2hlbGxJbnRlZ3JhdGlvblF1YWxpdHk6IFNoZWxsSW50ZWdyYXRpb25RdWFsaXR5Lk5vbmUsXG5cdFx0XHRcdFx0aXNCYWNrZ3JvdW5kOiBmYWxzZSxcblx0XHRcdFx0fVxuXHRcdFx0fSksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsU2VydmljZSwge1xuXHRcdFx0XHRvbkRpZERpc3Bvc2VJbnN0YW5jZTogdGVybWluYWxTZXJ2aWNlRGlzcG9zZUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdGluc3RhbmNlczogW21vY2tUZXJtaW5hbDEsIG1vY2tUZXJtaW5hbDJdLFxuXHRcdFx0XHRmb3JlZ3JvdW5kSW5zdGFuY2VzOiBbXSxcblx0XHRcdFx0c2V0TmV4dENvbW1hbmRJZDogYXN5bmMgKCkgPT4geyB9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdG9yZWRSdW5JblRlcm1pbmFsVG9vbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UnVuSW5UZXJtaW5hbFRvb2wpKTtcblx0XHRcdGNvbnN0IHJlc3RvcmVkU2Vzc2lvblRlcm1pbmFscyA9IHJlc3RvcmVkUnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdG9yZWRTZXNzaW9uVGVybWluYWxzPy5zaXplLCAyLCAnQm90aCByZXN0b3JlZCB0ZXJtaW5hbHMgc2hvdWxkIGJlIHRyYWNrZWQgZm9yIHRoZSBzZXNzaW9uJyk7XG5cblx0XHRcdGNoYXRTZXNzaW9uQXJjaGl2ZWRFbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudFNlc3Npb24pO1xuXG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbDFEaXNwb3NlZCwgdHJ1ZSwgJ1Jlc3RvcmVkIGJhY2tncm91bmQgdGVybWluYWwgc2hvdWxkIGhhdmUgYmVlbiBkaXNwb3NlZCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWwyRGlzcG9zZWQsIHRydWUsICdSZXN0b3JlZCBmb3JlZ3JvdW5kIHRlcm1pbmFsIHNob3VsZCBoYXZlIGJlZW4gZGlzcG9zZWQnKTtcblx0XHRcdG9rKCFyZXN0b3JlZFJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5oYXMoc2Vzc2lvblJlc291cmNlKSwgJ0ZvcmVncm91bmQgdGVybWluYWwgYXNzb2NpYXRpb24gc2hvdWxkIGJlIHJlbW92ZWQgYWZ0ZXIgYXJjaGl2ZScpO1xuXHRcdFx0b2soIXJlc3RvcmVkUnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzLmhhcyhzZXNzaW9uUmVzb3VyY2UpLCAnQWxsIHJlc3RvcmVkIHRlcm1pbmFscyBmb3IgdGhlIHNlc3Npb24gc2hvdWxkIGJlIHJlbW92ZWQgYWZ0ZXIgYXJjaGl2ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRpc3Bvc2UgYWxsIHRlcm1pbmFscyBhc3NvY2lhdGVkIHdpdGggYSBzaW5nbGUgY2hhdCBzZXNzaW9uIHdoZW4gYXJjaGl2ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1zZXNzaW9uLWFyY2hpdmUnO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCBtb2NrVGVybWluYWwxID0geyBkaXNwb3NlOiAoKSA9PiB7IC8qIE1vY2sgZGlzcG9zZSAqLyB9LCBwcm9jZXNzSWQ6IDMzMzMzIH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblx0XHRcdGNvbnN0IG1vY2tUZXJtaW5hbDIgPSB7IGRpc3Bvc2U6ICgpID0+IHsgLyogTW9jayBkaXNwb3NlICovIH0sIHByb2Nlc3NJZDogNDQ0NDQgfSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXG5cdFx0XHRsZXQgdGVybWluYWwxRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdGxldCB0ZXJtaW5hbDJEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0bW9ja1Rlcm1pbmFsMS5kaXNwb3NlID0gKCkgPT4geyB0ZXJtaW5hbDFEaXNwb3NlZCA9IHRydWU7IH07XG5cdFx0XHRtb2NrVGVybWluYWwyLmRpc3Bvc2UgPSAoKSA9PiB7IHRlcm1pbmFsMkRpc3Bvc2VkID0gdHJ1ZTsgfTtcblxuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLnNldChzZXNzaW9uUmVzb3VyY2UsIHtcblx0XHRcdFx0aW5zdGFuY2U6IG1vY2tUZXJtaW5hbDIsXG5cdFx0XHRcdHNoZWxsSW50ZWdyYXRpb25RdWFsaXR5OiBTaGVsbEludGVncmF0aW9uUXVhbGl0eS5Ob25lXG5cdFx0XHR9KTtcblx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEluc3RhbmNlcy5zZXQoc2Vzc2lvblJlc291cmNlLCBuZXcgU2V0KFttb2NrVGVybWluYWwxLCBtb2NrVGVybWluYWwyXSkpO1xuXG5cdFx0XHQvLyBJbml0aWFsaXplIGxhenkgYXJjaGl2ZSBsaXN0ZW5lciBiZWZvcmUgZmlyaW5nIHRoZSBhcmNoaXZlIGV2ZW50LlxuXHRcdFx0Y29uc3QgZW5zdXJlQXJjaGl2ZWRTZXNzaW9uTGlzdGVuZXIgPSAocnVuSW5UZXJtaW5hbFRvb2wgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCAoKSA9PiB2b2lkPilbJ19lbnN1cmVBcmNoaXZlZFNlc3Npb25MaXN0ZW5lciddO1xuXHRcdFx0ZW5zdXJlQXJjaGl2ZWRTZXNzaW9uTGlzdGVuZXIuY2FsbChydW5JblRlcm1pbmFsVG9vbCk7XG5cblx0XHRcdGNoYXRTZXNzaW9uQXJjaGl2ZWRFbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudFNlc3Npb24pO1xuXG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbDFEaXNwb3NlZCwgdHJ1ZSwgJ1Rlcm1pbmFsIDEgc2hvdWxkIGhhdmUgYmVlbiBkaXNwb3NlZCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWwyRGlzcG9zZWQsIHRydWUsICdUZXJtaW5hbCAyIHNob3VsZCBoYXZlIGJlZW4gZGlzcG9zZWQnKTtcblx0XHRcdG9rKCFydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuaGFzKHNlc3Npb25SZXNvdXJjZSksICdUZXJtaW5hbCBhc3NvY2lhdGlvbiBzaG91bGQgYmUgcmVtb3ZlZCBhZnRlciBhcmNoaXZlJyk7XG5cdFx0XHRvayghcnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzLmhhcyhzZXNzaW9uUmVzb3VyY2UpLCAnQWxsIHRyYWNrZWQgdGVybWluYWxzIGZvciB0aGUgc2Vzc2lvbiBzaG91bGQgYmUgcmVtb3ZlZCBhZnRlciBhcmNoaXZlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGFjY2VzcyBhZ2VudCBzZXNzaW9ucyBtb2RlbCB3aGVuIGluaXRpYWxpemluZyBhcmNoaXZlIGxpc3RlbmVyJywgKCkgPT4ge1xuXHRcdFx0bGV0IG1vZGVsQWNjZXNzZWQgPSBmYWxzZTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLCB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGU6IGNoYXRTZXNzaW9uQXJjaGl2ZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRnZXQgbW9kZWwoKSB7XG5cdFx0XHRcdFx0bW9kZWxBY2Nlc3NlZCA9IHRydWU7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdtb2RlbCBzaG91bGQgbm90IGJlIGFjY2Vzc2VkIHdoZW4gd2lyaW5nIGFyY2hpdmUgbGlzdGVuZXInKTtcblx0XHRcdFx0fSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRTZXNzaW9uc1NlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBub01vZGVsQWNjZXNzUnVuSW5UZXJtaW5hbFRvb2wgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFJ1bkluVGVybWluYWxUb29sKSk7XG5cdFx0XHRjb25zdCBlbnN1cmVBcmNoaXZlZFNlc3Npb25MaXN0ZW5lciA9IChub01vZGVsQWNjZXNzUnVuSW5UZXJtaW5hbFRvb2wgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCAoKSA9PiB2b2lkPilbJ19lbnN1cmVBcmNoaXZlZFNlc3Npb25MaXN0ZW5lciddO1xuXHRcdFx0ZW5zdXJlQXJjaGl2ZWRTZXNzaW9uTGlzdGVuZXIuY2FsbChub01vZGVsQWNjZXNzUnVuSW5UZXJtaW5hbFRvb2wpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChtb2RlbEFjY2Vzc2VkLCBmYWxzZSwgJ0FnZW50IHNlc3Npb25zIG1vZGVsIHNob3VsZCBub3QgYmUgYWNjZXNzZWQgd2hlbiBpbml0aWFsaXppbmcgYXJjaGl2ZSBsaXN0ZW5lcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRpc3Bvc2UgYWxsIHRlcm1pbmFscyBhc3NvY2lhdGVkIHdpdGggYSBzaW5nbGUgY2hhdCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3Qtc2Vzc2lvbi1tdWx0aXBsZS10ZXJtaW5hbHMnO1xuXHRcdFx0Y29uc3QgbW9ja1Rlcm1pbmFsMSA9IGNyZWF0ZU1vY2tUZXJtaW5hbCgxMTExMSk7XG5cdFx0XHRjb25zdCBtb2NrVGVybWluYWwyID0gY3JlYXRlTW9ja1Rlcm1pbmFsKDIyMjIyKTtcblxuXHRcdFx0bGV0IHRlcm1pbmFsMURpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRsZXQgdGVybWluYWwyRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdG1vY2tUZXJtaW5hbDEuZGlzcG9zZSA9ICgpID0+IHsgdGVybWluYWwxRGlzcG9zZWQgPSB0cnVlOyB9O1xuXHRcdFx0bW9ja1Rlcm1pbmFsMi5kaXNwb3NlID0gKCkgPT4geyB0ZXJtaW5hbDJEaXNwb3NlZCA9IHRydWU7IH07XG5cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLnNldChzZXNzaW9uUmVzb3VyY2UsIHtcblx0XHRcdFx0aW5zdGFuY2U6IG1vY2tUZXJtaW5hbDIsXG5cdFx0XHRcdHNoZWxsSW50ZWdyYXRpb25RdWFsaXR5OiBTaGVsbEludGVncmF0aW9uUXVhbGl0eS5Ob25lXG5cdFx0XHR9KTtcblx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEluc3RhbmNlcy5zZXQoc2Vzc2lvblJlc291cmNlLCBuZXcgU2V0KFttb2NrVGVybWluYWwxLCBtb2NrVGVybWluYWwyXSkpO1xuXG5cdFx0XHRjaGF0U2VydmljZURpc3Bvc2VFbWl0dGVyLmZpcmUoeyBzZXNzaW9uUmVzb3VyY2VzOiBbc2Vzc2lvblJlc291cmNlXSwgcmVhc29uOiAnY2xlYXJlZCcgfSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsMURpc3Bvc2VkLCB0cnVlLCAnVGVybWluYWwgMSBzaG91bGQgaGF2ZSBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbDJEaXNwb3NlZCwgdHJ1ZSwgJ1Rlcm1pbmFsIDIgc2hvdWxkIGhhdmUgYmVlbiBkaXNwb3NlZCcpO1xuXHRcdFx0b2soIXJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5oYXMoc2Vzc2lvblJlc291cmNlKSwgJ1Rlcm1pbmFsIGFzc29jaWF0aW9uIHNob3VsZCBiZSByZW1vdmVkIGFmdGVyIGRpc3Bvc2FsJyk7XG5cdFx0XHRvayghcnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzLmhhcyhzZXNzaW9uUmVzb3VyY2UpLCAnQWxsIHRyYWNrZWQgdGVybWluYWxzIGZvciB0aGUgc2Vzc2lvbiBzaG91bGQgYmUgcmVtb3ZlZCBhZnRlciBkaXNwb3NhbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRpc3Bvc2UgYXNzb2NpYXRlZCB0ZXJtaW5hbHMgd2hlbiBjaGF0IHNlc3Npb24gaXMgZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1zZXNzaW9uLTEyMyc7XG5cdFx0XHRjb25zdCBtb2NrVGVybWluYWwgPSBjcmVhdGVNb2NrVGVybWluYWwoMTIzNDUpO1xuXHRcdFx0bGV0IHRlcm1pbmFsRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdG1vY2tUZXJtaW5hbC5kaXNwb3NlID0gKCkgPT4geyB0ZXJtaW5hbERpc3Bvc2VkID0gdHJ1ZTsgfTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHRydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuc2V0KHNlc3Npb25SZXNvdXJjZSwge1xuXHRcdFx0XHRpbnN0YW5jZTogbW9ja1Rlcm1pbmFsLFxuXHRcdFx0XHRzaGVsbEludGVncmF0aW9uUXVhbGl0eTogU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHkuTm9uZVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5oYXMoc2Vzc2lvblJlc291cmNlKSwgJ1Rlcm1pbmFsIGFzc29jaWF0aW9uIHNob3VsZCBleGlzdCBiZWZvcmUgZGlzcG9zYWwnKTtcblxuXHRcdFx0Y2hhdFNlcnZpY2VEaXNwb3NlRW1pdHRlci5maXJlKHsgc2Vzc2lvblJlc291cmNlczogW3Nlc3Npb25SZXNvdXJjZV0sIHJlYXNvbjogJ2NsZWFyZWQnIH0pO1xuXG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERpc3Bvc2VkLCB0cnVlLCAnVGVybWluYWwgc2hvdWxkIGhhdmUgYmVlbiBkaXNwb3NlZCcpO1xuXHRcdFx0b2soIXJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5oYXMoc2Vzc2lvblJlc291cmNlKSwgJ1Rlcm1pbmFsIGFzc29jaWF0aW9uIHNob3VsZCBiZSByZW1vdmVkIGFmdGVyIGRpc3Bvc2FsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGFmZmVjdCBvdGhlciBzZXNzaW9ucyB3aGVuIG9uZSBzZXNzaW9uIGlzIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkMSA9ICd0ZXN0LXNlc3Npb24tMSc7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQyID0gJ3Rlc3Qtc2Vzc2lvbi0yJztcblx0XHRcdGNvbnN0IG1vY2tUZXJtaW5hbDEgPSBjcmVhdGVNb2NrVGVybWluYWwoMTIzNDUpO1xuXHRcdFx0Y29uc3QgbW9ja1Rlcm1pbmFsMiA9IGNyZWF0ZU1vY2tUZXJtaW5hbCg2Nzg5MCk7XG5cblx0XHRcdGxldCB0ZXJtaW5hbDFEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0bGV0IHRlcm1pbmFsMkRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRtb2NrVGVybWluYWwxLmRpc3Bvc2UgPSAoKSA9PiB7IHRlcm1pbmFsMURpc3Bvc2VkID0gdHJ1ZTsgfTtcblx0XHRcdG1vY2tUZXJtaW5hbDIuZGlzcG9zZSA9ICgpID0+IHsgdGVybWluYWwyRGlzcG9zZWQgPSB0cnVlOyB9O1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UxID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZDEpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlMiA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihzZXNzaW9uSWQyKTtcblx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5zZXQoc2Vzc2lvblJlc291cmNlMSwge1xuXHRcdFx0XHRpbnN0YW5jZTogbW9ja1Rlcm1pbmFsMSxcblx0XHRcdFx0c2hlbGxJbnRlZ3JhdGlvblF1YWxpdHk6IFNoZWxsSW50ZWdyYXRpb25RdWFsaXR5Lk5vbmVcblx0XHRcdH0pO1xuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLnNldChzZXNzaW9uUmVzb3VyY2UyLCB7XG5cdFx0XHRcdGluc3RhbmNlOiBtb2NrVGVybWluYWwyLFxuXHRcdFx0XHRzaGVsbEludGVncmF0aW9uUXVhbGl0eTogU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHkuTm9uZVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5oYXMoc2Vzc2lvblJlc291cmNlMSksICdTZXNzaW9uIDEgdGVybWluYWwgYXNzb2NpYXRpb24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRvayhydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuaGFzKHNlc3Npb25SZXNvdXJjZTIpLCAnU2Vzc2lvbiAyIHRlcm1pbmFsIGFzc29jaWF0aW9uIHNob3VsZCBleGlzdCcpO1xuXG5cdFx0XHRjaGF0U2VydmljZURpc3Bvc2VFbWl0dGVyLmZpcmUoeyBzZXNzaW9uUmVzb3VyY2VzOiBbc2Vzc2lvblJlc291cmNlMV0sIHJlYXNvbjogJ2NsZWFyZWQnIH0pO1xuXG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbDFEaXNwb3NlZCwgdHJ1ZSwgJ1Rlcm1pbmFsIDEgc2hvdWxkIGhhdmUgYmVlbiBkaXNwb3NlZCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWwyRGlzcG9zZWQsIGZhbHNlLCAnVGVybWluYWwgMiBzaG91bGQgTk9UIGhhdmUgYmVlbiBkaXNwb3NlZCcpO1xuXHRcdFx0b2soIXJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5oYXMoc2Vzc2lvblJlc291cmNlMSksICdTZXNzaW9uIDEgdGVybWluYWwgYXNzb2NpYXRpb24gc2hvdWxkIGJlIHJlbW92ZWQnKTtcblx0XHRcdG9rKHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5oYXMoc2Vzc2lvblJlc291cmNlMiksICdTZXNzaW9uIDIgdGVybWluYWwgYXNzb2NpYXRpb24gc2hvdWxkIHJlbWFpbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBkaXNwb3NlIHVzZXItcmV2ZWFsZWQgdGVybWluYWxzIHdoZW4gY2hhdCBzZXNzaW9uIGlzIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3Qtc2Vzc2lvbi1yZXZlYWxlZCc7XG5cdFx0XHRjb25zdCBtb2NrVGVybWluYWwxID0gY3JlYXRlTW9ja1Rlcm1pbmFsKDExMTExKTtcblx0XHRcdGNvbnN0IG1vY2tUZXJtaW5hbDIgPSBjcmVhdGVNb2NrVGVybWluYWwoMjIyMjIpO1xuXG5cdFx0XHRsZXQgdGVybWluYWwxRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdGxldCB0ZXJtaW5hbDJEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0bW9ja1Rlcm1pbmFsMS5kaXNwb3NlID0gKCkgPT4geyB0ZXJtaW5hbDFEaXNwb3NlZCA9IHRydWU7IH07XG5cdFx0XHRtb2NrVGVybWluYWwyLmRpc3Bvc2UgPSAoKSA9PiB7IHRlcm1pbmFsMkRpc3Bvc2VkID0gdHJ1ZTsgfTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHRydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxJbnN0YW5jZXMuc2V0KHNlc3Npb25SZXNvdXJjZSwgbmV3IFNldChbbW9ja1Rlcm1pbmFsMSwgbW9ja1Rlcm1pbmFsMl0pKTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgdGhhdCB0ZXJtaW5hbDIgd2FzIHJldmVhbGVkIGJ5IHRoZSB1c2VyIChpdCdzIGluIGZvcmVncm91bmRJbnN0YW5jZXMpXG5cdFx0XHQoaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElUZXJtaW5hbFNlcnZpY2UpLmZvcmVncm91bmRJbnN0YW5jZXMgYXMgSVRlcm1pbmFsSW5zdGFuY2VbXSkucHVzaChtb2NrVGVybWluYWwyKTtcblxuXHRcdFx0Y2hhdFNlcnZpY2VEaXNwb3NlRW1pdHRlci5maXJlKHsgc2Vzc2lvblJlc291cmNlczogW3Nlc3Npb25SZXNvdXJjZV0sIHJlYXNvbjogJ2NsZWFyZWQnIH0pO1xuXG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbDFEaXNwb3NlZCwgdHJ1ZSwgJ0hpZGRlbiB0ZXJtaW5hbCBzaG91bGQgaGF2ZSBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbDJEaXNwb3NlZCwgZmFsc2UsICdVc2VyLXJldmVhbGVkIHRlcm1pbmFsIHNob3VsZCBOT1QgaGF2ZSBiZWVuIGRpc3Bvc2VkJyk7XG5cblx0XHRcdC8vIENsZWFuIHVwXG5cdFx0XHQoaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElUZXJtaW5hbFNlcnZpY2UpLmZvcmVncm91bmRJbnN0YW5jZXMgYXMgSVRlcm1pbmFsSW5zdGFuY2VbXSkubGVuZ3RoID0gMDtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBwcmVzZXJ2ZSB0ZXJtaW5hbHMgd2hlbiBvdXRwdXQgbG9jYXRpb24gaXMgdGVybWluYWwnLCAoKSA9PiB7XG5cdFx0XHRzZXRDb25maWcoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5PdXRwdXRMb2NhdGlvbiwgJ3Rlcm1pbmFsJyk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25JZCA9ICd0ZXN0LXNlc3Npb24tb3V0cHV0LWxvY2F0aW9uLXRlcm1pbmFsJztcblx0XHRcdGNvbnN0IG1vY2tUZXJtaW5hbDEgPSBjcmVhdGVNb2NrVGVybWluYWwoMzMzMzMpO1xuXHRcdFx0Y29uc3QgbW9ja1Rlcm1pbmFsMiA9IGNyZWF0ZU1vY2tUZXJtaW5hbCg0NDQ0NCk7XG5cblx0XHRcdGxldCB0ZXJtaW5hbDFEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0bGV0IHRlcm1pbmFsMkRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRtb2NrVGVybWluYWwxLmRpc3Bvc2UgPSAoKSA9PiB7IHRlcm1pbmFsMURpc3Bvc2VkID0gdHJ1ZTsgfTtcblx0XHRcdG1vY2tUZXJtaW5hbDIuZGlzcG9zZSA9ICgpID0+IHsgdGVybWluYWwyRGlzcG9zZWQgPSB0cnVlOyB9O1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEluc3RhbmNlcy5zZXQoc2Vzc2lvblJlc291cmNlLCBuZXcgU2V0KFttb2NrVGVybWluYWwxLCBtb2NrVGVybWluYWwyXSkpO1xuXG5cdFx0XHRjaGF0U2VydmljZURpc3Bvc2VFbWl0dGVyLmZpcmUoeyBzZXNzaW9uUmVzb3VyY2VzOiBbc2Vzc2lvblJlc291cmNlXSwgcmVhc29uOiAnY2xlYXJlZCcgfSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsMURpc3Bvc2VkLCBmYWxzZSwgJ1Rlcm1pbmFsIHNob3VsZCBwZXJzaXN0IHdoZW4gb3V0cHV0IGxvY2F0aW9uIGlzIHRlcm1pbmFsJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbDJEaXNwb3NlZCwgZmFsc2UsICdUZXJtaW5hbCBzaG91bGQgcGVyc2lzdCB3aGVuIG91dHB1dCBsb2NhdGlvbiBpcyB0ZXJtaW5hbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBkaXNwb3NhbCBvZiBub24tZXhpc3RlbnQgc2Vzc2lvbiBncmFjZWZ1bGx5JywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwocnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLnNpemUsIDAsICdObyBhc3NvY2lhdGlvbnMgc2hvdWxkIGV4aXN0IGluaXRpYWxseScpO1xuXHRcdFx0Y2hhdFNlcnZpY2VEaXNwb3NlRW1pdHRlci5maXJlKHsgc2Vzc2lvblJlc291cmNlczogW0xvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignbm9uLWV4aXN0ZW50LXNlc3Npb24nKV0sIHJlYXNvbjogJ2NsZWFyZWQnIH0pO1xuXHRcdFx0c3RyaWN0RXF1YWwocnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLnNpemUsIDAsICdObyBhc3NvY2lhdGlvbnMgc2hvdWxkIGV4aXN0IGFmdGVyIGhhbmRsaW5nIG5vbi1leGlzdGVudCBzZXNzaW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJldXNlIGEgZGlzcG9zZWQgY2FjaGVkIHRlcm1pbmFsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdkaXNwb3NlZC10ZXJtaW5hbC1zZXNzaW9uJyk7XG5cdFx0XHRjb25zdCBkaXNwb3NlZFRlcm1pbmFsID0ge1xuXHRcdFx0XHRpc0Rpc3Bvc2VkOiB0cnVlLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdHByb2Nlc3NJZDogOTk5OTksXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0XHRydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuc2V0KHNlc3Npb25SZXNvdXJjZSwge1xuXHRcdFx0XHRpbnN0YW5jZTogZGlzcG9zZWRUZXJtaW5hbCxcblx0XHRcdFx0c2hlbGxJbnRlZ3JhdGlvblF1YWxpdHk6IFNoZWxsSW50ZWdyYXRpb25RdWFsaXR5Lk5vbmUsXG5cdFx0XHRcdGlzQmFja2dyb3VuZDogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQSBkaXNwb3NlZCBjYWNoZWQgdGVybWluYWwgc2hvdWxkIG5vdCBiZSByZXR1cm5lZCBieSB0aGUgYXNzb2NpYXRpb24gbG9va3VwXG5cdFx0XHRjb25zdCBjYWNoZWRUZXJtaW5hbCA9IHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdG9rKGNhY2hlZFRlcm1pbmFsLCAnQ2FjaGVkIHRlcm1pbmFsIHNob3VsZCBleGlzdCBpbiB0aGUgbWFwJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYWNoZWRUZXJtaW5hbCEuaW5zdGFuY2UuaXNEaXNwb3NlZCwgdHJ1ZSwgJ0NhY2hlZCB0ZXJtaW5hbCBzaG91bGQgYmUgZGlzcG9zZWQnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBndWFyZCBjb25kaXRpb24gdGhhdCBfaW5pdFRlcm1pbmFsIHVzZXM6XG5cdFx0XHQvLyBjYWNoZWRUZXJtaW5hbCAmJiAhY2FjaGVkVGVybWluYWwuaXNCYWNrZ3JvdW5kICYmICFjYWNoZWRUZXJtaW5hbC5pbnN0YW5jZS5pc0Rpc3Bvc2VkXG5cdFx0XHRjb25zdCB3b3VsZFJldXNlID0gY2FjaGVkVGVybWluYWwgIT09IHVuZGVmaW5lZCAmJiAhY2FjaGVkVGVybWluYWwuaXNCYWNrZ3JvdW5kICYmICFjYWNoZWRUZXJtaW5hbC5pbnN0YW5jZS5pc0Rpc3Bvc2VkO1xuXHRcdFx0c3RyaWN0RXF1YWwod291bGRSZXVzZSwgZmFsc2UsICdTaG91bGQgbm90IHJldXNlIGEgZGlzcG9zZWQgY2FjaGVkIHRlcm1pbmFsJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCB1c2UgdGhlIGNvbnZlcnNhdGlvbiBtb2RlbCBhbmQgcHJlc2VydmUgcHJldmlvdXMgYWdlbnQgZm9yIGJhY2tncm91bmQgY29tcGxldGlvbiBub3RpZmljYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlcm1JZCA9ICd0ZXN0LWNvbXBsZXRpb24tbW9kZWwtdGVybSc7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCd0ZXN0LWNvbXBsZXRpb24tbW9kZWwtc2Vzc2lvbicpO1xuXHRcdGNvbnN0IGNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx7IGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQgfT4oKTtcblx0XHRjb25zdCB0ZXJtaW5hbERpc3Bvc2VkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0Y29uc3QgaW5wdXREYXRhRW1pdHRlciA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblxuXHRcdGNvbnN0IHRlcm1pbmFsSW5zdGFuY2UgPSB7XG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0Z2V0OiAoY2FwOiBUZXJtaW5hbENhcGFiaWxpdHkpID0+IGNhcCA9PT0gVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24gPyB7IG9uQ29tbWFuZEZpbmlzaGVkOiBjb21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50IH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0b25EaXNwb3NlZDogdGVybWluYWxEaXNwb3NlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZElucHV0RGF0YTogaW5wdXREYXRhRW1pdHRlci5ldmVudCxcblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cblx0XHRjb25zdCBwcmV2aW91c01vZGVsSWQgPSAnY2xhdWRlLW9wdXMtNC04Jztcblx0XHRjb25zdCBwcmV2aW91c0FnZW50SWQgPSAnbG9jYWwtYWdlbnQnO1xuXHRcdGNvbnN0IHByZXZpb3VzUmVxdWVzdCA9IHsgbW9kZWxJZDogcHJldmlvdXNNb2RlbElkLCByZXNwb25zZTogeyBhZ2VudDogeyBpZDogcHJldmlvdXNBZ2VudElkIH0sIGlzQ2FuY2VsZWQ6IGZhbHNlLCBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSB9IH07XG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNoYXRTZXJ2aWNlKSBhcyB1bmtub3duIGFzIHtcblx0XHRcdGFjcXVpcmVFeGlzdGluZ1Nlc3Npb246ICgpID0+IE5vbk51bGxhYmxlPFJldHVyblR5cGU8SUNoYXRTZXJ2aWNlWydhY3F1aXJlRXhpc3RpbmdTZXNzaW9uJ10+Pjtcblx0XHR9O1xuXHRcdGNoYXRTZXJ2aWNlLmFjcXVpcmVFeGlzdGluZ1Nlc3Npb24gPSAoKSA9PiAoe1xuXHRcdFx0b2JqZWN0OiB7XG5cdFx0XHRcdGxhc3RSZXF1ZXN0OiBwcmV2aW91c1JlcXVlc3QsXG5cdFx0XHRcdGxhc3RSZXF1ZXN0T2JzOiBjb25zdE9ic2VydmFibGUocHJldmlvdXNSZXF1ZXN0KSxcblx0XHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdH0pIGFzIHVua25vd24gYXMgTm9uTnVsbGFibGU8UmV0dXJuVHlwZTxJQ2hhdFNlcnZpY2VbJ2FjcXVpcmVFeGlzdGluZ1Nlc3Npb24nXT4+O1xuXG5cdFx0KHJ1bkluVGVybWluYWxUb29sLmNvbnN0cnVjdG9yIGFzIHVua25vd24gYXMgeyBfYWN0aXZlRXhlY3V0aW9uczogTWFwPHN0cmluZywgeyBnZXRPdXRwdXQoKTogc3RyaW5nOyBkaXNwb3NlKCk6IHZvaWQ7IGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB9PiB9KS5fYWN0aXZlRXhlY3V0aW9ucy5zZXQodGVybUlkLCB7XG5cdFx0XHRnZXRPdXRwdXQ6ICgpID0+ICdkb25lJyxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdGluc3RhbmNlOiB0ZXJtaW5hbEluc3RhbmNlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YSA9IHsga2luZDogJ3Rlcm1pbmFsJywgY29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICducG0gdGVzdCcgfSwgbGFuZ3VhZ2U6ICdiYXNoJyB9IGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uYW1pbmctY29udmVudGlvblxuXHRcdChydW5JblRlcm1pbmFsVG9vbCBhcyB1bmtub3duIGFzIHsgX3JlZ2lzdGVyQ29tcGxldGlvbk5vdGlmaWNhdGlvbjogKHRlcm1pbmFsOiBJVGVybWluYWxJbnN0YW5jZSwgdGVybUlkOiBzdHJpbmcsIHNlc3Npb246IFVSSSwgY29tbWFuZE5hbWU6IHN0cmluZywgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSkgPT4gdm9pZCB9KVxuXHRcdFx0Ll9yZWdpc3RlckNvbXBsZXRpb25Ob3RpZmljYXRpb24odGVybWluYWxJbnN0YW5jZSwgdGVybUlkLCBzZXNzaW9uUmVzb3VyY2UsICducG0gdGVzdCcsIHRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRjb21tYW5kRmluaXNoZWRFbWl0dGVyLmZpcmUoeyBleGl0Q29kZTogMCB9KTtcblxuXHRcdHN0cmljdEVxdWFsKGNhcHR1cmVkU3RlZXJpbmdSZXF1ZXN0cy5sZW5ndGgsIDEsICdFeHBlY3RlZCBhIGNvbXBsZXRpb24gc3RlZXJpbmcgbm90aWZpY2F0aW9uJyk7XG5cdFx0c3RyaWN0RXF1YWwoY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzWzBdLm9wdGlvbnM/LnVzZXJTZWxlY3RlZE1vZGVsSWQsIHByZXZpb3VzTW9kZWxJZCwgJ0NvbXBsZXRpb24gbm90aWZpY2F0aW9uIHNob3VsZCB1c2UgdGhlIGNvbnZlcnNhdGlvbiBtb2RlbCcpO1xuXHRcdHN0cmljdEVxdWFsKGNhcHR1cmVkU3RlZXJpbmdSZXF1ZXN0c1swXS5vcHRpb25zPy5hZ2VudElkU2lsZW50LCBwcmV2aW91c0FnZW50SWQsICdDb21wbGV0aW9uIG5vdGlmaWNhdGlvbiBzaG91bGQgY29udGludWUgd2l0aCB0aGUgcHJldmlvdXMgcmVxdWVzdCBhZ2VudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZGVkdXBlIHJhcGlkIHJlcGVhdGVkIGJhY2tncm91bmQgaW5wdXQtbmVlZGVkIG5vdGlmaWNhdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVybUlkID0gJ3Rlc3QtaW5wdXQtbmVlZGVkLXRlcm0nO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigndGVzdC1pbnB1dC1uZWVkZWQtc2Vzc2lvbicpO1xuXHRcdGxldCBvdXRwdXQgPSAnRW50ZXIgdmFsdWU6JztcblxuXHRcdGNvbnN0IGNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx7IGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQgfT4oKTtcblx0XHRjb25zdCB0ZXJtaW5hbERpc3Bvc2VkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0Y29uc3QgaW5wdXROZWVkZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRjb25zdCBpbnB1dERhdGFFbWl0dGVyID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXG5cdFx0Y29uc3QgdGVybWluYWxJbnN0YW5jZSA9IHtcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRnZXQ6IChjYXA6IFRlcm1pbmFsQ2FwYWJpbGl0eSkgPT4gY2FwID09PSBUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiA/IHsgb25Db21tYW5kRmluaXNoZWQ6IGNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIuZXZlbnQgfSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRvbkRpc3Bvc2VkOiB0ZXJtaW5hbERpc3Bvc2VkRW1pdHRlci5ldmVudCxcblx0XHRcdG9uRGlkSW5wdXREYXRhOiBpbnB1dERhdGFFbWl0dGVyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblxuXHRcdGNvbnN0IG91dHB1dE1vbml0b3IgPSB7XG5cdFx0XHRvbkRpZERldGVjdElucHV0TmVlZGVkOiBpbnB1dE5lZWRlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZERldGVjdFNlbnNpdGl2ZUlucHV0TmVlZGVkOiBFdmVudC5Ob25lLFxuXHRcdFx0Y29udGludWVNb25pdG9yaW5nQXN5bmM6ICgpID0+IHsgfSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgeyBvbkRpZERldGVjdElucHV0TmVlZGVkOiBFdmVudDx2b2lkPjsgb25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47IGNvbnRpbnVlTW9uaXRvcmluZ0FzeW5jOiAoKSA9PiB2b2lkOyBkaXNwb3NlOiAoKSA9PiB2b2lkIH07XG5cblx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhID0geyBraW5kOiAndGVybWluYWwnLCBjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ25wbSBpbml0JyB9LCBsYW5ndWFnZTogJ2Jhc2gnIH0gYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblxuXHRcdChydW5JblRlcm1pbmFsVG9vbC5jb25zdHJ1Y3RvciBhcyB1bmtub3duIGFzIHsgX2FjdGl2ZUV4ZWN1dGlvbnM6IE1hcDxzdHJpbmcsIHsgZ2V0T3V0cHV0KCk6IHN0cmluZyB9PiB9KS5fYWN0aXZlRXhlY3V0aW9ucy5zZXQodGVybUlkLCB7XG5cdFx0XHRnZXRPdXRwdXQ6ICgpID0+IG91dHB1dCxcblx0XHR9KTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbmFtaW5nLWNvbnZlbnRpb25cblx0XHQocnVuSW5UZXJtaW5hbFRvb2wgYXMgdW5rbm93biBhcyB7IF9yZWdpc3RlckNvbXBsZXRpb25Ob3RpZmljYXRpb246ICh0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2UsIHRlcm1JZDogc3RyaW5nLCBzZXNzaW9uOiBVUkksIGNvbW1hbmROYW1lOiBzdHJpbmcsIHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIG91dHB1dE1vbml0b3I6IHsgb25EaWREZXRlY3RJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47IG9uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQ6IEV2ZW50PHZvaWQ+OyBjb250aW51ZU1vbml0b3JpbmdBc3luYzogKCkgPT4gdm9pZDsgZGlzcG9zZTogKCkgPT4gdm9pZCB9KSA9PiB2b2lkIH0pXG5cdFx0XHQuX3JlZ2lzdGVyQ29tcGxldGlvbk5vdGlmaWNhdGlvbih0ZXJtaW5hbEluc3RhbmNlLCB0ZXJtSWQsIHNlc3Npb25SZXNvdXJjZSwgJ25wbSBpbml0JywgdG9vbFNwZWNpZmljRGF0YSwgb3V0cHV0TW9uaXRvcik7XG5cblx0XHRpbnB1dE5lZWRlZEVtaXR0ZXIuZmlyZSgpO1xuXHRcdGlucHV0TmVlZGVkRW1pdHRlci5maXJlKCk7XG5cdFx0c3RyaWN0RXF1YWwoY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzLmxlbmd0aCwgMSwgJ0V4cGVjdGVkIGR1cGxpY2F0ZSByYXBpZCBpbnB1dC1uZWVkZWQgZXZlbnRzIHRvIGJlIHN1cHByZXNzZWQnKTtcblxuXHRcdG91dHB1dCA9ICdDb25maXJtICh5L04pOic7XG5cdFx0aW5wdXROZWVkZWRFbWl0dGVyLmZpcmUoKTtcblx0XHRzdHJpY3RFcXVhbChjYXB0dXJlZFN0ZWVyaW5nUmVxdWVzdHMubGVuZ3RoLCAyLCAnRXhwZWN0ZWQgYSBjaGFuZ2VkIHByb21wdCB0byB0cmlnZ2VyIGEgbmV3IG5vdGlmaWNhdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3VwcHJlc3MgaW5wdXQtbmVlZGVkIGFmdGVyIGRpc3Bvc2FsIGFuZCBvbWl0IHN1Y2Nlc3NmdWwgZXhpdCBjb2RlIGZyb20gdGVybWluYWwtZXhpdGVkIG5vdGljZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXJtSWQgPSAndGVzdC1pbnB1dC1uZWVkZWQtZGlzcG9zZWQtdGVybSc7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCd0ZXN0LWlucHV0LW5lZWRlZC1kaXNwb3NlZC1zZXNzaW9uJyk7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gJ1ByZXNzIEVOVEVSIG9yIHR5cGUgY29tbWFuZCB0byBjb250aW51ZSc7XG5cblx0XHRjb25zdCBjb21tYW5kRmluaXNoZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkIH0+KCk7XG5cdFx0Y29uc3QgdGVybWluYWxEaXNwb3NlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdGNvbnN0IGlucHV0TmVlZGVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0Y29uc3QgaW5wdXREYXRhRW1pdHRlciA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblxuXHRcdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0Y29uc3QgdGVybWluYWxJbnN0YW5jZSA9IHtcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRnZXQ6IChjYXA6IFRlcm1pbmFsQ2FwYWJpbGl0eSkgPT4gY2FwID09PSBUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiA/IHsgb25Db21tYW5kRmluaXNoZWQ6IGNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIuZXZlbnQgfSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRvbkRpc3Bvc2VkOiB0ZXJtaW5hbERpc3Bvc2VkRW1pdHRlci5ldmVudCxcblx0XHRcdG9uRGlkSW5wdXREYXRhOiBpbnB1dERhdGFFbWl0dGVyLmV2ZW50LFxuXHRcdFx0ZXhpdENvZGU6IDAsXG5cdFx0XHRnZXQgaXNEaXNwb3NlZCgpIHsgcmV0dXJuIGlzRGlzcG9zZWQ7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXG5cdFx0Y29uc3Qgb3V0cHV0TW9uaXRvciA9IHtcblx0XHRcdG9uRGlkRGV0ZWN0SW5wdXROZWVkZWQ6IGlucHV0TmVlZGVkRW1pdHRlci5ldmVudCxcblx0XHRcdG9uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRjb250aW51ZU1vbml0b3JpbmdBc3luYzogKCkgPT4geyB9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyB7IG9uRGlkRGV0ZWN0SW5wdXROZWVkZWQ6IEV2ZW50PHZvaWQ+OyBvbkRpZERldGVjdFNlbnNpdGl2ZUlucHV0TmVlZGVkOiBFdmVudDx2b2lkPjsgY29udGludWVNb25pdG9yaW5nQXN5bmM6ICgpID0+IHZvaWQ7IGRpc3Bvc2U6ICgpID0+IHZvaWQgfTtcblxuXHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGEgPSB7IGtpbmQ6ICd0ZXJtaW5hbCcsIGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnZ2l0IC0tbm8tcGFnZXIgZGlmZiAtLSBmb28udHMnIH0sIGxhbmd1YWdlOiAnYmFzaCcgfSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXG5cdFx0KHJ1bkluVGVybWluYWxUb29sLmNvbnN0cnVjdG9yIGFzIHVua25vd24gYXMgeyBfYWN0aXZlRXhlY3V0aW9uczogTWFwPHN0cmluZywgeyBnZXRPdXRwdXQoKTogc3RyaW5nIH0+IH0pLl9hY3RpdmVFeGVjdXRpb25zLnNldCh0ZXJtSWQsIHtcblx0XHRcdGdldE91dHB1dDogKCkgPT4gb3V0cHV0LFxuXHRcdH0pO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uYW1pbmctY29udmVudGlvblxuXHRcdChydW5JblRlcm1pbmFsVG9vbCBhcyB1bmtub3duIGFzIHsgX3JlZ2lzdGVyQ29tcGxldGlvbk5vdGlmaWNhdGlvbjogKHRlcm1pbmFsOiBJVGVybWluYWxJbnN0YW5jZSwgdGVybUlkOiBzdHJpbmcsIHNlc3Npb246IFVSSSwgY29tbWFuZE5hbWU6IHN0cmluZywgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgb3V0cHV0TW9uaXRvcjogeyBvbkRpZERldGVjdElucHV0TmVlZGVkOiBFdmVudDx2b2lkPjsgb25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47IGNvbnRpbnVlTW9uaXRvcmluZ0FzeW5jOiAoKSA9PiB2b2lkOyBkaXNwb3NlOiAoKSA9PiB2b2lkIH0pID0+IHZvaWQgfSlcblx0XHRcdC5fcmVnaXN0ZXJDb21wbGV0aW9uTm90aWZpY2F0aW9uKHRlcm1pbmFsSW5zdGFuY2UsIHRlcm1JZCwgc2Vzc2lvblJlc291cmNlLCAnZ2l0IC0tbm8tcGFnZXIgZGlmZiAtLSBmb28udHMnLCB0b29sU3BlY2lmaWNEYXRhLCBvdXRwdXRNb25pdG9yKTtcblxuXHRcdC8vIFNpbXVsYXRlIHRoZSB1c2VyIGNsb3NpbmcgdGhlIHRlcm1pbmFsLiBUaGUgb3V0cHV0IG1vbml0b3IgbWF5IHN0aWxsXG5cdFx0Ly8gZmlyZSBgaW5wdXROZWVkZWRgIGJlY2F1c2UgdGhlIGJ1ZmZlcmVkIG91dHB1dCBsb29rcyBsaWtlIGEgcGFnZXJcblx0XHQvLyBwcm9tcHQsIGJ1dCBubyBzdGVlcmluZyBjaGF0IHR1cm4gc2hvdWxkIGJlIGNyZWF0ZWQgYmVjYXVzZSB0aGVcblx0XHQvLyB0ZXJtaW5hbCBpcyBnb25lLlxuXHRcdGlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdGlucHV0TmVlZGVkRW1pdHRlci5maXJlKCk7XG5cdFx0c3RyaWN0RXF1YWwoY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzLmxlbmd0aCwgMCwgJ0Nsb3NpbmcgdGhlIHRlcm1pbmFsIHNob3VsZCBub3QgcHJvZHVjZSBhIHNwdXJpb3VzIGlucHV0LW5lZWRlZCBjaGF0IHR1cm4nKTtcblxuXHRcdHRlcm1pbmFsRGlzcG9zZWRFbWl0dGVyLmZpcmUoKTtcblx0XHRzdHJpY3RFcXVhbChjYXB0dXJlZFN0ZWVyaW5nUmVxdWVzdHMubGVuZ3RoLCAxLCAnQ2xvc2luZyB0aGUgdGVybWluYWwgc2hvdWxkIHNlbmQgb25lIHRlcm1pbmFsLWV4aXRlZCBub3RpZmljYXRpb24nKTtcblx0XHRvayhjYXB0dXJlZFN0ZWVyaW5nUmVxdWVzdHNbMF0ubWVzc2FnZS5pbmNsdWRlcygndGVybWluYWwgZXhpdGVkLicpLCAnU3VjY2Vzc2Z1bCB0ZXJtaW5hbCBleGl0IHNob3VsZCBiZSByZXBvcnRlZCB3aXRob3V0IHF1YWxpZmljYXRpb24nKTtcblx0XHRvayghY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzWzBdLm1lc3NhZ2UuaW5jbHVkZXMoJ2V4aXQgY29kZSAwJyksICdTdWNjZXNzZnVsIHRlcm1pbmFsIGV4aXQgc2hvdWxkIG5vdCBwcmludCBleGl0IGNvZGUgMCB0byBjaGF0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzdXBwcmVzcyByZWR1bmRhbnQgaW5wdXQtbmVlZGVkIG5vdGlmaWNhdGlvbiBmb3Igb3V0cHV0IGFscmVhZHkgcmV0dXJuZWQgdmlhIGZvcmVncm91bmQgaW5wdXROZWVkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVybUlkID0gJ3Rlc3QtaW5wdXQtbmVlZGVkLWFscmVhZHktbm90aWZpZWQtdGVybSc7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCd0ZXN0LWlucHV0LW5lZWRlZC1hbHJlYWR5LW5vdGlmaWVkLXNlc3Npb24nKTtcblx0XHRsZXQgb3V0cHV0ID0gJ3BhY2thZ2UgbmFtZTogKHRlc3RfbnBtX2luaXQpICc7XG5cblx0XHRjb25zdCBjb21tYW5kRmluaXNoZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkIH0+KCk7XG5cdFx0Y29uc3QgdGVybWluYWxEaXNwb3NlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdGNvbnN0IGlucHV0TmVlZGVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0Y29uc3QgaW5wdXREYXRhRW1pdHRlciA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblxuXHRcdGNvbnN0IHRlcm1pbmFsSW5zdGFuY2UgPSB7XG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0Z2V0OiAoY2FwOiBUZXJtaW5hbENhcGFiaWxpdHkpID0+IGNhcCA9PT0gVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24gPyB7IG9uQ29tbWFuZEZpbmlzaGVkOiBjb21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50IH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0b25EaXNwb3NlZDogdGVybWluYWxEaXNwb3NlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZElucHV0RGF0YTogaW5wdXREYXRhRW1pdHRlci5ldmVudCxcblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cblx0XHRjb25zdCBvdXRwdXRNb25pdG9yID0ge1xuXHRcdFx0b25EaWREZXRlY3RJbnB1dE5lZWRlZDogaW5wdXROZWVkZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0b25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZDogRXZlbnQuTm9uZSxcblx0XHRcdGNvbnRpbnVlTW9uaXRvcmluZ0FzeW5jOiAoKSA9PiB7IH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIHsgb25EaWREZXRlY3RJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47IG9uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQ6IEV2ZW50PHZvaWQ+OyBjb250aW51ZU1vbml0b3JpbmdBc3luYzogKCkgPT4gdm9pZDsgZGlzcG9zZTogKCkgPT4gdm9pZCB9O1xuXG5cdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YSA9IHsga2luZDogJ3Rlcm1pbmFsJywgY29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICdta2RpciAtcCBmb28gJiYgY2QgZm9vICYmIG5wbSBpbml0JyB9LCBsYW5ndWFnZTogJ2Jhc2gnIH0gYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblxuXHRcdChydW5JblRlcm1pbmFsVG9vbC5jb25zdHJ1Y3RvciBhcyB1bmtub3duIGFzIHsgX2FjdGl2ZUV4ZWN1dGlvbnM6IE1hcDxzdHJpbmcsIHsgZ2V0T3V0cHV0KCk6IHN0cmluZyB9PiB9KS5fYWN0aXZlRXhlY3V0aW9ucy5zZXQodGVybUlkLCB7XG5cdFx0XHRnZXRPdXRwdXQ6ICgpID0+IG91dHB1dCxcblx0XHR9KTtcblxuXHRcdC8vIFNpbXVsYXRlIHRoZSBmb3JlZ3JvdW5kIHRvb2wganVzdCByZXR1cm5pbmcgdmlhIHRoZSBgaW5wdXROZWVkZWRgIHJhY2UgXHUyMDE0XG5cdFx0Ly8gdGhlIGFnZW50IGhhcyBhbHJlYWR5IHJlY2VpdmVkIGBvdXRwdXRgIGFzIHRoZSB0b29sIHJlc3VsdCwgc28gdGhlIEJHXG5cdFx0Ly8gbW9uaXRvcidzIGZpcnN0IHJlLWRldGVjdGlvbiBvZiB0aGUgc2FtZSBwcm9tcHQgbXVzdCBub3QgZmlyZSBhIHN0ZWVyaW5nXG5cdFx0Ly8gbWVzc2FnZSB0aGF0IHdvdWxkIHlpZWxkIHRoZSBhZ2VudCdzIGluLWZsaWdodCBgc2VuZF90b190ZXJtaW5hbGAgcmVwbHkuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uYW1pbmctY29udmVudGlvblxuXHRcdChydW5JblRlcm1pbmFsVG9vbCBhcyB1bmtub3duIGFzIHsgX3JlZ2lzdGVyQ29tcGxldGlvbk5vdGlmaWNhdGlvbjogKHRlcm1pbmFsOiBJVGVybWluYWxJbnN0YW5jZSwgdGVybUlkOiBzdHJpbmcsIHNlc3Npb246IFVSSSwgY29tbWFuZE5hbWU6IHN0cmluZywgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgb3V0cHV0TW9uaXRvcjogeyBvbkRpZERldGVjdElucHV0TmVlZGVkOiBFdmVudDx2b2lkPjsgb25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47IGNvbnRpbnVlTW9uaXRvcmluZ0FzeW5jOiAoKSA9PiB2b2lkOyBkaXNwb3NlOiAoKSA9PiB2b2lkIH0sIGFscmVhZHlOb3RpZmllZElucHV0TmVlZGVkT3V0cHV0Pzogc3RyaW5nKSA9PiB2b2lkIH0pXG5cdFx0XHQuX3JlZ2lzdGVyQ29tcGxldGlvbk5vdGlmaWNhdGlvbih0ZXJtaW5hbEluc3RhbmNlLCB0ZXJtSWQsIHNlc3Npb25SZXNvdXJjZSwgJ21rZGlyIC1wIGZvbyAmJiBjZCBmb28gJiYgbnBtIGluaXQnLCB0b29sU3BlY2lmaWNEYXRhLCBvdXRwdXRNb25pdG9yLCBvdXRwdXQpO1xuXG5cdFx0aW5wdXROZWVkZWRFbWl0dGVyLmZpcmUoKTtcblx0XHRzdHJpY3RFcXVhbChjYXB0dXJlZFN0ZWVyaW5nUmVxdWVzdHMubGVuZ3RoLCAwLCAnU2hvdWxkIG5vdCByZS1ub3RpZnkgZm9yIG91dHB1dCB0aGUgYWdlbnQgYWxyZWFkeSByZWNlaXZlZCB2aWEgdGhlIGZvcmVncm91bmQgaW5wdXROZWVkZWQgcmFjZScpO1xuXG5cdFx0Ly8gT25jZSB0aGUgcHJvbXB0IGFjdHVhbGx5IGNoYW5nZXMgKG5ldyBkYXRhIGhhcyBhcnJpdmVkKSwgYSBmcmVzaCBub3RpZmljYXRpb25cblx0XHQvLyBzaG91bGQgYmUgc2VudCBzbyB0aGUgYWdlbnQgbGVhcm5zIGFib3V0IHRoZSBuZXcgcHJvbXB0IHN0YXRlLlxuXHRcdG91dHB1dCA9ICd2ZXJzaW9uOiAoMS4wLjApICc7XG5cdFx0aW5wdXROZWVkZWRFbWl0dGVyLmZpcmUoKTtcblx0XHRzdHJpY3RFcXVhbChjYXB0dXJlZFN0ZWVyaW5nUmVxdWVzdHMubGVuZ3RoLCAxLCAnRXhwZWN0ZWQgYSBuZXcgbm90aWZpY2F0aW9uIG9uY2UgdGhlIHByb21wdCBvdXRwdXQgY2hhbmdlcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcHJlc2VydmUgc2Vzc2lvbiB0ZXJtaW5hbCBhc3NvY2lhdGlvbiBhZnRlciBpbnB1dE5lZWRlZCBzbyBmZyB0ZXJtaW5hbCBpcyByZXVzZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVybUlkID0gJ3Rlc3QtaW5wdXQtY2xlYW51cC10ZXJtJztcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Rlc3QtaW5wdXQtY2xlYW51cC1zZXNzaW9uJyk7XG5cblx0XHRjb25zdCBjb21tYW5kRmluaXNoZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkIH0+KCk7XG5cdFx0Y29uc3QgdGVybWluYWxEaXNwb3NlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdGNvbnN0IGlucHV0TmVlZGVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0Y29uc3QgaW5wdXREYXRhRW1pdHRlciA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblxuXHRcdGNvbnN0IHRlcm1pbmFsSW5zdGFuY2UgPSB7XG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0Z2V0OiAoY2FwOiBUZXJtaW5hbENhcGFiaWxpdHkpID0+IGNhcCA9PT0gVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24gPyB7IG9uQ29tbWFuZEZpbmlzaGVkOiBjb21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50IH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0c2hlbGxMYXVuY2hDb25maWc6IHsgaGlkZUZyb21Vc2VyOiBmYWxzZSB9LFxuXHRcdFx0b25EaXNwb3NlZDogdGVybWluYWxEaXNwb3NlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZElucHV0RGF0YTogaW5wdXREYXRhRW1pdHRlci5ldmVudCxcblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cblx0XHRjb25zdCBvdXRwdXRNb25pdG9yID0ge1xuXHRcdFx0b25EaWREZXRlY3RJbnB1dE5lZWRlZDogaW5wdXROZWVkZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0b25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZDogRXZlbnQuTm9uZSxcblx0XHRcdGNvbnRpbnVlTW9uaXRvcmluZ0FzeW5jOiAoKSA9PiB7IH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIHsgb25EaWREZXRlY3RJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47IG9uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQ6IEV2ZW50PHZvaWQ+OyBjb250aW51ZU1vbml0b3JpbmdBc3luYzogKCkgPT4gdm9pZDsgZGlzcG9zZTogKCkgPT4gdm9pZCB9O1xuXG5cdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YSA9IHsga2luZDogJ3Rlcm1pbmFsJywgY29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICdzc2ggaG9zdCcgfSwgbGFuZ3VhZ2U6ICdiYXNoJyB9IGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cblx0XHQvLyBUaGlzIGlzIGEgZm9yZWdyb3VuZCB0ZXJtaW5hbCwgc28gaXQgc2hvdWxkIGJlIGluIGZvcmVncm91bmRJbnN0YW5jZXNcblx0XHQoaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElUZXJtaW5hbFNlcnZpY2UpLmZvcmVncm91bmRJbnN0YW5jZXMgYXMgSVRlcm1pbmFsSW5zdGFuY2VbXSkucHVzaCh0ZXJtaW5hbEluc3RhbmNlKTtcblxuXHRcdC8vIFNldCB1cCBmZyB0ZXJtaW5hbCBhc3NvY2lhdGlvbiBhbmQgYWN0aXZlIGV4ZWN1dGlvblxuXHRcdHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5zZXQoc2Vzc2lvblJlc291cmNlLCB7XG5cdFx0XHRpbnN0YW5jZTogdGVybWluYWxJbnN0YW5jZSxcblx0XHRcdHNoZWxsSW50ZWdyYXRpb25RdWFsaXR5OiBTaGVsbEludGVncmF0aW9uUXVhbGl0eS5SaWNoLFxuXHRcdFx0aXNCYWNrZ3JvdW5kOiBmYWxzZSxcblx0XHR9KTtcblxuXHRcdChydW5JblRlcm1pbmFsVG9vbC5jb25zdHJ1Y3RvciBhcyB1bmtub3duIGFzIHsgX2FjdGl2ZUV4ZWN1dGlvbnM6IE1hcDxzdHJpbmcsIHsgZ2V0T3V0cHV0KCk6IHN0cmluZzsgZGlzcG9zZSgpOiB2b2lkIH0+IH0pLl9hY3RpdmVFeGVjdXRpb25zLnNldCh0ZXJtSWQsIHtcblx0XHRcdGdldE91dHB1dDogKCkgPT4gJ1Bhc3N3b3JkOicsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25hbWluZy1jb252ZW50aW9uXG5cdFx0KHJ1bkluVGVybWluYWxUb29sIGFzIHVua25vd24gYXMgeyBfcmVnaXN0ZXJDb21wbGV0aW9uTm90aWZpY2F0aW9uOiAodGVybWluYWw6IElUZXJtaW5hbEluc3RhbmNlLCB0ZXJtSWQ6IHN0cmluZywgc2Vzc2lvbjogVVJJLCBjb21tYW5kTmFtZTogc3RyaW5nLCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLCBvdXRwdXRNb25pdG9yOiB7IG9uRGlkRGV0ZWN0SW5wdXROZWVkZWQ6IEV2ZW50PHZvaWQ+OyBvbkRpZERldGVjdFNlbnNpdGl2ZUlucHV0TmVlZGVkOiBFdmVudDx2b2lkPjsgY29udGludWVNb25pdG9yaW5nQXN5bmM6ICgpID0+IHZvaWQ7IGRpc3Bvc2U6ICgpID0+IHZvaWQgfSkgPT4gdm9pZCB9KVxuXHRcdFx0Ll9yZWdpc3RlckNvbXBsZXRpb25Ob3RpZmljYXRpb24odGVybWluYWxJbnN0YW5jZSwgdGVybUlkLCBzZXNzaW9uUmVzb3VyY2UsICdzc2ggaG9zdCcsIHRvb2xTcGVjaWZpY0RhdGEsIG91dHB1dE1vbml0b3IpO1xuXG5cdFx0Ly8gRmlyZSBpbnB1dE5lZWRlZCBcdTIwMTQgdGhpcyBzaW11bGF0ZXMgdGhlIG91dHB1dCBtb25pdG9yIGRldGVjdGluZyBhIHByb21wdFxuXHRcdGlucHV0TmVlZGVkRW1pdHRlci5maXJlKCk7XG5cdFx0c3RyaWN0RXF1YWwoY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzLmxlbmd0aCwgMSwgJ1Nob3VsZCBzZW5kIHN0ZWVyaW5nIHJlcXVlc3QgZm9yIGlucHV0IG5lZWRlZCcpO1xuXG5cdFx0Ly8gVGhlIGtleSBhc3NlcnRpb246IGZnIHRlcm1pbmFsIGFzc29jaWF0aW9uIGlzIHByZXNlcnZlZCAobm90IGRlbGV0ZWQpXG5cdFx0b2socnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UpLCAnU2Vzc2lvbiB0ZXJtaW5hbCBhc3NvY2lhdGlvbiBzaG91bGQgYmUgcHJlc2VydmVkIGZvciBmZyByZXVzZScpO1xuXHRcdHN0cmljdEVxdWFsKHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5nZXQoc2Vzc2lvblJlc291cmNlKSEuaXNCYWNrZ3JvdW5kLCBmYWxzZSwgJ1Rlcm1pbmFsIHNob3VsZCByZW1haW4gZm9yZWdyb3VuZCcpO1xuXG5cdFx0Ly8gQWZ0ZXIgY29tbWFuZCBmaW5pc2hlcywgdGhlIGZnIGFzc29jaWF0aW9uIHN0aWxsIHBlcnNpc3RzXG5cdFx0Y29tbWFuZEZpbmlzaGVkRW1pdHRlci5maXJlKHsgZXhpdENvZGU6IDAgfSk7XG5cdFx0c3RyaWN0RXF1YWwoY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzLmxlbmd0aCwgMiwgJ1Nob3VsZCBzZW5kIGEgY29tcGxldGlvbiBzdGVlcmluZyByZXF1ZXN0Jyk7XG5cdFx0b2soY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzWzFdLm1lc3NhZ2UuaW5jbHVkZXMoJ2NvbW1hbmQgY29tcGxldGVkLicpLCAnU3VjY2Vzc2Z1bCBjb21wbGV0aW9uIHNob3VsZCBiZSByZXBvcnRlZCB3aXRob3V0IHF1YWxpZmljYXRpb24nKTtcblx0XHRvayghY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzWzFdLm1lc3NhZ2UuaW5jbHVkZXMoJ2V4aXQgY29kZSAwJyksICdTdWNjZXNzZnVsIGNvbXBsZXRpb24gc2hvdWxkIG5vdCBwcmludCBleGl0IGNvZGUgMCB0byBjaGF0Jyk7XG5cdFx0b2socnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UpLCAnU2Vzc2lvbiB0ZXJtaW5hbCBhc3NvY2lhdGlvbiBzaG91bGQgc3RpbGwgYmUgcHJlc2VydmVkIGFmdGVyIGNvbW1hbmQgZmluaXNoZXMnKTtcblx0XHRzdHJpY3RFcXVhbChydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuZ2V0KHNlc3Npb25SZXNvdXJjZSkhLmlzQmFja2dyb3VuZCwgZmFsc2UsICdUZXJtaW5hbCBzaG91bGQgc3RpbGwgYmUgZm9yZWdyb3VuZCBhZnRlciBjb21tYW5kIGZpbmlzaGVzJyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhdXRvIGFwcHJvdmUgd2FybmluZyBhY2NlcHRhbmNlIG1lY2hhbmlzbScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gZm9yIGF1dG8tYXBwcm92YWJsZSBjb21tYW5kcyB3aGVuIHdhcm5pbmcgbm90IGFjY2VwdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRW5hYmxlQXV0b0FwcHJvdmUsIHRydWUpO1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRlY2hvOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y2xlYXJBdXRvQXBwcm92ZVdhcm5pbmdBY2NlcHRlZFN0YXRlKCk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvIHdvcmxkJyB9KSwgJ1J1biBgYmFzaGAgY29tbWFuZD8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIGF1dG9BcHByb3ZlSW5mbyB3aGVuIGNvbW1hbmQgd291bGQgYmUgYXV0by1hcHByb3ZlZCBidXQgd2FybmluZyBub3QgYWNjZXB0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRDb25maWcoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmFibGVBdXRvQXBwcm92ZSwgdHJ1ZSk7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdGVjaG86IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjbGVhckF1dG9BcHByb3ZlV2FybmluZ0FjY2VwdGVkU3RhdGUoKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8gd29ybGQnIH0pO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kPycpO1xuXG5cdFx0XHQvLyBhdXRvQXBwcm92ZUluZm8gc2hvdWxkIGJlIHNldCBzbyB0aGUgY29uZmlybWF0aW9uIHdpZGdldCBrbm93cyB0byBhdXRvLWFwcHJvdmVcblx0XHRcdC8vIGFmdGVyIHRoZSB1c2VyIGFjY2VwdHMgdGhlIHdhcm5pbmcgbW9kYWxcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHJlc3VsdCEudG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0b2sodGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mbywgJ2F1dG9BcHByb3ZlSW5mbyBzaG91bGQgYmUgc2V0IGZvciBjb21tYW5kcyB0aGF0IHdvdWxkIGJlIGF1dG8tYXBwcm92ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhdXRvLWFwcHJvdmUgY29tbWFuZHMgd2hlbiBib3RoIGF1dG8tYXBwcm92ZSBlbmFibGVkIGFuZCB3YXJuaW5nIGFjY2VwdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRW5hYmxlQXV0b0FwcHJvdmUsIHRydWUpO1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRlY2hvOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvIHdvcmxkJyB9KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gd2hlbiBhdXRvLWFwcHJvdmUgZGlzYWJsZWQgcmVnYXJkbGVzcyBvZiB3YXJuaW5nIGFjY2VwdGFuY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRDb25maWcoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmFibGVBdXRvQXBwcm92ZSwgZmFsc2UpO1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRlY2hvOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8gd29ybGQnIH0pO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kPycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaW5wdXQtbmVlZGVkIHN0ZWVyaW5nIHRleHQnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gYnVpbGRTdGVlcmluZ1RleHQoaHVuZ0hpbnQ6ICdub25lJyB8ICd0aW1lb3V0JyB8ICdpZGxlU2lsZW5jZScpOiBzdHJpbmcge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdpbnB1dC1uZWVkZWQtc3RlZXJpbmctc2Vzc2lvbicpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uYW1pbmctY29udmVudGlvblxuXHRcdFx0cmV0dXJuIChydW5JblRlcm1pbmFsVG9vbCBhcyB1bmtub3duIGFzIHsgX2J1aWxkSW5wdXROZWVkZWRTdGVlcmluZ1RleHQoczogVVJJLCB0OiBzdHJpbmcsIGg6ICdub25lJyB8ICd0aW1lb3V0JyB8ICdpZGxlU2lsZW5jZScpOiBzdHJpbmcgfSlcblx0XHRcdFx0Ll9idWlsZElucHV0TmVlZGVkU3RlZXJpbmdUZXh0KHNlc3Npb25SZXNvdXJjZSwgJ3Rlc3QtdGVybS1pZCcsIGh1bmdIaW50KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdub25lIG1vZGUgZG9lcyBub3QgbWVudGlvbiB0aW1lb3V0LCBpZGxlIHNpbGVuY2UsIG9yIGtpbGxfdGVybWluYWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYnVpbGRTdGVlcmluZ1RleHQoJ25vbmUnKTtcblx0XHRcdG9rKCF0ZXh0LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3RpbWVvdXQnKSwgJ0V4cGVjdGVkIG5vIG1lbnRpb24gb2YgdGltZW91dCBpbiB0aGUgaW5wdXQtbmVlZGVkIChub25lKSBoaW50Jyk7XG5cdFx0XHRvayghdGV4dC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdubyBvdXRwdXQnKSwgJ0V4cGVjdGVkIG5vIG1lbnRpb24gb2YgaWRsZSBzaWxlbmNlIGluIHRoZSBpbnB1dC1uZWVkZWQgKG5vbmUpIGhpbnQnKTtcblx0XHRcdG9rKCF0ZXh0LmluY2x1ZGVzKFRlcm1pbmFsVG9vbElkLktpbGxUZXJtaW5hbCksICdFeHBlY3RlZCBraWxsX3Rlcm1pbmFsIG5vdCB0byBiZSBhZHZlcnRpc2VkIGluIHRoZSBpbnB1dC1uZWVkZWQgKG5vbmUpIGhpbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RpbWVvdXQgbW9kZSBhZHZlcnRpc2VzIGtpbGxfdGVybWluYWwgYW5kIG1lbnRpb25zIHRpbWVvdXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYnVpbGRTdGVlcmluZ1RleHQoJ3RpbWVvdXQnKTtcblx0XHRcdG9rKHRleHQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygndGltZW91dCcpLCAnRXhwZWN0ZWQgdGltZW91dCBoaW50IHRvIG1lbnRpb24gXCJ0aW1lb3V0XCInKTtcblx0XHRcdG9rKHRleHQuaW5jbHVkZXMoVGVybWluYWxUb29sSWQuS2lsbFRlcm1pbmFsKSwgJ0V4cGVjdGVkIHRpbWVvdXQgaGludCB0byBhZHZlcnRpc2Uga2lsbF90ZXJtaW5hbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWRsZVNpbGVuY2UgbW9kZSBhZHZlcnRpc2VzIGtpbGxfdGVybWluYWwgd2l0aG91dCBzYXlpbmcgXCJ0aW1lb3V0XCInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYnVpbGRTdGVlcmluZ1RleHQoJ2lkbGVTaWxlbmNlJyk7XG5cdFx0XHRvayghdGV4dC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCd0aW1lb3V0JyksICdJZGxlLXNpbGVuY2UgaGludCBtdXN0IG5vdCByZWZlciB0byBhIHRpbWVvdXQnKTtcblx0XHRcdG9rKHRleHQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnbm8gb3V0cHV0JyksICdFeHBlY3RlZCBpZGxlLXNpbGVuY2UgaGludCB0byBkZXNjcmliZSB0aGUgbm8tb3V0cHV0IGNvbmRpdGlvbicpO1xuXHRcdFx0b2sodGV4dC5pbmNsdWRlcyhUZXJtaW5hbFRvb2xJZC5LaWxsVGVybWluYWwpLCAnRXhwZWN0ZWQgaWRsZS1zaWxlbmNlIGhpbnQgdG8gYWR2ZXJ0aXNlIGtpbGxfdGVybWluYWwnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3VuaXF1ZSBydWxlcyBkZWR1cGxpY2F0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBwcm9wZXJseSBkZWR1cGxpY2F0ZSBydWxlcyB3aXRoIHNhbWUgc291cmNlVGV4dCBpbiBhdXRvLWFwcHJvdmUgaW5mbycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0ZWNobzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvICYmIGVjaG8gd29ybGQnIH0pO1xuXHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKHJlc3VsdCk7XG5cblx0XHRcdGNvbnN0IGF1dG9BcHByb3ZlSW5mbyA9IChyZXN1bHQhLnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSkuYXV0b0FwcHJvdmVJbmZvITtcblx0XHRcdG9rKGF1dG9BcHByb3ZlSW5mbyk7XG5cdFx0XHRvayhhdXRvQXBwcm92ZUluZm8udmFsdWUuaW5jbHVkZXMoJ0F1dG8gYXBwcm92ZWQgYnkgcnVsZSAnKSwgJ3Nob3VsZCBjb250YWluIHNpbmd1bGFyIFwicnVsZVwiLCBub3QgcGx1cmFsJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjb3VudChhdXRvQXBwcm92ZUluZm8udmFsdWUsICdlY2hvJyksIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2Vzc2lvbiBhdXRvIGFwcHJvdmFsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBhdXRvIGFwcHJvdmUgYWxsIGNvbW1hbmRzIHdoZW4gc2Vzc2lvbiBoYXMgYXV0byBhcHByb3ZhbCBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3Qtc2Vzc2lvbi0xMjMnO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbENoYXRTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElUZXJtaW5hbENoYXRTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0ID0ge1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJ3JtIGRhbmdlcm91cy1maWxlLnR4dCcsXG5cdFx0XHRcdFx0ZXhwbGFuYXRpb246ICdSZW1vdmUgYSBmaWxlJyxcblx0XHRcdFx0XHRnb2FsOiAnUmVtb3ZlIGEgZmlsZScsXG5cdFx0XHRcdFx0bW9kZTogJ3N5bmMnLFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDMwMDAwLFxuXHRcdFx0XHR9IGFzIElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXMsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZVxuXHRcdFx0fSBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQ7XG5cblx0XHRcdGxldCByZXN1bHQgPSBhd2FpdCBydW5JblRlcm1pbmFsVG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXG5cdFx0XHR0ZXJtaW5hbENoYXRTZXJ2aWNlLnNldENoYXRTZXNzaW9uQXV0b0FwcHJvdmFsKHNlc3Npb25SZXNvdXJjZSwgdHJ1ZSk7XG5cblx0XHRcdHJlc3VsdCA9IGF3YWl0IHJ1bkluVGVybWluYWxUb29sLnByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChyZXN1bHQpO1xuXG5cdFx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSByZXN1bHQhLnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblx0XHRcdG9rKHRlcm1pbmFsRGF0YS5hdXRvQXBwcm92ZUluZm8sICdFeHBlY3RlZCBhdXRvQXBwcm92ZUluZm8gdG8gYmUgZGVmaW5lZCcpO1xuXHRcdFx0b2sodGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mby52YWx1ZS5pbmNsdWRlcygnQXV0byBhcHByb3ZlZCBmb3IgdGhpcyBzZXNzaW9uJyksICdFeHBlY3RlZCBzZXNzaW9uIGFwcHJvdmFsIG1lc3NhZ2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBieXBhc3MgdGVybWluYWwgYXV0by1hcHByb3ZlIGZlYXR1cmUgaW4gQXV0b3BpbG90IG1vZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdGN1cmw6IGZhbHNlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdhdXRvcGlsb3Qtc2Vzc2lvbicpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHtcblx0XHRcdFx0Z2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2U6ICgoKSA9PiAoeyBpbnB1dDogeyBjdXJyZW50TW9kZUluZm86IHsgcGVybWlzc2lvbkxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCB9IH0gfSkpIGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXRTZXJ2aWNlWydnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSddLFxuXHRcdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGF1dG9waWxvdFJ1bkluVGVybWluYWxUb29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RSdW5JblRlcm1pbmFsVG9vbCkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXV0b3BpbG90UnVuSW5UZXJtaW5hbFRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdjdXJsIGh0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRcdGV4cGxhbmF0aW9uOiAnRmV0Y2ggYSBVUkwnLFxuXHRcdFx0XHRcdGdvYWw6ICdEb3dubG9hZCBjb250ZW50Jyxcblx0XHRcdFx0XHRtb2RlOiAnc3luYycsXG5cdFx0XHRcdFx0dGltZW91dDogMzAwMDAsXG5cdFx0XHRcdH0gYXMgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0fSBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnRBdXRvQXBwcm92ZWQocmVzdWx0KTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHJlc3VsdCEudG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mbywgdW5kZWZpbmVkLCAnRXhwZWN0ZWQgbm8gdGVybWluYWwgYXV0by1hcHByb3ZlIGluZm8gaW4gQXV0b3BpbG90IG1vZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBieXBhc3MgdGVybWluYWwgYXV0by1hcHByb3ZlIGZlYXR1cmUgaW4gQnlwYXNzIEFwcHJvdmFscyBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRjdXJsOiBmYWxzZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignYnlwYXNzLXNlc3Npb24nKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCB7XG5cdFx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlOiAoKCkgPT4gKHsgaW5wdXQ6IHsgY3VycmVudE1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSB9IH0gfSkpIGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXRTZXJ2aWNlWydnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSddLFxuXHRcdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGJ5cGFzc1J1bkluVGVybWluYWxUb29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RSdW5JblRlcm1pbmFsVG9vbCkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYnlwYXNzUnVuSW5UZXJtaW5hbFRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdjdXJsIGh0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRcdGV4cGxhbmF0aW9uOiAnRmV0Y2ggYSBVUkwnLFxuXHRcdFx0XHRcdGdvYWw6ICdEb3dubG9hZCBjb250ZW50Jyxcblx0XHRcdFx0XHRtb2RlOiAnc3luYycsXG5cdFx0XHRcdFx0dGltZW91dDogMzAwMDAsXG5cdFx0XHRcdH0gYXMgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0fSBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnRBdXRvQXBwcm92ZWQocmVzdWx0KTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHJlc3VsdCEudG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mbywgdW5kZWZpbmVkLCAnRXhwZWN0ZWQgbm8gdGVybWluYWwgYXV0by1hcHByb3ZlIGluZm8gaW4gQnlwYXNzIEFwcHJvdmFscyBtb2RlJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdUZXJtaW5hbFByb2ZpbGVGZXRjaGVyJywgKCkgPT4ge1xuXHRcdHN1aXRlKCdnZXRDb3BpbG90UHJvZmlsZScsICgpID0+IHtcblx0XHRcdChpc1dpbmRvd3MgPyB0ZXN0IDogdGVzdC5za2lwKSgnc2hvdWxkIHJldHVybiBjdXN0b20gcHJvZmlsZSB3aGVuIGNvbmZpZ3VyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNldEJhY2tlbmRPcyhPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRcdGNvbnN0IGN1c3RvbVByb2ZpbGUgPSBPYmplY3QuZnJlZXplKHsgcGF0aDogJ0M6XFxcXFdpbmRvd3NcXFxcU3lzdGVtMzJcXFxccG93ZXJzaGVsbC5leGUnLCBhcmdzOiBbJy1Ob1Byb2ZpbGUnXSB9KTtcblx0XHRcdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuVGVybWluYWxQcm9maWxlV2luZG93cywgY3VzdG9tUHJvZmlsZSk7XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuSW5UZXJtaW5hbFRvb2wucHJvZmlsZUZldGNoZXIuZ2V0Q29waWxvdFByb2ZpbGUoKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCBjdXN0b21Qcm9maWxlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQoaXNMaW51eCA/IHRlc3QgOiB0ZXN0LnNraXApKCdzaG91bGQgZmFsbCBiYWNrIHRvIGRlZmF1bHQgc2hlbGwgd2hlbiBubyBjdXN0b20gcHJvZmlsZSBpcyBjb25maWd1cmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRydW5JblRlcm1pbmFsVG9vbC5zZXRCYWNrZW5kT3MoT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuVGVybWluYWxQcm9maWxlTGludXgsIG51bGwpO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bkluVGVybWluYWxUb29sLnByb2ZpbGVGZXRjaGVyLmdldENvcGlsb3RQcm9maWxlKCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHQsICdvYmplY3QnKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoKHJlc3VsdCBhcyBJVGVybWluYWxQcm9maWxlKS5wYXRoLCAnYmFzaCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdkZW5pYWwgaW5mbyBpbiBkaXNjbGFpbWVycycsICgpID0+IHtcblx0XHRmdW5jdGlvbiBnZXREaXNjbGFpbWVyVmFsdWUoZGlzY2xhaW1lcjogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmICghZGlzY2xhaW1lcikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHR5cGVvZiBkaXNjbGFpbWVyID09PSAnc3RyaW5nJyA/IGRpc2NsYWltZXIgOiBkaXNjbGFpbWVyLnZhbHVlO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIGRlbmlhbCByZWFzb24gaW4gZGlzY2xhaW1lciB3aGVuIGNvbW1hbmQgaXMgZGVuaWVkIGJ5IHJ1bGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdG5wbTogeyBhcHByb3ZlOiBmYWxzZSB9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdCdWlsZCB0aGUgcHJvamVjdCcsXG5cdFx0XHRcdGdvYWw6ICdCdWlsZCB0aGUgcHJvamVjdCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYGJhc2hgIGNvbW1hbmQ/Jyk7XG5cdFx0XHRjb25zdCBkaXNjbGFpbWVyVmFsdWUgPSBnZXREaXNjbGFpbWVyVmFsdWUocmVzdWx0Py5jb25maXJtYXRpb25NZXNzYWdlcz8uZGlzY2xhaW1lcik7XG5cdFx0XHRvayhkaXNjbGFpbWVyVmFsdWUsICdFeHBlY3RlZCBkaXNjbGFpbWVyIHRvIGJlIGRlZmluZWQnKTtcblx0XHRcdG9rKGRpc2NsYWltZXJWYWx1ZS5pbmNsdWRlcygnZGVuaWVkJyksICdFeHBlY3RlZCBkaXNjbGFpbWVyIHRvIG1lbnRpb24gZGVuaWFsJyk7XG5cdFx0XHRvayhkaXNjbGFpbWVyVmFsdWUuaW5jbHVkZXMoJ25wbScpLCAnRXhwZWN0ZWQgZGlzY2xhaW1lciB0byBtZW50aW9uIHRoZSBkZW5pZWQgcnVsZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgbGluayB0byBzZXR0aW5ncyBpbiBkZW5pYWwgZGlzY2xhaW1lcicsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0cm06IHsgYXBwcm92ZTogZmFsc2UgfVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAncm0gLXJmIHRlbXAnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1JlbW92ZSB0ZW1wIGZvbGRlcicsXG5cdFx0XHRcdGdvYWw6ICdSZW1vdmUgdGVtcCBmb2xkZXInXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kPycpO1xuXHRcdFx0b2socmVzdWx0Py5jb25maXJtYXRpb25NZXNzYWdlcz8uZGlzY2xhaW1lciwgJ0V4cGVjdGVkIGRpc2NsYWltZXIgdG8gYmUgZGVmaW5lZCcpO1xuXHRcdFx0Ly8gVGhlIGRpc2NsYWltZXIgc2hvdWxkIGhhdmUgdHJ1c3RlZCBjb21tYW5kcyBlbmFibGVkIGZvciBzZXR0aW5ncyBsaW5rc1xuXHRcdFx0Y29uc3QgZGlzY2xhaW1lciA9IHJlc3VsdC5jb25maXJtYXRpb25NZXNzYWdlcy5kaXNjbGFpbWVyO1xuXHRcdFx0b2sodHlwZW9mIGRpc2NsYWltZXIgIT09ICdzdHJpbmcnICYmIGRpc2NsYWltZXIuaXNUcnVzdGVkLCAnRXhwZWN0ZWQgZGlzY2xhaW1lciB0byBiZSB0cnVzdGVkIGZvciBjb21tYW5kIGxpbmtzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBkZW5pYWwgcmVhc29uIGZvciBtdWx0aXBsZSBkZW5pZWQgc3ViLWNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRybTogeyBhcHByb3ZlOiBmYWxzZSB9LFxuXHRcdFx0XHRzdWRvOiB7IGFwcHJvdmU6IGZhbHNlIH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ3N1ZG8gcm0gLXJmIC8nLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ0Rhbmdlcm91cyBjb21tYW5kJyxcblx0XHRcdFx0Z29hbDogJ0Rhbmdlcm91cyBjb21tYW5kJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBgYmFzaGAgY29tbWFuZD8nKTtcblx0XHRcdGNvbnN0IGRpc2NsYWltZXJWYWx1ZSA9IGdldERpc2NsYWltZXJWYWx1ZShyZXN1bHQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5kaXNjbGFpbWVyKTtcblx0XHRcdG9rKGRpc2NsYWltZXJWYWx1ZSwgJ0V4cGVjdGVkIGRpc2NsYWltZXIgdG8gYmUgZGVmaW5lZCcpO1xuXHRcdFx0b2soZGlzY2xhaW1lclZhbHVlLmluY2x1ZGVzKCdkZW5pZWQnKSwgJ0V4cGVjdGVkIGRpc2NsYWltZXIgdG8gbWVudGlvbiBkZW5pYWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgaW5jbHVkZSBkZW5pYWwgaW5mbyB3aGVuIGF1dG8tYXBwcm92ZSBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldENvbmZpZyhUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkVuYWJsZUF1dG9BcHByb3ZlLCBmYWxzZSk7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdG5wbTogeyBhcHByb3ZlOiBmYWxzZSB9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdCdWlsZCB0aGUgcHJvamVjdCcsXG5cdFx0XHRcdGdvYWw6ICdCdWlsZCB0aGUgcHJvamVjdCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYGJhc2hgIGNvbW1hbmQ/Jyk7XG5cdFx0XHQvLyBXaGVuIGF1dG8tYXBwcm92ZSBpcyBkaXNhYmxlZCwgdGhlcmUgc2hvdWxkIGJlIG5vIGRlbmlhbC1yZWxhdGVkIGRpc2NsYWltZXJcblx0XHRcdGNvbnN0IGRpc2NsYWltZXJWYWx1ZSA9IGdldERpc2NsYWltZXJWYWx1ZShyZXN1bHQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5kaXNjbGFpbWVyKTtcblx0XHRcdGlmIChkaXNjbGFpbWVyVmFsdWUpIHtcblx0XHRcdFx0b2soIWRpc2NsYWltZXJWYWx1ZS5pbmNsdWRlcygnZGVuaWVkJyksICdTaG91bGQgbm90IG1lbnRpb24gZGVuaWFsIHdoZW4gYXV0by1hcHByb3ZlIGlzIGRpc2FibGVkJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGluY2x1ZGUgZGVuaWFsIGluZm8gZm9yIGNvbW1hbmRzIHRoYXQgYXJlIHNpbXBseSBub3QgYXBwcm92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBDb21tYW5kIGlzIG5vdCBpbiBhdXRvLWFwcHJvdmUgbGlzdCwgYnV0IG5vdCBleHBsaWNpdGx5IGRlbmllZFxuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRlY2hvOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdCdWlsZCB0aGUgcHJvamVjdCcsXG5cdFx0XHRcdGdvYWw6ICdCdWlsZCB0aGUgcHJvamVjdCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYGJhc2hgIGNvbW1hbmQ/Jyk7XG5cdFx0XHQvLyBUaGVyZSBzaG91bGQgYmUgbm8gZGVuaWFsIGRpc2NsYWltZXIgc2luY2UgbnBtIGlzIG5vdCBleHBsaWNpdGx5IGRlbmllZFxuXHRcdFx0Y29uc3QgZGlzY2xhaW1lclZhbHVlID0gZ2V0RGlzY2xhaW1lclZhbHVlKHJlc3VsdD8uY29uZmlybWF0aW9uTWVzc2FnZXM/LmRpc2NsYWltZXIpO1xuXHRcdFx0aWYgKGRpc2NsYWltZXJWYWx1ZSkge1xuXHRcdFx0XHRvayghZGlzY2xhaW1lclZhbHVlLmluY2x1ZGVzKCdkZW5pZWQnKSwgJ1Nob3VsZCBub3QgbWVudGlvbiBkZW5pYWwgZm9yIG5vbi1kZW5pZWQgY29tbWFuZHMnKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0NvbmZpcm1UZXJtaW5hbENvbW1hbmRUb29sJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCByZXF1aXJlIGNvbmZpcm1hdGlvbiB3aGVuIHNhbmRib3ggaXMgZW5hYmxlZCBidXQgc2FuZGJveCByZXdyaXRpbmcgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cblx0XHRcdGNvbnN0IHsgQ29uZmlybVRlcm1pbmFsQ29tbWFuZFRvb2wgfSA9IGF3YWl0IGltcG9ydCgnLi4vLi4vYnJvd3Nlci90b29scy9ydW5JblRlcm1pbmFsQ29uZmlybWF0aW9uVG9vbC5qcycpO1xuXHRcdFx0Y29uc3QgY29uZmlybVRvb2wgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29uZmlybVRlcm1pbmFsQ29tbWFuZFRvb2wpKTtcblxuXHRcdFx0Y29uc3QgY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0ID0ge1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJ3BpbmcgZ29vZ2xlLmNvbScsXG5cdFx0XHRcdFx0ZXhwbGFuYXRpb246ICdQaW5nIGdvb2dsZS5jb20nLFxuXHRcdFx0XHRcdGdvYWw6ICdQaW5nIGdvb2dsZS5jb20nLFxuXHRcdFx0XHRcdG1vZGU6ICdzeW5jJyxcblx0XHRcdFx0XHR0aW1lb3V0OiAzMDAwMCxcblx0XHRcdFx0fSBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zXG5cdFx0XHR9IGFzIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dDtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29uZmlybVRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXF1aXJlIGNvbmZpcm1hdGlvbiB3aGVuIHNhbmRib3ggaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe30pO1xuXG5cdFx0XHRjb25zdCB7IENvbmZpcm1UZXJtaW5hbENvbW1hbmRUb29sIH0gPSBhd2FpdCBpbXBvcnQoJy4uLy4uL2Jyb3dzZXIvdG9vbHMvcnVuSW5UZXJtaW5hbENvbmZpcm1hdGlvblRvb2wuanMnKTtcblx0XHRcdGNvbnN0IGNvbmZpcm1Ub29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbmZpcm1UZXJtaW5hbENvbW1hbmRUb29sKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCA9IHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0XHRleHBsYW5hdGlvbjogJ1ByaW50IGhlbGxvJyxcblx0XHRcdFx0XHRnb2FsOiAnUHJpbnQgaGVsbG8nLFxuXHRcdFx0XHRcdG1vZGU6ICdzeW5jJyxcblx0XHRcdFx0XHR0aW1lb3V0OiAzMDAwMCxcblx0XHRcdFx0fSBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zXG5cdFx0XHR9IGFzIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dDtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29uZmlybVRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdXJmYWNlIGEgc2FuZGJveC1ieXBhc3MgdGl0bGUgYW5kIHJlYXNvbiB3aGVuIHNhbmRib3hCeXBhc3MgaXMgc2V0LCBldmVuIHdpdGggc2FuZGJveCBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gZmFsc2U7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7fSk7XG5cblx0XHRcdGNvbnN0IHsgQ29uZmlybVRlcm1pbmFsQ29tbWFuZFRvb2wgfSA9IGF3YWl0IGltcG9ydCgnLi4vLi4vYnJvd3Nlci90b29scy9ydW5JblRlcm1pbmFsQ29uZmlybWF0aW9uVG9vbC5qcycpO1xuXHRcdFx0Y29uc3QgY29uZmlybVRvb2wgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29uZmlybVRlcm1pbmFsQ29tbWFuZFRvb2wpKTtcblxuXHRcdFx0Y29uc3QgY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0ID0ge1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJ2NhdCB+L3NlY3JldCcsXG5cdFx0XHRcdFx0ZXhwbGFuYXRpb246ICdSZWFkIHNlY3JldCcsXG5cdFx0XHRcdFx0Z29hbDogJ1JlYWQgc2VjcmV0Jyxcblx0XHRcdFx0XHRtb2RlOiAnc3luYycsXG5cdFx0XHRcdFx0dGltZW91dDogMzAwMDAsXG5cdFx0XHRcdFx0c2FuZGJveEJ5cGFzczogdHJ1ZSxcblx0XHRcdFx0XHRzYW5kYm94QnlwYXNzUmVhc29uOiAnTmVlZHMgYWNjZXNzIG91dHNpZGUgdGhlIHdvcmtzcGFjZScsXG5cdFx0XHRcdH0gYXMgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtc1xuXHRcdFx0fSBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQ7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbmZpcm1Ub29sLnByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBpbiB0ZXJtaW5hbCBvdXRzaWRlIHRoZSBzYW5kYm94PycpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHJlc3VsdCEuY29uZmlybWF0aW9uTWVzc2FnZXMhLm1lc3NhZ2U7XG5cdFx0XHRjb25zdCBtZXNzYWdlVGV4dCA9IHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJyA/IG1lc3NhZ2UgOiBtZXNzYWdlPy52YWx1ZSA/PyAnJztcblx0XHRcdG9rKC9vdXRzaWRlIHRoZSBzYW5kYm94L2kudGVzdChtZXNzYWdlVGV4dCksIGBleHBlY3RlZCBtZXNzYWdlIHRvIG1lbnRpb24gdGhlIHNhbmRib3gsIGdvdDogJHttZXNzYWdlVGV4dH1gKTtcblx0XHRcdG9rKG1lc3NhZ2VUZXh0LmluY2x1ZGVzKCdOZWVkcyBhY2Nlc3Mgb3V0c2lkZSB0aGUgd29ya3NwYWNlJyksIGBleHBlY3RlZCBtZXNzYWdlIHRvIGluY2x1ZGUgdGhlIHJlYXNvbiwgZ290OiAke21lc3NhZ2VUZXh0fWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZvcmNlIGEgc2FuZGJveC1ieXBhc3MgY29uZmlybWF0aW9uIGV2ZW4gd2hlbiB0aGUgY29tbWFuZCB3b3VsZCBiZSBhdXRvLWFwcHJvdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHsgY2F0OiB0cnVlIH0pO1xuXG5cdFx0XHRjb25zdCB7IENvbmZpcm1UZXJtaW5hbENvbW1hbmRUb29sIH0gPSBhd2FpdCBpbXBvcnQoJy4uLy4uL2Jyb3dzZXIvdG9vbHMvcnVuSW5UZXJtaW5hbENvbmZpcm1hdGlvblRvb2wuanMnKTtcblx0XHRcdGNvbnN0IGNvbmZpcm1Ub29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbmZpcm1UZXJtaW5hbENvbW1hbmRUb29sKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCA9IHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdjYXQgfi9zZWNyZXQnLFxuXHRcdFx0XHRcdGV4cGxhbmF0aW9uOiAnUmVhZCBzZWNyZXQnLFxuXHRcdFx0XHRcdGdvYWw6ICdSZWFkIHNlY3JldCcsXG5cdFx0XHRcdFx0bW9kZTogJ3N5bmMnLFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDMwMDAwLFxuXHRcdFx0XHRcdHNhbmRib3hCeXBhc3M6IHRydWUsXG5cdFx0XHRcdH0gYXMgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtc1xuXHRcdFx0fSBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQ7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbmZpcm1Ub29sLnByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBpbiB0ZXJtaW5hbCBvdXRzaWRlIHRoZSBzYW5kYm94PycpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdEFnZW50VG9vbHNDb250cmlidXRpb24gLSB0b29sIHJlZ2lzdHJhdGlvbiByZWZyZXNoJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IHJlZ2lzdGVyZWRUb29sRGF0YTogTWFwPHN0cmluZywgSVRvb2xEYXRhPjtcblx0bGV0IHBlbmRpbmdUb29sRGF0YVJlZ2lzdHJhdGlvbjogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRsZXQgc2FuZGJveEVuYWJsZWQ6IGJvb2xlYW47XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMsIHRydWUpO1xuXHRcdHJlZ2lzdGVyZWRUb29sRGF0YSA9IG5ldyBNYXAoKTtcblx0XHRwZW5kaW5nVG9vbERhdGFSZWdpc3RyYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0c2FuZGJveEVuYWJsZWQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGZpbGVTeXN0ZW1Qcm92aWRlciA9IG5ldyBUZXN0SVBDRmlsZVN5c3RlbVByb3ZpZGVyKCk7XG5cdFx0c3RvcmUuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBmaWxlU3lzdGVtUHJvdmlkZXIpKTtcblxuXHRcdGNvbnN0IHRlcm1pbmFsU2VydmljZURpc3Bvc2VFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0XHRjb25zdCBjaGF0U2VydmljZURpc3Bvc2VFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHsgc2Vzc2lvblJlc291cmNlczogVVJJW107IHJlYXNvbjogJ2NsZWFyZWQnIH0+KCkpO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uQXJjaGl2ZWRFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElBZ2VudFNlc3Npb24+KCkpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRmaWxlU2VydmljZTogKCkgPT4gZmlsZVNlcnZpY2UsXG5cdFx0fSwgc3RvcmUpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIHtcblx0XHRcdG9uRGlkRGlzcG9zZVNlc3Npb246IGNoYXRTZXJ2aWNlRGlzcG9zZUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGU6IGNoYXRTZXNzaW9uQXJjaGl2ZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0bW9kZWw6IHtcblx0XHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZTogY2hhdFNlc3Npb25BcmNoaXZlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHR9IGFzIElBZ2VudFNlc3Npb25zU2VydmljZVsnbW9kZWwnXVxuXHRcdH0pO1xuXHRcdGNvbnN0IHRlcm1pbmFsSW5zdGFuY2VzQ2hhbmdlZEVtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZERpc3Bvc2VJbnN0YW5jZTogdGVybWluYWxTZXJ2aWNlRGlzcG9zZUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZENoYW5nZUluc3RhbmNlczogdGVybWluYWxJbnN0YW5jZXNDaGFuZ2VkRW1pdHRlci5ldmVudCxcblx0XHRcdGZvcmVncm91bmRJbnN0YW5jZXM6IFtdLFxuXHRcdFx0c2V0TmV4dENvbW1hbmRJZDogYXN5bmMgKCkgPT4geyB9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxDaGF0U2VydmljZSwgc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsQ2hhdFNlcnZpY2UpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSGlzdG9yeVNlcnZpY2UsIHtcblx0XHRcdGdldExhc3RBY3RpdmVXb3Jrc3BhY2VSb290OiAoKSA9PiB1bmRlZmluZWRcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRlcm1pbmFsU2FuZGJveFNlcnZpY2U6IElUZXJtaW5hbFNhbmRib3hTZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0aXNFbmFibGVkOiBhc3luYyAoKSA9PiBzYW5kYm94RW5hYmxlZCxcblx0XHRcdGlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQ6IGFzeW5jICgpID0+IGZhbHNlLFxuXHRcdFx0d3JhcENvbW1hbmQ6IGFzeW5jIChjb21tYW5kOiBzdHJpbmcpID0+ICh7XG5cdFx0XHRcdGNvbW1hbmQ6IGBzYW5kYm94OiR7Y29tbWFuZH1gLFxuXHRcdFx0XHRpc1NhbmRib3hXcmFwcGVkOiB0cnVlLFxuXHRcdFx0fSksXG5cdFx0XHRjaGVja0ZpbGVBY2Nlc3M6IGFzeW5jICgpID0+ICh7IGFsbG93ZWQ6IHRydWUsIGRlbmllZDogW10gfSksXG5cdFx0XHRnZXRTYW5kYm94Q29uZmlnUGF0aDogYXN5bmMgKCkgPT4gc2FuZGJveEVuYWJsZWQgPyAnL3RtcC9zYW5kYm94Lmpzb24nIDogdW5kZWZpbmVkLFxuXHRcdFx0Y2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxczogYXN5bmMgKCkgPT4gKHsgZW5hYmxlZDogc2FuZGJveEVuYWJsZWQsIHNhbmRib3hDb25maWdQYXRoOiBzYW5kYm94RW5hYmxlZCA/ICcvdG1wL3NhbmRib3guanNvbicgOiB1bmRlZmluZWQsIGZhaWxlZENoZWNrOiB1bmRlZmluZWQgfSksXG5cdFx0XHRnZXRUZW1wRGlyOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzZXROZWVkc0ZvcmNlVXBkYXRlQ29uZmlnRmlsZTogKCkgPT4geyB9LFxuXHRcdFx0Z2V0T1M6IGFzeW5jICgpID0+IE9wZXJhdGluZ1N5c3RlbS5MaW51eCxcblx0XHRcdGdldFJlc29sdmVkTmV0d29ya0RvbWFpbnM6ICgpID0+ICh7IGFsbG93ZWREb21haW5zOiBbXSwgZGVuaWVkRG9tYWluczogW10gfSksXG5cdFx0XHRnZXRNaXNzaW5nU2FuZGJveERlcGVuZGVuY2llczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRpbnN0YWxsTWlzc2luZ1NhbmRib3hEZXBlbmRlbmNpZXM6IGFzeW5jICgpID0+ICh7IGV4aXRDb2RlOiAwIH0pLFxuXHRcdFx0cnVuU2FuZGJveFJlbWVkaWF0aW9uOiBhc3luYyAoKSA9PiAoeyBleGl0Q29kZTogMCB9KSxcblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsU2FuZGJveFNlcnZpY2UsIHRlcm1pbmFsU2FuZGJveFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSkpO1xuXHRcdHRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS5pc1Rlc3QgPSB0cnVlO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSwgdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSwge1xuXHRcdFx0Z2V0RGVmYXVsdFByb2ZpbGU6IGFzeW5jICgpID0+ICh7IHBhdGg6ICdiYXNoJyB9IGFzIElUZXJtaW5hbFByb2ZpbGUpXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRUb29sSW1wbHMgPSBuZXcgTWFwPHN0cmluZywgSVRvb2xJbXBsPigpO1xuXHRcdGNvbnN0IG1vY2tUb29sc1NlcnZpY2U6IFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U+ID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDaGFuZ2VUb29sczogRXZlbnQuTm9uZSxcblx0XHRcdHJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGE6IElUb29sRGF0YSkge1xuXHRcdFx0XHRyZWdpc3RlcmVkVG9vbERhdGEuc2V0KHRvb2xEYXRhLmlkLCB0b29sRGF0YSk7XG5cdFx0XHRcdHBlbmRpbmdUb29sRGF0YVJlZ2lzdHJhdGlvbj8uY29tcGxldGUoKTtcblx0XHRcdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiByZWdpc3RlcmVkVG9vbERhdGEuZGVsZXRlKHRvb2xEYXRhLmlkKSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUb29sSW1wbGVtZW50YXRpb24oaWQ6IHN0cmluZywgdG9vbDogSVRvb2xJbXBsKSB7XG5cdFx0XHRcdHJlZ2lzdGVyZWRUb29sSW1wbHMuc2V0KGlkLCB0b29sKTtcblx0XHRcdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiByZWdpc3RlcmVkVG9vbEltcGxzLmRlbGV0ZShpZCkpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVG9vbCh0b29sRGF0YTogSVRvb2xEYXRhLCB0b29sOiBJVG9vbEltcGwpIHtcblx0XHRcdFx0cmVnaXN0ZXJlZFRvb2xEYXRhLnNldCh0b29sRGF0YS5pZCwgdG9vbERhdGEpO1xuXHRcdFx0XHRyZWdpc3RlcmVkVG9vbEltcGxzLnNldCh0b29sRGF0YS5pZCwgdG9vbCk7XG5cdFx0XHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRcdHJlZ2lzdGVyZWRUb29sRGF0YS5kZWxldGUodG9vbERhdGEuaWQpO1xuXHRcdFx0XHRcdHJlZ2lzdGVyZWRUb29sSW1wbHMuZGVsZXRlKHRvb2xEYXRhLmlkKTtcblx0XHRcdFx0XHRpZiAoaXNEaXNwb3NhYmxlKHRvb2wpKSB7XG5cdFx0XHRcdFx0XHR0b29sLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdGdldFRvb2xzKCkge1xuXHRcdFx0XHRyZXR1cm4gcmVnaXN0ZXJlZFRvb2xEYXRhLnZhbHVlcygpO1xuXHRcdFx0fSxcblx0XHRcdGV4ZWN1dGVUb29sU2V0OiBuZXcgVG9vbFNldCgnZXhlY3V0ZScsICdleGVjdXRlJywgQ29kaWNvbi5wbGF5LCBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNvbnRleHRLZXlTZXJ2aWNlKSxcblx0XHRcdHJlYWRUb29sU2V0OiBuZXcgVG9vbFNldCgncmVhZCcsICdyZWFkJywgQ29kaWNvbi5ib29rLCBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNvbnRleHRLZXlTZXJ2aWNlKSxcblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIG1vY2tUb29sc1NlcnZpY2UgYXMgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVG9vbFJlc3VsdENvbXByZXNzb3IsIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHJlZ2lzdGVyRmlsdGVyOiAoKSA9PiB7IH0sXG5cdFx0XHRyZWdpc3RlckNhY2hlOiAoKSA9PiB7IH0sXG5cdFx0XHRtYXliZUNvbXByZXNzOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JUb29sRGF0YVJlZ2lzdHJhdGlvbih0cmlnZ2VyOiAoKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdHBlbmRpbmdUb29sRGF0YVJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJhdGlvbjtcblx0XHR0cnkge1xuXHRcdFx0dHJpZ2dlcigpO1xuXHRcdFx0YXdhaXQgcmVnaXN0cmF0aW9uLnA7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlbmRpbmdUb29sRGF0YVJlZ2lzdHJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVDb250cmlidXRpb24oKTogUHJvbWlzZTxDaGF0QWdlbnRUb29sc0NvbnRyaWJ1dGlvbj4ge1xuXHRcdGxldCBjb250cmlidXRpb246IENoYXRBZ2VudFRvb2xzQ29udHJpYnV0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGF3YWl0IHdhaXRGb3JUb29sRGF0YVJlZ2lzdHJhdGlvbigoKSA9PiB7XG5cdFx0XHRjb250cmlidXRpb24gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEFnZW50VG9vbHNDb250cmlidXRpb24pKTtcblx0XHR9KTtcblx0XHRvayhjb250cmlidXRpb24pO1xuXHRcdHJldHVybiBjb250cmlidXRpb247XG5cdH1cblxuXHR0ZXN0KCdzaG91bGQgcmVnaXN0ZXIgcnVuX2luX3Rlcm1pbmFsIHRvb2wgb24gY29uc3RydWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNyZWF0ZUNvbnRyaWJ1dGlvbigpO1xuXHRcdG9rKHJlZ2lzdGVyZWRUb29sRGF0YS5oYXMoVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbCksICdFeHBlY3RlZCBydW5faW5fdGVybWluYWwgdG9vbCB0byBiZSByZWdpc3RlcmVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZWZyZXNoIHJ1bl9pbl90ZXJtaW5hbCB0b29sIGRhdGEgd2hlbiBzYW5kYm94IHNldHRpbmcgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjcmVhdGVDb250cmlidXRpb24oKTtcblxuXHRcdGNvbnN0IHRvb2xEYXRhQmVmb3JlID0gcmVnaXN0ZXJlZFRvb2xEYXRhLmdldChUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsKTtcblx0XHRvayh0b29sRGF0YUJlZm9yZSwgJ0V4cGVjdGVkIHJ1bl9pbl90ZXJtaW5hbCB0b29sIHRvIGJlIHJlZ2lzdGVyZWQnKTtcblx0XHRjb25zdCBwcm9wZXJ0aWVzQmVmb3JlID0gdG9vbERhdGFCZWZvcmUuaW5wdXRTY2hlbWE/LnByb3BlcnRpZXMgYXMgUmVjb3JkPHN0cmluZywgb2JqZWN0PiB8IHVuZGVmaW5lZDtcblx0XHRvayghcHJvcGVydGllc0JlZm9yZT8uWydyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24nXSwgJ0V4cGVjdGVkIG5vIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiBiZWZvcmUgZW5hYmxpbmcgc2FuZGJveCcpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclRvb2xEYXRhUmVnaXN0cmF0aW9uKCgpID0+IHtcblx0XHRcdC8vIEVuYWJsZSBzYW5kYm94IGFuZCBmaXJlIGNvbmZpZyBjaGFuZ2Vcblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24pO1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChrZXk6IHN0cmluZykgPT4ga2V5ID09PSBBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZCxcblx0XHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF0pLFxuXHRcdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdFx0Y2hhbmdlOiBudWxsISxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdG9vbERhdGFBZnRlciA9IHJlZ2lzdGVyZWRUb29sRGF0YS5nZXQoVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbCk7XG5cdFx0b2sodG9vbERhdGFBZnRlciwgJ0V4cGVjdGVkIHJ1bl9pbl90ZXJtaW5hbCB0b29sIHRvIHN0aWxsIGJlIHJlZ2lzdGVyZWQnKTtcblx0XHRjb25zdCBwcm9wZXJ0aWVzQWZ0ZXIgPSB0b29sRGF0YUFmdGVyLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzIGFzIFJlY29yZDxzdHJpbmcsIG9iamVjdD4gfCB1bmRlZmluZWQ7XG5cdFx0b2socHJvcGVydGllc0FmdGVyPy5bJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiddLCAnRXhwZWN0ZWQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uIGFmdGVyIGVuYWJsaW5nIHNhbmRib3gnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJlZnJlc2ggcnVuX2luX3Rlcm1pbmFsIHRvb2wgZGF0YSB3aGVuIHVuc2FuZGJveGVkIGNvbW1hbmQgYWxsb3dhbmNlIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdGF3YWl0IGNyZWF0ZUNvbnRyaWJ1dGlvbigpO1xuXG5cdFx0Y29uc3QgdG9vbERhdGFCZWZvcmUgPSByZWdpc3RlcmVkVG9vbERhdGEuZ2V0KFRlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWwpO1xuXHRcdG9rKHRvb2xEYXRhQmVmb3JlLCAnRXhwZWN0ZWQgcnVuX2luX3Rlcm1pbmFsIHRvb2wgdG8gYmUgcmVnaXN0ZXJlZCcpO1xuXHRcdGNvbnN0IHByb3BlcnRpZXNCZWZvcmUgPSB0b29sRGF0YUJlZm9yZS5pbnB1dFNjaGVtYT8ucHJvcGVydGllcyBhcyBSZWNvcmQ8c3RyaW5nLCBvYmplY3Q+IHwgdW5kZWZpbmVkO1xuXHRcdG9rKHByb3BlcnRpZXNCZWZvcmU/LlsncmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uJ10sICdFeHBlY3RlZCByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gYmVmb3JlIGRpc2FibGluZyB1bnNhbmRib3hlZCBjb21tYW5kcycpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclRvb2xEYXRhUmVnaXN0cmF0aW9uKCgpID0+IHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMsIGZhbHNlKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoa2V5OiBzdHJpbmcpID0+IGtleSA9PT0gQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcyxcblx0XHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dVbnNhbmRib3hlZENvbW1hbmRzXSksXG5cdFx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0XHRjaGFuZ2U6IG51bGwhLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCB0b29sRGF0YUFmdGVyID0gcmVnaXN0ZXJlZFRvb2xEYXRhLmdldChUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsKTtcblx0XHRvayh0b29sRGF0YUFmdGVyLCAnRXhwZWN0ZWQgcnVuX2luX3Rlcm1pbmFsIHRvb2wgdG8gc3RpbGwgYmUgcmVnaXN0ZXJlZCcpO1xuXHRcdGNvbnN0IHByb3BlcnRpZXNBZnRlciA9IHRvb2xEYXRhQWZ0ZXIuaW5wdXRTY2hlbWE/LnByb3BlcnRpZXMgYXMgUmVjb3JkPHN0cmluZywgb2JqZWN0PiB8IHVuZGVmaW5lZDtcblx0XHRvayghcHJvcGVydGllc0FmdGVyPy5bJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiddLCAnRXhwZWN0ZWQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uIHRvIGJlIHJlbW92ZWQgYWZ0ZXIgZGlzYWJsaW5nIHVuc2FuZGJveGVkIGNvbW1hbmRzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZWZyZXNoIHJ1bl9pbl90ZXJtaW5hbCB0b29sIGRhdGEgd2hlbiBzYW5kYm94IG5ldHdvcmsgc2V0dGluZyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRhd2FpdCBjcmVhdGVDb250cmlidXRpb24oKTtcblxuXHRcdGNvbnN0IHRvb2xEYXRhQmVmb3JlID0gcmVnaXN0ZXJlZFRvb2xEYXRhLmdldChUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsKTtcblx0XHRvayh0b29sRGF0YUJlZm9yZSwgJ0V4cGVjdGVkIHJ1bl9pbl90ZXJtaW5hbCB0b29sIHRvIGJlIHJlZ2lzdGVyZWQnKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JUb29sRGF0YVJlZ2lzdHJhdGlvbigoKSA9PiB7XG5cdFx0XHQvLyBGaXJlIG5ldHdvcmsgY29uZmlnIGNoYW5nZVxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChrZXk6IHN0cmluZykgPT4ga2V5ID09PSBBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuQWxsb3dlZE5ldHdvcmtEb21haW5zLFxuXHRcdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoW0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5BbGxvd2VkTmV0d29ya0RvbWFpbnNdKSxcblx0XHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRcdGNoYW5nZTogbnVsbCEsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRvb2xEYXRhQWZ0ZXIgPSByZWdpc3RlcmVkVG9vbERhdGEuZ2V0KFRlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWwpO1xuXHRcdG9rKHRvb2xEYXRhQWZ0ZXIsICdFeHBlY3RlZCBydW5faW5fdGVybWluYWwgdG9vbCB0byBzdGlsbCBiZSByZWdpc3RlcmVkIGFmdGVyIG5ldHdvcmsgc2V0dGluZyBjaGFuZ2UnKTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxJQUFJLG1CQUFtQjtBQUNoQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLFdBQVcsdUJBQXVCO0FBQ3BELFNBQVMsYUFBYTtBQUN0QixTQUFTLGNBQWlDO0FBQzFDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGFBQWE7QUFDdEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUywwQkFBMEI7QUFFbkMsU0FBUywwQkFBMEIseUJBQXlCO0FBQzVELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsb0JBQXdGO0FBQ2pHLFNBQVMsMEJBQTBC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QTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFHQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFHQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BR0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUdBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sZ0NBQWdDO0FBQUE7QUFBQSxNQUVyQztBQUFBO0FBQUEsTUFHQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BR0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BR0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEs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
