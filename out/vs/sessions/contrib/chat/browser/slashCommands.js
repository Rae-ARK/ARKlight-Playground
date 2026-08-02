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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { CompletionItemKind } from "../../../../editor/common/languages.js";
import { InjectedTextCursorStops } from "../../../../editor/common/model.js";
import { Range } from "../../../../editor/common/core/range.js";
import { getWordAtText } from "../../../../editor/common/core/wordHelper.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { localize } from "../../../../nls.js";
import { AICustomizationManagementCommands, AICustomizationManagementSection } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js";
import { IChatSubmitRequestHandlerService } from "../../../../workbench/contrib/chat/browser/chatSubmitRequestHandlerService.js";
import { INewChatModelPickerService } from "./newChatModelPicker.js";
import { isAgentHostTarget } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { getChatSessionType } from "../../../../workbench/contrib/chat/common/model/chatUri.js";
import { ISessionContext } from "../../../services/sessions/browser/sessionContext.js";
import { ICustomizationHarnessService } from "../../../../workbench/contrib/chat/common/customizationHarnessService.js";
import { IChatPetService } from "../../../../workbench/contrib/chat/browser/chatPetService.js";
const SESSIONS_EXECUTE_SLASH_COMMAND_ID = "sessions.chat.executeSlashCommand";
CommandsRegistry.registerCommand(SESSIONS_EXECUTE_SLASH_COMMAND_ID, (_, handler, slashCommandStr) => {
  handler.tryExecuteSlashCommand(slashCommandStr);
  handler.clearInput();
});
let SlashCommandHandler = class extends Disposable {
  constructor(_editor, commandService, languageFeaturesService, harnessService, newChatModelPickerService, sessionContext, chatPetService, submitRequestHandlerService) {
    super();
    this._editor = _editor;
    this.commandService = commandService;
    this.languageFeaturesService = languageFeaturesService;
    this.harnessService = harnessService;
    this.newChatModelPickerService = newChatModelPickerService;
    this.sessionContext = sessionContext;
    this.chatPetService = chatPetService;
    this.id = "sessions.slashCommands";
    this._slashCommands = [];
    this._cachedPromptCommands = [];
    this._promptCommandsRefreshGeneration = 0;
    this._commandDecorations = this._editor.createDecorationsCollection();
    this._placeholderDecorations = this._editor.createDecorationsCollection();
    this._registerSlashCommands();
    this._register(submitRequestHandlerService.register(this));
    this._registerCompletions();
    this._registerDecorations();
    this._register(autorun((reader) => {
      this._refreshPromptCommands(this.sessionContext.session.read(reader)?.resource);
    }));
    this._register(this.harnessService.onDidChangeSlashCommands((e) => {
      const sessionResource = this.sessionContext.session.get()?.resource;
      if (sessionResource && e.sessionType === getChatSessionType(sessionResource)) {
        this._refreshPromptCommands(sessionResource);
      }
    }));
  }
  clearInput() {
    this._editor.getModel()?.setValue("");
  }
  async tryHandle(request) {
    const currentSessionResource = this.sessionContext.session.get()?.resource;
    if (!currentSessionResource || !request.providerId || !request.sessionId || !isEqual(currentSessionResource, request.sessionResource)) {
      return false;
    }
    return this.tryExecuteSlashCommand(request.input);
  }
  _refreshPromptCommands(sessionResource) {
    const refreshGeneration = ++this._promptCommandsRefreshGeneration;
    if (!sessionResource) {
      this._cachedPromptCommands = [];
      this._updateDecorations();
      return;
    }
    this.harnessService.getSlashCommands(sessionResource, CancellationToken.None).then((commands) => {
      const currentSessionResource = this.sessionContext.session.get()?.resource;
      if (refreshGeneration !== this._promptCommandsRefreshGeneration || !currentSessionResource || !isEqual(currentSessionResource, sessionResource)) {
        return;
      }
      this._cachedPromptCommands = commands;
      this._updateDecorations();
    }, () => {
      const currentSessionResource = this.sessionContext.session.get()?.resource;
      if (refreshGeneration !== this._promptCommandsRefreshGeneration || !currentSessionResource || !isEqual(currentSessionResource, sessionResource)) {
        return;
      }
      this._cachedPromptCommands = [];
      this._updateDecorations();
    });
  }
  /**
   * Attempts to parse and execute a slash command from the input.
   * Returns `true` if a command was handled.
   */
  tryExecuteSlashCommand(query) {
    const match = query.match(/^\/([\w\p{L}\d_\-\.:]+)\s*(.*)/su);
    if (!match) {
      return false;
    }
    const commandName = match[1];
    const slashCommand = this._slashCommands.find((c) => c.command === commandName);
    if (!slashCommand) {
      return false;
    }
    slashCommand.execute(match[2]?.trim() ?? "");
    return true;
  }
  _registerSlashCommands() {
    const openSection = (section) => () => this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, section);
    this._slashCommands.push({
      command: "vscode-pet",
      detail: localize("slashCommand.vscodePet", "Toggle an interactive VS Code pet (Experimental)"),
      sortText: "z3_vscodePet",
      executeImmediately: true,
      execute: () => this.chatPetService.toggle()
    });
    this._slashCommands.push({
      command: "agents",
      detail: localize("slashCommand.agents", "View and manage custom agents"),
      sortText: "z3_agents",
      executeImmediately: true,
      execute: openSection(AICustomizationManagementSection.Agents)
    });
    this._slashCommands.push({
      command: "skills",
      detail: localize("slashCommand.skills", "View and manage skills"),
      sortText: "z3_skills",
      executeImmediately: true,
      execute: openSection(AICustomizationManagementSection.Skills)
    });
    this._slashCommands.push({
      command: "instructions",
      detail: localize("slashCommand.instructions", "View and manage instructions"),
      sortText: "z3_instructions",
      executeImmediately: true,
      execute: openSection(AICustomizationManagementSection.Instructions)
    });
    this._slashCommands.push({
      command: "hooks",
      detail: localize("slashCommand.hooks", "View and manage hooks"),
      sortText: "z3_hooks",
      executeImmediately: true,
      execute: openSection(AICustomizationManagementSection.Hooks)
    });
    this._slashCommands.push({
      command: "models",
      detail: localize("slashCommand.models", "Open the model picker"),
      sortText: "z3_models",
      executeImmediately: true,
      execute: () => this.newChatModelPickerService.openModelPicker()
    });
  }
  _registerDecorations() {
    this._register(this._editor.onDidChangeModelContent(() => this._updateDecorations()));
    this._register(autorun((reader) => {
      this.sessionContext.session.read(reader);
      this._updateDecorations();
    }));
    this._updateDecorations();
  }
  _updateDecorations() {
    const model = this._editor.getModel();
    const value = model?.getValue() ?? "";
    const match = value.match(/^\/([\w\p{L}\d_\-\.:]+)\s?/u);
    const activeSession = this.sessionContext.session.get();
    if (!match || activeSession && isAgentHostTarget(getChatSessionType(activeSession.resource))) {
      this._commandDecorations.clear();
      this._placeholderDecorations.clear();
      return;
    }
    const commandName = match[1];
    const slashCommand = this._slashCommands.find((c) => c.command === commandName);
    const promptCommand = this._cachedPromptCommands.find((c) => c.name === commandName);
    if (!slashCommand && !promptCommand) {
      this._commandDecorations.clear();
      this._placeholderDecorations.clear();
      return;
    }
    const commandEnd = match[0].trimEnd().length;
    this._commandDecorations.set([{
      range: new Range(1, 1, 1, commandEnd + 1),
      options: { description: "sessions-slash-command", inlineClassName: SlashCommandHandler._commandClassName }
    }]);
    const restOfInput = value.slice(match[0].length).trim();
    const detail = slashCommand?.detail ?? promptCommand?.argumentHint;
    if (!restOfInput && detail) {
      const placeholderCol = match[0].length + 1;
      this._placeholderDecorations.set([{
        range: new Range(1, placeholderCol, 1, model.getLineMaxColumn(1)),
        options: {
          description: "sessions-slash-placeholder",
          // The range is collapsed (nothing follows the command), so injected
          // text only renders with `showIfCollapsed`.
          showIfCollapsed: true,
          after: { content: detail, inlineClassName: SlashCommandHandler._placeholderClassName, cursorStops: InjectedTextCursorStops.None }
        }
      }]);
    } else {
      this._placeholderDecorations.clear();
    }
  }
  _registerCompletions() {
    const uri = this._editor.getModel()?.uri;
    if (!uri) {
      return;
    }
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: uri.scheme, hasAccessToAllModels: true }, {
      _debugDisplayName: "sessionsSlashCommands",
      triggerCharacters: ["/"],
      provideCompletionItems: (model, position, _context, _token) => {
        const range = this._computeCompletionRanges(model, position, /\/\w*/g);
        if (!range) {
          return null;
        }
        const textBefore = model.getValueInRange(new Range(1, 1, range.replace.startLineNumber, range.replace.startColumn));
        if (textBefore.trim() !== "") {
          return null;
        }
        return {
          suggestions: this._slashCommands.map((c, i) => {
            const withSlash = `/${c.command}`;
            return {
              label: withSlash,
              insertText: c.executeImmediately ? "" : `${withSlash} `,
              detail: c.detail,
              range,
              sortText: c.sortText ?? "a".repeat(i + 1),
              kind: CompletionItemKind.Text,
              command: c.executeImmediately ? { id: SESSIONS_EXECUTE_SLASH_COMMAND_ID, title: withSlash, arguments: [this, withSlash] } : void 0
            };
          })
        };
      }
    }));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: uri.scheme, hasAccessToAllModels: true }, {
      _debugDisplayName: "sessionsPromptSlashCommands",
      triggerCharacters: ["/"],
      provideCompletionItems: async (model, position, _context, token) => {
        const activeSession = this.sessionContext.session.get();
        if (!activeSession) {
          return null;
        }
        if (isAgentHostTarget(getChatSessionType(activeSession.resource))) {
          return null;
        }
        const range = this._computeCompletionRanges(model, position, /\/[\p{L}0-9_.:-]*/gu);
        if (!range) {
          return null;
        }
        const textBefore = model.getValueInRange(new Range(1, 1, range.replace.startLineNumber, range.replace.startColumn));
        if (textBefore.trim() !== "") {
          return null;
        }
        const promptCommands = await this.harnessService.getSlashCommands(activeSession?.resource, token);
        const userInvocable = promptCommands.filter((c) => c.userInvocable);
        if (userInvocable.length === 0) {
          return null;
        }
        return {
          suggestions: userInvocable.map((c, i) => {
            const label = `/${c.name}`;
            return {
              label: { label, description: c.description },
              insertText: `${label} `,
              documentation: c.description,
              range,
              sortText: "b".repeat(i + 1),
              kind: CompletionItemKind.Text
            };
          })
        };
      }
    }));
  }
  _computeCompletionRanges(model, position, reg) {
    const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
    if (!varWord && model.getWordUntilPosition(position).word) {
      return;
    }
    if (!varWord && position.column > 1) {
      const textBefore = model.getValueInRange(new Range(position.lineNumber, position.column - 1, position.lineNumber, position.column));
      if (textBefore !== " ") {
        return;
      }
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
};
SlashCommandHandler._commandClassName = "sessions-slash-command";
SlashCommandHandler._placeholderClassName = "sessions-slash-placeholder";
SlashCommandHandler = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, ICustomizationHarnessService),
  __decorateParam(4, INewChatModelPickerService),
  __decorateParam(5, ISessionContext),
  __decorateParam(6, IChatPetService),
  __decorateParam(7, IChatSubmitRequestHandlerService)
], SlashCommandHandler);
export {
  SESSIONS_EXECUTE_SLASH_COMMAND_ID,
  SlashCommandHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3NsYXNoQ29tbWFuZHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25Db250ZXh0LCBDb21wbGV0aW9uSXRlbSwgQ29tcGxldGlvbkl0ZW1LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJbmplY3RlZFRleHRDdXJzb3JTdG9wcywgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGdldFdvcmRBdFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRDb21tYW5kcywgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UsIHR5cGUgSUNoYXRTdWJtaXRSZXF1ZXN0LCB0eXBlIElDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFByb21wdFNsYXNoQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOZXdDaGF0TW9kZWxQaWNrZXJTZXJ2aWNlIH0gZnJvbSAnLi9uZXdDaGF0TW9kZWxQaWNrZXIuanMnO1xuaW1wb3J0IHsgaXNBZ2VudEhvc3RUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UGV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0UGV0U2VydmljZS5qcyc7XG4vKipcbiAqIFN0YXRpYyBjb21tYW5kIElEIHVzZWQgYnkgY29tcGxldGlvbiBpdGVtcyB0byB0cmlnZ2VyIGltbWVkaWF0ZSBzbGFzaCBjb21tYW5kIGV4ZWN1dGlvbixcbiAqIG1pcnJvcmluZyB0aGUgcGF0dGVybiBvZiBjb3JlJ3MgYENoYXRTdWJtaXRBY3Rpb25gIGZvciBgZXhlY3V0ZUltbWVkaWF0ZWx5YCBjb21tYW5kcy5cbiAqL1xuZXhwb3J0IGNvbnN0IFNFU1NJT05TX0VYRUNVVEVfU0xBU0hfQ09NTUFORF9JRCA9ICdzZXNzaW9ucy5jaGF0LmV4ZWN1dGVTbGFzaENvbW1hbmQnO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChTRVNTSU9OU19FWEVDVVRFX1NMQVNIX0NPTU1BTkRfSUQsIChfLCBoYW5kbGVyOiBTbGFzaENvbW1hbmRIYW5kbGVyLCBzbGFzaENvbW1hbmRTdHI6IHN0cmluZykgPT4ge1xuXHRoYW5kbGVyLnRyeUV4ZWN1dGVTbGFzaENvbW1hbmQoc2xhc2hDb21tYW5kU3RyKTtcblx0aGFuZGxlci5jbGVhcklucHV0KCk7XG59KTtcblxuLyoqXG4gKiBNaW5pbWFsIHNsYXNoIGNvbW1hbmQgZGVzY3JpcHRvciBmb3IgdGhlIHNlc3Npb25zIG5ldy1jaGF0IHdpZGdldC5cbiAqIFNlbGYtY29udGFpbmVkIGNvcHkgb2YgdGhlIGVzc2VudGlhbCBmaWVsZHMgZnJvbSBjb3JlJ3MgYElDaGF0U2xhc2hEYXRhYFxuICogdG8gYXZvaWQgYSBkaXJlY3QgZGVwZW5kZW5jeSBvbiB0aGUgd29ya2JlbmNoIGNoYXQgc2xhc2ggY29tbWFuZCBzZXJ2aWNlLlxuICovXG5pbnRlcmZhY2UgSVNlc3Npb25zU2xhc2hDb21tYW5kRGF0YSB7XG5cdHJlYWRvbmx5IGNvbW1hbmQ6IHN0cmluZztcblx0cmVhZG9ubHkgZGV0YWlsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNvcnRUZXh0Pzogc3RyaW5nO1xuXHRyZWFkb25seSBleGVjdXRlSW1tZWRpYXRlbHk/OiBib29sZWFuO1xuXHRyZWFkb25seSBleGVjdXRlOiAoYXJnczogc3RyaW5nKSA9PiB2b2lkO1xufVxuXG5cbi8qKlxuICogTWFuYWdlcyBzbGFzaCBjb21tYW5kcyBmb3IgdGhlIHNlc3Npb25zIG5ldy1jaGF0IGlucHV0IHdpZGdldCBcdTIwMTQgcmVnaXN0cmF0aW9uLFxuICogYXV0b2NvbXBsZXRpb24sIGRlY29yYXRpb25zIChzeW50YXggaGlnaGxpZ2h0aW5nICsgcGxhY2Vob2xkZXIgdGV4dCksIGFuZCBleGVjdXRpb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBTbGFzaENvbW1hbmRIYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9jb21tYW5kQ2xhc3NOYW1lID0gJ3Nlc3Npb25zLXNsYXNoLWNvbW1hbmQnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfcGxhY2Vob2xkZXJDbGFzc05hbWUgPSAnc2Vzc2lvbnMtc2xhc2gtcGxhY2Vob2xkZXInO1xuXHRyZWFkb25seSBpZCA9ICdzZXNzaW9ucy5zbGFzaENvbW1hbmRzJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zbGFzaENvbW1hbmRzOiBJU2Vzc2lvbnNTbGFzaENvbW1hbmREYXRhW10gPSBbXTtcblx0cHJpdmF0ZSBfY2FjaGVkUHJvbXB0Q29tbWFuZHM6IHJlYWRvbmx5IElDaGF0UHJvbXB0U2xhc2hDb21tYW5kW10gPSBbXTtcblx0cHJpdmF0ZSBfcHJvbXB0Q29tbWFuZHNSZWZyZXNoR2VuZXJhdGlvbiA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZERlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wbGFjZWhvbGRlckRlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogQ29kZUVkaXRvcldpZGdldCxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhhcm5lc3NTZXJ2aWNlOiBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLFxuXHRcdEBJTmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5ld0NoYXRNb2RlbFBpY2tlclNlcnZpY2U6IElOZXdDaGF0TW9kZWxQaWNrZXJTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkNvbnRleHQgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uQ29udGV4dDogSVNlc3Npb25Db250ZXh0LFxuXHRcdEBJQ2hhdFBldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0UGV0U2VydmljZTogSUNoYXRQZXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZSBzdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2U6IElDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvbW1hbmREZWNvcmF0aW9ucyA9IHRoaXMuX2VkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0XHR0aGlzLl9wbGFjZWhvbGRlckRlY29yYXRpb25zID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyU2xhc2hDb21tYW5kcygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZS5yZWdpc3Rlcih0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJDb21wbGV0aW9ucygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyRGVjb3JhdGlvbnMoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3JlZnJlc2hQcm9tcHRDb21tYW5kcyh0aGlzLnNlc3Npb25Db250ZXh0LnNlc3Npb24ucmVhZChyZWFkZXIpPy5yZXNvdXJjZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5oYXJuZXNzU2VydmljZS5vbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMoKGUpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuc2Vzc2lvbkNvbnRleHQuc2Vzc2lvbi5nZXQoKT8ucmVzb3VyY2U7XG5cdFx0XHRpZiAoc2Vzc2lvblJlc291cmNlICYmIGUuc2Vzc2lvblR5cGUgPT09IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hQcm9tcHRDb21tYW5kcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9yLmdldE1vZGVsKCk/LnNldFZhbHVlKCcnKTtcblx0fVxuXG5cdGFzeW5jIHRyeUhhbmRsZShyZXF1ZXN0OiBJQ2hhdFN1Ym1pdFJlcXVlc3QpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBjdXJyZW50U2Vzc2lvblJlc291cmNlID0gdGhpcy5zZXNzaW9uQ29udGV4dC5zZXNzaW9uLmdldCgpPy5yZXNvdXJjZTtcblx0XHRpZiAoIWN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgfHwgIXJlcXVlc3QucHJvdmlkZXJJZCB8fCAhcmVxdWVzdC5zZXNzaW9uSWQgfHwgIWlzRXF1YWwoY3VycmVudFNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnRyeUV4ZWN1dGVTbGFzaENvbW1hbmQocmVxdWVzdC5pbnB1dCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoUHJvbXB0Q29tbWFuZHMoc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByZWZyZXNoR2VuZXJhdGlvbiA9ICsrdGhpcy5fcHJvbXB0Q29tbWFuZHNSZWZyZXNoR2VuZXJhdGlvbjtcblx0XHRpZiAoIXNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5fY2FjaGVkUHJvbXB0Q29tbWFuZHMgPSBbXTtcblx0XHRcdHRoaXMuX3VwZGF0ZURlY29yYXRpb25zKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuaGFybmVzc1NlcnZpY2UuZ2V0U2xhc2hDb21tYW5kcyhzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLnRoZW4oY29tbWFuZHMgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudFNlc3Npb25SZXNvdXJjZSA9IHRoaXMuc2Vzc2lvbkNvbnRleHQuc2Vzc2lvbi5nZXQoKT8ucmVzb3VyY2U7XG5cdFx0XHRpZiAocmVmcmVzaEdlbmVyYXRpb24gIT09IHRoaXMuX3Byb21wdENvbW1hbmRzUmVmcmVzaEdlbmVyYXRpb24gfHwgIWN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgfHwgIWlzRXF1YWwoY3VycmVudFNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jYWNoZWRQcm9tcHRDb21tYW5kcyA9IGNvbW1hbmRzO1xuXHRcdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvbnMoKTtcblx0XHR9LCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50U2Vzc2lvblJlc291cmNlID0gdGhpcy5zZXNzaW9uQ29udGV4dC5zZXNzaW9uLmdldCgpPy5yZXNvdXJjZTtcblx0XHRcdGlmIChyZWZyZXNoR2VuZXJhdGlvbiAhPT0gdGhpcy5fcHJvbXB0Q29tbWFuZHNSZWZyZXNoR2VuZXJhdGlvbiB8fCAhY3VycmVudFNlc3Npb25SZXNvdXJjZSB8fCAhaXNFcXVhbChjdXJyZW50U2Vzc2lvblJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NhY2hlZFByb21wdENvbW1hbmRzID0gW107XG5cdFx0XHR0aGlzLl91cGRhdGVEZWNvcmF0aW9ucygpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEF0dGVtcHRzIHRvIHBhcnNlIGFuZCBleGVjdXRlIGEgc2xhc2ggY29tbWFuZCBmcm9tIHRoZSBpbnB1dC5cblx0ICogUmV0dXJucyBgdHJ1ZWAgaWYgYSBjb21tYW5kIHdhcyBoYW5kbGVkLlxuXHQgKi9cblx0dHJ5RXhlY3V0ZVNsYXNoQ29tbWFuZChxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbWF0Y2ggPSBxdWVyeS5tYXRjaCgvXlxcLyhbXFx3XFxwe0x9XFxkX1xcLVxcLjpdKylcXHMqKC4qKS9zdSk7XG5cdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmROYW1lID0gbWF0Y2hbMV07XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kID0gdGhpcy5fc2xhc2hDb21tYW5kcy5maW5kKGMgPT4gYy5jb21tYW5kID09PSBjb21tYW5kTmFtZSk7XG5cdFx0aWYgKCFzbGFzaENvbW1hbmQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRzbGFzaENvbW1hbmQuZXhlY3V0ZShtYXRjaFsyXT8udHJpbSgpID8/ICcnKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyU2xhc2hDb21tYW5kcygpOiB2b2lkIHtcblx0XHRjb25zdCBvcGVuU2VjdGlvbiA9IChzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbikgPT5cblx0XHRcdCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudENvbW1hbmRzLk9wZW5FZGl0b3IsIHNlY3Rpb24pO1xuXG5cdFx0dGhpcy5fc2xhc2hDb21tYW5kcy5wdXNoKHtcblx0XHRcdGNvbW1hbmQ6ICd2c2NvZGUtcGV0Jyxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3NsYXNoQ29tbWFuZC52c2NvZGVQZXQnLCBcIlRvZ2dsZSBhbiBpbnRlcmFjdGl2ZSBWUyBDb2RlIHBldCAoRXhwZXJpbWVudGFsKVwiKSxcblx0XHRcdHNvcnRUZXh0OiAnejNfdnNjb2RlUGV0Jyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdGV4ZWN1dGU6ICgpID0+IHRoaXMuY2hhdFBldFNlcnZpY2UudG9nZ2xlKCksXG5cdFx0fSk7XG5cdFx0dGhpcy5fc2xhc2hDb21tYW5kcy5wdXNoKHtcblx0XHRcdGNvbW1hbmQ6ICdhZ2VudHMnLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnc2xhc2hDb21tYW5kLmFnZW50cycsIFwiVmlldyBhbmQgbWFuYWdlIGN1c3RvbSBhZ2VudHNcIiksXG5cdFx0XHRzb3J0VGV4dDogJ3ozX2FnZW50cycsXG5cdFx0XHRleGVjdXRlSW1tZWRpYXRlbHk6IHRydWUsXG5cdFx0XHRleGVjdXRlOiBvcGVuU2VjdGlvbihBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMpLFxuXHRcdH0pO1xuXHRcdHRoaXMuX3NsYXNoQ29tbWFuZHMucHVzaCh7XG5cdFx0XHRjb21tYW5kOiAnc2tpbGxzJyxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3NsYXNoQ29tbWFuZC5za2lsbHMnLCBcIlZpZXcgYW5kIG1hbmFnZSBza2lsbHNcIiksXG5cdFx0XHRzb3J0VGV4dDogJ3ozX3NraWxscycsXG5cdFx0XHRleGVjdXRlSW1tZWRpYXRlbHk6IHRydWUsXG5cdFx0XHRleGVjdXRlOiBvcGVuU2VjdGlvbihBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMpLFxuXHRcdH0pO1xuXHRcdHRoaXMuX3NsYXNoQ29tbWFuZHMucHVzaCh7XG5cdFx0XHRjb21tYW5kOiAnaW5zdHJ1Y3Rpb25zJyxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3NsYXNoQ29tbWFuZC5pbnN0cnVjdGlvbnMnLCBcIlZpZXcgYW5kIG1hbmFnZSBpbnN0cnVjdGlvbnNcIiksXG5cdFx0XHRzb3J0VGV4dDogJ3ozX2luc3RydWN0aW9ucycsXG5cdFx0XHRleGVjdXRlSW1tZWRpYXRlbHk6IHRydWUsXG5cdFx0XHRleGVjdXRlOiBvcGVuU2VjdGlvbihBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMpLFxuXHRcdH0pO1xuXHRcdHRoaXMuX3NsYXNoQ29tbWFuZHMucHVzaCh7XG5cdFx0XHRjb21tYW5kOiAnaG9va3MnLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnc2xhc2hDb21tYW5kLmhvb2tzJywgXCJWaWV3IGFuZCBtYW5hZ2UgaG9va3NcIiksXG5cdFx0XHRzb3J0VGV4dDogJ3ozX2hvb2tzJyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdGV4ZWN1dGU6IG9wZW5TZWN0aW9uKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzKSxcblx0XHR9KTtcblx0XHR0aGlzLl9zbGFzaENvbW1hbmRzLnB1c2goe1xuXHRcdFx0Y29tbWFuZDogJ21vZGVscycsXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdzbGFzaENvbW1hbmQubW9kZWxzJywgXCJPcGVuIHRoZSBtb2RlbCBwaWNrZXJcIiksXG5cdFx0XHRzb3J0VGV4dDogJ3ozX21vZGVscycsXG5cdFx0XHRleGVjdXRlSW1tZWRpYXRlbHk6IHRydWUsXG5cdFx0XHRleGVjdXRlOiAoKSA9PiB0aGlzLm5ld0NoYXRNb2RlbFBpY2tlclNlcnZpY2Uub3Blbk1vZGVsUGlja2VyKCksXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckRlY29yYXRpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB0aGlzLl91cGRhdGVEZWNvcmF0aW9ucygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5zZXNzaW9uQ29udGV4dC5zZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3VwZGF0ZURlY29yYXRpb25zKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3VwZGF0ZURlY29yYXRpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVEZWNvcmF0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHZhbHVlID0gbW9kZWw/LmdldFZhbHVlKCkgPz8gJyc7XG5cdFx0Y29uc3QgbWF0Y2ggPSB2YWx1ZS5tYXRjaCgvXlxcLyhbXFx3XFxwe0x9XFxkX1xcLVxcLjpdKylcXHM/L3UpO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLnNlc3Npb25Db250ZXh0LnNlc3Npb24uZ2V0KCk7XG5cblx0XHQvLyBBZ2VudC1ob3N0IHNlc3Npb25zIHNob3VsZCBub3QgZ2V0IGRlY29yYXRpb25zIGFzIHRoaXMgY2xhc3MgaXMgb25seSBmb3IgdXNlIHdpdGggTG9jYWwgQWdlbnQgSGFybmVzcyBhbmQgQ29waWxvdCBDaGF0IEV4dGVuc2lvbi5cblx0XHRpZiAoIW1hdGNoIHx8IChhY3RpdmVTZXNzaW9uICYmIGlzQWdlbnRIb3N0VGFyZ2V0KGdldENoYXRTZXNzaW9uVHlwZShhY3RpdmVTZXNzaW9uLnJlc291cmNlKSkpKSB7XG5cdFx0XHR0aGlzLl9jb21tYW5kRGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kTmFtZSA9IG1hdGNoWzFdO1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZCA9IHRoaXMuX3NsYXNoQ29tbWFuZHMuZmluZChjID0+IGMuY29tbWFuZCA9PT0gY29tbWFuZE5hbWUpO1xuXHRcdGNvbnN0IHByb21wdENvbW1hbmQgPSB0aGlzLl9jYWNoZWRQcm9tcHRDb21tYW5kcy5maW5kKGMgPT4gYy5uYW1lID09PSBjb21tYW5kTmFtZSk7XG5cdFx0aWYgKCFzbGFzaENvbW1hbmQgJiYgIXByb21wdENvbW1hbmQpIHtcblx0XHRcdHRoaXMuX2NvbW1hbmREZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fcGxhY2Vob2xkZXJEZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEhpZ2hsaWdodCB0aGUgc2xhc2ggY29tbWFuZCB0ZXh0XG5cdFx0Y29uc3QgY29tbWFuZEVuZCA9IG1hdGNoWzBdLnRyaW1FbmQoKS5sZW5ndGg7XG5cdFx0dGhpcy5fY29tbWFuZERlY29yYXRpb25zLnNldChbe1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCBjb21tYW5kRW5kICsgMSksXG5cdFx0XHRvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAnc2Vzc2lvbnMtc2xhc2gtY29tbWFuZCcsIGlubGluZUNsYXNzTmFtZTogU2xhc2hDb21tYW5kSGFuZGxlci5fY29tbWFuZENsYXNzTmFtZSB9LFxuXHRcdH1dKTtcblxuXHRcdC8vIFNob3cgdGhlIGNvbW1hbmQgZGVzY3JpcHRpb24gYXMgYSBwbGFjZWhvbGRlciBhZnRlciB0aGUgY29tbWFuZFxuXHRcdGNvbnN0IHJlc3RPZklucHV0ID0gdmFsdWUuc2xpY2UobWF0Y2hbMF0ubGVuZ3RoKS50cmltKCk7XG5cdFx0Y29uc3QgZGV0YWlsID0gc2xhc2hDb21tYW5kPy5kZXRhaWwgPz8gcHJvbXB0Q29tbWFuZD8uYXJndW1lbnRIaW50O1xuXHRcdGlmICghcmVzdE9mSW5wdXQgJiYgZGV0YWlsKSB7XG5cdFx0XHRjb25zdCBwbGFjZWhvbGRlckNvbCA9IG1hdGNoWzBdLmxlbmd0aCArIDE7XG5cdFx0XHR0aGlzLl9wbGFjZWhvbGRlckRlY29yYXRpb25zLnNldChbe1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIHBsYWNlaG9sZGVyQ29sLCAxLCBtb2RlbCEuZ2V0TGluZU1heENvbHVtbigxKSksXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Nlc3Npb25zLXNsYXNoLXBsYWNlaG9sZGVyJyxcblx0XHRcdFx0XHQvLyBUaGUgcmFuZ2UgaXMgY29sbGFwc2VkIChub3RoaW5nIGZvbGxvd3MgdGhlIGNvbW1hbmQpLCBzbyBpbmplY3RlZFxuXHRcdFx0XHRcdC8vIHRleHQgb25seSByZW5kZXJzIHdpdGggYHNob3dJZkNvbGxhcHNlZGAuXG5cdFx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRcdGFmdGVyOiB7IGNvbnRlbnQ6IGRldGFpbCwgaW5saW5lQ2xhc3NOYW1lOiBTbGFzaENvbW1hbmRIYW5kbGVyLl9wbGFjZWhvbGRlckNsYXNzTmFtZSwgY3Vyc29yU3RvcHM6IEluamVjdGVkVGV4dEN1cnNvclN0b3BzLk5vbmUgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0gc2F0aXNmaWVzIElNb2RlbERlbHRhRGVjb3JhdGlvbl0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9wbGFjZWhvbGRlckRlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJDb21wbGV0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCB1cmkgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKT8udXJpO1xuXHRcdGlmICghdXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IHVyaS5zY2hlbWUsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAnc2Vzc2lvbnNTbGFzaENvbW1hbmRzJyxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbJy8nXSxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXM6IChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBfY29udGV4dDogQ29tcGxldGlvbkNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9jb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgcG9zaXRpb24sIC9cXC9cXHcqL2cpO1xuXHRcdFx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPbmx5IGFsbG93IHNsYXNoIGNvbW1hbmRzIGF0IHRoZSBzdGFydCBvZiBpbnB1dFxuXHRcdFx0XHRjb25zdCB0ZXh0QmVmb3JlID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCByYW5nZS5yZXBsYWNlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2UucmVwbGFjZS5zdGFydENvbHVtbikpO1xuXHRcdFx0XHRpZiAodGV4dEJlZm9yZS50cmltKCkgIT09ICcnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiB0aGlzLl9zbGFzaENvbW1hbmRzLm1hcCgoYywgaSk6IENvbXBsZXRpb25JdGVtID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHdpdGhTbGFzaCA9IGAvJHtjLmNvbW1hbmR9YDtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiB3aXRoU2xhc2gsXG5cdFx0XHRcdFx0XHRcdGluc2VydFRleHQ6IGMuZXhlY3V0ZUltbWVkaWF0ZWx5ID8gJycgOiBgJHt3aXRoU2xhc2h9IGAsXG5cdFx0XHRcdFx0XHRcdGRldGFpbDogYy5kZXRhaWwsXG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRzb3J0VGV4dDogYy5zb3J0VGV4dCA/PyAnYScucmVwZWF0KGkgKyAxKSxcblx0XHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IGMuZXhlY3V0ZUltbWVkaWF0ZWx5ID8geyBpZDogU0VTU0lPTlNfRVhFQ1VURV9TTEFTSF9DT01NQU5EX0lELCB0aXRsZTogd2l0aFNsYXNoLCBhcmd1bWVudHM6IFt0aGlzLCB3aXRoU2xhc2hdIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRHluYW1pYyBjb21wbGV0aW9ucyBmb3IgaW5kaXZpZHVhbCBwcm9tcHQvc2tpbGwgZmlsZXMgKGZpbHRlcmVkIHRvIG1hdGNoXG5cdFx0Ly8gd2hhdCB0aGUgc2Vzc2lvbnMgY3VzdG9taXphdGlvbnMgdmlldyBzaG93cykuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IHVyaS5zY2hlbWUsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAnc2Vzc2lvbnNQcm9tcHRTbGFzaENvbW1hbmRzJyxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbJy8nXSxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXM6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBfY29udGV4dDogQ29tcGxldGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5zZXNzaW9uQ29udGV4dC5zZXNzaW9uLmdldCgpO1xuXHRcdFx0XHRpZiAoIWFjdGl2ZVNlc3Npb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaXNBZ2VudEhvc3RUYXJnZXQoZ2V0Q2hhdFNlc3Npb25UeXBlKGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UpKSkge1xuXHRcdFx0XHRcdC8vIEFnZW50LWhvc3Qgc2Vzc2lvbnMgZGVsZWdhdGUgY29tcGxldGlvbnMgdG8gdGhlIGhvc3Rcblx0XHRcdFx0XHQvLyBwcm9jZXNzIHZpYSBgQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uc2AuXG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gdGhpcy5fY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIHBvc2l0aW9uLCAvXFwvW1xccHtMfTAtOV8uOi1dKi9ndSk7XG5cdFx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRleHRCZWZvcmUgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIHJhbmdlLnJlcGxhY2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5yZXBsYWNlLnN0YXJ0Q29sdW1uKSk7XG5cdFx0XHRcdGlmICh0ZXh0QmVmb3JlLnRyaW0oKSAhPT0gJycpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHByb21wdENvbW1hbmRzID0gYXdhaXQgdGhpcy5oYXJuZXNzU2VydmljZS5nZXRTbGFzaENvbW1hbmRzKGFjdGl2ZVNlc3Npb24/LnJlc291cmNlLCB0b2tlbik7XG5cdFx0XHRcdGNvbnN0IHVzZXJJbnZvY2FibGUgPSBwcm9tcHRDb21tYW5kcy5maWx0ZXIoYyA9PiBjLnVzZXJJbnZvY2FibGUpO1xuXHRcdFx0XHRpZiAodXNlckludm9jYWJsZS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IHVzZXJJbnZvY2FibGUubWFwKChjLCBpKTogQ29tcGxldGlvbkl0ZW0gPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBgLyR7Yy5uYW1lfWA7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbCwgZGVzY3JpcHRpb246IGMuZGVzY3JpcHRpb24gfSxcblx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogYCR7bGFiZWx9IGAsXG5cdFx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb246IGMuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRzb3J0VGV4dDogJ2InLnJlcGVhdChpICsgMSksXG5cdFx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHJlZzogUmVnRXhwKTogeyBpbnNlcnQ6IFJhbmdlOyByZXBsYWNlOiBSYW5nZSB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2YXJXb3JkID0gZ2V0V29yZEF0VGV4dChwb3NpdGlvbi5jb2x1bW4sIHJlZywgbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlciksIDApO1xuXHRcdGlmICghdmFyV29yZCAmJiBtb2RlbC5nZXRXb3JkVW50aWxQb3NpdGlvbihwb3NpdGlvbikud29yZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdmFyV29yZCAmJiBwb3NpdGlvbi5jb2x1bW4gPiAxKSB7XG5cdFx0XHRjb25zdCB0ZXh0QmVmb3JlID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4gLSAxLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pKTtcblx0XHRcdGlmICh0ZXh0QmVmb3JlICE9PSAnICcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBpbnNlcnQ6IFJhbmdlO1xuXHRcdGxldCByZXBsYWNlOiBSYW5nZTtcblx0XHRpZiAoIXZhcldvcmQpIHtcblx0XHRcdGluc2VydCA9IHJlcGxhY2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW5zZXJ0ID0gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHZhcldvcmQuc3RhcnRDb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbik7XG5cdFx0XHRyZXBsYWNlID0gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHZhcldvcmQuc3RhcnRDb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHZhcldvcmQuZW5kQ29sdW1uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBpbnNlcnQsIHJlcGxhY2UgfTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBR3hCLFNBQTRDLDBCQUEwQjtBQUN0RSxTQUFnQywrQkFBMkM7QUFHM0UsU0FBUyxhQUFhO0FBQ3RCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsa0JBQWtCLHVCQUF1QjtBQUNsRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1DQUFtQyx3Q0FBd0M7QUFDcEYsU0FBUyx3Q0FBaUc7QUFFMUcsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx1QkFBdUI7QUFLekIsTUFBTSxvQ0FBb0M7QUFFakQsaUJBQWlCLGdCQUFnQixtQ0FBbUMsQ0FBQyxHQUFHLFNBQThCLG9CQUE0QjtBQUNqSSxVQUFRLHVCQUF1QixlQUFlO0FBQzlDLFVBQVEsV0FBVztBQUNwQixDQUFDO0FBb0JNLElBQU0sc0JBQU4sY0FBa0MsV0FBZ0Q7QUFBQSxFQWF4RixZQUNrQixTQUNpQixnQkFDUyx5QkFDSSxnQkFDRiwyQkFDWCxnQkFDQSxnQkFDQSw2QkFDakM7QUFDRCxVQUFNO0FBVFc7QUFDaUI7QUFDUztBQUNJO0FBQ0Y7QUFDWDtBQUNBO0FBaEJuQyxTQUFTLEtBQUs7QUFFZCxTQUFpQixpQkFBOEMsQ0FBQztBQUNoRSxTQUFRLHdCQUE0RCxDQUFDO0FBQ3JFLFNBQVEsbUNBQW1DO0FBZ0IxQyxTQUFLLHNCQUFzQixLQUFLLFFBQVEsNEJBQTRCO0FBQ3BFLFNBQUssMEJBQTBCLEtBQUssUUFBUSw0QkFBNEI7QUFDeEUsU0FBSyx1QkFBdUI7QUFDNUIsU0FBSyxVQUFVLDRCQUE0QixTQUFTLElBQUksQ0FBQztBQUN6RCxTQUFLLHFCQUFxQjtBQUMxQixTQUFLLHFCQUFxQjtBQUUxQixTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFdBQUssdUJBQXVCLEtBQUssZUFBZSxRQUFRLEtBQUssTUFBTSxHQUFHLFFBQVE7QUFBQSxJQUMvRSxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxlQUFlLHlCQUF5QixDQUFDLE1BQU07QUFDbEUsWUFBTSxrQkFBa0IsS0FBSyxlQUFlLFFBQVEsSUFBSSxHQUFHO0FBQzNELFVBQUksbUJBQW1CLEVBQUUsZ0JBQWdCLG1CQUFtQixlQUFlLEdBQUc7QUFDN0UsYUFBSyx1QkFBdUIsZUFBZTtBQUFBLE1BQzVDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxhQUFtQjtBQUNsQixTQUFLLFFBQVEsU0FBUyxHQUFHLFNBQVMsRUFBRTtBQUFBLEVBQ3JDO0FBQUEsRUFFQSxNQUFNLFVBQVUsU0FBK0M7QUFDOUQsVUFBTSx5QkFBeUIsS0FBSyxlQUFlLFFBQVEsSUFBSSxHQUFHO0FBQ2xFLFFBQUksQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLGNBQWMsQ0FBQyxRQUFRLGFBQWEsQ0FBQyxRQUFRLHdCQUF3QixRQUFRLGVBQWUsR0FBRztBQUN0SSxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyx1QkFBdUIsUUFBUSxLQUFLO0FBQUEsRUFDakQ7QUFBQSxFQUVRLHVCQUF1QixpQkFBd0M7QUFDdEUsVUFBTSxvQkFBb0IsRUFBRSxLQUFLO0FBQ2pDLFFBQUksQ0FBQyxpQkFBaUI7QUFDckIsV0FBSyx3QkFBd0IsQ0FBQztBQUM5QixXQUFLLG1CQUFtQjtBQUN4QjtBQUFBLElBQ0Q7QUFDQSxTQUFLLGVBQWUsaUJBQWlCLGlCQUFpQixrQkFBa0IsSUFBSSxFQUFFLEtBQUssY0FBWTtBQUM5RixZQUFNLHlCQUF5QixLQUFLLGVBQWUsUUFBUSxJQUFJLEdBQUc7QUFDbEUsVUFBSSxzQkFBc0IsS0FBSyxvQ0FBb0MsQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLHdCQUF3QixlQUFlLEdBQUc7QUFDaEo7QUFBQSxNQUNEO0FBQ0EsV0FBSyx3QkFBd0I7QUFDN0IsV0FBSyxtQkFBbUI7QUFBQSxJQUN6QixHQUFHLE1BQU07QUFDUixZQUFNLHlCQUF5QixLQUFLLGVBQWUsUUFBUSxJQUFJLEdBQUc7QUFDbEUsVUFBSSxzQkFBc0IsS0FBSyxvQ0FBb0MsQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLHdCQUF3QixlQUFlLEdBQUc7QUFDaEo7QUFBQSxNQUNEO0FBQ0EsV0FBSyx3QkFBd0IsQ0FBQztBQUM5QixXQUFLLG1CQUFtQjtBQUFBLElBQ3pCLENBQUM7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLHVCQUF1QixPQUF3QjtBQUM5QyxVQUFNLFFBQVEsTUFBTSxNQUFNLGtDQUFrQztBQUM1RCxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxjQUFjLE1BQU0sQ0FBQztBQUMzQixVQUFNLGVBQWUsS0FBSyxlQUFlLEtBQUssT0FBSyxFQUFFLFlBQVksV0FBVztBQUM1RSxRQUFJLENBQUMsY0FBYztBQUNsQixhQUFPO0FBQUEsSUFDUjtBQUVBLGlCQUFhLFFBQVEsTUFBTSxDQUFDLEdBQUcsS0FBSyxLQUFLLEVBQUU7QUFDM0MsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHlCQUErQjtBQUN0QyxVQUFNLGNBQWMsQ0FBQyxZQUNwQixNQUFNLEtBQUssZUFBZSxlQUFlLGtDQUFrQyxZQUFZLE9BQU87QUFFL0YsU0FBSyxlQUFlLEtBQUs7QUFBQSxNQUN4QixTQUFTO0FBQUEsTUFDVCxRQUFRLFNBQVMsMEJBQTBCLGtEQUFrRDtBQUFBLE1BQzdGLFVBQVU7QUFBQSxNQUNWLG9CQUFvQjtBQUFBLE1BQ3BCLFNBQVMsTUFBTSxLQUFLLGVBQWUsT0FBTztBQUFBLElBQzNDLENBQUM7QUFDRCxTQUFLLGVBQWUsS0FBSztBQUFBLE1BQ3hCLFNBQVM7QUFBQSxNQUNULFFBQVEsU0FBUyx1QkFBdUIsK0JBQStCO0FBQUEsTUFDdkUsVUFBVTtBQUFBLE1BQ1Ysb0JBQW9CO0FBQUEsTUFDcEIsU0FBUyxZQUFZLGlDQUFpQyxNQUFNO0FBQUEsSUFDN0QsQ0FBQztBQUNELFNBQUssZUFBZSxLQUFLO0FBQUEsTUFDeEIsU0FBUztBQUFBLE1BQ1QsUUFBUSxTQUFTLHVCQUF1Qix3QkFBd0I7QUFBQSxNQUNoRSxVQUFVO0FBQUEsTUFDVixvQkFBb0I7QUFBQSxNQUNwQixTQUFTLFlBQVksaUNBQWlDLE1BQU07QUFBQSxJQUM3RCxDQUFDO0FBQ0QsU0FBSyxlQUFlLEtBQUs7QUFBQSxNQUN4QixTQUFTO0FBQUEsTUFDVCxRQUFRLFNBQVMsNkJBQTZCLDhCQUE4QjtBQUFBLE1BQzVFLFVBQVU7QUFBQSxNQUNWLG9CQUFvQjtBQUFBLE1BQ3BCLFNBQVMsWUFBWSxpQ0FBaUMsWUFBWTtBQUFBLElBQ25FLENBQUM7QUFDRCxTQUFLLGVBQWUsS0FBSztBQUFBLE1BQ3hCLFNBQVM7QUFBQSxNQUNULFFBQVEsU0FBUyxzQkFBc0IsdUJBQXVCO0FBQUEsTUFDOUQsVUFBVTtBQUFBLE1BQ1Ysb0JBQW9CO0FBQUEsTUFDcEIsU0FBUyxZQUFZLGlDQUFpQyxLQUFLO0FBQUEsSUFDNUQsQ0FBQztBQUNELFNBQUssZUFBZSxLQUFLO0FBQUEsTUFDeEIsU0FBUztBQUFBLE1BQ1QsUUFBUSxTQUFTLHVCQUF1Qix1QkFBdUI7QUFBQSxNQUMvRCxVQUFVO0FBQUEsTUFDVixvQkFBb0I7QUFBQSxNQUNwQixTQUFTLE1BQU0sS0FBSywwQkFBMEIsZ0JBQWdCO0FBQUEsSUFDL0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLHVCQUE2QjtBQUNwQyxTQUFLLFVBQVUsS0FBSyxRQUFRLHdCQUF3QixNQUFNLEtBQUssbUJBQW1CLENBQUMsQ0FBQztBQUNwRixTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFdBQUssZUFBZSxRQUFRLEtBQUssTUFBTTtBQUN2QyxXQUFLLG1CQUFtQjtBQUFBLElBQ3pCLENBQUMsQ0FBQztBQUNGLFNBQUssbUJBQW1CO0FBQUEsRUFDekI7QUFBQSxFQUVRLHFCQUEyQjtBQUNsQyxVQUFNLFFBQVEsS0FBSyxRQUFRLFNBQVM7QUFDcEMsVUFBTSxRQUFRLE9BQU8sU0FBUyxLQUFLO0FBQ25DLFVBQU0sUUFBUSxNQUFNLE1BQU0sNkJBQTZCO0FBQ3ZELFVBQU0sZ0JBQWdCLEtBQUssZUFBZSxRQUFRLElBQUk7QUFHdEQsUUFBSSxDQUFDLFNBQVUsaUJBQWlCLGtCQUFrQixtQkFBbUIsY0FBYyxRQUFRLENBQUMsR0FBSTtBQUMvRixXQUFLLG9CQUFvQixNQUFNO0FBQy9CLFdBQUssd0JBQXdCLE1BQU07QUFDbkM7QUFBQSxJQUNEO0FBRUEsVUFBTSxjQUFjLE1BQU0sQ0FBQztBQUMzQixVQUFNLGVBQWUsS0FBSyxlQUFlLEtBQUssT0FBSyxFQUFFLFlBQVksV0FBVztBQUM1RSxVQUFNLGdCQUFnQixLQUFLLHNCQUFzQixLQUFLLE9BQUssRUFBRSxTQUFTLFdBQVc7QUFDakYsUUFBSSxDQUFDLGdCQUFnQixDQUFDLGVBQWU7QUFDcEMsV0FBSyxvQkFBb0IsTUFBTTtBQUMvQixXQUFLLHdCQUF3QixNQUFNO0FBQ25DO0FBQUEsSUFDRDtBQUdBLFVBQU0sYUFBYSxNQUFNLENBQUMsRUFBRSxRQUFRLEVBQUU7QUFDdEMsU0FBSyxvQkFBb0IsSUFBSSxDQUFDO0FBQUEsTUFDN0IsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsYUFBYSxDQUFDO0FBQUEsTUFDeEMsU0FBUyxFQUFFLGFBQWEsMEJBQTBCLGlCQUFpQixvQkFBb0Isa0JBQWtCO0FBQUEsSUFDMUcsQ0FBQyxDQUFDO0FBR0YsVUFBTSxjQUFjLE1BQU0sTUFBTSxNQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSztBQUN0RCxVQUFNLFNBQVMsY0FBYyxVQUFVLGVBQWU7QUFDdEQsUUFBSSxDQUFDLGVBQWUsUUFBUTtBQUMzQixZQUFNLGlCQUFpQixNQUFNLENBQUMsRUFBRSxTQUFTO0FBQ3pDLFdBQUssd0JBQXdCLElBQUksQ0FBQztBQUFBLFFBQ2pDLE9BQU8sSUFBSSxNQUFNLEdBQUcsZ0JBQWdCLEdBQUcsTUFBTyxpQkFBaUIsQ0FBQyxDQUFDO0FBQUEsUUFDakUsU0FBUztBQUFBLFVBQ1IsYUFBYTtBQUFBO0FBQUE7QUFBQSxVQUdiLGlCQUFpQjtBQUFBLFVBQ2pCLE9BQU8sRUFBRSxTQUFTLFFBQVEsaUJBQWlCLG9CQUFvQix1QkFBdUIsYUFBYSx3QkFBd0IsS0FBSztBQUFBLFFBQ2pJO0FBQUEsTUFDRCxDQUFpQyxDQUFDO0FBQUEsSUFDbkMsT0FBTztBQUNOLFdBQUssd0JBQXdCLE1BQU07QUFBQSxJQUNwQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLHVCQUE2QjtBQUNwQyxVQUFNLE1BQU0sS0FBSyxRQUFRLFNBQVMsR0FBRztBQUNyQyxRQUFJLENBQUMsS0FBSztBQUNUO0FBQUEsSUFDRDtBQUVBLFNBQUssVUFBVSxLQUFLLHdCQUF3QixtQkFBbUIsU0FBUyxFQUFFLFFBQVEsSUFBSSxRQUFRLHNCQUFzQixLQUFLLEdBQUc7QUFBQSxNQUMzSCxtQkFBbUI7QUFBQSxNQUNuQixtQkFBbUIsQ0FBQyxHQUFHO0FBQUEsTUFDdkIsd0JBQXdCLENBQUMsT0FBbUIsVUFBb0IsVUFBNkIsV0FBOEI7QUFDMUgsY0FBTSxRQUFRLEtBQUsseUJBQXlCLE9BQU8sVUFBVSxRQUFRO0FBQ3JFLFlBQUksQ0FBQyxPQUFPO0FBQ1gsaUJBQU87QUFBQSxRQUNSO0FBR0EsY0FBTSxhQUFhLE1BQU0sZ0JBQWdCLElBQUksTUFBTSxHQUFHLEdBQUcsTUFBTSxRQUFRLGlCQUFpQixNQUFNLFFBQVEsV0FBVyxDQUFDO0FBQ2xILFlBQUksV0FBVyxLQUFLLE1BQU0sSUFBSTtBQUM3QixpQkFBTztBQUFBLFFBQ1I7QUFFQSxlQUFPO0FBQUEsVUFDTixhQUFhLEtBQUssZUFBZSxJQUFJLENBQUMsR0FBRyxNQUFzQjtBQUM5RCxrQkFBTSxZQUFZLElBQUksRUFBRSxPQUFPO0FBQy9CLG1CQUFPO0FBQUEsY0FDTixPQUFPO0FBQUEsY0FDUCxZQUFZLEVBQUUscUJBQXFCLEtBQUssR0FBRyxTQUFTO0FBQUEsY0FDcEQsUUFBUSxFQUFFO0FBQUEsY0FDVjtBQUFBLGNBQ0EsVUFBVSxFQUFFLFlBQVksSUFBSSxPQUFPLElBQUksQ0FBQztBQUFBLGNBQ3hDLE1BQU0sbUJBQW1CO0FBQUEsY0FDekIsU0FBUyxFQUFFLHFCQUFxQixFQUFFLElBQUksbUNBQW1DLE9BQU8sV0FBVyxXQUFXLENBQUMsTUFBTSxTQUFTLEVBQUUsSUFBSTtBQUFBLFlBQzdIO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUlGLFNBQUssVUFBVSxLQUFLLHdCQUF3QixtQkFBbUIsU0FBUyxFQUFFLFFBQVEsSUFBSSxRQUFRLHNCQUFzQixLQUFLLEdBQUc7QUFBQSxNQUMzSCxtQkFBbUI7QUFBQSxNQUNuQixtQkFBbUIsQ0FBQyxHQUFHO0FBQUEsTUFDdkIsd0JBQXdCLE9BQU8sT0FBbUIsVUFBb0IsVUFBNkIsVUFBNkI7QUFDL0gsY0FBTSxnQkFBZ0IsS0FBSyxlQUFlLFFBQVEsSUFBSTtBQUN0RCxZQUFJLENBQUMsZUFBZTtBQUNuQixpQkFBTztBQUFBLFFBQ1I7QUFDQSxZQUFJLGtCQUFrQixtQkFBbUIsY0FBYyxRQUFRLENBQUMsR0FBRztBQUdsRSxpQkFBTztBQUFBLFFBQ1I7QUFHQSxjQUFNLFFBQVEsS0FBSyx5QkFBeUIsT0FBTyxVQUFVLHFCQUFxQjtBQUNsRixZQUFJLENBQUMsT0FBTztBQUNYLGlCQUFPO0FBQUEsUUFDUjtBQUVBLGNBQU0sYUFBYSxNQUFNLGdCQUFnQixJQUFJLE1BQU0sR0FBRyxHQUFHLE1BQU0sUUFBUSxpQkFBaUIsTUFBTSxRQUFRLFdBQVcsQ0FBQztBQUNsSCxZQUFJLFdBQVcsS0FBSyxNQUFNLElBQUk7QUFDN0IsaUJBQU87QUFBQSxRQUNSO0FBRUEsY0FBTSxpQkFBaUIsTUFBTSxLQUFLLGVBQWUsaUJBQWlCLGVBQWUsVUFBVSxLQUFLO0FBQ2hHLGNBQU0sZ0JBQWdCLGVBQWUsT0FBTyxPQUFLLEVBQUUsYUFBYTtBQUNoRSxZQUFJLGNBQWMsV0FBVyxHQUFHO0FBQy9CLGlCQUFPO0FBQUEsUUFDUjtBQUVBLGVBQU87QUFBQSxVQUNOLGFBQWEsY0FBYyxJQUFJLENBQUMsR0FBRyxNQUFzQjtBQUN4RCxrQkFBTSxRQUFRLElBQUksRUFBRSxJQUFJO0FBQ3hCLG1CQUFPO0FBQUEsY0FDTixPQUFPLEVBQUUsT0FBTyxhQUFhLEVBQUUsWUFBWTtBQUFBLGNBQzNDLFlBQVksR0FBRyxLQUFLO0FBQUEsY0FDcEIsZUFBZSxFQUFFO0FBQUEsY0FDakI7QUFBQSxjQUNBLFVBQVUsSUFBSSxPQUFPLElBQUksQ0FBQztBQUFBLGNBQzFCLE1BQU0sbUJBQW1CO0FBQUEsWUFDMUI7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEseUJBQXlCLE9BQW1CLFVBQW9CLEtBQTREO0FBQ25JLFVBQU0sVUFBVSxjQUFjLFNBQVMsUUFBUSxLQUFLLE1BQU0sZUFBZSxTQUFTLFVBQVUsR0FBRyxDQUFDO0FBQ2hHLFFBQUksQ0FBQyxXQUFXLE1BQU0scUJBQXFCLFFBQVEsRUFBRSxNQUFNO0FBQzFEO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxXQUFXLFNBQVMsU0FBUyxHQUFHO0FBQ3BDLFlBQU0sYUFBYSxNQUFNLGdCQUFnQixJQUFJLE1BQU0sU0FBUyxZQUFZLFNBQVMsU0FBUyxHQUFHLFNBQVMsWUFBWSxTQUFTLE1BQU0sQ0FBQztBQUNsSSxVQUFJLGVBQWUsS0FBSztBQUN2QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJLENBQUMsU0FBUztBQUNiLGVBQVMsVUFBVSxNQUFNLGNBQWMsUUFBUTtBQUFBLElBQ2hELE9BQU87QUFDTixlQUFTLElBQUksTUFBTSxTQUFTLFlBQVksUUFBUSxhQUFhLFNBQVMsWUFBWSxTQUFTLE1BQU07QUFDakcsZ0JBQVUsSUFBSSxNQUFNLFNBQVMsWUFBWSxRQUFRLGFBQWEsU0FBUyxZQUFZLFFBQVEsU0FBUztBQUFBLElBQ3JHO0FBRUEsV0FBTyxFQUFFLFFBQVEsUUFBUTtBQUFBLEVBQzFCO0FBQ0Q7QUE3VGEsb0JBRVksb0JBQW9CO0FBRmhDLG9CQUdZLHdCQUF3QjtBQUhwQyxzQkFBTjtBQUFBLEVBZUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXJCVTsiLAogICJuYW1lcyI6IFtdCn0K
