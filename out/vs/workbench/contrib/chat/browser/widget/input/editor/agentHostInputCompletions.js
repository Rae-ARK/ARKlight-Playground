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
import { DisposableMap } from "../../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../../base/common/network.js";
import { assertType } from "../../../../../../../base/common/types.js";
import { localize } from "../../../../../../../nls.js";
import { AgentHostCompletionReferenceKind, chatReferenceVariableEntryId, toAgentHostCompletionVariableEntry, toChatReferenceDynamicVariableValue } from "../../../../common/attachments/chatVariableEntries.js";
import { CompletionItemKind } from "../../../../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../../../../editor/common/services/languageFeatures.js";
import { CommandsRegistry } from "../../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../../../platform/dialogs/common/dialogs.js";
import { IStorageService } from "../../../../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../../../../platform/workspace/common/workspace.js";
import { IAgentHostService } from "../../../../../../../platform/agentHost/common/agentService.js";
import { getCompletionAction } from "../../../../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js";
import { Registry } from "../../../../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../../../../common/contributions.js";
import { LifecyclePhase } from "../../../../../../services/lifecycle/common/lifecycle.js";
import { ChatDynamicVariableModel } from "../../../attachments/chatDynamicVariables.js";
import { IChatSessionsService, isAgentHostTarget } from "../../../../common/chatSessionsService.js";
import { getChatSessionType } from "../../../../common/model/chatUri.js";
import { IChatWidgetService } from "../../../chat.js";
import { applyAgentHostCompletionAction, isPolicyBlockedCompletionAction } from "../../../agentHostCompletionAction.js";
import { applyAgentHostSessionConfigChange } from "../../../agentSessions/agentHost/applyAgentHostSessionConfig.js";
import { IAgentHostSessionWorkingDirectoryResolver } from "../../../agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js";
import { IAgentHostUntitledProvisionalSessionService } from "../../../agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js";
import { AgentHostInputCompletionsBase } from "./agentHostInputCompletionsBase.js";
let AgentHostInputCompletions = class extends AgentHostInputCompletionsBase {
  constructor(languageFeaturesService, _chatWidgetService, chatSessionsService, _configurationService) {
    super(languageFeaturesService, chatSessionsService);
    this._chatWidgetService = _chatWidgetService;
    this._configurationService = _configurationService;
    /** Per-scheme registrations of the Monaco completion provider. */
    this._registrations = this._register(new DisposableMap());
    this._register(CommandsRegistry.registerCommand(AgentHostInputCompletions.addReferenceCommand, (_services, arg) => {
      assertType(arg instanceof AgentHostReferenceArgument);
      arg.widget.getContrib(ChatDynamicVariableModel.ID)?.addReference({
        id: arg.id,
        range: arg.range,
        isFile: arg.isFile,
        isDirectory: arg.isDirectory,
        fullName: arg.displayName,
        data: arg.data,
        _meta: arg._meta
      });
    }));
    this._register(CommandsRegistry.registerCommand(AgentHostInputCompletions.configActionCommand, async (accessor, arg) => {
      assertType(arg instanceof AgentHostConfigActionArgument);
      const sessionResource = arg.widget.viewModel?.model.sessionResource;
      if (!sessionResource) {
        return;
      }
      const dialogService = accessor.get(IDialogService);
      const storageService = accessor.get(IStorageService);
      const services = {
        agentHostService: accessor.get(IAgentHostService),
        provisionalService: accessor.get(IAgentHostUntitledProvisionalSessionService),
        workingDirectoryResolver: accessor.get(IAgentHostSessionWorkingDirectoryResolver),
        workspaceContextService: accessor.get(IWorkspaceContextService),
        configurationService: accessor.get(IConfigurationService)
      };
      const applied = await applyAgentHostCompletionAction(arg.action, dialogService, storageService, async (config) => {
        await applyAgentHostSessionConfigChange(sessionResource, config, services);
      });
      if (applied && arg.reference) {
        arg.widget.getContrib(ChatDynamicVariableModel.ID)?.addReference({
          id: arg.reference.id,
          range: arg.reference.range,
          isFile: arg.reference.isFile,
          isDirectory: arg.reference.isDirectory,
          fullName: arg.reference.displayName,
          data: arg.reference.data,
          _meta: arg.reference._meta
        });
      }
    }));
    for (const scheme of this._chatSessionsService.getContentProviderSchemes()) {
      void this._registerForScheme(scheme);
    }
    this._register(this._chatSessionsService.onDidChangeContentProviderSchemes(({ added, removed }) => {
      for (const scheme of removed) {
        this._registrations.deleteAndDispose(scheme);
      }
      for (const scheme of added) {
        void this._registerForScheme(scheme);
      }
    }));
  }
  async _registerForScheme(scheme) {
    if (!isAgentHostTarget(scheme)) {
      return;
    }
    const triggerCharacters = await this._chatSessionsService.getChatInputCompletionTriggerCharacters(scheme);
    if (!triggerCharacters || triggerCharacters.length === 0) {
      return;
    }
    if (!this._chatSessionsService.getContentProviderSchemes().includes(scheme)) {
      return;
    }
    this._registrations.set(scheme, this._registerProvider(
      { scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true },
      `agentHostChatInputCompletions[${scheme}]`,
      triggerCharacters,
      scheme
    ));
  }
  _resolveContext(model, scheme) {
    const widget = this._chatWidgetService.getWidgetByInputUri(model.uri);
    if (!widget?.viewModel) {
      return void 0;
    }
    const sessionResource = widget.viewModel.model.sessionResource;
    if (getChatSessionType(sessionResource) !== scheme) {
      return void 0;
    }
    return { sessionResource, context: widget };
  }
  _buildItem(position, item, widget) {
    const replaceRange = AgentHostInputCompletions.computeRange(position, item);
    const attachment = item.attachment;
    switch (attachment.kind) {
      case "command": {
        const action = getCompletionAction(attachment._meta);
        if (action) {
          if (isPolicyBlockedCompletionAction(action, this._configurationService)) {
            return void 0;
          }
          const keep = item.insertText !== "";
          const label = item.label ?? item.insertText;
          const reference = keep ? AgentHostReferenceArgument.forCommand(widget, attachment.command, attachment.description, AgentHostInputCompletions._insertedTokenRange(replaceRange, item.insertText), attachment._meta) : void 0;
          return {
            label: { label, description: attachment.description },
            insertText: item.insertText,
            filterText: label,
            range: replaceRange,
            kind: CompletionItemKind.Text,
            detail: attachment.description,
            command: {
              id: AgentHostInputCompletions.configActionCommand,
              title: "",
              arguments: [new AgentHostConfigActionArgument(widget, action, reference)]
            }
          };
        }
        return {
          label: { label: item.insertText, description: attachment.description },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          kind: CompletionItemKind.Text,
          detail: attachment.description,
          command: {
            id: AgentHostInputCompletions.addReferenceCommand,
            title: "",
            arguments: [AgentHostReferenceArgument.forCommand(widget, attachment.command, attachment.description, AgentHostInputCompletions._insertedTokenRange(replaceRange, item.insertText), attachment._meta)]
          }
        };
      }
      case "skill": {
        const label = attachment.displayName ? "/" + attachment.displayName : item.insertText.trimEnd();
        return {
          label: { label, description: attachment.description },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          kind: CompletionItemKind.Text,
          detail: attachment.description,
          command: {
            id: AgentHostInputCompletions.addReferenceCommand,
            title: "",
            arguments: [AgentHostReferenceArgument.forSkill(widget, attachment.uri, attachment.displayName, AgentHostInputCompletions._insertedTokenRange(replaceRange, item.insertText), attachment._meta)]
          }
        };
      }
      case "chat": {
        const label = attachment.displayName ?? attachment.title;
        return {
          label: { label, description: localize("chatReferenceDescription", "Chat") },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          kind: CompletionItemKind.Reference,
          command: {
            id: AgentHostInputCompletions.addReferenceCommand,
            title: "",
            arguments: [AgentHostReferenceArgument.forChat(widget, attachment.uri, attachment.endTurn, attachment.title, attachment.displayName, AgentHostInputCompletions._insertedTokenRange(replaceRange, item.insertText), attachment._meta)]
          }
        };
      }
      default: {
        const label = attachment.displayName ?? item.insertText;
        const description = attachment.uri.path;
        return {
          label: { label, description },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          kind: attachment.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
          command: {
            id: AgentHostInputCompletions.addReferenceCommand,
            title: "",
            arguments: [AgentHostReferenceArgument.forResource(widget, attachment.uri, attachment.displayName, !!attachment.isDirectory, AgentHostInputCompletions._insertedRange(replaceRange, item.insertText), attachment._meta)]
          }
        };
      }
    }
  }
  static _insertedRange(replaceRange, insertText) {
    return replaceRange.replace.setEndPosition(replaceRange.replace.startLineNumber, replaceRange.replace.startColumn + insertText.length);
  }
  static _insertedTokenRange(replaceRange, insertText) {
    return this._insertedRange(replaceRange, insertText.trimEnd());
  }
};
AgentHostInputCompletions.addReferenceCommand = "_chatAgentHostAddReferenceCmd";
AgentHostInputCompletions.configActionCommand = "_chatAgentHostConfigActionCmd";
AgentHostInputCompletions = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, IChatWidgetService),
  __decorateParam(2, IChatSessionsService),
  __decorateParam(3, IConfigurationService)
], AgentHostInputCompletions);
class AgentHostReferenceArgument {
  constructor(widget, id, data, displayName, isFile, isDirectory, range, _meta) {
    this.widget = widget;
    this.id = id;
    this.data = data;
    this.displayName = displayName;
    this.isFile = isFile;
    this.isDirectory = isDirectory;
    this.range = range;
    this._meta = _meta;
  }
  static forResource(widget, uri, displayName, isDirectory, range, _meta) {
    return new AgentHostReferenceArgument(widget, uri.toString(), uri, displayName, !isDirectory, isDirectory, range, _meta);
  }
  static forSkill(widget, uri, displayName, range, _meta) {
    const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, displayName ?? uri.toString(), uri, _meta);
    return new AgentHostReferenceArgument(widget, entry.id, entry.value, displayName, false, false, range, _meta);
  }
  static forCommand(widget, command, description, range, _meta) {
    const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, description ?? command, command, _meta);
    return new AgentHostReferenceArgument(widget, entry.id, entry.value, description, false, false, range, _meta);
  }
  static forChat(widget, uri, endTurn, title, displayName, range, _meta) {
    return new AgentHostReferenceArgument(widget, chatReferenceVariableEntryId(uri, endTurn), toChatReferenceDynamicVariableValue(uri, endTurn), displayName ?? title, false, false, range, _meta);
  }
}
class AgentHostConfigActionArgument {
  constructor(widget, action, reference) {
    this.widget = widget;
    this.action = action;
    this.reference = reference;
  }
}
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AgentHostInputCompletions, LifecyclePhase.Eventually);
export {
  AgentHostInputCompletions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2FnZW50SG9zdElucHV0Q29tcGxldGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQsIGNoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5SWQsIHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnksIHRvQ2hhdFJlZmVyZW5jZUR5bmFtaWNWYXJpYWJsZVZhbHVlLCB0eXBlIElBZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVWYWx1ZSwgdHlwZSBJQ2hhdFJlZmVyZW5jZUR5bmFtaWNWYXJpYWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkl0ZW0sIENvbXBsZXRpb25JdGVtS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDb21wbGV0aW9uQWN0aW9uLCB0eXBlIElBZ2VudEhvc3RDb21wbGV0aW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9tZXRhL2FnZW50Q29tcGxldGlvbkF0dGFjaG1lbnRNZXRhLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vYXR0YWNobWVudHMvY2hhdER5bmFtaWNWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRJbnB1dENvbXBsZXRpb25JdGVtLCBJQ2hhdFNlc3Npb25zU2VydmljZSwgaXNBZ2VudEhvc3RUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBhcHBseUFnZW50SG9zdENvbXBsZXRpb25BY3Rpb24sIGlzUG9saWN5QmxvY2tlZENvbXBsZXRpb25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9hZ2VudEhvc3RDb21wbGV0aW9uQWN0aW9uLmpzJztcbmltcG9ydCB7IGFwcGx5QWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ0NoYW5nZSB9IGZyb20gJy4uLy4uLy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FwcGx5QWdlbnRIb3N0U2Vzc2lvbkNvbmZpZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlciB9IGZyb20gJy4uLy4uLy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zQmFzZSB9IGZyb20gJy4vYWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uc0Jhc2UuanMnO1xuLyoqXG4gKiBDb21wbGV0aW9uIHByb3ZpZGVyIHRoYXQgZGVsZWdhdGVzIGBAYC1tZW50aW9uIChhbmQgb3RoZXIgc2VydmVyLWRlZmluZWQpXG4gKiBjb21wbGV0aW9ucyB0byB0aGUgYWdlbnQgaG9zdCBmb3IgQUhQLWJhY2tlZCBjaGF0IHNlc3Npb25zLlxuICpcbiAqIFJlZ2lzdHJhdGlvbnMgYXJlIG1hZGUgZHluYW1pY2FsbHkgcGVyIGNvbnRlbnQtcHJvdmlkZXIgc2NoZW1lIHNvIGVhY2hcbiAqIGNvbm5lY3Rpb24gY2FuIGFubm91bmNlIGl0cyBvd24gdHJpZ2dlciBjaGFyYWN0ZXJzIHZpYSB0aGUgcHJvdG9jb2wnc1xuICogYEluaXRpYWxpemVSZXN1bHQuY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzYC4gV2hlbiBhIGNvbnRlbnQgcHJvdmlkZXJcbiAqIGlzIHJlZ2lzdGVyZWQsIHdlIGFzayBpdCBmb3IgaXRzIHRyaWdnZXIgY2hhcnMgYW5kIHJlZ2lzdGVyIGEgTW9uYWNvXG4gKiBjb21wbGV0aW9uIHByb3ZpZGVyIHNjb3BlZCB0byB0aGF0IHNjaGVtZTsgd2hlbiBpdCBpcyB1bnJlZ2lzdGVyZWQgd2VcbiAqIHRlYXIgdGhlIHJlZ2lzdHJhdGlvbiBkb3duLlxuICpcbiAqIFRoZSBwcm92aWRlciB1c2VzIHRoZSBzYW1lIGBfYWRkUmVmZXJlbmNlQ21kYCBwYXR0ZXJuIGFzXG4gKiBgQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9uc2A6IHdoZW4gYW4gaXRlbSBpcyBhY2NlcHRlZCwgYSBjb21tYW5kIHJ1bnNcbiAqIHRoYXQgYWRkcyBhbiB7QGxpbmsgSUR5bmFtaWNWYXJpYWJsZX0gZW50cnkgdG8gdGhlIHdpZGdldCdzIHZhcmlhYmxlXG4gKiBtb2RlbCBzbyB0aGUgcmVzb3VyY2UgYmVjb21lcyBwYXJ0IG9mIHRoZSBvdXRnb2luZyB1c2VyIG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zIGV4dGVuZHMgQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uc0Jhc2U8SUNoYXRXaWRnZXQsIHN0cmluZz4ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGFkZFJlZmVyZW5jZUNvbW1hbmQgPSAnX2NoYXRBZ2VudEhvc3RBZGRSZWZlcmVuY2VDbWQnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBjb25maWdBY3Rpb25Db21tYW5kID0gJ19jaGF0QWdlbnRIb3N0Q29uZmlnQWN0aW9uQ21kJztcblxuXHQvKiogUGVyLXNjaGVtZSByZWdpc3RyYXRpb25zIG9mIHRoZSBNb25hY28gY29tcGxldGlvbiBwcm92aWRlci4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0cmF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zLmFkZFJlZmVyZW5jZUNvbW1hbmQsIChfc2VydmljZXMsIGFyZykgPT4ge1xuXHRcdFx0YXNzZXJ0VHlwZShhcmcgaW5zdGFuY2VvZiBBZ2VudEhvc3RSZWZlcmVuY2VBcmd1bWVudCk7XG5cdFx0XHRhcmcud2lkZ2V0LmdldENvbnRyaWI8Q2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsPihDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwuSUQpPy5hZGRSZWZlcmVuY2Uoe1xuXHRcdFx0XHRpZDogYXJnLmlkLFxuXHRcdFx0XHRyYW5nZTogYXJnLnJhbmdlLFxuXHRcdFx0XHRpc0ZpbGU6IGFyZy5pc0ZpbGUsXG5cdFx0XHRcdGlzRGlyZWN0b3J5OiBhcmcuaXNEaXJlY3RvcnksXG5cdFx0XHRcdGZ1bGxOYW1lOiBhcmcuZGlzcGxheU5hbWUsXG5cdFx0XHRcdGRhdGE6IGFyZy5kYXRhLFxuXHRcdFx0XHRfbWV0YTogYXJnLl9tZXRhLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQWNjZXB0IGhhbmRsZXIgZm9yIGNvbmZpZy1hY3Rpb24gY29tcGxldGlvbnMgKHBlcm1pc3Npb24vbW9kZSB0b2dnbGVzKS5cblx0XHQvLyBBcHBsaWVzIHRoZSBzZXNzaW9uLWNvbmZpZyBjaGFuZ2UgKHdpdGggdGhlIGVsZXZhdGVkLXBlcm1pc3Npb25cblx0XHQvLyBjb25maXJtYXRpb24pIGFuZCwgZm9yIGtlZXAtdGV4dCBpdGVtcywgYWRkcyB0aGUgYXJndW1lbnQtaGludFxuXHRcdC8vIHJlZmVyZW5jZS4gVG9nZ2xlIGl0ZW1zIGluc2VydCBub3RoaW5nLCBzbyB0aGVyZSBpcyBubyB0ZXh0IHRvIHJlbW92ZS5cblx0XHR0aGlzLl9yZWdpc3RlcihDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zLmNvbmZpZ0FjdGlvbkNvbW1hbmQsIGFzeW5jIChhY2Nlc3NvciwgYXJnKSA9PiB7XG5cdFx0XHRhc3NlcnRUeXBlKGFyZyBpbnN0YW5jZW9mIEFnZW50SG9zdENvbmZpZ0FjdGlvbkFyZ3VtZW50KTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGFyZy53aWRnZXQudmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRpZiAoIXNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlcyA9IHtcblx0XHRcdFx0YWdlbnRIb3N0U2VydmljZTogYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RTZXJ2aWNlKSxcblx0XHRcdFx0cHJvdmlzaW9uYWxTZXJ2aWNlOiBhY2Nlc3Nvci5nZXQoSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcnlSZXNvbHZlcjogYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyKSxcblx0XHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgYXBwbGllZCA9IGF3YWl0IGFwcGx5QWdlbnRIb3N0Q29tcGxldGlvbkFjdGlvbihhcmcuYWN0aW9uLCBkaWFsb2dTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgYXN5bmMgY29uZmlnID0+IHsgYXdhaXQgYXBwbHlBZ2VudEhvc3RTZXNzaW9uQ29uZmlnQ2hhbmdlKHNlc3Npb25SZXNvdXJjZSwgY29uZmlnLCBzZXJ2aWNlcyk7IH0pO1xuXHRcdFx0aWYgKGFwcGxpZWQgJiYgYXJnLnJlZmVyZW5jZSkge1xuXHRcdFx0XHRhcmcud2lkZ2V0LmdldENvbnRyaWI8Q2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsPihDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwuSUQpPy5hZGRSZWZlcmVuY2Uoe1xuXHRcdFx0XHRcdGlkOiBhcmcucmVmZXJlbmNlLmlkLFxuXHRcdFx0XHRcdHJhbmdlOiBhcmcucmVmZXJlbmNlLnJhbmdlLFxuXHRcdFx0XHRcdGlzRmlsZTogYXJnLnJlZmVyZW5jZS5pc0ZpbGUsXG5cdFx0XHRcdFx0aXNEaXJlY3Rvcnk6IGFyZy5yZWZlcmVuY2UuaXNEaXJlY3RvcnksXG5cdFx0XHRcdFx0ZnVsbE5hbWU6IGFyZy5yZWZlcmVuY2UuZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0ZGF0YTogYXJnLnJlZmVyZW5jZS5kYXRhLFxuXHRcdFx0XHRcdF9tZXRhOiBhcmcucmVmZXJlbmNlLl9tZXRhLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTeW5jIGV4aXN0aW5nIHJlZ2lzdHJhdGlvbnMgYW5kIG9ic2VydmUgY2hhbmdlcy5cblx0XHRmb3IgKGNvbnN0IHNjaGVtZSBvZiB0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENvbnRlbnRQcm92aWRlclNjaGVtZXMoKSkge1xuXHRcdFx0dm9pZCB0aGlzLl9yZWdpc3RlckZvclNjaGVtZShzY2hlbWUpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGVudFByb3ZpZGVyU2NoZW1lcygoeyBhZGRlZCwgcmVtb3ZlZCB9KSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHNjaGVtZSBvZiByZW1vdmVkKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShzY2hlbWUpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBzY2hlbWUgb2YgYWRkZWQpIHtcblx0XHRcdFx0dm9pZCB0aGlzLl9yZWdpc3RlckZvclNjaGVtZShzY2hlbWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlZ2lzdGVyRm9yU2NoZW1lKHNjaGVtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFpc0FnZW50SG9zdFRhcmdldChzY2hlbWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRyaWdnZXJDaGFyYWN0ZXJzID0gYXdhaXQgdGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0SW5wdXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMoc2NoZW1lKTtcblx0XHRpZiAoIXRyaWdnZXJDaGFyYWN0ZXJzIHx8IHRyaWdnZXJDaGFyYWN0ZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBwcm92aWRlciBtYXkgaGF2ZSBiZWVuIHJlbW92ZWQgd2hpbGUgd2Ugd2VyZSBhd2FpdGluZyB0aGVcblx0XHQvLyB0cmlnZ2VyIGNoYXJhY3RlcnMuIFJlLWNoZWNrIGJlZm9yZSByZWdpc3RlcmluZy5cblx0XHRpZiAoIXRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q29udGVudFByb3ZpZGVyU2NoZW1lcygpLmluY2x1ZGVzKHNjaGVtZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChzY2hlbWUsIHRoaXMuX3JlZ2lzdGVyUHJvdmlkZXIoXG5cdFx0XHR7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sXG5cdFx0XHRgYWdlbnRIb3N0Q2hhdElucHV0Q29tcGxldGlvbnNbJHtzY2hlbWV9XWAsXG5cdFx0XHR0cmlnZ2VyQ2hhcmFjdGVycyxcblx0XHRcdHNjaGVtZSxcblx0XHQpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcmVzb2x2ZUNvbnRleHQobW9kZWw6IElUZXh0TW9kZWwsIHNjaGVtZTogc3RyaW5nKTogeyBzZXNzaW9uUmVzb3VyY2U6IFVSSTsgY29udGV4dDogSUNoYXRXaWRnZXQgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShtb2RlbC51cmkpO1xuXHRcdGlmICghd2lkZ2V0Py52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHdpZGdldC52aWV3TW9kZWwubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdC8vIE9ubHkgcmVzcG9uZCB3aGVuIHRoZSBhY3RpdmUgc2Vzc2lvbiBpcyBoYW5kbGVkIGJ5IHRoZSBzYW1lXG5cdFx0Ly8gY29udGVudCBwcm92aWRlciB0aGF0IHJlZ2lzdGVyZWQgdGhpcyBNb25hY28gcHJvdmlkZXIuXG5cdFx0Ly8gV2l0aG91dCB0aGlzIGNoZWNrLCB0d28gcHJvdmlkZXJzIHNoYXJpbmcgdHJpZ2dlciBjaGFyYWN0ZXJzXG5cdFx0Ly8gKGUuZy4gYm90aCByZWdpc3RlciBgQGApIHdvdWxkIGJvdGggZmlyZSBhbmQgcHJvZHVjZSBkdXBsaWNhdGVcblx0XHQvLyBSUENzIC8gc3VnZ2VzdGlvbnMuXG5cdFx0aWYgKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpICE9PSBzY2hlbWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IHNlc3Npb25SZXNvdXJjZSwgY29udGV4dDogd2lkZ2V0IH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2J1aWxkSXRlbShwb3NpdGlvbjogUG9zaXRpb24sIGl0ZW06IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbSwgd2lkZ2V0OiBJQ2hhdFdpZGdldCk6IENvbXBsZXRpb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXBsYWNlUmFuZ2UgPSBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zLmNvbXB1dGVSYW5nZShwb3NpdGlvbiwgaXRlbSk7XG5cdFx0Y29uc3QgYXR0YWNobWVudCA9IGl0ZW0uYXR0YWNobWVudDtcblx0XHRzd2l0Y2ggKGF0dGFjaG1lbnQua2luZCkge1xuXHRcdFx0Y2FzZSAnY29tbWFuZCc6IHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0Q29tcGxldGlvbkFjdGlvbihhdHRhY2htZW50Ll9tZXRhKTtcblx0XHRcdFx0aWYgKGFjdGlvbikge1xuXHRcdFx0XHRcdC8vIE9taXQgYW4gZWxldmF0ZWQgYXV0by1hcHByb3ZlIHRvZ2dsZSAoQWxsb3cgYWxsIC8gQXNzaXN0ZWQpXG5cdFx0XHRcdFx0Ly8gd2hlbiBlbnRlcnByaXNlIHBvbGljeSBkaXNhYmxlcyBnbG9iYWwgYXV0by1hcHByb3ZhbCwgcmF0aGVyXG5cdFx0XHRcdFx0Ly8gdGhhbiBvZmZlcmluZyBhbiBpdGVtIHRoYXQgd291bGQgd2FybiB0aGVuIGNsYW1wIHRvIERlZmF1bHQuXG5cdFx0XHRcdFx0aWYgKGlzUG9saWN5QmxvY2tlZENvbXBsZXRpb25BY3Rpb24oYWN0aW9uLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIENvbmZpZy1hY3Rpb24gY29tcGxldGlvbiAocGVybWlzc2lvbi9tb2RlIHRvZ2dsZSkuIEtlZXAtdGV4dFxuXHRcdFx0XHRcdC8vIGl0ZW1zIChub24tZW1wdHkgaW5zZXJ0VGV4dCkgcmV0YWluIHRoZSBgL2NvbW1hbmQgYCB0ZXh0IGFuZFxuXHRcdFx0XHRcdC8vIGFkZCB0aGUgYXJndW1lbnQtaGludCByZWZlcmVuY2U7IHRvZ2dsZSBpdGVtcyBpbnNlcnQgbm90aGluZy5cblx0XHRcdFx0XHRjb25zdCBrZWVwID0gaXRlbS5pbnNlcnRUZXh0ICE9PSAnJztcblx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGl0ZW0ubGFiZWwgPz8gaXRlbS5pbnNlcnRUZXh0O1xuXHRcdFx0XHRcdGNvbnN0IHJlZmVyZW5jZSA9IGtlZXBcblx0XHRcdFx0XHRcdD8gQWdlbnRIb3N0UmVmZXJlbmNlQXJndW1lbnQuZm9yQ29tbWFuZCh3aWRnZXQsIGF0dGFjaG1lbnQuY29tbWFuZCwgYXR0YWNobWVudC5kZXNjcmlwdGlvbiwgQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucy5faW5zZXJ0ZWRUb2tlblJhbmdlKHJlcGxhY2VSYW5nZSwgaXRlbS5pbnNlcnRUZXh0KSwgYXR0YWNobWVudC5fbWV0YSlcblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbCwgZGVzY3JpcHRpb246IGF0dGFjaG1lbnQuZGVzY3JpcHRpb24gfSxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRcdGZpbHRlclRleHQ6IGxhYmVsLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IHJlcGxhY2VSYW5nZSxcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdFx0ZGV0YWlsOiBhdHRhY2htZW50LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRpZDogQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucy5jb25maWdBY3Rpb25Db21tYW5kLFxuXHRcdFx0XHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW25ldyBBZ2VudEhvc3RDb25maWdBY3Rpb25Bcmd1bWVudCh3aWRnZXQsIGFjdGlvbiwgcmVmZXJlbmNlKV0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbDogaXRlbS5pbnNlcnRUZXh0LCBkZXNjcmlwdGlvbjogYXR0YWNobWVudC5kZXNjcmlwdGlvbiB9LFxuXHRcdFx0XHRcdGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRmaWx0ZXJUZXh0OiBpdGVtLmluc2VydFRleHQsXG5cdFx0XHRcdFx0cmFuZ2U6IHJlcGxhY2VSYW5nZSxcblx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCxcblx0XHRcdFx0XHRkZXRhaWw6IGF0dGFjaG1lbnQuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMuYWRkUmVmZXJlbmNlQ29tbWFuZCxcblx0XHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW0FnZW50SG9zdFJlZmVyZW5jZUFyZ3VtZW50LmZvckNvbW1hbmQod2lkZ2V0LCBhdHRhY2htZW50LmNvbW1hbmQsIGF0dGFjaG1lbnQuZGVzY3JpcHRpb24sIEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMuX2luc2VydGVkVG9rZW5SYW5nZShyZXBsYWNlUmFuZ2UsIGl0ZW0uaW5zZXJ0VGV4dCksIGF0dGFjaG1lbnQuX21ldGEpXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc2tpbGwnOiB7XG5cdFx0XHRcdGNvbnN0IGxhYmVsID0gYXR0YWNobWVudC5kaXNwbGF5TmFtZSA/ICcvJyArIGF0dGFjaG1lbnQuZGlzcGxheU5hbWUgOiBpdGVtLmluc2VydFRleHQudHJpbUVuZCgpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsLCBkZXNjcmlwdGlvbjogYXR0YWNobWVudC5kZXNjcmlwdGlvbiB9LFxuXHRcdFx0XHRcdGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRmaWx0ZXJUZXh0OiBpdGVtLmluc2VydFRleHQsXG5cdFx0XHRcdFx0cmFuZ2U6IHJlcGxhY2VSYW5nZSxcblx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCxcblx0XHRcdFx0XHRkZXRhaWw6IGF0dGFjaG1lbnQuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMuYWRkUmVmZXJlbmNlQ29tbWFuZCxcblx0XHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW0FnZW50SG9zdFJlZmVyZW5jZUFyZ3VtZW50LmZvclNraWxsKHdpZGdldCwgYXR0YWNobWVudC51cmksIGF0dGFjaG1lbnQuZGlzcGxheU5hbWUsIEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMuX2luc2VydGVkVG9rZW5SYW5nZShyZXBsYWNlUmFuZ2UsIGl0ZW0uaW5zZXJ0VGV4dCksIGF0dGFjaG1lbnQuX21ldGEpXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnY2hhdCc6IHtcblx0XHRcdFx0Y29uc3QgbGFiZWwgPSBhdHRhY2htZW50LmRpc3BsYXlOYW1lID8/IGF0dGFjaG1lbnQudGl0bGU7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWwsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFJlZmVyZW5jZURlc2NyaXB0aW9uJywgXCJDaGF0XCIpIH0sXG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogaXRlbS5pbnNlcnRUZXh0LFxuXHRcdFx0XHRcdGZpbHRlclRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRyYW5nZTogcmVwbGFjZVJhbmdlLFxuXHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5SZWZlcmVuY2UsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMuYWRkUmVmZXJlbmNlQ29tbWFuZCxcblx0XHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW0FnZW50SG9zdFJlZmVyZW5jZUFyZ3VtZW50LmZvckNoYXQod2lkZ2V0LCBhdHRhY2htZW50LnVyaSwgYXR0YWNobWVudC5lbmRUdXJuLCBhdHRhY2htZW50LnRpdGxlLCBhdHRhY2htZW50LmRpc3BsYXlOYW1lLCBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zLl9pbnNlcnRlZFRva2VuUmFuZ2UocmVwbGFjZVJhbmdlLCBpdGVtLmluc2VydFRleHQpLCBhdHRhY2htZW50Ll9tZXRhKV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0Y29uc3QgbGFiZWwgPSBhdHRhY2htZW50LmRpc3BsYXlOYW1lID8/IGl0ZW0uaW5zZXJ0VGV4dDtcblx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBhdHRhY2htZW50LnVyaS5wYXRoO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsLCBkZXNjcmlwdGlvbiB9LFxuXHRcdFx0XHRcdGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRmaWx0ZXJUZXh0OiBpdGVtLmluc2VydFRleHQsXG5cdFx0XHRcdFx0cmFuZ2U6IHJlcGxhY2VSYW5nZSxcblx0XHRcdFx0XHRraW5kOiBhdHRhY2htZW50LmlzRGlyZWN0b3J5ID8gQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlciA6IENvbXBsZXRpb25JdGVtS2luZC5GaWxlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zLmFkZFJlZmVyZW5jZUNvbW1hbmQsXG5cdFx0XHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtBZ2VudEhvc3RSZWZlcmVuY2VBcmd1bWVudC5mb3JSZXNvdXJjZSh3aWRnZXQsIGF0dGFjaG1lbnQudXJpLCBhdHRhY2htZW50LmRpc3BsYXlOYW1lLCAhIWF0dGFjaG1lbnQuaXNEaXJlY3RvcnksIEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMuX2luc2VydGVkUmFuZ2UocmVwbGFjZVJhbmdlLCBpdGVtLmluc2VydFRleHQpLCBhdHRhY2htZW50Ll9tZXRhKV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaW5zZXJ0ZWRSYW5nZShyZXBsYWNlUmFuZ2U6IHsgcmVwbGFjZTogUmFuZ2UgfSwgaW5zZXJ0VGV4dDogc3RyaW5nKTogUmFuZ2Uge1xuXHRcdHJldHVybiByZXBsYWNlUmFuZ2UucmVwbGFjZS5zZXRFbmRQb3NpdGlvbihyZXBsYWNlUmFuZ2UucmVwbGFjZS5zdGFydExpbmVOdW1iZXIsIHJlcGxhY2VSYW5nZS5yZXBsYWNlLnN0YXJ0Q29sdW1uICsgaW5zZXJ0VGV4dC5sZW5ndGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2luc2VydGVkVG9rZW5SYW5nZShyZXBsYWNlUmFuZ2U6IHsgcmVwbGFjZTogUmFuZ2UgfSwgaW5zZXJ0VGV4dDogc3RyaW5nKTogUmFuZ2Uge1xuXHRcdHJldHVybiB0aGlzLl9pbnNlcnRlZFJhbmdlKHJlcGxhY2VSYW5nZSwgaW5zZXJ0VGV4dC50cmltRW5kKCkpO1xuXHR9XG59XG5cbmNsYXNzIEFnZW50SG9zdFJlZmVyZW5jZUFyZ3VtZW50IHtcblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB3aWRnZXQ6IElDaGF0V2lkZ2V0LFxuXHRcdHJlYWRvbmx5IGlkOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgZGF0YTogVVJJIHwgSUFnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZVZhbHVlIHwgSUNoYXRSZWZlcmVuY2VEeW5hbWljVmFyaWFibGVWYWx1ZSxcblx0XHRyZWFkb25seSBkaXNwbGF5TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IGlzRmlsZTogYm9vbGVhbixcblx0XHRyZWFkb25seSBpc0RpcmVjdG9yeTogYm9vbGVhbixcblx0XHRyZWFkb25seSByYW5nZTogUmFuZ2UsXG5cdFx0cmVhZG9ubHkgX21ldGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkLFxuXHQpIHsgfVxuXG5cdHN0YXRpYyBmb3JSZXNvdXJjZSh3aWRnZXQ6IElDaGF0V2lkZ2V0LCB1cmk6IFVSSSwgZGlzcGxheU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgaXNEaXJlY3Rvcnk6IGJvb2xlYW4sIHJhbmdlOiBSYW5nZSwgX21ldGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogQWdlbnRIb3N0UmVmZXJlbmNlQXJndW1lbnQge1xuXHRcdHJldHVybiBuZXcgQWdlbnRIb3N0UmVmZXJlbmNlQXJndW1lbnQod2lkZ2V0LCB1cmkudG9TdHJpbmcoKSwgdXJpLCBkaXNwbGF5TmFtZSwgIWlzRGlyZWN0b3J5LCBpc0RpcmVjdG9yeSwgcmFuZ2UsIF9tZXRhKTtcblx0fVxuXG5cdHN0YXRpYyBmb3JTa2lsbCh3aWRnZXQ6IElDaGF0V2lkZ2V0LCB1cmk6IFVSSSwgZGlzcGxheU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmFuZ2U6IFJhbmdlLCBfbWV0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBBZ2VudEhvc3RSZWZlcmVuY2VBcmd1bWVudCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0b0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5KEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLlNraWxsLCBkaXNwbGF5TmFtZSA/PyB1cmkudG9TdHJpbmcoKSwgdXJpLCBfbWV0YSk7XG5cdFx0cmV0dXJuIG5ldyBBZ2VudEhvc3RSZWZlcmVuY2VBcmd1bWVudCh3aWRnZXQsIGVudHJ5LmlkLCBlbnRyeS52YWx1ZSwgZGlzcGxheU5hbWUsIGZhbHNlLCBmYWxzZSwgcmFuZ2UsIF9tZXRhKTtcblx0fVxuXG5cdHN0YXRpYyBmb3JDb21tYW5kKHdpZGdldDogSUNoYXRXaWRnZXQsIGNvbW1hbmQ6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCwgcmFuZ2U6IFJhbmdlLCBfbWV0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBBZ2VudEhvc3RSZWZlcmVuY2VBcmd1bWVudCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0b0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5KEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLkNvbW1hbmQsIGRlc2NyaXB0aW9uID8/IGNvbW1hbmQsIGNvbW1hbmQsIF9tZXRhKTtcblx0XHRyZXR1cm4gbmV3IEFnZW50SG9zdFJlZmVyZW5jZUFyZ3VtZW50KHdpZGdldCwgZW50cnkuaWQsIGVudHJ5LnZhbHVlLCBkZXNjcmlwdGlvbiwgZmFsc2UsIGZhbHNlLCByYW5nZSwgX21ldGEpO1xuXHR9XG5cblx0c3RhdGljIGZvckNoYXQod2lkZ2V0OiBJQ2hhdFdpZGdldCwgdXJpOiBVUkksIGVuZFR1cm46IHN0cmluZyB8IHVuZGVmaW5lZCwgdGl0bGU6IHN0cmluZywgZGlzcGxheU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmFuZ2U6IFJhbmdlLCBfbWV0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBBZ2VudEhvc3RSZWZlcmVuY2VBcmd1bWVudCB7XG5cdFx0Ly8gVGhlIHJlZmVyZW5jZWQgY2hhdCByZXNvdXJjZSBhbmQgYGVuZFR1cm5gIHJpZGUgdGhyb3VnaCB0aGUgZHluYW1pY1xuXHRcdC8vIHZhcmlhYmxlJ3MgYGRhdGFgIGNoYW5uZWwgKG5vdCBhbiBvdXQtb2YtYmFuZCBgX21ldGFgIGJhZyksIHNvIHRoZVxuXHRcdC8vIHJlcXVlc3QgcGFyc2VyIGNhbiByZWJ1aWxkIHRoZSBmaXJzdC1jbGFzcyBgY2hhdFJlZmVyZW5jZWAgZW50cnkgdmlhXG5cdFx0Ly8gYENoYXRSZXF1ZXN0RHluYW1pY1ZhcmlhYmxlUGFydC50b1ZhcmlhYmxlRW50cnkoKWAuIFRoZSBzdGFibGUgaWRcblx0XHQvLyBkZWR1cGVzIHJlLWFjY2VwdGluZyB0aGUgc2FtZSByZWZlcmVuY2UuXG5cdFx0cmV0dXJuIG5ldyBBZ2VudEhvc3RSZWZlcmVuY2VBcmd1bWVudCh3aWRnZXQsIGNoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5SWQodXJpLCBlbmRUdXJuKSwgdG9DaGF0UmVmZXJlbmNlRHluYW1pY1ZhcmlhYmxlVmFsdWUodXJpLCBlbmRUdXJuKSwgZGlzcGxheU5hbWUgPz8gdGl0bGUsIGZhbHNlLCBmYWxzZSwgcmFuZ2UsIF9tZXRhKTtcblx0fVxufVxuXG4vKipcbiAqIEFyZ3VtZW50IHBhc3NlZCB0byB0aGUgY29uZmlnLWFjdGlvbiBhY2NlcHQgY29tbWFuZC4gQ2FycmllcyB0aGUgdGFyZ2V0XG4gKiB3aWRnZXQsIHRoZSB7QGxpbmsgSUFnZW50SG9zdENvbXBsZXRpb25BY3Rpb259IHRvIGFwcGx5LCBhbmQgXHUyMDE0IGZvciBrZWVwLXRleHRcbiAqIGl0ZW1zIFx1MjAxNCB0aGUgYXJndW1lbnQtaGludCByZWZlcmVuY2UgdG8gYWRkIG9uY2UgYXBwbGllZC4gVG9nZ2xlIGl0ZW1zIGluc2VydFxuICogbm90aGluZywgc28gbm8gdGV4dCBuZWVkcyB0byBiZSByZW1vdmVkLlxuICovXG5jbGFzcyBBZ2VudEhvc3RDb25maWdBY3Rpb25Bcmd1bWVudCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHdpZGdldDogSUNoYXRXaWRnZXQsXG5cdFx0cmVhZG9ubHkgYWN0aW9uOiBJQWdlbnRIb3N0Q29tcGxldGlvbkFjdGlvbixcblx0XHRyZWFkb25seSByZWZlcmVuY2U6IEFnZW50SG9zdFJlZmVyZW5jZUFyZ3VtZW50IHwgdW5kZWZpbmVkLFxuXHQpIHsgfVxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucywgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtDQUFrQyw4QkFBOEIsb0NBQW9DLDJDQUE0SDtBQUd6TyxTQUF5QiwwQkFBMEI7QUFFbkQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBNEQ7QUFDckUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjLDJCQUE0RDtBQUNuRixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdDQUFnQztBQUN6QyxTQUFtQyxzQkFBc0IseUJBQXlCO0FBQ2xGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLGdDQUFnQyx1Q0FBdUM7QUFDaEYsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyxpREFBaUQ7QUFDMUQsU0FBUyxtREFBbUQ7QUFDNUQsU0FBUyxxQ0FBcUM7QUFpQnZDLElBQU0sNEJBQU4sY0FBd0MsOEJBQW1EO0FBQUEsRUFRakcsWUFDMkIseUJBQ1csb0JBQ2YscUJBQ2tCLHVCQUN2QztBQUNELFVBQU0seUJBQXlCLG1CQUFtQjtBQUpiO0FBRUc7QUFOekM7QUFBQSxTQUFpQixpQkFBaUIsS0FBSyxVQUFVLElBQUksY0FBc0IsQ0FBQztBQVUzRSxTQUFLLFVBQVUsaUJBQWlCLGdCQUFnQiwwQkFBMEIscUJBQXFCLENBQUMsV0FBVyxRQUFRO0FBQ2xILGlCQUFXLGVBQWUsMEJBQTBCO0FBQ3BELFVBQUksT0FBTyxXQUFxQyx5QkFBeUIsRUFBRSxHQUFHLGFBQWE7QUFBQSxRQUMxRixJQUFJLElBQUk7QUFBQSxRQUNSLE9BQU8sSUFBSTtBQUFBLFFBQ1gsUUFBUSxJQUFJO0FBQUEsUUFDWixhQUFhLElBQUk7QUFBQSxRQUNqQixVQUFVLElBQUk7QUFBQSxRQUNkLE1BQU0sSUFBSTtBQUFBLFFBQ1YsT0FBTyxJQUFJO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFNRixTQUFLLFVBQVUsaUJBQWlCLGdCQUFnQiwwQkFBMEIscUJBQXFCLE9BQU8sVUFBVSxRQUFRO0FBQ3ZILGlCQUFXLGVBQWUsNkJBQTZCO0FBQ3ZELFlBQU0sa0JBQWtCLElBQUksT0FBTyxXQUFXLE1BQU07QUFDcEQsVUFBSSxDQUFDLGlCQUFpQjtBQUNyQjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxZQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUNuRCxZQUFNLFdBQVc7QUFBQSxRQUNoQixrQkFBa0IsU0FBUyxJQUFJLGlCQUFpQjtBQUFBLFFBQ2hELG9CQUFvQixTQUFTLElBQUksMkNBQTJDO0FBQUEsUUFDNUUsMEJBQTBCLFNBQVMsSUFBSSx5Q0FBeUM7QUFBQSxRQUNoRix5QkFBeUIsU0FBUyxJQUFJLHdCQUF3QjtBQUFBLFFBQzlELHNCQUFzQixTQUFTLElBQUkscUJBQXFCO0FBQUEsTUFDekQ7QUFDQSxZQUFNLFVBQVUsTUFBTSwrQkFBK0IsSUFBSSxRQUFRLGVBQWUsZ0JBQWdCLE9BQU0sV0FBVTtBQUFFLGNBQU0sa0NBQWtDLGlCQUFpQixRQUFRLFFBQVE7QUFBQSxNQUFHLENBQUM7QUFDL0wsVUFBSSxXQUFXLElBQUksV0FBVztBQUM3QixZQUFJLE9BQU8sV0FBcUMseUJBQXlCLEVBQUUsR0FBRyxhQUFhO0FBQUEsVUFDMUYsSUFBSSxJQUFJLFVBQVU7QUFBQSxVQUNsQixPQUFPLElBQUksVUFBVTtBQUFBLFVBQ3JCLFFBQVEsSUFBSSxVQUFVO0FBQUEsVUFDdEIsYUFBYSxJQUFJLFVBQVU7QUFBQSxVQUMzQixVQUFVLElBQUksVUFBVTtBQUFBLFVBQ3hCLE1BQU0sSUFBSSxVQUFVO0FBQUEsVUFDcEIsT0FBTyxJQUFJLFVBQVU7QUFBQSxRQUN0QixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsZUFBVyxVQUFVLEtBQUsscUJBQXFCLDBCQUEwQixHQUFHO0FBQzNFLFdBQUssS0FBSyxtQkFBbUIsTUFBTTtBQUFBLElBQ3BDO0FBQ0EsU0FBSyxVQUFVLEtBQUsscUJBQXFCLGtDQUFrQyxDQUFDLEVBQUUsT0FBTyxRQUFRLE1BQU07QUFDbEcsaUJBQVcsVUFBVSxTQUFTO0FBQzdCLGFBQUssZUFBZSxpQkFBaUIsTUFBTTtBQUFBLE1BQzVDO0FBQ0EsaUJBQVcsVUFBVSxPQUFPO0FBQzNCLGFBQUssS0FBSyxtQkFBbUIsTUFBTTtBQUFBLE1BQ3BDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFjLG1CQUFtQixRQUErQjtBQUMvRCxRQUFJLENBQUMsa0JBQWtCLE1BQU0sR0FBRztBQUMvQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLG9CQUFvQixNQUFNLEtBQUsscUJBQXFCLHdDQUF3QyxNQUFNO0FBQ3hHLFFBQUksQ0FBQyxxQkFBcUIsa0JBQWtCLFdBQVcsR0FBRztBQUN6RDtBQUFBLElBQ0Q7QUFJQSxRQUFJLENBQUMsS0FBSyxxQkFBcUIsMEJBQTBCLEVBQUUsU0FBUyxNQUFNLEdBQUc7QUFDNUU7QUFBQSxJQUNEO0FBRUEsU0FBSyxlQUFlLElBQUksUUFBUSxLQUFLO0FBQUEsTUFDcEMsRUFBRSxRQUFRLFFBQVEsaUJBQWlCLHNCQUFzQixLQUFLO0FBQUEsTUFDOUQsaUNBQWlDLE1BQU07QUFBQSxNQUN2QztBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFbUIsZ0JBQWdCLE9BQW1CLFFBQTRFO0FBQ2pJLFVBQU0sU0FBUyxLQUFLLG1CQUFtQixvQkFBb0IsTUFBTSxHQUFHO0FBQ3BFLFFBQUksQ0FBQyxRQUFRLFdBQVc7QUFDdkIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLGtCQUFrQixPQUFPLFVBQVUsTUFBTTtBQU0vQyxRQUFJLG1CQUFtQixlQUFlLE1BQU0sUUFBUTtBQUNuRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sRUFBRSxpQkFBaUIsU0FBUyxPQUFPO0FBQUEsRUFDM0M7QUFBQSxFQUVtQixXQUFXLFVBQW9CLE1BQWdDLFFBQWlEO0FBQ2xJLFVBQU0sZUFBZSwwQkFBMEIsYUFBYSxVQUFVLElBQUk7QUFDMUUsVUFBTSxhQUFhLEtBQUs7QUFDeEIsWUFBUSxXQUFXLE1BQU07QUFBQSxNQUN4QixLQUFLLFdBQVc7QUFDZixjQUFNLFNBQVMsb0JBQW9CLFdBQVcsS0FBSztBQUNuRCxZQUFJLFFBQVE7QUFJWCxjQUFJLGdDQUFnQyxRQUFRLEtBQUsscUJBQXFCLEdBQUc7QUFDeEUsbUJBQU87QUFBQSxVQUNSO0FBSUEsZ0JBQU0sT0FBTyxLQUFLLGVBQWU7QUFDakMsZ0JBQU0sUUFBUSxLQUFLLFNBQVMsS0FBSztBQUNqQyxnQkFBTSxZQUFZLE9BQ2YsMkJBQTJCLFdBQVcsUUFBUSxXQUFXLFNBQVMsV0FBVyxhQUFhLDBCQUEwQixvQkFBb0IsY0FBYyxLQUFLLFVBQVUsR0FBRyxXQUFXLEtBQUssSUFDeEw7QUFDSCxpQkFBTztBQUFBLFlBQ04sT0FBTyxFQUFFLE9BQU8sYUFBYSxXQUFXLFlBQVk7QUFBQSxZQUNwRCxZQUFZLEtBQUs7QUFBQSxZQUNqQixZQUFZO0FBQUEsWUFDWixPQUFPO0FBQUEsWUFDUCxNQUFNLG1CQUFtQjtBQUFBLFlBQ3pCLFFBQVEsV0FBVztBQUFBLFlBQ25CLFNBQVM7QUFBQSxjQUNSLElBQUksMEJBQTBCO0FBQUEsY0FDOUIsT0FBTztBQUFBLGNBQ1AsV0FBVyxDQUFDLElBQUksOEJBQThCLFFBQVEsUUFBUSxTQUFTLENBQUM7QUFBQSxZQUN6RTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQ0EsZUFBTztBQUFBLFVBQ04sT0FBTyxFQUFFLE9BQU8sS0FBSyxZQUFZLGFBQWEsV0FBVyxZQUFZO0FBQUEsVUFDckUsWUFBWSxLQUFLO0FBQUEsVUFDakIsWUFBWSxLQUFLO0FBQUEsVUFDakIsT0FBTztBQUFBLFVBQ1AsTUFBTSxtQkFBbUI7QUFBQSxVQUN6QixRQUFRLFdBQVc7QUFBQSxVQUNuQixTQUFTO0FBQUEsWUFDUixJQUFJLDBCQUEwQjtBQUFBLFlBQzlCLE9BQU87QUFBQSxZQUNQLFdBQVcsQ0FBQywyQkFBMkIsV0FBVyxRQUFRLFdBQVcsU0FBUyxXQUFXLGFBQWEsMEJBQTBCLG9CQUFvQixjQUFjLEtBQUssVUFBVSxHQUFHLFdBQVcsS0FBSyxDQUFDO0FBQUEsVUFDdE07QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxTQUFTO0FBQ2IsY0FBTSxRQUFRLFdBQVcsY0FBYyxNQUFNLFdBQVcsY0FBYyxLQUFLLFdBQVcsUUFBUTtBQUM5RixlQUFPO0FBQUEsVUFDTixPQUFPLEVBQUUsT0FBTyxhQUFhLFdBQVcsWUFBWTtBQUFBLFVBQ3BELFlBQVksS0FBSztBQUFBLFVBQ2pCLFlBQVksS0FBSztBQUFBLFVBQ2pCLE9BQU87QUFBQSxVQUNQLE1BQU0sbUJBQW1CO0FBQUEsVUFDekIsUUFBUSxXQUFXO0FBQUEsVUFDbkIsU0FBUztBQUFBLFlBQ1IsSUFBSSwwQkFBMEI7QUFBQSxZQUM5QixPQUFPO0FBQUEsWUFDUCxXQUFXLENBQUMsMkJBQTJCLFNBQVMsUUFBUSxXQUFXLEtBQUssV0FBVyxhQUFhLDBCQUEwQixvQkFBb0IsY0FBYyxLQUFLLFVBQVUsR0FBRyxXQUFXLEtBQUssQ0FBQztBQUFBLFVBQ2hNO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssUUFBUTtBQUNaLGNBQU0sUUFBUSxXQUFXLGVBQWUsV0FBVztBQUNuRCxlQUFPO0FBQUEsVUFDTixPQUFPLEVBQUUsT0FBTyxhQUFhLFNBQVMsNEJBQTRCLE1BQU0sRUFBRTtBQUFBLFVBQzFFLFlBQVksS0FBSztBQUFBLFVBQ2pCLFlBQVksS0FBSztBQUFBLFVBQ2pCLE9BQU87QUFBQSxVQUNQLE1BQU0sbUJBQW1CO0FBQUEsVUFDekIsU0FBUztBQUFBLFlBQ1IsSUFBSSwwQkFBMEI7QUFBQSxZQUM5QixPQUFPO0FBQUEsWUFDUCxXQUFXLENBQUMsMkJBQTJCLFFBQVEsUUFBUSxXQUFXLEtBQUssV0FBVyxTQUFTLFdBQVcsT0FBTyxXQUFXLGFBQWEsMEJBQTBCLG9CQUFvQixjQUFjLEtBQUssVUFBVSxHQUFHLFdBQVcsS0FBSyxDQUFDO0FBQUEsVUFDck87QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsU0FBUztBQUNSLGNBQU0sUUFBUSxXQUFXLGVBQWUsS0FBSztBQUM3QyxjQUFNLGNBQWMsV0FBVyxJQUFJO0FBQ25DLGVBQU87QUFBQSxVQUNOLE9BQU8sRUFBRSxPQUFPLFlBQVk7QUFBQSxVQUM1QixZQUFZLEtBQUs7QUFBQSxVQUNqQixZQUFZLEtBQUs7QUFBQSxVQUNqQixPQUFPO0FBQUEsVUFDUCxNQUFNLFdBQVcsY0FBYyxtQkFBbUIsU0FBUyxtQkFBbUI7QUFBQSxVQUM5RSxTQUFTO0FBQUEsWUFDUixJQUFJLDBCQUEwQjtBQUFBLFlBQzlCLE9BQU87QUFBQSxZQUNQLFdBQVcsQ0FBQywyQkFBMkIsWUFBWSxRQUFRLFdBQVcsS0FBSyxXQUFXLGFBQWEsQ0FBQyxDQUFDLFdBQVcsYUFBYSwwQkFBMEIsZUFBZSxjQUFjLEtBQUssVUFBVSxHQUFHLFdBQVcsS0FBSyxDQUFDO0FBQUEsVUFDeE47QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFlLGVBQWUsY0FBa0MsWUFBMkI7QUFDMUYsV0FBTyxhQUFhLFFBQVEsZUFBZSxhQUFhLFFBQVEsaUJBQWlCLGFBQWEsUUFBUSxjQUFjLFdBQVcsTUFBTTtBQUFBLEVBQ3RJO0FBQUEsRUFFQSxPQUFlLG9CQUFvQixjQUFrQyxZQUEyQjtBQUMvRixXQUFPLEtBQUssZUFBZSxjQUFjLFdBQVcsUUFBUSxDQUFDO0FBQUEsRUFDOUQ7QUFDRDtBQTlOYSwwQkFFWSxzQkFBc0I7QUFGbEMsMEJBR1ksc0JBQXNCO0FBSGxDLDRCQUFOO0FBQUEsRUFTSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBWlU7QUFnT2IsTUFBTSwyQkFBMkI7QUFBQSxFQUN4QixZQUNFLFFBQ0EsSUFDQSxNQUNBLGFBQ0EsUUFDQSxhQUNBLE9BQ0EsT0FDUjtBQVJRO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQSxFQUNOO0FBQUEsRUFFSixPQUFPLFlBQVksUUFBcUIsS0FBVSxhQUFpQyxhQUFzQixPQUFjLE9BQXdFO0FBQzlMLFdBQU8sSUFBSSwyQkFBMkIsUUFBUSxJQUFJLFNBQVMsR0FBRyxLQUFLLGFBQWEsQ0FBQyxhQUFhLGFBQWEsT0FBTyxLQUFLO0FBQUEsRUFDeEg7QUFBQSxFQUVBLE9BQU8sU0FBUyxRQUFxQixLQUFVLGFBQWlDLE9BQWMsT0FBd0U7QUFDckssVUFBTSxRQUFRLG1DQUFtQyxpQ0FBaUMsT0FBTyxlQUFlLElBQUksU0FBUyxHQUFHLEtBQUssS0FBSztBQUNsSSxXQUFPLElBQUksMkJBQTJCLFFBQVEsTUFBTSxJQUFJLE1BQU0sT0FBTyxhQUFhLE9BQU8sT0FBTyxPQUFPLEtBQUs7QUFBQSxFQUM3RztBQUFBLEVBRUEsT0FBTyxXQUFXLFFBQXFCLFNBQWlCLGFBQWlDLE9BQWMsT0FBd0U7QUFDOUssVUFBTSxRQUFRLG1DQUFtQyxpQ0FBaUMsU0FBUyxlQUFlLFNBQVMsU0FBUyxLQUFLO0FBQ2pJLFdBQU8sSUFBSSwyQkFBMkIsUUFBUSxNQUFNLElBQUksTUFBTSxPQUFPLGFBQWEsT0FBTyxPQUFPLE9BQU8sS0FBSztBQUFBLEVBQzdHO0FBQUEsRUFFQSxPQUFPLFFBQVEsUUFBcUIsS0FBVSxTQUE2QixPQUFlLGFBQWlDLE9BQWMsT0FBd0U7QUFNaE4sV0FBTyxJQUFJLDJCQUEyQixRQUFRLDZCQUE2QixLQUFLLE9BQU8sR0FBRyxvQ0FBb0MsS0FBSyxPQUFPLEdBQUcsZUFBZSxPQUFPLE9BQU8sT0FBTyxPQUFPLEtBQUs7QUFBQSxFQUM5TDtBQUNEO0FBUUEsTUFBTSw4QkFBOEI7QUFBQSxFQUNuQyxZQUNVLFFBQ0EsUUFDQSxXQUNSO0FBSFE7QUFDQTtBQUNBO0FBQUEsRUFDTjtBQUNMO0FBRUEsU0FBUyxHQUFvQyxvQkFBb0IsU0FBUyxFQUFFLDhCQUE4QiwyQkFBMkIsZUFBZSxVQUFVOyIsCiAgIm5hbWVzIjogW10KfQo=
