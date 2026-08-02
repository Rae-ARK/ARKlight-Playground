import assert from "assert";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore, ImmortalReference } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IBulkEditService } from "../../../../editor/browser/services/bulkEditService.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../editor/common/languages/languageConfigurationRegistry.js";
import { EndOfLineSequence } from "../../../../editor/common/model.js";
import { IEditorWorkerService } from "../../../../editor/common/services/editorWorker.js";
import { LanguageService } from "../../../../editor/common/services/languageService.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ModelService } from "../../../../editor/common/services/modelService.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ITreeSitterLibraryService } from "../../../../editor/common/services/treeSitter/treeSitterLibraryService.js";
import { TestCodeEditorService } from "../../../../editor/test/browser/editorTestServices.js";
import { TestLanguageConfigurationService } from "../../../../editor/test/common/modes/testLanguageConfigurationService.js";
import { TestTreeSitterLibraryService } from "../../../../editor/test/common/services/testTreeSitterLibraryService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { TestDialogService } from "../../../../platform/dialogs/test/common/testDialogService.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { InstantiationService } from "../../../../platform/instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../platform/notification/test/common/testNotificationService.js";
import { TestThemeService } from "../../../../platform/theme/test/common/testThemeService.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { UndoRedoService } from "../../../../platform/undoRedo/common/undoRedoService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentityService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { BulkEditService } from "../../../contrib/bulkEdit/browser/bulkEditService.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { SerializableObjectWithBuffers } from "../../../services/extensions/common/proxyIdentifier.js";
import { LabelService } from "../../../services/label/common/labelService.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IWorkingCopyFileService } from "../../../services/workingCopy/common/workingCopyFileService.js";
import { IWorkingCopyService } from "../../../services/workingCopy/common/workingCopyService.js";
import { TestEditorGroupsService, TestEditorService, TestEnvironmentService, TestLifecycleService, TestWorkingCopyService } from "../../../test/browser/workbenchTestServices.js";
import { TestContextService, TestFileService, TestTextResourcePropertiesService } from "../../../test/common/workbenchTestServices.js";
import { MainThreadBulkEdits } from "../../browser/mainThreadBulkEdits.js";
import { MainThreadTextEditors } from "../../browser/mainThreadEditors.js";
import { MainThreadTextEditor } from "../../browser/mainThreadEditor.js";
import { MainThreadDocuments } from "../../browser/mainThreadDocuments.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
import { ITextResourcePropertiesService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { TestClipboardService } from "../../../../platform/clipboard/test/common/testClipboardService.js";
import { createTestCodeEditor } from "../../../../editor/test/browser/testCodeEditor.js";
suite("MainThreadEditors", () => {
  let disposables;
  const existingResource = URI.parse("foo:existing");
  const resource = URI.parse("foo:bar");
  let modelService;
  let bulkEdits;
  let editors;
  let editorLocator;
  let testEditor;
  const movedResources = /* @__PURE__ */ new Map();
  const copiedResources = /* @__PURE__ */ new Map();
  const createdResources = /* @__PURE__ */ new Set();
  const deletedResources = /* @__PURE__ */ new Set();
  const editorId = "testEditorId";
  setup(() => {
    disposables = new DisposableStore();
    movedResources.clear();
    copiedResources.clear();
    createdResources.clear();
    deletedResources.clear();
    const configService = new TestConfigurationService();
    const dialogService = new TestDialogService();
    const notificationService = new TestNotificationService();
    const undoRedoService = new UndoRedoService(dialogService, notificationService);
    const themeService = new TestThemeService();
    const services = new ServiceCollection();
    services.set(IBulkEditService, new SyncDescriptor(BulkEditService));
    services.set(ILabelService, new SyncDescriptor(LabelService));
    services.set(ILogService, new NullLogService());
    services.set(IWorkspaceContextService, new TestContextService());
    services.set(IEnvironmentService, TestEnvironmentService);
    services.set(IWorkbenchEnvironmentService, TestEnvironmentService);
    services.set(IConfigurationService, configService);
    services.set(IDialogService, dialogService);
    services.set(INotificationService, notificationService);
    services.set(IUndoRedoService, undoRedoService);
    services.set(ITextResourcePropertiesService, new SyncDescriptor(TestTextResourcePropertiesService));
    services.set(IModelService, new SyncDescriptor(ModelService));
    services.set(ICodeEditorService, new TestCodeEditorService(themeService));
    services.set(IFileService, new TestFileService());
    services.set(IUriIdentityService, new SyncDescriptor(UriIdentityService));
    services.set(ITreeSitterLibraryService, new TestTreeSitterLibraryService());
    services.set(IEditorService, disposables.add(new TestEditorService()));
    services.set(ILifecycleService, new TestLifecycleService());
    services.set(IWorkingCopyService, new TestWorkingCopyService());
    services.set(IEditorGroupsService, new TestEditorGroupsService());
    services.set(IClipboardService, new TestClipboardService());
    services.set(ITextFileService, new class extends mock() {
      constructor() {
        super(...arguments);
        // eslint-disable-next-line local/code-no-any-casts
        this.files = {
          onDidSave: Event.None,
          onDidRevert: Event.None,
          onDidChangeDirty: Event.None,
          onDidChangeEncoding: Event.None
        };
        // eslint-disable-next-line local/code-no-any-casts
        this.untitled = {
          onDidChangeEncoding: Event.None
        };
      }
      isDirty() {
        return false;
      }
      create(operations) {
        for (const o of operations) {
          createdResources.add(o.resource);
        }
        return Promise.resolve(/* @__PURE__ */ Object.create(null));
      }
      async getEncodedReadable(resource2, value) {
        return void 0;
      }
    }());
    services.set(IWorkingCopyFileService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidRunWorkingCopyFileOperation = Event.None;
      }
      createFolder(operations) {
        this.create(operations);
      }
      create(operations) {
        for (const operation of operations) {
          createdResources.add(operation.resource);
        }
        return Promise.resolve(/* @__PURE__ */ Object.create(null));
      }
      move(operations) {
        const { source, target } = operations[0].file;
        movedResources.set(source, target);
        return Promise.resolve(/* @__PURE__ */ Object.create(null));
      }
      copy(operations) {
        const { source, target } = operations[0].file;
        copiedResources.set(source, target);
        return Promise.resolve(/* @__PURE__ */ Object.create(null));
      }
      delete(operations) {
        for (const operation of operations) {
          deletedResources.add(operation.resource);
        }
        return Promise.resolve(void 0);
      }
    }());
    services.set(ITextModelService, new class extends mock() {
      createModelReference(resource2) {
        const textEditorModel = new class extends mock() {
          constructor() {
            super(...arguments);
            this.textEditorModel = modelService.getModel(resource2);
          }
        }();
        textEditorModel.isReadonly = () => false;
        return Promise.resolve(new ImmortalReference(textEditorModel));
      }
    }());
    services.set(IEditorWorkerService, new class extends mock() {
    }());
    services.set(IPaneCompositePartService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidPaneCompositeOpen = Event.None;
        this.onDidPaneCompositeClose = Event.None;
      }
      getActivePaneComposite() {
        return void 0;
      }
    }());
    services.set(ILanguageService, disposables.add(new LanguageService()));
    services.set(ILanguageConfigurationService, new TestLanguageConfigurationService());
    const instaService = new InstantiationService(services);
    bulkEdits = instaService.createInstance(MainThreadBulkEdits, SingleProxyRPCProtocol(null));
    const documents = instaService.createInstance(MainThreadDocuments, SingleProxyRPCProtocol(null));
    editorLocator = {
      getEditor(id) {
        return id === editorId ? testEditor : void 0;
      },
      findTextEditorIdFor() {
        return void 0;
      },
      getIdOfCodeEditor() {
        return void 0;
      }
    };
    editors = instaService.createInstance(MainThreadTextEditors, editorLocator, SingleProxyRPCProtocol(null));
    modelService = instaService.invokeFunction((accessor) => accessor.get(IModelService));
    const model = modelService.createModel("Hello world!", null, existingResource);
    const testCodeEditor = disposables.add(createTestCodeEditor(model));
    testEditor = disposables.add(instaService.createInstance(
      MainThreadTextEditor,
      editorId,
      model,
      testCodeEditor,
      { onGainedFocus() {
      }, onLostFocus() {
      } },
      documents
    ));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test(`applyWorkspaceEdit returns false if model is changed by user`, () => {
    const model = disposables.add(modelService.createModel("something", null, resource));
    const workspaceResourceEdit = {
      resource,
      versionId: model.getVersionId(),
      textEdit: {
        text: "asdfg",
        range: new Range(1, 1, 1, 1)
      }
    };
    model.applyEdits([EditOperation.insert(new Position(0, 0), "something")]);
    return bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [workspaceResourceEdit] })).then((result) => {
      assert.strictEqual(result, false);
    });
  });
  test(`issue #54773: applyWorkspaceEdit checks model version in race situation`, () => {
    const model = disposables.add(modelService.createModel("something", null, resource));
    const workspaceResourceEdit1 = {
      resource,
      versionId: model.getVersionId(),
      textEdit: {
        text: "asdfg",
        range: new Range(1, 1, 1, 1)
      }
    };
    const workspaceResourceEdit2 = {
      resource,
      versionId: model.getVersionId(),
      textEdit: {
        text: "asdfg",
        range: new Range(1, 1, 1, 1)
      }
    };
    const p1 = bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [workspaceResourceEdit1] })).then((result) => {
      assert.strictEqual(result, true);
    });
    const p2 = bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [workspaceResourceEdit2] })).then((result) => {
      assert.strictEqual(result, false);
    });
    return Promise.all([p1, p2]);
  });
  test("applyWorkspaceEdit: noop eol edit keeps undo stack clean", async () => {
    const initialText = "hello\nworld";
    const model = disposables.add(modelService.createModel(initialText, null, resource));
    const initialAlternativeVersionId = model.getAlternativeVersionId();
    const insertEdit = {
      resource,
      versionId: model.getVersionId(),
      textEdit: {
        range: new Range(1, 6, 1, 6),
        text: "2"
      }
    };
    const insertResult = await bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [insertEdit] }));
    assert.strictEqual(insertResult, true);
    assert.strictEqual(model.getValue(), "hello2\nworld");
    assert.notStrictEqual(model.getAlternativeVersionId(), initialAlternativeVersionId);
    const eolEdit = {
      resource,
      versionId: model.getVersionId(),
      textEdit: {
        range: new Range(1, 1, 1, 1),
        text: "",
        eol: EndOfLineSequence.LF
      }
    };
    const eolResult = await bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [eolEdit] }));
    assert.strictEqual(eolResult, true);
    assert.strictEqual(model.getValue(), "hello2\nworld");
    const undoResult = model.undo();
    if (undoResult) {
      await undoResult;
    }
    assert.strictEqual(model.getValue(), initialText);
    assert.strictEqual(model.getAlternativeVersionId(), initialAlternativeVersionId);
  });
  test(`applyWorkspaceEdit with only resource edit`, () => {
    return bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({
      edits: [
        { oldResource: resource, newResource: resource, options: void 0 },
        { oldResource: void 0, newResource: resource, options: void 0 },
        { oldResource: resource, newResource: void 0, options: void 0 }
      ]
    })).then((result) => {
      assert.strictEqual(result, true);
      assert.strictEqual(movedResources.get(resource), resource);
      assert.strictEqual(createdResources.has(resource), true);
      assert.strictEqual(deletedResources.has(resource), true);
    });
  });
  test("applyWorkspaceEdit can control undo/redo stack 1", async () => {
    const model = modelService.getModel(existingResource);
    const edit1 = {
      range: new Range(1, 1, 1, 2),
      text: "h",
      forceMoveMarkers: false
    };
    const applied1 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit1], { undoStopBefore: false, undoStopAfter: false });
    assert.strictEqual(applied1, true);
    assert.strictEqual(model.getValue(), "hello world!");
    const edit2 = {
      range: new Range(1, 2, 1, 6),
      text: "ELLO",
      forceMoveMarkers: false
    };
    const applied2 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit2], { undoStopBefore: false, undoStopAfter: false });
    assert.strictEqual(applied2, true);
    assert.strictEqual(model.getValue(), "hELLO world!");
    await model.undo();
    assert.strictEqual(model.getValue(), "Hello world!");
  });
  test("applyWorkspaceEdit can control undo/redo stack 2", async () => {
    const model = modelService.getModel(existingResource);
    const edit1 = {
      range: new Range(1, 1, 1, 2),
      text: "h",
      forceMoveMarkers: false
    };
    const applied1 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit1], { undoStopBefore: false, undoStopAfter: false });
    assert.strictEqual(applied1, true);
    assert.strictEqual(model.getValue(), "hello world!");
    const edit2 = {
      range: new Range(1, 2, 1, 6),
      text: "ELLO",
      forceMoveMarkers: false
    };
    const applied2 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit2], { undoStopBefore: true, undoStopAfter: false });
    assert.strictEqual(applied2, true);
    assert.strictEqual(model.getValue(), "hELLO world!");
    await model.undo();
    assert.strictEqual(model.getValue(), "hello world!");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL21haW5UaHJlYWRFZGl0b3JzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSVJlZmVyZW5jZSwgSW1tb3J0YWxSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24sIElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lU2VxdWVuY2UsIElUZXh0U25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVTaXR0ZXIvdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2Jyb3dzZXIvZWRpdG9yVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL21vZGVzL3Rlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vc2VydmljZXMvdGVzdFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBUZXN0RGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvdGVzdC9jb21tb24vdGVzdERpYWxvZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL3Rlc3QvY29tbW9uL3Rlc3ROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS90ZXN0L2NvbW1vbi90ZXN0VGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVbmRvUmVkb1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8uanMnO1xuaW1wb3J0IHsgVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IFVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQnVsa0VkaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29udHJpYi9idWxrRWRpdC9icm93c2VyL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgeyBMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYWJlbC9jb21tb24vbGFiZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElDb3B5T3BlcmF0aW9uLCBJQ3JlYXRlRmlsZU9wZXJhdGlvbiwgSUNyZWF0ZU9wZXJhdGlvbiwgSURlbGV0ZU9wZXJhdGlvbiwgSU1vdmVPcGVyYXRpb24sIElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEVkaXRvckdyb3Vwc1NlcnZpY2UsIFRlc3RFZGl0b3JTZXJ2aWNlLCBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlLCBUZXN0TGlmZWN5Y2xlU2VydmljZSwgVGVzdFdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlLCBUZXN0RmlsZVNlcnZpY2UsIFRlc3RUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkQnVsa0VkaXRzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tYWluVGhyZWFkQnVsa0VkaXRzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRUZXh0RWRpdG9ycywgSU1haW5UaHJlYWRFZGl0b3JMb2NhdG9yIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tYWluVGhyZWFkRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkVGV4dEVkaXRvciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbWFpblRocmVhZEVkaXRvci5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkRG9jdW1lbnRzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tYWluVGhyZWFkRG9jdW1lbnRzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUZXh0RWRpdER0byB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IFNpbmdsZVByb3h5UlBDUHJvdG9jb2wgfSBmcm9tICcuLi9jb21tb24vdGVzdFJQQ1Byb3RvY29sLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC90ZXN0L2NvbW1vbi90ZXN0Q2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXN0Q29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2Jyb3dzZXIvdGVzdENvZGVFZGl0b3IuanMnO1xuXG5zdWl0ZSgnTWFpblRocmVhZEVkaXRvcnMnLCAoKSA9PiB7XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGNvbnN0IGV4aXN0aW5nUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2ZvbzpleGlzdGluZycpO1xuXHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnZm9vOmJhcicpO1xuXG5cdGxldCBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2U7XG5cblx0bGV0IGJ1bGtFZGl0czogTWFpblRocmVhZEJ1bGtFZGl0cztcblx0bGV0IGVkaXRvcnM6IE1haW5UaHJlYWRUZXh0RWRpdG9ycztcblx0bGV0IGVkaXRvckxvY2F0b3I6IElNYWluVGhyZWFkRWRpdG9yTG9jYXRvcjtcblx0bGV0IHRlc3RFZGl0b3I6IE1haW5UaHJlYWRUZXh0RWRpdG9yO1xuXG5cdGNvbnN0IG1vdmVkUmVzb3VyY2VzID0gbmV3IE1hcDxVUkksIFVSST4oKTtcblx0Y29uc3QgY29waWVkUmVzb3VyY2VzID0gbmV3IE1hcDxVUkksIFVSST4oKTtcblx0Y29uc3QgY3JlYXRlZFJlc291cmNlcyA9IG5ldyBTZXQ8VVJJPigpO1xuXHRjb25zdCBkZWxldGVkUmVzb3VyY2VzID0gbmV3IFNldDxVUkk+KCk7XG5cblx0Y29uc3QgZWRpdG9ySWQgPSAndGVzdEVkaXRvcklkJztcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRtb3ZlZFJlc291cmNlcy5jbGVhcigpO1xuXHRcdGNvcGllZFJlc291cmNlcy5jbGVhcigpO1xuXHRcdGNyZWF0ZWRSZXNvdXJjZXMuY2xlYXIoKTtcblx0XHRkZWxldGVkUmVzb3VyY2VzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBuZXcgVGVzdERpYWxvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gbmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdW5kb1JlZG9TZXJ2aWNlID0gbmV3IFVuZG9SZWRvU2VydmljZShkaWFsb2dTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB0aGVtZVNlcnZpY2UgPSBuZXcgVGVzdFRoZW1lU2VydmljZSgpO1xuXG5cdFx0Y29uc3Qgc2VydmljZXMgPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUJ1bGtFZGl0U2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKEJ1bGtFZGl0U2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJTGFiZWxTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTGFiZWxTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IFRlc3RDb250ZXh0U2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUVudmlyb25tZW50U2VydmljZSwgVGVzdEVudmlyb25tZW50U2VydmljZSk7XG5cdFx0c2VydmljZXMuc2V0KElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsIFRlc3RFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJRGlhbG9nU2VydmljZSwgZGlhbG9nU2VydmljZSk7XG5cdFx0c2VydmljZXMuc2V0KElOb3RpZmljYXRpb25TZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVVuZG9SZWRvU2VydmljZSwgdW5kb1JlZG9TZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdFRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElNb2RlbFNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihNb2RlbFNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUNvZGVFZGl0b3JTZXJ2aWNlLCBuZXcgVGVzdENvZGVFZGl0b3JTZXJ2aWNlKHRoZW1lU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJRmlsZVNlcnZpY2UsIG5ldyBUZXN0RmlsZVNlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElVcmlJZGVudGl0eVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihVcmlJZGVudGl0eVNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSwgbmV3IFRlc3RUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElFZGl0b3JTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RFZGl0b3JTZXJ2aWNlKCkpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUxpZmVjeWNsZVNlcnZpY2UsIG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVdvcmtpbmdDb3B5U2VydmljZSwgbmV3IFRlc3RXb3JraW5nQ29weVNlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlLCBuZXcgVGVzdEVkaXRvckdyb3Vwc1NlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElDbGlwYm9hcmRTZXJ2aWNlLCBuZXcgVGVzdENsaXBib2FyZFNlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElUZXh0RmlsZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRGaWxlU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBpc0RpcnR5KCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0b3ZlcnJpZGUgZmlsZXMgPSA8YW55Pntcblx0XHRcdFx0b25EaWRTYXZlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZFJldmVydDogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VEaXJ0eTogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VFbmNvZGluZzogRXZlbnQuTm9uZVxuXHRcdFx0fTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0b3ZlcnJpZGUgdW50aXRsZWQgPSA8YW55Pntcblx0XHRcdFx0b25EaWRDaGFuZ2VFbmNvZGluZzogRXZlbnQuTm9uZVxuXHRcdFx0fTtcblx0XHRcdG92ZXJyaWRlIGNyZWF0ZShvcGVyYXRpb25zOiB7IHJlc291cmNlOiBVUkkgfVtdKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgbyBvZiBvcGVyYXRpb25zKSB7XG5cdFx0XHRcdFx0Y3JlYXRlZFJlc291cmNlcy5hZGQoby5yZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShPYmplY3QuY3JlYXRlKG51bGwpKTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldEVuY29kZWRSZWFkYWJsZShyZXNvdXJjZTogVVJJLCB2YWx1ZT86IHN0cmluZyB8IElUZXh0U25hcHNob3QpOiBQcm9taXNlPGFueT4ge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHNlcnZpY2VzLnNldChJV29ya2luZ0NvcHlGaWxlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya2luZ0NvcHlGaWxlU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBvbkRpZFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRvdmVycmlkZSBjcmVhdGVGb2xkZXIob3BlcmF0aW9uczogSUNyZWF0ZU9wZXJhdGlvbltdKTogYW55IHtcblx0XHRcdFx0dGhpcy5jcmVhdGUob3BlcmF0aW9ucyk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBjcmVhdGUob3BlcmF0aW9uczogSUNyZWF0ZUZpbGVPcGVyYXRpb25bXSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG9wZXJhdGlvbiBvZiBvcGVyYXRpb25zKSB7XG5cdFx0XHRcdFx0Y3JlYXRlZFJlc291cmNlcy5hZGQob3BlcmF0aW9uLnJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKE9iamVjdC5jcmVhdGUobnVsbCkpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgbW92ZShvcGVyYXRpb25zOiBJTW92ZU9wZXJhdGlvbltdKSB7XG5cdFx0XHRcdGNvbnN0IHsgc291cmNlLCB0YXJnZXQgfSA9IG9wZXJhdGlvbnNbMF0uZmlsZTtcblx0XHRcdFx0bW92ZWRSZXNvdXJjZXMuc2V0KHNvdXJjZSwgdGFyZ2V0KTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShPYmplY3QuY3JlYXRlKG51bGwpKTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGNvcHkob3BlcmF0aW9uczogSUNvcHlPcGVyYXRpb25bXSkge1xuXHRcdFx0XHRjb25zdCB7IHNvdXJjZSwgdGFyZ2V0IH0gPSBvcGVyYXRpb25zWzBdLmZpbGU7XG5cdFx0XHRcdGNvcGllZFJlc291cmNlcy5zZXQoc291cmNlLCB0YXJnZXQpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKE9iamVjdC5jcmVhdGUobnVsbCkpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZGVsZXRlKG9wZXJhdGlvbnM6IElEZWxldGVPcGVyYXRpb25bXSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG9wZXJhdGlvbiBvZiBvcGVyYXRpb25zKSB7XG5cdFx0XHRcdFx0ZGVsZXRlZFJlc291cmNlcy5hZGQob3BlcmF0aW9uLnJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0c2VydmljZXMuc2V0KElUZXh0TW9kZWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0TW9kZWxTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGNyZWF0ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPj4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0RWRpdG9yTW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgdGV4dEVkaXRvck1vZGVsID0gbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKSE7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHRleHRFZGl0b3JNb2RlbC5pc1JlYWRvbmx5ID0gKCkgPT4gZmFsc2U7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobmV3IEltbW9ydGFsUmVmZXJlbmNlKHRleHRFZGl0b3JNb2RlbCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHNlcnZpY2VzLnNldChJRWRpdG9yV29ya2VyU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yV29ya2VyU2VydmljZT4oKSB7XG5cblx0XHR9KTtcblx0XHRzZXJ2aWNlcy5zZXQoSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlPigpIGltcGxlbWVudHMgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSBvbkRpZFBhbmVDb21wb3NpdGVPcGVuID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIG9uRGlkUGFuZUNvbXBvc2l0ZUNsb3NlID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIGdldEFjdGl2ZVBhbmVDb21wb3NpdGUoKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRzZXJ2aWNlcy5zZXQoSUxhbmd1YWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBMYW5ndWFnZVNlcnZpY2UoKSkpO1xuXHRcdHNlcnZpY2VzLnNldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VzKTtcblxuXHRcdGJ1bGtFZGl0cyA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYWluVGhyZWFkQnVsa0VkaXRzLCBTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG51bGwpKTtcblx0XHRjb25zdCBkb2N1bWVudHMgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFpblRocmVhZERvY3VtZW50cywgU2luZ2xlUHJveHlSUENQcm90b2NvbChudWxsKSk7XG5cblx0XHQvLyBDcmVhdGUgZWRpdG9yIGxvY2F0b3Jcblx0XHRlZGl0b3JMb2NhdG9yID0ge1xuXHRcdFx0Z2V0RWRpdG9yKGlkOiBzdHJpbmcpOiBNYWluVGhyZWFkVGV4dEVkaXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiBpZCA9PT0gZWRpdG9ySWQgPyB0ZXN0RWRpdG9yIDogdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGZpbmRUZXh0RWRpdG9ySWRGb3IoKSB7IHJldHVybiB1bmRlZmluZWQ7IH0sXG5cdFx0XHRnZXRJZE9mQ29kZUVkaXRvcigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdH07XG5cblx0XHRlZGl0b3JzID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1haW5UaHJlYWRUZXh0RWRpdG9ycywgZWRpdG9yTG9jYXRvciwgU2luZ2xlUHJveHlSUENQcm90b2NvbChudWxsKSk7XG5cdFx0bW9kZWxTZXJ2aWNlID0gaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJTW9kZWxTZXJ2aWNlKSk7XG5cblx0XHQvLyBDcmVhdGUgYSB0ZXN0IGNvZGUgZWRpdG9yIHVzaW5nIHRoZSBoZWxwZXJcblx0XHRjb25zdCBtb2RlbCA9IG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnSGVsbG8gd29ybGQhJywgbnVsbCwgZXhpc3RpbmdSZXNvdXJjZSk7XG5cdFx0Y29uc3QgdGVzdENvZGVFZGl0b3IgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdENvZGVFZGl0b3IobW9kZWwpKTtcblxuXHRcdHRlc3RFZGl0b3IgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TWFpblRocmVhZFRleHRFZGl0b3IsXG5cdFx0XHRlZGl0b3JJZCxcblx0XHRcdG1vZGVsLFxuXHRcdFx0dGVzdENvZGVFZGl0b3IsXG5cdFx0XHR7IG9uR2FpbmVkRm9jdXMoKSB7IH0sIG9uTG9zdEZvY3VzKCkgeyB9IH0sXG5cdFx0XHRkb2N1bWVudHNcblx0XHQpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdChgYXBwbHlXb3Jrc3BhY2VFZGl0IHJldHVybnMgZmFsc2UgaWYgbW9kZWwgaXMgY2hhbmdlZCBieSB1c2VyYCwgKCkgPT4ge1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCdzb21ldGhpbmcnLCBudWxsLCByZXNvdXJjZSkpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlUmVzb3VyY2VFZGl0OiBJV29ya3NwYWNlVGV4dEVkaXREdG8gPSB7XG5cdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHR2ZXJzaW9uSWQ6IG1vZGVsLmdldFZlcnNpb25JZCgpLFxuXHRcdFx0dGV4dEVkaXQ6IHtcblx0XHRcdFx0dGV4dDogJ2FzZGZnJyxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBBY3QgYXMgaWYgdGhlIHVzZXIgZWRpdGVkIHRoZSBtb2RlbFxuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigwLCAwKSwgJ3NvbWV0aGluZycpXSk7XG5cblx0XHRyZXR1cm4gYnVsa0VkaXRzLiR0cnlBcHBseVdvcmtzcGFjZUVkaXQobmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHsgZWRpdHM6IFt3b3Jrc3BhY2VSZXNvdXJjZUVkaXRdIH0pKS50aGVuKChyZXN1bHQpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdChgaXNzdWUgIzU0NzczOiBhcHBseVdvcmtzcGFjZUVkaXQgY2hlY2tzIG1vZGVsIHZlcnNpb24gaW4gcmFjZSBzaXR1YXRpb25gLCAoKSA9PiB7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJ3NvbWV0aGluZycsIG51bGwsIHJlc291cmNlKSk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VSZXNvdXJjZUVkaXQxOiBJV29ya3NwYWNlVGV4dEVkaXREdG8gPSB7XG5cdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHR2ZXJzaW9uSWQ6IG1vZGVsLmdldFZlcnNpb25JZCgpLFxuXHRcdFx0dGV4dEVkaXQ6IHtcblx0XHRcdFx0dGV4dDogJ2FzZGZnJyxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3Qgd29ya3NwYWNlUmVzb3VyY2VFZGl0MjogSVdvcmtzcGFjZVRleHRFZGl0RHRvID0ge1xuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0dmVyc2lvbklkOiBtb2RlbC5nZXRWZXJzaW9uSWQoKSxcblx0XHRcdHRleHRFZGl0OiB7XG5cdFx0XHRcdHRleHQ6ICdhc2RmZycsXG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSlcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcDEgPSBidWxrRWRpdHMuJHRyeUFwcGx5V29ya3NwYWNlRWRpdChuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoeyBlZGl0czogW3dvcmtzcGFjZVJlc291cmNlRWRpdDFdIH0pKS50aGVuKChyZXN1bHQpID0+IHtcblx0XHRcdC8vIGZpcnN0IGVkaXQgcmVxdWVzdCBzdWNjZWVkc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0fSk7XG5cdFx0Y29uc3QgcDIgPSBidWxrRWRpdHMuJHRyeUFwcGx5V29ya3NwYWNlRWRpdChuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoeyBlZGl0czogW3dvcmtzcGFjZVJlc291cmNlRWRpdDJdIH0pKS50aGVuKChyZXN1bHQpID0+IHtcblx0XHRcdC8vIHNlY29uZCBlZGl0IHJlcXVlc3QgZmFpbHNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW3AxLCBwMl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseVdvcmtzcGFjZUVkaXQ6IG5vb3AgZW9sIGVkaXQga2VlcHMgdW5kbyBzdGFjayBjbGVhbicsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGluaXRpYWxUZXh0ID0gJ2hlbGxvXFxud29ybGQnO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbChpbml0aWFsVGV4dCwgbnVsbCwgcmVzb3VyY2UpKTtcblx0XHRjb25zdCBpbml0aWFsQWx0ZXJuYXRpdmVWZXJzaW9uSWQgPSBtb2RlbC5nZXRBbHRlcm5hdGl2ZVZlcnNpb25JZCgpO1xuXG5cdFx0Y29uc3QgaW5zZXJ0RWRpdDogSVdvcmtzcGFjZVRleHRFZGl0RHRvID0ge1xuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0dmVyc2lvbklkOiBtb2RlbC5nZXRWZXJzaW9uSWQoKSxcblx0XHRcdHRleHRFZGl0OiB7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgNiwgMSwgNiksXG5cdFx0XHRcdHRleHQ6ICcyJ1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBpbnNlcnRSZXN1bHQgPSBhd2FpdCBidWxrRWRpdHMuJHRyeUFwcGx5V29ya3NwYWNlRWRpdChuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoeyBlZGl0czogW2luc2VydEVkaXRdIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zZXJ0UmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2hlbGxvMlxcbndvcmxkJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKG1vZGVsLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCksIGluaXRpYWxBbHRlcm5hdGl2ZVZlcnNpb25JZCk7XG5cblx0XHRjb25zdCBlb2xFZGl0OiBJV29ya3NwYWNlVGV4dEVkaXREdG8gPSB7XG5cdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHR2ZXJzaW9uSWQ6IG1vZGVsLmdldFZlcnNpb25JZCgpLFxuXHRcdFx0dGV4dEVkaXQ6IHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSxcblx0XHRcdFx0dGV4dDogJycsXG5cdFx0XHRcdGVvbDogRW5kT2ZMaW5lU2VxdWVuY2UuTEZcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZW9sUmVzdWx0ID0gYXdhaXQgYnVsa0VkaXRzLiR0cnlBcHBseVdvcmtzcGFjZUVkaXQobmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHsgZWRpdHM6IFtlb2xFZGl0XSB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVvbFJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdoZWxsbzJcXG53b3JsZCcpO1xuXG5cdFx0Y29uc3QgdW5kb1Jlc3VsdCA9IG1vZGVsLnVuZG8oKTtcblx0XHRpZiAodW5kb1Jlc3VsdCkge1xuXHRcdFx0YXdhaXQgdW5kb1Jlc3VsdDtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIGluaXRpYWxUZXh0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKSwgaW5pdGlhbEFsdGVybmF0aXZlVmVyc2lvbklkKTtcblx0fSk7XG5cblx0dGVzdChgYXBwbHlXb3Jrc3BhY2VFZGl0IHdpdGggb25seSByZXNvdXJjZSBlZGl0YCwgKCkgPT4ge1xuXHRcdHJldHVybiBidWxrRWRpdHMuJHRyeUFwcGx5V29ya3NwYWNlRWRpdChuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoe1xuXHRcdFx0ZWRpdHM6IFtcblx0XHRcdFx0eyBvbGRSZXNvdXJjZTogcmVzb3VyY2UsIG5ld1Jlc291cmNlOiByZXNvdXJjZSwgb3B0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsgb2xkUmVzb3VyY2U6IHVuZGVmaW5lZCwgbmV3UmVzb3VyY2U6IHJlc291cmNlLCBvcHRpb25zOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0eyBvbGRSZXNvdXJjZTogcmVzb3VyY2UsIG5ld1Jlc291cmNlOiB1bmRlZmluZWQsIG9wdGlvbnM6IHVuZGVmaW5lZCB9XG5cdFx0XHRdXG5cdFx0fSkpLnRoZW4oKHJlc3VsdCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW92ZWRSZXNvdXJjZXMuZ2V0KHJlc291cmNlKSwgcmVzb3VyY2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRSZXNvdXJjZXMuaGFzKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsZXRlZFJlc291cmNlcy5oYXMocmVzb3VyY2UpLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlXb3Jrc3BhY2VFZGl0IGNhbiBjb250cm9sIHVuZG8vcmVkbyBzdGFjayAxJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxTZXJ2aWNlLmdldE1vZGVsKGV4aXN0aW5nUmVzb3VyY2UpITtcblxuXHRcdGNvbnN0IGVkaXQxOiBJU2luZ2xlRWRpdE9wZXJhdGlvbiA9IHtcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMiksXG5cdFx0XHR0ZXh0OiAnaCcsXG5cdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiBmYWxzZVxuXHRcdH07XG5cblx0XHRjb25zdCBhcHBsaWVkMSA9IGF3YWl0IGVkaXRvcnMuJHRyeUFwcGx5RWRpdHMoZWRpdG9ySWQsIG1vZGVsLmdldFZlcnNpb25JZCgpLCBbZWRpdDFdLCB7IHVuZG9TdG9wQmVmb3JlOiBmYWxzZSwgdW5kb1N0b3BBZnRlcjogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGxpZWQxLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2hlbGxvIHdvcmxkIScpO1xuXG5cdFx0Y29uc3QgZWRpdDI6IElTaW5nbGVFZGl0T3BlcmF0aW9uID0ge1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAyLCAxLCA2KSxcblx0XHRcdHRleHQ6ICdFTExPJyxcblx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFwcGxpZWQyID0gYXdhaXQgZWRpdG9ycy4kdHJ5QXBwbHlFZGl0cyhlZGl0b3JJZCwgbW9kZWwuZ2V0VmVyc2lvbklkKCksIFtlZGl0Ml0sIHsgdW5kb1N0b3BCZWZvcmU6IGZhbHNlLCB1bmRvU3RvcEFmdGVyOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwbGllZDIsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnaEVMTE8gd29ybGQhJyk7XG5cblx0XHRhd2FpdCBtb2RlbC51bmRvKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdIZWxsbyB3b3JsZCEnKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlXb3Jrc3BhY2VFZGl0IGNhbiBjb250cm9sIHVuZG8vcmVkbyBzdGFjayAyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxTZXJ2aWNlLmdldE1vZGVsKGV4aXN0aW5nUmVzb3VyY2UpITtcblxuXHRcdGNvbnN0IGVkaXQxOiBJU2luZ2xlRWRpdE9wZXJhdGlvbiA9IHtcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMiksXG5cdFx0XHR0ZXh0OiAnaCcsXG5cdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiBmYWxzZVxuXHRcdH07XG5cblx0XHRjb25zdCBhcHBsaWVkMSA9IGF3YWl0IGVkaXRvcnMuJHRyeUFwcGx5RWRpdHMoZWRpdG9ySWQsIG1vZGVsLmdldFZlcnNpb25JZCgpLCBbZWRpdDFdLCB7IHVuZG9TdG9wQmVmb3JlOiBmYWxzZSwgdW5kb1N0b3BBZnRlcjogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGxpZWQxLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2hlbGxvIHdvcmxkIScpO1xuXG5cdFx0Y29uc3QgZWRpdDI6IElTaW5nbGVFZGl0T3BlcmF0aW9uID0ge1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAyLCAxLCA2KSxcblx0XHRcdHRleHQ6ICdFTExPJyxcblx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFwcGxpZWQyID0gYXdhaXQgZWRpdG9ycy4kdHJ5QXBwbHlFZGl0cyhlZGl0b3JJZCwgbW9kZWwuZ2V0VmVyc2lvbklkKCksIFtlZGl0Ml0sIHsgdW5kb1N0b3BCZWZvcmU6IHRydWUsIHVuZG9TdG9wQWZ0ZXI6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBsaWVkMiwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdoRUxMTyB3b3JsZCEnKTtcblxuXHRcdGF3YWl0IG1vZGVsLnVuZG8oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2hlbGxvIHdvcmxkIScpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUE2Qix5QkFBeUI7QUFDL0QsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUEyQztBQUNwRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx5QkFBd0M7QUFDakQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBbUMseUJBQXlCO0FBQzVELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxn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
