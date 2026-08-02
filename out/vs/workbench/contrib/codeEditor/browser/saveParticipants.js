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
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { HierarchicalKind } from "../../../../base/common/hierarchicalKind.js";
import { createCommandUri } from "../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as strings from "../../../../base/common/strings.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { trimTrailingWhitespace } from "../../../../editor/common/commands/trimTrailingWhitespaceCommand.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { CodeActionTriggerType } from "../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { ApplyCodeActionReason, applyCodeAction, getCodeActions } from "../../../../editor/contrib/codeAction/browser/codeAction.js";
import { CodeActionKind, CodeActionTriggerSource } from "../../../../editor/contrib/codeAction/common/types.js";
import { FormattingMode, formatDocumentRangesWithSelectedProvider, formatDocumentWithSelectedProvider } from "../../../../editor/contrib/format/browser/format.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Progress } from "../../../../platform/progress/common/progress.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchContributionsExtensions } from "../../../common/contributions.js";
import { SaveReason } from "../../../common/editor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { getModifiedRanges } from "../../format/browser/formatModified.js";
let TrimWhitespaceParticipant = class {
  constructor(configurationService, codeEditorService) {
    this.configurationService = configurationService;
    this.codeEditorService = codeEditorService;
  }
  async participate(model, context) {
    if (!model.textEditorModel) {
      return;
    }
    const trimTrailingWhitespaceOption = this.configurationService.getValue("files.trimTrailingWhitespace", { overrideIdentifier: model.textEditorModel.getLanguageId(), resource: model.resource });
    const trimInRegexAndStrings = this.configurationService.getValue("files.trimTrailingWhitespaceInRegexAndStrings", { overrideIdentifier: model.textEditorModel.getLanguageId(), resource: model.resource });
    if (trimTrailingWhitespaceOption) {
      this.doTrimTrailingWhitespace(model.textEditorModel, context.reason === SaveReason.AUTO, trimInRegexAndStrings);
    }
  }
  doTrimTrailingWhitespace(model, isAutoSaved, trimInRegexesAndStrings) {
    let prevSelection = [];
    let cursors = [];
    const editor = findEditor(model, this.codeEditorService);
    if (editor) {
      prevSelection = editor.getSelections();
      if (isAutoSaved) {
        cursors = prevSelection.map((s) => s.getPosition());
        const snippetsRange = SnippetController2.get(editor)?.getSessionEnclosingRange();
        if (snippetsRange) {
          for (let lineNumber = snippetsRange.startLineNumber; lineNumber <= snippetsRange.endLineNumber; lineNumber++) {
            cursors.push(new Position(lineNumber, model.getLineMaxColumn(lineNumber)));
          }
        }
      }
    }
    const ops = trimTrailingWhitespace(model, cursors, trimInRegexesAndStrings);
    if (!ops.length) {
      return;
    }
    model.pushEditOperations(prevSelection, ops, (_edits) => prevSelection);
  }
};
TrimWhitespaceParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ICodeEditorService)
], TrimWhitespaceParticipant);
function findEditor(model, codeEditorService) {
  let candidate = null;
  if (model.isAttachedToEditor()) {
    for (const editor of codeEditorService.listCodeEditors()) {
      if (editor.hasModel() && editor.getModel() === model) {
        if (editor.hasTextFocus()) {
          return editor;
        }
        candidate = editor;
      }
    }
  }
  return candidate;
}
let FinalNewLineParticipant = class {
  constructor(configurationService, codeEditorService) {
    this.configurationService = configurationService;
    this.codeEditorService = codeEditorService;
  }
  async participate(model, context) {
    if (!model.textEditorModel) {
      return;
    }
    if (this.configurationService.getValue("files.insertFinalNewline", { overrideIdentifier: model.textEditorModel.getLanguageId(), resource: model.resource })) {
      this.doInsertFinalNewLine(model.textEditorModel);
    }
  }
  doInsertFinalNewLine(model) {
    const lineCount = model.getLineCount();
    const lastLine = model.getLineContent(lineCount);
    const lastLineIsEmptyOrWhitespace = strings.lastNonWhitespaceIndex(lastLine) === -1;
    if (!lineCount || lastLineIsEmptyOrWhitespace) {
      return;
    }
    const edits = [EditOperation.insert(new Position(lineCount, model.getLineMaxColumn(lineCount)), model.getEOL())];
    const editor = findEditor(model, this.codeEditorService);
    if (editor) {
      editor.executeEdits("insertFinalNewLine", edits, editor.getSelections());
    } else {
      model.pushEditOperations([], edits, () => null);
    }
  }
};
FinalNewLineParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ICodeEditorService)
], FinalNewLineParticipant);
let TrimFinalNewLinesParticipant = class {
  constructor(configurationService, codeEditorService) {
    this.configurationService = configurationService;
    this.codeEditorService = codeEditorService;
  }
  async participate(model, context) {
    if (!model.textEditorModel) {
      return;
    }
    if (this.configurationService.getValue("files.trimFinalNewlines", { overrideIdentifier: model.textEditorModel.getLanguageId(), resource: model.resource })) {
      this.doTrimFinalNewLines(model.textEditorModel, context.reason === SaveReason.AUTO);
    }
  }
  /**
   * returns 0 if the entire file is empty
   */
  findLastNonEmptyLine(model) {
    for (let lineNumber = model.getLineCount(); lineNumber >= 1; lineNumber--) {
      const lineLength = model.getLineLength(lineNumber);
      if (lineLength > 0) {
        return lineNumber;
      }
    }
    return 0;
  }
  doTrimFinalNewLines(model, isAutoSaved) {
    const lineCount = model.getLineCount();
    if (lineCount === 1) {
      return;
    }
    let prevSelection = [];
    let cannotTouchLineNumber = 0;
    const editor = findEditor(model, this.codeEditorService);
    if (editor) {
      prevSelection = editor.getSelections();
      if (isAutoSaved) {
        for (let i = 0, len = prevSelection.length; i < len; i++) {
          const positionLineNumber = prevSelection[i].positionLineNumber;
          if (positionLineNumber > cannotTouchLineNumber) {
            cannotTouchLineNumber = positionLineNumber;
          }
        }
      }
    }
    const lastNonEmptyLine = this.findLastNonEmptyLine(model);
    const deleteFromLineNumber = Math.max(lastNonEmptyLine + 1, cannotTouchLineNumber + 1);
    const deletionRange = model.validateRange(new Range(deleteFromLineNumber, 1, lineCount, model.getLineMaxColumn(lineCount)));
    if (deletionRange.isEmpty()) {
      return;
    }
    model.pushEditOperations(prevSelection, [EditOperation.delete(deletionRange)], (_edits) => prevSelection);
    editor?.setSelections(prevSelection);
  }
};
TrimFinalNewLinesParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ICodeEditorService)
], TrimFinalNewLinesParticipant);
let FormatOnSaveParticipant = class {
  constructor(configurationService, codeEditorService, instantiationService) {
    this.configurationService = configurationService;
    this.codeEditorService = codeEditorService;
    this.instantiationService = instantiationService;
  }
  async participate(model, context, progress, token) {
    if (!model.textEditorModel) {
      return;
    }
    if (context.reason === SaveReason.AUTO) {
      return void 0;
    }
    const textEditorModel = model.textEditorModel;
    const overrides = { overrideIdentifier: textEditorModel.getLanguageId(), resource: textEditorModel.uri };
    const nestedProgress = new Progress((provider) => {
      progress.report({
        message: localize(
          { key: "formatting2", comment: ["[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}"] },
          "Running '{0}' Formatter ([configure]({1})).",
          provider.displayName || provider.extensionId && provider.extensionId.value || "???",
          createCommandUri("workbench.action.openSettings", "editor.formatOnSave").toString()
        )
      });
    });
    const enabled = this.configurationService.getValue("editor.formatOnSave", overrides);
    if (!enabled) {
      return void 0;
    }
    const editorOrModel = findEditor(textEditorModel, this.codeEditorService) || textEditorModel;
    const mode = this.configurationService.getValue("editor.formatOnSaveMode", overrides);
    if (mode === "file") {
      await this.instantiationService.invokeFunction(formatDocumentWithSelectedProvider, editorOrModel, FormattingMode.Silent, nestedProgress, token);
    } else {
      const ranges = await this.instantiationService.invokeFunction(getModifiedRanges, isCodeEditor(editorOrModel) ? editorOrModel.getModel() : editorOrModel);
      if (ranges === null && mode === "modificationsIfAvailable") {
        await this.instantiationService.invokeFunction(formatDocumentWithSelectedProvider, editorOrModel, FormattingMode.Silent, nestedProgress, token);
      } else if (ranges) {
        await this.instantiationService.invokeFunction(formatDocumentRangesWithSelectedProvider, editorOrModel, ranges, FormattingMode.Silent, nestedProgress, token, false);
      }
    }
  }
};
FormatOnSaveParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ICodeEditorService),
  __decorateParam(2, IInstantiationService)
], FormatOnSaveParticipant);
let CodeActionOnSaveParticipant = class extends Disposable {
  constructor(configurationService, instantiationService, languageFeaturesService, hostService, editorService, codeEditorService) {
    super();
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.languageFeaturesService = languageFeaturesService;
    this.hostService = hostService;
    this.editorService = editorService;
    this.codeEditorService = codeEditorService;
    this._register(this.hostService.onDidChangeFocus(() => {
      this.triggerCodeActionsCommand();
    }));
    this._register(this.editorService.onDidActiveEditorChange(() => {
      this.triggerCodeActionsCommand();
    }));
  }
  async triggerCodeActionsCommand() {
    if (this.configurationService.getValue("editor.codeActions.triggerOnFocusChange") && this.configurationService.getValue("files.autoSave") === "afterDelay") {
      const model = this.codeEditorService.getActiveCodeEditor()?.getModel();
      if (!model) {
        return void 0;
      }
      const settingsOverrides = { overrideIdentifier: model.getLanguageId(), resource: model.uri };
      const setting = this.configurationService.getValue("editor.codeActionsOnSave", settingsOverrides);
      if (!setting) {
        return void 0;
      }
      if (Array.isArray(setting)) {
        return void 0;
      }
      const settingItems = Object.keys(setting).filter((x) => setting[x] && setting[x] === "always" && CodeActionKind.Source.contains(new HierarchicalKind(x)));
      const cancellationTokenSource = new CancellationTokenSource();
      const codeActionKindList = [];
      for (const item of settingItems) {
        codeActionKindList.push(new HierarchicalKind(item));
      }
      await this.applyOnSaveActions(model, codeActionKindList, [], Progress.None, cancellationTokenSource.token);
    }
  }
  async participate(model, context, progress, token) {
    if (!model.textEditorModel) {
      return;
    }
    const textEditorModel = model.textEditorModel;
    const settingsOverrides = { overrideIdentifier: textEditorModel.getLanguageId(), resource: textEditorModel.uri };
    const setting = this.configurationService.getValue("editor.codeActionsOnSave", settingsOverrides);
    if (!setting) {
      return void 0;
    }
    if (context.reason === SaveReason.AUTO) {
      return void 0;
    }
    if (context.reason !== SaveReason.EXPLICIT && Array.isArray(setting)) {
      return void 0;
    }
    const settingItems = Array.isArray(setting) ? setting : Object.keys(setting).filter((x) => setting[x] && setting[x] !== "never");
    const codeActionsOnSave = this.createCodeActionsOnSave(settingItems);
    if (!Array.isArray(setting)) {
      codeActionsOnSave.sort((a, b) => {
        if (CodeActionKind.SourceFixAll.contains(a)) {
          if (CodeActionKind.SourceFixAll.contains(b)) {
            return 0;
          }
          return -1;
        }
        if (CodeActionKind.SourceFixAll.contains(b)) {
          return 1;
        }
        return 0;
      });
    }
    if (!codeActionsOnSave.length) {
      return void 0;
    }
    const excludedActions = Array.isArray(setting) ? [] : Object.keys(setting).filter((x) => setting[x] === "never" || false).map((x) => new HierarchicalKind(x));
    progress.report({ message: localize("codeaction", "Quick Fixes") });
    const filteredSaveList = Array.isArray(setting) ? codeActionsOnSave : codeActionsOnSave.filter((x) => setting[x.value] === "always" || (setting[x.value] === "explicit" || setting[x.value] === true) && context.reason === SaveReason.EXPLICIT);
    await this.applyOnSaveActions(textEditorModel, filteredSaveList, excludedActions, progress, token);
  }
  createCodeActionsOnSave(settingItems) {
    const kinds = settingItems.map((x) => new HierarchicalKind(x));
    return kinds.filter((kind) => {
      return kinds.every((otherKind) => otherKind.equals(kind) || !otherKind.contains(kind));
    });
  }
  async applyOnSaveActions(model, codeActionsOnSave, excludes, progress, token) {
    const getActionProgress = new class {
      constructor() {
        this._names = /* @__PURE__ */ new Set();
      }
      _report() {
        progress.report({
          message: localize(
            { key: "codeaction.get2", comment: ["[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}"] },
            "Getting code actions from {0} ([configure]({1})).",
            [...this._names].map((name) => `'${name}'`).join(", "),
            createCommandUri("workbench.action.openSettings", "editor.codeActionsOnSave").toString()
          )
        });
      }
      report(provider) {
        if (provider.displayName && !this._names.has(provider.displayName)) {
          this._names.add(provider.displayName);
          this._report();
        }
      }
    }();
    for (const codeActionKind of codeActionsOnSave) {
      const actionsToRun = await this.getActionsToRun(model, codeActionKind, excludes, getActionProgress, token);
      if (token.isCancellationRequested) {
        actionsToRun.dispose();
        return;
      }
      try {
        for (const action of actionsToRun.validActions) {
          progress.report({ message: localize("codeAction.apply", "Applying code action '{0}'.", action.action.title) });
          await this.instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
          if (token.isCancellationRequested) {
            return;
          }
        }
      } catch {
      } finally {
        actionsToRun.dispose();
      }
    }
  }
  getActionsToRun(model, codeActionKind, excludes, progress, token) {
    return getCodeActions(this.languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), {
      type: CodeActionTriggerType.Auto,
      triggerAction: CodeActionTriggerSource.OnSave,
      filter: { include: codeActionKind, excludes, includeSourceActions: true }
    }, progress, token);
  }
};
CodeActionOnSaveParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, IHostService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, ICodeEditorService)
], CodeActionOnSaveParticipant);
let SaveParticipantsContribution = class extends Disposable {
  constructor(instantiationService, textFileService) {
    super();
    this.instantiationService = instantiationService;
    this.textFileService = textFileService;
    this.registerSaveParticipants();
  }
  registerSaveParticipants() {
    this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(TrimWhitespaceParticipant)));
    this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(CodeActionOnSaveParticipant)));
    this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(FormatOnSaveParticipant)));
    this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(FinalNewLineParticipant)));
    this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(TrimFinalNewLinesParticipant)));
  }
};
SaveParticipantsContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ITextFileService)
], SaveParticipantsContribution);
const workbenchContributionsRegistry = Registry.as(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(SaveParticipantsContribution, LifecyclePhase.Restored);
export {
  FinalNewLineParticipant,
  SaveParticipantsContribution,
  TrimFinalNewLinesParticipant,
  TrimWhitespaceParticipant
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9zYXZlUGFydGljaXBhbnRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEhpZXJhcmNoaWNhbEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oaWVyYXJjaGljYWxLaW5kLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbW1hbmRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0cmltVHJhaWxpbmdXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb21tYW5kcy90cmltVHJhaWxpbmdXaGl0ZXNwYWNlQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uUHJvdmlkZXIsIENvZGVBY3Rpb25UcmlnZ2VyVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBBcHBseUNvZGVBY3Rpb25SZWFzb24sIGFwcGx5Q29kZUFjdGlvbiwgZ2V0Q29kZUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2Jyb3dzZXIvY29kZUFjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uS2luZCwgQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBGb3JtYXR0aW5nTW9kZSwgZm9ybWF0RG9jdW1lbnRSYW5nZXNXaXRoU2VsZWN0ZWRQcm92aWRlciwgZm9ybWF0RG9jdW1lbnRXaXRoU2VsZWN0ZWRQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Zvcm1hdC9icm93c2VyL2Zvcm1hdC5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3MsIElQcm9ncmVzc1N0ZXAsIFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoQ29udHJpYnV0aW9uc0V4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBTYXZlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZUVkaXRvck1vZGVsLCBJVGV4dEZpbGVTYXZlUGFydGljaXBhbnQsIElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudENvbnRleHQsIElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IGdldE1vZGlmaWVkUmFuZ2VzIH0gZnJvbSAnLi4vLi4vZm9ybWF0L2Jyb3dzZXIvZm9ybWF0TW9kaWZpZWQuanMnO1xuXG5leHBvcnQgY2xhc3MgVHJpbVdoaXRlc3BhY2VQYXJ0aWNpcGFudCBpbXBsZW1lbnRzIElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2Vcblx0KSB7XG5cdFx0Ly8gTm90aGluZ1xuXHR9XG5cblx0YXN5bmMgcGFydGljaXBhdGUobW9kZWw6IElUZXh0RmlsZUVkaXRvck1vZGVsLCBjb250ZXh0OiBJVGV4dEZpbGVTYXZlUGFydGljaXBhbnRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFtb2RlbC50ZXh0RWRpdG9yTW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0cmltVHJhaWxpbmdXaGl0ZXNwYWNlT3B0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZmlsZXMudHJpbVRyYWlsaW5nV2hpdGVzcGFjZScsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiBtb2RlbC50ZXh0RWRpdG9yTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCByZXNvdXJjZTogbW9kZWwucmVzb3VyY2UgfSk7XG5cdFx0Y29uc3QgdHJpbUluUmVnZXhBbmRTdHJpbmdzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZmlsZXMudHJpbVRyYWlsaW5nV2hpdGVzcGFjZUluUmVnZXhBbmRTdHJpbmdzJywgeyBvdmVycmlkZUlkZW50aWZpZXI6IG1vZGVsLnRleHRFZGl0b3JNb2RlbC5nZXRMYW5ndWFnZUlkKCksIHJlc291cmNlOiBtb2RlbC5yZXNvdXJjZSB9KTtcblx0XHRpZiAodHJpbVRyYWlsaW5nV2hpdGVzcGFjZU9wdGlvbikge1xuXHRcdFx0dGhpcy5kb1RyaW1UcmFpbGluZ1doaXRlc3BhY2UobW9kZWwudGV4dEVkaXRvck1vZGVsLCBjb250ZXh0LnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5BVVRPLCB0cmltSW5SZWdleEFuZFN0cmluZ3MpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9UcmltVHJhaWxpbmdXaGl0ZXNwYWNlKG1vZGVsOiBJVGV4dE1vZGVsLCBpc0F1dG9TYXZlZDogYm9vbGVhbiwgdHJpbUluUmVnZXhlc0FuZFN0cmluZ3M6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRsZXQgcHJldlNlbGVjdGlvbjogU2VsZWN0aW9uW10gPSBbXTtcblx0XHRsZXQgY3Vyc29yczogUG9zaXRpb25bXSA9IFtdO1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gZmluZEVkaXRvcihtb2RlbCwgdGhpcy5jb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0Ly8gRmluZCBgcHJldlNlbGVjdGlvbmAgaW4gYW55IGNhc2UgZG8gZW5zdXJlIGEgZ29vZCB1bmRvIHN0YWNrIHdoZW4gcHVzaGluZyB0aGUgZWRpdFxuXHRcdFx0Ly8gQ29sbGVjdCBhY3RpdmUgY3Vyc29ycyBpbiBgY3Vyc29yc2Agb25seSBpZiBgaXNBdXRvU2F2ZWRgIHRvIGF2b2lkIGhhdmluZyB0aGUgY3Vyc29ycyBqdW1wXG5cdFx0XHRwcmV2U2VsZWN0aW9uID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRcdGlmIChpc0F1dG9TYXZlZCkge1xuXHRcdFx0XHRjdXJzb3JzID0gcHJldlNlbGVjdGlvbi5tYXAocyA9PiBzLmdldFBvc2l0aW9uKCkpO1xuXHRcdFx0XHRjb25zdCBzbmlwcGV0c1JhbmdlID0gU25pcHBldENvbnRyb2xsZXIyLmdldChlZGl0b3IpPy5nZXRTZXNzaW9uRW5jbG9zaW5nUmFuZ2UoKTtcblx0XHRcdFx0aWYgKHNuaXBwZXRzUmFuZ2UpIHtcblx0XHRcdFx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc25pcHBldHNSYW5nZS5zdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gc25pcHBldHNSYW5nZS5lbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdFx0XHRcdGN1cnNvcnMucHVzaChuZXcgUG9zaXRpb24obGluZU51bWJlciwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG9wcyA9IHRyaW1UcmFpbGluZ1doaXRlc3BhY2UobW9kZWwsIGN1cnNvcnMsIHRyaW1JblJlZ2V4ZXNBbmRTdHJpbmdzKTtcblx0XHRpZiAoIW9wcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjsgLy8gTm90aGluZyB0byBkb1xuXHRcdH1cblxuXHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhwcmV2U2VsZWN0aW9uLCBvcHMsIChfZWRpdHMpID0+IHByZXZTZWxlY3Rpb24pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZpbmRFZGl0b3IobW9kZWw6IElUZXh0TW9kZWwsIGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UpOiBJQWN0aXZlQ29kZUVkaXRvciB8IG51bGwge1xuXHRsZXQgY2FuZGlkYXRlOiBJQWN0aXZlQ29kZUVkaXRvciB8IG51bGwgPSBudWxsO1xuXG5cdGlmIChtb2RlbC5pc0F0dGFjaGVkVG9FZGl0b3IoKSkge1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGNvZGVFZGl0b3JTZXJ2aWNlLmxpc3RDb2RlRWRpdG9ycygpKSB7XG5cdFx0XHRpZiAoZWRpdG9yLmhhc01vZGVsKCkgJiYgZWRpdG9yLmdldE1vZGVsKCkgPT09IG1vZGVsKSB7XG5cdFx0XHRcdGlmIChlZGl0b3IuaGFzVGV4dEZvY3VzKCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZWRpdG9yOyAvLyBmYXZvdXIgZm9jdXNlZCBlZGl0b3IgaWYgdGhlcmUgYXJlIG11bHRpcGxlXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjYW5kaWRhdGUgPSBlZGl0b3I7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGNhbmRpZGF0ZTtcbn1cblxuZXhwb3J0IGNsYXNzIEZpbmFsTmV3TGluZVBhcnRpY2lwYW50IGltcGxlbWVudHMgSVRleHRGaWxlU2F2ZVBhcnRpY2lwYW50IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZVxuXHQpIHtcblx0XHQvLyBOb3RoaW5nXG5cdH1cblxuXHRhc3luYyBwYXJ0aWNpcGF0ZShtb2RlbDogSVRleHRGaWxlRWRpdG9yTW9kZWwsIGNvbnRleHQ6IElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudENvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIW1vZGVsLnRleHRFZGl0b3JNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdmaWxlcy5pbnNlcnRGaW5hbE5ld2xpbmUnLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogbW9kZWwudGV4dEVkaXRvck1vZGVsLmdldExhbmd1YWdlSWQoKSwgcmVzb3VyY2U6IG1vZGVsLnJlc291cmNlIH0pKSB7XG5cdFx0XHR0aGlzLmRvSW5zZXJ0RmluYWxOZXdMaW5lKG1vZGVsLnRleHRFZGl0b3JNb2RlbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb0luc2VydEZpbmFsTmV3TGluZShtb2RlbDogSVRleHRNb2RlbCk6IHZvaWQge1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IGxhc3RMaW5lID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZUNvdW50KTtcblx0XHRjb25zdCBsYXN0TGluZUlzRW1wdHlPcldoaXRlc3BhY2UgPSBzdHJpbmdzLmxhc3ROb25XaGl0ZXNwYWNlSW5kZXgobGFzdExpbmUpID09PSAtMTtcblxuXHRcdGlmICghbGluZUNvdW50IHx8IGxhc3RMaW5lSXNFbXB0eU9yV2hpdGVzcGFjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRzID0gW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbihsaW5lQ291bnQsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZUNvdW50KSksIG1vZGVsLmdldEVPTCgpKV07XG5cdFx0Y29uc3QgZWRpdG9yID0gZmluZEVkaXRvcihtb2RlbCwgdGhpcy5jb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cygnaW5zZXJ0RmluYWxOZXdMaW5lJywgZWRpdHMsIGVkaXRvci5nZXRTZWxlY3Rpb25zKCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMoW10sIGVkaXRzLCAoKSA9PiBudWxsKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRyaW1GaW5hbE5ld0xpbmVzUGFydGljaXBhbnQgaW1wbGVtZW50cyBJVGV4dEZpbGVTYXZlUGFydGljaXBhbnQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlXG5cdCkge1xuXHRcdC8vIE5vdGhpbmdcblx0fVxuXG5cdGFzeW5jIHBhcnRpY2lwYXRlKG1vZGVsOiBJVGV4dEZpbGVFZGl0b3JNb2RlbCwgY29udGV4dDogSVRleHRGaWxlU2F2ZVBhcnRpY2lwYW50Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghbW9kZWwudGV4dEVkaXRvck1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2ZpbGVzLnRyaW1GaW5hbE5ld2xpbmVzJywgeyBvdmVycmlkZUlkZW50aWZpZXI6IG1vZGVsLnRleHRFZGl0b3JNb2RlbC5nZXRMYW5ndWFnZUlkKCksIHJlc291cmNlOiBtb2RlbC5yZXNvdXJjZSB9KSkge1xuXHRcdFx0dGhpcy5kb1RyaW1GaW5hbE5ld0xpbmVzKG1vZGVsLnRleHRFZGl0b3JNb2RlbCwgY29udGV4dC5yZWFzb24gPT09IFNhdmVSZWFzb24uQVVUTyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIHJldHVybnMgMCBpZiB0aGUgZW50aXJlIGZpbGUgaXMgZW1wdHlcblx0ICovXG5cdHByaXZhdGUgZmluZExhc3ROb25FbXB0eUxpbmUobW9kZWw6IElUZXh0TW9kZWwpOiBudW1iZXIge1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTsgbGluZU51bWJlciA+PSAxOyBsaW5lTnVtYmVyLS0pIHtcblx0XHRcdGNvbnN0IGxpbmVMZW5ndGggPSBtb2RlbC5nZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKGxpbmVMZW5ndGggPiAwKSB7XG5cdFx0XHRcdC8vIHRoaXMgbGluZSBoYXMgY29udGVudFxuXHRcdFx0XHRyZXR1cm4gbGluZU51bWJlcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gbm8gbGluZSBoYXMgY29udGVudFxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1RyaW1GaW5hbE5ld0xpbmVzKG1vZGVsOiBJVGV4dE1vZGVsLCBpc0F1dG9TYXZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXG5cdFx0Ly8gRG8gbm90IGluc2VydCBuZXcgbGluZSBpZiBmaWxlIGRvZXMgbm90IGVuZCB3aXRoIG5ldyBsaW5lXG5cdFx0aWYgKGxpbmVDb3VudCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBwcmV2U2VsZWN0aW9uOiBTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdGxldCBjYW5ub3RUb3VjaExpbmVOdW1iZXIgPSAwO1xuXHRcdGNvbnN0IGVkaXRvciA9IGZpbmRFZGl0b3IobW9kZWwsIHRoaXMuY29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdHByZXZTZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0aWYgKGlzQXV0b1NhdmVkKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBwcmV2U2VsZWN0aW9uLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgcG9zaXRpb25MaW5lTnVtYmVyID0gcHJldlNlbGVjdGlvbltpXS5wb3NpdGlvbkxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0aWYgKHBvc2l0aW9uTGluZU51bWJlciA+IGNhbm5vdFRvdWNoTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0Y2Fubm90VG91Y2hMaW5lTnVtYmVyID0gcG9zaXRpb25MaW5lTnVtYmVyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3ROb25FbXB0eUxpbmUgPSB0aGlzLmZpbmRMYXN0Tm9uRW1wdHlMaW5lKG1vZGVsKTtcblx0XHRjb25zdCBkZWxldGVGcm9tTGluZU51bWJlciA9IE1hdGgubWF4KGxhc3ROb25FbXB0eUxpbmUgKyAxLCBjYW5ub3RUb3VjaExpbmVOdW1iZXIgKyAxKTtcblx0XHRjb25zdCBkZWxldGlvblJhbmdlID0gbW9kZWwudmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoZGVsZXRlRnJvbUxpbmVOdW1iZXIsIDEsIGxpbmVDb3VudCwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lQ291bnQpKSk7XG5cblx0XHRpZiAoZGVsZXRpb25SYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRtb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMocHJldlNlbGVjdGlvbiwgW0VkaXRPcGVyYXRpb24uZGVsZXRlKGRlbGV0aW9uUmFuZ2UpXSwgX2VkaXRzID0+IHByZXZTZWxlY3Rpb24pO1xuXG5cdFx0ZWRpdG9yPy5zZXRTZWxlY3Rpb25zKHByZXZTZWxlY3Rpb24pO1xuXHR9XG59XG5cbmNsYXNzIEZvcm1hdE9uU2F2ZVBhcnRpY2lwYW50IGltcGxlbWVudHMgSVRleHRGaWxlU2F2ZVBhcnRpY2lwYW50IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0Ly8gTm90aGluZ1xuXHR9XG5cblx0YXN5bmMgcGFydGljaXBhdGUobW9kZWw6IElUZXh0RmlsZUVkaXRvck1vZGVsLCBjb250ZXh0OiBJVGV4dEZpbGVTYXZlUGFydGljaXBhbnRDb250ZXh0LCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIW1vZGVsLnRleHRFZGl0b3JNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoY29udGV4dC5yZWFzb24gPT09IFNhdmVSZWFzb24uQVVUTykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0RWRpdG9yTW9kZWwgPSBtb2RlbC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzID0geyBvdmVycmlkZUlkZW50aWZpZXI6IHRleHRFZGl0b3JNb2RlbC5nZXRMYW5ndWFnZUlkKCksIHJlc291cmNlOiB0ZXh0RWRpdG9yTW9kZWwudXJpIH07XG5cblx0XHRjb25zdCBuZXN0ZWRQcm9ncmVzcyA9IG5ldyBQcm9ncmVzczx7IGRpc3BsYXlOYW1lPzogc3RyaW5nOyBleHRlbnNpb25JZD86IEV4dGVuc2lvbklkZW50aWZpZXIgfT4ocHJvdmlkZXIgPT4ge1xuXHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHtcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoXG5cdFx0XHRcdFx0eyBrZXk6ICdmb3JtYXR0aW5nMicsIGNvbW1lbnQ6IFsnW2NvbmZpZ3VyZV0oezF9KSBpcyBhIGxpbmsuIE9ubHkgdHJhbnNsYXRlIGBjb25maWd1cmVgLiBEbyBub3QgY2hhbmdlIGJyYWNrZXRzIGFuZCBwYXJlbnRoZXNlcyBvciB7MX0nXSB9LFxuXHRcdFx0XHRcdFwiUnVubmluZyAnezB9JyBGb3JtYXR0ZXIgKFtjb25maWd1cmVdKHsxfSkpLlwiLFxuXHRcdFx0XHRcdHByb3ZpZGVyLmRpc3BsYXlOYW1lIHx8IHByb3ZpZGVyLmV4dGVuc2lvbklkICYmIHByb3ZpZGVyLmV4dGVuc2lvbklkLnZhbHVlIHx8ICc/Pz8nLFxuXHRcdFx0XHRcdGNyZWF0ZUNvbW1hbmRVcmkoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgJ2VkaXRvci5mb3JtYXRPblNhdmUnKS50b1N0cmluZygpLFxuXHRcdFx0XHQpXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdlZGl0b3IuZm9ybWF0T25TYXZlJywgb3ZlcnJpZGVzKTtcblx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yT3JNb2RlbCA9IGZpbmRFZGl0b3IodGV4dEVkaXRvck1vZGVsLCB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlKSB8fCB0ZXh0RWRpdG9yTW9kZWw7XG5cdFx0Y29uc3QgbW9kZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2ZpbGUnIHwgJ21vZGlmaWNhdGlvbnMnIHwgJ21vZGlmaWNhdGlvbnNJZkF2YWlsYWJsZSc+KCdlZGl0b3IuZm9ybWF0T25TYXZlTW9kZScsIG92ZXJyaWRlcyk7XG5cblx0XHRpZiAobW9kZSA9PT0gJ2ZpbGUnKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZvcm1hdERvY3VtZW50V2l0aFNlbGVjdGVkUHJvdmlkZXIsIGVkaXRvck9yTW9kZWwsIEZvcm1hdHRpbmdNb2RlLlNpbGVudCwgbmVzdGVkUHJvZ3Jlc3MsIHRva2VuKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCByYW5nZXMgPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGdldE1vZGlmaWVkUmFuZ2VzLCBpc0NvZGVFZGl0b3IoZWRpdG9yT3JNb2RlbCkgPyBlZGl0b3JPck1vZGVsLmdldE1vZGVsKCkgOiBlZGl0b3JPck1vZGVsKTtcblx0XHRcdGlmIChyYW5nZXMgPT09IG51bGwgJiYgbW9kZSA9PT0gJ21vZGlmaWNhdGlvbnNJZkF2YWlsYWJsZScpIHtcblx0XHRcdFx0Ly8gbm8gU0NNLCBmYWxsYmFjayB0byBmb3JtYXR0aW5nIHRoZSB3aG9sZSBmaWxlIGlmZiB3YW50ZWRcblx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmb3JtYXREb2N1bWVudFdpdGhTZWxlY3RlZFByb3ZpZGVyLCBlZGl0b3JPck1vZGVsLCBGb3JtYXR0aW5nTW9kZS5TaWxlbnQsIG5lc3RlZFByb2dyZXNzLCB0b2tlbik7XG5cblx0XHRcdH0gZWxzZSBpZiAocmFuZ2VzKSB7XG5cdFx0XHRcdC8vIGZvcm1hdHRlZCBtb2RpZmllZCByYW5nZXNcblx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmb3JtYXREb2N1bWVudFJhbmdlc1dpdGhTZWxlY3RlZFByb3ZpZGVyLCBlZGl0b3JPck1vZGVsLCByYW5nZXMsIEZvcm1hdHRpbmdNb2RlLlNpbGVudCwgbmVzdGVkUHJvZ3Jlc3MsIHRva2VuLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIENvZGVBY3Rpb25PblNhdmVQYXJ0aWNpcGFudCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGV4dEZpbGVTYXZlUGFydGljaXBhbnQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3N0U2VydmljZS5vbkRpZENoYW5nZUZvY3VzKCgpID0+IHsgdGhpcy50cmlnZ2VyQ29kZUFjdGlvbnNDb21tYW5kKCk7IH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4geyB0aGlzLnRyaWdnZXJDb2RlQWN0aW9uc0NvbW1hbmQoKTsgfSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0cmlnZ2VyQ29kZUFjdGlvbnNDb21tYW5kKCkge1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdlZGl0b3IuY29kZUFjdGlvbnMudHJpZ2dlck9uRm9jdXNDaGFuZ2UnKSAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2ZpbGVzLmF1dG9TYXZlJykgPT09ICdhZnRlckRlbGF5Jykge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKT8uZ2V0TW9kZWwoKTtcblx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2V0dGluZ3NPdmVycmlkZXMgPSB7IG92ZXJyaWRlSWRlbnRpZmllcjogbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCByZXNvdXJjZTogbW9kZWwudXJpIH07XG5cdFx0XHRjb25zdCBzZXR0aW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IFtraW5kOiBzdHJpbmddOiBzdHJpbmcgfCBib29sZWFuIH0gfCBzdHJpbmdbXT4oJ2VkaXRvci5jb2RlQWN0aW9uc09uU2F2ZScsIHNldHRpbmdzT3ZlcnJpZGVzKTtcblxuXHRcdFx0aWYgKCFzZXR0aW5nKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHNldHRpbmcpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNldHRpbmdJdGVtczogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhzZXR0aW5nKS5maWx0ZXIoeCA9PiBzZXR0aW5nW3hdICYmIHNldHRpbmdbeF0gPT09ICdhbHdheXMnICYmIENvZGVBY3Rpb25LaW5kLlNvdXJjZS5jb250YWlucyhuZXcgSGllcmFyY2hpY2FsS2luZCh4KSkpO1xuXG5cdFx0XHRjb25zdCBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0XHRjb25zdCBjb2RlQWN0aW9uS2luZExpc3QgPSBbXTtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBzZXR0aW5nSXRlbXMpIHtcblx0XHRcdFx0Y29kZUFjdGlvbktpbmRMaXN0LnB1c2gobmV3IEhpZXJhcmNoaWNhbEtpbmQoaXRlbSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBydW4gY29kZSBhY3Rpb25zIGJhc2VkIG9uIHdoYXQgaXMgZm91bmQgZnJvbSBzZXR0aW5nID09PSAnYWx3YXlzJywgbm8gZXhjbHVzaW9ucy5cblx0XHRcdGF3YWl0IHRoaXMuYXBwbHlPblNhdmVBY3Rpb25zKG1vZGVsLCBjb2RlQWN0aW9uS2luZExpc3QsIFtdLCBQcm9ncmVzcy5Ob25lLCBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcGFydGljaXBhdGUobW9kZWw6IElUZXh0RmlsZUVkaXRvck1vZGVsLCBjb250ZXh0OiBJVGV4dEZpbGVTYXZlUGFydGljaXBhbnRDb250ZXh0LCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIW1vZGVsLnRleHRFZGl0b3JNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHRFZGl0b3JNb2RlbCA9IG1vZGVsLnRleHRFZGl0b3JNb2RlbDtcblx0XHRjb25zdCBzZXR0aW5nc092ZXJyaWRlcyA9IHsgb3ZlcnJpZGVJZGVudGlmaWVyOiB0ZXh0RWRpdG9yTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCByZXNvdXJjZTogdGV4dEVkaXRvck1vZGVsLnVyaSB9O1xuXG5cdFx0Ly8gQ29udmVydCBib29sZWFuIHZhbHVlcyB0byBzdHJpbmdzXG5cdFx0Y29uc3Qgc2V0dGluZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBba2luZDogc3RyaW5nXTogc3RyaW5nIHwgYm9vbGVhbiB9IHwgc3RyaW5nW10+KCdlZGl0b3IuY29kZUFjdGlvbnNPblNhdmUnLCBzZXR0aW5nc092ZXJyaWRlcyk7XG5cdFx0aWYgKCFzZXR0aW5nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChjb250ZXh0LnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5BVVRPKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChjb250ZXh0LnJlYXNvbiAhPT0gU2F2ZVJlYXNvbi5FWFBMSUNJVCAmJiBBcnJheS5pc0FycmF5KHNldHRpbmcpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNldHRpbmdJdGVtczogc3RyaW5nW10gPSBBcnJheS5pc0FycmF5KHNldHRpbmcpXG5cdFx0XHQ/IHNldHRpbmdcblx0XHRcdDogT2JqZWN0LmtleXMoc2V0dGluZykuZmlsdGVyKHggPT4gc2V0dGluZ1t4XSAmJiBzZXR0aW5nW3hdICE9PSAnbmV2ZXInKTtcblxuXHRcdGNvbnN0IGNvZGVBY3Rpb25zT25TYXZlID0gdGhpcy5jcmVhdGVDb2RlQWN0aW9uc09uU2F2ZShzZXR0aW5nSXRlbXMpO1xuXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHNldHRpbmcpKSB7XG5cdFx0XHRjb2RlQWN0aW9uc09uU2F2ZS5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdGlmIChDb2RlQWN0aW9uS2luZC5Tb3VyY2VGaXhBbGwuY29udGFpbnMoYSkpIHtcblx0XHRcdFx0XHRpZiAoQ29kZUFjdGlvbktpbmQuU291cmNlRml4QWxsLmNvbnRhaW5zKGIpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChDb2RlQWN0aW9uS2luZC5Tb3VyY2VGaXhBbGwuY29udGFpbnMoYikpIHtcblx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICghY29kZUFjdGlvbnNPblNhdmUubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBleGNsdWRlZEFjdGlvbnMgPSBBcnJheS5pc0FycmF5KHNldHRpbmcpXG5cdFx0XHQ/IFtdXG5cdFx0XHQ6IE9iamVjdC5rZXlzKHNldHRpbmcpXG5cdFx0XHRcdC5maWx0ZXIoeCA9PiBzZXR0aW5nW3hdID09PSAnbmV2ZXInIHx8IGZhbHNlKVxuXHRcdFx0XHQubWFwKHggPT4gbmV3IEhpZXJhcmNoaWNhbEtpbmQoeCkpO1xuXG5cdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ2NvZGVhY3Rpb24nLCBcIlF1aWNrIEZpeGVzXCIpIH0pO1xuXG5cdFx0Y29uc3QgZmlsdGVyZWRTYXZlTGlzdCA9IEFycmF5LmlzQXJyYXkoc2V0dGluZykgPyBjb2RlQWN0aW9uc09uU2F2ZSA6IGNvZGVBY3Rpb25zT25TYXZlLmZpbHRlcih4ID0+IHNldHRpbmdbeC52YWx1ZV0gPT09ICdhbHdheXMnIHx8ICgoc2V0dGluZ1t4LnZhbHVlXSA9PT0gJ2V4cGxpY2l0JyB8fCBzZXR0aW5nW3gudmFsdWVdID09PSB0cnVlKSAmJiBjb250ZXh0LnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5FWFBMSUNJVCkpO1xuXG5cdFx0YXdhaXQgdGhpcy5hcHBseU9uU2F2ZUFjdGlvbnModGV4dEVkaXRvck1vZGVsLCBmaWx0ZXJlZFNhdmVMaXN0LCBleGNsdWRlZEFjdGlvbnMsIHByb2dyZXNzLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvZGVBY3Rpb25zT25TYXZlKHNldHRpbmdJdGVtczogcmVhZG9ubHkgc3RyaW5nW10pOiBIaWVyYXJjaGljYWxLaW5kW10ge1xuXHRcdGNvbnN0IGtpbmRzID0gc2V0dGluZ0l0ZW1zLm1hcCh4ID0+IG5ldyBIaWVyYXJjaGljYWxLaW5kKHgpKTtcblxuXHRcdC8vIFJlbW92ZSBzdWJzZXRzXG5cdFx0cmV0dXJuIGtpbmRzLmZpbHRlcihraW5kID0+IHtcblx0XHRcdHJldHVybiBraW5kcy5ldmVyeShvdGhlcktpbmQgPT4gb3RoZXJLaW5kLmVxdWFscyhraW5kKSB8fCAhb3RoZXJLaW5kLmNvbnRhaW5zKGtpbmQpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXBwbHlPblNhdmVBY3Rpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCBjb2RlQWN0aW9uc09uU2F2ZTogcmVhZG9ubHkgSGllcmFyY2hpY2FsS2luZFtdLCBleGNsdWRlczogcmVhZG9ubHkgSGllcmFyY2hpY2FsS2luZFtdLCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IGdldEFjdGlvblByb2dyZXNzID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSVByb2dyZXNzPENvZGVBY3Rpb25Qcm92aWRlcj4ge1xuXHRcdFx0cHJpdmF0ZSBfbmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdHByaXZhdGUgX3JlcG9ydCgpOiB2b2lkIHtcblx0XHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHtcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZShcblx0XHRcdFx0XHRcdHsga2V5OiAnY29kZWFjdGlvbi5nZXQyJywgY29tbWVudDogWydbY29uZmlndXJlXSh7MX0pIGlzIGEgbGluay4gT25seSB0cmFuc2xhdGUgYGNvbmZpZ3VyZWAuIERvIG5vdCBjaGFuZ2UgYnJhY2tldHMgYW5kIHBhcmVudGhlc2VzIG9yIHsxfSddIH0sXG5cdFx0XHRcdFx0XHRcIkdldHRpbmcgY29kZSBhY3Rpb25zIGZyb20gezB9IChbY29uZmlndXJlXSh7MX0pKS5cIixcblx0XHRcdFx0XHRcdFsuLi50aGlzLl9uYW1lc10ubWFwKG5hbWUgPT4gYCcke25hbWV9J2ApLmpvaW4oJywgJyksXG5cdFx0XHRcdFx0XHRjcmVhdGVDb21tYW5kVXJpKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncycsICdlZGl0b3IuY29kZUFjdGlvbnNPblNhdmUnKS50b1N0cmluZygpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJlcG9ydChwcm92aWRlcjogQ29kZUFjdGlvblByb3ZpZGVyKSB7XG5cdFx0XHRcdGlmIChwcm92aWRlci5kaXNwbGF5TmFtZSAmJiAhdGhpcy5fbmFtZXMuaGFzKHByb3ZpZGVyLmRpc3BsYXlOYW1lKSkge1xuXHRcdFx0XHRcdHRoaXMuX25hbWVzLmFkZChwcm92aWRlci5kaXNwbGF5TmFtZSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVwb3J0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCBjb2RlQWN0aW9uS2luZCBvZiBjb2RlQWN0aW9uc09uU2F2ZSkge1xuXHRcdFx0Y29uc3QgYWN0aW9uc1RvUnVuID0gYXdhaXQgdGhpcy5nZXRBY3Rpb25zVG9SdW4obW9kZWwsIGNvZGVBY3Rpb25LaW5kLCBleGNsdWRlcywgZ2V0QWN0aW9uUHJvZ3Jlc3MsIHRva2VuKTtcblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdGFjdGlvbnNUb1J1bi5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9uc1RvUnVuLnZhbGlkQWN0aW9ucykge1xuXHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdjb2RlQWN0aW9uLmFwcGx5JywgXCJBcHBseWluZyBjb2RlIGFjdGlvbiAnezB9Jy5cIiwgYWN0aW9uLmFjdGlvbi50aXRsZSkgfSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhcHBseUNvZGVBY3Rpb24sIGFjdGlvbiwgQXBwbHlDb2RlQWN0aW9uUmVhc29uLk9uU2F2ZSwge30sIHRva2VuKTtcblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBGYWlsdXJlIHRvIGFwcGx5IGEgY29kZSBhY3Rpb24gc2hvdWxkIG5vdCBibG9jayBvdGhlciBvbiBzYXZlIGFjdGlvbnNcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGFjdGlvbnNUb1J1bi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3Rpb25zVG9SdW4obW9kZWw6IElUZXh0TW9kZWwsIGNvZGVBY3Rpb25LaW5kOiBIaWVyYXJjaGljYWxLaW5kLCBleGNsdWRlczogcmVhZG9ubHkgSGllcmFyY2hpY2FsS2luZFtdLCBwcm9ncmVzczogSVByb2dyZXNzPENvZGVBY3Rpb25Qcm92aWRlcj4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdHJldHVybiBnZXRDb2RlQWN0aW9ucyh0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVBY3Rpb25Qcm92aWRlciwgbW9kZWwsIG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksIHtcblx0XHRcdHR5cGU6IENvZGVBY3Rpb25UcmlnZ2VyVHlwZS5BdXRvLFxuXHRcdFx0dHJpZ2dlckFjdGlvbjogQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UuT25TYXZlLFxuXHRcdFx0ZmlsdGVyOiB7IGluY2x1ZGU6IGNvZGVBY3Rpb25LaW5kLCBleGNsdWRlczogZXhjbHVkZXMsIGluY2x1ZGVTb3VyY2VBY3Rpb25zOiB0cnVlIH0sXG5cdFx0fSwgcHJvZ3Jlc3MsIHRva2VuKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2F2ZVBhcnRpY2lwYW50c0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZWdpc3RlclNhdmVQYXJ0aWNpcGFudHMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJTYXZlUGFydGljaXBhbnRzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLmFkZFNhdmVQYXJ0aWNpcGFudCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyaW1XaGl0ZXNwYWNlUGFydGljaXBhbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXh0RmlsZVNlcnZpY2UuZmlsZXMuYWRkU2F2ZVBhcnRpY2lwYW50KHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUFjdGlvbk9uU2F2ZVBhcnRpY2lwYW50KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLmFkZFNhdmVQYXJ0aWNpcGFudCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZvcm1hdE9uU2F2ZVBhcnRpY2lwYW50KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLmFkZFNhdmVQYXJ0aWNpcGFudCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbmFsTmV3TGluZVBhcnRpY2lwYW50KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLmFkZFNhdmVQYXJ0aWNpcGFudCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyaW1GaW5hbE5ld0xpbmVzUGFydGljaXBhbnQpKSk7XG5cdH1cbn1cblxuY29uc3Qgd29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoQ29udHJpYnV0aW9uc0V4dGVuc2lvbnMuV29ya2JlbmNoKTtcbndvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihTYXZlUGFydGljaXBhbnRzQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLHdC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
