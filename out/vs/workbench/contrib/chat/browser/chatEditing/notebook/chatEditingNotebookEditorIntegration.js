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
import { ActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Disposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, debouncedObservable, observableFromEvent, observableValue } from "../../../../../../base/common/observable.js";
import { basename } from "../../../../../../base/common/resources.js";
import { assertType } from "../../../../../../base/common/types.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { LineRange } from "../../../../../../editor/common/core/ranges/lineRange.js";
import { nullDocumentDiff } from "../../../../../../editor/common/diff/documentDiffProvider.js";
import { PrefixSumComputer } from "../../../../../../editor/common/model/prefixSumComputer.js";
import { localize } from "../../../../../../nls.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { NotebookDeletedCellDecorator } from "../../../../notebook/browser/diff/inlineDiff/notebookDeletedCellDecorator.js";
import { NotebookInsertedCellDecorator } from "../../../../notebook/browser/diff/inlineDiff/notebookInsertedCellDecorator.js";
import { NotebookModifiedCellDecorator } from "../../../../notebook/browser/diff/inlineDiff/notebookModifiedCellDecorator.js";
import { CellEditState, getNotebookEditorFromEditorPane } from "../../../../notebook/browser/notebookBrowser.js";
import { INotebookEditorService } from "../../../../notebook/browser/services/notebookEditorService.js";
import { CellKind } from "../../../../notebook/common/notebookCommon.js";
import { ChatEditingCodeEditorIntegration } from "../chatEditingCodeEditorIntegration.js";
import { countChanges, sortCellChanges } from "./notebookCellChanges.js";
import { OverlayToolbarDecorator } from "./overlayToolbarDecorator.js";
let ChatEditingNotebookEditorIntegration = class extends Disposable {
  constructor(_entry, editor, notebookModel, originalModel, cellChanges, instantiationService) {
    super();
    this.instantiationService = instantiationService;
    const notebookEditor = getNotebookEditorFromEditorPane(editor);
    assertType(notebookEditor);
    this.notebookEditor = notebookEditor;
    this.integration = this.instantiationService.createInstance(ChatEditingNotebookEditorWidgetIntegration, _entry, notebookEditor, notebookModel, originalModel, cellChanges);
    this._register(editor.onDidChangeControl(() => {
      const notebookEditor2 = getNotebookEditorFromEditorPane(editor);
      if (notebookEditor2 && notebookEditor2 !== this.notebookEditor) {
        this.notebookEditor = notebookEditor2;
        this.integration.dispose();
        this.integration = this.instantiationService.createInstance(ChatEditingNotebookEditorWidgetIntegration, _entry, notebookEditor2, notebookModel, originalModel, cellChanges);
      }
    }));
  }
  get currentIndex() {
    return this.integration.currentIndex;
  }
  reveal(firstOrLast) {
    return this.integration.reveal(firstOrLast);
  }
  next(wrap) {
    return this.integration.next(wrap);
  }
  previous(wrap) {
    return this.integration.previous(wrap);
  }
  enableAccessibleDiffView() {
    this.integration.enableAccessibleDiffView();
  }
  acceptNearestChange(change) {
    return this.integration.acceptNearestChange(change);
  }
  rejectNearestChange(change) {
    return this.integration.rejectNearestChange(change);
  }
  toggleDiff(change, show) {
    return this.integration.toggleDiff(change, show);
  }
  dispose() {
    this.integration.dispose();
    super.dispose();
  }
};
ChatEditingNotebookEditorIntegration = __decorateClass([
  __decorateParam(5, IInstantiationService)
], ChatEditingNotebookEditorIntegration);
let ChatEditingNotebookEditorWidgetIntegration = class extends Disposable {
  constructor(_entry, notebookEditor, notebookModel, originalModel, cellChanges, instantiationService, _editorService, notebookEditorService, accessibilitySignalService, logService) {
    super();
    this._entry = _entry;
    this.notebookEditor = notebookEditor;
    this.notebookModel = notebookModel;
    this.cellChanges = cellChanges;
    this.instantiationService = instantiationService;
    this._editorService = _editorService;
    this.accessibilitySignalService = accessibilitySignalService;
    this.logService = logService;
    this._currentIndex = observableValue(this, -1);
    this.currentIndex = this._currentIndex;
    this.cellEditorIntegrations = /* @__PURE__ */ new Map();
    this.markdownEditState = observableValue(this, "");
    this.markupCellListeners = /* @__PURE__ */ new Map();
    this.sortedCellChanges = [];
    this.changeIndexComputer = new PrefixSumComputer(new Uint32Array(0));
    const onDidChangeVisibleRanges = debouncedObservable(observableFromEvent(notebookEditor.onDidChangeVisibleRanges, () => notebookEditor.visibleRanges), 50);
    this._register(toDisposable(() => {
      this.markupCellListeners.forEach((v) => v.dispose());
    }));
    let originalReadonly = void 0;
    const shouldBeReadonly = _entry.isCurrentlyBeingModifiedBy.map((value) => !!value);
    this._register(autorun((r) => {
      const isReadOnly = shouldBeReadonly.read(r);
      const notebookEditor2 = notebookEditorService.retrieveExistingWidgetFromURI(_entry.modifiedURI)?.value;
      if (!notebookEditor2) {
        return;
      }
      if (isReadOnly) {
        originalReadonly ??= notebookEditor2.isReadOnly;
        notebookEditor2.setOptions({ isReadOnly: true });
      } else if (originalReadonly === false) {
        notebookEditor2.setOptions({ isReadOnly: false });
        const timeout = setTimeout(() => {
          notebookEditor2.setOptions({ isReadOnly: true });
          notebookEditor2.setOptions({ isReadOnly: false });
          disposable.dispose();
        }, 100);
        const disposable = toDisposable(() => clearTimeout(timeout));
        r.store.add(disposable);
      }
    }));
    let lastModifyingRequestId;
    this._store.add(autorun((r) => {
      if (!_entry.isCurrentlyBeingModifiedBy.read(r) && !_entry.isProcessingResponse.read(r) && lastModifyingRequestId !== _entry.lastModifyingRequestId && cellChanges.read(r).some((c) => c.type !== "unchanged" && !c.diff.read(r).identical)) {
        lastModifyingRequestId = _entry.lastModifyingRequestId;
        const visibleChange = this.sortedCellChanges.find((c) => {
          if (c.type === "unchanged") {
            return false;
          }
          const index = c.modifiedCellIndex ?? c.originalCellIndex;
          return this.notebookEditor.visibleRanges.some((range) => index >= range.start && index < range.end);
        });
        if (!visibleChange) {
          this.reveal(true);
        }
      }
    }));
    this._register(autorun((r) => {
      this.sortedCellChanges = sortCellChanges(cellChanges.read(r));
      const indexes = [];
      for (const change of this.sortedCellChanges) {
        indexes.push(change.type === "insert" || change.type === "delete" ? 1 : change.type === "modified" ? change.diff.read(r).changes.length : 0);
      }
      this.changeIndexComputer = new PrefixSumComputer(new Uint32Array(indexes));
      if (this.changeIndexComputer.getTotalSum() === 0) {
        this.revertMarkupCellState();
      }
    }));
    this._register(autorun((r) => {
      if (this.notebookEditor.textModel !== this.notebookModel) {
        return;
      }
      const sortedCellChanges = sortCellChanges(cellChanges.read(r));
      const changes = sortedCellChanges.filter((c) => c.type !== "delete");
      onDidChangeVisibleRanges.read(r);
      if (!changes.length) {
        this.cellEditorIntegrations.forEach(({ diff }) => {
          diff.set({ ...diff.read(void 0), ...nullDocumentDiff }, void 0);
        });
        return;
      }
      this.markdownEditState.read(r);
      const validCells = /* @__PURE__ */ new Set();
      changes.forEach((change) => {
        if (change.modifiedCellIndex === void 0 || change.modifiedCellIndex >= notebookModel.cells.length) {
          return;
        }
        const cell = notebookModel.cells[change.modifiedCellIndex];
        const editor = notebookEditor.codeEditors.find(([vm]) => vm.handle === notebookModel.cells[change.modifiedCellIndex].handle)?.[1];
        const modifiedModel = change.modifiedModel.promiseResult.read(r)?.data;
        const originalModel2 = change.originalModel.promiseResult.read(r)?.data;
        if (!cell || !originalModel2 || !modifiedModel) {
          return;
        }
        if (cell.cellKind === CellKind.Markup && !this.markupCellListeners.has(cell.handle)) {
          const cellModel = this.notebookEditor.getViewModel()?.viewCells.find((c) => c.handle === cell.handle);
          if (cellModel) {
            const listener = cellModel.onDidChangeState((e) => {
              if (e.editStateChanged) {
                setTimeout(() => this.markdownEditState.set(cellModel.handle + "-" + cellModel.getEditState(), void 0), 0);
              }
            });
            this.markupCellListeners.set(cell.handle, listener);
          }
        }
        if (!editor) {
          return;
        }
        const diff = {
          ...change.diff.read(r),
          modifiedModel,
          originalModel: originalModel2,
          keep: change.keep,
          undo: change.undo
        };
        validCells.add(cell);
        const currentDiff = this.cellEditorIntegrations.get(cell);
        if (currentDiff) {
          if (!areDocumentDiff2Equal(currentDiff.diff.read(void 0), diff)) {
            currentDiff.diff.set(diff, void 0);
          }
        } else {
          const diff2 = observableValue(`diff${cell.handle}`, diff);
          const integration = this.instantiationService.createInstance(ChatEditingCodeEditorIntegration, _entry, editor, diff2, true);
          this.cellEditorIntegrations.set(cell, { integration, diff: diff2 });
          this._register(integration);
          this._register(editor.onDidDispose(() => {
            this.cellEditorIntegrations.get(cell)?.integration.dispose();
            this.cellEditorIntegrations.delete(cell);
          }));
          this._register(editor.onDidChangeModel(() => {
            if (editor.getModel() !== cell.textModel) {
              this.cellEditorIntegrations.get(cell)?.integration.dispose();
              this.cellEditorIntegrations.delete(cell);
            }
          }));
        }
      });
      this.cellEditorIntegrations.forEach((v, cell) => {
        if (!validCells.has(cell)) {
          v.integration.dispose();
          this.cellEditorIntegrations.delete(cell);
        }
      });
    }));
    const cellsAreVisible = onDidChangeVisibleRanges.map((v) => v.length > 0);
    const debouncedChanges = debouncedObservable(cellChanges, 10);
    this._register(autorun((r) => {
      if (this.notebookEditor.textModel !== this.notebookModel || !cellsAreVisible.read(r) || !this.notebookEditor.getViewModel()) {
        return;
      }
      const changes = debouncedChanges.read(r).filter((c) => c.type === "insert" ? !c.diff.read(r).identical : true);
      const modifiedChanges = changes.filter((c) => c.type === "modified");
      this.createDecorators();
      if (changes.every((c) => c.type === "insert")) {
        this.insertedCellDecorator?.apply([]);
        this.modifiedCellDecorator?.apply([]);
        this.deletedCellDecorator?.apply([], originalModel);
        this.overlayToolbarDecorator?.decorate([]);
      } else {
        this.insertedCellDecorator?.apply(changes);
        this.modifiedCellDecorator?.apply(modifiedChanges);
        this.deletedCellDecorator?.apply(changes, originalModel);
        this.overlayToolbarDecorator?.decorate(changes.filter((c) => c.type === "insert" || c.type === "modified"));
      }
    }));
  }
  getCurrentChange() {
    const currentIndex = Math.min(this._currentIndex.get(), this.changeIndexComputer.getTotalSum() - 1);
    const index = this.changeIndexComputer.getIndexOf(currentIndex);
    const change = this.sortedCellChanges[index.index];
    return change ? { change, index: index.remainder } : void 0;
  }
  updateCurrentIndex(change, indexInCell = 0) {
    const index = this.sortedCellChanges.indexOf(change);
    const changeIndex = this.changeIndexComputer.getPrefixSum(index - 1);
    const currentIndex = Math.min(changeIndex + indexInCell, this.changeIndexComputer.getTotalSum() - 1);
    this._currentIndex.set(currentIndex, void 0);
  }
  createDecorators() {
    const cellChanges = this.cellChanges.get();
    const accessibilitySignalService = this.accessibilitySignalService;
    this.insertedCellDecorator ??= this._register(this.instantiationService.createInstance(NotebookInsertedCellDecorator, this.notebookEditor));
    this.modifiedCellDecorator ??= this._register(this.instantiationService.createInstance(NotebookModifiedCellDecorator, this.notebookEditor));
    this.overlayToolbarDecorator ??= this._register(this.instantiationService.createInstance(OverlayToolbarDecorator, this.notebookEditor, this.notebookModel));
    if (this.deletedCellDecorator) {
      this._store.delete(this.deletedCellDecorator);
      this.deletedCellDecorator.dispose();
    }
    this.deletedCellDecorator = this._register(this.instantiationService.createInstance(NotebookDeletedCellDecorator, this.notebookEditor, {
      className: "chat-diff-change-content-widget",
      telemetrySource: "chatEditingNotebookHunk",
      menuId: MenuId.ChatEditingEditorHunk,
      actionViewItemProvider: (action, options) => {
        if (!action.class) {
          return new class extends ActionViewItem {
            constructor() {
              super(void 0, action, { ...options, keybindingNotRenderedWithLabel: true, icon: false, label: true });
            }
          }();
        }
        return void 0;
      },
      argFactory: (deletedCellIndex) => {
        return {
          accept() {
            const entry = cellChanges.find((c) => c.type === "delete" && c.originalCellIndex === deletedCellIndex);
            if (entry) {
              return entry.keep(entry.diff.get().changes[0]);
            }
            accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
            return Promise.resolve(true);
          },
          reject() {
            const entry = cellChanges.find((c) => c.type === "delete" && c.originalCellIndex === deletedCellIndex);
            if (entry) {
              return entry.undo(entry.diff.get().changes[0]);
            }
            accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
            return Promise.resolve(true);
          }
        };
      }
    }));
  }
  getCell(modifiedCellIndex) {
    const cell = this.notebookModel.cells[modifiedCellIndex];
    const integration = this.cellEditorIntegrations.get(cell)?.integration;
    return integration;
  }
  reveal(firstOrLast) {
    const changes = this.sortedCellChanges.filter((c) => c.type !== "unchanged");
    if (!changes.length) {
      return;
    }
    const change = firstOrLast ? changes[0] : changes[changes.length - 1];
    this._revealFirstOrLast(change, firstOrLast);
  }
  _revealFirstOrLast(change, firstOrLast = true) {
    switch (change.type) {
      case "insert":
      case "modified": {
        this.blur(this.getCurrentChange()?.change);
        const index = firstOrLast || change.type === "insert" ? 0 : change.diff.get().changes.length - 1;
        return this._revealChange(change, index);
      }
      case "delete":
        this.blur(this.getCurrentChange()?.change);
        this.deletedCellDecorator?.reveal(change.originalCellIndex);
        this.updateCurrentIndex(change);
        return true;
      default:
        break;
    }
    return false;
  }
  _revealChange(change, indexInCell) {
    switch (change.type) {
      case "insert":
      case "modified": {
        const textChange = change.diff.get().changes[indexInCell];
        const cellViewModel = this.getCellViewModel(change);
        if (cellViewModel) {
          this.updateCurrentIndex(change, indexInCell);
          this.revealChangeInView(cellViewModel, textChange?.modified, change).catch((err) => {
            this.logService.warn(`Error revealing change in view: ${err}`);
          });
          return true;
        }
        break;
      }
      case "delete":
        this.updateCurrentIndex(change);
        this.deletedCellDecorator?.reveal(change.originalCellIndex);
        return true;
      default:
        break;
    }
    return false;
  }
  getCellViewModel(change) {
    if (change.type === "delete" || change.modifiedCellIndex === void 0 || change.modifiedCellIndex >= this.notebookModel.cells.length) {
      return void 0;
    }
    const cell = this.notebookModel.cells[change.modifiedCellIndex];
    const cellViewModel = this.notebookEditor.getViewModel()?.viewCells.find((c) => c.handle === cell.handle);
    return cellViewModel;
  }
  async revealChangeInView(cell, lines, change) {
    const targetLines = lines ?? new LineRange(0, 0);
    if (change.type === "modified" && cell.cellKind === CellKind.Markup && cell.getEditState() === CellEditState.Preview) {
      cell.updateEditState(CellEditState.Editing, "chatEditNavigation");
    }
    const focusTarget = cell.cellKind === CellKind.Code || change.type === "modified" ? "editor" : "container";
    await this.notebookEditor.focusNotebookCell(cell, focusTarget, { focusEditorLine: targetLines.startLineNumber });
    await this.notebookEditor.revealRangeInCenterAsync(cell, new Range(targetLines.startLineNumber, 0, targetLines.endLineNumberExclusive, 0));
  }
  revertMarkupCellState() {
    for (const change of this.sortedCellChanges) {
      const cellViewModel = this.getCellViewModel(change);
      if (cellViewModel?.cellKind === CellKind.Markup && cellViewModel.getEditState() === CellEditState.Editing && (cellViewModel.editStateSource === "chatEditNavigation" || cellViewModel.editStateSource === "chatEdit")) {
        cellViewModel.updateEditState(CellEditState.Preview, "chatEdit");
      }
    }
  }
  blur(change) {
    if (!change) {
      return;
    }
    const cellViewModel = this.getCellViewModel(change);
    if (cellViewModel?.cellKind === CellKind.Markup && cellViewModel.getEditState() === CellEditState.Editing && cellViewModel.editStateSource === "chatEditNavigation") {
      cellViewModel.updateEditState(CellEditState.Preview, "chatEditNavigation");
    }
  }
  next(wrap) {
    const changes = this.sortedCellChanges.filter((c) => c.type !== "unchanged");
    const currentChange = this.getCurrentChange();
    if (!currentChange) {
      const firstChange = changes[0];
      if (firstChange) {
        return this._revealFirstOrLast(firstChange);
      }
      return false;
    }
    switch (currentChange.change.type) {
      case "modified":
        {
          const cellIntegration = this.getCell(currentChange.change.modifiedCellIndex);
          if (cellIntegration) {
            if (cellIntegration.next(false)) {
              this.updateCurrentIndex(currentChange.change, cellIntegration.currentIndex.get());
              return true;
            }
          }
          const isLastChangeInCell = currentChange.index >= lastChangeIndex(currentChange.change);
          const index = isLastChangeInCell ? 0 : currentChange.index + 1;
          const change = isLastChangeInCell ? changes[changes.indexOf(currentChange.change) + 1] : currentChange.change;
          if (change) {
            if (isLastChangeInCell) {
              this.blur(currentChange.change);
            }
            if (this._revealChange(change, index)) {
              return true;
            }
          }
        }
        break;
      case "insert":
      case "delete":
        {
          this.blur(currentChange.change);
          const nextChange = changes[changes.indexOf(currentChange.change) + 1];
          if (nextChange && this._revealFirstOrLast(nextChange, true)) {
            return true;
          }
        }
        break;
      default:
        break;
    }
    if (wrap) {
      const firstChange = changes[0];
      if (firstChange) {
        return this._revealFirstOrLast(firstChange, true);
      }
    }
    return false;
  }
  previous(wrap) {
    const changes = this.sortedCellChanges.filter((c) => c.type !== "unchanged");
    const currentChange = this.getCurrentChange();
    if (!currentChange) {
      const lastChange = changes[changes.length - 1];
      if (lastChange) {
        return this._revealFirstOrLast(lastChange, false);
      }
      return false;
    }
    switch (currentChange.change.type) {
      case "modified":
        {
          const cellIntegration = this.getCell(currentChange.change.modifiedCellIndex);
          if (cellIntegration) {
            if (cellIntegration.previous(false)) {
              this.updateCurrentIndex(currentChange.change, cellIntegration.currentIndex.get());
              return true;
            }
          }
          const isFirstChangeInCell = currentChange.index <= 0;
          const change = isFirstChangeInCell ? changes[changes.indexOf(currentChange.change) - 1] : currentChange.change;
          if (change) {
            const index = isFirstChangeInCell ? lastChangeIndex(change) : currentChange.index - 1;
            if (isFirstChangeInCell) {
              this.blur(currentChange.change);
            }
            if (this._revealChange(change, index)) {
              return true;
            }
          }
        }
        break;
      case "insert":
      case "delete":
        {
          this.blur(currentChange.change);
          const prevChange = changes[changes.indexOf(currentChange.change) - 1];
          if (prevChange && this._revealFirstOrLast(prevChange, false)) {
            return true;
          }
        }
        break;
      default:
        break;
    }
    if (wrap) {
      const lastChange = changes[changes.length - 1];
      if (lastChange) {
        return this._revealFirstOrLast(lastChange, false);
      }
    }
    return false;
  }
  enableAccessibleDiffView() {
    const cell = this.notebookEditor.getActiveCell()?.model;
    if (cell) {
      const integration = this.cellEditorIntegrations.get(cell)?.integration;
      integration?.enableAccessibleDiffView();
    }
  }
  getfocusedIntegration() {
    const first = this.notebookEditor.getSelectionViewModels()[0];
    if (first) {
      return this.cellEditorIntegrations.get(first.model)?.integration;
    }
    return void 0;
  }
  async acceptNearestChange(hunk) {
    if (hunk) {
      await hunk.accept();
    } else {
      const current = this.getCurrentChange();
      const focused = this.getfocusedIntegration();
      if (current && !focused || current?.change.type === "delete") {
        current.change.keep(current?.change.diff.get().changes[current.index]);
      } else if (focused) {
        await focused.acceptNearestChange();
      }
      this._currentIndex.set(this._currentIndex.get() - 1, void 0);
      this.next(true);
    }
  }
  async rejectNearestChange(hunk) {
    if (hunk) {
      await hunk.reject();
    } else {
      const current = this.getCurrentChange();
      const focused = this.getfocusedIntegration();
      if (current && !focused || current?.change.type === "delete") {
        current.change.undo(current.change.diff.get().changes[current.index]);
      } else if (focused) {
        await focused.rejectNearestChange();
      }
      this._currentIndex.set(this._currentIndex.get() - 1, void 0);
      this.next(true);
    }
  }
  async toggleDiff(_change, _show) {
    const diffInput = {
      original: { resource: this._entry.originalURI },
      modified: { resource: this._entry.modifiedURI },
      label: localize("diff.generic", "{0} (changes from chat)", basename(this._entry.modifiedURI))
    };
    await this._editorService.openEditor(diffInput);
  }
};
ChatEditingNotebookEditorWidgetIntegration = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, INotebookEditorService),
  __decorateParam(8, IAccessibilitySignalService),
  __decorateParam(9, ILogService)
], ChatEditingNotebookEditorWidgetIntegration);
class ChatEditingNotebookDiffEditorIntegration extends Disposable {
  constructor(notebookDiffEditor, cellChanges) {
    super();
    this.notebookDiffEditor = notebookDiffEditor;
    this.cellChanges = cellChanges;
    this._currentIndex = observableValue(this, -1);
    this.currentIndex = this._currentIndex;
    this._store.add(autorun((r) => {
      const index = notebookDiffEditor.currentChangedIndex.read(r);
      const numberOfCellChanges = cellChanges.read(r).filter((c) => !c.diff.read(r).identical);
      if (numberOfCellChanges.length && index >= 0 && index < numberOfCellChanges.length) {
        const changesSoFar = countChanges(numberOfCellChanges.slice(0, index + 1));
        this._currentIndex.set(changesSoFar - 1, void 0);
      } else {
        this._currentIndex.set(-1, void 0);
      }
    }));
  }
  reveal(firstOrLast) {
    const changes = sortCellChanges(this.cellChanges.get().filter((c) => c.type !== "unchanged"));
    if (!changes.length) {
      return void 0;
    }
    if (firstOrLast) {
      this.notebookDiffEditor.firstChange();
    } else {
      this.notebookDiffEditor.lastChange();
    }
  }
  next(_wrap) {
    const changes = this.cellChanges.get().filter((c) => !c.diff.get().identical).length;
    if (this.notebookDiffEditor.currentChangedIndex.get() === changes - 1) {
      return false;
    }
    this.notebookDiffEditor.nextChange();
    return true;
  }
  previous(_wrap) {
    const changes = this.cellChanges.get().filter((c) => !c.diff.get().identical).length;
    if (this.notebookDiffEditor.currentChangedIndex.get() === changes - 1) {
      return false;
    }
    this.notebookDiffEditor.nextChange();
    return true;
  }
  enableAccessibleDiffView() {
  }
  async acceptNearestChange(change) {
    await change.accept();
    this.next(true);
  }
  async rejectNearestChange(change) {
    await change.reject();
    this.next(true);
  }
  async toggleDiff(_change, _show) {
  }
}
function areDocumentDiff2Equal(diff1, diff2) {
  if (diff1.changes !== diff2.changes) {
    return false;
  }
  if (diff1.identical !== diff2.identical) {
    return false;
  }
  if (diff1.moves !== diff2.moves) {
    return false;
  }
  if (diff1.originalModel !== diff2.originalModel) {
    return false;
  }
  if (diff1.modifiedModel !== diff2.modifiedModel) {
    return false;
  }
  if (diff1.keep !== diff2.keep) {
    return false;
  }
  if (diff1.undo !== diff2.undo) {
    return false;
  }
  if (diff1.quitEarly !== diff2.quitEarly) {
    return false;
  }
  return true;
}
function lastChangeIndex(change) {
  if (change.type === "modified") {
    return change.diff.get().changes.length - 1;
  }
  return 0;
}
export {
  ChatEditingNotebookDiffEditorIntegration,
  ChatEditingNotebookEditorIntegration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9ub3RlYm9vay9jaGF0RWRpdGluZ05vdGVib29rRWRpdG9ySW50ZWdyYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVib3VuY2VkT2JzZXJ2YWJsZSwgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZXMvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IG51bGxEb2N1bWVudERpZmYgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvZG9jdW1lbnREaWZmUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgUHJlZml4U3VtQ29tcHV0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3ByZWZpeFN1bUNvbXB1dGVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZSwgSVJlc291cmNlRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0RlbGV0ZWRDZWxsRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9kaWZmL2lubGluZURpZmYvbm90ZWJvb2tEZWxldGVkQ2VsbERlY29yYXRvci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0luc2VydGVkQ2VsbERlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvZGlmZi9pbmxpbmVEaWZmL25vdGVib29rSW5zZXJ0ZWRDZWxsRGVjb3JhdG9yLmpzJztcbmltcG9ydCB7IE5vdGVib29rTW9kaWZpZWRDZWxsRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9kaWZmL2lubGluZURpZmYvbm90ZWJvb2tNb2RpZmllZENlbGxEZWNvcmF0b3IuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rVGV4dERpZmZFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL2RpZmYvbm90ZWJvb2tEaWZmRWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFN0YXRlLCBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lLCBJQ2VsbFZpZXdNb2RlbCwgSU5vdGVib29rRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvc2VydmljZXMvbm90ZWJvb2tFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9tb2RlbC9ub3RlYm9va0NlbGxUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU1vZGlmaWVkRmlsZUVudHJ5Q2hhbmdlSHVuaywgSU1vZGlmaWVkRmlsZUVudHJ5RWRpdG9ySW50ZWdyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdDb2RlRWRpdG9ySW50ZWdyYXRpb24sIElEb2N1bWVudERpZmYyIH0gZnJvbSAnLi4vY2hhdEVkaXRpbmdDb2RlRWRpdG9ySW50ZWdyYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnkgfSBmcm9tICcuLi9jaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeS5qcyc7XG5pbXBvcnQgeyBjb3VudENoYW5nZXMsIElDZWxsRGlmZkluZm8sIHNvcnRDZWxsQ2hhbmdlcyB9IGZyb20gJy4vbm90ZWJvb2tDZWxsQ2hhbmdlcy5qcyc7XG5pbXBvcnQgeyBPdmVybGF5VG9vbGJhckRlY29yYXRvciB9IGZyb20gJy4vb3ZlcmxheVRvb2xiYXJEZWNvcmF0b3IuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdEVkaXRpbmdOb3RlYm9va0VkaXRvckludGVncmF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNb2RpZmllZEZpbGVFbnRyeUVkaXRvckludGVncmF0aW9uIHtcblx0cHJpdmF0ZSBpbnRlZ3JhdGlvbjogQ2hhdEVkaXRpbmdOb3RlYm9va0VkaXRvcldpZGdldEludGVncmF0aW9uO1xuXHRwcml2YXRlIG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3I7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdF9lbnRyeTogQ2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnksXG5cdFx0ZWRpdG9yOiBJRWRpdG9yUGFuZSxcblx0XHRub3RlYm9va01vZGVsOiBOb3RlYm9va1RleHRNb2RlbCxcblx0XHRvcmlnaW5hbE1vZGVsOiBOb3RlYm9va1RleHRNb2RlbCxcblx0XHRjZWxsQ2hhbmdlczogSU9ic2VydmFibGU8SUNlbGxEaWZmSW5mb1tdPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShlZGl0b3IpO1xuXHRcdGFzc2VydFR5cGUobm90ZWJvb2tFZGl0b3IpO1xuXHRcdHRoaXMubm90ZWJvb2tFZGl0b3IgPSBub3RlYm9va0VkaXRvcjtcblx0XHR0aGlzLmludGVncmF0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RWRpdGluZ05vdGVib29rRWRpdG9yV2lkZ2V0SW50ZWdyYXRpb24sIF9lbnRyeSwgbm90ZWJvb2tFZGl0b3IsIG5vdGVib29rTW9kZWwsIG9yaWdpbmFsTW9kZWwsIGNlbGxDaGFuZ2VzKTtcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VDb250cm9sKCgpID0+IHtcblx0XHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShlZGl0b3IpO1xuXHRcdFx0aWYgKG5vdGVib29rRWRpdG9yICYmIG5vdGVib29rRWRpdG9yICE9PSB0aGlzLm5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IgPSBub3RlYm9va0VkaXRvcjtcblx0XHRcdFx0dGhpcy5pbnRlZ3JhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuaW50ZWdyYXRpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFZGl0aW5nTm90ZWJvb2tFZGl0b3JXaWRnZXRJbnRlZ3JhdGlvbiwgX2VudHJ5LCBub3RlYm9va0VkaXRvciwgbm90ZWJvb2tNb2RlbCwgb3JpZ2luYWxNb2RlbCwgY2VsbENoYW5nZXMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXHRwdWJsaWMgZ2V0IGN1cnJlbnRJbmRleCgpOiBJT2JzZXJ2YWJsZTxudW1iZXI+IHtcblx0XHRyZXR1cm4gdGhpcy5pbnRlZ3JhdGlvbi5jdXJyZW50SW5kZXg7XG5cdH1cblx0cmV2ZWFsKGZpcnN0T3JMYXN0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0cmV0dXJuIHRoaXMuaW50ZWdyYXRpb24ucmV2ZWFsKGZpcnN0T3JMYXN0KTtcblx0fVxuXHRuZXh0KHdyYXA6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbnRlZ3JhdGlvbi5uZXh0KHdyYXApO1xuXHR9XG5cdHByZXZpb3VzKHdyYXA6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbnRlZ3JhdGlvbi5wcmV2aW91cyh3cmFwKTtcblx0fVxuXHRlbmFibGVBY2Nlc3NpYmxlRGlmZlZpZXcoKTogdm9pZCB7XG5cdFx0dGhpcy5pbnRlZ3JhdGlvbi5lbmFibGVBY2Nlc3NpYmxlRGlmZlZpZXcoKTtcblx0fVxuXHRhY2NlcHROZWFyZXN0Q2hhbmdlKGNoYW5nZTogSU1vZGlmaWVkRmlsZUVudHJ5Q2hhbmdlSHVuayB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmludGVncmF0aW9uLmFjY2VwdE5lYXJlc3RDaGFuZ2UoY2hhbmdlKTtcblx0fVxuXHRyZWplY3ROZWFyZXN0Q2hhbmdlKGNoYW5nZTogSU1vZGlmaWVkRmlsZUVudHJ5Q2hhbmdlSHVuayB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmludGVncmF0aW9uLnJlamVjdE5lYXJlc3RDaGFuZ2UoY2hhbmdlKTtcblx0fVxuXHR0b2dnbGVEaWZmKGNoYW5nZTogSU1vZGlmaWVkRmlsZUVudHJ5Q2hhbmdlSHVuayB8IHVuZGVmaW5lZCwgc2hvdz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5pbnRlZ3JhdGlvbi50b2dnbGVEaWZmKGNoYW5nZSwgc2hvdyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmludGVncmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgQ2hhdEVkaXRpbmdOb3RlYm9va0VkaXRvcldpZGdldEludGVncmF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNb2RpZmllZEZpbGVFbnRyeUVkaXRvckludGVncmF0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudEluZGV4ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIC0xKTtcblx0cmVhZG9ubHkgY3VycmVudEluZGV4OiBJT2JzZXJ2YWJsZTxudW1iZXI+ID0gdGhpcy5fY3VycmVudEluZGV4O1xuXG5cdHByaXZhdGUgZGVsZXRlZENlbGxEZWNvcmF0b3I6IE5vdGVib29rRGVsZXRlZENlbGxEZWNvcmF0b3IgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaW5zZXJ0ZWRDZWxsRGVjb3JhdG9yOiBOb3RlYm9va0luc2VydGVkQ2VsbERlY29yYXRvciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtb2RpZmllZENlbGxEZWNvcmF0b3I6IE5vdGVib29rTW9kaWZpZWRDZWxsRGVjb3JhdG9yIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG92ZXJsYXlUb29sYmFyRGVjb3JhdG9yOiBPdmVybGF5VG9vbGJhckRlY29yYXRvciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNlbGxFZGl0b3JJbnRlZ3JhdGlvbnMgPSBuZXcgTWFwPE5vdGVib29rQ2VsbFRleHRNb2RlbCwgeyBpbnRlZ3JhdGlvbjogQ2hhdEVkaXRpbmdDb2RlRWRpdG9ySW50ZWdyYXRpb247IGRpZmY6IElTZXR0YWJsZU9ic2VydmFibGU8SURvY3VtZW50RGlmZjI+IH0+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtYXJrZG93bkVkaXRTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmc+KHRoaXMsICcnKTtcblxuXHRwcml2YXRlIG1hcmt1cENlbGxMaXN0ZW5lcnMgPSBuZXcgTWFwPG51bWJlciwgSURpc3Bvc2FibGU+KCk7XG5cblx0cHJpdmF0ZSBzb3J0ZWRDZWxsQ2hhbmdlczogSUNlbGxEaWZmSW5mb1tdID0gW107XG5cdHByaXZhdGUgY2hhbmdlSW5kZXhDb21wdXRlcjogUHJlZml4U3VtQ29tcHV0ZXIgPSBuZXcgUHJlZml4U3VtQ29tcHV0ZXIobmV3IFVpbnQzMkFycmF5KDApKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lbnRyeTogQ2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0b3JpZ2luYWxNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjZWxsQ2hhbmdlczogSU9ic2VydmFibGU8SUNlbGxEaWZmSW5mb1tdPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0VkaXRvclNlcnZpY2Ugbm90ZWJvb2tFZGl0b3JTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VWaXNpYmxlUmFuZ2VzID0gZGVib3VuY2VkT2JzZXJ2YWJsZShvYnNlcnZhYmxlRnJvbUV2ZW50KG5vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlVmlzaWJsZVJhbmdlcywgKCkgPT4gbm90ZWJvb2tFZGl0b3IudmlzaWJsZVJhbmdlcyksIDUwKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLm1hcmt1cENlbGxMaXN0ZW5lcnMuZm9yRWFjaCgodikgPT4gdi5kaXNwb3NlKCkpO1xuXHRcdH0pKTtcblxuXHRcdGxldCBvcmlnaW5hbFJlYWRvbmx5OiBib29sZWFuIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNob3VsZEJlUmVhZG9ubHkgPSBfZW50cnkuaXNDdXJyZW50bHlCZWluZ01vZGlmaWVkQnkubWFwKHZhbHVlID0+ICEhdmFsdWUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBpc1JlYWRPbmx5ID0gc2hvdWxkQmVSZWFkb25seS5yZWFkKHIpO1xuXHRcdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3IgPSBub3RlYm9va0VkaXRvclNlcnZpY2UucmV0cmlldmVFeGlzdGluZ1dpZGdldEZyb21VUkkoX2VudHJ5Lm1vZGlmaWVkVVJJKT8udmFsdWU7XG5cdFx0XHRpZiAoIW5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChpc1JlYWRPbmx5KSB7XG5cdFx0XHRcdG9yaWdpbmFsUmVhZG9ubHkgPz89IG5vdGVib29rRWRpdG9yLmlzUmVhZE9ubHk7XG5cdFx0XHRcdG5vdGVib29rRWRpdG9yLnNldE9wdGlvbnMoeyBpc1JlYWRPbmx5OiB0cnVlIH0pO1xuXHRcdFx0fSBlbHNlIGlmIChvcmlnaW5hbFJlYWRvbmx5ID09PSBmYWxzZSkge1xuXHRcdFx0XHRub3RlYm9va0VkaXRvci5zZXRPcHRpb25zKHsgaXNSZWFkT25seTogZmFsc2UgfSk7XG5cdFx0XHRcdC8vIEVuc3VyZSBhbGwgY2VsbHMgYXJlYSBlZGl0YWJsZS5cblx0XHRcdFx0Ly8gV2UgbWFrZSB1c2Ugb2YgY2hhdEVkaXRpbmdDb2RlRWRpdG9ySW50ZWdyYXRpb24gdG8gaGFuZGxlIGNlbGwgZGlmZmluZyBhbmQgbmF2aWdhdGlvbi5cblx0XHRcdFx0Ly8gSG93ZXZlciB0aGF0IGFsc28gbWFrZXMgdGhlIGNlbGwgcmVhZC1vbmx5LiBXZSBuZWVkIHRvIGVuc3VyZSB0aGF0IHRoZSBjZWxsIGlzIGVkaXRhYmxlLlxuXHRcdFx0XHQvLyBFLmcuIGZpcnN0IHdlIG1ha2Ugbm90ZWJvb2sgcmVhZG9ubHkgKGluIGhlcmUpLCB0aGVuIGNlbGxzIGVuZCB1cCBiZWluZyByZWFkb25seSBiZWNhdXNlIG5vdGVib29rIGlzIHJlYWRvbmx5LlxuXHRcdFx0XHQvLyBUaGVuIGNoYXRFZGl0aW5nQ29kZUVkaXRvckludGVncmF0aW9uIG1ha2VzIGNlbGxzIHJlYWRvbmx5IGFuZCBrZWVwcyB0cmFjayBvZiB0aGUgb3JpZ2luYWwgcmVhZG9ubHkgc3RhdGUuXG5cdFx0XHRcdC8vIEhvd2V2ZXIgdGhlIGNlbGwgaXMgYWxyZWFkeSByZWFkb25seSBiZWNhdXNlIHRoZSBub3RlYm9vayBpcyByZWFkb25seS5cblx0XHRcdFx0Ly8gU28gd2hlbiB3ZSByZXN0b3JlIHRoZSBub3RlYm9vayB0byBlZGl0YWJsZSAoaW4gaGVyZSksIHRoZSBjZWxsIGlzIG1hZGUgZWRpdGFibGUgYWdhaW4uXG5cdFx0XHRcdC8vIEJ1dCB3aGVuIGNoYXRFZGl0aW5nQ29kZUVkaXRvckludGVncmF0aW9uIGF0dGVtcHRzIHRvIHJlc3RvcmUsIGl0IHdpbGwgcmVzdG9yZSB0aGUgb3JpZ2luYWwgcmVhZG9ubHkgc3RhdGUuXG5cdFx0XHRcdC8vICYgZnJvbSB0aGUgcGVycHNwZWN0aXZlIG9mIGNoYXRFZGl0aW5nQ29kZUVkaXRvckludGVncmF0aW9uLCB0aGUgY2VsbCB3YXMgcmVhZG9ubHkgJiBzaG91bGQgY29udGludWUgdG8gYmUgcmVhZG9ubHkuXG5cdFx0XHRcdC8vIFRvIGdldCBhcm91bmQgdGhpcywgd2Ugd2FpdCBmb3IgYSBmZXcgbXMgYmVmb3JlIHJlc3RvcmluZyB0aGUgb3JpZ2luYWwgcmVhZG9ubHkgc3RhdGUgZm9yIGVhY2ggY2VsbC5cblx0XHRcdFx0Y29uc3QgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdG5vdGVib29rRWRpdG9yLnNldE9wdGlvbnMoeyBpc1JlYWRPbmx5OiB0cnVlIH0pO1xuXHRcdFx0XHRcdG5vdGVib29rRWRpdG9yLnNldE9wdGlvbnMoeyBpc1JlYWRPbmx5OiBmYWxzZSB9KTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0fSwgMTAwKTtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiBjbGVhclRpbWVvdXQodGltZW91dCkpO1xuXHRcdFx0XHRyLnN0b3JlLmFkZChkaXNwb3NhYmxlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBJTklUIHdoZW4gbm90IHN0cmVhbWluZyBub3IgZGlmZmluZyB0aGUgcmVzcG9uc2UgYW55bW9yZSwgb25jZSBwZXIgcmVxdWVzdCwgYW5kIHdoZW4gaGF2aW5nIGNoYW5nZXNcblx0XHRsZXQgbGFzdE1vZGlmeWluZ1JlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXG5cdFx0XHRpZiAoIV9lbnRyeS5pc0N1cnJlbnRseUJlaW5nTW9kaWZpZWRCeS5yZWFkKHIpXG5cdFx0XHRcdCYmICFfZW50cnkuaXNQcm9jZXNzaW5nUmVzcG9uc2UucmVhZChyKVxuXHRcdFx0XHQmJiBsYXN0TW9kaWZ5aW5nUmVxdWVzdElkICE9PSBfZW50cnkubGFzdE1vZGlmeWluZ1JlcXVlc3RJZFxuXHRcdFx0XHQmJiBjZWxsQ2hhbmdlcy5yZWFkKHIpLnNvbWUoYyA9PiBjLnR5cGUgIT09ICd1bmNoYW5nZWQnICYmICFjLmRpZmYucmVhZChyKS5pZGVudGljYWwpXG5cdFx0XHQpIHtcblx0XHRcdFx0bGFzdE1vZGlmeWluZ1JlcXVlc3RJZCA9IF9lbnRyeS5sYXN0TW9kaWZ5aW5nUmVxdWVzdElkO1xuXHRcdFx0XHQvLyBDaGVjayBpZiBhbnkgb2YgdGhlIGNoYW5nZXMgYXJlIHZpc2libGUsIGlmIG5vdCwgcmV2ZWFsIHRoZSBmaXJzdCBjaGFuZ2UuXG5cdFx0XHRcdGNvbnN0IHZpc2libGVDaGFuZ2UgPSB0aGlzLnNvcnRlZENlbGxDaGFuZ2VzLmZpbmQoYyA9PiB7XG5cdFx0XHRcdFx0aWYgKGMudHlwZSA9PT0gJ3VuY2hhbmdlZCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBjLm1vZGlmaWVkQ2VsbEluZGV4ID8/IGMub3JpZ2luYWxDZWxsSW5kZXg7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMubm90ZWJvb2tFZGl0b3IudmlzaWJsZVJhbmdlcy5zb21lKHJhbmdlID0+IGluZGV4ID49IHJhbmdlLnN0YXJ0ICYmIGluZGV4IDwgcmFuZ2UuZW5kKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKCF2aXNpYmxlQ2hhbmdlKSB7XG5cdFx0XHRcdFx0dGhpcy5yZXZlYWwodHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0dGhpcy5zb3J0ZWRDZWxsQ2hhbmdlcyA9IHNvcnRDZWxsQ2hhbmdlcyhjZWxsQ2hhbmdlcy5yZWFkKHIpKTtcblx0XHRcdGNvbnN0IGluZGV4ZXM6IG51bWJlcltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiB0aGlzLnNvcnRlZENlbGxDaGFuZ2VzKSB7XG5cdFx0XHRcdGluZGV4ZXMucHVzaChjaGFuZ2UudHlwZSA9PT0gJ2luc2VydCcgfHwgY2hhbmdlLnR5cGUgPT09ICdkZWxldGUnID8gMVxuXHRcdFx0XHRcdDogY2hhbmdlLnR5cGUgPT09ICdtb2RpZmllZCcgPyBjaGFuZ2UuZGlmZi5yZWFkKHIpLmNoYW5nZXMubGVuZ3RoXG5cdFx0XHRcdFx0XHQ6IDApO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmNoYW5nZUluZGV4Q29tcHV0ZXIgPSBuZXcgUHJlZml4U3VtQ29tcHV0ZXIobmV3IFVpbnQzMkFycmF5KGluZGV4ZXMpKTtcblx0XHRcdGlmICh0aGlzLmNoYW5nZUluZGV4Q29tcHV0ZXIuZ2V0VG90YWxTdW0oKSA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLnJldmVydE1hcmt1cENlbGxTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEJ1aWxkIGNlbGwgaW50ZWdyYXRpb25zIChyZXNwb25zaWJsZSBmb3IgbmF2aWdhdGluZyBjaGFuZ2VzIHdpdGhpbiBhIGNlbGwgYW5kIGRlY29yYXRpbmcgY2VsbCB0ZXh0IGNoYW5nZXMpXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdGlmICh0aGlzLm5vdGVib29rRWRpdG9yLnRleHRNb2RlbCAhPT0gdGhpcy5ub3RlYm9va01vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNvcnRlZENlbGxDaGFuZ2VzID0gc29ydENlbGxDaGFuZ2VzKGNlbGxDaGFuZ2VzLnJlYWQocikpO1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VzID0gc29ydGVkQ2VsbENoYW5nZXMuZmlsdGVyKGMgPT4gYy50eXBlICE9PSAnZGVsZXRlJyk7XG5cdFx0XHRvbkRpZENoYW5nZVZpc2libGVSYW5nZXMucmVhZChyKTtcblx0XHRcdGlmICghY2hhbmdlcy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5jZWxsRWRpdG9ySW50ZWdyYXRpb25zLmZvckVhY2goKHsgZGlmZiB9KSA9PiB7XG5cdFx0XHRcdFx0ZGlmZi5zZXQoeyAuLi5kaWZmLnJlYWQodW5kZWZpbmVkKSwgLi4ubnVsbERvY3VtZW50RGlmZiB9LCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5tYXJrZG93bkVkaXRTdGF0ZS5yZWFkKHIpO1xuXG5cdFx0XHRjb25zdCB2YWxpZENlbGxzID0gbmV3IFNldDxOb3RlYm9va0NlbGxUZXh0TW9kZWw+KCk7XG5cdFx0XHRjaGFuZ2VzLmZvckVhY2goKGNoYW5nZSkgPT4ge1xuXHRcdFx0XHRpZiAoY2hhbmdlLm1vZGlmaWVkQ2VsbEluZGV4ID09PSB1bmRlZmluZWQgfHwgY2hhbmdlLm1vZGlmaWVkQ2VsbEluZGV4ID49IG5vdGVib29rTW9kZWwuY2VsbHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSBub3RlYm9va01vZGVsLmNlbGxzW2NoYW5nZS5tb2RpZmllZENlbGxJbmRleF07XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IG5vdGVib29rRWRpdG9yLmNvZGVFZGl0b3JzLmZpbmQoKFt2bSxdKSA9PiB2bS5oYW5kbGUgPT09IG5vdGVib29rTW9kZWwuY2VsbHNbY2hhbmdlLm1vZGlmaWVkQ2VsbEluZGV4XS5oYW5kbGUpPy5bMV07XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkTW9kZWwgPSBjaGFuZ2UubW9kaWZpZWRNb2RlbC5wcm9taXNlUmVzdWx0LnJlYWQocik/LmRhdGE7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsTW9kZWwgPSBjaGFuZ2Uub3JpZ2luYWxNb2RlbC5wcm9taXNlUmVzdWx0LnJlYWQocik/LmRhdGE7XG5cdFx0XHRcdGlmICghY2VsbCB8fCAhb3JpZ2luYWxNb2RlbCB8fCAhbW9kaWZpZWRNb2RlbCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwICYmICF0aGlzLm1hcmt1cENlbGxMaXN0ZW5lcnMuaGFzKGNlbGwuaGFuZGxlKSkge1xuXHRcdFx0XHRcdGNvbnN0IGNlbGxNb2RlbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Vmlld01vZGVsKCk/LnZpZXdDZWxscy5maW5kKGMgPT4gYy5oYW5kbGUgPT09IGNlbGwuaGFuZGxlKTtcblx0XHRcdFx0XHRpZiAoY2VsbE1vZGVsKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IGNlbGxNb2RlbC5vbkRpZENoYW5nZVN0YXRlKChlKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChlLmVkaXRTdGF0ZUNoYW5nZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMubWFya2Rvd25FZGl0U3RhdGUuc2V0KGNlbGxNb2RlbC5oYW5kbGUgKyAnLScgKyBjZWxsTW9kZWwuZ2V0RWRpdFN0YXRlKCksIHVuZGVmaW5lZCksIDApO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHRoaXMubWFya3VwQ2VsbExpc3RlbmVycy5zZXQoY2VsbC5oYW5kbGUsIGxpc3RlbmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZGlmZiA9IHtcblx0XHRcdFx0XHQuLi5jaGFuZ2UuZGlmZi5yZWFkKHIpLFxuXHRcdFx0XHRcdG1vZGlmaWVkTW9kZWwsXG5cdFx0XHRcdFx0b3JpZ2luYWxNb2RlbCxcblx0XHRcdFx0XHRrZWVwOiBjaGFuZ2Uua2VlcCxcblx0XHRcdFx0XHR1bmRvOiBjaGFuZ2UudW5kb1xuXHRcdFx0XHR9IHNhdGlzZmllcyBJRG9jdW1lbnREaWZmMjtcblx0XHRcdFx0dmFsaWRDZWxscy5hZGQoY2VsbCk7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnREaWZmID0gdGhpcy5jZWxsRWRpdG9ySW50ZWdyYXRpb25zLmdldChjZWxsKTtcblx0XHRcdFx0aWYgKGN1cnJlbnREaWZmKSB7XG5cdFx0XHRcdFx0Ly8gRG8gbm90IHVubmVjZXNzYXJpbHkgdHJpZ2dlciBhIGNoYW5nZSBldmVudFxuXHRcdFx0XHRcdGlmICghYXJlRG9jdW1lbnREaWZmMkVxdWFsKGN1cnJlbnREaWZmLmRpZmYucmVhZCh1bmRlZmluZWQpLCBkaWZmKSkge1xuXHRcdFx0XHRcdFx0Y3VycmVudERpZmYuZGlmZi5zZXQoZGlmZiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZGlmZjIgPSBvYnNlcnZhYmxlVmFsdWUoYGRpZmYke2NlbGwuaGFuZGxlfWAsIGRpZmYpO1xuXHRcdFx0XHRcdGNvbnN0IGludGVncmF0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RWRpdGluZ0NvZGVFZGl0b3JJbnRlZ3JhdGlvbiwgX2VudHJ5LCBlZGl0b3IsIGRpZmYyLCB0cnVlKTtcblx0XHRcdFx0XHR0aGlzLmNlbGxFZGl0b3JJbnRlZ3JhdGlvbnMuc2V0KGNlbGwsIHsgaW50ZWdyYXRpb24sIGRpZmY6IGRpZmYyIH0pO1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGludGVncmF0aW9uKTtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWREaXNwb3NlKCgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuY2VsbEVkaXRvckludGVncmF0aW9ucy5nZXQoY2VsbCk/LmludGVncmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHRoaXMuY2VsbEVkaXRvckludGVncmF0aW9ucy5kZWxldGUoY2VsbCk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHtcblx0XHRcdFx0XHRcdGlmIChlZGl0b3IuZ2V0TW9kZWwoKSAhPT0gY2VsbC50ZXh0TW9kZWwpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5jZWxsRWRpdG9ySW50ZWdyYXRpb25zLmdldChjZWxsKT8uaW50ZWdyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmNlbGxFZGl0b3JJbnRlZ3JhdGlvbnMuZGVsZXRlKGNlbGwpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIERpc3Bvc2Ugb2xkIGludGVncmF0aW9ucyBhcyB0aGUgZWRpdG9ycyBhcmUgbm8gbG9uZ2VyIHZhbGlkLlxuXHRcdFx0dGhpcy5jZWxsRWRpdG9ySW50ZWdyYXRpb25zLmZvckVhY2goKHYsIGNlbGwpID0+IHtcblx0XHRcdFx0aWYgKCF2YWxpZENlbGxzLmhhcyhjZWxsKSkge1xuXHRcdFx0XHRcdHYuaW50ZWdyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMuY2VsbEVkaXRvckludGVncmF0aW9ucy5kZWxldGUoY2VsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNlbGxzQXJlVmlzaWJsZSA9IG9uRGlkQ2hhbmdlVmlzaWJsZVJhbmdlcy5tYXAodiA9PiB2Lmxlbmd0aCA+IDApO1xuXHRcdGNvbnN0IGRlYm91bmNlZENoYW5nZXMgPSBkZWJvdW5jZWRPYnNlcnZhYmxlKGNlbGxDaGFuZ2VzLCAxMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdGlmICh0aGlzLm5vdGVib29rRWRpdG9yLnRleHRNb2RlbCAhPT0gdGhpcy5ub3RlYm9va01vZGVsIHx8ICFjZWxsc0FyZVZpc2libGUucmVhZChyKSB8fCAhdGhpcy5ub3RlYm9va0VkaXRvci5nZXRWaWV3TW9kZWwoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBXZSBjYW4gaGF2ZSBpbnNlcnRlZCBjZWxscyB0aGF0IGhhdmUgYmVlbiBhY2NlcHRlZCwgaW4gdGhvc2UgY2FzZXMgd2UgZG8gbm90IHdhbnQgYW55IGRlY29yYXRvcnMgb24gdGhlbS5cblx0XHRcdGNvbnN0IGNoYW5nZXMgPSBkZWJvdW5jZWRDaGFuZ2VzLnJlYWQocikuZmlsdGVyKGMgPT4gYy50eXBlID09PSAnaW5zZXJ0JyA/ICFjLmRpZmYucmVhZChyKS5pZGVudGljYWwgOiB0cnVlKTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkQ2hhbmdlcyA9IGNoYW5nZXMuZmlsdGVyKGMgPT4gYy50eXBlID09PSAnbW9kaWZpZWQnKTtcblxuXHRcdFx0dGhpcy5jcmVhdGVEZWNvcmF0b3JzKCk7XG5cdFx0XHQvLyBJZiBhbGwgY2VsbHMgYXJlIGp1c3QgaW5zZXJ0cywgdGhlbiBubyBuZWVkIHRvIHNob3cgYW55IGRlY29yYXRpb25zLlxuXHRcdFx0aWYgKGNoYW5nZXMuZXZlcnkoYyA9PiBjLnR5cGUgPT09ICdpbnNlcnQnKSkge1xuXHRcdFx0XHR0aGlzLmluc2VydGVkQ2VsbERlY29yYXRvcj8uYXBwbHkoW10pO1xuXHRcdFx0XHR0aGlzLm1vZGlmaWVkQ2VsbERlY29yYXRvcj8uYXBwbHkoW10pO1xuXHRcdFx0XHR0aGlzLmRlbGV0ZWRDZWxsRGVjb3JhdG9yPy5hcHBseShbXSwgb3JpZ2luYWxNb2RlbCk7XG5cdFx0XHRcdHRoaXMub3ZlcmxheVRvb2xiYXJEZWNvcmF0b3I/LmRlY29yYXRlKFtdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaW5zZXJ0ZWRDZWxsRGVjb3JhdG9yPy5hcHBseShjaGFuZ2VzKTtcblx0XHRcdFx0dGhpcy5tb2RpZmllZENlbGxEZWNvcmF0b3I/LmFwcGx5KG1vZGlmaWVkQ2hhbmdlcyk7XG5cdFx0XHRcdHRoaXMuZGVsZXRlZENlbGxEZWNvcmF0b3I/LmFwcGx5KGNoYW5nZXMsIG9yaWdpbmFsTW9kZWwpO1xuXHRcdFx0XHR0aGlzLm92ZXJsYXlUb29sYmFyRGVjb3JhdG9yPy5kZWNvcmF0ZShjaGFuZ2VzLmZpbHRlcihjID0+IGMudHlwZSA9PT0gJ2luc2VydCcgfHwgYy50eXBlID09PSAnbW9kaWZpZWQnKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDdXJyZW50Q2hhbmdlKCkge1xuXHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IE1hdGgubWluKHRoaXMuX2N1cnJlbnRJbmRleC5nZXQoKSwgdGhpcy5jaGFuZ2VJbmRleENvbXB1dGVyLmdldFRvdGFsU3VtKCkgLSAxKTtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuY2hhbmdlSW5kZXhDb21wdXRlci5nZXRJbmRleE9mKGN1cnJlbnRJbmRleCk7XG5cdFx0Y29uc3QgY2hhbmdlID0gdGhpcy5zb3J0ZWRDZWxsQ2hhbmdlc1tpbmRleC5pbmRleF07XG5cblx0XHRyZXR1cm4gY2hhbmdlID8geyBjaGFuZ2UsIGluZGV4OiBpbmRleC5yZW1haW5kZXIgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ3VycmVudEluZGV4KGNoYW5nZTogSUNlbGxEaWZmSW5mbywgaW5kZXhJbkNlbGw6IG51bWJlciA9IDApIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuc29ydGVkQ2VsbENoYW5nZXMuaW5kZXhPZihjaGFuZ2UpO1xuXHRcdGNvbnN0IGNoYW5nZUluZGV4ID0gdGhpcy5jaGFuZ2VJbmRleENvbXB1dGVyLmdldFByZWZpeFN1bShpbmRleCAtIDEpO1xuXHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IE1hdGgubWluKGNoYW5nZUluZGV4ICsgaW5kZXhJbkNlbGwsIHRoaXMuY2hhbmdlSW5kZXhDb21wdXRlci5nZXRUb3RhbFN1bSgpIC0gMSk7XG5cdFx0dGhpcy5fY3VycmVudEluZGV4LnNldChjdXJyZW50SW5kZXgsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZURlY29yYXRvcnMoKSB7XG5cdFx0Y29uc3QgY2VsbENoYW5nZXMgPSB0aGlzLmNlbGxDaGFuZ2VzLmdldCgpO1xuXHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlID0gdGhpcy5hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTtcblxuXHRcdHRoaXMuaW5zZXJ0ZWRDZWxsRGVjb3JhdG9yID8/PSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rSW5zZXJ0ZWRDZWxsRGVjb3JhdG9yLCB0aGlzLm5vdGVib29rRWRpdG9yKSk7XG5cdFx0dGhpcy5tb2RpZmllZENlbGxEZWNvcmF0b3IgPz89IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tNb2RpZmllZENlbGxEZWNvcmF0b3IsIHRoaXMubm90ZWJvb2tFZGl0b3IpKTtcblx0XHR0aGlzLm92ZXJsYXlUb29sYmFyRGVjb3JhdG9yID8/PSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE92ZXJsYXlUb29sYmFyRGVjb3JhdG9yLCB0aGlzLm5vdGVib29rRWRpdG9yLCB0aGlzLm5vdGVib29rTW9kZWwpKTtcblxuXHRcdGlmICh0aGlzLmRlbGV0ZWRDZWxsRGVjb3JhdG9yKSB7XG5cdFx0XHR0aGlzLl9zdG9yZS5kZWxldGUodGhpcy5kZWxldGVkQ2VsbERlY29yYXRvcik7XG5cdFx0XHR0aGlzLmRlbGV0ZWRDZWxsRGVjb3JhdG9yLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5kZWxldGVkQ2VsbERlY29yYXRvciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tEZWxldGVkQ2VsbERlY29yYXRvciwgdGhpcy5ub3RlYm9va0VkaXRvciwge1xuXHRcdFx0Y2xhc3NOYW1lOiAnY2hhdC1kaWZmLWNoYW5nZS1jb250ZW50LXdpZGdldCcsXG5cdFx0XHR0ZWxlbWV0cnlTb3VyY2U6ICdjaGF0RWRpdGluZ05vdGVib29rSHVuaycsXG5cdFx0XHRtZW51SWQ6IE1lbnVJZC5DaGF0RWRpdGluZ0VkaXRvckh1bmssXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmICghYWN0aW9uLmNsYXNzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIEFjdGlvblZpZXdJdGVtIHtcblx0XHRcdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdFx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBrZXliaW5kaW5nTm90UmVuZGVyZWRXaXRoTGFiZWw6IHRydWUgLyogaGlkZSBrZXliaW5kaW5nIGZvciBhY3Rpb25zIHdpdGhvdXQgaWNvbiAqLywgaWNvbjogZmFsc2UsIGxhYmVsOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRhcmdGYWN0b3J5OiAoZGVsZXRlZENlbGxJbmRleDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0YWNjZXB0KCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZW50cnkgPSBjZWxsQ2hhbmdlcy5maW5kKGMgPT4gYy50eXBlID09PSAnZGVsZXRlJyAmJiBjLm9yaWdpbmFsQ2VsbEluZGV4ID09PSBkZWxldGVkQ2VsbEluZGV4KTtcblx0XHRcdFx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZW50cnkua2VlcChlbnRyeS5kaWZmLmdldCgpLmNoYW5nZXNbMF0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmVkaXRzS2VwdCwgeyBhbGxvd01hbnlJblBhcmFsbGVsOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlamVjdCgpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVudHJ5ID0gY2VsbENoYW5nZXMuZmluZChjID0+IGMudHlwZSA9PT0gJ2RlbGV0ZScgJiYgYy5vcmlnaW5hbENlbGxJbmRleCA9PT0gZGVsZXRlZENlbGxJbmRleCk7XG5cdFx0XHRcdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVudHJ5LnVuZG8oZW50cnkuZGlmZi5nZXQoKS5jaGFuZ2VzWzBdKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5lZGl0c1VuZG9uZSwgeyBhbGxvd01hbnlJblBhcmFsbGVsOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJTW9kaWZpZWRGaWxlRW50cnlDaGFuZ2VIdW5rO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGdldENlbGwobW9kaWZpZWRDZWxsSW5kZXg6IG51bWJlcikge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLm5vdGVib29rTW9kZWwuY2VsbHNbbW9kaWZpZWRDZWxsSW5kZXhdO1xuXHRcdGNvbnN0IGludGVncmF0aW9uID0gdGhpcy5jZWxsRWRpdG9ySW50ZWdyYXRpb25zLmdldChjZWxsKT8uaW50ZWdyYXRpb247XG5cdFx0cmV0dXJuIGludGVncmF0aW9uO1xuXHR9XG5cblx0cmV2ZWFsKGZpcnN0T3JMYXN0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbmdlcyA9IHRoaXMuc29ydGVkQ2VsbENoYW5nZXMuZmlsdGVyKGMgPT4gYy50eXBlICE9PSAndW5jaGFuZ2VkJyk7XG5cdFx0aWYgKCFjaGFuZ2VzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjaGFuZ2UgPSBmaXJzdE9yTGFzdCA/IGNoYW5nZXNbMF0gOiBjaGFuZ2VzW2NoYW5nZXMubGVuZ3RoIC0gMV07XG5cdFx0dGhpcy5fcmV2ZWFsRmlyc3RPckxhc3QoY2hhbmdlLCBmaXJzdE9yTGFzdCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWxGaXJzdE9yTGFzdChjaGFuZ2U6IElDZWxsRGlmZkluZm8sIGZpcnN0T3JMYXN0OiBib29sZWFuID0gdHJ1ZSkge1xuXHRcdHN3aXRjaCAoY2hhbmdlLnR5cGUpIHtcblx0XHRcdGNhc2UgJ2luc2VydCc6XG5cdFx0XHRjYXNlICdtb2RpZmllZCc6XG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0aGlzLmJsdXIodGhpcy5nZXRDdXJyZW50Q2hhbmdlKCk/LmNoYW5nZSk7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBmaXJzdE9yTGFzdCB8fCBjaGFuZ2UudHlwZSA9PT0gJ2luc2VydCcgPyAwIDogY2hhbmdlLmRpZmYuZ2V0KCkuY2hhbmdlcy5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9yZXZlYWxDaGFuZ2UoY2hhbmdlLCBpbmRleCk7XG5cdFx0XHRcdH1cblx0XHRcdGNhc2UgJ2RlbGV0ZSc6XG5cdFx0XHRcdHRoaXMuYmx1cih0aGlzLmdldEN1cnJlbnRDaGFuZ2UoKT8uY2hhbmdlKTtcblx0XHRcdFx0Ly8gcmV2ZWFsIHRoZSBkZWxldGVkIGNlbGwgZGVjb3JhdG9yXG5cdFx0XHRcdHRoaXMuZGVsZXRlZENlbGxEZWNvcmF0b3I/LnJldmVhbChjaGFuZ2Uub3JpZ2luYWxDZWxsSW5kZXgpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUN1cnJlbnRJbmRleChjaGFuZ2UpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3JldmVhbENoYW5nZShjaGFuZ2U6IElDZWxsRGlmZkluZm8sIGluZGV4SW5DZWxsOiBudW1iZXIpIHtcblx0XHRzd2l0Y2ggKGNoYW5nZS50eXBlKSB7XG5cdFx0XHRjYXNlICdpbnNlcnQnOlxuXHRcdFx0Y2FzZSAnbW9kaWZpZWQnOlxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29uc3QgdGV4dENoYW5nZSA9IGNoYW5nZS5kaWZmLmdldCgpLmNoYW5nZXNbaW5kZXhJbkNlbGxdO1xuXHRcdFx0XHRcdGNvbnN0IGNlbGxWaWV3TW9kZWwgPSB0aGlzLmdldENlbGxWaWV3TW9kZWwoY2hhbmdlKTtcblx0XHRcdFx0XHRpZiAoY2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVDdXJyZW50SW5kZXgoY2hhbmdlLCBpbmRleEluQ2VsbCk7XG5cdFx0XHRcdFx0XHR0aGlzLnJldmVhbENoYW5nZUluVmlldyhjZWxsVmlld01vZGVsLCB0ZXh0Q2hhbmdlPy5tb2RpZmllZCwgY2hhbmdlKVxuXHRcdFx0XHRcdFx0XHQuY2F0Y2goZXJyID0+IHsgdGhpcy5sb2dTZXJ2aWNlLndhcm4oYEVycm9yIHJldmVhbGluZyBjaGFuZ2UgaW4gdmlldzogJHtlcnJ9YCk7IH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRjYXNlICdkZWxldGUnOlxuXHRcdFx0XHR0aGlzLnVwZGF0ZUN1cnJlbnRJbmRleChjaGFuZ2UpO1xuXHRcdFx0XHQvLyByZXZlYWwgdGhlIGRlbGV0ZWQgY2VsbCBkZWNvcmF0b3Jcblx0XHRcdFx0dGhpcy5kZWxldGVkQ2VsbERlY29yYXRvcj8ucmV2ZWFsKGNoYW5nZS5vcmlnaW5hbENlbGxJbmRleCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDZWxsVmlld01vZGVsKGNoYW5nZTogSUNlbGxEaWZmSW5mbykge1xuXHRcdGlmIChjaGFuZ2UudHlwZSA9PT0gJ2RlbGV0ZScgfHwgY2hhbmdlLm1vZGlmaWVkQ2VsbEluZGV4ID09PSB1bmRlZmluZWQgfHwgY2hhbmdlLm1vZGlmaWVkQ2VsbEluZGV4ID49IHRoaXMubm90ZWJvb2tNb2RlbC5jZWxscy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLm5vdGVib29rTW9kZWwuY2VsbHNbY2hhbmdlLm1vZGlmaWVkQ2VsbEluZGV4XTtcblx0XHRjb25zdCBjZWxsVmlld01vZGVsID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRWaWV3TW9kZWwoKT8udmlld0NlbGxzLmZpbmQoYyA9PiBjLmhhbmRsZSA9PT0gY2VsbC5oYW5kbGUpO1xuXHRcdHJldHVybiBjZWxsVmlld01vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXZlYWxDaGFuZ2VJblZpZXcoY2VsbDogSUNlbGxWaWV3TW9kZWwsIGxpbmVzOiBMaW5lUmFuZ2UgfCB1bmRlZmluZWQsIGNoYW5nZTogSUNlbGxEaWZmSW5mbyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRhcmdldExpbmVzID0gbGluZXMgPz8gbmV3IExpbmVSYW5nZSgwLCAwKTtcblx0XHRpZiAoY2hhbmdlLnR5cGUgPT09ICdtb2RpZmllZCcgJiYgY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwICYmIGNlbGwuZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuUHJldmlldykge1xuXHRcdFx0Y2VsbC51cGRhdGVFZGl0U3RhdGUoQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nLCAnY2hhdEVkaXROYXZpZ2F0aW9uJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXNUYXJnZXQgPSBjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5Db2RlIHx8IGNoYW5nZS50eXBlID09PSAnbW9kaWZpZWQnID8gJ2VkaXRvcicgOiAnY29udGFpbmVyJztcblx0XHRhd2FpdCB0aGlzLm5vdGVib29rRWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKGNlbGwsIGZvY3VzVGFyZ2V0LCB7IGZvY3VzRWRpdG9yTGluZTogdGFyZ2V0TGluZXMuc3RhcnRMaW5lTnVtYmVyIH0pO1xuXHRcdGF3YWl0IHRoaXMubm90ZWJvb2tFZGl0b3IucmV2ZWFsUmFuZ2VJbkNlbnRlckFzeW5jKGNlbGwsIG5ldyBSYW5nZSh0YXJnZXRMaW5lcy5zdGFydExpbmVOdW1iZXIsIDAsIHRhcmdldExpbmVzLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUsIDApKTtcblx0fVxuXG5cdHByaXZhdGUgcmV2ZXJ0TWFya3VwQ2VsbFN0YXRlKCkge1xuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIHRoaXMuc29ydGVkQ2VsbENoYW5nZXMpIHtcblx0XHRcdGNvbnN0IGNlbGxWaWV3TW9kZWwgPSB0aGlzLmdldENlbGxWaWV3TW9kZWwoY2hhbmdlKTtcblx0XHRcdGlmIChjZWxsVmlld01vZGVsPy5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwICYmIGNlbGxWaWV3TW9kZWwuZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuRWRpdGluZyAmJlxuXHRcdFx0XHQoY2VsbFZpZXdNb2RlbC5lZGl0U3RhdGVTb3VyY2UgPT09ICdjaGF0RWRpdE5hdmlnYXRpb24nIHx8IGNlbGxWaWV3TW9kZWwuZWRpdFN0YXRlU291cmNlID09PSAnY2hhdEVkaXQnKSkge1xuXHRcdFx0XHRjZWxsVmlld01vZGVsLnVwZGF0ZUVkaXRTdGF0ZShDZWxsRWRpdFN0YXRlLlByZXZpZXcsICdjaGF0RWRpdCcpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYmx1cihjaGFuZ2U6IElDZWxsRGlmZkluZm8gfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoIWNoYW5nZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjZWxsVmlld01vZGVsID0gdGhpcy5nZXRDZWxsVmlld01vZGVsKGNoYW5nZSk7XG5cdFx0aWYgKGNlbGxWaWV3TW9kZWw/LmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXAgJiYgY2VsbFZpZXdNb2RlbC5nZXRFZGl0U3RhdGUoKSA9PT0gQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nICYmIGNlbGxWaWV3TW9kZWwuZWRpdFN0YXRlU291cmNlID09PSAnY2hhdEVkaXROYXZpZ2F0aW9uJykge1xuXHRcdFx0Y2VsbFZpZXdNb2RlbC51cGRhdGVFZGl0U3RhdGUoQ2VsbEVkaXRTdGF0ZS5QcmV2aWV3LCAnY2hhdEVkaXROYXZpZ2F0aW9uJyk7XG5cdFx0fVxuXHR9XG5cblx0bmV4dCh3cmFwOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY2hhbmdlcyA9IHRoaXMuc29ydGVkQ2VsbENoYW5nZXMuZmlsdGVyKGMgPT4gYy50eXBlICE9PSAndW5jaGFuZ2VkJyk7XG5cdFx0Y29uc3QgY3VycmVudENoYW5nZSA9IHRoaXMuZ2V0Q3VycmVudENoYW5nZSgpO1xuXHRcdGlmICghY3VycmVudENoYW5nZSkge1xuXHRcdFx0Y29uc3QgZmlyc3RDaGFuZ2UgPSBjaGFuZ2VzWzBdO1xuXG5cdFx0XHRpZiAoZmlyc3RDaGFuZ2UpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3JldmVhbEZpcnN0T3JMYXN0KGZpcnN0Q2hhbmdlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIGdvIHRvIG5leHRcblx0XHQvLyBmaXJzdCBjaGVjayBpZiB3ZSBhcmUgYXQgdGhlIGVuZCBvZiB0aGUgY3VycmVudCBjaGFuZ2Vcblx0XHRzd2l0Y2ggKGN1cnJlbnRDaGFuZ2UuY2hhbmdlLnR5cGUpIHtcblx0XHRcdGNhc2UgJ21vZGlmaWVkJzpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnN0IGNlbGxJbnRlZ3JhdGlvbiA9IHRoaXMuZ2V0Q2VsbChjdXJyZW50Q2hhbmdlLmNoYW5nZS5tb2RpZmllZENlbGxJbmRleCk7XG5cdFx0XHRcdFx0aWYgKGNlbGxJbnRlZ3JhdGlvbikge1xuXHRcdFx0XHRcdFx0aWYgKGNlbGxJbnRlZ3JhdGlvbi5uZXh0KGZhbHNlKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUN1cnJlbnRJbmRleChjdXJyZW50Q2hhbmdlLmNoYW5nZSwgY2VsbEludGVncmF0aW9uLmN1cnJlbnRJbmRleC5nZXQoKSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGlzTGFzdENoYW5nZUluQ2VsbCA9IGN1cnJlbnRDaGFuZ2UuaW5kZXggPj0gbGFzdENoYW5nZUluZGV4KGN1cnJlbnRDaGFuZ2UuY2hhbmdlKTtcblx0XHRcdFx0XHRjb25zdCBpbmRleCA9IGlzTGFzdENoYW5nZUluQ2VsbCA/IDAgOiBjdXJyZW50Q2hhbmdlLmluZGV4ICsgMTtcblx0XHRcdFx0XHRjb25zdCBjaGFuZ2UgPSBpc0xhc3RDaGFuZ2VJbkNlbGwgPyBjaGFuZ2VzW2NoYW5nZXMuaW5kZXhPZihjdXJyZW50Q2hhbmdlLmNoYW5nZSkgKyAxXSA6IGN1cnJlbnRDaGFuZ2UuY2hhbmdlO1xuXG5cdFx0XHRcdFx0aWYgKGNoYW5nZSkge1xuXHRcdFx0XHRcdFx0aWYgKGlzTGFzdENoYW5nZUluQ2VsbCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmJsdXIoY3VycmVudENoYW5nZS5jaGFuZ2UpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fcmV2ZWFsQ2hhbmdlKGNoYW5nZSwgaW5kZXgpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2luc2VydCc6XG5cdFx0XHRjYXNlICdkZWxldGUnOlxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGhpcy5ibHVyKGN1cnJlbnRDaGFuZ2UuY2hhbmdlKTtcblx0XHRcdFx0XHQvLyBnbyB0byBuZXh0IGNoYW5nZSBkaXJlY3RseVxuXHRcdFx0XHRcdGNvbnN0IG5leHRDaGFuZ2UgPSBjaGFuZ2VzW2NoYW5nZXMuaW5kZXhPZihjdXJyZW50Q2hhbmdlLmNoYW5nZSkgKyAxXTtcblx0XHRcdFx0XHRpZiAobmV4dENoYW5nZSAmJiB0aGlzLl9yZXZlYWxGaXJzdE9yTGFzdChuZXh0Q2hhbmdlLCB0cnVlKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKHdyYXApIHtcblx0XHRcdGNvbnN0IGZpcnN0Q2hhbmdlID0gY2hhbmdlc1swXTtcblx0XHRcdGlmIChmaXJzdENoYW5nZSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmV2ZWFsRmlyc3RPckxhc3QoZmlyc3RDaGFuZ2UsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByZXZpb3VzKHdyYXA6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRjb25zdCBjaGFuZ2VzID0gdGhpcy5zb3J0ZWRDZWxsQ2hhbmdlcy5maWx0ZXIoYyA9PiBjLnR5cGUgIT09ICd1bmNoYW5nZWQnKTtcblx0XHRjb25zdCBjdXJyZW50Q2hhbmdlID0gdGhpcy5nZXRDdXJyZW50Q2hhbmdlKCk7XG5cdFx0aWYgKCFjdXJyZW50Q2hhbmdlKSB7XG5cdFx0XHRjb25zdCBsYXN0Q2hhbmdlID0gY2hhbmdlc1tjaGFuZ2VzLmxlbmd0aCAtIDFdO1xuXHRcdFx0aWYgKGxhc3RDaGFuZ2UpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3JldmVhbEZpcnN0T3JMYXN0KGxhc3RDaGFuZ2UsIGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIGdvIHRvIHByZXZpb3VzXG5cdFx0Ly8gZmlyc3QgY2hlY2sgaWYgd2UgYXJlIGF0IHRoZSBzdGFydCBvZiB0aGUgY3VycmVudCBjaGFuZ2Vcblx0XHRzd2l0Y2ggKGN1cnJlbnRDaGFuZ2UuY2hhbmdlLnR5cGUpIHtcblx0XHRcdGNhc2UgJ21vZGlmaWVkJzpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnN0IGNlbGxJbnRlZ3JhdGlvbiA9IHRoaXMuZ2V0Q2VsbChjdXJyZW50Q2hhbmdlLmNoYW5nZS5tb2RpZmllZENlbGxJbmRleCk7XG5cdFx0XHRcdFx0aWYgKGNlbGxJbnRlZ3JhdGlvbikge1xuXHRcdFx0XHRcdFx0aWYgKGNlbGxJbnRlZ3JhdGlvbi5wcmV2aW91cyhmYWxzZSkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy51cGRhdGVDdXJyZW50SW5kZXgoY3VycmVudENoYW5nZS5jaGFuZ2UsIGNlbGxJbnRlZ3JhdGlvbi5jdXJyZW50SW5kZXguZ2V0KCkpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBpc0ZpcnN0Q2hhbmdlSW5DZWxsID0gY3VycmVudENoYW5nZS5pbmRleCA8PSAwO1xuXHRcdFx0XHRcdGNvbnN0IGNoYW5nZSA9IGlzRmlyc3RDaGFuZ2VJbkNlbGwgPyBjaGFuZ2VzW2NoYW5nZXMuaW5kZXhPZihjdXJyZW50Q2hhbmdlLmNoYW5nZSkgLSAxXSA6IGN1cnJlbnRDaGFuZ2UuY2hhbmdlO1xuXG5cdFx0XHRcdFx0aWYgKGNoYW5nZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBpc0ZpcnN0Q2hhbmdlSW5DZWxsID8gbGFzdENoYW5nZUluZGV4KGNoYW5nZSkgOiBjdXJyZW50Q2hhbmdlLmluZGV4IC0gMTtcblx0XHRcdFx0XHRcdGlmIChpc0ZpcnN0Q2hhbmdlSW5DZWxsKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuYmx1cihjdXJyZW50Q2hhbmdlLmNoYW5nZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fcmV2ZWFsQ2hhbmdlKGNoYW5nZSwgaW5kZXgpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2luc2VydCc6XG5cdFx0XHRjYXNlICdkZWxldGUnOlxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGhpcy5ibHVyKGN1cnJlbnRDaGFuZ2UuY2hhbmdlKTtcblx0XHRcdFx0XHQvLyBnbyB0byBwcmV2aW91cyBjaGFuZ2UgZGlyZWN0bHlcblx0XHRcdFx0XHRjb25zdCBwcmV2Q2hhbmdlID0gY2hhbmdlc1tjaGFuZ2VzLmluZGV4T2YoY3VycmVudENoYW5nZS5jaGFuZ2UpIC0gMV07XG5cdFx0XHRcdFx0aWYgKHByZXZDaGFuZ2UgJiYgdGhpcy5fcmV2ZWFsRmlyc3RPckxhc3QocHJldkNoYW5nZSwgZmFsc2UpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAod3JhcCkge1xuXHRcdFx0Y29uc3QgbGFzdENoYW5nZSA9IGNoYW5nZXNbY2hhbmdlcy5sZW5ndGggLSAxXTtcblx0XHRcdGlmIChsYXN0Q2hhbmdlKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXZlYWxGaXJzdE9yTGFzdChsYXN0Q2hhbmdlLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0ZW5hYmxlQWNjZXNzaWJsZURpZmZWaWV3KCk6IHZvaWQge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldEFjdGl2ZUNlbGwoKT8ubW9kZWw7XG5cdFx0aWYgKGNlbGwpIHtcblx0XHRcdGNvbnN0IGludGVncmF0aW9uID0gdGhpcy5jZWxsRWRpdG9ySW50ZWdyYXRpb25zLmdldChjZWxsKT8uaW50ZWdyYXRpb247XG5cdFx0XHRpbnRlZ3JhdGlvbj8uZW5hYmxlQWNjZXNzaWJsZURpZmZWaWV3KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRmb2N1c2VkSW50ZWdyYXRpb24oKTogQ2hhdEVkaXRpbmdDb2RlRWRpdG9ySW50ZWdyYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGZpcnN0ID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRTZWxlY3Rpb25WaWV3TW9kZWxzKClbMF07XG5cdFx0aWYgKGZpcnN0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jZWxsRWRpdG9ySW50ZWdyYXRpb25zLmdldChmaXJzdC5tb2RlbCk/LmludGVncmF0aW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgYWNjZXB0TmVhcmVzdENoYW5nZShodW5rOiBJTW9kaWZpZWRGaWxlRW50cnlDaGFuZ2VIdW5rIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGh1bmspIHtcblx0XHRcdGF3YWl0IGh1bmsuYWNjZXB0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLmdldEN1cnJlbnRDaGFuZ2UoKTtcblx0XHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLmdldGZvY3VzZWRJbnRlZ3JhdGlvbigpO1xuXHRcdFx0Ly8gZGVsZXRlIGNoYW5nZXMgY2FuJ3QgYmUgZm9jdXNlZFxuXHRcdFx0aWYgKGN1cnJlbnQgJiYgIWZvY3VzZWQgfHwgY3VycmVudD8uY2hhbmdlLnR5cGUgPT09ICdkZWxldGUnKSB7XG5cdFx0XHRcdGN1cnJlbnQuY2hhbmdlLmtlZXAoY3VycmVudD8uY2hhbmdlLmRpZmYuZ2V0KCkuY2hhbmdlc1tjdXJyZW50LmluZGV4XSk7XG5cdFx0XHR9IGVsc2UgaWYgKGZvY3VzZWQpIHtcblx0XHRcdFx0YXdhaXQgZm9jdXNlZC5hY2NlcHROZWFyZXN0Q2hhbmdlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2N1cnJlbnRJbmRleC5zZXQodGhpcy5fY3VycmVudEluZGV4LmdldCgpIC0gMSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMubmV4dCh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWplY3ROZWFyZXN0Q2hhbmdlKGh1bms6IElNb2RpZmllZEZpbGVFbnRyeUNoYW5nZUh1bmsgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoaHVuaykge1xuXHRcdFx0YXdhaXQgaHVuay5yZWplY3QoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuZ2V0Q3VycmVudENoYW5nZSgpO1xuXHRcdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuZ2V0Zm9jdXNlZEludGVncmF0aW9uKCk7XG5cdFx0XHQvLyBkZWxldGUgY2hhbmdlcyBjYW4ndCBiZSBmb2N1c2VkXG5cdFx0XHRpZiAoY3VycmVudCAmJiAhZm9jdXNlZCB8fCBjdXJyZW50Py5jaGFuZ2UudHlwZSA9PT0gJ2RlbGV0ZScpIHtcblx0XHRcdFx0Y3VycmVudC5jaGFuZ2UudW5kbyhjdXJyZW50LmNoYW5nZS5kaWZmLmdldCgpLmNoYW5nZXNbY3VycmVudC5pbmRleF0pO1xuXHRcdFx0fSBlbHNlIGlmIChmb2N1c2VkKSB7XG5cdFx0XHRcdGF3YWl0IGZvY3VzZWQucmVqZWN0TmVhcmVzdENoYW5nZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9jdXJyZW50SW5kZXguc2V0KHRoaXMuX2N1cnJlbnRJbmRleC5nZXQoKSAtIDEsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLm5leHQodHJ1ZSk7XG5cdFx0fVxuXG5cdH1cblx0YXN5bmMgdG9nZ2xlRGlmZihfY2hhbmdlOiBJTW9kaWZpZWRGaWxlRW50cnlDaGFuZ2VIdW5rIHwgdW5kZWZpbmVkLCBfc2hvdz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaWZmSW5wdXQ6IElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCA9IHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiB0aGlzLl9lbnRyeS5vcmlnaW5hbFVSSSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IHRoaXMuX2VudHJ5Lm1vZGlmaWVkVVJJIH0sXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2RpZmYuZ2VuZXJpYycsICd7MH0gKGNoYW5nZXMgZnJvbSBjaGF0KScsIGJhc2VuYW1lKHRoaXMuX2VudHJ5Lm1vZGlmaWVkVVJJKSlcblx0XHR9O1xuXHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihkaWZmSW5wdXQpO1xuXG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nTm90ZWJvb2tEaWZmRWRpdG9ySW50ZWdyYXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1vZGlmaWVkRmlsZUVudHJ5RWRpdG9ySW50ZWdyYXRpb24ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50SW5kZXggPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgLTEpO1xuXHRyZWFkb25seSBjdXJyZW50SW5kZXg6IElPYnNlcnZhYmxlPG51bWJlcj4gPSB0aGlzLl9jdXJyZW50SW5kZXg7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RlYm9va0RpZmZFZGl0b3I6IElOb3RlYm9va1RleHREaWZmRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2VsbENoYW5nZXM6IElPYnNlcnZhYmxlPElDZWxsRGlmZkluZm9bXT5cblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3QgaW5kZXggPSBub3RlYm9va0RpZmZFZGl0b3IuY3VycmVudENoYW5nZWRJbmRleC5yZWFkKHIpO1xuXHRcdFx0Y29uc3QgbnVtYmVyT2ZDZWxsQ2hhbmdlcyA9IGNlbGxDaGFuZ2VzLnJlYWQocikuZmlsdGVyKGMgPT4gIWMuZGlmZi5yZWFkKHIpLmlkZW50aWNhbCk7XG5cdFx0XHRpZiAobnVtYmVyT2ZDZWxsQ2hhbmdlcy5sZW5ndGggJiYgaW5kZXggPj0gMCAmJiBpbmRleCA8IG51bWJlck9mQ2VsbENoYW5nZXMubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIE5vdGVib29rIERpZmYgZWRpdG9yIG9ubHkgc3VwcG9ydHMgbmF2aWdhdGluZyB0aHJvdWdoIGNoYW5nZXMgdG8gY2VsbHMuXG5cdFx0XHRcdC8vIEhvd2V2ZXIgaW4gY2hhdCB3ZSB0YWtlIGNoYW5nZXMgdG8gbGluZXMgaW4gdGhlIGNlbGxzIGludG8gYWNjb3VudC5cblx0XHRcdFx0Ly8gU28gaWYgd2UncmUgb24gdGhlIHNlY29uZCBjZWxsIGFuZCBmaXJzdCBjZWxsIGhhcyAzIGNoYW5nZXMsIHRoZW4gd2UncmUgb24gdGhlIDR0aCBjaGFuZ2UuXG5cdFx0XHRcdGNvbnN0IGNoYW5nZXNTb0ZhciA9IGNvdW50Q2hhbmdlcyhudW1iZXJPZkNlbGxDaGFuZ2VzLnNsaWNlKDAsIGluZGV4ICsgMSkpO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50SW5kZXguc2V0KGNoYW5nZXNTb0ZhciAtIDEsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50SW5kZXguc2V0KC0xLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHJldmVhbChmaXJzdE9yTGFzdDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5nZXMgPSBzb3J0Q2VsbENoYW5nZXModGhpcy5jZWxsQ2hhbmdlcy5nZXQoKS5maWx0ZXIoYyA9PiBjLnR5cGUgIT09ICd1bmNoYW5nZWQnKSk7XG5cdFx0aWYgKCFjaGFuZ2VzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGZpcnN0T3JMYXN0KSB7XG5cdFx0XHR0aGlzLm5vdGVib29rRGlmZkVkaXRvci5maXJzdENoYW5nZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm5vdGVib29rRGlmZkVkaXRvci5sYXN0Q2hhbmdlKCk7XG5cdFx0fVxuXHR9XG5cblx0bmV4dChfd3JhcDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNoYW5nZXMgPSB0aGlzLmNlbGxDaGFuZ2VzLmdldCgpLmZpbHRlcihjID0+ICFjLmRpZmYuZ2V0KCkuaWRlbnRpY2FsKS5sZW5ndGg7XG5cdFx0aWYgKHRoaXMubm90ZWJvb2tEaWZmRWRpdG9yLmN1cnJlbnRDaGFuZ2VkSW5kZXguZ2V0KCkgPT09IGNoYW5nZXMgLSAxKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMubm90ZWJvb2tEaWZmRWRpdG9yLm5leHRDaGFuZ2UoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByZXZpb3VzKF93cmFwOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY2hhbmdlcyA9IHRoaXMuY2VsbENoYW5nZXMuZ2V0KCkuZmlsdGVyKGMgPT4gIWMuZGlmZi5nZXQoKS5pZGVudGljYWwpLmxlbmd0aDtcblx0XHRpZiAodGhpcy5ub3RlYm9va0RpZmZFZGl0b3IuY3VycmVudENoYW5nZWRJbmRleC5nZXQoKSA9PT0gY2hhbmdlcyAtIDEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5ub3RlYm9va0RpZmZFZGl0b3IubmV4dENoYW5nZSgpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0ZW5hYmxlQWNjZXNzaWJsZURpZmZWaWV3KCk6IHZvaWQge1xuXHRcdC8vXG5cdH1cblx0YXN5bmMgYWNjZXB0TmVhcmVzdENoYW5nZShjaGFuZ2U6IElNb2RpZmllZEZpbGVFbnRyeUNoYW5nZUh1bmspOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBjaGFuZ2UuYWNjZXB0KCk7XG5cdFx0dGhpcy5uZXh0KHRydWUpO1xuXHR9XG5cdGFzeW5jIHJlamVjdE5lYXJlc3RDaGFuZ2UoY2hhbmdlOiBJTW9kaWZpZWRGaWxlRW50cnlDaGFuZ2VIdW5rKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgY2hhbmdlLnJlamVjdCgpO1xuXHRcdHRoaXMubmV4dCh0cnVlKTtcblx0fVxuXHRhc3luYyB0b2dnbGVEaWZmKF9jaGFuZ2U6IElNb2RpZmllZEZpbGVFbnRyeUNoYW5nZUh1bmsgfCB1bmRlZmluZWQsIF9zaG93PzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vXG5cdH1cbn1cblxuZnVuY3Rpb24gYXJlRG9jdW1lbnREaWZmMkVxdWFsKGRpZmYxOiBJRG9jdW1lbnREaWZmMiwgZGlmZjI6IElEb2N1bWVudERpZmYyKTogYm9vbGVhbiB7XG5cdGlmIChkaWZmMS5jaGFuZ2VzICE9PSBkaWZmMi5jaGFuZ2VzKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChkaWZmMS5pZGVudGljYWwgIT09IGRpZmYyLmlkZW50aWNhbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoZGlmZjEubW92ZXMgIT09IGRpZmYyLm1vdmVzKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChkaWZmMS5vcmlnaW5hbE1vZGVsICE9PSBkaWZmMi5vcmlnaW5hbE1vZGVsKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChkaWZmMS5tb2RpZmllZE1vZGVsICE9PSBkaWZmMi5tb2RpZmllZE1vZGVsKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChkaWZmMS5rZWVwICE9PSBkaWZmMi5rZWVwKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChkaWZmMS51bmRvICE9PSBkaWZmMi51bmRvKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChkaWZmMS5xdWl0RWFybHkgIT09IGRpZmYyLnF1aXRFYXJseSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gbGFzdENoYW5nZUluZGV4KGNoYW5nZTogSUNlbGxEaWZmSW5mbyk6IG51bWJlciB7XG5cdGlmIChjaGFuZ2UudHlwZSA9PT0gJ21vZGlmaWVkJykge1xuXHRcdHJldHVybiBjaGFuZ2UuZGlmZi5nZXQoKS5jaGFuZ2VzLmxlbmd0aCAtIDE7XG5cdH1cblx0cmV0dXJuIDA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBeUIsb0JBQW9CO0FBQ3RELFNBQVMsU0FBUyxxQkFBdUQscUJBQXFCLHVCQUF1QjtBQUNySCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUIsbUNBQW1DO0FBQ2pFLFNBQVMsY0FBYztBQUN2QixT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
