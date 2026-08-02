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
import * as dom from "../../../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun, constObservable, derivedOpts } from "../../../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IChatToolInvocation, isLegacyChatTerminalToolInvocationData, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { IChatTodoListService } from "../../../../common/tools/chatTodoListService.js";
import { isToolResultInputOutputDetails, isToolResultOutputDetails, ToolInvocationPresentation } from "../../../../common/tools/languageModelToolsService.js";
import { ExtensionsInstallConfirmationWidgetSubPart } from "./chatExtensionsInstallToolSubPart.js";
import { ChatInputOutputMarkdownProgressPart } from "./chatInputOutputMarkdownProgressPart.js";
import { ChatMcpAppSubPart } from "./chatMcpAppSubPart.js";
import { ChatResultListSubPart } from "./chatResultListSubPart.js";
import { ChatAutomationConfiguredResultSubPart } from "./chatAutomationConfiguredResultSubPart.js";
import { ChatSessionCreatedResultSubPart } from "./chatSessionCreatedResultSubPart.js";
import { ChatSimpleToolProgressPart } from "./chatSimpleToolProgressPart.js";
import { ChatSandboxPrerequisiteConfirmationSubPart } from "./chatSandboxPrerequisiteConfirmationSubPart.js";
import { ChatModifiedFilesConfirmationSubPart } from "./chatModifiedFilesConfirmationSubPart.js";
import { ChatAgentFeedbackReviewConfirmationSubPart } from "./chatAgentFeedbackReviewConfirmationSubPart.js";
import { ChatTerminalToolConfirmationSubPart } from "./chatTerminalToolConfirmationSubPart.js";
import { ChatTerminalToolProgressPart } from "./chatTerminalToolProgressPart.js";
import { ChatToolAuthenticationSubPart } from "./chatToolAuthenticationSubPart.js";
import { ToolConfirmationSubPart } from "./chatToolConfirmationSubPart.js";
import { ChatToolOutputSubPart } from "./chatToolOutputPart.js";
import { ChatToolPostExecuteConfirmationPart } from "./chatToolPostExecuteConfirmationPart.js";
import { ChatToolProgressSubPart } from "./chatToolProgressPart.js";
import { ChatToolStreamingSubPart } from "./chatToolStreamingSubPart.js";
import { ChatOtherClientToolProgressPart } from "./chatOtherClientToolProgressPart.js";
function mcpAppRenderDataEquals(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (a.kind !== b.kind || a.resourceUri !== b.resourceUri || a.input !== b.input || a.sessionResource.toString() !== b.sessionResource.toString()) {
    return false;
  }
  if (a.kind === "agentHost" && b.kind === "agentHost") {
    return a.serverId === b.serverId && a.channel === b.channel;
  }
  if (a.kind === "local" && b.kind === "local") {
    return a.serverDefinitionId === b.serverDefinitionId && a.collectionId === b.collectionId;
  }
  return false;
}
let ChatToolInvocationPart = class extends Disposable {
  constructor(toolInvocation, context, renderer, listPool, editorPool, currentWidthDelegate, announcedToolProgressKeys, codeBlockStartIndex, instantiationService, chatTodoListService) {
    super();
    this.toolInvocation = toolInvocation;
    this.context = context;
    this.renderer = renderer;
    this.listPool = listPool;
    this.editorPool = editorPool;
    this.currentWidthDelegate = currentWidthDelegate;
    this.announcedToolProgressKeys = announcedToolProgressKeys;
    this.codeBlockStartIndex = codeBlockStartIndex;
    this.instantiationService = instantiationService;
    this.chatTodoListService = chatTodoListService;
    this.mcpAppPart = this._register(new MutableDisposable());
    this._onDidRemount = this._register(new Emitter());
    this.domNode = dom.$(".chat-tool-invocation-part");
    if (toolInvocation.presentation === "hidden") {
      return;
    }
    if (toolInvocation.toolSpecificData?.kind === "todoList") {
      const sessionResource = context.element.sessionResource;
      const todos = toolInvocation.toolSpecificData.todoList.map((todo, index) => {
        const parsedId = parseInt(todo.id, 10);
        const id = Number.isNaN(parsedId) ? index + 1 : parsedId;
        return {
          id,
          title: todo.title,
          status: todo.status
        };
      });
      this.chatTodoListService.setTodos(sessionResource, todos);
    }
    let appData = constObservable(void 0);
    if (toolInvocation.kind === "toolInvocation") {
      let previousState = toolInvocation.state.get();
      let previousDataKind = toolInvocation.toolSpecificDataKind.get();
      let previousToolSpecificData = toolInvocation.toolSpecificData;
      this._register(autorun((reader) => {
        const state = toolInvocation.state.read(reader);
        const dataKind = toolInvocation.toolSpecificDataKind.read(reader);
        const toolSpecificData = toolInvocation.toolSpecificData;
        const stateChanged = state.type !== previousState.type;
        const dataKindChanged = dataKind !== previousDataKind;
        const dataChanged = state !== previousState && toolSpecificData !== previousToolSpecificData;
        const confirmationMessagesChanged = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && previousState.type === IChatToolInvocation.StateKind.WaitingForConfirmation && state.confirmationMessages !== previousState.confirmationMessages;
        previousState = state;
        previousDataKind = dataKind;
        previousToolSpecificData = toolSpecificData;
        if (stateChanged || dataKindChanged || dataChanged || confirmationMessagesChanged) {
          render();
        }
      }));
      appData = derivedOpts({
        owner: this,
        equalsFn: mcpAppRenderDataEquals
      }, (reader) => {
        reader.readObservable(toolInvocation.state);
        reader.readObservable(toolInvocation.toolSpecificDataKind);
        const data = this.getMcpAppRenderData();
        if (!data) {
          return void 0;
        }
        const outcome = IChatToolInvocation.executionConfirmedOrDenied(toolInvocation, reader);
        return !!outcome && outcome.type !== ToolConfirmKind.Denied && outcome.type !== ToolConfirmKind.Skipped ? data : void 0;
      });
    } else {
      const data = this.getMcpAppRenderData();
      if (data) {
        const outcome = IChatToolInvocation.executionConfirmedOrDenied(toolInvocation, void 0);
        appData = constObservable(!!outcome && outcome.type !== ToolConfirmKind.Denied && outcome.type !== ToolConfirmKind.Skipped ? data : void 0);
      }
    }
    const partStore = this._register(new DisposableStore());
    let subPartDomNode = document.createElement("div");
    this.domNode.appendChild(subPartDomNode);
    const render = () => {
      partStore.clear();
      if (toolInvocation.presentation === ToolInvocationPresentation.Hidden || toolInvocation.presentation === ToolInvocationPresentation.HiddenAfterComplete && IChatToolInvocation.isComplete(toolInvocation)) {
        dom.hide(this.domNode);
        return;
      }
      dom.show(this.domNode);
      this.subPart = partStore.add(this.createToolInvocationSubPart());
      subPartDomNode.replaceWith(this.subPart.domNode);
      subPartDomNode = this.subPart.domNode;
      const isConfirmation = this.subPart instanceof ToolConfirmationSubPart || this.subPart instanceof ChatTerminalToolConfirmationSubPart || this.subPart instanceof ChatModifiedFilesConfirmationSubPart || this.subPart instanceof ChatSandboxPrerequisiteConfirmationSubPart || this.subPart instanceof ExtensionsInstallConfirmationWidgetSubPart || this.subPart instanceof ChatToolAuthenticationSubPart || this.subPart instanceof ChatToolPostExecuteConfirmationPart;
      this.domNode.classList.toggle("has-confirmation", isConfirmation);
      partStore.add(this.subPart.onNeedsRerender(render));
    };
    let appDomNode = document.createElement("div");
    this.domNode.appendChild(appDomNode);
    this._register(autorun((r) => {
      const data = appData.read(r);
      if (!data) {
        this.mcpAppPart.clear();
        dom.clearNode(appDomNode);
        return;
      }
      this.mcpAppPart.value = this.instantiationService.createInstance(
        ChatMcpAppSubPart,
        this.toolInvocation,
        this._onDidRemount.event,
        context,
        data
      );
      appDomNode.replaceWith(this.mcpAppPart.value.domNode);
      appDomNode = this.mcpAppPart.value.domNode;
    }));
    render();
  }
  get toolCallId() {
    return this.toolInvocation.toolCallId;
  }
  get codeblocks() {
    const codeblocks = this.subPart?.codeblocks ?? [];
    if (this.mcpAppPart) {
      codeblocks.push(...this.mcpAppPart.value?.codeblocks ?? []);
    }
    return codeblocks;
  }
  get codeblocksPartId() {
    return this.subPart?.codeblocksPartId;
  }
  createToolInvocationSubPart() {
    if (this.toolInvocation.kind === "toolInvocation") {
      if (this.toolInvocation.otherClientToolCall && !IChatToolInvocation.isComplete(this.toolInvocation)) {
        return this.instantiationService.createInstance(ChatOtherClientToolProgressPart, this.toolInvocation, this.renderer, this.announcedToolProgressKeys);
      }
      if (this.toolInvocation.toolSpecificData?.kind === "extensions") {
        return this.instantiationService.createInstance(ExtensionsInstallConfirmationWidgetSubPart, this.toolInvocation, this.context);
      }
      const state = this.toolInvocation.state.get();
      if (state.type === IChatToolInvocation.StateKind.Streaming) {
        return this.instantiationService.createInstance(ChatToolStreamingSubPart, this.toolInvocation, this.context, this.renderer);
      }
      if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
        if (this.toolInvocation.toolSpecificData?.kind === "terminal" && !isLegacyChatTerminalToolInvocationData(this.toolInvocation.toolSpecificData) && (this.toolInvocation.toolSpecificData.missingSandboxDependencies?.length || this.toolInvocation.toolSpecificData.sandboxRemediations?.length)) {
          return this.instantiationService.createInstance(ChatSandboxPrerequisiteConfirmationSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer);
        } else if (this.toolInvocation.toolSpecificData?.kind === "terminal") {
          return this.instantiationService.createInstance(ChatTerminalToolConfirmationSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex);
        } else if (this.toolInvocation.toolSpecificData?.kind === "modifiedFilesConfirmation") {
          return this.instantiationService.createInstance(ChatModifiedFilesConfirmationSubPart, this.toolInvocation, this.context, this.listPool);
        } else if (this.toolInvocation.toolSpecificData?.kind === "agentFeedbackReviewConfirmation") {
          return this.instantiationService.createInstance(ChatAgentFeedbackReviewConfirmationSubPart, this.toolInvocation, this.context);
        } else {
          return this.instantiationService.createInstance(ToolConfirmationSubPart, this.toolInvocation, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex);
        }
      }
      if (state.type === IChatToolInvocation.StateKind.WaitingForAuthentication) {
        return this.instantiationService.createInstance(ChatToolAuthenticationSubPart, this.toolInvocation, this.context);
      }
      if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
        return this.instantiationService.createInstance(ChatToolPostExecuteConfirmationPart, this.toolInvocation, this.context);
      }
    }
    if (this.toolInvocation.toolSpecificData?.kind === "sessionCreated") {
      return this.instantiationService.createInstance(ChatSessionCreatedResultSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer);
    }
    if (this.toolInvocation.toolSpecificData?.kind === "automationConfigured") {
      return this.instantiationService.createInstance(ChatAutomationConfiguredResultSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer);
    }
    if (this.toolInvocation.toolSpecificData?.kind === "terminal") {
      return this.instantiationService.createInstance(ChatTerminalToolProgressPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex);
    }
    if (this.toolInvocation.toolSpecificData?.kind === "resources" && this.toolInvocation.toolSpecificData.values.length > 0) {
      return this.instantiationService.createInstance(ChatResultListSubPart, this.toolInvocation, this.context, this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage, this.toolInvocation.toolSpecificData.values, this.listPool);
    }
    if (this.toolInvocation.toolSpecificData?.kind === "simpleToolInvocation") {
      return this.instantiationService.createInstance(
        ChatSimpleToolProgressPart,
        this.toolInvocation,
        this.context,
        this.codeBlockStartIndex,
        this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage,
        this.toolInvocation.originMessage,
        this.toolInvocation.toolSpecificData,
        false
      );
    }
    const resultDetails = IChatToolInvocation.resultDetails(this.toolInvocation);
    if (Array.isArray(resultDetails) && resultDetails.length) {
      return this.instantiationService.createInstance(ChatResultListSubPart, this.toolInvocation, this.context, this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage, resultDetails, this.listPool);
    }
    if (isToolResultOutputDetails(resultDetails)) {
      return this.instantiationService.createInstance(ChatToolOutputSubPart, this.toolInvocation, this.context, this._onDidRemount.event);
    }
    if (isToolResultInputOutputDetails(resultDetails)) {
      return this.instantiationService.createInstance(
        ChatInputOutputMarkdownProgressPart,
        this.toolInvocation,
        this.context,
        this.codeBlockStartIndex,
        this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage,
        this.toolInvocation.originMessage,
        resultDetails.input,
        resultDetails.inputLanguage,
        resultDetails.output,
        !!resultDetails.isError
      );
    }
    if (this.toolInvocation.kind === "toolInvocation" && this.toolInvocation.toolSpecificData?.kind === "input" && !IChatToolInvocation.isComplete(this.toolInvocation)) {
      return this.instantiationService.createInstance(
        ChatInputOutputMarkdownProgressPart,
        this.toolInvocation,
        this.context,
        this.codeBlockStartIndex,
        this.toolInvocation.invocationMessage,
        this.toolInvocation.originMessage,
        typeof this.toolInvocation.toolSpecificData.rawInput === "string" ? this.toolInvocation.toolSpecificData.rawInput : JSON.stringify(this.toolInvocation.toolSpecificData.rawInput, null, 2),
        void 0,
        void 0,
        false
      );
    }
    return this.instantiationService.createInstance(ChatToolProgressSubPart, this.toolInvocation, this.context, this.renderer, this.announcedToolProgressKeys);
  }
  /**
   * Gets MCP App render data if this tool invocation has MCP App UI.
   * Returns data from either:
   * - toolSpecificData.mcpAppData (for in-progress tools)
   * - result details mcpOutput (for completed tools)
   */
  getMcpAppRenderData() {
    const toolSpecificData = this.toolInvocation.toolSpecificData;
    if (toolSpecificData?.kind === "input" && toolSpecificData.mcpAppData) {
      const rawInput = typeof toolSpecificData.rawInput === "string" ? toolSpecificData.rawInput : JSON.stringify(toolSpecificData.rawInput, null, 2);
      return {
        ...toolSpecificData.mcpAppData,
        input: rawInput,
        sessionResource: this.context.element.sessionResource
      };
    }
    return void 0;
  }
  onDidRemount() {
    this._onDidRemount.fire();
  }
  hasSameContent(other, followingContent, element) {
    if ((other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && other.toolSpecificData?.kind === "subagent" && !other.subAgentInvocationId) {
      return false;
    }
    return (other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && this.toolInvocation.toolCallId === other.toolCallId;
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatToolInvocationPart = __decorateClass([
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IChatTodoListService)
], ChatToolInvocationPart);
export {
  ChatToolInvocationPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sSW52b2NhdGlvblBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkT3B0cywgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIGlzTGVnYWN5Q2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZW5kZXJlckNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvZG9MaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9jaGF0VG9kb0xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscywgaXNUb29sUmVzdWx0T3V0cHV0RGV0YWlscywgVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0VHJlZUl0ZW0sIElDaGF0Q29kZUJsb2NrSW5mbyB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yUG9vbCB9IGZyb20gJy4uL2NoYXRDb250ZW50Q29kZVBvb2xzLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnQsIElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBDb2xsYXBzaWJsZUxpc3RQb29sIH0gZnJvbSAnLi4vY2hhdFJlZmVyZW5jZXNDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zSW5zdGFsbENvbmZpcm1hdGlvbldpZGdldFN1YlBhcnQgfSBmcm9tICcuL2NoYXRFeHRlbnNpb25zSW5zdGFsbFRvb2xTdWJQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRJbnB1dE91dHB1dE1hcmtkb3duUHJvZ3Jlc3NQYXJ0IH0gZnJvbSAnLi9jaGF0SW5wdXRPdXRwdXRNYXJrZG93blByb2dyZXNzUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0TWNwQXBwU3ViUGFydCwgSU1jcEFwcFJlbmRlckRhdGEgfSBmcm9tICcuL2NoYXRNY3BBcHBTdWJQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRSZXN1bHRMaXN0U3ViUGFydCB9IGZyb20gJy4vY2hhdFJlc3VsdExpc3RTdWJQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRBdXRvbWF0aW9uQ29uZmlndXJlZFJlc3VsdFN1YlBhcnQgfSBmcm9tICcuL2NoYXRBdXRvbWF0aW9uQ29uZmlndXJlZFJlc3VsdFN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25DcmVhdGVkUmVzdWx0U3ViUGFydCB9IGZyb20gJy4vY2hhdFNlc3Npb25DcmVhdGVkUmVzdWx0U3ViUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0U2ltcGxlVG9vbFByb2dyZXNzUGFydCB9IGZyb20gJy4vY2hhdFNpbXBsZVRvb2xQcm9ncmVzc1BhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFNhbmRib3hQcmVyZXF1aXNpdGVDb25maXJtYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9jaGF0U2FuZGJveFByZXJlcXVpc2l0ZUNvbmZpcm1hdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9jaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50RmVlZGJhY2tSZXZpZXdDb25maXJtYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9jaGF0QWdlbnRGZWVkYmFja1Jldmlld0NvbmZpcm1hdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRlcm1pbmFsVG9vbENvbmZpcm1hdGlvblN1YlBhcnQgfSBmcm9tICcuL2NoYXRUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQgfSBmcm9tICcuL2NoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xBdXRoZW50aWNhdGlvblN1YlBhcnQgfSBmcm9tICcuL2NoYXRUb29sQXV0aGVudGljYXRpb25TdWJQYXJ0LmpzJztcbmltcG9ydCB7IFRvb2xDb25maXJtYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQmFzZUNoYXRUb29sSW52b2NhdGlvblN1YlBhcnQgfSBmcm9tICcuL2NoYXRUb29sSW52b2NhdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xPdXRwdXRTdWJQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbE91dHB1dFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xQb3N0RXhlY3V0ZUNvbmZpcm1hdGlvblBhcnQgfSBmcm9tICcuL2NoYXRUb29sUG9zdEV4ZWN1dGVDb25maXJtYXRpb25QYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUb29sUHJvZ3Jlc3NTdWJQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbFByb2dyZXNzUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbFN0cmVhbWluZ1N1YlBhcnQgfSBmcm9tICcuL2NoYXRUb29sU3RyZWFtaW5nU3ViUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0T3RoZXJDbGllbnRUb29sUHJvZ3Jlc3NQYXJ0IH0gZnJvbSAnLi9jaGF0T3RoZXJDbGllbnRUb29sUHJvZ3Jlc3NQYXJ0LmpzJztcblxuLyoqXG4gKiBWYWx1ZSBlcXVhbGl0eSBmb3Ige0BsaW5rIElNY3BBcHBSZW5kZXJEYXRhfSwgdXNlZCBzbyB0aGUgQXBwJ3MgZGVyaXZlZFxuICogcmVuZGVyIGRhdGEgc3RheXMgc3RhYmxlIGFjcm9zcyBzdGF0ZSB0aWNrcyB0aGF0IGRvbid0IGFjdHVhbGx5IGNoYW5nZSB3aGF0XG4gKiB0aGUgd2VidmlldyByZW5kZXJzIFx1MjAxNCBvdGhlcndpc2UgcmUtcmVhZGluZyBgc3RhdGVgICh0byByZWFjdCB0byBpbi1wbGFjZVxuICogYHRvb2xTcGVjaWZpY0RhdGFgIG11dGF0aW9ucykgd291bGQgcmVjcmVhdGUgdGhlIHdlYnZpZXcgb24gZXZlcnkgcHJvZ3Jlc3NcbiAqIHVwZGF0ZS5cbiAqL1xuZnVuY3Rpb24gbWNwQXBwUmVuZGVyRGF0YUVxdWFscyhhOiBJTWNwQXBwUmVuZGVyRGF0YSB8IHVuZGVmaW5lZCwgYjogSU1jcEFwcFJlbmRlckRhdGEgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKGEgPT09IGIpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAoIWEgfHwgIWIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKGEua2luZCAhPT0gYi5raW5kIHx8IGEucmVzb3VyY2VVcmkgIT09IGIucmVzb3VyY2VVcmkgfHwgYS5pbnB1dCAhPT0gYi5pbnB1dCB8fCBhLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpICE9PSBiLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChhLmtpbmQgPT09ICdhZ2VudEhvc3QnICYmIGIua2luZCA9PT0gJ2FnZW50SG9zdCcpIHtcblx0XHRyZXR1cm4gYS5zZXJ2ZXJJZCA9PT0gYi5zZXJ2ZXJJZCAmJiBhLmNoYW5uZWwgPT09IGIuY2hhbm5lbDtcblx0fVxuXHRpZiAoYS5raW5kID09PSAnbG9jYWwnICYmIGIua2luZCA9PT0gJ2xvY2FsJykge1xuXHRcdHJldHVybiBhLnNlcnZlckRlZmluaXRpb25JZCA9PT0gYi5zZXJ2ZXJEZWZpbml0aW9uSWQgJiYgYS5jb2xsZWN0aW9uSWQgPT09IGIuY29sbGVjdGlvbklkO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRUb29sSW52b2NhdGlvblBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRDb250ZW50UGFydCB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwdWJsaWMgZ2V0IHRvb2xDYWxsSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy50b29sSW52b2NhdGlvbi50b29sQ2FsbElkO1xuXHR9XG5cblx0cHVibGljIGdldCBjb2RlYmxvY2tzKCk6IElDaGF0Q29kZUJsb2NrSW5mb1tdIHtcblx0XHRjb25zdCBjb2RlYmxvY2tzID0gdGhpcy5zdWJQYXJ0Py5jb2RlYmxvY2tzID8/IFtdO1xuXHRcdGlmICh0aGlzLm1jcEFwcFBhcnQpIHtcblx0XHRcdGNvZGVibG9ja3MucHVzaCguLi50aGlzLm1jcEFwcFBhcnQudmFsdWU/LmNvZGVibG9ja3MgPz8gW10pO1xuXHRcdH1cblx0XHRyZXR1cm4gY29kZWJsb2Nrcztcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29kZWJsb2Nrc1BhcnRJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnN1YlBhcnQ/LmNvZGVibG9ja3NQYXJ0SWQ7XG5cdH1cblxuXHRwcml2YXRlIHN1YlBhcnQhOiBCYXNlQ2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydDtcblx0cHJpdmF0ZSByZWFkb25seSBtY3BBcHBQYXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENoYXRNY3BBcHBTdWJQYXJ0PigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW91bnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxpc3RQb29sOiBDb2xsYXBzaWJsZUxpc3RQb29sLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUG9vbDogRWRpdG9yUG9vbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGN1cnJlbnRXaWR0aERlbGVnYXRlOiAoKSA9PiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzOiBTZXQ8c3RyaW5nPiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvZGVCbG9ja1N0YXJ0SW5kZXg6IG51bWJlcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRUb2RvTGlzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0VG9kb0xpc3RTZXJ2aWNlOiBJQ2hhdFRvZG9MaXN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGRvbS4kKCcuY2hhdC10b29sLWludm9jYXRpb24tcGFydCcpO1xuXHRcdGlmICh0b29sSW52b2NhdGlvbi5wcmVzZW50YXRpb24gPT09ICdoaWRkZW4nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRoZSB0b2RvIGxpc3Qgc2VydmljZSBpZiB0aGlzIHRvb2wgaW52b2NhdGlvbiBjb250YWlucyB0b2RvIGRhdGFcblx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3RvZG9MaXN0Jykge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdGNvbnN0IHRvZG9zID0gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS50b2RvTGlzdC5tYXAoKHRvZG8sIGluZGV4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZElkID0gcGFyc2VJbnQodG9kby5pZCwgMTApO1xuXHRcdFx0XHRjb25zdCBpZCA9IE51bWJlci5pc05hTihwYXJzZWRJZCkgPyBpbmRleCArIDEgOiBwYXJzZWRJZDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHR0aXRsZTogdG9kby50aXRsZSxcblx0XHRcdFx0XHRzdGF0dXM6IHRvZG8uc3RhdHVzIGFzICdub3Qtc3RhcnRlZCcgfCAnaW4tcHJvZ3Jlc3MnIHwgJ2NvbXBsZXRlZCdcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5jaGF0VG9kb0xpc3RTZXJ2aWNlLnNldFRvZG9zKHNlc3Npb25SZXNvdXJjZSwgdG9kb3MpO1xuXHRcdH1cblxuXHRcdGxldCBhcHBEYXRhOiBJT2JzZXJ2YWJsZTxJTWNwQXBwUmVuZGVyRGF0YSB8IHVuZGVmaW5lZD4gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHRpZiAodG9vbEludm9jYXRpb24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0bGV0IHByZXZpb3VzU3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRcdGxldCBwcmV2aW91c0RhdGFLaW5kID0gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YUtpbmQuZ2V0KCk7XG5cdFx0XHRsZXQgcHJldmlvdXNUb29sU3BlY2lmaWNEYXRhID0gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGRhdGFLaW5kID0gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YUtpbmQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhID0gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YTtcblx0XHRcdFx0Y29uc3Qgc3RhdGVDaGFuZ2VkID0gc3RhdGUudHlwZSAhPT0gcHJldmlvdXNTdGF0ZS50eXBlO1xuXHRcdFx0XHRjb25zdCBkYXRhS2luZENoYW5nZWQgPSBkYXRhS2luZCAhPT0gcHJldmlvdXNEYXRhS2luZDtcblx0XHRcdFx0Y29uc3QgZGF0YUNoYW5nZWQgPSBzdGF0ZSAhPT0gcHJldmlvdXNTdGF0ZSAmJiB0b29sU3BlY2lmaWNEYXRhICE9PSBwcmV2aW91c1Rvb2xTcGVjaWZpY0RhdGE7XG5cdFx0XHRcdGNvbnN0IGNvbmZpcm1hdGlvbk1lc3NhZ2VzQ2hhbmdlZCA9IHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb25cblx0XHRcdFx0XHQmJiBwcmV2aW91c1N0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb25cblx0XHRcdFx0XHQmJiBzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcyAhPT0gcHJldmlvdXNTdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcztcblx0XHRcdFx0cHJldmlvdXNTdGF0ZSA9IHN0YXRlO1xuXHRcdFx0XHRwcmV2aW91c0RhdGFLaW5kID0gZGF0YUtpbmQ7XG5cdFx0XHRcdHByZXZpb3VzVG9vbFNwZWNpZmljRGF0YSA9IHRvb2xTcGVjaWZpY0RhdGE7XG5cdFx0XHRcdGlmIChzdGF0ZUNoYW5nZWQgfHwgZGF0YUtpbmRDaGFuZ2VkIHx8IGRhdGFDaGFuZ2VkIHx8IGNvbmZpcm1hdGlvbk1lc3NhZ2VzQ2hhbmdlZCkge1xuXHRcdFx0XHRcdHJlbmRlcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGFwcERhdGEgPSBkZXJpdmVkT3B0czxJTWNwQXBwUmVuZGVyRGF0YSB8IHVuZGVmaW5lZD4oe1xuXHRcdFx0XHRvd25lcjogdGhpcyxcblx0XHRcdFx0ZXF1YWxzRm46IG1jcEFwcFJlbmRlckRhdGFFcXVhbHMsXG5cdFx0XHR9LCByZWFkZXIgPT4ge1xuXHRcdFx0XHQvLyBSZWFkIGBzdGF0ZWAgYWxvbmdzaWRlIGB0b29sU3BlY2lmaWNEYXRhS2luZGAgc28gdGhlIEFwcFxuXHRcdFx0XHQvLyByZS1kZXJpdmVzIHdoZW4gYHRvb2xTcGVjaWZpY0RhdGFgIGlzIG11dGF0ZWQgaW4gcGxhY2UgXHUyMDE0IGUuZy5cblx0XHRcdFx0Ly8gYG1jcEFwcERhdGFgIGF0dGFjaGVkIG9uIHRoZSBjb25maXJtYXRpb24gLT4gcnVubmluZ1xuXHRcdFx0XHQvLyB0cmFuc2l0aW9uLCB3aGljaCBidW1wcyBgc3RhdGVgIHZpYVxuXHRcdFx0XHQvLyBgbm90aWZ5VG9vbFNwZWNpZmljRGF0YUNoYW5nZWQoKWAgYnV0IGxlYXZlcyB0aGUga2luZCAoYGlucHV0YClcblx0XHRcdFx0Ly8gdW5jaGFuZ2VkLiBgZXF1YWxzRm5gIGtlZXBzIHRoZSB3ZWJ2aWV3IHN0YWJsZSBhY3Jvc3Mgc3RhdGVcblx0XHRcdFx0Ly8gdGlja3MgdGhhdCBkb24ndCBjaGFuZ2UgdGhlIHJlbmRlciBkYXRhLlxuXHRcdFx0XHRyZWFkZXIucmVhZE9ic2VydmFibGUodG9vbEludm9jYXRpb24uc3RhdGUpO1xuXHRcdFx0XHRyZWFkZXIucmVhZE9ic2VydmFibGUodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YUtpbmQpO1xuXHRcdFx0XHRjb25zdCBkYXRhID0gdGhpcy5nZXRNY3BBcHBSZW5kZXJEYXRhKCk7XG5cdFx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBvdXRjb21lID0gSUNoYXRUb29sSW52b2NhdGlvbi5leGVjdXRpb25Db25maXJtZWRPckRlbmllZCh0b29sSW52b2NhdGlvbiwgcmVhZGVyKTtcblx0XHRcdFx0cmV0dXJuICEhb3V0Y29tZSAmJiBvdXRjb21lLnR5cGUgIT09IFRvb2xDb25maXJtS2luZC5EZW5pZWQgJiYgb3V0Y29tZS50eXBlICE9PSBUb29sQ29uZmlybUtpbmQuU2tpcHBlZCA/IGRhdGEgOiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuZ2V0TWNwQXBwUmVuZGVyRGF0YSgpO1xuXHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0Y29uc3Qgb3V0Y29tZSA9IElDaGF0VG9vbEludm9jYXRpb24uZXhlY3V0aW9uQ29uZmlybWVkT3JEZW5pZWQodG9vbEludm9jYXRpb24sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFwcERhdGEgPSBjb25zdE9ic2VydmFibGUoISFvdXRjb21lICYmIG91dGNvbWUudHlwZSAhPT0gVG9vbENvbmZpcm1LaW5kLkRlbmllZCAmJiBvdXRjb21lLnR5cGUgIT09IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkID8gZGF0YSA6IHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVGhpcyBwYXJ0IGlzIGEgYml0IGRpZmZlcmVudCwgc2luY2UgSUNoYXRUb29sSW52b2NhdGlvbiBpcyBub3QgYW4gaW1tdXRhYmxlIG1vZGVsIG9iamVjdC4gU28gdGhpcyBwYXJ0IGlzIGFibGUgdG8gcmVyZW5kZXIgaXRzZWxmLlxuXHRcdC8vIElmIHRoaXMgdHVybnMgb3V0IHRvIGJlIGEgdHlwaWNhbCBwYXR0ZXJuLCB3ZSBjb3VsZCBjb21lIHVwIHdpdGggYSBtb3JlIHJldXNhYmxlIHBhdHRlcm4sIGxpa2UgdGVsbGluZyB0aGUgbGlzdCB0byByZXJlbmRlciBhbiBlbGVtZW50XG5cdFx0Ly8gd2hlbiB0aGUgbW9kZWwgY2hhbmdlcywgb3IgdHJ5aW5nIHRvIG1ha2UgdGhlIG1vZGVsIGltbXV0YWJsZSBhbmQgc3dhcCBvdXQgb25lIGNvbnRlbnQgcGFydCBmb3IgYSBuZXcgb25lIGJhc2VkIG9uIHVzZXIgYWN0aW9ucyBpbiB0aGUgdmlldy5cblx0XHQvLyBOb3RlIHRoYXQgYG5vZGUucmVwbGFjZVdpdGhgIGlzIHVzZWQgdG8gZW5zdXJlIG9yZGVyIGlzIHByZXNlcnZlZCB3aGVuIGFuIG1wYyBhcHAgaXMgcHJlc2VudC5cblx0XHRjb25zdCBwYXJ0U3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGxldCBzdWJQYXJ0RG9tTm9kZTogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoc3ViUGFydERvbU5vZGUpO1xuXG5cdFx0Y29uc3QgcmVuZGVyID0gKCkgPT4ge1xuXHRcdFx0cGFydFN0b3JlLmNsZWFyKCk7XG5cblx0XHRcdGlmICh0b29sSW52b2NhdGlvbi5wcmVzZW50YXRpb24gPT09IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbiB8fCAodG9vbEludm9jYXRpb24ucHJlc2VudGF0aW9uID09PSBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW5BZnRlckNvbXBsZXRlICYmIElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZSh0b29sSW52b2NhdGlvbikpKSB7XG5cdFx0XHRcdGRvbS5oaWRlKHRoaXMuZG9tTm9kZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZG9tLnNob3codGhpcy5kb21Ob2RlKTtcblx0XHRcdHRoaXMuc3ViUGFydCA9IHBhcnRTdG9yZS5hZGQodGhpcy5jcmVhdGVUb29sSW52b2NhdGlvblN1YlBhcnQoKSk7XG5cdFx0XHRzdWJQYXJ0RG9tTm9kZS5yZXBsYWNlV2l0aCh0aGlzLnN1YlBhcnQuZG9tTm9kZSk7XG5cdFx0XHRzdWJQYXJ0RG9tTm9kZSA9IHRoaXMuc3ViUGFydC5kb21Ob2RlO1xuXG5cdFx0XHQvLyBBZGQgY2xhc3Mgd2hlbiBkaXNwbGF5aW5nIGEgY29uZmlybWF0aW9uIHdpZGdldFxuXHRcdFx0Y29uc3QgaXNDb25maXJtYXRpb24gPSB0aGlzLnN1YlBhcnQgaW5zdGFuY2VvZiBUb29sQ29uZmlybWF0aW9uU3ViUGFydCB8fFxuXHRcdFx0XHR0aGlzLnN1YlBhcnQgaW5zdGFuY2VvZiBDaGF0VGVybWluYWxUb29sQ29uZmlybWF0aW9uU3ViUGFydCB8fFxuXHRcdFx0XHR0aGlzLnN1YlBhcnQgaW5zdGFuY2VvZiBDaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblN1YlBhcnQgfHxcblx0XHRcdFx0dGhpcy5zdWJQYXJ0IGluc3RhbmNlb2YgQ2hhdFNhbmRib3hQcmVyZXF1aXNpdGVDb25maXJtYXRpb25TdWJQYXJ0IHx8XG5cdFx0XHRcdHRoaXMuc3ViUGFydCBpbnN0YW5jZW9mIEV4dGVuc2lvbnNJbnN0YWxsQ29uZmlybWF0aW9uV2lkZ2V0U3ViUGFydCB8fFxuXHRcdFx0XHR0aGlzLnN1YlBhcnQgaW5zdGFuY2VvZiBDaGF0VG9vbEF1dGhlbnRpY2F0aW9uU3ViUGFydCB8fFxuXHRcdFx0XHR0aGlzLnN1YlBhcnQgaW5zdGFuY2VvZiBDaGF0VG9vbFBvc3RFeGVjdXRlQ29uZmlybWF0aW9uUGFydDtcblx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtY29uZmlybWF0aW9uJywgaXNDb25maXJtYXRpb24pO1xuXG5cdFx0XHRwYXJ0U3RvcmUuYWRkKHRoaXMuc3ViUGFydC5vbk5lZWRzUmVyZW5kZXIocmVuZGVyKSk7XG5cdFx0fTtcblxuXHRcdGxldCBhcHBEb21Ob2RlOiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZChhcHBEb21Ob2RlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBkYXRhID0gYXBwRGF0YS5yZWFkKHIpO1xuXHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdHRoaXMubWNwQXBwUGFydC5jbGVhcigpO1xuXHRcdFx0XHRkb20uY2xlYXJOb2RlKGFwcERvbU5vZGUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubWNwQXBwUGFydC52YWx1ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRNY3BBcHBTdWJQYXJ0LFxuXHRcdFx0XHR0aGlzLnRvb2xJbnZvY2F0aW9uLFxuXHRcdFx0XHR0aGlzLl9vbkRpZFJlbW91bnQuZXZlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdGRhdGEsXG5cdFx0XHQpO1xuXG5cdFx0XHRhcHBEb21Ob2RlLnJlcGxhY2VXaXRoKHRoaXMubWNwQXBwUGFydC52YWx1ZS5kb21Ob2RlKTtcblx0XHRcdGFwcERvbU5vZGUgPSB0aGlzLm1jcEFwcFBhcnQudmFsdWUuZG9tTm9kZTtcblx0XHR9KSk7XG5cblx0XHRyZW5kZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVG9vbEludm9jYXRpb25TdWJQYXJ0KCk6IEJhc2VDaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0IHtcblx0XHRpZiAodGhpcy50b29sSW52b2NhdGlvbi5raW5kID09PSAndG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRpZiAodGhpcy50b29sSW52b2NhdGlvbi5vdGhlckNsaWVudFRvb2xDYWxsICYmICFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUodGhpcy50b29sSW52b2NhdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE90aGVyQ2xpZW50VG9vbFByb2dyZXNzUGFydCwgdGhpcy50b29sSW52b2NhdGlvbiwgdGhpcy5yZW5kZXJlciwgdGhpcy5hbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdleHRlbnNpb25zJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zSW5zdGFsbENvbmZpcm1hdGlvbldpZGdldFN1YlBhcnQsIHRoaXMudG9vbEludm9jYXRpb24sIHRoaXMuY29udGV4dCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMudG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cblx0XHRcdC8vIEhhbmRsZSBzdHJlYW1pbmcgc3RhdGUgLSBzaG93IHN0cmVhbWluZyBwcm9ncmVzc1xuXHRcdFx0aWYgKHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VG9vbFN0cmVhbWluZ1N1YlBhcnQsIHRoaXMudG9vbEludm9jYXRpb24sIHRoaXMuY29udGV4dCwgdGhpcy5yZW5kZXJlcik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdGlmICh0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICd0ZXJtaW5hbCcgJiYgIWlzTGVnYWN5Q2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhKHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSkgJiYgKHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5taXNzaW5nU2FuZGJveERlcGVuZGVuY2llcz8ubGVuZ3RoIHx8IHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5zYW5kYm94UmVtZWRpYXRpb25zPy5sZW5ndGgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNhbmRib3hQcmVyZXF1aXNpdGVDb25maXJtYXRpb25TdWJQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEsIHRoaXMuY29udGV4dCwgdGhpcy5yZW5kZXJlcik7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFRlcm1pbmFsVG9vbENvbmZpcm1hdGlvblN1YlBhcnQsIHRoaXMudG9vbEludm9jYXRpb24sIHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSwgdGhpcy5jb250ZXh0LCB0aGlzLnJlbmRlcmVyLCB0aGlzLmVkaXRvclBvb2wsIHRoaXMuY3VycmVudFdpZHRoRGVsZWdhdGUsIHRoaXMuY29kZUJsb2NrU3RhcnRJbmRleCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnbW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblN1YlBhcnQsIHRoaXMudG9vbEludm9jYXRpb24sIHRoaXMuY29udGV4dCwgdGhpcy5saXN0UG9vbCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnYWdlbnRGZWVkYmFja1Jldmlld0NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QWdlbnRGZWVkYmFja1Jldmlld0NvbmZpcm1hdGlvblN1YlBhcnQsIHRoaXMudG9vbEludm9jYXRpb24sIHRoaXMuY29udGV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVG9vbENvbmZpcm1hdGlvblN1YlBhcnQsIHRoaXMudG9vbEludm9jYXRpb24sIHRoaXMuY29udGV4dCwgdGhpcy5yZW5kZXJlciwgdGhpcy5lZGl0b3JQb29sLCB0aGlzLmN1cnJlbnRXaWR0aERlbGVnYXRlLCB0aGlzLmNvZGVCbG9ja1N0YXJ0SW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRUb29sQXV0aGVudGljYXRpb25TdWJQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLmNvbnRleHQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWwpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFRvb2xQb3N0RXhlY3V0ZUNvbmZpcm1hdGlvblBhcnQsIHRoaXMudG9vbEludm9jYXRpb24sIHRoaXMuY29udGV4dCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Nlc3Npb25DcmVhdGVkJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNlc3Npb25DcmVhdGVkUmVzdWx0U3ViUGFydCwgdGhpcy50b29sSW52b2NhdGlvbiwgdGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLCB0aGlzLmNvbnRleHQsIHRoaXMucmVuZGVyZXIpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdhdXRvbWF0aW9uQ29uZmlndXJlZCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBdXRvbWF0aW9uQ29uZmlndXJlZFJlc3VsdFN1YlBhcnQsIHRoaXMudG9vbEludm9jYXRpb24sIHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSwgdGhpcy5jb250ZXh0LCB0aGlzLnJlbmRlcmVyKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VGVybWluYWxUb29sUHJvZ3Jlc3NQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEsIHRoaXMuY29udGV4dCwgdGhpcy5yZW5kZXJlciwgdGhpcy5lZGl0b3JQb29sLCB0aGlzLmN1cnJlbnRXaWR0aERlbGVnYXRlLCB0aGlzLmNvZGVCbG9ja1N0YXJ0SW5kZXgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdyZXNvdXJjZXMnICYmIHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS52YWx1ZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlc3VsdExpc3RTdWJQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLmNvbnRleHQsIHRoaXMudG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSA/PyB0aGlzLnRvb2xJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlLCB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEudmFsdWVzLCB0aGlzLmxpc3RQb29sKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc2ltcGxlVG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFNpbXBsZVRvb2xQcm9ncmVzc1BhcnQsXG5cdFx0XHRcdHRoaXMudG9vbEludm9jYXRpb24sXG5cdFx0XHRcdHRoaXMuY29udGV4dCxcblx0XHRcdFx0dGhpcy5jb2RlQmxvY2tTdGFydEluZGV4LFxuXHRcdFx0XHR0aGlzLnRvb2xJbnZvY2F0aW9uLnBhc3RUZW5zZU1lc3NhZ2UgPz8gdGhpcy50b29sSW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0dGhpcy50b29sSW52b2NhdGlvbi5vcmlnaW5NZXNzYWdlLFxuXHRcdFx0XHR0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0KTtcblx0XHR9XG5cblxuXHRcdGNvbnN0IHJlc3VsdERldGFpbHMgPSBJQ2hhdFRvb2xJbnZvY2F0aW9uLnJlc3VsdERldGFpbHModGhpcy50b29sSW52b2NhdGlvbik7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkocmVzdWx0RGV0YWlscykgJiYgcmVzdWx0RGV0YWlscy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXN1bHRMaXN0U3ViUGFydCwgdGhpcy50b29sSW52b2NhdGlvbiwgdGhpcy5jb250ZXh0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLnBhc3RUZW5zZU1lc3NhZ2UgPz8gdGhpcy50b29sSW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSwgcmVzdWx0RGV0YWlscywgdGhpcy5saXN0UG9vbCk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzVG9vbFJlc3VsdE91dHB1dERldGFpbHMocmVzdWx0RGV0YWlscykpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRUb29sT3V0cHV0U3ViUGFydCwgdGhpcy50b29sSW52b2NhdGlvbiwgdGhpcy5jb250ZXh0LCB0aGlzLl9vbkRpZFJlbW91bnQuZXZlbnQpO1xuXHRcdH1cblxuXHRcdGlmIChpc1Rvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMocmVzdWx0RGV0YWlscykpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0SW5wdXRPdXRwdXRNYXJrZG93blByb2dyZXNzUGFydCxcblx0XHRcdFx0dGhpcy50b29sSW52b2NhdGlvbixcblx0XHRcdFx0dGhpcy5jb250ZXh0LFxuXHRcdFx0XHR0aGlzLmNvZGVCbG9ja1N0YXJ0SW5kZXgsXG5cdFx0XHRcdHRoaXMudG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSA/PyB0aGlzLnRvb2xJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHR0aGlzLnRvb2xJbnZvY2F0aW9uLm9yaWdpbk1lc3NhZ2UsXG5cdFx0XHRcdHJlc3VsdERldGFpbHMuaW5wdXQsXG5cdFx0XHRcdHJlc3VsdERldGFpbHMuaW5wdXRMYW5ndWFnZSxcblx0XHRcdFx0cmVzdWx0RGV0YWlscy5vdXRwdXQsXG5cdFx0XHRcdCEhcmVzdWx0RGV0YWlscy5pc0Vycm9yLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy50b29sSW52b2NhdGlvbi5raW5kID09PSAndG9vbEludm9jYXRpb24nICYmIHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2lucHV0JyAmJiAhSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHRoaXMudG9vbEludm9jYXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdElucHV0T3V0cHV0TWFya2Rvd25Qcm9ncmVzc1BhcnQsXG5cdFx0XHRcdHRoaXMudG9vbEludm9jYXRpb24sXG5cdFx0XHRcdHRoaXMuY29udGV4dCxcblx0XHRcdFx0dGhpcy5jb2RlQmxvY2tTdGFydEluZGV4LFxuXHRcdFx0XHR0aGlzLnRvb2xJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHR0aGlzLnRvb2xJbnZvY2F0aW9uLm9yaWdpbk1lc3NhZ2UsXG5cdFx0XHRcdHR5cGVvZiB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEucmF3SW5wdXQgPT09ICdzdHJpbmcnID8gdGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLnJhd0lucHV0IDogSlNPTi5zdHJpbmdpZnkodGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLnJhd0lucHV0LCBudWxsLCAyKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VG9vbFByb2dyZXNzU3ViUGFydCwgdGhpcy50b29sSW52b2NhdGlvbiwgdGhpcy5jb250ZXh0LCB0aGlzLnJlbmRlcmVyLCB0aGlzLmFubm91bmNlZFRvb2xQcm9ncmVzc0tleXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgTUNQIEFwcCByZW5kZXIgZGF0YSBpZiB0aGlzIHRvb2wgaW52b2NhdGlvbiBoYXMgTUNQIEFwcCBVSS5cblx0ICogUmV0dXJucyBkYXRhIGZyb20gZWl0aGVyOlxuXHQgKiAtIHRvb2xTcGVjaWZpY0RhdGEubWNwQXBwRGF0YSAoZm9yIGluLXByb2dyZXNzIHRvb2xzKVxuXHQgKiAtIHJlc3VsdCBkZXRhaWxzIG1jcE91dHB1dCAoZm9yIGNvbXBsZXRlZCB0b29scylcblx0ICovXG5cdHByaXZhdGUgZ2V0TWNwQXBwUmVuZGVyRGF0YSgpOiBJTWNwQXBwUmVuZGVyRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YSA9IHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YTtcblx0XHRpZiAodG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2lucHV0JyAmJiB0b29sU3BlY2lmaWNEYXRhLm1jcEFwcERhdGEpIHtcblx0XHRcdGNvbnN0IHJhd0lucHV0ID0gdHlwZW9mIHRvb2xTcGVjaWZpY0RhdGEucmF3SW5wdXQgPT09ICdzdHJpbmcnXG5cdFx0XHRcdD8gdG9vbFNwZWNpZmljRGF0YS5yYXdJbnB1dFxuXHRcdFx0XHQ6IEpTT04uc3RyaW5naWZ5KHRvb2xTcGVjaWZpY0RhdGEucmF3SW5wdXQsIG51bGwsIDIpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi50b29sU3BlY2lmaWNEYXRhLm1jcEFwcERhdGEsXG5cdFx0XHRcdGlucHV0OiByYXdJbnB1dCxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiB0aGlzLmNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvbkRpZFJlbW91bnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRSZW1vdW50LmZpcmUoKTtcblx0fVxuXG5cdGhhc1NhbWVDb250ZW50KG90aGVyOiBJQ2hhdFJlbmRlcmVyQ29udGVudCwgZm9sbG93aW5nQ29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSwgZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0aWYgKChvdGhlci5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IG90aGVyLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKVxuXHRcdFx0JiYgb3RoZXIudG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50J1xuXHRcdFx0JiYgIW90aGVyLnN1YkFnZW50SW52b2NhdGlvbklkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiAob3RoZXIua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBvdGhlci5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgdGhpcy50b29sSW52b2NhdGlvbi50b29sQ2FsbElkID09PSBvdGhlci50b29sQ2FsbElkO1xuXHR9XG5cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Jl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
