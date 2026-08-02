import { Emitter } from "../../../../base/common/event.js";
import { FoldingRegions, FoldSource } from "./foldingRanges.js";
import { hash } from "../../../../base/common/hash.js";
import { Range } from "../../../common/core/range.js";
class FoldingModel {
  constructor(textModel, decorationProvider) {
    this._updateEventEmitter = new Emitter();
    this.onDidChange = this._updateEventEmitter.event;
    this._textModel = textModel;
    this._decorationProvider = decorationProvider;
    this._regions = new FoldingRegions(new Uint32Array(0), new Uint32Array(0));
    this._editorDecorationIds = [];
  }
  get regions() {
    return this._regions;
  }
  get textModel() {
    return this._textModel;
  }
  get decorationProvider() {
    return this._decorationProvider;
  }
  toggleCollapseState(toggledRegions) {
    if (!toggledRegions.length) {
      return;
    }
    toggledRegions = toggledRegions.sort((r1, r2) => r1.regionIndex - r2.regionIndex);
    const processed = {};
    this._decorationProvider.changeDecorations((accessor) => {
      let k = 0;
      let dirtyRegionEndLine = -1;
      let lastHiddenLine = -1;
      const updateDecorationsUntil = (index) => {
        while (k < index) {
          const endLineNumber = this._regions.getEndLineNumber(k);
          const isCollapsed = this._regions.isCollapsed(k);
          if (endLineNumber <= dirtyRegionEndLine) {
            const isManual = this.regions.getSource(k) !== FoldSource.provider;
            accessor.changeDecorationOptions(this._editorDecorationIds[k], this._decorationProvider.getDecorationOption(isCollapsed, endLineNumber <= lastHiddenLine, isManual));
          }
          if (isCollapsed && endLineNumber > lastHiddenLine) {
            lastHiddenLine = endLineNumber;
          }
          k++;
        }
      };
      for (const region of toggledRegions) {
        const index = region.regionIndex;
        const editorDecorationId = this._editorDecorationIds[index];
        if (editorDecorationId && !processed[editorDecorationId]) {
          processed[editorDecorationId] = true;
          updateDecorationsUntil(index);
          const newCollapseState = !this._regions.isCollapsed(index);
          this._regions.setCollapsed(index, newCollapseState);
          dirtyRegionEndLine = Math.max(dirtyRegionEndLine, this._regions.getEndLineNumber(index));
        }
      }
      updateDecorationsUntil(this._regions.length);
    });
    this._updateEventEmitter.fire({ model: this, collapseStateChanged: toggledRegions });
  }
  removeManualRanges(ranges) {
    const rangeIndexesToRemove = /* @__PURE__ */ new Set();
    let removeAll = false;
    for (const range of ranges) {
      if (Range.isEmpty(range)) {
        let index = this._regions.findRange(range.startLineNumber);
        while (index !== -1 && this._regions.getSource(index) === FoldSource.provider) {
          index = this._regions.getParentIndex(index);
        }
        if (index === -1) {
          removeAll = true;
        } else {
          rangeIndexesToRemove.add(index);
        }
      }
    }
    const newFoldingRanges = new Array();
    const intersectsSelection = (foldRange) => {
      for (const range of ranges) {
        if (!Range.isEmpty(range) && !(range.startLineNumber > foldRange.endLineNumber || foldRange.startLineNumber > range.endLineNumber)) {
          return true;
        }
      }
      return false;
    };
    for (let i = 0; i < this._regions.length; i++) {
      const foldRange = this._regions.toFoldRange(i);
      if (foldRange.source === FoldSource.provider || !removeAll && !rangeIndexesToRemove.has(i) && !intersectsSelection(foldRange)) {
        newFoldingRanges.push(foldRange);
      }
    }
    this.updatePost(FoldingRegions.fromFoldRanges(newFoldingRanges));
  }
  update(newRegions, selection) {
    const foldedOrManualRanges = this._currentFoldedOrManualRanges(selection);
    const newRanges = FoldingRegions.sanitizeAndMerge(newRegions, foldedOrManualRanges, this._textModel.getLineCount(), selection);
    this.updatePost(FoldingRegions.fromFoldRanges(newRanges));
  }
  updatePost(newRegions) {
    const newEditorDecorations = [];
    let lastHiddenLine = -1;
    for (let index = 0, limit = newRegions.length; index < limit; index++) {
      const startLineNumber = newRegions.getStartLineNumber(index);
      const endLineNumber = newRegions.getEndLineNumber(index);
      const isCollapsed = newRegions.isCollapsed(index);
      const isManual = newRegions.getSource(index) !== FoldSource.provider;
      const decorationRange = {
        startLineNumber,
        startColumn: this._textModel.getLineMaxColumn(startLineNumber),
        endLineNumber,
        endColumn: this._textModel.getLineMaxColumn(endLineNumber) + 1
      };
      newEditorDecorations.push({ range: decorationRange, options: this._decorationProvider.getDecorationOption(isCollapsed, endLineNumber <= lastHiddenLine, isManual) });
      if (isCollapsed && endLineNumber > lastHiddenLine) {
        lastHiddenLine = endLineNumber;
      }
    }
    this._decorationProvider.changeDecorations((accessor) => this._editorDecorationIds = accessor.deltaDecorations(this._editorDecorationIds, newEditorDecorations));
    this._regions = newRegions;
    this._updateEventEmitter.fire({ model: this });
  }
  _currentFoldedOrManualRanges(selection) {
    const foldedRanges = [];
    for (let i = 0, limit = this._regions.length; i < limit; i++) {
      let isCollapsed = this.regions.isCollapsed(i);
      const source = this.regions.getSource(i);
      if (isCollapsed || source !== FoldSource.provider) {
        const foldRange = this._regions.toFoldRange(i);
        const decRange = this._textModel.getDecorationRange(this._editorDecorationIds[i]);
        if (decRange) {
          if (isCollapsed && selection?.startsInside(decRange.startLineNumber + 1, decRange.endLineNumber)) {
            isCollapsed = false;
          }
          foldedRanges.push({
            startLineNumber: decRange.startLineNumber,
            endLineNumber: decRange.endLineNumber,
            type: foldRange.type,
            isCollapsed,
            source
          });
        }
      }
    }
    return foldedRanges;
  }
  /**
   * Collapse state memento, for persistence only
   */
  getMemento() {
    const foldedOrManualRanges = this._currentFoldedOrManualRanges();
    const result = [];
    const maxLineNumber = this._textModel.getLineCount();
    for (let i = 0, limit = foldedOrManualRanges.length; i < limit; i++) {
      const range = foldedOrManualRanges[i];
      if (range.startLineNumber >= range.endLineNumber || range.startLineNumber < 1 || range.endLineNumber > maxLineNumber) {
        continue;
      }
      const checksum = this._getLinesChecksum(range.startLineNumber + 1, range.endLineNumber);
      result.push({
        startLineNumber: range.startLineNumber,
        endLineNumber: range.endLineNumber,
        isCollapsed: range.isCollapsed,
        source: range.source,
        checksum
      });
    }
    return result.length > 0 ? result : void 0;
  }
  /**
   * Apply persisted state, for persistence only
   */
  applyMemento(state) {
    if (!Array.isArray(state)) {
      return;
    }
    const rangesToRestore = [];
    const maxLineNumber = this._textModel.getLineCount();
    for (const range of state) {
      if (range.startLineNumber >= range.endLineNumber || range.startLineNumber < 1 || range.endLineNumber > maxLineNumber) {
        continue;
      }
      const checksum = this._getLinesChecksum(range.startLineNumber + 1, range.endLineNumber);
      if (!range.checksum || checksum === range.checksum) {
        rangesToRestore.push({
          startLineNumber: range.startLineNumber,
          endLineNumber: range.endLineNumber,
          type: void 0,
          isCollapsed: range.isCollapsed ?? true,
          source: range.source ?? FoldSource.provider
        });
      }
    }
    const newRanges = FoldingRegions.sanitizeAndMerge(this._regions, rangesToRestore, maxLineNumber);
    this.updatePost(FoldingRegions.fromFoldRanges(newRanges));
  }
  _getLinesChecksum(lineNumber1, lineNumber2) {
    const h = hash(this._textModel.getLineContent(lineNumber1) + this._textModel.getLineContent(lineNumber2));
    return h % 1e6;
  }
  dispose() {
    this._decorationProvider.removeDecorations(this._editorDecorationIds);
    this._updateEventEmitter.dispose();
  }
  getAllRegionsAtLine(lineNumber, filter) {
    const result = [];
    if (this._regions) {
      let index = this._regions.findRange(lineNumber);
      let level = 1;
      while (index >= 0) {
        const current = this._regions.toRegion(index);
        if (!filter || filter(current, level)) {
          result.push(current);
        }
        level++;
        index = current.parentIndex;
      }
    }
    return result;
  }
  getRegionAtLine(lineNumber) {
    if (this._regions) {
      const index = this._regions.findRange(lineNumber);
      if (index >= 0) {
        return this._regions.toRegion(index);
      }
    }
    return null;
  }
  getRegionsInside(region, filter) {
    const result = [];
    const index = region ? region.regionIndex + 1 : 0;
    const endLineNumber = region ? region.endLineNumber : Number.MAX_VALUE;
    if (filter && filter.length === 2) {
      const levelStack = [];
      for (let i = index, len = this._regions.length; i < len; i++) {
        const current = this._regions.toRegion(i);
        if (this._regions.getStartLineNumber(i) < endLineNumber) {
          while (levelStack.length > 0 && !current.containedBy(levelStack[levelStack.length - 1])) {
            levelStack.pop();
          }
          levelStack.push(current);
          if (filter(current, levelStack.length)) {
            result.push(current);
          }
        } else {
          break;
        }
      }
    } else {
      for (let i = index, len = this._regions.length; i < len; i++) {
        const current = this._regions.toRegion(i);
        if (this._regions.getStartLineNumber(i) < endLineNumber) {
          if (!filter || filter(current)) {
            result.push(current);
          }
        } else {
          break;
        }
      }
    }
    return result;
  }
}
function toggleCollapseState(foldingModel, levels, lineNumbers) {
  const toToggle = [];
  for (const lineNumber of lineNumbers) {
    const region = foldingModel.getRegionAtLine(lineNumber);
    if (region) {
      const doCollapse = !region.isCollapsed;
      toToggle.push(region);
      if (levels > 1) {
        const regionsInside = foldingModel.getRegionsInside(region, (r, level) => r.isCollapsed !== doCollapse && level < levels);
        toToggle.push(...regionsInside);
      }
    }
  }
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateLevelsDown(foldingModel, doCollapse, levels = Number.MAX_VALUE, lineNumbers) {
  const toToggle = [];
  if (lineNumbers && lineNumbers.length > 0) {
    for (const lineNumber of lineNumbers) {
      const region = foldingModel.getRegionAtLine(lineNumber);
      if (region) {
        if (region.isCollapsed !== doCollapse) {
          toToggle.push(region);
        }
        if (levels > 1) {
          const regionsInside = foldingModel.getRegionsInside(region, (r, level) => r.isCollapsed !== doCollapse && level < levels);
          toToggle.push(...regionsInside);
        }
      }
    }
  } else {
    const regionsInside = foldingModel.getRegionsInside(null, (r, level) => r.isCollapsed !== doCollapse && level < levels);
    toToggle.push(...regionsInside);
  }
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateLevelsUp(foldingModel, doCollapse, levels, lineNumbers) {
  const toToggle = [];
  for (const lineNumber of lineNumbers) {
    const regions = foldingModel.getAllRegionsAtLine(lineNumber, (region, level) => region.isCollapsed !== doCollapse && level <= levels);
    toToggle.push(...regions);
  }
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateUp(foldingModel, doCollapse, lineNumbers) {
  const toToggle = [];
  for (const lineNumber of lineNumbers) {
    const regions = foldingModel.getAllRegionsAtLine(lineNumber, (region) => region.isCollapsed !== doCollapse);
    if (regions.length > 0) {
      toToggle.push(regions[0]);
    }
  }
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateAtLevel(foldingModel, foldLevel, doCollapse, blockedLineNumbers) {
  const filter = (region, level) => level === foldLevel && region.isCollapsed !== doCollapse && !blockedLineNumbers.some((line) => region.containsLine(line));
  const toToggle = foldingModel.getRegionsInside(null, filter);
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateForRest(foldingModel, doCollapse, blockedLineNumbers) {
  const filteredRegions = [];
  for (const lineNumber of blockedLineNumbers) {
    const regions = foldingModel.getAllRegionsAtLine(lineNumber, void 0);
    if (regions.length > 0) {
      filteredRegions.push(regions[0]);
    }
  }
  const filter = (region) => filteredRegions.every((filteredRegion) => !filteredRegion.containedBy(region) && !region.containedBy(filteredRegion)) && region.isCollapsed !== doCollapse;
  const toToggle = foldingModel.getRegionsInside(null, filter);
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateForMatchingLines(foldingModel, regExp, doCollapse) {
  const editorModel = foldingModel.textModel;
  const regions = foldingModel.regions;
  const toToggle = [];
  for (let i = regions.length - 1; i >= 0; i--) {
    if (doCollapse !== regions.isCollapsed(i)) {
      const startLineNumber = regions.getStartLineNumber(i);
      if (regExp.test(editorModel.getLineContent(startLineNumber))) {
        toToggle.push(regions.toRegion(i));
      }
    }
  }
  foldingModel.toggleCollapseState(toToggle);
}
function setCollapseStateForType(foldingModel, type, doCollapse) {
  const regions = foldingModel.regions;
  const toToggle = [];
  for (let i = regions.length - 1; i >= 0; i--) {
    if (doCollapse !== regions.isCollapsed(i) && type === regions.getType(i)) {
      toToggle.push(regions.toRegion(i));
    }
  }
  foldingModel.toggleCollapseState(toToggle);
}
function getParentFoldLine(lineNumber, foldingModel) {
  let startLineNumber = null;
  const foldingRegion = foldingModel.getRegionAtLine(lineNumber);
  if (foldingRegion !== null) {
    startLineNumber = foldingRegion.startLineNumber;
    if (lineNumber === startLineNumber) {
      const parentFoldingIdx = foldingRegion.parentIndex;
      if (parentFoldingIdx !== -1) {
        startLineNumber = foldingModel.regions.getStartLineNumber(parentFoldingIdx);
      } else {
        startLineNumber = null;
      }
    }
  }
  return startLineNumber;
}
function getPreviousFoldLine(lineNumber, foldingModel) {
  let foldingRegion = foldingModel.getRegionAtLine(lineNumber);
  if (foldingRegion !== null && foldingRegion.startLineNumber === lineNumber) {
    if (lineNumber !== foldingRegion.startLineNumber) {
      return foldingRegion.startLineNumber;
    } else {
      const expectedParentIndex = foldingRegion.parentIndex;
      let minLineNumber = 0;
      if (expectedParentIndex !== -1) {
        minLineNumber = foldingModel.regions.getStartLineNumber(foldingRegion.parentIndex);
      }
      while (foldingRegion !== null) {
        if (foldingRegion.regionIndex > 0) {
          foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex - 1);
          if (foldingRegion.startLineNumber <= minLineNumber) {
            return null;
          } else if (foldingRegion.parentIndex === expectedParentIndex) {
            return foldingRegion.startLineNumber;
          }
        } else {
          return null;
        }
      }
    }
  } else {
    if (foldingModel.regions.length > 0) {
      foldingRegion = foldingModel.regions.toRegion(foldingModel.regions.length - 1);
      while (foldingRegion !== null) {
        if (foldingRegion.startLineNumber < lineNumber) {
          return foldingRegion.startLineNumber;
        }
        if (foldingRegion.regionIndex > 0) {
          foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex - 1);
        } else {
          foldingRegion = null;
        }
      }
    }
  }
  return null;
}
function getNextFoldLine(lineNumber, foldingModel) {
  let foldingRegion = foldingModel.getRegionAtLine(lineNumber);
  if (foldingRegion !== null && foldingRegion.startLineNumber === lineNumber) {
    const expectedParentIndex = foldingRegion.parentIndex;
    let maxLineNumber = 0;
    if (expectedParentIndex !== -1) {
      maxLineNumber = foldingModel.regions.getEndLineNumber(foldingRegion.parentIndex);
    } else if (foldingModel.regions.length === 0) {
      return null;
    } else {
      maxLineNumber = foldingModel.regions.getEndLineNumber(foldingModel.regions.length - 1);
    }
    while (foldingRegion !== null) {
      if (foldingRegion.regionIndex < foldingModel.regions.length) {
        foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex + 1);
        if (foldingRegion.startLineNumber >= maxLineNumber) {
          return null;
        } else if (foldingRegion.parentIndex === expectedParentIndex) {
          return foldingRegion.startLineNumber;
        }
      } else {
        return null;
      }
    }
  } else {
    if (foldingModel.regions.length > 0) {
      foldingRegion = foldingModel.regions.toRegion(0);
      while (foldingRegion !== null) {
        if (foldingRegion.startLineNumber > lineNumber) {
          return foldingRegion.startLineNumber;
        }
        if (foldingRegion.regionIndex < foldingModel.regions.length) {
          foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex + 1);
        } else {
          foldingRegion = null;
        }
      }
    }
  }
  return null;
}
export {
  FoldingModel,
  getNextFoldLine,
  getParentFoldLine,
  getPreviousFoldLine,
  setCollapseStateAtLevel,
  setCollapseStateForMatchingLines,
  setCollapseStateForRest,
  setCollapseStateForType,
  setCollapseStateLevelsDown,
  setCollapseStateLevelsUp,
  setCollapseStateUp,
  toggleCollapseState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2ZvbGRpbmcvYnJvd3Nlci9mb2xkaW5nTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNb2RlbERlY29yYXRpb25PcHRpb25zLCBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yLCBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgRm9sZGluZ1JlZ2lvbiwgRm9sZGluZ1JlZ2lvbnMsIElMaW5lUmFuZ2UsIEZvbGRSYW5nZSwgRm9sZFNvdXJjZSB9IGZyb20gJy4vZm9sZGluZ1Jhbmdlcy5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBTZWxlY3RlZExpbmVzIH0gZnJvbSAnLi9mb2xkaW5nLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURlY29yYXRpb25Qcm92aWRlciB7XG5cdGdldERlY29yYXRpb25PcHRpb24oaXNDb2xsYXBzZWQ6IGJvb2xlYW4sIGlzSGlkZGVuOiBib29sZWFuLCBpc01hbnVhbDogYm9vbGVhbik6IElNb2RlbERlY29yYXRpb25PcHRpb25zO1xuXHRjaGFuZ2VEZWNvcmF0aW9uczxUPihjYWxsYmFjazogKGNoYW5nZUFjY2Vzc29yOiBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yKSA9PiBUKTogVCB8IG51bGw7XG5cdHJlbW92ZURlY29yYXRpb25zKGRlY29yYXRpb25JZHM6IHN0cmluZ1tdKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGb2xkaW5nTW9kZWxDaGFuZ2VFdmVudCB7XG5cdG1vZGVsOiBGb2xkaW5nTW9kZWw7XG5cdGNvbGxhcHNlU3RhdGVDaGFuZ2VkPzogRm9sZGluZ1JlZ2lvbltdO1xufVxuXG5pbnRlcmZhY2UgSUxpbmVNZW1lbnRvIGV4dGVuZHMgSUxpbmVSYW5nZSB7XG5cdGNoZWNrc3VtPzogbnVtYmVyO1xuXHRpc0NvbGxhcHNlZD86IGJvb2xlYW47XG5cdHNvdXJjZT86IEZvbGRTb3VyY2U7XG59XG5cbmV4cG9ydCB0eXBlIENvbGxhcHNlTWVtZW50byA9IElMaW5lTWVtZW50b1tdO1xuXG5leHBvcnQgY2xhc3MgRm9sZGluZ01vZGVsIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXh0TW9kZWw6IElUZXh0TW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25Qcm92aWRlcjogSURlY29yYXRpb25Qcm92aWRlcjtcblxuXHRwcml2YXRlIF9yZWdpb25zOiBGb2xkaW5nUmVnaW9ucztcblx0cHJpdmF0ZSBfZWRpdG9yRGVjb3JhdGlvbklkczogc3RyaW5nW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdXBkYXRlRXZlbnRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8Rm9sZGluZ01vZGVsQ2hhbmdlRXZlbnQ+KCk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8Rm9sZGluZ01vZGVsQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fdXBkYXRlRXZlbnRFbWl0dGVyLmV2ZW50O1xuXG5cdHB1YmxpYyBnZXQgcmVnaW9ucygpOiBGb2xkaW5nUmVnaW9ucyB7IHJldHVybiB0aGlzLl9yZWdpb25zOyB9XG5cdHB1YmxpYyBnZXQgdGV4dE1vZGVsKCkgeyByZXR1cm4gdGhpcy5fdGV4dE1vZGVsOyB9XG5cdHB1YmxpYyBnZXQgZGVjb3JhdGlvblByb3ZpZGVyKCkgeyByZXR1cm4gdGhpcy5fZGVjb3JhdGlvblByb3ZpZGVyOyB9XG5cblx0Y29uc3RydWN0b3IodGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBkZWNvcmF0aW9uUHJvdmlkZXI6IElEZWNvcmF0aW9uUHJvdmlkZXIpIHtcblx0XHR0aGlzLl90ZXh0TW9kZWwgPSB0ZXh0TW9kZWw7XG5cdFx0dGhpcy5fZGVjb3JhdGlvblByb3ZpZGVyID0gZGVjb3JhdGlvblByb3ZpZGVyO1xuXHRcdHRoaXMuX3JlZ2lvbnMgPSBuZXcgRm9sZGluZ1JlZ2lvbnMobmV3IFVpbnQzMkFycmF5KDApLCBuZXcgVWludDMyQXJyYXkoMCkpO1xuXHRcdHRoaXMuX2VkaXRvckRlY29yYXRpb25JZHMgPSBbXTtcblx0fVxuXG5cdHB1YmxpYyB0b2dnbGVDb2xsYXBzZVN0YXRlKHRvZ2dsZWRSZWdpb25zOiBGb2xkaW5nUmVnaW9uW10pIHtcblx0XHRpZiAoIXRvZ2dsZWRSZWdpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0b2dnbGVkUmVnaW9ucyA9IHRvZ2dsZWRSZWdpb25zLnNvcnQoKHIxLCByMikgPT4gcjEucmVnaW9uSW5kZXggLSByMi5yZWdpb25JbmRleCk7XG5cblx0XHRjb25zdCBwcm9jZXNzZWQ6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB8IHVuZGVmaW5lZCB9ID0ge307XG5cdFx0dGhpcy5fZGVjb3JhdGlvblByb3ZpZGVyLmNoYW5nZURlY29yYXRpb25zKGFjY2Vzc29yID0+IHtcblx0XHRcdGxldCBrID0gMDsgLy8gaW5kZXggZnJvbSBbMCAuLi4gdGhpcy5yZWdpb25zLmxlbmd0aF1cblx0XHRcdGxldCBkaXJ0eVJlZ2lvbkVuZExpbmUgPSAtMTsgLy8gZW5kIG9mIHRoZSByYW5nZSB3aGVyZSBkZWNvcmF0aW9ucyBuZWVkIHRvIGJlIHVwZGF0ZWRcblx0XHRcdGxldCBsYXN0SGlkZGVuTGluZSA9IC0xOyAvLyB0aGUgZW5kIG9mIHRoZSBsYXN0IGhpZGRlbiBsaW5lc1xuXHRcdFx0Y29uc3QgdXBkYXRlRGVjb3JhdGlvbnNVbnRpbCA9IChpbmRleDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdHdoaWxlIChrIDwgaW5kZXgpIHtcblx0XHRcdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gdGhpcy5fcmVnaW9ucy5nZXRFbmRMaW5lTnVtYmVyKGspO1xuXHRcdFx0XHRcdGNvbnN0IGlzQ29sbGFwc2VkID0gdGhpcy5fcmVnaW9ucy5pc0NvbGxhcHNlZChrKTtcblx0XHRcdFx0XHRpZiAoZW5kTGluZU51bWJlciA8PSBkaXJ0eVJlZ2lvbkVuZExpbmUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGlzTWFudWFsID0gdGhpcy5yZWdpb25zLmdldFNvdXJjZShrKSAhPT0gRm9sZFNvdXJjZS5wcm92aWRlcjtcblx0XHRcdFx0XHRcdGFjY2Vzc29yLmNoYW5nZURlY29yYXRpb25PcHRpb25zKHRoaXMuX2VkaXRvckRlY29yYXRpb25JZHNba10sIHRoaXMuX2RlY29yYXRpb25Qcm92aWRlci5nZXREZWNvcmF0aW9uT3B0aW9uKGlzQ29sbGFwc2VkLCBlbmRMaW5lTnVtYmVyIDw9IGxhc3RIaWRkZW5MaW5lLCBpc01hbnVhbCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaXNDb2xsYXBzZWQgJiYgZW5kTGluZU51bWJlciA+IGxhc3RIaWRkZW5MaW5lKSB7XG5cdFx0XHRcdFx0XHRsYXN0SGlkZGVuTGluZSA9IGVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGsrKztcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGZvciAoY29uc3QgcmVnaW9uIG9mIHRvZ2dsZWRSZWdpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gcmVnaW9uLnJlZ2lvbkluZGV4O1xuXHRcdFx0XHRjb25zdCBlZGl0b3JEZWNvcmF0aW9uSWQgPSB0aGlzLl9lZGl0b3JEZWNvcmF0aW9uSWRzW2luZGV4XTtcblx0XHRcdFx0aWYgKGVkaXRvckRlY29yYXRpb25JZCAmJiAhcHJvY2Vzc2VkW2VkaXRvckRlY29yYXRpb25JZF0pIHtcblx0XHRcdFx0XHRwcm9jZXNzZWRbZWRpdG9yRGVjb3JhdGlvbklkXSA9IHRydWU7XG5cblx0XHRcdFx0XHR1cGRhdGVEZWNvcmF0aW9uc1VudGlsKGluZGV4KTsgLy8gdXBkYXRlIGFsbCBkZWNvcmF0aW9ucyB1cCB0byBjdXJyZW50IGluZGV4IHVzaW5nIHRoZSBvbGQgZGlydHlSZWdpb25FbmRMaW5lXG5cblx0XHRcdFx0XHRjb25zdCBuZXdDb2xsYXBzZVN0YXRlID0gIXRoaXMuX3JlZ2lvbnMuaXNDb2xsYXBzZWQoaW5kZXgpO1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lvbnMuc2V0Q29sbGFwc2VkKGluZGV4LCBuZXdDb2xsYXBzZVN0YXRlKTtcblxuXHRcdFx0XHRcdGRpcnR5UmVnaW9uRW5kTGluZSA9IE1hdGgubWF4KGRpcnR5UmVnaW9uRW5kTGluZSwgdGhpcy5fcmVnaW9ucy5nZXRFbmRMaW5lTnVtYmVyKGluZGV4KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHVwZGF0ZURlY29yYXRpb25zVW50aWwodGhpcy5fcmVnaW9ucy5sZW5ndGgpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3VwZGF0ZUV2ZW50RW1pdHRlci5maXJlKHsgbW9kZWw6IHRoaXMsIGNvbGxhcHNlU3RhdGVDaGFuZ2VkOiB0b2dnbGVkUmVnaW9ucyB9KTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVNYW51YWxSYW5nZXMocmFuZ2VzOiByZWFkb25seSBJUmFuZ2VbXSkge1xuXHRcdGNvbnN0IHJhbmdlSW5kZXhlc1RvUmVtb3ZlID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0bGV0IHJlbW92ZUFsbCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgcmFuZ2VzKSB7XG5cdFx0XHRpZiAoUmFuZ2UuaXNFbXB0eShyYW5nZSkpIHtcblx0XHRcdFx0bGV0IGluZGV4ID0gdGhpcy5fcmVnaW9ucy5maW5kUmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0d2hpbGUgKGluZGV4ICE9PSAtMSAmJiB0aGlzLl9yZWdpb25zLmdldFNvdXJjZShpbmRleCkgPT09IEZvbGRTb3VyY2UucHJvdmlkZXIpIHtcblx0XHRcdFx0XHRpbmRleCA9IHRoaXMuX3JlZ2lvbnMuZ2V0UGFyZW50SW5kZXgoaW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRyZW1vdmVBbGwgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJhbmdlSW5kZXhlc1RvUmVtb3ZlLmFkZChpbmRleCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgbmV3Rm9sZGluZ1JhbmdlczogRm9sZFJhbmdlW10gPSBuZXcgQXJyYXkoKTtcblx0XHRjb25zdCBpbnRlcnNlY3RzU2VsZWN0aW9uID0gKGZvbGRSYW5nZTogRm9sZFJhbmdlKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHJhbmdlcykge1xuXHRcdFx0XHRpZiAoIVJhbmdlLmlzRW1wdHkocmFuZ2UpICYmICEocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gZm9sZFJhbmdlLmVuZExpbmVOdW1iZXIgfHwgZm9sZFJhbmdlLnN0YXJ0TGluZU51bWJlciA+IHJhbmdlLmVuZExpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fcmVnaW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZm9sZFJhbmdlID0gdGhpcy5fcmVnaW9ucy50b0ZvbGRSYW5nZShpKTtcblx0XHRcdGlmIChmb2xkUmFuZ2Uuc291cmNlID09PSBGb2xkU291cmNlLnByb3ZpZGVyIHx8ICghcmVtb3ZlQWxsICYmICFyYW5nZUluZGV4ZXNUb1JlbW92ZS5oYXMoaSkgJiYgIWludGVyc2VjdHNTZWxlY3Rpb24oZm9sZFJhbmdlKSkpIHtcblx0XHRcdFx0bmV3Rm9sZGluZ1Jhbmdlcy5wdXNoKGZvbGRSYW5nZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlUG9zdChGb2xkaW5nUmVnaW9ucy5mcm9tRm9sZFJhbmdlcyhuZXdGb2xkaW5nUmFuZ2VzKSk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlKG5ld1JlZ2lvbnM6IEZvbGRpbmdSZWdpb25zLCBzZWxlY3Rpb24/OiBTZWxlY3RlZExpbmVzKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9sZGVkT3JNYW51YWxSYW5nZXMgPSB0aGlzLl9jdXJyZW50Rm9sZGVkT3JNYW51YWxSYW5nZXMoc2VsZWN0aW9uKTtcblx0XHRjb25zdCBuZXdSYW5nZXMgPSBGb2xkaW5nUmVnaW9ucy5zYW5pdGl6ZUFuZE1lcmdlKG5ld1JlZ2lvbnMsIGZvbGRlZE9yTWFudWFsUmFuZ2VzLCB0aGlzLl90ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCksIHNlbGVjdGlvbik7XG5cdFx0dGhpcy51cGRhdGVQb3N0KEZvbGRpbmdSZWdpb25zLmZyb21Gb2xkUmFuZ2VzKG5ld1JhbmdlcykpO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZVBvc3QobmV3UmVnaW9uczogRm9sZGluZ1JlZ2lvbnMpIHtcblx0XHRjb25zdCBuZXdFZGl0b3JEZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRsZXQgbGFzdEhpZGRlbkxpbmUgPSAtMTtcblx0XHRmb3IgKGxldCBpbmRleCA9IDAsIGxpbWl0ID0gbmV3UmVnaW9ucy5sZW5ndGg7IGluZGV4IDwgbGltaXQ7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IG5ld1JlZ2lvbnMuZ2V0U3RhcnRMaW5lTnVtYmVyKGluZGV4KTtcblx0XHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSBuZXdSZWdpb25zLmdldEVuZExpbmVOdW1iZXIoaW5kZXgpO1xuXHRcdFx0Y29uc3QgaXNDb2xsYXBzZWQgPSBuZXdSZWdpb25zLmlzQ29sbGFwc2VkKGluZGV4KTtcblx0XHRcdGNvbnN0IGlzTWFudWFsID0gbmV3UmVnaW9ucy5nZXRTb3VyY2UoaW5kZXgpICE9PSBGb2xkU291cmNlLnByb3ZpZGVyO1xuXHRcdFx0Y29uc3QgZGVjb3JhdGlvblJhbmdlID0ge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0c3RhcnRDb2x1bW46IHRoaXMuX3RleHRNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHN0YXJ0TGluZU51bWJlciksXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IGVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdGVuZENvbHVtbjogdGhpcy5fdGV4dE1vZGVsLmdldExpbmVNYXhDb2x1bW4oZW5kTGluZU51bWJlcikgKyAxXG5cdFx0XHR9O1xuXHRcdFx0bmV3RWRpdG9yRGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlOiBkZWNvcmF0aW9uUmFuZ2UsIG9wdGlvbnM6IHRoaXMuX2RlY29yYXRpb25Qcm92aWRlci5nZXREZWNvcmF0aW9uT3B0aW9uKGlzQ29sbGFwc2VkLCBlbmRMaW5lTnVtYmVyIDw9IGxhc3RIaWRkZW5MaW5lLCBpc01hbnVhbCkgfSk7XG5cdFx0XHRpZiAoaXNDb2xsYXBzZWQgJiYgZW5kTGluZU51bWJlciA+IGxhc3RIaWRkZW5MaW5lKSB7XG5cdFx0XHRcdGxhc3RIaWRkZW5MaW5lID0gZW5kTGluZU51bWJlcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fZGVjb3JhdGlvblByb3ZpZGVyLmNoYW5nZURlY29yYXRpb25zKGFjY2Vzc29yID0+IHRoaXMuX2VkaXRvckRlY29yYXRpb25JZHMgPSBhY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKHRoaXMuX2VkaXRvckRlY29yYXRpb25JZHMsIG5ld0VkaXRvckRlY29yYXRpb25zKSk7XG5cdFx0dGhpcy5fcmVnaW9ucyA9IG5ld1JlZ2lvbnM7XG5cdFx0dGhpcy5fdXBkYXRlRXZlbnRFbWl0dGVyLmZpcmUoeyBtb2RlbDogdGhpcyB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2N1cnJlbnRGb2xkZWRPck1hbnVhbFJhbmdlcyhzZWxlY3Rpb24/OiBTZWxlY3RlZExpbmVzKTogRm9sZFJhbmdlW10ge1xuXHRcdGNvbnN0IGZvbGRlZFJhbmdlczogRm9sZFJhbmdlW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGltaXQgPSB0aGlzLl9yZWdpb25zLmxlbmd0aDsgaSA8IGxpbWl0OyBpKyspIHtcblx0XHRcdGxldCBpc0NvbGxhcHNlZCA9IHRoaXMucmVnaW9ucy5pc0NvbGxhcHNlZChpKTtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IHRoaXMucmVnaW9ucy5nZXRTb3VyY2UoaSk7XG5cdFx0XHRpZiAoaXNDb2xsYXBzZWQgfHwgc291cmNlICE9PSBGb2xkU291cmNlLnByb3ZpZGVyKSB7XG5cdFx0XHRcdGNvbnN0IGZvbGRSYW5nZSA9IHRoaXMuX3JlZ2lvbnMudG9Gb2xkUmFuZ2UoaSk7XG5cdFx0XHRcdGNvbnN0IGRlY1JhbmdlID0gdGhpcy5fdGV4dE1vZGVsLmdldERlY29yYXRpb25SYW5nZSh0aGlzLl9lZGl0b3JEZWNvcmF0aW9uSWRzW2ldKTtcblx0XHRcdFx0aWYgKGRlY1JhbmdlKSB7XG5cdFx0XHRcdFx0aWYgKGlzQ29sbGFwc2VkICYmIHNlbGVjdGlvbj8uc3RhcnRzSW5zaWRlKGRlY1JhbmdlLnN0YXJ0TGluZU51bWJlciArIDEsIGRlY1JhbmdlLmVuZExpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdFx0XHRpc0NvbGxhcHNlZCA9IGZhbHNlOyAvLyB1bmNvbGxhcHNlIGlzIHRoZSByYW5nZSBpcyBibG9ja2VkXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvbGRlZFJhbmdlcy5wdXNoKHtcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogZGVjUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogZGVjUmFuZ2UuZW5kTGluZU51bWJlcixcblx0XHRcdFx0XHRcdHR5cGU6IGZvbGRSYW5nZS50eXBlLFxuXHRcdFx0XHRcdFx0aXNDb2xsYXBzZWQsXG5cdFx0XHRcdFx0XHRzb3VyY2Vcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmb2xkZWRSYW5nZXM7XG5cdH1cblxuXHQvKipcblx0ICogQ29sbGFwc2Ugc3RhdGUgbWVtZW50bywgZm9yIHBlcnNpc3RlbmNlIG9ubHlcblx0ICovXG5cdHB1YmxpYyBnZXRNZW1lbnRvKCk6IENvbGxhcHNlTWVtZW50byB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZm9sZGVkT3JNYW51YWxSYW5nZXMgPSB0aGlzLl9jdXJyZW50Rm9sZGVkT3JNYW51YWxSYW5nZXMoKTtcblx0XHRjb25zdCByZXN1bHQ6IElMaW5lTWVtZW50b1tdID0gW107XG5cdFx0Y29uc3QgbWF4TGluZU51bWJlciA9IHRoaXMuX3RleHRNb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGltaXQgPSBmb2xkZWRPck1hbnVhbFJhbmdlcy5sZW5ndGg7IGkgPCBsaW1pdDsgaSsrKSB7XG5cdFx0XHRjb25zdCByYW5nZSA9IGZvbGRlZE9yTWFudWFsUmFuZ2VzW2ldO1xuXHRcdFx0aWYgKHJhbmdlLnN0YXJ0TGluZU51bWJlciA+PSByYW5nZS5lbmRMaW5lTnVtYmVyIHx8IHJhbmdlLnN0YXJ0TGluZU51bWJlciA8IDEgfHwgcmFuZ2UuZW5kTGluZU51bWJlciA+IG1heExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjaGVja3N1bSA9IHRoaXMuX2dldExpbmVzQ2hlY2tzdW0ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgMSwgcmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiByYW5nZS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRpc0NvbGxhcHNlZDogcmFuZ2UuaXNDb2xsYXBzZWQsXG5cdFx0XHRcdHNvdXJjZTogcmFuZ2Uuc291cmNlLFxuXHRcdFx0XHRjaGVja3N1bTogY2hlY2tzdW1cblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gKHJlc3VsdC5sZW5ndGggPiAwKSA/IHJlc3VsdCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBseSBwZXJzaXN0ZWQgc3RhdGUsIGZvciBwZXJzaXN0ZW5jZSBvbmx5XG5cdCAqL1xuXHRwdWJsaWMgYXBwbHlNZW1lbnRvKHN0YXRlOiBDb2xsYXBzZU1lbWVudG8pIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc3RhdGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJhbmdlc1RvUmVzdG9yZTogRm9sZFJhbmdlW10gPSBbXTtcblx0XHRjb25zdCBtYXhMaW5lTnVtYmVyID0gdGhpcy5fdGV4dE1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGZvciAoY29uc3QgcmFuZ2Ugb2Ygc3RhdGUpIHtcblx0XHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgPj0gcmFuZ2UuZW5kTGluZU51bWJlciB8fCByYW5nZS5zdGFydExpbmVOdW1iZXIgPCAxIHx8IHJhbmdlLmVuZExpbmVOdW1iZXIgPiBtYXhMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2hlY2tzdW0gPSB0aGlzLl9nZXRMaW5lc0NoZWNrc3VtKHJhbmdlLnN0YXJ0TGluZU51bWJlciArIDEsIHJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKCFyYW5nZS5jaGVja3N1bSB8fCBjaGVja3N1bSA9PT0gcmFuZ2UuY2hlY2tzdW0pIHtcblx0XHRcdFx0cmFuZ2VzVG9SZXN0b3JlLnB1c2goe1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHJhbmdlLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0dHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGlzQ29sbGFwc2VkOiByYW5nZS5pc0NvbGxhcHNlZCA/PyB0cnVlLFxuXHRcdFx0XHRcdHNvdXJjZTogcmFuZ2Uuc291cmNlID8/IEZvbGRTb3VyY2UucHJvdmlkZXJcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3UmFuZ2VzID0gRm9sZGluZ1JlZ2lvbnMuc2FuaXRpemVBbmRNZXJnZSh0aGlzLl9yZWdpb25zLCByYW5nZXNUb1Jlc3RvcmUsIG1heExpbmVOdW1iZXIpO1xuXHRcdHRoaXMudXBkYXRlUG9zdChGb2xkaW5nUmVnaW9ucy5mcm9tRm9sZFJhbmdlcyhuZXdSYW5nZXMpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldExpbmVzQ2hlY2tzdW0obGluZU51bWJlcjE6IG51bWJlciwgbGluZU51bWJlcjI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgaCA9IGhhc2godGhpcy5fdGV4dE1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIxKVxuXHRcdFx0KyB0aGlzLl90ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcjIpKTtcblx0XHRyZXR1cm4gaCAlIDEwMDAwMDA7IC8vIDYgZGlnaXRzIGlzIHBsZW50eVxuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fZGVjb3JhdGlvblByb3ZpZGVyLnJlbW92ZURlY29yYXRpb25zKHRoaXMuX2VkaXRvckRlY29yYXRpb25JZHMpO1xuXHRcdHRoaXMuX3VwZGF0ZUV2ZW50RW1pdHRlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXRBbGxSZWdpb25zQXRMaW5lKGxpbmVOdW1iZXI6IG51bWJlciwgZmlsdGVyPzogKHI6IEZvbGRpbmdSZWdpb24sIGxldmVsOiBudW1iZXIpID0+IGJvb2xlYW4pOiBGb2xkaW5nUmVnaW9uW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogRm9sZGluZ1JlZ2lvbltdID0gW107XG5cdFx0aWYgKHRoaXMuX3JlZ2lvbnMpIHtcblx0XHRcdGxldCBpbmRleCA9IHRoaXMuX3JlZ2lvbnMuZmluZFJhbmdlKGxpbmVOdW1iZXIpO1xuXHRcdFx0bGV0IGxldmVsID0gMTtcblx0XHRcdHdoaWxlIChpbmRleCA+PSAwKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9yZWdpb25zLnRvUmVnaW9uKGluZGV4KTtcblx0XHRcdFx0aWYgKCFmaWx0ZXIgfHwgZmlsdGVyKGN1cnJlbnQsIGxldmVsKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGN1cnJlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldmVsKys7XG5cdFx0XHRcdGluZGV4ID0gY3VycmVudC5wYXJlbnRJbmRleDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGdldFJlZ2lvbkF0TGluZShsaW5lTnVtYmVyOiBudW1iZXIpOiBGb2xkaW5nUmVnaW9uIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX3JlZ2lvbnMpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fcmVnaW9ucy5maW5kUmFuZ2UobGluZU51bWJlcik7XG5cdFx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVnaW9ucy50b1JlZ2lvbihpbmRleCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Z2V0UmVnaW9uc0luc2lkZShyZWdpb246IEZvbGRpbmdSZWdpb24gfCBudWxsLCBmaWx0ZXI/OiBSZWdpb25GaWx0ZXIgfCBSZWdpb25GaWx0ZXJXaXRoTGV2ZWwpOiBGb2xkaW5nUmVnaW9uW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogRm9sZGluZ1JlZ2lvbltdID0gW107XG5cdFx0Y29uc3QgaW5kZXggPSByZWdpb24gPyByZWdpb24ucmVnaW9uSW5kZXggKyAxIDogMDtcblx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gcmVnaW9uID8gcmVnaW9uLmVuZExpbmVOdW1iZXIgOiBOdW1iZXIuTUFYX1ZBTFVFO1xuXG5cdFx0aWYgKGZpbHRlciAmJiBmaWx0ZXIubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRjb25zdCBsZXZlbFN0YWNrOiBGb2xkaW5nUmVnaW9uW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSBpbmRleCwgbGVuID0gdGhpcy5fcmVnaW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fcmVnaW9ucy50b1JlZ2lvbihpKTtcblx0XHRcdFx0aWYgKHRoaXMuX3JlZ2lvbnMuZ2V0U3RhcnRMaW5lTnVtYmVyKGkpIDwgZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdHdoaWxlIChsZXZlbFN0YWNrLmxlbmd0aCA+IDAgJiYgIWN1cnJlbnQuY29udGFpbmVkQnkobGV2ZWxTdGFja1tsZXZlbFN0YWNrLmxlbmd0aCAtIDFdKSkge1xuXHRcdFx0XHRcdFx0bGV2ZWxTdGFjay5wb3AoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGV2ZWxTdGFjay5wdXNoKGN1cnJlbnQpO1xuXHRcdFx0XHRcdGlmIChmaWx0ZXIoY3VycmVudCwgbGV2ZWxTdGFjay5sZW5ndGgpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChjdXJyZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChsZXQgaSA9IGluZGV4LCBsZW4gPSB0aGlzLl9yZWdpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9yZWdpb25zLnRvUmVnaW9uKGkpO1xuXHRcdFx0XHRpZiAodGhpcy5fcmVnaW9ucy5nZXRTdGFydExpbmVOdW1iZXIoaSkgPCBlbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0aWYgKCFmaWx0ZXIgfHwgKGZpbHRlciBhcyBSZWdpb25GaWx0ZXIpKGN1cnJlbnQpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChjdXJyZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG59XG5cbnR5cGUgUmVnaW9uRmlsdGVyID0gKHI6IEZvbGRpbmdSZWdpb24pID0+IGJvb2xlYW47XG50eXBlIFJlZ2lvbkZpbHRlcldpdGhMZXZlbCA9IChyOiBGb2xkaW5nUmVnaW9uLCBsZXZlbDogbnVtYmVyKSA9PiBib29sZWFuO1xuXG5cbi8qKlxuICogQ29sbGFwc2Ugb3IgZXhwYW5kIHRoZSByZWdpb25zIGF0IHRoZSBnaXZlbiBsb2NhdGlvbnNcbiAqIEBwYXJhbSBsZXZlbHMgVGhlIG51bWJlciBvZiBsZXZlbHMuIFVzZSAxIHRvIG9ubHkgaW1wYWN0IHRoZSByZWdpb25zIGF0IHRoZSBsb2NhdGlvbiwgdXNlIE51bWJlci5NQVhfVkFMVUUgZm9yIGFsbCBsZXZlbHMuXG4gKiBAcGFyYW0gbGluZU51bWJlcnMgdGhlIGxvY2F0aW9uIG9mIHRoZSByZWdpb25zIHRvIGNvbGxhcHNlIG9yIGV4cGFuZCwgb3IgaWYgbm90IHNldCwgYWxsIHJlZ2lvbnMgaW4gdGhlIG1vZGVsLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9nZ2xlQ29sbGFwc2VTdGF0ZShmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgbGV2ZWxzOiBudW1iZXIsIGxpbmVOdW1iZXJzOiBudW1iZXJbXSkge1xuXHRjb25zdCB0b1RvZ2dsZTogRm9sZGluZ1JlZ2lvbltdID0gW107XG5cdGZvciAoY29uc3QgbGluZU51bWJlciBvZiBsaW5lTnVtYmVycykge1xuXHRcdGNvbnN0IHJlZ2lvbiA9IGZvbGRpbmdNb2RlbC5nZXRSZWdpb25BdExpbmUobGluZU51bWJlcik7XG5cdFx0aWYgKHJlZ2lvbikge1xuXHRcdFx0Y29uc3QgZG9Db2xsYXBzZSA9ICFyZWdpb24uaXNDb2xsYXBzZWQ7XG5cdFx0XHR0b1RvZ2dsZS5wdXNoKHJlZ2lvbik7XG5cdFx0XHRpZiAobGV2ZWxzID4gMSkge1xuXHRcdFx0XHRjb25zdCByZWdpb25zSW5zaWRlID0gZm9sZGluZ01vZGVsLmdldFJlZ2lvbnNJbnNpZGUocmVnaW9uLCAociwgbGV2ZWw6IG51bWJlcikgPT4gci5pc0NvbGxhcHNlZCAhPT0gZG9Db2xsYXBzZSAmJiBsZXZlbCA8IGxldmVscyk7XG5cdFx0XHRcdHRvVG9nZ2xlLnB1c2goLi4ucmVnaW9uc0luc2lkZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGZvbGRpbmdNb2RlbC50b2dnbGVDb2xsYXBzZVN0YXRlKHRvVG9nZ2xlKTtcbn1cblxuXG4vKipcbiAqIENvbGxhcHNlIG9yIGV4cGFuZCB0aGUgcmVnaW9ucyBhdCB0aGUgZ2l2ZW4gbG9jYXRpb25zIGluY2x1ZGluZyBhbGwgY2hpbGRyZW4uXG4gKiBAcGFyYW0gZG9Db2xsYXBzZSBXaGV0aGVyIHRvIGNvbGxhcHNlIG9yIGV4cGFuZFxuICogQHBhcmFtIGxldmVscyBUaGUgbnVtYmVyIG9mIGxldmVscy4gVXNlIDEgdG8gb25seSBpbXBhY3QgdGhlIHJlZ2lvbnMgYXQgdGhlIGxvY2F0aW9uLCB1c2UgTnVtYmVyLk1BWF9WQUxVRSBmb3IgYWxsIGxldmVscy5cbiAqIEBwYXJhbSBsaW5lTnVtYmVycyB0aGUgbG9jYXRpb24gb2YgdGhlIHJlZ2lvbnMgdG8gY29sbGFwc2Ugb3IgZXhwYW5kLCBvciBpZiBub3Qgc2V0LCBhbGwgcmVnaW9ucyBpbiB0aGUgbW9kZWwuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzRG93bihmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZG9Db2xsYXBzZTogYm9vbGVhbiwgbGV2ZWxzID0gTnVtYmVyLk1BWF9WQUxVRSwgbGluZU51bWJlcnM/OiBudW1iZXJbXSk6IHZvaWQge1xuXHRjb25zdCB0b1RvZ2dsZTogRm9sZGluZ1JlZ2lvbltdID0gW107XG5cdGlmIChsaW5lTnVtYmVycyAmJiBsaW5lTnVtYmVycy5sZW5ndGggPiAwKSB7XG5cdFx0Zm9yIChjb25zdCBsaW5lTnVtYmVyIG9mIGxpbmVOdW1iZXJzKSB7XG5cdFx0XHRjb25zdCByZWdpb24gPSBmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uQXRMaW5lKGxpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKHJlZ2lvbikge1xuXHRcdFx0XHRpZiAocmVnaW9uLmlzQ29sbGFwc2VkICE9PSBkb0NvbGxhcHNlKSB7XG5cdFx0XHRcdFx0dG9Ub2dnbGUucHVzaChyZWdpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsZXZlbHMgPiAxKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVnaW9uc0luc2lkZSA9IGZvbGRpbmdNb2RlbC5nZXRSZWdpb25zSW5zaWRlKHJlZ2lvbiwgKHIsIGxldmVsOiBudW1iZXIpID0+IHIuaXNDb2xsYXBzZWQgIT09IGRvQ29sbGFwc2UgJiYgbGV2ZWwgPCBsZXZlbHMpO1xuXHRcdFx0XHRcdHRvVG9nZ2xlLnB1c2goLi4ucmVnaW9uc0luc2lkZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgcmVnaW9uc0luc2lkZSA9IGZvbGRpbmdNb2RlbC5nZXRSZWdpb25zSW5zaWRlKG51bGwsIChyLCBsZXZlbDogbnVtYmVyKSA9PiByLmlzQ29sbGFwc2VkICE9PSBkb0NvbGxhcHNlICYmIGxldmVsIDwgbGV2ZWxzKTtcblx0XHR0b1RvZ2dsZS5wdXNoKC4uLnJlZ2lvbnNJbnNpZGUpO1xuXHR9XG5cdGZvbGRpbmdNb2RlbC50b2dnbGVDb2xsYXBzZVN0YXRlKHRvVG9nZ2xlKTtcbn1cblxuLyoqXG4gKiBDb2xsYXBzZSBvciBleHBhbmQgdGhlIHJlZ2lvbnMgYXQgdGhlIGdpdmVuIGxvY2F0aW9ucyBpbmNsdWRpbmcgYWxsIHBhcmVudHMuXG4gKiBAcGFyYW0gZG9Db2xsYXBzZSBXaGV0aGVyIHRvIGNvbGxhcHNlIG9yIGV4cGFuZFxuICogQHBhcmFtIGxldmVscyBUaGUgbnVtYmVyIG9mIGxldmVscy4gVXNlIDEgdG8gb25seSBpbXBhY3QgdGhlIHJlZ2lvbnMgYXQgdGhlIGxvY2F0aW9uLCB1c2UgTnVtYmVyLk1BWF9WQUxVRSBmb3IgYWxsIGxldmVscy5cbiAqIEBwYXJhbSBsaW5lTnVtYmVycyB0aGUgbG9jYXRpb24gb2YgdGhlIHJlZ2lvbnMgdG8gY29sbGFwc2Ugb3IgZXhwYW5kLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0Q29sbGFwc2VTdGF0ZUxldmVsc1VwKGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBkb0NvbGxhcHNlOiBib29sZWFuLCBsZXZlbHM6IG51bWJlciwgbGluZU51bWJlcnM6IG51bWJlcltdKTogdm9pZCB7XG5cdGNvbnN0IHRvVG9nZ2xlOiBGb2xkaW5nUmVnaW9uW10gPSBbXTtcblx0Zm9yIChjb25zdCBsaW5lTnVtYmVyIG9mIGxpbmVOdW1iZXJzKSB7XG5cdFx0Y29uc3QgcmVnaW9ucyA9IGZvbGRpbmdNb2RlbC5nZXRBbGxSZWdpb25zQXRMaW5lKGxpbmVOdW1iZXIsIChyZWdpb24sIGxldmVsKSA9PiByZWdpb24uaXNDb2xsYXBzZWQgIT09IGRvQ29sbGFwc2UgJiYgbGV2ZWwgPD0gbGV2ZWxzKTtcblx0XHR0b1RvZ2dsZS5wdXNoKC4uLnJlZ2lvbnMpO1xuXHR9XG5cdGZvbGRpbmdNb2RlbC50b2dnbGVDb2xsYXBzZVN0YXRlKHRvVG9nZ2xlKTtcbn1cblxuLyoqXG4gKiBDb2xsYXBzZSBvciBleHBhbmQgYSByZWdpb24gYXQgdGhlIGdpdmVuIGxvY2F0aW9ucy4gSWYgdGhlIGlubmVyIG1vc3QgcmVnaW9uIGlzIGFscmVhZHkgY29sbGFwc2VkL2V4cGFuZGVkLCB1c2VzIHRoZSBmaXJzdCBwYXJlbnQgaW5zdGVhZC5cbiAqIEBwYXJhbSBkb0NvbGxhcHNlIFdoZXRoZXIgdG8gY29sbGFwc2Ugb3IgZXhwYW5kXG4gKiBAcGFyYW0gbGluZU51bWJlcnMgdGhlIGxvY2F0aW9uIG9mIHRoZSByZWdpb25zIHRvIGNvbGxhcHNlIG9yIGV4cGFuZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldENvbGxhcHNlU3RhdGVVcChmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZG9Db2xsYXBzZTogYm9vbGVhbiwgbGluZU51bWJlcnM6IG51bWJlcltdKTogdm9pZCB7XG5cdGNvbnN0IHRvVG9nZ2xlOiBGb2xkaW5nUmVnaW9uW10gPSBbXTtcblx0Zm9yIChjb25zdCBsaW5lTnVtYmVyIG9mIGxpbmVOdW1iZXJzKSB7XG5cdFx0Y29uc3QgcmVnaW9ucyA9IGZvbGRpbmdNb2RlbC5nZXRBbGxSZWdpb25zQXRMaW5lKGxpbmVOdW1iZXIsIChyZWdpb24sKSA9PiByZWdpb24uaXNDb2xsYXBzZWQgIT09IGRvQ29sbGFwc2UpO1xuXHRcdGlmIChyZWdpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRvVG9nZ2xlLnB1c2gocmVnaW9uc1swXSk7XG5cdFx0fVxuXHR9XG5cdGZvbGRpbmdNb2RlbC50b2dnbGVDb2xsYXBzZVN0YXRlKHRvVG9nZ2xlKTtcbn1cblxuLyoqXG4gKiBGb2xkcyBvciB1bmZvbGRzIGFsbCByZWdpb25zIHRoYXQgaGF2ZSBhIGdpdmVuIGxldmVsLCBleGNlcHQgaWYgdGhleSBjb250YWluIG9uZSBvZiB0aGUgYmxvY2tlZCBsaW5lcy5cbiAqIEBwYXJhbSBmb2xkTGV2ZWwgbGV2ZWwuIExldmVsID09IDEgaXMgdGhlIHRvcCBsZXZlbFxuICogQHBhcmFtIGRvQ29sbGFwc2UgV2hldGhlciB0byBjb2xsYXBzZSBvciBleHBhbmRcbiovXG5leHBvcnQgZnVuY3Rpb24gc2V0Q29sbGFwc2VTdGF0ZUF0TGV2ZWwoZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIGZvbGRMZXZlbDogbnVtYmVyLCBkb0NvbGxhcHNlOiBib29sZWFuLCBibG9ja2VkTGluZU51bWJlcnM6IG51bWJlcltdKTogdm9pZCB7XG5cdGNvbnN0IGZpbHRlciA9IChyZWdpb246IEZvbGRpbmdSZWdpb24sIGxldmVsOiBudW1iZXIpID0+IGxldmVsID09PSBmb2xkTGV2ZWwgJiYgcmVnaW9uLmlzQ29sbGFwc2VkICE9PSBkb0NvbGxhcHNlICYmICFibG9ja2VkTGluZU51bWJlcnMuc29tZShsaW5lID0+IHJlZ2lvbi5jb250YWluc0xpbmUobGluZSkpO1xuXHRjb25zdCB0b1RvZ2dsZSA9IGZvbGRpbmdNb2RlbC5nZXRSZWdpb25zSW5zaWRlKG51bGwsIGZpbHRlcik7XG5cdGZvbGRpbmdNb2RlbC50b2dnbGVDb2xsYXBzZVN0YXRlKHRvVG9nZ2xlKTtcbn1cblxuLyoqXG4gKiBGb2xkcyBvciB1bmZvbGRzIGFsbCByZWdpb25zLCBleGNlcHQgaWYgdGhleSBjb250YWluIG9yIGFyZSBjb250YWluZWQgYnkgYSByZWdpb24gb2Ygb25lIG9mIHRoZSBibG9ja2VkIGxpbmVzLlxuICogQHBhcmFtIGRvQ29sbGFwc2UgV2hldGhlciB0byBjb2xsYXBzZSBvciBleHBhbmRcbiAqIEBwYXJhbSBibG9ja2VkTGluZU51bWJlcnMgdGhlIGxvY2F0aW9uIG9mIHJlZ2lvbnMgdG8gbm90IGNvbGxhcHNlIG9yIGV4cGFuZFxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0Q29sbGFwc2VTdGF0ZUZvclJlc3QoZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIGRvQ29sbGFwc2U6IGJvb2xlYW4sIGJsb2NrZWRMaW5lTnVtYmVyczogbnVtYmVyW10pOiB2b2lkIHtcblx0Y29uc3QgZmlsdGVyZWRSZWdpb25zOiBGb2xkaW5nUmVnaW9uW10gPSBbXTtcblx0Zm9yIChjb25zdCBsaW5lTnVtYmVyIG9mIGJsb2NrZWRMaW5lTnVtYmVycykge1xuXHRcdGNvbnN0IHJlZ2lvbnMgPSBmb2xkaW5nTW9kZWwuZ2V0QWxsUmVnaW9uc0F0TGluZShsaW5lTnVtYmVyLCB1bmRlZmluZWQpO1xuXHRcdGlmIChyZWdpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGZpbHRlcmVkUmVnaW9ucy5wdXNoKHJlZ2lvbnNbMF0pO1xuXHRcdH1cblx0fVxuXHRjb25zdCBmaWx0ZXIgPSAocmVnaW9uOiBGb2xkaW5nUmVnaW9uKSA9PiBmaWx0ZXJlZFJlZ2lvbnMuZXZlcnkoKGZpbHRlcmVkUmVnaW9uKSA9PiAhZmlsdGVyZWRSZWdpb24uY29udGFpbmVkQnkocmVnaW9uKSAmJiAhcmVnaW9uLmNvbnRhaW5lZEJ5KGZpbHRlcmVkUmVnaW9uKSkgJiYgcmVnaW9uLmlzQ29sbGFwc2VkICE9PSBkb0NvbGxhcHNlO1xuXHRjb25zdCB0b1RvZ2dsZSA9IGZvbGRpbmdNb2RlbC5nZXRSZWdpb25zSW5zaWRlKG51bGwsIGZpbHRlcik7XG5cdGZvbGRpbmdNb2RlbC50b2dnbGVDb2xsYXBzZVN0YXRlKHRvVG9nZ2xlKTtcbn1cblxuLyoqXG4gKiBGb2xkcyBhbGwgcmVnaW9ucyBmb3Igd2hpY2ggdGhlIGxpbmVzIHN0YXJ0IHdpdGggYSBnaXZlbiByZWdleFxuICogQHBhcmFtIGZvbGRpbmdNb2RlbCB0aGUgZm9sZGluZyBtb2RlbFxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0Q29sbGFwc2VTdGF0ZUZvck1hdGNoaW5nTGluZXMoZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIHJlZ0V4cDogUmVnRXhwLCBkb0NvbGxhcHNlOiBib29sZWFuKTogdm9pZCB7XG5cdGNvbnN0IGVkaXRvck1vZGVsID0gZm9sZGluZ01vZGVsLnRleHRNb2RlbDtcblx0Y29uc3QgcmVnaW9ucyA9IGZvbGRpbmdNb2RlbC5yZWdpb25zO1xuXHRjb25zdCB0b1RvZ2dsZTogRm9sZGluZ1JlZ2lvbltdID0gW107XG5cdGZvciAobGV0IGkgPSByZWdpb25zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0aWYgKGRvQ29sbGFwc2UgIT09IHJlZ2lvbnMuaXNDb2xsYXBzZWQoaSkpIHtcblx0XHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHJlZ2lvbnMuZ2V0U3RhcnRMaW5lTnVtYmVyKGkpO1xuXHRcdFx0aWYgKHJlZ0V4cC50ZXN0KGVkaXRvck1vZGVsLmdldExpbmVDb250ZW50KHN0YXJ0TGluZU51bWJlcikpKSB7XG5cdFx0XHRcdHRvVG9nZ2xlLnB1c2gocmVnaW9ucy50b1JlZ2lvbihpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGZvbGRpbmdNb2RlbC50b2dnbGVDb2xsYXBzZVN0YXRlKHRvVG9nZ2xlKTtcbn1cblxuLyoqXG4gKiBGb2xkcyBhbGwgcmVnaW9ucyBvZiB0aGUgZ2l2ZW4gdHlwZVxuICogQHBhcmFtIGZvbGRpbmdNb2RlbCB0aGUgZm9sZGluZyBtb2RlbFxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0Q29sbGFwc2VTdGF0ZUZvclR5cGUoZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIHR5cGU6IHN0cmluZywgZG9Db2xsYXBzZTogYm9vbGVhbik6IHZvaWQge1xuXHRjb25zdCByZWdpb25zID0gZm9sZGluZ01vZGVsLnJlZ2lvbnM7XG5cdGNvbnN0IHRvVG9nZ2xlOiBGb2xkaW5nUmVnaW9uW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IHJlZ2lvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRpZiAoZG9Db2xsYXBzZSAhPT0gcmVnaW9ucy5pc0NvbGxhcHNlZChpKSAmJiB0eXBlID09PSByZWdpb25zLmdldFR5cGUoaSkpIHtcblx0XHRcdHRvVG9nZ2xlLnB1c2gocmVnaW9ucy50b1JlZ2lvbihpKSk7XG5cdFx0fVxuXHR9XG5cdGZvbGRpbmdNb2RlbC50b2dnbGVDb2xsYXBzZVN0YXRlKHRvVG9nZ2xlKTtcbn1cblxuLyoqXG4gKiBHZXQgbGluZSB0byBnbyB0byBmb3IgcGFyZW50IGZvbGQgb2YgY3VycmVudCBsaW5lXG4gKiBAcGFyYW0gbGluZU51bWJlciB0aGUgY3VycmVudCBsaW5lIG51bWJlclxuICogQHBhcmFtIGZvbGRpbmdNb2RlbCB0aGUgZm9sZGluZyBtb2RlbFxuICpcbiAqIEByZXR1cm4gUGFyZW50IGZvbGQgc3RhcnQgbGluZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0UGFyZW50Rm9sZExpbmUobGluZU51bWJlcjogbnVtYmVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCk6IG51bWJlciB8IG51bGwge1xuXHRsZXQgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblx0Y29uc3QgZm9sZGluZ1JlZ2lvbiA9IGZvbGRpbmdNb2RlbC5nZXRSZWdpb25BdExpbmUobGluZU51bWJlcik7XG5cdGlmIChmb2xkaW5nUmVnaW9uICE9PSBudWxsKSB7XG5cdFx0c3RhcnRMaW5lTnVtYmVyID0gZm9sZGluZ1JlZ2lvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0Ly8gSWYgY3VycmVudCBsaW5lIGlzIG5vdCB0aGUgc3RhcnQgb2YgdGhlIGN1cnJlbnQgZm9sZCwgZ28gdG8gdG9wIGxpbmUgb2YgY3VycmVudCBmb2xkLiBJZiBub3QsIGdvIHRvIHBhcmVudCBmb2xkXG5cdFx0aWYgKGxpbmVOdW1iZXIgPT09IHN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0Y29uc3QgcGFyZW50Rm9sZGluZ0lkeCA9IGZvbGRpbmdSZWdpb24ucGFyZW50SW5kZXg7XG5cdFx0XHRpZiAocGFyZW50Rm9sZGluZ0lkeCAhPT0gLTEpIHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gZm9sZGluZ01vZGVsLnJlZ2lvbnMuZ2V0U3RhcnRMaW5lTnVtYmVyKHBhcmVudEZvbGRpbmdJZHgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHN0YXJ0TGluZU51bWJlcjtcbn1cblxuLyoqXG4gKiBHZXQgbGluZSB0byBnbyB0byBmb3IgcHJldmlvdXMgZm9sZCBhdCB0aGUgc2FtZSBsZXZlbCBvZiBjdXJyZW50IGxpbmVcbiAqIEBwYXJhbSBsaW5lTnVtYmVyIHRoZSBjdXJyZW50IGxpbmUgbnVtYmVyXG4gKiBAcGFyYW0gZm9sZGluZ01vZGVsIHRoZSBmb2xkaW5nIG1vZGVsXG4gKlxuICogQHJldHVybiBQcmV2aW91cyBmb2xkIHN0YXJ0IGxpbmVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFByZXZpb3VzRm9sZExpbmUobGluZU51bWJlcjogbnVtYmVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCk6IG51bWJlciB8IG51bGwge1xuXHRsZXQgZm9sZGluZ1JlZ2lvbiA9IGZvbGRpbmdNb2RlbC5nZXRSZWdpb25BdExpbmUobGluZU51bWJlcik7XG5cdC8vIElmIG9uIHRoZSBmb2xkaW5nIHJhbmdlIHN0YXJ0IGxpbmUsIGdvIHRvIHByZXZpb3VzIHNpYmxpbmcuXG5cdGlmIChmb2xkaW5nUmVnaW9uICE9PSBudWxsICYmIGZvbGRpbmdSZWdpb24uc3RhcnRMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyKSB7XG5cdFx0Ly8gSWYgY3VycmVudCBsaW5lIGlzIG5vdCB0aGUgc3RhcnQgb2YgdGhlIGN1cnJlbnQgZm9sZCwgZ28gdG8gdG9wIGxpbmUgb2YgY3VycmVudCBmb2xkLiBJZiBub3QsIGdvIHRvIHByZXZpb3VzIGZvbGQuXG5cdFx0aWYgKGxpbmVOdW1iZXIgIT09IGZvbGRpbmdSZWdpb24uc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gZm9sZGluZ1JlZ2lvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEZpbmQgbWluIGxpbmUgbnVtYmVyIHRvIHN0YXkgd2l0aGluIHBhcmVudC5cblx0XHRcdGNvbnN0IGV4cGVjdGVkUGFyZW50SW5kZXggPSBmb2xkaW5nUmVnaW9uLnBhcmVudEluZGV4O1xuXHRcdFx0bGV0IG1pbkxpbmVOdW1iZXIgPSAwO1xuXHRcdFx0aWYgKGV4cGVjdGVkUGFyZW50SW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdG1pbkxpbmVOdW1iZXIgPSBmb2xkaW5nTW9kZWwucmVnaW9ucy5nZXRTdGFydExpbmVOdW1iZXIoZm9sZGluZ1JlZ2lvbi5wYXJlbnRJbmRleCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpbmQgZm9sZCBhdCBzYW1lIGxldmVsLlxuXHRcdFx0d2hpbGUgKGZvbGRpbmdSZWdpb24gIT09IG51bGwpIHtcblx0XHRcdFx0aWYgKGZvbGRpbmdSZWdpb24ucmVnaW9uSW5kZXggPiAwKSB7XG5cdFx0XHRcdFx0Zm9sZGluZ1JlZ2lvbiA9IGZvbGRpbmdNb2RlbC5yZWdpb25zLnRvUmVnaW9uKGZvbGRpbmdSZWdpb24ucmVnaW9uSW5kZXggLSAxKTtcblxuXHRcdFx0XHRcdC8vIEtlZXAgYXQgc2FtZSBsZXZlbC5cblx0XHRcdFx0XHRpZiAoZm9sZGluZ1JlZ2lvbi5zdGFydExpbmVOdW1iZXIgPD0gbWluTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChmb2xkaW5nUmVnaW9uLnBhcmVudEluZGV4ID09PSBleHBlY3RlZFBhcmVudEluZGV4KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZm9sZGluZ1JlZ2lvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdC8vIEdvIHRvIGxhc3QgZm9sZCB0aGF0J3MgYmVmb3JlIHRoZSBjdXJyZW50IGxpbmUuXG5cdFx0aWYgKGZvbGRpbmdNb2RlbC5yZWdpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvbGRpbmdSZWdpb24gPSBmb2xkaW5nTW9kZWwucmVnaW9ucy50b1JlZ2lvbihmb2xkaW5nTW9kZWwucmVnaW9ucy5sZW5ndGggLSAxKTtcblx0XHRcdHdoaWxlIChmb2xkaW5nUmVnaW9uICE9PSBudWxsKSB7XG5cdFx0XHRcdC8vIEZvdW5kIGZvbGQgYmVmb3JlIGN1cnJlbnQgbGluZS5cblx0XHRcdFx0aWYgKGZvbGRpbmdSZWdpb24uc3RhcnRMaW5lTnVtYmVyIDwgbGluZU51bWJlcikge1xuXHRcdFx0XHRcdHJldHVybiBmb2xkaW5nUmVnaW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZm9sZGluZ1JlZ2lvbi5yZWdpb25JbmRleCA+IDApIHtcblx0XHRcdFx0XHRmb2xkaW5nUmVnaW9uID0gZm9sZGluZ01vZGVsLnJlZ2lvbnMudG9SZWdpb24oZm9sZGluZ1JlZ2lvbi5yZWdpb25JbmRleCAtIDEpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGZvbGRpbmdSZWdpb24gPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBudWxsO1xufVxuXG4vKipcbiAqIEdldCBsaW5lIHRvIGdvIHRvIG5leHQgZm9sZCBhdCB0aGUgc2FtZSBsZXZlbCBvZiBjdXJyZW50IGxpbmVcbiAqIEBwYXJhbSBsaW5lTnVtYmVyIHRoZSBjdXJyZW50IGxpbmUgbnVtYmVyXG4gKiBAcGFyYW0gZm9sZGluZ01vZGVsIHRoZSBmb2xkaW5nIG1vZGVsXG4gKlxuICogQHJldHVybiBOZXh0IGZvbGQgc3RhcnQgbGluZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TmV4dEZvbGRMaW5lKGxpbmVOdW1iZXI6IG51bWJlciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwpOiBudW1iZXIgfCBudWxsIHtcblx0bGV0IGZvbGRpbmdSZWdpb24gPSBmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uQXRMaW5lKGxpbmVOdW1iZXIpO1xuXHQvLyBJZiBvbiB0aGUgZm9sZGluZyByYW5nZSBzdGFydCBsaW5lLCBnbyB0byBuZXh0IHNpYmxpbmcuXG5cdGlmIChmb2xkaW5nUmVnaW9uICE9PSBudWxsICYmIGZvbGRpbmdSZWdpb24uc3RhcnRMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyKSB7XG5cdFx0Ly8gRmluZCBtYXggbGluZSBudW1iZXIgdG8gc3RheSB3aXRoaW4gcGFyZW50LlxuXHRcdGNvbnN0IGV4cGVjdGVkUGFyZW50SW5kZXggPSBmb2xkaW5nUmVnaW9uLnBhcmVudEluZGV4O1xuXHRcdGxldCBtYXhMaW5lTnVtYmVyID0gMDtcblx0XHRpZiAoZXhwZWN0ZWRQYXJlbnRJbmRleCAhPT0gLTEpIHtcblx0XHRcdG1heExpbmVOdW1iZXIgPSBmb2xkaW5nTW9kZWwucmVnaW9ucy5nZXRFbmRMaW5lTnVtYmVyKGZvbGRpbmdSZWdpb24ucGFyZW50SW5kZXgpO1xuXHRcdH0gZWxzZSBpZiAoZm9sZGluZ01vZGVsLnJlZ2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWF4TGluZU51bWJlciA9IGZvbGRpbmdNb2RlbC5yZWdpb25zLmdldEVuZExpbmVOdW1iZXIoZm9sZGluZ01vZGVsLnJlZ2lvbnMubGVuZ3RoIC0gMSk7XG5cdFx0fVxuXG5cdFx0Ly8gRmluZCBmb2xkIGF0IHNhbWUgbGV2ZWwuXG5cdFx0d2hpbGUgKGZvbGRpbmdSZWdpb24gIT09IG51bGwpIHtcblx0XHRcdGlmIChmb2xkaW5nUmVnaW9uLnJlZ2lvbkluZGV4IDwgZm9sZGluZ01vZGVsLnJlZ2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGZvbGRpbmdSZWdpb24gPSBmb2xkaW5nTW9kZWwucmVnaW9ucy50b1JlZ2lvbihmb2xkaW5nUmVnaW9uLnJlZ2lvbkluZGV4ICsgMSk7XG5cblx0XHRcdFx0Ly8gS2VlcCBhdCBzYW1lIGxldmVsLlxuXHRcdFx0XHRpZiAoZm9sZGluZ1JlZ2lvbi5zdGFydExpbmVOdW1iZXIgPj0gbWF4TGluZU51bWJlcikge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGZvbGRpbmdSZWdpb24ucGFyZW50SW5kZXggPT09IGV4cGVjdGVkUGFyZW50SW5kZXgpIHtcblx0XHRcdFx0XHRyZXR1cm4gZm9sZGluZ1JlZ2lvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIHtcblx0XHQvLyBHbyB0byBmaXJzdCBmb2xkIHRoYXQncyBhZnRlciB0aGUgY3VycmVudCBsaW5lLlxuXHRcdGlmIChmb2xkaW5nTW9kZWwucmVnaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmb2xkaW5nUmVnaW9uID0gZm9sZGluZ01vZGVsLnJlZ2lvbnMudG9SZWdpb24oMCk7XG5cdFx0XHR3aGlsZSAoZm9sZGluZ1JlZ2lvbiAhPT0gbnVsbCkge1xuXHRcdFx0XHQvLyBGb3VuZCBmb2xkIGFmdGVyIGN1cnJlbnQgbGluZS5cblx0XHRcdFx0aWYgKGZvbGRpbmdSZWdpb24uc3RhcnRMaW5lTnVtYmVyID4gbGluZU51bWJlcikge1xuXHRcdFx0XHRcdHJldHVybiBmb2xkaW5nUmVnaW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZm9sZGluZ1JlZ2lvbi5yZWdpb25JbmRleCA8IGZvbGRpbmdNb2RlbC5yZWdpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdGZvbGRpbmdSZWdpb24gPSBmb2xkaW5nTW9kZWwucmVnaW9ucy50b1JlZ2lvbihmb2xkaW5nUmVnaW9uLnJlZ2lvbkluZGV4ICsgMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Zm9sZGluZ1JlZ2lvbiA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQXNCO0FBRS9CLFNBQXdCLGdCQUF1QyxrQkFBa0I7QUFDakYsU0FBUyxZQUFZO0FBR3JCLFNBQWlCLGFBQWE7QUFxQnZCLE1BQU0sYUFBb0M7QUFBQSxFQWNoRCxZQUFZLFdBQXVCLG9CQUF5QztBQVA1RSxTQUFpQixzQkFBc0IsSUFBSSxRQUFpQztBQUM1RSxTQUFnQixjQUE4QyxLQUFLLG9CQUFvQjtBQU90RixTQUFLLGFBQWE7QUFDbEIsU0FBSyxzQkFBc0I7QUFDM0IsU0FBSyxXQUFXLElBQUksZUFBZSxJQUFJLFlBQVksQ0FBQyxHQUFHLElBQUksWUFBWSxDQUFDLENBQUM7QUFDekUsU0FBSyx1QkFBdUIsQ0FBQztBQUFBLEVBQzlCO0FBQUEsRUFUQSxJQUFXLFVBQTBCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBVTtBQUFBLEVBQzdELElBQVcsWUFBWTtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQVk7QUFBQSxFQUNqRCxJQUFXLHFCQUFxQjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQXFCO0FBQUEsRUFTNUQsb0JBQW9CLGdCQUFpQztBQUMzRCxRQUFJLENBQUMsZUFBZSxRQUFRO0FBQzNCO0FBQUEsSUFDRDtBQUNBLHFCQUFpQixlQUFlLEtBQUssQ0FBQyxJQUFJLE9BQU8sR0FBRyxjQUFjLEdBQUcsV0FBVztBQUVoRixVQUFNLFlBQW9ELENBQUM7QUFDM0QsU0FBSyxvQkFBb0Isa0JBQWtCLGNBQVk7QUFDdEQsVUFBSSxJQUFJO0FBQ1IsVUFBSSxxQkFBcUI7QUFD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
