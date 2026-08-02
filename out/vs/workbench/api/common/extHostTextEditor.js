import { ok } from "../../../base/common/assert.js";
import { ReadonlyError, illegalArgument } from "../../../base/common/errors.js";
import { IdGenerator } from "../../../base/common/idGenerator.js";
import * as TypeConverters from "./extHostTypeConverters.js";
import { EndOfLine, Position, Range, Selection, TextEditorRevealType } from "./extHostTypes.js";
const _TextEditorDecorationType = class _TextEditorDecorationType {
  constructor(proxy, extension, options) {
    const key = _TextEditorDecorationType._Keys.nextId();
    proxy.$registerTextEditorDecorationType(extension.identifier, key, TypeConverters.DecorationRenderOptions.from(options));
    this.value = Object.freeze({
      key,
      dispose() {
        proxy.$removeTextEditorDecorationType(key);
      }
    });
  }
};
_TextEditorDecorationType._Keys = new IdGenerator("TextEditorDecorationType");
let TextEditorDecorationType = _TextEditorDecorationType;
class TextEditorEdit {
  constructor(document, options) {
    this._collectedEdits = [];
    this._setEndOfLine = void 0;
    this._finalized = false;
    this._document = document;
    this._documentVersionId = document.version;
    this._undoStopBefore = options.undoStopBefore;
    this._undoStopAfter = options.undoStopAfter;
  }
  finalize() {
    this._finalized = true;
    return {
      documentVersionId: this._documentVersionId,
      edits: this._collectedEdits,
      setEndOfLine: this._setEndOfLine,
      undoStopBefore: this._undoStopBefore,
      undoStopAfter: this._undoStopAfter
    };
  }
  _throwIfFinalized() {
    if (this._finalized) {
      throw new Error("Edit is only valid while callback runs");
    }
  }
  replace(location, value) {
    this._throwIfFinalized();
    let range = null;
    if (location instanceof Position) {
      range = new Range(location, location);
    } else if (location instanceof Range) {
      range = location;
    } else {
      throw new Error("Unrecognized location");
    }
    this._pushEdit(range, value, false);
  }
  insert(location, value) {
    this._throwIfFinalized();
    this._pushEdit(new Range(location, location), value, true);
  }
  delete(location) {
    this._throwIfFinalized();
    let range = null;
    if (location instanceof Range) {
      range = location;
    } else {
      throw new Error("Unrecognized location");
    }
    this._pushEdit(range, null, true);
  }
  _pushEdit(range, text, forceMoveMarkers) {
    const validRange = this._document.validateRange(range);
    this._collectedEdits.push({
      range: validRange,
      text,
      forceMoveMarkers
    });
  }
  setEndOfLine(endOfLine) {
    this._throwIfFinalized();
    if (endOfLine !== EndOfLine.LF && endOfLine !== EndOfLine.CRLF) {
      throw illegalArgument("endOfLine");
    }
    this._setEndOfLine = endOfLine;
  }
}
class ExtHostTextEditorOptions {
  constructor(proxy, id, source, logService) {
    this._proxy = proxy;
    this._id = id;
    this._accept(source);
    this._logService = logService;
    const that = this;
    this.value = {
      get tabSize() {
        return that._tabSize;
      },
      set tabSize(value) {
        that._setTabSize(value);
      },
      get indentSize() {
        return that._indentSize;
      },
      set indentSize(value) {
        that._setIndentSize(value);
      },
      get insertSpaces() {
        return that._insertSpaces;
      },
      set insertSpaces(value) {
        that._setInsertSpaces(value);
      },
      get cursorStyle() {
        return that._cursorStyle;
      },
      set cursorStyle(value) {
        that._setCursorStyle(value);
      },
      get lineNumbers() {
        return that._lineNumbers;
      },
      set lineNumbers(value) {
        that._setLineNumbers(value);
      }
    };
  }
  _accept(source) {
    this._tabSize = source.tabSize;
    this._indentSize = source.indentSize;
    this._originalIndentSize = source.originalIndentSize;
    this._insertSpaces = source.insertSpaces;
    this._cursorStyle = source.cursorStyle;
    this._lineNumbers = TypeConverters.TextEditorLineNumbersStyle.to(source.lineNumbers);
  }
  // --- internal: tabSize
  _validateTabSize(value) {
    if (value === "auto") {
      return "auto";
    }
    if (typeof value === "number") {
      const r = Math.floor(value);
      return r > 0 ? r : null;
    }
    if (typeof value === "string") {
      const r = parseInt(value, 10);
      if (isNaN(r)) {
        return null;
      }
      return r > 0 ? r : null;
    }
    return null;
  }
  _setTabSize(value) {
    const tabSize = this._validateTabSize(value);
    if (tabSize === null) {
      return;
    }
    if (typeof tabSize === "number") {
      if (this._tabSize === tabSize) {
        return;
      }
      this._tabSize = tabSize;
    }
    this._warnOnError("setTabSize", this._proxy.$trySetOptions(this._id, {
      tabSize
    }));
  }
  // --- internal: indentSize
  _validateIndentSize(value) {
    if (value === "tabSize") {
      return "tabSize";
    }
    if (typeof value === "number") {
      const r = Math.floor(value);
      return r > 0 ? r : null;
    }
    if (typeof value === "string") {
      const r = parseInt(value, 10);
      if (isNaN(r)) {
        return null;
      }
      return r > 0 ? r : null;
    }
    return null;
  }
  _setIndentSize(value) {
    const indentSize = this._validateIndentSize(value);
    if (indentSize === null) {
      return;
    }
    if (typeof indentSize === "number") {
      if (this._originalIndentSize === indentSize) {
        return;
      }
      this._indentSize = indentSize;
      this._originalIndentSize = indentSize;
    }
    this._warnOnError("setIndentSize", this._proxy.$trySetOptions(this._id, {
      indentSize
    }));
  }
  // --- internal: insert spaces
  _validateInsertSpaces(value) {
    if (value === "auto") {
      return "auto";
    }
    return value === "false" ? false : Boolean(value);
  }
  _setInsertSpaces(value) {
    const insertSpaces = this._validateInsertSpaces(value);
    if (typeof insertSpaces === "boolean") {
      if (this._insertSpaces === insertSpaces) {
        return;
      }
      this._insertSpaces = insertSpaces;
    }
    this._warnOnError("setInsertSpaces", this._proxy.$trySetOptions(this._id, {
      insertSpaces
    }));
  }
  // --- internal: cursor style
  _setCursorStyle(value) {
    if (this._cursorStyle === value) {
      return;
    }
    this._cursorStyle = value;
    this._warnOnError("setCursorStyle", this._proxy.$trySetOptions(this._id, {
      cursorStyle: value
    }));
  }
  // --- internal: line number
  _setLineNumbers(value) {
    if (this._lineNumbers === value) {
      return;
    }
    this._lineNumbers = value;
    this._warnOnError("setLineNumbers", this._proxy.$trySetOptions(this._id, {
      lineNumbers: TypeConverters.TextEditorLineNumbersStyle.from(value)
    }));
  }
  assign(newOptions) {
    const bulkConfigurationUpdate = {};
    let hasUpdate = false;
    if (typeof newOptions.tabSize !== "undefined") {
      const tabSize = this._validateTabSize(newOptions.tabSize);
      if (tabSize === "auto") {
        hasUpdate = true;
        bulkConfigurationUpdate.tabSize = tabSize;
      } else if (typeof tabSize === "number" && this._tabSize !== tabSize) {
        this._tabSize = tabSize;
        hasUpdate = true;
        bulkConfigurationUpdate.tabSize = tabSize;
      }
    }
    if (typeof newOptions.indentSize !== "undefined") {
      const indentSize = this._validateIndentSize(newOptions.indentSize);
      if (indentSize === "tabSize") {
        hasUpdate = true;
        bulkConfigurationUpdate.indentSize = indentSize;
      } else if (typeof indentSize === "number" && this._originalIndentSize !== indentSize) {
        this._indentSize = indentSize;
        this._originalIndentSize = indentSize;
        hasUpdate = true;
        bulkConfigurationUpdate.indentSize = indentSize;
      }
    }
    if (typeof newOptions.insertSpaces !== "undefined") {
      const insertSpaces = this._validateInsertSpaces(newOptions.insertSpaces);
      if (insertSpaces === "auto") {
        hasUpdate = true;
        bulkConfigurationUpdate.insertSpaces = insertSpaces;
      } else if (this._insertSpaces !== insertSpaces) {
        this._insertSpaces = insertSpaces;
        hasUpdate = true;
        bulkConfigurationUpdate.insertSpaces = insertSpaces;
      }
    }
    if (typeof newOptions.cursorStyle !== "undefined") {
      if (this._cursorStyle !== newOptions.cursorStyle) {
        this._cursorStyle = newOptions.cursorStyle;
        hasUpdate = true;
        bulkConfigurationUpdate.cursorStyle = newOptions.cursorStyle;
      }
    }
    if (typeof newOptions.lineNumbers !== "undefined") {
      if (this._lineNumbers !== newOptions.lineNumbers) {
        this._lineNumbers = newOptions.lineNumbers;
        hasUpdate = true;
        bulkConfigurationUpdate.lineNumbers = TypeConverters.TextEditorLineNumbersStyle.from(newOptions.lineNumbers);
      }
    }
    if (hasUpdate) {
      this._warnOnError("setOptions", this._proxy.$trySetOptions(this._id, bulkConfigurationUpdate));
    }
  }
  _warnOnError(action, promise) {
    promise.catch((err) => {
      this._logService.warn(`ExtHostTextEditorOptions '${action}' failed:'`);
      this._logService.warn(err);
    });
  }
}
class ExtHostTextEditor {
  constructor(id, _proxy, _logService, document, selections, options, visibleRanges, viewColumn) {
    this.id = id;
    this._proxy = _proxy;
    this._logService = _logService;
    this._disposed = false;
    this._hasDecorationsForKey = /* @__PURE__ */ new Set();
    this._selections = selections;
    this._options = new ExtHostTextEditorOptions(this._proxy, this.id, options, _logService);
    this._visibleRanges = visibleRanges;
    this._viewColumn = viewColumn;
    const that = this;
    this.value = Object.freeze({
      get document() {
        return document.value;
      },
      set document(_value) {
        throw new ReadonlyError("document");
      },
      // --- selection
      get selection() {
        return that._selections && that._selections[0];
      },
      set selection(value) {
        if (!(value instanceof Selection)) {
          throw illegalArgument("selection");
        }
        that._selections = [value];
        that._trySetSelection();
      },
      get selections() {
        return that._selections;
      },
      set selections(value) {
        if (!Array.isArray(value) || value.some((a) => !(a instanceof Selection))) {
          throw illegalArgument("selections");
        }
        if (value.length === 0) {
          value = [new Selection(0, 0, 0, 0)];
        }
        that._selections = value;
        that._trySetSelection();
      },
      // --- visible ranges
      get visibleRanges() {
        return that._visibleRanges;
      },
      set visibleRanges(_value) {
        throw new ReadonlyError("visibleRanges");
      },
      get diffInformation() {
        return that._diffInformation;
      },
      // --- options
      get options() {
        return that._options.value;
      },
      set options(value) {
        if (!that._disposed) {
          that._options.assign(value);
        }
      },
      // --- view column
      get viewColumn() {
        return that._viewColumn;
      },
      set viewColumn(_value) {
        throw new ReadonlyError("viewColumn");
      },
      // --- edit
      edit(callback, options2 = { undoStopBefore: true, undoStopAfter: true }) {
        if (that._disposed) {
          return Promise.reject(new Error("TextEditor#edit not possible on closed editors"));
        }
        const edit = new TextEditorEdit(document.value, options2);
        callback(edit);
        return that._applyEdit(edit);
      },
      // --- snippet edit
      insertSnippet(snippet, where, options2 = { undoStopBefore: true, undoStopAfter: true }) {
        if (that._disposed) {
          return Promise.reject(new Error("TextEditor#insertSnippet not possible on closed editors"));
        }
        let ranges;
        if (!where || Array.isArray(where) && where.length === 0) {
          ranges = that._selections.map((range) => TypeConverters.Range.from(range));
        } else if (where instanceof Position) {
          const { lineNumber, column } = TypeConverters.Position.from(where);
          ranges = [{ startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column }];
        } else if (where instanceof Range) {
          ranges = [TypeConverters.Range.from(where)];
        } else {
          ranges = [];
          for (const posOrRange of where) {
            if (posOrRange instanceof Range) {
              ranges.push(TypeConverters.Range.from(posOrRange));
            } else {
              const { lineNumber, column } = TypeConverters.Position.from(posOrRange);
              ranges.push({ startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column });
            }
          }
        }
        if (options2.keepWhitespace === void 0) {
          options2.keepWhitespace = false;
        }
        return _proxy.$tryInsertSnippet(id, document.value.version, snippet.value, ranges, options2);
      },
      setDecorations(decorationType, ranges) {
        const willBeEmpty = ranges.length === 0;
        if (willBeEmpty && !that._hasDecorationsForKey.has(decorationType.key)) {
          return;
        }
        if (willBeEmpty) {
          that._hasDecorationsForKey.delete(decorationType.key);
        } else {
          that._hasDecorationsForKey.add(decorationType.key);
        }
        that._runOnProxy(() => {
          if (TypeConverters.isDecorationOptionsArr(ranges)) {
            return _proxy.$trySetDecorations(
              id,
              decorationType.key,
              TypeConverters.fromRangeOrRangeWithMessage(ranges)
            );
          } else {
            const _ranges = new Array(4 * ranges.length);
            for (let i = 0, len = ranges.length; i < len; i++) {
              const range = ranges[i];
              _ranges[4 * i] = range.start.line + 1;
              _ranges[4 * i + 1] = range.start.character + 1;
              _ranges[4 * i + 2] = range.end.line + 1;
              _ranges[4 * i + 3] = range.end.character + 1;
            }
            return _proxy.$trySetDecorationsFast(
              id,
              decorationType.key,
              _ranges
            );
          }
        });
      },
      revealRange(range, revealType) {
        that._runOnProxy(() => _proxy.$tryRevealRange(
          id,
          TypeConverters.Range.from(range),
          revealType || TextEditorRevealType.Default
        ));
      },
      show(column) {
        _proxy.$tryShowEditor(id, TypeConverters.ViewColumn.from(column));
      },
      hide() {
        _proxy.$tryHideEditor(id);
      },
      [/* @__PURE__ */ Symbol.for("debug.description")]() {
        return `TextEditor(${this.document.uri.toString()})`;
      }
    });
  }
  dispose() {
    ok(!this._disposed);
    this._disposed = true;
  }
  // --- incoming: extension host MUST accept what the renderer says
  _acceptOptions(options) {
    ok(!this._disposed);
    this._options._accept(options);
  }
  _acceptVisibleRanges(value) {
    ok(!this._disposed);
    this._visibleRanges = value;
  }
  _acceptViewColumn(value) {
    ok(!this._disposed);
    this._viewColumn = value;
  }
  _acceptSelections(selections) {
    ok(!this._disposed);
    this._selections = selections;
  }
  _acceptDiffInformation(diffInformation) {
    ok(!this._disposed);
    this._diffInformation = diffInformation;
  }
  async _trySetSelection() {
    const selection = this._selections.map(TypeConverters.Selection.from);
    await this._runOnProxy(() => this._proxy.$trySetSelections(this.id, selection));
    return this.value;
  }
  _applyEdit(editBuilder) {
    const editData = editBuilder.finalize();
    if (editData.edits.length === 0 && !editData.setEndOfLine) {
      return Promise.resolve(true);
    }
    const editRanges = editData.edits.map((edit) => edit.range);
    editRanges.sort((a, b) => {
      if (a.end.line === b.end.line) {
        if (a.end.character === b.end.character) {
          if (a.start.line === b.start.line) {
            return a.start.character - b.start.character;
          }
          return a.start.line - b.start.line;
        }
        return a.end.character - b.end.character;
      }
      return a.end.line - b.end.line;
    });
    for (let i = 0, count = editRanges.length - 1; i < count; i++) {
      const rangeEnd = editRanges[i].end;
      const nextRangeStart = editRanges[i + 1].start;
      if (nextRangeStart.isBefore(rangeEnd)) {
        return Promise.reject(
          new Error("Overlapping ranges are not allowed!")
        );
      }
    }
    const edits = editData.edits.map((edit) => {
      return {
        range: TypeConverters.Range.from(edit.range),
        text: edit.text,
        forceMoveMarkers: edit.forceMoveMarkers
      };
    });
    return this._proxy.$tryApplyEdits(this.id, editData.documentVersionId, edits, {
      setEndOfLine: typeof editData.setEndOfLine === "number" ? TypeConverters.EndOfLine.from(editData.setEndOfLine) : void 0,
      undoStopBefore: editData.undoStopBefore,
      undoStopAfter: editData.undoStopAfter
    });
  }
  _runOnProxy(callback) {
    if (this._disposed) {
      this._logService.warn("TextEditor is closed/disposed");
      return Promise.resolve(void 0);
    }
    return callback().then(() => this, (err) => {
      if (!(err instanceof Error && err.name === "DISPOSED")) {
        this._logService.warn(err);
      }
      return null;
    });
  }
}
export {
  ExtHostTextEditor,
  ExtHostTextEditorOptions,
  TextEditorDecorationType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUZXh0RWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgb2sgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgUmVhZG9ubHlFcnJvciwgaWxsZWdhbEFyZ3VtZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElkR2VuZXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaWRHZW5lcmF0b3IuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXRvckN1cnNvclN0eWxlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yQ29uZmlndXJhdGlvbiwgSVRleHRFZGl0b3JDb25maWd1cmF0aW9uVXBkYXRlLCBNYWluVGhyZWFkVGV4dEVkaXRvcnNTaGFwZSB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgKiBhcyBUeXBlQ29udmVydGVycyBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmUsIFBvc2l0aW9uLCBSYW5nZSwgU2VsZWN0aW9uLCBTbmlwcGV0U3RyaW5nLCBUZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZSwgVGV4dEVkaXRvclJldmVhbFR5cGUgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcblxuZXhwb3J0IGNsYXNzIFRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0tleXMgPSBuZXcgSWRHZW5lcmF0b3IoJ1RleHRFZGl0b3JEZWNvcmF0aW9uVHlwZScpO1xuXG5cdHJlYWRvbmx5IHZhbHVlOiB2c2NvZGUuVGV4dEVkaXRvckRlY29yYXRpb25UeXBlO1xuXG5cdGNvbnN0cnVjdG9yKHByb3h5OiBNYWluVGhyZWFkVGV4dEVkaXRvcnNTaGFwZSwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIG9wdGlvbnM6IHZzY29kZS5EZWNvcmF0aW9uUmVuZGVyT3B0aW9ucykge1xuXHRcdGNvbnN0IGtleSA9IFRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZS5fS2V5cy5uZXh0SWQoKTtcblx0XHRwcm94eS4kcmVnaXN0ZXJUZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGtleSwgVHlwZUNvbnZlcnRlcnMuRGVjb3JhdGlvblJlbmRlck9wdGlvbnMuZnJvbShvcHRpb25zKSk7XG5cdFx0dGhpcy52YWx1ZSA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0a2V5LFxuXHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0cHJveHkuJHJlbW92ZVRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZShrZXkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGV4dEVkaXRPcGVyYXRpb24ge1xuXHRyYW5nZTogdnNjb2RlLlJhbmdlO1xuXHR0ZXh0OiBzdHJpbmcgfCBudWxsO1xuXHRmb3JjZU1vdmVNYXJrZXJzOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0RGF0YSB7XG5cdGRvY3VtZW50VmVyc2lvbklkOiBudW1iZXI7XG5cdGVkaXRzOiBJVGV4dEVkaXRPcGVyYXRpb25bXTtcblx0c2V0RW5kT2ZMaW5lOiBFbmRPZkxpbmUgfCB1bmRlZmluZWQ7XG5cdHVuZG9TdG9wQmVmb3JlOiBib29sZWFuO1xuXHR1bmRvU3RvcEFmdGVyOiBib29sZWFuO1xufVxuXG5jbGFzcyBUZXh0RWRpdG9yRWRpdCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50VmVyc2lvbklkOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VuZG9TdG9wQmVmb3JlOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91bmRvU3RvcEFmdGVyOiBib29sZWFuO1xuXHRwcml2YXRlIF9jb2xsZWN0ZWRFZGl0czogSVRleHRFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0cHJpdmF0ZSBfc2V0RW5kT2ZMaW5lOiBFbmRPZkxpbmUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ZpbmFsaXplZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKGRvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50LCBvcHRpb25zOiB7IHVuZG9TdG9wQmVmb3JlOiBib29sZWFuOyB1bmRvU3RvcEFmdGVyOiBib29sZWFuIH0pIHtcblx0XHR0aGlzLl9kb2N1bWVudCA9IGRvY3VtZW50O1xuXHRcdHRoaXMuX2RvY3VtZW50VmVyc2lvbklkID0gZG9jdW1lbnQudmVyc2lvbjtcblx0XHR0aGlzLl91bmRvU3RvcEJlZm9yZSA9IG9wdGlvbnMudW5kb1N0b3BCZWZvcmU7XG5cdFx0dGhpcy5fdW5kb1N0b3BBZnRlciA9IG9wdGlvbnMudW5kb1N0b3BBZnRlcjtcblx0fVxuXG5cdGZpbmFsaXplKCk6IElFZGl0RGF0YSB7XG5cdFx0dGhpcy5fZmluYWxpemVkID0gdHJ1ZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZG9jdW1lbnRWZXJzaW9uSWQ6IHRoaXMuX2RvY3VtZW50VmVyc2lvbklkLFxuXHRcdFx0ZWRpdHM6IHRoaXMuX2NvbGxlY3RlZEVkaXRzLFxuXHRcdFx0c2V0RW5kT2ZMaW5lOiB0aGlzLl9zZXRFbmRPZkxpbmUsXG5cdFx0XHR1bmRvU3RvcEJlZm9yZTogdGhpcy5fdW5kb1N0b3BCZWZvcmUsXG5cdFx0XHR1bmRvU3RvcEFmdGVyOiB0aGlzLl91bmRvU3RvcEFmdGVyXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3Rocm93SWZGaW5hbGl6ZWQoKSB7XG5cdFx0aWYgKHRoaXMuX2ZpbmFsaXplZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFZGl0IGlzIG9ubHkgdmFsaWQgd2hpbGUgY2FsbGJhY2sgcnVucycpO1xuXHRcdH1cblx0fVxuXG5cdHJlcGxhY2UobG9jYXRpb246IFBvc2l0aW9uIHwgUmFuZ2UgfCBTZWxlY3Rpb24sIHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl90aHJvd0lmRmluYWxpemVkKCk7XG5cdFx0bGV0IHJhbmdlOiBSYW5nZSB8IG51bGwgPSBudWxsO1xuXG5cdFx0aWYgKGxvY2F0aW9uIGluc3RhbmNlb2YgUG9zaXRpb24pIHtcblx0XHRcdHJhbmdlID0gbmV3IFJhbmdlKGxvY2F0aW9uLCBsb2NhdGlvbik7XG5cdFx0fSBlbHNlIGlmIChsb2NhdGlvbiBpbnN0YW5jZW9mIFJhbmdlKSB7XG5cdFx0XHRyYW5nZSA9IGxvY2F0aW9uO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VucmVjb2duaXplZCBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3B1c2hFZGl0KHJhbmdlLCB2YWx1ZSwgZmFsc2UpO1xuXHR9XG5cblx0aW5zZXJ0KGxvY2F0aW9uOiBQb3NpdGlvbiwgdmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3Rocm93SWZGaW5hbGl6ZWQoKTtcblx0XHR0aGlzLl9wdXNoRWRpdChuZXcgUmFuZ2UobG9jYXRpb24sIGxvY2F0aW9uKSwgdmFsdWUsIHRydWUpO1xuXHR9XG5cblx0ZGVsZXRlKGxvY2F0aW9uOiBSYW5nZSB8IFNlbGVjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX3Rocm93SWZGaW5hbGl6ZWQoKTtcblx0XHRsZXQgcmFuZ2U6IFJhbmdlIHwgbnVsbCA9IG51bGw7XG5cblx0XHRpZiAobG9jYXRpb24gaW5zdGFuY2VvZiBSYW5nZSkge1xuXHRcdFx0cmFuZ2UgPSBsb2NhdGlvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbnJlY29nbml6ZWQgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHR0aGlzLl9wdXNoRWRpdChyYW5nZSwgbnVsbCwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9wdXNoRWRpdChyYW5nZTogUmFuZ2UsIHRleHQ6IHN0cmluZyB8IG51bGwsIGZvcmNlTW92ZU1hcmtlcnM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCB2YWxpZFJhbmdlID0gdGhpcy5fZG9jdW1lbnQudmFsaWRhdGVSYW5nZShyYW5nZSk7XG5cdFx0dGhpcy5fY29sbGVjdGVkRWRpdHMucHVzaCh7XG5cdFx0XHRyYW5nZTogdmFsaWRSYW5nZSxcblx0XHRcdHRleHQ6IHRleHQsXG5cdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiBmb3JjZU1vdmVNYXJrZXJzXG5cdFx0fSk7XG5cdH1cblxuXHRzZXRFbmRPZkxpbmUoZW5kT2ZMaW5lOiBFbmRPZkxpbmUpOiB2b2lkIHtcblx0XHR0aGlzLl90aHJvd0lmRmluYWxpemVkKCk7XG5cdFx0aWYgKGVuZE9mTGluZSAhPT0gRW5kT2ZMaW5lLkxGICYmIGVuZE9mTGluZSAhPT0gRW5kT2ZMaW5lLkNSTEYpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnZW5kT2ZMaW5lJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2V0RW5kT2ZMaW5lID0gZW5kT2ZMaW5lO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0VGV4dEVkaXRvck9wdGlvbnMge1xuXG5cdHByaXZhdGUgX3Byb3h5OiBNYWluVGhyZWFkVGV4dEVkaXRvcnNTaGFwZTtcblx0cHJpdmF0ZSBfaWQ6IHN0cmluZztcblx0cHJpdmF0ZSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG5cblx0cHJpdmF0ZSBfdGFiU2l6ZSE6IG51bWJlcjtcblx0cHJpdmF0ZSBfaW5kZW50U2l6ZSE6IG51bWJlcjtcblx0cHJpdmF0ZSBfb3JpZ2luYWxJbmRlbnRTaXplITogbnVtYmVyIHwgJ3RhYlNpemUnO1xuXHRwcml2YXRlIF9pbnNlcnRTcGFjZXMhOiBib29sZWFuO1xuXHRwcml2YXRlIF9jdXJzb3JTdHlsZSE6IFRleHRFZGl0b3JDdXJzb3JTdHlsZTtcblx0cHJpdmF0ZSBfbGluZU51bWJlcnMhOiBUZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZTtcblxuXHRyZWFkb25seSB2YWx1ZTogdnNjb2RlLlRleHRFZGl0b3JPcHRpb25zO1xuXG5cdGNvbnN0cnVjdG9yKHByb3h5OiBNYWluVGhyZWFkVGV4dEVkaXRvcnNTaGFwZSwgaWQ6IHN0cmluZywgc291cmNlOiBJUmVzb2x2ZWRUZXh0RWRpdG9yQ29uZmlndXJhdGlvbiwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpIHtcblx0XHR0aGlzLl9wcm94eSA9IHByb3h5O1xuXHRcdHRoaXMuX2lkID0gaWQ7XG5cdFx0dGhpcy5fYWNjZXB0KHNvdXJjZSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZSA9IGxvZ1NlcnZpY2U7XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdHRoaXMudmFsdWUgPSB7XG5cdFx0XHRnZXQgdGFiU2l6ZSgpOiBudW1iZXIgfCBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fdGFiU2l6ZTtcblx0XHRcdH0sXG5cdFx0XHRzZXQgdGFiU2l6ZSh2YWx1ZTogbnVtYmVyIHwgc3RyaW5nKSB7XG5cdFx0XHRcdHRoYXQuX3NldFRhYlNpemUodmFsdWUpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBpbmRlbnRTaXplKCk6IG51bWJlciB8IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9pbmRlbnRTaXplO1xuXHRcdFx0fSxcblx0XHRcdHNldCBpbmRlbnRTaXplKHZhbHVlOiBudW1iZXIgfCBzdHJpbmcpIHtcblx0XHRcdFx0dGhhdC5fc2V0SW5kZW50U2l6ZSh2YWx1ZSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGluc2VydFNwYWNlcygpOiBib29sZWFuIHwgc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX2luc2VydFNwYWNlcztcblx0XHRcdH0sXG5cdFx0XHRzZXQgaW5zZXJ0U3BhY2VzKHZhbHVlOiBib29sZWFuIHwgc3RyaW5nKSB7XG5cdFx0XHRcdHRoYXQuX3NldEluc2VydFNwYWNlcyh2YWx1ZSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGN1cnNvclN0eWxlKCk6IFRleHRFZGl0b3JDdXJzb3JTdHlsZSB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9jdXJzb3JTdHlsZTtcblx0XHRcdH0sXG5cdFx0XHRzZXQgY3Vyc29yU3R5bGUodmFsdWU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZSkge1xuXHRcdFx0XHR0aGF0Ll9zZXRDdXJzb3JTdHlsZSh2YWx1ZSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGxpbmVOdW1iZXJzKCk6IFRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX2xpbmVOdW1iZXJzO1xuXHRcdFx0fSxcblx0XHRcdHNldCBsaW5lTnVtYmVycyh2YWx1ZTogVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUpIHtcblx0XHRcdFx0dGhhdC5fc2V0TGluZU51bWJlcnModmFsdWUpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgX2FjY2VwdChzb3VyY2U6IElSZXNvbHZlZFRleHRFZGl0b3JDb25maWd1cmF0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fdGFiU2l6ZSA9IHNvdXJjZS50YWJTaXplO1xuXHRcdHRoaXMuX2luZGVudFNpemUgPSBzb3VyY2UuaW5kZW50U2l6ZTtcblx0XHR0aGlzLl9vcmlnaW5hbEluZGVudFNpemUgPSBzb3VyY2Uub3JpZ2luYWxJbmRlbnRTaXplO1xuXHRcdHRoaXMuX2luc2VydFNwYWNlcyA9IHNvdXJjZS5pbnNlcnRTcGFjZXM7XG5cdFx0dGhpcy5fY3Vyc29yU3R5bGUgPSBzb3VyY2UuY3Vyc29yU3R5bGU7XG5cdFx0dGhpcy5fbGluZU51bWJlcnMgPSBUeXBlQ29udmVydGVycy5UZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZS50byhzb3VyY2UubGluZU51bWJlcnMpO1xuXHR9XG5cblx0Ly8gLS0tIGludGVybmFsOiB0YWJTaXplXG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVUYWJTaXplKHZhbHVlOiBudW1iZXIgfCBzdHJpbmcpOiBudW1iZXIgfCAnYXV0bycgfCBudWxsIHtcblx0XHRpZiAodmFsdWUgPT09ICdhdXRvJykge1xuXHRcdFx0cmV0dXJuICdhdXRvJztcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnN0IHIgPSBNYXRoLmZsb29yKHZhbHVlKTtcblx0XHRcdHJldHVybiAociA+IDAgPyByIDogbnVsbCk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCByID0gcGFyc2VJbnQodmFsdWUsIDEwKTtcblx0XHRcdGlmIChpc05hTihyKSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiAociA+IDAgPyByIDogbnVsbCk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0VGFiU2l6ZSh2YWx1ZTogbnVtYmVyIHwgc3RyaW5nKSB7XG5cdFx0Y29uc3QgdGFiU2l6ZSA9IHRoaXMuX3ZhbGlkYXRlVGFiU2l6ZSh2YWx1ZSk7XG5cdFx0aWYgKHRhYlNpemUgPT09IG51bGwpIHtcblx0XHRcdC8vIGlnbm9yZSBpbnZhbGlkIGNhbGxcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiB0YWJTaXplID09PSAnbnVtYmVyJykge1xuXHRcdFx0aWYgKHRoaXMuX3RhYlNpemUgPT09IHRhYlNpemUpIHtcblx0XHRcdFx0Ly8gbm90aGluZyB0byBkb1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyByZWZsZWN0IHRoZSBuZXcgdGFiU2l6ZSB2YWx1ZSBpbW1lZGlhdGVseVxuXHRcdFx0dGhpcy5fdGFiU2l6ZSA9IHRhYlNpemU7XG5cdFx0fVxuXHRcdHRoaXMuX3dhcm5PbkVycm9yKCdzZXRUYWJTaXplJywgdGhpcy5fcHJveHkuJHRyeVNldE9wdGlvbnModGhpcy5faWQsIHtcblx0XHRcdHRhYlNpemU6IHRhYlNpemVcblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gaW50ZXJuYWw6IGluZGVudFNpemVcblxuXHRwcml2YXRlIF92YWxpZGF0ZUluZGVudFNpemUodmFsdWU6IG51bWJlciB8IHN0cmluZyk6IG51bWJlciB8ICd0YWJTaXplJyB8IG51bGwge1xuXHRcdGlmICh2YWx1ZSA9PT0gJ3RhYlNpemUnKSB7XG5cdFx0XHRyZXR1cm4gJ3RhYlNpemUnO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgciA9IE1hdGguZmxvb3IodmFsdWUpO1xuXHRcdFx0cmV0dXJuIChyID4gMCA/IHIgOiBudWxsKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0IHIgPSBwYXJzZUludCh2YWx1ZSwgMTApO1xuXHRcdFx0aWYgKGlzTmFOKHIpKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIChyID4gMCA/IHIgOiBudWxsKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRJbmRlbnRTaXplKHZhbHVlOiBudW1iZXIgfCBzdHJpbmcpIHtcblx0XHRjb25zdCBpbmRlbnRTaXplID0gdGhpcy5fdmFsaWRhdGVJbmRlbnRTaXplKHZhbHVlKTtcblx0XHRpZiAoaW5kZW50U2l6ZSA9PT0gbnVsbCkge1xuXHRcdFx0Ly8gaWdub3JlIGludmFsaWQgY2FsbFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGluZGVudFNpemUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRpZiAodGhpcy5fb3JpZ2luYWxJbmRlbnRTaXplID09PSBpbmRlbnRTaXplKSB7XG5cdFx0XHRcdC8vIG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gcmVmbGVjdCB0aGUgbmV3IGluZGVudFNpemUgdmFsdWUgaW1tZWRpYXRlbHlcblx0XHRcdHRoaXMuX2luZGVudFNpemUgPSBpbmRlbnRTaXplO1xuXHRcdFx0dGhpcy5fb3JpZ2luYWxJbmRlbnRTaXplID0gaW5kZW50U2l6ZTtcblx0XHR9XG5cdFx0dGhpcy5fd2Fybk9uRXJyb3IoJ3NldEluZGVudFNpemUnLCB0aGlzLl9wcm94eS4kdHJ5U2V0T3B0aW9ucyh0aGlzLl9pZCwge1xuXHRcdFx0aW5kZW50U2l6ZTogaW5kZW50U2l6ZVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLSBpbnRlcm5hbDogaW5zZXJ0IHNwYWNlc1xuXG5cdHByaXZhdGUgX3ZhbGlkYXRlSW5zZXJ0U3BhY2VzKHZhbHVlOiBib29sZWFuIHwgc3RyaW5nKTogYm9vbGVhbiB8ICdhdXRvJyB7XG5cdFx0aWYgKHZhbHVlID09PSAnYXV0bycpIHtcblx0XHRcdHJldHVybiAnYXV0byc7XG5cdFx0fVxuXHRcdHJldHVybiAodmFsdWUgPT09ICdmYWxzZScgPyBmYWxzZSA6IEJvb2xlYW4odmFsdWUpKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEluc2VydFNwYWNlcyh2YWx1ZTogYm9vbGVhbiB8IHN0cmluZykge1xuXHRcdGNvbnN0IGluc2VydFNwYWNlcyA9IHRoaXMuX3ZhbGlkYXRlSW5zZXJ0U3BhY2VzKHZhbHVlKTtcblx0XHRpZiAodHlwZW9mIGluc2VydFNwYWNlcyA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRpZiAodGhpcy5faW5zZXJ0U3BhY2VzID09PSBpbnNlcnRTcGFjZXMpIHtcblx0XHRcdFx0Ly8gbm90aGluZyB0byBkb1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyByZWZsZWN0IHRoZSBuZXcgaW5zZXJ0U3BhY2VzIHZhbHVlIGltbWVkaWF0ZWx5XG5cdFx0XHR0aGlzLl9pbnNlcnRTcGFjZXMgPSBpbnNlcnRTcGFjZXM7XG5cdFx0fVxuXHRcdHRoaXMuX3dhcm5PbkVycm9yKCdzZXRJbnNlcnRTcGFjZXMnLCB0aGlzLl9wcm94eS4kdHJ5U2V0T3B0aW9ucyh0aGlzLl9pZCwge1xuXHRcdFx0aW5zZXJ0U3BhY2VzOiBpbnNlcnRTcGFjZXNcblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gaW50ZXJuYWw6IGN1cnNvciBzdHlsZVxuXG5cdHByaXZhdGUgX3NldEN1cnNvclN0eWxlKHZhbHVlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUpIHtcblx0XHRpZiAodGhpcy5fY3Vyc29yU3R5bGUgPT09IHZhbHVlKSB7XG5cdFx0XHQvLyBub3RoaW5nIHRvIGRvXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnNvclN0eWxlID0gdmFsdWU7XG5cdFx0dGhpcy5fd2Fybk9uRXJyb3IoJ3NldEN1cnNvclN0eWxlJywgdGhpcy5fcHJveHkuJHRyeVNldE9wdGlvbnModGhpcy5faWQsIHtcblx0XHRcdGN1cnNvclN0eWxlOiB2YWx1ZVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLSBpbnRlcm5hbDogbGluZSBudW1iZXJcblxuXHRwcml2YXRlIF9zZXRMaW5lTnVtYmVycyh2YWx1ZTogVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUpIHtcblx0XHRpZiAodGhpcy5fbGluZU51bWJlcnMgPT09IHZhbHVlKSB7XG5cdFx0XHQvLyBub3RoaW5nIHRvIGRvXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xpbmVOdW1iZXJzID0gdmFsdWU7XG5cdFx0dGhpcy5fd2Fybk9uRXJyb3IoJ3NldExpbmVOdW1iZXJzJywgdGhpcy5fcHJveHkuJHRyeVNldE9wdGlvbnModGhpcy5faWQsIHtcblx0XHRcdGxpbmVOdW1iZXJzOiBUeXBlQ29udmVydGVycy5UZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZS5mcm9tKHZhbHVlKVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBhc3NpZ24obmV3T3B0aW9uczogdnNjb2RlLlRleHRFZGl0b3JPcHRpb25zKSB7XG5cdFx0Y29uc3QgYnVsa0NvbmZpZ3VyYXRpb25VcGRhdGU6IElUZXh0RWRpdG9yQ29uZmlndXJhdGlvblVwZGF0ZSA9IHt9O1xuXHRcdGxldCBoYXNVcGRhdGUgPSBmYWxzZTtcblxuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy50YWJTaXplICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Y29uc3QgdGFiU2l6ZSA9IHRoaXMuX3ZhbGlkYXRlVGFiU2l6ZShuZXdPcHRpb25zLnRhYlNpemUpO1xuXHRcdFx0aWYgKHRhYlNpemUgPT09ICdhdXRvJykge1xuXHRcdFx0XHRoYXNVcGRhdGUgPSB0cnVlO1xuXHRcdFx0XHRidWxrQ29uZmlndXJhdGlvblVwZGF0ZS50YWJTaXplID0gdGFiU2l6ZTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHRhYlNpemUgPT09ICdudW1iZXInICYmIHRoaXMuX3RhYlNpemUgIT09IHRhYlNpemUpIHtcblx0XHRcdFx0Ly8gcmVmbGVjdCB0aGUgbmV3IHRhYlNpemUgdmFsdWUgaW1tZWRpYXRlbHlcblx0XHRcdFx0dGhpcy5fdGFiU2l6ZSA9IHRhYlNpemU7XG5cdFx0XHRcdGhhc1VwZGF0ZSA9IHRydWU7XG5cdFx0XHRcdGJ1bGtDb25maWd1cmF0aW9uVXBkYXRlLnRhYlNpemUgPSB0YWJTaXplO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy5pbmRlbnRTaXplICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Y29uc3QgaW5kZW50U2l6ZSA9IHRoaXMuX3ZhbGlkYXRlSW5kZW50U2l6ZShuZXdPcHRpb25zLmluZGVudFNpemUpO1xuXHRcdFx0aWYgKGluZGVudFNpemUgPT09ICd0YWJTaXplJykge1xuXHRcdFx0XHRoYXNVcGRhdGUgPSB0cnVlO1xuXHRcdFx0XHRidWxrQ29uZmlndXJhdGlvblVwZGF0ZS5pbmRlbnRTaXplID0gaW5kZW50U2l6ZTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGluZGVudFNpemUgPT09ICdudW1iZXInICYmIHRoaXMuX29yaWdpbmFsSW5kZW50U2l6ZSAhPT0gaW5kZW50U2l6ZSkge1xuXHRcdFx0XHQvLyByZWZsZWN0IHRoZSBuZXcgaW5kZW50U2l6ZSB2YWx1ZSBpbW1lZGlhdGVseVxuXHRcdFx0XHR0aGlzLl9pbmRlbnRTaXplID0gaW5kZW50U2l6ZTtcblx0XHRcdFx0dGhpcy5fb3JpZ2luYWxJbmRlbnRTaXplID0gaW5kZW50U2l6ZTtcblx0XHRcdFx0aGFzVXBkYXRlID0gdHJ1ZTtcblx0XHRcdFx0YnVsa0NvbmZpZ3VyYXRpb25VcGRhdGUuaW5kZW50U2l6ZSA9IGluZGVudFNpemU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBuZXdPcHRpb25zLmluc2VydFNwYWNlcyAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGNvbnN0IGluc2VydFNwYWNlcyA9IHRoaXMuX3ZhbGlkYXRlSW5zZXJ0U3BhY2VzKG5ld09wdGlvbnMuaW5zZXJ0U3BhY2VzKTtcblx0XHRcdGlmIChpbnNlcnRTcGFjZXMgPT09ICdhdXRvJykge1xuXHRcdFx0XHRoYXNVcGRhdGUgPSB0cnVlO1xuXHRcdFx0XHRidWxrQ29uZmlndXJhdGlvblVwZGF0ZS5pbnNlcnRTcGFjZXMgPSBpbnNlcnRTcGFjZXM7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2luc2VydFNwYWNlcyAhPT0gaW5zZXJ0U3BhY2VzKSB7XG5cdFx0XHRcdC8vIHJlZmxlY3QgdGhlIG5ldyBpbnNlcnRTcGFjZXMgdmFsdWUgaW1tZWRpYXRlbHlcblx0XHRcdFx0dGhpcy5faW5zZXJ0U3BhY2VzID0gaW5zZXJ0U3BhY2VzO1xuXHRcdFx0XHRoYXNVcGRhdGUgPSB0cnVlO1xuXHRcdFx0XHRidWxrQ29uZmlndXJhdGlvblVwZGF0ZS5pbnNlcnRTcGFjZXMgPSBpbnNlcnRTcGFjZXM7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBuZXdPcHRpb25zLmN1cnNvclN0eWxlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0aWYgKHRoaXMuX2N1cnNvclN0eWxlICE9PSBuZXdPcHRpb25zLmN1cnNvclN0eWxlKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnNvclN0eWxlID0gbmV3T3B0aW9ucy5jdXJzb3JTdHlsZTtcblx0XHRcdFx0aGFzVXBkYXRlID0gdHJ1ZTtcblx0XHRcdFx0YnVsa0NvbmZpZ3VyYXRpb25VcGRhdGUuY3Vyc29yU3R5bGUgPSBuZXdPcHRpb25zLmN1cnNvclN0eWxlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy5saW5lTnVtYmVycyAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGlmICh0aGlzLl9saW5lTnVtYmVycyAhPT0gbmV3T3B0aW9ucy5saW5lTnVtYmVycykge1xuXHRcdFx0XHR0aGlzLl9saW5lTnVtYmVycyA9IG5ld09wdGlvbnMubGluZU51bWJlcnM7XG5cdFx0XHRcdGhhc1VwZGF0ZSA9IHRydWU7XG5cdFx0XHRcdGJ1bGtDb25maWd1cmF0aW9uVXBkYXRlLmxpbmVOdW1iZXJzID0gVHlwZUNvbnZlcnRlcnMuVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUuZnJvbShuZXdPcHRpb25zLmxpbmVOdW1iZXJzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaGFzVXBkYXRlKSB7XG5cdFx0XHR0aGlzLl93YXJuT25FcnJvcignc2V0T3B0aW9ucycsIHRoaXMuX3Byb3h5LiR0cnlTZXRPcHRpb25zKHRoaXMuX2lkLCBidWxrQ29uZmlndXJhdGlvblVwZGF0ZSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dhcm5PbkVycm9yKGFjdGlvbjogc3RyaW5nLCBwcm9taXNlOiBQcm9taXNlPGFueT4pOiB2b2lkIHtcblx0XHRwcm9taXNlLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYEV4dEhvc3RUZXh0RWRpdG9yT3B0aW9ucyAnJHthY3Rpb259JyBmYWlsZWQ6J2ApO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGVycik7XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RUZXh0RWRpdG9yIHtcblxuXHRwcml2YXRlIF9zZWxlY3Rpb25zOiBTZWxlY3Rpb25bXTtcblx0cHJpdmF0ZSBfb3B0aW9uczogRXh0SG9zdFRleHRFZGl0b3JPcHRpb25zO1xuXHRwcml2YXRlIF92aXNpYmxlUmFuZ2VzOiBSYW5nZVtdO1xuXHRwcml2YXRlIF92aWV3Q29sdW1uOiB2c2NvZGUuVmlld0NvbHVtbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlzcG9zZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfaGFzRGVjb3JhdGlvbnNGb3JLZXkgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSBfZGlmZkluZm9ybWF0aW9uOiB2c2NvZGUuVGV4dEVkaXRvckRpZmZJbmZvcm1hdGlvbltdIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHZhbHVlOiB2c2NvZGUuVGV4dEVkaXRvcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBpZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkVGV4dEVkaXRvcnNTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRkb2N1bWVudDogTGF6eTx2c2NvZGUuVGV4dERvY3VtZW50Pixcblx0XHRzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSwgb3B0aW9uczogSVJlc29sdmVkVGV4dEVkaXRvckNvbmZpZ3VyYXRpb24sXG5cdFx0dmlzaWJsZVJhbmdlczogUmFuZ2VbXSwgdmlld0NvbHVtbjogdnNjb2RlLlZpZXdDb2x1bW4gfCB1bmRlZmluZWRcblx0KSB7XG5cdFx0dGhpcy5fc2VsZWN0aW9ucyA9IHNlbGVjdGlvbnM7XG5cdFx0dGhpcy5fb3B0aW9ucyA9IG5ldyBFeHRIb3N0VGV4dEVkaXRvck9wdGlvbnModGhpcy5fcHJveHksIHRoaXMuaWQsIG9wdGlvbnMsIF9sb2dTZXJ2aWNlKTtcblx0XHR0aGlzLl92aXNpYmxlUmFuZ2VzID0gdmlzaWJsZVJhbmdlcztcblx0XHR0aGlzLl92aWV3Q29sdW1uID0gdmlld0NvbHVtbjtcblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXG5cdFx0dGhpcy52YWx1ZSA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0Z2V0IGRvY3VtZW50KCk6IHZzY29kZS5UZXh0RG9jdW1lbnQge1xuXHRcdFx0XHRyZXR1cm4gZG9jdW1lbnQudmFsdWU7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGRvY3VtZW50KF92YWx1ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUmVhZG9ubHlFcnJvcignZG9jdW1lbnQnKTtcblx0XHRcdH0sXG5cdFx0XHQvLyAtLS0gc2VsZWN0aW9uXG5cdFx0XHRnZXQgc2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9zZWxlY3Rpb25zICYmIHRoYXQuX3NlbGVjdGlvbnNbMF07XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHNlbGVjdGlvbih2YWx1ZTogU2VsZWN0aW9uKSB7XG5cdFx0XHRcdGlmICghKHZhbHVlIGluc3RhbmNlb2YgU2VsZWN0aW9uKSkge1xuXHRcdFx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnc2VsZWN0aW9uJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhhdC5fc2VsZWN0aW9ucyA9IFt2YWx1ZV07XG5cdFx0XHRcdHRoYXQuX3RyeVNldFNlbGVjdGlvbigpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBzZWxlY3Rpb25zKCk6IFNlbGVjdGlvbltdIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX3NlbGVjdGlvbnM7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHNlbGVjdGlvbnModmFsdWU6IFNlbGVjdGlvbltdKSB7XG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkgfHwgdmFsdWUuc29tZShhID0+ICEoYSBpbnN0YW5jZW9mIFNlbGVjdGlvbikpKSB7XG5cdFx0XHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdzZWxlY3Rpb25zJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHZhbHVlID0gW25ldyBTZWxlY3Rpb24oMCwgMCwgMCwgMCldO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoYXQuX3NlbGVjdGlvbnMgPSB2YWx1ZTtcblx0XHRcdFx0dGhhdC5fdHJ5U2V0U2VsZWN0aW9uKCk7XG5cdFx0XHR9LFxuXHRcdFx0Ly8gLS0tIHZpc2libGUgcmFuZ2VzXG5cdFx0XHRnZXQgdmlzaWJsZVJhbmdlcygpOiBSYW5nZVtdIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX3Zpc2libGVSYW5nZXM7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHZpc2libGVSYW5nZXMoX3ZhbHVlOiBSYW5nZVtdKSB7XG5cdFx0XHRcdHRocm93IG5ldyBSZWFkb25seUVycm9yKCd2aXNpYmxlUmFuZ2VzJyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGRpZmZJbmZvcm1hdGlvbigpIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX2RpZmZJbmZvcm1hdGlvbjtcblx0XHRcdH0sXG5cdFx0XHQvLyAtLS0gb3B0aW9uc1xuXHRcdFx0Z2V0IG9wdGlvbnMoKTogdnNjb2RlLlRleHRFZGl0b3JPcHRpb25zIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX29wdGlvbnMudmFsdWU7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IG9wdGlvbnModmFsdWU6IHZzY29kZS5UZXh0RWRpdG9yT3B0aW9ucykge1xuXHRcdFx0XHRpZiAoIXRoYXQuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0dGhhdC5fb3B0aW9ucy5hc3NpZ24odmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Ly8gLS0tIHZpZXcgY29sdW1uXG5cdFx0XHRnZXQgdmlld0NvbHVtbigpOiB2c2NvZGUuVmlld0NvbHVtbiB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll92aWV3Q29sdW1uO1xuXHRcdFx0fSxcblx0XHRcdHNldCB2aWV3Q29sdW1uKF92YWx1ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUmVhZG9ubHlFcnJvcigndmlld0NvbHVtbicpO1xuXHRcdFx0fSxcblx0XHRcdC8vIC0tLSBlZGl0XG5cdFx0XHRlZGl0KGNhbGxiYWNrOiAoZWRpdDogVGV4dEVkaXRvckVkaXQpID0+IHZvaWQsIG9wdGlvbnM6IHsgdW5kb1N0b3BCZWZvcmU6IGJvb2xlYW47IHVuZG9TdG9wQWZ0ZXI6IGJvb2xlYW4gfSA9IHsgdW5kb1N0b3BCZWZvcmU6IHRydWUsIHVuZG9TdG9wQWZ0ZXI6IHRydWUgfSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdFx0XHRpZiAodGhhdC5fZGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdUZXh0RWRpdG9yI2VkaXQgbm90IHBvc3NpYmxlIG9uIGNsb3NlZCBlZGl0b3JzJykpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVkaXQgPSBuZXcgVGV4dEVkaXRvckVkaXQoZG9jdW1lbnQudmFsdWUsIG9wdGlvbnMpO1xuXHRcdFx0XHRjYWxsYmFjayhlZGl0KTtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX2FwcGx5RWRpdChlZGl0KTtcblx0XHRcdH0sXG5cdFx0XHQvLyAtLS0gc25pcHBldCBlZGl0XG5cdFx0XHRpbnNlcnRTbmlwcGV0KHNuaXBwZXQ6IFNuaXBwZXRTdHJpbmcsIHdoZXJlPzogUG9zaXRpb24gfCByZWFkb25seSBQb3NpdGlvbltdIHwgUmFuZ2UgfCByZWFkb25seSBSYW5nZVtdLCBvcHRpb25zOiB7IHVuZG9TdG9wQmVmb3JlOiBib29sZWFuOyB1bmRvU3RvcEFmdGVyOiBib29sZWFuOyBrZWVwV2hpdGVzcGFjZT86IGJvb2xlYW4gfSA9IHsgdW5kb1N0b3BCZWZvcmU6IHRydWUsIHVuZG9TdG9wQWZ0ZXI6IHRydWUgfSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdFx0XHRpZiAodGhhdC5fZGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdUZXh0RWRpdG9yI2luc2VydFNuaXBwZXQgbm90IHBvc3NpYmxlIG9uIGNsb3NlZCBlZGl0b3JzJykpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCByYW5nZXM6IElSYW5nZVtdO1xuXG5cdFx0XHRcdGlmICghd2hlcmUgfHwgKEFycmF5LmlzQXJyYXkod2hlcmUpICYmIHdoZXJlLmxlbmd0aCA9PT0gMCkpIHtcblx0XHRcdFx0XHRyYW5nZXMgPSB0aGF0Ll9zZWxlY3Rpb25zLm1hcChyYW5nZSA9PiBUeXBlQ29udmVydGVycy5SYW5nZS5mcm9tKHJhbmdlKSk7XG5cblx0XHRcdFx0fSBlbHNlIGlmICh3aGVyZSBpbnN0YW5jZW9mIFBvc2l0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBsaW5lTnVtYmVyLCBjb2x1bW4gfSA9IFR5cGVDb252ZXJ0ZXJzLlBvc2l0aW9uLmZyb20od2hlcmUpO1xuXHRcdFx0XHRcdHJhbmdlcyA9IFt7IHN0YXJ0TGluZU51bWJlcjogbGluZU51bWJlciwgc3RhcnRDb2x1bW46IGNvbHVtbiwgZW5kTGluZU51bWJlcjogbGluZU51bWJlciwgZW5kQ29sdW1uOiBjb2x1bW4gfV07XG5cblx0XHRcdFx0fSBlbHNlIGlmICh3aGVyZSBpbnN0YW5jZW9mIFJhbmdlKSB7XG5cdFx0XHRcdFx0cmFuZ2VzID0gW1R5cGVDb252ZXJ0ZXJzLlJhbmdlLmZyb20od2hlcmUpXTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyYW5nZXMgPSBbXTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHBvc09yUmFuZ2Ugb2Ygd2hlcmUpIHtcblx0XHRcdFx0XHRcdGlmIChwb3NPclJhbmdlIGluc3RhbmNlb2YgUmFuZ2UpIHtcblx0XHRcdFx0XHRcdFx0cmFuZ2VzLnB1c2goVHlwZUNvbnZlcnRlcnMuUmFuZ2UuZnJvbShwb3NPclJhbmdlKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB7IGxpbmVOdW1iZXIsIGNvbHVtbiB9ID0gVHlwZUNvbnZlcnRlcnMuUG9zaXRpb24uZnJvbShwb3NPclJhbmdlKTtcblx0XHRcdFx0XHRcdFx0cmFuZ2VzLnB1c2goeyBzdGFydExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiBjb2x1bW4sIGVuZExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsIGVuZENvbHVtbjogY29sdW1uIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3B0aW9ucy5rZWVwV2hpdGVzcGFjZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5rZWVwV2hpdGVzcGFjZSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBfcHJveHkuJHRyeUluc2VydFNuaXBwZXQoaWQsIGRvY3VtZW50LnZhbHVlLnZlcnNpb24sIHNuaXBwZXQudmFsdWUsIHJhbmdlcywgb3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0c2V0RGVjb3JhdGlvbnMoZGVjb3JhdGlvblR5cGU6IHZzY29kZS5UZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUsIHJhbmdlczogUmFuZ2VbXSB8IHZzY29kZS5EZWNvcmF0aW9uT3B0aW9uc1tdKTogdm9pZCB7XG5cdFx0XHRcdGNvbnN0IHdpbGxCZUVtcHR5ID0gKHJhbmdlcy5sZW5ndGggPT09IDApO1xuXHRcdFx0XHRpZiAod2lsbEJlRW1wdHkgJiYgIXRoYXQuX2hhc0RlY29yYXRpb25zRm9yS2V5LmhhcyhkZWNvcmF0aW9uVHlwZS5rZXkpKSB7XG5cdFx0XHRcdFx0Ly8gYXZvaWQgbm8tb3AgY2FsbCB0byB0aGUgcmVuZGVyZXJcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHdpbGxCZUVtcHR5KSB7XG5cdFx0XHRcdFx0dGhhdC5faGFzRGVjb3JhdGlvbnNGb3JLZXkuZGVsZXRlKGRlY29yYXRpb25UeXBlLmtleSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhhdC5faGFzRGVjb3JhdGlvbnNGb3JLZXkuYWRkKGRlY29yYXRpb25UeXBlLmtleSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhhdC5fcnVuT25Qcm94eSgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKFR5cGVDb252ZXJ0ZXJzLmlzRGVjb3JhdGlvbk9wdGlvbnNBcnIocmFuZ2VzKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIF9wcm94eS4kdHJ5U2V0RGVjb3JhdGlvbnMoXG5cdFx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0XHRkZWNvcmF0aW9uVHlwZS5rZXksXG5cdFx0XHRcdFx0XHRcdFR5cGVDb252ZXJ0ZXJzLmZyb21SYW5nZU9yUmFuZ2VXaXRoTWVzc2FnZShyYW5nZXMpXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBfcmFuZ2VzOiBudW1iZXJbXSA9IG5ldyBBcnJheTxudW1iZXI+KDQgKiByYW5nZXMubGVuZ3RoKTtcblx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSByYW5nZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSByYW5nZXNbaV07XG5cdFx0XHRcdFx0XHRcdF9yYW5nZXNbNCAqIGldID0gcmFuZ2Uuc3RhcnQubGluZSArIDE7XG5cdFx0XHRcdFx0XHRcdF9yYW5nZXNbNCAqIGkgKyAxXSA9IHJhbmdlLnN0YXJ0LmNoYXJhY3RlciArIDE7XG5cdFx0XHRcdFx0XHRcdF9yYW5nZXNbNCAqIGkgKyAyXSA9IHJhbmdlLmVuZC5saW5lICsgMTtcblx0XHRcdFx0XHRcdFx0X3Jhbmdlc1s0ICogaSArIDNdID0gcmFuZ2UuZW5kLmNoYXJhY3RlciArIDE7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gX3Byb3h5LiR0cnlTZXREZWNvcmF0aW9uc0Zhc3QoXG5cdFx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0XHRkZWNvcmF0aW9uVHlwZS5rZXksXG5cdFx0XHRcdFx0XHRcdF9yYW5nZXNcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRyZXZlYWxSYW5nZShyYW5nZTogUmFuZ2UsIHJldmVhbFR5cGU6IHZzY29kZS5UZXh0RWRpdG9yUmV2ZWFsVHlwZSk6IHZvaWQge1xuXHRcdFx0XHR0aGF0Ll9ydW5PblByb3h5KCgpID0+IF9wcm94eS4kdHJ5UmV2ZWFsUmFuZ2UoXG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0VHlwZUNvbnZlcnRlcnMuUmFuZ2UuZnJvbShyYW5nZSksXG5cdFx0XHRcdFx0KHJldmVhbFR5cGUgfHwgVGV4dEVkaXRvclJldmVhbFR5cGUuRGVmYXVsdClcblx0XHRcdFx0KSk7XG5cdFx0XHR9LFxuXHRcdFx0c2hvdyhjb2x1bW46IHZzY29kZS5WaWV3Q29sdW1uKSB7XG5cdFx0XHRcdF9wcm94eS4kdHJ5U2hvd0VkaXRvcihpZCwgVHlwZUNvbnZlcnRlcnMuVmlld0NvbHVtbi5mcm9tKGNvbHVtbikpO1xuXHRcdFx0fSxcblx0XHRcdGhpZGUoKSB7XG5cdFx0XHRcdF9wcm94eS4kdHJ5SGlkZUVkaXRvcihpZCk7XG5cdFx0XHR9LFxuXHRcdFx0W1N5bWJvbC5mb3IoJ2RlYnVnLmRlc2NyaXB0aW9uJyldKCkge1xuXHRcdFx0XHRyZXR1cm4gYFRleHRFZGl0b3IoJHt0aGlzLmRvY3VtZW50LnVyaS50b1N0cmluZygpfSlgO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHRvayghdGhpcy5fZGlzcG9zZWQpO1xuXHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0fVxuXG5cdC8vIC0tLSBpbmNvbWluZzogZXh0ZW5zaW9uIGhvc3QgTVVTVCBhY2NlcHQgd2hhdCB0aGUgcmVuZGVyZXIgc2F5c1xuXG5cdF9hY2NlcHRPcHRpb25zKG9wdGlvbnM6IElSZXNvbHZlZFRleHRFZGl0b3JDb25maWd1cmF0aW9uKTogdm9pZCB7XG5cdFx0b2soIXRoaXMuX2Rpc3Bvc2VkKTtcblx0XHR0aGlzLl9vcHRpb25zLl9hY2NlcHQob3B0aW9ucyk7XG5cdH1cblxuXHRfYWNjZXB0VmlzaWJsZVJhbmdlcyh2YWx1ZTogUmFuZ2VbXSk6IHZvaWQge1xuXHRcdG9rKCF0aGlzLl9kaXNwb3NlZCk7XG5cdFx0dGhpcy5fdmlzaWJsZVJhbmdlcyA9IHZhbHVlO1xuXHR9XG5cblx0X2FjY2VwdFZpZXdDb2x1bW4odmFsdWU6IHZzY29kZS5WaWV3Q29sdW1uKSB7XG5cdFx0b2soIXRoaXMuX2Rpc3Bvc2VkKTtcblx0XHR0aGlzLl92aWV3Q29sdW1uID0gdmFsdWU7XG5cdH1cblxuXHRfYWNjZXB0U2VsZWN0aW9ucyhzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSk6IHZvaWQge1xuXHRcdG9rKCF0aGlzLl9kaXNwb3NlZCk7XG5cdFx0dGhpcy5fc2VsZWN0aW9ucyA9IHNlbGVjdGlvbnM7XG5cdH1cblxuXHRfYWNjZXB0RGlmZkluZm9ybWF0aW9uKGRpZmZJbmZvcm1hdGlvbjogdnNjb2RlLlRleHRFZGl0b3JEaWZmSW5mb3JtYXRpb25bXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdG9rKCF0aGlzLl9kaXNwb3NlZCk7XG5cdFx0dGhpcy5fZGlmZkluZm9ybWF0aW9uID0gZGlmZkluZm9ybWF0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdHJ5U2V0U2VsZWN0aW9uKCk6IFByb21pc2U8dnNjb2RlLlRleHRFZGl0b3IgfCBudWxsIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fc2VsZWN0aW9ucy5tYXAoVHlwZUNvbnZlcnRlcnMuU2VsZWN0aW9uLmZyb20pO1xuXHRcdGF3YWl0IHRoaXMuX3J1bk9uUHJveHkoKCkgPT4gdGhpcy5fcHJveHkuJHRyeVNldFNlbGVjdGlvbnModGhpcy5pZCwgc2VsZWN0aW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseUVkaXQoZWRpdEJ1aWxkZXI6IFRleHRFZGl0b3JFZGl0KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZWRpdERhdGEgPSBlZGl0QnVpbGRlci5maW5hbGl6ZSgpO1xuXG5cdFx0Ly8gcmV0dXJuIHdoZW4gdGhlcmUgaXMgbm90aGluZyB0byBkb1xuXHRcdGlmIChlZGl0RGF0YS5lZGl0cy5sZW5ndGggPT09IDAgJiYgIWVkaXREYXRhLnNldEVuZE9mTGluZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHR9XG5cblx0XHQvLyBjaGVjayB0aGF0IHRoZSBlZGl0cyBhcmUgbm90IG92ZXJsYXBwaW5nIChpLmUuIGlsbGVnYWwpXG5cdFx0Y29uc3QgZWRpdFJhbmdlcyA9IGVkaXREYXRhLmVkaXRzLm1hcChlZGl0ID0+IGVkaXQucmFuZ2UpO1xuXG5cdFx0Ly8gc29ydCBhc2NlbmRpbmcgKGJ5IGVuZCBhbmQgdGhlbiBieSBzdGFydClcblx0XHRlZGl0UmFuZ2VzLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGlmIChhLmVuZC5saW5lID09PSBiLmVuZC5saW5lKSB7XG5cdFx0XHRcdGlmIChhLmVuZC5jaGFyYWN0ZXIgPT09IGIuZW5kLmNoYXJhY3Rlcikge1xuXHRcdFx0XHRcdGlmIChhLnN0YXJ0LmxpbmUgPT09IGIuc3RhcnQubGluZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGEuc3RhcnQuY2hhcmFjdGVyIC0gYi5zdGFydC5jaGFyYWN0ZXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBhLnN0YXJ0LmxpbmUgLSBiLnN0YXJ0LmxpbmU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGEuZW5kLmNoYXJhY3RlciAtIGIuZW5kLmNoYXJhY3Rlcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhLmVuZC5saW5lIC0gYi5lbmQubGluZTtcblx0XHR9KTtcblxuXHRcdC8vIGNoZWNrIHRoYXQgbm8gZWRpdHMgYXJlIG92ZXJsYXBwaW5nXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGNvdW50ID0gZWRpdFJhbmdlcy5sZW5ndGggLSAxOyBpIDwgY291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3QgcmFuZ2VFbmQgPSBlZGl0UmFuZ2VzW2ldLmVuZDtcblx0XHRcdGNvbnN0IG5leHRSYW5nZVN0YXJ0ID0gZWRpdFJhbmdlc1tpICsgMV0uc3RhcnQ7XG5cblx0XHRcdGlmIChuZXh0UmFuZ2VTdGFydC5pc0JlZm9yZShyYW5nZUVuZCkpIHtcblx0XHRcdFx0Ly8gb3ZlcmxhcHBpbmcgcmFuZ2VzXG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChcblx0XHRcdFx0XHRuZXcgRXJyb3IoJ092ZXJsYXBwaW5nIHJhbmdlcyBhcmUgbm90IGFsbG93ZWQhJylcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBwcmVwYXJlIGRhdGEgZm9yIHNlcmlhbGl6YXRpb25cblx0XHRjb25zdCBlZGl0cyA9IGVkaXREYXRhLmVkaXRzLm1hcCgoZWRpdCk6IElTaW5nbGVFZGl0T3BlcmF0aW9uID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJhbmdlOiBUeXBlQ29udmVydGVycy5SYW5nZS5mcm9tKGVkaXQucmFuZ2UpLFxuXHRcdFx0XHR0ZXh0OiBlZGl0LnRleHQsXG5cdFx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGVkaXQuZm9yY2VNb3ZlTWFya2Vyc1xuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kdHJ5QXBwbHlFZGl0cyh0aGlzLmlkLCBlZGl0RGF0YS5kb2N1bWVudFZlcnNpb25JZCwgZWRpdHMsIHtcblx0XHRcdHNldEVuZE9mTGluZTogdHlwZW9mIGVkaXREYXRhLnNldEVuZE9mTGluZSA9PT0gJ251bWJlcicgPyBUeXBlQ29udmVydGVycy5FbmRPZkxpbmUuZnJvbShlZGl0RGF0YS5zZXRFbmRPZkxpbmUpIDogdW5kZWZpbmVkLFxuXHRcdFx0dW5kb1N0b3BCZWZvcmU6IGVkaXREYXRhLnVuZG9TdG9wQmVmb3JlLFxuXHRcdFx0dW5kb1N0b3BBZnRlcjogZWRpdERhdGEudW5kb1N0b3BBZnRlclxuXHRcdH0pO1xuXHR9XG5cdHByaXZhdGUgX3J1bk9uUHJveHkoY2FsbGJhY2s6ICgpID0+IFByb21pc2U8YW55Pik6IFByb21pc2U8RXh0SG9zdFRleHRFZGl0b3IgfCB1bmRlZmluZWQgfCBudWxsPiB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1RleHRFZGl0b3IgaXMgY2xvc2VkL2Rpc3Bvc2VkJyk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNhbGxiYWNrKCkudGhlbigoKSA9PiB0aGlzLCBlcnIgPT4ge1xuXHRcdFx0aWYgKCEoZXJyIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyLm5hbWUgPT09ICdESVNQT1NFRCcpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihlcnIpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsVUFBVTtBQUNuQixTQUFTLGVBQWUsdUJBQXVCO0FBQy9DLFNBQVMsbUJBQW1CO0FBSzVCLFlBQVksb0JBQW9CO0FBQ2hDLFNBQVMsV0FBVyxVQUFVLE9BQU8sV0FBc0QsNEJBQTRCO0FBTWhILE1BQU0sNEJBQU4sTUFBTSwwQkFBeUI7QUFBQSxFQU1yQyxZQUFZLE9BQW1DLFdBQWtDLFNBQXlDO0FBQ3pILFVBQU0sTUFBTSwwQkFBeUIsTUFBTSxPQUFPO0FBQ2xELFVBQU0sa0NBQWtDLFVBQVUsWUFBWSxLQUFLLGVBQWUsd0JBQXdCLEtBQUssT0FBTyxDQUFDO0FBQ3ZILFNBQUssUUFBUSxPQUFPLE9BQU87QUFBQSxNQUMxQjtBQUFBLE1BQ0EsVUFBVTtBQUNULGNBQU0sZ0NBQWdDLEdBQUc7QUFBQSxNQUMxQztBQUFBLElB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
