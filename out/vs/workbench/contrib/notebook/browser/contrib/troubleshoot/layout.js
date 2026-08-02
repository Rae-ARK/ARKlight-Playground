import { Disposable, DisposableStore, dispose, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { localize2 } from "../../../../../../nls.js";
import { Categories } from "../../../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
import { CellStatusbarAlignment } from "../../../common/notebookCommon.js";
import { INotebookService } from "../../../common/notebookService.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { n } from "../../../../../../base/browser/dom.js";
class TroubleshootController extends Disposable {
  constructor(_notebookEditor) {
    super();
    this._notebookEditor = _notebookEditor;
    this._localStore = this._register(new DisposableStore());
    this._cellDisposables = [];
    this._enabled = false;
    this._cellStatusItems = [];
    this._register(this._notebookEditor.onDidChangeModel(() => {
      this._update();
    }));
    this._update();
  }
  toggle() {
    this._enabled = !this._enabled;
    this._update();
  }
  _update() {
    this._localStore.clear();
    this._cellDisposables.forEach((d) => d.dispose());
    this._cellDisposables = [];
    this._removeNotebookOverlay();
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    if (this._enabled) {
      this._updateListener();
      this._createNotebookOverlay();
      this._createCellOverlays();
    }
  }
  _log(cell, e) {
    if (this._enabled) {
      const oldHeight = this._notebookEditor.getViewHeight(cell);
      console.log(`cell#${cell.handle}`, e, `${oldHeight} -> ${cell.layoutInfo.totalHeight}`);
    }
  }
  _createCellOverlays() {
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    for (let i = 0; i < this._notebookEditor.getLength(); i++) {
      const cell = this._notebookEditor.cellAt(i);
      this._createCellOverlay(cell, i);
    }
    this._localStore.add(this._notebookEditor.onDidChangeViewCells((e) => {
      const addedCells = e.splices.reduce((acc, [, , newCells]) => [...acc, ...newCells], []);
      for (let i = 0; i < addedCells.length; i++) {
        const cellIndex = this._notebookEditor.getCellIndex(addedCells[i]);
        if (cellIndex !== void 0) {
          this._createCellOverlay(addedCells[i], cellIndex);
        }
      }
    }));
  }
  _createNotebookOverlay() {
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    const listViewTop = this._notebookEditor.getLayoutInfo().listViewOffsetTop;
    const scrollTop = this._notebookEditor.scrollTop;
    const overlay = n.div({
      style: {
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: "1000"
      }
    }, [
      // Top line
      n.div({
        style: {
          position: "absolute",
          top: `${listViewTop}px`,
          left: "0",
          width: "100%",
          height: "2px",
          backgroundColor: "rgba(0, 0, 255, 0.7)"
        }
      }),
      // Text label for the notebook overlay
      n.div({
        style: {
          position: "absolute",
          top: `${listViewTop}px`,
          left: "10px",
          backgroundColor: "rgba(0, 0, 255, 0.7)",
          color: "white",
          fontSize: "11px",
          fontWeight: "bold",
          padding: "2px 6px",
          borderRadius: "3px",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: "1001"
        }
      }, [`ScrollTop: ${scrollTop}px`])
    ]).keepUpdated(this._store);
    this._notebookOverlayDomNode = overlay.element;
    if (this._notebookOverlayDomNode) {
      this._notebookEditor.getDomNode().appendChild(this._notebookOverlayDomNode);
    }
    this._localStore.add(this._notebookEditor.onDidScroll(() => {
      const scrollTop2 = this._notebookEditor.scrollTop;
      const listViewTop2 = this._notebookEditor.getLayoutInfo().listViewOffsetTop;
      if (this._notebookOverlayDomNode) {
        const labelElement = this._notebookOverlayDomNode.querySelector("div:nth-child(2)");
        if (labelElement) {
          labelElement.textContent = `ScrollTop: ${scrollTop2}px`;
          labelElement.style.top = `${listViewTop2}px`;
        }
        const topLineElement = this._notebookOverlayDomNode.querySelector("div:first-child");
        if (topLineElement) {
          topLineElement.style.top = `${listViewTop2}px`;
        }
      }
    }));
  }
  _createCellOverlay(cell, index) {
    const overlayContainer = document.createElement("div");
    overlayContainer.style.position = "absolute";
    overlayContainer.style.top = "0";
    overlayContainer.style.left = "0";
    overlayContainer.style.width = "100%";
    overlayContainer.style.height = "100%";
    overlayContainer.style.pointerEvents = "none";
    overlayContainer.style.zIndex = "1000";
    const topLine = document.createElement("div");
    topLine.style.position = "absolute";
    topLine.style.top = "0";
    topLine.style.left = "0";
    topLine.style.width = "100%";
    topLine.style.height = "2px";
    topLine.style.backgroundColor = "rgba(255, 0, 0, 0.7)";
    overlayContainer.appendChild(topLine);
    const getLayoutInfo = () => {
      const eol = cell.textBuffer.getEOL() === "\n" ? "LF" : "CRLF";
      let scrollTop = "";
      if (cell.layoutInfo.layoutState > 0) {
        scrollTop = `| AbsoluteTopOfElement: ${this._notebookEditor.getAbsoluteTopOfElement(cell)}px`;
      }
      return `cell #${index} (handle: ${cell.handle}) ${scrollTop} | EOL: ${eol}`;
    };
    const label = document.createElement("div");
    label.textContent = getLayoutInfo();
    label.style.position = "absolute";
    label.style.top = "0px";
    label.style.right = "10px";
    label.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
    label.style.color = "white";
    label.style.fontSize = "11px";
    label.style.fontWeight = "bold";
    label.style.padding = "2px 6px";
    label.style.borderRadius = "3px";
    label.style.whiteSpace = "nowrap";
    label.style.pointerEvents = "none";
    label.style.zIndex = "1001";
    overlayContainer.appendChild(label);
    let overlayId = void 0;
    this._notebookEditor.changeCellOverlays((accessor) => {
      overlayId = accessor.addOverlay({
        cell,
        domNode: overlayContainer
      });
    });
    if (overlayId) {
      const updateLayout = () => {
        label.textContent = getLayoutInfo();
        if (overlayId) {
          this._notebookEditor.changeCellOverlays((accessor) => {
            accessor.layoutOverlay(overlayId);
          });
        }
      };
      const disposables = this._cellDisposables[index];
      disposables.add(cell.onDidChangeLayout((e) => {
        updateLayout();
      }));
      disposables.add(cell.textBuffer.onDidChangeContent(() => {
        updateLayout();
      }));
      if (cell.textModel) {
        disposables.add(cell.textModel.onDidChangeContent(() => {
          updateLayout();
        }));
      }
      disposables.add(this._notebookEditor.onDidChangeLayout(() => {
        updateLayout();
      }));
      disposables.add(toDisposable(() => {
        this._notebookEditor.changeCellOverlays((accessor) => {
          if (overlayId) {
            accessor.removeOverlay(overlayId);
          }
        });
      }));
    }
  }
  _removeNotebookOverlay() {
    if (this._notebookOverlayDomNode) {
      this._notebookOverlayDomNode.remove();
      this._notebookOverlayDomNode = void 0;
    }
  }
  _updateListener() {
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    for (let i = 0; i < this._notebookEditor.getLength(); i++) {
      const cell = this._notebookEditor.cellAt(i);
      const disposableStore = new DisposableStore();
      this._cellDisposables.push(disposableStore);
      disposableStore.add(cell.onDidChangeLayout((e) => {
        this._log(cell, e);
      }));
    }
    this._localStore.add(this._notebookEditor.onDidChangeViewCells((e) => {
      [...e.splices].reverse().forEach((splice) => {
        const [start, deleted, newCells] = splice;
        const deletedCells = this._cellDisposables.splice(start, deleted, ...newCells.map((cell) => {
          const disposableStore = new DisposableStore();
          disposableStore.add(cell.onDidChangeLayout((e2) => {
            this._log(cell, e2);
          }));
          return disposableStore;
        }));
        dispose(deletedCells);
      });
      const addedCells = e.splices.reduce((acc, [, , newCells]) => [...acc, ...newCells], []);
      for (let i = 0; i < addedCells.length; i++) {
        const cellIndex = this._notebookEditor.getCellIndex(addedCells[i]);
        if (cellIndex !== void 0) {
          this._createCellOverlay(addedCells[i], cellIndex);
        }
      }
    }));
    const vm = this._notebookEditor.getViewModel();
    let items = [];
    if (this._enabled) {
      items = this._getItemsForCells();
    }
    this._cellStatusItems = vm.deltaCellStatusBarItems(this._cellStatusItems, items);
  }
  _getItemsForCells() {
    const items = [];
    for (let i = 0; i < this._notebookEditor.getLength(); i++) {
      items.push({
        handle: i,
        items: [
          {
            text: `index: ${i}`,
            alignment: CellStatusbarAlignment.Left,
            priority: Number.MAX_SAFE_INTEGER
          }
        ]
      });
    }
    return items;
  }
  dispose() {
    dispose(this._cellDisposables);
    this._removeNotebookOverlay();
    this._localStore.clear();
    super.dispose();
  }
}
TroubleshootController.id = "workbench.notebook.troubleshoot";
registerNotebookContribution(TroubleshootController.id, TroubleshootController);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.toggleLayoutTroubleshoot",
      title: localize2("workbench.notebook.toggleLayoutTroubleshoot", "Toggle Notebook Layout Troubleshoot"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
      return;
    }
    const controller = editor.getContribution(TroubleshootController.id);
    controller?.toggle();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.inspectLayout",
      title: localize2("workbench.notebook.inspectLayout", "Inspect Notebook Layout"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor || !editor.hasModel()) {
      return;
    }
    for (let i = 0; i < editor.getLength(); i++) {
      const cell = editor.cellAt(i);
      console.log(`cell#${cell.handle}`, cell.layoutInfo);
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.clearNotebookEdtitorTypeCache",
      title: localize2("workbench.notebook.clearNotebookEdtitorTypeCache", "Clear Notebook Editor Type Cache"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const notebookService = accessor.get(INotebookService);
    notebookService.clearEditorCache();
  }
});
export {
  TroubleshootController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi90cm91Ymxlc2hvb3QvbGF5b3V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lLCBJQ2VsbFZpZXdNb2RlbCwgSU5vdGVib29rRGVsdGFDZWxsU3RhdHVzQmFySXRlbXMsIElOb3RlYm9va0VkaXRvciwgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyTm90ZWJvb2tDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9ub3RlYm9va0VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi9ub3RlYm9va0VkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBDZWxsU3RhdHVzYmFyQWxpZ25tZW50LCBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUcm91Ymxlc2hvb3RDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyBpZDogc3RyaW5nID0gJ3dvcmtiZW5jaC5ub3RlYm9vay50cm91Ymxlc2hvb3QnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9jZWxsRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZVtdID0gW107XG5cdHByaXZhdGUgX2VuYWJsZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfY2VsbFN0YXR1c0l0ZW1zOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIF9ub3RlYm9va092ZXJsYXlEb21Ob2RlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdH1cblxuXHR0b2dnbGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZW5hYmxlZCA9ICF0aGlzLl9lbmFibGVkO1xuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCkge1xuXHRcdHRoaXMuX2xvY2FsU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLl9jZWxsRGlzcG9zYWJsZXMuZm9yRWFjaChkID0+IGQuZGlzcG9zZSgpKTtcblx0XHR0aGlzLl9jZWxsRGlzcG9zYWJsZXMgPSBbXTtcblx0XHR0aGlzLl9yZW1vdmVOb3RlYm9va092ZXJsYXkoKTtcblxuXHRcdGlmICghdGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVMaXN0ZW5lcigpO1xuXHRcdFx0dGhpcy5fY3JlYXRlTm90ZWJvb2tPdmVybGF5KCk7XG5cdFx0XHR0aGlzLl9jcmVhdGVDZWxsT3ZlcmxheXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sb2coY2VsbDogSUNlbGxWaWV3TW9kZWwsIGU6IGFueSkge1xuXHRcdGlmICh0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHRjb25zdCBvbGRIZWlnaHQgPSAodGhpcy5fbm90ZWJvb2tFZGl0b3IgYXMgTm90ZWJvb2tFZGl0b3JXaWRnZXQpLmdldFZpZXdIZWlnaHQoY2VsbCk7XG5cdFx0XHRjb25zb2xlLmxvZyhgY2VsbCMke2NlbGwuaGFuZGxlfWAsIGUsIGAke29sZEhlaWdodH0gLT4gJHtjZWxsLmxheW91dEluZm8udG90YWxIZWlnaHR9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlQ2VsbE92ZXJsYXlzKCkge1xuXHRcdGlmICghdGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0TGVuZ3RoKCk7IGkrKykge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuX25vdGVib29rRWRpdG9yLmNlbGxBdChpKTtcblx0XHRcdHRoaXMuX2NyZWF0ZUNlbGxPdmVybGF5KGNlbGwsIGkpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBsaXN0ZW5lciBmb3IgbmV3IGNlbGxzXG5cdFx0dGhpcy5fbG9jYWxTdG9yZS5hZGQodGhpcy5fbm90ZWJvb2tFZGl0b3Iub25EaWRDaGFuZ2VWaWV3Q2VsbHMoZSA9PiB7XG5cdFx0XHRjb25zdCBhZGRlZENlbGxzID0gZS5zcGxpY2VzLnJlZHVjZSgoYWNjLCBbLCAsIG5ld0NlbGxzXSkgPT4gWy4uLmFjYywgLi4ubmV3Q2VsbHNdLCBbXSBhcyBJQ2VsbFZpZXdNb2RlbFtdKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYWRkZWRDZWxscy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjZWxsSW5kZXggPSB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgoYWRkZWRDZWxsc1tpXSk7XG5cdFx0XHRcdGlmIChjZWxsSW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX2NyZWF0ZUNlbGxPdmVybGF5KGFkZGVkQ2VsbHNbaV0sIGNlbGxJbmRleCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVOb3RlYm9va092ZXJsYXkoKSB7XG5cdFx0aWYgKCF0aGlzLl9ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGlzdFZpZXdUb3AgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRMYXlvdXRJbmZvKCkubGlzdFZpZXdPZmZzZXRUb3A7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5fbm90ZWJvb2tFZGl0b3Iuc2Nyb2xsVG9wO1xuXG5cdFx0Y29uc3Qgb3ZlcmxheSA9IG4uZGl2KHtcblx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHR0b3A6ICcwJyxcblx0XHRcdFx0bGVmdDogJzAnLFxuXHRcdFx0XHR3aWR0aDogJzEwMCUnLFxuXHRcdFx0XHRoZWlnaHQ6ICcxMDAlJyxcblx0XHRcdFx0cG9pbnRlckV2ZW50czogJ25vbmUnLFxuXHRcdFx0XHR6SW5kZXg6ICcxMDAwJ1xuXHRcdFx0fVxuXHRcdH0sIFtcblx0XHRcdC8vIFRvcCBsaW5lXG5cdFx0XHRuLmRpdih7XG5cdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdFx0dG9wOiBgJHtsaXN0Vmlld1RvcH1weGAsXG5cdFx0XHRcdFx0bGVmdDogJzAnLFxuXHRcdFx0XHRcdHdpZHRoOiAnMTAwJScsXG5cdFx0XHRcdFx0aGVpZ2h0OiAnMnB4Jyxcblx0XHRcdFx0XHRiYWNrZ3JvdW5kQ29sb3I6ICdyZ2JhKDAsIDAsIDI1NSwgMC43KSdcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHQvLyBUZXh0IGxhYmVsIGZvciB0aGUgbm90ZWJvb2sgb3ZlcmxheVxuXHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRcdHRvcDogYCR7bGlzdFZpZXdUb3B9cHhgLFxuXHRcdFx0XHRcdGxlZnQ6ICcxMHB4Jyxcblx0XHRcdFx0XHRiYWNrZ3JvdW5kQ29sb3I6ICdyZ2JhKDAsIDAsIDI1NSwgMC43KScsXG5cdFx0XHRcdFx0Y29sb3I6ICd3aGl0ZScsXG5cdFx0XHRcdFx0Zm9udFNpemU6ICcxMXB4Jyxcblx0XHRcdFx0XHRmb250V2VpZ2h0OiAnYm9sZCcsXG5cdFx0XHRcdFx0cGFkZGluZzogJzJweCA2cHgnLFxuXHRcdFx0XHRcdGJvcmRlclJhZGl1czogJzNweCcsXG5cdFx0XHRcdFx0d2hpdGVTcGFjZTogJ25vd3JhcCcsXG5cdFx0XHRcdFx0cG9pbnRlckV2ZW50czogJ25vbmUnLFxuXHRcdFx0XHRcdHpJbmRleDogJzEwMDEnXG5cdFx0XHRcdH1cblx0XHRcdH0sIFtgU2Nyb2xsVG9wOiAke3Njcm9sbFRvcH1weGBdKVxuXHRcdF0pLmtlZXBVcGRhdGVkKHRoaXMuX3N0b3JlKTtcblxuXHRcdHRoaXMuX25vdGVib29rT3ZlcmxheURvbU5vZGUgPSBvdmVybGF5LmVsZW1lbnQ7XG5cblx0XHRpZiAodGhpcy5fbm90ZWJvb2tPdmVybGF5RG9tTm9kZSkge1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0RG9tTm9kZSgpLmFwcGVuZENoaWxkKHRoaXMuX25vdGVib29rT3ZlcmxheURvbU5vZGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX25vdGVib29rRWRpdG9yLm9uRGlkU2Nyb2xsKCgpID0+IHtcblx0XHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuX25vdGVib29rRWRpdG9yLnNjcm9sbFRvcDtcblx0XHRcdGNvbnN0IGxpc3RWaWV3VG9wID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0TGF5b3V0SW5mbygpLmxpc3RWaWV3T2Zmc2V0VG9wO1xuXG5cdFx0XHRpZiAodGhpcy5fbm90ZWJvb2tPdmVybGF5RG9tTm9kZSkge1xuXHRcdFx0XHQvLyBVcGRhdGUgbGFiZWxcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IHRoaXMuX25vdGVib29rT3ZlcmxheURvbU5vZGUucXVlcnlTZWxlY3RvcignZGl2Om50aC1jaGlsZCgyKScpIGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0XHRpZiAobGFiZWxFbGVtZW50KSB7XG5cdFx0XHRcdFx0bGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gYFNjcm9sbFRvcDogJHtzY3JvbGxUb3B9cHhgO1xuXHRcdFx0XHRcdGxhYmVsRWxlbWVudC5zdHlsZS50b3AgPSBgJHtsaXN0Vmlld1RvcH1weGA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBVcGRhdGUgdG9wIGxpbmVcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRcdGNvbnN0IHRvcExpbmVFbGVtZW50ID0gdGhpcy5fbm90ZWJvb2tPdmVybGF5RG9tTm9kZS5xdWVyeVNlbGVjdG9yKCdkaXY6Zmlyc3QtY2hpbGQnKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdFx0aWYgKHRvcExpbmVFbGVtZW50KSB7XG5cdFx0XHRcdFx0dG9wTGluZUVsZW1lbnQuc3R5bGUudG9wID0gYCR7bGlzdFZpZXdUb3B9cHhgO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlQ2VsbE92ZXJsYXkoY2VsbDogSUNlbGxWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIpIHtcblx0XHRjb25zdCBvdmVybGF5Q29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0b3ZlcmxheUNvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0b3ZlcmxheUNvbnRhaW5lci5zdHlsZS50b3AgPSAnMCc7XG5cdFx0b3ZlcmxheUNvbnRhaW5lci5zdHlsZS5sZWZ0ID0gJzAnO1xuXHRcdG92ZXJsYXlDb250YWluZXIuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdFx0b3ZlcmxheUNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdFx0b3ZlcmxheUNvbnRhaW5lci5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ25vbmUnO1xuXHRcdG92ZXJsYXlDb250YWluZXIuc3R5bGUuekluZGV4ID0gJzEwMDAnO1xuXHRcdGNvbnN0IHRvcExpbmUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0b3BMaW5lLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHR0b3BMaW5lLnN0eWxlLnRvcCA9ICcwJztcblx0XHR0b3BMaW5lLnN0eWxlLmxlZnQgPSAnMCc7XG5cdFx0dG9wTGluZS5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0XHR0b3BMaW5lLnN0eWxlLmhlaWdodCA9ICcycHgnO1xuXHRcdHRvcExpbmUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3JnYmEoMjU1LCAwLCAwLCAwLjcpJztcblx0XHRvdmVybGF5Q29udGFpbmVyLmFwcGVuZENoaWxkKHRvcExpbmUpO1xuXG5cdFx0Y29uc3QgZ2V0TGF5b3V0SW5mbyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGVvbCA9IGNlbGwudGV4dEJ1ZmZlci5nZXRFT0woKSA9PT0gJ1xcbicgPyAnTEYnIDogJ0NSTEYnO1xuXHRcdFx0bGV0IHNjcm9sbFRvcCA9ICcnO1xuXHRcdFx0aWYgKGNlbGwubGF5b3V0SW5mby5sYXlvdXRTdGF0ZSA+IDApIHtcblx0XHRcdFx0c2Nyb2xsVG9wID0gYHwgQWJzb2x1dGVUb3BPZkVsZW1lbnQ6ICR7dGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0QWJzb2x1dGVUb3BPZkVsZW1lbnQoY2VsbCl9cHhgO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGBjZWxsICMke2luZGV4fSAoaGFuZGxlOiAke2NlbGwuaGFuZGxlfSkgJHtzY3JvbGxUb3B9IHwgRU9MOiAke2VvbH1gO1xuXHRcdH07XG5cdFx0Y29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGdldExheW91dEluZm8oKTtcblx0XHRsYWJlbC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0bGFiZWwuc3R5bGUudG9wID0gJzBweCc7XG5cdFx0bGFiZWwuc3R5bGUucmlnaHQgPSAnMTBweCc7XG5cdFx0bGFiZWwuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3JnYmEoMjU1LCAwLCAwLCAwLjUpJztcblx0XHRsYWJlbC5zdHlsZS5jb2xvciA9ICd3aGl0ZSc7XG5cdFx0bGFiZWwuc3R5bGUuZm9udFNpemUgPSAnMTFweCc7XG5cdFx0bGFiZWwuc3R5bGUuZm9udFdlaWdodCA9ICdib2xkJztcblx0XHRsYWJlbC5zdHlsZS5wYWRkaW5nID0gJzJweCA2cHgnO1xuXHRcdGxhYmVsLnN0eWxlLmJvcmRlclJhZGl1cyA9ICczcHgnO1xuXHRcdGxhYmVsLnN0eWxlLndoaXRlU3BhY2UgPSAnbm93cmFwJztcblx0XHRsYWJlbC5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ25vbmUnO1xuXHRcdGxhYmVsLnN0eWxlLnpJbmRleCA9ICcxMDAxJztcblx0XHRvdmVybGF5Q29udGFpbmVyLmFwcGVuZENoaWxkKGxhYmVsKTtcblxuXHRcdGxldCBvdmVybGF5SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5jaGFuZ2VDZWxsT3ZlcmxheXMoKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRvdmVybGF5SWQgPSBhY2Nlc3Nvci5hZGRPdmVybGF5KHtcblx0XHRcdFx0Y2VsbCxcblx0XHRcdFx0ZG9tTm9kZTogb3ZlcmxheUNvbnRhaW5lclxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRpZiAob3ZlcmxheUlkKSB7XG5cblx0XHRcdC8vIFVwZGF0ZSBvdmVybGF5IHdoZW4gbGF5b3V0IGNoYW5nZXNcblx0XHRcdGNvbnN0IHVwZGF0ZUxheW91dCA9ICgpID0+IHtcblx0XHRcdFx0Ly8gVXBkYXRlIGxhYmVsIHRleHRcblx0XHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSBnZXRMYXlvdXRJbmZvKCk7XG5cblx0XHRcdFx0Ly8gUmVmcmVzaCB0aGUgb3ZlcmxheSBwb3NpdGlvblxuXHRcdFx0XHRpZiAob3ZlcmxheUlkKSB7XG5cdFx0XHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IuY2hhbmdlQ2VsbE92ZXJsYXlzKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRcdFx0YWNjZXNzb3IubGF5b3V0T3ZlcmxheShvdmVybGF5SWQhKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSB0aGlzLl9jZWxsRGlzcG9zYWJsZXNbaW5kZXhdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNlbGwub25EaWRDaGFuZ2VMYXlvdXQoKGUpID0+IHtcblx0XHRcdFx0dXBkYXRlTGF5b3V0KCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY2VsbC50ZXh0QnVmZmVyLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHRcdHVwZGF0ZUxheW91dCgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0aWYgKGNlbGwudGV4dE1vZGVsKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChjZWxsLnRleHRNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHRcdHVwZGF0ZUxheW91dCgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fbm90ZWJvb2tFZGl0b3Iub25EaWRDaGFuZ2VMYXlvdXQoKCkgPT4ge1xuXHRcdFx0XHR1cGRhdGVMYXlvdXQoKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5jaGFuZ2VDZWxsT3ZlcmxheXMoKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG92ZXJsYXlJZCkge1xuXHRcdFx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlT3ZlcmxheShvdmVybGF5SWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVOb3RlYm9va092ZXJsYXkoKSB7XG5cdFx0aWYgKHRoaXMuX25vdGVib29rT3ZlcmxheURvbU5vZGUpIHtcblx0XHRcdHRoaXMuX25vdGVib29rT3ZlcmxheURvbU5vZGUucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLl9ub3RlYm9va092ZXJsYXlEb21Ob2RlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUxpc3RlbmVyKCkge1xuXHRcdGlmICghdGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0TGVuZ3RoKCk7IGkrKykge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuX25vdGVib29rRWRpdG9yLmNlbGxBdChpKTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0dGhpcy5fY2VsbERpc3Bvc2FibGVzLnB1c2goZGlzcG9zYWJsZVN0b3JlKTtcblx0XHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQoY2VsbC5vbkRpZENoYW5nZUxheW91dChlID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nKGNlbGwsIGUpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX25vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlVmlld0NlbGxzKGUgPT4ge1xuXHRcdFx0Wy4uLmUuc3BsaWNlc10ucmV2ZXJzZSgpLmZvckVhY2goc3BsaWNlID0+IHtcblx0XHRcdFx0Y29uc3QgW3N0YXJ0LCBkZWxldGVkLCBuZXdDZWxsc10gPSBzcGxpY2U7XG5cdFx0XHRcdGNvbnN0IGRlbGV0ZWRDZWxscyA9IHRoaXMuX2NlbGxEaXNwb3NhYmxlcy5zcGxpY2Uoc3RhcnQsIGRlbGV0ZWQsIC4uLm5ld0NlbGxzLm1hcChjZWxsID0+IHtcblx0XHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChjZWxsLm9uRGlkQ2hhbmdlTGF5b3V0KGUgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nKGNlbGwsIGUpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRyZXR1cm4gZGlzcG9zYWJsZVN0b3JlO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0ZGlzcG9zZShkZWxldGVkQ2VsbHMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEFkZCB0aGUgb3ZlcmxheXNcblx0XHRcdGNvbnN0IGFkZGVkQ2VsbHMgPSBlLnNwbGljZXMucmVkdWNlKChhY2MsIFssICwgbmV3Q2VsbHNdKSA9PiBbLi4uYWNjLCAuLi5uZXdDZWxsc10sIFtdIGFzIElDZWxsVmlld01vZGVsW10pO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhZGRlZENlbGxzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGxJbmRleCA9IHRoaXMuX25vdGVib29rRWRpdG9yLmdldENlbGxJbmRleChhZGRlZENlbGxzW2ldKTtcblx0XHRcdFx0aWYgKGNlbGxJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fY3JlYXRlQ2VsbE92ZXJsYXkoYWRkZWRDZWxsc1tpXSwgY2VsbEluZGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHZtID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0Vmlld01vZGVsKCk7XG5cdFx0bGV0IGl0ZW1zOiBJTm90ZWJvb2tEZWx0YUNlbGxTdGF0dXNCYXJJdGVtc1tdID0gW107XG5cblx0XHRpZiAodGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0aXRlbXMgPSB0aGlzLl9nZXRJdGVtc0ZvckNlbGxzKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2VsbFN0YXR1c0l0ZW1zID0gdm0uZGVsdGFDZWxsU3RhdHVzQmFySXRlbXModGhpcy5fY2VsbFN0YXR1c0l0ZW1zLCBpdGVtcyk7XG5cblx0fVxuXG5cdHByaXZhdGUgX2dldEl0ZW1zRm9yQ2VsbHMoKTogSU5vdGVib29rRGVsdGFDZWxsU3RhdHVzQmFySXRlbXNbXSB7XG5cdFx0Y29uc3QgaXRlbXM6IElOb3RlYm9va0RlbHRhQ2VsbFN0YXR1c0Jhckl0ZW1zW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX25vdGVib29rRWRpdG9yLmdldExlbmd0aCgpOyBpKyspIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRoYW5kbGU6IGksXG5cdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dGV4dDogYGluZGV4OiAke2l9YCxcblx0XHRcdFx0XHRcdGFsaWdubWVudDogQ2VsbFN0YXR1c2JhckFsaWdubWVudC5MZWZ0LFxuXHRcdFx0XHRcdFx0cHJpb3JpdHk6IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1cblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRkaXNwb3NlKHRoaXMuX2NlbGxEaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy5fcmVtb3ZlTm90ZWJvb2tPdmVybGF5KCk7XG5cdFx0dGhpcy5fbG9jYWxTdG9yZS5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5yZWdpc3Rlck5vdGVib29rQ29udHJpYnV0aW9uKFRyb3VibGVzaG9vdENvbnRyb2xsZXIuaWQsIFRyb3VibGVzaG9vdENvbnRyb2xsZXIpO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay50b2dnbGVMYXlvdXRUcm91Ymxlc2hvb3QnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLm5vdGVib29rLnRvZ2dsZUxheW91dFRyb3VibGVzaG9vdCcsIFwiVG9nZ2xlIE5vdGVib29rIExheW91dCBUcm91Ymxlc2hvb3RcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxUcm91Ymxlc2hvb3RDb250cm9sbGVyPihUcm91Ymxlc2hvb3RDb250cm9sbGVyLmlkKTtcblx0XHRjb250cm9sbGVyPy50b2dnbGUoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVib29rLmluc3BlY3RMYXlvdXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLm5vdGVib29rLmluc3BlY3RMYXlvdXQnLCBcIkluc3BlY3QgTm90ZWJvb2sgTGF5b3V0XCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblxuXHRcdGlmICghZWRpdG9yIHx8ICFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZWRpdG9yLmdldExlbmd0aCgpOyBpKyspIHtcblx0XHRcdGNvbnN0IGNlbGwgPSBlZGl0b3IuY2VsbEF0KGkpO1xuXHRcdFx0Y29uc29sZS5sb2coYGNlbGwjJHtjZWxsLmhhbmRsZX1gLCBjZWxsLmxheW91dEluZm8pO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVib29rLmNsZWFyTm90ZWJvb2tFZHRpdG9yVHlwZUNhY2hlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5ub3RlYm9vay5jbGVhck5vdGVib29rRWR0aXRvclR5cGVDYWNoZScsIFwiQ2xlYXIgTm90ZWJvb2sgRWRpdG9yIFR5cGUgQ2FjaGVcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RlYm9va1NlcnZpY2UpO1xuXHRcdG5vdGVib29rU2VydmljZS5jbGVhckVkaXRvckNhY2hlKCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxZQUFZLGlCQUFpQixTQUFTLG9CQUFvQjtBQUNuRSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQVMsdUJBQXVCO0FBRXpDLFNBQVMsdUNBQXVJO0FBQ2hKLFNBQVMsb0NBQW9DO0FBRTdDLFNBQVMsOEJBQTBEO0FBQ25FLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsU0FBUztBQUVYLE1BQU0sK0JBQStCLFdBQWtEO0FBQUEsRUFTN0YsWUFBNkIsaUJBQWtDO0FBQzlELFVBQU07QUFEc0I7QUFON0IsU0FBaUIsY0FBYyxLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQUNuRSxTQUFRLG1CQUFzQyxDQUFDO0FBQy9DLFNBQVEsV0FBb0I7QUFDNUIsU0FBUSxtQkFBNkIsQ0FBQztBQU1yQyxTQUFLLFVBQVUsS0FBSyxnQkFBZ0IsaUJBQWlCLE1BQU07QUFDMUQsV0FBSyxRQUFRO0FBQUEsSUFDZCxDQUFDLENBQUM7QUFFRixTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEs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
