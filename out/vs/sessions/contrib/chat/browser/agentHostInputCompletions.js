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
import { MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { OffsetRange } from "../../../../editor/common/core/ranges/offsetRange.js";
import { CompletionItemKind } from "../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { getCommandArgumentHint, getCompletionAction } from "../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js";
import { AgentHostCompletionReferenceKind, getAgentHostCompletionReferenceKind, isAgentHostCompletionVariableEntry, toAgentHostCompletionVariableEntry } from "../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js";
import { IChatSessionsService, isAgentHostTarget } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { getChatSessionType } from "../../../../workbench/contrib/chat/common/model/chatUri.js";
import { AgentHostInputCompletionsBase } from "../../../../workbench/contrib/chat/browser/widget/input/editor/agentHostInputCompletionsBase.js";
import { getInputPlaceholderColor, getRangeForPlaceholder } from "../../../../workbench/contrib/chat/browser/widget/input/editor/chatInputPlaceholderDecoration.js";
import { applyAgentHostCompletionAction, isPolicyBlockedCompletionAction } from "../../../../workbench/contrib/chat/browser/agentHostCompletionAction.js";
import { isAgentHostProvider } from "../../../common/agentHostSessionsProvider.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionContext } from "../../../services/sessions/browser/sessionContext.js";
const ADD_REFERENCE_COMMAND = "sessions.chat.addAgentHostReference";
CommandsRegistry.registerCommand(ADD_REFERENCE_COMMAND, (_accessor, arg) => {
  arg.handler.acceptCompletion(arg.entry, arg.insertText, arg.range);
});
const CONFIG_ACTION_COMMAND = "sessions.chat.applyAgentHostConfigAction";
CommandsRegistry.registerCommand(CONFIG_ACTION_COMMAND, async (accessor, arg) => {
  await arg.handler.applyConfigAction(accessor, arg);
});
function getAgentHostCompletionAttachmentRange(value, referenceText, preferredRange, messageOffset, messageLength) {
  if (!referenceText) {
    return void 0;
  }
  let bestIndex = -1;
  let bestDistance = Number.MAX_SAFE_INTEGER;
  let from = 0;
  while (true) {
    const index = value.indexOf(referenceText, from);
    if (index < 0) {
      break;
    }
    const distance = preferredRange ? Math.abs(index - preferredRange.start) : index;
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
    from = index + referenceText.length;
  }
  if (bestIndex < 0) {
    return void 0;
  }
  const start = bestIndex - messageOffset;
  const endExclusive = start + referenceText.length;
  if (start < 0 || endExclusive > messageLength) {
    return void 0;
  }
  return new OffsetRange(start, endExclusive);
}
function getCommandArgumentHintPlaceholder(value, attachments, insertedReferences) {
  for (const entry of attachments) {
    if (getAgentHostCompletionReferenceKind(entry) !== AgentHostCompletionReferenceKind.Command) {
      continue;
    }
    const argumentHint = getCommandArgumentHint(entry._meta);
    if (!argumentHint) {
      continue;
    }
    const reference = insertedReferences.get(entry.id);
    if (!reference) {
      continue;
    }
    const range = getAgentHostCompletionAttachmentRange(value, reference.text, reference.range, 0, value.length);
    if (!range) {
      continue;
    }
    if (value.slice(0, range.start).trim().length > 0 || value.slice(range.endExclusive) !== " ") {
      return void 0;
    }
    return { argumentHint, endOffset: range.endExclusive };
  }
  return void 0;
}
let AgentHostInputCompletionHandler = class extends AgentHostInputCompletionsBase {
  constructor(_editor, _contextAttachments, languageFeaturesService, _sessionContext, chatSessionsService, _codeEditorService, _themeService, _configurationService) {
    super(languageFeaturesService, chatSessionsService);
    this._editor = _editor;
    this._contextAttachments = _contextAttachments;
    this._sessionContext = _sessionContext;
    this._codeEditorService = _codeEditorService;
    this._themeService = _themeService;
    this._configurationService = _configurationService;
    this._registration = this._register(new MutableDisposable());
    /**
     * Inserted reference per accepted attachment id. Used to find and decorate
     * the accepted occurrence in the editor and dropped when the user removes
     * the attachment chip.
     */
    this._insertedReferences = /* @__PURE__ */ new Map();
    this._register(this._codeEditorService.registerDecorationType(AgentHostInputCompletionHandler._argumentHintDecorationDescription, AgentHostInputCompletionHandler._argumentHintDecorationType, {}));
    this._decorations = this._editor.createDecorationsCollection();
    this._registerDecorations();
    let currentScheme;
    this._register(autorun((reader) => {
      const session = this._sessionContext.session.read(reader);
      const scheme = session ? getChatSessionType(session.resource) : void 0;
      if (scheme === currentScheme) {
        return;
      }
      currentScheme = scheme;
      this._registration.clear();
      if (scheme && isAgentHostTarget(scheme)) {
        void this._registerForScheme(scheme);
      }
    }));
  }
  async _registerForScheme(scheme) {
    const triggerCharacters = await this._chatSessionsService.getChatInputCompletionTriggerCharacters(scheme);
    if (!triggerCharacters || triggerCharacters.length === 0) {
      return;
    }
    const activeSession = this._sessionContext.session.get();
    if (!activeSession || getChatSessionType(activeSession.resource) !== scheme) {
      return;
    }
    const editorUri = this._editor.getModel()?.uri;
    if (!editorUri) {
      return;
    }
    this._registration.value = this._registerProvider(
      { scheme: editorUri.scheme, hasAccessToAllModels: true },
      `sessionsAgentHostInputCompletions[${scheme}]`,
      triggerCharacters,
      scheme
    );
  }
  _resolveContext(model, scheme) {
    if (/^\s*\/troubleshoot\b/.test(model.getValue())) {
      return void 0;
    }
    const session = this._sessionContext.session.get();
    if (!session) {
      return void 0;
    }
    const sessionResource = session.resource;
    if (getChatSessionType(sessionResource) !== scheme) {
      return void 0;
    }
    return { sessionResource, context: void 0 };
  }
  _buildItem(position, item) {
    const replaceRange = AgentHostInputCompletionHandler.computeRange(position, item);
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
          const referenceText2 = item.insertText.trimEnd();
          const entry2 = keep ? toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, referenceText2, attachment.command, attachment._meta) : void 0;
          return {
            label: { label, description: attachment.description },
            insertText: item.insertText,
            filterText: label,
            range: replaceRange,
            kind: CompletionItemKind.Text,
            documentation: attachment.description,
            command: {
              id: CONFIG_ACTION_COMMAND,
              title: "",
              arguments: [{
                handler: this,
                action,
                entry: entry2,
                referenceText: referenceText2,
                referenceRange: entry2 ? this._toOffsetRange(replaceRange.replace, referenceText2) : void 0
              }]
            }
          };
        }
        const referenceText = item.insertText.trimEnd();
        const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, referenceText, attachment.command, attachment._meta);
        return {
          label: { label: item.insertText, description: attachment.description },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          kind: CompletionItemKind.Text,
          documentation: attachment.description,
          command: {
            id: ADD_REFERENCE_COMMAND,
            title: "",
            arguments: [{
              handler: this,
              entry,
              insertText: referenceText,
              range: this._toOffsetRange(replaceRange.replace, referenceText)
            }]
          }
        };
      }
      case "skill": {
        const referenceText = item.insertText.trimEnd();
        const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, referenceText, attachment.uri, attachment._meta);
        return {
          label: { label: item.insertText, description: attachment.description },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          documentation: attachment.description,
          kind: CompletionItemKind.Text,
          command: {
            id: ADD_REFERENCE_COMMAND,
            title: "",
            arguments: [{
              handler: this,
              entry,
              insertText: referenceText,
              range: this._toOffsetRange(replaceRange.replace, referenceText)
            }]
          }
        };
      }
      case "chat": {
        return void 0;
      }
      default: {
        const label = attachment.displayName ?? item.insertText;
        const description = attachment.uri.path;
        const kind = attachment.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File;
        const entry = {
          id: attachment.uri.toString(),
          name: attachment.displayName ?? this._basename(attachment.uri),
          value: attachment.uri,
          kind: attachment.isDirectory ? "directory" : "file",
          _meta: attachment._meta
        };
        return {
          label: { label, description },
          insertText: item.insertText,
          filterText: item.insertText,
          range: replaceRange,
          kind,
          command: {
            id: ADD_REFERENCE_COMMAND,
            title: "",
            arguments: [{
              handler: this,
              entry,
              insertText: item.insertText,
              range: this._toOffsetRange(replaceRange.replace, item.insertText)
            }]
          }
        };
      }
    }
  }
  _basename(uri) {
    const idx = uri.path.lastIndexOf("/");
    return idx >= 0 ? uri.path.slice(idx + 1) : uri.path;
  }
  // --- Attachment + decoration bridging ---
  /**
   * Called when the user accepts an item from the Monaco completion
   * widget (via the registered command). Adds the resource to the
   * context attachments and tracks the inserted text so it can be
   * highlighted in the editor.
   */
  acceptCompletion(entry, insertText, range) {
    this._insertedReferences.set(entry.id, { text: insertText, range });
    this._contextAttachments.setAttachments([...this._contextAttachments.attachments.filter((e) => e.id !== entry.id), entry]);
    this._updateDecorations();
  }
  /**
   * Accept handler for config-action completions (permission/mode toggles).
   * Applies the session-config change (gated by the elevated-permission
   * confirmation for `autoApprove`) via this input's scoped session's
   * agent-host provider. Keep-text items (non-empty insertText) then add their
   * argument-hint reference; toggle items insert nothing, so there is no text
   * to remove.
   */
  async applyConfigAction(accessor, arg) {
    const session = this._sessionContext.session.get();
    if (!session) {
      return;
    }
    const dialogService = accessor.get(IDialogService);
    const storageService = accessor.get(IStorageService);
    const sessionsProvidersService = accessor.get(ISessionsProvidersService);
    const applied = await applyAgentHostCompletionAction(arg.action, dialogService, storageService, async (config) => {
      const provider = sessionsProvidersService.getProvider(session.providerId);
      if (provider && isAgentHostProvider(provider)) {
        await Promise.all(Object.entries(config).map(([key, value]) => provider.setSessionConfigValue(session.sessionId, key, value).catch(() => {
        })));
      }
    });
    if (applied && arg.entry) {
      this.acceptCompletion(arg.entry, arg.referenceText, arg.referenceRange);
    }
  }
  getAttachmentsForSend(messageText, messageOffset = 0) {
    const model = this._editor.getModel();
    const value = model?.getValue() ?? "";
    const messageLength = messageText?.length ?? value.length;
    const result = [];
    for (const entry of this._contextAttachments.attachments) {
      const reference = this._insertedReferences.get(entry.id) ?? (isAgentHostCompletionVariableEntry(entry) ? { text: entry.name, range: void 0 } : void 0);
      if (!reference) {
        result.push(entry);
        continue;
      }
      const range = getAgentHostCompletionAttachmentRange(value, reference.text, reference.range, messageOffset, messageLength);
      if (!range) {
        if (!isAgentHostCompletionVariableEntry(entry)) {
          result.push(entry);
        }
        continue;
      }
      result.push({ ...entry, range });
    }
    return result;
  }
  _registerDecorations() {
    this._register(this._editor.onDidChangeModelContent(() => this._updateDecorations()));
    this._register(this._contextAttachments.onDidChangeContext(() => this._updateDecorations()));
    this._updateDecorations();
  }
  _updateDecorations() {
    const attachedIds = new Set(this._contextAttachments.attachments.map((a) => a.id));
    for (const id of [...this._insertedReferences.keys()]) {
      if (!attachedIds.has(id)) {
        this._insertedReferences.delete(id);
      }
    }
    const model = this._editor.getModel();
    if (!model) {
      return;
    }
    const value = model.getValue();
    const decos = [];
    for (const reference of this._insertedReferences.values()) {
      const range = getAgentHostCompletionAttachmentRange(value, reference.text, reference.range, 0, value.length);
      if (!range) {
        continue;
      }
      const startPos = model.getPositionAt(range.start);
      const endPos = model.getPositionAt(range.endExclusive);
      decos.push({
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column
        },
        options: { description: "sessions-agent-host-reference", inlineClassName: AgentHostInputCompletionHandler._className }
      });
    }
    this._decorations.set(decos);
    this._editor.setDecorationsByType(
      AgentHostInputCompletionHandler._argumentHintDecorationDescription,
      AgentHostInputCompletionHandler._argumentHintDecorationType,
      this._getArgumentHintDecorations(model, value)
    );
  }
  /**
   * Computes the inline placeholder (ghost text) shown after an accepted
   * agent-host slash command whose `_meta` carries an argument hint. Shown
   * only while the command is the sole content followed by a single trailing
   * space (i.e. before any argument has been typed).
   */
  _getArgumentHintDecorations(model, value) {
    const placeholder = getCommandArgumentHintPlaceholder(value, this._contextAttachments.attachments, this._insertedReferences);
    if (!placeholder) {
      return [];
    }
    const endPos = model.getPositionAt(placeholder.endOffset);
    return [{
      range: getRangeForPlaceholder({ startLineNumber: endPos.lineNumber, endLineNumber: endPos.lineNumber, startColumn: endPos.column, endColumn: endPos.column }),
      renderOptions: { after: { contentText: placeholder.argumentHint, color: getInputPlaceholderColor(this._themeService) } }
    }];
  }
  _toOffsetRange(range, insertText) {
    const model = this._editor.getModel();
    if (!model) {
      return void 0;
    }
    const start = model.getOffsetAt(range.getStartPosition());
    return new OffsetRange(start, start + insertText.length);
  }
};
AgentHostInputCompletionHandler._className = "sessions-agent-host-reference";
AgentHostInputCompletionHandler._argumentHintDecorationDescription = "sessions-chat";
AgentHostInputCompletionHandler._argumentHintDecorationType = "sessions-command-argument-hint";
AgentHostInputCompletionHandler = __decorateClass([
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, ISessionContext),
  __decorateParam(4, IChatSessionsService),
  __decorateParam(5, ICodeEditorService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IConfigurationService)
], AgentHostInputCompletionHandler);
export {
  AgentHostInputCompletionHandler,
  getAgentHostCompletionAttachmentRange,
  getCommandArgumentHintPlaceholder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50SG9zdElucHV0Q29tcGxldGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uT3B0aW9ucywgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtLCBDb21wbGV0aW9uSXRlbUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q29tbWFuZEFyZ3VtZW50SGludCwgZ2V0Q29tcGxldGlvbkFjdGlvbiwgdHlwZSBJQWdlbnRIb3N0Q29tcGxldGlvbkFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vbWV0YS9hZ2VudENvbXBsZXRpb25BdHRhY2htZW50TWV0YS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZCwgZ2V0QWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQsIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnksIHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbSwgSUNoYXRTZXNzaW9uc1NlcnZpY2UsIGlzQWdlbnRIb3N0VGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdElucHV0Q29tcGxldGlvbnNCYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9lZGl0b3IvYWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uc0Jhc2UuanMnO1xuaW1wb3J0IHsgZ2V0SW5wdXRQbGFjZWhvbGRlckNvbG9yLCBnZXRSYW5nZUZvclBsYWNlaG9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9lZGl0b3IvY2hhdElucHV0UGxhY2Vob2xkZXJEZWNvcmF0aW9uLmpzJztcbmltcG9ydCB7IGFwcGx5QWdlbnRIb3N0Q29tcGxldGlvbkFjdGlvbiwgaXNQb2xpY3lCbG9ja2VkQ29tcGxldGlvbkFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudEhvc3RDb21wbGV0aW9uQWN0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGlzQWdlbnRIb3N0UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBOZXdDaGF0Q29udGV4dEF0dGFjaG1lbnRzIH0gZnJvbSAnLi9uZXdDaGF0Q29udGV4dEF0dGFjaG1lbnRzLmpzJztcblxuLyoqXG4gKiBDb21tYW5kIElEIHVzZWQgYnkgY29tcGxldGlvbiBpdGVtcyB0byBhdHRhY2ggYW4gYWdlbnQtaG9zdC1zdXBwbGllZFxuICogcmVzb3VyY2UgcmVmZXJlbmNlIChyZXR1cm5lZCBieSBgSUNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyLnByb3ZpZGVDaGF0SW5wdXRDb21wbGV0aW9uc2ApXG4gKiB0byB0aGUgc2Vzc2lvbnMgY29udGV4dCBhdHRhY2htZW50cy5cbiAqL1xuY29uc3QgQUREX1JFRkVSRU5DRV9DT01NQU5EID0gJ3Nlc3Npb25zLmNoYXQuYWRkQWdlbnRIb3N0UmVmZXJlbmNlJztcblxuaW50ZXJmYWNlIElSZWZlcmVuY2VBcmcge1xuXHRyZWFkb25seSBoYW5kbGVyOiBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25IYW5kbGVyO1xuXHRyZWFkb25seSBlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeTtcblx0cmVhZG9ubHkgaW5zZXJ0VGV4dDogc3RyaW5nO1xuXHRyZWFkb25seSByYW5nZTogT2Zmc2V0UmFuZ2UgfCB1bmRlZmluZWQ7XG59XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKEFERF9SRUZFUkVOQ0VfQ09NTUFORCwgKF9hY2Nlc3NvciwgYXJnOiBJUmVmZXJlbmNlQXJnKSA9PiB7XG5cdGFyZy5oYW5kbGVyLmFjY2VwdENvbXBsZXRpb24oYXJnLmVudHJ5LCBhcmcuaW5zZXJ0VGV4dCwgYXJnLnJhbmdlKTtcbn0pO1xuXG4vKipcbiAqIENvbW1hbmQgSUQgdXNlZCBieSBjb25maWctYWN0aW9uIGNvbXBsZXRpb24gaXRlbXMgKHBlcm1pc3Npb24vbW9kZSB0b2dnbGVzKVxuICogdG8gYXBwbHkgdGhlIHNlc3Npb24tY29uZmlnIGNoYW5nZSBvbiBhY2NlcHQuXG4gKi9cbmNvbnN0IENPTkZJR19BQ1RJT05fQ09NTUFORCA9ICdzZXNzaW9ucy5jaGF0LmFwcGx5QWdlbnRIb3N0Q29uZmlnQWN0aW9uJztcblxuaW50ZXJmYWNlIElDb25maWdBY3Rpb25Bcmcge1xuXHRyZWFkb25seSBoYW5kbGVyOiBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25IYW5kbGVyO1xuXHRyZWFkb25seSBhY3Rpb246IElBZ2VudEhvc3RDb21wbGV0aW9uQWN0aW9uO1xuXHQvKiogUmVmZXJlbmNlIHRvIGFkZCAoZm9yIHRoZSBhcmd1bWVudCBoaW50KSBmb3Iga2VlcC10ZXh0IGl0ZW1zOyB1bmRlZmluZWQgZm9yIHRvZ2dsZXMuICovXG5cdHJlYWRvbmx5IGVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkO1xuXHQvKiogVGV4dCBvZiB0aGUga2VwdCBjb21tYW5kIHJlZmVyZW5jZSAod2l0aG91dCB0aGUgdHJhaWxpbmcgc3BhY2UpLiAqL1xuXHRyZWFkb25seSByZWZlcmVuY2VUZXh0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlZmVyZW5jZVJhbmdlOiBPZmZzZXRSYW5nZSB8IHVuZGVmaW5lZDtcbn1cblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoQ09ORklHX0FDVElPTl9DT01NQU5ELCBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZzogSUNvbmZpZ0FjdGlvbkFyZykgPT4ge1xuXHRhd2FpdCBhcmcuaGFuZGxlci5hcHBseUNvbmZpZ0FjdGlvbihhY2Nlc3NvciwgYXJnKTtcbn0pO1xuXG4vKipcbiAqIEZpbmRzIHRoZSBjb21wbGV0aW9uIHJlZmVyZW5jZSBjbG9zZXN0IHRvIHRoZSBhY2NlcHRlZCByYW5nZSBhbmQgcmV0dXJuc1xuICogaXRzIHJhbmdlIGluIHRoZSBtZXNzYWdlIHRleHQgdGhhdCB3aWxsIGJlIHNlbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRBZ2VudEhvc3RDb21wbGV0aW9uQXR0YWNobWVudFJhbmdlKFxuXHR2YWx1ZTogc3RyaW5nLFxuXHRyZWZlcmVuY2VUZXh0OiBzdHJpbmcsXG5cdHByZWZlcnJlZFJhbmdlOiBPZmZzZXRSYW5nZSB8IHVuZGVmaW5lZCxcblx0bWVzc2FnZU9mZnNldDogbnVtYmVyLFxuXHRtZXNzYWdlTGVuZ3RoOiBudW1iZXJcbik6IE9mZnNldFJhbmdlIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFyZWZlcmVuY2VUZXh0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGxldCBiZXN0SW5kZXggPSAtMTtcblx0bGV0IGJlc3REaXN0YW5jZSA9IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXHRsZXQgZnJvbSA9IDA7XG5cdHdoaWxlICh0cnVlKSB7XG5cdFx0Y29uc3QgaW5kZXggPSB2YWx1ZS5pbmRleE9mKHJlZmVyZW5jZVRleHQsIGZyb20pO1xuXHRcdGlmIChpbmRleCA8IDApIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRjb25zdCBkaXN0YW5jZSA9IHByZWZlcnJlZFJhbmdlID8gTWF0aC5hYnMoaW5kZXggLSBwcmVmZXJyZWRSYW5nZS5zdGFydCkgOiBpbmRleDtcblx0XHRpZiAoZGlzdGFuY2UgPCBiZXN0RGlzdGFuY2UpIHtcblx0XHRcdGJlc3RJbmRleCA9IGluZGV4O1xuXHRcdFx0YmVzdERpc3RhbmNlID0gZGlzdGFuY2U7XG5cdFx0fVxuXHRcdGZyb20gPSBpbmRleCArIHJlZmVyZW5jZVRleHQubGVuZ3RoO1xuXHR9XG5cblx0aWYgKGJlc3RJbmRleCA8IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3Qgc3RhcnQgPSBiZXN0SW5kZXggLSBtZXNzYWdlT2Zmc2V0O1xuXHRjb25zdCBlbmRFeGNsdXNpdmUgPSBzdGFydCArIHJlZmVyZW5jZVRleHQubGVuZ3RoO1xuXHRpZiAoc3RhcnQgPCAwIHx8IGVuZEV4Y2x1c2l2ZSA+IG1lc3NhZ2VMZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBuZXcgT2Zmc2V0UmFuZ2Uoc3RhcnQsIGVuZEV4Y2x1c2l2ZSk7XG59XG5cbi8qKlxuICogRGV0ZXJtaW5lcyB3aGV0aGVyIGFuIGlubGluZSBhcmd1bWVudC1oaW50IHBsYWNlaG9sZGVyIHNob3VsZCBiZSBzaG93biBmb3IgYW5cbiAqIGFjY2VwdGVkIGFnZW50LWhvc3Qgc2xhc2ggY29tbWFuZC4gUmV0dXJucyB0aGUgaGludCB0ZXh0IGFuZCB0aGUgb2Zmc2V0IGp1c3RcbiAqIGFmdGVyIHRoZSBjb21tYW5kIHRva2VuIHdoZW4gdGhlIGNvbW1hbmQgaXMgdGhlIHNvbGUgY29udGVudCBvZiBgdmFsdWVgXG4gKiBmb2xsb3dlZCBieSBleGFjdGx5IG9uZSB0cmFpbGluZyBzcGFjZSAoaS5lLiBubyBhcmd1bWVudCBoYXMgYmVlbiB0eXBlZCB5ZXQpLFxuICogb3IgYHVuZGVmaW5lZGAgb3RoZXJ3aXNlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29tbWFuZEFyZ3VtZW50SGludFBsYWNlaG9sZGVyKFxuXHR2YWx1ZTogc3RyaW5nLFxuXHRhdHRhY2htZW50czogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdLFxuXHRpbnNlcnRlZFJlZmVyZW5jZXM6IFJlYWRvbmx5TWFwPHN0cmluZywgeyB0ZXh0OiBzdHJpbmc7IHJhbmdlOiBPZmZzZXRSYW5nZSB8IHVuZGVmaW5lZCB9Pixcbik6IHsgYXJndW1lbnRIaW50OiBzdHJpbmc7IGVuZE9mZnNldDogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRmb3IgKGNvbnN0IGVudHJ5IG9mIGF0dGFjaG1lbnRzKSB7XG5cdFx0aWYgKGdldEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kKGVudHJ5KSAhPT0gQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuQ29tbWFuZCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGFyZ3VtZW50SGludCA9IGdldENvbW1hbmRBcmd1bWVudEhpbnQoZW50cnkuX21ldGEpO1xuXHRcdGlmICghYXJndW1lbnRIaW50KSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgcmVmZXJlbmNlID0gaW5zZXJ0ZWRSZWZlcmVuY2VzLmdldChlbnRyeS5pZCk7XG5cdFx0aWYgKCFyZWZlcmVuY2UpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCByYW5nZSA9IGdldEFnZW50SG9zdENvbXBsZXRpb25BdHRhY2htZW50UmFuZ2UodmFsdWUsIHJlZmVyZW5jZS50ZXh0LCByZWZlcmVuY2UucmFuZ2UsIDAsIHZhbHVlLmxlbmd0aCk7XG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIE9ubHkgc2hvdyB0aGUgaGludCB3aGlsZSB0aGUgY29tbWFuZCBpcyB0aGUgc29sZSBjb250ZW50IGZvbGxvd2VkIGJ5IGV4YWN0bHkgb25lIHRyYWlsaW5nIHNwYWNlLlxuXHRcdGlmICh2YWx1ZS5zbGljZSgwLCByYW5nZS5zdGFydCkudHJpbSgpLmxlbmd0aCA+IDAgfHwgdmFsdWUuc2xpY2UocmFuZ2UuZW5kRXhjbHVzaXZlKSAhPT0gJyAnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyBhcmd1bWVudEhpbnQsIGVuZE9mZnNldDogcmFuZ2UuZW5kRXhjbHVzaXZlIH07XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBCcmlkZ2VzIHRoZSBuZXctY2hhdCBpbnB1dCBlZGl0b3IgdG8gdGhlIGFnZW50IGhvc3QncyBgY29tcGxldGlvbnNgXG4gKiBjb21tYW5kIGZvciB0aGUgY3VycmVudGx5LXNlbGVjdGVkIHNlc3Npb24gdHlwZS4gTWlycm9yc1xuICoge0BsaW5rIEFnZW50SG9zdElucHV0Q29tcGxldGlvbnN9ICh3aGljaCBoYW5kbGVzIHRoZSAqZXhpc3RpbmcqIGNoYXRcbiAqIHdpZGdldCkgYnV0IGZlZWRzIHJlc3VsdHMgaW50byB7QGxpbmsgTmV3Q2hhdENvbnRleHRBdHRhY2htZW50c31cbiAqIGluc3RlYWQgb2YgdGhlIGNoYXQgd2lkZ2V0J3MgYENoYXREeW5hbWljVmFyaWFibGVNb2RlbGAuXG4gKlxuICogVGhlIE1vbmFjbyBjb21wbGV0aW9uIHByb3ZpZGVyIGlzIHJlZ2lzdGVyZWQgZHluYW1pY2FsbHkgcGVyIGFjdGl2ZVxuICogc2Vzc2lvbiB0eXBlIHNvIHRyaWdnZXIgY2hhcmFjdGVycyByZWZsZWN0IHdoYXQgdGhlIGhvc3QgYW5ub3VuY2VzIGluXG4gKiBpdHMgYEluaXRpYWxpemVSZXN1bHQuY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzYC4gV2hlbiB0aGUgdXNlclxuICogcGlja3MgYSBkaWZmZXJlbnQgc2Vzc2lvbiB0eXBlLCB0aGUgcmVnaXN0cmF0aW9uIGlzIHRvcm4gZG93biBhbmRcbiAqIHJlLWJ1aWx0IHdpdGggdGhlIG5ldyBob3N0J3MgdHJpZ2dlciBjaGFycy5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdElucHV0Q29tcGxldGlvbkhhbmRsZXIgZXh0ZW5kcyBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zQmFzZTx2b2lkLCBzdHJpbmc+IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfY2xhc3NOYW1lID0gJ3Nlc3Npb25zLWFnZW50LWhvc3QtcmVmZXJlbmNlJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2FyZ3VtZW50SGludERlY29yYXRpb25EZXNjcmlwdGlvbiA9ICdzZXNzaW9ucy1jaGF0Jztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2FyZ3VtZW50SGludERlY29yYXRpb25UeXBlID0gJ3Nlc3Npb25zLWNvbW1hbmQtYXJndW1lbnQtaGludCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXG5cdC8qKlxuXHQgKiBJbnNlcnRlZCByZWZlcmVuY2UgcGVyIGFjY2VwdGVkIGF0dGFjaG1lbnQgaWQuIFVzZWQgdG8gZmluZCBhbmQgZGVjb3JhdGVcblx0ICogdGhlIGFjY2VwdGVkIG9jY3VycmVuY2UgaW4gdGhlIGVkaXRvciBhbmQgZHJvcHBlZCB3aGVuIHRoZSB1c2VyIHJlbW92ZXNcblx0ICogdGhlIGF0dGFjaG1lbnQgY2hpcC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luc2VydGVkUmVmZXJlbmNlcyA9IG5ldyBNYXA8c3RyaW5nIC8qIGlkICovLCB7IHRleHQ6IHN0cmluZzsgcmFuZ2U6IE9mZnNldFJhbmdlIHwgdW5kZWZpbmVkIH0+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRBdHRhY2htZW50czogTmV3Q2hhdENvbnRleHRBdHRhY2htZW50cyxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uQ29udGV4dCBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uQ29udGV4dDogSVNlc3Npb25Db250ZXh0LFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29kZUVkaXRvclNlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uVHlwZShBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25IYW5kbGVyLl9hcmd1bWVudEhpbnREZWNvcmF0aW9uRGVzY3JpcHRpb24sIEFnZW50SG9zdElucHV0Q29tcGxldGlvbkhhbmRsZXIuX2FyZ3VtZW50SGludERlY29yYXRpb25UeXBlLCB7fSkpO1xuXG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMgPSB0aGlzLl9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJEZWNvcmF0aW9ucygpO1xuXG5cdFx0Ly8gV2F0Y2ggdGhpcyBpbnB1dCdzIHNjb3BlZCBzZXNzaW9uIGFuZCAocmUtKXJlZ2lzdGVyIHRoZSBNb25hY29cblx0XHQvLyBwcm92aWRlciB3aXRoIHRoZSB0cmlnZ2VyIGNoYXJhY3RlcnMgYW5ub3VuY2VkIGJ5IHdoaWNoZXZlciBjb250ZW50XG5cdFx0Ly8gcHJvdmlkZXIgaGFuZGxlcyB0aGF0IHNlc3Npb24ncyByZXNvdXJjZSBzY2hlbWUuIFVzaW5nIHRoZVxuXHRcdC8vIGlucHV0LXNjb3BlZCBgSVNlc3Npb25Db250ZXh0YCAocmF0aGVyIHRoYW4gdGhlIHdpbmRvdy1nbG9iYWwgYWN0aXZlXG5cdFx0Ly8gc2Vzc2lvbikgZW5zdXJlcyBjb21wbGV0aW9ucyBcdTIwMTQgYW5kIHRoZSBjb25maWcgY2hhbmdlcyB0aGV5IGFwcGx5IG9uXG5cdFx0Ly8gYWNjZXB0IFx1MjAxNCB0YXJnZXQgdGhlIHNlc3Npb24gdGhpcyBpbnB1dCBjb21wb3NlcyBmb3IsIGV2ZW4gd2hlbiBhbm90aGVyXG5cdFx0Ly8gc2FtZS10eXBlIHNlc3Npb24gaXMgdGhlIHdpbmRvdydzIGFjdGl2ZSBvbmUuXG5cdFx0Ly9cblx0XHQvLyBXZSBrZXkgb2ZmIHRoZSByZXNvdXJjZSBzY2hlbWUgKHZpYSBgZ2V0Q2hhdFNlc3Npb25UeXBlYCkgcmF0aGVyXG5cdFx0Ly8gdGhhbiBgSVNlc3Npb24uc2Vzc2lvblR5cGVgIGJlY2F1c2UgdGhlIGxhdHRlciBpcyB0aGUgKmFnZW50XG5cdFx0Ly8gcHJvdmlkZXIqIG5hbWUgKGUuZy4gYGNvcGlsb3RjbGlgKSwgd2hpbGUgY29udGVudCBwcm92aWRlcnMgYXJlXG5cdFx0Ly8gcmVnaXN0ZXJlZCBmb3IgdGhlIHJlc291cmNlIHNjaGVtZSAoZS5nLiBgYWdlbnQtaG9zdC1jb3BpbG90YCBvclxuXHRcdC8vIGByZW1vdGUtPGhvc3Q+LWNvcGlsb3RgKS4gT25seSB0aGUgc2NoZW1lIG1hdGNoZXMgdGhlIGtleXNcblx0XHQvLyBgSUNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdElucHV0Q29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzYFxuXHRcdC8vIGxvb2tzIHVwLlxuXHRcdGxldCBjdXJyZW50U2NoZW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25Db250ZXh0LnNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2NoZW1lID0gc2Vzc2lvbiA/IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uLnJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChzY2hlbWUgPT09IGN1cnJlbnRTY2hlbWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudFNjaGVtZSA9IHNjaGVtZTtcblx0XHRcdHRoaXMuX3JlZ2lzdHJhdGlvbi5jbGVhcigpO1xuXHRcdFx0aWYgKHNjaGVtZSAmJiBpc0FnZW50SG9zdFRhcmdldChzY2hlbWUpKSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5fcmVnaXN0ZXJGb3JTY2hlbWUoc2NoZW1lKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWdpc3RlckZvclNjaGVtZShzY2hlbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRyaWdnZXJDaGFyYWN0ZXJzID0gYXdhaXQgdGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0SW5wdXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMoc2NoZW1lKTtcblx0XHRpZiAoIXRyaWdnZXJDaGFyYWN0ZXJzIHx8IHRyaWdnZXJDaGFyYWN0ZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBzY29wZWQgc2Vzc2lvbiBtYXkgaGF2ZSBjaGFuZ2VkIG1pZC1hd2FpdCBcdTIwMTQgYmFpbCBpZiBpdHNcblx0XHQvLyByZXNvdXJjZSBzY2hlbWUgaXMgbm8gbG9uZ2VyIHRoZSBvbmUgd2UgcmVnaXN0ZXJlZCBmb3IuXG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25Db250ZXh0LnNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFhY3RpdmVTZXNzaW9uIHx8IGdldENoYXRTZXNzaW9uVHlwZShhY3RpdmVTZXNzaW9uLnJlc291cmNlKSAhPT0gc2NoZW1lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yVXJpID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk/LnVyaTtcblx0XHRpZiAoIWVkaXRvclVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbi52YWx1ZSA9IHRoaXMuX3JlZ2lzdGVyUHJvdmlkZXIoXG5cdFx0XHR7IHNjaGVtZTogZWRpdG9yVXJpLnNjaGVtZSwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSxcblx0XHRcdGBzZXNzaW9uc0FnZW50SG9zdElucHV0Q29tcGxldGlvbnNbJHtzY2hlbWV9XWAsXG5cdFx0XHR0cmlnZ2VyQ2hhcmFjdGVycyxcblx0XHRcdHNjaGVtZSxcblx0XHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9yZXNvbHZlQ29udGV4dChtb2RlbDogSVRleHRNb2RlbCwgc2NoZW1lOiBzdHJpbmcpOiB7IHNlc3Npb25SZXNvdXJjZTogVVJJOyBjb250ZXh0OiB2b2lkIH0gfCB1bmRlZmluZWQge1xuXHRcdC8vIEZvciBhIGAvdHJvdWJsZXNob290YCByZXF1ZXN0LCBgI2AgcmVmZXJlbmNlcyB0YXJnZXQgc2Vzc2lvbnMgKHNlcnZlZFxuXHRcdC8vIGJ5IHRoZSBgI3Nlc3Npb25gIHByb3ZpZGVyKTsgc3VwcHJlc3MgaG9zdC1zdXBwbGllZCBjb21wbGV0aW9ucyAoZS5nLlxuXHRcdC8vIHRoZSBob3N0J3MgYCNmaWxlYCBsaXN0KSBzbyBvbmx5IHNlc3Npb25zIGFyZSBvZmZlcmVkLlxuXHRcdGlmICgvXlxccypcXC90cm91Ymxlc2hvb3RcXGIvLnRlc3QobW9kZWwuZ2V0VmFsdWUoKSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uQ29udGV4dC5zZXNzaW9uLmdldCgpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbi5yZXNvdXJjZTtcblx0XHQvLyBPbmx5IHJlc3BvbmQgd2hlbiB0aGlzIGlucHV0J3Mgc2NvcGVkIHNlc3Npb24gbWF0Y2hlcyB0aGVcblx0XHQvLyBzY2hlbWUgdGhpcyByZWdpc3RyYXRpb24gd2FzIG1hZGUgZm9yLiBTdGFsZSByZWdpc3RyYXRpb25zXG5cdFx0Ly8gKHRoZSBzY29wZWQgc2Vzc2lvbiBjaGFuZ2VkIGR1cmluZyB0aGUgaG9zdCBSUEMsIGV0Yy4pIGFyZVxuXHRcdC8vIHNpbGVudGx5IGlnbm9yZWQuXG5cdFx0aWYgKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpICE9PSBzY2hlbWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IHNlc3Npb25SZXNvdXJjZSwgY29udGV4dDogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2J1aWxkSXRlbShwb3NpdGlvbjogUG9zaXRpb24sIGl0ZW06IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbSk6IENvbXBsZXRpb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXBsYWNlUmFuZ2UgPSBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25IYW5kbGVyLmNvbXB1dGVSYW5nZShwb3NpdGlvbiwgaXRlbSk7XG5cdFx0Y29uc3QgYXR0YWNobWVudCA9IGl0ZW0uYXR0YWNobWVudDtcblx0XHRzd2l0Y2ggKGF0dGFjaG1lbnQua2luZCkge1xuXHRcdFx0Y2FzZSAnY29tbWFuZCc6IHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0Q29tcGxldGlvbkFjdGlvbihhdHRhY2htZW50Ll9tZXRhKTtcblx0XHRcdFx0aWYgKGFjdGlvbikge1xuXHRcdFx0XHRcdC8vIE9taXQgYW4gZWxldmF0ZWQgYXV0by1hcHByb3ZlIHRvZ2dsZSAoQWxsb3cgYWxsIC8gQXNzaXN0ZWQpXG5cdFx0XHRcdFx0Ly8gd2hlbiBlbnRlcnByaXNlIHBvbGljeSBkaXNhYmxlcyBnbG9iYWwgYXV0by1hcHByb3ZhbCwgcmF0aGVyXG5cdFx0XHRcdFx0Ly8gdGhhbiBvZmZlcmluZyBhbiBpdGVtIHRoYXQgd291bGQgd2FybiB0aGVuIGNsYW1wIHRvIERlZmF1bHQuXG5cdFx0XHRcdFx0aWYgKGlzUG9saWN5QmxvY2tlZENvbXBsZXRpb25BY3Rpb24oYWN0aW9uLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIENvbmZpZy1hY3Rpb24gY29tcGxldGlvbiAocGVybWlzc2lvbi9tb2RlIHRvZ2dsZSkuIEtlZXAtdGV4dFxuXHRcdFx0XHRcdC8vIGl0ZW1zIChub24tZW1wdHkgaW5zZXJ0VGV4dCkgcmV0YWluIHRoZSBgL2NvbW1hbmQgYCB0ZXh0IGFuZFxuXHRcdFx0XHRcdC8vIGl0cyBhcmd1bWVudC1oaW50IHJlZmVyZW5jZTsgdG9nZ2xlIGl0ZW1zIGluc2VydCBub3RoaW5nLlxuXHRcdFx0XHRcdGNvbnN0IGtlZXAgPSBpdGVtLmluc2VydFRleHQgIT09ICcnO1xuXHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gaXRlbS5sYWJlbCA/PyBpdGVtLmluc2VydFRleHQ7XG5cdFx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlVGV4dCA9IGl0ZW0uaW5zZXJ0VGV4dC50cmltRW5kKCk7XG5cdFx0XHRcdFx0Y29uc3QgZW50cnkgPSBrZWVwXG5cdFx0XHRcdFx0XHQ/IHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuQ29tbWFuZCwgcmVmZXJlbmNlVGV4dCwgYXR0YWNobWVudC5jb21tYW5kLCBhdHRhY2htZW50Ll9tZXRhKVxuXHRcdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsLCBkZXNjcmlwdGlvbjogYXR0YWNobWVudC5kZXNjcmlwdGlvbiB9LFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogaXRlbS5pbnNlcnRUZXh0LFxuXHRcdFx0XHRcdFx0ZmlsdGVyVGV4dDogbGFiZWwsXG5cdFx0XHRcdFx0XHRyYW5nZTogcmVwbGFjZVJhbmdlLFxuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHRkb2N1bWVudGF0aW9uOiBhdHRhY2htZW50LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRpZDogQ09ORklHX0FDVElPTl9DT01NQU5ELFxuXHRcdFx0XHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3tcblx0XHRcdFx0XHRcdFx0XHRoYW5kbGVyOiB0aGlzLFxuXHRcdFx0XHRcdFx0XHRcdGFjdGlvbixcblx0XHRcdFx0XHRcdFx0XHRlbnRyeSxcblx0XHRcdFx0XHRcdFx0XHRyZWZlcmVuY2VUZXh0LFxuXHRcdFx0XHRcdFx0XHRcdHJlZmVyZW5jZVJhbmdlOiBlbnRyeSA/IHRoaXMuX3RvT2Zmc2V0UmFuZ2UocmVwbGFjZVJhbmdlLnJlcGxhY2UsIHJlZmVyZW5jZVRleHQpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJQ29uZmlnQWN0aW9uQXJnXSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZWZlcmVuY2VUZXh0ID0gaXRlbS5pbnNlcnRUZXh0LnRyaW1FbmQoKTtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSB0b0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5KEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLkNvbW1hbmQsIHJlZmVyZW5jZVRleHQsIGF0dGFjaG1lbnQuY29tbWFuZCwgYXR0YWNobWVudC5fbWV0YSk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IGl0ZW0uaW5zZXJ0VGV4dCwgZGVzY3JpcHRpb246IGF0dGFjaG1lbnQuZGVzY3JpcHRpb24gfSxcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiBpdGVtLmluc2VydFRleHQsXG5cdFx0XHRcdFx0ZmlsdGVyVGV4dDogaXRlbS5pbnNlcnRUZXh0LFxuXHRcdFx0XHRcdHJhbmdlOiByZXBsYWNlUmFuZ2UsXG5cdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogYXR0YWNobWVudC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogQUREX1JFRkVSRU5DRV9DT01NQU5ELFxuXHRcdFx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0XHRoYW5kbGVyOiB0aGlzLFxuXHRcdFx0XHRcdFx0XHRlbnRyeSxcblx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogcmVmZXJlbmNlVGV4dCxcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IHRoaXMuX3RvT2Zmc2V0UmFuZ2UocmVwbGFjZVJhbmdlLnJlcGxhY2UsIHJlZmVyZW5jZVRleHQpLFxuXHRcdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSVJlZmVyZW5jZUFyZ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3NraWxsJzoge1xuXHRcdFx0XHRjb25zdCByZWZlcmVuY2VUZXh0ID0gaXRlbS5pbnNlcnRUZXh0LnRyaW1FbmQoKTtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSB0b0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5KEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLlNraWxsLCByZWZlcmVuY2VUZXh0LCBhdHRhY2htZW50LnVyaSwgYXR0YWNobWVudC5fbWV0YSk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IGl0ZW0uaW5zZXJ0VGV4dCwgZGVzY3JpcHRpb246IGF0dGFjaG1lbnQuZGVzY3JpcHRpb24gfSxcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiBpdGVtLmluc2VydFRleHQsXG5cdFx0XHRcdFx0ZmlsdGVyVGV4dDogaXRlbS5pbnNlcnRUZXh0LFxuXHRcdFx0XHRcdHJhbmdlOiByZXBsYWNlUmFuZ2UsXG5cdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogYXR0YWNobWVudC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCxcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogQUREX1JFRkVSRU5DRV9DT01NQU5ELFxuXHRcdFx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0XHRoYW5kbGVyOiB0aGlzLFxuXHRcdFx0XHRcdFx0XHRlbnRyeSxcblx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogcmVmZXJlbmNlVGV4dCxcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IHRoaXMuX3RvT2Zmc2V0UmFuZ2UocmVwbGFjZVJhbmdlLnJlcGxhY2UsIHJlZmVyZW5jZVRleHQpLFxuXHRcdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSVJlZmVyZW5jZUFyZ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2NoYXQnOiB7XG5cdFx0XHRcdC8vIFRoZSBuZXctY2hhdCBzdXJmYWNlIGRvZXMgbm90IHN1cHBvcnQgY2hhdCByZWZlcmVuY2VzOyBpZ25vcmUuXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdGNvbnN0IGxhYmVsID0gYXR0YWNobWVudC5kaXNwbGF5TmFtZSA/PyBpdGVtLmluc2VydFRleHQ7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gYXR0YWNobWVudC51cmkucGF0aDtcblx0XHRcdFx0Y29uc3Qga2luZCA9IGF0dGFjaG1lbnQuaXNEaXJlY3RvcnkgPyBDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyIDogQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGU7XG5cdFx0XHRcdGNvbnN0IGVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5ID0ge1xuXHRcdFx0XHRcdGlkOiBhdHRhY2htZW50LnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6IGF0dGFjaG1lbnQuZGlzcGxheU5hbWUgPz8gdGhpcy5fYmFzZW5hbWUoYXR0YWNobWVudC51cmkpLFxuXHRcdFx0XHRcdHZhbHVlOiBhdHRhY2htZW50LnVyaSxcblx0XHRcdFx0XHRraW5kOiBhdHRhY2htZW50LmlzRGlyZWN0b3J5ID8gJ2RpcmVjdG9yeScgOiAnZmlsZScsXG5cdFx0XHRcdFx0X21ldGE6IGF0dGFjaG1lbnQuX21ldGEsXG5cdFx0XHRcdH07XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWwsIGRlc2NyaXB0aW9uIH0sXG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogaXRlbS5pbnNlcnRUZXh0LFxuXHRcdFx0XHRcdGZpbHRlclRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRyYW5nZTogcmVwbGFjZVJhbmdlLFxuXHRcdFx0XHRcdGtpbmQsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IEFERF9SRUZFUkVOQ0VfQ09NTUFORCxcblx0XHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3tcblx0XHRcdFx0XHRcdFx0aGFuZGxlcjogdGhpcyxcblx0XHRcdFx0XHRcdFx0ZW50cnksXG5cdFx0XHRcdFx0XHRcdGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IHRoaXMuX3RvT2Zmc2V0UmFuZ2UocmVwbGFjZVJhbmdlLnJlcGxhY2UsIGl0ZW0uaW5zZXJ0VGV4dCksXG5cdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJUmVmZXJlbmNlQXJnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Jhc2VuYW1lKHVyaTogVVJJKTogc3RyaW5nIHtcblx0XHRjb25zdCBpZHggPSB1cmkucGF0aC5sYXN0SW5kZXhPZignLycpO1xuXHRcdHJldHVybiBpZHggPj0gMCA/IHVyaS5wYXRoLnNsaWNlKGlkeCArIDEpIDogdXJpLnBhdGg7XG5cdH1cblxuXHQvLyAtLS0gQXR0YWNobWVudCArIGRlY29yYXRpb24gYnJpZGdpbmcgLS0tXG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIHRoZSB1c2VyIGFjY2VwdHMgYW4gaXRlbSBmcm9tIHRoZSBNb25hY28gY29tcGxldGlvblxuXHQgKiB3aWRnZXQgKHZpYSB0aGUgcmVnaXN0ZXJlZCBjb21tYW5kKS4gQWRkcyB0aGUgcmVzb3VyY2UgdG8gdGhlXG5cdCAqIGNvbnRleHQgYXR0YWNobWVudHMgYW5kIHRyYWNrcyB0aGUgaW5zZXJ0ZWQgdGV4dCBzbyBpdCBjYW4gYmVcblx0ICogaGlnaGxpZ2h0ZWQgaW4gdGhlIGVkaXRvci5cblx0ICovXG5cdGFjY2VwdENvbXBsZXRpb24oZW50cnk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGluc2VydFRleHQ6IHN0cmluZywgcmFuZ2U6IE9mZnNldFJhbmdlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5faW5zZXJ0ZWRSZWZlcmVuY2VzLnNldChlbnRyeS5pZCwgeyB0ZXh0OiBpbnNlcnRUZXh0LCByYW5nZSB9KTtcblx0XHR0aGlzLl9jb250ZXh0QXR0YWNobWVudHMuc2V0QXR0YWNobWVudHMoWy4uLnRoaXMuX2NvbnRleHRBdHRhY2htZW50cy5hdHRhY2htZW50cy5maWx0ZXIoZSA9PiBlLmlkICE9PSBlbnRyeS5pZCksIGVudHJ5XSk7XG5cdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBY2NlcHQgaGFuZGxlciBmb3IgY29uZmlnLWFjdGlvbiBjb21wbGV0aW9ucyAocGVybWlzc2lvbi9tb2RlIHRvZ2dsZXMpLlxuXHQgKiBBcHBsaWVzIHRoZSBzZXNzaW9uLWNvbmZpZyBjaGFuZ2UgKGdhdGVkIGJ5IHRoZSBlbGV2YXRlZC1wZXJtaXNzaW9uXG5cdCAqIGNvbmZpcm1hdGlvbiBmb3IgYGF1dG9BcHByb3ZlYCkgdmlhIHRoaXMgaW5wdXQncyBzY29wZWQgc2Vzc2lvbidzXG5cdCAqIGFnZW50LWhvc3QgcHJvdmlkZXIuIEtlZXAtdGV4dCBpdGVtcyAobm9uLWVtcHR5IGluc2VydFRleHQpIHRoZW4gYWRkIHRoZWlyXG5cdCAqIGFyZ3VtZW50LWhpbnQgcmVmZXJlbmNlOyB0b2dnbGUgaXRlbXMgaW5zZXJ0IG5vdGhpbmcsIHNvIHRoZXJlIGlzIG5vIHRleHRcblx0ICogdG8gcmVtb3ZlLlxuXHQgKi9cblx0YXN5bmMgYXBwbHlDb25maWdBY3Rpb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZzogSUNvbmZpZ0FjdGlvbkFyZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uQ29udGV4dC5zZXNzaW9uLmdldCgpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zUHJvdmlkZXJzU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKTtcblx0XHRjb25zdCBhcHBsaWVkID0gYXdhaXQgYXBwbHlBZ2VudEhvc3RDb21wbGV0aW9uQWN0aW9uKGFyZy5hY3Rpb24sIGRpYWxvZ1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBhc3luYyBjb25maWcgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXIoc2Vzc2lvbi5wcm92aWRlcklkKTtcblx0XHRcdGlmIChwcm92aWRlciAmJiBpc0FnZW50SG9zdFByb3ZpZGVyKHByb3ZpZGVyKSkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChPYmplY3QuZW50cmllcyhjb25maWcpLm1hcCgoW2tleSwgdmFsdWVdKSA9PiBwcm92aWRlci5zZXRTZXNzaW9uQ29uZmlnVmFsdWUoc2Vzc2lvbi5zZXNzaW9uSWQsIGtleSwgdmFsdWUpLmNhdGNoKCgpID0+IHsgLyogYmVzdC1lZmZvcnQgKi8gfSkpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHQvLyBLZWVwLXRleHQgaXRlbXMgYWRkIHRoZWlyIGFyZ3VtZW50LWhpbnQgcmVmZXJlbmNlIG9uY2UgYXBwbGllZC4gVG9nZ2xlXG5cdFx0Ly8gaXRlbXMgaW5zZXJ0IG5vdGhpbmcsIHNvIHRoZXJlIGlzIG5vIHRleHQgdG8gcmVtb3ZlLlxuXHRcdGlmIChhcHBsaWVkICYmIGFyZy5lbnRyeSkge1xuXHRcdFx0dGhpcy5hY2NlcHRDb21wbGV0aW9uKGFyZy5lbnRyeSwgYXJnLnJlZmVyZW5jZVRleHQsIGFyZy5yZWZlcmVuY2VSYW5nZSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0QXR0YWNobWVudHNGb3JTZW5kKG1lc3NhZ2VUZXh0Pzogc3RyaW5nLCBtZXNzYWdlT2Zmc2V0ID0gMCk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCB2YWx1ZSA9IG1vZGVsPy5nZXRWYWx1ZSgpID8/ICcnO1xuXHRcdGNvbnN0IG1lc3NhZ2VMZW5ndGggPSBtZXNzYWdlVGV4dD8ubGVuZ3RoID8/IHZhbHVlLmxlbmd0aDtcblx0XHRjb25zdCByZXN1bHQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLmF0dGFjaG1lbnRzKSB7XG5cdFx0XHRjb25zdCByZWZlcmVuY2UgPSB0aGlzLl9pbnNlcnRlZFJlZmVyZW5jZXMuZ2V0KGVudHJ5LmlkKVxuXHRcdFx0XHQ/PyAoaXNBZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVFbnRyeShlbnRyeSkgPyB7IHRleHQ6IGVudHJ5Lm5hbWUsIHJhbmdlOiB1bmRlZmluZWQgfSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRpZiAoIXJlZmVyZW5jZSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChlbnRyeSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmFuZ2UgPSBnZXRBZ2VudEhvc3RDb21wbGV0aW9uQXR0YWNobWVudFJhbmdlKHZhbHVlLCByZWZlcmVuY2UudGV4dCwgcmVmZXJlbmNlLnJhbmdlLCBtZXNzYWdlT2Zmc2V0LCBtZXNzYWdlTGVuZ3RoKTtcblx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0aWYgKCFpc0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5KGVudHJ5KSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGVudHJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKHsgLi4uZW50cnksIHJhbmdlIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJEZWNvcmF0aW9ucygpOiB2b2lkIHtcblx0XHQvLyBSZS1kZWNvcmF0ZSB3aGVuIHRoZSBlZGl0b3IgY29udGVudCBjaGFuZ2VzICh0aGUgdXNlciB0eXBlZCxcblx0XHQvLyBwYXN0ZWQsIG9yIHRoZSBpbnNlcnRlZCB0ZXh0IG1vdmVkKSBhbmQgd2hlbiBhdHRhY2htZW50cyBjaGFuZ2Vcblx0XHQvLyAoYSBjaGlwIHdhcyByZW1vdmVkLCBkcmFmdCBzdGF0ZSByZXN0b3JlZCwgZXRjLikuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHRoaXMuX3VwZGF0ZURlY29yYXRpb25zKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb250ZXh0QXR0YWNobWVudHMub25EaWRDaGFuZ2VDb250ZXh0KCgpID0+IHRoaXMuX3VwZGF0ZURlY29yYXRpb25zKCkpKTtcblx0XHR0aGlzLl91cGRhdGVEZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRGVjb3JhdGlvbnMoKTogdm9pZCB7XG5cdFx0Ly8gRHJvcCB0cmFja2luZyBmb3IgYW55IFVSSSB0aGF0IGlzIG5vIGxvbmdlciBhdHRhY2hlZC4gVGhlIGNoaXBcblx0XHQvLyBiZWluZyByZW1vdmVkIGlzIHRoZSBjYW5vbmljYWwgc2lnbmFsIHRoYXQgdGhlIHJlZmVyZW5jZSBpc1xuXHRcdC8vIGdvbmUsIGV2ZW4gaWYgaXRzIGluc2VydGVkIHRleHQgc3RpbGwgaGFwcGVucyB0byBhcHBlYXIgaW4gdGhlXG5cdFx0Ly8gZWRpdG9yLlxuXHRcdGNvbnN0IGF0dGFjaGVkSWRzID0gbmV3IFNldCh0aGlzLl9jb250ZXh0QXR0YWNobWVudHMuYXR0YWNobWVudHMubWFwKGEgPT4gYS5pZCkpO1xuXHRcdGZvciAoY29uc3QgaWQgb2YgWy4uLnRoaXMuX2luc2VydGVkUmVmZXJlbmNlcy5rZXlzKCldKSB7XG5cdFx0XHRpZiAoIWF0dGFjaGVkSWRzLmhhcyhpZCkpIHtcblx0XHRcdFx0dGhpcy5faW5zZXJ0ZWRSZWZlcmVuY2VzLmRlbGV0ZShpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlID0gbW9kZWwuZ2V0VmFsdWUoKTtcblx0XHRjb25zdCBkZWNvczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlZmVyZW5jZSBvZiB0aGlzLl9pbnNlcnRlZFJlZmVyZW5jZXMudmFsdWVzKCkpIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gZ2V0QWdlbnRIb3N0Q29tcGxldGlvbkF0dGFjaG1lbnRSYW5nZSh2YWx1ZSwgcmVmZXJlbmNlLnRleHQsIHJlZmVyZW5jZS5yYW5nZSwgMCwgdmFsdWUubGVuZ3RoKTtcblx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdGFydFBvcyA9IG1vZGVsLmdldFBvc2l0aW9uQXQocmFuZ2Uuc3RhcnQpO1xuXHRcdFx0Y29uc3QgZW5kUG9zID0gbW9kZWwuZ2V0UG9zaXRpb25BdChyYW5nZS5lbmRFeGNsdXNpdmUpO1xuXHRcdFx0ZGVjb3MucHVzaCh7XG5cdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzdGFydFBvcy5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBzdGFydFBvcy5jb2x1bW4sXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogZW5kUG9zLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiBlbmRQb3MuY29sdW1uLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAnc2Vzc2lvbnMtYWdlbnQtaG9zdC1yZWZlcmVuY2UnLCBpbmxpbmVDbGFzc05hbWU6IEFnZW50SG9zdElucHV0Q29tcGxldGlvbkhhbmRsZXIuX2NsYXNzTmFtZSB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMuc2V0KGRlY29zKTtcblxuXHRcdHRoaXMuX2VkaXRvci5zZXREZWNvcmF0aW9uc0J5VHlwZShcblx0XHRcdEFnZW50SG9zdElucHV0Q29tcGxldGlvbkhhbmRsZXIuX2FyZ3VtZW50SGludERlY29yYXRpb25EZXNjcmlwdGlvbixcblx0XHRcdEFnZW50SG9zdElucHV0Q29tcGxldGlvbkhhbmRsZXIuX2FyZ3VtZW50SGludERlY29yYXRpb25UeXBlLFxuXHRcdFx0dGhpcy5fZ2V0QXJndW1lbnRIaW50RGVjb3JhdGlvbnMobW9kZWwsIHZhbHVlKSxcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbXB1dGVzIHRoZSBpbmxpbmUgcGxhY2Vob2xkZXIgKGdob3N0IHRleHQpIHNob3duIGFmdGVyIGFuIGFjY2VwdGVkXG5cdCAqIGFnZW50LWhvc3Qgc2xhc2ggY29tbWFuZCB3aG9zZSBgX21ldGFgIGNhcnJpZXMgYW4gYXJndW1lbnQgaGludC4gU2hvd25cblx0ICogb25seSB3aGlsZSB0aGUgY29tbWFuZCBpcyB0aGUgc29sZSBjb250ZW50IGZvbGxvd2VkIGJ5IGEgc2luZ2xlIHRyYWlsaW5nXG5cdCAqIHNwYWNlIChpLmUuIGJlZm9yZSBhbnkgYXJndW1lbnQgaGFzIGJlZW4gdHlwZWQpLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0QXJndW1lbnRIaW50RGVjb3JhdGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIHZhbHVlOiBzdHJpbmcpOiBJRGVjb3JhdGlvbk9wdGlvbnNbXSB7XG5cdFx0Y29uc3QgcGxhY2Vob2xkZXIgPSBnZXRDb21tYW5kQXJndW1lbnRIaW50UGxhY2Vob2xkZXIodmFsdWUsIHRoaXMuX2NvbnRleHRBdHRhY2htZW50cy5hdHRhY2htZW50cywgdGhpcy5faW5zZXJ0ZWRSZWZlcmVuY2VzKTtcblx0XHRpZiAoIXBsYWNlaG9sZGVyKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGVuZFBvcyA9IG1vZGVsLmdldFBvc2l0aW9uQXQocGxhY2Vob2xkZXIuZW5kT2Zmc2V0KTtcblx0XHRyZXR1cm4gW3tcblx0XHRcdHJhbmdlOiBnZXRSYW5nZUZvclBsYWNlaG9sZGVyKHsgc3RhcnRMaW5lTnVtYmVyOiBlbmRQb3MubGluZU51bWJlciwgZW5kTGluZU51bWJlcjogZW5kUG9zLmxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiBlbmRQb3MuY29sdW1uLCBlbmRDb2x1bW46IGVuZFBvcy5jb2x1bW4gfSksXG5cdFx0XHRyZW5kZXJPcHRpb25zOiB7IGFmdGVyOiB7IGNvbnRlbnRUZXh0OiBwbGFjZWhvbGRlci5hcmd1bWVudEhpbnQsIGNvbG9yOiBnZXRJbnB1dFBsYWNlaG9sZGVyQ29sb3IodGhpcy5fdGhlbWVTZXJ2aWNlKSB9IH1cblx0XHR9XTtcblx0fVxuXG5cdHByaXZhdGUgX3RvT2Zmc2V0UmFuZ2UocmFuZ2U6IFJhbmdlLCBpbnNlcnRUZXh0OiBzdHJpbmcpOiBPZmZzZXRSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzdGFydCA9IG1vZGVsLmdldE9mZnNldEF0KHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0cmV0dXJuIG5ldyBPZmZzZXRSYW5nZShzdGFydCwgc3RhcnQgKyBpbnNlcnRUZXh0Lmxlbmd0aCk7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFHeEIsU0FBUywwQkFBMEI7QUFHbkMsU0FBUyxtQkFBbUI7QUFFNUIsU0FBeUIsMEJBQTBCO0FBRW5ELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCLDJCQUE0RDtBQUM3RixTQUFTLGtDQUFrQyxxQ0FBZ0Usb0NBQW9DLDBDQUEwQztBQUN6TCxTQUFtQyxzQkFBc0IseUJBQXlCO0FBQ2xGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsMEJBQTBCLDhCQUE4QjtBQUNqRSxTQUFTLGdDQUFnQyx1Q0FBdUM7QUFFaEYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx1QkFBdUI7QUFRaEMsTUFBTSx3QkFBd0I7QUFTOUIsaUJBQWlCLGdCQUFnQix1QkFBdUIsQ0FBQyxXQUFXLFFBQXVCO0FBQzFGLE1BQUksUUFBUSxpQkFBaUIsSUFBSSxPQUFPLElBQUksWUFBWSxJQUFJLEtBQUs7QUFDbEUsQ0FBQztBQU1ELE1BQU0sd0JBQXdCO0FBWTlCLGlCQUFpQixnQkFBZ0IsdUJBQXVCLE9BQU8sVUFBNEIsUUFBMEI7QUFDcEgsUUFB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QUFPO0FBQUEsVUFDTixpQkFBaUIsU0FBUztBQUFBLFVBQzFCLGFBQWEsU0FBUztBQUFBLFVBQ3RCLGVBQWUsT0FBTztBQUFBLFVBQ3RCLFdBQVcsT0FBTztBQUFBLFFBQ25CO0FBQUEsUUFDQSxTQUFTLEVBQUUsYUFBYSxpQ0FBaUMsaUJBQWlCLGdDQUFnQyxXQUFXO0FBQUEsTUFDdEgsQ0FBQztBQUFBLElBQ0Y7QUFFQSxTQUFLLGFBQWEsSUFBSSxLQUFLO0FBRTNCLFNBQUssUUFBUTtBQUFBLE1BQ1osZ0NBQWdDO0FBQUEsTUFDaEMsZ0NBQWdDO0FBQUEsTUFDaEMsS0FBSyw0QkFBNEIsT0FBTyxLQUFLO0FBQUEsSUFDOUM7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRUSw0QkFBNEIsT0FBbUIsT0FBcUM7QUFDM0YsVUFBTSxjQUFjLGtDQUFrQyxPQUFPLEtBQUssb0JBQW9CLGFBQWEsS0FBSyxtQkFBbUI7QUFDM0gsUUFBSSxDQUFDLGFBQWE7QUFDakIsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUNBLFVBQU0sU0FBUyxNQUFNLGNBQWMsWUFBWSxTQUFTO0FBQ3hELFdBQU8sQ0FBQztBQUFBLE1BQ1AsT0FBTyx1QkFBdUIsRUFBRSxpQkFBaUIsT0FBTyxZQUFZLGVBQWUsT0FBTyxZQUFZLGFBQWEsT0FBTyxRQUFRLFdBQVcsT0FBTyxPQUFPLENBQUM7QUFBQSxNQUM1SixlQUFlLEVBQUUsT0FBTyxFQUFFLGFBQWEsWUFBWSxjQUFjLE9BQU8seUJBQXlCLEtBQUssYUFBYSxFQUFFLEVBQUU7QUFBQSxJQUN4SCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsZUFBZSxPQUFjLFlBQTZDO0FBQ2pGLFVBQU0sUUFBUSxLQUFLLFFBQVEsU0FBUztBQUNwQyxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxRQUFRLE1BQU0sWUFBWSxNQUFNLGlCQUFpQixDQUFDO0FBQ3hELFdBQU8sSUFBSSxZQUFZLE9BQU8sUUFBUSxXQUFXLE1BQU07QUFBQSxFQUN4RDtBQUVEO0FBbFlhLGdDQUVZLGFBQWE7QUFGekIsZ0NBR1kscUNBQXFDO0FBSGpELGdDQUlZLDhCQUE4QjtBQUoxQyxrQ0FBTjtBQUFBLEVBb0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXpCVTsiLAogICJuYW1lcyI6IFsicmVmZXJlbmNlVGV4dCIsICJlbnRyeSJdCn0K
