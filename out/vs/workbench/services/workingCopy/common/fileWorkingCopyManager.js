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
import { Emitter, Event } from "../../../../base/common/event.js";
import { Promises } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { toLocalResource, joinPath, isEqual, basename, dirname } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { IFileDialogService, IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { SaveSourceRegistry } from "../../../common/editor.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IPathService } from "../../path/common/pathService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { StoredFileWorkingCopyState } from "./storedFileWorkingCopy.js";
import { StoredFileWorkingCopyManager } from "./storedFileWorkingCopyManager.js";
import { UntitledFileWorkingCopy } from "./untitledFileWorkingCopy.js";
import { UntitledFileWorkingCopyManager } from "./untitledFileWorkingCopyManager.js";
import { IWorkingCopyFileService } from "./workingCopyFileService.js";
import { SnapshotContext } from "./fileWorkingCopy.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IElevatedFileService } from "../../files/common/elevatedFileService.js";
import { IFilesConfigurationService } from "../../filesConfiguration/common/filesConfigurationService.js";
import { ILifecycleService } from "../../lifecycle/common/lifecycle.js";
import { IWorkingCopyBackupService } from "./workingCopyBackup.js";
import { IWorkingCopyEditorService } from "./workingCopyEditorService.js";
import { IWorkingCopyService } from "./workingCopyService.js";
import { Schemas } from "../../../../base/common/network.js";
import { IDecorationsService } from "../../decorations/common/decorations.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { listErrorForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IProgressService } from "../../../../platform/progress/common/progress.js";
let FileWorkingCopyManager = class extends Disposable {
  constructor(workingCopyTypeId, storedWorkingCopyModelFactory, untitledWorkingCopyModelFactory, fileService, lifecycleService, labelService, logService, workingCopyFileService, workingCopyBackupService, uriIdentityService, fileDialogService, filesConfigurationService, workingCopyService, notificationService, workingCopyEditorService, editorService, elevatedFileService, pathService, environmentService, dialogService, decorationsService, progressService) {
    super();
    this.workingCopyTypeId = workingCopyTypeId;
    this.storedWorkingCopyModelFactory = storedWorkingCopyModelFactory;
    this.untitledWorkingCopyModelFactory = untitledWorkingCopyModelFactory;
    this.fileService = fileService;
    this.logService = logService;
    this.workingCopyFileService = workingCopyFileService;
    this.uriIdentityService = uriIdentityService;
    this.fileDialogService = fileDialogService;
    this.filesConfigurationService = filesConfigurationService;
    this.pathService = pathService;
    this.environmentService = environmentService;
    this.dialogService = dialogService;
    this.decorationsService = decorationsService;
    this.stored = this._register(new StoredFileWorkingCopyManager(
      this.workingCopyTypeId,
      this.storedWorkingCopyModelFactory,
      fileService,
      lifecycleService,
      labelService,
      logService,
      workingCopyFileService,
      workingCopyBackupService,
      uriIdentityService,
      filesConfigurationService,
      workingCopyService,
      notificationService,
      workingCopyEditorService,
      editorService,
      elevatedFileService,
      progressService
    ));
    this.untitled = this._register(new UntitledFileWorkingCopyManager(
      this.workingCopyTypeId,
      this.untitledWorkingCopyModelFactory,
      async (workingCopy, options) => {
        const result = await this.saveAs(workingCopy.resource, void 0, options);
        return !!result;
      },
      fileService,
      labelService,
      logService,
      workingCopyBackupService,
      workingCopyService
    ));
    this.onDidCreate = Event.any(this.stored.onDidCreate, this.untitled.onDidCreate);
    this.provideDecorations();
  }
  //#region decorations
  provideDecorations() {
    const provider = this._register(new class extends Disposable {
      constructor(stored) {
        super();
        this.stored = stored;
        this.label = localize("fileWorkingCopyDecorations", "File Working Copy Decorations");
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.registerListeners();
      }
      registerListeners() {
        this._register(this.stored.onDidResolve((workingCopy) => {
          if (workingCopy.isReadonly() || workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN)) {
            this._onDidChange.fire([workingCopy.resource]);
          }
        }));
        this._register(this.stored.onDidRemove((workingCopyUri) => this._onDidChange.fire([workingCopyUri])));
        this._register(this.stored.onDidChangeReadonly((workingCopy) => this._onDidChange.fire([workingCopy.resource])));
        this._register(this.stored.onDidChangeOrphaned((workingCopy) => this._onDidChange.fire([workingCopy.resource])));
      }
      provideDecorations(uri) {
        const workingCopy = this.stored.get(uri);
        if (!workingCopy || workingCopy.isDisposed()) {
          return void 0;
        }
        const isReadonly = workingCopy.isReadonly();
        const isOrphaned = workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN);
        if (isReadonly && isOrphaned) {
          return {
            color: listErrorForeground,
            letter: Codicon.lockSmall,
            strikethrough: true,
            tooltip: localize("readonlyAndDeleted", "Deleted, Read-only")
          };
        } else if (isReadonly) {
          return {
            letter: Codicon.lockSmall,
            tooltip: localize("readonly", "Read-only")
          };
        } else if (isOrphaned) {
          return {
            color: listErrorForeground,
            strikethrough: true,
            tooltip: localize("deleted", "Deleted")
          };
        }
        return void 0;
      }
    }(this.stored));
    this._register(this.decorationsService.registerDecorationsProvider(provider));
  }
  //#endregion
  //#region get / get all
  get workingCopies() {
    return [...this.stored.workingCopies, ...this.untitled.workingCopies];
  }
  get(resource) {
    return this.stored.get(resource) ?? this.untitled.get(resource);
  }
  resolve(arg1, arg2) {
    if (URI.isUri(arg1)) {
      if (arg1.scheme === Schemas.untitled) {
        return this.untitled.resolve({ untitledResource: arg1 });
      } else {
        return this.stored.resolve(arg1, arg2);
      }
    }
    return this.untitled.resolve(arg1);
  }
  //#endregion
  //#region Save
  async saveAs(source, target, options) {
    if (!target) {
      const workingCopy = this.get(source);
      if (workingCopy instanceof UntitledFileWorkingCopy && workingCopy.hasAssociatedFilePath) {
        target = await this.suggestSavePath(source);
      } else {
        target = await this.fileDialogService.pickFileToSave(await this.suggestSavePath(options?.suggestedTarget ?? source), options?.availableFileSystems);
      }
    }
    if (!target) {
      return;
    }
    if (this.filesConfigurationService.isReadonly(target)) {
      const confirmed = await this.confirmMakeWriteable(target);
      if (!confirmed) {
        return;
      } else {
        this.filesConfigurationService.updateReadonly(target, false);
      }
    }
    if (this.fileService.hasProvider(source) && isEqual(source, target)) {
      return this.doSave(source, {
        ...options,
        force: true
        /* force to save, even if not dirty (https://github.com/microsoft/vscode/issues/99619) */
      });
    }
    if (this.fileService.hasProvider(source) && this.uriIdentityService.extUri.isEqual(source, target) && await this.fileService.exists(source)) {
      await this.workingCopyFileService.move([{ file: { source, target } }], CancellationToken.None);
      return await this.doSave(source, options) ?? await this.doSave(target, options);
    }
    return this.doSaveAs(source, target, options);
  }
  async doSave(resource, options) {
    const storedFileWorkingCopy = this.stored.get(resource);
    if (storedFileWorkingCopy) {
      const success = await storedFileWorkingCopy.save(options);
      if (success) {
        return storedFileWorkingCopy;
      }
    }
    return void 0;
  }
  async doSaveAs(source, target, options) {
    let sourceContents;
    const sourceWorkingCopy = this.get(source);
    if (sourceWorkingCopy?.isResolved()) {
      sourceContents = await sourceWorkingCopy.model.snapshot(SnapshotContext.Save, CancellationToken.None);
    } else {
      sourceContents = (await this.fileService.readFileStream(source)).value;
    }
    const { targetFileExists, targetStoredFileWorkingCopy } = await this.doResolveSaveTarget(source, target);
    if (sourceWorkingCopy instanceof UntitledFileWorkingCopy && sourceWorkingCopy.hasAssociatedFilePath && targetFileExists && this.uriIdentityService.extUri.isEqual(target, toLocalResource(sourceWorkingCopy.resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme))) {
      const overwrite = await this.confirmOverwrite(target);
      if (!overwrite) {
        return void 0;
      }
    }
    await targetStoredFileWorkingCopy.model?.update(sourceContents, CancellationToken.None);
    if (!options?.source) {
      options = {
        ...options,
        source: targetFileExists ? FileWorkingCopyManager.FILE_WORKING_COPY_SAVE_REPLACE_SOURCE : FileWorkingCopyManager.FILE_WORKING_COPY_SAVE_CREATE_SOURCE
      };
    }
    const success = await targetStoredFileWorkingCopy.save({
      ...options,
      from: source,
      force: true
      /* force to save, even if not dirty (https://github.com/microsoft/vscode/issues/99619) */
    });
    if (!success) {
      return void 0;
    }
    try {
      await sourceWorkingCopy?.revert();
    } catch (error) {
      this.logService.error(error);
    }
    if (source.scheme === Schemas.untitled) {
      this.untitled.notifyDidSave(source, target);
    }
    return targetStoredFileWorkingCopy;
  }
  async doResolveSaveTarget(source, target) {
    let targetFileExists = false;
    let targetStoredFileWorkingCopy = this.stored.get(target);
    if (targetStoredFileWorkingCopy?.isResolved()) {
      targetFileExists = true;
    } else {
      targetFileExists = await this.fileService.exists(target);
      if (!targetFileExists) {
        await this.workingCopyFileService.create([{ resource: target }], CancellationToken.None);
      }
      if (this.uriIdentityService.extUri.isEqual(source, target) && this.get(source)) {
        targetStoredFileWorkingCopy = await this.stored.resolve(source);
      } else {
        targetStoredFileWorkingCopy = await this.stored.resolve(target);
      }
    }
    return { targetFileExists, targetStoredFileWorkingCopy };
  }
  async confirmOverwrite(resource) {
    const { confirmed } = await this.dialogService.confirm({
      type: "warning",
      message: localize("confirmOverwrite", "'{0}' already exists. Do you want to replace it?", basename(resource)),
      detail: localize("overwriteIrreversible", "A file or folder with the name '{0}' already exists in the folder '{1}'. Replacing it will overwrite its current contents.", basename(resource), basename(dirname(resource))),
      primaryButton: localize({ key: "replaceButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Replace")
    });
    return confirmed;
  }
  async confirmMakeWriteable(resource) {
    const { confirmed } = await this.dialogService.confirm({
      type: "warning",
      message: localize("confirmMakeWriteable", "'{0}' is marked as read-only. Do you want to save anyway?", basename(resource)),
      detail: localize("confirmMakeWriteableDetail", "Paths can be configured as read-only via settings."),
      primaryButton: localize({ key: "makeWriteableButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Save Anyway")
    });
    return confirmed;
  }
  async suggestSavePath(resource) {
    if (this.fileService.hasProvider(resource)) {
      return resource;
    }
    const workingCopy = this.get(resource);
    if (workingCopy instanceof UntitledFileWorkingCopy && workingCopy.hasAssociatedFilePath) {
      return toLocalResource(resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme);
    }
    const defaultFilePath = await this.fileDialogService.defaultFilePath();
    if (workingCopy) {
      const candidatePath = joinPath(defaultFilePath, workingCopy.name);
      if (await this.pathService.hasValidBasename(candidatePath, workingCopy.name)) {
        return candidatePath;
      }
    }
    return joinPath(defaultFilePath, basename(resource));
  }
  //#endregion
  //#region Lifecycle
  async destroy() {
    await Promises.settled([
      this.stored.destroy(),
      this.untitled.destroy()
    ]);
  }
  //#endregion
};
FileWorkingCopyManager.FILE_WORKING_COPY_SAVE_CREATE_SOURCE = SaveSourceRegistry.registerSource("fileWorkingCopyCreate.source", localize("fileWorkingCopyCreate.source", "File Created"));
FileWorkingCopyManager.FILE_WORKING_COPY_SAVE_REPLACE_SOURCE = SaveSourceRegistry.registerSource("fileWorkingCopyReplace.source", localize("fileWorkingCopyReplace.source", "File Replaced"));
FileWorkingCopyManager = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, ILifecycleService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IWorkingCopyFileService),
  __decorateParam(8, IWorkingCopyBackupService),
  __decorateParam(9, IUriIdentityService),
  __decorateParam(10, IFileDialogService),
  __decorateParam(11, IFilesConfigurationService),
  __decorateParam(12, IWorkingCopyService),
  __decorateParam(13, INotificationService),
  __decorateParam(14, IWorkingCopyEditorService),
  __decorateParam(15, IEditorService),
  __decorateParam(16, IElevatedFileService),
  __decorateParam(17, IPathService),
  __decorateParam(18, IWorkbenchEnvironmentService),
  __decorateParam(19, IDialogService),
  __decorateParam(20, IDecorationsService),
  __decorateParam(21, IProgressService)
], FileWorkingCopyManager);
export {
  FileWorkingCopyManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vZmlsZVdvcmtpbmdDb3B5TWFuYWdlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgdG9Mb2NhbFJlc291cmNlLCBqb2luUGF0aCwgaXNFcXVhbCwgYmFzZW5hbWUsIGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSwgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJU2F2ZU9wdGlvbnMsIFNhdmVTb3VyY2VSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5LCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWwsIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3RvcnksIElTdG9yZWRGaWxlV29ya2luZ0NvcHlSZXNvbHZlT3B0aW9ucywgU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUgfSBmcm9tICcuL3N0b3JlZEZpbGVXb3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBTdG9yZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyLCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlciwgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1hbmFnZXJSZXNvbHZlT3B0aW9ucyB9IGZyb20gJy4vc3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJVW50aXRsZWRGaWxlV29ya2luZ0NvcHksIElVbnRpdGxlZEZpbGVXb3JraW5nQ29weU1vZGVsLCBJVW50aXRsZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3RvcnksIFVudGl0bGVkRmlsZVdvcmtpbmdDb3B5IH0gZnJvbSAnLi91bnRpdGxlZEZpbGVXb3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBJTmV3T3JFeGlzdGluZ1VudGl0bGVkRmlsZVdvcmtpbmdDb3B5T3B0aW9ucywgSU5ld1VudGl0bGVkRmlsZVdvcmtpbmdDb3B5T3B0aW9ucywgSU5ld1VudGl0bGVkRmlsZVdvcmtpbmdDb3B5V2l0aEFzc29jaWF0ZWRSZXNvdXJjZU9wdGlvbnMsIElVbnRpdGxlZEZpbGVXb3JraW5nQ29weU1hbmFnZXIsIFVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlciB9IGZyb20gJy4vdW50aXRsZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElCYXNlRmlsZVdvcmtpbmdDb3B5TWFuYWdlciB9IGZyb20gJy4vYWJzdHJhY3RGaWxlV29ya2luZ0NvcHlNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElGaWxlV29ya2luZ0NvcHksIFNuYXBzaG90Q29udGV4dCB9IGZyb20gJy4vZmlsZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFbGV2YXRlZEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2VsZXZhdGVkRmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIH0gZnJvbSAnLi93b3JraW5nQ29weUJhY2t1cC5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi93b3JraW5nQ29weUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uRGF0YSwgSURlY29yYXRpb25zUHJvdmlkZXIsIElEZWNvcmF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9kZWNvcmF0aW9ucy9jb21tb24vZGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGxpc3RFcnJvckZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVdvcmtpbmdDb3B5TWFuYWdlcjxTIGV4dGVuZHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsLCBVIGV4dGVuZHMgSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+IGV4dGVuZHMgSUJhc2VGaWxlV29ya2luZ0NvcHlNYW5hZ2VyPFMgfCBVLCBJRmlsZVdvcmtpbmdDb3B5PFMgfCBVPj4ge1xuXG5cdC8qKlxuXHQgKiBQcm92aWRlcyBhY2Nlc3MgdG8gdGhlIG1hbmFnZXIgZm9yIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29waWVzLlxuXHQgKi9cblx0cmVhZG9ubHkgc3RvcmVkOiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlcjxTPjtcblxuXHQvKipcblx0ICogUHJvdmlkZXMgYWNjZXNzIHRvIHRoZSBtYW5hZ2VyIGZvciB1bnRpdGxlZCBmaWxlIHdvcmtpbmcgY29waWVzLlxuXHQgKi9cblx0cmVhZG9ubHkgdW50aXRsZWQ6IElVbnRpdGxlZEZpbGVXb3JraW5nQ29weU1hbmFnZXI8VT47XG5cblx0LyoqXG5cdCAqIEFsbG93cyB0byByZXNvbHZlIGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5LiBJZiB0aGUgbWFuYWdlciBhbHJlYWR5IGtub3dzXG5cdCAqIGFib3V0IGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHdpdGggdGhlIHNhbWUgYFVSSWAsIGl0IHdpbGwgcmV0dXJuIHRoYXRcblx0ICogZXhpc3Rpbmcgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5LiBUaGVyZSB3aWxsIG5ldmVyIGJlIG1vcmUgdGhhbiBvbmVcblx0ICogc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHBlciBgVVJJYCB1bnRpbCB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGlzXG5cdCAqIGRpc3Bvc2VkLlxuXHQgKlxuXHQgKiBVc2UgdGhlIGBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5UmVzb2x2ZU9wdGlvbnMucmVsb2FkYCBvcHRpb24gdG8gY29udHJvbCB0aGVcblx0ICogYmVoYXZpb3VyIGZvciB3aGVuIGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHdhcyBwcmV2aW91c2x5IGFscmVhZHkgcmVzb2x2ZWRcblx0ICogd2l0aCByZWdhcmRzIHRvIHJlc29sdmluZyBpdCBhZ2FpbiBmcm9tIHRoZSB1bmRlcmx5aW5nIGZpbGUgcmVzb3VyY2Vcblx0ICogb3Igbm90LlxuXHQgKlxuXHQgKiBOb3RlOiBDYWxsZXJzIG11c3QgYGRpc3Bvc2VgIHRoZSB3b3JraW5nIGNvcHkgd2hlbiBubyBsb25nZXIgbmVlZGVkLlxuXHQgKlxuXHQgKiBAcGFyYW0gcmVzb3VyY2UgdXNlZCBhcyB1bmlxdWUgaWRlbnRpZmllciBvZiB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGluXG5cdCAqIGNhc2Ugb25lIGlzIGFscmVhZHkga25vd24gZm9yIHRoaXMgYFVSSWAuXG5cdCAqIEBwYXJhbSBvcHRpb25zXG5cdCAqL1xuXHRyZXNvbHZlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlclJlc29sdmVPcHRpb25zKTogUHJvbWlzZTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PFM+PjtcblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IHVudGl0bGVkIGZpbGUgd29ya2luZyBjb3B5IHdpdGggb3B0aW9uYWwgaW5pdGlhbCBjb250ZW50cy5cblx0ICpcblx0ICogTm90ZTogQ2FsbGVycyBtdXN0IGBkaXNwb3NlYCB0aGUgd29ya2luZyBjb3B5IHdoZW4gbm8gbG9uZ2VyIG5lZWRlZC5cblx0ICovXG5cdHJlc29sdmUob3B0aW9ucz86IElOZXdVbnRpdGxlZEZpbGVXb3JraW5nQ29weU9wdGlvbnMpOiBQcm9taXNlPElVbnRpdGxlZEZpbGVXb3JraW5nQ29weTxVPj47XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyB1bnRpdGxlZCBmaWxlIHdvcmtpbmcgY29weSB3aXRoIG9wdGlvbmFsIGluaXRpYWwgY29udGVudHNcblx0ICogYW5kIGFzc29jaWF0ZWQgcmVzb3VyY2UuIFRoZSBhc3NvY2lhdGVkIHJlc291cmNlIHdpbGwgYmUgdXNlZCB3aGVuXG5cdCAqIHNhdmluZyBhbmQgd2lsbCBub3QgcmVxdWlyZSB0byBhc2sgdGhlIHVzZXIgZm9yIGEgZmlsZSBwYXRoLlxuXHQgKlxuXHQgKiBOb3RlOiBDYWxsZXJzIG11c3QgYGRpc3Bvc2VgIHRoZSB3b3JraW5nIGNvcHkgd2hlbiBubyBsb25nZXIgbmVlZGVkLlxuXHQgKi9cblx0cmVzb2x2ZShvcHRpb25zPzogSU5ld1VudGl0bGVkRmlsZVdvcmtpbmdDb3B5V2l0aEFzc29jaWF0ZWRSZXNvdXJjZU9wdGlvbnMpOiBQcm9taXNlPElVbnRpdGxlZEZpbGVXb3JraW5nQ29weTxVPj47XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgdW50aXRsZWQgZmlsZSB3b3JraW5nIGNvcHkgd2l0aCBvcHRpb25hbCBpbml0aWFsIGNvbnRlbnRzXG5cdCAqIHdpdGggdGhlIHByb3ZpZGVkIHJlc291cmNlIG9yIHJldHVybiBhbiBleGlzdGluZyB1bnRpdGxlZCBmaWxlIHdvcmtpbmdcblx0ICogY29weSBvdGhlcndpc2UuXG5cdCAqXG5cdCAqIE5vdGU6IENhbGxlcnMgbXVzdCBgZGlzcG9zZWAgdGhlIHdvcmtpbmcgY29weSB3aGVuIG5vIGxvbmdlciBuZWVkZWQuXG5cdCAqL1xuXHRyZXNvbHZlKG9wdGlvbnM/OiBJTmV3T3JFeGlzdGluZ1VudGl0bGVkRmlsZVdvcmtpbmdDb3B5T3B0aW9ucyk6IFByb21pc2U8SVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5PFU+PjtcblxuXHQvKipcblx0ICogSW1wbGVtZW50cyBcIlNhdmUgQXNcIiBmb3IgZmlsZSBiYXNlZCB3b3JraW5nIGNvcGllcy4gVGhlIEFQSSBpcyBgVVJJYCBiYXNlZFxuXHQgKiBiZWNhdXNlIGl0IHdvcmtzIGV2ZW4gd2l0aG91dCByZXNvbHZlZCBmaWxlIHdvcmtpbmcgY29waWVzLiBJZiBhIGZpbGUgd29ya2luZ1xuXHQgKiBjb3B5IGV4aXN0cyBmb3IgYW55IGdpdmVuIGBVUklgLCB0aGUgaW1wbGVtZW50YXRpb24gd2lsbCBkZWFsIHdpdGggdGhlbSBwcm9wZXJseVxuXHQgKiAoZS5nLiBkaXJ0eSBjb250ZW50cyBvZiB0aGUgc291cmNlIHdpbGwgYmUgd3JpdHRlbiB0byB0aGUgdGFyZ2V0IGFuZCB0aGUgc291cmNlXG5cdCAqIHdpbGwgYmUgcmV2ZXJ0ZWQpLlxuXHQgKlxuXHQgKiBOb3RlOiBpdCBpcyBwb3NzaWJsZSB0aGF0IHRoZSByZXR1cm5lZCBmaWxlIHdvcmtpbmcgY29weSBoYXMgYSBkaWZmZXJlbnQgYFVSSWBcblx0ICogdGhhbiB0aGUgYHRhcmdldGAgdGhhdCB3YXMgcGFzc2VkIGluLiBCYXNlZCBvbiBVUkkgaWRlbnRpdHksIHRoZSBmaWxlIHdvcmtpbmdcblx0ICogY29weSBtYXkgY2hvc2UgdG8gcmV0dXJuIGFuIGV4aXN0aW5nIGZpbGUgd29ya2luZyBjb3B5IHdpdGggZGlmZmVyZW50IGNhc2luZ1xuXHQgKiB0byByZXNwZWN0IGZpbGUgc3lzdGVtcyB0aGF0IGFyZSBjYXNlIGluc2Vuc2l0aXZlLlxuXHQgKlxuXHQgKiBOb3RlOiBDYWxsZXJzIG11c3QgYGRpc3Bvc2VgIHRoZSB3b3JraW5nIGNvcHkgd2hlbiBubyBsb25nZXIgbmVlZGVkLlxuXHQgKlxuXHQgKiBOb3RlOiBVbnRpdGxlZCBmaWxlIHdvcmtpbmcgY29waWVzIGFyZSBiZWluZyBkaXNwb3NlZCB3aGVuIHNhdmVkLlxuXHQgKlxuXHQgKiBAcGFyYW0gc291cmNlIHRoZSBzb3VyY2UgcmVzb3VyY2UgdG8gc2F2ZSBhc1xuXHQgKiBAcGFyYW0gdGFyZ2V0IHRoZSBvcHRpb25hbCB0YXJnZXQgcmVzb3VyY2UgdG8gc2F2ZSB0by4gaWYgbm90IGRlZmluZWQsIHRoZSB1c2VyXG5cdCAqIHdpbGwgYmUgYXNrZWQgZm9yIGlucHV0XG5cdCAqIEByZXR1cm5zIHRoZSB0YXJnZXQgc3RvcmVkIHdvcmtpbmcgY29weSB0aGF0IHdhcyBzYXZlZCB0byBvciBgdW5kZWZpbmVkYCBpbiBjYXNlIG9mXG5cdCAqIGNhbmNlbGxhdGlvblxuXHQgKi9cblx0c2F2ZUFzKHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSwgb3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxTPiB8IHVuZGVmaW5lZD47XG5cdHNhdmVBcyhzb3VyY2U6IFVSSSwgdGFyZ2V0OiB1bmRlZmluZWQsIG9wdGlvbnM/OiBJRmlsZVdvcmtpbmdDb3B5U2F2ZUFzT3B0aW9ucyk6IFByb21pc2U8SVN0b3JlZEZpbGVXb3JraW5nQ29weTxTPiB8IHVuZGVmaW5lZD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVXb3JraW5nQ29weVNhdmVBc09wdGlvbnMgZXh0ZW5kcyBJU2F2ZU9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCB0YXJnZXQgcmVzb3VyY2UgdG8gc3VnZ2VzdCB0byB0aGUgdXNlciBpbiBjYXNlXG5cdCAqIG5vIHRhcmdldCByZXNvdXJjZSBpcyBwcm92aWRlZCB0byBzYXZlIHRvLlxuXHQgKi9cblx0c3VnZ2VzdGVkVGFyZ2V0PzogVVJJO1xufVxuXG5leHBvcnQgY2xhc3MgRmlsZVdvcmtpbmdDb3B5TWFuYWdlcjxTIGV4dGVuZHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsLCBVIGV4dGVuZHMgSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElGaWxlV29ya2luZ0NvcHlNYW5hZ2VyPFMsIFU+IHtcblxuXHRyZWFkb25seSBvbkRpZENyZWF0ZTogRXZlbnQ8SUZpbGVXb3JraW5nQ29weTxTIHwgVT4+O1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEZJTEVfV09SS0lOR19DT1BZX1NBVkVfQ1JFQVRFX1NPVVJDRSA9IFNhdmVTb3VyY2VSZWdpc3RyeS5yZWdpc3RlclNvdXJjZSgnZmlsZVdvcmtpbmdDb3B5Q3JlYXRlLnNvdXJjZScsIGxvY2FsaXplKCdmaWxlV29ya2luZ0NvcHlDcmVhdGUuc291cmNlJywgXCJGaWxlIENyZWF0ZWRcIikpO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBGSUxFX1dPUktJTkdfQ09QWV9TQVZFX1JFUExBQ0VfU09VUkNFID0gU2F2ZVNvdXJjZVJlZ2lzdHJ5LnJlZ2lzdGVyU291cmNlKCdmaWxlV29ya2luZ0NvcHlSZXBsYWNlLnNvdXJjZScsIGxvY2FsaXplKCdmaWxlV29ya2luZ0NvcHlSZXBsYWNlLnNvdXJjZScsIFwiRmlsZSBSZXBsYWNlZFwiKSk7XG5cblx0cmVhZG9ubHkgc3RvcmVkOiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlcjxTPjtcblx0cmVhZG9ubHkgdW50aXRsZWQ6IElVbnRpdGxlZEZpbGVXb3JraW5nQ29weU1hbmFnZXI8VT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weVR5cGVJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc3RvcmVkV29ya2luZ0NvcHlNb2RlbEZhY3Rvcnk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3Rvcnk8Uz4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1bnRpdGxlZFdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5OiBJVW50aXRsZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3Rvcnk8VT4sXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weUZpbGVTZXJ2aWNlOiBJV29ya2luZ0NvcHlGaWxlU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB3b3JraW5nQ29weUJhY2t1cFNlcnZpY2U6IElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2Ugd29ya2luZ0NvcHlTZXJ2aWNlOiBJV29ya2luZ0NvcHlTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSB3b3JraW5nQ29weUVkaXRvclNlcnZpY2U6IElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWxldmF0ZWRGaWxlU2VydmljZSBlbGV2YXRlZEZpbGVTZXJ2aWNlOiBJRWxldmF0ZWRGaWxlU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASURlY29yYXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlY29yYXRpb25zU2VydmljZTogSURlY29yYXRpb25zU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFN0b3JlZCBmaWxlIHdvcmtpbmcgY29waWVzIG1hbmFnZXJcblx0XHR0aGlzLnN0b3JlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTdG9yZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyKFxuXHRcdFx0dGhpcy53b3JraW5nQ29weVR5cGVJZCxcblx0XHRcdHRoaXMuc3RvcmVkV29ya2luZ0NvcHlNb2RlbEZhY3RvcnksXG5cdFx0XHRmaWxlU2VydmljZSwgbGlmZWN5Y2xlU2VydmljZSwgbGFiZWxTZXJ2aWNlLCBsb2dTZXJ2aWNlLCB3b3JraW5nQ29weUZpbGVTZXJ2aWNlLFxuXHRcdFx0d29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIHdvcmtpbmdDb3B5U2VydmljZSxcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UsIHdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSwgZWRpdG9yU2VydmljZSwgZWxldmF0ZWRGaWxlU2VydmljZSwgcHJvZ3Jlc3NTZXJ2aWNlXG5cdFx0KSk7XG5cblx0XHQvLyBVbnRpdGxlZCBmaWxlIHdvcmtpbmcgY29waWVzIG1hbmFnZXJcblx0XHR0aGlzLnVudGl0bGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IFVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlcihcblx0XHRcdHRoaXMud29ya2luZ0NvcHlUeXBlSWQsXG5cdFx0XHR0aGlzLnVudGl0bGVkV29ya2luZ0NvcHlNb2RlbEZhY3RvcnksXG5cdFx0XHRhc3luYyAod29ya2luZ0NvcHksIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zYXZlQXMod29ya2luZ0NvcHkucmVzb3VyY2UsIHVuZGVmaW5lZCwgb3B0aW9ucyk7XG5cblx0XHRcdFx0cmV0dXJuICEhcmVzdWx0O1xuXHRcdFx0fSxcblx0XHRcdGZpbGVTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIGxvZ1NlcnZpY2UsIHdvcmtpbmdDb3B5QmFja3VwU2VydmljZSwgd29ya2luZ0NvcHlTZXJ2aWNlXG5cdFx0KSk7XG5cblx0XHQvLyBFdmVudHNcblx0XHR0aGlzLm9uRGlkQ3JlYXRlID0gRXZlbnQuYW55PElGaWxlV29ya2luZ0NvcHk8UyB8IFU+Pih0aGlzLnN0b3JlZC5vbkRpZENyZWF0ZSwgdGhpcy51bnRpdGxlZC5vbkRpZENyZWF0ZSk7XG5cblx0XHQvLyBEZWNvcmF0aW9uc1xuXHRcdHRoaXMucHJvdmlkZURlY29yYXRpb25zKCk7XG5cdH1cblxuXHQvLyNyZWdpb24gZGVjb3JhdGlvbnNcblxuXHRwcml2YXRlIHByb3ZpZGVEZWNvcmF0aW9ucygpOiB2b2lkIHtcblxuXHRcdC8vIEZpbGUgd29ya2luZyBjb3B5IGRlY29yYXRpb25zXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgY2xhc3MgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSURlY29yYXRpb25zUHJvdmlkZXIge1xuXG5cdFx0XHRyZWFkb25seSBsYWJlbCA9IGxvY2FsaXplKCdmaWxlV29ya2luZ0NvcHlEZWNvcmF0aW9ucycsIFwiRmlsZSBXb3JraW5nIENvcHkgRGVjb3JhdGlvbnNcIik7XG5cblx0XHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VVJJW10+KCkpO1xuXHRcdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRcdFx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBzdG9yZWQ6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyPFM+KSB7XG5cdFx0XHRcdHN1cGVyKCk7XG5cblx0XHRcdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdFx0fVxuXG5cdFx0XHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0XHRcdC8vIENyZWF0ZXNcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yZWQub25EaWRSZXNvbHZlKHdvcmtpbmdDb3B5ID0+IHtcblx0XHRcdFx0XHRpZiAod29ya2luZ0NvcHkuaXNSZWFkb25seSgpIHx8IHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLk9SUEhBTikpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoW3dvcmtpbmdDb3B5LnJlc291cmNlXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gUmVtb3ZhbHM6IG9uY2UgYSBzdG9yZWQgd29ya2luZyBjb3B5IGlzIG5vIGxvbmdlclxuXHRcdFx0XHQvLyB1bmRlciBvdXIgY29udHJvbCwgbWFrZSBzdXJlIHRvIHNpZ25hbCB0aGlzIGFzXG5cdFx0XHRcdC8vIGRlY29yYXRpb24gY2hhbmdlIGJlY2F1c2UgZnJvbSB0aGlzIHBvaW50IG9uIHdlXG5cdFx0XHRcdC8vIGhhdmUgbm8gd2F5IG9mIHVwZGF0aW5nIHRoZSBkZWNvcmF0aW9uIGFueW1vcmUuXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmVkLm9uRGlkUmVtb3ZlKHdvcmtpbmdDb3B5VXJpID0+IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoW3dvcmtpbmdDb3B5VXJpXSkpKTtcblxuXHRcdFx0XHQvLyBDaGFuZ2VzXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmVkLm9uRGlkQ2hhbmdlUmVhZG9ubHkod29ya2luZ0NvcHkgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZShbd29ya2luZ0NvcHkucmVzb3VyY2VdKSkpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JlZC5vbkRpZENoYW5nZU9ycGhhbmVkKHdvcmtpbmdDb3B5ID0+IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoW3dvcmtpbmdDb3B5LnJlc291cmNlXSkpKTtcblx0XHRcdH1cblxuXHRcdFx0cHJvdmlkZURlY29yYXRpb25zKHVyaTogVVJJKTogSURlY29yYXRpb25EYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0Y29uc3Qgd29ya2luZ0NvcHkgPSB0aGlzLnN0b3JlZC5nZXQodXJpKTtcblx0XHRcdFx0aWYgKCF3b3JraW5nQ29weSB8fCB3b3JraW5nQ29weS5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaXNSZWFkb25seSA9IHdvcmtpbmdDb3B5LmlzUmVhZG9ubHkoKTtcblx0XHRcdFx0Y29uc3QgaXNPcnBoYW5lZCA9IHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLk9SUEhBTik7XG5cblx0XHRcdFx0Ly8gUmVhZG9ubHkgKyBPcnBoYW5lZFxuXHRcdFx0XHRpZiAoaXNSZWFkb25seSAmJiBpc09ycGhhbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbG9yOiBsaXN0RXJyb3JGb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdFx0bGV0dGVyOiBDb2RpY29uLmxvY2tTbWFsbCxcblx0XHRcdFx0XHRcdHN0cmlrZXRocm91Z2g6IHRydWUsXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgncmVhZG9ubHlBbmREZWxldGVkJywgXCJEZWxldGVkLCBSZWFkLW9ubHlcIiksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlYWRvbmx5XG5cdFx0XHRcdGVsc2UgaWYgKGlzUmVhZG9ubHkpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0bGV0dGVyOiBDb2RpY29uLmxvY2tTbWFsbCxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdyZWFkb25seScsIFwiUmVhZC1vbmx5XCIpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPcnBoYW5lZFxuXHRcdFx0XHRlbHNlIGlmIChpc09ycGhhbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbG9yOiBsaXN0RXJyb3JGb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdFx0c3RyaWtldGhyb3VnaDogdHJ1ZSxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdkZWxldGVkJywgXCJEZWxldGVkXCIpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0odGhpcy5zdG9yZWQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVjb3JhdGlvbnNTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcihwcm92aWRlcikpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIGdldCAvIGdldCBhbGxcblxuXHRnZXQgd29ya2luZ0NvcGllcygpOiAoSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5PFU+IHwgSVN0b3JlZEZpbGVXb3JraW5nQ29weTxTPilbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLnN0b3JlZC53b3JraW5nQ29waWVzLCAuLi50aGlzLnVudGl0bGVkLndvcmtpbmdDb3BpZXNdO1xuXHR9XG5cblx0Z2V0KHJlc291cmNlOiBVUkkpOiBJVW50aXRsZWRGaWxlV29ya2luZ0NvcHk8VT4gfCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PFM+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5zdG9yZWQuZ2V0KHJlc291cmNlKSA/PyB0aGlzLnVudGl0bGVkLmdldChyZXNvdXJjZSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gcmVzb2x2ZVxuXG5cdHJlc29sdmUob3B0aW9ucz86IElOZXdVbnRpdGxlZEZpbGVXb3JraW5nQ29weU9wdGlvbnMpOiBQcm9taXNlPElVbnRpdGxlZEZpbGVXb3JraW5nQ29weTxVPj47XG5cdHJlc29sdmUob3B0aW9ucz86IElOZXdVbnRpdGxlZEZpbGVXb3JraW5nQ29weVdpdGhBc3NvY2lhdGVkUmVzb3VyY2VPcHRpb25zKTogUHJvbWlzZTxJVW50aXRsZWRGaWxlV29ya2luZ0NvcHk8VT4+O1xuXHRyZXNvbHZlKG9wdGlvbnM/OiBJTmV3T3JFeGlzdGluZ1VudGl0bGVkRmlsZVdvcmtpbmdDb3B5T3B0aW9ucyk6IFByb21pc2U8SVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5PFU+Pjtcblx0cmVzb2x2ZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVN0b3JlZEZpbGVXb3JraW5nQ29weVJlc29sdmVPcHRpb25zKTogUHJvbWlzZTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PFM+Pjtcblx0cmVzb2x2ZShhcmcxPzogVVJJIHwgSU5ld1VudGl0bGVkRmlsZVdvcmtpbmdDb3B5T3B0aW9ucyB8IElOZXdVbnRpdGxlZEZpbGVXb3JraW5nQ29weVdpdGhBc3NvY2lhdGVkUmVzb3VyY2VPcHRpb25zIHwgSU5ld09yRXhpc3RpbmdVbnRpdGxlZEZpbGVXb3JraW5nQ29weU9wdGlvbnMsIGFyZzI/OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5UmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPElVbnRpdGxlZEZpbGVXb3JraW5nQ29weTxVPiB8IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8Uz4+IHtcblx0XHRpZiAoVVJJLmlzVXJpKGFyZzEpKSB7XG5cblx0XHRcdC8vIFVudGl0bGVkOiB2aWEgdW50aXRsZWQgbWFuYWdlclxuXHRcdFx0aWYgKGFyZzEuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnVudGl0bGVkLnJlc29sdmUoeyB1bnRpdGxlZFJlc291cmNlOiBhcmcxIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBlbHNlOiB2aWEgc3RvcmVkIGZpbGUgbWFuYWdlclxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnN0b3JlZC5yZXNvbHZlKGFyZzEsIGFyZzIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnVudGl0bGVkLnJlc29sdmUoYXJnMSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gU2F2ZVxuXG5cdGFzeW5jIHNhdmVBcyhzb3VyY2U6IFVSSSwgdGFyZ2V0PzogVVJJLCBvcHRpb25zPzogSUZpbGVXb3JraW5nQ29weVNhdmVBc09wdGlvbnMpOiBQcm9taXNlPElTdG9yZWRGaWxlV29ya2luZ0NvcHk8Uz4gfCB1bmRlZmluZWQ+IHtcblxuXHRcdC8vIEdldCB0byB0YXJnZXQgcmVzb3VyY2Vcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0Y29uc3Qgd29ya2luZ0NvcHkgPSB0aGlzLmdldChzb3VyY2UpO1xuXHRcdFx0aWYgKHdvcmtpbmdDb3B5IGluc3RhbmNlb2YgVW50aXRsZWRGaWxlV29ya2luZ0NvcHkgJiYgd29ya2luZ0NvcHkuaGFzQXNzb2NpYXRlZEZpbGVQYXRoKSB7XG5cdFx0XHRcdHRhcmdldCA9IGF3YWl0IHRoaXMuc3VnZ2VzdFNhdmVQYXRoKHNvdXJjZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0YXJnZXQgPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnBpY2tGaWxlVG9TYXZlKGF3YWl0IHRoaXMuc3VnZ2VzdFNhdmVQYXRoKG9wdGlvbnM/LnN1Z2dlc3RlZFRhcmdldCA/PyBzb3VyY2UpLCBvcHRpb25zPy5hdmFpbGFibGVGaWxlU3lzdGVtcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybjsgLy8gdXNlciBjYW5jZWxlZFxuXHRcdH1cblxuXHRcdC8vIEVuc3VyZSB0YXJnZXQgaXMgbm90IG1hcmtlZCBhcyByZWFkb25seSBhbmQgcHJvbXB0IG90aGVyd2lzZVxuXHRcdGlmICh0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuaXNSZWFkb25seSh0YXJnZXQpKSB7XG5cdFx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCB0aGlzLmNvbmZpcm1NYWtlV3JpdGVhYmxlKHRhcmdldCk7XG5cdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUmVhZG9ubHkodGFyZ2V0LCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSnVzdCBzYXZlIGlmIHRhcmdldCBpcyBzYW1lIGFzIHdvcmtpbmcgY29waWVzIG93biByZXNvdXJjZVxuXHRcdC8vIGFuZCB3ZSBhcmUgbm90IHNhdmluZyBhbiB1bnRpdGxlZCBmaWxlIHdvcmtpbmcgY29weVxuXHRcdGlmICh0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHNvdXJjZSkgJiYgaXNFcXVhbChzb3VyY2UsIHRhcmdldCkpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvU2F2ZShzb3VyY2UsIHsgLi4ub3B0aW9ucywgZm9yY2U6IHRydWUgIC8qIGZvcmNlIHRvIHNhdmUsIGV2ZW4gaWYgbm90IGRpcnR5IChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTk2MTkpICovIH0pO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSB0YXJnZXQgaXMgZGlmZmVyZW50IGJ1dCBvZiBzYW1lIGlkZW50aXR5LCB3ZVxuXHRcdC8vIG1vdmUgdGhlIHNvdXJjZSB0byB0aGUgdGFyZ2V0LCBrbm93aW5nIHRoYXQgdGhlXG5cdFx0Ly8gdW5kZXJseWluZyBmaWxlIHN5c3RlbSBjYW5ub3QgaGF2ZSBib3RoIGFuZCB0aGVuIHNhdmUuXG5cdFx0Ly8gSG93ZXZlciwgdGhpcyB3aWxsIG9ubHkgd29yayBpZiB0aGUgc291cmNlIGV4aXN0c1xuXHRcdC8vIGFuZCBpcyBub3Qgb3JwaGFuZWQsIHNvIHdlIG5lZWQgdG8gY2hlY2sgdGhhdCB0b28uXG5cdFx0aWYgKHRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIoc291cmNlKSAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChzb3VyY2UsIHRhcmdldCkgJiYgKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHNvdXJjZSkpKSB7XG5cblx0XHRcdC8vIE1vdmUgdmlhIHdvcmtpbmcgY29weSBmaWxlIHNlcnZpY2UgdG8gZW5hYmxlIHBhcnRpY2lwYW50c1xuXHRcdFx0YXdhaXQgdGhpcy53b3JraW5nQ29weUZpbGVTZXJ2aWNlLm1vdmUoW3sgZmlsZTogeyBzb3VyY2UsIHRhcmdldCB9IH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Ly8gQXQgdGhpcyBwb2ludCB3ZSBkb24ndCBrbm93IHdoZXRoZXIgd2UgaGF2ZSBhXG5cdFx0XHQvLyB3b3JraW5nIGNvcHkgZm9yIHRoZSBzb3VyY2Ugb3IgdGhlIHRhcmdldCBVUkkgc28gd2Vcblx0XHRcdC8vIHNpbXBseSB0cnkgdG8gc2F2ZSB3aXRoIGJvdGggcmVzb3VyY2VzLlxuXHRcdFx0cmV0dXJuIChhd2FpdCB0aGlzLmRvU2F2ZShzb3VyY2UsIG9wdGlvbnMpKSA/PyAoYXdhaXQgdGhpcy5kb1NhdmUodGFyZ2V0LCBvcHRpb25zKSk7XG5cdFx0fVxuXG5cdFx0Ly8gUGVyZm9ybSBub3JtYWwgXCJTYXZlIEFzXCJcblx0XHRyZXR1cm4gdGhpcy5kb1NhdmVBcyhzb3VyY2UsIHRhcmdldCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU2F2ZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVNhdmVPcHRpb25zKTogUHJvbWlzZTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PFM+IHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvLyBTYXZlIGlzIG9ubHkgcG9zc2libGUgd2l0aCBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcGllcyxcblx0XHQvLyBhbnkgb3RoZXIgaGF2ZSB0byBnbyB2aWEgYHNhdmVBc2AgZmxvdy5cblx0XHRjb25zdCBzdG9yZWRGaWxlV29ya2luZ0NvcHkgPSB0aGlzLnN0b3JlZC5nZXQocmVzb3VyY2UpO1xuXHRcdGlmIChzdG9yZWRGaWxlV29ya2luZ0NvcHkpIHtcblx0XHRcdGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCBzdG9yZWRGaWxlV29ya2luZ0NvcHkuc2F2ZShvcHRpb25zKTtcblx0XHRcdGlmIChzdWNjZXNzKSB7XG5cdFx0XHRcdHJldHVybiBzdG9yZWRGaWxlV29ya2luZ0NvcHk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TYXZlQXMoc291cmNlOiBVUkksIHRhcmdldDogVVJJLCBvcHRpb25zPzogSUZpbGVXb3JraW5nQ29weVNhdmVBc09wdGlvbnMpOiBQcm9taXNlPElTdG9yZWRGaWxlV29ya2luZ0NvcHk8Uz4gfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgc291cmNlQ29udGVudHM6IFZTQnVmZmVyUmVhZGFibGVTdHJlYW07XG5cblx0XHQvLyBJZiB0aGUgc291cmNlIGlzIGFuIGV4aXN0aW5nIGZpbGUgd29ya2luZyBjb3B5LCB3ZSBjYW4gZGlyZWN0bHlcblx0XHQvLyB1c2UgdGhhdCB0byBjb3B5IHRoZSBjb250ZW50cyB0byB0aGUgdGFyZ2V0IGRlc3RpbmF0aW9uXG5cdFx0Y29uc3Qgc291cmNlV29ya2luZ0NvcHkgPSB0aGlzLmdldChzb3VyY2UpO1xuXHRcdGlmIChzb3VyY2VXb3JraW5nQ29weT8uaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRzb3VyY2VDb250ZW50cyA9IGF3YWl0IHNvdXJjZVdvcmtpbmdDb3B5Lm1vZGVsLnNuYXBzaG90KFNuYXBzaG90Q29udGV4dC5TYXZlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2Ugd2UgcmVzb2x2ZSB0aGUgY29udGVudHMgZnJvbSB0aGUgdW5kZXJseWluZyBmaWxlXG5cdFx0ZWxzZSB7XG5cdFx0XHRzb3VyY2VDb250ZW50cyA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlU3RyZWFtKHNvdXJjZSkpLnZhbHVlO1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgdGFyZ2V0XG5cdFx0Y29uc3QgeyB0YXJnZXRGaWxlRXhpc3RzLCB0YXJnZXRTdG9yZWRGaWxlV29ya2luZ0NvcHkgfSA9IGF3YWl0IHRoaXMuZG9SZXNvbHZlU2F2ZVRhcmdldChzb3VyY2UsIHRhcmdldCk7XG5cblx0XHQvLyBDb25maXJtIHRvIG92ZXJ3cml0ZSBpZiB3ZSBoYXZlIGFuIHVudGl0bGVkIGZpbGUgd29ya2luZyBjb3B5IHdpdGggYXNzb2NpYXRlZCBwYXRoIHdoZXJlXG5cdFx0Ly8gdGhlIGZpbGUgYWN0dWFsbHkgZXhpc3RzIG9uIGRpc2sgYW5kIHdlIGFyZSBpbnN0cnVjdGVkIHRvIHNhdmUgdG8gdGhhdCBmaWxlIHBhdGguXG5cdFx0Ly8gVGhpcyBjYW4gaGFwcGVuIGlmIHRoZSBmaWxlIHdhcyBjcmVhdGVkIGFmdGVyIHRoZSB1bnRpdGxlZCBmaWxlIHdhcyBvcGVuZWQuXG5cdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy82Nzk0NlxuXHRcdGlmIChcblx0XHRcdHNvdXJjZVdvcmtpbmdDb3B5IGluc3RhbmNlb2YgVW50aXRsZWRGaWxlV29ya2luZ0NvcHkgJiZcblx0XHRcdHNvdXJjZVdvcmtpbmdDb3B5Lmhhc0Fzc29jaWF0ZWRGaWxlUGF0aCAmJlxuXHRcdFx0dGFyZ2V0RmlsZUV4aXN0cyAmJlxuXHRcdFx0dGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodGFyZ2V0LCB0b0xvY2FsUmVzb3VyY2Uoc291cmNlV29ya2luZ0NvcHkucmVzb3VyY2UsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSwgdGhpcy5wYXRoU2VydmljZS5kZWZhdWx0VXJpU2NoZW1lKSlcblx0XHQpIHtcblx0XHRcdGNvbnN0IG92ZXJ3cml0ZSA9IGF3YWl0IHRoaXMuY29uZmlybU92ZXJ3cml0ZSh0YXJnZXQpO1xuXHRcdFx0aWYgKCFvdmVyd3JpdGUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUYWtlIG92ZXIgY29udGVudCBmcm9tIHNvdXJjZSB0byB0YXJnZXRcblx0XHRhd2FpdCB0YXJnZXRTdG9yZWRGaWxlV29ya2luZ0NvcHkubW9kZWw/LnVwZGF0ZShzb3VyY2VDb250ZW50cywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHQvLyBTZXQgc291cmNlIG9wdGlvbnMgZGVwZW5kaW5nIG9uIHRhcmdldCBleGlzdHMgb3Igbm90XG5cdFx0aWYgKCFvcHRpb25zPy5zb3VyY2UpIHtcblx0XHRcdG9wdGlvbnMgPSB7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdHNvdXJjZTogdGFyZ2V0RmlsZUV4aXN0cyA/IEZpbGVXb3JraW5nQ29weU1hbmFnZXIuRklMRV9XT1JLSU5HX0NPUFlfU0FWRV9SRVBMQUNFX1NPVVJDRSA6IEZpbGVXb3JraW5nQ29weU1hbmFnZXIuRklMRV9XT1JLSU5HX0NPUFlfU0FWRV9DUkVBVEVfU09VUkNFXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFNhdmUgdGFyZ2V0XG5cdFx0Y29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRhcmdldFN0b3JlZEZpbGVXb3JraW5nQ29weS5zYXZlKHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRmcm9tOiBzb3VyY2UsXG5cdFx0XHRmb3JjZTogdHJ1ZSAgLyogZm9yY2UgdG8gc2F2ZSwgZXZlbiBpZiBub3QgZGlydHkgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85OTYxOSkgKi9cblx0XHR9KTtcblx0XHRpZiAoIXN1Y2Nlc3MpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUmV2ZXJ0IHRoZSBzb3VyY2Vcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc291cmNlV29ya2luZ0NvcHk/LnJldmVydCgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIEl0IGlzIHBvc3NpYmxlIHRoYXQgcmV2ZXJ0aW5nIHRoZSBzb3VyY2UgZmFpbHMsIGZvciBleGFtcGxlXG5cdFx0XHQvLyB3aGVuIGEgcmVtb3RlIGlzIGRpc2Nvbm5lY3RlZCBhbmQgd2UgY2Fubm90IHJlYWQgaXQgYW55bW9yZS5cblx0XHRcdC8vIEhvd2V2ZXIsIHRoaXMgc2hvdWxkIG5vdCBpbnRlcnJ1cHQgdGhlIFwiU2F2ZSBBc1wiIGZsb3csIHNvXG5cdFx0XHQvLyB3ZSBncmFjZWZ1bGx5IGNhdGNoIHRoZSBlcnJvciBhbmQganVzdCBsb2cgaXQuXG5cblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0aWYgKHNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdHRoaXMudW50aXRsZWQubm90aWZ5RGlkU2F2ZShzb3VyY2UsIHRhcmdldCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRhcmdldFN0b3JlZEZpbGVXb3JraW5nQ29weTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlU2F2ZVRhcmdldChzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkkpOiBQcm9taXNlPHsgdGFyZ2V0RmlsZUV4aXN0czogYm9vbGVhbjsgdGFyZ2V0U3RvcmVkRmlsZVdvcmtpbmdDb3B5OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PFM+IH0+IHtcblxuXHRcdC8vIFByZWZlciBhbiBleGlzdGluZyBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgaWYgaXQgaXMgYWxyZWFkeSByZXNvbHZlZFxuXHRcdC8vIGZvciB0aGUgZ2l2ZW4gdGFyZ2V0IHJlc291cmNlXG5cdFx0bGV0IHRhcmdldEZpbGVFeGlzdHMgPSBmYWxzZTtcblx0XHRsZXQgdGFyZ2V0U3RvcmVkRmlsZVdvcmtpbmdDb3B5ID0gdGhpcy5zdG9yZWQuZ2V0KHRhcmdldCk7XG5cdFx0aWYgKHRhcmdldFN0b3JlZEZpbGVXb3JraW5nQ29weT8uaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHR0YXJnZXRGaWxlRXhpc3RzID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgY3JlYXRlIHRoZSB0YXJnZXQgd29ya2luZyBjb3B5IGVtcHR5IGlmXG5cdFx0Ly8gaXQgZG9lcyBub3QgZXhpc3QgYWxyZWFkeSBhbmQgcmVzb2x2ZSBpdCBmcm9tIHRoZXJlXG5cdFx0ZWxzZSB7XG5cdFx0XHR0YXJnZXRGaWxlRXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHModGFyZ2V0KTtcblxuXHRcdFx0Ly8gQ3JlYXRlIHRhcmdldCBmaWxlIGFkaG9jIGlmIGl0IGRvZXMgbm90IGV4aXN0IHlldFxuXHRcdFx0aWYgKCF0YXJnZXRGaWxlRXhpc3RzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMud29ya2luZ0NvcHlGaWxlU2VydmljZS5jcmVhdGUoW3sgcmVzb3VyY2U6IHRhcmdldCB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEF0IHRoaXMgcG9pbnQgd2UgbmVlZCB0byByZXNvbHZlIHRoZSB0YXJnZXQgd29ya2luZyBjb3B5XG5cdFx0XHQvLyBhbmQgd2UgaGF2ZSB0byBkbyBhbiBleHBsaWNpdCBjaGVjayBpZiB0aGUgc291cmNlIFVSSVxuXHRcdFx0Ly8gZXF1YWxzIHRoZSB0YXJnZXQgdmlhIFVSSSBpZGVudGl0eS4gSWYgdGhleSBtYXRjaCBhbmQgd2Vcblx0XHRcdC8vIGhhdmUgaGFkIGFuIGV4aXN0aW5nIHdvcmtpbmcgY29weSB3aXRoIHRoZSBzb3VyY2UsIHdlXG5cdFx0XHQvLyBwcmVmZXIgdGhhdCBvbmUgb3ZlciByZXNvbHZpbmcgdGhlIHRhcmdldC4gT3RoZXJ3aXNlIHdlXG5cdFx0XHQvLyB3b3VsZCBwb3RlbnRpYWxseSBpbnRyb2R1Y2UgYVxuXHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHNvdXJjZSwgdGFyZ2V0KSAmJiB0aGlzLmdldChzb3VyY2UpKSB7XG5cdFx0XHRcdHRhcmdldFN0b3JlZEZpbGVXb3JraW5nQ29weSA9IGF3YWl0IHRoaXMuc3RvcmVkLnJlc29sdmUoc291cmNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRhcmdldFN0b3JlZEZpbGVXb3JraW5nQ29weSA9IGF3YWl0IHRoaXMuc3RvcmVkLnJlc29sdmUodGFyZ2V0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyB0YXJnZXRGaWxlRXhpc3RzLCB0YXJnZXRTdG9yZWRGaWxlV29ya2luZ0NvcHkgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29uZmlybU92ZXJ3cml0ZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtT3ZlcndyaXRlJywgXCInezB9JyBhbHJlYWR5IGV4aXN0cy4gRG8geW91IHdhbnQgdG8gcmVwbGFjZSBpdD9cIiwgYmFzZW5hbWUocmVzb3VyY2UpKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ292ZXJ3cml0ZUlycmV2ZXJzaWJsZScsIFwiQSBmaWxlIG9yIGZvbGRlciB3aXRoIHRoZSBuYW1lICd7MH0nIGFscmVhZHkgZXhpc3RzIGluIHRoZSBmb2xkZXIgJ3sxfScuIFJlcGxhY2luZyBpdCB3aWxsIG92ZXJ3cml0ZSBpdHMgY3VycmVudCBjb250ZW50cy5cIiwgYmFzZW5hbWUocmVzb3VyY2UpLCBiYXNlbmFtZShkaXJuYW1lKHJlc291cmNlKSkpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdyZXBsYWNlQnV0dG9uTGFiZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZXBsYWNlXCIpXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gY29uZmlybWVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb25maXJtTWFrZVdyaXRlYWJsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtTWFrZVdyaXRlYWJsZScsIFwiJ3swfScgaXMgbWFya2VkIGFzIHJlYWQtb25seS4gRG8geW91IHdhbnQgdG8gc2F2ZSBhbnl3YXk/XCIsIGJhc2VuYW1lKHJlc291cmNlKSksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjb25maXJtTWFrZVdyaXRlYWJsZURldGFpbCcsIFwiUGF0aHMgY2FuIGJlIGNvbmZpZ3VyZWQgYXMgcmVhZC1vbmx5IHZpYSBzZXR0aW5ncy5cIiksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ21ha2VXcml0ZWFibGVCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlNhdmUgQW55d2F5XCIpXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gY29uZmlybWVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzdWdnZXN0U2F2ZVBhdGgocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VVJJPiB7XG5cblx0XHQvLyAxLikgSnVzdCB0YWtlIHRoZSByZXNvdXJjZSBhcyBpcyBpZiB0aGUgZmlsZSBzZXJ2aWNlIGNhbiBoYW5kbGUgaXRcblx0XHRpZiAodGhpcy5maWxlU2VydmljZS5oYXNQcm92aWRlcihyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiByZXNvdXJjZTtcblx0XHR9XG5cblx0XHQvLyAyLikgUGljayB0aGUgYXNzb2NpYXRlZCBmaWxlIHBhdGggZm9yIHVudGl0bGVkIHdvcmtpbmcgY29waWVzIGlmIGFueVxuXHRcdGNvbnN0IHdvcmtpbmdDb3B5ID0gdGhpcy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICh3b3JraW5nQ29weSBpbnN0YW5jZW9mIFVudGl0bGVkRmlsZVdvcmtpbmdDb3B5ICYmIHdvcmtpbmdDb3B5Lmhhc0Fzc29jaWF0ZWRGaWxlUGF0aCkge1xuXHRcdFx0cmV0dXJuIHRvTG9jYWxSZXNvdXJjZShyZXNvdXJjZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5LCB0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmF1bHRGaWxlUGF0aCA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdEZpbGVQYXRoKCk7XG5cblx0XHQvLyAzLikgUGljayB0aGUgd29ya2luZyBjb3B5IG5hbWUgaWYgdmFsaWQgam9pbmVkIHdpdGggZGVmYXVsdCBwYXRoXG5cdFx0aWYgKHdvcmtpbmdDb3B5KSB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGVQYXRoID0gam9pblBhdGgoZGVmYXVsdEZpbGVQYXRoLCB3b3JraW5nQ29weS5uYW1lKTtcblx0XHRcdGlmIChhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLmhhc1ZhbGlkQmFzZW5hbWUoY2FuZGlkYXRlUGF0aCwgd29ya2luZ0NvcHkubmFtZSkpIHtcblx0XHRcdFx0cmV0dXJuIGNhbmRpZGF0ZVBhdGg7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gNC4pIEZpbmFsbHkgZmFsbGJhY2sgdG8gdGhlIG5hbWUgb2YgdGhlIHJlc291cmNlIGpvaW5lZCB3aXRoIGRlZmF1bHQgcGF0aFxuXHRcdHJldHVybiBqb2luUGF0aChkZWZhdWx0RmlsZVBhdGgsIGJhc2VuYW1lKHJlc291cmNlKSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTGlmZWN5Y2xlXG5cblx0YXN5bmMgZGVzdHJveSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKFtcblx0XHRcdHRoaXMuc3RvcmVkLmRlc3Ryb3koKSxcblx0XHRcdHRoaXMudW50aXRsZWQuZGVzdHJveSgpXG5cdFx0XSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUIsVUFBVSxTQUFTLFVBQVUsZUFBZTtBQUN0RSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0Isc0JBQXNCO0FBQ25ELFNBQVMsb0JBQW9CO0FBQzdCLFNBQXVCLDBCQUEwQjtBQUNqRCxTQUFTLG9DQUFvQztBQUM3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
