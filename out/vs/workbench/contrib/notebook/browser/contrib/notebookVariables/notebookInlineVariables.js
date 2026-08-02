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
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { onUnexpectedExternalError } from "../../../../../../base/common/errors.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { format } from "../../../../../../base/common/strings.js";
import { Position } from "../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { StandardTokenType } from "../../../../../../editor/common/encodedTokenAttributes.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { localize } from "../../../../../../nls.js";
import { registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { createInlineValueDecoration } from "../../../../debug/browser/debugEditorContribution.js";
import { IDebugService, State } from "../../../../debug/common/debug.js";
import { NotebookSetting } from "../../../common/notebookCommon.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../../common/notebookExecutionStateService.js";
import { INotebookKernelService } from "../../../common/notebookKernelService.js";
import { NotebookAction } from "../../controller/coreActions.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
class InlineSegment {
  constructor(column, text) {
    this.column = column;
    this.text = text;
  }
}
let NotebookInlineVariablesController = class extends Disposable {
  // Skip extremely large cells
  constructor(notebookEditor, notebookKernelService, notebookExecutionStateService, languageFeaturesService, configurationService, debugService) {
    super();
    this.notebookEditor = notebookEditor;
    this.notebookKernelService = notebookKernelService;
    this.notebookExecutionStateService = notebookExecutionStateService;
    this.languageFeaturesService = languageFeaturesService;
    this.configurationService = configurationService;
    this.debugService = debugService;
    this.cellDecorationIds = /* @__PURE__ */ new Map();
    this.cellContentListeners = new ResourceMap();
    this.currentCancellationTokenSources = new ResourceMap();
    this._register(this.notebookExecutionStateService.onDidChangeExecution(async (e) => {
      const inlineValuesSetting = this.configurationService.getValue(NotebookSetting.notebookInlineValues);
      if (inlineValuesSetting === "off") {
        return;
      }
      if (e.type === NotebookExecutionType.cell) {
        await this.updateInlineVariables(e);
      }
    }));
    this._register(Event.runAndSubscribe(this.configurationService.onDidChangeConfiguration, (e) => {
      if (!e || e.affectsConfiguration(NotebookSetting.notebookInlineValues)) {
        if (this.configurationService.getValue(NotebookSetting.notebookInlineValues) === "off") {
          this.clearNotebookInlineDecorations();
        }
      }
    }));
  }
  async updateInlineVariables(event) {
    if (event.changed) {
      return;
    }
    const cell = this.notebookEditor.getCellByHandle(event.cellHandle);
    if (!cell) {
      return;
    }
    const existingSource = this.currentCancellationTokenSources.get(cell.uri);
    if (existingSource) {
      existingSource.cancel();
    }
    this.currentCancellationTokenSources.set(cell.uri, new CancellationTokenSource());
    const token = this.currentCancellationTokenSources.get(cell.uri).token;
    if (this.debugService.state !== State.Inactive) {
      this._clearNotebookInlineDecorations();
      return;
    }
    if (!this.notebookEditor.textModel?.uri || !isEqual(this.notebookEditor.textModel.uri, event.notebook)) {
      return;
    }
    const model = await cell.resolveTextModel();
    if (!model) {
      return;
    }
    const inlineValuesSetting = this.configurationService.getValue(NotebookSetting.notebookInlineValues);
    const hasInlineValueProvider = this.languageFeaturesService.inlineValuesProvider.has(model);
    if (inlineValuesSetting === "off" || inlineValuesSetting === "auto" && !hasInlineValueProvider) {
      return;
    }
    this.clearCellInlineDecorations(cell);
    const inlineDecorations = [];
    if (hasInlineValueProvider) {
      const lastLine = model.getLineCount();
      const lastColumn = model.getLineMaxColumn(lastLine);
      const ctx = {
        frameId: 0,
        // ignored, we won't have a stack from since not in a debug session
        stoppedLocation: new Range(lastLine, lastColumn, lastLine, lastColumn)
        // executing cell by cell, so "stopped" location would just be the end of document
      };
      const providers = this.languageFeaturesService.inlineValuesProvider.ordered(model).reverse();
      const lineDecorations = /* @__PURE__ */ new Map();
      const fullCellRange = new Range(1, 1, lastLine, lastColumn);
      const promises = providers.flatMap((provider) => Promise.resolve(provider.provideInlineValues(model, fullCellRange, ctx, token)).then(async (result) => {
        if (!result) {
          return;
        }
        const notebook = this.notebookEditor.textModel;
        if (!notebook) {
          return;
        }
        const kernel = this.notebookKernelService.getMatchingKernel(notebook);
        const kernelVars = [];
        if (result.some((iv) => iv.type === "variable")) {
          if (!this.notebookEditor.hasModel()) {
            return;
          }
          const variables = kernel.selected?.provideVariables(event.notebook, void 0, "named", 0, token);
          if (variables) {
            for await (const v of variables) {
              kernelVars.push(v);
            }
          }
        }
        for (const iv of result) {
          let text = void 0;
          switch (iv.type) {
            case "text":
              text = iv.text;
              break;
            case "variable": {
              const name = iv.variableName;
              if (!name) {
                continue;
              }
              const value = kernelVars.find((v) => v.name === name)?.value;
              if (!value) {
                continue;
              }
              text = format("{0} = {1}", name, value);
              break;
            }
            case "expression": {
              continue;
            }
          }
          if (text) {
            const line = iv.range.startLineNumber;
            let lineSegments = lineDecorations.get(line);
            if (!lineSegments) {
              lineSegments = [];
              lineDecorations.set(line, lineSegments);
            }
            if (!lineSegments.some((iv2) => iv2.text === text)) {
              lineSegments.push(new InlineSegment(iv.range.startColumn, text));
            }
          }
        }
      }, (err) => {
        onUnexpectedExternalError(err);
      }));
      await Promise.all(promises);
      lineDecorations.forEach((segments, line) => {
        if (segments.length > 0) {
          segments.sort((a, b) => a.column - b.column);
          const text = segments.map((s) => s.text).join(", ");
          const editorWidth = cell.layoutInfo.editorWidth;
          const fontInfo = cell.layoutInfo.fontInfo;
          if (fontInfo && cell.textModel) {
            const base = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
            const lineLength = cell.textModel.getLineLength(line);
            const available = Math.max(0, base - lineLength);
            inlineDecorations.push(...createInlineValueDecoration(line, text, "nb", void 0, available));
          } else {
            inlineDecorations.push(...createInlineValueDecoration(line, text, "nb"));
          }
        }
      });
    } else if (inlineValuesSetting === "on") {
      if (!this.notebookEditor.hasModel()) {
        return;
      }
      const kernel = this.notebookKernelService.getMatchingKernel(this.notebookEditor.textModel);
      const variables = kernel?.selected?.provideVariables(event.notebook, void 0, "named", 0, token);
      if (!variables) {
        return;
      }
      const vars = [];
      for await (const v of variables) {
        vars.push(v);
      }
      const varNames = vars.map((v) => v.name);
      const document = cell.textModel;
      if (!document) {
        return;
      }
      if (document.getLineCount() > NotebookInlineVariablesController.MAX_CELL_LINES) {
        return;
      }
      const processedVars = /* @__PURE__ */ new Set();
      const functionRanges = this.getFunctionRanges(document);
      const commentedRanges = this.getCommentedRanges(document);
      const ignoredRanges = [...functionRanges, ...commentedRanges];
      const lineDecorations = /* @__PURE__ */ new Map();
      for (const varName of varNames) {
        if (processedVars.has(varName)) {
          continue;
        }
        const regex = new RegExp(`\\b${varName}\\b(?!\\w)`, "g");
        let lastMatchOutsideIgnored = null;
        let foundMatch = false;
        const lines = document.getValue().split("\n");
        for (let lineNumber = lines.length - 1; lineNumber >= 0; lineNumber--) {
          const line = lines[lineNumber];
          let match;
          while ((match = regex.exec(line)) !== null) {
            const startIndex = match.index;
            const pos = new Position(lineNumber + 1, startIndex + 1);
            if (!this.isPositionInRanges(pos, ignoredRanges)) {
              lastMatchOutsideIgnored = {
                line: lineNumber + 1,
                column: startIndex + 1
              };
              foundMatch = true;
              break;
            }
          }
          if (foundMatch) {
            break;
          }
        }
        if (lastMatchOutsideIgnored) {
          const inlineVal = varName + " = " + vars.find((v) => v.name === varName)?.value;
          let lineSegments = lineDecorations.get(lastMatchOutsideIgnored.line);
          if (!lineSegments) {
            lineSegments = [];
            lineDecorations.set(lastMatchOutsideIgnored.line, lineSegments);
          }
          if (!lineSegments.some((iv) => iv.text === inlineVal)) {
            lineSegments.push(new InlineSegment(lastMatchOutsideIgnored.column, inlineVal));
          }
        }
        processedVars.add(varName);
      }
      lineDecorations.forEach((segments, line) => {
        if (segments.length > 0) {
          segments.sort((a, b) => a.column - b.column);
          const text = segments.map((s) => s.text).join(", ");
          const editorWidth = cell.layoutInfo.editorWidth;
          const fontInfo = cell.layoutInfo.fontInfo;
          if (fontInfo && cell.textModel) {
            const base = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
            const lineLength = cell.textModel.getLineLength(line);
            const available = Math.max(0, base - lineLength);
            inlineDecorations.push(...createInlineValueDecoration(line, text, "nb", void 0, available));
          } else {
            inlineDecorations.push(...createInlineValueDecoration(line, text, "nb"));
          }
        }
      });
    }
    if (inlineDecorations.length > 0) {
      this.updateCellInlineDecorations(cell, inlineDecorations);
      this.initCellContentListener(cell);
    }
  }
  getFunctionRanges(document) {
    return document.getLanguageId() === "python" ? this.getPythonFunctionRanges(document.getValue()) : this.getBracedFunctionRanges(document.getValue());
  }
  getPythonFunctionRanges(code) {
    const functionRanges = [];
    const lines = code.split("\n");
    let functionStartLine = -1;
    let inFunction = false;
    let pythonIndentLevel = -1;
    const pythonFunctionDeclRegex = /^(\s*)(async\s+)?(?:def\s+\w+|class\s+\w+)\s*\([^)]*\)\s*:/;
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];
      const pythonMatch = line.match(pythonFunctionDeclRegex);
      if (pythonMatch) {
        if (inFunction) {
          const currentIndent = pythonMatch[1].length;
          if (currentIndent <= pythonIndentLevel) {
            functionRanges.push(new Range(functionStartLine + 1, 1, lineNumber, line.length + 1));
            inFunction = false;
          }
        }
        if (!inFunction) {
          inFunction = true;
          functionStartLine = lineNumber;
          pythonIndentLevel = pythonMatch[1].length;
        }
        continue;
      }
      if (inFunction) {
        if (line.trim() === "") {
          continue;
        }
        const currentIndent = line.match(/^\s*/)?.[0].length ?? 0;
        if (currentIndent <= pythonIndentLevel) {
          functionRanges.push(new Range(functionStartLine + 1, 1, lineNumber, line.length + 1));
          inFunction = false;
          pythonIndentLevel = -1;
        }
      }
    }
    if (inFunction) {
      functionRanges.push(new Range(functionStartLine + 1, 1, lines.length, lines[lines.length - 1].length + 1));
    }
    return functionRanges;
  }
  getBracedFunctionRanges(code) {
    const functionRanges = [];
    const lines = code.split("\n");
    let braceDepth = 0;
    let functionStartLine = -1;
    let inFunction = false;
    const functionDeclRegex = /\b(?:function\s+\w+|(?:async\s+)?(?:\w+\s*=\s*)?\([^)]*\)\s*=>|class\s+\w+|(?:public|private|protected|static)?\s*\w+\s*\([^)]*\)\s*{)/;
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];
      for (const char of line) {
        if (char === "{") {
          if (!inFunction && functionDeclRegex.test(line)) {
            inFunction = true;
            functionStartLine = lineNumber;
          }
          braceDepth++;
        } else if (char === "}") {
          braceDepth--;
          if (braceDepth === 0 && inFunction) {
            functionRanges.push(new Range(functionStartLine + 1, 1, lineNumber + 1, line.length + 1));
            inFunction = false;
          }
        }
      }
    }
    return functionRanges;
  }
  getCommentedRanges(document) {
    return this._getCommentedRanges(document);
  }
  _getCommentedRanges(document) {
    try {
      return this.getCommentedRangesByAccurateTokenization(document);
    } catch (e) {
      return this.getCommentedRangesByManualParsing(document);
    }
  }
  getCommentedRangesByAccurateTokenization(document) {
    const commentRanges = [];
    const lineCount = document.getLineCount();
    if (lineCount > NotebookInlineVariablesController.MAX_CELL_LINES) {
      return commentRanges;
    }
    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
      if (!document.tokenization.hasAccurateTokensForLine(lineNumber)) {
        document.tokenization.forceTokenization(lineNumber);
      }
      const lineTokens = document.tokenization.getLineTokens(lineNumber);
      if (lineTokens.getCount() === 0) {
        continue;
      }
      let startCharacter;
      for (let tokenIndex = 0; tokenIndex < lineTokens.getCount(); tokenIndex++) {
        const tokenType = lineTokens.getStandardTokenType(tokenIndex);
        if (tokenType === StandardTokenType.Comment || tokenType === StandardTokenType.String || tokenType === StandardTokenType.RegEx) {
          if (startCharacter === void 0) {
            startCharacter = lineTokens.getStartOffset(tokenIndex);
          }
          const endCharacter = lineTokens.getEndOffset(tokenIndex);
          const isLastToken = tokenIndex === lineTokens.getCount() - 1;
          const nextTokenDifferent = !isLastToken && lineTokens.getStandardTokenType(tokenIndex + 1) !== tokenType;
          if (isLastToken || nextTokenDifferent) {
            commentRanges.push(new Range(lineNumber, startCharacter + 1, lineNumber, endCharacter + 1));
            startCharacter = void 0;
          }
        } else {
          startCharacter = void 0;
        }
      }
    }
    return commentRanges;
  }
  getCommentedRangesByManualParsing(document) {
    const commentRanges = [];
    const lines = document.getValue().split("\n");
    const languageId = document.getLanguageId();
    const lineCommentToken = languageId === "python" ? "#" : languageId === "javascript" || languageId === "typescript" ? "//" : null;
    const blockComments = languageId === "javascript" || languageId === "typescript" ? { start: "/*", end: "*/" } : null;
    let inBlockComment = false;
    let blockCommentStartLine = -1;
    let blockCommentStartCol = -1;
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0) {
        continue;
      }
      if (blockComments) {
        if (!inBlockComment) {
          const startIndex = line.indexOf(blockComments.start);
          if (startIndex !== -1) {
            inBlockComment = true;
            blockCommentStartLine = lineNumber;
            blockCommentStartCol = startIndex;
          }
        }
        if (inBlockComment) {
          const endIndex = line.indexOf(blockComments.end);
          if (endIndex !== -1) {
            commentRanges.push(new Range(
              blockCommentStartLine + 1,
              blockCommentStartCol + 1,
              lineNumber + 1,
              endIndex + blockComments.end.length + 1
            ));
            inBlockComment = false;
          }
          continue;
        }
      }
      if (!inBlockComment && lineCommentToken && line.trimLeft().startsWith(lineCommentToken)) {
        const startCol = line.indexOf(lineCommentToken);
        commentRanges.push(new Range(
          lineNumber + 1,
          startCol + 1,
          lineNumber + 1,
          line.length + 1
        ));
      }
    }
    if (inBlockComment) {
      commentRanges.push(new Range(
        blockCommentStartLine + 1,
        blockCommentStartCol + 1,
        lines.length,
        lines[lines.length - 1].length + 1
      ));
    }
    return commentRanges;
  }
  isPositionInRanges(position, ranges) {
    return ranges.some((range) => range.containsPosition(position));
  }
  updateCellInlineDecorations(cell, decorations) {
    const oldDecorations = this.cellDecorationIds.get(cell) ?? [];
    this.cellDecorationIds.set(cell, cell.deltaModelDecorations(
      oldDecorations,
      decorations
    ));
  }
  initCellContentListener(cell) {
    const cellModel = cell.textModel;
    if (!cellModel) {
      return;
    }
    this.cellContentListeners.set(cell.uri, cellModel.onDidChangeContent(() => {
      this.clearCellInlineDecorations(cell);
    }));
  }
  clearCellInlineDecorations(cell) {
    const cellDecorations = this.cellDecorationIds.get(cell) ?? [];
    if (cellDecorations) {
      cell.deltaModelDecorations(cellDecorations, []);
      this.cellDecorationIds.delete(cell);
    }
    const listener = this.cellContentListeners.get(cell.uri);
    if (listener) {
      listener.dispose();
      this.cellContentListeners.delete(cell.uri);
    }
  }
  _clearNotebookInlineDecorations() {
    this.cellDecorationIds.forEach((_, cell) => {
      this.clearCellInlineDecorations(cell);
    });
  }
  clearNotebookInlineDecorations() {
    this._clearNotebookInlineDecorations();
  }
  dispose() {
    super.dispose();
    this._clearNotebookInlineDecorations();
    this.currentCancellationTokenSources.forEach((source) => source.cancel());
    this.currentCancellationTokenSources.clear();
    this.cellContentListeners.forEach((listener) => listener.dispose());
    this.cellContentListeners.clear();
  }
};
NotebookInlineVariablesController.id = "notebook.inlineVariablesController";
NotebookInlineVariablesController.MAX_CELL_LINES = 5e3;
NotebookInlineVariablesController = __decorateClass([
  __decorateParam(1, INotebookKernelService),
  __decorateParam(2, INotebookExecutionStateService),
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IDebugService)
], NotebookInlineVariablesController);
registerNotebookContribution(NotebookInlineVariablesController.id, NotebookInlineVariablesController);
registerAction2(class ClearNotebookInlineValues extends NotebookAction {
  constructor() {
    super({
      id: "notebook.clearAllInlineValues",
      title: localize("clearAllInlineValues", "Clear All Inline Values")
    });
  }
  runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    const controller = editor.getContribution(NotebookInlineVariablesController.id);
    controller.clearNotebookInlineDecorations();
    return Promise.resolve();
  }
});
export {
  NotebookInlineVariablesController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9ub3RlYm9va1ZhcmlhYmxlcy9ub3RlYm9va0lubGluZVZhcmlhYmxlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGZvcm1hdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRUb2tlblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgSW5saW5lVmFsdWVDb250ZXh0LCBJbmxpbmVWYWx1ZVRleHQsIElubGluZVZhbHVlVmFyaWFibGVMb29rdXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlSW5saW5lVmFsdWVEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZGVidWcvYnJvd3Nlci9kZWJ1Z0VkaXRvckNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBJRGVidWdTZXJ2aWNlLCBTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2RlYnVnL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1NldHRpbmcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSUNlbGxFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudCwgSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLCBOb3RlYm9va0V4ZWN1dGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rS2VybmVsU2VydmljZSwgVmFyaWFibGVzUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rS2VybmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tBY3Rpb25Db250ZXh0LCBOb3RlYm9va0FjdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyb2xsZXIvY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNlbGxWaWV3TW9kZWwsIElOb3RlYm9va0VkaXRvciwgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyTm90ZWJvb2tDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9ub3RlYm9va0VkaXRvckV4dGVuc2lvbnMuanMnO1xuXG5jbGFzcyBJbmxpbmVTZWdtZW50IHtcblx0Y29uc3RydWN0b3IocHVibGljIGNvbHVtbjogbnVtYmVyLCBwdWJsaWMgdGV4dDogc3RyaW5nKSB7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rSW5saW5lVmFyaWFibGVzQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZDogc3RyaW5nID0gJ25vdGVib29rLmlubGluZVZhcmlhYmxlc0NvbnRyb2xsZXInO1xuXG5cdHByaXZhdGUgY2VsbERlY29yYXRpb25JZHMgPSBuZXcgTWFwPElDZWxsVmlld01vZGVsLCBzdHJpbmdbXT4oKTtcblx0cHJpdmF0ZSBjZWxsQ29udGVudExpc3RlbmVycyA9IG5ldyBSZXNvdXJjZU1hcDxJRGlzcG9zYWJsZT4oKTtcblxuXHRwcml2YXRlIGN1cnJlbnRDYW5jZWxsYXRpb25Ub2tlblNvdXJjZXMgPSBuZXcgUmVzb3VyY2VNYXA8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0NFTExfTElORVMgPSA1MDAwOyAvLyBTa2lwIGV4dHJlbWVseSBsYXJnZSBjZWxsc1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvcixcblx0XHRASU5vdGVib29rS2VybmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rS2VybmVsU2VydmljZTogSU5vdGVib29rS2VybmVsU2VydmljZSxcblx0XHRASU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2Uub25EaWRDaGFuZ2VFeGVjdXRpb24oYXN5bmMgZSA9PiB7XG5cdFx0XHRjb25zdCBpbmxpbmVWYWx1ZXNTZXR0aW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnb24nIHwgJ2F1dG8nIHwgJ29mZic+KE5vdGVib29rU2V0dGluZy5ub3RlYm9va0lubGluZVZhbHVlcyk7XG5cdFx0XHRpZiAoaW5saW5lVmFsdWVzU2V0dGluZyA9PT0gJ29mZicpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS50eXBlID09PSBOb3RlYm9va0V4ZWN1dGlvblR5cGUuY2VsbCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUlubGluZVZhcmlhYmxlcyhlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4ge1xuXHRcdFx0aWYgKCFlIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLm5vdGVib29rSW5saW5lVmFsdWVzKSkge1xuXHRcdFx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnb24nIHwgJ2F1dG8nIHwgJ29mZic+KE5vdGVib29rU2V0dGluZy5ub3RlYm9va0lubGluZVZhbHVlcykgPT09ICdvZmYnKSB7XG5cdFx0XHRcdFx0dGhpcy5jbGVhck5vdGVib29rSW5saW5lRGVjb3JhdGlvbnMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlSW5saW5lVmFyaWFibGVzKGV2ZW50OiBJQ2VsbEV4ZWN1dGlvblN0YXRlQ2hhbmdlZEV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGV2ZW50LmNoYW5nZWQpIHsgLy8gdW5kZWZpbmVkIC0+IGV4ZWN1dGlvbiB3YXMgY29tcGxldGVkLCBzbyByZXR1cm4gb24gYWxsIGVsc2UuIG5vIGNvZGUgc2hvdWxkIGV4ZWN1dGUgdW50aWwgd2Uga25vdyBpdCdzIGFuIGV4ZWN1dGlvbiBjb21wbGV0aW9uXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SGFuZGxlKGV2ZW50LmNlbGxIYW5kbGUpO1xuXHRcdGlmICghY2VsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENhbmNlbCBhbnkgb25nb2luZyByZXF1ZXN0IGluIHRoaXMgY2VsbFxuXHRcdGNvbnN0IGV4aXN0aW5nU291cmNlID0gdGhpcy5jdXJyZW50Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2VzLmdldChjZWxsLnVyaSk7XG5cdFx0aWYgKGV4aXN0aW5nU291cmNlKSB7XG5cdFx0XHRleGlzdGluZ1NvdXJjZS5jYW5jZWwoKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgYSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgZm9yIHRoZSBuZXcgcmVxdWVzdCBwZXIgY2VsbFxuXHRcdHRoaXMuY3VycmVudENhbmNlbGxhdGlvblRva2VuU291cmNlcy5zZXQoY2VsbC51cmksIG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuY3VycmVudENhbmNlbGxhdGlvblRva2VuU291cmNlcy5nZXQoY2VsbC51cmkpIS50b2tlbjtcblxuXHRcdGlmICh0aGlzLmRlYnVnU2VydmljZS5zdGF0ZSAhPT0gU3RhdGUuSW5hY3RpdmUpIHtcblx0XHRcdHRoaXMuX2NsZWFyTm90ZWJvb2tJbmxpbmVEZWNvcmF0aW9ucygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWw/LnVyaSB8fCAhaXNFcXVhbCh0aGlzLm5vdGVib29rRWRpdG9yLnRleHRNb2RlbC51cmksIGV2ZW50Lm5vdGVib29rKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgY2VsbC5yZXNvbHZlVGV4dE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlubGluZVZhbHVlc1NldHRpbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdvbicgfCAnYXV0bycgfCAnb2ZmJz4oTm90ZWJvb2tTZXR0aW5nLm5vdGVib29rSW5saW5lVmFsdWVzKTtcblx0XHRjb25zdCBoYXNJbmxpbmVWYWx1ZVByb3ZpZGVyID0gdGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxpbmVWYWx1ZXNQcm92aWRlci5oYXMobW9kZWwpO1xuXG5cdFx0Ly8gU2tpcCBpZiBzZXR0aW5nIGlzIG9mZiBvciBpZiBhdXRvIGFuZCBubyBwcm92aWRlciBpcyByZWdpc3RlcmVkXG5cdFx0aWYgKGlubGluZVZhbHVlc1NldHRpbmcgPT09ICdvZmYnIHx8IChpbmxpbmVWYWx1ZXNTZXR0aW5nID09PSAnYXV0bycgJiYgIWhhc0lubGluZVZhbHVlUHJvdmlkZXIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jbGVhckNlbGxJbmxpbmVEZWNvcmF0aW9ucyhjZWxsKTtcblxuXHRcdGNvbnN0IGlubGluZURlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXG5cdFx0aWYgKGhhc0lubGluZVZhbHVlUHJvdmlkZXIpIHtcblx0XHRcdC8vIHVzZSBleHRlbnNpb24gYmFzZWQgcHJvdmlkZXIsIGJvcnJvd2VkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvYmxvYi9tYWluL3NyYy92cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9icm93c2VyL2RlYnVnRWRpdG9yQ29udHJpYnV0aW9uLnRzI0w2Nzlcblx0XHRcdGNvbnN0IGxhc3RMaW5lID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRjb25zdCBsYXN0Q29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsYXN0TGluZSk7XG5cdFx0XHRjb25zdCBjdHg6IElubGluZVZhbHVlQ29udGV4dCA9IHtcblx0XHRcdFx0ZnJhbWVJZDogMCwgLy8gaWdub3JlZCwgd2Ugd29uJ3QgaGF2ZSBhIHN0YWNrIGZyb20gc2luY2Ugbm90IGluIGEgZGVidWcgc2Vzc2lvblxuXHRcdFx0XHRzdG9wcGVkTG9jYXRpb246IG5ldyBSYW5nZShsYXN0TGluZSwgbGFzdENvbHVtbiwgbGFzdExpbmUsIGxhc3RDb2x1bW4pIC8vIGV4ZWN1dGluZyBjZWxsIGJ5IGNlbGwsIHNvIFwic3RvcHBlZFwiIGxvY2F0aW9uIHdvdWxkIGp1c3QgYmUgdGhlIGVuZCBvZiBkb2N1bWVudFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXJzID0gdGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxpbmVWYWx1ZXNQcm92aWRlci5vcmRlcmVkKG1vZGVsKS5yZXZlcnNlKCk7XG5cdFx0XHRjb25zdCBsaW5lRGVjb3JhdGlvbnMgPSBuZXcgTWFwPG51bWJlciwgSW5saW5lU2VnbWVudFtdPigpO1xuXG5cdFx0XHRjb25zdCBmdWxsQ2VsbFJhbmdlID0gbmV3IFJhbmdlKDEsIDEsIGxhc3RMaW5lLCBsYXN0Q29sdW1uKTtcblxuXHRcdFx0Y29uc3QgcHJvbWlzZXMgPSBwcm92aWRlcnMuZmxhdE1hcChwcm92aWRlciA9PiBQcm9taXNlLnJlc29sdmUocHJvdmlkZXIucHJvdmlkZUlubGluZVZhbHVlcyhtb2RlbCwgZnVsbENlbGxSYW5nZSwgY3R4LCB0b2tlbikpLnRoZW4oYXN5bmMgKHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5vdGVib29rID0gdGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRcdGlmICghbm90ZWJvb2spIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBrZXJuZWwgPSB0aGlzLm5vdGVib29rS2VybmVsU2VydmljZS5nZXRNYXRjaGluZ0tlcm5lbChub3RlYm9vayk7XG5cdFx0XHRcdGNvbnN0IGtlcm5lbFZhcnM6IFZhcmlhYmxlc1Jlc3VsdFtdID0gW107XG5cdFx0XHRcdGlmIChyZXN1bHQuc29tZShpdiA9PiBpdi50eXBlID09PSAndmFyaWFibGUnKSkgeyAvLyBpZiBhbnlvbmUgd2lsbCBuZWVkIGEgbG9va3VwLCBnZXQgdmFycyBub3cgdG8gYXZvaWQgbmVlZGluZyB0byBkbyBpdCBtdWx0aXBsZSB0aW1lc1xuXHRcdFx0XHRcdGlmICghdGhpcy5ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47IC8vIHNob3VsZCBub3QgaGFwcGVuLCBhIGNlbGwgd2lsbCBiZSBleGVjdXRlZFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB2YXJpYWJsZXMgPSBrZXJuZWwuc2VsZWN0ZWQ/LnByb3ZpZGVWYXJpYWJsZXMoZXZlbnQubm90ZWJvb2ssIHVuZGVmaW5lZCwgJ25hbWVkJywgMCwgdG9rZW4pO1xuXHRcdFx0XHRcdGlmICh2YXJpYWJsZXMpIHtcblx0XHRcdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgdiBvZiB2YXJpYWJsZXMpIHtcblx0XHRcdFx0XHRcdFx0a2VybmVsVmFycy5wdXNoKHYpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgaXYgb2YgcmVzdWx0KSB7XG5cdFx0XHRcdFx0bGV0IHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRzd2l0Y2ggKGl2LnR5cGUpIHtcblx0XHRcdFx0XHRcdGNhc2UgJ3RleHQnOlxuXHRcdFx0XHRcdFx0XHR0ZXh0ID0gKGl2IGFzIElubGluZVZhbHVlVGV4dCkudGV4dDtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlICd2YXJpYWJsZSc6IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbmFtZSA9IChpdiBhcyBJbmxpbmVWYWx1ZVZhcmlhYmxlTG9va3VwKS52YXJpYWJsZU5hbWU7XG5cdFx0XHRcdFx0XHRcdGlmICghbmFtZSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlOyAvLyBza2lwIHRvIG5leHQgdmFyLCBubyB2YWxpZCBuYW1lIHRvIGxvb2t1cCB3aXRoXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBrZXJuZWxWYXJzLmZpbmQodiA9PiB2Lm5hbWUgPT09IG5hbWUpPy52YWx1ZTtcblx0XHRcdFx0XHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHRleHQgPSBmb3JtYXQoJ3swfSA9IHsxfScsIG5hbWUsIHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjYXNlICdleHByZXNzaW9uJzoge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gbm8gYWN0aXZlIGRlYnVnIHNlc3Npb24sIHNvIGV2YWx1YXRlIHdvdWxkIGJyZWFrXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHRleHQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmUgPSBpdi5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRsZXQgbGluZVNlZ21lbnRzID0gbGluZURlY29yYXRpb25zLmdldChsaW5lKTtcblx0XHRcdFx0XHRcdGlmICghbGluZVNlZ21lbnRzKSB7XG5cdFx0XHRcdFx0XHRcdGxpbmVTZWdtZW50cyA9IFtdO1xuXHRcdFx0XHRcdFx0XHRsaW5lRGVjb3JhdGlvbnMuc2V0KGxpbmUsIGxpbmVTZWdtZW50cyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoIWxpbmVTZWdtZW50cy5zb21lKGl2ID0+IGl2LnRleHQgPT09IHRleHQpKSB7IC8vIGRlLWR1cGVcblx0XHRcdFx0XHRcdFx0bGluZVNlZ21lbnRzLnB1c2gobmV3IElubGluZVNlZ21lbnQoaXYucmFuZ2Uuc3RhcnRDb2x1bW4sIHRleHQpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sIGVyciA9PiB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IoZXJyKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXG5cdFx0XHQvLyBzb3J0IGxpbmUgc2VnbWVudHMgYW5kIGNvbmNhdGVuYXRlIHRoZW0gaW50byBhIGRlY29yYXRpb25cblx0XHRcdGxpbmVEZWNvcmF0aW9ucy5mb3JFYWNoKChzZWdtZW50cywgbGluZSkgPT4ge1xuXHRcdFx0XHRpZiAoc2VnbWVudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHNlZ21lbnRzLnNvcnQoKGEsIGIpID0+IGEuY29sdW1uIC0gYi5jb2x1bW4pO1xuXHRcdFx0XHRcdGNvbnN0IHRleHQgPSBzZWdtZW50cy5tYXAocyA9PiBzLnRleHQpLmpvaW4oJywgJyk7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9yV2lkdGggPSBjZWxsLmxheW91dEluZm8uZWRpdG9yV2lkdGg7XG5cdFx0XHRcdFx0Y29uc3QgZm9udEluZm8gPSBjZWxsLmxheW91dEluZm8uZm9udEluZm87XG5cdFx0XHRcdFx0aWYgKGZvbnRJbmZvICYmIGNlbGwudGV4dE1vZGVsKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBiYXNlID0gTWF0aC5mbG9vcigoZWRpdG9yV2lkdGggLSA1MCkgLyBmb250SW5mby50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGgpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGluZUxlbmd0aCA9IGNlbGwudGV4dE1vZGVsLmdldExpbmVMZW5ndGgobGluZSk7XG5cdFx0XHRcdFx0XHRjb25zdCBhdmFpbGFibGUgPSBNYXRoLm1heCgwLCBiYXNlIC0gbGluZUxlbmd0aCk7XG5cdFx0XHRcdFx0XHRpbmxpbmVEZWNvcmF0aW9ucy5wdXNoKC4uLmNyZWF0ZUlubGluZVZhbHVlRGVjb3JhdGlvbihsaW5lLCB0ZXh0LCAnbmInLCB1bmRlZmluZWQsIGF2YWlsYWJsZSkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpbmxpbmVEZWNvcmF0aW9ucy5wdXNoKC4uLmNyZWF0ZUlubGluZVZhbHVlRGVjb3JhdGlvbihsaW5lLCB0ZXh0LCAnbmInKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdH0gZWxzZSBpZiAoaW5saW5lVmFsdWVzU2V0dGluZyA9PT0gJ29uJykgeyAvLyBmYWxsYmFjayBhcHByb2FjaCBvbmx5IHdoZW4gc2V0dGluZyBpcyAnb24nXG5cdFx0XHRpZiAoIXRoaXMubm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHNob3VsZCBub3QgaGFwcGVuLCBhIGNlbGwgd2lsbCBiZSBleGVjdXRlZFxuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga2VybmVsID0gdGhpcy5ub3RlYm9va0tlcm5lbFNlcnZpY2UuZ2V0TWF0Y2hpbmdLZXJuZWwodGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWwpO1xuXHRcdFx0Y29uc3QgdmFyaWFibGVzID0ga2VybmVsPy5zZWxlY3RlZD8ucHJvdmlkZVZhcmlhYmxlcyhldmVudC5ub3RlYm9vaywgdW5kZWZpbmVkLCAnbmFtZWQnLCAwLCB0b2tlbik7XG5cdFx0XHRpZiAoIXZhcmlhYmxlcykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZhcnM6IFZhcmlhYmxlc1Jlc3VsdFtdID0gW107XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IHYgb2YgdmFyaWFibGVzKSB7XG5cdFx0XHRcdHZhcnMucHVzaCh2KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZhck5hbWVzOiBzdHJpbmdbXSA9IHZhcnMubWFwKHYgPT4gdi5uYW1lKTtcblxuXHRcdFx0Y29uc3QgZG9jdW1lbnQgPSBjZWxsLnRleHRNb2RlbDtcblx0XHRcdGlmICghZG9jdW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTa2lwIHByb2Nlc3NpbmcgZm9yIGV4dHJlbWVseSBsYXJnZSBjZWxsc1xuXHRcdFx0aWYgKGRvY3VtZW50LmdldExpbmVDb3VudCgpID4gTm90ZWJvb2tJbmxpbmVWYXJpYWJsZXNDb250cm9sbGVyLk1BWF9DRUxMX0xJTkVTKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJvY2Vzc2VkVmFycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0XHQvLyBHZXQgYm90aCBmdW5jdGlvbiByYW5nZXMgYW5kIGNvbW1lbnQgcmFuZ2VzXG5cdFx0XHRjb25zdCBmdW5jdGlvblJhbmdlcyA9IHRoaXMuZ2V0RnVuY3Rpb25SYW5nZXMoZG9jdW1lbnQpO1xuXHRcdFx0Y29uc3QgY29tbWVudGVkUmFuZ2VzID0gdGhpcy5nZXRDb21tZW50ZWRSYW5nZXMoZG9jdW1lbnQpO1xuXHRcdFx0Y29uc3QgaWdub3JlZFJhbmdlcyA9IFsuLi5mdW5jdGlvblJhbmdlcywgLi4uY29tbWVudGVkUmFuZ2VzXTtcblx0XHRcdGNvbnN0IGxpbmVEZWNvcmF0aW9ucyA9IG5ldyBNYXA8bnVtYmVyLCBJbmxpbmVTZWdtZW50W10+KCk7XG5cblx0XHRcdC8vIEZvciBlYWNoIHZhcmlhYmxlIG5hbWUgZm91bmQgaW4gdGhlIGtlcm5lbCByZXN1bHRzXG5cdFx0XHRmb3IgKGNvbnN0IHZhck5hbWUgb2YgdmFyTmFtZXMpIHtcblx0XHRcdFx0aWYgKHByb2Nlc3NlZFZhcnMuaGFzKHZhck5hbWUpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBMb29rIGZvciB2YXJpYWJsZSB1c2FnZSBnbG9iYWxseSAtIHVzaW5nIHdvcmQgYm91bmRhcmllcyB0byBlbnN1cmUgZXhhY3QgbWF0Y2hlc1xuXHRcdFx0XHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHt2YXJOYW1lfVxcXFxiKD8hXFxcXHcpYCwgJ2cnKTtcblx0XHRcdFx0bGV0IGxhc3RNYXRjaE91dHNpZGVJZ25vcmVkOiB7IGxpbmU6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuXHRcdFx0XHRsZXQgZm91bmRNYXRjaCA9IGZhbHNlO1xuXG5cdFx0XHRcdC8vIFNjYW4gbGluZXMgaW4gcmV2ZXJzZSB0byBmaW5kIGxhc3Qgb2NjdXJyZW5jZSBmaXJzdFxuXHRcdFx0XHRjb25zdCBsaW5lcyA9IGRvY3VtZW50LmdldFZhbHVlKCkuc3BsaXQoJ1xcbicpO1xuXHRcdFx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gbGluZXMubGVuZ3RoIC0gMTsgbGluZU51bWJlciA+PSAwOyBsaW5lTnVtYmVyLS0pIHtcblx0XHRcdFx0XHRjb25zdCBsaW5lID0gbGluZXNbbGluZU51bWJlcl07XG5cdFx0XHRcdFx0bGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXG5cdFx0XHRcdFx0d2hpbGUgKChtYXRjaCA9IHJlZ2V4LmV4ZWMobGluZSkpICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzdGFydEluZGV4ID0gbWF0Y2guaW5kZXg7XG5cdFx0XHRcdFx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24obGluZU51bWJlciArIDEsIHN0YXJ0SW5kZXggKyAxKTtcblxuXHRcdFx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBwb3NpdGlvbiBpcyBpbiBhbnkgaWdub3JlZCByYW5nZSAoZnVuY3Rpb24gb3IgY29tbWVudClcblx0XHRcdFx0XHRcdGlmICghdGhpcy5pc1Bvc2l0aW9uSW5SYW5nZXMocG9zLCBpZ25vcmVkUmFuZ2VzKSkge1xuXHRcdFx0XHRcdFx0XHRsYXN0TWF0Y2hPdXRzaWRlSWdub3JlZCA9IHtcblx0XHRcdFx0XHRcdFx0XHRsaW5lOiBsaW5lTnVtYmVyICsgMSxcblx0XHRcdFx0XHRcdFx0XHRjb2x1bW46IHN0YXJ0SW5kZXggKyAxXG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGZvdW5kTWF0Y2ggPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRicmVhazsgLy8gVGFrZSBmaXJzdCBtYXRjaCBpbiByZXZlcnNlIG9yZGVyICh3aGljaCBpcyBsYXN0IGNocm9ub2xvZ2ljYWxseSlcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoZm91bmRNYXRjaCkge1xuXHRcdFx0XHRcdFx0YnJlYWs7IC8vIFdlIGZvdW5kIG91ciBsYXN0IHZhbGlkIG9jY3VycmVuY2UsIG5vIG5lZWQgdG8gY2hlY2sgZWFybGllciBsaW5lc1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChsYXN0TWF0Y2hPdXRzaWRlSWdub3JlZCkge1xuXHRcdFx0XHRcdGNvbnN0IGlubGluZVZhbCA9IHZhck5hbWUgKyAnID0gJyArIHZhcnMuZmluZCh2ID0+IHYubmFtZSA9PT0gdmFyTmFtZSk/LnZhbHVlO1xuXG5cdFx0XHRcdFx0bGV0IGxpbmVTZWdtZW50cyA9IGxpbmVEZWNvcmF0aW9ucy5nZXQobGFzdE1hdGNoT3V0c2lkZUlnbm9yZWQubGluZSk7XG5cdFx0XHRcdFx0aWYgKCFsaW5lU2VnbWVudHMpIHtcblx0XHRcdFx0XHRcdGxpbmVTZWdtZW50cyA9IFtdO1xuXHRcdFx0XHRcdFx0bGluZURlY29yYXRpb25zLnNldChsYXN0TWF0Y2hPdXRzaWRlSWdub3JlZC5saW5lLCBsaW5lU2VnbWVudHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIWxpbmVTZWdtZW50cy5zb21lKGl2ID0+IGl2LnRleHQgPT09IGlubGluZVZhbCkpIHsgLy8gZGUtZHVwZVxuXHRcdFx0XHRcdFx0bGluZVNlZ21lbnRzLnB1c2gobmV3IElubGluZVNlZ21lbnQobGFzdE1hdGNoT3V0c2lkZUlnbm9yZWQuY29sdW1uLCBpbmxpbmVWYWwpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcm9jZXNzZWRWYXJzLmFkZCh2YXJOYW1lKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc29ydCBsaW5lIHNlZ21lbnRzIGFuZCBjb25jYXRlbmF0ZSB0aGVtIGludG8gYSBkZWNvcmF0aW9uXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnMuZm9yRWFjaCgoc2VnbWVudHMsIGxpbmUpID0+IHtcblx0XHRcdFx0aWYgKHNlZ21lbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRzZWdtZW50cy5zb3J0KChhLCBiKSA9PiBhLmNvbHVtbiAtIGIuY29sdW1uKTtcblx0XHRcdFx0XHRjb25zdCB0ZXh0ID0gc2VnbWVudHMubWFwKHMgPT4gcy50ZXh0KS5qb2luKCcsICcpO1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvcldpZHRoID0gY2VsbC5sYXlvdXRJbmZvLmVkaXRvcldpZHRoO1xuXHRcdFx0XHRcdGNvbnN0IGZvbnRJbmZvID0gY2VsbC5sYXlvdXRJbmZvLmZvbnRJbmZvO1xuXHRcdFx0XHRcdGlmIChmb250SW5mbyAmJiBjZWxsLnRleHRNb2RlbCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYmFzZSA9IE1hdGguZmxvb3IoKGVkaXRvcldpZHRoIC0gNTApIC8gZm9udEluZm8udHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmVMZW5ndGggPSBjZWxsLnRleHRNb2RlbC5nZXRMaW5lTGVuZ3RoKGxpbmUpO1xuXHRcdFx0XHRcdFx0Y29uc3QgYXZhaWxhYmxlID0gTWF0aC5tYXgoMCwgYmFzZSAtIGxpbmVMZW5ndGgpO1xuXHRcdFx0XHRcdFx0aW5saW5lRGVjb3JhdGlvbnMucHVzaCguLi5jcmVhdGVJbmxpbmVWYWx1ZURlY29yYXRpb24obGluZSwgdGV4dCwgJ25iJywgdW5kZWZpbmVkLCBhdmFpbGFibGUpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aW5saW5lRGVjb3JhdGlvbnMucHVzaCguLi5jcmVhdGVJbmxpbmVWYWx1ZURlY29yYXRpb24obGluZSwgdGV4dCwgJ25iJykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlubGluZURlY29yYXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMudXBkYXRlQ2VsbElubGluZURlY29yYXRpb25zKGNlbGwsIGlubGluZURlY29yYXRpb25zKTtcblx0XHRcdHRoaXMuaW5pdENlbGxDb250ZW50TGlzdGVuZXIoY2VsbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRGdW5jdGlvblJhbmdlcyhkb2N1bWVudDogSVRleHRNb2RlbCk6IFJhbmdlW10ge1xuXHRcdHJldHVybiBkb2N1bWVudC5nZXRMYW5ndWFnZUlkKCkgPT09ICdweXRob24nXG5cdFx0XHQ/IHRoaXMuZ2V0UHl0aG9uRnVuY3Rpb25SYW5nZXMoZG9jdW1lbnQuZ2V0VmFsdWUoKSlcblx0XHRcdDogdGhpcy5nZXRCcmFjZWRGdW5jdGlvblJhbmdlcyhkb2N1bWVudC5nZXRWYWx1ZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHl0aG9uRnVuY3Rpb25SYW5nZXMoY29kZTogc3RyaW5nKTogUmFuZ2VbXSB7XG5cdFx0Y29uc3QgZnVuY3Rpb25SYW5nZXM6IFJhbmdlW10gPSBbXTtcblx0XHRjb25zdCBsaW5lcyA9IGNvZGUuc3BsaXQoJ1xcbicpO1xuXHRcdGxldCBmdW5jdGlvblN0YXJ0TGluZSA9IC0xO1xuXHRcdGxldCBpbkZ1bmN0aW9uID0gZmFsc2U7XG5cdFx0bGV0IHB5dGhvbkluZGVudExldmVsID0gLTE7XG5cdFx0Y29uc3QgcHl0aG9uRnVuY3Rpb25EZWNsUmVnZXggPSAvXihcXHMqKShhc3luY1xccyspPyg/OmRlZlxccytcXHcrfGNsYXNzXFxzK1xcdyspXFxzKlxcKFteKV0qXFwpXFxzKjovO1xuXG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IDA7IGxpbmVOdW1iZXIgPCBsaW5lcy5sZW5ndGg7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IGxpbmVzW2xpbmVOdW1iZXJdO1xuXG5cdFx0XHQvLyBDaGVjayBmb3IgUHl0aG9uIGZ1bmN0aW9uL2NsYXNzIGRlY2xhcmF0aW9uc1xuXHRcdFx0Y29uc3QgcHl0aG9uTWF0Y2ggPSBsaW5lLm1hdGNoKHB5dGhvbkZ1bmN0aW9uRGVjbFJlZ2V4KTtcblx0XHRcdGlmIChweXRob25NYXRjaCkge1xuXHRcdFx0XHRpZiAoaW5GdW5jdGlvbikge1xuXHRcdFx0XHRcdC8vIElmIHdlJ3JlIGFscmVhZHkgaW4gYSBmdW5jdGlvbiBhbmQgZmluZCBhbm90aGVyIGF0IHRoZSBzYW1lIG9yIGxvd2VyIGluZGVudCwgY2xvc2UgdGhlIGN1cnJlbnQgb25lXG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudEluZGVudCA9IHB5dGhvbk1hdGNoWzFdLmxlbmd0aDtcblx0XHRcdFx0XHRpZiAoY3VycmVudEluZGVudCA8PSBweXRob25JbmRlbnRMZXZlbCkge1xuXHRcdFx0XHRcdFx0ZnVuY3Rpb25SYW5nZXMucHVzaChuZXcgUmFuZ2UoZnVuY3Rpb25TdGFydExpbmUgKyAxLCAxLCBsaW5lTnVtYmVyLCBsaW5lLmxlbmd0aCArIDEpKTtcblx0XHRcdFx0XHRcdGluRnVuY3Rpb24gPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWluRnVuY3Rpb24pIHtcblx0XHRcdFx0XHRpbkZ1bmN0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHRmdW5jdGlvblN0YXJ0TGluZSA9IGxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0cHl0aG9uSW5kZW50TGV2ZWwgPSBweXRob25NYXRjaFsxXS5sZW5ndGg7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGluZGVudGF0aW9uIGZvciBQeXRob24gZnVuY3Rpb25zXG5cdFx0XHRpZiAoaW5GdW5jdGlvbikge1xuXHRcdFx0XHQvLyBTa2lwIGVtcHR5IGxpbmVzXG5cdFx0XHRcdGlmIChsaW5lLnRyaW0oKSA9PT0gJycpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEdldCB0aGUgaW5kZW50YXRpb24gb2YgdGhlIGN1cnJlbnQgbGluZVxuXHRcdFx0XHRjb25zdCBjdXJyZW50SW5kZW50ID0gbGluZS5tYXRjaCgvXlxccyovKT8uWzBdLmxlbmd0aCA/PyAwO1xuXG5cdFx0XHRcdC8vIElmIHdlIGhpdCBhIGxpbmUgd2l0aCBzYW1lIG9yIGxvd2VyIGluZGVudGF0aW9uIHRoYW4gd2hlcmUgdGhlIGZ1bmN0aW9uIHN0YXJ0ZWQsXG5cdFx0XHRcdC8vIHdlJ3ZlIGV4aXRlZCB0aGUgZnVuY3Rpb25cblx0XHRcdFx0aWYgKGN1cnJlbnRJbmRlbnQgPD0gcHl0aG9uSW5kZW50TGV2ZWwpIHtcblx0XHRcdFx0XHRmdW5jdGlvblJhbmdlcy5wdXNoKG5ldyBSYW5nZShmdW5jdGlvblN0YXJ0TGluZSArIDEsIDEsIGxpbmVOdW1iZXIsIGxpbmUubGVuZ3RoICsgMSkpO1xuXHRcdFx0XHRcdGluRnVuY3Rpb24gPSBmYWxzZTtcblx0XHRcdFx0XHRweXRob25JbmRlbnRMZXZlbCA9IC0xO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGNhc2Ugd2hlcmUgUHl0aG9uIGZ1bmN0aW9uIGlzIGF0IHRoZSBlbmQgb2YgdGhlIGRvY3VtZW50XG5cdFx0aWYgKGluRnVuY3Rpb24pIHtcblx0XHRcdGZ1bmN0aW9uUmFuZ2VzLnB1c2gobmV3IFJhbmdlKGZ1bmN0aW9uU3RhcnRMaW5lICsgMSwgMSwgbGluZXMubGVuZ3RoLCBsaW5lc1tsaW5lcy5sZW5ndGggLSAxXS5sZW5ndGggKyAxKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZ1bmN0aW9uUmFuZ2VzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRCcmFjZWRGdW5jdGlvblJhbmdlcyhjb2RlOiBzdHJpbmcpOiBSYW5nZVtdIHtcblx0XHRjb25zdCBmdW5jdGlvblJhbmdlczogUmFuZ2VbXSA9IFtdO1xuXHRcdGNvbnN0IGxpbmVzID0gY29kZS5zcGxpdCgnXFxuJyk7XG5cdFx0bGV0IGJyYWNlRGVwdGggPSAwO1xuXHRcdGxldCBmdW5jdGlvblN0YXJ0TGluZSA9IC0xO1xuXHRcdGxldCBpbkZ1bmN0aW9uID0gZmFsc2U7XG5cdFx0Y29uc3QgZnVuY3Rpb25EZWNsUmVnZXggPSAvXFxiKD86ZnVuY3Rpb25cXHMrXFx3K3woPzphc3luY1xccyspPyg/OlxcdytcXHMqPVxccyopP1xcKFteKV0qXFwpXFxzKj0+fGNsYXNzXFxzK1xcdyt8KD86cHVibGljfHByaXZhdGV8cHJvdGVjdGVkfHN0YXRpYyk/XFxzKlxcdytcXHMqXFwoW14pXSpcXClcXHMqeykvO1xuXG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IDA7IGxpbmVOdW1iZXIgPCBsaW5lcy5sZW5ndGg7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IGxpbmVzW2xpbmVOdW1iZXJdO1xuXHRcdFx0Zm9yIChjb25zdCBjaGFyIG9mIGxpbmUpIHtcblx0XHRcdFx0aWYgKGNoYXIgPT09ICd7Jykge1xuXHRcdFx0XHRcdGlmICghaW5GdW5jdGlvbiAmJiBmdW5jdGlvbkRlY2xSZWdleC50ZXN0KGxpbmUpKSB7XG5cdFx0XHRcdFx0XHRpbkZ1bmN0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGZ1bmN0aW9uU3RhcnRMaW5lID0gbGluZU51bWJlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJhY2VEZXB0aCsrO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNoYXIgPT09ICd9Jykge1xuXHRcdFx0XHRcdGJyYWNlRGVwdGgtLTtcblx0XHRcdFx0XHRpZiAoYnJhY2VEZXB0aCA9PT0gMCAmJiBpbkZ1bmN0aW9uKSB7XG5cdFx0XHRcdFx0XHRmdW5jdGlvblJhbmdlcy5wdXNoKG5ldyBSYW5nZShmdW5jdGlvblN0YXJ0TGluZSArIDEsIDEsIGxpbmVOdW1iZXIgKyAxLCBsaW5lLmxlbmd0aCArIDEpKTtcblx0XHRcdFx0XHRcdGluRnVuY3Rpb24gPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZnVuY3Rpb25SYW5nZXM7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbW1lbnRlZFJhbmdlcyhkb2N1bWVudDogSVRleHRNb2RlbCk6IFJhbmdlW10ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRDb21tZW50ZWRSYW5nZXMoZG9jdW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29tbWVudGVkUmFuZ2VzKGRvY3VtZW50OiBJVGV4dE1vZGVsKTogUmFuZ2VbXSB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB0aGlzLmdldENvbW1lbnRlZFJhbmdlc0J5QWNjdXJhdGVUb2tlbml6YXRpb24oZG9jdW1lbnQpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIEZhbGwgYmFjayB0byBtYW51YWwgcGFyc2luZyBpZiB0b2tlbml6YXRpb24gZmFpbHNcblx0XHRcdHJldHVybiB0aGlzLmdldENvbW1lbnRlZFJhbmdlc0J5TWFudWFsUGFyc2luZyhkb2N1bWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb21tZW50ZWRSYW5nZXNCeUFjY3VyYXRlVG9rZW5pemF0aW9uKGRvY3VtZW50OiBJVGV4dE1vZGVsKTogUmFuZ2VbXSB7XG5cdFx0Y29uc3QgY29tbWVudFJhbmdlczogUmFuZ2VbXSA9IFtdO1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IGRvY3VtZW50LmdldExpbmVDb3VudCgpO1xuXG5cdFx0Ly8gU2tpcCBwcm9jZXNzaW5nIGZvciBleHRyZW1lbHkgbGFyZ2UgZG9jdW1lbnRzXG5cdFx0aWYgKGxpbmVDb3VudCA+IE5vdGVib29rSW5saW5lVmFyaWFibGVzQ29udHJvbGxlci5NQVhfQ0VMTF9MSU5FUykge1xuXHRcdFx0cmV0dXJuIGNvbW1lbnRSYW5nZXM7XG5cdFx0fVxuXG5cdFx0Ly8gUHJvY2VzcyBlYWNoIGxpbmUgLSBmb3JjZSB0b2tlbml6YXRpb24gaWYgbmVlZGVkIGFuZCBwcm9jZXNzIHRva2VucyBpbiBhIHNpbmdsZSBwYXNzXG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IDE7IGxpbmVOdW1iZXIgPD0gbGluZUNvdW50OyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdC8vIEZvcmNlIHRva2VuaXphdGlvbiBpZiBuZWVkZWRcblx0XHRcdGlmICghZG9jdW1lbnQudG9rZW5pemF0aW9uLmhhc0FjY3VyYXRlVG9rZW5zRm9yTGluZShsaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRkb2N1bWVudC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obGluZU51bWJlcik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBkb2N1bWVudC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucyhsaW5lTnVtYmVyKTtcblxuXHRcdFx0Ly8gU2tpcCBsaW5lcyB3aXRoIG5vIHRva2Vuc1xuXHRcdFx0aWYgKGxpbmVUb2tlbnMuZ2V0Q291bnQoKSA9PT0gMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHN0YXJ0Q2hhcmFjdGVyOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIENoZWNrIGVhY2ggdG9rZW4gaW4gdGhlIGxpbmVcblx0XHRcdGZvciAobGV0IHRva2VuSW5kZXggPSAwOyB0b2tlbkluZGV4IDwgbGluZVRva2Vucy5nZXRDb3VudCgpOyB0b2tlbkluZGV4KyspIHtcblx0XHRcdFx0Y29uc3QgdG9rZW5UeXBlID0gbGluZVRva2Vucy5nZXRTdGFuZGFyZFRva2VuVHlwZSh0b2tlbkluZGV4KTtcblxuXHRcdFx0XHRpZiAodG9rZW5UeXBlID09PSBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50IHx8IHRva2VuVHlwZSA9PT0gU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIHx8IHRva2VuVHlwZSA9PT0gU3RhbmRhcmRUb2tlblR5cGUuUmVnRXgpIHtcblx0XHRcdFx0XHRpZiAoc3RhcnRDaGFyYWN0ZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0Ly8gU3RhcnQgb2YgYSBjb21tZW50IG9yIHN0cmluZ1xuXHRcdFx0XHRcdFx0c3RhcnRDaGFyYWN0ZXIgPSBsaW5lVG9rZW5zLmdldFN0YXJ0T2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGVuZENoYXJhY3RlciA9IGxpbmVUb2tlbnMuZ2V0RW5kT2Zmc2V0KHRva2VuSW5kZXgpO1xuXG5cdFx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyB0aGUgZW5kIG9mIHRoZSBjb21tZW50L3N0cmluZyBzZWN0aW9uIChlaXRoZXIgZW5kIG9mIGxpbmUgb3IgZGlmZmVyZW50IHRva2VuIHR5cGUgZm9sbG93cylcblx0XHRcdFx0XHRjb25zdCBpc0xhc3RUb2tlbiA9IHRva2VuSW5kZXggPT09IGxpbmVUb2tlbnMuZ2V0Q291bnQoKSAtIDE7XG5cdFx0XHRcdFx0Y29uc3QgbmV4dFRva2VuRGlmZmVyZW50ID0gIWlzTGFzdFRva2VuICYmXG5cdFx0XHRcdFx0XHRsaW5lVG9rZW5zLmdldFN0YW5kYXJkVG9rZW5UeXBlKHRva2VuSW5kZXggKyAxKSAhPT0gdG9rZW5UeXBlO1xuXG5cdFx0XHRcdFx0aWYgKGlzTGFzdFRva2VuIHx8IG5leHRUb2tlbkRpZmZlcmVudCkge1xuXHRcdFx0XHRcdFx0Ly8gRW5kIG9mIGNvbW1lbnQvc3RyaW5nIHNlY3Rpb25cblx0XHRcdFx0XHRcdGNvbW1lbnRSYW5nZXMucHVzaChuZXcgUmFuZ2UobGluZU51bWJlciwgc3RhcnRDaGFyYWN0ZXIgKyAxLCBsaW5lTnVtYmVyLCBlbmRDaGFyYWN0ZXIgKyAxKSk7XG5cdFx0XHRcdFx0XHRzdGFydENoYXJhY3RlciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gUmVzZXQgd2hlbiB3ZSBoaXQgYSBub24tY29tbWVudCwgbm9uLXN0cmluZyB0b2tlblxuXHRcdFx0XHRcdHN0YXJ0Q2hhcmFjdGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbW1lbnRSYW5nZXM7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbW1lbnRlZFJhbmdlc0J5TWFudWFsUGFyc2luZyhkb2N1bWVudDogSVRleHRNb2RlbCk6IFJhbmdlW10ge1xuXHRcdGNvbnN0IGNvbW1lbnRSYW5nZXM6IFJhbmdlW10gPSBbXTtcblx0XHRjb25zdCBsaW5lcyA9IGRvY3VtZW50LmdldFZhbHVlKCkuc3BsaXQoJ1xcbicpO1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBkb2N1bWVudC5nZXRMYW5ndWFnZUlkKCk7XG5cblx0XHQvLyBEaWZmZXJlbnQgY29tbWVudCBwYXR0ZXJucyBieSBsYW5ndWFnZVxuXHRcdGNvbnN0IGxpbmVDb21tZW50VG9rZW4gPVxuXHRcdFx0bGFuZ3VhZ2VJZCA9PT0gJ3B5dGhvbicgPyAnIycgOlxuXHRcdFx0XHRsYW5ndWFnZUlkID09PSAnamF2YXNjcmlwdCcgfHwgbGFuZ3VhZ2VJZCA9PT0gJ3R5cGVzY3JpcHQnID8gJy8vJyA6XG5cdFx0XHRcdFx0bnVsbDtcblxuXHRcdGNvbnN0IGJsb2NrQ29tbWVudHMgPVxuXHRcdFx0KGxhbmd1YWdlSWQgPT09ICdqYXZhc2NyaXB0JyB8fCBsYW5ndWFnZUlkID09PSAndHlwZXNjcmlwdCcpID8geyBzdGFydDogJy8qJywgZW5kOiAnKi8nIH0gOlxuXHRcdFx0XHRudWxsO1xuXG5cdFx0bGV0IGluQmxvY2tDb21tZW50ID0gZmFsc2U7XG5cdFx0bGV0IGJsb2NrQ29tbWVudFN0YXJ0TGluZSA9IC0xO1xuXHRcdGxldCBibG9ja0NvbW1lbnRTdGFydENvbCA9IC0xO1xuXG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IDA7IGxpbmVOdW1iZXIgPCBsaW5lcy5sZW5ndGg7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IGxpbmVzW2xpbmVOdW1iZXJdO1xuXHRcdFx0Y29uc3QgdHJpbW1lZExpbmUgPSBsaW5lLnRyaW0oKTtcblxuXHRcdFx0Ly8gU2tpcCBlbXB0eSBsaW5lc1xuXHRcdFx0aWYgKHRyaW1tZWRMaW5lLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGJsb2NrQ29tbWVudHMpIHtcblx0XHRcdFx0aWYgKCFpbkJsb2NrQ29tbWVudCkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0SW5kZXggPSBsaW5lLmluZGV4T2YoYmxvY2tDb21tZW50cy5zdGFydCk7XG5cdFx0XHRcdFx0aWYgKHN0YXJ0SW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0XHRpbkJsb2NrQ29tbWVudCA9IHRydWU7XG5cdFx0XHRcdFx0XHRibG9ja0NvbW1lbnRTdGFydExpbmUgPSBsaW5lTnVtYmVyO1xuXHRcdFx0XHRcdFx0YmxvY2tDb21tZW50U3RhcnRDb2wgPSBzdGFydEluZGV4O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpbkJsb2NrQ29tbWVudCkge1xuXHRcdFx0XHRcdGNvbnN0IGVuZEluZGV4ID0gbGluZS5pbmRleE9mKGJsb2NrQ29tbWVudHMuZW5kKTtcblx0XHRcdFx0XHRpZiAoZW5kSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0XHRjb21tZW50UmFuZ2VzLnB1c2gobmV3IFJhbmdlKFxuXHRcdFx0XHRcdFx0XHRibG9ja0NvbW1lbnRTdGFydExpbmUgKyAxLFxuXHRcdFx0XHRcdFx0XHRibG9ja0NvbW1lbnRTdGFydENvbCArIDEsXG5cdFx0XHRcdFx0XHRcdGxpbmVOdW1iZXIgKyAxLFxuXHRcdFx0XHRcdFx0XHRlbmRJbmRleCArIGJsb2NrQ29tbWVudHMuZW5kLmxlbmd0aCArIDFcblx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0aW5CbG9ja0NvbW1lbnQgPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFpbkJsb2NrQ29tbWVudCAmJiBsaW5lQ29tbWVudFRva2VuICYmIGxpbmUudHJpbUxlZnQoKS5zdGFydHNXaXRoKGxpbmVDb21tZW50VG9rZW4pKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0Q29sID0gbGluZS5pbmRleE9mKGxpbmVDb21tZW50VG9rZW4pO1xuXHRcdFx0XHRjb21tZW50UmFuZ2VzLnB1c2gobmV3IFJhbmdlKFxuXHRcdFx0XHRcdGxpbmVOdW1iZXIgKyAxLFxuXHRcdFx0XHRcdHN0YXJ0Q29sICsgMSxcblx0XHRcdFx0XHRsaW5lTnVtYmVyICsgMSxcblx0XHRcdFx0XHRsaW5lLmxlbmd0aCArIDFcblx0XHRcdFx0KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGJsb2NrIGNvbW1lbnQgYXQgZW5kIG9mIGZpbGVcblx0XHRpZiAoaW5CbG9ja0NvbW1lbnQpIHtcblx0XHRcdGNvbW1lbnRSYW5nZXMucHVzaChuZXcgUmFuZ2UoXG5cdFx0XHRcdGJsb2NrQ29tbWVudFN0YXJ0TGluZSArIDEsXG5cdFx0XHRcdGJsb2NrQ29tbWVudFN0YXJ0Q29sICsgMSxcblx0XHRcdFx0bGluZXMubGVuZ3RoLFxuXHRcdFx0XHRsaW5lc1tsaW5lcy5sZW5ndGggLSAxXS5sZW5ndGggKyAxXG5cdFx0XHQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tbWVudFJhbmdlcztcblx0fVxuXG5cdHByaXZhdGUgaXNQb3NpdGlvbkluUmFuZ2VzKHBvc2l0aW9uOiBQb3NpdGlvbiwgcmFuZ2VzOiBSYW5nZVtdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHJhbmdlcy5zb21lKHJhbmdlID0+IHJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ2VsbElubGluZURlY29yYXRpb25zKGNlbGw6IElDZWxsVmlld01vZGVsLCBkZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10pIHtcblx0XHRjb25zdCBvbGREZWNvcmF0aW9ucyA9IHRoaXMuY2VsbERlY29yYXRpb25JZHMuZ2V0KGNlbGwpID8/IFtdO1xuXHRcdHRoaXMuY2VsbERlY29yYXRpb25JZHMuc2V0KGNlbGwsIGNlbGwuZGVsdGFNb2RlbERlY29yYXRpb25zKFxuXHRcdFx0b2xkRGVjb3JhdGlvbnMsXG5cdFx0XHRkZWNvcmF0aW9uc1xuXHRcdCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0Q2VsbENvbnRlbnRMaXN0ZW5lcihjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdGNvbnN0IGNlbGxNb2RlbCA9IGNlbGwudGV4dE1vZGVsO1xuXHRcdGlmICghY2VsbE1vZGVsKSB7XG5cdFx0XHRyZXR1cm47IC8vIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgZGVjb3JhdGlvbnMgb24gY29udGVudCBjaGFuZ2Vcblx0XHR0aGlzLmNlbGxDb250ZW50TGlzdGVuZXJzLnNldChjZWxsLnVyaSwgY2VsbE1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHR0aGlzLmNsZWFyQ2VsbElubGluZURlY29yYXRpb25zKGNlbGwpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJDZWxsSW5saW5lRGVjb3JhdGlvbnMoY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHRjb25zdCBjZWxsRGVjb3JhdGlvbnMgPSB0aGlzLmNlbGxEZWNvcmF0aW9uSWRzLmdldChjZWxsKSA/PyBbXTtcblx0XHRpZiAoY2VsbERlY29yYXRpb25zKSB7XG5cdFx0XHRjZWxsLmRlbHRhTW9kZWxEZWNvcmF0aW9ucyhjZWxsRGVjb3JhdGlvbnMsIFtdKTtcblx0XHRcdHRoaXMuY2VsbERlY29yYXRpb25JZHMuZGVsZXRlKGNlbGwpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpc3RlbmVyID0gdGhpcy5jZWxsQ29udGVudExpc3RlbmVycy5nZXQoY2VsbC51cmkpO1xuXHRcdGlmIChsaXN0ZW5lcikge1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5jZWxsQ29udGVudExpc3RlbmVycy5kZWxldGUoY2VsbC51cmkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyTm90ZWJvb2tJbmxpbmVEZWNvcmF0aW9ucygpIHtcblx0XHR0aGlzLmNlbGxEZWNvcmF0aW9uSWRzLmZvckVhY2goKF8sIGNlbGwpID0+IHtcblx0XHRcdHRoaXMuY2xlYXJDZWxsSW5saW5lRGVjb3JhdGlvbnMoY2VsbCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJOb3RlYm9va0lubGluZURlY29yYXRpb25zKCkge1xuXHRcdHRoaXMuX2NsZWFyTm90ZWJvb2tJbmxpbmVEZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY2xlYXJOb3RlYm9va0lubGluZURlY29yYXRpb25zKCk7XG5cdFx0dGhpcy5jdXJyZW50Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2VzLmZvckVhY2goc291cmNlID0+IHNvdXJjZS5jYW5jZWwoKSk7XG5cdFx0dGhpcy5jdXJyZW50Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2VzLmNsZWFyKCk7XG5cdFx0dGhpcy5jZWxsQ29udGVudExpc3RlbmVycy5mb3JFYWNoKGxpc3RlbmVyID0+IGxpc3RlbmVyLmRpc3Bvc2UoKSk7XG5cdFx0dGhpcy5jZWxsQ29udGVudExpc3RlbmVycy5jbGVhcigpO1xuXHR9XG59XG5cbnJlZ2lzdGVyTm90ZWJvb2tDb250cmlidXRpb24oTm90ZWJvb2tJbmxpbmVWYXJpYWJsZXNDb250cm9sbGVyLmlkLCBOb3RlYm9va0lubGluZVZhcmlhYmxlc0NvbnRyb2xsZXIpO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2xlYXJOb3RlYm9va0lubGluZVZhbHVlcyBleHRlbmRzIE5vdGVib29rQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay5jbGVhckFsbElubGluZVZhbHVlcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NsZWFyQWxsSW5saW5lVmFsdWVzJywgJ0NsZWFyIEFsbCBJbmxpbmUgVmFsdWVzJyksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3I7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGVkaXRvci5nZXRDb250cmlidXRpb248Tm90ZWJvb2tJbmxpbmVWYXJpYWJsZXNDb250cm9sbGVyPihOb3RlYm9va0lubGluZVZhcmlhYmxlc0NvbnRyb2xsZXIuaWQpO1xuXHRcdGNvbnRyb2xsZXIuY2xlYXJOb3RlYm9va0lubGluZURlY29yYXRpb25zKCk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBYztBQUN2QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyx5QkFBeUI7QUFHbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxlQUFlLGFBQWE7QUFDckMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBMEMsZ0NBQWdDLDZCQUE2QjtBQUN2RyxTQUFTLDhCQUErQztBQUN4RCxTQUFpQyxzQkFBc0I7QUFFdkQsU0FBUyxvQ0FBb0M7QUFFN0MsTUFBTSxjQUFjO0FBQUEsRUFDbkIsWUFBbUIsUUFBdUIsTUFBYztBQUFyQztBQUF1QjtBQUFBLEVBQzFDO0FBQ0Q7QUFFTyxJQUFNLG9DQUFOLGNBQWdELFdBQWtEO0FBQUE7QUFBQSxFQVd4RyxZQUNrQixnQkFDd0IsdUJBQ1EsK0JBQ04seUJBQ0gsc0JBQ1IsY0FDL0I7QUFDRCxVQUFNO0FBUFc7QUFDd0I7QUFDUTtBQUNOO0FBQ0g7QUFDUjtBQWJqQyxTQUFRLG9CQUFvQixvQkFBSSxJQUE4QjtBQUM5RCxTQUFRLHVCQUF1QixJQUFJLFlBQXlCO0FBRTVELFNBQVEsa0NBQWtDLElBQUksWUFBcUM7QUFjbEYsU0FBSyxVQUFVLEtBQUssOEJBQThCLHFCQUFxQixPQUFN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
