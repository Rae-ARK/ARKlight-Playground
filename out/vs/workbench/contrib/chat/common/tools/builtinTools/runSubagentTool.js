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
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../../platform/product/common/productService.js";
import { ChatRequestVariableSet } from "../../attachments/chatVariableEntries.js";
import { isByokModel } from "../../chatSelectedModel.js";
import { IChatService } from "../../chatService/chatService.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../constants.js";
import { COPILOT_VENDOR_ID, ILanguageModelChatMetadata, ILanguageModelsService } from "../../languageModels.js";
import { getChatSessionType } from "../../model/chatUri.js";
import { IChatAgentService } from "../../participants/chatAgents.js";
import { ComputeAutomaticInstructions } from "../../promptSyntax/computeAutomaticInstructions.js";
import { mergeHooks } from "../../promptSyntax/hookSchema.js";
import { HookType } from "../../promptSyntax/hookTypes.js";
import { IPromptsService } from "../../promptSyntax/service/promptsService.js";
import { isBuiltinAgent } from "../../promptSyntax/utils/promptsServiceUtils.js";
import {
  ILanguageModelToolsService,
  isToolSet,
  ToolDataSource,
  VSCodeToolReference
} from "../languageModelToolsService.js";
import { ManageTodoListToolToolId } from "./manageTodoListTool.js";
import { createToolSimpleTextResult } from "./toolHelpers.js";
const BaseModelDescription = `Launch a new agent to handle complex, multi-step tasks autonomously. This tool is good at researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries, use this agent to perform the search for you.

- Agents do not run async or in the background, you will wait for the agent's result.
- When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
- Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
- The agent's outputs should generally be trusted
- Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent
- If the user asks for a certain agent, you MUST provide that EXACT agent name (case-sensitive) to invoke that specific agent.`;
const RUN_SUBAGENT_MAX_NESTING_DEPTH = 5;
let RunSubagentTool = class extends Disposable {
  constructor(chatAgentService, chatService, languageModelToolsService, languageModelsService, logService, configurationService, promptsService, instantiationService, productService) {
    super();
    this.chatAgentService = chatAgentService;
    this.chatService = chatService;
    this.languageModelToolsService = languageModelToolsService;
    this.languageModelsService = languageModelsService;
    this.logService = logService;
    this.configurationService = configurationService;
    this.promptsService = promptsService;
    this.instantiationService = instantiationService;
    this.productService = productService;
    this._onDidUpdateToolData = this._register(new Emitter());
    this.onDidUpdateToolData = this._onDidUpdateToolData.event;
    /** Hack to port data between prepare/invoke */
    this._resolvedModels = /* @__PURE__ */ new Map();
    /** Tracks the current subagent nesting depth per session to detect and limit recursion. */
    this._sessionDepth = /* @__PURE__ */ new Map();
  }
  getToolData() {
    const modelDescription = BaseModelDescription;
    const properties = {
      prompt: {
        type: "string",
        description: "A detailed description of the task for the agent to perform"
      },
      description: {
        type: "string",
        description: "A short (3-5 word) description of the task"
      }
    };
    properties.agentName = {
      type: "string",
      description: "Optional name of a specific agent to invoke. If not provided, uses the current agent."
    };
    properties.model = {
      type: "string",
      description: 'Optional model for the subagent. Format: "Model Name (Vendor)", vendor is usually "copilot". Only use to enforce a specific model.'
    };
    const inputSchema = {
      type: "object",
      properties,
      required: ["prompt", "description"]
    };
    const runSubagentToolData = {
      id: RunSubagentTool.Id,
      toolReferenceName: VSCodeToolReference.runSubagent,
      icon: ThemeIcon.fromId(Codicon.organization.id),
      displayName: localize("tool.runSubagent.displayName", "Run Subagent"),
      userDescription: localize("tool.runSubagent.userDescription", "Run a task within an isolated subagent context to enable efficient organization of tasks and context window management."),
      modelDescription,
      source: ToolDataSource.Internal,
      inputSchema
    };
    return runSubagentToolData;
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const args = invocation.parameters;
    this.logService.debug(`RunSubagentTool: Invoking with prompt: ${args.prompt.substring(0, 100)}...`);
    if (!invocation.context) {
      throw new Error("toolInvocationToken is required for this tool");
    }
    const model = this.chatService.getSession(invocation.context.sessionResource);
    if (!model) {
      throw new Error("Chat model not found for session");
    }
    const request = model.getRequests().at(-1);
    let subagentCredits;
    const store = new DisposableStore();
    try {
      const defaultAgent = this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, ChatModeKind.Agent);
      if (!defaultAgent) {
        return createToolSimpleTextResult("Error: No default agent available");
      }
      let modeModelId = invocation.modelId;
      let modeTools = invocation.userSelectedTools;
      let modeInstructions;
      let subagent;
      let resolvedModelName;
      const currentModeInstructions = request.modeInfo?.modeInstructions;
      const subAgentName = this.normalizeRequestedAgentName(args.agentName);
      const effectiveSubAgentName = subAgentName ?? currentModeInstructions?.name;
      if (subAgentName) {
        subagent = await this.getSubAgentByName(subAgentName);
        if (subagent) {
          const cached = this._resolvedModels.get(invocation.callId);
          if (cached) {
            this._resolvedModels.delete(invocation.callId);
            modeModelId = cached.modeModelId;
            resolvedModelName = cached.resolvedModelName;
          } else {
            const resolved = this.resolveSubagentModel(subagent, invocation.modelId, args.model);
            modeModelId = resolved.modeModelId;
            resolvedModelName = resolved.resolvedModelName;
          }
          const modeCustomTools = subagent.tools;
          if (modeCustomTools) {
            const enablementMap = this.languageModelToolsService.toToolAndToolSetEnablementMap(modeCustomTools, void 0);
            modeTools = {};
            for (const [tool, enabled] of enablementMap) {
              if (!isToolSet(tool)) {
                modeTools[tool.id] = enabled;
              }
            }
          }
          const instructions = subagent.agentInstructions;
          modeInstructions = instructions && {
            name: subAgentName,
            content: instructions.content,
            toolReferences: this.languageModelToolsService.toToolReferences(instructions.toolReferences),
            allowedSubagents: void 0,
            metadata: instructions.metadata,
            isBuiltin: isBuiltinAgent(subagent.source, subagent.uri, this.productService)
          };
        } else {
          this._resolvedModels.delete(invocation.callId);
          throw new Error(`Requested agent '${subAgentName}' not found. Try again with the correct agent name, or omit agentName to use the current agent.`);
        }
      } else {
        modeInstructions = currentModeInstructions;
        const cached = this._resolvedModels.get(invocation.callId);
        if (cached) {
          this._resolvedModels.delete(invocation.callId);
          modeModelId = cached.modeModelId;
          resolvedModelName = cached.resolvedModelName;
        } else {
          const resolved = this.resolveSubagentModel(void 0, invocation.modelId, args.model);
          modeModelId = resolved.modeModelId;
          resolvedModelName = resolved.resolvedModelName;
        }
      }
      const markdownParts = [];
      const subAgentInvocationId = invocation.chatStreamToolCallId ?? invocation.callId ?? `subagent-${generateUuid()}`;
      let inEdit = false;
      const progressCallback = (parts) => {
        for (const part of parts) {
          if (part.kind === "usage") {
            if (typeof part.copilotCredits === "number" && Number.isFinite(part.copilotCredits) && part.copilotCredits >= 0) {
              subagentCredits = Math.max(subagentCredits ?? 0, part.copilotCredits);
            }
            continue;
          }
          if (part.kind === "textEdit" || part.kind === "notebookEdit" || part.kind === "codeblockUri") {
            if (part.kind === "codeblockUri" && !inEdit) {
              inEdit = true;
              model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("```\n") });
            }
            if (part.kind === "codeblockUri") {
              model.acceptResponseProgress(request, { ...part, subAgentInvocationId });
            } else {
              model.acceptResponseProgress(request, part);
            }
          } else if (part.kind === "hook") {
            model.acceptResponseProgress(request, { ...part, subAgentInvocationId });
          } else if (part.kind === "markdownContent") {
            if (inEdit) {
              model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("\n```\n\n") });
              inEdit = false;
            }
            markdownParts.push(part.content.value);
          }
        }
      };
      const allowInvocationsFromSubagents = this.configurationService.getValue(ChatConfiguration.SubagentsAllowInvocationsFromSubagents) ?? false;
      const maxDepth = allowInvocationsFromSubagents ? RUN_SUBAGENT_MAX_NESTING_DEPTH : 0;
      const sessionKey = invocation.context.sessionResource.toString();
      const currentDepth = this._sessionDepth.get(sessionKey) ?? 0;
      const depthAllowed = currentDepth + 1 <= maxDepth;
      if (!modeTools) {
        modeTools = {};
      }
      const existingRunSubagentEnablement = modeTools[RunSubagentTool.Id];
      if (existingRunSubagentEnablement !== false) {
        modeTools[RunSubagentTool.Id] = depthAllowed;
      }
      modeTools[ManageTodoListToolToolId] = false;
      modeTools["copilot_askQuestions"] = false;
      if (maxDepth > 0) {
        this.logService.debug(`RunSubagentTool: Nested subagents enabling ${modeTools[RunSubagentTool.Id]}: session ${sessionKey}, currentDepth: ${currentDepth}, maxDepth: ${maxDepth}, allowInvocationsFromSubagents: ${allowInvocationsFromSubagents}`);
      }
      const variableSet = new ChatRequestVariableSet();
      if (this.configurationService.getValue(ChatConfiguration.CollectInstructionsInExtension) !== true) {
        const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, modeTools, void 0, getChatSessionType(invocation.context.sessionResource));
        await computer.collect(variableSet, token);
      }
      let collectedHooks;
      try {
        const info = await this.promptsService.getHooks(token);
        collectedHooks = info?.hooks;
      } catch (error) {
        this.logService.warn("[ChatService] Failed to collect hooks:", error);
      }
      if (subagent?.hooks) {
        const remapped = { ...subagent.hooks };
        if (remapped[HookType.Stop]) {
          const stopHooks = remapped[HookType.Stop];
          remapped[HookType.SubagentStop] = remapped[HookType.SubagentStop] ? [...remapped[HookType.SubagentStop], ...stopHooks] : stopHooks;
          remapped[HookType.Stop] = void 0;
        }
        collectedHooks = mergeHooks(collectedHooks, remapped);
      }
      const agentRequest = {
        sessionResource: invocation.context.sessionResource,
        requestId: invocation.callId ?? `subagent-${Date.now()}`,
        agentId: defaultAgent.id,
        message: args.prompt,
        variables: { variables: variableSet.asArray() },
        location: ChatAgentLocation.Chat,
        subAgentInvocationId,
        subAgentName: effectiveSubAgentName,
        userSelectedModelId: modeModelId,
        modelConfiguration: modeModelId ? this.languageModelsService.getModelConfiguration(modeModelId) : void 0,
        userSelectedTools: modeTools,
        modeInstructions,
        parentRequestId: invocation.chatRequestId,
        hooks: collectedHooks,
        hasHooksEnabled: !!collectedHooks && Object.values(collectedHooks).some((arr) => arr && arr.length > 0)
      };
      store.add(this.languageModelToolsService.onDidInvokeTool((e) => {
        if (e.subagentInvocationId === subAgentInvocationId) {
          markdownParts.length = 0;
        }
      }));
      this._sessionDepth.set(sessionKey, currentDepth + 1);
      let result;
      try {
        result = await this.chatAgentService.invokeAgent(
          defaultAgent.id,
          agentRequest,
          progressCallback,
          [],
          token
        );
      } finally {
        const newDepth = (this._sessionDepth.get(sessionKey) ?? 1) - 1;
        if (newDepth <= 0) {
          this._sessionDepth.delete(sessionKey);
        } else {
          this._sessionDepth.set(sessionKey, newDepth);
        }
      }
      if (result?.errorDetails) {
        return createToolSimpleTextResult(`Agent error: ${result.errorDetails.message}`);
      }
      const resultText = markdownParts.join("").replace(/^\n*```\n+```\n*/g, "").trim() || "Agent completed with no output";
      if (invocation.toolSpecificData?.kind === "subagent") {
        invocation.toolSpecificData.result = resultText;
        invocation.toolSpecificData.modelName = resolvedModelName;
      }
      return {
        content: [{
          kind: "text",
          value: resultText
        }],
        toolMetadata: {
          subAgentInvocationId,
          description: args.description,
          agentName: agentRequest.subAgentName,
          modelName: resolvedModelName
        }
      };
    } catch (error) {
      const errorMessage = `Error invoking subagent: ${error instanceof Error ? error.message : "Unknown error"}`;
      this.logService.error(errorMessage, error);
      return createToolSimpleTextResult(errorMessage);
    } finally {
      if (subagentCredits !== void 0) {
        request.response?.setSubagentCopilotCredits(invocation.callId, subagentCredits);
        if (invocation.toolSpecificData?.kind === "subagent") {
          invocation.toolSpecificData.credits = subagentCredits;
        }
      }
      store.dispose();
    }
  }
  async getSubAgentByName(name) {
    const agents = await this.promptsService.getCustomAgents(CancellationToken.None);
    return agents.find((agent) => agent.name === name && agent.enabled);
  }
  /**
   * Checks if a model exceeds the main model's cost tier based on multiplier.
   * @returns An object with `exceeds: true` and a reason string if blocked, or `exceeds: false` if allowed.
   */
  checkMultiplierConstraint(modelId, mainModelId) {
    if (!mainModelId || modelId === mainModelId) {
      return { exceeds: false };
    }
    const mainModelMetadata = this.languageModelsService.lookupLanguageModel(mainModelId);
    const modelMetadata = this.languageModelsService.lookupLanguageModel(modelId);
    const mainMultiplier = mainModelMetadata?.multiplierNumeric;
    const modelMultiplier = modelMetadata?.multiplierNumeric;
    if (mainMultiplier !== void 0 && modelMultiplier !== void 0 && modelMultiplier > mainMultiplier) {
      return {
        exceeds: true,
        reason: `exceeds the current model's cost tier (${modelMultiplier}x vs ${mainMultiplier}x)`
      };
    }
    return { exceeds: false };
  }
  /**
   * Returns information about available models for error messages.
   * Includes which models are unavailable due to multiplier restrictions.
   */
  getAvailableModelsInfo(mainModelId) {
    const models = this.languageModelsService.getLanguageModelIds().map((id) => ({ id, metadata: this.languageModelsService.lookupLanguageModel(id) })).filter(
      (m) => !!m.metadata && ILanguageModelChatMetadata.suitableForAgentMode(m.metadata) && m.metadata.isUserSelectable !== false && !m.metadata.targetChatSessionType
    );
    if (models.length === 0) {
      return "No models available.";
    }
    const available = [];
    const unavailableDueToMultiplier = [];
    for (const { id, metadata } of models) {
      const qualifiedName = ILanguageModelChatMetadata.asQualifiedName(metadata);
      const check = this.checkMultiplierConstraint(id, mainModelId);
      if (check.exceeds) {
        unavailableDueToMultiplier.push(qualifiedName);
      } else {
        available.push(qualifiedName);
      }
    }
    const parts = [];
    if (available.length > 0) {
      parts.push(`Available models: ${available.join(", ")}`);
    }
    if (unavailableDueToMultiplier.length > 0) {
      parts.push(`Unavailable (exceeds current model's cost tier): ${unavailableDueToMultiplier.join(", ")}`);
    }
    return parts.join(". ") || "No models available.";
  }
  /**
   * Resolves the model to be used by a subagent.
   * @param explicitModelQualifiedName Optional explicit model specified by the caller.
   *        If provided and not found or not allowed, throws an error with available models.
   * @throws Error if the requested model is not found or exceeds the main model's cost tier.
   */
  resolveSubagentModel(subagent, mainModelId, explicitModelQualifiedName) {
    let modeModelId = mainModelId;
    let explicitModelResolved = false;
    if (explicitModelQualifiedName) {
      const lm = this.languageModelsService.lookupLanguageModelByQualifiedName(explicitModelQualifiedName);
      if (lm?.identifier) {
        modeModelId = lm.identifier;
        explicitModelResolved = true;
      } else {
        throw new Error(`Requested model '${explicitModelQualifiedName}' not found. ${this.getAvailableModelsInfo(mainModelId)}`);
      }
    }
    if (subagent && !explicitModelResolved) {
      const modeModelQualifiedNames = subagent.model;
      if (modeModelQualifiedNames) {
        const mainModelMetadata = mainModelId ? this.languageModelsService.lookupLanguageModel(mainModelId) : void 0;
        const mainModelIsByok = !!mainModelMetadata && isByokModel(mainModelMetadata);
        const skipCopilotFallbacks = mainModelIsByok && isBuiltinAgent(subagent.source, subagent.uri, this.productService);
        for (const qualifiedName of modeModelQualifiedNames) {
          const lmByQualifiedName = this.languageModelsService.lookupLanguageModelByQualifiedName(qualifiedName);
          if (lmByQualifiedName?.identifier) {
            if (skipCopilotFallbacks && lmByQualifiedName.metadata.vendor === COPILOT_VENDOR_ID) {
              continue;
            }
            modeModelId = lmByQualifiedName.identifier;
            break;
          }
        }
      }
    }
    if (modeModelId) {
      const check = this.checkMultiplierConstraint(modeModelId, mainModelId);
      if (check.exceeds) {
        const modelMetadata = this.languageModelsService.lookupLanguageModel(modeModelId);
        throw new Error(`Requested model '${modelMetadata?.name}' ${check.reason}. ${this.getAvailableModelsInfo(mainModelId)}`);
      }
    }
    const resolvedModelMetadata = modeModelId ? this.languageModelsService.lookupLanguageModel(modeModelId) : void 0;
    return { modeModelId, resolvedModelName: resolvedModelMetadata?.name };
  }
  async prepareToolInvocation(context, _token) {
    const args = context.parameters;
    const requestedAgentName = this.normalizeRequestedAgentName(args.agentName);
    const subagent = requestedAgentName ? await this.getSubAgentByName(requestedAgentName) : void 0;
    const currentModeInstructions = context.chatSessionResource ? this.getCurrentModeInstructions(context.chatSessionResource) : void 0;
    const resolved = this.resolveSubagentModel(subagent, context.modelId, args.model);
    this._resolvedModels.set(context.toolCallId, resolved);
    return {
      invocationMessage: args.description,
      toolSpecificData: {
        kind: "subagent",
        description: args.description,
        agentName: subagent?.name ?? requestedAgentName ?? currentModeInstructions?.name,
        prompt: args.prompt,
        modelName: resolved.resolvedModelName
      }
    };
  }
  normalizeRequestedAgentName(agentName) {
    const normalized = agentName?.trim();
    return normalized ? normalized : void 0;
  }
  getCurrentModeInstructions(sessionResource) {
    if (typeof this.chatService.getSession !== "function") {
      return void 0;
    }
    const model = this.chatService.getSession(sessionResource);
    return model?.getRequests().at(-1)?.modeInfo?.modeInstructions;
  }
};
RunSubagentTool.Id = "runSubagent";
RunSubagentTool = __decorateClass([
  __decorateParam(0, IChatAgentService),
  __decorateParam(1, IChatService),
  __decorateParam(2, ILanguageModelToolsService),
  __decorateParam(3, ILanguageModelsService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IPromptsService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IProductService)
], RunSubagentTool);
export {
  RUN_SUBAGENT_MAX_NESTING_DEPTH,
  RunSubagentTool
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9ydW5TdWJhZ2VudFRvb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgdHlwZSBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHR5cGUgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RWYXJpYWJsZVNldCB9IGZyb20gJy4uLy4uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgaXNCeW9rTW9kZWwgfSBmcm9tICcuLi8uLi9jaGF0U2VsZWN0ZWRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFByb2dyZXNzLCBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX1ZFTkRPUl9JRCwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgdHlwZSB7IENoYXRNb2RlbCwgSUNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucyB9IGZyb20gJy4uLy4uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRSZXF1ZXN0LCBJQ2hhdEFnZW50UmVzdWx0LCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENvbXB1dGVBdXRvbWF0aWNJbnN0cnVjdGlvbnMgfSBmcm9tICcuLi8uLi9wcm9tcHRTeW50YXgvY29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdEhvb2tzLCBtZXJnZUhvb2tzIH0gZnJvbSAnLi4vLi4vcHJvbXB0U3ludGF4L2hvb2tTY2hlbWEuanMnO1xuaW1wb3J0IHsgSG9va1R5cGUgfSBmcm9tICcuLi8uLi9wcm9tcHRTeW50YXgvaG9va1R5cGVzLmpzJztcbmltcG9ydCB7IElDdXN0b21BZ2VudCwgSVByb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNCdWlsdGluQWdlbnQgfSBmcm9tICcuLi8uLi9wcm9tcHRTeW50YXgvdXRpbHMvcHJvbXB0c1NlcnZpY2VVdGlscy5qcyc7XG5pbXBvcnQge1xuXHRDb3VudFRva2Vuc0NhbGxiYWNrLFxuXHRJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0SVByZXBhcmVkVG9vbEludm9jYXRpb24sXG5cdGlzVG9vbFNldCxcblx0SVRvb2xEYXRhLFxuXHRJVG9vbEltcGwsXG5cdElUb29sSW52b2NhdGlvbixcblx0SVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LFxuXHRJVG9vbFJlc3VsdCxcblx0VG9vbERhdGFTb3VyY2UsXG5cdFRvb2xQcm9ncmVzcyxcblx0VlNDb2RlVG9vbFJlZmVyZW5jZSxcbn0gZnJvbSAnLi4vbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNYW5hZ2VUb2RvTGlzdFRvb2xUb29sSWQgfSBmcm9tICcuL21hbmFnZVRvZG9MaXN0VG9vbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUb29sU2ltcGxlVGV4dFJlc3VsdCB9IGZyb20gJy4vdG9vbEhlbHBlcnMuanMnO1xuXG5jb25zdCBCYXNlTW9kZWxEZXNjcmlwdGlvbiA9IGBMYXVuY2ggYSBuZXcgYWdlbnQgdG8gaGFuZGxlIGNvbXBsZXgsIG11bHRpLXN0ZXAgdGFza3MgYXV0b25vbW91c2x5LiBUaGlzIHRvb2wgaXMgZ29vZCBhdCByZXNlYXJjaGluZyBjb21wbGV4IHF1ZXN0aW9ucywgc2VhcmNoaW5nIGZvciBjb2RlLCBhbmQgZXhlY3V0aW5nIG11bHRpLXN0ZXAgdGFza3MuIFdoZW4geW91IGFyZSBzZWFyY2hpbmcgZm9yIGEga2V5d29yZCBvciBmaWxlIGFuZCBhcmUgbm90IGNvbmZpZGVudCB0aGF0IHlvdSB3aWxsIGZpbmQgdGhlIHJpZ2h0IG1hdGNoIGluIHRoZSBmaXJzdCBmZXcgdHJpZXMsIHVzZSB0aGlzIGFnZW50IHRvIHBlcmZvcm0gdGhlIHNlYXJjaCBmb3IgeW91LlxuXG4tIEFnZW50cyBkbyBub3QgcnVuIGFzeW5jIG9yIGluIHRoZSBiYWNrZ3JvdW5kLCB5b3Ugd2lsbCB3YWl0IGZvciB0aGUgYWdlbnRcXCdzIHJlc3VsdC5cbi0gV2hlbiB0aGUgYWdlbnQgaXMgZG9uZSwgaXQgd2lsbCByZXR1cm4gYSBzaW5nbGUgbWVzc2FnZSBiYWNrIHRvIHlvdS4gVGhlIHJlc3VsdCByZXR1cm5lZCBieSB0aGUgYWdlbnQgaXMgbm90IHZpc2libGUgdG8gdGhlIHVzZXIuIFRvIHNob3cgdGhlIHVzZXIgdGhlIHJlc3VsdCwgeW91IHNob3VsZCBzZW5kIGEgdGV4dCBtZXNzYWdlIGJhY2sgdG8gdGhlIHVzZXIgd2l0aCBhIGNvbmNpc2Ugc3VtbWFyeSBvZiB0aGUgcmVzdWx0LlxuLSBFYWNoIGFnZW50IGludm9jYXRpb24gaXMgc3RhdGVsZXNzLiBZb3Ugd2lsbCBub3QgYmUgYWJsZSB0byBzZW5kIGFkZGl0aW9uYWwgbWVzc2FnZXMgdG8gdGhlIGFnZW50LCBub3Igd2lsbCB0aGUgYWdlbnQgYmUgYWJsZSB0byBjb21tdW5pY2F0ZSB3aXRoIHlvdSBvdXRzaWRlIG9mIGl0cyBmaW5hbCByZXBvcnQuIFRoZXJlZm9yZSwgeW91ciBwcm9tcHQgc2hvdWxkIGNvbnRhaW4gYSBoaWdobHkgZGV0YWlsZWQgdGFzayBkZXNjcmlwdGlvbiBmb3IgdGhlIGFnZW50IHRvIHBlcmZvcm0gYXV0b25vbW91c2x5IGFuZCB5b3Ugc2hvdWxkIHNwZWNpZnkgZXhhY3RseSB3aGF0IGluZm9ybWF0aW9uIHRoZSBhZ2VudCBzaG91bGQgcmV0dXJuIGJhY2sgdG8geW91IGluIGl0cyBmaW5hbCBhbmQgb25seSBtZXNzYWdlIHRvIHlvdS5cbi0gVGhlIGFnZW50J3Mgb3V0cHV0cyBzaG91bGQgZ2VuZXJhbGx5IGJlIHRydXN0ZWRcbi0gQ2xlYXJseSB0ZWxsIHRoZSBhZ2VudCB3aGV0aGVyIHlvdSBleHBlY3QgaXQgdG8gd3JpdGUgY29kZSBvciBqdXN0IHRvIGRvIHJlc2VhcmNoIChzZWFyY2gsIGZpbGUgcmVhZHMsIHdlYiBmZXRjaGVzLCBldGMuKSwgc2luY2UgaXQgaXMgbm90IGF3YXJlIG9mIHRoZSB1c2VyXFwncyBpbnRlbnRcbi0gSWYgdGhlIHVzZXIgYXNrcyBmb3IgYSBjZXJ0YWluIGFnZW50LCB5b3UgTVVTVCBwcm92aWRlIHRoYXQgRVhBQ1QgYWdlbnQgbmFtZSAoY2FzZS1zZW5zaXRpdmUpIHRvIGludm9rZSB0aGF0IHNwZWNpZmljIGFnZW50LmA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJ1blN1YmFnZW50VG9vbElucHV0UGFyYW1zIHtcblx0cHJvbXB0OiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdGFnZW50TmFtZT86IHN0cmluZztcblx0bW9kZWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBSVU5fU1VCQUdFTlRfTUFYX05FU1RJTkdfREVQVEggPSA1O1xuXG5leHBvcnQgY2xhc3MgUnVuU3ViYWdlbnRUb29sIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElkID0gJ3J1blN1YmFnZW50JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZVRvb2xEYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlVG9vbERhdGE6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRVcGRhdGVUb29sRGF0YS5ldmVudDtcblxuXHQvKiogSGFjayB0byBwb3J0IGRhdGEgYmV0d2VlbiBwcmVwYXJlL2ludm9rZSAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlZE1vZGVscyA9IG5ldyBNYXA8c3RyaW5nLCB7IG1vZGVNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHJlc29sdmVkTW9kZWxOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQgfT4oKTtcblxuXHQvKiogVHJhY2tzIHRoZSBjdXJyZW50IHN1YmFnZW50IG5lc3RpbmcgZGVwdGggcGVyIHNlc3Npb24gdG8gZGV0ZWN0IGFuZCBsaW1pdCByZWN1cnNpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EZXB0aCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRnZXRUb29sRGF0YSgpOiBJVG9vbERhdGEge1xuXHRcdGNvbnN0IG1vZGVsRGVzY3JpcHRpb24gPSBCYXNlTW9kZWxEZXNjcmlwdGlvbjtcblxuXHRcdGNvbnN0IHByb3BlcnRpZXM6IElKU09OU2NoZW1hTWFwID0ge1xuXHRcdFx0cHJvbXB0OiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0EgZGV0YWlsZWQgZGVzY3JpcHRpb24gb2YgdGhlIHRhc2sgZm9yIHRoZSBhZ2VudCB0byBwZXJmb3JtJ1xuXHRcdFx0fSxcblx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Egc2hvcnQgKDMtNSB3b3JkKSBkZXNjcmlwdGlvbiBvZiB0aGUgdGFzaydcblx0XHRcdH1cblx0XHR9O1xuXHRcdHByb3BlcnRpZXMuYWdlbnROYW1lID0ge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ09wdGlvbmFsIG5hbWUgb2YgYSBzcGVjaWZpYyBhZ2VudCB0byBpbnZva2UuIElmIG5vdCBwcm92aWRlZCwgdXNlcyB0aGUgY3VycmVudCBhZ2VudC4nXG5cdFx0fTtcblx0XHRwcm9wZXJ0aWVzLm1vZGVsID0ge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ09wdGlvbmFsIG1vZGVsIGZvciB0aGUgc3ViYWdlbnQuIEZvcm1hdDogXCJNb2RlbCBOYW1lIChWZW5kb3IpXCIsIHZlbmRvciBpcyB1c3VhbGx5IFwiY29waWxvdFwiLiBPbmx5IHVzZSB0byBlbmZvcmNlIGEgc3BlY2lmaWMgbW9kZWwuJyxcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW5wdXRTY2hlbWE6IElKU09OU2NoZW1hICYgeyBwcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcCB9ID0ge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzLFxuXHRcdFx0cmVxdWlyZWQ6IFsncHJvbXB0JywgJ2Rlc2NyaXB0aW9uJ11cblx0XHR9O1xuXHRcdGNvbnN0IHJ1blN1YmFnZW50VG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiBSdW5TdWJhZ2VudFRvb2wuSWQsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogVlNDb2RlVG9vbFJlZmVyZW5jZS5ydW5TdWJhZ2VudCxcblx0XHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5vcmdhbml6YXRpb24uaWQpLFxuXHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0b29sLnJ1blN1YmFnZW50LmRpc3BsYXlOYW1lJywgJ1J1biBTdWJhZ2VudCcpLFxuXHRcdFx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndG9vbC5ydW5TdWJhZ2VudC51c2VyRGVzY3JpcHRpb24nLCAnUnVuIGEgdGFzayB3aXRoaW4gYW4gaXNvbGF0ZWQgc3ViYWdlbnQgY29udGV4dCB0byBlbmFibGUgZWZmaWNpZW50IG9yZ2FuaXphdGlvbiBvZiB0YXNrcyBhbmQgY29udGV4dCB3aW5kb3cgbWFuYWdlbWVudC4nKSxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246IG1vZGVsRGVzY3JpcHRpb24sXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0aW5wdXRTY2hlbWE6IGlucHV0U2NoZW1hXG5cdFx0fTtcblx0XHRyZXR1cm4gcnVuU3ViYWdlbnRUb29sRGF0YTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBhcmdzID0gaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIElSdW5TdWJhZ2VudFRvb2xJbnB1dFBhcmFtcztcblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgUnVuU3ViYWdlbnRUb29sOiBJbnZva2luZyB3aXRoIHByb21wdDogJHthcmdzLnByb21wdC5zdWJzdHJpbmcoMCwgMTAwKX0uLi5gKTtcblxuXHRcdGlmICghaW52b2NhdGlvbi5jb250ZXh0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3Rvb2xJbnZvY2F0aW9uVG9rZW4gaXMgcmVxdWlyZWQgZm9yIHRoaXMgdG9vbCcpO1xuXHRcdH1cblxuXHRcdC8vIEdldCB0aGUgY2hhdCBtb2RlbCBhbmQgcmVxdWVzdCBmb3Igd3JpdGluZyBwcm9ncmVzc1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKGludm9jYXRpb24uY29udGV4dC5zZXNzaW9uUmVzb3VyY2UpIGFzIENoYXRNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NoYXQgbW9kZWwgbm90IGZvdW5kIGZvciBzZXNzaW9uJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpITtcblx0XHRsZXQgc3ViYWdlbnRDcmVkaXRzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBHZXQgdGhlIGRlZmF1bHQgYWdlbnRcblx0XHRcdGNvbnN0IGRlZmF1bHRBZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRcdGlmICghZGVmYXVsdEFnZW50KSB7XG5cdFx0XHRcdHJldHVybiBjcmVhdGVUb29sU2ltcGxlVGV4dFJlc3VsdCgnRXJyb3I6IE5vIGRlZmF1bHQgYWdlbnQgYXZhaWxhYmxlJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlc29sdmUgbW9kZS1zcGVjaWZpYyBjb25maWd1cmF0aW9uIGlmIHN1YmFnZW50SWQgaXMgcHJvdmlkZWRcblx0XHRcdGxldCBtb2RlTW9kZWxJZCA9IGludm9jYXRpb24ubW9kZWxJZDtcblx0XHRcdGxldCBtb2RlVG9vbHMgPSBpbnZvY2F0aW9uLnVzZXJTZWxlY3RlZFRvb2xzO1xuXHRcdFx0bGV0IG1vZGVJbnN0cnVjdGlvbnM6IElDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgc3ViYWdlbnQ6IElDdXN0b21BZ2VudCB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCByZXNvbHZlZE1vZGVsTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgY3VycmVudE1vZGVJbnN0cnVjdGlvbnMgPSByZXF1ZXN0Lm1vZGVJbmZvPy5tb2RlSW5zdHJ1Y3Rpb25zO1xuXG5cdFx0XHRjb25zdCBzdWJBZ2VudE5hbWUgPSB0aGlzLm5vcm1hbGl6ZVJlcXVlc3RlZEFnZW50TmFtZShhcmdzLmFnZW50TmFtZSk7XG5cdFx0XHRjb25zdCBlZmZlY3RpdmVTdWJBZ2VudE5hbWUgPSBzdWJBZ2VudE5hbWUgPz8gY3VycmVudE1vZGVJbnN0cnVjdGlvbnM/Lm5hbWU7XG5cblx0XHRcdGlmIChzdWJBZ2VudE5hbWUpIHtcblx0XHRcdFx0c3ViYWdlbnQgPSBhd2FpdCB0aGlzLmdldFN1YkFnZW50QnlOYW1lKHN1YkFnZW50TmFtZSk7XG5cdFx0XHRcdGlmIChzdWJhZ2VudCkge1xuXHRcdFx0XHRcdC8vIENoZWNrIHRoZSBwcmUtcmVzb2x2ZWQgbW9kZWwgY2FjaGUgZnJvbSBwcmVwYXJlVG9vbEludm9jYXRpb25cblx0XHRcdFx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9yZXNvbHZlZE1vZGVscy5nZXQoaW52b2NhdGlvbi5jYWxsSWQpO1xuXHRcdFx0XHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Jlc29sdmVkTW9kZWxzLmRlbGV0ZShpbnZvY2F0aW9uLmNhbGxJZCk7XG5cdFx0XHRcdFx0XHRtb2RlTW9kZWxJZCA9IGNhY2hlZC5tb2RlTW9kZWxJZDtcblx0XHRcdFx0XHRcdHJlc29sdmVkTW9kZWxOYW1lID0gY2FjaGVkLnJlc29sdmVkTW9kZWxOYW1lO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBGYWxsYmFjazogcmVzb2x2ZSB0aGUgbW9kZWwgaGVyZSBpZiBwcmVwYXJlIGRpZG4ndCBjYWNoZSBpdFxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVTdWJhZ2VudE1vZGVsKHN1YmFnZW50LCBpbnZvY2F0aW9uLm1vZGVsSWQsIGFyZ3MubW9kZWwpO1xuXHRcdFx0XHRcdFx0bW9kZU1vZGVsSWQgPSByZXNvbHZlZC5tb2RlTW9kZWxJZDtcblx0XHRcdFx0XHRcdHJlc29sdmVkTW9kZWxOYW1lID0gcmVzb2x2ZWQucmVzb2x2ZWRNb2RlbE5hbWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gVXNlIG1vZGUtc3BlY2lmaWMgdG9vbHMgaWYgYXZhaWxhYmxlXG5cdFx0XHRcdFx0Y29uc3QgbW9kZUN1c3RvbVRvb2xzID0gc3ViYWdlbnQudG9vbHM7XG5cdFx0XHRcdFx0aWYgKG1vZGVDdXN0b21Ub29scykge1xuXHRcdFx0XHRcdFx0Ly8gQ29udmVydCB0aGUgbW9kZSdzIGN1c3RvbSB0b29scyAoYXJyYXkgb2YgcXVhbGlmaWVkIG5hbWVzKSB0byBVc2VyU2VsZWN0ZWRUb29scyBmb3JtYXRcblx0XHRcdFx0XHRcdGNvbnN0IGVuYWJsZW1lbnRNYXAgPSB0aGlzLmxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAobW9kZUN1c3RvbVRvb2xzLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0Ly8gQ29udmVydCBlbmFibGVtZW50IG1hcCB0byBVc2VyU2VsZWN0ZWRUb29scyAoUmVjb3JkPHN0cmluZywgYm9vbGVhbj4pXG5cdFx0XHRcdFx0XHRtb2RlVG9vbHMgPSB7fTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgW3Rvb2wsIGVuYWJsZWRdIG9mIGVuYWJsZW1lbnRNYXApIHtcblx0XHRcdFx0XHRcdFx0aWYgKCFpc1Rvb2xTZXQodG9vbCkpIHtcblx0XHRcdFx0XHRcdFx0XHRtb2RlVG9vbHNbdG9vbC5pZF0gPSBlbmFibGVkO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25zID0gc3ViYWdlbnQuYWdlbnRJbnN0cnVjdGlvbnM7XG5cdFx0XHRcdFx0bW9kZUluc3RydWN0aW9ucyA9IGluc3RydWN0aW9ucyAmJiB7XG5cdFx0XHRcdFx0XHRuYW1lOiBzdWJBZ2VudE5hbWUsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBpbnN0cnVjdGlvbnMuY29udGVudCxcblx0XHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiB0aGlzLmxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UudG9Ub29sUmVmZXJlbmNlcyhpbnN0cnVjdGlvbnMudG9vbFJlZmVyZW5jZXMpLFxuXHRcdFx0XHRcdFx0YWxsb3dlZFN1YmFnZW50czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IGluc3RydWN0aW9ucy5tZXRhZGF0YSxcblx0XHRcdFx0XHRcdGlzQnVpbHRpbjogaXNCdWlsdGluQWdlbnQoc3ViYWdlbnQuc291cmNlLCBzdWJhZ2VudC51cmksIHRoaXMucHJvZHVjdFNlcnZpY2UpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVzb2x2ZWRNb2RlbHMuZGVsZXRlKGludm9jYXRpb24uY2FsbElkKTtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFJlcXVlc3RlZCBhZ2VudCAnJHtzdWJBZ2VudE5hbWV9JyBub3QgZm91bmQuIFRyeSBhZ2FpbiB3aXRoIHRoZSBjb3JyZWN0IGFnZW50IG5hbWUsIG9yIG9taXQgYWdlbnROYW1lIHRvIHVzZSB0aGUgY3VycmVudCBhZ2VudC5gKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bW9kZUluc3RydWN0aW9ucyA9IGN1cnJlbnRNb2RlSW5zdHJ1Y3Rpb25zO1xuXG5cdFx0XHRcdC8vIE5vIHN1YmFnZW50IG5hbWUgLSBjbGVhbiB1cCBhbnkgY2FjaGVkIGVudHJ5IGFuZCByZXNvbHZlIG1vZGVsIGZyb20gZXhwbGljaXQgcGFyYW1ldGVyIG9yIG1haW4gbW9kZWxcblx0XHRcdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fcmVzb2x2ZWRNb2RlbHMuZ2V0KGludm9jYXRpb24uY2FsbElkKTtcblx0XHRcdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Jlc29sdmVkTW9kZWxzLmRlbGV0ZShpbnZvY2F0aW9uLmNhbGxJZCk7XG5cdFx0XHRcdFx0bW9kZU1vZGVsSWQgPSBjYWNoZWQubW9kZU1vZGVsSWQ7XG5cdFx0XHRcdFx0cmVzb2x2ZWRNb2RlbE5hbWUgPSBjYWNoZWQucmVzb2x2ZWRNb2RlbE5hbWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVTdWJhZ2VudE1vZGVsKHVuZGVmaW5lZCwgaW52b2NhdGlvbi5tb2RlbElkLCBhcmdzLm1vZGVsKTtcblx0XHRcdFx0XHRtb2RlTW9kZWxJZCA9IHJlc29sdmVkLm1vZGVNb2RlbElkO1xuXHRcdFx0XHRcdHJlc29sdmVkTW9kZWxOYW1lID0gcmVzb2x2ZWQucmVzb2x2ZWRNb2RlbE5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVHJhY2sgd2hldGhlciB3ZSBzaG91bGQgY29sbGVjdCBtYXJrZG93biAoYWZ0ZXIgdGhlIGxhc3QgdG9vbCBpbnZvY2F0aW9uKVxuXHRcdFx0Y29uc3QgbWFya2Rvd25QYXJ0czogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0Ly8gR2VuZXJhdGUgYSBzdGFibGUgc3ViQWdlbnRJbnZvY2F0aW9uSWQgZm9yIHJvdXRpbmcgZWRpdHMgdG8gdGhpcyBzdWJhZ2VudCdzIGNvbnRlbnQgcGFydC5cblx0XHRcdC8vIFVzZSBjaGF0U3RyZWFtVG9vbENhbGxJZCB3aGVuIGF2YWlsYWJsZSBiZWNhdXNlIHRoYXQgaXMgd2hhdCBDaGF0VG9vbEludm9jYXRpb24udG9vbENhbGxJZFxuXHRcdFx0Ly8gdXNlcyBpbiB0aGUgcmVuZGVyZXIgKHNlZSBQUiAjMzAyODYzKSwgYW5kIHRoZSBzdWJhZ2VudCBncm91cGluZyBtYXRjaGVzIG9uIHRvb2xDYWxsSWQuXG5cdFx0XHRjb25zdCBzdWJBZ2VudEludm9jYXRpb25JZCA9IGludm9jYXRpb24uY2hhdFN0cmVhbVRvb2xDYWxsSWQgPz8gaW52b2NhdGlvbi5jYWxsSWQgPz8gYHN1YmFnZW50LSR7Z2VuZXJhdGVVdWlkKCl9YDtcblxuXHRcdFx0bGV0IGluRWRpdCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcHJvZ3Jlc3NDYWxsYmFjayA9IChwYXJ0czogSUNoYXRQcm9ncmVzc1tdKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykge1xuXHRcdFx0XHRcdC8vIFVzYWdlIGV2ZW50cyBjYXJyeSB0aGUgc3ViYWdlbnQncyBydW5uaW5nIGNyZWRpdCB0b3RhbDsga2VlcCB0aGVcblx0XHRcdFx0XHQvLyBsYXRlc3QgZm9yIGl0cyBob3ZlciBhbmQgZm9sZCBpdCBpbnRvIHRoZSBwYXJlbnQgcmVzcG9uc2UgdG90YWwuXG5cdFx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3VzYWdlJykge1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBwYXJ0LmNvcGlsb3RDcmVkaXRzID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUocGFydC5jb3BpbG90Q3JlZGl0cykgJiYgcGFydC5jb3BpbG90Q3JlZGl0cyA+PSAwKSB7XG5cdFx0XHRcdFx0XHRcdHN1YmFnZW50Q3JlZGl0cyA9IE1hdGgubWF4KHN1YmFnZW50Q3JlZGl0cyA/PyAwLCBwYXJ0LmNvcGlsb3RDcmVkaXRzKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBXcml0ZSBjZXJ0YWluIHBhcnRzIGltbWVkaWF0ZWx5IHRvIHRoZSBtb2RlbFxuXHRcdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICd0ZXh0RWRpdCcgfHwgcGFydC5raW5kID09PSAnbm90ZWJvb2tFZGl0JyB8fCBwYXJ0LmtpbmQgPT09ICdjb2RlYmxvY2tVcmknKSB7XG5cdFx0XHRcdFx0XHRpZiAocGFydC5raW5kID09PSAnY29kZWJsb2NrVXJpJyAmJiAhaW5FZGl0KSB7XG5cdFx0XHRcdFx0XHRcdGluRWRpdCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdgYGBcXG4nKSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdC8vIEF0dGFjaCBzdWJBZ2VudEludm9jYXRpb25JZCB0byBjb2RlYmxvY2tVcmkgcGFydHMgc28gdGhleSBjYW4gYmUgcm91dGVkIHRvIHRoZSBzdWJhZ2VudCBjb250ZW50IHBhcnRcblx0XHRcdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdjb2RlYmxvY2tVcmknKSB7XG5cdFx0XHRcdFx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyAuLi5wYXJ0LCBzdWJBZ2VudEludm9jYXRpb25JZCB9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgcGFydCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0LmtpbmQgPT09ICdob29rJykge1xuXHRcdFx0XHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IC4uLnBhcnQsIHN1YkFnZW50SW52b2NhdGlvbklkIH0pO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocGFydC5raW5kID09PSAnbWFya2Rvd25Db250ZW50Jykge1xuXHRcdFx0XHRcdFx0aWYgKGluRWRpdCkge1xuXHRcdFx0XHRcdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnXFxuYGBgXFxuXFxuJykgfSk7XG5cdFx0XHRcdFx0XHRcdGluRWRpdCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBDb2xsZWN0IG1hcmtkb3duIGNvbnRlbnQgZm9yIHRoZSB0b29sIHJlc3VsdFxuXHRcdFx0XHRcdFx0bWFya2Rvd25QYXJ0cy5wdXNoKHBhcnQuY29udGVudC52YWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBEZXRlcm1pbmUgd2hldGhlciB0aGUgc3ViYWdlbnQgc2hvdWxkIGJlIGFsbG93ZWQgdG8gc3Bhd24gaXRzIG93biBzdWJhZ2VudHMuXG5cdFx0XHRjb25zdCBhbGxvd0ludm9jYXRpb25zRnJvbVN1YmFnZW50cyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uU3ViYWdlbnRzQWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHMpID8/IGZhbHNlO1xuXHRcdFx0Y29uc3QgbWF4RGVwdGggPSBhbGxvd0ludm9jYXRpb25zRnJvbVN1YmFnZW50cyA/IFJVTl9TVUJBR0VOVF9NQVhfTkVTVElOR19ERVBUSCA6IDA7XG5cdFx0XHRjb25zdCBzZXNzaW9uS2V5ID0gaW52b2NhdGlvbi5jb250ZXh0LnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgY3VycmVudERlcHRoID0gdGhpcy5fc2Vzc2lvbkRlcHRoLmdldChzZXNzaW9uS2V5KSA/PyAwO1xuXHRcdFx0Y29uc3QgZGVwdGhBbGxvd2VkID0gY3VycmVudERlcHRoICsgMSA8PSBtYXhEZXB0aDtcblxuXHRcdFx0aWYgKCFtb2RlVG9vbHMpIHtcblx0XHRcdFx0Ly8gSW5pdGlhbGl6ZSBtb2RlVG9vbHMgc28gdGhhdCB3ZSBjYW4gc3RpbGwgZW5mb3JjZSB0aGUgbWF4IGRlcHRoIHJlc3RyaWN0aW9uXG5cdFx0XHRcdG1vZGVUb29scyA9IHt9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPbmx5IGZ1cnRoZXItcmVzdHJpY3QgUnVuU3ViYWdlbnRUb29sOiBkbyBub3QgcmUtZW5hYmxlIGl0IGlmIGl0IHdhcyBleHBsaWNpdGx5IGRpc2FibGVkLlxuXHRcdFx0Y29uc3QgZXhpc3RpbmdSdW5TdWJhZ2VudEVuYWJsZW1lbnQgPSBtb2RlVG9vbHNbUnVuU3ViYWdlbnRUb29sLklkXTtcblx0XHRcdGlmIChleGlzdGluZ1J1blN1YmFnZW50RW5hYmxlbWVudCAhPT0gZmFsc2UpIHtcblx0XHRcdFx0bW9kZVRvb2xzW1J1blN1YmFnZW50VG9vbC5JZF0gPSBkZXB0aEFsbG93ZWQ7IC8vIG9ubHkgZW5hYmxlIHRoZSBSdW4gU3ViYWdlbnQgdG9vbCBpZiB3ZSBhcmUgdW5kZXIgdGhlIG1heCBkZXB0aCBsaW1pdFxuXHRcdFx0fVxuXG5cdFx0XHRtb2RlVG9vbHNbTWFuYWdlVG9kb0xpc3RUb29sVG9vbElkXSA9IGZhbHNlO1xuXHRcdFx0bW9kZVRvb2xzWydjb3BpbG90X2Fza1F1ZXN0aW9ucyddID0gZmFsc2U7XG5cblx0XHRcdGlmIChtYXhEZXB0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBSdW5TdWJhZ2VudFRvb2w6IE5lc3RlZCBzdWJhZ2VudHMgZW5hYmxpbmcgJHttb2RlVG9vbHNbUnVuU3ViYWdlbnRUb29sLklkXX06IHNlc3Npb24gJHtzZXNzaW9uS2V5fSwgY3VycmVudERlcHRoOiAke2N1cnJlbnREZXB0aH0sIG1heERlcHRoOiAke21heERlcHRofSwgYWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHM6ICR7YWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHN9YCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZhcmlhYmxlU2V0ID0gbmV3IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQoKTtcblx0XHRcdC8vIFdoZW4gdGhlIGV4dGVuc2lvbiBpcyByZXNwb25zaWJsZSBmb3IgaW5zdHJ1Y3Rpb24gY29sbGVjdGlvbiwgc2tpcCB0aGUgY29yZSBwYXRoIGVudGlyZWx5LlxuXHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQ29sbGVjdEluc3RydWN0aW9uc0luRXh0ZW5zaW9uKSAhPT0gdHJ1ZSkge1xuXHRcdFx0XHRjb25zdCBjb21wdXRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucywgQ2hhdE1vZGVLaW5kLkFnZW50LCBtb2RlVG9vbHMsIHVuZGVmaW5lZCwgZ2V0Q2hhdFNlc3Npb25UeXBlKGludm9jYXRpb24uY29udGV4dC5zZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRcdFx0YXdhaXQgY29tcHV0ZXIuY29sbGVjdCh2YXJpYWJsZVNldCwgdG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb2xsZWN0IGhvb2tzIGZyb20gaG9vayAuanNvbiBmaWxlc1xuXHRcdFx0bGV0IGNvbGxlY3RlZEhvb2tzOiBDaGF0UmVxdWVzdEhvb2tzIHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHRoaXMucHJvbXB0c1NlcnZpY2UuZ2V0SG9va3ModG9rZW4pO1xuXHRcdFx0XHRjb2xsZWN0ZWRIb29rcyA9IGluZm8/Lmhvb2tzO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tDaGF0U2VydmljZV0gRmFpbGVkIHRvIGNvbGxlY3QgaG9va3M6JywgZXJyb3IpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNZXJnZSBzdWJhZ2VudC1sZXZlbCBob29rcyAoZnJvbSB0aGUgYWdlbnQncyBmcm9udG1hdHRlcikgd2l0aCBnbG9iYWwgaG9va3MuXG5cdFx0XHQvLyBSZW1hcCBTdG9wIGhvb2tzIHRvIFN1YmFnZW50U3RvcCBzaW5jZSB0aGUgYWdlbnQgaXMgcnVubmluZyBhcyBhIHN1YmFnZW50LlxuXHRcdFx0aWYgKHN1YmFnZW50Py5ob29rcykge1xuXHRcdFx0XHRjb25zdCByZW1hcHBlZDogQ2hhdFJlcXVlc3RIb29rcyA9IHsgLi4uc3ViYWdlbnQuaG9va3MgfTtcblx0XHRcdFx0aWYgKHJlbWFwcGVkW0hvb2tUeXBlLlN0b3BdKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RvcEhvb2tzID0gcmVtYXBwZWRbSG9va1R5cGUuU3RvcF07XG5cdFx0XHRcdFx0KHJlbWFwcGVkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtIb29rVHlwZS5TdWJhZ2VudFN0b3BdID0gcmVtYXBwZWRbSG9va1R5cGUuU3ViYWdlbnRTdG9wXVxuXHRcdFx0XHRcdFx0PyBbLi4ucmVtYXBwZWRbSG9va1R5cGUuU3ViYWdlbnRTdG9wXSwgLi4uc3RvcEhvb2tzXVxuXHRcdFx0XHRcdFx0OiBzdG9wSG9va3M7XG5cdFx0XHRcdFx0KHJlbWFwcGVkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtIb29rVHlwZS5TdG9wXSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb2xsZWN0ZWRIb29rcyA9IG1lcmdlSG9va3MoY29sbGVjdGVkSG9va3MsIHJlbWFwcGVkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQnVpbGQgdGhlIGFnZW50IHJlcXVlc3Rcblx0XHRcdGNvbnN0IGFnZW50UmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QgPSB7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogaW52b2NhdGlvbi5jb250ZXh0LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0cmVxdWVzdElkOiBpbnZvY2F0aW9uLmNhbGxJZCA/PyBgc3ViYWdlbnQtJHtEYXRlLm5vdygpfWAsXG5cdFx0XHRcdGFnZW50SWQ6IGRlZmF1bHRBZ2VudC5pZCxcblx0XHRcdFx0bWVzc2FnZTogYXJncy5wcm9tcHQsXG5cdFx0XHRcdHZhcmlhYmxlczogeyB2YXJpYWJsZXM6IHZhcmlhYmxlU2V0LmFzQXJyYXkoKSB9LFxuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN1YkFnZW50SW52b2NhdGlvbklkLFxuXHRcdFx0XHRzdWJBZ2VudE5hbWU6IGVmZmVjdGl2ZVN1YkFnZW50TmFtZSxcblx0XHRcdFx0dXNlclNlbGVjdGVkTW9kZWxJZDogbW9kZU1vZGVsSWQsXG5cdFx0XHRcdG1vZGVsQ29uZmlndXJhdGlvbjogbW9kZU1vZGVsSWQgPyB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZU1vZGVsSWQpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR1c2VyU2VsZWN0ZWRUb29sczogbW9kZVRvb2xzLFxuXHRcdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRwYXJlbnRSZXF1ZXN0SWQ6IGludm9jYXRpb24uY2hhdFJlcXVlc3RJZCxcblx0XHRcdFx0aG9va3M6IGNvbGxlY3RlZEhvb2tzLFxuXHRcdFx0XHRoYXNIb29rc0VuYWJsZWQ6ICEhY29sbGVjdGVkSG9va3MgJiYgT2JqZWN0LnZhbHVlcyhjb2xsZWN0ZWRIb29rcykuc29tZShhcnIgPT4gYXJyICYmIGFyci5sZW5ndGggPiAwKSxcblx0XHRcdH07XG5cblx0XHRcdC8vIFN1YnNjcmliZSB0byB0b29sIGludm9jYXRpb25zIHRvIGNsZWFyIG1hcmtkb3duIHBhcnRzIHdoZW4gYSB0b29sIGlzIGludm9rZWRcblx0XHRcdHN0b3JlLmFkZCh0aGlzLmxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2Uub25EaWRJbnZva2VUb29sKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5zdWJhZ2VudEludm9jYXRpb25JZCA9PT0gc3ViQWdlbnRJbnZvY2F0aW9uSWQpIHtcblx0XHRcdFx0XHRtYXJrZG93blBhcnRzLmxlbmd0aCA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gSW52b2tlIHRoZSBhZ2VudCwgdHJhY2tpbmcgbmVzdGluZyBkZXB0aCBmb3IgcmVjdXJzaW9uIGRldGVjdGlvblxuXHRcdFx0dGhpcy5fc2Vzc2lvbkRlcHRoLnNldChzZXNzaW9uS2V5LCBjdXJyZW50RGVwdGggKyAxKTtcblx0XHRcdGxldCByZXN1bHQ6IElDaGF0QWdlbnRSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuaW52b2tlQWdlbnQoXG5cdFx0XHRcdFx0ZGVmYXVsdEFnZW50LmlkLFxuXHRcdFx0XHRcdGFnZW50UmVxdWVzdCxcblx0XHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrLFxuXHRcdFx0XHRcdFtdLFxuXHRcdFx0XHRcdHRva2VuXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjb25zdCBuZXdEZXB0aCA9ICh0aGlzLl9zZXNzaW9uRGVwdGguZ2V0KHNlc3Npb25LZXkpID8/IDEpIC0gMTtcblx0XHRcdFx0aWYgKG5ld0RlcHRoIDw9IDApIHtcblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uRGVwdGguZGVsZXRlKHNlc3Npb25LZXkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25EZXB0aC5zZXQoc2Vzc2lvbktleSwgbmV3RGVwdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGZvciBlcnJvcnNcblx0XHRcdGlmIChyZXN1bHQ/LmVycm9yRGV0YWlscykge1xuXHRcdFx0XHRyZXR1cm4gY3JlYXRlVG9vbFNpbXBsZVRleHRSZXN1bHQoYEFnZW50IGVycm9yOiAke3Jlc3VsdC5lcnJvckRldGFpbHMubWVzc2FnZX1gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGhpcyBpcyBhIGhhY2sgZHVlIHRvIHRoZSBmYWN0IHRoYXQgZWRpdHMgYXJlIHJlcHJlc2VudGVkIGFzIGVtcHR5IGNvZGVibG9ja3Mgd2l0aCBVUklzLiBUaGF0IG5lZWRzIHRvIGJlIGNsZWFuZWQgdXAsXG5cdFx0XHQvLyBpbiB0aGUgbWVhbnRpbWUsIGp1c3Qgc3RyaXAgYW4gZW1wdHkgY29kZWJsb2NrIGxlZnQgYmVoaW5kLlxuXHRcdFx0Y29uc3QgcmVzdWx0VGV4dCA9IG1hcmtkb3duUGFydHMuam9pbignJykucmVwbGFjZSgvXlxcbipgYGBcXG4rYGBgXFxuKi9nLCAnJykudHJpbSgpIHx8ICdBZ2VudCBjb21wbGV0ZWQgd2l0aCBubyBvdXRwdXQnO1xuXG5cdFx0XHQvLyBTdG9yZSByZXN1bHQgaW4gdG9vbFNwZWNpZmljRGF0YSBmb3Igc2VyaWFsaXphdGlvblxuXHRcdFx0aWYgKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEucmVzdWx0ID0gcmVzdWx0VGV4dDtcblx0XHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZSA9IHJlc29sdmVkTW9kZWxOYW1lO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXR1cm4gcmVzdWx0IHdpdGggdG9vbE1ldGFkYXRhIGNvbnRhaW5pbmcgc3ViQWdlbnRJbnZvY2F0aW9uSWQgZm9yIHRyYWplY3RvcnkgdHJhY2tpbmdcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiByZXN1bHRUZXh0XG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR0b29sTWV0YWRhdGE6IHtcblx0XHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogYXJncy5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRhZ2VudE5hbWU6IGFnZW50UmVxdWVzdC5zdWJBZ2VudE5hbWUsXG5cdFx0XHRcdFx0bW9kZWxOYW1lOiByZXNvbHZlZE1vZGVsTmFtZSxcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSBgRXJyb3IgaW52b2tpbmcgc3ViYWdlbnQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YDtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvck1lc3NhZ2UsIGVycm9yKTtcblx0XHRcdHJldHVybiBjcmVhdGVUb29sU2ltcGxlVGV4dFJlc3VsdChlcnJvck1lc3NhZ2UpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoc3ViYWdlbnRDcmVkaXRzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmVxdWVzdC5yZXNwb25zZT8uc2V0U3ViYWdlbnRDb3BpbG90Q3JlZGl0cyhpbnZvY2F0aW9uLmNhbGxJZCwgc3ViYWdlbnRDcmVkaXRzKTtcblx0XHRcdFx0aWYgKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRcdGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5jcmVkaXRzID0gc3ViYWdlbnRDcmVkaXRzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTdWJBZ2VudEJ5TmFtZShuYW1lOiBzdHJpbmcpOiBQcm9taXNlPElDdXN0b21BZ2VudCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFnZW50cyA9IGF3YWl0IHRoaXMucHJvbXB0c1NlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdHJldHVybiBhZ2VudHMuZmluZChhZ2VudCA9PiBhZ2VudC5uYW1lID09PSBuYW1lICYmIGFnZW50LmVuYWJsZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiBhIG1vZGVsIGV4Y2VlZHMgdGhlIG1haW4gbW9kZWwncyBjb3N0IHRpZXIgYmFzZWQgb24gbXVsdGlwbGllci5cblx0ICogQHJldHVybnMgQW4gb2JqZWN0IHdpdGggYGV4Y2VlZHM6IHRydWVgIGFuZCBhIHJlYXNvbiBzdHJpbmcgaWYgYmxvY2tlZCwgb3IgYGV4Y2VlZHM6IGZhbHNlYCBpZiBhbGxvd2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBjaGVja011bHRpcGxpZXJDb25zdHJhaW50KG1vZGVsSWQ6IHN0cmluZywgbWFpbk1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHsgZXhjZWVkczogZmFsc2UgfSB8IHsgZXhjZWVkczogdHJ1ZTsgcmVhc29uOiBzdHJpbmcgfSB7XG5cdFx0aWYgKCFtYWluTW9kZWxJZCB8fCBtb2RlbElkID09PSBtYWluTW9kZWxJZCkge1xuXHRcdFx0cmV0dXJuIHsgZXhjZWVkczogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRjb25zdCBtYWluTW9kZWxNZXRhZGF0YSA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwobWFpbk1vZGVsSWQpO1xuXHRcdGNvbnN0IG1vZGVsTWV0YWRhdGEgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKG1vZGVsSWQpO1xuXHRcdGNvbnN0IG1haW5NdWx0aXBsaWVyID0gbWFpbk1vZGVsTWV0YWRhdGE/Lm11bHRpcGxpZXJOdW1lcmljO1xuXHRcdGNvbnN0IG1vZGVsTXVsdGlwbGllciA9IG1vZGVsTWV0YWRhdGE/Lm11bHRpcGxpZXJOdW1lcmljO1xuXG5cdFx0aWYgKG1haW5NdWx0aXBsaWVyICE9PSB1bmRlZmluZWQgJiYgbW9kZWxNdWx0aXBsaWVyICE9PSB1bmRlZmluZWQgJiYgbW9kZWxNdWx0aXBsaWVyID4gbWFpbk11bHRpcGxpZXIpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4Y2VlZHM6IHRydWUsXG5cdFx0XHRcdHJlYXNvbjogYGV4Y2VlZHMgdGhlIGN1cnJlbnQgbW9kZWwncyBjb3N0IHRpZXIgKCR7bW9kZWxNdWx0aXBsaWVyfXggdnMgJHttYWluTXVsdGlwbGllcn14KWBcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZXhjZWVkczogZmFsc2UgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGluZm9ybWF0aW9uIGFib3V0IGF2YWlsYWJsZSBtb2RlbHMgZm9yIGVycm9yIG1lc3NhZ2VzLlxuXHQgKiBJbmNsdWRlcyB3aGljaCBtb2RlbHMgYXJlIHVuYXZhaWxhYmxlIGR1ZSB0byBtdWx0aXBsaWVyIHJlc3RyaWN0aW9ucy5cblx0ICovXG5cdHByaXZhdGUgZ2V0QXZhaWxhYmxlTW9kZWxzSW5mbyhtYWluTW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsSWRzKClcblx0XHRcdC5tYXAoaWQgPT4gKHsgaWQsIG1ldGFkYXRhOiB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKGlkKSB9KSlcblx0XHRcdC5maWx0ZXIoKG0pOiBtIGlzIHsgaWQ6IHN0cmluZzsgbWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIH0gPT5cblx0XHRcdFx0ISFtLm1ldGFkYXRhXG5cdFx0XHRcdCYmIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLnN1aXRhYmxlRm9yQWdlbnRNb2RlKG0ubWV0YWRhdGEpXG5cdFx0XHRcdCYmIG0ubWV0YWRhdGEuaXNVc2VyU2VsZWN0YWJsZSAhPT0gZmFsc2Vcblx0XHRcdFx0JiYgIW0ubWV0YWRhdGEudGFyZ2V0Q2hhdFNlc3Npb25UeXBlXG5cdFx0XHQpO1xuXG5cdFx0aWYgKG1vZGVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAnTm8gbW9kZWxzIGF2YWlsYWJsZS4nO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF2YWlsYWJsZTogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCB1bmF2YWlsYWJsZUR1ZVRvTXVsdGlwbGllcjogc3RyaW5nW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgeyBpZCwgbWV0YWRhdGEgfSBvZiBtb2RlbHMpIHtcblx0XHRcdGNvbnN0IHF1YWxpZmllZE5hbWUgPSBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5hc1F1YWxpZmllZE5hbWUobWV0YWRhdGEpO1xuXHRcdFx0Y29uc3QgY2hlY2sgPSB0aGlzLmNoZWNrTXVsdGlwbGllckNvbnN0cmFpbnQoaWQsIG1haW5Nb2RlbElkKTtcblxuXHRcdFx0aWYgKGNoZWNrLmV4Y2VlZHMpIHtcblx0XHRcdFx0dW5hdmFpbGFibGVEdWVUb011bHRpcGxpZXIucHVzaChxdWFsaWZpZWROYW1lKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF2YWlsYWJsZS5wdXNoKHF1YWxpZmllZE5hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChhdmFpbGFibGUubGVuZ3RoID4gMCkge1xuXHRcdFx0cGFydHMucHVzaChgQXZhaWxhYmxlIG1vZGVsczogJHthdmFpbGFibGUuam9pbignLCAnKX1gKTtcblx0XHR9XG5cdFx0aWYgKHVuYXZhaWxhYmxlRHVlVG9NdWx0aXBsaWVyLmxlbmd0aCA+IDApIHtcblx0XHRcdHBhcnRzLnB1c2goYFVuYXZhaWxhYmxlIChleGNlZWRzIGN1cnJlbnQgbW9kZWwncyBjb3N0IHRpZXIpOiAke3VuYXZhaWxhYmxlRHVlVG9NdWx0aXBsaWVyLmpvaW4oJywgJyl9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhcnRzLmpvaW4oJy4gJykgfHwgJ05vIG1vZGVscyBhdmFpbGFibGUuJztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgbW9kZWwgdG8gYmUgdXNlZCBieSBhIHN1YmFnZW50LlxuXHQgKiBAcGFyYW0gZXhwbGljaXRNb2RlbFF1YWxpZmllZE5hbWUgT3B0aW9uYWwgZXhwbGljaXQgbW9kZWwgc3BlY2lmaWVkIGJ5IHRoZSBjYWxsZXIuXG5cdCAqICAgICAgICBJZiBwcm92aWRlZCBhbmQgbm90IGZvdW5kIG9yIG5vdCBhbGxvd2VkLCB0aHJvd3MgYW4gZXJyb3Igd2l0aCBhdmFpbGFibGUgbW9kZWxzLlxuXHQgKiBAdGhyb3dzIEVycm9yIGlmIHRoZSByZXF1ZXN0ZWQgbW9kZWwgaXMgbm90IGZvdW5kIG9yIGV4Y2VlZHMgdGhlIG1haW4gbW9kZWwncyBjb3N0IHRpZXIuXG5cdCAqL1xuXHRwcml2YXRlIHJlc29sdmVTdWJhZ2VudE1vZGVsKHN1YmFnZW50OiBJQ3VzdG9tQWdlbnQgfCB1bmRlZmluZWQsIG1haW5Nb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGV4cGxpY2l0TW9kZWxRdWFsaWZpZWROYW1lPzogc3RyaW5nKTogeyBtb2RlTW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkOyByZXNvbHZlZE1vZGVsTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGxldCBtb2RlTW9kZWxJZCA9IG1haW5Nb2RlbElkO1xuXHRcdGxldCBleHBsaWNpdE1vZGVsUmVzb2x2ZWQgPSBmYWxzZTtcblxuXHRcdC8vIEV4cGxpY2l0IG1vZGVsIHBhcmFtZXRlciB0YWtlcyBoaWdoZXN0IHByaW9yaXR5XG5cdFx0aWYgKGV4cGxpY2l0TW9kZWxRdWFsaWZpZWROYW1lKSB7XG5cdFx0XHRjb25zdCBsbSA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWxCeVF1YWxpZmllZE5hbWUoZXhwbGljaXRNb2RlbFF1YWxpZmllZE5hbWUpO1xuXHRcdFx0aWYgKGxtPy5pZGVudGlmaWVyKSB7XG5cdFx0XHRcdG1vZGVNb2RlbElkID0gbG0uaWRlbnRpZmllcjtcblx0XHRcdFx0ZXhwbGljaXRNb2RlbFJlc29sdmVkID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIE1vZGVsIG5vdCBmb3VuZCAtIHRocm93IGVycm9yIHdpdGggYXZhaWxhYmxlIG1vZGVsc1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFJlcXVlc3RlZCBtb2RlbCAnJHtleHBsaWNpdE1vZGVsUXVhbGlmaWVkTmFtZX0nIG5vdCBmb3VuZC4gJHt0aGlzLmdldEF2YWlsYWJsZU1vZGVsc0luZm8obWFpbk1vZGVsSWQpfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzdWJhZ2VudCAmJiAhZXhwbGljaXRNb2RlbFJlc29sdmVkKSB7XG5cdFx0XHRjb25zdCBtb2RlTW9kZWxRdWFsaWZpZWROYW1lcyA9IHN1YmFnZW50Lm1vZGVsO1xuXHRcdFx0aWYgKG1vZGVNb2RlbFF1YWxpZmllZE5hbWVzKSB7XG5cdFx0XHRcdC8vIFdoZW4gdGhlIG1haW4gbW9kZWwgaXMgQllPSyAoZmxhZ2dlZCB2aWEgYG1ldGFkYXRhLmlzQllPS2ApLCBza2lwIENvcGlsb3QvQ0FQSSBmYWxsYmFjayBtb2RlbHNcblx0XHRcdFx0Ly8gZm9yIGJ1aWx0LWluIGFnZW50cyAoZS5nLiBFeHBsb3JlKSwgd2hvc2UgbW9kZWwgbGlzdCBpcyBhIGN1cmF0ZWQgY29udmVuaWVuY2UgZmFsbGJhY2suIEFcblx0XHRcdFx0Ly8gdXNlci1hdXRob3JlZCBhZ2VudCdzIG1vZGVsIGxpc3QgaXMgYSBkZWxpYmVyYXRlIGNob2ljZSBhbmQgaXMgYWx3YXlzIGhvbm9yZWQgYXMtaXMuXG5cdFx0XHRcdGNvbnN0IG1haW5Nb2RlbE1ldGFkYXRhID0gbWFpbk1vZGVsSWQgPyB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKG1haW5Nb2RlbElkKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgbWFpbk1vZGVsSXNCeW9rID0gISFtYWluTW9kZWxNZXRhZGF0YSAmJiBpc0J5b2tNb2RlbChtYWluTW9kZWxNZXRhZGF0YSk7XG5cdFx0XHRcdGNvbnN0IHNraXBDb3BpbG90RmFsbGJhY2tzID0gbWFpbk1vZGVsSXNCeW9rICYmIGlzQnVpbHRpbkFnZW50KHN1YmFnZW50LnNvdXJjZSwgc3ViYWdlbnQudXJpLCB0aGlzLnByb2R1Y3RTZXJ2aWNlKTtcblx0XHRcdFx0Ly8gRmluZCB0aGUgYWN0dWFsIG1vZGVsIGlkZW50aWZpZXIgZnJvbSB0aGUgcXVhbGlmaWVkIG5hbWUocylcblx0XHRcdFx0Zm9yIChjb25zdCBxdWFsaWZpZWROYW1lIG9mIG1vZGVNb2RlbFF1YWxpZmllZE5hbWVzKSB7XG5cdFx0XHRcdFx0Y29uc3QgbG1CeVF1YWxpZmllZE5hbWUgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsQnlRdWFsaWZpZWROYW1lKHF1YWxpZmllZE5hbWUpO1xuXHRcdFx0XHRcdGlmIChsbUJ5UXVhbGlmaWVkTmFtZT8uaWRlbnRpZmllcikge1xuXHRcdFx0XHRcdFx0aWYgKHNraXBDb3BpbG90RmFsbGJhY2tzICYmIGxtQnlRdWFsaWZpZWROYW1lLm1ldGFkYXRhLnZlbmRvciA9PT0gQ09QSUxPVF9WRU5ET1JfSUQpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRtb2RlTW9kZWxJZCA9IGxtQnlRdWFsaWZpZWROYW1lLmlkZW50aWZpZXI7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayBtdWx0aXBsaWVyIGNvbnN0cmFpbnQgLSB0aHJvdyBlcnJvciBpZiByZXF1ZXN0ZWQgbW9kZWwgZXhjZWVkcyBtYWluIG1vZGVsJ3MgY29zdCB0aWVyXG5cdFx0aWYgKG1vZGVNb2RlbElkKSB7XG5cdFx0XHRjb25zdCBjaGVjayA9IHRoaXMuY2hlY2tNdWx0aXBsaWVyQ29uc3RyYWludChtb2RlTW9kZWxJZCwgbWFpbk1vZGVsSWQpO1xuXHRcdFx0aWYgKGNoZWNrLmV4Y2VlZHMpIHtcblx0XHRcdFx0Y29uc3QgbW9kZWxNZXRhZGF0YSA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwobW9kZU1vZGVsSWQpO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFJlcXVlc3RlZCBtb2RlbCAnJHttb2RlbE1ldGFkYXRhPy5uYW1lfScgJHtjaGVjay5yZWFzb259LiAke3RoaXMuZ2V0QXZhaWxhYmxlTW9kZWxzSW5mbyhtYWluTW9kZWxJZCl9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb2x2ZWRNb2RlbE1ldGFkYXRhID0gbW9kZU1vZGVsSWQgPyB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKG1vZGVNb2RlbElkKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4geyBtb2RlTW9kZWxJZCwgcmVzb2x2ZWRNb2RlbE5hbWU6IHJlc29sdmVkTW9kZWxNZXRhZGF0YT8ubmFtZSB9O1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhcmdzID0gY29udGV4dC5wYXJhbWV0ZXJzIGFzIElSdW5TdWJhZ2VudFRvb2xJbnB1dFBhcmFtcztcblx0XHRjb25zdCByZXF1ZXN0ZWRBZ2VudE5hbWUgPSB0aGlzLm5vcm1hbGl6ZVJlcXVlc3RlZEFnZW50TmFtZShhcmdzLmFnZW50TmFtZSk7XG5cblx0XHRjb25zdCBzdWJhZ2VudCA9IHJlcXVlc3RlZEFnZW50TmFtZSA/IGF3YWl0IHRoaXMuZ2V0U3ViQWdlbnRCeU5hbWUocmVxdWVzdGVkQWdlbnROYW1lKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjdXJyZW50TW9kZUluc3RydWN0aW9ucyA9IGNvbnRleHQuY2hhdFNlc3Npb25SZXNvdXJjZSA/IHRoaXMuZ2V0Q3VycmVudE1vZGVJbnN0cnVjdGlvbnMoY29udGV4dC5jaGF0U2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZDtcblxuXHRcdC8vIFJlc29sdmUgdGhlIG1vZGVsIGVhcmx5IGFuZCBjYWNoZSBpdCBmb3IgaW52b2tlKClcblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVN1YmFnZW50TW9kZWwoc3ViYWdlbnQsIGNvbnRleHQubW9kZWxJZCwgYXJncy5tb2RlbCk7XG5cdFx0dGhpcy5fcmVzb2x2ZWRNb2RlbHMuc2V0KGNvbnRleHQudG9vbENhbGxJZCwgcmVzb2x2ZWQpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBhcmdzLmRlc2NyaXB0aW9uLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogYXJncy5kZXNjcmlwdGlvbixcblx0XHRcdFx0YWdlbnROYW1lOiBzdWJhZ2VudD8ubmFtZSA/PyByZXF1ZXN0ZWRBZ2VudE5hbWUgPz8gY3VycmVudE1vZGVJbnN0cnVjdGlvbnM/Lm5hbWUsXG5cdFx0XHRcdHByb21wdDogYXJncy5wcm9tcHQsXG5cdFx0XHRcdG1vZGVsTmFtZTogcmVzb2x2ZWQucmVzb2x2ZWRNb2RlbE5hbWUsXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIG5vcm1hbGl6ZVJlcXVlc3RlZEFnZW50TmFtZShhZ2VudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IGFnZW50TmFtZT8udHJpbSgpO1xuXHRcdHJldHVybiBub3JtYWxpemVkID8gbm9ybWFsaXplZCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q3VycmVudE1vZGVJbnN0cnVjdGlvbnMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodHlwZW9mIHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbiAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSBhcyBDaGF0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIG1vZGVsPy5nZXRSZXF1ZXN0cygpLmF0KC0xKT8ubW9kZUluZm8/Lm1vZGVJbnN0cnVjdGlvbnM7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxZQUFZLHVCQUF1QjtBQUU1QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG1CQUFtQjtBQUM1QixTQUF3QixvQkFBb0I7QUFDNUMsU0FBUyxtQkFBbUIsbUJBQW1CLG9CQUFvQjtBQUNuRSxTQUFTLG1CQUFtQiw0QkFBNEIsOEJBQThCO0FBRXRGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQThD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TSxNQUFNLEtBQUssS0FBSyx1QkFBdUIsV0FBVyxDQUFDLEVBQUU7QUFBQSxNQUN4SDtBQUFBLElBQ0Q7QUFFQSxVQUFNLHdCQUF3QixjQUFjLEtBQUssc0JBQXNCLG9CQUFvQixXQUFXLElBQUk7QUFDMUcsV0FBTyxFQUFFLGFBQWEsbUJBQW1CLHVCQUF1QixLQUFLO0FBQUEsRUFDdEU7QUFBQSxFQUVBLE1BQU0sc0JBQXNCLFNBQTRDLFFBQXlFO0FBQ2hKLFVBQU0sT0FBTyxRQUFRO0FBQ3JCLFVBQU0scUJBQXFCLEtBQUssNEJBQTRCLEtBQUssU0FBUztBQUUxRSxVQUFNLFdBQVcscUJBQXFCLE1BQU0sS0FBSyxrQkFBa0Isa0JBQWtCLElBQUk7QUFDekYsVUFBTSwwQkFBMEIsUUFBUSxzQkFBc0IsS0FBSywyQkFBMkIsUUFBUSxtQkFBbUIsSUFBSTtBQUc3SCxVQUFNLFdBQVcsS0FBSyxxQkFBcUIsVUFBVSxRQUFRLFNBQVMsS0FBSyxLQUFLO0FBQ2hGLFNBQUssZ0JBQWdCLElBQUksUUFBUSxZQUFZLFFBQVE7QUFFckQsV0FBTztBQUFBLE1BQ04sbUJBQW1CLEtBQUs7QUFBQSxNQUN4QixrQkFBa0I7QUFBQSxRQUNqQixNQUFNO0FBQUEsUUFDTixhQUFhLEtBQUs7QUFBQSxRQUNsQixXQUFXLFVBQVUsUUFBUSxzQkFBc0IseUJBQXlCO0FBQUEsUUFDNUUsUUFBUSxLQUFLO0FBQUEsUUFDYixXQUFXLFNBQVM7QUFBQSxNQUNyQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSw0QkFBNEIsV0FBbUQ7QUFDdEYsVUFBTSxhQUFhLFdBQVcsS0FBSztBQUNuQyxXQUFPLGFBQWEsYUFBYTtBQUFBLEVBQ2xDO0FBQUEsRUFFUSwyQkFBMkIsaUJBQWdFO0FBQ2xHLFFBQUksT0FBTyxLQUFLLFlBQVksZUFBZSxZQUFZO0FBQ3RELGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxRQUFRLEtBQUssWUFBWSxXQUFXLGVBQWU7QUFDekQsV0FBTyxPQUFPLFlBQVksRUFBRSxHQUFHLEVBQUUsR0FBRyxVQUFVO0FBQUEsRUFDL0M7QUFDRDtBQXZnQmEsZ0JBRUksS0FBSztBQUZULGtCQUFOO0FBQUEsRUFjSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F0QlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
