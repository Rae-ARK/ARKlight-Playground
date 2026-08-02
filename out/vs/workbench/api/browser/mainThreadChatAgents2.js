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
import { DeferredPromise } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableMap } from "../../../base/common/lifecycle.js";
import { autorun } from "../../../base/common/observable.js";
import { revive } from "../../../base/common/marshalling.js";
import { Schemas } from "../../../base/common/network.js";
import { escapeRegExpCharacters } from "../../../base/common/strings.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { URI } from "../../../base/common/uri.js";
import { Codicon } from "../../../base/common/codicons.js";
import { Range } from "../../../editor/common/core/range.js";
import { getWordAtText } from "../../../editor/common/core/wordHelper.js";
import { CompletionItemKind } from "../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../editor/common/services/languageFeatures.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../platform/telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { IChatWidgetService } from "../../contrib/chat/browser/chat.js";
import { AgentSessionProviders, getAgentSessionProvider } from "../../contrib/chat/browser/agentSessions/agentSessions.js";
import { AddDynamicVariableAction } from "../../contrib/chat/browser/attachments/chatDynamicVariables.js";
import { IChatAgentService } from "../../contrib/chat/common/participants/chatAgents.js";
import { IPromptsService, PromptsStorage } from "../../contrib/chat/common/promptSyntax/service/promptsService.js";
import { isValidPromptType, PromptsType } from "../../contrib/chat/common/promptSyntax/promptTypes.js";
import { ChatRequestAgentPart } from "../../contrib/chat/common/requestParser/chatParserTypes.js";
import { ChatRequestParser } from "../../contrib/chat/common/requestParser/chatRequestParser.js";
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from "../../contrib/chat/browser/attachments/chatVariables.js";
import { IChatService } from "../../contrib/chat/common/chatService/chatService.js";
import { ChatSessionOptionsMap, IChatSessionsService } from "../../contrib/chat/common/chatSessionsService.js";
import { ChatAgentLocation, ChatModeKind } from "../../contrib/chat/common/constants.js";
import { ILanguageModelToolsService } from "../../contrib/chat/common/tools/languageModelToolsService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { NotebookDto } from "./mainThreadNotebookDto.js";
import { getChatSessionType, isUntitledChatSession } from "../../contrib/chat/common/model/chatUri.js";
import { ICustomizationHarnessService } from "../../contrib/chat/common/customizationHarnessService.js";
import { AICustomizationManagementSection } from "../../contrib/chat/common/aiCustomizationWorkspaceService.js";
import { IAgentPluginService } from "../../contrib/chat/common/plugins/agentPluginService.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
class MainThreadChatTask {
  constructor(content) {
    this.content = content;
    this.kind = "progressTask";
    this.deferred = new DeferredPromise();
    this._onDidAddProgress = new Emitter();
    this.progress = [];
  }
  get onDidAddProgress() {
    return this._onDidAddProgress.event;
  }
  task() {
    return this.deferred.p;
  }
  isSettled() {
    return this.deferred.isSettled;
  }
  complete(v) {
    this.deferred.complete(v);
  }
  add(progress) {
    this.progress.push(progress);
    this._onDidAddProgress.fire(progress);
  }
  toJSON() {
    return {
      kind: "progressTaskSerialized",
      content: this.content,
      progress: this.progress
    };
  }
}
let MainThreadChatAgents2 = class extends Disposable {
  constructor(extHostContext, _chatAgentService, _chatSessionService, _chatService, _languageFeaturesService, _chatWidgetService, _instantiationService, _logService, _extensionService, _uriIdentityService, _promptsService, _languageModelToolsService, _customizationHarnessService, _telemetryService, _agentPluginService, _environmentService) {
    super();
    this._chatAgentService = _chatAgentService;
    this._chatSessionService = _chatSessionService;
    this._chatService = _chatService;
    this._languageFeaturesService = _languageFeaturesService;
    this._chatWidgetService = _chatWidgetService;
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._extensionService = _extensionService;
    this._uriIdentityService = _uriIdentityService;
    this._promptsService = _promptsService;
    this._languageModelToolsService = _languageModelToolsService;
    this._customizationHarnessService = _customizationHarnessService;
    this._telemetryService = _telemetryService;
    this._agentPluginService = _agentPluginService;
    this._environmentService = _environmentService;
    this._agents = this._register(new DisposableMap());
    this._agentCompletionProviders = this._register(new DisposableMap());
    this._agentIdsToCompletionProviders = this._register(new DisposableMap());
    this._chatParticipantDetectionProviders = this._register(new DisposableMap());
    this._promptFileProviders = this._register(new DisposableMap());
    this._promptFileProviderEmitters = this._register(new DisposableMap());
    this._promptFileContentRegistrations = this._register(new DisposableMap());
    this._customizationProviders = this._register(new DisposableMap());
    this._customizationProviderEmitters = this._register(new DisposableMap());
    this._pendingProgress = /* @__PURE__ */ new Map();
    this._activeTasks = /* @__PURE__ */ new Map();
    this._unresolvedAnchors = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatAgents2);
    this._register(this._chatService.onDidDisposeSession((e) => {
      for (const resource of e.sessionResources) {
        this._proxy.$releaseSession(resource);
      }
    }));
    this._register(this._chatService.onDidPerformUserAction((e) => {
      if (typeof e.agentId === "string") {
        for (const [handle, agent] of this._agents) {
          if (agent.id === e.agentId) {
            if (e.action.kind === "vote") {
              this._proxy.$acceptFeedback(handle, e.result ?? {}, e.action);
            } else {
              this._proxy.$acceptAction(handle, e.result || {}, e);
            }
            break;
          }
        }
      }
    }));
    this._register(this._chatService.onDidReceiveQuestionCarouselAnswer((e) => {
      this._proxy.$handleQuestionCarouselAnswer(e.requestId, e.resolveId, e.answers);
    }));
    this._register(this._chatWidgetService.onDidChangeFocusedSession(() => {
      this._acceptActiveChatSession(this._chatWidgetService.lastFocusedWidget);
    }));
    this._acceptActiveChatSession(this._chatWidgetService.lastFocusedWidget);
    this._register(this._promptsService.onDidChangeCustomAgents(() => {
      this._proxy.$onDidChangeCustomAgents();
    }));
    this._register(this._promptsService.onDidChangeInstructions(() => {
      this._proxy.$onDidChangeInstructions();
    }));
    this._register(this._promptsService.onDidChangeSkills(() => {
      this._proxy.$onDidChangeSkills();
    }));
    this._register(this._promptsService.onDidChangeSlashCommands(() => {
      this._proxy.$onDidChangeSlashCommands();
    }));
    this._register(this._promptsService.onDidChangeHooks(() => {
      this._proxy.$onDidChangeHooks();
    }));
    this._register(autorun((reader) => {
      this._agentPluginService.plugins.read(reader);
      this._proxy.$onDidChangePlugins();
    }));
  }
  _acceptActiveChatSession(widget) {
    const sessionResource = widget?.viewModel?.sessionResource;
    const isLocal = sessionResource && getAgentSessionProvider(sessionResource) === AgentSessionProviders.Local;
    this._proxy.$acceptActiveChatSession(isLocal ? sessionResource : void 0);
  }
  _toChatResourceSource(storage) {
    switch (storage) {
      case PromptsStorage.local:
        return "local";
      case PromptsStorage.user:
        return "user";
      case PromptsStorage.extension:
        return "extension";
      case PromptsStorage.plugin:
        return "plugin";
      case PromptsStorage.builtIn:
        return "builtin";
    }
  }
  _toCustomAgentDto(agent) {
    return {
      uri: agent.uri,
      name: agent.name,
      description: agent.description,
      source: this._toChatResourceSource(agent.source.storage),
      extensionId: agent.source.storage === PromptsStorage.extension ? agent.source.extensionId.value : void 0,
      pluginUri: agent.source.storage === PromptsStorage.plugin ? agent.source.pluginUri : void 0,
      sessionTypes: agent.sessionTypes,
      argumentHint: agent.argumentHint,
      tools: agent.tools,
      model: agent.model,
      userInvocable: agent.visibility.userInvocable,
      disableModelInvocation: !agent.visibility.agentInvocable,
      enabled: agent.enabled
    };
  }
  _toInstructionDto(instruction) {
    return {
      uri: instruction.uri,
      name: instruction.name,
      description: instruction.description,
      source: this._toChatResourceSource(instruction.storage),
      extensionId: instruction.extension?.identifier.value,
      pluginUri: instruction.pluginUri,
      sessionTypes: instruction.sessionTypes,
      pattern: instruction.pattern
    };
  }
  _toSkillDto(skill) {
    return {
      uri: skill.uri,
      name: skill.name,
      description: skill.description,
      source: this._toChatResourceSource(skill.storage),
      extensionId: skill.extension?.identifier.value,
      pluginUri: skill.pluginUri,
      sessionTypes: skill.sessionTypes,
      userInvocable: skill.userInvocable,
      disableModelInvocation: skill.disableModelInvocation
    };
  }
  _toSlashCommandDto(slashCommand) {
    return {
      uri: slashCommand.uri,
      name: slashCommand.name,
      description: slashCommand.description,
      source: this._toChatResourceSource(slashCommand.storage),
      extensionId: slashCommand.extension?.identifier.value,
      pluginUri: slashCommand.pluginUri,
      sessionTypes: slashCommand.sessionTypes,
      argumentHint: slashCommand.argumentHint,
      userInvocable: slashCommand.userInvocable
    };
  }
  _toHookDto(hookFile) {
    return {
      uri: hookFile.uri,
      sessionTypes: hookFile.sessionTypes,
      source: this._toChatResourceSource(hookFile.storage),
      extensionId: hookFile.extension?.identifier.value,
      pluginUri: hookFile.pluginUri
    };
  }
  _toPluginDto(plugin) {
    return {
      uri: plugin.uri
    };
  }
  async $provideCustomAgents(token) {
    const customAgents = await this._promptsService.getCustomAgents(token);
    return customAgents.map((agent) => this._toCustomAgentDto(agent));
  }
  async $provideInstructions(token) {
    const instructions = await this._promptsService.getInstructionFiles(token);
    return instructions.map((instruction) => this._toInstructionDto(instruction));
  }
  async $provideSkills(token) {
    const skills = await this._promptsService.findAgentSkills(token) ?? [];
    return skills.map((skill) => this._toSkillDto(skill));
  }
  async $provideSlashCommands(token) {
    const slashCommands = await this._promptsService.getPromptSlashCommands(token);
    return slashCommands.map((slashCommand) => this._toSlashCommandDto(slashCommand));
  }
  async $provideHooks(token) {
    const hookFiles = await this._promptsService.listPromptFiles(PromptsType.hook, token);
    return hookFiles.map((hookFile) => this._toHookDto(hookFile));
  }
  async $providePlugins(_token) {
    const plugins = this._agentPluginService.plugins.get();
    return plugins.map((plugin) => this._toPluginDto(plugin));
  }
  $unregisterAgent(handle) {
    this._agents.deleteAndDispose(handle);
  }
  async $transferActiveChatSession(toWorkspace) {
    const widget = this._chatWidgetService.lastFocusedWidget;
    const model = widget?.viewModel?.model;
    if (!model) {
      this._logService.error(`MainThreadChat#$transferActiveChatSession: No active chat session found`);
      return;
    }
    await this._chatService.transferChatSession(model.sessionResource, URI.revive(toWorkspace));
  }
  async $registerAgent(handle, extension, id, metadata, dynamicProps) {
    await this._extensionService.whenInstalledExtensionsRegistered();
    const staticAgentRegistration = this._chatAgentService.getAgent(id, true);
    const chatSessionRegistration = this._chatSessionService.getAllChatSessionContributions().find((c) => c.type === id || c.alternativeIds?.includes(id));
    if (!staticAgentRegistration && !chatSessionRegistration && !dynamicProps) {
      if (this._chatAgentService.getAgentsByName(id).length) {
        throw new Error(`chatParticipant must be declared with an ID in package.json. The "id" property may be missing! "${id}"`);
      }
      throw new Error(`chatParticipant must be declared in package.json: ${id}`);
    }
    const impl = {
      invoke: async (request, progress, history, token) => {
        const chatSession = this._chatService.getSession(request.sessionResource);
        this._pendingProgress.set(request.requestId, { progress, chatSession, isSubagent: !!request.subAgentInvocationId });
        try {
          const chatSessionResource = request.sessionResource;
          const chatSessionContext = {
            chatSessionResource,
            isUntitled: isUntitledChatSession(chatSessionResource),
            initialSessionOptions: ChatSessionOptionsMap.toStrValueArray(this._chatSessionService.getSessionOptions(chatSessionResource))
          };
          const rpcResult = await this._proxy.$invokeAgent(handle, request, {
            history,
            chatSessionContext
          }, token);
          if (rpcResult?.errorCallstack && !rpcResult.errorDetails?.isRateLimited && !rpcResult.errorDetails?.isQuotaExceeded && !rpcResult.errorDetails?.isExpectedError) {
            this._telemetryService.publicLogError2("chatAgentError", {
              callstack: rpcResult.errorCallstack,
              msg: rpcResult.errorDetails?.message ?? "",
              errorName: rpcResult.errorName ?? "",
              agent: id,
              agentExtensionId: extension.value
            });
          }
          if (rpcResult) {
            const { errorCallstack: _, errorName: _2, ...result } = rpcResult;
            return result;
          }
          return {};
        } finally {
          this._pendingProgress.delete(request.requestId);
        }
      },
      setRequestTools: (requestId, tools) => {
        this._proxy.$setRequestTools(requestId, tools);
      },
      setYieldRequested: (requestId, value) => {
        this._proxy.$setYieldRequested(requestId, value);
      },
      provideFollowups: async (request, result, history, token) => {
        if (!this._agents.get(handle)?.hasFollowups) {
          return [];
        }
        return this._proxy.$provideFollowups(request, handle, result, { history }, token);
      },
      provideChatTitle: (history, token) => {
        return this._proxy.$provideChatTitle(handle, history, token);
      },
      provideChatSummary: (history, token) => {
        return this._proxy.$provideChatSummary(handle, history, token);
      }
    };
    if (chatSessionRegistration?.alternativeIds?.includes(id)) {
      return;
    }
    let disposable;
    if (!staticAgentRegistration && dynamicProps) {
      const extensionDescription = this._extensionService.extensions.find((e) => ExtensionIdentifier.equals(e.identifier, extension));
      disposable = this._chatAgentService.registerDynamicAgent(
        {
          id,
          name: dynamicProps.name,
          description: dynamicProps.description,
          extensionId: extension,
          extensionVersion: extensionDescription?.version,
          extensionDisplayName: extensionDescription?.displayName ?? extension.value,
          extensionPublisherId: extensionDescription?.publisher ?? "",
          publisherDisplayName: dynamicProps.publisherName,
          fullName: dynamicProps.fullName,
          metadata: revive(metadata),
          slashCommands: [],
          disambiguation: [],
          locations: [ChatAgentLocation.Chat],
          modes: [ChatModeKind.Ask, ChatModeKind.Agent, ChatModeKind.Edit]
        },
        impl
      );
    } else {
      disposable = this._chatAgentService.registerAgentImplementation(id, impl);
    }
    this._agents.set(handle, {
      id,
      extensionId: extension,
      dispose: () => disposable.dispose(),
      hasFollowups: metadata.hasFollowups
    });
  }
  async $updateAgent(handle, metadataUpdate) {
    await this._extensionService.whenInstalledExtensionsRegistered();
    const data = this._agents.get(handle);
    if (!data) {
      this._logService.error(`MainThreadChatAgents2#$updateAgent: No agent with handle ${handle} registered`);
      return;
    }
    data.hasFollowups = metadataUpdate.hasFollowups;
    this._chatAgentService.updateAgent(data.id, revive(metadataUpdate));
  }
  async $handleProgressChunk(requestId, chunks) {
    const pendingProgress = this._pendingProgress.get(requestId);
    if (!pendingProgress) {
      this._logService.warn(`MainThreadChatAgents2#$handleProgressChunk: No pending progress for requestId ${requestId}`);
      return;
    }
    const { progress, chatSession, isSubagent } = pendingProgress;
    const chatProgressParts = [];
    const response = chatSession?.getRequests().find((req) => req.id === requestId)?.response;
    for (const item of chunks) {
      const [progress2, responsePartHandle] = Array.isArray(item) ? item : [item];
      if (progress2.kind === "externalEdits") {
        if (chatSession?.editingSession && responsePartHandle !== void 0 && response) {
          const parts = progress2.start ? await chatSession.editingSession.startExternalEdits(response, responsePartHandle, revive(progress2.resources), progress2.undoStopId) : await chatSession.editingSession.stopExternalEdits(response, responsePartHandle);
          chatProgressParts.push(...parts);
        }
        continue;
      }
      if (progress2.kind === "beginToolInvocation") {
        this._languageModelToolsService.beginToolCall({
          toolCallId: progress2.toolCallId,
          toolId: progress2.toolName,
          chatRequestId: requestId,
          sessionResource: chatSession?.sessionResource,
          subagentInvocationId: progress2.subagentInvocationId
        });
        continue;
      }
      if (progress2.kind === "updateToolInvocation") {
        this._languageModelToolsService.updateToolStream(progress2.toolCallId, progress2.streamData?.partialInput, CancellationToken.None);
        continue;
      }
      if (progress2.kind === "usage") {
        if (isSubagent) {
          chatProgressParts.push({
            kind: "usage",
            promptTokens: progress2.promptTokens,
            completionTokens: progress2.completionTokens,
            outputBuffer: progress2.outputBuffer,
            copilotCredits: progress2.copilotCredits,
            promptTokenDetails: progress2.promptTokenDetails
          });
        } else if (response) {
          response.setUsage({
            kind: "usage",
            promptTokens: progress2.promptTokens,
            completionTokens: progress2.completionTokens,
            outputBuffer: progress2.outputBuffer,
            copilotCredits: progress2.copilotCredits,
            promptTokenDetails: progress2.promptTokenDetails
          });
        } else {
          this._logService.warn(`MainThreadChatAgents2#$handleProgressChunk: No response model for usage of non-subagent request ${requestId}; dropping usage.`);
        }
        continue;
      }
      const revivedProgress = progress2.kind === "notebookEdit" ? ChatNotebookEdit.fromChatEdit(progress2) : revive(progress2);
      if (revivedProgress.kind === "notebookEdit" || revivedProgress.kind === "textEdit" || revivedProgress.kind === "codeblockUri") {
        revivedProgress.uri = this._uriIdentityService.asCanonicalUri(revivedProgress.uri);
      }
      if (responsePartHandle !== void 0) {
        if (revivedProgress.kind === "progressTask") {
          const handle = responsePartHandle;
          const responsePartId = `${requestId}_${handle}`;
          const task = new MainThreadChatTask(revivedProgress.content);
          this._activeTasks.set(responsePartId, task);
          chatProgressParts.push(task);
        } else if (responsePartHandle !== void 0) {
          const responsePartId = `${requestId}_${responsePartHandle}`;
          const task = this._activeTasks.get(responsePartId);
          switch (revivedProgress.kind) {
            case "progressTaskResult":
              if (task && revivedProgress.content) {
                task.complete(revivedProgress.content.value);
                this._activeTasks.delete(responsePartId);
              } else {
                task?.complete(void 0);
              }
              break;
            case "warning":
            case "reference":
              task?.add(revivedProgress);
              break;
          }
        }
        continue;
      }
      if (revivedProgress.kind === "inlineReference" && revivedProgress.resolveId && response) {
        if (!this._unresolvedAnchors.has(requestId)) {
          this._unresolvedAnchors.set(requestId, /* @__PURE__ */ new Map());
        }
        this._unresolvedAnchors.get(requestId)?.set(revivedProgress.resolveId, { response });
      }
      chatProgressParts.push(revivedProgress);
    }
    progress(chatProgressParts);
  }
  $handleAnchorResolve(requestId, handle, resolveAnchor) {
    const unresolvedAnchorsForRequest = this._unresolvedAnchors.get(requestId);
    if (!unresolvedAnchorsForRequest) {
      return;
    }
    const unresolvedAnchor = unresolvedAnchorsForRequest.get(handle);
    if (!unresolvedAnchor) {
      return;
    }
    unresolvedAnchorsForRequest.delete(handle);
    if (unresolvedAnchorsForRequest.size === 0) {
      this._unresolvedAnchors.delete(requestId);
    }
    if (resolveAnchor) {
      const revivedAnchor = revive(resolveAnchor);
      unresolvedAnchor.response.resolveInlineReference(handle, revivedAnchor);
    }
  }
  $registerAgentCompletionsProvider(handle, id, triggerCharacters) {
    const provide = async (query, token) => {
      const completions = await this._proxy.$invokeCompletionProvider(handle, query, token);
      return completions.map((c) => ({ ...c, icon: c.icon ? ThemeIcon.fromId(c.icon) : void 0 }));
    };
    this._agentIdsToCompletionProviders.set(id, this._chatAgentService.registerAgentCompletionProvider(id, provide));
    this._agentCompletionProviders.set(handle, this._languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "chatAgentCompletions:" + handle,
      triggerCharacters,
      provideCompletionItems: async (model, position, _context, token) => {
        const widget = this._chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
          return;
        }
        const triggerCharsPart = triggerCharacters.map((c) => escapeRegExpCharacters(c)).join("");
        const wordRegex = new RegExp(`[${triggerCharsPart}]\\S*`, "g");
        const query = getWordAtText(position.column, wordRegex, model.getLineContent(position.lineNumber), 0)?.word ?? "";
        if (query && !triggerCharacters.some((c) => query.startsWith(c))) {
          return;
        }
        const context = {
          sessionType: getChatSessionType(widget.viewModel.model.sessionResource)
        };
        const parsedRequest = this._instantiationService.createInstance(ChatRequestParser).parseChatRequestWithReferences(getDynamicVariablesForWidget(widget), getSelectedToolAndToolSetsForWidget(widget), model.getValue(), ChatAgentLocation.Chat, context).parts;
        const agentPart = parsedRequest.find((part) => part instanceof ChatRequestAgentPart);
        const thisAgentId = this._agents.get(handle)?.id;
        if (agentPart?.agent.id !== thisAgentId) {
          return;
        }
        const range = computeCompletionRanges(model, position, wordRegex);
        if (!range) {
          return null;
        }
        const result = await provide(query, token);
        const variableItems = result.map((v) => {
          const insertText = v.insertText ?? (typeof v.label === "string" ? v.label : v.label.label);
          const rangeAfterInsert = new Range(range.insert.startLineNumber, range.insert.startColumn, range.insert.endLineNumber, range.insert.startColumn + insertText.length);
          return {
            label: v.label,
            range,
            insertText: insertText + " ",
            kind: CompletionItemKind.Text,
            detail: v.detail,
            documentation: v.documentation,
            command: { id: AddDynamicVariableAction.ID, title: "", arguments: [{ id: v.id, widget, range: rangeAfterInsert, variableData: revive(v.value), command: v.command }] }
          };
        });
        return {
          suggestions: variableItems
        };
      }
    }));
  }
  $unregisterAgentCompletionsProvider(handle, id) {
    this._agentCompletionProviders.deleteAndDispose(handle);
    this._agentIdsToCompletionProviders.deleteAndDispose(id);
  }
  $registerChatParticipantDetectionProvider(handle) {
    this._chatParticipantDetectionProviders.set(handle, this._chatAgentService.registerChatParticipantDetectionProvider(
      handle,
      {
        provideParticipantDetection: async (request, history, options, token) => {
          return await this._proxy.$detectChatParticipant(handle, request, { history }, options, token);
        }
      }
    ));
  }
  $unregisterChatParticipantDetectionProvider(handle) {
    this._chatParticipantDetectionProviders.deleteAndDispose(handle);
  }
  async $registerPromptFileProvider(handle, type, extensionId) {
    const extension = await this._extensionService.getExtension(extensionId.value);
    if (!extension) {
      this._logService.error(`[MainThreadChatAgents2] Could not find extension for prompt file provider: ${extensionId.value}`);
      return;
    }
    if (!isValidPromptType(type)) {
      this._logService.error(`[MainThreadChatAgents2] Invalid contribution type: ${type}`);
      return;
    }
    const emitter = new Emitter();
    this._promptFileProviderEmitters.set(handle, emitter);
    const contentRegistrations = new DisposableMap();
    this._promptFileContentRegistrations.set(handle, contentRegistrations);
    const disposable = this._promptsService.registerPromptFileProvider(extension, type, {
      onDidChangePromptFiles: emitter.event,
      providePromptFiles: async (context, token) => {
        const contributions = await this._proxy.$providePromptFiles(handle, type, context, token);
        if (!contributions) {
          return void 0;
        }
        return contributions.map((c) => {
          return {
            name: c.name,
            description: c.description,
            sessionTypes: c.sessionTypes,
            when: c.when,
            uri: URI.revive(c.uri)
          };
        });
      }
    });
    this._promptFileProviders.set(handle, disposable);
  }
  $unregisterPromptFileProvider(handle) {
    this._promptFileProviders.deleteAndDispose(handle);
    this._promptFileProviderEmitters.deleteAndDispose(handle);
    this._promptFileContentRegistrations.deleteAndDispose(handle);
  }
  $onDidChangePromptFiles(handle) {
    const emitter = this._promptFileProviderEmitters.get(handle);
    if (emitter) {
      emitter.fire();
    }
  }
  async $registerChatSessionCustomizationProvider(handle, chatSessionType, metadata, extensionId) {
    if (this._environmentService.isSessionsWindow && !this._chatSessionService.getContentProviderSchemes().includes(chatSessionType)) {
      return;
    }
    const extension = await this._extensionService.getExtension(extensionId.value);
    if (!extension) {
      this._logService.error(`[MainThreadChatAgents2] Could not find extension for customization provider: ${extensionId.value}`);
      return;
    }
    const emitter = new Emitter();
    this._customizationProviderEmitters.set(handle, emitter);
    const itemProvider = {
      onDidChange: emitter.event,
      provideChatSessionCustomizations: async (sessionResource, token) => {
        const items = await this._proxy.$provideChatSessionCustomizations(handle, sessionResource, token);
        if (!items) {
          return void 0;
        }
        return items.map((item) => ({
          uri: URI.revive(item.uri),
          type: item.type,
          name: item.name,
          source: item.source,
          description: item.description,
          groupKey: item.groupKey,
          badge: item.badge,
          badgeTooltip: item.badgeTooltip,
          extensionId: item.extensionId,
          pluginUri: item.pluginUri ? URI.revive(item.pluginUri) : void 0,
          pluginLabel: item.pluginLabel,
          userInvocable: item.userInvocable
        }));
      },
      provideSourceFolders: async (sessionResource, type, token) => {
        const folders = await this._proxy.$provideSourceFolders(handle, sessionResource, type, token);
        if (!folders) {
          return void 0;
        }
        return folders.map((folder) => ({
          uri: URI.revive(folder.uri),
          label: folder.label,
          source: folder.source
        }));
      }
    };
    const typeToSection = {
      "agent": AICustomizationManagementSection.Agents,
      "skill": AICustomizationManagementSection.Skills,
      "instructions": AICustomizationManagementSection.Instructions,
      "prompt": AICustomizationManagementSection.Prompts,
      "hook": AICustomizationManagementSection.Hooks,
      "plugins": AICustomizationManagementSection.Plugins
    };
    let hiddenSections;
    if (metadata.supportedTypes) {
      const supportedSections = /* @__PURE__ */ new Set();
      for (const t of metadata.supportedTypes) {
        const section = typeToSection[t];
        if (section) {
          supportedSections.add(section);
        }
      }
      hiddenSections = Object.values(typeToSection).filter((section) => !supportedSections.has(section));
    }
    const descriptor = {
      id: chatSessionType,
      label: metadata.label,
      icon: metadata.iconId ? ThemeIcon.fromId(metadata.iconId) : ThemeIcon.fromId(Codicon.extensions.id),
      hiddenSections,
      itemProvider
    };
    const registration = this._customizationHarnessService.registerExternalHarness(descriptor);
    this._customizationProviders.set(handle, registration);
  }
  $unregisterChatSessionCustomizationProvider(handle) {
    this._customizationProviders.deleteAndDispose(handle);
    this._customizationProviderEmitters.deleteAndDispose(handle);
  }
  $onDidChangeCustomizations(handle) {
    const emitter = this._customizationProviderEmitters.get(handle);
    if (emitter) {
      emitter.fire();
    }
  }
};
MainThreadChatAgents2 = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadChatAgents2),
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IChatSessionsService),
  __decorateParam(3, IChatService),
  __decorateParam(4, ILanguageFeaturesService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IExtensionService),
  __decorateParam(9, IUriIdentityService),
  __decorateParam(10, IPromptsService),
  __decorateParam(11, ILanguageModelToolsService),
  __decorateParam(12, ICustomizationHarnessService),
  __decorateParam(13, ITelemetryService),
  __decorateParam(14, IAgentPluginService),
  __decorateParam(15, IWorkbenchEnvironmentService)
], MainThreadChatAgents2);
function computeCompletionRanges(model, position, reg) {
  const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
  if (!varWord && model.getWordUntilPosition(position).word) {
    return;
  }
  let insert;
  let replace;
  if (!varWord) {
    insert = replace = Range.fromPositions(position);
  } else {
    insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
    replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
  }
  return { insert, replace };
}
var ChatNotebookEdit;
((ChatNotebookEdit2) => {
  function fromChatEdit(part) {
    return {
      kind: "notebookEdit",
      uri: URI.revive(part.uri),
      done: part.done,
      edits: part.edits.map(NotebookDto.fromCellEditOperationDto)
    };
  }
  ChatNotebookEdit2.fromChatEdit = fromChatEdit;
})(ChatNotebookEdit || (ChatNotebookEdit = {}));
export {
  MainThreadChatAgents2,
  MainThreadChatTask
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkQ2hhdEFnZW50czIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGdldFdvcmRBdFRleHQgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uQ29udGV4dCwgQ29tcGxldGlvbkl0ZW0sIENvbXBsZXRpb25JdGVtS2luZCwgQ29tcGxldGlvbkxpc3QgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25Qcm92aWRlcnMsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IEFkZER5bmFtaWNWYXJpYWJsZUFjdGlvbiwgSUFkZER5bmFtaWNWYXJpYWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0RHluYW1pY1ZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5LCBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24sIElDaGF0QWdlbnRSZXF1ZXN0LCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgSUFnZW50U2tpbGwsIElDaGF0UHJvbXB0U2xhc2hDb21tYW5kLCBJQ3VzdG9tQWdlbnQsIElJbnN0cnVjdGlvbkZpbGUsIElQcm9tcHRGaWxlQ29udGV4dCwgSVByb21wdFBhdGgsIElQcm9tcHRzU2VydmljZSwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVmFsaWRQcm9tcHRUeXBlLCBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwsIElDaGF0UmVzcG9uc2VNb2RlbCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0QWdlbnRQYXJ0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFBhcnNlciwgSUNoYXRQYXJzZXJDb250ZXh0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRSZXF1ZXN0UGFyc2VyLmpzJztcbmltcG9ydCB7IGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQsIGdldFNlbGVjdGVkVG9vbEFuZFRvb2xTZXRzRm9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2UsIElDaGF0Q29udGVudFJlZmVyZW5jZSwgSUNoYXRGb2xsb3d1cCwgSUNoYXROb3RlYm9va0VkaXQsIElDaGF0UHJvZ3Jlc3MsIElDaGF0U2VydmljZSwgSUNoYXRUYXNrLCBJQ2hhdFRhc2tTZXJpYWxpemVkLCBJQ2hhdFdhcm5pbmdNZXNzYWdlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvbk9wdGlvbnNNYXAsIElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbnRleHQsIGV4dEhvc3ROYW1lZEN1c3RvbWVyIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRHRvIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDaGF0QWdlbnRzU2hhcGUyLCBFeHRIb3N0Q29udGV4dCwgSUNoYXRBZ2VudEludm9rZVJlc3VsdCwgSUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbkl0ZW1EdG8sIElDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Qcm92aWRlck1ldGFkYXRhRHRvLCBJQ2hhdE5vdGVib29rRWRpdER0bywgSUNoYXRQYXJ0aWNpcGFudE1ldGFkYXRhLCBJQ2hhdFByb2dyZXNzRHRvLCBJQ2hhdFNlc3Npb25Db250ZXh0RHRvLCBJQ3VzdG9tQWdlbnREdG8sIElEeW5hbWljQ2hhdEFnZW50UHJvcHMsIElFeHRlbnNpb25DaGF0QWdlbnRNZXRhZGF0YSwgSUhvb2tEdG8sIElJbnN0cnVjdGlvbkR0bywgSVBsdWdpbkR0bywgSVNraWxsRHRvLCBJU2xhc2hDb21tYW5kRHRvLCBNYWluQ29udGV4dCwgTWFpblRocmVhZENoYXRBZ2VudHNTaGFwZTIgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0R0byB9IGZyb20gJy4vbWFpblRocmVhZE5vdGVib29rRHRvLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSwgaXNVbnRpdGxlZENoYXRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIElDdXN0b21pemF0aW9uSXRlbSwgSUN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIsIElIYXJuZXNzRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9haUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpbiwgSUFnZW50UGx1Z2luU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuXG5pbnRlcmZhY2UgQWdlbnREYXRhIHtcblx0ZGlzcG9zZTogKCkgPT4gdm9pZDtcblx0aWQ6IHN0cmluZztcblx0ZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXI7XG5cdGhhc0ZvbGxvd3Vwcz86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBVbnJlc29sdmVkQW5jaG9yIHtcblx0cmVhZG9ubHkgcmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbDtcbn1cblxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRDaGF0VGFzayBpbXBsZW1lbnRzIElDaGF0VGFzayB7XG5cdHB1YmxpYyByZWFkb25seSBraW5kID0gJ3Byb2dyZXNzVGFzayc7XG5cblx0cHVibGljIHJlYWRvbmx5IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTxzdHJpbmcgfCB2b2lkPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWRkUHJvZ3Jlc3MgPSBuZXcgRW1pdHRlcjxJQ2hhdFdhcm5pbmdNZXNzYWdlIHwgSUNoYXRDb250ZW50UmVmZXJlbmNlPigpO1xuXHRwdWJsaWMgZ2V0IG9uRGlkQWRkUHJvZ3Jlc3MoKTogRXZlbnQ8SUNoYXRXYXJuaW5nTWVzc2FnZSB8IElDaGF0Q29udGVudFJlZmVyZW5jZT4geyByZXR1cm4gdGhpcy5fb25EaWRBZGRQcm9ncmVzcy5ldmVudDsgfVxuXG5cdHB1YmxpYyByZWFkb25seSBwcm9ncmVzczogKElDaGF0V2FybmluZ01lc3NhZ2UgfCBJQ2hhdENvbnRlbnRSZWZlcmVuY2UpW10gPSBbXTtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgY29udGVudDogSU1hcmtkb3duU3RyaW5nKSB7IH1cblxuXHR0YXNrKCkge1xuXHRcdHJldHVybiB0aGlzLmRlZmVycmVkLnA7XG5cdH1cblxuXHRpc1NldHRsZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZGVmZXJyZWQuaXNTZXR0bGVkO1xuXHR9XG5cblx0Y29tcGxldGUodjogc3RyaW5nIHwgdm9pZCkge1xuXHRcdHRoaXMuZGVmZXJyZWQuY29tcGxldGUodik7XG5cdH1cblxuXHRhZGQocHJvZ3Jlc3M6IElDaGF0V2FybmluZ01lc3NhZ2UgfCBJQ2hhdENvbnRlbnRSZWZlcmVuY2UpOiB2b2lkIHtcblx0XHR0aGlzLnByb2dyZXNzLnB1c2gocHJvZ3Jlc3MpO1xuXHRcdHRoaXMuX29uRGlkQWRkUHJvZ3Jlc3MuZmlyZShwcm9ncmVzcyk7XG5cdH1cblxuXHR0b0pTT04oKTogSUNoYXRUYXNrU2VyaWFsaXplZCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdwcm9ncmVzc1Rhc2tTZXJpYWxpemVkJyxcblx0XHRcdGNvbnRlbnQ6IHRoaXMuY29udGVudCxcblx0XHRcdHByb2dyZXNzOiB0aGlzLnByb2dyZXNzXG5cdFx0fTtcblx0fVxufVxuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZENoYXRBZ2VudHMyKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRDaGF0QWdlbnRzMiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBNYWluVGhyZWFkQ2hhdEFnZW50c1NoYXBlMiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWdlbnRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyLCBBZ2VudERhdGE+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hZ2VudENvbXBsZXRpb25Qcm92aWRlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxudW1iZXIsIElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWdlbnRJZHNUb0NvbXBsZXRpb25Qcm92aWRlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPik7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyLCBJRGlzcG9zYWJsZT4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvbXB0RmlsZVByb3ZpZGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgSURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRGaWxlUHJvdmlkZXJFbWl0dGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgRW1pdHRlcjx2b2lkPj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb21wdEZpbGVDb250ZW50UmVnaXN0cmF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPj4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3VzdG9taXphdGlvblByb3ZpZGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgSURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21pemF0aW9uUHJvdmlkZXJFbWl0dGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgRW1pdHRlcjx2b2lkPj4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Byb2dyZXNzID0gbmV3IE1hcDxzdHJpbmcsIHsgcHJvZ3Jlc3M6IChwYXJ0czogSUNoYXRQcm9ncmVzc1tdKSA9PiB2b2lkOyBjaGF0U2Vzc2lvbjogSUNoYXRNb2RlbCB8IHVuZGVmaW5lZDsgaXNTdWJhZ2VudDogYm9vbGVhbiB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdENoYXRBZ2VudHNTaGFwZTI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlVGFza3MgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRUYXNrPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3VucmVzb2x2ZWRBbmNob3JzID0gbmV3IE1hcDwvKiByZXF1ZXN0SWQgKi9zdHJpbmcsIE1hcDwvKiBpZCAqLyBzdHJpbmcsIFVucmVzb2x2ZWRBbmNob3I+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2Vzc2lvblNlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASVByb21wdHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElBZ2VudFBsdWdpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRQbHVnaW5TZXJ2aWNlOiBJQWdlbnRQbHVnaW5TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RDaGF0QWdlbnRzMik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0U2VydmljZS5vbkRpZERpc3Bvc2VTZXNzaW9uKGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBlLnNlc3Npb25SZXNvdXJjZXMpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJHJlbGVhc2VTZXNzaW9uKHJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdFNlcnZpY2Uub25EaWRQZXJmb3JtVXNlckFjdGlvbihlID0+IHtcblx0XHRcdGlmICh0eXBlb2YgZS5hZ2VudElkID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtoYW5kbGUsIGFnZW50XSBvZiB0aGlzLl9hZ2VudHMpIHtcblx0XHRcdFx0XHRpZiAoYWdlbnQuaWQgPT09IGUuYWdlbnRJZCkge1xuXHRcdFx0XHRcdFx0aWYgKGUuYWN0aW9uLmtpbmQgPT09ICd2b3RlJykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0RmVlZGJhY2soaGFuZGxlLCBlLnJlc3VsdCA/PyB7fSwgZS5hY3Rpb24pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdEFjdGlvbihoYW5kbGUsIGUucmVzdWx0IHx8IHt9LCBlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0U2VydmljZS5vbkRpZFJlY2VpdmVRdWVzdGlvbkNhcm91c2VsQW5zd2VyKGUgPT4ge1xuXHRcdFx0dGhpcy5fcHJveHkuJGhhbmRsZVF1ZXN0aW9uQ2Fyb3VzZWxBbnN3ZXIoZS5yZXF1ZXN0SWQsIGUucmVzb2x2ZUlkLCBlLmFuc3dlcnMpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5vbkRpZENoYW5nZUZvY3VzZWRTZXNzaW9uKCgpID0+IHtcblx0XHRcdHRoaXMuX2FjY2VwdEFjdGl2ZUNoYXRTZXNzaW9uKHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0KTtcblx0XHR9KSk7XG5cblx0XHQvLyBQdXNoIHRoZSBpbml0aWFsIGFjdGl2ZSBzZXNzaW9uIGlmIHRoZXJlIGlzIGFscmVhZHkgYSBmb2N1c2VkIHdpZGdldFxuXHRcdHRoaXMuX2FjY2VwdEFjdGl2ZUNoYXRTZXNzaW9uKHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Byb21wdHNTZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzKCgpID0+IHtcblx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZUN1c3RvbUFnZW50cygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wcm9tcHRzU2VydmljZS5vbkRpZENoYW5nZUluc3RydWN0aW9ucygoKSA9PiB7XG5cdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VJbnN0cnVjdGlvbnMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJvbXB0c1NlcnZpY2Uub25EaWRDaGFuZ2VTa2lsbHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlU2tpbGxzKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Byb21wdHNTZXJ2aWNlLm9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcygoKSA9PiB7XG5cdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Byb21wdHNTZXJ2aWNlLm9uRGlkQ2hhbmdlSG9va3MoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlSG9va3MoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9hZ2VudFBsdWdpblNlcnZpY2UucGx1Z2lucy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VQbHVnaW5zKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWNjZXB0QWN0aXZlQ2hhdFNlc3Npb24od2lkZ2V0OiBJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHdpZGdldD8udmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgaXNMb2NhbCA9IHNlc3Npb25SZXNvdXJjZSAmJiBnZXRBZ2VudFNlc3Npb25Qcm92aWRlcihzZXNzaW9uUmVzb3VyY2UpID09PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWw7XG5cdFx0dGhpcy5fcHJveHkuJGFjY2VwdEFjdGl2ZUNoYXRTZXNzaW9uKGlzTG9jYWwgPyBzZXNzaW9uUmVzb3VyY2UgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9DaGF0UmVzb3VyY2VTb3VyY2Uoc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UpOiBJQ3VzdG9tQWdlbnREdG9bJ3NvdXJjZSddIHtcblx0XHRzd2l0Y2ggKHN0b3JhZ2UpIHtcblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UubG9jYWw6XG5cdFx0XHRcdHJldHVybiAnbG9jYWwnO1xuXHRcdFx0Y2FzZSBQcm9tcHRzU3RvcmFnZS51c2VyOlxuXHRcdFx0XHRyZXR1cm4gJ3VzZXInO1xuXHRcdFx0Y2FzZSBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb246XG5cdFx0XHRcdHJldHVybiAnZXh0ZW5zaW9uJztcblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UucGx1Z2luOlxuXHRcdFx0XHRyZXR1cm4gJ3BsdWdpbic7XG5cdFx0XHRjYXNlIFByb21wdHNTdG9yYWdlLmJ1aWx0SW46XG5cdFx0XHRcdHJldHVybiAnYnVpbHRpbic7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdG9DdXN0b21BZ2VudER0byhhZ2VudDogSUN1c3RvbUFnZW50KTogSUN1c3RvbUFnZW50RHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiBhZ2VudC51cmksXG5cdFx0XHRuYW1lOiBhZ2VudC5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IGFnZW50LmRlc2NyaXB0aW9uLFxuXHRcdFx0c291cmNlOiB0aGlzLl90b0NoYXRSZXNvdXJjZVNvdXJjZShhZ2VudC5zb3VyY2Uuc3RvcmFnZSksXG5cdFx0XHRleHRlbnNpb25JZDogYWdlbnQuc291cmNlLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiA/IGFnZW50LnNvdXJjZS5leHRlbnNpb25JZC52YWx1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdHBsdWdpblVyaTogYWdlbnQuc291cmNlLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnBsdWdpbiA/IGFnZW50LnNvdXJjZS5wbHVnaW5VcmkgOiB1bmRlZmluZWQsXG5cdFx0XHRzZXNzaW9uVHlwZXM6IGFnZW50LnNlc3Npb25UeXBlcyxcblx0XHRcdGFyZ3VtZW50SGludDogYWdlbnQuYXJndW1lbnRIaW50LFxuXHRcdFx0dG9vbHM6IGFnZW50LnRvb2xzLFxuXHRcdFx0bW9kZWw6IGFnZW50Lm1vZGVsLFxuXHRcdFx0dXNlckludm9jYWJsZTogYWdlbnQudmlzaWJpbGl0eS51c2VySW52b2NhYmxlLFxuXHRcdFx0ZGlzYWJsZU1vZGVsSW52b2NhdGlvbjogIWFnZW50LnZpc2liaWxpdHkuYWdlbnRJbnZvY2FibGUsXG5cdFx0XHRlbmFibGVkOiBhZ2VudC5lbmFibGVkLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF90b0luc3RydWN0aW9uRHRvKGluc3RydWN0aW9uOiBJSW5zdHJ1Y3Rpb25GaWxlKTogSUluc3RydWN0aW9uRHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiBpbnN0cnVjdGlvbi51cmksXG5cdFx0XHRuYW1lOiBpbnN0cnVjdGlvbi5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IGluc3RydWN0aW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0c291cmNlOiB0aGlzLl90b0NoYXRSZXNvdXJjZVNvdXJjZShpbnN0cnVjdGlvbi5zdG9yYWdlKSxcblx0XHRcdGV4dGVuc2lvbklkOiBpbnN0cnVjdGlvbi5leHRlbnNpb24/LmlkZW50aWZpZXIudmFsdWUsXG5cdFx0XHRwbHVnaW5Vcmk6IGluc3RydWN0aW9uLnBsdWdpblVyaSxcblx0XHRcdHNlc3Npb25UeXBlczogaW5zdHJ1Y3Rpb24uc2Vzc2lvblR5cGVzLFxuXHRcdFx0cGF0dGVybjogaW5zdHJ1Y3Rpb24ucGF0dGVybixcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9Ta2lsbER0byhza2lsbDogSUFnZW50U2tpbGwpOiBJU2tpbGxEdG8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IHNraWxsLnVyaSxcblx0XHRcdG5hbWU6IHNraWxsLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogc2tpbGwuZGVzY3JpcHRpb24sXG5cdFx0XHRzb3VyY2U6IHRoaXMuX3RvQ2hhdFJlc291cmNlU291cmNlKHNraWxsLnN0b3JhZ2UpLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHNraWxsLmV4dGVuc2lvbj8uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdHBsdWdpblVyaTogc2tpbGwucGx1Z2luVXJpLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBza2lsbC5zZXNzaW9uVHlwZXMsXG5cdFx0XHR1c2VySW52b2NhYmxlOiBza2lsbC51c2VySW52b2NhYmxlLFxuXHRcdFx0ZGlzYWJsZU1vZGVsSW52b2NhdGlvbjogc2tpbGwuZGlzYWJsZU1vZGVsSW52b2NhdGlvbixcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9TbGFzaENvbW1hbmREdG8oc2xhc2hDb21tYW5kOiBJQ2hhdFByb21wdFNsYXNoQ29tbWFuZCk6IElTbGFzaENvbW1hbmREdG8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IHNsYXNoQ29tbWFuZC51cmksXG5cdFx0XHRuYW1lOiBzbGFzaENvbW1hbmQubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBzbGFzaENvbW1hbmQuZGVzY3JpcHRpb24sXG5cdFx0XHRzb3VyY2U6IHRoaXMuX3RvQ2hhdFJlc291cmNlU291cmNlKHNsYXNoQ29tbWFuZC5zdG9yYWdlKSxcblx0XHRcdGV4dGVuc2lvbklkOiBzbGFzaENvbW1hbmQuZXh0ZW5zaW9uPy5pZGVudGlmaWVyLnZhbHVlLFxuXHRcdFx0cGx1Z2luVXJpOiBzbGFzaENvbW1hbmQucGx1Z2luVXJpLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBzbGFzaENvbW1hbmQuc2Vzc2lvblR5cGVzLFxuXHRcdFx0YXJndW1lbnRIaW50OiBzbGFzaENvbW1hbmQuYXJndW1lbnRIaW50LFxuXHRcdFx0dXNlckludm9jYWJsZTogc2xhc2hDb21tYW5kLnVzZXJJbnZvY2FibGUsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3RvSG9va0R0byhob29rRmlsZTogSVByb21wdFBhdGgpOiBJSG9va0R0byB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogaG9va0ZpbGUudXJpLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBob29rRmlsZS5zZXNzaW9uVHlwZXMsXG5cdFx0XHRzb3VyY2U6IHRoaXMuX3RvQ2hhdFJlc291cmNlU291cmNlKGhvb2tGaWxlLnN0b3JhZ2UpLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGhvb2tGaWxlLmV4dGVuc2lvbj8uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdHBsdWdpblVyaTogaG9va0ZpbGUucGx1Z2luVXJpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF90b1BsdWdpbkR0byhwbHVnaW46IElBZ2VudFBsdWdpbik6IElQbHVnaW5EdG8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IHBsdWdpbi51cmksXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlQ3VzdG9tQWdlbnRzKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUN1c3RvbUFnZW50RHRvW10+IHtcblx0XHRjb25zdCBjdXN0b21BZ2VudHMgPSBhd2FpdCB0aGlzLl9wcm9tcHRzU2VydmljZS5nZXRDdXN0b21BZ2VudHModG9rZW4pO1xuXHRcdHJldHVybiBjdXN0b21BZ2VudHMubWFwKGFnZW50ID0+IHRoaXMuX3RvQ3VzdG9tQWdlbnREdG8oYWdlbnQpKTtcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlSW5zdHJ1Y3Rpb25zKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUluc3RydWN0aW9uRHRvW10+IHtcblx0XHRjb25zdCBpbnN0cnVjdGlvbnMgPSBhd2FpdCB0aGlzLl9wcm9tcHRzU2VydmljZS5nZXRJbnN0cnVjdGlvbkZpbGVzKHRva2VuKTtcblx0XHRyZXR1cm4gaW5zdHJ1Y3Rpb25zLm1hcChpbnN0cnVjdGlvbiA9PiB0aGlzLl90b0luc3RydWN0aW9uRHRvKGluc3RydWN0aW9uKSk7XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZVNraWxscyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTa2lsbER0b1tdPiB7XG5cdFx0Y29uc3Qgc2tpbGxzID0gYXdhaXQgdGhpcy5fcHJvbXB0c1NlcnZpY2UuZmluZEFnZW50U2tpbGxzKHRva2VuKSA/PyBbXTtcblx0XHRyZXR1cm4gc2tpbGxzLm1hcChza2lsbCA9PiB0aGlzLl90b1NraWxsRHRvKHNraWxsKSk7XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZVNsYXNoQ29tbWFuZHModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2xhc2hDb21tYW5kRHRvW10+IHtcblx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgdGhpcy5fcHJvbXB0c1NlcnZpY2UuZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyh0b2tlbik7XG5cdFx0cmV0dXJuIHNsYXNoQ29tbWFuZHMubWFwKHNsYXNoQ29tbWFuZCA9PiB0aGlzLl90b1NsYXNoQ29tbWFuZER0byhzbGFzaENvbW1hbmQpKTtcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlSG9va3ModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJSG9va0R0b1tdPiB7XG5cdFx0Y29uc3QgaG9va0ZpbGVzID0gYXdhaXQgdGhpcy5fcHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmhvb2ssIHRva2VuKTtcblx0XHRyZXR1cm4gaG9va0ZpbGVzLm1hcChob29rRmlsZSA9PiB0aGlzLl90b0hvb2tEdG8oaG9va0ZpbGUpKTtcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlUGx1Z2lucyhfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUGx1Z2luRHRvW10+IHtcblx0XHRjb25zdCBwbHVnaW5zID0gdGhpcy5fYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMuZ2V0KCk7XG5cdFx0cmV0dXJuIHBsdWdpbnMubWFwKHBsdWdpbiA9PiB0aGlzLl90b1BsdWdpbkR0byhwbHVnaW4pKTtcblx0fVxuXG5cblx0JHVucmVnaXN0ZXJBZ2VudChoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2FnZW50cy5kZWxldGVBbmREaXNwb3NlKGhhbmRsZSk7XG5cdH1cblxuXHRhc3luYyAkdHJhbnNmZXJBY3RpdmVDaGF0U2Vzc2lvbih0b1dvcmtzcGFjZTogVXJpQ29tcG9uZW50cyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGNvbnN0IG1vZGVsID0gd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYE1haW5UaHJlYWRDaGF0IyR0cmFuc2ZlckFjdGl2ZUNoYXRTZXNzaW9uOiBObyBhY3RpdmUgY2hhdCBzZXNzaW9uIGZvdW5kYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fY2hhdFNlcnZpY2UudHJhbnNmZXJDaGF0U2Vzc2lvbihtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIFVSSS5yZXZpdmUodG9Xb3Jrc3BhY2UpKTtcblx0fVxuXG5cdGFzeW5jICRyZWdpc3RlckFnZW50KGhhbmRsZTogbnVtYmVyLCBleHRlbnNpb246IEV4dGVuc2lvbklkZW50aWZpZXIsIGlkOiBzdHJpbmcsIG1ldGFkYXRhOiBJRXh0ZW5zaW9uQ2hhdEFnZW50TWV0YWRhdGEsIGR5bmFtaWNQcm9wczogSUR5bmFtaWNDaGF0QWdlbnRQcm9wcyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0Y29uc3Qgc3RhdGljQWdlbnRSZWdpc3RyYXRpb24gPSB0aGlzLl9jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KGlkLCB0cnVlKTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvblJlZ2lzdHJhdGlvbiA9IHRoaXMuX2NoYXRTZXNzaW9uU2VydmljZS5nZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMoKS5maW5kKGMgPT4gYy50eXBlID09PSBpZCB8fCBjLmFsdGVybmF0aXZlSWRzPy5pbmNsdWRlcyhpZCkpO1xuXHRcdGlmICghc3RhdGljQWdlbnRSZWdpc3RyYXRpb24gJiYgIWNoYXRTZXNzaW9uUmVnaXN0cmF0aW9uICYmICFkeW5hbWljUHJvcHMpIHtcblx0XHRcdGlmICh0aGlzLl9jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50c0J5TmFtZShpZCkubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIExpa2VseSBzb21lIGV4dGVuc2lvbiBhdXRob3JzIHdpbGwgbm90IGFkb3B0IHRoZSBuZXcgSUQsIHNvIGdpdmUgYSBoaW50IGlmIHRoZXkgcmVnaXN0ZXIgYVxuXHRcdFx0XHQvLyBwYXJ0aWNpcGFudCBieSBuYW1lIGluc3RlYWQgb2YgSUQuXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgY2hhdFBhcnRpY2lwYW50IG11c3QgYmUgZGVjbGFyZWQgd2l0aCBhbiBJRCBpbiBwYWNrYWdlLmpzb24uIFRoZSBcImlkXCIgcHJvcGVydHkgbWF5IGJlIG1pc3NpbmchIFwiJHtpZH1cImApO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGNoYXRQYXJ0aWNpcGFudCBtdXN0IGJlIGRlY2xhcmVkIGluIHBhY2thZ2UuanNvbjogJHtpZH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbXBsOiBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24gPSB7XG5cdFx0XHRpbnZva2U6IGFzeW5jIChyZXF1ZXN0LCBwcm9ncmVzcywgaGlzdG9yeSwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgY2hhdFNlc3Npb24gPSB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKHJlcXVlc3Quc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Byb2dyZXNzLnNldChyZXF1ZXN0LnJlcXVlc3RJZCwgeyBwcm9ncmVzcywgY2hhdFNlc3Npb24sIGlzU3ViYWdlbnQ6ICEhcmVxdWVzdC5zdWJBZ2VudEludm9jYXRpb25JZCB9KTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBjaGF0U2Vzc2lvblJlc291cmNlID0gcmVxdWVzdC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdFx0Y29uc3QgY2hhdFNlc3Npb25Db250ZXh0OiBJQ2hhdFNlc3Npb25Db250ZXh0RHRvID0ge1xuXHRcdFx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRcdGlzVW50aXRsZWQ6IGlzVW50aXRsZWRDaGF0U2Vzc2lvbihjaGF0U2Vzc2lvblJlc291cmNlKSxcblx0XHRcdFx0XHRcdGluaXRpYWxTZXNzaW9uT3B0aW9uczogQ2hhdFNlc3Npb25PcHRpb25zTWFwLnRvU3RyVmFsdWVBcnJheSh0aGlzLl9jaGF0U2Vzc2lvblNlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbnMoY2hhdFNlc3Npb25SZXNvdXJjZSkpLFxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRjb25zdCBycGNSZXN1bHQ6IElDaGF0QWdlbnRJbnZva2VSZXN1bHQgfCB1bmRlZmluZWQgPSBhd2FpdCB0aGlzLl9wcm94eS4kaW52b2tlQWdlbnQoaGFuZGxlLCByZXF1ZXN0LCB7XG5cdFx0XHRcdFx0XHRoaXN0b3J5LFxuXHRcdFx0XHRcdFx0Y2hhdFNlc3Npb25Db250ZXh0LFxuXHRcdFx0XHRcdH0sIHRva2VuKTtcblxuXHRcdFx0XHRcdC8vIFN1cHByZXNzIGV4cGVjdGVkIG9wZXJhdGlvbmFsIGVycm9ycyAocmF0ZSBsaW1pdGluZywgcXVvdGEgZXhjZWVkZWQsIGFuZCBvdGhlclxuXHRcdFx0XHRcdC8vIHVzZXItYWN0aW9uYWJsZSBjb25kaXRpb25zIGZsYWdnZWQgdmlhIGBpc0V4cGVjdGVkRXJyb3JgKSBmcm9tIGVycm9yIHRlbGVtZXRyeVxuXHRcdFx0XHRcdC8vIHRvIGF2b2lkIG5vaXNlIGluIGVycm9yIHJlcG9ydGluZy5cblx0XHRcdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMxMTU4MiAocmF0ZS1saW1pdGVkIHByZWNlZGVudCksXG5cdFx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMxMTU4MyAoc3Bhd24gZ2l0IEVOT0VOVCksXG5cdFx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMxMTU4NCAobmV0d29yayBjb25uZWN0aXZpdHkpLFxuXHRcdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMTE1ODUgKEVQRVJNL3Blcm1pc3Npb24gZXJyb3JzKSxcblx0XHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzExNTg2IChVTkMgaG9zdCBhY2Nlc3MpLFxuXHRcdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMTE1ODcgKGNsb3VkIGFnZW50IG5vdCBlbmFibGVkKS5cblx0XHRcdFx0XHRpZiAocnBjUmVzdWx0Py5lcnJvckNhbGxzdGFjayAmJiAhcnBjUmVzdWx0LmVycm9yRGV0YWlscz8uaXNSYXRlTGltaXRlZCAmJiAhcnBjUmVzdWx0LmVycm9yRGV0YWlscz8uaXNRdW90YUV4Y2VlZGVkICYmICFycGNSZXN1bHQuZXJyb3JEZXRhaWxzPy5pc0V4cGVjdGVkRXJyb3IpIHtcblx0XHRcdFx0XHRcdHR5cGUgQ2hhdEFnZW50RXJyb3JFdmVudCA9IHsgY2FsbHN0YWNrOiBzdHJpbmc7IG1zZzogc3RyaW5nOyBlcnJvck5hbWU6IHN0cmluZzsgYWdlbnQ6IHN0cmluZzsgYWdlbnRFeHRlbnNpb25JZDogc3RyaW5nIH07XG5cdFx0XHRcdFx0XHR0eXBlIENoYXRBZ2VudEVycm9yQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0XHRcdG93bmVyOiAnYnJ5YW5jaGVuLWQnO1xuXHRcdFx0XHRcdFx0XHRjb21tZW50OiAnTG9nZ2VkIHdoZW4gYSBjaGF0IGFnZW50IGhhbmRsZXIgdGhyb3dzIGFuIGVycm9yIHdpdGggYSBjYWxsc3RhY2suJztcblx0XHRcdFx0XHRcdFx0Y2FsbHN0YWNrOiB7IGNsYXNzaWZpY2F0aW9uOiAnQ2FsbHN0YWNrT3JFeGNlcHRpb24nOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGNhbGxzdGFjayBvZiB0aGUgZXJyb3IuJyB9O1xuXHRcdFx0XHRcdFx0XHRtc2c6IHsgY2xhc3NpZmljYXRpb246ICdDYWxsc3RhY2tPckV4Y2VwdGlvbic7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgZXJyb3IgbWVzc2FnZS4nIH07XG5cdFx0XHRcdFx0XHRcdGVycm9yTmFtZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBlcnJvciBuYW1lIChlLmcuIFR5cGVFcnJvciwgQ2hhdFF1b3RhRXhjZWVkZWQpLicgfTtcblx0XHRcdFx0XHRcdFx0YWdlbnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgYWdlbnQgdGhhdCB0aHJldyB0aGUgZXJyb3IuJyB9O1xuXHRcdFx0XHRcdFx0XHRhZ2VudEV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGV4dGVuc2lvbiB0aGF0IGNvbnRyaWJ1dGVkIHRoZSBhZ2VudC4nIH07XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2dFcnJvcjI8Q2hhdEFnZW50RXJyb3JFdmVudCwgQ2hhdEFnZW50RXJyb3JDbGFzc2lmaWNhdGlvbj4oJ2NoYXRBZ2VudEVycm9yJywge1xuXHRcdFx0XHRcdFx0XHRjYWxsc3RhY2s6IHJwY1Jlc3VsdC5lcnJvckNhbGxzdGFjayxcblx0XHRcdFx0XHRcdFx0bXNnOiBycGNSZXN1bHQuZXJyb3JEZXRhaWxzPy5tZXNzYWdlID8/ICcnLFxuXHRcdFx0XHRcdFx0XHRlcnJvck5hbWU6IHJwY1Jlc3VsdC5lcnJvck5hbWUgPz8gJycsXG5cdFx0XHRcdFx0XHRcdGFnZW50OiBpZCxcblx0XHRcdFx0XHRcdFx0YWdlbnRFeHRlbnNpb25JZDogZXh0ZW5zaW9uLnZhbHVlLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gU3RyaXAgdGVsZW1ldHJ5LW9ubHkgZmllbGQgYmVmb3JlIHJldHVybmluZyB0byB0aGUgbW9kZWwgbGF5ZXJcblx0XHRcdFx0XHRpZiAocnBjUmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCB7IGVycm9yQ2FsbHN0YWNrOiBfLCBlcnJvck5hbWU6IF8yLCAuLi5yZXN1bHQgfSA9IHJwY1Jlc3VsdDtcblx0XHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB7fTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nUHJvZ3Jlc3MuZGVsZXRlKHJlcXVlc3QucmVxdWVzdElkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHNldFJlcXVlc3RUb29sczogKHJlcXVlc3RJZCwgdG9vbHMpID0+IHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJHNldFJlcXVlc3RUb29scyhyZXF1ZXN0SWQsIHRvb2xzKTtcblx0XHRcdH0sXG5cdFx0XHRzZXRZaWVsZFJlcXVlc3RlZDogKHJlcXVlc3RJZCwgdmFsdWUpID0+IHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJHNldFlpZWxkUmVxdWVzdGVkKHJlcXVlc3RJZCwgdmFsdWUpO1xuXHRcdFx0fSxcblx0XHRcdHByb3ZpZGVGb2xsb3d1cHM6IGFzeW5jIChyZXF1ZXN0LCByZXN1bHQsIGhpc3RvcnksIHRva2VuKTogUHJvbWlzZTxJQ2hhdEZvbGxvd3VwW10+ID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9hZ2VudHMuZ2V0KGhhbmRsZSk/Lmhhc0ZvbGxvd3Vwcykge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZUZvbGxvd3VwcyhyZXF1ZXN0LCBoYW5kbGUsIHJlc3VsdCwgeyBoaXN0b3J5IH0sIHRva2VuKTtcblx0XHRcdH0sXG5cdFx0XHRwcm92aWRlQ2hhdFRpdGxlOiAoaGlzdG9yeSwgdG9rZW4pID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlQ2hhdFRpdGxlKGhhbmRsZSwgaGlzdG9yeSwgdG9rZW4pO1xuXHRcdFx0fSxcblx0XHRcdHByb3ZpZGVDaGF0U3VtbWFyeTogKGhpc3RvcnksIHRva2VuKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZUNoYXRTdW1tYXJ5KGhhbmRsZSwgaGlzdG9yeSwgdG9rZW4pO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Ly8gRG8gbm90IGF0dGVtcHQgdG8gcmVnaXN0ZXIgbWlncmF0ZWQgY2hhdFNlc3Npb24gcHJvdmlkZXJzXG5cdFx0aWYgKGNoYXRTZXNzaW9uUmVnaXN0cmF0aW9uPy5hbHRlcm5hdGl2ZUlkcz8uaW5jbHVkZXMoaWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xuXHRcdGlmICghc3RhdGljQWdlbnRSZWdpc3RyYXRpb24gJiYgZHluYW1pY1Byb3BzKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25EZXNjcmlwdGlvbiA9IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5maW5kKGUgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24pKTtcblx0XHRcdGRpc3Bvc2FibGUgPSB0aGlzLl9jaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyRHluYW1pY0FnZW50KFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0bmFtZTogZHluYW1pY1Byb3BzLm5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGR5bmFtaWNQcm9wcy5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRleHRlbnNpb25JZDogZXh0ZW5zaW9uLFxuXHRcdFx0XHRcdGV4dGVuc2lvblZlcnNpb246IGV4dGVuc2lvbkRlc2NyaXB0aW9uPy52ZXJzaW9uLFxuXHRcdFx0XHRcdGV4dGVuc2lvbkRpc3BsYXlOYW1lOiBleHRlbnNpb25EZXNjcmlwdGlvbj8uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLnZhbHVlLFxuXHRcdFx0XHRcdGV4dGVuc2lvblB1Ymxpc2hlcklkOiBleHRlbnNpb25EZXNjcmlwdGlvbj8ucHVibGlzaGVyID8/ICcnLFxuXHRcdFx0XHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBkeW5hbWljUHJvcHMucHVibGlzaGVyTmFtZSxcblx0XHRcdFx0XHRmdWxsTmFtZTogZHluYW1pY1Byb3BzLmZ1bGxOYW1lLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiByZXZpdmUobWV0YWRhdGEpLFxuXHRcdFx0XHRcdHNsYXNoQ29tbWFuZHM6IFtdLFxuXHRcdFx0XHRcdGRpc2FtYmlndWF0aW9uOiBbXSxcblx0XHRcdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdFx0XHRtb2RlczogW0NoYXRNb2RlS2luZC5Bc2ssIENoYXRNb2RlS2luZC5BZ2VudCwgQ2hhdE1vZGVLaW5kLkVkaXRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbXBsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGlzcG9zYWJsZSA9IHRoaXMuX2NoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKGlkLCBpbXBsKTtcblx0XHR9XG5cblx0XHR0aGlzLl9hZ2VudHMuc2V0KGhhbmRsZSwge1xuXHRcdFx0aWQ6IGlkLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbixcblx0XHRcdGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpLFxuXHRcdFx0aGFzRm9sbG93dXBzOiBtZXRhZGF0YS5oYXNGb2xsb3d1cHNcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jICR1cGRhdGVBZ2VudChoYW5kbGU6IG51bWJlciwgbWV0YWRhdGFVcGRhdGU6IElFeHRlbnNpb25DaGF0QWdlbnRNZXRhZGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2FnZW50cy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYE1haW5UaHJlYWRDaGF0QWdlbnRzMiMkdXBkYXRlQWdlbnQ6IE5vIGFnZW50IHdpdGggaGFuZGxlICR7aGFuZGxlfSByZWdpc3RlcmVkYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGRhdGEuaGFzRm9sbG93dXBzID0gbWV0YWRhdGFVcGRhdGUuaGFzRm9sbG93dXBzO1xuXHRcdHRoaXMuX2NoYXRBZ2VudFNlcnZpY2UudXBkYXRlQWdlbnQoZGF0YS5pZCwgcmV2aXZlKG1ldGFkYXRhVXBkYXRlKSk7XG5cdH1cblxuXHRhc3luYyAkaGFuZGxlUHJvZ3Jlc3NDaHVuayhyZXF1ZXN0SWQ6IHN0cmluZywgY2h1bmtzOiAoSUNoYXRQcm9ncmVzc0R0byB8IFtJQ2hhdFByb2dyZXNzRHRvLCBudW1iZXJdKVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGVuZGluZ1Byb2dyZXNzID0gdGhpcy5fcGVuZGluZ1Byb2dyZXNzLmdldChyZXF1ZXN0SWQpO1xuXHRcdGlmICghcGVuZGluZ1Byb2dyZXNzKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYE1haW5UaHJlYWRDaGF0QWdlbnRzMiMkaGFuZGxlUHJvZ3Jlc3NDaHVuazogTm8gcGVuZGluZyBwcm9ncmVzcyBmb3IgcmVxdWVzdElkICR7cmVxdWVzdElkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcHJvZ3Jlc3MsIGNoYXRTZXNzaW9uLCBpc1N1YmFnZW50IH0gPSBwZW5kaW5nUHJvZ3Jlc3M7XG5cdFx0Y29uc3QgY2hhdFByb2dyZXNzUGFydHM6IElDaGF0UHJvZ3Jlc3NbXSA9IFtdO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBjaGF0U2Vzc2lvbj8uZ2V0UmVxdWVzdHMoKS5maW5kKHJlcSA9PiByZXEuaWQgPT09IHJlcXVlc3RJZCk/LnJlc3BvbnNlO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGNodW5rcykge1xuXHRcdFx0Y29uc3QgW3Byb2dyZXNzLCByZXNwb25zZVBhcnRIYW5kbGVdID0gQXJyYXkuaXNBcnJheShpdGVtKSA/IGl0ZW0gOiBbaXRlbV07XG5cblx0XHRcdGlmIChwcm9ncmVzcy5raW5kID09PSAnZXh0ZXJuYWxFZGl0cycpIHtcblx0XHRcdFx0aWYgKGNoYXRTZXNzaW9uPy5lZGl0aW5nU2Vzc2lvbiAmJiByZXNwb25zZVBhcnRIYW5kbGUgIT09IHVuZGVmaW5lZCAmJiByZXNwb25zZSkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnRzID0gcHJvZ3Jlc3Muc3RhcnRcblx0XHRcdFx0XHRcdD8gYXdhaXQgY2hhdFNlc3Npb24uZWRpdGluZ1Nlc3Npb24uc3RhcnRFeHRlcm5hbEVkaXRzKHJlc3BvbnNlLCByZXNwb25zZVBhcnRIYW5kbGUsIHJldml2ZShwcm9ncmVzcy5yZXNvdXJjZXMpLCBwcm9ncmVzcy51bmRvU3RvcElkKVxuXHRcdFx0XHRcdFx0OiBhd2FpdCBjaGF0U2Vzc2lvbi5lZGl0aW5nU2Vzc2lvbi5zdG9wRXh0ZXJuYWxFZGl0cyhyZXNwb25zZSwgcmVzcG9uc2VQYXJ0SGFuZGxlKTtcblx0XHRcdFx0XHRjaGF0UHJvZ3Jlc3NQYXJ0cy5wdXNoKC4uLnBhcnRzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHByb2dyZXNzLmtpbmQgPT09ICdiZWdpblRvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0XHQvLyBCZWdpbiBhIHN0cmVhbWluZyB0b29sIGludm9jYXRpb25cblx0XHRcdFx0dGhpcy5fbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5iZWdpblRvb2xDYWxsKHtcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBwcm9ncmVzcy50b29sQ2FsbElkLFxuXHRcdFx0XHRcdHRvb2xJZDogcHJvZ3Jlc3MudG9vbE5hbWUsXG5cdFx0XHRcdFx0Y2hhdFJlcXVlc3RJZDogcmVxdWVzdElkLFxuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogY2hhdFNlc3Npb24/LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRzdWJhZ2VudEludm9jYXRpb25JZDogcHJvZ3Jlc3Muc3ViYWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHByb2dyZXNzLmtpbmQgPT09ICd1cGRhdGVUb29sSW52b2NhdGlvbicpIHtcblx0XHRcdFx0Ly8gVXBkYXRlIHRoZSBzdHJlYW1pbmcgZGF0YSBmb3IgYW4gZXhpc3RpbmcgdG9vbCBpbnZvY2F0aW9uXG5cdFx0XHRcdHRoaXMuX2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UudXBkYXRlVG9vbFN0cmVhbShwcm9ncmVzcy50b29sQ2FsbElkLCBwcm9ncmVzcy5zdHJlYW1EYXRhPy5wYXJ0aWFsSW5wdXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHByb2dyZXNzLmtpbmQgPT09ICd1c2FnZScpIHtcblx0XHRcdFx0aWYgKGlzU3ViYWdlbnQpIHtcblx0XHRcdFx0XHQvLyBBIHN1YmFnZW50IGludm9rZWQgdmlhIFJ1blN1YmFnZW50VG9vbCByZXVzZXMgdGhlIHBhcmVudCByZXF1ZXN0IGFuZFxuXHRcdFx0XHRcdC8vIGhhcyBubyByZXF1ZXN0IG1vZGVsIG9mIGl0cyBvd24uIEZvcndhcmQgdGhlIHVzYWdlIHRvIHRoZSBhZ2VudCdzXG5cdFx0XHRcdFx0Ly8gcHJvZ3Jlc3MgY2FsbGJhY2sgc28gdGhlIHN1YmFnZW50IHRvb2wgY2FuIHN1cmZhY2UgaXRzIGNyZWRpdCAoQUlDKVxuXHRcdFx0XHRcdC8vIGNvc3Qgb24gaG92ZXIsIHdpdGhvdXQgaW5mbGF0aW5nIHRoZSBwYXJlbnQgcmVxdWVzdCdzIGNvbnRleHQtd2luZG93XG5cdFx0XHRcdFx0Ly8gd2lkZ2V0IG9yIHRva2VuIGNvdW50cy5cblx0XHRcdFx0XHRjaGF0UHJvZ3Jlc3NQYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRcdGtpbmQ6ICd1c2FnZScsXG5cdFx0XHRcdFx0XHRwcm9tcHRUb2tlbnM6IHByb2dyZXNzLnByb21wdFRva2Vucyxcblx0XHRcdFx0XHRcdGNvbXBsZXRpb25Ub2tlbnM6IHByb2dyZXNzLmNvbXBsZXRpb25Ub2tlbnMsXG5cdFx0XHRcdFx0XHRvdXRwdXRCdWZmZXI6IHByb2dyZXNzLm91dHB1dEJ1ZmZlcixcblx0XHRcdFx0XHRcdGNvcGlsb3RDcmVkaXRzOiBwcm9ncmVzcy5jb3BpbG90Q3JlZGl0cyxcblx0XHRcdFx0XHRcdHByb21wdFRva2VuRGV0YWlsczogcHJvZ3Jlc3MucHJvbXB0VG9rZW5EZXRhaWxzXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocmVzcG9uc2UpIHtcblx0XHRcdFx0XHRyZXNwb25zZS5zZXRVc2FnZSh7XG5cdFx0XHRcdFx0XHRraW5kOiAndXNhZ2UnLFxuXHRcdFx0XHRcdFx0cHJvbXB0VG9rZW5zOiBwcm9ncmVzcy5wcm9tcHRUb2tlbnMsXG5cdFx0XHRcdFx0XHRjb21wbGV0aW9uVG9rZW5zOiBwcm9ncmVzcy5jb21wbGV0aW9uVG9rZW5zLFxuXHRcdFx0XHRcdFx0b3V0cHV0QnVmZmVyOiBwcm9ncmVzcy5vdXRwdXRCdWZmZXIsXG5cdFx0XHRcdFx0XHRjb3BpbG90Q3JlZGl0czogcHJvZ3Jlc3MuY29waWxvdENyZWRpdHMsXG5cdFx0XHRcdFx0XHRwcm9tcHRUb2tlbkRldGFpbHM6IHByb2dyZXNzLnByb21wdFRva2VuRGV0YWlsc1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIE5vbi1zdWJhZ2VudCByZXF1ZXN0IHdpdGggbm8gcmVzcG9uc2UgbW9kZWw6IHVuZXhwZWN0ZWQuIERyb3AgdGhlXG5cdFx0XHRcdFx0Ly8gdXNhZ2UgcmF0aGVyIHRoYW4gZm9yd2FyZGluZyBpdCBhcyBhIHByb2dyZXNzIHBhcnQuXG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBNYWluVGhyZWFkQ2hhdEFnZW50czIjJGhhbmRsZVByb2dyZXNzQ2h1bms6IE5vIHJlc3BvbnNlIG1vZGVsIGZvciB1c2FnZSBvZiBub24tc3ViYWdlbnQgcmVxdWVzdCAke3JlcXVlc3RJZH07IGRyb3BwaW5nIHVzYWdlLmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXZpdmVkUHJvZ3Jlc3MgPSBwcm9ncmVzcy5raW5kID09PSAnbm90ZWJvb2tFZGl0J1xuXHRcdFx0XHQ/IENoYXROb3RlYm9va0VkaXQuZnJvbUNoYXRFZGl0KHByb2dyZXNzKVxuXHRcdFx0XHQ6IHJldml2ZShwcm9ncmVzcykgYXMgSUNoYXRQcm9ncmVzcztcblxuXHRcdFx0aWYgKHJldml2ZWRQcm9ncmVzcy5raW5kID09PSAnbm90ZWJvb2tFZGl0J1xuXHRcdFx0XHR8fCByZXZpdmVkUHJvZ3Jlc3Mua2luZCA9PT0gJ3RleHRFZGl0J1xuXHRcdFx0XHR8fCByZXZpdmVkUHJvZ3Jlc3Mua2luZCA9PT0gJ2NvZGVibG9ja1VyaSdcblx0XHRcdCkge1xuXHRcdFx0XHQvLyBtYWtlIHN1cmUgdG8gdXNlIHRoZSBjYW5vbmljYWwgdXJpXG5cdFx0XHRcdHJldml2ZWRQcm9ncmVzcy51cmkgPSB0aGlzLl91cmlJZGVudGl0eVNlcnZpY2UuYXNDYW5vbmljYWxVcmkocmV2aXZlZFByb2dyZXNzLnVyaSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXNwb25zZVBhcnRIYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuXG5cdFx0XHRcdGlmIChyZXZpdmVkUHJvZ3Jlc3Mua2luZCA9PT0gJ3Byb2dyZXNzVGFzaycpIHtcblx0XHRcdFx0XHRjb25zdCBoYW5kbGUgPSByZXNwb25zZVBhcnRIYW5kbGU7XG5cdFx0XHRcdFx0Y29uc3QgcmVzcG9uc2VQYXJ0SWQgPSBgJHtyZXF1ZXN0SWR9XyR7aGFuZGxlfWA7XG5cdFx0XHRcdFx0Y29uc3QgdGFzayA9IG5ldyBNYWluVGhyZWFkQ2hhdFRhc2socmV2aXZlZFByb2dyZXNzLmNvbnRlbnQpO1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVRhc2tzLnNldChyZXNwb25zZVBhcnRJZCwgdGFzayk7XG5cdFx0XHRcdFx0Y2hhdFByb2dyZXNzUGFydHMucHVzaCh0YXNrKTtcblx0XHRcdFx0fSBlbHNlIGlmIChyZXNwb25zZVBhcnRIYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlUGFydElkID0gYCR7cmVxdWVzdElkfV8ke3Jlc3BvbnNlUGFydEhhbmRsZX1gO1xuXHRcdFx0XHRcdGNvbnN0IHRhc2sgPSB0aGlzLl9hY3RpdmVUYXNrcy5nZXQocmVzcG9uc2VQYXJ0SWQpO1xuXHRcdFx0XHRcdHN3aXRjaCAocmV2aXZlZFByb2dyZXNzLmtpbmQpIHtcblx0XHRcdFx0XHRcdGNhc2UgJ3Byb2dyZXNzVGFza1Jlc3VsdCc6XG5cdFx0XHRcdFx0XHRcdGlmICh0YXNrICYmIHJldml2ZWRQcm9ncmVzcy5jb250ZW50KSB7XG5cdFx0XHRcdFx0XHRcdFx0dGFzay5jb21wbGV0ZShyZXZpdmVkUHJvZ3Jlc3MuY29udGVudC52YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fYWN0aXZlVGFza3MuZGVsZXRlKHJlc3BvbnNlUGFydElkKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHR0YXNrPy5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSAnd2FybmluZyc6XG5cdFx0XHRcdFx0XHRjYXNlICdyZWZlcmVuY2UnOlxuXHRcdFx0XHRcdFx0XHR0YXNrPy5hZGQocmV2aXZlZFByb2dyZXNzKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmV2aXZlZFByb2dyZXNzLmtpbmQgPT09ICdpbmxpbmVSZWZlcmVuY2UnICYmIHJldml2ZWRQcm9ncmVzcy5yZXNvbHZlSWQgJiYgcmVzcG9uc2UpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl91bnJlc29sdmVkQW5jaG9ycy5oYXMocmVxdWVzdElkKSkge1xuXHRcdFx0XHRcdHRoaXMuX3VucmVzb2x2ZWRBbmNob3JzLnNldChyZXF1ZXN0SWQsIG5ldyBNYXAoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdW5yZXNvbHZlZEFuY2hvcnMuZ2V0KHJlcXVlc3RJZCk/LnNldChyZXZpdmVkUHJvZ3Jlc3MucmVzb2x2ZUlkLCB7IHJlc3BvbnNlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjaGF0UHJvZ3Jlc3NQYXJ0cy5wdXNoKHJldml2ZWRQcm9ncmVzcyk7XG5cdFx0fVxuXG5cdFx0cHJvZ3Jlc3MoY2hhdFByb2dyZXNzUGFydHMpO1xuXHR9XG5cblx0JGhhbmRsZUFuY2hvclJlc29sdmUocmVxdWVzdElkOiBzdHJpbmcsIGhhbmRsZTogc3RyaW5nLCByZXNvbHZlQW5jaG9yOiBEdG88SUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHVucmVzb2x2ZWRBbmNob3JzRm9yUmVxdWVzdCA9IHRoaXMuX3VucmVzb2x2ZWRBbmNob3JzLmdldChyZXF1ZXN0SWQpO1xuXHRcdGlmICghdW5yZXNvbHZlZEFuY2hvcnNGb3JSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdW5yZXNvbHZlZEFuY2hvciA9IHVucmVzb2x2ZWRBbmNob3JzRm9yUmVxdWVzdC5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIXVucmVzb2x2ZWRBbmNob3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR1bnJlc29sdmVkQW5jaG9yc0ZvclJlcXVlc3QuZGVsZXRlKGhhbmRsZSk7XG5cdFx0aWYgKHVucmVzb2x2ZWRBbmNob3JzRm9yUmVxdWVzdC5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLl91bnJlc29sdmVkQW5jaG9ycy5kZWxldGUocmVxdWVzdElkKTtcblx0XHR9XG5cblx0XHRpZiAocmVzb2x2ZUFuY2hvcikge1xuXHRcdFx0Y29uc3QgcmV2aXZlZEFuY2hvciA9IHJldml2ZShyZXNvbHZlQW5jaG9yKSBhcyBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2U7XG5cdFx0XHR1bnJlc29sdmVkQW5jaG9yLnJlc3BvbnNlLnJlc29sdmVJbmxpbmVSZWZlcmVuY2UoaGFuZGxlLCByZXZpdmVkQW5jaG9yKTtcblx0XHR9XG5cdH1cblxuXHQkcmVnaXN0ZXJBZ2VudENvbXBsZXRpb25zUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIGlkOiBzdHJpbmcsIHRyaWdnZXJDaGFyYWN0ZXJzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGUgPSBhc3luYyAocXVlcnk6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRpbnZva2VDb21wbGV0aW9uUHJvdmlkZXIoaGFuZGxlLCBxdWVyeSwgdG9rZW4pO1xuXHRcdFx0cmV0dXJuIGNvbXBsZXRpb25zLm1hcCgoYykgPT4gKHsgLi4uYywgaWNvbjogYy5pY29uID8gVGhlbWVJY29uLmZyb21JZChjLmljb24pIDogdW5kZWZpbmVkIH0pKTtcblx0XHR9O1xuXHRcdHRoaXMuX2FnZW50SWRzVG9Db21wbGV0aW9uUHJvdmlkZXJzLnNldChpZCwgdGhpcy5fY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50Q29tcGxldGlvblByb3ZpZGVyKGlkLCBwcm92aWRlKSk7XG5cblx0XHR0aGlzLl9hZ2VudENvbXBsZXRpb25Qcm92aWRlcnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUNoYXRJbnB1dCwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICdjaGF0QWdlbnRDb21wbGV0aW9uczonICsgaGFuZGxlLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnMsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgX2NvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShtb2RlbC51cmkpO1xuXHRcdFx0XHRpZiAoIXdpZGdldCB8fCAhd2lkZ2V0LnZpZXdNb2RlbCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRyaWdnZXJDaGFyc1BhcnQgPSB0cmlnZ2VyQ2hhcmFjdGVycy5tYXAoYyA9PiBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKGMpKS5qb2luKCcnKTtcblx0XHRcdFx0Y29uc3Qgd29yZFJlZ2V4ID0gbmV3IFJlZ0V4cChgWyR7dHJpZ2dlckNoYXJzUGFydH1dXFxcXFMqYCwgJ2cnKTtcblx0XHRcdFx0Y29uc3QgcXVlcnkgPSBnZXRXb3JkQXRUZXh0KHBvc2l0aW9uLmNvbHVtbiwgd29yZFJlZ2V4LCBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKSwgMCk/LndvcmQgPz8gJyc7XG5cblx0XHRcdFx0aWYgKHF1ZXJ5ICYmICF0cmlnZ2VyQ2hhcmFjdGVycy5zb21lKGMgPT4gcXVlcnkuc3RhcnRzV2l0aChjKSkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb250ZXh0ID0ge1xuXHRcdFx0XHRcdHNlc3Npb25UeXBlOiBnZXRDaGF0U2Vzc2lvblR5cGUod2lkZ2V0LnZpZXdNb2RlbC5tb2RlbC5zZXNzaW9uUmVzb3VyY2UpLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdFBhcnNlckNvbnRleHQ7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZFJlcXVlc3QgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcikucGFyc2VDaGF0UmVxdWVzdFdpdGhSZWZlcmVuY2VzKGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQod2lkZ2V0KSwgZ2V0U2VsZWN0ZWRUb29sQW5kVG9vbFNldHNGb3JXaWRnZXQod2lkZ2V0KSwgbW9kZWwuZ2V0VmFsdWUoKSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY29udGV4dCkucGFydHM7XG5cdFx0XHRcdGNvbnN0IGFnZW50UGFydCA9IHBhcnNlZFJlcXVlc3QuZmluZCgocGFydCk6IHBhcnQgaXMgQ2hhdFJlcXVlc3RBZ2VudFBhcnQgPT4gcGFydCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRQYXJ0KTtcblx0XHRcdFx0Y29uc3QgdGhpc0FnZW50SWQgPSB0aGlzLl9hZ2VudHMuZ2V0KGhhbmRsZSk/LmlkO1xuXHRcdFx0XHRpZiAoYWdlbnRQYXJ0Py5hZ2VudC5pZCAhPT0gdGhpc0FnZW50SWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByYW5nZSA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBwb3NpdGlvbiwgd29yZFJlZ2V4KTtcblx0XHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZShxdWVyeSwgdG9rZW4pO1xuXHRcdFx0XHRjb25zdCB2YXJpYWJsZUl0ZW1zID0gcmVzdWx0Lm1hcCh2ID0+IHtcblx0XHRcdFx0XHRjb25zdCBpbnNlcnRUZXh0ID0gdi5pbnNlcnRUZXh0ID8/ICh0eXBlb2Ygdi5sYWJlbCA9PT0gJ3N0cmluZycgPyB2LmxhYmVsIDogdi5sYWJlbC5sYWJlbCk7XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2VBZnRlckluc2VydCA9IG5ldyBSYW5nZShyYW5nZS5pbnNlcnQuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5pbnNlcnQuc3RhcnRDb2x1bW4sIHJhbmdlLmluc2VydC5lbmRMaW5lTnVtYmVyLCByYW5nZS5pbnNlcnQuc3RhcnRDb2x1bW4gKyBpbnNlcnRUZXh0Lmxlbmd0aCk7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGxhYmVsOiB2LmxhYmVsLFxuXHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiBpbnNlcnRUZXh0ICsgJyAnLFxuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHRkZXRhaWw6IHYuZGV0YWlsLFxuXHRcdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogdi5kb2N1bWVudGF0aW9uLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogeyBpZDogQWRkRHluYW1pY1ZhcmlhYmxlQWN0aW9uLklELCB0aXRsZTogJycsIGFyZ3VtZW50czogW3sgaWQ6IHYuaWQsIHdpZGdldCwgcmFuZ2U6IHJhbmdlQWZ0ZXJJbnNlcnQsIHZhcmlhYmxlRGF0YTogcmV2aXZlKHYudmFsdWUpLCBjb21tYW5kOiB2LmNvbW1hbmQgfSBzYXRpc2ZpZXMgSUFkZER5bmFtaWNWYXJpYWJsZUNvbnRleHRdIH1cblx0XHRcdFx0XHR9IHNhdGlzZmllcyBDb21wbGV0aW9uSXRlbTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogdmFyaWFibGVJdGVtc1xuXHRcdFx0XHR9IHNhdGlzZmllcyBDb21wbGV0aW9uTGlzdDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQkdW5yZWdpc3RlckFnZW50Q29tcGxldGlvbnNQcm92aWRlcihoYW5kbGU6IG51bWJlciwgaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2FnZW50Q29tcGxldGlvblByb3ZpZGVycy5kZWxldGVBbmREaXNwb3NlKGhhbmRsZSk7XG5cdFx0dGhpcy5fYWdlbnRJZHNUb0NvbXBsZXRpb25Qcm92aWRlcnMuZGVsZXRlQW5kRGlzcG9zZShpZCk7XG5cdH1cblxuXHQkcmVnaXN0ZXJDaGF0UGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcihoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2NoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVycy5zZXQoaGFuZGxlLCB0aGlzLl9jaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXIoaGFuZGxlLFxuXHRcdFx0e1xuXHRcdFx0XHRwcm92aWRlUGFydGljaXBhbnREZXRlY3Rpb246IGFzeW5jIChyZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCwgaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeVtdLCBvcHRpb25zOiB7IGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbjsgcGFydGljaXBhbnRzOiBJQ2hhdFBhcnRpY2lwYW50TWV0YWRhdGFbXSB9LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fcHJveHkuJGRldGVjdENoYXRQYXJ0aWNpcGFudChoYW5kbGUsIHJlcXVlc3QsIHsgaGlzdG9yeSB9LCBvcHRpb25zLCB0b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpKTtcblx0fVxuXG5cdCR1bnJlZ2lzdGVyQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0UGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcnMuZGVsZXRlQW5kRGlzcG9zZShoYW5kbGUpO1xuXHR9XG5cblx0YXN5bmMgJHJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCB0eXBlOiBzdHJpbmcsIGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb24oZXh0ZW5zaW9uSWQudmFsdWUpO1xuXHRcdGlmICghZXh0ZW5zaW9uKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbTWFpblRocmVhZENoYXRBZ2VudHMyXSBDb3VsZCBub3QgZmluZCBleHRlbnNpb24gZm9yIHByb21wdCBmaWxlIHByb3ZpZGVyOiAke2V4dGVuc2lvbklkLnZhbHVlfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghaXNWYWxpZFByb21wdFR5cGUodHlwZSkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtNYWluVGhyZWFkQ2hhdEFnZW50czJdIEludmFsaWQgY29udHJpYnV0aW9uIHR5cGU6ICR7dHlwZX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHR0aGlzLl9wcm9tcHRGaWxlUHJvdmlkZXJFbWl0dGVycy5zZXQoaGFuZGxlLCBlbWl0dGVyKTtcblxuXHRcdC8vIFRyYWNrIGNvbnRlbnQgcmVnaXN0cmF0aW9ucyBmb3IgdGhpcyBwcm92aWRlciBzbyB0aGV5IGNhbiBiZSBkaXNwb3NlZCB3aGVuIHByb3ZpZGVyIGlzIHVucmVnaXN0ZXJlZFxuXHRcdGNvbnN0IGNvbnRlbnRSZWdpc3RyYXRpb25zID0gbmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKTtcblx0XHR0aGlzLl9wcm9tcHRGaWxlQ29udGVudFJlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgY29udGVudFJlZ2lzdHJhdGlvbnMpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX3Byb21wdHNTZXJ2aWNlLnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGV4dGVuc2lvbiwgdHlwZSwge1xuXHRcdFx0b25EaWRDaGFuZ2VQcm9tcHRGaWxlczogZW1pdHRlci5ldmVudCxcblx0XHRcdHByb3ZpZGVQcm9tcHRGaWxlczogYXN5bmMgKGNvbnRleHQ6IElQcm9tcHRGaWxlQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyaWJ1dGlvbnMgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZVByb21wdEZpbGVzKGhhbmRsZSwgdHlwZSwgY29udGV4dCwgdG9rZW4pO1xuXHRcdFx0XHRpZiAoIWNvbnRyaWJ1dGlvbnMpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIENvbnZlcnQgVXJpQ29tcG9uZW50cyB0byBVUkkgYW5kIHJlZ2lzdGVyIGFueSBpbmxpbmUgY29udGVudFxuXHRcdFx0XHRyZXR1cm4gY29udHJpYnV0aW9ucy5tYXAoYyA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdG5hbWU6IGMubmFtZSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBjLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiBjLnNlc3Npb25UeXBlcyxcblx0XHRcdFx0XHRcdHdoZW46IGMud2hlbixcblx0XHRcdFx0XHRcdHVyaTogVVJJLnJldml2ZShjLnVyaSksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9wcm9tcHRGaWxlUHJvdmlkZXJzLnNldChoYW5kbGUsIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0JHVucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm9tcHRGaWxlUHJvdmlkZXJzLmRlbGV0ZUFuZERpc3Bvc2UoaGFuZGxlKTtcblx0XHR0aGlzLl9wcm9tcHRGaWxlUHJvdmlkZXJFbWl0dGVycy5kZWxldGVBbmREaXNwb3NlKGhhbmRsZSk7XG5cdFx0dGhpcy5fcHJvbXB0RmlsZUNvbnRlbnRSZWdpc3RyYXRpb25zLmRlbGV0ZUFuZERpc3Bvc2UoaGFuZGxlKTtcblx0fVxuXG5cdCRvbkRpZENoYW5nZVByb21wdEZpbGVzKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IHRoaXMuX3Byb21wdEZpbGVQcm92aWRlckVtaXR0ZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmIChlbWl0dGVyKSB7XG5cdFx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkcmVnaXN0ZXJDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Qcm92aWRlcihoYW5kbGU6IG51bWJlciwgY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcsIG1ldGFkYXRhOiBJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXJNZXRhZGF0YUR0bywgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBJbiB0aGUgc2Vzc2lvbnMgd2luZG93LCBvbmx5IGFjY2VwdCBoYXJuZXNzZXMgZm9yIHNlc3Npb24gdHlwZXMgdGhhdFxuXHRcdC8vIGhhdmUgYSByZWdpc3RlcmVkIGNvbnRlbnQgcHJvdmlkZXIgKGkuZS4sIGNhbiBhY3R1YWxseSBydW4gc2Vzc2lvbnMpLlxuXHRcdC8vIEFIUCByZW1vdGUgc2VydmVycyByZWdpc3RlciBkaXJlY3RseSB2aWEgcmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3MuXG5cdFx0aWYgKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93ICYmICF0aGlzLl9jaGF0U2Vzc2lvblNlcnZpY2UuZ2V0Q29udGVudFByb3ZpZGVyU2NoZW1lcygpLmluY2x1ZGVzKGNoYXRTZXNzaW9uVHlwZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb24gPSBhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbihleHRlbnNpb25JZC52YWx1ZSk7XG5cdFx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtNYWluVGhyZWFkQ2hhdEFnZW50czJdIENvdWxkIG5vdCBmaW5kIGV4dGVuc2lvbiBmb3IgY3VzdG9taXphdGlvbiBwcm92aWRlcjogJHtleHRlbnNpb25JZC52YWx1ZX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHR0aGlzLl9jdXN0b21pemF0aW9uUHJvdmlkZXJFbWl0dGVycy5zZXQoaGFuZGxlLCBlbWl0dGVyKTtcblxuXHRcdC8vIEJ1aWxkIHRoZSBpdGVtIHByb3ZpZGVyIHRoYXQgY2FsbHMgYmFjayB0byB0aGUgRXh0SG9zdFxuXHRcdGNvbnN0IGl0ZW1Qcm92aWRlcjogSUN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIgPSB7XG5cdFx0XHRvbkRpZENoYW5nZTogZW1pdHRlci5ldmVudCxcblx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoc2Vzc2lvblJlc291cmNlLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyhoYW5kbGUsIHNlc3Npb25SZXNvdXJjZSwgdG9rZW4pO1xuXHRcdFx0XHRpZiAoIWl0ZW1zKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gaXRlbXMubWFwKChpdGVtOiBJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uSXRlbUR0byk6IElDdXN0b21pemF0aW9uSXRlbSA9PiAoe1xuXHRcdFx0XHRcdHVyaTogVVJJLnJldml2ZShpdGVtLnVyaSksXG5cdFx0XHRcdFx0dHlwZTogaXRlbS50eXBlLFxuXHRcdFx0XHRcdG5hbWU6IGl0ZW0ubmFtZSxcblx0XHRcdFx0XHRzb3VyY2U6IGl0ZW0uc291cmNlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGdyb3VwS2V5OiBpdGVtLmdyb3VwS2V5LFxuXHRcdFx0XHRcdGJhZGdlOiBpdGVtLmJhZGdlLFxuXHRcdFx0XHRcdGJhZGdlVG9vbHRpcDogaXRlbS5iYWRnZVRvb2x0aXAsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGl0ZW0uZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdFx0cGx1Z2luVXJpOiBpdGVtLnBsdWdpblVyaSA/IFVSSS5yZXZpdmUoaXRlbS5wbHVnaW5VcmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBsdWdpbkxhYmVsOiBpdGVtLnBsdWdpbkxhYmVsLFxuXHRcdFx0XHRcdHVzZXJJbnZvY2FibGU6IGl0ZW0udXNlckludm9jYWJsZSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSxcblx0XHRcdHByb3ZpZGVTb3VyY2VGb2xkZXJzOiBhc3luYyAoc2Vzc2lvblJlc291cmNlLCB0eXBlLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCBmb2xkZXJzID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVTb3VyY2VGb2xkZXJzKGhhbmRsZSwgc2Vzc2lvblJlc291cmNlLCB0eXBlLCB0b2tlbik7XG5cdFx0XHRcdGlmICghZm9sZGVycykge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZvbGRlcnMubWFwKGZvbGRlciA9PiAoe1xuXHRcdFx0XHRcdHVyaTogVVJJLnJldml2ZShmb2xkZXIudXJpKSxcblx0XHRcdFx0XHRsYWJlbDogZm9sZGVyLmxhYmVsLFxuXHRcdFx0XHRcdHNvdXJjZTogZm9sZGVyLnNvdXJjZSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Ly8gQ29udmVydCBzdXBwb3J0ZWRUeXBlcyB3aGl0ZWxpc3QgdG8gaGlkZGVuU2VjdGlvbnMgYmxhY2tsaXN0LlxuXHRcdC8vIFNlY3Rpb25zIG5vdCBpbiB0aGUgc3VwcG9ydGVkIGxpc3QgYXJlIGhpZGRlbi4gV2hlbiBzdXBwb3J0ZWRUeXBlc1xuXHRcdC8vIGlzIG9taXR0ZWQsIGFsbCBzZWN0aW9ucyBhcmUgc2hvd24uXG5cdFx0Y29uc3QgdHlwZVRvU2VjdGlvbjogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0XHRcdCdhZ2VudCc6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0XHRcdCdza2lsbCc6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyxcblx0XHRcdCdpbnN0cnVjdGlvbnMnOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMsXG5cdFx0XHQncHJvbXB0JzogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUHJvbXB0cyxcblx0XHRcdCdob29rJzogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSG9va3MsXG5cdFx0XHQncGx1Z2lucyc6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMsXG5cdFx0fTtcblx0XHRsZXQgaGlkZGVuU2VjdGlvbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChtZXRhZGF0YS5zdXBwb3J0ZWRUeXBlcykge1xuXHRcdFx0Y29uc3Qgc3VwcG9ydGVkU2VjdGlvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGZvciAoY29uc3QgdCBvZiBtZXRhZGF0YS5zdXBwb3J0ZWRUeXBlcykge1xuXHRcdFx0XHRjb25zdCBzZWN0aW9uID0gdHlwZVRvU2VjdGlvblt0XTtcblx0XHRcdFx0aWYgKHNlY3Rpb24pIHtcblx0XHRcdFx0XHRzdXBwb3J0ZWRTZWN0aW9ucy5hZGQoc2VjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGhpZGRlblNlY3Rpb25zID0gT2JqZWN0LnZhbHVlcyh0eXBlVG9TZWN0aW9uKS5maWx0ZXIoc2VjdGlvbiA9PiAhc3VwcG9ydGVkU2VjdGlvbnMuaGFzKHNlY3Rpb24pKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZXNjcmlwdG9yOiBJSGFybmVzc0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRpZDogY2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0bGFiZWw6IG1ldGFkYXRhLmxhYmVsLFxuXHRcdFx0aWNvbjogbWV0YWRhdGEuaWNvbklkID8gVGhlbWVJY29uLmZyb21JZChtZXRhZGF0YS5pY29uSWQpIDogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmV4dGVuc2lvbnMuaWQpLFxuXHRcdFx0aGlkZGVuU2VjdGlvbnMsXG5cdFx0XHRpdGVtUHJvdmlkZXIsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHRoaXMuX2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5yZWdpc3RlckV4dGVybmFsSGFybmVzcyhkZXNjcmlwdG9yKTtcblx0XHR0aGlzLl9jdXN0b21pemF0aW9uUHJvdmlkZXJzLnNldChoYW5kbGUsIHJlZ2lzdHJhdGlvbik7XG5cdH1cblxuXHQkdW5yZWdpc3RlckNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblByb3ZpZGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VzdG9taXphdGlvblByb3ZpZGVycy5kZWxldGVBbmREaXNwb3NlKGhhbmRsZSk7XG5cdFx0dGhpcy5fY3VzdG9taXphdGlvblByb3ZpZGVyRW1pdHRlcnMuZGVsZXRlQW5kRGlzcG9zZShoYW5kbGUpO1xuXHR9XG5cblx0JG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBlbWl0dGVyID0gdGhpcy5fY3VzdG9taXphdGlvblByb3ZpZGVyRW1pdHRlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKGVtaXR0ZXIpIHtcblx0XHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdH1cblx0fVxufVxuXG5cbmZ1bmN0aW9uIGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHJlZzogUmVnRXhwKTogeyBpbnNlcnQ6IFJhbmdlOyByZXBsYWNlOiBSYW5nZSB9IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdmFyV29yZCA9IGdldFdvcmRBdFRleHQocG9zaXRpb24uY29sdW1uLCByZWcsIG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpLCAwKTtcblx0aWYgKCF2YXJXb3JkICYmIG1vZGVsLmdldFdvcmRVbnRpbFBvc2l0aW9uKHBvc2l0aW9uKS53b3JkKSB7XG5cdFx0Ly8gaW5zaWRlIGEgXCJub3JtYWxcIiB3b3JkXG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0bGV0IGluc2VydDogUmFuZ2U7XG5cdGxldCByZXBsYWNlOiBSYW5nZTtcblx0aWYgKCF2YXJXb3JkKSB7XG5cdFx0aW5zZXJ0ID0gcmVwbGFjZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zaXRpb24pO1xuXHR9IGVsc2Uge1xuXHRcdGluc2VydCA9IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCB2YXJXb3JkLnN0YXJ0Q29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdHJlcGxhY2UgPSBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgdmFyV29yZC5zdGFydENvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgdmFyV29yZC5lbmRDb2x1bW4pO1xuXHR9XG5cblx0cmV0dXJuIHsgaW5zZXJ0LCByZXBsYWNlIH07XG59XG5cbm5hbWVzcGFjZSBDaGF0Tm90ZWJvb2tFZGl0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21DaGF0RWRpdChwYXJ0OiBJQ2hhdE5vdGVib29rRWRpdER0byk6IElDaGF0Tm90ZWJvb2tFZGl0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ25vdGVib29rRWRpdCcsXG5cdFx0XHR1cmk6IFVSSS5yZXZpdmUocGFydC51cmkpLFxuXHRcdFx0ZG9uZTogcGFydC5kb25lLFxuXHRcdFx0ZWRpdHM6IHBhcnQuZWRpdHMubWFwKE5vdGVib29rRHRvLmZyb21DZWxsRWRpdE9wZXJhdGlvbkR0bylcblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBc0I7QUFFL0IsU0FBUyxZQUFZLHFCQUFrQztBQUN2RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsZUFBZTtBQUV4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBNEMsMEJBQTBDO0FBRXRGLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLHVCQUF1QiwrQkFBK0I7QUFDL0QsU0FBUyxnQ0FBNEQ7QUFDckUsU0FBOEUseUJBQXlCO0FBQ3ZHLFNBQWdILGlCQUFpQixzQkFBc0I7QUFDdkosU0FBUyxtQkFBbUIsbUJBQW1CO0FBRS9DLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQTZDO0FBQ3RELFNBQVMsOEJBQThCLDJDQUEyQztBQUNsRixTQUE4RyxvQkFBeUU7QUFDdkwsU0FBUyx1QkFBdUIsNEJBQTRCO0FBQzVELFNBQVMsbUJBQW1CLG9CQUFvQjtBQUNoRCxTQUFTLGtDQUFrQztBQUMzQyxTQUEwQiw0QkFBNEI7QUFDdEQsU0FBUyx5QkFBeUI7QUFFbEMsU0FBa0MsZ0JB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QUFNLFNBQVMsU0FBUyxVQUFVLE9BQU8sU0FBUyxNQUFNLElBQUksVUFBVSxPQUFPLFFBQVEsV0FBVyxFQUFFO0FBQUEsTUFDbEc7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBLFVBQU0sZUFBZSxLQUFLLDZCQUE2Qix3QkFBd0IsVUFBVTtBQUN6RixTQUFLLHdCQUF3QixJQUFJLFFBQVEsWUFBWTtBQUFBLEVBQ3REO0FBQUEsRUFFQSw0Q0FBNEMsUUFBc0I7QUFDakUsU0FBSyx3QkFBd0IsaUJBQWlCLE1BQU07QUFDcEQsU0FBSywrQkFBK0IsaUJBQWlCLE1BQU07QUFBQSxFQUM1RDtBQUFBLEVBRUEsMkJBQTJCLFFBQXNCO0FBQ2hELFVBQU0sVUFBVSxLQUFLLCtCQUErQixJQUFJLE1BQU07QUFDOUQsUUFBSSxTQUFTO0FBQ1osY0FBUSxLQUFLO0FBQUEsSUFDZDtBQUFBLEVBQ0Q7QUFDRDtBQXp2QmEsd0JBQU47QUFBQSxFQUROLHFCQUFxQixZQUFZLHFCQUFxQjtBQUFBLEVBeUJwRDtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F0Q1U7QUE0dkJiLFNBQVMsd0JBQXdCLE9BQW1CLFVBQW9CLEtBQTREO0FBQ25JLFFBQU0sVUFBVSxjQUFjLFNBQVMsUUFBUSxLQUFLLE1BQU0sZUFBZSxTQUFTLFVBQVUsR0FBRyxDQUFDO0FBQ2hHLE1BQUksQ0FBQyxXQUFXLE1BQU0scUJBQXFCLFFBQVEsRUFBRSxNQUFNO0FBRTFEO0FBQUEsRUFDRDtBQUVBLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSSxDQUFDLFNBQVM7QUFDYixhQUFTLFVBQVUsTUFBTSxjQUFjLFFBQVE7QUFBQSxFQUNoRCxPQUFPO0FBQ04sYUFBUyxJQUFJLE1BQU0sU0FBUyxZQUFZLFFBQVEsYUFBYSxTQUFTLFlBQVksU0FBUyxNQUFNO0FBQ2pHLGNBQVUsSUFBSSxNQUFNLFNBQVMsWUFBWSxRQUFRLGFBQWEsU0FBUyxZQUFZLFFBQVEsU0FBUztBQUFBLEVBQ3JHO0FBRUEsU0FBTyxFQUFFLFFBQVEsUUFBUTtBQUMxQjtBQUVBLElBQVU7QUFBQSxDQUFWLENBQVVDLHNCQUFWO0FBQ1EsV0FBUyxhQUFhLE1BQStDO0FBQzNFLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLEtBQUssSUFBSSxPQUFPLEtBQUssR0FBRztBQUFBLE1BQ3hCLE1BQU0sS0FBSztBQUFBLE1BQ1gsT0FBTyxLQUFLLE1BQU0sSUFBSSxZQUFZLHdCQUF3QjtBQUFBLElBQzNEO0FBQUEsRUFDRDtBQVBPLEVBQUFBLGtCQUFTO0FBQUEsR0FEUDsiLAogICJuYW1lcyI6IFsicHJvZ3Jlc3MiLCAiQ2hhdE5vdGVib29rRWRpdCJdCn0K
