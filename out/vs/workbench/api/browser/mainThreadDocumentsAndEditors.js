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
import { Event } from "../../../base/common/event.js";
import { combinedDisposable, DisposableStore, DisposableMap } from "../../../base/common/lifecycle.js";
import { isCodeEditor, isDiffEditor } from "../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../editor/browser/services/codeEditorService.js";
import { shouldSynchronizeModel } from "../../../editor/common/model.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { ITextModelService } from "../../../editor/common/services/resolverService.js";
import { IFileService } from "../../../platform/files/common/files.js";
import { extHostCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { MainThreadDocuments } from "./mainThreadDocuments.js";
import { MainThreadTextEditor } from "./mainThreadEditor.js";
import { MainThreadTextEditors } from "./mainThreadEditors.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { AbstractTextEditor } from "../../browser/parts/editor/textEditor.js";
import { editorGroupToColumn } from "../../services/editor/common/editorGroupColumn.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { IEditorGroupsService } from "../../services/editor/common/editorGroupsService.js";
import { ITextFileService } from "../../services/textfile/common/textfiles.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { IWorkingCopyFileService } from "../../services/workingCopy/common/workingCopyFileService.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { IClipboardService } from "../../../platform/clipboard/common/clipboardService.js";
import { IPathService } from "../../services/path/common/pathService.js";
import { diffSets, diffMaps } from "../../../base/common/collections.js";
import { IPaneCompositePartService } from "../../services/panecomposite/browser/panecomposite.js";
import { ViewContainerLocation } from "../../common/views.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IQuickDiffModelService } from "../../contrib/scm/browser/quickDiffModel.js";
class TextEditorSnapshot {
  constructor(editor) {
    this.editor = editor;
    this.id = `${editor.getId()},${editor.getModel().id}`;
  }
}
class DocumentAndEditorStateDelta {
  constructor(removedDocuments, addedDocuments, removedEditors, addedEditors, oldActiveEditor, newActiveEditor) {
    this.removedDocuments = removedDocuments;
    this.addedDocuments = addedDocuments;
    this.removedEditors = removedEditors;
    this.addedEditors = addedEditors;
    this.oldActiveEditor = oldActiveEditor;
    this.newActiveEditor = newActiveEditor;
    this.isEmpty = this.removedDocuments.length === 0 && this.addedDocuments.length === 0 && this.removedEditors.length === 0 && this.addedEditors.length === 0 && oldActiveEditor === newActiveEditor;
  }
  toString() {
    let ret = "DocumentAndEditorStateDelta\n";
    ret += `	Removed Documents: [${this.removedDocuments.map((d) => d.uri.toString(true)).join(", ")}]
`;
    ret += `	Added Documents: [${this.addedDocuments.map((d) => d.uri.toString(true)).join(", ")}]
`;
    ret += `	Removed Editors: [${this.removedEditors.map((e) => e.id).join(", ")}]
`;
    ret += `	Added Editors: [${this.addedEditors.map((e) => e.id).join(", ")}]
`;
    ret += `	New Active Editor: ${this.newActiveEditor}
`;
    return ret;
  }
}
class DocumentAndEditorState {
  constructor(documents, textEditors, activeEditor) {
    this.documents = documents;
    this.textEditors = textEditors;
    this.activeEditor = activeEditor;
  }
  static compute(before, after) {
    if (!before) {
      return new DocumentAndEditorStateDelta(
        [],
        [...after.documents.values()],
        [],
        [...after.textEditors.values()],
        void 0,
        after.activeEditor
      );
    }
    const documentDelta = diffSets(before.documents, after.documents);
    const editorDelta = diffMaps(before.textEditors, after.textEditors);
    const oldActiveEditor = before.activeEditor !== after.activeEditor ? before.activeEditor : void 0;
    const newActiveEditor = before.activeEditor !== after.activeEditor ? after.activeEditor : void 0;
    return new DocumentAndEditorStateDelta(
      documentDelta.removed,
      documentDelta.added,
      editorDelta.removed,
      editorDelta.added,
      oldActiveEditor,
      newActiveEditor
    );
  }
}
var ActiveEditorOrder = /* @__PURE__ */ ((ActiveEditorOrder2) => {
  ActiveEditorOrder2[ActiveEditorOrder2["Editor"] = 0] = "Editor";
  ActiveEditorOrder2[ActiveEditorOrder2["Panel"] = 1] = "Panel";
  return ActiveEditorOrder2;
})(ActiveEditorOrder || {});
let MainThreadDocumentAndEditorStateComputer = class {
  constructor(_onDidChangeState, _modelService, _codeEditorService, _editorService, _paneCompositeService) {
    this._onDidChangeState = _onDidChangeState;
    this._modelService = _modelService;
    this._codeEditorService = _codeEditorService;
    this._editorService = _editorService;
    this._paneCompositeService = _paneCompositeService;
    this._toDispose = new DisposableStore();
    this._toDisposeOnEditorRemove = new DisposableMap();
    this._activeEditorOrder = 0 /* Editor */;
    this._modelService.onModelAdded(this._updateStateOnModelAdd, this, this._toDispose);
    this._modelService.onModelRemoved((_) => this._updateState(), this, this._toDispose);
    this._editorService.onDidActiveEditorChange((_) => this._updateState(), this, this._toDispose);
    this._codeEditorService.onCodeEditorAdd(this._onDidAddEditor, this, this._toDispose);
    this._codeEditorService.onCodeEditorRemove(this._onDidRemoveEditor, this, this._toDispose);
    this._codeEditorService.listCodeEditors().forEach(this._onDidAddEditor, this);
    Event.filter(this._paneCompositeService.onDidPaneCompositeOpen, (event) => event.viewContainerLocation === ViewContainerLocation.Panel)((_) => this._activeEditorOrder = 1 /* Panel */, void 0, this._toDispose);
    Event.filter(this._paneCompositeService.onDidPaneCompositeClose, (event) => event.viewContainerLocation === ViewContainerLocation.Panel)((_) => this._activeEditorOrder = 0 /* Editor */, void 0, this._toDispose);
    this._editorService.onDidVisibleEditorsChange((_) => this._activeEditorOrder = 0 /* Editor */, void 0, this._toDispose);
    this._updateState();
  }
  dispose() {
    this._toDispose.dispose();
    this._toDisposeOnEditorRemove.dispose();
  }
  _onDidAddEditor(e) {
    this._toDisposeOnEditorRemove.set(e.getId(), combinedDisposable(
      e.onDidChangeModel(() => this._updateState()),
      e.onDidFocusEditorText(() => this._updateState()),
      e.onDidFocusEditorWidget(() => this._updateState(e))
    ));
    this._updateState();
  }
  _onDidRemoveEditor(e) {
    const id = e.getId();
    if (this._toDisposeOnEditorRemove.has(id)) {
      this._toDisposeOnEditorRemove.deleteAndDispose(id);
      this._updateState();
    }
  }
  _updateStateOnModelAdd(model) {
    if (!shouldSynchronizeModel(model)) {
      return;
    }
    if (!this._currentState) {
      this._updateState();
      return;
    }
    this._currentState = new DocumentAndEditorState(
      this._currentState.documents.add(model),
      this._currentState.textEditors,
      this._currentState.activeEditor
    );
    this._onDidChangeState(new DocumentAndEditorStateDelta(
      [],
      [model],
      [],
      [],
      void 0,
      void 0
    ));
  }
  _updateState(widgetFocusCandidate) {
    const models = /* @__PURE__ */ new Set();
    for (const model of this._modelService.getModels()) {
      if (shouldSynchronizeModel(model)) {
        models.add(model);
      }
    }
    const editors = /* @__PURE__ */ new Map();
    let activeEditor = null;
    for (const editor of this._codeEditorService.listCodeEditors()) {
      if (editor.isSimpleWidget) {
        continue;
      }
      const model = editor.getModel();
      if (editor.hasModel() && model && shouldSynchronizeModel(model) && !model.isDisposed() && Boolean(this._modelService.getModel(model.uri))) {
        const apiEditor = new TextEditorSnapshot(editor);
        editors.set(apiEditor.id, apiEditor);
        if (editor.hasTextFocus() || widgetFocusCandidate === editor && editor.hasWidgetFocus()) {
          activeEditor = apiEditor.id;
        }
      }
    }
    if (!activeEditor) {
      let candidate;
      if (this._activeEditorOrder === 0 /* Editor */) {
        candidate = this._getActiveEditorFromEditorPart() || this._getActiveEditorFromPanel();
      } else {
        candidate = this._getActiveEditorFromPanel() || this._getActiveEditorFromEditorPart();
      }
      if (candidate) {
        for (const snapshot of editors.values()) {
          if (candidate === snapshot.editor) {
            activeEditor = snapshot.id;
          }
        }
      }
    }
    const newState = new DocumentAndEditorState(models, editors, activeEditor);
    const delta = DocumentAndEditorState.compute(this._currentState, newState);
    if (!delta.isEmpty) {
      this._currentState = newState;
      this._onDidChangeState(delta);
    }
  }
  _getActiveEditorFromPanel() {
    const panel = this._paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
    if (panel instanceof AbstractTextEditor) {
      const control = panel.getControl();
      if (isCodeEditor(control)) {
        return control;
      }
    }
    return void 0;
  }
  _getActiveEditorFromEditorPart() {
    let activeTextEditorControl = this._editorService.activeTextEditorControl;
    if (isDiffEditor(activeTextEditorControl)) {
      activeTextEditorControl = activeTextEditorControl.getModifiedEditor();
    }
    return activeTextEditorControl;
  }
};
MainThreadDocumentAndEditorStateComputer = __decorateClass([
  __decorateParam(1, IModelService),
  __decorateParam(2, ICodeEditorService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IPaneCompositePartService)
], MainThreadDocumentAndEditorStateComputer);
let MainThreadDocumentsAndEditors = class {
  constructor(extHostContext, _modelService, _textFileService, _editorService, codeEditorService, fileService, textModelResolverService, _editorGroupService, paneCompositeService, environmentService, workingCopyFileService, uriIdentityService, _clipboardService, pathService, configurationService, quickDiffModelService) {
    this._modelService = _modelService;
    this._textFileService = _textFileService;
    this._editorService = _editorService;
    this._editorGroupService = _editorGroupService;
    this._clipboardService = _clipboardService;
    this._toDispose = new DisposableStore();
    this._textEditors = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDocumentsAndEditors);
    this._mainThreadDocuments = this._toDispose.add(new MainThreadDocuments(extHostContext, this._modelService, this._textFileService, fileService, textModelResolverService, environmentService, uriIdentityService, workingCopyFileService, pathService));
    extHostContext.set(MainContext.MainThreadDocuments, this._mainThreadDocuments);
    this._mainThreadEditors = this._toDispose.add(new MainThreadTextEditors(this, extHostContext, codeEditorService, this._editorService, this._editorGroupService, configurationService, quickDiffModelService, uriIdentityService));
    extHostContext.set(MainContext.MainThreadTextEditors, this._mainThreadEditors);
    this._toDispose.add(new MainThreadDocumentAndEditorStateComputer((delta) => this._onDelta(delta), _modelService, codeEditorService, this._editorService, paneCompositeService));
  }
  dispose() {
    this._toDispose.dispose();
  }
  _onDelta(delta) {
    const removedEditors = [];
    const addedEditors = [];
    const removedDocuments = delta.removedDocuments.map((m) => m.uri);
    for (const apiEditor of delta.addedEditors) {
      const mainThreadEditor = new MainThreadTextEditor(
        apiEditor.id,
        apiEditor.editor.getModel(),
        apiEditor.editor,
        { onGainedFocus() {
        }, onLostFocus() {
        } },
        this._mainThreadDocuments,
        this._modelService,
        this._clipboardService
      );
      this._textEditors.set(apiEditor.id, mainThreadEditor);
      addedEditors.push(mainThreadEditor);
    }
    for (const { id } of delta.removedEditors) {
      const mainThreadEditor = this._textEditors.get(id);
      if (mainThreadEditor) {
        mainThreadEditor.dispose();
        this._textEditors.delete(id);
        removedEditors.push(id);
      }
    }
    const extHostDelta = /* @__PURE__ */ Object.create(null);
    let empty = true;
    if (delta.newActiveEditor !== void 0) {
      empty = false;
      extHostDelta.newActiveEditor = delta.newActiveEditor;
    }
    if (removedDocuments.length > 0) {
      empty = false;
      extHostDelta.removedDocuments = removedDocuments;
    }
    if (removedEditors.length > 0) {
      empty = false;
      extHostDelta.removedEditors = removedEditors;
    }
    if (delta.addedDocuments.length > 0) {
      empty = false;
      extHostDelta.addedDocuments = delta.addedDocuments.map((m) => this._toModelAddData(m));
    }
    if (delta.addedEditors.length > 0) {
      empty = false;
      extHostDelta.addedEditors = addedEditors.map((e) => this._toTextEditorAddData(e));
    }
    if (!empty) {
      this._proxy.$acceptDocumentsAndEditorsDelta(extHostDelta);
      removedDocuments.forEach(this._mainThreadDocuments.handleModelRemoved, this._mainThreadDocuments);
      delta.addedDocuments.forEach(this._mainThreadDocuments.handleModelAdded, this._mainThreadDocuments);
      removedEditors.forEach(this._mainThreadEditors.handleTextEditorRemoved, this._mainThreadEditors);
      addedEditors.forEach(this._mainThreadEditors.handleTextEditorAdded, this._mainThreadEditors);
    }
  }
  _toModelAddData(model) {
    return {
      uri: model.uri,
      versionId: model.getVersionId(),
      lines: model.getLinesContent(),
      EOL: model.getEOL(),
      languageId: model.getLanguageId(),
      isDirty: this._textFileService.isDirty(model.uri),
      encoding: this._textFileService.getEncoding(model.uri)
    };
  }
  _toTextEditorAddData(textEditor) {
    const props = textEditor.getProperties();
    return {
      id: textEditor.getId(),
      documentUri: textEditor.getModel().uri,
      options: props.options,
      selections: props.selections,
      visibleRanges: props.visibleRanges,
      editorPosition: this._findEditorPosition(textEditor)
    };
  }
  _findEditorPosition(editor) {
    for (const editorPane of this._editorService.visibleEditorPanes) {
      if (editor.matches(editorPane)) {
        return editorGroupToColumn(this._editorGroupService, editorPane.group);
      }
    }
    return void 0;
  }
  findTextEditorIdFor(editorPane) {
    for (const [id, editor] of this._textEditors) {
      if (editor.matches(editorPane)) {
        return id;
      }
    }
    return void 0;
  }
  getIdOfCodeEditor(codeEditor) {
    for (const [id, editor] of this._textEditors) {
      if (editor.getCodeEditor() === codeEditor) {
        return id;
      }
    }
    return void 0;
  }
  getEditor(id) {
    return this._textEditors.get(id);
  }
};
MainThreadDocumentsAndEditors = __decorateClass([
  extHostCustomer,
  __decorateParam(1, IModelService),
  __decorateParam(2, ITextFileService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, IFileService),
  __decorateParam(6, ITextModelService),
  __decorateParam(7, IEditorGroupsService),
  __decorateParam(8, IPaneCompositePartService),
  __decorateParam(9, IWorkbenchEnvironmentService),
  __decorateParam(10, IWorkingCopyFileService),
  __decorateParam(11, IUriIdentityService),
  __decorateParam(12, IClipboardService),
  __decorateParam(13, IPathService),
  __decorateParam(14, IConfigurationService),
  __decorateParam(15, IQuickDiffModelService)
], MainThreadDocumentsAndEditors);
export {
  MainThreadDocumentsAndEditors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkRG9jdW1lbnRzQW5kRWRpdG9ycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY29tYmluZWREaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIGlzQ29kZUVkaXRvciwgaXNEaWZmRWRpdG9yLCBJQWN0aXZlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwsIHNob3VsZFN5bmNocm9uaXplTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGV4dEhvc3RDdXN0b21lciwgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkRG9jdW1lbnRzIH0gZnJvbSAnLi9tYWluVGhyZWFkRG9jdW1lbnRzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRUZXh0RWRpdG9yIH0gZnJvbSAnLi9tYWluVGhyZWFkRWRpdG9yLmpzJztcbmltcG9ydCB7IElNYWluVGhyZWFkRWRpdG9yTG9jYXRvciwgTWFpblRocmVhZFRleHRFZGl0b3JzIH0gZnJvbSAnLi9tYWluVGhyZWFkRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29udGV4dCwgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnNTaGFwZSwgSURvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSwgSU1vZGVsQWRkZWREYXRhLCBJVGV4dEVkaXRvckFkZERhdGEsIE1haW5Db250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RUZXh0RWRpdG9yIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvdGV4dEVkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yR3JvdXBDb2x1bW4sIGVkaXRvckdyb3VwVG9Db2x1bW4gfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3VwQ29sdW1uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBkaWZmU2V0cywgZGlmZk1hcHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrRGlmZk1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvc2NtL2Jyb3dzZXIvcXVpY2tEaWZmTW9kZWwuanMnO1xuXG5cbmNsYXNzIFRleHRFZGl0b3JTbmFwc2hvdCB7XG5cblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yLFxuXHQpIHtcblx0XHR0aGlzLmlkID0gYCR7ZWRpdG9yLmdldElkKCl9LCR7ZWRpdG9yLmdldE1vZGVsKCkuaWR9YDtcblx0fVxufVxuXG5jbGFzcyBEb2N1bWVudEFuZEVkaXRvclN0YXRlRGVsdGEge1xuXG5cdHJlYWRvbmx5IGlzRW1wdHk6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcmVtb3ZlZERvY3VtZW50czogSVRleHRNb2RlbFtdLFxuXHRcdHJlYWRvbmx5IGFkZGVkRG9jdW1lbnRzOiBJVGV4dE1vZGVsW10sXG5cdFx0cmVhZG9ubHkgcmVtb3ZlZEVkaXRvcnM6IFRleHRFZGl0b3JTbmFwc2hvdFtdLFxuXHRcdHJlYWRvbmx5IGFkZGVkRWRpdG9yczogVGV4dEVkaXRvclNuYXBzaG90W10sXG5cdFx0cmVhZG9ubHkgb2xkQWN0aXZlRWRpdG9yOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IG5ld0FjdGl2ZUVkaXRvcjogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0dGhpcy5pc0VtcHR5ID0gdGhpcy5yZW1vdmVkRG9jdW1lbnRzLmxlbmd0aCA9PT0gMFxuXHRcdFx0JiYgdGhpcy5hZGRlZERvY3VtZW50cy5sZW5ndGggPT09IDBcblx0XHRcdCYmIHRoaXMucmVtb3ZlZEVkaXRvcnMubGVuZ3RoID09PSAwXG5cdFx0XHQmJiB0aGlzLmFkZGVkRWRpdG9ycy5sZW5ndGggPT09IDBcblx0XHRcdCYmIG9sZEFjdGl2ZUVkaXRvciA9PT0gbmV3QWN0aXZlRWRpdG9yO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRsZXQgcmV0ID0gJ0RvY3VtZW50QW5kRWRpdG9yU3RhdGVEZWx0YVxcbic7XG5cdFx0cmV0ICs9IGBcXHRSZW1vdmVkIERvY3VtZW50czogWyR7dGhpcy5yZW1vdmVkRG9jdW1lbnRzLm1hcChkID0+IGQudXJpLnRvU3RyaW5nKHRydWUpKS5qb2luKCcsICcpfV1cXG5gO1xuXHRcdHJldCArPSBgXFx0QWRkZWQgRG9jdW1lbnRzOiBbJHt0aGlzLmFkZGVkRG9jdW1lbnRzLm1hcChkID0+IGQudXJpLnRvU3RyaW5nKHRydWUpKS5qb2luKCcsICcpfV1cXG5gO1xuXHRcdHJldCArPSBgXFx0UmVtb3ZlZCBFZGl0b3JzOiBbJHt0aGlzLnJlbW92ZWRFZGl0b3JzLm1hcChlID0+IGUuaWQpLmpvaW4oJywgJyl9XVxcbmA7XG5cdFx0cmV0ICs9IGBcXHRBZGRlZCBFZGl0b3JzOiBbJHt0aGlzLmFkZGVkRWRpdG9ycy5tYXAoZSA9PiBlLmlkKS5qb2luKCcsICcpfV1cXG5gO1xuXHRcdHJldCArPSBgXFx0TmV3IEFjdGl2ZSBFZGl0b3I6ICR7dGhpcy5uZXdBY3RpdmVFZGl0b3J9XFxuYDtcblx0XHRyZXR1cm4gcmV0O1xuXHR9XG59XG5cbmNsYXNzIERvY3VtZW50QW5kRWRpdG9yU3RhdGUge1xuXG5cdHN0YXRpYyBjb21wdXRlKGJlZm9yZTogRG9jdW1lbnRBbmRFZGl0b3JTdGF0ZSB8IHVuZGVmaW5lZCwgYWZ0ZXI6IERvY3VtZW50QW5kRWRpdG9yU3RhdGUpOiBEb2N1bWVudEFuZEVkaXRvclN0YXRlRGVsdGEge1xuXHRcdGlmICghYmVmb3JlKSB7XG5cdFx0XHRyZXR1cm4gbmV3IERvY3VtZW50QW5kRWRpdG9yU3RhdGVEZWx0YShcblx0XHRcdFx0W10sIFsuLi5hZnRlci5kb2N1bWVudHMudmFsdWVzKCldLFxuXHRcdFx0XHRbXSwgWy4uLmFmdGVyLnRleHRFZGl0b3JzLnZhbHVlcygpXSxcblx0XHRcdFx0dW5kZWZpbmVkLCBhZnRlci5hY3RpdmVFZGl0b3Jcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGNvbnN0IGRvY3VtZW50RGVsdGEgPSBkaWZmU2V0cyhiZWZvcmUuZG9jdW1lbnRzLCBhZnRlci5kb2N1bWVudHMpO1xuXHRcdGNvbnN0IGVkaXRvckRlbHRhID0gZGlmZk1hcHMoYmVmb3JlLnRleHRFZGl0b3JzLCBhZnRlci50ZXh0RWRpdG9ycyk7XG5cdFx0Y29uc3Qgb2xkQWN0aXZlRWRpdG9yID0gYmVmb3JlLmFjdGl2ZUVkaXRvciAhPT0gYWZ0ZXIuYWN0aXZlRWRpdG9yID8gYmVmb3JlLmFjdGl2ZUVkaXRvciA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBuZXdBY3RpdmVFZGl0b3IgPSBiZWZvcmUuYWN0aXZlRWRpdG9yICE9PSBhZnRlci5hY3RpdmVFZGl0b3IgPyBhZnRlci5hY3RpdmVFZGl0b3IgOiB1bmRlZmluZWQ7XG5cblx0XHRyZXR1cm4gbmV3IERvY3VtZW50QW5kRWRpdG9yU3RhdGVEZWx0YShcblx0XHRcdGRvY3VtZW50RGVsdGEucmVtb3ZlZCwgZG9jdW1lbnREZWx0YS5hZGRlZCxcblx0XHRcdGVkaXRvckRlbHRhLnJlbW92ZWQsIGVkaXRvckRlbHRhLmFkZGVkLFxuXHRcdFx0b2xkQWN0aXZlRWRpdG9yLCBuZXdBY3RpdmVFZGl0b3Jcblx0XHQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgZG9jdW1lbnRzOiBTZXQ8SVRleHRNb2RlbD4sXG5cdFx0cmVhZG9ubHkgdGV4dEVkaXRvcnM6IE1hcDxzdHJpbmcsIFRleHRFZGl0b3JTbmFwc2hvdD4sXG5cdFx0cmVhZG9ubHkgYWN0aXZlRWRpdG9yOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLFxuXHQpIHtcblx0XHQvL1xuXHR9XG59XG5cbmNvbnN0IGVudW0gQWN0aXZlRWRpdG9yT3JkZXIge1xuXHRFZGl0b3IsIFBhbmVsXG59XG5cbmNsYXNzIE1haW5UaHJlYWREb2N1bWVudEFuZEVkaXRvclN0YXRlQ29tcHV0ZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9EaXNwb3NlT25FZGl0b3JSZW1vdmUgPSBuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgX2N1cnJlbnRTdGF0ZT86IERvY3VtZW50QW5kRWRpdG9yU3RhdGU7XG5cdHByaXZhdGUgX2FjdGl2ZUVkaXRvck9yZGVyOiBBY3RpdmVFZGl0b3JPcmRlciA9IEFjdGl2ZUVkaXRvck9yZGVyLkVkaXRvcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVN0YXRlOiAoZGVsdGE6IERvY3VtZW50QW5kRWRpdG9yU3RhdGVEZWx0YSkgPT4gdm9pZCxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wYW5lQ29tcG9zaXRlU2VydmljZTogSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fbW9kZWxTZXJ2aWNlLm9uTW9kZWxBZGRlZCh0aGlzLl91cGRhdGVTdGF0ZU9uTW9kZWxBZGQsIHRoaXMsIHRoaXMuX3RvRGlzcG9zZSk7XG5cdFx0dGhpcy5fbW9kZWxTZXJ2aWNlLm9uTW9kZWxSZW1vdmVkKF8gPT4gdGhpcy5fdXBkYXRlU3RhdGUoKSwgdGhpcywgdGhpcy5fdG9EaXNwb3NlKTtcblx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKF8gPT4gdGhpcy5fdXBkYXRlU3RhdGUoKSwgdGhpcywgdGhpcy5fdG9EaXNwb3NlKTtcblxuXHRcdHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLm9uQ29kZUVkaXRvckFkZCh0aGlzLl9vbkRpZEFkZEVkaXRvciwgdGhpcywgdGhpcy5fdG9EaXNwb3NlKTtcblx0XHR0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5vbkNvZGVFZGl0b3JSZW1vdmUodGhpcy5fb25EaWRSZW1vdmVFZGl0b3IsIHRoaXMsIHRoaXMuX3RvRGlzcG9zZSk7XG5cdFx0dGhpcy5fY29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCkuZm9yRWFjaCh0aGlzLl9vbkRpZEFkZEVkaXRvciwgdGhpcyk7XG5cblx0XHRFdmVudC5maWx0ZXIodGhpcy5fcGFuZUNvbXBvc2l0ZVNlcnZpY2Uub25EaWRQYW5lQ29tcG9zaXRlT3BlbiwgZXZlbnQgPT4gZXZlbnQudmlld0NvbnRhaW5lckxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpKF8gPT4gdGhpcy5fYWN0aXZlRWRpdG9yT3JkZXIgPSBBY3RpdmVFZGl0b3JPcmRlci5QYW5lbCwgdW5kZWZpbmVkLCB0aGlzLl90b0Rpc3Bvc2UpO1xuXHRcdEV2ZW50LmZpbHRlcih0aGlzLl9wYW5lQ29tcG9zaXRlU2VydmljZS5vbkRpZFBhbmVDb21wb3NpdGVDbG9zZSwgZXZlbnQgPT4gZXZlbnQudmlld0NvbnRhaW5lckxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpKF8gPT4gdGhpcy5fYWN0aXZlRWRpdG9yT3JkZXIgPSBBY3RpdmVFZGl0b3JPcmRlci5FZGl0b3IsIHVuZGVmaW5lZCwgdGhpcy5fdG9EaXNwb3NlKTtcblx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UoXyA9PiB0aGlzLl9hY3RpdmVFZGl0b3JPcmRlciA9IEFjdGl2ZUVkaXRvck9yZGVyLkVkaXRvciwgdW5kZWZpbmVkLCB0aGlzLl90b0Rpc3Bvc2UpO1xuXG5cdFx0dGhpcy5fdXBkYXRlU3RhdGUoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2VPbkVkaXRvclJlbW92ZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZEFkZEVkaXRvcihlOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdHRoaXMuX3RvRGlzcG9zZU9uRWRpdG9yUmVtb3ZlLnNldChlLmdldElkKCksIGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRcdGUub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB0aGlzLl91cGRhdGVTdGF0ZSgpKSxcblx0XHRcdGUub25EaWRGb2N1c0VkaXRvclRleHQoKCkgPT4gdGhpcy5fdXBkYXRlU3RhdGUoKSksXG5cdFx0XHRlLm9uRGlkRm9jdXNFZGl0b3JXaWRnZXQoKCkgPT4gdGhpcy5fdXBkYXRlU3RhdGUoZSkpXG5cdFx0KSk7XG5cdFx0dGhpcy5fdXBkYXRlU3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX29uRGlkUmVtb3ZlRWRpdG9yKGU6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgaWQgPSBlLmdldElkKCk7XG5cdFx0aWYgKHRoaXMuX3RvRGlzcG9zZU9uRWRpdG9yUmVtb3ZlLmhhcyhpZCkpIHtcblx0XHRcdHRoaXMuX3RvRGlzcG9zZU9uRWRpdG9yUmVtb3ZlLmRlbGV0ZUFuZERpc3Bvc2UoaWQpO1xuXHRcdFx0dGhpcy5fdXBkYXRlU3RhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTdGF0ZU9uTW9kZWxBZGQobW9kZWw6IElUZXh0TW9kZWwpOiB2b2lkIHtcblx0XHRpZiAoIXNob3VsZFN5bmNocm9uaXplTW9kZWwobW9kZWwpKSB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2N1cnJlbnRTdGF0ZSkge1xuXHRcdFx0Ly8gdG9vIGVhcmx5XG5cdFx0XHR0aGlzLl91cGRhdGVTdGF0ZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHNtYWxsIChmYXN0KSBkZWx0YVxuXHRcdHRoaXMuX2N1cnJlbnRTdGF0ZSA9IG5ldyBEb2N1bWVudEFuZEVkaXRvclN0YXRlKFxuXHRcdFx0dGhpcy5fY3VycmVudFN0YXRlLmRvY3VtZW50cy5hZGQobW9kZWwpLFxuXHRcdFx0dGhpcy5fY3VycmVudFN0YXRlLnRleHRFZGl0b3JzLFxuXHRcdFx0dGhpcy5fY3VycmVudFN0YXRlLmFjdGl2ZUVkaXRvclxuXHRcdCk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlKG5ldyBEb2N1bWVudEFuZEVkaXRvclN0YXRlRGVsdGEoXG5cdFx0XHRbXSwgW21vZGVsXSxcblx0XHRcdFtdLCBbXSxcblx0XHRcdHVuZGVmaW5lZCwgdW5kZWZpbmVkXG5cdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTdGF0ZSh3aWRnZXRGb2N1c0NhbmRpZGF0ZT86IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cblx0XHQvLyBtb2RlbHM6IGlnbm9yZSB0b28gbGFyZ2UgbW9kZWxzXG5cdFx0Y29uc3QgbW9kZWxzID0gbmV3IFNldDxJVGV4dE1vZGVsPigpO1xuXHRcdGZvciAoY29uc3QgbW9kZWwgb2YgdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVscygpKSB7XG5cdFx0XHRpZiAoc2hvdWxkU3luY2hyb25pemVNb2RlbChtb2RlbCkpIHtcblx0XHRcdFx0bW9kZWxzLmFkZChtb2RlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gZWRpdG9yOiBvbmx5IHRha2UgdGhvc2UgdGhhdCBoYXZlIGEgbm90IHRvbyBsYXJnZSBtb2RlbFxuXHRcdGNvbnN0IGVkaXRvcnMgPSBuZXcgTWFwPHN0cmluZywgVGV4dEVkaXRvclNuYXBzaG90PigpO1xuXHRcdGxldCBhY3RpdmVFZGl0b3I6IHN0cmluZyB8IG51bGwgPSBudWxsOyAvLyBTdHJpY3QgbnVsbCB3b3JrLiBUaGlzIGRvZXNuJ3QgbGlrZSBiZWluZyB1bmRlZmluZWQhXG5cblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiB0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5saXN0Q29kZUVkaXRvcnMoKSkge1xuXHRcdFx0aWYgKGVkaXRvci5pc1NpbXBsZVdpZGdldCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAoZWRpdG9yLmhhc01vZGVsKCkgJiYgbW9kZWwgJiYgc2hvdWxkU3luY2hyb25pemVNb2RlbChtb2RlbClcblx0XHRcdFx0JiYgIW1vZGVsLmlzRGlzcG9zZWQoKSAvLyBtb2RlbCBkaXNwb3NlZFxuXHRcdFx0XHQmJiBCb29sZWFuKHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChtb2RlbC51cmkpKSAvLyBtb2RlbCBkaXNwb3NpbmcsIHRoZSBmbGFnIGRpZG4ndCBmbGlwIHlldCBidXQgdGhlIG1vZGVsIHNlcnZpY2UgYWxyZWFkeSByZW1vdmVkIGl0XG5cdFx0XHQpIHtcblx0XHRcdFx0Y29uc3QgYXBpRWRpdG9yID0gbmV3IFRleHRFZGl0b3JTbmFwc2hvdChlZGl0b3IpO1xuXHRcdFx0XHRlZGl0b3JzLnNldChhcGlFZGl0b3IuaWQsIGFwaUVkaXRvcik7XG5cdFx0XHRcdGlmIChlZGl0b3IuaGFzVGV4dEZvY3VzKCkgfHwgKHdpZGdldEZvY3VzQ2FuZGlkYXRlID09PSBlZGl0b3IgJiYgZWRpdG9yLmhhc1dpZGdldEZvY3VzKCkpKSB7XG5cdFx0XHRcdFx0Ly8gdGV4dCBmb2N1cyBoYXMgcHJpb3JpdHksIHdpZGdldCBmb2N1cyBpcyB0cmlja3kgYmVjYXVzZSBtdWx0aXBsZVxuXHRcdFx0XHRcdC8vIGVkaXRvcnMgbWlnaHQgY2xhaW0gd2lkZ2V0IGZvY3VzIGF0IHRoZSBzYW1lIHRpbWUuIHRoZXJlZm9yZSB3ZSB1c2UgYVxuXHRcdFx0XHRcdC8vIGNhbmRpZGF0ZSAod2hpY2ggaXMgdGhlIGVkaXRvciB0aGF0IGhhcyByYWlzZWQgYW4gd2lkZ2V0IGZvY3VzIGV2ZW50KVxuXHRcdFx0XHRcdC8vIGluIGFkZGl0aW9uIHRvIHRoZSB3aWRnZXQgZm9jdXMgY2hlY2tcblx0XHRcdFx0XHRhY3RpdmVFZGl0b3IgPSBhcGlFZGl0b3IuaWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBhY3RpdmUgZWRpdG9yOiBpZiBub25lIG9mIHRoZSBwcmV2aW91cyBlZGl0b3JzIGhhZCBmb2N1cyB3ZSB0cnlcblx0XHQvLyB0byBtYXRjaCBvdXRwdXQgcGFuZWxzIG9yIHRoZSBhY3RpdmUgd29ya2JlbmNoIGVkaXRvciB3aXRoXG5cdFx0Ly8gb25lIG9mIGVkaXRvciB3ZSBoYXZlIGp1c3QgY29tcHV0ZWRcblx0XHRpZiAoIWFjdGl2ZUVkaXRvcikge1xuXHRcdFx0bGV0IGNhbmRpZGF0ZTogSUVkaXRvciB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0aGlzLl9hY3RpdmVFZGl0b3JPcmRlciA9PT0gQWN0aXZlRWRpdG9yT3JkZXIuRWRpdG9yKSB7XG5cdFx0XHRcdGNhbmRpZGF0ZSA9IHRoaXMuX2dldEFjdGl2ZUVkaXRvckZyb21FZGl0b3JQYXJ0KCkgfHwgdGhpcy5fZ2V0QWN0aXZlRWRpdG9yRnJvbVBhbmVsKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjYW5kaWRhdGUgPSB0aGlzLl9nZXRBY3RpdmVFZGl0b3JGcm9tUGFuZWwoKSB8fCB0aGlzLl9nZXRBY3RpdmVFZGl0b3JGcm9tRWRpdG9yUGFydCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2FuZGlkYXRlKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc25hcHNob3Qgb2YgZWRpdG9ycy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdGlmIChjYW5kaWRhdGUgPT09IHNuYXBzaG90LmVkaXRvcikge1xuXHRcdFx0XHRcdFx0YWN0aXZlRWRpdG9yID0gc25hcHNob3QuaWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gY29tcHV0ZSBuZXcgc3RhdGUgYW5kIGNvbXBhcmUgYWdhaW5zdCBvbGRcblx0XHRjb25zdCBuZXdTdGF0ZSA9IG5ldyBEb2N1bWVudEFuZEVkaXRvclN0YXRlKG1vZGVscywgZWRpdG9ycywgYWN0aXZlRWRpdG9yKTtcblx0XHRjb25zdCBkZWx0YSA9IERvY3VtZW50QW5kRWRpdG9yU3RhdGUuY29tcHV0ZSh0aGlzLl9jdXJyZW50U3RhdGUsIG5ld1N0YXRlKTtcblx0XHRpZiAoIWRlbHRhLmlzRW1wdHkpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRTdGF0ZSA9IG5ld1N0YXRlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZShkZWx0YSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWN0aXZlRWRpdG9yRnJvbVBhbmVsKCk6IElFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHBhbmVsID0gdGhpcy5fcGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXHRcdGlmIChwYW5lbCBpbnN0YW5jZW9mIEFic3RyYWN0VGV4dEVkaXRvcikge1xuXHRcdFx0Y29uc3QgY29udHJvbCA9IHBhbmVsLmdldENvbnRyb2woKTtcblx0XHRcdGlmIChpc0NvZGVFZGl0b3IoY29udHJvbCkpIHtcblx0XHRcdFx0cmV0dXJuIGNvbnRyb2w7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFjdGl2ZUVkaXRvckZyb21FZGl0b3JQYXJ0KCk6IElFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdGxldCBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCA9IHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0aWYgKGlzRGlmZkVkaXRvcihhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCkpIHtcblx0XHRcdGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0TW9kaWZpZWRFZGl0b3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHR9XG59XG5cbkBleHRIb3N0Q3VzdG9tZXJcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkRG9jdW1lbnRzQW5kRWRpdG9ycyBpbXBsZW1lbnRzIElNYWluVGhyZWFkRWRpdG9yTG9jYXRvciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdG9EaXNwb3NlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnNTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbWFpblRocmVhZERvY3VtZW50czogTWFpblRocmVhZERvY3VtZW50cztcblx0cHJpdmF0ZSByZWFkb25seSBfbWFpblRocmVhZEVkaXRvcnM6IE1haW5UaHJlYWRUZXh0RWRpdG9ycztcblx0cHJpdmF0ZSByZWFkb25seSBfdGV4dEVkaXRvcnMgPSBuZXcgTWFwPHN0cmluZywgTWFpblRocmVhZFRleHRFZGl0b3I+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIHBhbmVDb21wb3NpdGVTZXJ2aWNlOiBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RmlsZVNlcnZpY2Ugd29ya2luZ0NvcHlGaWxlU2VydmljZTogSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tEaWZmTW9kZWxTZXJ2aWNlIHF1aWNrRGlmZk1vZGVsU2VydmljZTogSVF1aWNrRGlmZk1vZGVsU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKTtcblxuXHRcdHRoaXMuX21haW5UaHJlYWREb2N1bWVudHMgPSB0aGlzLl90b0Rpc3Bvc2UuYWRkKG5ldyBNYWluVGhyZWFkRG9jdW1lbnRzKGV4dEhvc3RDb250ZXh0LCB0aGlzLl9tb2RlbFNlcnZpY2UsIHRoaXMuX3RleHRGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UsIHRleHRNb2RlbFJlc29sdmVyU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIHdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsIHBhdGhTZXJ2aWNlKSk7XG5cdFx0ZXh0SG9zdENvbnRleHQuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWREb2N1bWVudHMsIHRoaXMuX21haW5UaHJlYWREb2N1bWVudHMpO1xuXG5cdFx0dGhpcy5fbWFpblRocmVhZEVkaXRvcnMgPSB0aGlzLl90b0Rpc3Bvc2UuYWRkKG5ldyBNYWluVGhyZWFkVGV4dEVkaXRvcnModGhpcywgZXh0SG9zdENvbnRleHQsIGNvZGVFZGl0b3JTZXJ2aWNlLCB0aGlzLl9lZGl0b3JTZXJ2aWNlLCB0aGlzLl9lZGl0b3JHcm91cFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBxdWlja0RpZmZNb2RlbFNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSkpO1xuXHRcdGV4dEhvc3RDb250ZXh0LnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkVGV4dEVkaXRvcnMsIHRoaXMuX21haW5UaHJlYWRFZGl0b3JzKTtcblxuXHRcdC8vIEl0IGlzIGV4cGVjdGVkIHRoYXQgdGhlIGN0b3Igb2YgdGhlIHN0YXRlIGNvbXB1dGVyIGNhbGxzIG91ciBgX29uRGVsdGFgLlxuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQobmV3IE1haW5UaHJlYWREb2N1bWVudEFuZEVkaXRvclN0YXRlQ29tcHV0ZXIoZGVsdGEgPT4gdGhpcy5fb25EZWx0YShkZWx0YSksIF9tb2RlbFNlcnZpY2UsIGNvZGVFZGl0b3JTZXJ2aWNlLCB0aGlzLl9lZGl0b3JTZXJ2aWNlLCBwYW5lQ29tcG9zaXRlU2VydmljZSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EZWx0YShkZWx0YTogRG9jdW1lbnRBbmRFZGl0b3JTdGF0ZURlbHRhKTogdm9pZCB7XG5cblx0XHRjb25zdCByZW1vdmVkRWRpdG9yczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBhZGRlZEVkaXRvcnM6IE1haW5UaHJlYWRUZXh0RWRpdG9yW10gPSBbXTtcblxuXHRcdC8vIHJlbW92ZWQgbW9kZWxzXG5cdFx0Y29uc3QgcmVtb3ZlZERvY3VtZW50cyA9IGRlbHRhLnJlbW92ZWREb2N1bWVudHMubWFwKG0gPT4gbS51cmkpO1xuXG5cdFx0Ly8gYWRkZWQgZWRpdG9yc1xuXHRcdGZvciAoY29uc3QgYXBpRWRpdG9yIG9mIGRlbHRhLmFkZGVkRWRpdG9ycykge1xuXHRcdFx0Y29uc3QgbWFpblRocmVhZEVkaXRvciA9IG5ldyBNYWluVGhyZWFkVGV4dEVkaXRvcihhcGlFZGl0b3IuaWQsIGFwaUVkaXRvci5lZGl0b3IuZ2V0TW9kZWwoKSxcblx0XHRcdFx0YXBpRWRpdG9yLmVkaXRvciwgeyBvbkdhaW5lZEZvY3VzKCkgeyB9LCBvbkxvc3RGb2N1cygpIHsgfSB9LCB0aGlzLl9tYWluVGhyZWFkRG9jdW1lbnRzLCB0aGlzLl9tb2RlbFNlcnZpY2UsIHRoaXMuX2NsaXBib2FyZFNlcnZpY2UpO1xuXG5cdFx0XHR0aGlzLl90ZXh0RWRpdG9ycy5zZXQoYXBpRWRpdG9yLmlkLCBtYWluVGhyZWFkRWRpdG9yKTtcblx0XHRcdGFkZGVkRWRpdG9ycy5wdXNoKG1haW5UaHJlYWRFZGl0b3IpO1xuXHRcdH1cblxuXHRcdC8vIHJlbW92ZWQgZWRpdG9yc1xuXHRcdGZvciAoY29uc3QgeyBpZCB9IG9mIGRlbHRhLnJlbW92ZWRFZGl0b3JzKSB7XG5cdFx0XHRjb25zdCBtYWluVGhyZWFkRWRpdG9yID0gdGhpcy5fdGV4dEVkaXRvcnMuZ2V0KGlkKTtcblx0XHRcdGlmIChtYWluVGhyZWFkRWRpdG9yKSB7XG5cdFx0XHRcdG1haW5UaHJlYWRFZGl0b3IuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl90ZXh0RWRpdG9ycy5kZWxldGUoaWQpO1xuXHRcdFx0XHRyZW1vdmVkRWRpdG9ycy5wdXNoKGlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBleHRIb3N0RGVsdGE6IElEb2N1bWVudHNBbmRFZGl0b3JzRGVsdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGxldCBlbXB0eSA9IHRydWU7XG5cdFx0aWYgKGRlbHRhLm5ld0FjdGl2ZUVkaXRvciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRlbXB0eSA9IGZhbHNlO1xuXHRcdFx0ZXh0SG9zdERlbHRhLm5ld0FjdGl2ZUVkaXRvciA9IGRlbHRhLm5ld0FjdGl2ZUVkaXRvcjtcblx0XHR9XG5cdFx0aWYgKHJlbW92ZWREb2N1bWVudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0ZW1wdHkgPSBmYWxzZTtcblx0XHRcdGV4dEhvc3REZWx0YS5yZW1vdmVkRG9jdW1lbnRzID0gcmVtb3ZlZERvY3VtZW50cztcblx0XHR9XG5cdFx0aWYgKHJlbW92ZWRFZGl0b3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdGVtcHR5ID0gZmFsc2U7XG5cdFx0XHRleHRIb3N0RGVsdGEucmVtb3ZlZEVkaXRvcnMgPSByZW1vdmVkRWRpdG9ycztcblx0XHR9XG5cdFx0aWYgKGRlbHRhLmFkZGVkRG9jdW1lbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdGVtcHR5ID0gZmFsc2U7XG5cdFx0XHRleHRIb3N0RGVsdGEuYWRkZWREb2N1bWVudHMgPSBkZWx0YS5hZGRlZERvY3VtZW50cy5tYXAobSA9PiB0aGlzLl90b01vZGVsQWRkRGF0YShtKSk7XG5cdFx0fVxuXHRcdGlmIChkZWx0YS5hZGRlZEVkaXRvcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0ZW1wdHkgPSBmYWxzZTtcblx0XHRcdGV4dEhvc3REZWx0YS5hZGRlZEVkaXRvcnMgPSBhZGRlZEVkaXRvcnMubWFwKGUgPT4gdGhpcy5fdG9UZXh0RWRpdG9yQWRkRGF0YShlKSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFlbXB0eSkge1xuXHRcdFx0Ly8gZmlyc3QgdXBkYXRlIGV4dCBob3N0XG5cdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0RG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKGV4dEhvc3REZWx0YSk7XG5cblx0XHRcdC8vIHNlY29uZCB1cGRhdGUgZGVwZW5kZW50IGRvY3VtZW50L2VkaXRvciBzdGF0ZXNcblx0XHRcdHJlbW92ZWREb2N1bWVudHMuZm9yRWFjaCh0aGlzLl9tYWluVGhyZWFkRG9jdW1lbnRzLmhhbmRsZU1vZGVsUmVtb3ZlZCwgdGhpcy5fbWFpblRocmVhZERvY3VtZW50cyk7XG5cdFx0XHRkZWx0YS5hZGRlZERvY3VtZW50cy5mb3JFYWNoKHRoaXMuX21haW5UaHJlYWREb2N1bWVudHMuaGFuZGxlTW9kZWxBZGRlZCwgdGhpcy5fbWFpblRocmVhZERvY3VtZW50cyk7XG5cblx0XHRcdHJlbW92ZWRFZGl0b3JzLmZvckVhY2godGhpcy5fbWFpblRocmVhZEVkaXRvcnMuaGFuZGxlVGV4dEVkaXRvclJlbW92ZWQsIHRoaXMuX21haW5UaHJlYWRFZGl0b3JzKTtcblx0XHRcdGFkZGVkRWRpdG9ycy5mb3JFYWNoKHRoaXMuX21haW5UaHJlYWRFZGl0b3JzLmhhbmRsZVRleHRFZGl0b3JBZGRlZCwgdGhpcy5fbWFpblRocmVhZEVkaXRvcnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RvTW9kZWxBZGREYXRhKG1vZGVsOiBJVGV4dE1vZGVsKTogSU1vZGVsQWRkZWREYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiBtb2RlbC51cmksXG5cdFx0XHR2ZXJzaW9uSWQ6IG1vZGVsLmdldFZlcnNpb25JZCgpLFxuXHRcdFx0bGluZXM6IG1vZGVsLmdldExpbmVzQ29udGVudCgpLFxuXHRcdFx0RU9MOiBtb2RlbC5nZXRFT0woKSxcblx0XHRcdGxhbmd1YWdlSWQ6IG1vZGVsLmdldExhbmd1YWdlSWQoKSxcblx0XHRcdGlzRGlydHk6IHRoaXMuX3RleHRGaWxlU2VydmljZS5pc0RpcnR5KG1vZGVsLnVyaSksXG5cdFx0XHRlbmNvZGluZzogdGhpcy5fdGV4dEZpbGVTZXJ2aWNlLmdldEVuY29kaW5nKG1vZGVsLnVyaSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9UZXh0RWRpdG9yQWRkRGF0YSh0ZXh0RWRpdG9yOiBNYWluVGhyZWFkVGV4dEVkaXRvcik6IElUZXh0RWRpdG9yQWRkRGF0YSB7XG5cdFx0Y29uc3QgcHJvcHMgPSB0ZXh0RWRpdG9yLmdldFByb3BlcnRpZXMoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHRleHRFZGl0b3IuZ2V0SWQoKSxcblx0XHRcdGRvY3VtZW50VXJpOiB0ZXh0RWRpdG9yLmdldE1vZGVsKCkudXJpLFxuXHRcdFx0b3B0aW9uczogcHJvcHMub3B0aW9ucyxcblx0XHRcdHNlbGVjdGlvbnM6IHByb3BzLnNlbGVjdGlvbnMsXG5cdFx0XHR2aXNpYmxlUmFuZ2VzOiBwcm9wcy52aXNpYmxlUmFuZ2VzLFxuXHRcdFx0ZWRpdG9yUG9zaXRpb246IHRoaXMuX2ZpbmRFZGl0b3JQb3NpdGlvbih0ZXh0RWRpdG9yKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9maW5kRWRpdG9yUG9zaXRpb24oZWRpdG9yOiBNYWluVGhyZWFkVGV4dEVkaXRvcik6IEVkaXRvckdyb3VwQ29sdW1uIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGVkaXRvclBhbmUgb2YgdGhpcy5fZWRpdG9yU2VydmljZS52aXNpYmxlRWRpdG9yUGFuZXMpIHtcblx0XHRcdGlmIChlZGl0b3IubWF0Y2hlcyhlZGl0b3JQYW5lKSkge1xuXHRcdFx0XHRyZXR1cm4gZWRpdG9yR3JvdXBUb0NvbHVtbih0aGlzLl9lZGl0b3JHcm91cFNlcnZpY2UsIGVkaXRvclBhbmUuZ3JvdXApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZmluZFRleHRFZGl0b3JJZEZvcihlZGl0b3JQYW5lOiBJRWRpdG9yUGFuZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBbaWQsIGVkaXRvcl0gb2YgdGhpcy5fdGV4dEVkaXRvcnMpIHtcblx0XHRcdGlmIChlZGl0b3IubWF0Y2hlcyhlZGl0b3JQYW5lKSkge1xuXHRcdFx0XHRyZXR1cm4gaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRJZE9mQ29kZUVkaXRvcihjb2RlRWRpdG9yOiBJQ29kZUVkaXRvcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBbaWQsIGVkaXRvcl0gb2YgdGhpcy5fdGV4dEVkaXRvcnMpIHtcblx0XHRcdGlmIChlZGl0b3IuZ2V0Q29kZUVkaXRvcigpID09PSBjb2RlRWRpdG9yKSB7XG5cdFx0XHRcdHJldHVybiBpZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldEVkaXRvcihpZDogc3RyaW5nKTogTWFpblRocmVhZFRleHRFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90ZXh0RWRpdG9ycy5nZXQoaWQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLG9CQUFvQixpQkFBaUIscUJBQXFCO0FBQ25FLFNBQXNCLGNBQWMsb0JBQXVDO0FBQzNFLFNBQVMsMEJBQTBCO0FBRW5DLFNBQXFCLDhCQUE4QjtBQUNuRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHVCQUF3QztBQUNqRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFtQyw2QkFBNkI7QUFDaEUsU0FBUyxnQkFBaUgsbUJBQW1CO0FBQzdJLFNBQVMsMEJBQTBCO0FBRW5DLFNBQTRCLDJCQUEyQjtBQUN2RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFVBQVUsZ0JBQWdCO0FBQ25DLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsOEJBQThCO0FBR3ZDLE1BQU0sbUJBQW1CO0FBQUEsRUFJeEIsWUFDVSxRQUNSO0FBRFE7QUFFVCxTQUFLLEtBQUssR0FBRyxPQUFPLE1BQU0sQ0FBQyxJQUFJLE9BQU8sU0FBUyxFQUFFLEVBQUU7QUFBQSxFQUNwRDtBQUNEO0FBRUEsTUFBTSw0QkFBNEI7QUFBQSxFQUlqQyxZQUNVLGtCQUNBLGdCQUNBLGdCQUNBLGNBQ0EsaUJBQ0EsaUJBQ1I7QUFO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O0FBQy9GLG1CQUFhLFFBQVEsS0FBSyxtQkFBbUIsdUJBQXVCLEtBQUssa0JBQWtCO0FBQUEsSUFDNUY7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQkFBZ0IsT0FBb0M7QUFDM0QsV0FBTztBQUFBLE1BQ04sS0FBSyxNQUFNO0FBQUEsTUFDWCxXQUFXLE1BQU0sYUFBYTtBQUFBLE1BQzlCLE9BQU8sTUFBTSxnQkFBZ0I7QUFBQSxNQUM3QixLQUFLLE1BQU0sT0FBTztBQUFBLE1BQ2xCLFlBQVksTUFBTSxjQUFjO0FBQUEsTUFDaEMsU0FBUyxLQUFLLGlCQUFpQixRQUFRLE1BQU0sR0FBRztBQUFBLE1BQ2hELFVBQVUsS0FBSyxpQkFBaUIsWUFBWSxNQUFNLEdBQUc7QUFBQSxJQUN0RDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHFCQUFxQixZQUFzRDtBQUNsRixVQUFNLFFBQVEsV0FBVyxjQUFjO0FBQ3ZDLFdBQU87QUFBQSxNQUNOLElBQUksV0FBVyxNQUFNO0FBQUEsTUFDckIsYUFBYSxXQUFXLFNBQVMsRUFBRTtBQUFBLE1BQ25DLFNBQVMsTUFBTTtBQUFBLE1BQ2YsWUFBWSxNQUFNO0FBQUEsTUFDbEIsZUFBZSxNQUFNO0FBQUEsTUFDckIsZ0JBQWdCLEtBQUssb0JBQW9CLFVBQVU7QUFBQSxJQUNwRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG9CQUFvQixRQUE2RDtBQUN4RixlQUFXLGNBQWMsS0FBSyxlQUFlLG9CQUFvQjtBQUNoRSxVQUFJLE9BQU8sUUFBUSxVQUFVLEdBQUc7QUFDL0IsZUFBTyxvQkFBb0IsS0FBSyxxQkFBcUIsV0FBVyxLQUFLO0FBQUEsTUFDdEU7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLG9CQUFvQixZQUE2QztBQUNoRSxlQUFXLENBQUMsSUFBSSxNQUFNLEtBQUssS0FBSyxjQUFjO0FBQzdDLFVBQUksT0FBTyxRQUFRLFVBQVUsR0FBRztBQUMvQixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsa0JBQWtCLFlBQTZDO0FBQzlELGVBQVcsQ0FBQyxJQUFJLE1BQU0sS0FBSyxLQUFLLGNBQWM7QUFDN0MsVUFBSSxPQUFPLGNBQWMsTUFBTSxZQUFZO0FBQzFDLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxVQUFVLElBQThDO0FBQ3ZELFdBQU8sS0FBSyxhQUFhLElBQUksRUFBRTtBQUFBLEVBQ2hDO0FBQ0Q7QUEvSmEsZ0NBQU47QUFBQSxFQUROO0FBQUEsRUFXRTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F4QlU7IiwKICAibmFtZXMiOiBbIkFjdGl2ZUVkaXRvck9yZGVyIl0KfQo=
