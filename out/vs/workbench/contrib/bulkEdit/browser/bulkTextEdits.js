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
import { dispose } from "../../../../base/common/lifecycle.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { IEditorWorkerService } from "../../../../editor/common/services/editorWorker.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { SingleModelEditStackElement, MultiModelEditStackElement } from "../../../../editor/common/model/editStack.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ResourceTextEdit } from "../../../../editor/browser/services/bulkEditService.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { SnippetParser } from "../../../../editor/contrib/snippet/browser/snippetParser.js";
class ModelEditTask {
  constructor(_modelReference) {
    this._modelReference = _modelReference;
    this.model = this._modelReference.object.textEditorModel;
    this._edits = [];
  }
  dispose() {
    this._modelReference.dispose();
  }
  isNoOp() {
    if (this._edits.length > 0) {
      return false;
    }
    if (this._newEol !== void 0 && this._newEol !== this.model.getEndOfLineSequence()) {
      return false;
    }
    return true;
  }
  addEdit(resourceEdit) {
    this._expectedModelVersionId = resourceEdit.versionId;
    const { textEdit } = resourceEdit;
    if (typeof textEdit.eol === "number") {
      this._newEol = textEdit.eol;
    }
    if (!textEdit.range && !textEdit.text) {
      return;
    }
    if (Range.isEmpty(textEdit.range) && !textEdit.text) {
      return;
    }
    let range;
    if (!textEdit.range) {
      range = this.model.getFullModelRange();
    } else {
      range = Range.lift(textEdit.range);
    }
    this._edits.push({ ...EditOperation.replaceMove(range, textEdit.text), insertAsSnippet: textEdit.insertAsSnippet, keepWhitespace: textEdit.keepWhitespace });
  }
  validate() {
    if (typeof this._expectedModelVersionId === "undefined" || this.model.getVersionId() === this._expectedModelVersionId) {
      return { canApply: true };
    }
    return { canApply: false, reason: this.model.uri };
  }
  getBeforeCursorState() {
    return null;
  }
  apply(reason) {
    if (this._edits.length > 0) {
      this._edits = this._edits.map(this._transformSnippetStringToInsertText, this).sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
      this.model.pushEditOperations(null, this._edits, () => null, void 0, reason);
    }
    if (this._newEol !== void 0) {
      this.model.pushEOL(this._newEol);
    }
  }
  _transformSnippetStringToInsertText(edit) {
    if (!edit.insertAsSnippet) {
      return edit;
    }
    if (!edit.text) {
      return edit;
    }
    const text = SnippetParser.asInsertText(edit.text);
    return { ...edit, insertAsSnippet: false, text };
  }
}
class EditorEditTask extends ModelEditTask {
  constructor(modelReference, editor) {
    super(modelReference);
    this._editor = editor;
  }
  getBeforeCursorState() {
    return this._canUseEditor() ? this._editor.getSelections() : null;
  }
  apply(reason) {
    if (!this._canUseEditor()) {
      super.apply();
      return;
    }
    if (this._edits.length > 0) {
      const snippetCtrl = SnippetController2.get(this._editor);
      if (snippetCtrl && this._edits.some((edit) => edit.insertAsSnippet)) {
        const snippetEdits = [];
        for (const edit of this._edits) {
          if (edit.range && edit.text !== null) {
            snippetEdits.push({
              range: Range.lift(edit.range),
              template: edit.insertAsSnippet ? edit.text : SnippetParser.escape(edit.text),
              keepWhitespace: edit.keepWhitespace
            });
          }
        }
        snippetCtrl.apply(snippetEdits, { undoStopBefore: false, undoStopAfter: false });
      } else {
        this._edits = this._edits.map(this._transformSnippetStringToInsertText, this).sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
        this._editor.executeEdits(reason, this._edits);
      }
    }
    if (this._newEol !== void 0) {
      if (this._editor.hasModel()) {
        this._editor.getModel().pushEOL(this._newEol);
      }
    }
  }
  _canUseEditor() {
    return this._editor?.getModel()?.uri.toString() === this.model.uri.toString();
  }
}
let BulkTextEdits = class {
  constructor(_label, _code, _editor, _undoRedoGroup, _undoRedoSource, _progress, _token, edits, _editorWorker, _modelService, _textModelResolverService, _undoRedoService) {
    this._label = _label;
    this._code = _code;
    this._editor = _editor;
    this._undoRedoGroup = _undoRedoGroup;
    this._undoRedoSource = _undoRedoSource;
    this._progress = _progress;
    this._token = _token;
    this._editorWorker = _editorWorker;
    this._modelService = _modelService;
    this._textModelResolverService = _textModelResolverService;
    this._undoRedoService = _undoRedoService;
    this._edits = new ResourceMap();
    for (const edit of edits) {
      let array = this._edits.get(edit.resource);
      if (!array) {
        array = [];
        this._edits.set(edit.resource, array);
      }
      array.push(edit);
    }
  }
  _validateBeforePrepare() {
    for (const array of this._edits.values()) {
      for (const edit of array) {
        if (typeof edit.versionId === "number") {
          const model = this._modelService.getModel(edit.resource);
          if (model && model.getVersionId() !== edit.versionId) {
            throw new Error(`${model.uri.toString()} has changed in the meantime`);
          }
        }
      }
    }
  }
  async _createEditsTasks() {
    const tasks = [];
    const promises = [];
    for (const [key, edits] of this._edits) {
      const promise = this._textModelResolverService.createModelReference(key).then(async (ref) => {
        let task;
        let makeMinimal = false;
        if (this._editor?.getModel()?.uri.toString() === ref.object.textEditorModel.uri.toString()) {
          task = new EditorEditTask(ref, this._editor);
          makeMinimal = true;
        } else {
          task = new ModelEditTask(ref);
        }
        tasks.push(task);
        if (!makeMinimal) {
          edits.forEach(task.addEdit, task);
          return;
        }
        const makeGroupMoreMinimal = async (start2, end) => {
          const oldEdits = edits.slice(start2, end);
          const newEdits = await this._editorWorker.computeMoreMinimalEdits(ref.object.textEditorModel.uri, oldEdits.map((e) => e.textEdit), false);
          if (!newEdits) {
            oldEdits.forEach(task.addEdit, task);
          } else {
            const versionId = oldEdits[0]?.versionId;
            newEdits.forEach((edit) => task.addEdit(new ResourceTextEdit(ref.object.textEditorModel.uri, edit, versionId, void 0)));
          }
        };
        let start = 0;
        let i = 0;
        for (; i < edits.length; i++) {
          if (edits[i].textEdit.insertAsSnippet || edits[i].metadata) {
            await makeGroupMoreMinimal(start, i);
            task.addEdit(edits[i]);
            start = i + 1;
          }
        }
        await makeGroupMoreMinimal(start, i);
      });
      promises.push(promise);
    }
    await Promise.all(promises);
    return tasks;
  }
  _validateTasks(tasks) {
    for (const task of tasks) {
      const result = task.validate();
      if (!result.canApply) {
        return result;
      }
    }
    return { canApply: true };
  }
  async apply(reason) {
    this._validateBeforePrepare();
    const tasks = await this._createEditsTasks();
    try {
      if (this._token.isCancellationRequested) {
        return [];
      }
      const resources = [];
      const validation = this._validateTasks(tasks);
      if (!validation.canApply) {
        throw new Error(`${validation.reason.toString()} has changed in the meantime`);
      }
      if (tasks.length === 1) {
        const task = tasks[0];
        if (!task.isNoOp()) {
          const singleModelEditStackElement = new SingleModelEditStackElement(this._label, this._code, task.model, task.getBeforeCursorState());
          this._undoRedoService.pushElement(singleModelEditStackElement, this._undoRedoGroup, this._undoRedoSource);
          task.apply(reason);
          singleModelEditStackElement.close();
          resources.push(task.model.uri);
        }
        this._progress.report(void 0);
      } else {
        const multiModelEditStackElement = new MultiModelEditStackElement(
          this._label,
          this._code,
          tasks.map((t) => new SingleModelEditStackElement(this._label, this._code, t.model, t.getBeforeCursorState()))
        );
        this._undoRedoService.pushElement(multiModelEditStackElement, this._undoRedoGroup, this._undoRedoSource);
        for (const task of tasks) {
          task.apply();
          this._progress.report(void 0);
          resources.push(task.model.uri);
        }
        multiModelEditStackElement.close();
      }
      return resources;
    } finally {
      dispose(tasks);
    }
  }
};
BulkTextEdits = __decorateClass([
  __decorateParam(8, IEditorWorkerService),
  __decorateParam(9, IModelService),
  __decorateParam(10, ITextModelService),
  __decorateParam(11, IUndoRedoService)
], BulkTextEdits);
export {
  BulkTextEdits
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2J1bGtFZGl0L2Jyb3dzZXIvYnVsa1RleHRFZGl0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3Bvc2UsIElEaXNwb3NhYmxlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiwgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVNlcXVlbmNlLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSwgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSwgVW5kb1JlZG9Hcm91cCwgVW5kb1JlZG9Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8uanMnO1xuaW1wb3J0IHsgU2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50LCBNdWx0aU1vZGVsRWRpdFN0YWNrRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvZWRpdFN0YWNrLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IFJlc291cmNlVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgU25pcHBldENvbnRyb2xsZXIyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc25pcHBldC9icm93c2VyL3NuaXBwZXRDb250cm9sbGVyMi5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0UGFyc2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc25pcHBldC9icm93c2VyL3NuaXBwZXRQYXJzZXIuanMnO1xuaW1wb3J0IHsgSVNuaXBwZXRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc25pcHBldC9icm93c2VyL3NuaXBwZXRTZXNzaW9uLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbEVkaXRTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuXG50eXBlIFZhbGlkYXRpb25SZXN1bHQgPSB7IGNhbkFwcGx5OiB0cnVlIH0gfCB7IGNhbkFwcGx5OiBmYWxzZTsgcmVhc29uOiBVUkkgfTtcblxudHlwZSBJU2luZ2xlU25pcHBldEVkaXRPcGVyYXRpb24gPSBJU2luZ2xlRWRpdE9wZXJhdGlvbiAmIHsgaW5zZXJ0QXNTbmlwcGV0PzogYm9vbGVhbjsga2VlcFdoaXRlc3BhY2U/OiBib29sZWFuIH07XG5cbmNsYXNzIE1vZGVsRWRpdFRhc2sgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgbW9kZWw6IElUZXh0TW9kZWw7XG5cblx0cHJpdmF0ZSBfZXhwZWN0ZWRNb2RlbFZlcnNpb25JZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcm90ZWN0ZWQgX2VkaXRzOiBJU2luZ2xlU25pcHBldEVkaXRPcGVyYXRpb25bXTtcblx0cHJvdGVjdGVkIF9uZXdFb2w6IEVuZE9mTGluZVNlcXVlbmNlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX21vZGVsUmVmZXJlbmNlOiBJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4pIHtcblx0XHR0aGlzLm1vZGVsID0gdGhpcy5fbW9kZWxSZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0XHR0aGlzLl9lZGl0cyA9IFtdO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9tb2RlbFJlZmVyZW5jZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRpc05vT3AoKSB7XG5cdFx0aWYgKHRoaXMuX2VkaXRzLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIGNvbnRhaW5zIHRleHR1YWwgZWRpdHNcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX25ld0VvbCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX25ld0VvbCAhPT0gdGhpcy5tb2RlbC5nZXRFbmRPZkxpbmVTZXF1ZW5jZSgpKSB7XG5cdFx0XHQvLyBjb250YWlucyBhbiBlb2wgY2hhbmdlIHRoYXQgaXMgYSByZWFsIGNoYW5nZVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFkZEVkaXQocmVzb3VyY2VFZGl0OiBSZXNvdXJjZVRleHRFZGl0KTogdm9pZCB7XG5cdFx0dGhpcy5fZXhwZWN0ZWRNb2RlbFZlcnNpb25JZCA9IHJlc291cmNlRWRpdC52ZXJzaW9uSWQ7XG5cdFx0Y29uc3QgeyB0ZXh0RWRpdCB9ID0gcmVzb3VyY2VFZGl0O1xuXG5cdFx0aWYgKHR5cGVvZiB0ZXh0RWRpdC5lb2wgPT09ICdudW1iZXInKSB7XG5cdFx0XHQvLyBob25vciBlb2wtY2hhbmdlXG5cdFx0XHR0aGlzLl9uZXdFb2wgPSB0ZXh0RWRpdC5lb2w7XG5cdFx0fVxuXHRcdGlmICghdGV4dEVkaXQucmFuZ2UgJiYgIXRleHRFZGl0LnRleHQpIHtcblx0XHRcdC8vIGxhY2tzIGJvdGggYSByYW5nZSBhbmQgdGhlIHRleHRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKFJhbmdlLmlzRW1wdHkodGV4dEVkaXQucmFuZ2UpICYmICF0ZXh0RWRpdC50ZXh0KSB7XG5cdFx0XHQvLyBuby1vcCBlZGl0IChyZXBsYWNlIGVtcHR5IHJhbmdlIHdpdGggZW1wdHkgdGV4dClcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBjcmVhdGUgZWRpdCBvcGVyYXRpb25cblx0XHRsZXQgcmFuZ2U6IFJhbmdlO1xuXHRcdGlmICghdGV4dEVkaXQucmFuZ2UpIHtcblx0XHRcdHJhbmdlID0gdGhpcy5tb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyYW5nZSA9IFJhbmdlLmxpZnQodGV4dEVkaXQucmFuZ2UpO1xuXHRcdH1cblx0XHR0aGlzLl9lZGl0cy5wdXNoKHsgLi4uRWRpdE9wZXJhdGlvbi5yZXBsYWNlTW92ZShyYW5nZSwgdGV4dEVkaXQudGV4dCksIGluc2VydEFzU25pcHBldDogdGV4dEVkaXQuaW5zZXJ0QXNTbmlwcGV0LCBrZWVwV2hpdGVzcGFjZTogdGV4dEVkaXQua2VlcFdoaXRlc3BhY2UgfSk7XG5cdH1cblxuXHR2YWxpZGF0ZSgpOiBWYWxpZGF0aW9uUmVzdWx0IHtcblx0XHRpZiAodHlwZW9mIHRoaXMuX2V4cGVjdGVkTW9kZWxWZXJzaW9uSWQgPT09ICd1bmRlZmluZWQnIHx8IHRoaXMubW9kZWwuZ2V0VmVyc2lvbklkKCkgPT09IHRoaXMuX2V4cGVjdGVkTW9kZWxWZXJzaW9uSWQpIHtcblx0XHRcdHJldHVybiB7IGNhbkFwcGx5OiB0cnVlIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IGNhbkFwcGx5OiBmYWxzZSwgcmVhc29uOiB0aGlzLm1vZGVsLnVyaSB9O1xuXHR9XG5cblx0Z2V0QmVmb3JlQ3Vyc29yU3RhdGUoKTogU2VsZWN0aW9uW10gfCBudWxsIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGFwcGx5KHJlYXNvbj86IFRleHRNb2RlbEVkaXRTb3VyY2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fZWRpdHMgPSB0aGlzLl9lZGl0c1xuXHRcdFx0XHQubWFwKHRoaXMuX3RyYW5zZm9ybVNuaXBwZXRTdHJpbmdUb0luc2VydFRleHQsIHRoaXMpIC8vIG5vIGVkaXRvciAtPiBubyBzbmlwcGV0IG1vZGVcblx0XHRcdFx0LnNvcnQoKGEsIGIpID0+IFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyhhLnJhbmdlLCBiLnJhbmdlKSk7XG5cdFx0XHR0aGlzLm1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCB0aGlzLl9lZGl0cywgKCkgPT4gbnVsbCwgdW5kZWZpbmVkLCByZWFzb24pO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fbmV3RW9sICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubW9kZWwucHVzaEVPTCh0aGlzLl9uZXdFb2wpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfdHJhbnNmb3JtU25pcHBldFN0cmluZ1RvSW5zZXJ0VGV4dChlZGl0OiBJU2luZ2xlU25pcHBldEVkaXRPcGVyYXRpb24pOiBJU2luZ2xlU25pcHBldEVkaXRPcGVyYXRpb24ge1xuXHRcdC8vIHRyYW5zZm9ybSBhIHNuaXBwZXQgZWRpdCAoYW5kIG9ubHkgdGhvc2UpIGludG8gYSBub3JtYWwgdGV4dCBlZGl0XG5cdFx0Ly8gZm9yIHRoYXQgd2UgbmVlZCB0byBwYXJzZSB0aGUgc25pcHBldCBhbmQgZ2V0IGl0cyBhY3R1YWwgdGV4dCwgZS5nIHdpdGhvdXQgcGxhY2Vob2xkZXJcblx0XHQvLyBvciB2YXJpYWJsZSBzeW50YXhlc1xuXHRcdGlmICghZWRpdC5pbnNlcnRBc1NuaXBwZXQpIHtcblx0XHRcdHJldHVybiBlZGl0O1xuXHRcdH1cblx0XHRpZiAoIWVkaXQudGV4dCkge1xuXHRcdFx0cmV0dXJuIGVkaXQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRleHQgPSBTbmlwcGV0UGFyc2VyLmFzSW5zZXJ0VGV4dChlZGl0LnRleHQpO1xuXHRcdHJldHVybiB7IC4uLmVkaXQsIGluc2VydEFzU25pcHBldDogZmFsc2UsIHRleHQgfTtcblx0fVxufVxuXG5jbGFzcyBFZGl0b3JFZGl0VGFzayBleHRlbmRzIE1vZGVsRWRpdFRhc2sge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3I7XG5cblx0Y29uc3RydWN0b3IobW9kZWxSZWZlcmVuY2U6IElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPiwgZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdHN1cGVyKG1vZGVsUmVmZXJlbmNlKTtcblx0XHR0aGlzLl9lZGl0b3IgPSBlZGl0b3I7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRCZWZvcmVDdXJzb3JTdGF0ZSgpOiBTZWxlY3Rpb25bXSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9jYW5Vc2VFZGl0b3IoKSA/IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCkgOiBudWxsO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXBwbHkocmVhc29uPzogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IHZvaWQge1xuXG5cdFx0Ly8gQ2hlY2sgdGhhdCB0aGUgZWRpdG9yIGlzIHN0aWxsIGZvciB0aGUgd2FudGVkIG1vZGVsLiBJdCBtaWdodCBoYXZlIGNoYW5nZWQgaW4gdGhlXG5cdFx0Ly8gbWVhbnRpbWUgYW5kIHRoYXQgbWVhbnMgd2UgY2Fubm90IHVzZSB0aGUgZWRpdG9yIGFueW1vcmUgKGluc3RlYWQgd2UgcGVyZm9ybSB0aGUgZWRpdCB0aHJvdWdoIHRoZSBtb2RlbClcblx0XHRpZiAoIXRoaXMuX2NhblVzZUVkaXRvcigpKSB7XG5cdFx0XHRzdXBlci5hcHBseSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9lZGl0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBzbmlwcGV0Q3RybCA9IFNuaXBwZXRDb250cm9sbGVyMi5nZXQodGhpcy5fZWRpdG9yKTtcblx0XHRcdGlmIChzbmlwcGV0Q3RybCAmJiB0aGlzLl9lZGl0cy5zb21lKGVkaXQgPT4gZWRpdC5pbnNlcnRBc1NuaXBwZXQpKSB7XG5cdFx0XHRcdC8vIHNvbWUgZWRpdCBpcyBhIHNuaXBwZXQgZWRpdCAtPiB1c2Ugc25pcHBldCBjb250cm9sbGVyIGFuZCBJU25pcHBldEVkaXRzXG5cdFx0XHRcdGNvbnN0IHNuaXBwZXRFZGl0czogSVNuaXBwZXRFZGl0W10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRoaXMuX2VkaXRzKSB7XG5cdFx0XHRcdFx0aWYgKGVkaXQucmFuZ2UgJiYgZWRpdC50ZXh0ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRzbmlwcGV0RWRpdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHJhbmdlOiBSYW5nZS5saWZ0KGVkaXQucmFuZ2UpLFxuXHRcdFx0XHRcdFx0XHR0ZW1wbGF0ZTogZWRpdC5pbnNlcnRBc1NuaXBwZXQgPyBlZGl0LnRleHQgOiBTbmlwcGV0UGFyc2VyLmVzY2FwZShlZGl0LnRleHQpLFxuXHRcdFx0XHRcdFx0XHRrZWVwV2hpdGVzcGFjZTogZWRpdC5rZWVwV2hpdGVzcGFjZVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHNuaXBwZXRDdHJsLmFwcGx5KHNuaXBwZXRFZGl0cywgeyB1bmRvU3RvcEJlZm9yZTogZmFsc2UsIHVuZG9TdG9wQWZ0ZXI6IGZhbHNlIH0pO1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBub3JtYWwgZWRpdFxuXHRcdFx0XHR0aGlzLl9lZGl0cyA9IHRoaXMuX2VkaXRzXG5cdFx0XHRcdFx0Lm1hcCh0aGlzLl90cmFuc2Zvcm1TbmlwcGV0U3RyaW5nVG9JbnNlcnRUZXh0LCB0aGlzKSAvLyBtaXhlZCBlZGl0cyAoc25pcHBldCBhbmQgbm9ybWFsKSAtPiBubyBzbmlwcGV0IG1vZGVcblx0XHRcdFx0XHQuc29ydCgoYSwgYikgPT4gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEucmFuZ2UsIGIucmFuZ2UpKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLmV4ZWN1dGVFZGl0cyhyZWFzb24sIHRoaXMuX2VkaXRzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuX25ld0VvbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAodGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLmdldE1vZGVsKCkucHVzaEVPTCh0aGlzLl9uZXdFb2wpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NhblVzZUVkaXRvcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yPy5nZXRNb2RlbCgpPy51cmkudG9TdHJpbmcoKSA9PT0gdGhpcy5tb2RlbC51cmkudG9TdHJpbmcoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnVsa1RleHRFZGl0cyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdHMgPSBuZXcgUmVzb3VyY2VNYXA8UmVzb3VyY2VUZXh0RWRpdFtdPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29kZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdW5kb1JlZG9Hcm91cDogVW5kb1JlZG9Hcm91cCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb1NvdXJjZTogVW5kb1JlZG9Tb3VyY2UgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvZ3Jlc3M6IElQcm9ncmVzczx2b2lkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0ZWRpdHM6IFJlc291cmNlVGV4dEVkaXRbXSxcblx0XHRASUVkaXRvcldvcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yV29ya2VyOiBJRWRpdG9yV29ya2VyU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElVbmRvUmVkb1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdW5kb1JlZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlXG5cdCkge1xuXG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIGVkaXRzKSB7XG5cdFx0XHRsZXQgYXJyYXkgPSB0aGlzLl9lZGl0cy5nZXQoZWRpdC5yZXNvdXJjZSk7XG5cdFx0XHRpZiAoIWFycmF5KSB7XG5cdFx0XHRcdGFycmF5ID0gW107XG5cdFx0XHRcdHRoaXMuX2VkaXRzLnNldChlZGl0LnJlc291cmNlLCBhcnJheSk7XG5cdFx0XHR9XG5cdFx0XHRhcnJheS5wdXNoKGVkaXQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlQmVmb3JlUHJlcGFyZSgpOiB2b2lkIHtcblx0XHQvLyBGaXJzdCBjaGVjayBpZiBsb2FkZWQgbW9kZWxzIHdlcmUgbm90IGNoYW5nZWQgaW4gdGhlIG1lYW50aW1lXG5cdFx0Zm9yIChjb25zdCBhcnJheSBvZiB0aGlzLl9lZGl0cy52YWx1ZXMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0IG9mIGFycmF5KSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgZWRpdC52ZXJzaW9uSWQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwoZWRpdC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKG1vZGVsICYmIG1vZGVsLmdldFZlcnNpb25JZCgpICE9PSBlZGl0LnZlcnNpb25JZCkge1xuXHRcdFx0XHRcdFx0Ly8gbW9kZWwgY2hhbmdlZCBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgJHttb2RlbC51cmkudG9TdHJpbmcoKX0gaGFzIGNoYW5nZWQgaW4gdGhlIG1lYW50aW1lYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlRWRpdHNUYXNrcygpOiBQcm9taXNlPE1vZGVsRWRpdFRhc2tbXT4ge1xuXG5cdFx0Y29uc3QgdGFza3M6IE1vZGVsRWRpdFRhc2tbXSA9IFtdO1xuXHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBba2V5LCBlZGl0c10gb2YgdGhpcy5fZWRpdHMpIHtcblx0XHRcdGNvbnN0IHByb21pc2UgPSB0aGlzLl90ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2Uoa2V5KS50aGVuKGFzeW5jIHJlZiA9PiB7XG5cdFx0XHRcdGxldCB0YXNrOiBNb2RlbEVkaXRUYXNrO1xuXHRcdFx0XHRsZXQgbWFrZU1pbmltYWwgPSBmYWxzZTtcblx0XHRcdFx0aWYgKHRoaXMuX2VkaXRvcj8uZ2V0TW9kZWwoKT8udXJpLnRvU3RyaW5nKCkgPT09IHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLnVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0dGFzayA9IG5ldyBFZGl0b3JFZGl0VGFzayhyZWYsIHRoaXMuX2VkaXRvcik7XG5cdFx0XHRcdFx0bWFrZU1pbmltYWwgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRhc2sgPSBuZXcgTW9kZWxFZGl0VGFzayhyZWYpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRhc2tzLnB1c2godGFzayk7XG5cblxuXHRcdFx0XHRpZiAoIW1ha2VNaW5pbWFsKSB7XG5cdFx0XHRcdFx0ZWRpdHMuZm9yRWFjaCh0YXNrLmFkZEVkaXQsIHRhc2spO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGdyb3VwIGVkaXRzIGJ5IHR5cGUgKHNuaXBwZXQsIG1ldGFkYXRhLCBvciBzaW1wbGUpIGFuZCBtYWtlIHNpbXBsZSBncm91cHMgbW9yZSBtaW5pbWFsXG5cblx0XHRcdFx0Y29uc3QgbWFrZUdyb3VwTW9yZU1pbmltYWwgPSBhc3luYyAoc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIpID0+IHtcblx0XHRcdFx0XHRjb25zdCBvbGRFZGl0cyA9IGVkaXRzLnNsaWNlKHN0YXJ0LCBlbmQpO1xuXHRcdFx0XHRcdGNvbnN0IG5ld0VkaXRzID0gYXdhaXQgdGhpcy5fZWRpdG9yV29ya2VyLmNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLnVyaSwgb2xkRWRpdHMubWFwKGUgPT4gZS50ZXh0RWRpdCksIGZhbHNlKTtcblx0XHRcdFx0XHRpZiAoIW5ld0VkaXRzKSB7XG5cdFx0XHRcdFx0XHRvbGRFZGl0cy5mb3JFYWNoKHRhc2suYWRkRWRpdCwgdGFzayk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIEFsbCBlZGl0cyBpbiB0aGUgZ3JvdXAgaGF2ZSB0aGUgc2FtZSB2ZXJzaW9uIGlkIHNpbmNlIHdlIGdyb3VwIHRoZSBlZGl0c1xuXHRcdFx0XHRcdFx0Ly8gaW4gdGhlIGNvbnN0cnVjdG9yIGJ5IHRoZSByZXNvdXJjZSBVUkkuXG5cdFx0XHRcdFx0XHRjb25zdCB2ZXJzaW9uSWQgPSBvbGRFZGl0c1swXT8udmVyc2lvbklkO1xuXHRcdFx0XHRcdFx0bmV3RWRpdHMuZm9yRWFjaChlZGl0ID0+IHRhc2suYWRkRWRpdChuZXcgUmVzb3VyY2VUZXh0RWRpdChyZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC51cmksIGVkaXQsIHZlcnNpb25JZCwgdW5kZWZpbmVkKSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRsZXQgc3RhcnQgPSAwO1xuXHRcdFx0XHRsZXQgaSA9IDA7XG5cdFx0XHRcdGZvciAoOyBpIDwgZWRpdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRpZiAoZWRpdHNbaV0udGV4dEVkaXQuaW5zZXJ0QXNTbmlwcGV0IHx8IGVkaXRzW2ldLm1ldGFkYXRhKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBtYWtlR3JvdXBNb3JlTWluaW1hbChzdGFydCwgaSk7IC8vIGdyb3VwZWQgZWRpdHMgdW50aWwgbm93XG5cdFx0XHRcdFx0XHR0YXNrLmFkZEVkaXQoZWRpdHNbaV0pOyAvLyB0aGlzIGVkaXRcblx0XHRcdFx0XHRcdHN0YXJ0ID0gaSArIDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IG1ha2VHcm91cE1vcmVNaW5pbWFsKHN0YXJ0LCBpKTtcblxuXHRcdFx0fSk7XG5cdFx0XHRwcm9taXNlcy5wdXNoKHByb21pc2UpO1xuXHRcdH1cblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0XHRyZXR1cm4gdGFza3M7XG5cdH1cblxuXHRwcml2YXRlIF92YWxpZGF0ZVRhc2tzKHRhc2tzOiBNb2RlbEVkaXRUYXNrW10pOiBWYWxpZGF0aW9uUmVzdWx0IHtcblx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRhc2sudmFsaWRhdGUoKTtcblx0XHRcdGlmICghcmVzdWx0LmNhbkFwcGx5KSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IGNhbkFwcGx5OiB0cnVlIH07XG5cdH1cblxuXHRhc3luYyBhcHBseShyZWFzb24/OiBUZXh0TW9kZWxFZGl0U291cmNlKTogUHJvbWlzZTxyZWFkb25seSBVUklbXT4ge1xuXG5cdFx0dGhpcy5fdmFsaWRhdGVCZWZvcmVQcmVwYXJlKCk7XG5cdFx0Y29uc3QgdGFza3MgPSBhd2FpdCB0aGlzLl9jcmVhdGVFZGl0c1Rhc2tzKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKHRoaXMuX3Rva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzb3VyY2VzOiBVUklbXSA9IFtdO1xuXHRcdFx0Y29uc3QgdmFsaWRhdGlvbiA9IHRoaXMuX3ZhbGlkYXRlVGFza3ModGFza3MpO1xuXHRcdFx0aWYgKCF2YWxpZGF0aW9uLmNhbkFwcGx5KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgJHt2YWxpZGF0aW9uLnJlYXNvbi50b1N0cmluZygpfSBoYXMgY2hhbmdlZCBpbiB0aGUgbWVhbnRpbWVgKTtcblx0XHRcdH1cblx0XHRcdGlmICh0YXNrcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Ly8gVGhpcyBlZGl0IHRvdWNoZXMgYSBzaW5nbGUgbW9kZWwgPT4ga2VlcCB0aGluZ3Mgc2ltcGxlXG5cdFx0XHRcdGNvbnN0IHRhc2sgPSB0YXNrc1swXTtcblx0XHRcdFx0aWYgKCF0YXNrLmlzTm9PcCgpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50ID0gbmV3IFNpbmdsZU1vZGVsRWRpdFN0YWNrRWxlbWVudCh0aGlzLl9sYWJlbCwgdGhpcy5fY29kZSwgdGFzay5tb2RlbCwgdGFzay5nZXRCZWZvcmVDdXJzb3JTdGF0ZSgpKTtcblx0XHRcdFx0XHR0aGlzLl91bmRvUmVkb1NlcnZpY2UucHVzaEVsZW1lbnQoc2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50LCB0aGlzLl91bmRvUmVkb0dyb3VwLCB0aGlzLl91bmRvUmVkb1NvdXJjZSk7XG5cdFx0XHRcdFx0dGFzay5hcHBseShyZWFzb24pO1xuXHRcdFx0XHRcdHNpbmdsZU1vZGVsRWRpdFN0YWNrRWxlbWVudC5jbG9zZSgpO1xuXHRcdFx0XHRcdHJlc291cmNlcy5wdXNoKHRhc2subW9kZWwudXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9wcm9ncmVzcy5yZXBvcnQodW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHByZXBhcmUgbXVsdGkgbW9kZWwgdW5kbyBlbGVtZW50XG5cdFx0XHRcdGNvbnN0IG11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50ID0gbmV3IE11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50KFxuXHRcdFx0XHRcdHRoaXMuX2xhYmVsLFxuXHRcdFx0XHRcdHRoaXMuX2NvZGUsXG5cdFx0XHRcdFx0dGFza3MubWFwKHQgPT4gbmV3IFNpbmdsZU1vZGVsRWRpdFN0YWNrRWxlbWVudCh0aGlzLl9sYWJlbCwgdGhpcy5fY29kZSwgdC5tb2RlbCwgdC5nZXRCZWZvcmVDdXJzb3JTdGF0ZSgpKSlcblx0XHRcdFx0KTtcblx0XHRcdFx0dGhpcy5fdW5kb1JlZG9TZXJ2aWNlLnB1c2hFbGVtZW50KG11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50LCB0aGlzLl91bmRvUmVkb0dyb3VwLCB0aGlzLl91bmRvUmVkb1NvdXJjZSk7XG5cdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0XHRcdHRhc2suYXBwbHkoKTtcblx0XHRcdFx0XHR0aGlzLl9wcm9ncmVzcy5yZXBvcnQodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXNvdXJjZXMucHVzaCh0YXNrLm1vZGVsLnVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bXVsdGlNb2RlbEVkaXRTdGFja0VsZW1lbnQuY2xvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc291cmNlcztcblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NlKHRhc2tzKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUF3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
