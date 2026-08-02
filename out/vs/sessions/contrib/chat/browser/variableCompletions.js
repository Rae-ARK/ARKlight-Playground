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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isPatternInWord } from "../../../../base/common/filters.js";
import { Schemas } from "../../../../base/common/network.js";
import { ResourceSet } from "../../../../base/common/map.js";
import { basename, isEqualOrParent } from "../../../../base/common/resources.js";
import { Range } from "../../../../editor/common/core/range.js";
import { getWordAtText } from "../../../../editor/common/core/wordHelper.js";
import { CompletionItemKind } from "../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { FileKind, IFileService } from "../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ISearchService } from "../../../../workbench/services/search/common/search.js";
import { searchFilesAndFolders } from "../../../../workbench/contrib/search/browser/searchChatContext.js";
import { IHistoryService } from "../../../../workbench/services/history/common/history.js";
import { isDiffEditorInput } from "../../../../workbench/common/editor.js";
import { isSupportedChatFileScheme } from "../../../../workbench/contrib/chat/common/constants.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
const VARIABLE_LEADER = "#";
const ADD_REFERENCE_COMMAND = "sessions.chat.addVariableReference";
CommandsRegistry.registerCommand(ADD_REFERENCE_COMMAND, (_accessor, arg) => {
  arg.attachments.addAttachments({
    id: arg.entry.id,
    name: arg.entry.name,
    value: arg.entry.value,
    kind: arg.entry.kind
  });
});
function computeRange(model, position, reg) {
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
  if (varWord) {
    const wordBefore = model.getWordUntilPosition({ lineNumber: position.lineNumber, column: varWord.startColumn });
    if (wordBefore.word) {
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
  return { insert, replace, varWord };
}
let VariableCompletionHandler = class extends Disposable {
  constructor(_editor, _contextAttachments, _getWorkspaceUri, languageFeaturesService, searchService, labelService, configurationService, fileService, historyService, instantiationService) {
    super();
    this._editor = _editor;
    this._contextAttachments = _contextAttachments;
    this._getWorkspaceUri = _getWorkspaceUri;
    this.languageFeaturesService = languageFeaturesService;
    this.searchService = searchService;
    this.labelService = labelService;
    this.configurationService = configurationService;
    this.fileService = fileService;
    this.historyService = historyService;
    this.instantiationService = instantiationService;
    this._decorations = this._editor.createDecorationsCollection();
    this._registerFileCompletions();
    this._registerDecorations();
  }
  // --- File & Folder completions ---
  _registerFileCompletions() {
    const uri = this._editor.getModel()?.uri;
    if (!uri) {
      return;
    }
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: uri.scheme, hasAccessToAllModels: true }, {
      _debugDisplayName: "sessionsVariableFileAndFolder",
      triggerCharacters: [VARIABLE_LEADER],
      provideCompletionItems: async (model, position, _context, token) => {
        if (/^\s*\/troubleshoot\b/.test(model.getValue())) {
          return null;
        }
        const workspaceUri = this._getWorkspaceUri();
        if (!workspaceUri) {
          return null;
        }
        const range = computeRange(model, position, VariableCompletionHandler._wordPattern);
        if (!range) {
          return null;
        }
        const result = { suggestions: [], incomplete: true };
        await this._addFileAndFolderEntries(workspaceUri, result, range, token);
        return result;
      }
    }));
  }
  async _addFileAndFolderEntries(workspaceUri, result, info, token) {
    const makeItem = (resource, kind, description, boostPriority) => {
      const nameLabel = this.labelService.getUriBasenameLabel(resource);
      const text = `${VARIABLE_LEADER}file:${nameLabel}`;
      const uriLabel = this.labelService.getUriLabel(resource, { relative: true });
      const labelDescription = description ? localize("fileEntryDescription", "{0} ({1})", uriLabel, description) : uriLabel;
      const sortText = boostPriority ? " " : "!";
      return {
        label: { label: nameLabel, description: labelDescription },
        filterText: `${nameLabel} ${VARIABLE_LEADER}${nameLabel} ${uriLabel}`,
        insertText: info.varWord?.endColumn === info.replace.endColumn ? `${text} ` : text,
        range: info,
        kind: kind === FileKind.FILE ? CompletionItemKind.File : CompletionItemKind.Folder,
        sortText,
        command: {
          id: ADD_REFERENCE_COMMAND,
          title: "",
          arguments: [{
            attachments: this._contextAttachments,
            entry: {
              id: resource.toString(),
              name: nameLabel,
              value: resource,
              kind: kind === FileKind.FILE ? "file" : "directory"
            }
          }]
        }
      };
    };
    let pattern;
    if (info.varWord?.word && info.varWord.word.startsWith(VARIABLE_LEADER)) {
      pattern = info.varWord.word.toLowerCase().slice(1);
    }
    const seen = new ResourceSet();
    let historyCount = 0;
    for (const [i, item] of this.historyService.getHistory().entries()) {
      const resource = isDiffEditorInput(item) ? item.modified.resource : item.resource;
      if (!resource || seen.has(resource) || !this.instantiationService.invokeFunction((accessor) => isSupportedChatFileScheme(accessor, resource.scheme))) {
        continue;
      }
      if (!isEqualOrParent(resource, workspaceUri)) {
        continue;
      }
      if (pattern) {
        const uriLabel = this.labelService.getUriLabel(resource, { relative: true }).toLowerCase();
        const baseName = this.labelService.getUriBasenameLabel(resource).toLowerCase();
        const combined = `${baseName} ${uriLabel}`;
        if (!isPatternInWord(pattern, 0, pattern.length, combined, 0, combined.length)) {
          continue;
        }
      }
      seen.add(resource);
      result.suggestions.push(makeItem(resource, FileKind.FILE, i === 0 ? localize("activeFile", "Active file") : void 0, i === 0));
      if (++historyCount >= 5) {
        break;
      }
    }
    if (workspaceUri.scheme === Schemas.file || workspaceUri.scheme === Schemas.vscodeRemote) {
      await this._addEntriesViaSearch(workspaceUri, pattern, seen, makeItem, result, token);
    } else {
      await this._addEntriesViaFileService(workspaceUri, pattern, seen, makeItem, result, token);
    }
  }
  /**
   * Uses the search service to find files/folders — works for `file://` and `vscodeRemote` schemes.
   */
  async _addEntriesViaSearch(workspaceUri, pattern, seen, makeItem, result, token) {
    try {
      const { files, folders } = await searchFilesAndFolders(workspaceUri, pattern || "", true, token, void 0, this.configurationService, this.searchService);
      for (const file of files) {
        if (!seen.has(file)) {
          seen.add(file);
          result.suggestions.push(makeItem(file, FileKind.FILE));
        }
      }
      for (const folder of folders) {
        if (!seen.has(folder)) {
          seen.add(folder);
          result.suggestions.push(makeItem(folder, FileKind.FOLDER));
        }
      }
    } catch {
    }
  }
  /**
   * Walks the file tree via IFileService — used for virtual filesystems
   * (e.g. `github-remote-file://`) that don't support the search service.
   */
  async _addEntriesViaFileService(workspaceUri, pattern, seen, makeItem, result, token) {
    const maxResults = 100;
    const maxDepth = 10;
    const patternLower = pattern?.toLowerCase();
    const collect = async (uri, depth) => {
      if (result.suggestions.length >= maxResults || depth > maxDepth || token.isCancellationRequested) {
        return;
      }
      try {
        const stat = await this.fileService.resolve(uri);
        if (!stat.children) {
          return;
        }
        for (const child of stat.children) {
          if (result.suggestions.length >= maxResults || token.isCancellationRequested) {
            break;
          }
          if (child.isDirectory) {
            if (!seen.has(child.resource)) {
              const folderName = basename(child.resource).toLowerCase();
              if (!patternLower || folderName.includes(patternLower)) {
                seen.add(child.resource);
                result.suggestions.push(makeItem(child.resource, FileKind.FOLDER));
              }
            }
            await collect(child.resource, depth + 1);
          } else {
            if (!seen.has(child.resource)) {
              const fileName = child.name.toLowerCase();
              if (!patternLower || fileName.includes(patternLower)) {
                seen.add(child.resource);
                result.suggestions.push(makeItem(child.resource, FileKind.FILE));
              }
            }
          }
        }
      } catch {
      }
    };
    await collect(workspaceUri, 0);
  }
  // --- Decorations ---
  _registerDecorations() {
    this._register(this._editor.onDidChangeModelContent(() => this._updateDecorations()));
    this._updateDecorations();
  }
  _updateDecorations() {
    const model = this._editor.getModel();
    const value = model?.getValue() ?? "";
    const decos = [];
    const regex = /#file:\S+/g;
    let match;
    while ((match = regex.exec(value)) !== null) {
      const startOffset = match.index;
      const endOffset = startOffset + match[0].length;
      const startPos = model.getPositionAt(startOffset);
      const endPos = model.getPositionAt(endOffset);
      decos.push({
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column
        },
        options: { description: "sessions-variable-reference", inlineClassName: VariableCompletionHandler._className }
      });
    }
    this._decorations.set(decos);
  }
};
VariableCompletionHandler._wordPattern = /#[^\s]*/g;
// MUST use g-flag
VariableCompletionHandler._className = "sessions-variable-reference";
VariableCompletionHandler = __decorateClass([
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, ISearchService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IHistoryService),
  __decorateParam(9, IInstantiationService)
], VariableCompletionHandler);
export {
  VariableCompletionHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3ZhcmlhYmxlQ29tcGxldGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzUGF0dGVybkluV29yZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGlzRXF1YWxPclBhcmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmRBdFBvc2l0aW9uLCBnZXRXb3JkQXRUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkNvbnRleHQsIENvbXBsZXRpb25JdGVtLCBDb21wbGV0aW9uSXRlbUtpbmQsIENvbXBsZXRpb25MaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCwgSU1vZGVsRGVsdGFEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJU2VhcmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBzZWFyY2hGaWxlc0FuZEZvbGRlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hDaGF0Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2hpc3RvcnkvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgaXNEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBpc1N1cHBvcnRlZENoYXRGaWxlU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgTmV3Q2hhdENvbnRleHRBdHRhY2htZW50cyB9IGZyb20gJy4vbmV3Q2hhdENvbnRleHRBdHRhY2htZW50cy5qcyc7XG5cbmNvbnN0IFZBUklBQkxFX0xFQURFUiA9ICcjJztcblxuLyoqXG4gKiBDb21tYW5kIElEIHVzZWQgYnkgY29tcGxldGlvbiBpdGVtcyB0byBhdHRhY2ggYSBmaWxlL2ZvbGRlciByZWZlcmVuY2VcbiAqIHRvIHRoZSBzZXNzaW9ucyBjb250ZXh0IGF0dGFjaG1lbnRzLlxuICovXG5jb25zdCBBRERfUkVGRVJFTkNFX0NPTU1BTkQgPSAnc2Vzc2lvbnMuY2hhdC5hZGRWYXJpYWJsZVJlZmVyZW5jZSc7XG5cbmludGVyZmFjZSBJUmVmZXJlbmNlQXJnIHtcblx0cmVhZG9ubHkgYXR0YWNobWVudHM6IE5ld0NoYXRDb250ZXh0QXR0YWNobWVudHM7XG5cdHJlYWRvbmx5IGVudHJ5OiB7XG5cdFx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdmFsdWU6IFVSSTtcblx0XHRyZWFkb25seSBraW5kOiAnZmlsZScgfCAnZGlyZWN0b3J5Jztcblx0fTtcbn1cblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoQUREX1JFRkVSRU5DRV9DT01NQU5ELCAoX2FjY2Vzc29yLCBhcmc6IElSZWZlcmVuY2VBcmcpID0+IHtcblx0YXJnLmF0dGFjaG1lbnRzLmFkZEF0dGFjaG1lbnRzKHtcblx0XHRpZDogYXJnLmVudHJ5LmlkLFxuXHRcdG5hbWU6IGFyZy5lbnRyeS5uYW1lLFxuXHRcdHZhbHVlOiBhcmcuZW50cnkudmFsdWUsXG5cdFx0a2luZDogYXJnLmVudHJ5LmtpbmQsXG5cdH0pO1xufSk7XG5cbmludGVyZmFjZSBJQ29tcGxldGlvblJhbmdlUmVzdWx0IHtcblx0aW5zZXJ0OiBSYW5nZTtcblx0cmVwbGFjZTogUmFuZ2U7XG5cdHZhcldvcmQ6IElXb3JkQXRQb3NpdGlvbiB8IG51bGw7XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVSYW5nZShtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCByZWc6IFJlZ0V4cCk6IElDb21wbGV0aW9uUmFuZ2VSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRjb25zdCB2YXJXb3JkID0gZ2V0V29yZEF0VGV4dChwb3NpdGlvbi5jb2x1bW4sIHJlZywgbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlciksIDApO1xuXHRpZiAoIXZhcldvcmQgJiYgbW9kZWwuZ2V0V29yZFVudGlsUG9zaXRpb24ocG9zaXRpb24pLndvcmQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAoIXZhcldvcmQgJiYgcG9zaXRpb24uY29sdW1uID4gMSkge1xuXHRcdGNvbnN0IHRleHRCZWZvcmUgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiAtIDEsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbikpO1xuXHRcdGlmICh0ZXh0QmVmb3JlICE9PSAnICcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHQvLyBSZWplY3QgaWYgdGhlcmUncyBhIG5vcm1hbCB3b3JkIHJpZ2h0IGJlZm9yZSBvdXIgdmFyaWFibGUgd29yZFxuXHRpZiAodmFyV29yZCkge1xuXHRcdGNvbnN0IHdvcmRCZWZvcmUgPSBtb2RlbC5nZXRXb3JkVW50aWxQb3NpdGlvbih7IGxpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsIGNvbHVtbjogdmFyV29yZC5zdGFydENvbHVtbiB9KTtcblx0XHRpZiAod29yZEJlZm9yZS53b3JkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0bGV0IGluc2VydDogUmFuZ2U7XG5cdGxldCByZXBsYWNlOiBSYW5nZTtcblx0aWYgKCF2YXJXb3JkKSB7XG5cdFx0aW5zZXJ0ID0gcmVwbGFjZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zaXRpb24pO1xuXHR9IGVsc2Uge1xuXHRcdGluc2VydCA9IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCB2YXJXb3JkLnN0YXJ0Q29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdHJlcGxhY2UgPSBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgdmFyV29yZC5zdGFydENvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgdmFyV29yZC5lbmRDb2x1bW4pO1xuXHR9XG5cblx0cmV0dXJuIHsgaW5zZXJ0LCByZXBsYWNlLCB2YXJXb3JkIH07XG59XG5cbi8qKlxuICogUHJvdmlkZXMgYCNmaWxlOmAgY29tcGxldGlvbnMgZm9yIGZpbGVzIGFuZCBmb2xkZXJzIGluIHRoZSBzZXNzaW9ucyBuZXctY2hhdCBpbnB1dCxcbiAqIGZvbGxvd2luZyB0aGUgc2FtZSBwYXR0ZXJuIGFzIHtAbGluayBTbGFzaENvbW1hbmRIYW5kbGVyfS5cbiAqXG4gKiBDb21wbGV0aW9ucyBhcmUgc2NvcGVkIHRvIHRoZSB3b3Jrc3BhY2Ugc2VsZWN0ZWQgaW4gdGhlIHdvcmtzcGFjZSBwaWNrZXIgZHJvcGRvd24sXG4gKiBtYXRjaGluZyB0aGUgYmVoYXZpb3VyIG9mIHRoZSBcIkFkZCBDb250ZXh0Li4uXCIgYXR0YWNoIGJ1dHRvbi5cbiAqIEZvciBsb2NhbC9yZW1vdGUgd29ya3NwYWNlcyB0aGUgc2VhcmNoIHNlcnZpY2UgaXMgdXNlZDsgZm9yIHZpcnR1YWwgZmlsZXN5c3RlbXNcbiAqIChlLmcuIGBnaXRodWItcmVtb3RlLWZpbGU6Ly9gKSB0aGUgZmlsZSBzZXJ2aWNlIHRyZWUgaXMgd2Fsa2VkIGRpcmVjdGx5LlxuICovXG5leHBvcnQgY2xhc3MgVmFyaWFibGVDb21wbGV0aW9uSGFuZGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF93b3JkUGF0dGVybiA9IC8jW15cXHNdKi9nOyAvLyBNVVNUIHVzZSBnLWZsYWdcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2NsYXNzTmFtZSA9ICdzZXNzaW9ucy12YXJpYWJsZS1yZWZlcmVuY2UnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogQ29kZUVkaXRvcldpZGdldCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0QXR0YWNobWVudHM6IE5ld0NoYXRDb250ZXh0QXR0YWNobWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0V29ya3NwYWNlVXJpOiAoKSA9PiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElTZWFyY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoU2VydmljZTogSVNlYXJjaFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElIaXN0b3J5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMgPSB0aGlzLl9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJGaWxlQ29tcGxldGlvbnMoKTtcblx0XHR0aGlzLl9yZWdpc3RlckRlY29yYXRpb25zKCk7XG5cdH1cblxuXHQvLyAtLS0gRmlsZSAmIEZvbGRlciBjb21wbGV0aW9ucyAtLS1cblxuXHRwcml2YXRlIF9yZWdpc3RlckZpbGVDb21wbGV0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCB1cmkgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKT8udXJpO1xuXHRcdGlmICghdXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IHVyaS5zY2hlbWUsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAnc2Vzc2lvbnNWYXJpYWJsZUZpbGVBbmRGb2xkZXInLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFtWQVJJQUJMRV9MRUFERVJdLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtczogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIF9jb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdC8vIEZvciBhIGAvdHJvdWJsZXNob290YCByZXF1ZXN0LCBgI2AgcmVmZXJlbmNlcyB0YXJnZXQgc2Vzc2lvbnNcblx0XHRcdFx0Ly8gKGhhbmRsZWQgYnkgdGhlIGAjc2Vzc2lvbmAgcHJvdmlkZXIpOyBzdXBwcmVzcyBmaWxlL2ZvbGRlclxuXHRcdFx0XHQvLyBjb21wbGV0aW9ucyBzbyBvbmx5IHNlc3Npb25zIGFyZSBvZmZlcmVkLlxuXHRcdFx0XHRpZiAoL15cXHMqXFwvdHJvdWJsZXNob290XFxiLy50ZXN0KG1vZGVsLmdldFZhbHVlKCkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSB0aGlzLl9nZXRXb3Jrc3BhY2VVcmkoKTtcblx0XHRcdFx0aWYgKCF3b3Jrc3BhY2VVcmkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gY29tcHV0ZVJhbmdlKG1vZGVsLCBwb3NpdGlvbiwgVmFyaWFibGVDb21wbGV0aW9uSGFuZGxlci5fd29yZFBhdHRlcm4pO1xuXHRcdFx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXN1bHQ6IENvbXBsZXRpb25MaXN0ID0geyBzdWdnZXN0aW9uczogW10sIGluY29tcGxldGU6IHRydWUgfTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fYWRkRmlsZUFuZEZvbGRlckVudHJpZXMod29ya3NwYWNlVXJpLCByZXN1bHQsIHJhbmdlLCB0b2tlbik7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWRkRmlsZUFuZEZvbGRlckVudHJpZXMod29ya3NwYWNlVXJpOiBVUkksIHJlc3VsdDogQ29tcGxldGlvbkxpc3QsIGluZm86IElDb21wbGV0aW9uUmFuZ2VSZXN1bHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1ha2VJdGVtID0gKHJlc291cmNlOiBVUkksIGtpbmQ6IEZpbGVLaW5kLCBkZXNjcmlwdGlvbj86IHN0cmluZywgYm9vc3RQcmlvcml0eT86IGJvb2xlYW4pOiBDb21wbGV0aW9uSXRlbSA9PiB7XG5cdFx0XHRjb25zdCBuYW1lTGFiZWwgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IHRleHQgPSBgJHtWQVJJQUJMRV9MRUFERVJ9ZmlsZToke25hbWVMYWJlbH1gO1xuXHRcdFx0Y29uc3QgdXJpTGFiZWwgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZXNvdXJjZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IGxhYmVsRGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvblxuXHRcdFx0XHQ/IGxvY2FsaXplKCdmaWxlRW50cnlEZXNjcmlwdGlvbicsICd7MH0gKHsxfSknLCB1cmlMYWJlbCwgZGVzY3JpcHRpb24pXG5cdFx0XHRcdDogdXJpTGFiZWw7XG5cdFx0XHRjb25zdCBzb3J0VGV4dCA9IGJvb3N0UHJpb3JpdHkgPyAnICcgOiAnISc7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBuYW1lTGFiZWwsIGRlc2NyaXB0aW9uOiBsYWJlbERlc2NyaXB0aW9uIH0sXG5cdFx0XHRcdGZpbHRlclRleHQ6IGAke25hbWVMYWJlbH0gJHtWQVJJQUJMRV9MRUFERVJ9JHtuYW1lTGFiZWx9ICR7dXJpTGFiZWx9YCxcblx0XHRcdFx0aW5zZXJ0VGV4dDogaW5mby52YXJXb3JkPy5lbmRDb2x1bW4gPT09IGluZm8ucmVwbGFjZS5lbmRDb2x1bW4gPyBgJHt0ZXh0fSBgIDogdGV4dCxcblx0XHRcdFx0cmFuZ2U6IGluZm8sXG5cdFx0XHRcdGtpbmQ6IGtpbmQgPT09IEZpbGVLaW5kLkZJTEUgPyBDb21wbGV0aW9uSXRlbUtpbmQuRmlsZSA6IENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIsXG5cdFx0XHRcdHNvcnRUZXh0LFxuXHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0aWQ6IEFERF9SRUZFUkVOQ0VfQ09NTUFORCxcblx0XHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdFx0YXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0YXR0YWNobWVudHM6IHRoaXMuX2NvbnRleHRBdHRhY2htZW50cyxcblx0XHRcdFx0XHRcdGVudHJ5OiB7XG5cdFx0XHRcdFx0XHRcdGlkOiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0XHRuYW1lOiBuYW1lTGFiZWwsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiByZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0a2luZDoga2luZCA9PT0gRmlsZUtpbmQuRklMRSA/ICdmaWxlJyA6ICdkaXJlY3RvcnknLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9IHNhdGlzZmllcyBJUmVmZXJlbmNlQXJnXSxcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0bGV0IHBhdHRlcm46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaW5mby52YXJXb3JkPy53b3JkICYmIGluZm8udmFyV29yZC53b3JkLnN0YXJ0c1dpdGgoVkFSSUFCTEVfTEVBREVSKSkge1xuXHRcdFx0cGF0dGVybiA9IGluZm8udmFyV29yZC53b3JkLnRvTG93ZXJDYXNlKCkuc2xpY2UoMSk7IC8vIHJlbW92ZSBsZWFkaW5nICNcblx0XHR9XG5cblx0XHRjb25zdCBzZWVuID0gbmV3IFJlc291cmNlU2V0KCk7XG5cblx0XHQvLyBISVNUT1JZIFx1MjAxNCBhbHdheXMgc2hvdyByZWNlbnQgZmlsZXMgZnJvbSBlZGl0b3IgaGlzdG9yeSB0aGF0IGFyZSB3aXRoaW4gdGhlIHdvcmtzcGFjZVxuXHRcdGxldCBoaXN0b3J5Q291bnQgPSAwO1xuXHRcdGZvciAoY29uc3QgW2ksIGl0ZW1dIG9mIHRoaXMuaGlzdG9yeVNlcnZpY2UuZ2V0SGlzdG9yeSgpLmVudHJpZXMoKSkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBpc0RpZmZFZGl0b3JJbnB1dChpdGVtKSA/IGl0ZW0ubW9kaWZpZWQucmVzb3VyY2UgOiBpdGVtLnJlc291cmNlO1xuXHRcdFx0aWYgKCFyZXNvdXJjZSB8fCBzZWVuLmhhcyhyZXNvdXJjZSkgfHwgIXRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gaXNTdXBwb3J0ZWRDaGF0RmlsZVNjaGVtZShhY2Nlc3NvciwgcmVzb3VyY2Uuc2NoZW1lKSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9ubHkgaW5jbHVkZSBmaWxlcyB3aXRoaW4gdGhlIHNlbGVjdGVkIHdvcmtzcGFjZVxuXHRcdFx0aWYgKCFpc0VxdWFsT3JQYXJlbnQocmVzb3VyY2UsIHdvcmtzcGFjZVVyaSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwYXR0ZXJuKSB7XG5cdFx0XHRcdGNvbnN0IHVyaUxhYmVsID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSkudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0Y29uc3QgYmFzZU5hbWUgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHJlc291cmNlKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRjb25zdCBjb21iaW5lZCA9IGAke2Jhc2VOYW1lfSAke3VyaUxhYmVsfWA7XG5cdFx0XHRcdGlmICghaXNQYXR0ZXJuSW5Xb3JkKHBhdHRlcm4sIDAsIHBhdHRlcm4ubGVuZ3RoLCBjb21iaW5lZCwgMCwgY29tYmluZWQubGVuZ3RoKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHNlZW4uYWRkKHJlc291cmNlKTtcblx0XHRcdHJlc3VsdC5zdWdnZXN0aW9ucy5wdXNoKG1ha2VJdGVtKHJlc291cmNlLCBGaWxlS2luZC5GSUxFLCBpID09PSAwID8gbG9jYWxpemUoJ2FjdGl2ZUZpbGUnLCAnQWN0aXZlIGZpbGUnKSA6IHVuZGVmaW5lZCwgaSA9PT0gMCkpO1xuXHRcdFx0aWYgKCsraGlzdG9yeUNvdW50ID49IDUpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU0VBUkNIIFx1MjAxNCBhbHdheXMgcnVuIHRvIHBvcHVsYXRlIGluaXRpYWwgcmVzdWx0cyAoZW1wdHkgcGF0dGVybiByZXR1cm5zIHNjb3JlZCBmaWxlcylcblx0XHRpZiAod29ya3NwYWNlVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlIHx8IHdvcmtzcGFjZVVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hZGRFbnRyaWVzVmlhU2VhcmNoKHdvcmtzcGFjZVVyaSwgcGF0dGVybiwgc2VlbiwgbWFrZUl0ZW0sIHJlc3VsdCwgdG9rZW4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hZGRFbnRyaWVzVmlhRmlsZVNlcnZpY2Uod29ya3NwYWNlVXJpLCBwYXR0ZXJuLCBzZWVuLCBtYWtlSXRlbSwgcmVzdWx0LCB0b2tlbik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFVzZXMgdGhlIHNlYXJjaCBzZXJ2aWNlIHRvIGZpbmQgZmlsZXMvZm9sZGVycyBcdTIwMTQgd29ya3MgZm9yIGBmaWxlOi8vYCBhbmQgYHZzY29kZVJlbW90ZWAgc2NoZW1lcy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2FkZEVudHJpZXNWaWFTZWFyY2goXG5cdFx0d29ya3NwYWNlVXJpOiBVUkksXG5cdFx0cGF0dGVybjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHNlZW46IFJlc291cmNlU2V0LFxuXHRcdG1ha2VJdGVtOiAocmVzb3VyY2U6IFVSSSwga2luZDogRmlsZUtpbmQsIGRlc2NyaXB0aW9uPzogc3RyaW5nLCBib29zdFByaW9yaXR5PzogYm9vbGVhbikgPT4gQ29tcGxldGlvbkl0ZW0sXG5cdFx0cmVzdWx0OiBDb21wbGV0aW9uTGlzdCxcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB7IGZpbGVzLCBmb2xkZXJzIH0gPSBhd2FpdCBzZWFyY2hGaWxlc0FuZEZvbGRlcnMod29ya3NwYWNlVXJpLCBwYXR0ZXJuIHx8ICcnLCB0cnVlLCB0b2tlbiwgdW5kZWZpbmVkLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnNlYXJjaFNlcnZpY2UpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRcdFx0aWYgKCFzZWVuLmhhcyhmaWxlKSkge1xuXHRcdFx0XHRcdHNlZW4uYWRkKGZpbGUpO1xuXHRcdFx0XHRcdHJlc3VsdC5zdWdnZXN0aW9ucy5wdXNoKG1ha2VJdGVtKGZpbGUsIEZpbGVLaW5kLkZJTEUpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgZm9sZGVycykge1xuXHRcdFx0XHRpZiAoIXNlZW4uaGFzKGZvbGRlcikpIHtcblx0XHRcdFx0XHRzZWVuLmFkZChmb2xkZXIpO1xuXHRcdFx0XHRcdHJlc3VsdC5zdWdnZXN0aW9ucy5wdXNoKG1ha2VJdGVtKGZvbGRlciwgRmlsZUtpbmQuRk9MREVSKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIHNlYXJjaCBtYXkgZmFpbCBvciBiZSBjYW5jZWxsZWRcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2Fsa3MgdGhlIGZpbGUgdHJlZSB2aWEgSUZpbGVTZXJ2aWNlIFx1MjAxNCB1c2VkIGZvciB2aXJ0dWFsIGZpbGVzeXN0ZW1zXG5cdCAqIChlLmcuIGBnaXRodWItcmVtb3RlLWZpbGU6Ly9gKSB0aGF0IGRvbid0IHN1cHBvcnQgdGhlIHNlYXJjaCBzZXJ2aWNlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYWRkRW50cmllc1ZpYUZpbGVTZXJ2aWNlKFxuXHRcdHdvcmtzcGFjZVVyaTogVVJJLFxuXHRcdHBhdHRlcm46IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRzZWVuOiBSZXNvdXJjZVNldCxcblx0XHRtYWtlSXRlbTogKHJlc291cmNlOiBVUkksIGtpbmQ6IEZpbGVLaW5kLCBkZXNjcmlwdGlvbj86IHN0cmluZywgYm9vc3RQcmlvcml0eT86IGJvb2xlYW4pID0+IENvbXBsZXRpb25JdGVtLFxuXHRcdHJlc3VsdDogQ29tcGxldGlvbkxpc3QsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtYXhSZXN1bHRzID0gMTAwO1xuXHRcdGNvbnN0IG1heERlcHRoID0gMTA7XG5cdFx0Y29uc3QgcGF0dGVybkxvd2VyID0gcGF0dGVybj8udG9Mb3dlckNhc2UoKTtcblxuXHRcdGNvbnN0IGNvbGxlY3QgPSBhc3luYyAodXJpOiBVUkksIGRlcHRoOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdGlmIChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoID49IG1heFJlc3VsdHMgfHwgZGVwdGggPiBtYXhEZXB0aCB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUodXJpKTtcblx0XHRcdFx0aWYgKCFzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0aWYgKHJlc3VsdC5zdWdnZXN0aW9ucy5sZW5ndGggPj0gbWF4UmVzdWx0cyB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChjaGlsZC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0Ly8gSW5jbHVkZSBtYXRjaGluZyBmb2xkZXJzIGFzIGNvbXBsZXRpb25zXG5cdFx0XHRcdFx0XHRpZiAoIXNlZW4uaGFzKGNoaWxkLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmb2xkZXJOYW1lID0gYmFzZW5hbWUoY2hpbGQucmVzb3VyY2UpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRcdGlmICghcGF0dGVybkxvd2VyIHx8IGZvbGRlck5hbWUuaW5jbHVkZXMocGF0dGVybkxvd2VyKSkge1xuXHRcdFx0XHRcdFx0XHRcdHNlZW4uYWRkKGNoaWxkLnJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0XHRyZXN1bHQuc3VnZ2VzdGlvbnMucHVzaChtYWtlSXRlbShjaGlsZC5yZXNvdXJjZSwgRmlsZUtpbmQuRk9MREVSKSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGF3YWl0IGNvbGxlY3QoY2hpbGQucmVzb3VyY2UsIGRlcHRoICsgMSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlmICghc2Vlbi5oYXMoY2hpbGQucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZpbGVOYW1lID0gY2hpbGQubmFtZS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRcdFx0XHRpZiAoIXBhdHRlcm5Mb3dlciB8fCBmaWxlTmFtZS5pbmNsdWRlcyhwYXR0ZXJuTG93ZXIpKSB7XG5cdFx0XHRcdFx0XHRcdFx0c2Vlbi5hZGQoY2hpbGQucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHRcdHJlc3VsdC5zdWdnZXN0aW9ucy5wdXNoKG1ha2VJdGVtKGNoaWxkLnJlc291cmNlLCBGaWxlS2luZC5GSUxFKSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgZXJyb3JzIGZvciBpbmRpdmlkdWFsIGRpcmVjdG9yaWVzXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGF3YWl0IGNvbGxlY3Qod29ya3NwYWNlVXJpLCAwKTtcblx0fVxuXG5cdC8vIC0tLSBEZWNvcmF0aW9ucyAtLS1cblxuXHRwcml2YXRlIF9yZWdpc3RlckRlY29yYXRpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB0aGlzLl91cGRhdGVEZWNvcmF0aW9ucygpKSk7XG5cdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZURlY29yYXRpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBtb2RlbD8uZ2V0VmFsdWUoKSA/PyAnJztcblxuXHRcdGNvbnN0IGRlY29zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHJlZ2V4ID0gLyNmaWxlOlxcUysvZztcblx0XHRsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cblx0XHR3aGlsZSAoKG1hdGNoID0gcmVnZXguZXhlYyh2YWx1ZSkpICE9PSBudWxsKSB7XG5cdFx0XHQvLyBDb252ZXJ0IHN0cmluZyBvZmZzZXQgdG8gbGluZS9jb2x1bW4gcG9zaXRpb25cblx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gbWF0Y2guaW5kZXg7XG5cdFx0XHRjb25zdCBlbmRPZmZzZXQgPSBzdGFydE9mZnNldCArIG1hdGNoWzBdLmxlbmd0aDtcblx0XHRcdGNvbnN0IHN0YXJ0UG9zID0gbW9kZWwhLmdldFBvc2l0aW9uQXQoc3RhcnRPZmZzZXQpO1xuXHRcdFx0Y29uc3QgZW5kUG9zID0gbW9kZWwhLmdldFBvc2l0aW9uQXQoZW5kT2Zmc2V0KTtcblxuXHRcdFx0ZGVjb3MucHVzaCh7XG5cdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzdGFydFBvcy5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBzdGFydFBvcy5jb2x1bW4sXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogZW5kUG9zLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiBlbmRQb3MuY29sdW1uLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAnc2Vzc2lvbnMtdmFyaWFibGUtcmVmZXJlbmNlJywgaW5saW5lQ2xhc3NOYW1lOiBWYXJpYWJsZUNvbXBsZXRpb25IYW5kbGVyLl9jbGFzc05hbWUgfSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2RlY29yYXRpb25zLnNldChkZWNvcyk7XG5cdH1cblxufVxuXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFVBQVUsdUJBQXVCO0FBSTFDLFNBQVMsYUFBYTtBQUN0QixTQUEwQixxQkFBcUI7QUFDL0MsU0FBNEMsMEJBQTBDO0FBRXRGLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsVUFBVSxvQkFBb0I7QUFDdkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw2QkFBNkI7QUFHdEMsTUFBTSxrQkFBa0I7QUFNeEIsTUFBTSx3QkFBd0I7QUFZOUIsaUJBQWlCLGdCQUFnQix1QkFBdUIsQ0FBQyxXQUFXLFFBQXVCO0FBQzFGLE1BQUksWUFBWSxlQUFlO0FBQUEsSUFDOUIsSUFBSSxJQUFJLE1BQU07QUFBQSxJQUNkLE1B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
