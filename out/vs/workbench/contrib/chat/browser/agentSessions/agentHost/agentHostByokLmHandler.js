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
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import {
  ChatMessageRole,
  ILanguageModelsService
} from "../../../common/languageModels.js";
const STATEFUL_MARKER_MIME_TYPE = "stateful_marker";
const USAGE_MIME_TYPE = "usage";
const REASONING_METADATA_PREFIX = "vscode-reasoning-metadata:";
let AgentHostByokLmHandler = class extends Disposable {
  constructor(_languageModelsService, _logService) {
    super();
    this._languageModelsService = _languageModelsService;
    this._logService = _logService;
    this._onDidChangeModels = this._register(new Emitter());
    /** Fires when the renderer's BYOK models change, so the node agent host re-enumerates. */
    this.onDidChangeModels = this._onDidChangeModels.event;
    this._register(Event.debounce(this._languageModelsService.onDidChangeLanguageModels, () => void 0, 500)(() => {
      this._onDidChangeModels.fire();
    }));
  }
  async chat(request, token) {
    const modelIdentifier = this._resolveModelIdentifier(request.vendor, request.modelId);
    if (!modelIdentifier) {
      return { output: [], error: `No BYOK model found for ${request.vendor}/${request.modelId}` };
    }
    const messages = this._toChatMessages(request);
    const tools = request.tools?.length ? request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.type === "function" ? tool.parametersSchema : { type: "object", properties: { input: { type: "string" } }, required: ["input"] }
    })) : void 0;
    const options = {
      modelOptions: request.modelOptions,
      includeEncryptedThinking: true,
      ...request.reasoningEffort ? { configuration: { reasoningEffort: request.reasoningEffort } } : {},
      ...tools ? { tools } : {}
    };
    try {
      const response = await this._languageModelsService.sendChatRequest(modelIdentifier, void 0, messages, options, token);
      const output = [];
      const customToolNames = new Set(request.tools?.filter((tool) => tool.type === "custom").map((tool) => tool.name));
      let responseId;
      let usage;
      const streaming = (async () => {
        for await (const part of response.stream) {
          const parts = Array.isArray(part) ? part : [part];
          for (const p of parts) {
            if (p.type === "text") {
              this._appendTextOutput(output, p.value);
            } else if (p.type === "thinking") {
              this._appendReasoningOutput(output, p);
            } else if (p.type === "tool_use") {
              if (customToolNames.has(p.name)) {
                output.push({
                  type: "custom_tool_call",
                  callId: p.toolCallId,
                  name: p.name,
                  input: this._customToolInput(p.parameters)
                });
              } else {
                output.push({
                  type: "function_call",
                  callId: p.toolCallId,
                  name: p.name,
                  argumentsJson: JSON.stringify(p.parameters ?? {})
                });
              }
            } else if (p.type === "data" && p.mimeType === STATEFUL_MARKER_MIME_TYPE) {
              responseId = this._decodeStatefulMarker(p.data, request.modelId);
            } else if (p.type === "data" && p.mimeType === USAGE_MIME_TYPE) {
              usage = this._decodeUsage(p.data);
            }
          }
        }
      })();
      await Promise.all([response.result, streaming]);
      return { output, responseId, usage };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._logService.warn(`[AgentHostByokLmHandler] chat request failed for ${request.vendor}/${request.modelId}: ${message}`);
      return { output: [], error: message };
    }
  }
  async listModels(_token) {
    const models = [];
    for (const identifier of this._languageModelsService.getLanguageModelIds()) {
      const metadata = this._languageModelsService.lookupLanguageModel(identifier);
      if (metadata?.isBYOK && !metadata.targetChatSessionType) {
        const reasoningEffortSchema = metadata.configurationSchema?.properties?.reasoningEffort;
        const supportedReasoningEfforts = reasoningEffortSchema?.enum?.filter((value) => typeof value === "string");
        const defaultReasoningEffort = typeof reasoningEffortSchema?.default === "string" ? reasoningEffortSchema.default : void 0;
        models.push({
          vendor: metadata.vendor,
          id: metadata.id,
          name: metadata.name,
          modelIdentifier: identifier,
          maxContextWindowTokens: metadata.maxInputTokens + metadata.maxOutputTokens,
          supportsVision: !!metadata.capabilities?.vision,
          ...supportedReasoningEfforts?.length ? { supportedReasoningEfforts } : {},
          ...defaultReasoningEffort !== void 0 ? { defaultReasoningEffort } : {}
        });
      }
    }
    return models;
  }
  /**
   * Find the LM API identifier for a BYOK model addressed by its vendor and
   * provider-local id (the `provider/id` selection id the picker surfaced).
   */
  _resolveModelIdentifier(vendor, modelId) {
    for (const identifier of this._languageModelsService.getLanguageModelIds()) {
      const metadata = this._languageModelsService.lookupLanguageModel(identifier);
      if (metadata?.isBYOK && metadata.vendor === vendor && metadata.id === modelId) {
        return identifier;
      }
    }
    return void 0;
  }
  _toChatMessages(request) {
    const messages = [];
    if (request.previousResponseId) {
      messages.push({
        role: ChatMessageRole.Assistant,
        content: [{
          type: "data",
          mimeType: STATEFUL_MARKER_MIME_TYPE,
          data: VSBuffer.fromString(`${request.modelId}\\${request.previousResponseId}`)
        }]
      });
    }
    if (request.instructions) {
      messages.push({
        role: ChatMessageRole.System,
        content: [{ type: "text", value: request.instructions }]
      });
    }
    for (const item of request.input) {
      const message = this._toChatMessage(item);
      const previous = messages.at(-1);
      if (message.role === ChatMessageRole.Assistant && previous?.role === ChatMessageRole.Assistant) {
        messages[messages.length - 1] = {
          ...previous,
          content: [...previous.content, ...message.content]
        };
      } else {
        messages.push(message);
      }
    }
    return messages;
  }
  _toChatMessage(item) {
    switch (item.type) {
      case "message":
        return {
          role: this._toChatRole(item.role),
          content: [{ type: "text", value: item.content.map((part) => part.text).join("") }]
        };
      case "reasoning": {
        return {
          role: ChatMessageRole.Assistant,
          content: [{
            type: "thinking",
            value: item.summary,
            id: item.id,
            metadata: {
              ...item.metadata,
              ...item.encryptedContent ? this._decodeReasoningMetadata(item.encryptedContent) : {}
            }
          }]
        };
      }
      case "function_call":
        return {
          role: ChatMessageRole.Assistant,
          content: [{
            type: "tool_use",
            name: item.name,
            toolCallId: item.callId,
            parameters: this._safeParseJson(item.argumentsJson)
          }]
        };
      case "custom_tool_call":
        return {
          role: ChatMessageRole.Assistant,
          content: [{
            type: "tool_use",
            name: item.name,
            toolCallId: item.callId,
            parameters: { input: item.input }
          }]
        };
      case "function_call_output":
      case "custom_tool_call_output":
        return {
          role: ChatMessageRole.User,
          content: [{
            type: "tool_result",
            toolCallId: item.callId,
            value: [{ type: "text", value: item.output }]
          }]
        };
    }
  }
  _appendTextOutput(output, value) {
    const previous = output.at(-1);
    if (previous?.type === "message") {
      output[output.length - 1] = {
        ...previous,
        content: [{ type: "text", text: previous.content.map((part) => part.text).join("") + value }]
      };
    } else {
      output.push({ type: "message", content: [{ type: "text", text: value }] });
    }
  }
  _appendReasoningOutput(output, part) {
    if (part.metadata?.vscode_reasoning_done === true) {
      return;
    }
    const summary = Array.isArray(part.value) ? part.value : [part.value];
    const encryptedContent = this._encodeReasoningMetadata(part.metadata);
    const reasoning = {
      type: "reasoning",
      id: part.id,
      summary,
      encryptedContent,
      metadata: part.metadata
    };
    const previous = output.at(-1);
    if (previous?.type === "reasoning" && previous.id === reasoning.id) {
      output[output.length - 1] = {
        ...previous,
        summary: [...previous.summary, ...reasoning.summary],
        encryptedContent: reasoning.encryptedContent ?? previous.encryptedContent,
        metadata: previous.metadata || reasoning.metadata ? { ...previous.metadata, ...reasoning.metadata } : void 0
      };
    } else {
      output.push(reasoning);
    }
  }
  _encodeReasoningMetadata(metadata) {
    const encryptedContent = this._stringMetadata(metadata, "encrypted_content") ?? this._stringMetadata(metadata, "encrypted");
    if (encryptedContent) {
      return encryptedContent;
    }
    const continuationMetadata = {
      ...this._stringMetadata(metadata, "signature") ? { signature: this._stringMetadata(metadata, "signature") } : {},
      ...this._stringMetadata(metadata, "_completeThinking") ? { _completeThinking: this._stringMetadata(metadata, "_completeThinking") } : {},
      ...this._stringMetadata(metadata, "redactedData") ? { redactedData: this._stringMetadata(metadata, "redactedData") } : {}
    };
    return Object.keys(continuationMetadata).length > 0 ? `${REASONING_METADATA_PREFIX}${JSON.stringify(continuationMetadata)}` : void 0;
  }
  _decodeReasoningMetadata(value) {
    if (!value.startsWith(REASONING_METADATA_PREFIX)) {
      return { encrypted_content: value };
    }
    const metadata = JSON.parse(value.slice(REASONING_METADATA_PREFIX.length));
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      throw new Error("Invalid Agent Host BYOK reasoning metadata");
    }
    return metadata;
  }
  _customToolInput(parameters) {
    if (typeof parameters === "object" && parameters !== null) {
      const input = Object.getOwnPropertyDescriptor(parameters, "input")?.value;
      if (typeof input === "string") {
        return input;
      }
    }
    return typeof parameters === "string" ? parameters : JSON.stringify(parameters ?? {});
  }
  _decodeStatefulMarker(data, expectedModelId) {
    const decoded = data.toString();
    const separator = decoded.indexOf("\\");
    if (separator === -1 || decoded.slice(0, separator) !== expectedModelId) {
      return void 0;
    }
    return decoded.slice(separator + 1) || void 0;
  }
  _decodeUsage(data) {
    try {
      const value = JSON.parse(data.toString());
      const outputDetails = typeof value.completion_tokens_details === "object" && value.completion_tokens_details !== null ? value.completion_tokens_details : void 0;
      return {
        inputTokens: this._numberProperty(value, "prompt_tokens"),
        outputTokens: this._numberProperty(value, "completion_tokens"),
        reasoningTokens: outputDetails ? this._numberProperty(outputDetails, "reasoning_tokens") : void 0
      };
    } catch {
      return void 0;
    }
  }
  _numberProperty(value, key) {
    const property = value[key];
    return typeof property === "number" ? property : void 0;
  }
  _stringMetadata(metadata, key) {
    const value = metadata?.[key];
    return typeof value === "string" ? value : void 0;
  }
  _toChatRole(role) {
    switch (role) {
      case "system":
      case "developer":
        return ChatMessageRole.System;
      case "assistant":
        return ChatMessageRole.Assistant;
      case "user":
        return ChatMessageRole.User;
    }
  }
  _safeParseJson(json) {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  }
};
AgentHostByokLmHandler = __decorateClass([
  __decorateParam(0, ILanguageModelsService),
  __decorateParam(1, ILogService)
], AgentHostByokLmHandler);
export {
  AgentHostByokLmHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RCeW9rTG1IYW5kbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7XG5cdElBZ2VudEhvc3RCeW9rTG1IYW5kbGVyLFxuXHRJQnlva0xtQ2hhdFJlcXVlc3QsXG5cdElCeW9rTG1DaGF0UmVzdWx0LFxuXHRJQnlva0xtSW5wdXRJdGVtLFxuXHRJQnlva0xtTW9kZWxJbmZvLFxuXHRJQnlva0xtT3V0cHV0SXRlbSxcblx0SUJ5b2tMbVJlYXNvbmluZ0l0ZW0sXG59IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0Qnlva0xtLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHtcblx0Q2hhdE1lc3NhZ2VSb2xlLFxuXHRJQ2hhdE1lc3NhZ2UsXG5cdElDaGF0TWVzc2FnZVBhcnQsXG5cdElMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3RPcHRpb25zLFxuXHRJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxufSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuXG5jb25zdCBTVEFURUZVTF9NQVJLRVJfTUlNRV9UWVBFID0gJ3N0YXRlZnVsX21hcmtlcic7XG5jb25zdCBVU0FHRV9NSU1FX1RZUEUgPSAndXNhZ2UnO1xuY29uc3QgUkVBU09OSU5HX01FVEFEQVRBX1BSRUZJWCA9ICd2c2NvZGUtcmVhc29uaW5nLW1ldGFkYXRhOic7XG5cbi8qKlxuICogUmVuZGVyZXItc2lkZSB7QGxpbmsgSUFnZW50SG9zdEJ5b2tMbUhhbmRsZXJ9LiBTZXJ2aWNlcyBCWU9LIGNoYXQgcmVxdWVzdHNcbiAqIGZvcndhcmRlZCBieSB0aGUgbm9kZSBhZ2VudCBob3N0J3MgT3BlbkFJIHByb3h5IGJ5IGNhbGxpbmcgdGhlIFZTIENvZGUgTE1cbiAqIEFQSSBmb3IgdGhlIG1hdGNoaW5nIGV4dGVuc2lvbi1yZWdpc3RlcmVkIG1vZGVsLlxuICpcbiAqIFRoZSBicmlkZ2UgRFRPcyBhcmUgcGxhaW4vc2VyaWFsaXphYmxlOyB0aGlzIGNsYXNzIGlzIHRoZSBzaW5nbGUgcGxhY2UgdGhhdFxuICogdHJhbnNsYXRlcyB0aGVtIHRvIGFuZCBmcm9tIHRoZSBgd29ya2JlbmNoL2NvbnRyaWIvY2hhdGAgTE0gdHlwZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RCeW9rTG1IYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RCeW9rTG1IYW5kbGVyIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1vZGVscyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHQvKiogRmlyZXMgd2hlbiB0aGUgcmVuZGVyZXIncyBCWU9LIG1vZGVscyBjaGFuZ2UsIHNvIHRoZSBub2RlIGFnZW50IGhvc3QgcmUtZW51bWVyYXRlcy4gKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbHMgPSB0aGlzLl9vbkRpZENoYW5nZU1vZGVscy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdC8vIFJlLWVtaXQgKGRlYm91bmNlZCkgd2hlbmV2ZXIgdGhlIHJlbmRlcmVyJ3MgbGFuZ3VhZ2UgbW9kZWxzIGNoYW5nZSwgc28gdGhlXG5cdFx0Ly8gYWdlbnQgaG9zdCBjYW4gcmVmcmVzaCBpdHMgQllPSyBtb2RlbCBsaXN0IFx1MjAxNCBleHRlbnNpb24tcHJvdmlkZWQgQllPSyBtb2RlbHNcblx0XHQvLyBvZnRlbiByZWdpc3RlciBzaG9ydGx5IGFmdGVyIHRoZSBicmlkZ2UgY29ubmVjdHMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZGVib3VuY2UodGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMsICgpID0+IHVuZGVmaW5lZCwgNTAwKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVscy5maXJlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgY2hhdChyZXF1ZXN0OiBJQnlva0xtQ2hhdFJlcXVlc3QsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUJ5b2tMbUNoYXRSZXN1bHQ+IHtcblx0XHRjb25zdCBtb2RlbElkZW50aWZpZXIgPSB0aGlzLl9yZXNvbHZlTW9kZWxJZGVudGlmaWVyKHJlcXVlc3QudmVuZG9yLCByZXF1ZXN0Lm1vZGVsSWQpO1xuXHRcdGlmICghbW9kZWxJZGVudGlmaWVyKSB7XG5cdFx0XHRyZXR1cm4geyBvdXRwdXQ6IFtdLCBlcnJvcjogYE5vIEJZT0sgbW9kZWwgZm91bmQgZm9yICR7cmVxdWVzdC52ZW5kb3J9LyR7cmVxdWVzdC5tb2RlbElkfWAgfTtcblx0XHR9XG5cblx0XHRjb25zdCBtZXNzYWdlcyA9IHRoaXMuX3RvQ2hhdE1lc3NhZ2VzKHJlcXVlc3QpO1xuXHRcdGNvbnN0IHRvb2xzID0gcmVxdWVzdC50b29scz8ubGVuZ3RoXG5cdFx0XHQ/IHJlcXVlc3QudG9vbHMubWFwKHRvb2wgPT4gKHtcblx0XHRcdFx0bmFtZTogdG9vbC5uYW1lLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogdG9vbC5kZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdFx0aW5wdXRTY2hlbWE6IHRvb2wudHlwZSA9PT0gJ2Z1bmN0aW9uJ1xuXHRcdFx0XHRcdD8gdG9vbC5wYXJhbWV0ZXJzU2NoZW1hXG5cdFx0XHRcdFx0OiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IGlucHV0OiB7IHR5cGU6ICdzdHJpbmcnIH0gfSwgcmVxdWlyZWQ6IFsnaW5wdXQnXSB9LFxuXHRcdFx0fSkpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvcHRpb25zOiBJTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0T3B0aW9ucyA9IHtcblx0XHRcdG1vZGVsT3B0aW9uczogcmVxdWVzdC5tb2RlbE9wdGlvbnMsXG5cdFx0XHRpbmNsdWRlRW5jcnlwdGVkVGhpbmtpbmc6IHRydWUsXG5cdFx0XHQuLi4ocmVxdWVzdC5yZWFzb25pbmdFZmZvcnQgPyB7IGNvbmZpZ3VyYXRpb246IHsgcmVhc29uaW5nRWZmb3J0OiByZXF1ZXN0LnJlYXNvbmluZ0VmZm9ydCB9IH0gOiB7fSksXG5cdFx0XHQuLi4odG9vbHMgPyB7IHRvb2xzIH0gOiB7fSksXG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5zZW5kQ2hhdFJlcXVlc3QobW9kZWxJZGVudGlmaWVyLCB1bmRlZmluZWQsIG1lc3NhZ2VzLCBvcHRpb25zLCB0b2tlbik7XG5cblx0XHRcdGNvbnN0IG91dHB1dDogSUJ5b2tMbU91dHB1dEl0ZW1bXSA9IFtdO1xuXHRcdFx0Y29uc3QgY3VzdG9tVG9vbE5hbWVzID0gbmV3IFNldChyZXF1ZXN0LnRvb2xzPy5maWx0ZXIodG9vbCA9PiB0b29sLnR5cGUgPT09ICdjdXN0b20nKS5tYXAodG9vbCA9PiB0b29sLm5hbWUpKTtcblx0XHRcdGxldCByZXNwb25zZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgdXNhZ2U6IElCeW9rTG1DaGF0UmVzdWx0Wyd1c2FnZSddO1xuXHRcdFx0Y29uc3Qgc3RyZWFtaW5nID0gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCBwYXJ0IG9mIHJlc3BvbnNlLnN0cmVhbSkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnRzID0gQXJyYXkuaXNBcnJheShwYXJ0KSA/IHBhcnQgOiBbcGFydF07XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBwIG9mIHBhcnRzKSB7XG5cdFx0XHRcdFx0XHRpZiAocC50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fYXBwZW5kVGV4dE91dHB1dChvdXRwdXQsIHAudmFsdWUpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChwLnR5cGUgPT09ICd0aGlua2luZycpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fYXBwZW5kUmVhc29uaW5nT3V0cHV0KG91dHB1dCwgcCk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHAudHlwZSA9PT0gJ3Rvb2xfdXNlJykge1xuXHRcdFx0XHRcdFx0XHRpZiAoY3VzdG9tVG9vbE5hbWVzLmhhcyhwLm5hbWUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0b3V0cHV0LnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2N1c3RvbV90b29sX2NhbGwnLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y2FsbElkOiBwLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiBwLm5hbWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRpbnB1dDogdGhpcy5fY3VzdG9tVG9vbElucHV0KHAucGFyYW1ldGVycyksXG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0b3V0cHV0LnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2Z1bmN0aW9uX2NhbGwnLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y2FsbElkOiBwLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiBwLm5hbWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRhcmd1bWVudHNKc29uOiBKU09OLnN0cmluZ2lmeShwLnBhcmFtZXRlcnMgPz8ge30pLFxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHAudHlwZSA9PT0gJ2RhdGEnICYmIHAubWltZVR5cGUgPT09IFNUQVRFRlVMX01BUktFUl9NSU1FX1RZUEUpIHtcblx0XHRcdFx0XHRcdFx0cmVzcG9uc2VJZCA9IHRoaXMuX2RlY29kZVN0YXRlZnVsTWFya2VyKHAuZGF0YSwgcmVxdWVzdC5tb2RlbElkKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAocC50eXBlID09PSAnZGF0YScgJiYgcC5taW1lVHlwZSA9PT0gVVNBR0VfTUlNRV9UWVBFKSB7XG5cdFx0XHRcdFx0XHRcdHVzYWdlID0gdGhpcy5fZGVjb2RlVXNhZ2UocC5kYXRhKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKCk7XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtyZXNwb25zZS5yZXN1bHQsIHN0cmVhbWluZ10pO1xuXHRcdFx0cmV0dXJuIHsgb3V0cHV0LCByZXNwb25zZUlkLCB1c2FnZSB9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdEJ5b2tMbUhhbmRsZXJdIGNoYXQgcmVxdWVzdCBmYWlsZWQgZm9yICR7cmVxdWVzdC52ZW5kb3J9LyR7cmVxdWVzdC5tb2RlbElkfTogJHttZXNzYWdlfWApO1xuXHRcdFx0cmV0dXJuIHsgb3V0cHV0OiBbXSwgZXJyb3I6IG1lc3NhZ2UgfTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBsaXN0TW9kZWxzKF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElCeW9rTG1Nb2RlbEluZm9bXT4ge1xuXHRcdGNvbnN0IG1vZGVsczogSUJ5b2tMbU1vZGVsSW5mb1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBpZGVudGlmaWVyIG9mIHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsSWRzKCkpIHtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwoaWRlbnRpZmllcik7XG5cdFx0XHQvLyBPbmx5IGdlbnVpbmUgcmVuZGVyZXIgQllPSyBtb2RlbHMgXHUyMDE0IGV4Y2x1ZGUgYWdlbnQtaG9zdCBjb3BpZXMsIHdoaWNoXG5cdFx0XHQvLyBjYXJyeSBhIGB0YXJnZXRDaGF0U2Vzc2lvblR5cGVgIGFuZCB3b3VsZCBvdGhlcndpc2UgcmUtZW50ZXIgdGhlIGJyaWRnZS5cblx0XHRcdGlmIChtZXRhZGF0YT8uaXNCWU9LICYmICFtZXRhZGF0YS50YXJnZXRDaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdFx0Y29uc3QgcmVhc29uaW5nRWZmb3J0U2NoZW1hID0gbWV0YWRhdGEuY29uZmlndXJhdGlvblNjaGVtYT8ucHJvcGVydGllcz8ucmVhc29uaW5nRWZmb3J0O1xuXHRcdFx0XHRjb25zdCBzdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzID0gcmVhc29uaW5nRWZmb3J0U2NoZW1hPy5lbnVtPy5maWx0ZXIoKHZhbHVlKTogdmFsdWUgaXMgc3RyaW5nID0+IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0UmVhc29uaW5nRWZmb3J0ID0gdHlwZW9mIHJlYXNvbmluZ0VmZm9ydFNjaGVtYT8uZGVmYXVsdCA9PT0gJ3N0cmluZycgPyByZWFzb25pbmdFZmZvcnRTY2hlbWEuZGVmYXVsdCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0bW9kZWxzLnB1c2goe1xuXHRcdFx0XHRcdHZlbmRvcjogbWV0YWRhdGEudmVuZG9yLFxuXHRcdFx0XHRcdGlkOiBtZXRhZGF0YS5pZCxcblx0XHRcdFx0XHRuYW1lOiBtZXRhZGF0YS5uYW1lLFxuXHRcdFx0XHRcdG1vZGVsSWRlbnRpZmllcjogaWRlbnRpZmllcixcblx0XHRcdFx0XHRtYXhDb250ZXh0V2luZG93VG9rZW5zOiBtZXRhZGF0YS5tYXhJbnB1dFRva2VucyArIG1ldGFkYXRhLm1heE91dHB1dFRva2Vucyxcblx0XHRcdFx0XHRzdXBwb3J0c1Zpc2lvbjogISFtZXRhZGF0YS5jYXBhYmlsaXRpZXM/LnZpc2lvbixcblx0XHRcdFx0XHQuLi4oc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cz8ubGVuZ3RoID8geyBzdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKGRlZmF1bHRSZWFzb25pbmdFZmZvcnQgIT09IHVuZGVmaW5lZCA/IHsgZGVmYXVsdFJlYXNvbmluZ0VmZm9ydCB9IDoge30pLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1vZGVscztcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kIHRoZSBMTSBBUEkgaWRlbnRpZmllciBmb3IgYSBCWU9LIG1vZGVsIGFkZHJlc3NlZCBieSBpdHMgdmVuZG9yIGFuZFxuXHQgKiBwcm92aWRlci1sb2NhbCBpZCAodGhlIGBwcm92aWRlci9pZGAgc2VsZWN0aW9uIGlkIHRoZSBwaWNrZXIgc3VyZmFjZWQpLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZU1vZGVsSWRlbnRpZmllcih2ZW5kb3I6IHN0cmluZywgbW9kZWxJZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGlkZW50aWZpZXIgb2YgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxJZHMoKSkge1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChpZGVudGlmaWVyKTtcblx0XHRcdGlmIChtZXRhZGF0YT8uaXNCWU9LICYmIG1ldGFkYXRhLnZlbmRvciA9PT0gdmVuZG9yICYmIG1ldGFkYXRhLmlkID09PSBtb2RlbElkKSB7XG5cdFx0XHRcdHJldHVybiBpZGVudGlmaWVyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9DaGF0TWVzc2FnZXMocmVxdWVzdDogSUJ5b2tMbUNoYXRSZXF1ZXN0KTogSUNoYXRNZXNzYWdlW10ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBJQ2hhdE1lc3NhZ2VbXSA9IFtdO1xuXHRcdGlmIChyZXF1ZXN0LnByZXZpb3VzUmVzcG9uc2VJZCkge1xuXHRcdFx0bWVzc2FnZXMucHVzaCh7XG5cdFx0XHRcdHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQsXG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0dHlwZTogJ2RhdGEnLFxuXHRcdFx0XHRcdG1pbWVUeXBlOiBTVEFURUZVTF9NQVJLRVJfTUlNRV9UWVBFLFxuXHRcdFx0XHRcdGRhdGE6IFZTQnVmZmVyLmZyb21TdHJpbmcoYCR7cmVxdWVzdC5tb2RlbElkfVxcXFwke3JlcXVlc3QucHJldmlvdXNSZXNwb25zZUlkfWApLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAocmVxdWVzdC5pbnN0cnVjdGlvbnMpIHtcblx0XHRcdG1lc3NhZ2VzLnB1c2goe1xuXHRcdFx0XHRyb2xlOiBDaGF0TWVzc2FnZVJvbGUuU3lzdGVtLFxuXHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHZhbHVlOiByZXF1ZXN0Lmluc3RydWN0aW9ucyB9XSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgcmVxdWVzdC5pbnB1dCkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHRoaXMuX3RvQ2hhdE1lc3NhZ2UoaXRlbSk7XG5cdFx0XHRjb25zdCBwcmV2aW91cyA9IG1lc3NhZ2VzLmF0KC0xKTtcblx0XHRcdGlmIChtZXNzYWdlLnJvbGUgPT09IENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQgJiYgcHJldmlvdXM/LnJvbGUgPT09IENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQpIHtcblx0XHRcdFx0bWVzc2FnZXNbbWVzc2FnZXMubGVuZ3RoIC0gMV0gPSB7XG5cdFx0XHRcdFx0Li4ucHJldmlvdXMsXG5cdFx0XHRcdFx0Y29udGVudDogWy4uLnByZXZpb3VzLmNvbnRlbnQsIC4uLm1lc3NhZ2UuY29udGVudF0sXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtZXNzYWdlcy5wdXNoKG1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbWVzc2FnZXM7XG5cdH1cblxuXHRwcml2YXRlIF90b0NoYXRNZXNzYWdlKGl0ZW06IElCeW9rTG1JbnB1dEl0ZW0pOiBJQ2hhdE1lc3NhZ2Uge1xuXHRcdHN3aXRjaCAoaXRlbS50eXBlKSB7XG5cdFx0XHRjYXNlICdtZXNzYWdlJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyb2xlOiB0aGlzLl90b0NoYXRSb2xlKGl0ZW0ucm9sZSksXG5cdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogaXRlbS5jb250ZW50Lm1hcChwYXJ0ID0+IHBhcnQudGV4dCkuam9pbignJykgfV0sXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlICdyZWFzb25pbmcnOiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cm9sZTogQ2hhdE1lc3NhZ2VSb2xlLkFzc2lzdGFudCxcblx0XHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3RoaW5raW5nJyxcblx0XHRcdFx0XHRcdHZhbHVlOiBpdGVtLnN1bW1hcnksXG5cdFx0XHRcdFx0XHRpZDogaXRlbS5pZCxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRcdC4uLml0ZW0ubWV0YWRhdGEsXG5cdFx0XHRcdFx0XHRcdC4uLihpdGVtLmVuY3J5cHRlZENvbnRlbnQgPyB0aGlzLl9kZWNvZGVSZWFzb25pbmdNZXRhZGF0YShpdGVtLmVuY3J5cHRlZENvbnRlbnQpIDoge30pLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2Z1bmN0aW9uX2NhbGwnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQsXG5cdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdHR5cGU6ICd0b29sX3VzZScsXG5cdFx0XHRcdFx0XHRuYW1lOiBpdGVtLm5hbWUsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBpdGVtLmNhbGxJZCxcblx0XHRcdFx0XHRcdHBhcmFtZXRlcnM6IHRoaXMuX3NhZmVQYXJzZUpzb24oaXRlbS5hcmd1bWVudHNKc29uKSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgJ2N1c3RvbV90b29sX2NhbGwnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQsXG5cdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdHR5cGU6ICd0b29sX3VzZScsXG5cdFx0XHRcdFx0XHRuYW1lOiBpdGVtLm5hbWUsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBpdGVtLmNhbGxJZCxcblx0XHRcdFx0XHRcdHBhcmFtZXRlcnM6IHsgaW5wdXQ6IGl0ZW0uaW5wdXQgfSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgJ2Z1bmN0aW9uX2NhbGxfb3V0cHV0Jzpcblx0XHRcdGNhc2UgJ2N1c3RvbV90b29sX2NhbGxfb3V0cHV0Jzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyb2xlOiBDaGF0TWVzc2FnZVJvbGUuVXNlcixcblx0XHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3Rvb2xfcmVzdWx0Jyxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGl0ZW0uY2FsbElkLFxuXHRcdFx0XHRcdFx0dmFsdWU6IFt7IHR5cGU6ICd0ZXh0JywgdmFsdWU6IGl0ZW0ub3V0cHV0IH1dLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FwcGVuZFRleHRPdXRwdXQob3V0cHV0OiBJQnlva0xtT3V0cHV0SXRlbVtdLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSBvdXRwdXQuYXQoLTEpO1xuXHRcdGlmIChwcmV2aW91cz8udHlwZSA9PT0gJ21lc3NhZ2UnKSB7XG5cdFx0XHRvdXRwdXRbb3V0cHV0Lmxlbmd0aCAtIDFdID0ge1xuXHRcdFx0XHQuLi5wcmV2aW91cyxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiBwcmV2aW91cy5jb250ZW50Lm1hcChwYXJ0ID0+IHBhcnQudGV4dCkuam9pbignJykgKyB2YWx1ZSB9XSxcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdG91dHB1dC5wdXNoKHsgdHlwZTogJ21lc3NhZ2UnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6IHZhbHVlIH1dIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FwcGVuZFJlYXNvbmluZ091dHB1dChvdXRwdXQ6IElCeW9rTG1PdXRwdXRJdGVtW10sIHBhcnQ6IEV4dHJhY3Q8SUNoYXRNZXNzYWdlUGFydCwgeyB0eXBlOiAndGhpbmtpbmcnIH0+KTogdm9pZCB7XG5cdFx0aWYgKHBhcnQubWV0YWRhdGE/LnZzY29kZV9yZWFzb25pbmdfZG9uZSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdW1tYXJ5ID0gQXJyYXkuaXNBcnJheShwYXJ0LnZhbHVlKSA/IHBhcnQudmFsdWUgOiBbcGFydC52YWx1ZV07XG5cdFx0Y29uc3QgZW5jcnlwdGVkQ29udGVudCA9IHRoaXMuX2VuY29kZVJlYXNvbmluZ01ldGFkYXRhKHBhcnQubWV0YWRhdGEpO1xuXHRcdGNvbnN0IHJlYXNvbmluZzogSUJ5b2tMbVJlYXNvbmluZ0l0ZW0gPSB7XG5cdFx0XHR0eXBlOiAncmVhc29uaW5nJyxcblx0XHRcdGlkOiBwYXJ0LmlkLFxuXHRcdFx0c3VtbWFyeSxcblx0XHRcdGVuY3J5cHRlZENvbnRlbnQsXG5cdFx0XHRtZXRhZGF0YTogcGFydC5tZXRhZGF0YSxcblx0XHR9O1xuXHRcdGNvbnN0IHByZXZpb3VzID0gb3V0cHV0LmF0KC0xKTtcblx0XHRpZiAocHJldmlvdXM/LnR5cGUgPT09ICdyZWFzb25pbmcnICYmIHByZXZpb3VzLmlkID09PSByZWFzb25pbmcuaWQpIHtcblx0XHRcdG91dHB1dFtvdXRwdXQubGVuZ3RoIC0gMV0gPSB7XG5cdFx0XHRcdC4uLnByZXZpb3VzLFxuXHRcdFx0XHRzdW1tYXJ5OiBbLi4ucHJldmlvdXMuc3VtbWFyeSwgLi4ucmVhc29uaW5nLnN1bW1hcnldLFxuXHRcdFx0XHRlbmNyeXB0ZWRDb250ZW50OiByZWFzb25pbmcuZW5jcnlwdGVkQ29udGVudCA/PyBwcmV2aW91cy5lbmNyeXB0ZWRDb250ZW50LFxuXHRcdFx0XHRtZXRhZGF0YTogcHJldmlvdXMubWV0YWRhdGEgfHwgcmVhc29uaW5nLm1ldGFkYXRhID8geyAuLi5wcmV2aW91cy5tZXRhZGF0YSwgLi4ucmVhc29uaW5nLm1ldGFkYXRhIH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvdXRwdXQucHVzaChyZWFzb25pbmcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2VuY29kZVJlYXNvbmluZ01ldGFkYXRhKG1ldGFkYXRhOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVuY3J5cHRlZENvbnRlbnQgPSB0aGlzLl9zdHJpbmdNZXRhZGF0YShtZXRhZGF0YSwgJ2VuY3J5cHRlZF9jb250ZW50JykgPz8gdGhpcy5fc3RyaW5nTWV0YWRhdGEobWV0YWRhdGEsICdlbmNyeXB0ZWQnKTtcblx0XHRpZiAoZW5jcnlwdGVkQ29udGVudCkge1xuXHRcdFx0cmV0dXJuIGVuY3J5cHRlZENvbnRlbnQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRpbnVhdGlvbk1ldGFkYXRhID0ge1xuXHRcdFx0Li4uKHRoaXMuX3N0cmluZ01ldGFkYXRhKG1ldGFkYXRhLCAnc2lnbmF0dXJlJykgPyB7IHNpZ25hdHVyZTogdGhpcy5fc3RyaW5nTWV0YWRhdGEobWV0YWRhdGEsICdzaWduYXR1cmUnKSB9IDoge30pLFxuXHRcdFx0Li4uKHRoaXMuX3N0cmluZ01ldGFkYXRhKG1ldGFkYXRhLCAnX2NvbXBsZXRlVGhpbmtpbmcnKSA/IHsgX2NvbXBsZXRlVGhpbmtpbmc6IHRoaXMuX3N0cmluZ01ldGFkYXRhKG1ldGFkYXRhLCAnX2NvbXBsZXRlVGhpbmtpbmcnKSB9IDoge30pLFxuXHRcdFx0Li4uKHRoaXMuX3N0cmluZ01ldGFkYXRhKG1ldGFkYXRhLCAncmVkYWN0ZWREYXRhJykgPyB7IHJlZGFjdGVkRGF0YTogdGhpcy5fc3RyaW5nTWV0YWRhdGEobWV0YWRhdGEsICdyZWRhY3RlZERhdGEnKSB9IDoge30pLFxuXHRcdH07XG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKGNvbnRpbnVhdGlvbk1ldGFkYXRhKS5sZW5ndGggPiAwXG5cdFx0XHQ/IGAke1JFQVNPTklOR19NRVRBREFUQV9QUkVGSVh9JHtKU09OLnN0cmluZ2lmeShjb250aW51YXRpb25NZXRhZGF0YSl9YFxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9kZWNvZGVSZWFzb25pbmdNZXRhZGF0YSh2YWx1ZTogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuXHRcdGlmICghdmFsdWUuc3RhcnRzV2l0aChSRUFTT05JTkdfTUVUQURBVEFfUFJFRklYKSkge1xuXHRcdFx0cmV0dXJuIHsgZW5jcnlwdGVkX2NvbnRlbnQ6IHZhbHVlIH07XG5cdFx0fVxuXHRcdGNvbnN0IG1ldGFkYXRhID0gSlNPTi5wYXJzZSh2YWx1ZS5zbGljZShSRUFTT05JTkdfTUVUQURBVEFfUFJFRklYLmxlbmd0aCkpO1xuXHRcdGlmICh0eXBlb2YgbWV0YWRhdGEgIT09ICdvYmplY3QnIHx8IG1ldGFkYXRhID09PSBudWxsIHx8IEFycmF5LmlzQXJyYXkobWV0YWRhdGEpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgQWdlbnQgSG9zdCBCWU9LIHJlYXNvbmluZyBtZXRhZGF0YScpO1xuXHRcdH1cblx0XHRyZXR1cm4gbWV0YWRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdH1cblxuXHRwcml2YXRlIF9jdXN0b21Ub29sSW5wdXQocGFyYW1ldGVyczogdW5rbm93bik6IHN0cmluZyB7XG5cdFx0aWYgKHR5cGVvZiBwYXJhbWV0ZXJzID09PSAnb2JqZWN0JyAmJiBwYXJhbWV0ZXJzICE9PSBudWxsKSB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IocGFyYW1ldGVycywgJ2lucHV0Jyk/LnZhbHVlO1xuXHRcdFx0aWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIGlucHV0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHlwZW9mIHBhcmFtZXRlcnMgPT09ICdzdHJpbmcnID8gcGFyYW1ldGVycyA6IEpTT04uc3RyaW5naWZ5KHBhcmFtZXRlcnMgPz8ge30pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVjb2RlU3RhdGVmdWxNYXJrZXIoZGF0YTogVlNCdWZmZXIsIGV4cGVjdGVkTW9kZWxJZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkZWNvZGVkID0gZGF0YS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHNlcGFyYXRvciA9IGRlY29kZWQuaW5kZXhPZignXFxcXCcpO1xuXHRcdGlmIChzZXBhcmF0b3IgPT09IC0xIHx8IGRlY29kZWQuc2xpY2UoMCwgc2VwYXJhdG9yKSAhPT0gZXhwZWN0ZWRNb2RlbElkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gZGVjb2RlZC5zbGljZShzZXBhcmF0b3IgKyAxKSB8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9kZWNvZGVVc2FnZShkYXRhOiBWU0J1ZmZlcik6IElCeW9rTG1DaGF0UmVzdWx0Wyd1c2FnZSddIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBKU09OLnBhcnNlKGRhdGEudG9TdHJpbmcoKSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRjb25zdCBvdXRwdXREZXRhaWxzID0gdHlwZW9mIHZhbHVlLmNvbXBsZXRpb25fdG9rZW5zX2RldGFpbHMgPT09ICdvYmplY3QnICYmIHZhbHVlLmNvbXBsZXRpb25fdG9rZW5zX2RldGFpbHMgIT09IG51bGxcblx0XHRcdFx0PyB2YWx1ZS5jb21wbGV0aW9uX3Rva2Vuc19kZXRhaWxzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+XG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW5wdXRUb2tlbnM6IHRoaXMuX251bWJlclByb3BlcnR5KHZhbHVlLCAncHJvbXB0X3Rva2VucycpLFxuXHRcdFx0XHRvdXRwdXRUb2tlbnM6IHRoaXMuX251bWJlclByb3BlcnR5KHZhbHVlLCAnY29tcGxldGlvbl90b2tlbnMnKSxcblx0XHRcdFx0cmVhc29uaW5nVG9rZW5zOiBvdXRwdXREZXRhaWxzID8gdGhpcy5fbnVtYmVyUHJvcGVydHkob3V0cHV0RGV0YWlscywgJ3JlYXNvbmluZ190b2tlbnMnKSA6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX251bWJlclByb3BlcnR5KHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwga2V5OiBzdHJpbmcpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHByb3BlcnR5ID0gdmFsdWVba2V5XTtcblx0XHRyZXR1cm4gdHlwZW9mIHByb3BlcnR5ID09PSAnbnVtYmVyJyA/IHByb3BlcnR5IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RyaW5nTWV0YWRhdGEobWV0YWRhdGE6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHVua25vd24+PiB8IHVuZGVmaW5lZCwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZhbHVlID0gbWV0YWRhdGE/LltrZXldO1xuXHRcdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF90b0NoYXRSb2xlKHJvbGU6IEV4dHJhY3Q8SUJ5b2tMbUlucHV0SXRlbSwgeyB0eXBlOiAnbWVzc2FnZScgfT5bJ3JvbGUnXSk6IENoYXRNZXNzYWdlUm9sZSB7XG5cdFx0c3dpdGNoIChyb2xlKSB7XG5cdFx0XHRjYXNlICdzeXN0ZW0nOlxuXHRcdFx0Y2FzZSAnZGV2ZWxvcGVyJzpcblx0XHRcdFx0cmV0dXJuIENoYXRNZXNzYWdlUm9sZS5TeXN0ZW07XG5cdFx0XHRjYXNlICdhc3Npc3RhbnQnOlxuXHRcdFx0XHRyZXR1cm4gQ2hhdE1lc3NhZ2VSb2xlLkFzc2lzdGFudDtcblx0XHRcdGNhc2UgJ3VzZXInOlxuXHRcdFx0XHRyZXR1cm4gQ2hhdE1lc3NhZ2VSb2xlLlVzZXI7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2FmZVBhcnNlSnNvbihqc29uOiBzdHJpbmcpOiB1bmtub3duIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2UoanNvbik7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBVXpCLFNBQVMsbUJBQW1CO0FBQzVCO0FBQUEsRUFDQztBQUFBLEVBSUE7QUFBQSxP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
