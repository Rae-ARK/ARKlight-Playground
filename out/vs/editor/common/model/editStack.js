import * as nls from "../../../nls.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
import { Selection } from "../core/selection.js";
import { EndOfLineSequence } from "../model.js";
import { UndoRedoElementType } from "../../../platform/undoRedo/common/undoRedo.js";
import { URI } from "../../../base/common/uri.js";
import { TextChange, compressConsecutiveTextChanges } from "../core/textChange.js";
import * as buffer from "../../../base/common/buffer.js";
import { basename } from "../../../base/common/resources.js";
import { EditSources } from "../textModelEditSource.js";
function uriGetComparisonKey(resource) {
  return resource.toString();
}
class SingleModelEditStackData {
  constructor(beforeVersionId, afterVersionId, beforeEOL, afterEOL, beforeCursorState, afterCursorState, changes) {
    this.beforeVersionId = beforeVersionId;
    this.afterVersionId = afterVersionId;
    this.beforeEOL = beforeEOL;
    this.afterEOL = afterEOL;
    this.beforeCursorState = beforeCursorState;
    this.afterCursorState = afterCursorState;
    this.changes = changes;
  }
  static create(model, beforeCursorState) {
    const alternativeVersionId = model.getAlternativeVersionId();
    const eol = getModelEOL(model);
    return new SingleModelEditStackData(
      alternativeVersionId,
      alternativeVersionId,
      eol,
      eol,
      beforeCursorState,
      beforeCursorState,
      []
    );
  }
  append(model, textChanges, afterEOL, afterVersionId, afterCursorState) {
    if (textChanges.length > 0) {
      this.changes = compressConsecutiveTextChanges(this.changes, textChanges);
    }
    this.afterEOL = afterEOL;
    this.afterVersionId = afterVersionId;
    this.afterCursorState = afterCursorState;
  }
  static _writeSelectionsSize(selections) {
    return 4 + 4 * 4 * (selections ? selections.length : 0);
  }
  static _writeSelections(b, selections, offset) {
    buffer.writeUInt32BE(b, selections ? selections.length : 0, offset);
    offset += 4;
    if (selections) {
      for (const selection of selections) {
        buffer.writeUInt32BE(b, selection.selectionStartLineNumber, offset);
        offset += 4;
        buffer.writeUInt32BE(b, selection.selectionStartColumn, offset);
        offset += 4;
        buffer.writeUInt32BE(b, selection.positionLineNumber, offset);
        offset += 4;
        buffer.writeUInt32BE(b, selection.positionColumn, offset);
        offset += 4;
      }
    }
    return offset;
  }
  static _readSelections(b, offset, dest) {
    const count = buffer.readUInt32BE(b, offset);
    offset += 4;
    for (let i = 0; i < count; i++) {
      const selectionStartLineNumber = buffer.readUInt32BE(b, offset);
      offset += 4;
      const selectionStartColumn = buffer.readUInt32BE(b, offset);
      offset += 4;
      const positionLineNumber = buffer.readUInt32BE(b, offset);
      offset += 4;
      const positionColumn = buffer.readUInt32BE(b, offset);
      offset += 4;
      dest.push(new Selection(selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn));
    }
    return offset;
  }
  serialize() {
    let necessarySize = 4 + 4 + 1 + 1 + SingleModelEditStackData._writeSelectionsSize(this.beforeCursorState) + SingleModelEditStackData._writeSelectionsSize(this.afterCursorState) + 4;
    for (const change of this.changes) {
      necessarySize += change.writeSize();
    }
    const b = new Uint8Array(necessarySize);
    let offset = 0;
    buffer.writeUInt32BE(b, this.beforeVersionId, offset);
    offset += 4;
    buffer.writeUInt32BE(b, this.afterVersionId, offset);
    offset += 4;
    buffer.writeUInt8(b, this.beforeEOL, offset);
    offset += 1;
    buffer.writeUInt8(b, this.afterEOL, offset);
    offset += 1;
    offset = SingleModelEditStackData._writeSelections(b, this.beforeCursorState, offset);
    offset = SingleModelEditStackData._writeSelections(b, this.afterCursorState, offset);
    buffer.writeUInt32BE(b, this.changes.length, offset);
    offset += 4;
    for (const change of this.changes) {
      offset = change.write(b, offset);
    }
    return b.buffer;
  }
  static deserialize(source) {
    const b = new Uint8Array(source);
    let offset = 0;
    const beforeVersionId = buffer.readUInt32BE(b, offset);
    offset += 4;
    const afterVersionId = buffer.readUInt32BE(b, offset);
    offset += 4;
    const beforeEOL = buffer.readUInt8(b, offset);
    offset += 1;
    const afterEOL = buffer.readUInt8(b, offset);
    offset += 1;
    const beforeCursorState = [];
    offset = SingleModelEditStackData._readSelections(b, offset, beforeCursorState);
    const afterCursorState = [];
    offset = SingleModelEditStackData._readSelections(b, offset, afterCursorState);
    const changeCount = buffer.readUInt32BE(b, offset);
    offset += 4;
    const changes = [];
    for (let i = 0; i < changeCount; i++) {
      offset = TextChange.read(b, offset, changes);
    }
    return new SingleModelEditStackData(
      beforeVersionId,
      afterVersionId,
      beforeEOL,
      afterEOL,
      beforeCursorState,
      afterCursorState,
      changes
    );
  }
}
class SingleModelEditStackElement {
  constructor(label, code, model, beforeCursorState) {
    this.label = label;
    this.code = code;
    this.model = model;
    this._data = SingleModelEditStackData.create(model, beforeCursorState);
  }
  get type() {
    return UndoRedoElementType.Resource;
  }
  get resource() {
    if (URI.isUri(this.model)) {
      return this.model;
    }
    return this.model.uri;
  }
  toString() {
    const data = this._data instanceof SingleModelEditStackData ? this._data : SingleModelEditStackData.deserialize(this._data);
    return data.changes.map((change) => change.toString()).join(", ");
  }
  matchesResource(resource) {
    const uri = URI.isUri(this.model) ? this.model : this.model.uri;
    return uri.toString() === resource.toString();
  }
  setModel(model) {
    this.model = model;
  }
  canAppend(model) {
    return this.model === model && this._data instanceof SingleModelEditStackData;
  }
  append(model, textChanges, afterEOL, afterVersionId, afterCursorState) {
    if (this._data instanceof SingleModelEditStackData) {
      this._data.append(model, textChanges, afterEOL, afterVersionId, afterCursorState);
    }
  }
  close() {
    if (this._data instanceof SingleModelEditStackData) {
      this._data = this._data.serialize();
    }
  }
  open() {
    if (!(this._data instanceof SingleModelEditStackData)) {
      this._data = SingleModelEditStackData.deserialize(this._data);
    }
  }
  undo() {
    if (URI.isUri(this.model)) {
      throw new Error(`Invalid SingleModelEditStackElement`);
    }
    if (this._data instanceof SingleModelEditStackData) {
      this._data = this._data.serialize();
    }
    const data = SingleModelEditStackData.deserialize(this._data);
    this.model._applyUndo(data.changes, data.beforeEOL, data.beforeVersionId, data.beforeCursorState);
  }
  redo() {
    if (URI.isUri(this.model)) {
      throw new Error(`Invalid SingleModelEditStackElement`);
    }
    if (this._data instanceof SingleModelEditStackData) {
      this._data = this._data.serialize();
    }
    const data = SingleModelEditStackData.deserialize(this._data);
    this.model._applyRedo(data.changes, data.afterEOL, data.afterVersionId, data.afterCursorState);
  }
  heapSize() {
    if (this._data instanceof SingleModelEditStackData) {
      this._data = this._data.serialize();
    }
    return this._data.byteLength + 168;
  }
}
class MultiModelEditStackElement {
  constructor(label, code, editStackElements) {
    this.label = label;
    this.code = code;
    this.type = UndoRedoElementType.Workspace;
    this._isOpen = true;
    this._editStackElementsArr = editStackElements.slice(0);
    this._editStackElementsMap = /* @__PURE__ */ new Map();
    for (const editStackElement of this._editStackElementsArr) {
      const key = uriGetComparisonKey(editStackElement.resource);
      this._editStackElementsMap.set(key, editStackElement);
    }
    this._delegate = null;
  }
  get resources() {
    return this._editStackElementsArr.map((editStackElement) => editStackElement.resource);
  }
  setDelegate(delegate) {
    this._delegate = delegate;
  }
  prepareUndoRedo() {
    if (this._delegate) {
      return this._delegate.prepareUndoRedo(this);
    }
  }
  getMissingModels() {
    const result = [];
    for (const editStackElement of this._editStackElementsArr) {
      if (URI.isUri(editStackElement.model)) {
        result.push(editStackElement.model);
      }
    }
    return result;
  }
  matchesResource(resource) {
    const key = uriGetComparisonKey(resource);
    return this._editStackElementsMap.has(key);
  }
  setModel(model) {
    const key = uriGetComparisonKey(URI.isUri(model) ? model : model.uri);
    if (this._editStackElementsMap.has(key)) {
      this._editStackElementsMap.get(key).setModel(model);
    }
  }
  canAppend(model) {
    if (!this._isOpen) {
      return false;
    }
    const key = uriGetComparisonKey(model.uri);
    if (this._editStackElementsMap.has(key)) {
      const editStackElement = this._editStackElementsMap.get(key);
      return editStackElement.canAppend(model);
    }
    return false;
  }
  append(model, textChanges, afterEOL, afterVersionId, afterCursorState) {
    const key = uriGetComparisonKey(model.uri);
    const editStackElement = this._editStackElementsMap.get(key);
    editStackElement.append(model, textChanges, afterEOL, afterVersionId, afterCursorState);
  }
  close() {
    this._isOpen = false;
  }
  open() {
  }
  undo() {
    this._isOpen = false;
    for (const editStackElement of this._editStackElementsArr) {
      editStackElement.undo();
    }
  }
  redo() {
    for (const editStackElement of this._editStackElementsArr) {
      editStackElement.redo();
    }
  }
  heapSize(resource) {
    const key = uriGetComparisonKey(resource);
    if (this._editStackElementsMap.has(key)) {
      const editStackElement = this._editStackElementsMap.get(key);
      return editStackElement.heapSize();
    }
    return 0;
  }
  split() {
    return this._editStackElementsArr;
  }
  toString() {
    const result = [];
    for (const editStackElement of this._editStackElementsArr) {
      result.push(`${basename(editStackElement.resource)}: ${editStackElement}`);
    }
    return `{${result.join(", ")}}`;
  }
}
function getModelEOL(model) {
  const eol = model.getEOL();
  if (eol === "\n") {
    return EndOfLineSequence.LF;
  } else {
    return EndOfLineSequence.CRLF;
  }
}
function isEditStackElement(element) {
  if (!element) {
    return false;
  }
  return element instanceof SingleModelEditStackElement || element instanceof MultiModelEditStackElement;
}
class EditStack {
  constructor(model, undoRedoService) {
    this._model = model;
    this._undoRedoService = undoRedoService;
  }
  pushStackElement() {
    const lastElement = this._undoRedoService.getLastElement(this._model.uri);
    if (isEditStackElement(lastElement)) {
      lastElement.close();
    }
  }
  popStackElement() {
    const lastElement = this._undoRedoService.getLastElement(this._model.uri);
    if (isEditStackElement(lastElement)) {
      lastElement.open();
    }
  }
  clear() {
    this._undoRedoService.removeElements(this._model.uri);
  }
  _getOrCreateEditStackElement(beforeCursorState, group) {
    const lastElement = this._undoRedoService.getLastElement(this._model.uri);
    if (isEditStackElement(lastElement) && lastElement.canAppend(this._model)) {
      return lastElement;
    }
    const newElement = new SingleModelEditStackElement(nls.localize("edit", "Typing"), "undoredo.textBufferEdit", this._model, beforeCursorState);
    this._undoRedoService.pushElement(newElement, group);
    return newElement;
  }
  pushEOL(eol) {
    const editStackElement = this._getOrCreateEditStackElement(null, void 0);
    this._model.setEOL(eol);
    editStackElement.append(this._model, [], getModelEOL(this._model), this._model.getAlternativeVersionId(), null);
  }
  pushEditOperation(beforeCursorState, editOperations, cursorStateComputer, group, reason = EditSources.unknown({ name: "pushEditOperation" })) {
    const editStackElement = this._getOrCreateEditStackElement(beforeCursorState, group);
    const inverseEditOperations = this._model.applyEdits(editOperations, true, reason);
    const afterCursorState = EditStack._computeCursorState(cursorStateComputer, inverseEditOperations);
    const textChanges = inverseEditOperations.map((op, index) => ({ index, textChange: op.textChange }));
    textChanges.sort((a, b) => {
      if (a.textChange.oldPosition === b.textChange.oldPosition) {
        return a.index - b.index;
      }
      return a.textChange.oldPosition - b.textChange.oldPosition;
    });
    editStackElement.append(this._model, textChanges.map((op) => op.textChange), getModelEOL(this._model), this._model.getAlternativeVersionId(), afterCursorState);
    return afterCursorState;
  }
  static _computeCursorState(cursorStateComputer, inverseEditOperations) {
    try {
      return cursorStateComputer ? cursorStateComputer(inverseEditOperations) : null;
    } catch (e) {
      onUnexpectedError(e);
      return null;
    }
  }
}
export {
  EditStack,
  MultiModelEditStackElement,
  SingleModelEditStackData,
  SingleModelEditStackElement,
  isEditStackElement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbW9kZWwvZWRpdFN0YWNrLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVTZXF1ZW5jZSwgSUN1cnNvclN0YXRlQ29tcHV0ZXIsIElWYWxpZEVkaXRPcGVyYXRpb24sIElUZXh0TW9kZWwgfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWwgfSBmcm9tICcuL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlLCBJUmVzb3VyY2VVbmRvUmVkb0VsZW1lbnQsIFVuZG9SZWRvRWxlbWVudFR5cGUsIElXb3Jrc3BhY2VVbmRvUmVkb0VsZW1lbnQsIFVuZG9SZWRvR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFRleHRDaGFuZ2UsIGNvbXByZXNzQ29uc2VjdXRpdmVUZXh0Q2hhbmdlcyB9IGZyb20gJy4uL2NvcmUvdGV4dENoYW5nZS5qcyc7XG5pbXBvcnQgKiBhcyBidWZmZXIgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRTb3VyY2VzLCBUZXh0TW9kZWxFZGl0U291cmNlIH0gZnJvbSAnLi4vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5cbmZ1bmN0aW9uIHVyaUdldENvbXBhcmlzb25LZXkocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdHJldHVybiByZXNvdXJjZS50b1N0cmluZygpO1xufVxuXG5leHBvcnQgY2xhc3MgU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhIHtcblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShtb2RlbDogSVRleHRNb2RlbCwgYmVmb3JlQ3Vyc29yU3RhdGU6IFNlbGVjdGlvbltdIHwgbnVsbCk6IFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YSB7XG5cdFx0Y29uc3QgYWx0ZXJuYXRpdmVWZXJzaW9uSWQgPSBtb2RlbC5nZXRBbHRlcm5hdGl2ZVZlcnNpb25JZCgpO1xuXHRcdGNvbnN0IGVvbCA9IGdldE1vZGVsRU9MKG1vZGVsKTtcblx0XHRyZXR1cm4gbmV3IFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YShcblx0XHRcdGFsdGVybmF0aXZlVmVyc2lvbklkLFxuXHRcdFx0YWx0ZXJuYXRpdmVWZXJzaW9uSWQsXG5cdFx0XHRlb2wsXG5cdFx0XHRlb2wsXG5cdFx0XHRiZWZvcmVDdXJzb3JTdGF0ZSxcblx0XHRcdGJlZm9yZUN1cnNvclN0YXRlLFxuXHRcdFx0W11cblx0XHQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGJlZm9yZVZlcnNpb25JZDogbnVtYmVyLFxuXHRcdHB1YmxpYyBhZnRlclZlcnNpb25JZDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBiZWZvcmVFT0w6IEVuZE9mTGluZVNlcXVlbmNlLFxuXHRcdHB1YmxpYyBhZnRlckVPTDogRW5kT2ZMaW5lU2VxdWVuY2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IGJlZm9yZUN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSB8IG51bGwsXG5cdFx0cHVibGljIGFmdGVyQ3Vyc29yU3RhdGU6IFNlbGVjdGlvbltdIHwgbnVsbCxcblx0XHRwdWJsaWMgY2hhbmdlczogVGV4dENoYW5nZVtdXG5cdCkgeyB9XG5cblx0cHVibGljIGFwcGVuZChtb2RlbDogSVRleHRNb2RlbCwgdGV4dENoYW5nZXM6IFRleHRDaGFuZ2VbXSwgYWZ0ZXJFT0w6IEVuZE9mTGluZVNlcXVlbmNlLCBhZnRlclZlcnNpb25JZDogbnVtYmVyLCBhZnRlckN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAodGV4dENoYW5nZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5jaGFuZ2VzID0gY29tcHJlc3NDb25zZWN1dGl2ZVRleHRDaGFuZ2VzKHRoaXMuY2hhbmdlcywgdGV4dENoYW5nZXMpO1xuXHRcdH1cblx0XHR0aGlzLmFmdGVyRU9MID0gYWZ0ZXJFT0w7XG5cdFx0dGhpcy5hZnRlclZlcnNpb25JZCA9IGFmdGVyVmVyc2lvbklkO1xuXHRcdHRoaXMuYWZ0ZXJDdXJzb3JTdGF0ZSA9IGFmdGVyQ3Vyc29yU3RhdGU7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfd3JpdGVTZWxlY3Rpb25zU2l6ZShzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSB8IG51bGwpOiBudW1iZXIge1xuXHRcdHJldHVybiA0ICsgNCAqIDQgKiAoc2VsZWN0aW9ucyA/IHNlbGVjdGlvbnMubGVuZ3RoIDogMCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfd3JpdGVTZWxlY3Rpb25zKGI6IFVpbnQ4QXJyYXksIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdIHwgbnVsbCwgb2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGJ1ZmZlci53cml0ZVVJbnQzMkJFKGIsIChzZWxlY3Rpb25zID8gc2VsZWN0aW9ucy5sZW5ndGggOiAwKSwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDQ7XG5cdFx0aWYgKHNlbGVjdGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdFx0YnVmZmVyLndyaXRlVUludDMyQkUoYiwgc2VsZWN0aW9uLnNlbGVjdGlvblN0YXJ0TGluZU51bWJlciwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDQ7XG5cdFx0XHRcdGJ1ZmZlci53cml0ZVVJbnQzMkJFKGIsIHNlbGVjdGlvbi5zZWxlY3Rpb25TdGFydENvbHVtbiwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDQ7XG5cdFx0XHRcdGJ1ZmZlci53cml0ZVVJbnQzMkJFKGIsIHNlbGVjdGlvbi5wb3NpdGlvbkxpbmVOdW1iZXIsIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdFx0XHRidWZmZXIud3JpdGVVSW50MzJCRShiLCBzZWxlY3Rpb24ucG9zaXRpb25Db2x1bW4sIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb2Zmc2V0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3JlYWRTZWxlY3Rpb25zKGI6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyLCBkZXN0OiBTZWxlY3Rpb25bXSk6IG51bWJlciB7XG5cdFx0Y29uc3QgY291bnQgPSBidWZmZXIucmVhZFVJbnQzMkJFKGIsIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyID0gYnVmZmVyLnJlYWRVSW50MzJCRShiLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRcdGNvbnN0IHNlbGVjdGlvblN0YXJ0Q29sdW1uID0gYnVmZmVyLnJlYWRVSW50MzJCRShiLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRcdGNvbnN0IHBvc2l0aW9uTGluZU51bWJlciA9IGJ1ZmZlci5yZWFkVUludDMyQkUoYiwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDQ7XG5cdFx0XHRjb25zdCBwb3NpdGlvbkNvbHVtbiA9IGJ1ZmZlci5yZWFkVUludDMyQkUoYiwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDQ7XG5cdFx0XHRkZXN0LnB1c2gobmV3IFNlbGVjdGlvbihzZWxlY3Rpb25TdGFydExpbmVOdW1iZXIsIHNlbGVjdGlvblN0YXJ0Q29sdW1uLCBwb3NpdGlvbkxpbmVOdW1iZXIsIHBvc2l0aW9uQ29sdW1uKSk7XG5cdFx0fVxuXHRcdHJldHVybiBvZmZzZXQ7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKCk6IEFycmF5QnVmZmVyIHtcblx0XHRsZXQgbmVjZXNzYXJ5U2l6ZSA9IChcblx0XHRcdCsgNCAvLyBiZWZvcmVWZXJzaW9uSWRcblx0XHRcdCsgNCAvLyBhZnRlclZlcnNpb25JZFxuXHRcdFx0KyAxIC8vIGJlZm9yZUVPTFxuXHRcdFx0KyAxIC8vIGFmdGVyRU9MXG5cdFx0XHQrIFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YS5fd3JpdGVTZWxlY3Rpb25zU2l6ZSh0aGlzLmJlZm9yZUN1cnNvclN0YXRlKVxuXHRcdFx0KyBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEuX3dyaXRlU2VsZWN0aW9uc1NpemUodGhpcy5hZnRlckN1cnNvclN0YXRlKVxuXHRcdFx0KyA0IC8vIGNoYW5nZSBjb3VudFxuXHRcdCk7XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgdGhpcy5jaGFuZ2VzKSB7XG5cdFx0XHRuZWNlc3NhcnlTaXplICs9IGNoYW5nZS53cml0ZVNpemUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBiID0gbmV3IFVpbnQ4QXJyYXkobmVjZXNzYXJ5U2l6ZSk7XG5cdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0YnVmZmVyLndyaXRlVUludDMyQkUoYiwgdGhpcy5iZWZvcmVWZXJzaW9uSWQsIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdGJ1ZmZlci53cml0ZVVJbnQzMkJFKGIsIHRoaXMuYWZ0ZXJWZXJzaW9uSWQsIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdGJ1ZmZlci53cml0ZVVJbnQ4KGIsIHRoaXMuYmVmb3JlRU9MLCBvZmZzZXQpOyBvZmZzZXQgKz0gMTtcblx0XHRidWZmZXIud3JpdGVVSW50OChiLCB0aGlzLmFmdGVyRU9MLCBvZmZzZXQpOyBvZmZzZXQgKz0gMTtcblx0XHRvZmZzZXQgPSBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEuX3dyaXRlU2VsZWN0aW9ucyhiLCB0aGlzLmJlZm9yZUN1cnNvclN0YXRlLCBvZmZzZXQpO1xuXHRcdG9mZnNldCA9IFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YS5fd3JpdGVTZWxlY3Rpb25zKGIsIHRoaXMuYWZ0ZXJDdXJzb3JTdGF0ZSwgb2Zmc2V0KTtcblx0XHRidWZmZXIud3JpdGVVSW50MzJCRShiLCB0aGlzLmNoYW5nZXMubGVuZ3RoLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiB0aGlzLmNoYW5nZXMpIHtcblx0XHRcdG9mZnNldCA9IGNoYW5nZS53cml0ZShiLCBvZmZzZXQpO1xuXHRcdH1cblx0XHRyZXR1cm4gYi5idWZmZXI7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlc2VyaWFsaXplKHNvdXJjZTogQXJyYXlCdWZmZXIpOiBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEge1xuXHRcdGNvbnN0IGIgPSBuZXcgVWludDhBcnJheShzb3VyY2UpO1xuXHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdGNvbnN0IGJlZm9yZVZlcnNpb25JZCA9IGJ1ZmZlci5yZWFkVUludDMyQkUoYiwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDQ7XG5cdFx0Y29uc3QgYWZ0ZXJWZXJzaW9uSWQgPSBidWZmZXIucmVhZFVJbnQzMkJFKGIsIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdGNvbnN0IGJlZm9yZUVPTCA9IGJ1ZmZlci5yZWFkVUludDgoYiwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDE7XG5cdFx0Y29uc3QgYWZ0ZXJFT0wgPSBidWZmZXIucmVhZFVJbnQ4KGIsIG9mZnNldCk7IG9mZnNldCArPSAxO1xuXHRcdGNvbnN0IGJlZm9yZUN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdG9mZnNldCA9IFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YS5fcmVhZFNlbGVjdGlvbnMoYiwgb2Zmc2V0LCBiZWZvcmVDdXJzb3JTdGF0ZSk7XG5cdFx0Y29uc3QgYWZ0ZXJDdXJzb3JTdGF0ZTogU2VsZWN0aW9uW10gPSBbXTtcblx0XHRvZmZzZXQgPSBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEuX3JlYWRTZWxlY3Rpb25zKGIsIG9mZnNldCwgYWZ0ZXJDdXJzb3JTdGF0ZSk7XG5cdFx0Y29uc3QgY2hhbmdlQ291bnQgPSBidWZmZXIucmVhZFVJbnQzMkJFKGIsIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdGNvbnN0IGNoYW5nZXM6IFRleHRDaGFuZ2VbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY2hhbmdlQ291bnQ7IGkrKykge1xuXHRcdFx0b2Zmc2V0ID0gVGV4dENoYW5nZS5yZWFkKGIsIG9mZnNldCwgY2hhbmdlcyk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhKFxuXHRcdFx0YmVmb3JlVmVyc2lvbklkLFxuXHRcdFx0YWZ0ZXJWZXJzaW9uSWQsXG5cdFx0XHRiZWZvcmVFT0wsXG5cdFx0XHRhZnRlckVPTCxcblx0XHRcdGJlZm9yZUN1cnNvclN0YXRlLFxuXHRcdFx0YWZ0ZXJDdXJzb3JTdGF0ZSxcblx0XHRcdGNoYW5nZXNcblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVVuZG9SZWRvRGVsZWdhdGUge1xuXHRwcmVwYXJlVW5kb1JlZG8oZWxlbWVudDogTXVsdGlNb2RlbEVkaXRTdGFja0VsZW1lbnQpOiBQcm9taXNlPElEaXNwb3NhYmxlPiB8IElEaXNwb3NhYmxlIHwgdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIFNpbmdsZU1vZGVsRWRpdFN0YWNrRWxlbWVudCBpbXBsZW1lbnRzIElSZXNvdXJjZVVuZG9SZWRvRWxlbWVudCB7XG5cblx0cHVibGljIG1vZGVsOiBJVGV4dE1vZGVsIHwgVVJJO1xuXHRwcml2YXRlIF9kYXRhOiBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEgfCBBcnJheUJ1ZmZlcjtcblxuXHRwdWJsaWMgZ2V0IHR5cGUoKTogVW5kb1JlZG9FbGVtZW50VHlwZS5SZXNvdXJjZSB7XG5cdFx0cmV0dXJuIFVuZG9SZWRvRWxlbWVudFR5cGUuUmVzb3VyY2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHJlc291cmNlKCk6IFVSSSB7XG5cdFx0aWYgKFVSSS5pc1VyaSh0aGlzLm1vZGVsKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMubW9kZWw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1vZGVsLnVyaTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBsYWJlbDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBjb2RlOiBzdHJpbmcsXG5cdFx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0YmVmb3JlQ3Vyc29yU3RhdGU6IFNlbGVjdGlvbltdIHwgbnVsbFxuXHQpIHtcblx0XHR0aGlzLm1vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fZGF0YSA9IFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YS5jcmVhdGUobW9kZWwsIGJlZm9yZUN1cnNvclN0YXRlKTtcblx0fVxuXG5cdHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGRhdGEgPSAodGhpcy5fZGF0YSBpbnN0YW5jZW9mIFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YSA/IHRoaXMuX2RhdGEgOiBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEuZGVzZXJpYWxpemUodGhpcy5fZGF0YSkpO1xuXHRcdHJldHVybiBkYXRhLmNoYW5nZXMubWFwKGNoYW5nZSA9PiBjaGFuZ2UudG9TdHJpbmcoKSkuam9pbignLCAnKTtcblx0fVxuXG5cdHB1YmxpYyBtYXRjaGVzUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHVyaSA9IChVUkkuaXNVcmkodGhpcy5tb2RlbCkgPyB0aGlzLm1vZGVsIDogdGhpcy5tb2RlbC51cmkpO1xuXHRcdHJldHVybiAodXJpLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0cHVibGljIHNldE1vZGVsKG1vZGVsOiBJVGV4dE1vZGVsIHwgVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbCA9IG1vZGVsO1xuXHR9XG5cblx0cHVibGljIGNhbkFwcGVuZChtb2RlbDogSVRleHRNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5tb2RlbCA9PT0gbW9kZWwgJiYgdGhpcy5fZGF0YSBpbnN0YW5jZW9mIFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YSk7XG5cdH1cblxuXHRwdWJsaWMgYXBwZW5kKG1vZGVsOiBJVGV4dE1vZGVsLCB0ZXh0Q2hhbmdlczogVGV4dENoYW5nZVtdLCBhZnRlckVPTDogRW5kT2ZMaW5lU2VxdWVuY2UsIGFmdGVyVmVyc2lvbklkOiBudW1iZXIsIGFmdGVyQ3Vyc29yU3RhdGU6IFNlbGVjdGlvbltdIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kYXRhIGluc3RhbmNlb2YgU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhKSB7XG5cdFx0XHR0aGlzLl9kYXRhLmFwcGVuZChtb2RlbCwgdGV4dENoYW5nZXMsIGFmdGVyRU9MLCBhZnRlclZlcnNpb25JZCwgYWZ0ZXJDdXJzb3JTdGF0ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNsb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kYXRhIGluc3RhbmNlb2YgU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhKSB7XG5cdFx0XHR0aGlzLl9kYXRhID0gdGhpcy5fZGF0YS5zZXJpYWxpemUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3BlbigpOiB2b2lkIHtcblx0XHRpZiAoISh0aGlzLl9kYXRhIGluc3RhbmNlb2YgU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhKSkge1xuXHRcdFx0dGhpcy5fZGF0YSA9IFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YS5kZXNlcmlhbGl6ZSh0aGlzLl9kYXRhKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdW5kbygpOiB2b2lkIHtcblx0XHRpZiAoVVJJLmlzVXJpKHRoaXMubW9kZWwpKSB7XG5cdFx0XHQvLyBkb24ndCBoYXZlIGEgbW9kZWxcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBTaW5nbGVNb2RlbEVkaXRTdGFja0VsZW1lbnRgKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2RhdGEgaW5zdGFuY2VvZiBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEpIHtcblx0XHRcdHRoaXMuX2RhdGEgPSB0aGlzLl9kYXRhLnNlcmlhbGl6ZSgpO1xuXHRcdH1cblx0XHRjb25zdCBkYXRhID0gU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhLmRlc2VyaWFsaXplKHRoaXMuX2RhdGEpO1xuXHRcdHRoaXMubW9kZWwuX2FwcGx5VW5kbyhkYXRhLmNoYW5nZXMsIGRhdGEuYmVmb3JlRU9MLCBkYXRhLmJlZm9yZVZlcnNpb25JZCwgZGF0YS5iZWZvcmVDdXJzb3JTdGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVkbygpOiB2b2lkIHtcblx0XHRpZiAoVVJJLmlzVXJpKHRoaXMubW9kZWwpKSB7XG5cdFx0XHQvLyBkb24ndCBoYXZlIGEgbW9kZWxcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBTaW5nbGVNb2RlbEVkaXRTdGFja0VsZW1lbnRgKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2RhdGEgaW5zdGFuY2VvZiBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEpIHtcblx0XHRcdHRoaXMuX2RhdGEgPSB0aGlzLl9kYXRhLnNlcmlhbGl6ZSgpO1xuXHRcdH1cblx0XHRjb25zdCBkYXRhID0gU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhLmRlc2VyaWFsaXplKHRoaXMuX2RhdGEpO1xuXHRcdHRoaXMubW9kZWwuX2FwcGx5UmVkbyhkYXRhLmNoYW5nZXMsIGRhdGEuYWZ0ZXJFT0wsIGRhdGEuYWZ0ZXJWZXJzaW9uSWQsIGRhdGEuYWZ0ZXJDdXJzb3JTdGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgaGVhcFNpemUoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fZGF0YSBpbnN0YW5jZW9mIFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YSkge1xuXHRcdFx0dGhpcy5fZGF0YSA9IHRoaXMuX2RhdGEuc2VyaWFsaXplKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9kYXRhLmJ5dGVMZW5ndGggKyAxNjgvKmhlYXAgb3ZlcmhlYWQqLztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTXVsdGlNb2RlbEVkaXRTdGFja0VsZW1lbnQgaW1wbGVtZW50cyBJV29ya3NwYWNlVW5kb1JlZG9FbGVtZW50IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IFVuZG9SZWRvRWxlbWVudFR5cGUuV29ya3NwYWNlO1xuXHRwcml2YXRlIF9pc09wZW46IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdFN0YWNrRWxlbWVudHNBcnI6IFNpbmdsZU1vZGVsRWRpdFN0YWNrRWxlbWVudFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0U3RhY2tFbGVtZW50c01hcDogTWFwPHN0cmluZywgU2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50PjtcblxuXHRwcml2YXRlIF9kZWxlZ2F0ZTogSVVuZG9SZWRvRGVsZWdhdGUgfCBudWxsO1xuXG5cdHB1YmxpYyBnZXQgcmVzb3VyY2VzKCk6IHJlYWRvbmx5IFVSSVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdFN0YWNrRWxlbWVudHNBcnIubWFwKGVkaXRTdGFja0VsZW1lbnQgPT4gZWRpdFN0YWNrRWxlbWVudC5yZXNvdXJjZSk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFiZWw6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29kZTogc3RyaW5nLFxuXHRcdGVkaXRTdGFja0VsZW1lbnRzOiBTaW5nbGVNb2RlbEVkaXRTdGFja0VsZW1lbnRbXVxuXHQpIHtcblx0XHR0aGlzLl9pc09wZW4gPSB0cnVlO1xuXHRcdHRoaXMuX2VkaXRTdGFja0VsZW1lbnRzQXJyID0gZWRpdFN0YWNrRWxlbWVudHMuc2xpY2UoMCk7XG5cdFx0dGhpcy5fZWRpdFN0YWNrRWxlbWVudHNNYXAgPSBuZXcgTWFwPHN0cmluZywgU2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50PigpO1xuXHRcdGZvciAoY29uc3QgZWRpdFN0YWNrRWxlbWVudCBvZiB0aGlzLl9lZGl0U3RhY2tFbGVtZW50c0Fycikge1xuXHRcdFx0Y29uc3Qga2V5ID0gdXJpR2V0Q29tcGFyaXNvbktleShlZGl0U3RhY2tFbGVtZW50LnJlc291cmNlKTtcblx0XHRcdHRoaXMuX2VkaXRTdGFja0VsZW1lbnRzTWFwLnNldChrZXksIGVkaXRTdGFja0VsZW1lbnQpO1xuXHRcdH1cblx0XHR0aGlzLl9kZWxlZ2F0ZSA9IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgc2V0RGVsZWdhdGUoZGVsZWdhdGU6IElVbmRvUmVkb0RlbGVnYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVsZWdhdGUgPSBkZWxlZ2F0ZTtcblx0fVxuXG5cdHB1YmxpYyBwcmVwYXJlVW5kb1JlZG8oKTogUHJvbWlzZTxJRGlzcG9zYWJsZT4gfCBJRGlzcG9zYWJsZSB8IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kZWxlZ2F0ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RlbGVnYXRlLnByZXBhcmVVbmRvUmVkbyh0aGlzKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0TWlzc2luZ01vZGVscygpOiBVUklbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBVUklbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdFN0YWNrRWxlbWVudCBvZiB0aGlzLl9lZGl0U3RhY2tFbGVtZW50c0Fycikge1xuXHRcdFx0aWYgKFVSSS5pc1VyaShlZGl0U3RhY2tFbGVtZW50Lm1vZGVsKSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChlZGl0U3RhY2tFbGVtZW50Lm1vZGVsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBtYXRjaGVzUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGtleSA9IHVyaUdldENvbXBhcmlzb25LZXkocmVzb3VyY2UpO1xuXHRcdHJldHVybiAodGhpcy5fZWRpdFN0YWNrRWxlbWVudHNNYXAuaGFzKGtleSkpO1xuXHR9XG5cblx0cHVibGljIHNldE1vZGVsKG1vZGVsOiBJVGV4dE1vZGVsIHwgVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gdXJpR2V0Q29tcGFyaXNvbktleShVUkkuaXNVcmkobW9kZWwpID8gbW9kZWwgOiBtb2RlbC51cmkpO1xuXHRcdGlmICh0aGlzLl9lZGl0U3RhY2tFbGVtZW50c01hcC5oYXMoa2V5KSkge1xuXHRcdFx0dGhpcy5fZWRpdFN0YWNrRWxlbWVudHNNYXAuZ2V0KGtleSkhLnNldE1vZGVsKG1vZGVsKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY2FuQXBwZW5kKG1vZGVsOiBJVGV4dE1vZGVsKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9pc09wZW4pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qga2V5ID0gdXJpR2V0Q29tcGFyaXNvbktleShtb2RlbC51cmkpO1xuXHRcdGlmICh0aGlzLl9lZGl0U3RhY2tFbGVtZW50c01hcC5oYXMoa2V5KSkge1xuXHRcdFx0Y29uc3QgZWRpdFN0YWNrRWxlbWVudCA9IHRoaXMuX2VkaXRTdGFja0VsZW1lbnRzTWFwLmdldChrZXkpITtcblx0XHRcdHJldHVybiBlZGl0U3RhY2tFbGVtZW50LmNhbkFwcGVuZChtb2RlbCk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBhcHBlbmQobW9kZWw6IElUZXh0TW9kZWwsIHRleHRDaGFuZ2VzOiBUZXh0Q2hhbmdlW10sIGFmdGVyRU9MOiBFbmRPZkxpbmVTZXF1ZW5jZSwgYWZ0ZXJWZXJzaW9uSWQ6IG51bWJlciwgYWZ0ZXJDdXJzb3JTdGF0ZTogU2VsZWN0aW9uW10gfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gdXJpR2V0Q29tcGFyaXNvbktleShtb2RlbC51cmkpO1xuXHRcdGNvbnN0IGVkaXRTdGFja0VsZW1lbnQgPSB0aGlzLl9lZGl0U3RhY2tFbGVtZW50c01hcC5nZXQoa2V5KSE7XG5cdFx0ZWRpdFN0YWNrRWxlbWVudC5hcHBlbmQobW9kZWwsIHRleHRDaGFuZ2VzLCBhZnRlckVPTCwgYWZ0ZXJWZXJzaW9uSWQsIGFmdGVyQ3Vyc29yU3RhdGUpO1xuXHR9XG5cblx0cHVibGljIGNsb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzT3BlbiA9IGZhbHNlO1xuXHR9XG5cblx0cHVibGljIG9wZW4oKTogdm9pZCB7XG5cdFx0Ly8gY2Fubm90IHJlb3BlblxuXHR9XG5cblx0cHVibGljIHVuZG8oKTogdm9pZCB7XG5cdFx0dGhpcy5faXNPcGVuID0gZmFsc2U7XG5cblx0XHRmb3IgKGNvbnN0IGVkaXRTdGFja0VsZW1lbnQgb2YgdGhpcy5fZWRpdFN0YWNrRWxlbWVudHNBcnIpIHtcblx0XHRcdGVkaXRTdGFja0VsZW1lbnQudW5kbygpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWRvKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZWRpdFN0YWNrRWxlbWVudCBvZiB0aGlzLl9lZGl0U3RhY2tFbGVtZW50c0Fycikge1xuXHRcdFx0ZWRpdFN0YWNrRWxlbWVudC5yZWRvKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGhlYXBTaXplKHJlc291cmNlOiBVUkkpOiBudW1iZXIge1xuXHRcdGNvbnN0IGtleSA9IHVyaUdldENvbXBhcmlzb25LZXkocmVzb3VyY2UpO1xuXHRcdGlmICh0aGlzLl9lZGl0U3RhY2tFbGVtZW50c01hcC5oYXMoa2V5KSkge1xuXHRcdFx0Y29uc3QgZWRpdFN0YWNrRWxlbWVudCA9IHRoaXMuX2VkaXRTdGFja0VsZW1lbnRzTWFwLmdldChrZXkpITtcblx0XHRcdHJldHVybiBlZGl0U3RhY2tFbGVtZW50LmhlYXBTaXplKCk7XG5cdFx0fVxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHVibGljIHNwbGl0KCk6IElSZXNvdXJjZVVuZG9SZWRvRWxlbWVudFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdFN0YWNrRWxlbWVudHNBcnI7XG5cdH1cblxuXHRwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBlZGl0U3RhY2tFbGVtZW50IG9mIHRoaXMuX2VkaXRTdGFja0VsZW1lbnRzQXJyKSB7XG5cdFx0XHRyZXN1bHQucHVzaChgJHtiYXNlbmFtZShlZGl0U3RhY2tFbGVtZW50LnJlc291cmNlKX06ICR7ZWRpdFN0YWNrRWxlbWVudH1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIGB7JHtyZXN1bHQuam9pbignLCAnKX19YDtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBFZGl0U3RhY2tFbGVtZW50ID0gU2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50IHwgTXVsdGlNb2RlbEVkaXRTdGFja0VsZW1lbnQ7XG5cbmZ1bmN0aW9uIGdldE1vZGVsRU9MKG1vZGVsOiBJVGV4dE1vZGVsKTogRW5kT2ZMaW5lU2VxdWVuY2Uge1xuXHRjb25zdCBlb2wgPSBtb2RlbC5nZXRFT0woKTtcblx0aWYgKGVvbCA9PT0gJ1xcbicpIHtcblx0XHRyZXR1cm4gRW5kT2ZMaW5lU2VxdWVuY2UuTEY7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIEVuZE9mTGluZVNlcXVlbmNlLkNSTEY7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRWRpdFN0YWNrRWxlbWVudChlbGVtZW50OiBJUmVzb3VyY2VVbmRvUmVkb0VsZW1lbnQgfCBJV29ya3NwYWNlVW5kb1JlZG9FbGVtZW50IHwgbnVsbCk6IGVsZW1lbnQgaXMgRWRpdFN0YWNrRWxlbWVudCB7XG5cdGlmICghZWxlbWVudCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gKChlbGVtZW50IGluc3RhbmNlb2YgU2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50KSB8fCAoZWxlbWVudCBpbnN0YW5jZW9mIE11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50KSk7XG59XG5cbmV4cG9ydCBjbGFzcyBFZGl0U3RhY2sge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBUZXh0TW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VuZG9SZWRvU2VydmljZTogSVVuZG9SZWRvU2VydmljZTtcblxuXHRjb25zdHJ1Y3Rvcihtb2RlbDogVGV4dE1vZGVsLCB1bmRvUmVkb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2UpIHtcblx0XHR0aGlzLl9tb2RlbCA9IG1vZGVsO1xuXHRcdHRoaXMuX3VuZG9SZWRvU2VydmljZSA9IHVuZG9SZWRvU2VydmljZTtcblx0fVxuXG5cdHB1YmxpYyBwdXNoU3RhY2tFbGVtZW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IGxhc3RFbGVtZW50ID0gdGhpcy5fdW5kb1JlZG9TZXJ2aWNlLmdldExhc3RFbGVtZW50KHRoaXMuX21vZGVsLnVyaSk7XG5cdFx0aWYgKGlzRWRpdFN0YWNrRWxlbWVudChsYXN0RWxlbWVudCkpIHtcblx0XHRcdGxhc3RFbGVtZW50LmNsb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHBvcFN0YWNrRWxlbWVudCgpOiB2b2lkIHtcblx0XHRjb25zdCBsYXN0RWxlbWVudCA9IHRoaXMuX3VuZG9SZWRvU2VydmljZS5nZXRMYXN0RWxlbWVudCh0aGlzLl9tb2RlbC51cmkpO1xuXHRcdGlmIChpc0VkaXRTdGFja0VsZW1lbnQobGFzdEVsZW1lbnQpKSB7XG5cdFx0XHRsYXN0RWxlbWVudC5vcGVuKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VuZG9SZWRvU2VydmljZS5yZW1vdmVFbGVtZW50cyh0aGlzLl9tb2RlbC51cmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3JDcmVhdGVFZGl0U3RhY2tFbGVtZW50KGJlZm9yZUN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSB8IG51bGwsIGdyb3VwOiBVbmRvUmVkb0dyb3VwIHwgdW5kZWZpbmVkKTogRWRpdFN0YWNrRWxlbWVudCB7XG5cdFx0Y29uc3QgbGFzdEVsZW1lbnQgPSB0aGlzLl91bmRvUmVkb1NlcnZpY2UuZ2V0TGFzdEVsZW1lbnQodGhpcy5fbW9kZWwudXJpKTtcblx0XHRpZiAoaXNFZGl0U3RhY2tFbGVtZW50KGxhc3RFbGVtZW50KSAmJiBsYXN0RWxlbWVudC5jYW5BcHBlbmQodGhpcy5fbW9kZWwpKSB7XG5cdFx0XHRyZXR1cm4gbGFzdEVsZW1lbnQ7XG5cdFx0fVxuXHRcdGNvbnN0IG5ld0VsZW1lbnQgPSBuZXcgU2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50KG5scy5sb2NhbGl6ZSgnZWRpdCcsIFwiVHlwaW5nXCIpLCAndW5kb3JlZG8udGV4dEJ1ZmZlckVkaXQnLCB0aGlzLl9tb2RlbCwgYmVmb3JlQ3Vyc29yU3RhdGUpO1xuXHRcdHRoaXMuX3VuZG9SZWRvU2VydmljZS5wdXNoRWxlbWVudChuZXdFbGVtZW50LCBncm91cCk7XG5cdFx0cmV0dXJuIG5ld0VsZW1lbnQ7XG5cdH1cblxuXHRwdWJsaWMgcHVzaEVPTChlb2w6IEVuZE9mTGluZVNlcXVlbmNlKTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdFN0YWNrRWxlbWVudCA9IHRoaXMuX2dldE9yQ3JlYXRlRWRpdFN0YWNrRWxlbWVudChudWxsLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX21vZGVsLnNldEVPTChlb2wpO1xuXHRcdGVkaXRTdGFja0VsZW1lbnQuYXBwZW5kKHRoaXMuX21vZGVsLCBbXSwgZ2V0TW9kZWxFT0wodGhpcy5fbW9kZWwpLCB0aGlzLl9tb2RlbC5nZXRBbHRlcm5hdGl2ZVZlcnNpb25JZCgpLCBudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBwdXNoRWRpdE9wZXJhdGlvbihiZWZvcmVDdXJzb3JTdGF0ZTogU2VsZWN0aW9uW10gfCBudWxsLCBlZGl0T3BlcmF0aW9uczogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSwgY3Vyc29yU3RhdGVDb21wdXRlcjogSUN1cnNvclN0YXRlQ29tcHV0ZXIgfCBudWxsLCBncm91cD86IFVuZG9SZWRvR3JvdXAsIHJlYXNvbjogVGV4dE1vZGVsRWRpdFNvdXJjZSA9IEVkaXRTb3VyY2VzLnVua25vd24oeyBuYW1lOiAncHVzaEVkaXRPcGVyYXRpb24nIH0pKTogU2VsZWN0aW9uW10gfCBudWxsIHtcblx0XHRjb25zdCBlZGl0U3RhY2tFbGVtZW50ID0gdGhpcy5fZ2V0T3JDcmVhdGVFZGl0U3RhY2tFbGVtZW50KGJlZm9yZUN1cnNvclN0YXRlLCBncm91cCk7XG5cdFx0Y29uc3QgaW52ZXJzZUVkaXRPcGVyYXRpb25zID0gdGhpcy5fbW9kZWwuYXBwbHlFZGl0cyhlZGl0T3BlcmF0aW9ucywgdHJ1ZSwgcmVhc29uKTtcblx0XHRjb25zdCBhZnRlckN1cnNvclN0YXRlID0gRWRpdFN0YWNrLl9jb21wdXRlQ3Vyc29yU3RhdGUoY3Vyc29yU3RhdGVDb21wdXRlciwgaW52ZXJzZUVkaXRPcGVyYXRpb25zKTtcblx0XHRjb25zdCB0ZXh0Q2hhbmdlcyA9IGludmVyc2VFZGl0T3BlcmF0aW9ucy5tYXAoKG9wLCBpbmRleCkgPT4gKHsgaW5kZXg6IGluZGV4LCB0ZXh0Q2hhbmdlOiBvcC50ZXh0Q2hhbmdlIH0pKTtcblx0XHR0ZXh0Q2hhbmdlcy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYS50ZXh0Q2hhbmdlLm9sZFBvc2l0aW9uID09PSBiLnRleHRDaGFuZ2Uub2xkUG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIGEuaW5kZXggLSBiLmluZGV4O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGEudGV4dENoYW5nZS5vbGRQb3NpdGlvbiAtIGIudGV4dENoYW5nZS5vbGRQb3NpdGlvbjtcblx0XHR9KTtcblx0XHRlZGl0U3RhY2tFbGVtZW50LmFwcGVuZCh0aGlzLl9tb2RlbCwgdGV4dENoYW5nZXMubWFwKG9wID0+IG9wLnRleHRDaGFuZ2UpLCBnZXRNb2RlbEVPTCh0aGlzLl9tb2RlbCksIHRoaXMuX21vZGVsLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCksIGFmdGVyQ3Vyc29yU3RhdGUpO1xuXHRcdHJldHVybiBhZnRlckN1cnNvclN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NvbXB1dGVDdXJzb3JTdGF0ZShjdXJzb3JTdGF0ZUNvbXB1dGVyOiBJQ3Vyc29yU3RhdGVDb21wdXRlciB8IG51bGwsIGludmVyc2VFZGl0T3BlcmF0aW9uczogSVZhbGlkRWRpdE9wZXJhdGlvbltdKTogU2VsZWN0aW9uW10gfCBudWxsIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGN1cnNvclN0YXRlQ29tcHV0ZXIgPyBjdXJzb3JTdGF0ZUNvbXB1dGVyKGludmVyc2VFZGl0T3BlcmF0aW9ucykgOiBudWxsO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGUpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx5QkFBZ0Y7QUFFekYsU0FBcUQsMkJBQXFFO0FBQzFILFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVksc0NBQXNDO0FBQzNELFlBQVksWUFBWTtBQUV4QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLG1CQUF3QztBQUVqRCxTQUFTLG9CQUFvQixVQUF1QjtBQUNuRCxTQUFPLFNBQVMsU0FBUztBQUMxQjtBQUVPLE1BQU0seUJBQXlCO0FBQUEsRUFnQnJDLFlBQ2lCLGlCQUNULGdCQUNTLFdBQ1QsVUFDUyxtQkFDVCxrQkFDQSxTQUNOO0FBUGU7QUFDVDtBQUNTO0FBQ1Q7QUFDUztBQUNUO0FBQ0E7QUFBQSxFQUNKO0FBQUEsRUF0QkosT0FBYyxPQUFPLE9BQW1CLG1CQUFpRTtBQUN4RyxVQUFNLHVCQUF1QixNQUFNLHdCQUF3QjtBQUMzRCxVQUFNLE1BQU0sWUFBWSxLQUFLO0FBQzdCLFdBQU8sSUFBSTtBQUFBLE1BQ1Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFZTyxPQUFPLE9BQW1CLGFBQTJCLFVBQTZCLGdCQUF3QixrQkFBNEM7QUFDNUosUUFBSSxZQUFZLFNBQVMsR0FBRztBQUMzQixXQUFLLFVBQVUsK0JBQStCLEtBQUssU0FBUyxXQUFXO0FBQUEsSUFDeEU7QUFDQSxTQUFLLFdBQVc7QUFDaEIsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxtQkFBbUI7QUFBQSxFQUN6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
