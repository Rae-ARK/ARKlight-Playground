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
import { timeout } from "../../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { appendEscapedMarkdownInlineCode, createCommandUri, isMarkdownString, MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { CommandsRegistry } from "../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { IChatWidgetService } from "../../../../chat/browser/chat.js";
import { IChatService } from "../../../../chat/common/chatService/chatService.js";
import { ToolDataSource } from "../../../../chat/common/tools/languageModelToolsService.js";
import { ITerminalChatService, ITerminalService } from "../../../../terminal/browser/terminal.js";
import { getOutput } from "../outputHelpers.js";
import { buildCommandDisplayText, isMultilineCommand, normalizeCommandForExecution } from "../runInTerminalHelpers.js";
import { RunInTerminalTool } from "./runInTerminalTool.js";
import { isSessionAutoApproveLevel } from "./terminalToolAutoApprove.js";
import { TerminalToolId } from "./toolIds.js";
const SendToTerminalToolData = {
  id: TerminalToolId.SendToTerminal,
  toolReferenceName: "sendToTerminal",
  displayName: localize("sendToTerminalTool.displayName", "Send to Terminal"),
  modelDescription: `Send input text to an active terminal execution (identified by the \`id\` returned from ${TerminalToolId.RunInTerminal}). The 'command' field may be empty or whitespace to press Enter (useful for interactive prompts). By default, returns the last 20 lines of terminal output captured shortly after sending. Set 'waitForOutput' to true for interactive programs (games, REPLs, etc.) to wait until the terminal becomes idle before returning output \u2014 this gives you the program's response to your input.`,
  icon: Codicon.terminal,
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: `The ID of an active terminal execution to send a command to (returned by ${TerminalToolId.RunInTerminal} for async executions, or for sync executions that timed out and were moved to the background).`,
        pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
      },
      command: {
        type: "string",
        description: "The input text to send to the terminal. The text is sent followed by Enter. Provide an empty or whitespace string to send just Enter (for interactive prompts)."
      },
      waitForOutput: {
        type: "boolean",
        description: "When true, waits for the terminal to become idle (no new output for a short period) before returning, instead of returning immediately. Use this for interactive programs where you need to see the full response to your input. Defaults to false."
      }
    },
    required: [
      "id",
      "command"
    ]
  }
};
function isCancelSignal(command) {
  return /^[\u0003\u0004\u001c]$/.test(command.trim());
}
const FocusTerminalByIdCommandId = "workbench.action.terminal.chat.focusTerminalById";
CommandsRegistry.registerCommand(FocusTerminalByIdCommandId, async (accessor, instanceId) => {
  const terminalService = accessor.get(ITerminalService);
  const instance = terminalService.getInstanceFromId(instanceId);
  if (instance) {
    terminalService.setActiveInstance(instance);
    await terminalService.revealActiveTerminal();
    instance.focus();
  }
});
const FocusTerminalByExecutionIdCommandId = "workbench.action.terminal.chat.focusTerminalByExecutionId";
CommandsRegistry.registerCommand(FocusTerminalByExecutionIdCommandId, async (accessor, executionId) => {
  const execution = RunInTerminalTool.getExecution(executionId);
  if (execution) {
    const terminalService = accessor.get(ITerminalService);
    terminalService.setActiveInstance(execution.instance);
    await terminalService.revealActiveTerminal();
    execution.instance.focus();
  }
});
let SendToTerminalTool = class extends Disposable {
  constructor(_configurationService, _chatService, _chatWidgetService, _terminalChatService) {
    super();
    this._configurationService = _configurationService;
    this._chatService = _chatService;
    this._chatWidgetService = _chatWidgetService;
    this._terminalChatService = _terminalChatService;
  }
  async prepareToolInvocation(context, _token) {
    const args = context.parameters;
    const isEmptyInput = !args.command || !args.command.trim();
    const terminalLabel = this._getTerminalLabel(args);
    const invocationMessage = new MarkdownString();
    const pastTenseMessage = new MarkdownString();
    const questionText = this._getQuestionContextForTerminal(context.chatSessionResource, args);
    if (isEmptyInput) {
      invocationMessage.appendMarkdown(localize("send.progressive.enter", "Pressing `Enter` in terminal"));
      pastTenseMessage.appendMarkdown(localize("send.past.enter", "Pressed `Enter` in terminal"));
    } else {
      const displayCommand = buildCommandDisplayText(args.command);
      const safeInlineCode = appendEscapedMarkdownInlineCode(displayCommand);
      invocationMessage.appendMarkdown(localize("send.progressive", "Sending {0} to terminal", safeInlineCode));
      pastTenseMessage.appendMarkdown(localize("send.past", "Sent {0} to terminal", safeInlineCode));
    }
    if (questionText) {
      const replyPrefix = ` (${localize("send.replyingTo", "replying to: ")}`;
      invocationMessage.appendMarkdown(replyPrefix);
      invocationMessage.appendText(questionText);
      invocationMessage.appendMarkdown(")");
      pastTenseMessage.appendMarkdown(replyPrefix);
      pastTenseMessage.appendText(questionText);
      pastTenseMessage.appendMarkdown(")");
    }
    const instanceId = this._getTerminalInstanceId(args);
    const confirmationMessage = new MarkdownString("", { isTrusted: { enabledCommands: [FocusTerminalByIdCommandId] } });
    const safeTerminalLabel = appendEscapedMarkdownInlineCode(terminalLabel);
    const baseMessage = isEmptyInput ? localize("send.confirm.message.enter", "Press `Enter` in terminal {0}", safeTerminalLabel) : localize("send.confirm.message", "Run {0} in terminal {1}", appendEscapedMarkdownInlineCode(buildCommandDisplayText(args.command)), safeTerminalLabel);
    if (instanceId !== void 0) {
      const focusUri = createCommandUri(FocusTerminalByIdCommandId, instanceId);
      confirmationMessage.appendMarkdown(`${baseMessage} \u2014 [${localize("focusTerminal", "Focus Terminal")}](${focusUri})`);
    } else {
      confirmationMessage.appendMarkdown(baseMessage);
    }
    const chatSessionResource = context.chatSessionResource;
    const isSessionAutoApproved = chatSessionResource && (isSessionAutoApproveLevel(chatSessionResource, this._configurationService, this._chatWidgetService, this._chatService) || this._terminalChatService.hasChatSessionAutoApproval(chatSessionResource));
    const isAnsweringQuestion = questionText !== void 0;
    const shouldShowConfirmation = !isSessionAutoApproved && !isAnsweringQuestion || context.forceConfirmationReason !== void 0;
    const confirmationMessages = shouldShowConfirmation ? {
      title: localize("send.confirm.title", "Send to Terminal"),
      message: confirmationMessage,
      allowAutoConfirm: void 0
    } : void 0;
    return {
      invocationMessage,
      pastTenseMessage,
      confirmationMessages
    };
  }
  /**
   * Returns a human-friendly label for the target terminal, using the
   * terminal instance title (which reflects the running process) instead
   * of the raw UUID or numeric id.
   */
  _getTerminalLabel(args) {
    if (args.id) {
      const execution = RunInTerminalTool.getExecution(args.id);
      if (execution) {
        return execution.instance.title;
      }
    }
    return args.id ?? "";
  }
  /**
   * Returns the numeric terminal instanceId for the target terminal, used
   * to build command URIs for the "Focus Terminal" link.
   */
  _getTerminalInstanceId(args) {
    if (args.id) {
      const execution = RunInTerminalTool.getExecution(args.id);
      if (execution) {
        return execution.instance.instanceId;
      }
    }
    return void 0;
  }
  /**
   * Searches the current session's responses for the most recent question
   * carousel associated with the target terminal, then uses positional
   * matching to return the specific question that this send_to_terminal
   * call is answering.
   *
   * When a carousel contains multiple questions, the model calls
   * send_to_terminal once per answer in order. This method counts prior
   * send_to_terminal invocations since the carousel to determine the
   * current question index, then verifies the command matches the answer
   * at that position.
   */
  _getQuestionContextForTerminal(chatSessionResource, args) {
    if (!chatSessionResource) {
      return void 0;
    }
    const model = this._chatService.getSession(chatSessionResource);
    if (!model) {
      return void 0;
    }
    if (!args.id) {
      return void 0;
    }
    const commandText = args.command?.trim();
    const requests = model.getRequests();
    for (let i = requests.length - 1; i >= 0; i--) {
      const response = requests[i].response;
      if (!response) {
        continue;
      }
      const parts = response.response.value;
      let carouselIndex = -1;
      let carousel;
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j];
        if (part.kind === "questionCarousel") {
          const candidate = part;
          if (!candidate.terminalId || candidate.questions.length === 0) {
            continue;
          }
          if (candidate.terminalId === args.id) {
            carouselIndex = j;
            carousel = candidate;
            break;
          }
        }
      }
      if (!carousel || carouselIndex === -1) {
        continue;
      }
      let sendCount = 0;
      for (let j = carouselIndex + 1; j < parts.length; j++) {
        if (parts[j].kind === "toolInvocation" && parts[j].toolId === TerminalToolId.SendToTerminal) {
          sendCount++;
        }
      }
      const questionIndex = sendCount;
      if (questionIndex >= carousel.questions.length) {
        return void 0;
      }
      const question = carousel.questions[questionIndex];
      if (carousel.data) {
        const answer = carousel.data[question.id];
        if (this._answerMatchesCommand(answer, commandText)) {
          return this._getQuestionText(question);
        }
      }
      return void 0;
    }
    return void 0;
  }
  _getQuestionText(question) {
    const text = question.message ?? question.title;
    return isMarkdownString(text) ? text.value : text;
  }
  /**
   * Checks whether a carousel answer value matches the command text being sent.
   * An empty/unprovided answer matches an empty command (i.e. pressing Enter to
   * accept the default), since that is the expected way to skip a question.
   */
  _answerMatchesCommand(answer, commandText) {
    if (answer === void 0) {
      return commandText === "";
    }
    if (typeof answer === "string") {
      return answer.trim() === commandText;
    }
    if (hasKey(answer, { selectedValues: true })) {
      const multi = answer;
      if (multi.selectedValues.some((v) => v.trim() === commandText)) {
        return true;
      }
      if (multi.freeformValue?.trim() === commandText) {
        return true;
      }
      return commandText === "" && multi.selectedValues.length === 0 && !multi.freeformValue?.trim();
    }
    if (hasKey(answer, { selectedValue: true })) {
      const single = answer;
      if (single.selectedValue?.trim() === commandText || single.freeformValue?.trim() === commandText) {
        return true;
      }
      return commandText === "" && !single.selectedValue?.trim() && !single.freeformValue?.trim();
    }
    return false;
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const args = invocation.parameters;
    if (!args.id) {
      return {
        content: [{
          kind: "text",
          value: `Error: 'id' (the active terminal execution UUID returned by ${TerminalToolId.RunInTerminal}) must be provided.`
        }]
      };
    }
    const execution = RunInTerminalTool.getExecution(args.id);
    if (!execution) {
      return {
        content: [{
          kind: "text",
          value: `Error: No active terminal execution found with ID ${args.id}. The terminal may have already been killed or the ID is invalid. The ID must be the exact value returned by ${TerminalToolId.RunInTerminal}.`
        }]
      };
    }
    const startMarker = execution.instance.registerMarker?.();
    if (isMultilineCommand(args.command)) {
      await execution.instance.sendText(args.command, true, true);
    } else {
      await execution.instance.sendText(normalizeCommandForExecution(args.command), true);
    }
    let recentOutput;
    if (args.waitForOutput) {
      recentOutput = await this._waitForIdleOutput(execution, startMarker, token);
    } else {
      await timeout(2e3, token);
      recentOutput = getOutput(execution.instance, startMarker ?? void 0, { lastNLines: 20 });
    }
    const steering = isCancelSignal(args.command) ? `

Note: The input you sent was a cancel signal (Ctrl-C / Ctrl-D / Ctrl-\\). The previously running command was interrupted, not completed. This is not a signal to end the turn \u2014 if you intend to run a recovery or follow-up command, issue it now in this same turn. Call ${TerminalToolId.GetTerminalOutput} first if you need to verify the shell is back at a prompt.` : "";
    return {
      content: [{
        kind: "text",
        value: `Successfully sent command to terminal ${args.id}.${recentOutput ? `

Terminal output:
${recentOutput}` : ""}${steering}`
      }]
    };
  }
  /**
   * Waits for the terminal to become idle (no new output for a sustained period)
   * and returns the output produced since the given marker.
   */
  async _waitForIdleOutput(execution, startMarker, token) {
    const maxWaitMs = 3e4;
    const idleThresholdMs = 2e3;
    const pollIntervalMs = 500;
    let waited = 0;
    let lastDataTime = Date.now();
    const cts = new CancellationTokenSource(token);
    const dataListener = execution.instance.onData(() => {
      lastDataTime = Date.now();
    });
    try {
      while (!cts.token.isCancellationRequested && waited < maxWaitMs) {
        await timeout(pollIntervalMs, cts.token);
        waited += pollIntervalMs;
        const timeSinceLastData = Date.now() - lastDataTime;
        if (timeSinceLastData >= idleThresholdMs) {
          break;
        }
      }
    } finally {
      dataListener.dispose();
      cts.dispose();
    }
    return getOutput(execution.instance, startMarker ?? void 0);
  }
};
SendToTerminalTool = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IChatService),
  __decorateParam(2, IChatWidgetService),
  __decorateParam(3, ITerminalChatService)
], SendToTerminalTool);
export {
  SendToTerminalTool,
  SendToTerminalToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL3NlbmRUb1Rlcm1pbmFsVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUsIGNyZWF0ZUNvbW1hbmRVcmksIGlzTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlLCBJQ2hhdE11bHRpU2VsZWN0QW5zd2VyLCBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWUsIElDaGF0UXVlc3Rpb25DYXJvdXNlbCwgSUNoYXRTaW5nbGVTZWxlY3RBbnN3ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUb29sRGF0YVNvdXJjZSwgdHlwZSBDb3VudFRva2Vuc0NhbGxiYWNrLCB0eXBlIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sRGF0YSwgdHlwZSBJVG9vbEltcGwsIHR5cGUgSVRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdHlwZSBJVG9vbFJlc3VsdCwgdHlwZSBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDaGF0U2VydmljZSwgSVRlcm1pbmFsSW5zdGFuY2UsIElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGdldE91dHB1dCB9IGZyb20gJy4uL291dHB1dEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgYnVpbGRDb21tYW5kRGlzcGxheVRleHQsIGlzTXVsdGlsaW5lQ29tbWFuZCwgbm9ybWFsaXplQ29tbWFuZEZvckV4ZWN1dGlvbiB9IGZyb20gJy4uL3J1bkluVGVybWluYWxIZWxwZXJzLmpzJztcbmltcG9ydCB7IFJ1bkluVGVybWluYWxUb29sIH0gZnJvbSAnLi9ydW5JblRlcm1pbmFsVG9vbC5qcyc7XG5pbXBvcnQgeyBpc1Nlc3Npb25BdXRvQXBwcm92ZUxldmVsIH0gZnJvbSAnLi90ZXJtaW5hbFRvb2xBdXRvQXBwcm92ZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFRvb2xJZCB9IGZyb20gJy4vdG9vbElkcy5qcyc7XG5cbmV4cG9ydCBjb25zdCBTZW5kVG9UZXJtaW5hbFRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdGlkOiBUZXJtaW5hbFRvb2xJZC5TZW5kVG9UZXJtaW5hbCxcblx0dG9vbFJlZmVyZW5jZU5hbWU6ICdzZW5kVG9UZXJtaW5hbCcsXG5cdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgnc2VuZFRvVGVybWluYWxUb29sLmRpc3BsYXlOYW1lJywgJ1NlbmQgdG8gVGVybWluYWwnKSxcblx0bW9kZWxEZXNjcmlwdGlvbjogYFNlbmQgaW5wdXQgdGV4dCB0byBhbiBhY3RpdmUgdGVybWluYWwgZXhlY3V0aW9uIChpZGVudGlmaWVkIGJ5IHRoZSBcXGBpZFxcYCByZXR1cm5lZCBmcm9tICR7VGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbH0pLiBUaGUgJ2NvbW1hbmQnIGZpZWxkIG1heSBiZSBlbXB0eSBvciB3aGl0ZXNwYWNlIHRvIHByZXNzIEVudGVyICh1c2VmdWwgZm9yIGludGVyYWN0aXZlIHByb21wdHMpLiBCeSBkZWZhdWx0LCByZXR1cm5zIHRoZSBsYXN0IDIwIGxpbmVzIG9mIHRlcm1pbmFsIG91dHB1dCBjYXB0dXJlZCBzaG9ydGx5IGFmdGVyIHNlbmRpbmcuIFNldCAnd2FpdEZvck91dHB1dCcgdG8gdHJ1ZSBmb3IgaW50ZXJhY3RpdmUgcHJvZ3JhbXMgKGdhbWVzLCBSRVBMcywgZXRjLikgdG8gd2FpdCB1bnRpbCB0aGUgdGVybWluYWwgYmVjb21lcyBpZGxlIGJlZm9yZSByZXR1cm5pbmcgb3V0cHV0IFx1MjAxNCB0aGlzIGdpdmVzIHlvdSB0aGUgcHJvZ3JhbSdzIHJlc3BvbnNlIHRvIHlvdXIgaW5wdXQuYCxcblx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbCxcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0aW5wdXRTY2hlbWE6IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRpZDoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGBUaGUgSUQgb2YgYW4gYWN0aXZlIHRlcm1pbmFsIGV4ZWN1dGlvbiB0byBzZW5kIGEgY29tbWFuZCB0byAocmV0dXJuZWQgYnkgJHtUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsfSBmb3IgYXN5bmMgZXhlY3V0aW9ucywgb3IgZm9yIHN5bmMgZXhlY3V0aW9ucyB0aGF0IHRpbWVkIG91dCBhbmQgd2VyZSBtb3ZlZCB0byB0aGUgYmFja2dyb3VuZCkuYCxcblx0XHRcdFx0cGF0dGVybjogJ15bMC05YS1mQS1GXXs4fS1bMC05YS1mQS1GXXs0fS1bMS01XVswLTlhLWZBLUZdezN9LVs4OWFiQUJdWzAtOWEtZkEtRl17M30tWzAtOWEtZkEtRl17MTJ9JCdcblx0XHRcdH0sXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBpbnB1dCB0ZXh0IHRvIHNlbmQgdG8gdGhlIHRlcm1pbmFsLiBUaGUgdGV4dCBpcyBzZW50IGZvbGxvd2VkIGJ5IEVudGVyLiBQcm92aWRlIGFuIGVtcHR5IG9yIHdoaXRlc3BhY2Ugc3RyaW5nIHRvIHNlbmQganVzdCBFbnRlciAoZm9yIGludGVyYWN0aXZlIHByb21wdHMpLidcblx0XHRcdH0sXG5cdFx0XHR3YWl0Rm9yT3V0cHV0OiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdXaGVuIHRydWUsIHdhaXRzIGZvciB0aGUgdGVybWluYWwgdG8gYmVjb21lIGlkbGUgKG5vIG5ldyBvdXRwdXQgZm9yIGEgc2hvcnQgcGVyaW9kKSBiZWZvcmUgcmV0dXJuaW5nLCBpbnN0ZWFkIG9mIHJldHVybmluZyBpbW1lZGlhdGVseS4gVXNlIHRoaXMgZm9yIGludGVyYWN0aXZlIHByb2dyYW1zIHdoZXJlIHlvdSBuZWVkIHRvIHNlZSB0aGUgZnVsbCByZXNwb25zZSB0byB5b3VyIGlucHV0LiBEZWZhdWx0cyB0byBmYWxzZS4nXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0cmVxdWlyZWQ6IFtcblx0XHRcdCdpZCcsXG5cdFx0XHQnY29tbWFuZCcsXG5cdFx0XVxuXHR9XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZW5kVG9UZXJtaW5hbElucHV0UGFyYW1zIHtcblx0aWQ6IHN0cmluZztcblx0Y29tbWFuZDogc3RyaW5nO1xuXHR3YWl0Rm9yT3V0cHV0PzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBDYW5jZWwvRU9GIHNpZ25hbHM6IEN0cmwtQyAoRVRYLCAweDAzKSwgQ3RybC1EIChFT1QsIDB4MDQpLCBDdHJsLVxcIChGUywgMHgxYykuXG4gKiBXaGVuIHNlbnQgb24gdGhlaXIgb3duIHRoZXNlIGludGVycnVwdCBvciBjbG9zZSB0aGUgZm9yZWdyb3VuZCBwcm9jZXNzIHJhdGhlclxuICogdGhhbiBjb21wbGV0aW5nIGl0LCBzbyB0aGUgbW9kZWwgbmVlZHMgYW4gZXh0cmEgbnVkZ2UgdGhhdCB0aGUgdHVybiBpcyBub3QgZG9uZS5cbiAqL1xuZnVuY3Rpb24gaXNDYW5jZWxTaWduYWwoY29tbWFuZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvXltcXHUwMDAzXFx1MDAwNFxcdTAwMWNdJC8udGVzdChjb21tYW5kLnRyaW0oKSk7XG59XG5cbmNvbnN0IEZvY3VzVGVybWluYWxCeUlkQ29tbWFuZElkID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2hhdC5mb2N1c1Rlcm1pbmFsQnlJZCc7XG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChGb2N1c1Rlcm1pbmFsQnlJZENvbW1hbmRJZCwgYXN5bmMgKGFjY2Vzc29yLCBpbnN0YW5jZUlkOiBudW1iZXIpID0+IHtcblx0Y29uc3QgdGVybWluYWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXJtaW5hbFNlcnZpY2UpO1xuXHRjb25zdCBpbnN0YW5jZSA9IHRlcm1pbmFsU2VydmljZS5nZXRJbnN0YW5jZUZyb21JZChpbnN0YW5jZUlkKTtcblx0aWYgKGluc3RhbmNlKSB7XG5cdFx0dGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRhd2FpdCB0ZXJtaW5hbFNlcnZpY2UucmV2ZWFsQWN0aXZlVGVybWluYWwoKTtcblx0XHRpbnN0YW5jZS5mb2N1cygpO1xuXHR9XG59KTtcblxuY29uc3QgRm9jdXNUZXJtaW5hbEJ5RXhlY3V0aW9uSWRDb21tYW5kSWQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGF0LmZvY3VzVGVybWluYWxCeUV4ZWN1dGlvbklkJztcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKEZvY3VzVGVybWluYWxCeUV4ZWN1dGlvbklkQ29tbWFuZElkLCBhc3luYyAoYWNjZXNzb3IsIGV4ZWN1dGlvbklkOiBzdHJpbmcpID0+IHtcblx0Y29uc3QgZXhlY3V0aW9uID0gUnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uKGV4ZWN1dGlvbklkKTtcblx0aWYgKGV4ZWN1dGlvbikge1xuXHRcdGNvbnN0IHRlcm1pbmFsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVybWluYWxTZXJ2aWNlKTtcblx0XHR0ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UoZXhlY3V0aW9uLmluc3RhbmNlKTtcblx0XHRhd2FpdCB0ZXJtaW5hbFNlcnZpY2UucmV2ZWFsQWN0aXZlVGVybWluYWwoKTtcblx0XHRleGVjdXRpb24uaW5zdGFuY2UuZm9jdXMoKTtcblx0fVxufSk7XG5cbmV4cG9ydCBjbGFzcyBTZW5kVG9UZXJtaW5hbFRvb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASVRlcm1pbmFsQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDaGF0U2VydmljZTogSVRlcm1pbmFsQ2hhdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFyZ3MgPSBjb250ZXh0LnBhcmFtZXRlcnMgYXMgSVNlbmRUb1Rlcm1pbmFsSW5wdXRQYXJhbXM7XG5cdFx0Y29uc3QgaXNFbXB0eUlucHV0ID0gIWFyZ3MuY29tbWFuZCB8fCAhYXJncy5jb21tYW5kLnRyaW0oKTtcblxuXHRcdC8vIFJlc29sdmUgYSBodW1hbi1mcmllbmRseSB0ZXJtaW5hbCBsYWJlbCBmcm9tIHRoZSBpbnN0YW5jZSB0aXRsZVxuXHRcdGNvbnN0IHRlcm1pbmFsTGFiZWwgPSB0aGlzLl9nZXRUZXJtaW5hbExhYmVsKGFyZ3MpO1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbk1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcoKTtcblx0XHRjb25zdCBwYXN0VGVuc2VNZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cblx0XHQvLyBMb29rIGZvciB0aGUgcXVlc3Rpb24gdGhhdCBwcm9tcHRlZCB0aGlzIHNlbmRfdG9fdGVybWluYWwgY2FsbFxuXHRcdGNvbnN0IHF1ZXN0aW9uVGV4dCA9IHRoaXMuX2dldFF1ZXN0aW9uQ29udGV4dEZvclRlcm1pbmFsKGNvbnRleHQuY2hhdFNlc3Npb25SZXNvdXJjZSwgYXJncyk7XG5cblx0XHRpZiAoaXNFbXB0eUlucHV0KSB7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZS5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnc2VuZC5wcm9ncmVzc2l2ZS5lbnRlcicsIFwiUHJlc3NpbmcgYEVudGVyYCBpbiB0ZXJtaW5hbFwiKSk7XG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdzZW5kLnBhc3QuZW50ZXInLCBcIlByZXNzZWQgYEVudGVyYCBpbiB0ZXJtaW5hbFwiKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGRpc3BsYXlDb21tYW5kID0gYnVpbGRDb21tYW5kRGlzcGxheVRleHQoYXJncy5jb21tYW5kKTtcblx0XHRcdGNvbnN0IHNhZmVJbmxpbmVDb2RlID0gYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZShkaXNwbGF5Q29tbWFuZCk7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZS5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnc2VuZC5wcm9ncmVzc2l2ZScsIFwiU2VuZGluZyB7MH0gdG8gdGVybWluYWxcIiwgc2FmZUlubGluZUNvZGUpKTtcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ3NlbmQucGFzdCcsIFwiU2VudCB7MH0gdG8gdGVybWluYWxcIiwgc2FmZUlubGluZUNvZGUpKTtcblx0XHR9XG5cblx0XHRpZiAocXVlc3Rpb25UZXh0KSB7XG5cdFx0XHRjb25zdCByZXBseVByZWZpeCA9IGAgKCR7bG9jYWxpemUoJ3NlbmQucmVwbHlpbmdUbycsIFwicmVwbHlpbmcgdG86IFwiKX1gO1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UuYXBwZW5kTWFya2Rvd24ocmVwbHlQcmVmaXgpO1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UuYXBwZW5kVGV4dChxdWVzdGlvblRleHQpO1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UuYXBwZW5kTWFya2Rvd24oJyknKTtcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24ocmVwbHlQcmVmaXgpO1xuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZS5hcHBlbmRUZXh0KHF1ZXN0aW9uVGV4dCk7XG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlLmFwcGVuZE1hcmtkb3duKCcpJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQgdGhlIGNvbmZpcm1hdGlvbiBtZXNzYWdlIHdpdGggYSBcIkZvY3VzIFRlcm1pbmFsXCIgY29tbWFuZCBsaW5rXG5cdFx0Y29uc3QgaW5zdGFuY2VJZCA9IHRoaXMuX2dldFRlcm1pbmFsSW5zdGFuY2VJZChhcmdzKTtcblx0XHRjb25zdCBjb25maXJtYXRpb25NZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IGlzVHJ1c3RlZDogeyBlbmFibGVkQ29tbWFuZHM6IFtGb2N1c1Rlcm1pbmFsQnlJZENvbW1hbmRJZF0gfSB9KTtcblx0XHRjb25zdCBzYWZlVGVybWluYWxMYWJlbCA9IGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUodGVybWluYWxMYWJlbCk7XG5cdFx0Y29uc3QgYmFzZU1lc3NhZ2UgPSBpc0VtcHR5SW5wdXRcblx0XHRcdD8gbG9jYWxpemUoJ3NlbmQuY29uZmlybS5tZXNzYWdlLmVudGVyJywgXCJQcmVzcyBgRW50ZXJgIGluIHRlcm1pbmFsIHswfVwiLCBzYWZlVGVybWluYWxMYWJlbClcblx0XHRcdDogbG9jYWxpemUoJ3NlbmQuY29uZmlybS5tZXNzYWdlJywgXCJSdW4gezB9IGluIHRlcm1pbmFsIHsxfVwiLCBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKGJ1aWxkQ29tbWFuZERpc3BsYXlUZXh0KGFyZ3MuY29tbWFuZCkpLCBzYWZlVGVybWluYWxMYWJlbCk7XG5cdFx0aWYgKGluc3RhbmNlSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgZm9jdXNVcmkgPSBjcmVhdGVDb21tYW5kVXJpKEZvY3VzVGVybWluYWxCeUlkQ29tbWFuZElkLCBpbnN0YW5jZUlkKTtcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2UuYXBwZW5kTWFya2Rvd24oYCR7YmFzZU1lc3NhZ2V9IFx1MjAxNCBbJHtsb2NhbGl6ZSgnZm9jdXNUZXJtaW5hbCcsIFwiRm9jdXMgVGVybWluYWxcIil9XSgke2ZvY3VzVXJpfSlgKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZS5hcHBlbmRNYXJrZG93bihiYXNlTWVzc2FnZSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGV0ZXJtaW5lIGF1dG8tYXBwcm92YWwsIGFsaWduZWQgd2l0aCBydW5JblRlcm1pbmFsXG5cdFx0Y29uc3QgY2hhdFNlc3Npb25SZXNvdXJjZSA9IGNvbnRleHQuY2hhdFNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCBpc1Nlc3Npb25BdXRvQXBwcm92ZWQgPSBjaGF0U2Vzc2lvblJlc291cmNlICYmIChcblx0XHRcdGlzU2Vzc2lvbkF1dG9BcHByb3ZlTGV2ZWwoY2hhdFNlc3Npb25SZXNvdXJjZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLCB0aGlzLl9jaGF0U2VydmljZSkgfHxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuaGFzQ2hhdFNlc3Npb25BdXRvQXBwcm92YWwoY2hhdFNlc3Npb25SZXNvdXJjZSlcblx0XHQpO1xuXG5cdFx0Ly8gc2VuZF90b190ZXJtaW5hbCBub3JtYWxseSByZXF1aXJlcyBjb25maXJtYXRpb24gaW4gZGVmYXVsdCBhcHByb3ZhbHMgbW9kZVxuXHRcdC8vIGJlY2F1c2UgdGhlIHRleHQgbWF5IGJlIGFyYml0cmFyeSBpbnB1dCAocGFzc3dvcmRzLCBjb25maXJtYXRpb25zLCBldGMuKVxuXHRcdC8vIHRoYXQgdGhlIGNvbW1hbmQtbGluZSBhdXRvLWFwcHJvdmUgYW5hbHl6ZXIgY2Fubm90IGFzc2Vzcy4gSG93ZXZlciwgd2hlblxuXHRcdC8vIHRoZSB0ZXh0IGJlaW5nIHNlbnQgd2FzIGp1c3QgY29sbGVjdGVkIHZpYSBhc2tRdWVzdGlvbnMgZm9yIHRoZSBzYW1lXG5cdFx0Ly8gdGVybWluYWwsIHRoZSB1c2VyIGFscmVhZHkgZXhwbGljaXRseSBwcm92aWRlZCB0aGUgYW5zd2VyIHNvIGEgc2Vjb25kXG5cdFx0Ly8gY29uZmlybWF0aW9uIGlzIHJlZHVuZGFudC5cblx0XHRjb25zdCBpc0Fuc3dlcmluZ1F1ZXN0aW9uID0gcXVlc3Rpb25UZXh0ICE9PSB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0NvbmZpcm1hdGlvbiA9ICghaXNTZXNzaW9uQXV0b0FwcHJvdmVkICYmICFpc0Fuc3dlcmluZ1F1ZXN0aW9uKSB8fCBjb250ZXh0LmZvcmNlQ29uZmlybWF0aW9uUmVhc29uICE9PSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uTWVzc2FnZXMgPSBzaG91bGRTaG93Q29uZmlybWF0aW9uID8ge1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZW5kLmNvbmZpcm0udGl0bGUnLCBcIlNlbmQgdG8gVGVybWluYWxcIiksXG5cdFx0XHRtZXNzYWdlOiBjb25maXJtYXRpb25NZXNzYWdlLFxuXHRcdFx0YWxsb3dBdXRvQ29uZmlybTogdW5kZWZpbmVkLFxuXHRcdH0gOiB1bmRlZmluZWQ7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgaHVtYW4tZnJpZW5kbHkgbGFiZWwgZm9yIHRoZSB0YXJnZXQgdGVybWluYWwsIHVzaW5nIHRoZVxuXHQgKiB0ZXJtaW5hbCBpbnN0YW5jZSB0aXRsZSAod2hpY2ggcmVmbGVjdHMgdGhlIHJ1bm5pbmcgcHJvY2VzcykgaW5zdGVhZFxuXHQgKiBvZiB0aGUgcmF3IFVVSUQgb3IgbnVtZXJpYyBpZC5cblx0ICovXG5cdHByaXZhdGUgX2dldFRlcm1pbmFsTGFiZWwoYXJnczogSVNlbmRUb1Rlcm1pbmFsSW5wdXRQYXJhbXMpOiBzdHJpbmcge1xuXHRcdGlmIChhcmdzLmlkKSB7XG5cdFx0XHRjb25zdCBleGVjdXRpb24gPSBSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24oYXJncy5pZCk7XG5cdFx0XHRpZiAoZXhlY3V0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBleGVjdXRpb24uaW5zdGFuY2UudGl0bGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBhcmdzLmlkID8/ICcnO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIG51bWVyaWMgdGVybWluYWwgaW5zdGFuY2VJZCBmb3IgdGhlIHRhcmdldCB0ZXJtaW5hbCwgdXNlZFxuXHQgKiB0byBidWlsZCBjb21tYW5kIFVSSXMgZm9yIHRoZSBcIkZvY3VzIFRlcm1pbmFsXCIgbGluay5cblx0ICovXG5cdHByaXZhdGUgX2dldFRlcm1pbmFsSW5zdGFuY2VJZChhcmdzOiBJU2VuZFRvVGVybWluYWxJbnB1dFBhcmFtcyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGFyZ3MuaWQpIHtcblx0XHRcdGNvbnN0IGV4ZWN1dGlvbiA9IFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbihhcmdzLmlkKTtcblx0XHRcdGlmIChleGVjdXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIGV4ZWN1dGlvbi5pbnN0YW5jZS5pbnN0YW5jZUlkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlYXJjaGVzIHRoZSBjdXJyZW50IHNlc3Npb24ncyByZXNwb25zZXMgZm9yIHRoZSBtb3N0IHJlY2VudCBxdWVzdGlvblxuXHQgKiBjYXJvdXNlbCBhc3NvY2lhdGVkIHdpdGggdGhlIHRhcmdldCB0ZXJtaW5hbCwgdGhlbiB1c2VzIHBvc2l0aW9uYWxcblx0ICogbWF0Y2hpbmcgdG8gcmV0dXJuIHRoZSBzcGVjaWZpYyBxdWVzdGlvbiB0aGF0IHRoaXMgc2VuZF90b190ZXJtaW5hbFxuXHQgKiBjYWxsIGlzIGFuc3dlcmluZy5cblx0ICpcblx0ICogV2hlbiBhIGNhcm91c2VsIGNvbnRhaW5zIG11bHRpcGxlIHF1ZXN0aW9ucywgdGhlIG1vZGVsIGNhbGxzXG5cdCAqIHNlbmRfdG9fdGVybWluYWwgb25jZSBwZXIgYW5zd2VyIGluIG9yZGVyLiBUaGlzIG1ldGhvZCBjb3VudHMgcHJpb3Jcblx0ICogc2VuZF90b190ZXJtaW5hbCBpbnZvY2F0aW9ucyBzaW5jZSB0aGUgY2Fyb3VzZWwgdG8gZGV0ZXJtaW5lIHRoZVxuXHQgKiBjdXJyZW50IHF1ZXN0aW9uIGluZGV4LCB0aGVuIHZlcmlmaWVzIHRoZSBjb21tYW5kIG1hdGNoZXMgdGhlIGFuc3dlclxuXHQgKiBhdCB0aGF0IHBvc2l0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0UXVlc3Rpb25Db250ZXh0Rm9yVGVybWluYWwoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBhcmdzOiBJU2VuZFRvVGVybWluYWxJbnB1dFBhcmFtcyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFjaGF0U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgdGhlIHRlcm1pbmFsIElEIHRoYXQgd2lsbCBtYXRjaCB0aGUgY2Fyb3VzZWwncyB0ZXJtaW5hbElkXG5cdFx0aWYgKCFhcmdzLmlkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmRUZXh0ID0gYXJncy5jb21tYW5kPy50cmltKCk7XG5cblx0XHQvLyBXYWxrIHJlcXVlc3RzIGluIHJldmVyc2UgdG8gZmluZCB0aGUgbW9zdCByZWNlbnQgY2Fyb3VzZWwgZm9yIHRoaXMgdGVybWluYWxcblx0XHRjb25zdCByZXF1ZXN0cyA9IG1vZGVsLmdldFJlcXVlc3RzKCk7XG5cdFx0Zm9yIChsZXQgaSA9IHJlcXVlc3RzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IHJlcXVlc3RzW2ldLnJlc3BvbnNlO1xuXHRcdFx0aWYgKCFyZXNwb25zZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcnRzID0gcmVzcG9uc2UucmVzcG9uc2UudmFsdWU7XG5cblx0XHRcdC8vIEZpcnN0LCBmaW5kIHRoZSBjYXJvdXNlbCBmb3IgdGhpcyB0ZXJtaW5hbCAoc2VhcmNoaW5nIGJhY2t3YXJkcylcblx0XHRcdGxldCBjYXJvdXNlbEluZGV4ID0gLTE7XG5cdFx0XHRsZXQgY2Fyb3VzZWw6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCB8IHVuZGVmaW5lZDtcblx0XHRcdGZvciAobGV0IGogPSBwYXJ0cy5sZW5ndGggLSAxOyBqID49IDA7IGotLSkge1xuXHRcdFx0XHRjb25zdCBwYXJ0ID0gcGFydHNbal07XG5cdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJykge1xuXHRcdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHBhcnQgYXMgSUNoYXRRdWVzdGlvbkNhcm91c2VsO1xuXHRcdFx0XHRcdGlmICghY2FuZGlkYXRlLnRlcm1pbmFsSWQgfHwgY2FuZGlkYXRlLnF1ZXN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoY2FuZGlkYXRlLnRlcm1pbmFsSWQgPT09IGFyZ3MuaWQpIHtcblx0XHRcdFx0XHRcdGNhcm91c2VsSW5kZXggPSBqO1xuXHRcdFx0XHRcdFx0Y2Fyb3VzZWwgPSBjYW5kaWRhdGU7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFjYXJvdXNlbCB8fCBjYXJvdXNlbEluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ291bnQgc2VuZF90b190ZXJtaW5hbCB0b29sIGludm9jYXRpb25zIGFmdGVyIHRoZSBjYXJvdXNlbCB0b1xuXHRcdFx0Ly8gZGV0ZXJtaW5lIHdoaWNoIHF1ZXN0aW9uIHRoaXMgY2FsbCBjb3JyZXNwb25kcyB0byAocG9zaXRpb25hbCkuXG5cdFx0XHRsZXQgc2VuZENvdW50ID0gMDtcblx0XHRcdGZvciAobGV0IGogPSBjYXJvdXNlbEluZGV4ICsgMTsgaiA8IHBhcnRzLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRcdGlmIChwYXJ0c1tqXS5raW5kID09PSAndG9vbEludm9jYXRpb24nICYmIChwYXJ0c1tqXSBhcyB7IHRvb2xJZD86IHN0cmluZyB9KS50b29sSWQgPT09IFRlcm1pbmFsVG9vbElkLlNlbmRUb1Rlcm1pbmFsKSB7XG5cdFx0XHRcdFx0c2VuZENvdW50Kys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcXVlc3Rpb25JbmRleCA9IHNlbmRDb3VudDtcblx0XHRcdGlmIChxdWVzdGlvbkluZGV4ID49IGNhcm91c2VsLnF1ZXN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcXVlc3Rpb24gPSBjYXJvdXNlbC5xdWVzdGlvbnNbcXVlc3Rpb25JbmRleF07XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgY29tbWFuZCBtYXRjaGVzIHRoZSBhbnN3ZXIgYXQgdGhpcyBwb3NpdGlvbiBzbyB0aGF0XG5cdFx0XHQvLyB1bnJlbGF0ZWQgc2VuZF90b190ZXJtaW5hbCBjYWxscyBkb24ndCBza2lwIGNvbmZpcm1hdGlvbi5cblx0XHRcdGlmIChjYXJvdXNlbC5kYXRhKSB7XG5cdFx0XHRcdGNvbnN0IGFuc3dlciA9IGNhcm91c2VsLmRhdGFbcXVlc3Rpb24uaWRdO1xuXHRcdFx0XHRpZiAodGhpcy5fYW5zd2VyTWF0Y2hlc0NvbW1hbmQoYW5zd2VyLCBjb21tYW5kVGV4dCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0UXVlc3Rpb25UZXh0KHF1ZXN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UXVlc3Rpb25UZXh0KHF1ZXN0aW9uOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxbJ3F1ZXN0aW9ucyddWzBdKTogc3RyaW5nIHtcblx0XHRjb25zdCB0ZXh0ID0gcXVlc3Rpb24ubWVzc2FnZSA/PyBxdWVzdGlvbi50aXRsZTtcblx0XHRyZXR1cm4gaXNNYXJrZG93blN0cmluZyh0ZXh0KSA/IHRleHQudmFsdWUgOiB0ZXh0O1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyB3aGV0aGVyIGEgY2Fyb3VzZWwgYW5zd2VyIHZhbHVlIG1hdGNoZXMgdGhlIGNvbW1hbmQgdGV4dCBiZWluZyBzZW50LlxuXHQgKiBBbiBlbXB0eS91bnByb3ZpZGVkIGFuc3dlciBtYXRjaGVzIGFuIGVtcHR5IGNvbW1hbmQgKGkuZS4gcHJlc3NpbmcgRW50ZXIgdG9cblx0ICogYWNjZXB0IHRoZSBkZWZhdWx0KSwgc2luY2UgdGhhdCBpcyB0aGUgZXhwZWN0ZWQgd2F5IHRvIHNraXAgYSBxdWVzdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX2Fuc3dlck1hdGNoZXNDb21tYW5kKGFuc3dlcjogSUNoYXRRdWVzdGlvbkFuc3dlclZhbHVlIHwgdW5kZWZpbmVkLCBjb21tYW5kVGV4dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKGFuc3dlciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZFRleHQgPT09ICcnO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGFuc3dlciA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBhbnN3ZXIudHJpbSgpID09PSBjb21tYW5kVGV4dDtcblx0XHR9XG5cdFx0Ly8gYW5zd2VyIGlzIG5vdyBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlciB8IElDaGF0TXVsdGlTZWxlY3RBbnN3ZXJcblx0XHRpZiAoaGFzS2V5KGFuc3dlciwgeyBzZWxlY3RlZFZhbHVlczogdHJ1ZSB9KSkge1xuXHRcdFx0Y29uc3QgbXVsdGkgPSBhbnN3ZXIgYXMgSUNoYXRNdWx0aVNlbGVjdEFuc3dlcjtcblx0XHRcdGlmIChtdWx0aS5zZWxlY3RlZFZhbHVlcy5zb21lKHYgPT4gdi50cmltKCkgPT09IGNvbW1hbmRUZXh0KSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChtdWx0aS5mcmVlZm9ybVZhbHVlPy50cmltKCkgPT09IGNvbW1hbmRUZXh0KSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvbW1hbmRUZXh0ID09PSAnJyAmJiBtdWx0aS5zZWxlY3RlZFZhbHVlcy5sZW5ndGggPT09IDAgJiYgIW11bHRpLmZyZWVmb3JtVmFsdWU/LnRyaW0oKTtcblx0XHR9XG5cdFx0aWYgKGhhc0tleShhbnN3ZXIsIHsgc2VsZWN0ZWRWYWx1ZTogdHJ1ZSB9KSkge1xuXHRcdFx0Y29uc3Qgc2luZ2xlID0gYW5zd2VyIGFzIElDaGF0U2luZ2xlU2VsZWN0QW5zd2VyO1xuXHRcdFx0aWYgKHNpbmdsZS5zZWxlY3RlZFZhbHVlPy50cmltKCkgPT09IGNvbW1hbmRUZXh0IHx8IHNpbmdsZS5mcmVlZm9ybVZhbHVlPy50cmltKCkgPT09IGNvbW1hbmRUZXh0KSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvbW1hbmRUZXh0ID09PSAnJyAmJiAhc2luZ2xlLnNlbGVjdGVkVmFsdWU/LnRyaW0oKSAmJiAhc2luZ2xlLmZyZWVmb3JtVmFsdWU/LnRyaW0oKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IGFyZ3MgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnMgYXMgSVNlbmRUb1Rlcm1pbmFsSW5wdXRQYXJhbXM7XG5cblx0XHRpZiAoIWFyZ3MuaWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiBgRXJyb3I6ICdpZCcgKHRoZSBhY3RpdmUgdGVybWluYWwgZXhlY3V0aW9uIFVVSUQgcmV0dXJuZWQgYnkgJHtUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsfSkgbXVzdCBiZSBwcm92aWRlZC5gXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4ZWN1dGlvbiA9IFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbihhcmdzLmlkKTtcblx0XHRpZiAoIWV4ZWN1dGlvbikge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6IGBFcnJvcjogTm8gYWN0aXZlIHRlcm1pbmFsIGV4ZWN1dGlvbiBmb3VuZCB3aXRoIElEICR7YXJncy5pZH0uIFRoZSB0ZXJtaW5hbCBtYXkgaGF2ZSBhbHJlYWR5IGJlZW4ga2lsbGVkIG9yIHRoZSBJRCBpcyBpbnZhbGlkLiBUaGUgSUQgbXVzdCBiZSB0aGUgZXhhY3QgdmFsdWUgcmV0dXJuZWQgYnkgJHtUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsfS5gXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFJlZ2lzdGVyIGEgbWFya2VyIGJlZm9yZSBzZW5kaW5nIHNvIHdlIGNhbiBzY29wZSBvdXRwdXQgdG8ganVzdCB0aGUgcmVzcG9uc2Vcblx0XHRjb25zdCBzdGFydE1hcmtlciA9IGV4ZWN1dGlvbi5pbnN0YW5jZS5yZWdpc3Rlck1hcmtlcj8uKCk7XG5cblx0XHRpZiAoaXNNdWx0aWxpbmVDb21tYW5kKGFyZ3MuY29tbWFuZCkpIHtcblx0XHRcdC8vIE11bHRpbGluZSBjb21tYW5kcyAoZS5nLiBoZXJlZG9jcykgbXVzdCBwcmVzZXJ2ZSBuZXdsaW5lcyBhbmQgdXNlXG5cdFx0XHQvLyBicmFja2V0ZWQgcGFzdGUgbW9kZSBzbyB0aGUgc2hlbGwgdHJlYXRzIHRoZSBpbnB1dCBhcyBhIHNpbmdsZSBwYXN0ZVxuXHRcdFx0Ly8gcmF0aGVyIHRoYW4gZXhlY3V0aW5nIGVhY2ggbGluZSBpbmRlcGVuZGVudGx5LiBJbnRlbnRpb25hbGx5IHNraXBcblx0XHRcdC8vIG5vcm1hbGl6ZUNvbW1hbmRGb3JFeGVjdXRpb24gaGVyZSBzbyBuZWl0aGVyIG5ld2xpbmVzIG5vciB0aGVcblx0XHRcdC8vIHRyYWlsaW5nL2xlYWRpbmcgd2hpdGVzcGFjZSBgLnRyaW0oKWAgaXQgcGVyZm9ybXMgYXJlIHN0cmlwcGVkLlxuXHRcdFx0YXdhaXQgZXhlY3V0aW9uLmluc3RhbmNlLnNlbmRUZXh0KGFyZ3MuY29tbWFuZCwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IGV4ZWN1dGlvbi5pbnN0YW5jZS5zZW5kVGV4dChub3JtYWxpemVDb21tYW5kRm9yRXhlY3V0aW9uKGFyZ3MuY29tbWFuZCksIHRydWUpO1xuXHRcdH1cblxuXHRcdGxldCByZWNlbnRPdXRwdXQ6IHN0cmluZztcblx0XHRpZiAoYXJncy53YWl0Rm9yT3V0cHV0KSB7XG5cdFx0XHQvLyBXYWl0IGZvciB0aGUgdGVybWluYWwgdG8gYmVjb21lIGlkbGUgKG5vIG5ldyBkYXRhKSBiZWZvcmUgcmV0dXJuaW5nLlxuXHRcdFx0Ly8gVGhpcyBpcyBjcml0aWNhbCBmb3IgaW50ZXJhY3RpdmUgcHJvZ3JhbXMgKGdhbWVzLCBSRVBMcywgZXRjLikgd2hlcmVcblx0XHRcdC8vIHRoZSByZXNwb25zZSBhcnJpdmVzIGFzeW5jaHJvbm91c2x5IGFmdGVyIHRoZSBpbnB1dC5cblx0XHRcdHJlY2VudE91dHB1dCA9IGF3YWl0IHRoaXMuX3dhaXRGb3JJZGxlT3V0cHV0KGV4ZWN1dGlvbiwgc3RhcnRNYXJrZXIsIHRva2VuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGltZW91dCgyMDAwLCB0b2tlbik7XG5cdFx0XHRyZWNlbnRPdXRwdXQgPSBnZXRPdXRwdXQoZXhlY3V0aW9uLmluc3RhbmNlLCBzdGFydE1hcmtlciA/PyB1bmRlZmluZWQsIHsgbGFzdE5MaW5lczogMjAgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RlZXJpbmcgPSBpc0NhbmNlbFNpZ25hbChhcmdzLmNvbW1hbmQpXG5cdFx0XHQ/IGBcXG5cXG5Ob3RlOiBUaGUgaW5wdXQgeW91IHNlbnQgd2FzIGEgY2FuY2VsIHNpZ25hbCAoQ3RybC1DIC8gQ3RybC1EIC8gQ3RybC1cXFxcKS4gVGhlIHByZXZpb3VzbHkgcnVubmluZyBjb21tYW5kIHdhcyBpbnRlcnJ1cHRlZCwgbm90IGNvbXBsZXRlZC4gVGhpcyBpcyBub3QgYSBzaWduYWwgdG8gZW5kIHRoZSB0dXJuIFx1MjAxNCBpZiB5b3UgaW50ZW5kIHRvIHJ1biBhIHJlY292ZXJ5IG9yIGZvbGxvdy11cCBjb21tYW5kLCBpc3N1ZSBpdCBub3cgaW4gdGhpcyBzYW1lIHR1cm4uIENhbGwgJHtUZXJtaW5hbFRvb2xJZC5HZXRUZXJtaW5hbE91dHB1dH0gZmlyc3QgaWYgeW91IG5lZWQgdG8gdmVyaWZ5IHRoZSBzaGVsbCBpcyBiYWNrIGF0IGEgcHJvbXB0LmBcblx0XHRcdDogJyc7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHR2YWx1ZTogYFN1Y2Nlc3NmdWxseSBzZW50IGNvbW1hbmQgdG8gdGVybWluYWwgJHthcmdzLmlkfS4ke3JlY2VudE91dHB1dCA/IGBcXG5cXG5UZXJtaW5hbCBvdXRwdXQ6XFxuJHtyZWNlbnRPdXRwdXR9YCA6ICcnfSR7c3RlZXJpbmd9YFxuXHRcdFx0fV1cblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFdhaXRzIGZvciB0aGUgdGVybWluYWwgdG8gYmVjb21lIGlkbGUgKG5vIG5ldyBvdXRwdXQgZm9yIGEgc3VzdGFpbmVkIHBlcmlvZClcblx0ICogYW5kIHJldHVybnMgdGhlIG91dHB1dCBwcm9kdWNlZCBzaW5jZSB0aGUgZ2l2ZW4gbWFya2VyLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfd2FpdEZvcklkbGVPdXRwdXQoXG5cdFx0ZXhlY3V0aW9uOiBSZXR1cm5UeXBlPHR5cGVvZiBSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24+ICYge30sXG5cdFx0c3RhcnRNYXJrZXI6IFJldHVyblR5cGU8SVRlcm1pbmFsSW5zdGFuY2VbJ3JlZ2lzdGVyTWFya2VyJ10+IHwgdW5kZWZpbmVkLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBtYXhXYWl0TXMgPSAzMF8wMDA7IC8vIDMwIHNlY29uZHMgbWF4aW11bSB3YWl0XG5cdFx0Y29uc3QgaWRsZVRocmVzaG9sZE1zID0gMl8wMDA7IC8vIENvbnNpZGVyIGlkbGUgYWZ0ZXIgMnMgb2Ygbm8gZGF0YVxuXHRcdGNvbnN0IHBvbGxJbnRlcnZhbE1zID0gNTAwO1xuXHRcdGxldCB3YWl0ZWQgPSAwO1xuXHRcdGxldCBsYXN0RGF0YVRpbWUgPSBEYXRlLm5vdygpO1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHRjb25zdCBkYXRhTGlzdGVuZXIgPSBleGVjdXRpb24uaW5zdGFuY2Uub25EYXRhKCgpID0+IHtcblx0XHRcdGxhc3REYXRhVGltZSA9IERhdGUubm93KCk7XG5cdFx0fSk7XG5cblx0XHR0cnkge1xuXHRcdFx0d2hpbGUgKCFjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgJiYgd2FpdGVkIDwgbWF4V2FpdE1zKSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQocG9sbEludGVydmFsTXMsIGN0cy50b2tlbik7XG5cdFx0XHRcdHdhaXRlZCArPSBwb2xsSW50ZXJ2YWxNcztcblxuXHRcdFx0XHRjb25zdCB0aW1lU2luY2VMYXN0RGF0YSA9IERhdGUubm93KCkgLSBsYXN0RGF0YVRpbWU7XG5cdFx0XHRcdGlmICh0aW1lU2luY2VMYXN0RGF0YSA+PSBpZGxlVGhyZXNob2xkTXMpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkYXRhTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ2V0T3V0cHV0KGV4ZWN1dGlvbi5pbnN0YW5jZSwgc3RhcnRNYXJrZXIgPz8gdW5kZWZpbmVkKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGlDQUFpQyxrQkFBa0Isa0JBQWtCLHNCQUFzQjtBQUNwRyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGNBQWM7QUFDdkIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBc0g7QUFDL0gsU0FBUyxzQkFBaU47QUFFMU4sU0FBUyxzQkFBeUMsd0JBQXdCO0FBQzFFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMseUJBQXlCLG9CQUFvQixvQ0FBb0M7QUFDMUYsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxzQkFBc0I7QUFFeEIsTUFBTSx5QkFBb0M7QUFBQSxFQUNoRCxJQUFJLGVBQWU7QUFBQSxFQUNuQixtQkFBbUI7QUFBQSxFQUNuQixhQUFhLFNBQVMsa0NBQWtDLGtCQUFrQjtBQUFBLEVBQzFFLGtCQUFrQiwyRkFBMkYsZUFBZSxhQUFhO0FBQUEsRUFDekksTUFBTSxRQUFRO0FBQUEsRUFDZCxRQUFRLGVBQWU7QUFBQSxFQUN2QixhQUFhO0FBQUEsSUFDWixN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QVUsU0FBUyxTQUFTLDZCQUE2QixLQUFLLE9BQU8sR0FBRyxJQUFJO0FBQUEsSUFDbkY7QUFFQSxRQUFJO0FBQ0osUUFBSSxLQUFLLGVBQWU7QUFJdkIscUJBQWUsTUFBTSxLQUFLLG1CQUFtQixXQUFXLGFBQWEsS0FBSztBQUFBLElBQzNFLE9BQU87QUFDTixZQUFNLFFBQVEsS0FBTSxLQUFLO0FBQ3pCLHFCQUFlLFVBQVUsVUFBVSxVQUFVLGVBQWUsUUFBVyxFQUFFLFlBQVksR0FBRyxDQUFDO0FBQUEsSUFDMUY7QUFFQSxVQUFNLFdBQVcsZUFBZSxLQUFLLE9BQU8sSUFDekM7QUFBQTtBQUFBLGtSQUFrUixlQUFlLGlCQUFpQixnRUFDbFQ7QUFFSCxXQUFPO0FBQUEsTUFDTixTQUFTLENBQUM7QUFBQSxRQUNULE1BQU07QUFBQSxRQUNOLE9BQU8seUNBQXlDLEtBQUssRUFBRSxJQUFJLGVBQWU7QUFBQTtBQUFBO0FBQUEsRUFBeUIsWUFBWSxLQUFLLEVBQUUsR0FBRyxRQUFRO0FBQUEsTUFDbEksQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQWMsbUJBQ2IsV0FDQSxhQUNBLE9BQ2tCO0FBQ2xCLFVBQU0sWUFBWTtBQUNsQixVQUFNLGtCQUFrQjtBQUN4QixVQUFNLGlCQUFpQjtBQUN2QixRQUFJLFNBQVM7QUFDYixRQUFJLGVBQWUsS0FBSyxJQUFJO0FBRTVCLFVBQU0sTUFBTSxJQUFJLHdCQUF3QixLQUFLO0FBQzdDLFVBQU0sZUFBZSxVQUFVLFNBQVMsT0FBTyxNQUFNO0FBQ3BELHFCQUFlLEtBQUssSUFBSTtBQUFBLElBQ3pCLENBQUM7QUFFRCxRQUFJO0FBQ0gsYUFBTyxDQUFDLElBQUksTUFBTSwyQkFBMkIsU0FBUyxXQUFXO0FBQ2hFLGNBQU0sUUFBUSxnQkFBZ0IsSUFBSSxLQUFLO0FBQ3ZDLGtCQUFVO0FBRVYsY0FBTSxvQkFBb0IsS0FBSyxJQUFJLElBQUk7QUFDdkMsWUFBSSxxQkFBcUIsaUJBQWlCO0FBQ3pDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELFVBQUU7QUFDRCxtQkFBYSxRQUFRO0FBQ3JCLFVBQUksUUFBUTtBQUFBLElBQ2I7QUFFQSxXQUFPLFVBQVUsVUFBVSxVQUFVLGVBQWUsTUFBUztBQUFBLEVBQzlEO0FBQ0Q7QUFuVmEscUJBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
