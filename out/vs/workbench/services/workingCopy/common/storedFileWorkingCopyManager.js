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
import { DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { StoredFileWorkingCopy, StoredFileWorkingCopyState } from "./storedFileWorkingCopy.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { Promises, ResourceQueue } from "../../../../base/common/async.js";
import { FileChangeType, FileOperation, IFileService } from "../../../../platform/files/common/files.js";
import { ILifecycleService } from "../../lifecycle/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { joinPath } from "../../../../base/common/resources.js";
import { IWorkingCopyFileService } from "./workingCopyFileService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { IWorkingCopyBackupService } from "./workingCopyBackup.js";
import { BaseFileWorkingCopyManager } from "./abstractFileWorkingCopyManager.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IElevatedFileService } from "../../files/common/elevatedFileService.js";
import { IFilesConfigurationService } from "../../filesConfiguration/common/filesConfigurationService.js";
import { IWorkingCopyEditorService } from "./workingCopyEditorService.js";
import { IWorkingCopyService } from "./workingCopyService.js";
import { isWeb } from "../../../../base/common/platform.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { SnapshotContext } from "./fileWorkingCopy.js";
import { IProgressService } from "../../../../platform/progress/common/progress.js";
let StoredFileWorkingCopyManager = class extends BaseFileWorkingCopyManager {
  constructor(workingCopyTypeId, modelFactory, fileService, lifecycleService, labelService, logService, workingCopyFileService, workingCopyBackupService, uriIdentityService, filesConfigurationService, workingCopyService, notificationService, workingCopyEditorService, editorService, elevatedFileService, progressService) {
    super(fileService, logService, workingCopyBackupService);
    this.workingCopyTypeId = workingCopyTypeId;
    this.modelFactory = modelFactory;
    this.lifecycleService = lifecycleService;
    this.labelService = labelService;
    this.workingCopyFileService = workingCopyFileService;
    this.uriIdentityService = uriIdentityService;
    this.filesConfigurationService = filesConfigurationService;
    this.workingCopyService = workingCopyService;
    this.notificationService = notificationService;
    this.workingCopyEditorService = workingCopyEditorService;
    this.editorService = editorService;
    this.elevatedFileService = elevatedFileService;
    this.progressService = progressService;
    //#region Events
    this._onDidResolve = this._register(new Emitter());
    this.onDidResolve = this._onDidResolve.event;
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
    this._onDidRemove = this._register(new Emitter());
    this.onDidRemove = this._onDidRemove.event;
    //#endregion
    this.mapResourceToWorkingCopyListeners = new ResourceMap();
    this.mapResourceToPendingWorkingCopyResolve = new ResourceMap();
    this.workingCopyResolveQueue = this._register(new ResourceQueue());
    //#endregion
    //#region Working Copy File Events
    this.mapCorrelationIdToWorkingCopiesToRestore = /* @__PURE__ */ new Map();
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.fileService.onDidFilesChange((e) => this.onDidFilesChange(e)));
    this._register(this.fileService.onDidChangeFileSystemProviderCapabilities((e) => this.onDidChangeFileSystemProviderCapabilities(e)));
    this._register(this.fileService.onDidChangeFileSystemProviderRegistrations((e) => this.onDidChangeFileSystemProviderRegistrations(e)));
    this._register(this.workingCopyFileService.onWillRunWorkingCopyFileOperation((e) => this.onWillRunWorkingCopyFileOperation(e)));
    this._register(this.workingCopyFileService.onDidFailWorkingCopyFileOperation((e) => this.onDidFailWorkingCopyFileOperation(e)));
    this._register(this.workingCopyFileService.onDidRunWorkingCopyFileOperation((e) => this.onDidRunWorkingCopyFileOperation(e)));
    if (isWeb) {
      this._register(this.lifecycleService.onBeforeShutdown((event) => event.veto(this.onBeforeShutdownWeb(), "veto.fileWorkingCopyManager")));
    } else {
      this._register(this.lifecycleService.onWillShutdown((event) => event.join(this.onWillShutdownDesktop(), { id: "join.fileWorkingCopyManager", label: localize("join.fileWorkingCopyManager", "Saving working copies") })));
    }
  }
  onBeforeShutdownWeb() {
    if (this.workingCopies.some((workingCopy) => workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE))) {
      return true;
    }
    return false;
  }
  async onWillShutdownDesktop() {
    let pendingSavedWorkingCopies;
    while ((pendingSavedWorkingCopies = this.workingCopies.filter((workingCopy) => workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE))).length > 0) {
      await Promises.settled(pendingSavedWorkingCopies.map((workingCopy) => workingCopy.joinState(StoredFileWorkingCopyState.PENDING_SAVE)));
    }
  }
  //#region Resolve from file or file provider changes
  onDidChangeFileSystemProviderCapabilities(e) {
    this.queueWorkingCopyReloads(e.scheme);
  }
  onDidChangeFileSystemProviderRegistrations(e) {
    if (!e.added) {
      return;
    }
    this.queueWorkingCopyReloads(e.scheme);
  }
  onDidFilesChange(e) {
    this.queueWorkingCopyReloads(e);
  }
  queueWorkingCopyReloads(schemeOrEvent) {
    for (const workingCopy of this.workingCopies) {
      if (workingCopy.isDirty()) {
        continue;
      }
      let resolveWorkingCopy = false;
      if (typeof schemeOrEvent === "string") {
        resolveWorkingCopy = schemeOrEvent === workingCopy.resource.scheme;
      } else {
        resolveWorkingCopy = schemeOrEvent.contains(workingCopy.resource, FileChangeType.UPDATED, FileChangeType.ADDED);
      }
      if (resolveWorkingCopy) {
        this.queueWorkingCopyReload(workingCopy);
      }
    }
  }
  queueWorkingCopyReload(workingCopy) {
    const queueSize = this.workingCopyResolveQueue.queueSize(workingCopy.resource);
    if (queueSize <= 1) {
      this.workingCopyResolveQueue.queueFor(workingCopy.resource, async () => {
        try {
          await this.reload(workingCopy);
        } catch (error) {
          this.logService.error(error);
        }
      });
    }
  }
  onWillRunWorkingCopyFileOperation(e) {
    if (e.operation === FileOperation.MOVE || e.operation === FileOperation.COPY) {
      e.waitUntil((async () => {
        const workingCopiesToRestore = [];
        for (const { source, target } of e.files) {
          if (source) {
            if (this.uriIdentityService.extUri.isEqual(source, target)) {
              continue;
            }
            const sourceWorkingCopies = [];
            for (const workingCopy of this.workingCopies) {
              if (this.uriIdentityService.extUri.isEqualOrParent(workingCopy.resource, source)) {
                sourceWorkingCopies.push(workingCopy);
              }
            }
            for (const sourceWorkingCopy of sourceWorkingCopies) {
              const sourceResource = sourceWorkingCopy.resource;
              let targetResource;
              if (this.uriIdentityService.extUri.isEqual(sourceResource, source)) {
                targetResource = target;
              } else {
                targetResource = joinPath(target, sourceResource.path.substr(source.path.length + 1));
              }
              workingCopiesToRestore.push({
                source: sourceResource,
                target: targetResource,
                snapshot: sourceWorkingCopy.isDirty() ? await sourceWorkingCopy.model?.snapshot(SnapshotContext.Save, CancellationToken.None) : void 0
              });
            }
          }
        }
        this.mapCorrelationIdToWorkingCopiesToRestore.set(e.correlationId, workingCopiesToRestore);
      })());
    }
  }
  onDidFailWorkingCopyFileOperation(e) {
    if (e.operation === FileOperation.MOVE || e.operation === FileOperation.COPY) {
      const workingCopiesToRestore = this.mapCorrelationIdToWorkingCopiesToRestore.get(e.correlationId);
      if (workingCopiesToRestore) {
        this.mapCorrelationIdToWorkingCopiesToRestore.delete(e.correlationId);
        for (const workingCopy of workingCopiesToRestore) {
          if (workingCopy.snapshot) {
            this.get(workingCopy.source)?.markModified();
          }
        }
      }
    }
  }
  onDidRunWorkingCopyFileOperation(e) {
    switch (e.operation) {
      // Create: Revert existing working copies
      case FileOperation.CREATE:
        e.waitUntil((async () => {
          for (const { target } of e.files) {
            const workingCopy = this.get(target);
            if (workingCopy && !workingCopy.isDisposed()) {
              await workingCopy.revert();
            }
          }
        })());
        break;
      // Move/Copy: restore working copies that were loaded before the operation took place
      case FileOperation.MOVE:
      case FileOperation.COPY:
        e.waitUntil((async () => {
          const workingCopiesToRestore = this.mapCorrelationIdToWorkingCopiesToRestore.get(e.correlationId);
          if (workingCopiesToRestore) {
            this.mapCorrelationIdToWorkingCopiesToRestore.delete(e.correlationId);
            await Promises.settled(workingCopiesToRestore.map(async (workingCopyToRestore) => {
              const target = this.uriIdentityService.asCanonicalUri(workingCopyToRestore.target);
              await this.resolve(target, {
                reload: { async: false },
                // enforce a reload
                contents: workingCopyToRestore.snapshot
              });
            }));
          }
        })());
        break;
    }
  }
  //#endregion
  //#region Reload & Resolve
  async reload(workingCopy) {
    await this.joinPendingResolves(workingCopy.resource);
    if (workingCopy.isDirty() || workingCopy.isDisposed() || !this.has(workingCopy.resource)) {
      return;
    }
    await this.doResolve(workingCopy, { reload: { async: false } });
  }
  async resolve(resource, options) {
    const pendingResolve = this.joinPendingResolves(resource);
    if (pendingResolve) {
      await pendingResolve;
    }
    return this.doResolve(resource, options);
  }
  async doResolve(resourceOrWorkingCopy, options) {
    let workingCopy;
    let resource;
    if (URI.isUri(resourceOrWorkingCopy)) {
      resource = resourceOrWorkingCopy;
      workingCopy = this.get(resource);
    } else {
      resource = resourceOrWorkingCopy.resource;
      workingCopy = resourceOrWorkingCopy;
    }
    let workingCopyResolve;
    let didCreateWorkingCopy = false;
    const resolveOptions = {
      contents: options?.contents,
      forceReadFromFile: options?.reload?.force,
      limits: options?.limits
    };
    if (workingCopy) {
      if (options?.contents) {
        workingCopyResolve = workingCopy.resolve(resolveOptions);
      } else if (options?.reload) {
        if (options.reload.async) {
          workingCopyResolve = Promise.resolve();
          (async () => {
            try {
              await workingCopy.resolve(resolveOptions);
            } catch (error) {
              if (!workingCopy.isDisposed()) {
                onUnexpectedError(error);
              }
            }
          })();
        } else {
          workingCopyResolve = workingCopy.resolve(resolveOptions);
        }
      } else {
        workingCopyResolve = Promise.resolve();
      }
    } else {
      didCreateWorkingCopy = true;
      workingCopy = new StoredFileWorkingCopy(
        this.workingCopyTypeId,
        resource,
        this.labelService.getUriBasenameLabel(resource),
        this.modelFactory,
        async (options2) => {
          await this.resolve(resource, { ...options2, reload: { async: false } });
        },
        this.fileService,
        this.logService,
        this.workingCopyFileService,
        this.filesConfigurationService,
        this.workingCopyBackupService,
        this.workingCopyService,
        this.notificationService,
        this.workingCopyEditorService,
        this.editorService,
        this.elevatedFileService,
        this.progressService
      );
      workingCopyResolve = workingCopy.resolve(resolveOptions);
      this.registerWorkingCopy(workingCopy);
    }
    this.mapResourceToPendingWorkingCopyResolve.set(resource, workingCopyResolve);
    this.add(resource, workingCopy);
    if (didCreateWorkingCopy) {
      if (workingCopy.isDirty()) {
        this._onDidChangeDirty.fire(workingCopy);
      }
    }
    try {
      await workingCopyResolve;
    } catch (error) {
      if (didCreateWorkingCopy) {
        workingCopy.dispose();
      }
      throw error;
    } finally {
      this.mapResourceToPendingWorkingCopyResolve.delete(resource);
    }
    if (didCreateWorkingCopy && workingCopy.isDirty()) {
      this._onDidChangeDirty.fire(workingCopy);
    }
    return workingCopy;
  }
  joinPendingResolves(resource) {
    const pendingWorkingCopyResolve = this.mapResourceToPendingWorkingCopyResolve.get(resource);
    if (!pendingWorkingCopyResolve) {
      return;
    }
    return this.doJoinPendingResolves(resource);
  }
  async doJoinPendingResolves(resource) {
    let currentWorkingCopyResolve;
    while (this.mapResourceToPendingWorkingCopyResolve.has(resource)) {
      const nextPendingWorkingCopyResolve = this.mapResourceToPendingWorkingCopyResolve.get(resource);
      if (nextPendingWorkingCopyResolve === currentWorkingCopyResolve) {
        return;
      }
      currentWorkingCopyResolve = nextPendingWorkingCopyResolve;
      try {
        await nextPendingWorkingCopyResolve;
      } catch (error) {
      }
    }
  }
  registerWorkingCopy(workingCopy) {
    const workingCopyListeners = new DisposableStore();
    workingCopyListeners.add(workingCopy.onDidResolve(() => this._onDidResolve.fire(workingCopy)));
    workingCopyListeners.add(workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(workingCopy)));
    workingCopyListeners.add(workingCopy.onDidChangeReadonly(() => this._onDidChangeReadonly.fire(workingCopy)));
    workingCopyListeners.add(workingCopy.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire(workingCopy)));
    workingCopyListeners.add(workingCopy.onDidSaveError(() => this._onDidSaveError.fire(workingCopy)));
    workingCopyListeners.add(workingCopy.onDidSave((e) => this._onDidSave.fire({ workingCopy, ...e })));
    workingCopyListeners.add(workingCopy.onDidRevert(() => this._onDidRevert.fire(workingCopy)));
    this.mapResourceToWorkingCopyListeners.set(workingCopy.resource, workingCopyListeners);
  }
  remove(resource) {
    const removed = super.remove(resource);
    const workingCopyListener = this.mapResourceToWorkingCopyListeners.get(resource);
    if (workingCopyListener) {
      dispose(workingCopyListener);
      this.mapResourceToWorkingCopyListeners.delete(resource);
    }
    if (removed) {
      this._onDidRemove.fire(resource);
    }
    return removed;
  }
  //#endregion
  //#region Lifecycle
  canDispose(workingCopy) {
    if (workingCopy.isDisposed() || !this.mapResourceToPendingWorkingCopyResolve.has(workingCopy.resource) && !workingCopy.isDirty()) {
      return true;
    }
    return this.doCanDispose(workingCopy);
  }
  async doCanDispose(workingCopy) {
    const pendingResolve = this.joinPendingResolves(workingCopy.resource);
    if (pendingResolve) {
      await pendingResolve;
      return this.canDispose(workingCopy);
    }
    if (workingCopy.isDirty()) {
      await Event.toPromise(workingCopy.onDidChangeDirty);
      return this.canDispose(workingCopy);
    }
    return true;
  }
  dispose() {
    super.dispose();
    this.mapResourceToPendingWorkingCopyResolve.clear();
    dispose(this.mapResourceToWorkingCopyListeners.values());
    this.mapResourceToWorkingCopyListeners.clear();
  }
  //#endregion
};
StoredFileWorkingCopyManager = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IWorkingCopyFileService),
  __decorateParam(7, IWorkingCopyBackupService),
  __decorateParam(8, IUriIdentityService),
  __decorateParam(9, IFilesConfigurationService),
  __decorateParam(10, IWorkingCopyService),
  __decorateParam(11, INotificationService),
  __decorateParam(12, IWorkingCopyEditorService),
  __decorateParam(13, IEditorService),
  __decorateParam(14, IElevatedFileService),
  __decorateParam(15, IProgressService)
], StoredFileWorkingCopyManager);
export {
  StoredFileWorkingCopyManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vc3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBTdG9yZWRGaWxlV29ya2luZ0NvcHksIFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5LCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWwsIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3RvcnksIElTdG9yZWRGaWxlV29ya2luZ0NvcHlSZXNvbHZlT3B0aW9ucywgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudCBhcyBJQmFzZVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudCB9IGZyb20gJy4vc3RvcmVkRmlsZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFByb21pc2VzLCBSZXNvdXJjZVF1ZXVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRmlsZUNoYW5nZXNFdmVudCwgRmlsZUNoYW5nZVR5cGUsIEZpbGVPcGVyYXRpb24sIElGaWxlU2VydmljZSwgSUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllc0NoYW5nZUV2ZW50LCBJRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9uRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsIFdvcmtpbmdDb3B5RmlsZUV2ZW50IH0gZnJvbSAnLi93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB9IGZyb20gJy4vd29ya2luZ0NvcHlCYWNrdXAuanMnO1xuaW1wb3J0IHsgQmFzZUZpbGVXb3JraW5nQ29weU1hbmFnZXIsIElCYXNlRmlsZVdvcmtpbmdDb3B5TWFuYWdlciB9IGZyb20gJy4vYWJzdHJhY3RGaWxlV29ya2luZ0NvcHlNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVsZXZhdGVkRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZWxldmF0ZWRGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi93b3JraW5nQ29weUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgU25hcHNob3RDb250ZXh0IH0gZnJvbSAnLi9maWxlV29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5cbi8qKlxuICogVGhlIG9ubHkgb25lIHRoYXQgc2hvdWxkIGJlIGRlYWxpbmcgd2l0aCBgSVN0b3JlZEZpbGVXb3JraW5nQ29weWAgYW5kIGhhbmRsZSBhbGxcbiAqIG9wZXJhdGlvbnMgdGhhdCBhcmUgd29ya2luZyBjb3B5IHJlbGF0ZWQsIHN1Y2ggYXMgc2F2ZS9yZXZlcnQsIGJhY2t1cFxuICogYW5kIHJlc29sdmluZy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlcjxNIGV4dGVuZHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiBleHRlbmRzIElCYXNlRmlsZVdvcmtpbmdDb3B5TWFuYWdlcjxNLCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+PiB7XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IGZvciB3aGVuIGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHdhcyByZXNvbHZlZC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkUmVzb2x2ZTogRXZlbnQ8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPj47XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IGZvciB3aGVuIGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGNoYW5nZWQgaXQncyBkaXJ0eSBzdGF0ZS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGlydHk6IEV2ZW50PElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4+O1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCBmb3Igd2hlbiBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBjaGFuZ2VkIGl0J3MgcmVhZG9ubHkgc3RhdGUuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlYWRvbmx5OiBFdmVudDxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+PjtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgZm9yIHdoZW4gYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgY2hhbmdlZCBpdCdzIG9ycGhhbmVkIHN0YXRlLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VPcnBoYW5lZDogRXZlbnQ8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPj47XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IGZvciB3aGVuIGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGZhaWxlZCB0byBzYXZlLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRTYXZlRXJyb3I6IEV2ZW50PElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4+O1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCBmb3Igd2hlbiBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBzdWNjZXNzZnVsbHkgc2F2ZWQuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFNhdmU6IEV2ZW50PElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlRXZlbnQ8TT4+O1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCBmb3Igd2hlbiBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSB3YXMgcmV2ZXJ0ZWQuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFJldmVydDogRXZlbnQ8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPj47XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IGZvciB3aGVuIGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGlzIHJlbW92ZWQgZnJvbSB0aGUgbWFuYWdlci5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlOiBFdmVudDxVUkk+O1xuXG5cdC8qKlxuXHQgKiBBbGxvd3MgdG8gcmVzb2x2ZSBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weS4gSWYgdGhlIG1hbmFnZXIgYWxyZWFkeSBrbm93c1xuXHQgKiBhYm91dCBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSB3aXRoIHRoZSBzYW1lIGBVUklgLCBpdCB3aWxsIHJldHVybiB0aGF0XG5cdCAqIGV4aXN0aW5nIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weS4gVGhlcmUgd2lsbCBuZXZlciBiZSBtb3JlIHRoYW4gb25lXG5cdCAqIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBwZXIgYFVSSWAgdW50aWwgdGhlIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBpc1xuXHQgKiBkaXNwb3NlZC5cblx0ICpcblx0ICogVXNlIHRoZSBgSVN0b3JlZEZpbGVXb3JraW5nQ29weVJlc29sdmVPcHRpb25zLnJlbG9hZGAgb3B0aW9uIHRvIGNvbnRyb2wgdGhlXG5cdCAqIGJlaGF2aW91ciBmb3Igd2hlbiBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSB3YXMgcHJldmlvdXNseSBhbHJlYWR5IHJlc29sdmVkXG5cdCAqIHdpdGggcmVnYXJkcyB0byByZXNvbHZpbmcgaXQgYWdhaW4gZnJvbSB0aGUgdW5kZXJseWluZyBmaWxlIHJlc291cmNlXG5cdCAqIG9yIG5vdC5cblx0ICpcblx0ICogTm90ZTogQ2FsbGVycyBtdXN0IGBkaXNwb3NlYCB0aGUgd29ya2luZyBjb3B5IHdoZW4gbm8gbG9uZ2VyIG5lZWRlZC5cblx0ICpcblx0ICogQHBhcmFtIHJlc291cmNlIHVzZWQgYXMgdW5pcXVlIGlkZW50aWZpZXIgb2YgdGhlIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBpblxuXHQgKiBjYXNlIG9uZSBpcyBhbHJlYWR5IGtub3duIGZvciB0aGlzIGBVUklgLlxuXHQgKiBAcGFyYW0gb3B0aW9uc1xuXHQgKi9cblx0cmVzb2x2ZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVN0b3JlZEZpbGVXb3JraW5nQ29weU1hbmFnZXJSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPj47XG5cblx0LyoqXG5cdCAqIFdhaXRzIGZvciB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHRvIGJlIHJlYWR5IHRvIGJlIGRpc3Bvc2VkLiBUaGVyZSBtYXkgYmVcblx0ICogY29uZGl0aW9ucyB1bmRlciB3aGljaCB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGNhbm5vdCBiZSBkaXNwb3NlZCwgZS5nLiB3aGVuXG5cdCAqIGl0IGlzIGRpcnR5LiBPbmNlIHRoZSBwcm9taXNlIGlzIHNldHRsZWQsIGl0IGlzIHNhZmUgdG8gZGlzcG9zZS5cblx0ICovXG5cdGNhbkRpc3Bvc2Uod29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4pOiB0cnVlIHwgUHJvbWlzZTx0cnVlPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUV2ZW50PE0gZXh0ZW5kcyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+IGV4dGVuZHMgSUJhc2VTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlRXZlbnQge1xuXG5cdC8qKlxuXHQgKiBUaGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHRoYXQgd2FzIHN1Y2Nlc3NmdWxseSBzYXZlZC5cblx0ICovXG5cdHJlYWRvbmx5IHdvcmtpbmdDb3B5OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyUmVzb2x2ZU9wdGlvbnMgZXh0ZW5kcyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5UmVzb2x2ZU9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBJZiB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHdhcyBhbHJlYWR5IHJlc29sdmVkIGJlZm9yZSxcblx0ICogYWxsb3dzIHRvIHRyaWdnZXIgYSByZWxvYWQgb2YgaXQgdG8gZmV0Y2ggdGhlIGxhdGVzdCBjb250ZW50cy5cblx0ICovXG5cdHJlYWRvbmx5IHJlbG9hZD86IHtcblxuXHRcdC8qKlxuXHRcdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIHJlbG9hZCBoYXBwZW5zIGluIHRoZSBiYWNrZ3JvdW5kXG5cdFx0ICogb3Igd2hldGhlciBgcmVzb2x2ZWAgd2lsbCBhd2FpdCB0aGUgcmVsb2FkIHRvIGhhcHBlbi5cblx0XHQgKi9cblx0XHRyZWFkb25seSBhc3luYzogYm9vbGVhbjtcblxuXHRcdC8qKlxuXHRcdCAqIENvbnRyb2xzIHdoZXRoZXIgdG8gZm9yY2UgcmVhZGluZyB0aGUgY29udGVudHMgZnJvbSB0aGVcblx0XHQgKiB1bmRlcmx5aW5nIHJlc291cmNlIGV2ZW4gaWYgdGhlIHJlc291cmNlIGRpZCBub3QgY2hhbmdlLlxuXHRcdCAqL1xuXHRcdHJlYWRvbmx5IGZvcmNlPzogYm9vbGVhbjtcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIFN0b3JlZEZpbGVXb3JraW5nQ29weU1hbmFnZXI8TSBleHRlbmRzIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbD4gZXh0ZW5kcyBCYXNlRmlsZVdvcmtpbmdDb3B5TWFuYWdlcjxNLCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+PiBpbXBsZW1lbnRzIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyPE0+IHtcblxuXHQvLyNyZWdpb24gRXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXNvbHZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVzb2x2ZSA9IHRoaXMuX29uRGlkUmVzb2x2ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURpcnR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGlydHkgPSB0aGlzLl9vbkRpZENoYW5nZURpcnR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmVhZG9ubHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZWFkb25seSA9IHRoaXMuX29uRGlkQ2hhbmdlUmVhZG9ubHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VPcnBoYW5lZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU9ycGhhbmVkID0gdGhpcy5fb25EaWRDaGFuZ2VPcnBoYW5lZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNhdmVFcnJvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNhdmVFcnJvciA9IHRoaXMuX29uRGlkU2F2ZUVycm9yLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2F2ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlRXZlbnQ8TT4+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNhdmUgPSB0aGlzLl9vbkRpZFNhdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXZlcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXZlcnQgPSB0aGlzLl9vbkRpZFJldmVydC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVSST4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlID0gdGhpcy5fb25EaWRSZW1vdmUuZXZlbnQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSByZWFkb25seSBtYXBSZXNvdXJjZVRvV29ya2luZ0NvcHlMaXN0ZW5lcnMgPSBuZXcgUmVzb3VyY2VNYXA8SURpc3Bvc2FibGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwUmVzb3VyY2VUb1BlbmRpbmdXb3JraW5nQ29weVJlc29sdmUgPSBuZXcgUmVzb3VyY2VNYXA8UHJvbWlzZTx2b2lkPj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHdvcmtpbmdDb3B5UmVzb2x2ZVF1ZXVlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJlc291cmNlUXVldWUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weVR5cGVJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbW9kZWxGYWN0b3J5OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5PE0+LFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0NvcHlGaWxlU2VydmljZTogSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2Ugd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlOiBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0NvcHlTZXJ2aWNlOiBJV29ya2luZ0NvcHlTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlOiBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWxldmF0ZWRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVsZXZhdGVkRmlsZVNlcnZpY2U6IElFbGV2YXRlZEZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlLCB3b3JraW5nQ29weUJhY2t1cFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIFVwZGF0ZSB3b3JraW5nIGNvcGllcyBmcm9tIGZpbGUgY2hhbmdlIGV2ZW50c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHRoaXMub25EaWRGaWxlc0NoYW5nZShlKSkpO1xuXG5cdFx0Ly8gRmlsZSBzeXN0ZW0gcHJvdmlkZXIgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9ucyhlKSkpO1xuXG5cdFx0Ly8gV29ya2luZyBjb3B5IG9wZXJhdGlvbnNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtpbmdDb3B5RmlsZVNlcnZpY2Uub25XaWxsUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGUgPT4gdGhpcy5vbldpbGxSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtpbmdDb3B5RmlsZVNlcnZpY2Uub25EaWRGYWlsV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGUgPT4gdGhpcy5vbkRpZEZhaWxXb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtpbmdDb3B5RmlsZVNlcnZpY2Uub25EaWRSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSA9PiB0aGlzLm9uRGlkUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGUpKSk7XG5cblx0XHQvLyBMaWZlY3ljbGVcblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbkJlZm9yZVNodXRkb3duKGV2ZW50ID0+IGV2ZW50LnZldG8odGhpcy5vbkJlZm9yZVNodXRkb3duV2ViKCksICd2ZXRvLmZpbGVXb3JraW5nQ29weU1hbmFnZXInKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oZXZlbnQgPT4gZXZlbnQuam9pbih0aGlzLm9uV2lsbFNodXRkb3duRGVza3RvcCgpLCB7IGlkOiAnam9pbi5maWxlV29ya2luZ0NvcHlNYW5hZ2VyJywgbGFiZWw6IGxvY2FsaXplKCdqb2luLmZpbGVXb3JraW5nQ29weU1hbmFnZXInLCBcIlNhdmluZyB3b3JraW5nIGNvcGllc1wiKSB9KSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25CZWZvcmVTaHV0ZG93bldlYigpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy53b3JraW5nQ29waWVzLnNvbWUod29ya2luZ0NvcHkgPT4gd29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuUEVORElOR19TQVZFKSkpIHtcblx0XHRcdC8vIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29waWVzIGFyZSBwZW5kaW5nIHRvIGJlIHNhdmVkOlxuXHRcdFx0Ly8gdmV0byBiZWNhdXNlIHdlYiBkb2VzIG5vdCBzdXBwb3J0IGxvbmcgcnVubmluZyBzaHV0ZG93blxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbldpbGxTaHV0ZG93bkRlc2t0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHBlbmRpbmdTYXZlZFdvcmtpbmdDb3BpZXM6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT5bXTtcblxuXHRcdC8vIEFzIGxvbmcgYXMgc3RvcmVkIGZpbGUgd29ya2luZyBjb3BpZXMgYXJlIHBlbmRpbmcgdG8gYmUgc2F2ZWQsIHdlIHByb2xvbmcgdGhlIHNodXRkb3duXG5cdFx0Ly8gdW50aWwgdGhhdCBoYXMgaGFwcGVuZWQgdG8gZW5zdXJlIHdlIGFyZSBub3Qgc2h1dHRpbmcgZG93biBpbiB0aGUgbWlkZGxlIG9mXG5cdFx0Ly8gd3JpdGluZyB0byB0aGUgd29ya2luZyBjb3B5IChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE2NjAwKS5cblx0XHR3aGlsZSAoKHBlbmRpbmdTYXZlZFdvcmtpbmdDb3BpZXMgPSB0aGlzLndvcmtpbmdDb3BpZXMuZmlsdGVyKHdvcmtpbmdDb3B5ID0+IHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLlBFTkRJTkdfU0FWRSkpKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKHBlbmRpbmdTYXZlZFdvcmtpbmdDb3BpZXMubWFwKHdvcmtpbmdDb3B5ID0+IHdvcmtpbmdDb3B5LmpvaW5TdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5QRU5ESU5HX1NBVkUpKSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jcmVnaW9uIFJlc29sdmUgZnJvbSBmaWxlIG9yIGZpbGUgcHJvdmlkZXIgY2hhbmdlc1xuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMoZTogSUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllc0NoYW5nZUV2ZW50KTogdm9pZCB7XG5cblx0XHQvLyBSZXNvbHZlIHdvcmtpbmcgY29waWVzIGFnYWluIGZvciBmaWxlIHN5c3RlbXMgdGhhdCBjaGFuZ2VkXG5cdFx0Ly8gY2FwYWJpbGl0aWVzIHRvIGZldGNoIGxhdGVzdCBtZXRhZGF0YSAoZS5nLiByZWFkb25seSlcblx0XHQvLyBpbnRvIGFsbCB3b3JraW5nIGNvcGllcy5cblx0XHR0aGlzLnF1ZXVlV29ya2luZ0NvcHlSZWxvYWRzKGUuc2NoZW1lKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zKGU6IElGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25FdmVudCk6IHZvaWQge1xuXHRcdGlmICghZS5hZGRlZCkge1xuXHRcdFx0cmV0dXJuOyAvLyBvbmx5IGlmIGFkZGVkXG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSB3b3JraW5nIGNvcGllcyBhZ2FpbiBmb3IgZmlsZSBzeXN0ZW1zIHRoYXQgcmVnaXN0ZXJlZFxuXHRcdC8vIHRvIGFjY291bnQgZm9yIGNhcGFiaWxpdHkgY2hhbmdlczogZXh0ZW5zaW9ucyBtYXkgdW5yZWdpc3RlclxuXHRcdC8vIGFuZCByZWdpc3RlciB0aGUgc2FtZSBwcm92aWRlciB3aXRoIGRpZmZlcmVudCBjYXBhYmlsaXRpZXMsXG5cdFx0Ly8gc28gd2Ugd2FudCB0byBlbnN1cmUgdG8gZmV0Y2ggbGF0ZXN0IG1ldGFkYXRhIChlLmcuIHJlYWRvbmx5KVxuXHRcdC8vIGludG8gYWxsIHdvcmtpbmcgY29waWVzLlxuXHRcdHRoaXMucXVldWVXb3JraW5nQ29weVJlbG9hZHMoZS5zY2hlbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZEZpbGVzQ2hhbmdlKGU6IEZpbGVDaGFuZ2VzRXZlbnQpOiB2b2lkIHtcblxuXHRcdC8vIFRyaWdnZXIgYSByZXNvbHZlIGZvciBhbnkgdXBkYXRlIG9yIGFkZCBldmVudCB0aGF0IGltcGFjdHNcblx0XHQvLyB0aGUgd29ya2luZyBjb3B5LiBXZSBhbHNvIGNvbnNpZGVyIHRoZSBhZGRlZCBldmVudFxuXHRcdC8vIGJlY2F1c2UgaXQgY291bGQgYmUgdGhhdCBhIGZpbGUgd2FzIGFkZGVkIGFuZCB1cGRhdGVkXG5cdFx0Ly8gcmlnaHQgYWZ0ZXIuXG5cdFx0dGhpcy5xdWV1ZVdvcmtpbmdDb3B5UmVsb2FkcyhlKTtcblx0fVxuXG5cdHByaXZhdGUgcXVldWVXb3JraW5nQ29weVJlbG9hZHMoc2NoZW1lOiBzdHJpbmcpOiB2b2lkO1xuXHRwcml2YXRlIHF1ZXVlV29ya2luZ0NvcHlSZWxvYWRzKGU6IEZpbGVDaGFuZ2VzRXZlbnQpOiB2b2lkO1xuXHRwcml2YXRlIHF1ZXVlV29ya2luZ0NvcHlSZWxvYWRzKHNjaGVtZU9yRXZlbnQ6IHN0cmluZyB8IEZpbGVDaGFuZ2VzRXZlbnQpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHdvcmtpbmdDb3B5IG9mIHRoaXMud29ya2luZ0NvcGllcykge1xuXHRcdFx0aWYgKHdvcmtpbmdDb3B5LmlzRGlydHkoKSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gbmV2ZXIgcmVsb2FkIGRpcnR5IHdvcmtpbmcgY29waWVzXG5cdFx0XHR9XG5cblx0XHRcdGxldCByZXNvbHZlV29ya2luZ0NvcHkgPSBmYWxzZTtcblx0XHRcdGlmICh0eXBlb2Ygc2NoZW1lT3JFdmVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmVzb2x2ZVdvcmtpbmdDb3B5ID0gc2NoZW1lT3JFdmVudCA9PT0gd29ya2luZ0NvcHkucmVzb3VyY2Uuc2NoZW1lO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzb2x2ZVdvcmtpbmdDb3B5ID0gc2NoZW1lT3JFdmVudC5jb250YWlucyh3b3JraW5nQ29weS5yZXNvdXJjZSwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzb2x2ZVdvcmtpbmdDb3B5KSB7XG5cdFx0XHRcdHRoaXMucXVldWVXb3JraW5nQ29weVJlbG9hZCh3b3JraW5nQ29weSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBxdWV1ZVdvcmtpbmdDb3B5UmVsb2FkKHdvcmtpbmdDb3B5OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+KTogdm9pZCB7XG5cblx0XHQvLyBSZXNvbHZlcyBhIHdvcmtpbmcgY29weSB0byB1cGRhdGUgKHVzZSBhIHF1ZXVlIHRvIHByZXZlbnQgYWNjdW11bGF0aW9uIG9mXG5cdFx0Ly8gcmVzb2x2ZSB3aGVuIHRoZSByZXNvbHZpbmcgYWN0dWFsbHkgdGFrZXMgbG9uZy4gQXQgbW9zdCB3ZSBvbmx5IHdhbnQgdGhlXG5cdFx0Ly8gcXVldWUgdG8gaGF2ZSBhIHNpemUgb2YgMiAoMSBydW5uaW5nIHJlc29sdmUgYW5kIDEgcXVldWVkIHJlc29sdmUpLlxuXHRcdGNvbnN0IHF1ZXVlU2l6ZSA9IHRoaXMud29ya2luZ0NvcHlSZXNvbHZlUXVldWUucXVldWVTaXplKHdvcmtpbmdDb3B5LnJlc291cmNlKTtcblx0XHRpZiAocXVldWVTaXplIDw9IDEpIHtcblx0XHRcdHRoaXMud29ya2luZ0NvcHlSZXNvbHZlUXVldWUucXVldWVGb3Iod29ya2luZ0NvcHkucmVzb3VyY2UsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlbG9hZCh3b3JraW5nQ29weSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFdvcmtpbmcgQ29weSBGaWxlIEV2ZW50c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwQ29ycmVsYXRpb25JZFRvV29ya2luZ0NvcGllc1RvUmVzdG9yZSA9IG5ldyBNYXA8bnVtYmVyLCB7IHNvdXJjZTogVVJJOyB0YXJnZXQ6IFVSSTsgc25hcHNob3Q/OiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIH1bXT4oKTtcblxuXHRwcml2YXRlIG9uV2lsbFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlOiBXb3JraW5nQ29weUZpbGVFdmVudCk6IHZvaWQge1xuXG5cdFx0Ly8gTW92ZSAvIENvcHk6IHJlbWVtYmVyIHdvcmtpbmcgY29waWVzIHRvIHJlc3RvcmUgYWZ0ZXIgdGhlIG9wZXJhdGlvblxuXHRcdGlmIChlLm9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5NT1ZFIHx8IGUub3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLkNPUFkpIHtcblx0XHRcdGUud2FpdFVudGlsKChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHdvcmtpbmdDb3BpZXNUb1Jlc3RvcmU6IHsgc291cmNlOiBVUkk7IHRhcmdldDogVVJJOyBzbmFwc2hvdD86IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfVtdID0gW107XG5cblx0XHRcdFx0Zm9yIChjb25zdCB7IHNvdXJjZSwgdGFyZ2V0IH0gb2YgZS5maWxlcykge1xuXHRcdFx0XHRcdGlmIChzb3VyY2UpIHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChzb3VyY2UsIHRhcmdldCkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7IC8vIGlnbm9yZSBpZiByZXNvdXJjZXMgYXJlIGNvbnNpZGVyZWQgZXF1YWxcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gRmluZCBhbGwgd29ya2luZyBjb3BpZXMgdGhhdCByZWxhdGVkIHRvIHNvdXJjZSAoY2FuIGJlIG1hbnkgaWYgcmVzb3VyY2UgaXMgYSBmb2xkZXIpXG5cdFx0XHRcdFx0XHRjb25zdCBzb3VyY2VXb3JraW5nQ29waWVzOiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+W10gPSBbXTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3Qgd29ya2luZ0NvcHkgb2YgdGhpcy53b3JraW5nQ29waWVzKSB7XG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHdvcmtpbmdDb3B5LnJlc291cmNlLCBzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdFx0c291cmNlV29ya2luZ0NvcGllcy5wdXNoKHdvcmtpbmdDb3B5KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBSZW1lbWJlciBlYWNoIHNvdXJjZSB3b3JraW5nIGNvcHkgdG8gbG9hZCBhZ2FpbiBhZnRlciBtb3ZlIGlzIGRvbmVcblx0XHRcdFx0XHRcdC8vIHdpdGggb3B0aW9uYWwgY29udGVudCB0byByZXN0b3JlIGlmIGl0IHdhcyBkaXJ0eVxuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBzb3VyY2VXb3JraW5nQ29weSBvZiBzb3VyY2VXb3JraW5nQ29waWVzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHNvdXJjZVJlc291cmNlID0gc291cmNlV29ya2luZ0NvcHkucmVzb3VyY2U7XG5cblx0XHRcdFx0XHRcdFx0Ly8gSWYgdGhlIHNvdXJjZSBpcyB0aGUgYWN0dWFsIHdvcmtpbmcgY29weSwganVzdCB1c2UgdGFyZ2V0IGFzIG5ldyByZXNvdXJjZVxuXHRcdFx0XHRcdFx0XHRsZXQgdGFyZ2V0UmVzb3VyY2U6IFVSSTtcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHNvdXJjZVJlc291cmNlLCBzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGFyZ2V0UmVzb3VyY2UgPSB0YXJnZXQ7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHQvLyBPdGhlcndpc2UgYSBwYXJlbnQgZm9sZGVyIG9mIHRoZSBzb3VyY2UgaXMgYmVpbmcgbW92ZWQsIHNvIHdlIG5lZWRcblx0XHRcdFx0XHRcdFx0Ly8gdG8gY29tcHV0ZSB0aGUgdGFyZ2V0IHJlc291cmNlIGJhc2VkIG9uIHRoYXRcblx0XHRcdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0dGFyZ2V0UmVzb3VyY2UgPSBqb2luUGF0aCh0YXJnZXQsIHNvdXJjZVJlc291cmNlLnBhdGguc3Vic3RyKHNvdXJjZS5wYXRoLmxlbmd0aCArIDEpKTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHdvcmtpbmdDb3BpZXNUb1Jlc3RvcmUucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0c291cmNlOiBzb3VyY2VSZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0XHR0YXJnZXQ6IHRhcmdldFJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRcdHNuYXBzaG90OiBzb3VyY2VXb3JraW5nQ29weS5pc0RpcnR5KCkgPyBhd2FpdCBzb3VyY2VXb3JraW5nQ29weS5tb2RlbD8uc25hcHNob3QoU25hcHNob3RDb250ZXh0LlNhdmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMubWFwQ29ycmVsYXRpb25JZFRvV29ya2luZ0NvcGllc1RvUmVzdG9yZS5zZXQoZS5jb3JyZWxhdGlvbklkLCB3b3JraW5nQ29waWVzVG9SZXN0b3JlKTtcblx0XHRcdH0pKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRGYWlsV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGU6IFdvcmtpbmdDb3B5RmlsZUV2ZW50KTogdm9pZCB7XG5cblx0XHQvLyBNb3ZlIC8gQ29weTogcmVzdG9yZSBkaXJ0eSBmbGFnIG9uIHdvcmtpbmcgY29waWVzIHRvIHJlc3RvcmUgdGhhdCB3ZXJlIGRpcnR5XG5cdFx0aWYgKChlLm9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5NT1ZFIHx8IGUub3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLkNPUFkpKSB7XG5cdFx0XHRjb25zdCB3b3JraW5nQ29waWVzVG9SZXN0b3JlID0gdGhpcy5tYXBDb3JyZWxhdGlvbklkVG9Xb3JraW5nQ29waWVzVG9SZXN0b3JlLmdldChlLmNvcnJlbGF0aW9uSWQpO1xuXHRcdFx0aWYgKHdvcmtpbmdDb3BpZXNUb1Jlc3RvcmUpIHtcblx0XHRcdFx0dGhpcy5tYXBDb3JyZWxhdGlvbklkVG9Xb3JraW5nQ29waWVzVG9SZXN0b3JlLmRlbGV0ZShlLmNvcnJlbGF0aW9uSWQpO1xuXG5cdFx0XHRcdGZvciAoY29uc3Qgd29ya2luZ0NvcHkgb2Ygd29ya2luZ0NvcGllc1RvUmVzdG9yZSkge1xuXG5cdFx0XHRcdFx0Ly8gU25hcHNob3QgcHJlc2VuY2UgbWVhbnMgdGhpcyB3b3JraW5nIGNvcHkgdXNlZCB0byBiZSBtb2RpZmllZCBhbmQgc28gd2UgcmVzdG9yZSB0aGF0XG5cdFx0XHRcdFx0Ly8gZmxhZy4gd2UgZG8gTk9UIGhhdmUgdG8gcmVzdG9yZSB0aGUgY29udGVudCBiZWNhdXNlIHRoZSB3b3JraW5nIGNvcHkgd2FzIG9ubHkgc29mdFxuXHRcdFx0XHRcdC8vIHJldmVydGVkIGFuZCBkaWQgbm90IGxvb3NlIGl0cyBvcmlnaW5hbCBtb2RpZmllZCBjb250ZW50cy5cblxuXHRcdFx0XHRcdGlmICh3b3JraW5nQ29weS5zbmFwc2hvdCkge1xuXHRcdFx0XHRcdFx0dGhpcy5nZXQod29ya2luZ0NvcHkuc291cmNlKT8ubWFya01vZGlmaWVkKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlOiBXb3JraW5nQ29weUZpbGVFdmVudCk6IHZvaWQge1xuXHRcdHN3aXRjaCAoZS5vcGVyYXRpb24pIHtcblxuXHRcdFx0Ly8gQ3JlYXRlOiBSZXZlcnQgZXhpc3Rpbmcgd29ya2luZyBjb3BpZXNcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvbi5DUkVBVEU6XG5cdFx0XHRcdGUud2FpdFVudGlsKChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB7IHRhcmdldCB9IG9mIGUuZmlsZXMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHdvcmtpbmdDb3B5ID0gdGhpcy5nZXQodGFyZ2V0KTtcblx0XHRcdFx0XHRcdGlmICh3b3JraW5nQ29weSAmJiAhd29ya2luZ0NvcHkuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJldmVydCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkoKSk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHQvLyBNb3ZlL0NvcHk6IHJlc3RvcmUgd29ya2luZyBjb3BpZXMgdGhhdCB3ZXJlIGxvYWRlZCBiZWZvcmUgdGhlIG9wZXJhdGlvbiB0b29rIHBsYWNlXG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb24uTU9WRTpcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvbi5DT1BZOlxuXHRcdFx0XHRlLndhaXRVbnRpbCgoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHdvcmtpbmdDb3BpZXNUb1Jlc3RvcmUgPSB0aGlzLm1hcENvcnJlbGF0aW9uSWRUb1dvcmtpbmdDb3BpZXNUb1Jlc3RvcmUuZ2V0KGUuY29ycmVsYXRpb25JZCk7XG5cdFx0XHRcdFx0aWYgKHdvcmtpbmdDb3BpZXNUb1Jlc3RvcmUpIHtcblx0XHRcdFx0XHRcdHRoaXMubWFwQ29ycmVsYXRpb25JZFRvV29ya2luZ0NvcGllc1RvUmVzdG9yZS5kZWxldGUoZS5jb3JyZWxhdGlvbklkKTtcblxuXHRcdFx0XHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZCh3b3JraW5nQ29waWVzVG9SZXN0b3JlLm1hcChhc3luYyB3b3JraW5nQ29weVRvUmVzdG9yZSA9PiB7XG5cblx0XHRcdFx0XHRcdFx0Ly8gRnJvbSB0aGlzIG1vbWVudCBvbiwgb25seSBvcGVyYXRlIG9uIHRoZSBjYW5vbmljYWwgcmVzb3VyY2Vcblx0XHRcdFx0XHRcdFx0Ly8gdG8gZml4IGEgcG90ZW50aWFsIGRhdGEgbG9zcyBpc3N1ZTpcblx0XHRcdFx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIxMTM3NFxuXHRcdFx0XHRcdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5hc0Nhbm9uaWNhbFVyaSh3b3JraW5nQ29weVRvUmVzdG9yZS50YXJnZXQpO1xuXG5cdFx0XHRcdFx0XHRcdC8vIFJlc3RvcmUgdGhlIHdvcmtpbmcgY29weSBhdCB0aGUgdGFyZ2V0LiBpZiB3ZSBoYXZlIHByZXZpb3VzIGRpcnR5IGNvbnRlbnQsIHdlIHBhc3MgaXRcblx0XHRcdFx0XHRcdFx0Ly8gb3ZlciB0byBiZSB1c2VkLCBvdGhlcndpc2Ugd2UgZm9yY2UgYSByZWxvYWQgZnJvbSBkaXNrLiB0aGlzIGlzIGltcG9ydGFudFxuXHRcdFx0XHRcdFx0XHQvLyBiZWNhdXNlIHdlIGtub3cgdGhlIGZpbGUgaGFzIGNoYW5nZWQgb24gZGlzayBhZnRlciB0aGUgbW92ZSBhbmQgdGhlIHdvcmtpbmcgY29weSBtaWdodFxuXHRcdFx0XHRcdFx0XHQvLyBoYXZlIHN0aWxsIGV4aXN0ZWQgd2l0aCB0aGUgcHJldmlvdXMgc3RhdGUuIHRoaXMgZW5zdXJlcyB0aGF0IHRoZSB3b3JraW5nIGNvcHkgaXMgbm90XG5cdFx0XHRcdFx0XHRcdC8vIHRyYWNraW5nIGEgc3RhbGUgc3RhdGUuXG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucmVzb2x2ZSh0YXJnZXQsIHtcblx0XHRcdFx0XHRcdFx0XHRyZWxvYWQ6IHsgYXN5bmM6IGZhbHNlIH0sIC8vIGVuZm9yY2UgYSByZWxvYWRcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogd29ya2luZ0NvcHlUb1Jlc3RvcmUuc25hcHNob3Rcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFJlbG9hZCAmIFJlc29sdmVcblxuXHRwcml2YXRlIGFzeW5jIHJlbG9hZCh3b3JraW5nQ29weTogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gQXdhaXQgYSBwZW5kaW5nIHdvcmtpbmcgY29weSByZXNvbHZlIGZpcnN0IGJlZm9yZSBwcm9jZWVkaW5nXG5cdFx0Ly8gdG8gZW5zdXJlIHRoYXQgd2UgbmV2ZXIgcmVzb2x2ZSBhIHdvcmtpbmcgY29weSBtb3JlIHRoYW4gb25jZVxuXHRcdC8vIGluIHBhcmFsbGVsLlxuXHRcdGF3YWl0IHRoaXMuam9pblBlbmRpbmdSZXNvbHZlcyh3b3JraW5nQ29weS5yZXNvdXJjZSk7XG5cblx0XHRpZiAod29ya2luZ0NvcHkuaXNEaXJ0eSgpIHx8IHdvcmtpbmdDb3B5LmlzRGlzcG9zZWQoKSB8fCAhdGhpcy5oYXMod29ya2luZ0NvcHkucmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47IC8vIHRoZSB3b3JraW5nIGNvcHkgcG9zc2libHkgZ290IGRpcnR5IG9yIGRpc3Bvc2VkLCBzbyByZXR1cm4gZWFybHkgdGhlblxuXHRcdH1cblxuXHRcdC8vIFRyaWdnZXIgcmVsb2FkXG5cdFx0YXdhaXQgdGhpcy5kb1Jlc29sdmUod29ya2luZ0NvcHksIHsgcmVsb2FkOiB7IGFzeW5jOiBmYWxzZSB9IH0pO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVN0b3JlZEZpbGVXb3JraW5nQ29weU1hbmFnZXJSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPj4ge1xuXG5cdFx0Ly8gQXdhaXQgYSBwZW5kaW5nIHdvcmtpbmcgY29weSByZXNvbHZlIGZpcnN0IGJlZm9yZSBwcm9jZWVkaW5nXG5cdFx0Ly8gdG8gZW5zdXJlIHRoYXQgd2UgbmV2ZXIgcmVzb2x2ZSBhIHdvcmtpbmcgY29weSBtb3JlIHRoYW4gb25jZVxuXHRcdC8vIGluIHBhcmFsbGVsLlxuXHRcdGNvbnN0IHBlbmRpbmdSZXNvbHZlID0gdGhpcy5qb2luUGVuZGluZ1Jlc29sdmVzKHJlc291cmNlKTtcblx0XHRpZiAocGVuZGluZ1Jlc29sdmUpIHtcblx0XHRcdGF3YWl0IHBlbmRpbmdSZXNvbHZlO1xuXHRcdH1cblxuXHRcdC8vIFRyaWdnZXIgcmVzb2x2ZVxuXHRcdHJldHVybiB0aGlzLmRvUmVzb2x2ZShyZXNvdXJjZSwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVzb2x2ZShyZXNvdXJjZU9yV29ya2luZ0NvcHk6IFVSSSB8IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4sIG9wdGlvbnM/OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlclJlc29sdmVPcHRpb25zKTogUHJvbWlzZTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+PiB7XG5cdFx0bGV0IHdvcmtpbmdDb3B5OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCByZXNvdXJjZTogVVJJO1xuXHRcdGlmIChVUkkuaXNVcmkocmVzb3VyY2VPcldvcmtpbmdDb3B5KSkge1xuXHRcdFx0cmVzb3VyY2UgPSByZXNvdXJjZU9yV29ya2luZ0NvcHk7XG5cdFx0XHR3b3JraW5nQ29weSA9IHRoaXMuZ2V0KHJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzb3VyY2UgPSByZXNvdXJjZU9yV29ya2luZ0NvcHkucmVzb3VyY2U7XG5cdFx0XHR3b3JraW5nQ29weSA9IHJlc291cmNlT3JXb3JraW5nQ29weTtcblx0XHR9XG5cblx0XHRsZXQgd29ya2luZ0NvcHlSZXNvbHZlOiBQcm9taXNlPHZvaWQ+O1xuXHRcdGxldCBkaWRDcmVhdGVXb3JraW5nQ29weSA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZU9wdGlvbnM6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlSZXNvbHZlT3B0aW9ucyA9IHtcblx0XHRcdGNvbnRlbnRzOiBvcHRpb25zPy5jb250ZW50cyxcblx0XHRcdGZvcmNlUmVhZEZyb21GaWxlOiBvcHRpb25zPy5yZWxvYWQ/LmZvcmNlLFxuXHRcdFx0bGltaXRzOiBvcHRpb25zPy5saW1pdHNcblx0XHR9O1xuXG5cdFx0Ly8gV29ya2luZyBjb3B5IGV4aXN0c1xuXHRcdGlmICh3b3JraW5nQ29weSkge1xuXG5cdFx0XHQvLyBBbHdheXMgcmVsb2FkIGlmIGNvbnRlbnRzIGFyZSBwcm92aWRlZFxuXHRcdFx0aWYgKG9wdGlvbnM/LmNvbnRlbnRzKSB7XG5cdFx0XHRcdHdvcmtpbmdDb3B5UmVzb2x2ZSA9IHdvcmtpbmdDb3B5LnJlc29sdmUocmVzb2x2ZU9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZWxvYWQgYXN5bmMgb3Igc3luYyBiYXNlZCBvbiBvcHRpb25zXG5cdFx0XHRlbHNlIGlmIChvcHRpb25zPy5yZWxvYWQpIHtcblxuXHRcdFx0XHQvLyBBc3luYyByZWxvYWQ6IHRyaWdnZXIgYSByZWxvYWQgYnV0IHJldHVybiBpbW1lZGlhdGVseVxuXHRcdFx0XHRpZiAob3B0aW9ucy5yZWxvYWQuYXN5bmMpIHtcblx0XHRcdFx0XHR3b3JraW5nQ29weVJlc29sdmUgPSBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZShyZXNvbHZlT3B0aW9ucyk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHRpZiAoIXdvcmtpbmdDb3B5LmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTsgLy8gb25seSBsb2cgaWYgdGhlIHdvcmtpbmcgY29weSBpcyBzdGlsbCBhcm91bmRcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTeW5jIHJlbG9hZDogZG8gbm90IHJldHVybiB1bnRpbCB3b3JraW5nIGNvcHkgcmVsb2FkZWRcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0d29ya2luZ0NvcHlSZXNvbHZlID0gd29ya2luZ0NvcHkucmVzb2x2ZShyZXNvbHZlT3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gRG8gbm90IHJlbG9hZFxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHdvcmtpbmdDb3B5UmVzb2x2ZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBkb2VzIG5vdCBleGlzdFxuXHRcdGVsc2Uge1xuXHRcdFx0ZGlkQ3JlYXRlV29ya2luZ0NvcHkgPSB0cnVlO1xuXG5cdFx0XHR3b3JraW5nQ29weSA9IG5ldyBTdG9yZWRGaWxlV29ya2luZ0NvcHkoXG5cdFx0XHRcdHRoaXMud29ya2luZ0NvcHlUeXBlSWQsXG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHR0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHJlc291cmNlKSxcblx0XHRcdFx0dGhpcy5tb2RlbEZhY3RvcnksXG5cdFx0XHRcdGFzeW5jIG9wdGlvbnMgPT4geyBhd2FpdCB0aGlzLnJlc29sdmUocmVzb3VyY2UsIHsgLi4ub3B0aW9ucywgcmVsb2FkOiB7IGFzeW5jOiBmYWxzZSB9IH0pOyB9LFxuXHRcdFx0XHR0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMud29ya2luZ0NvcHlGaWxlU2VydmljZSwgdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLndvcmtpbmdDb3B5QmFja3VwU2VydmljZSwgdGhpcy53b3JraW5nQ29weVNlcnZpY2UsIHRoaXMubm90aWZpY2F0aW9uU2VydmljZSwgdGhpcy53b3JraW5nQ29weUVkaXRvclNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZSwgdGhpcy5lbGV2YXRlZEZpbGVTZXJ2aWNlLCB0aGlzLnByb2dyZXNzU2VydmljZVxuXHRcdFx0KTtcblxuXHRcdFx0d29ya2luZ0NvcHlSZXNvbHZlID0gd29ya2luZ0NvcHkucmVzb2x2ZShyZXNvbHZlT3B0aW9ucyk7XG5cblx0XHRcdHRoaXMucmVnaXN0ZXJXb3JraW5nQ29weSh3b3JraW5nQ29weSk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RvcmUgcGVuZGluZyByZXNvbHZlIHRvIGF2b2lkIHJhY2UgY29uZGl0aW9uc1xuXHRcdHRoaXMubWFwUmVzb3VyY2VUb1BlbmRpbmdXb3JraW5nQ29weVJlc29sdmUuc2V0KHJlc291cmNlLCB3b3JraW5nQ29weVJlc29sdmUpO1xuXG5cdFx0Ly8gTWFrZSBrbm93biB0byBtYW5hZ2VyIChpZiBub3QgYWxyZWFkeSBrbm93bilcblx0XHR0aGlzLmFkZChyZXNvdXJjZSwgd29ya2luZ0NvcHkpO1xuXG5cdFx0Ly8gRW1pdCBzb21lIGV2ZW50cyBpZiB3ZSBjcmVhdGVkIHRoZSB3b3JraW5nIGNvcHlcblx0XHRpZiAoZGlkQ3JlYXRlV29ya2luZ0NvcHkpIHtcblxuXHRcdFx0Ly8gSWYgdGhlIHdvcmtpbmcgY29weSBpcyBkaXJ0eSByaWdodCBmcm9tIHRoZSBiZWdpbm5pbmcsXG5cdFx0XHQvLyBtYWtlIHN1cmUgdG8gZW1pdCB0aGlzIGFzIGFuIGV2ZW50XG5cdFx0XHRpZiAod29ya2luZ0NvcHkuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSh3b3JraW5nQ29weSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHdvcmtpbmdDb3B5UmVzb2x2ZTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHQvLyBBdXRvbWF0aWNhbGx5IGRpc3Bvc2UgdGhlIHdvcmtpbmcgY29weSBpZiB3ZSBjcmVhdGVkXG5cdFx0XHQvLyBpdCBiZWNhdXNlIHdlIGNhbm5vdCBkaXNwb3NlIGEgd29ya2luZyBjb3B5IHdlIGRvIG5vdFxuXHRcdFx0Ly8gb3duIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM4ODUwKVxuXHRcdFx0aWYgKGRpZENyZWF0ZVdvcmtpbmdDb3B5KSB7XG5cdFx0XHRcdHdvcmtpbmdDb3B5LmRpc3Bvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fSBmaW5hbGx5IHtcblxuXHRcdFx0Ly8gUmVtb3ZlIGZyb20gcGVuZGluZyByZXNvbHZlc1xuXHRcdFx0dGhpcy5tYXBSZXNvdXJjZVRvUGVuZGluZ1dvcmtpbmdDb3B5UmVzb2x2ZS5kZWxldGUocmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdC8vIFN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBjYW4gYmUgZGlydHkgaWYgYSBiYWNrdXAgd2FzIHJlc3RvcmVkLCBzbyB3ZSBtYWtlIHN1cmUgdG9cblx0XHQvLyBoYXZlIHRoaXMgZXZlbnQgZGVsaXZlcmVkIGlmIHdlIGNyZWF0ZWQgdGhlIHdvcmtpbmcgY29weSBoZXJlXG5cdFx0aWYgKGRpZENyZWF0ZVdvcmtpbmdDb3B5ICYmIHdvcmtpbmdDb3B5LmlzRGlydHkoKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKHdvcmtpbmdDb3B5KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gd29ya2luZ0NvcHk7XG5cdH1cblxuXHRwcml2YXRlIGpvaW5QZW5kaW5nUmVzb2x2ZXMocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHBlbmRpbmdXb3JraW5nQ29weVJlc29sdmUgPSB0aGlzLm1hcFJlc291cmNlVG9QZW5kaW5nV29ya2luZ0NvcHlSZXNvbHZlLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKCFwZW5kaW5nV29ya2luZ0NvcHlSZXNvbHZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZG9Kb2luUGVuZGluZ1Jlc29sdmVzKHJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Kb2luUGVuZGluZ1Jlc29sdmVzKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFdoaWxlIHdlIGhhdmUgcGVuZGluZyB3b3JraW5nIGNvcHkgcmVzb2x2ZXMsIGVuc3VyZVxuXHRcdC8vIHRvIGF3YWl0IHRoZSBsYXN0IG9uZSBmaW5pc2hpbmcgYmVmb3JlIHJldHVybmluZy5cblx0XHQvLyBUaGlzIHByZXZlbnRzIGEgcmFjZSB3aGVuIG11bHRpcGxlIGNsaWVudHMgYXdhaXRcblx0XHQvLyB0aGUgcGVuZGluZyByZXNvbHZlIGFuZCB0aGVuIGFsbCB0cmlnZ2VyIHRoZSByZXNvbHZlXG5cdFx0Ly8gYXQgdGhlIHNhbWUgdGltZS5cblx0XHRsZXQgY3VycmVudFdvcmtpbmdDb3B5UmVzb2x2ZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0XHR3aGlsZSAodGhpcy5tYXBSZXNvdXJjZVRvUGVuZGluZ1dvcmtpbmdDb3B5UmVzb2x2ZS5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBuZXh0UGVuZGluZ1dvcmtpbmdDb3B5UmVzb2x2ZSA9IHRoaXMubWFwUmVzb3VyY2VUb1BlbmRpbmdXb3JraW5nQ29weVJlc29sdmUuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmIChuZXh0UGVuZGluZ1dvcmtpbmdDb3B5UmVzb2x2ZSA9PT0gY3VycmVudFdvcmtpbmdDb3B5UmVzb2x2ZSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIGFscmVhZHkgYXdhaXRlZCBvbiAtIHJldHVyblxuXHRcdFx0fVxuXG5cdFx0XHRjdXJyZW50V29ya2luZ0NvcHlSZXNvbHZlID0gbmV4dFBlbmRpbmdXb3JraW5nQ29weVJlc29sdmU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBuZXh0UGVuZGluZ1dvcmtpbmdDb3B5UmVzb2x2ZTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIGlnbm9yZSBhbnkgZXJyb3IgaGVyZSwgaXQgd2lsbCBidWJibGUgdG8gdGhlIG9yaWdpbmFsIHJlcXVlc3RvclxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJXb3JraW5nQ29weSh3b3JraW5nQ29weTogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPik6IHZvaWQge1xuXG5cdFx0Ly8gSW5zdGFsbCB3b3JraW5nIGNvcHkgbGlzdGVuZXJzXG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlMaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0d29ya2luZ0NvcHlMaXN0ZW5lcnMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkUmVzb2x2ZSgoKSA9PiB0aGlzLl9vbkRpZFJlc29sdmUuZmlyZSh3b3JraW5nQ29weSkpKTtcblx0XHR3b3JraW5nQ29weUxpc3RlbmVycy5hZGQod29ya2luZ0NvcHkub25EaWRDaGFuZ2VEaXJ0eSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZURpcnR5LmZpcmUod29ya2luZ0NvcHkpKSk7XG5cdFx0d29ya2luZ0NvcHlMaXN0ZW5lcnMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkQ2hhbmdlUmVhZG9ubHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5maXJlKHdvcmtpbmdDb3B5KSkpO1xuXHRcdHdvcmtpbmdDb3B5TGlzdGVuZXJzLmFkZCh3b3JraW5nQ29weS5vbkRpZENoYW5nZU9ycGhhbmVkKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlT3JwaGFuZWQuZmlyZSh3b3JraW5nQ29weSkpKTtcblx0XHR3b3JraW5nQ29weUxpc3RlbmVycy5hZGQod29ya2luZ0NvcHkub25EaWRTYXZlRXJyb3IoKCkgPT4gdGhpcy5fb25EaWRTYXZlRXJyb3IuZmlyZSh3b3JraW5nQ29weSkpKTtcblx0XHR3b3JraW5nQ29weUxpc3RlbmVycy5hZGQod29ya2luZ0NvcHkub25EaWRTYXZlKGUgPT4gdGhpcy5fb25EaWRTYXZlLmZpcmUoeyB3b3JraW5nQ29weSwgLi4uZSB9KSkpO1xuXHRcdHdvcmtpbmdDb3B5TGlzdGVuZXJzLmFkZCh3b3JraW5nQ29weS5vbkRpZFJldmVydCgoKSA9PiB0aGlzLl9vbkRpZFJldmVydC5maXJlKHdvcmtpbmdDb3B5KSkpO1xuXG5cdFx0Ly8gS2VlcCBmb3IgZGlzcG9zYWxcblx0XHR0aGlzLm1hcFJlc291cmNlVG9Xb3JraW5nQ29weUxpc3RlbmVycy5zZXQod29ya2luZ0NvcHkucmVzb3VyY2UsIHdvcmtpbmdDb3B5TGlzdGVuZXJzKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW1vdmUocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHJlbW92ZWQgPSBzdXBlci5yZW1vdmUocmVzb3VyY2UpO1xuXG5cdFx0Ly8gRGlzcG9zZSBhbnkgZXhpc3Rpbmcgd29ya2luZyBjb3B5IGxpc3RlbmVyc1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5TGlzdGVuZXIgPSB0aGlzLm1hcFJlc291cmNlVG9Xb3JraW5nQ29weUxpc3RlbmVycy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICh3b3JraW5nQ29weUxpc3RlbmVyKSB7XG5cdFx0XHRkaXNwb3NlKHdvcmtpbmdDb3B5TGlzdGVuZXIpO1xuXHRcdFx0dGhpcy5tYXBSZXNvdXJjZVRvV29ya2luZ0NvcHlMaXN0ZW5lcnMuZGVsZXRlKHJlc291cmNlKTtcblx0XHR9XG5cblx0XHRpZiAocmVtb3ZlZCkge1xuXHRcdFx0dGhpcy5fb25EaWRSZW1vdmUuZmlyZShyZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlbW92ZWQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTGlmZWN5Y2xlXG5cblx0Y2FuRGlzcG9zZSh3b3JraW5nQ29weTogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPik6IHRydWUgfCBQcm9taXNlPHRydWU+IHtcblxuXHRcdC8vIFF1aWNrIHJldHVybiBpZiB3b3JraW5nIGNvcHkgYWxyZWFkeSBkaXNwb3NlZCBvciBub3QgZGlydHkgYW5kIG5vdCByZXNvbHZpbmdcblx0XHRpZiAoXG5cdFx0XHR3b3JraW5nQ29weS5pc0Rpc3Bvc2VkKCkgfHxcblx0XHRcdCghdGhpcy5tYXBSZXNvdXJjZVRvUGVuZGluZ1dvcmtpbmdDb3B5UmVzb2x2ZS5oYXMod29ya2luZ0NvcHkucmVzb3VyY2UpICYmICF3b3JraW5nQ29weS5pc0RpcnR5KCkpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBQcm9taXNlIGJhc2VkIHJldHVybiBpbiBhbGwgb3RoZXIgY2FzZXNcblx0XHRyZXR1cm4gdGhpcy5kb0NhbkRpc3Bvc2Uod29ya2luZ0NvcHkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0NhbkRpc3Bvc2Uod29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4pOiBQcm9taXNlPHRydWU+IHtcblxuXHRcdC8vIEF3YWl0IGFueSBwZW5kaW5nIHJlc29sdmVzIGZpcnN0IGJlZm9yZSBwcm9jZWVkaW5nXG5cdFx0Y29uc3QgcGVuZGluZ1Jlc29sdmUgPSB0aGlzLmpvaW5QZW5kaW5nUmVzb2x2ZXMod29ya2luZ0NvcHkucmVzb3VyY2UpO1xuXHRcdGlmIChwZW5kaW5nUmVzb2x2ZSkge1xuXHRcdFx0YXdhaXQgcGVuZGluZ1Jlc29sdmU7XG5cblx0XHRcdHJldHVybiB0aGlzLmNhbkRpc3Bvc2Uod29ya2luZ0NvcHkpO1xuXHRcdH1cblxuXHRcdC8vIERpcnR5IHdvcmtpbmcgY29weTogd2UgZG8gbm90IGFsbG93IHRvIGRpc3Bvc2UgZGlydHkgd29ya2luZyBjb3B5c1xuXHRcdC8vIHRvIHByZXZlbnQgZGF0YSBsb3NzIGNhc2VzLiBkaXJ0eSB3b3JraW5nIGNvcHlzIGNhbiBvbmx5IGJlIGRpc3Bvc2VkIHdoZW5cblx0XHQvLyB0aGV5IGFyZSBlaXRoZXIgc2F2ZWQgb3IgcmV2ZXJ0ZWRcblx0XHRpZiAod29ya2luZ0NvcHkuaXNEaXJ0eSgpKSB7XG5cdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2Uod29ya2luZ0NvcHkub25EaWRDaGFuZ2VEaXJ0eSk7XG5cblx0XHRcdHJldHVybiB0aGlzLmNhbkRpc3Bvc2Uod29ya2luZ0NvcHkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHQvLyBDbGVhciBwZW5kaW5nIHdvcmtpbmcgY29weSByZXNvbHZlc1xuXHRcdHRoaXMubWFwUmVzb3VyY2VUb1BlbmRpbmdXb3JraW5nQ29weVJlc29sdmUuY2xlYXIoKTtcblxuXHRcdC8vIERpc3Bvc2UgdGhlIHdvcmtpbmcgY29weSBjaGFuZ2UgbGlzdGVuZXJzXG5cdFx0ZGlzcG9zZSh0aGlzLm1hcFJlc291cmNlVG9Xb3JraW5nQ29weUxpc3RlbmVycy52YWx1ZXMoKSk7XG5cdFx0dGhpcy5tYXBSZXNvdXJjZVRvV29ya2luZ0NvcHlMaXN0ZW5lcnMuY2xlYXIoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQixlQUE0QjtBQUN0RCxTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLHVCQUF1QixrQ0FBeU87QUFDelEsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxVQUFVLHFCQUFxQjtBQUN4QyxTQUEyQixnQkFBZ0IsZUFBZSxvQkFBc0c7QUFDaEssU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxXQUFXO0FBRXBCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsK0JBQXFEO0FBQzlELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsa0NBQStEO0FBQ3hFLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsYUFBYTtBQUN0QixTQUFTLHlCQUF5QjtB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
