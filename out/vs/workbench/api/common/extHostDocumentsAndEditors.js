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
import * as assert from "../../../base/common/assert.js";
import { Emitter } from "../../../base/common/event.js";
import { dispose } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { MainContext } from "./extHost.protocol.js";
import { ExtHostDocumentData } from "./extHostDocumentData.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { ExtHostTextEditor } from "./extHostTextEditor.js";
import * as typeConverters from "./extHostTypeConverters.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ResourceMap } from "../../../base/common/map.js";
import { Schemas } from "../../../base/common/network.js";
import { Iterable } from "../../../base/common/iterator.js";
import { Lazy } from "../../../base/common/lazy.js";
class Reference {
  constructor(value) {
    this.value = value;
    this._count = 0;
  }
  ref() {
    this._count++;
  }
  unref() {
    return --this._count === 0;
  }
}
let ExtHostDocumentsAndEditors = class {
  constructor(_extHostRpc, _logService) {
    this._extHostRpc = _extHostRpc;
    this._logService = _logService;
    this._activeEditorId = null;
    this._editors = /* @__PURE__ */ new Map();
    this._documents = new ResourceMap();
    this._onDidAddDocuments = new Emitter();
    this._onDidRemoveDocuments = new Emitter();
    this._onDidChangeVisibleTextEditors = new Emitter();
    this._onDidChangeActiveTextEditor = new Emitter();
    this.onDidAddDocuments = this._onDidAddDocuments.event;
    this.onDidRemoveDocuments = this._onDidRemoveDocuments.event;
    this.onDidChangeVisibleTextEditors = this._onDidChangeVisibleTextEditors.event;
    this.onDidChangeActiveTextEditor = this._onDidChangeActiveTextEditor.event;
  }
  $acceptDocumentsAndEditorsDelta(delta) {
    this.acceptDocumentsAndEditorsDelta(delta);
  }
  acceptDocumentsAndEditorsDelta(delta) {
    const removedDocuments = [];
    const addedDocuments = [];
    const removedEditors = [];
    if (delta.removedDocuments) {
      for (const uriComponent of delta.removedDocuments) {
        const uri = URI.revive(uriComponent);
        const data = this._documents.get(uri);
        if (data?.unref()) {
          this._documents.delete(uri);
          removedDocuments.push(data.value);
        }
      }
    }
    if (delta.addedDocuments) {
      for (const data of delta.addedDocuments) {
        const resource = URI.revive(data.uri);
        let ref = this._documents.get(resource);
        if (ref) {
          if (resource.scheme !== Schemas.vscodeNotebookCell && resource.scheme !== Schemas.vscodeInteractiveInput) {
            throw new Error(`document '${resource} already exists!'`);
          }
        }
        if (!ref) {
          ref = new Reference(new ExtHostDocumentData(
            this._extHostRpc.getProxy(MainContext.MainThreadDocuments),
            resource,
            data.lines,
            data.EOL,
            data.versionId,
            data.languageId,
            data.isDirty,
            data.encoding
          ));
          this._documents.set(resource, ref);
          addedDocuments.push(ref.value);
        }
        ref.ref();
      }
    }
    if (delta.removedEditors) {
      for (const id of delta.removedEditors) {
        const editor = this._editors.get(id);
        this._editors.delete(id);
        if (editor) {
          removedEditors.push(editor);
        }
      }
    }
    if (delta.addedEditors) {
      for (const data of delta.addedEditors) {
        const resource = URI.revive(data.documentUri);
        assert.ok(this._documents.has(resource), `document '${resource}' does not exist`);
        assert.ok(!this._editors.has(data.id), `editor '${data.id}' already exists!`);
        const documentData = this._documents.get(resource).value;
        const editor = new ExtHostTextEditor(
          data.id,
          this._extHostRpc.getProxy(MainContext.MainThreadTextEditors),
          this._logService,
          new Lazy(() => documentData.document),
          data.selections.map(typeConverters.Selection.to),
          data.options,
          data.visibleRanges.map((range) => typeConverters.Range.to(range)),
          typeof data.editorPosition === "number" ? typeConverters.ViewColumn.to(data.editorPosition) : void 0
        );
        this._editors.set(data.id, editor);
      }
    }
    if (delta.newActiveEditor !== void 0) {
      assert.ok(delta.newActiveEditor === null || this._editors.has(delta.newActiveEditor), `active editor '${delta.newActiveEditor}' does not exist`);
      this._activeEditorId = delta.newActiveEditor;
    }
    dispose(removedDocuments);
    dispose(removedEditors);
    if (delta.removedDocuments) {
      this._onDidRemoveDocuments.fire(removedDocuments);
    }
    if (delta.addedDocuments) {
      this._onDidAddDocuments.fire(addedDocuments);
    }
    if (delta.removedEditors || delta.addedEditors) {
      this._onDidChangeVisibleTextEditors.fire(this.allEditors().map((editor) => editor.value));
    }
    if (delta.newActiveEditor !== void 0) {
      this._onDidChangeActiveTextEditor.fire(this.activeEditor());
    }
  }
  getDocument(uri) {
    return this._documents.get(uri)?.value;
  }
  allDocuments() {
    return Iterable.map(this._documents.values(), (ref) => ref.value);
  }
  getEditor(id) {
    return this._editors.get(id);
  }
  activeEditor(internal) {
    if (!this._activeEditorId) {
      return void 0;
    }
    const editor = this._editors.get(this._activeEditorId);
    if (internal) {
      return editor;
    } else {
      return editor?.value;
    }
  }
  allEditors() {
    return [...this._editors.values()];
  }
};
ExtHostDocumentsAndEditors = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, ILogService)
], ExtHostDocumentsAndEditors);
const IExtHostDocumentsAndEditors = createDecorator("IExtHostDocumentsAndEditors");
export {
  ExtHostDocumentsAndEditors,
  IExtHostDocumentsAndEditors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9yc1NoYXBlLCBJRG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhLCBNYWluQ29udGV4dCB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnREYXRhIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnREYXRhLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFRleHRFZGl0b3IgfSBmcm9tICcuL2V4dEhvc3RUZXh0RWRpdG9yLmpzJztcbmltcG9ydCAqIGFzIHR5cGVDb252ZXJ0ZXJzIGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5cbmNsYXNzIFJlZmVyZW5jZTxUPiB7XG5cdHByaXZhdGUgX2NvdW50ID0gMDtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgdmFsdWU6IFQpIHsgfVxuXHRyZWYoKSB7XG5cdFx0dGhpcy5fY291bnQrKztcblx0fVxuXHR1bnJlZigpIHtcblx0XHRyZXR1cm4gLS10aGlzLl9jb3VudCA9PT0gMDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgaW1wbGVtZW50cyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9yc1NoYXBlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfYWN0aXZlRWRpdG9ySWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcnMgPSBuZXcgTWFwPHN0cmluZywgRXh0SG9zdFRleHRFZGl0b3I+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50cyA9IG5ldyBSZXNvdXJjZU1hcDxSZWZlcmVuY2U8RXh0SG9zdERvY3VtZW50RGF0YT4+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBZGREb2N1bWVudHMgPSBuZXcgRW1pdHRlcjxyZWFkb25seSBFeHRIb3N0RG9jdW1lbnREYXRhW10+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVtb3ZlRG9jdW1lbnRzID0gbmV3IEVtaXR0ZXI8cmVhZG9ubHkgRXh0SG9zdERvY3VtZW50RGF0YVtdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpc2libGVUZXh0RWRpdG9ycyA9IG5ldyBFbWl0dGVyPHJlYWRvbmx5IHZzY29kZS5UZXh0RWRpdG9yW10+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlVGV4dEVkaXRvciA9IG5ldyBFbWl0dGVyPHZzY29kZS5UZXh0RWRpdG9yIHwgdW5kZWZpbmVkPigpO1xuXG5cdHJlYWRvbmx5IG9uRGlkQWRkRG9jdW1lbnRzOiBFdmVudDxyZWFkb25seSBFeHRIb3N0RG9jdW1lbnREYXRhW10+ID0gdGhpcy5fb25EaWRBZGREb2N1bWVudHMuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlRG9jdW1lbnRzOiBFdmVudDxyZWFkb25seSBFeHRIb3N0RG9jdW1lbnREYXRhW10+ID0gdGhpcy5fb25EaWRSZW1vdmVEb2N1bWVudHMuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJsZVRleHRFZGl0b3JzOiBFdmVudDxyZWFkb25seSB2c2NvZGUuVGV4dEVkaXRvcltdPiA9IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJsZVRleHRFZGl0b3JzLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZVRleHRFZGl0b3I6IEV2ZW50PHZzY29kZS5UZXh0RWRpdG9yIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlVGV4dEVkaXRvci5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RScGNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RScGM6IElFeHRIb3N0UnBjU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7IH1cblxuXHQkYWNjZXB0RG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKGRlbHRhOiBJRG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKTogdm9pZCB7XG5cdFx0dGhpcy5hY2NlcHREb2N1bWVudHNBbmRFZGl0b3JzRGVsdGEoZGVsdGEpO1xuXHR9XG5cblx0YWNjZXB0RG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKGRlbHRhOiBJRG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKTogdm9pZCB7XG5cblx0XHRjb25zdCByZW1vdmVkRG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnREYXRhW10gPSBbXTtcblx0XHRjb25zdCBhZGRlZERvY3VtZW50czogRXh0SG9zdERvY3VtZW50RGF0YVtdID0gW107XG5cdFx0Y29uc3QgcmVtb3ZlZEVkaXRvcnM6IEV4dEhvc3RUZXh0RWRpdG9yW10gPSBbXTtcblxuXHRcdGlmIChkZWx0YS5yZW1vdmVkRG9jdW1lbnRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHVyaUNvbXBvbmVudCBvZiBkZWx0YS5yZW1vdmVkRG9jdW1lbnRzKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUodXJpQ29tcG9uZW50KTtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2RvY3VtZW50cy5nZXQodXJpKTtcblx0XHRcdFx0aWYgKGRhdGE/LnVucmVmKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9kb2N1bWVudHMuZGVsZXRlKHVyaSk7XG5cdFx0XHRcdFx0cmVtb3ZlZERvY3VtZW50cy5wdXNoKGRhdGEudmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGRlbHRhLmFkZGVkRG9jdW1lbnRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGRhdGEgb2YgZGVsdGEuYWRkZWREb2N1bWVudHMpIHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucmV2aXZlKGRhdGEudXJpKTtcblx0XHRcdFx0bGV0IHJlZiA9IHRoaXMuX2RvY3VtZW50cy5nZXQocmVzb3VyY2UpO1xuXG5cdFx0XHRcdC8vIGRvdWJsZSBjaGVjayAtPiBvbmx5IG5vdGVib29rIGNlbGwgZG9jdW1lbnRzIHNob3VsZCBiZVxuXHRcdFx0XHQvLyByZWZlcmVuY2VkL29wZW5lZCBtb3JlIHRoYW4gb25jZS4uLlxuXHRcdFx0XHRpZiAocmVmKSB7XG5cdFx0XHRcdFx0aWYgKHJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwgJiYgcmVzb3VyY2Uuc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZUludGVyYWN0aXZlSW5wdXQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgZG9jdW1lbnQgJyR7cmVzb3VyY2V9IGFscmVhZHkgZXhpc3RzISdgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFyZWYpIHtcblx0XHRcdFx0XHRyZWYgPSBuZXcgUmVmZXJlbmNlKG5ldyBFeHRIb3N0RG9jdW1lbnREYXRhKFxuXHRcdFx0XHRcdFx0dGhpcy5fZXh0SG9zdFJwYy5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkRG9jdW1lbnRzKSxcblx0XHRcdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRcdFx0ZGF0YS5saW5lcyxcblx0XHRcdFx0XHRcdGRhdGEuRU9MLFxuXHRcdFx0XHRcdFx0ZGF0YS52ZXJzaW9uSWQsXG5cdFx0XHRcdFx0XHRkYXRhLmxhbmd1YWdlSWQsXG5cdFx0XHRcdFx0XHRkYXRhLmlzRGlydHksXG5cdFx0XHRcdFx0XHRkYXRhLmVuY29kaW5nXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0dGhpcy5fZG9jdW1lbnRzLnNldChyZXNvdXJjZSwgcmVmKTtcblx0XHRcdFx0XHRhZGRlZERvY3VtZW50cy5wdXNoKHJlZi52YWx1ZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZWYucmVmKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGRlbHRhLnJlbW92ZWRFZGl0b3JzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGRlbHRhLnJlbW92ZWRFZGl0b3JzKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2VkaXRvcnMuZ2V0KGlkKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9ycy5kZWxldGUoaWQpO1xuXHRcdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdFx0cmVtb3ZlZEVkaXRvcnMucHVzaChlZGl0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGRlbHRhLmFkZGVkRWRpdG9ycykge1xuXHRcdFx0Zm9yIChjb25zdCBkYXRhIG9mIGRlbHRhLmFkZGVkRWRpdG9ycykge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5yZXZpdmUoZGF0YS5kb2N1bWVudFVyaSk7XG5cdFx0XHRcdGFzc2VydC5vayh0aGlzLl9kb2N1bWVudHMuaGFzKHJlc291cmNlKSwgYGRvY3VtZW50ICcke3Jlc291cmNlfScgZG9lcyBub3QgZXhpc3RgKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCF0aGlzLl9lZGl0b3JzLmhhcyhkYXRhLmlkKSwgYGVkaXRvciAnJHtkYXRhLmlkfScgYWxyZWFkeSBleGlzdHMhYCk7XG5cblx0XHRcdFx0Y29uc3QgZG9jdW1lbnREYXRhID0gdGhpcy5fZG9jdW1lbnRzLmdldChyZXNvdXJjZSkhLnZhbHVlO1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSBuZXcgRXh0SG9zdFRleHRFZGl0b3IoXG5cdFx0XHRcdFx0ZGF0YS5pZCxcblx0XHRcdFx0XHR0aGlzLl9leHRIb3N0UnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRUZXh0RWRpdG9ycyksXG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZSxcblx0XHRcdFx0XHRuZXcgTGF6eSgoKSA9PiBkb2N1bWVudERhdGEuZG9jdW1lbnQpLFxuXHRcdFx0XHRcdGRhdGEuc2VsZWN0aW9ucy5tYXAodHlwZUNvbnZlcnRlcnMuU2VsZWN0aW9uLnRvKSxcblx0XHRcdFx0XHRkYXRhLm9wdGlvbnMsXG5cdFx0XHRcdFx0ZGF0YS52aXNpYmxlUmFuZ2VzLm1hcChyYW5nZSA9PiB0eXBlQ29udmVydGVycy5SYW5nZS50byhyYW5nZSkpLFxuXHRcdFx0XHRcdHR5cGVvZiBkYXRhLmVkaXRvclBvc2l0aW9uID09PSAnbnVtYmVyJyA/IHR5cGVDb252ZXJ0ZXJzLlZpZXdDb2x1bW4udG8oZGF0YS5lZGl0b3JQb3NpdGlvbikgOiB1bmRlZmluZWRcblx0XHRcdFx0KTtcblx0XHRcdFx0dGhpcy5fZWRpdG9ycy5zZXQoZGF0YS5pZCwgZWRpdG9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZGVsdGEubmV3QWN0aXZlRWRpdG9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGFzc2VydC5vayhkZWx0YS5uZXdBY3RpdmVFZGl0b3IgPT09IG51bGwgfHwgdGhpcy5fZWRpdG9ycy5oYXMoZGVsdGEubmV3QWN0aXZlRWRpdG9yKSwgYGFjdGl2ZSBlZGl0b3IgJyR7ZGVsdGEubmV3QWN0aXZlRWRpdG9yfScgZG9lcyBub3QgZXhpc3RgKTtcblx0XHRcdHRoaXMuX2FjdGl2ZUVkaXRvcklkID0gZGVsdGEubmV3QWN0aXZlRWRpdG9yO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2UocmVtb3ZlZERvY3VtZW50cyk7XG5cdFx0ZGlzcG9zZShyZW1vdmVkRWRpdG9ycyk7XG5cblx0XHQvLyBub3cgdGhhdCB0aGUgaW50ZXJuYWwgc3RhdGUgaXMgY29tcGxldGUsIGZpcmUgZXZlbnRzXG5cdFx0aWYgKGRlbHRhLnJlbW92ZWREb2N1bWVudHMpIHtcblx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlRG9jdW1lbnRzLmZpcmUocmVtb3ZlZERvY3VtZW50cyk7XG5cdFx0fVxuXHRcdGlmIChkZWx0YS5hZGRlZERvY3VtZW50cykge1xuXHRcdFx0dGhpcy5fb25EaWRBZGREb2N1bWVudHMuZmlyZShhZGRlZERvY3VtZW50cyk7XG5cdFx0fVxuXG5cdFx0aWYgKGRlbHRhLnJlbW92ZWRFZGl0b3JzIHx8IGRlbHRhLmFkZGVkRWRpdG9ycykge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmxlVGV4dEVkaXRvcnMuZmlyZSh0aGlzLmFsbEVkaXRvcnMoKS5tYXAoZWRpdG9yID0+IGVkaXRvci52YWx1ZSkpO1xuXHRcdH1cblx0XHRpZiAoZGVsdGEubmV3QWN0aXZlRWRpdG9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlVGV4dEVkaXRvci5maXJlKHRoaXMuYWN0aXZlRWRpdG9yKCkpO1xuXHRcdH1cblx0fVxuXG5cdGdldERvY3VtZW50KHVyaTogVVJJKTogRXh0SG9zdERvY3VtZW50RGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvY3VtZW50cy5nZXQodXJpKT8udmFsdWU7XG5cdH1cblxuXHRhbGxEb2N1bWVudHMoKTogSXRlcmFibGU8RXh0SG9zdERvY3VtZW50RGF0YT4ge1xuXHRcdHJldHVybiBJdGVyYWJsZS5tYXAodGhpcy5fZG9jdW1lbnRzLnZhbHVlcygpLCByZWYgPT4gcmVmLnZhbHVlKTtcblx0fVxuXG5cdGdldEVkaXRvcihpZDogc3RyaW5nKTogRXh0SG9zdFRleHRFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JzLmdldChpZCk7XG5cdH1cblxuXHRhY3RpdmVFZGl0b3IoKTogdnNjb2RlLlRleHRFZGl0b3IgfCB1bmRlZmluZWQ7XG5cdGFjdGl2ZUVkaXRvcihpbnRlcm5hbDogdHJ1ZSk6IEV4dEhvc3RUZXh0RWRpdG9yIHwgdW5kZWZpbmVkO1xuXHRhY3RpdmVFZGl0b3IoaW50ZXJuYWw/OiB0cnVlKTogdnNjb2RlLlRleHRFZGl0b3IgfCBFeHRIb3N0VGV4dEVkaXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9hY3RpdmVFZGl0b3JJZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9ycy5nZXQodGhpcy5fYWN0aXZlRWRpdG9ySWQpO1xuXHRcdGlmIChpbnRlcm5hbCkge1xuXHRcdFx0cmV0dXJuIGVkaXRvcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGVkaXRvcj8udmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0YWxsRWRpdG9ycygpOiBFeHRIb3N0VGV4dEVkaXRvcltdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX2VkaXRvcnMudmFsdWVzKCldO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIGV4dGVuZHMgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgeyB9XG5leHBvcnQgY29uc3QgSUV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycz4oJ0lFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycycpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFlBQVk7QUFFeEIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsdUJBQXVCO0FBQ2hDLFNB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
