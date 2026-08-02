import * as DOM from "../../../../../../base/browser/dom.js";
import { Delayer } from "../../../../../../base/common/async.js";
import { Disposable, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import * as platform from "../../../../../../base/common/platform.js";
import { expandCellRangesWithHiddenCells } from "../../notebookBrowser.js";
import { CellContentPart } from "../cellPart.js";
import { cloneNotebookCellTextModel } from "../../../common/model/notebookCellTextModel.js";
import { CellEditType, SelectionStateType } from "../../../common/notebookCommon.js";
import { cellRangesToIndexes } from "../../../common/notebookRange.js";
const $ = DOM.$;
const DRAGGING_CLASS = "cell-dragging";
const GLOBAL_DRAG_CLASS = "global-drag-active";
class CellDragAndDropPart extends CellContentPart {
  constructor(container) {
    super();
    this.container = container;
  }
  didRenderCell(element) {
    this.update(element);
  }
  updateState(element, e) {
    if (e.dragStateChanged) {
      this.update(element);
    }
  }
  update(element) {
    this.container.classList.toggle(DRAGGING_CLASS, element.dragging);
  }
}
class CellDragAndDropController extends Disposable {
  constructor(notebookEditor, notebookListContainer) {
    super();
    this.notebookEditor = notebookEditor;
    this.notebookListContainer = notebookListContainer;
    this.draggedCells = [];
    this.isScrolling = false;
    this.listOnWillScrollListener = this._register(new MutableDisposable());
    this.listInsertionIndicator = DOM.append(notebookListContainer, $(".cell-list-insertion-indicator"));
    this._register(DOM.addDisposableListener(notebookListContainer.ownerDocument.body, DOM.EventType.DRAG_START, this.onGlobalDragStart.bind(this), true));
    this._register(DOM.addDisposableListener(notebookListContainer.ownerDocument.body, DOM.EventType.DRAG_END, this.onGlobalDragEnd.bind(this), true));
    const addCellDragListener = (eventType, handler, useCapture = false) => {
      this._register(DOM.addDisposableListener(
        notebookEditor.getDomNode(),
        eventType,
        (e) => {
          const cellDragEvent = this.toCellDragEvent(e);
          if (cellDragEvent) {
            handler(cellDragEvent);
          }
        },
        useCapture
      ));
    };
    addCellDragListener(DOM.EventType.DRAG_OVER, (event) => {
      if (!this.currentDraggedCell) {
        return;
      }
      event.browserEvent.preventDefault();
      this.onCellDragover(event);
    }, true);
    addCellDragListener(DOM.EventType.DROP, (event) => {
      if (!this.currentDraggedCell) {
        return;
      }
      event.browserEvent.preventDefault();
      this.onCellDrop(event);
    });
    addCellDragListener(DOM.EventType.DRAG_LEAVE, (event) => {
      event.browserEvent.preventDefault();
      this.onCellDragLeave(event);
    });
    this.scrollingDelayer = this._register(new Delayer(200));
  }
  setList(value) {
    this.list = value;
    this.listOnWillScrollListener.value = this.list.onWillScroll((e) => {
      if (!e.scrollTopChanged) {
        return;
      }
      this.setInsertIndicatorVisibility(false);
      this.isScrolling = true;
      this.scrollingDelayer.trigger(() => {
        this.isScrolling = false;
      });
    });
  }
  setInsertIndicatorVisibility(visible) {
    this.listInsertionIndicator.style.opacity = visible ? "1" : "0";
  }
  toCellDragEvent(event) {
    const targetTop = this.notebookListContainer.getBoundingClientRect().top;
    const dragOffset = this.list.scrollTop + event.clientY - targetTop;
    const draggedOverCell = this.list.elementAt(dragOffset);
    if (!draggedOverCell) {
      return void 0;
    }
    const cellTop = this.list.getCellViewScrollTop(draggedOverCell);
    const cellHeight = this.list.elementHeight(draggedOverCell);
    const dragPosInElement = dragOffset - cellTop;
    const dragPosRatio = dragPosInElement / cellHeight;
    return {
      browserEvent: event,
      draggedOverCell,
      cellTop,
      cellHeight,
      dragPosRatio
    };
  }
  clearGlobalDragState() {
    this.notebookEditor.getDomNode().classList.remove(GLOBAL_DRAG_CLASS);
  }
  onGlobalDragStart() {
    this.notebookEditor.getDomNode().classList.add(GLOBAL_DRAG_CLASS);
  }
  onGlobalDragEnd() {
    this.notebookEditor.getDomNode().classList.remove(GLOBAL_DRAG_CLASS);
  }
  onCellDragover(event) {
    if (!event.browserEvent.dataTransfer) {
      return;
    }
    if (!this.currentDraggedCell) {
      event.browserEvent.dataTransfer.dropEffect = "none";
      return;
    }
    if (this.isScrolling || this.currentDraggedCell === event.draggedOverCell) {
      this.setInsertIndicatorVisibility(false);
      return;
    }
    const dropDirection = this.getDropInsertDirection(event.dragPosRatio);
    const insertionIndicatorAbsolutePos = dropDirection === "above" ? event.cellTop : event.cellTop + event.cellHeight;
    this.updateInsertIndicator(dropDirection, insertionIndicatorAbsolutePos);
  }
  updateInsertIndicator(dropDirection, insertionIndicatorAbsolutePos) {
    const { bottomToolbarGap } = this.notebookEditor.notebookOptions.computeBottomToolbarDimensions(this.notebookEditor.textModel?.viewType);
    const insertionIndicatorTop = insertionIndicatorAbsolutePos - this.list.scrollTop + bottomToolbarGap / 2;
    if (insertionIndicatorTop >= 0) {
      this.listInsertionIndicator.style.top = `${insertionIndicatorTop}px`;
      this.setInsertIndicatorVisibility(true);
    } else {
      this.setInsertIndicatorVisibility(false);
    }
  }
  getDropInsertDirection(dragPosRatio) {
    return dragPosRatio < 0.5 ? "above" : "below";
  }
  onCellDrop(event) {
    const draggedCell = this.currentDraggedCell;
    if (this.isScrolling || this.currentDraggedCell === event.draggedOverCell) {
      return;
    }
    this.dragCleanup();
    const dropDirection = this.getDropInsertDirection(event.dragPosRatio);
    this._dropImpl(draggedCell, dropDirection, event.browserEvent, event.draggedOverCell);
  }
  getCellRangeAroundDragTarget(draggedCellIndex) {
    const selections = this.notebookEditor.getSelections();
    const modelRanges = expandCellRangesWithHiddenCells(this.notebookEditor, selections);
    const nearestRange = modelRanges.find((range) => range.start <= draggedCellIndex && draggedCellIndex < range.end);
    if (nearestRange) {
      return nearestRange;
    } else {
      return { start: draggedCellIndex, end: draggedCellIndex + 1 };
    }
  }
  _dropImpl(draggedCell, dropDirection, ctx, draggedOverCell) {
    const cellTop = this.list.getCellViewScrollTop(draggedOverCell);
    const cellHeight = this.list.elementHeight(draggedOverCell);
    const insertionIndicatorAbsolutePos = dropDirection === "above" ? cellTop : cellTop + cellHeight;
    const { bottomToolbarGap } = this.notebookEditor.notebookOptions.computeBottomToolbarDimensions(this.notebookEditor.textModel?.viewType);
    const insertionIndicatorTop = insertionIndicatorAbsolutePos - this.list.scrollTop + bottomToolbarGap / 2;
    const editorHeight = this.notebookEditor.getDomNode().getBoundingClientRect().height;
    if (insertionIndicatorTop < 0 || insertionIndicatorTop > editorHeight) {
      return;
    }
    const isCopy = ctx.ctrlKey && !platform.isMacintosh || ctx.altKey && platform.isMacintosh;
    if (!this.notebookEditor.hasModel()) {
      return;
    }
    const textModel = this.notebookEditor.textModel;
    if (isCopy) {
      const draggedCellIndex = this.notebookEditor.getCellIndex(draggedCell);
      const range = this.getCellRangeAroundDragTarget(draggedCellIndex);
      let originalToIdx = this.notebookEditor.getCellIndex(draggedOverCell);
      if (dropDirection === "below") {
        const relativeToIndex = this.notebookEditor.getCellIndex(draggedOverCell);
        const newIdx = this.notebookEditor.getNextVisibleCellIndex(relativeToIndex);
        originalToIdx = newIdx;
      }
      let finalSelection;
      let finalFocus;
      if (originalToIdx <= range.start) {
        finalSelection = { start: originalToIdx, end: originalToIdx + range.end - range.start };
        finalFocus = { start: originalToIdx + draggedCellIndex - range.start, end: originalToIdx + draggedCellIndex - range.start + 1 };
      } else {
        const delta = originalToIdx - range.start;
        finalSelection = { start: range.start + delta, end: range.end + delta };
        finalFocus = { start: draggedCellIndex + delta, end: draggedCellIndex + delta + 1 };
      }
      textModel.applyEdits([
        {
          editType: CellEditType.Replace,
          index: originalToIdx,
          count: 0,
          cells: cellRangesToIndexes([range]).map((index) => cloneNotebookCellTextModel(this.notebookEditor.cellAt(index).model))
        }
      ], true, { kind: SelectionStateType.Index, focus: this.notebookEditor.getFocus(), selections: this.notebookEditor.getSelections() }, () => ({ kind: SelectionStateType.Index, focus: finalFocus, selections: [finalSelection] }), void 0, true);
      this.notebookEditor.revealCellRangeInView(finalSelection);
    } else {
      performCellDropEdits(this.notebookEditor, draggedCell, dropDirection, draggedOverCell);
    }
  }
  onCellDragLeave(event) {
    if (!event.browserEvent.relatedTarget || !DOM.isAncestor(event.browserEvent.relatedTarget, this.notebookEditor.getDomNode())) {
      this.setInsertIndicatorVisibility(false);
    }
  }
  dragCleanup() {
    if (this.currentDraggedCell) {
      this.draggedCells.forEach((cell) => cell.dragging = false);
      this.currentDraggedCell = void 0;
      this.draggedCells = [];
    }
    this.setInsertIndicatorVisibility(false);
  }
  registerDragHandle(templateData, cellRoot, dragHandles, dragImageProvider) {
    const container = templateData.container;
    for (const dragHandle of dragHandles) {
      dragHandle.setAttribute("draggable", "true");
    }
    const onDragEnd = () => {
      if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
        return;
      }
      container.classList.remove(DRAGGING_CLASS);
      this.dragCleanup();
    };
    for (const dragHandle of dragHandles) {
      templateData.templateDisposables.add(DOM.addDisposableListener(dragHandle, DOM.EventType.DRAG_END, onDragEnd));
    }
    const onDragStart = (event) => {
      if (!event.dataTransfer) {
        return;
      }
      if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
        return;
      }
      this.currentDraggedCell = templateData.currentRenderedCell;
      this.draggedCells = this.notebookEditor.getSelections().map((range) => this.notebookEditor.getCellsInRange(range)).flat();
      this.draggedCells.forEach((cell) => cell.dragging = true);
      const dragImage = dragImageProvider();
      cellRoot.parentElement.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => dragImage.remove(), 0);
    };
    for (const dragHandle of dragHandles) {
      templateData.templateDisposables.add(DOM.addDisposableListener(dragHandle, DOM.EventType.DRAG_START, onDragStart));
    }
  }
  startExplicitDrag(cell, _dragOffsetY) {
    if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
      return;
    }
    this.currentDraggedCell = cell;
    this.setInsertIndicatorVisibility(true);
  }
  explicitDrag(cell, dragOffsetY) {
    if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
      return;
    }
    const target = this.list.elementAt(dragOffsetY);
    if (target && target !== cell) {
      const cellTop = this.list.getCellViewScrollTop(target);
      const cellHeight = this.list.elementHeight(target);
      const dropDirection = this.getExplicitDragDropDirection(dragOffsetY, cellTop, cellHeight);
      const insertionIndicatorAbsolutePos = dropDirection === "above" ? cellTop : cellTop + cellHeight;
      this.updateInsertIndicator(dropDirection, insertionIndicatorAbsolutePos);
    }
    if (this.currentDraggedCell !== cell) {
      return;
    }
    const notebookViewRect = this.notebookEditor.getDomNode().getBoundingClientRect();
    const eventPositionInView = dragOffsetY - this.list.scrollTop;
    const notebookViewScrollMargins = 0.2;
    const maxScrollDeltaPerFrame = 20;
    const eventPositionRatio = eventPositionInView / notebookViewRect.height;
    if (eventPositionRatio < notebookViewScrollMargins) {
      this.list.scrollTop -= maxScrollDeltaPerFrame * (1 - eventPositionRatio / notebookViewScrollMargins);
    } else if (eventPositionRatio > 1 - notebookViewScrollMargins) {
      this.list.scrollTop += maxScrollDeltaPerFrame * (1 - (1 - eventPositionRatio) / notebookViewScrollMargins);
    }
  }
  endExplicitDrag(_cell) {
    this.setInsertIndicatorVisibility(false);
  }
  explicitDrop(cell, ctx) {
    this.currentDraggedCell = void 0;
    this.setInsertIndicatorVisibility(false);
    const target = this.list.elementAt(ctx.dragOffsetY);
    if (!target || target === cell) {
      return;
    }
    const cellTop = this.list.getCellViewScrollTop(target);
    const cellHeight = this.list.elementHeight(target);
    const dropDirection = this.getExplicitDragDropDirection(ctx.dragOffsetY, cellTop, cellHeight);
    this._dropImpl(cell, dropDirection, ctx, target);
  }
  getExplicitDragDropDirection(clientY, cellTop, cellHeight) {
    const dragPosInElement = clientY - cellTop;
    const dragPosRatio = dragPosInElement / cellHeight;
    return this.getDropInsertDirection(dragPosRatio);
  }
  dispose() {
    this.notebookEditor = null;
    super.dispose();
  }
}
function performCellDropEdits(editor, draggedCell, dropDirection, draggedOverCell) {
  const draggedCellIndex = editor.getCellIndex(draggedCell);
  let originalToIdx = editor.getCellIndex(draggedOverCell);
  if (typeof draggedCellIndex !== "number" || typeof originalToIdx !== "number") {
    return;
  }
  if (dropDirection === "below") {
    const newIdx = editor.getNextVisibleCellIndex(originalToIdx) ?? originalToIdx;
    originalToIdx = newIdx;
  }
  let selections = editor.getSelections();
  if (!selections.length) {
    selections = [editor.getFocus()];
  }
  let originalFocusIdx = editor.getFocus().start;
  if (!selections.some((s) => s.start <= draggedCellIndex && s.end > draggedCellIndex)) {
    selections = [{ start: draggedCellIndex, end: draggedCellIndex + 1 }];
    originalFocusIdx = draggedCellIndex;
  }
  const droppedInSelection = selections.find((range) => range.start <= originalToIdx && range.end > originalToIdx);
  if (droppedInSelection) {
    originalToIdx = droppedInSelection.start;
  }
  let numCells = 0;
  let focusNewIdx = originalToIdx;
  let newInsertionIdx = originalToIdx;
  selections.sort((a, b) => b.start - a.start);
  const edits = selections.map((range) => {
    const length = range.end - range.start;
    let toIndexDelta = 0;
    if (range.end <= newInsertionIdx) {
      toIndexDelta = -length;
    }
    const newIdx = newInsertionIdx + toIndexDelta;
    if (originalFocusIdx >= range.start && originalFocusIdx <= range.end) {
      const offset = originalFocusIdx - range.start;
      focusNewIdx = newIdx + offset;
    }
    const fromIndexDelta = range.start >= originalToIdx ? numCells : 0;
    const edit = {
      editType: CellEditType.Move,
      index: range.start + fromIndexDelta,
      length,
      newIdx
    };
    numCells += length;
    if (range.end < newInsertionIdx) {
      newInsertionIdx -= length;
    }
    return edit;
  });
  const lastEdit = edits[edits.length - 1];
  const finalSelection = { start: lastEdit.newIdx, end: lastEdit.newIdx + numCells };
  const finalFocus = { start: focusNewIdx, end: focusNewIdx + 1 };
  editor.textModel.applyEdits(
    edits,
    true,
    { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: editor.getSelections() },
    () => ({ kind: SelectionStateType.Index, focus: finalFocus, selections: [finalSelection] }),
    void 0,
    true
  );
  editor.revealCellRangeInView(finalSelection);
}
export {
  CellDragAndDropController,
  CellDragAndDropPart,
  performCellDropEdits
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvY2VsbERuZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBleHBhbmRDZWxsUmFuZ2VzV2l0aEhpZGRlbkNlbGxzLCBJQ2VsbFZpZXdNb2RlbCwgSU5vdGVib29rRWRpdG9yRGVsZWdhdGUgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgQ2VsbFZpZXdNb2RlbFN0YXRlQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi9ub3RlYm9va1ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgQ2VsbENvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vY2VsbFBhcnQuanMnO1xuaW1wb3J0IHsgQmFzZUNlbGxSZW5kZXJUZW1wbGF0ZSwgSU5vdGVib29rQ2VsbExpc3QgfSBmcm9tICcuLi9ub3RlYm9va1JlbmRlcmluZ0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBjbG9uZU5vdGVib29rQ2VsbFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va0NlbGxUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlLCBJQ2VsbE1vdmVFZGl0LCBTZWxlY3Rpb25TdGF0ZVR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgY2VsbFJhbmdlc1RvSW5kZXhlcywgSUNlbGxSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va1JhbmdlLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5jb25zdCBEUkFHR0lOR19DTEFTUyA9ICdjZWxsLWRyYWdnaW5nJztcbmNvbnN0IEdMT0JBTF9EUkFHX0NMQVNTID0gJ2dsb2JhbC1kcmFnLWFjdGl2ZSc7XG5cbnR5cGUgRHJhZ0ltYWdlUHJvdmlkZXIgPSAoKSA9PiBIVE1MRWxlbWVudDtcblxuaW50ZXJmYWNlIENlbGxEcmFnRXZlbnQge1xuXHRicm93c2VyRXZlbnQ6IERyYWdFdmVudDtcblx0ZHJhZ2dlZE92ZXJDZWxsOiBJQ2VsbFZpZXdNb2RlbDtcblx0Y2VsbFRvcDogbnVtYmVyO1xuXHRjZWxsSGVpZ2h0OiBudW1iZXI7XG5cdGRyYWdQb3NSYXRpbzogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgQ2VsbERyYWdBbmREcm9wUGFydCBleHRlbmRzIENlbGxDb250ZW50UGFydCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlkUmVuZGVyQ2VsbChlbGVtZW50OiBJQ2VsbFZpZXdNb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlKGVsZW1lbnQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlU3RhdGUoZWxlbWVudDogSUNlbGxWaWV3TW9kZWwsIGU6IENlbGxWaWV3TW9kZWxTdGF0ZUNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGUuZHJhZ1N0YXRlQ2hhbmdlZCkge1xuXHRcdFx0dGhpcy51cGRhdGUoZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGUoZWxlbWVudDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKERSQUdHSU5HX0NMQVNTLCBlbGVtZW50LmRyYWdnaW5nKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2VsbERyYWdBbmREcm9wQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHQvLyBUT0RPQHJvYmxvdXJlbnMgLSBzaG91bGQgcHJvYmFibHkgdXNlIGRhdGFUcmFuc2ZlciBoZXJlLCBidXQgYW55IGRhdGFUcmFuc2ZlciBzZXQgbWFrZXMgdGhlIGVkaXRvciB0aGluayBJIGFtIGRyb3BwaW5nIGEgZmlsZSwgbmVlZFxuXHQvLyB0byBmaWd1cmUgb3V0IGhvdyB0byBwcmV2ZW50IHRoYXRcblx0cHJpdmF0ZSBjdXJyZW50RHJhZ2dlZENlbGw6IElDZWxsVmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGRyYWdnZWRDZWxsczogSUNlbGxWaWV3TW9kZWxbXSA9IFtdO1xuXG5cdHByaXZhdGUgbGlzdEluc2VydGlvbkluZGljYXRvcjogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBsaXN0ITogSU5vdGVib29rQ2VsbExpc3Q7XG5cblx0cHJpdmF0ZSBpc1Njcm9sbGluZyA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNjcm9sbGluZ0RlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBsaXN0T25XaWxsU2Nyb2xsTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RlYm9va0xpc3RDb250YWluZXI6IEhUTUxFbGVtZW50XG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmxpc3RJbnNlcnRpb25JbmRpY2F0b3IgPSBET00uYXBwZW5kKG5vdGVib29rTGlzdENvbnRhaW5lciwgJCgnLmNlbGwtbGlzdC1pbnNlcnRpb24taW5kaWNhdG9yJykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihub3RlYm9va0xpc3RDb250YWluZXIub3duZXJEb2N1bWVudC5ib2R5LCBET00uRXZlbnRUeXBlLkRSQUdfU1RBUlQsIHRoaXMub25HbG9iYWxEcmFnU3RhcnQuYmluZCh0aGlzKSwgdHJ1ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobm90ZWJvb2tMaXN0Q29udGFpbmVyLm93bmVyRG9jdW1lbnQuYm9keSwgRE9NLkV2ZW50VHlwZS5EUkFHX0VORCwgdGhpcy5vbkdsb2JhbERyYWdFbmQuYmluZCh0aGlzKSwgdHJ1ZSkpO1xuXG5cdFx0Y29uc3QgYWRkQ2VsbERyYWdMaXN0ZW5lciA9IChldmVudFR5cGU6IHN0cmluZywgaGFuZGxlcjogKGU6IENlbGxEcmFnRXZlbnQpID0+IHZvaWQsIHVzZUNhcHR1cmUgPSBmYWxzZSkgPT4ge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihcblx0XHRcdFx0bm90ZWJvb2tFZGl0b3IuZ2V0RG9tTm9kZSgpLFxuXHRcdFx0XHRldmVudFR5cGUsXG5cdFx0XHRcdGUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNlbGxEcmFnRXZlbnQgPSB0aGlzLnRvQ2VsbERyYWdFdmVudChlKTtcblx0XHRcdFx0XHRpZiAoY2VsbERyYWdFdmVudCkge1xuXHRcdFx0XHRcdFx0aGFuZGxlcihjZWxsRHJhZ0V2ZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHVzZUNhcHR1cmUpKTtcblx0XHR9O1xuXG5cdFx0YWRkQ2VsbERyYWdMaXN0ZW5lcihET00uRXZlbnRUeXBlLkRSQUdfT1ZFUiwgZXZlbnQgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmN1cnJlbnREcmFnZ2VkQ2VsbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRldmVudC5icm93c2VyRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRoaXMub25DZWxsRHJhZ292ZXIoZXZlbnQpO1xuXHRcdH0sIHRydWUpO1xuXHRcdGFkZENlbGxEcmFnTGlzdGVuZXIoRE9NLkV2ZW50VHlwZS5EUk9QLCBldmVudCA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuY3VycmVudERyYWdnZWRDZWxsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGV2ZW50LmJyb3dzZXJFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5vbkNlbGxEcm9wKGV2ZW50KTtcblx0XHR9KTtcblx0XHRhZGRDZWxsRHJhZ0xpc3RlbmVyKERPTS5FdmVudFR5cGUuRFJBR19MRUFWRSwgZXZlbnQgPT4ge1xuXHRcdFx0ZXZlbnQuYnJvd3NlckV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLm9uQ2VsbERyYWdMZWF2ZShldmVudCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnNjcm9sbGluZ0RlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcigyMDApKTtcblx0fVxuXG5cdHNldExpc3QodmFsdWU6IElOb3RlYm9va0NlbGxMaXN0KSB7XG5cdFx0dGhpcy5saXN0ID0gdmFsdWU7XG5cblx0XHR0aGlzLmxpc3RPbldpbGxTY3JvbGxMaXN0ZW5lci52YWx1ZSA9IHRoaXMubGlzdC5vbldpbGxTY3JvbGwoZSA9PiB7XG5cdFx0XHRpZiAoIWUuc2Nyb2xsVG9wQ2hhbmdlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuc2V0SW5zZXJ0SW5kaWNhdG9yVmlzaWJpbGl0eShmYWxzZSk7XG5cdFx0XHR0aGlzLmlzU2Nyb2xsaW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMuc2Nyb2xsaW5nRGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdFx0dGhpcy5pc1Njcm9sbGluZyA9IGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHNldEluc2VydEluZGljYXRvclZpc2liaWxpdHkodmlzaWJsZTogYm9vbGVhbikge1xuXHRcdHRoaXMubGlzdEluc2VydGlvbkluZGljYXRvci5zdHlsZS5vcGFjaXR5ID0gdmlzaWJsZSA/ICcxJyA6ICcwJztcblx0fVxuXG5cdHByaXZhdGUgdG9DZWxsRHJhZ0V2ZW50KGV2ZW50OiBEcmFnRXZlbnQpOiBDZWxsRHJhZ0V2ZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0YXJnZXRUb3AgPSB0aGlzLm5vdGVib29rTGlzdENvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS50b3A7XG5cdFx0Y29uc3QgZHJhZ09mZnNldCA9IHRoaXMubGlzdC5zY3JvbGxUb3AgKyBldmVudC5jbGllbnRZIC0gdGFyZ2V0VG9wO1xuXHRcdGNvbnN0IGRyYWdnZWRPdmVyQ2VsbCA9IHRoaXMubGlzdC5lbGVtZW50QXQoZHJhZ09mZnNldCk7XG5cdFx0aWYgKCFkcmFnZ2VkT3ZlckNlbGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbFRvcCA9IHRoaXMubGlzdC5nZXRDZWxsVmlld1Njcm9sbFRvcChkcmFnZ2VkT3ZlckNlbGwpO1xuXHRcdGNvbnN0IGNlbGxIZWlnaHQgPSB0aGlzLmxpc3QuZWxlbWVudEhlaWdodChkcmFnZ2VkT3ZlckNlbGwpO1xuXG5cdFx0Y29uc3QgZHJhZ1Bvc0luRWxlbWVudCA9IGRyYWdPZmZzZXQgLSBjZWxsVG9wO1xuXHRcdGNvbnN0IGRyYWdQb3NSYXRpbyA9IGRyYWdQb3NJbkVsZW1lbnQgLyBjZWxsSGVpZ2h0O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGJyb3dzZXJFdmVudDogZXZlbnQsXG5cdFx0XHRkcmFnZ2VkT3ZlckNlbGwsXG5cdFx0XHRjZWxsVG9wLFxuXHRcdFx0Y2VsbEhlaWdodCxcblx0XHRcdGRyYWdQb3NSYXRpb1xuXHRcdH07XG5cdH1cblxuXHRjbGVhckdsb2JhbERyYWdTdGF0ZSgpIHtcblx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKS5jbGFzc0xpc3QucmVtb3ZlKEdMT0JBTF9EUkFHX0NMQVNTKTtcblx0fVxuXG5cdHByaXZhdGUgb25HbG9iYWxEcmFnU3RhcnQoKSB7XG5cdFx0dGhpcy5ub3RlYm9va0VkaXRvci5nZXREb21Ob2RlKCkuY2xhc3NMaXN0LmFkZChHTE9CQUxfRFJBR19DTEFTUyk7XG5cdH1cblxuXHRwcml2YXRlIG9uR2xvYmFsRHJhZ0VuZCgpIHtcblx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKS5jbGFzc0xpc3QucmVtb3ZlKEdMT0JBTF9EUkFHX0NMQVNTKTtcblx0fVxuXG5cdHByaXZhdGUgb25DZWxsRHJhZ292ZXIoZXZlbnQ6IENlbGxEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIWV2ZW50LmJyb3dzZXJFdmVudC5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuY3VycmVudERyYWdnZWRDZWxsKSB7XG5cdFx0XHRldmVudC5icm93c2VyRXZlbnQuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnbm9uZSc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNTY3JvbGxpbmcgfHwgdGhpcy5jdXJyZW50RHJhZ2dlZENlbGwgPT09IGV2ZW50LmRyYWdnZWRPdmVyQ2VsbCkge1xuXHRcdFx0dGhpcy5zZXRJbnNlcnRJbmRpY2F0b3JWaXNpYmlsaXR5KGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkcm9wRGlyZWN0aW9uID0gdGhpcy5nZXREcm9wSW5zZXJ0RGlyZWN0aW9uKGV2ZW50LmRyYWdQb3NSYXRpbyk7XG5cdFx0Y29uc3QgaW5zZXJ0aW9uSW5kaWNhdG9yQWJzb2x1dGVQb3MgPSBkcm9wRGlyZWN0aW9uID09PSAnYWJvdmUnID8gZXZlbnQuY2VsbFRvcCA6IGV2ZW50LmNlbGxUb3AgKyBldmVudC5jZWxsSGVpZ2h0O1xuXHRcdHRoaXMudXBkYXRlSW5zZXJ0SW5kaWNhdG9yKGRyb3BEaXJlY3Rpb24sIGluc2VydGlvbkluZGljYXRvckFic29sdXRlUG9zKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSW5zZXJ0SW5kaWNhdG9yKGRyb3BEaXJlY3Rpb246IHN0cmluZywgaW5zZXJ0aW9uSW5kaWNhdG9yQWJzb2x1dGVQb3M6IG51bWJlcikge1xuXHRcdGNvbnN0IHsgYm90dG9tVG9vbGJhckdhcCB9ID0gdGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuY29tcHV0ZUJvdHRvbVRvb2xiYXJEaW1lbnNpb25zKHRoaXMubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsPy52aWV3VHlwZSk7XG5cdFx0Y29uc3QgaW5zZXJ0aW9uSW5kaWNhdG9yVG9wID0gaW5zZXJ0aW9uSW5kaWNhdG9yQWJzb2x1dGVQb3MgLSB0aGlzLmxpc3Quc2Nyb2xsVG9wICsgYm90dG9tVG9vbGJhckdhcCAvIDI7XG5cdFx0aWYgKGluc2VydGlvbkluZGljYXRvclRvcCA+PSAwKSB7XG5cdFx0XHR0aGlzLmxpc3RJbnNlcnRpb25JbmRpY2F0b3Iuc3R5bGUudG9wID0gYCR7aW5zZXJ0aW9uSW5kaWNhdG9yVG9wfXB4YDtcblx0XHRcdHRoaXMuc2V0SW5zZXJ0SW5kaWNhdG9yVmlzaWJpbGl0eSh0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZXRJbnNlcnRJbmRpY2F0b3JWaXNpYmlsaXR5KGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldERyb3BJbnNlcnREaXJlY3Rpb24oZHJhZ1Bvc1JhdGlvOiBudW1iZXIpOiAnYWJvdmUnIHwgJ2JlbG93JyB7XG5cdFx0cmV0dXJuIGRyYWdQb3NSYXRpbyA8IDAuNSA/ICdhYm92ZScgOiAnYmVsb3cnO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNlbGxEcm9wKGV2ZW50OiBDZWxsRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZHJhZ2dlZENlbGwgPSB0aGlzLmN1cnJlbnREcmFnZ2VkQ2VsbCE7XG5cblx0XHRpZiAodGhpcy5pc1Njcm9sbGluZyB8fCB0aGlzLmN1cnJlbnREcmFnZ2VkQ2VsbCA9PT0gZXZlbnQuZHJhZ2dlZE92ZXJDZWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5kcmFnQ2xlYW51cCgpO1xuXG5cdFx0Y29uc3QgZHJvcERpcmVjdGlvbiA9IHRoaXMuZ2V0RHJvcEluc2VydERpcmVjdGlvbihldmVudC5kcmFnUG9zUmF0aW8pO1xuXHRcdHRoaXMuX2Ryb3BJbXBsKGRyYWdnZWRDZWxsLCBkcm9wRGlyZWN0aW9uLCBldmVudC5icm93c2VyRXZlbnQsIGV2ZW50LmRyYWdnZWRPdmVyQ2VsbCk7XG5cdH1cblxuXHRwcml2YXRlIGdldENlbGxSYW5nZUFyb3VuZERyYWdUYXJnZXQoZHJhZ2dlZENlbGxJbmRleDogbnVtYmVyKSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGNvbnN0IG1vZGVsUmFuZ2VzID0gZXhwYW5kQ2VsbFJhbmdlc1dpdGhIaWRkZW5DZWxscyh0aGlzLm5vdGVib29rRWRpdG9yLCBzZWxlY3Rpb25zKTtcblx0XHRjb25zdCBuZWFyZXN0UmFuZ2UgPSBtb2RlbFJhbmdlcy5maW5kKHJhbmdlID0+IHJhbmdlLnN0YXJ0IDw9IGRyYWdnZWRDZWxsSW5kZXggJiYgZHJhZ2dlZENlbGxJbmRleCA8IHJhbmdlLmVuZCk7XG5cblx0XHRpZiAobmVhcmVzdFJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gbmVhcmVzdFJhbmdlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4geyBzdGFydDogZHJhZ2dlZENlbGxJbmRleCwgZW5kOiBkcmFnZ2VkQ2VsbEluZGV4ICsgMSB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Ryb3BJbXBsKGRyYWdnZWRDZWxsOiBJQ2VsbFZpZXdNb2RlbCwgZHJvcERpcmVjdGlvbjogJ2Fib3ZlJyB8ICdiZWxvdycsIGN0eDogeyBjdHJsS2V5OiBib29sZWFuOyBhbHRLZXk6IGJvb2xlYW4gfSwgZHJhZ2dlZE92ZXJDZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdGNvbnN0IGNlbGxUb3AgPSB0aGlzLmxpc3QuZ2V0Q2VsbFZpZXdTY3JvbGxUb3AoZHJhZ2dlZE92ZXJDZWxsKTtcblx0XHRjb25zdCBjZWxsSGVpZ2h0ID0gdGhpcy5saXN0LmVsZW1lbnRIZWlnaHQoZHJhZ2dlZE92ZXJDZWxsKTtcblx0XHRjb25zdCBpbnNlcnRpb25JbmRpY2F0b3JBYnNvbHV0ZVBvcyA9IGRyb3BEaXJlY3Rpb24gPT09ICdhYm92ZScgPyBjZWxsVG9wIDogY2VsbFRvcCArIGNlbGxIZWlnaHQ7XG5cdFx0Y29uc3QgeyBib3R0b21Ub29sYmFyR2FwIH0gPSB0aGlzLm5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5jb21wdXRlQm90dG9tVG9vbGJhckRpbWVuc2lvbnModGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWw/LnZpZXdUeXBlKTtcblx0XHRjb25zdCBpbnNlcnRpb25JbmRpY2F0b3JUb3AgPSBpbnNlcnRpb25JbmRpY2F0b3JBYnNvbHV0ZVBvcyAtIHRoaXMubGlzdC5zY3JvbGxUb3AgKyBib3R0b21Ub29sYmFyR2FwIC8gMjtcblx0XHRjb25zdCBlZGl0b3JIZWlnaHQgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5oZWlnaHQ7XG5cdFx0aWYgKGluc2VydGlvbkluZGljYXRvclRvcCA8IDAgfHwgaW5zZXJ0aW9uSW5kaWNhdG9yVG9wID4gZWRpdG9ySGVpZ2h0KSB7XG5cdFx0XHQvLyBJZ25vcmUgZHJvcCwgaW5zZXJ0aW9uIHBvaW50IGlzIG9mZi1zY3JlZW5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc0NvcHkgPSAoY3R4LmN0cmxLZXkgJiYgIXBsYXRmb3JtLmlzTWFjaW50b3NoKSB8fCAoY3R4LmFsdEtleSAmJiBwbGF0Zm9ybS5pc01hY2ludG9zaCk7XG5cblx0XHRpZiAoIXRoaXMubm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsO1xuXG5cdFx0aWYgKGlzQ29weSkge1xuXHRcdFx0Y29uc3QgZHJhZ2dlZENlbGxJbmRleCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEluZGV4KGRyYWdnZWRDZWxsKTtcblx0XHRcdGNvbnN0IHJhbmdlID0gdGhpcy5nZXRDZWxsUmFuZ2VBcm91bmREcmFnVGFyZ2V0KGRyYWdnZWRDZWxsSW5kZXgpO1xuXG5cdFx0XHRsZXQgb3JpZ2luYWxUb0lkeCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEluZGV4KGRyYWdnZWRPdmVyQ2VsbCk7XG5cdFx0XHRpZiAoZHJvcERpcmVjdGlvbiA9PT0gJ2JlbG93Jykge1xuXHRcdFx0XHRjb25zdCByZWxhdGl2ZVRvSW5kZXggPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxJbmRleChkcmFnZ2VkT3ZlckNlbGwpO1xuXHRcdFx0XHRjb25zdCBuZXdJZHggPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldE5leHRWaXNpYmxlQ2VsbEluZGV4KHJlbGF0aXZlVG9JbmRleCk7XG5cdFx0XHRcdG9yaWdpbmFsVG9JZHggPSBuZXdJZHg7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBmaW5hbFNlbGVjdGlvbjogSUNlbGxSYW5nZTtcblx0XHRcdGxldCBmaW5hbEZvY3VzOiBJQ2VsbFJhbmdlO1xuXG5cdFx0XHRpZiAob3JpZ2luYWxUb0lkeCA8PSByYW5nZS5zdGFydCkge1xuXHRcdFx0XHRmaW5hbFNlbGVjdGlvbiA9IHsgc3RhcnQ6IG9yaWdpbmFsVG9JZHgsIGVuZDogb3JpZ2luYWxUb0lkeCArIHJhbmdlLmVuZCAtIHJhbmdlLnN0YXJ0IH07XG5cdFx0XHRcdGZpbmFsRm9jdXMgPSB7IHN0YXJ0OiBvcmlnaW5hbFRvSWR4ICsgZHJhZ2dlZENlbGxJbmRleCAtIHJhbmdlLnN0YXJ0LCBlbmQ6IG9yaWdpbmFsVG9JZHggKyBkcmFnZ2VkQ2VsbEluZGV4IC0gcmFuZ2Uuc3RhcnQgKyAxIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBkZWx0YSA9IChvcmlnaW5hbFRvSWR4IC0gcmFuZ2Uuc3RhcnQpO1xuXHRcdFx0XHRmaW5hbFNlbGVjdGlvbiA9IHsgc3RhcnQ6IHJhbmdlLnN0YXJ0ICsgZGVsdGEsIGVuZDogcmFuZ2UuZW5kICsgZGVsdGEgfTtcblx0XHRcdFx0ZmluYWxGb2N1cyA9IHsgc3RhcnQ6IGRyYWdnZWRDZWxsSW5kZXggKyBkZWx0YSwgZW5kOiBkcmFnZ2VkQ2VsbEluZGV4ICsgZGVsdGEgKyAxIH07XG5cdFx0XHR9XG5cblx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0XHRpbmRleDogb3JpZ2luYWxUb0lkeCxcblx0XHRcdFx0XHRjb3VudDogMCxcblx0XHRcdFx0XHRjZWxsczogY2VsbFJhbmdlc1RvSW5kZXhlcyhbcmFuZ2VdKS5tYXAoaW5kZXggPT4gY2xvbmVOb3RlYm9va0NlbGxUZXh0TW9kZWwodGhpcy5ub3RlYm9va0VkaXRvci5jZWxsQXQoaW5kZXgpIS5tb2RlbCkpXG5cdFx0XHRcdH1cblx0XHRcdF0sIHRydWUsIHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogdGhpcy5ub3RlYm9va0VkaXRvci5nZXRGb2N1cygpLCBzZWxlY3Rpb25zOiB0aGlzLm5vdGVib29rRWRpdG9yLmdldFNlbGVjdGlvbnMoKSB9LCAoKSA9PiAoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiBmaW5hbEZvY3VzLCBzZWxlY3Rpb25zOiBbZmluYWxTZWxlY3Rpb25dIH0pLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5yZXZlYWxDZWxsUmFuZ2VJblZpZXcoZmluYWxTZWxlY3Rpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwZXJmb3JtQ2VsbERyb3BFZGl0cyh0aGlzLm5vdGVib29rRWRpdG9yLCBkcmFnZ2VkQ2VsbCwgZHJvcERpcmVjdGlvbiwgZHJhZ2dlZE92ZXJDZWxsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uQ2VsbERyYWdMZWF2ZShldmVudDogQ2VsbERyYWdFdmVudCk6IHZvaWQge1xuXHRcdGlmICghZXZlbnQuYnJvd3NlckV2ZW50LnJlbGF0ZWRUYXJnZXQgfHwgIURPTS5pc0FuY2VzdG9yKGV2ZW50LmJyb3dzZXJFdmVudC5yZWxhdGVkVGFyZ2V0IGFzIEhUTUxFbGVtZW50LCB0aGlzLm5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKSkpIHtcblx0XHRcdHRoaXMuc2V0SW5zZXJ0SW5kaWNhdG9yVmlzaWJpbGl0eShmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkcmFnQ2xlYW51cCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jdXJyZW50RHJhZ2dlZENlbGwpIHtcblx0XHRcdHRoaXMuZHJhZ2dlZENlbGxzLmZvckVhY2goY2VsbCA9PiBjZWxsLmRyYWdnaW5nID0gZmFsc2UpO1xuXHRcdFx0dGhpcy5jdXJyZW50RHJhZ2dlZENlbGwgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmRyYWdnZWRDZWxscyA9IFtdO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0SW5zZXJ0SW5kaWNhdG9yVmlzaWJpbGl0eShmYWxzZSk7XG5cdH1cblxuXHRyZWdpc3RlckRyYWdIYW5kbGUodGVtcGxhdGVEYXRhOiBCYXNlQ2VsbFJlbmRlclRlbXBsYXRlLCBjZWxsUm9vdDogSFRNTEVsZW1lbnQsIGRyYWdIYW5kbGVzOiBIVE1MRWxlbWVudFtdLCBkcmFnSW1hZ2VQcm92aWRlcjogRHJhZ0ltYWdlUHJvdmlkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0ZW1wbGF0ZURhdGEuY29udGFpbmVyO1xuXHRcdGZvciAoY29uc3QgZHJhZ0hhbmRsZSBvZiBkcmFnSGFuZGxlcykge1xuXHRcdFx0ZHJhZ0hhbmRsZS5zZXRBdHRyaWJ1dGUoJ2RyYWdnYWJsZScsICd0cnVlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb25EcmFnRW5kID0gKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLm5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5nZXREaXNwbGF5T3B0aW9ucygpLmRyYWdBbmREcm9wRW5hYmxlZCB8fCAhIXRoaXMubm90ZWJvb2tFZGl0b3IuaXNSZWFkT25seSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE5vdGUsIHRlbXBsYXRlRGF0YSBtYXkgaGF2ZSBhIGRpZmZlcmVudCBlbGVtZW50IHJlbmRlcmVkIGludG8gaXQgYnkgbm93XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShEUkFHR0lOR19DTEFTUyk7XG5cdFx0XHR0aGlzLmRyYWdDbGVhbnVwKCk7XG5cdFx0fTtcblx0XHRmb3IgKGNvbnN0IGRyYWdIYW5kbGUgb2YgZHJhZ0hhbmRsZXMpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRyYWdIYW5kbGUsIERPTS5FdmVudFR5cGUuRFJBR19FTkQsIG9uRHJhZ0VuZCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9uRHJhZ1N0YXJ0ID0gKGV2ZW50OiBEcmFnRXZlbnQpID0+IHtcblx0XHRcdGlmICghZXZlbnQuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLm5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5nZXREaXNwbGF5T3B0aW9ucygpLmRyYWdBbmREcm9wRW5hYmxlZCB8fCAhIXRoaXMubm90ZWJvb2tFZGl0b3IuaXNSZWFkT25seSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY3VycmVudERyYWdnZWRDZWxsID0gdGVtcGxhdGVEYXRhLmN1cnJlbnRSZW5kZXJlZENlbGwhO1xuXHRcdFx0dGhpcy5kcmFnZ2VkQ2VsbHMgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldFNlbGVjdGlvbnMoKS5tYXAocmFuZ2UgPT4gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsc0luUmFuZ2UocmFuZ2UpKS5mbGF0KCk7XG5cdFx0XHR0aGlzLmRyYWdnZWRDZWxscy5mb3JFYWNoKGNlbGwgPT4gY2VsbC5kcmFnZ2luZyA9IHRydWUpO1xuXG5cdFx0XHRjb25zdCBkcmFnSW1hZ2UgPSBkcmFnSW1hZ2VQcm92aWRlcigpO1xuXHRcdFx0Y2VsbFJvb3QucGFyZW50RWxlbWVudCEuYXBwZW5kQ2hpbGQoZHJhZ0ltYWdlKTtcblx0XHRcdGV2ZW50LmRhdGFUcmFuc2Zlci5zZXREcmFnSW1hZ2UoZHJhZ0ltYWdlLCAwLCAwKTtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4gZHJhZ0ltYWdlLnJlbW92ZSgpLCAwKTsgLy8gQ29tbWVudCB0aGlzIG91dCB0byBkZWJ1ZyBkcmFnIGltYWdlIGxheW91dFxuXHRcdH07XG5cdFx0Zm9yIChjb25zdCBkcmFnSGFuZGxlIG9mIGRyYWdIYW5kbGVzKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihkcmFnSGFuZGxlLCBET00uRXZlbnRUeXBlLkRSQUdfU1RBUlQsIG9uRHJhZ1N0YXJ0KSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHN0YXJ0RXhwbGljaXREcmFnKGNlbGw6IElDZWxsVmlld01vZGVsLCBfZHJhZ09mZnNldFk6IG51bWJlcikge1xuXHRcdGlmICghdGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuZ2V0RGlzcGxheU9wdGlvbnMoKS5kcmFnQW5kRHJvcEVuYWJsZWQgfHwgISF0aGlzLm5vdGVib29rRWRpdG9yLmlzUmVhZE9ubHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnREcmFnZ2VkQ2VsbCA9IGNlbGw7XG5cdFx0dGhpcy5zZXRJbnNlcnRJbmRpY2F0b3JWaXNpYmlsaXR5KHRydWUpO1xuXHR9XG5cblx0cHVibGljIGV4cGxpY2l0RHJhZyhjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgZHJhZ09mZnNldFk6IG51bWJlcikge1xuXHRcdGlmICghdGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuZ2V0RGlzcGxheU9wdGlvbnMoKS5kcmFnQW5kRHJvcEVuYWJsZWQgfHwgISF0aGlzLm5vdGVib29rRWRpdG9yLmlzUmVhZE9ubHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLmxpc3QuZWxlbWVudEF0KGRyYWdPZmZzZXRZKTtcblx0XHRpZiAodGFyZ2V0ICYmIHRhcmdldCAhPT0gY2VsbCkge1xuXHRcdFx0Y29uc3QgY2VsbFRvcCA9IHRoaXMubGlzdC5nZXRDZWxsVmlld1Njcm9sbFRvcCh0YXJnZXQpO1xuXHRcdFx0Y29uc3QgY2VsbEhlaWdodCA9IHRoaXMubGlzdC5lbGVtZW50SGVpZ2h0KHRhcmdldCk7XG5cblx0XHRcdGNvbnN0IGRyb3BEaXJlY3Rpb24gPSB0aGlzLmdldEV4cGxpY2l0RHJhZ0Ryb3BEaXJlY3Rpb24oZHJhZ09mZnNldFksIGNlbGxUb3AsIGNlbGxIZWlnaHQpO1xuXHRcdFx0Y29uc3QgaW5zZXJ0aW9uSW5kaWNhdG9yQWJzb2x1dGVQb3MgPSBkcm9wRGlyZWN0aW9uID09PSAnYWJvdmUnID8gY2VsbFRvcCA6IGNlbGxUb3AgKyBjZWxsSGVpZ2h0O1xuXHRcdFx0dGhpcy51cGRhdGVJbnNlcnRJbmRpY2F0b3IoZHJvcERpcmVjdGlvbiwgaW5zZXJ0aW9uSW5kaWNhdG9yQWJzb2x1dGVQb3MpO1xuXHRcdH1cblxuXHRcdC8vIFRyeSBzY3JvbGxpbmcgbGlzdCBpZiBuZWVkZWRcblx0XHRpZiAodGhpcy5jdXJyZW50RHJhZ2dlZENlbGwgIT09IGNlbGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBub3RlYm9va1ZpZXdSZWN0ID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXREb21Ob2RlKCkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgZXZlbnRQb3NpdGlvbkluVmlldyA9IGRyYWdPZmZzZXRZIC0gdGhpcy5saXN0LnNjcm9sbFRvcDtcblxuXHRcdC8vIFBlcmNlbnRhZ2UgZnJvbSB0aGUgdG9wL2JvdHRvbSBvZiB0aGUgc2NyZWVuIHdoZXJlIHdlIHN0YXJ0IHNjcm9sbGluZyB3aGlsZSBkcmFnZ2luZ1xuXHRcdGNvbnN0IG5vdGVib29rVmlld1Njcm9sbE1hcmdpbnMgPSAwLjI7XG5cblx0XHRjb25zdCBtYXhTY3JvbGxEZWx0YVBlckZyYW1lID0gMjA7XG5cblx0XHRjb25zdCBldmVudFBvc2l0aW9uUmF0aW8gPSBldmVudFBvc2l0aW9uSW5WaWV3IC8gbm90ZWJvb2tWaWV3UmVjdC5oZWlnaHQ7XG5cdFx0aWYgKGV2ZW50UG9zaXRpb25SYXRpbyA8IG5vdGVib29rVmlld1Njcm9sbE1hcmdpbnMpIHtcblx0XHRcdHRoaXMubGlzdC5zY3JvbGxUb3AgLT0gbWF4U2Nyb2xsRGVsdGFQZXJGcmFtZSAqICgxIC0gZXZlbnRQb3NpdGlvblJhdGlvIC8gbm90ZWJvb2tWaWV3U2Nyb2xsTWFyZ2lucyk7XG5cdFx0fSBlbHNlIGlmIChldmVudFBvc2l0aW9uUmF0aW8gPiAxIC0gbm90ZWJvb2tWaWV3U2Nyb2xsTWFyZ2lucykge1xuXHRcdFx0dGhpcy5saXN0LnNjcm9sbFRvcCArPSBtYXhTY3JvbGxEZWx0YVBlckZyYW1lICogKDEgLSAoKDEgLSBldmVudFBvc2l0aW9uUmF0aW8pIC8gbm90ZWJvb2tWaWV3U2Nyb2xsTWFyZ2lucykpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBlbmRFeHBsaWNpdERyYWcoX2NlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0dGhpcy5zZXRJbnNlcnRJbmRpY2F0b3JWaXNpYmlsaXR5KGZhbHNlKTtcblx0fVxuXG5cdHB1YmxpYyBleHBsaWNpdERyb3AoY2VsbDogSUNlbGxWaWV3TW9kZWwsIGN0eDogeyBkcmFnT2Zmc2V0WTogbnVtYmVyOyBjdHJsS2V5OiBib29sZWFuOyBhbHRLZXk6IGJvb2xlYW4gfSkge1xuXHRcdHRoaXMuY3VycmVudERyYWdnZWRDZWxsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuc2V0SW5zZXJ0SW5kaWNhdG9yVmlzaWJpbGl0eShmYWxzZSk7XG5cblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLmxpc3QuZWxlbWVudEF0KGN0eC5kcmFnT2Zmc2V0WSk7XG5cdFx0aWYgKCF0YXJnZXQgfHwgdGFyZ2V0ID09PSBjZWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbFRvcCA9IHRoaXMubGlzdC5nZXRDZWxsVmlld1Njcm9sbFRvcCh0YXJnZXQpO1xuXHRcdGNvbnN0IGNlbGxIZWlnaHQgPSB0aGlzLmxpc3QuZWxlbWVudEhlaWdodCh0YXJnZXQpO1xuXHRcdGNvbnN0IGRyb3BEaXJlY3Rpb24gPSB0aGlzLmdldEV4cGxpY2l0RHJhZ0Ryb3BEaXJlY3Rpb24oY3R4LmRyYWdPZmZzZXRZLCBjZWxsVG9wLCBjZWxsSGVpZ2h0KTtcblx0XHR0aGlzLl9kcm9wSW1wbChjZWxsLCBkcm9wRGlyZWN0aW9uLCBjdHgsIHRhcmdldCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEV4cGxpY2l0RHJhZ0Ryb3BEaXJlY3Rpb24oY2xpZW50WTogbnVtYmVyLCBjZWxsVG9wOiBudW1iZXIsIGNlbGxIZWlnaHQ6IG51bWJlcikge1xuXHRcdGNvbnN0IGRyYWdQb3NJbkVsZW1lbnQgPSBjbGllbnRZIC0gY2VsbFRvcDtcblx0XHRjb25zdCBkcmFnUG9zUmF0aW8gPSBkcmFnUG9zSW5FbGVtZW50IC8gY2VsbEhlaWdodDtcblxuXHRcdHJldHVybiB0aGlzLmdldERyb3BJbnNlcnREaXJlY3Rpb24oZHJhZ1Bvc1JhdGlvKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5ub3RlYm9va0VkaXRvciA9IG51bGwhO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGVyZm9ybUNlbGxEcm9wRWRpdHMoZWRpdG9yOiBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSwgZHJhZ2dlZENlbGw6IElDZWxsVmlld01vZGVsLCBkcm9wRGlyZWN0aW9uOiAnYWJvdmUnIHwgJ2JlbG93JywgZHJhZ2dlZE92ZXJDZWxsOiBJQ2VsbFZpZXdNb2RlbCk6IHZvaWQge1xuXHRjb25zdCBkcmFnZ2VkQ2VsbEluZGV4ID0gZWRpdG9yLmdldENlbGxJbmRleChkcmFnZ2VkQ2VsbCkhO1xuXHRsZXQgb3JpZ2luYWxUb0lkeCA9IGVkaXRvci5nZXRDZWxsSW5kZXgoZHJhZ2dlZE92ZXJDZWxsKSE7XG5cblx0aWYgKHR5cGVvZiBkcmFnZ2VkQ2VsbEluZGV4ICE9PSAnbnVtYmVyJyB8fCB0eXBlb2Ygb3JpZ2luYWxUb0lkeCAhPT0gJ251bWJlcicpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBJZiBkcm9wcGVkIG9uIGEgZm9sZGVkIG1hcmtkb3duIHJhbmdlLCBpbnNlcnQgYWZ0ZXIgdGhlIGZvbGRpbmcgcmFuZ2Vcblx0aWYgKGRyb3BEaXJlY3Rpb24gPT09ICdiZWxvdycpIHtcblx0XHRjb25zdCBuZXdJZHggPSBlZGl0b3IuZ2V0TmV4dFZpc2libGVDZWxsSW5kZXgob3JpZ2luYWxUb0lkeCkgPz8gb3JpZ2luYWxUb0lkeDtcblx0XHRvcmlnaW5hbFRvSWR4ID0gbmV3SWR4O1xuXHR9XG5cblx0bGV0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRpZiAoIXNlbGVjdGlvbnMubGVuZ3RoKSB7XG5cdFx0c2VsZWN0aW9ucyA9IFtlZGl0b3IuZ2V0Rm9jdXMoKV07XG5cdH1cblxuXHRsZXQgb3JpZ2luYWxGb2N1c0lkeCA9IGVkaXRvci5nZXRGb2N1cygpLnN0YXJ0O1xuXG5cdC8vIElmIHRoZSBkcmFnZ2VkIGNlbGwgaXMgbm90IGZvY3VzZWQvc2VsZWN0ZWQsIGlnbm9yZSB0aGUgY3VycmVudCBmb2N1cy9zZWxlY3Rpb24gYW5kIHVzZSB0aGUgZHJhZ2dlZCBpZHhcblx0aWYgKCFzZWxlY3Rpb25zLnNvbWUocyA9PiBzLnN0YXJ0IDw9IGRyYWdnZWRDZWxsSW5kZXggJiYgcy5lbmQgPiBkcmFnZ2VkQ2VsbEluZGV4KSkge1xuXHRcdHNlbGVjdGlvbnMgPSBbeyBzdGFydDogZHJhZ2dlZENlbGxJbmRleCwgZW5kOiBkcmFnZ2VkQ2VsbEluZGV4ICsgMSB9XTtcblx0XHRvcmlnaW5hbEZvY3VzSWR4ID0gZHJhZ2dlZENlbGxJbmRleDtcblx0fVxuXG5cdGNvbnN0IGRyb3BwZWRJblNlbGVjdGlvbiA9IHNlbGVjdGlvbnMuZmluZChyYW5nZSA9PiByYW5nZS5zdGFydCA8PSBvcmlnaW5hbFRvSWR4ICYmIHJhbmdlLmVuZCA+IG9yaWdpbmFsVG9JZHgpO1xuXHRpZiAoZHJvcHBlZEluU2VsZWN0aW9uKSB7XG5cdFx0b3JpZ2luYWxUb0lkeCA9IGRyb3BwZWRJblNlbGVjdGlvbi5zdGFydDtcblx0fVxuXG5cblx0bGV0IG51bUNlbGxzID0gMDtcblx0bGV0IGZvY3VzTmV3SWR4ID0gb3JpZ2luYWxUb0lkeDtcblx0bGV0IG5ld0luc2VydGlvbklkeCA9IG9yaWdpbmFsVG9JZHg7XG5cblx0Ly8gQ29tcHV0ZSBhIHNldCBvZiBlZGl0cyB3aGljaCB3aWxsIGJlIGFwcGxpZWQgaW4gcmV2ZXJzZSBvcmRlciBieSB0aGUgbm90ZWJvb2sgdGV4dCBtb2RlbC5cblx0Ly8gYGluZGV4YDogdGhlIHN0YXJ0aW5nIGluZGV4IG9mIHRoZSByYW5nZSwgYWZ0ZXIgcHJldmlvdXMgZWRpdHMgaGF2ZSBiZWVuIGFwcGxpZWRcblx0Ly8gYG5ld0lkeGA6IHRoZSBkZXN0aW5hdGlvbiBpbmRleCwgYWZ0ZXIgdGhpcyBlZGl0J3MgcmFuZ2UgaGFzIGJlZW4gcmVtb3ZlZFxuXHRzZWxlY3Rpb25zLnNvcnQoKGEsIGIpID0+IGIuc3RhcnQgLSBhLnN0YXJ0KTtcblx0Y29uc3QgZWRpdHMgPSBzZWxlY3Rpb25zLm1hcChyYW5nZSA9PiB7XG5cdFx0Y29uc3QgbGVuZ3RoID0gcmFuZ2UuZW5kIC0gcmFuZ2Uuc3RhcnQ7XG5cblx0XHQvLyBJZiB0aGlzIHJhbmdlIGlzIGJlZm9yZSB0aGUgaW5zZXJ0aW9uIHBvaW50LCBzdWJ0cmFjdCB0aGUgY2VsbHMgaW4gdGhpcyByYW5nZSBmcm9tIHRoZSBcInRvXCIgaW5kZXhcblx0XHRsZXQgdG9JbmRleERlbHRhID0gMDtcblx0XHRpZiAocmFuZ2UuZW5kIDw9IG5ld0luc2VydGlvbklkeCkge1xuXHRcdFx0dG9JbmRleERlbHRhID0gLWxlbmd0aDtcblx0XHR9XG5cblx0XHRjb25zdCBuZXdJZHggPSBuZXdJbnNlcnRpb25JZHggKyB0b0luZGV4RGVsdGE7XG5cblx0XHQvLyBJZiB0aGlzIHJhbmdlIGNvbnRhaW5zIHRoZSBmb2N1c2VkIGNlbGwsIHNldCB0aGUgbmV3IGZvY3VzIGluZGV4IHRvIHRoZSBuZXcgaW5kZXggb2YgdGhlIGNlbGxcblx0XHRpZiAob3JpZ2luYWxGb2N1c0lkeCA+PSByYW5nZS5zdGFydCAmJiBvcmlnaW5hbEZvY3VzSWR4IDw9IHJhbmdlLmVuZCkge1xuXHRcdFx0Y29uc3Qgb2Zmc2V0ID0gb3JpZ2luYWxGb2N1c0lkeCAtIHJhbmdlLnN0YXJ0O1xuXHRcdFx0Zm9jdXNOZXdJZHggPSBuZXdJZHggKyBvZmZzZXQ7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgYmVsb3cgdGhlIGluc2VydGlvbiBwb2ludCwgdGhlIG9yaWdpbmFsIGluZGV4IHdpbGwgaGF2ZSBiZWVuIHNoaWZ0ZWQgZG93blxuXHRcdGNvbnN0IGZyb21JbmRleERlbHRhID0gcmFuZ2Uuc3RhcnQgPj0gb3JpZ2luYWxUb0lkeCA/IG51bUNlbGxzIDogMDtcblxuXHRcdGNvbnN0IGVkaXQ6IElDZWxsTW92ZUVkaXQgPSB7XG5cdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1vdmUsXG5cdFx0XHRpbmRleDogcmFuZ2Uuc3RhcnQgKyBmcm9tSW5kZXhEZWx0YSxcblx0XHRcdGxlbmd0aCxcblx0XHRcdG5ld0lkeFxuXHRcdH07XG5cdFx0bnVtQ2VsbHMgKz0gbGVuZ3RoO1xuXG5cdFx0Ly8gSWYgYSByYW5nZSB3YXMgbW92ZWQgZG93biwgdGhlIGluc2VydGlvbiBpbmRleCBuZWVkcyB0byBiZSBhZGp1c3RlZFxuXHRcdGlmIChyYW5nZS5lbmQgPCBuZXdJbnNlcnRpb25JZHgpIHtcblx0XHRcdG5ld0luc2VydGlvbklkeCAtPSBsZW5ndGg7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXQ7XG5cdH0pO1xuXG5cdGNvbnN0IGxhc3RFZGl0ID0gZWRpdHNbZWRpdHMubGVuZ3RoIC0gMV07XG5cdGNvbnN0IGZpbmFsU2VsZWN0aW9uID0geyBzdGFydDogbGFzdEVkaXQubmV3SWR4LCBlbmQ6IGxhc3RFZGl0Lm5ld0lkeCArIG51bUNlbGxzIH07XG5cdGNvbnN0IGZpbmFsRm9jdXMgPSB7IHN0YXJ0OiBmb2N1c05ld0lkeCwgZW5kOiBmb2N1c05ld0lkeCArIDEgfTtcblxuXHRlZGl0b3IudGV4dE1vZGVsIS5hcHBseUVkaXRzKFxuXHRcdGVkaXRzLFxuXHRcdHRydWUsXG5cdFx0eyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiBlZGl0b3IuZ2V0Rm9jdXMoKSwgc2VsZWN0aW9uczogZWRpdG9yLmdldFNlbGVjdGlvbnMoKSB9LFxuXHRcdCgpID0+ICh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IGZpbmFsRm9jdXMsIHNlbGVjdGlvbnM6IFtmaW5hbFNlbGVjdGlvbl0gfSksXG5cdFx0dW5kZWZpbmVkLCB0cnVlKTtcblx0ZWRpdG9yLnJldmVhbENlbGxSYW5nZUluVmlldyhmaW5hbFNlbGVjdGlvbik7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSx5QkFBeUI7QUFDOUMsWUFBWSxjQUFjO0FBQzFCLFNBQVMsdUNBQWdGO0FBRXpGLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsY0FBNkIsMEJBQTBCO0FBQ2hFLFNBQVMsMkJBQXVDO0FBRWhELE1BQU0sSUFBSSxJQUFJO0FBRWQsTUFBTSxpQkFBaUI7QUFDdkIsTUFBTSxvQkFBb0I7QUFZbkIsTUFBTSw0QkFBNEIsZ0JBQWdCO0FBQUEsRUFDeEQsWUFDa0IsV0FDaEI7QUFDRCxVQUFNO0FBRlc7QUFBQSxFQUdsQjtBQUFBLEVBRVMsY0FBYyxTQUErQjtBQUNyRCxTQUFLLE9BQU8sT0FBTztBQUFBLEVBQ3BCO0FBQUEsRUFFUyxZQUFZLFNBQXlCLEdBQXdDO0FBQ3JGLFFBQUksRUFBRSxrQkFBa0I7QUFDdkIsV0FBSyxPQUFPLE9BQU87QUFBQSxJQUNw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LFdBQVcsS0FBSyxXQUFTLE1BQU0sU0FBUyxpQkFBaUIsTUFBTSxNQUFNLGFBQWE7QUFDN0csTUFBSSxvQkFBb0I7QUFDdkIsb0JBQWdCLG1CQUFtQjtBQUFBLEVBQ3BDO0FBR0EsTUFBSSxXQUFXO0FBQ2YsTUFBSSxjQUFjO0FBQ2xCLE1BQUksa0JBQWtCO0FBS3RCLGFBQVcsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLFFBQVEsRUFBRSxLQUFLO0FBQzNDLFFBQU0sUUFBUSxXQUFXLElBQUksV0FBUztBQUNyQyxVQUFNLFNBQVMsTUFBTSxNQUFNLE1BQU07QUFHakMsUUFBSSxlQUFlO0FBQ25CLFFBQUksTUFBTSxPQUFPLGlCQUFpQjtBQUNqQyxxQkFBZSxDQUFDO0FBQUEsSUFDakI7QUFFQSxVQUFNLFNBQVMsa0JBQWtCO0FBR2pDLFFBQUksb0JBQW9CLE1BQU0sU0FBUyxvQkFBb0IsTUFBTSxLQUFLO0FBQ3JFLFlBQU0sU0FBUyxtQkFBbUIsTUFBTTtBQUN4QyxvQkFBYyxTQUFTO0FBQUEsSUFDeEI7QUFHQSxVQUFNLGlCQUFpQixNQUFNLFNBQVMsZ0JBQWdCLFdBQVc7QUFFakUsVUFBTSxPQUFzQjtBQUFBLE1BQzNCLFVBQVUsYUFBYTtBQUFBLE1BQ3ZCLE9BQU8sTUFBTSxRQUFRO0FBQUEsTUFDckI7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLGdCQUFZO0FBR1osUUFBSSxNQUFNLE1BQU0saUJBQWlCO0FBQ2hDLHlCQUFtQjtBQUFBLElBQ3BCO0FBRUEsV0FBTztBQUFBLEVBQ1IsQ0FBQztBQUVELFFBQU0sV0FBVyxNQUFNLE1BQU0sU0FBUyxDQUFDO0FBQ3ZDLFFBQU0saUJBQWlCLEVBQUUsT0FBTyxTQUFTLFFBQVEsS0FBSyxTQUFTLFNBQVMsU0FBUztBQUNqRixRQUFNLGFBQWEsRUFBRSxPQUFPLGFBQWEsS0FBSyxjQUFjLEVBQUU7QUFFOUQsU0FBTyxVQUFXO0FBQUEsSUFDakI7QUFBQSxJQUNBO0FBQUEsSUFDQSxFQUFFLE1BQU0sbUJBQW1CLE9BQU8sT0FBTyxPQUFPLFNBQVMsR0FBRyxZQUFZLE9BQU8sY0FBYyxFQUFFO0FBQUEsSUFDL0YsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLE9BQU8sT0FBTyxZQUFZLFlBQVksQ0FBQyxjQUFjLEVBQUU7QUFBQSxJQUN6RjtBQUFBLElBQVc7QUFBQSxFQUFJO0FBQ2hCLFNBQU8sc0JBQXNCLGNBQWM7QUFDNUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
