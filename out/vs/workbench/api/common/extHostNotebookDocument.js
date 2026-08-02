import { Schemas } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import * as extHostTypeConverters from "./extHostTypeConverters.js";
import { NotebookRange } from "./extHostTypes.js";
import * as notebookCommon from "../../contrib/notebook/common/notebookCommon.js";
import { isTextStreamMime } from "../../../base/common/mime.js";
class RawContentChangeEvent {
  constructor(start, deletedCount, deletedItems, items) {
    this.start = start;
    this.deletedCount = deletedCount;
    this.deletedItems = deletedItems;
    this.items = items;
  }
  asApiEvent() {
    return {
      range: new NotebookRange(this.start, this.start + this.deletedCount),
      addedCells: this.items.map((cell) => cell.apiCell),
      removedCells: this.deletedItems
    };
  }
}
class ExtHostCell {
  constructor(notebook, _extHostDocument, _cellData) {
    this.notebook = notebook;
    this._extHostDocument = _extHostDocument;
    this._cellData = _cellData;
    this.handle = _cellData.handle;
    this.uri = URI.revive(_cellData.uri);
    this.cellKind = _cellData.cellKind;
    this._outputs = _cellData.outputs.map(extHostTypeConverters.NotebookCellOutput.to);
    this._internalMetadata = _cellData.internalMetadata ?? {};
    this._metadata = Object.freeze(_cellData.metadata ?? {});
    this._previousResult = Object.freeze(extHostTypeConverters.NotebookCellExecutionSummary.to(_cellData.internalMetadata ?? {}));
  }
  static asModelAddData(cell) {
    return {
      EOL: cell.eol,
      lines: cell.source,
      languageId: cell.language,
      uri: cell.uri,
      isDirty: false,
      versionId: 1,
      encoding: "utf8"
    };
  }
  get internalMetadata() {
    return this._internalMetadata;
  }
  get apiCell() {
    if (!this._apiCell) {
      const that = this;
      const data = this._extHostDocument.getDocument(this.uri);
      if (!data) {
        throw new Error(`MISSING extHostDocument for notebook cell: ${this.uri}`);
      }
      const apiCell = {
        get index() {
          return that.notebook.getCellIndex(that);
        },
        notebook: that.notebook.apiNotebook,
        kind: extHostTypeConverters.NotebookCellKind.to(this._cellData.cellKind),
        document: data.document,
        get mime() {
          return that._mime;
        },
        set mime(value) {
          that._mime = value;
        },
        get outputs() {
          return that._outputs.slice(0);
        },
        get metadata() {
          return that._metadata;
        },
        get executionSummary() {
          return that._previousResult;
        }
      };
      this._apiCell = Object.freeze(apiCell);
    }
    return this._apiCell;
  }
  setOutputs(newOutputs) {
    this._outputs = newOutputs.map(extHostTypeConverters.NotebookCellOutput.to);
  }
  setOutputItems(outputId, append, newOutputItems) {
    const newItems = newOutputItems.map(extHostTypeConverters.NotebookCellOutputItem.to);
    const output = this._outputs.find((op) => op.id === outputId);
    if (output) {
      if (!append) {
        output.items.length = 0;
      }
      output.items.push(...newItems);
      if (output.items.length > 1 && output.items.every((item) => isTextStreamMime(item.mime))) {
        const mimeOutputs = /* @__PURE__ */ new Map();
        const mimeTypes = [];
        output.items.forEach((item) => {
          let items;
          if (mimeOutputs.has(item.mime)) {
            items = mimeOutputs.get(item.mime);
          } else {
            items = [];
            mimeOutputs.set(item.mime, items);
            mimeTypes.push(item.mime);
          }
          items.push(item.data);
        });
        output.items.length = 0;
        mimeTypes.forEach((mime) => {
          const compressed = notebookCommon.compressOutputItemStreams(mimeOutputs.get(mime));
          output.items.push({
            mime,
            data: compressed.data.buffer
          });
        });
      }
    }
  }
  setMetadata(newMetadata) {
    this._metadata = Object.freeze(newMetadata);
  }
  setInternalMetadata(newInternalMetadata) {
    this._internalMetadata = newInternalMetadata;
    this._previousResult = Object.freeze(extHostTypeConverters.NotebookCellExecutionSummary.to(newInternalMetadata));
  }
  setMime(newMime) {
  }
}
const _ExtHostNotebookDocument = class _ExtHostNotebookDocument {
  constructor(_proxy, _textDocumentsAndEditors, _textDocuments, uri, data) {
    this._proxy = _proxy;
    this._textDocumentsAndEditors = _textDocumentsAndEditors;
    this._textDocuments = _textDocuments;
    this.uri = uri;
    this.handle = _ExtHostNotebookDocument._handlePool++;
    this._cells = [];
    this._versionId = 0;
    this._isDirty = false;
    this._disposed = false;
    this._notebookType = data.viewType;
    this._metadata = Object.freeze(data.metadata ?? /* @__PURE__ */ Object.create(null));
    this._spliceNotebookCells([[0, 0, data.cells]], true, void 0);
    this._versionId = data.versionId;
  }
  dispose() {
    this._disposed = true;
  }
  get versionId() {
    return this._versionId;
  }
  get apiNotebook() {
    if (!this._notebook) {
      const that = this;
      const apiObject = {
        get uri() {
          return that.uri;
        },
        get version() {
          return that._versionId;
        },
        get notebookType() {
          return that._notebookType;
        },
        get isDirty() {
          return that._isDirty;
        },
        get isUntitled() {
          return that.uri.scheme === Schemas.untitled;
        },
        get isClosed() {
          return that._disposed;
        },
        get metadata() {
          return that._metadata;
        },
        get cellCount() {
          return that._cells.length;
        },
        cellAt(index) {
          index = that._validateIndex(index);
          return that._cells[index].apiCell;
        },
        getCells(range) {
          const cells = range ? that._getCells(range) : that._cells;
          return cells.map((cell) => cell.apiCell);
        },
        save() {
          return that._save();
        },
        [/* @__PURE__ */ Symbol.for("debug.description")]() {
          return `NotebookDocument(${this.uri.toString()})`;
        }
      };
      this._notebook = Object.freeze(apiObject);
    }
    return this._notebook;
  }
  acceptDocumentPropertiesChanged(data) {
    if (data.metadata) {
      this._metadata = Object.freeze({ ...this._metadata, ...data.metadata });
    }
  }
  acceptDirty(isDirty) {
    this._isDirty = isDirty;
  }
  acceptModelChanged(event, isDirty, newMetadata) {
    this._versionId = event.versionId;
    this._isDirty = isDirty;
    this.acceptDocumentPropertiesChanged({ metadata: newMetadata });
    const result = {
      notebook: this.apiNotebook,
      metadata: newMetadata,
      cellChanges: [],
      contentChanges: []
    };
    const relaxedCellChanges = [];
    for (const rawEvent of event.rawEvents) {
      if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ModelChange) {
        this._spliceNotebookCells(rawEvent.changes, false, result.contentChanges);
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.Move) {
        this._moveCells(rawEvent.index, rawEvent.length, rawEvent.newIdx, result.contentChanges);
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.Output) {
        this._setCellOutputs(rawEvent.index, rawEvent.outputs);
        relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, outputs: this._cells[rawEvent.index].apiCell.outputs });
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.OutputItem) {
        this._setCellOutputItems(rawEvent.index, rawEvent.outputId, rawEvent.append, rawEvent.outputItems);
        relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, outputs: this._cells[rawEvent.index].apiCell.outputs });
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellLanguage) {
        this._changeCellLanguage(rawEvent.index, rawEvent.language);
        relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, document: this._cells[rawEvent.index].apiCell.document });
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellContent) {
        relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, document: this._cells[rawEvent.index].apiCell.document });
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellMime) {
        this._changeCellMime(rawEvent.index, rawEvent.mime);
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellMetadata) {
        this._changeCellMetadata(rawEvent.index, rawEvent.metadata);
        relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, metadata: this._cells[rawEvent.index].apiCell.metadata });
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellInternalMetadata) {
        this._changeCellInternalMetadata(rawEvent.index, rawEvent.internalMetadata);
        relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, executionSummary: this._cells[rawEvent.index].apiCell.executionSummary });
      }
    }
    const map = /* @__PURE__ */ new Map();
    for (let i = 0; i < relaxedCellChanges.length; i++) {
      const relaxedCellChange = relaxedCellChanges[i];
      const existing = map.get(relaxedCellChange.cell);
      if (existing === void 0) {
        const newLen = result.cellChanges.push({
          document: void 0,
          executionSummary: void 0,
          metadata: void 0,
          outputs: void 0,
          ...relaxedCellChange
        });
        map.set(relaxedCellChange.cell, newLen - 1);
      } else {
        result.cellChanges[existing] = {
          ...result.cellChanges[existing],
          ...relaxedCellChange
        };
      }
    }
    Object.freeze(result);
    Object.freeze(result.cellChanges);
    Object.freeze(result.contentChanges);
    return result;
  }
  _validateIndex(index) {
    index = index | 0;
    if (index < 0) {
      return 0;
    } else if (index >= this._cells.length) {
      return this._cells.length - 1;
    } else {
      return index;
    }
  }
  _validateRange(range) {
    let start = range.start | 0;
    let end = range.end | 0;
    if (start < 0) {
      start = 0;
    }
    if (end > this._cells.length) {
      end = this._cells.length;
    }
    return range.with({ start, end });
  }
  _getCells(range) {
    range = this._validateRange(range);
    const result = [];
    for (let i = range.start; i < range.end; i++) {
      result.push(this._cells[i]);
    }
    return result;
  }
  async _save() {
    if (this._disposed) {
      return Promise.reject(new Error("Notebook has been closed"));
    }
    return this._proxy.$trySaveNotebook(this.uri);
  }
  _spliceNotebookCells(splices, initialization, bucket) {
    if (this._disposed) {
      return;
    }
    const contentChangeEvents = [];
    const addedCellDocuments = [];
    const removedCellDocuments = [];
    splices.reverse().forEach((splice) => {
      const cellDtos = splice[2];
      const newCells = cellDtos.map((cell) => {
        const extCell = new ExtHostCell(this, this._textDocumentsAndEditors, cell);
        if (!initialization) {
          addedCellDocuments.push(ExtHostCell.asModelAddData(cell));
        }
        return extCell;
      });
      const changeEvent = new RawContentChangeEvent(splice[0], splice[1], [], newCells);
      const deletedItems = this._cells.splice(splice[0], splice[1], ...newCells);
      for (const cell of deletedItems) {
        removedCellDocuments.push(cell.uri);
        changeEvent.deletedItems.push(cell.apiCell);
      }
      contentChangeEvents.push(changeEvent);
    });
    this._textDocumentsAndEditors.acceptDocumentsAndEditorsDelta({
      addedDocuments: addedCellDocuments,
      removedDocuments: removedCellDocuments
    });
    if (bucket) {
      for (const changeEvent of contentChangeEvents) {
        bucket.push(changeEvent.asApiEvent());
      }
    }
  }
  _moveCells(index, length, newIdx, bucket) {
    const cells = this._cells.splice(index, length);
    this._cells.splice(newIdx, 0, ...cells);
    const changes = [
      new RawContentChangeEvent(index, length, cells.map((c) => c.apiCell), []),
      new RawContentChangeEvent(newIdx, 0, [], cells)
    ];
    for (const change of changes) {
      bucket.push(change.asApiEvent());
    }
  }
  _setCellOutputs(index, outputs) {
    const cell = this._cells[index];
    cell.setOutputs(outputs);
  }
  _setCellOutputItems(index, outputId, append, outputItems) {
    const cell = this._cells[index];
    cell.setOutputItems(outputId, append, outputItems);
  }
  _changeCellLanguage(index, newLanguageId) {
    const cell = this._cells[index];
    if (cell.apiCell.document.languageId !== newLanguageId) {
      this._textDocuments.$acceptModelLanguageChanged(cell.uri, newLanguageId);
    }
  }
  _changeCellMime(index, newMime) {
    const cell = this._cells[index];
    cell.apiCell.mime = newMime;
  }
  _changeCellMetadata(index, newMetadata) {
    const cell = this._cells[index];
    cell.setMetadata(newMetadata);
  }
  _changeCellInternalMetadata(index, newInternalMetadata) {
    const cell = this._cells[index];
    cell.setInternalMetadata(newInternalMetadata);
  }
  getCellFromApiCell(apiCell) {
    return this._cells.find((cell) => cell.apiCell === apiCell);
  }
  getCellFromIndex(index) {
    return this._cells[index];
  }
  getCell(cellHandle) {
    return this._cells.find((cell) => cell.handle === cellHandle);
  }
  getCellIndex(cell) {
    return this._cells.indexOf(cell);
  }
};
_ExtHostNotebookDocument._handlePool = 0;
let ExtHostNotebookDocument = _ExtHostNotebookDocument;
export {
  ExtHostCell,
  ExtHostNotebookDocument
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3ROb3RlYm9va0RvY3VtZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RQcm90b2NvbCBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50cyB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuanMnO1xuaW1wb3J0ICogYXMgZXh0SG9zdFR5cGVDb252ZXJ0ZXJzIGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IE5vdGVib29rUmFuZ2UgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBub3RlYm9va0NvbW1vbiBmcm9tICcuLi8uLi9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IGlzVGV4dFN0cmVhbU1pbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcblxuY2xhc3MgUmF3Q29udGVudENoYW5nZUV2ZW50IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBzdGFydDogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IGRlbGV0ZWRDb3VudDogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IGRlbGV0ZWRJdGVtczogdnNjb2RlLk5vdGVib29rQ2VsbFtdLFxuXHRcdHJlYWRvbmx5IGl0ZW1zOiBFeHRIb3N0Q2VsbFtdXG5cdCkgeyB9XG5cblx0YXNBcGlFdmVudCgpOiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudENvbnRlbnRDaGFuZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogbmV3IE5vdGVib29rUmFuZ2UodGhpcy5zdGFydCwgdGhpcy5zdGFydCArIHRoaXMuZGVsZXRlZENvdW50KSxcblx0XHRcdGFkZGVkQ2VsbHM6IHRoaXMuaXRlbXMubWFwKGNlbGwgPT4gY2VsbC5hcGlDZWxsKSxcblx0XHRcdHJlbW92ZWRDZWxsczogdGhpcy5kZWxldGVkSXRlbXMsXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdENlbGwge1xuXG5cdHN0YXRpYyBhc01vZGVsQWRkRGF0YShjZWxsOiBleHRIb3N0UHJvdG9jb2wuTm90ZWJvb2tDZWxsRHRvKTogZXh0SG9zdFByb3RvY29sLklNb2RlbEFkZGVkRGF0YSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdEVPTDogY2VsbC5lb2wsXG5cdFx0XHRsaW5lczogY2VsbC5zb3VyY2UsXG5cdFx0XHRsYW5ndWFnZUlkOiBjZWxsLmxhbmd1YWdlLFxuXHRcdFx0dXJpOiBjZWxsLnVyaSxcblx0XHRcdGlzRGlydHk6IGZhbHNlLFxuXHRcdFx0dmVyc2lvbklkOiAxLFxuXHRcdFx0ZW5jb2Rpbmc6ICd1dGY4J1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9vdXRwdXRzOiB2c2NvZGUuTm90ZWJvb2tDZWxsT3V0cHV0W107XG5cdHByaXZhdGUgX21ldGFkYXRhOiBSZWFkb25seTxub3RlYm9va0NvbW1vbi5Ob3RlYm9va0NlbGxNZXRhZGF0YT47XG5cdHByaXZhdGUgX3ByZXZpb3VzUmVzdWx0OiBSZWFkb25seTx2c2NvZGUuTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3VtbWFyeSB8IHVuZGVmaW5lZD47XG5cblx0cHJpdmF0ZSBfaW50ZXJuYWxNZXRhZGF0YTogbm90ZWJvb2tDb21tb24uTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YTtcblx0cmVhZG9ubHkgaGFuZGxlOiBudW1iZXI7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRyZWFkb25seSBjZWxsS2luZDogbm90ZWJvb2tDb21tb24uQ2VsbEtpbmQ7XG5cblx0cHJpdmF0ZSBfYXBpQ2VsbDogdnNjb2RlLk5vdGVib29rQ2VsbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbWltZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG5vdGVib29rOiBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0RG9jdW1lbnQ6IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NlbGxEYXRhOiBleHRIb3N0UHJvdG9jb2wuTm90ZWJvb2tDZWxsRHRvLFxuXHQpIHtcblx0XHR0aGlzLmhhbmRsZSA9IF9jZWxsRGF0YS5oYW5kbGU7XG5cdFx0dGhpcy51cmkgPSBVUkkucmV2aXZlKF9jZWxsRGF0YS51cmkpO1xuXHRcdHRoaXMuY2VsbEtpbmQgPSBfY2VsbERhdGEuY2VsbEtpbmQ7XG5cdFx0dGhpcy5fb3V0cHV0cyA9IF9jZWxsRGF0YS5vdXRwdXRzLm1hcChleHRIb3N0VHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tDZWxsT3V0cHV0LnRvKTtcblx0XHR0aGlzLl9pbnRlcm5hbE1ldGFkYXRhID0gX2NlbGxEYXRhLmludGVybmFsTWV0YWRhdGEgPz8ge307XG5cdFx0dGhpcy5fbWV0YWRhdGEgPSBPYmplY3QuZnJlZXplKF9jZWxsRGF0YS5tZXRhZGF0YSA/PyB7fSk7XG5cdFx0dGhpcy5fcHJldmlvdXNSZXN1bHQgPSBPYmplY3QuZnJlZXplKGV4dEhvc3RUeXBlQ29udmVydGVycy5Ob3RlYm9va0NlbGxFeGVjdXRpb25TdW1tYXJ5LnRvKF9jZWxsRGF0YS5pbnRlcm5hbE1ldGFkYXRhID8/IHt9KSk7XG5cdH1cblxuXHRnZXQgaW50ZXJuYWxNZXRhZGF0YSgpOiBub3RlYm9va0NvbW1vbi5Ob3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhIHtcblx0XHRyZXR1cm4gdGhpcy5faW50ZXJuYWxNZXRhZGF0YTtcblx0fVxuXG5cdGdldCBhcGlDZWxsKCk6IHZzY29kZS5Ob3RlYm9va0NlbGwge1xuXHRcdGlmICghdGhpcy5fYXBpQ2VsbCkge1xuXHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0XHRjb25zdCBkYXRhID0gdGhpcy5fZXh0SG9zdERvY3VtZW50LmdldERvY3VtZW50KHRoaXMudXJpKTtcblx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1JU1NJTkcgZXh0SG9zdERvY3VtZW50IGZvciBub3RlYm9vayBjZWxsOiAke3RoaXMudXJpfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXBpQ2VsbDogdnNjb2RlLk5vdGVib29rQ2VsbCA9IHtcblx0XHRcdFx0Z2V0IGluZGV4KCkgeyByZXR1cm4gdGhhdC5ub3RlYm9vay5nZXRDZWxsSW5kZXgodGhhdCk7IH0sXG5cdFx0XHRcdG5vdGVib29rOiB0aGF0Lm5vdGVib29rLmFwaU5vdGVib29rLFxuXHRcdFx0XHRraW5kOiBleHRIb3N0VHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tDZWxsS2luZC50byh0aGlzLl9jZWxsRGF0YS5jZWxsS2luZCksXG5cdFx0XHRcdGRvY3VtZW50OiBkYXRhLmRvY3VtZW50LFxuXHRcdFx0XHRnZXQgbWltZSgpIHsgcmV0dXJuIHRoYXQuX21pbWU7IH0sXG5cdFx0XHRcdHNldCBtaW1lKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHsgdGhhdC5fbWltZSA9IHZhbHVlOyB9LFxuXHRcdFx0XHRnZXQgb3V0cHV0cygpIHsgcmV0dXJuIHRoYXQuX291dHB1dHMuc2xpY2UoMCk7IH0sXG5cdFx0XHRcdGdldCBtZXRhZGF0YSgpIHsgcmV0dXJuIHRoYXQuX21ldGFkYXRhOyB9LFxuXHRcdFx0XHRnZXQgZXhlY3V0aW9uU3VtbWFyeSgpIHsgcmV0dXJuIHRoYXQuX3ByZXZpb3VzUmVzdWx0OyB9XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fYXBpQ2VsbCA9IE9iamVjdC5mcmVlemUoYXBpQ2VsbCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9hcGlDZWxsO1xuXHR9XG5cblx0c2V0T3V0cHV0cyhuZXdPdXRwdXRzOiBleHRIb3N0UHJvdG9jb2wuTm90ZWJvb2tPdXRwdXREdG9bXSk6IHZvaWQge1xuXHRcdHRoaXMuX291dHB1dHMgPSBuZXdPdXRwdXRzLm1hcChleHRIb3N0VHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tDZWxsT3V0cHV0LnRvKTtcblx0fVxuXG5cdHNldE91dHB1dEl0ZW1zKG91dHB1dElkOiBzdHJpbmcsIGFwcGVuZDogYm9vbGVhbiwgbmV3T3V0cHV0SXRlbXM6IGV4dEhvc3RQcm90b2NvbC5Ob3RlYm9va091dHB1dEl0ZW1EdG9bXSkge1xuXHRcdGNvbnN0IG5ld0l0ZW1zID0gbmV3T3V0cHV0SXRlbXMubWFwKGV4dEhvc3RUeXBlQ29udmVydGVycy5Ob3RlYm9va0NlbGxPdXRwdXRJdGVtLnRvKTtcblx0XHRjb25zdCBvdXRwdXQgPSB0aGlzLl9vdXRwdXRzLmZpbmQob3AgPT4gb3AuaWQgPT09IG91dHB1dElkKTtcblx0XHRpZiAob3V0cHV0KSB7XG5cdFx0XHRpZiAoIWFwcGVuZCkge1xuXHRcdFx0XHRvdXRwdXQuaXRlbXMubGVuZ3RoID0gMDtcblx0XHRcdH1cblx0XHRcdG91dHB1dC5pdGVtcy5wdXNoKC4uLm5ld0l0ZW1zKTtcblxuXHRcdFx0aWYgKG91dHB1dC5pdGVtcy5sZW5ndGggPiAxICYmIG91dHB1dC5pdGVtcy5ldmVyeShpdGVtID0+IGlzVGV4dFN0cmVhbU1pbWUoaXRlbS5taW1lKSkpIHtcblx0XHRcdFx0Ly8gTG9vayBmb3IgdGhlIG1pbWVzIGluIHRoZSBpdGVtcywgYW5kIGtlZXAgdHJhY2sgb2YgdGhlaXIgb3JkZXIuXG5cdFx0XHRcdC8vIE1lcmdlIHRoZSBzdHJlYW1zIGludG8gb25lIG91dHB1dCBpdGVtLCBwZXIgbWltZSB0eXBlLlxuXHRcdFx0XHRjb25zdCBtaW1lT3V0cHV0cyA9IG5ldyBNYXA8c3RyaW5nLCBVaW50OEFycmF5W10+KCk7XG5cdFx0XHRcdGNvbnN0IG1pbWVUeXBlczogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0b3V0cHV0Lml0ZW1zLmZvckVhY2goaXRlbSA9PiB7XG5cdFx0XHRcdFx0bGV0IGl0ZW1zOiBVaW50OEFycmF5W107XG5cdFx0XHRcdFx0aWYgKG1pbWVPdXRwdXRzLmhhcyhpdGVtLm1pbWUpKSB7XG5cdFx0XHRcdFx0XHRpdGVtcyA9IG1pbWVPdXRwdXRzLmdldChpdGVtLm1pbWUpITtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aXRlbXMgPSBbXTtcblx0XHRcdFx0XHRcdG1pbWVPdXRwdXRzLnNldChpdGVtLm1pbWUsIGl0ZW1zKTtcblx0XHRcdFx0XHRcdG1pbWVUeXBlcy5wdXNoKGl0ZW0ubWltZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGl0ZW1zLnB1c2goaXRlbS5kYXRhKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdG91dHB1dC5pdGVtcy5sZW5ndGggPSAwO1xuXHRcdFx0XHRtaW1lVHlwZXMuZm9yRWFjaChtaW1lID0+IHtcblx0XHRcdFx0XHRjb25zdCBjb21wcmVzc2VkID0gbm90ZWJvb2tDb21tb24uY29tcHJlc3NPdXRwdXRJdGVtU3RyZWFtcyhtaW1lT3V0cHV0cy5nZXQobWltZSkhKTtcblx0XHRcdFx0XHRvdXRwdXQuaXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRtaW1lLFxuXHRcdFx0XHRcdFx0ZGF0YTogY29tcHJlc3NlZC5kYXRhLmJ1ZmZlclxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzZXRNZXRhZGF0YShuZXdNZXRhZGF0YTogbm90ZWJvb2tDb21tb24uTm90ZWJvb2tDZWxsTWV0YWRhdGEpOiB2b2lkIHtcblx0XHR0aGlzLl9tZXRhZGF0YSA9IE9iamVjdC5mcmVlemUobmV3TWV0YWRhdGEpO1xuXHR9XG5cblx0c2V0SW50ZXJuYWxNZXRhZGF0YShuZXdJbnRlcm5hbE1ldGFkYXRhOiBub3RlYm9va0NvbW1vbi5Ob3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5faW50ZXJuYWxNZXRhZGF0YSA9IG5ld0ludGVybmFsTWV0YWRhdGE7XG5cdFx0dGhpcy5fcHJldmlvdXNSZXN1bHQgPSBPYmplY3QuZnJlZXplKGV4dEhvc3RUeXBlQ29udmVydGVycy5Ob3RlYm9va0NlbGxFeGVjdXRpb25TdW1tYXJ5LnRvKG5ld0ludGVybmFsTWV0YWRhdGEpKTtcblx0fVxuXG5cdHNldE1pbWUobmV3TWltZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hhbmRsZVBvb2w6IG51bWJlciA9IDA7XG5cdHJlYWRvbmx5IGhhbmRsZSA9IEV4dEhvc3ROb3RlYm9va0RvY3VtZW50Ll9oYW5kbGVQb29sKys7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2VsbHM6IEV4dEhvc3RDZWxsW10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1R5cGU6IHN0cmluZztcblxuXHRwcml2YXRlIF9ub3RlYm9vazogdnNjb2RlLk5vdGVib29rRG9jdW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21ldGFkYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xuXHRwcml2YXRlIF92ZXJzaW9uSWQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2lzRGlydHk6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfZGlzcG9zZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogZXh0SG9zdFByb3RvY29sLk1haW5UaHJlYWROb3RlYm9va0RvY3VtZW50c1NoYXBlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RleHREb2N1bWVudHNBbmRFZGl0b3JzOiBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZXh0RG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHJlYWRvbmx5IHVyaTogVVJJLFxuXHRcdGRhdGE6IGV4dEhvc3RQcm90b2NvbC5JTm90ZWJvb2tNb2RlbEFkZGVkRGF0YVxuXHQpIHtcblx0XHR0aGlzLl9ub3RlYm9va1R5cGUgPSBkYXRhLnZpZXdUeXBlO1xuXHRcdHRoaXMuX21ldGFkYXRhID0gT2JqZWN0LmZyZWV6ZShkYXRhLm1ldGFkYXRhID8/IE9iamVjdC5jcmVhdGUobnVsbCkpO1xuXHRcdHRoaXMuX3NwbGljZU5vdGVib29rQ2VsbHMoW1swLCAwLCBkYXRhLmNlbGxzXV0sIHRydWUgLyogaW5pdCAtPiBubyBldmVudCovLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3ZlcnNpb25JZCA9IGRhdGEudmVyc2lvbklkO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cdH1cblxuXHRnZXQgdmVyc2lvbklkKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZlcnNpb25JZDtcblx0fVxuXG5cdGdldCBhcGlOb3RlYm9vaygpOiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudCB7XG5cdFx0aWYgKCF0aGlzLl9ub3RlYm9vaykge1xuXHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0XHRjb25zdCBhcGlPYmplY3Q6IHZzY29kZS5Ob3RlYm9va0RvY3VtZW50ID0ge1xuXHRcdFx0XHRnZXQgdXJpKCkgeyByZXR1cm4gdGhhdC51cmk7IH0sXG5cdFx0XHRcdGdldCB2ZXJzaW9uKCkgeyByZXR1cm4gdGhhdC5fdmVyc2lvbklkOyB9LFxuXHRcdFx0XHRnZXQgbm90ZWJvb2tUeXBlKCkgeyByZXR1cm4gdGhhdC5fbm90ZWJvb2tUeXBlOyB9LFxuXHRcdFx0XHRnZXQgaXNEaXJ0eSgpIHsgcmV0dXJuIHRoYXQuX2lzRGlydHk7IH0sXG5cdFx0XHRcdGdldCBpc1VudGl0bGVkKCkgeyByZXR1cm4gdGhhdC51cmkuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkOyB9LFxuXHRcdFx0XHRnZXQgaXNDbG9zZWQoKSB7IHJldHVybiB0aGF0Ll9kaXNwb3NlZDsgfSxcblx0XHRcdFx0Z2V0IG1ldGFkYXRhKCkgeyByZXR1cm4gdGhhdC5fbWV0YWRhdGE7IH0sXG5cdFx0XHRcdGdldCBjZWxsQ291bnQoKSB7IHJldHVybiB0aGF0Ll9jZWxscy5sZW5ndGg7IH0sXG5cdFx0XHRcdGNlbGxBdChpbmRleCkge1xuXHRcdFx0XHRcdGluZGV4ID0gdGhhdC5fdmFsaWRhdGVJbmRleChpbmRleCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoYXQuX2NlbGxzW2luZGV4XS5hcGlDZWxsO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRDZWxscyhyYW5nZSkge1xuXHRcdFx0XHRcdGNvbnN0IGNlbGxzID0gcmFuZ2UgPyB0aGF0Ll9nZXRDZWxscyhyYW5nZSkgOiB0aGF0Ll9jZWxscztcblx0XHRcdFx0XHRyZXR1cm4gY2VsbHMubWFwKGNlbGwgPT4gY2VsbC5hcGlDZWxsKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c2F2ZSgpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5fc2F2ZSgpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRbU3ltYm9sLmZvcignZGVidWcuZGVzY3JpcHRpb24nKV0oKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGBOb3RlYm9va0RvY3VtZW50KCR7dGhpcy51cmkudG9TdHJpbmcoKX0pYDtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX25vdGVib29rID0gT2JqZWN0LmZyZWV6ZShhcGlPYmplY3QpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2s7XG5cdH1cblxuXHRhY2NlcHREb2N1bWVudFByb3BlcnRpZXNDaGFuZ2VkKGRhdGE6IGV4dEhvc3RQcm90b2NvbC5JTm90ZWJvb2tEb2N1bWVudFByb3BlcnRpZXNDaGFuZ2VEYXRhKSB7XG5cdFx0aWYgKGRhdGEubWV0YWRhdGEpIHtcblx0XHRcdHRoaXMuX21ldGFkYXRhID0gT2JqZWN0LmZyZWV6ZSh7IC4uLnRoaXMuX21ldGFkYXRhLCAuLi5kYXRhLm1ldGFkYXRhIH0pO1xuXHRcdH1cblx0fVxuXG5cdGFjY2VwdERpcnR5KGlzRGlydHk6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9pc0RpcnR5ID0gaXNEaXJ0eTtcblx0fVxuXG5cdGFjY2VwdE1vZGVsQ2hhbmdlZChldmVudDogZXh0SG9zdFByb3RvY29sLk5vdGVib29rQ2VsbHNDaGFuZ2VkRXZlbnREdG8sIGlzRGlydHk6IGJvb2xlYW4sIG5ld01ldGFkYXRhOiBub3RlYm9va0NvbW1vbi5Ob3RlYm9va0RvY3VtZW50TWV0YWRhdGEgfCB1bmRlZmluZWQpOiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudENoYW5nZUV2ZW50IHtcblx0XHR0aGlzLl92ZXJzaW9uSWQgPSBldmVudC52ZXJzaW9uSWQ7XG5cdFx0dGhpcy5faXNEaXJ0eSA9IGlzRGlydHk7XG5cdFx0dGhpcy5hY2NlcHREb2N1bWVudFByb3BlcnRpZXNDaGFuZ2VkKHsgbWV0YWRhdGE6IG5ld01ldGFkYXRhIH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0ge1xuXHRcdFx0bm90ZWJvb2s6IHRoaXMuYXBpTm90ZWJvb2ssXG5cdFx0XHRtZXRhZGF0YTogbmV3TWV0YWRhdGEsXG5cdFx0XHRjZWxsQ2hhbmdlczogPHZzY29kZS5Ob3RlYm9va0RvY3VtZW50Q2VsbENoYW5nZVtdPltdLFxuXHRcdFx0Y29udGVudENoYW5nZXM6IDx2c2NvZGUuTm90ZWJvb2tEb2N1bWVudENvbnRlbnRDaGFuZ2VbXT5bXSxcblx0XHR9O1xuXG5cdFx0dHlwZSBSZWxheGVkQ2VsbENoYW5nZSA9IFBhcnRpYWw8dnNjb2RlLk5vdGVib29rRG9jdW1lbnRDZWxsQ2hhbmdlPiAmIHsgY2VsbDogdnNjb2RlLk5vdGVib29rQ2VsbCB9O1xuXHRcdGNvbnN0IHJlbGF4ZWRDZWxsQ2hhbmdlczogUmVsYXhlZENlbGxDaGFuZ2VbXSA9IFtdO1xuXG5cdFx0Ly8gLS0gYXBwbHkgY2hhbmdlIGFuZCBwb3B1bGF0ZSBjb250ZW50IGNoYW5nZXNcblxuXHRcdGZvciAoY29uc3QgcmF3RXZlbnQgb2YgZXZlbnQucmF3RXZlbnRzKSB7XG5cdFx0XHRpZiAocmF3RXZlbnQua2luZCA9PT0gbm90ZWJvb2tDb21tb24uTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2UpIHtcblx0XHRcdFx0dGhpcy5fc3BsaWNlTm90ZWJvb2tDZWxscyhyYXdFdmVudC5jaGFuZ2VzLCBmYWxzZSwgcmVzdWx0LmNvbnRlbnRDaGFuZ2VzKTtcblxuXHRcdFx0fSBlbHNlIGlmIChyYXdFdmVudC5raW5kID09PSBub3RlYm9va0NvbW1vbi5Ob3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb3ZlKSB7XG5cdFx0XHRcdHRoaXMuX21vdmVDZWxscyhyYXdFdmVudC5pbmRleCwgcmF3RXZlbnQubGVuZ3RoLCByYXdFdmVudC5uZXdJZHgsIHJlc3VsdC5jb250ZW50Q2hhbmdlcyk7XG5cblx0XHRcdH0gZWxzZSBpZiAocmF3RXZlbnQua2luZCA9PT0gbm90ZWJvb2tDb21tb24uTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuT3V0cHV0KSB7XG5cdFx0XHRcdHRoaXMuX3NldENlbGxPdXRwdXRzKHJhd0V2ZW50LmluZGV4LCByYXdFdmVudC5vdXRwdXRzKTtcblx0XHRcdFx0cmVsYXhlZENlbGxDaGFuZ2VzLnB1c2goeyBjZWxsOiB0aGlzLl9jZWxsc1tyYXdFdmVudC5pbmRleF0uYXBpQ2VsbCwgb3V0cHV0czogdGhpcy5fY2VsbHNbcmF3RXZlbnQuaW5kZXhdLmFwaUNlbGwub3V0cHV0cyB9KTtcblxuXHRcdFx0fSBlbHNlIGlmIChyYXdFdmVudC5raW5kID09PSBub3RlYm9va0NvbW1vbi5Ob3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5PdXRwdXRJdGVtKSB7XG5cdFx0XHRcdHRoaXMuX3NldENlbGxPdXRwdXRJdGVtcyhyYXdFdmVudC5pbmRleCwgcmF3RXZlbnQub3V0cHV0SWQsIHJhd0V2ZW50LmFwcGVuZCwgcmF3RXZlbnQub3V0cHV0SXRlbXMpO1xuXHRcdFx0XHRyZWxheGVkQ2VsbENoYW5nZXMucHVzaCh7IGNlbGw6IHRoaXMuX2NlbGxzW3Jhd0V2ZW50LmluZGV4XS5hcGlDZWxsLCBvdXRwdXRzOiB0aGlzLl9jZWxsc1tyYXdFdmVudC5pbmRleF0uYXBpQ2VsbC5vdXRwdXRzIH0pO1xuXG5cdFx0XHR9IGVsc2UgaWYgKHJhd0V2ZW50LmtpbmQgPT09IG5vdGVib29rQ29tbW9uLk5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxMYW5ndWFnZSkge1xuXHRcdFx0XHR0aGlzLl9jaGFuZ2VDZWxsTGFuZ3VhZ2UocmF3RXZlbnQuaW5kZXgsIHJhd0V2ZW50Lmxhbmd1YWdlKTtcblx0XHRcdFx0cmVsYXhlZENlbGxDaGFuZ2VzLnB1c2goeyBjZWxsOiB0aGlzLl9jZWxsc1tyYXdFdmVudC5pbmRleF0uYXBpQ2VsbCwgZG9jdW1lbnQ6IHRoaXMuX2NlbGxzW3Jhd0V2ZW50LmluZGV4XS5hcGlDZWxsLmRvY3VtZW50IH0pO1xuXG5cdFx0XHR9IGVsc2UgaWYgKHJhd0V2ZW50LmtpbmQgPT09IG5vdGVib29rQ29tbW9uLk5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxDb250ZW50KSB7XG5cdFx0XHRcdHJlbGF4ZWRDZWxsQ2hhbmdlcy5wdXNoKHsgY2VsbDogdGhpcy5fY2VsbHNbcmF3RXZlbnQuaW5kZXhdLmFwaUNlbGwsIGRvY3VtZW50OiB0aGlzLl9jZWxsc1tyYXdFdmVudC5pbmRleF0uYXBpQ2VsbC5kb2N1bWVudCB9KTtcblxuXHRcdFx0fSBlbHNlIGlmIChyYXdFdmVudC5raW5kID09PSBub3RlYm9va0NvbW1vbi5Ob3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTWltZSkge1xuXHRcdFx0XHR0aGlzLl9jaGFuZ2VDZWxsTWltZShyYXdFdmVudC5pbmRleCwgcmF3RXZlbnQubWltZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHJhd0V2ZW50LmtpbmQgPT09IG5vdGVib29rQ29tbW9uLk5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxNZXRhZGF0YSkge1xuXHRcdFx0XHR0aGlzLl9jaGFuZ2VDZWxsTWV0YWRhdGEocmF3RXZlbnQuaW5kZXgsIHJhd0V2ZW50Lm1ldGFkYXRhKTtcblx0XHRcdFx0cmVsYXhlZENlbGxDaGFuZ2VzLnB1c2goeyBjZWxsOiB0aGlzLl9jZWxsc1tyYXdFdmVudC5pbmRleF0uYXBpQ2VsbCwgbWV0YWRhdGE6IHRoaXMuX2NlbGxzW3Jhd0V2ZW50LmluZGV4XS5hcGlDZWxsLm1ldGFkYXRhIH0pO1xuXG5cdFx0XHR9IGVsc2UgaWYgKHJhd0V2ZW50LmtpbmQgPT09IG5vdGVib29rQ29tbW9uLk5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxJbnRlcm5hbE1ldGFkYXRhKSB7XG5cdFx0XHRcdHRoaXMuX2NoYW5nZUNlbGxJbnRlcm5hbE1ldGFkYXRhKHJhd0V2ZW50LmluZGV4LCByYXdFdmVudC5pbnRlcm5hbE1ldGFkYXRhKTtcblx0XHRcdFx0cmVsYXhlZENlbGxDaGFuZ2VzLnB1c2goeyBjZWxsOiB0aGlzLl9jZWxsc1tyYXdFdmVudC5pbmRleF0uYXBpQ2VsbCwgZXhlY3V0aW9uU3VtbWFyeTogdGhpcy5fY2VsbHNbcmF3RXZlbnQuaW5kZXhdLmFwaUNlbGwuZXhlY3V0aW9uU3VtbWFyeSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyAtLSBjb21wYWN0IGNlbGxDaGFuZ2VzXG5cblx0XHRjb25zdCBtYXAgPSBuZXcgTWFwPHZzY29kZS5Ob3RlYm9va0NlbGwsIG51bWJlcj4oKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJlbGF4ZWRDZWxsQ2hhbmdlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcmVsYXhlZENlbGxDaGFuZ2UgPSByZWxheGVkQ2VsbENoYW5nZXNbaV07XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IG1hcC5nZXQocmVsYXhlZENlbGxDaGFuZ2UuY2VsbCk7XG5cdFx0XHRpZiAoZXhpc3RpbmcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBuZXdMZW4gPSByZXN1bHQuY2VsbENoYW5nZXMucHVzaCh7XG5cdFx0XHRcdFx0ZG9jdW1lbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRleGVjdXRpb25TdW1tYXJ5OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRvdXRwdXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Li4ucmVsYXhlZENlbGxDaGFuZ2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRtYXAuc2V0KHJlbGF4ZWRDZWxsQ2hhbmdlLmNlbGwsIG5ld0xlbiAtIDEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LmNlbGxDaGFuZ2VzW2V4aXN0aW5nXSA9IHtcblx0XHRcdFx0XHQuLi5yZXN1bHQuY2VsbENoYW5nZXNbZXhpc3RpbmddLFxuXHRcdFx0XHRcdC4uLnJlbGF4ZWRDZWxsQ2hhbmdlXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRnJlZXplIGV2ZW50IHByb3BlcnRpZXMgc28gaGFuZGxlcnMgY2Fubm90IGFjY2lkZW50YWxseSBtb2RpZnkgdGhlbVxuXHRcdE9iamVjdC5mcmVlemUocmVzdWx0KTtcblx0XHRPYmplY3QuZnJlZXplKHJlc3VsdC5jZWxsQ2hhbmdlcyk7XG5cdFx0T2JqZWN0LmZyZWV6ZShyZXN1bHQuY29udGVudENoYW5nZXMpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlSW5kZXgoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aW5kZXggPSBpbmRleCB8IDA7XG5cdFx0aWYgKGluZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fSBlbHNlIGlmIChpbmRleCA+PSB0aGlzLl9jZWxscy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jZWxscy5sZW5ndGggLSAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gaW5kZXg7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVSYW5nZShyYW5nZTogdnNjb2RlLk5vdGVib29rUmFuZ2UpOiB2c2NvZGUuTm90ZWJvb2tSYW5nZSB7XG5cdFx0bGV0IHN0YXJ0ID0gcmFuZ2Uuc3RhcnQgfCAwO1xuXHRcdGxldCBlbmQgPSByYW5nZS5lbmQgfCAwO1xuXHRcdGlmIChzdGFydCA8IDApIHtcblx0XHRcdHN0YXJ0ID0gMDtcblx0XHR9XG5cdFx0aWYgKGVuZCA+IHRoaXMuX2NlbGxzLmxlbmd0aCkge1xuXHRcdFx0ZW5kID0gdGhpcy5fY2VsbHMubGVuZ3RoO1xuXHRcdH1cblx0XHRyZXR1cm4gcmFuZ2Uud2l0aCh7IHN0YXJ0LCBlbmQgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDZWxscyhyYW5nZTogdnNjb2RlLk5vdGVib29rUmFuZ2UpOiBFeHRIb3N0Q2VsbFtdIHtcblx0XHRyYW5nZSA9IHRoaXMuX3ZhbGlkYXRlUmFuZ2UocmFuZ2UpO1xuXHRcdGNvbnN0IHJlc3VsdDogRXh0SG9zdENlbGxbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSByYW5nZS5zdGFydDsgaSA8IHJhbmdlLmVuZDsgaSsrKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh0aGlzLl9jZWxsc1tpXSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zYXZlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignTm90ZWJvb2sgaGFzIGJlZW4gY2xvc2VkJykpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHRyeVNhdmVOb3RlYm9vayh0aGlzLnVyaSk7XG5cdH1cblxuXHRwcml2YXRlIF9zcGxpY2VOb3RlYm9va0NlbGxzKHNwbGljZXM6IG5vdGVib29rQ29tbW9uLk5vdGVib29rQ2VsbFRleHRNb2RlbFNwbGljZTxleHRIb3N0UHJvdG9jb2wuTm90ZWJvb2tDZWxsRHRvPltdLCBpbml0aWFsaXphdGlvbjogYm9vbGVhbiwgYnVja2V0OiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudENvbnRlbnRDaGFuZ2VbXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnRDaGFuZ2VFdmVudHM6IFJhd0NvbnRlbnRDaGFuZ2VFdmVudFtdID0gW107XG5cdFx0Y29uc3QgYWRkZWRDZWxsRG9jdW1lbnRzOiBleHRIb3N0UHJvdG9jb2wuSU1vZGVsQWRkZWREYXRhW10gPSBbXTtcblx0XHRjb25zdCByZW1vdmVkQ2VsbERvY3VtZW50czogVVJJW10gPSBbXTtcblxuXHRcdHNwbGljZXMucmV2ZXJzZSgpLmZvckVhY2goc3BsaWNlID0+IHtcblx0XHRcdGNvbnN0IGNlbGxEdG9zID0gc3BsaWNlWzJdO1xuXHRcdFx0Y29uc3QgbmV3Q2VsbHMgPSBjZWxsRHRvcy5tYXAoY2VsbCA9PiB7XG5cblx0XHRcdFx0Y29uc3QgZXh0Q2VsbCA9IG5ldyBFeHRIb3N0Q2VsbCh0aGlzLCB0aGlzLl90ZXh0RG9jdW1lbnRzQW5kRWRpdG9ycywgY2VsbCk7XG5cdFx0XHRcdGlmICghaW5pdGlhbGl6YXRpb24pIHtcblx0XHRcdFx0XHRhZGRlZENlbGxEb2N1bWVudHMucHVzaChFeHRIb3N0Q2VsbC5hc01vZGVsQWRkRGF0YShjZWxsKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGV4dENlbGw7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlRXZlbnQgPSBuZXcgUmF3Q29udGVudENoYW5nZUV2ZW50KHNwbGljZVswXSwgc3BsaWNlWzFdLCBbXSwgbmV3Q2VsbHMpO1xuXHRcdFx0Y29uc3QgZGVsZXRlZEl0ZW1zID0gdGhpcy5fY2VsbHMuc3BsaWNlKHNwbGljZVswXSwgc3BsaWNlWzFdLCAuLi5uZXdDZWxscyk7XG5cdFx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgZGVsZXRlZEl0ZW1zKSB7XG5cdFx0XHRcdHJlbW92ZWRDZWxsRG9jdW1lbnRzLnB1c2goY2VsbC51cmkpO1xuXHRcdFx0XHRjaGFuZ2VFdmVudC5kZWxldGVkSXRlbXMucHVzaChjZWxsLmFwaUNlbGwpO1xuXHRcdFx0fVxuXHRcdFx0Y29udGVudENoYW5nZUV2ZW50cy5wdXNoKGNoYW5nZUV2ZW50KTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3RleHREb2N1bWVudHNBbmRFZGl0b3JzLmFjY2VwdERvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSh7XG5cdFx0XHRhZGRlZERvY3VtZW50czogYWRkZWRDZWxsRG9jdW1lbnRzLFxuXHRcdFx0cmVtb3ZlZERvY3VtZW50czogcmVtb3ZlZENlbGxEb2N1bWVudHNcblx0XHR9KTtcblxuXHRcdGlmIChidWNrZXQpIHtcblx0XHRcdGZvciAoY29uc3QgY2hhbmdlRXZlbnQgb2YgY29udGVudENoYW5nZUV2ZW50cykge1xuXHRcdFx0XHRidWNrZXQucHVzaChjaGFuZ2VFdmVudC5hc0FwaUV2ZW50KCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX21vdmVDZWxscyhpbmRleDogbnVtYmVyLCBsZW5ndGg6IG51bWJlciwgbmV3SWR4OiBudW1iZXIsIGJ1Y2tldDogdnNjb2RlLk5vdGVib29rRG9jdW1lbnRDb250ZW50Q2hhbmdlW10pOiB2b2lkIHtcblx0XHRjb25zdCBjZWxscyA9IHRoaXMuX2NlbGxzLnNwbGljZShpbmRleCwgbGVuZ3RoKTtcblx0XHR0aGlzLl9jZWxscy5zcGxpY2UobmV3SWR4LCAwLCAuLi5jZWxscyk7XG5cdFx0Y29uc3QgY2hhbmdlcyA9IFtcblx0XHRcdG5ldyBSYXdDb250ZW50Q2hhbmdlRXZlbnQoaW5kZXgsIGxlbmd0aCwgY2VsbHMubWFwKGMgPT4gYy5hcGlDZWxsKSwgW10pLFxuXHRcdFx0bmV3IFJhd0NvbnRlbnRDaGFuZ2VFdmVudChuZXdJZHgsIDAsIFtdLCBjZWxscylcblx0XHRdO1xuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRcdGJ1Y2tldC5wdXNoKGNoYW5nZS5hc0FwaUV2ZW50KCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldENlbGxPdXRwdXRzKGluZGV4OiBudW1iZXIsIG91dHB1dHM6IGV4dEhvc3RQcm90b2NvbC5Ob3RlYm9va091dHB1dER0b1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMuX2NlbGxzW2luZGV4XTtcblx0XHRjZWxsLnNldE91dHB1dHMob3V0cHV0cyk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDZWxsT3V0cHV0SXRlbXMoaW5kZXg6IG51bWJlciwgb3V0cHV0SWQ6IHN0cmluZywgYXBwZW5kOiBib29sZWFuLCBvdXRwdXRJdGVtczogZXh0SG9zdFByb3RvY29sLk5vdGVib29rT3V0cHV0SXRlbUR0b1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMuX2NlbGxzW2luZGV4XTtcblx0XHRjZWxsLnNldE91dHB1dEl0ZW1zKG91dHB1dElkLCBhcHBlbmQsIG91dHB1dEl0ZW1zKTtcblx0fVxuXG5cdHByaXZhdGUgX2NoYW5nZUNlbGxMYW5ndWFnZShpbmRleDogbnVtYmVyLCBuZXdMYW5ndWFnZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjZWxsID0gdGhpcy5fY2VsbHNbaW5kZXhdO1xuXHRcdGlmIChjZWxsLmFwaUNlbGwuZG9jdW1lbnQubGFuZ3VhZ2VJZCAhPT0gbmV3TGFuZ3VhZ2VJZCkge1xuXHRcdFx0dGhpcy5fdGV4dERvY3VtZW50cy4kYWNjZXB0TW9kZWxMYW5ndWFnZUNoYW5nZWQoY2VsbC51cmksIG5ld0xhbmd1YWdlSWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NoYW5nZUNlbGxNaW1lKGluZGV4OiBudW1iZXIsIG5ld01pbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9jZWxsc1tpbmRleF07XG5cdFx0Y2VsbC5hcGlDZWxsLm1pbWUgPSBuZXdNaW1lO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2hhbmdlQ2VsbE1ldGFkYXRhKGluZGV4OiBudW1iZXIsIG5ld01ldGFkYXRhOiBub3RlYm9va0NvbW1vbi5Ob3RlYm9va0NlbGxNZXRhZGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9jZWxsc1tpbmRleF07XG5cdFx0Y2VsbC5zZXRNZXRhZGF0YShuZXdNZXRhZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIF9jaGFuZ2VDZWxsSW50ZXJuYWxNZXRhZGF0YShpbmRleDogbnVtYmVyLCBuZXdJbnRlcm5hbE1ldGFkYXRhOiBub3RlYm9va0NvbW1vbi5Ob3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMuX2NlbGxzW2luZGV4XTtcblx0XHRjZWxsLnNldEludGVybmFsTWV0YWRhdGEobmV3SW50ZXJuYWxNZXRhZGF0YSk7XG5cdH1cblxuXHRnZXRDZWxsRnJvbUFwaUNlbGwoYXBpQ2VsbDogdnNjb2RlLk5vdGVib29rQ2VsbCk6IEV4dEhvc3RDZWxsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2VsbHMuZmluZChjZWxsID0+IGNlbGwuYXBpQ2VsbCA9PT0gYXBpQ2VsbCk7XG5cdH1cblxuXHRnZXRDZWxsRnJvbUluZGV4KGluZGV4OiBudW1iZXIpOiBFeHRIb3N0Q2VsbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NlbGxzW2luZGV4XTtcblx0fVxuXG5cdGdldENlbGwoY2VsbEhhbmRsZTogbnVtYmVyKTogRXh0SG9zdENlbGwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jZWxscy5maW5kKGNlbGwgPT4gY2VsbC5oYW5kbGUgPT09IGNlbGxIYW5kbGUpO1xuXHR9XG5cblx0Z2V0Q2VsbEluZGV4KGNlbGw6IEV4dEhvc3RDZWxsKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY2VsbHMuaW5kZXhPZihjZWxsKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUlwQixZQUFZLDJCQUEyQjtBQUN2QyxTQUFTLHFCQUFxQjtBQUM5QixZQUFZLG9CQUFvQjtBQUVoQyxTQUFTLHdCQUF3QjtBQUVqQyxNQUFNLHNCQUFzQjtBQUFBLEVBRTNCLFlBQ1UsT0FDQSxjQUNBLGNBQ0EsT0FDUjtBQUpRO0FBQ0E7QUFDQTtBQUNBO0FBQUEsRUFDTjtBQUFBLEVBRUosYUFBbUQ7QUFDbEQsV0FBTztBQUFBLE1BQ04sT0FBTyxJQUFJLGNBQWMsS0FBSyxPQUFPLEtBQUssUUFBUSxLQUFLLFlBQVk7QUFB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
