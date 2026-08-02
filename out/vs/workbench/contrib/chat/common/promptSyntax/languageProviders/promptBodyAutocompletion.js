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
import { dirname, extUri } from "../../../../../../base/common/resources.js";
import { getPromptsTypeForLanguageId, PromptsType } from "../promptTypes.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { CompletionItemKind } from "../../../../../../editor/common/languages.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { CharCode } from "../../../../../../base/common/charCode.js";
import { getWordAtText } from "../../../../../../editor/common/core/wordHelper.js";
import { chatVariableLeader } from "../../requestParser/chatParserTypes.js";
import { ILanguageModelToolsService } from "../../tools/languageModelToolsService.js";
let PromptBodyAutocompletion = class {
  constructor(fileService, languageModelToolsService) {
    this.fileService = fileService;
    this.languageModelToolsService = languageModelToolsService;
    /**
     * Debug display name for this provider.
     */
    this._debugDisplayName = "PromptBodyAutocompletion";
    /**
     * List of trigger characters handled by this provider.
     */
    this.triggerCharacters = [":", ".", "/", "\\"];
  }
  /**
   * The main function of this provider that calculates
   * completion items based on the provided arguments.
   */
  async provideCompletionItems(model, position, context, token) {
    const promptsType = getPromptsTypeForLanguageId(model.getLanguageId());
    if (!promptsType) {
      return void 0;
    }
    const reference = await this.findVariableReference(model, position, token);
    if (!reference) {
      return void 0;
    }
    const suggestions = [];
    switch (reference.type) {
      case "file":
        if (reference.contentRange.containsPosition(position)) {
          await this.collectFilePathCompletions(model, position, reference.contentRange, suggestions);
        } else {
          await this.collectDefaultCompletions(model, reference.range, promptsType, suggestions);
        }
        break;
      case "tool":
        if (reference.contentRange.containsPosition(position)) {
          if (promptsType === PromptsType.agent || promptsType === PromptsType.prompt) {
            await this.collectToolCompletions(model, position, reference.contentRange, suggestions);
          }
        } else {
          await this.collectDefaultCompletions(model, reference.range, promptsType, suggestions);
        }
        break;
      default:
        await this.collectDefaultCompletions(model, reference.range, promptsType, suggestions);
    }
    return { suggestions };
  }
  async collectToolCompletions(model, position, toolRange, suggestions) {
    for (const toolName of this.languageModelToolsService.getFullReferenceNames()) {
      suggestions.push({
        label: toolName,
        kind: CompletionItemKind.Value,
        filterText: toolName,
        insertText: toolName,
        range: toolRange
      });
    }
  }
  async collectFilePathCompletions(model, position, pathRange, suggestions) {
    const pathUntilPosition = model.getValueInRange(pathRange.setEndPosition(position.lineNumber, position.column));
    const pathSeparator = pathUntilPosition.includes("/") || !pathUntilPosition.includes("\\") ? "/" : "\\";
    let parentFolderPath;
    if (pathUntilPosition.match(/[^\/]\.\.$/i)) {
      parentFolderPath = pathUntilPosition + pathSeparator;
    } else {
      let i = pathUntilPosition.length - 1;
      while (i >= 0 && ![CharCode.Slash, CharCode.Backslash].includes(pathUntilPosition.charCodeAt(i))) {
        i--;
      }
      parentFolderPath = pathUntilPosition.substring(0, i + 1);
    }
    const retriggerCommand = { id: "editor.action.triggerSuggest", title: "Suggest" };
    try {
      const currentFolder = extUri.resolvePath(dirname(model.uri), parentFolderPath);
      const { children } = await this.fileService.resolve(currentFolder);
      if (children) {
        for (const child of children) {
          const insertText = (parentFolderPath || "." + pathSeparator) + child.name;
          suggestions.push({
            label: child.name + (child.isDirectory ? pathSeparator : ""),
            kind: child.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
            range: pathRange,
            insertText: insertText + (child.isDirectory ? pathSeparator : ""),
            filterText: insertText,
            command: child.isDirectory ? retriggerCommand : void 0
          });
        }
      }
    } catch (e) {
    }
    suggestions.push({
      label: "..",
      kind: CompletionItemKind.Folder,
      insertText: parentFolderPath + ".." + pathSeparator,
      range: pathRange,
      filterText: parentFolderPath + "..",
      command: retriggerCommand
    });
  }
  /**
   * Finds a file reference that suites the provided `position`.
   */
  async findVariableReference(model, position, token) {
    if (model.getLineContent(1).trimEnd() === "---") {
      let i = 2;
      while (i <= model.getLineCount() && model.getLineContent(i).trimEnd() !== "---") {
        i++;
      }
      if (i >= position.lineNumber) {
        return void 0;
      }
    }
    const reg = new RegExp(`${chatVariableLeader}[^\\s#]*`, "g");
    const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
    if (!varWord) {
      return void 0;
    }
    const range = new Range(position.lineNumber, varWord.startColumn + 1, position.lineNumber, varWord.endColumn);
    const nameMatch = varWord.word.match(/^#(\w+:)?/);
    if (nameMatch) {
      const contentCol = varWord.startColumn + nameMatch[0].length;
      if (nameMatch[1] === "file:") {
        return { type: "file", contentRange: new Range(position.lineNumber, contentCol, position.lineNumber, varWord.endColumn), range };
      } else if (nameMatch[1] === "tool:") {
        return { type: "tool", contentRange: new Range(position.lineNumber, contentCol, position.lineNumber, varWord.endColumn), range };
      }
    }
    return { type: "", contentRange: range, range };
  }
  async collectDefaultCompletions(model, range, promptFileType, suggestions) {
    const labels = promptFileType === PromptsType.instructions ? ["file"] : ["file", "tool"];
    labels.forEach((label) => {
      suggestions.push({
        label: `${label}:`,
        kind: CompletionItemKind.Keyword,
        insertText: `${label}:`,
        range,
        command: { id: "editor.action.triggerSuggest", title: "Suggest" }
      });
    });
  }
};
PromptBodyAutocompletion = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ILanguageModelToolsService)
], PromptBodyAutocompletion);
export {
  PromptBodyAutocompletion
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRCb2R5QXV0b2NvbXBsZXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXJuYW1lLCBleHRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0UHJvbXB0c1R5cGVGb3JMYW5ndWFnZUlkLCBQcm9tcHRzVHlwZSB9IGZyb20gJy4uL3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uQ29udGV4dCwgQ29tcGxldGlvbkl0ZW0sIENvbXBsZXRpb25JdGVtS2luZCwgQ29tcGxldGlvbkl0ZW1Qcm92aWRlciwgQ29tcGxldGlvbkxpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IGdldFdvcmRBdFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBjaGF0VmFyaWFibGVMZWFkZXIgfSBmcm9tICcuLi8uLi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuXG4vKipcbiAqIFByb3ZpZGVzIGF1dG9jb21wbGV0aW9uIGZvciB0aGUgdmFyaWFibGVzIGluc2lkZSBwcm9tcHQgYm9kaWVzLlxuICogLSAjZmlsZTogcGF0aHMgdG8gZmlsZXMgYW5kIGZvbGRlcnMgaW4gdGhlIHdvcmtzcGFjZVxuICogLSAjIHRvb2wgbmFtZXNcbiAqL1xuZXhwb3J0IGNsYXNzIFByb21wdEJvZHlBdXRvY29tcGxldGlvbiBpbXBsZW1lbnRzIENvbXBsZXRpb25JdGVtUHJvdmlkZXIge1xuXHQvKipcblx0ICogRGVidWcgZGlzcGxheSBuYW1lIGZvciB0aGlzIHByb3ZpZGVyLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IF9kZWJ1Z0Rpc3BsYXlOYW1lOiBzdHJpbmcgPSAnUHJvbXB0Qm9keUF1dG9jb21wbGV0aW9uJztcblxuXHQvKipcblx0ICogTGlzdCBvZiB0cmlnZ2VyIGNoYXJhY3RlcnMgaGFuZGxlZCBieSB0aGlzIHByb3ZpZGVyLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IHRyaWdnZXJDaGFyYWN0ZXJzID0gWyc6JywgJy4nLCAnLycsICdcXFxcJ107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBtYWluIGZ1bmN0aW9uIG9mIHRoaXMgcHJvdmlkZXIgdGhhdCBjYWxjdWxhdGVzXG5cdCAqIGNvbXBsZXRpb24gaXRlbXMgYmFzZWQgb24gdGhlIHByb3ZpZGVkIGFyZ3VtZW50cy5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBwcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIGNvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPENvbXBsZXRpb25MaXN0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcHJvbXB0c1R5cGUgPSBnZXRQcm9tcHRzVHlwZUZvckxhbmd1YWdlSWQobW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKTtcblx0XHRpZiAoIXByb21wdHNUeXBlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZWZlcmVuY2UgPSBhd2FpdCB0aGlzLmZpbmRWYXJpYWJsZVJlZmVyZW5jZShtb2RlbCwgcG9zaXRpb24sIHRva2VuKTtcblx0XHRpZiAoIXJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbnM6IENvbXBsZXRpb25JdGVtW10gPSBbXTtcblx0XHRzd2l0Y2ggKHJlZmVyZW5jZS50eXBlKSB7XG5cdFx0XHRjYXNlICdmaWxlJzpcblx0XHRcdFx0aWYgKHJlZmVyZW5jZS5jb250ZW50UmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdFx0XHQvLyBpbnNpZGUgdGhlIGxpbmsgcmFuZ2Vcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbGxlY3RGaWxlUGF0aENvbXBsZXRpb25zKG1vZGVsLCBwb3NpdGlvbiwgcmVmZXJlbmNlLmNvbnRlbnRSYW5nZSwgc3VnZ2VzdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29sbGVjdERlZmF1bHRDb21wbGV0aW9ucyhtb2RlbCwgcmVmZXJlbmNlLnJhbmdlLCBwcm9tcHRzVHlwZSwgc3VnZ2VzdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAndG9vbCc6XG5cdFx0XHRcdGlmIChyZWZlcmVuY2UuY29udGVudFJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdFx0aWYgKHByb21wdHNUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCB8fCBwcm9tcHRzVHlwZSA9PT0gUHJvbXB0c1R5cGUucHJvbXB0KSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbGxlY3RUb29sQ29tcGxldGlvbnMobW9kZWwsIHBvc2l0aW9uLCByZWZlcmVuY2UuY29udGVudFJhbmdlLCBzdWdnZXN0aW9ucyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29sbGVjdERlZmF1bHRDb21wbGV0aW9ucyhtb2RlbCwgcmVmZXJlbmNlLnJhbmdlLCBwcm9tcHRzVHlwZSwgc3VnZ2VzdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YXdhaXQgdGhpcy5jb2xsZWN0RGVmYXVsdENvbXBsZXRpb25zKG1vZGVsLCByZWZlcmVuY2UucmFuZ2UsIHByb21wdHNUeXBlLCBzdWdnZXN0aW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiB7IHN1Z2dlc3Rpb25zIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbGxlY3RUb29sQ29tcGxldGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgdG9vbFJhbmdlOiBSYW5nZSwgc3VnZ2VzdGlvbnM6IENvbXBsZXRpb25JdGVtW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHRvb2xOYW1lIG9mIHRoaXMubGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZXMoKSkge1xuXHRcdFx0c3VnZ2VzdGlvbnMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiB0b29sTmFtZSxcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlZhbHVlLFxuXHRcdFx0XHRmaWx0ZXJUZXh0OiB0b29sTmFtZSxcblx0XHRcdFx0aW5zZXJ0VGV4dDogdG9vbE5hbWUsXG5cdFx0XHRcdHJhbmdlOiB0b29sUmFuZ2UsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXG5cdHByaXZhdGUgYXN5bmMgY29sbGVjdEZpbGVQYXRoQ29tcGxldGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgcGF0aFJhbmdlOiBSYW5nZSwgc3VnZ2VzdGlvbnM6IENvbXBsZXRpb25JdGVtW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwYXRoVW50aWxQb3NpdGlvbiA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShwYXRoUmFuZ2Uuc2V0RW5kUG9zaXRpb24ocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKSk7XG5cdFx0Y29uc3QgcGF0aFNlcGFyYXRvciA9IHBhdGhVbnRpbFBvc2l0aW9uLmluY2x1ZGVzKCcvJykgfHwgIXBhdGhVbnRpbFBvc2l0aW9uLmluY2x1ZGVzKCdcXFxcJykgPyAnLycgOiAnXFxcXCc7XG5cdFx0bGV0IHBhcmVudEZvbGRlclBhdGg6IHN0cmluZztcblx0XHRpZiAocGF0aFVudGlsUG9zaXRpb24ubWF0Y2goL1teXFwvXVxcLlxcLiQvaSkpIHsgLy8gZW5kcyB3aXRoIGAuLmBcblx0XHRcdHBhcmVudEZvbGRlclBhdGggPSBwYXRoVW50aWxQb3NpdGlvbiArIHBhdGhTZXBhcmF0b3I7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBpID0gcGF0aFVudGlsUG9zaXRpb24ubGVuZ3RoIC0gMTtcblx0XHRcdHdoaWxlIChpID49IDAgJiYgIVtDaGFyQ29kZS5TbGFzaCwgQ2hhckNvZGUuQmFja3NsYXNoXS5pbmNsdWRlcyhwYXRoVW50aWxQb3NpdGlvbi5jaGFyQ29kZUF0KGkpKSkge1xuXHRcdFx0XHRpLS07XG5cdFx0XHR9XG5cdFx0XHRwYXJlbnRGb2xkZXJQYXRoID0gcGF0aFVudGlsUG9zaXRpb24uc3Vic3RyaW5nKDAsIGkgKyAxKTsgLy8gdGhlIHNlZ21lbnQgdXAgdG8gdGhlIGAvYCBvciBgXFxgIGJlZm9yZSB0aGUgcG9zaXRpb25cblx0XHR9XG5cblx0XHRjb25zdCByZXRyaWdnZXJDb21tYW5kID0geyBpZDogJ2VkaXRvci5hY3Rpb24udHJpZ2dlclN1Z2dlc3QnLCB0aXRsZTogJ1N1Z2dlc3QnIH07XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY3VycmVudEZvbGRlciA9IGV4dFVyaS5yZXNvbHZlUGF0aChkaXJuYW1lKG1vZGVsLnVyaSksIHBhcmVudEZvbGRlclBhdGgpO1xuXHRcdFx0Y29uc3QgeyBjaGlsZHJlbiB9ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKGN1cnJlbnRGb2xkZXIpO1xuXHRcdFx0aWYgKGNoaWxkcmVuKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRjb25zdCBpbnNlcnRUZXh0ID0gKHBhcmVudEZvbGRlclBhdGggfHwgKCcuJyArIHBhdGhTZXBhcmF0b3IpKSArIGNoaWxkLm5hbWU7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRsYWJlbDogY2hpbGQubmFtZSArIChjaGlsZC5pc0RpcmVjdG9yeSA/IHBhdGhTZXBhcmF0b3IgOiAnJyksXG5cdFx0XHRcdFx0XHRraW5kOiBjaGlsZC5pc0RpcmVjdG9yeSA/IENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIgOiBDb21wbGV0aW9uSXRlbUtpbmQuRmlsZSxcblx0XHRcdFx0XHRcdHJhbmdlOiBwYXRoUmFuZ2UsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiBpbnNlcnRUZXh0ICsgKGNoaWxkLmlzRGlyZWN0b3J5ID8gcGF0aFNlcGFyYXRvciA6ICcnKSxcblx0XHRcdFx0XHRcdGZpbHRlclRleHQ6IGluc2VydFRleHQsXG5cdFx0XHRcdFx0XHRjb21tYW5kOiBjaGlsZC5pc0RpcmVjdG9yeSA/IHJldHJpZ2dlckNvbW1hbmQgOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIGlnbm9yZSBlcnJvcnMgYWNjZXNzaW5nIHRoZSBmb2xkZXIgbG9jYXRpb25cblx0XHR9XG5cblx0XHRzdWdnZXN0aW9ucy5wdXNoKHtcblx0XHRcdGxhYmVsOiAnLi4nLFxuXHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlcixcblx0XHRcdGluc2VydFRleHQ6IHBhcmVudEZvbGRlclBhdGggKyAnLi4nICsgcGF0aFNlcGFyYXRvcixcblx0XHRcdHJhbmdlOiBwYXRoUmFuZ2UsXG5cdFx0XHRmaWx0ZXJUZXh0OiBwYXJlbnRGb2xkZXJQYXRoICsgJy4uJyxcblx0XHRcdGNvbW1hbmQ6IHJldHJpZ2dlckNvbW1hbmRcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kcyBhIGZpbGUgcmVmZXJlbmNlIHRoYXQgc3VpdGVzIHRoZSBwcm92aWRlZCBgcG9zaXRpb25gLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBmaW5kVmFyaWFibGVSZWZlcmVuY2UobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IGNvbnRlbnRSYW5nZTogUmFuZ2U7IHR5cGU6IHN0cmluZzsgcmFuZ2U6IFJhbmdlIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSkudHJpbUVuZCgpID09PSAnLS0tJykge1xuXHRcdFx0bGV0IGkgPSAyO1xuXHRcdFx0d2hpbGUgKGkgPD0gbW9kZWwuZ2V0TGluZUNvdW50KCkgJiYgbW9kZWwuZ2V0TGluZUNvbnRlbnQoaSkudHJpbUVuZCgpICE9PSAnLS0tJykge1xuXHRcdFx0XHRpKys7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaSA+PSBwb3NpdGlvbi5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIGluc2lkZSBmcm9udCBtYXR0ZXJcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZWcgPSBuZXcgUmVnRXhwKGAke2NoYXRWYXJpYWJsZUxlYWRlcn1bXlxcXFxzI10qYCwgJ2cnKTtcblx0XHRjb25zdCB2YXJXb3JkID0gZ2V0V29yZEF0VGV4dChwb3NpdGlvbi5jb2x1bW4sIHJlZywgbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlciksIDApO1xuXHRcdGlmICghdmFyV29yZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgdmFyV29yZC5zdGFydENvbHVtbiArIDEsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHZhcldvcmQuZW5kQ29sdW1uKTtcblx0XHRjb25zdCBuYW1lTWF0Y2ggPSB2YXJXb3JkLndvcmQubWF0Y2goL14jKFxcdys6KT8vKTtcblx0XHRpZiAobmFtZU1hdGNoKSB7XG5cdFx0XHRjb25zdCBjb250ZW50Q29sID0gdmFyV29yZC5zdGFydENvbHVtbiArIG5hbWVNYXRjaFswXS5sZW5ndGg7XG5cdFx0XHRpZiAobmFtZU1hdGNoWzFdID09PSAnZmlsZTonKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6ICdmaWxlJywgY29udGVudFJhbmdlOiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgY29udGVudENvbCwgcG9zaXRpb24ubGluZU51bWJlciwgdmFyV29yZC5lbmRDb2x1bW4pLCByYW5nZSB9O1xuXHRcdFx0fSBlbHNlIGlmIChuYW1lTWF0Y2hbMV0gPT09ICd0b29sOicpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ3Rvb2wnLCBjb250ZW50UmFuZ2U6IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBjb250ZW50Q29sLCBwb3NpdGlvbi5saW5lTnVtYmVyLCB2YXJXb3JkLmVuZENvbHVtbiksIHJhbmdlIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IHR5cGU6ICcnLCBjb250ZW50UmFuZ2U6IHJhbmdlLCByYW5nZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb2xsZWN0RGVmYXVsdENvbXBsZXRpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UsIHByb21wdEZpbGVUeXBlOiBQcm9tcHRzVHlwZSwgc3VnZ2VzdGlvbnM6IENvbXBsZXRpb25JdGVtW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsYWJlbHMgPSBwcm9tcHRGaWxlVHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zID8gWydmaWxlJ10gOiBbJ2ZpbGUnLCAndG9vbCddO1xuXHRcdGxhYmVscy5mb3JFYWNoKGxhYmVsID0+IHtcblx0XHRcdHN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogYCR7bGFiZWx9OmAsXG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5LZXl3b3JkLFxuXHRcdFx0XHRpbnNlcnRUZXh0OiBgJHtsYWJlbH06YCxcblx0XHRcdFx0cmFuZ2U6IHJhbmdlLFxuXHRcdFx0XHRjb21tYW5kOiB7IGlkOiAnZWRpdG9yLmFjdGlvbi50cmlnZ2VyU3VnZ2VzdCcsIHRpdGxlOiAnU3VnZ2VzdCcgfVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTLGNBQWM7QUFFaEMsU0FBUyw2QkFBNkIsbUJBQW1CO0FBRXpELFNBQVMsb0JBQW9CO0FBRTdCLFNBQTRDLDBCQUFrRTtBQUM5RyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxrQ0FBa0M7QUFPcEMsSUFBTSwyQkFBTixNQUFpRTtBQUFBLEVBV3ZFLFlBQ2dDLGFBQ2MsMkJBQzVDO0FBRjhCO0FBQ2M7QUFUOUM7QUFBQTtBQUFBO0FBQUEsU0FBZ0Isb0JBQTRCO0FBSzVDO0FBQUE7QUFBQTtBQUFBLFNBQWdCLG9CQUFvQixDQUFDLEtBQUssS0FBSyxLQUFLLElBQUk7QUFBQSxFQU14RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFhLHVCQUF1QixPQUFtQixVQUFvQixTQUE0QixPQUErRDtBQUNySyxVQUFNLGNBQWMsNEJBQTRCLE1BQU0sY0FBYyxDQUFDO0FBQ3JFLFFBQUksQ0FBQyxhQUFhO0FBQ2pCLGFBQU87QUFBQSxJQUNSO0FBQ0Es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
