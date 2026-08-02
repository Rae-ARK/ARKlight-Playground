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
import { illegalArgument } from "../../../base/common/errors.js";
import { dispose, DisposableStore } from "../../../base/common/lifecycle.js";
import { equals as objectEquals } from "../../../base/common/objects.js";
import { URI } from "../../../base/common/uri.js";
import { ICodeEditorService } from "../../../editor/browser/services/codeEditorService.js";
import { CommandsRegistry } from "../../../platform/commands/common/commands.js";
import { EditorActivation, EditorResolution, isTextEditorDiffInformationEqual } from "../../../platform/editor/common/editor.js";
import { ExtHostContext } from "../common/extHost.protocol.js";
import { editorGroupToColumn, columnToEditorGroup } from "../../services/editor/common/editorGroupColumn.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { IEditorGroupsService } from "../../services/editor/common/editorGroupsService.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { IWorkingCopyService } from "../../services/workingCopy/common/workingCopyService.js";
import { getCodeEditor } from "../../../editor/browser/editorBrowser.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IQuickDiffModelService } from "../../contrib/scm/browser/quickDiffModel.js";
import { autorun, constObservable, derived, derivedOpts, observableFromEvent } from "../../../base/common/observable.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { isITextModel } from "../../../editor/common/model.js";
import { equals } from "../../../base/common/arrays.js";
import { Event } from "../../../base/common/event.js";
let MainThreadTextEditors = class {
  constructor(_editorLocator, extHostContext, _codeEditorService, _editorService, _editorGroupService, _configurationService, _quickDiffModelService, _uriIdentityService) {
    this._editorLocator = _editorLocator;
    this._codeEditorService = _codeEditorService;
    this._editorService = _editorService;
    this._editorGroupService = _editorGroupService;
    this._configurationService = _configurationService;
    this._quickDiffModelService = _quickDiffModelService;
    this._uriIdentityService = _uriIdentityService;
    this._toDispose = new DisposableStore();
    this._instanceId = String(++MainThreadTextEditors.INSTANCE_COUNT);
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostEditors);
    this._textEditorsListenersMap = /* @__PURE__ */ Object.create(null);
    this._editorPositionData = null;
    this._toDispose.add(this._editorService.onDidVisibleEditorsChange(() => this._updateActiveAndVisibleTextEditors()));
    this._toDispose.add(this._editorGroupService.onDidRemoveGroup(() => this._updateActiveAndVisibleTextEditors()));
    this._toDispose.add(this._editorGroupService.onDidMoveGroup(() => this._updateActiveAndVisibleTextEditors()));
    this._registeredDecorationTypes = /* @__PURE__ */ Object.create(null);
  }
  dispose() {
    Object.keys(this._textEditorsListenersMap).forEach((editorId) => {
      dispose(this._textEditorsListenersMap[editorId]);
    });
    this._textEditorsListenersMap = /* @__PURE__ */ Object.create(null);
    this._toDispose.dispose();
    for (const decorationType in this._registeredDecorationTypes) {
      this._codeEditorService.removeDecorationType(decorationType);
    }
    this._registeredDecorationTypes = /* @__PURE__ */ Object.create(null);
  }
  handleTextEditorAdded(textEditor) {
    const id = textEditor.getId();
    const toDispose = [];
    toDispose.push(textEditor.onPropertiesChanged((data) => {
      this._proxy.$acceptEditorPropertiesChanged(id, data);
    }));
    const diffInformationObs = this._getTextEditorDiffInformation(textEditor, toDispose);
    toDispose.push(autorun((reader) => {
      const diffInformation = diffInformationObs.read(reader);
      this._proxy.$acceptEditorDiffInformation(id, diffInformation);
    }));
    this._textEditorsListenersMap[id] = toDispose;
  }
  handleTextEditorRemoved(id) {
    dispose(this._textEditorsListenersMap[id]);
    delete this._textEditorsListenersMap[id];
  }
  _updateActiveAndVisibleTextEditors() {
    const editorPositionData = this._getTextEditorPositionData();
    if (!objectEquals(this._editorPositionData, editorPositionData)) {
      this._editorPositionData = editorPositionData;
      this._proxy.$acceptEditorPositionData(this._editorPositionData);
    }
  }
  _getTextEditorPositionData() {
    const result = /* @__PURE__ */ Object.create(null);
    for (const editorPane of this._editorService.visibleEditorPanes) {
      const id = this._editorLocator.findTextEditorIdFor(editorPane);
      if (id) {
        result[id] = editorGroupToColumn(this._editorGroupService, editorPane.group);
      }
    }
    return result;
  }
  _getTextEditorDiffInformation(textEditor, toDispose) {
    const codeEditor = textEditor.getCodeEditor();
    if (!codeEditor) {
      return constObservable(void 0);
    }
    const [diffEditor] = this._codeEditorService.listDiffEditors().filter((d) => d.getOriginalEditor().getId() === codeEditor.getId() || d.getModifiedEditor().getId() === codeEditor.getId());
    const editorModelObs = diffEditor ? observableFromEvent(this, diffEditor.onDidChangeModel, () => diffEditor.getModel()) : observableFromEvent(this, codeEditor.onDidChangeModel, () => codeEditor.getModel());
    const editorChangesObs = derived((reader) => {
      const editorModel = editorModelObs.read(reader);
      if (!editorModel) {
        return constObservable(void 0);
      }
      if (isITextModel(editorModel)) {
        const quickDiffModelRef2 = this._quickDiffModelService.createQuickDiffModelReference(editorModel.uri);
        if (!quickDiffModelRef2) {
          return constObservable(void 0);
        }
        toDispose.push(quickDiffModelRef2);
        return observableFromEvent(this, quickDiffModelRef2.object.onDidChange, () => {
          return quickDiffModelRef2.object.getQuickDiffResults().map((result) => ({
            original: result.original,
            modified: result.modified,
            changes: result.changes2
          }));
        });
      }
      const diffAlgorithm = this._configurationService.getValue("diffEditor.diffAlgorithm");
      const quickDiffModelRef = this._quickDiffModelService.createQuickDiffModelReference(editorModel.modified.uri, { algorithm: diffAlgorithm });
      if (!quickDiffModelRef) {
        return constObservable(void 0);
      }
      toDispose.push(quickDiffModelRef);
      return observableFromEvent(Event.any(quickDiffModelRef.object.onDidChange, diffEditor.onDidUpdateDiff), () => {
        const diffChanges = diffEditor.getDiffComputationResult()?.changes2 ?? [];
        const diffInformation = [{
          original: editorModel.original.uri,
          modified: editorModel.modified.uri,
          changes: diffChanges.map((change) => change)
        }];
        const quickDiffInformation = quickDiffModelRef.object.getQuickDiffResults().filter((result) => result.providerKind !== "primary").map((result) => ({
          original: result.original,
          modified: result.modified,
          changes: result.changes2
        }));
        return diffInformation.concat(quickDiffInformation);
      });
    });
    return derivedOpts({
      owner: this,
      equalsFn: (diff1, diff2) => equals(diff1, diff2, (a, b) => isTextEditorDiffInformationEqual(this._uriIdentityService, a, b))
    }, (reader) => {
      const editorModel = editorModelObs.read(reader);
      const editorChanges = editorChangesObs.read(reader).read(reader);
      if (!editorModel || !editorChanges) {
        return void 0;
      }
      const documentVersion = isITextModel(editorModel) ? editorModel.getVersionId() : editorModel.modified.getVersionId();
      return editorChanges.map((change) => {
        const changes = change.changes.map((change2) => [
          change2.original.startLineNumber,
          change2.original.endLineNumberExclusive,
          change2.modified.startLineNumber,
          change2.modified.endLineNumberExclusive
        ]);
        return {
          documentVersion,
          original: change.original,
          modified: change.modified,
          changes
        };
      });
    });
  }
  // --- from extension host process
  async $tryShowTextDocument(resource, options) {
    const uri = URI.revive(resource);
    const editorOptions = {
      preserveFocus: options.preserveFocus,
      pinned: options.pinned,
      selection: options.selection,
      // preserve pre 1.38 behaviour to not make group active when preserveFocus: true
      // but make sure to restore the editor to fix https://github.com/microsoft/vscode/issues/79633
      activation: options.preserveFocus ? EditorActivation.RESTORE : void 0,
      override: EditorResolution.EXCLUSIVE_ONLY
    };
    const input = {
      resource: uri,
      options: editorOptions
    };
    const editor = await this._editorService.openEditor(input, columnToEditorGroup(this._editorGroupService, this._configurationService, options.position));
    if (!editor) {
      return void 0;
    }
    const editorControl = editor.getControl();
    const codeEditor = getCodeEditor(editorControl);
    return codeEditor ? this._editorLocator.getIdOfCodeEditor(codeEditor) : void 0;
  }
  async $tryShowEditor(id, position) {
    const mainThreadEditor = this._editorLocator.getEditor(id);
    if (mainThreadEditor) {
      const model = mainThreadEditor.getModel();
      await this._editorService.openEditor({
        resource: model.uri,
        options: { preserveFocus: false }
      }, columnToEditorGroup(this._editorGroupService, this._configurationService, position));
      return;
    }
  }
  async $tryHideEditor(id) {
    const mainThreadEditor = this._editorLocator.getEditor(id);
    if (mainThreadEditor) {
      const editorPanes = this._editorService.visibleEditorPanes;
      for (const editorPane of editorPanes) {
        if (mainThreadEditor.matches(editorPane)) {
          await editorPane.group.closeEditor(editorPane.input);
          return;
        }
      }
    }
  }
  $trySetSelections(id, selections) {
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    editor.setSelections(selections);
    return Promise.resolve(void 0);
  }
  $trySetDecorations(id, key, ranges) {
    key = `${this._instanceId}-${key}`;
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    editor.setDecorations(key, ranges);
    return Promise.resolve(void 0);
  }
  $trySetDecorationsFast(id, key, ranges) {
    key = `${this._instanceId}-${key}`;
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    editor.setDecorationsFast(key, ranges);
    return Promise.resolve(void 0);
  }
  $tryRevealRange(id, range, revealType) {
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    editor.revealRange(range, revealType);
    return Promise.resolve();
  }
  $trySetOptions(id, options) {
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    editor.setConfiguration(options);
    return Promise.resolve(void 0);
  }
  $tryApplyEdits(id, modelVersionId, edits, opts) {
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    return Promise.resolve(editor.applyEdits(modelVersionId, edits, opts));
  }
  $tryInsertSnippet(id, modelVersionId, template, ranges, opts) {
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    return Promise.resolve(editor.insertSnippet(modelVersionId, template, ranges, opts));
  }
  $registerTextEditorDecorationType(extensionId, key, options) {
    key = `${this._instanceId}-${key}`;
    this._registeredDecorationTypes[key] = true;
    this._codeEditorService.registerDecorationType(`exthost-api-${extensionId}`, key, options);
  }
  $removeTextEditorDecorationType(key) {
    key = `${this._instanceId}-${key}`;
    delete this._registeredDecorationTypes[key];
    this._codeEditorService.removeDecorationType(key);
  }
  $getDiffInformation(id) {
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(new Error("No such TextEditor"));
    }
    const codeEditor = editor.getCodeEditor();
    if (!codeEditor) {
      return Promise.reject(new Error("No such CodeEditor"));
    }
    const codeEditorId = codeEditor.getId();
    const diffEditors = this._codeEditorService.listDiffEditors();
    const [diffEditor] = diffEditors.filter((d) => d.getOriginalEditor().getId() === codeEditorId || d.getModifiedEditor().getId() === codeEditorId);
    if (diffEditor) {
      return Promise.resolve(diffEditor.getLineChanges() || []);
    }
    if (!codeEditor.hasModel()) {
      return Promise.resolve([]);
    }
    const quickDiffModelRef = this._quickDiffModelService.createQuickDiffModelReference(codeEditor.getModel().uri);
    if (!quickDiffModelRef) {
      return Promise.resolve([]);
    }
    try {
      const primaryQuickDiff = quickDiffModelRef.object.quickDiffs.find((quickDiff) => quickDiff.kind === "primary");
      const primaryQuickDiffChanges = quickDiffModelRef.object.changes.filter((change) => change.providerId === primaryQuickDiff?.id);
      return Promise.resolve(primaryQuickDiffChanges.map((change) => change.change) ?? []);
    } finally {
      quickDiffModelRef.dispose();
    }
  }
};
MainThreadTextEditors.INSTANCE_COUNT = 0;
MainThreadTextEditors = __decorateClass([
  __decorateParam(2, ICodeEditorService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IEditorGroupsService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IQuickDiffModelService),
  __decorateParam(7, IUriIdentityService)
], MainThreadTextEditors);
CommandsRegistry.registerCommand("_workbench.revertAllDirty", async function(accessor) {
  const environmentService = accessor.get(IEnvironmentService);
  if (!environmentService.extensionTestsLocationURI) {
    throw new Error("Command is only available when running extension tests.");
  }
  const workingCopyService = accessor.get(IWorkingCopyService);
  for (const workingCopy of workingCopyService.dirtyWorkingCopies) {
    await workingCopy.revert({ soft: true });
  }
});
export {
  MainThreadTextEditors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkRWRpdG9ycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlsbGVnYWxBcmd1bWVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgZGlzcG9zZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVxdWFscyBhcyBvYmplY3RFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSURlY29yYXRpb25PcHRpb25zLCBJRGVjb3JhdGlvblJlbmRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JPcHRpb25zLCBJUmVzb3VyY2VFZGl0b3JJbnB1dCwgRWRpdG9yQWN0aXZhdGlvbiwgRWRpdG9yUmVzb2x1dGlvbiwgSVRleHRFZGl0b3JEaWZmSW5mb3JtYXRpb24sIGlzVGV4dEVkaXRvckRpZmZJbmZvcm1hdGlvbkVxdWFsLCBJVGV4dEVkaXRvckNoYW5nZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRUZXh0RWRpdG9yIH0gZnJvbSAnLi9tYWluVGhyZWFkRWRpdG9yLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb250ZXh0LCBFeHRIb3N0RWRpdG9yc1NoYXBlLCBJQXBwbHlFZGl0c09wdGlvbnMsIElUZXh0RG9jdW1lbnRTaG93T3B0aW9ucywgSVRleHRFZGl0b3JDb25maWd1cmF0aW9uVXBkYXRlLCBJVGV4dEVkaXRvclBvc2l0aW9uRGF0YSwgSVVuZG9TdG9wT3B0aW9ucywgTWFpblRocmVhZFRleHRFZGl0b3JzU2hhcGUsIFRleHRFZGl0b3JSZXZlYWxUeXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgZWRpdG9yR3JvdXBUb0NvbHVtbiwgY29sdW1uVG9FZGl0b3JHcm91cCwgRWRpdG9yR3JvdXBDb2x1bW4gfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3VwQ29sdW1uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNoYW5nZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9sZWdhY3lMaW5lc0RpZmZDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cm9sIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBnZXRDb2RlRWRpdG9yLCBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tEaWZmTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9zY20vYnJvd3Nlci9xdWlja0RpZmZNb2RlbC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBpc0lUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpZmZBbGdvcml0aG1OYW1lIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElNYWluVGhyZWFkRWRpdG9yTG9jYXRvciB7XG5cdGdldEVkaXRvcihpZDogc3RyaW5nKTogTWFpblRocmVhZFRleHRFZGl0b3IgfCB1bmRlZmluZWQ7XG5cdGZpbmRUZXh0RWRpdG9ySWRGb3IoZWRpdG9yQ29udHJvbDogSUVkaXRvckNvbnRyb2wpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldElkT2ZDb2RlRWRpdG9yKGNvZGVFZGl0b3I6IElDb2RlRWRpdG9yKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZFRleHRFZGl0b3JzIGltcGxlbWVudHMgTWFpblRocmVhZFRleHRFZGl0b3JzU2hhcGUge1xuXG5cdHByaXZhdGUgc3RhdGljIElOU1RBTkNFX0NPVU5UOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbmNlSWQ6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RFZGl0b3JzU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBfdGV4dEVkaXRvcnNMaXN0ZW5lcnNNYXA6IHsgW2VkaXRvcklkOiBzdHJpbmddOiBJRGlzcG9zYWJsZVtdIH07XG5cdHByaXZhdGUgX2VkaXRvclBvc2l0aW9uRGF0YTogSVRleHRFZGl0b3JQb3NpdGlvbkRhdGEgfCBudWxsO1xuXHRwcml2YXRlIF9yZWdpc3RlcmVkRGVjb3JhdGlvblR5cGVzOiB7IFtkZWNvcmF0aW9uVHlwZTogc3RyaW5nXTogYm9vbGVhbiB9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckxvY2F0b3I6IElNYWluVGhyZWFkRWRpdG9yTG9jYXRvcixcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tEaWZmTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrRGlmZk1vZGVsU2VydmljZTogSVF1aWNrRGlmZk1vZGVsU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5faW5zdGFuY2VJZCA9IFN0cmluZygrK01haW5UaHJlYWRUZXh0RWRpdG9ycy5JTlNUQU5DRV9DT1VOVCk7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0RWRpdG9ycyk7XG5cblx0XHR0aGlzLl90ZXh0RWRpdG9yc0xpc3RlbmVyc01hcCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fZWRpdG9yUG9zaXRpb25EYXRhID0gbnVsbDtcblxuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlKCgpID0+IHRoaXMuX3VwZGF0ZUFjdGl2ZUFuZFZpc2libGVUZXh0RWRpdG9ycygpKSk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3JHcm91cFNlcnZpY2Uub25EaWRSZW1vdmVHcm91cCgoKSA9PiB0aGlzLl91cGRhdGVBY3RpdmVBbmRWaXNpYmxlVGV4dEVkaXRvcnMoKSkpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yR3JvdXBTZXJ2aWNlLm9uRGlkTW92ZUdyb3VwKCgpID0+IHRoaXMuX3VwZGF0ZUFjdGl2ZUFuZFZpc2libGVUZXh0RWRpdG9ycygpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcmVkRGVjb3JhdGlvblR5cGVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0T2JqZWN0LmtleXModGhpcy5fdGV4dEVkaXRvcnNMaXN0ZW5lcnNNYXApLmZvckVhY2goKGVkaXRvcklkKSA9PiB7XG5cdFx0XHRkaXNwb3NlKHRoaXMuX3RleHRFZGl0b3JzTGlzdGVuZXJzTWFwW2VkaXRvcklkXSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fdGV4dEVkaXRvcnNMaXN0ZW5lcnNNYXAgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uVHlwZSBpbiB0aGlzLl9yZWdpc3RlcmVkRGVjb3JhdGlvblR5cGVzKSB7XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5yZW1vdmVEZWNvcmF0aW9uVHlwZShkZWNvcmF0aW9uVHlwZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyZWREZWNvcmF0aW9uVHlwZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHR9XG5cblx0aGFuZGxlVGV4dEVkaXRvckFkZGVkKHRleHRFZGl0b3I6IE1haW5UaHJlYWRUZXh0RWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgaWQgPSB0ZXh0RWRpdG9yLmdldElkKCk7XG5cdFx0Y29uc3QgdG9EaXNwb3NlOiBJRGlzcG9zYWJsZVtdID0gW107XG5cdFx0dG9EaXNwb3NlLnB1c2godGV4dEVkaXRvci5vblByb3BlcnRpZXNDaGFuZ2VkKChkYXRhKSA9PiB7XG5cdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0RWRpdG9yUHJvcGVydGllc0NoYW5nZWQoaWQsIGRhdGEpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpZmZJbmZvcm1hdGlvbk9icyA9IHRoaXMuX2dldFRleHRFZGl0b3JEaWZmSW5mb3JtYXRpb24odGV4dEVkaXRvciwgdG9EaXNwb3NlKTtcblx0XHR0b0Rpc3Bvc2UucHVzaChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBkaWZmSW5mb3JtYXRpb24gPSBkaWZmSW5mb3JtYXRpb25PYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdEVkaXRvckRpZmZJbmZvcm1hdGlvbihpZCwgZGlmZkluZm9ybWF0aW9uKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl90ZXh0RWRpdG9yc0xpc3RlbmVyc01hcFtpZF0gPSB0b0Rpc3Bvc2U7XG5cdH1cblxuXHRoYW5kbGVUZXh0RWRpdG9yUmVtb3ZlZChpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLl90ZXh0RWRpdG9yc0xpc3RlbmVyc01hcFtpZF0pO1xuXHRcdGRlbGV0ZSB0aGlzLl90ZXh0RWRpdG9yc0xpc3RlbmVyc01hcFtpZF07XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVBY3RpdmVBbmRWaXNpYmxlVGV4dEVkaXRvcnMoKTogdm9pZCB7XG5cblx0XHQvLyBlZGl0b3IgY29sdW1uc1xuXHRcdGNvbnN0IGVkaXRvclBvc2l0aW9uRGF0YSA9IHRoaXMuX2dldFRleHRFZGl0b3JQb3NpdGlvbkRhdGEoKTtcblx0XHRpZiAoIW9iamVjdEVxdWFscyh0aGlzLl9lZGl0b3JQb3NpdGlvbkRhdGEsIGVkaXRvclBvc2l0aW9uRGF0YSkpIHtcblx0XHRcdHRoaXMuX2VkaXRvclBvc2l0aW9uRGF0YSA9IGVkaXRvclBvc2l0aW9uRGF0YTtcblx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRFZGl0b3JQb3NpdGlvbkRhdGEodGhpcy5fZWRpdG9yUG9zaXRpb25EYXRhKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUZXh0RWRpdG9yUG9zaXRpb25EYXRhKCk6IElUZXh0RWRpdG9yUG9zaXRpb25EYXRhIHtcblx0XHRjb25zdCByZXN1bHQ6IElUZXh0RWRpdG9yUG9zaXRpb25EYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRmb3IgKGNvbnN0IGVkaXRvclBhbmUgb2YgdGhpcy5fZWRpdG9yU2VydmljZS52aXNpYmxlRWRpdG9yUGFuZXMpIHtcblx0XHRcdGNvbnN0IGlkID0gdGhpcy5fZWRpdG9yTG9jYXRvci5maW5kVGV4dEVkaXRvcklkRm9yKGVkaXRvclBhbmUpO1xuXHRcdFx0aWYgKGlkKSB7XG5cdFx0XHRcdHJlc3VsdFtpZF0gPSBlZGl0b3JHcm91cFRvQ29sdW1uKHRoaXMuX2VkaXRvckdyb3VwU2VydmljZSwgZWRpdG9yUGFuZS5ncm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUZXh0RWRpdG9yRGlmZkluZm9ybWF0aW9uKHRleHRFZGl0b3I6IE1haW5UaHJlYWRUZXh0RWRpdG9yLCB0b0Rpc3Bvc2U6IElEaXNwb3NhYmxlW10pOiBJT2JzZXJ2YWJsZTxJVGV4dEVkaXRvckRpZmZJbmZvcm1hdGlvbltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29kZUVkaXRvciA9IHRleHRFZGl0b3IuZ2V0Q29kZUVkaXRvcigpO1xuXHRcdGlmICghY29kZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoZSBUZXh0TW9kZWwgYmVsb25ncyB0byBhIERpZmZFZGl0b3Jcblx0XHRjb25zdCBbZGlmZkVkaXRvcl0gPSB0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5saXN0RGlmZkVkaXRvcnMoKVxuXHRcdFx0LmZpbHRlcihkID0+XG5cdFx0XHRcdGQuZ2V0T3JpZ2luYWxFZGl0b3IoKS5nZXRJZCgpID09PSBjb2RlRWRpdG9yLmdldElkKCkgfHxcblx0XHRcdFx0ZC5nZXRNb2RpZmllZEVkaXRvcigpLmdldElkKCkgPT09IGNvZGVFZGl0b3IuZ2V0SWQoKSk7XG5cblx0XHRjb25zdCBlZGl0b3JNb2RlbE9icyA9IGRpZmZFZGl0b3Jcblx0XHRcdD8gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCBkaWZmRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwsICgpID0+IGRpZmZFZGl0b3IuZ2V0TW9kZWwoKSlcblx0XHRcdDogb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCBjb2RlRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwsICgpID0+IGNvZGVFZGl0b3IuZ2V0TW9kZWwoKSk7XG5cblx0XHRjb25zdCBlZGl0b3JDaGFuZ2VzT2JzID0gZGVyaXZlZDxJT2JzZXJ2YWJsZTx7IG9yaWdpbmFsOiBVUkk7IG1vZGlmaWVkOiBVUkk7IGNoYW5nZXM6IHJlYWRvbmx5IExpbmVSYW5nZU1hcHBpbmdbXSB9W10gfCB1bmRlZmluZWQ+PihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yTW9kZWwgPSBlZGl0b3JNb2RlbE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWVkaXRvck1vZGVsKSB7XG5cdFx0XHRcdHJldHVybiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGV4dEVkaXRvclxuXHRcdFx0aWYgKGlzSVRleHRNb2RlbChlZGl0b3JNb2RlbCkpIHtcblx0XHRcdFx0Y29uc3QgcXVpY2tEaWZmTW9kZWxSZWYgPSB0aGlzLl9xdWlja0RpZmZNb2RlbFNlcnZpY2UuY3JlYXRlUXVpY2tEaWZmTW9kZWxSZWZlcmVuY2UoZWRpdG9yTW9kZWwudXJpKTtcblx0XHRcdFx0aWYgKCFxdWlja0RpZmZNb2RlbFJlZikge1xuXHRcdFx0XHRcdHJldHVybiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRvRGlzcG9zZS5wdXNoKHF1aWNrRGlmZk1vZGVsUmVmKTtcblx0XHRcdFx0cmV0dXJuIG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgcXVpY2tEaWZmTW9kZWxSZWYub2JqZWN0Lm9uRGlkQ2hhbmdlLCAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHF1aWNrRGlmZk1vZGVsUmVmLm9iamVjdC5nZXRRdWlja0RpZmZSZXN1bHRzKClcblx0XHRcdFx0XHRcdC5tYXAocmVzdWx0ID0+ICh7XG5cdFx0XHRcdFx0XHRcdG9yaWdpbmFsOiByZXN1bHQub3JpZ2luYWwsXG5cdFx0XHRcdFx0XHRcdG1vZGlmaWVkOiByZXN1bHQubW9kaWZpZWQsXG5cdFx0XHRcdFx0XHRcdGNoYW5nZXM6IHJlc3VsdC5jaGFuZ2VzMlxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGlmZkVkaXRvciAtIHdlIGNyZWF0ZSBhIHF1aWNrIGRpZmYgbW9kZWwgKHVzaW5nIHRoZSBkaWZmIGFsZ29yaXRobSB1c2VkIGJ5IHRoZSBkaWZmIGVkaXRvcilcblx0XHRcdC8vIGV2ZW4gZm9yIGRpZmYgZWRpdG9yIHNvIHRoYXQgd2UgY2FuIHByb3ZpZGUgbXVsdGlwbGUgXCJvcmlnaW5hbCByZXNvdXJjZXNcIiB0byBkaWZmIHdpdGggdGhlIG9yaWdpbmFsXG5cdFx0XHQvLyBhbmQgbW9kaWZpZWQgcmVzb3VyY2VzLlxuXHRcdFx0Y29uc3QgZGlmZkFsZ29yaXRobSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPERpZmZBbGdvcml0aG1OYW1lPignZGlmZkVkaXRvci5kaWZmQWxnb3JpdGhtJyk7XG5cdFx0XHRjb25zdCBxdWlja0RpZmZNb2RlbFJlZiA9IHRoaXMuX3F1aWNrRGlmZk1vZGVsU2VydmljZS5jcmVhdGVRdWlja0RpZmZNb2RlbFJlZmVyZW5jZShlZGl0b3JNb2RlbC5tb2RpZmllZC51cmksIHsgYWxnb3JpdGhtOiBkaWZmQWxnb3JpdGhtIH0pO1xuXHRcdFx0aWYgKCFxdWlja0RpZmZNb2RlbFJlZikge1xuXHRcdFx0XHRyZXR1cm4gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdHRvRGlzcG9zZS5wdXNoKHF1aWNrRGlmZk1vZGVsUmVmKTtcblx0XHRcdHJldHVybiBvYnNlcnZhYmxlRnJvbUV2ZW50KEV2ZW50LmFueShxdWlja0RpZmZNb2RlbFJlZi5vYmplY3Qub25EaWRDaGFuZ2UsIGRpZmZFZGl0b3Iub25EaWRVcGRhdGVEaWZmKSwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBkaWZmQ2hhbmdlcyA9IGRpZmZFZGl0b3IuZ2V0RGlmZkNvbXB1dGF0aW9uUmVzdWx0KCk/LmNoYW5nZXMyID8/IFtdO1xuXHRcdFx0XHRjb25zdCBkaWZmSW5mb3JtYXRpb24gPSBbe1xuXHRcdFx0XHRcdG9yaWdpbmFsOiBlZGl0b3JNb2RlbC5vcmlnaW5hbC51cmksXG5cdFx0XHRcdFx0bW9kaWZpZWQ6IGVkaXRvck1vZGVsLm1vZGlmaWVkLnVyaSxcblx0XHRcdFx0XHRjaGFuZ2VzOiBkaWZmQ2hhbmdlcy5tYXAoY2hhbmdlID0+IGNoYW5nZSBhcyBMaW5lUmFuZ2VNYXBwaW5nKVxuXHRcdFx0XHR9XTtcblxuXHRcdFx0XHQvLyBBZGQgcXVpY2sgZGlmZiBpbmZvcm1hdGlvbiBmcm9tIHNlY29uZGFyeS9jb250cmlidXRlZCBwcm92aWRlcnNcblx0XHRcdFx0Y29uc3QgcXVpY2tEaWZmSW5mb3JtYXRpb24gPSBxdWlja0RpZmZNb2RlbFJlZi5vYmplY3QuZ2V0UXVpY2tEaWZmUmVzdWx0cygpXG5cdFx0XHRcdFx0LmZpbHRlcihyZXN1bHQgPT4gcmVzdWx0LnByb3ZpZGVyS2luZCAhPT0gJ3ByaW1hcnknKVxuXHRcdFx0XHRcdC5tYXAocmVzdWx0ID0+ICh7XG5cdFx0XHRcdFx0XHRvcmlnaW5hbDogcmVzdWx0Lm9yaWdpbmFsLFxuXHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHJlc3VsdC5tb2RpZmllZCxcblx0XHRcdFx0XHRcdGNoYW5nZXM6IHJlc3VsdC5jaGFuZ2VzMlxuXHRcdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBDb21iaW5lIGRpZmYgYW5kIHF1aWNrIGRpZmYgaW5mb3JtYXRpb25cblx0XHRcdFx0cmV0dXJuIGRpZmZJbmZvcm1hdGlvbi5jb25jYXQocXVpY2tEaWZmSW5mb3JtYXRpb24pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZGVyaXZlZE9wdHMoe1xuXHRcdFx0b3duZXI6IHRoaXMsXG5cdFx0XHRlcXVhbHNGbjogKGRpZmYxLCBkaWZmMikgPT4gZXF1YWxzKGRpZmYxLCBkaWZmMiwgKGEsIGIpID0+XG5cdFx0XHRcdGlzVGV4dEVkaXRvckRpZmZJbmZvcm1hdGlvbkVxdWFsKHRoaXMuX3VyaUlkZW50aXR5U2VydmljZSwgYSwgYikpXG5cdFx0fSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvck1vZGVsID0gZWRpdG9yTW9kZWxPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZWRpdG9yQ2hhbmdlcyA9IGVkaXRvckNoYW5nZXNPYnMucmVhZChyZWFkZXIpLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghZWRpdG9yTW9kZWwgfHwgIWVkaXRvckNoYW5nZXMpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZG9jdW1lbnRWZXJzaW9uID0gaXNJVGV4dE1vZGVsKGVkaXRvck1vZGVsKVxuXHRcdFx0XHQ/IGVkaXRvck1vZGVsLmdldFZlcnNpb25JZCgpXG5cdFx0XHRcdDogZWRpdG9yTW9kZWwubW9kaWZpZWQuZ2V0VmVyc2lvbklkKCk7XG5cblx0XHRcdHJldHVybiBlZGl0b3JDaGFuZ2VzLm1hcChjaGFuZ2UgPT4ge1xuXHRcdFx0XHRjb25zdCBjaGFuZ2VzOiBJVGV4dEVkaXRvckNoYW5nZVtdID0gY2hhbmdlLmNoYW5nZXNcblx0XHRcdFx0XHQubWFwKGNoYW5nZSA9PiBbXG5cdFx0XHRcdFx0XHRjaGFuZ2Uub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0Y2hhbmdlLm9yaWdpbmFsLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUsXG5cdFx0XHRcdFx0XHRjaGFuZ2UubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0Y2hhbmdlLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmVcblx0XHRcdFx0XHRdKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGRvY3VtZW50VmVyc2lvbixcblx0XHRcdFx0XHRvcmlnaW5hbDogY2hhbmdlLm9yaWdpbmFsLFxuXHRcdFx0XHRcdG1vZGlmaWVkOiBjaGFuZ2UubW9kaWZpZWQsXG5cdFx0XHRcdFx0Y2hhbmdlc1xuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLS0gZnJvbSBleHRlbnNpb24gaG9zdCBwcm9jZXNzXG5cblx0YXN5bmMgJHRyeVNob3dUZXh0RG9jdW1lbnQocmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIG9wdGlvbnM6IElUZXh0RG9jdW1lbnRTaG93T3B0aW9ucyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShyZXNvdXJjZSk7XG5cblx0XHRjb25zdCBlZGl0b3JPcHRpb25zOiBJVGV4dEVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRwcmVzZXJ2ZUZvY3VzOiBvcHRpb25zLnByZXNlcnZlRm9jdXMsXG5cdFx0XHRwaW5uZWQ6IG9wdGlvbnMucGlubmVkLFxuXHRcdFx0c2VsZWN0aW9uOiBvcHRpb25zLnNlbGVjdGlvbixcblx0XHRcdC8vIHByZXNlcnZlIHByZSAxLjM4IGJlaGF2aW91ciB0byBub3QgbWFrZSBncm91cCBhY3RpdmUgd2hlbiBwcmVzZXJ2ZUZvY3VzOiB0cnVlXG5cdFx0XHQvLyBidXQgbWFrZSBzdXJlIHRvIHJlc3RvcmUgdGhlIGVkaXRvciB0byBmaXggaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzc5NjMzXG5cdFx0XHRhY3RpdmF0aW9uOiBvcHRpb25zLnByZXNlcnZlRm9jdXMgPyBFZGl0b3JBY3RpdmF0aW9uLlJFU1RPUkUgOiB1bmRlZmluZWQsXG5cdFx0XHRvdmVycmlkZTogRWRpdG9yUmVzb2x1dGlvbi5FWENMVVNJVkVfT05MWVxuXHRcdH07XG5cblx0XHRjb25zdCBpbnB1dDogSVJlc291cmNlRWRpdG9ySW5wdXQgPSB7XG5cdFx0XHRyZXNvdXJjZTogdXJpLFxuXHRcdFx0b3B0aW9uczogZWRpdG9yT3B0aW9uc1xuXHRcdH07XG5cblx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIGNvbHVtblRvRWRpdG9yR3JvdXAodGhpcy5fZWRpdG9yR3JvdXBTZXJ2aWNlLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgb3B0aW9ucy5wb3NpdGlvbikpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBDb21wb3NpdGUgZWRpdG9ycyBhcmUgbWFkZSB1cCBvZiBtYW55IGVkaXRvcnMgc28gd2UgcmV0dXJuIHRoZSBhY3RpdmUgb25lIGF0IHRoZSB0aW1lIG9mIG9wZW5pbmdcblx0XHRjb25zdCBlZGl0b3JDb250cm9sID0gZWRpdG9yLmdldENvbnRyb2woKTtcblx0XHRjb25zdCBjb2RlRWRpdG9yID0gZ2V0Q29kZUVkaXRvcihlZGl0b3JDb250cm9sKTtcblx0XHRyZXR1cm4gY29kZUVkaXRvciA/IHRoaXMuX2VkaXRvckxvY2F0b3IuZ2V0SWRPZkNvZGVFZGl0b3IoY29kZUVkaXRvcikgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyAkdHJ5U2hvd0VkaXRvcihpZDogc3RyaW5nLCBwb3NpdGlvbj86IEVkaXRvckdyb3VwQ29sdW1uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWFpblRocmVhZEVkaXRvciA9IHRoaXMuX2VkaXRvckxvY2F0b3IuZ2V0RWRpdG9yKGlkKTtcblx0XHRpZiAobWFpblRocmVhZEVkaXRvcikge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBtYWluVGhyZWFkRWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogbW9kZWwudXJpLFxuXHRcdFx0XHRvcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IGZhbHNlIH1cblx0XHRcdH0sIGNvbHVtblRvRWRpdG9yR3JvdXAodGhpcy5fZWRpdG9yR3JvdXBTZXJ2aWNlLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgcG9zaXRpb24pKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkdHJ5SGlkZUVkaXRvcihpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWFpblRocmVhZEVkaXRvciA9IHRoaXMuX2VkaXRvckxvY2F0b3IuZ2V0RWRpdG9yKGlkKTtcblx0XHRpZiAobWFpblRocmVhZEVkaXRvcikge1xuXHRcdFx0Y29uc3QgZWRpdG9yUGFuZXMgPSB0aGlzLl9lZGl0b3JTZXJ2aWNlLnZpc2libGVFZGl0b3JQYW5lcztcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yUGFuZSBvZiBlZGl0b3JQYW5lcykge1xuXHRcdFx0XHRpZiAobWFpblRocmVhZEVkaXRvci5tYXRjaGVzKGVkaXRvclBhbmUpKSB7XG5cdFx0XHRcdFx0YXdhaXQgZWRpdG9yUGFuZS5ncm91cC5jbG9zZUVkaXRvcihlZGl0b3JQYW5lLmlucHV0KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQkdHJ5U2V0U2VsZWN0aW9ucyhpZDogc3RyaW5nLCBzZWxlY3Rpb25zOiBJU2VsZWN0aW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3JMb2NhdG9yLmdldEVkaXRvcihpZCk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChpbGxlZ2FsQXJndW1lbnQoYFRleHRFZGl0b3IoJHtpZH0pYCkpO1xuXHRcdH1cblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhzZWxlY3Rpb25zKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHQkdHJ5U2V0RGVjb3JhdGlvbnMoaWQ6IHN0cmluZywga2V5OiBzdHJpbmcsIHJhbmdlczogSURlY29yYXRpb25PcHRpb25zW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRrZXkgPSBgJHt0aGlzLl9pbnN0YW5jZUlkfS0ke2tleX1gO1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2VkaXRvckxvY2F0b3IuZ2V0RWRpdG9yKGlkKTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGlsbGVnYWxBcmd1bWVudChgVGV4dEVkaXRvcigke2lkfSlgKSk7XG5cdFx0fVxuXHRcdGVkaXRvci5zZXREZWNvcmF0aW9ucyhrZXksIHJhbmdlcyk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0JHRyeVNldERlY29yYXRpb25zRmFzdChpZDogc3RyaW5nLCBrZXk6IHN0cmluZywgcmFuZ2VzOiBudW1iZXJbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGtleSA9IGAke3RoaXMuX2luc3RhbmNlSWR9LSR7a2V5fWA7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yTG9jYXRvci5nZXRFZGl0b3IoaWQpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoaWxsZWdhbEFyZ3VtZW50KGBUZXh0RWRpdG9yKCR7aWR9KWApKTtcblx0XHR9XG5cdFx0ZWRpdG9yLnNldERlY29yYXRpb25zRmFzdChrZXksIHJhbmdlcyk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0JHRyeVJldmVhbFJhbmdlKGlkOiBzdHJpbmcsIHJhbmdlOiBJUmFuZ2UsIHJldmVhbFR5cGU6IFRleHRFZGl0b3JSZXZlYWxUeXBlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yTG9jYXRvci5nZXRFZGl0b3IoaWQpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoaWxsZWdhbEFyZ3VtZW50KGBUZXh0RWRpdG9yKCR7aWR9KWApKTtcblx0XHR9XG5cdFx0ZWRpdG9yLnJldmVhbFJhbmdlKHJhbmdlLCByZXZlYWxUeXBlKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHQkdHJ5U2V0T3B0aW9ucyhpZDogc3RyaW5nLCBvcHRpb25zOiBJVGV4dEVkaXRvckNvbmZpZ3VyYXRpb25VcGRhdGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3JMb2NhdG9yLmdldEVkaXRvcihpZCk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChpbGxlZ2FsQXJndW1lbnQoYFRleHRFZGl0b3IoJHtpZH0pYCkpO1xuXHRcdH1cblx0XHRlZGl0b3Iuc2V0Q29uZmlndXJhdGlvbihvcHRpb25zKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHQkdHJ5QXBwbHlFZGl0cyhpZDogc3RyaW5nLCBtb2RlbFZlcnNpb25JZDogbnVtYmVyLCBlZGl0czogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSwgb3B0czogSUFwcGx5RWRpdHNPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yTG9jYXRvci5nZXRFZGl0b3IoaWQpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoaWxsZWdhbEFyZ3VtZW50KGBUZXh0RWRpdG9yKCR7aWR9KWApKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShlZGl0b3IuYXBwbHlFZGl0cyhtb2RlbFZlcnNpb25JZCwgZWRpdHMsIG9wdHMpKTtcblx0fVxuXG5cdCR0cnlJbnNlcnRTbmlwcGV0KGlkOiBzdHJpbmcsIG1vZGVsVmVyc2lvbklkOiBudW1iZXIsIHRlbXBsYXRlOiBzdHJpbmcsIHJhbmdlczogcmVhZG9ubHkgSVJhbmdlW10sIG9wdHM6IElVbmRvU3RvcE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3JMb2NhdG9yLmdldEVkaXRvcihpZCk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChpbGxlZ2FsQXJndW1lbnQoYFRleHRFZGl0b3IoJHtpZH0pYCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGVkaXRvci5pbnNlcnRTbmlwcGV0KG1vZGVsVmVyc2lvbklkLCB0ZW1wbGF0ZSwgcmFuZ2VzLCBvcHRzKSk7XG5cdH1cblxuXHQkcmVnaXN0ZXJUZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGtleTogc3RyaW5nLCBvcHRpb25zOiBJRGVjb3JhdGlvblJlbmRlck9wdGlvbnMpOiB2b2lkIHtcblx0XHRrZXkgPSBgJHt0aGlzLl9pbnN0YW5jZUlkfS0ke2tleX1gO1xuXHRcdHRoaXMuX3JlZ2lzdGVyZWREZWNvcmF0aW9uVHlwZXNba2V5XSA9IHRydWU7XG5cdFx0dGhpcy5fY29kZUVkaXRvclNlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uVHlwZShgZXh0aG9zdC1hcGktJHtleHRlbnNpb25JZH1gLCBrZXksIG9wdGlvbnMpO1xuXHR9XG5cblx0JHJlbW92ZVRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZShrZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGtleSA9IGAke3RoaXMuX2luc3RhbmNlSWR9LSR7a2V5fWA7XG5cdFx0ZGVsZXRlIHRoaXMuX3JlZ2lzdGVyZWREZWNvcmF0aW9uVHlwZXNba2V5XTtcblx0XHR0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5yZW1vdmVEZWNvcmF0aW9uVHlwZShrZXkpO1xuXHR9XG5cblx0JGdldERpZmZJbmZvcm1hdGlvbihpZDogc3RyaW5nKTogUHJvbWlzZTxJQ2hhbmdlW10+IHtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3JMb2NhdG9yLmdldEVkaXRvcihpZCk7XG5cblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignTm8gc3VjaCBUZXh0RWRpdG9yJykpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvZGVFZGl0b3IgPSBlZGl0b3IuZ2V0Q29kZUVkaXRvcigpO1xuXHRcdGlmICghY29kZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignTm8gc3VjaCBDb2RlRWRpdG9yJykpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvZGVFZGl0b3JJZCA9IGNvZGVFZGl0b3IuZ2V0SWQoKTtcblx0XHRjb25zdCBkaWZmRWRpdG9ycyA9IHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLmxpc3REaWZmRWRpdG9ycygpO1xuXHRcdGNvbnN0IFtkaWZmRWRpdG9yXSA9IGRpZmZFZGl0b3JzLmZpbHRlcihkID0+IGQuZ2V0T3JpZ2luYWxFZGl0b3IoKS5nZXRJZCgpID09PSBjb2RlRWRpdG9ySWQgfHwgZC5nZXRNb2RpZmllZEVkaXRvcigpLmdldElkKCkgPT09IGNvZGVFZGl0b3JJZCk7XG5cblx0XHRpZiAoZGlmZkVkaXRvcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShkaWZmRWRpdG9yLmdldExpbmVDaGFuZ2VzKCkgfHwgW10pO1xuXHRcdH1cblxuXHRcdGlmICghY29kZUVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHR9XG5cblx0XHRjb25zdCBxdWlja0RpZmZNb2RlbFJlZiA9IHRoaXMuX3F1aWNrRGlmZk1vZGVsU2VydmljZS5jcmVhdGVRdWlja0RpZmZNb2RlbFJlZmVyZW5jZShjb2RlRWRpdG9yLmdldE1vZGVsKCkudXJpKTtcblx0XHRpZiAoIXF1aWNrRGlmZk1vZGVsUmVmKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcHJpbWFyeVF1aWNrRGlmZiA9IHF1aWNrRGlmZk1vZGVsUmVmLm9iamVjdC5xdWlja0RpZmZzLmZpbmQocXVpY2tEaWZmID0+IHF1aWNrRGlmZi5raW5kID09PSAncHJpbWFyeScpO1xuXHRcdFx0Y29uc3QgcHJpbWFyeVF1aWNrRGlmZkNoYW5nZXMgPSBxdWlja0RpZmZNb2RlbFJlZi5vYmplY3QuY2hhbmdlcy5maWx0ZXIoY2hhbmdlID0+IGNoYW5nZS5wcm92aWRlcklkID09PSBwcmltYXJ5UXVpY2tEaWZmPy5pZCk7XG5cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocHJpbWFyeVF1aWNrRGlmZkNoYW5nZXMubWFwKGNoYW5nZSA9PiBjaGFuZ2UuY2hhbmdlKSA/PyBbXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHF1aWNrRGlmZk1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuLy8gLS0tIGNvbW1hbmRzXG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfd29ya2JlbmNoLnJldmVydEFsbERpcnR5JywgYXN5bmMgZnVuY3Rpb24gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0aWYgKCFlbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignQ29tbWFuZCBpcyBvbmx5IGF2YWlsYWJsZSB3aGVuIHJ1bm5pbmcgZXh0ZW5zaW9uIHRlc3RzLicpO1xuXHR9XG5cblx0Y29uc3Qgd29ya2luZ0NvcHlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JraW5nQ29weVNlcnZpY2UpO1xuXHRmb3IgKGNvbnN0IHdvcmtpbmdDb3B5IG9mIHdvcmtpbmdDb3B5U2VydmljZS5kaXJ0eVdvcmtpbmdDb3BpZXMpIHtcblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXZlcnQoeyBzb2Z0OiB0cnVlIH0pO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBc0IsU0FBUyx1QkFBdUI7QUFDdEQsU0FBUyxVQUFVLG9CQUFvQjtBQUN2QyxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsMEJBQTBCO0FBS25DLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQW1ELGtCQUFrQixrQkFBOEMsd0NBQTJEO0FBRzlLLFNBQVMsc0JBQXNOO0FBQy9OLFNBQVMscUJBQXFCLDJCQUE4QztBQUM1RSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDJCQUEyQjtBQUtwQyxTQUFTLHFCQUFrQztBQUMzQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLFNBQVMsaUJBQWlCLFNBQVMsYUFBMEIsMkJBQTJCO0FBQ2pHLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsY0FBYztBQUN2QixTQUFTLGFBQWE7QUFTZixJQUFNLHdCQUFOLE1BQWtFO0FBQUEsRUFXeEUsWUFDa0IsZ0JBQ2pCLGdCQUNxQyxvQkFDSixnQkFDTSxxQkFDQyx1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
