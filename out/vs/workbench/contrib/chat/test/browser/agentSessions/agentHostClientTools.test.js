import assert from "assert";
import { timeout } from "../../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { constObservable, observableValue, autorun } from "../../../../../../base/common/observable.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { AgentSession } from "../../../../../../platform/agentHost/common/agentService.js";
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from "../../../../../../platform/agentHost/common/toolSearchConstants.js";
import { isChatAction, isSessionAction } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { buildDefaultChatUri, buildSubagentChatUri, createChatState, createDefaultChatSummary, MessageKind, SessionLifecycle, SessionStatus, createSessionState, StateComponents, parseDefaultChatUri } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { chatReducer, sessionReducer } from "../../../../../../platform/agentHost/common/state/sessionReducers.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { IChatAgentService } from "../../../common/participants/chatAgents.js";
import { IChatService, IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { IChatEditingService } from "../../../common/editing/chatEditingService.js";
import { IChatResponseFileChangesService } from "../../../browser/chatResponseFileChangesService.js";
import { ILanguageModelsService } from "../../../common/languageModels.js";
import { ChatToolInvocation } from "../../../common/model/chatProgressTypes/chatToolInvocation.js";
import { PieceCtorKind, PromptNodeType } from "../../../common/tools/promptTsxTypes.js";
import { IProductService } from "../../../../../../platform/product/common/productService.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { AgentHostSessionHandler, toolDataToDefinition, toolResultToProtocol } from "../../../browser/agentSessions/agentHost/agentHostSessionHandler.js";
import { AgentHostActiveClientService, IAgentHostActiveClientService } from "../../../browser/agentSessions/agentHost/agentHostActiveClientService.js";
import { IAgentHostCustomizationService, NullAgentHostCustomizationService } from "../../../browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { IAgentHostToolSetEnablementService } from "../../../browser/agentSessions/agentHost/agentHostToolSetEnablementService.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TestFileService } from "../../../../../test/common/workbenchTestServices.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { MockLabelService } from "../../../../../services/label/test/common/mockLabelService.js";
import { IAgentHostFileSystemService } from "../../../../../services/agentHost/common/agentHostFileSystemService.js";
import { IAgentHostImportConversationStore } from "../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js";
import { IStorageService, InMemoryStorageService } from "../../../../../../platform/storage/common/storage.js";
import { ITerminalChatService } from "../../../../terminal/browser/terminal.js";
import { IAgentHostTerminalService } from "../../../../terminal/browser/agentHostTerminalService.js";
import { IAgentHostSessionWorkingDirectoryResolver } from "../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js";
import { ILanguageModelToolsService, ToolAndToolSetEnablementMap, ToolDataSource } from "../../../common/tools/languageModelToolsService.js";
import { IChatSessionsService } from "../../../common/chatSessionsService.js";
import { ICustomizationHarnessService } from "../../../common/customizationHarnessService.js";
import { IAgentPluginService } from "../../../common/plugins/agentPluginService.js";
import { IOutputService } from "../../../../../services/output/common/output.js";
import { IDefaultAccountService } from "../../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IAuthenticationService } from "../../../../../services/authentication/common/authentication.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import { IPromptsService } from "../../../common/promptSyntax/service/promptsService.js";
suite("AgentHostClientTools", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("toolDataToDefinition", () => {
    test("maps toolReferenceName, displayName, modelDescription, and inputSchema", () => {
      const tool = {
        id: "vscode.runTests",
        toolReferenceName: "runTests",
        displayName: "Run Tests",
        modelDescription: "Runs unit tests in files",
        userDescription: "Run tests",
        source: ToolDataSource.Internal,
        inputSchema: {
          type: "object",
          properties: {
            files: { type: "array", items: { type: "string" } }
          }
        }
      };
      const def = toolDataToDefinition(tool);
      assert.deepStrictEqual(def, {
        name: "runTests",
        title: "Run Tests",
        description: "Runs unit tests in files",
        inputSchema: {
          type: "object",
          properties: {
            files: { type: "array", items: { type: "string" } }
          }
        }
      });
    });
    test("falls back to id when toolReferenceName is undefined", () => {
      const tool = {
        id: "vscode.runTests",
        displayName: "Run Tests",
        modelDescription: "Runs unit tests",
        source: ToolDataSource.Internal
      };
      const def = toolDataToDefinition(tool);
      assert.strictEqual(def.name, "vscode.runTests");
    });
    test("omits inputSchema when schema type is not object", () => {
      const tool = {
        id: "myTool",
        toolReferenceName: "myTool",
        displayName: "My Tool",
        modelDescription: "A tool",
        source: ToolDataSource.Internal,
        inputSchema: { type: "string" }
      };
      const def = toolDataToDefinition(tool);
      assert.strictEqual(def.inputSchema, void 0);
    });
    test("omits inputSchema when not provided", () => {
      const tool = {
        id: "myTool",
        toolReferenceName: "myTool",
        displayName: "My Tool",
        modelDescription: "A tool",
        source: ToolDataSource.Internal
      };
      const def = toolDataToDefinition(tool);
      assert.strictEqual(def.inputSchema, void 0);
    });
  });
  suite("toolResultToProtocol", () => {
    test("converts successful result with text content", () => {
      const result = {
        content: [
          { kind: "text", value: "All 5 tests passed" }
        ],
        toolResultMessage: "Ran 5 tests"
      };
      const proto = toolResultToProtocol(result, "runTests");
      assert.deepStrictEqual(proto, {
        success: true,
        pastTenseMessage: "Ran 5 tests",
        content: [{ type: ToolResultContentType.Text, text: "All 5 tests passed" }],
        error: void 0
      });
    });
    test("converts prompt TSX results to text content", () => {
      const result = {
        content: [{
          kind: "promptTsx",
          value: {
            node: {
              type: PromptNodeType.Piece,
              ctor: PieceCtorKind.Other,
              children: [
                { type: PromptNodeType.Text, text: "<diagnostics>", lineBreakBefore: void 0 },
                { type: PromptNodeType.Text, text: "1 problem found", lineBreakBefore: true },
                { type: PromptNodeType.Text, text: "</diagnostics>", lineBreakBefore: true }
              ]
            }
          }
        }],
        toolResultMessage: "Checked math.js, 1 problem found"
      };
      assert.deepStrictEqual(toolResultToProtocol(result, "problems"), {
        success: true,
        pastTenseMessage: "Checked math.js, 1 problem found",
        content: [{
          type: ToolResultContentType.Text,
          text: "<diagnostics>\n1 problem found\n</diagnostics>"
        }],
        error: void 0
      });
    });
    test("converts failed result with error", () => {
      const result = {
        content: [{ kind: "text", value: "Build failed" }],
        toolResultError: "Compilation error in file.ts"
      };
      const proto = toolResultToProtocol(result, "runTask");
      assert.deepStrictEqual(proto, {
        success: false,
        pastTenseMessage: "runTask failed",
        content: [{ type: ToolResultContentType.Text, text: "Build failed" }],
        error: { message: "Compilation error in file.ts" }
      });
    });
    test("uses default past tense message when toolResultMessage is absent", () => {
      const result = {
        content: [{ kind: "text", value: "done" }]
      };
      const proto = toolResultToProtocol(result, "myTool");
      assert.strictEqual(proto.pastTenseMessage, "Ran myTool");
    });
    test("preserves markdown tool result messages", () => {
      const result = {
        content: [],
        toolResultMessage: new MarkdownString("Opened [Browser](vscode-browser:/page-1?vscodeLinkType=browser)")
      };
      assert.deepStrictEqual(toolResultToProtocol(result, "open_browser_page").pastTenseMessage, {
        markdown: "Opened [Browser](vscode-browser:/page-1?vscodeLinkType=browser)"
      });
    });
    test("converts text and data content parts", () => {
      const binaryData = VSBuffer.fromString("hello binary");
      const result = {
        content: [
          { kind: "text", value: "hello" },
          { kind: "data", value: { mimeType: "image/png", data: binaryData } },
          { kind: "text", value: "world" }
        ]
      };
      const proto = toolResultToProtocol(result, "tool");
      assert.strictEqual(proto.content?.length, 3);
      assert.deepStrictEqual(proto.content[0], { type: ToolResultContentType.Text, text: "hello" });
      assert.strictEqual(proto.content[1].type, ToolResultContentType.EmbeddedResource);
      assert.strictEqual(proto.content[1].contentType, "image/png");
      const embeddedData = proto.content[1].data;
      assert.ok(embeddedData.length > 0);
      assert.notStrictEqual(embeddedData, "hello binary");
      assert.deepStrictEqual(proto.content[2], { type: ToolResultContentType.Text, text: "world" });
    });
    test("converts data parts to EmbeddedResource with base64 encoding", () => {
      const binaryData = VSBuffer.fromString("test data");
      const result = {
        content: [
          { kind: "data", value: { mimeType: "image/png", data: binaryData } }
        ]
      };
      const proto = toolResultToProtocol(result, "tool");
      assert.strictEqual(proto.content?.length, 1);
      assert.strictEqual(proto.content[0].type, ToolResultContentType.EmbeddedResource);
      const embedded = proto.content[0];
      assert.strictEqual(embedded.contentType, "image/png");
      assert.ok(embedded.data.length > 0);
      assert.notStrictEqual(embedded.data, "test data");
    });
    test("uses boolean toolResultError as generic error message", () => {
      const result = {
        content: [],
        toolResultError: true
      };
      const proto = toolResultToProtocol(result, "myTool");
      assert.strictEqual(proto.success, false);
      assert.strictEqual(proto.error?.message, "myTool encountered an error");
    });
  });
  suite("client tools registration", () => {
    function createMockToolsService(disposables2, tools, options) {
      const onDidChangeTools = disposables2.add(new Emitter());
      const pendingToolCalls = /* @__PURE__ */ new Map();
      const begunToolCalls = [];
      const invokedToolCalls = [];
      const recordedStateKinds = /* @__PURE__ */ new Map();
      return {
        onDidChangeTools: onDidChangeTools.event,
        getToolByName: (name) => tools.find((t) => t.toolReferenceName === name),
        observeTools: () => observableValue("tools", tools),
        registerToolData: () => toDisposable(() => {
        }),
        registerToolImplementation: () => toDisposable(() => {
        }),
        registerTool: () => toDisposable(() => {
        }),
        getTools: () => tools,
        getAllToolsIncludingDisabled: () => tools,
        getTool: (id) => tools.find((t) => t.id === id),
        invokeTool: async (invocation, _countTokens, token) => {
          invokedToolCalls.push(invocation);
          const toolInvocation = pendingToolCalls.get(invocation.chatStreamToolCallId ?? invocation.callId);
          pendingToolCalls.delete(invocation.chatStreamToolCallId ?? invocation.callId);
          if (options?.throwBeforeConfirmation) {
            throw options.throwBeforeConfirmation;
          }
          if (options?.requireConfirmation && toolInvocation) {
            toolInvocation.transitionFromStreaming({
              invocationMessage: "Run Task",
              confirmationMessages: {
                title: "Confirm tool execution",
                message: "Run the task?"
              }
            }, invocation.parameters, invocation.preApproved);
            const confirmed = await IChatToolInvocation.awaitConfirmation(toolInvocation, token ?? CancellationToken.None);
            if (confirmed.type === ToolConfirmKind.Denied || confirmed.type === ToolConfirmKind.Skipped) {
              const state = toolInvocation.state.get();
              if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
                state.confirm(confirmed);
              }
              throw new CancellationError();
            }
          } else {
            const prepared = toolInvocation?.toolSpecificData?.kind === "subagent" ? {
              invocationMessage: "Delegating task",
              toolSpecificData: {
                kind: "subagent",
                description: "Prepared delegated task"
              }
            } : void 0;
            toolInvocation?.transitionFromStreaming(prepared, invocation.parameters, { type: ToolConfirmKind.ConfirmationNotNeeded });
          }
          const result = { content: [{ kind: "text", value: "done" }] };
          await toolInvocation?.didExecuteTool(result);
          return result;
        },
        beginToolCall: (options2) => {
          const toolData = tools.find((t) => t.id === options2.toolId);
          if (!toolData) {
            return void 0;
          }
          const invocation = ChatToolInvocation.createStreaming({
            toolCallId: options2.toolCallId,
            toolId: options2.toolId,
            toolData,
            subagentInvocationId: options2.subagentInvocationId
          });
          pendingToolCalls.set(options2.toolCallId, invocation);
          begunToolCalls.push(invocation);
          const stateKinds = [];
          recordedStateKinds.set(options2.toolCallId, stateKinds);
          disposables2.add(autorun((reader) => {
            stateKinds.push(invocation.state.read(reader).type);
          }));
          return invocation;
        },
        updateToolStream: async () => {
        },
        cancelToolCallsForRequest: () => {
        },
        flushToolUpdates: () => {
        },
        toolSets: observableValue("sets", []),
        getToolSetsForModel: () => [],
        getToolSet: () => void 0,
        getToolSetByName: () => void 0,
        createToolSet: () => {
          throw new Error("not impl");
        },
        getFullReferenceNames: () => [],
        getFullReferenceName: () => "",
        getFullReferenceNameMap: () => /* @__PURE__ */ new Map(),
        getToolByFullReferenceName: () => void 0,
        getDeprecatedFullReferenceNames: () => /* @__PURE__ */ new Map(),
        toToolAndToolSetEnablementMap: () => ToolAndToolSetEnablementMap.fromEntries([]),
        toFullReferenceNames: () => [],
        toToolReferences: () => [],
        vscodeToolSet: void 0,
        executeToolSet: void 0,
        readToolSet: void 0,
        agentToolSet: void 0,
        onDidPrepareToolCallBecomeUnresponsive: Event.None,
        onDidInvokeTool: Event.None,
        _serviceBrand: void 0,
        fireOnDidChangeTools: () => onDidChangeTools.fire(),
        begunToolCalls,
        invokedToolCalls,
        recordedStateKinds
      };
    }
    class MockAgentHostConnection extends mock() {
      constructor() {
        super(...arguments);
        this.clientId = "test-client";
        this._onDidAction = disposables.add(new Emitter());
        this.onDidAction = this._onDidAction.event;
        this._onDidNotification = disposables.add(new Emitter());
        this.onDidNotification = this._onDidNotification.event;
        this.onAgentHostExit = Event.None;
        this.onAgentHostStart = Event.None;
        this.initializeResult = constObservable(void 0);
        this._liveSubscriptions = /* @__PURE__ */ new Map();
        this.dispatchedActions = [];
        this.rootState = {
          value: void 0,
          verifiedValue: void 0,
          onDidChange: Event.None,
          onWillApplyAction: Event.None,
          onDidApplyAction: Event.None
        };
      }
      dispatch(channel, action) {
        this.dispatchedActions.push({ channel, action });
        if (isSessionAction(action) || isChatAction(action)) {
          this.applySessionAction(channel, action);
        }
      }
      applySessionAction(channel, action) {
        const channelStr = typeof channel === "string" ? channel : channel.toString();
        if (isChatAction(action)) {
          const chatChannel = parseDefaultChatUri(channelStr) !== void 0 ? channelStr : void 0;
          assert.ok(chatChannel, `chat actions must be dispatched on an ahp-chat channel: ${action.type}`);
          const entry2 = this._ensureLiveSubscription(StateComponents.Chat, chatChannel);
          entry2.state = chatReducer(entry2.state, action, () => {
          });
          entry2.emitter.fire(entry2.state);
          return;
        }
        const entry = this._ensureLiveSubscription(StateComponents.Session, channelStr);
        entry.state = sessionReducer(entry.state, action, () => {
        });
        entry.emitter.fire(entry.state);
      }
      getSubscription(kind, resource) {
        const resourceStr = resource.toString();
        this._ensureLiveSubscription(kind, resourceStr);
        const entry = this._liveSubscriptions.get(resourceStr);
        const emitter = entry.emitter;
        const self = this;
        const sub = {
          get value() {
            return self._liveSubscriptions.get(resourceStr)?.state;
          },
          get verifiedValue() {
            return self._liveSubscriptions.get(resourceStr)?.state;
          },
          onDidChange: emitter.event,
          onWillApplyAction: Event.None,
          onDidApplyAction: Event.None
        };
        return {
          object: sub,
          dispose: () => {
            this._liveSubscriptions.delete(resourceStr);
          }
        };
      }
      _ensureLiveSubscription(kind, resourceStr) {
        let entry = this._liveSubscriptions.get(resourceStr);
        if (entry) {
          return entry;
        }
        const emitter = disposables.add(new Emitter());
        const sessionResource = kind === StateComponents.Chat ? parseDefaultChatUri(resourceStr) : resourceStr;
        assert.ok(sessionResource, `chat subscriptions must use an ahp-chat channel: ${resourceStr}`);
        const summary = {
          resource: sessionResource,
          provider: "copilot",
          title: "Test",
          status: SessionStatus.Idle,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        const defaultChat = buildDefaultChatUri(sessionResource);
        const initialState = kind === StateComponents.Chat ? createChatState(createDefaultChatSummary(summary, resourceStr)) : {
          ...createSessionState(summary),
          lifecycle: SessionLifecycle.Ready,
          defaultChat,
          chats: [createDefaultChatSummary(summary, defaultChat)]
        };
        entry = { state: initialState, emitter };
        this._liveSubscriptions.set(resourceStr, entry);
        return entry;
      }
    }
    function createHandlerWithMocks(disposables2, tools, toolServiceOptions) {
      const instantiationService = disposables2.add(new TestInstantiationService());
      const connection = new MockAgentHostConnection();
      const toolsService = createMockToolsService(disposables2, tools, toolServiceOptions);
      const configValues = {};
      const onDidChangeConfig = disposables2.add(new Emitter());
      const configService = {
        getValue: (key) => configValues[key],
        onDidChangeConfiguration: onDidChangeConfig.event
      };
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(IProductService, { quality: "insider" });
      instantiationService.stub(IChatEntitlementService, { entitlement: ChatEntitlement.Free, quotas: {} });
      instantiationService.stub(IChatAgentService, {
        registerDynamicAgent: () => toDisposable(() => {
        })
      });
      instantiationService.stub(IFileService, TestFileService);
      instantiationService.stub(ILabelService, MockLabelService);
      instantiationService.stub(IChatSessionsService, {
        registerChatSessionItemController: () => toDisposable(() => {
        }),
        registerChatSessionContentProvider: () => toDisposable(() => {
        }),
        registerChatSessionContribution: () => toDisposable(() => {
        })
      });
      instantiationService.stub(IDefaultAccountService, { onDidChangeDefaultAccount: Event.None, getDefaultAccount: async () => null });
      instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None });
      instantiationService.stub(ILanguageModelsService, {
        deltaLanguageModelChatProviderDescriptors: () => {
        },
        registerLanguageModelProvider: () => toDisposable(() => {
        })
      });
      instantiationService.stub(IConfigurationService, configService);
      instantiationService.stub(IOutputService, { getChannel: () => void 0 });
      instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => ({ id: "", folders: [] }), getWorkspaceFolder: () => null });
      instantiationService.stub(IChatEditingService, {
        registerEditingSessionProvider: () => toDisposable(() => {
        })
      });
      instantiationService.stub(IChatResponseFileChangesService, {
        registerProvider: () => toDisposable(() => {
        })
      });
      instantiationService.stub(IChatService, {
        getSession: () => void 0,
        onDidCreateModel: Event.None,
        removePendingRequest: () => {
        }
      });
      instantiationService.stub(IAgentHostFileSystemService, {
        registerAuthority: () => toDisposable(() => {
        }),
        ensureSyncedCustomizationProvider: () => {
        }
      });
      instantiationService.stub(IAgentHostCustomizationService, new NullAgentHostCustomizationService());
      instantiationService.stub(IStorageService, disposables2.add(new InMemoryStorageService()));
      instantiationService.stub(IAgentHostImportConversationStore, {
        set: () => {
        },
        take: () => void 0,
        rename: () => {
        }
      });
      instantiationService.stub(ICustomizationHarnessService, {
        registerExternalHarness: () => toDisposable(() => {
        })
      });
      instantiationService.stub(IAgentPluginService, {
        plugins: observableValue("plugins", [])
      });
      instantiationService.stub(IPromptsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeCustomAgents = Event.None;
          this.onDidChangeSlashCommands = Event.None;
          this.onDidChangeSkills = Event.None;
          this.onDidChangeInstructions = Event.None;
          this.onDidChangeAgentInstructions = Event.None;
        }
        async listPromptFilesForStorage() {
          return [];
        }
      }());
      instantiationService.stub(ITerminalChatService, {
        onDidContinueInBackground: Event.None,
        registerTerminalInstanceWithToolSession: () => {
        },
        getAhpCommandSource: () => void 0
      });
      instantiationService.stub(IAgentHostTerminalService, {
        reviveTerminal: async () => void 0,
        createTerminalForEntry: async () => void 0,
        profiles: observableValue("test", []),
        getProfileForConnection: () => void 0,
        registerEntry: () => ({ dispose() {
        } })
      });
      instantiationService.stub(IAgentHostSessionWorkingDirectoryResolver, {
        registerResolver: () => toDisposable(() => {
        }),
        resolve: () => void 0,
        isNewSession: () => false
      });
      instantiationService.stub(ILanguageModelToolsService, toolsService);
      instantiationService.stub(IAgentHostToolSetEnablementService, {
        observe: () => constObservable({ toolSets: /* @__PURE__ */ new Map(), tools: /* @__PURE__ */ new Map() }),
        getState: () => ({ toolSets: /* @__PURE__ */ new Map(), tools: /* @__PURE__ */ new Map() }),
        setToolSetEnabled: () => {
        },
        setToolEnabled: () => {
        }
      });
      const activeClientService = disposables2.add(instantiationService.createInstance(AgentHostActiveClientService));
      instantiationService.stub(IAgentHostActiveClientService, activeClientService);
      const handler = disposables2.add(instantiationService.createInstance(AgentHostSessionHandler, {
        provider: "copilot",
        agentId: "agent-host-copilot",
        sessionType: "agent-host-copilot",
        fullName: "Test",
        description: "Test",
        connection,
        connectionAuthority: "local"
      }));
      return { handler, connection, toolsService, configValues, onDidChangeConfig };
    }
    const testRunTestsTool = {
      id: "vscode.runTests",
      toolReferenceName: "runTests",
      displayName: "Run Tests",
      modelDescription: "Runs unit tests",
      source: ToolDataSource.Internal,
      inputSchema: { type: "object", properties: { files: { type: "array" } } }
    };
    const testRunTaskTool = {
      id: "vscode.runTask",
      toolReferenceName: "runTask",
      displayName: "Run Task",
      modelDescription: "Runs a VS Code task",
      source: ToolDataSource.Internal,
      inputSchema: { type: "object", properties: { task: { type: "string" } } }
    };
    const testSubagentTool = {
      id: "runSubagent",
      toolReferenceName: "task",
      displayName: "Run Subagent",
      modelDescription: "Runs a delegated task",
      source: ToolDataSource.Internal,
      inputSchema: { type: "object", properties: {} }
    };
    const testUnlistedTool = {
      id: "vscode.readFile",
      toolReferenceName: "readFile",
      displayName: "Read File",
      modelDescription: "Reads a file",
      source: ToolDataSource.Internal
    };
    const testToolSearchTool = {
      id: "vscode.toolSearch",
      toolReferenceName: CLIENT_TOOL_SEARCH_REFERENCE_NAME,
      displayName: "Search Tools",
      modelDescription: "Searches for tools",
      source: ToolDataSource.Internal,
      inputSchema: { type: "object", properties: { query: { type: "string" } } }
    };
    async function provideSessionWithReadyRunTaskTool(handler, connection) {
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmationTitle: "Run Task"
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      await timeout(0);
    }
    function getToolCallConfirmationAndCompletionActions(connection) {
      return connection.dispatchedActions.filter((entry) => isChatAction(entry.action) && (entry.action.type === ActionType.ChatToolCallConfirmed || entry.action.type === ActionType.ChatToolCallComplete) && entry.action.toolCallId === "tool-call-1").map((entry) => {
        if (entry.action.type === ActionType.ChatToolCallConfirmed) {
          return {
            type: entry.action.type,
            approved: entry.action.approved,
            success: void 0,
            error: void 0
          };
        }
        if (entry.action.type === ActionType.ChatToolCallComplete) {
          return {
            type: entry.action.type,
            approved: void 0,
            success: entry.action.result.success,
            error: entry.action.result.error?.message
          };
        }
        throw new Error(`Unexpected action type: ${entry.action.type}`);
      });
    }
    test("maps tool data to protocol definitions", async () => {
      const { connection } = createHandlerWithMocks(disposables, [testRunTestsTool, testRunTaskTool, testUnlistedTool]);
      assert.ok(connection);
      const runTestsDef = toolDataToDefinition(testRunTestsTool);
      assert.strictEqual(runTestsDef.name, "runTests");
      assert.strictEqual(runTestsDef.title, "Run Tests");
      assert.strictEqual(runTestsDef.description, "Runs unit tests");
    });
    test("handles tools with when clauses via observeTools filtering", () => {
      const def = toolDataToDefinition(testRunTestsTool);
      assert.strictEqual(def.name, "runTests");
    });
    test("invokes an owned client tool when reconnecting to an active turn", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual(toolsService.invokedToolCalls.map((call) => ({
        callId: call.callId,
        toolId: call.toolId,
        parameters: call.parameters,
        chatStreamToolCallId: call.chatStreamToolCallId
      })), [{
        callId: "tool-call-1",
        toolId: "vscode.runTask",
        parameters: { task: "build" },
        chatStreamToolCallId: "tool-call-1"
      }]);
      assert.ok(connection.dispatchedActions.some((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "tool-call-1"));
    });
    test("tool-search completion drops candidates while preserving unknown metadata", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testToolSearchTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "find a calculator", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-search-call-1",
        toolName: RUNTIME_TOOL_SEARCH_TOOL_NAME,
        displayName: "Search Tools",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-search-call-1",
        invocationMessage: "Search Tools",
        toolInput: '{"query":"calculator"}',
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: {
          toolSearchCandidates: [{ name: "calculator", description: "Adds numbers" }],
          futureMetadata: { preserve: true }
        }
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      await timeout(0);
      const completion = connection.dispatchedActions.find((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "tool-search-call-1");
      assert.ok(completion && isChatAction(completion.action) && completion.action.type === ActionType.ChatToolCallComplete);
      assert.deepStrictEqual({
        parameters: toolsService.invokedToolCalls[0]?.parameters,
        meta: completion.action._meta
      }, {
        parameters: {
          query: "calculator",
          candidateTools: [{ name: "calculator", description: "Adds numbers" }]
        },
        meta: { futureMetadata: { preserve: true } }
      });
    });
    test("invalid tool-search input drops candidates while preserving unknown metadata", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testToolSearchTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "find a calculator", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-search-call-invalid",
        toolName: RUNTIME_TOOL_SEARCH_TOOL_NAME,
        displayName: "Search Tools",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-search-call-invalid",
        invocationMessage: "Search Tools",
        toolInput: "{invalid",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: {
          toolSearchCandidates: [{ name: "calculator", description: "Adds numbers" }],
          futureMetadata: { preserve: true }
        }
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      await timeout(0);
      const completion = connection.dispatchedActions.find((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "tool-search-call-invalid");
      assert.ok(completion && isChatAction(completion.action) && completion.action.type === ActionType.ChatToolCallComplete);
      assert.deepStrictEqual({
        invokedToolCalls: toolsService.invokedToolCalls.length,
        success: completion.action.result.success,
        meta: completion.action._meta
      }, {
        invokedToolCalls: 0,
        success: false,
        meta: { futureMetadata: { preserve: true } }
      });
    });
    test("shows another client tool as cancellable progress without invoking or confirming it", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "owner-client" }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmationTitle: "Allow Run Task?"
      });
      const session = await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      await timeout(0);
      const invocation = session.progressObs.get().find((part) => part instanceof ChatToolInvocation && part.toolCallId === "tool-call-1");
      assert.ok(invocation);
      const actionsBeforeSkip = getToolCallConfirmationAndCompletionActions(connection);
      const stateBeforeSkip = invocation.state.get().type;
      const messageBeforeSkip = invocation.invocationMessage;
      invocation.otherClientToolCall?.cancel();
      await timeout(0);
      assert.deepStrictEqual({
        messageBeforeSkip,
        messageAfterSkip: invocation.invocationMessage,
        stateBeforeSkip,
        stateAfterSkip: invocation.state.get().type,
        invokedToolCallCount: toolsService.invokedToolCalls.length,
        actionsBeforeSkip,
        actionsAfterSkip: getToolCallConfirmationAndCompletionActions(connection)
      }, {
        messageBeforeSkip: "Running Run Task on another client...",
        messageAfterSkip: "Run Task",
        stateBeforeSkip: IChatToolInvocation.StateKind.Executing,
        stateAfterSkip: IChatToolInvocation.StateKind.Completed,
        invokedToolCallCount: 0,
        actionsBeforeSkip: [],
        actionsAfterSkip: [{
          type: ActionType.ChatToolCallComplete,
          approved: void 0,
          success: false,
          error: "Run Task was skipped from another client"
        }]
      });
    });
    test("reports client tool prepare failures before confirmation as failed completion", async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool], { throwBeforeConfirmation: new Error("prepare failed") });
      await provideSessionWithReadyRunTaskTool(handler, connection);
      assert.deepStrictEqual(getToolCallConfirmationAndCompletionActions(connection), [{
        type: ActionType.ChatToolCallComplete,
        approved: void 0,
        success: false,
        error: "prepare failed"
      }]);
    });
    test("reports client tool cancellation before confirmation as failed completion when protocol call is not terminal", async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool], { throwBeforeConfirmation: new CancellationError() });
      await provideSessionWithReadyRunTaskTool(handler, connection);
      assert.deepStrictEqual(getToolCallConfirmationAndCompletionActions(connection), [{
        type: ActionType.ChatToolCallComplete,
        approved: void 0,
        success: false,
        error: "Canceled"
      }]);
    });
    test("auto-approves client tool confirmation as a setting when the agent host marks the call", async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmationTitle: "Run Task",
        _meta: { autoApproveBySetting: true }
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual(connection.dispatchedActions.filter((entry) => isChatAction(entry.action) && (entry.action.type === ActionType.ChatToolCallConfirmed || entry.action.type === ActionType.ChatToolCallComplete) && entry.action.toolCallId === "tool-call-1").map((entry) => {
        if (entry.action.type === ActionType.ChatToolCallConfirmed) {
          return {
            type: entry.action.type,
            approved: entry.action.approved,
            confirmed: entry.action.approved ? entry.action.confirmed : void 0,
            success: void 0
          };
        }
        if (entry.action.type === ActionType.ChatToolCallComplete) {
          return {
            type: entry.action.type,
            approved: void 0,
            confirmed: void 0,
            success: entry.action.result.success
          };
        }
        throw new Error(`Unexpected action type: ${entry.action.type}`);
      }), [
        {
          type: ActionType.ChatToolCallConfirmed,
          approved: true,
          confirmed: ToolCallConfirmationReason.Setting,
          success: void 0
        },
        {
          type: ActionType.ChatToolCallComplete,
          approved: void 0,
          confirmed: void 0,
          success: true
        }
      ]);
    });
    test("protocol-confirmed client tool never enters WaitingForConfirmation (no needs-input flicker)", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual(
        {
          preApprovedKind: toolsService.invokedToolCalls[0]?.preApproved?.type,
          sawWaitingForConfirmation: (toolsService.recordedStateKinds.get("tool-call-1") ?? []).includes(IChatToolInvocation.StateKind.WaitingForConfirmation)
        },
        {
          preApprovedKind: ToolConfirmKind.ConfirmationNotNeeded,
          sawWaitingForConfirmation: false
        }
      );
    });
    async function reachLocalWaitingForConfirmation(handler, connection) {
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmationTitle: "Run Task"
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      await timeout(0);
      return chatURI;
    }
    test("resolves a waiting client tool confirmation when the agent host approves it late, preserving the reason", async () => {
      const reasons = [
        ToolCallConfirmationReason.NotNeeded,
        ToolCallConfirmationReason.Setting,
        ToolCallConfirmationReason.UserAction
      ];
      const results = [];
      for (const reason of reasons) {
        const local = disposables.add(new DisposableStore());
        const { handler, connection, toolsService } = createHandlerWithMocks(local, [testRunTaskTool], { requireConfirmation: true });
        const chatURI = await reachLocalWaitingForConfirmation(handler, connection);
        const sawWaitingForConfirmation = (toolsService.recordedStateKinds.get("tool-call-1") ?? []).includes(IChatToolInvocation.StateKind.WaitingForConfirmation);
        connection.applySessionAction(chatURI, {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tool-call-1",
          invocationMessage: "Run Task",
          toolInput: '{"task":"build"}',
          confirmed: reason
        });
        await timeout(0);
        await timeout(0);
        const confirmedAction = connection.dispatchedActions.find((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallConfirmed && entry.action.toolCallId === "tool-call-1");
        results.push({
          reason,
          sawWaitingForConfirmation,
          dispatchedConfirmed: confirmedAction && confirmedAction.action.type === ActionType.ChatToolCallConfirmed && confirmedAction.action.approved ? confirmedAction.action.confirmed : void 0,
          completed: connection.dispatchedActions.some((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "tool-call-1" && entry.action.result.success === true)
        });
        disposables.delete(local);
      }
      assert.deepStrictEqual(results, reasons.map((reason) => ({
        reason,
        sawWaitingForConfirmation: true,
        dispatchedConfirmed: reason,
        completed: true
      })));
    });
    test("does not confirm or execute a waiting client tool when the protocol call completes while still pending", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
      const chatURI = await reachLocalWaitingForConfirmation(handler, connection);
      const sawWaitingForConfirmation = (toolsService.recordedStateKinds.get("tool-call-1") ?? []).includes(IChatToolInvocation.StateKind.WaitingForConfirmation);
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        result: { success: true, pastTenseMessage: "Ran task" }
      });
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual({
        sawWaitingForConfirmation,
        sawExecuting: (toolsService.recordedStateKinds.get("tool-call-1") ?? []).includes(IChatToolInvocation.StateKind.Executing),
        dispatchedApproval: connection.dispatchedActions.some((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallConfirmed && entry.action.toolCallId === "tool-call-1" && entry.action.approved === true)
      }, {
        sawWaitingForConfirmation: true,
        sawExecuting: false,
        dispatchedApproval: false
      });
    });
    test("reconnecting to an active turn with owned client tool completes the initial snapshot invocation", async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const session = await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      const snapshotInvocation = session.progressObs.get().find((p) => p instanceof ChatToolInvocation && p.toolCallId === "tool-call-1");
      assert.ok(snapshotInvocation, "activeTurnToProgress should have created a snapshot invocation");
      await timeout(0);
      await timeout(0);
      assert.ok(
        IChatToolInvocation.isComplete(snapshotInvocation),
        "the initial snapshot invocation should be completed, not orphaned"
      );
    });
    test("invokes a client tool inside a subagent session and dispatches completion against the subagent URI", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const parentToolCallId = "tc-parent-task";
      const subagentChat = buildSubagentChatUri(backendSession, parentToolCallId);
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "do work", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: parentToolCallId,
        toolName: "task",
        displayName: "Task",
        _meta: { toolKind: "subagent" }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: parentToolCallId,
        invocationMessage: "Spawning subagent",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallContentChanged,
        turnId: "turn-1",
        toolCallId: parentToolCallId,
        content: [{ type: ToolResultContentType.Subagent, resource: subagentChat, title: "Subagent" }]
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatTurnStarted,
        turnId: "sub-turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatToolCallStart,
        turnId: "sub-turn-1",
        toolCallId: "inner-tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatToolCallReady,
        turnId: "sub-turn-1",
        toolCallId: "inner-tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      const innerInvocation = toolsService.invokedToolCalls.find((call) => call.callId === "inner-tool-call-1");
      assert.ok(innerInvocation, "inner client tool inside the subagent should be invoked locally");
      assert.strictEqual(innerInvocation.toolId, "vscode.runTask");
      assert.deepStrictEqual(innerInvocation.parameters, { task: "build" });
      const completionEntry = connection.dispatchedActions.find(
        (entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "inner-tool-call-1"
      );
      assert.ok(completionEntry, "completion for the inner client tool should be dispatched");
      assert.strictEqual(
        completionEntry.channel.toString(),
        subagentChat,
        "completion should target the subagent default chat URI"
      );
    });
    test("observes child tools from a client-provided delegated task", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testSubagentTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const parentToolCallId = "client-task-1";
      const subagentChat = buildSubagentChatUri(backendSession, parentToolCallId);
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "delegate work", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: parentToolCallId,
        toolName: "task",
        displayName: "Delegated Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
        _meta: { toolKind: "subagent", subagentChatUri: subagentChat }
      });
      const session = await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      const parentInvocation = toolsService.begunToolCalls.find((part) => part.toolCallId === parentToolCallId);
      assert.strictEqual(parentInvocation?.toolSpecificData?.kind, "subagent");
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: parentToolCallId,
        invocationMessage: "Delegating task",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatTurnStarted,
        turnId: "sub-turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatToolCallStart,
        turnId: "sub-turn-1",
        toolCallId: "child-tool-1",
        toolName: "bash",
        displayName: "Bash"
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatToolCallReady,
        turnId: "sub-turn-1",
        toolCallId: "child-tool-1",
        invocationMessage: "Inspecting changes",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await timeout(0);
      await timeout(0);
      const progress = session.progressObs.get();
      const childInvocations = progress.filter((part) => part instanceof ChatToolInvocation && part.toolCallId === "child-tool-1");
      assert.deepStrictEqual({
        parent: parentInvocation?.toolSpecificData,
        childCount: childInvocations.length,
        childSubAgentInvocationId: childInvocations[0]?.subAgentInvocationId
      }, {
        parent: {
          kind: "subagent",
          description: "Prepared delegated task",
          agentName: void 0,
          chatResource: subagentChat,
          isActive: true,
          startedAt: Date.parse("2025-01-01T00:00:00.000Z"),
          duration: void 0
        },
        childCount: 1,
        childSubAgentInvocationId: parentToolCallId
      });
    });
    test("invokes a client tool inside a nested (level-2) subagent and groups it under the root", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const rootToolCallId = "tc-l1-task";
      const nestedToolCallId = "tc-l2-task";
      const subagentChat1 = buildSubagentChatUri(backendSession, rootToolCallId);
      const subagentChat2 = buildSubagentChatUri(backendSession, nestedToolCallId);
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "do work", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: rootToolCallId,
        toolName: "task",
        displayName: "Task",
        _meta: { toolKind: "subagent" }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: rootToolCallId,
        invocationMessage: "Spawning subagent",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallContentChanged,
        turnId: "turn-1",
        toolCallId: rootToolCallId,
        content: [{ type: ToolResultContentType.Subagent, resource: subagentChat1, title: "Subagent L1" }]
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatTurnStarted,
        turnId: "sub-turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatToolCallStart,
        turnId: "sub-turn-1",
        toolCallId: nestedToolCallId,
        toolName: "task",
        displayName: "Task",
        _meta: { toolKind: "subagent" }
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatToolCallReady,
        turnId: "sub-turn-1",
        toolCallId: nestedToolCallId,
        invocationMessage: "Spawning nested subagent",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatToolCallContentChanged,
        turnId: "sub-turn-1",
        toolCallId: nestedToolCallId,
        content: [{ type: ToolResultContentType.Subagent, resource: subagentChat2, title: "Subagent L2" }]
      });
      connection.applySessionAction(URI.parse(subagentChat2), {
        type: ActionType.ChatTurnStarted,
        turnId: "sub-turn-2",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(subagentChat2), {
        type: ActionType.ChatToolCallStart,
        turnId: "sub-turn-2",
        toolCallId: "deep-tool-call",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(subagentChat2), {
        type: ActionType.ChatToolCallReady,
        turnId: "sub-turn-2",
        toolCallId: "deep-tool-call",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      for (let i = 0; i < 200 && !connection.dispatchedActions.some((e) => isChatAction(e.action) && e.action.type === ActionType.ChatToolCallComplete && e.action.toolCallId === "deep-tool-call"); i++) {
        await timeout(1);
      }
      const deepInvocation = toolsService.invokedToolCalls.find((call) => call.callId === "deep-tool-call");
      assert.ok(deepInvocation, "client tool inside a nested subagent should be invoked locally");
      assert.deepStrictEqual(deepInvocation.parameters, { task: "build" });
      const completionEntry = connection.dispatchedActions.find(
        (entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "deep-tool-call"
      );
      assert.ok(completionEntry, "completion for the nested client tool should be dispatched");
      assert.strictEqual(completionEntry.channel.toString(), subagentChat2, "completion should target the level-2 subagent chat URI");
      const deepBegun = toolsService.begunToolCalls.find((c) => c.toolCallId === "deep-tool-call");
      assert.strictEqual(deepBegun?.subAgentInvocationId, rootToolCallId, "descendant tools should be grouped under the root subagent invocation");
    });
    test("observes a nested subagent without a discovery content block (agent-host misroutes it)", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const rootToolCallId = "tc-l1-task";
      const nestedToolCallId = "tc-l2-task";
      const subagentChat1 = buildSubagentChatUri(backendSession, rootToolCallId);
      const subagentChat2 = buildSubagentChatUri(backendSession, nestedToolCallId);
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "do work", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: rootToolCallId,
        toolName: "task",
        displayName: "Task",
        _meta: { toolKind: "subagent" }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: rootToolCallId,
        invocationMessage: "Spawning subagent",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatTurnStarted,
        turnId: "sub-turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatToolCallStart,
        turnId: "sub-turn-1",
        toolCallId: nestedToolCallId,
        toolName: "task",
        displayName: "Task",
        _meta: { toolKind: "subagent" }
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatToolCallReady,
        turnId: "sub-turn-1",
        toolCallId: nestedToolCallId,
        invocationMessage: "Spawning nested subagent",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      connection.applySessionAction(URI.parse(subagentChat2), {
        type: ActionType.ChatTurnStarted,
        turnId: "sub-turn-2",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(subagentChat2), {
        type: ActionType.ChatToolCallStart,
        turnId: "sub-turn-2",
        toolCallId: "deep-tool-call",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(subagentChat2), {
        type: ActionType.ChatToolCallReady,
        turnId: "sub-turn-2",
        toolCallId: "deep-tool-call",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      for (let i = 0; i < 200 && !connection.dispatchedActions.some((e) => isChatAction(e.action) && e.action.type === ActionType.ChatToolCallComplete && e.action.toolCallId === "deep-tool-call"); i++) {
        await timeout(1);
      }
      const deepInvocation = toolsService.invokedToolCalls.find((call) => call.callId === "deep-tool-call");
      assert.ok(deepInvocation, "client tool inside a content-block-less nested subagent should still be invoked locally");
      assert.deepStrictEqual(deepInvocation.parameters, { task: "build" });
      const completionEntry = connection.dispatchedActions.find(
        (entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "deep-tool-call"
      );
      assert.ok(completionEntry, "completion for the nested client tool should be dispatched");
      assert.strictEqual(completionEntry.channel.toString(), subagentChat2, "completion should target the level-2 subagent chat URI");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0Q2xpZW50VG9vbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJUmVmZXJlbmNlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlLCBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0xJRU5UX1RPT0xfU0VBUkNIX1JFRkVSRU5DRV9OQU1FLCBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vdG9vbFNlYXJjaENvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBpc0NoYXRBY3Rpb24sIGlzU2Vzc2lvbkFjdGlvbiwgdHlwZSBBY3Rpb25FbnZlbG9wZSwgdHlwZSBDaGF0QWN0aW9uLCB0eXBlIElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiwgdHlwZSBTZXNzaW9uQWN0aW9uLCB0eXBlIFRlcm1pbmFsQWN0aW9uLCB0eXBlIElOb3RpZmljYXRpb24sIHR5cGUgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGJ1aWxkRGVmYXVsdENoYXRVcmksIGJ1aWxkU3ViYWdlbnRDaGF0VXJpLCBjcmVhdGVDaGF0U3RhdGUsIGNyZWF0ZURlZmF1bHRDaGF0U3VtbWFyeSwgTWVzc2FnZUtpbmQsIFNlc3Npb25MaWZlY3ljbGUsIFNlc3Npb25TdGF0dXMsIGNyZWF0ZVNlc3Npb25TdGF0ZSwgU3RhdGVDb21wb25lbnRzLCBwYXJzZURlZmF1bHRDaGF0VXJpLCB0eXBlIENoYXRTdGF0ZSwgdHlwZSBTZXNzaW9uU3RhdGUsIHR5cGUgU2Vzc2lvblN1bW1hcnksIHR5cGUgUm9vdFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgY2hhdFJlZHVjZXIsIHNlc3Npb25SZWR1Y2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uUmVkdWNlcnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xSZXN1bHRDb250ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRQcm9ncmVzcywgSUNoYXRTZXJ2aWNlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFRvb2xJbnZvY2F0aW9uLmpzJztcbmltcG9ydCB7IFBpZWNlQ3RvcktpbmQsIFByb21wdE5vZGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL3Byb21wdFRzeFR5cGVzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNlc3Npb25IYW5kbGVyLCB0b29sRGF0YVRvRGVmaW5pdGlvbiwgdG9vbFJlc3VsdFRvUHJvdG9jb2wgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFNlc3Npb25IYW5kbGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UsIElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSwgTnVsbEFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VG9vbFNldEVuYWJsZW1lbnRTZXJ2aWNlLCBJVG9vbEVuYWJsZW1lbnRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0VG9vbFNldEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBUZXN0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBNb2NrTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGFiZWwvdGVzdC9jb21tb24vbW9ja0xhYmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTdWJzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL2FnZW50U3Vic2NyaXB0aW9uLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci9hZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIElUb29sRGF0YSwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbFJlc3VsdCwgVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3V0cHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVW5pdCB0ZXN0cyBmb3IgdG9vbERhdGFUb0RlZmluaXRpb24gYW5kIHRvb2xSZXN1bHRUb1Byb3RvY29sXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5zdWl0ZSgnQWdlbnRIb3N0Q2xpZW50VG9vbHMnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIFx1MjUwMFx1MjUwMCB0b29sRGF0YVRvRGVmaW5pdGlvbiBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuXHRzdWl0ZSgndG9vbERhdGFUb0RlZmluaXRpb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdtYXBzIHRvb2xSZWZlcmVuY2VOYW1lLCBkaXNwbGF5TmFtZSwgbW9kZWxEZXNjcmlwdGlvbiwgYW5kIGlucHV0U2NoZW1hJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0XHRpZDogJ3ZzY29kZS5ydW5UZXN0cycsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAncnVuVGVzdHMnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUZXN0cycsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdSdW5zIHVuaXQgdGVzdHMgaW4gZmlsZXMnLFxuXHRcdFx0XHR1c2VyRGVzY3JpcHRpb246ICdSdW4gdGVzdHMnLFxuXHRcdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0XHRpbnB1dFNjaGVtYToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGZpbGVzOiB7IHR5cGU6ICdhcnJheScsIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0gfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZGVmID0gdG9vbERhdGFUb0RlZmluaXRpb24odG9vbCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVmLCB7XG5cdFx0XHRcdG5hbWU6ICdydW5UZXN0cycsXG5cdFx0XHRcdHRpdGxlOiAnUnVuIFRlc3RzJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdSdW5zIHVuaXQgdGVzdHMgaW4gZmlsZXMnLFxuXHRcdFx0XHRpbnB1dFNjaGVtYToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGZpbGVzOiB7IHR5cGU6ICdhcnJheScsIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0gfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIGlkIHdoZW4gdG9vbFJlZmVyZW5jZU5hbWUgaXMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0XHRpZDogJ3ZzY29kZS5ydW5UZXN0cycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRlc3RzJyxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1J1bnMgdW5pdCB0ZXN0cycsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBkZWYgPSB0b29sRGF0YVRvRGVmaW5pdGlvbih0b29sKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWYubmFtZSwgJ3ZzY29kZS5ydW5UZXN0cycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgaW5wdXRTY2hlbWEgd2hlbiBzY2hlbWEgdHlwZSBpcyBub3Qgb2JqZWN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0XHRpZDogJ215VG9vbCcsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnbXlUb29sJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdNeSBUb29sJyxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ0EgdG9vbCcsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRcdGlucHV0U2NoZW1hOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBkZWYgPSB0b29sRGF0YVRvRGVmaW5pdGlvbih0b29sKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWYuaW5wdXRTY2hlbWEsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbWl0cyBpbnB1dFNjaGVtYSB3aGVuIG5vdCBwcm92aWRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdFx0aWQ6ICdteVRvb2wnLFxuXHRcdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ215VG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnTXkgVG9vbCcsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdBIHRvb2wnLFxuXHRcdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZGVmID0gdG9vbERhdGFUb0RlZmluaXRpb24odG9vbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmLmlucHV0U2NoZW1hLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBcdTI1MDBcdTI1MDAgdG9vbFJlc3VsdFRvUHJvdG9jb2wgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblx0c3VpdGUoJ3Rvb2xSZXN1bHRUb1Byb3RvY29sJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY29udmVydHMgc3VjY2Vzc2Z1bCByZXN1bHQgd2l0aCB0ZXh0IGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IElUb29sUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyBraW5kOiAndGV4dCcsIHZhbHVlOiAnQWxsIDUgdGVzdHMgcGFzc2VkJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHR0b29sUmVzdWx0TWVzc2FnZTogJ1JhbiA1IHRlc3RzJyxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHByb3RvID0gdG9vbFJlc3VsdFRvUHJvdG9jb2wocmVzdWx0LCAncnVuVGVzdHMnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm90bywge1xuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIDUgdGVzdHMnLFxuXHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ0FsbCA1IHRlc3RzIHBhc3NlZCcgfV0sXG5cdFx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnZlcnRzIHByb21wdCBUU1ggcmVzdWx0cyB0byB0ZXh0IGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IElUb29sUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICdwcm9tcHRUc3gnLFxuXHRcdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0XHRub2RlOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IFByb21wdE5vZGVUeXBlLlBpZWNlLFxuXHRcdFx0XHRcdFx0XHRjdG9yOiBQaWVjZUN0b3JLaW5kLk90aGVyLFxuXHRcdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogUHJvbXB0Tm9kZVR5cGUuVGV4dCwgdGV4dDogJzxkaWFnbm9zdGljcz4nLCBsaW5lQnJlYWtCZWZvcmU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogUHJvbXB0Tm9kZVR5cGUuVGV4dCwgdGV4dDogJzEgcHJvYmxlbSBmb3VuZCcsIGxpbmVCcmVha0JlZm9yZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogUHJvbXB0Tm9kZVR5cGUuVGV4dCwgdGV4dDogJzwvZGlhZ25vc3RpY3M+JywgbGluZUJyZWFrQmVmb3JlOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR0b29sUmVzdWx0TWVzc2FnZTogJ0NoZWNrZWQgbWF0aC5qcywgMSBwcm9ibGVtIGZvdW5kJyxcblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbFJlc3VsdFRvUHJvdG9jb2wocmVzdWx0LCAncHJvYmxlbXMnKSwge1xuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnQ2hlY2tlZCBtYXRoLmpzLCAxIHByb2JsZW0gZm91bmQnLFxuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LFxuXHRcdFx0XHRcdHRleHQ6ICc8ZGlhZ25vc3RpY3M+XFxuMSBwcm9ibGVtIGZvdW5kXFxuPC9kaWFnbm9zdGljcz4nLFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udmVydHMgZmFpbGVkIHJlc3VsdCB3aXRoIGVycm9yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJVG9vbFJlc3VsdCA9IHtcblx0XHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ0J1aWxkIGZhaWxlZCcgfV0sXG5cdFx0XHRcdHRvb2xSZXN1bHRFcnJvcjogJ0NvbXBpbGF0aW9uIGVycm9yIGluIGZpbGUudHMnLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcHJvdG8gPSB0b29sUmVzdWx0VG9Qcm90b2NvbChyZXN1bHQsICdydW5UYXNrJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdG8sIHtcblx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdydW5UYXNrIGZhaWxlZCcsXG5cdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnQnVpbGQgZmFpbGVkJyB9XSxcblx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogJ0NvbXBpbGF0aW9uIGVycm9yIGluIGZpbGUudHMnIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgZGVmYXVsdCBwYXN0IHRlbnNlIG1lc3NhZ2Ugd2hlbiB0b29sUmVzdWx0TWVzc2FnZSBpcyBhYnNlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IElUb29sUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnZG9uZScgfV0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwcm90byA9IHRvb2xSZXN1bHRUb1Byb3RvY29sKHJlc3VsdCwgJ215VG9vbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3RvLnBhc3RUZW5zZU1lc3NhZ2UsICdSYW4gbXlUb29sJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgbWFya2Rvd24gdG9vbCByZXN1bHQgbWVzc2FnZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IElUb29sUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBbXSxcblx0XHRcdFx0dG9vbFJlc3VsdE1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZygnT3BlbmVkIFtCcm93c2VyXSh2c2NvZGUtYnJvd3NlcjovcGFnZS0xP3ZzY29kZUxpbmtUeXBlPWJyb3dzZXIpJyksXG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xSZXN1bHRUb1Byb3RvY29sKHJlc3VsdCwgJ29wZW5fYnJvd3Nlcl9wYWdlJykucGFzdFRlbnNlTWVzc2FnZSwge1xuXHRcdFx0XHRtYXJrZG93bjogJ09wZW5lZCBbQnJvd3Nlcl0odnNjb2RlLWJyb3dzZXI6L3BhZ2UtMT92c2NvZGVMaW5rVHlwZT1icm93c2VyKScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnZlcnRzIHRleHQgYW5kIGRhdGEgY29udGVudCBwYXJ0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGJpbmFyeURhdGEgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbyBiaW5hcnknKTtcblx0XHRcdGNvbnN0IHJlc3VsdDogSVRvb2xSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHR7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdoZWxsbycgfSxcblx0XHRcdFx0XHR7IGtpbmQ6ICdkYXRhJywgdmFsdWU6IHsgbWltZVR5cGU6ICdpbWFnZS9wbmcnLCBkYXRhOiBiaW5hcnlEYXRhIH0gfSxcblx0XHRcdFx0XHR7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICd3b3JsZCcgfSxcblx0XHRcdFx0XSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHByb3RvID0gdG9vbFJlc3VsdFRvUHJvdG9jb2wocmVzdWx0LCAndG9vbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3RvLmNvbnRlbnQ/Lmxlbmd0aCwgMyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3RvLmNvbnRlbnQhWzBdLCB7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnaGVsbG8nIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3RvLmNvbnRlbnQhWzFdLnR5cGUsIFRvb2xSZXN1bHRDb250ZW50VHlwZS5FbWJlZGRlZFJlc291cmNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocHJvdG8uY29udGVudCFbMV0gYXMgeyBjb250ZW50VHlwZTogc3RyaW5nIH0pLmNvbnRlbnRUeXBlLCAnaW1hZ2UvcG5nJyk7XG5cdFx0XHQvLyBWZXJpZnkgZGF0YSBpcyBiYXNlNjQtZW5jb2RlZCwgbm90IHJhdyBVVEYtOFxuXHRcdFx0Y29uc3QgZW1iZWRkZWREYXRhID0gKHByb3RvLmNvbnRlbnQhWzFdIGFzIHsgZGF0YTogc3RyaW5nIH0pLmRhdGE7XG5cdFx0XHRhc3NlcnQub2soZW1iZWRkZWREYXRhLmxlbmd0aCA+IDApO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGVtYmVkZGVkRGF0YSwgJ2hlbGxvIGJpbmFyeScpOyAvLyBzaG91bGQgYmUgYmFzZTY0LCBub3QgcmF3IHRleHRcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdG8uY29udGVudCFbMl0sIHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICd3b3JsZCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb252ZXJ0cyBkYXRhIHBhcnRzIHRvIEVtYmVkZGVkUmVzb3VyY2Ugd2l0aCBiYXNlNjQgZW5jb2RpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBiaW5hcnlEYXRhID0gVlNCdWZmZXIuZnJvbVN0cmluZygndGVzdCBkYXRhJyk7XG5cdFx0XHRjb25zdCByZXN1bHQ6IElUb29sUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyBraW5kOiAnZGF0YScsIHZhbHVlOiB7IG1pbWVUeXBlOiAnaW1hZ2UvcG5nJywgZGF0YTogYmluYXJ5RGF0YSB9IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwcm90byA9IHRvb2xSZXN1bHRUb1Byb3RvY29sKHJlc3VsdCwgJ3Rvb2wnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm90by5jb250ZW50Py5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3RvLmNvbnRlbnQhWzBdLnR5cGUsIFRvb2xSZXN1bHRDb250ZW50VHlwZS5FbWJlZGRlZFJlc291cmNlKTtcblx0XHRcdGNvbnN0IGVtYmVkZGVkID0gcHJvdG8uY29udGVudCFbMF0gYXMgeyBkYXRhOiBzdHJpbmc7IGNvbnRlbnRUeXBlOiBzdHJpbmcgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbWJlZGRlZC5jb250ZW50VHlwZSwgJ2ltYWdlL3BuZycpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVtYmVkZGVkLmRhdGEubGVuZ3RoID4gMCk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZW1iZWRkZWQuZGF0YSwgJ3Rlc3QgZGF0YScpOyAvLyBiYXNlNjQgZW5jb2RlZFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBib29sZWFuIHRvb2xSZXN1bHRFcnJvciBhcyBnZW5lcmljIGVycm9yIG1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IElUb29sUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBbXSxcblx0XHRcdFx0dG9vbFJlc3VsdEVycm9yOiB0cnVlLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcHJvdG8gPSB0b29sUmVzdWx0VG9Qcm90b2NvbChyZXN1bHQsICdteVRvb2wnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm90by5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdG8uZXJyb3I/Lm1lc3NhZ2UsICdteVRvb2wgZW5jb3VudGVyZWQgYW4gZXJyb3InKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gXHUyNTAwXHUyNTAwIEFnZW50SG9zdFNlc3Npb25IYW5kbGVyIGNsaWVudCB0b29scyBpbnRlZ3JhdGlvbiBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuXHRzdWl0ZSgnY2xpZW50IHRvb2xzIHJlZ2lzdHJhdGlvbicsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgdG9vbHM6IElUb29sRGF0YVtdLCBvcHRpb25zPzogeyByZXF1aXJlQ29uZmlybWF0aW9uPzogYm9vbGVhbjsgdGhyb3dCZWZvcmVDb25maXJtYXRpb24/OiBFcnJvciB9KSB7XG5cdFx0XHRjb25zdCBvbkRpZENoYW5nZVRvb2xzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0Y29uc3QgcGVuZGluZ1Rvb2xDYWxscyA9IG5ldyBNYXA8c3RyaW5nLCBDaGF0VG9vbEludm9jYXRpb24+KCk7XG5cdFx0XHRjb25zdCBiZWd1blRvb2xDYWxsczogQ2hhdFRvb2xJbnZvY2F0aW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IGludm9rZWRUb29sQ2FsbHM6IElUb29sSW52b2NhdGlvbltdID0gW107XG5cdFx0XHRjb25zdCByZWNvcmRlZFN0YXRlS2luZHMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmRbXT4oKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlVG9vbHM6IG9uRGlkQ2hhbmdlVG9vbHMuZXZlbnQsXG5cdFx0XHRcdGdldFRvb2xCeU5hbWU6IChuYW1lOiBzdHJpbmcpID0+IHRvb2xzLmZpbmQodCA9PiB0LnRvb2xSZWZlcmVuY2VOYW1lID09PSBuYW1lKSxcblx0XHRcdFx0b2JzZXJ2ZVRvb2xzOiAoKSA9PiBvYnNlcnZhYmxlVmFsdWUoJ3Rvb2xzJywgdG9vbHMpLFxuXHRcdFx0XHRyZWdpc3RlclRvb2xEYXRhOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0cmVnaXN0ZXJUb29sSW1wbGVtZW50YXRpb246ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0XHRyZWdpc3RlclRvb2w6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0XHRnZXRUb29sczogKCkgPT4gdG9vbHMsXG5cdFx0XHRcdGdldEFsbFRvb2xzSW5jbHVkaW5nRGlzYWJsZWQ6ICgpID0+IHRvb2xzLFxuXHRcdFx0XHRnZXRUb29sOiAoaWQ6IHN0cmluZykgPT4gdG9vbHMuZmluZCh0ID0+IHQuaWQgPT09IGlkKSxcblx0XHRcdFx0aW52b2tlVG9vbDogYXN5bmMgKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdFx0aW52b2tlZFRvb2xDYWxscy5wdXNoKGludm9jYXRpb24pO1xuXHRcdFx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gcGVuZGluZ1Rvb2xDYWxscy5nZXQoaW52b2NhdGlvbi5jaGF0U3RyZWFtVG9vbENhbGxJZCA/PyBpbnZvY2F0aW9uLmNhbGxJZCk7XG5cdFx0XHRcdFx0cGVuZGluZ1Rvb2xDYWxscy5kZWxldGUoaW52b2NhdGlvbi5jaGF0U3RyZWFtVG9vbENhbGxJZCA/PyBpbnZvY2F0aW9uLmNhbGxJZCk7XG5cdFx0XHRcdFx0aWYgKG9wdGlvbnM/LnRocm93QmVmb3JlQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBvcHRpb25zLnRocm93QmVmb3JlQ29uZmlybWF0aW9uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAob3B0aW9ucz8ucmVxdWlyZUNvbmZpcm1hdGlvbiAmJiB0b29sSW52b2NhdGlvbikge1xuXHRcdFx0XHRcdFx0Ly8gTWlycm9yIHRoZSByZWFsIHNlcnZpY2U6IGEgY2FsbGVyLXByb3ZpZGVkIGBwcmVBcHByb3ZlZGBcblx0XHRcdFx0XHRcdC8vIHJlYXNvbiBpcyB0cmVhdGVkIGFzIGF1dG8tY29uZmlybWF0aW9uIHNvIHRoZSBpbnZvY2F0aW9uXG5cdFx0XHRcdFx0XHQvLyB0cmFuc2l0aW9ucyBzdHJhaWdodCB0byBleGVjdXRpbmcgd2l0aG91dCBldmVyIGVudGVyaW5nXG5cdFx0XHRcdFx0XHQvLyBgV2FpdGluZ0ZvckNvbmZpcm1hdGlvbmAuXG5cdFx0XHRcdFx0XHR0b29sSW52b2NhdGlvbi50cmFuc2l0aW9uRnJvbVN0cmVhbWluZyh7XG5cdFx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHRcdFx0XHRcdHRpdGxlOiAnQ29uZmlybSB0b29sIGV4ZWN1dGlvbicsXG5cdFx0XHRcdFx0XHRcdFx0bWVzc2FnZTogJ1J1biB0aGUgdGFzaz8nLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSwgaW52b2NhdGlvbi5wYXJhbWV0ZXJzLCBpbnZvY2F0aW9uLnByZUFwcHJvdmVkKTtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IElDaGF0VG9vbEludm9jYXRpb24uYXdhaXRDb25maXJtYXRpb24odG9vbEludm9jYXRpb24sIHRva2VuID8/IENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdFx0Ly8gTWlycm9yIHRoZSByZWFsIHNlcnZpY2U6IGEgY2FuY2VsbGVkL2RlbmllZCBjb25maXJtYXRpb25cblx0XHRcdFx0XHRcdC8vIGFib3J0cyBleGVjdXRpb24gaW5zdGVhZCBvZiBwcm9kdWNpbmcgYSByZXN1bHQuIEEgdG9rZW5cblx0XHRcdFx0XHRcdC8vIGNhbmNlbGxhdGlvbiByZXNvbHZlcyBhcyBgRGVuaWVkYCwgc28gbW92ZSB0aGUgc3RpbGwtd2FpdGluZ1xuXHRcdFx0XHRcdFx0Ly8gaW52b2NhdGlvbiB0byBhIHRlcm1pbmFsIHN0YXRlIGFuZCByZWplY3QuXG5cdFx0XHRcdFx0XHRpZiAoY29uZmlybWVkLnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5EZW5pZWQgfHwgY29uZmlybWVkLnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0XHRcdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdFx0c3RhdGUuY29uZmlybShjb25maXJtZWQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwcmVwYXJlZCA9IHRvb2xJbnZvY2F0aW9uPy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnXG5cdFx0XHRcdFx0XHRcdD8ge1xuXHRcdFx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZyB0YXNrJyxcblx0XHRcdFx0XHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnIGFzIGNvbnN0LFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdQcmVwYXJlZCBkZWxlZ2F0ZWQgdGFzaycsXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uPy50cmFuc2l0aW9uRnJvbVN0cmVhbWluZyhwcmVwYXJlZCwgaW52b2NhdGlvbi5wYXJhbWV0ZXJzLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdDogSVRvb2xSZXN1bHQgPSB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdkb25lJyB9XSB9O1xuXHRcdFx0XHRcdGF3YWl0IHRvb2xJbnZvY2F0aW9uPy5kaWRFeGVjdXRlVG9vbChyZXN1bHQpO1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJlZ2luVG9vbENhbGw6IG9wdGlvbnMgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRvb2xEYXRhID0gdG9vbHMuZmluZCh0ID0+IHQuaWQgPT09IG9wdGlvbnMudG9vbElkKTtcblx0XHRcdFx0XHRpZiAoIXRvb2xEYXRhKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gQ2hhdFRvb2xJbnZvY2F0aW9uLmNyZWF0ZVN0cmVhbWluZyh7XG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBvcHRpb25zLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHR0b29sSWQ6IG9wdGlvbnMudG9vbElkLFxuXHRcdFx0XHRcdFx0dG9vbERhdGEsXG5cdFx0XHRcdFx0XHRzdWJhZ2VudEludm9jYXRpb25JZDogb3B0aW9ucy5zdWJhZ2VudEludm9jYXRpb25JZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRwZW5kaW5nVG9vbENhbGxzLnNldChvcHRpb25zLnRvb2xDYWxsSWQsIGludm9jYXRpb24pO1xuXHRcdFx0XHRcdGJlZ3VuVG9vbENhbGxzLnB1c2goaW52b2NhdGlvbik7XG5cdFx0XHRcdFx0Ly8gUmVjb3JkIGV2ZXJ5IHN0YXRlIHRoZSBpbnZvY2F0aW9uIHBhc3NlcyB0aHJvdWdoIHNvIHRlc3RzIGNhblxuXHRcdFx0XHRcdC8vIGFzc2VydCBpdCBuZXZlciBmbGlja2VycyBpbnRvIGBXYWl0aW5nRm9yQ29uZmlybWF0aW9uYCB3aGVuXG5cdFx0XHRcdFx0Ly8gdGhlIGNhbGwgaXMgYXV0by1hcHByb3ZlZC5cblx0XHRcdFx0XHRjb25zdCBzdGF0ZUtpbmRzOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZFtdID0gW107XG5cdFx0XHRcdFx0cmVjb3JkZWRTdGF0ZUtpbmRzLnNldChvcHRpb25zLnRvb2xDYWxsSWQsIHN0YXRlS2luZHMpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0XHRzdGF0ZUtpbmRzLnB1c2goaW52b2NhdGlvbi5zdGF0ZS5yZWFkKHJlYWRlcikudHlwZSk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdHJldHVybiBpbnZvY2F0aW9uO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR1cGRhdGVUb29sU3RyZWFtOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdGNhbmNlbFRvb2xDYWxsc0ZvclJlcXVlc3Q6ICgpID0+IHsgfSxcblx0XHRcdFx0Zmx1c2hUb29sVXBkYXRlczogKCkgPT4geyB9LFxuXHRcdFx0XHR0b29sU2V0czogb2JzZXJ2YWJsZVZhbHVlKCdzZXRzJywgW10pLFxuXHRcdFx0XHRnZXRUb29sU2V0c0Zvck1vZGVsOiAoKSA9PiBbXSxcblx0XHRcdFx0Z2V0VG9vbFNldDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRnZXRUb29sU2V0QnlOYW1lOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGNyZWF0ZVRvb2xTZXQ6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbCcpOyB9LFxuXHRcdFx0XHRnZXRGdWxsUmVmZXJlbmNlTmFtZXM6ICgpID0+IFtdLFxuXHRcdFx0XHRnZXRGdWxsUmVmZXJlbmNlTmFtZTogKCkgPT4gJycsXG5cdFx0XHRcdGdldEZ1bGxSZWZlcmVuY2VOYW1lTWFwOiAoKSA9PiBuZXcgTWFwKCksXG5cdFx0XHRcdGdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldERlcHJlY2F0ZWRGdWxsUmVmZXJlbmNlTmFtZXM6ICgpID0+IG5ldyBNYXAoKSxcblx0XHRcdFx0dG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXA6ICgpID0+IFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcC5mcm9tRW50cmllcyhbXSksXG5cdFx0XHRcdHRvRnVsbFJlZmVyZW5jZU5hbWVzOiAoKSA9PiBbXSxcblx0XHRcdFx0dG9Ub29sUmVmZXJlbmNlczogKCkgPT4gW10sXG5cdFx0XHRcdHZzY29kZVRvb2xTZXQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdGV4ZWN1dGVUb29sU2V0OiB1bmRlZmluZWQhLFxuXHRcdFx0XHRyZWFkVG9vbFNldDogdW5kZWZpbmVkISxcblx0XHRcdFx0YWdlbnRUb29sU2V0OiB1bmRlZmluZWQhLFxuXHRcdFx0XHRvbkRpZFByZXBhcmVUb29sQ2FsbEJlY29tZVVucmVzcG9uc2l2ZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRJbnZva2VUb29sOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGZpcmVPbkRpZENoYW5nZVRvb2xzOiAoKSA9PiBvbkRpZENoYW5nZVRvb2xzLmZpcmUoKSxcblx0XHRcdFx0YmVndW5Ub29sQ2FsbHMsXG5cdFx0XHRcdGludm9rZWRUb29sQ2FsbHMsXG5cdFx0XHRcdHJlY29yZGVkU3RhdGVLaW5kcyxcblx0XHRcdH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlICYgeyBmaXJlT25EaWRDaGFuZ2VUb29sczogKCkgPT4gdm9pZDsgYmVndW5Ub29sQ2FsbHM6IENoYXRUb29sSW52b2NhdGlvbltdOyBpbnZva2VkVG9vbENhbGxzOiBJVG9vbEludm9jYXRpb25bXTsgcmVjb3JkZWRTdGF0ZUtpbmRzOiBNYXA8c3RyaW5nLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZFtdPiB9O1xuXHRcdH1cblxuXHRcdGNsYXNzIE1vY2tBZ2VudEhvc3RDb25uZWN0aW9uIGV4dGVuZHMgbW9jazxJQWdlbnRIb3N0U2VydmljZT4oKSB7XG5cdFx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNsaWVudElkID0gJ3Rlc3QtY2xpZW50Jztcblx0XHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPEFjdGlvbkVudmVsb3BlPigpKTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWN0aW9uID0gdGhpcy5fb25EaWRBY3Rpb24uZXZlbnQ7XG5cdFx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE5vdGlmaWNhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJTm90aWZpY2F0aW9uPigpKTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uID0gdGhpcy5fb25EaWROb3RpZmljYXRpb24uZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkFnZW50SG9zdEV4aXQgPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25BZ2VudEhvc3RTdGFydCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBpbml0aWFsaXplUmVzdWx0ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cblx0XHRcdHByaXZhdGUgcmVhZG9ubHkgX2xpdmVTdWJzY3JpcHRpb25zID0gbmV3IE1hcDxzdHJpbmcsIHsgc3RhdGU6IFNlc3Npb25TdGF0ZSB8IENoYXRTdGF0ZTsgZW1pdHRlcjogRW1pdHRlcjxTZXNzaW9uU3RhdGUgfCBDaGF0U3RhdGU+IH0+KCk7XG5cdFx0XHRwdWJsaWMgZGlzcGF0Y2hlZEFjdGlvbnM6IHsgY2hhbm5lbDogc3RyaW5nOyBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiB9W10gPSBbXTtcblxuXHRcdFx0b3ZlcnJpZGUgZGlzcGF0Y2goY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbik6IHZvaWQge1xuXHRcdFx0XHR0aGlzLmRpc3BhdGNoZWRBY3Rpb25zLnB1c2goeyBjaGFubmVsLCBhY3Rpb24gfSk7XG5cdFx0XHRcdGlmIChpc1Nlc3Npb25BY3Rpb24oYWN0aW9uKSB8fCBpc0NoYXRBY3Rpb24oYWN0aW9uKSkge1xuXHRcdFx0XHRcdHRoaXMuYXBwbHlTZXNzaW9uQWN0aW9uKGNoYW5uZWwsIGFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0YXBwbHlTZXNzaW9uQWN0aW9uKGNoYW5uZWw6IHN0cmluZyB8IFVSSSwgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCBjaGFubmVsU3RyID0gdHlwZW9mIGNoYW5uZWwgPT09ICdzdHJpbmcnID8gY2hhbm5lbCA6IGNoYW5uZWwudG9TdHJpbmcoKTtcblx0XHRcdFx0aWYgKGlzQ2hhdEFjdGlvbihhY3Rpb24pKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hhdENoYW5uZWwgPSBwYXJzZURlZmF1bHRDaGF0VXJpKGNoYW5uZWxTdHIpICE9PSB1bmRlZmluZWQgPyBjaGFubmVsU3RyIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGFzc2VydC5vayhjaGF0Q2hhbm5lbCwgYGNoYXQgYWN0aW9ucyBtdXN0IGJlIGRpc3BhdGNoZWQgb24gYW4gYWhwLWNoYXQgY2hhbm5lbDogJHthY3Rpb24udHlwZX1gKTtcblx0XHRcdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2Vuc3VyZUxpdmVTdWJzY3JpcHRpb24oU3RhdGVDb21wb25lbnRzLkNoYXQsIGNoYXRDaGFubmVsKTtcblx0XHRcdFx0XHRlbnRyeS5zdGF0ZSA9IGNoYXRSZWR1Y2VyKGVudHJ5LnN0YXRlIGFzIENoYXRTdGF0ZSwgYWN0aW9uIGFzIFBhcmFtZXRlcnM8dHlwZW9mIGNoYXRSZWR1Y2VyPlsxXSwgKCkgPT4geyB9KTtcblx0XHRcdFx0XHRlbnRyeS5lbWl0dGVyLmZpcmUoZW50cnkuc3RhdGUpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2Vuc3VyZUxpdmVTdWJzY3JpcHRpb24oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIGNoYW5uZWxTdHIpO1xuXHRcdFx0XHRlbnRyeS5zdGF0ZSA9IHNlc3Npb25SZWR1Y2VyKGVudHJ5LnN0YXRlIGFzIFNlc3Npb25TdGF0ZSwgYWN0aW9uIGFzIFBhcmFtZXRlcnM8dHlwZW9mIHNlc3Npb25SZWR1Y2VyPlsxXSwgKCkgPT4geyB9KTtcblx0XHRcdFx0ZW50cnkuZW1pdHRlci5maXJlKGVudHJ5LnN0YXRlKTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcm9vdFN0YXRlOiBJQWdlbnRTdWJzY3JpcHRpb248Um9vdFN0YXRlPiA9IHtcblx0XHRcdFx0dmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0dmVyaWZpZWRWYWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25XaWxsQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHR9O1xuXG5cdFx0XHRvdmVycmlkZSBnZXRTdWJzY3JpcHRpb248VD4oa2luZDogU3RhdGVDb21wb25lbnRzLCByZXNvdXJjZTogVVJJKTogSVJlZmVyZW5jZTxJQWdlbnRTdWJzY3JpcHRpb248VD4+IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VTdHIgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0XHR0aGlzLl9lbnN1cmVMaXZlU3Vic2NyaXB0aW9uKGtpbmQsIHJlc291cmNlU3RyKTtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9saXZlU3Vic2NyaXB0aW9ucy5nZXQocmVzb3VyY2VTdHIpITtcblx0XHRcdFx0Y29uc3QgZW1pdHRlciA9IGVudHJ5LmVtaXR0ZXIgYXMgdW5rbm93biBhcyBFbWl0dGVyPFQ+O1xuXG5cdFx0XHRcdGNvbnN0IHNlbGYgPSB0aGlzO1xuXHRcdFx0XHRjb25zdCBzdWI6IElBZ2VudFN1YnNjcmlwdGlvbjxUPiA9IHtcblx0XHRcdFx0XHRnZXQgdmFsdWUoKSB7IHJldHVybiBzZWxmLl9saXZlU3Vic2NyaXB0aW9ucy5nZXQocmVzb3VyY2VTdHIpPy5zdGF0ZSBhcyB1bmtub3duIGFzIFQ7IH0sXG5cdFx0XHRcdFx0Z2V0IHZlcmlmaWVkVmFsdWUoKSB7IHJldHVybiBzZWxmLl9saXZlU3Vic2NyaXB0aW9ucy5nZXQocmVzb3VyY2VTdHIpPy5zdGF0ZSBhcyB1bmtub3duIGFzIFQ7IH0sXG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdFx0b25XaWxsQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0b25EaWRBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdFx0fTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvYmplY3Q6IHN1Yixcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9saXZlU3Vic2NyaXB0aW9ucy5kZWxldGUocmVzb3VyY2VTdHIpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHByaXZhdGUgX2Vuc3VyZUxpdmVTdWJzY3JpcHRpb24oa2luZDogU3RhdGVDb21wb25lbnRzLCByZXNvdXJjZVN0cjogc3RyaW5nKTogeyBzdGF0ZTogU2Vzc2lvblN0YXRlIHwgQ2hhdFN0YXRlOyBlbWl0dGVyOiBFbWl0dGVyPFNlc3Npb25TdGF0ZSB8IENoYXRTdGF0ZT4gfSB7XG5cdFx0XHRcdGxldCBlbnRyeSA9IHRoaXMuX2xpdmVTdWJzY3JpcHRpb25zLmdldChyZXNvdXJjZVN0cik7XG5cdFx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRcdHJldHVybiBlbnRyeTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBlbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPFNlc3Npb25TdGF0ZSB8IENoYXRTdGF0ZT4oKSk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGtpbmQgPT09IFN0YXRlQ29tcG9uZW50cy5DaGF0ID8gcGFyc2VEZWZhdWx0Q2hhdFVyaShyZXNvdXJjZVN0cikgOiByZXNvdXJjZVN0cjtcblx0XHRcdFx0YXNzZXJ0Lm9rKHNlc3Npb25SZXNvdXJjZSwgYGNoYXQgc3Vic2NyaXB0aW9ucyBtdXN0IHVzZSBhbiBhaHAtY2hhdCBjaGFubmVsOiAke3Jlc291cmNlU3RyfWApO1xuXHRcdFx0XHRjb25zdCBzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSA9IHtcblx0XHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBpbml0aWFsU3RhdGUgPSBraW5kID09PSBTdGF0ZUNvbXBvbmVudHMuQ2hhdFxuXHRcdFx0XHRcdD8gY3JlYXRlQ2hhdFN0YXRlKGNyZWF0ZURlZmF1bHRDaGF0U3VtbWFyeShzdW1tYXJ5LCByZXNvdXJjZVN0cikpXG5cdFx0XHRcdFx0OiB7XG5cdFx0XHRcdFx0XHQuLi5jcmVhdGVTZXNzaW9uU3RhdGUoc3VtbWFyeSksXG5cdFx0XHRcdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRcdFx0XHRkZWZhdWx0Q2hhdCxcblx0XHRcdFx0XHRcdGNoYXRzOiBbY3JlYXRlRGVmYXVsdENoYXRTdW1tYXJ5KHN1bW1hcnksIGRlZmF1bHRDaGF0KV0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0ZW50cnkgPSB7IHN0YXRlOiBpbml0aWFsU3RhdGUsIGVtaXR0ZXIgfTtcblx0XHRcdFx0dGhpcy5fbGl2ZVN1YnNjcmlwdGlvbnMuc2V0KHJlc291cmNlU3RyLCBlbnRyeSk7XG5cdFx0XHRcdHJldHVybiBlbnRyeTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKFxuXHRcdFx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRcdHRvb2xzOiBJVG9vbERhdGFbXSxcblx0XHRcdHRvb2xTZXJ2aWNlT3B0aW9ucz86IHsgcmVxdWlyZUNvbmZpcm1hdGlvbj86IGJvb2xlYW47IHRocm93QmVmb3JlQ29uZmlybWF0aW9uPzogRXJyb3IgfSxcblx0XHQpIHtcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBjb25uZWN0aW9uID0gbmV3IE1vY2tBZ2VudEhvc3RDb25uZWN0aW9uKCk7XG5cblx0XHRcdGNvbnN0IHRvb2xzU2VydmljZSA9IGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoZGlzcG9zYWJsZXMsIHRvb2xzLCB0b29sU2VydmljZU9wdGlvbnMpO1xuXHRcdFx0Y29uc3QgY29uZmlnVmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRcdFx0Y29uc3Qgb25EaWRDaGFuZ2VDb25maWcgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudD4oKSk7XG5cdFx0XHRjb25zdCBjb25maWdTZXJ2aWNlOiBQYXJ0aWFsPElDb25maWd1cmF0aW9uU2VydmljZT4gPSB7XG5cdFx0XHRcdGdldFZhbHVlOiAoa2V5OiBzdHJpbmcpID0+IGNvbmZpZ1ZhbHVlc1trZXldLFxuXHRcdFx0XHRvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb246IG9uRGlkQ2hhbmdlQ29uZmlnLmV2ZW50LFxuXHRcdFx0fSBhcyBQYXJ0aWFsPElDb25maWd1cmF0aW9uU2VydmljZT47XG5cblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2R1Y3RTZXJ2aWNlLCB7IHF1YWxpdHk6ICdpbnNpZGVyJyB9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIHsgZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5GcmVlLCBxdW90YXM6IHt9IH0gYXMgUGFydGlhbDxJQ2hhdEVudGl0bGVtZW50U2VydmljZT4gYXMgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwge1xuXHRcdFx0XHRyZWdpc3RlckR5bmFtaWNBZ2VudDogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHR9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBUZXN0RmlsZVNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFiZWxTZXJ2aWNlLCBNb2NrTGFiZWxTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRcdFx0cmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0cmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcjogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250cmlidXRpb246ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEZWZhdWx0QWNjb3VudFNlcnZpY2UsIHsgb25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudDogRXZlbnQuTm9uZSwgZ2V0RGVmYXVsdEFjY291bnQ6IGFzeW5jICgpID0+IG51bGwgfSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvblNlcnZpY2UsIHsgb25EaWRDaGFuZ2VTZXNzaW9uczogRXZlbnQuTm9uZSB9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxzU2VydmljZSwge1xuXHRcdFx0XHRkZWx0YUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJEZXNjcmlwdG9yczogKCkgPT4geyB9LFxuXHRcdFx0XHRyZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcjogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHR9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWdTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU91dHB1dFNlcnZpY2UsIHsgZ2V0Q2hhbm5lbDogKCkgPT4gdW5kZWZpbmVkIH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHsgZ2V0V29ya3NwYWNlOiAoKSA9PiAoeyBpZDogJycsIGZvbGRlcnM6IFtdIH0pLCBnZXRXb3Jrc3BhY2VGb2xkZXI6ICgpID0+IG51bGwgfSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0RWRpdGluZ1NlcnZpY2UsIHtcblx0XHRcdFx0cmVnaXN0ZXJFZGl0aW5nU2Vzc2lvblByb3ZpZGVyOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLCB7XG5cdFx0XHRcdHJlZ2lzdGVyUHJvdmlkZXI6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwge1xuXHRcdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRGlkQ3JlYXRlTW9kZWw6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHJlbW92ZVBlbmRpbmdSZXF1ZXN0OiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlLCB7XG5cdFx0XHRcdHJlZ2lzdGVyQXV0aG9yaXR5OiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0ZW5zdXJlU3luY2VkQ3VzdG9taXphdGlvblByb3ZpZGVyOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLCBuZXcgTnVsbEFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSwge1xuXHRcdFx0XHRzZXQ6ICgpID0+IHsgfSxcblx0XHRcdFx0dGFrZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRyZW5hbWU6ICgpID0+IHsgfSxcblx0XHRcdH0gYXMgUGFydGlhbDxJQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmU+IGFzIElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIHtcblx0XHRcdFx0cmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3M6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudFBsdWdpblNlcnZpY2UsIHtcblx0XHRcdFx0cGx1Z2luczogb2JzZXJ2YWJsZVZhbHVlKCdwbHVnaW5zJywgW10pLFxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvbXB0c1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUN1c3RvbUFnZW50cyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2tpbGxzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VJbnN0cnVjdGlvbnMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUFnZW50SW5zdHJ1Y3Rpb25zID0gRXZlbnQuTm9uZTtcblxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBsaXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlKCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0fSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsQ2hhdFNlcnZpY2UsIHtcblx0XHRcdFx0b25EaWRDb250aW51ZUluQmFja2dyb3VuZDogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmVnaXN0ZXJUZXJtaW5hbEluc3RhbmNlV2l0aFRvb2xTZXNzaW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGdldEFocENvbW1hbmRTb3VyY2U6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLCB7XG5cdFx0XHRcdHJldml2ZVRlcm1pbmFsOiBhc3luYyAoKSA9PiB1bmRlZmluZWQhLFxuXHRcdFx0XHRjcmVhdGVUZXJtaW5hbEZvckVudHJ5OiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHByb2ZpbGVzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCBbXSksXG5cdFx0XHRcdGdldFByb2ZpbGVGb3JDb25uZWN0aW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlZ2lzdGVyRW50cnk6ICgpID0+ICh7IGRpc3Bvc2UoKSB7IH0gfSksXG5cdFx0XHR9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIsIHtcblx0XHRcdFx0cmVnaXN0ZXJSZXNvbHZlcjogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdHJlc29sdmU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNOZXdTZXNzaW9uOiAoKSA9PiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgdG9vbHNTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdFRvb2xTZXRFbmFibGVtZW50U2VydmljZSwge1xuXHRcdFx0XHRvYnNlcnZlOiAoKSA9PiBjb25zdE9ic2VydmFibGU8SVRvb2xFbmFibGVtZW50U3RhdGU+KHsgdG9vbFNldHM6IG5ldyBNYXAoKSwgdG9vbHM6IG5ldyBNYXAoKSB9KSxcblx0XHRcdFx0Z2V0U3RhdGU6ICgpID0+ICh7IHRvb2xTZXRzOiBuZXcgTWFwKCksIHRvb2xzOiBuZXcgTWFwKCkgfSksXG5cdFx0XHRcdHNldFRvb2xTZXRFbmFibGVkOiAoKSA9PiB7IH0sXG5cdFx0XHRcdHNldFRvb2xFbmFibGVkOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVXNlIHRoZSByZWFsIGFjdGl2ZS1jbGllbnQgc2VydmljZSBzbyB0aGUgaGFuZGxlcidzIHRvb2xzIGF1dG9ydW5cblx0XHRcdC8vIG9ic2VydmVzIHRoZSBtb2NrZWQgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgdG9vbCBzZXRzLlxuXHRcdFx0Y29uc3QgYWN0aXZlQ2xpZW50U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLCBhY3RpdmVDbGllbnRTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgaGFuZGxlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RTZXNzaW9uSGFuZGxlciwge1xuXHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnIGFzIGNvbnN0LFxuXHRcdFx0XHRhZ2VudElkOiAnYWdlbnQtaG9zdC1jb3BpbG90Jyxcblx0XHRcdFx0c2Vzc2lvblR5cGU6ICdhZ2VudC1ob3N0LWNvcGlsb3QnLFxuXHRcdFx0XHRmdWxsTmFtZTogJ1Rlc3QnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Rlc3QnLFxuXHRcdFx0XHRjb25uZWN0aW9uLFxuXHRcdFx0XHRjb25uZWN0aW9uQXV0aG9yaXR5OiAnbG9jYWwnLFxuXHRcdFx0fSkpO1xuXG5cdFx0XHRyZXR1cm4geyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UsIGNvbmZpZ1ZhbHVlcywgb25EaWRDaGFuZ2VDb25maWcgfTtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXN0UnVuVGVzdHNUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3ZzY29kZS5ydW5UZXN0cycsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3J1blRlc3RzJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRlc3RzJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdSdW5zIHVuaXQgdGVzdHMnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IGZpbGVzOiB7IHR5cGU6ICdhcnJheScgfSB9IH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHRlc3RSdW5UYXNrVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICd2c2NvZGUucnVuVGFzaycsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnUnVucyBhIFZTIENvZGUgdGFzaycsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0aW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHsgdGFzazogeyB0eXBlOiAnc3RyaW5nJyB9IH0gfSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdGVzdFN1YmFnZW50VG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdydW5TdWJhZ2VudCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3Rhc2snLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gU3ViYWdlbnQnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1J1bnMgYSBkZWxlZ2F0ZWQgdGFzaycsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0aW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHRlc3RVbmxpc3RlZFRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndnNjb2RlLnJlYWRGaWxlJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAncmVhZEZpbGUnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdSZWFkIEZpbGUnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1JlYWRzIGEgZmlsZScsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cblx0XHRjb25zdCB0ZXN0VG9vbFNlYXJjaFRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndnNjb2RlLnRvb2xTZWFyY2gnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6IENMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSxcblx0XHRcdGRpc3BsYXlOYW1lOiAnU2VhcmNoIFRvb2xzJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdTZWFyY2hlcyBmb3IgdG9vbHMnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IHF1ZXJ5OiB7IHR5cGU6ICdzdHJpbmcnIH0gfSB9LFxuXHRcdH07XG5cblx0XHRhc3luYyBmdW5jdGlvbiBwcm92aWRlU2Vzc2lvbldpdGhSZWFkeVJ1blRhc2tUb29sKGhhbmRsZXI6IEFnZW50SG9zdFNlc3Npb25IYW5kbGVyLCBjb25uZWN0aW9uOiBNb2NrQWdlbnRIb3N0Q29ubmVjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biB0aGUgdGFzaycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiBjb25uZWN0aW9uLmNsaWVudElkIH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1J1biBUYXNrJyxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZ2V0VG9vbENhbGxDb25maXJtYXRpb25BbmRDb21wbGV0aW9uQWN0aW9ucyhjb25uZWN0aW9uOiBNb2NrQWdlbnRIb3N0Q29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuIGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnNcblx0XHRcdFx0LmZpbHRlcihlbnRyeSA9PiBpc0NoYXRBY3Rpb24oZW50cnkuYWN0aW9uKVxuXHRcdFx0XHRcdCYmIChlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQgfHwgZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpXG5cdFx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICd0b29sLWNhbGwtMScpXG5cdFx0XHRcdC5tYXAoZW50cnkgPT4ge1xuXHRcdFx0XHRcdGlmIChlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IGVudHJ5LmFjdGlvbi50eXBlLFxuXHRcdFx0XHRcdFx0XHRhcHByb3ZlZDogZW50cnkuYWN0aW9uLmFwcHJvdmVkLFxuXHRcdFx0XHRcdFx0XHRzdWNjZXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IGVudHJ5LmFjdGlvbi50eXBlLFxuXHRcdFx0XHRcdFx0XHRhcHByb3ZlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWNjZXNzOiBlbnRyeS5hY3Rpb24ucmVzdWx0LnN1Y2Nlc3MsXG5cdFx0XHRcdFx0XHRcdGVycm9yOiBlbnRyeS5hY3Rpb24ucmVzdWx0LmVycm9yPy5tZXNzYWdlLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIGFjdGlvbiB0eXBlOiAke2VudHJ5LmFjdGlvbi50eXBlfWApO1xuXHRcdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdtYXBzIHRvb2wgZGF0YSB0byBwcm90b2NvbCBkZWZpbml0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgY29ubmVjdGlvbiB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UZXN0c1Rvb2wsIHRlc3RSdW5UYXNrVG9vbCwgdGVzdFVubGlzdGVkVG9vbF0pO1xuXG5cdFx0XHQvLyBUaGUgaGFuZGxlciBkaXNwYXRjaGVzIGFjdGl2ZUNsaWVudFNldCBpbiB0aGUgY29uc3RydWN0b3Igd2hlblxuXHRcdFx0Ly8gY3VzdG9taXphdGlvbnMgb2JzZXJ2YWJsZSBmaXJlcywgYnV0IGhlcmUgaXQgZmlyZXMgZHVyaW5nIHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQuXG5cdFx0XHQvLyBWZXJpZnkgdG9vbHMgYXJlIGJ1aWx0IGNvcnJlY3RseSBieSBjaGVja2luZyB3aGF0IHdvdWxkIGJlIGRpc3BhdGNoZWQuXG5cdFx0XHRhc3NlcnQub2soY29ubmVjdGlvbik7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGF0IHRoZSB0b29sIGNvbnZlcnNpb24gd29ya3MgY29ycmVjdGx5LlxuXHRcdFx0Y29uc3QgcnVuVGVzdHNEZWYgPSB0b29sRGF0YVRvRGVmaW5pdGlvbih0ZXN0UnVuVGVzdHNUb29sKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5UZXN0c0RlZi5uYW1lLCAncnVuVGVzdHMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5UZXN0c0RlZi50aXRsZSwgJ1J1biBUZXN0cycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1blRlc3RzRGVmLmRlc2NyaXB0aW9uLCAnUnVucyB1bml0IHRlc3RzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIHRvb2xzIHdpdGggd2hlbiBjbGF1c2VzIHZpYSBvYnNlcnZlVG9vbHMgZmlsdGVyaW5nJywgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIG9ic2VydmVUb29scyBtZXRob2QgYWxyZWFkeSBmaWx0ZXJzIGJ5IGB3aGVuYCBjbGF1c2VzLlxuXHRcdFx0Ly8gV2hlbiBhIHRvb2wgaGFzIGEgYHdoZW5gIGNsYXVzZSB0aGF0IGRvZXNuJ3QgbWF0Y2gsIGl0IHdvbid0XG5cdFx0XHQvLyBhcHBlYXIgaW4gdGhlIG9ic2VydmFibGUsIGFuZCB0aHVzIHdvbid0IGJlIGluY2x1ZGVkLlxuXHRcdFx0Ly8gT3VyIG1vY2sgb2JzZXJ2ZVRvb2xzIHJldHVybnMgYWxsIHRvb2xzIGRpcmVjdGx5LCBidXQgaW5cblx0XHRcdC8vIHByb2R1Y3Rpb24sIHRvb2xzIHdpdGggbm9uLW1hdGNoaW5nIHdoZW4gY2xhdXNlcyBhcmUgZXhjbHVkZWRcblx0XHRcdC8vIGJlZm9yZSByZWFjaGluZyBnZXRDbGllbnRUb29scy5cblx0XHRcdGNvbnN0IGRlZiA9IHRvb2xEYXRhVG9EZWZpbml0aW9uKHRlc3RSdW5UZXN0c1Rvb2wpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZi5uYW1lLCAncnVuVGVzdHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ludm9rZXMgYW4gb3duZWQgY2xpZW50IHRvb2wgd2hlbiByZWNvbm5lY3RpbmcgdG8gYW4gYWN0aXZlIHR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24sIHRvb2xzU2VydmljZSB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UYXNrVG9vbF0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biB0aGUgdGFzaycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiBjb25uZWN0aW9uLmNsaWVudElkIH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHMubWFwKGNhbGwgPT4gKHtcblx0XHRcdFx0Y2FsbElkOiBjYWxsLmNhbGxJZCxcblx0XHRcdFx0dG9vbElkOiBjYWxsLnRvb2xJZCxcblx0XHRcdFx0cGFyYW1ldGVyczogY2FsbC5wYXJhbWV0ZXJzLFxuXHRcdFx0XHRjaGF0U3RyZWFtVG9vbENhbGxJZDogY2FsbC5jaGF0U3RyZWFtVG9vbENhbGxJZCxcblx0XHRcdH0pKSwgW3tcblx0XHRcdFx0Y2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHR0b29sSWQ6ICd2c2NvZGUucnVuVGFzaycsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgdGFzazogJ2J1aWxkJyB9LFxuXHRcdFx0XHRjaGF0U3RyZWFtVG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdH1dKTtcblx0XHRcdGFzc2VydC5vayhjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLnNvbWUoZW50cnkgPT4gaXNDaGF0QWN0aW9uKGVudHJ5LmFjdGlvbilcblx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGVcblx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICd0b29sLWNhbGwtMScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rvb2wtc2VhcmNoIGNvbXBsZXRpb24gZHJvcHMgY2FuZGlkYXRlcyB3aGlsZSBwcmVzZXJ2aW5nIHVua25vd24gbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24sIHRvb2xzU2VydmljZSB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RUb29sU2VhcmNoVG9vbF0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBjaGF0VVJJID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKTtcblxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oY2hhdFVSSSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnZmluZCBhIGNhbGN1bGF0b3InLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oY2hhdFVSSSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1zZWFyY2gtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6IFJVTlRJTUVfVE9PTF9TRUFSQ0hfVE9PTF9OQU1FLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1NlYXJjaCBUb29scycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihjaGF0VVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLXNlYXJjaC1jYWxsLTEnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1NlYXJjaCBUb29scycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInF1ZXJ5XCI6XCJjYWxjdWxhdG9yXCJ9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0dG9vbFNlYXJjaENhbmRpZGF0ZXM6IFt7IG5hbWU6ICdjYWxjdWxhdG9yJywgZGVzY3JpcHRpb246ICdBZGRzIG51bWJlcnMnIH1dLFxuXHRcdFx0XHRcdGZ1dHVyZU1ldGFkYXRhOiB7IHByZXNlcnZlOiB0cnVlIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXG5cdFx0XHRhd2FpdCBoYW5kbGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRjb25zdCBjb21wbGV0aW9uID0gY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5maW5kKGVudHJ5ID0+IGlzQ2hhdEFjdGlvbihlbnRyeS5hY3Rpb24pXG5cdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlXG5cdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50b29sQ2FsbElkID09PSAndG9vbC1zZWFyY2gtY2FsbC0xJyk7XG5cdFx0XHRhc3NlcnQub2soY29tcGxldGlvbiAmJiBpc0NoYXRBY3Rpb24oY29tcGxldGlvbi5hY3Rpb24pICYmIGNvbXBsZXRpb24uYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHRvb2xzU2VydmljZS5pbnZva2VkVG9vbENhbGxzWzBdPy5wYXJhbWV0ZXJzLFxuXHRcdFx0XHRtZXRhOiBjb21wbGV0aW9uLmFjdGlvbi5fbWV0YSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdHF1ZXJ5OiAnY2FsY3VsYXRvcicsXG5cdFx0XHRcdFx0Y2FuZGlkYXRlVG9vbHM6IFt7IG5hbWU6ICdjYWxjdWxhdG9yJywgZGVzY3JpcHRpb246ICdBZGRzIG51bWJlcnMnIH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZXRhOiB7IGZ1dHVyZU1ldGFkYXRhOiB7IHByZXNlcnZlOiB0cnVlIH0gfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW52YWxpZCB0b29sLXNlYXJjaCBpbnB1dCBkcm9wcyBjYW5kaWRhdGVzIHdoaWxlIHByZXNlcnZpbmcgdW5rbm93biBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiwgdG9vbHNTZXJ2aWNlIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFRvb2xTZWFyY2hUb29sXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGNoYXRVUkkgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpO1xuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihjaGF0VVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdmaW5kIGEgY2FsY3VsYXRvcicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihjaGF0VVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLXNlYXJjaC1jYWxsLWludmFsaWQnLFxuXHRcdFx0XHR0b29sTmFtZTogUlVOVElNRV9UT09MX1NFQVJDSF9UT09MX05BTUUsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnU2VhcmNoIFRvb2xzJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKGNoYXRVUkksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtc2VhcmNoLWNhbGwtaW52YWxpZCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnU2VhcmNoIFRvb2xzJyxcblx0XHRcdFx0dG9vbElucHV0OiAne2ludmFsaWQnLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHR0b29sU2VhcmNoQ2FuZGlkYXRlczogW3sgbmFtZTogJ2NhbGN1bGF0b3InLCBkZXNjcmlwdGlvbjogJ0FkZHMgbnVtYmVycycgfV0sXG5cdFx0XHRcdFx0ZnV0dXJlTWV0YWRhdGE6IHsgcHJlc2VydmU6IHRydWUgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGNvbnN0IGNvbXBsZXRpb24gPSBjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLmZpbmQoZW50cnkgPT4gaXNDaGF0QWN0aW9uKGVudHJ5LmFjdGlvbilcblx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGVcblx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICd0b29sLXNlYXJjaC1jYWxsLWludmFsaWQnKTtcblx0XHRcdGFzc2VydC5vayhjb21wbGV0aW9uICYmIGlzQ2hhdEFjdGlvbihjb21wbGV0aW9uLmFjdGlvbikgJiYgY29tcGxldGlvbi5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aW52b2tlZFRvb2xDYWxsczogdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHMubGVuZ3RoLFxuXHRcdFx0XHRzdWNjZXNzOiBjb21wbGV0aW9uLmFjdGlvbi5yZXN1bHQuc3VjY2Vzcyxcblx0XHRcdFx0bWV0YTogY29tcGxldGlvbi5hY3Rpb24uX21ldGEsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGludm9rZWRUb29sQ2FsbHM6IDAsXG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRtZXRhOiB7IGZ1dHVyZU1ldGFkYXRhOiB7IHByZXNlcnZlOiB0cnVlIH0gfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgYW5vdGhlciBjbGllbnQgdG9vbCBhcyBjYW5jZWxsYWJsZSBwcm9ncmVzcyB3aXRob3V0IGludm9raW5nIG9yIGNvbmZpcm1pbmcgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24sIHRvb2xzU2VydmljZSB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UYXNrVG9vbF0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBjaGF0VVJJID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKTtcblxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oY2hhdFVSSSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIHRoZSB0YXNrJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKGNoYXRVUkksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdvd25lci1jbGllbnQnIH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oY2hhdFVSSSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ0FsbG93IFJ1biBUYXNrPycsXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSAoc2Vzc2lvbiBhcyB1bmtub3duIGFzIHsgcHJvZ3Jlc3NPYnM6IHsgZ2V0KCk6IElDaGF0UHJvZ3Jlc3NbXSB9IH0pXG5cdFx0XHRcdC5wcm9ncmVzc09icy5nZXQoKVxuXHRcdFx0XHQuZmluZCgocGFydCk6IHBhcnQgaXMgQ2hhdFRvb2xJbnZvY2F0aW9uID0+IHBhcnQgaW5zdGFuY2VvZiBDaGF0VG9vbEludm9jYXRpb24gJiYgcGFydC50b29sQ2FsbElkID09PSAndG9vbC1jYWxsLTEnKTtcblx0XHRcdGFzc2VydC5vayhpbnZvY2F0aW9uKTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uc0JlZm9yZVNraXAgPSBnZXRUb29sQ2FsbENvbmZpcm1hdGlvbkFuZENvbXBsZXRpb25BY3Rpb25zKGNvbm5lY3Rpb24pO1xuXHRcdFx0Y29uc3Qgc3RhdGVCZWZvcmVTa2lwID0gaW52b2NhdGlvbi5zdGF0ZS5nZXQoKS50eXBlO1xuXHRcdFx0Y29uc3QgbWVzc2FnZUJlZm9yZVNraXAgPSBpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlO1xuXHRcdFx0aW52b2NhdGlvbi5vdGhlckNsaWVudFRvb2xDYWxsPy5jYW5jZWwoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRtZXNzYWdlQmVmb3JlU2tpcCxcblx0XHRcdFx0bWVzc2FnZUFmdGVyU2tpcDogaW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0c3RhdGVCZWZvcmVTa2lwLFxuXHRcdFx0XHRzdGF0ZUFmdGVyU2tpcDogaW52b2NhdGlvbi5zdGF0ZS5nZXQoKS50eXBlLFxuXHRcdFx0XHRpbnZva2VkVG9vbENhbGxDb3VudDogdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHMubGVuZ3RoLFxuXHRcdFx0XHRhY3Rpb25zQmVmb3JlU2tpcCxcblx0XHRcdFx0YWN0aW9uc0FmdGVyU2tpcDogZ2V0VG9vbENhbGxDb25maXJtYXRpb25BbmRDb21wbGV0aW9uQWN0aW9ucyhjb25uZWN0aW9uKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0bWVzc2FnZUJlZm9yZVNraXA6ICdSdW5uaW5nIFJ1biBUYXNrIG9uIGFub3RoZXIgY2xpZW50Li4uJyxcblx0XHRcdFx0bWVzc2FnZUFmdGVyU2tpcDogJ1J1biBUYXNrJyxcblx0XHRcdFx0c3RhdGVCZWZvcmVTa2lwOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHRcdHN0YXRlQWZ0ZXJTa2lwOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQsXG5cdFx0XHRcdGludm9rZWRUb29sQ2FsbENvdW50OiAwLFxuXHRcdFx0XHRhY3Rpb25zQmVmb3JlU2tpcDogW10sXG5cdFx0XHRcdGFjdGlvbnNBZnRlclNraXA6IFt7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0XHRhcHByb3ZlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdGVycm9yOiAnUnVuIFRhc2sgd2FzIHNraXBwZWQgZnJvbSBhbm90aGVyIGNsaWVudCcsXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXBvcnRzIGNsaWVudCB0b29sIHByZXBhcmUgZmFpbHVyZXMgYmVmb3JlIGNvbmZpcm1hdGlvbiBhcyBmYWlsZWQgY29tcGxldGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UYXNrVG9vbF0sIHsgdGhyb3dCZWZvcmVDb25maXJtYXRpb246IG5ldyBFcnJvcigncHJlcGFyZSBmYWlsZWQnKSB9KTtcblxuXHRcdFx0YXdhaXQgcHJvdmlkZVNlc3Npb25XaXRoUmVhZHlSdW5UYXNrVG9vbChoYW5kbGVyLCBjb25uZWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRUb29sQ2FsbENvbmZpcm1hdGlvbkFuZENvbXBsZXRpb25BY3Rpb25zKGNvbm5lY3Rpb24pLCBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRhcHByb3ZlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0ZXJyb3I6ICdwcmVwYXJlIGZhaWxlZCcsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXBvcnRzIGNsaWVudCB0b29sIGNhbmNlbGxhdGlvbiBiZWZvcmUgY29uZmlybWF0aW9uIGFzIGZhaWxlZCBjb21wbGV0aW9uIHdoZW4gcHJvdG9jb2wgY2FsbCBpcyBub3QgdGVybWluYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24gfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdLCB7IHRocm93QmVmb3JlQ29uZmlybWF0aW9uOiBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSB9KTtcblxuXHRcdFx0YXdhaXQgcHJvdmlkZVNlc3Npb25XaXRoUmVhZHlSdW5UYXNrVG9vbChoYW5kbGVyLCBjb25uZWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRUb29sQ2FsbENvbmZpcm1hdGlvbkFuZENvbXBsZXRpb25BY3Rpb25zKGNvbm5lY3Rpb24pLCBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRhcHByb3ZlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0ZXJyb3I6ICdDYW5jZWxlZCcsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdXRvLWFwcHJvdmVzIGNsaWVudCB0b29sIGNvbmZpcm1hdGlvbiBhcyBhIHNldHRpbmcgd2hlbiB0aGUgYWdlbnQgaG9zdCBtYXJrcyB0aGUgY2FsbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UYXNrVG9vbF0sIHsgcmVxdWlyZUNvbmZpcm1hdGlvbjogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gdGhlIHRhc2snLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInRhc2tcIjpcImJ1aWxkXCJ9Jyxcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdF9tZXRhOiB7IGF1dG9BcHByb3ZlQnlTZXR0aW5nOiB0cnVlIH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXG5cdFx0XHRhd2FpdCBoYW5kbGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zXG5cdFx0XHRcdC5maWx0ZXIoZW50cnkgPT4gaXNDaGF0QWN0aW9uKGVudHJ5LmFjdGlvbilcblx0XHRcdFx0XHQmJiAoZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkIHx8IGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKVxuXHRcdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50b29sQ2FsbElkID09PSAndG9vbC1jYWxsLTEnKVxuXHRcdFx0XHQubWFwKGVudHJ5ID0+IHtcblx0XHRcdFx0XHRpZiAoZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBlbnRyeS5hY3Rpb24udHlwZSxcblx0XHRcdFx0XHRcdFx0YXBwcm92ZWQ6IGVudHJ5LmFjdGlvbi5hcHByb3ZlZCxcblx0XHRcdFx0XHRcdFx0Y29uZmlybWVkOiBlbnRyeS5hY3Rpb24uYXBwcm92ZWQgPyBlbnRyeS5hY3Rpb24uY29uZmlybWVkIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWNjZXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IGVudHJ5LmFjdGlvbi50eXBlLFxuXHRcdFx0XHRcdFx0XHRhcHByb3ZlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRjb25maXJtZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VjY2VzczogZW50cnkuYWN0aW9uLnJlc3VsdC5zdWNjZXNzLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIGFjdGlvbiB0eXBlOiAke2VudHJ5LmFjdGlvbi50eXBlfWApO1xuXHRcdFx0XHR9KSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdFx0YXBwcm92ZWQ6IHRydWUsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5TZXR0aW5nLFxuXHRcdFx0XHRcdHN1Y2Nlc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdFx0YXBwcm92ZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm90b2NvbC1jb25maXJtZWQgY2xpZW50IHRvb2wgbmV2ZXIgZW50ZXJzIFdhaXRpbmdGb3JDb25maXJtYXRpb24gKG5vIG5lZWRzLWlucHV0IGZsaWNrZXIpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdLCB7IHJlcXVpcmVDb25maXJtYXRpb246IHRydWUgfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIHRoZSB0YXNrJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblxuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdC8vIFRoZSBpbnZvY2F0aW9uIGNhcnJpZXMgdGhlIHByZS1yZXNvbHZlZCBhcHByb3ZhbCwgYW5kIGl0IHRyYW5zaXRpb25zXG5cdFx0XHQvLyBzdHJhaWdodCBmcm9tIHN0cmVhbWluZyB0byBleGVjdXRpbmcgd2l0aG91dCBldmVyIHN1cmZhY2luZyBhIHBlbmRpbmdcblx0XHRcdC8vIGNvbmZpcm1hdGlvbiAod2hpY2ggd291bGQgZmxpY2tlciBcIm5lZWRzIGlucHV0XCIgaW4gdGhlIHNlc3Npb25zIGxpc3QpLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHByZUFwcHJvdmVkS2luZDogdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHNbMF0/LnByZUFwcHJvdmVkPy50eXBlLFxuXHRcdFx0XHRcdHNhd1dhaXRpbmdGb3JDb25maXJtYXRpb246ICh0b29sc1NlcnZpY2UucmVjb3JkZWRTdGF0ZUtpbmRzLmdldCgndG9vbC1jYWxsLTEnKSA/PyBbXSkuaW5jbHVkZXMoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwcmVBcHByb3ZlZEtpbmQ6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQsXG5cdFx0XHRcdFx0c2F3V2FpdGluZ0ZvckNvbmZpcm1hdGlvbjogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gcmVhY2hMb2NhbFdhaXRpbmdGb3JDb25maXJtYXRpb24oaGFuZGxlcjogQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIsIGNvbm5lY3Rpb246IE1vY2tBZ2VudEhvc3RDb25uZWN0aW9uKTogUHJvbWlzZTxVUkk+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgY2hhdFVSSSA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSk7XG5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKGNoYXRVUkksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biB0aGUgdGFzaycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihjaGF0VVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiBjb25uZWN0aW9uLmNsaWVudElkIH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Ly8gTm8gYGNvbmZpcm1lZGAgYW5kIG5vIGF1dG8tYXBwcm92ZSBtZXRhZGF0YTogdGhlIHByb3RvY29sIGNhbGxcblx0XHRcdC8vIHN0YXlzIGBQZW5kaW5nQ29uZmlybWF0aW9uYCwgc28gdGhlIGxvY2FsIGludm9jYXRpb24gbXVzdCByZWFjaFxuXHRcdFx0Ly8gYFdhaXRpbmdGb3JDb25maXJtYXRpb25gIGFuZCBibG9jayBvbiB0aGUgY29uZmlybWF0aW9uIGdhdGUuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihjaGF0VVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUnVuIFRhc2snLFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblxuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdHJldHVybiBjaGF0VVJJO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Jlc29sdmVzIGEgd2FpdGluZyBjbGllbnQgdG9vbCBjb25maXJtYXRpb24gd2hlbiB0aGUgYWdlbnQgaG9zdCBhcHByb3ZlcyBpdCBsYXRlLCBwcmVzZXJ2aW5nIHRoZSByZWFzb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFzb25zID0gW1xuXHRcdFx0XHRUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlNldHRpbmcsXG5cdFx0XHRcdFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHRzOiB1bmtub3duW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgcmVhc29uIG9mIHJlYXNvbnMpIHtcblx0XHRcdFx0Y29uc3QgbG9jYWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MobG9jYWwsIFt0ZXN0UnVuVGFza1Rvb2xdLCB7IHJlcXVpcmVDb25maXJtYXRpb246IHRydWUgfSk7XG5cdFx0XHRcdGNvbnN0IGNoYXRVUkkgPSBhd2FpdCByZWFjaExvY2FsV2FpdGluZ0ZvckNvbmZpcm1hdGlvbihoYW5kbGVyLCBjb25uZWN0aW9uKTtcblxuXHRcdFx0XHRjb25zdCBzYXdXYWl0aW5nRm9yQ29uZmlybWF0aW9uID0gKHRvb2xzU2VydmljZS5yZWNvcmRlZFN0YXRlS2luZHMuZ2V0KCd0b29sLWNhbGwtMScpID8/IFtdKS5pbmNsdWRlcyhJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKTtcblxuXHRcdFx0XHQvLyBUaGUgYWdlbnQgaG9zdCBhcHByb3ZlcyB0aGUgY2FsbCBhZnRlciB0aGUgZmFjdCwgdHJhbnNpdGlvbmluZ1xuXHRcdFx0XHQvLyB0aGUgcHJvdG9jb2wgdG9vbCBjYWxsIHRvIGBSdW5uaW5nYCB3aXRoIHRoZSByZXNvbHZlZCByZWFzb24uXG5cdFx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKGNoYXRVUkksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiByZWFzb24sXG5cdFx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdFx0Y29uc3QgY29uZmlybWVkQWN0aW9uID0gY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5maW5kKGVudHJ5ID0+IGlzQ2hhdEFjdGlvbihlbnRyeS5hY3Rpb24pXG5cdFx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkXG5cdFx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICd0b29sLWNhbGwtMScpO1xuXHRcdFx0XHRyZXN1bHRzLnB1c2goe1xuXHRcdFx0XHRcdHJlYXNvbixcblx0XHRcdFx0XHRzYXdXYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdGRpc3BhdGNoZWRDb25maXJtZWQ6IGNvbmZpcm1lZEFjdGlvbiAmJiBjb25maXJtZWRBY3Rpb24uYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkICYmIGNvbmZpcm1lZEFjdGlvbi5hY3Rpb24uYXBwcm92ZWRcblx0XHRcdFx0XHRcdD8gY29uZmlybWVkQWN0aW9uLmFjdGlvbi5jb25maXJtZWRcblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbXBsZXRlZDogY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5zb21lKGVudHJ5ID0+IGlzQ2hhdEFjdGlvbihlbnRyeS5hY3Rpb24pXG5cdFx0XHRcdFx0XHQmJiBlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZVxuXHRcdFx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICd0b29sLWNhbGwtMSdcblx0XHRcdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi5yZXN1bHQuc3VjY2VzcyA9PT0gdHJ1ZSksXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRlbGV0ZShsb2NhbCk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cywgcmVhc29ucy5tYXAocmVhc29uID0+ICh7XG5cdFx0XHRcdHJlYXNvbixcblx0XHRcdFx0c2F3V2FpdGluZ0ZvckNvbmZpcm1hdGlvbjogdHJ1ZSxcblx0XHRcdFx0ZGlzcGF0Y2hlZENvbmZpcm1lZDogcmVhc29uLFxuXHRcdFx0XHRjb21wbGV0ZWQ6IHRydWUsXG5cdFx0XHR9KSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgY29uZmlybSBvciBleGVjdXRlIGEgd2FpdGluZyBjbGllbnQgdG9vbCB3aGVuIHRoZSBwcm90b2NvbCBjYWxsIGNvbXBsZXRlcyB3aGlsZSBzdGlsbCBwZW5kaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdLCB7IHJlcXVpcmVDb25maXJtYXRpb246IHRydWUgfSk7XG5cdFx0XHRjb25zdCBjaGF0VVJJID0gYXdhaXQgcmVhY2hMb2NhbFdhaXRpbmdGb3JDb25maXJtYXRpb24oaGFuZGxlciwgY29ubmVjdGlvbik7XG5cblx0XHRcdGNvbnN0IHNhd1dhaXRpbmdGb3JDb25maXJtYXRpb24gPSAodG9vbHNTZXJ2aWNlLnJlY29yZGVkU3RhdGVLaW5kcy5nZXQoJ3Rvb2wtY2FsbC0xJykgPz8gW10pLmluY2x1ZGVzKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pO1xuXG5cdFx0XHQvLyBUaGUgcmVkdWNlciBzeW50aGVzaXplcyBgY29uZmlybWVkOiBOb3ROZWVkZWRgIHdoZW4gYSBjb21wbGV0aW9uXG5cdFx0XHQvLyBhcnJpdmVzIGR1cmluZyBgUGVuZGluZ0NvbmZpcm1hdGlvbmAuIFRoYXQgaXMgbm90IGV2aWRlbmNlIG9mIGFcblx0XHRcdC8vIGdlbnVpbmUgYXBwcm92YWwsIHNvIHRoZSBzdGlsbC13YWl0aW5nIGxvY2FsIGludm9jYXRpb24gbXVzdCBub3Rcblx0XHRcdC8vIGJlIGNvbmZpcm1lZCBvciBkcml2ZW4gdGhyb3VnaCBleGVjdXRpb24uXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihjaGF0VVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIHRhc2snIH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzYXdXYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRzYXdFeGVjdXRpbmc6ICh0b29sc1NlcnZpY2UucmVjb3JkZWRTdGF0ZUtpbmRzLmdldCgndG9vbC1jYWxsLTEnKSA/PyBbXSkuaW5jbHVkZXMoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSxcblx0XHRcdFx0ZGlzcGF0Y2hlZEFwcHJvdmFsOiBjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLnNvbWUoZW50cnkgPT4gaXNDaGF0QWN0aW9uKGVudHJ5LmFjdGlvbilcblx0XHRcdFx0XHQmJiBlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWRcblx0XHRcdFx0XHQmJiBlbnRyeS5hY3Rpb24udG9vbENhbGxJZCA9PT0gJ3Rvb2wtY2FsbC0xJ1xuXHRcdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi5hcHByb3ZlZCA9PT0gdHJ1ZSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNhd1dhaXRpbmdGb3JDb25maXJtYXRpb246IHRydWUsXG5cdFx0XHRcdHNhd0V4ZWN1dGluZzogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoZWRBcHByb3ZhbDogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlY29ubmVjdGluZyB0byBhbiBhY3RpdmUgdHVybiB3aXRoIG93bmVkIGNsaWVudCB0b29sIGNvbXBsZXRlcyB0aGUgaW5pdGlhbCBzbmFwc2hvdCBpbnZvY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFJ1blRhc2tUb29sXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIHRoZSB0YXNrJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHQvLyBhY3RpdmVUdXJuVG9Qcm9ncmVzcyBjcmVhdGVzIGEgZ2VuZXJpYyBDaGF0VG9vbEludm9jYXRpb24gZm9yXG5cdFx0XHQvLyB0aGUgcnVubmluZyBjbGllbnQgdG9vbCB3aGljaCBhcHBlYXJzIGluIHRoZSBzZXNzaW9uJ3MgcHJvZ3Jlc3Ncblx0XHRcdC8vIG9ic2VydmFibGUuIEdyYWIgaXQgYmVmb3JlIF9yZWNvbm5lY3RUb0FjdGl2ZVR1cm4gcmVwbGFjZXMgaXQuXG5cdFx0XHRjb25zdCBzbmFwc2hvdEludm9jYXRpb24gPSAoc2Vzc2lvbiBhcyB1bmtub3duIGFzIHsgcHJvZ3Jlc3NPYnM6IHsgZ2V0KCk6IElDaGF0UHJvZ3Jlc3NbXSB9IH0pXG5cdFx0XHRcdC5wcm9ncmVzc09icy5nZXQoKVxuXHRcdFx0XHQuZmluZCgocCk6IHAgaXMgQ2hhdFRvb2xJbnZvY2F0aW9uID0+IHAgaW5zdGFuY2VvZiBDaGF0VG9vbEludm9jYXRpb24gJiYgcC50b29sQ2FsbElkID09PSAndG9vbC1jYWxsLTEnKTtcblx0XHRcdGFzc2VydC5vayhzbmFwc2hvdEludm9jYXRpb24sICdhY3RpdmVUdXJuVG9Qcm9ncmVzcyBzaG91bGQgaGF2ZSBjcmVhdGVkIGEgc25hcHNob3QgaW52b2NhdGlvbicpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0Ly8gVGhlIHNuYXBzaG90IGludm9jYXRpb24gZnJvbSBhY3RpdmVUdXJuVG9Qcm9ncmVzcyBzaG91bGQgaGF2ZVxuXHRcdFx0Ly8gYmVlbiBjb21wbGV0ZWQgKHZpYSBkaWRFeGVjdXRlVG9vbCkgc28gaXQgZG9lcyBub3QgcmVtYWluXG5cdFx0XHQvLyBvcnBoYW5lZCBpbiB0aGUgVUkgd2hpbGUgdGhlIHJlcGxhY2VtZW50IGZyb21cblx0XHRcdC8vIF9iZWdpbkNsaWVudFRvb2xJbnZvY2F0aW9uIHRha2VzIG92ZXIuXG5cdFx0XHRhc3NlcnQub2soSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHNuYXBzaG90SW52b2NhdGlvbiksXG5cdFx0XHRcdCd0aGUgaW5pdGlhbCBzbmFwc2hvdCBpbnZvY2F0aW9uIHNob3VsZCBiZSBjb21wbGV0ZWQsIG5vdCBvcnBoYW5lZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW52b2tlcyBhIGNsaWVudCB0b29sIGluc2lkZSBhIHN1YmFnZW50IHNlc3Npb24gYW5kIGRpc3BhdGNoZXMgY29tcGxldGlvbiBhZ2FpbnN0IHRoZSBzdWJhZ2VudCBVUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBSZWdyZXNzaW9uOiBhIGNsaWVudC1wcm92aWRlZCB0b29sIHJ1bm5pbmcgaW5zaWRlIGEgc3ViYWdlbnRcblx0XHRcdC8vIG11c3QgYmUgaW52b2tlZCBsb2NhbGx5ICh0aGUgcmVuZGVyZXIgb3ducyB0aGUgdG9vbFxuXHRcdFx0Ly8gaW1wbGVtZW50YXRpb24sIG5vdCB0aGUgYWdlbnQgaG9zdCkuIEJlZm9yZSB0aGUgZml4LCB0aGVcblx0XHRcdC8vIHJlbmRlcmVyIHNraXBwZWQgbG9jYWwgaW52b2NhdGlvbiBmb3Igc3ViYWdlbnQgdG9vbCBjYWxscyxcblx0XHRcdC8vIGxlYXZpbmcgdGhlIHN1YmFnZW50J3MgZGVmZXJyZWQgdW5yZXNvbHZlZC4gQWZ0ZXIgdGhlIGZpeCB0aGVcblx0XHRcdC8vIHRvb2wgaXMgaW52b2tlZCBsb2NhbGx5IGFuZCB0aGUgQ2hhdFRvb2xDYWxsQ29tcGxldGUgaXNcblx0XHRcdC8vIGRpc3BhdGNoZWQgYWdhaW5zdCB0aGUgc3ViYWdlbnQgc2Vzc2lvbiBVUkkgXHUyMDE0IHRoZSBhZ2VudCB0aGVuXG5cdFx0XHQvLyByZXNvbHZlcyBpdCBiYWNrIHRvIHRoZSBwYXJlbnQgc2Vzc2lvbiB0aGF0IG93bnMgdGhlIGRlZmVycmVkLlxuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9ICd0Yy1wYXJlbnQtdGFzayc7XG5cdFx0XHRjb25zdCBzdWJhZ2VudENoYXQgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbiwgcGFyZW50VG9vbENhbGxJZCk7XG5cblx0XHRcdC8vIFBhcmVudCB0dXJuIHdpdGggYSBgdGFza2AgdG9vbCB0aGF0IHNwYXducyBhIHN1YmFnZW50LlxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnZG8gd29yaycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBwYXJlbnRUb29sQ2FsbElkLFxuXHRcdFx0XHR0b29sTmFtZTogJ3Rhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rhc2snLFxuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHBhcmVudFRvb2xDYWxsSWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnU3Bhd25pbmcgc3ViYWdlbnQnLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7fScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHBhcmVudFRvb2xDYWxsSWQsXG5cdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCwgcmVzb3VyY2U6IHN1YmFnZW50Q2hhdCwgdGl0bGU6ICdTdWJhZ2VudCcgfV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU3ViYWdlbnQgdHVybiBjYXJyeWluZyBhIGNsaWVudC1wcm92aWRlZCB0b29sIGNhbGwgKHRvb2xDbGllbnRJZFxuXHRcdFx0Ly8gbWF0Y2hlcyB0aGUgcmVuZGVyZXIncyBjbGllbnRJZCBzbyB0aGUgcmVuZGVyZXIgb3ducyB0aGVcblx0XHRcdC8vIGludm9jYXRpb24pLlxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKHN1YmFnZW50Q2hhdCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3N1Yi10dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICcnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3N1Yi10dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnaW5uZXItdG9vbC1jYWxsLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0KSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICdzdWItdHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2lubmVyLXRvb2wtY2FsbC0xJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInRhc2tcIjpcImJ1aWxkXCJ9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHQvLyBUaGUgaW5uZXIgY2xpZW50IHRvb2wgbXVzdCBoYXZlIGJlZW4gaW52b2tlZCBsb2NhbGx5IFx1MjAxNCB3aXRob3V0XG5cdFx0XHQvLyB0aGUgZml4IHRoZSByZW5kZXJlciB3b3VsZCBza2lwIHN1YmFnZW50IGNsaWVudC10b29sIHNldHVwIGFuZFxuXHRcdFx0Ly8gYGludm9rZWRUb29sQ2FsbHNgIHdvdWxkIGJlIGVtcHR5IGZvciB0aGUgaW5uZXIgY2FsbC5cblx0XHRcdGNvbnN0IGlubmVySW52b2NhdGlvbiA9IHRvb2xzU2VydmljZS5pbnZva2VkVG9vbENhbGxzLmZpbmQoY2FsbCA9PiBjYWxsLmNhbGxJZCA9PT0gJ2lubmVyLXRvb2wtY2FsbC0xJyk7XG5cdFx0XHRhc3NlcnQub2soaW5uZXJJbnZvY2F0aW9uLCAnaW5uZXIgY2xpZW50IHRvb2wgaW5zaWRlIHRoZSBzdWJhZ2VudCBzaG91bGQgYmUgaW52b2tlZCBsb2NhbGx5Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5uZXJJbnZvY2F0aW9uIS50b29sSWQsICd2c2NvZGUucnVuVGFzaycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbm5lckludm9jYXRpb24hLnBhcmFtZXRlcnMsIHsgdGFzazogJ2J1aWxkJyB9KTtcblxuXHRcdFx0Ly8gVGhlIGNvbXBsZXRpb24gbXVzdCBiZSBkaXNwYXRjaGVkIGFnYWluc3QgdGhlIHN1YmFnZW50IHNlc3Npb25cblx0XHRcdC8vIFVSSSAodGhlIGFnZW50IHdpbGwgdGhlbiByZXNvbHZlIGl0IHRvIHRoZSBwYXJlbnQgc2Vzc2lvbiB0aGF0XG5cdFx0XHQvLyBvd25zIHRoZSBTREsgZGVmZXJyZWQpLlxuXHRcdFx0Y29uc3QgY29tcGxldGlvbkVudHJ5ID0gY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5maW5kKGVudHJ5ID0+XG5cdFx0XHRcdGlzQ2hhdEFjdGlvbihlbnRyeS5hY3Rpb24pXG5cdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlXG5cdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50b29sQ2FsbElkID09PSAnaW5uZXItdG9vbC1jYWxsLTEnXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbXBsZXRpb25FbnRyeSwgJ2NvbXBsZXRpb24gZm9yIHRoZSBpbm5lciBjbGllbnQgdG9vbCBzaG91bGQgYmUgZGlzcGF0Y2hlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRjb21wbGV0aW9uRW50cnkuY2hhbm5lbC50b1N0cmluZygpLFxuXHRcdFx0XHRzdWJhZ2VudENoYXQsXG5cdFx0XHRcdCdjb21wbGV0aW9uIHNob3VsZCB0YXJnZXQgdGhlIHN1YmFnZW50IGRlZmF1bHQgY2hhdCBVUkknXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb2JzZXJ2ZXMgY2hpbGQgdG9vbHMgZnJvbSBhIGNsaWVudC1wcm92aWRlZCBkZWxlZ2F0ZWQgdGFzaycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiwgdG9vbHNTZXJ2aWNlIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFN1YmFnZW50VG9vbF0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gJ2NsaWVudC10YXNrLTEnO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0ID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoYmFja2VuZFNlc3Npb24sIHBhcmVudFRvb2xDYWxsSWQpO1xuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdkZWxlZ2F0ZSB3b3JrJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHBhcmVudFRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lOiAndGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnRGVsZWdhdGVkIFRhc2snLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiBjb25uZWN0aW9uLmNsaWVudElkIH0sXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBzdWJhZ2VudENoYXRVcmk6IHN1YmFnZW50Q2hhdCB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBoYW5kbGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRjb25zdCBwYXJlbnRJbnZvY2F0aW9uID0gdG9vbHNTZXJ2aWNlLmJlZ3VuVG9vbENhbGxzLmZpbmQocGFydCA9PiBwYXJ0LnRvb2xDYWxsSWQgPT09IHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcmVudEludm9jYXRpb24/LnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICdzdWJhZ2VudCcpO1xuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHBhcmVudFRvb2xDYWxsSWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZyB0YXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne30nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0KSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAnc3ViLXR1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKHN1YmFnZW50Q2hhdCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAnc3ViLXR1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdjaGlsZC10b29sLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0Jhc2gnLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0KSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICdzdWItdHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2NoaWxkLXRvb2wtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnSW5zcGVjdGluZyBjaGFuZ2VzJyxcblx0XHRcdFx0dG9vbElucHV0OiAne30nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0Y29uc3QgcHJvZ3Jlc3MgPSAoc2Vzc2lvbiBhcyB1bmtub3duIGFzIHsgcHJvZ3Jlc3NPYnM6IHsgZ2V0KCk6IElDaGF0UHJvZ3Jlc3NbXSB9IH0pLnByb2dyZXNzT2JzLmdldCgpO1xuXHRcdFx0Y29uc3QgY2hpbGRJbnZvY2F0aW9ucyA9IHByb2dyZXNzLmZpbHRlcigocGFydCk6IHBhcnQgaXMgQ2hhdFRvb2xJbnZvY2F0aW9uID0+XG5cdFx0XHRcdHBhcnQgaW5zdGFuY2VvZiBDaGF0VG9vbEludm9jYXRpb24gJiYgcGFydC50b29sQ2FsbElkID09PSAnY2hpbGQtdG9vbC0xJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cGFyZW50OiBwYXJlbnRJbnZvY2F0aW9uPy50b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0XHRjaGlsZENvdW50OiBjaGlsZEludm9jYXRpb25zLmxlbmd0aCxcblx0XHRcdFx0Y2hpbGRTdWJBZ2VudEludm9jYXRpb25JZDogY2hpbGRJbnZvY2F0aW9uc1swXT8uc3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHBhcmVudDoge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdQcmVwYXJlZCBkZWxlZ2F0ZWQgdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y2hhdFJlc291cmNlOiBzdWJhZ2VudENoYXQsXG5cdFx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdFx0c3RhcnRlZEF0OiBEYXRlLnBhcnNlKCcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonKSxcblx0XHRcdFx0XHRkdXJhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjaGlsZENvdW50OiAxLFxuXHRcdFx0XHRjaGlsZFN1YkFnZW50SW52b2NhdGlvbklkOiBwYXJlbnRUb29sQ2FsbElkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnZva2VzIGEgY2xpZW50IHRvb2wgaW5zaWRlIGEgbmVzdGVkIChsZXZlbC0yKSBzdWJhZ2VudCBhbmQgZ3JvdXBzIGl0IHVuZGVyIHRoZSByb290JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gUmVncmVzc2lvbjogYSBzdWJhZ2VudCBzcGF3bmVkIGJ5IGFub3RoZXIgc3ViYWdlbnQgd2FzIG5vdFxuXHRcdFx0Ly8gb2JzZXJ2ZWQgKG9ic2VydmF0aW9uIHN0b3BwZWQgYXQgdGhlIGZpcnN0IGxldmVsKSwgc28gYSBjbGllbnRcblx0XHRcdC8vIHRvb2wgZGVlcCBpbiB0aGUgdHJlZSBuZXZlciByYW4uIFdpdGggcmVjdXJzaXZlIG9ic2VydmF0aW9uIHRoZVxuXHRcdFx0Ly8gbGV2ZWwtMiBjbGllbnQgdG9vbCBpcyBpbnZva2VkIGxvY2FsbHksIGl0cyBjb21wbGV0aW9uIGlzXG5cdFx0XHQvLyBkaXNwYXRjaGVkIGFnYWluc3QgdGhlIGxldmVsLTIgc3ViYWdlbnQgY2hhdCwgYW5kIGl0IGlzIGdyb3VwZWRcblx0XHRcdC8vIHVuZGVyIHRoZSBST09UIHN1YmFnZW50IGludm9jYXRpb24gc28gdGhlIHJlbmRlcmVyIG5lc3RzIHRoZVxuXHRcdFx0Ly8gd2hvbGUgdHJlZSB1bmRlciBvbmUgY29udGFpbmVyLlxuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3Qgcm9vdFRvb2xDYWxsSWQgPSAndGMtbDEtdGFzayc7XG5cdFx0XHRjb25zdCBuZXN0ZWRUb29sQ2FsbElkID0gJ3RjLWwyLXRhc2snO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0MSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uLCByb290VG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBzdWJhZ2VudENoYXQyID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoYmFja2VuZFNlc3Npb24sIG5lc3RlZFRvb2xDYWxsSWQpO1xuXG5cdFx0XHQvLyBEZWZhdWx0IHR1cm4gc3Bhd25zIHRoZSBsZXZlbC0xIHN1YmFnZW50LlxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCwgdHVybklkOiAndHVybi0xJywgc3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnZG8gd29yaycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiByb290VG9vbENhbGxJZCwgdG9vbE5hbWU6ICd0YXNrJywgZGlzcGxheU5hbWU6ICdUYXNrJywgX21ldGE6IHsgdG9vbEtpbmQ6ICdzdWJhZ2VudCcgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiByb290VG9vbENhbGxJZCwgaW52b2NhdGlvbk1lc3NhZ2U6ICdTcGF3bmluZyBzdWJhZ2VudCcsIHRvb2xJbnB1dDogJ3t9JywgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogcm9vdFRvb2xDYWxsSWQsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCwgcmVzb3VyY2U6IHN1YmFnZW50Q2hhdDEsIHRpdGxlOiAnU3ViYWdlbnQgTDEnIH1dLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIExldmVsLTEgc3ViYWdlbnQgc3Bhd25zIHRoZSBsZXZlbC0yIHN1YmFnZW50LlxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKHN1YmFnZW50Q2hhdDEpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLCB0dXJuSWQ6ICdzdWItdHVybi0xJywgc3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0MSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAnc3ViLXR1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IG5lc3RlZFRvb2xDYWxsSWQsIHRvb2xOYW1lOiAndGFzaycsIGRpc3BsYXlOYW1lOiAnVGFzaycsIF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQxKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICdzdWItdHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogbmVzdGVkVG9vbENhbGxJZCwgaW52b2NhdGlvbk1lc3NhZ2U6ICdTcGF3bmluZyBuZXN0ZWQgc3ViYWdlbnQnLCB0b29sSW5wdXQ6ICd7fScsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0MSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZCwgdHVybklkOiAnc3ViLXR1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IG5lc3RlZFRvb2xDYWxsSWQsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCwgcmVzb3VyY2U6IHN1YmFnZW50Q2hhdDIsIHRpdGxlOiAnU3ViYWdlbnQgTDInIH1dLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIExldmVsLTIgc3ViYWdlbnQgcnVucyBhIGNsaWVudC1wcm92aWRlZCB0b29sLlxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKHN1YmFnZW50Q2hhdDIpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLCB0dXJuSWQ6ICdzdWItdHVybi0yJywgc3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0MiksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAnc3ViLXR1cm4tMicsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdkZWVwLXRvb2wtY2FsbCcsIHRvb2xOYW1lOiAncnVuVGFzaycsIGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiBjb25uZWN0aW9uLmNsaWVudElkIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQyKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICdzdWItdHVybi0yJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2RlZXAtdG9vbC1jYWxsJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsIHRvb2xJbnB1dDogJ3tcInRhc2tcIjpcImJ1aWxkXCJ9JywgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDIwMCAmJiAhY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5zb21lKGUgPT4gaXNDaGF0QWN0aW9uKGUuYWN0aW9uKSAmJiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlICYmIGUuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICdkZWVwLXRvb2wtY2FsbCcpOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVlcEludm9jYXRpb24gPSB0b29sc1NlcnZpY2UuaW52b2tlZFRvb2xDYWxscy5maW5kKGNhbGwgPT4gY2FsbC5jYWxsSWQgPT09ICdkZWVwLXRvb2wtY2FsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRlZXBJbnZvY2F0aW9uLCAnY2xpZW50IHRvb2wgaW5zaWRlIGEgbmVzdGVkIHN1YmFnZW50IHNob3VsZCBiZSBpbnZva2VkIGxvY2FsbHknKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVlcEludm9jYXRpb24hLnBhcmFtZXRlcnMsIHsgdGFzazogJ2J1aWxkJyB9KTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGlvbkVudHJ5ID0gY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5maW5kKGVudHJ5ID0+XG5cdFx0XHRcdGlzQ2hhdEFjdGlvbihlbnRyeS5hY3Rpb24pXG5cdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlXG5cdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50b29sQ2FsbElkID09PSAnZGVlcC10b29sLWNhbGwnXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbXBsZXRpb25FbnRyeSwgJ2NvbXBsZXRpb24gZm9yIHRoZSBuZXN0ZWQgY2xpZW50IHRvb2wgc2hvdWxkIGJlIGRpc3BhdGNoZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9uRW50cnkuY2hhbm5lbC50b1N0cmluZygpLCBzdWJhZ2VudENoYXQyLCAnY29tcGxldGlvbiBzaG91bGQgdGFyZ2V0IHRoZSBsZXZlbC0yIHN1YmFnZW50IGNoYXQgVVJJJyk7XG5cblx0XHRcdGNvbnN0IGRlZXBCZWd1biA9IHRvb2xzU2VydmljZS5iZWd1blRvb2xDYWxscy5maW5kKGMgPT4gYy50b29sQ2FsbElkID09PSAnZGVlcC10b29sLWNhbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWVwQmVndW4/LnN1YkFnZW50SW52b2NhdGlvbklkLCByb290VG9vbENhbGxJZCwgJ2Rlc2NlbmRhbnQgdG9vbHMgc2hvdWxkIGJlIGdyb3VwZWQgdW5kZXIgdGhlIHJvb3Qgc3ViYWdlbnQgaW52b2NhdGlvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb2JzZXJ2ZXMgYSBuZXN0ZWQgc3ViYWdlbnQgd2l0aG91dCBhIGRpc2NvdmVyeSBjb250ZW50IGJsb2NrIChhZ2VudC1ob3N0IG1pc3JvdXRlcyBpdCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBSZWdyZXNzaW9uIGZvciB0aGUgbG9nZ2VkIHN0YWxsOiB0aGUgYWdlbnQgaG9zdCBlbWl0cyB0aGVcblx0XHRcdC8vIHN1YmFnZW50LWRpc2NvdmVyeSBgQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWRgIGJsb2NrIG9uIHRoZVxuXHRcdFx0Ly8gdG9wLWxldmVsIGNoYXQgcmF0aGVyIHRoYW4gdGhlIGltbWVkaWF0ZSBwYXJlbnQgc3ViYWdlbnQgY2hhdFxuXHRcdFx0Ly8gKHRoZSBgc3ViYWdlbnRfc3RhcnRlZGAgc2lnbmFsIGNhcnJpZXMgbm8gcGFyZW50IHRvb2wgY2FsbCBpZCksXG5cdFx0XHQvLyBzbyBhIG5lc3RlZCBzdWJhZ2VudCdzIHBhcmVudCBjaGF0IG9ubHkgZXZlciBzZWVzXG5cdFx0XHQvLyBzdGFydCArIHJlYWR5IChSdW5uaW5nKSB3aXRoIGBfbWV0YS50b29sS2luZCA9PT0gJ3N1YmFnZW50J2AuXG5cdFx0XHQvLyBPYnNlcnZhdGlvbiBtdXN0IHRoZXJlZm9yZSBwcm9jZWVkIGZyb20gYF9tZXRhYCBhbG9uZSBcdTIwMTQgd2l0aG91dFxuXHRcdFx0Ly8gaXQgdGhlIGxldmVsLTIgc3ViYWdlbnQgKGFuZCBpdHMgY2xpZW50IHRvb2wpIGlzIG5ldmVyIG9ic2VydmVkXG5cdFx0XHQvLyBhbmQgdGhlIHNlc3Npb24gaGFuZ3MgaW4gXCJJbnB1dCBOZWVkZWRcIiB3aXRoIG5vdGhpbmcgdG8gYWN0IG9uLlxuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3Qgcm9vdFRvb2xDYWxsSWQgPSAndGMtbDEtdGFzayc7XG5cdFx0XHRjb25zdCBuZXN0ZWRUb29sQ2FsbElkID0gJ3RjLWwyLXRhc2snO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0MSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uLCByb290VG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBzdWJhZ2VudENoYXQyID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoYmFja2VuZFNlc3Npb24sIG5lc3RlZFRvb2xDYWxsSWQpO1xuXG5cdFx0XHQvLyBEZWZhdWx0IHR1cm4gc3Bhd25zIHRoZSBsZXZlbC0xIHN1YmFnZW50IChubyBjb250ZW50IGJsb2NrKS5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsIHR1cm5JZDogJ3R1cm4tMScsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2RvIHdvcmsnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogcm9vdFRvb2xDYWxsSWQsIHRvb2xOYW1lOiAndGFzaycsIGRpc3BsYXlOYW1lOiAnVGFzaycsIF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogcm9vdFRvb2xDYWxsSWQsIGludm9jYXRpb25NZXNzYWdlOiAnU3Bhd25pbmcgc3ViYWdlbnQnLCB0b29sSW5wdXQ6ICd7fScsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIExldmVsLTEgc3ViYWdlbnQgc3Bhd25zIHRoZSBsZXZlbC0yIHN1YmFnZW50IChubyBjb250ZW50IGJsb2NrKS5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQxKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCwgdHVybklkOiAnc3ViLXR1cm4tMScsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKHN1YmFnZW50Q2hhdDEpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3N1Yi10dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBuZXN0ZWRUb29sQ2FsbElkLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0MSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAnc3ViLXR1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IG5lc3RlZFRvb2xDYWxsSWQsIGludm9jYXRpb25NZXNzYWdlOiAnU3Bhd25pbmcgbmVzdGVkIHN1YmFnZW50JywgdG9vbElucHV0OiAne30nLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBMZXZlbC0yIHN1YmFnZW50IHJ1bnMgYSBjbGllbnQtcHJvdmlkZWQgdG9vbC5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQyKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCwgdHVybklkOiAnc3ViLXR1cm4tMicsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKHN1YmFnZW50Q2hhdDIpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3N1Yi10dXJuLTInLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnZGVlcC10b29sLWNhbGwnLCB0b29sTmFtZTogJ3J1blRhc2snLCBkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0MiksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAnc3ViLXR1cm4tMicsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdkZWVwLXRvb2wtY2FsbCcsIGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLCB0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAyMDAgJiYgIWNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnMuc29tZShlID0+IGlzQ2hhdEFjdGlvbihlLmFjdGlvbikgJiYgZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSAmJiBlLmFjdGlvbi50b29sQ2FsbElkID09PSAnZGVlcC10b29sLWNhbGwnKTsgaSsrKSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlZXBJbnZvY2F0aW9uID0gdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHMuZmluZChjYWxsID0+IGNhbGwuY2FsbElkID09PSAnZGVlcC10b29sLWNhbGwnKTtcblx0XHRcdGFzc2VydC5vayhkZWVwSW52b2NhdGlvbiwgJ2NsaWVudCB0b29sIGluc2lkZSBhIGNvbnRlbnQtYmxvY2stbGVzcyBuZXN0ZWQgc3ViYWdlbnQgc2hvdWxkIHN0aWxsIGJlIGludm9rZWQgbG9jYWxseScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWVwSW52b2NhdGlvbiEucGFyYW1ldGVycywgeyB0YXNrOiAnYnVpbGQnIH0pO1xuXG5cdFx0XHRjb25zdCBjb21wbGV0aW9uRW50cnkgPSBjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLmZpbmQoZW50cnkgPT5cblx0XHRcdFx0aXNDaGF0QWN0aW9uKGVudHJ5LmFjdGlvbilcblx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGVcblx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICdkZWVwLXRvb2wtY2FsbCdcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soY29tcGxldGlvbkVudHJ5LCAnY29tcGxldGlvbiBmb3IgdGhlIG5lc3RlZCBjbGllbnQgdG9vbCBzaG91bGQgYmUgZGlzcGF0Y2hlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25FbnRyeS5jaGFubmVsLnRvU3RyaW5nKCksIHN1YmFnZW50Q2hhdDIsICdjb21wbGV0aW9uIHNob3VsZCB0YXJnZXQgdGhlIGxldmVsLTIgc3ViYWdlbnQgY2hhdCBVUkknKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBNkIsb0JBQW9CO0FBQzFELFNBQVMsV0FBVztBQUNwQixTQUFTLGlCQUFpQixpQkFBaUIsZUFBZTtBQUMxRCxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFvQyw2QkFBNkI7QUFDakUsU0FBUyxvQkFBdUM7QUFDaEQsU0FBUyxtQ0FBbUMscUNBQXFDO0FBQ2pGLFNBQVMsY0FBYyx1QkFBdUw7QUFDOU0sU0FBUyxxQkFBcUIsc0JBQXNCLGlCQUFpQiwwQkFBMEIsYUFBYSxrQkFBa0IsZUFBZSxvQkFBb0IsaUJBQWlCLDJCQUFtRztBQUNyUixTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNEJBQTRCLHlCQUF5Qiw2QkFBNkI7QUFDM0YsU0FBUyx5QkFBeUI7QUFDbEMsU0FBd0IsY0FBYyxxQkFBcUIsdUJBQXVCO0FBQ2xGLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZUFBZSxzQkFBc0I7QUFDOUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FB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
