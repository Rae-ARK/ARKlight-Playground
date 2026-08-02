import { encodeBase64 } from "../../../../../../base/common/buffer.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../chatService/chatService.js";
import { isToolResultOutputDetails } from "../../tools/languageModelToolsService.js";
class ChatToolInvocation {
  constructor(preparedInvocation, toolData, toolCallId, subAgentInvocationId, parameters, startOptions = {}, chatRequestId) {
    this.toolCallId = toolCallId;
    this.kind = "toolInvocation";
    this.isAttachedToThinking = false;
    this._toolSpecificDataKind = observableValue(this, void 0);
    this.toolSpecificDataKind = this._toolSpecificDataKind;
    this._progress = observableValue(this, { progress: 0 });
    // Streaming-related observables
    this._partialInput = observableValue(this, void 0);
    this._streamingMessage = observableValue(this, void 0);
    let defaultMessage = "";
    if (startOptions.startInStreaming) {
      defaultMessage = toolData.displayName;
    } else if (startOptions.startInCancelled) {
      defaultMessage = startOptions.cancelReasonMessage ?? localize("toolDeniedMessage", 'Tool "{0}" was denied', toolData.displayName);
    }
    this.invocationMessage = preparedInvocation?.invocationMessage ?? defaultMessage;
    this.pastTenseMessage = preparedInvocation?.pastTenseMessage;
    this.originMessage = preparedInvocation?.originMessage;
    this.confirmationMessages = preparedInvocation?.confirmationMessages;
    this.presentation = preparedInvocation?.presentation;
    this.toolSpecificData = preparedInvocation?.toolSpecificData;
    this.toolId = toolData.id;
    this.icon = preparedInvocation?.icon ?? (toolData.icon && ThemeIcon.isThemeIcon(toolData.icon) ? toolData.icon : void 0);
    this.source = toolData.source;
    this.subAgentInvocationId = subAgentInvocationId;
    this.parameters = parameters;
    this.chatRequestId = chatRequestId;
    if (startOptions.startInCancelled) {
      this._state = observableValue(this, {
        type: IChatToolInvocation.StateKind.Cancelled,
        reason: startOptions.cancelReason ?? ToolConfirmKind.Denied,
        reasonMessage: startOptions.cancelReasonMessage,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages
      });
    } else if (startOptions.startInStreaming) {
      this._state = observableValue(this, {
        type: IChatToolInvocation.StateKind.Streaming,
        partialInput: this._partialInput,
        streamingMessage: this._streamingMessage
      });
    } else if (!this.confirmationMessages?.title) {
      this._state = observableValue(this, {
        type: IChatToolInvocation.StateKind.Executing,
        confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded, reason: this.confirmationMessages?.confirmationNotNeededReason },
        progress: this._progress,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages
      });
    } else {
      this._state = observableValue(this, {
        type: IChatToolInvocation.StateKind.WaitingForConfirmation,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages,
        confirm: (reason) => this._confirm(reason)
      });
    }
  }
  get toolSpecificData() {
    return this._toolSpecificData;
  }
  set toolSpecificData(value) {
    this._toolSpecificData = value;
    this._toolSpecificDataKind.set(value?.kind, void 0);
  }
  get state() {
    return this._state;
  }
  /**
   * Create a tool invocation in streaming state.
   * Use this when the tool call is beginning to stream partial input from the LM.
   */
  static createStreaming(options) {
    return new ChatToolInvocation(void 0, options.toolData, options.toolCallId, options.subagentInvocationId, void 0, { startInStreaming: true }, options.chatRequestId);
  }
  /**
   * Create a tool invocation already in cancelled state.
   * Use this when a hook denies tool execution before it even starts.
   */
  static createCancelled(options, parameters, reason, reasonMessage) {
    return new ChatToolInvocation(void 0, options.toolData, options.toolCallId, options.subagentInvocationId, parameters, { startInCancelled: true, cancelReason: reason, cancelReasonMessage: reasonMessage }, options.chatRequestId);
  }
  /**
   * Shared confirmation handler used by every `WaitingForConfirmation` state
   * this invocation can enter (initial construction, transition out of
   * streaming, and re-arming via {@link requestConfirmation}). Denials/skips
   * cancel; anything else moves to executing.
   */
  _confirm(reason) {
    if (reason.type === ToolConfirmKind.Denied || reason.type === ToolConfirmKind.Skipped) {
      this._state.set({
        type: IChatToolInvocation.StateKind.Cancelled,
        reason: reason.type,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages
      }, void 0);
    } else {
      this._state.set({
        type: IChatToolInvocation.StateKind.Executing,
        confirmed: reason,
        progress: this._progress,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages
      }, void 0);
    }
  }
  /**
   * Update the partial input observable during streaming.
   */
  updatePartialInput(input) {
    if (this._state.get().type !== IChatToolInvocation.StateKind.Streaming) {
      return;
    }
    this._partialInput.set(input, void 0);
  }
  /**
   * Update the streaming message (from handleToolStream).
   */
  updateStreamingMessage(message) {
    const state = this._state.get();
    if (state.type !== IChatToolInvocation.StateKind.Streaming) {
      return;
    }
    this._streamingMessage.set(message, void 0);
  }
  /**
   * Notifies state observers that `toolSpecificData` has been mutated.
   * Since `toolSpecificData` isn't observable, this re-sets the internal
   * state to trigger autoruns that need to re-read tool metadata.
   */
  notifyToolSpecificDataChanged() {
    const current = this._state.get();
    this._state.set({ ...current }, void 0);
  }
  updateConfirmationMessages(confirmationMessages) {
    const current = this._state.get();
    if (current.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return;
    }
    this.confirmationMessages = confirmationMessages;
    this._state.set({ ...current, confirmationMessages }, void 0);
  }
  /**
   * Cancel a streaming invocation directly (e.g., when preToolUse hook denies).
   * Only works when in Streaming state.
   * @returns true if the cancellation was applied, false if not in streaming state
   */
  cancelFromStreaming(reason, reasonMessage) {
    const currentState = this._state.get();
    if (currentState.type !== IChatToolInvocation.StateKind.Streaming) {
      return false;
    }
    this._state.set({
      type: IChatToolInvocation.StateKind.Cancelled,
      reason,
      reasonMessage,
      parameters: this.parameters,
      confirmationMessages: this.confirmationMessages
    }, void 0);
    return true;
  }
  /**
   * Transition from streaming state to prepared/executing state.
   * Called when the full tool call is ready.
   */
  transitionFromStreaming(preparedInvocation, parameters, autoConfirmed) {
    const currentState = this._state.get();
    if (currentState.type !== IChatToolInvocation.StateKind.Streaming) {
      return;
    }
    const lastStreamingMessage = this._streamingMessage.get();
    if (lastStreamingMessage && !preparedInvocation?.invocationMessage) {
      this.invocationMessage = lastStreamingMessage;
    }
    this.parameters = parameters;
    if (preparedInvocation) {
      if (preparedInvocation.invocationMessage) {
        this.invocationMessage = preparedInvocation.invocationMessage;
      }
      this.pastTenseMessage = preparedInvocation.pastTenseMessage;
      this.confirmationMessages = preparedInvocation.confirmationMessages;
      this.presentation = preparedInvocation.presentation;
      this.toolSpecificData = preparedInvocation.toolSpecificData;
    }
    if (autoConfirmed) {
      this._confirm(autoConfirmed);
    } else if (!this.confirmationMessages?.title) {
      this._state.set({
        type: IChatToolInvocation.StateKind.Executing,
        confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded, reason: this.confirmationMessages?.confirmationNotNeededReason },
        progress: this._progress,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages
      }, void 0);
    } else {
      this._state.set({
        type: IChatToolInvocation.StateKind.WaitingForConfirmation,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages,
        confirm: (reason) => this._confirm(reason)
      }, void 0);
    }
  }
  /** Moves an active invocation into confirmation while preserving the same tool card. */
  requestConfirmation(preparedInvocation) {
    const currentType = this._state.get().type;
    if (currentType === IChatToolInvocation.StateKind.Streaming) {
      this.transitionFromStreaming(preparedInvocation, this.parameters, void 0);
      return;
    }
    if (currentType === IChatToolInvocation.StateKind.Completed || currentType === IChatToolInvocation.StateKind.Cancelled || currentType === IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return;
    }
    if (preparedInvocation.invocationMessage) {
      this.invocationMessage = preparedInvocation.invocationMessage;
    }
    this.pastTenseMessage = preparedInvocation.pastTenseMessage;
    this.confirmationMessages = preparedInvocation.confirmationMessages;
    this.presentation = preparedInvocation.presentation;
    this.toolSpecificData = preparedInvocation.toolSpecificData;
    if (!this.confirmationMessages?.title) {
      return;
    }
    this._state.set({
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: this.parameters,
      confirmationMessages: this.confirmationMessages,
      confirm: (reason) => this._confirm(reason)
    }, void 0);
  }
  _setCompleted(result, postConfirmed) {
    if (postConfirmed && (postConfirmed.type === ToolConfirmKind.Denied || postConfirmed.type === ToolConfirmKind.Skipped)) {
      this._state.set({
        type: IChatToolInvocation.StateKind.Cancelled,
        reason: postConfirmed.type,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages
      }, void 0);
      return;
    }
    this._state.set({
      type: IChatToolInvocation.StateKind.Completed,
      confirmed: IChatToolInvocation.executionConfirmedOrDenied(this) || { type: ToolConfirmKind.ConfirmationNotNeeded },
      resultDetails: result?.toolResultDetails,
      postConfirmed,
      contentForModel: result?.content || [],
      parameters: this.parameters,
      confirmationMessages: this.confirmationMessages
    }, void 0);
  }
  async didExecuteTool(result, final, checkIfResultAutoApproved) {
    if (result?.toolSpecificData) {
      this.toolSpecificData = result.toolSpecificData;
    }
    if (result?.toolResultMessage) {
      this.pastTenseMessage = result.toolResultMessage;
    } else if (this._progress.get().message) {
      this.pastTenseMessage = this._progress.get().message;
    }
    if (this.confirmationMessages?.confirmResults && !result?.toolResultError && result?.confirmResults !== false && !final) {
      const autoApproved = await checkIfResultAutoApproved?.();
      if (autoApproved) {
        this._setCompleted(result, autoApproved);
      } else {
        this._state.set({
          type: IChatToolInvocation.StateKind.WaitingForPostApproval,
          confirmed: IChatToolInvocation.executionConfirmedOrDenied(this) || { type: ToolConfirmKind.ConfirmationNotNeeded },
          resultDetails: result?.toolResultDetails,
          contentForModel: result?.content || [],
          confirm: (reason) => this._setCompleted(result, reason),
          parameters: this.parameters,
          confirmationMessages: this.confirmationMessages
        }, void 0);
      }
    } else {
      this._setCompleted(result);
    }
    return this._state.get();
  }
  setAuthenticationRequired(server, cancel = () => {
  }) {
    const state = this._state.get();
    if (state.type !== IChatToolInvocation.StateKind.Executing && state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
      return;
    }
    this._state.set({
      type: IChatToolInvocation.StateKind.WaitingForAuthentication,
      server,
      cancel,
      confirmed: state.confirmed,
      parameters: state.parameters,
      confirmationMessages: state.confirmationMessages
    }, void 0);
  }
  setAuthenticationResolved() {
    const state = this._state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
      return;
    }
    this._state.set({
      type: IChatToolInvocation.StateKind.Executing,
      confirmed: state.confirmed,
      progress: this._progress,
      parameters: state.parameters,
      confirmationMessages: state.confirmationMessages
    }, void 0);
  }
  acceptProgress(step) {
    const prev = this._progress.get();
    this._progress.set({
      progress: step.progress || prev.progress || 0,
      message: step.message
    }, void 0);
  }
  toJSON() {
    const waitingForPostApproval = this.state.get().type === IChatToolInvocation.StateKind.WaitingForPostApproval;
    const details = waitingForPostApproval ? void 0 : IChatToolInvocation.resultDetails(this);
    return {
      kind: "toolInvocationSerialized",
      presentation: this.presentation,
      invocationMessage: this.invocationMessage,
      pastTenseMessage: this.pastTenseMessage,
      originMessage: this.originMessage,
      isConfirmed: waitingForPostApproval ? { type: ToolConfirmKind.Skipped } : IChatToolInvocation.executionConfirmedOrDenied(this),
      isComplete: true,
      source: this.source,
      resultDetails: isToolResultOutputDetails(details) ? { output: { type: "data", mimeType: details.output.mimeType, base64Data: encodeBase64(details.output.value) } } : details,
      toolSpecificData: this.toolSpecificData?.kind === "automationConfiguration" ? void 0 : this.toolSpecificData,
      toolCallId: this.toolCallId,
      toolId: this.toolId,
      subAgentInvocationId: this.subAgentInvocationId,
      generatedTitle: this.generatedTitle
    };
  }
}
export {
  ChatToolInvocation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRUb29sSW52b2NhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGVuY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlybWVkUmVhc29uLCBJQ2hhdEFnZW50RmVlZGJhY2tSZXZpZXdDb25maXJtYXRpb25EYXRhLCBJQ2hhdEF1dG9tYXRpb25Db25maWd1cmF0aW9uRGF0YSwgSUNoYXRBdXRvbWF0aW9uQ29uZmlndXJlZERhdGEsIElDaGF0RXh0ZW5zaW9uc0NvbnRlbnQsIElDaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbkRhdGEsIElDaGF0U2VhcmNoVG9vbEludm9jYXRpb25EYXRhLCBJQ2hhdFNlc3Npb25DcmVhdGVkRGF0YSwgSUNoYXRTaW1wbGVUb29sSW52b2NhdGlvbkRhdGEsIElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEsIElDaGF0VG9kb0xpc3RDb250ZW50LCBJQ2hhdFRvb2xJbnB1dEludm9jYXRpb25EYXRhLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBJQ2hhdFRvb2xJbnZvY2F0aW9uT3RoZXJDbGllbnREYXRhLCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgVG9vbENvbmZpcm1LaW5kLCB0eXBlIElDaGF0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZFNlcnZlciwgdHlwZSBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByZXBhcmVkVG9vbEludm9jYXRpb24sIGlzVG9vbFJlc3VsdE91dHB1dERldGFpbHMsIElUb29sQ29uZmlybWF0aW9uTWVzc2FnZXMsIElUb29sRGF0YSwgSVRvb2xQcm9ncmVzc1N0ZXAsIElUb29sUmVzdWx0LCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTdHJlYW1pbmdUb29sQ2FsbE9wdGlvbnMge1xuXHR0b29sQ2FsbElkOiBzdHJpbmc7XG5cdHRvb2xJZDogc3RyaW5nO1xuXHR0b29sRGF0YTogSVRvb2xEYXRhO1xuXHRzdWJhZ2VudEludm9jYXRpb25JZD86IHN0cmluZztcblx0Y2hhdFJlcXVlc3RJZD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRUb29sSW52b2NhdGlvbiBpbXBsZW1lbnRzIElDaGF0VG9vbEludm9jYXRpb24ge1xuXHRwdWJsaWMgcmVhZG9ubHkga2luZDogJ3Rvb2xJbnZvY2F0aW9uJyA9ICd0b29sSW52b2NhdGlvbic7XG5cblx0cHVibGljIGludm9jYXRpb25NZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBvcmlnaW5NZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBwYXN0VGVuc2VNZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBjb25maXJtYXRpb25NZXNzYWdlczogSVRvb2xDb25maXJtYXRpb25NZXNzYWdlcyB8IHVuZGVmaW5lZDtcblx0cHVibGljIHByZXNlbnRhdGlvbjogSVByZXBhcmVkVG9vbEludm9jYXRpb25bJ3ByZXNlbnRhdGlvbiddO1xuXHRwdWJsaWMgcmVhZG9ubHkgdG9vbElkOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBpY29uPzogVGhlbWVJY29uO1xuXHRwdWJsaWMgc291cmNlOiBUb29sRGF0YVNvdXJjZTtcblx0cHVibGljIHJlYWRvbmx5IHN1YkFnZW50SW52b2NhdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBwYXJhbWV0ZXJzOiB1bmtub3duO1xuXHRwdWJsaWMgZ2VuZXJhdGVkVGl0bGU/OiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBjaGF0UmVxdWVzdElkPzogc3RyaW5nO1xuXHRwdWJsaWMgaXNBdHRhY2hlZFRvVGhpbmtpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHVibGljIG90aGVyQ2xpZW50VG9vbENhbGw/OiBJQ2hhdFRvb2xJbnZvY2F0aW9uT3RoZXJDbGllbnREYXRhO1xuXG5cdHByaXZhdGUgX3Rvb2xTcGVjaWZpY0RhdGE/OiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHwgSUNoYXRUb29sSW5wdXRJbnZvY2F0aW9uRGF0YSB8IElDaGF0RXh0ZW5zaW9uc0NvbnRlbnQgfCBJQ2hhdFRvZG9MaXN0Q29udGVudCB8IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEgfCBJQ2hhdFNpbXBsZVRvb2xJbnZvY2F0aW9uRGF0YSB8IElDaGF0U2VhcmNoVG9vbEludm9jYXRpb25EYXRhIHwgSUNoYXRNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uRGF0YSB8IElDaGF0QWdlbnRGZWVkYmFja1Jldmlld0NvbmZpcm1hdGlvbkRhdGEgfCBJQ2hhdFNlc3Npb25DcmVhdGVkRGF0YSB8IElDaGF0QXV0b21hdGlvbkNvbmZpZ3VyYXRpb25EYXRhIHwgSUNoYXRBdXRvbWF0aW9uQ29uZmlndXJlZERhdGE7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xTcGVjaWZpY0RhdGFLaW5kID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHVibGljIHJlYWRvbmx5IHRvb2xTcGVjaWZpY0RhdGFLaW5kOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gdGhpcy5fdG9vbFNwZWNpZmljRGF0YUtpbmQ7XG5cblx0cHVibGljIGdldCB0b29sU3BlY2lmaWNEYXRhKCkge1xuXHRcdHJldHVybiB0aGlzLl90b29sU3BlY2lmaWNEYXRhO1xuXHR9XG5cblx0cHVibGljIHNldCB0b29sU3BlY2lmaWNEYXRhKHZhbHVlOiB0eXBlb2YgdGhpcy5fdG9vbFNwZWNpZmljRGF0YSkge1xuXHRcdHRoaXMuX3Rvb2xTcGVjaWZpY0RhdGEgPSB2YWx1ZTtcblx0XHR0aGlzLl90b29sU3BlY2lmaWNEYXRhS2luZC5zZXQodmFsdWU/LmtpbmQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzcyA9IG9ic2VydmFibGVWYWx1ZTx7IG1lc3NhZ2U/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7IHByb2dyZXNzOiBudW1iZXIgfCB1bmRlZmluZWQgfT4odGhpcywgeyBwcm9ncmVzczogMCB9KTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGU6IElTZXR0YWJsZU9ic2VydmFibGU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT47XG5cblx0Ly8gU3RyZWFtaW5nLXJlbGF0ZWQgb2JzZXJ2YWJsZXNcblx0cHJpdmF0ZSByZWFkb25seSBfcGFydGlhbElucHV0ID0gb2JzZXJ2YWJsZVZhbHVlPHVua25vd24+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0cmVhbWluZ01lc3NhZ2UgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cdHB1YmxpYyBnZXQgc3RhdGUoKTogSU9ic2VydmFibGU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4ge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSB0b29sIGludm9jYXRpb24gaW4gc3RyZWFtaW5nIHN0YXRlLlxuXHQgKiBVc2UgdGhpcyB3aGVuIHRoZSB0b29sIGNhbGwgaXMgYmVnaW5uaW5nIHRvIHN0cmVhbSBwYXJ0aWFsIGlucHV0IGZyb20gdGhlIExNLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBjcmVhdGVTdHJlYW1pbmcob3B0aW9uczogSVN0cmVhbWluZ1Rvb2xDYWxsT3B0aW9ucyk6IENoYXRUb29sSW52b2NhdGlvbiB7XG5cdFx0cmV0dXJuIG5ldyBDaGF0VG9vbEludm9jYXRpb24odW5kZWZpbmVkLCBvcHRpb25zLnRvb2xEYXRhLCBvcHRpb25zLnRvb2xDYWxsSWQsIG9wdGlvbnMuc3ViYWdlbnRJbnZvY2F0aW9uSWQsIHVuZGVmaW5lZCwgeyBzdGFydEluU3RyZWFtaW5nOiB0cnVlIH0sIG9wdGlvbnMuY2hhdFJlcXVlc3RJZCk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgdG9vbCBpbnZvY2F0aW9uIGFscmVhZHkgaW4gY2FuY2VsbGVkIHN0YXRlLlxuXHQgKiBVc2UgdGhpcyB3aGVuIGEgaG9vayBkZW5pZXMgdG9vbCBleGVjdXRpb24gYmVmb3JlIGl0IGV2ZW4gc3RhcnRzLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBjcmVhdGVDYW5jZWxsZWQob3B0aW9uczogSVN0cmVhbWluZ1Rvb2xDYWxsT3B0aW9ucywgcGFyYW1ldGVyczogdW5rbm93biwgcmVhc29uOiBUb29sQ29uZmlybUtpbmQuRGVuaWVkIHwgVG9vbENvbmZpcm1LaW5kLlNraXBwZWQsIHJlYXNvbk1lc3NhZ2U/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcpOiBDaGF0VG9vbEludm9jYXRpb24ge1xuXHRcdHJldHVybiBuZXcgQ2hhdFRvb2xJbnZvY2F0aW9uKHVuZGVmaW5lZCwgb3B0aW9ucy50b29sRGF0YSwgb3B0aW9ucy50b29sQ2FsbElkLCBvcHRpb25zLnN1YmFnZW50SW52b2NhdGlvbklkLCBwYXJhbWV0ZXJzLCB7IHN0YXJ0SW5DYW5jZWxsZWQ6IHRydWUsIGNhbmNlbFJlYXNvbjogcmVhc29uLCBjYW5jZWxSZWFzb25NZXNzYWdlOiByZWFzb25NZXNzYWdlIH0sIG9wdGlvbnMuY2hhdFJlcXVlc3RJZCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcmVwYXJlZEludm9jYXRpb246IElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdHRvb2xEYXRhOiBJVG9vbERhdGEsXG5cdFx0cHVibGljIHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZyxcblx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHBhcmFtZXRlcnM6IHVua25vd24sXG5cdFx0c3RhcnRPcHRpb25zOiB7IHN0YXJ0SW5TdHJlYW1pbmc/OiBib29sZWFuOyBzdGFydEluQ2FuY2VsbGVkPzogYm9vbGVhbjsgY2FuY2VsUmVhc29uPzogVG9vbENvbmZpcm1LaW5kLkRlbmllZCB8IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkOyBjYW5jZWxSZWFzb25NZXNzYWdlPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIH0gPSB7fSxcblx0XHRjaGF0UmVxdWVzdElkPzogc3RyaW5nXG5cdCkge1xuXHRcdC8vIEZvciBzdHJlYW1pbmcgaW52b2NhdGlvbnMsIHVzZSBhIGRlZmF1bHQgbWVzc2FnZSB1bnRpbCBoYW5kbGVUb29sU3RyZWFtIHByb3ZpZGVzIG9uZVxuXHRcdGxldCBkZWZhdWx0TWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nID0gJyc7XG5cdFx0aWYgKHN0YXJ0T3B0aW9ucy5zdGFydEluU3RyZWFtaW5nKSB7XG5cdFx0XHRkZWZhdWx0TWVzc2FnZSA9IHRvb2xEYXRhLmRpc3BsYXlOYW1lO1xuXHRcdH0gZWxzZSBpZiAoc3RhcnRPcHRpb25zLnN0YXJ0SW5DYW5jZWxsZWQpIHtcblx0XHRcdGRlZmF1bHRNZXNzYWdlID0gc3RhcnRPcHRpb25zLmNhbmNlbFJlYXNvbk1lc3NhZ2UgPz8gbG9jYWxpemUoJ3Rvb2xEZW5pZWRNZXNzYWdlJywgXCJUb29sIFxcXCJ7MH1cXFwiIHdhcyBkZW5pZWRcIiwgdG9vbERhdGEuZGlzcGxheU5hbWUpO1xuXHRcdH1cblx0XHR0aGlzLmludm9jYXRpb25NZXNzYWdlID0gcHJlcGFyZWRJbnZvY2F0aW9uPy5pbnZvY2F0aW9uTWVzc2FnZSA/PyBkZWZhdWx0TWVzc2FnZTtcblx0XHR0aGlzLnBhc3RUZW5zZU1lc3NhZ2UgPSBwcmVwYXJlZEludm9jYXRpb24/LnBhc3RUZW5zZU1lc3NhZ2U7XG5cdFx0dGhpcy5vcmlnaW5NZXNzYWdlID0gcHJlcGFyZWRJbnZvY2F0aW9uPy5vcmlnaW5NZXNzYWdlO1xuXHRcdHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMgPSBwcmVwYXJlZEludm9jYXRpb24/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzO1xuXHRcdHRoaXMucHJlc2VudGF0aW9uID0gcHJlcGFyZWRJbnZvY2F0aW9uPy5wcmVzZW50YXRpb247XG5cdFx0dGhpcy50b29sU3BlY2lmaWNEYXRhID0gcHJlcGFyZWRJbnZvY2F0aW9uPy50b29sU3BlY2lmaWNEYXRhO1xuXHRcdHRoaXMudG9vbElkID0gdG9vbERhdGEuaWQ7XG5cdFx0dGhpcy5pY29uID0gcHJlcGFyZWRJbnZvY2F0aW9uPy5pY29uID8/ICh0b29sRGF0YS5pY29uICYmIFRoZW1lSWNvbi5pc1RoZW1lSWNvbih0b29sRGF0YS5pY29uKSA/IHRvb2xEYXRhLmljb24gOiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuc291cmNlID0gdG9vbERhdGEuc291cmNlO1xuXHRcdHRoaXMuc3ViQWdlbnRJbnZvY2F0aW9uSWQgPSBzdWJBZ2VudEludm9jYXRpb25JZDtcblx0XHR0aGlzLnBhcmFtZXRlcnMgPSBwYXJhbWV0ZXJzO1xuXHRcdHRoaXMuY2hhdFJlcXVlc3RJZCA9IGNoYXRSZXF1ZXN0SWQ7XG5cblx0XHRpZiAoc3RhcnRPcHRpb25zLnN0YXJ0SW5DYW5jZWxsZWQpIHtcblx0XHRcdC8vIFN0YXJ0IGRpcmVjdGx5IGluIGNhbmNlbGxlZCBzdGF0ZSAoZS5nLiwgd2hlbiBhIGhvb2sgZGVuaWVzIGV4ZWN1dGlvbilcblx0XHRcdHRoaXMuX3N0YXRlID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkLFxuXHRcdFx0XHRyZWFzb246IHN0YXJ0T3B0aW9ucy5jYW5jZWxSZWFzb24gPz8gVG9vbENvbmZpcm1LaW5kLkRlbmllZCxcblx0XHRcdFx0cmVhc29uTWVzc2FnZTogc3RhcnRPcHRpb25zLmNhbmNlbFJlYXNvbk1lc3NhZ2UsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHRoaXMucGFyYW1ldGVycyxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKHN0YXJ0T3B0aW9ucy5zdGFydEluU3RyZWFtaW5nKSB7XG5cdFx0XHQvLyBTdGFydCBpbiBzdHJlYW1pbmcgc3RhdGVcblx0XHRcdHRoaXMuX3N0YXRlID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nLFxuXHRcdFx0XHRwYXJ0aWFsSW5wdXQ6IHRoaXMuX3BhcnRpYWxJbnB1dCxcblx0XHRcdFx0c3RyZWFtaW5nTWVzc2FnZTogdGhpcy5fc3RyZWFtaW5nTWVzc2FnZSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyxcblx0XHRcdFx0Y29uZmlybWVkOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQsIHJlYXNvbjogdGhpcy5jb25maXJtYXRpb25NZXNzYWdlcz8uY29uZmlybWF0aW9uTm90TmVlZGVkUmVhc29uIH0sXG5cdFx0XHRcdHByb2dyZXNzOiB0aGlzLl9wcm9ncmVzcyxcblx0XHRcdFx0cGFyYW1ldGVyczogdGhpcy5wYXJhbWV0ZXJzLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdGhpcy5jb25maXJtYXRpb25NZXNzYWdlcyxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHRoaXMucGFyYW1ldGVycyxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHRcdGNvbmZpcm06IHJlYXNvbiA9PiB0aGlzLl9jb25maXJtKHJlYXNvbiksXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2hhcmVkIGNvbmZpcm1hdGlvbiBoYW5kbGVyIHVzZWQgYnkgZXZlcnkgYFdhaXRpbmdGb3JDb25maXJtYXRpb25gIHN0YXRlXG5cdCAqIHRoaXMgaW52b2NhdGlvbiBjYW4gZW50ZXIgKGluaXRpYWwgY29uc3RydWN0aW9uLCB0cmFuc2l0aW9uIG91dCBvZlxuXHQgKiBzdHJlYW1pbmcsIGFuZCByZS1hcm1pbmcgdmlhIHtAbGluayByZXF1ZXN0Q29uZmlybWF0aW9ufSkuIERlbmlhbHMvc2tpcHNcblx0ICogY2FuY2VsOyBhbnl0aGluZyBlbHNlIG1vdmVzIHRvIGV4ZWN1dGluZy5cblx0ICovXG5cdHByaXZhdGUgX2NvbmZpcm0ocmVhc29uOiBDb25maXJtZWRSZWFzb24pOiB2b2lkIHtcblx0XHRpZiAocmVhc29uLnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5EZW5pZWQgfHwgcmVhc29uLnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQsXG5cdFx0XHRcdHJlYXNvbjogcmVhc29uLnR5cGUsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHRoaXMucGFyYW1ldGVycyxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHRcdGNvbmZpcm1lZDogcmVhc29uLFxuXHRcdFx0XHRwcm9ncmVzczogdGhpcy5fcHJvZ3Jlc3MsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHRoaXMucGFyYW1ldGVycyxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgdGhlIHBhcnRpYWwgaW5wdXQgb2JzZXJ2YWJsZSBkdXJpbmcgc3RyZWFtaW5nLlxuXHQgKi9cblx0cHVibGljIHVwZGF0ZVBhcnRpYWxJbnB1dChpbnB1dDogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5nZXQoKS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpIHtcblx0XHRcdHJldHVybjsgLy8gT25seSB1cGRhdGUgaW4gc3RyZWFtaW5nIHN0YXRlXG5cdFx0fVxuXHRcdHRoaXMuX3BhcnRpYWxJbnB1dC5zZXQoaW5wdXQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSBzdHJlYW1pbmcgbWVzc2FnZSAoZnJvbSBoYW5kbGVUb29sU3RyZWFtKS5cblx0ICovXG5cdHB1YmxpYyB1cGRhdGVTdHJlYW1pbmdNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZykge1xuXHRcdFx0cmV0dXJuOyAvLyBPbmx5IHVwZGF0ZSBpbiBzdHJlYW1pbmcgc3RhdGVcblx0XHR9XG5cdFx0dGhpcy5fc3RyZWFtaW5nTWVzc2FnZS5zZXQobWVzc2FnZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOb3RpZmllcyBzdGF0ZSBvYnNlcnZlcnMgdGhhdCBgdG9vbFNwZWNpZmljRGF0YWAgaGFzIGJlZW4gbXV0YXRlZC5cblx0ICogU2luY2UgYHRvb2xTcGVjaWZpY0RhdGFgIGlzbid0IG9ic2VydmFibGUsIHRoaXMgcmUtc2V0cyB0aGUgaW50ZXJuYWxcblx0ICogc3RhdGUgdG8gdHJpZ2dlciBhdXRvcnVucyB0aGF0IG5lZWQgdG8gcmUtcmVhZCB0b29sIG1ldGFkYXRhLlxuXHQgKi9cblx0cHVibGljIG5vdGlmeVRvb2xTcGVjaWZpY0RhdGFDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9zdGF0ZS5nZXQoKTtcblx0XHR0aGlzLl9zdGF0ZS5zZXQoeyAuLi5jdXJyZW50IH0sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlQ29uZmlybWF0aW9uTWVzc2FnZXMoY29uZmlybWF0aW9uTWVzc2FnZXM6IElUb29sQ29uZmlybWF0aW9uTWVzc2FnZXMpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKGN1cnJlbnQudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzID0gY29uZmlybWF0aW9uTWVzc2FnZXM7XG5cdFx0dGhpcy5fc3RhdGUuc2V0KHsgLi4uY3VycmVudCwgY29uZmlybWF0aW9uTWVzc2FnZXMgfSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWwgYSBzdHJlYW1pbmcgaW52b2NhdGlvbiBkaXJlY3RseSAoZS5nLiwgd2hlbiBwcmVUb29sVXNlIGhvb2sgZGVuaWVzKS5cblx0ICogT25seSB3b3JrcyB3aGVuIGluIFN0cmVhbWluZyBzdGF0ZS5cblx0ICogQHJldHVybnMgdHJ1ZSBpZiB0aGUgY2FuY2VsbGF0aW9uIHdhcyBhcHBsaWVkLCBmYWxzZSBpZiBub3QgaW4gc3RyZWFtaW5nIHN0YXRlXG5cdCAqL1xuXHRwdWJsaWMgY2FuY2VsRnJvbVN0cmVhbWluZyhyZWFzb246IFRvb2xDb25maXJtS2luZC5EZW5pZWQgfCBUb29sQ29uZmlybUtpbmQuU2tpcHBlZCwgcmVhc29uTWVzc2FnZT86IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXHRcdGlmIChjdXJyZW50U3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIE9ubHkgY2FuY2VsIGZyb20gc3RyZWFtaW5nIHN0YXRlXG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhdGUuc2V0KHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZCxcblx0XHRcdHJlYXNvbjogcmVhc29uLFxuXHRcdFx0cmVhc29uTWVzc2FnZTogcmVhc29uTWVzc2FnZSxcblx0XHRcdHBhcmFtZXRlcnM6IHRoaXMucGFyYW1ldGVycyxcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogVHJhbnNpdGlvbiBmcm9tIHN0cmVhbWluZyBzdGF0ZSB0byBwcmVwYXJlZC9leGVjdXRpbmcgc3RhdGUuXG5cdCAqIENhbGxlZCB3aGVuIHRoZSBmdWxsIHRvb2wgY2FsbCBpcyByZWFkeS5cblx0ICovXG5cdHB1YmxpYyB0cmFuc2l0aW9uRnJvbVN0cmVhbWluZyhwcmVwYXJlZEludm9jYXRpb246IElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkLCBwYXJhbWV0ZXJzOiB1bmtub3duLCBhdXRvQ29uZmlybWVkOiBDb25maXJtZWRSZWFzb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50U3RhdGUgPSB0aGlzLl9zdGF0ZS5nZXQoKTtcblx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZykge1xuXHRcdFx0cmV0dXJuOyAvLyBPbmx5IHRyYW5zaXRpb24gZnJvbSBzdHJlYW1pbmcgc3RhdGVcblx0XHR9XG5cblx0XHQvLyBQcmVzZXJ2ZSB0aGUgbGFzdCBzdHJlYW1pbmcgbWVzc2FnZSBpZiBubyBuZXcgaW52b2NhdGlvbiBtZXNzYWdlIGlzIHByb3ZpZGVkXG5cdFx0Y29uc3QgbGFzdFN0cmVhbWluZ01lc3NhZ2UgPSB0aGlzLl9zdHJlYW1pbmdNZXNzYWdlLmdldCgpO1xuXHRcdGlmIChsYXN0U3RyZWFtaW5nTWVzc2FnZSAmJiAhcHJlcGFyZWRJbnZvY2F0aW9uPy5pbnZvY2F0aW9uTWVzc2FnZSkge1xuXHRcdFx0dGhpcy5pbnZvY2F0aW9uTWVzc2FnZSA9IGxhc3RTdHJlYW1pbmdNZXNzYWdlO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBmaWVsZHMgZnJvbSBwcmVwYXJlZCBpbnZvY2F0aW9uXG5cdFx0dGhpcy5wYXJhbWV0ZXJzID0gcGFyYW1ldGVycztcblx0XHRpZiAocHJlcGFyZWRJbnZvY2F0aW9uKSB7XG5cdFx0XHRpZiAocHJlcGFyZWRJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlKSB7XG5cdFx0XHRcdHRoaXMuaW52b2NhdGlvbk1lc3NhZ2UgPSBwcmVwYXJlZEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnBhc3RUZW5zZU1lc3NhZ2UgPSBwcmVwYXJlZEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZTtcblx0XHRcdHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMgPSBwcmVwYXJlZEludm9jYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM7XG5cdFx0XHR0aGlzLnByZXNlbnRhdGlvbiA9IHByZXBhcmVkSW52b2NhdGlvbi5wcmVzZW50YXRpb247XG5cdFx0XHR0aGlzLnRvb2xTcGVjaWZpY0RhdGEgPSBwcmVwYXJlZEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YTtcblx0XHR9XG5cblx0XHQvLyBUcmFuc2l0aW9uIHRvIHRoZSBhcHByb3ByaWF0ZSBzdGF0ZVxuXHRcdGlmIChhdXRvQ29uZmlybWVkKSB7XG5cdFx0XHR0aGlzLl9jb25maXJtKGF1dG9Db25maXJtZWQpO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHRcdGNvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkLCByZWFzb246IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXM/LmNvbmZpcm1hdGlvbk5vdE5lZWRlZFJlYXNvbiB9LFxuXHRcdFx0XHRwcm9ncmVzczogdGhpcy5fcHJvZ3Jlc3MsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHRoaXMucGFyYW1ldGVycyxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB0aGlzLnBhcmFtZXRlcnMsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdFx0XHRjb25maXJtOiByZWFzb24gPT4gdGhpcy5fY29uZmlybShyZWFzb24pLFxuXHRcdFx0fSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHQvKiogTW92ZXMgYW4gYWN0aXZlIGludm9jYXRpb24gaW50byBjb25maXJtYXRpb24gd2hpbGUgcHJlc2VydmluZyB0aGUgc2FtZSB0b29sIGNhcmQuICovXG5cdHB1YmxpYyByZXF1ZXN0Q29uZmlybWF0aW9uKHByZXBhcmVkSW52b2NhdGlvbjogSVByZXBhcmVkVG9vbEludm9jYXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50VHlwZSA9IHRoaXMuX3N0YXRlLmdldCgpLnR5cGU7XG5cdFx0aWYgKGN1cnJlbnRUeXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpIHtcblx0XHRcdHRoaXMudHJhbnNpdGlvbkZyb21TdHJlYW1pbmcocHJlcGFyZWRJbnZvY2F0aW9uLCB0aGlzLnBhcmFtZXRlcnMsIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChjdXJyZW50VHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkXG5cdFx0XHR8fCBjdXJyZW50VHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkXG5cdFx0XHR8fCBjdXJyZW50VHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChwcmVwYXJlZEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UpIHtcblx0XHRcdHRoaXMuaW52b2NhdGlvbk1lc3NhZ2UgPSBwcmVwYXJlZEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2U7XG5cdFx0fVxuXHRcdHRoaXMucGFzdFRlbnNlTWVzc2FnZSA9IHByZXBhcmVkSW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlO1xuXHRcdHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMgPSBwcmVwYXJlZEludm9jYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM7XG5cdFx0dGhpcy5wcmVzZW50YXRpb24gPSBwcmVwYXJlZEludm9jYXRpb24ucHJlc2VudGF0aW9uO1xuXHRcdHRoaXMudG9vbFNwZWNpZmljRGF0YSA9IHByZXBhcmVkSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhO1xuXG5cdFx0aWYgKCF0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSkge1xuXHRcdFx0cmV0dXJuOyAvLyBub3RoaW5nIHRvIGNvbmZpcm1cblx0XHR9XG5cblx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdHBhcmFtZXRlcnM6IHRoaXMucGFyYW1ldGVycyxcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdFx0Y29uZmlybTogcmVhc29uID0+IHRoaXMuX2NvbmZpcm0ocmVhc29uKSxcblx0XHR9LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q29tcGxldGVkKHJlc3VsdDogSVRvb2xSZXN1bHQgfCB1bmRlZmluZWQsIHBvc3RDb25maXJtZWQ/OiBDb25maXJtZWRSZWFzb24gfCB1bmRlZmluZWQpIHtcblx0XHRpZiAocG9zdENvbmZpcm1lZCAmJiAocG9zdENvbmZpcm1lZC50eXBlID09PSBUb29sQ29uZmlybUtpbmQuRGVuaWVkIHx8IHBvc3RDb25maXJtZWQudHlwZSA9PT0gVG9vbENvbmZpcm1LaW5kLlNraXBwZWQpKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQsXG5cdFx0XHRcdHJlYXNvbjogcG9zdENvbmZpcm1lZC50eXBlLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB0aGlzLnBhcmFtZXRlcnMsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdFx0fSwgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkLFxuXHRcdFx0Y29uZmlybWVkOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLmV4ZWN1dGlvbkNvbmZpcm1lZE9yRGVuaWVkKHRoaXMpIHx8IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0cmVzdWx0RGV0YWlsczogcmVzdWx0Py50b29sUmVzdWx0RGV0YWlscyxcblx0XHRcdHBvc3RDb25maXJtZWQsXG5cdFx0XHRjb250ZW50Rm9yTW9kZWw6IHJlc3VsdD8uY29udGVudCB8fCBbXSxcblx0XHRcdHBhcmFtZXRlcnM6IHRoaXMucGFyYW1ldGVycyxcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZGlkRXhlY3V0ZVRvb2wocmVzdWx0OiBJVG9vbFJlc3VsdCB8IHVuZGVmaW5lZCwgZmluYWw/OiBib29sZWFuLCBjaGVja0lmUmVzdWx0QXV0b0FwcHJvdmVkPzogKCkgPT4gUHJvbWlzZTxDb25maXJtZWRSZWFzb24gfCB1bmRlZmluZWQ+KTogUHJvbWlzZTxJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlPiB7XG5cdFx0aWYgKHJlc3VsdD8udG9vbFNwZWNpZmljRGF0YSkge1xuXHRcdFx0dGhpcy50b29sU3BlY2lmaWNEYXRhID0gcmVzdWx0LnRvb2xTcGVjaWZpY0RhdGE7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQ/LnRvb2xSZXN1bHRNZXNzYWdlKSB7XG5cdFx0XHR0aGlzLnBhc3RUZW5zZU1lc3NhZ2UgPSByZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2U7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9wcm9ncmVzcy5nZXQoKS5tZXNzYWdlKSB7XG5cdFx0XHR0aGlzLnBhc3RUZW5zZU1lc3NhZ2UgPSB0aGlzLl9wcm9ncmVzcy5nZXQoKS5tZXNzYWdlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5jb25maXJtUmVzdWx0cyAmJiAhcmVzdWx0Py50b29sUmVzdWx0RXJyb3IgJiYgcmVzdWx0Py5jb25maXJtUmVzdWx0cyAhPT0gZmFsc2UgJiYgIWZpbmFsKSB7XG5cdFx0XHRjb25zdCBhdXRvQXBwcm92ZWQgPSBhd2FpdCBjaGVja0lmUmVzdWx0QXV0b0FwcHJvdmVkPy4oKTtcblx0XHRcdGlmIChhdXRvQXBwcm92ZWQpIHtcblx0XHRcdFx0dGhpcy5fc2V0Q29tcGxldGVkKHJlc3VsdCwgYXV0b0FwcHJvdmVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLnNldCh7XG5cdFx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IElDaGF0VG9vbEludm9jYXRpb24uZXhlY3V0aW9uQ29uZmlybWVkT3JEZW5pZWQodGhpcykgfHwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRcdFx0cmVzdWx0RGV0YWlsczogcmVzdWx0Py50b29sUmVzdWx0RGV0YWlscyxcblx0XHRcdFx0XHRjb250ZW50Rm9yTW9kZWw6IHJlc3VsdD8uY29udGVudCB8fCBbXSxcblx0XHRcdFx0XHRjb25maXJtOiByZWFzb24gPT4gdGhpcy5fc2V0Q29tcGxldGVkKHJlc3VsdCwgcmVhc29uKSxcblx0XHRcdFx0XHRwYXJhbWV0ZXJzOiB0aGlzLnBhcmFtZXRlcnMsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3NldENvbXBsZXRlZChyZXN1bHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9zdGF0ZS5nZXQoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRBdXRoZW50aWNhdGlvblJlcXVpcmVkKHNlcnZlcjogSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkU2VydmVyLCBjYW5jZWw6ICgpID0+IHZvaWQgPSAoKSA9PiB7IH0pOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcgJiYgc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXRlLnNldCh7XG5cdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQXV0aGVudGljYXRpb24sXG5cdFx0XHRzZXJ2ZXIsXG5cdFx0XHRjYW5jZWwsXG5cdFx0XHRjb25maXJtZWQ6IHN0YXRlLmNvbmZpcm1lZCxcblx0XHRcdHBhcmFtZXRlcnM6IHN0YXRlLnBhcmFtZXRlcnMsXG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0fSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRBdXRoZW50aWNhdGlvblJlc29sdmVkKCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0Y29uZmlybWVkOiBzdGF0ZS5jb25maXJtZWQsXG5cdFx0XHRwcm9ncmVzczogdGhpcy5fcHJvZ3Jlc3MsXG5cdFx0XHRwYXJhbWV0ZXJzOiBzdGF0ZS5wYXJhbWV0ZXJzLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgYWNjZXB0UHJvZ3Jlc3Moc3RlcDogSVRvb2xQcm9ncmVzc1N0ZXApIHtcblx0XHRjb25zdCBwcmV2ID0gdGhpcy5fcHJvZ3Jlc3MuZ2V0KCk7XG5cdFx0dGhpcy5fcHJvZ3Jlc3Muc2V0KHtcblx0XHRcdHByb2dyZXNzOiBzdGVwLnByb2dyZXNzIHx8IHByZXYucHJvZ3Jlc3MgfHwgMCxcblx0XHRcdG1lc3NhZ2U6IHN0ZXAubWVzc2FnZSxcblx0XHR9LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljIHRvSlNPTigpOiBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCB7XG5cdFx0Ly8gcGVyc2lzdCB0aGUgc2VyaWFsaXplZCBjYWxsIGFzICdza2lwcGVkJyBpZiB3ZSB3ZXJlIHdhaXRpbmcgZm9yIHBvc3RhcHByb3ZhbFxuXHRcdGNvbnN0IHdhaXRpbmdGb3JQb3N0QXBwcm92YWwgPSB0aGlzLnN0YXRlLmdldCgpLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWw7XG5cdFx0Y29uc3QgZGV0YWlscyA9IHdhaXRpbmdGb3JQb3N0QXBwcm92YWwgPyB1bmRlZmluZWQgOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLnJlc3VsdERldGFpbHModGhpcyk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHRwcmVzZW50YXRpb246IHRoaXMucHJlc2VudGF0aW9uLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHRoaXMuaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiB0aGlzLnBhc3RUZW5zZU1lc3NhZ2UsXG5cdFx0XHRvcmlnaW5NZXNzYWdlOiB0aGlzLm9yaWdpbk1lc3NhZ2UsXG5cdFx0XHRpc0NvbmZpcm1lZDogd2FpdGluZ0ZvclBvc3RBcHByb3ZhbCA/IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlNraXBwZWQgfSA6IElDaGF0VG9vbEludm9jYXRpb24uZXhlY3V0aW9uQ29uZmlybWVkT3JEZW5pZWQodGhpcyksXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0c291cmNlOiB0aGlzLnNvdXJjZSxcblx0XHRcdHJlc3VsdERldGFpbHM6IGlzVG9vbFJlc3VsdE91dHB1dERldGFpbHMoZGV0YWlscylcblx0XHRcdFx0PyB7IG91dHB1dDogeyB0eXBlOiAnZGF0YScsIG1pbWVUeXBlOiBkZXRhaWxzLm91dHB1dC5taW1lVHlwZSwgYmFzZTY0RGF0YTogZW5jb2RlQmFzZTY0KGRldGFpbHMub3V0cHV0LnZhbHVlKSB9IH1cblx0XHRcdFx0OiBkZXRhaWxzLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogdGhpcy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnYXV0b21hdGlvbkNvbmZpZ3VyYXRpb24nID8gdW5kZWZpbmVkIDogdGhpcy50b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0dG9vbENhbGxJZDogdGhpcy50b29sQ2FsbElkLFxuXHRcdFx0dG9vbElkOiB0aGlzLnRvb2xJZCxcblx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0aGlzLnN1YkFnZW50SW52b2NhdGlvbklkLFxuXHRcdFx0Z2VuZXJhdGVkVGl0bGU6IHRoaXMuZ2VuZXJhdGVkVGl0bGUsXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxvQkFBb0I7QUFFN0IsU0FBMkMsdUJBQXVCO0FBQ2xFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTZXLHFCQUF3Rix1QkFBd0c7QUFDN2lCLFNBQWtDLGlDQUF1SDtBQVVsSixNQUFNLG1CQUFrRDtBQUFBLEVBMEQ5RCxZQUNDLG9CQUNBLFVBQ2dCLFlBQ2hCLHNCQUNBLFlBQ0EsZUFBNEwsQ0FBQyxHQUM3TCxlQUNDO0FBTGU7QUE1RGpCLFNBQWdCLE9BQXlCO0FBY3pDLFNBQU8sdUJBQWdDO0FBSXZDLFNBQWlCLHdCQUF3QixnQkFBb0MsTUFBTSxNQUFTO0FBQzVGLFNBQWdCLHVCQUF3RCxLQUFLO0FBVzdFLFNBQWlCLFlBQVksZ0JBQXNGLE1BQU0sRUFBRSxVQUFVLEVBQUUsQ0FBQztBQUl4STtBQUFBLFNBQWlCLGdCQUFnQixnQkFBeUIsTUFBTSxNQUFTO0FBQ3pFLFNBQWlCLG9CQUFvQixnQkFBc0QsTUFBTSxNQUFTO0FBZ0N6RyxRQUFJLGlCQUEyQztBQUMvQyxRQUFJLGFBQWEsa0JBQWtCO0FBQ2xDLHVCQUFpQixTQUFTO0FBQUEsSUFDM0IsV0FBVyxhQUFhLGtCQUFrQjtBQUN6Qyx1QkFBaUIsYUFBYSx1QkFBdUIsU0FBUyxxQkFBcUIseUJBQTJCLFNBQVMsV0FBVztBQUFBLElBQ25JO0FBQ0EsU0FBSyxvQkFBb0Isb0JBQW9CLHFCQUFxQjtBQUNsRSxTQUFLLG1CQUFtQixvQkFBb0I7QUFDNUMsU0FBSyxnQkFBZ0Isb0JBQW9CO0FBQ3pDLFNBQUssdUJBQXVCLG9CQUFvQjtBQUNoRCxTQUFLLGVBQWUsb0JBQW9CO0FBQ3hD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
