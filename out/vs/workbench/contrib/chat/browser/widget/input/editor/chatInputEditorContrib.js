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
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { Disposable, MutableDisposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../../base/common/observable.js";
import { themeColorFromId } from "../../../../../../../base/common/themables.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { MouseTargetType } from "../../../../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../../../../editor/browser/services/codeEditorService.js";
import { EditorOption } from "../../../../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
import { TrackedRangeStickiness } from "../../../../../../../editor/common/model.js";
import { ILabelService } from "../../../../../../../platform/label/common/label.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { getInputPlaceholderColor, getRangeForPlaceholder } from "./chatInputPlaceholderDecoration.js";
import { IChatAgentService } from "../../../../common/participants/chatAgents.js";
import { localize } from "../../../../../../../nls.js";
import { chatSlashCommandBackground, chatSlashCommandForeground } from "../../../../common/widget/chatColors.js";
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, ChatRequestSlashPromptPart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestToolSetPart, chatAgentLeader, chatSubcommandLeader } from "../../../../common/requestParser/chatParserTypes.js";
import { agentReg, slashReg, variableReg } from "../../../../common/requestParser/chatRequestParser.js";
import { ChatWidget } from "../../chatWidget.js";
import { dynamicVariableDecorationType } from "../../../attachments/chatDynamicVariables.js";
import { NativeEditContextRegistry } from "../../../../../../../editor/browser/controller/editContext/native/nativeEditContextRegistry.js";
import { TextAreaEditContextRegistry } from "../../../../../../../editor/browser/controller/editContext/textArea/textAreaEditContextRegistry.js";
import { ThrottledDelayer } from "../../../../../../../base/common/async.js";
import { isCancellationError } from "../../../../../../../base/common/errors.js";
import { IEditorService } from "../../../../../../services/editor/common/editorService.js";
import { getChatSessionType } from "../../../../common/model/chatUri.js";
import { ICustomizationHarnessService } from "../../../../common/customizationHarnessService.js";
const decorationDescription = "chat";
const placeholderDecorationType = "chat-session-detail";
const slashCommandTextDecorationType = "chat-session-text";
const clickableSlashPromptTextDecorationType = "chat-session-clickable-text";
const variableTextDecorationType = "chat-variable-text";
function agentAndCommandToKey(agent, subcommand) {
  return subcommand ? `${agent.id}__${subcommand}` : agent.id;
}
function isWhitespaceOrPromptPart(p) {
  return p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestSlashPromptPart;
}
function exactlyOneSpaceAfterPart(parsedRequest, part) {
  const partIdx = parsedRequest.indexOf(part);
  if (parsedRequest.length > partIdx + 2) {
    return false;
  }
  const nextPart = parsedRequest[partIdx + 1];
  return nextPart && nextPart instanceof ChatRequestTextPart && nextPart.text === " ";
}
let InputEditorDecorations = class extends Disposable {
  constructor(widget, codeEditorService, themeService, chatAgentService, labelService, customizationHarnessService, editorService) {
    super();
    this.widget = widget;
    this.codeEditorService = codeEditorService;
    this.themeService = themeService;
    this.chatAgentService = chatAgentService;
    this.labelService = labelService;
    this.customizationHarnessService = customizationHarnessService;
    this.editorService = editorService;
    this.id = "inputEditorDecorations";
    this.previouslyUsedAgents = /* @__PURE__ */ new Set();
    this.viewModelDisposables = this._register(new MutableDisposable());
    this.updateThrottle = this._register(new ThrottledDelayer(InputEditorDecorations.UPDATE_DELAY));
    this.registeredDecorationTypes();
    this.triggerInputEditorDecorationsUpdate();
    this._register(this.widget.inputEditor.onDidChangeModelContent(() => this.triggerInputEditorDecorationsUpdate()));
    this._register(this.widget.inputEditor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.placeholder)) {
        this.triggerInputEditorDecorationsUpdate();
      }
    }));
    this._register(this.widget.onDidChangeParsedInput(() => this.triggerInputEditorDecorationsUpdate()));
    this._register(this.widget.onDidChangeViewModel(() => {
      this.registerViewModelListeners();
      this.previouslyUsedAgents.clear();
      this.triggerInputEditorDecorationsUpdate();
    }));
    this._register(this.widget.onDidSubmitAgent((e) => {
      this.previouslyUsedAgents.add(agentAndCommandToKey(e.agent, e.slashCommand?.name));
    }));
    this._register(this.widget.inputEditor.onMouseDown((e) => {
      this.mouseDownPromptSlashCommand = void 0;
      if (!e.event.leftButton || e.target.type !== MouseTargetType.CONTENT_TEXT || !e.target.position) {
        return;
      }
      const clickablePromptSlashCommand = this.clickablePromptSlashCommand;
      if (!clickablePromptSlashCommand || !clickablePromptSlashCommand.range.containsPosition(e.target.position)) {
        return;
      }
      this.mouseDownPromptSlashCommand = {
        position: Position.lift(e.target.position),
        uri: clickablePromptSlashCommand.uri,
        range: clickablePromptSlashCommand.range
      };
    }));
    this._register(this.widget.inputEditor.onMouseUp((e) => {
      const mouseDownPromptSlashCommand = this.mouseDownPromptSlashCommand;
      this.mouseDownPromptSlashCommand = void 0;
      if (!mouseDownPromptSlashCommand || e.target.type !== MouseTargetType.CONTENT_TEXT || !e.target.position) {
        return;
      }
      if (!mouseDownPromptSlashCommand.range.containsPosition(e.target.position) || !Position.equals(mouseDownPromptSlashCommand.position, e.target.position)) {
        return;
      }
      void this.editorService.openEditor({ resource: mouseDownPromptSlashCommand.uri });
    }));
    this._register(this.chatAgentService.onDidChangeAgents(() => this.triggerInputEditorDecorationsUpdate()));
    this._register(this.customizationHarnessService.onDidChangeSlashCommands((e) => {
      const sessionResource = this.widget.viewModel?.sessionResource;
      if (sessionResource && e.sessionType === getChatSessionType(sessionResource)) {
        this.triggerInputEditorDecorationsUpdate();
      }
    }));
    this._register(autorun((reader) => {
      const currentMode = this.widget.input.currentModeObs.read(reader);
      if (currentMode) {
        currentMode.description.read(reader);
      }
      this.triggerInputEditorDecorationsUpdate();
    }));
    this.registerViewModelListeners();
  }
  registerViewModelListeners() {
    this.viewModelDisposables.value = this.widget.viewModel?.onDidChange((e) => {
      if (e?.kind === "changePlaceholder" || e?.kind === "initialize") {
        this.triggerInputEditorDecorationsUpdate();
      }
    });
  }
  registeredDecorationTypes() {
    this._register(this.codeEditorService.registerDecorationType(decorationDescription, placeholderDecorationType, {}));
    this._register(this.codeEditorService.registerDecorationType(decorationDescription, slashCommandTextDecorationType, {
      color: themeColorFromId(chatSlashCommandForeground),
      backgroundColor: themeColorFromId(chatSlashCommandBackground),
      borderRadius: "3px"
    }));
    this._register(this.codeEditorService.registerDecorationType(decorationDescription, clickableSlashPromptTextDecorationType, {
      color: themeColorFromId(chatSlashCommandForeground),
      backgroundColor: themeColorFromId(chatSlashCommandBackground),
      borderRadius: "3px",
      cursor: "pointer"
    }));
    this._register(this.codeEditorService.registerDecorationType(decorationDescription, variableTextDecorationType, {
      color: themeColorFromId(chatSlashCommandForeground),
      backgroundColor: themeColorFromId(chatSlashCommandBackground),
      borderRadius: "3px"
    }));
    this._register(this.codeEditorService.registerDecorationType(decorationDescription, dynamicVariableDecorationType, {
      color: themeColorFromId(chatSlashCommandForeground),
      backgroundColor: themeColorFromId(chatSlashCommandBackground),
      borderRadius: "3px",
      rangeBehavior: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    }));
  }
  getPlaceholderColor() {
    return getInputPlaceholderColor(this.themeService);
  }
  triggerInputEditorDecorationsUpdate() {
    this.updateInputPlaceholderDecoration();
    this.updateThrottle.trigger((token) => this.updateAsyncInputEditorDecorations(token)).catch((err) => {
      if (!isCancellationError(err)) {
        throw err;
      }
    });
  }
  updateInputPlaceholderDecoration() {
    const inputValue = this.widget.inputEditor.getValue();
    const viewModel = this.widget.viewModel;
    if (!viewModel) {
      this.updateAriaPlaceholder(void 0);
      if (inputValue) {
        this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, []);
      }
      return;
    }
    if (!inputValue) {
      if (this.widget.inputEditor.getOption(EditorOption.placeholder)) {
        this.updateAriaPlaceholder(void 0);
        this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, []);
        return;
      }
      const mode = this.widget.input.currentModeObs.get();
      const placeholder = mode.argumentHint?.get() ?? mode.description.get() ?? "";
      const displayPlaceholder = viewModel.inputPlaceholder || placeholder;
      const decoration = [
        {
          range: {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: 1,
            endColumn: 1e3
          },
          renderOptions: {
            after: {
              contentText: displayPlaceholder,
              color: this.getPlaceholderColor()
            }
          }
        }
      ];
      this.updateAriaPlaceholder(displayPlaceholder || void 0);
      this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, decoration);
      return;
    }
    this.updateAriaPlaceholder(void 0);
    const parsedRequest = this.widget.parsedInput.parts;
    let placeholderDecoration;
    const agentPart = parsedRequest.find((p) => p instanceof ChatRequestAgentPart);
    const agentSubcommandPart = parsedRequest.find((p) => p instanceof ChatRequestAgentSubcommandPart);
    const onlyAgentAndWhitespace = agentPart && parsedRequest.every((p) => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentPart);
    if (onlyAgentAndWhitespace) {
      const isFollowupSlashCommand = this.previouslyUsedAgents.has(agentAndCommandToKey(agentPart.agent, void 0));
      const shouldRenderFollowupPlaceholder = isFollowupSlashCommand && agentPart.agent.metadata.followupPlaceholder;
      if (agentPart.agent.description && exactlyOneSpaceAfterPart(parsedRequest, agentPart)) {
        placeholderDecoration = [{
          range: getRangeForPlaceholder(agentPart.editorRange),
          renderOptions: {
            after: {
              contentText: shouldRenderFollowupPlaceholder ? agentPart.agent.metadata.followupPlaceholder : agentPart.agent.description,
              color: this.getPlaceholderColor()
            }
          }
        }];
      }
    }
    const onlyAgentAndAgentCommandAndWhitespace = agentPart && agentSubcommandPart && parsedRequest.every((p) => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentPart || p instanceof ChatRequestAgentSubcommandPart);
    if (onlyAgentAndAgentCommandAndWhitespace) {
      const isFollowupSlashCommand = this.previouslyUsedAgents.has(agentAndCommandToKey(agentPart.agent, agentSubcommandPart.command.name));
      const shouldRenderFollowupPlaceholder = isFollowupSlashCommand && agentSubcommandPart.command.followupPlaceholder;
      if (agentSubcommandPart?.command.description && exactlyOneSpaceAfterPart(parsedRequest, agentSubcommandPart)) {
        placeholderDecoration = [{
          range: getRangeForPlaceholder(agentSubcommandPart.editorRange),
          renderOptions: {
            after: {
              contentText: shouldRenderFollowupPlaceholder ? agentSubcommandPart.command.followupPlaceholder : agentSubcommandPart.command.description,
              color: this.getPlaceholderColor()
            }
          }
        }];
      }
    }
    const onlyAgentCommandAndWhitespace = agentSubcommandPart && parsedRequest.every((p) => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentSubcommandPart);
    if (onlyAgentCommandAndWhitespace) {
      if (agentSubcommandPart?.command.description && exactlyOneSpaceAfterPart(parsedRequest, agentSubcommandPart)) {
        placeholderDecoration = [{
          range: getRangeForPlaceholder(agentSubcommandPart.editorRange),
          renderOptions: {
            after: {
              contentText: agentSubcommandPart.command.description,
              color: this.getPlaceholderColor()
            }
          }
        }];
      }
    }
    this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, placeholderDecoration ?? []);
  }
  async updateAsyncInputEditorDecorations(token) {
    this.clickablePromptSlashCommand = void 0;
    this.widget.inputEditor.setDecorationsByType(decorationDescription, clickableSlashPromptTextDecorationType, []);
    const parsedRequest = this.widget.parsedInput.parts;
    const viewModel = this.widget.viewModel;
    if (!viewModel) {
      return;
    }
    const agentPart = parsedRequest.find((p) => p instanceof ChatRequestAgentPart);
    const agentSubcommandPart = parsedRequest.find((p) => p instanceof ChatRequestAgentSubcommandPart);
    const slashCommandPart = parsedRequest.find((p) => p instanceof ChatRequestSlashCommandPart);
    const slashPromptPart = parsedRequest.find((p) => p instanceof ChatRequestSlashPromptPart);
    const promptSlashCommand = slashPromptPart ? await this.customizationHarnessService.resolvePromptSlashCommand(slashPromptPart.name, viewModel.sessionResource, token) : void 0;
    if (token.isCancellationRequested) {
      return;
    }
    if (slashPromptPart && promptSlashCommand) {
      const onlyPromptCommandAndWhitespace = slashPromptPart && parsedRequest.every(isWhitespaceOrPromptPart);
      if (onlyPromptCommandAndWhitespace && exactlyOneSpaceAfterPart(parsedRequest, slashPromptPart) && promptSlashCommand) {
        const description = promptSlashCommand.argumentHint;
        if (description) {
          this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, [{
            range: getRangeForPlaceholder(slashPromptPart.editorRange),
            renderOptions: {
              after: {
                contentText: description,
                color: this.getPlaceholderColor()
              }
            }
          }]);
        }
      }
    }
    const textDecorations = [];
    if (agentPart) {
      textDecorations.push({ range: agentPart.editorRange });
    }
    if (agentSubcommandPart) {
      textDecorations.push({ range: agentSubcommandPart.editorRange, hoverMessage: new MarkdownString(agentSubcommandPart.command.description) });
    }
    if (slashCommandPart) {
      textDecorations.push({ range: slashCommandPart.editorRange, hoverMessage: new MarkdownString(slashCommandPart.slashCommand.detail) });
    }
    if (slashPromptPart && promptSlashCommand) {
      this.clickablePromptSlashCommand = {
        range: Range.lift(slashPromptPart.editorRange),
        uri: promptSlashCommand.uri
      };
      const promptHoverMessage = new MarkdownString();
      if (promptSlashCommand.description) {
        promptHoverMessage.appendText(promptSlashCommand.description);
        promptHoverMessage.appendText("\n");
      }
      promptHoverMessage.appendText(localize(
        "chatInput.promptSlashCommand.open",
        "Click to open {0}",
        this.labelService.getUriLabel(promptSlashCommand.uri, { relative: true })
      ));
      const promptDecoration = {
        range: slashPromptPart.editorRange,
        hoverMessage: promptHoverMessage
      };
      this.widget.inputEditor.setDecorationsByType(decorationDescription, clickableSlashPromptTextDecorationType, [promptDecoration]);
    }
    this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandTextDecorationType, textDecorations);
    const varDecorations = [];
    const toolParts = parsedRequest.filter((p) => p instanceof ChatRequestToolPart || p instanceof ChatRequestToolSetPart);
    for (const tool of toolParts) {
      varDecorations.push({ range: tool.editorRange });
    }
    const dynamicVariableParts = parsedRequest.filter((p) => p instanceof ChatRequestDynamicVariablePart);
    const isEditingPreviousRequest = !!viewModel.editing;
    if (isEditingPreviousRequest) {
      for (const variable of dynamicVariableParts) {
        varDecorations.push({ range: variable.editorRange, hoverMessage: URI.isUri(variable.data) ? new MarkdownString(this.labelService.getUriLabel(variable.data, { relative: true })) : void 0 });
      }
    }
    this.widget.inputEditor.setDecorationsByType(decorationDescription, variableTextDecorationType, varDecorations);
  }
  updateAriaPlaceholder(value) {
    const nativeEditContext = NativeEditContextRegistry.get(this.widget.inputEditor.getId());
    if (nativeEditContext) {
      const domNode = nativeEditContext.domNode.domNode;
      if (value && value.trim().length) {
        domNode.setAttribute("aria-placeholder", value);
      } else {
        domNode.removeAttribute("aria-placeholder");
      }
    } else {
      const textAreaEditContext = TextAreaEditContextRegistry.get(this.widget.inputEditor.getId());
      if (textAreaEditContext) {
        const textArea = textAreaEditContext.textArea.domNode;
        if (value && value.trim().length) {
          textArea.setAttribute("aria-placeholder", value);
        } else {
          textArea.removeAttribute("aria-placeholder");
        }
      }
    }
  }
};
InputEditorDecorations.UPDATE_DELAY = 200;
InputEditorDecorations = __decorateClass([
  __decorateParam(1, ICodeEditorService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IChatAgentService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, ICustomizationHarnessService),
  __decorateParam(6, IEditorService)
], InputEditorDecorations);
class InputEditorSlashCommandMode extends Disposable {
  constructor(widget) {
    super();
    this.widget = widget;
    this.id = "InputEditorSlashCommandMode";
    this._register(this.widget.onDidChangeAgent((e) => {
      if (e.slashCommand && e.slashCommand.isSticky || !e.slashCommand && e.agent.metadata.isSticky) {
        this.repopulateAgentCommand(e.agent, e.slashCommand);
      }
    }));
    this._register(this.widget.onDidSubmitAgent((e) => {
      this.repopulateAgentCommand(e.agent, e.slashCommand);
    }));
  }
  async repopulateAgentCommand(agent, slashCommand) {
    if (this.widget.inputEditor.getValue().trim()) {
      return;
    }
    let value;
    if (slashCommand && slashCommand.isSticky) {
      value = `${chatAgentLeader}${agent.name} ${chatSubcommandLeader}${slashCommand.name} `;
    } else if (agent.metadata.isSticky) {
      value = `${chatAgentLeader}${agent.name} `;
    }
    if (value) {
      this.widget.inputEditor.setValue(value);
      this.widget.inputEditor.setPosition({ lineNumber: 1, column: value.length + 1 });
    }
  }
}
ChatWidget.CONTRIBS.push(InputEditorDecorations, InputEditorSlashCommandMode);
class ChatTokenDeleter extends Disposable {
  constructor(widget) {
    super();
    this.widget = widget;
    this.id = "chatTokenDeleter";
    let prevInsertTokenRange;
    this._register(this.widget.inputEditor.onDidChangeModelContent((e) => {
      let insertedTokenRange;
      if (e.changes.length === 1) {
        const change = e.changes[0];
        if (change.text.length > 0 && change.rangeLength === 1) {
          if (slashReg.test(change.text) || agentReg.test(change.text) || variableReg.test(change.text)) {
            insertedTokenRange = new Range(change.range.startLineNumber, change.range.startColumn, change.range.endLineNumber, change.range.startColumn + change.text.length);
          }
        } else if (change.text.length === 0 && prevInsertTokenRange && change.range.endColumn === prevInsertTokenRange.endColumn) {
          this.widget.inputEditor.executeEdits(this.id, [{
            range: prevInsertTokenRange,
            text: ""
          }]);
          this.widget.refreshParsedInput();
        }
      }
      prevInsertTokenRange = insertedTokenRange;
    }));
  }
}
ChatWidget.CONTRIBS.push(ChatTokenDeleter);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRJbnB1dEVkaXRvckNvbnRyaWIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldElucHV0UGxhY2Vob2xkZXJDb2xvciwgZ2V0UmFuZ2VGb3JQbGFjZWhvbGRlciB9IGZyb20gJy4vY2hhdElucHV0UGxhY2Vob2xkZXJEZWNvcmF0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRDb21tYW5kLCBJQ2hhdEFnZW50RGF0YSwgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgY2hhdFNsYXNoQ29tbWFuZEJhY2tncm91bmQsIGNoYXRTbGFzaENvbW1hbmRGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3dpZGdldC9jaGF0Q29sb3JzLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0QWdlbnRQYXJ0LCBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQsIENoYXRSZXF1ZXN0RHluYW1pY1ZhcmlhYmxlUGFydCwgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0LCBDaGF0UmVxdWVzdFNsYXNoUHJvbXB0UGFydCwgQ2hhdFJlcXVlc3RUZXh0UGFydCwgQ2hhdFJlcXVlc3RUb29sUGFydCwgQ2hhdFJlcXVlc3RUb29sU2V0UGFydCwgSVBhcnNlZENoYXRSZXF1ZXN0UGFydCwgY2hhdEFnZW50TGVhZGVyLCBjaGF0U3ViY29tbWFuZExlYWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBhZ2VudFJlZywgc2xhc2hSZWcsIHZhcmlhYmxlUmVnIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFJlcXVlc3RQYXJzZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi9jaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IGR5bmFtaWNWYXJpYWJsZURlY29yYXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vYXR0YWNobWVudHMvY2hhdER5bmFtaWNWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgTmF0aXZlRWRpdENvbnRleHRSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2NvbnRyb2xsZXIvZWRpdENvbnRleHQvbmF0aXZlL25hdGl2ZUVkaXRDb250ZXh0UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgVGV4dEFyZWFFZGl0Q29udGV4dFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29udHJvbGxlci9lZGl0Q29udGV4dC90ZXh0QXJlYS90ZXh0QXJlYUVkaXRDb250ZXh0UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgVGhyb3R0bGVkRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuXG5jb25zdCBkZWNvcmF0aW9uRGVzY3JpcHRpb24gPSAnY2hhdCc7XG5jb25zdCBwbGFjZWhvbGRlckRlY29yYXRpb25UeXBlID0gJ2NoYXQtc2Vzc2lvbi1kZXRhaWwnO1xuY29uc3Qgc2xhc2hDb21tYW5kVGV4dERlY29yYXRpb25UeXBlID0gJ2NoYXQtc2Vzc2lvbi10ZXh0JztcbmNvbnN0IGNsaWNrYWJsZVNsYXNoUHJvbXB0VGV4dERlY29yYXRpb25UeXBlID0gJ2NoYXQtc2Vzc2lvbi1jbGlja2FibGUtdGV4dCc7XG5jb25zdCB2YXJpYWJsZVRleHREZWNvcmF0aW9uVHlwZSA9ICdjaGF0LXZhcmlhYmxlLXRleHQnO1xuXG5mdW5jdGlvbiBhZ2VudEFuZENvbW1hbmRUb0tleShhZ2VudDogSUNoYXRBZ2VudERhdGEsIHN1YmNvbW1hbmQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdHJldHVybiBzdWJjb21tYW5kID8gYCR7YWdlbnQuaWR9X18ke3N1YmNvbW1hbmR9YCA6IGFnZW50LmlkO1xufVxuXG5mdW5jdGlvbiBpc1doaXRlc3BhY2VPclByb21wdFBhcnQocDogSVBhcnNlZENoYXRSZXF1ZXN0UGFydCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFRleHRQYXJ0ICYmICFwLnRleHQudHJpbSgpLmxlbmd0aCkgfHwgKHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFNsYXNoUHJvbXB0UGFydCk7XG59XG5cbmZ1bmN0aW9uIGV4YWN0bHlPbmVTcGFjZUFmdGVyUGFydChwYXJzZWRSZXF1ZXN0OiByZWFkb25seSBJUGFyc2VkQ2hhdFJlcXVlc3RQYXJ0W10sIHBhcnQ6IElQYXJzZWRDaGF0UmVxdWVzdFBhcnQpOiBib29sZWFuIHtcblx0Y29uc3QgcGFydElkeCA9IHBhcnNlZFJlcXVlc3QuaW5kZXhPZihwYXJ0KTtcblx0aWYgKHBhcnNlZFJlcXVlc3QubGVuZ3RoID4gcGFydElkeCArIDIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBuZXh0UGFydCA9IHBhcnNlZFJlcXVlc3RbcGFydElkeCArIDFdO1xuXHRyZXR1cm4gbmV4dFBhcnQgJiYgbmV4dFBhcnQgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFRleHRQYXJ0ICYmIG5leHRQYXJ0LnRleHQgPT09ICcgJztcbn1cblxuY2xhc3MgSW5wdXRFZGl0b3JEZWNvcmF0aW9ucyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFVQREFURV9ERUxBWSA9IDIwMDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaWQgPSAnaW5wdXRFZGl0b3JEZWNvcmF0aW9ucyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcmV2aW91c2x5VXNlZEFnZW50cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIGNsaWNrYWJsZVByb21wdFNsYXNoQ29tbWFuZDogeyByYW5nZTogUmFuZ2U7IHVyaTogVVJJIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbW91c2VEb3duUHJvbXB0U2xhc2hDb21tYW5kOiB7IHBvc2l0aW9uOiBQb3NpdGlvbjsgdXJpOiBVUkk7IHJhbmdlOiBSYW5nZSB9IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGVsRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblxuXHRwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZVRocm90dGxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlZERlbGF5ZXI8dm9pZD4oSW5wdXRFZGl0b3JEZWNvcmF0aW9ucy5VUERBVEVfREVMQVkpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdpZGdldDogSUNoYXRXaWRnZXQsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyZWREZWNvcmF0aW9uVHlwZXMoKTtcblx0XHR0aGlzLnRyaWdnZXJJbnB1dEVkaXRvckRlY29yYXRpb25zVXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4gdGhpcy50cmlnZ2VySW5wdXRFZGl0b3JEZWNvcmF0aW9uc1VwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0Ly8gVGhlIGVkaXRvcidzIHBsYWNlaG9sZGVyIG9wdGlvbiBpcyBzZXQvY2xlYXJlZCBieSBmZWF0dXJlcyBzdWNoIGFzXG5cdFx0XHQvLyBkaWN0YXRpb24gKFwiTGlzdGVuaW5nXHUyMDI2XCIpLiBXaGVuIGl0IGlzIHNldCwgUGxhY2Vob2xkZXJUZXh0Q29udHJpYnV0aW9uXG5cdFx0XHQvLyByZW5kZXJzIGl0LCBzbyB0aGUgZGVjb3JhdGlvbiBwbGFjZWhvbGRlciBtdXN0IHlpZWxkIHRvIGF2b2lkIHR3b1xuXHRcdFx0Ly8gb3ZlcmxhcHBpbmcgcGxhY2Vob2xkZXJzOyByZS1ydW4gd2hlbiB0aGUgb3B0aW9uIGNoYW5nZXMuXG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5wbGFjZWhvbGRlcikpIHtcblx0XHRcdFx0dGhpcy50cmlnZ2VySW5wdXRFZGl0b3JEZWNvcmF0aW9uc1VwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndpZGdldC5vbkRpZENoYW5nZVBhcnNlZElucHV0KCgpID0+IHRoaXMudHJpZ2dlcklucHV0RWRpdG9yRGVjb3JhdGlvbnNVcGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2lkZ2V0Lm9uRGlkQ2hhbmdlVmlld01vZGVsKCgpID0+IHtcblx0XHRcdHRoaXMucmVnaXN0ZXJWaWV3TW9kZWxMaXN0ZW5lcnMoKTtcblx0XHRcdHRoaXMucHJldmlvdXNseVVzZWRBZ2VudHMuY2xlYXIoKTtcblx0XHRcdHRoaXMudHJpZ2dlcklucHV0RWRpdG9yRGVjb3JhdGlvbnNVcGRhdGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53aWRnZXQub25EaWRTdWJtaXRBZ2VudCgoZSkgPT4ge1xuXHRcdFx0dGhpcy5wcmV2aW91c2x5VXNlZEFnZW50cy5hZGQoYWdlbnRBbmRDb21tYW5kVG9LZXkoZS5hZ2VudCwgZS5zbGFzaENvbW1hbmQ/Lm5hbWUpKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iub25Nb3VzZURvd24oZSA9PiB7XG5cdFx0XHR0aGlzLm1vdXNlRG93blByb21wdFNsYXNoQ29tbWFuZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKCFlLmV2ZW50LmxlZnRCdXR0b24gfHwgZS50YXJnZXQudHlwZSAhPT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVCB8fCAhZS50YXJnZXQucG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjbGlja2FibGVQcm9tcHRTbGFzaENvbW1hbmQgPSB0aGlzLmNsaWNrYWJsZVByb21wdFNsYXNoQ29tbWFuZDtcblx0XHRcdGlmICghY2xpY2thYmxlUHJvbXB0U2xhc2hDb21tYW5kIHx8ICFjbGlja2FibGVQcm9tcHRTbGFzaENvbW1hbmQucmFuZ2UuY29udGFpbnNQb3NpdGlvbihlLnRhcmdldC5wb3NpdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLm1vdXNlRG93blByb21wdFNsYXNoQ29tbWFuZCA9IHtcblx0XHRcdFx0cG9zaXRpb246IFBvc2l0aW9uLmxpZnQoZS50YXJnZXQucG9zaXRpb24pLFxuXHRcdFx0XHR1cmk6IGNsaWNrYWJsZVByb21wdFNsYXNoQ29tbWFuZC51cmksXG5cdFx0XHRcdHJhbmdlOiBjbGlja2FibGVQcm9tcHRTbGFzaENvbW1hbmQucmFuZ2UsXG5cdFx0XHR9O1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndpZGdldC5pbnB1dEVkaXRvci5vbk1vdXNlVXAoZSA9PiB7XG5cdFx0XHRjb25zdCBtb3VzZURvd25Qcm9tcHRTbGFzaENvbW1hbmQgPSB0aGlzLm1vdXNlRG93blByb21wdFNsYXNoQ29tbWFuZDtcblx0XHRcdHRoaXMubW91c2VEb3duUHJvbXB0U2xhc2hDb21tYW5kID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoIW1vdXNlRG93blByb21wdFNsYXNoQ29tbWFuZCB8fCBlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUIHx8ICFlLnRhcmdldC5wb3NpdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghbW91c2VEb3duUHJvbXB0U2xhc2hDb21tYW5kLnJhbmdlLmNvbnRhaW5zUG9zaXRpb24oZS50YXJnZXQucG9zaXRpb24pIHx8ICFQb3NpdGlvbi5lcXVhbHMobW91c2VEb3duUHJvbXB0U2xhc2hDb21tYW5kLnBvc2l0aW9uLCBlLnRhcmdldC5wb3NpdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR2b2lkIHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IG1vdXNlRG93blByb21wdFNsYXNoQ29tbWFuZC51cmkgfSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEFnZW50U2VydmljZS5vbkRpZENoYW5nZUFnZW50cygoKSA9PiB0aGlzLnRyaWdnZXJJbnB1dEVkaXRvckRlY29yYXRpb25zVXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5vbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMoKGUpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMud2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0aWYgKHNlc3Npb25SZXNvdXJjZSAmJiBlLnNlc3Npb25UeXBlID09PSBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLnRyaWdnZXJJbnB1dEVkaXRvckRlY29yYXRpb25zVXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8vIFdhdGNoIGZvciBjaGFuZ2VzIHRvIHRoZSBjdXJyZW50IG1vZGUgYW5kIGl0cyBwcm9wZXJ0aWVzXG5cdFx0XHRjb25zdCBjdXJyZW50TW9kZSA9IHRoaXMud2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjdXJyZW50TW9kZSkge1xuXHRcdFx0XHQvLyBBbHNvIHdhdGNoIHRoZSBtb2RlJ3MgZGVzY3JpcHRpb24gdG8gcmVhY3QgdG8gYW55IGNoYW5nZXNcblx0XHRcdFx0Y3VycmVudE1vZGUuZGVzY3JpcHRpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVHJpZ2dlciBkZWNvcmF0aW9uIHVwZGF0ZSB3aGVuIG1vZGUgb3IgaXRzIHByb3BlcnRpZXMgY2hhbmdlXG5cdFx0XHR0aGlzLnRyaWdnZXJJbnB1dEVkaXRvckRlY29yYXRpb25zVXBkYXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5yZWdpc3RlclZpZXdNb2RlbExpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclZpZXdNb2RlbExpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdNb2RlbERpc3Bvc2FibGVzLnZhbHVlID0gdGhpcy53aWRnZXQudmlld01vZGVsPy5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlPy5raW5kID09PSAnY2hhbmdlUGxhY2Vob2xkZXInIHx8IGU/LmtpbmQgPT09ICdpbml0aWFsaXplJykge1xuXHRcdFx0XHR0aGlzLnRyaWdnZXJJbnB1dEVkaXRvckRlY29yYXRpb25zVXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyZWREZWNvcmF0aW9uVHlwZXMoKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckRlY29yYXRpb25UeXBlKGRlY29yYXRpb25EZXNjcmlwdGlvbiwgcGxhY2Vob2xkZXJEZWNvcmF0aW9uVHlwZSwge30pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvblR5cGUoZGVjb3JhdGlvbkRlc2NyaXB0aW9uLCBzbGFzaENvbW1hbmRUZXh0RGVjb3JhdGlvblR5cGUsIHtcblx0XHRcdGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKGNoYXRTbGFzaENvbW1hbmRGb3JlZ3JvdW5kKSxcblx0XHRcdGJhY2tncm91bmRDb2xvcjogdGhlbWVDb2xvckZyb21JZChjaGF0U2xhc2hDb21tYW5kQmFja2dyb3VuZCksXG5cdFx0XHRib3JkZXJSYWRpdXM6ICczcHgnXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29kZUVkaXRvclNlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uVHlwZShkZWNvcmF0aW9uRGVzY3JpcHRpb24sIGNsaWNrYWJsZVNsYXNoUHJvbXB0VGV4dERlY29yYXRpb25UeXBlLCB7XG5cdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChjaGF0U2xhc2hDb21tYW5kRm9yZWdyb3VuZCksXG5cdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoY2hhdFNsYXNoQ29tbWFuZEJhY2tncm91bmQpLFxuXHRcdFx0Ym9yZGVyUmFkaXVzOiAnM3B4Jyxcblx0XHRcdGN1cnNvcjogJ3BvaW50ZXInXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29kZUVkaXRvclNlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uVHlwZShkZWNvcmF0aW9uRGVzY3JpcHRpb24sIHZhcmlhYmxlVGV4dERlY29yYXRpb25UeXBlLCB7XG5cdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChjaGF0U2xhc2hDb21tYW5kRm9yZWdyb3VuZCksXG5cdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoY2hhdFNsYXNoQ29tbWFuZEJhY2tncm91bmQpLFxuXHRcdFx0Ym9yZGVyUmFkaXVzOiAnM3B4J1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvblR5cGUoZGVjb3JhdGlvbkRlc2NyaXB0aW9uLCBkeW5hbWljVmFyaWFibGVEZWNvcmF0aW9uVHlwZSwge1xuXHRcdFx0Y29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoY2hhdFNsYXNoQ29tbWFuZEZvcmVncm91bmQpLFxuXHRcdFx0YmFja2dyb3VuZENvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKGNoYXRTbGFzaENvbW1hbmRCYWNrZ3JvdW5kKSxcblx0XHRcdGJvcmRlclJhZGl1czogJzNweCcsXG5cdFx0XHRyYW5nZUJlaGF2aW9yOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlc1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UGxhY2Vob2xkZXJDb2xvcigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBnZXRJbnB1dFBsYWNlaG9sZGVyQ29sb3IodGhpcy50aGVtZVNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSB0cmlnZ2VySW5wdXRFZGl0b3JEZWNvcmF0aW9uc1VwZGF0ZSgpOiB2b2lkIHtcblx0XHQvLyB1cGRhdGUgcGxhY2Vob2xkZXIgZGVjb3JhdGlvbnMgaW1tZWRpYXRlbHksIGluIHN5bmNcblx0XHR0aGlzLnVwZGF0ZUlucHV0UGxhY2Vob2xkZXJEZWNvcmF0aW9uKCk7XG5cblx0XHQvLyB3aXRoIGEgZGVsYXksIHVwZGF0ZSB0aGUgcmVzdCBvZiB0aGUgZGVjb3JhdGlvbnNcblx0XHR0aGlzLnVwZGF0ZVRocm90dGxlLnRyaWdnZXIodG9rZW4gPT4gdGhpcy51cGRhdGVBc3luY0lucHV0RWRpdG9yRGVjb3JhdGlvbnModG9rZW4pKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0Ly8gVGhyb3R0bGVkIGRlbGF5ZXJzIHJlamVjdCB3aXRoIENhbmNlbGxhdGlvbkVycm9yIHdoZW4gZGlzcG9zZWQgbWlkLWZsaWdodC5cblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSW5wdXRQbGFjZWhvbGRlckRlY29yYXRpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5wdXRWYWx1ZSA9IHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLmdldFZhbHVlKCk7XG5cblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLndpZGdldC52aWV3TW9kZWw7XG5cdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdHRoaXMudXBkYXRlQXJpYVBsYWNlaG9sZGVyKHVuZGVmaW5lZCk7XG5cdFx0XHQvLyBObyBib3VuZCB2aWV3IG1vZGVsIHlldCAoZS5nLiBzZXNzaW9uIHN0aWxsIGxvYWRpbmcpOiBjbGVhciBhbnkgc3RhbGVcblx0XHRcdC8vIHBsYWNlaG9sZGVyIGRlY29yYXRpb24gc28gaXQgZG9lc24ndCByZW5kZXIgb3ZlciB0eXBlZCB0ZXh0LiBTZWUgIzMyNTMyMy5cblx0XHRcdGlmIChpbnB1dFZhbHVlKSB7XG5cdFx0XHRcdHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLnNldERlY29yYXRpb25zQnlUeXBlKGRlY29yYXRpb25EZXNjcmlwdGlvbiwgcGxhY2Vob2xkZXJEZWNvcmF0aW9uVHlwZSwgW10pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghaW5wdXRWYWx1ZSkge1xuXHRcdFx0Ly8gSWYgdGhlIGVkaXRvcidzIHBsYWNlaG9sZGVyIG9wdGlvbiBpcyBzZXQgKGUuZy4gZGljdGF0aW9uIHNob3dzXG5cdFx0XHQvLyBcIkxpc3RlbmluZ1x1MjAyNlwiKSwgUGxhY2Vob2xkZXJUZXh0Q29udHJpYnV0aW9uIHJlbmRlcnMgaXQgYWxyZWFkeTsgc2tpcFxuXHRcdFx0Ly8gdGhlIGRlY29yYXRpb24gcGxhY2Vob2xkZXIgc28gdGhlIHR3byBkb24ndCByZW5kZXIgb24gdG9wIG9mIGVhY2hcblx0XHRcdC8vIG90aGVyLlxuXHRcdFx0aWYgKHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucGxhY2Vob2xkZXIpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQXJpYVBsYWNlaG9sZGVyKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLnNldERlY29yYXRpb25zQnlUeXBlKGRlY29yYXRpb25EZXNjcmlwdGlvbiwgcGxhY2Vob2xkZXJEZWNvcmF0aW9uVHlwZSwgW10pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGUgPSB0aGlzLndpZGdldC5pbnB1dC5jdXJyZW50TW9kZU9icy5nZXQoKTtcblx0XHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gbW9kZS5hcmd1bWVudEhpbnQ/LmdldCgpID8/IG1vZGUuZGVzY3JpcHRpb24uZ2V0KCkgPz8gJyc7XG5cdFx0XHRjb25zdCBkaXNwbGF5UGxhY2Vob2xkZXIgPSB2aWV3TW9kZWwuaW5wdXRQbGFjZWhvbGRlciB8fCBwbGFjZWhvbGRlcjtcblxuXHRcdFx0Y29uc3QgZGVjb3JhdGlvbjogSURlY29yYXRpb25PcHRpb25zW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRyYW5nZToge1xuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiAxMDAwXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZW5kZXJPcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRhZnRlcjoge1xuXHRcdFx0XHRcdFx0XHRjb250ZW50VGV4dDogZGlzcGxheVBsYWNlaG9sZGVyLFxuXHRcdFx0XHRcdFx0XHRjb2xvcjogdGhpcy5nZXRQbGFjZWhvbGRlckNvbG9yKClcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF07XG5cdFx0XHR0aGlzLnVwZGF0ZUFyaWFQbGFjZWhvbGRlcihkaXNwbGF5UGxhY2Vob2xkZXIgfHwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLnNldERlY29yYXRpb25zQnlUeXBlKGRlY29yYXRpb25EZXNjcmlwdGlvbiwgcGxhY2Vob2xkZXJEZWNvcmF0aW9uVHlwZSwgZGVjb3JhdGlvbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVBcmlhUGxhY2Vob2xkZXIodW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHBhcnNlZFJlcXVlc3QgPSB0aGlzLndpZGdldC5wYXJzZWRJbnB1dC5wYXJ0cztcblxuXHRcdGxldCBwbGFjZWhvbGRlckRlY29yYXRpb246IElEZWNvcmF0aW9uT3B0aW9uc1tdIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFnZW50UGFydCA9IHBhcnNlZFJlcXVlc3QuZmluZCgocCk6IHAgaXMgQ2hhdFJlcXVlc3RBZ2VudFBhcnQgPT4gcCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRQYXJ0KTtcblx0XHRjb25zdCBhZ2VudFN1YmNvbW1hbmRQYXJ0ID0gcGFyc2VkUmVxdWVzdC5maW5kKChwKTogcCBpcyBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQgPT4gcCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydCk7XG5cblx0XHRjb25zdCBvbmx5QWdlbnRBbmRXaGl0ZXNwYWNlID0gYWdlbnRQYXJ0ICYmIHBhcnNlZFJlcXVlc3QuZXZlcnkocCA9PiBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RUZXh0UGFydCAmJiAhcC50ZXh0LnRyaW0oKS5sZW5ndGggfHwgcCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRQYXJ0KTtcblx0XHRpZiAob25seUFnZW50QW5kV2hpdGVzcGFjZSkge1xuXHRcdFx0Ly8gQWdlbnQgcmVmZXJlbmNlIHdpdGggbm8gb3RoZXIgdGV4dCAtIHNob3cgdGhlIHBsYWNlaG9sZGVyXG5cdFx0XHRjb25zdCBpc0ZvbGxvd3VwU2xhc2hDb21tYW5kID0gdGhpcy5wcmV2aW91c2x5VXNlZEFnZW50cy5oYXMoYWdlbnRBbmRDb21tYW5kVG9LZXkoYWdlbnRQYXJ0LmFnZW50LCB1bmRlZmluZWQpKTtcblx0XHRcdGNvbnN0IHNob3VsZFJlbmRlckZvbGxvd3VwUGxhY2Vob2xkZXIgPSBpc0ZvbGxvd3VwU2xhc2hDb21tYW5kICYmIGFnZW50UGFydC5hZ2VudC5tZXRhZGF0YS5mb2xsb3d1cFBsYWNlaG9sZGVyO1xuXHRcdFx0aWYgKGFnZW50UGFydC5hZ2VudC5kZXNjcmlwdGlvbiAmJiBleGFjdGx5T25lU3BhY2VBZnRlclBhcnQocGFyc2VkUmVxdWVzdCwgYWdlbnRQYXJ0KSkge1xuXHRcdFx0XHRwbGFjZWhvbGRlckRlY29yYXRpb24gPSBbe1xuXHRcdFx0XHRcdHJhbmdlOiBnZXRSYW5nZUZvclBsYWNlaG9sZGVyKGFnZW50UGFydC5lZGl0b3JSYW5nZSksXG5cdFx0XHRcdFx0cmVuZGVyT3B0aW9uczoge1xuXHRcdFx0XHRcdFx0YWZ0ZXI6IHtcblx0XHRcdFx0XHRcdFx0Y29udGVudFRleHQ6IHNob3VsZFJlbmRlckZvbGxvd3VwUGxhY2Vob2xkZXIgPyBhZ2VudFBhcnQuYWdlbnQubWV0YWRhdGEuZm9sbG93dXBQbGFjZWhvbGRlciA6IGFnZW50UGFydC5hZ2VudC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0Y29sb3I6IHRoaXMuZ2V0UGxhY2Vob2xkZXJDb2xvcigpLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb25seUFnZW50QW5kQWdlbnRDb21tYW5kQW5kV2hpdGVzcGFjZSA9IGFnZW50UGFydCAmJiBhZ2VudFN1YmNvbW1hbmRQYXJ0ICYmIHBhcnNlZFJlcXVlc3QuZXZlcnkocCA9PiBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RUZXh0UGFydCAmJiAhcC50ZXh0LnRyaW0oKS5sZW5ndGggfHwgcCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRQYXJ0IHx8IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQpO1xuXHRcdGlmIChvbmx5QWdlbnRBbmRBZ2VudENvbW1hbmRBbmRXaGl0ZXNwYWNlKSB7XG5cdFx0XHQvLyBBZ2VudCByZWZlcmVuY2UgYW5kIHN1YmNvbW1hbmQgd2l0aCBubyBvdGhlciB0ZXh0IC0gc2hvdyB0aGUgcGxhY2Vob2xkZXJcblx0XHRcdGNvbnN0IGlzRm9sbG93dXBTbGFzaENvbW1hbmQgPSB0aGlzLnByZXZpb3VzbHlVc2VkQWdlbnRzLmhhcyhhZ2VudEFuZENvbW1hbmRUb0tleShhZ2VudFBhcnQuYWdlbnQsIGFnZW50U3ViY29tbWFuZFBhcnQuY29tbWFuZC5uYW1lKSk7XG5cdFx0XHRjb25zdCBzaG91bGRSZW5kZXJGb2xsb3d1cFBsYWNlaG9sZGVyID0gaXNGb2xsb3d1cFNsYXNoQ29tbWFuZCAmJiBhZ2VudFN1YmNvbW1hbmRQYXJ0LmNvbW1hbmQuZm9sbG93dXBQbGFjZWhvbGRlcjtcblx0XHRcdGlmIChhZ2VudFN1YmNvbW1hbmRQYXJ0Py5jb21tYW5kLmRlc2NyaXB0aW9uICYmIGV4YWN0bHlPbmVTcGFjZUFmdGVyUGFydChwYXJzZWRSZXF1ZXN0LCBhZ2VudFN1YmNvbW1hbmRQYXJ0KSkge1xuXHRcdFx0XHRwbGFjZWhvbGRlckRlY29yYXRpb24gPSBbe1xuXHRcdFx0XHRcdHJhbmdlOiBnZXRSYW5nZUZvclBsYWNlaG9sZGVyKGFnZW50U3ViY29tbWFuZFBhcnQuZWRpdG9yUmFuZ2UpLFxuXHRcdFx0XHRcdHJlbmRlck9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0XHRcdGNvbnRlbnRUZXh0OiBzaG91bGRSZW5kZXJGb2xsb3d1cFBsYWNlaG9sZGVyID8gYWdlbnRTdWJjb21tYW5kUGFydC5jb21tYW5kLmZvbGxvd3VwUGxhY2Vob2xkZXIgOiBhZ2VudFN1YmNvbW1hbmRQYXJ0LmNvbW1hbmQuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRcdGNvbG9yOiB0aGlzLmdldFBsYWNlaG9sZGVyQ29sb3IoKSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG9ubHlBZ2VudENvbW1hbmRBbmRXaGl0ZXNwYWNlID0gYWdlbnRTdWJjb21tYW5kUGFydCAmJiBwYXJzZWRSZXF1ZXN0LmV2ZXJ5KHAgPT4gcCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0VGV4dFBhcnQgJiYgIXAudGV4dC50cmltKCkubGVuZ3RoIHx8IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQpO1xuXHRcdGlmIChvbmx5QWdlbnRDb21tYW5kQW5kV2hpdGVzcGFjZSkge1xuXHRcdFx0Ly8gQWdlbnQgc3ViY29tbWFuZCB3aXRoIG5vIG90aGVyIHRleHQgLSBzaG93IHRoZSBwbGFjZWhvbGRlclxuXHRcdFx0aWYgKGFnZW50U3ViY29tbWFuZFBhcnQ/LmNvbW1hbmQuZGVzY3JpcHRpb24gJiYgZXhhY3RseU9uZVNwYWNlQWZ0ZXJQYXJ0KHBhcnNlZFJlcXVlc3QsIGFnZW50U3ViY29tbWFuZFBhcnQpKSB7XG5cdFx0XHRcdHBsYWNlaG9sZGVyRGVjb3JhdGlvbiA9IFt7XG5cdFx0XHRcdFx0cmFuZ2U6IGdldFJhbmdlRm9yUGxhY2Vob2xkZXIoYWdlbnRTdWJjb21tYW5kUGFydC5lZGl0b3JSYW5nZSksXG5cdFx0XHRcdFx0cmVuZGVyT3B0aW9uczoge1xuXHRcdFx0XHRcdFx0YWZ0ZXI6IHtcblx0XHRcdFx0XHRcdFx0Y29udGVudFRleHQ6IGFnZW50U3ViY29tbWFuZFBhcnQuY29tbWFuZC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0Y29sb3I6IHRoaXMuZ2V0UGxhY2Vob2xkZXJDb2xvcigpLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLnNldERlY29yYXRpb25zQnlUeXBlKGRlY29yYXRpb25EZXNjcmlwdGlvbiwgcGxhY2Vob2xkZXJEZWNvcmF0aW9uVHlwZSwgcGxhY2Vob2xkZXJEZWNvcmF0aW9uID8/IFtdKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlQXN5bmNJbnB1dEVkaXRvckRlY29yYXRpb25zKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY2xpY2thYmxlUHJvbXB0U2xhc2hDb21tYW5kID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLnNldERlY29yYXRpb25zQnlUeXBlKGRlY29yYXRpb25EZXNjcmlwdGlvbiwgY2xpY2thYmxlU2xhc2hQcm9tcHRUZXh0RGVjb3JhdGlvblR5cGUsIFtdKTtcblxuXHRcdGNvbnN0IHBhcnNlZFJlcXVlc3QgPSB0aGlzLndpZGdldC5wYXJzZWRJbnB1dC5wYXJ0cztcblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLndpZGdldC52aWV3TW9kZWw7XG5cdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhZ2VudFBhcnQgPSBwYXJzZWRSZXF1ZXN0LmZpbmQoKHApOiBwIGlzIENoYXRSZXF1ZXN0QWdlbnRQYXJ0ID0+IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdEFnZW50UGFydCk7XG5cdFx0Y29uc3QgYWdlbnRTdWJjb21tYW5kUGFydCA9IHBhcnNlZFJlcXVlc3QuZmluZCgocCk6IHAgaXMgQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0ID0+IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQpO1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFBhcnQgPSBwYXJzZWRSZXF1ZXN0LmZpbmQoKHApOiBwIGlzIENoYXRSZXF1ZXN0U2xhc2hDb21tYW5kUGFydCA9PiBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0KTtcblx0XHRjb25zdCBzbGFzaFByb21wdFBhcnQgPSBwYXJzZWRSZXF1ZXN0LmZpbmQoKHApOiBwIGlzIENoYXRSZXF1ZXN0U2xhc2hQcm9tcHRQYXJ0ID0+IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFNsYXNoUHJvbXB0UGFydCk7XG5cblx0XHQvLyBmaXJzdCwgZmV0Y2ggYWxsIGFzeW5jIGNvbnRleHRcblx0XHRjb25zdCBwcm9tcHRTbGFzaENvbW1hbmQgPSBzbGFzaFByb21wdFBhcnQgPyBhd2FpdCB0aGlzLmN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5yZXNvbHZlUHJvbXB0U2xhc2hDb21tYW5kKHNsYXNoUHJvbXB0UGFydC5uYW1lLCB2aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLCB0b2tlbikgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHQvLyBhIG5ldyB1cGRhdGUgY2FtZSBpbiB3aGlsZSB3ZSB3ZXJlIHdhaXRpbmdcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc2xhc2hQcm9tcHRQYXJ0ICYmIHByb21wdFNsYXNoQ29tbWFuZCkge1xuXHRcdFx0Y29uc3Qgb25seVByb21wdENvbW1hbmRBbmRXaGl0ZXNwYWNlID0gc2xhc2hQcm9tcHRQYXJ0ICYmIHBhcnNlZFJlcXVlc3QuZXZlcnkoaXNXaGl0ZXNwYWNlT3JQcm9tcHRQYXJ0KTtcblx0XHRcdGlmIChvbmx5UHJvbXB0Q29tbWFuZEFuZFdoaXRlc3BhY2UgJiYgZXhhY3RseU9uZVNwYWNlQWZ0ZXJQYXJ0KHBhcnNlZFJlcXVlc3QsIHNsYXNoUHJvbXB0UGFydCkgJiYgcHJvbXB0U2xhc2hDb21tYW5kKSB7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gcHJvbXB0U2xhc2hDb21tYW5kLmFyZ3VtZW50SGludDtcblx0XHRcdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0RGVjb3JhdGlvbnNCeVR5cGUoZGVjb3JhdGlvbkRlc2NyaXB0aW9uLCBwbGFjZWhvbGRlckRlY29yYXRpb25UeXBlLCBbe1xuXHRcdFx0XHRcdFx0cmFuZ2U6IGdldFJhbmdlRm9yUGxhY2Vob2xkZXIoc2xhc2hQcm9tcHRQYXJ0LmVkaXRvclJhbmdlKSxcblx0XHRcdFx0XHRcdHJlbmRlck9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0YWZ0ZXI6IHtcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50VGV4dDogZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRcdFx0Y29sb3I6IHRoaXMuZ2V0UGxhY2Vob2xkZXJDb2xvcigpLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dERlY29yYXRpb25zOiBJRGVjb3JhdGlvbk9wdGlvbnNbXSB8IHVuZGVmaW5lZCA9IFtdO1xuXHRcdGlmIChhZ2VudFBhcnQpIHtcblx0XHRcdHRleHREZWNvcmF0aW9ucy5wdXNoKHsgcmFuZ2U6IGFnZW50UGFydC5lZGl0b3JSYW5nZSB9KTtcblx0XHR9XG5cdFx0aWYgKGFnZW50U3ViY29tbWFuZFBhcnQpIHtcblx0XHRcdHRleHREZWNvcmF0aW9ucy5wdXNoKHsgcmFuZ2U6IGFnZW50U3ViY29tbWFuZFBhcnQuZWRpdG9yUmFuZ2UsIGhvdmVyTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGFnZW50U3ViY29tbWFuZFBhcnQuY29tbWFuZC5kZXNjcmlwdGlvbikgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHNsYXNoQ29tbWFuZFBhcnQpIHtcblx0XHRcdHRleHREZWNvcmF0aW9ucy5wdXNoKHsgcmFuZ2U6IHNsYXNoQ29tbWFuZFBhcnQuZWRpdG9yUmFuZ2UsIGhvdmVyTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKHNsYXNoQ29tbWFuZFBhcnQuc2xhc2hDb21tYW5kLmRldGFpbCkgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHNsYXNoUHJvbXB0UGFydCAmJiBwcm9tcHRTbGFzaENvbW1hbmQpIHtcblx0XHRcdHRoaXMuY2xpY2thYmxlUHJvbXB0U2xhc2hDb21tYW5kID0ge1xuXHRcdFx0XHRyYW5nZTogUmFuZ2UubGlmdChzbGFzaFByb21wdFBhcnQuZWRpdG9yUmFuZ2UpLFxuXHRcdFx0XHR1cmk6IHByb21wdFNsYXNoQ29tbWFuZC51cmksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcHJvbXB0SG92ZXJNZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cdFx0XHRpZiAocHJvbXB0U2xhc2hDb21tYW5kLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdHByb21wdEhvdmVyTWVzc2FnZS5hcHBlbmRUZXh0KHByb21wdFNsYXNoQ29tbWFuZC5kZXNjcmlwdGlvbik7XG5cdFx0XHRcdHByb21wdEhvdmVyTWVzc2FnZS5hcHBlbmRUZXh0KCdcXG4nKTtcblx0XHRcdH1cblx0XHRcdHByb21wdEhvdmVyTWVzc2FnZS5hcHBlbmRUZXh0KGxvY2FsaXplKFxuXHRcdFx0XHQnY2hhdElucHV0LnByb21wdFNsYXNoQ29tbWFuZC5vcGVuJyxcblx0XHRcdFx0XCJDbGljayB0byBvcGVuIHswfVwiLFxuXHRcdFx0XHR0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChwcm9tcHRTbGFzaENvbW1hbmQudXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pXG5cdFx0XHQpKTtcblx0XHRcdGNvbnN0IHByb21wdERlY29yYXRpb24gPSB7XG5cdFx0XHRcdHJhbmdlOiBzbGFzaFByb21wdFBhcnQuZWRpdG9yUmFuZ2UsXG5cdFx0XHRcdGhvdmVyTWVzc2FnZTogcHJvbXB0SG92ZXJNZXNzYWdlLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLnNldERlY29yYXRpb25zQnlUeXBlKGRlY29yYXRpb25EZXNjcmlwdGlvbiwgY2xpY2thYmxlU2xhc2hQcm9tcHRUZXh0RGVjb3JhdGlvblR5cGUsIFtwcm9tcHREZWNvcmF0aW9uXSk7XG5cdFx0fVxuXG5cdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0RGVjb3JhdGlvbnNCeVR5cGUoZGVjb3JhdGlvbkRlc2NyaXB0aW9uLCBzbGFzaENvbW1hbmRUZXh0RGVjb3JhdGlvblR5cGUsIHRleHREZWNvcmF0aW9ucyk7XG5cblx0XHRjb25zdCB2YXJEZWNvcmF0aW9uczogSURlY29yYXRpb25PcHRpb25zW10gPSBbXTtcblx0XHRjb25zdCB0b29sUGFydHMgPSBwYXJzZWRSZXF1ZXN0LmZpbHRlcigocCk6IHAgaXMgQ2hhdFJlcXVlc3RUb29sUGFydCA9PiBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RUb29sUGFydCB8fCBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RUb29sU2V0UGFydCk7XG5cdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xQYXJ0cykge1xuXHRcdFx0dmFyRGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlOiB0b29sLmVkaXRvclJhbmdlIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGR5bmFtaWNWYXJpYWJsZVBhcnRzID0gcGFyc2VkUmVxdWVzdC5maWx0ZXIoKHApOiBwIGlzIENoYXRSZXF1ZXN0RHluYW1pY1ZhcmlhYmxlUGFydCA9PiBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0KTtcblxuXHRcdGNvbnN0IGlzRWRpdGluZ1ByZXZpb3VzUmVxdWVzdCA9ICEhdmlld01vZGVsLmVkaXRpbmc7XG5cdFx0aWYgKGlzRWRpdGluZ1ByZXZpb3VzUmVxdWVzdCkge1xuXHRcdFx0Zm9yIChjb25zdCB2YXJpYWJsZSBvZiBkeW5hbWljVmFyaWFibGVQYXJ0cykge1xuXHRcdFx0XHR2YXJEZWNvcmF0aW9ucy5wdXNoKHsgcmFuZ2U6IHZhcmlhYmxlLmVkaXRvclJhbmdlLCBob3Zlck1lc3NhZ2U6IFVSSS5pc1VyaSh2YXJpYWJsZS5kYXRhKSA/IG5ldyBNYXJrZG93blN0cmluZyh0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh2YXJpYWJsZS5kYXRhLCB7IHJlbGF0aXZlOiB0cnVlIH0pKSA6IHVuZGVmaW5lZCB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLndpZGdldC5pbnB1dEVkaXRvci5zZXREZWNvcmF0aW9uc0J5VHlwZShkZWNvcmF0aW9uRGVzY3JpcHRpb24sIHZhcmlhYmxlVGV4dERlY29yYXRpb25UeXBlLCB2YXJEZWNvcmF0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFyaWFQbGFjZWhvbGRlcih2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgbmF0aXZlRWRpdENvbnRleHQgPSBOYXRpdmVFZGl0Q29udGV4dFJlZ2lzdHJ5LmdldCh0aGlzLndpZGdldC5pbnB1dEVkaXRvci5nZXRJZCgpKTtcblx0XHRpZiAobmF0aXZlRWRpdENvbnRleHQpIHtcblx0XHRcdGNvbnN0IGRvbU5vZGUgPSBuYXRpdmVFZGl0Q29udGV4dC5kb21Ob2RlLmRvbU5vZGU7XG5cdFx0XHRpZiAodmFsdWUgJiYgdmFsdWUudHJpbSgpLmxlbmd0aCkge1xuXHRcdFx0XHRkb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1wbGFjZWhvbGRlcicsIHZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRvbU5vZGUucmVtb3ZlQXR0cmlidXRlKCdhcmlhLXBsYWNlaG9sZGVyJyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHRleHRBcmVhRWRpdENvbnRleHQgPSBUZXh0QXJlYUVkaXRDb250ZXh0UmVnaXN0cnkuZ2V0KHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLmdldElkKCkpO1xuXHRcdFx0aWYgKHRleHRBcmVhRWRpdENvbnRleHQpIHtcblx0XHRcdFx0Y29uc3QgdGV4dEFyZWEgPSB0ZXh0QXJlYUVkaXRDb250ZXh0LnRleHRBcmVhLmRvbU5vZGU7XG5cdFx0XHRcdGlmICh2YWx1ZSAmJiB2YWx1ZS50cmltKCkubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGV4dEFyZWEuc2V0QXR0cmlidXRlKCdhcmlhLXBsYWNlaG9sZGVyJywgdmFsdWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRleHRBcmVhLnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1wbGFjZWhvbGRlcicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIElucHV0RWRpdG9yU2xhc2hDb21tYW5kTW9kZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgaWQgPSAnSW5wdXRFZGl0b3JTbGFzaENvbW1hbmRNb2RlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdpZGdldDogSUNoYXRXaWRnZXRcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndpZGdldC5vbkRpZENoYW5nZUFnZW50KGUgPT4ge1xuXHRcdFx0aWYgKGUuc2xhc2hDb21tYW5kICYmIGUuc2xhc2hDb21tYW5kLmlzU3RpY2t5IHx8ICFlLnNsYXNoQ29tbWFuZCAmJiBlLmFnZW50Lm1ldGFkYXRhLmlzU3RpY2t5KSB7XG5cdFx0XHRcdHRoaXMucmVwb3B1bGF0ZUFnZW50Q29tbWFuZChlLmFnZW50LCBlLnNsYXNoQ29tbWFuZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2lkZ2V0Lm9uRGlkU3VibWl0QWdlbnQoZSA9PiB7XG5cdFx0XHR0aGlzLnJlcG9wdWxhdGVBZ2VudENvbW1hbmQoZS5hZ2VudCwgZS5zbGFzaENvbW1hbmQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVwb3B1bGF0ZUFnZW50Q29tbWFuZChhZ2VudDogSUNoYXRBZ2VudERhdGEsIHNsYXNoQ29tbWFuZDogSUNoYXRBZ2VudENvbW1hbmQgfCB1bmRlZmluZWQpIHtcblx0XHQvLyBNYWtlIHN1cmUgd2UgZG9uJ3QgcmVwb3B1bGF0ZSBpZiB0aGUgdXNlciBhbHJlYWR5IGhhcyBzb21ldGhpbmcgaW4gdGhlIGlucHV0XG5cdFx0aWYgKHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLmdldFZhbHVlKCkudHJpbSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHNsYXNoQ29tbWFuZCAmJiBzbGFzaENvbW1hbmQuaXNTdGlja3kpIHtcblx0XHRcdHZhbHVlID0gYCR7Y2hhdEFnZW50TGVhZGVyfSR7YWdlbnQubmFtZX0gJHtjaGF0U3ViY29tbWFuZExlYWRlcn0ke3NsYXNoQ29tbWFuZC5uYW1lfSBgO1xuXHRcdH0gZWxzZSBpZiAoYWdlbnQubWV0YWRhdGEuaXNTdGlja3kpIHtcblx0XHRcdHZhbHVlID0gYCR7Y2hhdEFnZW50TGVhZGVyfSR7YWdlbnQubmFtZX0gYDtcblx0XHR9XG5cblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLnNldFZhbHVlKHZhbHVlKTtcblx0XHRcdHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMSwgY29sdW1uOiB2YWx1ZS5sZW5ndGggKyAxIH0pO1xuXHRcdH1cblx0fVxufVxuXG5DaGF0V2lkZ2V0LkNPTlRSSUJTLnB1c2goSW5wdXRFZGl0b3JEZWNvcmF0aW9ucywgSW5wdXRFZGl0b3JTbGFzaENvbW1hbmRNb2RlKTtcblxuY2xhc3MgQ2hhdFRva2VuRGVsZXRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHB1YmxpYyByZWFkb25seSBpZCA9ICdjaGF0VG9rZW5EZWxldGVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdpZGdldDogSUNoYXRXaWRnZXQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRsZXQgcHJldkluc2VydFRva2VuUmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkO1xuXG5cdFx0Ly8gQSBzaW1wbGUgaGV1cmlzdGljIHRvIGRlbGV0ZSB0aGUgcHJldmlvdXMgaW5zZXJ0IHRva2VuIHdoZW4gdGhlIHVzZXIgcHJlc3NlcyBiYWNrc3BhY2UuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoZSA9PiB7XG5cdFx0XHRsZXQgaW5zZXJ0ZWRUb2tlblJhbmdlOiBSYW5nZSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gRG9uJ3QgdHJ5IHRvIGhhbmRsZSBtdWx0aS1jdXJzb3IgZWRpdHMgcmlnaHQgbm93XG5cdFx0XHRpZiAoZS5jaGFuZ2VzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRjb25zdCBjaGFuZ2UgPSBlLmNoYW5nZXNbMF07XG5cdFx0XHRcdGlmIChjaGFuZ2UudGV4dC5sZW5ndGggPiAwICYmIGNoYW5nZS5yYW5nZUxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdC8vIEEgZnVsbCBzbGFzaCBjb21tYW5kIG9yIGFnZW50IHJlZmVyZW5jZSB3YXMganVzdCBpbnNlcnRlZCAtIHN0b3JlIGl0IHNvIHRoYXQgaWYgdGhlIHVzZXIgaW1tZWRpYXRlbHkgZGVsZXRlcyBpdCwgd2UgY2FuIGRlbGV0ZSB0aGUgd2hvbGUgdGhpbmcgaW5zdGVhZCBvZiBqdXN0IG9uZSBjaGFyYWN0ZXJcblx0XHRcdFx0XHRpZiAoc2xhc2hSZWcudGVzdChjaGFuZ2UudGV4dCkgfHwgYWdlbnRSZWcudGVzdChjaGFuZ2UudGV4dCkgfHwgdmFyaWFibGVSZWcudGVzdChjaGFuZ2UudGV4dCkpIHtcblx0XHRcdFx0XHRcdGluc2VydGVkVG9rZW5SYW5nZSA9IG5ldyBSYW5nZShjaGFuZ2UucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjaGFuZ2UucmFuZ2Uuc3RhcnRDb2x1bW4sIGNoYW5nZS5yYW5nZS5lbmRMaW5lTnVtYmVyLCBjaGFuZ2UucmFuZ2Uuc3RhcnRDb2x1bW4gKyBjaGFuZ2UudGV4dC5sZW5ndGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChjaGFuZ2UudGV4dC5sZW5ndGggPT09IDAgJiYgcHJldkluc2VydFRva2VuUmFuZ2UgJiYgY2hhbmdlLnJhbmdlLmVuZENvbHVtbiA9PT0gcHJldkluc2VydFRva2VuUmFuZ2UuZW5kQ29sdW1uKSB7XG5cdFx0XHRcdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3IuZXhlY3V0ZUVkaXRzKHRoaXMuaWQsIFt7XG5cdFx0XHRcdFx0XHRyYW5nZTogcHJldkluc2VydFRva2VuUmFuZ2UsXG5cdFx0XHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdFx0XHR9XSk7XG5cdFx0XHRcdFx0dGhpcy53aWRnZXQucmVmcmVzaFBhcnNlZElucHV0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHByZXZJbnNlcnRUb2tlblJhbmdlID0gaW5zZXJ0ZWRUb2tlblJhbmdlO1xuXHRcdH0pKTtcblx0fVxufVxuQ2hhdFdpZGdldC5DT05UUklCUy5wdXNoKENoYXRUb2tlbkRlbGV0ZXIpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBRXRCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCLDhCQUE4QjtBQUNqRSxTQUE0Qyx5QkFBeUI7QUFDckUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNEIsa0NBQWtDO0FBQ3ZFLFNBQVMsc0JBQXNCLGdDQUFnQyxnQ0FBZ0MsNkJBQTZCLDRCQUE0QixxQkFBcUIscUJBQXFCLHdCQUFnRCxpQkFBaUIsNEJBQTRCO0FBQy9SLFNBQVMsVUFBVSxVQUFVLG1CQUFtQjtBQUVoRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG1DQUFtQztBQUU1QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwQjtB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
