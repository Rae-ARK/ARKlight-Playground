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
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { MenuWorkbenchToolBar, HiddenItemStrategy } from "../../../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { CellEditState } from "../../../../notebook/browser/notebookBrowser.js";
import { CellKind } from "../../../../notebook/common/notebookCommon.js";
let OverlayToolbarDecorator = class extends Disposable {
  constructor(notebookEditor, notebookModel, instantiationService, accessibilitySignalService) {
    super();
    this.notebookEditor = notebookEditor;
    this.notebookModel = notebookModel;
    this.instantiationService = instantiationService;
    this.accessibilitySignalService = accessibilitySignalService;
    this._timeout = void 0;
    this.overlayDisposables = this._register(new DisposableStore());
  }
  decorate(changes) {
    if (this._timeout !== void 0) {
      clearTimeout(this._timeout);
    }
    this._timeout = setTimeout(() => {
      this._timeout = void 0;
      this.createMarkdownPreviewToolbars(changes);
    }, 100);
  }
  createMarkdownPreviewToolbars(changes) {
    this.overlayDisposables.clear();
    const accessibilitySignalService = this.accessibilitySignalService;
    const editor = this.notebookEditor;
    for (const change of changes) {
      const cellViewModel = this.getCellViewModel(change);
      if (!cellViewModel || cellViewModel.cellKind !== CellKind.Markup) {
        continue;
      }
      const toolbarContainer = document.createElement("div");
      let overlayId = void 0;
      editor.changeCellOverlays((accessor) => {
        toolbarContainer.style.right = "44px";
        overlayId = accessor.addOverlay({
          cell: cellViewModel,
          domNode: toolbarContainer
        });
      });
      const removeOverlay = () => {
        editor.changeCellOverlays((accessor) => {
          if (overlayId) {
            accessor.removeOverlay(overlayId);
          }
        });
      };
      this.overlayDisposables.add({ dispose: removeOverlay });
      const toolbar = document.createElement("div");
      toolbarContainer.appendChild(toolbar);
      toolbar.className = "chat-diff-change-content-widget";
      toolbar.classList.add("hover");
      toolbar.style.position = "relative";
      toolbar.style.top = "18px";
      toolbar.style.zIndex = "10";
      toolbar.style.display = cellViewModel.getEditState() === CellEditState.Editing ? "none" : "block";
      this.overlayDisposables.add(cellViewModel.onDidChangeState((e) => {
        if (e.editStateChanged) {
          if (cellViewModel.getEditState() === CellEditState.Editing) {
            toolbar.style.display = "none";
          } else {
            toolbar.style.display = "block";
          }
        }
      }));
      const scopedInstaService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.notebookEditor.scopedContextKeyService])));
      const toolbarWidget = scopedInstaService.createInstance(MenuWorkbenchToolBar, toolbar, MenuId.ChatEditingEditorHunk, {
        telemetrySource: "chatEditingNotebookHunk",
        hiddenItemStrategy: HiddenItemStrategy.NoHide,
        toolbarOptions: { primaryGroup: () => true },
        menuOptions: {
          renderShortTitle: true,
          arg: {
            async accept() {
              accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
              removeOverlay();
              toolbarWidget.dispose();
              for (const singleChange of change.diff.get().changes) {
                await change.keep(singleChange);
              }
              return true;
            },
            async reject() {
              accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
              removeOverlay();
              toolbarWidget.dispose();
              for (const singleChange of change.diff.get().changes) {
                await change.undo(singleChange);
              }
              return true;
            }
          }
        },
        actionViewItemProvider: (action, options) => {
          if (!action.class) {
            return new class extends ActionViewItem {
              constructor() {
                super(void 0, action, { ...options, keybindingNotRenderedWithLabel: true, icon: false, label: true });
              }
            }();
          }
          return void 0;
        }
      });
      this.overlayDisposables.add(toolbarWidget);
    }
  }
  getCellViewModel(change) {
    if (change.type === "delete" || change.modifiedCellIndex === void 0) {
      return void 0;
    }
    const cell = this.notebookModel.cells[change.modifiedCellIndex];
    const cellViewModel = this.notebookEditor.getViewModel()?.viewCells.find((c) => c.handle === cell.handle);
    return cellViewModel;
  }
  dispose() {
    super.dispose();
    if (this._timeout !== void 0) {
      clearTimeout(this._timeout);
    }
  }
};
OverlayToolbarDecorator = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IAccessibilitySignalService)
], OverlayToolbarDecorator);
export {
  OverlayToolbarDecorator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9ub3RlYm9vay9vdmVybGF5VG9vbGJhckRlY29yYXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciwgSGlkZGVuSXRlbVN0cmF0ZWd5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFN0YXRlLCBJTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1RleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9tb2RlbC9ub3RlYm9va1RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTW9kaWZpZWRGaWxlRW50cnlDaGFuZ2VIdW5rIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDZWxsRGlmZkluZm8gfSBmcm9tICcuL25vdGVib29rQ2VsbENoYW5nZXMuanMnO1xuXG5cbmV4cG9ydCBjbGFzcyBPdmVybGF5VG9vbGJhckRlY29yYXRvciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX3RpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgb3ZlcmxheURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RlYm9va01vZGVsOiBOb3RlYm9va1RleHRNb2RlbCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGRlY29yYXRlKGNoYW5nZXM6IElDZWxsRGlmZkluZm9bXSkge1xuXHRcdGlmICh0aGlzLl90aW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl90aW1lb3V0KTtcblx0XHR9XG5cdFx0dGhpcy5fdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuY3JlYXRlTWFya2Rvd25QcmV2aWV3VG9vbGJhcnMoY2hhbmdlcyk7XG5cdFx0fSwgMTAwKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTWFya2Rvd25QcmV2aWV3VG9vbGJhcnMoY2hhbmdlczogSUNlbGxEaWZmSW5mb1tdKSB7XG5cdFx0dGhpcy5vdmVybGF5RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlID0gdGhpcy5hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLm5vdGVib29rRWRpdG9yO1xuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRcdGNvbnN0IGNlbGxWaWV3TW9kZWwgPSB0aGlzLmdldENlbGxWaWV3TW9kZWwoY2hhbmdlKTtcblxuXHRcdFx0aWYgKCFjZWxsVmlld01vZGVsIHx8IGNlbGxWaWV3TW9kZWwuY2VsbEtpbmQgIT09IENlbGxLaW5kLk1hcmt1cCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRvb2xiYXJDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRcdFx0bGV0IG92ZXJsYXlJZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0ZWRpdG9yLmNoYW5nZUNlbGxPdmVybGF5cygoYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0dG9vbGJhckNvbnRhaW5lci5zdHlsZS5yaWdodCA9ICc0NHB4Jztcblx0XHRcdFx0b3ZlcmxheUlkID0gYWNjZXNzb3IuYWRkT3ZlcmxheSh7XG5cdFx0XHRcdFx0Y2VsbDogY2VsbFZpZXdNb2RlbCxcblx0XHRcdFx0XHRkb21Ob2RlOiB0b29sYmFyQ29udGFpbmVyLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZW1vdmVPdmVybGF5ID0gKCkgPT4ge1xuXHRcdFx0XHRlZGl0b3IuY2hhbmdlQ2VsbE92ZXJsYXlzKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRpZiAob3ZlcmxheUlkKSB7XG5cdFx0XHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVPdmVybGF5KG92ZXJsYXlJZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cblx0XHRcdHRoaXMub3ZlcmxheURpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6IHJlbW92ZU92ZXJsYXkgfSk7XG5cblx0XHRcdGNvbnN0IHRvb2xiYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHRvb2xiYXJDb250YWluZXIuYXBwZW5kQ2hpbGQodG9vbGJhcik7XG5cdFx0XHR0b29sYmFyLmNsYXNzTmFtZSA9ICdjaGF0LWRpZmYtY2hhbmdlLWNvbnRlbnQtd2lkZ2V0Jztcblx0XHRcdHRvb2xiYXIuY2xhc3NMaXN0LmFkZCgnaG92ZXInKTsgLy8gU2hvdyBieSBkZWZhdWx0XG5cdFx0XHR0b29sYmFyLnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblx0XHRcdHRvb2xiYXIuc3R5bGUudG9wID0gJzE4cHgnO1xuXHRcdFx0dG9vbGJhci5zdHlsZS56SW5kZXggPSAnMTAnO1xuXHRcdFx0dG9vbGJhci5zdHlsZS5kaXNwbGF5ID0gY2VsbFZpZXdNb2RlbC5nZXRFZGl0U3RhdGUoKSA9PT0gQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nID8gJ25vbmUnIDogJ2Jsb2NrJztcblxuXHRcdFx0dGhpcy5vdmVybGF5RGlzcG9zYWJsZXMuYWRkKGNlbGxWaWV3TW9kZWwub25EaWRDaGFuZ2VTdGF0ZSgoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5lZGl0U3RhdGVDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0aWYgKGNlbGxWaWV3TW9kZWwuZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuRWRpdGluZykge1xuXHRcdFx0XHRcdFx0dG9vbGJhci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0b29sYmFyLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBzY29wZWRJbnN0YVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLm5vdGVib29rRWRpdG9yLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblx0XHRcdGNvbnN0IHRvb2xiYXJXaWRnZXQgPSBzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHRvb2xiYXIsIE1lbnVJZC5DaGF0RWRpdGluZ0VkaXRvckh1bmssIHtcblx0XHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnY2hhdEVkaXRpbmdOb3RlYm9va0h1bmsnLFxuXHRcdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSB9LFxuXHRcdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRcdHJlbmRlclNob3J0VGl0bGU6IHRydWUsXG5cdFx0XHRcdFx0YXJnOiB7XG5cdFx0XHRcdFx0XHRhc3luYyBhY2NlcHQoKSB7XG5cdFx0XHRcdFx0XHRcdGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5lZGl0c0tlcHQsIHsgYWxsb3dNYW55SW5QYXJhbGxlbDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdFx0cmVtb3ZlT3ZlcmxheSgpO1xuXHRcdFx0XHRcdFx0XHR0b29sYmFyV2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBzaW5nbGVDaGFuZ2Ugb2YgY2hhbmdlLmRpZmYuZ2V0KCkuY2hhbmdlcykge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IGNoYW5nZS5rZWVwKHNpbmdsZUNoYW5nZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0YXN5bmMgcmVqZWN0KCkge1xuXHRcdFx0XHRcdFx0XHRhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuZWRpdHNVbmRvbmUsIHsgYWxsb3dNYW55SW5QYXJhbGxlbDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdFx0cmVtb3ZlT3ZlcmxheSgpO1xuXHRcdFx0XHRcdFx0XHR0b29sYmFyV2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBzaW5nbGVDaGFuZ2Ugb2YgY2hhbmdlLmRpZmYuZ2V0KCkuY2hhbmdlcykge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IGNoYW5nZS51bmRvKHNpbmdsZUNoYW5nZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSU1vZGlmaWVkRmlsZUVudHJ5Q2hhbmdlSHVuayxcblx0XHRcdFx0fSxcblx0XHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRcdGlmICghYWN0aW9uLmNsYXNzKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgQWN0aW9uVmlld0l0ZW0ge1xuXHRcdFx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdFx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBrZXliaW5kaW5nTm90UmVuZGVyZWRXaXRoTGFiZWw6IHRydWUgLyogaGlkZSBrZXliaW5kaW5nIGZvciBhY3Rpb25zIHdpdGhvdXQgaWNvbiAqLywgaWNvbjogZmFsc2UsIGxhYmVsOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5vdmVybGF5RGlzcG9zYWJsZXMuYWRkKHRvb2xiYXJXaWRnZXQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0Q2VsbFZpZXdNb2RlbChjaGFuZ2U6IElDZWxsRGlmZkluZm8pIHtcblx0XHRpZiAoY2hhbmdlLnR5cGUgPT09ICdkZWxldGUnIHx8IGNoYW5nZS5tb2RpZmllZENlbGxJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjZWxsID0gdGhpcy5ub3RlYm9va01vZGVsLmNlbGxzW2NoYW5nZS5tb2RpZmllZENlbGxJbmRleF07XG5cdFx0Y29uc3QgY2VsbFZpZXdNb2RlbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Vmlld01vZGVsKCk/LnZpZXdDZWxscy5maW5kKGMgPT4gYy5oYW5kbGUgPT09IGNlbGwuaGFuZGxlKTtcblx0XHRyZXR1cm4gY2VsbFZpZXdNb2RlbDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdGlmICh0aGlzLl90aW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl90aW1lb3V0KTtcblx0XHR9XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMscUJBQXFCLG1DQUFtQztBQUNqRSxTQUFTLHNCQUFzQiwwQkFBMEI7QUFDekQsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXNDO0FBRS9DLFNBQVMsZ0JBQWdCO0FBS2xCLElBQU0sMEJBQU4sY0FBc0MsV0FBVztB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
