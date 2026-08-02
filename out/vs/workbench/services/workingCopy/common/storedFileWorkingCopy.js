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
import { Event, Emitter } from "../../../../base/common/event.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { ETAG_DISABLED, FileOperationResult, IFileService, NotModifiedSinceFileOperationError } from "../../../../platform/files/common/files.js";
import { SaveReason } from "../../../common/editor.js";
import { IWorkingCopyService } from "./workingCopyService.js";
import { WorkingCopyCapabilities } from "./workingCopy.js";
import { raceCancellation, TaskSequentializer, timeout } from "../../../../base/common/async.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { IWorkingCopyFileService } from "./workingCopyFileService.js";
import { IFilesConfigurationService } from "../../filesConfiguration/common/filesConfigurationService.js";
import { IWorkingCopyBackupService } from "./workingCopyBackup.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { hash } from "../../../../base/common/hash.js";
import { isErrorWithActions, toErrorMessage } from "../../../../base/common/errorMessage.js";
import { toAction } from "../../../../base/common/actions.js";
import { isWindows } from "../../../../base/common/platform.js";
import { IWorkingCopyEditorService } from "./workingCopyEditorService.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IElevatedFileService } from "../../files/common/elevatedFileService.js";
import { ResourceWorkingCopy } from "./resourceWorkingCopy.js";
import { SnapshotContext } from "./fileWorkingCopy.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { isCancellationError } from "../../../../base/common/errors.js";
var StoredFileWorkingCopyState = /* @__PURE__ */ ((StoredFileWorkingCopyState2) => {
  StoredFileWorkingCopyState2[StoredFileWorkingCopyState2["SAVED"] = 0] = "SAVED";
  StoredFileWorkingCopyState2[StoredFileWorkingCopyState2["DIRTY"] = 1] = "DIRTY";
  StoredFileWorkingCopyState2[StoredFileWorkingCopyState2["PENDING_SAVE"] = 2] = "PENDING_SAVE";
  StoredFileWorkingCopyState2[StoredFileWorkingCopyState2["CONFLICT"] = 3] = "CONFLICT";
  StoredFileWorkingCopyState2[StoredFileWorkingCopyState2["ORPHAN"] = 4] = "ORPHAN";
  StoredFileWorkingCopyState2[StoredFileWorkingCopyState2["ERROR"] = 5] = "ERROR";
  return StoredFileWorkingCopyState2;
})(StoredFileWorkingCopyState || {});
function isStoredFileWorkingCopySaveEvent(e) {
  const candidate = e;
  return !!candidate.stat;
}
let StoredFileWorkingCopy = class extends ResourceWorkingCopy {
  //#endregion
  constructor(typeId, resource, name, modelFactory, externalResolver, fileService, logService, workingCopyFileService, filesConfigurationService, workingCopyBackupService, workingCopyService, notificationService, workingCopyEditorService, editorService, elevatedFileService, progressService) {
    super(resource, fileService);
    this.typeId = typeId;
    this.name = name;
    this.modelFactory = modelFactory;
    this.externalResolver = externalResolver;
    this.logService = logService;
    this.workingCopyFileService = workingCopyFileService;
    this.filesConfigurationService = filesConfigurationService;
    this.workingCopyBackupService = workingCopyBackupService;
    this.notificationService = notificationService;
    this.workingCopyEditorService = workingCopyEditorService;
    this.editorService = editorService;
    this.elevatedFileService = elevatedFileService;
    this.progressService = progressService;
    this.capabilities = WorkingCopyCapabilities.None;
    this._model = void 0;
    //#region events
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._onDidResolve = this._register(new Emitter());
    this.onDidResolve = this._onDidResolve.event;
    this._onDidChangeDirty = this._register(new Emitter());
    this.onDidChangeDirty = this._onDidChangeDirty.event;
    this._onDidSaveError = this._register(new Emitter());
    this.onDidSaveError = this._onDidSaveError.event;
    this._onDidSave = this._register(new Emitter());
    this.onDidSave = this._onDidSave.event;
    this._onDidRevert = this._register(new Emitter());
    this.onDidRevert = this._onDidRevert.event;
    this._onDidChangeReadonly = this._register(new Emitter());
    this.onDidChangeReadonly = this._onDidChangeReadonly.event;
    //#region Dirty
    this.dirty = false;
    this.ignoreDirtyOnModelContentChange = false;
    //#endregion
    //#region Save
    this.versionId = 0;
    this.lastContentChangeFromUndoRedo = void 0;
    this.saveSequentializer = new TaskSequentializer();
    this.ignoreSaveFromSaveParticipants = false;
    //#endregion
    //#region State
    this.inConflictMode = false;
    this.inErrorMode = false;
    this._register(workingCopyService.registerWorkingCopy(this));
    this.registerListeners();
  }
  get model() {
    return this._model;
  }
  registerListeners() {
    this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeReadonly.fire()));
  }
  isDirty() {
    return this.dirty;
  }
  markModified() {
    this.setDirty(true);
  }
  setDirty(dirty) {
    if (!this.isResolved()) {
      return;
    }
    const wasDirty = this.dirty;
    this.doSetDirty(dirty);
    if (dirty !== wasDirty) {
      this._onDidChangeDirty.fire();
    }
  }
  doSetDirty(dirty) {
    const wasDirty = this.dirty;
    const wasInConflictMode = this.inConflictMode;
    const wasInErrorMode = this.inErrorMode;
    const oldSavedVersionId = this.savedVersionId;
    if (!dirty) {
      this.dirty = false;
      this.inConflictMode = false;
      this.inErrorMode = false;
      if (this.isResolved()) {
        this.savedVersionId = this.model.versionId;
      }
    } else {
      this.dirty = true;
    }
    return () => {
      this.dirty = wasDirty;
      this.inConflictMode = wasInConflictMode;
      this.inErrorMode = wasInErrorMode;
      this.savedVersionId = oldSavedVersionId;
    };
  }
  // !!! DO NOT MARK PRIVATE! USED IN TESTS !!!
  isResolved() {
    return !!this.model;
  }
  async resolve(options) {
    this.trace("resolve() - enter");
    if (this.isDisposed()) {
      this.trace("resolve() - exit - without resolving because file working copy is disposed");
      return;
    }
    if (!options?.contents && (this.dirty || this.saveSequentializer.isRunning())) {
      this.trace("resolve() - exit - without resolving because file working copy is dirty or being saved");
      return;
    }
    return this.doResolve(options);
  }
  async doResolve(options) {
    if (options?.contents) {
      return this.resolveFromBuffer(options.contents);
    }
    const isNew = !this.isResolved();
    if (isNew) {
      const resolvedFromBackup = await this.resolveFromBackup();
      if (resolvedFromBackup) {
        return;
      }
    }
    return this.resolveFromFile(options);
  }
  async resolveFromBuffer(buffer) {
    this.trace("resolveFromBuffer()");
    let mtime;
    let ctime;
    let size;
    let etag;
    try {
      const metadata = await this.fileService.stat(this.resource);
      mtime = metadata.mtime;
      ctime = metadata.ctime;
      size = metadata.size;
      etag = metadata.etag;
      this.setOrphaned(false);
    } catch (error) {
      mtime = Date.now();
      ctime = Date.now();
      size = 0;
      etag = ETAG_DISABLED;
      this.setOrphaned(error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND);
    }
    return this.resolveFromContent(
      {
        resource: this.resource,
        name: this.name,
        mtime,
        ctime,
        size,
        etag,
        value: buffer,
        readonly: false,
        locked: false,
        executable: false
      },
      true
      /* dirty (resolved from buffer) */
    );
  }
  async resolveFromBackup() {
    const backup = await this.workingCopyBackupService.resolve(this);
    const isNew = !this.isResolved();
    if (!isNew) {
      this.trace("resolveFromBackup() - exit - withoutresolving because previously new file working copy got created meanwhile");
      return true;
    }
    if (backup) {
      await this.doResolveFromBackup(backup);
      return true;
    }
    return false;
  }
  async doResolveFromBackup(backup) {
    this.trace("doResolveFromBackup()");
    await this.resolveFromContent(
      {
        resource: this.resource,
        name: this.name,
        mtime: backup.meta ? backup.meta.mtime : Date.now(),
        ctime: backup.meta ? backup.meta.ctime : Date.now(),
        size: backup.meta ? backup.meta.size : 0,
        etag: backup.meta ? backup.meta.etag : ETAG_DISABLED,
        // etag disabled if unknown!
        value: backup.value,
        readonly: false,
        locked: false,
        executable: false
      },
      true
      /* dirty (resolved from backup) */
    );
    if (backup.meta?.orphaned) {
      this.setOrphaned(true);
    }
  }
  async resolveFromFile(options) {
    this.trace("resolveFromFile()");
    const forceReadFromFile = options?.forceReadFromFile;
    let etag;
    if (forceReadFromFile) {
      etag = ETAG_DISABLED;
    } else if (this.lastResolvedFileStat) {
      etag = this.lastResolvedFileStat.etag;
    }
    const currentVersionId = this.versionId;
    try {
      const content = await this.fileService.readFileStream(this.resource, {
        etag,
        limits: options?.limits
      });
      this.setOrphaned(false);
      if (currentVersionId !== this.versionId) {
        this.trace("resolveFromFile() - exit - without resolving because file working copy content changed");
        return;
      }
      await this.resolveFromContent(
        content,
        false
        /* not dirty (resolved from file) */
      );
    } catch (error) {
      const result = error.fileOperationResult;
      this.setOrphaned(result === FileOperationResult.FILE_NOT_FOUND);
      if (this.isResolved() && result === FileOperationResult.FILE_NOT_MODIFIED_SINCE) {
        if (error instanceof NotModifiedSinceFileOperationError) {
          this.updateLastResolvedFileStat(error.stat);
        }
        return;
      }
      if (this.isResolved() && result === FileOperationResult.FILE_NOT_FOUND && !forceReadFromFile) {
        return;
      }
      throw error;
    }
  }
  async resolveFromContent(content, dirty) {
    this.trace("resolveFromContent() - enter");
    if (this.isDisposed()) {
      this.trace("resolveFromContent() - exit - because working copy is disposed");
      return;
    }
    this.updateLastResolvedFileStat({
      resource: this.resource,
      name: content.name,
      mtime: content.mtime,
      ctime: content.ctime,
      size: content.size,
      etag: content.etag,
      readonly: content.readonly,
      locked: content.locked,
      executable: false,
      isFile: true,
      isDirectory: false,
      isSymbolicLink: false,
      children: void 0
    });
    if (this.isResolved()) {
      await this.doUpdateModel(content.value);
    } else {
      await this.doCreateModel(content.value);
    }
    this.setDirty(!!dirty);
    this._onDidResolve.fire();
  }
  async doCreateModel(contents) {
    this.trace("doCreateModel()");
    this._model = this._register(await this.modelFactory.createModel(this.resource, contents, CancellationToken.None));
    this.installModelListeners(this._model);
  }
  async doUpdateModel(contents) {
    this.trace("doUpdateModel()");
    this.ignoreDirtyOnModelContentChange = true;
    try {
      await this.model?.update(contents, CancellationToken.None);
    } finally {
      this.ignoreDirtyOnModelContentChange = false;
    }
  }
  installModelListeners(model) {
    this._register(model.onDidChangeContent((e) => this.onModelContentChanged(model, e.isUndoing || e.isRedoing)));
    this._register(model.onWillDispose(() => this.dispose()));
  }
  onModelContentChanged(model, isUndoingOrRedoing) {
    this.trace(`onModelContentChanged() - enter`);
    this.versionId++;
    this.trace(`onModelContentChanged() - new versionId ${this.versionId}`);
    if (isUndoingOrRedoing) {
      this.lastContentChangeFromUndoRedo = Date.now();
    }
    if (!this.ignoreDirtyOnModelContentChange && !this.isReadonly()) {
      if (model.versionId === this.savedVersionId) {
        this.trace("onModelContentChanged() - model content changed back to last saved version");
        const wasDirty = this.dirty;
        this.setDirty(false);
        if (wasDirty) {
          this._onDidRevert.fire();
        }
      } else {
        this.trace("onModelContentChanged() - model content changed and marked as dirty");
        this.setDirty(true);
      }
    }
    this._onDidChangeContent.fire();
  }
  async forceResolveFromFile() {
    if (this.isDisposed()) {
      return;
    }
    await this.externalResolver({
      forceReadFromFile: true
    });
  }
  //#endregion
  //#region Backup
  get backupDelay() {
    return this.model?.configuration?.backupDelay;
  }
  async backup(token) {
    let meta = void 0;
    if (this.lastResolvedFileStat) {
      meta = {
        mtime: this.lastResolvedFileStat.mtime,
        ctime: this.lastResolvedFileStat.ctime,
        size: this.lastResolvedFileStat.size,
        etag: this.lastResolvedFileStat.etag,
        orphaned: this.isOrphaned()
      };
    }
    let content = void 0;
    if (this.isResolved()) {
      content = await raceCancellation(this.model.snapshot(SnapshotContext.Backup, token), token);
    }
    return { meta, content };
  }
  async save(options = /* @__PURE__ */ Object.create(null)) {
    if (!this.isResolved()) {
      return false;
    }
    if (this.isReadonly()) {
      this.trace("save() - ignoring request for readonly resource");
      return false;
    }
    if ((this.hasState(3 /* CONFLICT */) || this.hasState(5 /* ERROR */)) && (options.reason === SaveReason.AUTO || options.reason === SaveReason.FOCUS_CHANGE || options.reason === SaveReason.WINDOW_CHANGE)) {
      this.trace("save() - ignoring auto save request for file working copy that is in conflict or error");
      return false;
    }
    this.trace("save() - enter");
    await this.doSave(options);
    this.trace("save() - exit");
    return this.hasState(0 /* SAVED */);
  }
  async doSave(options) {
    if (typeof options.reason !== "number") {
      options.reason = SaveReason.EXPLICIT;
    }
    const versionId = this.versionId;
    this.trace(`doSave(${versionId}) - enter with versionId ${versionId}`);
    if (this.ignoreSaveFromSaveParticipants) {
      this.trace(`doSave(${versionId}) - exit - refusing to save() recursively from save participant`);
      return;
    }
    if (this.saveSequentializer.isRunning(versionId)) {
      this.trace(`doSave(${versionId}) - exit - found a running save for versionId ${versionId}`);
      return this.saveSequentializer.running;
    }
    if (!options.force && !this.dirty) {
      this.trace(`doSave(${versionId}) - exit - because not dirty and/or versionId is different (this.isDirty: ${this.dirty}, this.versionId: ${this.versionId})`);
      return;
    }
    if (this.saveSequentializer.isRunning()) {
      this.trace(`doSave(${versionId}) - exit - because busy saving`);
      this.saveSequentializer.cancelRunning();
      return this.saveSequentializer.queue(() => this.doSave(options));
    }
    if (this.isResolved()) {
      this.model.pushStackElement();
    }
    const saveCancellation = new CancellationTokenSource();
    return this.progressService.withProgress({
      title: localize("saveParticipants", "Saving '{0}'", this.name),
      location: ProgressLocation.Window,
      cancellable: true,
      delay: this.isDirty() ? 3e3 : 5e3
    }, (progress) => {
      return this.doSaveSequential(versionId, options, progress, saveCancellation);
    }, () => {
      saveCancellation.cancel();
    }).finally(() => {
      saveCancellation.dispose();
    });
  }
  doSaveSequential(versionId, options, progress, saveCancellation) {
    return this.saveSequentializer.run(versionId, (async () => {
      if (this.isResolved() && !options.skipSaveParticipants && this.workingCopyFileService.hasSaveParticipants) {
        try {
          if (options.reason === SaveReason.AUTO && typeof this.lastContentChangeFromUndoRedo === "number") {
            const timeFromUndoRedoToSave = Date.now() - this.lastContentChangeFromUndoRedo;
            if (timeFromUndoRedoToSave < StoredFileWorkingCopy.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD) {
              await timeout(StoredFileWorkingCopy.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD - timeFromUndoRedoToSave);
            }
          }
          if (!saveCancellation.token.isCancellationRequested) {
            this.ignoreSaveFromSaveParticipants = true;
            try {
              await this.workingCopyFileService.runSaveParticipants(this, { reason: options.reason ?? SaveReason.EXPLICIT, savedFrom: options.from }, progress, saveCancellation.token);
            } catch (err) {
              if (isCancellationError(err) && !saveCancellation.token.isCancellationRequested) {
                saveCancellation.cancel();
              }
            } finally {
              this.ignoreSaveFromSaveParticipants = false;
            }
          }
        } catch (error) {
          this.logService.error(`[stored file working copy] runSaveParticipants(${versionId}) - resulted in an error: ${error.toString()}`, this.resource.toString(), this.typeId);
        }
      }
      if (saveCancellation.token.isCancellationRequested) {
        return;
      }
      if (this.isDisposed()) {
        return;
      }
      if (!this.isResolved()) {
        return;
      }
      versionId = this.versionId;
      this.inErrorMode = false;
      progress.report({ message: localize("saveTextFile", "Writing into file...") });
      this.trace(`doSave(${versionId}) - before write()`);
      const lastResolvedFileStat = assertReturnsDefined(this.lastResolvedFileStat);
      const resolvedFileWorkingCopy = this;
      return this.saveSequentializer.run(versionId, (async () => {
        try {
          const writeFileOptions = {
            mtime: lastResolvedFileStat.mtime,
            etag: options.ignoreModifiedSince || !this.filesConfigurationService.preventSaveConflicts(lastResolvedFileStat.resource) ? ETAG_DISABLED : lastResolvedFileStat.etag,
            unlock: options.writeUnlock
          };
          let stat;
          if (typeof resolvedFileWorkingCopy.model.save === "function") {
            try {
              stat = await resolvedFileWorkingCopy.model.save(writeFileOptions, saveCancellation.token);
            } catch (error) {
              if (saveCancellation.token.isCancellationRequested) {
                return void 0;
              }
              throw error;
            }
          } else {
            const snapshot = await raceCancellation(resolvedFileWorkingCopy.model.snapshot(SnapshotContext.Save, saveCancellation.token), saveCancellation.token);
            if (saveCancellation.token.isCancellationRequested) {
              return;
            } else {
              saveCancellation.dispose();
            }
            if (options?.writeElevated && this.elevatedFileService.isSupported(lastResolvedFileStat.resource)) {
              stat = await this.elevatedFileService.writeFileElevated(lastResolvedFileStat.resource, assertReturnsDefined(snapshot), writeFileOptions);
            } else {
              stat = await this.fileService.writeFile(lastResolvedFileStat.resource, assertReturnsDefined(snapshot), writeFileOptions);
            }
          }
          this.handleSaveSuccess(stat, versionId, options);
        } catch (error) {
          this.handleSaveError(error, versionId, options);
        }
      })(), () => saveCancellation.cancel());
    })(), () => saveCancellation.cancel());
  }
  handleSaveSuccess(stat, versionId, options) {
    this.updateLastResolvedFileStat(stat);
    if (versionId === this.versionId) {
      this.trace(`handleSaveSuccess(${versionId}) - setting dirty to false because versionId did not change`);
      this.setDirty(false);
    } else {
      this.trace(`handleSaveSuccess(${versionId}) - not setting dirty to false because versionId did change meanwhile`);
    }
    this.setOrphaned(false);
    this._onDidSave.fire({ reason: options.reason, stat, source: options.source });
  }
  handleSaveError(error, versionId, options) {
    (options.ignoreErrorHandler ? this.logService.trace : this.logService.error).apply(this.logService, [`[stored file working copy] handleSaveError(${versionId}) - exit - resulted in a save error: ${error.toString()}`, this.resource.toString(), this.typeId]);
    if (options.ignoreErrorHandler) {
      throw error;
    }
    this.setDirty(true);
    this.inErrorMode = true;
    if (error.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
      this.inConflictMode = true;
    }
    this.doHandleSaveError(error, options);
    this._onDidSaveError.fire();
  }
  doHandleSaveError(error, options) {
    const fileOperationError = error;
    const primaryActions = [];
    let message;
    if (fileOperationError.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
      message = localize("staleSaveError", "Failed to save '{0}': The content of the file is newer. Do you want to overwrite the file with your changes?", this.name);
      primaryActions.push(toAction({ id: "fileWorkingCopy.overwrite", label: localize("overwrite", "Overwrite"), run: () => this.save({ ...options, ignoreModifiedSince: true, reason: SaveReason.EXPLICIT }) }));
      primaryActions.push(toAction({ id: "fileWorkingCopy.revert", label: localize("revert", "Revert"), run: () => this.revert() }));
    } else {
      const isWriteLocked = fileOperationError.fileOperationResult === FileOperationResult.FILE_WRITE_LOCKED;
      const triedToUnlock = isWriteLocked && fileOperationError.options?.unlock;
      const isPermissionDenied = fileOperationError.fileOperationResult === FileOperationResult.FILE_PERMISSION_DENIED;
      const canSaveElevated = this.elevatedFileService.isSupported(this.resource);
      if (isErrorWithActions(error)) {
        primaryActions.push(...error.actions);
      }
      if (canSaveElevated && (isPermissionDenied || triedToUnlock)) {
        primaryActions.push(toAction({
          id: "fileWorkingCopy.saveElevated",
          label: triedToUnlock ? isWindows ? localize("overwriteElevated", "Overwrite as Admin...") : localize("overwriteElevatedSudo", "Overwrite as Sudo...") : isWindows ? localize("saveElevated", "Retry as Admin...") : localize("saveElevatedSudo", "Retry as Sudo..."),
          run: () => {
            this.save({ ...options, writeElevated: true, writeUnlock: triedToUnlock, reason: SaveReason.EXPLICIT });
          }
        }));
      } else if (isWriteLocked) {
        primaryActions.push(toAction({ id: "fileWorkingCopy.unlock", label: localize("overwrite", "Overwrite"), run: () => this.save({ ...options, writeUnlock: true, reason: SaveReason.EXPLICIT }) }));
      } else {
        primaryActions.push(toAction({ id: "fileWorkingCopy.retry", label: localize("retry", "Retry"), run: () => this.save({ ...options, reason: SaveReason.EXPLICIT }) }));
      }
      primaryActions.push(toAction({
        id: "fileWorkingCopy.saveAs",
        label: localize("saveAs", "Save As..."),
        run: async () => {
          const editor = this.workingCopyEditorService.findEditor(this);
          if (editor) {
            const result = await this.editorService.save(editor, { saveAs: true, reason: SaveReason.EXPLICIT });
            if (!result.success) {
              this.doHandleSaveError(error, options);
            }
          }
        }
      }));
      primaryActions.push(toAction({ id: "fileWorkingCopy.revert", label: localize("revert", "Revert"), run: () => this.revert() }));
      if (isWriteLocked) {
        if (triedToUnlock && canSaveElevated) {
          message = isWindows ? localize("readonlySaveErrorAdmin", "Failed to save '{0}': File is read-only. Select 'Overwrite as Admin' to retry as administrator.", this.name) : localize("readonlySaveErrorSudo", "Failed to save '{0}': File is read-only. Select 'Overwrite as Sudo' to retry as superuser.", this.name);
        } else {
          message = localize("readonlySaveError", "Failed to save '{0}': File is read-only. Select 'Overwrite' to attempt to make it writeable.", this.name);
        }
      } else if (canSaveElevated && isPermissionDenied) {
        message = isWindows ? localize("permissionDeniedSaveError", "Failed to save '{0}': Insufficient permissions. Select 'Retry as Admin' to retry as administrator.", this.name) : localize("permissionDeniedSaveErrorSudo", "Failed to save '{0}': Insufficient permissions. Select 'Retry as Sudo' to retry as superuser.", this.name);
      } else {
        message = localize({ key: "genericSaveError", comment: ["{0} is the resource that failed to save and {1} the error message"] }, "Failed to save '{0}': {1}", this.name, toErrorMessage(error, false));
      }
    }
    const handle = this.notificationService.notify({ id: `${hash(this.resource.toString())}`, severity: Severity.Error, message, actions: { primary: primaryActions } });
    const listener = this._register(Event.once(Event.any(this.onDidSave, this.onDidRevert))(() => handle.close()));
    this._register(Event.once(handle.onDidClose)(() => listener.dispose()));
  }
  updateLastResolvedFileStat(newFileStat) {
    const oldReadonly = this.isReadonly();
    if (!this.lastResolvedFileStat) {
      this.lastResolvedFileStat = newFileStat;
    } else if (this.lastResolvedFileStat.mtime <= newFileStat.mtime) {
      this.lastResolvedFileStat = newFileStat;
    } else {
      this.lastResolvedFileStat = { ...this.lastResolvedFileStat, readonly: newFileStat.readonly, locked: newFileStat.locked };
    }
    if (this.isReadonly() !== oldReadonly) {
      this._onDidChangeReadonly.fire();
    }
  }
  //#endregion
  //#region Revert
  async revert(options) {
    if (!this.isResolved() || !this.dirty && !options?.force) {
      return;
    }
    this.trace("revert()");
    const wasDirty = this.dirty;
    const undoSetDirty = this.doSetDirty(false);
    const softUndo = options?.soft;
    if (!softUndo) {
      try {
        await this.forceResolveFromFile();
      } catch (error) {
        if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
          undoSetDirty();
          throw error;
        }
      }
    }
    this._onDidRevert.fire();
    if (wasDirty) {
      this._onDidChangeDirty.fire();
    }
  }
  hasState(state) {
    switch (state) {
      case 3 /* CONFLICT */:
        return this.inConflictMode;
      case 1 /* DIRTY */:
        return this.dirty;
      case 5 /* ERROR */:
        return this.inErrorMode;
      case 4 /* ORPHAN */:
        return this.isOrphaned();
      case 2 /* PENDING_SAVE */:
        return this.saveSequentializer.isRunning();
      case 0 /* SAVED */:
        return !this.dirty;
    }
  }
  async joinState(state) {
    return this.saveSequentializer.running;
  }
  //#endregion
  //#region Utilities
  isReadonly() {
    return this.filesConfigurationService.isReadonly(this.resource, this.lastResolvedFileStat);
  }
  trace(msg) {
    this.logService.trace(`[stored file working copy] ${msg}`, this.resource.toString(), this.typeId);
  }
  //#endregion
  //#region Dispose
  dispose() {
    this.trace("dispose()");
    this.inConflictMode = false;
    this.inErrorMode = false;
    this._model = void 0;
    super.dispose();
  }
  //#endregion
};
StoredFileWorkingCopy.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD = 500;
StoredFileWorkingCopy = __decorateClass([
  __decorateParam(5, IFileService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IWorkingCopyFileService),
  __decorateParam(8, IFilesConfigurationService),
  __decorateParam(9, IWorkingCopyBackupService),
  __decorateParam(10, IWorkingCopyService),
  __decorateParam(11, INotificationService),
  __decorateParam(12, IWorkingCopyEditorService),
  __decorateParam(13, IEditorService),
  __decorateParam(14, IElevatedFileService),
  __decorateParam(15, IProgressService)
], StoredFileWorkingCopy);
export {
  StoredFileWorkingCopy,
  StoredFileWorkingCopyState,
  isStoredFileWorkingCopySaveEvent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vc3RvcmVkRmlsZVdvcmtpbmdDb3B5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVUQUdfRElTQUJMRUQsIEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVSZWFkTGltaXRzLCBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgSUZpbGVTdHJlYW1Db250ZW50LCBJV3JpdGVGaWxlT3B0aW9ucywgTm90TW9kaWZpZWRTaW5jZUZpbGVPcGVyYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJU2F2ZU9wdGlvbnMsIElSZXZlcnRPcHRpb25zLCBTYXZlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5QmFja3VwLCBJV29ya2luZ0NvcHlCYWNrdXBNZXRhLCBJV29ya2luZ0NvcHlTYXZlRXZlbnQsIFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzIH0gZnJvbSAnLi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyByYWNlQ2FuY2VsbGF0aW9uLCBUYXNrU2VxdWVudGlhbGl6ZXIsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UgfSBmcm9tICcuL3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLCBJUmVzb2x2ZWRXb3JraW5nQ29weUJhY2t1cCB9IGZyb20gJy4vd29ya2luZ0NvcHlCYWNrdXAuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgaXNFcnJvcldpdGhBY3Rpb25zLCB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSB9IGZyb20gJy4vd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFbGV2YXRlZEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2VsZXZhdGVkRmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlV29ya2luZ0NvcHksIFJlc291cmNlV29ya2luZ0NvcHkgfSBmcm9tICcuL3Jlc291cmNlV29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSUZpbGVXb3JraW5nQ29weSwgSUZpbGVXb3JraW5nQ29weU1vZGVsLCBJRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5LCBTbmFwc2hvdENvbnRleHQgfSBmcm9tICcuL2ZpbGVXb3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3MsIElQcm9ncmVzc1NlcnZpY2UsIElQcm9ncmVzc1N0ZXAsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5cbi8qKlxuICogU3RvcmVkIGZpbGUgc3BlY2lmaWMgd29ya2luZyBjb3B5IG1vZGVsIGZhY3RvcnkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsRmFjdG9yeTxNIGV4dGVuZHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiBleHRlbmRzIElGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3Rvcnk8TT4geyB9XG5cbi8qKlxuICogVGhlIHVuZGVybHlpbmcgbW9kZWwgb2YgYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgcHJvdmlkZXMgc29tZVxuICogbWV0aG9kcyBmb3IgdGhlIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSB0byBmdW5jdGlvbi4gVGhlIG1vZGVsIGlzXG4gKiB0eXBpY2FsbHkgb25seSBhdmFpbGFibGUgYWZ0ZXIgdGhlIHdvcmtpbmcgY29weSBoYXMgYmVlblxuICogcmVzb2x2ZWQgdmlhIGl0J3MgYHJlc29sdmUoKWAgbWV0aG9kLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbCBleHRlbmRzIElGaWxlV29ya2luZ0NvcHlNb2RlbCB7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50OiBFdmVudDxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50PjtcblxuXHQvKipcblx0ICogQSB2ZXJzaW9uIElEIG9mIHRoZSBtb2RlbC4gSWYgYSBgb25EaWRDaGFuZ2VDb250ZW50YCBpcyBmaXJlZFxuXHQgKiBmcm9tIHRoZSBtb2RlbCBhbmQgdGhlIGxhc3Qga25vd24gc2F2ZWQgYHZlcnNpb25JZGAgbWF0Y2hlc1xuXHQgKiB3aXRoIHRoZSBgbW9kZWwudmVyc2lvbklkYCwgdGhlIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSB3aWxsXG5cdCAqIGRpc2NhcmQgYW55IGRpcnR5IHN0YXRlLlxuXHQgKlxuXHQgKiBBIHVzZSBjYXNlIGlzIHRoZSBmb2xsb3dpbmc6XG5cdCAqIC0gYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgZ2V0cyBlZGl0ZWQgYW5kIHRodXMgZGlydHlcblx0ICogLSB0aGUgdXNlciB0cmlnZ2VycyB1bmRvIHRvIHJldmVydCB0aGUgY2hhbmdlc1xuXHQgKiAtIGF0IHRoaXMgcG9pbnQgdGhlIGB2ZXJzaW9uSWRgIHNob3VsZCBtYXRjaCB0aGUgb25lIHdlIGhhZCBzYXZlZFxuXHQgKlxuXHQgKiBUaGlzIHJlcXVpcmVzIHRoZSBtb2RlbCB0byBiZSBhd2FyZSBvZiB1bmRvL3JlZG8gb3BlcmF0aW9ucy5cblx0ICovXG5cdHJlYWRvbmx5IHZlcnNpb25JZDogdW5rbm93bjtcblxuXHQvKipcblx0ICogQ2xvc2UgdGhlIGN1cnJlbnQgdW5kby1yZWRvIGVsZW1lbnQuIFRoaXMgb2ZmZXJzIGEgd2F5XG5cdCAqIHRvIGNyZWF0ZSBhbiB1bmRvL3JlZG8gc3RvcCBwb2ludC5cblx0ICpcblx0ICogVGhpcyBtZXRob2QgbWF5IGZvciBleGFtcGxlIGJlIGNhbGxlZCByaWdodCBiZWZvcmUgdGhlXG5cdCAqIHNhdmUgaXMgdHJpZ2dlcmVkIHNvIHRoYXQgdGhlIHVzZXIgY2FuIGFsd2F5cyB1bmRvIGJhY2tcblx0ICogdG8gdGhlIHN0YXRlIGJlZm9yZSBzYXZpbmcuXG5cdCAqL1xuXHRwdXNoU3RhY2tFbGVtZW50KCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsbHkgYWxsb3dzIGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IG1vZGVsIHRvXG5cdCAqIGltcGxlbWVudCB0aGUgYHNhdmVgIG1ldGhvZC4gVGhpcyBhbGxvd3MgdG8gaW1wbGVtZW50XG5cdCAqIGEgbW9yZSBlZmZpY2llbnQgc2F2ZSBsb2dpYyBjb21wYXJlZCB0byB0aGUgZGVmYXVsdFxuXHQgKiB3aGljaCBpcyB0byBhc2sgdGhlIG1vZGVsIGZvciBhIGBzbmFwc2hvdGAgYW5kIHRoZW5cblx0ICogd3JpdGluZyB0aGF0IHRvIHRoZSBtb2RlbCdzIHJlc291cmNlLlxuXHQgKi9cblx0c2F2ZT8ob3B0aW9uczogSVdyaXRlRmlsZU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50IHtcblxuXHQvKipcblx0ICogRmxhZyB0aGF0IGluZGljYXRlcyB0aGF0IHRoaXMgZXZlbnQgd2FzIGdlbmVyYXRlZCB3aGlsZSB1bmRvaW5nLlxuXHQgKi9cblx0cmVhZG9ubHkgaXNVbmRvaW5nOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBGbGFnIHRoYXQgaW5kaWNhdGVzIHRoYXQgdGhpcyBldmVudCB3YXMgZ2VuZXJhdGVkIHdoaWxlIHJlZG9pbmcuXG5cdCAqL1xuXHRyZWFkb25seSBpc1JlZG9pbmc6IGJvb2xlYW47XG59XG5cbi8qKlxuICogQSBzdG9yZWQgZmlsZSBiYXNlZCBgSVdvcmtpbmdDb3B5YCBpcyBiYWNrZWQgYnkgYSBgVVJJYCBmcm9tIGFcbiAqIGtub3duIGZpbGUgc3lzdGVtIHByb3ZpZGVyLiBHaXZlbiB0aGlzIGFzc3VtcHRpb24sIGEgbG90XG4gKiBvZiBmdW5jdGlvbmFsaXR5IGNhbiBiZSBidWlsdCBvbiB0b3AsIHN1Y2ggYXMgc2F2aW5nIGluXG4gKiBhIHNlY3VyZSB3YXkgdG8gcHJldmVudCBkYXRhIGxvc3MuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVN0b3JlZEZpbGVXb3JraW5nQ29weTxNIGV4dGVuZHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiBleHRlbmRzIElSZXNvdXJjZVdvcmtpbmdDb3B5LCBJRmlsZVdvcmtpbmdDb3B5PE0+IHtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgZm9yIHdoZW4gYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgd2FzIHJlc29sdmVkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRSZXNvbHZlOiBFdmVudDx2b2lkPjtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgZm9yIHdoZW4gYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgd2FzIHNhdmVkIHN1Y2Nlc3NmdWxseS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkU2F2ZTogRXZlbnQ8SVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudD47XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IGluZGljYXRpbmcgdGhhdCBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBzYXZlIG9wZXJhdGlvbiBmYWlsZWQuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFNhdmVFcnJvcjogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IGZvciB3aGVuIHRoZSByZWFkb25seSBzdGF0ZSBvZiB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlYWRvbmx5OiBFdmVudDx2b2lkPjtcblxuXHQvKipcblx0ICogUmVzb2x2ZXMgYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkuXG5cdCAqL1xuXHRyZXNvbHZlKG9wdGlvbnM/OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5UmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBFeHBsaWNpdGx5IHNldHMgdGhlIHdvcmtpbmcgY29weSB0byBiZSBtb2RpZmllZC5cblx0ICovXG5cdG1hcmtNb2RpZmllZCgpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgaXMgaW4gdGhlIHByb3ZpZGVkIGBzdGF0ZWBcblx0ICogb3Igbm90LlxuXHQgKlxuXHQgKiBAcGFyYW0gc3RhdGUgdGhlIGBGaWxlV29ya2luZ0NvcHlTdGF0ZWAgdG8gY2hlY2sgb24uXG5cdCAqL1xuXHRoYXNTdGF0ZShzdGF0ZTogU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBBbGxvd3MgdG8gam9pbiBhIHN0YXRlIGNoYW5nZSBhd2F5IGZyb20gdGhlIHByb3ZpZGVkIGBzdGF0ZWAuXG5cdCAqXG5cdCAqIEBwYXJhbSBzdGF0ZSBjdXJyZW50bHkgb25seSBgRmlsZVdvcmtpbmdDb3B5U3RhdGUuUEVORElOR19TQVZFYFxuXHQgKiBjYW4gYmUgYXdhaXRlZCBvbiB0byByZXNvbHZlLlxuXHQgKi9cblx0am9pblN0YXRlKHN0YXRlOiBTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5QRU5ESU5HX1NBVkUpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHdlIGhhdmUgYSByZXNvbHZlZCBtb2RlbCBvciBub3QuXG5cdCAqL1xuXHRpc1Jlc29sdmVkKCk6IHRoaXMgaXMgSVJlc29sdmVkU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+O1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgaXMgcmVhZG9ubHkgb3Igbm90LlxuXHQgKi9cblx0aXNSZWFkb25seSgpOiBib29sZWFuIHwgSU1hcmtkb3duU3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBBc2tzIHRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgdG8gc2F2ZS4gSWYgdGhlIHN0b3JlZCBmaWxlXG5cdCAqIHdvcmtpbmcgY29weSB3YXMgZGlydHksIGl0IGlzIGV4cGVjdGVkIHRvIGJlIG5vbi1kaXJ0eSBhZnRlclxuXHQgKiB0aGlzIG9wZXJhdGlvbiBoYXMgZmluaXNoZWQuXG5cdCAqXG5cdCAqIEByZXR1cm5zIGB0cnVlYCBpZiB0aGUgb3BlcmF0aW9uIHdhcyBzdWNjZXNzZnVsIGFuZCBgZmFsc2VgIG90aGVyd2lzZS5cblx0ICovXG5cdHNhdmUob3B0aW9ucz86IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlQXNPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVzb2x2ZWRTdG9yZWRGaWxlV29ya2luZ0NvcHk8TSBleHRlbmRzIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbD4gZXh0ZW5kcyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+IHtcblxuXHQvKipcblx0ICogQSByZXNvbHZlZCBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgaGFzIGEgcmVzb2x2ZWQgbW9kZWwuXG5cdCAqL1xuXHRyZWFkb25seSBtb2RlbDogTTtcbn1cblxuLyoqXG4gKiBTdGF0ZXMgdGhlIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBjYW4gYmUgaW4uXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlIHtcblxuXHQvKipcblx0ICogQSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgaXMgc2F2ZWQuXG5cdCAqL1xuXHRTQVZFRCxcblxuXHQvKipcblx0ICogQSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgaXMgZGlydHkuXG5cdCAqL1xuXHRESVJUWSxcblxuXHQvKipcblx0ICogQSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgaXMgY3VycmVudGx5IGJlaW5nIHNhdmVkIGJ1dFxuXHQgKiB0aGlzIG9wZXJhdGlvbiBoYXMgbm90IGNvbXBsZXRlZCB5ZXQuXG5cdCAqL1xuXHRQRU5ESU5HX1NBVkUsXG5cblx0LyoqXG5cdCAqIEEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGlzIGluIGNvbmZsaWN0IG1vZGUgd2hlbiBjaGFuZ2VzXG5cdCAqIGNhbm5vdCBiZSBzYXZlZCBiZWNhdXNlIHRoZSB1bmRlcmx5aW5nIGZpbGUgaGFzIGNoYW5nZWQuXG5cdCAqIFN0b3JlZCBmaWxlIHdvcmtpbmcgY29waWVzIGluIGNvbmZsaWN0IG1vZGUgYXJlIGFsd2F5cyBkaXJ0eS5cblx0ICovXG5cdENPTkZMSUNULFxuXG5cdC8qKlxuXHQgKiBBIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBpcyBpbiBvcnBoYW4gc3RhdGUgd2hlbiB0aGUgdW5kZXJseWluZ1xuXHQgKiBmaWxlIGhhcyBiZWVuIGRlbGV0ZWQuXG5cdCAqL1xuXHRPUlBIQU4sXG5cblx0LyoqXG5cdCAqIEFueSBlcnJvciB0aGF0IGhhcHBlbnMgZHVyaW5nIGEgc2F2ZSB0aGF0IGlzIG5vdCBjYXVzaW5nXG5cdCAqIHRoZSBgU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuQ09ORkxJQ1RgIHN0YXRlLlxuXHQgKiBTdG9yZWQgZmlsZSB3b3JraW5nIGNvcGllcyBpbiBlcnJvciBtb2RlIGFyZSBhbHdheXMgZGlydHkuXG5cdCAqL1xuXHRFUlJPUlxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlT3B0aW9ucyBleHRlbmRzIElTYXZlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFNhdmUgdGhlIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSB3aXRoIGFuIGF0dGVtcHQgdG8gdW5sb2NrIGl0LlxuXHQgKi9cblx0cmVhZG9ubHkgd3JpdGVVbmxvY2s/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBTYXZlIHRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgd2l0aCBlbGV2YXRlZCBwcml2aWxlZ2VzLlxuXHQgKlxuXHQgKiBOb3RlOiBUaGlzIG1heSBub3QgYmUgc3VwcG9ydGVkIGluIGFsbCBlbnZpcm9ubWVudHMuXG5cdCAqL1xuXHRyZWFkb25seSB3cml0ZUVsZXZhdGVkPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQWxsb3dzIHRvIHdyaXRlIHRvIGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGV2ZW4gaWYgaXQgaGFzIGJlZW5cblx0ICogbW9kaWZpZWQgb24gZGlzay4gVGhpcyBzaG91bGQgb25seSBiZSB0cmlnZ2VyZWQgZnJvbSBhblxuXHQgKiBleHBsaWNpdCB1c2VyIGFjdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IGlnbm9yZU1vZGlmaWVkU2luY2U/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBJZiBzZXQsIHdpbGwgYnViYmxlIHVwIHRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgc2F2ZSBlcnJvciB0b1xuXHQgKiB0aGUgY2FsbGVyIGluc3RlYWQgb2YgaGFuZGxpbmcgaXQuXG5cdCAqL1xuXHRyZWFkb25seSBpZ25vcmVFcnJvckhhbmRsZXI/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlQXNPcHRpb25zIGV4dGVuZHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVPcHRpb25zIHtcblxuXHQvKipcblx0ICogT3B0aW9uYWwgVVJJIG9mIHRoZSByZXNvdXJjZSB0aGUgdGV4dCBmaWxlIGlzIHNhdmVkIGZyb20gaWYga25vd24uXG5cdCAqL1xuXHRyZWFkb25seSBmcm9tPzogVVJJO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdG9yZWRGaWxlV29ya2luZ0NvcHlSZXNvbHZlciB7XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSB3b3JraW5nIGNvcHkgaW4gYSBzYWZlIHdheSBmcm9tIGFuIGV4dGVybmFsXG5cdCAqIHdvcmtpbmcgY29weSBtYW5hZ2VyIHRoYXQgY2FuIG1ha2Ugc3VyZSBtdWx0aXBsZSBwYXJhbGxlbFxuXHQgKiByZXNvbHZlcyBleGVjdXRlIHByb3Blcmx5LlxuXHQgKi9cblx0KG9wdGlvbnM/OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5UmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdG9yZWRGaWxlV29ya2luZ0NvcHlSZXNvbHZlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFRoZSBjb250ZW50cyB0byB1c2UgZm9yIHRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgaWYga25vd24uIElmIG5vdFxuXHQgKiBwcm92aWRlZCwgdGhlIGNvbnRlbnRzIHdpbGwgYmUgcmV0cmlldmVkIGZyb20gdGhlIHVuZGVybHlpbmdcblx0ICogcmVzb3VyY2Ugb3IgYmFja3VwIGlmIHByZXNlbnQuXG5cdCAqXG5cdCAqIElmIGNvbnRlbnRzIGFyZSBwcm92aWRlZCwgdGhlIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSB3aWxsIGJlIG1hcmtlZFxuXHQgKiBhcyBkaXJ0eSByaWdodCBmcm9tIHRoZSBiZWdpbm5pbmcuXG5cdCAqL1xuXHRyZWFkb25seSBjb250ZW50cz86IFZTQnVmZmVyUmVhZGFibGVTdHJlYW07XG5cblx0LyoqXG5cdCAqIEdvIHRvIGRpc2sgYnlwYXNzaW5nIGFueSBjYWNoZSBvZiB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGlmIGFueS5cblx0ICovXG5cdHJlYWRvbmx5IGZvcmNlUmVhZEZyb21GaWxlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogSWYgcHJvdmlkZWQsIHRoZSBzaXplIG9mIHRoZSBmaWxlIHdpbGwgYmUgY2hlY2tlZCBhZ2FpbnN0IHRoZSBsaW1pdHNcblx0ICogYW5kIGFuIGVycm9yIHdpbGwgYmUgdGhyb3duIGlmIGFueSBsaW1pdCBpcyBleGNlZWRlZC5cblx0ICovXG5cdHJlYWRvbmx5IGxpbWl0cz86IElGaWxlUmVhZExpbWl0cztcbn1cblxuLyoqXG4gKiBNZXRhZGF0YSBhc3NvY2lhdGVkIHdpdGggYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgYmFja3VwLlxuICovXG5pbnRlcmZhY2UgSVN0b3JlZEZpbGVXb3JraW5nQ29weUJhY2t1cE1ldGFEYXRhIGV4dGVuZHMgSVdvcmtpbmdDb3B5QmFja3VwTWV0YSB7XG5cdHJlYWRvbmx5IG10aW1lOiBudW1iZXI7XG5cdHJlYWRvbmx5IGN0aW1lOiBudW1iZXI7XG5cdHJlYWRvbmx5IHNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgZXRhZzogc3RyaW5nO1xuXHRyZWFkb25seSBvcnBoYW5lZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUV2ZW50IGV4dGVuZHMgSVdvcmtpbmdDb3B5U2F2ZUV2ZW50IHtcblxuXHQvKipcblx0ICogVGhlIHJlc29sdmVkIHN0YXQgZnJvbSB0aGUgc2F2ZSBvcGVyYXRpb24uXG5cdCAqL1xuXHRyZWFkb25seSBzdGF0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudChlOiBJV29ya2luZ0NvcHlTYXZlRXZlbnQpOiBlIGlzIElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlRXZlbnQge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBlIGFzIElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlRXZlbnQ7XG5cblx0cmV0dXJuICEhY2FuZGlkYXRlLnN0YXQ7XG59XG5cbmV4cG9ydCBjbGFzcyBTdG9yZWRGaWxlV29ya2luZ0NvcHk8TSBleHRlbmRzIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbD4gZXh0ZW5kcyBSZXNvdXJjZVdvcmtpbmdDb3B5IGltcGxlbWVudHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weTxNPiB7XG5cblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzOiBXb3JraW5nQ29weUNhcGFiaWxpdGllcyA9IFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLk5vbmU7XG5cblx0cHJpdmF0ZSBfbW9kZWw6IE0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCBtb2RlbCgpOiBNIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX21vZGVsOyB9XG5cblx0Ly8jcmVnaW9uIGV2ZW50c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnQgPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXNvbHZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVzb2x2ZSA9IHRoaXMuX29uRGlkUmVzb2x2ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURpcnR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGlydHkgPSB0aGlzLl9vbkRpZENoYW5nZURpcnR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2F2ZUVycm9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2F2ZUVycm9yID0gdGhpcy5fb25EaWRTYXZlRXJyb3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTYXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2F2ZSA9IHRoaXMuX29uRGlkU2F2ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJldmVydCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJldmVydCA9IHRoaXMuX29uRGlkUmV2ZXJ0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmVhZG9ubHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZWFkb25seSA9IHRoaXMuX29uRGlkQ2hhbmdlUmVhZG9ubHkuZXZlbnQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgdHlwZUlkOiBzdHJpbmcsXG5cdFx0cmVzb3VyY2U6IFVSSSxcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtb2RlbEZhY3Rvcnk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3Rvcnk8TT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlcm5hbFJlc29sdmVyOiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5UmVzb2x2ZXIsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtpbmdDb3B5RmlsZVNlcnZpY2U6IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlOiBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlTZXJ2aWNlIHdvcmtpbmdDb3B5U2VydmljZTogSVdvcmtpbmdDb3B5U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtpbmdDb3B5RWRpdG9yU2VydmljZTogSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUVsZXZhdGVkRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbGV2YXRlZEZpbGVTZXJ2aWNlOiBJRWxldmF0ZWRGaWxlU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihyZXNvdXJjZSwgZmlsZVNlcnZpY2UpO1xuXG5cdFx0Ly8gTWFrZSBrbm93biB0byB3b3JraW5nIGNvcHkgc2VydmljZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdvcmtpbmdDb3B5U2VydmljZS5yZWdpc3RlcldvcmtpbmdDb3B5KHRoaXMpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlUmVhZG9ubHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5maXJlKCkpKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBEaXJ0eVxuXG5cdHByaXZhdGUgZGlydHkgPSBmYWxzZTtcblx0cHJpdmF0ZSBzYXZlZFZlcnNpb25JZDogdW5rbm93bjtcblxuXHRpc0RpcnR5KCk6IHRoaXMgaXMgSVJlc29sdmVkU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+IHtcblx0XHRyZXR1cm4gdGhpcy5kaXJ0eTtcblx0fVxuXG5cdG1hcmtNb2RpZmllZCgpOiB2b2lkIHtcblx0XHR0aGlzLnNldERpcnR5KHRydWUpOyAvLyBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgdHJhY2tzIG1vZGlmaWVkIHZpYSBkaXJ0eVxuXHR9XG5cblx0cHJpdmF0ZSBzZXREaXJ0eShkaXJ0eTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdHJldHVybjsgLy8gb25seSByZXNvbHZlZCB3b3JraW5nIGNvcGllcyBjYW4gYmUgbWFya2VkIGRpcnR5XG5cdFx0fVxuXG5cdFx0Ly8gVHJhY2sgZGlydHkgc3RhdGUgYW5kIHZlcnNpb24gaWRcblx0XHRjb25zdCB3YXNEaXJ0eSA9IHRoaXMuZGlydHk7XG5cdFx0dGhpcy5kb1NldERpcnR5KGRpcnR5KTtcblxuXHRcdC8vIEVtaXQgYXMgRXZlbnQgaWYgZGlydHkgY2hhbmdlZFxuXHRcdGlmIChkaXJ0eSAhPT0gd2FzRGlydHkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9TZXREaXJ0eShkaXJ0eTogYm9vbGVhbik6ICgpID0+IHZvaWQge1xuXHRcdGNvbnN0IHdhc0RpcnR5ID0gdGhpcy5kaXJ0eTtcblx0XHRjb25zdCB3YXNJbkNvbmZsaWN0TW9kZSA9IHRoaXMuaW5Db25mbGljdE1vZGU7XG5cdFx0Y29uc3Qgd2FzSW5FcnJvck1vZGUgPSB0aGlzLmluRXJyb3JNb2RlO1xuXHRcdGNvbnN0IG9sZFNhdmVkVmVyc2lvbklkID0gdGhpcy5zYXZlZFZlcnNpb25JZDtcblxuXHRcdGlmICghZGlydHkpIHtcblx0XHRcdHRoaXMuZGlydHkgPSBmYWxzZTtcblx0XHRcdHRoaXMuaW5Db25mbGljdE1vZGUgPSBmYWxzZTtcblx0XHRcdHRoaXMuaW5FcnJvck1vZGUgPSBmYWxzZTtcblxuXHRcdFx0Ly8gd2UgcmVtZW1iZXIgdGhlIG1vZGVscyBhbHRlcm5hdGUgdmVyc2lvbiBpZCB0byByZW1lbWJlciB3aGVuIHRoZSB2ZXJzaW9uXG5cdFx0XHQvLyBvZiB0aGUgbW9kZWwgbWF0Y2hlcyB3aXRoIHRoZSBzYXZlZCB2ZXJzaW9uIG9uIGRpc2suIHdlIG5lZWQgdG8ga2VlcCB0aGlzXG5cdFx0XHQvLyBpbiBvcmRlciB0byBmaW5kIG91dCBpZiB0aGUgbW9kZWwgY2hhbmdlZCBiYWNrIHRvIGEgc2F2ZWQgdmVyc2lvbiAoZS5nLlxuXHRcdFx0Ly8gd2hlbiB1bmRvaW5nIGxvbmcgZW5vdWdoIHRvIHJlYWNoIHRvIGEgdmVyc2lvbiB0aGF0IGlzIHNhdmVkIGFuZCB0aGVuIHRvXG5cdFx0XHQvLyBjbGVhciB0aGUgZGlydHkgZmxhZylcblx0XHRcdGlmICh0aGlzLmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0XHR0aGlzLnNhdmVkVmVyc2lvbklkID0gdGhpcy5tb2RlbC52ZXJzaW9uSWQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZGlydHkgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFJldHVybiBmdW5jdGlvbiB0byByZXZlcnQgdGhpcyBjYWxsXG5cdFx0cmV0dXJuICgpID0+IHtcblx0XHRcdHRoaXMuZGlydHkgPSB3YXNEaXJ0eTtcblx0XHRcdHRoaXMuaW5Db25mbGljdE1vZGUgPSB3YXNJbkNvbmZsaWN0TW9kZTtcblx0XHRcdHRoaXMuaW5FcnJvck1vZGUgPSB3YXNJbkVycm9yTW9kZTtcblx0XHRcdHRoaXMuc2F2ZWRWZXJzaW9uSWQgPSBvbGRTYXZlZFZlcnNpb25JZDtcblx0XHR9O1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFJlc29sdmVcblxuXHRsYXN0UmVzb2x2ZWRGaWxlU3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhIHwgdW5kZWZpbmVkOyAvLyAhISEgRE8gTk9UIE1BUksgUFJJVkFURSEgVVNFRCBJTiBURVNUUyAhISFcblxuXHRpc1Jlc29sdmVkKCk6IHRoaXMgaXMgSVJlc29sdmVkU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+IHtcblx0XHRyZXR1cm4gISF0aGlzLm1vZGVsO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZShvcHRpb25zPzogSVN0b3JlZEZpbGVXb3JraW5nQ29weVJlc29sdmVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFjZSgncmVzb2x2ZSgpIC0gZW50ZXInKTtcblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiB3ZSBhcmUgZGlzcG9zZWRcblx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHRoaXMudHJhY2UoJ3Jlc29sdmUoKSAtIGV4aXQgLSB3aXRob3V0IHJlc29sdmluZyBiZWNhdXNlIGZpbGUgd29ya2luZyBjb3B5IGlzIGRpc3Bvc2VkJyk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVbmxlc3MgdGhlcmUgYXJlIGV4cGxpY2l0IGNvbnRlbnRzIHByb3ZpZGVkLCBpdCBpcyBpbXBvcnRhbnQgdGhhdCB3ZSBkbyBub3Rcblx0XHQvLyByZXNvbHZlIGEgd29ya2luZyBjb3B5IHRoYXQgaXMgZGlydHkgb3IgaXMgaW4gdGhlIHByb2Nlc3Mgb2Ygc2F2aW5nIHRvIHByZXZlbnRcblx0XHQvLyBkYXRhIGxvc3MuXG5cdFx0aWYgKCFvcHRpb25zPy5jb250ZW50cyAmJiAodGhpcy5kaXJ0eSB8fCB0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5pc1J1bm5pbmcoKSkpIHtcblx0XHRcdHRoaXMudHJhY2UoJ3Jlc29sdmUoKSAtIGV4aXQgLSB3aXRob3V0IHJlc29sdmluZyBiZWNhdXNlIGZpbGUgd29ya2luZyBjb3B5IGlzIGRpcnR5IG9yIGJlaW5nIHNhdmVkJyk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kb1Jlc29sdmUob3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVzb2x2ZShvcHRpb25zPzogSVN0b3JlZEZpbGVXb3JraW5nQ29weVJlc29sdmVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBGaXJzdCBjaGVjayBpZiB3ZSBoYXZlIGNvbnRlbnRzIHRvIHVzZSBmb3IgdGhlIHdvcmtpbmcgY29weVxuXHRcdGlmIChvcHRpb25zPy5jb250ZW50cykge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZUZyb21CdWZmZXIob3B0aW9ucy5jb250ZW50cyk7XG5cdFx0fVxuXG5cdFx0Ly8gU2Vjb25kLCBjaGVjayBpZiB3ZSBoYXZlIGEgYmFja3VwIHRvIHJlc29sdmUgZnJvbSAob25seSBmb3IgbmV3IHdvcmtpbmcgY29waWVzKVxuXHRcdGNvbnN0IGlzTmV3ID0gIXRoaXMuaXNSZXNvbHZlZCgpO1xuXHRcdGlmIChpc05ldykge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRGcm9tQmFja3VwID0gYXdhaXQgdGhpcy5yZXNvbHZlRnJvbUJhY2t1cCgpO1xuXHRcdFx0aWYgKHJlc29sdmVkRnJvbUJhY2t1cCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmluYWxseSwgcmVzb2x2ZSBmcm9tIGZpbGUgcmVzb3VyY2Vcblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlRnJvbUZpbGUob3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVGcm9tQnVmZmVyKGJ1ZmZlcjogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhY2UoJ3Jlc29sdmVGcm9tQnVmZmVyKCknKTtcblxuXHRcdC8vIFRyeSB0byByZXNvbHZlIG1ldGRhdGEgZnJvbSBkaXNrXG5cdFx0bGV0IG10aW1lOiBudW1iZXI7XG5cdFx0bGV0IGN0aW1lOiBudW1iZXI7XG5cdFx0bGV0IHNpemU6IG51bWJlcjtcblx0XHRsZXQgZXRhZzogc3RyaW5nO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uuc3RhdCh0aGlzLnJlc291cmNlKTtcblx0XHRcdG10aW1lID0gbWV0YWRhdGEubXRpbWU7XG5cdFx0XHRjdGltZSA9IG1ldGFkYXRhLmN0aW1lO1xuXHRcdFx0c2l6ZSA9IG1ldGFkYXRhLnNpemU7XG5cdFx0XHRldGFnID0gbWV0YWRhdGEuZXRhZztcblxuXHRcdFx0Ly8gQ2xlYXIgb3JwaGFuZWQgc3RhdGUgd2hlbiByZXNvbHZpbmcgd2FzIHN1Y2Nlc3NmdWxcblx0XHRcdHRoaXMuc2V0T3JwaGFuZWQoZmFsc2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIFB1dCBzb21lIGZhbGxiYWNrIHZhbHVlcyBpbiBlcnJvciBjYXNlXG5cdFx0XHRtdGltZSA9IERhdGUubm93KCk7XG5cdFx0XHRjdGltZSA9IERhdGUubm93KCk7XG5cdFx0XHRzaXplID0gMDtcblx0XHRcdGV0YWcgPSBFVEFHX0RJU0FCTEVEO1xuXG5cdFx0XHQvLyBBcHBseSBvcnBoYW5lZCBzdGF0ZSBiYXNlZCBvbiBlcnJvciBjb2RlXG5cdFx0XHR0aGlzLnNldE9ycGhhbmVkKGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpO1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgd2l0aCBidWZmZXJcblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlRnJvbUNvbnRlbnQoe1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMucmVzb3VyY2UsXG5cdFx0XHRuYW1lOiB0aGlzLm5hbWUsXG5cdFx0XHRtdGltZSxcblx0XHRcdGN0aW1lLFxuXHRcdFx0c2l6ZSxcblx0XHRcdGV0YWcsXG5cdFx0XHR2YWx1ZTogYnVmZmVyLFxuXHRcdFx0cmVhZG9ubHk6IGZhbHNlLFxuXHRcdFx0bG9ja2VkOiBmYWxzZSxcblx0XHRcdGV4ZWN1dGFibGU6IGZhbHNlXG5cdFx0fSwgdHJ1ZSAvKiBkaXJ0eSAocmVzb2x2ZWQgZnJvbSBidWZmZXIpICovKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUZyb21CYWNrdXAoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHQvLyBSZXNvbHZlIGJhY2t1cCBpZiBhbnlcblx0XHRjb25zdCBiYWNrdXAgPSBhd2FpdCB0aGlzLndvcmtpbmdDb3B5QmFja3VwU2VydmljZS5yZXNvbHZlPElTdG9yZWRGaWxlV29ya2luZ0NvcHlCYWNrdXBNZXRhRGF0YT4odGhpcyk7XG5cblx0XHQvLyBBYm9ydCBpZiBzb21lb25lIGVsc2UgbWFuYWdlZCB0byByZXNvbHZlIHRoZSB3b3JraW5nIGNvcHkgYnkgbm93XG5cdFx0Y29uc3QgaXNOZXcgPSAhdGhpcy5pc1Jlc29sdmVkKCk7XG5cdFx0aWYgKCFpc05ldykge1xuXHRcdFx0dGhpcy50cmFjZSgncmVzb2x2ZUZyb21CYWNrdXAoKSAtIGV4aXQgLSB3aXRob3V0cmVzb2x2aW5nIGJlY2F1c2UgcHJldmlvdXNseSBuZXcgZmlsZSB3b3JraW5nIGNvcHkgZ290IGNyZWF0ZWQgbWVhbndoaWxlJyk7XG5cblx0XHRcdHJldHVybiB0cnVlOyAvLyBpbXBseSB0aGF0IHJlc29sdmluZyBoYXMgaGFwcGVuZWQgaW4gYW5vdGhlciBvcGVyYXRpb25cblx0XHR9XG5cblx0XHQvLyBUcnkgdG8gcmVzb2x2ZSBmcm9tIGJhY2t1cCBpZiB3ZSBoYXZlIGFueVxuXHRcdGlmIChiYWNrdXApIHtcblx0XHRcdGF3YWl0IHRoaXMuZG9SZXNvbHZlRnJvbUJhY2t1cChiYWNrdXApO1xuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2Ugc2lnbmFsIGJhY2sgdGhhdCByZXNvbHZpbmcgZGlkIG5vdCBoYXBwZW5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVzb2x2ZUZyb21CYWNrdXAoYmFja3VwOiBJUmVzb2x2ZWRXb3JraW5nQ29weUJhY2t1cDxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5QmFja3VwTWV0YURhdGE+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFjZSgnZG9SZXNvbHZlRnJvbUJhY2t1cCgpJyk7XG5cblx0XHQvLyBSZXNvbHZlIHdpdGggYmFja3VwXG5cdFx0YXdhaXQgdGhpcy5yZXNvbHZlRnJvbUNvbnRlbnQoe1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMucmVzb3VyY2UsXG5cdFx0XHRuYW1lOiB0aGlzLm5hbWUsXG5cdFx0XHRtdGltZTogYmFja3VwLm1ldGEgPyBiYWNrdXAubWV0YS5tdGltZSA6IERhdGUubm93KCksXG5cdFx0XHRjdGltZTogYmFja3VwLm1ldGEgPyBiYWNrdXAubWV0YS5jdGltZSA6IERhdGUubm93KCksXG5cdFx0XHRzaXplOiBiYWNrdXAubWV0YSA/IGJhY2t1cC5tZXRhLnNpemUgOiAwLFxuXHRcdFx0ZXRhZzogYmFja3VwLm1ldGEgPyBiYWNrdXAubWV0YS5ldGFnIDogRVRBR19ESVNBQkxFRCwgLy8gZXRhZyBkaXNhYmxlZCBpZiB1bmtub3duIVxuXHRcdFx0dmFsdWU6IGJhY2t1cC52YWx1ZSxcblx0XHRcdHJlYWRvbmx5OiBmYWxzZSxcblx0XHRcdGxvY2tlZDogZmFsc2UsXG5cdFx0XHRleGVjdXRhYmxlOiBmYWxzZVxuXHRcdH0sIHRydWUgLyogZGlydHkgKHJlc29sdmVkIGZyb20gYmFja3VwKSAqLyk7XG5cblx0XHQvLyBSZXN0b3JlIG9ycGhhbmVkIGZsYWcgYmFzZWQgb24gc3RhdGVcblx0XHRpZiAoYmFja3VwLm1ldGE/Lm9ycGhhbmVkKSB7XG5cdFx0XHR0aGlzLnNldE9ycGhhbmVkKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUZyb21GaWxlKG9wdGlvbnM/OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5UmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlRnJvbUZpbGUoKScpO1xuXG5cdFx0Y29uc3QgZm9yY2VSZWFkRnJvbUZpbGUgPSBvcHRpb25zPy5mb3JjZVJlYWRGcm9tRmlsZTtcblxuXHRcdC8vIERlY2lkZSBvbiBldGFnXG5cdFx0bGV0IGV0YWc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZm9yY2VSZWFkRnJvbUZpbGUpIHtcblx0XHRcdGV0YWcgPSBFVEFHX0RJU0FCTEVEOyAvLyBkaXNhYmxlIEVUYWcgaWYgd2UgZW5mb3JjZSB0byByZWFkIGZyb20gZGlza1xuXHRcdH0gZWxzZSBpZiAodGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCkge1xuXHRcdFx0ZXRhZyA9IHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQuZXRhZzsgLy8gb3RoZXJ3aXNlIHJlc3BlY3QgZXRhZyB0byBzdXBwb3J0IGNhY2hpbmdcblx0XHR9XG5cblx0XHQvLyBSZW1lbWJlciBjdXJyZW50IHZlcnNpb24gYmVmb3JlIGRvaW5nIGFueSBsb25nIHJ1bm5pbmcgb3BlcmF0aW9uXG5cdFx0Ly8gdG8gZW5zdXJlIHdlIGFyZSBub3QgY2hhbmdpbmcgYSB3b3JraW5nIGNvcHkgdGhhdCB3YXMgY2hhbmdlZFxuXHRcdC8vIG1lYW53aGlsZVxuXHRcdGNvbnN0IGN1cnJlbnRWZXJzaW9uSWQgPSB0aGlzLnZlcnNpb25JZDtcblxuXHRcdC8vIFJlc29sdmUgQ29udGVudFxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZVN0cmVhbSh0aGlzLnJlc291cmNlLCB7XG5cdFx0XHRcdGV0YWcsXG5cdFx0XHRcdGxpbWl0czogb3B0aW9ucz8ubGltaXRzXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQ2xlYXIgb3JwaGFuZWQgc3RhdGUgd2hlbiByZXNvbHZpbmcgd2FzIHN1Y2Nlc3NmdWxcblx0XHRcdHRoaXMuc2V0T3JwaGFuZWQoZmFsc2UpO1xuXG5cdFx0XHQvLyBSZXR1cm4gZWFybHkgaWYgdGhlIHdvcmtpbmcgY29weSBjb250ZW50IGhhcyBjaGFuZ2VkXG5cdFx0XHQvLyBtZWFud2hpbGUgdG8gcHJldmVudCBsb29zaW5nIGFueSBjaGFuZ2VzXG5cdFx0XHRpZiAoY3VycmVudFZlcnNpb25JZCAhPT0gdGhpcy52ZXJzaW9uSWQpIHtcblx0XHRcdFx0dGhpcy50cmFjZSgncmVzb2x2ZUZyb21GaWxlKCkgLSBleGl0IC0gd2l0aG91dCByZXNvbHZpbmcgYmVjYXVzZSBmaWxlIHdvcmtpbmcgY29weSBjb250ZW50IGNoYW5nZWQnKTtcblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMucmVzb2x2ZUZyb21Db250ZW50KGNvbnRlbnQsIGZhbHNlIC8qIG5vdCBkaXJ0eSAocmVzb2x2ZWQgZnJvbSBmaWxlKSAqLyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQ7XG5cblx0XHRcdC8vIEFwcGx5IG9ycGhhbmVkIHN0YXRlIGJhc2VkIG9uIGVycm9yIGNvZGVcblx0XHRcdHRoaXMuc2V0T3JwaGFuZWQocmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKTtcblxuXHRcdFx0Ly8gTm90TW9kaWZpZWQgc3RhdHVzIGlzIGV4cGVjdGVkIGFuZCBjYW4gYmUgaGFuZGxlZCBncmFjZWZ1bGx5XG5cdFx0XHQvLyBpZiB3ZSBhcmUgcmVzb2x2ZWQuIFdlIHN0aWxsIHdhbnQgdG8gdXBkYXRlIG91ciBsYXN0IHJlc29sdmVkXG5cdFx0XHQvLyBzdGF0IHRvIGUuZy4gZGV0ZWN0IGNoYW5nZXMgdG8gdGhlIGZpbGUncyByZWFkb25seSBzdGF0ZVxuXHRcdFx0aWYgKHRoaXMuaXNSZXNvbHZlZCgpICYmIHJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9NT0RJRklFRF9TSU5DRSkge1xuXHRcdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBOb3RNb2RpZmllZFNpbmNlRmlsZU9wZXJhdGlvbkVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVMYXN0UmVzb2x2ZWRGaWxlU3RhdChlcnJvci5zdGF0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVW5sZXNzIHdlIGFyZSBmb3JjZWQgdG8gcmVhZCBmcm9tIHRoZSBmaWxlLCBpZ25vcmUgd2hlbiBhIHdvcmtpbmcgY29weSBoYXNcblx0XHRcdC8vIGJlZW4gcmVzb2x2ZWQgb25jZSBhbmQgdGhlIGZpbGUgd2FzIGRlbGV0ZWQgbWVhbndoaWxlLiBTaW5jZSB3ZSBhbHJlYWR5IGhhdmVcblx0XHRcdC8vIHRoZSB3b3JraW5nIGNvcHkgcmVzb2x2ZWQsIHdlIGNhbiByZXR1cm4gdG8gdGhpcyBzdGF0ZSBhbmQgdXBkYXRlIHRoZSBvcnBoYW5lZFxuXHRcdFx0Ly8gZmxhZyB0byBpbmRpY2F0ZSB0aGF0IHRoaXMgd29ya2luZyBjb3B5IGhhcyBubyB2ZXJzaW9uIG9uIGRpc2sgYW55bW9yZS5cblx0XHRcdGlmICh0aGlzLmlzUmVzb2x2ZWQoKSAmJiByZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQgJiYgIWZvcmNlUmVhZEZyb21GaWxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlIGJ1YmJsZSB1cCB0aGUgZXJyb3Jcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUZyb21Db250ZW50KGNvbnRlbnQ6IElGaWxlU3RyZWFtQ29udGVudCwgZGlydHk6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlRnJvbUNvbnRlbnQoKSAtIGVudGVyJyk7XG5cblx0XHQvLyBSZXR1cm4gZWFybHkgaWYgd2UgYXJlIGRpc3Bvc2VkXG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlRnJvbUNvbnRlbnQoKSAtIGV4aXQgLSBiZWNhdXNlIHdvcmtpbmcgY29weSBpcyBkaXNwb3NlZCcpO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIG91ciByZXNvbHZlZCBkaXNrIHN0YXRcblx0XHR0aGlzLnVwZGF0ZUxhc3RSZXNvbHZlZEZpbGVTdGF0KHtcblx0XHRcdHJlc291cmNlOiB0aGlzLnJlc291cmNlLFxuXHRcdFx0bmFtZTogY29udGVudC5uYW1lLFxuXHRcdFx0bXRpbWU6IGNvbnRlbnQubXRpbWUsXG5cdFx0XHRjdGltZTogY29udGVudC5jdGltZSxcblx0XHRcdHNpemU6IGNvbnRlbnQuc2l6ZSxcblx0XHRcdGV0YWc6IGNvbnRlbnQuZXRhZyxcblx0XHRcdHJlYWRvbmx5OiBjb250ZW50LnJlYWRvbmx5LFxuXHRcdFx0bG9ja2VkOiBjb250ZW50LmxvY2tlZCxcblx0XHRcdGV4ZWN1dGFibGU6IGZhbHNlLFxuXHRcdFx0aXNGaWxlOiB0cnVlLFxuXHRcdFx0aXNEaXJlY3Rvcnk6IGZhbHNlLFxuXHRcdFx0aXNTeW1ib2xpY0xpbms6IGZhbHNlLFxuXHRcdFx0Y2hpbGRyZW46IHVuZGVmaW5lZFxuXHRcdH0pO1xuXG5cdFx0Ly8gVXBkYXRlIGV4aXN0aW5nIG1vZGVsIGlmIHdlIGhhZCBiZWVuIHJlc29sdmVkXG5cdFx0aWYgKHRoaXMuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvVXBkYXRlTW9kZWwoY29udGVudC52YWx1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIG5ldyBtb2RlbCBvdGhlcndpc2Vcblx0XHRlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuZG9DcmVhdGVNb2RlbChjb250ZW50LnZhbHVlKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgd29ya2luZyBjb3B5IGRpcnR5IGZsYWcuIFRoaXMgaXMgdmVyeSBpbXBvcnRhbnQgdG8gY2FsbFxuXHRcdC8vIGluIGJvdGggY2FzZXMgb2YgZGlydHkgb3Igbm90IGJlY2F1c2UgaXQgY29uZGl0aW9uYWxseSB1cGRhdGVzXG5cdFx0Ly8gdGhlIGBzYXZlZFZlcnNpb25JZGAgdG8gZGV0ZXJtaW5lIHRoZSB2ZXJzaW9uIHdoZW4gdG8gY29uc2lkZXJcblx0XHQvLyB0aGUgd29ya2luZyBjb3B5IGFzIHNhdmVkIGFnYWluIChlLmcuIHdoZW4gdW5kb2luZyBiYWNrIHRvIHRoZVxuXHRcdC8vIHNhdmVkIHN0YXRlKVxuXHRcdHRoaXMuc2V0RGlydHkoISFkaXJ0eSk7XG5cblx0XHQvLyBFbWl0IGFzIGV2ZW50XG5cdFx0dGhpcy5fb25EaWRSZXNvbHZlLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9DcmVhdGVNb2RlbChjb250ZW50czogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhY2UoJ2RvQ3JlYXRlTW9kZWwoKScpO1xuXG5cdFx0Ly8gQ3JlYXRlIG1vZGVsIGFuZCBkaXNwb3NlIGl0IHdoZW4gd2UgZ2V0IGRpc3Bvc2VkXG5cdFx0dGhpcy5fbW9kZWwgPSB0aGlzLl9yZWdpc3Rlcihhd2FpdCB0aGlzLm1vZGVsRmFjdG9yeS5jcmVhdGVNb2RlbCh0aGlzLnJlc291cmNlLCBjb250ZW50cywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXG5cdFx0Ly8gTW9kZWwgbGlzdGVuZXJzXG5cdFx0dGhpcy5pbnN0YWxsTW9kZWxMaXN0ZW5lcnModGhpcy5fbW9kZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBpZ25vcmVEaXJ0eU9uTW9kZWxDb250ZW50Q2hhbmdlID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBhc3luYyBkb1VwZGF0ZU1vZGVsKGNvbnRlbnRzOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFjZSgnZG9VcGRhdGVNb2RlbCgpJyk7XG5cblx0XHQvLyBVcGRhdGUgbW9kZWwgdmFsdWUgaW4gYSBibG9jayB0aGF0IGlnbm9yZXMgY29udGVudCBjaGFuZ2UgZXZlbnRzIGZvciBkaXJ0eSB0cmFja2luZ1xuXHRcdHRoaXMuaWdub3JlRGlydHlPbk1vZGVsQ29udGVudENoYW5nZSA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMubW9kZWw/LnVwZGF0ZShjb250ZW50cywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuaWdub3JlRGlydHlPbk1vZGVsQ29udGVudENoYW5nZSA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaW5zdGFsbE1vZGVsTGlzdGVuZXJzKG1vZGVsOiBNKTogdm9pZCB7XG5cblx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMwMTg5XG5cdFx0Ly8gVGhpcyBjb2RlIGhhcyBiZWVuIGV4dHJhY3RlZCB0byBhIGRpZmZlcmVudCBtZXRob2QgYmVjYXVzZSBpdCBjYXVzZWQgYSBtZW1vcnkgbGVha1xuXHRcdC8vIHdoZXJlIGB2YWx1ZWAgd2FzIGNhcHR1cmVkIGluIHRoZSBjb250ZW50IGNoYW5nZSBsaXN0ZW5lciBjbG9zdXJlIHNjb3BlLlxuXG5cdFx0Ly8gQ29udGVudCBDaGFuZ2Vcblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoZSA9PiB0aGlzLm9uTW9kZWxDb250ZW50Q2hhbmdlZChtb2RlbCwgZS5pc1VuZG9pbmcgfHwgZS5pc1JlZG9pbmcpKSk7XG5cblx0XHQvLyBMaWZlY3ljbGVcblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbldpbGxEaXNwb3NlKCgpID0+IHRoaXMuZGlzcG9zZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uTW9kZWxDb250ZW50Q2hhbmdlZChtb2RlbDogTSwgaXNVbmRvaW5nT3JSZWRvaW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy50cmFjZShgb25Nb2RlbENvbnRlbnRDaGFuZ2VkKCkgLSBlbnRlcmApO1xuXG5cdFx0Ly8gSW4gYW55IGNhc2UgaW5jcmVtZW50IHRoZSB2ZXJzaW9uIGlkIGJlY2F1c2UgaXQgdHJhY2tzIHRoZSBjb250ZW50IHN0YXRlIG9mIHRoZSBtb2RlbCBhdCBhbGwgdGltZXNcblx0XHR0aGlzLnZlcnNpb25JZCsrO1xuXHRcdHRoaXMudHJhY2UoYG9uTW9kZWxDb250ZW50Q2hhbmdlZCgpIC0gbmV3IHZlcnNpb25JZCAke3RoaXMudmVyc2lvbklkfWApO1xuXG5cdFx0Ly8gUmVtZW1iZXIgd2hlbiB0aGUgdXNlciBjaGFuZ2VkIHRoZSBtb2RlbCB0aHJvdWdoIGEgdW5kby9yZWRvIG9wZXJhdGlvbi5cblx0XHQvLyBXZSBuZWVkIHRoaXMgaW5mb3JtYXRpb24gdG8gdGhyb3R0bGUgc2F2ZSBwYXJ0aWNpcGFudHMgdG8gZml4XG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwMjU0MlxuXHRcdGlmIChpc1VuZG9pbmdPclJlZG9pbmcpIHtcblx0XHRcdHRoaXMubGFzdENvbnRlbnRDaGFuZ2VGcm9tVW5kb1JlZG8gPSBEYXRlLm5vdygpO1xuXHRcdH1cblxuXHRcdC8vIFdlIG1hcmsgY2hlY2sgZm9yIGEgZGlydHktc3RhdGUgY2hhbmdlIHVwb24gbW9kZWwgY29udGVudCBjaGFuZ2UsIHVubGVzczpcblx0XHQvLyAtIGV4cGxpY2l0bHkgaW5zdHJ1Y3RlZCB0byBpZ25vcmUgaXQgKGUuZy4gZnJvbSBtb2RlbC5yZXNvbHZlKCkpXG5cdFx0Ly8gLSB0aGUgbW9kZWwgaXMgcmVhZG9ubHkgKGluIHRoYXQgY2FzZSB3ZSBuZXZlciBhc3N1bWUgdGhlIGNoYW5nZSB3YXMgZG9uZSBieSB0aGUgdXNlcilcblx0XHRpZiAoIXRoaXMuaWdub3JlRGlydHlPbk1vZGVsQ29udGVudENoYW5nZSAmJiAhdGhpcy5pc1JlYWRvbmx5KCkpIHtcblxuXHRcdFx0Ly8gVGhlIGNvbnRlbnRzIGNoYW5nZWQgYXMgYSBtYXR0ZXIgb2YgVW5kbyBhbmQgdGhlIHZlcnNpb24gcmVhY2hlZCBtYXRjaGVzIHRoZSBzYXZlZCBvbmVcblx0XHRcdC8vIEluIHRoaXMgY2FzZSB3ZSBjbGVhciB0aGUgZGlydHkgZmxhZyBhbmQgZW1pdCBhIFNBVkVEIGV2ZW50IHRvIGluZGljYXRlIHRoaXMgc3RhdGUuXG5cdFx0XHRpZiAobW9kZWwudmVyc2lvbklkID09PSB0aGlzLnNhdmVkVmVyc2lvbklkKSB7XG5cdFx0XHRcdHRoaXMudHJhY2UoJ29uTW9kZWxDb250ZW50Q2hhbmdlZCgpIC0gbW9kZWwgY29udGVudCBjaGFuZ2VkIGJhY2sgdG8gbGFzdCBzYXZlZCB2ZXJzaW9uJyk7XG5cblx0XHRcdFx0Ly8gQ2xlYXIgZmxhZ3Ncblx0XHRcdFx0Y29uc3Qgd2FzRGlydHkgPSB0aGlzLmRpcnR5O1xuXHRcdFx0XHR0aGlzLnNldERpcnR5KGZhbHNlKTtcblxuXHRcdFx0XHQvLyBFbWl0IHJldmVydCBldmVudCBpZiB3ZSB3ZXJlIGRpcnR5XG5cdFx0XHRcdGlmICh3YXNEaXJ0eSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkUmV2ZXJ0LmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdGhlcndpc2UgdGhlIGNvbnRlbnQgaGFzIGNoYW5nZWQgYW5kIHdlIHNpZ25hbCB0aGlzIGFzIGJlY29taW5nIGRpcnR5XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0dGhpcy50cmFjZSgnb25Nb2RlbENvbnRlbnRDaGFuZ2VkKCkgLSBtb2RlbCBjb250ZW50IGNoYW5nZWQgYW5kIG1hcmtlZCBhcyBkaXJ0eScpO1xuXG5cdFx0XHRcdC8vIE1hcmsgYXMgZGlydHlcblx0XHRcdFx0dGhpcy5zZXREaXJ0eSh0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFbWl0IGFzIGV2ZW50XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZm9yY2VSZXNvbHZlRnJvbUZpbGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm47IC8vIHJldHVybiBlYXJseSB3aGVuIHRoZSB3b3JraW5nIGNvcHkgaXMgaW52YWxpZFxuXHRcdH1cblxuXHRcdC8vIFdlIGdvIHRocm91Z2ggdGhlIHJlc29sdmVyIHRvIG1ha2Vcblx0XHQvLyBzdXJlIHRoaXMga2luZCBvZiBgcmVzb2x2ZWAgaXMgcHJvcGVybHlcblx0XHQvLyBydW5uaW5nIGluIHNlcXVlbmNlIHdpdGggYW55IG90aGVyIHJ1bm5pbmdcblx0XHQvLyBgcmVzb2x2ZWAgaWYgYW55LCBpbmNsdWRpbmcgc3Vic2VxdWVudCBydW5zXG5cdFx0Ly8gdGhhdCBhcmUgdHJpZ2dlcmVkIHJpZ2h0IGFmdGVyLlxuXG5cdFx0YXdhaXQgdGhpcy5leHRlcm5hbFJlc29sdmVyKHtcblx0XHRcdGZvcmNlUmVhZEZyb21GaWxlOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gQmFja3VwXG5cblx0Z2V0IGJhY2t1cERlbGF5KCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWw/LmNvbmZpZ3VyYXRpb24/LmJhY2t1cERlbGF5O1xuXHR9XG5cblx0YXN5bmMgYmFja3VwKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVdvcmtpbmdDb3B5QmFja3VwPiB7XG5cblx0XHQvLyBGaWxsIGluIG1ldGFkYXRhIGlmIHdlIGFyZSByZXNvbHZlZFxuXHRcdGxldCBtZXRhOiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5QmFja3VwTWV0YURhdGEgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQpIHtcblx0XHRcdG1ldGEgPSB7XG5cdFx0XHRcdG10aW1lOiB0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0Lm10aW1lLFxuXHRcdFx0XHRjdGltZTogdGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdC5jdGltZSxcblx0XHRcdFx0c2l6ZTogdGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdC5zaXplLFxuXHRcdFx0XHRldGFnOiB0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0LmV0YWcsXG5cdFx0XHRcdG9ycGhhbmVkOiB0aGlzLmlzT3JwaGFuZWQoKVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBGaWxsIGluIGNvbnRlbnQgaWYgd2UgYXJlIHJlc29sdmVkXG5cdFx0bGV0IGNvbnRlbnQ6IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRjb250ZW50ID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbih0aGlzLm1vZGVsLnNuYXBzaG90KFNuYXBzaG90Q29udGV4dC5CYWNrdXAsIHRva2VuKSwgdG9rZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IG1ldGEsIGNvbnRlbnQgfTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBTYXZlXG5cblx0cHJpdmF0ZSB2ZXJzaW9uSWQgPSAwO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFVORE9fUkVET19TQVZFX1BBUlRJQ0lQQU5UU19BVVRPX1NBVkVfVEhST1RUTEVfVEhSRVNIT0xEID0gNTAwO1xuXHRwcml2YXRlIGxhc3RDb250ZW50Q2hhbmdlRnJvbVVuZG9SZWRvOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzYXZlU2VxdWVudGlhbGl6ZXIgPSBuZXcgVGFza1NlcXVlbnRpYWxpemVyKCk7XG5cblx0cHJpdmF0ZSBpZ25vcmVTYXZlRnJvbVNhdmVQYXJ0aWNpcGFudHMgPSBmYWxzZTtcblxuXHRhc3luYyBzYXZlKG9wdGlvbnM6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlQXNPcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghdGhpcy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc1JlYWRvbmx5KCkpIHtcblx0XHRcdHRoaXMudHJhY2UoJ3NhdmUoKSAtIGlnbm9yaW5nIHJlcXVlc3QgZm9yIHJlYWRvbmx5IHJlc291cmNlJyk7XG5cblx0XHRcdHJldHVybiBmYWxzZTsgLy8gaWYgd29ya2luZyBjb3B5IGlzIHJlYWRvbmx5IHdlIGRvIG5vdCBhdHRlbXB0IHRvIHNhdmUgYXQgYWxsXG5cdFx0fVxuXG5cdFx0aWYgKFxuXHRcdFx0KHRoaXMuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuQ09ORkxJQ1QpIHx8IHRoaXMuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuRVJST1IpKSAmJlxuXHRcdFx0KG9wdGlvbnMucmVhc29uID09PSBTYXZlUmVhc29uLkFVVE8gfHwgb3B0aW9ucy5yZWFzb24gPT09IFNhdmVSZWFzb24uRk9DVVNfQ0hBTkdFIHx8IG9wdGlvbnMucmVhc29uID09PSBTYXZlUmVhc29uLldJTkRPV19DSEFOR0UpXG5cdFx0KSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdzYXZlKCkgLSBpZ25vcmluZyBhdXRvIHNhdmUgcmVxdWVzdCBmb3IgZmlsZSB3b3JraW5nIGNvcHkgdGhhdCBpcyBpbiBjb25mbGljdCBvciBlcnJvcicpO1xuXG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGlmIHdvcmtpbmcgY29weSBpcyBpbiBzYXZlIGNvbmZsaWN0IG9yIGVycm9yLCBkbyBub3Qgc2F2ZSB1bmxlc3Mgc2F2ZSByZWFzb24gaXMgZXhwbGljaXRcblx0XHR9XG5cblx0XHQvLyBBY3R1YWxseSBkbyBzYXZlXG5cdFx0dGhpcy50cmFjZSgnc2F2ZSgpIC0gZW50ZXInKTtcblx0XHRhd2FpdCB0aGlzLmRvU2F2ZShvcHRpb25zKTtcblx0XHR0aGlzLnRyYWNlKCdzYXZlKCkgLSBleGl0Jyk7XG5cblx0XHRyZXR1cm4gdGhpcy5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5TQVZFRCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU2F2ZShvcHRpb25zOiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUFzT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5yZWFzb24gIT09ICdudW1iZXInKSB7XG5cdFx0XHRvcHRpb25zLnJlYXNvbiA9IFNhdmVSZWFzb24uRVhQTElDSVQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmVyc2lvbklkID0gdGhpcy52ZXJzaW9uSWQ7XG5cdFx0dGhpcy50cmFjZShgZG9TYXZlKCR7dmVyc2lvbklkfSkgLSBlbnRlciB3aXRoIHZlcnNpb25JZCAke3ZlcnNpb25JZH1gKTtcblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiBzYXZlZCBmcm9tIHdpdGhpbiBzYXZlIHBhcnRpY2lwYW50IHRvIGJyZWFrIHJlY3Vyc2lvblxuXHRcdC8vXG5cdFx0Ly8gU2NlbmFyaW86IGEgc2F2ZSBwYXJ0aWNpcGFudCB0cmlnZ2VycyBhIHNhdmUoKSBvbiB0aGUgd29ya2luZyBjb3B5XG5cdFx0aWYgKHRoaXMuaWdub3JlU2F2ZUZyb21TYXZlUGFydGljaXBhbnRzKSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBkb1NhdmUoJHt2ZXJzaW9uSWR9KSAtIGV4aXQgLSByZWZ1c2luZyB0byBzYXZlKCkgcmVjdXJzaXZlbHkgZnJvbSBzYXZlIHBhcnRpY2lwYW50YCk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBMb29rdXAgYW55IHJ1bm5pbmcgc2F2ZSBmb3IgdGhpcyB2ZXJzaW9uSWQgYW5kIHJldHVybiBpdCBpZiBmb3VuZFxuXHRcdC8vXG5cdFx0Ly8gU2NlbmFyaW86IHVzZXIgaW52b2tlZCB0aGUgc2F2ZSBhY3Rpb24gbXVsdGlwbGUgdGltZXMgcXVpY2tseSBmb3IgdGhlIHNhbWUgY29udGVudHNcblx0XHQvLyAgICAgICAgICAgd2hpbGUgdGhlIHNhdmUgd2FzIG5vdCB5ZXQgZmluaXNoZWQgdG8gZGlza1xuXHRcdC8vXG5cdFx0aWYgKHRoaXMuc2F2ZVNlcXVlbnRpYWxpemVyLmlzUnVubmluZyh2ZXJzaW9uSWQpKSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBkb1NhdmUoJHt2ZXJzaW9uSWR9KSAtIGV4aXQgLSBmb3VuZCBhIHJ1bm5pbmcgc2F2ZSBmb3IgdmVyc2lvbklkICR7dmVyc2lvbklkfWApO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5zYXZlU2VxdWVudGlhbGl6ZXIucnVubmluZztcblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gZWFybHkgaWYgbm90IGRpcnR5ICh1bmxlc3MgZm9yY2VkKVxuXHRcdC8vXG5cdFx0Ly8gU2NlbmFyaW86IHVzZXIgaW52b2tlZCBzYXZlIGFjdGlvbiBldmVuIHRob3VnaCB0aGUgd29ya2luZyBjb3B5IGlzIG5vdCBkaXJ0eVxuXHRcdGlmICghb3B0aW9ucy5mb3JjZSAmJiAhdGhpcy5kaXJ0eSkge1xuXHRcdFx0dGhpcy50cmFjZShgZG9TYXZlKCR7dmVyc2lvbklkfSkgLSBleGl0IC0gYmVjYXVzZSBub3QgZGlydHkgYW5kL29yIHZlcnNpb25JZCBpcyBkaWZmZXJlbnQgKHRoaXMuaXNEaXJ0eTogJHt0aGlzLmRpcnR5fSwgdGhpcy52ZXJzaW9uSWQ6ICR7dGhpcy52ZXJzaW9uSWR9KWApO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIGlmIGN1cnJlbnRseSBzYXZpbmcgYnkgc3RvcmluZyB0aGlzIHNhdmUgcmVxdWVzdCBhcyB0aGUgbmV4dCBzYXZlIHRoYXQgc2hvdWxkIGhhcHBlbi5cblx0XHQvLyBOZXZlciBldmVyIG11c3QgMiBzYXZlcyBleGVjdXRlIGF0IHRoZSBzYW1lIHRpbWUgYmVjYXVzZSB0aGlzIGNhbiBsZWFkIHRvIGRpcnR5IHdyaXRlcyBhbmQgcmFjZSBjb25kaXRpb25zLlxuXHRcdC8vXG5cdFx0Ly8gU2NlbmFyaW8gQTogYXV0byBzYXZlIHdhcyB0cmlnZ2VyZWQgYW5kIGlzIGN1cnJlbnRseSBidXN5IHNhdmluZyB0byBkaXNrLiB0aGlzIHRha2VzIGxvbmcgZW5vdWdoIHRoYXQgYW5vdGhlciBhdXRvIHNhdmVcblx0XHQvLyAgICAgICAgICAgICBraWNrcyBpbi5cblx0XHQvLyBTY2VuYXJpbyBCOiBzYXZlIGlzIHZlcnkgc2xvdyAoZS5nLiBuZXR3b3JrIHNoYXJlKSBhbmQgdGhlIHVzZXIgbWFuYWdlcyB0byBjaGFuZ2UgdGhlIHdvcmtpbmcgY29weSBhbmQgdHJpZ2dlciBhbm90aGVyIHNhdmVcblx0XHQvLyAgICAgICAgICAgICB3aGlsZSB0aGUgZmlyc3Qgc2F2ZSBoYXMgbm90IHJldHVybmVkIHlldC5cblx0XHQvL1xuXHRcdGlmICh0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5pc1J1bm5pbmcoKSkge1xuXHRcdFx0dGhpcy50cmFjZShgZG9TYXZlKCR7dmVyc2lvbklkfSkgLSBleGl0IC0gYmVjYXVzZSBidXN5IHNhdmluZ2ApO1xuXG5cdFx0XHQvLyBJbmRpY2F0ZSB0byB0aGUgc2F2ZSBzZXF1ZW50aWFsaXplciB0aGF0IHdlIHdhbnQgdG9cblx0XHRcdC8vIGNhbmNlbCB0aGUgcnVubmluZyBvcGVyYXRpb24gc28gdGhhdCBvdXJzIGNhbiBydW5cblx0XHRcdC8vIGJlZm9yZSB0aGUgcnVubmluZyBvbmUgZmluaXNoZXMuXG5cdFx0XHQvLyBDdXJyZW50bHkgdGhpcyB3aWxsIHRyeSB0byBjYW5jZWwgcnVubmluZyBzYXZlXG5cdFx0XHQvLyBwYXJ0aWNpcGFudHMgYW5kIHJ1bm5pbmcgc25hcHNob3RzIGZyb20gdGhlXG5cdFx0XHQvLyBzYXZlIG9wZXJhdGlvbiwgYnV0IG5vdCB0aGUgYWN0dWFsIHNhdmUgd2hpY2ggZG9lc1xuXHRcdFx0Ly8gbm90IHN1cHBvcnQgY2FuY2VsbGF0aW9uIHlldC5cblx0XHRcdHRoaXMuc2F2ZVNlcXVlbnRpYWxpemVyLmNhbmNlbFJ1bm5pbmcoKTtcblxuXHRcdFx0Ly8gUXVldWUgdGhpcyBhcyB0aGUgdXBjb21pbmcgc2F2ZSBhbmQgcmV0dXJuXG5cdFx0XHRyZXR1cm4gdGhpcy5zYXZlU2VxdWVudGlhbGl6ZXIucXVldWUoKCkgPT4gdGhpcy5kb1NhdmUob3B0aW9ucykpO1xuXHRcdH1cblxuXHRcdC8vIFB1c2ggYWxsIGVkaXQgb3BlcmF0aW9ucyB0byB0aGUgdW5kbyBzdGFjayBzbyB0aGF0IHRoZSB1c2VyIGhhcyBhIGNoYW5jZSB0b1xuXHRcdC8vIEN0cmwrWiBiYWNrIHRvIHRoZSBzYXZlZCB2ZXJzaW9uLlxuXHRcdGlmICh0aGlzLmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0dGhpcy5tb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2F2ZUNhbmNlbGxhdGlvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0cmV0dXJuIHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NhdmVQYXJ0aWNpcGFudHMnLCBcIlNhdmluZyAnezB9J1wiLCB0aGlzLm5hbWUpLFxuXHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uV2luZG93LFxuXHRcdFx0Y2FuY2VsbGFibGU6IHRydWUsXG5cdFx0XHRkZWxheTogdGhpcy5pc0RpcnR5KCkgPyAzMDAwIDogNTAwMFxuXHRcdH0sIHByb2dyZXNzID0+IHtcblx0XHRcdHJldHVybiB0aGlzLmRvU2F2ZVNlcXVlbnRpYWwodmVyc2lvbklkLCBvcHRpb25zLCBwcm9ncmVzcywgc2F2ZUNhbmNlbGxhdGlvbik7XG5cdFx0fSwgKCkgPT4ge1xuXHRcdFx0c2F2ZUNhbmNlbGxhdGlvbi5jYW5jZWwoKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHNhdmVDYW5jZWxsYXRpb24uZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1NhdmVTZXF1ZW50aWFsKHZlcnNpb25JZDogbnVtYmVyLCBvcHRpb25zOiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUFzT3B0aW9ucywgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgc2F2ZUNhbmNlbGxhdGlvbjogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zYXZlU2VxdWVudGlhbGl6ZXIucnVuKHZlcnNpb25JZCwgKGFzeW5jICgpID0+IHtcblxuXHRcdFx0Ly8gQSBzYXZlIHBhcnRpY2lwYW50IGNhbiBzdGlsbCBjaGFuZ2UgdGhlIHdvcmtpbmcgY29weSBub3dcblx0XHRcdC8vIGFuZCBzaW5jZSB3ZSBhcmUgc28gY2xvc2UgdG8gc2F2aW5nIHdlIGRvIG5vdCB3YW50IHRvIHRyaWdnZXJcblx0XHRcdC8vIGFub3RoZXIgYXV0byBzYXZlIG9yIHNpbWlsYXIsIHNvIHdlIGJsb2NrIHRoaXNcblx0XHRcdC8vIEluIGFkZGl0aW9uIHdlIHVwZGF0ZSBvdXIgdmVyc2lvbiByaWdodCBhZnRlciBpbiBjYXNlIGl0IGNoYW5nZWRcblx0XHRcdC8vIGJlY2F1c2Ugb2YgYSB3b3JraW5nIGNvcHkgY2hhbmdlXG5cdFx0XHQvLyBTYXZlIHBhcnRpY2lwYW50cyBjYW4gYWxzbyBiZSBza2lwcGVkIHRocm91Z2ggQVBJLlxuXHRcdFx0aWYgKHRoaXMuaXNSZXNvbHZlZCgpICYmICFvcHRpb25zLnNraXBTYXZlUGFydGljaXBhbnRzICYmIHRoaXMud29ya2luZ0NvcHlGaWxlU2VydmljZS5oYXNTYXZlUGFydGljaXBhbnRzKSB7XG5cdFx0XHRcdHRyeSB7XG5cblx0XHRcdFx0XHQvLyBNZWFzdXJlIHRoZSB0aW1lIGl0IHRvb2sgZnJvbSB0aGUgbGFzdCB1bmRvL3JlZG8gb3BlcmF0aW9uIHRvIHRoaXMgc2F2ZS4gSWYgdGhpc1xuXHRcdFx0XHRcdC8vIHRpbWUgaXMgYmVsb3cgYFVORE9fUkVET19TQVZFX1BBUlRJQ0lQQU5UU19USFJPVFRMRV9USFJFU0hPTERgLCB3ZSBtYWtlIHN1cmUgdG9cblx0XHRcdFx0XHQvLyBkZWxheSB0aGUgc2F2ZSBwYXJ0aWNpcGFudCBmb3IgdGhlIHJlbWFpbmluZyB0aW1lIGlmIHRoZSByZWFzb24gaXMgYXV0byBzYXZlLlxuXHRcdFx0XHRcdC8vXG5cdFx0XHRcdFx0Ly8gVGhpcyBmaXhlcyB0aGUgZm9sbG93aW5nIGlzc3VlOlxuXHRcdFx0XHRcdC8vIC0gdGhlIHVzZXIgaGFzIGNvbmZpZ3VyZWQgYXV0byBzYXZlIHdpdGggZGVsYXkgb2YgMTAwbXMgb3Igc2hvcnRlclxuXHRcdFx0XHRcdC8vIC0gdGhlIHVzZXIgaGFzIGEgc2F2ZSBwYXJ0aWNpcGFudCBlbmFibGVkIHRoYXQgbW9kaWZpZXMgdGhlIGZpbGUgb24gZWFjaCBzYXZlXG5cdFx0XHRcdFx0Ly8gLSB0aGUgdXNlciB0eXBlcyBpbnRvIHRoZSBmaWxlIGFuZCB0aGUgZmlsZSBnZXRzIHNhdmVkXG5cdFx0XHRcdFx0Ly8gLSB0aGUgdXNlciB0cmlnZ2VycyB1bmRvIG9wZXJhdGlvblxuXHRcdFx0XHRcdC8vIC0gdGhpcyB3aWxsIHVuZG8gdGhlIHNhdmUgcGFydGljaXBhbnQgY2hhbmdlIGJ1dCB0cmlnZ2VyIHRoZSBzYXZlIHBhcnRpY2lwYW50IHJpZ2h0IGFmdGVyXG5cdFx0XHRcdFx0Ly8gLSB0aGUgdXNlciBoYXMgbm8gY2hhbmNlIHRvIHVuZG8gb3ZlciB0aGUgc2F2ZSBwYXJ0aWNpcGFudFxuXHRcdFx0XHRcdC8vXG5cdFx0XHRcdFx0Ly8gUmVwb3J0ZWQgYXM6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDI1NDJcblx0XHRcdFx0XHRpZiAob3B0aW9ucy5yZWFzb24gPT09IFNhdmVSZWFzb24uQVVUTyAmJiB0eXBlb2YgdGhpcy5sYXN0Q29udGVudENoYW5nZUZyb21VbmRvUmVkbyA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRpbWVGcm9tVW5kb1JlZG9Ub1NhdmUgPSBEYXRlLm5vdygpIC0gdGhpcy5sYXN0Q29udGVudENoYW5nZUZyb21VbmRvUmVkbztcblx0XHRcdFx0XHRcdGlmICh0aW1lRnJvbVVuZG9SZWRvVG9TYXZlIDwgU3RvcmVkRmlsZVdvcmtpbmdDb3B5LlVORE9fUkVET19TQVZFX1BBUlRJQ0lQQU5UU19BVVRPX1NBVkVfVEhST1RUTEVfVEhSRVNIT0xEKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoU3RvcmVkRmlsZVdvcmtpbmdDb3B5LlVORE9fUkVET19TQVZFX1BBUlRJQ0lQQU5UU19BVVRPX1NBVkVfVEhST1RUTEVfVEhSRVNIT0xEIC0gdGltZUZyb21VbmRvUmVkb1RvU2F2ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gUnVuIHNhdmUgcGFydGljaXBhbnRzIHVubGVzcyBzYXZlIHdhcyBjYW5jZWxsZWQgbWVhbndoaWxlXG5cdFx0XHRcdFx0aWYgKCFzYXZlQ2FuY2VsbGF0aW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmlnbm9yZVNhdmVGcm9tU2F2ZVBhcnRpY2lwYW50cyA9IHRydWU7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UucnVuU2F2ZVBhcnRpY2lwYW50cyh0aGlzLCB7IHJlYXNvbjogb3B0aW9ucy5yZWFzb24gPz8gU2F2ZVJlYXNvbi5FWFBMSUNJVCwgc2F2ZWRGcm9tOiBvcHRpb25zLmZyb20gfSwgcHJvZ3Jlc3MsIHNhdmVDYW5jZWxsYXRpb24udG9rZW4pO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycikgJiYgIXNhdmVDYW5jZWxsYXRpb24udG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBwYXJ0aWNpcGFudCB3YW50cyB0byBjYW5jZWwgdGhpcyBvcGVyYXRpb25cblx0XHRcdFx0XHRcdFx0XHRzYXZlQ2FuY2VsbGF0aW9uLmNhbmNlbCgpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmlnbm9yZVNhdmVGcm9tU2F2ZVBhcnRpY2lwYW50cyA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHldIHJ1blNhdmVQYXJ0aWNpcGFudHMoJHt2ZXJzaW9uSWR9KSAtIHJlc3VsdGVkIGluIGFuIGVycm9yOiAke2Vycm9yLnRvU3RyaW5nKCl9YCwgdGhpcy5yZXNvdXJjZS50b1N0cmluZygpLCB0aGlzLnR5cGVJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSXQgaXMgcG9zc2libGUgdGhhdCBhIHN1YnNlcXVlbnQgc2F2ZSBpcyBjYW5jZWxsaW5nIHRoaXNcblx0XHRcdC8vIHJ1bm5pbmcgc2F2ZS4gQXMgc3VjaCB3ZSByZXR1cm4gZWFybHkgd2hlbiB3ZSBkZXRlY3QgdGhhdC5cblx0XHRcdGlmIChzYXZlQ2FuY2VsbGF0aW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2UgaGF2ZSB0byBwcm90ZWN0IGFnYWluc3QgYmVpbmcgZGlzcG9zZWQgYXQgdGhpcyBwb2ludC4gSXQgY291bGQgYmUgdGhhdCB0aGUgc2F2ZSgpIG9wZXJhdGlvblxuXHRcdFx0Ly8gd2FzIHRyaWdnZXJkIGZvbGxvd2VkIGJ5IGEgZGlzcG9zZSgpIG9wZXJhdGlvbiByaWdodCBhZnRlciB3aXRob3V0IHdhaXRpbmcuIFR5cGljYWxseSB3ZSBjYW5ub3Rcblx0XHRcdC8vIGJlIGRpc3Bvc2VkIGlmIHdlIGFyZSBkaXJ0eSwgYnV0IGlmIHdlIGFyZSBub3QgZGlydHksIHNhdmUoKSBhbmQgZGlzcG9zZSgpIGNhbiBzdGlsbCBiZSB0cmlnZ2VyZWRcblx0XHRcdC8vIG9uZSBhZnRlciB0aGUgb3RoZXIgd2l0aG91dCB3YWl0aW5nIGZvciB0aGUgc2F2ZSgpIHRvIGNvbXBsZXRlLiBJZiB3ZSBhcmUgZGlzcG9zZWQoKSwgd2Ugcmlza1xuXHRcdFx0Ly8gc2F2aW5nIGNvbnRlbnRzIHRvIGRpc2sgdGhhdCBhcmUgc3RhbGUgKHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNTA5NDIpLlxuXHRcdFx0Ly8gVG8gZml4IHRoaXMgaXNzdWUsIHdlIHdpbGwgbm90IHN0b3JlIHRoZSBjb250ZW50cyB0byBkaXNrIHdoZW4gd2UgZ290IGRpc3Bvc2VkLlxuXHRcdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2UgcmVxdWlyZSBhIHJlc29sdmVkIHdvcmtpbmcgY29weSBmcm9tIHRoaXMgcG9pbnQgb24sIHNpbmNlIHdlIGFyZSBhYm91dCB0byB3cml0ZSBkYXRhIHRvIGRpc2suXG5cdFx0XHRpZiAoIXRoaXMuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdXBkYXRlIHZlcnNpb25JZCB3aXRoIGl0cyBuZXcgdmFsdWUgKGlmIHByZS1zYXZlIGNoYW5nZXMgaGFwcGVuZWQpXG5cdFx0XHR2ZXJzaW9uSWQgPSB0aGlzLnZlcnNpb25JZDtcblxuXHRcdFx0Ly8gQ2xlYXIgZXJyb3IgZmxhZyBzaW5jZSB3ZSBhcmUgdHJ5aW5nIHRvIHNhdmUgYWdhaW5cblx0XHRcdHRoaXMuaW5FcnJvck1vZGUgPSBmYWxzZTtcblxuXHRcdFx0Ly8gU2F2ZSB0byBEaXNrLiBXZSBtYXJrIHRoZSBzYXZlIG9wZXJhdGlvbiBhcyBjdXJyZW50bHkgcnVubmluZyB3aXRoXG5cdFx0XHQvLyB0aGUgbGF0ZXN0IHZlcnNpb25JZCBiZWNhdXNlIGl0IG1pZ2h0IGhhdmUgY2hhbmdlZCBmcm9tIGEgc2F2ZVxuXHRcdFx0Ly8gcGFydGljaXBhbnQgdHJpZ2dlcmluZ1xuXHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ3NhdmVUZXh0RmlsZScsIFwiV3JpdGluZyBpbnRvIGZpbGUuLi5cIikgfSk7XG5cdFx0XHR0aGlzLnRyYWNlKGBkb1NhdmUoJHt2ZXJzaW9uSWR9KSAtIGJlZm9yZSB3cml0ZSgpYCk7XG5cdFx0XHRjb25zdCBsYXN0UmVzb2x2ZWRGaWxlU3RhdCA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQpO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRGaWxlV29ya2luZ0NvcHkgPSB0aGlzO1xuXHRcdFx0cmV0dXJuIHRoaXMuc2F2ZVNlcXVlbnRpYWxpemVyLnJ1bih2ZXJzaW9uSWQsIChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3Qgd3JpdGVGaWxlT3B0aW9uczogSVdyaXRlRmlsZU9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0XHRtdGltZTogbGFzdFJlc29sdmVkRmlsZVN0YXQubXRpbWUsXG5cdFx0XHRcdFx0XHRldGFnOiAob3B0aW9ucy5pZ25vcmVNb2RpZmllZFNpbmNlIHx8ICF0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UucHJldmVudFNhdmVDb25mbGljdHMobGFzdFJlc29sdmVkRmlsZVN0YXQucmVzb3VyY2UpKSA/IEVUQUdfRElTQUJMRUQgOiBsYXN0UmVzb2x2ZWRGaWxlU3RhdC5ldGFnLFxuXHRcdFx0XHRcdFx0dW5sb2NrOiBvcHRpb25zLndyaXRlVW5sb2NrXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGxldCBzdGF0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGE7XG5cblx0XHRcdFx0XHQvLyBEZWxlZ2F0ZSB0byB3b3JraW5nIGNvcHkgbW9kZWwgc2F2ZSBtZXRob2QgaWYgYW55XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiByZXNvbHZlZEZpbGVXb3JraW5nQ29weS5tb2RlbC5zYXZlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRzdGF0ID0gYXdhaXQgcmVzb2x2ZWRGaWxlV29ya2luZ0NvcHkubW9kZWwuc2F2ZSh3cml0ZUZpbGVPcHRpb25zLCBzYXZlQ2FuY2VsbGF0aW9uLnRva2VuKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChzYXZlQ2FuY2VsbGF0aW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gc2F2ZSB3YXMgY2FuY2VsbGVkXG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBPdGhlcndpc2UgYXNrIGZvciBhIHNuYXBzaG90IGFuZCBzYXZlIHZpYSBmaWxlIHNlcnZpY2VzXG5cdFx0XHRcdFx0ZWxzZSB7XG5cblx0XHRcdFx0XHRcdC8vIFNuYXBzaG90IHdvcmtpbmcgY29weSBtb2RlbCBjb250ZW50c1xuXHRcdFx0XHRcdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKHJlc29sdmVkRmlsZVdvcmtpbmdDb3B5Lm1vZGVsLnNuYXBzaG90KFNuYXBzaG90Q29udGV4dC5TYXZlLCBzYXZlQ2FuY2VsbGF0aW9uLnRva2VuKSwgc2F2ZUNhbmNlbGxhdGlvbi50b2tlbik7XG5cblx0XHRcdFx0XHRcdC8vIEl0IGlzIHBvc3NpYmxlIHRoYXQgYSBzdWJzZXF1ZW50IHNhdmUgaXMgY2FuY2VsbGluZyB0aGlzXG5cdFx0XHRcdFx0XHQvLyBydW5uaW5nIHNhdmUuIEFzIHN1Y2ggd2UgcmV0dXJuIGVhcmx5IHdoZW4gd2UgZGV0ZWN0IHRoYXRcblx0XHRcdFx0XHRcdC8vIEhvd2V2ZXIsIHdlIGRvIG5vdCBwYXNzIHRoZSB0b2tlbiBpbnRvIHRoZSBmaWxlIHNlcnZpY2Vcblx0XHRcdFx0XHRcdC8vIGJlY2F1c2UgdGhhdCBpcyBhbiBhdG9taWMgb3BlcmF0aW9uIGN1cnJlbnRseSB3aXRob3V0XG5cdFx0XHRcdFx0XHQvLyBjYW5jZWxsYXRpb24gc3VwcG9ydCwgc28gd2UgZGlzcG9zZSB0aGUgY2FuY2VsbGF0aW9uIGlmXG5cdFx0XHRcdFx0XHQvLyBpdCB3YXMgbm90IGNhbmNlbGxlZCB5ZXQuXG5cdFx0XHRcdFx0XHRpZiAoc2F2ZUNhbmNlbGxhdGlvbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzYXZlQ2FuY2VsbGF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gV3JpdGUgdGhlbSB0byBkaXNrXG5cdFx0XHRcdFx0XHRpZiAob3B0aW9ucz8ud3JpdGVFbGV2YXRlZCAmJiB0aGlzLmVsZXZhdGVkRmlsZVNlcnZpY2UuaXNTdXBwb3J0ZWQobGFzdFJlc29sdmVkRmlsZVN0YXQucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmVsZXZhdGVkRmlsZVNlcnZpY2Uud3JpdGVGaWxlRWxldmF0ZWQobGFzdFJlc29sdmVkRmlsZVN0YXQucmVzb3VyY2UsIGFzc2VydFJldHVybnNEZWZpbmVkKHNuYXBzaG90KSwgd3JpdGVGaWxlT3B0aW9ucyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUobGFzdFJlc29sdmVkRmlsZVN0YXQucmVzb3VyY2UsIGFzc2VydFJldHVybnNEZWZpbmVkKHNuYXBzaG90KSwgd3JpdGVGaWxlT3B0aW9ucyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVTYXZlU3VjY2VzcyhzdGF0LCB2ZXJzaW9uSWQsIG9wdGlvbnMpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMuaGFuZGxlU2F2ZUVycm9yKGVycm9yLCB2ZXJzaW9uSWQsIG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSgpLCAoKSA9PiBzYXZlQ2FuY2VsbGF0aW9uLmNhbmNlbCgpKTtcblx0XHR9KSgpLCAoKSA9PiBzYXZlQ2FuY2VsbGF0aW9uLmNhbmNlbCgpKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlU2F2ZVN1Y2Nlc3Moc3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhLCB2ZXJzaW9uSWQ6IG51bWJlciwgb3B0aW9uczogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVBc09wdGlvbnMpOiB2b2lkIHtcblxuXHRcdC8vIFVwZGF0ZWQgcmVzb2x2ZWQgc3RhdCB3aXRoIHVwZGF0ZWQgc3RhdFxuXHRcdHRoaXMudXBkYXRlTGFzdFJlc29sdmVkRmlsZVN0YXQoc3RhdCk7XG5cblx0XHQvLyBVcGRhdGUgZGlydHkgc3RhdGUgdW5sZXNzIHdvcmtpbmcgY29weSBoYXMgY2hhbmdlZCBtZWFud2hpbGVcblx0XHRpZiAodmVyc2lvbklkID09PSB0aGlzLnZlcnNpb25JZCkge1xuXHRcdFx0dGhpcy50cmFjZShgaGFuZGxlU2F2ZVN1Y2Nlc3MoJHt2ZXJzaW9uSWR9KSAtIHNldHRpbmcgZGlydHkgdG8gZmFsc2UgYmVjYXVzZSB2ZXJzaW9uSWQgZGlkIG5vdCBjaGFuZ2VgKTtcblx0XHRcdHRoaXMuc2V0RGlydHkoZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBoYW5kbGVTYXZlU3VjY2Vzcygke3ZlcnNpb25JZH0pIC0gbm90IHNldHRpbmcgZGlydHkgdG8gZmFsc2UgYmVjYXVzZSB2ZXJzaW9uSWQgZGlkIGNoYW5nZSBtZWFud2hpbGVgKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgb3JwaGFuIHN0YXRlIGdpdmVuIHNhdmUgd2FzIHN1Y2Nlc3NmdWxcblx0XHR0aGlzLnNldE9ycGhhbmVkKGZhbHNlKTtcblxuXHRcdC8vIEVtaXQgU2F2ZSBFdmVudFxuXHRcdHRoaXMuX29uRGlkU2F2ZS5maXJlKHsgcmVhc29uOiBvcHRpb25zLnJlYXNvbiwgc3RhdCwgc291cmNlOiBvcHRpb25zLnNvdXJjZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlU2F2ZUVycm9yKGVycm9yOiBFcnJvciwgdmVyc2lvbklkOiBudW1iZXIsIG9wdGlvbnM6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlQXNPcHRpb25zKTogdm9pZCB7XG5cdFx0KG9wdGlvbnMuaWdub3JlRXJyb3JIYW5kbGVyID8gdGhpcy5sb2dTZXJ2aWNlLnRyYWNlIDogdGhpcy5sb2dTZXJ2aWNlLmVycm9yKS5hcHBseSh0aGlzLmxvZ1NlcnZpY2UsIFtgW3N0b3JlZCBmaWxlIHdvcmtpbmcgY29weV0gaGFuZGxlU2F2ZUVycm9yKCR7dmVyc2lvbklkfSkgLSBleGl0IC0gcmVzdWx0ZWQgaW4gYSBzYXZlIGVycm9yOiAke2Vycm9yLnRvU3RyaW5nKCl9YCwgdGhpcy5yZXNvdXJjZS50b1N0cmluZygpLCB0aGlzLnR5cGVJZF0pO1xuXG5cdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIHRoZSBzYXZlKCkgY2FsbCB3YXMgbWFkZSBhc2tpbmcgdG9cblx0XHQvLyBoYW5kbGUgdGhlIHNhdmUgZXJyb3IgaXRzZWxmLlxuXHRcdGlmIChvcHRpb25zLmlnbm9yZUVycm9ySGFuZGxlcikge1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0Ly8gSW4gYW55IGNhc2Ugb2YgYW4gZXJyb3IsIHdlIG1hcmsgdGhlIHdvcmtpbmcgY29weSBhcyBkaXJ0eSB0byBwcmV2ZW50IGRhdGEgbG9zc1xuXHRcdC8vIEl0IGNvdWxkIGJlIHBvc3NpYmxlIHRoYXQgdGhlIHdyaXRlIGNvcnJ1cHRlZCB0aGUgZmlsZSBvbiBkaXNrIChlLmcuIHdoZW5cblx0XHQvLyBhbiBlcnJvciBoYXBwZW5lZCBhZnRlciB0cnVuY2F0aW5nIHRoZSBmaWxlKSBhbmQgYXMgc3VjaCB3ZSB3YW50IHRvIHByZXNlcnZlXG5cdFx0Ly8gdGhlIHdvcmtpbmcgY29weSBjb250ZW50cyB0byBwcmV2ZW50IGRhdGEgbG9zcy5cblx0XHR0aGlzLnNldERpcnR5KHRydWUpO1xuXG5cdFx0Ly8gRmxhZyBhcyBlcnJvciBzdGF0ZVxuXHRcdHRoaXMuaW5FcnJvck1vZGUgPSB0cnVlO1xuXG5cdFx0Ly8gTG9vayBvdXQgZm9yIGEgc2F2ZSBjb25mbGljdFxuXHRcdGlmICgoZXJyb3IgYXMgRmlsZU9wZXJhdGlvbkVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9ESUZJRURfU0lOQ0UpIHtcblx0XHRcdHRoaXMuaW5Db25mbGljdE1vZGUgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgc2F2ZSBlcnJvciB0byB1c2VyIGZvciBoYW5kbGluZ1xuXHRcdHRoaXMuZG9IYW5kbGVTYXZlRXJyb3IoZXJyb3IsIG9wdGlvbnMpO1xuXG5cdFx0Ly8gRW1pdCBhcyBldmVudFxuXHRcdHRoaXMuX29uRGlkU2F2ZUVycm9yLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9IYW5kbGVTYXZlRXJyb3IoZXJyb3I6IEVycm9yLCBvcHRpb25zOiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUFzT3B0aW9ucyk6IHZvaWQge1xuXHRcdGNvbnN0IGZpbGVPcGVyYXRpb25FcnJvciA9IGVycm9yIGFzIEZpbGVPcGVyYXRpb25FcnJvcjtcblx0XHRjb25zdCBwcmltYXJ5QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cblx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXG5cdFx0Ly8gRGlydHkgd3JpdGUgcHJldmVudGlvblxuXHRcdGlmIChmaWxlT3BlcmF0aW9uRXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PRElGSUVEX1NJTkNFKSB7XG5cdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ3N0YWxlU2F2ZUVycm9yJywgXCJGYWlsZWQgdG8gc2F2ZSAnezB9JzogVGhlIGNvbnRlbnQgb2YgdGhlIGZpbGUgaXMgbmV3ZXIuIERvIHlvdSB3YW50IHRvIG92ZXJ3cml0ZSB0aGUgZmlsZSB3aXRoIHlvdXIgY2hhbmdlcz9cIiwgdGhpcy5uYW1lKTtcblxuXHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCh0b0FjdGlvbih7IGlkOiAnZmlsZVdvcmtpbmdDb3B5Lm92ZXJ3cml0ZScsIGxhYmVsOiBsb2NhbGl6ZSgnb3ZlcndyaXRlJywgXCJPdmVyd3JpdGVcIiksIHJ1bjogKCkgPT4gdGhpcy5zYXZlKHsgLi4ub3B0aW9ucywgaWdub3JlTW9kaWZpZWRTaW5jZTogdHJ1ZSwgcmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lUIH0pIH0pKTtcblx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2godG9BY3Rpb24oeyBpZDogJ2ZpbGVXb3JraW5nQ29weS5yZXZlcnQnLCBsYWJlbDogbG9jYWxpemUoJ3JldmVydCcsIFwiUmV2ZXJ0XCIpLCBydW46ICgpID0+IHRoaXMucmV2ZXJ0KCkgfSkpO1xuXHRcdH1cblxuXHRcdC8vIEFueSBvdGhlciBzYXZlIGVycm9yXG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBpc1dyaXRlTG9ja2VkID0gZmlsZU9wZXJhdGlvbkVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9XUklURV9MT0NLRUQ7XG5cdFx0XHRjb25zdCB0cmllZFRvVW5sb2NrID0gaXNXcml0ZUxvY2tlZCAmJiAoZmlsZU9wZXJhdGlvbkVycm9yLm9wdGlvbnMgYXMgSVdyaXRlRmlsZU9wdGlvbnMgfCB1bmRlZmluZWQpPy51bmxvY2s7XG5cdFx0XHRjb25zdCBpc1Blcm1pc3Npb25EZW5pZWQgPSBmaWxlT3BlcmF0aW9uRXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEO1xuXHRcdFx0Y29uc3QgY2FuU2F2ZUVsZXZhdGVkID0gdGhpcy5lbGV2YXRlZEZpbGVTZXJ2aWNlLmlzU3VwcG9ydGVkKHRoaXMucmVzb3VyY2UpO1xuXG5cdFx0XHQvLyBFcnJvciB3aXRoIEFjdGlvbnNcblx0XHRcdGlmIChpc0Vycm9yV2l0aEFjdGlvbnMoZXJyb3IpKSB7XG5cdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2goLi4uZXJyb3IuYWN0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNhdmUgRWxldmF0ZWRcblx0XHRcdGlmIChjYW5TYXZlRWxldmF0ZWQgJiYgKGlzUGVybWlzc2lvbkRlbmllZCB8fCB0cmllZFRvVW5sb2NrKSkge1xuXHRcdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRpZDogJ2ZpbGVXb3JraW5nQ29weS5zYXZlRWxldmF0ZWQnLFxuXHRcdFx0XHRcdGxhYmVsOiB0cmllZFRvVW5sb2NrID9cblx0XHRcdFx0XHRcdGlzV2luZG93cyA/IGxvY2FsaXplKCdvdmVyd3JpdGVFbGV2YXRlZCcsIFwiT3ZlcndyaXRlIGFzIEFkbWluLi4uXCIpIDogbG9jYWxpemUoJ292ZXJ3cml0ZUVsZXZhdGVkU3VkbycsIFwiT3ZlcndyaXRlIGFzIFN1ZG8uLi5cIikgOlxuXHRcdFx0XHRcdFx0aXNXaW5kb3dzID8gbG9jYWxpemUoJ3NhdmVFbGV2YXRlZCcsIFwiUmV0cnkgYXMgQWRtaW4uLi5cIikgOiBsb2NhbGl6ZSgnc2F2ZUVsZXZhdGVkU3VkbycsIFwiUmV0cnkgYXMgU3Vkby4uLlwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuc2F2ZSh7IC4uLm9wdGlvbnMsIHdyaXRlRWxldmF0ZWQ6IHRydWUsIHdyaXRlVW5sb2NrOiB0cmllZFRvVW5sb2NrLCByZWFzb246IFNhdmVSZWFzb24uRVhQTElDSVQgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVubG9ja1xuXHRcdFx0ZWxzZSBpZiAoaXNXcml0ZUxvY2tlZCkge1xuXHRcdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHsgaWQ6ICdmaWxlV29ya2luZ0NvcHkudW5sb2NrJywgbGFiZWw6IGxvY2FsaXplKCdvdmVyd3JpdGUnLCBcIk92ZXJ3cml0ZVwiKSwgcnVuOiAoKSA9PiB0aGlzLnNhdmUoeyAuLi5vcHRpb25zLCB3cml0ZVVubG9jazogdHJ1ZSwgcmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lUIH0pIH0pKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmV0cnlcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHsgaWQ6ICdmaWxlV29ya2luZ0NvcHkucmV0cnknLCBsYWJlbDogbG9jYWxpemUoJ3JldHJ5JywgXCJSZXRyeVwiKSwgcnVuOiAoKSA9PiB0aGlzLnNhdmUoeyAuLi5vcHRpb25zLCByZWFzb246IFNhdmVSZWFzb24uRVhQTElDSVQgfSkgfSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTYXZlIEFzXG5cdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdmaWxlV29ya2luZ0NvcHkuc2F2ZUFzJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzYXZlQXMnLCBcIlNhdmUgQXMuLi5cIiksXG5cdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMud29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLmZpbmRFZGl0b3IodGhpcyk7XG5cdFx0XHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLnNhdmUoZWRpdG9yLCB7IHNhdmVBczogdHJ1ZSwgcmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lUIH0pO1xuXHRcdFx0XHRcdFx0aWYgKCFyZXN1bHQuc3VjY2Vzcykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmRvSGFuZGxlU2F2ZUVycm9yKGVycm9yLCBvcHRpb25zKTsgLy8gc2hvdyBlcnJvciBhZ2FpbiBnaXZlbiB0aGUgb3BlcmF0aW9uIGZhaWxlZFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBSZXZlcnRcblx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2godG9BY3Rpb24oeyBpZDogJ2ZpbGVXb3JraW5nQ29weS5yZXZlcnQnLCBsYWJlbDogbG9jYWxpemUoJ3JldmVydCcsIFwiUmV2ZXJ0XCIpLCBydW46ICgpID0+IHRoaXMucmV2ZXJ0KCkgfSkpO1xuXG5cdFx0XHQvLyBNZXNzYWdlXG5cdFx0XHRpZiAoaXNXcml0ZUxvY2tlZCkge1xuXHRcdFx0XHRpZiAodHJpZWRUb1VubG9jayAmJiBjYW5TYXZlRWxldmF0ZWQpIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gaXNXaW5kb3dzID9cblx0XHRcdFx0XHRcdGxvY2FsaXplKCdyZWFkb25seVNhdmVFcnJvckFkbWluJywgXCJGYWlsZWQgdG8gc2F2ZSAnezB9JzogRmlsZSBpcyByZWFkLW9ubHkuIFNlbGVjdCAnT3ZlcndyaXRlIGFzIEFkbWluJyB0byByZXRyeSBhcyBhZG1pbmlzdHJhdG9yLlwiLCB0aGlzLm5hbWUpIDpcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdyZWFkb25seVNhdmVFcnJvclN1ZG8nLCBcIkZhaWxlZCB0byBzYXZlICd7MH0nOiBGaWxlIGlzIHJlYWQtb25seS4gU2VsZWN0ICdPdmVyd3JpdGUgYXMgU3VkbycgdG8gcmV0cnkgYXMgc3VwZXJ1c2VyLlwiLCB0aGlzLm5hbWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgncmVhZG9ubHlTYXZlRXJyb3InLCBcIkZhaWxlZCB0byBzYXZlICd7MH0nOiBGaWxlIGlzIHJlYWQtb25seS4gU2VsZWN0ICdPdmVyd3JpdGUnIHRvIGF0dGVtcHQgdG8gbWFrZSBpdCB3cml0ZWFibGUuXCIsIHRoaXMubmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoY2FuU2F2ZUVsZXZhdGVkICYmIGlzUGVybWlzc2lvbkRlbmllZCkge1xuXHRcdFx0XHRtZXNzYWdlID0gaXNXaW5kb3dzID9cblx0XHRcdFx0XHRsb2NhbGl6ZSgncGVybWlzc2lvbkRlbmllZFNhdmVFcnJvcicsIFwiRmFpbGVkIHRvIHNhdmUgJ3swfSc6IEluc3VmZmljaWVudCBwZXJtaXNzaW9ucy4gU2VsZWN0ICdSZXRyeSBhcyBBZG1pbicgdG8gcmV0cnkgYXMgYWRtaW5pc3RyYXRvci5cIiwgdGhpcy5uYW1lKSA6XG5cdFx0XHRcdFx0bG9jYWxpemUoJ3Blcm1pc3Npb25EZW5pZWRTYXZlRXJyb3JTdWRvJywgXCJGYWlsZWQgdG8gc2F2ZSAnezB9JzogSW5zdWZmaWNpZW50IHBlcm1pc3Npb25zLiBTZWxlY3QgJ1JldHJ5IGFzIFN1ZG8nIHRvIHJldHJ5IGFzIHN1cGVydXNlci5cIiwgdGhpcy5uYW1lKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSh7IGtleTogJ2dlbmVyaWNTYXZlRXJyb3InLCBjb21tZW50OiBbJ3swfSBpcyB0aGUgcmVzb3VyY2UgdGhhdCBmYWlsZWQgdG8gc2F2ZSBhbmQgezF9IHRoZSBlcnJvciBtZXNzYWdlJ10gfSwgXCJGYWlsZWQgdG8gc2F2ZSAnezB9JzogezF9XCIsIHRoaXMubmFtZSwgdG9FcnJvck1lc3NhZ2UoZXJyb3IsIGZhbHNlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyB0byB0aGUgdXNlciBhcyBub3RpZmljYXRpb25cblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHsgaWQ6IGAke2hhc2godGhpcy5yZXNvdXJjZS50b1N0cmluZygpKX1gLCBzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2UsIGFjdGlvbnM6IHsgcHJpbWFyeTogcHJpbWFyeUFjdGlvbnMgfSB9KTtcblxuXHRcdC8vIFJlbW92ZSBhdXRvbWF0aWNhbGx5IHdoZW4gd2UgZ2V0IHNhdmVkL3JldmVydGVkXG5cdFx0Y29uc3QgbGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihFdmVudC5vbmNlKEV2ZW50LmFueSh0aGlzLm9uRGlkU2F2ZSwgdGhpcy5vbkRpZFJldmVydCkpKCgpID0+IGhhbmRsZS5jbG9zZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQub25jZShoYW5kbGUub25EaWRDbG9zZSkoKCkgPT4gbGlzdGVuZXIuZGlzcG9zZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUxhc3RSZXNvbHZlZEZpbGVTdGF0KG5ld0ZpbGVTdGF0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBvbGRSZWFkb25seSA9IHRoaXMuaXNSZWFkb25seSgpO1xuXG5cdFx0Ly8gRmlyc3QgcmVzb2x2ZSAtIGp1c3QgdGFrZVxuXHRcdGlmICghdGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCkge1xuXHRcdFx0dGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCA9IG5ld0ZpbGVTdGF0O1xuXHRcdH1cblxuXHRcdC8vIFN1YnNlcXVlbnQgcmVzb2x2ZSAtIG1ha2Ugc3VyZSB0aGF0IHdlIG9ubHkgYXNzaWduIGl0IGlmIHRoZSBtdGltZVxuXHRcdC8vIGlzIGVxdWFsIG9yIGhhcyBhZHZhbmNlZC5cblx0XHQvLyBUaGlzIHByZXZlbnRzIHJhY2UgY29uZGl0aW9ucyBmcm9tIHJlc29sdmluZyBhbmQgc2F2aW5nLiBJZiBhIHNhdmVcblx0XHQvLyBjb21lcyBpbiBsYXRlIGFmdGVyIGEgcmV2ZXJ0IHdhcyBjYWxsZWQsIHRoZSBtdGltZSBjb3VsZCBiZSBvdXQgb2Zcblx0XHQvLyBzeW5jLlxuXHRcdGVsc2UgaWYgKHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQubXRpbWUgPD0gbmV3RmlsZVN0YXQubXRpbWUpIHtcblx0XHRcdHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQgPSBuZXdGaWxlU3RhdDtcblx0XHR9XG5cblx0XHQvLyBJbiBhbGwgb3RoZXIgY2FzZXMgdXBkYXRlIG9ubHkgdGhlIHJlYWRvbmx5IGFuZCBsb2NrZWQgZmxhZ3Ncblx0XHRlbHNlIHtcblx0XHRcdHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQgPSB7IC4uLnRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQsIHJlYWRvbmx5OiBuZXdGaWxlU3RhdC5yZWFkb25seSwgbG9ja2VkOiBuZXdGaWxlU3RhdC5sb2NrZWQgfTtcblx0XHR9XG5cblx0XHQvLyBTaWduYWwgdGhhdCB0aGUgcmVhZG9ubHkgc3RhdGUgY2hhbmdlZFxuXHRcdGlmICh0aGlzLmlzUmVhZG9ubHkoKSAhPT0gb2xkUmVhZG9ubHkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVhZG9ubHkuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBSZXZlcnRcblxuXHRhc3luYyByZXZlcnQob3B0aW9ucz86IElSZXZlcnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmlzUmVzb2x2ZWQoKSB8fCAoIXRoaXMuZGlydHkgJiYgIW9wdGlvbnM/LmZvcmNlKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBpZ25vcmUgaWYgbm90IHJlc29sdmVkIG9yIG5vdCBkaXJ0eSBhbmQgbm90IGVuZm9yY2VkXG5cdFx0fVxuXG5cdFx0dGhpcy50cmFjZSgncmV2ZXJ0KCknKTtcblxuXHRcdC8vIFVuc2V0IGZsYWdzXG5cdFx0Y29uc3Qgd2FzRGlydHkgPSB0aGlzLmRpcnR5O1xuXHRcdGNvbnN0IHVuZG9TZXREaXJ0eSA9IHRoaXMuZG9TZXREaXJ0eShmYWxzZSk7XG5cblx0XHQvLyBGb3JjZSByZWFkIGZyb20gZGlzayB1bmxlc3MgcmV2ZXJ0aW5nIHNvZnRcblx0XHRjb25zdCBzb2Z0VW5kbyA9IG9wdGlvbnM/LnNvZnQ7XG5cdFx0aWYgKCFzb2Z0VW5kbykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5mb3JjZVJlc29sdmVGcm9tRmlsZSgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0XHQvLyBGaWxlTm90Rm91bmQgbWVhbnMgdGhlIGZpbGUgZ290IGRlbGV0ZWQgbWVhbndoaWxlLCBzbyBpZ25vcmUgaXRcblx0XHRcdFx0aWYgKChlcnJvciBhcyBGaWxlT3BlcmF0aW9uRXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblxuXHRcdFx0XHRcdC8vIFNldCBmbGFncyBiYWNrIHRvIHByZXZpb3VzIHZhbHVlcywgd2UgYXJlIHN0aWxsIGRpcnR5IGlmIHJldmVydCBmYWlsZWRcblx0XHRcdFx0XHR1bmRvU2V0RGlydHkoKTtcblxuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRW1pdCBmaWxlIGNoYW5nZSBldmVudFxuXHRcdHRoaXMuX29uRGlkUmV2ZXJ0LmZpcmUoKTtcblxuXHRcdC8vIEVtaXQgZGlydHkgY2hhbmdlIGV2ZW50XG5cdFx0aWYgKHdhc0RpcnR5KSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURpcnR5LmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gU3RhdGVcblxuXHRwcml2YXRlIGluQ29uZmxpY3RNb2RlID0gZmFsc2U7XG5cdHByaXZhdGUgaW5FcnJvck1vZGUgPSBmYWxzZTtcblxuXHRoYXNTdGF0ZShzdGF0ZTogU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUpOiBib29sZWFuIHtcblx0XHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0XHRjYXNlIFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLkNPTkZMSUNUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbkNvbmZsaWN0TW9kZTtcblx0XHRcdGNhc2UgU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuRElSVFk6XG5cdFx0XHRcdHJldHVybiB0aGlzLmRpcnR5O1xuXHRcdFx0Y2FzZSBTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5FUlJPUjpcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5FcnJvck1vZGU7XG5cdFx0XHRjYXNlIFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLk9SUEhBTjpcblx0XHRcdFx0cmV0dXJuIHRoaXMuaXNPcnBoYW5lZCgpO1xuXHRcdFx0Y2FzZSBTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5QRU5ESU5HX1NBVkU6XG5cdFx0XHRcdHJldHVybiB0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5pc1J1bm5pbmcoKTtcblx0XHRcdGNhc2UgU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuU0FWRUQ6XG5cdFx0XHRcdHJldHVybiAhdGhpcy5kaXJ0eTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBqb2luU3RhdGUoc3RhdGU6IFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLlBFTkRJTkdfU0FWRSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5ydW5uaW5nO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFV0aWxpdGllc1xuXG5cdGlzUmVhZG9ubHkoKTogYm9vbGVhbiB8IElNYXJrZG93blN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5pc1JlYWRvbmx5KHRoaXMucmVzb3VyY2UsIHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQpO1xuXHR9XG5cblx0cHJpdmF0ZSB0cmFjZShtc2c6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3N0b3JlZCBmaWxlIHdvcmtpbmcgY29weV0gJHttc2d9YCwgdGhpcy5yZXNvdXJjZS50b1N0cmluZygpLCB0aGlzLnR5cGVJZCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRGlzcG9zZVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy50cmFjZSgnZGlzcG9zZSgpJyk7XG5cblx0XHQvLyBTdGF0ZVxuXHRcdHRoaXMuaW5Db25mbGljdE1vZGUgPSBmYWxzZTtcblx0XHR0aGlzLmluRXJyb3JNb2RlID0gZmFsc2U7XG5cblx0XHQvLyBGcmVlIHVwIG1vZGVsIGZvciBHQ1xuXHRcdHRoaXMuX21vZGVsID0gdW5kZWZpbmVkO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsT0FBTyxlQUFlO0FBQy9CLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQW1DLHFCQUFzQyxjQUE0RSwwQ0FBMEM7QUFDeE0sU0FBdUMsa0JBQWtCO0FBQ3pELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQTRFLCtCQUErQjtBQUMzRyxTQUFTLGtCQUFrQixvQkFBb0IsZUFBZTtBQUM5RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLCtCQUErQjtBQUV4QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGlDQUE2RDtBQUN0RSxTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsb0JBQW9CLHNCQUFzQjtBQUNuRCxTQUFrQixnQkFBZ0I7QUFDbEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBK0IsMkJBQTJCO0FBQzFELFNBQWdGLHVCQUF1QjtBQUV2RyxTQUFvQixrQkFBaUMsd0JBQXdCO0FBQzdFLFNBQVMsMkJBQTJCO0FBc0o3QixJQUFXLDZCQUFYLGtCQUFXQSxnQ0FBWDtBQUtOLEVBQUFBLHdEQUFBO0FBS0EsRUFBQUEsd0RBQUE7QUFNQSxFQUFBQSx3REFB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
