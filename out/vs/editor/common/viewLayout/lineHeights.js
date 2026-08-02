import { binarySearch2 } from "../../../base/common/arrays.js";
import { intersection } from "../../../base/common/collections.js";
import { EditorOption } from "../config/editorOptions.js";
var PendingChangeKind = /* @__PURE__ */ ((PendingChangeKind2) => {
  PendingChangeKind2[PendingChangeKind2["InsertOrChange"] = 0] = "InsertOrChange";
  PendingChangeKind2[PendingChangeKind2["Remove"] = 1] = "Remove";
  PendingChangeKind2[PendingChangeKind2["LinesDeleted"] = 2] = "LinesDeleted";
  PendingChangeKind2[PendingChangeKind2["LinesInserted"] = 3] = "LinesInserted";
  return PendingChangeKind2;
})(PendingChangeKind || {});
class CustomLine {
  constructor(decorationId, index, lineNumber, specialHeight, prefixSum) {
    this.decorationId = decorationId;
    this.index = index;
    this.lineNumber = lineNumber;
    this.specialHeight = specialHeight;
    this.prefixSum = prefixSum;
    this.maximumSpecialHeight = specialHeight;
    this.deleted = false;
  }
}
class LineHeightsManager {
  constructor(defaultLineHeight, customLineHeightData) {
    this._decorationIDToCustomLine = new ArrayMap();
    this._orderedCustomLines = [];
    this._pendingChanges = [];
    this._invalidIndex = Infinity;
    this._hasPending = false;
    this._defaultLineHeight = defaultLineHeight;
    for (const data of customLineHeightData) {
      this.insertOrChangeCustomLineHeight(data.decorationId, data.startLineNumber, data.endLineNumber, data.lineHeight);
    }
  }
  set defaultLineHeight(defaultLineHeight) {
    this._defaultLineHeight = defaultLineHeight;
  }
  get defaultLineHeight() {
    return this._defaultLineHeight;
  }
  removeCustomLineHeight(decorationID) {
    this._pendingChanges.push({ kind: 1 /* Remove */, decorationId: decorationID });
    this._hasPending = true;
  }
  insertOrChangeCustomLineHeight(decorationId, startLineNumber, endLineNumber, lineHeight) {
    this._pendingChanges.push({ kind: 0 /* InsertOrChange */, decorationId, startLineNumber, endLineNumber, lineHeight });
    this._hasPending = true;
  }
  heightForLineNumber(lineNumber) {
    this._commit();
    const searchIndex = this._binarySearchOverOrderedCustomLinesArray(lineNumber);
    if (searchIndex >= 0) {
      return this._orderedCustomLines[searchIndex].maximumSpecialHeight;
    }
    return this._defaultLineHeight;
  }
  getAccumulatedLineHeightsIncludingLineNumber(lineNumber) {
    this._commit();
    const searchIndex = this._binarySearchOverOrderedCustomLinesArray(lineNumber);
    if (searchIndex >= 0) {
      return this._orderedCustomLines[searchIndex].prefixSum + this._orderedCustomLines[searchIndex].maximumSpecialHeight;
    }
    if (searchIndex === -1) {
      return this._defaultLineHeight * lineNumber;
    }
    const modifiedIndex = -(searchIndex + 1);
    const previousSpecialLine = this._orderedCustomLines[modifiedIndex - 1];
    return previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (lineNumber - previousSpecialLine.lineNumber);
  }
  onLinesDeleted(fromLineNumber, toLineNumber) {
    this._pendingChanges.push({ kind: 2 /* LinesDeleted */, fromLineNumber, toLineNumber });
    this._hasPending = true;
  }
  onLinesInserted(fromLineNumber, toLineNumber) {
    this._pendingChanges.push({ kind: 3 /* LinesInserted */, fromLineNumber, toLineNumber });
    this._hasPending = true;
  }
  _commit() {
    if (!this._hasPending) {
      return;
    }
    const changes = this._pendingChanges;
    this._pendingChanges = [];
    this._hasPending = false;
    const stagedInserts = [];
    const stagedIdMap = new ArrayMap();
    for (const change of changes) {
      switch (change.kind) {
        case 1 /* Remove */:
          this._doRemoveCustomLineHeight(change.decorationId, stagedIdMap);
          break;
        case 0 /* InsertOrChange */:
          this._doInsertOrChangeCustomLineHeight(change.decorationId, change.startLineNumber, change.endLineNumber, change.lineHeight, stagedInserts, stagedIdMap);
          break;
        case 2 /* LinesDeleted */:
          this._flushStagedDecorationChanges(stagedInserts, stagedIdMap);
          this._doLinesDeleted(change.fromLineNumber, change.toLineNumber);
          break;
        case 3 /* LinesInserted */:
          this._flushStagedDecorationChanges(stagedInserts, stagedIdMap);
          this._doLinesInserted(change.fromLineNumber, change.toLineNumber, stagedInserts, stagedIdMap);
          break;
      }
    }
    this._flushStagedDecorationChanges(stagedInserts, stagedIdMap);
  }
  _doRemoveCustomLineHeight(decorationID, stagedIdMap) {
    const customLines = this._decorationIDToCustomLine.get(decorationID);
    if (customLines) {
      this._decorationIDToCustomLine.delete(decorationID);
      for (const customLine of customLines) {
        customLine.deleted = true;
        this._invalidIndex = Math.min(this._invalidIndex, customLine.index);
      }
    }
    const stagedLines = stagedIdMap.get(decorationID);
    if (stagedLines) {
      stagedIdMap.delete(decorationID);
      for (const line of stagedLines) {
        line.deleted = true;
      }
    }
  }
  _doInsertOrChangeCustomLineHeight(decorationId, startLineNumber, endLineNumber, lineHeight, stagedInserts, stagedIdMap) {
    this._doRemoveCustomLineHeight(decorationId, stagedIdMap);
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const customLine = new CustomLine(decorationId, -1, lineNumber, lineHeight, 0);
      stagedInserts.push(customLine);
      stagedIdMap.add(decorationId, customLine);
    }
  }
  _flushStagedDecorationChanges(stagedInserts, stagedIdMap) {
    if (stagedInserts.length === 0 && this._invalidIndex === Infinity) {
      return;
    }
    for (const pendingChange of stagedInserts) {
      if (pendingChange.deleted) {
        continue;
      }
      const candidateInsertionIndex = this._binarySearchOverOrderedCustomLinesArray(pendingChange.lineNumber);
      const insertionIndex = candidateInsertionIndex >= 0 ? candidateInsertionIndex : -(candidateInsertionIndex + 1);
      this._orderedCustomLines.splice(insertionIndex, 0, pendingChange);
      this._invalidIndex = Math.min(this._invalidIndex, insertionIndex);
    }
    stagedInserts.length = 0;
    stagedIdMap.clear();
    if (this._invalidIndex === Infinity) {
      return;
    }
    const newDecorationIDToSpecialLine = new ArrayMap();
    const newOrderedSpecialLines = [];
    for (let i = 0; i < this._invalidIndex; i++) {
      const customLine = this._orderedCustomLines[i];
      newOrderedSpecialLines.push(customLine);
      newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
    }
    let numberOfDeletions = 0;
    let previousSpecialLine = this._invalidIndex > 0 ? newOrderedSpecialLines[this._invalidIndex - 1] : void 0;
    for (let i = this._invalidIndex; i < this._orderedCustomLines.length; i++) {
      const customLine = this._orderedCustomLines[i];
      if (customLine.deleted) {
        numberOfDeletions++;
        continue;
      }
      customLine.index = i - numberOfDeletions;
      if (previousSpecialLine && previousSpecialLine.lineNumber === customLine.lineNumber) {
        customLine.maximumSpecialHeight = previousSpecialLine.maximumSpecialHeight;
        customLine.prefixSum = previousSpecialLine.prefixSum;
      } else {
        let maximumSpecialHeight = customLine.specialHeight;
        for (let j = i; j < this._orderedCustomLines.length; j++) {
          const nextSpecialLine = this._orderedCustomLines[j];
          if (nextSpecialLine.deleted) {
            continue;
          }
          if (nextSpecialLine.lineNumber !== customLine.lineNumber) {
            break;
          }
          maximumSpecialHeight = Math.max(maximumSpecialHeight, nextSpecialLine.specialHeight);
        }
        customLine.maximumSpecialHeight = maximumSpecialHeight;
        let prefixSum;
        if (previousSpecialLine) {
          prefixSum = previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (customLine.lineNumber - previousSpecialLine.lineNumber - 1);
        } else {
          prefixSum = this._defaultLineHeight * (customLine.lineNumber - 1);
        }
        customLine.prefixSum = prefixSum;
      }
      previousSpecialLine = customLine;
      newOrderedSpecialLines.push(customLine);
      newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
    }
    this._orderedCustomLines = newOrderedSpecialLines;
    this._decorationIDToCustomLine = newDecorationIDToSpecialLine;
    this._invalidIndex = Infinity;
  }
  _doLinesDeleted(fromLineNumber, toLineNumber) {
    const deleteCount = toLineNumber - fromLineNumber + 1;
    const numberOfCustomLines = this._orderedCustomLines.length;
    const candidateStartIndexOfDeletion = this._binarySearchOverOrderedCustomLinesArray(fromLineNumber);
    let startIndexOfDeletion;
    if (candidateStartIndexOfDeletion >= 0) {
      startIndexOfDeletion = candidateStartIndexOfDeletion;
      for (let i = candidateStartIndexOfDeletion - 1; i >= 0; i--) {
        if (this._orderedCustomLines[i].lineNumber === fromLineNumber) {
          startIndexOfDeletion--;
        } else {
          break;
        }
      }
    } else {
      startIndexOfDeletion = candidateStartIndexOfDeletion === -(numberOfCustomLines + 1) && candidateStartIndexOfDeletion !== -1 ? numberOfCustomLines - 1 : -(candidateStartIndexOfDeletion + 1);
    }
    const candidateEndIndexOfDeletion = this._binarySearchOverOrderedCustomLinesArray(toLineNumber);
    let endIndexOfDeletion;
    if (candidateEndIndexOfDeletion >= 0) {
      endIndexOfDeletion = candidateEndIndexOfDeletion;
      for (let i = candidateEndIndexOfDeletion + 1; i < numberOfCustomLines; i++) {
        if (this._orderedCustomLines[i].lineNumber === toLineNumber) {
          endIndexOfDeletion++;
        } else {
          break;
        }
      }
    } else {
      endIndexOfDeletion = candidateEndIndexOfDeletion === -(numberOfCustomLines + 1) && candidateEndIndexOfDeletion !== -1 ? numberOfCustomLines - 1 : -(candidateEndIndexOfDeletion + 1);
    }
    const isEndIndexBiggerThanStartIndex = endIndexOfDeletion > startIndexOfDeletion;
    const isEndIndexEqualToStartIndexAndCoversCustomLine = endIndexOfDeletion === startIndexOfDeletion && this._orderedCustomLines[startIndexOfDeletion] && this._orderedCustomLines[startIndexOfDeletion].lineNumber >= fromLineNumber && this._orderedCustomLines[startIndexOfDeletion].lineNumber <= toLineNumber;
    if (isEndIndexBiggerThanStartIndex || isEndIndexEqualToStartIndexAndCoversCustomLine) {
      let maximumSpecialHeightOnDeletedInterval = 0;
      for (let i = startIndexOfDeletion; i <= endIndexOfDeletion; i++) {
        maximumSpecialHeightOnDeletedInterval = Math.max(maximumSpecialHeightOnDeletedInterval, this._orderedCustomLines[i].maximumSpecialHeight);
      }
      let prefixSumOnDeletedInterval = 0;
      if (startIndexOfDeletion > 0) {
        const previousSpecialLine = this._orderedCustomLines[startIndexOfDeletion - 1];
        prefixSumOnDeletedInterval = previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (fromLineNumber - previousSpecialLine.lineNumber - 1);
      } else {
        prefixSumOnDeletedInterval = fromLineNumber > 0 ? (fromLineNumber - 1) * this._defaultLineHeight : 0;
      }
      const firstSpecialLineDeleted = this._orderedCustomLines[startIndexOfDeletion];
      const lastSpecialLineDeleted = this._orderedCustomLines[endIndexOfDeletion];
      const firstSpecialLineAfterDeletion = this._orderedCustomLines[endIndexOfDeletion + 1];
      const heightOfFirstLineAfterDeletion = firstSpecialLineAfterDeletion && firstSpecialLineAfterDeletion.lineNumber === toLineNumber + 1 ? firstSpecialLineAfterDeletion.maximumSpecialHeight : this._defaultLineHeight;
      const totalHeightDeleted = lastSpecialLineDeleted.prefixSum + lastSpecialLineDeleted.maximumSpecialHeight - firstSpecialLineDeleted.prefixSum + this._defaultLineHeight * (toLineNumber - lastSpecialLineDeleted.lineNumber) + this._defaultLineHeight * (firstSpecialLineDeleted.lineNumber - fromLineNumber) + heightOfFirstLineAfterDeletion - maximumSpecialHeightOnDeletedInterval;
      const decorationIdsSeen = /* @__PURE__ */ new Set();
      const newOrderedCustomLines = [];
      const newDecorationIDToSpecialLine = new ArrayMap();
      let numberOfDeletions = 0;
      for (let i = 0; i < this._orderedCustomLines.length; i++) {
        const customLine = this._orderedCustomLines[i];
        if (i < startIndexOfDeletion) {
          newOrderedCustomLines.push(customLine);
          newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
        } else if (i >= startIndexOfDeletion && i <= endIndexOfDeletion) {
          const decorationId = customLine.decorationId;
          if (!decorationIdsSeen.has(decorationId)) {
            customLine.index -= numberOfDeletions;
            customLine.lineNumber = fromLineNumber;
            customLine.prefixSum = prefixSumOnDeletedInterval;
            customLine.maximumSpecialHeight = maximumSpecialHeightOnDeletedInterval;
            newOrderedCustomLines.push(customLine);
            newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
          } else {
            numberOfDeletions++;
          }
        } else if (i > endIndexOfDeletion) {
          customLine.index -= numberOfDeletions;
          customLine.lineNumber -= deleteCount;
          customLine.prefixSum -= totalHeightDeleted;
          newOrderedCustomLines.push(customLine);
          newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
        }
        decorationIdsSeen.add(customLine.decorationId);
      }
      this._orderedCustomLines = newOrderedCustomLines;
      this._decorationIDToCustomLine = newDecorationIDToSpecialLine;
    } else {
      const totalHeightDeleted = deleteCount * this._defaultLineHeight;
      for (let i = endIndexOfDeletion; i < this._orderedCustomLines.length; i++) {
        const customLine = this._orderedCustomLines[i];
        if (customLine.lineNumber > toLineNumber) {
          customLine.lineNumber -= deleteCount;
          customLine.prefixSum -= totalHeightDeleted;
        }
      }
    }
  }
  _doLinesInserted(fromLineNumber, toLineNumber, stagedInserts, stagedIdMap) {
    const insertCount = toLineNumber - fromLineNumber + 1;
    const candidateStartIndexOfInsertion = this._binarySearchOverOrderedCustomLinesArray(fromLineNumber);
    let startIndexOfInsertion;
    if (candidateStartIndexOfInsertion >= 0) {
      startIndexOfInsertion = candidateStartIndexOfInsertion;
      for (let i = candidateStartIndexOfInsertion - 1; i >= 0; i--) {
        if (this._orderedCustomLines[i].lineNumber === fromLineNumber) {
          startIndexOfInsertion--;
        } else {
          break;
        }
      }
    } else {
      startIndexOfInsertion = -(candidateStartIndexOfInsertion + 1);
    }
    const toReAdd = [];
    const decorationsImmediatelyAfter = /* @__PURE__ */ new Set();
    for (let i = startIndexOfInsertion; i < this._orderedCustomLines.length; i++) {
      if (this._orderedCustomLines[i].lineNumber === fromLineNumber) {
        decorationsImmediatelyAfter.add(this._orderedCustomLines[i].decorationId);
      }
    }
    const decorationsImmediatelyBefore = /* @__PURE__ */ new Set();
    for (let i = startIndexOfInsertion - 1; i >= 0; i--) {
      if (this._orderedCustomLines[i].lineNumber === fromLineNumber - 1) {
        decorationsImmediatelyBefore.add(this._orderedCustomLines[i].decorationId);
      }
    }
    const decorationsWithGaps = intersection(decorationsImmediatelyBefore, decorationsImmediatelyAfter);
    const prefixSumToAdd = insertCount * this._defaultLineHeight;
    for (let i = startIndexOfInsertion; i < this._orderedCustomLines.length; i++) {
      this._orderedCustomLines[i].lineNumber += insertCount;
      this._orderedCustomLines[i].prefixSum += prefixSumToAdd;
    }
    if (decorationsWithGaps.size > 0) {
      for (const decorationId of decorationsWithGaps) {
        const decoration = this._decorationIDToCustomLine.get(decorationId);
        if (decoration) {
          const startLineNumber = decoration.reduce((min, l) => Math.min(min, l.lineNumber), fromLineNumber);
          const endLineNumber = decoration.reduce((max, l) => Math.max(max, l.lineNumber), fromLineNumber);
          const lineHeight = decoration.reduce((max, l) => Math.max(max, l.specialHeight), 0);
          toReAdd.push({
            decorationId,
            startLineNumber,
            endLineNumber,
            lineHeight
          });
        }
      }
      for (const dec of toReAdd) {
        this._doInsertOrChangeCustomLineHeight(dec.decorationId, dec.startLineNumber, dec.endLineNumber, dec.lineHeight, stagedInserts, stagedIdMap);
      }
    }
  }
  _binarySearchOverOrderedCustomLinesArray(lineNumber) {
    return binarySearch2(this._orderedCustomLines.length, (index) => {
      const line = this._orderedCustomLines[index];
      if (line.lineNumber === lineNumber) {
        return 0;
      } else if (line.lineNumber < lineNumber) {
        return -1;
      } else {
        return 1;
      }
    });
  }
}
class CustomLineHeightData {
  constructor(decorationId, startLineNumber, endLineNumber, lineHeight) {
    this.decorationId = decorationId;
    this.startLineNumber = startLineNumber;
    this.endLineNumber = endLineNumber;
    this.lineHeight = lineHeight;
  }
  static fromDecorations(decorations, coordinatesConverter, configuration) {
    const defaultLineHeight = configuration.options.get(EditorOption.lineHeight);
    return decorations.map((d) => {
      const viewRange = coordinatesConverter.convertModelRangeToViewRange(d.range);
      return new CustomLineHeightData(
        d.id,
        viewRange.startLineNumber,
        viewRange.endLineNumber,
        d.options.lineHeight ? d.options.lineHeight * defaultLineHeight : 0
      );
    });
  }
}
class ArrayMap {
  constructor() {
    this._map = /* @__PURE__ */ new Map();
  }
  add(key, value) {
    const array = this._map.get(key);
    if (!array) {
      this._map.set(key, [value]);
    } else {
      array.push(value);
    }
  }
  get(key) {
    return this._map.get(key);
  }
  delete(key) {
    this._map.delete(key);
  }
  clear() {
    this._map.clear();
  }
}
export {
  CustomLine,
  CustomLineHeightData,
  LineHeightsManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vdmlld0xheW91dC9saW5lSGVpZ2h0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGJpbmFyeVNlYXJjaDIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgaW50ZXJzZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29vcmRpbmF0ZXNDb252ZXJ0ZXIgfSBmcm9tICcuLi9jb29yZGluYXRlc0NvbnZlcnRlci5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWNvcmF0aW9uIH0gZnJvbSAnLi4vbW9kZWwuanMnO1xuXG5jb25zdCBlbnVtIFBlbmRpbmdDaGFuZ2VLaW5kIHtcblx0SW5zZXJ0T3JDaGFuZ2UsXG5cdFJlbW92ZSxcblx0TGluZXNEZWxldGVkLFxuXHRMaW5lc0luc2VydGVkLFxufVxuXG50eXBlIFBlbmRpbmdDaGFuZ2UgPVxuXHR8IHsgcmVhZG9ubHkga2luZDogUGVuZGluZ0NoYW5nZUtpbmQuSW5zZXJ0T3JDaGFuZ2U7IHJlYWRvbmx5IGRlY29yYXRpb25JZDogc3RyaW5nOyByZWFkb25seSBzdGFydExpbmVOdW1iZXI6IG51bWJlcjsgcmVhZG9ubHkgZW5kTGluZU51bWJlcjogbnVtYmVyOyByZWFkb25seSBsaW5lSGVpZ2h0OiBudW1iZXIgfVxuXHR8IHsgcmVhZG9ubHkga2luZDogUGVuZGluZ0NoYW5nZUtpbmQuUmVtb3ZlOyByZWFkb25seSBkZWNvcmF0aW9uSWQ6IHN0cmluZyB9XG5cdHwgeyByZWFkb25seSBraW5kOiBQZW5kaW5nQ2hhbmdlS2luZC5MaW5lc0RlbGV0ZWQ7IHJlYWRvbmx5IGZyb21MaW5lTnVtYmVyOiBudW1iZXI7IHJlYWRvbmx5IHRvTGluZU51bWJlcjogbnVtYmVyIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6IFBlbmRpbmdDaGFuZ2VLaW5kLkxpbmVzSW5zZXJ0ZWQ7IHJlYWRvbmx5IGZyb21MaW5lTnVtYmVyOiBudW1iZXI7IHJlYWRvbmx5IHRvTGluZU51bWJlcjogbnVtYmVyIH07XG5cbmV4cG9ydCBjbGFzcyBDdXN0b21MaW5lIHtcblxuXHRwdWJsaWMgaW5kZXg6IG51bWJlcjtcblx0cHVibGljIGxpbmVOdW1iZXI6IG51bWJlcjtcblx0cHVibGljIHNwZWNpYWxIZWlnaHQ6IG51bWJlcjtcblx0cHVibGljIHByZWZpeFN1bTogbnVtYmVyO1xuXHRwdWJsaWMgbWF4aW11bVNwZWNpYWxIZWlnaHQ6IG51bWJlcjtcblx0cHVibGljIGRlY29yYXRpb25JZDogc3RyaW5nO1xuXHRwdWJsaWMgZGVsZXRlZDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcihkZWNvcmF0aW9uSWQ6IHN0cmluZywgaW5kZXg6IG51bWJlciwgbGluZU51bWJlcjogbnVtYmVyLCBzcGVjaWFsSGVpZ2h0OiBudW1iZXIsIHByZWZpeFN1bTogbnVtYmVyKSB7XG5cdFx0dGhpcy5kZWNvcmF0aW9uSWQgPSBkZWNvcmF0aW9uSWQ7XG5cdFx0dGhpcy5pbmRleCA9IGluZGV4O1xuXHRcdHRoaXMubGluZU51bWJlciA9IGxpbmVOdW1iZXI7XG5cdFx0dGhpcy5zcGVjaWFsSGVpZ2h0ID0gc3BlY2lhbEhlaWdodDtcblx0XHR0aGlzLnByZWZpeFN1bSA9IHByZWZpeFN1bTtcblx0XHR0aGlzLm1heGltdW1TcGVjaWFsSGVpZ2h0ID0gc3BlY2lhbEhlaWdodDtcblx0XHR0aGlzLmRlbGV0ZWQgPSBmYWxzZTtcblx0fVxufVxuXG4vKipcbiAqIE1hbmFnZXMgbGluZSBoZWlnaHRzIGluIHRoZSBlZGl0b3Igd2l0aCBzdXBwb3J0IGZvciBjdXN0b20gbGluZSBoZWlnaHRzIGZyb20gZGVjb3JhdGlvbnMuXG4gKlxuICogVGhpcyBjbGFzcyBtYWludGFpbnMgYW4gb3JkZXJlZCBjb2xsZWN0aW9uIG9mIGxpbmUgaGVpZ2h0cywgd2hlcmUgZWFjaCBsaW5lIGNhbiBoYXZlIGVpdGhlclxuICogdGhlIGRlZmF1bHQgaGVpZ2h0IG9yIGEgY3VzdG9tIGhlaWdodCBzcGVjaWZpZWQgYnkgZGVjb3JhdGlvbnMuIEl0IHN1cHBvcnRzIGVmZmljaWVudCBxdWVyeWluZ1xuICogb2YgaW5kaXZpZHVhbCBsaW5lIGhlaWdodHMgYXMgd2VsbCBhcyBhY2N1bXVsYXRlZCBoZWlnaHRzIHVwIHRvIGEgc3BlY2lmaWMgbGluZS5cbiAqXG4gKiBMaW5lIGhlaWdodHMgYXJlIHN0b3JlZCBpbiBhIHNvcnRlZCBhcnJheSBmb3IgZWZmaWNpZW50IGJpbmFyeSBzZWFyY2ggb3BlcmF0aW9ucy4gRWFjaCBsaW5lXG4gKiB3aXRoIGN1c3RvbSBoZWlnaHQgaXMgcmVwcmVzZW50ZWQgYnkgYSB7QGxpbmsgQ3VzdG9tTGluZX0gb2JqZWN0IHdoaWNoIHRyYWNrcyBpdHMgc3BlY2lhbCBoZWlnaHQsXG4gKiBhY2N1bXVsYXRlZCBoZWlnaHQgcHJlZml4IHN1bSwgYW5kIGFzc29jaWF0ZWQgZGVjb3JhdGlvbiBJRC5cbiAqXG4gKiBUaGUgY2xhc3Mgb3B0aW1pemVzIHBlcmZvcm1hbmNlIGJ5OlxuICogLSBVc2luZyBiaW5hcnkgc2VhcmNoIHRvIGxvY2F0ZSBsaW5lcyBpbiB0aGUgb3JkZXJlZCBhcnJheVxuICogLSBCYXRjaGluZyB1cGRhdGVzIHRocm91Z2ggYSBwZW5kaW5nIGNoYW5nZXMgbWVjaGFuaXNtXG4gKiAtIENvbXB1dGluZyBwcmVmaXggc3VtcyBmb3IgTygxKSBhY2N1bXVsYXRlZCBoZWlnaHQgbG9va3VwXG4gKiAtIFRyYWNraW5nIG1heGltdW0gaGVpZ2h0IGZvciBsaW5lcyB3aXRoIG11bHRpcGxlIGRlY29yYXRpb25zXG4gKiAtIEVmZmljaWVudGx5IGhhbmRsaW5nIGRvY3VtZW50IGNoYW5nZXMgKGxpbmUgaW5zZXJ0aW9ucyBhbmQgZGVsZXRpb25zKVxuICpcbiAqIFdoZW4gbGluZXMgYXJlIGluc2VydGVkIG9yIGRlbGV0ZWQsIHRoZSBtYW5hZ2VyIHVwZGF0ZXMgbGluZSBudW1iZXJzIGFuZCBwcmVmaXggc3Vtc1xuICogZm9yIGFsbCBhZmZlY3RlZCBsaW5lcy4gSXQgYWxzbyBoYW5kbGVzIHNwZWNpYWwgY2FzZXMgbGlrZSBkZWNvcmF0aW9ucyB0aGF0IHNwYW5cbiAqIHRoZSBpbnNlcnRpb24vZGVsZXRpb24gcG9pbnRzIGJ5IHJlLWFwcGx5aW5nIHRob3NlIGRlY29yYXRpb25zIGFwcHJvcHJpYXRlbHkuXG4gKlxuICogQWxsIHF1ZXJ5IG9wZXJhdGlvbnMgYXV0b21hdGljYWxseSBjb21taXQgcGVuZGluZyBjaGFuZ2VzIHRvIGVuc3VyZSBjb25zaXN0ZW50IHJlc3VsdHMuXG4gKiBDbGllbnRzIGNhbiBtb2RpZnkgbGluZSBoZWlnaHRzIGJ5IGFkZGluZyBvciByZW1vdmluZyBjdXN0b20gbGluZSBoZWlnaHQgZGVjb3JhdGlvbnMsXG4gKiB3aGljaCBhcmUgdHJhY2tlZCBieSB0aGVpciB1bmlxdWUgZGVjb3JhdGlvbiBJRHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBMaW5lSGVpZ2h0c01hbmFnZXIge1xuXG5cdHByaXZhdGUgX2RlY29yYXRpb25JRFRvQ3VzdG9tTGluZTogQXJyYXlNYXA8c3RyaW5nLCBDdXN0b21MaW5lPiA9IG5ldyBBcnJheU1hcDxzdHJpbmcsIEN1c3RvbUxpbmU+KCk7XG5cdHByaXZhdGUgX29yZGVyZWRDdXN0b21MaW5lczogQ3VzdG9tTGluZVtdID0gW107XG5cdHByaXZhdGUgX3BlbmRpbmdDaGFuZ2VzOiBQZW5kaW5nQ2hhbmdlW10gPSBbXTtcblx0cHJpdmF0ZSBfaW52YWxpZEluZGV4OiBudW1iZXIgPSBJbmZpbml0eTtcblx0cHJpdmF0ZSBfZGVmYXVsdExpbmVIZWlnaHQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfaGFzUGVuZGluZzogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKGRlZmF1bHRMaW5lSGVpZ2h0OiBudW1iZXIsIGN1c3RvbUxpbmVIZWlnaHREYXRhOiBDdXN0b21MaW5lSGVpZ2h0RGF0YVtdKSB7XG5cdFx0dGhpcy5fZGVmYXVsdExpbmVIZWlnaHQgPSBkZWZhdWx0TGluZUhlaWdodDtcblx0XHRmb3IgKGNvbnN0IGRhdGEgb2YgY3VzdG9tTGluZUhlaWdodERhdGEpIHtcblx0XHRcdHRoaXMuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KGRhdGEuZGVjb3JhdGlvbklkLCBkYXRhLnN0YXJ0TGluZU51bWJlciwgZGF0YS5lbmRMaW5lTnVtYmVyLCBkYXRhLmxpbmVIZWlnaHQpO1xuXHRcdH1cblx0fVxuXG5cdHNldCBkZWZhdWx0TGluZUhlaWdodChkZWZhdWx0TGluZUhlaWdodDogbnVtYmVyKSB7XG5cdFx0dGhpcy5fZGVmYXVsdExpbmVIZWlnaHQgPSBkZWZhdWx0TGluZUhlaWdodDtcblx0fVxuXG5cdGdldCBkZWZhdWx0TGluZUhlaWdodCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdExpbmVIZWlnaHQ7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlQ3VzdG9tTGluZUhlaWdodChkZWNvcmF0aW9uSUQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdDaGFuZ2VzLnB1c2goeyBraW5kOiBQZW5kaW5nQ2hhbmdlS2luZC5SZW1vdmUsIGRlY29yYXRpb25JZDogZGVjb3JhdGlvbklEIH0pO1xuXHRcdHRoaXMuX2hhc1BlbmRpbmcgPSB0cnVlO1xuXHR9XG5cblx0cHVibGljIGluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodChkZWNvcmF0aW9uSWQ6IHN0cmluZywgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgbGluZUhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0NoYW5nZXMucHVzaCh7IGtpbmQ6IFBlbmRpbmdDaGFuZ2VLaW5kLkluc2VydE9yQ2hhbmdlLCBkZWNvcmF0aW9uSWQsIHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlciwgbGluZUhlaWdodCB9KTtcblx0XHR0aGlzLl9oYXNQZW5kaW5nID0gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBoZWlnaHRGb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0dGhpcy5fY29tbWl0KCk7XG5cdFx0Y29uc3Qgc2VhcmNoSW5kZXggPSB0aGlzLl9iaW5hcnlTZWFyY2hPdmVyT3JkZXJlZEN1c3RvbUxpbmVzQXJyYXkobGluZU51bWJlcik7XG5cdFx0aWYgKHNlYXJjaEluZGV4ID49IDApIHtcblx0XHRcdHJldHVybiB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbc2VhcmNoSW5kZXhdLm1heGltdW1TcGVjaWFsSGVpZ2h0O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdExpbmVIZWlnaHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHR0aGlzLl9jb21taXQoKTtcblx0XHRjb25zdCBzZWFyY2hJbmRleCA9IHRoaXMuX2JpbmFyeVNlYXJjaE92ZXJPcmRlcmVkQ3VzdG9tTGluZXNBcnJheShsaW5lTnVtYmVyKTtcblx0XHRpZiAoc2VhcmNoSW5kZXggPj0gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tzZWFyY2hJbmRleF0ucHJlZml4U3VtICsgdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW3NlYXJjaEluZGV4XS5tYXhpbXVtU3BlY2lhbEhlaWdodDtcblx0XHR9XG5cdFx0aWYgKHNlYXJjaEluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRMaW5lSGVpZ2h0ICogbGluZU51bWJlcjtcblx0XHR9XG5cdFx0Y29uc3QgbW9kaWZpZWRJbmRleCA9IC0oc2VhcmNoSW5kZXggKyAxKTtcblx0XHRjb25zdCBwcmV2aW91c1NwZWNpYWxMaW5lID0gdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW21vZGlmaWVkSW5kZXggLSAxXTtcblx0XHRyZXR1cm4gcHJldmlvdXNTcGVjaWFsTGluZS5wcmVmaXhTdW0gKyBwcmV2aW91c1NwZWNpYWxMaW5lLm1heGltdW1TcGVjaWFsSGVpZ2h0ICsgdGhpcy5fZGVmYXVsdExpbmVIZWlnaHQgKiAobGluZU51bWJlciAtIHByZXZpb3VzU3BlY2lhbExpbmUubGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgb25MaW5lc0RlbGV0ZWQoZnJvbUxpbmVOdW1iZXI6IG51bWJlciwgdG9MaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nQ2hhbmdlcy5wdXNoKHsga2luZDogUGVuZGluZ0NoYW5nZUtpbmQuTGluZXNEZWxldGVkLCBmcm9tTGluZU51bWJlciwgdG9MaW5lTnVtYmVyIH0pO1xuXHRcdHRoaXMuX2hhc1BlbmRpbmcgPSB0cnVlO1xuXHR9XG5cblx0cHVibGljIG9uTGluZXNJbnNlcnRlZChmcm9tTGluZU51bWJlcjogbnVtYmVyLCB0b0xpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdDaGFuZ2VzLnB1c2goeyBraW5kOiBQZW5kaW5nQ2hhbmdlS2luZC5MaW5lc0luc2VydGVkLCBmcm9tTGluZU51bWJlciwgdG9MaW5lTnVtYmVyIH0pO1xuXHRcdHRoaXMuX2hhc1BlbmRpbmcgPSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tbWl0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faGFzUGVuZGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjaGFuZ2VzID0gdGhpcy5fcGVuZGluZ0NoYW5nZXM7XG5cdFx0dGhpcy5fcGVuZGluZ0NoYW5nZXMgPSBbXTtcblx0XHR0aGlzLl9oYXNQZW5kaW5nID0gZmFsc2U7XG5cblx0XHRjb25zdCBzdGFnZWRJbnNlcnRzOiBDdXN0b21MaW5lW10gPSBbXTtcblx0XHRjb25zdCBzdGFnZWRJZE1hcCA9IG5ldyBBcnJheU1hcDxzdHJpbmcsIEN1c3RvbUxpbmU+KCk7XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuXHRcdFx0c3dpdGNoIChjaGFuZ2Uua2luZCkge1xuXHRcdFx0XHRjYXNlIFBlbmRpbmdDaGFuZ2VLaW5kLlJlbW92ZTpcblx0XHRcdFx0XHR0aGlzLl9kb1JlbW92ZUN1c3RvbUxpbmVIZWlnaHQoY2hhbmdlLmRlY29yYXRpb25JZCwgc3RhZ2VkSWRNYXApO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFBlbmRpbmdDaGFuZ2VLaW5kLkluc2VydE9yQ2hhbmdlOlxuXHRcdFx0XHRcdHRoaXMuX2RvSW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KGNoYW5nZS5kZWNvcmF0aW9uSWQsIGNoYW5nZS5zdGFydExpbmVOdW1iZXIsIGNoYW5nZS5lbmRMaW5lTnVtYmVyLCBjaGFuZ2UubGluZUhlaWdodCwgc3RhZ2VkSW5zZXJ0cywgc3RhZ2VkSWRNYXApO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFBlbmRpbmdDaGFuZ2VLaW5kLkxpbmVzRGVsZXRlZDpcblx0XHRcdFx0XHR0aGlzLl9mbHVzaFN0YWdlZERlY29yYXRpb25DaGFuZ2VzKHN0YWdlZEluc2VydHMsIHN0YWdlZElkTWFwKTtcblx0XHRcdFx0XHR0aGlzLl9kb0xpbmVzRGVsZXRlZChjaGFuZ2UuZnJvbUxpbmVOdW1iZXIsIGNoYW5nZS50b0xpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFBlbmRpbmdDaGFuZ2VLaW5kLkxpbmVzSW5zZXJ0ZWQ6XG5cdFx0XHRcdFx0dGhpcy5fZmx1c2hTdGFnZWREZWNvcmF0aW9uQ2hhbmdlcyhzdGFnZWRJbnNlcnRzLCBzdGFnZWRJZE1hcCk7XG5cdFx0XHRcdFx0dGhpcy5fZG9MaW5lc0luc2VydGVkKGNoYW5nZS5mcm9tTGluZU51bWJlciwgY2hhbmdlLnRvTGluZU51bWJlciwgc3RhZ2VkSW5zZXJ0cywgc3RhZ2VkSWRNYXApO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9mbHVzaFN0YWdlZERlY29yYXRpb25DaGFuZ2VzKHN0YWdlZEluc2VydHMsIHN0YWdlZElkTWFwKTtcblx0fVxuXG5cdHByaXZhdGUgX2RvUmVtb3ZlQ3VzdG9tTGluZUhlaWdodChkZWNvcmF0aW9uSUQ6IHN0cmluZywgc3RhZ2VkSWRNYXA6IEFycmF5TWFwPHN0cmluZywgQ3VzdG9tTGluZT4pOiB2b2lkIHtcblx0XHRjb25zdCBjdXN0b21MaW5lcyA9IHRoaXMuX2RlY29yYXRpb25JRFRvQ3VzdG9tTGluZS5nZXQoZGVjb3JhdGlvbklEKTtcblx0XHRpZiAoY3VzdG9tTGluZXMpIHtcblx0XHRcdHRoaXMuX2RlY29yYXRpb25JRFRvQ3VzdG9tTGluZS5kZWxldGUoZGVjb3JhdGlvbklEKTtcblx0XHRcdGZvciAoY29uc3QgY3VzdG9tTGluZSBvZiBjdXN0b21MaW5lcykge1xuXHRcdFx0XHRjdXN0b21MaW5lLmRlbGV0ZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9pbnZhbGlkSW5kZXggPSBNYXRoLm1pbih0aGlzLl9pbnZhbGlkSW5kZXgsIGN1c3RvbUxpbmUuaW5kZXgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzdGFnZWRMaW5lcyA9IHN0YWdlZElkTWFwLmdldChkZWNvcmF0aW9uSUQpO1xuXHRcdGlmIChzdGFnZWRMaW5lcykge1xuXHRcdFx0c3RhZ2VkSWRNYXAuZGVsZXRlKGRlY29yYXRpb25JRCk7XG5cdFx0XHRmb3IgKGNvbnN0IGxpbmUgb2Ygc3RhZ2VkTGluZXMpIHtcblx0XHRcdFx0bGluZS5kZWxldGVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kb0luc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodChkZWNvcmF0aW9uSWQ6IHN0cmluZywgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgbGluZUhlaWdodDogbnVtYmVyLCBzdGFnZWRJbnNlcnRzOiBDdXN0b21MaW5lW10sIHN0YWdlZElkTWFwOiBBcnJheU1hcDxzdHJpbmcsIEN1c3RvbUxpbmU+KTogdm9pZCB7XG5cdFx0dGhpcy5fZG9SZW1vdmVDdXN0b21MaW5lSGVpZ2h0KGRlY29yYXRpb25JZCwgc3RhZ2VkSWRNYXApO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gZW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRjb25zdCBjdXN0b21MaW5lID0gbmV3IEN1c3RvbUxpbmUoZGVjb3JhdGlvbklkLCAtMSwgbGluZU51bWJlciwgbGluZUhlaWdodCwgMCk7XG5cdFx0XHRzdGFnZWRJbnNlcnRzLnB1c2goY3VzdG9tTGluZSk7XG5cdFx0XHRzdGFnZWRJZE1hcC5hZGQoZGVjb3JhdGlvbklkLCBjdXN0b21MaW5lKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9mbHVzaFN0YWdlZERlY29yYXRpb25DaGFuZ2VzKHN0YWdlZEluc2VydHM6IEN1c3RvbUxpbmVbXSwgc3RhZ2VkSWRNYXA6IEFycmF5TWFwPHN0cmluZywgQ3VzdG9tTGluZT4pOiB2b2lkIHtcblx0XHRpZiAoc3RhZ2VkSW5zZXJ0cy5sZW5ndGggPT09IDAgJiYgdGhpcy5faW52YWxpZEluZGV4ID09PSBJbmZpbml0eSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHBlbmRpbmdDaGFuZ2Ugb2Ygc3RhZ2VkSW5zZXJ0cykge1xuXHRcdFx0aWYgKHBlbmRpbmdDaGFuZ2UuZGVsZXRlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNhbmRpZGF0ZUluc2VydGlvbkluZGV4ID0gdGhpcy5fYmluYXJ5U2VhcmNoT3Zlck9yZGVyZWRDdXN0b21MaW5lc0FycmF5KHBlbmRpbmdDaGFuZ2UubGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBpbnNlcnRpb25JbmRleCA9IGNhbmRpZGF0ZUluc2VydGlvbkluZGV4ID49IDAgPyBjYW5kaWRhdGVJbnNlcnRpb25JbmRleCA6IC0oY2FuZGlkYXRlSW5zZXJ0aW9uSW5kZXggKyAxKTtcblx0XHRcdHRoaXMuX29yZGVyZWRDdXN0b21MaW5lcy5zcGxpY2UoaW5zZXJ0aW9uSW5kZXgsIDAsIHBlbmRpbmdDaGFuZ2UpO1xuXHRcdFx0dGhpcy5faW52YWxpZEluZGV4ID0gTWF0aC5taW4odGhpcy5faW52YWxpZEluZGV4LCBpbnNlcnRpb25JbmRleCk7XG5cdFx0fVxuXHRcdHN0YWdlZEluc2VydHMubGVuZ3RoID0gMDtcblx0XHRzdGFnZWRJZE1hcC5jbGVhcigpO1xuXHRcdGlmICh0aGlzLl9pbnZhbGlkSW5kZXggPT09IEluZmluaXR5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG5ld0RlY29yYXRpb25JRFRvU3BlY2lhbExpbmUgPSBuZXcgQXJyYXlNYXA8c3RyaW5nLCBDdXN0b21MaW5lPigpO1xuXHRcdGNvbnN0IG5ld09yZGVyZWRTcGVjaWFsTGluZXM6IEN1c3RvbUxpbmVbXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9pbnZhbGlkSW5kZXg7IGkrKykge1xuXHRcdFx0Y29uc3QgY3VzdG9tTGluZSA9IHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tpXTtcblx0XHRcdG5ld09yZGVyZWRTcGVjaWFsTGluZXMucHVzaChjdXN0b21MaW5lKTtcblx0XHRcdG5ld0RlY29yYXRpb25JRFRvU3BlY2lhbExpbmUuYWRkKGN1c3RvbUxpbmUuZGVjb3JhdGlvbklkLCBjdXN0b21MaW5lKTtcblx0XHR9XG5cblx0XHRsZXQgbnVtYmVyT2ZEZWxldGlvbnMgPSAwO1xuXHRcdGxldCBwcmV2aW91c1NwZWNpYWxMaW5lOiBDdXN0b21MaW5lIHwgdW5kZWZpbmVkID0gKHRoaXMuX2ludmFsaWRJbmRleCA+IDApID8gbmV3T3JkZXJlZFNwZWNpYWxMaW5lc1t0aGlzLl9pbnZhbGlkSW5kZXggLSAxXSA6IHVuZGVmaW5lZDtcblx0XHRmb3IgKGxldCBpID0gdGhpcy5faW52YWxpZEluZGV4OyBpIDwgdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXN0b21MaW5lID0gdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW2ldO1xuXHRcdFx0aWYgKGN1c3RvbUxpbmUuZGVsZXRlZCkge1xuXHRcdFx0XHRudW1iZXJPZkRlbGV0aW9ucysrO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGN1c3RvbUxpbmUuaW5kZXggPSBpIC0gbnVtYmVyT2ZEZWxldGlvbnM7XG5cdFx0XHRpZiAocHJldmlvdXNTcGVjaWFsTGluZSAmJiBwcmV2aW91c1NwZWNpYWxMaW5lLmxpbmVOdW1iZXIgPT09IGN1c3RvbUxpbmUubGluZU51bWJlcikge1xuXHRcdFx0XHRjdXN0b21MaW5lLm1heGltdW1TcGVjaWFsSGVpZ2h0ID0gcHJldmlvdXNTcGVjaWFsTGluZS5tYXhpbXVtU3BlY2lhbEhlaWdodDtcblx0XHRcdFx0Y3VzdG9tTGluZS5wcmVmaXhTdW0gPSBwcmV2aW91c1NwZWNpYWxMaW5lLnByZWZpeFN1bTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBtYXhpbXVtU3BlY2lhbEhlaWdodCA9IGN1c3RvbUxpbmUuc3BlY2lhbEhlaWdodDtcblx0XHRcdFx0Zm9yIChsZXQgaiA9IGk7IGogPCB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXMubGVuZ3RoOyBqKyspIHtcblx0XHRcdFx0XHRjb25zdCBuZXh0U3BlY2lhbExpbmUgPSB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbal07XG5cdFx0XHRcdFx0aWYgKG5leHRTcGVjaWFsTGluZS5kZWxldGVkKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG5leHRTcGVjaWFsTGluZS5saW5lTnVtYmVyICE9PSBjdXN0b21MaW5lLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtYXhpbXVtU3BlY2lhbEhlaWdodCA9IE1hdGgubWF4KG1heGltdW1TcGVjaWFsSGVpZ2h0LCBuZXh0U3BlY2lhbExpbmUuc3BlY2lhbEhlaWdodCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VzdG9tTGluZS5tYXhpbXVtU3BlY2lhbEhlaWdodCA9IG1heGltdW1TcGVjaWFsSGVpZ2h0O1xuXG5cdFx0XHRcdGxldCBwcmVmaXhTdW06IG51bWJlcjtcblx0XHRcdFx0aWYgKHByZXZpb3VzU3BlY2lhbExpbmUpIHtcblx0XHRcdFx0XHRwcmVmaXhTdW0gPSBwcmV2aW91c1NwZWNpYWxMaW5lLnByZWZpeFN1bSArIHByZXZpb3VzU3BlY2lhbExpbmUubWF4aW11bVNwZWNpYWxIZWlnaHQgKyB0aGlzLl9kZWZhdWx0TGluZUhlaWdodCAqIChjdXN0b21MaW5lLmxpbmVOdW1iZXIgLSBwcmV2aW91c1NwZWNpYWxMaW5lLmxpbmVOdW1iZXIgLSAxKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwcmVmaXhTdW0gPSB0aGlzLl9kZWZhdWx0TGluZUhlaWdodCAqIChjdXN0b21MaW5lLmxpbmVOdW1iZXIgLSAxKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjdXN0b21MaW5lLnByZWZpeFN1bSA9IHByZWZpeFN1bTtcblx0XHRcdH1cblx0XHRcdHByZXZpb3VzU3BlY2lhbExpbmUgPSBjdXN0b21MaW5lO1xuXHRcdFx0bmV3T3JkZXJlZFNwZWNpYWxMaW5lcy5wdXNoKGN1c3RvbUxpbmUpO1xuXHRcdFx0bmV3RGVjb3JhdGlvbklEVG9TcGVjaWFsTGluZS5hZGQoY3VzdG9tTGluZS5kZWNvcmF0aW9uSWQsIGN1c3RvbUxpbmUpO1xuXHRcdH1cblx0XHR0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXMgPSBuZXdPcmRlcmVkU3BlY2lhbExpbmVzO1xuXHRcdHRoaXMuX2RlY29yYXRpb25JRFRvQ3VzdG9tTGluZSA9IG5ld0RlY29yYXRpb25JRFRvU3BlY2lhbExpbmU7XG5cdFx0dGhpcy5faW52YWxpZEluZGV4ID0gSW5maW5pdHk7XG5cdH1cblxuXHRwcml2YXRlIF9kb0xpbmVzRGVsZXRlZChmcm9tTGluZU51bWJlcjogbnVtYmVyLCB0b0xpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGRlbGV0ZUNvdW50ID0gdG9MaW5lTnVtYmVyIC0gZnJvbUxpbmVOdW1iZXIgKyAxO1xuXHRcdGNvbnN0IG51bWJlck9mQ3VzdG9tTGluZXMgPSB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXMubGVuZ3RoO1xuXHRcdGNvbnN0IGNhbmRpZGF0ZVN0YXJ0SW5kZXhPZkRlbGV0aW9uID0gdGhpcy5fYmluYXJ5U2VhcmNoT3Zlck9yZGVyZWRDdXN0b21MaW5lc0FycmF5KGZyb21MaW5lTnVtYmVyKTtcblx0XHRsZXQgc3RhcnRJbmRleE9mRGVsZXRpb246IG51bWJlcjtcblx0XHRpZiAoY2FuZGlkYXRlU3RhcnRJbmRleE9mRGVsZXRpb24gPj0gMCkge1xuXHRcdFx0c3RhcnRJbmRleE9mRGVsZXRpb24gPSBjYW5kaWRhdGVTdGFydEluZGV4T2ZEZWxldGlvbjtcblx0XHRcdGZvciAobGV0IGkgPSBjYW5kaWRhdGVTdGFydEluZGV4T2ZEZWxldGlvbiAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbaV0ubGluZU51bWJlciA9PT0gZnJvbUxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRzdGFydEluZGV4T2ZEZWxldGlvbi0tO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXJ0SW5kZXhPZkRlbGV0aW9uID0gY2FuZGlkYXRlU3RhcnRJbmRleE9mRGVsZXRpb24gPT09IC0obnVtYmVyT2ZDdXN0b21MaW5lcyArIDEpICYmIGNhbmRpZGF0ZVN0YXJ0SW5kZXhPZkRlbGV0aW9uICE9PSAtMSA/IG51bWJlck9mQ3VzdG9tTGluZXMgLSAxIDogLSAoY2FuZGlkYXRlU3RhcnRJbmRleE9mRGVsZXRpb24gKyAxKTtcblx0XHR9XG5cdFx0Y29uc3QgY2FuZGlkYXRlRW5kSW5kZXhPZkRlbGV0aW9uID0gdGhpcy5fYmluYXJ5U2VhcmNoT3Zlck9yZGVyZWRDdXN0b21MaW5lc0FycmF5KHRvTGluZU51bWJlcik7XG5cdFx0bGV0IGVuZEluZGV4T2ZEZWxldGlvbjogbnVtYmVyO1xuXHRcdGlmIChjYW5kaWRhdGVFbmRJbmRleE9mRGVsZXRpb24gPj0gMCkge1xuXHRcdFx0ZW5kSW5kZXhPZkRlbGV0aW9uID0gY2FuZGlkYXRlRW5kSW5kZXhPZkRlbGV0aW9uO1xuXHRcdFx0Zm9yIChsZXQgaSA9IGNhbmRpZGF0ZUVuZEluZGV4T2ZEZWxldGlvbiArIDE7IGkgPCBudW1iZXJPZkN1c3RvbUxpbmVzOyBpKyspIHtcblx0XHRcdFx0aWYgKHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tpXS5saW5lTnVtYmVyID09PSB0b0xpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRlbmRJbmRleE9mRGVsZXRpb24rKztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbmRJbmRleE9mRGVsZXRpb24gPSBjYW5kaWRhdGVFbmRJbmRleE9mRGVsZXRpb24gPT09IC0obnVtYmVyT2ZDdXN0b21MaW5lcyArIDEpICYmIGNhbmRpZGF0ZUVuZEluZGV4T2ZEZWxldGlvbiAhPT0gLTEgPyBudW1iZXJPZkN1c3RvbUxpbmVzIC0gMSA6IC0gKGNhbmRpZGF0ZUVuZEluZGV4T2ZEZWxldGlvbiArIDEpO1xuXHRcdH1cblx0XHRjb25zdCBpc0VuZEluZGV4QmlnZ2VyVGhhblN0YXJ0SW5kZXggPSBlbmRJbmRleE9mRGVsZXRpb24gPiBzdGFydEluZGV4T2ZEZWxldGlvbjtcblx0XHRjb25zdCBpc0VuZEluZGV4RXF1YWxUb1N0YXJ0SW5kZXhBbmRDb3ZlcnNDdXN0b21MaW5lID0gZW5kSW5kZXhPZkRlbGV0aW9uID09PSBzdGFydEluZGV4T2ZEZWxldGlvblxuXHRcdFx0JiYgdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW3N0YXJ0SW5kZXhPZkRlbGV0aW9uXVxuXHRcdFx0JiYgdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW3N0YXJ0SW5kZXhPZkRlbGV0aW9uXS5saW5lTnVtYmVyID49IGZyb21MaW5lTnVtYmVyXG5cdFx0XHQmJiB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbc3RhcnRJbmRleE9mRGVsZXRpb25dLmxpbmVOdW1iZXIgPD0gdG9MaW5lTnVtYmVyO1xuXG5cdFx0aWYgKGlzRW5kSW5kZXhCaWdnZXJUaGFuU3RhcnRJbmRleCB8fCBpc0VuZEluZGV4RXF1YWxUb1N0YXJ0SW5kZXhBbmRDb3ZlcnNDdXN0b21MaW5lKSB7XG5cdFx0XHRsZXQgbWF4aW11bVNwZWNpYWxIZWlnaHRPbkRlbGV0ZWRJbnRlcnZhbCA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gc3RhcnRJbmRleE9mRGVsZXRpb247IGkgPD0gZW5kSW5kZXhPZkRlbGV0aW9uOyBpKyspIHtcblx0XHRcdFx0bWF4aW11bVNwZWNpYWxIZWlnaHRPbkRlbGV0ZWRJbnRlcnZhbCA9IE1hdGgubWF4KG1heGltdW1TcGVjaWFsSGVpZ2h0T25EZWxldGVkSW50ZXJ2YWwsIHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tpXS5tYXhpbXVtU3BlY2lhbEhlaWdodCk7XG5cdFx0XHR9XG5cdFx0XHRsZXQgcHJlZml4U3VtT25EZWxldGVkSW50ZXJ2YWwgPSAwO1xuXHRcdFx0aWYgKHN0YXJ0SW5kZXhPZkRlbGV0aW9uID4gMCkge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91c1NwZWNpYWxMaW5lID0gdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW3N0YXJ0SW5kZXhPZkRlbGV0aW9uIC0gMV07XG5cdFx0XHRcdHByZWZpeFN1bU9uRGVsZXRlZEludGVydmFsID0gcHJldmlvdXNTcGVjaWFsTGluZS5wcmVmaXhTdW0gKyBwcmV2aW91c1NwZWNpYWxMaW5lLm1heGltdW1TcGVjaWFsSGVpZ2h0ICsgdGhpcy5fZGVmYXVsdExpbmVIZWlnaHQgKiAoZnJvbUxpbmVOdW1iZXIgLSBwcmV2aW91c1NwZWNpYWxMaW5lLmxpbmVOdW1iZXIgLSAxKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByZWZpeFN1bU9uRGVsZXRlZEludGVydmFsID0gZnJvbUxpbmVOdW1iZXIgPiAwID8gKGZyb21MaW5lTnVtYmVyIC0gMSkgKiB0aGlzLl9kZWZhdWx0TGluZUhlaWdodCA6IDA7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmaXJzdFNwZWNpYWxMaW5lRGVsZXRlZCA9IHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tzdGFydEluZGV4T2ZEZWxldGlvbl07XG5cdFx0XHRjb25zdCBsYXN0U3BlY2lhbExpbmVEZWxldGVkID0gdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW2VuZEluZGV4T2ZEZWxldGlvbl07XG5cdFx0XHRjb25zdCBmaXJzdFNwZWNpYWxMaW5lQWZ0ZXJEZWxldGlvbiA9IHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tlbmRJbmRleE9mRGVsZXRpb24gKyAxXTtcblx0XHRcdGNvbnN0IGhlaWdodE9mRmlyc3RMaW5lQWZ0ZXJEZWxldGlvbiA9IGZpcnN0U3BlY2lhbExpbmVBZnRlckRlbGV0aW9uICYmIGZpcnN0U3BlY2lhbExpbmVBZnRlckRlbGV0aW9uLmxpbmVOdW1iZXIgPT09IHRvTGluZU51bWJlciArIDEgPyBmaXJzdFNwZWNpYWxMaW5lQWZ0ZXJEZWxldGlvbi5tYXhpbXVtU3BlY2lhbEhlaWdodCA6IHRoaXMuX2RlZmF1bHRMaW5lSGVpZ2h0O1xuXHRcdFx0Y29uc3QgdG90YWxIZWlnaHREZWxldGVkID0gbGFzdFNwZWNpYWxMaW5lRGVsZXRlZC5wcmVmaXhTdW1cblx0XHRcdFx0KyBsYXN0U3BlY2lhbExpbmVEZWxldGVkLm1heGltdW1TcGVjaWFsSGVpZ2h0XG5cdFx0XHRcdC0gZmlyc3RTcGVjaWFsTGluZURlbGV0ZWQucHJlZml4U3VtXG5cdFx0XHRcdCsgdGhpcy5fZGVmYXVsdExpbmVIZWlnaHQgKiAodG9MaW5lTnVtYmVyIC0gbGFzdFNwZWNpYWxMaW5lRGVsZXRlZC5saW5lTnVtYmVyKVxuXHRcdFx0XHQrIHRoaXMuX2RlZmF1bHRMaW5lSGVpZ2h0ICogKGZpcnN0U3BlY2lhbExpbmVEZWxldGVkLmxpbmVOdW1iZXIgLSBmcm9tTGluZU51bWJlcilcblx0XHRcdFx0KyBoZWlnaHRPZkZpcnN0TGluZUFmdGVyRGVsZXRpb24gLSBtYXhpbXVtU3BlY2lhbEhlaWdodE9uRGVsZXRlZEludGVydmFsO1xuXG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uSWRzU2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgbmV3T3JkZXJlZEN1c3RvbUxpbmVzOiBDdXN0b21MaW5lW10gPSBbXTtcblx0XHRcdGNvbnN0IG5ld0RlY29yYXRpb25JRFRvU3BlY2lhbExpbmUgPSBuZXcgQXJyYXlNYXA8c3RyaW5nLCBDdXN0b21MaW5lPigpO1xuXHRcdFx0bGV0IG51bWJlck9mRGVsZXRpb25zID0gMDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGN1c3RvbUxpbmUgPSB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbaV07XG5cdFx0XHRcdGlmIChpIDwgc3RhcnRJbmRleE9mRGVsZXRpb24pIHtcblx0XHRcdFx0XHRuZXdPcmRlcmVkQ3VzdG9tTGluZXMucHVzaChjdXN0b21MaW5lKTtcblx0XHRcdFx0XHRuZXdEZWNvcmF0aW9uSURUb1NwZWNpYWxMaW5lLmFkZChjdXN0b21MaW5lLmRlY29yYXRpb25JZCwgY3VzdG9tTGluZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaSA+PSBzdGFydEluZGV4T2ZEZWxldGlvbiAmJiBpIDw9IGVuZEluZGV4T2ZEZWxldGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGRlY29yYXRpb25JZCA9IGN1c3RvbUxpbmUuZGVjb3JhdGlvbklkO1xuXHRcdFx0XHRcdGlmICghZGVjb3JhdGlvbklkc1NlZW4uaGFzKGRlY29yYXRpb25JZCkpIHtcblx0XHRcdFx0XHRcdGN1c3RvbUxpbmUuaW5kZXggLT0gbnVtYmVyT2ZEZWxldGlvbnM7XG5cdFx0XHRcdFx0XHRjdXN0b21MaW5lLmxpbmVOdW1iZXIgPSBmcm9tTGluZU51bWJlcjtcblx0XHRcdFx0XHRcdGN1c3RvbUxpbmUucHJlZml4U3VtID0gcHJlZml4U3VtT25EZWxldGVkSW50ZXJ2YWw7XG5cdFx0XHRcdFx0XHRjdXN0b21MaW5lLm1heGltdW1TcGVjaWFsSGVpZ2h0ID0gbWF4aW11bVNwZWNpYWxIZWlnaHRPbkRlbGV0ZWRJbnRlcnZhbDtcblx0XHRcdFx0XHRcdG5ld09yZGVyZWRDdXN0b21MaW5lcy5wdXNoKGN1c3RvbUxpbmUpO1xuXHRcdFx0XHRcdFx0bmV3RGVjb3JhdGlvbklEVG9TcGVjaWFsTGluZS5hZGQoY3VzdG9tTGluZS5kZWNvcmF0aW9uSWQsIGN1c3RvbUxpbmUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRudW1iZXJPZkRlbGV0aW9ucysrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChpID4gZW5kSW5kZXhPZkRlbGV0aW9uKSB7XG5cdFx0XHRcdFx0Y3VzdG9tTGluZS5pbmRleCAtPSBudW1iZXJPZkRlbGV0aW9ucztcblx0XHRcdFx0XHRjdXN0b21MaW5lLmxpbmVOdW1iZXIgLT0gZGVsZXRlQ291bnQ7XG5cdFx0XHRcdFx0Y3VzdG9tTGluZS5wcmVmaXhTdW0gLT0gdG90YWxIZWlnaHREZWxldGVkO1xuXHRcdFx0XHRcdG5ld09yZGVyZWRDdXN0b21MaW5lcy5wdXNoKGN1c3RvbUxpbmUpO1xuXHRcdFx0XHRcdG5ld0RlY29yYXRpb25JRFRvU3BlY2lhbExpbmUuYWRkKGN1c3RvbUxpbmUuZGVjb3JhdGlvbklkLCBjdXN0b21MaW5lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWNvcmF0aW9uSWRzU2Vlbi5hZGQoY3VzdG9tTGluZS5kZWNvcmF0aW9uSWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzID0gbmV3T3JkZXJlZEN1c3RvbUxpbmVzO1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbklEVG9DdXN0b21MaW5lID0gbmV3RGVjb3JhdGlvbklEVG9TcGVjaWFsTGluZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdG90YWxIZWlnaHREZWxldGVkID0gZGVsZXRlQ291bnQgKiB0aGlzLl9kZWZhdWx0TGluZUhlaWdodDtcblx0XHRcdGZvciAobGV0IGkgPSBlbmRJbmRleE9mRGVsZXRpb247IGkgPCB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY3VzdG9tTGluZSA9IHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tpXTtcblx0XHRcdFx0aWYgKGN1c3RvbUxpbmUubGluZU51bWJlciA+IHRvTGluZU51bWJlcikge1xuXHRcdFx0XHRcdGN1c3RvbUxpbmUubGluZU51bWJlciAtPSBkZWxldGVDb3VudDtcblx0XHRcdFx0XHRjdXN0b21MaW5lLnByZWZpeFN1bSAtPSB0b3RhbEhlaWdodERlbGV0ZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kb0xpbmVzSW5zZXJ0ZWQoZnJvbUxpbmVOdW1iZXI6IG51bWJlciwgdG9MaW5lTnVtYmVyOiBudW1iZXIsIHN0YWdlZEluc2VydHM6IEN1c3RvbUxpbmVbXSwgc3RhZ2VkSWRNYXA6IEFycmF5TWFwPHN0cmluZywgQ3VzdG9tTGluZT4pOiB2b2lkIHtcblx0XHRjb25zdCBpbnNlcnRDb3VudCA9IHRvTGluZU51bWJlciAtIGZyb21MaW5lTnVtYmVyICsgMTtcblx0XHRjb25zdCBjYW5kaWRhdGVTdGFydEluZGV4T2ZJbnNlcnRpb24gPSB0aGlzLl9iaW5hcnlTZWFyY2hPdmVyT3JkZXJlZEN1c3RvbUxpbmVzQXJyYXkoZnJvbUxpbmVOdW1iZXIpO1xuXHRcdGxldCBzdGFydEluZGV4T2ZJbnNlcnRpb246IG51bWJlcjtcblx0XHRpZiAoY2FuZGlkYXRlU3RhcnRJbmRleE9mSW5zZXJ0aW9uID49IDApIHtcblx0XHRcdHN0YXJ0SW5kZXhPZkluc2VydGlvbiA9IGNhbmRpZGF0ZVN0YXJ0SW5kZXhPZkluc2VydGlvbjtcblx0XHRcdGZvciAobGV0IGkgPSBjYW5kaWRhdGVTdGFydEluZGV4T2ZJbnNlcnRpb24gLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRpZiAodGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW2ldLmxpbmVOdW1iZXIgPT09IGZyb21MaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0c3RhcnRJbmRleE9mSW5zZXJ0aW9uLS07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RhcnRJbmRleE9mSW5zZXJ0aW9uID0gLShjYW5kaWRhdGVTdGFydEluZGV4T2ZJbnNlcnRpb24gKyAxKTtcblx0XHR9XG5cdFx0Y29uc3QgdG9SZUFkZDogQ3VzdG9tTGluZUhlaWdodERhdGFbXSA9IFtdO1xuXHRcdGNvbnN0IGRlY29yYXRpb25zSW1tZWRpYXRlbHlBZnRlciA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAobGV0IGkgPSBzdGFydEluZGV4T2ZJbnNlcnRpb247IGkgPCB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICh0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbaV0ubGluZU51bWJlciA9PT0gZnJvbUxpbmVOdW1iZXIpIHtcblx0XHRcdFx0ZGVjb3JhdGlvbnNJbW1lZGlhdGVseUFmdGVyLmFkZCh0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbaV0uZGVjb3JhdGlvbklkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZGVjb3JhdGlvbnNJbW1lZGlhdGVseUJlZm9yZSA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAobGV0IGkgPSBzdGFydEluZGV4T2ZJbnNlcnRpb24gLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKHRoaXMuX29yZGVyZWRDdXN0b21MaW5lc1tpXS5saW5lTnVtYmVyID09PSBmcm9tTGluZU51bWJlciAtIDEpIHtcblx0XHRcdFx0ZGVjb3JhdGlvbnNJbW1lZGlhdGVseUJlZm9yZS5hZGQodGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW2ldLmRlY29yYXRpb25JZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGRlY29yYXRpb25zV2l0aEdhcHMgPSBpbnRlcnNlY3Rpb24oZGVjb3JhdGlvbnNJbW1lZGlhdGVseUJlZm9yZSwgZGVjb3JhdGlvbnNJbW1lZGlhdGVseUFmdGVyKTtcblx0XHRjb25zdCBwcmVmaXhTdW1Ub0FkZCA9IGluc2VydENvdW50ICogdGhpcy5fZGVmYXVsdExpbmVIZWlnaHQ7XG5cdFx0Zm9yIChsZXQgaSA9IHN0YXJ0SW5kZXhPZkluc2VydGlvbjsgaSA8IHRoaXMuX29yZGVyZWRDdXN0b21MaW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5fb3JkZXJlZEN1c3RvbUxpbmVzW2ldLmxpbmVOdW1iZXIgKz0gaW5zZXJ0Q291bnQ7XG5cdFx0XHR0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbaV0ucHJlZml4U3VtICs9IHByZWZpeFN1bVRvQWRkO1xuXHRcdH1cblxuXHRcdGlmIChkZWNvcmF0aW9uc1dpdGhHYXBzLnNpemUgPiAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb25JZCBvZiBkZWNvcmF0aW9uc1dpdGhHYXBzKSB7XG5cdFx0XHRcdGNvbnN0IGRlY29yYXRpb24gPSB0aGlzLl9kZWNvcmF0aW9uSURUb0N1c3RvbUxpbmUuZ2V0KGRlY29yYXRpb25JZCk7XG5cdFx0XHRcdGlmIChkZWNvcmF0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gZGVjb3JhdGlvbi5yZWR1Y2UoKG1pbiwgbCkgPT4gTWF0aC5taW4obWluLCBsLmxpbmVOdW1iZXIpLCBmcm9tTGluZU51bWJlcik7IC8vIG1pblxuXHRcdFx0XHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSBkZWNvcmF0aW9uLnJlZHVjZSgobWF4LCBsKSA9PiBNYXRoLm1heChtYXgsIGwubGluZU51bWJlciksIGZyb21MaW5lTnVtYmVyKTsgLy8gbWF4XG5cdFx0XHRcdFx0Y29uc3QgbGluZUhlaWdodCA9IGRlY29yYXRpb24ucmVkdWNlKChtYXgsIGwpID0+IE1hdGgubWF4KG1heCwgbC5zcGVjaWFsSGVpZ2h0KSwgMCk7XG5cdFx0XHRcdFx0dG9SZUFkZC5wdXNoKHtcblx0XHRcdFx0XHRcdGRlY29yYXRpb25JZCxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRsaW5lSGVpZ2h0XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBkZWMgb2YgdG9SZUFkZCkge1xuXHRcdFx0XHR0aGlzLl9kb0luc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodChkZWMuZGVjb3JhdGlvbklkLCBkZWMuc3RhcnRMaW5lTnVtYmVyLCBkZWMuZW5kTGluZU51bWJlciwgZGVjLmxpbmVIZWlnaHQsIHN0YWdlZEluc2VydHMsIHN0YWdlZElkTWFwKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9iaW5hcnlTZWFyY2hPdmVyT3JkZXJlZEN1c3RvbUxpbmVzQXJyYXkobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gYmluYXJ5U2VhcmNoMih0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXMubGVuZ3RoLCAoaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IGxpbmUgPSB0aGlzLl9vcmRlcmVkQ3VzdG9tTGluZXNbaW5kZXhdO1xuXHRcdFx0aWYgKGxpbmUubGluZU51bWJlciA9PT0gbGluZU51bWJlcikge1xuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH0gZWxzZSBpZiAobGluZS5saW5lTnVtYmVyIDwgbGluZU51bWJlcikge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3VzdG9tTGluZUhlaWdodERhdGEge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGRlY29yYXRpb25JZDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IGVuZExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRyZWFkb25seSBsaW5lSGVpZ2h0OiBudW1iZXJcblx0KSB7IH1cblxuXHRwdWJsaWMgc3RhdGljIGZyb21EZWNvcmF0aW9ucyhkZWNvcmF0aW9uczogSU1vZGVsRGVjb3JhdGlvbltdLCBjb29yZGluYXRlc0NvbnZlcnRlcjogSUNvb3JkaW5hdGVzQ29udmVydGVyLCBjb25maWd1cmF0aW9uOiBJRWRpdG9yQ29uZmlndXJhdGlvbik6IEN1c3RvbUxpbmVIZWlnaHREYXRhW10ge1xuXHRcdGNvbnN0IGRlZmF1bHRMaW5lSGVpZ2h0ID0gY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0cmV0dXJuIGRlY29yYXRpb25zLm1hcCgoZCkgPT4ge1xuXHRcdFx0Y29uc3Qgdmlld1JhbmdlID0gY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUmFuZ2VUb1ZpZXdSYW5nZShkLnJhbmdlKTtcblx0XHRcdHJldHVybiBuZXcgQ3VzdG9tTGluZUhlaWdodERhdGEoXG5cdFx0XHRcdGQuaWQsXG5cdFx0XHRcdHZpZXdSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdHZpZXdSYW5nZS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRkLm9wdGlvbnMubGluZUhlaWdodCA/IGQub3B0aW9ucy5saW5lSGVpZ2h0ICogZGVmYXVsdExpbmVIZWlnaHQgOiAwXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIEFycmF5TWFwPEssIFQ+IHtcblxuXHRwcml2YXRlIF9tYXA6IE1hcDxLLCBUW10+ID0gbmV3IE1hcDxLLCBUW10+KCk7XG5cblx0Y29uc3RydWN0b3IoKSB7IH1cblxuXHRhZGQoa2V5OiBLLCB2YWx1ZTogVCkge1xuXHRcdGNvbnN0IGFycmF5ID0gdGhpcy5fbWFwLmdldChrZXkpO1xuXHRcdGlmICghYXJyYXkpIHtcblx0XHRcdHRoaXMuX21hcC5zZXQoa2V5LCBbdmFsdWVdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXJyYXkucHVzaCh2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0KGtleTogSyk6IFRbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX21hcC5nZXQoa2V5KTtcblx0fVxuXG5cdGRlbGV0ZShrZXk6IEspOiB2b2lkIHtcblx0XHR0aGlzLl9tYXAuZGVsZXRlKGtleSk7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl9tYXAuY2xlYXIoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxvQkFBb0I7QUFJN0IsSUFBVyxvQkFBWCxrQkFBV0EsdUJBQVg7QUFDQyxFQUFBQSxzQ0FBQTtBQUNBLEVBQUFBLHNDQUFBO0FBQ0EsRUFBQUEsc0NBQUE7QUFDQSxFQUFBQSxzQ0FBQTtBQUpVLFNBQUFBO0FBQUEsR0FBQTtBQWFKLE1BQU0sV0FBVztBQUFBLEVBVXZCLFlBQVksY0FBc0IsT0FBZSxZQUFvQixlQUF1QixXQUFtQjtBQUM5RyxTQUFLLGVBQWU7QUFDcEIsU0FBSyxRQUFRO0FBQ2IsU0FBSyxhQUFhO0FBQ2xCLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssWUFBWTtBQUNqQixTQUFLLHVCQUF1QjtBQUM1QixTQUFLLFVBQVU7QUFBQSxFQUNoQjtBQUNEO0FBNEJPLE1BQU0sbUJBQW1CO0FBQUEsRUFTL0IsWUFBWSxtQkFBMkIsc0JBQThDO0FBUHJGLFNBQVEsNEJBQTBELElBQUksU0FBNkI7QUFDbkcsU0FBUSxzQkFBb0MsQ0FBQztBQUM3QyxTQUFRLGtCQUFtQyxDQUFDO0FBQzVDLFNBQVEsZ0JBQXdCO0FBRWhDLFNBQVEsY0FBdUI7QUFHOUIsU0FBSyxxQkFBcUI7QUFDMUIsZUFBVyxRQUFRLHNCQUFzQjtBQUN4QyxXQUFLLCtCQUErQixLQUFLLGNBQWMsS0FBSyxpQkFBaUIsS0FBSyxlQUFlLEtBQUssVUFBVTtBQUFBLElBQ2pIO0FBQUEsRUFDRDtBQUFBLEVB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
