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
import { DisposableMap, DisposableStore } from "../../../base/common/lifecycle.js";
import { FileOperation, IFileService } from "../../../platform/files/common/files.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { localize } from "../../../nls.js";
import { IWorkingCopyFileService } from "../../services/workingCopy/common/workingCopyFileService.js";
import { IBulkEditService } from "../../../editor/browser/services/bulkEditService.js";
import { IProgressService, ProgressLocation } from "../../../platform/progress/common/progress.js";
import { raceCancellation } from "../../../base/common/async.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import Severity from "../../../base/common/severity.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { Action2, registerAction2 } from "../../../platform/actions/common/actions.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { reviveWorkspaceEditDto } from "./mainThreadBulkEdits.js";
import { URI } from "../../../base/common/uri.js";
let MainThreadFileSystemEventService = class {
  constructor(extHostContext, _fileService, workingCopyFileService, bulkEditService, progressService, dialogService, storageService, logService, envService, uriIdentService, _logService) {
    this._fileService = _fileService;
    this._logService = _logService;
    this._listener = new DisposableStore();
    this._watches = new DisposableMap();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystemEventService);
    this._listener.add(_fileService.onDidFilesChange((event) => {
      this._proxy.$onFileEvent({
        created: event.rawAdded,
        changed: event.rawUpdated,
        deleted: event.rawDeleted
      });
    }));
    const that = this;
    const fileOperationParticipant = new class {
      async participate(files, operation, undoInfo, timeout, token) {
        if (undoInfo?.isUndoing) {
          return;
        }
        const cts = new CancellationTokenSource(token);
        const timer = setTimeout(() => cts.cancel(), timeout);
        const data = await progressService.withProgress({
          location: ProgressLocation.Notification,
          title: this._progressLabel(operation),
          cancellable: true,
          delay: Math.min(timeout / 2, 3e3)
        }, () => {
          const onWillEvent = that._proxy.$onWillRunFileOperation(operation, files, timeout, cts.token);
          return raceCancellation(onWillEvent, cts.token);
        }, () => {
          cts.cancel();
        }).finally(() => {
          cts.dispose();
          clearTimeout(timer);
        });
        if (!data || data.edit.edits.length === 0) {
          return;
        }
        const needsConfirmation = data.edit.edits.some((edit) => edit.metadata?.needsConfirmation);
        let showPreview = storageService.getBoolean(MainThreadFileSystemEventService.MementoKeyAdditionalEdits, StorageScope.PROFILE);
        if (envService.extensionTestsLocationURI) {
          showPreview = false;
        }
        if (showPreview === void 0) {
          let message;
          if (data.extensionNames.length === 1) {
            if (operation === FileOperation.CREATE) {
              message = localize("ask.1.create", "Extension '{0}' wants to make refactoring changes with this file creation", data.extensionNames[0]);
            } else if (operation === FileOperation.COPY) {
              message = localize("ask.1.copy", "Extension '{0}' wants to make refactoring changes with this file copy", data.extensionNames[0]);
            } else if (operation === FileOperation.MOVE) {
              message = localize("ask.1.move", "Extension '{0}' wants to make refactoring changes with this file move", data.extensionNames[0]);
            } else {
              message = localize("ask.1.delete", "Extension '{0}' wants to make refactoring changes with this file deletion", data.extensionNames[0]);
            }
          } else {
            if (operation === FileOperation.CREATE) {
              message = localize({ key: "ask.N.create", comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file creation", data.extensionNames.length);
            } else if (operation === FileOperation.COPY) {
              message = localize({ key: "ask.N.copy", comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file copy", data.extensionNames.length);
            } else if (operation === FileOperation.MOVE) {
              message = localize({ key: "ask.N.move", comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file move", data.extensionNames.length);
            } else {
              message = localize({ key: "ask.N.delete", comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file deletion", data.extensionNames.length);
            }
          }
          if (needsConfirmation) {
            const { confirmed } = await dialogService.confirm({
              type: Severity.Info,
              message,
              primaryButton: localize("preview", "Show &&Preview"),
              cancelButton: localize("cancel", "Skip Changes")
            });
            showPreview = true;
            if (!confirmed) {
              return;
            }
          } else {
            let Choice;
            ((Choice2) => {
              Choice2[Choice2["OK"] = 0] = "OK";
              Choice2[Choice2["Preview"] = 1] = "Preview";
              Choice2[Choice2["Cancel"] = 2] = "Cancel";
            })(Choice || (Choice = {}));
            const { result, checkboxChecked } = await dialogService.prompt({
              type: Severity.Info,
              message,
              buttons: [
                {
                  label: localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK"),
                  run: () => 0 /* OK */
                },
                {
                  label: localize({ key: "preview", comment: ["&& denotes a mnemonic"] }, "Show &&Preview"),
                  run: () => 1 /* Preview */
                }
              ],
              cancelButton: {
                label: localize("cancel", "Skip Changes"),
                run: () => 2 /* Cancel */
              },
              checkbox: { label: localize("again", "Do not ask me again") }
            });
            if (result === 2 /* Cancel */) {
              return;
            }
            showPreview = result === 1 /* Preview */;
            if (checkboxChecked) {
              storageService.store(MainThreadFileSystemEventService.MementoKeyAdditionalEdits, showPreview, StorageScope.PROFILE, StorageTarget.USER);
            }
          }
        }
        logService.info("[onWill-handler] applying additional workspace edit from extensions", data.extensionNames);
        await bulkEditService.apply(
          reviveWorkspaceEditDto(data.edit, uriIdentService),
          { undoRedoGroupId: undoInfo?.undoRedoGroupId, showPreview }
        );
      }
      _progressLabel(operation) {
        switch (operation) {
          case FileOperation.CREATE:
            return localize("msg-create", "Running 'File Create' participants...");
          case FileOperation.MOVE:
            return localize("msg-rename", "Running 'File Rename' participants...");
          case FileOperation.COPY:
            return localize("msg-copy", "Running 'File Copy' participants...");
          case FileOperation.DELETE:
            return localize("msg-delete", "Running 'File Delete' participants...");
          case FileOperation.WRITE:
            return localize("msg-write", "Running 'File Write' participants...");
        }
      }
    }();
    this._listener.add(workingCopyFileService.addFileOperationParticipant(fileOperationParticipant));
    this._listener.add(workingCopyFileService.onDidRunWorkingCopyFileOperation((e) => this._proxy.$onDidRunFileOperation(e.operation, e.files)));
  }
  async $watch(extensionId, session, resource, unvalidatedOpts, correlate) {
    const uri = URI.revive(resource);
    const canHandleWatcher = await this._fileService.canHandleResource(uri);
    if (!canHandleWatcher) {
      this._logService.warn(`MainThreadFileSystemEventService#$watch(): cannot watch resource as its scheme is not handled by the file service (extension: ${extensionId}, path: ${uri.toString(true)})`);
    }
    const opts = {
      ...unvalidatedOpts
    };
    if (opts.recursive) {
      try {
        const stat = await this._fileService.stat(uri);
        if (!stat.isDirectory) {
          opts.recursive = false;
        }
      } catch (error) {
      }
    }
    if (correlate && !opts.recursive) {
      this._logService.trace(`MainThreadFileSystemEventService#$watch(): request to start watching correlated (extension: ${extensionId}, path: ${uri.toString(true)}, recursive: ${opts.recursive}, session: ${session}, excludes: ${JSON.stringify(opts.excludes)}, includes: ${JSON.stringify(opts.includes)})`);
      const watcherDisposables = new DisposableStore();
      const subscription = watcherDisposables.add(this._fileService.createWatcher(uri, { ...opts, recursive: false }));
      watcherDisposables.add(subscription.onDidChange((event) => {
        this._proxy.$onFileEvent({
          session,
          created: event.rawAdded,
          changed: event.rawUpdated,
          deleted: event.rawDeleted
        });
      }));
      this._watches.set(session, watcherDisposables);
    } else {
      this._logService.trace(`MainThreadFileSystemEventService#$watch(): request to start watching uncorrelated (extension: ${extensionId}, path: ${uri.toString(true)}, recursive: ${opts.recursive}, session: ${session}, excludes: ${JSON.stringify(opts.excludes)}, includes: ${JSON.stringify(opts.includes)})`);
      const subscription = this._fileService.watch(uri, opts);
      this._watches.set(session, subscription);
    }
  }
  $unwatch(session) {
    if (this._watches.has(session)) {
      this._logService.trace(`MainThreadFileSystemEventService#$unwatch(): request to stop watching (session: ${session})`);
      this._watches.deleteAndDispose(session);
    }
  }
  dispose() {
    this._listener.dispose();
    this._watches.dispose();
  }
};
MainThreadFileSystemEventService.MementoKeyAdditionalEdits = `file.particpants.additionalEdits`;
MainThreadFileSystemEventService = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadFileSystemEventService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IWorkingCopyFileService),
  __decorateParam(3, IBulkEditService),
  __decorateParam(4, IProgressService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IEnvironmentService),
  __decorateParam(9, IUriIdentityService),
  __decorateParam(10, ILogService)
], MainThreadFileSystemEventService);
registerAction2(class ResetMemento extends Action2 {
  constructor() {
    super({
      id: "files.participants.resetChoice",
      title: {
        value: localize("label", "Reset choice for 'File operation needs preview'"),
        original: `Reset choice for 'File operation needs preview'`
      },
      f1: true
    });
  }
  run(accessor) {
    accessor.get(IStorageService).remove(MainThreadFileSystemEventService.MementoKeyAdditionalEdits, StorageScope.PROFILE);
  }
});
export {
  MainThreadFileSystemEventService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkRmlsZVN5c3RlbUV2ZW50U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uLCBJRmlsZVNlcnZpY2UsIElXYXRjaE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbnRleHQsIEV4dEhvc3RGaWxlU3lzdGVtRXZlbnRTZXJ2aWNlU2hhcGUsIE1haW5Db250ZXh0LCBNYWluVGhyZWFkRmlsZVN5c3RlbUV2ZW50U2VydmljZVNoYXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RmlsZU9wZXJhdGlvblBhcnRpY2lwYW50LCBJV29ya2luZ0NvcHlGaWxlU2VydmljZSwgU291cmNlVGFyZ2V0UGFpciwgSUZpbGVPcGVyYXRpb25VbmRvUmVkb0luZm8gfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IHJldml2ZVdvcmtzcGFjZUVkaXREdG8gfSBmcm9tICcuL21haW5UaHJlYWRCdWxrRWRpdHMuanMnO1xuaW1wb3J0IHsgVXJpQ29tcG9uZW50cywgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRGaWxlU3lzdGVtRXZlbnRTZXJ2aWNlKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRGaWxlU3lzdGVtRXZlbnRTZXJ2aWNlIGltcGxlbWVudHMgTWFpblRocmVhZEZpbGVTeXN0ZW1FdmVudFNlcnZpY2VTaGFwZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IE1lbWVudG9LZXlBZGRpdGlvbmFsRWRpdHMgPSBgZmlsZS5wYXJ0aWNwYW50cy5hZGRpdGlvbmFsRWRpdHNgO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0RmlsZVN5c3RlbUV2ZW50U2VydmljZVNoYXBlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpc3RlbmVyID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93YXRjaGVzID0gbmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlGaWxlU2VydmljZSB3b3JraW5nQ29weUZpbGVTZXJ2aWNlOiBJV29ya2luZ0NvcHlGaWxlU2VydmljZSxcblx0XHRASUJ1bGtFZGl0U2VydmljZSBidWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudlNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0RmlsZVN5c3RlbUV2ZW50U2VydmljZSk7XG5cblx0XHR0aGlzLl9saXN0ZW5lci5hZGQoX2ZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZXZlbnQgPT4ge1xuXHRcdFx0dGhpcy5fcHJveHkuJG9uRmlsZUV2ZW50KHtcblx0XHRcdFx0Y3JlYXRlZDogZXZlbnQucmF3QWRkZWQsXG5cdFx0XHRcdGNoYW5nZWQ6IGV2ZW50LnJhd1VwZGF0ZWQsXG5cdFx0XHRcdGRlbGV0ZWQ6IGV2ZW50LnJhd0RlbGV0ZWRcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGNvbnN0IGZpbGVPcGVyYXRpb25QYXJ0aWNpcGFudCA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElXb3JraW5nQ29weUZpbGVPcGVyYXRpb25QYXJ0aWNpcGFudCB7XG5cdFx0XHRhc3luYyBwYXJ0aWNpcGF0ZShmaWxlczogU291cmNlVGFyZ2V0UGFpcltdLCBvcGVyYXRpb246IEZpbGVPcGVyYXRpb24sIHVuZG9JbmZvOiBJRmlsZU9wZXJhdGlvblVuZG9SZWRvSW5mbyB8IHVuZGVmaW5lZCwgdGltZW91dDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdFx0aWYgKHVuZG9JbmZvPy5pc1VuZG9pbmcpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXHRcdFx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4gY3RzLmNhbmNlbCgpLCB0aW1lb3V0KTtcblxuXHRcdFx0XHRjb25zdCBkYXRhID0gYXdhaXQgcHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdHRpdGxlOiB0aGlzLl9wcm9ncmVzc0xhYmVsKG9wZXJhdGlvbiksXG5cdFx0XHRcdFx0Y2FuY2VsbGFibGU6IHRydWUsXG5cdFx0XHRcdFx0ZGVsYXk6IE1hdGgubWluKHRpbWVvdXQgLyAyLCAzMDAwKVxuXHRcdFx0XHR9LCAoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gcmFjZSBleHRlbnNpb24gaG9zdCBldmVudCBkZWxpdmVyeSBhZ2FpbnN0IHRpbWVvdXQgQU5EIHVzZXItY2FuY2VsXG5cdFx0XHRcdFx0Y29uc3Qgb25XaWxsRXZlbnQgPSB0aGF0Ll9wcm94eS4kb25XaWxsUnVuRmlsZU9wZXJhdGlvbihvcGVyYXRpb24sIGZpbGVzLCB0aW1lb3V0LCBjdHMudG9rZW4pO1xuXHRcdFx0XHRcdHJldHVybiByYWNlQ2FuY2VsbGF0aW9uKG9uV2lsbEV2ZW50LCBjdHMudG9rZW4pO1xuXHRcdFx0XHR9LCAoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gdXNlci1jYW5jZWxcblx0XHRcdFx0XHRjdHMuY2FuY2VsKCk7XG5cblx0XHRcdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoIWRhdGEgfHwgZGF0YS5lZGl0LmVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIGNhbmNlbGxlZCwgbm8gcmVwbHksIG9yIG5vIGVkaXRzXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbmVlZHNDb25maXJtYXRpb24gPSBkYXRhLmVkaXQuZWRpdHMuc29tZShlZGl0ID0+IGVkaXQubWV0YWRhdGE/Lm5lZWRzQ29uZmlybWF0aW9uKTtcblx0XHRcdFx0bGV0IHNob3dQcmV2aWV3ID0gc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihNYWluVGhyZWFkRmlsZVN5c3RlbUV2ZW50U2VydmljZS5NZW1lbnRvS2V5QWRkaXRpb25hbEVkaXRzLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cblx0XHRcdFx0aWYgKGVudlNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSkge1xuXHRcdFx0XHRcdC8vIGRvbid0IHNob3cgZGlhbG9nIGluIHRlc3RzXG5cdFx0XHRcdFx0c2hvd1ByZXZpZXcgPSBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzaG93UHJldmlldyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Ly8gc2hvdyBhIHVzZXIgZmFjaW5nIG1lc3NhZ2VcblxuXHRcdFx0XHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cdFx0XHRcdFx0aWYgKGRhdGEuZXh0ZW5zaW9uTmFtZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRpZiAob3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLkNSRUFURSkge1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2Fzay4xLmNyZWF0ZScsIFwiRXh0ZW5zaW9uICd7MH0nIHdhbnRzIHRvIG1ha2UgcmVmYWN0b3JpbmcgY2hhbmdlcyB3aXRoIHRoaXMgZmlsZSBjcmVhdGlvblwiLCBkYXRhLmV4dGVuc2lvbk5hbWVzWzBdKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAob3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLkNPUFkpIHtcblx0XHRcdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdhc2suMS5jb3B5JywgXCJFeHRlbnNpb24gJ3swfScgd2FudHMgdG8gbWFrZSByZWZhY3RvcmluZyBjaGFuZ2VzIHdpdGggdGhpcyBmaWxlIGNvcHlcIiwgZGF0YS5leHRlbnNpb25OYW1lc1swXSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKG9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5NT1ZFKSB7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnYXNrLjEubW92ZScsIFwiRXh0ZW5zaW9uICd7MH0nIHdhbnRzIHRvIG1ha2UgcmVmYWN0b3JpbmcgY2hhbmdlcyB3aXRoIHRoaXMgZmlsZSBtb3ZlXCIsIGRhdGEuZXh0ZW5zaW9uTmFtZXNbMF0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIC8qIGlmIChvcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uREVMRVRFKSAqLyB7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnYXNrLjEuZGVsZXRlJywgXCJFeHRlbnNpb24gJ3swfScgd2FudHMgdG8gbWFrZSByZWZhY3RvcmluZyBjaGFuZ2VzIHdpdGggdGhpcyBmaWxlIGRlbGV0aW9uXCIsIGRhdGEuZXh0ZW5zaW9uTmFtZXNbMF0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpZiAob3BlcmF0aW9uID09PSBGaWxlT3BlcmF0aW9uLkNSRUFURSkge1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoeyBrZXk6ICdhc2suTi5jcmVhdGUnLCBjb21tZW50OiBbJ3swfSBpcyBhIG51bWJlciwgZS5nIFwiMyBleHRlbnNpb25zIHdhbnQuLi5cIiddIH0sIFwiezB9IGV4dGVuc2lvbnMgd2FudCB0byBtYWtlIHJlZmFjdG9yaW5nIGNoYW5nZXMgd2l0aCB0aGlzIGZpbGUgY3JlYXRpb25cIiwgZGF0YS5leHRlbnNpb25OYW1lcy5sZW5ndGgpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChvcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uQ09QWSkge1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoeyBrZXk6ICdhc2suTi5jb3B5JywgY29tbWVudDogWyd7MH0gaXMgYSBudW1iZXIsIGUuZyBcIjMgZXh0ZW5zaW9ucyB3YW50Li4uXCInXSB9LCBcInswfSBleHRlbnNpb25zIHdhbnQgdG8gbWFrZSByZWZhY3RvcmluZyBjaGFuZ2VzIHdpdGggdGhpcyBmaWxlIGNvcHlcIiwgZGF0YS5leHRlbnNpb25OYW1lcy5sZW5ndGgpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChvcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uTU9WRSkge1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoeyBrZXk6ICdhc2suTi5tb3ZlJywgY29tbWVudDogWyd7MH0gaXMgYSBudW1iZXIsIGUuZyBcIjMgZXh0ZW5zaW9ucyB3YW50Li4uXCInXSB9LCBcInswfSBleHRlbnNpb25zIHdhbnQgdG8gbWFrZSByZWZhY3RvcmluZyBjaGFuZ2VzIHdpdGggdGhpcyBmaWxlIG1vdmVcIiwgZGF0YS5leHRlbnNpb25OYW1lcy5sZW5ndGgpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIC8qIGlmIChvcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uREVMRVRFKSAqLyB7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSh7IGtleTogJ2Fzay5OLmRlbGV0ZScsIGNvbW1lbnQ6IFsnezB9IGlzIGEgbnVtYmVyLCBlLmcgXCIzIGV4dGVuc2lvbnMgd2FudC4uLlwiJ10gfSwgXCJ7MH0gZXh0ZW5zaW9ucyB3YW50IHRvIG1ha2UgcmVmYWN0b3JpbmcgY2hhbmdlcyB3aXRoIHRoaXMgZmlsZSBkZWxldGlvblwiLCBkYXRhLmV4dGVuc2lvbk5hbWVzLmxlbmd0aCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKG5lZWRzQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0XHQvLyBlZGl0IHdoaWNoIG5lZWRzIGNvbmZpcm1hdGlvbiAtPiBhbHdheXMgc2hvdyBkaWFsb2dcblx0XHRcdFx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgncHJldmlldycsIFwiU2hvdyAmJlByZXZpZXdcIiksXG5cdFx0XHRcdFx0XHRcdGNhbmNlbEJ1dHRvbjogbG9jYWxpemUoJ2NhbmNlbCcsIFwiU2tpcCBDaGFuZ2VzXCIpXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHNob3dQcmV2aWV3ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHRcdC8vIG5vIGNoYW5nZXMgd2FudGVkXG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gY2hvaWNlXG5cdFx0XHRcdFx0XHRlbnVtIENob2ljZSB7XG5cdFx0XHRcdFx0XHRcdE9LID0gMCxcblx0XHRcdFx0XHRcdFx0UHJldmlldyA9IDEsXG5cdFx0XHRcdFx0XHRcdENhbmNlbCA9IDJcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHsgcmVzdWx0LCBjaGVja2JveENoZWNrZWQgfSA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UucHJvbXB0PENob2ljZT4oe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnb2snLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZPS1wiKSxcblx0XHRcdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gQ2hvaWNlLk9LXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdwcmV2aWV3JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlNob3cgJiZQcmV2aWV3XCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBDaG9pY2UuUHJldmlld1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjYW5jZWwnLCBcIlNraXAgQ2hhbmdlc1wiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IENob2ljZS5DYW5jZWxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0Y2hlY2tib3g6IHsgbGFiZWw6IGxvY2FsaXplKCdhZ2FpbicsIFwiRG8gbm90IGFzayBtZSBhZ2FpblwiKSB9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGlmIChyZXN1bHQgPT09IENob2ljZS5DYW5jZWwpIHtcblx0XHRcdFx0XHRcdFx0Ly8gbm8gY2hhbmdlcyB3YW50ZWQsIGRvbid0IHBlcnNpc3QgY2FuY2VsIG9wdGlvblxuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRzaG93UHJldmlldyA9IHJlc3VsdCA9PT0gQ2hvaWNlLlByZXZpZXc7XG5cdFx0XHRcdFx0XHRpZiAoY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKE1haW5UaHJlYWRGaWxlU3lzdGVtRXZlbnRTZXJ2aWNlLk1lbWVudG9LZXlBZGRpdGlvbmFsRWRpdHMsIHNob3dQcmV2aWV3LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsb2dTZXJ2aWNlLmluZm8oJ1tvbldpbGwtaGFuZGxlcl0gYXBwbHlpbmcgYWRkaXRpb25hbCB3b3Jrc3BhY2UgZWRpdCBmcm9tIGV4dGVuc2lvbnMnLCBkYXRhLmV4dGVuc2lvbk5hbWVzKTtcblxuXHRcdFx0XHRhd2FpdCBidWxrRWRpdFNlcnZpY2UuYXBwbHkoXG5cdFx0XHRcdFx0cmV2aXZlV29ya3NwYWNlRWRpdER0byhkYXRhLmVkaXQsIHVyaUlkZW50U2VydmljZSksXG5cdFx0XHRcdFx0eyB1bmRvUmVkb0dyb3VwSWQ6IHVuZG9JbmZvPy51bmRvUmVkb0dyb3VwSWQsIHNob3dQcmV2aWV3IH1cblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0cHJpdmF0ZSBfcHJvZ3Jlc3NMYWJlbChvcGVyYXRpb246IEZpbGVPcGVyYXRpb24pOiBzdHJpbmcge1xuXHRcdFx0XHRzd2l0Y2ggKG9wZXJhdGlvbikge1xuXHRcdFx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvbi5DUkVBVEU6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21zZy1jcmVhdGUnLCBcIlJ1bm5pbmcgJ0ZpbGUgQ3JlYXRlJyBwYXJ0aWNpcGFudHMuLi5cIik7XG5cdFx0XHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uLk1PVkU6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21zZy1yZW5hbWUnLCBcIlJ1bm5pbmcgJ0ZpbGUgUmVuYW1lJyBwYXJ0aWNpcGFudHMuLi5cIik7XG5cdFx0XHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uLkNPUFk6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21zZy1jb3B5JywgXCJSdW5uaW5nICdGaWxlIENvcHknIHBhcnRpY2lwYW50cy4uLlwiKTtcblx0XHRcdFx0XHRjYXNlIEZpbGVPcGVyYXRpb24uREVMRVRFOlxuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdtc2ctZGVsZXRlJywgXCJSdW5uaW5nICdGaWxlIERlbGV0ZScgcGFydGljaXBhbnRzLi4uXCIpO1xuXHRcdFx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvbi5XUklURTpcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbXNnLXdyaXRlJywgXCJSdW5uaW5nICdGaWxlIFdyaXRlJyBwYXJ0aWNpcGFudHMuLi5cIik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gQkVGT1JFIGZpbGUgb3BlcmF0aW9uXG5cdFx0dGhpcy5fbGlzdGVuZXIuYWRkKHdvcmtpbmdDb3B5RmlsZVNlcnZpY2UuYWRkRmlsZU9wZXJhdGlvblBhcnRpY2lwYW50KGZpbGVPcGVyYXRpb25QYXJ0aWNpcGFudCkpO1xuXG5cdFx0Ly8gQUZURVIgZmlsZSBvcGVyYXRpb25cblx0XHR0aGlzLl9saXN0ZW5lci5hZGQod29ya2luZ0NvcHlGaWxlU2VydmljZS5vbkRpZFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlID0+IHRoaXMuX3Byb3h5LiRvbkRpZFJ1bkZpbGVPcGVyYXRpb24oZS5vcGVyYXRpb24sIGUuZmlsZXMpKSk7XG5cdH1cblxuXHRhc3luYyAkd2F0Y2goZXh0ZW5zaW9uSWQ6IHN0cmluZywgc2Vzc2lvbjogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgdW52YWxpZGF0ZWRPcHRzOiBJV2F0Y2hPcHRpb25zLCBjb3JyZWxhdGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucmV2aXZlKHJlc291cmNlKTtcblxuXHRcdGNvbnN0IGNhbkhhbmRsZVdhdGNoZXIgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jYW5IYW5kbGVSZXNvdXJjZSh1cmkpO1xuXHRcdGlmICghY2FuSGFuZGxlV2F0Y2hlcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBNYWluVGhyZWFkRmlsZVN5c3RlbUV2ZW50U2VydmljZSMkd2F0Y2goKTogY2Fubm90IHdhdGNoIHJlc291cmNlIGFzIGl0cyBzY2hlbWUgaXMgbm90IGhhbmRsZWQgYnkgdGhlIGZpbGUgc2VydmljZSAoZXh0ZW5zaW9uOiAke2V4dGVuc2lvbklkfSwgcGF0aDogJHt1cmkudG9TdHJpbmcodHJ1ZSl9KWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdHM6IElXYXRjaE9wdGlvbnMgPSB7XG5cdFx0XHQuLi51bnZhbGlkYXRlZE9wdHNcblx0XHR9O1xuXG5cdFx0Ly8gQ29udmVydCBhIHJlY3Vyc2l2ZSB3YXRjaGVyIHRvIGEgZmxhdCB3YXRjaGVyIGlmIHRoZSBwYXRoXG5cdFx0Ly8gdHVybnMgb3V0IHRvIG5vdCBiZSBhIGZvbGRlci4gUmVjdXJzaXZlIHdhdGNoaW5nIGlzIG9ubHlcblx0XHQvLyBwb3NzaWJsZSBvbiBmb2xkZXJzLCBzbyB3ZSBoZWxwIGFsbCBmaWxlIHdhdGNoZXJzIGJ5IGNoZWNraW5nXG5cdFx0Ly8gZWFybHkuXG5cdFx0aWYgKG9wdHMucmVjdXJzaXZlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uuc3RhdCh1cmkpO1xuXHRcdFx0XHRpZiAoIXN0YXQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRvcHRzLnJlY3Vyc2l2ZSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDb3JyZWxhdGVkIGZpbGUgd2F0Y2hpbmc6IHVzZSBhbiBleGNsdXNpdmUgYGNyZWF0ZVdhdGNoZXIoKWBcblx0XHQvLyBOb3RlOiBjdXJyZW50bHkgbm90IGVuYWJsZWQgZm9yIGV4dGVuc2lvbnMgKGJ1dCBsZWF2aW5nIGluIGluIGNhc2Ugb2YgZnV0dXJlIHVzYWdlKVxuXHRcdGlmIChjb3JyZWxhdGUgJiYgIW9wdHMucmVjdXJzaXZlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBNYWluVGhyZWFkRmlsZVN5c3RlbUV2ZW50U2VydmljZSMkd2F0Y2goKTogcmVxdWVzdCB0byBzdGFydCB3YXRjaGluZyBjb3JyZWxhdGVkIChleHRlbnNpb246ICR7ZXh0ZW5zaW9uSWR9LCBwYXRoOiAke3VyaS50b1N0cmluZyh0cnVlKX0sIHJlY3Vyc2l2ZTogJHtvcHRzLnJlY3Vyc2l2ZX0sIHNlc3Npb246ICR7c2Vzc2lvbn0sIGV4Y2x1ZGVzOiAke0pTT04uc3RyaW5naWZ5KG9wdHMuZXhjbHVkZXMpfSwgaW5jbHVkZXM6ICR7SlNPTi5zdHJpbmdpZnkob3B0cy5pbmNsdWRlcyl9KWApO1xuXG5cdFx0XHRjb25zdCB3YXRjaGVyRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSB3YXRjaGVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2ZpbGVTZXJ2aWNlLmNyZWF0ZVdhdGNoZXIodXJpLCB7IC4uLm9wdHMsIHJlY3Vyc2l2ZTogZmFsc2UgfSkpO1xuXHRcdFx0d2F0Y2hlckRpc3Bvc2FibGVzLmFkZChzdWJzY3JpcHRpb24ub25EaWRDaGFuZ2UoZXZlbnQgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25GaWxlRXZlbnQoe1xuXHRcdFx0XHRcdHNlc3Npb24sXG5cdFx0XHRcdFx0Y3JlYXRlZDogZXZlbnQucmF3QWRkZWQsXG5cdFx0XHRcdFx0Y2hhbmdlZDogZXZlbnQucmF3VXBkYXRlZCxcblx0XHRcdFx0XHRkZWxldGVkOiBldmVudC5yYXdEZWxldGVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl93YXRjaGVzLnNldChzZXNzaW9uLCB3YXRjaGVyRGlzcG9zYWJsZXMpO1xuXHRcdH1cblxuXHRcdC8vIFVuY29ycmVsYXRlZCBmaWxlIHdhdGNoaW5nOiB2aWEgc2hhcmVkIGB3YXRjaCgpYFxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTWFpblRocmVhZEZpbGVTeXN0ZW1FdmVudFNlcnZpY2UjJHdhdGNoKCk6IHJlcXVlc3QgdG8gc3RhcnQgd2F0Y2hpbmcgdW5jb3JyZWxhdGVkIChleHRlbnNpb246ICR7ZXh0ZW5zaW9uSWR9LCBwYXRoOiAke3VyaS50b1N0cmluZyh0cnVlKX0sIHJlY3Vyc2l2ZTogJHtvcHRzLnJlY3Vyc2l2ZX0sIHNlc3Npb246ICR7c2Vzc2lvbn0sIGV4Y2x1ZGVzOiAke0pTT04uc3RyaW5naWZ5KG9wdHMuZXhjbHVkZXMpfSwgaW5jbHVkZXM6ICR7SlNPTi5zdHJpbmdpZnkob3B0cy5pbmNsdWRlcyl9KWApO1xuXG5cdFx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSB0aGlzLl9maWxlU2VydmljZS53YXRjaCh1cmksIG9wdHMpO1xuXHRcdFx0dGhpcy5fd2F0Y2hlcy5zZXQoc2Vzc2lvbiwgc3Vic2NyaXB0aW9uKTtcblx0XHR9XG5cdH1cblxuXHQkdW53YXRjaChzZXNzaW9uOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd2F0Y2hlcy5oYXMoc2Vzc2lvbikpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE1haW5UaHJlYWRGaWxlU3lzdGVtRXZlbnRTZXJ2aWNlIyR1bndhdGNoKCk6IHJlcXVlc3QgdG8gc3RvcCB3YXRjaGluZyAoc2Vzc2lvbjogJHtzZXNzaW9ufSlgKTtcblx0XHRcdHRoaXMuX3dhdGNoZXMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl93YXRjaGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVzZXRNZW1lbnRvIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZmlsZXMucGFydGljaXBhbnRzLnJlc2V0Q2hvaWNlJyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgnbGFiZWwnLCBcIlJlc2V0IGNob2ljZSBmb3IgJ0ZpbGUgb3BlcmF0aW9uIG5lZWRzIHByZXZpZXcnXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogYFJlc2V0IGNob2ljZSBmb3IgJ0ZpbGUgb3BlcmF0aW9uIG5lZWRzIHByZXZpZXcnYFxuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0YWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSkucmVtb3ZlKE1haW5UaHJlYWRGaWxlU3lzdGVtRXZlbnRTZXJ2aWNlLk1lbWVudG9LZXlBZGRp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
