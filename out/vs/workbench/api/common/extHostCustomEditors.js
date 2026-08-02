import { CancellationToken } from "../../../base/common/cancellation.js";
import { hash } from "../../../base/common/hash.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { joinPath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import * as typeConverters from "./extHostTypeConverters.js";
import { shouldSerializeBuffersForPostMessage, toExtensionData } from "./extHostWebview.js";
import { Cache } from "./cache.js";
import * as extHostProtocol from "./extHost.protocol.js";
import * as extHostTypes from "./extHostTypes.js";
import { isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
class CustomDocumentStoreEntry {
  constructor(document, _storagePath) {
    this.document = document;
    this._storagePath = _storagePath;
    this._backupCounter = 1;
    this._edits = new Cache("custom documents");
  }
  addEdit(item) {
    return this._edits.add([item]);
  }
  async undo(editId, isDirty) {
    await this.getEdit(editId).undo();
    if (!isDirty) {
      this.disposeBackup();
    }
  }
  async redo(editId, isDirty) {
    await this.getEdit(editId).redo();
    if (!isDirty) {
      this.disposeBackup();
    }
  }
  disposeEdits(editIds) {
    for (const id of editIds) {
      this._edits.delete(id);
    }
  }
  getNewBackupUri() {
    if (!this._storagePath) {
      throw new Error("Backup requires a valid storage path");
    }
    const fileName = hashPath(this.document.uri) + this._backupCounter++;
    return joinPath(this._storagePath, fileName);
  }
  updateBackup(backup) {
    this._backup?.delete();
    this._backup = backup;
  }
  disposeBackup() {
    this._backup?.delete();
    this._backup = void 0;
  }
  getEdit(editId) {
    const edit = this._edits.get(editId, 0);
    if (!edit) {
      throw new Error("No edit found");
    }
    return edit;
  }
}
class CustomDocumentStore {
  constructor() {
    this._documents = /* @__PURE__ */ new Map();
  }
  get(viewType, resource) {
    return this._documents.get(this.key(viewType, resource));
  }
  add(viewType, document, storagePath) {
    const key = this.key(viewType, document.uri);
    if (this._documents.has(key)) {
      throw new Error(`Document already exists for viewType:${viewType} resource:${document.uri}`);
    }
    const entry = new CustomDocumentStoreEntry(document, storagePath);
    this._documents.set(key, entry);
    return entry;
  }
  delete(viewType, resource) {
    const key = this.key(viewType, resource);
    this._documents.delete(key);
  }
  key(viewType, resource) {
    return `${viewType}@@@${resource}`;
  }
}
var CustomEditorType = /* @__PURE__ */ ((CustomEditorType2) => {
  CustomEditorType2[CustomEditorType2["Text"] = 0] = "Text";
  CustomEditorType2[CustomEditorType2["Custom"] = 1] = "Custom";
  return CustomEditorType2;
})(CustomEditorType || {});
class EditorProviderStore {
  constructor() {
    this._providers = /* @__PURE__ */ new Map();
  }
  addTextProvider(viewType, extension, provider) {
    return this.add(viewType, { type: 0 /* Text */, extension, provider });
  }
  addCustomProvider(viewType, extension, provider) {
    return this.add(viewType, { type: 1 /* Custom */, extension, provider });
  }
  get(viewType) {
    return this._providers.get(viewType);
  }
  add(viewType, entry) {
    if (this._providers.has(viewType)) {
      throw new Error(`Provider for viewType:${viewType} already registered`);
    }
    this._providers.set(viewType, entry);
    return new extHostTypes.Disposable(() => this._providers.delete(viewType));
  }
}
class ExtHostCustomEditors {
  constructor(mainContext, _extHostDocuments, _extensionStoragePaths, _extHostWebview, _extHostWebviewPanels) {
    this._extHostDocuments = _extHostDocuments;
    this._extensionStoragePaths = _extensionStoragePaths;
    this._extHostWebview = _extHostWebview;
    this._extHostWebviewPanels = _extHostWebviewPanels;
    this._editorProviders = new EditorProviderStore();
    this._documents = new CustomDocumentStore();
    this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadCustomEditors);
  }
  registerCustomEditorProvider(extension, viewType, provider, options) {
    const disposables = new DisposableStore();
    if (isCustomTextEditorProvider(provider)) {
      disposables.add(this._editorProviders.addTextProvider(viewType, extension, provider));
      this._proxy.$registerTextEditorProvider(toExtensionData(extension), viewType, options.webviewOptions || {}, {
        supportsMove: !!provider.moveCustomTextEditor,
        supportsInlineDiff: isProposedApiEnabled(extension, "customEditorDiffs") && isCustomTextEditorProviderWithInlineDiffCapability(provider),
        supportsSideBySideDiff: isProposedApiEnabled(extension, "customEditorDiffs") && isCustomTextEditorProviderWithSideBySideDiffCapability(provider)
      }, shouldSerializeBuffersForPostMessage(extension));
    } else {
      disposables.add(this._editorProviders.addCustomProvider(viewType, extension, provider));
      const supportsCustomEditorDiffs = isProposedApiEnabled(extension, "customEditorDiffs");
      if (isCustomEditorProviderWithEditingCapability(provider)) {
        disposables.add(provider.onDidChangeCustomDocument((e) => {
          const entry = this.getCustomDocumentEntry(viewType, e.document.uri);
          if (isEditEvent(e)) {
            const editId = entry.addEdit(e);
            this._proxy.$onDidEdit(e.document.uri, viewType, editId, e.label);
          } else {
            this._proxy.$onContentChange(e.document.uri, viewType);
          }
        }));
      }
      this._proxy.$registerCustomEditorProvider(toExtensionData(extension), viewType, options.webviewOptions || {}, {
        supportsInlineDiff: supportsCustomEditorDiffs && isCustomEditorProviderWithInlineDiffCapability(provider),
        supportsSideBySideDiff: supportsCustomEditorDiffs && isCustomEditorProviderWithSideBySideDiffCapability(provider)
      }, !!options.supportsMultipleEditorsPerDocument, shouldSerializeBuffersForPostMessage(extension));
    }
    return extHostTypes.Disposable.from(
      disposables,
      new extHostTypes.Disposable(() => {
        this._proxy.$unregisterEditorProvider(viewType);
      })
    );
  }
  async $createCustomDocument(resource, viewType, backupId, untitledDocumentData, cancellation) {
    const entry = this._editorProviders.get(viewType);
    if (!entry) {
      throw new Error(`No provider found for '${viewType}'`);
    }
    if (entry.type !== 1 /* Custom */) {
      throw new Error(`Invalid provide type for '${viewType}'`);
    }
    const revivedResource = URI.revive(resource);
    const document = await entry.provider.openCustomDocument(revivedResource, { backupId, untitledDocumentData: untitledDocumentData?.buffer }, cancellation);
    let storageRoot;
    if (isCustomEditorProviderWithEditingCapability(entry.provider) && this._extensionStoragePaths) {
      storageRoot = this._extensionStoragePaths.workspaceValue(entry.extension) ?? this._extensionStoragePaths.globalValue(entry.extension);
    }
    this._documents.add(viewType, document, storageRoot);
    return { editable: isCustomEditorProviderWithEditingCapability(entry.provider) };
  }
  async $disposeCustomDocument(resource, viewType) {
    const entry = this._editorProviders.get(viewType);
    if (!entry) {
      throw new Error(`No provider found for '${viewType}'`);
    }
    if (entry.type !== 1 /* Custom */) {
      throw new Error(`Invalid provider type for '${viewType}'`);
    }
    const revivedResource = URI.revive(resource);
    const { document } = this.getCustomDocumentEntry(viewType, revivedResource);
    this._documents.delete(viewType, revivedResource);
    document.dispose();
  }
  async $resolveCustomEditor(resource, handle, viewType, initData, position, cancellation) {
    const entry = this._editorProviders.get(viewType);
    if (!entry) {
      throw new Error(`No provider found for '${viewType}'`);
    }
    const viewColumn = typeConverters.ViewColumn.to(position);
    const webview = this._extHostWebview.createNewWebview(handle, initData.contentOptions, entry.extension);
    this._extHostWebview.ensureDefaultContentOptions(handle, initData.contentOptions, entry.extension);
    const panel = this._extHostWebviewPanels.createNewWebviewPanel(handle, viewType, initData.title, viewColumn, initData.options, webview, initData.active);
    const revivedResource = URI.revive(resource);
    switch (entry.type) {
      case 1 /* Custom */: {
        const { document } = this.getCustomDocumentEntry(viewType, revivedResource);
        return entry.provider.resolveCustomEditor(document, panel, cancellation);
      }
      case 0 /* Text */: {
        const document = this._extHostDocuments.getDocument(revivedResource);
        return entry.provider.resolveCustomTextEditor(document, panel, cancellation);
      }
      default: {
        throw new Error("Unknown webview provider type");
      }
    }
  }
  async $resolveCustomEditorInlineDiff(originalResource, modifiedResource, handle, viewType, initData, position, cancellation) {
    const { entry, panel } = this.createCustomEditorDiffPanel(handle, viewType, initData, position);
    const revivedOriginalResource = URI.revive(originalResource);
    const revivedModifiedResource = URI.revive(modifiedResource);
    if (entry.type === 0 /* Text */) {
      if (!isCustomTextEditorProviderWithInlineDiffCapability(entry.provider)) {
        throw new Error(`Provider for '${viewType}' does not support inline custom text editor diffs`);
      }
      const originalDocument2 = this._extHostDocuments.getDocument(revivedOriginalResource);
      const modifiedDocument2 = this._extHostDocuments.getDocument(revivedModifiedResource);
      return entry.provider.resolveCustomTextEditorInlineDiff({ original: originalDocument2, modified: modifiedDocument2 }, panel, cancellation);
    }
    if (!isCustomEditorProviderWithInlineDiffCapability(entry.provider)) {
      throw new Error(`Provider for '${viewType}' does not support inline custom editor diffs`);
    }
    const { document: originalDocument } = this.getCustomDocumentEntry(viewType, revivedOriginalResource);
    const { document: modifiedDocument } = this.getCustomDocumentEntry(viewType, revivedModifiedResource);
    return entry.provider.resolveCustomEditorInlineDiff({ original: originalDocument, modified: modifiedDocument }, panel, cancellation);
  }
  async $resolveCustomEditorSideBySideDiff(originalResource, modifiedResource, webviewHandles, viewType, initData, position, cancellation) {
    const { entry, panel: originalPanel } = this.createCustomEditorDiffPanel(webviewHandles.original, viewType, initData.original, position);
    const { panel: modifiedPanel } = this.createCustomEditorDiffPanel(webviewHandles.modified, viewType, initData.modified, position);
    const revivedOriginalResource = URI.revive(originalResource);
    const revivedModifiedResource = URI.revive(modifiedResource);
    if (entry.type === 0 /* Text */) {
      if (!isCustomTextEditorProviderWithSideBySideDiffCapability(entry.provider)) {
        throw new Error(`Provider for '${viewType}' does not support side by side custom text editor diffs`);
      }
      const originalDocument2 = this._extHostDocuments.getDocument(revivedOriginalResource);
      const modifiedDocument2 = this._extHostDocuments.getDocument(revivedModifiedResource);
      return entry.provider.resolveCustomTextEditorSideBySideDiff({ original: originalDocument2, modified: modifiedDocument2 }, { original: originalPanel, modified: modifiedPanel }, cancellation);
    }
    if (!isCustomEditorProviderWithSideBySideDiffCapability(entry.provider)) {
      throw new Error(`Provider for '${viewType}' does not support side by side custom editor diffs`);
    }
    const { document: originalDocument } = this.getCustomDocumentEntry(viewType, revivedOriginalResource);
    const { document: modifiedDocument } = this.getCustomDocumentEntry(viewType, revivedModifiedResource);
    return entry.provider.resolveCustomEditorSideBySideDiff({ original: originalDocument, modified: modifiedDocument }, { original: originalPanel, modified: modifiedPanel }, cancellation);
  }
  createCustomEditorDiffPanel(handle, viewType, initData, position) {
    const entry = this._editorProviders.get(viewType);
    if (!entry) {
      throw new Error(`No provider found for '${viewType}'`);
    }
    const viewColumn = typeConverters.ViewColumn.to(position);
    const webview = this._extHostWebview.createNewWebview(handle, initData.contentOptions, entry.extension);
    this._extHostWebview.ensureDefaultContentOptions(handle, initData.contentOptions, entry.extension);
    const panel = this._extHostWebviewPanels.createNewWebviewPanel(handle, viewType, initData.title, viewColumn, initData.options, webview, initData.active);
    return { entry, panel };
  }
  $disposeEdits(resourceComponents, viewType, editIds) {
    const document = this.getCustomDocumentEntry(viewType, resourceComponents);
    document.disposeEdits(editIds);
  }
  async $onMoveCustomEditor(handle, newResourceComponents, viewType) {
    const entry = this._editorProviders.get(viewType);
    if (!entry) {
      throw new Error(`No provider found for '${viewType}'`);
    }
    if (!entry.provider.moveCustomTextEditor) {
      throw new Error(`Provider does not implement move '${viewType}'`);
    }
    const webview = this._extHostWebviewPanels.getWebviewPanel(handle);
    if (!webview) {
      throw new Error(`No webview found`);
    }
    const resource = URI.revive(newResourceComponents);
    const document = this._extHostDocuments.getDocument(resource);
    await entry.provider.moveCustomTextEditor(document, webview, CancellationToken.None);
  }
  async $undo(resourceComponents, viewType, editId, isDirty) {
    const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
    return entry.undo(editId, isDirty);
  }
  async $redo(resourceComponents, viewType, editId, isDirty) {
    const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
    return entry.redo(editId, isDirty);
  }
  async $revert(resourceComponents, viewType, cancellation) {
    const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
    const provider = this.getCustomEditorProvider(viewType);
    await provider.revertCustomDocument(entry.document, cancellation);
    entry.disposeBackup();
  }
  async $onSave(resourceComponents, viewType, cancellation) {
    const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
    const provider = this.getCustomEditorProvider(viewType);
    await provider.saveCustomDocument(entry.document, cancellation);
    entry.disposeBackup();
  }
  async $onSaveAs(resourceComponents, viewType, targetResource, cancellation) {
    const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
    const provider = this.getCustomEditorProvider(viewType);
    return provider.saveCustomDocumentAs(entry.document, URI.revive(targetResource), cancellation);
  }
  async $backup(resourceComponents, viewType, cancellation) {
    const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
    const provider = this.getCustomEditorProvider(viewType);
    const backup = await provider.backupCustomDocument(entry.document, {
      destination: entry.getNewBackupUri()
    }, cancellation);
    entry.updateBackup(backup);
    return backup.id;
  }
  getCustomDocumentEntry(viewType, resource) {
    const entry = this._documents.get(viewType, URI.revive(resource));
    if (!entry) {
      throw new Error("No custom document found");
    }
    return entry;
  }
  getCustomEditorProvider(viewType) {
    const entry = this._editorProviders.get(viewType);
    const provider = entry?.provider;
    if (!provider || !isCustomEditorProviderWithEditingCapability(provider)) {
      throw new Error("Custom document is not editable");
    }
    return provider;
  }
}
function isCustomEditorProviderWithEditingCapability(provider) {
  return !!provider.onDidChangeCustomDocument;
}
function isCustomTextEditorProvider(provider) {
  return typeof provider.resolveCustomTextEditor === "function";
}
function isCustomTextEditorProviderWithInlineDiffCapability(provider) {
  return typeof provider.resolveCustomTextEditorInlineDiff === "function";
}
function isCustomTextEditorProviderWithSideBySideDiffCapability(provider) {
  return typeof provider.resolveCustomTextEditorSideBySideDiff === "function";
}
function isCustomEditorProviderWithInlineDiffCapability(provider) {
  return typeof provider.resolveCustomEditorInlineDiff === "function";
}
function isCustomEditorProviderWithSideBySideDiffCapability(provider) {
  return typeof provider.resolveCustomEditorSideBySideDiff === "function";
}
function isEditEvent(e) {
  return typeof e.undo === "function" && typeof e.redo === "function";
}
function hashPath(resource) {
  const str = resource.scheme === Schemas.file || resource.scheme === Schemas.untitled ? resource.fsPath : resource.toString();
  return hash(str) + "";
}
export {
  ExtHostCustomEditors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RDdXN0b21FZGl0b3JzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHMgfSBmcm9tICcuL2V4dEhvc3REb2N1bWVudHMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblN0b3JhZ2VQYXRocyB9IGZyb20gJy4vZXh0SG9zdFN0b3JhZ2VQYXRocy5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlQ29udmVydGVycyBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0V2Vidmlld3MsIHNob3VsZFNlcmlhbGl6ZUJ1ZmZlcnNGb3JQb3N0TWVzc2FnZSwgdG9FeHRlbnNpb25EYXRhIH0gZnJvbSAnLi9leHRIb3N0V2Vidmlldy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0V2Vidmlld1BhbmVscyB9IGZyb20gJy4vZXh0SG9zdFdlYnZpZXdQYW5lbHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yR3JvdXBDb2x1bW4gfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3VwQ29sdW1uLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBDYWNoZSB9IGZyb20gJy4vY2FjaGUuanMnO1xuaW1wb3J0ICogYXMgZXh0SG9zdFByb3RvY29sIGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgKiBhcyBleHRIb3N0VHlwZXMgZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcblxuXG5jbGFzcyBDdXN0b21Eb2N1bWVudFN0b3JlRW50cnkge1xuXG5cdHByaXZhdGUgX2JhY2t1cENvdW50ZXIgPSAxO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBkb2N1bWVudDogdnNjb2RlLkN1c3RvbURvY3VtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VQYXRoOiBVUkkgfCB1bmRlZmluZWQsXG5cdCkgeyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdHMgPSBuZXcgQ2FjaGU8dnNjb2RlLkN1c3RvbURvY3VtZW50RWRpdEV2ZW50PignY3VzdG9tIGRvY3VtZW50cycpO1xuXG5cdHByaXZhdGUgX2JhY2t1cD86IHZzY29kZS5DdXN0b21Eb2N1bWVudEJhY2t1cDtcblxuXHRhZGRFZGl0KGl0ZW06IHZzY29kZS5DdXN0b21Eb2N1bWVudEVkaXRFdmVudCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRzLmFkZChbaXRlbV0pO1xuXHR9XG5cblx0YXN5bmMgdW5kbyhlZGl0SWQ6IG51bWJlciwgaXNEaXJ0eTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuZ2V0RWRpdChlZGl0SWQpLnVuZG8oKTtcblx0XHRpZiAoIWlzRGlydHkpIHtcblx0XHRcdHRoaXMuZGlzcG9zZUJhY2t1cCgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlZG8oZWRpdElkOiBudW1iZXIsIGlzRGlydHk6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmdldEVkaXQoZWRpdElkKS5yZWRvKCk7XG5cdFx0aWYgKCFpc0RpcnR5KSB7XG5cdFx0XHR0aGlzLmRpc3Bvc2VCYWNrdXAoKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlRWRpdHMoZWRpdElkczogbnVtYmVyW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIGVkaXRJZHMpIHtcblx0XHRcdHRoaXMuX2VkaXRzLmRlbGV0ZShpZCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0TmV3QmFja3VwVXJpKCk6IFVSSSB7XG5cdFx0aWYgKCF0aGlzLl9zdG9yYWdlUGF0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdCYWNrdXAgcmVxdWlyZXMgYSB2YWxpZCBzdG9yYWdlIHBhdGgnKTtcblx0XHR9XG5cdFx0Y29uc3QgZmlsZU5hbWUgPSBoYXNoUGF0aCh0aGlzLmRvY3VtZW50LnVyaSkgKyAodGhpcy5fYmFja3VwQ291bnRlcisrKTtcblx0XHRyZXR1cm4gam9pblBhdGgodGhpcy5fc3RvcmFnZVBhdGgsIGZpbGVOYW1lKTtcblx0fVxuXG5cdHVwZGF0ZUJhY2t1cChiYWNrdXA6IHZzY29kZS5DdXN0b21Eb2N1bWVudEJhY2t1cCk6IHZvaWQge1xuXHRcdHRoaXMuX2JhY2t1cD8uZGVsZXRlKCk7XG5cdFx0dGhpcy5fYmFja3VwID0gYmFja3VwO1xuXHR9XG5cblx0ZGlzcG9zZUJhY2t1cCgpOiB2b2lkIHtcblx0XHR0aGlzLl9iYWNrdXA/LmRlbGV0ZSgpO1xuXHRcdHRoaXMuX2JhY2t1cCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RWRpdChlZGl0SWQ6IG51bWJlcik6IHZzY29kZS5DdXN0b21Eb2N1bWVudEVkaXRFdmVudCB7XG5cdFx0Y29uc3QgZWRpdCA9IHRoaXMuX2VkaXRzLmdldChlZGl0SWQsIDApO1xuXHRcdGlmICghZWRpdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBlZGl0IGZvdW5kJyk7XG5cdFx0fVxuXHRcdHJldHVybiBlZGl0O1xuXHR9XG59XG5cbmNsYXNzIEN1c3RvbURvY3VtZW50U3RvcmUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHMgPSBuZXcgTWFwPHN0cmluZywgQ3VzdG9tRG9jdW1lbnRTdG9yZUVudHJ5PigpO1xuXG5cdHB1YmxpYyBnZXQodmlld1R5cGU6IHN0cmluZywgcmVzb3VyY2U6IHZzY29kZS5VcmkpOiBDdXN0b21Eb2N1bWVudFN0b3JlRW50cnkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9kb2N1bWVudHMuZ2V0KHRoaXMua2V5KHZpZXdUeXBlLCByZXNvdXJjZSkpO1xuXHR9XG5cblx0cHVibGljIGFkZCh2aWV3VHlwZTogc3RyaW5nLCBkb2N1bWVudDogdnNjb2RlLkN1c3RvbURvY3VtZW50LCBzdG9yYWdlUGF0aDogVVJJIHwgdW5kZWZpbmVkKTogQ3VzdG9tRG9jdW1lbnRTdG9yZUVudHJ5IHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLmtleSh2aWV3VHlwZSwgZG9jdW1lbnQudXJpKTtcblx0XHRpZiAodGhpcy5fZG9jdW1lbnRzLmhhcyhrZXkpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYERvY3VtZW50IGFscmVhZHkgZXhpc3RzIGZvciB2aWV3VHlwZToke3ZpZXdUeXBlfSByZXNvdXJjZToke2RvY3VtZW50LnVyaX1gKTtcblx0XHR9XG5cdFx0Y29uc3QgZW50cnkgPSBuZXcgQ3VzdG9tRG9jdW1lbnRTdG9yZUVudHJ5KGRvY3VtZW50LCBzdG9yYWdlUGF0aCk7XG5cdFx0dGhpcy5fZG9jdW1lbnRzLnNldChrZXksIGVudHJ5KTtcblx0XHRyZXR1cm4gZW50cnk7XG5cdH1cblxuXHRwdWJsaWMgZGVsZXRlKHZpZXdUeXBlOiBzdHJpbmcsIHJlc291cmNlOiB2c2NvZGUuVXJpKSB7XG5cdFx0Ly8gVXNlIHRoZSByZXNvdXJjZSBwYXJhbWV0ZXIgZGlyZWN0bHkgaW5zdGVhZCBvZiBkb2N1bWVudC51cmksIGJlY2F1c2UgdGhlIGRvY3VtZW50J3Ncblx0XHQvLyBVUkkgbWF5IGhhdmUgY2hhbmdlZCAoZS5nLiwgYWZ0ZXIgU2F2ZUFzIGZyb20gdW50aXRsZWQgdG8gYSBmaWxlIHBhdGgpLlxuXHRcdGNvbnN0IGtleSA9IHRoaXMua2V5KHZpZXdUeXBlLCByZXNvdXJjZSk7XG5cdFx0dGhpcy5fZG9jdW1lbnRzLmRlbGV0ZShrZXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBrZXkodmlld1R5cGU6IHN0cmluZywgcmVzb3VyY2U6IHZzY29kZS5VcmkpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt2aWV3VHlwZX1AQEAke3Jlc291cmNlfWA7XG5cdH1cbn1cblxuY29uc3QgZW51bSBDdXN0b21FZGl0b3JUeXBlIHtcblx0VGV4dCxcblx0Q3VzdG9tXG59XG5cbnR5cGUgUHJvdmlkZXJFbnRyeSA9IHtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdHJlYWRvbmx5IHR5cGU6IEN1c3RvbUVkaXRvclR5cGUuVGV4dDtcblx0cmVhZG9ubHkgcHJvdmlkZXI6IHZzY29kZS5DdXN0b21UZXh0RWRpdG9yUHJvdmlkZXI7XG59IHwge1xuXHRyZWFkb25seSBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0cmVhZG9ubHkgdHlwZTogQ3VzdG9tRWRpdG9yVHlwZS5DdXN0b207XG5cdHJlYWRvbmx5IHByb3ZpZGVyOiB2c2NvZGUuQ3VzdG9tUmVhZG9ubHlFZGl0b3JQcm92aWRlcjtcbn07XG5cbmNsYXNzIEVkaXRvclByb3ZpZGVyU3RvcmUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcnMgPSBuZXcgTWFwPHN0cmluZywgUHJvdmlkZXJFbnRyeT4oKTtcblxuXHRwdWJsaWMgYWRkVGV4dFByb3ZpZGVyKHZpZXdUeXBlOiBzdHJpbmcsIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBwcm92aWRlcjogdnNjb2RlLkN1c3RvbVRleHRFZGl0b3JQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5hZGQodmlld1R5cGUsIHsgdHlwZTogQ3VzdG9tRWRpdG9yVHlwZS5UZXh0LCBleHRlbnNpb24sIHByb3ZpZGVyIH0pO1xuXHR9XG5cblx0cHVibGljIGFkZEN1c3RvbVByb3ZpZGVyKHZpZXdUeXBlOiBzdHJpbmcsIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBwcm92aWRlcjogdnNjb2RlLkN1c3RvbVJlYWRvbmx5RWRpdG9yUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuYWRkKHZpZXdUeXBlLCB7IHR5cGU6IEN1c3RvbUVkaXRvclR5cGUuQ3VzdG9tLCBleHRlbnNpb24sIHByb3ZpZGVyIH0pO1xuXHR9XG5cblx0cHVibGljIGdldCh2aWV3VHlwZTogc3RyaW5nKTogUHJvdmlkZXJFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVycy5nZXQodmlld1R5cGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGQodmlld1R5cGU6IHN0cmluZywgZW50cnk6IFByb3ZpZGVyRW50cnkpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX3Byb3ZpZGVycy5oYXModmlld1R5cGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFByb3ZpZGVyIGZvciB2aWV3VHlwZToke3ZpZXdUeXBlfSBhbHJlYWR5IHJlZ2lzdGVyZWRgKTtcblx0XHR9XG5cdFx0dGhpcy5fcHJvdmlkZXJzLnNldCh2aWV3VHlwZSwgZW50cnkpO1xuXHRcdHJldHVybiBuZXcgZXh0SG9zdFR5cGVzLkRpc3Bvc2FibGUoKCkgPT4gdGhpcy5fcHJvdmlkZXJzLmRlbGV0ZSh2aWV3VHlwZSkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0Q3VzdG9tRWRpdG9ycyBpbXBsZW1lbnRzIGV4dEhvc3RQcm90b2NvbC5FeHRIb3N0Q3VzdG9tRWRpdG9yc1NoYXBlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogZXh0SG9zdFByb3RvY29sLk1haW5UaHJlYWRDdXN0b21FZGl0b3JzU2hhcGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yUHJvdmlkZXJzID0gbmV3IEVkaXRvclByb3ZpZGVyU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHMgPSBuZXcgQ3VzdG9tRG9jdW1lbnRTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1haW5Db250ZXh0OiBleHRIb3N0UHJvdG9jb2wuSU1haW5Db250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3REb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU3RvcmFnZVBhdGhzOiBJRXh0ZW5zaW9uU3RvcmFnZVBhdGhzIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RXZWJ2aWV3OiBFeHRIb3N0V2Vidmlld3MsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0SG9zdFdlYnZpZXdQYW5lbHM6IEV4dEhvc3RXZWJ2aWV3UGFuZWxzLFxuXHQpIHtcblx0XHR0aGlzLl9wcm94eSA9IG1haW5Db250ZXh0LmdldFByb3h5KGV4dEhvc3RQcm90b2NvbC5NYWluQ29udGV4dC5NYWluVGhyZWFkQ3VzdG9tRWRpdG9ycyk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJDdXN0b21FZGl0b3JQcm92aWRlcihcblx0XHRleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHR2aWV3VHlwZTogc3RyaW5nLFxuXHRcdHByb3ZpZGVyOiB2c2NvZGUuQ3VzdG9tUmVhZG9ubHlFZGl0b3JQcm92aWRlciB8IHZzY29kZS5DdXN0b21UZXh0RWRpdG9yUHJvdmlkZXIsXG5cdFx0b3B0aW9uczogeyB3ZWJ2aWV3T3B0aW9ucz86IHZzY29kZS5XZWJ2aWV3UGFuZWxPcHRpb25zOyBzdXBwb3J0c011bHRpcGxlRWRpdG9yc1BlckRvY3VtZW50PzogYm9vbGVhbiB9LFxuXHQpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aWYgKGlzQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyKHByb3ZpZGVyKSkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2VkaXRvclByb3ZpZGVycy5hZGRUZXh0UHJvdmlkZXIodmlld1R5cGUsIGV4dGVuc2lvbiwgcHJvdmlkZXIpKTtcblx0XHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlclRleHRFZGl0b3JQcm92aWRlcih0b0V4dGVuc2lvbkRhdGEoZXh0ZW5zaW9uKSwgdmlld1R5cGUsIG9wdGlvbnMud2Vidmlld09wdGlvbnMgfHwge30sIHtcblx0XHRcdFx0c3VwcG9ydHNNb3ZlOiAhIXByb3ZpZGVyLm1vdmVDdXN0b21UZXh0RWRpdG9yLFxuXHRcdFx0XHRzdXBwb3J0c0lubGluZURpZmY6IGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2N1c3RvbUVkaXRvckRpZmZzJykgJiYgaXNDdXN0b21UZXh0RWRpdG9yUHJvdmlkZXJXaXRoSW5saW5lRGlmZkNhcGFiaWxpdHkocHJvdmlkZXIpLFxuXHRcdFx0XHRzdXBwb3J0c1NpZGVCeVNpZGVEaWZmOiBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjdXN0b21FZGl0b3JEaWZmcycpICYmIGlzQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyV2l0aFNpZGVCeVNpZGVEaWZmQ2FwYWJpbGl0eShwcm92aWRlciksXG5cdFx0XHR9LCBzaG91bGRTZXJpYWxpemVCdWZmZXJzRm9yUG9zdE1lc3NhZ2UoZXh0ZW5zaW9uKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3JQcm92aWRlcnMuYWRkQ3VzdG9tUHJvdmlkZXIodmlld1R5cGUsIGV4dGVuc2lvbiwgcHJvdmlkZXIpKTtcblx0XHRcdGNvbnN0IHN1cHBvcnRzQ3VzdG9tRWRpdG9yRGlmZnMgPSBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjdXN0b21FZGl0b3JEaWZmcycpO1xuXG5cdFx0XHRpZiAoaXNDdXN0b21FZGl0b3JQcm92aWRlcldpdGhFZGl0aW5nQ2FwYWJpbGl0eShwcm92aWRlcikpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlQ3VzdG9tRG9jdW1lbnQoZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLmdldEN1c3RvbURvY3VtZW50RW50cnkodmlld1R5cGUsIGUuZG9jdW1lbnQudXJpKTtcblx0XHRcdFx0XHRpZiAoaXNFZGl0RXZlbnQoZSkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVkaXRJZCA9IGVudHJ5LmFkZEVkaXQoZSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRFZGl0KGUuZG9jdW1lbnQudXJpLCB2aWV3VHlwZSwgZWRpdElkLCBlLmxhYmVsKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fcHJveHkuJG9uQ29udGVudENoYW5nZShlLmRvY3VtZW50LnVyaSwgdmlld1R5cGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJDdXN0b21FZGl0b3JQcm92aWRlcih0b0V4dGVuc2lvbkRhdGEoZXh0ZW5zaW9uKSwgdmlld1R5cGUsIG9wdGlvbnMud2Vidmlld09wdGlvbnMgfHwge30sIHtcblx0XHRcdFx0c3VwcG9ydHNJbmxpbmVEaWZmOiBzdXBwb3J0c0N1c3RvbUVkaXRvckRpZmZzICYmIGlzQ3VzdG9tRWRpdG9yUHJvdmlkZXJXaXRoSW5saW5lRGlmZkNhcGFiaWxpdHkocHJvdmlkZXIpLFxuXHRcdFx0XHRzdXBwb3J0c1NpZGVCeVNpZGVEaWZmOiBzdXBwb3J0c0N1c3RvbUVkaXRvckRpZmZzICYmIGlzQ3VzdG9tRWRpdG9yUHJvdmlkZXJXaXRoU2lkZUJ5U2lkZURpZmZDYXBhYmlsaXR5KHByb3ZpZGVyKSxcblx0XHRcdH0sICEhb3B0aW9ucy5zdXBwb3J0c011bHRpcGxlRWRpdG9yc1BlckRvY3VtZW50LCBzaG91bGRTZXJpYWxpemVCdWZmZXJzRm9yUG9zdE1lc3NhZ2UoZXh0ZW5zaW9uKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGV4dEhvc3RUeXBlcy5EaXNwb3NhYmxlLmZyb20oXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdG5ldyBleHRIb3N0VHlwZXMuRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiR1bnJlZ2lzdGVyRWRpdG9yUHJvdmlkZXIodmlld1R5cGUpO1xuXHRcdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgJGNyZWF0ZUN1c3RvbURvY3VtZW50KHJlc291cmNlOiBVcmlDb21wb25lbnRzLCB2aWV3VHlwZTogc3RyaW5nLCBiYWNrdXBJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB1bnRpdGxlZERvY3VtZW50RGF0YTogVlNCdWZmZXIgfCB1bmRlZmluZWQsIGNhbmNlbGxhdGlvbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VkaXRvclByb3ZpZGVycy5nZXQodmlld1R5cGUpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gcHJvdmlkZXIgZm91bmQgZm9yICcke3ZpZXdUeXBlfSdgKTtcblx0XHR9XG5cblx0XHRpZiAoZW50cnkudHlwZSAhPT0gQ3VzdG9tRWRpdG9yVHlwZS5DdXN0b20pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBwcm92aWRlIHR5cGUgZm9yICcke3ZpZXdUeXBlfSdgKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXZpdmVkUmVzb3VyY2UgPSBVUkkucmV2aXZlKHJlc291cmNlKTtcblx0XHRjb25zdCBkb2N1bWVudCA9IGF3YWl0IGVudHJ5LnByb3ZpZGVyLm9wZW5DdXN0b21Eb2N1bWVudChyZXZpdmVkUmVzb3VyY2UsIHsgYmFja3VwSWQsIHVudGl0bGVkRG9jdW1lbnREYXRhOiB1bnRpdGxlZERvY3VtZW50RGF0YT8uYnVmZmVyIH0sIGNhbmNlbGxhdGlvbik7XG5cblx0XHRsZXQgc3RvcmFnZVJvb3Q6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaXNDdXN0b21FZGl0b3JQcm92aWRlcldpdGhFZGl0aW5nQ2FwYWJpbGl0eShlbnRyeS5wcm92aWRlcikgJiYgdGhpcy5fZXh0ZW5zaW9uU3RvcmFnZVBhdGhzKSB7XG5cdFx0XHRzdG9yYWdlUm9vdCA9IHRoaXMuX2V4dGVuc2lvblN0b3JhZ2VQYXRocy53b3Jrc3BhY2VWYWx1ZShlbnRyeS5leHRlbnNpb24pID8/IHRoaXMuX2V4dGVuc2lvblN0b3JhZ2VQYXRocy5nbG9iYWxWYWx1ZShlbnRyeS5leHRlbnNpb24pO1xuXHRcdH1cblx0XHR0aGlzLl9kb2N1bWVudHMuYWRkKHZpZXdUeXBlLCBkb2N1bWVudCwgc3RvcmFnZVJvb3QpO1xuXG5cdFx0cmV0dXJuIHsgZWRpdGFibGU6IGlzQ3VzdG9tRWRpdG9yUHJvdmlkZXJXaXRoRWRpdGluZ0NhcGFiaWxpdHkoZW50cnkucHJvdmlkZXIpIH07XG5cdH1cblxuXHRhc3luYyAkZGlzcG9zZUN1c3RvbURvY3VtZW50KHJlc291cmNlOiBVcmlDb21wb25lbnRzLCB2aWV3VHlwZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lZGl0b3JQcm92aWRlcnMuZ2V0KHZpZXdUeXBlKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIHByb3ZpZGVyIGZvdW5kIGZvciAnJHt2aWV3VHlwZX0nYCk7XG5cdFx0fVxuXG5cdFx0aWYgKGVudHJ5LnR5cGUgIT09IEN1c3RvbUVkaXRvclR5cGUuQ3VzdG9tKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgcHJvdmlkZXIgdHlwZSBmb3IgJyR7dmlld1R5cGV9J2ApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJldml2ZWRSZXNvdXJjZSA9IFVSSS5yZXZpdmUocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHsgZG9jdW1lbnQgfSA9IHRoaXMuZ2V0Q3VzdG9tRG9jdW1lbnRFbnRyeSh2aWV3VHlwZSwgcmV2aXZlZFJlc291cmNlKTtcblx0XHQvLyBQYXNzIHRoZSByZXNvdXJjZSB3ZSB1c2VkIHRvIGxvb2sgdXAgdGhlIGRvY3VtZW50LCBub3QgZG9jdW1lbnQudXJpLFxuXHRcdC8vIGJlY2F1c2UgdGhlIGRvY3VtZW50J3MgVVJJIG1heSBoYXZlIGNoYW5nZWQgKGUuZy4sIGFmdGVyIFNhdmVBcykuXG5cdFx0dGhpcy5fZG9jdW1lbnRzLmRlbGV0ZSh2aWV3VHlwZSwgcmV2aXZlZFJlc291cmNlKTtcblx0XHRkb2N1bWVudC5kaXNwb3NlKCk7XG5cdH1cblxuXHRhc3luYyAkcmVzb2x2ZUN1c3RvbUVkaXRvcihcblx0XHRyZXNvdXJjZTogVXJpQ29tcG9uZW50cyxcblx0XHRoYW5kbGU6IGV4dEhvc3RQcm90b2NvbC5XZWJ2aWV3SGFuZGxlLFxuXHRcdHZpZXdUeXBlOiBzdHJpbmcsXG5cdFx0aW5pdERhdGE6IHtcblx0XHRcdHRpdGxlOiBzdHJpbmc7XG5cdFx0XHRjb250ZW50T3B0aW9uczogZXh0SG9zdFByb3RvY29sLklXZWJ2aWV3Q29udGVudE9wdGlvbnM7XG5cdFx0XHRvcHRpb25zOiBleHRIb3N0UHJvdG9jb2wuSVdlYnZpZXdQYW5lbE9wdGlvbnM7XG5cdFx0XHRhY3RpdmU6IGJvb2xlYW47XG5cdFx0fSxcblx0XHRwb3NpdGlvbjogRWRpdG9yR3JvdXBDb2x1bW4sXG5cdFx0Y2FuY2VsbGF0aW9uOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lZGl0b3JQcm92aWRlcnMuZ2V0KHZpZXdUeXBlKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIHByb3ZpZGVyIGZvdW5kIGZvciAnJHt2aWV3VHlwZX0nYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld0NvbHVtbiA9IHR5cGVDb252ZXJ0ZXJzLlZpZXdDb2x1bW4udG8ocG9zaXRpb24pO1xuXG5cdFx0Y29uc3Qgd2VidmlldyA9IHRoaXMuX2V4dEhvc3RXZWJ2aWV3LmNyZWF0ZU5ld1dlYnZpZXcoaGFuZGxlLCBpbml0RGF0YS5jb250ZW50T3B0aW9ucywgZW50cnkuZXh0ZW5zaW9uKTtcblx0XHQvLyBUaGUgbWFpbiB0aHJlYWQgc3RhcnRzIHRoZSBjdXN0b20gZWRpdG9yJ3Mgd2VidmlldyB3aXRoIGVtcHR5IGNvbnRlbnRcblx0XHQvLyBvcHRpb25zLiBFbnN1cmUgYGxvY2FsUmVzb3VyY2VSb290c2AgZGVmYXVsdHMgdG8gdGhlIHdvcmtzcGFjZSBmb2xkZXJzXG5cdFx0Ly8gYW5kIHRoZSBwcm92aWRpbmcgZXh0ZW5zaW9uJ3MgaW5zdGFsbCBkaXJlY3RvcnksIGFzIGRvY3VtZW50ZWQgb25cblx0XHQvLyBgV2Vidmlld09wdGlvbnMubG9jYWxSZXNvdXJjZVJvb3RzYC5cblx0XHR0aGlzLl9leHRIb3N0V2Vidmlldy5lbnN1cmVEZWZhdWx0Q29udGVudE9wdGlvbnMoaGFuZGxlLCBpbml0RGF0YS5jb250ZW50T3B0aW9ucywgZW50cnkuZXh0ZW5zaW9uKTtcblx0XHRjb25zdCBwYW5lbCA9IHRoaXMuX2V4dEhvc3RXZWJ2aWV3UGFuZWxzLmNyZWF0ZU5ld1dlYnZpZXdQYW5lbChoYW5kbGUsIHZpZXdUeXBlLCBpbml0RGF0YS50aXRsZSwgdmlld0NvbHVtbiwgaW5pdERhdGEub3B0aW9ucywgd2VidmlldywgaW5pdERhdGEuYWN0aXZlKTtcblxuXHRcdGNvbnN0IHJldml2ZWRSZXNvdXJjZSA9IFVSSS5yZXZpdmUocmVzb3VyY2UpO1xuXG5cdFx0c3dpdGNoIChlbnRyeS50eXBlKSB7XG5cdFx0XHRjYXNlIEN1c3RvbUVkaXRvclR5cGUuQ3VzdG9tOiB7XG5cdFx0XHRcdGNvbnN0IHsgZG9jdW1lbnQgfSA9IHRoaXMuZ2V0Q3VzdG9tRG9jdW1lbnRFbnRyeSh2aWV3VHlwZSwgcmV2aXZlZFJlc291cmNlKTtcblx0XHRcdFx0cmV0dXJuIGVudHJ5LnByb3ZpZGVyLnJlc29sdmVDdXN0b21FZGl0b3IoZG9jdW1lbnQsIHBhbmVsLCBjYW5jZWxsYXRpb24pO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBDdXN0b21FZGl0b3JUeXBlLlRleHQ6IHtcblx0XHRcdFx0Y29uc3QgZG9jdW1lbnQgPSB0aGlzLl9leHRIb3N0RG9jdW1lbnRzLmdldERvY3VtZW50KHJldml2ZWRSZXNvdXJjZSk7XG5cdFx0XHRcdHJldHVybiBlbnRyeS5wcm92aWRlci5yZXNvbHZlQ3VzdG9tVGV4dEVkaXRvcihkb2N1bWVudCwgcGFuZWwsIGNhbmNlbGxhdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biB3ZWJ2aWV3IHByb3ZpZGVyIHR5cGUnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyAkcmVzb2x2ZUN1c3RvbUVkaXRvcklubGluZURpZmYoXG5cdFx0b3JpZ2luYWxSZXNvdXJjZTogVXJpQ29tcG9uZW50cyxcblx0XHRtb2RpZmllZFJlc291cmNlOiBVcmlDb21wb25lbnRzLFxuXHRcdGhhbmRsZTogZXh0SG9zdFByb3RvY29sLldlYnZpZXdIYW5kbGUsXG5cdFx0dmlld1R5cGU6IHN0cmluZyxcblx0XHRpbml0RGF0YTogZXh0SG9zdFByb3RvY29sLkN1c3RvbUVkaXRvckRpZmZJbml0RGF0YSxcblx0XHRwb3NpdGlvbjogRWRpdG9yR3JvdXBDb2x1bW4sXG5cdFx0Y2FuY2VsbGF0aW9uOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBlbnRyeSwgcGFuZWwgfSA9IHRoaXMuY3JlYXRlQ3VzdG9tRWRpdG9yRGlmZlBhbmVsKGhhbmRsZSwgdmlld1R5cGUsIGluaXREYXRhLCBwb3NpdGlvbik7XG5cdFx0Y29uc3QgcmV2aXZlZE9yaWdpbmFsUmVzb3VyY2UgPSBVUkkucmV2aXZlKG9yaWdpbmFsUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJldml2ZWRNb2RpZmllZFJlc291cmNlID0gVVJJLnJldml2ZShtb2RpZmllZFJlc291cmNlKTtcblxuXHRcdGlmIChlbnRyeS50eXBlID09PSBDdXN0b21FZGl0b3JUeXBlLlRleHQpIHtcblx0XHRcdGlmICghaXNDdXN0b21UZXh0RWRpdG9yUHJvdmlkZXJXaXRoSW5saW5lRGlmZkNhcGFiaWxpdHkoZW50cnkucHJvdmlkZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgUHJvdmlkZXIgZm9yICcke3ZpZXdUeXBlfScgZG9lcyBub3Qgc3VwcG9ydCBpbmxpbmUgY3VzdG9tIHRleHQgZWRpdG9yIGRpZmZzYCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsRG9jdW1lbnQgPSB0aGlzLl9leHRIb3N0RG9jdW1lbnRzLmdldERvY3VtZW50KHJldml2ZWRPcmlnaW5hbFJlc291cmNlKTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkRG9jdW1lbnQgPSB0aGlzLl9leHRIb3N0RG9jdW1lbnRzLmdldERvY3VtZW50KHJldml2ZWRNb2RpZmllZFJlc291cmNlKTtcblx0XHRcdHJldHVybiBlbnRyeS5wcm92aWRlci5yZXNvbHZlQ3VzdG9tVGV4dEVkaXRvcklubGluZURpZmYoeyBvcmlnaW5hbDogb3JpZ2luYWxEb2N1bWVudCwgbW9kaWZpZWQ6IG1vZGlmaWVkRG9jdW1lbnQgfSwgcGFuZWwsIGNhbmNlbGxhdGlvbik7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc0N1c3RvbUVkaXRvclByb3ZpZGVyV2l0aElubGluZURpZmZDYXBhYmlsaXR5KGVudHJ5LnByb3ZpZGVyKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQcm92aWRlciBmb3IgJyR7dmlld1R5cGV9JyBkb2VzIG5vdCBzdXBwb3J0IGlubGluZSBjdXN0b20gZWRpdG9yIGRpZmZzYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBkb2N1bWVudDogb3JpZ2luYWxEb2N1bWVudCB9ID0gdGhpcy5nZXRDdXN0b21Eb2N1bWVudEVudHJ5KHZpZXdUeXBlLCByZXZpdmVkT3JpZ2luYWxSZXNvdXJjZSk7XG5cdFx0Y29uc3QgeyBkb2N1bWVudDogbW9kaWZpZWREb2N1bWVudCB9ID0gdGhpcy5nZXRDdXN0b21Eb2N1bWVudEVudHJ5KHZpZXdUeXBlLCByZXZpdmVkTW9kaWZpZWRSZXNvdXJjZSk7XG5cdFx0cmV0dXJuIGVudHJ5LnByb3ZpZGVyLnJlc29sdmVDdXN0b21FZGl0b3JJbmxpbmVEaWZmKHsgb3JpZ2luYWw6IG9yaWdpbmFsRG9jdW1lbnQsIG1vZGlmaWVkOiBtb2RpZmllZERvY3VtZW50IH0sIHBhbmVsLCBjYW5jZWxsYXRpb24pO1xuXHR9XG5cblx0YXN5bmMgJHJlc29sdmVDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZihcblx0XHRvcmlnaW5hbFJlc291cmNlOiBVcmlDb21wb25lbnRzLFxuXHRcdG1vZGlmaWVkUmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsXG5cdFx0d2Vidmlld0hhbmRsZXM6IGV4dEhvc3RQcm90b2NvbC5DdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZldlYnZpZXdIYW5kbGVzLFxuXHRcdHZpZXdUeXBlOiBzdHJpbmcsXG5cdFx0aW5pdERhdGE6IGV4dEhvc3RQcm90b2NvbC5DdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZkluaXREYXRhLFxuXHRcdHBvc2l0aW9uOiBFZGl0b3JHcm91cENvbHVtbixcblx0XHRjYW5jZWxsYXRpb246IENhbmNlbGxhdGlvblRva2VuLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IGVudHJ5LCBwYW5lbDogb3JpZ2luYWxQYW5lbCB9ID0gdGhpcy5jcmVhdGVDdXN0b21FZGl0b3JEaWZmUGFuZWwod2Vidmlld0hhbmRsZXMub3JpZ2luYWwsIHZpZXdUeXBlLCBpbml0RGF0YS5vcmlnaW5hbCwgcG9zaXRpb24pO1xuXHRcdGNvbnN0IHsgcGFuZWw6IG1vZGlmaWVkUGFuZWwgfSA9IHRoaXMuY3JlYXRlQ3VzdG9tRWRpdG9yRGlmZlBhbmVsKHdlYnZpZXdIYW5kbGVzLm1vZGlmaWVkLCB2aWV3VHlwZSwgaW5pdERhdGEubW9kaWZpZWQsIHBvc2l0aW9uKTtcblx0XHRjb25zdCByZXZpdmVkT3JpZ2luYWxSZXNvdXJjZSA9IFVSSS5yZXZpdmUob3JpZ2luYWxSZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmV2aXZlZE1vZGlmaWVkUmVzb3VyY2UgPSBVUkkucmV2aXZlKG1vZGlmaWVkUmVzb3VyY2UpO1xuXG5cdFx0aWYgKGVudHJ5LnR5cGUgPT09IEN1c3RvbUVkaXRvclR5cGUuVGV4dCkge1xuXHRcdFx0aWYgKCFpc0N1c3RvbVRleHRFZGl0b3JQcm92aWRlcldpdGhTaWRlQnlTaWRlRGlmZkNhcGFiaWxpdHkoZW50cnkucHJvdmlkZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgUHJvdmlkZXIgZm9yICcke3ZpZXdUeXBlfScgZG9lcyBub3Qgc3VwcG9ydCBzaWRlIGJ5IHNpZGUgY3VzdG9tIHRleHQgZWRpdG9yIGRpZmZzYCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsRG9jdW1lbnQgPSB0aGlzLl9leHRIb3N0RG9jdW1lbnRzLmdldERvY3VtZW50KHJldml2ZWRPcmlnaW5hbFJlc291cmNlKTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkRG9jdW1lbnQgPSB0aGlzLl9leHRIb3N0RG9jdW1lbnRzLmdldERvY3VtZW50KHJldml2ZWRNb2RpZmllZFJlc291cmNlKTtcblx0XHRcdHJldHVybiBlbnRyeS5wcm92aWRlci5yZXNvbHZlQ3VzdG9tVGV4dEVkaXRvclNpZGVCeVNpZGVEaWZmKHsgb3JpZ2luYWw6IG9yaWdpbmFsRG9jdW1lbnQsIG1vZGlmaWVkOiBtb2RpZmllZERvY3VtZW50IH0sIHsgb3JpZ2luYWw6IG9yaWdpbmFsUGFuZWwsIG1vZGlmaWVkOiBtb2RpZmllZFBhbmVsIH0sIGNhbmNlbGxhdGlvbik7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc0N1c3RvbUVkaXRvclByb3ZpZGVyV2l0aFNpZGVCeVNpZGVEaWZmQ2FwYWJpbGl0eShlbnRyeS5wcm92aWRlcikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgUHJvdmlkZXIgZm9yICcke3ZpZXdUeXBlfScgZG9lcyBub3Qgc3VwcG9ydCBzaWRlIGJ5IHNpZGUgY3VzdG9tIGVkaXRvciBkaWZmc2ApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZG9jdW1lbnQ6IG9yaWdpbmFsRG9jdW1lbnQgfSA9IHRoaXMuZ2V0Q3VzdG9tRG9jdW1lbnRFbnRyeSh2aWV3VHlwZSwgcmV2aXZlZE9yaWdpbmFsUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHsgZG9jdW1lbnQ6IG1vZGlmaWVkRG9jdW1lbnQgfSA9IHRoaXMuZ2V0Q3VzdG9tRG9jdW1lbnRFbnRyeSh2aWV3VHlwZSwgcmV2aXZlZE1vZGlmaWVkUmVzb3VyY2UpO1xuXHRcdHJldHVybiBlbnRyeS5wcm92aWRlci5yZXNvbHZlQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmYoeyBvcmlnaW5hbDogb3JpZ2luYWxEb2N1bWVudCwgbW9kaWZpZWQ6IG1vZGlmaWVkRG9jdW1lbnQgfSwgeyBvcmlnaW5hbDogb3JpZ2luYWxQYW5lbCwgbW9kaWZpZWQ6IG1vZGlmaWVkUGFuZWwgfSwgY2FuY2VsbGF0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ3VzdG9tRWRpdG9yRGlmZlBhbmVsKFxuXHRcdGhhbmRsZTogZXh0SG9zdFByb3RvY29sLldlYnZpZXdIYW5kbGUsXG5cdFx0dmlld1R5cGU6IHN0cmluZyxcblx0XHRpbml0RGF0YTogZXh0SG9zdFByb3RvY29sLkN1c3RvbUVkaXRvckRpZmZJbml0RGF0YSxcblx0XHRwb3NpdGlvbjogRWRpdG9yR3JvdXBDb2x1bW4sXG5cdCk6IHsgZW50cnk6IFByb3ZpZGVyRW50cnk7IHBhbmVsOiB2c2NvZGUuV2Vidmlld1BhbmVsIH0ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZWRpdG9yUHJvdmlkZXJzLmdldCh2aWV3VHlwZSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBwcm92aWRlciBmb3VuZCBmb3IgJyR7dmlld1R5cGV9J2ApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdDb2x1bW4gPSB0eXBlQ29udmVydGVycy5WaWV3Q29sdW1uLnRvKHBvc2l0aW9uKTtcblx0XHRjb25zdCB3ZWJ2aWV3ID0gdGhpcy5fZXh0SG9zdFdlYnZpZXcuY3JlYXRlTmV3V2VidmlldyhoYW5kbGUsIGluaXREYXRhLmNvbnRlbnRPcHRpb25zLCBlbnRyeS5leHRlbnNpb24pO1xuXHRcdHRoaXMuX2V4dEhvc3RXZWJ2aWV3LmVuc3VyZURlZmF1bHRDb250ZW50T3B0aW9ucyhoYW5kbGUsIGluaXREYXRhLmNvbnRlbnRPcHRpb25zLCBlbnRyeS5leHRlbnNpb24pO1xuXHRcdGNvbnN0IHBhbmVsID0gdGhpcy5fZXh0SG9zdFdlYnZpZXdQYW5lbHMuY3JlYXRlTmV3V2Vidmlld1BhbmVsKGhhbmRsZSwgdmlld1R5cGUsIGluaXREYXRhLnRpdGxlLCB2aWV3Q29sdW1uLCBpbml0RGF0YS5vcHRpb25zLCB3ZWJ2aWV3LCBpbml0RGF0YS5hY3RpdmUpO1xuXHRcdHJldHVybiB7IGVudHJ5LCBwYW5lbCB9O1xuXHR9XG5cblx0JGRpc3Bvc2VFZGl0cyhyZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHZpZXdUeXBlOiBzdHJpbmcsIGVkaXRJZHM6IG51bWJlcltdKTogdm9pZCB7XG5cdFx0Y29uc3QgZG9jdW1lbnQgPSB0aGlzLmdldEN1c3RvbURvY3VtZW50RW50cnkodmlld1R5cGUsIHJlc291cmNlQ29tcG9uZW50cyk7XG5cdFx0ZG9jdW1lbnQuZGlzcG9zZUVkaXRzKGVkaXRJZHMpO1xuXHR9XG5cblx0YXN5bmMgJG9uTW92ZUN1c3RvbUVkaXRvcihoYW5kbGU6IHN0cmluZywgbmV3UmVzb3VyY2VDb21wb25lbnRzOiBVcmlDb21wb25lbnRzLCB2aWV3VHlwZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lZGl0b3JQcm92aWRlcnMuZ2V0KHZpZXdUeXBlKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIHByb3ZpZGVyIGZvdW5kIGZvciAnJHt2aWV3VHlwZX0nYCk7XG5cdFx0fVxuXG5cdFx0aWYgKCEoZW50cnkucHJvdmlkZXIgYXMgdnNjb2RlLkN1c3RvbVRleHRFZGl0b3JQcm92aWRlcikubW92ZUN1c3RvbVRleHRFZGl0b3IpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgUHJvdmlkZXIgZG9lcyBub3QgaW1wbGVtZW50IG1vdmUgJyR7dmlld1R5cGV9J2ApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdlYnZpZXcgPSB0aGlzLl9leHRIb3N0V2Vidmlld1BhbmVscy5nZXRXZWJ2aWV3UGFuZWwoaGFuZGxlKTtcblx0XHRpZiAoIXdlYnZpZXcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gd2VidmlldyBmb3VuZGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnJldml2ZShuZXdSZXNvdXJjZUNvbXBvbmVudHMpO1xuXHRcdGNvbnN0IGRvY3VtZW50ID0gdGhpcy5fZXh0SG9zdERvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0YXdhaXQgKGVudHJ5LnByb3ZpZGVyIGFzIHZzY29kZS5DdXN0b21UZXh0RWRpdG9yUHJvdmlkZXIpLm1vdmVDdXN0b21UZXh0RWRpdG9yIShkb2N1bWVudCwgd2VidmlldywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH1cblxuXHRhc3luYyAkdW5kbyhyZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHZpZXdUeXBlOiBzdHJpbmcsIGVkaXRJZDogbnVtYmVyLCBpc0RpcnR5OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLmdldEN1c3RvbURvY3VtZW50RW50cnkodmlld1R5cGUsIHJlc291cmNlQ29tcG9uZW50cyk7XG5cdFx0cmV0dXJuIGVudHJ5LnVuZG8oZWRpdElkLCBpc0RpcnR5KTtcblx0fVxuXG5cdGFzeW5jICRyZWRvKHJlc291cmNlQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgdmlld1R5cGU6IHN0cmluZywgZWRpdElkOiBudW1iZXIsIGlzRGlydHk6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuZ2V0Q3VzdG9tRG9jdW1lbnRFbnRyeSh2aWV3VHlwZSwgcmVzb3VyY2VDb21wb25lbnRzKTtcblx0XHRyZXR1cm4gZW50cnkucmVkbyhlZGl0SWQsIGlzRGlydHkpO1xuXHR9XG5cblx0YXN5bmMgJHJldmVydChyZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHZpZXdUeXBlOiBzdHJpbmcsIGNhbmNlbGxhdGlvbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuZ2V0Q3VzdG9tRG9jdW1lbnRFbnRyeSh2aWV3VHlwZSwgcmVzb3VyY2VDb21wb25lbnRzKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuZ2V0Q3VzdG9tRWRpdG9yUHJvdmlkZXIodmlld1R5cGUpO1xuXHRcdGF3YWl0IHByb3ZpZGVyLnJldmVydEN1c3RvbURvY3VtZW50KGVudHJ5LmRvY3VtZW50LCBjYW5jZWxsYXRpb24pO1xuXHRcdGVudHJ5LmRpc3Bvc2VCYWNrdXAoKTtcblx0fVxuXG5cdGFzeW5jICRvblNhdmUocmVzb3VyY2VDb21wb25lbnRzOiBVcmlDb21wb25lbnRzLCB2aWV3VHlwZTogc3RyaW5nLCBjYW5jZWxsYXRpb246IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLmdldEN1c3RvbURvY3VtZW50RW50cnkodmlld1R5cGUsIHJlc291cmNlQ29tcG9uZW50cyk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmdldEN1c3RvbUVkaXRvclByb3ZpZGVyKHZpZXdUeXBlKTtcblx0XHRhd2FpdCBwcm92aWRlci5zYXZlQ3VzdG9tRG9jdW1lbnQoZW50cnkuZG9jdW1lbnQsIGNhbmNlbGxhdGlvbik7XG5cdFx0ZW50cnkuZGlzcG9zZUJhY2t1cCgpO1xuXHR9XG5cblx0YXN5bmMgJG9uU2F2ZUFzKHJlc291cmNlQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgdmlld1R5cGU6IHN0cmluZywgdGFyZ2V0UmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIGNhbmNlbGxhdGlvbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuZ2V0Q3VzdG9tRG9jdW1lbnRFbnRyeSh2aWV3VHlwZSwgcmVzb3VyY2VDb21wb25lbnRzKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuZ2V0Q3VzdG9tRWRpdG9yUHJvdmlkZXIodmlld1R5cGUpO1xuXHRcdHJldHVybiBwcm92aWRlci5zYXZlQ3VzdG9tRG9jdW1lbnRBcyhlbnRyeS5kb2N1bWVudCwgVVJJLnJldml2ZSh0YXJnZXRSZXNvdXJjZSksIGNhbmNlbGxhdGlvbik7XG5cdH1cblxuXHRhc3luYyAkYmFja3VwKHJlc291cmNlQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgdmlld1R5cGU6IHN0cmluZywgY2FuY2VsbGF0aW9uOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLmdldEN1c3RvbURvY3VtZW50RW50cnkodmlld1R5cGUsIHJlc291cmNlQ29tcG9uZW50cyk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmdldEN1c3RvbUVkaXRvclByb3ZpZGVyKHZpZXdUeXBlKTtcblxuXHRcdGNvbnN0IGJhY2t1cCA9IGF3YWl0IHByb3ZpZGVyLmJhY2t1cEN1c3RvbURvY3VtZW50KGVudHJ5LmRvY3VtZW50LCB7XG5cdFx0XHRkZXN0aW5hdGlvbjogZW50cnkuZ2V0TmV3QmFja3VwVXJpKCksXG5cdFx0fSwgY2FuY2VsbGF0aW9uKTtcblx0XHRlbnRyeS51cGRhdGVCYWNrdXAoYmFja3VwKTtcblx0XHRyZXR1cm4gYmFja3VwLmlkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDdXN0b21Eb2N1bWVudEVudHJ5KHZpZXdUeXBlOiBzdHJpbmcsIHJlc291cmNlOiBVcmlDb21wb25lbnRzKTogQ3VzdG9tRG9jdW1lbnRTdG9yZUVudHJ5IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2RvY3VtZW50cy5nZXQodmlld1R5cGUsIFVSSS5yZXZpdmUocmVzb3VyY2UpKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGN1c3RvbSBkb2N1bWVudCBmb3VuZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gZW50cnk7XG5cdH1cblxuXHRwcml2YXRlIGdldEN1c3RvbUVkaXRvclByb3ZpZGVyKHZpZXdUeXBlOiBzdHJpbmcpOiB2c2NvZGUuQ3VzdG9tRWRpdG9yUHJvdmlkZXIge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZWRpdG9yUHJvdmlkZXJzLmdldCh2aWV3VHlwZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBlbnRyeT8ucHJvdmlkZXI7XG5cdFx0aWYgKCFwcm92aWRlciB8fCAhaXNDdXN0b21FZGl0b3JQcm92aWRlcldpdGhFZGl0aW5nQ2FwYWJpbGl0eShwcm92aWRlcikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ3VzdG9tIGRvY3VtZW50IGlzIG5vdCBlZGl0YWJsZScpO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvdmlkZXI7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNDdXN0b21FZGl0b3JQcm92aWRlcldpdGhFZGl0aW5nQ2FwYWJpbGl0eShwcm92aWRlcjogdnNjb2RlLkN1c3RvbVRleHRFZGl0b3JQcm92aWRlciB8IHZzY29kZS5DdXN0b21FZGl0b3JQcm92aWRlciB8IHZzY29kZS5DdXN0b21SZWFkb25seUVkaXRvclByb3ZpZGVyKTogcHJvdmlkZXIgaXMgdnNjb2RlLkN1c3RvbUVkaXRvclByb3ZpZGVyIHtcblx0cmV0dXJuICEhKHByb3ZpZGVyIGFzIHZzY29kZS5DdXN0b21FZGl0b3JQcm92aWRlcikub25EaWRDaGFuZ2VDdXN0b21Eb2N1bWVudDtcbn1cblxuZnVuY3Rpb24gaXNDdXN0b21UZXh0RWRpdG9yUHJvdmlkZXIocHJvdmlkZXI6IHZzY29kZS5DdXN0b21SZWFkb25seUVkaXRvclByb3ZpZGVyPHZzY29kZS5DdXN0b21Eb2N1bWVudD4gfCB2c2NvZGUuQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyKTogcHJvdmlkZXIgaXMgdnNjb2RlLkN1c3RvbVRleHRFZGl0b3JQcm92aWRlciB7XG5cdHJldHVybiB0eXBlb2YgKHByb3ZpZGVyIGFzIHZzY29kZS5DdXN0b21UZXh0RWRpdG9yUHJvdmlkZXIpLnJlc29sdmVDdXN0b21UZXh0RWRpdG9yID09PSAnZnVuY3Rpb24nO1xufVxuXG5mdW5jdGlvbiBpc0N1c3RvbVRleHRFZGl0b3JQcm92aWRlcldpdGhJbmxpbmVEaWZmQ2FwYWJpbGl0eShwcm92aWRlcjogdnNjb2RlLkN1c3RvbVRleHRFZGl0b3JQcm92aWRlcik6IHByb3ZpZGVyIGlzIHZzY29kZS5DdXN0b21UZXh0RWRpdG9yUHJvdmlkZXIgJiBSZXF1aXJlZDxQaWNrPHZzY29kZS5DdXN0b21UZXh0RWRpdG9yUHJvdmlkZXIsICdyZXNvbHZlQ3VzdG9tVGV4dEVkaXRvcklubGluZURpZmYnPj4ge1xuXHRyZXR1cm4gdHlwZW9mIHByb3ZpZGVyLnJlc29sdmVDdXN0b21UZXh0RWRpdG9ySW5saW5lRGlmZiA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gaXNDdXN0b21UZXh0RWRpdG9yUHJvdmlkZXJXaXRoU2lkZUJ5U2lkZURpZmZDYXBhYmlsaXR5KHByb3ZpZGVyOiB2c2NvZGUuQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyKTogcHJvdmlkZXIgaXMgdnNjb2RlLkN1c3RvbVRleHRFZGl0b3JQcm92aWRlciAmIFJlcXVpcmVkPFBpY2s8dnNjb2RlLkN1c3RvbVRleHRFZGl0b3JQcm92aWRlciwgJ3Jlc29sdmVDdXN0b21UZXh0RWRpdG9yU2lkZUJ5U2lkZURpZmYnPj4ge1xuXHRyZXR1cm4gdHlwZW9mIHByb3ZpZGVyLnJlc29sdmVDdXN0b21UZXh0RWRpdG9yU2lkZUJ5U2lkZURpZmYgPT09ICdmdW5jdGlvbic7XG59XG5cbmZ1bmN0aW9uIGlzQ3VzdG9tRWRpdG9yUHJvdmlkZXJXaXRoSW5saW5lRGlmZkNhcGFiaWxpdHkocHJvdmlkZXI6IHZzY29kZS5DdXN0b21SZWFkb25seUVkaXRvclByb3ZpZGVyKTogcHJvdmlkZXIgaXMgdnNjb2RlLkN1c3RvbVJlYWRvbmx5RWRpdG9yUHJvdmlkZXIgJiBSZXF1aXJlZDxQaWNrPHZzY29kZS5DdXN0b21SZWFkb25seUVkaXRvclByb3ZpZGVyLCAncmVzb2x2ZUN1c3RvbUVkaXRvcklubGluZURpZmYnPj4ge1xuXHRyZXR1cm4gdHlwZW9mIHByb3ZpZGVyLnJlc29sdmVDdXN0b21FZGl0b3JJbmxpbmVEaWZmID09PSAnZnVuY3Rpb24nO1xufVxuXG5mdW5jdGlvbiBpc0N1c3RvbUVkaXRvclByb3ZpZGVyV2l0aFNpZGVCeVNpZGVEaWZmQ2FwYWJpbGl0eShwcm92aWRlcjogdnNjb2RlLkN1c3RvbVJlYWRvbmx5RWRpdG9yUHJvdmlkZXIpOiBwcm92aWRlciBpcyB2c2NvZGUuQ3VzdG9tUmVhZG9ubHlFZGl0b3JQcm92aWRlciAmIFJlcXVpcmVkPFBpY2s8dnNjb2RlLkN1c3RvbVJlYWRvbmx5RWRpdG9yUHJvdmlkZXIsICdyZXNvbHZlQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmYnPj4ge1xuXHRyZXR1cm4gdHlwZW9mIHByb3ZpZGVyLnJlc29sdmVDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZiA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gaXNFZGl0RXZlbnQoZTogdnNjb2RlLkN1c3RvbURvY3VtZW50Q29udGVudENoYW5nZUV2ZW50IHwgdnNjb2RlLkN1c3RvbURvY3VtZW50RWRpdEV2ZW50KTogZSBpcyB2c2NvZGUuQ3VzdG9tRG9jdW1lbnRFZGl0RXZlbnQge1xuXHRyZXR1cm4gdHlwZW9mIChlIGFzIHZzY29kZS5DdXN0b21Eb2N1bWVudEVkaXRFdmVudCkudW5kbyA9PT0gJ2Z1bmN0aW9uJ1xuXHRcdCYmIHR5cGVvZiAoZSBhcyB2c2NvZGUuQ3VzdG9tRG9jdW1lbnRFZGl0RXZlbnQpLnJlZG8gPT09ICdmdW5jdGlvbic7XG59XG5cbmZ1bmN0aW9uIGhhc2hQYXRoKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRjb25zdCBzdHIgPSByZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSB8fCByZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQgPyByZXNvdXJjZS5mc1BhdGggOiByZXNvdXJjZS50b1N0cmluZygpO1xuXHRyZXR1cm4gaGFzaChzdHIpICsgJyc7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQVk7QUFDckIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBMEI7QUFJbkMsWUFBWSxvQkFBb0I7QUFDaEMsU0FBMEIsc0NBQXNDLHVCQUF1QjtBQUl2RixTQUFTLGFBQWE7QUFDdEIsWUFBWSxxQkFBcUI7QUFDakMsWUFBWSxrQkFBa0I7QUFDOUIsU0FBUyw0QkFBNEI7QUFHckMsTUFBTSx5QkFBeUI7QUFBQSxFQUk5QixZQUNpQixVQUNDLGNBQ2hCO0FBRmU7QUFDQztBQUpsQixTQUFRLGlCQUFpQjtBQU96QixTQUFpQixTQUFTLElBQUksTUFBc0Msa0JBQWtCO0FBQUEsRUFGbEY7QUFBQSxFQU1KLFFBQVEsTUFBOEM7QUFDckQsV0FBTyxLQUFLLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQztBQUFBLEVBQzlCO0FBQUEsRUFFQSxNQUFNLEtBQUssUUFBZ0IsU0FBaUM7QUFDM0QsVUFBTSxLQUFLLFFBQVEsTUFBTSxFQUFFLEtBQUs7QUFDaEMsUUFBSSxDQUFDLFNBQVM7QUFDYixXQUFLLGNBQWM7QUFBQSxJQUNwQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sS0FBSyxRQUFnQixTQUFpQztBQUMzRCxVQUFNLEtBQUssUUFBUSxNQUFNLEVBQUUsS0FBSztBQUNoQyxRQUFJLENBQUMsU0FBUztBQUNiLFdBQUssY0FBYztBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUFBLEVBRUEsYUFBYSxTQUF5QjtBQUNyQyxlQUFXLE1BQU0sU0FBUztBQUN6QixXQUFLLE9BQU8sT0FBTyxFQUFFO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxrQkFBdUI7QUFDdEIsUUFBSSxDQUFDLEtBQUssY0FBYztBQUN2QixZQUFNLElBQUksTUFBTSxzQ0FBc0M7QUFBQSxJQUN2RDtBQUNBLFVBQU0sV0FBVyxTQUFTLEtBQUssU0FBUyxHQUFHLElBQUssS0FBSztBQUNyRCxXQUFPLFNBQVMsS0FBSyxjQUFjLFFBQVE7QUFBQSxFQUM1QztBQUFBLEVBRUEsYUFBYSxRQUEyQztBQUN2RCxTQUFLLFNBQVMsT0FBTztBQUNyQixTQUFLLFVBQVU7QUFBQSxFQUNoQjtBQUFBLEVBRUEsZ0JBQXNCO0FBQ3JCLFNBQUssU0FBUyxPQUFPO0FBQ3JCLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQUEsRUFFUSxRQUFRLFFBQWdEO0FBQy9ELFVBQU0sT0FBTyxLQUFLLE9BQU8sSUFBSSxRQUFRLENBQUM7QUFDdEMsUUFBSSxDQUFDLE1BQU07QUFDVixZQUFNLElBQUksTUFBTSxlQUFlO0FBQUEsSUFDaEM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsTUFBTSxvQkFBb0I7QUFBQSxFQUExQjtBQUNDLFNBQWlCLGFBQWEsb0JBQUksSUFBc0M7QUFBQTtBQUFBLEVBRWpFLElBQUksVUFBa0IsVUFBNEQ7QUFDeEYsV0FBTyxLQUFLLFdBQVcsSUFBSSxLQUFLLElBQUksVUFBVSxRQUFRLENBQUM7QUFBQSxFQUN4RDtBQUFBLEVBRU8sSUFBSSxVQUFrQixVQUFpQyxhQUF3RDtBQUNySCxVQUFNLE1BQU0sS0FBSyxJQUFJLFVBQVUsU0FBUyxHQUFHO0FBQzNDLFFBQUksS0FBSyxXQUFXLElBQUksR0FBRyxHQUFHO0FBQzdCLFlBQU0sSUFBSSxNQUFNLHdDQUF3QyxRQUFRLGFBQWEsU0FBUyxHQUFHLEVBQUU7QUFBQSxJQUM1RjtBQUNBLFVBQU0sUUFBUSxJQUFJLHlCQUF5QixVQUFVLFdBQVc7QUFDaEUsU0FBSyxXQUFXLElBQUksS0FBSyxLQUFLO0FBQzlCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxPQUFPLFVBQWtCLFVBQXNCO0FBR3JELFVBQU0sTUFBTSxLQUFLLElBQUksVUFBVSxRQUFRO0FBQ3ZDLFNBQUssV0FBVyxPQUFPLEdBQUc7QUFBQSxFQUMzQjtBQUFBLEVBRVEsSUFBSSxVQUFrQixVQUE4QjtBQUMzRCxXQUFPLEdBQUcsUUFBUSxNQUFNLFFBQVE7QUFBQSxFQUNqQztBQUNEO0FBRUEsSUFBVyxtQkFBWCxrQkFBV0Esc0JBQVg7QUFDQyxFQUFBQSxvQ0FBQTtBQUNBLEVBQUFBLG9DQUFBO0FBRlUsU0FBQUE7QUFBQSxHQUFBO0FBZVgsTUFBTSxvQkFBb0I7QUFBQSxFQUExQjtBQUNDLFNBQWlCLGFBQWEsb0JBQUksSUFBMkI7QUFBQTtBQUFBLEVBRXRELGdCQUFnQixVQUFrQixXQUFrQyxVQUE4RDtBQUN4SSxXQUFPLEtBQUssSUFBSSxVQUFVLEVBQUUsTUFBTSxjQUF1QixXQUFXLFNBQVMsQ0FBQztBQUFBLEVBQy9FO0FBQUEsRUFFTyxrQkFBa0IsVUFBa0IsV0FBa0MsVUFBa0U7QUFDOUksV0FBTyxLQUFLLElBQUksVUFBVSxFQUFFLE1BQU0sZ0JBQXlCLFdBQVcsU0FBUyxDQUFDO0FBQUEsRUFDakY7QUFBQSxFQUVPLElBQUksVUFBNkM7QUFDdkQsV0FBTyxLQUFLLFdBQVcsSUFBSSxRQUFRO0FBQUEsRUFDcEM7QUFBQSxFQUVRLElBQUksVUFBa0IsT0FBeUM7QUFDdEUsUUFBSSxLQUFLLFdBQVcsSUFBSSxRQUFRLEdBQUc7QUFDbEMsWUFBTSxJQUFJLE1BQU0seUJBQXlCLFFBQVEscUJBQXFCO0FBQUEsSUFDdkU7QUFDQSxTQUFLLFdBQVcsSUFBSSxVQUFVLEtBQUs7QUFDbkMsV0FBTyxJQUFJLGFBQWEsV0FBVyxNQUFNLEtBQUssV0FBVyxPQUFPLFFBQVEsQ0FBQztBQUFBLEVBQzFFO0FBQ0Q7QUFFTyxNQUFNLHFCQUEwRTtBQUFBLEVBUXRGLFlBQ0MsYUFDaUIsbUJBQ0Esd0JBQ0EsaUJBQ0EsdUJBQ2hCO0FBSmdCO0FBQ0E7QUFDQTtBQUNBO0FBVGxCLFNBQWlCLG1CQUFtQixJQUFJLG9CQUFvQjtBQUU1RCxTQUFpQixhQUFhLElBQUksb0JBQW9CO0FBU3JELFNBQUssU0FBUyxZQUFZLFNBQVMsZ0JBQWdCLFlBQVksdUJBQXVCO0FBQUEsRUFDdkY7QUFBQSxFQUVPLDZCQUNOLFdBQ0EsVUFDQSxVQUNBLFNBQ29CO0FBQ3BCLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxRQUFJLDJCQUEyQixRQUFRLEdBQUc7QUFDekMsa0JBQVksSUFBSSxLQUFLLGlCQUFpQixnQkFBZ0IsVUFBVSxXQUFXLFFBQVEsQ0FBQztBQUNwRixXQUFLLE9BQU8sNEJBQTRCLGdCQUFnQixTQUFTLEdBQUcsVUFBVSxRQUFRLGtCQUFrQixDQUFDLEdBQUc7QUFBQSxRQUMzRyxjQUFjLENBQUMsQ0FBQyxTQUFTO0FBQUEsUUFDekIsb0JBQW9CLHFCQUFxQixXQUFXLG1CQUFtQixLQUFLLG1EQUFtRCxRQUFRO0FBQUEsUUFDdkksd0JBQXdCLHFCQUFxQixXQUFXLG1CQUFtQixLQUFLLHVEQUF1RCxRQUFRO0FBQUEsTUFDaEosR0FBRyxxQ0FBcUMsU0FBUyxDQUFDO0FBQUEsSUFDbkQsT0FBTztBQUNOLGtCQUFZLElBQUksS0FBSyxpQkFBaUIsa0JBQWtCLFVBQVUsV0FBVyxRQUFRLENBQUM7QUFDdEYsWUFBTSw0QkFBNEIscUJBQXFCLFdBQVcsbUJBQW1CO0FBRXJGLFVBQUksNENBQTRDLFFBQVEsR0FBRztBQUMxRCxvQkFBWSxJQUFJLFNBQVMsMEJBQTBCLE9BQUs7QUFDdkQsZ0JBQU0sUUFBUSxLQUFLLHVCQUF1QixVQUFVLEVBQUUsU0FBUyxHQUFHO0FBQ2xFLGNBQUksWUFBWSxDQUFDLEdBQUc7QUFDbkIsa0JBQU0sU0FBUyxNQUFNLFFBQVEsQ0FBQztBQUM5QixpQkFBSyxPQUFPLFdBQVcsRUFBRSxTQUFTLEtBQUssVUFBVSxRQUFRLEVBQUUsS0FBSztBQUFBLFVBQ2pFLE9BQU87QUFDTixpQkFBSyxPQUFPLGlCQUFpQixFQUFFLFNBQVMsS0FBSyxRQUFRO0FBQUEsVUFDdEQ7QUFBQSxRQUNELENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFFQSxXQUFLLE9BQU8sOEJBQThCLGdCQUFnQixTQUFTLEdBQUcsVUFBVSxRQUFRLGtCQUFrQixDQUFDLEdBQUc7QUFBQSxRQUM3RyxvQkFBb0IsNkJBQTZCLCtDQUErQyxRQUFRO0FBQUEsUUFDeEcsd0JBQXdCLDZCQUE2QixtREFBbUQsUUFBUTtBQUFBLE1BQ2pILEdBQUcsQ0FBQyxDQUFDLFFBQVEsb0NBQW9DLHFDQUFxQyxTQUFTLENBQUM7QUFBQSxJQUNqRztBQUVBLFdBQU8sYUFBYSxXQUFXO0FBQUEsTUFDOUI7QUFBQSxNQUNBLElBQUksYUFBYSxXQUFXLE1BQU07QUFDakMsYUFBSyxPQUFPLDBCQUEwQixRQUFRO0FBQUEsTUFDL0MsQ0FBQztBQUFBLElBQUM7QUFBQSxFQUNKO0FBQUEsRUFFQSxNQUFNLHNCQUFzQixVQUF5QixVQUFrQixVQUE4QixzQkFBNEMsY0FBaUM7QUFDakwsVUFBTSxRQUFRLEtBQUssaUJBQWlCLElBQUksUUFBUTtBQUNoRCxRQUFJLENBQUMsT0FBTztBQUNYLFlBQU0sSUFBSSxNQUFNLDBCQUEwQixRQUFRLEdBQUc7QUFBQSxJQUN0RDtBQUVBLFFBQUksTUFBTSxTQUFTLGdCQUF5QjtBQUMzQyxZQUFNLElBQUksTUFBTSw2QkFBNkIsUUFBUSxHQUFHO0FBQUEsSUFDekQ7QUFFQSxVQUFNLGtCQUFrQixJQUFJLE9BQU8sUUFBUTtBQUMzQyxVQUFNLFdBQVcsTUFBTSxNQUFNLFNBQVMsbUJBQW1CLGlCQUFpQixFQUFFLFVBQVUsc0JBQXNCLHNCQUFzQixPQUFPLEdBQUcsWUFBWTtBQUV4SixRQUFJO0FBQ0osUUFBSSw0Q0FBNEMsTUFBTSxRQUFRLEtBQUssS0FBSyx3QkFBd0I7QUFDL0Ysb0JBQWMsS0FBSyx1QkFBdUIsZUFBZSxNQUFNLFNBQVMsS0FBSyxLQUFLLHVCQUF1QixZQUFZLE1BQU0sU0FBUztBQUFBLElBQ3JJO0FBQ0EsU0FBSyxXQUFXLElBQUksVUFBVSxVQUFVLFdBQVc7QUFFbkQsV0FBTyxFQUFFLFVBQVUsNENBQTRDLE1BQU0sUUFBUSxFQUFFO0FBQUEsRUFDaEY7QUFBQSxFQUVBLE1BQU0sdUJBQXVCLFVBQXlCLFVBQWlDO0FBQ3RGLFVBQU0sUUFBUSxLQUFLLGlCQUFpQixJQUFJLFFBQVE7QUFDaEQsUUFBSSxDQUFDLE9BQU87QUFDWCxZQUFNLElBQUksTUFBTSwwQkFBMEIsUUFBUSxHQUFHO0FBQUEsSUFDdEQ7QUFFQSxRQUFJLE1BQU0sU0FBUyxnQkFBeUI7QUFDM0MsWUFBTSxJQUFJLE1BQU0sOEJBQThCLFFBQVEsR0FBRztBQUFBLElBQzFEO0FBRUEsVUFBTSxrQkFBa0IsSUFBSSxPQUFPLFFBQVE7QUFDM0MsVUFBTSxFQUFFLFNBQVMsSUFBSSxLQUFLLHVCQUF1QixVQUFVLGVBQWU7QUFHMUUsU0FBSyxXQUFXLE9BQU8sVUFBVSxlQUFlO0FBQ2hELGFBQVMsUUFBUTtBQUFBLEVBQ2xCO0FBQUEsRUFFQSxNQUFNLHFCQUNMLFVBQ0EsUUFDQSxVQUNBLFVBTUEsVUFDQSxjQUNnQjtBQUNoQixVQUFNLFFBQVEsS0FBSyxpQkFBaUIsSUFBSSxRQUFRO0FBQ2hELFFBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBTSxJQUFJLE1BQU0sMEJBQTBCLFFBQVEsR0FBRztBQUFBLElBQ3REO0FBRUEsVUFBTSxhQUFhLGVBQWUsV0FBVyxHQUFHLFFBQVE7QUFFeEQsVUFBTSxVQUFVLEtBQUssZ0JBQWdCLGlCQUFpQixRQUFRLFNBQVMsZ0JBQWdCLE1BQU0sU0FBUztBQUt0RyxTQUFLLGdCQUFnQiw0QkFBNEIsUUFBUSxTQUFTLGdCQUFnQixNQUFNLFNBQVM7QUFDakcsVUFBTSxRQUFRLEtBQUssc0JBQXNCLHNCQUFzQixRQUFRLFVBQVUsU0FBUyxPQUFPLFlBQVksU0FBUyxTQUFTLFNBQVMsU0FBUyxNQUFNO0FBRXZKLFVBQU0sa0JBQWtCLElBQUksT0FBTyxRQUFRO0FBRTNDLFlBQVEsTUFBTSxNQUFNO0FBQUEsTUFDbkIsS0FBSyxnQkFBeUI7QUFDN0IsY0FBTSxFQUFFLFNBQVMsSUFBSSxLQUFLLHVCQUF1QixVQUFVLGVBQWU7QUFDMUUsZUFBTyxNQUFNLFNBQVMsb0JBQW9CLFVBQVUsT0FBTyxZQUFZO0FBQUEsTUFDeEU7QUFBQSxNQUNBLEtBQUssY0FBdUI7QUFDM0IsY0FBTSxXQUFXLEtBQUssa0JBQWtCLFlBQVksZUFBZTtBQUNuRSxlQUFPLE1BQU0sU0FBUyx3QkFBd0IsVUFBVSxPQUFPLFlBQVk7QUFBQSxNQUM1RTtBQUFBLE1BQ0EsU0FBUztBQUNSLGNBQU0sSUFBSSxNQUFNLCtCQUErQjtBQUFBLE1BQ2hEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sK0JBQ0wsa0JBQ0Esa0JBQ0EsUUFDQSxVQUNBLFVBQ0EsVUFDQSxjQUNnQjtBQUNoQixVQUFNLEVBQUUsT0FBTyxNQUFNLElBQUksS0FBSyw0QkFBNEIsUUFBUSxVQUFVLFVBQVUsUUFBUTtBQUM5RixVQUFNLDBCQUEwQixJQUFJLE9BQU8sZ0JBQWdCO0FBQzNELFVBQU0sMEJBQTBCLElBQUksT0FBTyxnQkFBZ0I7QUFFM0QsUUFBSSxNQUFNLFNBQVMsY0FBdUI7QUFDekMsVUFBSSxDQUFDLG1EQUFtRCxNQUFNLFFBQVEsR0FBRztBQUN4RSxjQUFNLElBQUksTUFBTSxpQkFBaUIsUUFBUSxvREFBb0Q7QUFBQSxNQUM5RjtBQUVBLFlBQU1DLG9CQUFtQixLQUFLLGtCQUFrQixZQUFZLHVCQUF1QjtBQUNuRixZQUFNQyxvQkFBbUIsS0FBSyxrQkFBa0IsWUFBWSx1QkFBdUI7QUFDbkYsYUFBTyxNQUFNLFNBQVMsa0NBQWtDLEVBQUUsVUFBVUQsbUJBQWtCLFVBQVVDLGtCQUFpQixHQUFHLE9BQU8sWUFBWTtBQUFBLElBQ3hJO0FBRUEsUUFBSSxDQUFDLCtDQUErQyxNQUFNLFFBQVEsR0FBRztBQUNwRSxZQUFNLElBQUksTUFBTSxpQkFBaUIsUUFBUSwrQ0FBK0M7QUFBQSxJQUN6RjtBQUVBLFVBQU0sRUFBRSxVQUFVLGlCQUFpQixJQUFJLEtBQUssdUJBQXVCLFVBQVUsdUJBQXVCO0FBQ3BHLFVBQU0sRUFBRSxVQUFVLGlCQUFpQixJQUFJLEtBQUssdUJBQXVCLFVBQVUsdUJBQXVCO0FBQ3BHLFdBQU8sTUFBTSxTQUFTLDhCQUE4QixFQUFFLFVBQVUsa0JBQWtCLFVBQVUsaUJBQWlCLEdBQUcsT0FBTyxZQUFZO0FBQUEsRUFDcEk7QUFBQSxFQUVBLE1BQU0sbUNBQ0wsa0JBQ0Esa0JBQ0EsZ0JBQ0EsVUFDQSxVQUNBLFVBQ0EsY0FDZ0I7QUFDaEIsVUFBTSxFQUFFLE9BQU8sT0FBTyxjQUFjLElBQUksS0FBSyw0QkFBNEIsZUFBZSxVQUFVLFVBQVUsU0FBUyxVQUFVLFFBQVE7QUFDdkksVUFBTSxFQUFFLE9BQU8sY0FBYyxJQUFJLEtBQUssNEJBQTRCLGVBQWUsVUFBVSxVQUFVLFNBQVMsVUFBVSxRQUFRO0FBQ2hJLFVBQU0sMEJBQTBCLElBQUksT0FBTyxnQkFBZ0I7QUFDM0QsVUFBTSwwQkFBMEIsSUFBSSxPQUFPLGdCQUFnQjtBQUUzRCxRQUFJLE1BQU0sU0FBUyxjQUF1QjtBQUN6QyxVQUFJLENBQUMsdURBQXVELE1BQU0sUUFBUSxHQUFHO0FBQzVFLGNBQU0sSUFBSSxNQUFNLGlCQUFpQixRQUFRLDBEQUEwRDtBQUFBLE1BQ3BHO0FBRUEsWUFBTUQsb0JBQW1CLEtBQUssa0JBQWtCLFlBQVksdUJBQXVCO0FBQ25GLFlBQU1DLG9CQUFtQixLQUFLLGtCQUFrQixZQUFZLHVCQUF1QjtBQUNuRixhQUFPLE1BQU0sU0FBUyxzQ0FBc0MsRUFBRSxVQUFVRCxtQkFBa0IsVUFBVUMsa0JBQWlCLEdBQUcsRUFBRSxVQUFVLGVBQWUsVUFBVSxjQUFjLEdBQUcsWUFBWTtBQUFBLElBQzNMO0FBRUEsUUFBSSxDQUFDLG1EQUFtRCxNQUFNLFFBQVEsR0FBRztBQUN4RSxZQUFNLElBQUksTUFBTSxpQkFBaUIsUUFBUSxxREFBcUQ7QUFBQSxJQUMvRjtBQUVBLFVBQU0sRUFBRSxVQUFVLGlCQUFpQixJQUFJLEtBQUssdUJBQXVCLFVBQVUsdUJBQXVCO0FBQ3BHLFVBQU0sRUFBRSxVQUFVLGlCQUFpQixJQUFJLEtBQUssdUJBQXVCLFVBQVUsdUJBQXVCO0FBQ3BHLFdBQU8sTUFBTSxTQUFTLGtDQUFrQyxFQUFFLFVBQVUsa0JBQWtCLFVBQVUsaUJBQWlCLEdBQUcsRUFBRSxVQUFVLGVBQWUsVUFBVSxjQUFjLEdBQUcsWUFBWTtBQUFBLEVBQ3ZMO0FBQUEsRUFFUSw0QkFDUCxRQUNBLFVBQ0EsVUFDQSxVQUN1RDtBQUN2RCxVQUFNLFFBQVEsS0FBSyxpQkFBaUIsSUFBSSxRQUFRO0FBQ2hELFFBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBTSxJQUFJLE1BQU0sMEJBQTBCLFFBQVEsR0FBRztBQUFBLElBQ3REO0FBRUEsVUFBTSxhQUFhLGVBQWUsV0FBVyxHQUFHLFFBQVE7QUFDeEQsVUFBTSxVQUFVLEtBQUssZ0JBQWdCLGlCQUFpQixRQUFRLFNBQVMsZ0JBQWdCLE1BQU0sU0FBUztBQUN0RyxTQUFLLGdCQUFnQiw0QkFBNEIsUUFBUSxTQUFTLGdCQUFnQixNQUFNLFNBQVM7QUFDakcsVUFBTSxRQUFRLEtBQUssc0JBQXNCLHNCQUFzQixRQUFRLFVBQVUsU0FBUyxPQUFPLFlBQVksU0FBUyxTQUFTLFNBQVMsU0FBUyxNQUFNO0FBQ3ZKLFdBQU8sRUFBRSxPQUFPLE1BQU07QUFBQSxFQUN2QjtBQUFBLEVBRUEsY0FBYyxvQkFBbUMsVUFBa0IsU0FBeUI7QUFDM0YsVUFBTSxXQUFXLEtBQUssdUJBQXVCLFVBQVUsa0JBQWtCO0FBQ3pFLGFBQVMsYUFBYSxPQUFPO0FBQUEsRUFDOUI7QUFBQSxFQUVBLE1BQU0sb0JBQW9CLFFBQWdCLHVCQUFzQyxVQUFpQztBQUNoSCxVQUFNLFFBQVEsS0FBSyxpQkFBaUIsSUFBSSxRQUFRO0FBQ2hELFFBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBTSxJQUFJLE1BQU0sMEJBQTBCLFFBQVEsR0FBRztBQUFBLElBQ3REO0FBRUEsUUFBSSxDQUFFLE1BQU0sU0FBNkMsc0JBQXNCO0FBQzlFLFlBQU0sSUFBSSxNQUFNLHFDQUFxQyxRQUFRLEdBQUc7QUFBQSxJQUNqRTtBQUVBLFVBQU0sVUFBVSxLQUFLLHNCQUFzQixnQkFBZ0IsTUFBTTtBQUNqRSxRQUFJLENBQUMsU0FBUztBQUNiLFlBQU0sSUFBSSxNQUFNLGtCQUFrQjtBQUFBLElBQ25DO0FBRUEsVUFBTSxXQUFXLElBQUksT0FBTyxxQkFBcUI7QUFDakQsVUFBTSxXQUFXLEtBQUssa0JBQWtCLFlBQVksUUFBUTtBQUM1RCxVQUFPLE1BQU0sU0FBNkMscUJBQXNCLFVBQVUsU0FBUyxrQkFBa0IsSUFBSTtBQUFBLEVBQzFIO0FBQUEsRUFFQSxNQUFNLE1BQU0sb0JBQW1DLFVBQWtCLFFBQWdCLFNBQWlDO0FBQ2pILFVBQU0sUUFBUSxLQUFLLHVCQUF1QixVQUFVLGtCQUFrQjtBQUN0RSxXQUFPLE1BQU0sS0FBSyxRQUFRLE9BQU87QUFBQSxFQUNsQztBQUFBLEVBRUEsTUFBTSxNQUFNLG9CQUFtQyxVQUFrQixRQUFnQixTQUFpQztBQUNqSCxVQUFNLFFBQVEsS0FBSyx1QkFBdUIsVUFBVSxrQkFBa0I7QUFDdEUsV0FBTyxNQUFNLEtBQUssUUFBUSxPQUFPO0FBQUEsRUFDbEM7QUFBQSxFQUVBLE1BQU0sUUFBUSxvQkFBbUMsVUFBa0IsY0FBZ0Q7QUFDbEgsVUFBTSxRQUFRLEtBQUssdUJBQXVCLFVBQVUsa0JBQWtCO0FBQ3RFLFVBQU0sV0FBVyxLQUFLLHdCQUF3QixRQUFRO0FBQ3RELFVBQU0sU0FBUyxxQkFBcUIsTUFBTSxVQUFVLFlBQVk7QUFDaEUsVUFBTSxjQUFjO0FBQUEsRUFDckI7QUFBQSxFQUVBLE1BQU0sUUFBUSxvQkFBbUMsVUFBa0IsY0FBZ0Q7QUFDbEgsVUFBTSxRQUFRLEtBQUssdUJBQXVCLFVBQVUsa0JBQWtCO0FBQ3RFLFVBQU0sV0FBVyxLQUFLLHdCQUF3QixRQUFRO0FBQ3RELFVBQU0sU0FBUyxtQkFBbUIsTUFBTSxVQUFVLFlBQVk7QUFDOUQsVUFBTSxjQUFjO0FBQUEsRUFDckI7QUFBQSxFQUVBLE1BQU0sVUFBVSxvQkFBbUMsVUFBa0IsZ0JBQStCLGNBQWdEO0FBQ25KLFVBQU0sUUFBUSxLQUFLLHVCQUF1QixVQUFVLGtCQUFrQjtBQUN0RSxVQUFNLFdBQVcsS0FBSyx3QkFBd0IsUUFBUTtBQUN0RCxXQUFPLFNBQVMscUJBQXFCLE1BQU0sVUFBVSxJQUFJLE9BQU8sY0FBYyxHQUFHLFlBQVk7QUFBQSxFQUM5RjtBQUFBLEVBRUEsTUFBTSxRQUFRLG9CQUFtQyxVQUFrQixjQUFrRDtBQUNwSCxVQUFNLFFBQVEsS0FBSyx1QkFBdUIsVUFBVSxrQkFBa0I7QUFDdEUsVUFBTSxXQUFXLEtBQUssd0JBQXdCLFFBQVE7QUFFdEQsVUFBTSxTQUFTLE1BQU0sU0FBUyxxQkFBcUIsTUFBTSxVQUFVO0FBQUEsTUFDbEUsYUFBYSxNQUFNLGdCQUFnQjtBQUFBLElBQ3BDLEdBQUcsWUFBWTtBQUNmLFVBQU0sYUFBYSxNQUFNO0FBQ3pCLFdBQU8sT0FBTztBQUFBLEVBQ2Y7QUFBQSxFQUVRLHVCQUF1QixVQUFrQixVQUFtRDtBQUNuRyxVQUFNLFFBQVEsS0FBSyxXQUFXLElBQUksVUFBVSxJQUFJLE9BQU8sUUFBUSxDQUFDO0FBQ2hFLFFBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBTSxJQUFJLE1BQU0sMEJBQTBCO0FBQUEsSUFDM0M7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsd0JBQXdCLFVBQStDO0FBQzlFLFVBQU0sUUFBUSxLQUFLLGlCQUFpQixJQUFJLFFBQVE7QUFDaEQsVUFBTSxXQUFXLE9BQU87QUFDeEIsUUFBSSxDQUFDLFlBQVksQ0FBQyw0Q0FBNEMsUUFBUSxHQUFHO0FBQ3hFLFlBQU0sSUFBSSxNQUFNLGlDQUFpQztBQUFBLElBQ2xEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLFNBQVMsNENBQTRDLFVBQXdKO0FBQzVNLFNBQU8sQ0FBQyxDQUFFLFNBQXlDO0FBQ3BEO0FBRUEsU0FBUywyQkFBMkIsVUFBcUo7QUFDeEwsU0FBTyxPQUFRLFNBQTZDLDRCQUE0QjtBQUN6RjtBQUVBLFNBQVMsbURBQW1ELFVBQStLO0FBQzFPLFNBQU8sT0FBTyxTQUFTLHNDQUFzQztBQUM5RDtBQUVBLFNBQVMsdURBQXVELFVBQW1MO0FBQ2xQLFNBQU8sT0FBTyxTQUFTLDBDQUEwQztBQUNsRTtBQUVBLFNBQVMsK0NBQStDLFVBQXVMO0FBQzlPLFNBQU8sT0FBTyxTQUFTLGtDQUFrQztBQUMxRDtBQUVBLFNBQVMsbURBQW1ELFVBQTJMO0FBQ3RQLFNBQU8sT0FBTyxTQUFTLHNDQUFzQztBQUM5RDtBQUVBLFNBQVMsWUFBWSxHQUFrSDtBQUN0SSxTQUFPLE9BQVEsRUFBcUMsU0FBUyxjQUN6RCxPQUFRLEVBQXFDLFNBQVM7QUFDM0Q7QUFFQSxTQUFTLFNBQVMsVUFBdUI7QUFDeEMsUUFBTSxNQUFNLFNBQVMsV0FBVyxRQUFRLFFBQVEsU0FBUyxXQUFXLFFBQVEsV0FBVyxTQUFTLFNBQVMsU0FBUyxTQUFTO0FBQzNILFNBQU8sS0FBSyxHQUFHLElBQUk7QUFDcEI7IiwKICAibmFtZXMiOiBbIkN1c3RvbUVkaXRvclR5cGUiLCAib3JpZ2luYWxEb2N1bWVudCIsICJtb2RpZmllZERvY3VtZW50Il0KfQo=
