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
import { localize } from "../../../../nls.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { TextFileEditorModel } from "./textFileEditorModel.js";
import { dispose, Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IFileService, FileOperation, FileChangeType } from "../../../../platform/files/common/files.js";
import { Promises, ResourceQueue } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { TextFileSaveParticipant } from "./textFileSaveParticipant.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IWorkingCopyFileService } from "../../workingCopy/common/workingCopyFileService.js";
import { extname, joinPath } from "../../../../base/common/resources.js";
import { createTextBufferFactoryFromSnapshot } from "../../../../editor/common/model/textModel.js";
import { PLAINTEXT_EXTENSION, PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
let TextFileEditorModelManager = class extends Disposable {
  constructor(instantiationService, fileService, notificationService, workingCopyFileService, uriIdentityService) {
    super();
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    this.notificationService = notificationService;
    this.workingCopyFileService = workingCopyFileService;
    this.uriIdentityService = uriIdentityService;
    this._onDidCreate = this._register(new Emitter({
      leakWarningThreshold: 500,
      leakWarningName: "TextFileEditorModelManager._onDidCreate"
      /* increased for users with hundreds of inputs opened */
    }));
    this.onDidCreate = this._onDidCreate.event;
    this._onDidResolve = this._register(new Emitter());
    this.onDidResolve = this._onDidResolve.event;
    this._onDidRemove = this._register(new Emitter());
    this.onDidRemove = this._onDidRemove.event;
    this._onDidChangeDirty = this._register(new Emitter());
    this.onDidChangeDirty = this._onDidChangeDirty.event;
    this._onDidChangeReadonly = this._register(new Emitter());
    this.onDidChangeReadonly = this._onDidChangeReadonly.event;
    this._onDidChangeOrphaned = this._register(new Emitter());
    this.onDidChangeOrphaned = this._onDidChangeOrphaned.event;
    this._onDidSaveError = this._register(new Emitter());
    this.onDidSaveError = this._onDidSaveError.event;
    this._onDidSave = this._register(new Emitter());
    this.onDidSave = this._onDidSave.event;
    this._onDidRevert = this._register(new Emitter());
    this.onDidRevert = this._onDidRevert.event;
    this._onDidChangeEncoding = this._register(new Emitter());
    this.onDidChangeEncoding = this._onDidChangeEncoding.event;
    this.mapResourceToModel = new ResourceMap();
    this.mapResourceToModelListeners = new ResourceMap();
    this.mapResourceToDisposeListener = new ResourceMap();
    this.mapResourceToPendingModelResolvers = new ResourceMap();
    this.modelResolveQueue = this._register(new ResourceQueue());
    this.saveErrorHandler = (() => {
      const notificationService = this.notificationService;
      return {
        onSaveError(error, model) {
          notificationService.error(localize({ key: "genericSaveError", comment: ["{0} is the resource that failed to save and {1} the error message"] }, "Failed to save '{0}': {1}", model.name, toErrorMessage(error, false)));
        }
      };
    })();
    this.mapCorrelationIdToModelsToRestore = /* @__PURE__ */ new Map();
    this.saveParticipants = this._register(this.instantiationService.createInstance(TextFileSaveParticipant));
    this.registerListeners();
  }
  get models() {
    return [...this.mapResourceToModel.values()];
  }
  registerListeners() {
    this._register(this.fileService.onDidFilesChange((e) => this.onDidFilesChange(e)));
    this._register(this.fileService.onDidChangeFileSystemProviderCapabilities((e) => this.onDidChangeFileSystemProviderCapabilities(e)));
    this._register(this.fileService.onDidChangeFileSystemProviderRegistrations((e) => this.onDidChangeFileSystemProviderRegistrations(e)));
    this._register(this.workingCopyFileService.onWillRunWorkingCopyFileOperation((e) => this.onWillRunWorkingCopyFileOperation(e)));
    this._register(this.workingCopyFileService.onDidFailWorkingCopyFileOperation((e) => this.onDidFailWorkingCopyFileOperation(e)));
    this._register(this.workingCopyFileService.onDidRunWorkingCopyFileOperation((e) => this.onDidRunWorkingCopyFileOperation(e)));
  }
  onDidFilesChange(e) {
    for (const model of this.models) {
      if (model.isDirty()) {
        continue;
      }
      if (e.contains(model.resource, FileChangeType.UPDATED, FileChangeType.ADDED)) {
        this.queueModelReload(model);
      }
    }
  }
  onDidChangeFileSystemProviderCapabilities(e) {
    this.queueModelReloads(e.scheme);
  }
  onDidChangeFileSystemProviderRegistrations(e) {
    if (!e.added) {
      return;
    }
    this.queueModelReloads(e.scheme);
  }
  queueModelReloads(scheme) {
    for (const model of this.models) {
      if (model.isDirty()) {
        continue;
      }
      if (scheme === model.resource.scheme) {
        this.queueModelReload(model);
      }
    }
  }
  queueModelReload(model) {
    const queueSize = this.modelResolveQueue.queueSize(model.resource);
    if (queueSize <= 1) {
      this.modelResolveQueue.queueFor(model.resource, async () => {
        try {
          await this.reload(model);
        } catch (error) {
          onUnexpectedError(error);
        }
      });
    }
  }
  onWillRunWorkingCopyFileOperation(e) {
    if (e.operation === FileOperation.MOVE || e.operation === FileOperation.COPY) {
      const modelsToRestore = [];
      for (const { source, target } of e.files) {
        if (source) {
          if (this.uriIdentityService.extUri.isEqual(source, target)) {
            continue;
          }
          const sourceModels = [];
          for (const model of this.models) {
            if (this.uriIdentityService.extUri.isEqualOrParent(model.resource, source)) {
              sourceModels.push(model);
            }
          }
          for (const sourceModel of sourceModels) {
            const sourceModelResource = sourceModel.resource;
            let targetModelResource;
            if (this.uriIdentityService.extUri.isEqual(sourceModelResource, source)) {
              targetModelResource = target;
            } else {
              targetModelResource = joinPath(target, sourceModelResource.path.substr(source.path.length + 1));
            }
            const languageId = sourceModel.getLanguageId();
            modelsToRestore.push({
              source: sourceModelResource,
              target: targetModelResource,
              language: languageId ? {
                id: languageId,
                explicit: sourceModel.languageChangeSource === "user"
              } : void 0,
              encoding: sourceModel.getEncoding(),
              snapshot: sourceModel.isDirty() ? sourceModel.createSnapshot() : void 0
            });
          }
        }
      }
      this.mapCorrelationIdToModelsToRestore.set(e.correlationId, modelsToRestore);
    }
  }
  onDidFailWorkingCopyFileOperation(e) {
    if (e.operation === FileOperation.MOVE || e.operation === FileOperation.COPY) {
      const modelsToRestore = this.mapCorrelationIdToModelsToRestore.get(e.correlationId);
      if (modelsToRestore) {
        this.mapCorrelationIdToModelsToRestore.delete(e.correlationId);
        modelsToRestore.forEach((model) => {
          if (model.snapshot) {
            this.get(model.source)?.setDirty(true);
          }
        });
      }
    }
  }
  onDidRunWorkingCopyFileOperation(e) {
    switch (e.operation) {
      // Create: Revert existing models
      case FileOperation.CREATE:
        e.waitUntil((async () => {
          for (const { target } of e.files) {
            const model = this.get(target);
            if (model && !model.isDisposed()) {
              await model.revert();
            }
          }
        })());
        break;
      // Move/Copy: restore models that were resolved before the operation took place
      case FileOperation.MOVE:
      case FileOperation.COPY:
        e.waitUntil((async () => {
          const modelsToRestore = this.mapCorrelationIdToModelsToRestore.get(e.correlationId);
          if (modelsToRestore) {
            this.mapCorrelationIdToModelsToRestore.delete(e.correlationId);
            await Promises.settled(modelsToRestore.map(async (modelToRestore) => {
              const target = this.uriIdentityService.asCanonicalUri(modelToRestore.target);
              const restoredModel = await this.resolve(target, {
                reload: { async: false },
                // enforce a reload
                contents: modelToRestore.snapshot ? createTextBufferFactoryFromSnapshot(modelToRestore.snapshot) : void 0,
                encoding: modelToRestore.encoding
              });
              if (modelToRestore.language?.id && modelToRestore.language.id !== PLAINTEXT_LANGUAGE_ID) {
                if (modelToRestore.language.explicit) {
                  restoredModel.setLanguageId(modelToRestore.language.id);
                } else if (restoredModel.getLanguageId() === PLAINTEXT_LANGUAGE_ID && extname(target) !== PLAINTEXT_EXTENSION) {
                  restoredModel.updateTextEditorModel(void 0, modelToRestore.language.id);
                }
              }
            }));
          }
        })());
        break;
    }
  }
  get(resource) {
    return this.mapResourceToModel.get(resource);
  }
  has(resource) {
    return this.mapResourceToModel.has(resource);
  }
  async reload(model) {
    await this.joinPendingResolves(model.resource);
    if (model.isDirty() || model.isDisposed() || !this.has(model.resource)) {
      return;
    }
    await this.doResolve(model, { reload: { async: false } });
  }
  async resolve(resource, options) {
    const pendingResolve = this.joinPendingResolves(resource);
    if (pendingResolve) {
      await pendingResolve;
    }
    return this.doResolve(resource, options);
  }
  async doResolve(resourceOrModel, options) {
    let model;
    let resource;
    if (URI.isUri(resourceOrModel)) {
      resource = resourceOrModel;
      model = this.get(resource);
    } else {
      resource = resourceOrModel.resource;
      model = resourceOrModel;
    }
    let modelResolve;
    let didCreateModel = false;
    if (model) {
      if (options?.contents) {
        modelResolve = model.resolve(options);
      } else if (options?.reload) {
        if (options.reload.async) {
          modelResolve = Promise.resolve();
          (async () => {
            try {
              await model.resolve(options);
            } catch (error) {
              if (!model.isDisposed()) {
                onUnexpectedError(error);
              }
            }
          })();
        } else {
          modelResolve = model.resolve(options);
        }
      } else {
        modelResolve = Promise.resolve();
      }
    } else {
      didCreateModel = true;
      const newModel = model = this.instantiationService.createInstance(TextFileEditorModel, resource, options ? options.encoding : void 0, options ? options.languageId : void 0);
      modelResolve = model.resolve(options);
      this.registerModel(newModel);
    }
    this.mapResourceToPendingModelResolvers.set(resource, modelResolve);
    this.add(resource, model);
    if (didCreateModel) {
      this._onDidCreate.fire(model);
      if (model.isDirty()) {
        this._onDidChangeDirty.fire(model);
      }
    }
    try {
      await modelResolve;
    } catch (error) {
      if (didCreateModel) {
        model.dispose();
      }
      throw error;
    } finally {
      this.mapResourceToPendingModelResolvers.delete(resource);
    }
    if (options?.languageId) {
      model.setLanguageId(options.languageId);
    }
    if (didCreateModel && model.isDirty()) {
      this._onDidChangeDirty.fire(model);
    }
    return model;
  }
  joinPendingResolves(resource) {
    const pendingModelResolve = this.mapResourceToPendingModelResolvers.get(resource);
    if (!pendingModelResolve) {
      return;
    }
    return this.doJoinPendingResolves(resource);
  }
  async doJoinPendingResolves(resource) {
    let currentModelCopyResolve;
    while (this.mapResourceToPendingModelResolvers.has(resource)) {
      const nextPendingModelResolve = this.mapResourceToPendingModelResolvers.get(resource);
      if (nextPendingModelResolve === currentModelCopyResolve) {
        return;
      }
      currentModelCopyResolve = nextPendingModelResolve;
      try {
        await nextPendingModelResolve;
      } catch (error) {
      }
    }
  }
  registerModel(model) {
    const modelListeners = new DisposableStore();
    modelListeners.add(model.onDidResolve((reason) => this._onDidResolve.fire({ model, reason })));
    modelListeners.add(model.onDidChangeDirty(() => this._onDidChangeDirty.fire(model)));
    modelListeners.add(model.onDidChangeReadonly(() => this._onDidChangeReadonly.fire(model)));
    modelListeners.add(model.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire(model)));
    modelListeners.add(model.onDidSaveError(() => this._onDidSaveError.fire(model)));
    modelListeners.add(model.onDidSave((e) => this._onDidSave.fire({ model, ...e })));
    modelListeners.add(model.onDidRevert(() => this._onDidRevert.fire(model)));
    modelListeners.add(model.onDidChangeEncoding(() => this._onDidChangeEncoding.fire(model)));
    this.mapResourceToModelListeners.set(model.resource, modelListeners);
  }
  add(resource, model) {
    const knownModel = this.mapResourceToModel.get(resource);
    if (knownModel === model) {
      return;
    }
    const disposeListener = this.mapResourceToDisposeListener.get(resource);
    disposeListener?.dispose();
    this.mapResourceToModel.set(resource, model);
    this.mapResourceToDisposeListener.set(resource, model.onWillDispose(() => this.remove(resource)));
  }
  remove(resource) {
    const removed = this.mapResourceToModel.delete(resource);
    const disposeListener = this.mapResourceToDisposeListener.get(resource);
    if (disposeListener) {
      dispose(disposeListener);
      this.mapResourceToDisposeListener.delete(resource);
    }
    const modelListener = this.mapResourceToModelListeners.get(resource);
    if (modelListener) {
      dispose(modelListener);
      this.mapResourceToModelListeners.delete(resource);
    }
    if (removed) {
      this._onDidRemove.fire(resource);
    }
  }
  addSaveParticipant(participant) {
    return this.saveParticipants.addSaveParticipant(participant);
  }
  runSaveParticipants(model, context, progress, token) {
    return this.saveParticipants.participate(model, context, progress, token);
  }
  //#endregion
  canDispose(model) {
    if (model.isDisposed() || !this.mapResourceToPendingModelResolvers.has(model.resource) && !model.isDirty()) {
      return true;
    }
    return this.doCanDispose(model);
  }
  async doCanDispose(model) {
    const pendingResolve = this.joinPendingResolves(model.resource);
    if (pendingResolve) {
      await pendingResolve;
      return this.canDispose(model);
    }
    if (model.isDirty()) {
      await Event.toPromise(model.onDidChangeDirty);
      return this.canDispose(model);
    }
    return true;
  }
  dispose() {
    super.dispose();
    this.mapResourceToModel.clear();
    this.mapResourceToPendingModelResolvers.clear();
    dispose(this.mapResourceToDisposeListener.values());
    this.mapResourceToDisposeListener.clear();
    dispose(this.mapResourceToModelListeners.values());
    this.mapResourceToModelListeners.clear();
  }
};
TextFileEditorModelManager = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IFileService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IWorkingCopyFileService),
  __decorateParam(4, IUriIdentityService)
], TextFileEditorModelManager);
export {
  TextFileEditorModelManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBUZXh0RmlsZUVkaXRvck1vZGVsIH0gZnJvbSAnLi90ZXh0RmlsZUVkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IGRpc3Bvc2UsIElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlRWRpdG9yTW9kZWwsIElUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlciwgSVRleHRGaWxlRWRpdG9yTW9kZWxSZXNvbHZlT3JDcmVhdGVPcHRpb25zLCBJVGV4dEZpbGVSZXNvbHZlRXZlbnQsIElUZXh0RmlsZVNhdmVFdmVudCwgSVRleHRGaWxlU2F2ZVBhcnRpY2lwYW50IH0gZnJvbSAnLi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIEZpbGVDaGFuZ2VzRXZlbnQsIEZpbGVPcGVyYXRpb24sIEZpbGVDaGFuZ2VUeXBlLCBJRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9uRXZlbnQsIElGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXNDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgUmVzb3VyY2VRdWV1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFRleHRGaWxlU2F2ZVBhcnRpY2lwYW50IH0gZnJvbSAnLi90ZXh0RmlsZVNhdmVQYXJ0aWNpcGFudC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnRDb250ZXh0LCBJV29ya2luZ0NvcHlGaWxlU2VydmljZSwgV29ya2luZ0NvcHlGaWxlRXZlbnQgfSBmcm9tICcuLi8uLi93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dFNuYXBzaG90IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBleHRuYW1lLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeUZyb21TbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9FWFRFTlNJT04sIFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3MsIElQcm9ncmVzc1N0ZXAgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuXG5pbnRlcmZhY2UgSVRleHRGaWxlRWRpdG9yTW9kZWxUb1Jlc3RvcmUge1xuXHRyZWFkb25seSBzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgdGFyZ2V0OiBVUkk7XG5cdHJlYWRvbmx5IHNuYXBzaG90PzogSVRleHRTbmFwc2hvdDtcblx0cmVhZG9ubHkgbGFuZ3VhZ2U/OiB7XG5cdFx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0XHRyZWFkb25seSBleHBsaWNpdDogYm9vbGVhbjtcblx0fTtcblx0cmVhZG9ubHkgZW5jb2Rpbmc/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ3JlYXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VGV4dEZpbGVFZGl0b3JNb2RlbD4oeyBsZWFrV2FybmluZ1RocmVzaG9sZDogNTAwLCBsZWFrV2FybmluZ05hbWU6ICdUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlci5fb25EaWRDcmVhdGUnIC8qIGluY3JlYXNlZCBmb3IgdXNlcnMgd2l0aCBodW5kcmVkcyBvZiBpbnB1dHMgb3BlbmVkICovIH0pKTtcblx0cmVhZG9ubHkgb25EaWRDcmVhdGUgPSB0aGlzLl9vbkRpZENyZWF0ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlc29sdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGV4dEZpbGVSZXNvbHZlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlc29sdmUgPSB0aGlzLl9vbkRpZFJlc29sdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW1vdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVUkk+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZSA9IHRoaXMuX29uRGlkUmVtb3ZlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGlydHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxUZXh0RmlsZUVkaXRvck1vZGVsPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEaXJ0eSA9IHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZWFkb25seSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFRleHRGaWxlRWRpdG9yTW9kZWw+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlYWRvbmx5ID0gdGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU9ycGhhbmVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VGV4dEZpbGVFZGl0b3JNb2RlbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlT3JwaGFuZWQgPSB0aGlzLl9vbkRpZENoYW5nZU9ycGhhbmVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2F2ZUVycm9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VGV4dEZpbGVFZGl0b3JNb2RlbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2F2ZUVycm9yID0gdGhpcy5fb25EaWRTYXZlRXJyb3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTYXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRleHRGaWxlU2F2ZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTYXZlID0gdGhpcy5fb25EaWRTYXZlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmV2ZXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VGV4dEZpbGVFZGl0b3JNb2RlbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmV2ZXJ0ID0gdGhpcy5fb25EaWRSZXZlcnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VFbmNvZGluZyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFRleHRGaWxlRWRpdG9yTW9kZWw+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUVuY29kaW5nID0gdGhpcy5fb25EaWRDaGFuZ2VFbmNvZGluZy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1hcFJlc291cmNlVG9Nb2RlbCA9IG5ldyBSZXNvdXJjZU1hcDxUZXh0RmlsZUVkaXRvck1vZGVsPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1hcFJlc291cmNlVG9Nb2RlbExpc3RlbmVycyA9IG5ldyBSZXNvdXJjZU1hcDxJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBtYXBSZXNvdXJjZVRvRGlzcG9zZUxpc3RlbmVyID0gbmV3IFJlc291cmNlTWFwPElEaXNwb3NhYmxlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1hcFJlc291cmNlVG9QZW5kaW5nTW9kZWxSZXNvbHZlcnMgPSBuZXcgUmVzb3VyY2VNYXA8UHJvbWlzZTx2b2lkPj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsUmVzb2x2ZVF1ZXVlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJlc291cmNlUXVldWUoKSk7XG5cblx0c2F2ZUVycm9ySGFuZGxlciA9ICgoKSA9PiB7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IHRoaXMubm90aWZpY2F0aW9uU2VydmljZTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRvblNhdmVFcnJvcihlcnJvcjogRXJyb3IsIG1vZGVsOiBJVGV4dEZpbGVFZGl0b3JNb2RlbCk6IHZvaWQge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKHsga2V5OiAnZ2VuZXJpY1NhdmVFcnJvcicsIGNvbW1lbnQ6IFsnezB9IGlzIHRoZSByZXNvdXJjZSB0aGF0IGZhaWxlZCB0byBzYXZlIGFuZCB7MX0gdGhlIGVycm9yIG1lc3NhZ2UnXSB9LCBcIkZhaWxlZCB0byBzYXZlICd7MH0nOiB7MX1cIiwgbW9kZWwubmFtZSwgdG9FcnJvck1lc3NhZ2UoZXJyb3IsIGZhbHNlKSkpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH0pKCk7XG5cblx0Z2V0IG1vZGVscygpOiBUZXh0RmlsZUVkaXRvck1vZGVsW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5tYXBSZXNvdXJjZVRvTW9kZWwudmFsdWVzKCldO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0NvcHlGaWxlU2VydmljZTogSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuc2F2ZVBhcnRpY2lwYW50cyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVTYXZlUGFydGljaXBhbnQpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBVcGRhdGUgbW9kZWxzIGZyb20gZmlsZSBjaGFuZ2UgZXZlbnRzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4gdGhpcy5vbkRpZEZpbGVzQ2hhbmdlKGUpKSk7XG5cblx0XHQvLyBGaWxlIHN5c3RlbSBwcm92aWRlciBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyhlID0+IHRoaXMub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9ucyhlID0+IHRoaXMub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zKGUpKSk7XG5cblx0XHQvLyBXb3JraW5nIGNvcHkgb3BlcmF0aW9uc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2luZ0NvcHlGaWxlU2VydmljZS5vbldpbGxSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSA9PiB0aGlzLm9uV2lsbFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2luZ0NvcHlGaWxlU2VydmljZS5vbkRpZEZhaWxXb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSA9PiB0aGlzLm9uRGlkRmFpbFdvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2luZ0NvcHlGaWxlU2VydmljZS5vbkRpZFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlID0+IHRoaXMub25EaWRSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRGaWxlc0NoYW5nZShlOiBGaWxlQ2hhbmdlc0V2ZW50KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBtb2RlbCBvZiB0aGlzLm1vZGVscykge1xuXHRcdFx0aWYgKG1vZGVsLmlzRGlydHkoKSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gbmV2ZXIgcmVsb2FkIGRpcnR5IG1vZGVsc1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUcmlnZ2VyIGEgbW9kZWwgcmVzb2x2ZSBmb3IgYW55IHVwZGF0ZSBvciBhZGQgZXZlbnQgdGhhdCBpbXBhY3RzXG5cdFx0XHQvLyB0aGUgbW9kZWwuIFdlIGFsc28gY29uc2lkZXIgdGhlIGFkZGVkIGV2ZW50IGJlY2F1c2UgaXQgY291bGRcblx0XHRcdC8vIGJlIHRoYXQgYSBmaWxlIHdhcyBhZGRlZCBhbmQgdXBkYXRlZCByaWdodCBhZnRlci5cblx0XHRcdGlmIChlLmNvbnRhaW5zKG1vZGVsLnJlc291cmNlLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVELCBGaWxlQ2hhbmdlVHlwZS5BRERFRCkpIHtcblx0XHRcdFx0dGhpcy5xdWV1ZU1vZGVsUmVsb2FkKG1vZGVsKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzKGU6IElGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXNDaGFuZ2VFdmVudCk6IHZvaWQge1xuXG5cdFx0Ly8gUmVzb2x2ZSBtb2RlbHMgYWdhaW4gZm9yIGZpbGUgc3lzdGVtcyB0aGF0IGNoYW5nZWRcblx0XHQvLyBjYXBhYmlsaXRpZXMgdG8gZmV0Y2ggbGF0ZXN0IG1ldGFkYXRhIChlLmcuIHJlYWRvbmx5KVxuXHRcdC8vIGludG8gYWxsIG1vZGVscy5cblx0XHR0aGlzLnF1ZXVlTW9kZWxSZWxvYWRzKGUuc2NoZW1lKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zKGU6IElGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25FdmVudCk6IHZvaWQge1xuXHRcdGlmICghZS5hZGRlZCkge1xuXHRcdFx0cmV0dXJuOyAvLyBvbmx5IGlmIGFkZGVkXG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSBtb2RlbHMgYWdhaW4gZm9yIGZpbGUgc3lzdGVtcyB0aGF0IHJlZ2lzdGVyZWRcblx0XHQvLyB0byBhY2NvdW50IGZvciBjYXBhYmlsaXR5IGNoYW5nZXM6IGV4dGVuc2lvbnMgbWF5XG5cdFx0Ly8gdW5yZWdpc3RlciBhbmQgcmVnaXN0ZXIgdGhlIHNhbWUgcHJvdmlkZXIgd2l0aCBkaWZmZXJlbnRcblx0XHQvLyBjYXBhYmlsaXRpZXMsIHNvIHdlIHdhbnQgdG8gZW5zdXJlIHRvIGZldGNoIGxhdGVzdFxuXHRcdC8vIG1ldGFkYXRhIChlLmcuIHJlYWRvbmx5KSBpbnRvIGFsbCBtb2RlbHMuXG5cdFx0dGhpcy5xdWV1ZU1vZGVsUmVsb2FkcyhlLnNjaGVtZSk7XG5cdH1cblxuXHRwcml2YXRlIHF1ZXVlTW9kZWxSZWxvYWRzKHNjaGVtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBtb2RlbCBvZiB0aGlzLm1vZGVscykge1xuXHRcdFx0aWYgKG1vZGVsLmlzRGlydHkoKSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gbmV2ZXIgcmVsb2FkIGRpcnR5IG1vZGVsc1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2NoZW1lID09PSBtb2RlbC5yZXNvdXJjZS5zY2hlbWUpIHtcblx0XHRcdFx0dGhpcy5xdWV1ZU1vZGVsUmVsb2FkKG1vZGVsKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHF1ZXVlTW9kZWxSZWxvYWQobW9kZWw6IFRleHRGaWxlRWRpdG9yTW9kZWwpOiB2b2lkIHtcblxuXHRcdC8vIFJlc29sdmUgbW9kZWwgdG8gdXBkYXRlICh1c2UgYSBxdWV1ZSB0byBwcmV2ZW50IGFjY3VtdWxhdGlvbiBvZiByZXNvbHZlc1xuXHRcdC8vIHdoZW4gdGhlIHJlc29sdmUgYWN0dWFsbHkgdGFrZXMgbG9uZy4gQXQgbW9zdCB3ZSBvbmx5IHdhbnQgdGhlIHF1ZXVlXG5cdFx0Ly8gdG8gaGF2ZSBhIHNpemUgb2YgMiAoMSBydW5uaW5nIHJlc29sdmUgYW5kIDEgcXVldWVkIHJlc29sdmUpLlxuXHRcdGNvbnN0IHF1ZXVlU2l6ZSA9IHRoaXMubW9kZWxSZXNvbHZlUXVldWUucXVldWVTaXplKG1vZGVsLnJlc291cmNlKTtcblx0XHRpZiAocXVldWVTaXplIDw9IDEpIHtcblx0XHRcdHRoaXMubW9kZWxSZXNvbHZlUXVldWUucXVldWVGb3IobW9kZWwucmVzb3VyY2UsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlbG9hZChtb2RlbCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IG1hcENvcnJlbGF0aW9uSWRUb01vZGVsc1RvUmVzdG9yZSA9IG5ldyBNYXA8bnVtYmVyLCBJVGV4dEZpbGVFZGl0b3JNb2RlbFRvUmVzdG9yZVtdPigpO1xuXG5cdHByaXZhdGUgb25XaWxsUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGU6IFdvcmtpbmdDb3B5RmlsZUV2ZW50KTogdm9pZCB7XG5cblx0XHQvLyBNb3ZlIC8gQ29weTogcmVtZW1iZXIgbW9kZWxzIHRvIHJlc3RvcmUgYWZ0ZXIgdGhlIG9wZXJhdGlvblxuXHRcdGlmIChlLm9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5NT1ZFIHx8IGUub3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLkNPUFkpIHtcblx0XHRcdGNvbnN0IG1vZGVsc1RvUmVzdG9yZTogSVRleHRGaWxlRWRpdG9yTW9kZWxUb1Jlc3RvcmVbXSA9IFtdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHsgc291cmNlLCB0YXJnZXQgfSBvZiBlLmZpbGVzKSB7XG5cdFx0XHRcdGlmIChzb3VyY2UpIHtcblx0XHRcdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoc291cmNlLCB0YXJnZXQpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gaWdub3JlIGlmIHJlc291cmNlcyBhcmUgY29uc2lkZXJlZCBlcXVhbFxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIGZpbmQgYWxsIG1vZGVscyB0aGF0IHJlbGF0ZWQgdG8gc291cmNlIChjYW4gYmUgbWFueSBpZiByZXNvdXJjZSBpcyBhIGZvbGRlcilcblx0XHRcdFx0XHRjb25zdCBzb3VyY2VNb2RlbHM6IFRleHRGaWxlRWRpdG9yTW9kZWxbXSA9IFtdO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgbW9kZWwgb2YgdGhpcy5tb2RlbHMpIHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KG1vZGVsLnJlc291cmNlLCBzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdHNvdXJjZU1vZGVscy5wdXNoKG1vZGVsKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyByZW1lbWJlciBlYWNoIHNvdXJjZSBtb2RlbCB0byByZXNvbHZlIGFnYWluIGFmdGVyIG1vdmUgaXMgZG9uZVxuXHRcdFx0XHRcdC8vIHdpdGggb3B0aW9uYWwgY29udGVudCB0byByZXN0b3JlIGlmIGl0IHdhcyBkaXJ0eVxuXHRcdFx0XHRcdGZvciAoY29uc3Qgc291cmNlTW9kZWwgb2Ygc291cmNlTW9kZWxzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzb3VyY2VNb2RlbFJlc291cmNlID0gc291cmNlTW9kZWwucmVzb3VyY2U7XG5cblx0XHRcdFx0XHRcdC8vIElmIHRoZSBzb3VyY2UgaXMgdGhlIGFjdHVhbCBtb2RlbCwganVzdCB1c2UgdGFyZ2V0IGFzIG5ldyByZXNvdXJjZVxuXHRcdFx0XHRcdFx0bGV0IHRhcmdldE1vZGVsUmVzb3VyY2U6IFVSSTtcblx0XHRcdFx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChzb3VyY2VNb2RlbFJlc291cmNlLCBzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdHRhcmdldE1vZGVsUmVzb3VyY2UgPSB0YXJnZXQ7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIE90aGVyd2lzZSBhIHBhcmVudCBmb2xkZXIgb2YgdGhlIHNvdXJjZSBpcyBiZWluZyBtb3ZlZCwgc28gd2UgbmVlZFxuXHRcdFx0XHRcdFx0Ly8gdG8gY29tcHV0ZSB0aGUgdGFyZ2V0IHJlc291cmNlIGJhc2VkIG9uIHRoYXRcblx0XHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0YXJnZXRNb2RlbFJlc291cmNlID0gam9pblBhdGgodGFyZ2V0LCBzb3VyY2VNb2RlbFJlc291cmNlLnBhdGguc3Vic3RyKHNvdXJjZS5wYXRoLmxlbmd0aCArIDEpKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHNvdXJjZU1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRcdFx0XHRcdG1vZGVsc1RvUmVzdG9yZS5wdXNoKHtcblx0XHRcdFx0XHRcdFx0c291cmNlOiBzb3VyY2VNb2RlbFJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHR0YXJnZXQ6IHRhcmdldE1vZGVsUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdGxhbmd1YWdlOiBsYW5ndWFnZUlkID8ge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBsYW5ndWFnZUlkLFxuXHRcdFx0XHRcdFx0XHRcdGV4cGxpY2l0OiBzb3VyY2VNb2RlbC5sYW5ndWFnZUNoYW5nZVNvdXJjZSA9PT0gJ3VzZXInXG5cdFx0XHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGVuY29kaW5nOiBzb3VyY2VNb2RlbC5nZXRFbmNvZGluZygpLFxuXHRcdFx0XHRcdFx0XHRzbmFwc2hvdDogc291cmNlTW9kZWwuaXNEaXJ0eSgpID8gc291cmNlTW9kZWwuY3JlYXRlU25hcHNob3QoKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubWFwQ29ycmVsYXRpb25JZFRvTW9kZWxzVG9SZXN0b3JlLnNldChlLmNvcnJlbGF0aW9uSWQsIG1vZGVsc1RvUmVzdG9yZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZEZhaWxXb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZTogV29ya2luZ0NvcHlGaWxlRXZlbnQpOiB2b2lkIHtcblxuXHRcdC8vIE1vdmUgLyBDb3B5OiByZXN0b3JlIGRpcnR5IGZsYWcgb24gbW9kZWxzIHRvIHJlc3RvcmUgdGhhdCB3ZXJlIGRpcnR5XG5cdFx0aWYgKChlLm9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5NT1ZFIHx8IGUub3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLkNPUFkpKSB7XG5cdFx0XHRjb25zdCBtb2RlbHNUb1Jlc3RvcmUgPSB0aGlzLm1hcENvcnJlbGF0aW9uSWRUb01vZGVsc1RvUmVzdG9yZS5nZXQoZS5jb3JyZWxhdGlvbklkKTtcblx0XHRcdGlmIChtb2RlbHNUb1Jlc3RvcmUpIHtcblx0XHRcdFx0dGhpcy5tYXBDb3JyZWxhdGlvbklkVG9Nb2RlbHNUb1Jlc3RvcmUuZGVsZXRlKGUuY29ycmVsYXRpb25JZCk7XG5cblx0XHRcdFx0bW9kZWxzVG9SZXN0b3JlLmZvckVhY2gobW9kZWwgPT4ge1xuXHRcdFx0XHRcdC8vIHNuYXBzaG90IHByZXNlbmNlIG1lYW5zIHRoaXMgbW9kZWwgdXNlZCB0byBiZSBkaXJ0eSBhbmQgc28gd2UgcmVzdG9yZSB0aGF0XG5cdFx0XHRcdFx0Ly8gZmxhZy4gd2UgZG8gTk9UIGhhdmUgdG8gcmVzdG9yZSB0aGUgY29udGVudCBiZWNhdXNlIHRoZSBtb2RlbCB3YXMgb25seSBzb2Z0XG5cdFx0XHRcdFx0Ly8gcmV2ZXJ0ZWQgYW5kIGRpZCBub3QgbG9vc2UgaXRzIG9yaWdpbmFsIGRpcnR5IGNvbnRlbnRzLlxuXHRcdFx0XHRcdGlmIChtb2RlbC5zbmFwc2hvdCkge1xuXHRcdFx0XHRcdFx0dGhpcy5nZXQobW9kZWwuc291cmNlKT8uc2V0RGlydHkodHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGU6IFdvcmtpbmdDb3B5RmlsZUV2ZW50KTogdm9pZCB7XG5cdFx0c3dpdGNoIChlLm9wZXJhdGlvbikge1xuXG5cdFx0XHQvLyBDcmVhdGU6IFJldmVydCBleGlzdGluZyBtb2RlbHNcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvbi5DUkVBVEU6XG5cdFx0XHRcdGUud2FpdFVudGlsKChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB7IHRhcmdldCB9IG9mIGUuZmlsZXMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5nZXQodGFyZ2V0KTtcblx0XHRcdFx0XHRcdGlmIChtb2RlbCAmJiAhbW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IG1vZGVsLnJldmVydCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkoKSk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHQvLyBNb3ZlL0NvcHk6IHJlc3RvcmUgbW9kZWxzIHRoYXQgd2VyZSByZXNvbHZlZCBiZWZvcmUgdGhlIG9wZXJhdGlvbiB0b29rIHBsYWNlXG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb24uTU9WRTpcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvbi5DT1BZOlxuXHRcdFx0XHRlLndhaXRVbnRpbCgoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsc1RvUmVzdG9yZSA9IHRoaXMubWFwQ29ycmVsYXRpb25JZFRvTW9kZWxzVG9SZXN0b3JlLmdldChlLmNvcnJlbGF0aW9uSWQpO1xuXHRcdFx0XHRcdGlmIChtb2RlbHNUb1Jlc3RvcmUpIHtcblx0XHRcdFx0XHRcdHRoaXMubWFwQ29ycmVsYXRpb25JZFRvTW9kZWxzVG9SZXN0b3JlLmRlbGV0ZShlLmNvcnJlbGF0aW9uSWQpO1xuXG5cdFx0XHRcdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKG1vZGVsc1RvUmVzdG9yZS5tYXAoYXN5bmMgbW9kZWxUb1Jlc3RvcmUgPT4ge1xuXG5cdFx0XHRcdFx0XHRcdC8vIEZyb20gdGhpcyBtb21lbnQgb24sIG9ubHkgb3BlcmF0ZSBvbiB0aGUgY2Fub25pY2FsIHJlc291cmNlXG5cdFx0XHRcdFx0XHRcdC8vIHRvIGZpeCBhIHBvdGVudGlhbCBkYXRhIGxvc3MgaXNzdWU6XG5cdFx0XHRcdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMTEzNzRcblx0XHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuYXNDYW5vbmljYWxVcmkobW9kZWxUb1Jlc3RvcmUudGFyZ2V0KTtcblxuXHRcdFx0XHRcdFx0XHQvLyByZXN0b3JlIHRoZSBtb2RlbCBhdCB0aGUgdGFyZ2V0LiBpZiB3ZSBoYXZlIHByZXZpb3VzIGRpcnR5IGNvbnRlbnQsIHdlIHBhc3MgaXRcblx0XHRcdFx0XHRcdFx0Ly8gb3ZlciB0byBiZSB1c2VkLCBvdGhlcndpc2Ugd2UgZm9yY2UgYSByZWxvYWQgZnJvbSBkaXNrLiB0aGlzIGlzIGltcG9ydGFudFxuXHRcdFx0XHRcdFx0XHQvLyBiZWNhdXNlIHdlIGtub3cgdGhlIGZpbGUgaGFzIGNoYW5nZWQgb24gZGlzayBhZnRlciB0aGUgbW92ZSBhbmQgdGhlIG1vZGVsIG1pZ2h0XG5cdFx0XHRcdFx0XHRcdC8vIGhhdmUgc3RpbGwgZXhpc3RlZCB3aXRoIHRoZSBwcmV2aW91cyBzdGF0ZS4gdGhpcyBlbnN1cmVzIHRoYXQgdGhlIG1vZGVsIGlzIG5vdFxuXHRcdFx0XHRcdFx0XHQvLyB0cmFja2luZyBhIHN0YWxlIHN0YXRlLlxuXHRcdFx0XHRcdFx0XHRjb25zdCByZXN0b3JlZE1vZGVsID0gYXdhaXQgdGhpcy5yZXNvbHZlKHRhcmdldCwge1xuXHRcdFx0XHRcdFx0XHRcdHJlbG9hZDogeyBhc3luYzogZmFsc2UgfSwgLy8gZW5mb3JjZSBhIHJlbG9hZFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBtb2RlbFRvUmVzdG9yZS5zbmFwc2hvdCA/IGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVNuYXBzaG90KG1vZGVsVG9SZXN0b3JlLnNuYXBzaG90KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRlbmNvZGluZzogbW9kZWxUb1Jlc3RvcmUuZW5jb2Rpbmdcblx0XHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdFx0Ly8gcmVzdG9yZSBtb2RlbCBsYW5ndWFnZSBvbmx5IGlmIGl0IGlzIHNwZWNpZmljXG5cdFx0XHRcdFx0XHRcdGlmIChtb2RlbFRvUmVzdG9yZS5sYW5ndWFnZT8uaWQgJiYgbW9kZWxUb1Jlc3RvcmUubGFuZ3VhZ2UuaWQgIT09IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCkge1xuXG5cdFx0XHRcdFx0XHRcdFx0Ly8gYW4gZXhwbGljaXRseSBzZXQgbGFuZ3VhZ2UgaXMgcmVzdG9yZWQgdmlhIGBzZXRMYW5ndWFnZUlkYFxuXHRcdFx0XHRcdFx0XHRcdC8vIHRvIHByZXNlcnZlIGl0IGFzIGV4cGxpY2l0bHkgc2V0IGJ5IHRoZSB1c2VyLlxuXHRcdFx0XHRcdFx0XHRcdC8vIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjAzNjQ4KVxuXHRcdFx0XHRcdFx0XHRcdGlmIChtb2RlbFRvUmVzdG9yZS5sYW5ndWFnZS5leHBsaWNpdCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmVzdG9yZWRNb2RlbC5zZXRMYW5ndWFnZUlkKG1vZGVsVG9SZXN0b3JlLmxhbmd1YWdlLmlkKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHQvLyBvdGhlcndpc2UsIGEgbW9kZWwgbGFuZ3VhZ2UgaXMgYXBwbGllZCB2aWEgbG93ZXIgbGV2ZWxcblx0XHRcdFx0XHRcdFx0XHQvLyBBUElzIHRvIG5vdCBjb25mdXNlIGl0IHdpdGggYW4gZXhwbGljaXRseSBzZXQgbGFuZ3VhZ2UuXG5cdFx0XHRcdFx0XHRcdFx0Ly8gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjU3OTUpXG5cdFx0XHRcdFx0XHRcdFx0ZWxzZSBpZiAocmVzdG9yZWRNb2RlbC5nZXRMYW5ndWFnZUlkKCkgPT09IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCAmJiBleHRuYW1lKHRhcmdldCkgIT09IFBMQUlOVEVYVF9FWFRFTlNJT04pIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJlc3RvcmVkTW9kZWwudXBkYXRlVGV4dEVkaXRvck1vZGVsKHVuZGVmaW5lZCwgbW9kZWxUb1Jlc3RvcmUubGFuZ3VhZ2UuaWQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkoKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdGdldChyZXNvdXJjZTogVVJJKTogVGV4dEZpbGVFZGl0b3JNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubWFwUmVzb3VyY2VUb01vZGVsLmdldChyZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIGhhcyhyZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubWFwUmVzb3VyY2VUb01vZGVsLmhhcyhyZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbG9hZChtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gQXdhaXQgYSBwZW5kaW5nIG1vZGVsIHJlc29sdmUgZmlyc3QgYmVmb3JlIHByb2NlZWRpbmdcblx0XHQvLyB0byBlbnN1cmUgdGhhdCB3ZSBuZXZlciByZXNvbHZlIGEgbW9kZWwgbW9yZSB0aGFuIG9uY2Vcblx0XHQvLyBpbiBwYXJhbGxlbC5cblx0XHRhd2FpdCB0aGlzLmpvaW5QZW5kaW5nUmVzb2x2ZXMobW9kZWwucmVzb3VyY2UpO1xuXG5cdFx0aWYgKG1vZGVsLmlzRGlydHkoKSB8fCBtb2RlbC5pc0Rpc3Bvc2VkKCkgfHwgIXRoaXMuaGFzKG1vZGVsLnJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuOyAvLyB0aGUgbW9kZWwgcG9zc2libHkgZ290IGRpcnR5IG9yIGRpc3Bvc2VkLCBzbyByZXR1cm4gZWFybHkgdGhlblxuXHRcdH1cblxuXHRcdC8vIFRyaWdnZXIgcmVsb2FkXG5cdFx0YXdhaXQgdGhpcy5kb1Jlc29sdmUobW9kZWwsIHsgcmVsb2FkOiB7IGFzeW5jOiBmYWxzZSB9IH0pO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVRleHRGaWxlRWRpdG9yTW9kZWxSZXNvbHZlT3JDcmVhdGVPcHRpb25zKTogUHJvbWlzZTxUZXh0RmlsZUVkaXRvck1vZGVsPiB7XG5cblx0XHQvLyBBd2FpdCBhIHBlbmRpbmcgbW9kZWwgcmVzb2x2ZSBmaXJzdCBiZWZvcmUgcHJvY2VlZGluZ1xuXHRcdC8vIHRvIGVuc3VyZSB0aGF0IHdlIG5ldmVyIHJlc29sdmUgYSBtb2RlbCBtb3JlIHRoYW4gb25jZVxuXHRcdC8vIGluIHBhcmFsbGVsLlxuXHRcdGNvbnN0IHBlbmRpbmdSZXNvbHZlID0gdGhpcy5qb2luUGVuZGluZ1Jlc29sdmVzKHJlc291cmNlKTtcblx0XHRpZiAocGVuZGluZ1Jlc29sdmUpIHtcblx0XHRcdGF3YWl0IHBlbmRpbmdSZXNvbHZlO1xuXHRcdH1cblxuXHRcdC8vIFRyaWdnZXIgcmVzb2x2ZVxuXHRcdHJldHVybiB0aGlzLmRvUmVzb2x2ZShyZXNvdXJjZSwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVzb2x2ZShyZXNvdXJjZU9yTW9kZWw6IFVSSSB8IFRleHRGaWxlRWRpdG9yTW9kZWwsIG9wdGlvbnM/OiBJVGV4dEZpbGVFZGl0b3JNb2RlbFJlc29sdmVPckNyZWF0ZU9wdGlvbnMpOiBQcm9taXNlPFRleHRGaWxlRWRpdG9yTW9kZWw+IHtcblx0XHRsZXQgbW9kZWw6IFRleHRGaWxlRWRpdG9yTW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHJlc291cmNlOiBVUkk7XG5cdFx0aWYgKFVSSS5pc1VyaShyZXNvdXJjZU9yTW9kZWwpKSB7XG5cdFx0XHRyZXNvdXJjZSA9IHJlc291cmNlT3JNb2RlbDtcblx0XHRcdG1vZGVsID0gdGhpcy5nZXQocmVzb3VyY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNvdXJjZSA9IHJlc291cmNlT3JNb2RlbC5yZXNvdXJjZTtcblx0XHRcdG1vZGVsID0gcmVzb3VyY2VPck1vZGVsO1xuXHRcdH1cblxuXHRcdGxldCBtb2RlbFJlc29sdmU6IFByb21pc2U8dm9pZD47XG5cdFx0bGV0IGRpZENyZWF0ZU1vZGVsID0gZmFsc2U7XG5cblx0XHQvLyBNb2RlbCBleGlzdHNcblx0XHRpZiAobW9kZWwpIHtcblxuXHRcdFx0Ly8gQWx3YXlzIHJlbG9hZCBpZiBjb250ZW50cyBhcmUgcHJvdmlkZWRcblx0XHRcdGlmIChvcHRpb25zPy5jb250ZW50cykge1xuXHRcdFx0XHRtb2RlbFJlc29sdmUgPSBtb2RlbC5yZXNvbHZlKG9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZWxvYWQgYXN5bmMgb3Igc3luYyBiYXNlZCBvbiBvcHRpb25zXG5cdFx0XHRlbHNlIGlmIChvcHRpb25zPy5yZWxvYWQpIHtcblxuXHRcdFx0XHQvLyBhc3luYyByZWxvYWQ6IHRyaWdnZXIgYSByZWxvYWQgYnV0IHJldHVybiBpbW1lZGlhdGVseVxuXHRcdFx0XHRpZiAob3B0aW9ucy5yZWxvYWQuYXN5bmMpIHtcblx0XHRcdFx0XHRtb2RlbFJlc29sdmUgPSBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgbW9kZWwucmVzb2x2ZShvcHRpb25zKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghbW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpOyAvLyBvbmx5IGxvZyBpZiB0aGUgbW9kZWwgaXMgc3RpbGwgYXJvdW5kXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gc3luYyByZWxvYWQ6IGRvIG5vdCByZXR1cm4gdW50aWwgbW9kZWwgcmVsb2FkZWRcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0bW9kZWxSZXNvbHZlID0gbW9kZWwucmVzb2x2ZShvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBEbyBub3QgcmVsb2FkXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0bW9kZWxSZXNvbHZlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTW9kZWwgZG9lcyBub3QgZXhpc3Rcblx0XHRlbHNlIHtcblx0XHRcdGRpZENyZWF0ZU1vZGVsID0gdHJ1ZTtcblxuXHRcdFx0Y29uc3QgbmV3TW9kZWwgPSBtb2RlbCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgcmVzb3VyY2UsIG9wdGlvbnMgPyBvcHRpb25zLmVuY29kaW5nIDogdW5kZWZpbmVkLCBvcHRpb25zID8gb3B0aW9ucy5sYW5ndWFnZUlkIDogdW5kZWZpbmVkKTtcblx0XHRcdG1vZGVsUmVzb2x2ZSA9IG1vZGVsLnJlc29sdmUob3B0aW9ucyk7XG5cblx0XHRcdHRoaXMucmVnaXN0ZXJNb2RlbChuZXdNb2RlbCk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RvcmUgcGVuZGluZyByZXNvbHZlcyB0byBhdm9pZCByYWNlIGNvbmRpdGlvbnNcblx0XHR0aGlzLm1hcFJlc291cmNlVG9QZW5kaW5nTW9kZWxSZXNvbHZlcnMuc2V0KHJlc291cmNlLCBtb2RlbFJlc29sdmUpO1xuXG5cdFx0Ly8gTWFrZSBrbm93biB0byBtYW5hZ2VyIChpZiBub3QgYWxyZWFkeSBrbm93bilcblx0XHR0aGlzLmFkZChyZXNvdXJjZSwgbW9kZWwpO1xuXG5cdFx0Ly8gRW1pdCBzb21lIGV2ZW50cyBpZiB3ZSBjcmVhdGVkIHRoZSBtb2RlbFxuXHRcdGlmIChkaWRDcmVhdGVNb2RlbCkge1xuXHRcdFx0dGhpcy5fb25EaWRDcmVhdGUuZmlyZShtb2RlbCk7XG5cblx0XHRcdC8vIElmIHRoZSBtb2RlbCBpcyBkaXJ0eSByaWdodCBmcm9tIHRoZSBiZWdpbm5pbmcsXG5cdFx0XHQvLyBtYWtlIHN1cmUgdG8gZW1pdCB0aGlzIGFzIGFuIGV2ZW50XG5cdFx0XHRpZiAobW9kZWwuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZShtb2RlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IG1vZGVsUmVzb2x2ZTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHQvLyBBdXRvbWF0aWNhbGx5IGRpc3Bvc2UgdGhlIG1vZGVsIGlmIHdlIGNyZWF0ZWQgaXRcblx0XHRcdC8vIGJlY2F1c2Ugd2UgY2Fubm90IGRpc3Bvc2UgYSBtb2RlbCB3ZSBkbyBub3Qgb3duXG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM4ODUwXG5cdFx0XHRpZiAoZGlkQ3JlYXRlTW9kZWwpIHtcblx0XHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9IGZpbmFsbHkge1xuXG5cdFx0XHQvLyBSZW1vdmUgZnJvbSBwZW5kaW5nIHJlc29sdmVzXG5cdFx0XHR0aGlzLm1hcFJlc291cmNlVG9QZW5kaW5nTW9kZWxSZXNvbHZlcnMuZGVsZXRlKHJlc291cmNlKTtcblx0XHR9XG5cblx0XHQvLyBBcHBseSBsYW5ndWFnZSBpZiBwcm92aWRlZFxuXHRcdGlmIChvcHRpb25zPy5sYW5ndWFnZUlkKSB7XG5cdFx0XHRtb2RlbC5zZXRMYW5ndWFnZUlkKG9wdGlvbnMubGFuZ3VhZ2VJZCk7XG5cdFx0fVxuXG5cdFx0Ly8gTW9kZWwgY2FuIGJlIGRpcnR5IGlmIGEgYmFja3VwIHdhcyByZXN0b3JlZCwgc28gd2UgbWFrZSBzdXJlIHRvXG5cdFx0Ly8gaGF2ZSB0aGlzIGV2ZW50IGRlbGl2ZXJlZCBpZiB3ZSBjcmVhdGVkIHRoZSBtb2RlbCBoZXJlXG5cdFx0aWYgKGRpZENyZWF0ZU1vZGVsICYmIG1vZGVsLmlzRGlydHkoKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKG1vZGVsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIGpvaW5QZW5kaW5nUmVzb2x2ZXMocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHBlbmRpbmdNb2RlbFJlc29sdmUgPSB0aGlzLm1hcFJlc291cmNlVG9QZW5kaW5nTW9kZWxSZXNvbHZlcnMuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAoIXBlbmRpbmdNb2RlbFJlc29sdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kb0pvaW5QZW5kaW5nUmVzb2x2ZXMocmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0pvaW5QZW5kaW5nUmVzb2x2ZXMocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gV2hpbGUgd2UgaGF2ZSBwZW5kaW5nIG1vZGVsIHJlc29sdmVzLCBlbnN1cmVcblx0XHQvLyB0byBhd2FpdCB0aGUgbGFzdCBvbmUgZmluaXNoaW5nIGJlZm9yZSByZXR1cm5pbmcuXG5cdFx0Ly8gVGhpcyBwcmV2ZW50cyBhIHJhY2Ugd2hlbiBtdWx0aXBsZSBjbGllbnRzIGF3YWl0XG5cdFx0Ly8gdGhlIHBlbmRpbmcgcmVzb2x2ZSBhbmQgdGhlbiBhbGwgdHJpZ2dlciB0aGUgcmVzb2x2ZVxuXHRcdC8vIGF0IHRoZSBzYW1lIHRpbWUuXG5cdFx0bGV0IGN1cnJlbnRNb2RlbENvcHlSZXNvbHZlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRcdHdoaWxlICh0aGlzLm1hcFJlc291cmNlVG9QZW5kaW5nTW9kZWxSZXNvbHZlcnMuaGFzKHJlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgbmV4dFBlbmRpbmdNb2RlbFJlc29sdmUgPSB0aGlzLm1hcFJlc291cmNlVG9QZW5kaW5nTW9kZWxSZXNvbHZlcnMuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmIChuZXh0UGVuZGluZ01vZGVsUmVzb2x2ZSA9PT0gY3VycmVudE1vZGVsQ29weVJlc29sdmUpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBhbHJlYWR5IGF3YWl0ZWQgb24gLSByZXR1cm5cblx0XHRcdH1cblxuXHRcdFx0Y3VycmVudE1vZGVsQ29weVJlc29sdmUgPSBuZXh0UGVuZGluZ01vZGVsUmVzb2x2ZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IG5leHRQZW5kaW5nTW9kZWxSZXNvbHZlO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gaWdub3JlIGFueSBlcnJvciBoZXJlLCBpdCB3aWxsIGJ1YmJsZSB0byB0aGUgb3JpZ2luYWwgcmVxdWVzdG9yXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck1vZGVsKG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsKTogdm9pZCB7XG5cblx0XHQvLyBJbnN0YWxsIG1vZGVsIGxpc3RlbmVyc1xuXHRcdGNvbnN0IG1vZGVsTGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdG1vZGVsTGlzdGVuZXJzLmFkZChtb2RlbC5vbkRpZFJlc29sdmUocmVhc29uID0+IHRoaXMuX29uRGlkUmVzb2x2ZS5maXJlKHsgbW9kZWwsIHJlYXNvbiB9KSkpO1xuXHRcdG1vZGVsTGlzdGVuZXJzLmFkZChtb2RlbC5vbkRpZENoYW5nZURpcnR5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZShtb2RlbCkpKTtcblx0XHRtb2RlbExpc3RlbmVycy5hZGQobW9kZWwub25EaWRDaGFuZ2VSZWFkb25seSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVJlYWRvbmx5LmZpcmUobW9kZWwpKSk7XG5cdFx0bW9kZWxMaXN0ZW5lcnMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlT3JwaGFuZWQoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VPcnBoYW5lZC5maXJlKG1vZGVsKSkpO1xuXHRcdG1vZGVsTGlzdGVuZXJzLmFkZChtb2RlbC5vbkRpZFNhdmVFcnJvcigoKSA9PiB0aGlzLl9vbkRpZFNhdmVFcnJvci5maXJlKG1vZGVsKSkpO1xuXHRcdG1vZGVsTGlzdGVuZXJzLmFkZChtb2RlbC5vbkRpZFNhdmUoZSA9PiB0aGlzLl9vbkRpZFNhdmUuZmlyZSh7IG1vZGVsLCAuLi5lIH0pKSk7XG5cdFx0bW9kZWxMaXN0ZW5lcnMuYWRkKG1vZGVsLm9uRGlkUmV2ZXJ0KCgpID0+IHRoaXMuX29uRGlkUmV2ZXJ0LmZpcmUobW9kZWwpKSk7XG5cdFx0bW9kZWxMaXN0ZW5lcnMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlRW5jb2RpbmcoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VFbmNvZGluZy5maXJlKG1vZGVsKSkpO1xuXG5cdFx0Ly8gS2VlcCBmb3IgZGlzcG9zYWxcblx0XHR0aGlzLm1hcFJlc291cmNlVG9Nb2RlbExpc3RlbmVycy5zZXQobW9kZWwucmVzb3VyY2UsIG1vZGVsTGlzdGVuZXJzKTtcblx0fVxuXG5cdGFkZChyZXNvdXJjZTogVVJJLCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCk6IHZvaWQge1xuXHRcdGNvbnN0IGtub3duTW9kZWwgPSB0aGlzLm1hcFJlc291cmNlVG9Nb2RlbC5nZXQocmVzb3VyY2UpO1xuXHRcdGlmIChrbm93bk1vZGVsID09PSBtb2RlbCkge1xuXHRcdFx0cmV0dXJuOyAvLyBhbHJlYWR5IGNhY2hlZFxuXHRcdH1cblxuXHRcdC8vIGRpc3Bvc2UgYW55IHByZXZpb3VzbHkgc3RvcmVkIGRpc3Bvc2UgbGlzdGVuZXIgZm9yIHRoaXMgcmVzb3VyY2Vcblx0XHRjb25zdCBkaXNwb3NlTGlzdGVuZXIgPSB0aGlzLm1hcFJlc291cmNlVG9EaXNwb3NlTGlzdGVuZXIuZ2V0KHJlc291cmNlKTtcblx0XHRkaXNwb3NlTGlzdGVuZXI/LmRpc3Bvc2UoKTtcblxuXHRcdC8vIHN0b3JlIGluIGNhY2hlIGJ1dCByZW1vdmUgd2hlbiBtb2RlbCBnZXRzIGRpc3Bvc2VkXG5cdFx0dGhpcy5tYXBSZXNvdXJjZVRvTW9kZWwuc2V0KHJlc291cmNlLCBtb2RlbCk7XG5cdFx0dGhpcy5tYXBSZXNvdXJjZVRvRGlzcG9zZUxpc3RlbmVyLnNldChyZXNvdXJjZSwgbW9kZWwub25XaWxsRGlzcG9zZSgoKSA9PiB0aGlzLnJlbW92ZShyZXNvdXJjZSkpKTtcblx0fVxuXG5cdHJlbW92ZShyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IHRoaXMubWFwUmVzb3VyY2VUb01vZGVsLmRlbGV0ZShyZXNvdXJjZSk7XG5cblx0XHRjb25zdCBkaXNwb3NlTGlzdGVuZXIgPSB0aGlzLm1hcFJlc291cmNlVG9EaXNwb3NlTGlzdGVuZXIuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAoZGlzcG9zZUxpc3RlbmVyKSB7XG5cdFx0XHRkaXNwb3NlKGRpc3Bvc2VMaXN0ZW5lcik7XG5cdFx0XHR0aGlzLm1hcFJlc291cmNlVG9EaXNwb3NlTGlzdGVuZXIuZGVsZXRlKHJlc291cmNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbExpc3RlbmVyID0gdGhpcy5tYXBSZXNvdXJjZVRvTW9kZWxMaXN0ZW5lcnMuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAobW9kZWxMaXN0ZW5lcikge1xuXHRcdFx0ZGlzcG9zZShtb2RlbExpc3RlbmVyKTtcblx0XHRcdHRoaXMubWFwUmVzb3VyY2VUb01vZGVsTGlzdGVuZXJzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlbW92ZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlLmZpcmUocmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdC8vI3JlZ2lvbiBTYXZlIHBhcnRpY2lwYW50c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2F2ZVBhcnRpY2lwYW50czogVGV4dEZpbGVTYXZlUGFydGljaXBhbnQ7XG5cblx0YWRkU2F2ZVBhcnRpY2lwYW50KHBhcnRpY2lwYW50OiBJVGV4dEZpbGVTYXZlUGFydGljaXBhbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuc2F2ZVBhcnRpY2lwYW50cy5hZGRTYXZlUGFydGljaXBhbnQocGFydGljaXBhbnQpO1xuXHR9XG5cblx0cnVuU2F2ZVBhcnRpY2lwYW50cyhtb2RlbDogSVRleHRGaWxlRWRpdG9yTW9kZWwsIGNvbnRleHQ6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnRDb250ZXh0LCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zYXZlUGFydGljaXBhbnRzLnBhcnRpY2lwYXRlKG1vZGVsLCBjb250ZXh0LCBwcm9ncmVzcywgdG9rZW4pO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Y2FuRGlzcG9zZShtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCk6IHRydWUgfCBQcm9taXNlPHRydWU+IHtcblxuXHRcdC8vIHF1aWNrIHJldHVybiBpZiBtb2RlbCBhbHJlYWR5IGRpc3Bvc2VkIG9yIG5vdCBkaXJ0eSBhbmQgbm90IHJlc29sdmluZ1xuXHRcdGlmIChcblx0XHRcdG1vZGVsLmlzRGlzcG9zZWQoKSB8fFxuXHRcdFx0KCF0aGlzLm1hcFJlc291cmNlVG9QZW5kaW5nTW9kZWxSZXNvbHZlcnMuaGFzKG1vZGVsLnJlc291cmNlKSAmJiAhbW9kZWwuaXNEaXJ0eSgpKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gcHJvbWlzZSBiYXNlZCByZXR1cm4gaW4gYWxsIG90aGVyIGNhc2VzXG5cdFx0cmV0dXJuIHRoaXMuZG9DYW5EaXNwb3NlKG1vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9DYW5EaXNwb3NlKG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsKTogUHJvbWlzZTx0cnVlPiB7XG5cblx0XHQvLyBBd2FpdCBhbnkgcGVuZGluZyByZXNvbHZlcyBmaXJzdCBiZWZvcmUgcHJvY2VlZGluZ1xuXHRcdGNvbnN0IHBlbmRpbmdSZXNvbHZlID0gdGhpcy5qb2luUGVuZGluZ1Jlc29sdmVzKG1vZGVsLnJlc291cmNlKTtcblx0XHRpZiAocGVuZGluZ1Jlc29sdmUpIHtcblx0XHRcdGF3YWl0IHBlbmRpbmdSZXNvbHZlO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5jYW5EaXNwb3NlKG1vZGVsKTtcblx0XHR9XG5cblx0XHQvLyBkaXJ0eSBtb2RlbDogd2UgZG8gbm90IGFsbG93IHRvIGRpc3Bvc2UgZGlydHkgbW9kZWxzIHRvIHByZXZlbnRcblx0XHQvLyBkYXRhIGxvc3MgY2FzZXMuIGRpcnR5IG1vZGVscyBjYW4gb25seSBiZSBkaXNwb3NlZCB3aGVuIHRoZXkgYXJlXG5cdFx0Ly8gZWl0aGVyIHNhdmVkIG9yIHJldmVydGVkXG5cdFx0aWYgKG1vZGVsLmlzRGlydHkoKSkge1xuXHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKG1vZGVsLm9uRGlkQ2hhbmdlRGlydHkpO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5jYW5EaXNwb3NlKG1vZGVsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gbW9kZWwgY2FjaGVzXG5cdFx0dGhpcy5tYXBSZXNvdXJjZVRvTW9kZWwuY2xlYXIoKTtcblx0XHR0aGlzLm1hcFJlc291cmNlVG9QZW5kaW5nTW9kZWxSZXNvbHZlcnMuY2xlYXIoKTtcblxuXHRcdC8vIGRpc3Bvc2UgdGhlIGRpc3Bvc2UgbGlzdGVuZXJzXG5cdFx0ZGlzcG9zZSh0aGlzLm1hcFJlc291cmNlVG9EaXNwb3NlTGlzdGVuZXIudmFsdWVzKCkpO1xuXHRcdHRoaXMubWFwUmVzb3VyY2VUb0Rpc3Bvc2VMaXN0ZW5lci5jbGVhcigpO1xuXG5cdFx0Ly8gZGlzcG9zZSB0aGUgbW9kZWwgY2hhbmdlIGxpc3RlbmVyc1xuXHRcdGRpc3Bvc2UodGhpcy5tYXBSZXNvdXJjZVRvTW9kZWxMaXN0ZW5lcnMudmFsdWVzKCkpO1xuXHRcdHRoaXMubWFwUmVzb3VyY2VUb01vZGVsTGlzdGVuZXJzLmNsZWFyKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsU0FBc0IsWUFBWSx1QkFBdUI7QUFFbEUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxjQUFnQyxlQUFlLHNCQUF3RztBQUNoSyxTQUFTLFVBQVUscUJBQXFCO0FBQ3hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQXVELCtCQUFxRDtBQUU1RyxTQUFTLFNBQVMsZ0JBQWdCO0FBQ2xDLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLDJCQUEyQjtBQWM3QixJQUFNLDZCQUFOLGNBQXlDLFdB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
