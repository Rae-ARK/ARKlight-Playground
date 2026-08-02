import { CellEditType, NotebookCellsChangeType } from "../../../../notebook/common/notebookCommon.js";
import { sortCellChanges } from "./notebookCellChanges.js";
function adjustCellDiffForKeepingADeletedCell(originalCellIndex, cellDiffInfo, applyEdits) {
  const edit = { cells: [], count: 1, editType: CellEditType.Replace, index: originalCellIndex };
  applyEdits([edit], true, void 0, () => void 0, void 0, true);
  const diffs = sortCellChanges(cellDiffInfo).filter((d) => !(d.type === "delete" && d.originalCellIndex === originalCellIndex)).map((diff) => {
    if (diff.type !== "insert" && diff.originalCellIndex > originalCellIndex) {
      return {
        ...diff,
        originalCellIndex: diff.originalCellIndex - 1
      };
    }
    return diff;
  });
  return diffs;
}
function adjustCellDiffForRevertingADeletedCell(originalCellIndex, cellDiffInfo, cellToInsert, applyEdits, createModifiedCellDiffInfo) {
  cellDiffInfo = sortCellChanges(cellDiffInfo);
  const indexOfEntry = cellDiffInfo.findIndex((d) => d.originalCellIndex === originalCellIndex);
  if (indexOfEntry === -1) {
    return cellDiffInfo;
  }
  let modifiedCellIndex = -1;
  for (let i = 0; i < cellDiffInfo.length; i++) {
    const diff = cellDiffInfo[i];
    if (i < indexOfEntry) {
      modifiedCellIndex = Math.max(modifiedCellIndex, diff.modifiedCellIndex ?? modifiedCellIndex);
      continue;
    }
    if (i === indexOfEntry) {
      const edit = { cells: [cellToInsert], count: 0, editType: CellEditType.Replace, index: modifiedCellIndex + 1 };
      applyEdits([edit], true, void 0, () => void 0, void 0, true);
      cellDiffInfo[i] = createModifiedCellDiffInfo(modifiedCellIndex + 1, originalCellIndex);
      continue;
    } else {
      if (typeof diff.modifiedCellIndex === "number") {
        diff.modifiedCellIndex++;
        cellDiffInfo[i] = { ...diff };
      }
    }
  }
  return cellDiffInfo;
}
function adjustCellDiffForRevertingAnInsertedCell(modifiedCellIndex, cellDiffInfo, applyEdits) {
  if (modifiedCellIndex === -1) {
    return cellDiffInfo;
  }
  cellDiffInfo = sortCellChanges(cellDiffInfo).filter((d) => !(d.type === "insert" && d.modifiedCellIndex === modifiedCellIndex)).map((d) => {
    if (d.type === "insert" && d.modifiedCellIndex === modifiedCellIndex) {
      return d;
    }
    if (d.type !== "delete" && d.modifiedCellIndex > modifiedCellIndex) {
      return {
        ...d,
        modifiedCellIndex: d.modifiedCellIndex - 1
      };
    }
    return d;
  });
  const edit = { cells: [], count: 1, editType: CellEditType.Replace, index: modifiedCellIndex };
  applyEdits([edit], true, void 0, () => void 0, void 0, true);
  return cellDiffInfo;
}
function adjustCellDiffForKeepingAnInsertedCell(modifiedCellIndex, cellDiffInfo, cellToInsert, applyEdits, createModifiedCellDiffInfo) {
  cellDiffInfo = sortCellChanges(cellDiffInfo);
  if (modifiedCellIndex === -1) {
    return cellDiffInfo;
  }
  const indexOfEntry = cellDiffInfo.findIndex((d) => d.modifiedCellIndex === modifiedCellIndex);
  if (indexOfEntry === -1) {
    return cellDiffInfo;
  }
  let originalCellIndex = -1;
  for (let i = 0; i < cellDiffInfo.length; i++) {
    const diff = cellDiffInfo[i];
    if (i < indexOfEntry) {
      originalCellIndex = Math.max(originalCellIndex, diff.originalCellIndex ?? originalCellIndex);
      continue;
    }
    if (i === indexOfEntry) {
      const edit = { cells: [cellToInsert], count: 0, editType: CellEditType.Replace, index: originalCellIndex + 1 };
      applyEdits([edit], true, void 0, () => void 0, void 0, true);
      cellDiffInfo[i] = createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex + 1);
      continue;
    } else {
      if (typeof diff.originalCellIndex === "number") {
        diff.originalCellIndex++;
        cellDiffInfo[i] = { ...diff };
      }
    }
  }
  return cellDiffInfo;
}
function adjustCellDiffAndOriginalModelBasedOnCellAddDelete(change, cellDiffInfo, modifiedModelCellCount, originalModelCellCount, applyEdits, createModifiedCellDiffInfo) {
  cellDiffInfo = sortCellChanges(cellDiffInfo);
  const numberOfCellsInserted = change[2].length;
  const numberOfCellsDeleted = change[1];
  const cells = change[2].map((cell) => {
    return {
      cellKind: cell.cellKind,
      language: cell.language,
      metadata: cell.metadata,
      outputs: cell.outputs,
      source: cell.getValue(),
      mime: void 0,
      internalMetadata: cell.internalMetadata
    };
  });
  let diffEntryIndex = -1;
  let indexToInsertInOriginalModel = void 0;
  if (cells.length) {
    for (let i = 0; i < cellDiffInfo.length; i++) {
      const diff = cellDiffInfo[i];
      if (typeof diff.modifiedCellIndex === "number" && diff.modifiedCellIndex === change[0]) {
        diffEntryIndex = i;
        if (typeof diff.originalCellIndex === "number") {
          indexToInsertInOriginalModel = diff.originalCellIndex;
        }
        break;
      }
      if (typeof diff.originalCellIndex === "number") {
        indexToInsertInOriginalModel = diff.originalCellIndex + 1;
      }
    }
    const edit = {
      editType: CellEditType.Replace,
      cells,
      index: indexToInsertInOriginalModel ?? 0,
      count: change[1]
    };
    applyEdits([edit], true, void 0, () => void 0, void 0, true);
  }
  if (numberOfCellsDeleted) {
    let numberOfOriginalCellsRemovedSoFar = 0;
    let numberOfModifiedCellsRemovedSoFar = 0;
    const modifiedIndexesToRemove = /* @__PURE__ */ new Set();
    for (let i = 0; i < numberOfCellsDeleted; i++) {
      modifiedIndexesToRemove.add(change[0] + i);
    }
    const itemsToRemove = /* @__PURE__ */ new Set();
    for (let i = 0; i < cellDiffInfo.length; i++) {
      const diff = cellDiffInfo[i];
      if (i < diffEntryIndex) {
        continue;
      }
      let changed = false;
      if (typeof diff.modifiedCellIndex === "number" && modifiedIndexesToRemove.has(diff.modifiedCellIndex)) {
        numberOfModifiedCellsRemovedSoFar++;
        if (typeof diff.originalCellIndex === "number") {
          numberOfOriginalCellsRemovedSoFar++;
        }
        itemsToRemove.add(diff);
        continue;
      }
      if (typeof diff.modifiedCellIndex === "number" && numberOfModifiedCellsRemovedSoFar) {
        diff.modifiedCellIndex -= numberOfModifiedCellsRemovedSoFar;
        changed = true;
      }
      if (typeof diff.originalCellIndex === "number" && numberOfOriginalCellsRemovedSoFar) {
        diff.originalCellIndex -= numberOfOriginalCellsRemovedSoFar;
        changed = true;
      }
      if (changed) {
        cellDiffInfo[i] = { ...diff };
      }
    }
    if (itemsToRemove.size) {
      Array.from(itemsToRemove).filter((diff) => typeof diff.originalCellIndex === "number").forEach((diff) => {
        const edit = {
          editType: CellEditType.Replace,
          cells: [],
          index: diff.originalCellIndex,
          count: 1
        };
        applyEdits([edit], true, void 0, () => void 0, void 0, true);
      });
    }
    cellDiffInfo = cellDiffInfo.filter((d) => !itemsToRemove.has(d));
  }
  if (numberOfCellsInserted && diffEntryIndex >= 0) {
    for (let i = 0; i < cellDiffInfo.length; i++) {
      const diff = cellDiffInfo[i];
      if (i < diffEntryIndex) {
        continue;
      }
      let changed = false;
      if (typeof diff.modifiedCellIndex === "number") {
        diff.modifiedCellIndex += numberOfCellsInserted;
        changed = true;
      }
      if (typeof diff.originalCellIndex === "number") {
        diff.originalCellIndex += numberOfCellsInserted;
        changed = true;
      }
      if (changed) {
        cellDiffInfo[i] = { ...diff };
      }
    }
  }
  cells.forEach((_, i) => {
    const originalCellIndex = i + (indexToInsertInOriginalModel ?? 0);
    const modifiedCellIndex = change[0] + i;
    const unchangedCell = createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex);
    cellDiffInfo.splice((diffEntryIndex === -1 ? cellDiffInfo.length : diffEntryIndex) + i, 0, unchangedCell);
  });
  return cellDiffInfo;
}
function adjustCellDiffAndOriginalModelBasedOnCellMovements(event, cellDiffInfo) {
  const minimumIndex = Math.min(event.index, event.newIdx);
  const maximumIndex = Math.max(event.index, event.newIdx);
  const cellDiffs = cellDiffInfo.slice();
  const indexOfEntry = cellDiffs.findIndex((d) => d.modifiedCellIndex === event.index);
  const indexOfEntryToPlaceBelow = cellDiffs.findIndex((d) => d.modifiedCellIndex === event.newIdx);
  if (indexOfEntry === -1 || indexOfEntryToPlaceBelow === -1) {
    return void 0;
  }
  const entryToBeMoved = { ...cellDiffs[indexOfEntry] };
  const moveDirection = event.newIdx > event.index ? "down" : "up";
  const startIndex = cellDiffs.findIndex((d) => d.modifiedCellIndex === minimumIndex);
  const endIndex = cellDiffs.findIndex((d) => d.modifiedCellIndex === maximumIndex);
  const movingExistingCell = typeof entryToBeMoved.originalCellIndex === "number";
  let originalCellsWereEffected = false;
  for (let i = 0; i < cellDiffs.length; i++) {
    const diff = cellDiffs[i];
    let changed = false;
    if (moveDirection === "down") {
      if (i > startIndex && i <= endIndex) {
        if (typeof diff.modifiedCellIndex === "number") {
          changed = true;
          diff.modifiedCellIndex = diff.modifiedCellIndex - 1;
        }
        if (typeof diff.originalCellIndex === "number" && movingExistingCell) {
          diff.originalCellIndex = diff.originalCellIndex - 1;
          originalCellsWereEffected = true;
          changed = true;
        }
      }
    } else {
      if (i >= startIndex && i < endIndex) {
        if (typeof diff.modifiedCellIndex === "number") {
          changed = true;
          diff.modifiedCellIndex = diff.modifiedCellIndex + 1;
        }
        if (typeof diff.originalCellIndex === "number" && movingExistingCell) {
          diff.originalCellIndex = diff.originalCellIndex + 1;
          originalCellsWereEffected = true;
          changed = true;
        }
      }
    }
    if (changed) {
      cellDiffs[i] = { ...diff };
    }
  }
  entryToBeMoved.modifiedCellIndex = event.newIdx;
  const originalCellIndex = entryToBeMoved.originalCellIndex;
  if (moveDirection === "down") {
    cellDiffs.splice(endIndex + 1, 0, entryToBeMoved);
    cellDiffs.splice(startIndex, 1);
    if (typeof entryToBeMoved.originalCellIndex === "number") {
      entryToBeMoved.originalCellIndex = cellDiffs.slice(0, endIndex).reduce((lastOriginalIndex, diff) => typeof diff.originalCellIndex === "number" ? Math.max(lastOriginalIndex, diff.originalCellIndex) : lastOriginalIndex, -1) + 1;
    }
  } else {
    cellDiffs.splice(endIndex, 1);
    cellDiffs.splice(startIndex, 0, entryToBeMoved);
    if (typeof entryToBeMoved.originalCellIndex === "number") {
      entryToBeMoved.originalCellIndex = cellDiffs.slice(0, startIndex).reduce((lastOriginalIndex, diff) => typeof diff.originalCellIndex === "number" ? Math.max(lastOriginalIndex, diff.originalCellIndex) : lastOriginalIndex, -1) + 1;
    }
  }
  if (typeof entryToBeMoved.originalCellIndex === "number" && originalCellsWereEffected && typeof originalCellIndex === "number" && entryToBeMoved.originalCellIndex !== originalCellIndex) {
    const edit = {
      editType: CellEditType.Move,
      index: originalCellIndex,
      length: event.length,
      newIdx: entryToBeMoved.originalCellIndex
    };
    return [cellDiffs, [edit]];
  }
  return [cellDiffs, []];
}
function getCorrespondingOriginalCellIndex(modifiedCellIndex, cellDiffInfo) {
  const entry = cellDiffInfo.find((d) => d.modifiedCellIndex === modifiedCellIndex);
  return entry?.originalCellIndex;
}
function isTransientIPyNbExtensionEvent(notebookKind, e) {
  if (notebookKind !== "jupyter-notebook") {
    return false;
  }
  if (e.rawEvents.every((event) => {
    if (event.kind !== NotebookCellsChangeType.ChangeCellMetadata) {
      return false;
    }
    if (JSON.stringify(event.metadata || {}) === JSON.stringify({ execution_count: null, metadata: {} })) {
      return true;
    }
    return true;
  })) {
    return true;
  }
  return false;
}
function calculateNotebookRewriteRatio(cellsDiff, originalModel, modifiedModel) {
  const totalNumberOfUpdatedLines = cellsDiff.reduce((totalUpdatedLines, value) => {
    const getUpadtedLineCount = () => {
      if (value.type === "unchanged") {
        return 0;
      }
      if (value.type === "delete") {
        return originalModel.cells[value.originalCellIndex].textModel?.getLineCount() ?? 0;
      }
      if (value.type === "insert") {
        return modifiedModel.cells[value.modifiedCellIndex].textModel?.getLineCount() ?? 0;
      }
      return value.diff.get().changes.reduce((maxLineNumber, change) => {
        return Math.max(maxLineNumber, change.modified.endLineNumberExclusive);
      }, 0);
    };
    return totalUpdatedLines + getUpadtedLineCount();
  }, 0);
  const totalNumberOfLines = modifiedModel.cells.reduce((totalLines, cell) => totalLines + (cell.textModel?.getLineCount() ?? 0), 0);
  return totalNumberOfLines === 0 ? 0 : Math.min(1, totalNumberOfUpdatedLines / totalNumberOfLines);
}
export {
  adjustCellDiffAndOriginalModelBasedOnCellAddDelete,
  adjustCellDiffAndOriginalModelBasedOnCellMovements,
  adjustCellDiffForKeepingADeletedCell,
  adjustCellDiffForKeepingAnInsertedCell,
  adjustCellDiffForRevertingADeletedCell,
  adjustCellDiffForRevertingAnInsertedCell,
  calculateNotebookRewriteRatio,
  getCorrespondingOriginalCellIndex,
  isTransientIPyNbExtensionEvent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9ub3RlYm9vay9oZWxwZXJzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlLCBJQ2VsbCwgSUNlbGxEdG8yLCBJQ2VsbEVkaXRPcGVyYXRpb24sIElDZWxsUmVwbGFjZUVkaXQsIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLCBOb3RlYm9va0NlbGxzTW9kZWxNb3ZlRXZlbnQsIE5vdGVib29rQ2VsbFRleHRNb2RlbFNwbGljZSwgTm90ZWJvb2tUZXh0TW9kZWxDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSUNlbGxEaWZmSW5mbywgc29ydENlbGxDaGFuZ2VzIH0gZnJvbSAnLi9ub3RlYm9va0NlbGxDaGFuZ2VzLmpzJztcblxuXG5leHBvcnQgZnVuY3Rpb24gYWRqdXN0Q2VsbERpZmZGb3JLZWVwaW5nQURlbGV0ZWRDZWxsKG9yaWdpbmFsQ2VsbEluZGV4OiBudW1iZXIsXG5cdGNlbGxEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdLFxuXHRhcHBseUVkaXRzOiB0eXBlb2YgTm90ZWJvb2tUZXh0TW9kZWwucHJvdG90eXBlLmFwcGx5RWRpdHMsXG4pOiBJQ2VsbERpZmZJbmZvW10ge1xuXHQvLyBEZWxldGUgdGhpcyBjZWxsIGZyb20gb3JpZ2luYWwgYXMgd2VsbC5cblx0Y29uc3QgZWRpdDogSUNlbGxSZXBsYWNlRWRpdCA9IHsgY2VsbHM6IFtdLCBjb3VudDogMSwgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogb3JpZ2luYWxDZWxsSW5kZXgsIH07XG5cdGFwcGx5RWRpdHMoW2VkaXRdLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0Y29uc3QgZGlmZnMgPSBzb3J0Q2VsbENoYW5nZXMoY2VsbERpZmZJbmZvKVxuXHRcdC5maWx0ZXIoZCA9PiAhKGQudHlwZSA9PT0gJ2RlbGV0ZScgJiYgZC5vcmlnaW5hbENlbGxJbmRleCA9PT0gb3JpZ2luYWxDZWxsSW5kZXgpKVxuXHRcdC5tYXAoZGlmZiA9PiB7XG5cdFx0XHRpZiAoZGlmZi50eXBlICE9PSAnaW5zZXJ0JyAmJiBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ID4gb3JpZ2luYWxDZWxsSW5kZXgpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5kaWZmLFxuXHRcdFx0XHRcdG9yaWdpbmFsQ2VsbEluZGV4OiBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4IC0gMSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBkaWZmO1xuXHRcdH0pO1xuXHRyZXR1cm4gZGlmZnM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGp1c3RDZWxsRGlmZkZvclJldmVydGluZ0FEZWxldGVkQ2VsbChvcmlnaW5hbENlbGxJbmRleDogbnVtYmVyLFxuXHRjZWxsRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSxcblx0Y2VsbFRvSW5zZXJ0OiBJQ2VsbER0bzIsXG5cdGFwcGx5RWRpdHM6IHR5cGVvZiBOb3RlYm9va1RleHRNb2RlbC5wcm90b3R5cGUuYXBwbHlFZGl0cyxcblx0Y3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm86IChtb2RpZmllZENlbGxJbmRleDogbnVtYmVyLCBvcmlnaW5hbENlbGxJbmRleDogbnVtYmVyKSA9PiBJQ2VsbERpZmZJbmZvLFxuKTogSUNlbGxEaWZmSW5mb1tdIHtcblx0Y2VsbERpZmZJbmZvID0gc29ydENlbGxDaGFuZ2VzKGNlbGxEaWZmSW5mbyk7XG5cdGNvbnN0IGluZGV4T2ZFbnRyeSA9IGNlbGxEaWZmSW5mby5maW5kSW5kZXgoZCA9PiBkLm9yaWdpbmFsQ2VsbEluZGV4ID09PSBvcmlnaW5hbENlbGxJbmRleCk7XG5cdGlmIChpbmRleE9mRW50cnkgPT09IC0xKSB7XG5cdFx0Ly8gTm90IHBvc3NpYmxlLlxuXHRcdHJldHVybiBjZWxsRGlmZkluZm87XG5cdH1cblxuXHRsZXQgbW9kaWZpZWRDZWxsSW5kZXggPSAtMTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjZWxsRGlmZkluZm8ubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBkaWZmID0gY2VsbERpZmZJbmZvW2ldO1xuXHRcdGlmIChpIDwgaW5kZXhPZkVudHJ5KSB7XG5cdFx0XHRtb2RpZmllZENlbGxJbmRleCA9IE1hdGgubWF4KG1vZGlmaWVkQ2VsbEluZGV4LCBkaWZmLm1vZGlmaWVkQ2VsbEluZGV4ID8/IG1vZGlmaWVkQ2VsbEluZGV4KTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoaSA9PT0gaW5kZXhPZkVudHJ5KSB7XG5cdFx0XHRjb25zdCBlZGl0OiBJQ2VsbFJlcGxhY2VFZGl0ID0geyBjZWxsczogW2NlbGxUb0luc2VydF0sIGNvdW50OiAwLCBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiBtb2RpZmllZENlbGxJbmRleCArIDEsIH07XG5cdFx0XHRhcHBseUVkaXRzKFtlZGl0XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRjZWxsRGlmZkluZm9baV0gPSBjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyhtb2RpZmllZENlbGxJbmRleCArIDEsIG9yaWdpbmFsQ2VsbEluZGV4KTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBJbmNyZWFzZSB0aGUgb3JpZ2luYWwgaW5kZXggZm9yIGFsbCBlbnRyaWVzIGFmdGVyIHRoaXMuXG5cdFx0XHRpZiAodHlwZW9mIGRpZmYubW9kaWZpZWRDZWxsSW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGRpZmYubW9kaWZpZWRDZWxsSW5kZXgrKztcblx0XHRcdFx0Y2VsbERpZmZJbmZvW2ldID0geyAuLi5kaWZmIH07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGNlbGxEaWZmSW5mbztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkanVzdENlbGxEaWZmRm9yUmV2ZXJ0aW5nQW5JbnNlcnRlZENlbGwobW9kaWZpZWRDZWxsSW5kZXg6IG51bWJlcixcblx0Y2VsbERpZmZJbmZvOiBJQ2VsbERpZmZJbmZvW10sXG5cdGFwcGx5RWRpdHM6IHR5cGVvZiBOb3RlYm9va1RleHRNb2RlbC5wcm90b3R5cGUuYXBwbHlFZGl0cyxcbik6IElDZWxsRGlmZkluZm9bXSB7XG5cdGlmIChtb2RpZmllZENlbGxJbmRleCA9PT0gLTEpIHtcblx0XHQvLyBOb3QgcG9zc2libGUuXG5cdFx0cmV0dXJuIGNlbGxEaWZmSW5mbztcblx0fVxuXHRjZWxsRGlmZkluZm8gPSBzb3J0Q2VsbENoYW5nZXMoY2VsbERpZmZJbmZvKVxuXHRcdC5maWx0ZXIoZCA9PiAhKGQudHlwZSA9PT0gJ2luc2VydCcgJiYgZC5tb2RpZmllZENlbGxJbmRleCA9PT0gbW9kaWZpZWRDZWxsSW5kZXgpKVxuXHRcdC5tYXAoZCA9PiB7XG5cdFx0XHRpZiAoZC50eXBlID09PSAnaW5zZXJ0JyAmJiBkLm1vZGlmaWVkQ2VsbEluZGV4ID09PSBtb2RpZmllZENlbGxJbmRleCkge1xuXHRcdFx0XHRyZXR1cm4gZDtcblx0XHRcdH1cblx0XHRcdGlmIChkLnR5cGUgIT09ICdkZWxldGUnICYmIGQubW9kaWZpZWRDZWxsSW5kZXggPiBtb2RpZmllZENlbGxJbmRleCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLmQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDZWxsSW5kZXg6IGQubW9kaWZpZWRDZWxsSW5kZXggLSAxLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGQ7XG5cdFx0fSk7XG5cdGNvbnN0IGVkaXQ6IElDZWxsUmVwbGFjZUVkaXQgPSB7IGNlbGxzOiBbXSwgY291bnQ6IDEsIGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IG1vZGlmaWVkQ2VsbEluZGV4LCB9O1xuXHRhcHBseUVkaXRzKFtlZGl0XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdHJldHVybiBjZWxsRGlmZkluZm87XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGp1c3RDZWxsRGlmZkZvcktlZXBpbmdBbkluc2VydGVkQ2VsbChtb2RpZmllZENlbGxJbmRleDogbnVtYmVyLFxuXHRjZWxsRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSxcblx0Y2VsbFRvSW5zZXJ0OiBJQ2VsbER0bzIsXG5cdGFwcGx5RWRpdHM6IHR5cGVvZiBOb3RlYm9va1RleHRNb2RlbC5wcm90b3R5cGUuYXBwbHlFZGl0cyxcblx0Y3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm86IChtb2RpZmllZENlbGxJbmRleDogbnVtYmVyLCBvcmlnaW5hbENlbGxJbmRleDogbnVtYmVyKSA9PiBJQ2VsbERpZmZJbmZvLFxuKTogSUNlbGxEaWZmSW5mb1tdIHtcblx0Y2VsbERpZmZJbmZvID0gc29ydENlbGxDaGFuZ2VzKGNlbGxEaWZmSW5mbyk7XG5cdGlmIChtb2RpZmllZENlbGxJbmRleCA9PT0gLTEpIHtcblx0XHQvLyBOb3QgcG9zc2libGUuXG5cdFx0cmV0dXJuIGNlbGxEaWZmSW5mbztcblx0fVxuXHRjb25zdCBpbmRleE9mRW50cnkgPSBjZWxsRGlmZkluZm8uZmluZEluZGV4KGQgPT4gZC5tb2RpZmllZENlbGxJbmRleCA9PT0gbW9kaWZpZWRDZWxsSW5kZXgpO1xuXHRpZiAoaW5kZXhPZkVudHJ5ID09PSAtMSkge1xuXHRcdC8vIE5vdCBwb3NzaWJsZS5cblx0XHRyZXR1cm4gY2VsbERpZmZJbmZvO1xuXHR9XG5cdGxldCBvcmlnaW5hbENlbGxJbmRleCA9IC0xO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGNlbGxEaWZmSW5mby5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGRpZmYgPSBjZWxsRGlmZkluZm9baV07XG5cdFx0aWYgKGkgPCBpbmRleE9mRW50cnkpIHtcblx0XHRcdG9yaWdpbmFsQ2VsbEluZGV4ID0gTWF0aC5tYXgob3JpZ2luYWxDZWxsSW5kZXgsIGRpZmYub3JpZ2luYWxDZWxsSW5kZXggPz8gb3JpZ2luYWxDZWxsSW5kZXgpO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChpID09PSBpbmRleE9mRW50cnkpIHtcblx0XHRcdGNvbnN0IGVkaXQ6IElDZWxsUmVwbGFjZUVkaXQgPSB7IGNlbGxzOiBbY2VsbFRvSW5zZXJ0XSwgY291bnQ6IDAsIGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IG9yaWdpbmFsQ2VsbEluZGV4ICsgMSB9O1xuXHRcdFx0YXBwbHlFZGl0cyhbZWRpdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0Y2VsbERpZmZJbmZvW2ldID0gY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8obW9kaWZpZWRDZWxsSW5kZXgsIG9yaWdpbmFsQ2VsbEluZGV4ICsgMSk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSW5jcmVhc2UgdGhlIG9yaWdpbmFsIGluZGV4IGZvciBhbGwgZW50cmllcyBhZnRlciB0aGlzLlxuXHRcdFx0aWYgKHR5cGVvZiBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRkaWZmLm9yaWdpbmFsQ2VsbEluZGV4Kys7XG5cdFx0XHRcdGNlbGxEaWZmSW5mb1tpXSA9IHsgLi4uZGlmZiB9O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gY2VsbERpZmZJbmZvO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxBZGREZWxldGUoY2hhbmdlOiBOb3RlYm9va0NlbGxUZXh0TW9kZWxTcGxpY2U8SUNlbGw+LFxuXHRjZWxsRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSxcblx0bW9kaWZpZWRNb2RlbENlbGxDb3VudDogbnVtYmVyLFxuXHRvcmlnaW5hbE1vZGVsQ2VsbENvdW50OiBudW1iZXIsXG5cdGFwcGx5RWRpdHM6IHR5cGVvZiBOb3RlYm9va1RleHRNb2RlbC5wcm90b3R5cGUuYXBwbHlFZGl0cyxcblx0Y3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm86IChtb2RpZmllZENlbGxJbmRleDogbnVtYmVyLCBvcmlnaW5hbENlbGxJbmRleDogbnVtYmVyKSA9PiBJQ2VsbERpZmZJbmZvLFxuKTogSUNlbGxEaWZmSW5mb1tdIHtcblx0Y2VsbERpZmZJbmZvID0gc29ydENlbGxDaGFuZ2VzKGNlbGxEaWZmSW5mbyk7XG5cdGNvbnN0IG51bWJlck9mQ2VsbHNJbnNlcnRlZCA9IGNoYW5nZVsyXS5sZW5ndGg7XG5cdGNvbnN0IG51bWJlck9mQ2VsbHNEZWxldGVkID0gY2hhbmdlWzFdO1xuXHRjb25zdCBjZWxscyA9IGNoYW5nZVsyXS5tYXAoY2VsbCA9PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNlbGxLaW5kOiBjZWxsLmNlbGxLaW5kLFxuXHRcdFx0bGFuZ3VhZ2U6IGNlbGwubGFuZ3VhZ2UsXG5cdFx0XHRtZXRhZGF0YTogY2VsbC5tZXRhZGF0YSxcblx0XHRcdG91dHB1dHM6IGNlbGwub3V0cHV0cyxcblx0XHRcdHNvdXJjZTogY2VsbC5nZXRWYWx1ZSgpLFxuXHRcdFx0bWltZTogdW5kZWZpbmVkLFxuXHRcdFx0aW50ZXJuYWxNZXRhZGF0YTogY2VsbC5pbnRlcm5hbE1ldGFkYXRhXG5cdFx0fSBzYXRpc2ZpZXMgSUNlbGxEdG8yO1xuXHR9KTtcblx0bGV0IGRpZmZFbnRyeUluZGV4ID0gLTE7XG5cdGxldCBpbmRleFRvSW5zZXJ0SW5PcmlnaW5hbE1vZGVsOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGlmIChjZWxscy5sZW5ndGgpIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNlbGxEaWZmSW5mby5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZGlmZiA9IGNlbGxEaWZmSW5mb1tpXTtcblx0XHRcdGlmICh0eXBlb2YgZGlmZi5tb2RpZmllZENlbGxJbmRleCA9PT0gJ251bWJlcicgJiYgZGlmZi5tb2RpZmllZENlbGxJbmRleCA9PT0gY2hhbmdlWzBdKSB7XG5cdFx0XHRcdGRpZmZFbnRyeUluZGV4ID0gaTtcblxuXHRcdFx0XHRpZiAodHlwZW9mIGRpZmYub3JpZ2luYWxDZWxsSW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0aW5kZXhUb0luc2VydEluT3JpZ2luYWxNb2RlbCA9IGRpZmYub3JpZ2luYWxDZWxsSW5kZXg7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIGRpZmYub3JpZ2luYWxDZWxsSW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGluZGV4VG9JbnNlcnRJbk9yaWdpbmFsTW9kZWwgPSBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ICsgMTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBlZGl0OiBJQ2VsbEVkaXRPcGVyYXRpb24gPSB7XG5cdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRjZWxscyxcblx0XHRcdGluZGV4OiBpbmRleFRvSW5zZXJ0SW5PcmlnaW5hbE1vZGVsID8/IDAsXG5cdFx0XHRjb3VudDogY2hhbmdlWzFdXG5cdFx0fTtcblx0XHRhcHBseUVkaXRzKFtlZGl0XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH1cblx0Ly8gSWYgY2VsbHMgd2VyZSBkZWxldGVkIHdlIGhhbmRsZWQgdGhhdCB3aXRoIHRoaXMuZGlzcG9zZURlbGV0ZWRDZWxsRW50cmllcygpO1xuXHRpZiAobnVtYmVyT2ZDZWxsc0RlbGV0ZWQpIHtcblx0XHQvLyBBZGp1c3QgdGhlIGluZGV4ZXMuXG5cdFx0bGV0IG51bWJlck9mT3JpZ2luYWxDZWxsc1JlbW92ZWRTb0ZhciA9IDA7XG5cdFx0bGV0IG51bWJlck9mTW9kaWZpZWRDZWxsc1JlbW92ZWRTb0ZhciA9IDA7XG5cdFx0Y29uc3QgbW9kaWZpZWRJbmRleGVzVG9SZW1vdmUgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG51bWJlck9mQ2VsbHNEZWxldGVkOyBpKyspIHtcblx0XHRcdG1vZGlmaWVkSW5kZXhlc1RvUmVtb3ZlLmFkZChjaGFuZ2VbMF0gKyBpKTtcblx0XHR9XG5cdFx0Y29uc3QgaXRlbXNUb1JlbW92ZSA9IG5ldyBTZXQ8SUNlbGxEaWZmSW5mbz4oKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNlbGxEaWZmSW5mby5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZGlmZiA9IGNlbGxEaWZmSW5mb1tpXTtcblx0XHRcdGlmIChpIDwgZGlmZkVudHJ5SW5kZXgpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0XHRpZiAodHlwZW9mIGRpZmYubW9kaWZpZWRDZWxsSW5kZXggPT09ICdudW1iZXInICYmIG1vZGlmaWVkSW5kZXhlc1RvUmVtb3ZlLmhhcyhkaWZmLm1vZGlmaWVkQ2VsbEluZGV4KSkge1xuXHRcdFx0XHQvLyBUaGlzIHdpbGwgYmUgcmVtb3ZlZC5cblx0XHRcdFx0bnVtYmVyT2ZNb2RpZmllZENlbGxzUmVtb3ZlZFNvRmFyKys7XG5cdFx0XHRcdGlmICh0eXBlb2YgZGlmZi5vcmlnaW5hbENlbGxJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRudW1iZXJPZk9yaWdpbmFsQ2VsbHNSZW1vdmVkU29GYXIrKztcblx0XHRcdFx0fVxuXHRcdFx0XHRpdGVtc1RvUmVtb3ZlLmFkZChkaWZmKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIGRpZmYubW9kaWZpZWRDZWxsSW5kZXggPT09ICdudW1iZXInICYmIG51bWJlck9mTW9kaWZpZWRDZWxsc1JlbW92ZWRTb0Zhcikge1xuXHRcdFx0XHRkaWZmLm1vZGlmaWVkQ2VsbEluZGV4IC09IG51bWJlck9mTW9kaWZpZWRDZWxsc1JlbW92ZWRTb0Zhcjtcblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIGRpZmYub3JpZ2luYWxDZWxsSW5kZXggPT09ICdudW1iZXInICYmIG51bWJlck9mT3JpZ2luYWxDZWxsc1JlbW92ZWRTb0Zhcikge1xuXHRcdFx0XHRkaWZmLm9yaWdpbmFsQ2VsbEluZGV4IC09IG51bWJlck9mT3JpZ2luYWxDZWxsc1JlbW92ZWRTb0Zhcjtcblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHRjZWxsRGlmZkluZm9baV0gPSB7IC4uLmRpZmYgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGl0ZW1zVG9SZW1vdmUuc2l6ZSkge1xuXHRcdFx0QXJyYXkuZnJvbShpdGVtc1RvUmVtb3ZlKVxuXHRcdFx0XHQuZmlsdGVyKGRpZmYgPT4gdHlwZW9mIGRpZmYub3JpZ2luYWxDZWxsSW5kZXggPT09ICdudW1iZXInKVxuXHRcdFx0XHQuZm9yRWFjaChkaWZmID0+IHtcblx0XHRcdFx0XHRjb25zdCBlZGl0OiBJQ2VsbEVkaXRPcGVyYXRpb24gPSB7XG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0XHRjZWxsczogW10sXG5cdFx0XHRcdFx0XHRpbmRleDogZGlmZi5vcmlnaW5hbENlbGxJbmRleCxcblx0XHRcdFx0XHRcdGNvdW50OiAxXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRhcHBseUVkaXRzKFtlZGl0XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdH0pO1xuXHRcdH1cblx0XHRjZWxsRGlmZkluZm8gPSBjZWxsRGlmZkluZm8uZmlsdGVyKGQgPT4gIWl0ZW1zVG9SZW1vdmUuaGFzKGQpKTtcblx0fVxuXG5cdGlmIChudW1iZXJPZkNlbGxzSW5zZXJ0ZWQgJiYgZGlmZkVudHJ5SW5kZXggPj0gMCkge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY2VsbERpZmZJbmZvLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBkaWZmID0gY2VsbERpZmZJbmZvW2ldO1xuXHRcdFx0aWYgKGkgPCBkaWZmRW50cnlJbmRleCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0XHRpZiAodHlwZW9mIGRpZmYubW9kaWZpZWRDZWxsSW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGRpZmYubW9kaWZpZWRDZWxsSW5kZXggKz0gbnVtYmVyT2ZDZWxsc0luc2VydGVkO1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgZGlmZi5vcmlnaW5hbENlbGxJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0ZGlmZi5vcmlnaW5hbENlbGxJbmRleCArPSBudW1iZXJPZkNlbGxzSW5zZXJ0ZWQ7XG5cdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdFx0Y2VsbERpZmZJbmZvW2ldID0geyAuLi5kaWZmIH07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gRm9yIGluc2VydGVkIGNlbGxzLCB3ZSBuZWVkIHRvIGVuc3VyZSB0aGF0IHdlIGNyZWF0ZSBhIGNvcnJlc3BvbmRpbmcgQ2VsbEVudHJ5LlxuXHQvLyBTbyB0aGF0IGFueSBlZGl0cyB0byB0aGUgaW5zZXJ0ZWQgY2VsbCBpcyBoYW5kbGVkIGFuZCBtaXJyb3JlZCBvdmVyIHRvIHRoZSBjb3JyZXNwb25kaW5nIGNlbGwgaW4gb3JpZ2luYWwgbW9kZWwuXG5cdGNlbGxzLmZvckVhY2goKF8sIGkpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbENlbGxJbmRleCA9IGkgKyAoaW5kZXhUb0luc2VydEluT3JpZ2luYWxNb2RlbCA/PyAwKTtcblx0XHRjb25zdCBtb2RpZmllZENlbGxJbmRleCA9IGNoYW5nZVswXSArIGk7XG5cdFx0Y29uc3QgdW5jaGFuZ2VkQ2VsbCA9IGNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKG1vZGlmaWVkQ2VsbEluZGV4LCBvcmlnaW5hbENlbGxJbmRleCk7XG5cdFx0Y2VsbERpZmZJbmZvLnNwbGljZSgoZGlmZkVudHJ5SW5kZXggPT09IC0xID8gY2VsbERpZmZJbmZvLmxlbmd0aCA6IGRpZmZFbnRyeUluZGV4KSArIGksIDAsIHVuY2hhbmdlZENlbGwpO1xuXHR9KTtcblx0cmV0dXJuIGNlbGxEaWZmSW5mbztcbn1cblxuLyoqXG4gKiBHaXZlbiB0aGUgbW92ZW1lbnRzIG9mIGNlbGxzIGluIG1vZGlmaWVkIG5vdGVib29rLCBhZGp1c3QgdGhlIElDZWxsRGlmZkluZm9bXSBhcnJheVxuICogYW5kIGdlbmVyYXRlIGVkaXRzIGZvciB0aGUgb2xkIG5vdGVib29rIChpZiByZXF1aXJlZCkuXG4gKiBUT0RPQERvbkpheWFtYW5uZSBIYW5kbGUgYnVsayBtb3ZlcyAobW92ZW1lbnRzIG9mIG1vcmUgdGhhbiAxIGNlbGwpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYWRqdXN0Q2VsbERpZmZBbmRPcmlnaW5hbE1vZGVsQmFzZWRPbkNlbGxNb3ZlbWVudHMoZXZlbnQ6IE5vdGVib29rQ2VsbHNNb2RlbE1vdmVFdmVudDxJQ2VsbD4sIGNlbGxEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdKTogW0lDZWxsRGlmZkluZm9bXSwgSUNlbGxFZGl0T3BlcmF0aW9uW11dIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWluaW11bUluZGV4ID0gTWF0aC5taW4oZXZlbnQuaW5kZXgsIGV2ZW50Lm5ld0lkeCk7XG5cdGNvbnN0IG1heGltdW1JbmRleCA9IE1hdGgubWF4KGV2ZW50LmluZGV4LCBldmVudC5uZXdJZHgpO1xuXHRjb25zdCBjZWxsRGlmZnMgPSBjZWxsRGlmZkluZm8uc2xpY2UoKTtcblx0Y29uc3QgaW5kZXhPZkVudHJ5ID0gY2VsbERpZmZzLmZpbmRJbmRleChkID0+IGQubW9kaWZpZWRDZWxsSW5kZXggPT09IGV2ZW50LmluZGV4KTtcblx0Y29uc3QgaW5kZXhPZkVudHJ5VG9QbGFjZUJlbG93ID0gY2VsbERpZmZzLmZpbmRJbmRleChkID0+IGQubW9kaWZpZWRDZWxsSW5kZXggPT09IGV2ZW50Lm5ld0lkeCk7XG5cdGlmIChpbmRleE9mRW50cnkgPT09IC0xIHx8IGluZGV4T2ZFbnRyeVRvUGxhY2VCZWxvdyA9PT0gLTEpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBvYmplY3Qgc28gdGhhdCB0aGUgb2JzZXJ2YWJsZSB2YWx1ZSBpcyB0cmlnZ2VyZWQuXG5cdC8vIEJlc2lkZXMgd2UnbGwgYmUgdXBkYXRpbmcgdGhlIHZhbHVlcyBvZiB0aGlzIG9iamVjdCBpbiBwbGFjZS5cblx0Y29uc3QgZW50cnlUb0JlTW92ZWQgPSB7IC4uLmNlbGxEaWZmc1tpbmRleE9mRW50cnldIH07XG5cdGNvbnN0IG1vdmVEaXJlY3Rpb24gPSBldmVudC5uZXdJZHggPiBldmVudC5pbmRleCA/ICdkb3duJyA6ICd1cCc7XG5cblxuXHRjb25zdCBzdGFydEluZGV4ID0gY2VsbERpZmZzLmZpbmRJbmRleChkID0+IGQubW9kaWZpZWRDZWxsSW5kZXggPT09IG1pbmltdW1JbmRleCk7XG5cdGNvbnN0IGVuZEluZGV4ID0gY2VsbERpZmZzLmZpbmRJbmRleChkID0+IGQubW9kaWZpZWRDZWxsSW5kZXggPT09IG1heGltdW1JbmRleCk7XG5cdGNvbnN0IG1vdmluZ0V4aXN0aW5nQ2VsbCA9IHR5cGVvZiBlbnRyeVRvQmVNb3ZlZC5vcmlnaW5hbENlbGxJbmRleCA9PT0gJ251bWJlcic7XG5cdGxldCBvcmlnaW5hbENlbGxzV2VyZUVmZmVjdGVkID0gZmFsc2U7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgY2VsbERpZmZzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgZGlmZiA9IGNlbGxEaWZmc1tpXTtcblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdGlmIChtb3ZlRGlyZWN0aW9uID09PSAnZG93bicpIHtcblx0XHRcdGlmIChpID4gc3RhcnRJbmRleCAmJiBpIDw9IGVuZEluZGV4KSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgZGlmZi5tb2RpZmllZENlbGxJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRkaWZmLm1vZGlmaWVkQ2VsbEluZGV4ID0gZGlmZi5tb2RpZmllZENlbGxJbmRleCAtIDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHR5cGVvZiBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ID09PSAnbnVtYmVyJyAmJiBtb3ZpbmdFeGlzdGluZ0NlbGwpIHtcblx0XHRcdFx0XHRkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ID0gZGlmZi5vcmlnaW5hbENlbGxJbmRleCAtIDE7XG5cdFx0XHRcdFx0b3JpZ2luYWxDZWxsc1dlcmVFZmZlY3RlZCA9IHRydWU7XG5cdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGkgPj0gc3RhcnRJbmRleCAmJiBpIDwgZW5kSW5kZXgpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBkaWZmLm1vZGlmaWVkQ2VsbEluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGRpZmYubW9kaWZpZWRDZWxsSW5kZXggPSBkaWZmLm1vZGlmaWVkQ2VsbEluZGV4ICsgMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodHlwZW9mIGRpZmYub3JpZ2luYWxDZWxsSW5kZXggPT09ICdudW1iZXInICYmIG1vdmluZ0V4aXN0aW5nQ2VsbCkge1xuXHRcdFx0XHRcdGRpZmYub3JpZ2luYWxDZWxsSW5kZXggPSBkaWZmLm9yaWdpbmFsQ2VsbEluZGV4ICsgMTtcblx0XHRcdFx0XHRvcmlnaW5hbENlbGxzV2VyZUVmZmVjdGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBDcmVhdGUgYSBuZXcgb2JqZWN0IHNvIHRoYXQgdGhlIG9ic2VydmFibGUgdmFsdWUgaXMgdHJpZ2dlcmVkLlxuXHRcdC8vIERvIG9ubHkgaWYgdGhlcmUncyBhIGNoYW5nZS5cblx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0Y2VsbERpZmZzW2ldID0geyAuLi5kaWZmIH07XG5cdFx0fVxuXHR9XG5cdGVudHJ5VG9CZU1vdmVkLm1vZGlmaWVkQ2VsbEluZGV4ID0gZXZlbnQubmV3SWR4O1xuXHRjb25zdCBvcmlnaW5hbENlbGxJbmRleCA9IGVudHJ5VG9CZU1vdmVkLm9yaWdpbmFsQ2VsbEluZGV4O1xuXHRpZiAobW92ZURpcmVjdGlvbiA9PT0gJ2Rvd24nKSB7XG5cdFx0Y2VsbERpZmZzLnNwbGljZShlbmRJbmRleCArIDEsIDAsIGVudHJ5VG9CZU1vdmVkKTtcblx0XHRjZWxsRGlmZnMuc3BsaWNlKHN0YXJ0SW5kZXgsIDEpO1xuXHRcdC8vIElmIHdlJ3JlIG1vdmluZyBhIG5ldyBjZWxsIHVwL2Rvd24sIHRoZW4gd2UgbmVlZCBqdXN0IGFkanVzdCBqdXN0IHRoZSBtb2RpZmllZCBpbmRleGVzIG9mIHRoZSBjZWxscyBpbiBiZXR3ZWVuLlxuXHRcdC8vIElmIHdlJ3JlIG1vdmluZyBhbiBleGlzdGluZyB1cC9kb3duLCB0aGVuIHdlIG5lZWQgdG8gYWRqdXN0IHRoZSBvcmlnaW5hbCBpbmRleGVzIGFzIHdlbGwuXG5cdFx0aWYgKHR5cGVvZiBlbnRyeVRvQmVNb3ZlZC5vcmlnaW5hbENlbGxJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGVudHJ5VG9CZU1vdmVkLm9yaWdpbmFsQ2VsbEluZGV4ID0gY2VsbERpZmZzLnNsaWNlKDAsIGVuZEluZGV4KS5yZWR1Y2UoKGxhc3RPcmlnaW5hbEluZGV4LCBkaWZmKSA9PiB0eXBlb2YgZGlmZi5vcmlnaW5hbENlbGxJbmRleCA9PT0gJ251bWJlcicgPyBNYXRoLm1heChsYXN0T3JpZ2luYWxJbmRleCwgZGlmZi5vcmlnaW5hbENlbGxJbmRleCkgOiBsYXN0T3JpZ2luYWxJbmRleCwgLTEpICsgMTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Y2VsbERpZmZzLnNwbGljZShlbmRJbmRleCwgMSk7XG5cdFx0Y2VsbERpZmZzLnNwbGljZShzdGFydEluZGV4LCAwLCBlbnRyeVRvQmVNb3ZlZCk7XG5cdFx0Ly8gSWYgd2UncmUgbW92aW5nIGEgbmV3IGNlbGwgdXAvZG93biwgdGhlbiB3ZSBuZWVkIGp1c3QgYWRqdXN0IGp1c3QgdGhlIG1vZGlmaWVkIGluZGV4ZXMgb2YgdGhlIGNlbGxzIGluIGJldHdlZW4uXG5cdFx0Ly8gSWYgd2UncmUgbW92aW5nIGFuIGV4aXN0aW5nIHVwL2Rvd24sIHRoZW4gd2UgbmVlZCB0byBhZGp1c3QgdGhlIG9yaWdpbmFsIGluZGV4ZXMgYXMgd2VsbC5cblx0XHRpZiAodHlwZW9mIGVudHJ5VG9CZU1vdmVkLm9yaWdpbmFsQ2VsbEluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0ZW50cnlUb0JlTW92ZWQub3JpZ2luYWxDZWxsSW5kZXggPSBjZWxsRGlmZnMuc2xpY2UoMCwgc3RhcnRJbmRleCkucmVkdWNlKChsYXN0T3JpZ2luYWxJbmRleCwgZGlmZikgPT4gdHlwZW9mIGRpZmYub3JpZ2luYWxDZWxsSW5kZXggPT09ICdudW1iZXInID8gTWF0aC5tYXgobGFzdE9yaWdpbmFsSW5kZXgsIGRpZmYub3JpZ2luYWxDZWxsSW5kZXgpIDogbGFzdE9yaWdpbmFsSW5kZXgsIC0xKSArIDE7XG5cdFx0fVxuXHR9XG5cblx0Ly8gSWYgdGhpcyBpcyBhIG5ldyBjZWxsIHRoYXQgd2UncmUgbW92aW5nLCBhbmQgdGhlcmUgYXJlIG5vIGV4aXN0aW5nIGNlbGxzIGluIGJldHdlZW4sIHRoZW4gd2UgY2FuIGp1c3QgbW92ZSB0aGUgbmV3IGNlbGwuXG5cdC8vIEkuZS4gbm8gbmVlZCB0byB1cGRhdGUgdGhlIG9yaWdpbmFsIG5vdGVib29rIG1vZGVsLlxuXHRpZiAodHlwZW9mIGVudHJ5VG9CZU1vdmVkLm9yaWdpbmFsQ2VsbEluZGV4ID09PSAnbnVtYmVyJyAmJiBvcmlnaW5hbENlbGxzV2VyZUVmZmVjdGVkICYmIHR5cGVvZiBvcmlnaW5hbENlbGxJbmRleCA9PT0gJ251bWJlcicgJiYgZW50cnlUb0JlTW92ZWQub3JpZ2luYWxDZWxsSW5kZXggIT09IG9yaWdpbmFsQ2VsbEluZGV4KSB7XG5cdFx0Y29uc3QgZWRpdDogSUNlbGxFZGl0T3BlcmF0aW9uID0ge1xuXHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5Nb3ZlLFxuXHRcdFx0aW5kZXg6IG9yaWdpbmFsQ2VsbEluZGV4LFxuXHRcdFx0bGVuZ3RoOiBldmVudC5sZW5ndGgsXG5cdFx0XHRuZXdJZHg6IGVudHJ5VG9CZU1vdmVkLm9yaWdpbmFsQ2VsbEluZGV4XG5cdFx0fTtcblxuXHRcdHJldHVybiBbY2VsbERpZmZzLCBbZWRpdF1dO1xuXHR9XG5cblx0cmV0dXJuIFtjZWxsRGlmZnMsIFtdXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvcnJlc3BvbmRpbmdPcmlnaW5hbENlbGxJbmRleChtb2RpZmllZENlbGxJbmRleDogbnVtYmVyLCBjZWxsRGlmZkluZm86IElDZWxsRGlmZkluZm9bXSk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGVudHJ5ID0gY2VsbERpZmZJbmZvLmZpbmQoZCA9PiBkLm1vZGlmaWVkQ2VsbEluZGV4ID09PSBtb2RpZmllZENlbGxJbmRleCk7XG5cdHJldHVybiBlbnRyeT8ub3JpZ2luYWxDZWxsSW5kZXg7XG59XG5cbi8qKlxuICpcbiAqIFRoaXMgaXNuJ3QgZ3JlYXQsIGJ1dCBuZWNlc3NhcnkuXG4gKiBpcHluYiBleHRlbnNpb24gdXBkYXRlcyBtZXRhZGF0YSB3aGVuIG5ldyBjZWxscyBhcmUgaW5zZXJ0ZWQgKHRvIGVuc3VyZSB0aGUgbWV0YWRhdGEgaXMgY29ycmVjdClcbiAqIERldGFpbHMgb2Ygd2h5IHRoYXRzIHJlcXVpcmVkIGlzIGluIGlweW5iIGV4dGVuc2lvbiwgYnV0IGl0cyBuZWNlc3NhcnkuXG4gKiBIb3dldmVyIGFzIGEgcmVzdWx0IG9mIHRoaXMsIHRob3NlIGVkaXRzIGFwcGVhciBoZXJlIGFuZCBhcmUgYXNzdW1lZCB0byBiZSB1c2VyIGVkaXRzLlxuICogQXMgYSByZXN1bHQgYF9hbGxFZGl0c0FyZUZyb21Vc2AgaXMgc2V0IHRvIGZhbHNlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNUcmFuc2llbnRJUHlOYkV4dGVuc2lvbkV2ZW50KG5vdGVib29rS2luZDogc3RyaW5nLCBlOiBOb3RlYm9va1RleHRNb2RlbENoYW5nZWRFdmVudCkge1xuXHRpZiAobm90ZWJvb2tLaW5kICE9PSAnanVweXRlci1ub3RlYm9vaycpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKGUucmF3RXZlbnRzLmV2ZXJ5KGV2ZW50ID0+IHtcblx0XHRpZiAoZXZlbnQua2luZCAhPT0gTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbE1ldGFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChKU09OLnN0cmluZ2lmeShldmVudC5tZXRhZGF0YSB8fCB7fSkgPT09IEpTT04uc3RyaW5naWZ5KHsgZXhlY3V0aW9uX2NvdW50OiBudWxsLCBtZXRhZGF0YToge30gfSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblxuXHR9KSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2FsY3VsYXRlTm90ZWJvb2tSZXdyaXRlUmF0aW8oY2VsbHNEaWZmOiBJQ2VsbERpZmZJbmZvW10sIG9yaWdpbmFsTW9kZWw6IE5vdGVib29rVGV4dE1vZGVsLCBtb2RpZmllZE1vZGVsOiBOb3RlYm9va1RleHRNb2RlbCk6IG51bWJlciB7XG5cdGNvbnN0IHRvdGFsTnVtYmVyT2ZVcGRhdGVkTGluZXMgPSBjZWxsc0RpZmYucmVkdWNlKCh0b3RhbFVwZGF0ZWRMaW5lcywgdmFsdWUpID0+IHtcblx0XHRjb25zdCBnZXRVcGFkdGVkTGluZUNvdW50ID0gKCkgPT4ge1xuXHRcdFx0aWYgKHZhbHVlLnR5cGUgPT09ICd1bmNoYW5nZWQnKSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZhbHVlLnR5cGUgPT09ICdkZWxldGUnKSB7XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbE1vZGVsLmNlbGxzW3ZhbHVlLm9yaWdpbmFsQ2VsbEluZGV4XS50ZXh0TW9kZWw/LmdldExpbmVDb3VudCgpID8/IDA7XG5cdFx0XHR9XG5cdFx0XHRpZiAodmFsdWUudHlwZSA9PT0gJ2luc2VydCcpIHtcblx0XHRcdFx0cmV0dXJuIG1vZGlmaWVkTW9kZWwuY2VsbHNbdmFsdWUubW9kaWZpZWRDZWxsSW5kZXhdLnRleHRNb2RlbD8uZ2V0TGluZUNvdW50KCkgPz8gMDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB2YWx1ZS5kaWZmLmdldCgpLmNoYW5nZXMucmVkdWNlKChtYXhMaW5lTnVtYmVyLCBjaGFuZ2UpID0+IHtcblx0XHRcdFx0cmV0dXJuIE1hdGgubWF4KG1heExpbmVOdW1iZXIsIGNoYW5nZS5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlKTtcblx0XHRcdH0sIDApO1xuXHRcdH07XG5cblx0XHRyZXR1cm4gdG90YWxVcGRhdGVkTGluZXMgKyBnZXRVcGFkdGVkTGluZUNvdW50KCk7XG5cdH0sIDApO1xuXG5cdGNvbnN0IHRvdGFsTnVtYmVyT2ZMaW5lcyA9IG1vZGlmaWVkTW9kZWwuY2VsbHMucmVkdWNlKCh0b3RhbExpbmVzLCBjZWxsKSA9PiB0b3RhbExpbmVzICsgKGNlbGwudGV4dE1vZGVsPy5nZXRMaW5lQ291bnQoKSA/PyAwKSwgMCk7XG5cdHJldHVybiB0b3RhbE51bWJlck9mTGluZXMgPT09IDAgPyAwIDogTWF0aC5taW4oMSwgdG90YWxOdW1iZXJPZlVwZGF0ZWRMaW5lcyAvIHRvdGFsTnVtYmVyT2ZMaW5lcyk7XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsY0FBc0UsK0JBQXdIO0FBQ3ZNLFNBQXdCLHVCQUF1QjtBQUd4QyxTQUFTLHFDQUFxQyxtQkFDcEQsY0FDQSxZQUNrQjtBQUVsQixRQUFNLE9BQXlCLEVBQUUsT0FBTyxDQUFDLEdBQUcsT0FBTyxHQUFHLFVBQVUsYUFBYSxTQUFTLE9BQU8sa0JBQW1CO0FBQ2hILGFBQVcsQ0FBQyxJQUFJLEdBQUcsTUFBTSxRQUFXLE1BQU0s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
