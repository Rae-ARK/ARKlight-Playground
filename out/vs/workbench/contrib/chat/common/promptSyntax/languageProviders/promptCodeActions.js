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
import { Range } from "../../../../../../editor/common/core/range.js";
import { localize } from "../../../../../../nls.js";
import { ILanguageModelToolsService } from "../../tools/languageModelToolsService.js";
import { getPromptsTypeForLanguageId, PromptsType } from "../promptTypes.js";
import { IPromptsService } from "../service/promptsService.js";
import { parseCommaSeparatedList, PromptHeaderAttributes } from "../promptFileParser.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { LEGACY_MODE_FILE_EXTENSION } from "../config/promptFileLocations.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { MARKERS_OWNER_ID, PromptValidatorMarkerCode } from "./promptValidator.js";
import { IMarkerService } from "../../../../../../platform/markers/common/markers.js";
import { CodeActionKind } from "../../../../../../editor/contrib/codeAction/common/types.js";
import { getTarget, isVSCodeOrDefaultTarget } from "./promptFileAttributes.js";
let PromptCodeActionProvider = class {
  constructor(promptsService, languageModelToolsService, fileService, markerService) {
    this.promptsService = promptsService;
    this.languageModelToolsService = languageModelToolsService;
    this.fileService = fileService;
    this.markerService = markerService;
    /**
     * Debug display name for this provider.
     */
    this._debugDisplayName = "PromptCodeActionProvider";
  }
  async provideCodeActions(model, range, context, token) {
    const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
    if (!promptType || promptType === PromptsType.instructions) {
      return void 0;
    }
    const result = [];
    const promptAST = this.promptsService.getParsedPromptFile(model);
    switch (promptType) {
      case PromptsType.agent:
        this.getUpdateToolsCodeActions(promptAST, promptType, model, range, result);
        this.getEnableMcpServerCodeActions(model, range, result);
        await this.getMigrateModeFileCodeActions(model, result);
        break;
      case PromptsType.prompt:
        this.getUpdateModeCodeActions(promptAST, model, range, result);
        this.getUpdateToolsCodeActions(promptAST, promptType, model, range, result);
        this.getEnableMcpServerCodeActions(model, range, result);
        break;
    }
    if (result.length === 0) {
      return void 0;
    }
    return {
      actions: result,
      dispose: () => {
      }
    };
  }
  getMarkers(model, range) {
    const markers = this.markerService.read({ resource: model.uri, owner: MARKERS_OWNER_ID });
    return markers.filter((marker) => range.containsRange(marker));
  }
  createCodeAction(model, range, title, edits, command) {
    return {
      title,
      ...edits ? { edit: { edits } } : {},
      ...command ? { command } : {},
      ranges: [range],
      diagnostics: this.getMarkers(model, range),
      kind: CodeActionKind.QuickFix.value
    };
  }
  getEnableMcpServerCodeActions(model, range, result) {
    const markersInRange = this.getMarkersInRange(model, range);
    for (const marker of markersInRange) {
      const markerCode = this.getMarkerCode(marker);
      if (markerCode === PromptValidatorMarkerCode.MissingGithubMcpServer) {
        result.push(this.createCodeAction(
          model,
          range,
          localize("enableGithubMcpServerSetting", "Enable Built-in GitHub MCP Server"),
          void 0,
          { id: "workbench.action.openSettings", title: "", arguments: ["@id:github.copilot.chat.githubMcpServer.enabled"] }
        ));
        result.push(this.createCodeAction(
          model,
          range,
          localize("installGithubMcpServer", "Install GitHub MCP Server from Marketplace"),
          void 0,
          { id: "workbench.extensions.search", title: "", arguments: ["@mcp github"] }
        ));
      } else if (markerCode === PromptValidatorMarkerCode.MissingPlaywrightMcpServer) {
        result.push(this.createCodeAction(
          model,
          range,
          localize("installPlaywrightMcpServer", "Install Playwright MCP Server from Marketplace"),
          void 0,
          { id: "workbench.extensions.search", title: "", arguments: ["@mcp playwright"] }
        ));
      } else if (markerCode === PromptValidatorMarkerCode.UnknownExtensionReference) {
        const reference = model.getValueInRange(new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn)).trim();
        const extensionId = reference.split("/")[0].replace(/^['"]|['"]$/g, "");
        if (extensionId) {
          result.push(this.createCodeAction(
            model,
            range,
            localize("searchExtensionMarketplace", "Search Marketplace for Extension '{0}'", extensionId),
            void 0,
            { id: "workbench.extensions.search", title: "", arguments: [`@id:${extensionId}`] }
          ));
        }
      } else if (markerCode === PromptValidatorMarkerCode.UnknownMcpServerReference) {
        const reference = model.getValueInRange(new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn)).trim();
        const serverId = reference.replace(/^['"]|['"]$/g, "");
        if (serverId) {
          result.push(this.createCodeAction(
            model,
            range,
            localize("searchMcpServerMarketplace", "Search Marketplace for MCP Server '{0}'", serverId),
            void 0,
            { id: "workbench.extensions.search", title: "", arguments: [`@mcp ${serverId}`] }
          ));
        }
      } else {
        const reference = model.getValueInRange(new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn)).trim();
        if (reference) {
          const extensionId = reference.split("/")[0].replace(/^['"]|['"]$/g, "");
          result.push(this.createCodeAction(
            model,
            range,
            localize("searchExtensionMarketplaceGeneric", "Search Marketplace for Extension '{0}'", extensionId),
            void 0,
            { id: "workbench.extensions.search", title: "", arguments: [`@id:${extensionId}`] }
          ));
          const serverId = reference.replace(/^['"]|['"]$/g, "");
          result.push(this.createCodeAction(
            model,
            range,
            localize("searchMcpServerMarketplaceGeneric", "Search Marketplace for MCP Server '{0}'", serverId),
            void 0,
            { id: "workbench.extensions.search", title: "", arguments: [`@mcp ${serverId}`] }
          ));
        }
      }
    }
  }
  getMarkerCode(marker) {
    if (!marker.code) {
      return void 0;
    }
    return typeof marker.code === "string" ? marker.code : marker.code.value;
  }
  getMarkersInRange(model, range) {
    const markers = this.markerService.read({ resource: model.uri, owner: MARKERS_OWNER_ID });
    return markers.filter((marker) => {
      const markerRange = new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn);
      return markerRange.intersectRanges(range);
    });
  }
  getUpdateModeCodeActions(promptFile, model, range, result) {
    const modeAttr = promptFile.header?.getAttribute(PromptHeaderAttributes.mode);
    if (!modeAttr?.range.containsRange(range)) {
      return;
    }
    const keyRange = new Range(modeAttr.range.startLineNumber, modeAttr.range.startColumn, modeAttr.range.startLineNumber, modeAttr.range.startColumn + modeAttr.key.length);
    result.push(this.createCodeAction(
      model,
      keyRange,
      localize("renameToAgent", "Rename to 'agent'"),
      [asWorkspaceTextEdit(model, { range: keyRange, text: "agent" })]
    ));
  }
  async getMigrateModeFileCodeActions(model, result) {
    if (model.uri.path.endsWith(LEGACY_MODE_FILE_EXTENSION)) {
      const location = this.promptsService.getAgentFileURIFromModeFile(model.uri);
      if (location && await this.fileService.canMove(model.uri, location)) {
        const edit = { oldResource: model.uri, newResource: location, options: { overwrite: false, copy: false } };
        result.push(this.createCodeAction(
          model,
          new Range(1, 1, 1, 4),
          localize("migrateToAgent", "Migrate to custom agent file"),
          [edit]
        ));
      }
    }
  }
  getUpdateToolsCodeActions(promptFile, promptType, model, range, result) {
    if (!promptFile.header) {
      return;
    }
    const toolsAttr = promptFile.header.getAttribute(PromptHeaderAttributes.tools);
    if (!toolsAttr || !toolsAttr.value.range.containsRange(range)) {
      return;
    }
    const target = getTarget(promptType, promptFile.header);
    if (!isVSCodeOrDefaultTarget(target)) {
      return;
    }
    let value = toolsAttr.value;
    if (value.type === "scalar") {
      value = parseCommaSeparatedList(value);
    }
    if (value.type !== "sequence") {
      return;
    }
    const values = value.items;
    const deprecatedNames = new Lazy(() => this.languageModelToolsService.getDeprecatedFullReferenceNames());
    const edits = [];
    for (const item of values) {
      if (item.type !== "scalar") {
        continue;
      }
      const newNames = deprecatedNames.value.get(item.value);
      if (newNames && newNames.size > 0) {
        const quote = model.getValueInRange(new Range(item.range.startLineNumber, item.range.startColumn, item.range.endLineNumber, item.range.startColumn + 1));
        if (newNames.size === 1) {
          const newName = Array.from(newNames)[0];
          const text = quote === `'` || quote === '"' ? quote + newName + quote : newName;
          const edit = { range: item.range, text };
          edits.push(edit);
          if (item.range.containsRange(range)) {
            result.push(this.createCodeAction(
              model,
              item.range,
              localize("updateToolName", "Update to '{0}'", newName),
              [asWorkspaceTextEdit(model, edit)]
            ));
          }
        } else {
          const newNamesArray = Array.from(newNames).sort((a, b) => a.localeCompare(b));
          const separator = model.getValueInRange(new Range(item.range.startLineNumber, item.range.endColumn, item.range.endLineNumber, item.range.endColumn + 2));
          const useCommaSpace = separator.includes(",");
          const delimiterText = useCommaSpace ? ", " : ",";
          const newNamesText = newNamesArray.map(
            (name) => quote === `'` || quote === '"' ? quote + name + quote : name
          ).join(delimiterText);
          const edit = { range: item.range, text: newNamesText };
          edits.push(edit);
          if (item.range.containsRange(range)) {
            result.push(this.createCodeAction(
              model,
              item.range,
              localize("expandToolNames", "Expand to {0} tools", newNames.size),
              [asWorkspaceTextEdit(model, edit)]
            ));
          }
        }
      }
    }
    if (edits.length && result.length === 0 || edits.length > 1) {
      result.push(
        this.createCodeAction(
          model,
          value.range,
          localize("updateAllToolNames", "Update all tool names"),
          edits.map((edit) => asWorkspaceTextEdit(model, edit))
        )
      );
    }
  }
};
PromptCodeActionProvider = __decorateClass([
  __decorateParam(0, IPromptsService),
  __decorateParam(1, ILanguageModelToolsService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IMarkerService)
], PromptCodeActionProvider);
function asWorkspaceTextEdit(model, textEdit) {
  return {
    versionId: model.getVersionId(),
    resource: model.uri,
    textEdit
  };
}
export {
  PromptCodeActionProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRDb2RlQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb24sIENvZGVBY3Rpb25Db250ZXh0LCBDb2RlQWN0aW9uTGlzdCwgQ29kZUFjdGlvblByb3ZpZGVyLCBJV29ya3NwYWNlRmlsZUVkaXQsIElXb3Jrc3BhY2VUZXh0RWRpdCwgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0UHJvbXB0c1R5cGVGb3JMYW5ndWFnZUlkLCBQcm9tcHRzVHlwZSB9IGZyb20gJy4uL3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgcGFyc2VDb21tYVNlcGFyYXRlZExpc3QsIFBhcnNlZFByb21wdEZpbGUsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMgfSBmcm9tICcuLi9wcm9tcHRGaWxlUGFyc2VyLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgTEVHQUNZX01PREVfRklMRV9FWFRFTlNJT04gfSBmcm9tICcuLi9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgTUFSS0VSU19PV05FUl9JRCwgUHJvbXB0VmFsaWRhdG9yTWFya2VyQ29kZSB9IGZyb20gJy4vcHJvbXB0VmFsaWRhdG9yLmpzJztcbmltcG9ydCB7IElNYXJrZXJEYXRhLCBJTWFya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvbktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBnZXRUYXJnZXQsIGlzVlNDb2RlT3JEZWZhdWx0VGFyZ2V0IH0gZnJvbSAnLi9wcm9tcHRGaWxlQXR0cmlidXRlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBQcm9tcHRDb2RlQWN0aW9uUHJvdmlkZXIgaW1wbGVtZW50cyBDb2RlQWN0aW9uUHJvdmlkZXIge1xuXHQvKipcblx0ICogRGVidWcgZGlzcGxheSBuYW1lIGZvciB0aGlzIHByb3ZpZGVyLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IF9kZWJ1Z0Rpc3BsYXlOYW1lOiBzdHJpbmcgPSAnUHJvbXB0Q29kZUFjdGlvblByb3ZpZGVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb21wdHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlQ29kZUFjdGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBSYW5nZSB8IFNlbGVjdGlvbiwgY29udGV4dDogQ29kZUFjdGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Q29kZUFjdGlvbkxpc3QgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm9tcHRUeXBlID0gZ2V0UHJvbXB0c1R5cGVGb3JMYW5ndWFnZUlkKG1vZGVsLmdldExhbmd1YWdlSWQoKSk7XG5cdFx0aWYgKCFwcm9tcHRUeXBlIHx8IHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucykge1xuXHRcdFx0Ly8gaWYgdGhlIG1vZGVsIGlzIG5vdCBhIHByb21wdCwgd2UgZG9uJ3QgcHJvdmlkZSBhbnkgY29kZSBhY3Rpb25zXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogQ29kZUFjdGlvbltdID0gW107XG5cblx0XHRjb25zdCBwcm9tcHRBU1QgPSB0aGlzLnByb21wdHNTZXJ2aWNlLmdldFBhcnNlZFByb21wdEZpbGUobW9kZWwpO1xuXHRcdHN3aXRjaCAocHJvbXB0VHlwZSkge1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5hZ2VudDpcblx0XHRcdFx0dGhpcy5nZXRVcGRhdGVUb29sc0NvZGVBY3Rpb25zKHByb21wdEFTVCwgcHJvbXB0VHlwZSwgbW9kZWwsIHJhbmdlLCByZXN1bHQpO1xuXHRcdFx0XHR0aGlzLmdldEVuYWJsZU1jcFNlcnZlckNvZGVBY3Rpb25zKG1vZGVsLCByYW5nZSwgcmVzdWx0KTtcblx0XHRcdFx0YXdhaXQgdGhpcy5nZXRNaWdyYXRlTW9kZUZpbGVDb2RlQWN0aW9ucyhtb2RlbCwgcmVzdWx0KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnByb21wdDpcblx0XHRcdFx0dGhpcy5nZXRVcGRhdGVNb2RlQ29kZUFjdGlvbnMocHJvbXB0QVNULCBtb2RlbCwgcmFuZ2UsIHJlc3VsdCk7XG5cdFx0XHRcdHRoaXMuZ2V0VXBkYXRlVG9vbHNDb2RlQWN0aW9ucyhwcm9tcHRBU1QsIHByb21wdFR5cGUsIG1vZGVsLCByYW5nZSwgcmVzdWx0KTtcblx0XHRcdFx0dGhpcy5nZXRFbmFibGVNY3BTZXJ2ZXJDb2RlQWN0aW9ucyhtb2RlbCwgcmFuZ2UsIHJlc3VsdCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmIChyZXN1bHQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0YWN0aW9uczogcmVzdWx0LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblxuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYXJrZXJzKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UpOiBJTWFya2VyRGF0YVtdIHtcblx0XHRjb25zdCBtYXJrZXJzID0gdGhpcy5tYXJrZXJTZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogbW9kZWwudXJpLCBvd25lcjogTUFSS0VSU19PV05FUl9JRCB9KTtcblx0XHRyZXR1cm4gbWFya2Vycy5maWx0ZXIobWFya2VyID0+IHJhbmdlLmNvbnRhaW5zUmFuZ2UobWFya2VyKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvZGVBY3Rpb24obW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBSYW5nZSwgdGl0bGU6IHN0cmluZywgZWRpdHM/OiBBcnJheTxJV29ya3NwYWNlVGV4dEVkaXQgfCBJV29ya3NwYWNlRmlsZUVkaXQ+LCBjb21tYW5kPzogeyBpZDogc3RyaW5nOyB0aXRsZTogc3RyaW5nOyBhcmd1bWVudHM/OiB1bmtub3duW10gfSk6IENvZGVBY3Rpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0aXRsZSxcblx0XHRcdC4uLihlZGl0cyA/IHsgZWRpdDogeyBlZGl0cyB9IH0gOiB7fSksXG5cdFx0XHQuLi4oY29tbWFuZCA/IHsgY29tbWFuZCB9IDoge30pLFxuXHRcdFx0cmFuZ2VzOiBbcmFuZ2VdLFxuXHRcdFx0ZGlhZ25vc3RpY3M6IHRoaXMuZ2V0TWFya2Vycyhtb2RlbCwgcmFuZ2UpLFxuXHRcdFx0a2luZDogQ29kZUFjdGlvbktpbmQuUXVpY2tGaXgudmFsdWVcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFbmFibGVNY3BTZXJ2ZXJDb2RlQWN0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlLCByZXN1bHQ6IENvZGVBY3Rpb25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IG1hcmtlcnNJblJhbmdlID0gdGhpcy5nZXRNYXJrZXJzSW5SYW5nZShtb2RlbCwgcmFuZ2UpO1xuXHRcdGZvciAoY29uc3QgbWFya2VyIG9mIG1hcmtlcnNJblJhbmdlKSB7XG5cdFx0XHRjb25zdCBtYXJrZXJDb2RlID0gdGhpcy5nZXRNYXJrZXJDb2RlKG1hcmtlcik7XG5cdFx0XHRpZiAobWFya2VyQ29kZSA9PT0gUHJvbXB0VmFsaWRhdG9yTWFya2VyQ29kZS5NaXNzaW5nR2l0aHViTWNwU2VydmVyKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuY3JlYXRlQ29kZUFjdGlvbihcblx0XHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnZW5hYmxlR2l0aHViTWNwU2VydmVyU2V0dGluZycsIFwiRW5hYmxlIEJ1aWx0LWluIEdpdEh1YiBNQ1AgU2VydmVyXCIpLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCB0aXRsZTogJycsIGFyZ3VtZW50czogWydAaWQ6Z2l0aHViLmNvcGlsb3QuY2hhdC5naXRodWJNY3BTZXJ2ZXIuZW5hYmxlZCddIH1cblx0XHRcdFx0KSk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuY3JlYXRlQ29kZUFjdGlvbihcblx0XHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnaW5zdGFsbEdpdGh1Yk1jcFNlcnZlcicsIFwiSW5zdGFsbCBHaXRIdWIgTUNQIFNlcnZlciBmcm9tIE1hcmtldHBsYWNlXCIpLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR7IGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuc2VhcmNoJywgdGl0bGU6ICcnLCBhcmd1bWVudHM6IFsnQG1jcCBnaXRodWInXSB9XG5cdFx0XHRcdCkpO1xuXHRcdFx0fSBlbHNlIGlmIChtYXJrZXJDb2RlID09PSBQcm9tcHRWYWxpZGF0b3JNYXJrZXJDb2RlLk1pc3NpbmdQbGF5d3JpZ2h0TWNwU2VydmVyKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuY3JlYXRlQ29kZUFjdGlvbihcblx0XHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnaW5zdGFsbFBsYXl3cmlnaHRNY3BTZXJ2ZXInLCBcIkluc3RhbGwgUGxheXdyaWdodCBNQ1AgU2VydmVyIGZyb20gTWFya2V0cGxhY2VcIiksXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHsgaWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5zZWFyY2gnLCB0aXRsZTogJycsIGFyZ3VtZW50czogWydAbWNwIHBsYXl3cmlnaHQnXSB9XG5cdFx0XHRcdCkpO1xuXHRcdFx0fSBlbHNlIGlmIChtYXJrZXJDb2RlID09PSBQcm9tcHRWYWxpZGF0b3JNYXJrZXJDb2RlLlVua25vd25FeHRlbnNpb25SZWZlcmVuY2UpIHtcblx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShtYXJrZXIuc3RhcnRMaW5lTnVtYmVyLCBtYXJrZXIuc3RhcnRDb2x1bW4sIG1hcmtlci5lbmRMaW5lTnVtYmVyLCBtYXJrZXIuZW5kQ29sdW1uKSkudHJpbSgpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IHJlZmVyZW5jZS5zcGxpdCgnLycpWzBdLnJlcGxhY2UoL15bJ1wiXXxbJ1wiXSQvZywgJycpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uSWQpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh0aGlzLmNyZWF0ZUNvZGVBY3Rpb24oXG5cdFx0XHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3NlYXJjaEV4dGVuc2lvbk1hcmtldHBsYWNlJywgXCJTZWFyY2ggTWFya2V0cGxhY2UgZm9yIEV4dGVuc2lvbiAnezB9J1wiLCBleHRlbnNpb25JZCksXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR7IGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuc2VhcmNoJywgdGl0bGU6ICcnLCBhcmd1bWVudHM6IFtgQGlkOiR7ZXh0ZW5zaW9uSWR9YF0gfVxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKG1hcmtlckNvZGUgPT09IFByb21wdFZhbGlkYXRvck1hcmtlckNvZGUuVW5rbm93bk1jcFNlcnZlclJlZmVyZW5jZSkge1xuXHRcdFx0XHRjb25zdCByZWZlcmVuY2UgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKG1hcmtlci5zdGFydExpbmVOdW1iZXIsIG1hcmtlci5zdGFydENvbHVtbiwgbWFya2VyLmVuZExpbmVOdW1iZXIsIG1hcmtlci5lbmRDb2x1bW4pKS50cmltKCk7XG5cdFx0XHRcdGNvbnN0IHNlcnZlcklkID0gcmVmZXJlbmNlLnJlcGxhY2UoL15bJ1wiXXxbJ1wiXSQvZywgJycpO1xuXHRcdFx0XHRpZiAoc2VydmVySWQpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh0aGlzLmNyZWF0ZUNvZGVBY3Rpb24oXG5cdFx0XHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3NlYXJjaE1jcFNlcnZlck1hcmtldHBsYWNlJywgXCJTZWFyY2ggTWFya2V0cGxhY2UgZm9yIE1DUCBTZXJ2ZXIgJ3swfSdcIiwgc2VydmVySWQpLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0eyBpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLnNlYXJjaCcsIHRpdGxlOiAnJywgYXJndW1lbnRzOiBbYEBtY3AgJHtzZXJ2ZXJJZH1gXSB9XG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJlZmVyZW5jZSA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UobWFya2VyLnN0YXJ0TGluZU51bWJlciwgbWFya2VyLnN0YXJ0Q29sdW1uLCBtYXJrZXIuZW5kTGluZU51bWJlciwgbWFya2VyLmVuZENvbHVtbikpLnRyaW0oKTtcblx0XHRcdFx0aWYgKHJlZmVyZW5jZSkge1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gcmVmZXJlbmNlLnNwbGl0KCcvJylbMF0ucmVwbGFjZSgvXlsnXCJdfFsnXCJdJC9nLCAnJyk7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2godGhpcy5jcmVhdGVDb2RlQWN0aW9uKFxuXHRcdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdzZWFyY2hFeHRlbnNpb25NYXJrZXRwbGFjZUdlbmVyaWMnLCBcIlNlYXJjaCBNYXJrZXRwbGFjZSBmb3IgRXh0ZW5zaW9uICd7MH0nXCIsIGV4dGVuc2lvbklkKSxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHsgaWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5zZWFyY2gnLCB0aXRsZTogJycsIGFyZ3VtZW50czogW2BAaWQ6JHtleHRlbnNpb25JZH1gXSB9XG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0Y29uc3Qgc2VydmVySWQgPSByZWZlcmVuY2UucmVwbGFjZSgvXlsnXCJdfFsnXCJdJC9nLCAnJyk7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2godGhpcy5jcmVhdGVDb2RlQWN0aW9uKFxuXHRcdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdzZWFyY2hNY3BTZXJ2ZXJNYXJrZXRwbGFjZUdlbmVyaWMnLCBcIlNlYXJjaCBNYXJrZXRwbGFjZSBmb3IgTUNQIFNlcnZlciAnezB9J1wiLCBzZXJ2ZXJJZCksXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR7IGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuc2VhcmNoJywgdGl0bGU6ICcnLCBhcmd1bWVudHM6IFtgQG1jcCAke3NlcnZlcklkfWBdIH1cblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0TWFya2VyQ29kZShtYXJrZXI6IElNYXJrZXJEYXRhKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIW1hcmtlci5jb2RlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdHlwZW9mIG1hcmtlci5jb2RlID09PSAnc3RyaW5nJyA/IG1hcmtlci5jb2RlIDogbWFya2VyLmNvZGUudmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIGdldE1hcmtlcnNJblJhbmdlKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UpOiBJTWFya2VyRGF0YVtdIHtcblx0XHRjb25zdCBtYXJrZXJzID0gdGhpcy5tYXJrZXJTZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogbW9kZWwudXJpLCBvd25lcjogTUFSS0VSU19PV05FUl9JRCB9KTtcblx0XHRyZXR1cm4gbWFya2Vycy5maWx0ZXIobWFya2VyID0+IHtcblx0XHRcdGNvbnN0IG1hcmtlclJhbmdlID0gbmV3IFJhbmdlKG1hcmtlci5zdGFydExpbmVOdW1iZXIsIG1hcmtlci5zdGFydENvbHVtbiwgbWFya2VyLmVuZExpbmVOdW1iZXIsIG1hcmtlci5lbmRDb2x1bW4pO1xuXHRcdFx0cmV0dXJuIG1hcmtlclJhbmdlLmludGVyc2VjdFJhbmdlcyhyYW5nZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFVwZGF0ZU1vZGVDb2RlQWN0aW9ucyhwcm9tcHRGaWxlOiBQYXJzZWRQcm9tcHRGaWxlLCBtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlLCByZXN1bHQ6IENvZGVBY3Rpb25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVBdHRyID0gcHJvbXB0RmlsZS5oZWFkZXI/LmdldEF0dHJpYnV0ZShQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGUpO1xuXHRcdGlmICghbW9kZUF0dHI/LnJhbmdlLmNvbnRhaW5zUmFuZ2UocmFuZ2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGtleVJhbmdlID0gbmV3IFJhbmdlKG1vZGVBdHRyLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgbW9kZUF0dHIucmFuZ2Uuc3RhcnRDb2x1bW4sIG1vZGVBdHRyLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgbW9kZUF0dHIucmFuZ2Uuc3RhcnRDb2x1bW4gKyBtb2RlQXR0ci5rZXkubGVuZ3RoKTtcblx0XHRyZXN1bHQucHVzaCh0aGlzLmNyZWF0ZUNvZGVBY3Rpb24obW9kZWwsIGtleVJhbmdlLFxuXHRcdFx0bG9jYWxpemUoJ3JlbmFtZVRvQWdlbnQnLCBcIlJlbmFtZSB0byAnYWdlbnQnXCIpLFxuXHRcdFx0W2FzV29ya3NwYWNlVGV4dEVkaXQobW9kZWwsIHsgcmFuZ2U6IGtleVJhbmdlLCB0ZXh0OiAnYWdlbnQnIH0pXVxuXHRcdCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRNaWdyYXRlTW9kZUZpbGVDb2RlQWN0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgcmVzdWx0OiBDb2RlQWN0aW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAobW9kZWwudXJpLnBhdGguZW5kc1dpdGgoTEVHQUNZX01PREVfRklMRV9FWFRFTlNJT04pKSB7XG5cdFx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMucHJvbXB0c1NlcnZpY2UuZ2V0QWdlbnRGaWxlVVJJRnJvbU1vZGVGaWxlKG1vZGVsLnVyaSk7XG5cdFx0XHRpZiAobG9jYXRpb24gJiYgYXdhaXQgdGhpcy5maWxlU2VydmljZS5jYW5Nb3ZlKG1vZGVsLnVyaSwgbG9jYXRpb24pKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXQ6IElXb3Jrc3BhY2VGaWxlRWRpdCA9IHsgb2xkUmVzb3VyY2U6IG1vZGVsLnVyaSwgbmV3UmVzb3VyY2U6IGxvY2F0aW9uLCBvcHRpb25zOiB7IG92ZXJ3cml0ZTogZmFsc2UsIGNvcHk6IGZhbHNlIH0gfTtcblx0XHRcdFx0cmVzdWx0LnB1c2godGhpcy5jcmVhdGVDb2RlQWN0aW9uKG1vZGVsLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNCksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ21pZ3JhdGVUb0FnZW50JywgXCJNaWdyYXRlIHRvIGN1c3RvbSBhZ2VudCBmaWxlXCIpLFxuXHRcdFx0XHRcdFtlZGl0XVxuXHRcdFx0XHQpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFVwZGF0ZVRvb2xzQ29kZUFjdGlvbnMocHJvbXB0RmlsZTogUGFyc2VkUHJvbXB0RmlsZSwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UsIHJlc3VsdDogQ29kZUFjdGlvbltdKTogdm9pZCB7XG5cdFx0aWYgKCFwcm9tcHRGaWxlLmhlYWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0b29sc0F0dHIgPSBwcm9tcHRGaWxlLmhlYWRlci5nZXRBdHRyaWJ1dGUoUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50b29scyk7XG5cdFx0aWYgKCF0b29sc0F0dHIgfHwgIXRvb2xzQXR0ci52YWx1ZS5yYW5nZS5jb250YWluc1JhbmdlKHJhbmdlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0YXJnZXQgPSBnZXRUYXJnZXQocHJvbXB0VHlwZSwgcHJvbXB0RmlsZS5oZWFkZXIpO1xuXHRcdGlmICghaXNWU0NvZGVPckRlZmF1bHRUYXJnZXQodGFyZ2V0KSkge1xuXHRcdFx0Ly8gR2l0SHViIENvcGlsb3QgYW5kIENsYXVkZSBjdXN0b20gYWdlbnRzIHVzZSBhIGZpeGVkIHNldCBvZiB0b29sIG5hbWVzIHRoYXQgYXJlIG5vdCBkZXByZWNhdGVkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCB2YWx1ZSA9IHRvb2xzQXR0ci52YWx1ZTtcblx0XHRpZiAodmFsdWUudHlwZSA9PT0gJ3NjYWxhcicpIHtcblx0XHRcdHZhbHVlID0gcGFyc2VDb21tYVNlcGFyYXRlZExpc3QodmFsdWUpO1xuXHRcdH1cblx0XHRpZiAodmFsdWUudHlwZSAhPT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZXMgPSB2YWx1ZS5pdGVtcztcblx0XHRjb25zdCBkZXByZWNhdGVkTmFtZXMgPSBuZXcgTGF6eSgoKSA9PiB0aGlzLmxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2V0RGVwcmVjYXRlZEZ1bGxSZWZlcmVuY2VOYW1lcygpKTtcblx0XHRjb25zdCBlZGl0czogVGV4dEVkaXRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiB2YWx1ZXMpIHtcblx0XHRcdGlmIChpdGVtLnR5cGUgIT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmV3TmFtZXMgPSBkZXByZWNhdGVkTmFtZXMudmFsdWUuZ2V0KGl0ZW0udmFsdWUpO1xuXHRcdFx0aWYgKG5ld05hbWVzICYmIG5ld05hbWVzLnNpemUgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHF1b3RlID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShpdGVtLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgaXRlbS5yYW5nZS5zdGFydENvbHVtbiwgaXRlbS5yYW5nZS5lbmRMaW5lTnVtYmVyLCBpdGVtLnJhbmdlLnN0YXJ0Q29sdW1uICsgMSkpO1xuXG5cdFx0XHRcdGlmIChuZXdOYW1lcy5zaXplID09PSAxKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV3TmFtZSA9IEFycmF5LmZyb20obmV3TmFtZXMpWzBdO1xuXHRcdFx0XHRcdGNvbnN0IHRleHQgPSAocXVvdGUgPT09IGAnYCB8fCBxdW90ZSA9PT0gJ1wiJykgPyAocXVvdGUgKyBuZXdOYW1lICsgcXVvdGUpIDogbmV3TmFtZTtcblx0XHRcdFx0XHRjb25zdCBlZGl0ID0geyByYW5nZTogaXRlbS5yYW5nZSwgdGV4dCB9O1xuXHRcdFx0XHRcdGVkaXRzLnB1c2goZWRpdCk7XG5cblx0XHRcdFx0XHRpZiAoaXRlbS5yYW5nZS5jb250YWluc1JhbmdlKHJhbmdlKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2godGhpcy5jcmVhdGVDb2RlQWN0aW9uKG1vZGVsLCBpdGVtLnJhbmdlLFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgndXBkYXRlVG9vbE5hbWUnLCBcIlVwZGF0ZSB0byAnezB9J1wiLCBuZXdOYW1lKSxcblx0XHRcdFx0XHRcdFx0W2FzV29ya3NwYWNlVGV4dEVkaXQobW9kZWwsIGVkaXQpXVxuXHRcdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIE11bHRpcGxlIG5ldyBuYW1lcyAtIGV4cGFuZCB0byBpbmNsdWRlIGFsbCBvZiB0aGVtXG5cdFx0XHRcdFx0Y29uc3QgbmV3TmFtZXNBcnJheSA9IEFycmF5LmZyb20obmV3TmFtZXMpLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cdFx0XHRcdFx0Y29uc3Qgc2VwYXJhdG9yID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShpdGVtLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgaXRlbS5yYW5nZS5lbmRDb2x1bW4sIGl0ZW0ucmFuZ2UuZW5kTGluZU51bWJlciwgaXRlbS5yYW5nZS5lbmRDb2x1bW4gKyAyKSk7XG5cdFx0XHRcdFx0Y29uc3QgdXNlQ29tbWFTcGFjZSA9IHNlcGFyYXRvci5pbmNsdWRlcygnLCcpO1xuXHRcdFx0XHRcdGNvbnN0IGRlbGltaXRlclRleHQgPSB1c2VDb21tYVNwYWNlID8gJywgJyA6ICcsJztcblxuXHRcdFx0XHRcdGNvbnN0IG5ld05hbWVzVGV4dCA9IG5ld05hbWVzQXJyYXkubWFwKG5hbWUgPT5cblx0XHRcdFx0XHRcdChxdW90ZSA9PT0gYCdgIHx8IHF1b3RlID09PSAnXCInKSA/IChxdW90ZSArIG5hbWUgKyBxdW90ZSkgOiBuYW1lXG5cdFx0XHRcdFx0KS5qb2luKGRlbGltaXRlclRleHQpO1xuXG5cdFx0XHRcdFx0Y29uc3QgZWRpdCA9IHsgcmFuZ2U6IGl0ZW0ucmFuZ2UsIHRleHQ6IG5ld05hbWVzVGV4dCB9O1xuXHRcdFx0XHRcdGVkaXRzLnB1c2goZWRpdCk7XG5cblx0XHRcdFx0XHRpZiAoaXRlbS5yYW5nZS5jb250YWluc1JhbmdlKHJhbmdlKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2godGhpcy5jcmVhdGVDb2RlQWN0aW9uKG1vZGVsLCBpdGVtLnJhbmdlLFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnZXhwYW5kVG9vbE5hbWVzJywgXCJFeHBhbmQgdG8gezB9IHRvb2xzXCIsIG5ld05hbWVzLnNpemUpLFxuXHRcdFx0XHRcdFx0XHRbYXNXb3Jrc3BhY2VUZXh0RWRpdChtb2RlbCwgZWRpdCldXG5cdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZWRpdHMubGVuZ3RoICYmIHJlc3VsdC5sZW5ndGggPT09IDAgfHwgZWRpdHMubGVuZ3RoID4gMSkge1xuXHRcdFx0cmVzdWx0LnB1c2goXG5cdFx0XHRcdHRoaXMuY3JlYXRlQ29kZUFjdGlvbihtb2RlbCwgdmFsdWUucmFuZ2UsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3VwZGF0ZUFsbFRvb2xOYW1lcycsIFwiVXBkYXRlIGFsbCB0b29sIG5hbWVzXCIpLFxuXHRcdFx0XHRcdGVkaXRzLm1hcChlZGl0ID0+IGFzV29ya3NwYWNlVGV4dEVkaXQobW9kZWwsIGVkaXQpKVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxufVxuZnVuY3Rpb24gYXNXb3Jrc3BhY2VUZXh0RWRpdChtb2RlbDogSVRleHRNb2RlbCwgdGV4dEVkaXQ6IFRleHRFZGl0KTogSVdvcmtzcGFjZVRleHRFZGl0IHtcblx0cmV0dXJuIHtcblx0XHR2ZXJzaW9uSWQ6IG1vZGVsLmdldFZlcnNpb25JZCgpLFxuXHRcdHJlc291cmNlOiBtb2RlbC51cmksXG5cdFx0dGV4dEVkaXRcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxhQUFhO0FBR3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsNkJBQTZCLG1CQUFtQjtBQUN6RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUEyQyw4QkFBOEI7QUFFbEYsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsa0JBQWtCLGlDQUFpQztBQUM1RCxTQUFzQixzQkFBc0I7QUFDNUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUFXLCtCQUErQjtBQUU1QyxJQUFNLDJCQUFOLE1BQTZEO0FBQUEsRUFNbkUsWUFDbUMsZ0JBQ1csMkJBQ2QsYUFDRSxlQUNoQztBQUppQztBQUNXO0FBQ2Q7QUFDRTtBQU5sQztBQUFBO0FBQUE7QUFBQSxTQUFnQixvQkFBNEI7QUFBQSxFQVE1QztBQUFBLEVBRUEsTUFBTSxtQkFBbUIsT0FBbUIsT0FBMEIsU0FBNEIsT0FBK0Q7QUFDaEssVUFBTSxhQUFhLDRCQUE0QixNQUFNLGNBQWMsQ0FBQztBQUNwRSxRQUFJLENBQUMsY0FBYyxlQUFlLFlBQVksY0FBYztBQUUzRCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sU0FBdUIsQ0FBQztBQUU5QixVQUFNLFlBQVksS0FBSyxlQUFlLG9CQUFvQixLQUFLO0FBQy9ELFlBQVEsWUFBWTtBQUFBLE1BQ25CLEtBQUssWUFBWTtBQUNoQixhQUFLLDBCQUEwQixXQUFXLFlB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
