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
import { renderAsPlaintext } from "../../../../../base/browser/markdownRenderer.js";
import { assertNever } from "../../../../../base/common/assert.js";
import { RunOnceScheduler, timeout } from "../../../../../base/common/async.js";
import { encodeBase64 } from "../../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { arrayEqualsC } from "../../../../../base/common/equals.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { CancellationError, isCancellationError } from "../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { createMarkdownCommandLink, MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { combinedDisposable, Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { getMediaMime } from "../../../../../base/common/mime.js";
import { derived, derivedOpts, observableFromEventOpts, ObservableSet, observableSignal, transaction } from "../../../../../base/common/observable.js";
import Severity from "../../../../../base/common/severity.js";
import { StopWatch } from "../../../../../base/common/stopwatch.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import * as JSONContributionRegistry from "../../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { observableConfigValue } from "../../../../../platform/observable/common/platformObservableUtils.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { toToolSetVariableEntry, toToolVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { IChatService, IChatToolInvocation, ToolConfirmKind } from "../../common/chatService/chatService.js";
import { ChatConfiguration, isAutoApproveLevel, isAutopilotLevel } from "../../common/constants.js";
import { localChatSessionType } from "../../common/chatSessionsService.js";
import { ChatToolInvocation } from "../../common/model/chatProgressTypes/chatToolInvocation.js";
import { chatSessionResourceToId, getChatSessionType } from "../../common/model/chatUri.js";
import { HookType } from "../../common/promptSyntax/hookTypes.js";
import { CopilotChatSettingId, CopilotToolId } from "../../common/tools/copilotToolIds.js";
import { ILanguageModelToolsConfirmationService } from "../../common/tools/languageModelToolsConfirmationService.js";
import { TerminalToolId } from "../../common/tools/terminalToolIds.js";
import { createToolSchemaUri, isToolSet, SpecedToolAliases, stringifyPromptTsxPart, ToolAndToolSetEnablementMap, ToolDataSource, ToolInvocationPresentation, toolMatchesModel, ToolSet, ToolSetForModel, VSCodeToolReference } from "../../common/tools/languageModelToolsService.js";
import { IToolResultCompressor } from "../../common/tools/toolResultCompressor.js";
import { getToolConfirmationAlert } from "../accessibility/chatAccessibilityProvider.js";
import { IChatWidgetService } from "../chat.js";
import { IChatToolRiskAssessmentService, ToolRiskLevel } from "./chatToolRiskAssessmentService.js";
const jsonSchemaRegistry = Registry.as(JSONContributionRegistry.Extensions.JSONContribution);
var AutoApproveStorageKeys = /* @__PURE__ */ ((AutoApproveStorageKeys2) => {
  AutoApproveStorageKeys2["GlobalAutoApproveOptIn"] = "chat.tools.global.autoApprove.optIn";
  return AutoApproveStorageKeys2;
})(AutoApproveStorageKeys || {});
const SkipAutoApproveConfirmationKey = "vscode.chat.tools.global.autoApprove.testMode";
const autoApproveAllReason = "auto-approve-all";
const toolIdsThatCannotBeAutoApproved = /* @__PURE__ */ new Set([
  "vscode_get_confirmation_with_options",
  "vscode_get_modified_files_confirmation"
]);
const fetchWebPageToolIds = /* @__PURE__ */ new Set([
  "copilot_fetchWebPage",
  "vscode_fetchWebPage_internal"
]);
const globalAutoApproveDescription = localize2(
  {
    key: "autoApprove3.markdown",
    comment: [
      "{Locked='](https://github.com/features/codespaces)'}",
      "{Locked='](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)'}",
      "{Locked='](https://code.visualstudio.com/docs/copilot/security)'}",
      "{Locked='**'}",
      "{Locked='[`chat.autoReply`](command:workbench.action.openSettings?%5B%22chat.autoReply%22%5D)'}"
    ]
  },
  'Global auto approve also known as "YOLO mode" disables manual approval completely for _all tools in all workspaces_, allowing the agent to act fully autonomously. This is extremely dangerous and is *never* recommended, even containerized environments like [Codespaces](https://github.com/features/codespaces) and [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) have user keys forwarded into the container that could be compromised.\n\n**This feature disables [critical security protections](https://code.visualstudio.com/docs/copilot/security) and makes it much easier for an attacker to compromise the machine.**\n\nNote: This setting only controls tool approval and does not prevent the agent from asking questions. To automatically answer agent questions, use the [`chat.autoReply`](command:workbench.action.openSettings?%5B%22chat.autoReply%22%5D) setting.'
);
let LanguageModelToolsService = class extends Disposable {
  constructor(_instantiationService, _extensionService, _contextKeyService, _chatService, _dialogService, _telemetryService, _logService, _configurationService, _accessibilityService, _accessibilitySignalService, _storageService, _confirmationService, _commandService, _chatWidgetService, _toolResultCompressor, _riskAssessmentService) {
    super();
    this._instantiationService = _instantiationService;
    this._extensionService = _extensionService;
    this._contextKeyService = _contextKeyService;
    this._chatService = _chatService;
    this._dialogService = _dialogService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._configurationService = _configurationService;
    this._accessibilityService = _accessibilityService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._storageService = _storageService;
    this._confirmationService = _confirmationService;
    this._commandService = _commandService;
    this._chatWidgetService = _chatWidgetService;
    this._toolResultCompressor = _toolResultCompressor;
    this._riskAssessmentService = _riskAssessmentService;
    this._onDidChangeTools = this._register(new Emitter());
    this.onDidChangeTools = this._onDidChangeTools.event;
    this._onDidPrepareToolCallBecomeUnresponsive = this._register(new Emitter());
    this.onDidPrepareToolCallBecomeUnresponsive = this._onDidPrepareToolCallBecomeUnresponsive.event;
    this._onDidInvokeTool = this._register(new Emitter());
    this.onDidInvokeTool = this._onDidInvokeTool.event;
    /** Throttle tools updates because it sends all tools and runs on context key updates */
    this._onDidChangeToolsScheduler = this._register(new RunOnceScheduler(() => this._onDidChangeTools.fire(), 750));
    this._tools = /* @__PURE__ */ new Map();
    this._toolContextKeys = /* @__PURE__ */ new Set();
    this._callsByRequestId = /* @__PURE__ */ new Map();
    /** Pending tool calls in the streaming phase, keyed by toolCallId */
    this._pendingToolCalls = /* @__PURE__ */ new Map();
    this._toolSets = new ObservableSet();
    this.toolSets = derived(this, (reader) => {
      const allToolSets = Array.from(this._toolSets.observable.read(reader));
      return allToolSets.filter((toolSet) => this.isPermitted(toolSet, reader));
    });
    this.allToolsIncludingDisableObs = observableFromEventOpts(
      { equalsFn: arrayEqualsC() },
      this.onDidChangeTools,
      () => Array.from(this.getAllToolsIncludingDisabled())
    );
    this.toolsWithFullReferenceName = derived((reader) => {
      const result = [];
      const coveredByToolSets = /* @__PURE__ */ new Set();
      for (const toolSet of this.toolSets.read(reader)) {
        if (toolSet.source.type !== "user") {
          result.push([toolSet, getToolSetFullReferenceName(toolSet)]);
          for (const tool of toolSet.getTools()) {
            result.push([tool, getToolFullReferenceName(tool, toolSet)]);
            coveredByToolSets.add(tool);
          }
        }
      }
      for (const tool of this.allToolsIncludingDisableObs.read(reader)) {
        if (tool.when && !this._contextKeyService.contextMatchesRules(tool.when)) {
          continue;
        }
        if (tool.canBeReferencedInPrompt && !coveredByToolSets.has(tool) && this.isPermitted(tool, reader)) {
          result.push([tool, getToolFullReferenceName(tool)]);
        }
      }
      return result;
    });
    this._isAgentModeEnabled = observableConfigValue(ChatConfiguration.AgentEnabled, true, this._configurationService);
    this._register(this._contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(this._toolContextKeys)) {
        this._onDidChangeToolsScheduler.schedule();
      }
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.ExtensionToolsEnabled) || e.affectsConfiguration(ChatConfiguration.AgentEnabled) || e.affectsConfiguration(CopilotChatSettingId.Gpt55ReadFileToolEnabled)) {
        this._onDidChangeToolsScheduler.schedule();
      }
    }));
    this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, (e) => {
      if (!e || e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove)) {
        if (this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove) !== true) {
          this._storageService.remove("chat.tools.global.autoApprove.optIn" /* GlobalAutoApproveOptIn */, StorageScope.APPLICATION);
        }
      }
    }));
    this._ctxToolsCount = ChatContextKeys.Tools.toolsCount.bindTo(_contextKeyService);
    this.vscodeToolSet = this._register(this.createToolSet(
      ToolDataSource.Internal,
      "vscode",
      VSCodeToolReference.vscode,
      {
        icon: ThemeIcon.fromId(Codicon.vscode.id),
        description: localize("copilot.toolSet.vscode.description", "Use VS Code features"),
        deprecated: true
      }
    ));
    this.executeToolSet = this._register(this.createToolSet(
      ToolDataSource.Internal,
      "execute",
      SpecedToolAliases.execute,
      {
        icon: ThemeIcon.fromId(Codicon.terminal.id),
        description: localize("copilot.toolSet.execute.description", "Execute code and applications on your machine"),
        deprecated: true
      }
    ));
    this.readToolSet = this._register(this.createToolSet(
      ToolDataSource.Internal,
      "read",
      SpecedToolAliases.read,
      {
        icon: ThemeIcon.fromId(Codicon.book.id),
        description: localize("copilot.toolSet.read.description", "Read files in your workspace"),
        deprecated: true
      }
    ));
    this.agentToolSet = this._register(this.createToolSet(
      ToolDataSource.Internal,
      "agent",
      SpecedToolAliases.agent,
      {
        icon: ThemeIcon.fromId(Codicon.agent.id),
        description: localize("copilot.toolSet.agent.description", "Delegate tasks to other agents"),
        deprecated: true
      }
    ));
  }
  isToolEnabledForModel(toolData, model) {
    if (!toolMatchesModel(toolData, model)) {
      return false;
    }
    if (toolData.id === CopilotToolId.ReadFile && model?.family.startsWith("gpt-5.5") && this._configurationService.getValue(CopilotChatSettingId.Gpt55ReadFileToolEnabled) === false) {
      return false;
    }
    return true;
  }
  /**
   * Returns if the given tool or toolset is permitted in the current context.
   * When agent mode is enabled, all tools are permitted (no restriction)
   * When agent mode is disabled only a subset of read-only tools are permitted in agentic-loop contexts.
   */
  isPermitted(toolOrToolSet, reader) {
    const agentModeEnabled = this._isAgentModeEnabled.read(reader);
    if (agentModeEnabled !== false) {
      return true;
    }
    if (!isToolSet(toolOrToolSet) && toolOrToolSet.canBeReferencedInPrompt === false && toolOrToolSet.source.type === "internal") {
      return true;
    }
    const permittedInternalToolSetIds = [SpecedToolAliases.read, SpecedToolAliases.search, SpecedToolAliases.web];
    if (isToolSet(toolOrToolSet)) {
      const permitted = toolOrToolSet.source.type === "internal" && permittedInternalToolSetIds.includes(toolOrToolSet.referenceName);
      this._logService.trace(`LanguageModelToolsService#isPermitted: ToolSet ${toolOrToolSet.id} (${toolOrToolSet.referenceName}) permitted=${permitted}`);
      return permitted;
    }
    for (const toolSet of this._toolSets) {
      if (toolSet.source.type === "internal" && permittedInternalToolSetIds.includes(toolSet.referenceName)) {
        for (const memberTool of toolSet.getTools()) {
          if (memberTool.id === toolOrToolSet.id) {
            this._logService.trace(`LanguageModelToolsService#isPermitted: Tool ${toolOrToolSet.id} (${toolOrToolSet.toolReferenceName}) permitted=true (member of ${toolSet.referenceName})`);
            return true;
          }
        }
      }
    }
    if (toolOrToolSet.id === "vscode_fetchWebPage_internal" && permittedInternalToolSetIds.includes(SpecedToolAliases.web)) {
      this._logService.trace(`LanguageModelToolsService#isPermitted: Tool ${toolOrToolSet.id} (${toolOrToolSet.toolReferenceName}) permitted=true (special case)`);
      return true;
    }
    this._logService.trace(`LanguageModelToolsService#isPermitted: Tool ${toolOrToolSet.id} (${toolOrToolSet.toolReferenceName}) permitted=false`);
    return false;
  }
  dispose() {
    super.dispose();
    this._callsByRequestId.forEach((calls) => calls.forEach((call) => call.store.dispose()));
    this._pendingToolCalls.clear();
    this._ctxToolsCount.reset();
  }
  registerToolData(toolData) {
    if (this._tools.has(toolData.id)) {
      throw new Error(`Tool "${toolData.id}" is already registered.`);
    }
    this._tools.set(toolData.id, { data: toolData });
    this._ctxToolsCount.set(this._tools.size);
    if (!this._onDidChangeToolsScheduler.isScheduled()) {
      this._onDidChangeToolsScheduler.schedule();
    }
    toolData.when?.keys().forEach((key) => this._toolContextKeys.add(key));
    let store;
    if (toolData.inputSchema) {
      store = new DisposableStore();
      const schemaUrl = createToolSchemaUri(toolData.id).toString();
      jsonSchemaRegistry.registerSchema(schemaUrl, toolData.inputSchema, store);
      store.add(jsonSchemaRegistry.registerSchemaAssociation(schemaUrl, `/lm/tool/${toolData.id}/tool_input.json`));
    }
    return toDisposable(() => {
      store?.dispose();
      this._tools.delete(toolData.id);
      this._ctxToolsCount.set(this._tools.size);
      this._refreshAllToolContextKeys();
      if (!this._onDidChangeToolsScheduler.isScheduled()) {
        this._onDidChangeToolsScheduler.schedule();
      }
    });
  }
  flushToolUpdates() {
    this._onDidChangeToolsScheduler.flush();
  }
  _refreshAllToolContextKeys() {
    this._toolContextKeys.clear();
    for (const tool of this._tools.values()) {
      tool.data.when?.keys().forEach((key) => this._toolContextKeys.add(key));
    }
  }
  registerToolImplementation(id, tool) {
    const entry = this._tools.get(id);
    if (!entry) {
      throw new Error(`Tool "${id}" was not contributed.`);
    }
    if (entry.impl) {
      throw new Error(`Tool "${id}" already has an implementation.`);
    }
    entry.impl = tool;
    return toDisposable(() => {
      entry.impl = void 0;
    });
  }
  registerTool(toolData, tool) {
    return combinedDisposable(
      this.registerToolData(toolData),
      this.registerToolImplementation(toolData.id, tool)
    );
  }
  getTools(model) {
    const toolDatas = Iterable.map(this._tools.values(), (i) => i.data);
    const extensionToolsEnabled = this._configurationService.getValue(ChatConfiguration.ExtensionToolsEnabled);
    return Iterable.filter(
      toolDatas,
      (toolData) => {
        const satisfiesWhenClause = !toolData.when || this._contextKeyService.contextMatchesRules(toolData.when);
        const satisfiesExternalToolCheck = toolData.source.type !== "extension" || !!extensionToolsEnabled;
        const satisfiesPermittedCheck = this.isPermitted(toolData);
        const satisfiesModelFilter = this.isToolEnabledForModel(toolData, model);
        return satisfiesWhenClause && satisfiesExternalToolCheck && satisfiesPermittedCheck && satisfiesModelFilter;
      }
    );
  }
  observeTools(model) {
    const meta = derived((reader) => {
      const signal = observableSignal("observeToolsContext");
      const trigger = () => transaction((tx) => signal.trigger(tx));
      reader.store.add(this.onDidChangeTools(trigger));
      return signal;
    });
    return derivedOpts({ equalsFn: arrayEqualsC() }, (reader) => {
      meta.read(reader).read(reader);
      return Array.from(this.getTools(model));
    });
  }
  getAllToolsIncludingDisabled() {
    const toolDatas = Iterable.map(this._tools.values(), (i) => i.data);
    const extensionToolsEnabled = this._configurationService.getValue(ChatConfiguration.ExtensionToolsEnabled);
    return Iterable.filter(
      toolDatas,
      (toolData) => {
        const satisfiesExternalToolCheck = toolData.source.type !== "extension" || !!extensionToolsEnabled;
        const satisfiesPermittedCheck = this.isPermitted(toolData);
        return satisfiesExternalToolCheck && satisfiesPermittedCheck;
      }
    );
  }
  getTool(id) {
    return this._tools.get(id)?.data;
  }
  getToolByName(name) {
    for (const tool of this.getAllToolsIncludingDisabled()) {
      if (tool.toolReferenceName === name) {
        return tool;
      }
    }
    return void 0;
  }
  _handlePreToolUseDenial(dto, hookResult, toolData, pendingInvocation, request) {
    const hookReason = hookResult.permissionDecisionReason ?? localize("hookDeniedNoReason", "Hook denied tool execution");
    const reason = localize("deniedByPreToolUseHook", "Denied by {0} hook: {1}", HookType.PreToolUse, hookReason);
    this._logService.debug(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} denied by preToolUse hook: ${hookReason}`);
    if (toolData) {
      if (pendingInvocation) {
        pendingInvocation.presentation = ToolInvocationPresentation.Hidden;
        pendingInvocation.cancelFromStreaming(ToolConfirmKind.Denied, reason);
      } else if (request) {
        const cancelledInvocation = ChatToolInvocation.createCancelled(
          { toolCallId: dto.callId, toolId: dto.toolId, toolData, subagentInvocationId: dto.subAgentInvocationId, chatRequestId: dto.chatRequestId },
          dto.parameters,
          ToolConfirmKind.Denied,
          reason
        );
        cancelledInvocation.presentation = ToolInvocationPresentation.Hidden;
        this._chatService.appendProgress(request, cancelledInvocation);
      }
    }
    return {
      content: [{ kind: "text", value: `Tool execution denied: ${hookReason}` }],
      toolResultError: hookReason
    };
  }
  /**
   * Validate updatedInput from a preToolUse hook against the tool's input schema
   * using the json.validate command from the JSON extension.
   * @returns An error message string if validation fails, or undefined if valid.
   */
  async _validateUpdatedInput(toolId, toolData, updatedInput) {
    if (!toolData?.inputSchema) {
      return void 0;
    }
    try {
      const schemaUri = createToolSchemaUri(toolId);
      const inputJson = JSON.stringify(updatedInput);
      const diagnostics = await this._commandService.executeCommand("json.validate", schemaUri, inputJson) || [];
      if (diagnostics.length > 0) {
        return diagnostics.map((d) => d.message).join("; ");
      }
    } catch (e) {
      this._logService.debug(`[LanguageModelToolsService#_validateUpdatedInput] json.validate command failed, skipping validation: ${toErrorMessage(e)}`);
    }
    return void 0;
  }
  async invokeTool(dto, countTokens, token) {
    this._logService.trace(`[LanguageModelToolsService#invokeTool] Invoking tool ${dto.toolId} with parameters ${JSON.stringify(dto.parameters)}`);
    const toolData = this._tools.get(dto.toolId)?.data;
    let model;
    let request;
    if (dto.context?.sessionResource) {
      model = this._chatService.getSession(dto.context.sessionResource);
      request = model?.getRequests().at(-1);
      if (request?.response?.isCanceled || request?.response?.isComplete) {
        this._logService.debug(`[LanguageModelToolsService#invokeTool] Ignoring tool ${dto.toolId} for cancelled/complete request ${request.id}`);
        throw new CancellationError();
      }
      if (model?.workingDirectory && !dto.context.workingDirectory) {
        dto = { ...dto, context: { ...dto.context, workingDirectory: model.workingDirectory } };
      }
    }
    let pendingToolCallKey;
    let toolInvocation;
    if (this._pendingToolCalls.has(dto.callId)) {
      pendingToolCallKey = dto.callId;
      toolInvocation = this._pendingToolCalls.get(dto.callId);
    } else if (dto.chatStreamToolCallId && this._pendingToolCalls.has(dto.chatStreamToolCallId)) {
      pendingToolCallKey = dto.chatStreamToolCallId;
      toolInvocation = this._pendingToolCalls.get(dto.chatStreamToolCallId);
    }
    let requestId;
    let store;
    if (dto.context && request) {
      requestId = request.id;
      store = new DisposableStore();
      if (!this._callsByRequestId.has(requestId)) {
        this._callsByRequestId.set(requestId, []);
      }
      const trackedCall = { store };
      this._callsByRequestId.get(requestId).push(trackedCall);
      const source = new CancellationTokenSource();
      store.add(toDisposable(() => {
        source.dispose(true);
      }));
      store.add(token.onCancellationRequested((() => {
        IChatToolInvocation.confirmWith(toolInvocation, { type: ToolConfirmKind.Denied });
        source.cancel();
      })));
      store.add(source.token.onCancellationRequested(() => {
        IChatToolInvocation.confirmWith(toolInvocation, { type: ToolConfirmKind.Denied });
      }));
      token = source.token;
    }
    const preToolUseHookResult = dto.preToolUseResult;
    if (preToolUseHookResult?.permissionDecision === "deny") {
      const denialResult = this._handlePreToolUseDenial(dto, preToolUseHookResult, toolData, toolInvocation, request);
      if (pendingToolCallKey) {
        this._pendingToolCalls.delete(pendingToolCallKey);
      }
      return denialResult;
    }
    if (preToolUseHookResult?.updatedInput) {
      const validationError = await this._validateUpdatedInput(dto.toolId, toolData, preToolUseHookResult.updatedInput);
      if (validationError) {
        this._logService.warn(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} updatedInput from preToolUse hook failed schema validation: ${validationError}`);
      } else {
        this._logService.debug(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} input modified by preToolUse hook`);
        dto.parameters = preToolUseHookResult.updatedInput;
      }
    }
    this._onDidInvokeTool.fire({
      toolId: dto.toolId,
      sessionResource: dto.context?.sessionResource,
      requestId: dto.chatRequestId,
      subagentInvocationId: dto.subAgentInvocationId
    });
    let tool = this._tools.get(dto.toolId);
    if (!tool) {
      throw new Error(`Tool ${dto.toolId} was not contributed`);
    }
    if (!tool.impl) {
      await this._extensionService.activateByEvent(`onLanguageModelTool:${dto.toolId}`);
      tool = this._tools.get(dto.toolId);
      if (!tool?.impl) {
        throw new Error(`Tool ${dto.toolId} does not have an implementation registered.`);
      }
    }
    const hadPendingInvocation = !!toolInvocation;
    if (hadPendingInvocation && pendingToolCallKey) {
      this._pendingToolCalls.delete(pendingToolCallKey);
    }
    let toolResult;
    let prepareTimeWatch;
    let invocationTimeWatch;
    let preparedInvocation;
    try {
      if (dto.context) {
        if (!model) {
          throw new Error(`Tool called for unknown chat session`);
        }
        if (!request) {
          throw new Error(`Tool called for unknown chat request`);
        }
        dto.modelId = request.modelId;
        dto.userSelectedTools = request.userSelectedTools && { ...request.userSelectedTools };
        prepareTimeWatch = StopWatch.create(true);
        preparedInvocation = await this.prepareToolInvocationWithHookResult(tool, dto, preToolUseHookResult, token);
        prepareTimeWatch.stop();
        const { autoConfirmed: resolvedAutoConfirmed, preparedInvocation: updatedPreparedInvocation } = await this.resolveAutoConfirmFromHook(preToolUseHookResult, tool, dto, preparedInvocation, dto.context?.sessionResource);
        preparedInvocation = updatedPreparedInvocation;
        const preResolvedAutoConfirmed = resolvedAutoConfirmed ?? (preToolUseHookResult?.permissionDecision === "ask" ? void 0 : dto.preApproved);
        const { autoConfirmed, skipExplanation: riskSkipExplanation } = await this._maybeApplyAutopilotRiskGate(tool, dto, preparedInvocation, preResolvedAutoConfirmed, token);
        if (hadPendingInvocation && toolInvocation) {
          toolInvocation.transitionFromStreaming(preparedInvocation, dto.parameters, autoConfirmed);
        } else {
          toolInvocation = new ChatToolInvocation(preparedInvocation, tool.data, dto.chatStreamToolCallId ?? dto.callId, dto.subAgentInvocationId, dto.parameters);
          if (autoConfirmed) {
            IChatToolInvocation.confirmWith(toolInvocation, autoConfirmed);
          }
          this._chatService.appendProgress(request, toolInvocation);
        }
        dto.toolSpecificData = toolInvocation?.toolSpecificData;
        if (riskSkipExplanation) {
          this._logToolApprovalTelemetry(tool, dto, { type: ToolConfirmKind.Skipped });
          this._chatService.appendProgress(request, {
            kind: "info",
            content: new MarkdownString(localize("autopilotRiskSkipped", 'Autopilot skipped "{0}" because it was assessed as high-risk: {1}', tool.data.displayName, riskSkipExplanation))
          });
          toolResult = {
            content: [{
              kind: "text",
              value: `Autopilot skipped this tool call because it was automatically assessed as high-risk: ${riskSkipExplanation} The action was not performed. Do not retry it as-is \u2014 choose a safer approach or leave it for the user to run manually.`
            }]
          };
          return toolResult;
        }
        if (preparedInvocation?.confirmationMessages?.title) {
          if (!IChatToolInvocation.executionConfirmedOrDenied(toolInvocation) && !autoConfirmed) {
            this.playAccessibilitySignal([toolInvocation], dto.context?.sessionResource);
          }
          const userConfirmed = await IChatToolInvocation.awaitConfirmation(toolInvocation, token);
          this._logToolApprovalTelemetry(tool, dto, userConfirmed);
          if (userConfirmed.type === ToolConfirmKind.Denied) {
            throw new CancellationError();
          }
          if (userConfirmed.type === ToolConfirmKind.Skipped) {
            toolResult = {
              content: [{
                kind: "text",
                value: "The user chose to skip the tool call, they want to proceed without running it"
              }]
            };
            return toolResult;
          }
          if (userConfirmed.type === ToolConfirmKind.UserAction && userConfirmed.selectedButton) {
            dto.selectedCustomButton = userConfirmed.selectedButton;
          }
          if (dto.toolSpecificData?.kind === "input") {
            dto.parameters = dto.toolSpecificData.rawInput;
            dto.toolSpecificData = void 0;
          }
        } else {
          this._logToolApprovalTelemetry(tool, dto, autoConfirmed ?? { type: ToolConfirmKind.ConfirmationNotNeeded });
        }
      } else {
        prepareTimeWatch = StopWatch.create(true);
        preparedInvocation = await this.prepareToolInvocationWithHookResult(tool, dto, preToolUseHookResult, token);
        prepareTimeWatch.stop();
        const { autoConfirmed: fallbackAutoConfirmed, preparedInvocation: updatedPreparedInvocation } = await this.resolveAutoConfirmFromHook(preToolUseHookResult, tool, dto, preparedInvocation, void 0);
        preparedInvocation = updatedPreparedInvocation;
        if (preparedInvocation?.confirmationMessages?.title && !fallbackAutoConfirmed) {
          const result = await this._dialogService.confirm({ message: renderAsPlaintext(preparedInvocation.confirmationMessages.title), detail: renderAsPlaintext(preparedInvocation.confirmationMessages.message) });
          if (!result.confirmed) {
            throw new CancellationError();
          }
        }
        dto.toolSpecificData = preparedInvocation?.toolSpecificData;
      }
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      invocationTimeWatch = StopWatch.create(true);
      toolResult = await tool.impl.invoke(dto, countTokens, {
        report: (step) => {
          toolInvocation?.acceptProgress(step);
        }
      }, token);
      invocationTimeWatch.stop();
      const compressed = this._toolResultCompressor.maybeCompress(tool.data.id, dto.parameters, toolResult);
      if (compressed) {
        toolResult = compressed;
      }
      this.ensureToolDetails(dto, toolResult, tool.data, toolInvocation);
      const afterExecuteState = await toolInvocation?.didExecuteTool(toolResult, void 0, () => this.shouldAutoConfirmPostExecution(tool.data.id, tool.data.runsInWorkspace, tool.data.source, dto.parameters, dto.context?.sessionResource, dto.chatRequestId, dto.context?.workingDirectory));
      if (toolInvocation && afterExecuteState?.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
        const postConfirm = await IChatToolInvocation.awaitPostConfirmation(toolInvocation, token);
        if (postConfirm.type === ToolConfirmKind.Denied) {
          throw new CancellationError();
        }
        if (postConfirm.type === ToolConfirmKind.Skipped) {
          toolResult = {
            content: [{
              kind: "text",
              value: "The tool executed but the user chose not to share the results"
            }]
          };
        }
      }
      this._telemetryService.publicLog2(
        "languageModelToolInvoked",
        {
          result: "success",
          chatSessionId: dto.context?.sessionResource ? chatSessionResourceToId(dto.context.sessionResource) : void 0,
          toolId: tool.data.id,
          toolExtensionId: tool.data.source.type === "extension" ? tool.data.source.extensionId.value : void 0,
          toolSourceKind: tool.data.source.type,
          prepareTimeMs: prepareTimeWatch?.elapsed(),
          invocationTimeMs: invocationTimeWatch?.elapsed()
        }
      );
      return toolResult;
    } catch (err) {
      const result = isCancellationError(err) ? "userCancelled" : "error";
      this._telemetryService.publicLog2(
        "languageModelToolInvoked",
        {
          result,
          chatSessionId: dto.context?.sessionResource ? chatSessionResourceToId(dto.context.sessionResource) : void 0,
          toolId: tool.data.id,
          toolExtensionId: tool.data.source.type === "extension" ? tool.data.source.extensionId.value : void 0,
          toolSourceKind: tool.data.source.type,
          prepareTimeMs: prepareTimeWatch?.elapsed(),
          invocationTimeMs: invocationTimeWatch?.elapsed()
        }
      );
      if (!isCancellationError(err)) {
        this._logService.error(`[LanguageModelToolsService#invokeTool] Error from tool ${dto.toolId} with parameters ${JSON.stringify(dto.parameters)}:
${toErrorMessage(err, true)}`);
      }
      toolResult ??= { content: [] };
      toolResult.toolResultError = err instanceof Error ? err.message : String(err);
      if (tool.data.alwaysDisplayInputOutput) {
        toolResult.toolResultDetails = { input: this.formatToolInput(dto), output: [{ type: "embed", isText: true, value: String(err) }], isError: true };
      }
      throw err;
    } finally {
      toolInvocation?.didExecuteTool(toolResult, true);
      if (store) {
        this.cleanupCallDisposables(requestId, store);
      }
    }
  }
  async prepareToolInvocationWithHookResult(tool, dto, hookResult, token) {
    let forceConfirmationReason;
    if (hookResult?.permissionDecision === "ask") {
      const hookMessage = localize("preToolUseHookRequiredConfirmation", "{0} required confirmation", HookType.PreToolUse);
      forceConfirmationReason = hookResult.permissionDecisionReason ? `${hookMessage}: ${hookResult.permissionDecisionReason}` : hookMessage;
    }
    return this.prepareToolInvocation(tool, dto, forceConfirmationReason, token);
  }
  _logToolApprovalTelemetry(tool, dto, reason) {
    const confirmKindNames = {
      [ToolConfirmKind.Denied]: "denied",
      [ToolConfirmKind.ConfirmationNotNeeded]: "confirmationNotNeeded",
      [ToolConfirmKind.Setting]: "setting",
      [ToolConfirmKind.LmServicePerTool]: "lmServicePerTool",
      [ToolConfirmKind.UserAction]: "userAction",
      [ToolConfirmKind.Skipped]: "skipped"
    };
    const allowedConfirmationNotNeededReasons = /* @__PURE__ */ new Set([autoApproveAllReason, "inlineChat"]);
    let confirmationNotNeededReason;
    if (reason.type === ToolConfirmKind.ConfirmationNotNeeded && reason.reason) {
      const raw = typeof reason.reason === "string" ? reason.reason : reason.reason.value;
      confirmationNotNeededReason = allowedConfirmationNotNeededReasons.has(raw) ? raw : "other";
    }
    const terminalData = dto.toolSpecificData?.kind === "terminal" ? dto.toolSpecificData : void 0;
    this._telemetryService.publicLog2(
      "chat.toolApproval",
      {
        confirmKind: confirmKindNames[reason.type],
        requestId: dto.chatRequestId,
        settingId: reason.type === ToolConfirmKind.Setting ? reason.id : void 0,
        lmServiceScope: reason.type === ToolConfirmKind.LmServicePerTool ? reason.scope : void 0,
        customButtonKind: reason.type === ToolConfirmKind.UserAction ? reason.selectedButtonKind : void 0,
        confirmationNotNeededReason,
        sandboxWrapped: terminalData?.commandLine.isSandboxWrapped,
        requestUnsandboxedExecution: terminalData?.requestUnsandboxedExecution,
        chatSessionId: dto.context?.sessionResource ? chatSessionResourceToId(dto.context.sessionResource) : void 0,
        toolId: tool.data.id,
        toolExtensionId: tool.data.source.type === "extension" ? tool.data.source.extensionId.value : void 0,
        toolSourceKind: tool.data.source.type
      }
    );
  }
  /**
   * Determines the auto-confirm decision based on a preToolUse hook result.
   * If the hook returned 'allow', auto-approves. If 'ask', forces confirmation
   * and ensures confirmation messages exist on `preparedInvocation`. Otherwise
   * falls back to normal auto-confirm logic.
   *
   * Returns the possibly-updated preparedInvocation along with the auto-confirm decision,
   * since when the hook returns 'ask' and preparedInvocation was undefined, we create one.
   */
  async resolveAutoConfirmFromHook(hookResult, tool, dto, preparedInvocation, sessionResource) {
    if (hookResult?.permissionDecision === "allow") {
      this._logService.debug(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} auto-approved by preToolUse hook`);
      return { autoConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded, reason: localize("hookAllowed", "Allowed by hook") }, preparedInvocation };
    }
    if (hookResult?.permissionDecision === "ask") {
      this._logService.debug(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} requires confirmation (preToolUse hook returned 'ask')`);
      if (!preparedInvocation?.confirmationMessages?.title) {
        if (!preparedInvocation) {
          preparedInvocation = {};
        }
        const fullReferenceName = getToolFullReferenceName(tool.data);
        const hookReason = hookResult.permissionDecisionReason;
        const hookNote = hookReason ? localize("hookRequiresConfirmation.messageWithReason", "{0} hook required confirmation: {1}", HookType.PreToolUse, hookReason) : localize("hookRequiresConfirmation.message", "{0} hook required confirmation", HookType.PreToolUse);
        preparedInvocation.confirmationMessages = {
          ...preparedInvocation.confirmationMessages,
          title: localize("hookRequiresConfirmation.title", "Use the '{0}' tool?", fullReferenceName),
          message: new MarkdownString(`_${hookNote}_`),
          allowAutoConfirm: false
        };
        preparedInvocation.toolSpecificData = {
          kind: "input",
          rawInput: dto.parameters
        };
      } else {
        const hookReason = hookResult.permissionDecisionReason;
        const hookNote = hookReason ? localize("hookRequiresConfirmation.note", "{0} hook required confirmation: {1}", HookType.PreToolUse, hookReason) : localize("hookRequiresConfirmation.noteNoReason", "{0} hook required confirmation", HookType.PreToolUse);
        const existing = preparedInvocation.confirmationMessages;
        if (preparedInvocation.toolSpecificData?.kind === "terminal") {
          const existingDisclaimerText = existing.disclaimer ? typeof existing.disclaimer === "string" ? existing.disclaimer : existing.disclaimer.value : void 0;
          const combinedDisclaimer = existingDisclaimerText ? `${hookNote}

${existingDisclaimerText}` : hookNote;
          preparedInvocation.confirmationMessages = {
            ...existing,
            disclaimer: combinedDisclaimer,
            allowAutoConfirm: false
          };
        } else {
          const msgText = typeof existing.message === "string" ? existing.message : existing.message?.value ?? "";
          preparedInvocation.confirmationMessages = {
            ...existing,
            message: new MarkdownString(`_${hookNote}_

${msgText}`),
            allowAutoConfirm: false
          };
        }
      }
      return { autoConfirmed: void 0, preparedInvocation };
    }
    const approveCombination = preparedInvocation?.confirmationMessages?.approveCombination;
    let combination;
    if (approveCombination) {
      combination = {
        label: typeof approveCombination.label === "string" ? approveCombination.label : approveCombination.label.value,
        key: approveCombination.key
      };
    }
    const autoConfirmed = await this.shouldAutoConfirm(tool.data.id, tool.data.runsInWorkspace, tool.data.source, dto.parameters, sessionResource, dto.chatRequestId, combination, dto.context?.workingDirectory);
    return { autoConfirmed, preparedInvocation };
  }
  /**
   * In Autopilot, runs the risk classifier on an auto-approved call and skips it when the rating
   * is {@link ToolRiskLevel.Red}. Any other result returns the original auto-confirmation
   * unchanged.
   *
   * To keep the classifier off the hot path, it only runs when all of these hold:
   * - the call was auto-approved by the session approving everything, or is a `run_in_terminal` /
   *   fetch call that self-approved (these can run risky commands or prompt-injected URLs without
   *   ever showing a confirmation);
   * - it would otherwise show a confirmation (the self-approving tools above are the exception);
   * - the session is a local panel session at the Autopilot level with Advanced Autopilot on.
   *
   * This is independent of `chat.tools.riskAssessment.enabled`, which only controls the
   * confirmation risk badge. CLI and agent-host sessions handle their own confirmations and are
   * excluded.
   *
   * Fails open: a cancelled, unavailable, or failed assessment keeps the original
   * auto-confirmation so Autopilot keeps moving.
   */
  async _maybeApplyAutopilotRiskGate(tool, dto, preparedInvocation, autoConfirmed, token) {
    const isTerminalTool = tool.data.id === TerminalToolId.RunInTerminal;
    const isFetchTool = fetchWebPageToolIds.has(tool.data.id);
    const isAlwaysClassifyTool = isTerminalTool || isFetchTool;
    const isBlanketSessionApprove = autoConfirmed?.type === ToolConfirmKind.ConfirmationNotNeeded && autoConfirmed.reason === autoApproveAllReason;
    const isSelfApprovedAlwaysClassify = isAlwaysClassifyTool && autoConfirmed === void 0 && !preparedInvocation?.confirmationMessages?.title;
    if (!isBlanketSessionApprove && !isSelfApprovedAlwaysClassify) {
      return { autoConfirmed };
    }
    if (!isAlwaysClassifyTool && !preparedInvocation?.confirmationMessages?.title) {
      return { autoConfirmed };
    }
    if (this._configurationService.getValue(ChatConfiguration.AutopilotAdvancedEnabled) !== true) {
      return { autoConfirmed };
    }
    const sessionResource = dto.context?.sessionResource;
    if (!sessionResource || getChatSessionType(sessionResource) !== localChatSessionType) {
      return { autoConfirmed };
    }
    if (!this._isSessionInAutopilotLevel(sessionResource)) {
      return { autoConfirmed };
    }
    try {
      const assessment = await this._riskAssessmentService.assess(tool.data, dto.parameters, token, void 0, { ignoreEnablement: true });
      if (token.isCancellationRequested) {
        return { autoConfirmed };
      }
      if (assessment?.risk === ToolRiskLevel.Red) {
        const fallbackExplanation = localize("autopilotRiskSkipFallback", "The action was assessed as potentially destructive or irreversible.");
        const explanation = assessment.explanation.trim() || fallbackExplanation;
        this._logService.info(`[LanguageModelToolsService#invokeTool] Autopilot skipping high-risk tool ${tool.data.id}: ${explanation}`);
        return { autoConfirmed: { type: ToolConfirmKind.Skipped }, skipExplanation: explanation };
      }
    } catch (err) {
      this._logService.warn(`[LanguageModelToolsService#invokeTool] Autopilot risk assessment failed for tool ${tool.data.id}, allowing: ${toErrorMessage(err)}`);
    }
    return { autoConfirmed };
  }
  async prepareToolInvocation(tool, dto, forceConfirmationReason, token) {
    let prepared;
    if (tool.impl.prepareToolInvocation) {
      const preparePromise = tool.impl.prepareToolInvocation({
        parameters: dto.parameters,
        toolCallId: dto.callId,
        chatRequestId: dto.chatRequestId,
        chatSessionResource: dto.context?.sessionResource,
        chatInteractionId: dto.chatInteractionId,
        modelId: dto.modelId,
        forceConfirmationReason,
        workingDirectory: dto.context?.workingDirectory
      }, token);
      const raceResult = await Promise.race([
        timeout(3e3, token).then(() => "timeout"),
        preparePromise
      ]);
      if (raceResult === "timeout" && dto.context) {
        this._onDidPrepareToolCallBecomeUnresponsive.fire({
          sessionResource: dto.context.sessionResource,
          toolData: tool.data
        });
      }
      prepared = await preparePromise;
    }
    const isEligibleForAutoApproval = this.isToolEligibleForAutoApproval(tool.data);
    if (!isEligibleForAutoApproval && !prepared?.confirmationMessages?.title) {
      if (!prepared) {
        prepared = {};
      }
      const fullReferenceName = getToolFullReferenceName(tool.data);
      prepared.confirmationMessages = {
        ...prepared.confirmationMessages,
        title: localize("defaultToolConfirmation.title", "Confirm tool execution"),
        message: localize("defaultToolConfirmation.message", "Run the '{0}' tool?", fullReferenceName),
        disclaimer: toolIdsThatCannotBeAutoApproved.has(tool.data.id) ? void 0 : new MarkdownString(localize("defaultToolConfirmation.disclaimer", "Auto approval for '{0}' is restricted via {1}.", getToolFullReferenceName(tool.data), createMarkdownCommandLink({ text: "`" + ChatConfiguration.EligibleForAutoApproval + "`", id: "workbench.action.openSettings", arguments: [ChatConfiguration.EligibleForAutoApproval], tooltip: localize("openSettings.autoApproval.tooltip", "Open settings to configure auto-approval") }, false)), { isTrusted: true }),
        allowAutoConfirm: false
      };
    }
    if (!isEligibleForAutoApproval && prepared?.confirmationMessages?.title) {
      prepared.confirmationMessages.disclaimer = toolIdsThatCannotBeAutoApproved.has(tool.data.id) ? void 0 : new MarkdownString(localize("defaultToolConfirmation.disclaimer", "Auto approval for '{0}' is restricted via {1}.", getToolFullReferenceName(tool.data), createMarkdownCommandLink({ text: "`" + ChatConfiguration.EligibleForAutoApproval + "`", id: "workbench.action.openSettings", arguments: [ChatConfiguration.EligibleForAutoApproval], tooltip: localize("openSettings.autoApproval.tooltip", "Open settings to configure auto-approval") }, false)), { isTrusted: true });
    }
    if (prepared?.confirmationMessages?.title) {
      if (prepared.toolSpecificData?.kind !== "terminal" && prepared.confirmationMessages.allowAutoConfirm !== false) {
        prepared.confirmationMessages.allowAutoConfirm = isEligibleForAutoApproval;
      }
      if (!prepared.toolSpecificData && tool.data.alwaysDisplayInputOutput) {
        prepared.toolSpecificData = {
          kind: "input",
          rawInput: dto.parameters
        };
      }
    }
    return prepared;
  }
  beginToolCall(options) {
    const toolEntry = this._tools.get(options.toolId);
    if (!toolEntry) {
      return void 0;
    }
    if (!options.force && !toolEntry.impl?.handleToolStream) {
      return void 0;
    }
    const invocation = ChatToolInvocation.createStreaming({
      toolCallId: options.toolCallId,
      toolId: options.toolId,
      toolData: toolEntry.data,
      subagentInvocationId: options.subagentInvocationId,
      chatRequestId: options.chatRequestId
    });
    this._pendingToolCalls.set(options.toolCallId, invocation);
    if (options.sessionResource) {
      const model = this._chatService.getSession(options.sessionResource);
      if (model) {
        const request = (options.chatRequestId ? model.getRequests().find((r) => r.id === options.chatRequestId) : void 0) ?? model.getRequests().at(-1);
        if (request) {
          this._chatService.appendProgress(request, invocation);
        }
      }
    }
    this._callHandleToolStream(toolEntry, invocation, options.toolCallId, void 0, CancellationToken.None);
    return invocation;
  }
  async _callHandleToolStream(toolEntry, invocation, toolCallId, rawInput, token) {
    if (!toolEntry.impl?.handleToolStream) {
      return;
    }
    try {
      const result = await toolEntry.impl.handleToolStream({
        toolCallId,
        rawInput,
        chatRequestId: invocation.chatRequestId
      }, token);
      if (result?.invocationMessage) {
        invocation.updateStreamingMessage(result.invocationMessage);
      }
    } catch (error) {
      this._logService.error(`[LanguageModelToolsService#_callHandleToolStream] Error calling handleToolStream for tool ${toolEntry.data.id}:`, error);
    }
  }
  async updateToolStream(toolCallId, partialInput, token) {
    const invocation = this._pendingToolCalls.get(toolCallId);
    if (!invocation) {
      return;
    }
    invocation.updatePartialInput(partialInput);
    const toolEntry = this._tools.get(invocation.toolId);
    if (toolEntry) {
      await this._callHandleToolStream(toolEntry, invocation, toolCallId, partialInput, token);
    }
  }
  playAccessibilitySignal(toolInvocations, chatSessionResource) {
    const autoApproved = this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove);
    if (autoApproved) {
      return;
    }
    if (chatSessionResource) {
      const model = this._chatService.getSession(chatSessionResource);
      const request = model?.getRequests().at(-1);
      if (isAutoApproveLevel(request?.modeInfo?.permissionLevel) || this._isSessionLiveAutoApproveLevel(chatSessionResource)) {
        return;
      }
    }
    const pendingInvocations = toolInvocations.filter((inv) => !IChatToolInvocation.executionConfirmedOrDenied(inv));
    if (pendingInvocations.length === 0) {
      return;
    }
    const setting = this._configurationService.getValue(AccessibilitySignal.chatUserActionRequired.settingsKey);
    if (!setting) {
      return;
    }
    const soundEnabled = setting.sound === "on" || setting.sound === "auto" && this._accessibilityService.isScreenReaderOptimized();
    const announcementEnabled = this._accessibilityService.isScreenReaderOptimized() && setting.announcement === "auto";
    if (soundEnabled || announcementEnabled) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.chatUserActionRequired, { customAlertMessage: this._instantiationService.invokeFunction(getToolConfirmationAlert, pendingInvocations), userGesture: true, modality: !soundEnabled ? "announcement" : void 0 });
    }
  }
  ensureToolDetails(dto, toolResult, toolData, toolInvocation) {
    if (!toolResult.toolResultDetails && (toolData.alwaysDisplayInputOutput || this.toolResultHasImages(toolResult) && !this.toolResultMessageHasImageFileWidgets(toolResult, toolInvocation))) {
      toolResult.toolResultDetails = {
        input: this.formatToolInput(dto),
        output: this.toolResultToIO(toolResult)
      };
    }
  }
  toolResultHasImages(toolResult) {
    return toolResult.content.some((part) => part.kind === "data" && part.value.mimeType?.startsWith("image/"));
  }
  /**
   * Returns true if the tool result message (or falling back to the tool invocation's
   * pastTenseMessage from streaming) contains empty markdown links pointing to image
   * files (the `[](imageUri)` pattern) that will be rendered as file pills by renderFileWidgets.
   */
  toolResultMessageHasImageFileWidgets(toolResult, toolInvocation) {
    const message = toolResult.toolResultMessage ?? toolInvocation?.pastTenseMessage;
    if (!message) {
      return false;
    }
    const value = typeof message === "string" ? message : message.value;
    const linkPattern = /\[\s*\]\((?<uri>[^)]+)\)/g;
    let match;
    while ((match = linkPattern.exec(value)) !== null) {
      try {
        const parsed = URI.parse(match.groups.uri);
        const mime = getMediaMime(parsed.path);
        if (mime?.startsWith("image/")) {
          return true;
        }
      } catch {
      }
    }
    return false;
  }
  formatToolInput(dto) {
    return JSON.stringify(dto.parameters, void 0, 2);
  }
  toolResultToIO(toolResult) {
    return toolResult.content.map((part) => {
      if (part.kind === "text") {
        return { type: "embed", isText: true, value: part.value };
      } else if (part.kind === "promptTsx") {
        return { type: "embed", isText: true, value: stringifyPromptTsxPart(part) };
      } else if (part.kind === "data") {
        return { type: "embed", value: encodeBase64(part.value.data), mimeType: part.value.mimeType };
      } else {
        assertNever(part);
      }
    });
  }
  /**
   * Returns true if enterprise policy has explicitly disabled the global auto-approve setting.
   * When this is the case, Bypass Approvals and Autopilot permission levels should not auto-approve tools.
   */
  _isAutoApprovePolicyRestricted() {
    const inspected = this._configurationService.inspect(ChatConfiguration.GlobalAutoApprove);
    return inspected.policyValue === false;
  }
  /**
   * Returns true if the session's current (live) permission picker level is auto-approve.
   * This checks the widget's current state, not what was stamped on the request,
   * so switching to Autopilot mid-session takes effect immediately.
   */
  _isSessionLiveAutoApproveLevel(chatSessionResource) {
    const widget = this._chatWidgetService.getWidgetBySessionResource(chatSessionResource) ?? this._chatWidgetService.lastFocusedWidget;
    return !!widget && isAutoApproveLevel(widget.input.currentModeInfo.permissionLevel);
  }
  /**
   * True if the session is in an auto-approve level (Auto-Approve / Autopilot),
   * via either the last request's stamped level or the live picker level.
   */
  _isSessionInAutoApproveLevel(chatSessionResource) {
    if (!chatSessionResource) {
      return false;
    }
    const model = this._chatService.getSession(chatSessionResource);
    const request = model?.getRequests().at(-1);
    return isAutoApproveLevel(request?.modeInfo?.permissionLevel) || this._isSessionLiveAutoApproveLevel(chatSessionResource);
  }
  /**
   * True if the session's live permission picker level is Autopilot. Like
   * {@link _isSessionLiveAutoApproveLevel}, but excludes plain Auto-Approve.
   */
  _isSessionLiveAutopilotLevel(chatSessionResource) {
    const widget = this._chatWidgetService.getWidgetBySessionResource(chatSessionResource) ?? this._chatWidgetService.lastFocusedWidget;
    return !!widget && isAutopilotLevel(widget.input.currentModeInfo.permissionLevel);
  }
  /**
   * True if the session is at the Autopilot level (not plain Auto-Approve), via either the last
   * request's stamped level or the live picker level.
   */
  _isSessionInAutopilotLevel(chatSessionResource) {
    if (!chatSessionResource) {
      return false;
    }
    const model = this._chatService.getSession(chatSessionResource);
    const request = model?.getRequests().at(-1);
    return isAutopilotLevel(request?.modeInfo?.permissionLevel) || this._isSessionLiveAutopilotLevel(chatSessionResource);
  }
  getEligibleForAutoApprovalSpecialCase(toolData) {
    if (toolData.id === "vscode_fetchWebPage_internal") {
      return "fetch";
    }
    return void 0;
  }
  isToolEligibleForAutoApproval(toolData) {
    const fullReferenceName = this.getEligibleForAutoApprovalSpecialCase(toolData) ?? getToolFullReferenceName(toolData);
    if (toolData.id === "copilot_fetchWebPage") {
      return true;
    }
    if (toolIdsThatCannotBeAutoApproved.has(toolData.id)) {
      return false;
    }
    const eligibilityConfig = this._configurationService.getValue(ChatConfiguration.EligibleForAutoApproval);
    if (eligibilityConfig && typeof eligibilityConfig === "object" && fullReferenceName) {
      if (Object.prototype.hasOwnProperty.call(eligibilityConfig, fullReferenceName)) {
        return eligibilityConfig[fullReferenceName];
      }
      if (toolData.legacyToolReferenceFullNames) {
        for (const legacyName of toolData.legacyToolReferenceFullNames) {
          if (Object.prototype.hasOwnProperty.call(eligibilityConfig, legacyName)) {
            return eligibilityConfig[legacyName];
          }
          if (legacyName.includes("/")) {
            const trimmedLegacyName = legacyName.split("/").pop();
            if (trimmedLegacyName && Object.prototype.hasOwnProperty.call(eligibilityConfig, trimmedLegacyName)) {
              return eligibilityConfig[trimmedLegacyName];
            }
          }
        }
      }
    }
    return true;
  }
  async shouldAutoConfirm(toolId, runsInWorkspace, source, parameters, chatSessionResource, chatRequestId, combination, workingDirectory) {
    const tool = this._tools.get(toolId);
    if (!tool) {
      return void 0;
    }
    if (chatSessionResource && !this._isAutoApprovePolicyRestricted() && this._isSessionInAutoApproveLevel(chatSessionResource)) {
      if (!(toolIdsThatCannotBeAutoApproved.has(tool.data.id) && getChatSessionType(chatSessionResource) !== localChatSessionType)) {
        return { type: ToolConfirmKind.ConfirmationNotNeeded, reason: autoApproveAllReason };
      }
    }
    if (!this.isToolEligibleForAutoApproval(tool.data)) {
      return void 0;
    }
    const reason = this._confirmationService.getPreConfirmAction({ toolId, source, parameters, chatSessionResource, workingDirectory, combination });
    if (reason) {
      return reason;
    }
    const config = this._configurationService.inspect(ChatConfiguration.GlobalAutoApprove);
    let value = config.value ?? config.defaultValue;
    if (typeof runsInWorkspace === "boolean") {
      value = config.userLocalValue ?? config.applicationValue;
      if (runsInWorkspace) {
        value = config.workspaceValue ?? config.workspaceFolderValue ?? config.userRemoteValue ?? value;
      }
    }
    const autoConfirm = value === true || typeof value === "object" && value.hasOwnProperty(toolId) && value[toolId] === true;
    if (autoConfirm) {
      if (await this._checkGlobalAutoApprove()) {
        return { type: ToolConfirmKind.Setting, id: ChatConfiguration.GlobalAutoApprove };
      }
    }
    return void 0;
  }
  async shouldAutoConfirmPostExecution(toolId, runsInWorkspace, source, parameters, chatSessionResource, chatRequestId, workingDirectory) {
    const sessionAutoApprove = chatSessionResource && !this._isAutoApprovePolicyRestricted() && this._isSessionInAutoApproveLevel(chatSessionResource);
    if (sessionAutoApprove) {
      if (!(toolIdsThatCannotBeAutoApproved.has(toolId) && getChatSessionType(chatSessionResource) !== localChatSessionType)) {
        return { type: ToolConfirmKind.ConfirmationNotNeeded, reason: autoApproveAllReason };
      }
    }
    if (this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove) && !sessionAutoApprove && await this._checkGlobalAutoApprove()) {
      return { type: ToolConfirmKind.Setting, id: ChatConfiguration.GlobalAutoApprove };
    }
    return this._confirmationService.getPostConfirmAction({ toolId, source, parameters, chatSessionResource, workingDirectory });
  }
  async _checkGlobalAutoApprove() {
    const optedIn = this._storageService.getBoolean("chat.tools.global.autoApprove.optIn" /* GlobalAutoApproveOptIn */, StorageScope.APPLICATION, false);
    if (optedIn) {
      return true;
    }
    if (this._contextKeyService.getContextKeyValue(SkipAutoApproveConfirmationKey) === true) {
      return true;
    }
    if (this._pendingGlobalAutoApproveCheck) {
      return this._pendingGlobalAutoApproveCheck;
    }
    this._pendingGlobalAutoApproveCheck = this._doCheckGlobalAutoApprove();
    try {
      return await this._pendingGlobalAutoApproveCheck;
    } finally {
      this._pendingGlobalAutoApproveCheck = void 0;
    }
  }
  async _doCheckGlobalAutoApprove() {
    const store = new DisposableStore();
    try {
      const cts = new CancellationTokenSource();
      store.add(cts);
      store.add(this._storageService.onDidChangeValue(StorageScope.APPLICATION, "chat.tools.global.autoApprove.optIn" /* GlobalAutoApproveOptIn */, store)(() => {
        if (this._storageService.getBoolean("chat.tools.global.autoApprove.optIn" /* GlobalAutoApproveOptIn */, StorageScope.APPLICATION, false)) {
          cts.cancel();
        }
      }));
      const promptResult = await this._dialogService.prompt({
        type: Severity.Warning,
        message: localize("autoApprove2.title", "Enable global auto approve?"),
        buttons: [
          {
            label: localize("autoApprove2.button.enable", "Enable"),
            run: () => true
          },
          {
            label: localize("autoApprove2.button.disable", "Disable"),
            run: () => false
          }
        ],
        custom: {
          icon: Codicon.warning,
          markdownDetails: [{
            markdown: new MarkdownString(globalAutoApproveDescription.value, { isTrusted: { enabledCommands: ["workbench.action.openSettings"] } })
          }]
        },
        token: cts.token
      });
      if (cts.token.isCancellationRequested) {
        return true;
      }
      if (promptResult.result !== true) {
        await this._configurationService.updateValue(ChatConfiguration.GlobalAutoApprove, false);
        return false;
      }
      this._storageService.store("chat.tools.global.autoApprove.optIn" /* GlobalAutoApproveOptIn */, true, StorageScope.APPLICATION, StorageTarget.USER);
      return true;
    } finally {
      store.dispose();
    }
  }
  cleanupCallDisposables(requestId, store) {
    if (requestId) {
      const disposables = this._callsByRequestId.get(requestId);
      if (disposables) {
        const index = disposables.findIndex((d) => d.store === store);
        if (index > -1) {
          disposables.splice(index, 1);
        }
        if (disposables.length === 0) {
          this._callsByRequestId.delete(requestId);
        }
      }
    }
    store.dispose();
  }
  cancelToolCallsForRequest(requestId) {
    const calls = this._callsByRequestId.get(requestId);
    if (calls) {
      calls.forEach((call) => call.store.dispose());
      this._callsByRequestId.delete(requestId);
    }
    for (const [toolCallId, invocation] of this._pendingToolCalls) {
      if (invocation.chatRequestId === requestId) {
        this._pendingToolCalls.delete(toolCallId);
      }
    }
  }
  *getToolSetAliases(toolSet, fullReferenceName) {
    if (fullReferenceName !== toolSet.referenceName) {
      yield toolSet.referenceName;
    }
    if (toolSet.legacyFullNames) {
      yield* toolSet.legacyFullNames;
    }
    switch (toolSet.referenceName) {
      case "github":
        for (const alias of LanguageModelToolsService.githubMCPServerAliases) {
          yield alias + "/*";
        }
        break;
      case "playwright":
        for (const alias of LanguageModelToolsService.playwrightMCPServerAliases) {
          yield alias + "/*";
        }
        break;
      case SpecedToolAliases.execute:
        yield "shell";
        break;
      case SpecedToolAliases.agent:
        yield VSCodeToolReference.runSubagent;
        yield "custom-agent";
        break;
    }
  }
  *getToolAliases(toolSet, fullReferenceName) {
    const referenceName = toolSet.toolReferenceName ?? toolSet.displayName;
    if (fullReferenceName !== referenceName && referenceName !== VSCodeToolReference.runSubagent) {
      yield referenceName;
    }
    if (toolSet.legacyToolReferenceFullNames) {
      for (const legacyName of toolSet.legacyToolReferenceFullNames) {
        yield legacyName;
        const lastSlashIndex = legacyName.lastIndexOf("/");
        if (lastSlashIndex !== -1) {
          yield legacyName.substring(lastSlashIndex + 1);
        }
      }
    }
    const slashIndex = fullReferenceName.lastIndexOf("/");
    if (slashIndex !== -1) {
      switch (fullReferenceName.substring(0, slashIndex)) {
        case "github":
          for (const alias of LanguageModelToolsService.githubMCPServerAliases) {
            yield alias + fullReferenceName.substring(slashIndex);
          }
          break;
        case "playwright":
          for (const alias of LanguageModelToolsService.playwrightMCPServerAliases) {
            yield alias + fullReferenceName.substring(slashIndex);
          }
          break;
      }
    }
  }
  /**
   * Create a map that contains all tools and toolsets with their enablement state.
   * @param fullReferenceNames A list of tool or toolset by their full reference names that are enabled.
   * @returns A map of tool or toolset instances to their enablement state.
   */
  toToolAndToolSetEnablementMap(fullReferenceNames, model) {
    const toolOrToolSetNames = new Set(fullReferenceNames);
    const result = /* @__PURE__ */ new Map();
    for (const [tool, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
      if (isToolSet(tool)) {
        const enabled = toolOrToolSetNames.has(fullReferenceName) || Iterable.some(this.getToolSetAliases(tool, fullReferenceName), (name) => toolOrToolSetNames.has(name));
        const scoped = model ? new ToolSetForModel(tool, model) : tool;
        result.set(scoped, enabled);
        if (enabled) {
          for (const memberTool of scoped.getTools()) {
            result.set(memberTool, true);
          }
        }
      } else {
        if (!this.isToolEnabledForModel(tool, model)) {
          continue;
        }
        if (!result.has(tool)) {
          const enabled = toolOrToolSetNames.has(fullReferenceName) || Iterable.some(this.getToolAliases(tool, fullReferenceName), (name) => toolOrToolSetNames.has(name)) || !!tool.legacyToolReferenceFullNames?.some((toolFullName) => {
            const index = toolFullName.lastIndexOf("/");
            return index !== -1 && toolOrToolSetNames.has(toolFullName.substring(0, index));
          });
          result.set(tool, enabled);
        }
      }
    }
    for (const toolSet of this._toolSets) {
      if (toolSet.source.type === "user") {
        const enabled = Iterable.every(toolSet.getTools(), (t) => result.get(t) === true);
        result.set(toolSet, enabled);
      }
    }
    return ToolAndToolSetEnablementMap.fromMap(result);
  }
  toFullReferenceNames(map) {
    const result = [];
    const toolsCoveredByEnabledToolSet = /* @__PURE__ */ new Set();
    const enabledToolSetIds = /* @__PURE__ */ new Set();
    const enabledToolIds = /* @__PURE__ */ new Set();
    for (const [tool, enabled] of map) {
      if (enabled) {
        if (isToolSet(tool)) {
          enabledToolSetIds.add(tool.id);
        } else {
          enabledToolIds.add(tool.id);
        }
      }
    }
    for (const [tool, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
      if (isToolSet(tool)) {
        if (enabledToolSetIds.has(tool.id)) {
          result.push(fullReferenceName);
          for (const memberTool of tool.getTools()) {
            toolsCoveredByEnabledToolSet.add(memberTool);
          }
        }
      } else {
        if (enabledToolIds.has(tool.id) && !toolsCoveredByEnabledToolSet.has(tool)) {
          result.push(fullReferenceName);
        }
      }
    }
    return result;
  }
  toToolReferences(variableReferences) {
    const toolsOrToolSetByName = /* @__PURE__ */ new Map();
    for (const [tool, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
      toolsOrToolSetByName.set(fullReferenceName, tool);
    }
    const result = [];
    for (const ref of variableReferences) {
      const toolOrToolSet = toolsOrToolSetByName.get(ref.name);
      if (toolOrToolSet) {
        if (isToolSet(toolOrToolSet)) {
          result.push(toToolSetVariableEntry(toolOrToolSet, ref.range));
        } else {
          result.push(toToolVariableEntry(toolOrToolSet, ref.range));
        }
      }
    }
    return result;
  }
  getToolSetsForModel(model, reader) {
    if (!model) {
      return this.toolSets.read(reader);
    }
    return Iterable.map(this.toolSets.read(reader), (ts) => new ToolSetForModel(ts, model, (toolData) => this.isToolEnabledForModel(toolData, model)));
  }
  getToolSet(id) {
    for (const toolSet of this._toolSets) {
      if (toolSet.id === id) {
        return toolSet;
      }
    }
    return void 0;
  }
  getToolSetByName(name) {
    for (const toolSet of this._toolSets) {
      if (toolSet.referenceName === name) {
        return toolSet;
      }
    }
    return void 0;
  }
  getSpecedToolSetName(referenceName) {
    if (LanguageModelToolsService.githubMCPServerAliases.includes(referenceName)) {
      return "github";
    }
    if (LanguageModelToolsService.playwrightMCPServerAliases.includes(referenceName)) {
      return "playwright";
    }
    return referenceName;
  }
  createToolSet(source, id, referenceName, options) {
    const that = this;
    referenceName = this.getSpecedToolSetName(referenceName);
    const result = new class extends ToolSet {
      dispose() {
        if (that._toolSets.has(result)) {
          this._tools.clear();
          that._toolSets.delete(result);
        }
      }
    }(id, referenceName, options?.icon ?? Codicon.tools, source, options?.description, options?.detail, options?.legacyFullNames, options?.deprecated, options?.hiddenInToolsPicker, this._contextKeyService);
    this._toolSets.add(result);
    return result;
  }
  *getFullReferenceNames() {
    for (const [, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
      yield fullReferenceName;
    }
  }
  getDeprecatedFullReferenceNames() {
    const result = /* @__PURE__ */ new Map();
    const knownToolSetNames = /* @__PURE__ */ new Set();
    const add = (name, fullReferenceName) => {
      if (name !== fullReferenceName) {
        if (!result.has(name)) {
          result.set(name, /* @__PURE__ */ new Set());
        }
        result.get(name).add(fullReferenceName);
      }
    };
    for (const [tool, _] of this.toolsWithFullReferenceName.get()) {
      if (isToolSet(tool)) {
        knownToolSetNames.add(tool.referenceName);
        if (tool.legacyFullNames) {
          for (const legacyName of tool.legacyFullNames) {
            knownToolSetNames.add(legacyName);
          }
        }
      }
    }
    for (const [tool, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
      if (isToolSet(tool)) {
        for (const alias of this.getToolSetAliases(tool, fullReferenceName)) {
          add(alias, fullReferenceName);
        }
      } else {
        for (const alias of this.getToolAliases(tool, fullReferenceName)) {
          add(alias, fullReferenceName);
        }
        if (tool.legacyToolReferenceFullNames) {
          const slashIndex = fullReferenceName.lastIndexOf("/");
          const toolSetPrefix = slashIndex !== -1 ? fullReferenceName.substring(0, slashIndex + 1) : void 0;
          for (const legacyName of tool.legacyToolReferenceFullNames) {
            if (toolSetPrefix && !legacyName.includes("/")) {
              add(toolSetPrefix + legacyName, fullReferenceName);
            }
            if (legacyName.includes("/")) {
              const toolSetFullName = legacyName.substring(0, legacyName.lastIndexOf("/"));
              if (!knownToolSetNames.has(toolSetFullName)) {
                add(toolSetFullName, fullReferenceName);
              }
            }
          }
        }
      }
    }
    return result;
  }
  getToolByFullReferenceName(fullReferenceName) {
    for (const [tool, toolFullReferenceName] of this.toolsWithFullReferenceName.get()) {
      if (fullReferenceName === toolFullReferenceName) {
        return tool;
      }
      const aliases = isToolSet(tool) ? this.getToolSetAliases(tool, toolFullReferenceName) : this.getToolAliases(tool, toolFullReferenceName);
      if (Iterable.some(aliases, (alias) => fullReferenceName === alias)) {
        return tool;
      }
    }
    return void 0;
  }
  getFullReferenceName(tool, toolSet) {
    for (const [item, toolFullReferenceName] of this.toolsWithFullReferenceName.get()) {
      if (item === tool) {
        return toolFullReferenceName;
      }
    }
    if (isToolSet(tool)) {
      return getToolSetFullReferenceName(tool);
    }
    return getToolFullReferenceName(tool, toolSet);
  }
  getFullReferenceNameMap() {
    const result = /* @__PURE__ */ new Map();
    for (const [item, toolFullReferenceName] of this.toolsWithFullReferenceName.get()) {
      result.set(item, toolFullReferenceName);
    }
    return result;
  }
};
LanguageModelToolsService.githubMCPServerAliases = ["github/github-mcp-server", "io.github.github/github-mcp-server", "github-mcp-server"];
LanguageModelToolsService.playwrightMCPServerAliases = ["microsoft/playwright-mcp", "com.microsoft/playwright-mcp"];
LanguageModelToolsService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IExtensionService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IAccessibilityService),
  __decorateParam(9, IAccessibilitySignalService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, ILanguageModelToolsConfirmationService),
  __decorateParam(12, ICommandService),
  __decorateParam(13, IChatWidgetService),
  __decorateParam(14, IToolResultCompressor),
  __decorateParam(15, IChatToolRiskAssessmentService)
], LanguageModelToolsService);
function getToolFullReferenceName(tool, toolSet) {
  const toolName = tool.toolReferenceName ?? tool.displayName;
  if (toolSet) {
    return `${toolSet.referenceName}/${toolName}`;
  } else if (tool.source.type === "extension") {
    return `${tool.source.extensionId.value.toLowerCase()}/${toolName}`;
  }
  return toolName;
}
function getToolSetFullReferenceName(toolSet) {
  if (toolSet.source.type === "mcp") {
    return `${toolSet.referenceName}/*`;
  }
  return toolSet.referenceName;
}
export {
  AutoApproveStorageKeys,
  LanguageModelToolsService,
  globalAutoApproveDescription
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBhc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZW5jb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgYXJyYXlFcXVhbHNDIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlTWFya2Rvd25Db21tYW5kTGluaywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGdldE1lZGlhTWltZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBvYnNlcnZhYmxlRnJvbUV2ZW50T3B0cywgT2JzZXJ2YWJsZVNldCwgb2JzZXJ2YWJsZVNpZ25hbCwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVNpZ25hbCwgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgdHlwZSB7IExhbmd1YWdlTW9kZWxUb29sSW52b2tlZENsYXNzaWZpY2F0aW9uLCBMYW5ndWFnZU1vZGVsVG9vbEludm9rZWRFdmVudCwgTGFuZ3VhZ2VNb2RlbFRvb2xUZWxlbWV0cnlDbGFzc2lmaWNhdGlvbiwgTGFuZ3VhZ2VNb2RlbFRvb2xUZWxlbWV0cnlEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi9sYW5ndWFnZU1vZGVsVG9vbFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCAqIGFzIEpTT05Db250cmlidXRpb25SZWdpc3RyeSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFRvb2xSZWZlcmVuY2VFbnRyeSwgdG9Ub29sU2V0VmFyaWFibGVFbnRyeSwgdG9Ub29sVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElWYXJpYWJsZVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgQ29uZmlybWVkUmVhc29uLCBJQ2hhdFNlcnZpY2UsIElDaGF0VG9vbEludm9jYXRpb24sIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiwgaXNBdXRvQXBwcm92ZUxldmVsLCBpc0F1dG9waWxvdExldmVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBsb2NhbENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwsIElDaGF0UmVxdWVzdE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFRvb2xJbnZvY2F0aW9uLmpzJztcbmltcG9ydCB7IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkLCBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBIb29rVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va1R5cGVzLmpzJztcbmltcG9ydCB7IENvcGlsb3RDaGF0U2V0dGluZ0lkLCBDb3BpbG90VG9vbElkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2NvcGlsb3RUb29sSWRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVybWluYWxUb29sSWQgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvdGVybWluYWxUb29sSWRzLmpzJztcbmltcG9ydCB7IENvdW50VG9rZW5zQ2FsbGJhY2ssIGNyZWF0ZVRvb2xTY2hlbWFVcmksIElCZWdpblRvb2xDYWxsT3B0aW9ucywgSUV4dGVybmFsUHJlVG9vbFVzZUhvb2tSZXN1bHQsIElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgaXNUb29sU2V0LCBJVG9vbERhdGEsIElUb29sSW1wbCwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbEludm9rZWRFdmVudCwgSVRvb2xSZXN1bHQsIElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzLCBJVG9vbFNldCwgU3BlY2VkVG9vbEFsaWFzZXMsIHN0cmluZ2lmeVByb21wdFRzeFBhcnQsIFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCwgVG9vbERhdGFTb3VyY2UsIFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLCB0b29sTWF0Y2hlc01vZGVsLCBUb29sU2V0LCBUb29sU2V0Rm9yTW9kZWwsIFZTQ29kZVRvb2xSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVG9vbFJlc3VsdENvbXByZXNzb3IgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvdG9vbFJlc3VsdENvbXByZXNzb3IuanMnO1xuaW1wb3J0IHsgZ2V0VG9vbENvbmZpcm1hdGlvbkFsZXJ0IH0gZnJvbSAnLi4vYWNjZXNzaWJpbGl0eS9jaGF0QWNjZXNzaWJpbGl0eVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLCBUb29sUmlza0xldmVsIH0gZnJvbSAnLi9jaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZS5qcyc7XG5cbmNvbnN0IGpzb25TY2hlbWFSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPEpTT05Db250cmlidXRpb25SZWdpc3RyeS5JSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09OQ29udHJpYnV0aW9uUmVnaXN0cnkuRXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblxuaW50ZXJmYWNlIElUb29sRW50cnkge1xuXHRkYXRhOiBJVG9vbERhdGE7XG5cdGltcGw/OiBJVG9vbEltcGw7XG59XG5cbmludGVyZmFjZSBJVHJhY2tlZENhbGwge1xuXHRzdG9yZTogSURpc3Bvc2FibGU7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEF1dG9BcHByb3ZlU3RvcmFnZUtleXMge1xuXHRHbG9iYWxBdXRvQXBwcm92ZU9wdEluID0gJ2NoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlLm9wdEluJ1xufVxuXG5jb25zdCBTa2lwQXV0b0FwcHJvdmVDb25maXJtYXRpb25LZXkgPSAndnNjb2RlLmNoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlLnRlc3RNb2RlJztcblxuLyoqXG4gKiBNYXJrcyBhIHtAbGluayBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkfSBkZWNpc2lvbiB0aGF0IGNhbWUgZnJvbSB0aGUgc2Vzc2lvblxuICogYXV0by1hcHByb3ZpbmcgZXZlcnl0aGluZywgcmF0aGVyIHRoYW4gYSBwZXItdG9vbCBzZXR0aW5nIG9yIGFuIGV4cGxpY2l0IHVzZXIgYWN0aW9uLiBTaGFyZWQgc29cbiAqIGBzaG91bGRBdXRvQ29uZmlybWAsIHRoZSBBdXRvcGlsb3QgcmlzayBnYXRlLCBhbmQgYXBwcm92YWwgdGVsZW1ldHJ5IHVzZSB0aGUgc2FtZSBzdHJpbmcuXG4gKi9cbmNvbnN0IGF1dG9BcHByb3ZlQWxsUmVhc29uID0gJ2F1dG8tYXBwcm92ZS1hbGwnO1xuXG4vLyBUaGlzIHRvb2wgd2lsbCBhbHdheXMgcmVxdWlyZSB1c2VyIGNvbmZpcm1hdGlvbiBldmVuIGluIGF1dG8gYXBwcm92YWwgbW9kZS5cbi8vIFVzZXJzIGNhbm5vdCBhdXRvIGFwcHJvdmUgdGhpcyB0b29sIHZpYSBzZXR0aW5ncyBlaXRoZXIsIGFzIHRoaXMgaXMgYSB0b29sIHVzZWQgYmVmb3JlIHRoZSBhZ2VudGljIGxvb3AuXG5jb25zdCB0b29sSWRzVGhhdENhbm5vdEJlQXV0b0FwcHJvdmVkID0gbmV3IFNldChbXG5cdCd2c2NvZGVfZ2V0X2NvbmZpcm1hdGlvbl93aXRoX29wdGlvbnMnLFxuXHQndnNjb2RlX2dldF9tb2RpZmllZF9maWxlc19jb25maXJtYXRpb24nLFxuXSk7XG5cbi8vIEZldGNoIHVzZXMgdHdvIHRvb2xzOiB0aGUgbW9kZWwtZmFjaW5nICdjb3BpbG90X2ZldGNoV2ViUGFnZScgYW5kIHRoZSBpbnRlcm5hbFxuLy8gJ3ZzY29kZV9mZXRjaFdlYlBhZ2VfaW50ZXJuYWwnIGl0IGRlbGVnYXRlcyB0by4gQm90aCBhdXRvLWFwcHJvdmUgdGhlbXNlbHZlcywgc28gdGhlIEF1dG9waWxvdFxuLy8gcmlzayBnYXRlIGNsYXNzaWZpZXMgdGhlbSB0byBjYXRjaCBkYW5nZXJvdXMgZmV0Y2hlcyAobGVha2luZyBzZWNyZXRzIHRvIGFuIGF0dGFja2VyIFVSTCxcbi8vIGhpdHRpbmcgaW50ZXJuYWwgaG9zdHMpLlxuY29uc3QgZmV0Y2hXZWJQYWdlVG9vbElkcyA9IG5ldyBTZXQoW1xuXHQnY29waWxvdF9mZXRjaFdlYlBhZ2UnLFxuXHQndnNjb2RlX2ZldGNoV2ViUGFnZV9pbnRlcm5hbCcsXG5dKTtcblxuZXhwb3J0IGNvbnN0IGdsb2JhbEF1dG9BcHByb3ZlRGVzY3JpcHRpb24gPSBsb2NhbGl6ZTIoXG5cdHtcblx0XHRrZXk6ICdhdXRvQXBwcm92ZTMubWFya2Rvd24nLFxuXHRcdGNvbW1lbnQ6IFtcblx0XHRcdCd7TG9ja2VkPVxcJ10oaHR0cHM6Ly9naXRodWIuY29tL2ZlYXR1cmVzL2NvZGVzcGFjZXMpXFwnfScsXG5cdFx0XHQne0xvY2tlZD1cXCddKGh0dHBzOi8vbWFya2V0cGxhY2UudmlzdWFsc3R1ZGlvLmNvbS9pdGVtcz9pdGVtTmFtZT1tcy12c2NvZGUtcmVtb3RlLnJlbW90ZS1jb250YWluZXJzKVxcJ30nLFxuXHRcdFx0J3tMb2NrZWQ9XFwnXShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2NvcGlsb3Qvc2VjdXJpdHkpXFwnfScsXG5cdFx0XHQne0xvY2tlZD1cXCcqKlxcJ30nLFxuXHRcdFx0J3tMb2NrZWQ9XFwnW2BjaGF0LmF1dG9SZXBseWBdKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3M/JTVCJTIyY2hhdC5hdXRvUmVwbHklMjIlNUQpXFwnfScsXG5cdFx0XVxuXHR9LFxuXHQnR2xvYmFsIGF1dG8gYXBwcm92ZSBhbHNvIGtub3duIGFzIFwiWU9MTyBtb2RlXCIgZGlzYWJsZXMgbWFudWFsIGFwcHJvdmFsIGNvbXBsZXRlbHkgZm9yIF9hbGwgdG9vbHMgaW4gYWxsIHdvcmtzcGFjZXNfLCBhbGxvd2luZyB0aGUgYWdlbnQgdG8gYWN0IGZ1bGx5IGF1dG9ub21vdXNseS4gVGhpcyBpcyBleHRyZW1lbHkgZGFuZ2Vyb3VzIGFuZCBpcyAqbmV2ZXIqIHJlY29tbWVuZGVkLCBldmVuIGNvbnRhaW5lcml6ZWQgZW52aXJvbm1lbnRzIGxpa2UgW0NvZGVzcGFjZXNdKGh0dHBzOi8vZ2l0aHViLmNvbS9mZWF0dXJlcy9jb2Rlc3BhY2VzKSBhbmQgW0RldiBDb250YWluZXJzXShodHRwczovL21hcmtldHBsYWNlLnZpc3VhbHN0dWRpby5jb20vaXRlbXM/aXRlbU5hbWU9bXMtdnNjb2RlLXJlbW90ZS5yZW1vdGUtY29udGFpbmVycykgaGF2ZSB1c2VyIGtleXMgZm9yd2FyZGVkIGludG8gdGhlIGNvbnRhaW5lciB0aGF0IGNvdWxkIGJlIGNvbXByb21pc2VkLlxcblxcbioqVGhpcyBmZWF0dXJlIGRpc2FibGVzIFtjcml0aWNhbCBzZWN1cml0eSBwcm90ZWN0aW9uc10oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9jb3BpbG90L3NlY3VyaXR5KSBhbmQgbWFrZXMgaXQgbXVjaCBlYXNpZXIgZm9yIGFuIGF0dGFja2VyIHRvIGNvbXByb21pc2UgdGhlIG1hY2hpbmUuKipcXG5cXG5Ob3RlOiBUaGlzIHNldHRpbmcgb25seSBjb250cm9scyB0b29sIGFwcHJvdmFsIGFuZCBkb2VzIG5vdCBwcmV2ZW50IHRoZSBhZ2VudCBmcm9tIGFza2luZyBxdWVzdGlvbnMuIFRvIGF1dG9tYXRpY2FsbHkgYW5zd2VyIGFnZW50IHF1ZXN0aW9ucywgdXNlIHRoZSBbYGNoYXQuYXV0b1JlcGx5YF0oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncz8lNUIlMjJjaGF0LmF1dG9SZXBseSUyMiU1RCkgc2V0dGluZy4nXG4pO1xuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdnNjb2RlVG9vbFNldDogVG9vbFNldDtcblx0cmVhZG9ubHkgZXhlY3V0ZVRvb2xTZXQ6IFRvb2xTZXQ7XG5cdHJlYWRvbmx5IHJlYWRUb29sU2V0OiBUb29sU2V0O1xuXHRyZWFkb25seSBhZ2VudFRvb2xTZXQ6IFRvb2xTZXQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUb29scyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRvb2xzID0gdGhpcy5fb25EaWRDaGFuZ2VUb29scy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQcmVwYXJlVG9vbENhbGxCZWNvbWVVbnJlc3BvbnNpdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHNlc3Npb25SZXNvdXJjZTogVVJJOyB0b29sRGF0YTogSVRvb2xEYXRhIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFByZXBhcmVUb29sQ2FsbEJlY29tZVVucmVzcG9uc2l2ZSA9IHRoaXMuX29uRGlkUHJlcGFyZVRvb2xDYWxsQmVjb21lVW5yZXNwb25zaXZlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEludm9rZVRvb2wgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVG9vbEludm9rZWRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSW52b2tlVG9vbCA9IHRoaXMuX29uRGlkSW52b2tlVG9vbC5ldmVudDtcblxuXHQvKiogVGhyb3R0bGUgdG9vbHMgdXBkYXRlcyBiZWNhdXNlIGl0IHNlbmRzIGFsbCB0b29scyBhbmQgcnVucyBvbiBjb250ZXh0IGtleSB1cGRhdGVzICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVG9vbHNTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVRvb2xzLmZpcmUoKSwgNzUwKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xzID0gbmV3IE1hcDxzdHJpbmcsIElUb29sRW50cnk+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xDb250ZXh0S2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhUb29sc0NvdW50OiBJQ29udGV4dEtleTxudW1iZXI+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhbGxzQnlSZXF1ZXN0SWQgPSBuZXcgTWFwPHN0cmluZywgSVRyYWNrZWRDYWxsW10+KCk7XG5cblx0LyoqIFBlbmRpbmcgdG9vbCBjYWxscyBpbiB0aGUgc3RyZWFtaW5nIHBoYXNlLCBrZXllZCBieSB0b29sQ2FsbElkICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdUb29sQ2FsbHMgPSBuZXcgTWFwPHN0cmluZywgQ2hhdFRvb2xJbnZvY2F0aW9uPigpO1xuXG5cdC8qKiBEZWR1cGxpY2F0ZXMgX2NoZWNrR2xvYmFsQXV0b0FwcHJvdmUgY2FsbHMgd2l0aGluIHRoaXMgd2luZG93ICovXG5cdHByaXZhdGUgX3BlbmRpbmdHbG9iYWxBdXRvQXBwcm92ZUNoZWNrOiBQcm9taXNlPGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzQWdlbnRNb2RlRW5hYmxlZDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlybWF0aW9uU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASVRvb2xSZXN1bHRDb21wcmVzc29yIHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xSZXN1bHRDb21wcmVzc29yOiBJVG9vbFJlc3VsdENvbXByZXNzb3IsXG5cdFx0QElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yaXNrQXNzZXNzbWVudFNlcnZpY2U6IElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2lzQWdlbnRNb2RlRW5hYmxlZCA9IG9ic2VydmFibGVDb25maWdWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWQsIHRydWUsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKHRoaXMuX3Rvb2xDb250ZXh0S2V5cykpIHtcblx0XHRcdFx0Ly8gTm90IHdvcnRoIGl0IHRvIGNvbXB1dGUgYSBkZWx0YSBoZXJlIHVubGVzcyB3ZSBoYXZlIG1hbnkgdG9vbHMgY2hhbmdpbmcgb2Z0ZW5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUb29sc1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkV4dGVuc2lvblRvb2xzRW5hYmxlZCkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWQpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ29waWxvdENoYXRTZXR0aW5nSWQuR3B0NTVSZWFkRmlsZVRvb2xFbmFibGVkKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRvb2xzU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xlYXIgb3V0IHdhcm5pbmcgYWNjZXB0ZWQgc3RhdGUgaWYgdGhlIHNldHRpbmcgaXMgZGlzYWJsZWRcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IHtcblx0XHRcdGlmICghZSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKSkge1xuXHRcdFx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmUpICE9PSB0cnVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEF1dG9BcHByb3ZlU3RvcmFnZUtleXMuR2xvYmFsQXV0b0FwcHJvdmVPcHRJbiwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2N0eFRvb2xzQ291bnQgPSBDaGF0Q29udGV4dEtleXMuVG9vbHMudG9vbHNDb3VudC5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIENyZWF0ZSB0aGUgaW50ZXJuYWwgVlMgQ29kZSB0b29sIHNldFxuXHRcdHRoaXMudnNjb2RlVG9vbFNldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlVG9vbFNldChcblx0XHRcdFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0J3ZzY29kZScsXG5cdFx0XHRWU0NvZGVUb29sUmVmZXJlbmNlLnZzY29kZSxcblx0XHRcdHtcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnZzY29kZS5pZCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29waWxvdC50b29sU2V0LnZzY29kZS5kZXNjcmlwdGlvbicsICdVc2UgVlMgQ29kZSBmZWF0dXJlcycpLFxuXHRcdFx0XHRkZXByZWNhdGVkOiB0cnVlLFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBpbnRlcm5hbCBFeGVjdXRlIHRvb2wgc2V0XG5cdFx0dGhpcy5leGVjdXRlVG9vbFNldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlVG9vbFNldChcblx0XHRcdFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0J2V4ZWN1dGUnLFxuXHRcdFx0U3BlY2VkVG9vbEFsaWFzZXMuZXhlY3V0ZSxcblx0XHRcdHtcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnRlcm1pbmFsLmlkKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90LnRvb2xTZXQuZXhlY3V0ZS5kZXNjcmlwdGlvbicsICdFeGVjdXRlIGNvZGUgYW5kIGFwcGxpY2F0aW9ucyBvbiB5b3VyIG1hY2hpbmUnKSxcblx0XHRcdFx0ZGVwcmVjYXRlZDogdHJ1ZSxcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdC8vIENyZWF0ZSB0aGUgaW50ZXJuYWwgUmVhZCB0b29sIHNldFxuXHRcdHRoaXMucmVhZFRvb2xTZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdCdyZWFkJyxcblx0XHRcdFNwZWNlZFRvb2xBbGlhc2VzLnJlYWQsXG5cdFx0XHR7XG5cdFx0XHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5ib29rLmlkKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90LnRvb2xTZXQucmVhZC5kZXNjcmlwdGlvbicsICdSZWFkIGZpbGVzIGluIHlvdXIgd29ya3NwYWNlJyksXG5cdFx0XHRcdGRlcHJlY2F0ZWQ6IHRydWUsXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHQvLyBDcmVhdGUgdGhlIGludGVybmFsIEFnZW50IHRvb2wgc2V0XG5cdFx0dGhpcy5hZ2VudFRvb2xTZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdCdhZ2VudCcsXG5cdFx0XHRTcGVjZWRUb29sQWxpYXNlcy5hZ2VudCxcblx0XHRcdHtcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmFnZW50LmlkKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90LnRvb2xTZXQuYWdlbnQuZGVzY3JpcHRpb24nLCAnRGVsZWdhdGUgdGFza3MgdG8gb3RoZXIgYWdlbnRzJyksXG5cdFx0XHRcdGRlcHJlY2F0ZWQ6IHRydWUsXG5cdFx0XHR9XG5cdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIGlzVG9vbEVuYWJsZWRGb3JNb2RlbCh0b29sRGF0YTogSVRvb2xEYXRhLCBtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIXRvb2xNYXRjaGVzTW9kZWwodG9vbERhdGEsIG1vZGVsKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0b29sRGF0YS5pZCA9PT0gQ29waWxvdFRvb2xJZC5SZWFkRmlsZSAmJiBtb2RlbD8uZmFtaWx5LnN0YXJ0c1dpdGgoJ2dwdC01LjUnKSAmJiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDb3BpbG90Q2hhdFNldHRpbmdJZC5HcHQ1NVJlYWRGaWxlVG9vbEVuYWJsZWQpID09PSBmYWxzZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgaWYgdGhlIGdpdmVuIHRvb2wgb3IgdG9vbHNldCBpcyBwZXJtaXR0ZWQgaW4gdGhlIGN1cnJlbnQgY29udGV4dC5cblx0ICogV2hlbiBhZ2VudCBtb2RlIGlzIGVuYWJsZWQsIGFsbCB0b29scyBhcmUgcGVybWl0dGVkIChubyByZXN0cmljdGlvbilcblx0ICogV2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkIG9ubHkgYSBzdWJzZXQgb2YgcmVhZC1vbmx5IHRvb2xzIGFyZSBwZXJtaXR0ZWQgaW4gYWdlbnRpYy1sb29wIGNvbnRleHRzLlxuXHQgKi9cblx0cHJpdmF0ZSBpc1Blcm1pdHRlZCh0b29sT3JUb29sU2V0OiBJVG9vbERhdGEgfCBUb29sU2V0LCByZWFkZXI/OiBJUmVhZGVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWdlbnRNb2RlRW5hYmxlZCA9IHRoaXMuX2lzQWdlbnRNb2RlRW5hYmxlZC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKGFnZW50TW9kZUVuYWJsZWQgIT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBJbnRlcm5hbCB0b29scyB0aGF0IGV4cGxpY2l0bHkgY2Fubm90IGJlIHJlZmVyZW5jZWQgaW4gcHJvbXB0cyBhcmUgYWx3YXlzIHBlcm1pdHRlZFxuXHRcdC8vIHNpbmNlIHRoZXkgYXJlIGluZnJhc3RydWN0dXJlIHRvb2xzIChlLmcuIGlubGluZV9jaGF0X2V4aXQpLCBub3QgdXNlci1mYWNpbmcgYWdlbnQgdG9vbHNcblx0XHRpZiAoIWlzVG9vbFNldCh0b29sT3JUb29sU2V0KSAmJiB0b29sT3JUb29sU2V0LmNhbkJlUmVmZXJlbmNlZEluUHJvbXB0ID09PSBmYWxzZSAmJiB0b29sT3JUb29sU2V0LnNvdXJjZS50eXBlID09PSAnaW50ZXJuYWwnKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBwZXJtaXR0ZWRJbnRlcm5hbFRvb2xTZXRJZHMgPSBbU3BlY2VkVG9vbEFsaWFzZXMucmVhZCwgU3BlY2VkVG9vbEFsaWFzZXMuc2VhcmNoLCBTcGVjZWRUb29sQWxpYXNlcy53ZWJdO1xuXHRcdGlmIChpc1Rvb2xTZXQodG9vbE9yVG9vbFNldCkpIHtcblx0XHRcdGNvbnN0IHBlcm1pdHRlZCA9IHRvb2xPclRvb2xTZXQuc291cmNlLnR5cGUgPT09ICdpbnRlcm5hbCcgJiYgcGVybWl0dGVkSW50ZXJuYWxUb29sU2V0SWRzLmluY2x1ZGVzKHRvb2xPclRvb2xTZXQucmVmZXJlbmNlTmFtZSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI2lzUGVybWl0dGVkOiBUb29sU2V0ICR7dG9vbE9yVG9vbFNldC5pZH0gKCR7dG9vbE9yVG9vbFNldC5yZWZlcmVuY2VOYW1lfSkgcGVybWl0dGVkPSR7cGVybWl0dGVkfWApO1xuXHRcdFx0cmV0dXJuIHBlcm1pdHRlZDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB0b29sU2V0IG9mIHRoaXMuX3Rvb2xTZXRzKSB7XG5cdFx0XHRpZiAodG9vbFNldC5zb3VyY2UudHlwZSA9PT0gJ2ludGVybmFsJyAmJiBwZXJtaXR0ZWRJbnRlcm5hbFRvb2xTZXRJZHMuaW5jbHVkZXModG9vbFNldC5yZWZlcmVuY2VOYW1lKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG1lbWJlclRvb2wgb2YgdG9vbFNldC5nZXRUb29scygpKSB7XG5cdFx0XHRcdFx0aWYgKG1lbWJlclRvb2wuaWQgPT09IHRvb2xPclRvb2xTZXQuaWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UjaXNQZXJtaXR0ZWQ6IFRvb2wgJHt0b29sT3JUb29sU2V0LmlkfSAoJHt0b29sT3JUb29sU2V0LnRvb2xSZWZlcmVuY2VOYW1lfSkgcGVybWl0dGVkPXRydWUgKG1lbWJlciBvZiAke3Rvb2xTZXQucmVmZXJlbmNlTmFtZX0pYCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTcGVjaWFsIGNhc2UgZm9yICd2c2NvZGVfZmV0Y2hXZWJQYWdlX2ludGVybmFsJywgd2hpY2ggaXMgYWxsb3dlZCBpZiB3ZSBhbGxvdyAnd2ViJyB0b29sc1xuXHRcdC8vIEZldGNoIGlzIGltcGxlbWVudGVkIHdpdGggdHdvIHRvb2xzLCB0aGlzIG9uZSBhbmQgJ2NvcGlsb3RfZmV0Y2hXZWJQYWdlJ1xuXHRcdGlmICh0b29sT3JUb29sU2V0LmlkID09PSAndnNjb2RlX2ZldGNoV2ViUGFnZV9pbnRlcm5hbCcgJiYgcGVybWl0dGVkSW50ZXJuYWxUb29sU2V0SWRzLmluY2x1ZGVzKFNwZWNlZFRvb2xBbGlhc2VzLndlYikpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UjaXNQZXJtaXR0ZWQ6IFRvb2wgJHt0b29sT3JUb29sU2V0LmlkfSAoJHt0b29sT3JUb29sU2V0LnRvb2xSZWZlcmVuY2VOYW1lfSkgcGVybWl0dGVkPXRydWUgKHNwZWNpYWwgY2FzZSlgKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UjaXNQZXJtaXR0ZWQ6IFRvb2wgJHt0b29sT3JUb29sU2V0LmlkfSAoJHt0b29sT3JUb29sU2V0LnRvb2xSZWZlcmVuY2VOYW1lfSkgcGVybWl0dGVkPWZhbHNlYCk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9jYWxsc0J5UmVxdWVzdElkLmZvckVhY2goY2FsbHMgPT4gY2FsbHMuZm9yRWFjaChjYWxsID0+IGNhbGwuc3RvcmUuZGlzcG9zZSgpKSk7XG5cdFx0dGhpcy5fcGVuZGluZ1Rvb2xDYWxscy5jbGVhcigpO1xuXHRcdHRoaXMuX2N0eFRvb2xzQ291bnQucmVzZXQoKTtcblx0fVxuXG5cdHJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGE6IElUb29sRGF0YSk6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5fdG9vbHMuaGFzKHRvb2xEYXRhLmlkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUb29sIFwiJHt0b29sRGF0YS5pZH1cIiBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQuYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdG9vbHMuc2V0KHRvb2xEYXRhLmlkLCB7IGRhdGE6IHRvb2xEYXRhIH0pO1xuXHRcdHRoaXMuX2N0eFRvb2xzQ291bnQuc2V0KHRoaXMuX3Rvb2xzLnNpemUpO1xuXHRcdGlmICghdGhpcy5fb25EaWRDaGFuZ2VUb29sc1NjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRvb2xzU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXG5cdFx0dG9vbERhdGEud2hlbj8ua2V5cygpLmZvckVhY2goa2V5ID0+IHRoaXMuX3Rvb2xDb250ZXh0S2V5cy5hZGQoa2V5KSk7XG5cblx0XHRsZXQgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodG9vbERhdGEuaW5wdXRTY2hlbWEpIHtcblx0XHRcdHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3Qgc2NoZW1hVXJsID0gY3JlYXRlVG9vbFNjaGVtYVVyaSh0b29sRGF0YS5pZCkudG9TdHJpbmcoKTtcblx0XHRcdGpzb25TY2hlbWFSZWdpc3RyeS5yZWdpc3RlclNjaGVtYShzY2hlbWFVcmwsIHRvb2xEYXRhLmlucHV0U2NoZW1hLCBzdG9yZSk7XG5cdFx0XHRzdG9yZS5hZGQoanNvblNjaGVtYVJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hQXNzb2NpYXRpb24oc2NoZW1hVXJsLCBgL2xtL3Rvb2wvJHt0b29sRGF0YS5pZH0vdG9vbF9pbnB1dC5qc29uYCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0c3RvcmU/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3Rvb2xzLmRlbGV0ZSh0b29sRGF0YS5pZCk7XG5cdFx0XHR0aGlzLl9jdHhUb29sc0NvdW50LnNldCh0aGlzLl90b29scy5zaXplKTtcblx0XHRcdHRoaXMuX3JlZnJlc2hBbGxUb29sQ29udGV4dEtleXMoKTtcblx0XHRcdGlmICghdGhpcy5fb25EaWRDaGFuZ2VUb29sc1NjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVG9vbHNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGZsdXNoVG9vbFVwZGF0ZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUb29sc1NjaGVkdWxlci5mbHVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaEFsbFRvb2xDb250ZXh0S2V5cygpIHtcblx0XHR0aGlzLl90b29sQ29udGV4dEtleXMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgdGhpcy5fdG9vbHMudmFsdWVzKCkpIHtcblx0XHRcdHRvb2wuZGF0YS53aGVuPy5rZXlzKCkuZm9yRWFjaChrZXkgPT4gdGhpcy5fdG9vbENvbnRleHRLZXlzLmFkZChrZXkpKTtcblx0XHR9XG5cdH1cblxuXHRyZWdpc3RlclRvb2xJbXBsZW1lbnRhdGlvbihpZDogc3RyaW5nLCB0b29sOiBJVG9vbEltcGwpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl90b29scy5nZXQoaWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVG9vbCBcIiR7aWR9XCIgd2FzIG5vdCBjb250cmlidXRlZC5gKTtcblx0XHR9XG5cblx0XHRpZiAoZW50cnkuaW1wbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUb29sIFwiJHtpZH1cIiBhbHJlYWR5IGhhcyBhbiBpbXBsZW1lbnRhdGlvbi5gKTtcblx0XHR9XG5cblx0XHRlbnRyeS5pbXBsID0gdG9vbDtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGVudHJ5LmltcGwgPSB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdH1cblxuXHRyZWdpc3RlclRvb2wodG9vbERhdGE6IElUb29sRGF0YSwgdG9vbDogSVRvb2xJbXBsKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiBjb21iaW5lZERpc3Bvc2FibGUoXG5cdFx0XHR0aGlzLnJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGEpLFxuXHRcdFx0dGhpcy5yZWdpc3RlclRvb2xJbXBsZW1lbnRhdGlvbih0b29sRGF0YS5pZCwgdG9vbClcblx0XHQpO1xuXHR9XG5cblx0Z2V0VG9vbHMobW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkKTogSXRlcmFibGU8SVRvb2xEYXRhPiB7XG5cdFx0Y29uc3QgdG9vbERhdGFzID0gSXRlcmFibGUubWFwKHRoaXMuX3Rvb2xzLnZhbHVlcygpLCBpID0+IGkuZGF0YSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uVG9vbHNFbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uRXh0ZW5zaW9uVG9vbHNFbmFibGVkKTtcblx0XHRyZXR1cm4gSXRlcmFibGUuZmlsdGVyKFxuXHRcdFx0dG9vbERhdGFzLFxuXHRcdFx0dG9vbERhdGEgPT4ge1xuXHRcdFx0XHRjb25zdCBzYXRpc2ZpZXNXaGVuQ2xhdXNlID0gIXRvb2xEYXRhLndoZW4gfHwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyh0b29sRGF0YS53aGVuKTtcblx0XHRcdFx0Y29uc3Qgc2F0aXNmaWVzRXh0ZXJuYWxUb29sQ2hlY2sgPSB0b29sRGF0YS5zb3VyY2UudHlwZSAhPT0gJ2V4dGVuc2lvbicgfHwgISFleHRlbnNpb25Ub29sc0VuYWJsZWQ7XG5cdFx0XHRcdGNvbnN0IHNhdGlzZmllc1Blcm1pdHRlZENoZWNrID0gdGhpcy5pc1Blcm1pdHRlZCh0b29sRGF0YSk7XG5cdFx0XHRcdGNvbnN0IHNhdGlzZmllc01vZGVsRmlsdGVyID0gdGhpcy5pc1Rvb2xFbmFibGVkRm9yTW9kZWwodG9vbERhdGEsIG1vZGVsKTtcblx0XHRcdFx0cmV0dXJuIHNhdGlzZmllc1doZW5DbGF1c2UgJiYgc2F0aXNmaWVzRXh0ZXJuYWxUb29sQ2hlY2sgJiYgc2F0aXNmaWVzUGVybWl0dGVkQ2hlY2sgJiYgc2F0aXNmaWVzTW9kZWxGaWx0ZXI7XG5cdFx0XHR9KTtcblx0fVxuXG5cdG9ic2VydmVUb29scyhtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJVG9vbERhdGFbXT4ge1xuXHRcdGNvbnN0IG1ldGEgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsKCdvYnNlcnZlVG9vbHNDb250ZXh0Jyk7XG5cdFx0XHRjb25zdCB0cmlnZ2VyID0gKCkgPT4gdHJhbnNhY3Rpb24odHggPT4gc2lnbmFsLnRyaWdnZXIodHgpKTtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQodGhpcy5vbkRpZENoYW5nZVRvb2xzKHRyaWdnZXIpKTtcblx0XHRcdHJldHVybiBzaWduYWw7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZGVyaXZlZE9wdHMoeyBlcXVhbHNGbjogYXJyYXlFcXVhbHNDKCkgfSwgcmVhZGVyID0+IHtcblx0XHRcdG1ldGEucmVhZChyZWFkZXIpLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuZ2V0VG9vbHMobW9kZWwpKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldEFsbFRvb2xzSW5jbHVkaW5nRGlzYWJsZWQoKTogSXRlcmFibGU8SVRvb2xEYXRhPiB7XG5cdFx0Y29uc3QgdG9vbERhdGFzID0gSXRlcmFibGUubWFwKHRoaXMuX3Rvb2xzLnZhbHVlcygpLCBpID0+IGkuZGF0YSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uVG9vbHNFbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uRXh0ZW5zaW9uVG9vbHNFbmFibGVkKTtcblx0XHRyZXR1cm4gSXRlcmFibGUuZmlsdGVyKFxuXHRcdFx0dG9vbERhdGFzLFxuXHRcdFx0dG9vbERhdGEgPT4ge1xuXHRcdFx0XHRjb25zdCBzYXRpc2ZpZXNFeHRlcm5hbFRvb2xDaGVjayA9IHRvb2xEYXRhLnNvdXJjZS50eXBlICE9PSAnZXh0ZW5zaW9uJyB8fCAhIWV4dGVuc2lvblRvb2xzRW5hYmxlZDtcblx0XHRcdFx0Y29uc3Qgc2F0aXNmaWVzUGVybWl0dGVkQ2hlY2sgPSB0aGlzLmlzUGVybWl0dGVkKHRvb2xEYXRhKTtcblx0XHRcdFx0cmV0dXJuIHNhdGlzZmllc0V4dGVybmFsVG9vbENoZWNrICYmIHNhdGlzZmllc1Blcm1pdHRlZENoZWNrO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRnZXRUb29sKGlkOiBzdHJpbmcpOiBJVG9vbERhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90b29scy5nZXQoaWQpPy5kYXRhO1xuXHR9XG5cblx0Z2V0VG9vbEJ5TmFtZShuYW1lOiBzdHJpbmcpOiBJVG9vbERhdGEgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgdG9vbCBvZiB0aGlzLmdldEFsbFRvb2xzSW5jbHVkaW5nRGlzYWJsZWQoKSkge1xuXHRcdFx0aWYgKHRvb2wudG9vbFJlZmVyZW5jZU5hbWUgPT09IG5hbWUpIHtcblx0XHRcdFx0cmV0dXJuIHRvb2w7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVQcmVUb29sVXNlRGVuaWFsKFxuXHRcdGR0bzogSVRvb2xJbnZvY2F0aW9uLFxuXHRcdGhvb2tSZXN1bHQ6IElFeHRlcm5hbFByZVRvb2xVc2VIb29rUmVzdWx0LFxuXHRcdHRvb2xEYXRhOiBJVG9vbERhdGEgfCB1bmRlZmluZWQsXG5cdFx0cGVuZGluZ0ludm9jYXRpb246IENoYXRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZCxcblx0XHRyZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZCxcblx0KTogSVRvb2xSZXN1bHQge1xuXHRcdGNvbnN0IGhvb2tSZWFzb24gPSBob29rUmVzdWx0LnBlcm1pc3Npb25EZWNpc2lvblJlYXNvbiA/PyBsb2NhbGl6ZSgnaG9va0RlbmllZE5vUmVhc29uJywgXCJIb29rIGRlbmllZCB0b29sIGV4ZWN1dGlvblwiKTtcblx0XHRjb25zdCByZWFzb24gPSBsb2NhbGl6ZSgnZGVuaWVkQnlQcmVUb29sVXNlSG9vaycsIFwiRGVuaWVkIGJ5IHswfSBob29rOiB7MX1cIiwgSG9va1R5cGUuUHJlVG9vbFVzZSwgaG9va1JlYXNvbik7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UjaW52b2tlVG9vbF0gVG9vbCAke2R0by50b29sSWR9IGRlbmllZCBieSBwcmVUb29sVXNlIGhvb2s6ICR7aG9va1JlYXNvbn1gKTtcblxuXHRcdGlmICh0b29sRGF0YSkge1xuXHRcdFx0aWYgKHBlbmRpbmdJbnZvY2F0aW9uKSB7XG5cdFx0XHRcdHBlbmRpbmdJbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbjtcblx0XHRcdFx0cGVuZGluZ0ludm9jYXRpb24uY2FuY2VsRnJvbVN0cmVhbWluZyhUb29sQ29uZmlybUtpbmQuRGVuaWVkLCByZWFzb24pO1xuXHRcdFx0fSBlbHNlIGlmIChyZXF1ZXN0KSB7XG5cdFx0XHRcdGNvbnN0IGNhbmNlbGxlZEludm9jYXRpb24gPSBDaGF0VG9vbEludm9jYXRpb24uY3JlYXRlQ2FuY2VsbGVkKFxuXHRcdFx0XHRcdHsgdG9vbENhbGxJZDogZHRvLmNhbGxJZCwgdG9vbElkOiBkdG8udG9vbElkLCB0b29sRGF0YSwgc3ViYWdlbnRJbnZvY2F0aW9uSWQ6IGR0by5zdWJBZ2VudEludm9jYXRpb25JZCwgY2hhdFJlcXVlc3RJZDogZHRvLmNoYXRSZXF1ZXN0SWQgfSxcblx0XHRcdFx0XHRkdG8ucGFyYW1ldGVycyxcblx0XHRcdFx0XHRUb29sQ29uZmlybUtpbmQuRGVuaWVkLFxuXHRcdFx0XHRcdHJlYXNvblxuXHRcdFx0XHQpO1xuXHRcdFx0XHRjYW5jZWxsZWRJbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbjtcblx0XHRcdFx0dGhpcy5fY2hhdFNlcnZpY2UuYXBwZW5kUHJvZ3Jlc3MocmVxdWVzdCwgY2FuY2VsbGVkSW52b2NhdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IGBUb29sIGV4ZWN1dGlvbiBkZW5pZWQ6ICR7aG9va1JlYXNvbn1gIH1dLFxuXHRcdFx0dG9vbFJlc3VsdEVycm9yOiBob29rUmVhc29uLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogVmFsaWRhdGUgdXBkYXRlZElucHV0IGZyb20gYSBwcmVUb29sVXNlIGhvb2sgYWdhaW5zdCB0aGUgdG9vbCdzIGlucHV0IHNjaGVtYVxuXHQgKiB1c2luZyB0aGUganNvbi52YWxpZGF0ZSBjb21tYW5kIGZyb20gdGhlIEpTT04gZXh0ZW5zaW9uLlxuXHQgKiBAcmV0dXJucyBBbiBlcnJvciBtZXNzYWdlIHN0cmluZyBpZiB2YWxpZGF0aW9uIGZhaWxzLCBvciB1bmRlZmluZWQgaWYgdmFsaWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF92YWxpZGF0ZVVwZGF0ZWRJbnB1dCh0b29sSWQ6IHN0cmluZywgdG9vbERhdGE6IElUb29sRGF0YSB8IHVuZGVmaW5lZCwgdXBkYXRlZElucHV0OiBvYmplY3QpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdG9vbERhdGE/LmlucHV0U2NoZW1hKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHR5cGUgSnNvbkRpYWdub3N0aWMgPSB7XG5cdFx0XHRtZXNzYWdlOiBzdHJpbmc7XG5cdFx0XHRyYW5nZTogeyBsaW5lOiBudW1iZXI7IGNoYXJhY3RlcjogbnVtYmVyIH1bXTtcblx0XHRcdHNldmVyaXR5OiBzdHJpbmc7XG5cdFx0XHRjb2RlPzogc3RyaW5nIHwgbnVtYmVyO1xuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2NoZW1hVXJpID0gY3JlYXRlVG9vbFNjaGVtYVVyaSh0b29sSWQpO1xuXHRcdFx0Y29uc3QgaW5wdXRKc29uID0gSlNPTi5zdHJpbmdpZnkodXBkYXRlZElucHV0KTtcblx0XHRcdGNvbnN0IGRpYWdub3N0aWNzID0gYXdhaXQgdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8SnNvbkRpYWdub3N0aWNbXT4oJ2pzb24udmFsaWRhdGUnLCBzY2hlbWFVcmksIGlucHV0SnNvbikgfHwgW107XG5cdFx0XHRpZiAoZGlhZ25vc3RpY3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gZGlhZ25vc3RpY3MubWFwKGQgPT4gZC5tZXNzYWdlKS5qb2luKCc7ICcpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIGpzb24gZXh0ZW5zaW9uIG1heSBub3QgYmUgYXZhaWxhYmxlOyBza2lwIHZhbGlkYXRpb25cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI192YWxpZGF0ZVVwZGF0ZWRJbnB1dF0ganNvbi52YWxpZGF0ZSBjb21tYW5kIGZhaWxlZCwgc2tpcHBpbmcgdmFsaWRhdGlvbjogJHt0b0Vycm9yTWVzc2FnZShlKX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgaW52b2tlVG9vbChkdG86IElUb29sSW52b2NhdGlvbiwgY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSNpbnZva2VUb29sXSBJbnZva2luZyB0b29sICR7ZHRvLnRvb2xJZH0gd2l0aCBwYXJhbWV0ZXJzICR7SlNPTi5zdHJpbmdpZnkoZHRvLnBhcmFtZXRlcnMpfWApO1xuXG5cdFx0Y29uc3QgdG9vbERhdGEgPSB0aGlzLl90b29scy5nZXQoZHRvLnRvb2xJZCk/LmRhdGE7XG5cdFx0bGV0IG1vZGVsOiBJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGxldCByZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZHRvLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0bW9kZWwgPSB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKGR0by5jb250ZXh0LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRyZXF1ZXN0ID0gbW9kZWw/LmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdFx0aWYgKHJlcXVlc3Q/LnJlc3BvbnNlPy5pc0NhbmNlbGVkIHx8IHJlcXVlc3Q/LnJlc3BvbnNlPy5pc0NvbXBsZXRlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI2ludm9rZVRvb2xdIElnbm9yaW5nIHRvb2wgJHtkdG8udG9vbElkfSBmb3IgY2FuY2VsbGVkL2NvbXBsZXRlIHJlcXVlc3QgJHtyZXF1ZXN0LmlkfWApO1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW5yaWNoIGNvbnRleHQgd2l0aCB3b3JraW5nIGRpcmVjdG9yeSBmcm9tIHRoZSBtb2RlbCBpZiBhdmFpbGFibGVcblx0XHRcdGlmIChtb2RlbD8ud29ya2luZ0RpcmVjdG9yeSAmJiAhZHRvLmNvbnRleHQud29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0XHRkdG8gPSB7IC4uLmR0bywgY29udGV4dDogeyAuLi5kdG8uY29udGV4dCwgd29ya2luZ0RpcmVjdG9yeTogbW9kZWwud29ya2luZ0RpcmVjdG9yeSB9IH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlcmUncyBhbiBleGlzdGluZyBwZW5kaW5nIHRvb2wgY2FsbCBmcm9tIHN0cmVhbWluZyBwaGFzZSBCRUZPUkUgaG9vayBjaGVja1xuXHRcdGxldCBwZW5kaW5nVG9vbENhbGxLZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgdG9vbEludm9jYXRpb246IENoYXRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fcGVuZGluZ1Rvb2xDYWxscy5oYXMoZHRvLmNhbGxJZCkpIHtcblx0XHRcdHBlbmRpbmdUb29sQ2FsbEtleSA9IGR0by5jYWxsSWQ7XG5cdFx0XHR0b29sSW52b2NhdGlvbiA9IHRoaXMuX3BlbmRpbmdUb29sQ2FsbHMuZ2V0KGR0by5jYWxsSWQpO1xuXHRcdH0gZWxzZSBpZiAoZHRvLmNoYXRTdHJlYW1Ub29sQ2FsbElkICYmIHRoaXMuX3BlbmRpbmdUb29sQ2FsbHMuaGFzKGR0by5jaGF0U3RyZWFtVG9vbENhbGxJZCkpIHtcblx0XHRcdHBlbmRpbmdUb29sQ2FsbEtleSA9IGR0by5jaGF0U3RyZWFtVG9vbENhbGxJZDtcblx0XHRcdHRvb2xJbnZvY2F0aW9uID0gdGhpcy5fcGVuZGluZ1Rvb2xDYWxscy5nZXQoZHRvLmNoYXRTdHJlYW1Ub29sQ2FsbElkKTtcblx0XHR9XG5cblx0XHRsZXQgcmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGR0by5jb250ZXh0ICYmIHJlcXVlc3QpIHtcblx0XHRcdHJlcXVlc3RJZCA9IHJlcXVlc3QuaWQ7XG5cdFx0XHRzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGlmICghdGhpcy5fY2FsbHNCeVJlcXVlc3RJZC5oYXMocmVxdWVzdElkKSkge1xuXHRcdFx0XHR0aGlzLl9jYWxsc0J5UmVxdWVzdElkLnNldChyZXF1ZXN0SWQsIFtdKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRyYWNrZWRDYWxsOiBJVHJhY2tlZENhbGwgPSB7IHN0b3JlIH07XG5cdFx0XHR0aGlzLl9jYWxsc0J5UmVxdWVzdElkLmdldChyZXF1ZXN0SWQpIS5wdXNoKHRyYWNrZWRDYWxsKTtcblxuXHRcdFx0Y29uc3Qgc291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0c291cmNlLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHR9KSk7XG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCgpID0+IHtcblx0XHRcdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aCh0b29sSW52b2NhdGlvbiwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuRGVuaWVkIH0pO1xuXHRcdFx0XHRzb3VyY2UuY2FuY2VsKCk7XG5cdFx0XHR9KSkpO1xuXHRcdFx0c3RvcmUuYWRkKHNvdXJjZS50b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgodG9vbEludm9jYXRpb24sIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkRlbmllZCB9KTtcblx0XHRcdH0pKTtcblx0XHRcdHRva2VuID0gc291cmNlLnRva2VuO1xuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBwcmVUb29sVXNlIGhvb2sgZGVuaWFsXG5cdFx0Y29uc3QgcHJlVG9vbFVzZUhvb2tSZXN1bHQgPSBkdG8ucHJlVG9vbFVzZVJlc3VsdDtcblx0XHRpZiAocHJlVG9vbFVzZUhvb2tSZXN1bHQ/LnBlcm1pc3Npb25EZWNpc2lvbiA9PT0gJ2RlbnknKSB7XG5cdFx0XHRjb25zdCBkZW5pYWxSZXN1bHQgPSB0aGlzLl9oYW5kbGVQcmVUb29sVXNlRGVuaWFsKGR0bywgcHJlVG9vbFVzZUhvb2tSZXN1bHQsIHRvb2xEYXRhLCB0b29sSW52b2NhdGlvbiwgcmVxdWVzdCk7XG5cdFx0XHRpZiAocGVuZGluZ1Rvb2xDYWxsS2V5KSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdUb29sQ2FsbHMuZGVsZXRlKHBlbmRpbmdUb29sQ2FsbEtleSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZGVuaWFsUmVzdWx0O1xuXHRcdH1cblxuXHRcdC8vIEFwcGx5IHVwZGF0ZWRJbnB1dCBmcm9tIHByZVRvb2xVc2UgaG9vayBpZiBwcm92aWRlZCwgYWZ0ZXIgdmFsaWRhdGluZyBhZ2FpbnN0IHRoZSB0b29sJ3MgaW5wdXQgc2NoZW1hXG5cdFx0aWYgKHByZVRvb2xVc2VIb29rUmVzdWx0Py51cGRhdGVkSW5wdXQpIHtcblx0XHRcdGNvbnN0IHZhbGlkYXRpb25FcnJvciA9IGF3YWl0IHRoaXMuX3ZhbGlkYXRlVXBkYXRlZElucHV0KGR0by50b29sSWQsIHRvb2xEYXRhLCBwcmVUb29sVXNlSG9va1Jlc3VsdC51cGRhdGVkSW5wdXQpO1xuXHRcdFx0aWYgKHZhbGlkYXRpb25FcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI2ludm9rZVRvb2xdIFRvb2wgJHtkdG8udG9vbElkfSB1cGRhdGVkSW5wdXQgZnJvbSBwcmVUb29sVXNlIGhvb2sgZmFpbGVkIHNjaGVtYSB2YWxpZGF0aW9uOiAke3ZhbGlkYXRpb25FcnJvcn1gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI2ludm9rZVRvb2xdIFRvb2wgJHtkdG8udG9vbElkfSBpbnB1dCBtb2RpZmllZCBieSBwcmVUb29sVXNlIGhvb2tgKTtcblx0XHRcdFx0ZHRvLnBhcmFtZXRlcnMgPSBwcmVUb29sVXNlSG9va1Jlc3VsdC51cGRhdGVkSW5wdXQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmlyZSB0aGUgZXZlbnQgdG8gbm90aWZ5IGxpc3RlbmVycyB0aGF0IGEgdG9vbCBpcyBiZWluZyBpbnZva2VkXG5cdFx0dGhpcy5fb25EaWRJbnZva2VUb29sLmZpcmUoe1xuXHRcdFx0dG9vbElkOiBkdG8udG9vbElkLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBkdG8uY29udGV4dD8uc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0cmVxdWVzdElkOiBkdG8uY2hhdFJlcXVlc3RJZCxcblx0XHRcdHN1YmFnZW50SW52b2NhdGlvbklkOiBkdG8uc3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0fSk7XG5cblx0XHQvLyBXaGVuIGludm9raW5nIGEgdG9vbCwgZG9uJ3QgdmFsaWRhdGUgdGhlIFwid2hlblwiIGNsYXVzZS4gQW4gZXh0ZW5zaW9uIG1heSBoYXZlIGludm9rZWQgYSB0b29sIGp1c3QgYXMgaXQgd2FzIGJlY29taW5nIGRpc2FibGVkLCBhbmQganVzdCBsZXQgaXQgZ28gdGhyb3VnaCByYXRoZXIgdGhhbiB0aHJvdyBhbmQgYnJlYWsgdGhlIGNoYXQuXG5cdFx0bGV0IHRvb2wgPSB0aGlzLl90b29scy5nZXQoZHRvLnRvb2xJZCk7XG5cdFx0aWYgKCF0b29sKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRvb2wgJHtkdG8udG9vbElkfSB3YXMgbm90IGNvbnRyaWJ1dGVkYCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0b29sLmltcGwpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvbkxhbmd1YWdlTW9kZWxUb29sOiR7ZHRvLnRvb2xJZH1gKTtcblxuXHRcdFx0Ly8gRXh0ZW5zaW9uIHNob3VsZCBhY3RpdmF0ZSBhbmQgcmVnaXN0ZXIgdGhlIHRvb2wgaW1wbGVtZW50YXRpb25cblx0XHRcdHRvb2wgPSB0aGlzLl90b29scy5nZXQoZHRvLnRvb2xJZCk7XG5cdFx0XHRpZiAoIXRvb2w/LmltcGwpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUb29sICR7ZHRvLnRvb2xJZH0gZG9lcyBub3QgaGF2ZSBhbiBpbXBsZW1lbnRhdGlvbiByZWdpc3RlcmVkLmApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE5vdGU6IHBlbmRpbmcgaW52b2NhdGlvbiBsb29rdXAgd2FzIGFscmVhZHkgZG9uZSBhYm92ZSBmb3IgdGhlIGhvb2sgY2hlY2tcblx0XHRjb25zdCBoYWRQZW5kaW5nSW52b2NhdGlvbiA9ICEhdG9vbEludm9jYXRpb247XG5cdFx0aWYgKGhhZFBlbmRpbmdJbnZvY2F0aW9uICYmIHBlbmRpbmdUb29sQ2FsbEtleSkge1xuXHRcdFx0Ly8gUmVtb3ZlIGZyb20gcGVuZGluZyBzaW5jZSB3ZSdyZSBub3cgaW52b2tpbmcgaXRcblx0XHRcdHRoaXMuX3BlbmRpbmdUb29sQ2FsbHMuZGVsZXRlKHBlbmRpbmdUb29sQ2FsbEtleSk7XG5cdFx0fVxuXG5cdFx0bGV0IHRvb2xSZXN1bHQ6IElUb29sUmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBwcmVwYXJlVGltZVdhdGNoOiBTdG9wV2F0Y2ggfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGludm9jYXRpb25UaW1lV2F0Y2g6IFN0b3BXYXRjaCB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcHJlcGFyZWRJbnZvY2F0aW9uOiBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0aWYgKGR0by5jb250ZXh0KSB7XG5cdFx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRvb2wgY2FsbGVkIGZvciB1bmtub3duIGNoYXQgc2Vzc2lvbmApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFyZXF1ZXN0KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUb29sIGNhbGxlZCBmb3IgdW5rbm93biBjaGF0IHJlcXVlc3RgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkdG8ubW9kZWxJZCA9IHJlcXVlc3QubW9kZWxJZDtcblx0XHRcdFx0ZHRvLnVzZXJTZWxlY3RlZFRvb2xzID0gcmVxdWVzdC51c2VyU2VsZWN0ZWRUb29scyAmJiB7IC4uLnJlcXVlc3QudXNlclNlbGVjdGVkVG9vbHMgfTtcblxuXHRcdFx0XHRwcmVwYXJlVGltZVdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZSh0cnVlKTtcblx0XHRcdFx0cHJlcGFyZWRJbnZvY2F0aW9uID0gYXdhaXQgdGhpcy5wcmVwYXJlVG9vbEludm9jYXRpb25XaXRoSG9va1Jlc3VsdCh0b29sLCBkdG8sIHByZVRvb2xVc2VIb29rUmVzdWx0LCB0b2tlbik7XG5cdFx0XHRcdHByZXBhcmVUaW1lV2F0Y2guc3RvcCgpO1xuXG5cdFx0XHRcdGNvbnN0IHsgYXV0b0NvbmZpcm1lZDogcmVzb2x2ZWRBdXRvQ29uZmlybWVkLCBwcmVwYXJlZEludm9jYXRpb246IHVwZGF0ZWRQcmVwYXJlZEludm9jYXRpb24gfSA9IGF3YWl0IHRoaXMucmVzb2x2ZUF1dG9Db25maXJtRnJvbUhvb2socHJlVG9vbFVzZUhvb2tSZXN1bHQsIHRvb2wsIGR0bywgcHJlcGFyZWRJbnZvY2F0aW9uLCBkdG8uY29udGV4dD8uc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0cHJlcGFyZWRJbnZvY2F0aW9uID0gdXBkYXRlZFByZXBhcmVkSW52b2NhdGlvbjtcblxuXHRcdFx0XHQvLyBBIGNhbGxlciAoZS5nLiB0aGUgYWdlbnQgaG9zdCkgbWF5IGhhdmUgcmVzb2x2ZWQgYXV0by1hcHByb3ZhbFxuXHRcdFx0XHQvLyBvdXQtb2YtYmFuZC4gVHJlYXQgaXQgbGlrZSBhIGxvY2FsIGF1dG8tY29uZmlybWF0aW9uIHNvIHRoZVxuXHRcdFx0XHQvLyBpbnZvY2F0aW9uIG5ldmVyIGJyaWVmbHkgZW50ZXJzIGBXYWl0aW5nRm9yQ29uZmlybWF0aW9uYC4gQVxuXHRcdFx0XHQvLyBwcmVUb29sVXNlIGhvb2sgdGhhdCByZXR1cm5lZCBgYXNrYCBleHBsaWNpdGx5IGZvcmNlcyBhXG5cdFx0XHRcdC8vIGNvbmZpcm1hdGlvbiwgc28gbmV2ZXIgbGV0IGBwcmVBcHByb3ZlZGAgb3ZlcnJpZGUgaXQuXG5cdFx0XHRcdGNvbnN0IHByZVJlc29sdmVkQXV0b0NvbmZpcm1lZCA9IHJlc29sdmVkQXV0b0NvbmZpcm1lZFxuXHRcdFx0XHRcdD8/IChwcmVUb29sVXNlSG9va1Jlc3VsdD8ucGVybWlzc2lvbkRlY2lzaW9uID09PSAnYXNrJyA/IHVuZGVmaW5lZCA6IGR0by5wcmVBcHByb3ZlZCk7XG5cblx0XHRcdFx0Ly8gSW4gQXV0b3BpbG90LCBydW4gdGhlIHJpc2sgY2xhc3NpZmllciBvbiBhbiBhdXRvLWFwcHJvdmVkIGNhbGwgdGhhdCB3b3VsZFxuXHRcdFx0XHQvLyBvdGhlcndpc2Ugc2hvdyBhIGNvbmZpcm1hdGlvbi4gQSBcInJlZFwiIHJhdGluZyBza2lwcyB0aGUgY2FsbDsgYW55dGhpbmcgZWxzZVxuXHRcdFx0XHQvLyAoaW5jbHVkaW5nIGEgY2xhc3NpZmllciBmYWlsdXJlKSBrZWVwcyB0aGUgb3JpZ2luYWwgYXV0by1jb25maXJtYXRpb24uXG5cdFx0XHRcdGNvbnN0IHsgYXV0b0NvbmZpcm1lZCwgc2tpcEV4cGxhbmF0aW9uOiByaXNrU2tpcEV4cGxhbmF0aW9uIH0gPSBhd2FpdCB0aGlzLl9tYXliZUFwcGx5QXV0b3BpbG90Umlza0dhdGUodG9vbCwgZHRvLCBwcmVwYXJlZEludm9jYXRpb24sIHByZVJlc29sdmVkQXV0b0NvbmZpcm1lZCwgdG9rZW4pO1xuXG5cdFx0XHRcdC8vIEltcG9ydGFudDogYSB0b29sIGludm9jYXRpb24gdGhhdCB3aWxsIGJlIGF1dG9jb25maXJtZWQgc2hvdWxkIG5ldmVyXG5cdFx0XHRcdC8vIGJlIGluIHRoZSBjaGF0IHJlc3BvbnNlIGluIHRoZSBgTmVlZHNDb25maXJtYXRpb25gIHN0YXRlLCBldmVuIGJyaWVmbHksXG5cdFx0XHRcdC8vIGFzIHRoYXQgdHJpZ2dlcnMgbm90aWZpY2F0aW9ucyBhbmQgY2F1c2VzIGlzc3VlcyBpbiBldmFsLlxuXHRcdFx0XHRpZiAoaGFkUGVuZGluZ0ludm9jYXRpb24gJiYgdG9vbEludm9jYXRpb24pIHtcblx0XHRcdFx0XHQvLyBUcmFuc2l0aW9uIGZyb20gc3RyZWFtaW5nIHRvIGV4ZWN1dGluZy93YWl0aW5nIHN0YXRlXG5cdFx0XHRcdFx0dG9vbEludm9jYXRpb24udHJhbnNpdGlvbkZyb21TdHJlYW1pbmcocHJlcGFyZWRJbnZvY2F0aW9uLCBkdG8ucGFyYW1ldGVycywgYXV0b0NvbmZpcm1lZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gQ3JlYXRlIGEgbmV3IHRvb2wgaW52b2NhdGlvbiAobm8gc3RyZWFtaW5nIHBoYXNlKVxuXHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uID0gbmV3IENoYXRUb29sSW52b2NhdGlvbihwcmVwYXJlZEludm9jYXRpb24sIHRvb2wuZGF0YSwgZHRvLmNoYXRTdHJlYW1Ub29sQ2FsbElkID8/IGR0by5jYWxsSWQsIGR0by5zdWJBZ2VudEludm9jYXRpb25JZCwgZHRvLnBhcmFtZXRlcnMpO1xuXHRcdFx0XHRcdGlmIChhdXRvQ29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHRvb2xJbnZvY2F0aW9uLCBhdXRvQ29uZmlybWVkKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9jaGF0U2VydmljZS5hcHBlbmRQcm9ncmVzcyhyZXF1ZXN0LCB0b29sSW52b2NhdGlvbik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkdG8udG9vbFNwZWNpZmljRGF0YSA9IHRvb2xJbnZvY2F0aW9uPy50b29sU3BlY2lmaWNEYXRhO1xuXG5cdFx0XHRcdC8vIEVuZm9yY2UgYSByaXNrIHNraXAgaGVyZSwgYmVmb3JlIHRoZSBjb25maXJtYXRpb24gZmxvdyBiZWxvdzogcnVuX2luX3Rlcm1pbmFsXG5cdFx0XHRcdC8vIHN1cHByZXNzZXMgaXRzIG93biBjb25maXJtYXRpb24gdW5kZXIgQXV0b3BpbG90IGFuZCBuZXZlciByZWFjaGVzIGl0LiBUaGUgdG9vbFxuXHRcdFx0XHQvLyBpcyBub3QgcnVuLCBhbmQgYW4gaW5mbyBub3RlIGV4cGxhaW5zIHdoeS5cblx0XHRcdFx0aWYgKHJpc2tTa2lwRXhwbGFuYXRpb24pIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dUb29sQXBwcm92YWxUZWxlbWV0cnkodG9vbCwgZHRvLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkIH0pO1xuXHRcdFx0XHRcdC8vIFRlcm1pbmFsIGFuZCBlZGl0IHRvb2xzIGhpZGUgdGhlaXIgaW52b2NhdGlvbiBwYXJ0IG9uY2UgY29tcGxldGUsIHNvIHNob3cgdGhlXG5cdFx0XHRcdFx0Ly8gcmVhc29uIGFzIGEgc2VwYXJhdGUgaW5mbyBub3RlLlxuXHRcdFx0XHRcdHRoaXMuX2NoYXRTZXJ2aWNlLmFwcGVuZFByb2dyZXNzKHJlcXVlc3QsIHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbmZvJyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYXV0b3BpbG90Umlza1NraXBwZWQnLCBcIkF1dG9waWxvdCBza2lwcGVkIFxcXCJ7MH1cXFwiIGJlY2F1c2UgaXQgd2FzIGFzc2Vzc2VkIGFzIGhpZ2gtcmlzazogezF9XCIsIHRvb2wuZGF0YS5kaXNwbGF5TmFtZSwgcmlza1NraXBFeHBsYW5hdGlvbikpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRvb2xSZXN1bHQgPSB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBgQXV0b3BpbG90IHNraXBwZWQgdGhpcyB0b29sIGNhbGwgYmVjYXVzZSBpdCB3YXMgYXV0b21hdGljYWxseSBhc3Nlc3NlZCBhcyBoaWdoLXJpc2s6ICR7cmlza1NraXBFeHBsYW5hdGlvbn0gVGhlIGFjdGlvbiB3YXMgbm90IHBlcmZvcm1lZC4gRG8gbm90IHJldHJ5IGl0IGFzLWlzIFx1MjAxNCBjaG9vc2UgYSBzYWZlciBhcHByb2FjaCBvciBsZWF2ZSBpdCBmb3IgdGhlIHVzZXIgdG8gcnVuIG1hbnVhbGx5LmBcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRyZXR1cm4gdG9vbFJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHJlcGFyZWRJbnZvY2F0aW9uPy5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUpIHtcblx0XHRcdFx0XHRpZiAoIUlDaGF0VG9vbEludm9jYXRpb24uZXhlY3V0aW9uQ29uZmlybWVkT3JEZW5pZWQodG9vbEludm9jYXRpb24pICYmICFhdXRvQ29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsYXlBY2Nlc3NpYmlsaXR5U2lnbmFsKFt0b29sSW52b2NhdGlvbl0sIGR0by5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB1c2VyQ29uZmlybWVkID0gYXdhaXQgSUNoYXRUb29sSW52b2NhdGlvbi5hd2FpdENvbmZpcm1hdGlvbih0b29sSW52b2NhdGlvbiwgdG9rZW4pO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1Rvb2xBcHByb3ZhbFRlbGVtZXRyeSh0b29sLCBkdG8sIHVzZXJDb25maXJtZWQpO1xuXHRcdFx0XHRcdGlmICh1c2VyQ29uZmlybWVkLnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5EZW5pZWQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodXNlckNvbmZpcm1lZC50eXBlID09PSBUb29sQ29uZmlybUtpbmQuU2tpcHBlZCkge1xuXHRcdFx0XHRcdFx0dG9vbFJlc3VsdCA9IHtcblx0XHRcdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0XHRcdFx0dmFsdWU6ICdUaGUgdXNlciBjaG9zZSB0byBza2lwIHRoZSB0b29sIGNhbGwsIHRoZXkgd2FudCB0byBwcm9jZWVkIHdpdGhvdXQgcnVubmluZyBpdCdcblx0XHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRyZXR1cm4gdG9vbFJlc3VsdDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHVzZXJDb25maXJtZWQudHlwZSA9PT0gVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gJiYgdXNlckNvbmZpcm1lZC5zZWxlY3RlZEJ1dHRvbikge1xuXHRcdFx0XHRcdFx0ZHRvLnNlbGVjdGVkQ3VzdG9tQnV0dG9uID0gdXNlckNvbmZpcm1lZC5zZWxlY3RlZEJ1dHRvbjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoZHRvLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdpbnB1dCcpIHtcblx0XHRcdFx0XHRcdGR0by5wYXJhbWV0ZXJzID0gZHRvLnRvb2xTcGVjaWZpY0RhdGEucmF3SW5wdXQ7XG5cdFx0XHRcdFx0XHRkdG8udG9vbFNwZWNpZmljRGF0YSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nVG9vbEFwcHJvdmFsVGVsZW1ldHJ5KHRvb2wsIGR0bywgYXV0b0NvbmZpcm1lZCA/PyB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByZXBhcmVUaW1lV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKHRydWUpO1xuXHRcdFx0XHRwcmVwYXJlZEludm9jYXRpb24gPSBhd2FpdCB0aGlzLnByZXBhcmVUb29sSW52b2NhdGlvbldpdGhIb29rUmVzdWx0KHRvb2wsIGR0bywgcHJlVG9vbFVzZUhvb2tSZXN1bHQsIHRva2VuKTtcblx0XHRcdFx0cHJlcGFyZVRpbWVXYXRjaC5zdG9wKCk7XG5cblx0XHRcdFx0Y29uc3QgeyBhdXRvQ29uZmlybWVkOiBmYWxsYmFja0F1dG9Db25maXJtZWQsIHByZXBhcmVkSW52b2NhdGlvbjogdXBkYXRlZFByZXBhcmVkSW52b2NhdGlvbiB9ID0gYXdhaXQgdGhpcy5yZXNvbHZlQXV0b0NvbmZpcm1Gcm9tSG9vayhwcmVUb29sVXNlSG9va1Jlc3VsdCwgdG9vbCwgZHRvLCBwcmVwYXJlZEludm9jYXRpb24sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHByZXBhcmVkSW52b2NhdGlvbiA9IHVwZGF0ZWRQcmVwYXJlZEludm9jYXRpb247XG5cdFx0XHRcdGlmIChwcmVwYXJlZEludm9jYXRpb24/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSAmJiAhZmFsbGJhY2tBdXRvQ29uZmlybWVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHsgbWVzc2FnZTogcmVuZGVyQXNQbGFpbnRleHQocHJlcGFyZWRJbnZvY2F0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLnRpdGxlKSwgZGV0YWlsOiByZW5kZXJBc1BsYWludGV4dChwcmVwYXJlZEludm9jYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXMubWVzc2FnZSEpIH0pO1xuXHRcdFx0XHRcdGlmICghcmVzdWx0LmNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGR0by50b29sU3BlY2lmaWNEYXRhID0gcHJlcGFyZWRJbnZvY2F0aW9uPy50b29sU3BlY2lmaWNEYXRhO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cblx0XHRcdGludm9jYXRpb25UaW1lV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKHRydWUpO1xuXHRcdFx0dG9vbFJlc3VsdCA9IGF3YWl0IHRvb2wuaW1wbC5pbnZva2UoZHRvLCBjb3VudFRva2Vucywge1xuXHRcdFx0XHRyZXBvcnQ6IHN0ZXAgPT4ge1xuXHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uPy5hY2NlcHRQcm9ncmVzcyhzdGVwKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdG9rZW4pO1xuXHRcdFx0aW52b2NhdGlvblRpbWVXYXRjaC5zdG9wKCk7XG5cdFx0XHQvLyBBcHBseSBwb3N0LXByb2Nlc3NpbmcgY29tcHJlc3Npb24gKGUuZy4gZm9yIHJ1bl9pbl90ZXJtaW5hbCBvdXRwdXQpXG5cdFx0XHQvLyBiZWZvcmUgdGhlIHJlc3VsdCByZWFjaGVzIHRoZSBtb2RlbC4gUmV0dXJucyB1bmRlZmluZWQgd2hlbiBub1xuXHRcdFx0Ly8gY29tcHJlc3Npb24gYXBwbGllZC5cblx0XHRcdGNvbnN0IGNvbXByZXNzZWQgPSB0aGlzLl90b29sUmVzdWx0Q29tcHJlc3Nvci5tYXliZUNvbXByZXNzKHRvb2wuZGF0YS5pZCwgZHRvLnBhcmFtZXRlcnMsIHRvb2xSZXN1bHQpO1xuXHRcdFx0aWYgKGNvbXByZXNzZWQpIHtcblx0XHRcdFx0dG9vbFJlc3VsdCA9IGNvbXByZXNzZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVuc3VyZVRvb2xEZXRhaWxzKGR0bywgdG9vbFJlc3VsdCwgdG9vbC5kYXRhLCB0b29sSW52b2NhdGlvbik7XG5cblx0XHRcdGNvbnN0IGFmdGVyRXhlY3V0ZVN0YXRlID0gYXdhaXQgdG9vbEludm9jYXRpb24/LmRpZEV4ZWN1dGVUb29sKHRvb2xSZXN1bHQsIHVuZGVmaW5lZCwgKCkgPT5cblx0XHRcdFx0dGhpcy5zaG91bGRBdXRvQ29uZmlybVBvc3RFeGVjdXRpb24odG9vbC5kYXRhLmlkLCB0b29sLmRhdGEucnVuc0luV29ya3NwYWNlLCB0b29sLmRhdGEuc291cmNlLCBkdG8ucGFyYW1ldGVycywgZHRvLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZSwgZHRvLmNoYXRSZXF1ZXN0SWQsIGR0by5jb250ZXh0Py53b3JraW5nRGlyZWN0b3J5KSk7XG5cblx0XHRcdGlmICh0b29sSW52b2NhdGlvbiAmJiBhZnRlckV4ZWN1dGVTdGF0ZT8udHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCkge1xuXHRcdFx0XHRjb25zdCBwb3N0Q29uZmlybSA9IGF3YWl0IElDaGF0VG9vbEludm9jYXRpb24uYXdhaXRQb3N0Q29uZmlybWF0aW9uKHRvb2xJbnZvY2F0aW9uLCB0b2tlbik7XG5cdFx0XHRcdGlmIChwb3N0Q29uZmlybS50eXBlID09PSBUb29sQ29uZmlybUtpbmQuRGVuaWVkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBvc3RDb25maXJtLnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkKSB7XG5cdFx0XHRcdFx0dG9vbFJlc3VsdCA9IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6ICdUaGUgdG9vbCBleGVjdXRlZCBidXQgdGhlIHVzZXIgY2hvc2Ugbm90IHRvIHNoYXJlIHRoZSByZXN1bHRzJ1xuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxMYW5ndWFnZU1vZGVsVG9vbEludm9rZWRFdmVudCwgTGFuZ3VhZ2VNb2RlbFRvb2xJbnZva2VkQ2xhc3NpZmljYXRpb24+KFxuXHRcdFx0XHQnbGFuZ3VhZ2VNb2RlbFRvb2xJbnZva2VkJyxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHJlc3VsdDogJ3N1Y2Nlc3MnLFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uSWQ6IGR0by5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2UgPyBjaGF0U2Vzc2lvblJlc291cmNlVG9JZChkdG8uY29udGV4dC5zZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRvb2xJZDogdG9vbC5kYXRhLmlkLFxuXHRcdFx0XHRcdHRvb2xFeHRlbnNpb25JZDogdG9vbC5kYXRhLnNvdXJjZS50eXBlID09PSAnZXh0ZW5zaW9uJyA/IHRvb2wuZGF0YS5zb3VyY2UuZXh0ZW5zaW9uSWQudmFsdWUgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dG9vbFNvdXJjZUtpbmQ6IHRvb2wuZGF0YS5zb3VyY2UudHlwZSxcblx0XHRcdFx0XHRwcmVwYXJlVGltZU1zOiBwcmVwYXJlVGltZVdhdGNoPy5lbGFwc2VkKCksXG5cdFx0XHRcdFx0aW52b2NhdGlvblRpbWVNczogaW52b2NhdGlvblRpbWVXYXRjaD8uZWxhcHNlZCgpLFxuXHRcdFx0XHR9KTtcblx0XHRcdHJldHVybiB0b29sUmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpID8gJ3VzZXJDYW5jZWxsZWQnIDogJ2Vycm9yJztcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxMYW5ndWFnZU1vZGVsVG9vbEludm9rZWRFdmVudCwgTGFuZ3VhZ2VNb2RlbFRvb2xJbnZva2VkQ2xhc3NpZmljYXRpb24+KFxuXHRcdFx0XHQnbGFuZ3VhZ2VNb2RlbFRvb2xJbnZva2VkJyxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHJlc3VsdCxcblx0XHRcdFx0XHRjaGF0U2Vzc2lvbklkOiBkdG8uY29udGV4dD8uc2Vzc2lvblJlc291cmNlID8gY2hhdFNlc3Npb25SZXNvdXJjZVRvSWQoZHRvLmNvbnRleHQuc2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b29sSWQ6IHRvb2wuZGF0YS5pZCxcblx0XHRcdFx0XHR0b29sRXh0ZW5zaW9uSWQ6IHRvb2wuZGF0YS5zb3VyY2UudHlwZSA9PT0gJ2V4dGVuc2lvbicgPyB0b29sLmRhdGEuc291cmNlLmV4dGVuc2lvbklkLnZhbHVlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRvb2xTb3VyY2VLaW5kOiB0b29sLmRhdGEuc291cmNlLnR5cGUsXG5cdFx0XHRcdFx0cHJlcGFyZVRpbWVNczogcHJlcGFyZVRpbWVXYXRjaD8uZWxhcHNlZCgpLFxuXHRcdFx0XHRcdGludm9jYXRpb25UaW1lTXM6IGludm9jYXRpb25UaW1lV2F0Y2g/LmVsYXBzZWQoKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSNpbnZva2VUb29sXSBFcnJvciBmcm9tIHRvb2wgJHtkdG8udG9vbElkfSB3aXRoIHBhcmFtZXRlcnMgJHtKU09OLnN0cmluZ2lmeShkdG8ucGFyYW1ldGVycyl9OlxcbiR7dG9FcnJvck1lc3NhZ2UoZXJyLCB0cnVlKX1gKTtcblx0XHRcdH1cblxuXHRcdFx0dG9vbFJlc3VsdCA/Pz0geyBjb250ZW50OiBbXSB9O1xuXHRcdFx0dG9vbFJlc3VsdC50b29sUmVzdWx0RXJyb3IgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHRpZiAodG9vbC5kYXRhLmFsd2F5c0Rpc3BsYXlJbnB1dE91dHB1dCkge1xuXHRcdFx0XHR0b29sUmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzID0geyBpbnB1dDogdGhpcy5mb3JtYXRUb29sSW5wdXQoZHRvKSwgb3V0cHV0OiBbeyB0eXBlOiAnZW1iZWQnLCBpc1RleHQ6IHRydWUsIHZhbHVlOiBTdHJpbmcoZXJyKSB9XSwgaXNFcnJvcjogdHJ1ZSB9O1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRvb2xJbnZvY2F0aW9uPy5kaWRFeGVjdXRlVG9vbCh0b29sUmVzdWx0LCB0cnVlKTtcblx0XHRcdGlmIChzdG9yZSkge1xuXHRcdFx0XHR0aGlzLmNsZWFudXBDYWxsRGlzcG9zYWJsZXMocmVxdWVzdElkLCBzdG9yZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb25XaXRoSG9va1Jlc3VsdCh0b29sOiBJVG9vbEVudHJ5LCBkdG86IElUb29sSW52b2NhdGlvbiwgaG9va1Jlc3VsdDogSUV4dGVybmFsUHJlVG9vbFVzZUhvb2tSZXN1bHQgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgZm9yY2VDb25maXJtYXRpb25SZWFzb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaG9va1Jlc3VsdD8ucGVybWlzc2lvbkRlY2lzaW9uID09PSAnYXNrJykge1xuXHRcdFx0Y29uc3QgaG9va01lc3NhZ2UgPSBsb2NhbGl6ZSgncHJlVG9vbFVzZUhvb2tSZXF1aXJlZENvbmZpcm1hdGlvbicsIFwiezB9IHJlcXVpcmVkIGNvbmZpcm1hdGlvblwiLCBIb29rVHlwZS5QcmVUb29sVXNlKTtcblx0XHRcdGZvcmNlQ29uZmlybWF0aW9uUmVhc29uID0gaG9va1Jlc3VsdC5wZXJtaXNzaW9uRGVjaXNpb25SZWFzb25cblx0XHRcdFx0PyBgJHtob29rTWVzc2FnZX06ICR7aG9va1Jlc3VsdC5wZXJtaXNzaW9uRGVjaXNpb25SZWFzb259YFxuXHRcdFx0XHQ6IGhvb2tNZXNzYWdlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5wcmVwYXJlVG9vbEludm9jYXRpb24odG9vbCwgZHRvLCBmb3JjZUNvbmZpcm1hdGlvblJlYXNvbiwgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9nVG9vbEFwcHJvdmFsVGVsZW1ldHJ5KHRvb2w6IElUb29sRW50cnksIGR0bzogSVRvb2xJbnZvY2F0aW9uLCByZWFzb246IENvbmZpcm1lZFJlYXNvbik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpcm1LaW5kTmFtZXM6IFJlY29yZDxUb29sQ29uZmlybUtpbmQsIHN0cmluZz4gPSB7XG5cdFx0XHRbVG9vbENvbmZpcm1LaW5kLkRlbmllZF06ICdkZW5pZWQnLFxuXHRcdFx0W1Rvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWRdOiAnY29uZmlybWF0aW9uTm90TmVlZGVkJyxcblx0XHRcdFtUb29sQ29uZmlybUtpbmQuU2V0dGluZ106ICdzZXR0aW5nJyxcblx0XHRcdFtUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbF06ICdsbVNlcnZpY2VQZXJUb29sJyxcblx0XHRcdFtUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbl06ICd1c2VyQWN0aW9uJyxcblx0XHRcdFtUb29sQ29uZmlybUtpbmQuU2tpcHBlZF06ICdza2lwcGVkJyxcblx0XHR9O1xuXHRcdGNvbnN0IGFsbG93ZWRDb25maXJtYXRpb25Ob3ROZWVkZWRSZWFzb25zID0gbmV3IFNldChbYXV0b0FwcHJvdmVBbGxSZWFzb24sICdpbmxpbmVDaGF0J10pO1xuXHRcdGxldCBjb25maXJtYXRpb25Ob3ROZWVkZWRSZWFzb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAocmVhc29uLnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgJiYgcmVhc29uLnJlYXNvbikge1xuXHRcdFx0Y29uc3QgcmF3ID0gdHlwZW9mIHJlYXNvbi5yZWFzb24gPT09ICdzdHJpbmcnID8gcmVhc29uLnJlYXNvbiA6IHJlYXNvbi5yZWFzb24udmFsdWU7XG5cdFx0XHRjb25maXJtYXRpb25Ob3ROZWVkZWRSZWFzb24gPSBhbGxvd2VkQ29uZmlybWF0aW9uTm90TmVlZGVkUmVhc29ucy5oYXMocmF3KSA/IHJhdyA6ICdvdGhlcic7XG5cdFx0fVxuXHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IGR0by50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnID8gZHRvLnRvb2xTcGVjaWZpY0RhdGEgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFRvb2xBcHByb3ZhbEV2ZW50LCBUb29sQXBwcm92YWxDbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHQnY2hhdC50b29sQXBwcm92YWwnLFxuXHRcdFx0e1xuXHRcdFx0XHRjb25maXJtS2luZDogY29uZmlybUtpbmROYW1lc1tyZWFzb24udHlwZV0sXG5cdFx0XHRcdHJlcXVlc3RJZDogZHRvLmNoYXRSZXF1ZXN0SWQsXG5cdFx0XHRcdHNldHRpbmdJZDogcmVhc29uLnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5TZXR0aW5nID8gcmVhc29uLmlkIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsbVNlcnZpY2VTY29wZTogcmVhc29uLnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sID8gcmVhc29uLnNjb3BlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjdXN0b21CdXR0b25LaW5kOiByZWFzb24udHlwZSA9PT0gVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gPyByZWFzb24uc2VsZWN0ZWRCdXR0b25LaW5kIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb25maXJtYXRpb25Ob3ROZWVkZWRSZWFzb24sXG5cdFx0XHRcdHNhbmRib3hXcmFwcGVkOiB0ZXJtaW5hbERhdGE/LmNvbW1hbmRMaW5lLmlzU2FuZGJveFdyYXBwZWQsXG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogdGVybWluYWxEYXRhPy5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24sXG5cdFx0XHRcdGNoYXRTZXNzaW9uSWQ6IGR0by5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2UgPyBjaGF0U2Vzc2lvblJlc291cmNlVG9JZChkdG8uY29udGV4dC5zZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0b29sSWQ6IHRvb2wuZGF0YS5pZCxcblx0XHRcdFx0dG9vbEV4dGVuc2lvbklkOiB0b29sLmRhdGEuc291cmNlLnR5cGUgPT09ICdleHRlbnNpb24nID8gdG9vbC5kYXRhLnNvdXJjZS5leHRlbnNpb25JZC52YWx1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9vbFNvdXJjZUtpbmQ6IHRvb2wuZGF0YS5zb3VyY2UudHlwZSxcblx0XHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIERldGVybWluZXMgdGhlIGF1dG8tY29uZmlybSBkZWNpc2lvbiBiYXNlZCBvbiBhIHByZVRvb2xVc2UgaG9vayByZXN1bHQuXG5cdCAqIElmIHRoZSBob29rIHJldHVybmVkICdhbGxvdycsIGF1dG8tYXBwcm92ZXMuIElmICdhc2snLCBmb3JjZXMgY29uZmlybWF0aW9uXG5cdCAqIGFuZCBlbnN1cmVzIGNvbmZpcm1hdGlvbiBtZXNzYWdlcyBleGlzdCBvbiBgcHJlcGFyZWRJbnZvY2F0aW9uYC4gT3RoZXJ3aXNlXG5cdCAqIGZhbGxzIGJhY2sgdG8gbm9ybWFsIGF1dG8tY29uZmlybSBsb2dpYy5cblx0ICpcblx0ICogUmV0dXJucyB0aGUgcG9zc2libHktdXBkYXRlZCBwcmVwYXJlZEludm9jYXRpb24gYWxvbmcgd2l0aCB0aGUgYXV0by1jb25maXJtIGRlY2lzaW9uLFxuXHQgKiBzaW5jZSB3aGVuIHRoZSBob29rIHJldHVybnMgJ2FzaycgYW5kIHByZXBhcmVkSW52b2NhdGlvbiB3YXMgdW5kZWZpbmVkLCB3ZSBjcmVhdGUgb25lLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlQXV0b0NvbmZpcm1Gcm9tSG9vayhcblx0XHRob29rUmVzdWx0OiBJRXh0ZXJuYWxQcmVUb29sVXNlSG9va1Jlc3VsdCB8IHVuZGVmaW5lZCxcblx0XHR0b29sOiBJVG9vbEVudHJ5LFxuXHRcdGR0bzogSVRvb2xJbnZvY2F0aW9uLFxuXHRcdHByZXBhcmVkSW52b2NhdGlvbjogSVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQsXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsXG5cdCk6IFByb21pc2U8eyBhdXRvQ29uZmlybWVkOiBDb25maXJtZWRSZWFzb24gfCB1bmRlZmluZWQ7IHByZXBhcmVkSW52b2NhdGlvbjogSVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQgfT4ge1xuXHRcdGlmIChob29rUmVzdWx0Py5wZXJtaXNzaW9uRGVjaXNpb24gPT09ICdhbGxvdycpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlI2ludm9rZVRvb2xdIFRvb2wgJHtkdG8udG9vbElkfSBhdXRvLWFwcHJvdmVkIGJ5IHByZVRvb2xVc2UgaG9va2ApO1xuXHRcdFx0cmV0dXJuIHsgYXV0b0NvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkLCByZWFzb246IGxvY2FsaXplKCdob29rQWxsb3dlZCcsIFwiQWxsb3dlZCBieSBob29rXCIpIH0sIHByZXBhcmVkSW52b2NhdGlvbiB9O1xuXHRcdH1cblxuXHRcdGlmIChob29rUmVzdWx0Py5wZXJtaXNzaW9uRGVjaXNpb24gPT09ICdhc2snKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSNpbnZva2VUb29sXSBUb29sICR7ZHRvLnRvb2xJZH0gcmVxdWlyZXMgY29uZmlybWF0aW9uIChwcmVUb29sVXNlIGhvb2sgcmV0dXJuZWQgJ2FzaycpYCk7XG5cdFx0XHQvLyBFbnN1cmUgY29uZmlybWF0aW9uIG1lc3NhZ2VzIGV4aXN0IHdoZW4gaG9vayByZXF1aXJlcyBjb25maXJtYXRpb25cblx0XHRcdGlmICghcHJlcGFyZWRJbnZvY2F0aW9uPy5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUpIHtcblx0XHRcdFx0aWYgKCFwcmVwYXJlZEludm9jYXRpb24pIHtcblx0XHRcdFx0XHRwcmVwYXJlZEludm9jYXRpb24gPSB7fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZSA9IGdldFRvb2xGdWxsUmVmZXJlbmNlTmFtZSh0b29sLmRhdGEpO1xuXHRcdFx0XHRjb25zdCBob29rUmVhc29uID0gaG9va1Jlc3VsdC5wZXJtaXNzaW9uRGVjaXNpb25SZWFzb247XG5cdFx0XHRcdGNvbnN0IGhvb2tOb3RlID0gaG9va1JlYXNvblxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2hvb2tSZXF1aXJlc0NvbmZpcm1hdGlvbi5tZXNzYWdlV2l0aFJlYXNvbicsIFwiezB9IGhvb2sgcmVxdWlyZWQgY29uZmlybWF0aW9uOiB7MX1cIiwgSG9va1R5cGUuUHJlVG9vbFVzZSwgaG9va1JlYXNvbilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdob29rUmVxdWlyZXNDb25maXJtYXRpb24ubWVzc2FnZScsIFwiezB9IGhvb2sgcmVxdWlyZWQgY29uZmlybWF0aW9uXCIsIEhvb2tUeXBlLlByZVRvb2xVc2UpO1xuXHRcdFx0XHRwcmVwYXJlZEludm9jYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXMgPSB7XG5cdFx0XHRcdFx0Li4ucHJlcGFyZWRJbnZvY2F0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnaG9va1JlcXVpcmVzQ29uZmlybWF0aW9uLnRpdGxlJywgXCJVc2UgdGhlICd7MH0nIHRvb2w/XCIsIGZ1bGxSZWZlcmVuY2VOYW1lKSxcblx0XHRcdFx0XHRtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoYF8ke2hvb2tOb3RlfV9gKSxcblx0XHRcdFx0XHRhbGxvd0F1dG9Db25maXJtOiBmYWxzZSxcblx0XHRcdFx0fTtcblx0XHRcdFx0cHJlcGFyZWRJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSB7XG5cdFx0XHRcdFx0a2luZDogJ2lucHV0Jyxcblx0XHRcdFx0XHRyYXdJbnB1dDogZHRvLnBhcmFtZXRlcnMsXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBUb29sIGFscmVhZHkgaGFzIGl0cyBvd24gY29uZmlybWF0aW9uIC0gcHJlcGVuZCBob29rIG5vdGVcblx0XHRcdFx0Y29uc3QgaG9va1JlYXNvbiA9IGhvb2tSZXN1bHQucGVybWlzc2lvbkRlY2lzaW9uUmVhc29uO1xuXHRcdFx0XHRjb25zdCBob29rTm90ZSA9IGhvb2tSZWFzb25cblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdob29rUmVxdWlyZXNDb25maXJtYXRpb24ubm90ZScsIFwiezB9IGhvb2sgcmVxdWlyZWQgY29uZmlybWF0aW9uOiB7MX1cIiwgSG9va1R5cGUuUHJlVG9vbFVzZSwgaG9va1JlYXNvbilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdob29rUmVxdWlyZXNDb25maXJtYXRpb24ubm90ZU5vUmVhc29uJywgXCJ7MH0gaG9vayByZXF1aXJlZCBjb25maXJtYXRpb25cIiwgSG9va1R5cGUuUHJlVG9vbFVzZSk7XG5cblx0XHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBwcmVwYXJlZEludm9jYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXMhO1xuXHRcdFx0XHRpZiAocHJlcGFyZWRJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICd0ZXJtaW5hbCcpIHtcblx0XHRcdFx0XHQvLyBUZXJtaW5hbCB0b29scyByZW5kZXIgbWVzc2FnZSBhcyBob3ZlciBvbmx5OyB1c2UgZGlzY2xhaW1lciBmb3IgdmlzaWJsZSB0ZXh0XG5cdFx0XHRcdFx0Y29uc3QgZXhpc3RpbmdEaXNjbGFpbWVyVGV4dCA9IGV4aXN0aW5nLmRpc2NsYWltZXJcblx0XHRcdFx0XHRcdD8gKHR5cGVvZiBleGlzdGluZy5kaXNjbGFpbWVyID09PSAnc3RyaW5nJyA/IGV4aXN0aW5nLmRpc2NsYWltZXIgOiBleGlzdGluZy5kaXNjbGFpbWVyLnZhbHVlKVxuXHRcdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uc3QgY29tYmluZWREaXNjbGFpbWVyID0gZXhpc3RpbmdEaXNjbGFpbWVyVGV4dFxuXHRcdFx0XHRcdFx0PyBgJHtob29rTm90ZX1cXG5cXG4ke2V4aXN0aW5nRGlzY2xhaW1lclRleHR9YFxuXHRcdFx0XHRcdFx0OiBob29rTm90ZTtcblx0XHRcdFx0XHRwcmVwYXJlZEludm9jYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXMgPSB7XG5cdFx0XHRcdFx0XHQuLi5leGlzdGluZyxcblx0XHRcdFx0XHRcdGRpc2NsYWltZXI6IGNvbWJpbmVkRGlzY2xhaW1lcixcblx0XHRcdFx0XHRcdGFsbG93QXV0b0NvbmZpcm06IGZhbHNlLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gRWRpdC9vdGhlciB0b29sczogcHJlcGVuZCBob29rIG5vdGUgdG8gdGhlIG1lc3NhZ2UgYm9keVxuXHRcdFx0XHRcdGNvbnN0IG1zZ1RleHQgPSB0eXBlb2YgZXhpc3RpbmcubWVzc2FnZSA9PT0gJ3N0cmluZycgPyBleGlzdGluZy5tZXNzYWdlIDogZXhpc3RpbmcubWVzc2FnZT8udmFsdWUgPz8gJyc7XG5cdFx0XHRcdFx0cHJlcGFyZWRJbnZvY2F0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzID0ge1xuXHRcdFx0XHRcdFx0Li4uZXhpc3RpbmcsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoYF8ke2hvb2tOb3RlfV9cXG5cXG4ke21zZ1RleHR9YCksXG5cdFx0XHRcdFx0XHRhbGxvd0F1dG9Db25maXJtOiBmYWxzZSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBhdXRvQ29uZmlybWVkOiB1bmRlZmluZWQsIHByZXBhcmVkSW52b2NhdGlvbiB9O1xuXHRcdH1cblxuXHRcdC8vIE5vIGhvb2sgZGVjaXNpb24gLSB1c2Ugbm9ybWFsIGF1dG8tY29uZmlybSBsb2dpY1xuXHRcdGNvbnN0IGFwcHJvdmVDb21iaW5hdGlvbiA9IHByZXBhcmVkSW52b2NhdGlvbj8uY29uZmlybWF0aW9uTWVzc2FnZXM/LmFwcHJvdmVDb21iaW5hdGlvbjtcblx0XHRsZXQgY29tYmluYXRpb246IHsgbGFiZWw6IHN0cmluZzsga2V5OiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoYXBwcm92ZUNvbWJpbmF0aW9uKSB7XG5cdFx0XHRjb21iaW5hdGlvbiA9IHtcblx0XHRcdFx0bGFiZWw6IHR5cGVvZiBhcHByb3ZlQ29tYmluYXRpb24ubGFiZWwgPT09ICdzdHJpbmcnID8gYXBwcm92ZUNvbWJpbmF0aW9uLmxhYmVsIDogYXBwcm92ZUNvbWJpbmF0aW9uLmxhYmVsLnZhbHVlLFxuXHRcdFx0XHRrZXk6IGFwcHJvdmVDb21iaW5hdGlvbi5rZXksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCBhdXRvQ29uZmlybWVkID0gYXdhaXQgdGhpcy5zaG91bGRBdXRvQ29uZmlybSh0b29sLmRhdGEuaWQsIHRvb2wuZGF0YS5ydW5zSW5Xb3Jrc3BhY2UsIHRvb2wuZGF0YS5zb3VyY2UsIGR0by5wYXJhbWV0ZXJzLCBzZXNzaW9uUmVzb3VyY2UsIGR0by5jaGF0UmVxdWVzdElkLCBjb21iaW5hdGlvbiwgZHRvLmNvbnRleHQ/LndvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdHJldHVybiB7IGF1dG9Db25maXJtZWQsIHByZXBhcmVkSW52b2NhdGlvbiB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEluIEF1dG9waWxvdCwgcnVucyB0aGUgcmlzayBjbGFzc2lmaWVyIG9uIGFuIGF1dG8tYXBwcm92ZWQgY2FsbCBhbmQgc2tpcHMgaXQgd2hlbiB0aGUgcmF0aW5nXG5cdCAqIGlzIHtAbGluayBUb29sUmlza0xldmVsLlJlZH0uIEFueSBvdGhlciByZXN1bHQgcmV0dXJucyB0aGUgb3JpZ2luYWwgYXV0by1jb25maXJtYXRpb25cblx0ICogdW5jaGFuZ2VkLlxuXHQgKlxuXHQgKiBUbyBrZWVwIHRoZSBjbGFzc2lmaWVyIG9mZiB0aGUgaG90IHBhdGgsIGl0IG9ubHkgcnVucyB3aGVuIGFsbCBvZiB0aGVzZSBob2xkOlxuXHQgKiAtIHRoZSBjYWxsIHdhcyBhdXRvLWFwcHJvdmVkIGJ5IHRoZSBzZXNzaW9uIGFwcHJvdmluZyBldmVyeXRoaW5nLCBvciBpcyBhIGBydW5faW5fdGVybWluYWxgIC9cblx0ICogICBmZXRjaCBjYWxsIHRoYXQgc2VsZi1hcHByb3ZlZCAodGhlc2UgY2FuIHJ1biByaXNreSBjb21tYW5kcyBvciBwcm9tcHQtaW5qZWN0ZWQgVVJMcyB3aXRob3V0XG5cdCAqICAgZXZlciBzaG93aW5nIGEgY29uZmlybWF0aW9uKTtcblx0ICogLSBpdCB3b3VsZCBvdGhlcndpc2Ugc2hvdyBhIGNvbmZpcm1hdGlvbiAodGhlIHNlbGYtYXBwcm92aW5nIHRvb2xzIGFib3ZlIGFyZSB0aGUgZXhjZXB0aW9uKTtcblx0ICogLSB0aGUgc2Vzc2lvbiBpcyBhIGxvY2FsIHBhbmVsIHNlc3Npb24gYXQgdGhlIEF1dG9waWxvdCBsZXZlbCB3aXRoIEFkdmFuY2VkIEF1dG9waWxvdCBvbi5cblx0ICpcblx0ICogVGhpcyBpcyBpbmRlcGVuZGVudCBvZiBgY2hhdC50b29scy5yaXNrQXNzZXNzbWVudC5lbmFibGVkYCwgd2hpY2ggb25seSBjb250cm9scyB0aGVcblx0ICogY29uZmlybWF0aW9uIHJpc2sgYmFkZ2UuIENMSSBhbmQgYWdlbnQtaG9zdCBzZXNzaW9ucyBoYW5kbGUgdGhlaXIgb3duIGNvbmZpcm1hdGlvbnMgYW5kIGFyZVxuXHQgKiBleGNsdWRlZC5cblx0ICpcblx0ICogRmFpbHMgb3BlbjogYSBjYW5jZWxsZWQsIHVuYXZhaWxhYmxlLCBvciBmYWlsZWQgYXNzZXNzbWVudCBrZWVwcyB0aGUgb3JpZ2luYWxcblx0ICogYXV0by1jb25maXJtYXRpb24gc28gQXV0b3BpbG90IGtlZXBzIG1vdmluZy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX21heWJlQXBwbHlBdXRvcGlsb3RSaXNrR2F0ZShcblx0XHR0b29sOiBJVG9vbEVudHJ5LFxuXHRcdGR0bzogSVRvb2xJbnZvY2F0aW9uLFxuXHRcdHByZXBhcmVkSW52b2NhdGlvbjogSVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQsXG5cdFx0YXV0b0NvbmZpcm1lZDogQ29uZmlybWVkUmVhc29uIHwgdW5kZWZpbmVkLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTx7IGF1dG9Db25maXJtZWQ6IENvbmZpcm1lZFJlYXNvbiB8IHVuZGVmaW5lZDsgc2tpcEV4cGxhbmF0aW9uPzogc3RyaW5nIH0+IHtcblx0XHRjb25zdCBpc1Rlcm1pbmFsVG9vbCA9IHRvb2wuZGF0YS5pZCA9PT0gVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbDtcblx0XHRjb25zdCBpc0ZldGNoVG9vbCA9IGZldGNoV2ViUGFnZVRvb2xJZHMuaGFzKHRvb2wuZGF0YS5pZCk7XG5cdFx0Y29uc3QgaXNBbHdheXNDbGFzc2lmeVRvb2wgPSBpc1Rlcm1pbmFsVG9vbCB8fCBpc0ZldGNoVG9vbDtcblxuXHRcdC8vIE5vcm1hbGx5IG9ubHkgZ2F0ZSBjYWxscyB0aGUgc2Vzc2lvbiBhdXRvLWFwcHJvdmVkIHdob2xlc2FsZSAodGhlIGBhdXRvQXBwcm92ZUFsbFJlYXNvbmBcblx0XHQvLyBzZW50aW5lbCkuIEEgcGVyLXRvb2wgc2V0dGluZywgdXNlciBhY3Rpb24sIG9yIGhvb2sgY2FycmllcyBhIGNvbmNyZXRlIHJlYXNvbiBhbmQgaXNcblx0XHQvLyByZXNwZWN0ZWQgYXMtaXMuXG5cdFx0Ly9cblx0XHQvLyBFeGNlcHRpb246IHJ1bl9pbl90ZXJtaW5hbCBhbmQgZmV0Y2ggc2VsZi1hcHByb3ZlIHdpdGhvdXQgYSBjb25maXJtYXRpb24sIHNvIGEgcmlza3kgY29tbWFuZFxuXHRcdC8vIG9yIGEgcHJvbXB0LWluamVjdGVkIFVSTCB3b3VsZCBydW4gdW5jbGFzc2lmaWVkLiBHYXRlIHRoZW0gd2hlbiB0aGV5IGFycml2ZSBzZWxmLWFwcHJvdmVkXG5cdFx0Ly8gKG5vIHJlYXNvbiBhbmQgbm8gY29uZmlybWF0aW9uIG9mIHRoZWlyIG93bik7IGFuIGV4cGxpY2l0IGFsbG93IGNhcnJpZXMgYSBjb25jcmV0ZSByZWFzb25cblx0XHQvLyBpbnN0ZWFkIG9mIGB1bmRlZmluZWRgLCBzbyBpdCBzdGF5cyByZXNwZWN0ZWQuXG5cdFx0Y29uc3QgaXNCbGFua2V0U2Vzc2lvbkFwcHJvdmUgPSBhdXRvQ29uZmlybWVkPy50eXBlID09PSBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkXG5cdFx0XHQmJiBhdXRvQ29uZmlybWVkLnJlYXNvbiA9PT0gYXV0b0FwcHJvdmVBbGxSZWFzb247XG5cdFx0Y29uc3QgaXNTZWxmQXBwcm92ZWRBbHdheXNDbGFzc2lmeSA9IGlzQWx3YXlzQ2xhc3NpZnlUb29sXG5cdFx0XHQmJiBhdXRvQ29uZmlybWVkID09PSB1bmRlZmluZWRcblx0XHRcdCYmICFwcmVwYXJlZEludm9jYXRpb24/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZTtcblx0XHRpZiAoIWlzQmxhbmtldFNlc3Npb25BcHByb3ZlICYmICFpc1NlbGZBcHByb3ZlZEFsd2F5c0NsYXNzaWZ5KSB7XG5cdFx0XHRyZXR1cm4geyBhdXRvQ29uZmlybWVkIH07XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBnYXRlIGNhbGxzIHRoYXQgd291bGQgb3RoZXJ3aXNlIHNob3cgYSBjb25maXJtYXRpb24sIHBsdXMgdGhlIHNlbGYtYXBwcm92aW5nIHRvb2xzIGFib3ZlLlxuXHRcdGlmICghaXNBbHdheXNDbGFzc2lmeVRvb2wgJiYgIXByZXBhcmVkSW52b2NhdGlvbj8uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlKSB7XG5cdFx0XHRyZXR1cm4geyBhdXRvQ29uZmlybWVkIH07XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgdGhlIEFkdmFuY2VkIEF1dG9waWxvdCBmbGFnIGZpcnN0OiBpdCBpcyBkZWZhdWx0LW9mZiwgc28gdGhlIGNvbW1vbiBjYXNlIGJhaWxzIGJlZm9yZVxuXHRcdC8vIHRoZSBzZXNzaW9uIGxvb2t1cHMgYmVsb3cuIFRoaXMgZG9lcyBub3QgY29uc3VsdCBgY2hhdC50b29scy5yaXNrQXNzZXNzbWVudC5lbmFibGVkYCwgd2hpY2hcblx0XHQvLyBvbmx5IGNvbnRyb2xzIHRoZSBjb25maXJtYXRpb24gcmlzayBiYWRnZS5cblx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQXV0b3BpbG90QWR2YW5jZWRFbmFibGVkKSAhPT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIHsgYXV0b0NvbmZpcm1lZCB9O1xuXHRcdH1cblxuXHRcdC8vIFNjb3BlIHRvIGxvY2FsIHBhbmVsIHNlc3Npb25zIGF0IHRoZSBBdXRvcGlsb3QgbGV2ZWwuIENMSSBhbmQgYWdlbnQtaG9zdCBzZXNzaW9ucyBoYW5kbGVcblx0XHQvLyB0aGVpciBvd24gY29uZmlybWF0aW9ucy5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBkdG8uY29udGV4dD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdGlmICghc2Vzc2lvblJlc291cmNlIHx8IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0cmV0dXJuIHsgYXV0b0NvbmZpcm1lZCB9O1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2lzU2Vzc2lvbkluQXV0b3BpbG90TGV2ZWwoc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHsgYXV0b0NvbmZpcm1lZCB9O1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBpZ25vcmVFbmFibGVtZW50OiBhc3Nlc3MgZXZlbiB3aGVuIHRoZSByaXNrLWJhZGdlIHNldHRpbmcgaXMgb2ZmLlxuXHRcdFx0Y29uc3QgYXNzZXNzbWVudCA9IGF3YWl0IHRoaXMuX3Jpc2tBc3Nlc3NtZW50U2VydmljZS5hc3Nlc3ModG9vbC5kYXRhLCBkdG8ucGFyYW1ldGVycywgdG9rZW4sIHVuZGVmaW5lZCwgeyBpZ25vcmVFbmFibGVtZW50OiB0cnVlIH0pO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB7IGF1dG9Db25maXJtZWQgfTtcblx0XHRcdH1cblx0XHRcdGlmIChhc3Nlc3NtZW50Py5yaXNrID09PSBUb29sUmlza0xldmVsLlJlZCkge1xuXHRcdFx0XHRjb25zdCBmYWxsYmFja0V4cGxhbmF0aW9uID0gbG9jYWxpemUoJ2F1dG9waWxvdFJpc2tTa2lwRmFsbGJhY2snLCBcIlRoZSBhY3Rpb24gd2FzIGFzc2Vzc2VkIGFzIHBvdGVudGlhbGx5IGRlc3RydWN0aXZlIG9yIGlycmV2ZXJzaWJsZS5cIik7XG5cdFx0XHRcdGNvbnN0IGV4cGxhbmF0aW9uID0gYXNzZXNzbWVudC5leHBsYW5hdGlvbi50cmltKCkgfHwgZmFsbGJhY2tFeHBsYW5hdGlvbjtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSNpbnZva2VUb29sXSBBdXRvcGlsb3Qgc2tpcHBpbmcgaGlnaC1yaXNrIHRvb2wgJHt0b29sLmRhdGEuaWR9OiAke2V4cGxhbmF0aW9ufWApO1xuXHRcdFx0XHRyZXR1cm4geyBhdXRvQ29uZmlybWVkOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkIH0sIHNraXBFeHBsYW5hdGlvbjogZXhwbGFuYXRpb24gfTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UjaW52b2tlVG9vbF0gQXV0b3BpbG90IHJpc2sgYXNzZXNzbWVudCBmYWlsZWQgZm9yIHRvb2wgJHt0b29sLmRhdGEuaWR9LCBhbGxvd2luZzogJHt0b0Vycm9yTWVzc2FnZShlcnIpfWApO1xuXHRcdH1cblxuXHRcdC8vIEdyZWVuL29yYW5nZSwgbm8gYXNzZXNzbWVudCwgb3IgYSBmYWlsdXJlOiBrZWVwIHRoZSBvcmlnaW5hbCBhdXRvLWNvbmZpcm1hdGlvbiAoZmFpbCBvcGVuKS5cblx0XHRyZXR1cm4geyBhdXRvQ29uZmlybWVkIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbih0b29sOiBJVG9vbEVudHJ5LCBkdG86IElUb29sSW52b2NhdGlvbiwgZm9yY2VDb25maXJtYXRpb25SZWFzb246IHN0cmluZyB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBwcmVwYXJlZDogSVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRvb2wuaW1wbCEucHJlcGFyZVRvb2xJbnZvY2F0aW9uKSB7XG5cdFx0XHRjb25zdCBwcmVwYXJlUHJvbWlzZSA9IHRvb2wuaW1wbCEucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczogZHRvLnBhcmFtZXRlcnMsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IGR0by5jYWxsSWQsXG5cdFx0XHRcdGNoYXRSZXF1ZXN0SWQ6IGR0by5jaGF0UmVxdWVzdElkLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBkdG8uY29udGV4dD8uc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRjaGF0SW50ZXJhY3Rpb25JZDogZHRvLmNoYXRJbnRlcmFjdGlvbklkLFxuXHRcdFx0XHRtb2RlbElkOiBkdG8ubW9kZWxJZCxcblx0XHRcdFx0Zm9yY2VDb25maXJtYXRpb25SZWFzb246IGZvcmNlQ29uZmlybWF0aW9uUmVhc29uLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBkdG8uY29udGV4dD8ud29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdH0sIHRva2VuKTtcblxuXHRcdFx0Y29uc3QgcmFjZVJlc3VsdCA9IGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRcdHRpbWVvdXQoMzAwMCwgdG9rZW4pLnRoZW4oKCkgPT4gJ3RpbWVvdXQnKSxcblx0XHRcdFx0cHJlcGFyZVByb21pc2Vcblx0XHRcdF0pO1xuXHRcdFx0aWYgKHJhY2VSZXN1bHQgPT09ICd0aW1lb3V0JyAmJiBkdG8uY29udGV4dCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFByZXBhcmVUb29sQ2FsbEJlY29tZVVucmVzcG9uc2l2ZS5maXJlKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGR0by5jb250ZXh0LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHR0b29sRGF0YTogdG9vbC5kYXRhXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRwcmVwYXJlZCA9IGF3YWl0IHByZXBhcmVQcm9taXNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzRWxpZ2libGVGb3JBdXRvQXBwcm92YWwgPSB0aGlzLmlzVG9vbEVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsKHRvb2wuZGF0YSk7XG5cblx0XHQvLyBEZWZhdWx0IGNvbmZpcm1hdGlvbiBtZXNzYWdlcyBpZiB0b29sIGlzIG5vdCBlbGlnaWJsZSBmb3IgYXV0by1hcHByb3ZhbFxuXHRcdGlmICghaXNFbGlnaWJsZUZvckF1dG9BcHByb3ZhbCAmJiAhcHJlcGFyZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSkge1xuXHRcdFx0aWYgKCFwcmVwYXJlZCkge1xuXHRcdFx0XHRwcmVwYXJlZCA9IHt9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZnVsbFJlZmVyZW5jZU5hbWUgPSBnZXRUb29sRnVsbFJlZmVyZW5jZU5hbWUodG9vbC5kYXRhKTtcblxuXHRcdFx0Ly8gVE9ETzogVGhpcyBzaG91bGQgYmUgbW9yZSBkZXRhaWxlZCBwZXIgdG9vbC5cblx0XHRcdHByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzID0ge1xuXHRcdFx0XHQuLi5wcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdkZWZhdWx0VG9vbENvbmZpcm1hdGlvbi50aXRsZScsICdDb25maXJtIHRvb2wgZXhlY3V0aW9uJyksXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdkZWZhdWx0VG9vbENvbmZpcm1hdGlvbi5tZXNzYWdlJywgJ1J1biB0aGUgXFwnezB9XFwnIHRvb2w/JywgZnVsbFJlZmVyZW5jZU5hbWUpLFxuXHRcdFx0XHRkaXNjbGFpbWVyOiB0b29sSWRzVGhhdENhbm5vdEJlQXV0b0FwcHJvdmVkLmhhcyh0b29sLmRhdGEuaWQpID8gdW5kZWZpbmVkIDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdkZWZhdWx0VG9vbENvbmZpcm1hdGlvbi5kaXNjbGFpbWVyJywgJ0F1dG8gYXBwcm92YWwgZm9yIFxcJ3swfVxcJyBpcyByZXN0cmljdGVkIHZpYSB7MX0uJywgZ2V0VG9vbEZ1bGxSZWZlcmVuY2VOYW1lKHRvb2wuZGF0YSksIGNyZWF0ZU1hcmtkb3duQ29tbWFuZExpbmsoeyB0ZXh0OiAnYCcgKyBDaGF0Q29uZmlndXJhdGlvbi5FbGlnaWJsZUZvckF1dG9BcHByb3ZhbCArICdgJywgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncycsIGFyZ3VtZW50czogW0NoYXRDb25maWd1cmF0aW9uLkVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsXSwgdG9vbHRpcDogbG9jYWxpemUoJ29wZW5TZXR0aW5ncy5hdXRvQXBwcm92YWwudG9vbHRpcCcsICdPcGVuIHNldHRpbmdzIHRvIGNvbmZpZ3VyZSBhdXRvLWFwcHJvdmFsJykgfSwgZmFsc2UpKSwgeyBpc1RydXN0ZWQ6IHRydWUgfSksXG5cdFx0XHRcdGFsbG93QXV0b0NvbmZpcm06IGZhbHNlLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoIWlzRWxpZ2libGVGb3JBdXRvQXBwcm92YWwgJiYgcHJlcGFyZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSkge1xuXHRcdFx0Ly8gQWx3YXlzIG92ZXJ3cml0ZSB0aGUgZGlzY2xhaW1lciBpZiBub3QgZWxpZ2libGUgZm9yIGF1dG8tYXBwcm92YWxcblx0XHRcdHByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLmRpc2NsYWltZXIgPSB0b29sSWRzVGhhdENhbm5vdEJlQXV0b0FwcHJvdmVkLmhhcyh0b29sLmRhdGEuaWQpID8gdW5kZWZpbmVkIDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdkZWZhdWx0VG9vbENvbmZpcm1hdGlvbi5kaXNjbGFpbWVyJywgJ0F1dG8gYXBwcm92YWwgZm9yIFxcJ3swfVxcJyBpcyByZXN0cmljdGVkIHZpYSB7MX0uJywgZ2V0VG9vbEZ1bGxSZWZlcmVuY2VOYW1lKHRvb2wuZGF0YSksIGNyZWF0ZU1hcmtkb3duQ29tbWFuZExpbmsoeyB0ZXh0OiAnYCcgKyBDaGF0Q29uZmlndXJhdGlvbi5FbGlnaWJsZUZvckF1dG9BcHByb3ZhbCArICdgJywgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncycsIGFyZ3VtZW50czogW0NoYXRDb25maWd1cmF0aW9uLkVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsXSwgdG9vbHRpcDogbG9jYWxpemUoJ29wZW5TZXR0aW5ncy5hdXRvQXBwcm92YWwudG9vbHRpcCcsICdPcGVuIHNldHRpbmdzIHRvIGNvbmZpZ3VyZSBhdXRvLWFwcHJvdmFsJykgfSwgZmFsc2UpKSwgeyBpc1RydXN0ZWQ6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHByZXBhcmVkPy5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUpIHtcblx0XHRcdGlmIChwcmVwYXJlZC50b29sU3BlY2lmaWNEYXRhPy5raW5kICE9PSAndGVybWluYWwnICYmIHByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLmFsbG93QXV0b0NvbmZpcm0gIT09IGZhbHNlKSB7XG5cdFx0XHRcdHByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLmFsbG93QXV0b0NvbmZpcm0gPSBpc0VsaWdpYmxlRm9yQXV0b0FwcHJvdmFsO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXByZXBhcmVkLnRvb2xTcGVjaWZpY0RhdGEgJiYgdG9vbC5kYXRhLmFsd2F5c0Rpc3BsYXlJbnB1dE91dHB1dCkge1xuXHRcdFx0XHRwcmVwYXJlZC50b29sU3BlY2lmaWNEYXRhID0ge1xuXHRcdFx0XHRcdGtpbmQ6ICdpbnB1dCcsXG5cdFx0XHRcdFx0cmF3SW5wdXQ6IGR0by5wYXJhbWV0ZXJzLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBwcmVwYXJlZDtcblx0fVxuXG5cdGJlZ2luVG9vbENhbGwob3B0aW9uczogSUJlZ2luVG9vbENhbGxPcHRpb25zKTogSUNoYXRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gRmlyc3QgdHJ5IHRvIGxvb2sgdXAgYnkgdG9vbCBJRCAodGhlIHBhY2thZ2UuanNvbiBcIm5hbWVcIiBmaWVsZCksXG5cdFx0Ly8gdGhlbiBmYWxsIGJhY2sgdG8gbG9va2luZyB1cCBieSB0b29sUmVmZXJlbmNlTmFtZVxuXHRcdGNvbnN0IHRvb2xFbnRyeSA9IHRoaXMuX3Rvb2xzLmdldChvcHRpb25zLnRvb2xJZCk7XG5cdFx0aWYgKCF0b29sRW50cnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gRG9uJ3QgY3JlYXRlIGEgc3RyZWFtaW5nIGludm9jYXRpb24gZm9yIHRvb2xzIHRoYXQgZG9uJ3QgaW1wbGVtZW50IGhhbmRsZVRvb2xTdHJlYW0uXG5cdFx0Ly8gVGhlc2UgdG9vbHMgd2lsbCBoYXZlIHRoZWlyIGludm9jYXRpb24gY3JlYXRlZCBkaXJlY3RseSBpbiBpbnZva2VUb29sSW50ZXJuYWwuXG5cdFx0Ly8gQ2FsbGVycyB0aGF0IG5lZWQgYSBoYW5kbGUgcmVnYXJkbGVzcyAoZS5nLiB0byBvYnNlcnZlIGNvbmZpcm1hdGlvbiBzdGF0ZSkgY2FuIHBhc3MgYGZvcmNlYC5cblx0XHRpZiAoIW9wdGlvbnMuZm9yY2UgJiYgIXRvb2xFbnRyeS5pbXBsPy5oYW5kbGVUb29sU3RyZWFtKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSB0aGUgaW52b2NhdGlvbiBpbiBzdHJlYW1pbmcgc3RhdGVcblx0XHRjb25zdCBpbnZvY2F0aW9uID0gQ2hhdFRvb2xJbnZvY2F0aW9uLmNyZWF0ZVN0cmVhbWluZyh7XG5cdFx0XHR0b29sQ2FsbElkOiBvcHRpb25zLnRvb2xDYWxsSWQsXG5cdFx0XHR0b29sSWQ6IG9wdGlvbnMudG9vbElkLFxuXHRcdFx0dG9vbERhdGE6IHRvb2xFbnRyeS5kYXRhLFxuXHRcdFx0c3ViYWdlbnRJbnZvY2F0aW9uSWQ6IG9wdGlvbnMuc3ViYWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0XHRjaGF0UmVxdWVzdElkOiBvcHRpb25zLmNoYXRSZXF1ZXN0SWQsXG5cdFx0fSk7XG5cblx0XHQvLyBUcmFjayB0aGUgcGVuZGluZyB0b29sIGNhbGxcblx0XHR0aGlzLl9wZW5kaW5nVG9vbENhbGxzLnNldChvcHRpb25zLnRvb2xDYWxsSWQsIGludm9jYXRpb24pO1xuXG5cdFx0Ly8gSWYgd2UgaGF2ZSBhIHNlc3Npb24sIGFwcGVuZCB0aGUgaW52b2NhdGlvbiB0byB0aGUgY2hhdCBhcyBwcm9ncmVzc1xuXHRcdGlmIChvcHRpb25zLnNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKG9wdGlvbnMuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHQvLyBGaW5kIHRoZSByZXF1ZXN0IGJ5IGNoYXRSZXF1ZXN0SWQgaWYgYXZhaWxhYmxlLCBvdGhlcndpc2UgdXNlIHRoZSBsYXN0IHJlcXVlc3Rcblx0XHRcdFx0Y29uc3QgcmVxdWVzdCA9IChvcHRpb25zLmNoYXRSZXF1ZXN0SWRcblx0XHRcdFx0XHQ/IG1vZGVsLmdldFJlcXVlc3RzKCkuZmluZChyID0+IHIuaWQgPT09IG9wdGlvbnMuY2hhdFJlcXVlc3RJZClcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCkgPz8gbW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0XHRcdGlmIChyZXF1ZXN0KSB7XG5cdFx0XHRcdFx0dGhpcy5fY2hhdFNlcnZpY2UuYXBwZW5kUHJvZ3Jlc3MocmVxdWVzdCwgaW52b2NhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDYWxsIGhhbmRsZVRvb2xTdHJlYW0gdG8gZ2V0IGluaXRpYWwgc3RyZWFtaW5nIG1lc3NhZ2Vcblx0XHR0aGlzLl9jYWxsSGFuZGxlVG9vbFN0cmVhbSh0b29sRW50cnksIGludm9jYXRpb24sIG9wdGlvbnMudG9vbENhbGxJZCwgdW5kZWZpbmVkLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdHJldHVybiBpbnZvY2F0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2FsbEhhbmRsZVRvb2xTdHJlYW0odG9vbEVudHJ5OiBJVG9vbEVudHJ5LCBpbnZvY2F0aW9uOiBDaGF0VG9vbEludm9jYXRpb24sIHRvb2xDYWxsSWQ6IHN0cmluZywgcmF3SW5wdXQ6IHVua25vd24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdG9vbEVudHJ5LmltcGw/LmhhbmRsZVRvb2xTdHJlYW0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2xFbnRyeS5pbXBsLmhhbmRsZVRvb2xTdHJlYW0oe1xuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRyYXdJbnB1dCxcblx0XHRcdFx0Y2hhdFJlcXVlc3RJZDogaW52b2NhdGlvbi5jaGF0UmVxdWVzdElkLFxuXHRcdFx0fSwgdG9rZW4pO1xuXG5cdFx0XHRpZiAocmVzdWx0Py5pbnZvY2F0aW9uTWVzc2FnZSkge1xuXHRcdFx0XHRpbnZvY2F0aW9uLnVwZGF0ZVN0cmVhbWluZ01lc3NhZ2UocmVzdWx0Lmludm9jYXRpb25NZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UjX2NhbGxIYW5kbGVUb29sU3RyZWFtXSBFcnJvciBjYWxsaW5nIGhhbmRsZVRvb2xTdHJlYW0gZm9yIHRvb2wgJHt0b29sRW50cnkuZGF0YS5pZH06YCwgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVRvb2xTdHJlYW0odG9vbENhbGxJZDogc3RyaW5nLCBwYXJ0aWFsSW5wdXQ6IHVua25vd24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGludm9jYXRpb24gPSB0aGlzLl9wZW5kaW5nVG9vbENhbGxzLmdldCh0b29sQ2FsbElkKTtcblx0XHRpZiAoIWludm9jYXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdGhlIHBhcnRpYWwgaW5wdXQgb24gdGhlIGludm9jYXRpb25cblx0XHRpbnZvY2F0aW9uLnVwZGF0ZVBhcnRpYWxJbnB1dChwYXJ0aWFsSW5wdXQpO1xuXG5cdFx0Ly8gQ2FsbCBoYW5kbGVUb29sU3RyZWFtIGlmIHRoZSB0b29sIGltcGxlbWVudHMgaXRcblx0XHRjb25zdCB0b29sRW50cnkgPSB0aGlzLl90b29scy5nZXQoaW52b2NhdGlvbi50b29sSWQpO1xuXHRcdGlmICh0b29sRW50cnkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2NhbGxIYW5kbGVUb29sU3RyZWFtKHRvb2xFbnRyeSwgaW52b2NhdGlvbiwgdG9vbENhbGxJZCwgcGFydGlhbElucHV0LCB0b2tlbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwbGF5QWNjZXNzaWJpbGl0eVNpZ25hbCh0b29sSW52b2NhdGlvbnM6IENoYXRUb29sSW52b2NhdGlvbltdLCBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBhdXRvQXBwcm92ZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSk7XG5cdFx0aWYgKGF1dG9BcHByb3ZlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEF1dG9waWxvdC9hdXRvLWFwcHJvdmUgcGVybWlzc2lvbiBsZXZlbHMgYXV0by1hcHByb3ZlIGFsbCB0b29scywgc2tpcCBzaWduYWxcblx0XHRpZiAoY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsPy5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRcdGlmIChpc0F1dG9BcHByb3ZlTGV2ZWwocmVxdWVzdD8ubW9kZUluZm8/LnBlcm1pc3Npb25MZXZlbCkgfHwgdGhpcy5faXNTZXNzaW9uTGl2ZUF1dG9BcHByb3ZlTGV2ZWwoY2hhdFNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpbHRlciBvdXQgYW55IHRvb2wgaW52b2NhdGlvbnMgdGhhdCBoYXZlIGFscmVhZHkgYmVlbiBjb25maXJtZWQvZGVuaWVkLlxuXHRcdC8vIFRoaXMgaXMgYSBkZWZlbnNpdmUgY2hlY2sgLSBub3JtYWxseSB0aGUgY2FsbCBzaXRlIHNob3VsZCBwcmV2ZW50IHRoaXMsXG5cdFx0Ly8gYnV0IHRvb2xzIG1heSBiZSBhdXRvLWFwcHJvdmVkIHRocm91Z2ggdmFyaW91cyBtZWNoYW5pc21zIChwZXItc2Vzc2lvbiBydWxlcyxcblx0XHQvLyBwZXItd29ya3NwYWNlIHJ1bGVzLCBldGMuKSB0aGF0IGNvdWxkIGNhdXNlIGEgcmFjZSBjb25kaXRpb24uXG5cdFx0Y29uc3QgcGVuZGluZ0ludm9jYXRpb25zID0gdG9vbEludm9jYXRpb25zLmZpbHRlcihpbnYgPT4gIUlDaGF0VG9vbEludm9jYXRpb24uZXhlY3V0aW9uQ29uZmlybWVkT3JEZW5pZWQoaW52KSk7XG5cdFx0aWYgKHBlbmRpbmdJbnZvY2F0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXR0aW5nOiB7IHNvdW5kPzogJ2F1dG8nIHwgJ29uJyB8ICdvZmYnOyBhbm5vdW5jZW1lbnQ/OiAnYXV0bycgfCAnb2ZmJyB9IHwgdW5kZWZpbmVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQWNjZXNzaWJpbGl0eVNpZ25hbC5jaGF0VXNlckFjdGlvblJlcXVpcmVkLnNldHRpbmdzS2V5KTtcblx0XHRpZiAoIXNldHRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc291bmRFbmFibGVkID0gc2V0dGluZy5zb3VuZCA9PT0gJ29uJyB8fCAoc2V0dGluZy5zb3VuZCA9PT0gJ2F1dG8nICYmICh0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKSk7XG5cdFx0Y29uc3QgYW5ub3VuY2VtZW50RW5hYmxlZCA9IHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkgJiYgc2V0dGluZy5hbm5vdW5jZW1lbnQgPT09ICdhdXRvJztcblx0XHRpZiAoc291bmRFbmFibGVkIHx8IGFubm91bmNlbWVudEVuYWJsZWQpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5jaGF0VXNlckFjdGlvblJlcXVpcmVkLCB7IGN1c3RvbUFsZXJ0TWVzc2FnZTogdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0VG9vbENvbmZpcm1hdGlvbkFsZXJ0LCBwZW5kaW5nSW52b2NhdGlvbnMpLCB1c2VyR2VzdHVyZTogdHJ1ZSwgbW9kYWxpdHk6ICFzb3VuZEVuYWJsZWQgPyAnYW5ub3VuY2VtZW50JyA6IHVuZGVmaW5lZCB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGVuc3VyZVRvb2xEZXRhaWxzKGR0bzogSVRvb2xJbnZvY2F0aW9uLCB0b29sUmVzdWx0OiBJVG9vbFJlc3VsdCwgdG9vbERhdGE6IElUb29sRGF0YSwgdG9vbEludm9jYXRpb246IENoYXRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghdG9vbFJlc3VsdC50b29sUmVzdWx0RGV0YWlscyAmJiAodG9vbERhdGEuYWx3YXlzRGlzcGxheUlucHV0T3V0cHV0IHx8ICh0aGlzLnRvb2xSZXN1bHRIYXNJbWFnZXModG9vbFJlc3VsdCkgJiYgIXRoaXMudG9vbFJlc3VsdE1lc3NhZ2VIYXNJbWFnZUZpbGVXaWRnZXRzKHRvb2xSZXN1bHQsIHRvb2xJbnZvY2F0aW9uKSkpKSB7XG5cdFx0XHR0b29sUmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzID0ge1xuXHRcdFx0XHRpbnB1dDogdGhpcy5mb3JtYXRUb29sSW5wdXQoZHRvKSxcblx0XHRcdFx0b3V0cHV0OiB0aGlzLnRvb2xSZXN1bHRUb0lPKHRvb2xSZXN1bHQpLFxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvb2xSZXN1bHRIYXNJbWFnZXModG9vbFJlc3VsdDogSVRvb2xSZXN1bHQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdG9vbFJlc3VsdC5jb250ZW50LnNvbWUocGFydCA9PiBwYXJ0LmtpbmQgPT09ICdkYXRhJyAmJiBwYXJ0LnZhbHVlLm1pbWVUeXBlPy5zdGFydHNXaXRoKCdpbWFnZS8nKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSB0b29sIHJlc3VsdCBtZXNzYWdlIChvciBmYWxsaW5nIGJhY2sgdG8gdGhlIHRvb2wgaW52b2NhdGlvbidzXG5cdCAqIHBhc3RUZW5zZU1lc3NhZ2UgZnJvbSBzdHJlYW1pbmcpIGNvbnRhaW5zIGVtcHR5IG1hcmtkb3duIGxpbmtzIHBvaW50aW5nIHRvIGltYWdlXG5cdCAqIGZpbGVzICh0aGUgYFtdKGltYWdlVXJpKWAgcGF0dGVybikgdGhhdCB3aWxsIGJlIHJlbmRlcmVkIGFzIGZpbGUgcGlsbHMgYnkgcmVuZGVyRmlsZVdpZGdldHMuXG5cdCAqL1xuXHRwcml2YXRlIHRvb2xSZXN1bHRNZXNzYWdlSGFzSW1hZ2VGaWxlV2lkZ2V0cyh0b29sUmVzdWx0OiBJVG9vbFJlc3VsdCwgdG9vbEludm9jYXRpb246IENoYXRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdC8vIENoZWNrIHRvb2xSZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2UgZmlyc3QgXHUyMDE0IHRoaXMgaXMgd2hhdCBkaWRFeGVjdXRlVG9vbCB3aWxsXG5cdFx0Ly8gY29weSBpbnRvIHBhc3RUZW5zZU1lc3NhZ2UsIGFuZCBpdCdzIGFscmVhZHkgYXZhaWxhYmxlIGF0IHRoaXMgcG9pbnQuXG5cdFx0Ly8gRmFsbCBiYWNrIHRvIHBhc3RUZW5zZU1lc3NhZ2Ugd2hpY2ggbWF5IGhhdmUgYmVlbiBzZXQgZHVyaW5nIHRoZSBzdHJlYW1pbmcgcGhhc2UuXG5cdFx0Y29uc3QgbWVzc2FnZSA9IHRvb2xSZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2UgPz8gdG9vbEludm9jYXRpb24/LnBhc3RUZW5zZU1lc3NhZ2U7XG5cdFx0aWYgKCFtZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlID0gdHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnID8gbWVzc2FnZSA6IG1lc3NhZ2UudmFsdWU7XG5cdFx0Ly8gTWF0Y2ggZW1wdHktdGV4dCBtYXJrZG93biBsaW5rczogW10odXJpKSBvciBbIF0odXJpKSwgY2FwdHVyaW5nIHRoZSB1cmlcblx0XHRjb25zdCBsaW5rUGF0dGVybiA9IC9cXFtcXHMqXFxdXFwoKD88dXJpPlteKV0rKVxcKS9nO1xuXHRcdGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0XHR3aGlsZSAoKG1hdGNoID0gbGlua1BhdHRlcm4uZXhlYyh2YWx1ZSkpICE9PSBudWxsKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBwYXJzZWQgPSBVUkkucGFyc2UobWF0Y2guZ3JvdXBzIS51cmkpO1xuXHRcdFx0XHRjb25zdCBtaW1lID0gZ2V0TWVkaWFNaW1lKHBhcnNlZC5wYXRoKTtcblx0XHRcdFx0aWYgKG1pbWU/LnN0YXJ0c1dpdGgoJ2ltYWdlLycpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBJbnZhbGlkIFVSSSwgc2tpcFxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGZvcm1hdFRvb2xJbnB1dChkdG86IElUb29sSW52b2NhdGlvbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGR0by5wYXJhbWV0ZXJzLCB1bmRlZmluZWQsIDIpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b29sUmVzdWx0VG9JTyh0b29sUmVzdWx0OiBJVG9vbFJlc3VsdCk6IElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzWydvdXRwdXQnXSB7XG5cdFx0cmV0dXJuIHRvb2xSZXN1bHQuY29udGVudC5tYXAocGFydCA9PiB7XG5cdFx0XHRpZiAocGFydC5raW5kID09PSAndGV4dCcpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2VtYmVkJywgaXNUZXh0OiB0cnVlLCB2YWx1ZTogcGFydC52YWx1ZSB9O1xuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LmtpbmQgPT09ICdwcm9tcHRUc3gnKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6ICdlbWJlZCcsIGlzVGV4dDogdHJ1ZSwgdmFsdWU6IHN0cmluZ2lmeVByb21wdFRzeFBhcnQocGFydCkgfTtcblx0XHRcdH0gZWxzZSBpZiAocGFydC5raW5kID09PSAnZGF0YScpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2VtYmVkJywgdmFsdWU6IGVuY29kZUJhc2U2NChwYXJ0LnZhbHVlLmRhdGEpLCBtaW1lVHlwZTogcGFydC52YWx1ZS5taW1lVHlwZSB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXNzZXJ0TmV2ZXIocGFydCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIGVudGVycHJpc2UgcG9saWN5IGhhcyBleHBsaWNpdGx5IGRpc2FibGVkIHRoZSBnbG9iYWwgYXV0by1hcHByb3ZlIHNldHRpbmcuXG5cdCAqIFdoZW4gdGhpcyBpcyB0aGUgY2FzZSwgQnlwYXNzIEFwcHJvdmFscyBhbmQgQXV0b3BpbG90IHBlcm1pc3Npb24gbGV2ZWxzIHNob3VsZCBub3QgYXV0by1hcHByb3ZlIHRvb2xzLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNBdXRvQXBwcm92ZVBvbGljeVJlc3RyaWN0ZWQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaW5zcGVjdGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSk7XG5cdFx0cmV0dXJuIGluc3BlY3RlZC5wb2xpY3lWYWx1ZSA9PT0gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSBzZXNzaW9uJ3MgY3VycmVudCAobGl2ZSkgcGVybWlzc2lvbiBwaWNrZXIgbGV2ZWwgaXMgYXV0by1hcHByb3ZlLlxuXHQgKiBUaGlzIGNoZWNrcyB0aGUgd2lkZ2V0J3MgY3VycmVudCBzdGF0ZSwgbm90IHdoYXQgd2FzIHN0YW1wZWQgb24gdGhlIHJlcXVlc3QsXG5cdCAqIHNvIHN3aXRjaGluZyB0byBBdXRvcGlsb3QgbWlkLXNlc3Npb24gdGFrZXMgZWZmZWN0IGltbWVkaWF0ZWx5LlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNTZXNzaW9uTGl2ZUF1dG9BcHByb3ZlTGV2ZWwoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoY2hhdFNlc3Npb25SZXNvdXJjZSlcblx0XHRcdD8/IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdHJldHVybiAhIXdpZGdldCAmJiBpc0F1dG9BcHByb3ZlTGV2ZWwod2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlSW5mby5wZXJtaXNzaW9uTGV2ZWwpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRydWUgaWYgdGhlIHNlc3Npb24gaXMgaW4gYW4gYXV0by1hcHByb3ZlIGxldmVsIChBdXRvLUFwcHJvdmUgLyBBdXRvcGlsb3QpLFxuXHQgKiB2aWEgZWl0aGVyIHRoZSBsYXN0IHJlcXVlc3QncyBzdGFtcGVkIGxldmVsIG9yIHRoZSBsaXZlIHBpY2tlciBsZXZlbC5cblx0ICovXG5cdHByaXZhdGUgX2lzU2Vzc2lvbkluQXV0b0FwcHJvdmVMZXZlbChjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIWNoYXRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbD8uZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0cmV0dXJuIGlzQXV0b0FwcHJvdmVMZXZlbChyZXF1ZXN0Py5tb2RlSW5mbz8ucGVybWlzc2lvbkxldmVsKSB8fCB0aGlzLl9pc1Nlc3Npb25MaXZlQXV0b0FwcHJvdmVMZXZlbChjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcnVlIGlmIHRoZSBzZXNzaW9uJ3MgbGl2ZSBwZXJtaXNzaW9uIHBpY2tlciBsZXZlbCBpcyBBdXRvcGlsb3QuIExpa2Vcblx0ICoge0BsaW5rIF9pc1Nlc3Npb25MaXZlQXV0b0FwcHJvdmVMZXZlbH0sIGJ1dCBleGNsdWRlcyBwbGFpbiBBdXRvLUFwcHJvdmUuXG5cdCAqL1xuXHRwcml2YXRlIF9pc1Nlc3Npb25MaXZlQXV0b3BpbG90TGV2ZWwoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoY2hhdFNlc3Npb25SZXNvdXJjZSlcblx0XHRcdD8/IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdHJldHVybiAhIXdpZGdldCAmJiBpc0F1dG9waWxvdExldmVsKHdpZGdldC5pbnB1dC5jdXJyZW50TW9kZUluZm8ucGVybWlzc2lvbkxldmVsKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcnVlIGlmIHRoZSBzZXNzaW9uIGlzIGF0IHRoZSBBdXRvcGlsb3QgbGV2ZWwgKG5vdCBwbGFpbiBBdXRvLUFwcHJvdmUpLCB2aWEgZWl0aGVyIHRoZSBsYXN0XG5cdCAqIHJlcXVlc3QncyBzdGFtcGVkIGxldmVsIG9yIHRoZSBsaXZlIHBpY2tlciBsZXZlbC5cblx0ICovXG5cdHByaXZhdGUgX2lzU2Vzc2lvbkluQXV0b3BpbG90TGV2ZWwoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFjaGF0U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gbW9kZWw/LmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdHJldHVybiBpc0F1dG9waWxvdExldmVsKHJlcXVlc3Q/Lm1vZGVJbmZvPy5wZXJtaXNzaW9uTGV2ZWwpIHx8IHRoaXMuX2lzU2Vzc2lvbkxpdmVBdXRvcGlsb3RMZXZlbChjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RWxpZ2libGVGb3JBdXRvQXBwcm92YWxTcGVjaWFsQ2FzZSh0b29sRGF0YTogSVRvb2xEYXRhKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodG9vbERhdGEuaWQgPT09ICd2c2NvZGVfZmV0Y2hXZWJQYWdlX2ludGVybmFsJykge1xuXHRcdFx0cmV0dXJuICdmZXRjaCc7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGlzVG9vbEVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsKHRvb2xEYXRhOiBJVG9vbERhdGEpOiBib29sZWFuIHtcblx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZSA9IHRoaXMuZ2V0RWxpZ2libGVGb3JBdXRvQXBwcm92YWxTcGVjaWFsQ2FzZSh0b29sRGF0YSkgPz8gZ2V0VG9vbEZ1bGxSZWZlcmVuY2VOYW1lKHRvb2xEYXRhKTtcblx0XHRpZiAodG9vbERhdGEuaWQgPT09ICdjb3BpbG90X2ZldGNoV2ViUGFnZScpIHtcblx0XHRcdC8vIFNwZWNpYWwgY2FzZSwgdGhpcyBmZXRjaCB3aWxsIGNhbGwgYW4gaW50ZXJuYWwgdG9vbCAndnNjb2RlX2ZldGNoV2ViUGFnZV9pbnRlcm5hbCdcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodG9vbElkc1RoYXRDYW5ub3RCZUF1dG9BcHByb3ZlZC5oYXModG9vbERhdGEuaWQpKSB7XG5cdFx0XHQvLyBTcGVjaWFsIGNhc2UsIHRoaXMgdG9vbCB3aWxsIGFsd2F5cyByZXF1aXJlIHVzZXIgY29uZmlybWF0aW9uIGFzIHRoZXJlIGFyZSBtdWx0aXBsZSBvcHRpb25zLFxuXHRcdFx0Ly8gVGhlc2UgYXJlbid0IExNIGdlbmVyYXRlZCBpbnN0ZWFkIGFyZSBnZW5lcmF0ZWQgYnkgZXh0ZW5zaW9uIGJlZm9yZSBhZ2VudGljIGxvb3Agc3RhcnRzLlxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBlbGlnaWJpbGl0eUNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PihDaGF0Q29uZmlndXJhdGlvbi5FbGlnaWJsZUZvckF1dG9BcHByb3ZhbCk7XG5cdFx0aWYgKGVsaWdpYmlsaXR5Q29uZmlnICYmIHR5cGVvZiBlbGlnaWJpbGl0eUNvbmZpZyA9PT0gJ29iamVjdCcgJiYgZnVsbFJlZmVyZW5jZU5hbWUpIHtcblx0XHRcdC8vIERpcmVjdCBtYXRjaFxuXHRcdFx0aWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChlbGlnaWJpbGl0eUNvbmZpZywgZnVsbFJlZmVyZW5jZU5hbWUpKSB7XG5cdFx0XHRcdHJldHVybiBlbGlnaWJpbGl0eUNvbmZpZ1tmdWxsUmVmZXJlbmNlTmFtZV07XG5cdFx0XHR9XG5cdFx0XHQvLyBCYWNrIGNvbXBhdCB3aXRoIGxlZ2FjeSBuYW1lc1xuXHRcdFx0aWYgKHRvb2xEYXRhLmxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBsZWdhY3lOYW1lIG9mIHRvb2xEYXRhLmxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXMpIHtcblx0XHRcdFx0XHQvLyBDaGVjayBpZiB0aGUgZnVsbCBsZWdhY3kgbmFtZSBpcyBpbiB0aGUgY29uZmlnXG5cdFx0XHRcdFx0aWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChlbGlnaWJpbGl0eUNvbmZpZywgbGVnYWN5TmFtZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBlbGlnaWJpbGl0eUNvbmZpZ1tsZWdhY3lOYW1lXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gU29tZSB0b29scyBtYXkgYmUgYm90aCByZW5hbWVkIGFuZCBuYW1lc3BhY2VkIGZyb20gYSB0b29sc2V0LCBlZzogeHh4L3l5eSAtPiB5eXlcblx0XHRcdFx0XHRpZiAobGVnYWN5TmFtZS5pbmNsdWRlcygnLycpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0cmltbWVkTGVnYWN5TmFtZSA9IGxlZ2FjeU5hbWUuc3BsaXQoJy8nKS5wb3AoKTtcblx0XHRcdFx0XHRcdGlmICh0cmltbWVkTGVnYWN5TmFtZSAmJiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZWxpZ2liaWxpdHlDb25maWcsIHRyaW1tZWRMZWdhY3lOYW1lKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxpZ2liaWxpdHlDb25maWdbdHJpbW1lZExlZ2FjeU5hbWVdO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvdWxkQXV0b0NvbmZpcm0odG9vbElkOiBzdHJpbmcsIHJ1bnNJbldvcmtzcGFjZTogYm9vbGVhbiB8IHVuZGVmaW5lZCwgc291cmNlOiBUb29sRGF0YVNvdXJjZSwgcGFyYW1ldGVyczogdW5rbm93biwgY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBjaGF0UmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbWJpbmF0aW9uPzogeyBsYWJlbDogc3RyaW5nOyBrZXk6IHN0cmluZyB9LCB3b3JraW5nRGlyZWN0b3J5PzogVVJJKTogUHJvbWlzZTxDb25maXJtZWRSZWFzb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB0b29sID0gdGhpcy5fdG9vbHMuZ2V0KHRvb2xJZCk7XG5cdFx0aWYgKCF0b29sKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEJ5cGFzcyBjb25maXJtYXRpb24gdW5kZXIgQXV0by1BcHByb3ZlIC8gQXV0b3BpbG90LCB1bmxlc3MgZW50ZXJwcmlzZVxuXHRcdC8vIHBvbGljeSBkaXNhYmxlcyBnbG9iYWwgYXV0by1hcHByb3ZlLlxuXHRcdGlmIChjaGF0U2Vzc2lvblJlc291cmNlICYmICF0aGlzLl9pc0F1dG9BcHByb3ZlUG9saWN5UmVzdHJpY3RlZCgpICYmIHRoaXMuX2lzU2Vzc2lvbkluQXV0b0FwcHJvdmVMZXZlbChjaGF0U2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0Ly8gQ0xJIHNlc3Npb25zIHN0aWxsIG5lZWQgdGhlaXIgbXVsdGktb3B0aW9uIGRpYWxvZ3MgKGUuZy4gdW5jb21taXR0ZWQgY2hhbmdlcykuXG5cdFx0XHRpZiAoISh0b29sSWRzVGhhdENhbm5vdEJlQXV0b0FwcHJvdmVkLmhhcyh0b29sLmRhdGEuaWQpICYmIGdldENoYXRTZXNzaW9uVHlwZShjaGF0U2Vzc2lvblJlc291cmNlKSAhPT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUpKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQsIHJlYXNvbjogYXV0b0FwcHJvdmVBbGxSZWFzb24gfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuaXNUb29sRWxpZ2libGVGb3JBdXRvQXBwcm92YWwodG9vbC5kYXRhKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZWFzb24gPSB0aGlzLl9jb25maXJtYXRpb25TZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24oeyB0b29sSWQsIHNvdXJjZSwgcGFyYW1ldGVycywgY2hhdFNlc3Npb25SZXNvdXJjZSwgd29ya2luZ0RpcmVjdG9yeSwgY29tYmluYXRpb24gfSk7XG5cdFx0aWYgKHJlYXNvbikge1xuXHRcdFx0cmV0dXJuIHJlYXNvbjtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PGJvb2xlYW4gfCBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj4oQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmUpO1xuXG5cdFx0Ly8gSWYgd2Uga25vdyB0aGUgdG9vbCBydW5zIGF0IGEgZ2xvYmFsIGxldmVsLCBvbmx5IGNvbnNpZGVyIHRoZSBnbG9iYWwgY29uZmlnLlxuXHRcdC8vIElmIHdlIGtub3cgdGhlIHRvb2wgcnVucyBhdCBhIHdvcmtzcGFjZSBsZXZlbCwgdXNlIHRob3NlIHNwZWNpZmljIHNldHRpbmdzIHdoZW4gYXBwcm9wcmlhdGUuXG5cdFx0bGV0IHZhbHVlID0gY29uZmlnLnZhbHVlID8/IGNvbmZpZy5kZWZhdWx0VmFsdWU7XG5cdFx0aWYgKHR5cGVvZiBydW5zSW5Xb3Jrc3BhY2UgPT09ICdib29sZWFuJykge1xuXHRcdFx0dmFsdWUgPSBjb25maWcudXNlckxvY2FsVmFsdWUgPz8gY29uZmlnLmFwcGxpY2F0aW9uVmFsdWU7XG5cdFx0XHRpZiAocnVuc0luV29ya3NwYWNlKSB7XG5cdFx0XHRcdHZhbHVlID0gY29uZmlnLndvcmtzcGFjZVZhbHVlID8/IGNvbmZpZy53b3Jrc3BhY2VGb2xkZXJWYWx1ZSA/PyBjb25maWcudXNlclJlbW90ZVZhbHVlID8/IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGF1dG9Db25maXJtID0gdmFsdWUgPT09IHRydWUgfHwgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuaGFzT3duUHJvcGVydHkodG9vbElkKSAmJiB2YWx1ZVt0b29sSWRdID09PSB0cnVlKTtcblx0XHRpZiAoYXV0b0NvbmZpcm0pIHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl9jaGVja0dsb2JhbEF1dG9BcHByb3ZlKCkpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlNldHRpbmcsIGlkOiBDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3VsZEF1dG9Db25maXJtUG9zdEV4ZWN1dGlvbih0b29sSWQ6IHN0cmluZywgcnVuc0luV29ya3NwYWNlOiBib29sZWFuIHwgdW5kZWZpbmVkLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLCBwYXJhbWV0ZXJzOiB1bmtub3duLCBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGNoYXRSZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgd29ya2luZ0RpcmVjdG9yeT86IFVSSSk6IFByb21pc2U8Q29uZmlybWVkUmVhc29uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gQnlwYXNzIHBvc3QtZXhlY3V0aW9uIGNvbmZpcm1hdGlvbiB1bmRlciBBdXRvLUFwcHJvdmUgLyBBdXRvcGlsb3QsXG5cdFx0Ly8gdW5sZXNzIGVudGVycHJpc2UgcG9saWN5IGRpc2FibGVzIGdsb2JhbCBhdXRvLWFwcHJvdmUuXG5cdFx0Y29uc3Qgc2Vzc2lvbkF1dG9BcHByb3ZlID0gY2hhdFNlc3Npb25SZXNvdXJjZSAmJiAhdGhpcy5faXNBdXRvQXBwcm92ZVBvbGljeVJlc3RyaWN0ZWQoKSAmJiB0aGlzLl9pc1Nlc3Npb25JbkF1dG9BcHByb3ZlTGV2ZWwoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKHNlc3Npb25BdXRvQXBwcm92ZSkge1xuXHRcdFx0aWYgKCEodG9vbElkc1RoYXRDYW5ub3RCZUF1dG9BcHByb3ZlZC5oYXModG9vbElkKSAmJiBnZXRDaGF0U2Vzc2lvblR5cGUoY2hhdFNlc3Npb25SZXNvdXJjZSEpICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCwgcmVhc29uOiBhdXRvQXBwcm92ZUFsbFJlYXNvbiB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERvbid0IHNob3cgdGhlIFlPTE8gb3B0LWluIGRpYWxvZyB1bmRlciBhdXRvcGlsb3Q6IHRoaXMgcnVucyBhZnRlciB0aGVcblx0XHQvLyB0b29sIHJlc3VsdCBpcyBhbHJlYWR5IGJhY2sgaW4gdGhlIGFnZW50IGxvb3AsIHNvIGl0IGNhbid0IGJsb2NrIGFueXRoaW5nLlxuXHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSkgJiYgIXNlc3Npb25BdXRvQXBwcm92ZSAmJiBhd2FpdCB0aGlzLl9jaGVja0dsb2JhbEF1dG9BcHByb3ZlKCkpIHtcblx0XHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5TZXR0aW5nLCBpZDogQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmUgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fY29uZmlybWF0aW9uU2VydmljZS5nZXRQb3N0Q29uZmlybUFjdGlvbih7IHRvb2xJZCwgc291cmNlLCBwYXJhbWV0ZXJzLCBjaGF0U2Vzc2lvblJlc291cmNlLCB3b3JraW5nRGlyZWN0b3J5IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2hlY2tHbG9iYWxBdXRvQXBwcm92ZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBvcHRlZEluID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihBdXRvQXBwcm92ZVN0b3JhZ2VLZXlzLkdsb2JhbEF1dG9BcHByb3ZlT3B0SW4sIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXHRcdGlmIChvcHRlZEluKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKFNraXBBdXRvQXBwcm92ZUNvbmZpcm1hdGlvbktleSkgPT09IHRydWUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9wZW5kaW5nR2xvYmFsQXV0b0FwcHJvdmVDaGVjaykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdHbG9iYWxBdXRvQXBwcm92ZUNoZWNrO1xuXHRcdH1cblxuXHRcdHRoaXMuX3BlbmRpbmdHbG9iYWxBdXRvQXBwcm92ZUNoZWNrID0gdGhpcy5fZG9DaGVja0dsb2JhbEF1dG9BcHByb3ZlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9wZW5kaW5nR2xvYmFsQXV0b0FwcHJvdmVDaGVjaztcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0dsb2JhbEF1dG9BcHByb3ZlQ2hlY2sgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9DaGVja0dsb2JhbEF1dG9BcHByb3ZlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBEaXNtaXNzIHRoZSBkaWFsb2cgYXV0b21hdGljYWxseSBpZiBhbm90aGVyIHdpbmRvdyBzdG9yZXMgdGhlXG5cdFx0XHQvLyBvcHQtaW4gZmxhZywgYXZvaWRpbmcgZHVwbGljYXRlIGFwcHJvdmFsIHByb21wdHMuXG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHN0b3JlLmFkZChjdHMpO1xuXHRcdFx0c3RvcmUuYWRkKHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBBdXRvQXBwcm92ZVN0b3JhZ2VLZXlzLkdsb2JhbEF1dG9BcHByb3ZlT3B0SW4sIHN0b3JlKSgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKEF1dG9BcHByb3ZlU3RvcmFnZUtleXMuR2xvYmFsQXV0b0FwcHJvdmVPcHRJbiwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSkpIHtcblx0XHRcdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgcHJvbXB0UmVzdWx0ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUyLnRpdGxlJywgJ0VuYWJsZSBnbG9iYWwgYXV0byBhcHByb3ZlPycpLFxuXHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhdXRvQXBwcm92ZTIuYnV0dG9uLmVuYWJsZScsICdFbmFibGUnKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdHJ1ZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhdXRvQXBwcm92ZTIuYnV0dG9uLmRpc2FibGUnLCAnRGlzYWJsZScpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBmYWxzZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRcdGljb246IENvZGljb24ud2FybmluZyxcblx0XHRcdFx0XHRtYXJrZG93bkRldGFpbHM6IFt7XG5cdFx0XHRcdFx0XHRtYXJrZG93bjogbmV3IE1hcmtkb3duU3RyaW5nKGdsb2JhbEF1dG9BcHByb3ZlRGVzY3JpcHRpb24udmFsdWUsIHsgaXNUcnVzdGVkOiB7IGVuYWJsZWRDb21tYW5kczogWyd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncyddIH0gfSksXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRva2VuOiBjdHMudG9rZW4sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gSWYgY2FuY2VsbGVkIGJ5IGNyb3NzLXdpbmRvdyBhcHByb3ZhbCwgdHJlYXQgYXMgYXBwcm92ZWRcblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcm9tcHRSZXN1bHQucmVzdWx0ICE9PSB0cnVlKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlLCBmYWxzZSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQXV0b0FwcHJvdmVTdG9yYWdlS2V5cy5HbG9iYWxBdXRvQXBwcm92ZU9wdEluLCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xlYW51cENhbGxEaXNwb3NhYmxlcyhyZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdGlmIChyZXF1ZXN0SWQpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5fY2FsbHNCeVJlcXVlc3RJZC5nZXQocmVxdWVzdElkKTtcblx0XHRcdGlmIChkaXNwb3NhYmxlcykge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IGRpc3Bvc2FibGVzLmZpbmRJbmRleChkID0+IGQuc3RvcmUgPT09IHN0b3JlKTtcblx0XHRcdFx0aWYgKGluZGV4ID4gLTEpIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChkaXNwb3NhYmxlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9jYWxsc0J5UmVxdWVzdElkLmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9XG5cblx0Y2FuY2VsVG9vbENhbGxzRm9yUmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNhbGxzID0gdGhpcy5fY2FsbHNCeVJlcXVlc3RJZC5nZXQocmVxdWVzdElkKTtcblx0XHRpZiAoY2FsbHMpIHtcblx0XHRcdGNhbGxzLmZvckVhY2goY2FsbCA9PiBjYWxsLnN0b3JlLmRpc3Bvc2UoKSk7XG5cdFx0XHR0aGlzLl9jYWxsc0J5UmVxdWVzdElkLmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdH1cblxuXHRcdC8vIENsZWFuIHVwIGFueSBwZW5kaW5nIHRvb2wgY2FsbHMgdGhhdCBiZWxvbmcgdG8gdGhpcyByZXF1ZXN0XG5cdFx0Zm9yIChjb25zdCBbdG9vbENhbGxJZCwgaW52b2NhdGlvbl0gb2YgdGhpcy5fcGVuZGluZ1Rvb2xDYWxscykge1xuXHRcdFx0aWYgKGludm9jYXRpb24uY2hhdFJlcXVlc3RJZCA9PT0gcmVxdWVzdElkKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdUb29sQ2FsbHMuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGdpdGh1Yk1DUFNlcnZlckFsaWFzZXMgPSBbJ2dpdGh1Yi9naXRodWItbWNwLXNlcnZlcicsICdpby5naXRodWIuZ2l0aHViL2dpdGh1Yi1tY3Atc2VydmVyJywgJ2dpdGh1Yi1tY3Atc2VydmVyJ107XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IHBsYXl3cmlnaHRNQ1BTZXJ2ZXJBbGlhc2VzID0gWydtaWNyb3NvZnQvcGxheXdyaWdodC1tY3AnLCAnY29tLm1pY3Jvc29mdC9wbGF5d3JpZ2h0LW1jcCddO1xuXG5cdHByaXZhdGUgKmdldFRvb2xTZXRBbGlhc2VzKHRvb2xTZXQ6IFRvb2xTZXQsIGZ1bGxSZWZlcmVuY2VOYW1lOiBzdHJpbmcpOiBJdGVyYWJsZTxzdHJpbmc+IHtcblx0XHRpZiAoZnVsbFJlZmVyZW5jZU5hbWUgIT09IHRvb2xTZXQucmVmZXJlbmNlTmFtZSkge1xuXHRcdFx0eWllbGQgdG9vbFNldC5yZWZlcmVuY2VOYW1lOyAvLyB0b29sIHNldCBuYW1lIHdpdGhvdXQgJy8qJ1xuXHRcdH1cblx0XHRpZiAodG9vbFNldC5sZWdhY3lGdWxsTmFtZXMpIHtcblx0XHRcdHlpZWxkKiB0b29sU2V0LmxlZ2FjeUZ1bGxOYW1lcztcblx0XHR9XG5cdFx0c3dpdGNoICh0b29sU2V0LnJlZmVyZW5jZU5hbWUpIHtcblx0XHRcdGNhc2UgJ2dpdGh1Yic6XG5cdFx0XHRcdGZvciAoY29uc3QgYWxpYXMgb2YgTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5naXRodWJNQ1BTZXJ2ZXJBbGlhc2VzKSB7XG5cdFx0XHRcdFx0eWllbGQgYWxpYXMgKyAnLyonO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAncGxheXdyaWdodCc6XG5cdFx0XHRcdGZvciAoY29uc3QgYWxpYXMgb2YgTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5wbGF5d3JpZ2h0TUNQU2VydmVyQWxpYXNlcykge1xuXHRcdFx0XHRcdHlpZWxkIGFsaWFzICsgJy8qJztcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3BlY2VkVG9vbEFsaWFzZXMuZXhlY3V0ZTogLy8gJ2V4ZWN1dGUnXG5cdFx0XHRcdHlpZWxkICdzaGVsbCc7IC8vIGxlZ2FjeSBhbGlhc1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3BlY2VkVG9vbEFsaWFzZXMuYWdlbnQ6IC8vICdhZ2VudCdcblx0XHRcdFx0eWllbGQgVlNDb2RlVG9vbFJlZmVyZW5jZS5ydW5TdWJhZ2VudDsgLy8gcHJlZmVyIHRoZSB0b29sIHNldCBvdmVyIHRoIG9sZCB0b29sIG5hbWVcblx0XHRcdFx0eWllbGQgJ2N1c3RvbS1hZ2VudCc7IC8vIGxlZ2FjeSBhbGlhc1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlICogZ2V0VG9vbEFsaWFzZXModG9vbFNldDogSVRvb2xEYXRhLCBmdWxsUmVmZXJlbmNlTmFtZTogc3RyaW5nKTogSXRlcmFibGU8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcmVmZXJlbmNlTmFtZSA9IHRvb2xTZXQudG9vbFJlZmVyZW5jZU5hbWUgPz8gdG9vbFNldC5kaXNwbGF5TmFtZTtcblx0XHRpZiAoZnVsbFJlZmVyZW5jZU5hbWUgIT09IHJlZmVyZW5jZU5hbWUgJiYgcmVmZXJlbmNlTmFtZSAhPT0gVlNDb2RlVG9vbFJlZmVyZW5jZS5ydW5TdWJhZ2VudCkge1xuXHRcdFx0eWllbGQgcmVmZXJlbmNlTmFtZTsgLy8gc2ltcGxlIG5hbWUsIHdpdGhvdXQgdG9vbHNldCBuYW1lXG5cdFx0fVxuXHRcdGlmICh0b29sU2V0LmxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXMpIHtcblx0XHRcdGZvciAoY29uc3QgbGVnYWN5TmFtZSBvZiB0b29sU2V0LmxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXMpIHtcblx0XHRcdFx0eWllbGQgbGVnYWN5TmFtZTtcblx0XHRcdFx0Y29uc3QgbGFzdFNsYXNoSW5kZXggPSBsZWdhY3lOYW1lLmxhc3RJbmRleE9mKCcvJyk7XG5cdFx0XHRcdGlmIChsYXN0U2xhc2hJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHR5aWVsZCBsZWdhY3lOYW1lLnN1YnN0cmluZyhsYXN0U2xhc2hJbmRleCArIDEpOyAvLyBpdCB3YXMgYWxzbyBrbm93biB1bmRlciB0aGUgc2ltcGxlIG5hbWVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzbGFzaEluZGV4ID0gZnVsbFJlZmVyZW5jZU5hbWUubGFzdEluZGV4T2YoJy8nKTtcblx0XHRpZiAoc2xhc2hJbmRleCAhPT0gLTEpIHtcblx0XHRcdHN3aXRjaCAoZnVsbFJlZmVyZW5jZU5hbWUuc3Vic3RyaW5nKDAsIHNsYXNoSW5kZXgpKSB7XG5cdFx0XHRcdGNhc2UgJ2dpdGh1Yic6XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBhbGlhcyBvZiBMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdpdGh1Yk1DUFNlcnZlckFsaWFzZXMpIHtcblx0XHRcdFx0XHRcdHlpZWxkIGFsaWFzICsgZnVsbFJlZmVyZW5jZU5hbWUuc3Vic3RyaW5nKHNsYXNoSW5kZXgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAncGxheXdyaWdodCc6XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBhbGlhcyBvZiBMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLnBsYXl3cmlnaHRNQ1BTZXJ2ZXJBbGlhc2VzKSB7XG5cdFx0XHRcdFx0XHR5aWVsZCBhbGlhcyArIGZ1bGxSZWZlcmVuY2VOYW1lLnN1YnN0cmluZyhzbGFzaEluZGV4KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG1hcCB0aGF0IGNvbnRhaW5zIGFsbCB0b29scyBhbmQgdG9vbHNldHMgd2l0aCB0aGVpciBlbmFibGVtZW50IHN0YXRlLlxuXHQgKiBAcGFyYW0gZnVsbFJlZmVyZW5jZU5hbWVzIEEgbGlzdCBvZiB0b29sIG9yIHRvb2xzZXQgYnkgdGhlaXIgZnVsbCByZWZlcmVuY2UgbmFtZXMgdGhhdCBhcmUgZW5hYmxlZC5cblx0ICogQHJldHVybnMgQSBtYXAgb2YgdG9vbCBvciB0b29sc2V0IGluc3RhbmNlcyB0byB0aGVpciBlbmFibGVtZW50IHN0YXRlLlxuXHQgKi9cblx0dG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoZnVsbFJlZmVyZW5jZU5hbWVzOiByZWFkb25seSBzdHJpbmdbXSwgbW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkKTogVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwIHtcblx0XHRjb25zdCB0b29sT3JUb29sU2V0TmFtZXMgPSBuZXcgU2V0KGZ1bGxSZWZlcmVuY2VOYW1lcyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxJVG9vbFNldCB8IElUb29sRGF0YSwgYm9vbGVhbj4oKTtcblx0XHRmb3IgKGNvbnN0IFt0b29sLCBmdWxsUmVmZXJlbmNlTmFtZV0gb2YgdGhpcy50b29sc1dpdGhGdWxsUmVmZXJlbmNlTmFtZS5nZXQoKSkge1xuXHRcdFx0aWYgKGlzVG9vbFNldCh0b29sKSkge1xuXHRcdFx0XHRjb25zdCBlbmFibGVkID0gdG9vbE9yVG9vbFNldE5hbWVzLmhhcyhmdWxsUmVmZXJlbmNlTmFtZSkgfHwgSXRlcmFibGUuc29tZSh0aGlzLmdldFRvb2xTZXRBbGlhc2VzKHRvb2wsIGZ1bGxSZWZlcmVuY2VOYW1lKSwgbmFtZSA9PiB0b29sT3JUb29sU2V0TmFtZXMuaGFzKG5hbWUpKTtcblx0XHRcdFx0Y29uc3Qgc2NvcGVkID0gbW9kZWwgPyBuZXcgVG9vbFNldEZvck1vZGVsKHRvb2wsIG1vZGVsKSA6IHRvb2w7XG5cdFx0XHRcdHJlc3VsdC5zZXQoc2NvcGVkLCBlbmFibGVkKTtcblx0XHRcdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IG1lbWJlclRvb2wgb2Ygc2NvcGVkLmdldFRvb2xzKCkpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5zZXQobWVtYmVyVG9vbCwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoIXRoaXMuaXNUb29sRW5hYmxlZEZvck1vZGVsKHRvb2wsIG1vZGVsKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFyZXN1bHQuaGFzKHRvb2wpKSB7IC8vIGFscmVhZHkgc2V0IHZpYSBhbiBlbmFibGVkIHRvb2xzZXRcblx0XHRcdFx0XHRjb25zdCBlbmFibGVkID0gdG9vbE9yVG9vbFNldE5hbWVzLmhhcyhmdWxsUmVmZXJlbmNlTmFtZSlcblx0XHRcdFx0XHRcdHx8IEl0ZXJhYmxlLnNvbWUodGhpcy5nZXRUb29sQWxpYXNlcyh0b29sLCBmdWxsUmVmZXJlbmNlTmFtZSksIG5hbWUgPT4gdG9vbE9yVG9vbFNldE5hbWVzLmhhcyhuYW1lKSlcblx0XHRcdFx0XHRcdHx8ICEhdG9vbC5sZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzPy5zb21lKHRvb2xGdWxsTmFtZSA9PiB7XG5cdFx0XHRcdFx0XHRcdC8vIGVuYWJsZSB0b29sIGlmIGp1c3QgdGhlIGxlZ2FjeSB0b29sIHNldCBuYW1lIGlzIHByZXNlbnRcblx0XHRcdFx0XHRcdFx0Y29uc3QgaW5kZXggPSB0b29sRnVsbE5hbWUubGFzdEluZGV4T2YoJy8nKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGluZGV4ICE9PSAtMSAmJiB0b29sT3JUb29sU2V0TmFtZXMuaGFzKHRvb2xGdWxsTmFtZS5zdWJzdHJpbmcoMCwgaW5kZXgpKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJlc3VsdC5zZXQodG9vbCwgZW5hYmxlZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBhbHNvIGFkZCBhbGwgdXNlciB0b29sIHNldHMgKG5vdCBwYXJ0IG9mIHRoZSBwcm9tcHQgcmVmZXJlbmNhYmxlIHRvb2xzKVxuXHRcdGZvciAoY29uc3QgdG9vbFNldCBvZiB0aGlzLl90b29sU2V0cykge1xuXHRcdFx0aWYgKHRvb2xTZXQuc291cmNlLnR5cGUgPT09ICd1c2VyJykge1xuXHRcdFx0XHRjb25zdCBlbmFibGVkID0gSXRlcmFibGUuZXZlcnkodG9vbFNldC5nZXRUb29scygpLCB0ID0+IHJlc3VsdC5nZXQodCkgPT09IHRydWUpO1xuXHRcdFx0XHRyZXN1bHQuc2V0KHRvb2xTZXQsIGVuYWJsZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21NYXAocmVzdWx0KTtcblx0fVxuXG5cdHRvRnVsbFJlZmVyZW5jZU5hbWVzKG1hcDogVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCB0b29sc0NvdmVyZWRCeUVuYWJsZWRUb29sU2V0ID0gbmV3IFNldDxJVG9vbERhdGE+KCk7XG5cblx0XHQvLyBjb21wYXJlIGJ5IGlkIGFzIHRvb2xzZXQgaW5zdGFuY2VzIG1heSBiZSBkaWZmZXJlbnQgKGUuZy4gVG9vbFNldEZvck1vZGVsKVxuXHRcdGNvbnN0IGVuYWJsZWRUb29sU2V0SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgZW5hYmxlZFRvb2xJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IFt0b29sLCBlbmFibGVkXSBvZiBtYXApIHtcblx0XHRcdGlmIChlbmFibGVkKSB7XG5cdFx0XHRcdGlmIChpc1Rvb2xTZXQodG9vbCkpIHtcblx0XHRcdFx0XHRlbmFibGVkVG9vbFNldElkcy5hZGQodG9vbC5pZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW5hYmxlZFRvb2xJZHMuYWRkKHRvb2wuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW3Rvb2wsIGZ1bGxSZWZlcmVuY2VOYW1lXSBvZiB0aGlzLnRvb2xzV2l0aEZ1bGxSZWZlcmVuY2VOYW1lLmdldCgpKSB7XG5cdFx0XHRpZiAoaXNUb29sU2V0KHRvb2wpKSB7XG5cdFx0XHRcdGlmIChlbmFibGVkVG9vbFNldElkcy5oYXModG9vbC5pZCkpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChmdWxsUmVmZXJlbmNlTmFtZSk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBtZW1iZXJUb29sIG9mIHRvb2wuZ2V0VG9vbHMoKSkge1xuXHRcdFx0XHRcdFx0dG9vbHNDb3ZlcmVkQnlFbmFibGVkVG9vbFNldC5hZGQobWVtYmVyVG9vbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoZW5hYmxlZFRvb2xJZHMuaGFzKHRvb2wuaWQpICYmICF0b29sc0NvdmVyZWRCeUVuYWJsZWRUb29sU2V0Lmhhcyh0b29sKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGZ1bGxSZWZlcmVuY2VOYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0dG9Ub29sUmVmZXJlbmNlcyh2YXJpYWJsZVJlZmVyZW5jZXM6IHJlYWRvbmx5IElWYXJpYWJsZVJlZmVyZW5jZVtdKTogQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnlbXSB7XG5cdFx0Y29uc3QgdG9vbHNPclRvb2xTZXRCeU5hbWUgPSBuZXcgTWFwPHN0cmluZywgVG9vbFNldCB8IElUb29sRGF0YT4oKTtcblx0XHRmb3IgKGNvbnN0IFt0b29sLCBmdWxsUmVmZXJlbmNlTmFtZV0gb2YgdGhpcy50b29sc1dpdGhGdWxsUmVmZXJlbmNlTmFtZS5nZXQoKSkge1xuXHRcdFx0dG9vbHNPclRvb2xTZXRCeU5hbWUuc2V0KGZ1bGxSZWZlcmVuY2VOYW1lLCB0b29sKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IENoYXRSZXF1ZXN0VG9vbFJlZmVyZW5jZUVudHJ5W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlZiBvZiB2YXJpYWJsZVJlZmVyZW5jZXMpIHtcblx0XHRcdGNvbnN0IHRvb2xPclRvb2xTZXQgPSB0b29sc09yVG9vbFNldEJ5TmFtZS5nZXQocmVmLm5hbWUpO1xuXHRcdFx0aWYgKHRvb2xPclRvb2xTZXQpIHtcblx0XHRcdFx0aWYgKGlzVG9vbFNldCh0b29sT3JUb29sU2V0KSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRvVG9vbFNldFZhcmlhYmxlRW50cnkodG9vbE9yVG9vbFNldCwgcmVmLnJhbmdlKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2godG9Ub29sVmFyaWFibGVFbnRyeSh0b29sT3JUb29sU2V0LCByZWYucmFuZ2UpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblxuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sU2V0cyA9IG5ldyBPYnNlcnZhYmxlU2V0PFRvb2xTZXQ+KCk7XG5cblx0cmVhZG9ubHkgdG9vbFNldHM6IElPYnNlcnZhYmxlPEl0ZXJhYmxlPFRvb2xTZXQ+PiA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBhbGxUb29sU2V0cyA9IEFycmF5LmZyb20odGhpcy5fdG9vbFNldHMub2JzZXJ2YWJsZS5yZWFkKHJlYWRlcikpO1xuXHRcdHJldHVybiBhbGxUb29sU2V0cy5maWx0ZXIodG9vbFNldCA9PiB0aGlzLmlzUGVybWl0dGVkKHRvb2xTZXQsIHJlYWRlcikpO1xuXHR9KTtcblxuXHRnZXRUb29sU2V0c0Zvck1vZGVsKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB8IHVuZGVmaW5lZCwgcmVhZGVyPzogSVJlYWRlcik6IEl0ZXJhYmxlPElUb29sU2V0PiB7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMudG9vbFNldHMucmVhZChyZWFkZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBJdGVyYWJsZS5tYXAodGhpcy50b29sU2V0cy5yZWFkKHJlYWRlciksIHRzID0+IG5ldyBUb29sU2V0Rm9yTW9kZWwodHMsIG1vZGVsLCB0b29sRGF0YSA9PiB0aGlzLmlzVG9vbEVuYWJsZWRGb3JNb2RlbCh0b29sRGF0YSwgbW9kZWwpKSk7XG5cdH1cblxuXHRnZXRUb29sU2V0KGlkOiBzdHJpbmcpOiBUb29sU2V0IHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IHRvb2xTZXQgb2YgdGhpcy5fdG9vbFNldHMpIHtcblx0XHRcdGlmICh0b29sU2V0LmlkID09PSBpZCkge1xuXHRcdFx0XHRyZXR1cm4gdG9vbFNldDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldFRvb2xTZXRCeU5hbWUobmFtZTogc3RyaW5nKTogVG9vbFNldCB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCB0b29sU2V0IG9mIHRoaXMuX3Rvb2xTZXRzKSB7XG5cdFx0XHRpZiAodG9vbFNldC5yZWZlcmVuY2VOYW1lID09PSBuYW1lKSB7XG5cdFx0XHRcdHJldHVybiB0b29sU2V0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0U3BlY2VkVG9vbFNldE5hbWUocmVmZXJlbmNlTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAoTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5naXRodWJNQ1BTZXJ2ZXJBbGlhc2VzLmluY2x1ZGVzKHJlZmVyZW5jZU5hbWUpKSB7XG5cdFx0XHRyZXR1cm4gJ2dpdGh1Yic7XG5cdFx0fVxuXHRcdGlmIChMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLnBsYXl3cmlnaHRNQ1BTZXJ2ZXJBbGlhc2VzLmluY2x1ZGVzKHJlZmVyZW5jZU5hbWUpKSB7XG5cdFx0XHRyZXR1cm4gJ3BsYXl3cmlnaHQnO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVmZXJlbmNlTmFtZTtcblx0fVxuXG5cdGNyZWF0ZVRvb2xTZXQoc291cmNlOiBUb29sRGF0YVNvdXJjZSwgaWQ6IHN0cmluZywgcmVmZXJlbmNlTmFtZTogc3RyaW5nLCBvcHRpb25zPzogeyBpY29uPzogVGhlbWVJY29uOyBkZXNjcmlwdGlvbj86IHN0cmluZzsgZGV0YWlsPzogc3RyaW5nOyBsZWdhY3lGdWxsTmFtZXM/OiBzdHJpbmdbXTsgZGVwcmVjYXRlZD86IGJvb2xlYW47IGhpZGRlbkluVG9vbHNQaWNrZXI/OiBib29sZWFuIH0pOiBUb29sU2V0ICYgSURpc3Bvc2FibGUge1xuXG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cblx0XHRyZWZlcmVuY2VOYW1lID0gdGhpcy5nZXRTcGVjZWRUb29sU2V0TmFtZShyZWZlcmVuY2VOYW1lKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBjbGFzcyBleHRlbmRzIFRvb2xTZXQgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdFx0XHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdFx0XHRpZiAodGhhdC5fdG9vbFNldHMuaGFzKHJlc3VsdCkpIHtcblx0XHRcdFx0XHR0aGlzLl90b29scy5jbGVhcigpO1xuXHRcdFx0XHRcdHRoYXQuX3Rvb2xTZXRzLmRlbGV0ZShyZXN1bHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdH1cblx0XHR9KGlkLCByZWZlcmVuY2VOYW1lLCBvcHRpb25zPy5pY29uID8/IENvZGljb24udG9vbHMsIHNvdXJjZSwgb3B0aW9ucz8uZGVzY3JpcHRpb24sIG9wdGlvbnM/LmRldGFpbCwgb3B0aW9ucz8ubGVnYWN5RnVsbE5hbWVzLCBvcHRpb25zPy5kZXByZWNhdGVkLCBvcHRpb25zPy5oaWRkZW5JblRvb2xzUGlja2VyLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl90b29sU2V0cy5hZGQocmVzdWx0KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBhbGxUb29sc0luY2x1ZGluZ0Rpc2FibGVPYnMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50T3B0czxyZWFkb25seSBJVG9vbERhdGFbXSwgdm9pZD4oXG5cdFx0eyBlcXVhbHNGbjogYXJyYXlFcXVhbHNDKCkgfSxcblx0XHR0aGlzLm9uRGlkQ2hhbmdlVG9vbHMsXG5cdFx0KCkgPT4gQXJyYXkuZnJvbSh0aGlzLmdldEFsbFRvb2xzSW5jbHVkaW5nRGlzYWJsZWQoKSksXG5cdCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0b29sc1dpdGhGdWxsUmVmZXJlbmNlTmFtZSA9IGRlcml2ZWQ8W0lUb29sRGF0YSB8IFRvb2xTZXQsIHN0cmluZ11bXT4ocmVhZGVyID0+IHtcblx0XHRjb25zdCByZXN1bHQ6IFtJVG9vbERhdGEgfCBUb29sU2V0LCBzdHJpbmddW10gPSBbXTtcblx0XHRjb25zdCBjb3ZlcmVkQnlUb29sU2V0cyA9IG5ldyBTZXQ8SVRvb2xEYXRhPigpO1xuXHRcdGZvciAoY29uc3QgdG9vbFNldCBvZiB0aGlzLnRvb2xTZXRzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0aWYgKHRvb2xTZXQuc291cmNlLnR5cGUgIT09ICd1c2VyJykge1xuXHRcdFx0XHRyZXN1bHQucHVzaChbdG9vbFNldCwgZ2V0VG9vbFNldEZ1bGxSZWZlcmVuY2VOYW1lKHRvb2xTZXQpXSk7XG5cdFx0XHRcdGZvciAoY29uc3QgdG9vbCBvZiB0b29sU2V0LmdldFRvb2xzKCkpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChbdG9vbCwgZ2V0VG9vbEZ1bGxSZWZlcmVuY2VOYW1lKHRvb2wsIHRvb2xTZXQpXSk7XG5cdFx0XHRcdFx0Y292ZXJlZEJ5VG9vbFNldHMuYWRkKHRvb2wpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgdG9vbCBvZiB0aGlzLmFsbFRvb2xzSW5jbHVkaW5nRGlzYWJsZU9icy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdC8vIHRvZG9AY29ubm9yNDMxMi9hZXNjaGlsOiB0aGlzIGVmZmVjdGl2ZWx5IGhpZGVzIG1vZGVsLXNwZWNpZmljIHRvb2xzXG5cdFx0XHQvLyBmb3IgcHJvbXB0IHJlZmVyZW5jaW5nLiBTaG91bGQgd2UgZXZlbnR1YWxseSBlbmFibGUgdGhpcz8gKElmIHNvIGhvdz8pXG5cdFx0XHRpZiAodG9vbC53aGVuICYmICF0aGlzLl9jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHRvb2wud2hlbikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0b29sLmNhbkJlUmVmZXJlbmNlZEluUHJvbXB0ICYmICFjb3ZlcmVkQnlUb29sU2V0cy5oYXModG9vbCkgJiYgdGhpcy5pc1Blcm1pdHRlZCh0b29sLCByZWFkZXIpKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKFt0b29sLCBnZXRUb29sRnVsbFJlZmVyZW5jZU5hbWUodG9vbCldKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fSk7XG5cblx0KiBnZXRGdWxsUmVmZXJlbmNlTmFtZXMoKTogSXRlcmFibGU8c3RyaW5nPiB7XG5cdFx0Zm9yIChjb25zdCBbLCBmdWxsUmVmZXJlbmNlTmFtZV0gb2YgdGhpcy50b29sc1dpdGhGdWxsUmVmZXJlbmNlTmFtZS5nZXQoKSkge1xuXHRcdFx0eWllbGQgZnVsbFJlZmVyZW5jZU5hbWU7XG5cdFx0fVxuXHR9XG5cblx0Z2V0RGVwcmVjYXRlZEZ1bGxSZWZlcmVuY2VOYW1lcygpOiBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcblx0XHRjb25zdCBrbm93blRvb2xTZXROYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGFkZCA9IChuYW1lOiBzdHJpbmcsIGZ1bGxSZWZlcmVuY2VOYW1lOiBzdHJpbmcpID0+IHtcblx0XHRcdGlmIChuYW1lICE9PSBmdWxsUmVmZXJlbmNlTmFtZSkge1xuXHRcdFx0XHRpZiAoIXJlc3VsdC5oYXMobmFtZSkpIHtcblx0XHRcdFx0XHRyZXN1bHQuc2V0KG5hbWUsIG5ldyBTZXQ8c3RyaW5nPigpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQuZ2V0KG5hbWUpIS5hZGQoZnVsbFJlZmVyZW5jZU5hbWUpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IFt0b29sLCBfXSBvZiB0aGlzLnRvb2xzV2l0aEZ1bGxSZWZlcmVuY2VOYW1lLmdldCgpKSB7XG5cdFx0XHRpZiAoaXNUb29sU2V0KHRvb2wpKSB7XG5cdFx0XHRcdGtub3duVG9vbFNldE5hbWVzLmFkZCh0b29sLnJlZmVyZW5jZU5hbWUpO1xuXHRcdFx0XHRpZiAodG9vbC5sZWdhY3lGdWxsTmFtZXMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGxlZ2FjeU5hbWUgb2YgdG9vbC5sZWdhY3lGdWxsTmFtZXMpIHtcblx0XHRcdFx0XHRcdGtub3duVG9vbFNldE5hbWVzLmFkZChsZWdhY3lOYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFt0b29sLCBmdWxsUmVmZXJlbmNlTmFtZV0gb2YgdGhpcy50b29sc1dpdGhGdWxsUmVmZXJlbmNlTmFtZS5nZXQoKSkge1xuXHRcdFx0aWYgKGlzVG9vbFNldCh0b29sKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGFsaWFzIG9mIHRoaXMuZ2V0VG9vbFNldEFsaWFzZXModG9vbCwgZnVsbFJlZmVyZW5jZU5hbWUpKSB7XG5cdFx0XHRcdFx0YWRkKGFsaWFzLCBmdWxsUmVmZXJlbmNlTmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZvciAoY29uc3QgYWxpYXMgb2YgdGhpcy5nZXRUb29sQWxpYXNlcyh0b29sLCBmdWxsUmVmZXJlbmNlTmFtZSkpIHtcblx0XHRcdFx0XHRhZGQoYWxpYXMsIGZ1bGxSZWZlcmVuY2VOYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodG9vbC5sZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzKSB7XG5cdFx0XHRcdFx0Ly8gSWYgdGhlIHRvb2wgaXMgaW4gYSB0b29sc2V0IChmdWxsUmVmZXJlbmNlTmFtZSBoYXMgYSAnLycpLCBhbHNvIGFkZCB0aGVcblx0XHRcdFx0XHQvLyBuYW1lc3BhY2VkIGZvcm0gb2YgbGVnYWN5IG5hbWVzIChlLmcuICd2c2NvZGUvb2xkTmFtZScgXHUyMTkyICd2c2NvZGUvbmV3TmFtZScpXG5cdFx0XHRcdFx0Y29uc3Qgc2xhc2hJbmRleCA9IGZ1bGxSZWZlcmVuY2VOYW1lLmxhc3RJbmRleE9mKCcvJyk7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbFNldFByZWZpeCA9IHNsYXNoSW5kZXggIT09IC0xID8gZnVsbFJlZmVyZW5jZU5hbWUuc3Vic3RyaW5nKDAsIHNsYXNoSW5kZXggKyAxKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdGZvciAoY29uc3QgbGVnYWN5TmFtZSBvZiB0b29sLmxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXMpIHtcblx0XHRcdFx0XHRcdGlmICh0b29sU2V0UHJlZml4ICYmICFsZWdhY3lOYW1lLmluY2x1ZGVzKCcvJykpIHtcblx0XHRcdFx0XHRcdFx0YWRkKHRvb2xTZXRQcmVmaXggKyBsZWdhY3lOYW1lLCBmdWxsUmVmZXJlbmNlTmFtZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQvLyBmb3IgYW55ICdvcnBoYW5lZCcgdG9vbHNldHMgKHRvb2xzZXRzIHRoYXQgbm8gbG9uZ2VyIGV4aXN0IGFuZFxuXHRcdFx0XHRcdFx0Ly8gZG8gbm90IGhhdmUgYW4gZXhwbGljaXQgbGVnYWN5IG1hcHBpbmcpLCB3ZSBzaG91bGRcblx0XHRcdFx0XHRcdC8vIGp1c3QgcG9pbnQgdGhlbSB0byB0aGUgbGlzdCBvZiB0b29scyBkaXJlY3RseVxuXHRcdFx0XHRcdFx0aWYgKGxlZ2FjeU5hbWUuaW5jbHVkZXMoJy8nKSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB0b29sU2V0RnVsbE5hbWUgPSBsZWdhY3lOYW1lLnN1YnN0cmluZygwLCBsZWdhY3lOYW1lLmxhc3RJbmRleE9mKCcvJykpO1xuXHRcdFx0XHRcdFx0XHRpZiAoIWtub3duVG9vbFNldE5hbWVzLmhhcyh0b29sU2V0RnVsbE5hbWUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0YWRkKHRvb2xTZXRGdWxsTmFtZSwgZnVsbFJlZmVyZW5jZU5hbWUpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZShmdWxsUmVmZXJlbmNlTmFtZTogc3RyaW5nKTogSVRvb2xEYXRhIHwgVG9vbFNldCB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBbdG9vbCwgdG9vbEZ1bGxSZWZlcmVuY2VOYW1lXSBvZiB0aGlzLnRvb2xzV2l0aEZ1bGxSZWZlcmVuY2VOYW1lLmdldCgpKSB7XG5cdFx0XHRpZiAoZnVsbFJlZmVyZW5jZU5hbWUgPT09IHRvb2xGdWxsUmVmZXJlbmNlTmFtZSkge1xuXHRcdFx0XHRyZXR1cm4gdG9vbDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFsaWFzZXMgPSBpc1Rvb2xTZXQodG9vbCkgPyB0aGlzLmdldFRvb2xTZXRBbGlhc2VzKHRvb2wsIHRvb2xGdWxsUmVmZXJlbmNlTmFtZSkgOiB0aGlzLmdldFRvb2xBbGlhc2VzKHRvb2wsIHRvb2xGdWxsUmVmZXJlbmNlTmFtZSk7XG5cdFx0XHRpZiAoSXRlcmFibGUuc29tZShhbGlhc2VzLCBhbGlhcyA9PiBmdWxsUmVmZXJlbmNlTmFtZSA9PT0gYWxpYXMpKSB7XG5cdFx0XHRcdHJldHVybiB0b29sO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0RnVsbFJlZmVyZW5jZU5hbWUodG9vbDogSVRvb2xEYXRhIHwgSVRvb2xTZXQsIHRvb2xTZXQ/OiBJVG9vbFNldCk6IHN0cmluZyB7XG5cdFx0Zm9yIChjb25zdCBbaXRlbSwgdG9vbEZ1bGxSZWZlcmVuY2VOYW1lXSBvZiB0aGlzLnRvb2xzV2l0aEZ1bGxSZWZlcmVuY2VOYW1lLmdldCgpKSB7XG5cdFx0XHRpZiAoaXRlbSA9PT0gdG9vbCkge1xuXHRcdFx0XHRyZXR1cm4gdG9vbEZ1bGxSZWZlcmVuY2VOYW1lO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChpc1Rvb2xTZXQodG9vbCkpIHtcblx0XHRcdHJldHVybiBnZXRUb29sU2V0RnVsbFJlZmVyZW5jZU5hbWUodG9vbCk7XG5cdFx0fVxuXHRcdHJldHVybiBnZXRUb29sRnVsbFJlZmVyZW5jZU5hbWUodG9vbCwgdG9vbFNldCk7XG5cdH1cblxuXHRnZXRGdWxsUmVmZXJlbmNlTmFtZU1hcCgpOiBNYXA8SVRvb2xEYXRhIHwgSVRvb2xTZXQsIHN0cmluZz4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8SVRvb2xEYXRhIHwgSVRvb2xTZXQsIHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IFtpdGVtLCB0b29sRnVsbFJlZmVyZW5jZU5hbWVdIG9mIHRoaXMudG9vbHNXaXRoRnVsbFJlZmVyZW5jZU5hbWUuZ2V0KCkpIHtcblx0XHRcdHJlc3VsdC5zZXQoaXRlbSwgdG9vbEZ1bGxSZWZlcmVuY2VOYW1lKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRUb29sRnVsbFJlZmVyZW5jZU5hbWUodG9vbDogSVRvb2xEYXRhLCB0b29sU2V0PzogSVRvb2xTZXQpIHtcblx0Y29uc3QgdG9vbE5hbWUgPSB0b29sLnRvb2xSZWZlcmVuY2VOYW1lID8/IHRvb2wuZGlzcGxheU5hbWU7XG5cdGlmICh0b29sU2V0KSB7XG5cdFx0cmV0dXJuIGAke3Rvb2xTZXQucmVmZXJlbmNlTmFtZX0vJHt0b29sTmFtZX1gO1xuXHR9IGVsc2UgaWYgKHRvb2wuc291cmNlLnR5cGUgPT09ICdleHRlbnNpb24nKSB7XG5cdFx0cmV0dXJuIGAke3Rvb2wuc291cmNlLmV4dGVuc2lvbklkLnZhbHVlLnRvTG93ZXJDYXNlKCl9LyR7dG9vbE5hbWV9YDtcblx0fVxuXHRyZXR1cm4gdG9vbE5hbWU7XG59XG5cbmZ1bmN0aW9uIGdldFRvb2xTZXRGdWxsUmVmZXJlbmNlTmFtZSh0b29sU2V0OiBJVG9vbFNldCkge1xuXHRpZiAodG9vbFNldC5zb3VyY2UudHlwZSA9PT0gJ21jcCcpIHtcblx0XHRyZXR1cm4gYCR7dG9vbFNldC5yZWZlcmVuY2VOYW1lfS8qYDtcblx0fVxuXHRyZXR1cm4gdG9vbFNldC5yZWZlcmVuY2VOYW1lO1xufVxuXG5cbnR5cGUgVG9vbEFwcHJvdmFsRXZlbnQgPSBMYW5ndWFnZU1vZGVsVG9vbFRlbGVtZXRyeURhdGEgJiB7XG5cdGNvbmZpcm1LaW5kOiBzdHJpbmc7XG5cdHJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRzZXR0aW5nSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bG1TZXJ2aWNlU2NvcGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Y3VzdG9tQnV0dG9uS2luZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRjb25maXJtYXRpb25Ob3ROZWVkZWRSZWFzb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0c2FuZGJveFdyYXBwZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogYm9vbGVhbiB8IHVuZGVmaW5lZDtcbn07XG5cbnR5cGUgVG9vbEFwcHJvdmFsQ2xhc3NpZmljYXRpb24gPSBMYW5ndWFnZU1vZGVsVG9vbFRlbGVtZXRyeUNsYXNzaWZpY2F0aW9uICYge1xuXHRjb25maXJtS2luZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0hvdyB0aGUgY29uZmlybWF0aW9uIHdhcyByZXNvbHZlZCAodXNlckFjdGlvbiwgc2V0dGluZywgbG1TZXJ2aWNlUGVyVG9vbCwgY29uZmlybWF0aW9uTm90TmVlZGVkLCBkZW5pZWQsIHNraXBwZWQpLiBBbnl0aGluZyBvdGhlciB0aGFuIHVzZXJBY3Rpb24gaW1wbGllcyBhdXRvLWFwcHJvdmFsLiBcImRlbmllZFwiIGFuZCBcInNraXBwZWRcIiBtZWFuIHRoZSB0b29sIGRpZCBub3QgcnVuOyBvdGhlcndpc2UgaXQgcmFuIChub3RlOiBhIGN1c3RvbSBEZW55IGJ1dHRvbiBjbGljayByZXNvbHZlcyBhcyB1c2VyQWN0aW9uIHNpbmNlIHRoZSB0b29sIHN0aWxsIHJ1bnMgYW5kIHRoZSBjaG9zZW4gbGFiZWwgaXMgcGFzc2VkIHRvIGl0OyBzZWUgY3VzdG9tQnV0dG9uS2luZCB0byBkaXN0aW5ndWlzaCkuJyB9O1xuXHRyZXF1ZXN0SWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgSUQgb2YgdGhlIGNoYXQgcmVxdWVzdCB0dXJuIHRoYXQgdGhpcyB0b29sIGFwcHJvdmFsIGlzIGFzc29jaWF0ZWQgd2l0aCwgaWYgYXZhaWxhYmxlLicgfTtcblx0c2V0dGluZ0lkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hlbiBjb25maXJtS2luZCBpcyBzZXR0aW5nLCB0aGUgY29uZmlndXJhdGlvbiBpZCB0aGF0IGF1dG8tYXBwcm92ZWQgdGhlIHRvb2wuJyB9O1xuXHRsbVNlcnZpY2VTY29wZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZW4gY29uZmlybUtpbmQgaXMgbG1TZXJ2aWNlUGVyVG9vbCwgdGhlIHNjb3BlIChzZXNzaW9uL3dvcmtzcGFjZS9wcm9maWxlKS4nIH07XG5cdGN1c3RvbUJ1dHRvbktpbmQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGVuIHRoZSB1c2VyIGNsaWNrZWQgYSBjdXN0b20gYnV0dG9uIG9uIHRoZSBjb25maXJtYXRpb24gd2lkZ2V0LCB3aGV0aGVyIHRoZSBidXR0b24gcmVwcmVzZW50cyBhcHByb3ZlIG9yIGRlbnkgc2VtYW50aWNzLiBVbmRlZmluZWQgd2hlbiBubyBjdXN0b20gYnV0dG9uIHdhcyBjbGlja2VkLicgfTtcblx0Y29uZmlybWF0aW9uTm90TmVlZGVkUmVhc29uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hlbiBjb25maXJtS2luZCBpcyBjb25maXJtYXRpb25Ob3ROZWVkZWQsIGEgc3RhYmxlIGlkZW50aWZpZXIgZm9yIHdoeSB0aGUgdG9vbCBkaWQgbm90IHJlcXVpcmUgY29uZmlybWF0aW9uLiBMaW1pdGVkIHRvIGEga25vd24gYWxsb3dsaXN0IChlLmcuIGF1dG8tYXBwcm92ZS1hbGwsIGlubGluZUNoYXQpOyBzZXQgdG8gXCJvdGhlclwiIGZvciBhbnkgb3RoZXIgcmVhc29uOyB1bmRlZmluZWQgd2hlbiBubyByZWFzb24gd2FzIHN1cHBsaWVkLicgfTtcblx0c2FuZGJveFdyYXBwZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdGb3IgdGVybWluYWwgdG9vbCBjYWxscywgd2hldGhlciB0aGlzIHNwZWNpZmljIGludm9jYXRpb24gcnVucyBpbnNpZGUgdGhlIGFnZW50IHRlcm1pbmFsIHNhbmRib3guIFVuZGVmaW5lZCBmb3Igbm9uLXRlcm1pbmFsIHRvb2xzLicgfTtcblx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRm9yIHRlcm1pbmFsIHRvb2wgY2FsbHMsIHdoZXRoZXIgdGhlIG1vZGVsIHJlcXVlc3RlZCB0byBieXBhc3MgdGhlIHNhbmRib3ggZm9yIHRoaXMgaW52b2NhdGlvbi4gVW5kZWZpbmVkIGZvciBub24tdGVybWluYWwgdG9vbHMuJyB9O1xuXHRvd25lcjogJ2Nocm1hcnRpJztcblx0Y29tbWVudDogJ1Byb3ZpZGVzIGluc2lnaHQgaW50byBob3cgdG9vbCBjb25maXJtYXRpb25zIGFyZSByZXNvbHZlZCAodXNlciBhY3Rpb24gdnMuIGF1dG8tYXBwcm92YWwpLic7XG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtCQUFrQixlQUFlO0FBQzFDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUIsMkJBQTJCO0FBQ3ZELFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsMkJBQTJCLHNCQUFzQjtBQUMxRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQixZQUFZLGlCQUE4QixvQkFBb0I7QUFDM0YsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxTQUFTLGFBQW1DLHlCQUF5QixlQUFlLGtCQUFrQixtQkFBbUI7QUFDbEksT0FBTyxjQUFjO0FBQ3JCLFNBQVMsaUJBQWlC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
