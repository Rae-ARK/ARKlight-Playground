import { renderAsPlaintext } from "../../../../../base/browser/markdownRenderer.js";
import { Emitter } from "../../../../../base/common/event.js";
import { isMarkdownString } from "../../../../../base/common/htmlContent.js";
import { stripIcons } from "../../../../../base/common/iconLabels.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { basename } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { AccessibleViewProviderId, AccessibleViewType } from "../../../../../platform/accessibility/browser/accessibleView.js";
import { IStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { AccessibilityVerbositySettingId } from "../../../accessibility/browser/accessibilityConfiguration.js";
import { migrateLegacyTerminalToolSpecificData } from "../../common/chat.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IChatToolInvocation, isLegacyChatTerminalToolInvocationData } from "../../common/chatService/chatService.js";
import { isResponseVM } from "../../common/model/chatViewModel.js";
import { isToolResultInputOutputDetails, isToolResultOutputDetails, toolContentToA11yString } from "../../common/tools/languageModelToolsService.js";
import { IChatWidgetService } from "../chat.js";
import { isLocation } from "../../../../../editor/common/languages.js";
class ChatResponseAccessibleView {
  constructor() {
    this.priority = 100;
    this.name = "panelChat";
    this.type = AccessibleViewType.View;
    this.when = ChatContextKeys.inChatSession;
  }
  getProvider(accessor) {
    const widgetService = accessor.get(IChatWidgetService);
    const storageService = accessor.get(IStorageService);
    const widget = widgetService.lastFocusedWidget;
    if (!widget) {
      return;
    }
    const chatInputFocused = widget.hasInputFocus();
    if (chatInputFocused) {
      widget.focusResponseItem();
    }
    const verifiedWidget = widget;
    let focusedItem = verifiedWidget.getFocus();
    if (!focusedItem || !isResponseVM(focusedItem)) {
      const responseItems = verifiedWidget.viewModel?.getItems().filter(isResponseVM);
      const lastResponse = responseItems?.at(-1);
      if (lastResponse) {
        focusedItem = lastResponse;
        verifiedWidget.focus(lastResponse);
      }
    }
    if (!focusedItem || !isResponseVM(focusedItem)) {
      return;
    }
    return new ChatResponseAccessibleProvider(verifiedWidget, focusedItem, chatInputFocused, storageService);
  }
}
const CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY = "chat.accessibleView.includeThinking";
const CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_DEFAULT = true;
function isThinkingContentIncludedInAccessibleView(storageService) {
  return storageService.getBoolean(CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, StorageScope.PROFILE, CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_DEFAULT);
}
function isOutputDetailsSerialized(obj) {
  return typeof obj === "object" && obj !== null && "output" in obj && typeof obj.output === "object" && obj.output?.type === "data" && typeof obj.output?.base64Data === "string";
}
function getToolSpecificDataDescription(toolSpecificData) {
  if (!toolSpecificData) {
    return "";
  }
  if (isLegacyChatTerminalToolInvocationData(toolSpecificData) || toolSpecificData.kind === "terminal") {
    const terminalData = migrateLegacyTerminalToolSpecificData(toolSpecificData);
    return terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
  }
  switch (toolSpecificData.kind) {
    case "subagent": {
      const parts = [];
      if (toolSpecificData.agentName) {
        parts.push(localize("subagentName", "Agent: {0}", toolSpecificData.agentName));
      }
      if (toolSpecificData.description) {
        parts.push(toolSpecificData.description);
      }
      if (toolSpecificData.prompt) {
        parts.push(localize("subagentPrompt", "Task: {0}", toolSpecificData.prompt));
      }
      return parts.join(". ") || "";
    }
    case "extensions":
      return toolSpecificData.extensions.length > 0 ? localize("extensionsList", "Extensions: {0}", toolSpecificData.extensions.join(", ")) : "";
    case "todoList": {
      const todos = toolSpecificData.todoList;
      if (todos.length === 0) {
        return "";
      }
      const todoDescriptions = todos.map(
        (t) => localize("todoItem", "{0} ({1})", t.title, t.status)
      );
      return localize("todoListCount", "{0} items: {1}", todos.length, todoDescriptions.join("; "));
    }
    case "pullRequest":
      return localize("pullRequestInfo", "PR: {0} by {1}", toolSpecificData.title, toolSpecificData.author);
    case "input":
      return typeof toolSpecificData.rawInput === "string" ? toolSpecificData.rawInput : JSON.stringify(toolSpecificData.rawInput);
    case "resources": {
      const values = toolSpecificData.values;
      if (values.length === 0) {
        return "";
      }
      const paths = values.map((v) => {
        if ("uri" in v && "range" in v) {
          return `${v.uri.fsPath || v.uri.path}:${v.range.startLineNumber}`;
        } else {
          return v.fsPath || v.path;
        }
      }).join(", ");
      return localize("resourcesList", "Resources: {0}", paths);
    }
    case "simpleToolInvocation": {
      const inputText = toolSpecificData.input;
      const outputText = toolSpecificData.output;
      return localize("simpleToolInvocation", "Input: {0}, Output: {1}", inputText, outputText);
    }
    case "modifiedFilesConfirmation": {
      if (toolSpecificData.modifiedFiles.length === 0) {
        return "";
      }
      return localize("modifiedFilesConfirmation", "Modified files: {0}", toolSpecificData.modifiedFiles.map((file) => {
        const revivedUri = URI.revive(file.uri);
        return revivedUri.fsPath || revivedUri.path;
      }).join(", "));
    }
    case "automationConfigured":
      return toolSpecificData.operation === "created" ? localize("automationConfigured.created", "Created an automation: {0}", toolSpecificData.automationName) : localize("automationConfigured.updated", "Edited an automation: {0}", toolSpecificData.automationName);
    default:
      return "";
  }
}
function getResultDetailsDescription(resultDetails) {
  if (!resultDetails) {
    return {};
  }
  if (Array.isArray(resultDetails)) {
    const files = resultDetails.map((ref) => {
      if (URI.isUri(ref)) {
        return ref.fsPath || ref.path;
      }
      return ref.uri.fsPath || ref.uri.path;
    });
    return { files };
  }
  if (isToolResultInputOutputDetails(resultDetails)) {
    return {
      input: resultDetails.input,
      isError: resultDetails.isError
    };
  }
  if (isOutputDetailsSerialized(resultDetails)) {
    return {
      input: localize("binaryOutput", "{0} data", resultDetails.output.mimeType)
    };
  }
  if (isToolResultOutputDetails(resultDetails)) {
    return {
      input: localize("binaryOutput", "{0} data", resultDetails.output.mimeType)
    };
  }
  return {};
}
function getToolInvocationA11yDescription(invocationMessage, pastTenseMessage, toolSpecificData, resultDetails, isComplete) {
  const parts = [];
  const message = isComplete && pastTenseMessage ? pastTenseMessage : invocationMessage;
  if (message) {
    parts.push(message);
  }
  const toolDataDesc = getToolSpecificDataDescription(toolSpecificData);
  if (toolDataDesc) {
    parts.push(toolDataDesc);
  }
  if (isComplete && resultDetails) {
    const details = getResultDetailsDescription(resultDetails);
    if (details.isError) {
      parts.unshift(localize("errored", "Errored"));
    }
    if (details.input && !toolDataDesc) {
      parts.push(localize("input", "Input: {0}", details.input));
    }
    if (details.files && details.files.length > 0) {
      parts.push(localize("files", "Files: {0}", details.files.join(", ")));
    }
  }
  return parts.join(". ");
}
class ChatResponseAccessibleProvider extends Disposable {
  constructor(_widget, item, _wasOpenedFromInput, _storageService) {
    super();
    this._widget = _widget;
    this._wasOpenedFromInput = _wasOpenedFromInput;
    this._storageService = _storageService;
    this._focusedItemDisposables = this._register(new DisposableStore());
    this._storageDisposables = this._register(new DisposableStore());
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this.id = AccessibleViewProviderId.PanelChat;
    this.verbositySettingKey = AccessibilityVerbositySettingId.Chat;
    this.options = { type: AccessibleViewType.View };
    this._storageDisposables.add(this._storageService.onDidChangeValue(StorageScope.PROFILE, CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, this._storageDisposables)(() => {
      this._onDidChangeContent.fire();
    }));
    this._setFocusedItem(item);
  }
  provideContent() {
    return this._getContent(this._focusedItem);
  }
  _setFocusedItem(item) {
    this._focusedItem = item;
    this._focusedItemDisposables.clear();
    if (isResponseVM(item)) {
      this._focusedItemDisposables.add(item.model.onDidChange(() => this._onDidChangeContent.fire()));
    }
  }
  _renderMessageAsPlaintext(message) {
    return typeof message === "string" ? message : stripIcons(renderAsPlaintext(message, { useLinkFormatter: true }));
  }
  _getContent(item) {
    const contentParts = [];
    if (!isResponseVM(item)) {
      return "";
    }
    if ("errorDetails" in item && item.errorDetails) {
      contentParts.push(item.errorDetails.message);
    }
    for (const part of item.response.value) {
      switch (part.kind) {
        case "thinking": {
          if (!this._shouldIncludeThinkingContent()) {
            break;
          }
          const thinkingValue = Array.isArray(part.value) ? part.value.join("") : part.value || "";
          const trimmed = thinkingValue.trim();
          if (trimmed) {
            contentParts.push(localize("thinkingContent", "Thinking: {0}", trimmed));
          }
          break;
        }
        case "markdownContent": {
          const text = renderAsPlaintext(part.content, { includeCodeBlocksFences: true, useLinkFormatter: true });
          if (text.trim()) {
            contentParts.push(text);
          }
          break;
        }
        case "inlineReference": {
          const ref = part.inlineReference;
          let text;
          if (URI.isUri(ref)) {
            const name = part.name || basename(ref);
            const path = ref.scheme === "file" ? ref.path : ref.toString(true);
            text = name !== path ? `${name} (${path})` : path;
          } else if (isLocation(ref)) {
            const name = part.name || basename(ref.uri);
            const path = ref.uri.scheme === "file" ? ref.uri.path : ref.uri.toString(true);
            text = `${name} (${path}:${ref.range.startLineNumber})`;
          } else {
            const path = ref.location.uri.scheme === "file" ? ref.location.uri.fsPath || ref.location.uri.path : ref.location.uri.toString(true);
            text = `${ref.name} (${path}:${ref.location.range.startLineNumber})`;
          }
          contentParts.push(text);
          break;
        }
        case "elicitation2":
        case "elicitationSerialized": {
          const title = part.title;
          let elicitationContent = "";
          if (typeof title === "string") {
            elicitationContent += `${title}
`;
          } else if (isMarkdownString(title)) {
            elicitationContent += renderAsPlaintext(title, { includeCodeBlocksFences: true }) + "\n";
          }
          const message = part.message;
          if (isMarkdownString(message)) {
            elicitationContent += renderAsPlaintext(message, { includeCodeBlocksFences: true });
          } else {
            elicitationContent += message;
          }
          if (elicitationContent.trim()) {
            contentParts.push(elicitationContent);
          }
          break;
        }
        case "toolInvocation": {
          const state = part.state.get();
          if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && state.confirmationMessages?.title) {
            const title = this._renderMessageAsPlaintext(state.confirmationMessages.title);
            const message = state.confirmationMessages.message ? this._renderMessageAsPlaintext(state.confirmationMessages.message) : "";
            const toolDataDesc = getToolSpecificDataDescription(part.toolSpecificData);
            let toolContent = title;
            if (toolDataDesc) {
              toolContent += `: ${toolDataDesc}`;
            }
            if (message) {
              toolContent += `
${message}`;
            }
            contentParts.push(toolContent);
          } else if (state.type === IChatToolInvocation.StateKind.WaitingForAuthentication) {
            contentParts.push(localize("toolAuthenticationA11yView", "MCP authentication required for {0} to continue {1}.", state.server.name, part.toolId));
          } else if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
            const postApprovalDetails = isToolResultInputOutputDetails(state.resultDetails) ? state.resultDetails.input : isToolResultOutputDetails(state.resultDetails) ? void 0 : toolContentToA11yString(state.contentForModel);
            contentParts.push(localize("toolPostApprovalA11yView", "Approve results of {0}? Result: ", part.toolId) + (postApprovalDetails ?? ""));
          } else {
            const resultDetails = IChatToolInvocation.resultDetails(part);
            const isComplete = IChatToolInvocation.isComplete(part);
            const description = getToolInvocationA11yDescription(
              this._renderMessageAsPlaintext(part.invocationMessage),
              part.pastTenseMessage ? this._renderMessageAsPlaintext(part.pastTenseMessage) : void 0,
              part.toolSpecificData,
              resultDetails,
              isComplete
            );
            if (description) {
              contentParts.push(description);
            }
          }
          break;
        }
        case "toolInvocationSerialized": {
          const description = getToolInvocationA11yDescription(
            this._renderMessageAsPlaintext(part.invocationMessage),
            part.pastTenseMessage ? this._renderMessageAsPlaintext(part.pastTenseMessage) : void 0,
            part.toolSpecificData,
            part.resultDetails,
            part.isComplete
          );
          if (description) {
            contentParts.push(description);
          }
          break;
        }
        case "autoModeResolution": {
          if (part.predictedLabel === "fallback") {
            contentParts.push(localize("autoModeResolutionA11yFallback", "Routed to {0}. Unable to resolve.", part.resolvedModelName));
          } else {
            const label = part.predictedLabel === "needs_reasoning" ? localize("autoModeResolutionA11yReasoning", "Reasoning") : localize("autoModeResolutionA11yNonReasoning", "Non-reasoning");
            contentParts.push(localize("autoModeResolutionA11y", "Routed to {0}. {1} - Confidence {2}%", part.resolvedModelName, label, (part.confidence * 100).toFixed(0)));
          }
          break;
        }
      }
    }
    return this._normalizeWhitespace(contentParts.join("\n"));
  }
  _normalizeWhitespace(content) {
    const lines = content.split(/\r?\n/);
    const normalized = [];
    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }
      normalized.push(line);
    }
    return normalized.join("\n");
  }
  _shouldIncludeThinkingContent() {
    return isThinkingContentIncludedInAccessibleView(this._storageService);
  }
  onClose() {
    this._widget.reveal(this._focusedItem);
    if (this._wasOpenedFromInput) {
      this._widget.focusInput();
    } else {
      this._widget.focus(this._focusedItem);
    }
  }
  provideNextContent() {
    const next = this._widget.getSibling(this._focusedItem, "next");
    if (next) {
      this._setFocusedItem(next);
      return this._getContent(next);
    }
    return;
  }
  providePreviousContent() {
    const previous = this._widget.getSibling(this._focusedItem, "previous");
    if (previous) {
      this._setFocusedItem(previous);
      return this._getContent(previous);
    }
    return;
  }
}
export {
  CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY,
  ChatResponseAccessibleView,
  getResultDetailsDescription,
  getToolInvocationA11yDescription,
  getToolSpecificDataDescription,
  isThinkingContentIncludedInAccessibleView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5L2NoYXRSZXNwb25zZUFjY2Vzc2libGVWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgaXNNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IHN0cmlwSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLCBBY2Nlc3NpYmxlVmlld1R5cGUsIElBY2Nlc3NpYmxlVmlld0NvbnRlbnRQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJsZVZpZXdJbXBsZW1lbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IG1pZ3JhdGVMZWdhY3lUZXJtaW5hbFRvb2xTcGVjaWZpY0RhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudEZlZWRiYWNrUmV2aWV3Q29uZmlybWF0aW9uRGF0YSwgSUNoYXRBdXRvbWF0aW9uQ29uZmlndXJhdGlvbkRhdGEsIElDaGF0QXV0b21hdGlvbkNvbmZpZ3VyZWREYXRhLCBJQ2hhdEV4dGVuc2lvbnNDb250ZW50LCBJQ2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25EYXRhLCBJQ2hhdFB1bGxSZXF1ZXN0Q29udGVudCwgSUNoYXRTZWFyY2hUb29sSW52b2NhdGlvbkRhdGEsIElDaGF0U2Vzc2lvbkNyZWF0ZWREYXRhLCBJQ2hhdFNpbXBsZVRvb2xJbnZvY2F0aW9uRGF0YSwgSUNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSwgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgSUNoYXRUb2RvTGlzdENvbnRlbnQsIElDaGF0VG9vbElucHV0SW52b2NhdGlvbkRhdGEsIElDaGF0VG9vbEludm9jYXRpb24sIElDaGF0VG9vbFJlc291cmNlc0ludm9jYXRpb25EYXRhLCBJTGVnYWN5Q2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLCBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkLCBpc0xlZ2FjeUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscywgSVRvb2xSZXN1bHRPdXRwdXREZXRhaWxzLCBpc1Rvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMsIGlzVG9vbFJlc3VsdE91dHB1dERldGFpbHMsIHRvb2xDb250ZW50VG9BMTF5U3RyaW5nIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtLCBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBpc0xvY2F0aW9uLCBMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZUFjY2Vzc2libGVWaWV3IGltcGxlbWVudHMgSUFjY2Vzc2libGVWaWV3SW1wbGVtZW50YXRpb24ge1xuXHRyZWFkb25seSBwcmlvcml0eSA9IDEwMDtcblx0cmVhZG9ubHkgbmFtZSA9ICdwYW5lbENoYXQnO1xuXHRyZWFkb25seSB0eXBlID0gQWNjZXNzaWJsZVZpZXdUeXBlLlZpZXc7XG5cdHJlYWRvbmx5IHdoZW4gPSBDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbjtcblx0Z2V0UHJvdmlkZXIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRJbnB1dEZvY3VzZWQgPSB3aWRnZXQuaGFzSW5wdXRGb2N1cygpO1xuXHRcdGlmIChjaGF0SW5wdXRGb2N1c2VkKSB7XG5cdFx0XHR3aWRnZXQuZm9jdXNSZXNwb25zZUl0ZW0oKTtcblx0XHR9XG5cblx0XHRjb25zdCB2ZXJpZmllZFdpZGdldDogSUNoYXRXaWRnZXQgPSB3aWRnZXQ7XG5cdFx0bGV0IGZvY3VzZWRJdGVtID0gdmVyaWZpZWRXaWRnZXQuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoIWZvY3VzZWRJdGVtIHx8ICFpc1Jlc3BvbnNlVk0oZm9jdXNlZEl0ZW0pKSB7XG5cdFx0XHRjb25zdCByZXNwb25zZUl0ZW1zID0gdmVyaWZpZWRXaWRnZXQudmlld01vZGVsPy5nZXRJdGVtcygpLmZpbHRlcihpc1Jlc3BvbnNlVk0pO1xuXHRcdFx0Y29uc3QgbGFzdFJlc3BvbnNlID0gcmVzcG9uc2VJdGVtcz8uYXQoLTEpO1xuXHRcdFx0aWYgKGxhc3RSZXNwb25zZSkge1xuXHRcdFx0XHRmb2N1c2VkSXRlbSA9IGxhc3RSZXNwb25zZTtcblx0XHRcdFx0dmVyaWZpZWRXaWRnZXQuZm9jdXMobGFzdFJlc3BvbnNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWZvY3VzZWRJdGVtIHx8ICFpc1Jlc3BvbnNlVk0oZm9jdXNlZEl0ZW0pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBDaGF0UmVzcG9uc2VBY2Nlc3NpYmxlUHJvdmlkZXIodmVyaWZpZWRXaWRnZXQsIGZvY3VzZWRJdGVtLCBjaGF0SW5wdXRGb2N1c2VkLCBzdG9yYWdlU2VydmljZSk7XG5cdH1cbn1cblxudHlwZSBUb29sU3BlY2lmaWNEYXRhID0gSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB8IElMZWdhY3lDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfCBJQ2hhdFRvb2xJbnB1dEludm9jYXRpb25EYXRhIHwgSUNoYXRFeHRlbnNpb25zQ29udGVudCB8IElDaGF0UHVsbFJlcXVlc3RDb250ZW50IHwgSUNoYXRUb2RvTGlzdENvbnRlbnQgfCBJQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhIHwgSUNoYXRTaW1wbGVUb29sSW52b2NhdGlvbkRhdGEgfCBJQ2hhdFNlYXJjaFRvb2xJbnZvY2F0aW9uRGF0YSB8IElDaGF0VG9vbFJlc291cmNlc0ludm9jYXRpb25EYXRhIHwgSUNoYXRNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uRGF0YSB8IElDaGF0QWdlbnRGZWVkYmFja1Jldmlld0NvbmZpcm1hdGlvbkRhdGEgfCBJQ2hhdFNlc3Npb25DcmVhdGVkRGF0YSB8IElDaGF0QXV0b21hdGlvbkNvbmZpZ3VyYXRpb25EYXRhIHwgSUNoYXRBdXRvbWF0aW9uQ29uZmlndXJlZERhdGE7XG50eXBlIFJlc3VsdERldGFpbHMgPSBBcnJheTxVUkkgfCBMb2NhdGlvbj4gfCBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyB8IElUb29sUmVzdWx0T3V0cHV0RGV0YWlscyB8IElUb29sUmVzdWx0T3V0cHV0RGV0YWlsc1NlcmlhbGl6ZWQ7XG5cbmV4cG9ydCBjb25zdCBDSEFUX0FDQ0VTU0lCTEVfVklFV19JTkNMVURFX1RISU5LSU5HX1NUT1JBR0VfS0VZID0gJ2NoYXQuYWNjZXNzaWJsZVZpZXcuaW5jbHVkZVRoaW5raW5nJztcbmNvbnN0IENIQVRfQUNDRVNTSUJMRV9WSUVXX0lOQ0xVREVfVEhJTktJTkdfREVGQVVMVCA9IHRydWU7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1RoaW5raW5nQ29udGVudEluY2x1ZGVkSW5BY2Nlc3NpYmxlVmlldyhzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKTogYm9vbGVhbiB7XG5cdHJldHVybiBzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKENIQVRfQUNDRVNTSUJMRV9WSUVXX0lOQ0xVREVfVEhJTktJTkdfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBDSEFUX0FDQ0VTU0lCTEVfVklFV19JTkNMVURFX1RISU5LSU5HX0RFRkFVTFQpO1xufVxuXG5mdW5jdGlvbiBpc091dHB1dERldGFpbHNTZXJpYWxpemVkKG9iajogdW5rbm93bik6IG9iaiBpcyBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkIHtcblx0cmV0dXJuIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIG9iaiAhPT0gbnVsbCAmJiAnb3V0cHV0JyBpbiBvYmogJiZcblx0XHR0eXBlb2YgKG9iaiBhcyBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkKS5vdXRwdXQgPT09ICdvYmplY3QnICYmXG5cdFx0KG9iaiBhcyBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkKS5vdXRwdXQ/LnR5cGUgPT09ICdkYXRhJyAmJlxuXHRcdHR5cGVvZiAob2JqIGFzIElUb29sUmVzdWx0T3V0cHV0RGV0YWlsc1NlcmlhbGl6ZWQpLm91dHB1dD8uYmFzZTY0RGF0YSA9PT0gJ3N0cmluZyc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24odG9vbFNwZWNpZmljRGF0YTogVG9vbFNwZWNpZmljRGF0YSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGlmICghdG9vbFNwZWNpZmljRGF0YSkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdGlmIChpc0xlZ2FjeUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSh0b29sU3BlY2lmaWNEYXRhKSB8fCB0b29sU3BlY2lmaWNEYXRhLmtpbmQgPT09ICd0ZXJtaW5hbCcpIHtcblx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSBtaWdyYXRlTGVnYWN5VGVybWluYWxUb29sU3BlY2lmaWNEYXRhKHRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdHJldHVybiB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUudXNlckVkaXRlZCA/PyB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUudG9vbEVkaXRlZCA/PyB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUub3JpZ2luYWw7XG5cdH1cblxuXHRzd2l0Y2ggKHRvb2xTcGVjaWZpY0RhdGEua2luZCkge1xuXHRcdGNhc2UgJ3N1YmFnZW50Jzoge1xuXHRcdFx0Y29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRpZiAodG9vbFNwZWNpZmljRGF0YS5hZ2VudE5hbWUpIHtcblx0XHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgnc3ViYWdlbnROYW1lJywgXCJBZ2VudDogezB9XCIsIHRvb2xTcGVjaWZpY0RhdGEuYWdlbnROYW1lKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodG9vbFNwZWNpZmljRGF0YS5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKHRvb2xTcGVjaWZpY0RhdGEuZGVzY3JpcHRpb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRvb2xTcGVjaWZpY0RhdGEucHJvbXB0KSB7XG5cdFx0XHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ3N1YmFnZW50UHJvbXB0JywgXCJUYXNrOiB7MH1cIiwgdG9vbFNwZWNpZmljRGF0YS5wcm9tcHQpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYXJ0cy5qb2luKCcuICcpIHx8ICcnO1xuXHRcdH1cblx0XHRjYXNlICdleHRlbnNpb25zJzpcblx0XHRcdHJldHVybiB0b29sU3BlY2lmaWNEYXRhLmV4dGVuc2lvbnMubGVuZ3RoID4gMFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdleHRlbnNpb25zTGlzdCcsIFwiRXh0ZW5zaW9uczogezB9XCIsIHRvb2xTcGVjaWZpY0RhdGEuZXh0ZW5zaW9ucy5qb2luKCcsICcpKVxuXHRcdFx0XHQ6ICcnO1xuXHRcdGNhc2UgJ3RvZG9MaXN0Jzoge1xuXHRcdFx0Y29uc3QgdG9kb3MgPSB0b29sU3BlY2lmaWNEYXRhLnRvZG9MaXN0O1xuXHRcdFx0aWYgKHRvZG9zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0b2RvRGVzY3JpcHRpb25zID0gdG9kb3MubWFwKHQgPT5cblx0XHRcdFx0bG9jYWxpemUoJ3RvZG9JdGVtJywgXCJ7MH0gKHsxfSlcIiwgdC50aXRsZSwgdC5zdGF0dXMpXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b2RvTGlzdENvdW50JywgXCJ7MH0gaXRlbXM6IHsxfVwiLCB0b2Rvcy5sZW5ndGgsIHRvZG9EZXNjcmlwdGlvbnMuam9pbignOyAnKSk7XG5cdFx0fVxuXHRcdGNhc2UgJ3B1bGxSZXF1ZXN0Jzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHVsbFJlcXVlc3RJbmZvJywgXCJQUjogezB9IGJ5IHsxfVwiLCB0b29sU3BlY2lmaWNEYXRhLnRpdGxlLCB0b29sU3BlY2lmaWNEYXRhLmF1dGhvcik7XG5cdFx0Y2FzZSAnaW5wdXQnOlxuXHRcdFx0cmV0dXJuIHR5cGVvZiB0b29sU3BlY2lmaWNEYXRhLnJhd0lucHV0ID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQ/IHRvb2xTcGVjaWZpY0RhdGEucmF3SW5wdXRcblx0XHRcdFx0OiBKU09OLnN0cmluZ2lmeSh0b29sU3BlY2lmaWNEYXRhLnJhd0lucHV0KTtcblx0XHRjYXNlICdyZXNvdXJjZXMnOiB7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSB0b29sU3BlY2lmaWNEYXRhLnZhbHVlcztcblx0XHRcdGlmICh2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiAnJztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhdGhzID0gdmFsdWVzLm1hcCh2ID0+IHtcblx0XHRcdFx0aWYgKCd1cmknIGluIHYgJiYgJ3JhbmdlJyBpbiB2KSB7XG5cdFx0XHRcdFx0Ly8gTG9jYXRpb25cblx0XHRcdFx0XHRyZXR1cm4gYCR7di51cmkuZnNQYXRoIHx8IHYudXJpLnBhdGh9OiR7di5yYW5nZS5zdGFydExpbmVOdW1iZXJ9YDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBVUklcblx0XHRcdFx0XHRyZXR1cm4gdi5mc1BhdGggfHwgdi5wYXRoO1xuXHRcdFx0XHR9XG5cdFx0XHR9KS5qb2luKCcsICcpO1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdyZXNvdXJjZXNMaXN0JywgXCJSZXNvdXJjZXM6IHswfVwiLCBwYXRocyk7XG5cdFx0fVxuXHRcdGNhc2UgJ3NpbXBsZVRvb2xJbnZvY2F0aW9uJzoge1xuXHRcdFx0Y29uc3QgaW5wdXRUZXh0ID0gdG9vbFNwZWNpZmljRGF0YS5pbnB1dDtcblx0XHRcdGNvbnN0IG91dHB1dFRleHQgPSB0b29sU3BlY2lmaWNEYXRhLm91dHB1dDtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2ltcGxlVG9vbEludm9jYXRpb24nLCBcIklucHV0OiB7MH0sIE91dHB1dDogezF9XCIsIGlucHV0VGV4dCwgb3V0cHV0VGV4dCk7XG5cdFx0fVxuXHRcdGNhc2UgJ21vZGlmaWVkRmlsZXNDb25maXJtYXRpb24nOiB7XG5cdFx0XHRpZiAodG9vbFNwZWNpZmljRGF0YS5tb2RpZmllZEZpbGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbicsIFwiTW9kaWZpZWQgZmlsZXM6IHswfVwiLCB0b29sU3BlY2lmaWNEYXRhLm1vZGlmaWVkRmlsZXMubWFwKGZpbGUgPT4ge1xuXHRcdFx0XHRjb25zdCByZXZpdmVkVXJpID0gVVJJLnJldml2ZShmaWxlLnVyaSk7XG5cdFx0XHRcdHJldHVybiByZXZpdmVkVXJpLmZzUGF0aCB8fCByZXZpdmVkVXJpLnBhdGg7XG5cdFx0XHR9KS5qb2luKCcsICcpKTtcblx0XHR9XG5cdFx0Y2FzZSAnYXV0b21hdGlvbkNvbmZpZ3VyZWQnOlxuXHRcdFx0cmV0dXJuIHRvb2xTcGVjaWZpY0RhdGEub3BlcmF0aW9uID09PSAnY3JlYXRlZCdcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYXV0b21hdGlvbkNvbmZpZ3VyZWQuY3JlYXRlZCcsIFwiQ3JlYXRlZCBhbiBhdXRvbWF0aW9uOiB7MH1cIiwgdG9vbFNwZWNpZmljRGF0YS5hdXRvbWF0aW9uTmFtZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYXV0b21hdGlvbkNvbmZpZ3VyZWQudXBkYXRlZCcsIFwiRWRpdGVkIGFuIGF1dG9tYXRpb246IHswfVwiLCB0b29sU3BlY2lmaWNEYXRhLmF1dG9tYXRpb25OYW1lKTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuICcnO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXN1bHREZXRhaWxzRGVzY3JpcHRpb24ocmVzdWx0RGV0YWlsczogUmVzdWx0RGV0YWlscyB8IHVuZGVmaW5lZCk6IHsgaW5wdXQ/OiBzdHJpbmc7IGZpbGVzPzogc3RyaW5nW107IGlzRXJyb3I/OiBib29sZWFuIH0ge1xuXHRpZiAoIXJlc3VsdERldGFpbHMpIHtcblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRpZiAoQXJyYXkuaXNBcnJheShyZXN1bHREZXRhaWxzKSkge1xuXHRcdGNvbnN0IGZpbGVzID0gcmVzdWx0RGV0YWlscy5tYXAocmVmID0+IHtcblx0XHRcdGlmIChVUkkuaXNVcmkocmVmKSkge1xuXHRcdFx0XHRyZXR1cm4gcmVmLmZzUGF0aCB8fCByZWYucGF0aDtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZWYudXJpLmZzUGF0aCB8fCByZWYudXJpLnBhdGg7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHsgZmlsZXMgfTtcblx0fVxuXG5cdGlmIChpc1Rvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMocmVzdWx0RGV0YWlscykpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5wdXQ6IHJlc3VsdERldGFpbHMuaW5wdXQsXG5cdFx0XHRpc0Vycm9yOiByZXN1bHREZXRhaWxzLmlzRXJyb3Jcblx0XHR9O1xuXHR9XG5cblx0aWYgKGlzT3V0cHV0RGV0YWlsc1NlcmlhbGl6ZWQocmVzdWx0RGV0YWlscykpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5wdXQ6IGxvY2FsaXplKCdiaW5hcnlPdXRwdXQnLCBcInswfSBkYXRhXCIsIHJlc3VsdERldGFpbHMub3V0cHV0Lm1pbWVUeXBlKVxuXHRcdH07XG5cdH1cblxuXHRpZiAoaXNUb29sUmVzdWx0T3V0cHV0RGV0YWlscyhyZXN1bHREZXRhaWxzKSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpbnB1dDogbG9jYWxpemUoJ2JpbmFyeU91dHB1dCcsIFwiezB9IGRhdGFcIiwgcmVzdWx0RGV0YWlscy5vdXRwdXQubWltZVR5cGUpXG5cdFx0fTtcblx0fVxuXG5cdHJldHVybiB7fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRvb2xJbnZvY2F0aW9uQTExeURlc2NyaXB0aW9uKFxuXHRpbnZvY2F0aW9uTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRwYXN0VGVuc2VNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdHRvb2xTcGVjaWZpY0RhdGE6IFRvb2xTcGVjaWZpY0RhdGEgfCB1bmRlZmluZWQsXG5cdHJlc3VsdERldGFpbHM6IFJlc3VsdERldGFpbHMgfCB1bmRlZmluZWQsXG5cdGlzQ29tcGxldGU6IGJvb2xlYW5cbik6IHN0cmluZyB7XG5cdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdGNvbnN0IG1lc3NhZ2UgPSBpc0NvbXBsZXRlICYmIHBhc3RUZW5zZU1lc3NhZ2UgPyBwYXN0VGVuc2VNZXNzYWdlIDogaW52b2NhdGlvbk1lc3NhZ2U7XG5cdGlmIChtZXNzYWdlKSB7XG5cdFx0cGFydHMucHVzaChtZXNzYWdlKTtcblx0fVxuXG5cdGNvbnN0IHRvb2xEYXRhRGVzYyA9IGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbih0b29sU3BlY2lmaWNEYXRhKTtcblx0aWYgKHRvb2xEYXRhRGVzYykge1xuXHRcdHBhcnRzLnB1c2godG9vbERhdGFEZXNjKTtcblx0fVxuXG5cdGlmIChpc0NvbXBsZXRlICYmIHJlc3VsdERldGFpbHMpIHtcblx0XHRjb25zdCBkZXRhaWxzID0gZ2V0UmVzdWx0RGV0YWlsc0Rlc2NyaXB0aW9uKHJlc3VsdERldGFpbHMpO1xuXHRcdGlmIChkZXRhaWxzLmlzRXJyb3IpIHtcblx0XHRcdHBhcnRzLnVuc2hpZnQobG9jYWxpemUoJ2Vycm9yZWQnLCBcIkVycm9yZWRcIikpO1xuXHRcdH1cblx0XHRpZiAoZGV0YWlscy5pbnB1dCAmJiAhdG9vbERhdGFEZXNjKSB7XG5cdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCdpbnB1dCcsIFwiSW5wdXQ6IHswfVwiLCBkZXRhaWxzLmlucHV0KSk7XG5cdFx0fVxuXHRcdGlmIChkZXRhaWxzLmZpbGVzICYmIGRldGFpbHMuZmlsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgnZmlsZXMnLCBcIkZpbGVzOiB7MH1cIiwgZGV0YWlscy5maWxlcy5qb2luKCcsICcpKSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHBhcnRzLmpvaW4oJy4gJyk7XG59XG5cbmNsYXNzIENoYXRSZXNwb25zZUFjY2Vzc2libGVQcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWNjZXNzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIge1xuXHRwcml2YXRlIF9mb2N1c2VkSXRlbSE6IENoYXRUcmVlSXRlbTtcblx0cHJpdmF0ZSByZWFkb25seSBfZm9jdXNlZEl0ZW1EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmV2ZW50O1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXQ6IElDaGF0V2lkZ2V0LFxuXHRcdGl0ZW06IENoYXRUcmVlSXRlbSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93YXNPcGVuZWRGcm9tSW5wdXQ6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3N0b3JhZ2VEaXNwb3NhYmxlcy5hZGQodGhpcy5fc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuUFJPRklMRSwgQ0hBVF9BQ0NFU1NJQkxFX1ZJRVdfSU5DTFVERV9USElOS0lOR19TVE9SQUdFX0tFWSwgdGhpcy5fc3RvcmFnZURpc3Bvc2FibGVzKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9zZXRGb2N1c2VkSXRlbShpdGVtKTtcblx0fVxuXG5cdHJlYWRvbmx5IGlkID0gQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlBhbmVsQ2hhdDtcblx0cmVhZG9ubHkgdmVyYm9zaXR5U2V0dGluZ0tleSA9IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuQ2hhdDtcblx0cmVhZG9ubHkgb3B0aW9ucyA9IHsgdHlwZTogQWNjZXNzaWJsZVZpZXdUeXBlLlZpZXcgfTtcblxuXHRwcm92aWRlQ29udGVudCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9nZXRDb250ZW50KHRoaXMuX2ZvY3VzZWRJdGVtKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEZvY3VzZWRJdGVtKGl0ZW06IENoYXRUcmVlSXRlbSk6IHZvaWQge1xuXHRcdHRoaXMuX2ZvY3VzZWRJdGVtID0gaXRlbTtcblx0XHR0aGlzLl9mb2N1c2VkSXRlbURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShpdGVtKSkge1xuXHRcdFx0dGhpcy5fZm9jdXNlZEl0ZW1EaXNwb3NhYmxlcy5hZGQoaXRlbS5tb2RlbC5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSgpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyTWVzc2FnZUFzUGxhaW50ZXh0KG1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJyA/IG1lc3NhZ2UgOiBzdHJpcEljb25zKHJlbmRlckFzUGxhaW50ZXh0KG1lc3NhZ2UsIHsgdXNlTGlua0Zvcm1hdHRlcjogdHJ1ZSB9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb250ZW50KGl0ZW06IENoYXRUcmVlSXRlbSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY29udGVudFBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0aWYgKCFpc1Jlc3BvbnNlVk0oaXRlbSkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRpZiAoJ2Vycm9yRGV0YWlscycgaW4gaXRlbSAmJiBpdGVtLmVycm9yRGV0YWlscykge1xuXHRcdFx0Y29udGVudFBhcnRzLnB1c2goaXRlbS5lcnJvckRldGFpbHMubWVzc2FnZSk7XG5cdFx0fVxuXG5cdFx0Ly8gUHJvY2VzcyBhbGwgcGFydHMgaW4gb3JkZXIgdG8gbWFpbnRhaW4gdGhlIG5hdHVyYWwgZmxvd1xuXHRcdGZvciAoY29uc3QgcGFydCBvZiBpdGVtLnJlc3BvbnNlLnZhbHVlKSB7XG5cdFx0XHRzd2l0Y2ggKHBhcnQua2luZCkge1xuXHRcdFx0XHRjYXNlICd0aGlua2luZyc6IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX3Nob3VsZEluY2x1ZGVUaGlua2luZ0NvbnRlbnQoKSkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHRoaW5raW5nVmFsdWUgPSBBcnJheS5pc0FycmF5KHBhcnQudmFsdWUpID8gcGFydC52YWx1ZS5qb2luKCcnKSA6IChwYXJ0LnZhbHVlIHx8ICcnKTtcblx0XHRcdFx0XHRjb25zdCB0cmltbWVkID0gdGhpbmtpbmdWYWx1ZS50cmltKCk7XG5cdFx0XHRcdFx0aWYgKHRyaW1tZWQpIHtcblx0XHRcdFx0XHRcdGNvbnRlbnRQYXJ0cy5wdXNoKGxvY2FsaXplKCd0aGlua2luZ0NvbnRlbnQnLCBcIlRoaW5raW5nOiB7MH1cIiwgdHJpbW1lZCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdtYXJrZG93bkNvbnRlbnQnOiB7XG5cdFx0XHRcdFx0Y29uc3QgdGV4dCA9IHJlbmRlckFzUGxhaW50ZXh0KHBhcnQuY29udGVudCwgeyBpbmNsdWRlQ29kZUJsb2Nrc0ZlbmNlczogdHJ1ZSwgdXNlTGlua0Zvcm1hdHRlcjogdHJ1ZSB9KTtcblx0XHRcdFx0XHRpZiAodGV4dC50cmltKCkpIHtcblx0XHRcdFx0XHRcdGNvbnRlbnRQYXJ0cy5wdXNoKHRleHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdpbmxpbmVSZWZlcmVuY2UnOiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVmID0gcGFydC5pbmxpbmVSZWZlcmVuY2U7XG5cdFx0XHRcdFx0bGV0IHRleHQ6IHN0cmluZztcblx0XHRcdFx0XHRpZiAoVVJJLmlzVXJpKHJlZikpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG5hbWUgPSBwYXJ0Lm5hbWUgfHwgYmFzZW5hbWUocmVmKTtcblx0XHRcdFx0XHRcdGNvbnN0IHBhdGggPSByZWYuc2NoZW1lID09PSAnZmlsZScgPyByZWYucGF0aCA6IHJlZi50b1N0cmluZyh0cnVlKTtcblx0XHRcdFx0XHRcdHRleHQgPSBuYW1lICE9PSBwYXRoID8gYCR7bmFtZX0gKCR7cGF0aH0pYCA6IHBhdGg7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpc0xvY2F0aW9uKHJlZikpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG5hbWUgPSBwYXJ0Lm5hbWUgfHwgYmFzZW5hbWUocmVmLnVyaSk7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXRoID0gcmVmLnVyaS5zY2hlbWUgPT09ICdmaWxlJyA/IHJlZi51cmkucGF0aCA6IHJlZi51cmkudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRcdFx0XHR0ZXh0ID0gYCR7bmFtZX0gKCR7cGF0aH06JHtyZWYucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfSlgO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBJV29ya3NwYWNlU3ltYm9sXG5cdFx0XHRcdFx0XHRjb25zdCBwYXRoID0gcmVmLmxvY2F0aW9uLnVyaS5zY2hlbWUgPT09ICdmaWxlJyA/IChyZWYubG9jYXRpb24udXJpLmZzUGF0aCB8fCByZWYubG9jYXRpb24udXJpLnBhdGgpIDogcmVmLmxvY2F0aW9uLnVyaS50b1N0cmluZyh0cnVlKTtcblx0XHRcdFx0XHRcdHRleHQgPSBgJHtyZWYubmFtZX0gKCR7cGF0aH06JHtyZWYubG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfSlgO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250ZW50UGFydHMucHVzaCh0ZXh0KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdlbGljaXRhdGlvbjInOlxuXHRcdFx0XHRjYXNlICdlbGljaXRhdGlvblNlcmlhbGl6ZWQnOiB7XG5cdFx0XHRcdFx0Y29uc3QgdGl0bGUgPSBwYXJ0LnRpdGxlO1xuXHRcdFx0XHRcdGxldCBlbGljaXRhdGlvbkNvbnRlbnQgPSAnJztcblx0XHRcdFx0XHRpZiAodHlwZW9mIHRpdGxlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0ZWxpY2l0YXRpb25Db250ZW50ICs9IGAke3RpdGxlfVxcbmA7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpc01hcmtkb3duU3RyaW5nKHRpdGxlKSkge1xuXHRcdFx0XHRcdFx0ZWxpY2l0YXRpb25Db250ZW50ICs9IHJlbmRlckFzUGxhaW50ZXh0KHRpdGxlLCB7IGluY2x1ZGVDb2RlQmxvY2tzRmVuY2VzOiB0cnVlIH0pICsgJ1xcbic7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBwYXJ0Lm1lc3NhZ2U7XG5cdFx0XHRcdFx0aWYgKGlzTWFya2Rvd25TdHJpbmcobWVzc2FnZSkpIHtcblx0XHRcdFx0XHRcdGVsaWNpdGF0aW9uQ29udGVudCArPSByZW5kZXJBc1BsYWludGV4dChtZXNzYWdlLCB7IGluY2x1ZGVDb2RlQmxvY2tzRmVuY2VzOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRlbGljaXRhdGlvbkNvbnRlbnQgKz0gbWVzc2FnZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGVsaWNpdGF0aW9uQ29udGVudC50cmltKCkpIHtcblx0XHRcdFx0XHRcdGNvbnRlbnRQYXJ0cy5wdXNoKGVsaWNpdGF0aW9uQ29udGVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ3Rvb2xJbnZvY2F0aW9uJzoge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gcGFydC5zdGF0ZS5nZXQoKTtcblx0XHRcdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiAmJiBzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRpdGxlID0gdGhpcy5fcmVuZGVyTWVzc2FnZUFzUGxhaW50ZXh0KHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLnRpdGxlKTtcblx0XHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcy5tZXNzYWdlID8gdGhpcy5fcmVuZGVyTWVzc2FnZUFzUGxhaW50ZXh0KHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLm1lc3NhZ2UpIDogJyc7XG5cdFx0XHRcdFx0XHRjb25zdCB0b29sRGF0YURlc2MgPSBnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24ocGFydC50b29sU3BlY2lmaWNEYXRhKTtcblx0XHRcdFx0XHRcdGxldCB0b29sQ29udGVudCA9IHRpdGxlO1xuXHRcdFx0XHRcdFx0aWYgKHRvb2xEYXRhRGVzYykge1xuXHRcdFx0XHRcdFx0XHR0b29sQ29udGVudCArPSBgOiAke3Rvb2xEYXRhRGVzY31gO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdFx0dG9vbENvbnRlbnQgKz0gYFxcbiR7bWVzc2FnZX1gO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29udGVudFBhcnRzLnB1c2godG9vbENvbnRlbnQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uKSB7XG5cdFx0XHRcdFx0XHRjb250ZW50UGFydHMucHVzaChsb2NhbGl6ZSgndG9vbEF1dGhlbnRpY2F0aW9uQTExeVZpZXcnLCBcIk1DUCBhdXRoZW50aWNhdGlvbiByZXF1aXJlZCBmb3IgezB9IHRvIGNvbnRpbnVlIHsxfS5cIiwgc3RhdGUuc2VydmVyLm5hbWUsIHBhcnQudG9vbElkKSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwb3N0QXBwcm92YWxEZXRhaWxzID0gaXNUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzKHN0YXRlLnJlc3VsdERldGFpbHMpXG5cdFx0XHRcdFx0XHRcdD8gc3RhdGUucmVzdWx0RGV0YWlscy5pbnB1dFxuXHRcdFx0XHRcdFx0XHQ6IGlzVG9vbFJlc3VsdE91dHB1dERldGFpbHMoc3RhdGUucmVzdWx0RGV0YWlscylcblx0XHRcdFx0XHRcdFx0XHQ/IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0XHRcdDogdG9vbENvbnRlbnRUb0ExMXlTdHJpbmcoc3RhdGUuY29udGVudEZvck1vZGVsKTtcblx0XHRcdFx0XHRcdGNvbnRlbnRQYXJ0cy5wdXNoKGxvY2FsaXplKCd0b29sUG9zdEFwcHJvdmFsQTExeVZpZXcnLCBcIkFwcHJvdmUgcmVzdWx0cyBvZiB7MH0/IFJlc3VsdDogXCIsIHBhcnQudG9vbElkKSArIChwb3N0QXBwcm92YWxEZXRhaWxzID8/ICcnKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdERldGFpbHMgPSBJQ2hhdFRvb2xJbnZvY2F0aW9uLnJlc3VsdERldGFpbHMocGFydCk7XG5cdFx0XHRcdFx0XHRjb25zdCBpc0NvbXBsZXRlID0gSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHBhcnQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBnZXRUb29sSW52b2NhdGlvbkExMXlEZXNjcmlwdGlvbihcblx0XHRcdFx0XHRcdFx0dGhpcy5fcmVuZGVyTWVzc2FnZUFzUGxhaW50ZXh0KHBhcnQuaW52b2NhdGlvbk1lc3NhZ2UpLFxuXHRcdFx0XHRcdFx0XHRwYXJ0LnBhc3RUZW5zZU1lc3NhZ2UgPyB0aGlzLl9yZW5kZXJNZXNzYWdlQXNQbGFpbnRleHQocGFydC5wYXN0VGVuc2VNZXNzYWdlKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0cGFydC50b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0XHRcdFx0XHRyZXN1bHREZXRhaWxzLFxuXHRcdFx0XHRcdFx0XHRpc0NvbXBsZXRlXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRlbnRQYXJ0cy5wdXNoKGRlc2NyaXB0aW9uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJzoge1xuXHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gZ2V0VG9vbEludm9jYXRpb25BMTF5RGVzY3JpcHRpb24oXG5cdFx0XHRcdFx0XHR0aGlzLl9yZW5kZXJNZXNzYWdlQXNQbGFpbnRleHQocGFydC5pbnZvY2F0aW9uTWVzc2FnZSksXG5cdFx0XHRcdFx0XHRwYXJ0LnBhc3RUZW5zZU1lc3NhZ2UgPyB0aGlzLl9yZW5kZXJNZXNzYWdlQXNQbGFpbnRleHQocGFydC5wYXN0VGVuc2VNZXNzYWdlKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHBhcnQudG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdFx0XHRcdHBhcnQucmVzdWx0RGV0YWlscyxcblx0XHRcdFx0XHRcdHBhcnQuaXNDb21wbGV0ZVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRjb250ZW50UGFydHMucHVzaChkZXNjcmlwdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2F1dG9Nb2RlUmVzb2x1dGlvbic6IHtcblx0XHRcdFx0XHRpZiAocGFydC5wcmVkaWN0ZWRMYWJlbCA9PT0gJ2ZhbGxiYWNrJykge1xuXHRcdFx0XHRcdFx0Y29udGVudFBhcnRzLnB1c2gobG9jYWxpemUoJ2F1dG9Nb2RlUmVzb2x1dGlvbkExMXlGYWxsYmFjaycsIFwiUm91dGVkIHRvIHswfS4gVW5hYmxlIHRvIHJlc29sdmUuXCIsIHBhcnQucmVzb2x2ZWRNb2RlbE5hbWUpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBwYXJ0LnByZWRpY3RlZExhYmVsID09PSAnbmVlZHNfcmVhc29uaW5nJ1xuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhdXRvTW9kZVJlc29sdXRpb25BMTF5UmVhc29uaW5nJywgXCJSZWFzb25pbmdcIilcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYXV0b01vZGVSZXNvbHV0aW9uQTExeU5vblJlYXNvbmluZycsIFwiTm9uLXJlYXNvbmluZ1wiKTtcblx0XHRcdFx0XHRcdGNvbnRlbnRQYXJ0cy5wdXNoKGxvY2FsaXplKCdhdXRvTW9kZVJlc29sdXRpb25BMTF5JywgXCJSb3V0ZWQgdG8gezB9LiB7MX0gLSBDb25maWRlbmNlIHsyfSVcIiwgcGFydC5yZXNvbHZlZE1vZGVsTmFtZSwgbGFiZWwsIChwYXJ0LmNvbmZpZGVuY2UgKiAxMDApLnRvRml4ZWQoMCkpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fbm9ybWFsaXplV2hpdGVzcGFjZShjb250ZW50UGFydHMuam9pbignXFxuJykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbm9ybWFsaXplV2hpdGVzcGFjZShjb250ZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgvXFxyP1xcbi8pO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRpZiAobGluZS50cmltKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bm9ybWFsaXplZC5wdXNoKGxpbmUpO1xuXHRcdH1cblx0XHRyZXR1cm4gbm9ybWFsaXplZC5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZEluY2x1ZGVUaGlua2luZ0NvbnRlbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzVGhpbmtpbmdDb250ZW50SW5jbHVkZWRJbkFjY2Vzc2libGVWaWV3KHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKTtcblx0fVxuXG5cdG9uQ2xvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LnJldmVhbCh0aGlzLl9mb2N1c2VkSXRlbSk7XG5cdFx0aWYgKHRoaXMuX3dhc09wZW5lZEZyb21JbnB1dCkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LmZvY3VzSW5wdXQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LmZvY3VzKHRoaXMuX2ZvY3VzZWRJdGVtKTtcblx0XHR9XG5cdH1cblxuXHRwcm92aWRlTmV4dENvbnRlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBuZXh0ID0gdGhpcy5fd2lkZ2V0LmdldFNpYmxpbmcodGhpcy5fZm9jdXNlZEl0ZW0sICduZXh0Jyk7XG5cdFx0aWYgKG5leHQpIHtcblx0XHRcdHRoaXMuX3NldEZvY3VzZWRJdGVtKG5leHQpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldENvbnRlbnQobmV4dCk7XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdHByb3ZpZGVQcmV2aW91c0NvbnRlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX3dpZGdldC5nZXRTaWJsaW5nKHRoaXMuX2ZvY3VzZWRJdGVtLCAncHJldmlvdXMnKTtcblx0XHRpZiAocHJldmlvdXMpIHtcblx0XHRcdHRoaXMuX3NldEZvY3VzZWRJdGVtKHByZXZpb3VzKTtcblx0XHRcdHJldHVybiB0aGlzLl9nZXRDb250ZW50KHByZXZpb3VzKTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQTBCLHdCQUF3QjtBQUNsRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQiwwQkFBMEQ7QUFHN0YsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsNkNBQTZDO0FBQ3RELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXNaLHFCQUFrSSw4Q0FBOEM7QUFDdGtCLFNBQVMsb0JBQW9C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
