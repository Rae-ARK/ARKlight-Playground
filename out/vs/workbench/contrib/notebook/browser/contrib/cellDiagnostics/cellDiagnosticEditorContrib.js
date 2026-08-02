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
import { Disposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { IMarkerService } from "../../../../../../platform/markers/common/markers.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../../common/notebookExecutionStateService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { CellKind, NotebookSetting } from "../../../common/notebookCommon.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
import { CodeCellViewModel } from "../../viewModel/codeCellViewModel.js";
import { Event } from "../../../../../../base/common/event.js";
import { IChatAgentService } from "../../../../chat/common/participants/chatAgents.js";
import { ChatAgentLocation } from "../../../../chat/common/constants.js";
import { autorun } from "../../../../../../base/common/observable.js";
let CellDiagnostics = class extends Disposable {
  constructor(notebookEditor, notebookExecutionStateService, markerService, chatAgentService, configurationService) {
    super();
    this.notebookEditor = notebookEditor;
    this.notebookExecutionStateService = notebookExecutionStateService;
    this.markerService = markerService;
    this.chatAgentService = chatAgentService;
    this.configurationService = configurationService;
    this.enabled = false;
    this.listening = false;
    this.diagnosticsByHandle = /* @__PURE__ */ new Map();
    this.updateEnabled();
    this._register(chatAgentService.onDidChangeAgents(() => this.updateEnabled()));
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.cellFailureDiagnostics)) {
        this.updateEnabled();
      }
    }));
  }
  hasNotebookAgent() {
    const agents = this.chatAgentService.getAgents();
    return !!agents.find((agent) => agent.locations.includes(ChatAgentLocation.Notebook));
  }
  updateEnabled() {
    const settingEnabled = this.configurationService.getValue(NotebookSetting.cellFailureDiagnostics);
    if (this.enabled && (!settingEnabled || !this.hasNotebookAgent())) {
      this.enabled = false;
      this.clearAll();
    } else if (!this.enabled && settingEnabled && this.hasNotebookAgent()) {
      this.enabled = true;
      if (!this.listening) {
        this.listening = true;
        this._register(Event.accumulate(
          this.notebookExecutionStateService.onDidChangeExecution,
          200
        )((e) => this.handleChangeExecutionState(e)));
      }
    }
  }
  handleChangeExecutionState(changes) {
    if (!this.enabled) {
      return;
    }
    const handled = /* @__PURE__ */ new Set();
    for (const e of changes.reverse()) {
      const notebookUri = this.notebookEditor.textModel?.uri;
      if (e.type === NotebookExecutionType.cell && notebookUri && e.affectsNotebook(notebookUri) && !handled.has(e.cellHandle)) {
        handled.add(e.cellHandle);
        if (!!e.changed) {
          this.clear(e.cellHandle);
        } else {
          this.setDiagnostics(e.cellHandle);
        }
      }
    }
  }
  clearAll() {
    for (const handle of this.diagnosticsByHandle.keys()) {
      this.clear(handle);
    }
  }
  clear(cellHandle) {
    const disposables = this.diagnosticsByHandle.get(cellHandle);
    if (disposables) {
      for (const disposable of disposables) {
        disposable.dispose();
      }
      this.diagnosticsByHandle.delete(cellHandle);
    }
  }
  setDiagnostics(cellHandle) {
    if (this.diagnosticsByHandle.has(cellHandle)) {
      return;
    }
    const cell = this.notebookEditor.getCellByHandle(cellHandle);
    if (!cell || cell.cellKind !== CellKind.Code) {
      return;
    }
    const metadata = cell.model.internalMetadata;
    if (cell instanceof CodeCellViewModel && !metadata.lastRunSuccess && metadata?.error?.location) {
      const disposables = [];
      const errorLabel = metadata.error.name ? `${metadata.error.name}: ${metadata.error.message}` : metadata.error.message;
      const marker = this.createMarkerData(errorLabel, metadata.error.location);
      this.markerService.changeOne(CellDiagnostics.ID, cell.uri, [marker]);
      disposables.push(toDisposable(() => this.markerService.changeOne(CellDiagnostics.ID, cell.uri, [])));
      cell.executionErrorDiagnostic.set(metadata.error, void 0);
      disposables.push(toDisposable(() => cell.executionErrorDiagnostic.set(void 0, void 0)));
      disposables.push(autorun((r) => {
        if (!cell.executionErrorDiagnostic.read(r)) {
          this.clear(cellHandle);
        }
      }));
      disposables.push(cell.model.onDidChangeOutputs(() => {
        if (cell.model.outputs.length === 0) {
          this.clear(cellHandle);
        }
      }));
      disposables.push(cell.model.onDidChangeContent(() => {
        this.clear(cellHandle);
      }));
      this.diagnosticsByHandle.set(cellHandle, disposables);
    }
  }
  createMarkerData(message, location) {
    return {
      severity: 8,
      message,
      startLineNumber: location.startLineNumber + 1,
      startColumn: location.startColumn + 1,
      endLineNumber: location.endLineNumber + 1,
      endColumn: location.endColumn + 1,
      source: "Cell Execution Error"
    };
  }
  dispose() {
    super.dispose();
    this.clearAll();
  }
};
CellDiagnostics.ID = "workbench.notebook.cellDiagnostics";
CellDiagnostics = __decorateClass([
  __decorateParam(1, INotebookExecutionStateService),
  __decorateParam(2, IMarkerService),
  __decorateParam(3, IChatAgentService),
  __decorateParam(4, IConfigurationService)
], CellDiagnostics);
registerNotebookContribution(CellDiagnostics.ID, CellDiagnostics);
export {
  CellDiagnostics
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9jZWxsRGlhZ25vc3RpY3MvY2VsbERpYWdub3N0aWNFZGl0b3JDb250cmliLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGF0YSwgSU1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJQ2VsbEV4ZWN1dGlvblN0YXRlQ2hhbmdlZEV2ZW50LCBJRXhlY3V0aW9uU3RhdGVDaGFuZ2VkRXZlbnQsIElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSwgTm90ZWJvb2tFeGVjdXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIE5vdGVib29rU2V0dGluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3IsIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck5vdGVib29rQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tFZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvZGVDZWxsVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL2NvZGVDZWxsVmlld01vZGVsLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDZWxsRGlhZ25vc3RpY3MgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2gubm90ZWJvb2suY2VsbERpYWdub3N0aWNzJztcblxuXHRwcml2YXRlIGVuYWJsZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBsaXN0ZW5pbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBkaWFnbm9zdGljc0J5SGFuZGxlOiBNYXA8bnVtYmVyLCBJRGlzcG9zYWJsZVtdPiA9IG5ldyBNYXAoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsXG5cdFx0QElNYXJrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudXBkYXRlRW5hYmxlZCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdEFnZW50U2VydmljZS5vbkRpZENoYW5nZUFnZW50cygoKSA9PiB0aGlzLnVwZGF0ZUVuYWJsZWQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmNlbGxGYWlsdXJlRGlhZ25vc3RpY3MpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRW5hYmxlZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgaGFzTm90ZWJvb2tBZ2VudCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBhZ2VudHMgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWdlbnRzKCk7XG5cdFx0cmV0dXJuICEhYWdlbnRzLmZpbmQoYWdlbnQgPT4gYWdlbnQubG9jYXRpb25zLmluY2x1ZGVzKENoYXRBZ2VudExvY2F0aW9uLk5vdGVib29rKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUVuYWJsZWQoKSB7XG5cdFx0Y29uc3Qgc2V0dGluZ0VuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKE5vdGVib29rU2V0dGluZy5jZWxsRmFpbHVyZURpYWdub3N0aWNzKTtcblx0XHRpZiAodGhpcy5lbmFibGVkICYmICghc2V0dGluZ0VuYWJsZWQgfHwgIXRoaXMuaGFzTm90ZWJvb2tBZ2VudCgpKSkge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLmNsZWFyQWxsKCk7XG5cdFx0fSBlbHNlIGlmICghdGhpcy5lbmFibGVkICYmIHNldHRpbmdFbmFibGVkICYmIHRoaXMuaGFzTm90ZWJvb2tBZ2VudCgpKSB7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0aWYgKCF0aGlzLmxpc3RlbmluZykge1xuXHRcdFx0XHR0aGlzLmxpc3RlbmluZyA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFjY3VtdWxhdGU8SUNlbGxFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudCB8IElFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudD4oXG5cdFx0XHRcdFx0dGhpcy5ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5vbkRpZENoYW5nZUV4ZWN1dGlvbiwgMjAwXG5cdFx0XHRcdCkoKGUpID0+IHRoaXMuaGFuZGxlQ2hhbmdlRXhlY3V0aW9uU3RhdGUoZSkpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUNoYW5nZUV4ZWN1dGlvblN0YXRlKGNoYW5nZXM6IChJQ2VsbEV4ZWN1dGlvblN0YXRlQ2hhbmdlZEV2ZW50IHwgSUV4ZWN1dGlvblN0YXRlQ2hhbmdlZEV2ZW50KVtdKSB7XG5cdFx0aWYgKCF0aGlzLmVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoYW5kbGVkID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0Zm9yIChjb25zdCBlIG9mIGNoYW5nZXMucmV2ZXJzZSgpKSB7XG5cblx0XHRcdGNvbnN0IG5vdGVib29rVXJpID0gdGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWw/LnVyaTtcblx0XHRcdGlmIChlLnR5cGUgPT09IE5vdGVib29rRXhlY3V0aW9uVHlwZS5jZWxsICYmIG5vdGVib29rVXJpICYmIGUuYWZmZWN0c05vdGVib29rKG5vdGVib29rVXJpKSAmJiAhaGFuZGxlZC5oYXMoZS5jZWxsSGFuZGxlKSkge1xuXHRcdFx0XHRoYW5kbGVkLmFkZChlLmNlbGxIYW5kbGUpO1xuXHRcdFx0XHRpZiAoISFlLmNoYW5nZWQpIHtcblx0XHRcdFx0XHQvLyBjZWxsIGlzIHJ1bm5pbmdcblx0XHRcdFx0XHR0aGlzLmNsZWFyKGUuY2VsbEhhbmRsZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5zZXREaWFnbm9zdGljcyhlLmNlbGxIYW5kbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckFsbCgpIHtcblx0XHRmb3IgKGNvbnN0IGhhbmRsZSBvZiB0aGlzLmRpYWdub3N0aWNzQnlIYW5kbGUua2V5cygpKSB7XG5cdFx0XHR0aGlzLmNsZWFyKGhhbmRsZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNsZWFyKGNlbGxIYW5kbGU6IG51bWJlcikge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5kaWFnbm9zdGljc0J5SGFuZGxlLmdldChjZWxsSGFuZGxlKTtcblx0XHRpZiAoZGlzcG9zYWJsZXMpIHtcblx0XHRcdGZvciAoY29uc3QgZGlzcG9zYWJsZSBvZiBkaXNwb3NhYmxlcykge1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZGlhZ25vc3RpY3NCeUhhbmRsZS5kZWxldGUoY2VsbEhhbmRsZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXREaWFnbm9zdGljcyhjZWxsSGFuZGxlOiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5kaWFnbm9zdGljc0J5SGFuZGxlLmhhcyhjZWxsSGFuZGxlKSkge1xuXHRcdFx0Ly8gbXVsdGlwbGUgZGlhZ25vc3RpY3MgcGVyIGNlbGwgbm90IHN1cHBvcnRlZCBmb3Igbm93XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SGFuZGxlKGNlbGxIYW5kbGUpO1xuXHRcdGlmICghY2VsbCB8fCBjZWxsLmNlbGxLaW5kICE9PSBDZWxsS2luZC5Db2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBjZWxsLm1vZGVsLmludGVybmFsTWV0YWRhdGE7XG5cdFx0aWYgKGNlbGwgaW5zdGFuY2VvZiBDb2RlQ2VsbFZpZXdNb2RlbCAmJiAhbWV0YWRhdGEubGFzdFJ1blN1Y2Nlc3MgJiYgbWV0YWRhdGE/LmVycm9yPy5sb2NhdGlvbikge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblx0XHRcdGNvbnN0IGVycm9yTGFiZWwgPSBtZXRhZGF0YS5lcnJvci5uYW1lID8gYCR7bWV0YWRhdGEuZXJyb3IubmFtZX06ICR7bWV0YWRhdGEuZXJyb3IubWVzc2FnZX1gIDogbWV0YWRhdGEuZXJyb3IubWVzc2FnZTtcblx0XHRcdGNvbnN0IG1hcmtlciA9IHRoaXMuY3JlYXRlTWFya2VyRGF0YShlcnJvckxhYmVsLCBtZXRhZGF0YS5lcnJvci5sb2NhdGlvbik7XG5cdFx0XHR0aGlzLm1hcmtlclNlcnZpY2UuY2hhbmdlT25lKENlbGxEaWFnbm9zdGljcy5JRCwgY2VsbC51cmksIFttYXJrZXJdKTtcblx0XHRcdGRpc3Bvc2FibGVzLnB1c2godG9EaXNwb3NhYmxlKCgpID0+IHRoaXMubWFya2VyU2VydmljZS5jaGFuZ2VPbmUoQ2VsbERpYWdub3N0aWNzLklELCBjZWxsLnVyaSwgW10pKSk7XG5cdFx0XHRjZWxsLmV4ZWN1dGlvbkVycm9yRGlhZ25vc3RpYy5zZXQobWV0YWRhdGEuZXJyb3IsIHVuZGVmaW5lZCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5wdXNoKHRvRGlzcG9zYWJsZSgoKSA9PiBjZWxsLmV4ZWN1dGlvbkVycm9yRGlhZ25vc3RpYy5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5wdXNoKGF1dG9ydW4oKHIpID0+IHtcblx0XHRcdFx0aWYgKCFjZWxsLmV4ZWN1dGlvbkVycm9yRGlhZ25vc3RpYy5yZWFkKHIpKSB7XG5cdFx0XHRcdFx0dGhpcy5jbGVhcihjZWxsSGFuZGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMucHVzaChjZWxsLm1vZGVsLm9uRGlkQ2hhbmdlT3V0cHV0cygoKSA9PiB7XG5cdFx0XHRcdGlmIChjZWxsLm1vZGVsLm91dHB1dHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5jbGVhcihjZWxsSGFuZGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMucHVzaChjZWxsLm1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY2xlYXIoY2VsbEhhbmRsZSk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLmRpYWdub3N0aWNzQnlIYW5kbGUuc2V0KGNlbGxIYW5kbGUsIGRpc3Bvc2FibGVzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1hcmtlckRhdGEobWVzc2FnZTogc3RyaW5nLCBsb2NhdGlvbjogSVJhbmdlKTogSU1hcmtlckRhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXZlcml0eTogOCxcblx0XHRcdG1lc3NhZ2U6IG1lc3NhZ2UsXG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IGxvY2F0aW9uLnN0YXJ0TGluZU51bWJlciArIDEsXG5cdFx0XHRzdGFydENvbHVtbjogbG9jYXRpb24uc3RhcnRDb2x1bW4gKyAxLFxuXHRcdFx0ZW5kTGluZU51bWJlcjogbG9jYXRpb24uZW5kTGluZU51bWJlciArIDEsXG5cdFx0XHRlbmRDb2x1bW46IGxvY2F0aW9uLmVuZENvbHVtbiArIDEsXG5cdFx0XHRzb3VyY2U6ICdDZWxsIEV4ZWN1dGlvbiBFcnJvcidcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5jbGVhckFsbCgpO1xuXHR9XG5cbn1cblxucmVnaXN0ZXJOb3RlYm9va0NvbnRyaWJ1dGlvbihDZWxsRGlhZ25vc3RpY3MuSUQsIENlbGxEaWFnbm9zdGljcyk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBeUIsb0JBQW9CO0FBQ3RELFNBQXNCLHNCQUFzQjtBQUU1QyxTQUF1RSxnQ0FBZ0MsNkJBQTZCO0FBQ3BJLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsVUFBVSx1QkFBdUI7QUFFMUMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUVqQixJQUFNLGtCQUFO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
