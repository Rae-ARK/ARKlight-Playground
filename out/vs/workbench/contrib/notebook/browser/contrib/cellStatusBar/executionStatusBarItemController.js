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
import { disposableTimeout, RunOnceScheduler } from "../../../../../../base/common/async.js";
import { Disposable, dispose, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { language } from "../../../../../../base/common/platform.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { themeColorFromId } from "../../../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { NotebookVisibleCellObserver } from "./notebookVisibleCellObserver.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
import { cellStatusIconError, cellStatusIconSuccess } from "../../notebookEditorWidget.js";
import { errorStateIcon, executingStateIcon, pendingStateIcon, successStateIcon } from "../../notebookIcons.js";
import { CellStatusbarAlignment, NotebookCellExecutionState, NotebookSetting } from "../../../common/notebookCommon.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../../common/notebookExecutionStateService.js";
import { INotebookService } from "../../../common/notebookService.js";
function formatCellDuration(duration, showMilliseconds = true) {
  if (showMilliseconds && duration < 1e3) {
    return `${duration}ms`;
  }
  const minutes = Math.floor(duration / 1e3 / 60);
  const seconds = Math.floor(duration / 1e3) % 60;
  const tenths = Math.floor(duration % 1e3 / 100);
  if (minutes > 0) {
    return `${minutes}m ${seconds}.${tenths}s`;
  } else {
    return `${seconds}.${tenths}s`;
  }
}
class NotebookStatusBarController extends Disposable {
  constructor(_notebookEditor, _itemFactory) {
    super();
    this._notebookEditor = _notebookEditor;
    this._itemFactory = _itemFactory;
    this._visibleCells = /* @__PURE__ */ new Map();
    this._observer = this._register(new NotebookVisibleCellObserver(this._notebookEditor));
    this._register(this._observer.onDidChangeVisibleCells(this._updateVisibleCells, this));
    this._updateEverything();
  }
  _updateEverything() {
    this._visibleCells.forEach(dispose);
    this._visibleCells.clear();
    this._updateVisibleCells({ added: this._observer.visibleCells, removed: [] });
  }
  _updateVisibleCells(e) {
    const vm = this._notebookEditor.getViewModel();
    if (!vm) {
      return;
    }
    for (const oldCell of e.removed) {
      this._visibleCells.get(oldCell.handle)?.dispose();
      this._visibleCells.delete(oldCell.handle);
    }
    for (const newCell of e.added) {
      this._visibleCells.set(newCell.handle, this._itemFactory(vm, newCell));
    }
  }
  dispose() {
    super.dispose();
    this._visibleCells.forEach(dispose);
    this._visibleCells.clear();
  }
}
let ExecutionStateCellStatusBarContrib = class extends Disposable {
  constructor(notebookEditor, instantiationService) {
    super();
    this._register(new NotebookStatusBarController(notebookEditor, (vm, cell) => instantiationService.createInstance(ExecutionStateCellStatusBarItem, vm, cell)));
  }
};
ExecutionStateCellStatusBarContrib.id = "workbench.notebook.statusBar.execState";
ExecutionStateCellStatusBarContrib = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ExecutionStateCellStatusBarContrib);
registerNotebookContribution(ExecutionStateCellStatusBarContrib.id, ExecutionStateCellStatusBarContrib);
let ExecutionStateCellStatusBarItem = class extends Disposable {
  constructor(_notebookViewModel, _cell, _executionStateService) {
    super();
    this._notebookViewModel = _notebookViewModel;
    this._cell = _cell;
    this._executionStateService = _executionStateService;
    this._currentItemIds = [];
    this._clearExecutingStateTimer = this._register(new MutableDisposable());
    this._update();
    this._register(this._executionStateService.onDidChangeExecution((e) => {
      if (e.type === NotebookExecutionType.cell && e.affectsCell(this._cell.uri)) {
        this._update();
      }
    }));
    this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
  }
  async _update() {
    const items = this._getItemsForCell();
    if (Array.isArray(items)) {
      this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
    }
  }
  /**
   *	Returns undefined if there should be no change, and an empty array if all items should be removed.
   */
  _getItemsForCell() {
    const runState = this._executionStateService.getCellExecution(this._cell.uri);
    if (runState?.state === NotebookCellExecutionState.Executing && typeof this._showedExecutingStateTime !== "number") {
      this._showedExecutingStateTime = Date.now();
    } else if (runState?.state !== NotebookCellExecutionState.Executing && typeof this._showedExecutingStateTime === "number") {
      const timeUntilMin = ExecutionStateCellStatusBarItem.MIN_SPINNER_TIME - (Date.now() - this._showedExecutingStateTime);
      if (timeUntilMin > 0) {
        if (!this._clearExecutingStateTimer.value) {
          this._clearExecutingStateTimer.value = disposableTimeout(() => {
            this._showedExecutingStateTime = void 0;
            this._clearExecutingStateTimer.clear();
            this._update();
          }, timeUntilMin);
        }
        return void 0;
      } else {
        this._showedExecutingStateTime = void 0;
      }
    }
    const items = this._getItemForState(runState, this._cell.internalMetadata);
    return items;
  }
  _getItemForState(runState, internalMetadata) {
    const state = runState?.state;
    const { lastRunSuccess } = internalMetadata;
    if (!state && lastRunSuccess) {
      return [{
        text: `$(${successStateIcon.id})`,
        color: themeColorFromId(cellStatusIconSuccess),
        tooltip: localize("notebook.cell.status.success", "Success"),
        alignment: CellStatusbarAlignment.Left,
        priority: Number.MAX_SAFE_INTEGER
      }];
    } else if (!state && lastRunSuccess === false) {
      return [{
        text: `$(${errorStateIcon.id})`,
        color: themeColorFromId(cellStatusIconError),
        tooltip: localize("notebook.cell.status.failed", "Failed"),
        alignment: CellStatusbarAlignment.Left,
        priority: Number.MAX_SAFE_INTEGER
      }];
    } else if (state === NotebookCellExecutionState.Pending || state === NotebookCellExecutionState.Unconfirmed) {
      return [{
        text: `$(${pendingStateIcon.id})`,
        tooltip: localize("notebook.cell.status.pending", "Pending"),
        alignment: CellStatusbarAlignment.Left,
        priority: Number.MAX_SAFE_INTEGER
      }];
    } else if (state === NotebookCellExecutionState.Executing) {
      const icon = runState?.didPause ? executingStateIcon : ThemeIcon.modify(executingStateIcon, "spin");
      return [{
        text: `$(${icon.id})`,
        tooltip: localize("notebook.cell.status.executing", "Executing"),
        alignment: CellStatusbarAlignment.Left,
        priority: Number.MAX_SAFE_INTEGER
      }];
    }
    return [];
  }
  dispose() {
    super.dispose();
    this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items: [] }]);
  }
};
ExecutionStateCellStatusBarItem.MIN_SPINNER_TIME = 500;
ExecutionStateCellStatusBarItem = __decorateClass([
  __decorateParam(2, INotebookExecutionStateService)
], ExecutionStateCellStatusBarItem);
let TimerCellStatusBarContrib = class extends Disposable {
  constructor(notebookEditor, instantiationService) {
    super();
    this._register(new NotebookStatusBarController(notebookEditor, (vm, cell) => instantiationService.createInstance(TimerCellStatusBarItem, vm, cell)));
  }
};
TimerCellStatusBarContrib.id = "workbench.notebook.statusBar.execTimer";
TimerCellStatusBarContrib = __decorateClass([
  __decorateParam(1, IInstantiationService)
], TimerCellStatusBarContrib);
registerNotebookContribution(TimerCellStatusBarContrib.id, TimerCellStatusBarContrib);
const UPDATE_TIMER_GRACE_PERIOD = 200;
let TimerCellStatusBarItem = class extends Disposable {
  constructor(_notebookViewModel, _cell, _executionStateService, _notebookService, _configurationService) {
    super();
    this._notebookViewModel = _notebookViewModel;
    this._cell = _cell;
    this._executionStateService = _executionStateService;
    this._notebookService = _notebookService;
    this._configurationService = _configurationService;
    this._currentItemIds = [];
    this._isVerbose = this._configurationService.getValue(NotebookSetting.cellExecutionTimeVerbosity) === "verbose";
    this._scheduler = this._register(new RunOnceScheduler(() => this._update(), TimerCellStatusBarItem.UPDATE_INTERVAL));
    this._update();
    this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.cellExecutionTimeVerbosity)) {
        this._isVerbose = this._configurationService.getValue(NotebookSetting.cellExecutionTimeVerbosity) === "verbose";
        this._update();
      }
    }));
  }
  async _update() {
    let timerItem;
    const runState = this._executionStateService.getCellExecution(this._cell.uri);
    const state = runState?.state;
    const startTime = this._cell.internalMetadata.runStartTime;
    const adjustment = this._cell.internalMetadata.runStartTimeAdjustment ?? 0;
    const endTime = this._cell.internalMetadata.runEndTime;
    if (runState?.didPause) {
      timerItem = void 0;
    } else if (state === NotebookCellExecutionState.Executing) {
      if (typeof startTime === "number") {
        timerItem = this._getTimeItem(startTime, Date.now(), adjustment);
        this._scheduler.schedule();
      }
    } else if (!state) {
      if (typeof startTime === "number" && typeof endTime === "number") {
        const timerDuration = Date.now() - startTime + adjustment;
        const executionDuration = endTime - startTime;
        const renderDuration = this._cell.internalMetadata.renderDuration ?? {};
        timerItem = this._getTimeItem(startTime, endTime, void 0, {
          timerDuration,
          executionDuration,
          renderDuration
        });
      }
    }
    const items = timerItem ? [timerItem] : [];
    if (!items.length && !!runState) {
      if (!this._deferredUpdate) {
        this._deferredUpdate = disposableTimeout(() => {
          this._deferredUpdate = void 0;
          this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
        }, UPDATE_TIMER_GRACE_PERIOD, this._store);
      }
    } else {
      this._deferredUpdate?.dispose();
      this._deferredUpdate = void 0;
      this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
    }
  }
  _getTimeItem(startTime, endTime, adjustment = 0, runtimeInformation) {
    const duration = endTime - startTime + adjustment;
    let tooltip;
    const lastExecution = new Date(endTime).toLocaleTimeString(language);
    if (runtimeInformation) {
      const { renderDuration, executionDuration, timerDuration } = runtimeInformation;
      let renderTimes = "";
      for (const key in renderDuration) {
        const rendererInfo = this._notebookService.getRendererInfo(key);
        const args = encodeURIComponent(JSON.stringify({
          extensionId: rendererInfo?.extensionId.value ?? "",
          issueBody: `Auto-generated text from notebook cell performance - Please add an explanation for the performance issue, including cell content if possible.
The duration for the renderer, ${rendererInfo?.displayName ?? key}, is slower than expected.
Execution Time: ${formatCellDuration(executionDuration)}
Renderer Duration: ${formatCellDuration(renderDuration[key])}
`
        }));
        const renderIssueLink = renderDuration[key] > 200 && executionDuration < 2e3 || renderDuration[key] > 1e3;
        const linkText = rendererInfo?.displayName ?? key;
        const rendererTitle = renderIssueLink ? `[${linkText}](command:workbench.action.openIssueReporter?${args})` : `**${linkText}**`;
        renderTimes += `- ${rendererTitle} ${formatCellDuration(renderDuration[key])}
`;
      }
      renderTimes += `
*${localize("notebook.cell.statusBar.timerTooltip.reportIssueFootnote", "Use the links above to file an issue using the issue reporter.")}*
`;
      tooltip = {
        value: localize("notebook.cell.statusBar.timerTooltip", "**Last Execution** {0}\n\n**Execution Time** {1}\n\n**Overhead Time** {2}\n\n**Render Times**\n\n{3}", lastExecution, formatCellDuration(executionDuration), formatCellDuration(timerDuration - executionDuration), renderTimes),
        isTrusted: true
      };
    }
    const executionText = this._isVerbose ? localize("notebook.cell.statusBar.timerVerbose", "Last Execution: {0}, Duration: {1}", lastExecution, formatCellDuration(duration, false)) : formatCellDuration(duration, false);
    return {
      text: executionText,
      alignment: CellStatusbarAlignment.Left,
      priority: Number.MAX_SAFE_INTEGER - 5,
      tooltip
    };
  }
  dispose() {
    super.dispose();
    this._deferredUpdate?.dispose();
    this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items: [] }]);
  }
};
TimerCellStatusBarItem.UPDATE_INTERVAL = 100;
TimerCellStatusBarItem = __decorateClass([
  __decorateParam(2, INotebookExecutionStateService),
  __decorateParam(3, INotebookService),
  __decorateParam(4, IConfigurationService)
], TimerCellStatusBarItem);
export {
  ExecutionStateCellStatusBarContrib,
  NotebookStatusBarController,
  TimerCellStatusBarContrib,
  formatCellDuration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9jZWxsU3RhdHVzQmFyL2V4ZWN1dGlvblN0YXR1c0Jhckl0ZW1Db250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbGFuZ3VhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgdGhlbWVDb2xvckZyb21JZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElDZWxsVmlzaWJpbGl0eUNoYW5nZUV2ZW50LCBOb3RlYm9va1Zpc2libGVDZWxsT2JzZXJ2ZXIgfSBmcm9tICcuL25vdGVib29rVmlzaWJsZUNlbGxPYnNlcnZlci5qcyc7XG5pbXBvcnQgeyBJQ2VsbFZpZXdNb2RlbCwgSU5vdGVib29rRWRpdG9yLCBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24sIElOb3RlYm9va1ZpZXdNb2RlbCB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck5vdGVib29rQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tFZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNlbGxTdGF0dXNJY29uRXJyb3IsIGNlbGxTdGF0dXNJY29uU3VjY2VzcyB9IGZyb20gJy4uLy4uL25vdGVib29rRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IGVycm9yU3RhdGVJY29uLCBleGVjdXRpbmdTdGF0ZUljb24sIHBlbmRpbmdTdGF0ZUljb24sIHN1Y2Nlc3NTdGF0ZUljb24gfSBmcm9tICcuLi8uLi9ub3RlYm9va0ljb25zLmpzJztcbmltcG9ydCB7IENlbGxTdGF0dXNiYXJBbGlnbm1lbnQsIElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtLCBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZSwgTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSwgTm90ZWJvb2tTZXR0aW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxFeGVjdXRpb24sIElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSwgTm90ZWJvb2tFeGVjdXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdENlbGxEdXJhdGlvbihkdXJhdGlvbjogbnVtYmVyLCBzaG93TWlsbGlzZWNvbmRzOiBib29sZWFuID0gdHJ1ZSk6IHN0cmluZyB7XG5cdGlmIChzaG93TWlsbGlzZWNvbmRzICYmIGR1cmF0aW9uIDwgMTAwMCkge1xuXHRcdHJldHVybiBgJHtkdXJhdGlvbn1tc2A7XG5cdH1cblxuXHRjb25zdCBtaW51dGVzID0gTWF0aC5mbG9vcihkdXJhdGlvbiAvIDEwMDAgLyA2MCk7XG5cdGNvbnN0IHNlY29uZHMgPSBNYXRoLmZsb29yKGR1cmF0aW9uIC8gMTAwMCkgJSA2MDtcblx0Y29uc3QgdGVudGhzID0gTWF0aC5mbG9vcigoZHVyYXRpb24gJSAxMDAwKSAvIDEwMCk7XG5cblx0aWYgKG1pbnV0ZXMgPiAwKSB7XG5cdFx0cmV0dXJuIGAke21pbnV0ZXN9bSAke3NlY29uZHN9LiR7dGVudGhzfXNgO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBgJHtzZWNvbmRzfS4ke3RlbnRoc31zYDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tTdGF0dXNCYXJDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Zpc2libGVDZWxscyA9IG5ldyBNYXA8bnVtYmVyLCBJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb2JzZXJ2ZXI6IE5vdGVib29rVmlzaWJsZUNlbGxPYnNlcnZlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1GYWN0b3J5OiAodm06IElOb3RlYm9va1ZpZXdNb2RlbCwgY2VsbDogSUNlbGxWaWV3TW9kZWwpID0+IElEaXNwb3NhYmxlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX29ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE5vdGVib29rVmlzaWJsZUNlbGxPYnNlcnZlcih0aGlzLl9ub3RlYm9va0VkaXRvcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX29ic2VydmVyLm9uRGlkQ2hhbmdlVmlzaWJsZUNlbGxzKHRoaXMuX3VwZGF0ZVZpc2libGVDZWxscywgdGhpcykpO1xuXG5cdFx0dGhpcy5fdXBkYXRlRXZlcnl0aGluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRXZlcnl0aGluZygpOiB2b2lkIHtcblx0XHR0aGlzLl92aXNpYmxlQ2VsbHMuZm9yRWFjaChkaXNwb3NlKTtcblx0XHR0aGlzLl92aXNpYmxlQ2VsbHMuY2xlYXIoKTtcblx0XHR0aGlzLl91cGRhdGVWaXNpYmxlQ2VsbHMoeyBhZGRlZDogdGhpcy5fb2JzZXJ2ZXIudmlzaWJsZUNlbGxzLCByZW1vdmVkOiBbXSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVZpc2libGVDZWxscyhlOiBJQ2VsbFZpc2liaWxpdHlDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHZtID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0Vmlld01vZGVsKCk7XG5cdFx0aWYgKCF2bSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgb2xkQ2VsbCBvZiBlLnJlbW92ZWQpIHtcblx0XHRcdHRoaXMuX3Zpc2libGVDZWxscy5nZXQob2xkQ2VsbC5oYW5kbGUpPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl92aXNpYmxlQ2VsbHMuZGVsZXRlKG9sZENlbGwuaGFuZGxlKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IG5ld0NlbGwgb2YgZS5hZGRlZCkge1xuXHRcdFx0dGhpcy5fdmlzaWJsZUNlbGxzLnNldChuZXdDZWxsLmhhbmRsZSwgdGhpcy5faXRlbUZhY3Rvcnkodm0sIG5ld0NlbGwpKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX3Zpc2libGVDZWxscy5mb3JFYWNoKGRpc3Bvc2UpO1xuXHRcdHRoaXMuX3Zpc2libGVDZWxscy5jbGVhcigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeGVjdXRpb25TdGF0ZUNlbGxTdGF0dXNCYXJDb250cmliIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyBpZDogc3RyaW5nID0gJ3dvcmtiZW5jaC5ub3RlYm9vay5zdGF0dXNCYXIuZXhlY1N0YXRlJztcblxuXHRjb25zdHJ1Y3Rvcihub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBOb3RlYm9va1N0YXR1c0JhckNvbnRyb2xsZXIobm90ZWJvb2tFZGl0b3IsICh2bSwgY2VsbCkgPT4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXhlY3V0aW9uU3RhdGVDZWxsU3RhdHVzQmFySXRlbSwgdm0sIGNlbGwpKSk7XG5cdH1cbn1cbnJlZ2lzdGVyTm90ZWJvb2tDb250cmlidXRpb24oRXhlY3V0aW9uU3RhdGVDZWxsU3RhdHVzQmFyQ29udHJpYi5pZCwgRXhlY3V0aW9uU3RhdGVDZWxsU3RhdHVzQmFyQ29udHJpYik7XG5cbi8qKlxuICogU2hvd3MgdGhlIGNlbGwncyBleGVjdXRpb24gc3RhdGUgaW4gdGhlIGNlbGwgc3RhdHVzIGJhci4gV2hlbiB0aGUgXCJleGVjdXRpbmdcIiBzdGF0ZSBpcyBzaG93biwgaXQgd2lsbCBiZSBzaG93biBmb3IgYSBtaW5pbXVtIGJyaWVmIHRpbWUuXG4gKi9cbmNsYXNzIEV4ZWN1dGlvblN0YXRlQ2VsbFN0YXR1c0Jhckl0ZW0gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUlOX1NQSU5ORVJfVElNRSA9IDUwMDtcblxuXHRwcml2YXRlIF9jdXJyZW50SXRlbUlkczogc3RyaW5nW10gPSBbXTtcblxuXHRwcml2YXRlIF9zaG93ZWRFeGVjdXRpbmdTdGF0ZVRpbWU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2xlYXJFeGVjdXRpbmdTdGF0ZVRpbWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rVmlld01vZGVsOiBJTm90ZWJvb2tWaWV3TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2VsbDogSUNlbGxWaWV3TW9kZWwsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRXhlY3V0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUudHlwZSA9PT0gTm90ZWJvb2tFeGVjdXRpb25UeXBlLmNlbGwgJiYgZS5hZmZlY3RzQ2VsbCh0aGlzLl9jZWxsLnVyaSkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NlbGwubW9kZWwub25EaWRDaGFuZ2VJbnRlcm5hbE1ldGFkYXRhKCgpID0+IHRoaXMuX3VwZGF0ZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGUoKSB7XG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLl9nZXRJdGVtc0ZvckNlbGwoKTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShpdGVtcykpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRJdGVtSWRzID0gdGhpcy5fbm90ZWJvb2tWaWV3TW9kZWwuZGVsdGFDZWxsU3RhdHVzQmFySXRlbXModGhpcy5fY3VycmVudEl0ZW1JZHMsIFt7IGhhbmRsZTogdGhpcy5fY2VsbC5oYW5kbGUsIGl0ZW1zIH1dKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICpcdFJldHVybnMgdW5kZWZpbmVkIGlmIHRoZXJlIHNob3VsZCBiZSBubyBjaGFuZ2UsIGFuZCBhbiBlbXB0eSBhcnJheSBpZiBhbGwgaXRlbXMgc2hvdWxkIGJlIHJlbW92ZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRJdGVtc0ZvckNlbGwoKTogSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1bXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcnVuU3RhdGUgPSB0aGlzLl9leGVjdXRpb25TdGF0ZVNlcnZpY2UuZ2V0Q2VsbEV4ZWN1dGlvbih0aGlzLl9jZWxsLnVyaSk7XG5cblx0XHQvLyBTaG93IHRoZSBleGVjdXRpb24gc3Bpbm5lciBmb3IgYSBtaW5pbXVtIHRpbWVcblx0XHRpZiAocnVuU3RhdGU/LnN0YXRlID09PSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZS5FeGVjdXRpbmcgJiYgdHlwZW9mIHRoaXMuX3Nob3dlZEV4ZWN1dGluZ1N0YXRlVGltZSAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMuX3Nob3dlZEV4ZWN1dGluZ1N0YXRlVGltZSA9IERhdGUubm93KCk7XG5cdFx0fSBlbHNlIGlmIChydW5TdGF0ZT8uc3RhdGUgIT09IE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlLkV4ZWN1dGluZyAmJiB0eXBlb2YgdGhpcy5fc2hvd2VkRXhlY3V0aW5nU3RhdGVUaW1lID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgdGltZVVudGlsTWluID0gRXhlY3V0aW9uU3RhdGVDZWxsU3RhdHVzQmFySXRlbS5NSU5fU1BJTk5FUl9USU1FIC0gKERhdGUubm93KCkgLSB0aGlzLl9zaG93ZWRFeGVjdXRpbmdTdGF0ZVRpbWUpO1xuXHRcdFx0aWYgKHRpbWVVbnRpbE1pbiA+IDApIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9jbGVhckV4ZWN1dGluZ1N0YXRlVGltZXIudmFsdWUpIHtcblx0XHRcdFx0XHR0aGlzLl9jbGVhckV4ZWN1dGluZ1N0YXRlVGltZXIudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zaG93ZWRFeGVjdXRpbmdTdGF0ZVRpbWUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR0aGlzLl9jbGVhckV4ZWN1dGluZ1N0YXRlVGltZXIuY2xlYXIoKTtcblx0XHRcdFx0XHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdFx0XHRcdH0sIHRpbWVVbnRpbE1pbik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc2hvd2VkRXhlY3V0aW5nU3RhdGVUaW1lID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fZ2V0SXRlbUZvclN0YXRlKHJ1blN0YXRlLCB0aGlzLl9jZWxsLmludGVybmFsTWV0YWRhdGEpO1xuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdHByaXZhdGUgX2dldEl0ZW1Gb3JTdGF0ZShydW5TdGF0ZTogSU5vdGVib29rQ2VsbEV4ZWN1dGlvbiB8IHVuZGVmaW5lZCwgaW50ZXJuYWxNZXRhZGF0YTogTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSk6IElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtW10ge1xuXHRcdGNvbnN0IHN0YXRlID0gcnVuU3RhdGU/LnN0YXRlO1xuXHRcdGNvbnN0IHsgbGFzdFJ1blN1Y2Nlc3MgfSA9IGludGVybmFsTWV0YWRhdGE7XG5cdFx0aWYgKCFzdGF0ZSAmJiBsYXN0UnVuU3VjY2Vzcykge1xuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdHRleHQ6IGAkKCR7c3VjY2Vzc1N0YXRlSWNvbi5pZH0pYCxcblx0XHRcdFx0Y29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoY2VsbFN0YXR1c0ljb25TdWNjZXNzKSxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ25vdGVib29rLmNlbGwuc3RhdHVzLnN1Y2Nlc3MnLCBcIlN1Y2Nlc3NcIiksXG5cdFx0XHRcdGFsaWdubWVudDogQ2VsbFN0YXR1c2JhckFsaWdubWVudC5MZWZ0LFxuXHRcdFx0XHRwcmlvcml0eTogTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVJcblx0XHRcdH0gc2F0aXNmaWVzIElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtXTtcblx0XHR9IGVsc2UgaWYgKCFzdGF0ZSAmJiBsYXN0UnVuU3VjY2VzcyA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHR0ZXh0OiBgJCgke2Vycm9yU3RhdGVJY29uLmlkfSlgLFxuXHRcdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChjZWxsU3RhdHVzSWNvbkVycm9yKSxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ25vdGVib29rLmNlbGwuc3RhdHVzLmZhaWxlZCcsIFwiRmFpbGVkXCIpLFxuXHRcdFx0XHRhbGlnbm1lbnQ6IENlbGxTdGF0dXNiYXJBbGlnbm1lbnQuTGVmdCxcblx0XHRcdFx0cHJpb3JpdHk6IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSXG5cdFx0XHR9XTtcblx0XHR9IGVsc2UgaWYgKHN0YXRlID09PSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZS5QZW5kaW5nIHx8IHN0YXRlID09PSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZS5VbmNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdHRleHQ6IGAkKCR7cGVuZGluZ1N0YXRlSWNvbi5pZH0pYCxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ25vdGVib29rLmNlbGwuc3RhdHVzLnBlbmRpbmcnLCBcIlBlbmRpbmdcIiksXG5cdFx0XHRcdGFsaWdubWVudDogQ2VsbFN0YXR1c2JhckFsaWdubWVudC5MZWZ0LFxuXHRcdFx0XHRwcmlvcml0eTogTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVJcblx0XHRcdH0gc2F0aXNmaWVzIElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtXTtcblx0XHR9IGVsc2UgaWYgKHN0YXRlID09PSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZS5FeGVjdXRpbmcpIHtcblx0XHRcdGNvbnN0IGljb24gPSBydW5TdGF0ZT8uZGlkUGF1c2UgP1xuXHRcdFx0XHRleGVjdXRpbmdTdGF0ZUljb24gOlxuXHRcdFx0XHRUaGVtZUljb24ubW9kaWZ5KGV4ZWN1dGluZ1N0YXRlSWNvbiwgJ3NwaW4nKTtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHR0ZXh0OiBgJCgke2ljb24uaWR9KWAsXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdub3RlYm9vay5jZWxsLnN0YXR1cy5leGVjdXRpbmcnLCBcIkV4ZWN1dGluZ1wiKSxcblx0XHRcdFx0YWxpZ25tZW50OiBDZWxsU3RhdHVzYmFyQWxpZ25tZW50LkxlZnQsXG5cdFx0XHRcdHByaW9yaXR5OiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUlxuXHRcdFx0fSBzYXRpc2ZpZXMgSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1dO1xuXHRcdH1cblxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fbm90ZWJvb2tWaWV3TW9kZWwuZGVsdGFDZWxsU3RhdHVzQmFySXRlbXModGhpcy5fY3VycmVudEl0ZW1JZHMsIFt7IGhhbmRsZTogdGhpcy5fY2VsbC5oYW5kbGUsIGl0ZW1zOiBbXSB9XSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRpbWVyQ2VsbFN0YXR1c0JhckNvbnRyaWIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIGlkOiBzdHJpbmcgPSAnd29ya2JlbmNoLm5vdGVib29rLnN0YXR1c0Jhci5leGVjVGltZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgTm90ZWJvb2tTdGF0dXNCYXJDb250cm9sbGVyKG5vdGVib29rRWRpdG9yLCAodm0sIGNlbGwpID0+IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRpbWVyQ2VsbFN0YXR1c0Jhckl0ZW0sIHZtLCBjZWxsKSkpO1xuXHR9XG59XG5yZWdpc3Rlck5vdGVib29rQ29udHJpYnV0aW9uKFRpbWVyQ2VsbFN0YXR1c0JhckNvbnRyaWIuaWQsIFRpbWVyQ2VsbFN0YXR1c0JhckNvbnRyaWIpO1xuXG5jb25zdCBVUERBVEVfVElNRVJfR1JBQ0VfUEVSSU9EID0gMjAwO1xuXG5jbGFzcyBUaW1lckNlbGxTdGF0dXNCYXJJdGVtIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIFVQREFURV9JTlRFUlZBTCA9IDEwMDtcblx0cHJpdmF0ZSBfY3VycmVudEl0ZW1JZHM6IHN0cmluZ1tdID0gW107XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdHByaXZhdGUgX2RlZmVycmVkVXBkYXRlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9pc1ZlcmJvc2U6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tWaWV3TW9kZWw6IElOb3RlYm9va1ZpZXdNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jZWxsOiBJQ2VsbFZpZXdNb2RlbCxcblx0XHRASU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5faXNWZXJib3NlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTm90ZWJvb2tTZXR0aW5nLmNlbGxFeGVjdXRpb25UaW1lVmVyYm9zaXR5KSA9PT0gJ3ZlcmJvc2UnO1xuXG5cdFx0dGhpcy5fc2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fdXBkYXRlKCksIFRpbWVyQ2VsbFN0YXR1c0Jhckl0ZW0uVVBEQVRFX0lOVEVSVkFMKSk7XG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2VsbC5tb2RlbC5vbkRpZENoYW5nZUludGVybmFsTWV0YWRhdGEoKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5jZWxsRXhlY3V0aW9uVGltZVZlcmJvc2l0eSkpIHtcblx0XHRcdFx0dGhpcy5faXNWZXJib3NlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTm90ZWJvb2tTZXR0aW5nLmNlbGxFeGVjdXRpb25UaW1lVmVyYm9zaXR5KSA9PT0gJ3ZlcmJvc2UnO1xuXHRcdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGUoKSB7XG5cdFx0bGV0IHRpbWVySXRlbTogSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcnVuU3RhdGUgPSB0aGlzLl9leGVjdXRpb25TdGF0ZVNlcnZpY2UuZ2V0Q2VsbEV4ZWN1dGlvbih0aGlzLl9jZWxsLnVyaSk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBydW5TdGF0ZT8uc3RhdGU7XG5cdFx0Y29uc3Qgc3RhcnRUaW1lID0gdGhpcy5fY2VsbC5pbnRlcm5hbE1ldGFkYXRhLnJ1blN0YXJ0VGltZTtcblx0XHRjb25zdCBhZGp1c3RtZW50ID0gdGhpcy5fY2VsbC5pbnRlcm5hbE1ldGFkYXRhLnJ1blN0YXJ0VGltZUFkanVzdG1lbnQgPz8gMDtcblx0XHRjb25zdCBlbmRUaW1lID0gdGhpcy5fY2VsbC5pbnRlcm5hbE1ldGFkYXRhLnJ1bkVuZFRpbWU7XG5cblx0XHRpZiAocnVuU3RhdGU/LmRpZFBhdXNlKSB7XG5cdFx0XHR0aW1lckl0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChzdGF0ZSA9PT0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3RhdGUuRXhlY3V0aW5nKSB7XG5cdFx0XHRpZiAodHlwZW9mIHN0YXJ0VGltZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0dGltZXJJdGVtID0gdGhpcy5fZ2V0VGltZUl0ZW0oc3RhcnRUaW1lLCBEYXRlLm5vdygpLCBhZGp1c3RtZW50KTtcblx0XHRcdFx0dGhpcy5fc2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICghc3RhdGUpIHtcblx0XHRcdGlmICh0eXBlb2Ygc3RhcnRUaW1lID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgZW5kVGltZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0Y29uc3QgdGltZXJEdXJhdGlvbiA9IERhdGUubm93KCkgLSBzdGFydFRpbWUgKyBhZGp1c3RtZW50O1xuXHRcdFx0XHRjb25zdCBleGVjdXRpb25EdXJhdGlvbiA9IGVuZFRpbWUgLSBzdGFydFRpbWU7XG5cdFx0XHRcdGNvbnN0IHJlbmRlckR1cmF0aW9uID0gdGhpcy5fY2VsbC5pbnRlcm5hbE1ldGFkYXRhLnJlbmRlckR1cmF0aW9uID8/IHt9O1xuXG5cdFx0XHRcdHRpbWVySXRlbSA9IHRoaXMuX2dldFRpbWVJdGVtKHN0YXJ0VGltZSwgZW5kVGltZSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdFx0dGltZXJEdXJhdGlvbixcblx0XHRcdFx0XHRleGVjdXRpb25EdXJhdGlvbixcblx0XHRcdFx0XHRyZW5kZXJEdXJhdGlvblxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpdGVtcyA9IHRpbWVySXRlbSA/IFt0aW1lckl0ZW1dIDogW107XG5cblx0XHRpZiAoIWl0ZW1zLmxlbmd0aCAmJiAhIXJ1blN0YXRlKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2RlZmVycmVkVXBkYXRlKSB7XG5cdFx0XHRcdHRoaXMuX2RlZmVycmVkVXBkYXRlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2RlZmVycmVkVXBkYXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRJdGVtSWRzID0gdGhpcy5fbm90ZWJvb2tWaWV3TW9kZWwuZGVsdGFDZWxsU3RhdHVzQmFySXRlbXModGhpcy5fY3VycmVudEl0ZW1JZHMsIFt7IGhhbmRsZTogdGhpcy5fY2VsbC5oYW5kbGUsIGl0ZW1zIH1dKTtcblx0XHRcdFx0fSwgVVBEQVRFX1RJTUVSX0dSQUNFX1BFUklPRCwgdGhpcy5fc3RvcmUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9kZWZlcnJlZFVwZGF0ZT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fZGVmZXJyZWRVcGRhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jdXJyZW50SXRlbUlkcyA9IHRoaXMuX25vdGVib29rVmlld01vZGVsLmRlbHRhQ2VsbFN0YXR1c0Jhckl0ZW1zKHRoaXMuX2N1cnJlbnRJdGVtSWRzLCBbeyBoYW5kbGU6IHRoaXMuX2NlbGwuaGFuZGxlLCBpdGVtcyB9XSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGltZUl0ZW0oc3RhcnRUaW1lOiBudW1iZXIsIGVuZFRpbWU6IG51bWJlciwgYWRqdXN0bWVudDogbnVtYmVyID0gMCwgcnVudGltZUluZm9ybWF0aW9uPzogeyByZW5kZXJEdXJhdGlvbjogeyBba2V5OiBzdHJpbmddOiBudW1iZXIgfTsgZXhlY3V0aW9uRHVyYXRpb246IG51bWJlcjsgdGltZXJEdXJhdGlvbjogbnVtYmVyIH0pOiBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbSB7XG5cdFx0Y29uc3QgZHVyYXRpb24gPSBlbmRUaW1lIC0gc3RhcnRUaW1lICsgYWRqdXN0bWVudDtcblxuXHRcdGxldCB0b29sdGlwOiBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBsYXN0RXhlY3V0aW9uID0gbmV3IERhdGUoZW5kVGltZSkudG9Mb2NhbGVUaW1lU3RyaW5nKGxhbmd1YWdlKTtcblxuXHRcdGlmIChydW50aW1lSW5mb3JtYXRpb24pIHtcblx0XHRcdGNvbnN0IHsgcmVuZGVyRHVyYXRpb24sIGV4ZWN1dGlvbkR1cmF0aW9uLCB0aW1lckR1cmF0aW9uIH0gPSBydW50aW1lSW5mb3JtYXRpb247XG5cblx0XHRcdGxldCByZW5kZXJUaW1lcyA9ICcnO1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gcmVuZGVyRHVyYXRpb24pIHtcblx0XHRcdFx0Y29uc3QgcmVuZGVyZXJJbmZvID0gdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLmdldFJlbmRlcmVySW5mbyhrZXkpO1xuXG5cdFx0XHRcdGNvbnN0IGFyZ3MgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGV4dGVuc2lvbklkOiByZW5kZXJlckluZm8/LmV4dGVuc2lvbklkLnZhbHVlID8/ICcnLFxuXHRcdFx0XHRcdGlzc3VlQm9keTpcblx0XHRcdFx0XHRcdGBBdXRvLWdlbmVyYXRlZCB0ZXh0IGZyb20gbm90ZWJvb2sgY2VsbCBwZXJmb3JtYW5jZSAtIFBsZWFzZSBhZGQgYW4gZXhwbGFuYXRpb24gZm9yIHRoZSBwZXJmb3JtYW5jZSBpc3N1ZSwgaW5jbHVkaW5nIGNlbGwgY29udGVudCBpZiBwb3NzaWJsZS5cXG5gICtcblx0XHRcdFx0XHRcdGBUaGUgZHVyYXRpb24gZm9yIHRoZSByZW5kZXJlciwgJHtyZW5kZXJlckluZm8/LmRpc3BsYXlOYW1lID8/IGtleX0sIGlzIHNsb3dlciB0aGFuIGV4cGVjdGVkLlxcbmAgK1xuXHRcdFx0XHRcdFx0YEV4ZWN1dGlvbiBUaW1lOiAke2Zvcm1hdENlbGxEdXJhdGlvbihleGVjdXRpb25EdXJhdGlvbil9XFxuYCArXG5cdFx0XHRcdFx0XHRgUmVuZGVyZXIgRHVyYXRpb246ICR7Zm9ybWF0Q2VsbER1cmF0aW9uKHJlbmRlckR1cmF0aW9uW2tleV0pfVxcbmBcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIFNob3cgYSBsaW5rIHRvIGNyZWF0ZSBhbiBpc3N1ZSBpZiB0aGUgcmVuZGVyZXIgd2FzIHNsb3cgY29tcGFyZWQgdG8gdGhlIGV4ZWN1dGlvbiBkdXJhdGlvbiwgb3IganVzdCBleGNlcHRpb25hbGx5IHNsb3cgb24gaXRzIG93blxuXHRcdFx0XHRjb25zdCByZW5kZXJJc3N1ZUxpbmsgPSAocmVuZGVyRHVyYXRpb25ba2V5XSA+IDIwMCAmJiBleGVjdXRpb25EdXJhdGlvbiA8IDIwMDApIHx8IHJlbmRlckR1cmF0aW9uW2tleV0gPiAxMDAwO1xuXHRcdFx0XHRjb25zdCBsaW5rVGV4dCA9IHJlbmRlcmVySW5mbz8uZGlzcGxheU5hbWUgPz8ga2V5O1xuXHRcdFx0XHRjb25zdCByZW5kZXJlclRpdGxlID0gcmVuZGVySXNzdWVMaW5rID8gYFske2xpbmtUZXh0fV0oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5Jc3N1ZVJlcG9ydGVyPyR7YXJnc30pYCA6IGAqKiR7bGlua1RleHR9KipgO1xuXHRcdFx0XHRyZW5kZXJUaW1lcyArPSBgLSAke3JlbmRlcmVyVGl0bGV9ICR7Zm9ybWF0Q2VsbER1cmF0aW9uKHJlbmRlckR1cmF0aW9uW2tleV0pfVxcbmA7XG5cdFx0XHR9XG5cblx0XHRcdHJlbmRlclRpbWVzICs9IGBcXG4qJHtsb2NhbGl6ZSgnbm90ZWJvb2suY2VsbC5zdGF0dXNCYXIudGltZXJUb29sdGlwLnJlcG9ydElzc3VlRm9vdG5vdGUnLCBcIlVzZSB0aGUgbGlua3MgYWJvdmUgdG8gZmlsZSBhbiBpc3N1ZSB1c2luZyB0aGUgaXNzdWUgcmVwb3J0ZXIuXCIpfSpcXG5gO1xuXG5cdFx0XHR0b29sdGlwID0ge1xuXHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ25vdGVib29rLmNlbGwuc3RhdHVzQmFyLnRpbWVyVG9vbHRpcCcsIFwiKipMYXN0IEV4ZWN1dGlvbioqIHswfVxcblxcbioqRXhlY3V0aW9uIFRpbWUqKiB7MX1cXG5cXG4qKk92ZXJoZWFkIFRpbWUqKiB7Mn1cXG5cXG4qKlJlbmRlciBUaW1lcyoqXFxuXFxuezN9XCIsIGxhc3RFeGVjdXRpb24sIGZvcm1hdENlbGxEdXJhdGlvbihleGVjdXRpb25EdXJhdGlvbiksIGZvcm1hdENlbGxEdXJhdGlvbih0aW1lckR1cmF0aW9uIC0gZXhlY3V0aW9uRHVyYXRpb24pLCByZW5kZXJUaW1lcyksXG5cdFx0XHRcdGlzVHJ1c3RlZDogdHJ1ZVxuXHRcdFx0fTtcblxuXHRcdH1cblxuXHRcdGNvbnN0IGV4ZWN1dGlvblRleHQgPSB0aGlzLl9pc1ZlcmJvc2UgP1xuXHRcdFx0bG9jYWxpemUoJ25vdGVib29rLmNlbGwuc3RhdHVzQmFyLnRpbWVyVmVyYm9zZScsIFwiTGFzdCBFeGVjdXRpb246IHswfSwgRHVyYXRpb246IHsxfVwiLCBsYXN0RXhlY3V0aW9uLCBmb3JtYXRDZWxsRHVyYXRpb24oZHVyYXRpb24sIGZhbHNlKSkgOlxuXHRcdFx0Zm9ybWF0Q2VsbER1cmF0aW9uKGR1cmF0aW9uLCBmYWxzZSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dGV4dDogZXhlY3V0aW9uVGV4dCxcblx0XHRcdGFsaWdubWVudDogQ2VsbFN0YXR1c2JhckFsaWdubWVudC5MZWZ0LFxuXHRcdFx0cHJpb3JpdHk6IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSIC0gNSxcblx0XHRcdHRvb2x0aXBcblx0XHR9IHNhdGlzZmllcyBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fZGVmZXJyZWRVcGRhdGU/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9ub3RlYm9va1ZpZXdNb2RlbC5kZWx0YUNlbGxTdGF0dXNCYXJJdGVtcyh0aGlzLl9jdXJyZW50SXRlbUlkcywgW3sgaGFuZGxlOiB0aGlzLl9jZWxsLmhhbmRsZSwgaXRlbXM6IFtdIH1dKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUFtQix3QkFBd0I7QUFDcEQsU0FBUyxZQUFZLFNBQXNCLHlCQUF5QjtBQUNwRSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFxQyxtQ0FBbUM7QUFFeEUsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsZ0JBQWdCLG9CQUFvQixrQkFBa0Isd0JBQXdCO0FBQ3ZGLFNBQVMsd0JBQW9ELDRCQUEwRCx1QkFBdUI7QUFDOUksU0FBaUMsZ0NBQWdDLDZCQUE2QjtBQUM5RixTQUFTLHdCQUF3QjtBQUcxQixTQUFTLG1CQUFtQixVQUFrQixtQkFBNEIsTUFBYztBQUM5RixNQUFJLG9CQUFvQixXQUFXLEtBQU07QUFDeEMsV0FBTyxHQUFHLFFBQVE7QUFBQSxFQUNuQjtBQUVBLFFBQU0sVUFBVSxLQUFLLE1BQU0sV0FBVyxNQUFPLEVBQUU7QUFDL0MsUUFBTSxVQUFVLEtBQUssTUFBTSxXQUFXLEdBQUksSUFBSTtBQUM5QyxRQUFNLFNBQVMsS0FBSyxNQUFPLFdBQVcsTUFBUSxHQUFHO0FBRWpELE1BQUksVUFBVSxHQUFHO0FBQ2hCLFdBQU8sR0FBRyxPQUFPLEtBQUssT0FBTyxJQUFJLE1BQU07QUFBQSxFQUN4QyxPQUFPO0FBQ04sV0FBTyxHQUFHLE9BQU8sSUFBSSxNQUFNO0FBQUEsRUFDNUI7QUFDRDtBQUVPLE1BQU0sb0NBQW9DLFdBQVc7QUFBQSxFQUkzRCxZQUNrQixpQkFDQSxj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
