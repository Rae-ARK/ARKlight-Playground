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
import { multibyteAwareBtoa } from "../../../base/common/strings.js";
import { createCancelablePromise, DeferredPromise } from "../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { isCancellationError, onUnexpectedError } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { basename } from "../../../base/common/path.js";
import { isEqual, isEqualOrParent, toLocalResource } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { localize } from "../../../nls.js";
import { IFileDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { FileOperation, IFileService } from "../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../platform/label/common/label.js";
import { IStorageService } from "../../../platform/storage/common/storage.js";
import { IUndoRedoService, UndoRedoElementType } from "../../../platform/undoRedo/common/undoRedo.js";
import { reviveWebviewExtension } from "./mainThreadWebviews.js";
import * as extHostProtocol from "../common/extHost.protocol.js";
import { CustomEditorDiffInput, CustomEditorSideBySideDiffInput } from "../../contrib/customEditor/browser/customEditorDiffInput.js";
import { CustomEditorInput } from "../../contrib/customEditor/browser/customEditorInput.js";
import { ICustomEditorService } from "../../contrib/customEditor/common/customEditor.js";
import { CustomTextEditorModel } from "../../contrib/customEditor/common/customTextEditorModel.js";
import { ExtensionKeyedWebviewOriginStore } from "../../contrib/webview/browser/webview.js";
import { IWebviewWorkbenchService } from "../../contrib/webviewPanel/browser/webviewWorkbenchService.js";
import { editorGroupToColumn } from "../../services/editor/common/editorGroupColumn.js";
import { IEditorGroupsService } from "../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { IPathService } from "../../services/path/common/pathService.js";
import { ResourceWorkingCopy } from "../../services/workingCopy/common/resourceWorkingCopy.js";
import { NO_TYPE_ID, WorkingCopyCapabilities } from "../../services/workingCopy/common/workingCopy.js";
import { IWorkingCopyFileService } from "../../services/workingCopy/common/workingCopyFileService.js";
import { IWorkingCopyService } from "../../services/workingCopy/common/workingCopyService.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { IUntitledTextEditorService } from "../../services/untitled/common/untitledTextEditorService.js";
var CustomEditorModelType = /* @__PURE__ */ ((CustomEditorModelType2) => {
  CustomEditorModelType2[CustomEditorModelType2["Custom"] = 0] = "Custom";
  CustomEditorModelType2[CustomEditorModelType2["Text"] = 1] = "Text";
  return CustomEditorModelType2;
})(CustomEditorModelType || {});
let MainThreadCustomEditors = class extends Disposable {
  constructor(context, mainThreadWebview, mainThreadWebviewPanels, extensionService, storageService, workingCopyService, workingCopyFileService, _customEditorService, _editorGroupService, _editorService, _instantiationService, _webviewWorkbenchService, _uriIdentityService, _untitledTextEditorService) {
    super();
    this.mainThreadWebview = mainThreadWebview;
    this.mainThreadWebviewPanels = mainThreadWebviewPanels;
    this._customEditorService = _customEditorService;
    this._editorGroupService = _editorGroupService;
    this._editorService = _editorService;
    this._instantiationService = _instantiationService;
    this._webviewWorkbenchService = _webviewWorkbenchService;
    this._uriIdentityService = _uriIdentityService;
    this._untitledTextEditorService = _untitledTextEditorService;
    this._editorProviders = this._register(new DisposableMap());
    this._editorRenameBackups = /* @__PURE__ */ new Map();
    this._pendingSideBySideDiffResolutions = /* @__PURE__ */ new Map();
    this._webviewOriginStore = new ExtensionKeyedWebviewOriginStore("mainThreadCustomEditors.origins", storageService);
    this._proxyCustomEditors = context.getProxy(extHostProtocol.ExtHostContext.ExtHostCustomEditors);
    this._register(workingCopyFileService.registerWorkingCopyProvider((editorResource) => {
      const matchedWorkingCopies = [];
      for (const workingCopy of workingCopyService.workingCopies) {
        if (workingCopy instanceof MainThreadCustomEditorModel) {
          if (isEqualOrParent(editorResource, workingCopy.editorResource)) {
            matchedWorkingCopies.push(workingCopy);
          }
        }
      }
      return matchedWorkingCopies;
    }));
    this._register(_webviewWorkbenchService.registerResolver({
      canResolve: (webview) => {
        if (webview instanceof CustomEditorInput || webview instanceof CustomEditorDiffInput || webview instanceof CustomEditorSideBySideDiffInput) {
          extensionService.activateByEvent(`onCustomEditor:${webview.viewType}`);
        }
        return false;
      },
      resolveWebview: () => {
        throw new Error("not implemented");
      }
    }));
    this._register(workingCopyFileService.onWillRunWorkingCopyFileOperation(async (e) => this.onWillRunWorkingCopyFileOperation(e)));
  }
  $registerTextEditorProvider(extensionData, viewType, options, capabilities, serializeBuffersForPostMessage) {
    this.registerEditorProvider(
      1 /* Text */,
      reviveWebviewExtension(extensionData),
      viewType,
      options,
      capabilities,
      true,
      serializeBuffersForPostMessage
    );
  }
  $registerCustomEditorProvider(extensionData, viewType, options, capabilities, supportsMultipleEditorsPerDocument, serializeBuffersForPostMessage) {
    this.registerEditorProvider(
      0 /* Custom */,
      reviveWebviewExtension(extensionData),
      viewType,
      options,
      capabilities,
      supportsMultipleEditorsPerDocument,
      serializeBuffersForPostMessage
    );
  }
  registerEditorProvider(modelType, extension, viewType, options, capabilities, supportsMultipleEditorsPerDocument, serializeBuffersForPostMessage) {
    if (this._editorProviders.has(viewType)) {
      throw new Error(`Provider for ${viewType} already registered`);
    }
    const disposables = new DisposableStore();
    disposables.add(this._customEditorService.registerCustomEditorCapabilities(viewType, {
      supportsMultipleEditorsPerDocument,
      isTextEditor: modelType === 1 /* Text */,
      supportsInlineDiff: capabilities.supportsInlineDiff,
      supportsSideBySideDiff: capabilities.supportsSideBySideDiff
    }));
    disposables.add(this._webviewWorkbenchService.registerResolver({
      canResolve: (webviewInput) => {
        return (webviewInput instanceof CustomEditorInput || webviewInput instanceof CustomEditorDiffInput || webviewInput instanceof CustomEditorSideBySideDiffInput) && webviewInput.viewType === viewType;
      },
      resolveWebview: async (webviewInput, cancellation) => {
        if (!(webviewInput instanceof CustomEditorInput || webviewInput instanceof CustomEditorDiffInput || webviewInput instanceof CustomEditorSideBySideDiffInput)) {
          return;
        }
        const handle = generateUuid();
        webviewInput.webview.origin = this._webviewOriginStore.getOrigin(viewType, extension.id);
        this.mainThreadWebviewPanels.addWebviewInput(handle, webviewInput, { serializeBuffersForPostMessage });
        webviewInput.webview.options = options;
        webviewInput.webview.extension = extension;
        const resource = webviewInput instanceof CustomEditorDiffInput ? webviewInput.modifiedResource : webviewInput.resource;
        let backupId;
        if (webviewInput instanceof CustomEditorInput) {
          backupId = webviewInput.backupId;
          if (webviewInput.oldResource && !webviewInput.backupId) {
            const backup = this._editorRenameBackups.get(webviewInput.oldResource.toString());
            backupId = backup?.backupId;
            this._editorRenameBackups.delete(webviewInput.oldResource.toString());
          }
        }
        let modelRef;
        const additionalModelRefs = new DisposableStore();
        try {
          modelRef = await this.getOrCreateCustomEditorModel(modelType, resource, viewType, { backupId }, cancellation);
          if (webviewInput instanceof CustomEditorDiffInput && !isEqual(webviewInput.originalResource, resource)) {
            additionalModelRefs.add(await this.getOrCreateCustomEditorModel(modelType, webviewInput.originalResource, viewType, {}, cancellation));
          } else if (modelType === 1 /* Text */ && webviewInput instanceof CustomEditorSideBySideDiffInput) {
            const otherResource = webviewInput.side === "original" ? webviewInput.modifiedResource : webviewInput.originalResource;
            if (!isEqual(otherResource, resource)) {
              additionalModelRefs.add(await this.getOrCreateCustomEditorModel(modelType, otherResource, viewType, {}, cancellation));
            }
          }
        } catch (error) {
          onUnexpectedError(error);
          webviewInput.webview.setHtml(this.mainThreadWebview.getWebviewResolvedFailedContent(viewType));
          additionalModelRefs.dispose();
          modelRef?.dispose();
          return;
        }
        if (!modelRef) {
          additionalModelRefs.dispose();
          return;
        }
        let resolvedModelRef = modelRef;
        if (cancellation.isCancellationRequested) {
          additionalModelRefs.dispose();
          resolvedModelRef.dispose();
          return;
        }
        const disposeModelRefs = () => {
          additionalModelRefs.dispose();
          if (resolvedModelRef.object.isDirty()) {
            const sub = resolvedModelRef.object.onDidChangeDirty(() => {
              if (!resolvedModelRef.object.isDirty()) {
                sub.dispose();
                resolvedModelRef.dispose();
              }
            });
            return;
          }
          resolvedModelRef.dispose();
        };
        const disposeSub = webviewInput.webview.onDidDispose(() => {
          disposeSub.dispose();
          inputDisposeSub.dispose();
          disposeModelRefs();
        });
        const inputDisposeSub = webviewInput.onWillDispose(() => {
          inputDisposeSub.dispose();
          disposeSub.dispose();
          disposeModelRefs();
        });
        if (webviewInput instanceof CustomEditorInput && capabilities.supportsMove) {
          webviewInput.onMove(async (newResource) => {
            const oldModel = resolvedModelRef;
            resolvedModelRef = await this.getOrCreateCustomEditorModel(modelType, newResource, viewType, {}, CancellationToken.None);
            this._proxyCustomEditors.$onMoveCustomEditor(handle, newResource, viewType);
            oldModel.dispose();
          });
        }
        try {
          const initData = {
            title: webviewInput.getTitle(),
            contentOptions: webviewInput.webview.contentOptions,
            options: webviewInput.webview.options,
            active: webviewInput === this._editorService.activeEditor
          };
          const position = editorGroupToColumn(this._editorGroupService, webviewInput.group || 0);
          if (webviewInput instanceof CustomEditorDiffInput) {
            const originalResource = modelType === 1 /* Text */ ? this._uriIdentityService.asCanonicalUri(webviewInput.originalResource) : webviewInput.originalResource;
            const modifiedResource = modelType === 1 /* Text */ ? this._uriIdentityService.asCanonicalUri(webviewInput.modifiedResource) : webviewInput.modifiedResource;
            await this._proxyCustomEditors.$resolveCustomEditorInlineDiff(
              originalResource,
              modifiedResource,
              handle,
              viewType,
              initData,
              position,
              cancellation
            );
          } else if (webviewInput instanceof CustomEditorSideBySideDiffInput) {
            await this.resolveCustomEditorSideBySideDiff(modelType, webviewInput, handle, viewType, initData, position, cancellation);
          } else {
            const actualResource = modelType === 1 /* Text */ ? this._uriIdentityService.asCanonicalUri(resource) : resource;
            await this._proxyCustomEditors.$resolveCustomEditor(actualResource, handle, viewType, initData, position, cancellation);
          }
        } catch (error) {
          onUnexpectedError(error);
          webviewInput.webview.setHtml(this.mainThreadWebview.getWebviewResolvedFailedContent(viewType));
          additionalModelRefs.dispose();
          resolvedModelRef.dispose();
          return;
        }
      }
    }));
    this._editorProviders.set(viewType, disposables);
  }
  resolveCustomEditorSideBySideDiff(modelType, webviewInput, handle, viewType, initData, position, cancellation) {
    let pending = this._pendingSideBySideDiffResolutions.get(webviewInput.diffId);
    if (!pending) {
      pending = {
        promise: new DeferredPromise(),
        cancellation: new CancellationTokenSource(),
        disposables: new DisposableStore()
      };
      this._pendingSideBySideDiffResolutions.set(webviewInput.diffId, pending);
    }
    const cleanup = () => {
      this._pendingSideBySideDiffResolutions.delete(webviewInput.diffId);
      pending.disposables.dispose();
      pending.cancellation.dispose();
    };
    pending.disposables.add(cancellation.onCancellationRequested(() => {
      pending.cancellation.cancel();
      if (!pending.started) {
        pending.promise.cancel();
        cleanup();
      }
    }));
    pending[webviewInput.side] = { handle, initData };
    if (pending.original && pending.modified && !pending.started) {
      pending.started = true;
      pending.promise.settleWith((async () => {
        try {
          const originalResource = modelType === 1 /* Text */ ? this._uriIdentityService.asCanonicalUri(webviewInput.originalResource) : webviewInput.originalResource;
          const modifiedResource = modelType === 1 /* Text */ ? this._uriIdentityService.asCanonicalUri(webviewInput.modifiedResource) : webviewInput.modifiedResource;
          await this._proxyCustomEditors.$resolveCustomEditorSideBySideDiff(
            originalResource,
            modifiedResource,
            {
              original: pending.original.handle,
              modified: pending.modified.handle
            },
            viewType,
            {
              original: pending.original.initData,
              modified: pending.modified.initData
            },
            position,
            pending.cancellation.token
          );
        } finally {
          cleanup();
        }
      })());
    }
    return pending.promise.p;
  }
  $unregisterEditorProvider(viewType) {
    if (!this._editorProviders.has(viewType)) {
      throw new Error(`No provider for ${viewType} registered`);
    }
    this._editorProviders.deleteAndDispose(viewType);
    this._customEditorService.models.disposeAllModelsForView(viewType);
  }
  async getOrCreateCustomEditorModel(modelType, resource, viewType, options, cancellation) {
    const existingModel = this._customEditorService.models.tryRetain(resource, viewType);
    if (existingModel) {
      return existingModel;
    }
    switch (modelType) {
      case 1 /* Text */: {
        const model = CustomTextEditorModel.create(this._instantiationService, viewType, resource);
        return this._customEditorService.models.add(resource, viewType, model);
      }
      case 0 /* Custom */: {
        const model = MainThreadCustomEditorModel.create(this._instantiationService, this._proxyCustomEditors, viewType, resource, options, this._untitledTextEditorService, () => {
          return Array.from(this.mainThreadWebviewPanels.webviewInputs).filter((editor) => editor instanceof CustomEditorInput && isEqual(editor.resource, resource) || editor instanceof CustomEditorDiffInput && (isEqual(editor.originalResource, resource) || isEqual(editor.modifiedResource, resource)) || editor instanceof CustomEditorSideBySideDiffInput && isEqual(editor.resource, resource));
        }, cancellation);
        return this._customEditorService.models.add(resource, viewType, model);
      }
    }
  }
  async $onDidEdit(resourceComponents, viewType, editId, label) {
    const model = await this.getCustomEditorModel(resourceComponents, viewType);
    model.pushEdit(editId, label);
  }
  async $onContentChange(resourceComponents, viewType) {
    const model = await this.getCustomEditorModel(resourceComponents, viewType);
    model.changeContent();
  }
  async getCustomEditorModel(resourceComponents, viewType) {
    const resource = URI.revive(resourceComponents);
    const model = await this._customEditorService.models.get(resource, viewType);
    if (!model || !(model instanceof MainThreadCustomEditorModel)) {
      throw new Error("Could not find model for webview editor");
    }
    return model;
  }
  //#region Working Copy
  async onWillRunWorkingCopyFileOperation(e) {
    if (e.operation !== FileOperation.MOVE) {
      return;
    }
    e.waitUntil((async () => {
      const models = [];
      for (const file of e.files) {
        if (file.source) {
          models.push(...await this._customEditorService.models.getAllModels(file.source));
        }
      }
      for (const model of models) {
        if (model instanceof MainThreadCustomEditorModel && model.isDirty()) {
          const workingCopy = await model.backup(CancellationToken.None);
          if (workingCopy.meta) {
            this._editorRenameBackups.set(model.editorResource.toString(), workingCopy.meta);
          }
        }
      }
    })());
  }
  //#endregion
};
MainThreadCustomEditors = __decorateClass([
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IWorkingCopyService),
  __decorateParam(6, IWorkingCopyFileService),
  __decorateParam(7, ICustomEditorService),
  __decorateParam(8, IEditorGroupsService),
  __decorateParam(9, IEditorService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, IWebviewWorkbenchService),
  __decorateParam(12, IUriIdentityService),
  __decorateParam(13, IUntitledTextEditorService)
], MainThreadCustomEditors);
var HotExitState;
((HotExitState2) => {
  let Type;
  ((Type2) => {
    Type2[Type2["Allowed"] = 0] = "Allowed";
    Type2[Type2["NotAllowed"] = 1] = "NotAllowed";
    Type2[Type2["Pending"] = 2] = "Pending";
  })(Type = HotExitState2.Type || (HotExitState2.Type = {}));
  HotExitState2.Allowed = Object.freeze({ type: 0 /* Allowed */ });
  HotExitState2.NotAllowed = Object.freeze({ type: 1 /* NotAllowed */ });
  class Pending {
    constructor(operation) {
      this.operation = operation;
      this.type = 2 /* Pending */;
    }
  }
  HotExitState2.Pending = Pending;
})(HotExitState || (HotExitState = {}));
let MainThreadCustomEditorModel = class extends ResourceWorkingCopy {
  constructor(_proxy, _viewType, _editorResource, fromBackup, _editable, startDirty, _getEditors, _fileDialogService, fileService, _labelService, _undoService, _environmentService, workingCopyService, _pathService, extensionService) {
    super(MainThreadCustomEditorModel.toWorkingCopyResource(_viewType, _editorResource), fileService);
    this._proxy = _proxy;
    this._viewType = _viewType;
    this._editorResource = _editorResource;
    this._editable = _editable;
    this._getEditors = _getEditors;
    this._fileDialogService = _fileDialogService;
    this._labelService = _labelService;
    this._undoService = _undoService;
    this._environmentService = _environmentService;
    this._pathService = _pathService;
    this._fromBackup = false;
    this._hotExitState = HotExitState.Allowed;
    this._currentEditIndex = -1;
    this._savePoint = -1;
    this._edits = [];
    // TODO@mjbvz consider to enable a `typeId` that is specific for custom
    // editors. Using a distinct `typeId` allows the working copy to have
    // any resource (including file based resources) even if other working
    // copies exist with the same resource.
    //
    // IMPORTANT: changing the `typeId` has an impact on backups for this
    // working copy. Any value that is not the empty string will be used
    // as seed to the backup. Only change the `typeId` if you have implemented
    // a fallback solution to resolve any existing backups that do not have
    // this seed.
    this.typeId = NO_TYPE_ID;
    this._onDidChangeDirty = this._register(new Emitter());
    this.onDidChangeDirty = this._onDidChangeDirty.event;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._onDidSave = this._register(new Emitter());
    this.onDidSave = this._onDidSave.event;
    this.onDidChangeReadonly = Event.None;
    this._fromBackup = fromBackup;
    this._isDirtyFromContentChange = startDirty;
    if (_editable) {
      this._register(workingCopyService.registerWorkingCopy(this));
      this._register(extensionService.onWillStop((e) => {
        e.veto(true, localize("vetoExtHostRestart", "An extension provided editor for '{0}' is still open that would close otherwise.", this.name));
      }));
    }
  }
  static async create(instantiationService, proxy, viewType, resource, options, untitledTextEditorService, getEditors, cancellation) {
    const editors = getEditors();
    let untitledDocumentData;
    const primaryCustomEditorInput = editors.find((editor) => editor instanceof CustomEditorInput);
    if (primaryCustomEditorInput) {
      untitledDocumentData = primaryCustomEditorInput.untitledDocumentData;
    }
    const { editable } = await proxy.$createCustomDocument(resource, viewType, options.backupId, untitledDocumentData, cancellation);
    if (untitledDocumentData && resource.scheme === Schemas.untitled) {
      untitledTextEditorService.get(resource)?.revert();
    }
    return instantiationService.createInstance(MainThreadCustomEditorModel, proxy, viewType, resource, !!options.backupId, editable, !!untitledDocumentData, getEditors);
  }
  get editorResource() {
    return this._editorResource;
  }
  dispose() {
    if (this._editable) {
      this._undoService.removeElements(this._editorResource);
    }
    this._proxy.$disposeCustomDocument(this._editorResource, this._viewType);
    super.dispose();
  }
  //#region IWorkingCopy
  // Make sure each custom editor has a unique resource for backup and edits
  static toWorkingCopyResource(viewType, resource) {
    const authority = viewType.replace(/[^a-z0-9\-_]/gi, "-");
    const path = `/${multibyteAwareBtoa(resource.with({ query: null, fragment: null }).toString(true))}`;
    return URI.from({
      scheme: Schemas.vscodeCustomEditor,
      authority,
      path,
      query: JSON.stringify(resource.toJSON())
    });
  }
  get name() {
    return basename(this._labelService.getUriLabel(this._editorResource));
  }
  get capabilities() {
    return this.isUntitled() ? WorkingCopyCapabilities.Untitled : WorkingCopyCapabilities.None;
  }
  isDirty() {
    if (this._isDirtyFromContentChange) {
      return true;
    }
    if (this._edits.length > 0) {
      return this._savePoint !== this._currentEditIndex;
    }
    return this._fromBackup;
  }
  isUntitled() {
    return this._editorResource.scheme === Schemas.untitled;
  }
  //#endregion
  isReadonly() {
    return !this._editable;
  }
  get viewType() {
    return this._viewType;
  }
  get backupId() {
    return this._backupId;
  }
  pushEdit(editId, label) {
    if (!this._editable) {
      throw new Error("Document is not editable");
    }
    this.change(() => {
      this.spliceEdits(editId);
      this._currentEditIndex = this._edits.length - 1;
    });
    this._undoService.pushElement({
      type: UndoRedoElementType.Resource,
      resource: this._editorResource,
      label: label ?? localize("defaultEditLabel", "Edit"),
      code: "undoredo.customEditorEdit",
      undo: () => this.undo(),
      redo: () => this.redo()
    });
  }
  changeContent() {
    this.change(() => {
      this._isDirtyFromContentChange = true;
    });
  }
  async undo() {
    if (!this._editable) {
      return;
    }
    if (this._currentEditIndex < 0) {
      return;
    }
    const undoneEdit = this._edits[this._currentEditIndex];
    this.change(() => {
      --this._currentEditIndex;
    });
    await this._proxy.$undo(this._editorResource, this.viewType, undoneEdit, this.isDirty());
  }
  async redo() {
    if (!this._editable) {
      return;
    }
    if (this._currentEditIndex >= this._edits.length - 1) {
      return;
    }
    const redoneEdit = this._edits[this._currentEditIndex + 1];
    this.change(() => {
      ++this._currentEditIndex;
    });
    await this._proxy.$redo(this._editorResource, this.viewType, redoneEdit, this.isDirty());
  }
  spliceEdits(editToInsert) {
    const start = this._currentEditIndex + 1;
    const toRemove = this._edits.length - this._currentEditIndex;
    const removedEdits = typeof editToInsert === "number" ? this._edits.splice(start, toRemove, editToInsert) : this._edits.splice(start, toRemove);
    if (removedEdits.length) {
      this._proxy.$disposeEdits(this._editorResource, this._viewType, removedEdits);
    }
  }
  change(makeEdit) {
    const wasDirty = this.isDirty();
    makeEdit();
    this._onDidChangeContent.fire();
    if (this.isDirty() !== wasDirty) {
      this._onDidChangeDirty.fire();
    }
  }
  async revert(options) {
    if (!this._editable) {
      return;
    }
    if (this._currentEditIndex === this._savePoint && !this._isDirtyFromContentChange && !this._fromBackup) {
      return;
    }
    if (!options?.soft) {
      this._proxy.$revert(this._editorResource, this.viewType, CancellationToken.None);
    }
    this.change(() => {
      this._isDirtyFromContentChange = false;
      this._fromBackup = false;
      this._currentEditIndex = this._savePoint;
      this.spliceEdits();
    });
  }
  async save(options) {
    const result = !!await this.saveCustomEditor(options);
    if (result) {
      this._onDidSave.fire({ reason: options?.reason, source: options?.source });
    }
    return result;
  }
  async saveCustomEditor(options) {
    if (!this._editable) {
      return void 0;
    }
    if (this.isUntitled()) {
      const targetUri = await this.suggestUntitledSavePath(options);
      if (!targetUri) {
        return void 0;
      }
      await this.saveCustomEditorAs(this._editorResource, targetUri, options);
      return targetUri;
    }
    const savePromise = createCancelablePromise((token) => this._proxy.$onSave(this._editorResource, this.viewType, token));
    this._ongoingSave?.cancel();
    this._ongoingSave = savePromise;
    try {
      await savePromise;
      if (this._ongoingSave === savePromise) {
        this.change(() => {
          this._isDirtyFromContentChange = false;
          this._savePoint = this._currentEditIndex;
          this._fromBackup = false;
        });
      }
    } finally {
      if (this._ongoingSave === savePromise) {
        this._ongoingSave = void 0;
      }
    }
    return this._editorResource;
  }
  suggestUntitledSavePath(options) {
    if (!this.isUntitled()) {
      throw new Error("Resource is not untitled");
    }
    const remoteAuthority = this._environmentService.remoteAuthority;
    const localResource = toLocalResource(this._editorResource, remoteAuthority, this._pathService.defaultUriScheme);
    return this._fileDialogService.pickFileToSave(localResource, options?.availableFileSystems);
  }
  async saveCustomEditorAs(resource, targetResource, _options) {
    if (this._editable) {
      await createCancelablePromise((token) => this._proxy.$onSaveAs(this._editorResource, this.viewType, targetResource, token));
      this.change(() => {
        this._isDirtyFromContentChange = false;
        this._savePoint = this._currentEditIndex;
        this._fromBackup = false;
      });
      return true;
    } else {
      await this.fileService.copy(
        resource,
        targetResource,
        false
        /* overwrite */
      );
      return true;
    }
  }
  get canHotExit() {
    return typeof this._backupId === "string" && this._hotExitState.type === 0 /* Allowed */;
  }
  async backup(token) {
    const editors = this._getEditors();
    if (!editors.length) {
      throw new Error("No editors found for resource, cannot back up");
    }
    const primaryEditor = editors[0];
    const backupMeta = {
      viewType: this.viewType,
      editorResource: this._editorResource,
      customTitle: primaryEditor.getWebviewTitle(),
      iconPath: primaryEditor.iconPath,
      backupId: "",
      extension: primaryEditor.extension ? {
        id: primaryEditor.extension.id.value,
        location: primaryEditor.extension.location
      } : void 0,
      webview: {
        origin: primaryEditor.webview.origin,
        options: primaryEditor.webview.options,
        state: primaryEditor.webview.state
      }
    };
    const backupData = {
      meta: backupMeta
    };
    if (!this._editable) {
      return backupData;
    }
    if (this._hotExitState.type === 2 /* Pending */) {
      this._hotExitState.operation.cancel();
    }
    const pendingState = new HotExitState.Pending(
      createCancelablePromise((token2) => this._proxy.$backup(this._editorResource.toJSON(), this.viewType, token2))
    );
    this._hotExitState = pendingState;
    token.onCancellationRequested(() => {
      pendingState.operation.cancel();
    });
    let errorMessage = "";
    try {
      const backupId = await pendingState.operation;
      if (this._hotExitState === pendingState) {
        this._hotExitState = HotExitState.Allowed;
        backupData.meta.backupId = backupId;
        this._backupId = backupId;
      }
    } catch (e) {
      if (isCancellationError(e)) {
        throw e;
      }
      if (this._hotExitState === pendingState) {
        this._hotExitState = HotExitState.NotAllowed;
      }
      if (e.message) {
        errorMessage = e.message;
      }
    }
    if (this._hotExitState === HotExitState.Allowed) {
      return backupData;
    }
    throw new Error(`Cannot backup in this state: ${errorMessage}`);
  }
};
MainThreadCustomEditorModel = __decorateClass([
  __decorateParam(7, IFileDialogService),
  __decorateParam(8, IFileService),
  __decorateParam(9, ILabelService),
  __decorateParam(10, IUndoRedoService),
  __decorateParam(11, IWorkbenchEnvironmentService),
  __decorateParam(12, IWorkingCopyService),
  __decorateParam(13, IPathService),
  __decorateParam(14, IExtensionService)
], MainThreadCustomEditorModel);
export {
  MainThreadCustomEditors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkQ3VzdG9tRWRpdG9ycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG11bHRpYnl0ZUF3YXJlQnRvYSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciwgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzRXF1YWwsIGlzRXF1YWxPclBhcmVudCwgdG9Mb2NhbFJlc291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbiwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVbmRvUmVkb1NlcnZpY2UsIFVuZG9SZWRvRWxlbWVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8uanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZFdlYnZpZXdQYW5lbHMgfSBmcm9tICcuL21haW5UaHJlYWRXZWJ2aWV3UGFuZWxzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRXZWJ2aWV3cywgcmV2aXZlV2Vidmlld0V4dGVuc2lvbiB9IGZyb20gJy4vbWFpblRocmVhZFdlYnZpZXdzLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RQcm90b2NvbCBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJUmV2ZXJ0T3B0aW9ucywgSVNhdmVPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBDdXN0b21FZGl0b3JEaWZmSW5wdXQsIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXQgfSBmcm9tICcuLi8uLi9jb250cmliL2N1c3RvbUVkaXRvci9icm93c2VyL2N1c3RvbUVkaXRvckRpZmZJbnB1dC5qcyc7XG5pbXBvcnQgeyBDdXN0b21FZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY3VzdG9tRWRpdG9yL2Jyb3dzZXIvY3VzdG9tRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQ3VzdG9tRG9jdW1lbnRCYWNrdXBEYXRhIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jdXN0b21FZGl0b3IvYnJvd3Nlci9jdXN0b21FZGl0b3JJbnB1dEZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUN1c3RvbUVkaXRvck1vZGVsLCBJQ3VzdG9tRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY3VzdG9tRWRpdG9yL2NvbW1vbi9jdXN0b21FZGl0b3IuanMnO1xuaW1wb3J0IHsgQ3VzdG9tVGV4dEVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jdXN0b21FZGl0b3IvY29tbW9uL2N1c3RvbVRleHRFZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25LZXllZFdlYnZpZXdPcmlnaW5TdG9yZSwgV2Vidmlld0V4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBXZWJ2aWV3SW5wdXQgfSBmcm9tICcuLi8uLi9jb250cmliL3dlYnZpZXdQYW5lbC9icm93c2VyL3dlYnZpZXdFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJV2Vidmlld1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL3dlYnZpZXdQYW5lbC9icm93c2VyL3dlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvckdyb3VwQ29sdW1uLCBlZGl0b3JHcm91cFRvQ29sdW1uIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cENvbHVtbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVdvcmtpbmdDb3B5IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3Jlc291cmNlV29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5LCBJV29ya2luZ0NvcHlCYWNrdXAsIElXb3JraW5nQ29weVNhdmVFdmVudCwgTk9fVFlQRV9JRCwgV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsIFdvcmtpbmdDb3B5RmlsZUV2ZW50IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3VudGl0bGVkL2NvbW1vbi91bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLmpzJztcblxuY29uc3QgZW51bSBDdXN0b21FZGl0b3JNb2RlbFR5cGUge1xuXHRDdXN0b20sXG5cdFRleHQsXG59XG5cbnR5cGUgQ3VzdG9tRWRpdG9yV2Vidmlld0lucHV0ID0gQ3VzdG9tRWRpdG9ySW5wdXQgfCBDdXN0b21FZGl0b3JEaWZmSW5wdXQgfCBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0O1xuXG5pbnRlcmZhY2UgQ3VzdG9tRWRpdG9yRGlmZkluaXREYXRhIHtcblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZztcblx0cmVhZG9ubHkgY29udGVudE9wdGlvbnM6IGV4dEhvc3RQcm90b2NvbC5JV2Vidmlld0NvbnRlbnRPcHRpb25zO1xuXHRyZWFkb25seSBvcHRpb25zOiBleHRIb3N0UHJvdG9jb2wuSVdlYnZpZXdQYW5lbE9wdGlvbnM7XG5cdHJlYWRvbmx5IGFjdGl2ZTogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmRGF0YSB7XG5cdHJlYWRvbmx5IGhhbmRsZTogZXh0SG9zdFByb3RvY29sLldlYnZpZXdIYW5kbGU7XG5cdHJlYWRvbmx5IGluaXREYXRhOiBDdXN0b21FZGl0b3JEaWZmSW5pdERhdGE7XG59XG5cbmludGVyZmFjZSBQZW5kaW5nQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZSZXNvbHV0aW9uIHtcblx0b3JpZ2luYWw/OiBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZkRhdGE7XG5cdG1vZGlmaWVkPzogQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZEYXRhO1xuXHRzdGFydGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgcHJvbWlzZTogRGVmZXJyZWRQcm9taXNlPHZvaWQ+O1xuXHRyZWFkb25seSBjYW5jZWxsYXRpb246IENhbmNlbGxhdGlvblRva2VuU291cmNlO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZEN1c3RvbUVkaXRvcnMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgZXh0SG9zdFByb3RvY29sLk1haW5UaHJlYWRDdXN0b21FZGl0b3JzU2hhcGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5Q3VzdG9tRWRpdG9yczogZXh0SG9zdFByb3RvY29sLkV4dEhvc3RDdXN0b21FZGl0b3JzU2hhcGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yUHJvdmlkZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JSZW5hbWVCYWNrdXBzID0gbmV3IE1hcDxzdHJpbmcsIEN1c3RvbURvY3VtZW50QmFja3VwRGF0YT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1NpZGVCeVNpZGVEaWZmUmVzb2x1dGlvbnMgPSBuZXcgTWFwPHN0cmluZywgUGVuZGluZ0N1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmUmVzb2x1dGlvbj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93ZWJ2aWV3T3JpZ2luU3RvcmU6IEV4dGVuc2lvbktleWVkV2Vidmlld09yaWdpblN0b3JlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1haW5UaHJlYWRXZWJ2aWV3OiBNYWluVGhyZWFkV2Vidmlld3MsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYWluVGhyZWFkV2Vidmlld1BhbmVsczogTWFpblRocmVhZFdlYnZpZXdQYW5lbHMsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5U2VydmljZSB3b3JraW5nQ29weVNlcnZpY2U6IElXb3JraW5nQ29weVNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIHdvcmtpbmdDb3B5RmlsZVNlcnZpY2U6IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLFxuXHRcdEBJQ3VzdG9tRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21FZGl0b3JTZXJ2aWNlOiBJQ3VzdG9tRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV2Vidmlld1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd2Vidmlld1dvcmtiZW5jaFNlcnZpY2U6IElXZWJ2aWV3V29ya2JlbmNoU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U6IElVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fd2Vidmlld09yaWdpblN0b3JlID0gbmV3IEV4dGVuc2lvbktleWVkV2Vidmlld09yaWdpblN0b3JlKCdtYWluVGhyZWFkQ3VzdG9tRWRpdG9ycy5vcmlnaW5zJywgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcHJveHlDdXN0b21FZGl0b3JzID0gY29udGV4dC5nZXRQcm94eShleHRIb3N0UHJvdG9jb2wuRXh0SG9zdENvbnRleHQuRXh0SG9zdEN1c3RvbUVkaXRvcnMpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod29ya2luZ0NvcHlGaWxlU2VydmljZS5yZWdpc3RlcldvcmtpbmdDb3B5UHJvdmlkZXIoKGVkaXRvclJlc291cmNlKSA9PiB7XG5cdFx0XHRjb25zdCBtYXRjaGVkV29ya2luZ0NvcGllczogSVdvcmtpbmdDb3B5W10gPSBbXTtcblxuXHRcdFx0Zm9yIChjb25zdCB3b3JraW5nQ29weSBvZiB3b3JraW5nQ29weVNlcnZpY2Uud29ya2luZ0NvcGllcykge1xuXHRcdFx0XHRpZiAod29ya2luZ0NvcHkgaW5zdGFuY2VvZiBNYWluVGhyZWFkQ3VzdG9tRWRpdG9yTW9kZWwpIHtcblx0XHRcdFx0XHRpZiAoaXNFcXVhbE9yUGFyZW50KGVkaXRvclJlc291cmNlLCB3b3JraW5nQ29weS5lZGl0b3JSZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdG1hdGNoZWRXb3JraW5nQ29waWVzLnB1c2god29ya2luZ0NvcHkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1hdGNoZWRXb3JraW5nQ29waWVzO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRoaXMgcmV2aXZlcidzIG9ubHkgam9iIGlzIHRvIGFjdGl2YXRlIGN1c3RvbSBlZGl0b3IgZXh0ZW5zaW9ucy5cblx0XHR0aGlzLl9yZWdpc3Rlcihfd2Vidmlld1dvcmtiZW5jaFNlcnZpY2UucmVnaXN0ZXJSZXNvbHZlcih7XG5cdFx0XHRjYW5SZXNvbHZlOiAod2VidmlldzogV2Vidmlld0lucHV0KSA9PiB7XG5cdFx0XHRcdGlmICh3ZWJ2aWV3IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9ySW5wdXQgfHwgd2VidmlldyBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvckRpZmZJbnB1dCB8fCB3ZWJ2aWV3IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dCkge1xuXHRcdFx0XHRcdGV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvbkN1c3RvbUVkaXRvcjoke3dlYnZpZXcudmlld1R5cGV9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSxcblx0XHRcdHJlc29sdmVXZWJ2aWV3OiAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0XHR9KSk7XG5cblx0XHQvLyBXb3JraW5nIGNvcHkgb3BlcmF0aW9uc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdvcmtpbmdDb3B5RmlsZVNlcnZpY2Uub25XaWxsUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGFzeW5jIGUgPT4gdGhpcy5vbldpbGxSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSkpKTtcblx0fVxuXG5cdHB1YmxpYyAkcmVnaXN0ZXJUZXh0RWRpdG9yUHJvdmlkZXIoZXh0ZW5zaW9uRGF0YTogZXh0SG9zdFByb3RvY29sLldlYnZpZXdFeHRlbnNpb25EZXNjcmlwdGlvbiwgdmlld1R5cGU6IHN0cmluZywgb3B0aW9uczogZXh0SG9zdFByb3RvY29sLklXZWJ2aWV3UGFuZWxPcHRpb25zLCBjYXBhYmlsaXRpZXM6IGV4dEhvc3RQcm90b2NvbC5DdXN0b21FZGl0b3JQcm92aWRlckNhcGFiaWxpdGllcywgc2VyaWFsaXplQnVmZmVyc0ZvclBvc3RNZXNzYWdlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvclByb3ZpZGVyKFxuXHRcdFx0Q3VzdG9tRWRpdG9yTW9kZWxUeXBlLlRleHQsXG5cdFx0XHRyZXZpdmVXZWJ2aWV3RXh0ZW5zaW9uKGV4dGVuc2lvbkRhdGEpLFxuXHRcdFx0dmlld1R5cGUsXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0Y2FwYWJpbGl0aWVzLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHNlcmlhbGl6ZUJ1ZmZlcnNGb3JQb3N0TWVzc2FnZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgJHJlZ2lzdGVyQ3VzdG9tRWRpdG9yUHJvdmlkZXIoZXh0ZW5zaW9uRGF0YTogZXh0SG9zdFByb3RvY29sLldlYnZpZXdFeHRlbnNpb25EZXNjcmlwdGlvbiwgdmlld1R5cGU6IHN0cmluZywgb3B0aW9uczogZXh0SG9zdFByb3RvY29sLklXZWJ2aWV3UGFuZWxPcHRpb25zLCBjYXBhYmlsaXRpZXM6IGV4dEhvc3RQcm90b2NvbC5DdXN0b21FZGl0b3JQcm92aWRlckNhcGFiaWxpdGllcywgc3VwcG9ydHNNdWx0aXBsZUVkaXRvcnNQZXJEb2N1bWVudDogYm9vbGVhbiwgc2VyaWFsaXplQnVmZmVyc0ZvclBvc3RNZXNzYWdlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvclByb3ZpZGVyKFxuXHRcdFx0Q3VzdG9tRWRpdG9yTW9kZWxUeXBlLkN1c3RvbSxcblx0XHRcdHJldml2ZVdlYnZpZXdFeHRlbnNpb24oZXh0ZW5zaW9uRGF0YSksXG5cdFx0XHR2aWV3VHlwZSxcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHRjYXBhYmlsaXRpZXMsXG5cdFx0XHRzdXBwb3J0c011bHRpcGxlRWRpdG9yc1BlckRvY3VtZW50LFxuXHRcdFx0c2VyaWFsaXplQnVmZmVyc0ZvclBvc3RNZXNzYWdlXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJFZGl0b3JQcm92aWRlcihcblx0XHRtb2RlbFR5cGU6IEN1c3RvbUVkaXRvck1vZGVsVHlwZSxcblx0XHRleHRlbnNpb246IFdlYnZpZXdFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHR2aWV3VHlwZTogc3RyaW5nLFxuXHRcdG9wdGlvbnM6IGV4dEhvc3RQcm90b2NvbC5JV2Vidmlld1BhbmVsT3B0aW9ucyxcblx0XHRjYXBhYmlsaXRpZXM6IGV4dEhvc3RQcm90b2NvbC5DdXN0b21FZGl0b3JQcm92aWRlckNhcGFiaWxpdGllcyxcblx0XHRzdXBwb3J0c011bHRpcGxlRWRpdG9yc1BlckRvY3VtZW50OiBib29sZWFuLFxuXHRcdHNlcmlhbGl6ZUJ1ZmZlcnNGb3JQb3N0TWVzc2FnZTogYm9vbGVhbixcblx0KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2VkaXRvclByb3ZpZGVycy5oYXModmlld1R5cGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFByb3ZpZGVyIGZvciAke3ZpZXdUeXBlfSBhbHJlYWR5IHJlZ2lzdGVyZWRgKTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9jdXN0b21FZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyQ3VzdG9tRWRpdG9yQ2FwYWJpbGl0aWVzKHZpZXdUeXBlLCB7XG5cdFx0XHRzdXBwb3J0c011bHRpcGxlRWRpdG9yc1BlckRvY3VtZW50LFxuXHRcdFx0aXNUZXh0RWRpdG9yOiBtb2RlbFR5cGUgPT09IEN1c3RvbUVkaXRvck1vZGVsVHlwZS5UZXh0LFxuXHRcdFx0c3VwcG9ydHNJbmxpbmVEaWZmOiBjYXBhYmlsaXRpZXMuc3VwcG9ydHNJbmxpbmVEaWZmLFxuXHRcdFx0c3VwcG9ydHNTaWRlQnlTaWRlRGlmZjogY2FwYWJpbGl0aWVzLnN1cHBvcnRzU2lkZUJ5U2lkZURpZmYsXG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3dlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlLnJlZ2lzdGVyUmVzb2x2ZXIoe1xuXHRcdFx0Y2FuUmVzb2x2ZTogKHdlYnZpZXdJbnB1dCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gKHdlYnZpZXdJbnB1dCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvcklucHV0IHx8IHdlYnZpZXdJbnB1dCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvckRpZmZJbnB1dCB8fCB3ZWJ2aWV3SW5wdXQgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0KSAmJiB3ZWJ2aWV3SW5wdXQudmlld1R5cGUgPT09IHZpZXdUeXBlO1xuXHRcdFx0fSxcblx0XHRcdHJlc29sdmVXZWJ2aWV3OiBhc3luYyAod2Vidmlld0lucHV0OiBXZWJ2aWV3SW5wdXQsIGNhbmNlbGxhdGlvbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0aWYgKCEod2Vidmlld0lucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9ySW5wdXQgfHwgd2Vidmlld0lucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yRGlmZklucHV0IHx8IHdlYnZpZXdJbnB1dCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaGFuZGxlID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHRcdFx0d2Vidmlld0lucHV0LndlYnZpZXcub3JpZ2luID0gdGhpcy5fd2Vidmlld09yaWdpblN0b3JlLmdldE9yaWdpbih2aWV3VHlwZSwgZXh0ZW5zaW9uLmlkKTtcblxuXHRcdFx0XHR0aGlzLm1haW5UaHJlYWRXZWJ2aWV3UGFuZWxzLmFkZFdlYnZpZXdJbnB1dChoYW5kbGUsIHdlYnZpZXdJbnB1dCwgeyBzZXJpYWxpemVCdWZmZXJzRm9yUG9zdE1lc3NhZ2UgfSk7XG5cdFx0XHRcdHdlYnZpZXdJbnB1dC53ZWJ2aWV3Lm9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdFx0XHR3ZWJ2aWV3SW5wdXQud2Vidmlldy5leHRlbnNpb24gPSBleHRlbnNpb247XG5cblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB3ZWJ2aWV3SW5wdXQgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JEaWZmSW5wdXQgPyB3ZWJ2aWV3SW5wdXQubW9kaWZpZWRSZXNvdXJjZSA6IHdlYnZpZXdJbnB1dC5yZXNvdXJjZTtcblxuXHRcdFx0XHQvLyBJZiB0aGVyZSdzIGFuIG9sZCByZXNvdXJjZSB0aGlzIHdhcyBhIG1vdmUgYW5kIHdlIG11c3QgcmVzb2x2ZSB0aGUgYmFja3VwIGF0IHRoZSBzYW1lIHRpbWUgYXMgdGhlIHdlYnZpZXdcblx0XHRcdFx0Ly8gVGhpcyBpcyBiZWNhdXNlIHRoZSBiYWNrdXAgbXVzdCBiZSByZWFkeSB1cG9uIG1vZGVsIGNyZWF0aW9uLCBhbmQgdGhlIGlucHV0IHJlc29sdmUgbWV0aG9kIGNvbWVzIGFmdGVyXG5cdFx0XHRcdGxldCBiYWNrdXBJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAod2Vidmlld0lucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0XHRiYWNrdXBJZCA9IHdlYnZpZXdJbnB1dC5iYWNrdXBJZDtcblx0XHRcdFx0XHRpZiAod2Vidmlld0lucHV0Lm9sZFJlc291cmNlICYmICF3ZWJ2aWV3SW5wdXQuYmFja3VwSWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGJhY2t1cCA9IHRoaXMuX2VkaXRvclJlbmFtZUJhY2t1cHMuZ2V0KHdlYnZpZXdJbnB1dC5vbGRSZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRcdGJhY2t1cElkID0gYmFja3VwPy5iYWNrdXBJZDtcblx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvclJlbmFtZUJhY2t1cHMuZGVsZXRlKHdlYnZpZXdJbnB1dC5vbGRSZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgbW9kZWxSZWY6IElSZWZlcmVuY2U8SUN1c3RvbUVkaXRvck1vZGVsPiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgYWRkaXRpb25hbE1vZGVsUmVmcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRtb2RlbFJlZiA9IGF3YWl0IHRoaXMuZ2V0T3JDcmVhdGVDdXN0b21FZGl0b3JNb2RlbChtb2RlbFR5cGUsIHJlc291cmNlLCB2aWV3VHlwZSwgeyBiYWNrdXBJZCB9LCBjYW5jZWxsYXRpb24pO1xuXHRcdFx0XHRcdGlmICh3ZWJ2aWV3SW5wdXQgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JEaWZmSW5wdXQgJiYgIWlzRXF1YWwod2Vidmlld0lucHV0Lm9yaWdpbmFsUmVzb3VyY2UsIHJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0YWRkaXRpb25hbE1vZGVsUmVmcy5hZGQoYXdhaXQgdGhpcy5nZXRPckNyZWF0ZUN1c3RvbUVkaXRvck1vZGVsKG1vZGVsVHlwZSwgd2Vidmlld0lucHV0Lm9yaWdpbmFsUmVzb3VyY2UsIHZpZXdUeXBlLCB7fSwgY2FuY2VsbGF0aW9uKSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChtb2RlbFR5cGUgPT09IEN1c3RvbUVkaXRvck1vZGVsVHlwZS5UZXh0ICYmIHdlYnZpZXdJbnB1dCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG90aGVyUmVzb3VyY2UgPSB3ZWJ2aWV3SW5wdXQuc2lkZSA9PT0gJ29yaWdpbmFsJyA/IHdlYnZpZXdJbnB1dC5tb2RpZmllZFJlc291cmNlIDogd2Vidmlld0lucHV0Lm9yaWdpbmFsUmVzb3VyY2U7XG5cdFx0XHRcdFx0XHRpZiAoIWlzRXF1YWwob3RoZXJSZXNvdXJjZSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxNb2RlbFJlZnMuYWRkKGF3YWl0IHRoaXMuZ2V0T3JDcmVhdGVDdXN0b21FZGl0b3JNb2RlbChtb2RlbFR5cGUsIG90aGVyUmVzb3VyY2UsIHZpZXdUeXBlLCB7fSwgY2FuY2VsbGF0aW9uKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHRcdFx0XHR3ZWJ2aWV3SW5wdXQud2Vidmlldy5zZXRIdG1sKHRoaXMubWFpblRocmVhZFdlYnZpZXcuZ2V0V2Vidmlld1Jlc29sdmVkRmFpbGVkQ29udGVudCh2aWV3VHlwZSkpO1xuXHRcdFx0XHRcdGFkZGl0aW9uYWxNb2RlbFJlZnMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdG1vZGVsUmVmPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFtb2RlbFJlZikge1xuXHRcdFx0XHRcdGFkZGl0aW9uYWxNb2RlbFJlZnMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRsZXQgcmVzb2x2ZWRNb2RlbFJlZiA9IG1vZGVsUmVmO1xuXG5cdFx0XHRcdGlmIChjYW5jZWxsYXRpb24uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRhZGRpdGlvbmFsTW9kZWxSZWZzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlZE1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBkaXNwb3NlTW9kZWxSZWZzID0gKCkgPT4ge1xuXHRcdFx0XHRcdGFkZGl0aW9uYWxNb2RlbFJlZnMuZGlzcG9zZSgpO1xuXG5cdFx0XHRcdFx0Ly8gSWYgdGhlIG1vZGVsIGlzIHN0aWxsIGRpcnR5LCBtYWtlIHN1cmUgd2UgaGF2ZSB0aW1lIHRvIHNhdmUgaXRcblx0XHRcdFx0XHRpZiAocmVzb2x2ZWRNb2RlbFJlZi5vYmplY3QuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzdWIgPSByZXNvbHZlZE1vZGVsUmVmLm9iamVjdC5vbkRpZENoYW5nZURpcnR5KCgpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKCFyZXNvbHZlZE1vZGVsUmVmLm9iamVjdC5pc0RpcnR5KCkpIHtcblx0XHRcdFx0XHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRcdHJlc29sdmVkTW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXNvbHZlZE1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBkaXNwb3NlU3ViID0gd2Vidmlld0lucHV0LndlYnZpZXcub25EaWREaXNwb3NlKCgpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NlU3ViLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRpbnB1dERpc3Bvc2VTdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGRpc3Bvc2VNb2RlbFJlZnMoKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gQWxzbyBsaXN0ZW4gZm9yIHdoZW4gdGhlIGlucHV0IGlzIGRpc3Bvc2VkIChlLmcuLCBkdXJpbmcgU2F2ZUFzIHdoZW4gdGhlIHdlYnZpZXcgaXMgdHJhbnNmZXJyZWQgdG8gYSBuZXcgZWRpdG9yKS5cblx0XHRcdFx0Ly8gSW4gdGhpcyBjYXNlLCB3ZWJ2aWV3Lm9uRGlkRGlzcG9zZSB3b24ndCBmaXJlIGJlY2F1c2UgdGhlIHdlYnZpZXcgaXMgcmV1c2VkLlxuXHRcdFx0XHRjb25zdCBpbnB1dERpc3Bvc2VTdWIgPSB3ZWJ2aWV3SW5wdXQub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRcdFx0aW5wdXREaXNwb3NlU3ViLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRkaXNwb3NlU3ViLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRkaXNwb3NlTW9kZWxSZWZzKCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmICh3ZWJ2aWV3SW5wdXQgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JJbnB1dCAmJiBjYXBhYmlsaXRpZXMuc3VwcG9ydHNNb3ZlKSB7XG5cdFx0XHRcdFx0d2Vidmlld0lucHV0Lm9uTW92ZShhc3luYyAobmV3UmVzb3VyY2U6IFVSSSkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3Qgb2xkTW9kZWwgPSByZXNvbHZlZE1vZGVsUmVmO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZWRNb2RlbFJlZiA9IGF3YWl0IHRoaXMuZ2V0T3JDcmVhdGVDdXN0b21FZGl0b3JNb2RlbChtb2RlbFR5cGUsIG5ld1Jlc291cmNlLCB2aWV3VHlwZSwge30sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdFx0dGhpcy5fcHJveHlDdXN0b21FZGl0b3JzLiRvbk1vdmVDdXN0b21FZGl0b3IoaGFuZGxlLCBuZXdSZXNvdXJjZSwgdmlld1R5cGUpO1xuXHRcdFx0XHRcdFx0b2xkTW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBpbml0RGF0YSA9IHtcblx0XHRcdFx0XHRcdHRpdGxlOiB3ZWJ2aWV3SW5wdXQuZ2V0VGl0bGUoKSxcblx0XHRcdFx0XHRcdGNvbnRlbnRPcHRpb25zOiB3ZWJ2aWV3SW5wdXQud2Vidmlldy5jb250ZW50T3B0aW9ucyxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHdlYnZpZXdJbnB1dC53ZWJ2aWV3Lm9wdGlvbnMsXG5cdFx0XHRcdFx0XHRhY3RpdmU6IHdlYnZpZXdJbnB1dCA9PT0gdGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IGVkaXRvckdyb3VwVG9Db2x1bW4odGhpcy5fZWRpdG9yR3JvdXBTZXJ2aWNlLCB3ZWJ2aWV3SW5wdXQuZ3JvdXAgfHwgMCk7XG5cblx0XHRcdFx0XHRpZiAod2Vidmlld0lucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yRGlmZklucHV0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbFJlc291cmNlID0gbW9kZWxUeXBlID09PSBDdXN0b21FZGl0b3JNb2RlbFR5cGUuVGV4dCA/IHRoaXMuX3VyaUlkZW50aXR5U2VydmljZS5hc0Nhbm9uaWNhbFVyaSh3ZWJ2aWV3SW5wdXQub3JpZ2luYWxSZXNvdXJjZSkgOiB3ZWJ2aWV3SW5wdXQub3JpZ2luYWxSZXNvdXJjZTtcblx0XHRcdFx0XHRcdGNvbnN0IG1vZGlmaWVkUmVzb3VyY2UgPSBtb2RlbFR5cGUgPT09IEN1c3RvbUVkaXRvck1vZGVsVHlwZS5UZXh0ID8gdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKHdlYnZpZXdJbnB1dC5tb2RpZmllZFJlc291cmNlKSA6IHdlYnZpZXdJbnB1dC5tb2RpZmllZFJlc291cmNlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcHJveHlDdXN0b21FZGl0b3JzLiRyZXNvbHZlQ3VzdG9tRWRpdG9ySW5saW5lRGlmZihcblx0XHRcdFx0XHRcdFx0b3JpZ2luYWxSZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0bW9kaWZpZWRSZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0aGFuZGxlLFxuXHRcdFx0XHRcdFx0XHR2aWV3VHlwZSxcblx0XHRcdFx0XHRcdFx0aW5pdERhdGEsXG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uLFxuXHRcdFx0XHRcdFx0XHRjYW5jZWxsYXRpb25cblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh3ZWJ2aWV3SW5wdXQgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0KSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlc29sdmVDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZihtb2RlbFR5cGUsIHdlYnZpZXdJbnB1dCwgaGFuZGxlLCB2aWV3VHlwZSwgaW5pdERhdGEsIHBvc2l0aW9uLCBjYW5jZWxsYXRpb24pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhY3R1YWxSZXNvdXJjZSA9IG1vZGVsVHlwZSA9PT0gQ3VzdG9tRWRpdG9yTW9kZWxUeXBlLlRleHQgPyB0aGlzLl91cmlJZGVudGl0eVNlcnZpY2UuYXNDYW5vbmljYWxVcmkocmVzb3VyY2UpIDogcmVzb3VyY2U7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9wcm94eUN1c3RvbUVkaXRvcnMuJHJlc29sdmVDdXN0b21FZGl0b3IoYWN0dWFsUmVzb3VyY2UsIGhhbmRsZSwgdmlld1R5cGUsIGluaXREYXRhLCBwb3NpdGlvbiwgY2FuY2VsbGF0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdHdlYnZpZXdJbnB1dC53ZWJ2aWV3LnNldEh0bWwodGhpcy5tYWluVGhyZWFkV2Vidmlldy5nZXRXZWJ2aWV3UmVzb2x2ZWRGYWlsZWRDb250ZW50KHZpZXdUeXBlKSk7XG5cdFx0XHRcdFx0YWRkaXRpb25hbE1vZGVsUmVmcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZWRNb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZWRpdG9yUHJvdmlkZXJzLnNldCh2aWV3VHlwZSwgZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmYoXG5cdFx0bW9kZWxUeXBlOiBDdXN0b21FZGl0b3JNb2RlbFR5cGUsXG5cdFx0d2Vidmlld0lucHV0OiBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0LFxuXHRcdGhhbmRsZTogZXh0SG9zdFByb3RvY29sLldlYnZpZXdIYW5kbGUsXG5cdFx0dmlld1R5cGU6IHN0cmluZyxcblx0XHRpbml0RGF0YTogQ3VzdG9tRWRpdG9yRGlmZkluaXREYXRhLFxuXHRcdHBvc2l0aW9uOiBFZGl0b3JHcm91cENvbHVtbixcblx0XHRjYW5jZWxsYXRpb246IENhbmNlbGxhdGlvblRva2VuLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdTaWRlQnlTaWRlRGlmZlJlc29sdXRpb25zLmdldCh3ZWJ2aWV3SW5wdXQuZGlmZklkKTtcblx0XHRpZiAoIXBlbmRpbmcpIHtcblx0XHRcdHBlbmRpbmcgPSB7XG5cdFx0XHRcdHByb21pc2U6IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKSxcblx0XHRcdFx0Y2FuY2VsbGF0aW9uOiBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSxcblx0XHRcdFx0ZGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2lkZUJ5U2lkZURpZmZSZXNvbHV0aW9ucy5zZXQod2Vidmlld0lucHV0LmRpZmZJZCwgcGVuZGluZyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2xlYW51cCA9ICgpID0+IHtcblx0XHRcdHRoaXMuX3BlbmRpbmdTaWRlQnlTaWRlRGlmZlJlc29sdXRpb25zLmRlbGV0ZSh3ZWJ2aWV3SW5wdXQuZGlmZklkKTtcblx0XHRcdHBlbmRpbmcuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0cGVuZGluZy5jYW5jZWxsYXRpb24uZGlzcG9zZSgpO1xuXHRcdH07XG5cblx0XHRwZW5kaW5nLmRpc3Bvc2FibGVzLmFkZChjYW5jZWxsYXRpb24ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0cGVuZGluZy5jYW5jZWxsYXRpb24uY2FuY2VsKCk7XG5cdFx0XHRpZiAoIXBlbmRpbmcuc3RhcnRlZCkge1xuXHRcdFx0XHRwZW5kaW5nLnByb21pc2UuY2FuY2VsKCk7XG5cdFx0XHRcdGNsZWFudXAoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRwZW5kaW5nW3dlYnZpZXdJbnB1dC5zaWRlXSA9IHsgaGFuZGxlLCBpbml0RGF0YSB9O1xuXG5cdFx0aWYgKHBlbmRpbmcub3JpZ2luYWwgJiYgcGVuZGluZy5tb2RpZmllZCAmJiAhcGVuZGluZy5zdGFydGVkKSB7XG5cdFx0XHRwZW5kaW5nLnN0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0cGVuZGluZy5wcm9taXNlLnNldHRsZVdpdGgoKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbFJlc291cmNlID0gbW9kZWxUeXBlID09PSBDdXN0b21FZGl0b3JNb2RlbFR5cGUuVGV4dCA/IHRoaXMuX3VyaUlkZW50aXR5U2VydmljZS5hc0Nhbm9uaWNhbFVyaSh3ZWJ2aWV3SW5wdXQub3JpZ2luYWxSZXNvdXJjZSkgOiB3ZWJ2aWV3SW5wdXQub3JpZ2luYWxSZXNvdXJjZTtcblx0XHRcdFx0XHRjb25zdCBtb2RpZmllZFJlc291cmNlID0gbW9kZWxUeXBlID09PSBDdXN0b21FZGl0b3JNb2RlbFR5cGUuVGV4dCA/IHRoaXMuX3VyaUlkZW50aXR5U2VydmljZS5hc0Nhbm9uaWNhbFVyaSh3ZWJ2aWV3SW5wdXQubW9kaWZpZWRSZXNvdXJjZSkgOiB3ZWJ2aWV3SW5wdXQubW9kaWZpZWRSZXNvdXJjZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9wcm94eUN1c3RvbUVkaXRvcnMuJHJlc29sdmVDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZihcblx0XHRcdFx0XHRcdG9yaWdpbmFsUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRtb2RpZmllZFJlc291cmNlLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRvcmlnaW5hbDogcGVuZGluZy5vcmlnaW5hbCEuaGFuZGxlLFxuXHRcdFx0XHRcdFx0XHRtb2RpZmllZDogcGVuZGluZy5tb2RpZmllZCEuaGFuZGxlLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHZpZXdUeXBlLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRvcmlnaW5hbDogcGVuZGluZy5vcmlnaW5hbCEuaW5pdERhdGEsXG5cdFx0XHRcdFx0XHRcdG1vZGlmaWVkOiBwZW5kaW5nLm1vZGlmaWVkIS5pbml0RGF0YSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwb3NpdGlvbixcblx0XHRcdFx0XHRcdHBlbmRpbmcuY2FuY2VsbGF0aW9uLnRva2VuXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwZW5kaW5nLnByb21pc2UucDtcblx0fVxuXG5cdHB1YmxpYyAkdW5yZWdpc3RlckVkaXRvclByb3ZpZGVyKHZpZXdUeXBlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvclByb3ZpZGVycy5oYXModmlld1R5cGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIHByb3ZpZGVyIGZvciAke3ZpZXdUeXBlfSByZWdpc3RlcmVkYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdG9yUHJvdmlkZXJzLmRlbGV0ZUFuZERpc3Bvc2Uodmlld1R5cGUpO1xuXG5cdFx0dGhpcy5fY3VzdG9tRWRpdG9yU2VydmljZS5tb2RlbHMuZGlzcG9zZUFsbE1vZGVsc0ZvclZpZXcodmlld1R5cGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRPckNyZWF0ZUN1c3RvbUVkaXRvck1vZGVsKFxuXHRcdG1vZGVsVHlwZTogQ3VzdG9tRWRpdG9yTW9kZWxUeXBlLFxuXHRcdHJlc291cmNlOiBVUkksXG5cdFx0dmlld1R5cGU6IHN0cmluZyxcblx0XHRvcHRpb25zOiB7IGJhY2t1cElkPzogc3RyaW5nIH0sXG5cdFx0Y2FuY2VsbGF0aW9uOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTxJUmVmZXJlbmNlPElDdXN0b21FZGl0b3JNb2RlbD4+IHtcblx0XHRjb25zdCBleGlzdGluZ01vZGVsID0gdGhpcy5fY3VzdG9tRWRpdG9yU2VydmljZS5tb2RlbHMudHJ5UmV0YWluKHJlc291cmNlLCB2aWV3VHlwZSk7XG5cdFx0aWYgKGV4aXN0aW5nTW9kZWwpIHtcblx0XHRcdHJldHVybiBleGlzdGluZ01vZGVsO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAobW9kZWxUeXBlKSB7XG5cdFx0XHRjYXNlIEN1c3RvbUVkaXRvck1vZGVsVHlwZS5UZXh0OlxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBDdXN0b21UZXh0RWRpdG9yTW9kZWwuY3JlYXRlKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLCB2aWV3VHlwZSwgcmVzb3VyY2UpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9jdXN0b21FZGl0b3JTZXJ2aWNlLm1vZGVscy5hZGQocmVzb3VyY2UsIHZpZXdUeXBlLCBtb2RlbCk7XG5cdFx0XHRcdH1cblx0XHRcdGNhc2UgQ3VzdG9tRWRpdG9yTW9kZWxUeXBlLkN1c3RvbTpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gTWFpblRocmVhZEN1c3RvbUVkaXRvck1vZGVsLmNyZWF0ZSh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5fcHJveHlDdXN0b21FZGl0b3JzLCB2aWV3VHlwZSwgcmVzb3VyY2UsIG9wdGlvbnMsIHRoaXMuX3VudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UsICgpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMubWFpblRocmVhZFdlYnZpZXdQYW5lbHMud2Vidmlld0lucHV0cylcblx0XHRcdFx0XHRcdFx0LmZpbHRlcihlZGl0b3IgPT5cblx0XHRcdFx0XHRcdFx0XHQoZWRpdG9yIGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9ySW5wdXQgJiYgaXNFcXVhbChlZGl0b3IucmVzb3VyY2UsIHJlc291cmNlKSlcblx0XHRcdFx0XHRcdFx0XHR8fCAoZWRpdG9yIGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yRGlmZklucHV0ICYmIChpc0VxdWFsKGVkaXRvci5vcmlnaW5hbFJlc291cmNlLCByZXNvdXJjZSkgfHwgaXNFcXVhbChlZGl0b3IubW9kaWZpZWRSZXNvdXJjZSwgcmVzb3VyY2UpKSlcblx0XHRcdFx0XHRcdFx0XHR8fCAoZWRpdG9yIGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dCAmJiBpc0VxdWFsKGVkaXRvci5yZXNvdXJjZSwgcmVzb3VyY2UpKSkgYXMgQ3VzdG9tRWRpdG9yV2Vidmlld0lucHV0W107XG5cdFx0XHRcdFx0fSwgY2FuY2VsbGF0aW9uKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fY3VzdG9tRWRpdG9yU2VydmljZS5tb2RlbHMuYWRkKHJlc291cmNlLCB2aWV3VHlwZSwgbW9kZWwpO1xuXHRcdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jICRvbkRpZEVkaXQocmVzb3VyY2VDb21wb25lbnRzOiBVcmlDb21wb25lbnRzLCB2aWV3VHlwZTogc3RyaW5nLCBlZGl0SWQ6IG51bWJlciwgbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5nZXRDdXN0b21FZGl0b3JNb2RlbChyZXNvdXJjZUNvbXBvbmVudHMsIHZpZXdUeXBlKTtcblx0XHRtb2RlbC5wdXNoRWRpdChlZGl0SWQsIGxhYmVsKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkb25Db250ZW50Q2hhbmdlKHJlc291cmNlQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgdmlld1R5cGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5nZXRDdXN0b21FZGl0b3JNb2RlbChyZXNvdXJjZUNvbXBvbmVudHMsIHZpZXdUeXBlKTtcblx0XHRtb2RlbC5jaGFuZ2VDb250ZW50KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEN1c3RvbUVkaXRvck1vZGVsKHJlc291cmNlQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgdmlld1R5cGU6IHN0cmluZykge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnJldml2ZShyZXNvdXJjZUNvbXBvbmVudHMpO1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5fY3VzdG9tRWRpdG9yU2VydmljZS5tb2RlbHMuZ2V0KHJlc291cmNlLCB2aWV3VHlwZSk7XG5cdFx0aWYgKCFtb2RlbCB8fCAhKG1vZGVsIGluc3RhbmNlb2YgTWFpblRocmVhZEN1c3RvbUVkaXRvck1vZGVsKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZmluZCBtb2RlbCBmb3Igd2VidmlldyBlZGl0b3InKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG5cblx0Ly8jcmVnaW9uIFdvcmtpbmcgQ29weVxuXHRwcml2YXRlIGFzeW5jIG9uV2lsbFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlOiBXb3JraW5nQ29weUZpbGVFdmVudCkge1xuXHRcdGlmIChlLm9wZXJhdGlvbiAhPT0gRmlsZU9wZXJhdGlvbi5NT1ZFKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGUud2FpdFVudGlsKChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBlLmZpbGVzKSB7XG5cdFx0XHRcdGlmIChmaWxlLnNvdXJjZSkge1xuXHRcdFx0XHRcdG1vZGVscy5wdXNoKC4uLihhd2FpdCB0aGlzLl9jdXN0b21FZGl0b3JTZXJ2aWNlLm1vZGVscy5nZXRBbGxNb2RlbHMoZmlsZS5zb3VyY2UpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgbW9kZWwgb2YgbW9kZWxzKSB7XG5cdFx0XHRcdGlmIChtb2RlbCBpbnN0YW5jZW9mIE1haW5UaHJlYWRDdXN0b21FZGl0b3JNb2RlbCAmJiBtb2RlbC5pc0RpcnR5KCkpIHtcblx0XHRcdFx0XHRjb25zdCB3b3JraW5nQ29weSA9IGF3YWl0IG1vZGVsLmJhY2t1cChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHRpZiAod29ya2luZ0NvcHkubWV0YSkge1xuXHRcdFx0XHRcdFx0Ly8gVGhpcyBjYXN0IGlzIHNhZmUgYmVjYXVzZSB3ZSBkbyBhbiBpbnN0YW5jZW9mIGNoZWNrIGFib3ZlIGFuZCBhIGN1c3RvbSBkb2N1bWVudCBiYWNrdXAgZGF0YSBpcyBhbHdheXMgcmV0dXJuZWRcblx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvclJlbmFtZUJhY2t1cHMuc2V0KG1vZGVsLmVkaXRvclJlc291cmNlLnRvU3RyaW5nKCksIHdvcmtpbmdDb3B5Lm1ldGEgYXMgQ3VzdG9tRG9jdW1lbnRCYWNrdXBEYXRhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSgpKTtcblx0fVxuXHQvLyNlbmRyZWdpb25cbn1cblxubmFtZXNwYWNlIEhvdEV4aXRTdGF0ZSB7XG5cdGV4cG9ydCBjb25zdCBlbnVtIFR5cGUge1xuXHRcdEFsbG93ZWQsXG5cdFx0Tm90QWxsb3dlZCxcblx0XHRQZW5kaW5nLFxuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IEFsbG93ZWQgPSBPYmplY3QuZnJlZXplKHsgdHlwZTogVHlwZS5BbGxvd2VkIH0gYXMgY29uc3QpO1xuXHRleHBvcnQgY29uc3QgTm90QWxsb3dlZCA9IE9iamVjdC5mcmVlemUoeyB0eXBlOiBUeXBlLk5vdEFsbG93ZWQgfSBhcyBjb25zdCk7XG5cblx0ZXhwb3J0IGNsYXNzIFBlbmRpbmcge1xuXHRcdHJlYWRvbmx5IHR5cGUgPSBUeXBlLlBlbmRpbmc7XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdHB1YmxpYyByZWFkb25seSBvcGVyYXRpb246IENhbmNlbGFibGVQcm9taXNlPHN0cmluZz4sXG5cdFx0KSB7IH1cblx0fVxuXG5cdGV4cG9ydCB0eXBlIFN0YXRlID0gdHlwZW9mIEFsbG93ZWQgfCB0eXBlb2YgTm90QWxsb3dlZCB8IFBlbmRpbmc7XG59XG5cblxuY2xhc3MgTWFpblRocmVhZEN1c3RvbUVkaXRvck1vZGVsIGV4dGVuZHMgUmVzb3VyY2VXb3JraW5nQ29weSBpbXBsZW1lbnRzIElDdXN0b21FZGl0b3JNb2RlbCB7XG5cblx0cHJpdmF0ZSBfZnJvbUJhY2t1cDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9ob3RFeGl0U3RhdGU6IEhvdEV4aXRTdGF0ZS5TdGF0ZSA9IEhvdEV4aXRTdGF0ZS5BbGxvd2VkO1xuXHRwcml2YXRlIF9iYWNrdXBJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2N1cnJlbnRFZGl0SW5kZXg6IG51bWJlciA9IC0xO1xuXHRwcml2YXRlIF9zYXZlUG9pbnQ6IG51bWJlciA9IC0xO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0czogQXJyYXk8bnVtYmVyPiA9IFtdO1xuXHRwcml2YXRlIF9pc0RpcnR5RnJvbUNvbnRlbnRDaGFuZ2U6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSBfb25nb2luZ1NhdmU/OiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPjtcblxuXHQvLyBUT0RPQG1qYnZ6IGNvbnNpZGVyIHRvIGVuYWJsZSBhIGB0eXBlSWRgIHRoYXQgaXMgc3BlY2lmaWMgZm9yIGN1c3RvbVxuXHQvLyBlZGl0b3JzLiBVc2luZyBhIGRpc3RpbmN0IGB0eXBlSWRgIGFsbG93cyB0aGUgd29ya2luZyBjb3B5IHRvIGhhdmVcblx0Ly8gYW55IHJlc291cmNlIChpbmNsdWRpbmcgZmlsZSBiYXNlZCByZXNvdXJjZXMpIGV2ZW4gaWYgb3RoZXIgd29ya2luZ1xuXHQvLyBjb3BpZXMgZXhpc3Qgd2l0aCB0aGUgc2FtZSByZXNvdXJjZS5cblx0Ly9cblx0Ly8gSU1QT1JUQU5UOiBjaGFuZ2luZyB0aGUgYHR5cGVJZGAgaGFzIGFuIGltcGFjdCBvbiBiYWNrdXBzIGZvciB0aGlzXG5cdC8vIHdvcmtpbmcgY29weS4gQW55IHZhbHVlIHRoYXQgaXMgbm90IHRoZSBlbXB0eSBzdHJpbmcgd2lsbCBiZSB1c2VkXG5cdC8vIGFzIHNlZWQgdG8gdGhlIGJhY2t1cC4gT25seSBjaGFuZ2UgdGhlIGB0eXBlSWRgIGlmIHlvdSBoYXZlIGltcGxlbWVudGVkXG5cdC8vIGEgZmFsbGJhY2sgc29sdXRpb24gdG8gcmVzb2x2ZSBhbnkgZXhpc3RpbmcgYmFja3VwcyB0aGF0IGRvIG5vdCBoYXZlXG5cdC8vIHRoaXMgc2VlZC5cblx0cmVhZG9ubHkgdHlwZUlkID0gTk9fVFlQRV9JRDtcblxuXHRwdWJsaWMgc3RhdGljIGFzeW5jIGNyZWF0ZShcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdHByb3h5OiBleHRIb3N0UHJvdG9jb2wuRXh0SG9zdEN1c3RvbUVkaXRvcnNTaGFwZSxcblx0XHR2aWV3VHlwZTogc3RyaW5nLFxuXHRcdHJlc291cmNlOiBVUkksXG5cdFx0b3B0aW9uczogeyBiYWNrdXBJZD86IHN0cmluZyB9LFxuXHRcdHVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U6IElVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLFxuXHRcdGdldEVkaXRvcnM6ICgpID0+IEN1c3RvbUVkaXRvcldlYnZpZXdJbnB1dFtdLFxuXHRcdGNhbmNlbGxhdGlvbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IFByb21pc2U8TWFpblRocmVhZEN1c3RvbUVkaXRvck1vZGVsPiB7XG5cdFx0Y29uc3QgZWRpdG9ycyA9IGdldEVkaXRvcnMoKTtcblx0XHRsZXQgdW50aXRsZWREb2N1bWVudERhdGE6IFZTQnVmZmVyIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHByaW1hcnlDdXN0b21FZGl0b3JJbnB1dCA9IGVkaXRvcnMuZmluZChlZGl0b3IgPT4gZWRpdG9yIGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9ySW5wdXQpO1xuXHRcdGlmIChwcmltYXJ5Q3VzdG9tRWRpdG9ySW5wdXQpIHtcblx0XHRcdHVudGl0bGVkRG9jdW1lbnREYXRhID0gcHJpbWFyeUN1c3RvbUVkaXRvcklucHV0LnVudGl0bGVkRG9jdW1lbnREYXRhO1xuXHRcdH1cblx0XHRjb25zdCB7IGVkaXRhYmxlIH0gPSBhd2FpdCBwcm94eS4kY3JlYXRlQ3VzdG9tRG9jdW1lbnQocmVzb3VyY2UsIHZpZXdUeXBlLCBvcHRpb25zLmJhY2t1cElkLCB1bnRpdGxlZERvY3VtZW50RGF0YSwgY2FuY2VsbGF0aW9uKTtcblxuXHRcdC8vIE5vdyB0aGF0IHRoZSBleHRlbnNpb24gaGFzIHJlY2VpdmVkIHRoZSB1bnRpdGxlZERvY3VtZW50RGF0YSwgcmV2ZXJ0XG5cdFx0Ly8gdGhlIHVudGl0bGVkIHRleHQgbW9kZWwgc28gaXQgaXMgbm8gbG9uZ2VyIHRyYWNrZWQgYXMgYSBzZXBhcmF0ZSBkaXJ0eVxuXHRcdC8vIHdvcmtpbmcgY29weSAoYXZvaWRzIGRvdWJsZS1kaXJ0eSBwcm9tcHRzLCBzZWUgIzEyNTI5MykuXG5cdFx0aWYgKHVudGl0bGVkRG9jdW1lbnREYXRhICYmIHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCkge1xuXHRcdFx0dW50aXRsZWRUZXh0RWRpdG9yU2VydmljZS5nZXQocmVzb3VyY2UpPy5yZXZlcnQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFpblRocmVhZEN1c3RvbUVkaXRvck1vZGVsLCBwcm94eSwgdmlld1R5cGUsIHJlc291cmNlLCAhIW9wdGlvbnMuYmFja3VwSWQsIGVkaXRhYmxlLCAhIXVudGl0bGVkRG9jdW1lbnREYXRhLCBnZXRFZGl0b3JzKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBleHRIb3N0UHJvdG9jb2wuRXh0SG9zdEN1c3RvbUVkaXRvcnNTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aWV3VHlwZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclJlc291cmNlOiBVUkksXG5cdFx0ZnJvbUJhY2t1cDogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0YWJsZTogYm9vbGVhbixcblx0XHRzdGFydERpcnR5OiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldEVkaXRvcnM6ICgpID0+IEN1c3RvbUVkaXRvcldlYnZpZXdJbnB1dFtdLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVW5kb1JlZG9TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VuZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5U2VydmljZSB3b3JraW5nQ29weVNlcnZpY2U6IElXb3JraW5nQ29weVNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoTWFpblRocmVhZEN1c3RvbUVkaXRvck1vZGVsLnRvV29ya2luZ0NvcHlSZXNvdXJjZShfdmlld1R5cGUsIF9lZGl0b3JSZXNvdXJjZSksIGZpbGVTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2Zyb21CYWNrdXAgPSBmcm9tQmFja3VwO1xuXG5cdFx0Ly8gTm9ybWFsbHkgbWVhbnMgd2UncmUgcmUtb3BlbmluZyBhbiB1bnRpdGxlZCBmaWxlIChzZXQgdGhpcyBiZWZvcmUgcmVnaXN0ZXJpbmcgdGhlIHdvcmtpbmcgY29weVxuXHRcdC8vIHNvIHRoYXQgZGlydHkgc3RhdGUgaXMgY29ycmVjdCB3aGVuIGZpcnN0IHF1ZXJpZWQpLlxuXHRcdHRoaXMuX2lzRGlydHlGcm9tQ29udGVudENoYW5nZSA9IHN0YXJ0RGlydHk7XG5cblx0XHRpZiAoX2VkaXRhYmxlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih3b3JraW5nQ29weVNlcnZpY2UucmVnaXN0ZXJXb3JraW5nQ29weSh0aGlzKSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGV4dGVuc2lvblNlcnZpY2Uub25XaWxsU3RvcChlID0+IHtcblx0XHRcdFx0ZS52ZXRvKHRydWUsIGxvY2FsaXplKCd2ZXRvRXh0SG9zdFJlc3RhcnQnLCBcIkFuIGV4dGVuc2lvbiBwcm92aWRlZCBlZGl0b3IgZm9yICd7MH0nIGlzIHN0aWxsIG9wZW4gdGhhdCB3b3VsZCBjbG9zZSBvdGhlcndpc2UuXCIsIHRoaXMubmFtZSkpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBlZGl0b3JSZXNvdXJjZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yUmVzb3VyY2U7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdGlmICh0aGlzLl9lZGl0YWJsZSkge1xuXHRcdFx0dGhpcy5fdW5kb1NlcnZpY2UucmVtb3ZlRWxlbWVudHModGhpcy5fZWRpdG9yUmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Byb3h5LiRkaXNwb3NlQ3VzdG9tRG9jdW1lbnQodGhpcy5fZWRpdG9yUmVzb3VyY2UsIHRoaXMuX3ZpZXdUeXBlKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBJV29ya2luZ0NvcHlcblxuXHQvLyBNYWtlIHN1cmUgZWFjaCBjdXN0b20gZWRpdG9yIGhhcyBhIHVuaXF1ZSByZXNvdXJjZSBmb3IgYmFja3VwIGFuZCBlZGl0c1xuXHRwcml2YXRlIHN0YXRpYyB0b1dvcmtpbmdDb3B5UmVzb3VyY2Uodmlld1R5cGU6IHN0cmluZywgcmVzb3VyY2U6IFVSSSkge1xuXHRcdGNvbnN0IGF1dGhvcml0eSA9IHZpZXdUeXBlLnJlcGxhY2UoL1teYS16MC05XFwtX10vZ2ksICctJyk7XG5cdFx0Y29uc3QgcGF0aCA9IGAvJHttdWx0aWJ5dGVBd2FyZUJ0b2EocmVzb3VyY2Uud2l0aCh7IHF1ZXJ5OiBudWxsLCBmcmFnbWVudDogbnVsbCB9KS50b1N0cmluZyh0cnVlKSl9YDtcblx0XHRyZXR1cm4gVVJJLmZyb20oe1xuXHRcdFx0c2NoZW1lOiBTY2hlbWFzLnZzY29kZUN1c3RvbUVkaXRvcixcblx0XHRcdGF1dGhvcml0eTogYXV0aG9yaXR5LFxuXHRcdFx0cGF0aDogcGF0aCxcblx0XHRcdHF1ZXJ5OiBKU09OLnN0cmluZ2lmeShyZXNvdXJjZS50b0pTT04oKSksXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG5hbWUoKSB7XG5cdFx0cmV0dXJuIGJhc2VuYW1lKHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh0aGlzLl9lZGl0b3JSZXNvdXJjZSkpO1xuXHR9XG5cblx0cHVibGljIGdldCBjYXBhYmlsaXRpZXMoKTogV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMge1xuXHRcdHJldHVybiB0aGlzLmlzVW50aXRsZWQoKSA/IFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLlVudGl0bGVkIDogV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMuTm9uZTtcblx0fVxuXG5cdHB1YmxpYyBpc0RpcnR5KCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9pc0RpcnR5RnJvbUNvbnRlbnRDaGFuZ2UpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NhdmVQb2ludCAhPT0gdGhpcy5fY3VycmVudEVkaXRJbmRleDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2Zyb21CYWNrdXA7XG5cdH1cblxuXHRwcml2YXRlIGlzVW50aXRsZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvclJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGlydHk6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEaXJ0eTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZURpcnR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudDogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2F2ZTogRW1pdHRlcjxJV29ya2luZ0NvcHlTYXZlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtpbmdDb3B5U2F2ZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTYXZlOiBFdmVudDxJV29ya2luZ0NvcHlTYXZlRXZlbnQ+ID0gdGhpcy5fb25EaWRTYXZlLmV2ZW50O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVhZG9ubHkgPSBFdmVudC5Ob25lO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHB1YmxpYyBpc1JlYWRvbmx5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5fZWRpdGFibGU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHZpZXdUeXBlKCkge1xuXHRcdHJldHVybiB0aGlzLl92aWV3VHlwZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgYmFja3VwSWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2JhY2t1cElkO1xuXHR9XG5cblx0cHVibGljIHB1c2hFZGl0KGVkaXRJZDogbnVtYmVyLCBsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0YWJsZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdEb2N1bWVudCBpcyBub3QgZWRpdGFibGUnKTtcblx0XHR9XG5cblx0XHR0aGlzLmNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnNwbGljZUVkaXRzKGVkaXRJZCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50RWRpdEluZGV4ID0gdGhpcy5fZWRpdHMubGVuZ3RoIC0gMTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3VuZG9TZXJ2aWNlLnB1c2hFbGVtZW50KHtcblx0XHRcdHR5cGU6IFVuZG9SZWRvRWxlbWVudFR5cGUuUmVzb3VyY2UsXG5cdFx0XHRyZXNvdXJjZTogdGhpcy5fZWRpdG9yUmVzb3VyY2UsXG5cdFx0XHRsYWJlbDogbGFiZWwgPz8gbG9jYWxpemUoJ2RlZmF1bHRFZGl0TGFiZWwnLCBcIkVkaXRcIiksXG5cdFx0XHRjb2RlOiAndW5kb3JlZG8uY3VzdG9tRWRpdG9yRWRpdCcsXG5cdFx0XHR1bmRvOiAoKSA9PiB0aGlzLnVuZG8oKSxcblx0XHRcdHJlZG86ICgpID0+IHRoaXMucmVkbygpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGNoYW5nZUNvbnRlbnQoKSB7XG5cdFx0dGhpcy5jaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5faXNEaXJ0eUZyb21Db250ZW50Q2hhbmdlID0gdHJ1ZTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdW5kbygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2VkaXRhYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRFZGl0SW5kZXggPCAwKSB7XG5cdFx0XHQvLyBub3RoaW5nIHRvIHVuZG9cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB1bmRvbmVFZGl0ID0gdGhpcy5fZWRpdHNbdGhpcy5fY3VycmVudEVkaXRJbmRleF07XG5cdFx0dGhpcy5jaGFuZ2UoKCkgPT4ge1xuXHRcdFx0LS10aGlzLl9jdXJyZW50RWRpdEluZGV4O1xuXHRcdH0pO1xuXHRcdGF3YWl0IHRoaXMuX3Byb3h5LiR1bmRvKHRoaXMuX2VkaXRvclJlc291cmNlLCB0aGlzLnZpZXdUeXBlLCB1bmRvbmVFZGl0LCB0aGlzLmlzRGlydHkoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZG8oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0YWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jdXJyZW50RWRpdEluZGV4ID49IHRoaXMuX2VkaXRzLmxlbmd0aCAtIDEpIHtcblx0XHRcdC8vIG5vdGhpbmcgdG8gcmVkb1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlZG9uZUVkaXQgPSB0aGlzLl9lZGl0c1t0aGlzLl9jdXJyZW50RWRpdEluZGV4ICsgMV07XG5cdFx0dGhpcy5jaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Kyt0aGlzLl9jdXJyZW50RWRpdEluZGV4O1xuXHRcdH0pO1xuXHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRyZWRvKHRoaXMuX2VkaXRvclJlc291cmNlLCB0aGlzLnZpZXdUeXBlLCByZWRvbmVFZGl0LCB0aGlzLmlzRGlydHkoKSk7XG5cdH1cblxuXHRwcml2YXRlIHNwbGljZUVkaXRzKGVkaXRUb0luc2VydD86IG51bWJlcikge1xuXHRcdGNvbnN0IHN0YXJ0ID0gdGhpcy5fY3VycmVudEVkaXRJbmRleCArIDE7XG5cdFx0Y29uc3QgdG9SZW1vdmUgPSB0aGlzLl9lZGl0cy5sZW5ndGggLSB0aGlzLl9jdXJyZW50RWRpdEluZGV4O1xuXG5cdFx0Y29uc3QgcmVtb3ZlZEVkaXRzID0gdHlwZW9mIGVkaXRUb0luc2VydCA9PT0gJ251bWJlcidcblx0XHRcdD8gdGhpcy5fZWRpdHMuc3BsaWNlKHN0YXJ0LCB0b1JlbW92ZSwgZWRpdFRvSW5zZXJ0KVxuXHRcdFx0OiB0aGlzLl9lZGl0cy5zcGxpY2Uoc3RhcnQsIHRvUmVtb3ZlKTtcblxuXHRcdGlmIChyZW1vdmVkRWRpdHMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9wcm94eS4kZGlzcG9zZUVkaXRzKHRoaXMuX2VkaXRvclJlc291cmNlLCB0aGlzLl92aWV3VHlwZSwgcmVtb3ZlZEVkaXRzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNoYW5nZShtYWtlRWRpdDogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHdhc0RpcnR5ID0gdGhpcy5pc0RpcnR5KCk7XG5cdFx0bWFrZUVkaXQoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSgpO1xuXG5cdFx0aWYgKHRoaXMuaXNEaXJ0eSgpICE9PSB3YXNEaXJ0eSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIHJldmVydChvcHRpb25zPzogSVJldmVydE9wdGlvbnMpIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRhYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRFZGl0SW5kZXggPT09IHRoaXMuX3NhdmVQb2ludCAmJiAhdGhpcy5faXNEaXJ0eUZyb21Db250ZW50Q2hhbmdlICYmICF0aGlzLl9mcm9tQmFja3VwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFvcHRpb25zPy5zb2Z0KSB7XG5cdFx0XHR0aGlzLl9wcm94eS4kcmV2ZXJ0KHRoaXMuX2VkaXRvclJlc291cmNlLCB0aGlzLnZpZXdUeXBlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cblx0XHR0aGlzLmNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9pc0RpcnR5RnJvbUNvbnRlbnRDaGFuZ2UgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2Zyb21CYWNrdXAgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2N1cnJlbnRFZGl0SW5kZXggPSB0aGlzLl9zYXZlUG9pbnQ7XG5cdFx0XHR0aGlzLnNwbGljZUVkaXRzKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc2F2ZShvcHRpb25zPzogSVNhdmVPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gISFhd2FpdCB0aGlzLnNhdmVDdXN0b21FZGl0b3Iob3B0aW9ucyk7XG5cblx0XHQvLyBFbWl0IFNhdmUgRXZlbnRcblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHR0aGlzLl9vbkRpZFNhdmUuZmlyZSh7IHJlYXNvbjogb3B0aW9ucz8ucmVhc29uLCBzb3VyY2U6IG9wdGlvbnM/LnNvdXJjZSB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHNhdmVDdXN0b21FZGl0b3Iob3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0YWJsZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc1VudGl0bGVkKCkpIHtcblx0XHRcdGNvbnN0IHRhcmdldFVyaSA9IGF3YWl0IHRoaXMuc3VnZ2VzdFVudGl0bGVkU2F2ZVBhdGgob3B0aW9ucyk7XG5cdFx0XHRpZiAoIXRhcmdldFVyaSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLnNhdmVDdXN0b21FZGl0b3JBcyh0aGlzLl9lZGl0b3JSZXNvdXJjZSwgdGFyZ2V0VXJpLCBvcHRpb25zKTtcblx0XHRcdHJldHVybiB0YXJnZXRVcmk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2F2ZVByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSh0b2tlbiA9PiB0aGlzLl9wcm94eS4kb25TYXZlKHRoaXMuX2VkaXRvclJlc291cmNlLCB0aGlzLnZpZXdUeXBlLCB0b2tlbikpO1xuXHRcdHRoaXMuX29uZ29pbmdTYXZlPy5jYW5jZWwoKTtcblx0XHR0aGlzLl9vbmdvaW5nU2F2ZSA9IHNhdmVQcm9taXNlO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNhdmVQcm9taXNlO1xuXG5cdFx0XHRpZiAodGhpcy5fb25nb2luZ1NhdmUgPT09IHNhdmVQcm9taXNlKSB7IC8vIE1ha2Ugc3VyZSB3ZSBhcmUgc3RpbGwgZG9pbmcgdGhlIHNhbWUgc2F2ZVxuXHRcdFx0XHR0aGlzLmNoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5faXNEaXJ0eUZyb21Db250ZW50Q2hhbmdlID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5fc2F2ZVBvaW50ID0gdGhpcy5fY3VycmVudEVkaXRJbmRleDtcblx0XHRcdFx0XHR0aGlzLl9mcm9tQmFja3VwID0gZmFsc2U7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAodGhpcy5fb25nb2luZ1NhdmUgPT09IHNhdmVQcm9taXNlKSB7IC8vIE1ha2Ugc3VyZSB3ZSBhcmUgc3RpbGwgZG9pbmcgdGhlIHNhbWUgc2F2ZVxuXHRcdFx0XHR0aGlzLl9vbmdvaW5nU2F2ZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yUmVzb3VyY2U7XG5cdH1cblxuXHRwcml2YXRlIHN1Z2dlc3RVbnRpdGxlZFNhdmVQYXRoKG9wdGlvbnM6IElTYXZlT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLmlzVW50aXRsZWQoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdSZXNvdXJjZSBpcyBub3QgdW50aXRsZWQnKTtcblx0XHR9XG5cblx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdGNvbnN0IGxvY2FsUmVzb3VyY2UgPSB0b0xvY2FsUmVzb3VyY2UodGhpcy5fZWRpdG9yUmVzb3VyY2UsIHJlbW90ZUF1dGhvcml0eSwgdGhpcy5fcGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZSk7XG5cblx0XHRyZXR1cm4gdGhpcy5fZmlsZURpYWxvZ1NlcnZpY2UucGlja0ZpbGVUb1NhdmUobG9jYWxSZXNvdXJjZSwgb3B0aW9ucz8uYXZhaWxhYmxlRmlsZVN5c3RlbXMpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHNhdmVDdXN0b21FZGl0b3JBcyhyZXNvdXJjZTogVVJJLCB0YXJnZXRSZXNvdXJjZTogVVJJLCBfb3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl9lZGl0YWJsZSkge1xuXHRcdFx0Ly8gVE9ETzogaGFuZGxlIGNhbmNlbGxhdGlvblxuXHRcdFx0YXdhaXQgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4gdGhpcy5fcHJveHkuJG9uU2F2ZUFzKHRoaXMuX2VkaXRvclJlc291cmNlLCB0aGlzLnZpZXdUeXBlLCB0YXJnZXRSZXNvdXJjZSwgdG9rZW4pKTtcblx0XHRcdHRoaXMuY2hhbmdlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5faXNEaXJ0eUZyb21Db250ZW50Q2hhbmdlID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX3NhdmVQb2ludCA9IHRoaXMuX2N1cnJlbnRFZGl0SW5kZXg7XG5cdFx0XHRcdHRoaXMuX2Zyb21CYWNrdXAgPSBmYWxzZTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFNpbmNlIHRoZSBlZGl0b3IgaXMgcmVhZG9ubHksIGp1c3QgY29weSB0aGUgZmlsZSBvdmVyXG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNvcHkocmVzb3VyY2UsIHRhcmdldFJlc291cmNlLCBmYWxzZSAvKiBvdmVyd3JpdGUgKi8pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCBjYW5Ib3RFeGl0KCkgeyByZXR1cm4gdHlwZW9mIHRoaXMuX2JhY2t1cElkID09PSAnc3RyaW5nJyAmJiB0aGlzLl9ob3RFeGl0U3RhdGUudHlwZSA9PT0gSG90RXhpdFN0YXRlLlR5cGUuQWxsb3dlZDsgfVxuXG5cdHB1YmxpYyBhc3luYyBiYWNrdXAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJV29ya2luZ0NvcHlCYWNrdXA+IHtcblx0XHRjb25zdCBlZGl0b3JzID0gdGhpcy5fZ2V0RWRpdG9ycygpO1xuXHRcdGlmICghZWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gZWRpdG9ycyBmb3VuZCBmb3IgcmVzb3VyY2UsIGNhbm5vdCBiYWNrIHVwJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHByaW1hcnlFZGl0b3IgPSBlZGl0b3JzWzBdO1xuXG5cdFx0Y29uc3QgYmFja3VwTWV0YTogQ3VzdG9tRG9jdW1lbnRCYWNrdXBEYXRhID0ge1xuXHRcdFx0dmlld1R5cGU6IHRoaXMudmlld1R5cGUsXG5cdFx0XHRlZGl0b3JSZXNvdXJjZTogdGhpcy5fZWRpdG9yUmVzb3VyY2UsXG5cdFx0XHRjdXN0b21UaXRsZTogcHJpbWFyeUVkaXRvci5nZXRXZWJ2aWV3VGl0bGUoKSxcblx0XHRcdGljb25QYXRoOiBwcmltYXJ5RWRpdG9yLmljb25QYXRoLFxuXHRcdFx0YmFja3VwSWQ6ICcnLFxuXHRcdFx0ZXh0ZW5zaW9uOiBwcmltYXJ5RWRpdG9yLmV4dGVuc2lvbiA/IHtcblx0XHRcdFx0aWQ6IHByaW1hcnlFZGl0b3IuZXh0ZW5zaW9uLmlkLnZhbHVlLFxuXHRcdFx0XHRsb2NhdGlvbjogcHJpbWFyeUVkaXRvci5leHRlbnNpb24ubG9jYXRpb24hLFxuXHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdHdlYnZpZXc6IHtcblx0XHRcdFx0b3JpZ2luOiBwcmltYXJ5RWRpdG9yLndlYnZpZXcub3JpZ2luLFxuXHRcdFx0XHRvcHRpb25zOiBwcmltYXJ5RWRpdG9yLndlYnZpZXcub3B0aW9ucyxcblx0XHRcdFx0c3RhdGU6IHByaW1hcnlFZGl0b3Iud2Vidmlldy5zdGF0ZSxcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgYmFja3VwRGF0YTogSVdvcmtpbmdDb3B5QmFja3VwID0ge1xuXHRcdFx0bWV0YTogYmFja3VwTWV0YVxuXHRcdH07XG5cblx0XHRpZiAoIXRoaXMuX2VkaXRhYmxlKSB7XG5cdFx0XHRyZXR1cm4gYmFja3VwRGF0YTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faG90RXhpdFN0YXRlLnR5cGUgPT09IEhvdEV4aXRTdGF0ZS5UeXBlLlBlbmRpbmcpIHtcblx0XHRcdHRoaXMuX2hvdEV4aXRTdGF0ZS5vcGVyYXRpb24uY2FuY2VsKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVuZGluZ1N0YXRlID0gbmV3IEhvdEV4aXRTdGF0ZS5QZW5kaW5nKFxuXHRcdFx0Y3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT5cblx0XHRcdFx0dGhpcy5fcHJveHkuJGJhY2t1cCh0aGlzLl9lZGl0b3JSZXNvdXJjZS50b0pTT04oKSwgdGhpcy52aWV3VHlwZSwgdG9rZW4pKSk7XG5cdFx0dGhpcy5faG90RXhpdFN0YXRlID0gcGVuZGluZ1N0YXRlO1xuXG5cdFx0dG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0cGVuZGluZ1N0YXRlLm9wZXJhdGlvbi5jYW5jZWwoKTtcblx0XHR9KTtcblxuXHRcdGxldCBlcnJvck1lc3NhZ2UgPSAnJztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYmFja3VwSWQgPSBhd2FpdCBwZW5kaW5nU3RhdGUub3BlcmF0aW9uO1xuXHRcdFx0Ly8gTWFrZSBzdXJlIHN0YXRlIGhhcyBub3QgY2hhbmdlZCBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdGlmICh0aGlzLl9ob3RFeGl0U3RhdGUgPT09IHBlbmRpbmdTdGF0ZSkge1xuXHRcdFx0XHR0aGlzLl9ob3RFeGl0U3RhdGUgPSBIb3RFeGl0U3RhdGUuQWxsb3dlZDtcblx0XHRcdFx0YmFja3VwRGF0YS5tZXRhIS5iYWNrdXBJZCA9IGJhY2t1cElkO1xuXHRcdFx0XHR0aGlzLl9iYWNrdXBJZCA9IGJhY2t1cElkO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRcdC8vIFRoaXMgaXMgZXhwZWN0ZWRcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlIGl0IGNvdWxkIGJlIGEgcmVhbCBlcnJvci4gTWFrZSBzdXJlIHN0YXRlIGhhcyBub3QgY2hhbmdlZCBpbiB0aGUgbWVhbnRpbWUuXG5cdFx0XHRpZiAodGhpcy5faG90RXhpdFN0YXRlID09PSBwZW5kaW5nU3RhdGUpIHtcblx0XHRcdFx0dGhpcy5faG90RXhpdFN0YXRlID0gSG90RXhpdFN0YXRlLk5vdEFsbG93ZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5tZXNzYWdlKSB7XG5cdFx0XHRcdGVycm9yTWVzc2FnZSA9IGUubWVzc2FnZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5faG90RXhpdFN0YXRlID09PSBIb3RFeGl0U3RhdGUuQWxsb3dlZCkge1xuXHRcdFx0cmV0dXJuIGJhY2t1cERhdGE7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgYmFja3VwIGluIHRoaXMgc3RhdGU6ICR7ZXJyb3JNZXNzYWdlfWApO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsMEJBQTBCO0FBQ25DLFNBQTRCLHlCQUF5Qix1QkFBdUI7QUFFNUUsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMscUJBQXFCLHlCQUF5QjtBQUN2RCxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksZUFBZSx1QkFBbUM7QUFDdkUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxpQkFBaUIsdUJBQXVCO0FBQzFELFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlLG9CQUFvQjtBQUM1QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtB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QUFLO0FBQUEsTUFDckIsYUFBYSxjQUFjLGdCQUFnQjtBQUFBLE1BQzNDLFVBQVUsY0FBYztBQUFBLE1BQ3hCLFVBQVU7QUFBQSxNQUNWLFdBQVcsY0FBYyxZQUFZO0FBQUEsUUFDcEMsSUFBSSxjQUFjLFVBQVUsR0FBRztBQUFBLFFBQy9CLFVBQVUsY0FBYyxVQUFVO0FBQUEsTUFDbkMsSUFBSTtBQUFBLE1BQ0osU0FBUztBQUFBLFFBQ1IsUUFBUSxjQUFjLFFBQVE7QUFBQSxRQUM5QixTQUFTLGNBQWMsUUFBUTtBQUFBLFFBQy9CLE9BQU8sY0FBYyxRQUFRO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUFpQztBQUFBLE1BQ3RDLE1BQU07QUFBQSxJQUNQO0FBRUEsUUFBSSxDQUFDLEtBQUssV0FBVztBQUNwQixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksS0FBSyxjQUFjLFNBQVMsaUJBQTJCO0FBQzFELFdBQUssY0FBYyxVQUFVLE9BQU87QUFBQSxJQUNyQztBQUVBLFVBQU0sZUFBZSxJQUFJLGFBQWE7QUFBQSxNQUNyQyx3QkFBd0IsQ0FBQUUsV0FDdkIsS0FBSyxPQUFPLFFBQVEsS0FBSyxnQkFBZ0IsT0FBTyxHQUFHLEtBQUssVUFBVUEsTUFBSyxDQUFDO0FBQUEsSUFBQztBQUMzRSxTQUFLLGdCQUFnQjtBQUVyQixVQUFNLHdCQUF3QixNQUFNO0FBQ25DLG1CQUFhLFVBQVUsT0FBTztBQUFBLElBQy9CLENBQUM7QUFFRCxRQUFJLGVBQWU7QUFDbkIsUUFBSTtBQUNILFlBQU0sV0FBVyxNQUFNLGFBQWE7QUFFcEMsVUFBSSxLQUFLLGtCQUFrQixjQUFjO0FBQ3hDLGFBQUssZ0JBQWdCLGFBQWE7QUFDbEMsbUJBQVcsS0FBTSxXQUFXO0FBQzVCLGFBQUssWUFBWTtBQUFBLE1BQ2xCO0FBQUEsSUFDRCxTQUFTLEdBQUc7QUFDWCxVQUFJLG9CQUFvQixDQUFDLEdBQUc7QUFFM0IsY0FBTTtBQUFBLE1BQ1A7QUFHQSxVQUFJLEtBQUssa0JBQWtCLGNBQWM7QUFDeEMsYUFBSyxnQkFBZ0IsYUFBYTtBQUFBLE1BQ25DO0FBQ0EsVUFBSSxFQUFFLFNBQVM7QUFDZCx1QkFBZSxFQUFFO0FBQUEsTUFDbEI7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLGtCQUFrQixhQUFhLFNBQVM7QUFDaEQsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLElBQUksTUFBTSxnQ0FBZ0MsWUFBWSxFQUFFO0FBQUEsRUFDL0Q7QUFDRDtBQXBhTSw4QkFBTjtBQUFBLEVBNkRHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBcEVHOyIsCiAgIm5hbWVzIjogWyJDdXN0b21FZGl0b3JNb2RlbFR5cGUiLCAiSG90RXhpdFN0YXRlIiwgIlR5cGUiLCAidG9rZW4iXQp9Cg==
