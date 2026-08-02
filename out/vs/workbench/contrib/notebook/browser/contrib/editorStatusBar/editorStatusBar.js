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
import * as nls from "../../../../../../nls.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../../../common/contributions.js";
import { CENTER_ACTIVE_CELL } from "../navigation/arrow.js";
import { SELECT_KERNEL_ID } from "../../controller/coreActions.js";
import { SELECT_NOTEBOOK_INDENTATION_ID } from "../../controller/editActions.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { NotebookCellsChangeType } from "../../../common/notebookCommon.js";
import { INotebookKernelService } from "../../../common/notebookKernelService.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { IStatusbarService, StatusbarAlignment } from "../../../../../services/statusbar/browser/statusbar.js";
import { IEditorGroupsService } from "../../../../../services/editor/common/editorGroupsService.js";
import { Event } from "../../../../../../base/common/event.js";
let ImplictKernelSelector = class {
  constructor(notebook, suggested, notebookKernelService, languageFeaturesService, logService) {
    const disposables = new DisposableStore();
    this.dispose = disposables.dispose.bind(disposables);
    const selectKernel = () => {
      disposables.clear();
      notebookKernelService.selectKernelForNotebook(suggested, notebook);
    };
    disposables.add(notebook.onDidChangeContent((e) => {
      for (const event of e.rawEvents) {
        switch (event.kind) {
          case NotebookCellsChangeType.ChangeCellContent:
          case NotebookCellsChangeType.ModelChange:
          case NotebookCellsChangeType.Move:
          case NotebookCellsChangeType.ChangeCellLanguage:
            logService.trace("IMPLICIT kernel selection because of change event", event.kind);
            selectKernel();
            break;
        }
      }
    }));
    disposables.add(languageFeaturesService.hoverProvider.register({ scheme: Schemas.vscodeNotebookCell, pattern: notebook.uri.path }, {
      provideHover() {
        logService.trace("IMPLICIT kernel selection because of hover");
        selectKernel();
        return void 0;
      }
    }));
  }
};
ImplictKernelSelector = __decorateClass([
  __decorateParam(2, INotebookKernelService),
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, ILogService)
], ImplictKernelSelector);
let KernelStatus = class extends Disposable {
  constructor(_editorService, _statusbarService, _notebookKernelService, _instantiationService) {
    super();
    this._editorService = _editorService;
    this._statusbarService = _statusbarService;
    this._notebookKernelService = _notebookKernelService;
    this._instantiationService = _instantiationService;
    this._editorDisposables = this._register(new DisposableStore());
    this._kernelInfoElement = this._register(new DisposableStore());
    this._register(this._editorService.onDidActiveEditorChange(() => this._updateStatusbar()));
    this._updateStatusbar();
  }
  _updateStatusbar() {
    this._editorDisposables.clear();
    const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
    if (!activeEditor) {
      this._kernelInfoElement.clear();
      return;
    }
    const updateStatus = () => {
      if (activeEditor.notebookOptions.getDisplayOptions().globalToolbar) {
        this._kernelInfoElement.clear();
        return;
      }
      const notebook = activeEditor.textModel;
      if (notebook) {
        this._showKernelStatus(notebook);
      } else {
        this._kernelInfoElement.clear();
      }
    };
    this._editorDisposables.add(this._notebookKernelService.onDidAddKernel(updateStatus));
    this._editorDisposables.add(this._notebookKernelService.onDidChangeSelectedNotebooks(updateStatus));
    this._editorDisposables.add(this._notebookKernelService.onDidChangeNotebookAffinity(updateStatus));
    this._editorDisposables.add(activeEditor.onDidChangeModel(updateStatus));
    this._editorDisposables.add(activeEditor.notebookOptions.onDidChangeOptions(updateStatus));
    updateStatus();
  }
  _showKernelStatus(notebook) {
    this._kernelInfoElement.clear();
    const { selected, suggestions, all } = this._notebookKernelService.getMatchingKernel(notebook);
    const suggested = (suggestions.length === 1 ? suggestions[0] : void 0) ?? all.length === 1 ? all[0] : void 0;
    let isSuggested = false;
    if (all.length === 0) {
      return;
    } else if (selected || suggested) {
      let kernel = selected;
      if (!kernel) {
        kernel = suggested;
        isSuggested = true;
        this._kernelInfoElement.add(this._instantiationService.createInstance(ImplictKernelSelector, notebook, kernel));
      }
      const tooltip = kernel.description ?? kernel.detail ?? kernel.label;
      this._kernelInfoElement.add(this._statusbarService.addEntry(
        {
          name: nls.localize("notebook.info", "Notebook Kernel Info"),
          text: `$(notebook-kernel-select) ${kernel.label}`,
          ariaLabel: kernel.label,
          tooltip: isSuggested ? nls.localize("tooltop", "{0} (suggestion)", tooltip) : tooltip,
          command: SELECT_KERNEL_ID
        },
        SELECT_KERNEL_ID,
        StatusbarAlignment.RIGHT,
        10
      ));
      this._kernelInfoElement.add(kernel.onDidChange(() => this._showKernelStatus(notebook)));
    } else {
      this._kernelInfoElement.add(this._statusbarService.addEntry(
        {
          name: nls.localize("notebook.select", "Notebook Kernel Selection"),
          text: nls.localize("kernel.select.label", "Select Kernel"),
          ariaLabel: nls.localize("kernel.select.label", "Select Kernel"),
          command: SELECT_KERNEL_ID,
          kind: "prominent"
        },
        SELECT_KERNEL_ID,
        StatusbarAlignment.RIGHT,
        10
      ));
    }
  }
};
KernelStatus = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IStatusbarService),
  __decorateParam(2, INotebookKernelService),
  __decorateParam(3, IInstantiationService)
], KernelStatus);
let ActiveCellStatus = class extends Disposable {
  constructor(_editorService, _statusbarService) {
    super();
    this._editorService = _editorService;
    this._statusbarService = _statusbarService;
    this._itemDisposables = this._register(new DisposableStore());
    this._accessor = this._register(new MutableDisposable());
    this._register(this._editorService.onDidActiveEditorChange(() => this._update()));
    this._update();
  }
  _update() {
    this._itemDisposables.clear();
    const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
    if (activeEditor) {
      this._itemDisposables.add(activeEditor.onDidChangeSelection(() => this._show(activeEditor)));
      this._itemDisposables.add(activeEditor.onDidChangeActiveCell(() => this._show(activeEditor)));
      this._show(activeEditor);
    } else {
      this._accessor.clear();
    }
  }
  _show(editor) {
    if (!editor.hasModel()) {
      this._accessor.clear();
      return;
    }
    const newText = this._getSelectionsText(editor);
    if (!newText) {
      this._accessor.clear();
      return;
    }
    const entry = {
      name: nls.localize("notebook.activeCellStatusName", "Notebook Editor Selections"),
      text: newText,
      ariaLabel: newText,
      command: CENTER_ACTIVE_CELL
    };
    if (!this._accessor.value) {
      this._accessor.value = this._statusbarService.addEntry(
        entry,
        "notebook.activeCellStatus",
        StatusbarAlignment.RIGHT,
        100
      );
    } else {
      this._accessor.value.update(entry);
    }
  }
  _getSelectionsText(editor) {
    if (!editor.hasModel()) {
      return void 0;
    }
    const activeCell = editor.getActiveCell();
    if (!activeCell) {
      return void 0;
    }
    const idxFocused = editor.getCellIndex(activeCell) + 1;
    const numSelected = editor.getSelections().reduce((prev, range) => prev + (range.end - range.start), 0);
    const totalCells = editor.getLength();
    return numSelected > 1 ? nls.localize("notebook.multiActiveCellIndicator", "Cell {0} ({1} selected)", idxFocused, numSelected) : nls.localize("notebook.singleActiveCellIndicator", "Cell {0} of {1}", idxFocused, totalCells);
  }
};
ActiveCellStatus = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IStatusbarService)
], ActiveCellStatus);
let NotebookIndentationStatus = class extends Disposable {
  constructor(_editorService, _statusbarService, _configurationService) {
    super();
    this._editorService = _editorService;
    this._statusbarService = _statusbarService;
    this._configurationService = _configurationService;
    this._itemDisposables = this._register(new DisposableStore());
    this._accessor = this._register(new MutableDisposable());
    this._register(this._editorService.onDidActiveEditorChange(() => this._update()));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor") || e.affectsConfiguration("notebook")) {
        this._update();
      }
    }));
    this._update();
  }
  _update() {
    this._itemDisposables.clear();
    const activeEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
    if (activeEditor) {
      this._show(activeEditor);
      this._itemDisposables.add(activeEditor.onDidChangeSelection(() => {
        this._accessor.clear();
        this._show(activeEditor);
      }));
    } else {
      this._accessor.clear();
    }
  }
  _show(editor) {
    if (!editor.hasModel()) {
      this._accessor.clear();
      return;
    }
    const cellOptions = editor.getActiveCell()?.textModel?.getOptions();
    if (!cellOptions) {
      this._accessor.clear();
      return;
    }
    const cellEditorOverridesRaw = editor.notebookOptions.getDisplayOptions().editorOptionsCustomizations;
    const indentSize = cellEditorOverridesRaw?.["editor.indentSize"] ?? cellOptions?.indentSize;
    const insertSpaces = cellEditorOverridesRaw?.["editor.insertSpaces"] ?? cellOptions?.insertSpaces;
    const tabSize = cellEditorOverridesRaw?.["editor.tabSize"] ?? cellOptions?.tabSize;
    const width = typeof indentSize === "number" ? indentSize : tabSize;
    const message = insertSpaces ? `Spaces: ${width}` : `Tab Size: ${width}`;
    const newText = message;
    if (!newText) {
      this._accessor.clear();
      return;
    }
    const entry = {
      name: nls.localize("notebook.indentation", "Notebook Indentation"),
      text: newText,
      ariaLabel: newText,
      tooltip: nls.localize("selectNotebookIndentation", "Select Indentation"),
      command: SELECT_NOTEBOOK_INDENTATION_ID
    };
    if (!this._accessor.value) {
      this._accessor.value = this._statusbarService.addEntry(
        entry,
        "notebook.status.indentation",
        StatusbarAlignment.RIGHT,
        100.4
      );
    } else {
      this._accessor.value.update(entry);
    }
  }
};
NotebookIndentationStatus.ID = "selectNotebookIndentation";
NotebookIndentationStatus = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IStatusbarService),
  __decorateParam(2, IConfigurationService)
], NotebookIndentationStatus);
let NotebookEditorStatusContribution = class extends Disposable {
  constructor(editorGroupService) {
    super();
    this.editorGroupService = editorGroupService;
    for (const part of editorGroupService.parts) {
      this.createNotebookStatus(part);
    }
    this._register(editorGroupService.onDidCreateAuxiliaryEditorPart((part) => this.createNotebookStatus(part)));
  }
  createNotebookStatus(part) {
    const disposables = new DisposableStore();
    Event.once(part.onWillDispose)(() => disposables.dispose());
    const scopedInstantiationService = this.editorGroupService.getScopedInstantiationService(part);
    disposables.add(scopedInstantiationService.createInstance(KernelStatus));
    disposables.add(scopedInstantiationService.createInstance(ActiveCellStatus));
    disposables.add(scopedInstantiationService.createInstance(NotebookIndentationStatus));
  }
};
NotebookEditorStatusContribution.ID = "notebook.contrib.editorStatus";
NotebookEditorStatusContribution = __decorateClass([
  __decorateParam(0, IEditorGroupsService)
], NotebookEditorStatusContribution);
registerWorkbenchContribution2(NotebookEditorStatusContribution.ID, NotebookEditorStatusContribution, WorkbenchPhase.AfterRestored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9lZGl0b3JTdGF0dXNCYXIvZWRpdG9yU3RhdHVzQmFyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IENFTlRFUl9BQ1RJVkVfQ0VMTCB9IGZyb20gJy4uL25hdmlnYXRpb24vYXJyb3cuanMnO1xuaW1wb3J0IHsgU0VMRUNUX0tFUk5FTF9JRCB9IGZyb20gJy4uLy4uL2NvbnRyb2xsZXIvY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgU0VMRUNUX05PVEVCT09LX0lOREVOVEFUSU9OX0lEIH0gZnJvbSAnLi4vLi4vY29udHJvbGxlci9lZGl0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3IsIGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rS2VybmVsLCBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rS2VybmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RhdHVzYmFyRW50cnksIElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yLCBJU3RhdHVzYmFyU2VydmljZSwgU3RhdHVzYmFyQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlLCBJRWRpdG9yUGFydCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcblxuY2xhc3MgSW1wbGljdEtlcm5lbFNlbGVjdG9yIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGRpc3Bvc2U6ICgpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bm90ZWJvb2s6IE5vdGVib29rVGV4dE1vZGVsLFxuXHRcdHN1Z2dlc3RlZDogSU5vdGVib29rS2VybmVsLFxuXHRcdEBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIG5vdGVib29rS2VybmVsU2VydmljZTogSU5vdGVib29rS2VybmVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuZGlzcG9zZSA9IGRpc3Bvc2FibGVzLmRpc3Bvc2UuYmluZChkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBzZWxlY3RLZXJuZWwgPSAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0bm90ZWJvb2tLZXJuZWxTZXJ2aWNlLnNlbGVjdEtlcm5lbEZvck5vdGVib29rKHN1Z2dlc3RlZCwgbm90ZWJvb2spO1xuXHRcdH07XG5cblx0XHQvLyBJTVBMSUNJVExZIHNlbGVjdCBhIHN1Z2dlc3RlZCBrZXJuZWwgd2hlbiB0aGUgbm90ZWJvb2sgaGFzIGJlZW4gY2hhbmdlZFxuXHRcdC8vIGUuZyBjaGFuZ2UgY2VsbCBzb3VyY2UsIG1vdmUgY2VsbHMsIGV0Y1xuXHRcdGRpc3Bvc2FibGVzLmFkZChub3RlYm9vay5vbkRpZENoYW5nZUNvbnRlbnQoZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGV2ZW50IG9mIGUucmF3RXZlbnRzKSB7XG5cdFx0XHRcdHN3aXRjaCAoZXZlbnQua2luZCkge1xuXHRcdFx0XHRcdGNhc2UgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbENvbnRlbnQ6XG5cdFx0XHRcdFx0Y2FzZSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb2RlbENoYW5nZTpcblx0XHRcdFx0XHRjYXNlIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vdmU6XG5cdFx0XHRcdFx0Y2FzZSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTGFuZ3VhZ2U6XG5cdFx0XHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdJTVBMSUNJVCBrZXJuZWwgc2VsZWN0aW9uIGJlY2F1c2Ugb2YgY2hhbmdlIGV2ZW50JywgZXZlbnQua2luZCk7XG5cdFx0XHRcdFx0XHRzZWxlY3RLZXJuZWwoKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cblx0XHQvLyBJTVBMSUNJVExZIHNlbGVjdCBhIHN1Z2dlc3RlZCBrZXJuZWwgd2hlbiB1c2VycyBzdGFydCB0byBob3Zlci4gVGhpcyBzaG91bGRcblx0XHQvLyBiZSBhIHN0cm9uZyBlbm91Z2ggaGludCB0aGF0IHRoZSB1c2VyIHdhbnRzIHRvIGludGVyYWN0IHdpdGggdGhlIG5vdGVib29rLiBNYXliZVxuXHRcdC8vIGFkZCBtb3JlIHRyaWdnZXJzIGxpa2UgZ290by1wcm92aWRlcnMgb3IgY29tcGxldGlvbi1wcm92aWRlcnNcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaG92ZXJQcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwsIHBhdHRlcm46IG5vdGVib29rLnVyaS5wYXRoIH0sIHtcblx0XHRcdHByb3ZpZGVIb3ZlcigpIHtcblx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgnSU1QTElDSVQga2VybmVsIHNlbGVjdGlvbiBiZWNhdXNlIG9mIGhvdmVyJyk7XG5cdFx0XHRcdHNlbGVjdEtlcm5lbCgpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5jbGFzcyBLZXJuZWxTdGF0dXMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9rZXJuZWxJbmZvRWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXNiYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASU5vdGVib29rS2VybmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0tlcm5lbFNlcnZpY2U6IElOb3RlYm9va0tlcm5lbFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4gdGhpcy5fdXBkYXRlU3RhdHVzYmFyKCkpKTtcblx0XHR0aGlzLl91cGRhdGVTdGF0dXNiYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVN0YXR1c2JhcigpIHtcblx0XHR0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSh0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdGlmICghYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHQvLyBub3QgYSBub3RlYm9vayAtPiBjbGVhbi11cCwgZG9uZVxuXHRcdFx0dGhpcy5fa2VybmVsSW5mb0VsZW1lbnQuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB1cGRhdGVTdGF0dXMgPSAoKSA9PiB7XG5cdFx0XHRpZiAoYWN0aXZlRWRpdG9yLm5vdGVib29rT3B0aW9ucy5nZXREaXNwbGF5T3B0aW9ucygpLmdsb2JhbFRvb2xiYXIpIHtcblx0XHRcdFx0Ly8ga2VybmVsIGluZm8gcmVuZGVyZWQgaW4gdGhlIG5vdGVib29rIHRvb2xiYXIgYWxyZWFkeVxuXHRcdFx0XHR0aGlzLl9rZXJuZWxJbmZvRWxlbWVudC5jbGVhcigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5vdGVib29rID0gYWN0aXZlRWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGlmIChub3RlYm9vaykge1xuXHRcdFx0XHR0aGlzLl9zaG93S2VybmVsU3RhdHVzKG5vdGVib29rKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2tlcm5lbEluZm9FbGVtZW50LmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2Uub25EaWRBZGRLZXJuZWwodXBkYXRlU3RhdHVzKSk7XG5cdFx0dGhpcy5fZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5vbkRpZENoYW5nZVNlbGVjdGVkTm90ZWJvb2tzKHVwZGF0ZVN0YXR1cykpO1xuXHRcdHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2Uub25EaWRDaGFuZ2VOb3RlYm9va0FmZmluaXR5KHVwZGF0ZVN0YXR1cykpO1xuXHRcdHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzLmFkZChhY3RpdmVFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCh1cGRhdGVTdGF0dXMpKTtcblx0XHR0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcy5hZGQoYWN0aXZlRWRpdG9yLm5vdGVib29rT3B0aW9ucy5vbkRpZENoYW5nZU9wdGlvbnModXBkYXRlU3RhdHVzKSk7XG5cdFx0dXBkYXRlU3RhdHVzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93S2VybmVsU3RhdHVzKG5vdGVib29rOiBOb3RlYm9va1RleHRNb2RlbCkge1xuXG5cdFx0dGhpcy5fa2VybmVsSW5mb0VsZW1lbnQuY2xlYXIoKTtcblxuXHRcdGNvbnN0IHsgc2VsZWN0ZWQsIHN1Z2dlc3Rpb25zLCBhbGwgfSA9IHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5nZXRNYXRjaGluZ0tlcm5lbChub3RlYm9vayk7XG5cdFx0Y29uc3Qgc3VnZ2VzdGVkID0gKHN1Z2dlc3Rpb25zLmxlbmd0aCA9PT0gMSA/IHN1Z2dlc3Rpb25zWzBdIDogdW5kZWZpbmVkKVxuXHRcdFx0Pz8gKGFsbC5sZW5ndGggPT09IDEpID8gYWxsWzBdIDogdW5kZWZpbmVkO1xuXHRcdGxldCBpc1N1Z2dlc3RlZCA9IGZhbHNlO1xuXG5cdFx0aWYgKGFsbC5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIG5vIGtlcm5lbCAtPiBubyBzdGF0dXNcblx0XHRcdHJldHVybjtcblxuXHRcdH0gZWxzZSBpZiAoc2VsZWN0ZWQgfHwgc3VnZ2VzdGVkKSB7XG5cdFx0XHQvLyBzZWxlY3RlZCBvciBzaW5nbGUga2VybmVsXG5cdFx0XHRsZXQga2VybmVsID0gc2VsZWN0ZWQ7XG5cblx0XHRcdGlmICgha2VybmVsKSB7XG5cdFx0XHRcdC8vIHByb2NlZWQgd2l0aCBzdWdnZXN0ZWQga2VybmVsIC0gc2hvdyBVSSBhbmQgaW5zdGFsbCBoYW5kbGVyIHRoYXQgc2VsZWN0cyB0aGUga2VybmVsXG5cdFx0XHRcdC8vIHdoZW4gbm9uIHRyaXZpYWwgaW50ZXJhY3Rpb25zIHdpdGggdGhlIG5vdGVib29rIGhhcHBlbi5cblx0XHRcdFx0a2VybmVsID0gc3VnZ2VzdGVkITtcblx0XHRcdFx0aXNTdWdnZXN0ZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9rZXJuZWxJbmZvRWxlbWVudC5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW1wbGljdEtlcm5lbFNlbGVjdG9yLCBub3RlYm9vaywga2VybmVsKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0b29sdGlwID0ga2VybmVsLmRlc2NyaXB0aW9uID8/IGtlcm5lbC5kZXRhaWwgPz8ga2VybmVsLmxhYmVsO1xuXHRcdFx0dGhpcy5fa2VybmVsSW5mb0VsZW1lbnQuYWRkKHRoaXMuX3N0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUoJ25vdGVib29rLmluZm8nLCBcIk5vdGVib29rIEtlcm5lbCBJbmZvXCIpLFxuXHRcdFx0XHRcdHRleHQ6IGAkKG5vdGVib29rLWtlcm5lbC1zZWxlY3QpICR7a2VybmVsLmxhYmVsfWAsXG5cdFx0XHRcdFx0YXJpYUxhYmVsOiBrZXJuZWwubGFiZWwsXG5cdFx0XHRcdFx0dG9vbHRpcDogaXNTdWdnZXN0ZWQgPyBubHMubG9jYWxpemUoJ3Rvb2x0b3AnLCBcInswfSAoc3VnZ2VzdGlvbilcIiwgdG9vbHRpcCkgOiB0b29sdGlwLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IFNFTEVDVF9LRVJORUxfSUQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFNFTEVDVF9LRVJORUxfSUQsXG5cdFx0XHRcdFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCxcblx0XHRcdFx0MTBcblx0XHRcdCkpO1xuXG5cdFx0XHR0aGlzLl9rZXJuZWxJbmZvRWxlbWVudC5hZGQoa2VybmVsLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX3Nob3dLZXJuZWxTdGF0dXMobm90ZWJvb2spKSk7XG5cblxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBtdWx0aXBsZSBrZXJuZWxzIC0+IHNob3cgc2VsZWN0aW9uIGhpbnRcblx0XHRcdHRoaXMuX2tlcm5lbEluZm9FbGVtZW50LmFkZCh0aGlzLl9zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplKCdub3RlYm9vay5zZWxlY3QnLCBcIk5vdGVib29rIEtlcm5lbCBTZWxlY3Rpb25cIiksXG5cdFx0XHRcdFx0dGV4dDogbmxzLmxvY2FsaXplKCdrZXJuZWwuc2VsZWN0LmxhYmVsJywgXCJTZWxlY3QgS2VybmVsXCIpLFxuXHRcdFx0XHRcdGFyaWFMYWJlbDogbmxzLmxvY2FsaXplKCdrZXJuZWwuc2VsZWN0LmxhYmVsJywgXCJTZWxlY3QgS2VybmVsXCIpLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IFNFTEVDVF9LRVJORUxfSUQsXG5cdFx0XHRcdFx0a2luZDogJ3Byb21pbmVudCdcblx0XHRcdFx0fSxcblx0XHRcdFx0U0VMRUNUX0tFUk5FTF9JRCxcblx0XHRcdFx0U3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULFxuXHRcdFx0XHQxMFxuXHRcdFx0KSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEFjdGl2ZUNlbGxTdGF0dXMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaXRlbURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWNjZXNzb3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCkge1xuXHRcdHRoaXMuX2l0ZW1EaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUodGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRpZiAoYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHR0aGlzLl9pdGVtRGlzcG9zYWJsZXMuYWRkKGFjdGl2ZUVkaXRvci5vbkRpZENoYW5nZVNlbGVjdGlvbigoKSA9PiB0aGlzLl9zaG93KGFjdGl2ZUVkaXRvcikpKTtcblx0XHRcdHRoaXMuX2l0ZW1EaXNwb3NhYmxlcy5hZGQoYWN0aXZlRWRpdG9yLm9uRGlkQ2hhbmdlQWN0aXZlQ2VsbCgoKSA9PiB0aGlzLl9zaG93KGFjdGl2ZUVkaXRvcikpKTtcblx0XHRcdHRoaXMuX3Nob3coYWN0aXZlRWRpdG9yKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fYWNjZXNzb3IuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93KGVkaXRvcjogSU5vdGVib29rRWRpdG9yKSB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0dGhpcy5fYWNjZXNzb3IuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBuZXdUZXh0ID0gdGhpcy5fZ2V0U2VsZWN0aW9uc1RleHQoZWRpdG9yKTtcblx0XHRpZiAoIW5ld1RleHQpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc29yLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cnk6IElTdGF0dXNiYXJFbnRyeSA9IHtcblx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suYWN0aXZlQ2VsbFN0YXR1c05hbWUnLCBcIk5vdGVib29rIEVkaXRvciBTZWxlY3Rpb25zXCIpLFxuXHRcdFx0dGV4dDogbmV3VGV4dCxcblx0XHRcdGFyaWFMYWJlbDogbmV3VGV4dCxcblx0XHRcdGNvbW1hbmQ6IENFTlRFUl9BQ1RJVkVfQ0VMTFxuXHRcdH07XG5cdFx0aWYgKCF0aGlzLl9hY2Nlc3Nvci52YWx1ZSkge1xuXHRcdFx0dGhpcy5fYWNjZXNzb3IudmFsdWUgPSB0aGlzLl9zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KFxuXHRcdFx0XHRlbnRyeSxcblx0XHRcdFx0J25vdGVib29rLmFjdGl2ZUNlbGxTdGF0dXMnLFxuXHRcdFx0XHRTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsXG5cdFx0XHRcdDEwMFxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fYWNjZXNzb3IudmFsdWUudXBkYXRlKGVudHJ5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTZWxlY3Rpb25zVGV4dChlZGl0b3I6IElOb3RlYm9va0VkaXRvcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVDZWxsID0gZWRpdG9yLmdldEFjdGl2ZUNlbGwoKTtcblx0XHRpZiAoIWFjdGl2ZUNlbGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWR4Rm9jdXNlZCA9IGVkaXRvci5nZXRDZWxsSW5kZXgoYWN0aXZlQ2VsbCkgKyAxO1xuXHRcdGNvbnN0IG51bVNlbGVjdGVkID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKS5yZWR1Y2UoKHByZXYsIHJhbmdlKSA9PiBwcmV2ICsgKHJhbmdlLmVuZCAtIHJhbmdlLnN0YXJ0KSwgMCk7XG5cdFx0Y29uc3QgdG90YWxDZWxscyA9IGVkaXRvci5nZXRMZW5ndGgoKTtcblx0XHRyZXR1cm4gbnVtU2VsZWN0ZWQgPiAxID9cblx0XHRcdG5scy5sb2NhbGl6ZSgnbm90ZWJvb2subXVsdGlBY3RpdmVDZWxsSW5kaWNhdG9yJywgXCJDZWxsIHswfSAoezF9IHNlbGVjdGVkKVwiLCBpZHhGb2N1c2VkLCBudW1TZWxlY3RlZCkgOlxuXHRcdFx0bmxzLmxvY2FsaXplKCdub3RlYm9vay5zaW5nbGVBY3RpdmVDZWxsSW5kaWNhdG9yJywgXCJDZWxsIHswfSBvZiB7MX1cIiwgaWR4Rm9jdXNlZCwgdG90YWxDZWxscyk7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tJbmRlbnRhdGlvblN0YXR1cyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc29yID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2VsZWN0Tm90ZWJvb2tJbmRlbnRhdGlvbic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXNiYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3InKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdub3RlYm9vaycpKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl91cGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZSgpIHtcblx0XHR0aGlzLl9pdGVtRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvcikge1xuXHRcdFx0dGhpcy5fc2hvdyhhY3RpdmVFZGl0b3IpO1xuXHRcdFx0dGhpcy5faXRlbURpc3Bvc2FibGVzLmFkZChhY3RpdmVFZGl0b3Iub25EaWRDaGFuZ2VTZWxlY3Rpb24oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9hY2Nlc3Nvci5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl9zaG93KGFjdGl2ZUVkaXRvcik7XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2FjY2Vzc29yLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdyhlZGl0b3I6IElOb3RlYm9va0VkaXRvcikge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc29yLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbE9wdGlvbnMgPSBlZGl0b3IuZ2V0QWN0aXZlQ2VsbCgpPy50ZXh0TW9kZWw/LmdldE9wdGlvbnMoKTtcblx0XHRpZiAoIWNlbGxPcHRpb25zKSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3Nvci5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNlbGxFZGl0b3JPdmVycmlkZXNSYXcgPSBlZGl0b3Iubm90ZWJvb2tPcHRpb25zLmdldERpc3BsYXlPcHRpb25zKCkuZWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25zO1xuXHRcdGNvbnN0IGluZGVudFNpemUgPSBjZWxsRWRpdG9yT3ZlcnJpZGVzUmF3Py5bJ2VkaXRvci5pbmRlbnRTaXplJ10gPz8gY2VsbE9wdGlvbnM/LmluZGVudFNpemU7XG5cdFx0Y29uc3QgaW5zZXJ0U3BhY2VzID0gY2VsbEVkaXRvck92ZXJyaWRlc1Jhdz8uWydlZGl0b3IuaW5zZXJ0U3BhY2VzJ10gPz8gY2VsbE9wdGlvbnM/Lmluc2VydFNwYWNlcztcblx0XHRjb25zdCB0YWJTaXplID0gY2VsbEVkaXRvck92ZXJyaWRlc1Jhdz8uWydlZGl0b3IudGFiU2l6ZSddID8/IGNlbGxPcHRpb25zPy50YWJTaXplO1xuXG5cdFx0Y29uc3Qgd2lkdGggPSB0eXBlb2YgaW5kZW50U2l6ZSA9PT0gJ251bWJlcicgPyBpbmRlbnRTaXplIDogdGFiU2l6ZTtcblxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBpbnNlcnRTcGFjZXMgPyBgU3BhY2VzOiAke3dpZHRofWAgOiBgVGFiIFNpemU6ICR7d2lkdGh9YDtcblx0XHRjb25zdCBuZXdUZXh0ID0gbWVzc2FnZTtcblx0XHRpZiAoIW5ld1RleHQpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc29yLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cnk6IElTdGF0dXNiYXJFbnRyeSA9IHtcblx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suaW5kZW50YXRpb24nLCBcIk5vdGVib29rIEluZGVudGF0aW9uXCIpLFxuXHRcdFx0dGV4dDogbmV3VGV4dCxcblx0XHRcdGFyaWFMYWJlbDogbmV3VGV4dCxcblx0XHRcdHRvb2x0aXA6IG5scy5sb2NhbGl6ZSgnc2VsZWN0Tm90ZWJvb2tJbmRlbnRhdGlvbicsIFwiU2VsZWN0IEluZGVudGF0aW9uXCIpLFxuXHRcdFx0Y29tbWFuZDogU0VMRUNUX05PVEVCT09LX0lOREVOVEFUSU9OX0lEXG5cdFx0fTtcblxuXHRcdGlmICghdGhpcy5fYWNjZXNzb3IudmFsdWUpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc29yLnZhbHVlID0gdGhpcy5fc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeShcblx0XHRcdFx0ZW50cnksXG5cdFx0XHRcdCdub3RlYm9vay5zdGF0dXMuaW5kZW50YXRpb24nLFxuXHRcdFx0XHRTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsXG5cdFx0XHRcdDEwMC40XG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3Nvci52YWx1ZS51cGRhdGUoZW50cnkpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va0VkaXRvclN0YXR1c0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnbm90ZWJvb2suY29udHJpYi5lZGl0b3JTdGF0dXMnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGZvciAoY29uc3QgcGFydCBvZiBlZGl0b3JHcm91cFNlcnZpY2UucGFydHMpIHtcblx0XHRcdHRoaXMuY3JlYXRlTm90ZWJvb2tTdGF0dXMocGFydCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yR3JvdXBTZXJ2aWNlLm9uRGlkQ3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydChwYXJ0ID0+IHRoaXMuY3JlYXRlTm90ZWJvb2tTdGF0dXMocGFydCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTm90ZWJvb2tTdGF0dXMocGFydDogSUVkaXRvclBhcnQpOiB2b2lkIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRFdmVudC5vbmNlKHBhcnQub25XaWxsRGlzcG9zZSkoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblxuXHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ2V0U2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UocGFydCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEtlcm5lbFN0YXR1cykpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY3RpdmVDZWxsU3RhdHVzKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rSW5kZW50YXRpb25TdGF0dXMpKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoTm90ZWJvb2tFZGl0b3JTdGF0dXNDb250cmlidXRpb24uSUQsIE5vdGVib29rRWRpdG9yU3RhdHVzQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsWUFBWSxpQkFBOEIseUJBQXlCO0FBQzVFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFpQyxnQkFBZ0Isc0NBQXNDO0FBQ3ZGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQTBCLHVDQUF1QztBQUVqRSxTQUFTLCtCQUErQjtBQUN4QyxTQUEwQiw4QkFBOEI7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBbUQsbUJBQW1CLDBCQUEwQjtBQUNoRyxTQUFTLDRCQUF5QztBQUNsRCxTQUFTLGFBQWE7QUFFdEIsSUFBTSx3QkFBTixNQUFtRDtBQUFBLEVBSWxELFlBQ0MsVUFDQSxXQUN3Qix1QkFDRSx5QkFDYixZQUNaO0FBQ0QsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFNBQUssVUFBVSxZQUFZLFFBQVEsS0FBSyxXQUFXO0FBRW5ELFVBQU0sZUFBZSxNQUFNO0FBQzFCLGtCQUFZLE1BQU07QUFDbEIsNEJBQXNCLHdCQUF3QixXQUFXLFFBQVE7QUFBQSxJQUNsRTtBQUlBLGdCQUFZLElBQUksU0FBUyxtQkFBbUIsT0FBSztBQUNoRCxpQkFBVyxTQUFTLEVBQUUsV0FBVztBQUNoQyxnQkFBUSxNQUFNLE1BQU07QUFBQSxVQUNuQixLQUFLLHdCQUF3QjtBQUFBLFVBQzdCLEtBQUssd0JBQXdCO0FBQUEsVUFDN0IsS0FBSyx3QkFBd0I7QUFBQSxVQUM3QixLQUFLLHdCQUF3QjtBQUM1Qix1QkFBVyxNQUFNLHFEQUFxRCxNQUFNLElBQUk7QUFDaEYseUJBQWE7QUFDYjtBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFNRixnQkFBWSxJQUFJLHdCQUF3QixjQUFjLFNBQVMsRUFBRSxRQUFRLFFBQVEsb0JBQW9CLFNBQVMsU0FBUyxJQUFJLEtBQUssR0FBRztBQUFBLE1BQ2xJLGVBQWU7QUFDZCxtQkFBVyxNQUFNLDRDQUE0QztBQUM3RCxxQkFBYTtBQUNiLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0Q7QUEvQ00sd0JBQU47QUFBQSxFQU9HO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRHO0FBaUROLElBQU0sZUFBTixjQUEyQixXQUE2QztBQUFBLEVBS3ZFLFlBQ2tDLGdCQUNHLG1CQUNLLHdCQUNELHVCQUN2QztBQUNELFVBQU07QUFMMkI7QUFDRztBQUNLO0FBQ0Q7QUFQekMsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBQzFFLFNBQWlCLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQVN6RSxTQUFLLFVBQVUsS0FBSyxlQUFlLHdCQUF3QixNQUFNLEtBQUssaUJBQWlCLENBQUMsQ0FBQztBQUN6RixTQUFLLGlCQUFpQjtBQUFBLEVBQ3ZCO0FBQUEsRUFFUSxtQkFBbUI7QUFDMUIsU0FBSyxtQkFBbUIsTUFBTTtBQUU5QixVQUFNLGVBQWUsZ0NBQWdDLEtBQUssZUFBZSxnQkFBZ0I7QUFDekYsUUFBSSxDQUFDLGNBQWM7QUFFbEIsV0FBSyxtQkFBbUIsTUFBTTtBQUM5QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGVBQWUsTUFBTTtBQUMxQixVQUFJLGFBQWEsZ0JBQWdCLGtCQUFrQixFQUFFLGVBQWU7QUFFbkUsYUFBSyxtQkFBbUIsTUFBTTtBQUM5QjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFdBQVcsYUFBYTtBQUM5QixVQUFJLFVBQVU7QUFDYixhQUFLLGtCQUFrQixRQUFRO0FBQUEsTUFDaEMsT0FBTztBQUNOLGFBQUssbUJBQW1CLE1BQU07QUFBQSxNQUMvQjtBQUFBLElBQ0Q7QUFFQSxTQUFLLG1CQUFtQixJQUFJLEtBQUssdUJBQXVCLGVBQWUsWUFBWSxDQUFDO0FBQ3BGLFNBQUssbUJBQW1CLElBQUksS0FBSyx1QkFBdUIsNkJBQTZCLFlBQVksQ0FBQztBQUNsRyxTQUFLLG1CQUFtQixJQUFJLEtBQUssdUJBQXVCLDRCQUE0QixZQUFZLENBQUM7QUFDakcsU0FBSyxtQkFBbUIsSUFBSSxhQUFhLGlCQUFpQixZQUFZLENBQUM7QUFDdkUsU0FBSyxtQkFBbUIsSUFBSSxhQUFhLGdCQUFnQixtQkFBbUIsWUFBWSxDQUFDO0FBQ3pGLGlCQUFhO0FBQUEsRUFDZDtBQUFBLEVBRVEsa0JBQWtCLFVBQTZCO0FBRXRELFNBQUssbUJBQW1CLE1BQU07QUFFOUIsVUFBTSxFQUFFLFVBQVUsYUFBYSxJQUFJLElBQUksS0FBSyx1QkFBdUIsa0JBQWtCLFFBQVE7QUFDN0YsVUFBTSxhQUFhLFlBQVksV0FBVyxJQUFJLFlBQVksQ0FBQyxJQUFJLFdBQzFELElBQUksV0FBVyxJQUFLLElBQUksQ0FBQyxJQUFJO0FBQ2xDLFFBQUksY0FBYztBQUVsQixRQUFJLElBQUksV0FBVyxHQUFHO0FBRXJCO0FBQUEsSUFFRCxXQUFXLFlBQVksV0FBVztBQUVqQyxVQUFJLFNBQVM7QUFFYixVQUFJLENBQUMsUUFBUTtBQUdaLGlCQUFTO0FBQ1Qsc0JBQWM7QUFDZCxhQUFLLG1CQUFtQixJQUFJLEtBQUssc0JBQXNCLGVBQWUsdUJBQXVCLFVBQVUsTUFBTSxDQUFDO0FBQUEsTUFDL0c7QUFDQSxZQUFNLFVBQVUsT0FBTyxlQUFlLE9BQU8sVUFBVSxPQUFPO0FBQzlELFdBQUssbUJBQW1CLElBQUksS0FBSyxrQkFBa0I7QUFBQSxRQUNsRDtBQUFBLFVBQ0MsTUFBTSxJQUFJLFNBQVMsaUJBQWlCLHNCQUFzQjtBQUFBLFVBQzFELE1BQU0sNkJBQTZCLE9BQU8sS0FBSztBQUFBLFVBQy9DLFdBQVcsT0FBTztBQUFBLFVBQ2xCLFNBQVMsY0FBYyxJQUFJLFNBQVMsV0FBVyxvQkFBb0IsT0FBTyxJQUFJO0FBQUEsVUFDOUUsU0FBUztBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsUUFDQSxtQkFBbUI7QUFBQSxRQUNuQjtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUssbUJBQW1CLElBQUksT0FBTyxZQUFZLE1BQU0sS0FBSyxrQkFBa0IsUUFBUSxDQUFDLENBQUM7QUFBQSxJQUd2RixPQUFPO0FBRU4sV0FBSyxtQkFBbUIsSUFBSSxLQUFLLGtCQUFrQjtBQUFBLFFBQ2xEO0FBQUEsVUFDQyxNQUFNLElBQUksU0FBUyxtQkFBbUIsMkJBQTJCO0FBQUEsVUFDakUsTUFBTSxJQUFJLFNBQVMsdUJBQXVCLGVBQWU7QUFBQSxVQUN6RCxXQUFXLElBQUksU0FBUyx1QkFBdUIsZUFBZTtBQUFBLFVBQzlELFNBQVM7QUFBQSxVQUNULE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQTtBQUFBLFFBQ0EsbUJBQW1CO0FBQUEsUUFDbkI7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUNEO0FBMUdNLGVBQU47QUFBQSxFQU1HO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FURztBQTRHTixJQUFNLG1CQUFOLGNBQStCLFdBQTZDO0FBQUEsRUFLM0UsWUFDa0MsZ0JBQ0csbUJBQ25DO0FBQ0QsVUFBTTtBQUgyQjtBQUNHO0FBTHJDLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQUN4RSxTQUFpQixZQUFZLEtBQUssVUFBVSxJQUFJLGtCQUEyQyxDQUFDO0FBTzNGLFNBQUssVUFBVSxLQUFLLGVBQWUsd0JBQXdCLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQztBQUNoRixTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFFUSxVQUFVO0FBQ2pCLFNBQUssaUJBQWlCLE1BQU07QUFDNUIsVUFBTSxlQUFlLGdDQUFnQyxLQUFLLGVBQWUsZ0JBQWdCO0FBQ3pGLFFBQUksY0FBYztBQUNqQixXQUFLLGlCQUFpQixJQUFJLGFBQWEscUJBQXFCLE1BQU0sS0FBSyxNQUFNLFlBQVksQ0FBQyxDQUFDO0FBQzNGLFdBQUssaUJBQWlCLElBQUksYUFBYSxzQkFBc0IsTUFBTSxLQUFLLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDNUYsV0FBSyxNQUFNLFlBQVk7QUFBQSxJQUN4QixPQUFPO0FBQ04sV0FBSyxVQUFVLE1BQU07QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLE1BQU0sUUFBeUI7QUFDdEMsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCLFdBQUssVUFBVSxNQUFNO0FBQ3JCO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBVSxLQUFLLG1CQUFtQixNQUFNO0FBQzlDLFFBQUksQ0FBQyxTQUFTO0FBQ2IsV0FBSyxVQUFVLE1BQU07QUFDckI7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUF5QjtBQUFBLE1BQzlCLE1BQU0sSUFBSSxTQUFTLGlDQUFpQyw0QkFBNEI7QUFBQSxNQUNoRixNQUFNO0FBQUEsTUFDTixXQUFXO0FBQUEsTUFDWCxTQUFTO0FBQUEsSUFDVjtBQUNBLFFBQUksQ0FBQyxLQUFLLFVBQVUsT0FBTztBQUMxQixXQUFLLFVBQVUsUUFBUSxLQUFLLGtCQUFrQjtBQUFBLFFBQzdDO0FBQUEsUUFDQTtBQUFBLFFBQ0EsbUJBQW1CO0FBQUEsUUFDbkI7QUFBQSxNQUNEO0FBQUEsSUFDRCxPQUFPO0FBQ04sV0FBSyxVQUFVLE1BQU0sT0FBTyxLQUFLO0FBQUEsSUFDbEM7QUFBQSxFQUNEO0FBQUEsRUFFUSxtQkFBbUIsUUFBNkM7QUFDdkUsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxhQUFhLE9BQU8sY0FBYztBQUN4QyxRQUFJLENBQUMsWUFBWTtBQUNoQixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sYUFBYSxPQUFPLGFBQWEsVUFBVSxJQUFJO0FBQ3JELFVBQU0sY0FBYyxPQUFPLGNBQWMsRUFBRSxPQUFPLENBQUMsTUFBTSxVQUFVLFFBQVEsTUFBTSxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ3RHLFVBQU0sYUFBYSxPQUFPLFVBQVU7QUFDcEMsV0FBTyxjQUFjLElBQ3BCLElBQUksU0FBUyxxQ0FBcUMsMkJBQTJCLFlBQVksV0FBVyxJQUNwRyxJQUFJLFNBQVMsc0NBQXNDLG1CQUFtQixZQUFZLFVBQVU7QUFBQSxFQUM5RjtBQUNEO0FBekVNLG1CQUFOO0FBQUEsRUFNRztBQUFBLEVBQ0E7QUFBQSxHQVBHO0FBMkVOLElBQU0sNEJBQU4sY0FBd0MsV0FBVztBQUFBLEVBT2xELFlBQ2tDLGdCQUNHLG1CQUNJLHVCQUN2QztBQUNELFVBQU07QUFKMkI7QUFDRztBQUNJO0FBUnpDLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQUN4RSxTQUFpQixZQUFZLEtBQUssVUFBVSxJQUFJLGtCQUEyQyxDQUFDO0FBVTNGLFNBQUssVUFBVSxLQUFLLGVBQWUsd0JBQXdCLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQztBQUNoRixTQUFLLFVBQVUsS0FBSyxzQkFBc0IseUJBQXlCLE9BQUs7QUFDdkUsVUFBSSxFQUFFLHFCQUFxQixRQUFRLEtBQUssRUFBRSxxQkFBcUIsVUFBVSxHQUFHO0FBQzNFLGFBQUssUUFBUTtBQUFBLE1BQ2Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFBQSxFQUVRLFVBQVU7QUFDakIsU0FBSyxpQkFBaUIsTUFBTTtBQUM1QixVQUFNLGVBQWUsZ0NBQWdDLEtBQUssZUFBZSxnQkFBZ0I7QUFDekYsUUFBSSxjQUFjO0FBQ2pCLFdBQUssTUFBTSxZQUFZO0FBQ3ZCLFdBQUssaUJBQWlCLElBQUksYUFBYSxxQkFBcUIsTUFBTTtBQUNqRSxhQUFLLFVBQVUsTUFBTTtBQUNyQixhQUFLLE1BQU0sWUFBWTtBQUFBLE1BQ3hCLENBQUMsQ0FBQztBQUFBLElBQ0gsT0FBTztBQUNOLFdBQUssVUFBVSxNQUFNO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxNQUFNLFFBQXlCO0FBQ3RDLFFBQUksQ0FBQyxPQUFPLFNBQVMsR0FBRztBQUN2QixXQUFLLFVBQVUsTUFBTTtBQUNyQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGNBQWMsT0FBTyxjQUFjLEdBQUcsV0FBVyxXQUFXO0FBQ2xFLFFBQUksQ0FBQyxhQUFhO0FBQ2pCLFdBQUssVUFBVSxNQUFNO0FBQ3JCO0FBQUEsSUFDRDtBQUVBLFVBQU0seUJBQXlCLE9BQU8sZ0JBQWdCLGtCQUFrQixFQUFFO0FBQzFFLFVBQU0sYUFBYSx5QkFBeUIsbUJBQW1CLEtBQUssYUFBYTtBQUNqRixVQUFNLGVBQWUseUJBQXlCLHFCQUFxQixLQUFLLGFBQWE7QUFDckYsVUFBTSxVQUFVLHlCQUF5QixnQkFBZ0IsS0FBSyxhQUFhO0FBRTNFLFVBQU0sUUFBUSxPQUFPLGVBQWUsV0FBVyxhQUFhO0FBRTVELFVBQU0sVUFBVSxlQUFlLFdBQVcsS0FBSyxLQUFLLGFBQWEsS0FBSztBQUN0RSxVQUFNLFVBQVU7QUFDaEIsUUFBSSxDQUFDLFNBQVM7QUFDYixXQUFLLFVBQVUsTUFBTTtBQUNyQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQXlCO0FBQUEsTUFDOUIsTUFBTSxJQUFJLFNBQVMsd0JBQXdCLHNCQUFzQjtBQUFBLE1BQ2pFLE1BQU07QUFBQSxNQUNOLFdBQVc7QUFBQSxNQUNYLFNBQVMsSUFBSSxTQUFTLDZCQUE2QixvQkFBb0I7QUFBQSxNQUN2RSxTQUFTO0FBQUEsSUFDVjtBQUVBLFFBQUksQ0FBQyxLQUFLLFVBQVUsT0FBTztBQUMxQixXQUFLLFVBQVUsUUFBUSxLQUFLLGtCQUFrQjtBQUFBLFFBQzdDO0FBQUEsUUFDQTtBQUFBLFFBQ0EsbUJBQW1CO0FBQUEsUUFDbkI7QUFBQSxNQUNEO0FBQUEsSUFDRCxPQUFPO0FBQ04sV0FBSyxVQUFVLE1BQU0sT0FBTyxLQUFLO0FBQUEsSUFDbEM7QUFBQSxFQUNEO0FBQ0Q7QUFqRk0sMEJBS1csS0FBSztBQUxoQiw0QkFBTjtBQUFBLEVBUUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVkc7QUFtRk4sSUFBTSxtQ0FBTixjQUErQyxXQUE2QztBQUFBLEVBSTNGLFlBQ3dDLG9CQUN0QztBQUNELFVBQU07QUFGaUM7QUFJdkMsZUFBVyxRQUFRLG1CQUFtQixPQUFPO0FBQzVDLFdBQUsscUJBQXFCLElBQUk7QUFBQSxJQUMvQjtBQUVBLFNBQUssVUFBVSxtQkFBbUIsK0JBQStCLFVBQVEsS0FBSyxxQkFBcUIsSUFBSSxDQUFDLENBQUM7QUFBQSxFQUMxRztBQUFBLEVBRVEscUJBQXFCLE1BQXlCO0FBQ3JELFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxVQUFNLEtBQUssS0FBSyxhQUFhLEVBQUUsTUFBTSxZQUFZLFFBQVEsQ0FBQztBQUUxRCxVQUFNLDZCQUE2QixLQUFLLG1CQUFtQiw4QkFBOEIsSUFBSTtBQUM3RixnQkFBWSxJQUFJLDJCQUEyQixlQUFlLFlBQVksQ0FBQztBQUN2RSxnQkFBWSxJQUFJLDJCQUEyQixlQUFlLGdCQUFnQixDQUFDO0FBQzNFLGdCQUFZLElBQUksMkJBQTJCLGVBQWUseUJBQXlCLENBQUM7QUFBQSxFQUNyRjtBQUNEO0FBekJNLGlDQUVXLEtBQUs7QUFGaEIsbUNBQU47QUFBQSxFQUtHO0FBQUEsR0FMRztBQTJCTiwrQkFBK0IsaUNBQWlDLElBQUksa0NBQWtDLGVBQWUsYUFBYTsiLAogICJuYW1lcyI6IFtdCn0K
