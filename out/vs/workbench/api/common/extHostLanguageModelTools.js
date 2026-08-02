import { raceCancellation } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { CancellationError } from "../../../base/common/errors.js";
import { toDisposable } from "../../../base/common/lifecycle.js";
import { revive } from "../../../base/common/marshalling.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { isToolInvocationContext } from "../../contrib/chat/common/tools/languageModelToolsService.js";
import { computeCombinationKey } from "../../contrib/chat/common/tools/languageModelToolsConfirmationService.js";
import { ExtensionEditToolId, InternalEditToolId } from "../../contrib/chat/common/tools/builtinTools/editFileTool.js";
import { InternalFetchWebPageToolId } from "../../contrib/chat/common/tools/builtinTools/tools.js";
import { SearchExtensionsToolId } from "../../contrib/extensions/common/searchExtensionsTool.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { MainContext } from "./extHost.protocol.js";
import * as typeConvert from "./extHostTypeConverters.js";
import { URI } from "../../../base/common/uri.js";
class Tool {
  constructor(data) {
    this._data = data;
  }
  update(newData) {
    this._data = newData;
    this._apiObject = void 0;
    this._apiObjectWithChatParticipantAdditions = void 0;
  }
  get data() {
    return this._data;
  }
  get apiObject() {
    if (!this._apiObject) {
      this._apiObject = Object.freeze({
        name: this._data.id,
        description: this._data.modelDescription,
        inputSchema: this._data.inputSchema,
        fullReferenceName: this._data.fullReferenceName,
        tags: this._data.tags ?? [],
        source: void 0
      });
    }
    return this._apiObject;
  }
  get apiObjectWithChatParticipantAdditions() {
    if (!this._apiObjectWithChatParticipantAdditions) {
      this._apiObjectWithChatParticipantAdditions = Object.freeze({
        name: this._data.id,
        description: this._data.modelDescription,
        inputSchema: this._data.inputSchema,
        tags: this._data.tags ?? [],
        source: typeConvert.LanguageModelToolSource.to(this._data.source),
        fullReferenceName: this._data.fullReferenceName
      });
    }
    return this._apiObjectWithChatParticipantAdditions;
  }
}
class ExtHostLanguageModelTools {
  constructor(mainContext, _languageModels) {
    this._languageModels = _languageModels;
    /** A map of tools that were registered in this EH */
    this._registeredTools = /* @__PURE__ */ new Map();
    this._tokenCountFuncs = /* @__PURE__ */ new Map();
    /** A map of all known tools, from other EHs or registered in vscode core */
    this._allTools = /* @__PURE__ */ new Map();
    this._proxy = mainContext.getProxy(MainContext.MainThreadLanguageModelTools);
    this._proxy.$getTools().then((tools) => {
      for (const tool of tools) {
        this._allTools.set(tool.id, new Tool(revive(tool)));
      }
    });
  }
  async $countTokensForInvocation(callId, input, token) {
    const fn = this._tokenCountFuncs.get(callId);
    if (!fn) {
      throw new Error(`Tool invocation call ${callId} not found`);
    }
    return await fn(input, token);
  }
  async invokeTool(extension, toolIdOrInfo, options, token) {
    const toolId = typeof toolIdOrInfo === "string" ? toolIdOrInfo : toolIdOrInfo.name;
    const callId = generateUuid();
    if (options.tokenizationOptions) {
      this._tokenCountFuncs.set(callId, options.tokenizationOptions.countTokens);
    }
    try {
      if (options.toolInvocationToken && !isToolInvocationContext(options.toolInvocationToken)) {
        throw new Error(`Invalid tool invocation token`);
      }
      if ((toolId === InternalEditToolId || toolId === ExtensionEditToolId) && !isProposedApiEnabled(extension, "chatParticipantPrivate")) {
        throw new Error(`Invalid tool: ${toolId}`);
      }
      const result = await this._proxy.$invokeTool({
        toolId,
        callId,
        parameters: options.input,
        tokenBudget: options.tokenizationOptions?.tokenBudget,
        context: options.toolInvocationToken,
        chatRequestId: isProposedApiEnabled(extension, "chatParticipantPrivate") ? options.chatRequestId : void 0,
        chatInteractionId: isProposedApiEnabled(extension, "chatParticipantPrivate") ? options.chatInteractionId : void 0,
        subAgentInvocationId: isProposedApiEnabled(extension, "chatParticipantPrivate") ? options.subAgentInvocationId : void 0,
        chatStreamToolCallId: isProposedApiEnabled(extension, "chatParticipantAdditions") ? options.chatStreamToolCallId : void 0,
        preToolUseResult: isProposedApiEnabled(extension, "chatParticipantPrivate") ? options.preToolUseResult : void 0,
        traceparent: isProposedApiEnabled(extension, "chatParticipantPrivate") ? options.traceparent : void 0,
        tracestate: isProposedApiEnabled(extension, "chatParticipantPrivate") ? options.tracestate : void 0
      }, token);
      const dto = result instanceof SerializableObjectWithBuffers ? result.value : result;
      return typeConvert.LanguageModelToolResult.to(revive(dto));
    } finally {
      this._tokenCountFuncs.delete(callId);
    }
  }
  $onDidChangeTools(tools) {
    const oldTools = new Set(this._allTools.keys());
    for (const tool of tools) {
      oldTools.delete(tool.id);
      const existing = this._allTools.get(tool.id);
      if (existing) {
        existing.update(tool);
      } else {
        this._allTools.set(tool.id, new Tool(revive(tool)));
      }
    }
    for (const id of oldTools) {
      this._allTools.delete(id);
    }
  }
  getTools(extension) {
    const hasParticipantAdditions = isProposedApiEnabled(extension, "chatParticipantPrivate");
    return Array.from(this._allTools.values()).map((tool) => hasParticipantAdditions ? tool.apiObjectWithChatParticipantAdditions : tool.apiObject).filter((tool) => {
      switch (tool.name) {
        case InternalEditToolId:
        case ExtensionEditToolId:
        case InternalFetchWebPageToolId:
        case SearchExtensionsToolId:
          return isProposedApiEnabled(extension, "chatParticipantPrivate");
        default:
          return true;
      }
    });
  }
  async $invokeTool(dto, token) {
    const item = this._registeredTools.get(dto.toolId);
    if (!item) {
      throw new Error(`Unknown tool ${dto.toolId}`);
    }
    const options = {
      input: dto.parameters,
      toolInvocationToken: revive(dto.context)
    };
    if (isProposedApiEnabled(item.extension, "chatParticipantPrivate")) {
      options.chatRequestId = dto.chatRequestId;
      options.chatInteractionId = dto.chatInteractionId;
      options.chatSessionResource = URI.revive(dto.context?.sessionResource);
      options.workingDirectory = URI.revive(dto.context?.workingDirectory);
      options.subAgentInvocationId = dto.subAgentInvocationId;
      options.traceparent = dto.traceparent;
      options.tracestate = dto.tracestate;
    }
    if (isProposedApiEnabled(item.extension, "chatParticipantAdditions") && dto.modelId) {
      options.model = await this.getModel(dto.modelId, item.extension);
    }
    if (isProposedApiEnabled(item.extension, "chatParticipantAdditions") && dto.chatStreamToolCallId) {
      options.chatStreamToolCallId = dto.chatStreamToolCallId;
    }
    if (dto.tokenBudget !== void 0) {
      options.tokenizationOptions = {
        tokenBudget: dto.tokenBudget,
        countTokens: this._tokenCountFuncs.get(dto.callId) || ((value, token2 = CancellationToken.None) => this._proxy.$countTokensForInvocation(dto.callId, value, token2))
      };
    }
    let progress;
    if (isProposedApiEnabled(item.extension, "toolProgress")) {
      let lastProgress;
      progress = {
        report: (value) => {
          if (value.increment !== void 0) {
            lastProgress = (lastProgress ?? 0) + value.increment;
          }
          this._proxy.$acceptToolProgress(dto.callId, {
            message: typeConvert.MarkdownString.fromStrict(value.message),
            progress: lastProgress === void 0 ? void 0 : lastProgress / 100
          });
        }
      };
    }
    const extensionResult = await raceCancellation(Promise.resolve(item.tool.invoke(options, token, progress)), token);
    if (!extensionResult) {
      throw new CancellationError();
    }
    return typeConvert.LanguageModelToolResult.from(extensionResult, item.extension);
  }
  async getModel(modelId, extension) {
    let model;
    if (modelId) {
      model = await this._languageModels.getLanguageModelByIdentifier(extension, modelId);
    }
    if (!model) {
      model = await this._languageModels.getDefaultLanguageModel(extension);
      if (!model) {
        throw new Error("Language model unavailable");
      }
    }
    return model;
  }
  async $handleToolStream(toolId, context, token) {
    const item = this._registeredTools.get(toolId);
    if (!item) {
      throw new Error(`Unknown tool ${toolId}`);
    }
    if (!item.tool.handleToolStream) {
      return void 0;
    }
    checkProposedApiEnabled(item.extension, "chatParticipantAdditions");
    const options = {
      rawInput: context.rawInput,
      chatRequestId: context.chatRequestId,
      chatSessionResource: context.chatSessionResource,
      chatInteractionId: context.chatInteractionId
    };
    const result = await item.tool.handleToolStream(options, token);
    if (!result) {
      return void 0;
    }
    return {
      invocationMessage: typeConvert.MarkdownString.fromStrict(result.invocationMessage)
    };
  }
  async $prepareToolInvocation(toolId, context, token) {
    const item = this._registeredTools.get(toolId);
    if (!item) {
      throw new Error(`Unknown tool ${toolId}`);
    }
    const options = {
      input: context.parameters,
      chatRequestId: context.chatRequestId,
      chatSessionResource: context.chatSessionResource,
      chatInteractionId: context.chatInteractionId,
      workingDirectory: URI.revive(context.workingDirectory),
      forceConfirmationReason: context.forceConfirmationReason
    };
    if (context.forceConfirmationReason) {
      checkProposedApiEnabled(item.extension, "chatParticipantPrivate");
    }
    if (item.tool.prepareInvocation) {
      const result = await item.tool.prepareInvocation(options, token);
      if (!result) {
        return void 0;
      }
      if (result.pastTenseMessage || result.presentation) {
        checkProposedApiEnabled(item.extension, "chatParticipantPrivate");
      }
      if (result.confirmationMessages?.approveCombination !== void 0) {
        checkProposedApiEnabled(item.extension, "toolInvocationApproveCombination");
      }
      const approveCombination = result.confirmationMessages?.approveCombination;
      const approveCombinationLabel = approveCombination ? typeConvert.MarkdownString.fromStrict(approveCombination.message) : void 0;
      const approveCombinationKey = approveCombinationLabel ? await computeCombinationKey(toolId, context.parameters) : void 0;
      return {
        confirmationMessages: result.confirmationMessages ? {
          title: typeof result.confirmationMessages.title === "string" ? result.confirmationMessages.title : typeConvert.MarkdownString.from(result.confirmationMessages.title),
          message: typeof result.confirmationMessages.message === "string" ? result.confirmationMessages.message : typeConvert.MarkdownString.from(result.confirmationMessages.message),
          approveCombination: approveCombinationLabel && approveCombinationKey ? { label: approveCombinationLabel, key: approveCombinationKey, arguments: approveCombination.arguments } : void 0
        } : void 0,
        invocationMessage: typeConvert.MarkdownString.fromStrict(result.invocationMessage),
        pastTenseMessage: typeConvert.MarkdownString.fromStrict(result.pastTenseMessage),
        presentation: result.presentation
      };
    }
    return void 0;
  }
  registerTool(extension, id, tool) {
    this._registeredTools.set(id, { extension, tool });
    this._proxy.$registerTool(id, typeof tool.handleToolStream === "function");
    return toDisposable(() => {
      this._registeredTools.delete(id);
      this._proxy.$unregisterTool(id);
    });
  }
  registerToolDefinition(extension, definition, tool) {
    checkProposedApiEnabled(extension, "languageModelToolSupportsModel");
    const id = definition.name;
    const dto = {
      id,
      displayName: definition.displayName,
      toolReferenceName: definition.toolReferenceName,
      userDescription: definition.userDescription,
      modelDescription: definition.description,
      inputSchema: definition.inputSchema,
      source: {
        type: "extension",
        label: extension.displayName ?? extension.name,
        extensionId: extension.identifier
      },
      icon: typeConvert.IconPath.from(definition.icon),
      models: definition.models,
      toolSet: definition.toolSet,
      tags: definition.tags,
      fullReferenceName: void 0
      // will be filled in on the main thread based on the extension ID and tool reference name
    };
    this._registeredTools.set(id, { extension, tool });
    this._proxy.$registerToolWithDefinition(extension.identifier, dto, typeof tool.handleToolStream === "function");
    return toDisposable(() => {
      this._registeredTools.delete(id);
      this._proxy.$unregisterTool(id);
    });
  }
}
export {
  ExtHostLanguageModelTools
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCBJU3RyZWFtZWRUb29sSW52b2NhdGlvbiwgaXNUb29sSW52b2NhdGlvbkNvbnRleHQsIElUb29sSW52b2NhdGlvbiwgSVRvb2xJbnZvY2F0aW9uQ29udGV4dCwgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBJVG9vbEludm9jYXRpb25TdHJlYW1Db250ZXh0LCBJVG9vbFJlc3VsdCwgVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24gfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29tcHV0ZUNvbWJpbmF0aW9uS2V5IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkVkaXRUb29sSWQsIEludGVybmFsRWRpdFRvb2xJZCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL2VkaXRGaWxlVG9vbC5qcyc7XG5pbXBvcnQgeyBJbnRlcm5hbEZldGNoV2ViUGFnZVRvb2xJZCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL3Rvb2xzLmpzJztcbmltcG9ydCB7IFNlYXJjaEV4dGVuc2lvbnNUb29sSWQgfSBmcm9tICcuLi8uLi9jb250cmliL2V4dGVuc2lvbnMvY29tbW9uL3NlYXJjaEV4dGVuc2lvbnNUb29sLmpzJztcbmltcG9ydCB7IGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkLCBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRHRvLCBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0TGFuZ3VhZ2VNb2RlbFRvb2xzU2hhcGUsIElNYWluQ29udGV4dCwgSVRvb2xEYXRhRHRvLCBJVG9vbERlZmluaXRpb25EdG8sIE1haW5Db250ZXh0LCBNYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbFRvb2xzU2hhcGUgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0SG9zdExhbmd1YWdlTW9kZWxzIH0gZnJvbSAnLi9leHRIb3N0TGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0ICogYXMgdHlwZUNvbnZlcnQgZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuY2xhc3MgVG9vbCB7XG5cblx0cHJpdmF0ZSBfZGF0YTogSVRvb2xEYXRhRHRvO1xuXHRwcml2YXRlIF9hcGlPYmplY3Q6IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbEluZm9ybWF0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hcGlPYmplY3RXaXRoQ2hhdFBhcnRpY2lwYW50QWRkaXRpb25zOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xJbmZvcm1hdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihkYXRhOiBJVG9vbERhdGFEdG8pIHtcblx0XHR0aGlzLl9kYXRhID0gZGF0YTtcblx0fVxuXG5cdHVwZGF0ZShuZXdEYXRhOiBJVG9vbERhdGFEdG8pOiB2b2lkIHtcblx0XHR0aGlzLl9kYXRhID0gbmV3RGF0YTtcblx0XHR0aGlzLl9hcGlPYmplY3QgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fYXBpT2JqZWN0V2l0aENoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucyA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBkYXRhKCk6IElUb29sRGF0YUR0byB7XG5cdFx0cmV0dXJuIHRoaXMuX2RhdGE7XG5cdH1cblxuXHRnZXQgYXBpT2JqZWN0KCk6IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbEluZm9ybWF0aW9uIHtcblx0XHRpZiAoIXRoaXMuX2FwaU9iamVjdCkge1xuXHRcdFx0dGhpcy5fYXBpT2JqZWN0ID0gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRcdG5hbWU6IHRoaXMuX2RhdGEuaWQsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLl9kYXRhLm1vZGVsRGVzY3JpcHRpb24sXG5cdFx0XHRcdGlucHV0U2NoZW1hOiB0aGlzLl9kYXRhLmlucHV0U2NoZW1hLFxuXHRcdFx0XHRmdWxsUmVmZXJlbmNlTmFtZTogdGhpcy5fZGF0YS5mdWxsUmVmZXJlbmNlTmFtZSxcblx0XHRcdFx0dGFnczogdGhpcy5fZGF0YS50YWdzID8/IFtdLFxuXHRcdFx0XHRzb3VyY2U6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9hcGlPYmplY3Q7XG5cdH1cblxuXHRnZXQgYXBpT2JqZWN0V2l0aENoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucygpIHtcblx0XHRpZiAoIXRoaXMuX2FwaU9iamVjdFdpdGhDaGF0UGFydGljaXBhbnRBZGRpdGlvbnMpIHtcblx0XHRcdHRoaXMuX2FwaU9iamVjdFdpdGhDaGF0UGFydGljaXBhbnRBZGRpdGlvbnMgPSBPYmplY3QuZnJlZXplKHtcblx0XHRcdFx0bmFtZTogdGhpcy5fZGF0YS5pZCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuX2RhdGEubW9kZWxEZXNjcmlwdGlvbixcblx0XHRcdFx0aW5wdXRTY2hlbWE6IHRoaXMuX2RhdGEuaW5wdXRTY2hlbWEsXG5cdFx0XHRcdHRhZ3M6IHRoaXMuX2RhdGEudGFncyA/PyBbXSxcblx0XHRcdFx0c291cmNlOiB0eXBlQ29udmVydC5MYW5ndWFnZU1vZGVsVG9vbFNvdXJjZS50byh0aGlzLl9kYXRhLnNvdXJjZSksXG5cdFx0XHRcdGZ1bGxSZWZlcmVuY2VOYW1lOiB0aGlzLl9kYXRhLmZ1bGxSZWZlcmVuY2VOYW1lXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2FwaU9iamVjdFdpdGhDaGF0UGFydGljaXBhbnRBZGRpdGlvbnM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMgaW1wbGVtZW50cyBFeHRIb3N0TGFuZ3VhZ2VNb2RlbFRvb2xzU2hhcGUge1xuXHQvKiogQSBtYXAgb2YgdG9vbHMgdGhhdCB3ZXJlIHJlZ2lzdGVyZWQgaW4gdGhpcyBFSCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RlcmVkVG9vbHMgPSBuZXcgTWFwPHN0cmluZywgeyBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbjsgdG9vbDogdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sPE9iamVjdD4gfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IE1haW5UaHJlYWRMYW5ndWFnZU1vZGVsVG9vbHNTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5Db3VudEZ1bmNzID0gbmV3IE1hcDwvKiBjYWxsIElEICovc3RyaW5nLCAodGV4dDogc3RyaW5nLCB0b2tlbj86IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikgPT4gVGhlbmFibGU8bnVtYmVyPj4oKTtcblxuXHQvKiogQSBtYXAgb2YgYWxsIGtub3duIHRvb2xzLCBmcm9tIG90aGVyIEVIcyBvciByZWdpc3RlcmVkIGluIHZzY29kZSBjb3JlICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsbFRvb2xzID0gbmV3IE1hcDxzdHJpbmcsIFRvb2w+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bWFpbkNvbnRleHQ6IElNYWluQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsczogRXh0SG9zdExhbmd1YWdlTW9kZWxzLFxuXHQpIHtcblx0XHR0aGlzLl9wcm94eSA9IG1haW5Db250ZXh0LmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRMYW5ndWFnZU1vZGVsVG9vbHMpO1xuXG5cdFx0dGhpcy5fcHJveHkuJGdldFRvb2xzKCkudGhlbih0b29scyA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgdG9vbHMpIHtcblx0XHRcdFx0dGhpcy5fYWxsVG9vbHMuc2V0KHRvb2wuaWQsIG5ldyBUb29sKHJldml2ZSh0b29sKSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgJGNvdW50VG9rZW5zRm9ySW52b2NhdGlvbihjYWxsSWQ6IHN0cmluZywgaW5wdXQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCBmbiA9IHRoaXMuX3Rva2VuQ291bnRGdW5jcy5nZXQoY2FsbElkKTtcblx0XHRpZiAoIWZuKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRvb2wgaW52b2NhdGlvbiBjYWxsICR7Y2FsbElkfSBub3QgZm91bmRgKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXdhaXQgZm4oaW5wdXQsIHRva2VuKTtcblx0fVxuXG5cdGFzeW5jIGludm9rZVRvb2woZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHRvb2xJZE9ySW5mbzogc3RyaW5nIHwgdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sSW5mb3JtYXRpb24sIG9wdGlvbnM6IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbEludm9jYXRpb25PcHRpb25zPGFueT4sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHRvb2xJZCA9IHR5cGVvZiB0b29sSWRPckluZm8gPT09ICdzdHJpbmcnID8gdG9vbElkT3JJbmZvIDogdG9vbElkT3JJbmZvLm5hbWU7XG5cdFx0Y29uc3QgY2FsbElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0aWYgKG9wdGlvbnMudG9rZW5pemF0aW9uT3B0aW9ucykge1xuXHRcdFx0dGhpcy5fdG9rZW5Db3VudEZ1bmNzLnNldChjYWxsSWQsIG9wdGlvbnMudG9rZW5pemF0aW9uT3B0aW9ucy5jb3VudFRva2Vucyk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChvcHRpb25zLnRvb2xJbnZvY2F0aW9uVG9rZW4gJiYgIWlzVG9vbEludm9jYXRpb25Db250ZXh0KG9wdGlvbnMudG9vbEludm9jYXRpb25Ub2tlbikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHRvb2wgaW52b2NhdGlvbiB0b2tlbmApO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoKHRvb2xJZCA9PT0gSW50ZXJuYWxFZGl0VG9vbElkIHx8IHRvb2xJZCA9PT0gRXh0ZW5zaW9uRWRpdFRvb2xJZCkgJiYgIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgdG9vbDogJHt0b29sSWR9YCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1ha2luZyB0aGUgcm91bmQgdHJpcCBoZXJlIGJlY2F1c2Ugbm90IGFsbCB0b29scyB3ZXJlIG5lY2Vzc2FyaWx5IHJlZ2lzdGVyZWQgaW4gdGhpcyBFSFxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJveHkuJGludm9rZVRvb2woe1xuXHRcdFx0XHR0b29sSWQsXG5cdFx0XHRcdGNhbGxJZCxcblx0XHRcdFx0cGFyYW1ldGVyczogb3B0aW9ucy5pbnB1dCxcblx0XHRcdFx0dG9rZW5CdWRnZXQ6IG9wdGlvbnMudG9rZW5pemF0aW9uT3B0aW9ucz8udG9rZW5CdWRnZXQsXG5cdFx0XHRcdGNvbnRleHQ6IG9wdGlvbnMudG9vbEludm9jYXRpb25Ub2tlbiBhcyBJVG9vbEludm9jYXRpb25Db250ZXh0IHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRjaGF0UmVxdWVzdElkOiBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJykgPyBvcHRpb25zLmNoYXRSZXF1ZXN0SWQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNoYXRJbnRlcmFjdGlvbklkOiBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJykgPyBvcHRpb25zLmNoYXRJbnRlcmFjdGlvbklkIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpID8gb3B0aW9ucy5zdWJBZ2VudEludm9jYXRpb25JZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y2hhdFN0cmVhbVRvb2xDYWxsSWQ6IGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpID8gb3B0aW9ucy5jaGF0U3RyZWFtVG9vbENhbGxJZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJlVG9vbFVzZVJlc3VsdDogaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpID8gb3B0aW9ucy5wcmVUb29sVXNlUmVzdWx0IDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0cmFjZXBhcmVudDogaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpID8gb3B0aW9ucy50cmFjZXBhcmVudCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dHJhY2VzdGF0ZTogaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpID8gb3B0aW9ucy50cmFjZXN0YXRlIDogdW5kZWZpbmVkLFxuXHRcdFx0fSwgdG9rZW4pO1xuXG5cdFx0XHRjb25zdCBkdG86IER0bzxJVG9vbFJlc3VsdD4gPSByZXN1bHQgaW5zdGFuY2VvZiBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyA/IHJlc3VsdC52YWx1ZSA6IHJlc3VsdDtcblx0XHRcdHJldHVybiB0eXBlQ29udmVydC5MYW5ndWFnZU1vZGVsVG9vbFJlc3VsdC50byhyZXZpdmUoZHRvKSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3Rva2VuQ291bnRGdW5jcy5kZWxldGUoY2FsbElkKTtcblx0XHR9XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VUb29scyh0b29sczogSVRvb2xEYXRhRHRvW10pOiB2b2lkIHtcblxuXHRcdGNvbnN0IG9sZFRvb2xzID0gbmV3IFNldCh0aGlzLl9hbGxUb29scy5rZXlzKCkpO1xuXG5cdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xzKSB7XG5cdFx0XHRvbGRUb29scy5kZWxldGUodG9vbC5pZCk7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2FsbFRvb2xzLmdldCh0b29sLmlkKTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRleGlzdGluZy51cGRhdGUodG9vbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9hbGxUb29scy5zZXQodG9vbC5pZCwgbmV3IFRvb2wocmV2aXZlKHRvb2wpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBpZCBvZiBvbGRUb29scykge1xuXHRcdFx0dGhpcy5fYWxsVG9vbHMuZGVsZXRlKGlkKTtcblx0XHR9XG5cdH1cblxuXHRnZXRUb29scyhleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbEluZm9ybWF0aW9uW10ge1xuXHRcdGNvbnN0IGhhc1BhcnRpY2lwYW50QWRkaXRpb25zID0gaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fYWxsVG9vbHMudmFsdWVzKCkpXG5cdFx0XHQubWFwKHRvb2wgPT4gaGFzUGFydGljaXBhbnRBZGRpdGlvbnMgPyB0b29sLmFwaU9iamVjdFdpdGhDaGF0UGFydGljaXBhbnRBZGRpdGlvbnMgOiB0b29sLmFwaU9iamVjdClcblx0XHRcdC5maWx0ZXIodG9vbCA9PiB7XG5cdFx0XHRcdHN3aXRjaCAodG9vbC5uYW1lKSB7XG5cdFx0XHRcdFx0Y2FzZSBJbnRlcm5hbEVkaXRUb29sSWQ6XG5cdFx0XHRcdFx0Y2FzZSBFeHRlbnNpb25FZGl0VG9vbElkOlxuXHRcdFx0XHRcdGNhc2UgSW50ZXJuYWxGZXRjaFdlYlBhZ2VUb29sSWQ6XG5cdFx0XHRcdFx0Y2FzZSBTZWFyY2hFeHRlbnNpb25zVG9vbElkOlxuXHRcdFx0XHRcdFx0cmV0dXJuIGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKTtcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgJGludm9rZVRvb2woZHRvOiBEdG88SVRvb2xJbnZvY2F0aW9uPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxEdG88SVRvb2xSZXN1bHQ+IHwgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8RHRvPElUb29sUmVzdWx0Pj4+IHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fcmVnaXN0ZXJlZFRvb2xzLmdldChkdG8udG9vbElkKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biB0b29sICR7ZHRvLnRvb2xJZH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRpb25zOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xJbnZvY2F0aW9uT3B0aW9uczxPYmplY3Q+ID0ge1xuXHRcdFx0aW5wdXQ6IGR0by5wYXJhbWV0ZXJzLFxuXHRcdFx0dG9vbEludm9jYXRpb25Ub2tlbjogcmV2aXZlKGR0by5jb250ZXh0KSBhcyB1bmtub3duIGFzIHZzY29kZS5DaGF0UGFydGljaXBhbnRUb29sVG9rZW4gfCB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHRpZiAoaXNQcm9wb3NlZEFwaUVuYWJsZWQoaXRlbS5leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJykpIHtcblx0XHRcdG9wdGlvbnMuY2hhdFJlcXVlc3RJZCA9IGR0by5jaGF0UmVxdWVzdElkO1xuXHRcdFx0b3B0aW9ucy5jaGF0SW50ZXJhY3Rpb25JZCA9IGR0by5jaGF0SW50ZXJhY3Rpb25JZDtcblx0XHRcdG9wdGlvbnMuY2hhdFNlc3Npb25SZXNvdXJjZSA9IFVSSS5yZXZpdmUoZHRvLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRvcHRpb25zLndvcmtpbmdEaXJlY3RvcnkgPSBVUkkucmV2aXZlKGR0by5jb250ZXh0Py53b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdG9wdGlvbnMuc3ViQWdlbnRJbnZvY2F0aW9uSWQgPSBkdG8uc3ViQWdlbnRJbnZvY2F0aW9uSWQ7XG5cdFx0XHRvcHRpb25zLnRyYWNlcGFyZW50ID0gZHRvLnRyYWNlcGFyZW50O1xuXHRcdFx0b3B0aW9ucy50cmFjZXN0YXRlID0gZHRvLnRyYWNlc3RhdGU7XG5cdFx0fVxuXG5cdFx0aWYgKGlzUHJvcG9zZWRBcGlFbmFibGVkKGl0ZW0uZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJykgJiYgZHRvLm1vZGVsSWQpIHtcblx0XHRcdG9wdGlvbnMubW9kZWwgPSBhd2FpdCB0aGlzLmdldE1vZGVsKGR0by5tb2RlbElkLCBpdGVtLmV4dGVuc2lvbik7XG5cdFx0fVxuXHRcdGlmIChpc1Byb3Bvc2VkQXBpRW5hYmxlZChpdGVtLmV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpICYmIGR0by5jaGF0U3RyZWFtVG9vbENhbGxJZCkge1xuXHRcdFx0b3B0aW9ucy5jaGF0U3RyZWFtVG9vbENhbGxJZCA9IGR0by5jaGF0U3RyZWFtVG9vbENhbGxJZDtcblx0XHR9XG5cblx0XHRpZiAoZHRvLnRva2VuQnVkZ2V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdG9wdGlvbnMudG9rZW5pemF0aW9uT3B0aW9ucyA9IHtcblx0XHRcdFx0dG9rZW5CdWRnZXQ6IGR0by50b2tlbkJ1ZGdldCxcblx0XHRcdFx0Y291bnRUb2tlbnM6IHRoaXMuX3Rva2VuQ291bnRGdW5jcy5nZXQoZHRvLmNhbGxJZCkgfHwgKCh2YWx1ZSwgdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSA9PlxuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRjb3VudFRva2Vuc0Zvckludm9jYXRpb24oZHRvLmNhbGxJZCwgdmFsdWUsIHRva2VuKSlcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0bGV0IHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8eyBtZXNzYWdlPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nOyBpbmNyZW1lbnQ/OiBudW1iZXIgfT4gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGlzUHJvcG9zZWRBcGlFbmFibGVkKGl0ZW0uZXh0ZW5zaW9uLCAndG9vbFByb2dyZXNzJykpIHtcblx0XHRcdGxldCBsYXN0UHJvZ3Jlc3M6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdHByb2dyZXNzID0ge1xuXHRcdFx0XHRyZXBvcnQ6IHZhbHVlID0+IHtcblx0XHRcdFx0XHRpZiAodmFsdWUuaW5jcmVtZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGxhc3RQcm9ncmVzcyA9IChsYXN0UHJvZ3Jlc3MgPz8gMCkgKyB2YWx1ZS5pbmNyZW1lbnQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdFRvb2xQcm9ncmVzcyhkdG8uY2FsbElkLCB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlOiB0eXBlQ29udmVydC5NYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KHZhbHVlLm1lc3NhZ2UpLFxuXHRcdFx0XHRcdFx0cHJvZ3Jlc3M6IGxhc3RQcm9ncmVzcyA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogbGFzdFByb2dyZXNzIC8gMTAwLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIHRvZG86ICdhbnknIGNhc3QgYmVjYXVzZSBUUyBjYW4ndCBoYW5kbGUgdGhlIG92ZXJsb2Fkc1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IGV4dGVuc2lvblJlc3VsdCA9IGF3YWl0IHJhY2VDYW5jZWxsYXRpb24oUHJvbWlzZS5yZXNvbHZlKChpdGVtLnRvb2wuaW52b2tlIGFzIGFueSkob3B0aW9ucywgdG9rZW4sIHByb2dyZXNzISkpLCB0b2tlbik7XG5cdFx0aWYgKCFleHRlbnNpb25SZXN1bHQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0eXBlQ29udmVydC5MYW5ndWFnZU1vZGVsVG9vbFJlc3VsdC5mcm9tKGV4dGVuc2lvblJlc3VsdCwgaXRlbS5leHRlbnNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRNb2RlbChtb2RlbElkOiBzdHJpbmcsIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogUHJvbWlzZTx2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXQ+IHtcblx0XHRsZXQgbW9kZWw6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdCB8IHVuZGVmaW5lZDtcblx0XHRpZiAobW9kZWxJZCkge1xuXHRcdFx0bW9kZWwgPSBhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVscy5nZXRMYW5ndWFnZU1vZGVsQnlJZGVudGlmaWVyKGV4dGVuc2lvbiwgbW9kZWxJZCk7XG5cdFx0fVxuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdG1vZGVsID0gYXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHMuZ2V0RGVmYXVsdExhbmd1YWdlTW9kZWwoZXh0ZW5zaW9uKTtcblx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdMYW5ndWFnZSBtb2RlbCB1bmF2YWlsYWJsZScpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdGFzeW5jICRoYW5kbGVUb29sU3RyZWFtKHRvb2xJZDogc3RyaW5nLCBjb250ZXh0OiBJVG9vbEludm9jYXRpb25TdHJlYW1Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTdHJlYW1lZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuX3JlZ2lzdGVyZWRUb29scy5nZXQodG9vbElkKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biB0b29sICR7dG9vbElkfWApO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgY2FsbCBoYW5kbGVUb29sU3RyZWFtIGlmIGl0J3MgZGVmaW5lZCBvbiB0aGUgdG9vbFxuXHRcdGlmICghaXRlbS50b29sLmhhbmRsZVRvb2xTdHJlYW0pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIHRoZSBjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMgQVBJIGlzIGVuYWJsZWRcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChpdGVtLmV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sSW52b2NhdGlvblN0cmVhbU9wdGlvbnM8YW55PiA9IHtcblx0XHRcdHJhd0lucHV0OiBjb250ZXh0LnJhd0lucHV0LFxuXHRcdFx0Y2hhdFJlcXVlc3RJZDogY29udGV4dC5jaGF0UmVxdWVzdElkLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogY29udGV4dC5jaGF0U2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Y2hhdEludGVyYWN0aW9uSWQ6IGNvbnRleHQuY2hhdEludGVyYWN0aW9uSWRcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaXRlbS50b29sLmhhbmRsZVRvb2xTdHJlYW0ob3B0aW9ucywgdG9rZW4pO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogdHlwZUNvbnZlcnQuTWFya2Rvd25TdHJpbmcuZnJvbVN0cmljdChyZXN1bHQuaW52b2NhdGlvbk1lc3NhZ2UpXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jICRwcmVwYXJlVG9vbEludm9jYXRpb24odG9vbElkOiBzdHJpbmcsIGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9yZWdpc3RlcmVkVG9vbHMuZ2V0KHRvb2xJZCk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG9vbCAke3Rvb2xJZH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRpb25zOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xJbnZvY2F0aW9uUHJlcGFyZU9wdGlvbnM8YW55PiA9IHtcblx0XHRcdGlucHV0OiBjb250ZXh0LnBhcmFtZXRlcnMsXG5cdFx0XHRjaGF0UmVxdWVzdElkOiBjb250ZXh0LmNoYXRSZXF1ZXN0SWQsXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBjb250ZXh0LmNoYXRTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRjaGF0SW50ZXJhY3Rpb25JZDogY29udGV4dC5jaGF0SW50ZXJhY3Rpb25JZCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5yZXZpdmUoY29udGV4dC53b3JraW5nRGlyZWN0b3J5KSxcblx0XHRcdGZvcmNlQ29uZmlybWF0aW9uUmVhc29uOiBjb250ZXh0LmZvcmNlQ29uZmlybWF0aW9uUmVhc29uXG5cdFx0fTtcblx0XHRpZiAoY29udGV4dC5mb3JjZUNvbmZpcm1hdGlvblJlYXNvbikge1xuXHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoaXRlbS5leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyk7XG5cdFx0fVxuXHRcdGlmIChpdGVtLnRvb2wucHJlcGFyZUludm9jYXRpb24pIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGl0ZW0udG9vbC5wcmVwYXJlSW52b2NhdGlvbihvcHRpb25zLCB0b2tlbik7XG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzdWx0LnBhc3RUZW5zZU1lc3NhZ2UgfHwgcmVzdWx0LnByZXNlbnRhdGlvbikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChpdGVtLmV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlc3VsdC5jb25maXJtYXRpb25NZXNzYWdlcz8uYXBwcm92ZUNvbWJpbmF0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoaXRlbS5leHRlbnNpb24sICd0b29sSW52b2NhdGlvbkFwcHJvdmVDb21iaW5hdGlvbicpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhcHByb3ZlQ29tYmluYXRpb24gPSByZXN1bHQuY29uZmlybWF0aW9uTWVzc2FnZXM/LmFwcHJvdmVDb21iaW5hdGlvbjtcblx0XHRcdGNvbnN0IGFwcHJvdmVDb21iaW5hdGlvbkxhYmVsID0gYXBwcm92ZUNvbWJpbmF0aW9uXG5cdFx0XHRcdD8gdHlwZUNvbnZlcnQuTWFya2Rvd25TdHJpbmcuZnJvbVN0cmljdChhcHByb3ZlQ29tYmluYXRpb24ubWVzc2FnZSlcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBhcHByb3ZlQ29tYmluYXRpb25LZXkgPSBhcHByb3ZlQ29tYmluYXRpb25MYWJlbFxuXHRcdFx0XHQ/IGF3YWl0IGNvbXB1dGVDb21iaW5hdGlvbktleSh0b29sSWQsIGNvbnRleHQucGFyYW1ldGVycylcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiByZXN1bHQuY29uZmlybWF0aW9uTWVzc2FnZXMgPyB7XG5cdFx0XHRcdFx0dGl0bGU6IHR5cGVvZiByZXN1bHQuY29uZmlybWF0aW9uTWVzc2FnZXMudGl0bGUgPT09ICdzdHJpbmcnID8gcmVzdWx0LmNvbmZpcm1hdGlvbk1lc3NhZ2VzLnRpdGxlIDogdHlwZUNvbnZlcnQuTWFya2Rvd25TdHJpbmcuZnJvbShyZXN1bHQuY29uZmlybWF0aW9uTWVzc2FnZXMudGl0bGUpLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHR5cGVvZiByZXN1bHQuY29uZmlybWF0aW9uTWVzc2FnZXMubWVzc2FnZSA9PT0gJ3N0cmluZycgPyByZXN1bHQuY29uZmlybWF0aW9uTWVzc2FnZXMubWVzc2FnZSA6IHR5cGVDb252ZXJ0Lk1hcmtkb3duU3RyaW5nLmZyb20ocmVzdWx0LmNvbmZpcm1hdGlvbk1lc3NhZ2VzLm1lc3NhZ2UpLFxuXHRcdFx0XHRcdGFwcHJvdmVDb21iaW5hdGlvbjogYXBwcm92ZUNvbWJpbmF0aW9uTGFiZWwgJiYgYXBwcm92ZUNvbWJpbmF0aW9uS2V5ID8geyBsYWJlbDogYXBwcm92ZUNvbWJpbmF0aW9uTGFiZWwsIGtleTogYXBwcm92ZUNvbWJpbmF0aW9uS2V5LCBhcmd1bWVudHM6IGFwcHJvdmVDb21iaW5hdGlvbiEuYXJndW1lbnRzIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB0eXBlQ29udmVydC5NYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KHJlc3VsdC5pbnZvY2F0aW9uTWVzc2FnZSksXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHR5cGVDb252ZXJ0Lk1hcmtkb3duU3RyaW5nLmZyb21TdHJpY3QocmVzdWx0LnBhc3RUZW5zZU1lc3NhZ2UpLFxuXHRcdFx0XHRwcmVzZW50YXRpb246IHJlc3VsdC5wcmVzZW50YXRpb24gYXMgVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24gfCB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZWdpc3RlclRvb2woZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkOiBzdHJpbmcsIHRvb2w6IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbDxhbnk+KTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX3JlZ2lzdGVyZWRUb29scy5zZXQoaWQsIHsgZXh0ZW5zaW9uLCB0b29sIH0pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlclRvb2woaWQsIHR5cGVvZiB0b29sLmhhbmRsZVRvb2xTdHJlYW0gPT09ICdmdW5jdGlvbicpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcmVkVG9vbHMuZGVsZXRlKGlkKTtcblx0XHRcdHRoaXMuX3Byb3h5LiR1bnJlZ2lzdGVyVG9vbChpZCk7XG5cdFx0fSk7XG5cdH1cblxuXHRyZWdpc3RlclRvb2xEZWZpbml0aW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZpbml0aW9uOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xEZWZpbml0aW9uLCB0b29sOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2w8YW55Pik6IElEaXNwb3NhYmxlIHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdsYW5ndWFnZU1vZGVsVG9vbFN1cHBvcnRzTW9kZWwnKTtcblxuXHRcdGNvbnN0IGlkID0gZGVmaW5pdGlvbi5uYW1lO1xuXG5cdFx0Ly8gQ29udmVydCB0aGUgZGVmaW5pdGlvbiB0byBhIERUT1xuXHRcdGNvbnN0IGR0bzogSVRvb2xEZWZpbml0aW9uRHRvID0ge1xuXHRcdFx0aWQsXG5cdFx0XHRkaXNwbGF5TmFtZTogZGVmaW5pdGlvbi5kaXNwbGF5TmFtZSxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiBkZWZpbml0aW9uLnRvb2xSZWZlcmVuY2VOYW1lLFxuXHRcdFx0dXNlckRlc2NyaXB0aW9uOiBkZWZpbml0aW9uLnVzZXJEZXNjcmlwdGlvbixcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246IGRlZmluaXRpb24uZGVzY3JpcHRpb24sXG5cdFx0XHRpbnB1dFNjaGVtYTogZGVmaW5pdGlvbi5pbnB1dFNjaGVtYSBhcyBvYmplY3QsXG5cdFx0XHRzb3VyY2U6IHtcblx0XHRcdFx0dHlwZTogJ2V4dGVuc2lvbicsXG5cdFx0XHRcdGxhYmVsOiBleHRlbnNpb24uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLm5hbWUsXG5cdFx0XHRcdGV4dGVuc2lvbklkOiBleHRlbnNpb24uaWRlbnRpZmllcixcblx0XHRcdH0sXG5cdFx0XHRpY29uOiB0eXBlQ29udmVydC5JY29uUGF0aC5mcm9tKGRlZmluaXRpb24uaWNvbiksXG5cdFx0XHRtb2RlbHM6IGRlZmluaXRpb24ubW9kZWxzLFxuXHRcdFx0dG9vbFNldDogZGVmaW5pdGlvbi50b29sU2V0LFxuXHRcdFx0dGFnczogZGVmaW5pdGlvbi50YWdzLFxuXHRcdFx0ZnVsbFJlZmVyZW5jZU5hbWU6IHVuZGVmaW5lZCwgLy8gd2lsbCBiZSBmaWxsZWQgaW4gb24gdGhlIG1haW4gdGhyZWFkIGJhc2VkIG9uIHRoZSBleHRlbnNpb24gSUQgYW5kIHRvb2wgcmVmZXJlbmNlIG5hbWVcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJlZFRvb2xzLnNldChpZCwgeyBleHRlbnNpb24sIHRvb2wgfSk7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyVG9vbFdpdGhEZWZpbml0aW9uKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBkdG8sIHR5cGVvZiB0b29sLmhhbmRsZVRvb2xTdHJlYW0gPT09ICdmdW5jdGlvbicpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcmVkVG9vbHMuZGVsZXRlKGlkKTtcblx0XHRcdHRoaXMuX3Byb3h5LiR1bnJlZ2lzdGVyVG9vbChpZCk7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQXNCLG9CQUFvQjtBQUMxQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxvQkFBb0I7QUFFN0IsU0FBMkQsK0JBQWtMO0FBQzdPLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCLDBCQUEwQjtBQUN4RCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHlCQUF5Qiw0QkFBNEI7QUFDOUQsU0FBYyxxQ0FBcUM7QUFDbkQsU0FBeUYsbUJBQXNEO0FBRS9JLFlBQVksaUJBQWlCO0FBQzdCLFNBQVMsV0FBVztBQUVwQixNQUFNLEtBQUs7QUFBQSxFQU1WLFlBQVksTUFBb0I7QUFDL0IsU0FBSyxRQUFRO0FBQUEsRUFDZDtBQUFBLEVBRUEsT0FBTyxTQUE2QjtBQUNuQyxTQUFLLFFB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
