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
import { localize, localize2 } from "../../../../../../nls.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { EditorAction, registerEditorAction } from "../../../../../../editor/browser/editorExtensions.js";
import { IBulkEditService, ResourceTextEdit } from "../../../../../../editor/browser/services/bulkEditService.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
import { IEditorWorkerService } from "../../../../../../editor/common/services/editorWorker.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { FormattingMode, formatDocumentWithSelectedProvider, getDocumentFormattingEditsWithSelectedProvider } from "../../../../../../editor/contrib/format/browser/format.js";
import { Action2, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Progress } from "../../../../../../platform/progress/common/progress.js";
import { NOTEBOOK_ACTIONS_CATEGORY } from "../../controller/coreActions.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_IS_ACTIVE_EDITOR } from "../../../common/notebookContextKeys.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { INotebookExecutionService } from "../../../common/notebookExecutionService.js";
import { NotebookSetting } from "../../../common/notebookCommon.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { LifecyclePhase } from "../../../../../services/lifecycle/common/lifecycle.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchContributionsExtensions } from "../../../../../common/contributions.js";
import { INotebookService } from "../../../common/notebookService.js";
import { CodeActionParticipantUtils } from "../saveParticipants/saveParticipants.js";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.format",
      title: localize2("format.title", "Format Notebook"),
      category: NOTEBOOK_ACTIONS_CATEGORY,
      precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EDITABLE),
      keybinding: {
        when: EditorContextKeys.editorTextFocus.toNegated(),
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF,
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI },
        weight: KeybindingWeight.WorkbenchContrib
      },
      f1: true,
      menu: {
        id: MenuId.EditorContext,
        when: ContextKeyExpr.and(EditorContextKeys.inCompositeEditor, EditorContextKeys.hasDocumentFormattingProvider),
        group: "1_modification",
        order: 1.3
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const textModelService = accessor.get(ITextModelService);
    const editorWorkerService = accessor.get(IEditorWorkerService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const bulkEditService = accessor.get(IBulkEditService);
    const instantiationService = accessor.get(IInstantiationService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor || !editor.hasModel()) {
      return;
    }
    const notebook = editor.textModel;
    const formatApplied = await instantiationService.invokeFunction(CodeActionParticipantUtils.checkAndRunFormatCodeAction, notebook, Progress.None, CancellationToken.None);
    const disposable = new DisposableStore();
    try {
      if (!formatApplied) {
        const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
          const ref = await textModelService.createModelReference(cell.uri);
          disposable.add(ref);
          const model = ref.object.textEditorModel;
          const formatEdits = await getDocumentFormattingEditsWithSelectedProvider(
            editorWorkerService,
            languageFeaturesService,
            model,
            FormattingMode.Explicit,
            CancellationToken.None
          );
          const edits = [];
          if (formatEdits) {
            for (const edit of formatEdits) {
              edits.push(new ResourceTextEdit(model.uri, edit, model.getVersionId()));
            }
            return edits;
          }
          return [];
        }));
        await bulkEditService.apply(
          /* edit */
          allCellEdits.flat(),
          { label: localize("label", "Format Notebook"), code: "undoredo.formatNotebook" }
        );
      }
    } finally {
      disposable.dispose();
    }
  }
});
registerEditorAction(class FormatCellAction extends EditorAction {
  constructor() {
    super({
      id: "notebook.formatCell",
      label: localize2("formatCell.label", "Format Cell"),
      precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EDITABLE, EditorContextKeys.inCompositeEditor, EditorContextKeys.writable, EditorContextKeys.hasDocumentFormattingProvider),
      kbOpts: {
        kbExpr: ContextKeyExpr.and(EditorContextKeys.editorTextFocus),
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF,
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI },
        weight: KeybindingWeight.EditorContrib
      },
      contextMenuOpts: {
        group: "1_modification",
        order: 1.301
      }
    });
  }
  async run(accessor, editor) {
    if (editor.hasModel()) {
      const instaService = accessor.get(IInstantiationService);
      await instaService.invokeFunction(formatDocumentWithSelectedProvider, editor, FormattingMode.Explicit, Progress.None, CancellationToken.None, true);
    }
  }
});
let FormatOnCellExecutionParticipant = class {
  constructor(bulkEditService, languageFeaturesService, textModelService, editorWorkerService, configurationService, _notebookService) {
    this.bulkEditService = bulkEditService;
    this.languageFeaturesService = languageFeaturesService;
    this.textModelService = textModelService;
    this.editorWorkerService = editorWorkerService;
    this.configurationService = configurationService;
    this._notebookService = _notebookService;
  }
  async onWillExecuteCell(executions) {
    const enabled = this.configurationService.getValue(NotebookSetting.formatOnCellExecution);
    if (!enabled) {
      return;
    }
    const disposable = new DisposableStore();
    try {
      const allCellEdits = await Promise.all(executions.map(async (cellExecution) => {
        const nbModel = this._notebookService.getNotebookTextModel(cellExecution.notebook);
        if (!nbModel) {
          return [];
        }
        let activeCell;
        for (const cell of nbModel.cells) {
          if (cell.handle === cellExecution.cellHandle) {
            activeCell = cell;
            break;
          }
        }
        if (!activeCell) {
          return [];
        }
        const ref = await this.textModelService.createModelReference(activeCell.uri);
        disposable.add(ref);
        const model = ref.object.textEditorModel;
        const formatEdits = await getDocumentFormattingEditsWithSelectedProvider(
          this.editorWorkerService,
          this.languageFeaturesService,
          model,
          FormattingMode.Silent,
          CancellationToken.None
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
        { label: localize("formatCells.label", "Format Cells"), code: "undoredo.notebooks.onWillExecuteFormat" }
      );
    } finally {
      disposable.dispose();
    }
  }
};
FormatOnCellExecutionParticipant = __decorateClass([
  __decorateParam(0, IBulkEditService),
  __decorateParam(1, ILanguageFeaturesService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, IEditorWorkerService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, INotebookService)
], FormatOnCellExecutionParticipant);
let CellExecutionParticipantsContribution = class extends Disposable {
  constructor(instantiationService, notebookExecutionService) {
    super();
    this.instantiationService = instantiationService;
    this.notebookExecutionService = notebookExecutionService;
    this.registerKernelExecutionParticipants();
  }
  registerKernelExecutionParticipants() {
    this._register(this.notebookExecutionService.registerExecutionParticipant(this.instantiationService.createInstance(FormatOnCellExecutionParticipant)));
  }
};
CellExecutionParticipantsContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, INotebookExecutionService)
], CellExecutionParticipantsContribution);
const workbenchContributionsRegistry = Registry.as(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(CellExecutionParticipantsContribution, LifecyclePhase.Restored);
export {
  CellExecutionParticipantsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9mb3JtYXQvZm9ybWF0dGluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIHJlZ2lzdGVyRWRpdG9yQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRTZXJ2aWNlLCBSZXNvdXJjZVRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZvcm1hdHRpbmdNb2RlLCBmb3JtYXREb2N1bWVudFdpdGhTZWxlY3RlZFByb3ZpZGVyLCBnZXREb2N1bWVudEZvcm1hdHRpbmdFZGl0c1dpdGhTZWxlY3RlZFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZm9ybWF0L2Jyb3dzZXIvZm9ybWF0LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZIH0gZnJvbSAnLi4vLi4vY29udHJvbGxlci9jb3JlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0VESVRPUl9FRElUQUJMRSwgTk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxFeGVjdXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNlbGxFeGVjdXRpb25QYXJ0aWNpcGFudCwgSU5vdGVib29rRXhlY3V0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tTZXR0aW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaENvbnRyaWJ1dGlvbnNFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvblBhcnRpY2lwYW50VXRpbHMgfSBmcm9tICcuLi9zYXZlUGFydGljaXBhbnRzL3NhdmVQYXJ0aWNpcGFudHMuanMnO1xuXG4vLyBmb3JtYXQgbm90ZWJvb2tcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVib29rLmZvcm1hdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmb3JtYXQudGl0bGUnLCAnRm9ybWF0IE5vdGVib29rJyksXG5cdFx0XHRjYXRlZ29yeTogTk9URUJPT0tfQUNUSU9OU19DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsIE5PVEVCT09LX0VESVRPUl9FRElUQUJMRSksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cy50b05lZ2F0ZWQoKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5Rixcblx0XHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUkgfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMuaW5Db21wb3NpdGVFZGl0b3IsIEVkaXRvckNvbnRleHRLZXlzLmhhc0RvY3VtZW50Rm9ybWF0dGluZ1Byb3ZpZGVyKSxcblx0XHRcdFx0Z3JvdXA6ICcxX21vZGlmaWNhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLjNcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IHRleHRNb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRNb2RlbFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvcldvcmtlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvcldvcmtlclNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdFx0Y29uc3QgYnVsa0VkaXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCdWxrRWRpdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBlZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0aWYgKCFlZGl0b3IgfHwgIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm90ZWJvb2sgPSBlZGl0b3IudGV4dE1vZGVsO1xuXG5cdFx0Y29uc3QgZm9ybWF0QXBwbGllZDogYm9vbGVhbiA9IGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKENvZGVBY3Rpb25QYXJ0aWNpcGFudFV0aWxzLmNoZWNrQW5kUnVuRm9ybWF0Q29kZUFjdGlvbiwgbm90ZWJvb2ssIFByb2dyZXNzLk5vbmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCFmb3JtYXRBcHBsaWVkKSB7XG5cdFx0XHRcdGNvbnN0IGFsbENlbGxFZGl0cyA9IGF3YWl0IFByb21pc2UuYWxsKG5vdGVib29rLmNlbGxzLm1hcChhc3luYyBjZWxsID0+IHtcblx0XHRcdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGNlbGwudXJpKTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlLmFkZChyZWYpO1xuXG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSByZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblxuXHRcdFx0XHRcdGNvbnN0IGZvcm1hdEVkaXRzID0gYXdhaXQgZ2V0RG9jdW1lbnRGb3JtYXR0aW5nRWRpdHNXaXRoU2VsZWN0ZWRQcm92aWRlcihcblx0XHRcdFx0XHRcdGVkaXRvcldvcmtlclNlcnZpY2UsXG5cdFx0XHRcdFx0XHRsYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRcdFx0XHRcdG1vZGVsLFxuXHRcdFx0XHRcdFx0Rm9ybWF0dGluZ01vZGUuRXhwbGljaXQsXG5cdFx0XHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdGNvbnN0IGVkaXRzOiBSZXNvdXJjZVRleHRFZGl0W10gPSBbXTtcblxuXHRcdFx0XHRcdGlmIChmb3JtYXRFZGl0cykge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBlZGl0IG9mIGZvcm1hdEVkaXRzKSB7XG5cdFx0XHRcdFx0XHRcdGVkaXRzLnB1c2gobmV3IFJlc291cmNlVGV4dEVkaXQobW9kZWwudXJpLCBlZGl0LCBtb2RlbC5nZXRWZXJzaW9uSWQoKSkpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4gZWRpdHM7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0YXdhaXQgYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KC8qIGVkaXQgKi9hbGxDZWxsRWRpdHMuZmxhdCgpLCB7IGxhYmVsOiBsb2NhbGl6ZSgnbGFiZWwnLCBcIkZvcm1hdCBOb3RlYm9va1wiKSwgY29kZTogJ3VuZG9yZWRvLmZvcm1hdE5vdGVib29rJywgfSk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufSk7XG5cbi8vIGZvcm1hdCBjZWxsXG5yZWdpc3RlckVkaXRvckFjdGlvbihjbGFzcyBGb3JtYXRDZWxsQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay5mb3JtYXRDZWxsJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZTIoJ2Zvcm1hdENlbGwubGFiZWwnLCBcIkZvcm1hdCBDZWxsXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUiwgTk9URUJPT0tfRURJVE9SX0VESVRBQkxFLCBFZGl0b3JDb250ZXh0S2V5cy5pbkNvbXBvc2l0ZUVkaXRvciwgRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsIEVkaXRvckNvbnRleHRLZXlzLmhhc0RvY3VtZW50Rm9ybWF0dGluZ1Byb3ZpZGVyKSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlGLFxuXHRcdFx0XHRsaW51eDogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5SSB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGNvbnRleHRNZW51T3B0czoge1xuXHRcdFx0XHRncm91cDogJzFfbW9kaWZpY2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEuMzAxXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdGNvbnN0IGluc3RhU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZvcm1hdERvY3VtZW50V2l0aFNlbGVjdGVkUHJvdmlkZXIsIGVkaXRvciwgRm9ybWF0dGluZ01vZGUuRXhwbGljaXQsIFByb2dyZXNzLk5vbmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHRydWUpO1xuXHRcdH1cblx0fVxufSk7XG5cbmNsYXNzIEZvcm1hdE9uQ2VsbEV4ZWN1dGlvblBhcnRpY2lwYW50IGltcGxlbWVudHMgSUNlbGxFeGVjdXRpb25QYXJ0aWNpcGFudCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQnVsa0VkaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYnVsa0VkaXRTZXJ2aWNlOiBJQnVsa0VkaXRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yV29ya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvcldvcmtlclNlcnZpY2U6IElFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRhc3luYyBvbldpbGxFeGVjdXRlQ2VsbChleGVjdXRpb25zOiBJTm90ZWJvb2tDZWxsRXhlY3V0aW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5mb3JtYXRPbkNlbGxFeGVjdXRpb24pO1xuXHRcdGlmICghZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFsbENlbGxFZGl0cyA9IGF3YWl0IFByb21pc2UuYWxsKGV4ZWN1dGlvbnMubWFwKGFzeW5jIGNlbGxFeGVjdXRpb24gPT4ge1xuXHRcdFx0XHRjb25zdCBuYk1vZGVsID0gdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLmdldE5vdGVib29rVGV4dE1vZGVsKGNlbGxFeGVjdXRpb24ubm90ZWJvb2spO1xuXHRcdFx0XHRpZiAoIW5iTW9kZWwpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0bGV0IGFjdGl2ZUNlbGw7XG5cdFx0XHRcdGZvciAoY29uc3QgY2VsbCBvZiBuYk1vZGVsLmNlbGxzKSB7XG5cdFx0XHRcdFx0aWYgKGNlbGwuaGFuZGxlID09PSBjZWxsRXhlY3V0aW9uLmNlbGxIYW5kbGUpIHtcblx0XHRcdFx0XHRcdGFjdGl2ZUNlbGwgPSBjZWxsO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghYWN0aXZlQ2VsbCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShhY3RpdmVDZWxsLnVyaSk7XG5cdFx0XHRcdGRpc3Bvc2FibGUuYWRkKHJlZik7XG5cblx0XHRcdFx0Y29uc3QgbW9kZWwgPSByZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblxuXHRcdFx0XHRjb25zdCBmb3JtYXRFZGl0cyA9IGF3YWl0IGdldERvY3VtZW50Rm9ybWF0dGluZ0VkaXRzV2l0aFNlbGVjdGVkUHJvdmlkZXIoXG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRcdFx0XHRcdHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0Rm9ybWF0dGluZ01vZGUuU2lsZW50LFxuXHRcdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRjb25zdCBlZGl0czogUmVzb3VyY2VUZXh0RWRpdFtdID0gW107XG5cblx0XHRcdFx0aWYgKGZvcm1hdEVkaXRzKSB7XG5cdFx0XHRcdFx0ZWRpdHMucHVzaCguLi5mb3JtYXRFZGl0cy5tYXAoZWRpdCA9PiBuZXcgUmVzb3VyY2VUZXh0RWRpdChtb2RlbC51cmksIGVkaXQsIG1vZGVsLmdldFZlcnNpb25JZCgpKSkpO1xuXHRcdFx0XHRcdHJldHVybiBlZGl0cztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH0pKTtcblxuXHRcdFx0YXdhaXQgdGhpcy5idWxrRWRpdFNlcnZpY2UuYXBwbHkoLyogZWRpdCAqL2FsbENlbGxFZGl0cy5mbGF0KCksIHsgbGFiZWw6IGxvY2FsaXplKCdmb3JtYXRDZWxscy5sYWJlbCcsIFwiRm9ybWF0IENlbGxzXCIpLCBjb2RlOiAndW5kb3JlZG8ubm90ZWJvb2tzLm9uV2lsbEV4ZWN1dGVGb3JtYXQnLCB9KTtcblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENlbGxFeGVjdXRpb25QYXJ0aWNpcGFudHNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZWdpc3Rlcktlcm5lbEV4ZWN1dGlvblBhcnRpY2lwYW50cygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlcktlcm5lbEV4ZWN1dGlvblBhcnRpY2lwYW50cygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm5vdGVib29rRXhlY3V0aW9uU2VydmljZS5yZWdpc3RlckV4ZWN1dGlvblBhcnRpY2lwYW50KHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRm9ybWF0T25DZWxsRXhlY3V0aW9uUGFydGljaXBhbnQpKSk7XG5cdH1cbn1cblxuY29uc3Qgd29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoQ29udHJpYnV0aW9uc0V4dGVuc2lvbnMuV29ya2JlbmNoKTtcbndvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihDZWxsRXhlY3V0aW9uUGFydGljaXBhbnRzQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxZQUFZLHVCQUF1QjtBQUU1QyxTQUFTLGNBQWMsNEJBQTRCO0FBQ25ELFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQixvQ0FBb0Msc0RBQXNEO0FBQ25ILFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUErQztBQUN4RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDBCQUEwQixpQ0FBaUM7QUFDcEUsU0FBUyxzQkFBc0I7QUFFL0IsU0FBb0MsaUNBQWlDO0FBQ3JFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWtFLGNBQWMsd0NBQXdDO0FBQ3hILFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0NBQWtDO0FBRzNDLGdCQUFnQixjQUFjLFFBQVE7QUFBQSxFQUNyQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLGdCQUFnQixpQkFBaUI7QUFBQSxNQUNsRCxVQUFVO0FBQUEsTUFDVixjQUFjLGVBQWUsSUFBSSwyQkFBMkIsd0JBQXdCO0FBQUEsTUFDcEYsWUFBWTtBQUFBLFFBQ1gsTUFBTSxrQkFBa0IsZ0JBQWdCLFVBQVU7QUFBQSxRQUNsRCxTQUFTLE9BQU8sUUFBUSxPQUFPLE1BQU0sUUFBUTtBQUFBLFFBQzdDLE9BQU8sRUFBRSxTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUSxLQUFLO0FBQUEsUUFDL0QsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLFFBQ0wsSUFBSSxPQUFPO0FBQUEsUUFDWCxNQUFNLGVBQWUsSUFBSSxrQkFBa0IsbUJBQW1CLGtCQUFrQiw2QkFBNkI7QUFBQSxRQUM3RyxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxVQUFNLG1CQUFtQixTQUFTLElBQUksaUJBQWlCO0FBQ3ZELFVBQU0sc0JBQXNCLFNBQVMsSUFBSSxvQkFBb0I7QUFDN0QsVUFBTSwwQkFBMEIsU0FBUyxJQUFJLHdCQUF3QjtBQUNyRSxVQUFNLGtCQUFrQixTQUFTLElBQUksZ0JBQWdCO0FBQ3JELFVBQU0sdUJBQXVCLFNBQVMsSUFBSSxxQkFBcUI7QUFFL0QsVUFBTSxTQUFTLGdDQUFnQyxjQUFjLGdCQUFnQjtBQUM3RSxRQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ2xDO0FBQUEsSUFDRDtBQUVBLFVBQU0sV0FBVyxPQUFPO0FBRXhCLFVBQU0sZ0JBQXlCLE1BQU0scUJBQXFCLGVBQWUsMkJBQTJCLDZCQUE2QixVQUFVLFNBQVMsTUFBTSxrQkFBa0IsSUFBSTtBQUVoTCxVQUFNLGFBQWEsSUFBSSxnQkFBZ0I7QUFDdkMsUUFBSTtBQUNILFVBQUksQ0FBQyxlQUFlO0FBQ25CLGNBQU0sZUFBZSxNQUFNLFFBQVEsSUFBSSxTQUFTLE1BQU0sSUFBSSxPQUFNLFNBQVE7QUFDdkUsZ0JBQU0sTUFBTSxNQUFNLGlCQUFpQixxQkFBcUIsS0FBSyxHQUFHO0FBQ2hFLHFCQUFXLElBQUksR0FBRztBQUVsQixnQkFBTSxRQUFRLElBQUksT0FBTztBQUV6QixnQkFBTSxjQUFjLE1BQU07QUFBQSxZQUN6QjtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQSxlQUFlO0FBQUEsWUFDZixrQkFBa0I7QUFBQSxVQUNuQjtBQUVBLGdCQUFNLFFBQTRCLENBQUM7QUFFbkMsY0FBSSxhQUFhO0FBQ2hCLHVCQUFXLFFBQVEsYUFBYTtBQUMvQixvQkFBTSxLQUFLLElBQUksaUJBQWlCLE1BQU0sS0FBSyxNQUFNLE1BQU0sYUFBYSxDQUFDLENBQUM7QUFBQSxZQUN2RTtBQUVBLG1CQUFPO0FBQUEsVUFDUjtBQUVBLGlCQUFPLENBQUM7QUFBQSxRQUNULENBQUMsQ0FBQztBQUVGLGNBQU0sZ0JBQWdCO0FBQUE7QUFBQSxVQUFnQixhQUFhLEtBQUs7QUFBQSxVQUFHLEVBQUUsT0FBTyxTQUFTLFNBQVMsaUJBQWlCLEdBQUcsTUFBTSwwQkFBMkI7QUFBQSxRQUFDO0FBQUEsTUFDN0k7QUFBQSxJQUNELFVBQUU7QUFDRCxpQkFBVyxRQUFRO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUdELHFCQUFxQixNQUFNLHlCQUF5QixhQUFhO0FBQUEsRUFDaEUsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxvQkFBb0IsYUFBYTtBQUFBLE1BQ2xELGNBQWMsZUFBZSxJQUFJLDJCQUEyQiwwQkFBMEIsa0JBQWtCLG1CQUFtQixrQkFBa0IsVUFBVSxrQkFBa0IsNkJBQTZCO0FBQUEsTUFDdE0sUUFBUTtBQUFBLFFBQ1AsUUFBUSxlQUFlLElBQUksa0JBQWtCLGVBQWU7QUFBQSxRQUM1RCxTQUFTLE9BQU8sUUFBUSxPQUFPLE1BQU0sUUFBUTtBQUFBLFFBQzdDLE9BQU8sRUFBRSxTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUSxLQUFLO0FBQUEsUUFDL0QsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsaUJBQWlCO0FBQUEsUUFDaEIsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBNEIsUUFBb0M7QUFDekUsUUFBSSxPQUFPLFNBQVMsR0FBRztBQUN0QixZQUFNLGVBQWUsU0FBUyxJQUFJLHFCQUFxQjtBQUN2RCxZQUFNLGFBQWEsZUFBZSxvQ0FBb0MsUUFBUSxlQUFlLFVBQVUsU0FBUyxNQUFNLGtCQUFrQixNQUFNLElBQUk7QUFBQSxJQUNuSjtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRUQsSUFBTSxtQ0FBTixNQUE0RTtBQUFBLEVBQzNFLFlBQ29DLGlCQUNRLHlCQUNQLGtCQUNHLHFCQUNDLHNCQUNMLGtCQUNsQztBQU5rQztBQUNRO0FBQ1A7QUFDRztBQUNDO0FBQ0w7QUFBQSxFQUVwQztBQUFBLEVBRUEsTUFBTSxrQkFBa0IsWUFBcUQ7QUFFNUUsVUFBTSxVQUFVLEtBQUsscUJBQXFCLFNBQWtCLGdCQUFnQixxQkFBcUI7QUFDakcsUUFBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWEsSUFBSSxnQkFBZ0I7QUFDdkMsUUFBSTtBQUNILFlBQU0sZUFBZSxNQUFNLFFBQVEsSUFBSSxXQUFXLElBQUksT0FBTSxrQkFBaUI7QUFDNUUsY0FBTSxVQUFVLEtBQUssaUJBQWlCLHFCQUFxQixjQUFjLFFBQVE7QUFDakYsWUFBSSxDQUFDLFNBQVM7QUFDYixpQkFBTyxDQUFDO0FBQUEsUUFDVDtBQUNBLFlBQUk7QUFDSixtQkFBVyxRQUFRLFFBQVEsT0FBTztBQUNqQyxjQUFJLEtBQUssV0FBVyxjQUFjLFlBQVk7QUFDN0MseUJBQWE7QUFDYjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQ0EsWUFBSSxDQUFDLFlBQVk7QUFDaEIsaUJBQU8sQ0FBQztBQUFBLFFBQ1Q7QUFFQSxjQUFNLE1BQU0sTUFBTSxLQUFLLGlCQUFpQixxQkFBcUIsV0FBVyxHQUFHO0FBQzNFLG1CQUFXLElBQUksR0FBRztBQUVsQixjQUFNLFFBQVEsSUFBSSxPQUFPO0FBRXpCLGNBQU0sY0FBYyxNQUFNO0FBQUEsVUFDekIsS0FBSztBQUFBLFVBQ0wsS0FBSztBQUFBLFVBQ0w7QUFBQSxVQUNBLGVBQWU7QUFBQSxVQUNmLGtCQUFrQjtBQUFBLFFBQ25CO0FBRUEsY0FBTSxRQUE0QixDQUFDO0FBRW5DLFlBQUksYUFBYTtBQUNoQixnQkFBTSxLQUFLLEdBQUcsWUFBWSxJQUFJLFVBQVEsSUFBSSxpQkFBaUIsTUFBTSxLQUFLLE1BQU0sTUFBTSxhQUFhLENBQUMsQ0FBQyxDQUFDO0FBQ2xHLGlCQUFPO0FBQUEsUUFDUjtBQUVBLGVBQU8sQ0FBQztBQUFBLE1BQ1QsQ0FBQyxDQUFDO0FBRUYsWUFBTSxLQUFLLGdCQUFnQjtBQUFBO0FBQUEsUUFBZ0IsYUFBYSxLQUFLO0FBQUEsUUFBRyxFQUFFLE9BQU8sU0FBUyxxQkFBcUIsY0FBYyxHQUFHLE1BQU0seUNBQTBDO0FBQUEsTUFBQztBQUFBLElBRTFLLFVBQUU7QUFDRCxpQkFBVyxRQUFRO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQ0Q7QUFqRU0sbUNBQU47QUFBQSxFQUVHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBHO0FBbUVDLElBQU0sd0NBQU4sY0FBb0QsV0FBNkM7QUFBQSxFQUN2RyxZQUN5QyxzQkFDSSwwQkFDM0M7QUFDRCxVQUFNO0FBSGtDO0FBQ0k7QUFHNUMsU0FBSyxvQ0FBb0M7QUFBQSxFQUMxQztBQUFBLEVBRVEsc0NBQTRDO0FBQ25ELFNBQUssVUFBVSxLQUFLLHlCQUF5Qiw2QkFBNkIsS0FBSyxxQkFBcUIsZUFBZSxnQ0FBZ0MsQ0FBQyxDQUFDO0FBQUEsRUFDdEo7QUFDRDtBQVphLHdDQUFOO0FBQUEsRUFFSjtBQUFBLEVBQ0E7QUFBQSxHQUhVO0FBY2IsTUFBTSxpQ0FBaUMsU0FBUyxHQUFvQyxpQ0FBaUMsU0FBUztBQUM5SCwrQkFBK0IsOEJBQThCLHVDQUF1QyxlQUFlLFFBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
