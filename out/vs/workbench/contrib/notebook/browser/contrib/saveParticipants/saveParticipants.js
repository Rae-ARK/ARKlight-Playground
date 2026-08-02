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
import { HierarchicalKind } from "../../../../../../base/common/hierarchicalKind.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { IBulkEditService, ResourceTextEdit } from "../../../../../../editor/browser/services/bulkEditService.js";
import { trimTrailingWhitespace } from "../../../../../../editor/common/commands/trimTrailingWhitespaceCommand.js";
import { Position } from "../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { CodeActionTriggerType } from "../../../../../../editor/common/languages.js";
import { IEditorWorkerService } from "../../../../../../editor/common/services/editorWorker.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { ApplyCodeActionReason, applyCodeAction, getCodeActions } from "../../../../../../editor/contrib/codeAction/browser/codeAction.js";
import { CodeActionKind, CodeActionTriggerSource } from "../../../../../../editor/contrib/codeAction/common/types.js";
import { FormattingMode, getDocumentFormattingEditsWithSelectedProvider } from "../../../../../../editor/contrib/format/browser/format.js";
import { SnippetController2 } from "../../../../../../editor/contrib/snippet/browser/snippetController2.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { Extensions as WorkbenchContributionsExtensions } from "../../../../../common/contributions.js";
import { SaveReason } from "../../../../../common/editor.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { CellKind, NotebookSetting } from "../../../common/notebookCommon.js";
import { NotebookFileWorkingCopyModel } from "../../../common/notebookEditorModel.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { LifecyclePhase } from "../../../../../services/lifecycle/common/lifecycle.js";
import { IWorkingCopyFileService } from "../../../../../services/workingCopy/common/workingCopyFileService.js";
import { NotebookMultiCursorController, NotebookMultiCursorState } from "../multicursor/notebookMulticursor.js";
class NotebookSaveParticipant {
  constructor(_editorService) {
    this._editorService = _editorService;
  }
  canParticipate() {
    const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
    const controller = editor?.getContribution(NotebookMultiCursorController.id);
    if (!controller) {
      return true;
    }
    return controller.getState() !== NotebookMultiCursorState.Editing;
  }
}
let FormatOnSaveParticipant = class {
  constructor(editorWorkerService, languageFeaturesService, instantiationService, textModelService, bulkEditService, configurationService) {
    this.editorWorkerService = editorWorkerService;
    this.languageFeaturesService = languageFeaturesService;
    this.instantiationService = instantiationService;
    this.textModelService = textModelService;
    this.bulkEditService = bulkEditService;
    this.configurationService = configurationService;
  }
  async participate(workingCopy, context, progress, token) {
    if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
      return;
    }
    if (context.reason === SaveReason.AUTO) {
      return void 0;
    }
    const enabled = this.configurationService.getValue(NotebookSetting.formatOnSave);
    if (!enabled) {
      return void 0;
    }
    progress.report({ message: localize("notebookFormatSave.formatting", "Formatting") });
    const notebook = workingCopy.model.notebookModel;
    const formatApplied = await this.instantiationService.invokeFunction(CodeActionParticipantUtils.checkAndRunFormatCodeAction, notebook, progress, token);
    const disposable = new DisposableStore();
    try {
      if (!formatApplied) {
        const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
          const ref = await this.textModelService.createModelReference(cell.uri);
          disposable.add(ref);
          const model = ref.object.textEditorModel;
          const formatEdits = await getDocumentFormattingEditsWithSelectedProvider(
            this.editorWorkerService,
            this.languageFeaturesService,
            model,
            FormattingMode.Silent,
            token
          );
          const edits = [];
          if (formatEdits) {
            edits.push(...formatEdits.map((edit) => new ResourceTextEdit(model.uri, edit, model.getVersionId())));
            return edits;
          }
          return [];
        }));
        await this.bulkEditService.apply(
          /* edit */
          allCellEdits.flat(),
          { label: localize("formatNotebook", "Format Notebook"), code: "undoredo.formatNotebook" }
        );
      }
    } finally {
      progress.report({ increment: 100 });
      disposable.dispose();
    }
  }
};
FormatOnSaveParticipant = __decorateClass([
  __decorateParam(0, IEditorWorkerService),
  __decorateParam(1, ILanguageFeaturesService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ITextModelService),
  __decorateParam(4, IBulkEditService),
  __decorateParam(5, IConfigurationService)
], FormatOnSaveParticipant);
let TrimWhitespaceParticipant = class extends NotebookSaveParticipant {
  constructor(configurationService, editorService, textModelService, bulkEditService) {
    super(editorService);
    this.configurationService = configurationService;
    this.editorService = editorService;
    this.textModelService = textModelService;
    this.bulkEditService = bulkEditService;
  }
  async participate(workingCopy, context, progress, _token) {
    const trimTrailingWhitespaceOption = this.configurationService.getValue("files.trimTrailingWhitespace");
    const trimInRegexAndStrings = this.configurationService.getValue("files.trimTrailingWhitespaceInRegexAndStrings");
    if (trimTrailingWhitespaceOption && this.canParticipate()) {
      await this.doTrimTrailingWhitespace(workingCopy, context.reason === SaveReason.AUTO, trimInRegexAndStrings, progress);
    }
  }
  async doTrimTrailingWhitespace(workingCopy, isAutoSaved, trimInRegexesAndStrings, progress) {
    if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
      return;
    }
    const disposable = new DisposableStore();
    const notebook = workingCopy.model.notebookModel;
    const activeCellEditor = getActiveCellCodeEditor(this.editorService);
    let cursors = [];
    let prevSelection = [];
    try {
      const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
        if (cell.cellKind !== CellKind.Code) {
          return [];
        }
        const ref = await this.textModelService.createModelReference(cell.uri);
        disposable.add(ref);
        const model = ref.object.textEditorModel;
        const isActiveCell = activeCellEditor && cell.uri.toString() === activeCellEditor.getModel()?.uri.toString();
        if (isActiveCell) {
          prevSelection = activeCellEditor.getSelections() ?? [];
          if (isAutoSaved) {
            cursors = prevSelection.map((s) => s.getPosition());
            const snippetsRange = SnippetController2.get(activeCellEditor)?.getSessionEnclosingRange();
            if (snippetsRange) {
              for (let lineNumber = snippetsRange.startLineNumber; lineNumber <= snippetsRange.endLineNumber; lineNumber++) {
                cursors.push(new Position(lineNumber, model.getLineMaxColumn(lineNumber)));
              }
            }
          }
        }
        const ops = trimTrailingWhitespace(model, cursors, trimInRegexesAndStrings);
        if (!ops.length) {
          return [];
        }
        return ops.map((op) => new ResourceTextEdit(model.uri, { ...op, text: op.text || "" }, model.getVersionId()));
      }));
      const filteredEdits = allCellEdits.flat().filter((edit) => edit !== void 0);
      await this.bulkEditService.apply(filteredEdits, { label: localize("trimNotebookWhitespace", "Notebook Trim Trailing Whitespace"), code: "undoredo.notebookTrimTrailingWhitespace" });
    } finally {
      progress.report({ increment: 100 });
      disposable.dispose();
    }
  }
};
TrimWhitespaceParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, IBulkEditService)
], TrimWhitespaceParticipant);
let TrimFinalNewLinesParticipant = class extends NotebookSaveParticipant {
  constructor(configurationService, editorService, bulkEditService) {
    super(editorService);
    this.configurationService = configurationService;
    this.editorService = editorService;
    this.bulkEditService = bulkEditService;
  }
  async participate(workingCopy, context, progress, _token) {
    if (this.configurationService.getValue("files.trimFinalNewlines") && this.canParticipate()) {
      await this.doTrimFinalNewLines(workingCopy, context.reason === SaveReason.AUTO, progress);
    }
  }
  /**
   * returns 0 if the entire file is empty
   */
  findLastNonEmptyLine(textBuffer) {
    for (let lineNumber = textBuffer.getLineCount(); lineNumber >= 1; lineNumber--) {
      const lineLength = textBuffer.getLineLength(lineNumber);
      if (lineLength) {
        return lineNumber;
      }
    }
    return 0;
  }
  async doTrimFinalNewLines(workingCopy, isAutoSaved, progress) {
    if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
      return;
    }
    const disposable = new DisposableStore();
    const notebook = workingCopy.model.notebookModel;
    const activeCellEditor = getActiveCellCodeEditor(this.editorService);
    try {
      const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
        if (cell.cellKind !== CellKind.Code) {
          return;
        }
        let cannotTouchLineNumber = 0;
        const isActiveCell = activeCellEditor && cell.uri.toString() === activeCellEditor.getModel()?.uri.toString();
        if (isAutoSaved && isActiveCell) {
          const selections = activeCellEditor.getSelections() ?? [];
          for (const sel of selections) {
            cannotTouchLineNumber = Math.max(cannotTouchLineNumber, sel.selectionStartLineNumber);
          }
        }
        const textBuffer = cell.textBuffer;
        const lastNonEmptyLine = this.findLastNonEmptyLine(textBuffer);
        const deleteFromLineNumber = Math.max(lastNonEmptyLine + 1, cannotTouchLineNumber + 1);
        if (deleteFromLineNumber > textBuffer.getLineCount()) {
          return;
        }
        const deletionRange = new Range(deleteFromLineNumber, 1, textBuffer.getLineCount(), textBuffer.getLineLastNonWhitespaceColumn(textBuffer.getLineCount()));
        if (deletionRange.isEmpty()) {
          return;
        }
        return new ResourceTextEdit(cell.uri, { range: deletionRange, text: "" }, cell.textModel?.getVersionId());
      }));
      const filteredEdits = allCellEdits.flat().filter((edit) => edit !== void 0);
      await this.bulkEditService.apply(filteredEdits, { label: localize("trimNotebookNewlines", "Trim Final New Lines"), code: "undoredo.trimFinalNewLines" });
    } finally {
      progress.report({ increment: 100 });
      disposable.dispose();
    }
  }
};
TrimFinalNewLinesParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IBulkEditService)
], TrimFinalNewLinesParticipant);
let InsertFinalNewLineParticipant = class extends NotebookSaveParticipant {
  constructor(configurationService, bulkEditService, editorService) {
    super(editorService);
    this.configurationService = configurationService;
    this.bulkEditService = bulkEditService;
    this.editorService = editorService;
  }
  async participate(workingCopy, context, progress, _token) {
    if (this.configurationService.getValue(NotebookSetting.insertFinalNewline) && this.canParticipate()) {
      await this.doInsertFinalNewLine(workingCopy, context.reason === SaveReason.AUTO, progress);
    }
  }
  async doInsertFinalNewLine(workingCopy, isAutoSaved, progress) {
    if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
      return;
    }
    const disposable = new DisposableStore();
    const notebook = workingCopy.model.notebookModel;
    const activeCellEditor = getActiveCellCodeEditor(this.editorService);
    let selections;
    if (activeCellEditor) {
      selections = activeCellEditor.getSelections() ?? [];
    }
    try {
      const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
        if (cell.cellKind !== CellKind.Code) {
          return;
        }
        const lineCount = cell.textBuffer.getLineCount();
        const lastLineIsEmptyOrWhitespace = cell.textBuffer.getLineFirstNonWhitespaceColumn(lineCount) === 0;
        if (!lineCount || lastLineIsEmptyOrWhitespace) {
          return;
        }
        return new ResourceTextEdit(cell.uri, { range: new Range(lineCount + 1, cell.textBuffer.getLineLength(lineCount), lineCount + 1, cell.textBuffer.getLineLength(lineCount)), text: cell.textBuffer.getEOL() }, cell.textModel?.getVersionId());
      }));
      const filteredEdits = allCellEdits.filter((edit) => edit !== void 0);
      await this.bulkEditService.apply(filteredEdits, { label: localize("insertFinalNewLine", "Insert Final New Line"), code: "undoredo.insertFinalNewLine" });
      if (activeCellEditor && selections) {
        activeCellEditor.setSelections(selections);
      }
    } finally {
      progress.report({ increment: 100 });
      disposable.dispose();
    }
  }
};
InsertFinalNewLineParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IBulkEditService),
  __decorateParam(2, IEditorService)
], InsertFinalNewLineParticipant);
let CodeActionOnSaveParticipant = class {
  constructor(configurationService, logService, workspaceTrustManagementService, textModelService, instantiationService) {
    this.configurationService = configurationService;
    this.logService = logService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.textModelService = textModelService;
    this.instantiationService = instantiationService;
  }
  async participate(workingCopy, context, progress, token) {
    const isTrusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
    if (!isTrusted) {
      return;
    }
    if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
      return;
    }
    let saveTrigger = "";
    if (context.reason === SaveReason.AUTO) {
      return void 0;
    } else if (context.reason === SaveReason.EXPLICIT) {
      saveTrigger = "explicit";
    } else {
      return void 0;
    }
    const notebookModel = workingCopy.model.notebookModel;
    const setting = this.configurationService.getValue(NotebookSetting.codeActionsOnSave);
    const settingItems = Array.isArray(setting) ? setting : Object.keys(setting).filter((x) => setting[x]);
    const allCodeActions = this.createCodeActionsOnSave(settingItems);
    const excludedActions = allCodeActions.filter((x) => setting[x.value] === "never" || setting[x.value] === false);
    const includedActions = allCodeActions.filter((x) => setting[x.value] === saveTrigger || setting[x.value] === true);
    const editorCodeActionsOnSave = includedActions.filter((x) => !CodeActionKind.Notebook.contains(x));
    const notebookCodeActionsOnSave = includedActions.filter((x) => CodeActionKind.Notebook.contains(x));
    if (notebookCodeActionsOnSave.length) {
      const nbDisposable = new DisposableStore();
      progress.report({ message: localize("notebookSaveParticipants.notebookCodeActions", "Running 'Notebook' code actions") });
      try {
        const cell = notebookModel.cells[0];
        const ref = await this.textModelService.createModelReference(cell.uri);
        nbDisposable.add(ref);
        const textEditorModel = ref.object.textEditorModel;
        await this.instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveGenericCodeActions, textEditorModel, notebookCodeActionsOnSave, excludedActions, progress, token);
      } catch {
        this.logService.error("Failed to apply notebook code action on save");
      } finally {
        progress.report({ increment: 100 });
        nbDisposable.dispose();
      }
    }
    if (editorCodeActionsOnSave.length) {
      if (!Array.isArray(setting)) {
        editorCodeActionsOnSave.sort((a, b) => {
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
      const cellDisposable = new DisposableStore();
      progress.report({ message: localize("notebookSaveParticipants.cellCodeActions", "Running 'Cell' code actions") });
      try {
        await Promise.all(notebookModel.cells.map(async (cell) => {
          const ref = await this.textModelService.createModelReference(cell.uri);
          cellDisposable.add(ref);
          const textEditorModel = ref.object.textEditorModel;
          await this.instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveGenericCodeActions, textEditorModel, editorCodeActionsOnSave, excludedActions, progress, token);
        }));
      } catch {
        this.logService.error("Failed to apply code action on save");
      } finally {
        progress.report({ increment: 100 });
        cellDisposable.dispose();
      }
    }
  }
  createCodeActionsOnSave(settingItems) {
    const kinds = settingItems.map((x) => new HierarchicalKind(x));
    return kinds.filter((kind) => {
      return kinds.every((otherKind) => otherKind.equals(kind) || !otherKind.contains(kind));
    });
  }
};
CodeActionOnSaveParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IWorkspaceTrustManagementService),
  __decorateParam(3, ITextModelService),
  __decorateParam(4, IInstantiationService)
], CodeActionOnSaveParticipant);
class CodeActionParticipantUtils {
  static async checkAndRunFormatCodeAction(accessor, notebookModel, progress, token) {
    const instantiationService = accessor.get(IInstantiationService);
    const textModelService = accessor.get(ITextModelService);
    const logService = accessor.get(ILogService);
    const configurationService = accessor.get(IConfigurationService);
    const formatDisposable = new DisposableStore();
    let formatResult = false;
    progress.report({ message: localize("notebookSaveParticipants.formatCodeActions", "Running 'Format' code actions") });
    try {
      const cell = notebookModel.cells[0];
      const ref = await textModelService.createModelReference(cell.uri);
      formatDisposable.add(ref);
      const textEditorModel = ref.object.textEditorModel;
      const defaultFormatterExtId = configurationService.getValue(NotebookSetting.defaultFormatter);
      formatResult = await instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveFormatCodeAction, textEditorModel, new HierarchicalKind("notebook.format"), [], defaultFormatterExtId, progress, token);
    } catch {
      logService.error("Failed to apply notebook format action on save");
    } finally {
      progress.report({ increment: 100 });
      formatDisposable.dispose();
    }
    return formatResult;
  }
  static async applyOnSaveGenericCodeActions(accessor, model, codeActionsOnSave, excludes, progress, token) {
    const instantiationService = accessor.get(IInstantiationService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const logService = accessor.get(ILogService);
    const getActionProgress = new class {
      constructor() {
        this._names = /* @__PURE__ */ new Set();
      }
      _report() {
        progress.report({
          message: localize(
            { key: "codeaction.get2", comment: ["[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}"] },
            "Getting code actions from '{0}' ([configure]({1})).",
            [...this._names].map((name) => `'${name}'`).join(", "),
            "command:workbench.action.openSettings?%5B%22notebook.codeActionsOnSave%22%5D"
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
      const actionsToRun = await CodeActionParticipantUtils.getActionsToRun(model, codeActionKind, excludes, languageFeaturesService, getActionProgress, token);
      if (token.isCancellationRequested) {
        actionsToRun.dispose();
        return;
      }
      try {
        for (const action of actionsToRun.validActions) {
          const codeActionEdits = action.action.edit?.edits;
          let breakFlag = false;
          if (!action.action.kind?.startsWith("notebook")) {
            for (const edit of codeActionEdits ?? []) {
              const workspaceTextEdit = edit;
              if (workspaceTextEdit.resource && isEqual(workspaceTextEdit.resource, model.uri)) {
                continue;
              } else {
                breakFlag = true;
                break;
              }
            }
          }
          if (breakFlag) {
            logService.warn("Failed to apply code action on save, applied to multiple resources.");
            continue;
          }
          progress.report({ message: localize("codeAction.apply", "Applying code action '{0}'.", action.action.title) });
          await instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
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
  static async applyOnSaveFormatCodeAction(accessor, model, formatCodeActionOnSave, excludes, extensionId, progress, token) {
    const instantiationService = accessor.get(IInstantiationService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const logService = accessor.get(ILogService);
    const getActionProgress = new class {
      constructor() {
        this._names = /* @__PURE__ */ new Set();
      }
      _report() {
        progress.report({
          message: localize(
            { key: "codeaction.get2", comment: ["[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}"] },
            "Getting code actions from '{0}' ([configure]({1})).",
            [...this._names].map((name) => `'${name}'`).join(", "),
            "command:workbench.action.openSettings?%5B%22notebook.defaultFormatter%22%5D"
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
    const providedActions = await CodeActionParticipantUtils.getActionsToRun(model, formatCodeActionOnSave, excludes, languageFeaturesService, getActionProgress, token);
    if (providedActions.validActions.length > 1 && !extensionId) {
      logService.warn("More than one format code action is provided, the 0th one will be used. A default can be specified via `notebook.defaultFormatter` in your settings.");
    }
    if (token.isCancellationRequested) {
      providedActions.dispose();
      return false;
    }
    try {
      const action = extensionId ? providedActions.validActions.find((action2) => action2.provider?.extensionId === extensionId) : providedActions.validActions[0];
      if (!action) {
        return false;
      }
      progress.report({ message: localize("codeAction.apply", "Applying code action '{0}'.", action.action.title) });
      await instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
      if (token.isCancellationRequested) {
        return false;
      }
    } catch {
      logService.error("Failed to apply notebook format code action on save");
      return false;
    } finally {
      providedActions.dispose();
    }
    return true;
  }
  // @Yoyokrazy this could likely be modified to leverage the extensionID, therefore not getting actions from providers unnecessarily -- future work
  static getActionsToRun(model, codeActionKind, excludes, languageFeaturesService, progress, token) {
    return getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), {
      type: CodeActionTriggerType.Invoke,
      triggerAction: CodeActionTriggerSource.OnSave,
      filter: { include: codeActionKind, excludes, includeSourceActions: true }
    }, progress, token);
  }
}
function getActiveCellCodeEditor(editorService) {
  const activePane = editorService.activeEditorPane;
  const notebookEditor = getNotebookEditorFromEditorPane(activePane);
  const activeCodeEditor = notebookEditor?.activeCodeEditor;
  return activeCodeEditor;
}
let SaveParticipantsContribution = class extends Disposable {
  constructor(instantiationService, workingCopyFileService) {
    super();
    this.instantiationService = instantiationService;
    this.workingCopyFileService = workingCopyFileService;
    this.registerSaveParticipants();
  }
  registerSaveParticipants() {
    this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(TrimWhitespaceParticipant)));
    this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(CodeActionOnSaveParticipant)));
    this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(FormatOnSaveParticipant)));
    this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(InsertFinalNewLineParticipant)));
    this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(TrimFinalNewLinesParticipant)));
  }
};
SaveParticipantsContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkingCopyFileService)
], SaveParticipantsContribution);
const workbenchContributionsRegistry = Registry.as(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(SaveParticipantsContribution, LifecyclePhase.Restored);
export {
  CodeActionParticipantUtils,
  NotebookSaveParticipant,
  SaveParticipantsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9zYXZlUGFydGljaXBhbnRzL3NhdmVQYXJ0aWNpcGFudHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBIaWVyYXJjaGljYWxLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGllcmFyY2hpY2FsS2luZC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUJ1bGtFZGl0U2VydmljZSwgUmVzb3VyY2VFZGl0LCBSZXNvdXJjZVRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHRyaW1UcmFpbGluZ1doaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbW1hbmRzL3RyaW1UcmFpbGluZ1doaXRlc3BhY2VDb21tYW5kLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvblByb3ZpZGVyLCBDb2RlQWN0aW9uVHJpZ2dlclR5cGUsIElXb3Jrc3BhY2VUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElSZWFkb25seVRleHRCdWZmZXIsIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXBwbHlDb2RlQWN0aW9uUmVhc29uLCBhcHBseUNvZGVBY3Rpb24sIGdldENvZGVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9icm93c2VyL2NvZGVBY3Rpb24uanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvbkl0ZW0sIENvZGVBY3Rpb25LaW5kLCBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEZvcm1hdHRpbmdNb2RlLCBnZXREb2N1bWVudEZvcm1hdHRpbmdFZGl0c1dpdGhTZWxlY3RlZFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZm9ybWF0L2Jyb3dzZXIvZm9ybWF0LmpzJztcbmltcG9ydCB7IFNuaXBwZXRDb250cm9sbGVyMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzLCBJUHJvZ3Jlc3NTdGVwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaENvbnRyaWJ1dGlvbnNFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgU2F2ZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1RleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va1RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCwgTm90ZWJvb2tTZXR0aW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tFZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElTdG9yZWRGaWxlV29ya2luZ0NvcHksIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi9zdG9yZWRGaWxlV29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudCwgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudENvbnRleHQsIElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tNdWx0aUN1cnNvckNvbnRyb2xsZXIsIE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZSB9IGZyb20gJy4uL211bHRpY3Vyc29yL25vdGVib29rTXVsdGljdXJzb3IuanMnO1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTm90ZWJvb2tTYXZlUGFydGljaXBhbnQgaW1wbGVtZW50cyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdCkgeyB9XG5cdGFic3RyYWN0IHBhcnRpY2lwYXRlKHdvcmtpbmdDb3B5OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbD4sIGNvbnRleHQ6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnRDb250ZXh0LCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+O1xuXG5cdHByb3RlY3RlZCBjYW5QYXJ0aWNpcGF0ZSgpOiBib29sZWFuIHtcblx0XHRjb25zdCBlZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGVkaXRvcj8uZ2V0Q29udHJpYnV0aW9uPE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyPihOb3RlYm9va011bHRpQ3Vyc29yQ29udHJvbGxlci5pZCk7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29udHJvbGxlci5nZXRTdGF0ZSgpICE9PSBOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuRWRpdGluZztcblx0fVxufVxuXG5jbGFzcyBGb3JtYXRPblNhdmVQYXJ0aWNpcGFudCBpbXBsZW1lbnRzIElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvcldvcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JXb3JrZXJTZXJ2aWNlOiBJRWRpdG9yV29ya2VyU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUJ1bGtFZGl0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGJ1bGtFZGl0U2VydmljZTogSUJ1bGtFZGl0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwYXJ0aWNpcGF0ZSh3b3JraW5nQ29weTogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+LCBjb250ZXh0OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50Q29udGV4dCwgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF3b3JraW5nQ29weS5tb2RlbCB8fCAhKHdvcmtpbmdDb3B5Lm1vZGVsIGluc3RhbmNlb2YgTm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoY29udGV4dC5yZWFzb24gPT09IFNhdmVSZWFzb24uQVVUTykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcuZm9ybWF0T25TYXZlKTtcblx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdub3RlYm9va0Zvcm1hdFNhdmUuZm9ybWF0dGluZycsIFwiRm9ybWF0dGluZ1wiKSB9KTtcblxuXHRcdGNvbnN0IG5vdGVib29rID0gd29ya2luZ0NvcHkubW9kZWwubm90ZWJvb2tNb2RlbDtcblx0XHRjb25zdCBmb3JtYXRBcHBsaWVkOiBib29sZWFuID0gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihDb2RlQWN0aW9uUGFydGljaXBhbnRVdGlscy5jaGVja0FuZFJ1bkZvcm1hdENvZGVBY3Rpb24sIG5vdGVib29rLCBwcm9ncmVzcywgdG9rZW4pO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCFmb3JtYXRBcHBsaWVkKSB7XG5cdFx0XHRcdGNvbnN0IGFsbENlbGxFZGl0cyA9IGF3YWl0IFByb21pc2UuYWxsKG5vdGVib29rLmNlbGxzLm1hcChhc3luYyBjZWxsID0+IHtcblx0XHRcdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoY2VsbC51cmkpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUuYWRkKHJlZik7XG5cblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXG5cdFx0XHRcdFx0Y29uc3QgZm9ybWF0RWRpdHMgPSBhd2FpdCBnZXREb2N1bWVudEZvcm1hdHRpbmdFZGl0c1dpdGhTZWxlY3RlZFByb3ZpZGVyKFxuXHRcdFx0XHRcdFx0dGhpcy5lZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0dGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRcdFx0XHRcdG1vZGVsLFxuXHRcdFx0XHRcdFx0Rm9ybWF0dGluZ01vZGUuU2lsZW50LFxuXHRcdFx0XHRcdFx0dG9rZW5cblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0Y29uc3QgZWRpdHM6IFJlc291cmNlVGV4dEVkaXRbXSA9IFtdO1xuXG5cdFx0XHRcdFx0aWYgKGZvcm1hdEVkaXRzKSB7XG5cdFx0XHRcdFx0XHRlZGl0cy5wdXNoKC4uLmZvcm1hdEVkaXRzLm1hcChlZGl0ID0+IG5ldyBSZXNvdXJjZVRleHRFZGl0KG1vZGVsLnVyaSwgZWRpdCwgbW9kZWwuZ2V0VmVyc2lvbklkKCkpKSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWRpdHM7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0YXdhaXQgdGhpcy5idWxrRWRpdFNlcnZpY2UuYXBwbHkoLyogZWRpdCAqL2FsbENlbGxFZGl0cy5mbGF0KCksIHsgbGFiZWw6IGxvY2FsaXplKCdmb3JtYXROb3RlYm9vaycsIFwiRm9ybWF0IE5vdGVib29rXCIpLCBjb2RlOiAndW5kb3JlZG8uZm9ybWF0Tm90ZWJvb2snLCB9KTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgaW5jcmVtZW50OiAxMDAgfSk7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVHJpbVdoaXRlc3BhY2VQYXJ0aWNpcGFudCBleHRlbmRzIE5vdGVib29rU2F2ZVBhcnRpY2lwYW50IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUJ1bGtFZGl0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGJ1bGtFZGl0U2VydmljZTogSUJ1bGtFZGl0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yU2VydmljZSk7XG5cdH1cblxuXHRhc3luYyBwYXJ0aWNpcGF0ZSh3b3JraW5nQ29weTogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+LCBjb250ZXh0OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50Q29udGV4dCwgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRyaW1UcmFpbGluZ1doaXRlc3BhY2VPcHRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdmaWxlcy50cmltVHJhaWxpbmdXaGl0ZXNwYWNlJyk7XG5cdFx0Y29uc3QgdHJpbUluUmVnZXhBbmRTdHJpbmdzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZmlsZXMudHJpbVRyYWlsaW5nV2hpdGVzcGFjZUluUmVnZXhBbmRTdHJpbmdzJyk7XG5cdFx0aWYgKHRyaW1UcmFpbGluZ1doaXRlc3BhY2VPcHRpb24gJiYgdGhpcy5jYW5QYXJ0aWNpcGF0ZSgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvVHJpbVRyYWlsaW5nV2hpdGVzcGFjZSh3b3JraW5nQ29weSwgY29udGV4dC5yZWFzb24gPT09IFNhdmVSZWFzb24uQVVUTywgdHJpbUluUmVnZXhBbmRTdHJpbmdzLCBwcm9ncmVzcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1RyaW1UcmFpbGluZ1doaXRlc3BhY2Uod29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8SVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiwgaXNBdXRvU2F2ZWQ6IGJvb2xlYW4sIHRyaW1JblJlZ2V4ZXNBbmRTdHJpbmdzOiBib29sZWFuLCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+KSB7XG5cdFx0aWYgKCF3b3JraW5nQ29weS5tb2RlbCB8fCAhKHdvcmtpbmdDb3B5Lm1vZGVsIGluc3RhbmNlb2YgTm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG5vdGVib29rID0gd29ya2luZ0NvcHkubW9kZWwubm90ZWJvb2tNb2RlbDtcblx0XHRjb25zdCBhY3RpdmVDZWxsRWRpdG9yID0gZ2V0QWN0aXZlQ2VsbENvZGVFZGl0b3IodGhpcy5lZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGxldCBjdXJzb3JzOiBQb3NpdGlvbltdID0gW107XG5cdFx0bGV0IHByZXZTZWxlY3Rpb246IFNlbGVjdGlvbltdID0gW107XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFsbENlbGxFZGl0cyA9IGF3YWl0IFByb21pc2UuYWxsKG5vdGVib29rLmNlbGxzLm1hcChhc3luYyAoY2VsbCkgPT4ge1xuXHRcdFx0XHRpZiAoY2VsbC5jZWxsS2luZCAhPT0gQ2VsbEtpbmQuQ29kZSkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShjZWxsLnVyaSk7XG5cdFx0XHRcdGRpc3Bvc2FibGUuYWRkKHJlZik7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gcmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cblx0XHRcdFx0Y29uc3QgaXNBY3RpdmVDZWxsID0gKGFjdGl2ZUNlbGxFZGl0b3IgJiYgY2VsbC51cmkudG9TdHJpbmcoKSA9PT0gYWN0aXZlQ2VsbEVkaXRvci5nZXRNb2RlbCgpPy51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGlmIChpc0FjdGl2ZUNlbGwpIHtcblx0XHRcdFx0XHRwcmV2U2VsZWN0aW9uID0gYWN0aXZlQ2VsbEVkaXRvci5nZXRTZWxlY3Rpb25zKCkgPz8gW107XG5cdFx0XHRcdFx0aWYgKGlzQXV0b1NhdmVkKSB7XG5cdFx0XHRcdFx0XHRjdXJzb3JzID0gcHJldlNlbGVjdGlvbi5tYXAocyA9PiBzLmdldFBvc2l0aW9uKCkpOyAvLyBnZXQgaW5pdGlhbCBjdXJzb3IgcG9zaXRpb25zXG5cdFx0XHRcdFx0XHRjb25zdCBzbmlwcGV0c1JhbmdlID0gU25pcHBldENvbnRyb2xsZXIyLmdldChhY3RpdmVDZWxsRWRpdG9yKT8uZ2V0U2Vzc2lvbkVuY2xvc2luZ1JhbmdlKCk7XG5cdFx0XHRcdFx0XHRpZiAoc25pcHBldHNSYW5nZSkge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc25pcHBldHNSYW5nZS5zdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gc25pcHBldHNSYW5nZS5lbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdFx0XHRcdFx0XHRjdXJzb3JzLnB1c2gobmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG9wcyA9IHRyaW1UcmFpbGluZ1doaXRlc3BhY2UobW9kZWwsIGN1cnNvcnMsIHRyaW1JblJlZ2V4ZXNBbmRTdHJpbmdzKTtcblx0XHRcdFx0aWYgKCFvcHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdOyAvLyBOb3RoaW5nIHRvIGRvXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gb3BzLm1hcChvcCA9PiBuZXcgUmVzb3VyY2VUZXh0RWRpdChtb2RlbC51cmksIHsgLi4ub3AsIHRleHQ6IG9wLnRleHQgfHwgJycgfSwgbW9kZWwuZ2V0VmVyc2lvbklkKCkpKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyZWRFZGl0cyA9IGFsbENlbGxFZGl0cy5mbGF0KCkuZmlsdGVyKGVkaXQgPT4gZWRpdCAhPT0gdW5kZWZpbmVkKSBhcyBSZXNvdXJjZUVkaXRbXTtcblx0XHRcdGF3YWl0IHRoaXMuYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KGZpbHRlcmVkRWRpdHMsIHsgbGFiZWw6IGxvY2FsaXplKCd0cmltTm90ZWJvb2tXaGl0ZXNwYWNlJywgXCJOb3RlYm9vayBUcmltIFRyYWlsaW5nIFdoaXRlc3BhY2VcIiksIGNvZGU6ICd1bmRvcmVkby5ub3RlYm9va1RyaW1UcmFpbGluZ1doaXRlc3BhY2UnIH0pO1xuXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IGluY3JlbWVudDogMTAwIH0pO1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFRyaW1GaW5hbE5ld0xpbmVzUGFydGljaXBhbnQgZXh0ZW5kcyBOb3RlYm9va1NhdmVQYXJ0aWNpcGFudCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElCdWxrRWRpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBidWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvclNlcnZpY2UpO1xuXHR9XG5cblxuXHRhc3luYyBwYXJ0aWNpcGF0ZSh3b3JraW5nQ29weTogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+LCBjb250ZXh0OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50Q29udGV4dCwgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdmaWxlcy50cmltRmluYWxOZXdsaW5lcycpICYmIHRoaXMuY2FuUGFydGljaXBhdGUoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5kb1RyaW1GaW5hbE5ld0xpbmVzKHdvcmtpbmdDb3B5LCBjb250ZXh0LnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5BVVRPLCBwcm9ncmVzcyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIHJldHVybnMgMCBpZiB0aGUgZW50aXJlIGZpbGUgaXMgZW1wdHlcblx0ICovXG5cdHByaXZhdGUgZmluZExhc3ROb25FbXB0eUxpbmUodGV4dEJ1ZmZlcjogSVJlYWRvbmx5VGV4dEJ1ZmZlcik6IG51bWJlciB7XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHRleHRCdWZmZXIuZ2V0TGluZUNvdW50KCk7IGxpbmVOdW1iZXIgPj0gMTsgbGluZU51bWJlci0tKSB7XG5cdFx0XHRjb25zdCBsaW5lTGVuZ3RoID0gdGV4dEJ1ZmZlci5nZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKGxpbmVMZW5ndGgpIHtcblx0XHRcdFx0Ly8gdGhpcyBsaW5lIGhhcyBjb250ZW50XG5cdFx0XHRcdHJldHVybiBsaW5lTnVtYmVyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBubyBsaW5lIGhhcyBjb250ZW50XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvVHJpbUZpbmFsTmV3TGluZXMod29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8SVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiwgaXNBdXRvU2F2ZWQ6IGJvb2xlYW4sIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXdvcmtpbmdDb3B5Lm1vZGVsIHx8ICEod29ya2luZ0NvcHkubW9kZWwgaW5zdGFuY2VvZiBOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgbm90ZWJvb2sgPSB3b3JraW5nQ29weS5tb2RlbC5ub3RlYm9va01vZGVsO1xuXHRcdGNvbnN0IGFjdGl2ZUNlbGxFZGl0b3IgPSBnZXRBY3RpdmVDZWxsQ29kZUVkaXRvcih0aGlzLmVkaXRvclNlcnZpY2UpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFsbENlbGxFZGl0cyA9IGF3YWl0IFByb21pc2UuYWxsKG5vdGVib29rLmNlbGxzLm1hcChhc3luYyAoY2VsbCkgPT4ge1xuXHRcdFx0XHRpZiAoY2VsbC5jZWxsS2luZCAhPT0gQ2VsbEtpbmQuQ29kZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGF1dG9zYXZlIC0tIGRvbid0IHRyaW0gZXZlcnkgdHJhaWxpbmcgbGluZSwganVzdCB1cCB0byB0aGUgY3Vyc29yIGxpbmVcblx0XHRcdFx0bGV0IGNhbm5vdFRvdWNoTGluZU51bWJlciA9IDA7XG5cdFx0XHRcdGNvbnN0IGlzQWN0aXZlQ2VsbCA9IChhY3RpdmVDZWxsRWRpdG9yICYmIGNlbGwudXJpLnRvU3RyaW5nKCkgPT09IGFjdGl2ZUNlbGxFZGl0b3IuZ2V0TW9kZWwoKT8udXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRpZiAoaXNBdXRvU2F2ZWQgJiYgaXNBY3RpdmVDZWxsKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGFjdGl2ZUNlbGxFZGl0b3IuZ2V0U2VsZWN0aW9ucygpID8/IFtdO1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2VsIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdFx0XHRcdGNhbm5vdFRvdWNoTGluZU51bWJlciA9IE1hdGgubWF4KGNhbm5vdFRvdWNoTGluZU51bWJlciwgc2VsLnNlbGVjdGlvblN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdGV4dEJ1ZmZlciA9IGNlbGwudGV4dEJ1ZmZlcjtcblx0XHRcdFx0Y29uc3QgbGFzdE5vbkVtcHR5TGluZSA9IHRoaXMuZmluZExhc3ROb25FbXB0eUxpbmUodGV4dEJ1ZmZlcik7XG5cdFx0XHRcdGNvbnN0IGRlbGV0ZUZyb21MaW5lTnVtYmVyID0gTWF0aC5tYXgobGFzdE5vbkVtcHR5TGluZSArIDEsIGNhbm5vdFRvdWNoTGluZU51bWJlciArIDEpO1xuXHRcdFx0XHRpZiAoZGVsZXRlRnJvbUxpbmVOdW1iZXIgPiB0ZXh0QnVmZmVyLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZGVsZXRpb25SYW5nZSA9IG5ldyBSYW5nZShkZWxldGVGcm9tTGluZU51bWJlciwgMSwgdGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKSwgdGV4dEJ1ZmZlci5nZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4odGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKSkpO1xuXHRcdFx0XHRpZiAoZGVsZXRpb25SYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBjcmVhdGUgdGhlIGVkaXQgdG8gZGVsZXRlIGFsbCBsaW5lcyBpbiBkZWxldGlvblJhbmdlXG5cdFx0XHRcdHJldHVybiBuZXcgUmVzb3VyY2VUZXh0RWRpdChjZWxsLnVyaSwgeyByYW5nZTogZGVsZXRpb25SYW5nZSwgdGV4dDogJycgfSwgY2VsbC50ZXh0TW9kZWw/LmdldFZlcnNpb25JZCgpKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyZWRFZGl0cyA9IGFsbENlbGxFZGl0cy5mbGF0KCkuZmlsdGVyKGVkaXQgPT4gZWRpdCAhPT0gdW5kZWZpbmVkKSBhcyBSZXNvdXJjZUVkaXRbXTtcblx0XHRcdGF3YWl0IHRoaXMuYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KGZpbHRlcmVkRWRpdHMsIHsgbGFiZWw6IGxvY2FsaXplKCd0cmltTm90ZWJvb2tOZXdsaW5lcycsIFwiVHJpbSBGaW5hbCBOZXcgTGluZXNcIiksIGNvZGU6ICd1bmRvcmVkby50cmltRmluYWxOZXdMaW5lcycgfSk7XG5cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgaW5jcmVtZW50OiAxMDAgfSk7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgSW5zZXJ0RmluYWxOZXdMaW5lUGFydGljaXBhbnQgZXh0ZW5kcyBOb3RlYm9va1NhdmVQYXJ0aWNpcGFudCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElCdWxrRWRpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBidWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvclNlcnZpY2UpO1xuXHR9XG5cblx0YXN5bmMgcGFydGljaXBhdGUod29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8SVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiwgY29udGV4dDogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudENvbnRleHQsIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyB3YWl0aW5nIG9uIG5vdGVib29rLXNwZWNpZmljIG92ZXJyaWRlIGJlZm9yZSB0aGlzIGZlYXR1cmUgY2FuIHN5bmMgd2l0aCAnZmlsZXMuaW5zZXJ0RmluYWxOZXdsaW5lJ1xuXHRcdC8vIGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdmaWxlcy5pbnNlcnRGaW5hbE5ld2xpbmUnKSkge1xuXG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLmluc2VydEZpbmFsTmV3bGluZSkgJiYgdGhpcy5jYW5QYXJ0aWNpcGF0ZSgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvSW5zZXJ0RmluYWxOZXdMaW5lKHdvcmtpbmdDb3B5LCBjb250ZXh0LnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5BVVRPLCBwcm9ncmVzcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0luc2VydEZpbmFsTmV3TGluZSh3b3JraW5nQ29weTogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+LCBpc0F1dG9TYXZlZDogYm9vbGVhbiwgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghd29ya2luZ0NvcHkubW9kZWwgfHwgISh3b3JraW5nQ29weS5tb2RlbCBpbnN0YW5jZW9mIE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBub3RlYm9vayA9IHdvcmtpbmdDb3B5Lm1vZGVsLm5vdGVib29rTW9kZWw7XG5cblx0XHQvLyBnZXQgaW5pdGlhbCBjdXJzb3IgcG9zaXRpb25zXG5cdFx0Y29uc3QgYWN0aXZlQ2VsbEVkaXRvciA9IGdldEFjdGl2ZUNlbGxDb2RlRWRpdG9yKHRoaXMuZWRpdG9yU2VydmljZSk7XG5cdFx0bGV0IHNlbGVjdGlvbnM7XG5cdFx0aWYgKGFjdGl2ZUNlbGxFZGl0b3IpIHtcblx0XHRcdHNlbGVjdGlvbnMgPSBhY3RpdmVDZWxsRWRpdG9yLmdldFNlbGVjdGlvbnMoKSA/PyBbXTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWxsQ2VsbEVkaXRzID0gYXdhaXQgUHJvbWlzZS5hbGwobm90ZWJvb2suY2VsbHMubWFwKGFzeW5jIChjZWxsKSA9PiB7XG5cdFx0XHRcdGlmIChjZWxsLmNlbGxLaW5kICE9PSBDZWxsS2luZC5Db2RlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbGluZUNvdW50ID0gY2VsbC50ZXh0QnVmZmVyLmdldExpbmVDb3VudCgpO1xuXHRcdFx0XHRjb25zdCBsYXN0TGluZUlzRW1wdHlPcldoaXRlc3BhY2UgPSBjZWxsLnRleHRCdWZmZXIuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lQ291bnQpID09PSAwO1xuXG5cdFx0XHRcdGlmICghbGluZUNvdW50IHx8IGxhc3RMaW5lSXNFbXB0eU9yV2hpdGVzcGFjZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBuZXcgUmVzb3VyY2VUZXh0RWRpdChjZWxsLnVyaSwgeyByYW5nZTogbmV3IFJhbmdlKGxpbmVDb3VudCArIDEsIGNlbGwudGV4dEJ1ZmZlci5nZXRMaW5lTGVuZ3RoKGxpbmVDb3VudCksIGxpbmVDb3VudCArIDEsIGNlbGwudGV4dEJ1ZmZlci5nZXRMaW5lTGVuZ3RoKGxpbmVDb3VudCkpLCB0ZXh0OiBjZWxsLnRleHRCdWZmZXIuZ2V0RU9MKCkgfSwgY2VsbC50ZXh0TW9kZWw/LmdldFZlcnNpb25JZCgpKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgZmlsdGVyZWRFZGl0cyA9IGFsbENlbGxFZGl0cy5maWx0ZXIoZWRpdCA9PiBlZGl0ICE9PSB1bmRlZmluZWQpIGFzIFJlc291cmNlRWRpdFtdO1xuXHRcdFx0YXdhaXQgdGhpcy5idWxrRWRpdFNlcnZpY2UuYXBwbHkoZmlsdGVyZWRFZGl0cywgeyBsYWJlbDogbG9jYWxpemUoJ2luc2VydEZpbmFsTmV3TGluZScsIFwiSW5zZXJ0IEZpbmFsIE5ldyBMaW5lXCIpLCBjb2RlOiAndW5kb3JlZG8uaW5zZXJ0RmluYWxOZXdMaW5lJyB9KTtcblxuXHRcdFx0Ly8gc2V0IGN1cnNvciBiYWNrIHRvIGluaXRpYWwgcG9zaXRpb24gYWZ0ZXIgaW5zZXJ0aW5nIGZpbmFsIG5ldyBsaW5lXG5cdFx0XHRpZiAoYWN0aXZlQ2VsbEVkaXRvciAmJiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRcdGFjdGl2ZUNlbGxFZGl0b3Iuc2V0U2VsZWN0aW9ucyhzZWxlY3Rpb25zKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgaW5jcmVtZW50OiAxMDAgfSk7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgQ29kZUFjdGlvbk9uU2F2ZVBhcnRpY2lwYW50IGltcGxlbWVudHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdGFzeW5jIHBhcnRpY2lwYXRlKHdvcmtpbmdDb3B5OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbD4sIGNvbnRleHQ6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnRDb250ZXh0LCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpc1RydXN0ZWQgPSB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCk7XG5cdFx0aWYgKCFpc1RydXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXdvcmtpbmdDb3B5Lm1vZGVsIHx8ICEod29ya2luZ0NvcHkubW9kZWwgaW5zdGFuY2VvZiBOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBzYXZlVHJpZ2dlciA9ICcnO1xuXHRcdGlmIChjb250ZXh0LnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5BVVRPKSB7XG5cdFx0XHQvLyBjdXJyZW50bHkgdGhpcyB3b24ndCBoYXBwZW4sIGFzIHZzL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uLnRzIEwjMTA0IGZpbHRlcnMgb3V0IGNvZGVhY3Rpb25zIG9uIGF1dG9zYXZlLiBKdXN0IGZ1dHVyZS1wcm9vZmluZ1xuXHRcdFx0Ly8gPyBub3RlYm9vayBDb2RlQWN0aW9ucyBvbiBhdXRvc2F2ZSBzZWVtcyBkYW5nZXJvdXMgKHBlcmYtd2lzZSlcblx0XHRcdC8vIHNhdmVUcmlnZ2VyID0gJ2Fsd2F5cyc7IC8vIFRPRE9AWW95b2tyYXp5LCBzdXBwb3J0IGR1cmluZyBkZWJ0XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAoY29udGV4dC5yZWFzb24gPT09IFNhdmVSZWFzb24uRVhQTElDSVQpIHtcblx0XHRcdHNhdmVUcmlnZ2VyID0gJ2V4cGxpY2l0Jztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gXHRTYXZlUmVhc29uLkZPQ1VTX0NIQU5HRSwgV0lORE9XX0NIQU5HRSBuZWVkIHRvIGJlIGFkZHJlc3NlZCB3aGVuIGF1dG9zYXZlcyBhcmUgZW5hYmxlZFxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBub3RlYm9va01vZGVsID0gd29ya2luZ0NvcHkubW9kZWwubm90ZWJvb2tNb2RlbDtcblxuXHRcdGNvbnN0IHNldHRpbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgW2tpbmQ6IHN0cmluZ106IHN0cmluZyB8IGJvb2xlYW4gfT4oTm90ZWJvb2tTZXR0aW5nLmNvZGVBY3Rpb25zT25TYXZlKTtcblx0XHRjb25zdCBzZXR0aW5nSXRlbXM6IHN0cmluZ1tdID0gQXJyYXkuaXNBcnJheShzZXR0aW5nKVxuXHRcdFx0PyBzZXR0aW5nXG5cdFx0XHQ6IE9iamVjdC5rZXlzKHNldHRpbmcpLmZpbHRlcih4ID0+IHNldHRpbmdbeF0pO1xuXG5cdFx0Y29uc3QgYWxsQ29kZUFjdGlvbnMgPSB0aGlzLmNyZWF0ZUNvZGVBY3Rpb25zT25TYXZlKHNldHRpbmdJdGVtcyk7XG5cdFx0Y29uc3QgZXhjbHVkZWRBY3Rpb25zID0gYWxsQ29kZUFjdGlvbnNcblx0XHRcdC5maWx0ZXIoeCA9PiBzZXR0aW5nW3gudmFsdWVdID09PSAnbmV2ZXInIHx8IHNldHRpbmdbeC52YWx1ZV0gPT09IGZhbHNlKTtcblx0XHRjb25zdCBpbmNsdWRlZEFjdGlvbnMgPSBhbGxDb2RlQWN0aW9uc1xuXHRcdFx0LmZpbHRlcih4ID0+IHNldHRpbmdbeC52YWx1ZV0gPT09IHNhdmVUcmlnZ2VyIHx8IHNldHRpbmdbeC52YWx1ZV0gPT09IHRydWUpO1xuXG5cdFx0Y29uc3QgZWRpdG9yQ29kZUFjdGlvbnNPblNhdmUgPSBpbmNsdWRlZEFjdGlvbnMuZmlsdGVyKHggPT4gIUNvZGVBY3Rpb25LaW5kLk5vdGVib29rLmNvbnRhaW5zKHgpKTtcblx0XHRjb25zdCBub3RlYm9va0NvZGVBY3Rpb25zT25TYXZlID0gaW5jbHVkZWRBY3Rpb25zLmZpbHRlcih4ID0+IENvZGVBY3Rpb25LaW5kLk5vdGVib29rLmNvbnRhaW5zKHgpKTtcblxuXHRcdC8vIHJ1biBub3RlYm9vayBjb2RlIGFjdGlvbnNcblx0XHRpZiAobm90ZWJvb2tDb2RlQWN0aW9uc09uU2F2ZS5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG5iRGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdub3RlYm9va1NhdmVQYXJ0aWNpcGFudHMubm90ZWJvb2tDb2RlQWN0aW9ucycsIFwiUnVubmluZyAnTm90ZWJvb2snIGNvZGUgYWN0aW9uc1wiKSB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSBub3RlYm9va01vZGVsLmNlbGxzWzBdO1xuXHRcdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoY2VsbC51cmkpO1xuXHRcdFx0XHRuYkRpc3Bvc2FibGUuYWRkKHJlZik7XG5cblx0XHRcdFx0Y29uc3QgdGV4dEVkaXRvck1vZGVsID0gcmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cblx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihDb2RlQWN0aW9uUGFydGljaXBhbnRVdGlscy5hcHBseU9uU2F2ZUdlbmVyaWNDb2RlQWN0aW9ucywgdGV4dEVkaXRvck1vZGVsLCBub3RlYm9va0NvZGVBY3Rpb25zT25TYXZlLCBleGNsdWRlZEFjdGlvbnMsIHByb2dyZXNzLCB0b2tlbik7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gYXBwbHkgbm90ZWJvb2sgY29kZSBhY3Rpb24gb24gc2F2ZScpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgaW5jcmVtZW50OiAxMDAgfSk7XG5cdFx0XHRcdG5iRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gcnVuIGNlbGwgbGV2ZWwgY29kZSBhY3Rpb25zXG5cdFx0aWYgKGVkaXRvckNvZGVBY3Rpb25zT25TYXZlLmxlbmd0aCkge1xuXHRcdFx0Ly8gcHJpb3JpdGl6ZSBgc291cmNlLmZpeEFsbGAgY29kZSBhY3Rpb25zXG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc2V0dGluZykpIHtcblx0XHRcdFx0ZWRpdG9yQ29kZUFjdGlvbnNPblNhdmUuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0XHRcdGlmIChDb2RlQWN0aW9uS2luZC5Tb3VyY2VGaXhBbGwuY29udGFpbnMoYSkpIHtcblx0XHRcdFx0XHRcdGlmIChDb2RlQWN0aW9uS2luZC5Tb3VyY2VGaXhBbGwuY29udGFpbnMoYikpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChDb2RlQWN0aW9uS2luZC5Tb3VyY2VGaXhBbGwuY29udGFpbnMoYikpIHtcblx0XHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNlbGxEaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ25vdGVib29rU2F2ZVBhcnRpY2lwYW50cy5jZWxsQ29kZUFjdGlvbnMnLCBcIlJ1bm5pbmcgJ0NlbGwnIGNvZGUgYWN0aW9uc1wiKSB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKG5vdGVib29rTW9kZWwuY2VsbHMubWFwKGFzeW5jIGNlbGwgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShjZWxsLnVyaSk7XG5cdFx0XHRcdFx0Y2VsbERpc3Bvc2FibGUuYWRkKHJlZik7XG5cblx0XHRcdFx0XHRjb25zdCB0ZXh0RWRpdG9yTW9kZWwgPSByZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oQ29kZUFjdGlvblBhcnRpY2lwYW50VXRpbHMuYXBwbHlPblNhdmVHZW5lcmljQ29kZUFjdGlvbnMsIHRleHRFZGl0b3JNb2RlbCwgZWRpdG9yQ29kZUFjdGlvbnNPblNhdmUsIGV4Y2x1ZGVkQWN0aW9ucywgcHJvZ3Jlc3MsIHRva2VuKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIGFwcGx5IGNvZGUgYWN0aW9uIG9uIHNhdmUnKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IGluY3JlbWVudDogMTAwIH0pO1xuXHRcdFx0XHRjZWxsRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb2RlQWN0aW9uc09uU2F2ZShzZXR0aW5nSXRlbXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogSGllcmFyY2hpY2FsS2luZFtdIHtcblx0XHRjb25zdCBraW5kcyA9IHNldHRpbmdJdGVtcy5tYXAoeCA9PiBuZXcgSGllcmFyY2hpY2FsS2luZCh4KSk7XG5cblx0XHQvLyBSZW1vdmUgc3Vic2V0c1xuXHRcdHJldHVybiBraW5kcy5maWx0ZXIoa2luZCA9PiB7XG5cdFx0XHRyZXR1cm4ga2luZHMuZXZlcnkob3RoZXJLaW5kID0+IG90aGVyS2luZC5lcXVhbHMoa2luZCkgfHwgIW90aGVyS2luZC5jb250YWlucyhraW5kKSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvZGVBY3Rpb25QYXJ0aWNpcGFudFV0aWxzIHtcblxuXHRzdGF0aWMgYXN5bmMgY2hlY2tBbmRSdW5Gb3JtYXRDb2RlQWN0aW9uKFxuXHRcdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRcdG5vdGVib29rTW9kZWw6IE5vdGVib29rVGV4dE1vZGVsLFxuXHRcdHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRNb2RlbFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBmb3JtYXREaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBmb3JtYXRSZXN1bHQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBsb2NhbGl6ZSgnbm90ZWJvb2tTYXZlUGFydGljaXBhbnRzLmZvcm1hdENvZGVBY3Rpb25zJywgXCJSdW5uaW5nICdGb3JtYXQnIGNvZGUgYWN0aW9uc1wiKSB9KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2VsbCA9IG5vdGVib29rTW9kZWwuY2VsbHNbMF07XG5cdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGNlbGwudXJpKTtcblx0XHRcdGZvcm1hdERpc3Bvc2FibGUuYWRkKHJlZik7XG5cdFx0XHRjb25zdCB0ZXh0RWRpdG9yTW9kZWwgPSByZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblxuXHRcdFx0Y29uc3QgZGVmYXVsdEZvcm1hdHRlckV4dElkID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPihOb3RlYm9va1NldHRpbmcuZGVmYXVsdEZvcm1hdHRlcik7XG5cdFx0XHRmb3JtYXRSZXN1bHQgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihDb2RlQWN0aW9uUGFydGljaXBhbnRVdGlscy5hcHBseU9uU2F2ZUZvcm1hdENvZGVBY3Rpb24sIHRleHRFZGl0b3JNb2RlbCwgbmV3IEhpZXJhcmNoaWNhbEtpbmQoJ25vdGVib29rLmZvcm1hdCcpLCBbXSwgZGVmYXVsdEZvcm1hdHRlckV4dElkLCBwcm9ncmVzcywgdG9rZW4pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0bG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIGFwcGx5IG5vdGVib29rIGZvcm1hdCBhY3Rpb24gb24gc2F2ZScpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBpbmNyZW1lbnQ6IDEwMCB9KTtcblx0XHRcdGZvcm1hdERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gZm9ybWF0UmVzdWx0O1xuXHR9XG5cblx0c3RhdGljIGFzeW5jIGFwcGx5T25TYXZlR2VuZXJpY0NvZGVBY3Rpb25zKFxuXHRcdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRcdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdGNvZGVBY3Rpb25zT25TYXZlOiByZWFkb25seSBIaWVyYXJjaGljYWxLaW5kW10sXG5cdFx0ZXhjbHVkZXM6IHJlYWRvbmx5IEhpZXJhcmNoaWNhbEtpbmRbXSxcblx0XHRwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cblx0XHRjb25zdCBnZXRBY3Rpb25Qcm9ncmVzcyA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElQcm9ncmVzczxDb2RlQWN0aW9uUHJvdmlkZXI+IHtcblx0XHRcdHByaXZhdGUgX25hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRwcml2YXRlIF9yZXBvcnQoKTogdm9pZCB7XG5cdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7XG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoXG5cdFx0XHRcdFx0XHR7IGtleTogJ2NvZGVhY3Rpb24uZ2V0MicsIGNvbW1lbnQ6IFsnW2NvbmZpZ3VyZV0oezF9KSBpcyBhIGxpbmsuIE9ubHkgdHJhbnNsYXRlIGBjb25maWd1cmVgLiBEbyBub3QgY2hhbmdlIGJyYWNrZXRzIGFuZCBwYXJlbnRoZXNlcyBvciB7MX0nXSB9LFxuXHRcdFx0XHRcdFx0XCJHZXR0aW5nIGNvZGUgYWN0aW9ucyBmcm9tICd7MH0nIChbY29uZmlndXJlXSh7MX0pKS5cIixcblx0XHRcdFx0XHRcdFsuLi50aGlzLl9uYW1lc10ubWFwKG5hbWUgPT4gYCcke25hbWV9J2ApLmpvaW4oJywgJyksXG5cdFx0XHRcdFx0XHQnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncz8lNUIlMjJub3RlYm9vay5jb2RlQWN0aW9uc09uU2F2ZSUyMiU1RCdcblx0XHRcdFx0XHQpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmVwb3J0KHByb3ZpZGVyOiBDb2RlQWN0aW9uUHJvdmlkZXIpIHtcblx0XHRcdFx0aWYgKHByb3ZpZGVyLmRpc3BsYXlOYW1lICYmICF0aGlzLl9uYW1lcy5oYXMocHJvdmlkZXIuZGlzcGxheU5hbWUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbmFtZXMuYWRkKHByb3ZpZGVyLmRpc3BsYXlOYW1lKTtcblx0XHRcdFx0XHR0aGlzLl9yZXBvcnQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IGNvZGVBY3Rpb25LaW5kIG9mIGNvZGVBY3Rpb25zT25TYXZlKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zVG9SdW4gPSBhd2FpdCBDb2RlQWN0aW9uUGFydGljaXBhbnRVdGlscy5nZXRBY3Rpb25zVG9SdW4obW9kZWwsIGNvZGVBY3Rpb25LaW5kLCBleGNsdWRlcywgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIGdldEFjdGlvblByb2dyZXNzLCB0b2tlbik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0YWN0aW9uc1RvUnVuLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zVG9SdW4udmFsaWRBY3Rpb25zKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29kZUFjdGlvbkVkaXRzID0gYWN0aW9uLmFjdGlvbi5lZGl0Py5lZGl0cztcblx0XHRcdFx0XHRsZXQgYnJlYWtGbGFnID0gZmFsc2U7XG5cdFx0XHRcdFx0aWYgKCFhY3Rpb24uYWN0aW9uLmtpbmQ/LnN0YXJ0c1dpdGgoJ25vdGVib29rJykpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiBjb2RlQWN0aW9uRWRpdHMgPz8gW10pIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlVGV4dEVkaXQgPSBlZGl0IGFzIElXb3Jrc3BhY2VUZXh0RWRpdDtcblx0XHRcdFx0XHRcdFx0aWYgKHdvcmtzcGFjZVRleHRFZGl0LnJlc291cmNlICYmIGlzRXF1YWwod29ya3NwYWNlVGV4dEVkaXQucmVzb3VyY2UsIG1vZGVsLnVyaSkpIHtcblx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBlcnJvciAtPiBhcHBsaWVkIHRvIG11bHRpcGxlIHJlc291cmNlc1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrRmxhZyA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGJyZWFrRmxhZykge1xuXHRcdFx0XHRcdFx0bG9nU2VydmljZS53YXJuKCdGYWlsZWQgdG8gYXBwbHkgY29kZSBhY3Rpb24gb24gc2F2ZSwgYXBwbGllZCB0byBtdWx0aXBsZSByZXNvdXJjZXMuJyk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ2NvZGVBY3Rpb24uYXBwbHknLCBcIkFwcGx5aW5nIGNvZGUgYWN0aW9uICd7MH0nLlwiLCBhY3Rpb24uYWN0aW9uLnRpdGxlKSB9KTtcblx0XHRcdFx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhcHBseUNvZGVBY3Rpb24sIGFjdGlvbiwgQXBwbHlDb2RlQWN0aW9uUmVhc29uLk9uU2F2ZSwge30sIHRva2VuKTtcblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBGYWlsdXJlIHRvIGFwcGx5IGEgY29kZSBhY3Rpb24gc2hvdWxkIG5vdCBibG9jayBvdGhlciBvbiBzYXZlIGFjdGlvbnNcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGFjdGlvbnNUb1J1bi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c3RhdGljIGFzeW5jIGFwcGx5T25TYXZlRm9ybWF0Q29kZUFjdGlvbihcblx0XHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0XHRtb2RlbDogSVRleHRNb2RlbCxcblx0XHRmb3JtYXRDb2RlQWN0aW9uT25TYXZlOiBIaWVyYXJjaGljYWxLaW5kLFxuXHRcdGV4Y2x1ZGVzOiByZWFkb25seSBIaWVyYXJjaGljYWxLaW5kW10sXG5cdFx0ZXh0ZW5zaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cblx0XHRjb25zdCBnZXRBY3Rpb25Qcm9ncmVzcyA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElQcm9ncmVzczxDb2RlQWN0aW9uUHJvdmlkZXI+IHtcblx0XHRcdHByaXZhdGUgX25hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRwcml2YXRlIF9yZXBvcnQoKTogdm9pZCB7XG5cdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7XG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoXG5cdFx0XHRcdFx0XHR7IGtleTogJ2NvZGVhY3Rpb24uZ2V0MicsIGNvbW1lbnQ6IFsnW2NvbmZpZ3VyZV0oezF9KSBpcyBhIGxpbmsuIE9ubHkgdHJhbnNsYXRlIGBjb25maWd1cmVgLiBEbyBub3QgY2hhbmdlIGJyYWNrZXRzIGFuZCBwYXJlbnRoZXNlcyBvciB7MX0nXSB9LFxuXHRcdFx0XHRcdFx0XCJHZXR0aW5nIGNvZGUgYWN0aW9ucyBmcm9tICd7MH0nIChbY29uZmlndXJlXSh7MX0pKS5cIixcblx0XHRcdFx0XHRcdFsuLi50aGlzLl9uYW1lc10ubWFwKG5hbWUgPT4gYCcke25hbWV9J2ApLmpvaW4oJywgJyksXG5cdFx0XHRcdFx0XHQnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncz8lNUIlMjJub3RlYm9vay5kZWZhdWx0Rm9ybWF0dGVyJTIyJTVEJ1xuXHRcdFx0XHRcdClcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXBvcnQocHJvdmlkZXI6IENvZGVBY3Rpb25Qcm92aWRlcikge1xuXHRcdFx0XHRpZiAocHJvdmlkZXIuZGlzcGxheU5hbWUgJiYgIXRoaXMuX25hbWVzLmhhcyhwcm92aWRlci5kaXNwbGF5TmFtZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9uYW1lcy5hZGQocHJvdmlkZXIuZGlzcGxheU5hbWUpO1xuXHRcdFx0XHRcdHRoaXMuX3JlcG9ydCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb3ZpZGVkQWN0aW9ucyA9IGF3YWl0IENvZGVBY3Rpb25QYXJ0aWNpcGFudFV0aWxzLmdldEFjdGlvbnNUb1J1bihtb2RlbCwgZm9ybWF0Q29kZUFjdGlvbk9uU2F2ZSwgZXhjbHVkZXMsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBnZXRBY3Rpb25Qcm9ncmVzcywgdG9rZW4pO1xuXHRcdC8vIHdhcm4gdGhlIHVzZXIgaWYgdGhlcmUgYXJlIG1vcmUgdGhhbiBvbmUgcHJvdmlkZWQgZm9ybWF0IGFjdGlvbiwgYW5kIHRoZXJlIGlzIG5vIHNwZWNpZmllZCBkZWZhdWx0Rm9ybWF0dGVyXG5cdFx0aWYgKHByb3ZpZGVkQWN0aW9ucy52YWxpZEFjdGlvbnMubGVuZ3RoID4gMSAmJiAhZXh0ZW5zaW9uSWQpIHtcblx0XHRcdGxvZ1NlcnZpY2Uud2FybignTW9yZSB0aGFuIG9uZSBmb3JtYXQgY29kZSBhY3Rpb24gaXMgcHJvdmlkZWQsIHRoZSAwdGggb25lIHdpbGwgYmUgdXNlZC4gQSBkZWZhdWx0IGNhbiBiZSBzcGVjaWZpZWQgdmlhIGBub3RlYm9vay5kZWZhdWx0Rm9ybWF0dGVyYCBpbiB5b3VyIHNldHRpbmdzLicpO1xuXHRcdH1cblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cHJvdmlkZWRBY3Rpb25zLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWN0aW9uOiBDb2RlQWN0aW9uSXRlbSB8IHVuZGVmaW5lZCA9IGV4dGVuc2lvbklkID8gcHJvdmlkZWRBY3Rpb25zLnZhbGlkQWN0aW9ucy5maW5kKGFjdGlvbiA9PiBhY3Rpb24ucHJvdmlkZXI/LmV4dGVuc2lvbklkID09PSBleHRlbnNpb25JZCkgOiBwcm92aWRlZEFjdGlvbnMudmFsaWRBY3Rpb25zWzBdO1xuXHRcdFx0aWYgKCFhY3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBsb2NhbGl6ZSgnY29kZUFjdGlvbi5hcHBseScsIFwiQXBwbHlpbmcgY29kZSBhY3Rpb24gJ3swfScuXCIsIGFjdGlvbi5hY3Rpb24udGl0bGUpIH0pO1xuXHRcdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXBwbHlDb2RlQWN0aW9uLCBhY3Rpb24sIEFwcGx5Q29kZUFjdGlvblJlYXNvbi5PblNhdmUsIHt9LCB0b2tlbik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0bG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIGFwcGx5IG5vdGVib29rIGZvcm1hdCBjb2RlIGFjdGlvbiBvbiBzYXZlJyk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHByb3ZpZGVkQWN0aW9ucy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gQFlveW9rcmF6eSB0aGlzIGNvdWxkIGxpa2VseSBiZSBtb2RpZmllZCB0byBsZXZlcmFnZSB0aGUgZXh0ZW5zaW9uSUQsIHRoZXJlZm9yZSBub3QgZ2V0dGluZyBhY3Rpb25zIGZyb20gcHJvdmlkZXJzIHVubmVjZXNzYXJpbHkgLS0gZnV0dXJlIHdvcmtcblx0c3RhdGljIGdldEFjdGlvbnNUb1J1bihtb2RlbDogSVRleHRNb2RlbCwgY29kZUFjdGlvbktpbmQ6IEhpZXJhcmNoaWNhbEtpbmQsIGV4Y2x1ZGVzOiByZWFkb25seSBIaWVyYXJjaGljYWxLaW5kW10sIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIHByb2dyZXNzOiBJUHJvZ3Jlc3M8Q29kZUFjdGlvblByb3ZpZGVyPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0cmV0dXJuIGdldENvZGVBY3Rpb25zKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVBY3Rpb25Qcm92aWRlciwgbW9kZWwsIG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksIHtcblx0XHRcdHR5cGU6IENvZGVBY3Rpb25UcmlnZ2VyVHlwZS5JbnZva2UsXG5cdFx0XHR0cmlnZ2VyQWN0aW9uOiBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZS5PblNhdmUsXG5cdFx0XHRmaWx0ZXI6IHsgaW5jbHVkZTogY29kZUFjdGlvbktpbmQsIGV4Y2x1ZGVzOiBleGNsdWRlcywgaW5jbHVkZVNvdXJjZUFjdGlvbnM6IHRydWUgfSxcblx0XHR9LCBwcm9ncmVzcywgdG9rZW4pO1xuXHR9XG5cbn1cblxuZnVuY3Rpb24gZ2V0QWN0aXZlQ2VsbENvZGVFZGl0b3IoZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UpOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGFjdGl2ZVBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdGNvbnN0IG5vdGVib29rRWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShhY3RpdmVQYW5lKTtcblx0Y29uc3QgYWN0aXZlQ29kZUVkaXRvciA9IG5vdGVib29rRWRpdG9yPy5hY3RpdmVDb2RlRWRpdG9yO1xuXHRyZXR1cm4gYWN0aXZlQ29kZUVkaXRvcjtcbn1cblxuZXhwb3J0IGNsYXNzIFNhdmVQYXJ0aWNpcGFudHNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtpbmdDb3B5RmlsZVNlcnZpY2U6IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlKSB7XG5cblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJTYXZlUGFydGljaXBhbnRzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU2F2ZVBhcnRpY2lwYW50cygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuYWRkU2F2ZVBhcnRpY2lwYW50KHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJpbVdoaXRlc3BhY2VQYXJ0aWNpcGFudCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuYWRkU2F2ZVBhcnRpY2lwYW50KHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUFjdGlvbk9uU2F2ZVBhcnRpY2lwYW50KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2luZ0NvcHlGaWxlU2VydmljZS5hZGRTYXZlUGFydGljaXBhbnQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGb3JtYXRPblNhdmVQYXJ0aWNpcGFudCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuYWRkU2F2ZVBhcnRpY2lwYW50KHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zZXJ0RmluYWxOZXdMaW5lUGFydGljaXBhbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmFkZFNhdmVQYXJ0aWNpcGFudCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyaW1GaW5hbE5ld0xpbmVzUGFydGljaXBhbnQpKSk7XG5cdH1cbn1cblxuY29uc3Qgd29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoQ29udHJpYnV0aW9uc0V4dGVuc2lvbnMuV29ya2JlbmNoKTtcbndvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihTYXZlUGFydGljaXBhbnRzQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxlQUFlO0FBRXhCLFNBQVMsa0JBQWdDLHdCQUF3QjtBQUNqRSxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFFdEIsU0FBNkIsNkJBQWlEO0FBRTlFLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCLGlCQUFpQixzQkFBc0I7QUFDdkUsU0FBeUIsZ0JBQWdCLCtCQUErQjtBQUN4RSxTQUFTLGdCQUFnQixzREFBc0Q7QUFDL0UsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxt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
