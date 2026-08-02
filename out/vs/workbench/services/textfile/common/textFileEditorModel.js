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
import { Emitter } from "../../../../base/common/event.js";
import { mark } from "../../../../base/common/performance.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { EncodingMode, ITextFileService, TextFileEditorModelState, TextFileResolveReason } from "./textfiles.js";
import { SaveReason, SaveSourceRegistry } from "../../../common/editor.js";
import { BaseTextEditorModel } from "../../../common/editor/textEditorModel.js";
import { IWorkingCopyBackupService } from "../../workingCopy/common/workingCopyBackup.js";
import { IFileService, FileOperationResult, FileChangeType, ETAG_DISABLED, NotModifiedSinceFileOperationError } from "../../../../platform/files/common/files.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { timeout, TaskSequentializer } from "../../../../base/common/async.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { basename } from "../../../../base/common/path.js";
import { IWorkingCopyService } from "../../workingCopy/common/workingCopyService.js";
import { WorkingCopyCapabilities, NO_TYPE_ID } from "../../workingCopy/common/workingCopy.js";
import { IFilesConfigurationService } from "../../filesConfiguration/common/filesConfigurationService.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { UTF16be, UTF16le, UTF8, UTF8_with_bom } from "./encoding.js";
import { createTextBufferFactoryFromStream } from "../../../../editor/common/model/textModel.js";
import { ILanguageDetectionService } from "../../languageDetection/common/languageDetectionWorkerService.js";
import { IPathService } from "../../path/common/pathService.js";
import { extUri } from "../../../../base/common/resources.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { EditSources } from "../../../../editor/common/textModelEditSource.js";
let TextFileEditorModel = class extends BaseTextEditorModel {
  constructor(resource, preferredEncoding, preferredLanguageId, languageService, modelService, fileService, textFileService, workingCopyBackupService, logService, workingCopyService, filesConfigurationService, labelService, languageDetectionService, accessibilityService, pathService, extensionService, progressService) {
    super(modelService, languageService, languageDetectionService, accessibilityService);
    this.resource = resource;
    this.preferredEncoding = preferredEncoding;
    this.preferredLanguageId = preferredLanguageId;
    this.fileService = fileService;
    this.textFileService = textFileService;
    this.workingCopyBackupService = workingCopyBackupService;
    this.logService = logService;
    this.workingCopyService = workingCopyService;
    this.filesConfigurationService = filesConfigurationService;
    this.labelService = labelService;
    this.pathService = pathService;
    this.extensionService = extensionService;
    this.progressService = progressService;
    //#region Events
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
    this._onDidChangeEncoding = this._register(new Emitter());
    this.onDidChangeEncoding = this._onDidChangeEncoding.event;
    this._onDidChangeOrphaned = this._register(new Emitter());
    this.onDidChangeOrphaned = this._onDidChangeOrphaned.event;
    this._onDidChangeReadonly = this._register(new Emitter());
    this.onDidChangeReadonly = this._onDidChangeReadonly.event;
    //#endregion
    this.typeId = NO_TYPE_ID;
    // IMPORTANT: never change this to not break existing assumptions (e.g. backups)
    this.capabilities = WorkingCopyCapabilities.None;
    // encoding as reported from disk
    this.versionId = 0;
    this.ignoreDirtyOnModelContentChange = false;
    this.ignoreSaveFromSaveParticipants = false;
    this.lastModelContentChangeFromUndoRedo = void 0;
    // !!! DO NOT MARK PRIVATE! USED IN TESTS !!!
    this.saveSequentializer = new TaskSequentializer();
    this.dirty = false;
    this.inConflictMode = false;
    this.inOrphanMode = false;
    this.inErrorMode = false;
    this.hasEncodingSetExplicitly = false;
    this.name = basename(this.labelService.getUriLabel(this.resource));
    this.resourceHasExtension = !!extUri.extname(this.resource);
    this._register(this.workingCopyService.registerWorkingCopy(this));
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.fileService.onDidFilesChange((e) => this.onDidFilesChange(e)));
    this._register(this.filesConfigurationService.onDidChangeFilesAssociation(() => this.onDidChangeFilesAssociation()));
    this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeReadonly.fire()));
  }
  async onDidFilesChange(e) {
    let fileEventImpactsModel = false;
    let newInOrphanModeGuess;
    if (this.inOrphanMode) {
      const modelFileAdded = e.contains(this.resource, FileChangeType.ADDED);
      if (modelFileAdded) {
        newInOrphanModeGuess = false;
        fileEventImpactsModel = true;
      }
    } else {
      const modelFileDeleted = e.contains(this.resource, FileChangeType.DELETED);
      if (modelFileDeleted) {
        newInOrphanModeGuess = true;
        fileEventImpactsModel = true;
      }
    }
    if (fileEventImpactsModel && this.inOrphanMode !== newInOrphanModeGuess) {
      let newInOrphanModeValidated = false;
      if (newInOrphanModeGuess) {
        await timeout(100, CancellationToken.None);
        if (this.isDisposed()) {
          newInOrphanModeValidated = true;
        } else {
          const exists = await this.fileService.exists(this.resource);
          newInOrphanModeValidated = !exists;
        }
      }
      if (this.inOrphanMode !== newInOrphanModeValidated && !this.isDisposed()) {
        this.setOrphaned(newInOrphanModeValidated);
      }
    }
  }
  setOrphaned(orphaned) {
    if (this.inOrphanMode !== orphaned) {
      this.inOrphanMode = orphaned;
      this._onDidChangeOrphaned.fire();
    }
  }
  onDidChangeFilesAssociation() {
    if (!this.isResolved()) {
      return;
    }
    const firstLineText = this.getFirstLineText(this.textEditorModel);
    const languageSelection = this.getOrCreateLanguage(this.resource, this.languageService, this.preferredLanguageId, firstLineText);
    this.textEditorModel.setLanguage(languageSelection);
  }
  setLanguageId(languageId, source) {
    super.setLanguageId(languageId, source);
    this.preferredLanguageId = languageId;
  }
  //#region Backup
  async backup(token) {
    let meta = void 0;
    if (this.lastResolvedFileStat) {
      meta = {
        mtime: this.lastResolvedFileStat.mtime,
        ctime: this.lastResolvedFileStat.ctime,
        size: this.lastResolvedFileStat.size,
        etag: this.lastResolvedFileStat.etag,
        orphaned: this.inOrphanMode
      };
    }
    const content = await this.textFileService.getEncodedReadable(this.resource, this.createSnapshot() ?? void 0, { encoding: UTF8 });
    return { meta, content };
  }
  //#endregion
  //#region Revert
  async revert(options) {
    if (!this.isResolved()) {
      return;
    }
    const wasDirty = this.dirty;
    const undo = this.doSetDirty(false);
    const softUndo = options?.soft;
    if (!softUndo) {
      try {
        await this.forceResolveFromFile();
      } catch (error) {
        if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
          undo();
          throw error;
        }
      }
    }
    this._onDidRevert.fire();
    if (wasDirty) {
      this._onDidChangeDirty.fire();
    }
  }
  //#endregion
  //#region Resolve
  async resolve(options) {
    this.trace("resolve() - enter");
    mark("code/willResolveTextFileEditorModel");
    if (this.isDisposed()) {
      this.trace("resolve() - exit - without resolving because model is disposed");
      return;
    }
    if (!options?.contents && (this.dirty || this.saveSequentializer.isRunning())) {
      this.trace("resolve() - exit - without resolving because model is dirty or being saved");
      return;
    }
    await this.doResolve(options);
    mark("code/didResolveTextFileEditorModel");
  }
  async doResolve(options) {
    if (options?.contents) {
      return this.resolveFromBuffer(options.contents, options);
    }
    const isNewModel = !this.isResolved();
    if (isNewModel) {
      const resolvedFromBackup = await this.resolveFromBackup(options);
      if (resolvedFromBackup) {
        return;
      }
    }
    return this.resolveFromFile(options);
  }
  async resolveFromBuffer(buffer, options) {
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
    const preferredEncoding = await this.textFileService.encoding.getPreferredWriteEncoding(this.resource, this.preferredEncoding);
    this.resolveFromContent({
      resource: this.resource,
      name: this.name,
      mtime,
      ctime,
      size,
      etag,
      value: buffer,
      encoding: preferredEncoding.encoding,
      readonly: false,
      locked: false,
      executable: false
    }, true, options);
  }
  async resolveFromBackup(options) {
    const backup = await this.workingCopyBackupService.resolve(this);
    let encoding = UTF8;
    if (backup) {
      encoding = (await this.textFileService.encoding.getPreferredWriteEncoding(this.resource, this.preferredEncoding)).encoding;
    }
    const isNewModel = !this.isResolved();
    if (!isNewModel) {
      this.trace("resolveFromBackup() - exit - without resolving because previously new model got created meanwhile");
      return true;
    }
    if (backup) {
      await this.doResolveFromBackup(backup, encoding, options);
      return true;
    }
    return false;
  }
  async doResolveFromBackup(backup, encoding, options) {
    this.trace("doResolveFromBackup()");
    this.resolveFromContent({
      resource: this.resource,
      name: this.name,
      mtime: backup.meta ? backup.meta.mtime : Date.now(),
      ctime: backup.meta ? backup.meta.ctime : Date.now(),
      size: backup.meta ? backup.meta.size : 0,
      etag: backup.meta ? backup.meta.etag : ETAG_DISABLED,
      // etag disabled if unknown!
      value: await createTextBufferFactoryFromStream(await this.textFileService.getDecodedStream(this.resource, backup.value, { encoding: UTF8 })),
      encoding,
      readonly: false,
      locked: false,
      executable: false
    }, true, options);
    if (backup.meta?.orphaned) {
      this.setOrphaned(true);
    }
  }
  async resolveFromFile(options) {
    this.trace("resolveFromFile()");
    const forceReadFromFile = options?.forceReadFromFile;
    const allowBinary = this.isResolved() || options?.allowBinary;
    let etag;
    if (forceReadFromFile) {
      etag = ETAG_DISABLED;
    } else if (this.lastResolvedFileStat) {
      etag = this.lastResolvedFileStat.etag;
    }
    const currentVersionId = this.versionId;
    try {
      const content = await this.textFileService.readStream(this.resource, {
        acceptTextOnly: !allowBinary,
        etag,
        encoding: this.preferredEncoding,
        limits: options?.limits
      });
      this.setOrphaned(false);
      if (currentVersionId !== this.versionId) {
        this.trace("resolveFromFile() - exit - without resolving because model content changed");
        return;
      }
      return this.resolveFromContent(content, false, options);
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
  resolveFromContent(content, dirty, options) {
    this.trace("resolveFromContent() - enter");
    if (this.isDisposed()) {
      this.trace("resolveFromContent() - exit - because model is disposed");
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
    const oldEncoding = this.contentEncoding;
    this.contentEncoding = content.encoding;
    if (this.preferredEncoding) {
      this.updatePreferredEncoding(this.contentEncoding);
    } else if (oldEncoding !== this.contentEncoding) {
      this._onDidChangeEncoding.fire();
    }
    if (this.textEditorModel) {
      this.doUpdateTextModel(content.value, EditSources.reloadFromDisk());
    } else {
      this.doCreateTextModel(content.resource, content.value);
    }
    this.setDirty(!!dirty);
    this._onDidResolve.fire(options?.reason ?? TextFileResolveReason.OTHER);
  }
  doCreateTextModel(resource, value) {
    this.trace("doCreateTextModel()");
    const textModel = this.createTextEditorModel(value, resource, this.preferredLanguageId);
    this.installModelListeners(textModel);
    this.autoDetectLanguage();
  }
  doUpdateTextModel(value, reason) {
    this.trace("doUpdateTextModel()");
    this.ignoreDirtyOnModelContentChange = true;
    try {
      this.updateTextEditorModel(value, this.preferredLanguageId, reason);
    } finally {
      this.ignoreDirtyOnModelContentChange = false;
    }
  }
  installModelListeners(model) {
    this._register(model.onDidChangeContent((e) => this.onModelContentChanged(model, e.isUndoing || e.isRedoing)));
    this._register(model.onDidChangeLanguage(() => this.onMaybeShouldChangeEncoding()));
    super.installModelListeners(model);
  }
  onModelContentChanged(model, isUndoingOrRedoing) {
    this.trace(`onModelContentChanged() - enter`);
    this.versionId++;
    this.trace(`onModelContentChanged() - new versionId ${this.versionId}`);
    if (isUndoingOrRedoing) {
      this.lastModelContentChangeFromUndoRedo = Date.now();
    }
    if (!this.ignoreDirtyOnModelContentChange && !this.isReadonly()) {
      if (model.getAlternativeVersionId() === this.bufferSavedVersionId) {
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
    this.autoDetectLanguage();
  }
  async autoDetectLanguage() {
    await this.extensionService?.whenInstalledExtensionsRegistered();
    const languageId = this.getLanguageId();
    if (this.resource.scheme === this.pathService.defaultUriScheme && // make sure to not detect language for non-user visible documents
    (!languageId || languageId === PLAINTEXT_LANGUAGE_ID) && // only run on files with plaintext language set or no language set at all
    !this.resourceHasExtension) {
      return super.autoDetectLanguage();
    }
  }
  async forceResolveFromFile() {
    if (this.isDisposed()) {
      return;
    }
    await this.textFileService.files.resolve(this.resource, {
      reload: { async: false },
      forceReadFromFile: true
    });
  }
  //#endregion
  //#region Dirty
  isDirty() {
    return this.dirty;
  }
  isModified() {
    return this.isDirty();
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
    const oldBufferSavedVersionId = this.bufferSavedVersionId;
    if (!dirty) {
      this.dirty = false;
      this.inConflictMode = false;
      this.inErrorMode = false;
      this.updateSavedVersionId();
    } else {
      this.dirty = true;
    }
    return () => {
      this.dirty = wasDirty;
      this.inConflictMode = wasInConflictMode;
      this.inErrorMode = wasInErrorMode;
      this.bufferSavedVersionId = oldBufferSavedVersionId;
    };
  }
  //#endregion
  //#region Save
  async save(options = /* @__PURE__ */ Object.create(null)) {
    if (!this.isResolved()) {
      return false;
    }
    if (this.isReadonly()) {
      this.trace("save() - ignoring request for readonly resource");
      return false;
    }
    if ((this.hasState(TextFileEditorModelState.CONFLICT) || this.hasState(TextFileEditorModelState.ERROR)) && (options.reason === SaveReason.AUTO || options.reason === SaveReason.FOCUS_CHANGE || options.reason === SaveReason.WINDOW_CHANGE)) {
      this.trace("save() - ignoring auto save request for model that is in conflict or error");
      return false;
    }
    this.trace("save() - enter");
    await this.doSave(options);
    this.trace("save() - exit");
    return this.hasState(TextFileEditorModelState.SAVED);
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
      this.textEditorModel.pushStackElement();
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
      if (this.isResolved() && !options.skipSaveParticipants) {
        try {
          if (options.reason === SaveReason.AUTO && typeof this.lastModelContentChangeFromUndoRedo === "number") {
            const timeFromUndoRedoToSave = Date.now() - this.lastModelContentChangeFromUndoRedo;
            if (timeFromUndoRedoToSave < TextFileEditorModel.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD) {
              await timeout(TextFileEditorModel.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD - timeFromUndoRedoToSave);
            }
          }
          if (!saveCancellation.token.isCancellationRequested) {
            this.ignoreSaveFromSaveParticipants = true;
            try {
              await this.textFileService.files.runSaveParticipants(this, { reason: options.reason ?? SaveReason.EXPLICIT, savedFrom: options.from }, progress, saveCancellation.token);
            } catch (err) {
              if (isCancellationError(err) && !saveCancellation.token.isCancellationRequested) {
                saveCancellation.cancel();
              }
            } finally {
              this.ignoreSaveFromSaveParticipants = false;
            }
          }
        } catch (error) {
          this.logService.error(`[text file model] runSaveParticipants(${versionId}) - resulted in an error: ${error.toString()}`, this.resource.toString());
        }
      }
      if (saveCancellation.token.isCancellationRequested) {
        return;
      } else {
        saveCancellation.dispose();
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
      const resolvedTextFileEditorModel = this;
      return this.saveSequentializer.run(versionId, (async () => {
        try {
          const stat = await this.textFileService.write(lastResolvedFileStat.resource, resolvedTextFileEditorModel.createSnapshot(), {
            mtime: lastResolvedFileStat.mtime,
            encoding: this.getEncoding(),
            etag: options.ignoreModifiedSince || !this.filesConfigurationService.preventSaveConflicts(lastResolvedFileStat.resource, resolvedTextFileEditorModel.getLanguageId()) ? ETAG_DISABLED : lastResolvedFileStat.etag,
            unlock: options.writeUnlock,
            writeElevated: options.writeElevated
          });
          this.handleSaveSuccess(stat, versionId, options);
        } catch (error) {
          this.handleSaveError(error, versionId, options);
        }
      })());
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
    (options.ignoreErrorHandler ? this.logService.trace : this.logService.error).apply(this.logService, [`[text file model] handleSaveError(${versionId}) - exit - resulted in a save error: ${error.toString()}`, this.resource.toString()]);
    if (options.ignoreErrorHandler) {
      throw error;
    }
    this.setDirty(true);
    this.inErrorMode = true;
    if (error.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
      this.inConflictMode = true;
    }
    this.textFileService.files.saveErrorHandler.onSaveError(error, this, options);
    this._onDidSaveError.fire();
  }
  updateSavedVersionId() {
    if (this.isResolved()) {
      this.bufferSavedVersionId = this.textEditorModel.getAlternativeVersionId();
    }
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
  hasState(state) {
    switch (state) {
      case TextFileEditorModelState.CONFLICT:
        return this.inConflictMode;
      case TextFileEditorModelState.DIRTY:
        return this.dirty;
      case TextFileEditorModelState.ERROR:
        return this.inErrorMode;
      case TextFileEditorModelState.ORPHAN:
        return this.inOrphanMode;
      case TextFileEditorModelState.PENDING_SAVE:
        return this.saveSequentializer.isRunning();
      case TextFileEditorModelState.SAVED:
        return !this.dirty;
    }
  }
  async joinState(state) {
    return this.saveSequentializer.running;
  }
  getLanguageId() {
    if (this.textEditorModel) {
      return this.textEditorModel.getLanguageId();
    }
    return this.preferredLanguageId;
  }
  //#region Encoding
  async onMaybeShouldChangeEncoding() {
    if (this.hasEncodingSetExplicitly) {
      this.trace("onMaybeShouldChangeEncoding() - ignoring because encoding was set explicitly");
      return;
    }
    if (this.contentEncoding === UTF8_with_bom || this.contentEncoding === UTF16be || this.contentEncoding === UTF16le) {
      this.trace("onMaybeShouldChangeEncoding() - ignoring because content encoding has a BOM");
      return;
    }
    const { encoding } = await this.textFileService.encoding.getPreferredReadEncoding(this.resource);
    if (typeof encoding !== "string" || !this.isNewEncoding(encoding)) {
      this.trace(`onMaybeShouldChangeEncoding() - ignoring because preferred encoding ${encoding} is not new`);
      return;
    }
    if (this.isDirty()) {
      this.trace("onMaybeShouldChangeEncoding() - ignoring because model is dirty");
      return;
    }
    this.logService.info(`Adjusting encoding based on configured language override to '${encoding}' for ${this.resource.toString(true)}.`);
    return this.forceResolveFromFile();
  }
  setEncoding(encoding, mode) {
    this.hasEncodingSetExplicitly = true;
    return this.setEncodingInternal(encoding, mode);
  }
  async setEncodingInternal(encoding, mode) {
    if (mode === EncodingMode.Encode) {
      this.updatePreferredEncoding(encoding);
      if (!this.isDirty()) {
        this.versionId++;
        this.setDirty(true);
      }
      if (!this.inConflictMode) {
        await this.save({ source: TextFileEditorModel.TEXTFILE_SAVE_ENCODING_SOURCE });
      }
    } else {
      if (!this.isNewEncoding(encoding)) {
        return;
      }
      if (this.isDirty()) {
        throw new Error("Cannot re-open a dirty text document with different encoding. Save it first.");
      }
      this.updatePreferredEncoding(encoding);
      await this.forceResolveFromFile();
    }
  }
  updatePreferredEncoding(encoding) {
    if (!this.isNewEncoding(encoding)) {
      return;
    }
    this.preferredEncoding = encoding;
    this._onDidChangeEncoding.fire();
  }
  isNewEncoding(encoding) {
    if (this.preferredEncoding === encoding) {
      return false;
    }
    if (!this.preferredEncoding && this.contentEncoding === encoding) {
      return false;
    }
    return true;
  }
  getEncoding() {
    return this.preferredEncoding || this.contentEncoding;
  }
  //#endregion
  trace(msg) {
    this.logService.trace(`[text file model] ${msg}`, this.resource.toString());
  }
  isResolved() {
    return !!this.textEditorModel;
  }
  isReadonly() {
    return this.filesConfigurationService.isReadonly(this.resource, this.lastResolvedFileStat);
  }
  dispose() {
    this.trace("dispose()");
    this.inConflictMode = false;
    this.inOrphanMode = false;
    this.inErrorMode = false;
    super.dispose();
  }
};
TextFileEditorModel.TEXTFILE_SAVE_ENCODING_SOURCE = SaveSourceRegistry.registerSource("textFileEncoding.source", localize("textFileCreate.source", "File Encoding Changed"));
TextFileEditorModel.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD = 500;
TextFileEditorModel = __decorateClass([
  __decorateParam(3, ILanguageService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IFileService),
  __decorateParam(6, ITextFileService),
  __decorateParam(7, IWorkingCopyBackupService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IWorkingCopyService),
  __decorateParam(10, IFilesConfigurationService),
  __decorateParam(11, ILabelService),
  __decorateParam(12, ILanguageDetectionService),
  __decorateParam(13, IAccessibilityService),
  __decorateParam(14, IPathService),
  __decorateParam(15, IExtensionService),
  __decorateParam(16, IProgressService)
], TextFileEditorModel);
export {
  TextFileEditorModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dEZpbGVFZGl0b3JNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbWFyayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgRW5jb2RpbmdNb2RlLCBJVGV4dEZpbGVTZXJ2aWNlLCBUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUsIElUZXh0RmlsZUVkaXRvck1vZGVsLCBJVGV4dEZpbGVTdHJlYW1Db250ZW50LCBJVGV4dEZpbGVSZXNvbHZlT3B0aW9ucywgSVJlc29sdmVkVGV4dEZpbGVFZGl0b3JNb2RlbCwgVGV4dEZpbGVSZXNvbHZlUmVhc29uLCBJVGV4dEZpbGVFZGl0b3JNb2RlbFNhdmVFdmVudCwgSVRleHRGaWxlU2F2ZUFzT3B0aW9ucyB9IGZyb20gJy4vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElSZXZlcnRPcHRpb25zLCBTYXZlUmVhc29uLCBTYXZlU291cmNlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEJhc2VUZXh0RWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3RleHRFZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLCBJUmVzb2x2ZWRXb3JraW5nQ29weUJhY2t1cCB9IGZyb20gJy4uLy4uL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUJhY2t1cC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZUNoYW5nZXNFdmVudCwgRmlsZUNoYW5nZVR5cGUsIElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgRVRBR19ESVNBQkxFRCwgTm90TW9kaWZpZWRTaW5jZUZpbGVPcGVyYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgdGltZW91dCwgVGFza1NlcXVlbnRpYWxpemVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVRleHRCdWZmZXJGYWN0b3J5LCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlCYWNrdXAsIFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLCBOT19UWVBFX0lELCBJV29ya2luZ0NvcHlCYWNrdXBNZXRhIH0gZnJvbSAnLi4vLi4vd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFVURjE2YmUsIFVURjE2bGUsIFVURjgsIFVURjhfd2l0aF9ib20gfSBmcm9tICcuL2VuY29kaW5nLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZURldGVjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9sYW5ndWFnZURldGVjdGlvbi9jb21tb24vbGFuZ3VhZ2VEZXRlY3Rpb25Xb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGV4dFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElQcm9ncmVzcywgSVByb2dyZXNzU2VydmljZSwgSVByb2dyZXNzU3RlcCwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbEVkaXRTb3VyY2UsIEVkaXRTb3VyY2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcblxuaW50ZXJmYWNlIElCYWNrdXBNZXRhRGF0YSBleHRlbmRzIElXb3JraW5nQ29weUJhY2t1cE1ldGEge1xuXHRtdGltZTogbnVtYmVyO1xuXHRjdGltZTogbnVtYmVyO1xuXHRzaXplOiBudW1iZXI7XG5cdGV0YWc6IHN0cmluZztcblx0b3JwaGFuZWQ6IGJvb2xlYW47XG59XG5cbi8qKlxuICogVGhlIHRleHQgZmlsZSBlZGl0b3IgbW9kZWwgbGlzdGVucyB0byBjaGFuZ2VzIHRvIGl0cyB1bmRlcmx5aW5nIGNvZGUgZWRpdG9yIG1vZGVsIGFuZCBzYXZlcyB0aGVzZSBjaGFuZ2VzIHRocm91Z2ggdGhlIGZpbGUgc2VydmljZSBiYWNrIHRvIHRoZSBkaXNrLlxuICovXG5leHBvcnQgY2xhc3MgVGV4dEZpbGVFZGl0b3JNb2RlbCBleHRlbmRzIEJhc2VUZXh0RWRpdG9yTW9kZWwgaW1wbGVtZW50cyBJVGV4dEZpbGVFZGl0b3JNb2RlbCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVEVYVEZJTEVfU0FWRV9FTkNPRElOR19TT1VSQ0UgPSBTYXZlU291cmNlUmVnaXN0cnkucmVnaXN0ZXJTb3VyY2UoJ3RleHRGaWxlRW5jb2Rpbmcuc291cmNlJywgbG9jYWxpemUoJ3RleHRGaWxlQ3JlYXRlLnNvdXJjZScsIFwiRmlsZSBFbmNvZGluZyBDaGFuZ2VkXCIpKTtcblxuXHQvLyNyZWdpb24gRXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlc29sdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxUZXh0RmlsZVJlc29sdmVSZWFzb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlc29sdmUgPSB0aGlzLl9vbkRpZFJlc29sdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VEaXJ0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURpcnR5ID0gdGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNhdmVFcnJvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNhdmVFcnJvciA9IHRoaXMuX29uRGlkU2F2ZUVycm9yLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2F2ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXh0RmlsZUVkaXRvck1vZGVsU2F2ZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTYXZlID0gdGhpcy5fb25EaWRTYXZlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmV2ZXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmV2ZXJ0ID0gdGhpcy5fb25EaWRSZXZlcnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VFbmNvZGluZyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUVuY29kaW5nID0gdGhpcy5fb25EaWRDaGFuZ2VFbmNvZGluZy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU9ycGhhbmVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlT3JwaGFuZWQgPSB0aGlzLl9vbkRpZENoYW5nZU9ycGhhbmVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmVhZG9ubHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZWFkb25seSA9IHRoaXMuX29uRGlkQ2hhbmdlUmVhZG9ubHkuZXZlbnQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cmVhZG9ubHkgdHlwZUlkID0gTk9fVFlQRV9JRDsgLy8gSU1QT1JUQU5UOiBuZXZlciBjaGFuZ2UgdGhpcyB0byBub3QgYnJlYWsgZXhpc3RpbmcgYXNzdW1wdGlvbnMgKGUuZy4gYmFja3VwcylcblxuXHRyZWFkb25seSBjYXBhYmlsaXRpZXMgPSBXb3JraW5nQ29weUNhcGFiaWxpdGllcy5Ob25lO1xuXG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cHJpdmF0ZSByZXNvdXJjZUhhc0V4dGVuc2lvbjogYm9vbGVhbjtcblxuXHRwcml2YXRlIGNvbnRlbnRFbmNvZGluZzogc3RyaW5nIHwgdW5kZWZpbmVkOyAvLyBlbmNvZGluZyBhcyByZXBvcnRlZCBmcm9tIGRpc2tcblxuXHRwcml2YXRlIHZlcnNpb25JZCA9IDA7XG5cdHByaXZhdGUgYnVmZmVyU2F2ZWRWZXJzaW9uSWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGlnbm9yZURpcnR5T25Nb2RlbENvbnRlbnRDaGFuZ2UgPSBmYWxzZTtcblx0cHJpdmF0ZSBpZ25vcmVTYXZlRnJvbVNhdmVQYXJ0aWNpcGFudHMgPSBmYWxzZTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBVTkRPX1JFRE9fU0FWRV9QQVJUSUNJUEFOVFNfQVVUT19TQVZFX1RIUk9UVExFX1RIUkVTSE9MRCA9IDUwMDtcblx0cHJpdmF0ZSBsYXN0TW9kZWxDb250ZW50Q2hhbmdlRnJvbVVuZG9SZWRvOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0bGFzdFJlc29sdmVkRmlsZVN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSB8IHVuZGVmaW5lZDsgLy8gISEhIERPIE5PVCBNQVJLIFBSSVZBVEUhIFVTRUQgSU4gVEVTVFMgISEhXG5cblx0cHJpdmF0ZSByZWFkb25seSBzYXZlU2VxdWVudGlhbGl6ZXIgPSBuZXcgVGFza1NlcXVlbnRpYWxpemVyKCk7XG5cblx0cHJpdmF0ZSBkaXJ0eSA9IGZhbHNlO1xuXHRwcml2YXRlIGluQ29uZmxpY3RNb2RlID0gZmFsc2U7XG5cdHByaXZhdGUgaW5PcnBoYW5Nb2RlID0gZmFsc2U7XG5cdHByaXZhdGUgaW5FcnJvck1vZGUgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSByZXNvdXJjZTogVVJJLFxuXHRcdHByaXZhdGUgcHJlZmVycmVkRW5jb2Rpbmc6IHN0cmluZyB8IHVuZGVmaW5lZCxcdFx0Ly8gZW5jb2RpbmcgYXMgY2hvc2VuIGJ5IHRoZSB1c2VyXG5cdFx0cHJpdmF0ZSBwcmVmZXJyZWRMYW5ndWFnZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQsXHQvLyBsYW5ndWFnZSBpZCBhcyBjaG9zZW4gYnkgdGhlIHVzZXJcblx0XHRASUxhbmd1YWdlU2VydmljZSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlOiBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0NvcHlTZXJ2aWNlOiBJV29ya2luZ0NvcHlTZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlIGxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZTogSUxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIobW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSwgYWNjZXNzaWJpbGl0eVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5uYW1lID0gYmFzZW5hbWUodGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodGhpcy5yZXNvdXJjZSkpO1xuXHRcdHRoaXMucmVzb3VyY2VIYXNFeHRlbnNpb24gPSAhIWV4dFVyaS5leHRuYW1lKHRoaXMucmVzb3VyY2UpO1xuXG5cdFx0Ly8gTWFrZSBrbm93biB0byB3b3JraW5nIGNvcHkgc2VydmljZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2luZ0NvcHlTZXJ2aWNlLnJlZ2lzdGVyV29ya2luZ0NvcHkodGhpcykpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB0aGlzLm9uRGlkRmlsZXNDaGFuZ2UoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VGaWxlc0Fzc29jaWF0aW9uKCgpID0+IHRoaXMub25EaWRDaGFuZ2VGaWxlc0Fzc29jaWF0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VSZWFkb25seSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVJlYWRvbmx5LmZpcmUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZEZpbGVzQ2hhbmdlKGU6IEZpbGVDaGFuZ2VzRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZmlsZUV2ZW50SW1wYWN0c01vZGVsID0gZmFsc2U7XG5cdFx0bGV0IG5ld0luT3JwaGFuTW9kZUd1ZXNzOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdFx0Ly8gSWYgd2UgYXJlIGN1cnJlbnRseSBvcnBoYW5lZCwgd2UgY2hlY2sgaWYgdGhlIG1vZGVsIGZpbGUgd2FzIGFkZGVkIGJhY2tcblx0XHRpZiAodGhpcy5pbk9ycGhhbk1vZGUpIHtcblx0XHRcdGNvbnN0IG1vZGVsRmlsZUFkZGVkID0gZS5jb250YWlucyh0aGlzLnJlc291cmNlLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0XHRpZiAobW9kZWxGaWxlQWRkZWQpIHtcblx0XHRcdFx0bmV3SW5PcnBoYW5Nb2RlR3Vlc3MgPSBmYWxzZTtcblx0XHRcdFx0ZmlsZUV2ZW50SW1wYWN0c01vZGVsID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2Ugd2UgY2hlY2sgaWYgdGhlIG1vZGVsIGZpbGUgd2FzIGRlbGV0ZWRcblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IG1vZGVsRmlsZURlbGV0ZWQgPSBlLmNvbnRhaW5zKHRoaXMucmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdFx0aWYgKG1vZGVsRmlsZURlbGV0ZWQpIHtcblx0XHRcdFx0bmV3SW5PcnBoYW5Nb2RlR3Vlc3MgPSB0cnVlO1xuXHRcdFx0XHRmaWxlRXZlbnRJbXBhY3RzTW9kZWwgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChmaWxlRXZlbnRJbXBhY3RzTW9kZWwgJiYgdGhpcy5pbk9ycGhhbk1vZGUgIT09IG5ld0luT3JwaGFuTW9kZUd1ZXNzKSB7XG5cdFx0XHRsZXQgbmV3SW5PcnBoYW5Nb2RlVmFsaWRhdGVkID0gZmFsc2U7XG5cdFx0XHRpZiAobmV3SW5PcnBoYW5Nb2RlR3Vlc3MpIHtcblx0XHRcdFx0Ly8gV2UgaGF2ZSByZWNlaXZlZCByZXBvcnRzIG9mIHVzZXJzIHNlZWluZyBkZWxldGUgZXZlbnRzIGV2ZW4gdGhvdWdoIHRoZSBmaWxlIHN0aWxsXG5cdFx0XHRcdC8vIGV4aXN0cyAobmV0d29yayBzaGFyZXMgaXNzdWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzY2NSkuXG5cdFx0XHRcdC8vIFNpbmNlIHdlIGRvIG5vdCB3YW50IHRvIG1hcmsgdGhlIG1vZGVsIGFzIG9ycGhhbmVkLCB3ZSBoYXZlIHRvIGNoZWNrIGlmIHRoZVxuXHRcdFx0XHQvLyBmaWxlIGlzIHJlYWxseSBnb25lIGFuZCBub3QganVzdCBhIGZhdWx0eSBmaWxlIGV2ZW50LlxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdFx0bmV3SW5PcnBoYW5Nb2RlVmFsaWRhdGVkID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh0aGlzLnJlc291cmNlKTtcblx0XHRcdFx0XHRuZXdJbk9ycGhhbk1vZGVWYWxpZGF0ZWQgPSAhZXhpc3RzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmluT3JwaGFuTW9kZSAhPT0gbmV3SW5PcnBoYW5Nb2RlVmFsaWRhdGVkICYmICF0aGlzLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHR0aGlzLnNldE9ycGhhbmVkKG5ld0luT3JwaGFuTW9kZVZhbGlkYXRlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRPcnBoYW5lZChvcnBoYW5lZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmluT3JwaGFuTW9kZSAhPT0gb3JwaGFuZWQpIHtcblx0XHRcdHRoaXMuaW5PcnBoYW5Nb2RlID0gb3JwaGFuZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU9ycGhhbmVkLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlRmlsZXNBc3NvY2lhdGlvbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlyc3RMaW5lVGV4dCA9IHRoaXMuZ2V0Rmlyc3RMaW5lVGV4dCh0aGlzLnRleHRFZGl0b3JNb2RlbCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZWxlY3Rpb24gPSB0aGlzLmdldE9yQ3JlYXRlTGFuZ3VhZ2UodGhpcy5yZXNvdXJjZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHRoaXMucHJlZmVycmVkTGFuZ3VhZ2VJZCwgZmlyc3RMaW5lVGV4dCk7XG5cblx0XHR0aGlzLnRleHRFZGl0b3JNb2RlbC5zZXRMYW5ndWFnZShsYW5ndWFnZVNlbGVjdGlvbik7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRMYW5ndWFnZUlkKGxhbmd1YWdlSWQ6IHN0cmluZywgc291cmNlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0TGFuZ3VhZ2VJZChsYW5ndWFnZUlkLCBzb3VyY2UpO1xuXG5cdFx0dGhpcy5wcmVmZXJyZWRMYW5ndWFnZUlkID0gbGFuZ3VhZ2VJZDtcblx0fVxuXG5cdC8vI3JlZ2lvbiBCYWNrdXBcblxuXHRhc3luYyBiYWNrdXAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJV29ya2luZ0NvcHlCYWNrdXA+IHtcblxuXHRcdC8vIEZpbGwgaW4gbWV0YWRhdGEgaWYgd2UgYXJlIHJlc29sdmVkXG5cdFx0bGV0IG1ldGE6IElCYWNrdXBNZXRhRGF0YSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCkge1xuXHRcdFx0bWV0YSA9IHtcblx0XHRcdFx0bXRpbWU6IHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQubXRpbWUsXG5cdFx0XHRcdGN0aW1lOiB0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0LmN0aW1lLFxuXHRcdFx0XHRzaXplOiB0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0LnNpemUsXG5cdFx0XHRcdGV0YWc6IHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQuZXRhZyxcblx0XHRcdFx0b3JwaGFuZWQ6IHRoaXMuaW5PcnBoYW5Nb2RlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEZpbGwgaW4gY29udGVudCB0aGUgc2FtZSB3YXkgd2Ugd291bGQgZG8gd2hlblxuXHRcdC8vIHNhdmluZyB0aGUgZmlsZSB2aWEgdGhlIHRleHQgZmlsZSBzZXJ2aWNlXG5cdFx0Ly8gZW5jb2Rpbmcgc3VwcG9ydCAoaGFyZGNvZGUgVVRGLTgpXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLmdldEVuY29kZWRSZWFkYWJsZSh0aGlzLnJlc291cmNlLCB0aGlzLmNyZWF0ZVNuYXBzaG90KCkgPz8gdW5kZWZpbmVkLCB7IGVuY29kaW5nOiBVVEY4IH0pO1xuXG5cdFx0cmV0dXJuIHsgbWV0YSwgY29udGVudCB9O1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFJldmVydFxuXG5cdGFzeW5jIHJldmVydChvcHRpb25zPzogSVJldmVydE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVW5zZXQgZmxhZ3Ncblx0XHRjb25zdCB3YXNEaXJ0eSA9IHRoaXMuZGlydHk7XG5cdFx0Y29uc3QgdW5kbyA9IHRoaXMuZG9TZXREaXJ0eShmYWxzZSk7XG5cblx0XHQvLyBGb3JjZSByZWFkIGZyb20gZGlzayB1bmxlc3MgcmV2ZXJ0aW5nIHNvZnRcblx0XHRjb25zdCBzb2Z0VW5kbyA9IG9wdGlvbnM/LnNvZnQ7XG5cdFx0aWYgKCFzb2Z0VW5kbykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5mb3JjZVJlc29sdmVGcm9tRmlsZSgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0XHQvLyBGaWxlTm90Rm91bmQgbWVhbnMgdGhlIGZpbGUgZ290IGRlbGV0ZWQgbWVhbndoaWxlLCBzbyBpZ25vcmUgaXRcblx0XHRcdFx0aWYgKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cblx0XHRcdFx0XHQvLyBTZXQgZmxhZ3MgYmFjayB0byBwcmV2aW91cyB2YWx1ZXMsIHdlIGFyZSBzdGlsbCBkaXJ0eSBpZiByZXZlcnQgZmFpbGVkXG5cdFx0XHRcdFx0dW5kbygpO1xuXG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFbWl0IGZpbGUgY2hhbmdlIGV2ZW50XG5cdFx0dGhpcy5fb25EaWRSZXZlcnQuZmlyZSgpO1xuXG5cdFx0Ly8gRW1pdCBkaXJ0eSBjaGFuZ2UgZXZlbnRcblx0XHRpZiAod2FzRGlydHkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBSZXNvbHZlXG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZShvcHRpb25zPzogSVRleHRGaWxlUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlKCkgLSBlbnRlcicpO1xuXHRcdG1hcmsoJ2NvZGUvd2lsbFJlc29sdmVUZXh0RmlsZUVkaXRvck1vZGVsJyk7XG5cblx0XHQvLyBSZXR1cm4gZWFybHkgaWYgd2UgYXJlIGRpc3Bvc2VkXG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlKCkgLSBleGl0IC0gd2l0aG91dCByZXNvbHZpbmcgYmVjYXVzZSBtb2RlbCBpcyBkaXNwb3NlZCcpO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVW5sZXNzIHRoZXJlIGFyZSBleHBsaWNpdCBjb250ZW50cyBwcm92aWRlZCwgaXQgaXMgaW1wb3J0YW50IHRoYXQgd2UgZG8gbm90XG5cdFx0Ly8gcmVzb2x2ZSBhIG1vZGVsIHRoYXQgaXMgZGlydHkgb3IgaXMgaW4gdGhlIHByb2Nlc3Mgb2Ygc2F2aW5nIHRvIHByZXZlbnQgZGF0YVxuXHRcdC8vIGxvc3MuXG5cdFx0aWYgKCFvcHRpb25zPy5jb250ZW50cyAmJiAodGhpcy5kaXJ0eSB8fCB0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5pc1J1bm5pbmcoKSkpIHtcblx0XHRcdHRoaXMudHJhY2UoJ3Jlc29sdmUoKSAtIGV4aXQgLSB3aXRob3V0IHJlc29sdmluZyBiZWNhdXNlIG1vZGVsIGlzIGRpcnR5IG9yIGJlaW5nIHNhdmVkJyk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlIGVpdGhlciBmcm9tIGJhY2t1cCBvciBmcm9tIGZpbGVcblx0XHRhd2FpdCB0aGlzLmRvUmVzb2x2ZShvcHRpb25zKTtcblxuXHRcdG1hcmsoJ2NvZGUvZGlkUmVzb2x2ZVRleHRGaWxlRWRpdG9yTW9kZWwnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlKG9wdGlvbnM/OiBJVGV4dEZpbGVSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gRmlyc3QgY2hlY2sgaWYgd2UgaGF2ZSBjb250ZW50cyB0byB1c2UgZm9yIHRoZSBtb2RlbFxuXHRcdGlmIChvcHRpb25zPy5jb250ZW50cykge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZUZyb21CdWZmZXIob3B0aW9ucy5jb250ZW50cywgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gU2Vjb25kLCBjaGVjayBpZiB3ZSBoYXZlIGEgYmFja3VwIHRvIHJlc29sdmUgZnJvbSAob25seSBmb3IgbmV3IG1vZGVscylcblx0XHRjb25zdCBpc05ld01vZGVsID0gIXRoaXMuaXNSZXNvbHZlZCgpO1xuXHRcdGlmIChpc05ld01vZGVsKSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZEZyb21CYWNrdXAgPSBhd2FpdCB0aGlzLnJlc29sdmVGcm9tQmFja3VwKG9wdGlvbnMpO1xuXHRcdFx0aWYgKHJlc29sdmVkRnJvbUJhY2t1cCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmluYWxseSwgcmVzb2x2ZSBmcm9tIGZpbGUgcmVzb3VyY2Vcblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlRnJvbUZpbGUob3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVGcm9tQnVmZmVyKGJ1ZmZlcjogSVRleHRCdWZmZXJGYWN0b3J5LCBvcHRpb25zPzogSVRleHRGaWxlUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlRnJvbUJ1ZmZlcigpJyk7XG5cblx0XHQvLyBUcnkgdG8gcmVzb2x2ZSBtZXRkYXRhIGZyb20gZGlza1xuXHRcdGxldCBtdGltZTogbnVtYmVyO1xuXHRcdGxldCBjdGltZTogbnVtYmVyO1xuXHRcdGxldCBzaXplOiBudW1iZXI7XG5cdFx0bGV0IGV0YWc6IHN0cmluZztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQodGhpcy5yZXNvdXJjZSk7XG5cdFx0XHRtdGltZSA9IG1ldGFkYXRhLm10aW1lO1xuXHRcdFx0Y3RpbWUgPSBtZXRhZGF0YS5jdGltZTtcblx0XHRcdHNpemUgPSBtZXRhZGF0YS5zaXplO1xuXHRcdFx0ZXRhZyA9IG1ldGFkYXRhLmV0YWc7XG5cblx0XHRcdC8vIENsZWFyIG9ycGhhbmVkIHN0YXRlIHdoZW4gcmVzb2x2aW5nIHdhcyBzdWNjZXNzZnVsXG5cdFx0XHR0aGlzLnNldE9ycGhhbmVkKGZhbHNlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHQvLyBQdXQgc29tZSBmYWxsYmFjayB2YWx1ZXMgaW4gZXJyb3IgY2FzZVxuXHRcdFx0bXRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y3RpbWUgPSBEYXRlLm5vdygpO1xuXHRcdFx0c2l6ZSA9IDA7XG5cdFx0XHRldGFnID0gRVRBR19ESVNBQkxFRDtcblxuXHRcdFx0Ly8gQXBwbHkgb3JwaGFuZWQgc3RhdGUgYmFzZWQgb24gZXJyb3IgY29kZVxuXHRcdFx0dGhpcy5zZXRPcnBoYW5lZChlcnJvci5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmVmZXJyZWRFbmNvZGluZyA9IGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLmVuY29kaW5nLmdldFByZWZlcnJlZFdyaXRlRW5jb2RpbmcodGhpcy5yZXNvdXJjZSwgdGhpcy5wcmVmZXJyZWRFbmNvZGluZyk7XG5cblx0XHQvLyBSZXNvbHZlIHdpdGggYnVmZmVyXG5cdFx0dGhpcy5yZXNvbHZlRnJvbUNvbnRlbnQoe1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMucmVzb3VyY2UsXG5cdFx0XHRuYW1lOiB0aGlzLm5hbWUsXG5cdFx0XHRtdGltZSxcblx0XHRcdGN0aW1lLFxuXHRcdFx0c2l6ZSxcblx0XHRcdGV0YWcsXG5cdFx0XHR2YWx1ZTogYnVmZmVyLFxuXHRcdFx0ZW5jb2Rpbmc6IHByZWZlcnJlZEVuY29kaW5nLmVuY29kaW5nLFxuXHRcdFx0cmVhZG9ubHk6IGZhbHNlLFxuXHRcdFx0bG9ja2VkOiBmYWxzZSxcblx0XHRcdGV4ZWN1dGFibGU6IGZhbHNlXG5cdFx0fSwgdHJ1ZSAvKiBkaXJ0eSAocmVzb2x2ZWQgZnJvbSBidWZmZXIpICovLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUZyb21CYWNrdXAob3B0aW9ucz86IElUZXh0RmlsZVJlc29sdmVPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHQvLyBSZXNvbHZlIGJhY2t1cCBpZiBhbnlcblx0XHRjb25zdCBiYWNrdXAgPSBhd2FpdCB0aGlzLndvcmtpbmdDb3B5QmFja3VwU2VydmljZS5yZXNvbHZlPElCYWNrdXBNZXRhRGF0YT4odGhpcyk7XG5cblx0XHQvLyBSZXNvbHZlIHByZWZlcnJlZCBlbmNvZGluZyBpZiB3ZSBuZWVkIGl0XG5cdFx0bGV0IGVuY29kaW5nID0gVVRGODtcblx0XHRpZiAoYmFja3VwKSB7XG5cdFx0XHRlbmNvZGluZyA9IChhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS5lbmNvZGluZy5nZXRQcmVmZXJyZWRXcml0ZUVuY29kaW5nKHRoaXMucmVzb3VyY2UsIHRoaXMucHJlZmVycmVkRW5jb2RpbmcpKS5lbmNvZGluZztcblx0XHR9XG5cblx0XHQvLyBBYm9ydCBpZiBzb21lb25lIGVsc2UgbWFuYWdlZCB0byByZXNvbHZlIHRoZSBtb2RlbCBieSBub3dcblx0XHRjb25zdCBpc05ld01vZGVsID0gIXRoaXMuaXNSZXNvbHZlZCgpO1xuXHRcdGlmICghaXNOZXdNb2RlbCkge1xuXHRcdFx0dGhpcy50cmFjZSgncmVzb2x2ZUZyb21CYWNrdXAoKSAtIGV4aXQgLSB3aXRob3V0IHJlc29sdmluZyBiZWNhdXNlIHByZXZpb3VzbHkgbmV3IG1vZGVsIGdvdCBjcmVhdGVkIG1lYW53aGlsZScpO1xuXG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gaW1wbHkgdGhhdCByZXNvbHZpbmcgaGFzIGhhcHBlbmVkIGluIGFub3RoZXIgb3BlcmF0aW9uXG5cdFx0fVxuXG5cdFx0Ly8gVHJ5IHRvIHJlc29sdmUgZnJvbSBiYWNrdXAgaWYgd2UgaGF2ZSBhbnlcblx0XHRpZiAoYmFja3VwKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvUmVzb2x2ZUZyb21CYWNrdXAoYmFja3VwLCBlbmNvZGluZywgb3B0aW9ucyk7XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBzaWduYWwgYmFjayB0aGF0IHJlc29sdmluZyBkaWQgbm90IGhhcHBlblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlRnJvbUJhY2t1cChiYWNrdXA6IElSZXNvbHZlZFdvcmtpbmdDb3B5QmFja3VwPElCYWNrdXBNZXRhRGF0YT4sIGVuY29kaW5nOiBzdHJpbmcsIG9wdGlvbnM/OiBJVGV4dEZpbGVSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhY2UoJ2RvUmVzb2x2ZUZyb21CYWNrdXAoKScpO1xuXG5cdFx0Ly8gUmVzb2x2ZSB3aXRoIGJhY2t1cFxuXHRcdHRoaXMucmVzb2x2ZUZyb21Db250ZW50KHtcblx0XHRcdHJlc291cmNlOiB0aGlzLnJlc291cmNlLFxuXHRcdFx0bmFtZTogdGhpcy5uYW1lLFxuXHRcdFx0bXRpbWU6IGJhY2t1cC5tZXRhID8gYmFja3VwLm1ldGEubXRpbWUgOiBEYXRlLm5vdygpLFxuXHRcdFx0Y3RpbWU6IGJhY2t1cC5tZXRhID8gYmFja3VwLm1ldGEuY3RpbWUgOiBEYXRlLm5vdygpLFxuXHRcdFx0c2l6ZTogYmFja3VwLm1ldGEgPyBiYWNrdXAubWV0YS5zaXplIDogMCxcblx0XHRcdGV0YWc6IGJhY2t1cC5tZXRhID8gYmFja3VwLm1ldGEuZXRhZyA6IEVUQUdfRElTQUJMRUQsIC8vIGV0YWcgZGlzYWJsZWQgaWYgdW5rbm93biFcblx0XHRcdHZhbHVlOiBhd2FpdCBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeUZyb21TdHJlYW0oYXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2UuZ2V0RGVjb2RlZFN0cmVhbSh0aGlzLnJlc291cmNlLCBiYWNrdXAudmFsdWUsIHsgZW5jb2Rpbmc6IFVURjggfSkpLFxuXHRcdFx0ZW5jb2RpbmcsXG5cdFx0XHRyZWFkb25seTogZmFsc2UsXG5cdFx0XHRsb2NrZWQ6IGZhbHNlLFxuXHRcdFx0ZXhlY3V0YWJsZTogZmFsc2Vcblx0XHR9LCB0cnVlIC8qIGRpcnR5IChyZXNvbHZlZCBmcm9tIGJhY2t1cCkgKi8sIG9wdGlvbnMpO1xuXG5cdFx0Ly8gUmVzdG9yZSBvcnBoYW5lZCBmbGFnIGJhc2VkIG9uIHN0YXRlXG5cdFx0aWYgKGJhY2t1cC5tZXRhPy5vcnBoYW5lZCkge1xuXHRcdFx0dGhpcy5zZXRPcnBoYW5lZCh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVGcm9tRmlsZShvcHRpb25zPzogSVRleHRGaWxlUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlRnJvbUZpbGUoKScpO1xuXG5cdFx0Y29uc3QgZm9yY2VSZWFkRnJvbUZpbGUgPSBvcHRpb25zPy5mb3JjZVJlYWRGcm9tRmlsZTtcblx0XHRjb25zdCBhbGxvd0JpbmFyeSA9IHRoaXMuaXNSZXNvbHZlZCgpIC8qIGFsd2F5cyBhbGxvdyBpZiB3ZSByZXNvbHZlZCBwcmV2aW91c2x5ICovIHx8IG9wdGlvbnM/LmFsbG93QmluYXJ5O1xuXG5cdFx0Ly8gRGVjaWRlIG9uIGV0YWdcblx0XHRsZXQgZXRhZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChmb3JjZVJlYWRGcm9tRmlsZSkge1xuXHRcdFx0ZXRhZyA9IEVUQUdfRElTQUJMRUQ7IC8vIGRpc2FibGUgRVRhZyBpZiB3ZSBlbmZvcmNlIHRvIHJlYWQgZnJvbSBkaXNrXG5cdFx0fSBlbHNlIGlmICh0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0KSB7XG5cdFx0XHRldGFnID0gdGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdC5ldGFnOyAvLyBvdGhlcndpc2UgcmVzcGVjdCBldGFnIHRvIHN1cHBvcnQgY2FjaGluZ1xuXHRcdH1cblxuXHRcdC8vIFJlbWVtYmVyIGN1cnJlbnQgdmVyc2lvbiBiZWZvcmUgZG9pbmcgYW55IGxvbmcgcnVubmluZyBvcGVyYXRpb25cblx0XHQvLyB0byBlbnN1cmUgd2UgYXJlIG5vdCBjaGFuZ2luZyBhIG1vZGVsIHRoYXQgd2FzIGNoYW5nZWQgbWVhbndoaWxlXG5cdFx0Y29uc3QgY3VycmVudFZlcnNpb25JZCA9IHRoaXMudmVyc2lvbklkO1xuXG5cdFx0Ly8gUmVzb2x2ZSBDb250ZW50XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS5yZWFkU3RyZWFtKHRoaXMucmVzb3VyY2UsIHtcblx0XHRcdFx0YWNjZXB0VGV4dE9ubHk6ICFhbGxvd0JpbmFyeSxcblx0XHRcdFx0ZXRhZyxcblx0XHRcdFx0ZW5jb2Rpbmc6IHRoaXMucHJlZmVycmVkRW5jb2RpbmcsXG5cdFx0XHRcdGxpbWl0czogb3B0aW9ucz8ubGltaXRzXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQ2xlYXIgb3JwaGFuZWQgc3RhdGUgd2hlbiByZXNvbHZpbmcgd2FzIHN1Y2Nlc3NmdWxcblx0XHRcdHRoaXMuc2V0T3JwaGFuZWQoZmFsc2UpO1xuXG5cdFx0XHQvLyBSZXR1cm4gZWFybHkgaWYgdGhlIG1vZGVsIGNvbnRlbnQgaGFzIGNoYW5nZWRcblx0XHRcdC8vIG1lYW53aGlsZSB0byBwcmV2ZW50IGxvb3NpbmcgYW55IGNoYW5nZXNcblx0XHRcdGlmIChjdXJyZW50VmVyc2lvbklkICE9PSB0aGlzLnZlcnNpb25JZCkge1xuXHRcdFx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlRnJvbUZpbGUoKSAtIGV4aXQgLSB3aXRob3V0IHJlc29sdmluZyBiZWNhdXNlIG1vZGVsIGNvbnRlbnQgY2hhbmdlZCcpO1xuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZUZyb21Db250ZW50KGNvbnRlbnQsIGZhbHNlIC8qIG5vdCBkaXJ0eSAocmVzb2x2ZWQgZnJvbSBmaWxlKSAqLywgb3B0aW9ucyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQ7XG5cblx0XHRcdC8vIEFwcGx5IG9ycGhhbmVkIHN0YXRlIGJhc2VkIG9uIGVycm9yIGNvZGVcblx0XHRcdHRoaXMuc2V0T3JwaGFuZWQocmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKTtcblxuXHRcdFx0Ly8gTm90TW9kaWZpZWQgc3RhdHVzIGlzIGV4cGVjdGVkIGFuZCBjYW4gYmUgaGFuZGxlZCBncmFjZWZ1bGx5XG5cdFx0XHQvLyBpZiB3ZSBhcmUgcmVzb2x2ZWQuIFdlIHN0aWxsIHdhbnQgdG8gdXBkYXRlIG91ciBsYXN0IHJlc29sdmVkXG5cdFx0XHQvLyBzdGF0IHRvIGUuZy4gZGV0ZWN0IGNoYW5nZXMgdG8gdGhlIGZpbGUncyByZWFkb25seSBzdGF0ZVxuXHRcdFx0aWYgKHRoaXMuaXNSZXNvbHZlZCgpICYmIHJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9NT0RJRklFRF9TSU5DRSkge1xuXHRcdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBOb3RNb2RpZmllZFNpbmNlRmlsZU9wZXJhdGlvbkVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVMYXN0UmVzb2x2ZWRGaWxlU3RhdChlcnJvci5zdGF0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVW5sZXNzIHdlIGFyZSBmb3JjZWQgdG8gcmVhZCBmcm9tIHRoZSBmaWxlLCBJZ25vcmUgd2hlbiBhIG1vZGVsIGhhcyBiZWVuIHJlc29sdmVkIG9uY2Vcblx0XHRcdC8vIGFuZCB0aGUgZmlsZSB3YXMgZGVsZXRlZCBtZWFud2hpbGUuIFNpbmNlIHdlIGFscmVhZHkgaGF2ZSB0aGUgbW9kZWwgcmVzb2x2ZWQsIHdlIGNhbiByZXR1cm5cblx0XHRcdC8vIHRvIHRoaXMgc3RhdGUgYW5kIHVwZGF0ZSB0aGUgb3JwaGFuZWQgZmxhZyB0byBpbmRpY2F0ZSB0aGF0IHRoaXMgbW9kZWwgaGFzIG5vIHZlcnNpb24gb25cblx0XHRcdC8vIGRpc2sgYW55bW9yZS5cblx0XHRcdGlmICh0aGlzLmlzUmVzb2x2ZWQoKSAmJiByZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQgJiYgIWZvcmNlUmVhZEZyb21GaWxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlIGJ1YmJsZSB1cCB0aGUgZXJyb3Jcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZUZyb21Db250ZW50KGNvbnRlbnQ6IElUZXh0RmlsZVN0cmVhbUNvbnRlbnQsIGRpcnR5OiBib29sZWFuLCBvcHRpb25zPzogSVRleHRGaWxlUmVzb2x2ZU9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlRnJvbUNvbnRlbnQoKSAtIGVudGVyJyk7XG5cblx0XHQvLyBSZXR1cm4gZWFybHkgaWYgd2UgYXJlIGRpc3Bvc2VkXG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlRnJvbUNvbnRlbnQoKSAtIGV4aXQgLSBiZWNhdXNlIG1vZGVsIGlzIGRpc3Bvc2VkJyk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgb3VyIHJlc29sdmVkIGRpc2sgc3RhdCBtb2RlbFxuXHRcdHRoaXMudXBkYXRlTGFzdFJlc29sdmVkRmlsZVN0YXQoe1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMucmVzb3VyY2UsXG5cdFx0XHRuYW1lOiBjb250ZW50Lm5hbWUsXG5cdFx0XHRtdGltZTogY29udGVudC5tdGltZSxcblx0XHRcdGN0aW1lOiBjb250ZW50LmN0aW1lLFxuXHRcdFx0c2l6ZTogY29udGVudC5zaXplLFxuXHRcdFx0ZXRhZzogY29udGVudC5ldGFnLFxuXHRcdFx0cmVhZG9ubHk6IGNvbnRlbnQucmVhZG9ubHksXG5cdFx0XHRsb2NrZWQ6IGNvbnRlbnQubG9ja2VkLFxuXHRcdFx0ZXhlY3V0YWJsZTogZmFsc2UsXG5cdFx0XHRpc0ZpbGU6IHRydWUsXG5cdFx0XHRpc0RpcmVjdG9yeTogZmFsc2UsXG5cdFx0XHRpc1N5bWJvbGljTGluazogZmFsc2UsXG5cdFx0XHRjaGlsZHJlbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cblx0XHQvLyBLZWVwIHRoZSBvcmlnaW5hbCBlbmNvZGluZyB0byBub3QgbG9vc2UgaXQgd2hlbiBzYXZpbmdcblx0XHRjb25zdCBvbGRFbmNvZGluZyA9IHRoaXMuY29udGVudEVuY29kaW5nO1xuXHRcdHRoaXMuY29udGVudEVuY29kaW5nID0gY29udGVudC5lbmNvZGluZztcblxuXHRcdC8vIEhhbmRsZSBldmVudHMgaWYgZW5jb2RpbmcgY2hhbmdlZFxuXHRcdGlmICh0aGlzLnByZWZlcnJlZEVuY29kaW5nKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVByZWZlcnJlZEVuY29kaW5nKHRoaXMuY29udGVudEVuY29kaW5nKTsgLy8gbWFrZSBzdXJlIHRvIHJlZmxlY3QgdGhlIHJlYWwgZW5jb2Rpbmcgb2YgdGhlIGZpbGUgKG5ldmVyIG91dCBvZiBzeW5jKVxuXHRcdH0gZWxzZSBpZiAob2xkRW5jb2RpbmcgIT09IHRoaXMuY29udGVudEVuY29kaW5nKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUVuY29kaW5nLmZpcmUoKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgRXhpc3RpbmcgTW9kZWxcblx0XHRpZiAodGhpcy50ZXh0RWRpdG9yTW9kZWwpIHtcblx0XHRcdHRoaXMuZG9VcGRhdGVUZXh0TW9kZWwoY29udGVudC52YWx1ZSwgRWRpdFNvdXJjZXMucmVsb2FkRnJvbURpc2soKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIE5ldyBNb2RlbFxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5kb0NyZWF0ZVRleHRNb2RlbChjb250ZW50LnJlc291cmNlLCBjb250ZW50LnZhbHVlKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgbW9kZWwgZGlydHkgZmxhZy4gVGhpcyBpcyB2ZXJ5IGltcG9ydGFudCB0byBjYWxsXG5cdFx0Ly8gaW4gYm90aCBjYXNlcyBvZiBkaXJ0eSBvciBub3QgYmVjYXVzZSBpdCBjb25kaXRpb25hbGx5XG5cdFx0Ly8gdXBkYXRlcyB0aGUgYGJ1ZmZlclNhdmVkVmVyc2lvbklkYCB0byBkZXRlcm1pbmUgdGhlXG5cdFx0Ly8gdmVyc2lvbiB3aGVuIHRvIGNvbnNpZGVyIHRoZSBtb2RlbCBhcyBzYXZlZCBhZ2FpbiAoZS5nLlxuXHRcdC8vIHdoZW4gdW5kb2luZyBiYWNrIHRvIHRoZSBzYXZlZCBzdGF0ZSlcblx0XHR0aGlzLnNldERpcnR5KCEhZGlydHkpO1xuXG5cdFx0Ly8gRW1pdCBhcyBldmVudFxuXHRcdHRoaXMuX29uRGlkUmVzb2x2ZS5maXJlKG9wdGlvbnM/LnJlYXNvbiA/PyBUZXh0RmlsZVJlc29sdmVSZWFzb24uT1RIRVIpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0NyZWF0ZVRleHRNb2RlbChyZXNvdXJjZTogVVJJLCB2YWx1ZTogSVRleHRCdWZmZXJGYWN0b3J5KTogdm9pZCB7XG5cdFx0dGhpcy50cmFjZSgnZG9DcmVhdGVUZXh0TW9kZWwoKScpO1xuXG5cdFx0Ly8gQ3JlYXRlIG1vZGVsXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5jcmVhdGVUZXh0RWRpdG9yTW9kZWwodmFsdWUsIHJlc291cmNlLCB0aGlzLnByZWZlcnJlZExhbmd1YWdlSWQpO1xuXG5cdFx0Ly8gTW9kZWwgTGlzdGVuZXJzXG5cdFx0dGhpcy5pbnN0YWxsTW9kZWxMaXN0ZW5lcnModGV4dE1vZGVsKTtcblxuXHRcdC8vIERldGVjdCBsYW5ndWFnZSBmcm9tIGNvbnRlbnRcblx0XHR0aGlzLmF1dG9EZXRlY3RMYW5ndWFnZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1VwZGF0ZVRleHRNb2RlbCh2YWx1ZTogSVRleHRCdWZmZXJGYWN0b3J5LCByZWFzb246IFRleHRNb2RlbEVkaXRTb3VyY2UpOiB2b2lkIHtcblx0XHR0aGlzLnRyYWNlKCdkb1VwZGF0ZVRleHRNb2RlbCgpJyk7XG5cblx0XHQvLyBVcGRhdGUgbW9kZWwgdmFsdWUgaW4gYSBibG9jayB0aGF0IGlnbm9yZXMgY29udGVudCBjaGFuZ2UgZXZlbnRzIGZvciBkaXJ0eSB0cmFja2luZ1xuXHRcdHRoaXMuaWdub3JlRGlydHlPbk1vZGVsQ29udGVudENoYW5nZSA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMudXBkYXRlVGV4dEVkaXRvck1vZGVsKHZhbHVlLCB0aGlzLnByZWZlcnJlZExhbmd1YWdlSWQsIHJlYXNvbik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuaWdub3JlRGlydHlPbk1vZGVsQ29udGVudENoYW5nZSA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpbnN0YWxsTW9kZWxMaXN0ZW5lcnMobW9kZWw6IElUZXh0TW9kZWwpOiB2b2lkIHtcblxuXHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzAxODlcblx0XHQvLyBUaGlzIGNvZGUgaGFzIGJlZW4gZXh0cmFjdGVkIHRvIGEgZGlmZmVyZW50IG1ldGhvZCBiZWNhdXNlIGl0IGNhdXNlZCBhIG1lbW9yeSBsZWFrXG5cdFx0Ly8gd2hlcmUgYHZhbHVlYCB3YXMgY2FwdHVyZWQgaW4gdGhlIGNvbnRlbnQgY2hhbmdlIGxpc3RlbmVyIGNsb3N1cmUgc2NvcGUuXG5cblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoZSA9PiB0aGlzLm9uTW9kZWxDb250ZW50Q2hhbmdlZChtb2RlbCwgZS5pc1VuZG9pbmcgfHwgZS5pc1JlZG9pbmcpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobW9kZWwub25EaWRDaGFuZ2VMYW5ndWFnZSgoKSA9PiB0aGlzLm9uTWF5YmVTaG91bGRDaGFuZ2VFbmNvZGluZygpKSk7IC8vIGRldGVjdCBwb3NzaWJsZSBlbmNvZGluZyBjaGFuZ2UgdmlhIGxhbmd1YWdlIHNwZWNpZmljIHNldHRpbmdzXG5cblx0XHRzdXBlci5pbnN0YWxsTW9kZWxMaXN0ZW5lcnMobW9kZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbk1vZGVsQ29udGVudENoYW5nZWQobW9kZWw6IElUZXh0TW9kZWwsIGlzVW5kb2luZ09yUmVkb2luZzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMudHJhY2UoYG9uTW9kZWxDb250ZW50Q2hhbmdlZCgpIC0gZW50ZXJgKTtcblxuXHRcdC8vIEluIGFueSBjYXNlIGluY3JlbWVudCB0aGUgdmVyc2lvbiBpZCBiZWNhdXNlIGl0IHRyYWNrcyB0aGUgdGV4dHVhbCBjb250ZW50IHN0YXRlIG9mIHRoZSBtb2RlbCBhdCBhbGwgdGltZXNcblx0XHR0aGlzLnZlcnNpb25JZCsrO1xuXHRcdHRoaXMudHJhY2UoYG9uTW9kZWxDb250ZW50Q2hhbmdlZCgpIC0gbmV3IHZlcnNpb25JZCAke3RoaXMudmVyc2lvbklkfWApO1xuXG5cdFx0Ly8gUmVtZW1iZXIgd2hlbiB0aGUgdXNlciBjaGFuZ2VkIHRoZSBtb2RlbCB0aHJvdWdoIGEgdW5kby9yZWRvIG9wZXJhdGlvbi5cblx0XHQvLyBXZSBuZWVkIHRoaXMgaW5mb3JtYXRpb24gdG8gdGhyb3R0bGUgc2F2ZSBwYXJ0aWNpcGFudHMgdG8gZml4XG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwMjU0MlxuXHRcdGlmIChpc1VuZG9pbmdPclJlZG9pbmcpIHtcblx0XHRcdHRoaXMubGFzdE1vZGVsQ29udGVudENoYW5nZUZyb21VbmRvUmVkbyA9IERhdGUubm93KCk7XG5cdFx0fVxuXG5cdFx0Ly8gV2UgbWFyayBjaGVjayBmb3IgYSBkaXJ0eS1zdGF0ZSBjaGFuZ2UgdXBvbiBtb2RlbCBjb250ZW50IGNoYW5nZSwgdW5sZXNzOlxuXHRcdC8vIC0gZXhwbGljaXRseSBpbnN0cnVjdGVkIHRvIGlnbm9yZSBpdCAoZS5nLiBmcm9tIG1vZGVsLnJlc29sdmUoKSlcblx0XHQvLyAtIHRoZSBtb2RlbCBpcyByZWFkb25seSAoaW4gdGhhdCBjYXNlIHdlIG5ldmVyIGFzc3VtZSB0aGUgY2hhbmdlIHdhcyBkb25lIGJ5IHRoZSB1c2VyKVxuXHRcdGlmICghdGhpcy5pZ25vcmVEaXJ0eU9uTW9kZWxDb250ZW50Q2hhbmdlICYmICF0aGlzLmlzUmVhZG9ubHkoKSkge1xuXG5cdFx0XHQvLyBUaGUgY29udGVudHMgY2hhbmdlZCBhcyBhIG1hdHRlciBvZiBVbmRvIGFuZCB0aGUgdmVyc2lvbiByZWFjaGVkIG1hdGNoZXMgdGhlIHNhdmVkIG9uZVxuXHRcdFx0Ly8gSW4gdGhpcyBjYXNlIHdlIGNsZWFyIHRoZSBkaXJ0eSBmbGFnIGFuZCBlbWl0IGEgU0FWRUQgZXZlbnQgdG8gaW5kaWNhdGUgdGhpcyBzdGF0ZS5cblx0XHRcdGlmIChtb2RlbC5nZXRBbHRlcm5hdGl2ZVZlcnNpb25JZCgpID09PSB0aGlzLmJ1ZmZlclNhdmVkVmVyc2lvbklkKSB7XG5cdFx0XHRcdHRoaXMudHJhY2UoJ29uTW9kZWxDb250ZW50Q2hhbmdlZCgpIC0gbW9kZWwgY29udGVudCBjaGFuZ2VkIGJhY2sgdG8gbGFzdCBzYXZlZCB2ZXJzaW9uJyk7XG5cblx0XHRcdFx0Ly8gQ2xlYXIgZmxhZ3Ncblx0XHRcdFx0Y29uc3Qgd2FzRGlydHkgPSB0aGlzLmRpcnR5O1xuXHRcdFx0XHR0aGlzLnNldERpcnR5KGZhbHNlKTtcblxuXHRcdFx0XHQvLyBFbWl0IHJldmVydCBldmVudCBpZiB3ZSB3ZXJlIGRpcnR5XG5cdFx0XHRcdGlmICh3YXNEaXJ0eSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkUmV2ZXJ0LmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdGhlcndpc2UgdGhlIGNvbnRlbnQgaGFzIGNoYW5nZWQgYW5kIHdlIHNpZ25hbCB0aGlzIGFzIGJlY29taW5nIGRpcnR5XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0dGhpcy50cmFjZSgnb25Nb2RlbENvbnRlbnRDaGFuZ2VkKCkgLSBtb2RlbCBjb250ZW50IGNoYW5nZWQgYW5kIG1hcmtlZCBhcyBkaXJ0eScpO1xuXG5cdFx0XHRcdC8vIE1hcmsgYXMgZGlydHlcblx0XHRcdFx0dGhpcy5zZXREaXJ0eSh0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFbWl0IGFzIGV2ZW50XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmZpcmUoKTtcblxuXHRcdC8vIERldGVjdCBsYW5ndWFnZSBmcm9tIGNvbnRlbnRcblx0XHR0aGlzLmF1dG9EZXRlY3RMYW5ndWFnZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGF1dG9EZXRlY3RMYW5ndWFnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFdhaXQgdG8gYmUgcmVhZHkgdG8gZGV0ZWN0IGxhbmd1YWdlXG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlPy53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblxuXHRcdC8vIE9ubHkgcGVyZm9ybSBsYW5ndWFnZSBkZXRlY3Rpb24gY29uZGl0aW9uYWxseVxuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSB0aGlzLmdldExhbmd1YWdlSWQoKTtcblx0XHRpZiAoXG5cdFx0XHR0aGlzLnJlc291cmNlLnNjaGVtZSA9PT0gdGhpcy5wYXRoU2VydmljZS5kZWZhdWx0VXJpU2NoZW1lICYmXHQvLyBtYWtlIHN1cmUgdG8gbm90IGRldGVjdCBsYW5ndWFnZSBmb3Igbm9uLXVzZXIgdmlzaWJsZSBkb2N1bWVudHNcblx0XHRcdCghbGFuZ3VhZ2VJZCB8fCBsYW5ndWFnZUlkID09PSBQTEFJTlRFWFRfTEFOR1VBR0VfSUQpICYmXHRcdC8vIG9ubHkgcnVuIG9uIGZpbGVzIHdpdGggcGxhaW50ZXh0IGxhbmd1YWdlIHNldCBvciBubyBsYW5ndWFnZSBzZXQgYXQgYWxsXG5cdFx0XHQhdGhpcy5yZXNvdXJjZUhhc0V4dGVuc2lvblx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gb25seSBydW4gaWYgdGhpcyBwYXJ0aWN1bGFyIGZpbGUgZG9lc24ndCBoYXZlIGFuIGV4dGVuc2lvblxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHN1cGVyLmF1dG9EZXRlY3RMYW5ndWFnZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZm9yY2VSZXNvbHZlRnJvbUZpbGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm47IC8vIHJldHVybiBlYXJseSB3aGVuIHRoZSBtb2RlbCBpcyBpbnZhbGlkXG5cdFx0fVxuXG5cdFx0Ly8gV2UgZ28gdGhyb3VnaCB0aGUgdGV4dCBmaWxlIHNlcnZpY2UgdG8gbWFrZVxuXHRcdC8vIHN1cmUgdGhpcyBraW5kIG9mIGByZXNvbHZlYCBpcyBwcm9wZXJseVxuXHRcdC8vIHJ1bm5pbmcgaW4gc2VxdWVuY2Ugd2l0aCBhbnkgb3RoZXIgcnVubmluZ1xuXHRcdC8vIGByZXNvbHZlYCBpZiBhbnksIGluY2x1ZGluZyBzdWJzZXF1ZW50IHJ1bnNcblx0XHQvLyB0aGF0IGFyZSB0cmlnZ2VyZWQgcmlnaHQgYWZ0ZXIuXG5cblx0XHRhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS5maWxlcy5yZXNvbHZlKHRoaXMucmVzb3VyY2UsIHtcblx0XHRcdHJlbG9hZDogeyBhc3luYzogZmFsc2UgfSxcblx0XHRcdGZvcmNlUmVhZEZyb21GaWxlOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRGlydHlcblxuXHRpc0RpcnR5KCk6IHRoaXMgaXMgSVJlc29sdmVkVGV4dEZpbGVFZGl0b3JNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuZGlydHk7XG5cdH1cblxuXHRpc01vZGlmaWVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlzRGlydHkoKTtcblx0fVxuXG5cdHNldERpcnR5KGRpcnR5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBvbmx5IHJlc29sdmVkIG1vZGVscyBjYW4gYmUgbWFya2VkIGRpcnR5XG5cdFx0fVxuXG5cdFx0Ly8gVHJhY2sgZGlydHkgc3RhdGUgYW5kIHZlcnNpb24gaWRcblx0XHRjb25zdCB3YXNEaXJ0eSA9IHRoaXMuZGlydHk7XG5cdFx0dGhpcy5kb1NldERpcnR5KGRpcnR5KTtcblxuXHRcdC8vIEVtaXQgYXMgRXZlbnQgaWYgZGlydHkgY2hhbmdlZFxuXHRcdGlmIChkaXJ0eSAhPT0gd2FzRGlydHkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9TZXREaXJ0eShkaXJ0eTogYm9vbGVhbik6ICgpID0+IHZvaWQge1xuXHRcdGNvbnN0IHdhc0RpcnR5ID0gdGhpcy5kaXJ0eTtcblx0XHRjb25zdCB3YXNJbkNvbmZsaWN0TW9kZSA9IHRoaXMuaW5Db25mbGljdE1vZGU7XG5cdFx0Y29uc3Qgd2FzSW5FcnJvck1vZGUgPSB0aGlzLmluRXJyb3JNb2RlO1xuXHRcdGNvbnN0IG9sZEJ1ZmZlclNhdmVkVmVyc2lvbklkID0gdGhpcy5idWZmZXJTYXZlZFZlcnNpb25JZDtcblxuXHRcdGlmICghZGlydHkpIHtcblx0XHRcdHRoaXMuZGlydHkgPSBmYWxzZTtcblx0XHRcdHRoaXMuaW5Db25mbGljdE1vZGUgPSBmYWxzZTtcblx0XHRcdHRoaXMuaW5FcnJvck1vZGUgPSBmYWxzZTtcblx0XHRcdHRoaXMudXBkYXRlU2F2ZWRWZXJzaW9uSWQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kaXJ0eSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIGZ1bmN0aW9uIHRvIHJldmVydCB0aGlzIGNhbGxcblx0XHRyZXR1cm4gKCkgPT4ge1xuXHRcdFx0dGhpcy5kaXJ0eSA9IHdhc0RpcnR5O1xuXHRcdFx0dGhpcy5pbkNvbmZsaWN0TW9kZSA9IHdhc0luQ29uZmxpY3RNb2RlO1xuXHRcdFx0dGhpcy5pbkVycm9yTW9kZSA9IHdhc0luRXJyb3JNb2RlO1xuXHRcdFx0dGhpcy5idWZmZXJTYXZlZFZlcnNpb25JZCA9IG9sZEJ1ZmZlclNhdmVkVmVyc2lvbklkO1xuXHRcdH07XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gU2F2ZVxuXG5cdGFzeW5jIHNhdmUob3B0aW9uczogSVRleHRGaWxlU2F2ZUFzT3B0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIXRoaXMuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNSZWFkb25seSgpKSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdzYXZlKCkgLSBpZ25vcmluZyByZXF1ZXN0IGZvciByZWFkb25seSByZXNvdXJjZScpO1xuXG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGlmIG1vZGVsIGlzIHJlYWRvbmx5IHdlIGRvIG5vdCBhdHRlbXB0IHRvIHNhdmUgYXQgYWxsXG5cdFx0fVxuXG5cdFx0aWYgKFxuXHRcdFx0KHRoaXMuaGFzU3RhdGUoVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLkNPTkZMSUNUKSB8fCB0aGlzLmhhc1N0YXRlKFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZS5FUlJPUikpICYmXG5cdFx0XHQob3B0aW9ucy5yZWFzb24gPT09IFNhdmVSZWFzb24uQVVUTyB8fCBvcHRpb25zLnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5GT0NVU19DSEFOR0UgfHwgb3B0aW9ucy5yZWFzb24gPT09IFNhdmVSZWFzb24uV0lORE9XX0NIQU5HRSlcblx0XHQpIHtcblx0XHRcdHRoaXMudHJhY2UoJ3NhdmUoKSAtIGlnbm9yaW5nIGF1dG8gc2F2ZSByZXF1ZXN0IGZvciBtb2RlbCB0aGF0IGlzIGluIGNvbmZsaWN0IG9yIGVycm9yJyk7XG5cblx0XHRcdHJldHVybiBmYWxzZTsgLy8gaWYgbW9kZWwgaXMgaW4gc2F2ZSBjb25mbGljdCBvciBlcnJvciwgZG8gbm90IHNhdmUgdW5sZXNzIHNhdmUgcmVhc29uIGlzIGV4cGxpY2l0XG5cdFx0fVxuXG5cdFx0Ly8gQWN0dWFsbHkgZG8gc2F2ZSBhbmQgbG9nXG5cdFx0dGhpcy50cmFjZSgnc2F2ZSgpIC0gZW50ZXInKTtcblx0XHRhd2FpdCB0aGlzLmRvU2F2ZShvcHRpb25zKTtcblx0XHR0aGlzLnRyYWNlKCdzYXZlKCkgLSBleGl0Jyk7XG5cblx0XHRyZXR1cm4gdGhpcy5oYXNTdGF0ZShUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUuU0FWRUQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1NhdmUob3B0aW9uczogSVRleHRGaWxlU2F2ZUFzT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5yZWFzb24gIT09ICdudW1iZXInKSB7XG5cdFx0XHRvcHRpb25zLnJlYXNvbiA9IFNhdmVSZWFzb24uRVhQTElDSVQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmVyc2lvbklkID0gdGhpcy52ZXJzaW9uSWQ7XG5cdFx0dGhpcy50cmFjZShgZG9TYXZlKCR7dmVyc2lvbklkfSkgLSBlbnRlciB3aXRoIHZlcnNpb25JZCAke3ZlcnNpb25JZH1gKTtcblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiBzYXZlZCBmcm9tIHdpdGhpbiBzYXZlIHBhcnRpY2lwYW50IHRvIGJyZWFrIHJlY3Vyc2lvblxuXHRcdC8vXG5cdFx0Ly8gU2NlbmFyaW86IGEgc2F2ZSBwYXJ0aWNpcGFudCB0cmlnZ2VycyBhIHNhdmUoKSBvbiB0aGUgbW9kZWxcblx0XHRpZiAodGhpcy5pZ25vcmVTYXZlRnJvbVNhdmVQYXJ0aWNpcGFudHMpIHtcblx0XHRcdHRoaXMudHJhY2UoYGRvU2F2ZSgke3ZlcnNpb25JZH0pIC0gZXhpdCAtIHJlZnVzaW5nIHRvIHNhdmUoKSByZWN1cnNpdmVseSBmcm9tIHNhdmUgcGFydGljaXBhbnRgKTtcblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIExvb2t1cCBhbnkgcnVubmluZyBzYXZlIGZvciB0aGlzIHZlcnNpb25JZCBhbmQgcmV0dXJuIGl0IGlmIGZvdW5kXG5cdFx0Ly9cblx0XHQvLyBTY2VuYXJpbzogdXNlciBpbnZva2VkIHRoZSBzYXZlIGFjdGlvbiBtdWx0aXBsZSB0aW1lcyBxdWlja2x5IGZvciB0aGUgc2FtZSBjb250ZW50c1xuXHRcdC8vICAgICAgICAgICB3aGlsZSB0aGUgc2F2ZSB3YXMgbm90IHlldCBmaW5pc2hlZCB0byBkaXNrXG5cdFx0Ly9cblx0XHRpZiAodGhpcy5zYXZlU2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKHZlcnNpb25JZCkpIHtcblx0XHRcdHRoaXMudHJhY2UoYGRvU2F2ZSgke3ZlcnNpb25JZH0pIC0gZXhpdCAtIGZvdW5kIGEgcnVubmluZyBzYXZlIGZvciB2ZXJzaW9uSWQgJHt2ZXJzaW9uSWR9YCk7XG5cblx0XHRcdHJldHVybiB0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5ydW5uaW5nO1xuXHRcdH1cblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiBub3QgZGlydHkgKHVubGVzcyBmb3JjZWQpXG5cdFx0Ly9cblx0XHQvLyBTY2VuYXJpbzogdXNlciBpbnZva2VkIHNhdmUgYWN0aW9uIGV2ZW4gdGhvdWdoIHRoZSBtb2RlbCBpcyBub3QgZGlydHlcblx0XHRpZiAoIW9wdGlvbnMuZm9yY2UgJiYgIXRoaXMuZGlydHkpIHtcblx0XHRcdHRoaXMudHJhY2UoYGRvU2F2ZSgke3ZlcnNpb25JZH0pIC0gZXhpdCAtIGJlY2F1c2Ugbm90IGRpcnR5IGFuZC9vciB2ZXJzaW9uSWQgaXMgZGlmZmVyZW50ICh0aGlzLmlzRGlydHk6ICR7dGhpcy5kaXJ0eX0sIHRoaXMudmVyc2lvbklkOiAke3RoaXMudmVyc2lvbklkfSlgKTtcblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJldHVybiBpZiBjdXJyZW50bHkgc2F2aW5nIGJ5IHN0b3JpbmcgdGhpcyBzYXZlIHJlcXVlc3QgYXMgdGhlIG5leHQgc2F2ZSB0aGF0IHNob3VsZCBoYXBwZW4uXG5cdFx0Ly8gTmV2ZXIgZXZlciBtdXN0IDIgc2F2ZXMgZXhlY3V0ZSBhdCB0aGUgc2FtZSB0aW1lIGJlY2F1c2UgdGhpcyBjYW4gbGVhZCB0byBkaXJ0eSB3cml0ZXMgYW5kIHJhY2UgY29uZGl0aW9ucy5cblx0XHQvL1xuXHRcdC8vIFNjZW5hcmlvIEE6IGF1dG8gc2F2ZSB3YXMgdHJpZ2dlcmVkIGFuZCBpcyBjdXJyZW50bHkgYnVzeSBzYXZpbmcgdG8gZGlzay4gdGhpcyB0YWtlcyBsb25nIGVub3VnaCB0aGF0IGFub3RoZXIgYXV0byBzYXZlXG5cdFx0Ly8gICAgICAgICAgICAga2lja3MgaW4uXG5cdFx0Ly8gU2NlbmFyaW8gQjogc2F2ZSBpcyB2ZXJ5IHNsb3cgKGUuZy4gbmV0d29yayBzaGFyZSkgYW5kIHRoZSB1c2VyIG1hbmFnZXMgdG8gY2hhbmdlIHRoZSBidWZmZXIgYW5kIHRyaWdnZXIgYW5vdGhlciBzYXZlXG5cdFx0Ly8gICAgICAgICAgICAgd2hpbGUgdGhlIGZpcnN0IHNhdmUgaGFzIG5vdCByZXR1cm5lZCB5ZXQuXG5cdFx0Ly9cblx0XHRpZiAodGhpcy5zYXZlU2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKCkpIHtcblx0XHRcdHRoaXMudHJhY2UoYGRvU2F2ZSgke3ZlcnNpb25JZH0pIC0gZXhpdCAtIGJlY2F1c2UgYnVzeSBzYXZpbmdgKTtcblxuXHRcdFx0Ly8gSW5kaWNhdGUgdG8gdGhlIHNhdmUgc2VxdWVudGlhbGl6ZXIgdGhhdCB3ZSB3YW50IHRvXG5cdFx0XHQvLyBjYW5jZWwgdGhlIHJ1bm5pbmcgb3BlcmF0aW9uIHNvIHRoYXQgb3VycyBjYW4gcnVuXG5cdFx0XHQvLyBiZWZvcmUgdGhlIHJ1bm5pbmcgb25lIGZpbmlzaGVzLlxuXHRcdFx0Ly8gQ3VycmVudGx5IHRoaXMgd2lsbCB0cnkgdG8gY2FuY2VsIHJ1bm5pbmcgc2F2ZVxuXHRcdFx0Ly8gcGFydGljaXBhbnRzIGJ1dCBuZXZlciBhIHJ1bm5pbmcgc2F2ZS5cblx0XHRcdHRoaXMuc2F2ZVNlcXVlbnRpYWxpemVyLmNhbmNlbFJ1bm5pbmcoKTtcblxuXHRcdFx0Ly8gUXVldWUgdGhpcyBhcyB0aGUgdXBjb21pbmcgc2F2ZSBhbmQgcmV0dXJuXG5cdFx0XHRyZXR1cm4gdGhpcy5zYXZlU2VxdWVudGlhbGl6ZXIucXVldWUoKCkgPT4gdGhpcy5kb1NhdmUob3B0aW9ucykpO1xuXHRcdH1cblxuXHRcdC8vIFB1c2ggYWxsIGVkaXQgb3BlcmF0aW9ucyB0byB0aGUgdW5kbyBzdGFjayBzbyB0aGF0IHRoZSB1c2VyIGhhcyBhIGNoYW5jZSB0b1xuXHRcdC8vIEN0cmwrWiBiYWNrIHRvIHRoZSBzYXZlZCB2ZXJzaW9uLlxuXHRcdGlmICh0aGlzLmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0dGhpcy50ZXh0RWRpdG9yTW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNhdmVDYW5jZWxsYXRpb24gPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdHJldHVybiB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzYXZlUGFydGljaXBhbnRzJywgXCJTYXZpbmcgJ3swfSdcIiwgdGhpcy5uYW1lKSxcblx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0XHRcdGNhbmNlbGxhYmxlOiB0cnVlLFxuXHRcdFx0ZGVsYXk6IHRoaXMuaXNEaXJ0eSgpID8gMzAwMCA6IDUwMDBcblx0XHR9LCBwcm9ncmVzcyA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb1NhdmVTZXF1ZW50aWFsKHZlcnNpb25JZCwgb3B0aW9ucywgcHJvZ3Jlc3MsIHNhdmVDYW5jZWxsYXRpb24pO1xuXHRcdH0sICgpID0+IHtcblx0XHRcdHNhdmVDYW5jZWxsYXRpb24uY2FuY2VsKCk7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRzYXZlQ2FuY2VsbGF0aW9uLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZG9TYXZlU2VxdWVudGlhbCh2ZXJzaW9uSWQ6IG51bWJlciwgb3B0aW9uczogSVRleHRGaWxlU2F2ZUFzT3B0aW9ucywgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgc2F2ZUNhbmNlbGxhdGlvbjogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zYXZlU2VxdWVudGlhbGl6ZXIucnVuKHZlcnNpb25JZCwgKGFzeW5jICgpID0+IHtcblxuXHRcdFx0Ly8gQSBzYXZlIHBhcnRpY2lwYW50IGNhbiBzdGlsbCBjaGFuZ2UgdGhlIG1vZGVsIG5vdyBhbmQgc2luY2Ugd2UgYXJlIHNvIGNsb3NlIHRvIHNhdmluZ1xuXHRcdFx0Ly8gd2UgZG8gbm90IHdhbnQgdG8gdHJpZ2dlciBhbm90aGVyIGF1dG8gc2F2ZSBvciBzaW1pbGFyLCBzbyB3ZSBibG9jayB0aGlzXG5cdFx0XHQvLyBJbiBhZGRpdGlvbiB3ZSB1cGRhdGUgb3VyIHZlcnNpb24gcmlnaHQgYWZ0ZXIgaW4gY2FzZSBpdCBjaGFuZ2VkIGJlY2F1c2Ugb2YgYSBtb2RlbCBjaGFuZ2Vcblx0XHRcdC8vXG5cdFx0XHQvLyBTYXZlIHBhcnRpY2lwYW50cyBjYW4gYWxzbyBiZSBza2lwcGVkIHRocm91Z2ggQVBJLlxuXHRcdFx0aWYgKHRoaXMuaXNSZXNvbHZlZCgpICYmICFvcHRpb25zLnNraXBTYXZlUGFydGljaXBhbnRzKSB7XG5cdFx0XHRcdHRyeSB7XG5cblx0XHRcdFx0XHQvLyBNZWFzdXJlIHRoZSB0aW1lIGl0IHRvb2sgZnJvbSB0aGUgbGFzdCB1bmRvL3JlZG8gb3BlcmF0aW9uIHRvIHRoaXMgc2F2ZS4gSWYgdGhpc1xuXHRcdFx0XHRcdC8vIHRpbWUgaXMgYmVsb3cgYFVORE9fUkVET19TQVZFX1BBUlRJQ0lQQU5UU19USFJPVFRMRV9USFJFU0hPTERgLCB3ZSBtYWtlIHN1cmUgdG9cblx0XHRcdFx0XHQvLyBkZWxheSB0aGUgc2F2ZSBwYXJ0aWNpcGFudCBmb3IgdGhlIHJlbWFpbmluZyB0aW1lIGlmIHRoZSByZWFzb24gaXMgYXV0byBzYXZlLlxuXHRcdFx0XHRcdC8vXG5cdFx0XHRcdFx0Ly8gVGhpcyBmaXhlcyB0aGUgZm9sbG93aW5nIGlzc3VlOlxuXHRcdFx0XHRcdC8vIC0gdGhlIHVzZXIgaGFzIGNvbmZpZ3VyZWQgYXV0byBzYXZlIHdpdGggZGVsYXkgb2YgMTAwbXMgb3Igc2hvcnRlclxuXHRcdFx0XHRcdC8vIC0gdGhlIHVzZXIgaGFzIGEgc2F2ZSBwYXJ0aWNpcGFudCBlbmFibGVkIHRoYXQgbW9kaWZpZXMgdGhlIGZpbGUgb24gZWFjaCBzYXZlXG5cdFx0XHRcdFx0Ly8gLSB0aGUgdXNlciB0eXBlcyBpbnRvIHRoZSBmaWxlIGFuZCB0aGUgZmlsZSBnZXRzIHNhdmVkXG5cdFx0XHRcdFx0Ly8gLSB0aGUgdXNlciB0cmlnZ2VycyB1bmRvIG9wZXJhdGlvblxuXHRcdFx0XHRcdC8vIC0gdGhpcyB3aWxsIHVuZG8gdGhlIHNhdmUgcGFydGljaXBhbnQgY2hhbmdlIGJ1dCB0cmlnZ2VyIHRoZSBzYXZlIHBhcnRpY2lwYW50IHJpZ2h0IGFmdGVyXG5cdFx0XHRcdFx0Ly8gLSB0aGUgdXNlciBoYXMgbm8gY2hhbmNlIHRvIHVuZG8gb3ZlciB0aGUgc2F2ZSBwYXJ0aWNpcGFudFxuXHRcdFx0XHRcdC8vXG5cdFx0XHRcdFx0Ly8gUmVwb3J0ZWQgYXM6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDI1NDJcblx0XHRcdFx0XHRpZiAob3B0aW9ucy5yZWFzb24gPT09IFNhdmVSZWFzb24uQVVUTyAmJiB0eXBlb2YgdGhpcy5sYXN0TW9kZWxDb250ZW50Q2hhbmdlRnJvbVVuZG9SZWRvID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdGltZUZyb21VbmRvUmVkb1RvU2F2ZSA9IERhdGUubm93KCkgLSB0aGlzLmxhc3RNb2RlbENvbnRlbnRDaGFuZ2VGcm9tVW5kb1JlZG87XG5cdFx0XHRcdFx0XHRpZiAodGltZUZyb21VbmRvUmVkb1RvU2F2ZSA8IFRleHRGaWxlRWRpdG9yTW9kZWwuVU5ET19SRURPX1NBVkVfUEFSVElDSVBBTlRTX0FVVE9fU0FWRV9USFJPVFRMRV9USFJFU0hPTEQpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGltZW91dChUZXh0RmlsZUVkaXRvck1vZGVsLlVORE9fUkVET19TQVZFX1BBUlRJQ0lQQU5UU19BVVRPX1NBVkVfVEhST1RUTEVfVEhSRVNIT0xEIC0gdGltZUZyb21VbmRvUmVkb1RvU2F2ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gUnVuIHNhdmUgcGFydGljaXBhbnRzIHVubGVzcyBzYXZlIHdhcyBjYW5jZWxsZWQgbWVhbndoaWxlXG5cdFx0XHRcdFx0aWYgKCFzYXZlQ2FuY2VsbGF0aW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmlnbm9yZVNhdmVGcm9tU2F2ZVBhcnRpY2lwYW50cyA9IHRydWU7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS5maWxlcy5ydW5TYXZlUGFydGljaXBhbnRzKHRoaXMsIHsgcmVhc29uOiBvcHRpb25zLnJlYXNvbiA/PyBTYXZlUmVhc29uLkVYUExJQ0lULCBzYXZlZEZyb206IG9wdGlvbnMuZnJvbSB9LCBwcm9ncmVzcywgc2F2ZUNhbmNlbGxhdGlvbi50b2tlbik7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSAmJiAhc2F2ZUNhbmNlbGxhdGlvbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIHBhcnRpY2lwYW50IHdhbnRzIHRvIGNhbmNlbCB0aGlzIG9wZXJhdGlvblxuXHRcdFx0XHRcdFx0XHRcdHNhdmVDYW5jZWxsYXRpb24uY2FuY2VsKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuaWdub3JlU2F2ZUZyb21TYXZlUGFydGljaXBhbnRzID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW3RleHQgZmlsZSBtb2RlbF0gcnVuU2F2ZVBhcnRpY2lwYW50cygke3ZlcnNpb25JZH0pIC0gcmVzdWx0ZWQgaW4gYW4gZXJyb3I6ICR7ZXJyb3IudG9TdHJpbmcoKX1gLCB0aGlzLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEl0IGlzIHBvc3NpYmxlIHRoYXQgYSBzdWJzZXF1ZW50IHNhdmUgaXMgY2FuY2VsbGluZyB0aGlzXG5cdFx0XHQvLyBydW5uaW5nIHNhdmUuIEFzIHN1Y2ggd2UgcmV0dXJuIGVhcmx5IHdoZW4gd2UgZGV0ZWN0IHRoYXRcblx0XHRcdC8vIEhvd2V2ZXIsIHdlIGRvIG5vdCBwYXNzIHRoZSB0b2tlbiBpbnRvIHRoZSBmaWxlIHNlcnZpY2Vcblx0XHRcdC8vIGJlY2F1c2UgdGhhdCBpcyBhbiBhdG9taWMgb3BlcmF0aW9uIGN1cnJlbnRseSB3aXRob3V0XG5cdFx0XHQvLyBjYW5jZWxsYXRpb24gc3VwcG9ydCwgc28gd2UgZGlzcG9zZSB0aGUgY2FuY2VsbGF0aW9uIGlmXG5cdFx0XHQvLyBpdCB3YXMgbm90IGNhbmNlbGxlZCB5ZXQuXG5cdFx0XHRpZiAoc2F2ZUNhbmNlbGxhdGlvbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzYXZlQ2FuY2VsbGF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2UgaGF2ZSB0byBwcm90ZWN0IGFnYWluc3QgYmVpbmcgZGlzcG9zZWQgYXQgdGhpcyBwb2ludC4gSXQgY291bGQgYmUgdGhhdCB0aGUgc2F2ZSgpIG9wZXJhdGlvblxuXHRcdFx0Ly8gd2FzIHRyaWdnZXJkIGZvbGxvd2VkIGJ5IGEgZGlzcG9zZSgpIG9wZXJhdGlvbiByaWdodCBhZnRlciB3aXRob3V0IHdhaXRpbmcuIFR5cGljYWxseSB3ZSBjYW5ub3Rcblx0XHRcdC8vIGJlIGRpc3Bvc2VkIGlmIHdlIGFyZSBkaXJ0eSwgYnV0IGlmIHdlIGFyZSBub3QgZGlydHksIHNhdmUoKSBhbmQgZGlzcG9zZSgpIGNhbiBzdGlsbCBiZSB0cmlnZ2VyZWRcblx0XHRcdC8vIG9uZSBhZnRlciB0aGUgb3RoZXIgd2l0aG91dCB3YWl0aW5nIGZvciB0aGUgc2F2ZSgpIHRvIGNvbXBsZXRlLiBJZiB3ZSBhcmUgZGlzcG9zZWQoKSwgd2Ugcmlza1xuXHRcdFx0Ly8gc2F2aW5nIGNvbnRlbnRzIHRvIGRpc2sgdGhhdCBhcmUgc3RhbGUgKHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNTA5NDIpLlxuXHRcdFx0Ly8gVG8gZml4IHRoaXMgaXNzdWUsIHdlIHdpbGwgbm90IHN0b3JlIHRoZSBjb250ZW50cyB0byBkaXNrIHdoZW4gd2UgZ290IGRpc3Bvc2VkLlxuXHRcdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2UgcmVxdWlyZSBhIHJlc29sdmVkIG1vZGVsIGZyb20gdGhpcyBwb2ludCBvbiwgc2luY2Ugd2UgYXJlIGFib3V0IHRvIHdyaXRlIGRhdGEgdG8gZGlzay5cblx0XHRcdGlmICghdGhpcy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB1cGRhdGUgdmVyc2lvbklkIHdpdGggaXRzIG5ldyB2YWx1ZSAoaWYgcHJlLXNhdmUgY2hhbmdlcyBoYXBwZW5lZClcblx0XHRcdHZlcnNpb25JZCA9IHRoaXMudmVyc2lvbklkO1xuXG5cdFx0XHQvLyBDbGVhciBlcnJvciBmbGFnIHNpbmNlIHdlIGFyZSB0cnlpbmcgdG8gc2F2ZSBhZ2FpblxuXHRcdFx0dGhpcy5pbkVycm9yTW9kZSA9IGZhbHNlO1xuXG5cdFx0XHQvLyBTYXZlIHRvIERpc2suIFdlIG1hcmsgdGhlIHNhdmUgb3BlcmF0aW9uIGFzIGN1cnJlbnRseSBydW5uaW5nIHdpdGhcblx0XHRcdC8vIHRoZSBsYXRlc3QgdmVyc2lvbklkIGJlY2F1c2UgaXQgbWlnaHQgaGF2ZSBjaGFuZ2VkIGZyb20gYSBzYXZlXG5cdFx0XHQvLyBwYXJ0aWNpcGFudCB0cmlnZ2VyaW5nXG5cdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBsb2NhbGl6ZSgnc2F2ZVRleHRGaWxlJywgXCJXcml0aW5nIGludG8gZmlsZS4uLlwiKSB9KTtcblx0XHRcdHRoaXMudHJhY2UoYGRvU2F2ZSgke3ZlcnNpb25JZH0pIC0gYmVmb3JlIHdyaXRlKClgKTtcblx0XHRcdGNvbnN0IGxhc3RSZXNvbHZlZEZpbGVTdGF0ID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCk7XG5cdFx0XHRjb25zdCByZXNvbHZlZFRleHRGaWxlRWRpdG9yTW9kZWwgPSB0aGlzO1xuXHRcdFx0cmV0dXJuIHRoaXMuc2F2ZVNlcXVlbnRpYWxpemVyLnJ1bih2ZXJzaW9uSWQsIChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLndyaXRlKGxhc3RSZXNvbHZlZEZpbGVTdGF0LnJlc291cmNlLCByZXNvbHZlZFRleHRGaWxlRWRpdG9yTW9kZWwuY3JlYXRlU25hcHNob3QoKSwge1xuXHRcdFx0XHRcdFx0bXRpbWU6IGxhc3RSZXNvbHZlZEZpbGVTdGF0Lm10aW1lLFxuXHRcdFx0XHRcdFx0ZW5jb2Rpbmc6IHRoaXMuZ2V0RW5jb2RpbmcoKSxcblx0XHRcdFx0XHRcdGV0YWc6IChvcHRpb25zLmlnbm9yZU1vZGlmaWVkU2luY2UgfHwgIXRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5wcmV2ZW50U2F2ZUNvbmZsaWN0cyhsYXN0UmVzb2x2ZWRGaWxlU3RhdC5yZXNvdXJjZSwgcmVzb2x2ZWRUZXh0RmlsZUVkaXRvck1vZGVsLmdldExhbmd1YWdlSWQoKSkpID8gRVRBR19ESVNBQkxFRCA6IGxhc3RSZXNvbHZlZEZpbGVTdGF0LmV0YWcsXG5cdFx0XHRcdFx0XHR1bmxvY2s6IG9wdGlvbnMud3JpdGVVbmxvY2ssXG5cdFx0XHRcdFx0XHR3cml0ZUVsZXZhdGVkOiBvcHRpb25zLndyaXRlRWxldmF0ZWRcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdHRoaXMuaGFuZGxlU2F2ZVN1Y2Nlc3Moc3RhdCwgdmVyc2lvbklkLCBvcHRpb25zKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmhhbmRsZVNhdmVFcnJvcihlcnJvciwgdmVyc2lvbklkLCBvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKSk7XG5cdFx0fSkoKSwgKCkgPT4gc2F2ZUNhbmNlbGxhdGlvbi5jYW5jZWwoKSk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVNhdmVTdWNjZXNzKHN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgdmVyc2lvbklkOiBudW1iZXIsIG9wdGlvbnM6IElUZXh0RmlsZVNhdmVBc09wdGlvbnMpOiB2b2lkIHtcblxuXHRcdC8vIFVwZGF0ZWQgcmVzb2x2ZWQgc3RhdCB3aXRoIHVwZGF0ZWQgc3RhdFxuXHRcdHRoaXMudXBkYXRlTGFzdFJlc29sdmVkRmlsZVN0YXQoc3RhdCk7XG5cblx0XHQvLyBVcGRhdGUgZGlydHkgc3RhdGUgdW5sZXNzIG1vZGVsIGhhcyBjaGFuZ2VkIG1lYW53aGlsZVxuXHRcdGlmICh2ZXJzaW9uSWQgPT09IHRoaXMudmVyc2lvbklkKSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBoYW5kbGVTYXZlU3VjY2Vzcygke3ZlcnNpb25JZH0pIC0gc2V0dGluZyBkaXJ0eSB0byBmYWxzZSBiZWNhdXNlIHZlcnNpb25JZCBkaWQgbm90IGNoYW5nZWApO1xuXHRcdFx0dGhpcy5zZXREaXJ0eShmYWxzZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHJhY2UoYGhhbmRsZVNhdmVTdWNjZXNzKCR7dmVyc2lvbklkfSkgLSBub3Qgc2V0dGluZyBkaXJ0eSB0byBmYWxzZSBiZWNhdXNlIHZlcnNpb25JZCBkaWQgY2hhbmdlIG1lYW53aGlsZWApO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBvcnBoYW4gc3RhdGUgZ2l2ZW4gc2F2ZSB3YXMgc3VjY2Vzc2Z1bFxuXHRcdHRoaXMuc2V0T3JwaGFuZWQoZmFsc2UpO1xuXG5cdFx0Ly8gRW1pdCBTYXZlIEV2ZW50XG5cdFx0dGhpcy5fb25EaWRTYXZlLmZpcmUoeyByZWFzb246IG9wdGlvbnMucmVhc29uLCBzdGF0LCBzb3VyY2U6IG9wdGlvbnMuc291cmNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVTYXZlRXJyb3IoZXJyb3I6IEVycm9yLCB2ZXJzaW9uSWQ6IG51bWJlciwgb3B0aW9uczogSVRleHRGaWxlU2F2ZUFzT3B0aW9ucyk6IHZvaWQge1xuXHRcdChvcHRpb25zLmlnbm9yZUVycm9ySGFuZGxlciA/IHRoaXMubG9nU2VydmljZS50cmFjZSA6IHRoaXMubG9nU2VydmljZS5lcnJvcikuYXBwbHkodGhpcy5sb2dTZXJ2aWNlLCBbYFt0ZXh0IGZpbGUgbW9kZWxdIGhhbmRsZVNhdmVFcnJvcigke3ZlcnNpb25JZH0pIC0gZXhpdCAtIHJlc3VsdGVkIGluIGEgc2F2ZSBlcnJvcjogJHtlcnJvci50b1N0cmluZygpfWAsIHRoaXMucmVzb3VyY2UudG9TdHJpbmcoKV0pO1xuXG5cdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIHRoZSBzYXZlKCkgY2FsbCB3YXMgbWFkZSBhc2tpbmcgdG9cblx0XHQvLyBoYW5kbGUgdGhlIHNhdmUgZXJyb3IgaXRzZWxmLlxuXHRcdGlmIChvcHRpb25zLmlnbm9yZUVycm9ySGFuZGxlcikge1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0Ly8gSW4gYW55IGNhc2Ugb2YgYW4gZXJyb3IsIHdlIG1hcmsgdGhlIG1vZGVsIGFzIGRpcnR5IHRvIHByZXZlbnQgZGF0YSBsb3NzXG5cdFx0Ly8gSXQgY291bGQgYmUgcG9zc2libGUgdGhhdCB0aGUgd3JpdGUgY29ycnVwdGVkIHRoZSBmaWxlIG9uIGRpc2sgKGUuZy4gd2hlblxuXHRcdC8vIGFuIGVycm9yIGhhcHBlbmVkIGFmdGVyIHRydW5jYXRpbmcgdGhlIGZpbGUpIGFuZCBhcyBzdWNoIHdlIHdhbnQgdG8gcHJlc2VydmVcblx0XHQvLyB0aGUgbW9kZWwgY29udGVudHMgdG8gcHJldmVudCBkYXRhIGxvc3MuXG5cdFx0dGhpcy5zZXREaXJ0eSh0cnVlKTtcblxuXHRcdC8vIEZsYWcgYXMgZXJyb3Igc3RhdGUgaW4gdGhlIG1vZGVsXG5cdFx0dGhpcy5pbkVycm9yTW9kZSA9IHRydWU7XG5cblx0XHQvLyBMb29rIG91dCBmb3IgYSBzYXZlIGNvbmZsaWN0XG5cdFx0aWYgKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9ESUZJRURfU0lOQ0UpIHtcblx0XHRcdHRoaXMuaW5Db25mbGljdE1vZGUgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgdG8gdXNlclxuXHRcdHRoaXMudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLnNhdmVFcnJvckhhbmRsZXIub25TYXZlRXJyb3IoZXJyb3IsIHRoaXMsIG9wdGlvbnMpO1xuXG5cdFx0Ly8gRW1pdCBhcyBldmVudFxuXHRcdHRoaXMuX29uRGlkU2F2ZUVycm9yLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2F2ZWRWZXJzaW9uSWQoKTogdm9pZCB7XG5cdFx0Ly8gd2UgcmVtZW1iZXIgdGhlIG1vZGVscyBhbHRlcm5hdGUgdmVyc2lvbiBpZCB0byByZW1lbWJlciB3aGVuIHRoZSB2ZXJzaW9uXG5cdFx0Ly8gb2YgdGhlIG1vZGVsIG1hdGNoZXMgd2l0aCB0aGUgc2F2ZWQgdmVyc2lvbiBvbiBkaXNrLiB3ZSBuZWVkIHRvIGtlZXAgdGhpc1xuXHRcdC8vIGluIG9yZGVyIHRvIGZpbmQgb3V0IGlmIHRoZSBtb2RlbCBjaGFuZ2VkIGJhY2sgdG8gYSBzYXZlZCB2ZXJzaW9uIChlLmcuXG5cdFx0Ly8gd2hlbiB1bmRvaW5nIGxvbmcgZW5vdWdoIHRvIHJlYWNoIHRvIGEgdmVyc2lvbiB0aGF0IGlzIHNhdmVkIGFuZCB0aGVuIHRvXG5cdFx0Ly8gY2xlYXIgdGhlIGRpcnR5IGZsYWcpXG5cdFx0aWYgKHRoaXMuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHR0aGlzLmJ1ZmZlclNhdmVkVmVyc2lvbklkID0gdGhpcy50ZXh0RWRpdG9yTW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUxhc3RSZXNvbHZlZEZpbGVTdGF0KG5ld0ZpbGVTdGF0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBvbGRSZWFkb25seSA9IHRoaXMuaXNSZWFkb25seSgpO1xuXG5cdFx0Ly8gRmlyc3QgcmVzb2x2ZSAtIGp1c3QgdGFrZVxuXHRcdGlmICghdGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCkge1xuXHRcdFx0dGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCA9IG5ld0ZpbGVTdGF0O1xuXHRcdH1cblxuXHRcdC8vIFN1YnNlcXVlbnQgcmVzb2x2ZSAtIG1ha2Ugc3VyZSB0aGF0IHdlIG9ubHkgYXNzaWduIGl0IGlmIHRoZSBtdGltZSBpcyBlcXVhbCBvciBoYXMgYWR2YW5jZWQuXG5cdFx0Ly8gVGhpcyBwcmV2ZW50cyByYWNlIGNvbmRpdGlvbnMgZnJvbSByZXNvbHZpbmcgYW5kIHNhdmluZy4gSWYgYSBzYXZlIGNvbWVzIGluIGxhdGUgYWZ0ZXIgYSByZXZlcnRcblx0XHQvLyB3YXMgY2FsbGVkLCB0aGUgbXRpbWUgY291bGQgYmUgb3V0IG9mIHN5bmMuXG5cdFx0ZWxzZSBpZiAodGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdC5tdGltZSA8PSBuZXdGaWxlU3RhdC5tdGltZSkge1xuXHRcdFx0dGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCA9IG5ld0ZpbGVTdGF0O1xuXHRcdH1cblxuXHRcdC8vIEluIGFsbCBvdGhlciBjYXNlcyB1cGRhdGUgb25seSB0aGUgcmVhZG9ubHkgYW5kIGxvY2tlZCBmbGFnc1xuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCA9IHsgLi4udGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCwgcmVhZG9ubHk6IG5ld0ZpbGVTdGF0LnJlYWRvbmx5LCBsb2NrZWQ6IG5ld0ZpbGVTdGF0LmxvY2tlZCB9O1xuXHRcdH1cblxuXHRcdC8vIFNpZ25hbCB0aGF0IHRoZSByZWFkb25seSBzdGF0ZSBjaGFuZ2VkXG5cdFx0aWYgKHRoaXMuaXNSZWFkb25seSgpICE9PSBvbGRSZWFkb25seSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0aGFzU3RhdGUoc3RhdGU6IFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZSk6IGJvb2xlYW4ge1xuXHRcdHN3aXRjaCAoc3RhdGUpIHtcblx0XHRcdGNhc2UgVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLkNPTkZMSUNUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbkNvbmZsaWN0TW9kZTtcblx0XHRcdGNhc2UgVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLkRJUlRZOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5kaXJ0eTtcblx0XHRcdGNhc2UgVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLkVSUk9SOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbkVycm9yTW9kZTtcblx0XHRcdGNhc2UgVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLk9SUEhBTjpcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5PcnBoYW5Nb2RlO1xuXHRcdFx0Y2FzZSBUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUuUEVORElOR19TQVZFOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5zYXZlU2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKCk7XG5cdFx0XHRjYXNlIFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZS5TQVZFRDpcblx0XHRcdFx0cmV0dXJuICF0aGlzLmRpcnR5O1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGpvaW5TdGF0ZShzdGF0ZTogVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLlBFTkRJTkdfU0FWRSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5ydW5uaW5nO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VJZCh0aGlzOiBJUmVzb2x2ZWRUZXh0RmlsZUVkaXRvck1vZGVsKTogc3RyaW5nO1xuXHRvdmVycmlkZSBnZXRMYW5ndWFnZUlkKCk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0b3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLnRleHRFZGl0b3JNb2RlbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMudGV4dEVkaXRvck1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5wcmVmZXJyZWRMYW5ndWFnZUlkO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEVuY29kaW5nXG5cblx0cHJpdmF0ZSBhc3luYyBvbk1heWJlU2hvdWxkQ2hhbmdlRW5jb2RpbmcoKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBUaGlzIGlzIGEgYml0IG9mIGEgaGFjayBidXQgdGhlcmUgaXMgYSBuYXJyb3cgY2FzZSB3aGVyZVxuXHRcdC8vIHBlci1sYW5ndWFnZSBjb25maWd1cmVkIGVuY29kaW5ncyBhcmUgbm90IHdvcmtpbmc6XG5cdFx0Ly9cblx0XHQvLyBPbiBzdGFydHVwIHdlIG1heSBub3QgeWV0IGhhdmUgYWxsIGxhbmd1YWdlcyByZXNvbHZlZCBzb1xuXHRcdC8vIHdlIHBpY2sgYSB3cm9uZyBlbmNvZGluZy4gV2UgbmV2ZXIgdXNlZCB0byByZS1hcHBseSB0aGVcblx0XHQvLyBlbmNvZGluZyB3aGVuIHRoZSBsYW5ndWFnZSB3YXMgdGhlbiByZXNvbHZlZCwgYmVjYXVzZSB0aGF0XG5cdFx0Ly8gaXMgYW4gb3BlcmF0aW9uIHRoYXQgaXMgd2lsbCBoYXZlIHRvIGZldGNoIHRoZSBjb250ZW50c1xuXHRcdC8vIGFnYWluIGZyb20gZGlzay5cblx0XHQvL1xuXHRcdC8vIFRvIG1pdGlnYXRlIHRoaXMgaXNzdWUsIHdoZW4gd2UgZGV0ZWN0IHRoZSBtb2RlbCBsYW5ndWFnZVxuXHRcdC8vIGNoYW5nZXMsIHdlIHNlZSBpZiB0aGVyZSBpcyBhIHNwZWNpZmljIGVuY29kaW5nIGNvbmZpZ3VyZWRcblx0XHQvLyBmb3IgdGhlIG5ldyBsYW5ndWFnZSBhbmQgYXBwbHkgaXQsIG9ubHkgaWYgdGhlIG1vZGVsIGlzXG5cdFx0Ly8gbm90IGRpcnR5IGFuZCBvbmx5IGlmIHRoZSBlbmNvZGluZyB3YXMgbm90IGV4cGxpY2l0bHkgc2V0LlxuXHRcdC8vXG5cdFx0Ly8gKHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTI3OTM2KVxuXG5cdFx0aWYgKHRoaXMuaGFzRW5jb2RpbmdTZXRFeHBsaWNpdGx5KSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdvbk1heWJlU2hvdWxkQ2hhbmdlRW5jb2RpbmcoKSAtIGlnbm9yaW5nIGJlY2F1c2UgZW5jb2Rpbmcgd2FzIHNldCBleHBsaWNpdGx5Jyk7XG5cblx0XHRcdHJldHVybjsgLy8gbmV2ZXIgY2hhbmdlIHRoZSB1c2VyJ3MgY2hvaWNlIG9mIGVuY29kaW5nXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29udGVudEVuY29kaW5nID09PSBVVEY4X3dpdGhfYm9tIHx8IHRoaXMuY29udGVudEVuY29kaW5nID09PSBVVEYxNmJlIHx8IHRoaXMuY29udGVudEVuY29kaW5nID09PSBVVEYxNmxlKSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdvbk1heWJlU2hvdWxkQ2hhbmdlRW5jb2RpbmcoKSAtIGlnbm9yaW5nIGJlY2F1c2UgY29udGVudCBlbmNvZGluZyBoYXMgYSBCT00nKTtcblxuXHRcdFx0cmV0dXJuOyAvLyBuZXZlciBjaGFuZ2UgYW4gZW5jb2RpbmcgdGhhdCB3ZSBjYW4gZGV0ZWN0IDEwMCUgdmlhIEJPTXNcblx0XHR9XG5cblx0XHRjb25zdCB7IGVuY29kaW5nIH0gPSBhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS5lbmNvZGluZy5nZXRQcmVmZXJyZWRSZWFkRW5jb2RpbmcodGhpcy5yZXNvdXJjZSk7XG5cdFx0aWYgKHR5cGVvZiBlbmNvZGluZyAhPT0gJ3N0cmluZycgfHwgIXRoaXMuaXNOZXdFbmNvZGluZyhlbmNvZGluZykpIHtcblx0XHRcdHRoaXMudHJhY2UoYG9uTWF5YmVTaG91bGRDaGFuZ2VFbmNvZGluZygpIC0gaWdub3JpbmcgYmVjYXVzZSBwcmVmZXJyZWQgZW5jb2RpbmcgJHtlbmNvZGluZ30gaXMgbm90IG5ld2ApO1xuXG5cdFx0XHRyZXR1cm47IC8vIHJldHVybiBlYXJseSBpZiBlbmNvZGluZyBpcyBpbnZhbGlkIG9yIGRpZCBub3QgY2hhbmdlXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNEaXJ0eSgpKSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdvbk1heWJlU2hvdWxkQ2hhbmdlRW5jb2RpbmcoKSAtIGlnbm9yaW5nIGJlY2F1c2UgbW9kZWwgaXMgZGlydHknKTtcblxuXHRcdFx0cmV0dXJuOyAvLyByZXR1cm4gZWFybHkgdG8gcHJldmVudCBhY2NpZGVudCBzYXZlcyBpbiB0aGlzIGNhc2Vcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgQWRqdXN0aW5nIGVuY29kaW5nIGJhc2VkIG9uIGNvbmZpZ3VyZWQgbGFuZ3VhZ2Ugb3ZlcnJpZGUgdG8gJyR7ZW5jb2Rpbmd9JyBmb3IgJHt0aGlzLnJlc291cmNlLnRvU3RyaW5nKHRydWUpfS5gKTtcblxuXHRcdC8vIEZvcmNlIHJlc29sdmUgdG8gcGljayB1cCB0aGUgbmV3IGVuY29kaW5nXG5cdFx0cmV0dXJuIHRoaXMuZm9yY2VSZXNvbHZlRnJvbUZpbGUoKTtcblx0fVxuXG5cdHByaXZhdGUgaGFzRW5jb2RpbmdTZXRFeHBsaWNpdGx5ID0gZmFsc2U7XG5cblx0c2V0RW5jb2RpbmcoZW5jb2Rpbmc6IHN0cmluZywgbW9kZTogRW5jb2RpbmdNb2RlKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBSZW1lbWJlciB0aGF0IGFuIGV4cGxpY2l0IGVuY29kaW5nIHdhcyBzZXRcblx0XHR0aGlzLmhhc0VuY29kaW5nU2V0RXhwbGljaXRseSA9IHRydWU7XG5cblx0XHRyZXR1cm4gdGhpcy5zZXRFbmNvZGluZ0ludGVybmFsKGVuY29kaW5nLCBtb2RlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0RW5jb2RpbmdJbnRlcm5hbChlbmNvZGluZzogc3RyaW5nLCBtb2RlOiBFbmNvZGluZ01vZGUpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIEVuY29kZTogU2F2ZSB3aXRoIGVuY29kaW5nXG5cdFx0aWYgKG1vZGUgPT09IEVuY29kaW5nTW9kZS5FbmNvZGUpIHtcblx0XHRcdHRoaXMudXBkYXRlUHJlZmVycmVkRW5jb2RpbmcoZW5jb2RpbmcpO1xuXG5cdFx0XHQvLyBTYXZlXG5cdFx0XHRpZiAoIXRoaXMuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdHRoaXMudmVyc2lvbklkKys7IC8vIG5lZWRzIHRvIGluY3JlbWVudCBiZWNhdXNlIHdlIGNoYW5nZSB0aGUgbW9kZWwgcG90ZW50aWFsbHlcblx0XHRcdFx0dGhpcy5zZXREaXJ0eSh0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLmluQ29uZmxpY3RNb2RlKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2F2ZSh7IHNvdXJjZTogVGV4dEZpbGVFZGl0b3JNb2RlbC5URVhURklMRV9TQVZFX0VOQ09ESU5HX1NPVVJDRSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEZWNvZGU6IFJlc29sdmUgd2l0aCBlbmNvZGluZ1xuXHRcdGVsc2Uge1xuXHRcdFx0aWYgKCF0aGlzLmlzTmV3RW5jb2RpbmcoZW5jb2RpbmcpKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gcmV0dXJuIGVhcmx5IGlmIHRoZSBlbmNvZGluZyBpcyBhbHJlYWR5IHRoZSBzYW1lXG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmlzRGlydHkoKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCByZS1vcGVuIGEgZGlydHkgdGV4dCBkb2N1bWVudCB3aXRoIGRpZmZlcmVudCBlbmNvZGluZy4gU2F2ZSBpdCBmaXJzdC4nKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy51cGRhdGVQcmVmZXJyZWRFbmNvZGluZyhlbmNvZGluZyk7XG5cblx0XHRcdGF3YWl0IHRoaXMuZm9yY2VSZXNvbHZlRnJvbUZpbGUoKTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVQcmVmZXJyZWRFbmNvZGluZyhlbmNvZGluZzogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzTmV3RW5jb2RpbmcoZW5jb2RpbmcpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5wcmVmZXJyZWRFbmNvZGluZyA9IGVuY29kaW5nO1xuXG5cdFx0Ly8gRW1pdFxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRW5jb2RpbmcuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc05ld0VuY29kaW5nKGVuY29kaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5wcmVmZXJyZWRFbmNvZGluZyA9PT0gZW5jb2RpbmcpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gcmV0dXJuIGVhcmx5IGlmIHRoZSBlbmNvZGluZyBpcyBhbHJlYWR5IHRoZSBzYW1lXG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnByZWZlcnJlZEVuY29kaW5nICYmIHRoaXMuY29udGVudEVuY29kaW5nID09PSBlbmNvZGluZykge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBhbHNvIHJldHVybiBpZiB3ZSBkb24ndCBoYXZlIGEgcHJlZmVycmVkIGVuY29kaW5nIGJ1dCB0aGUgY29udGVudCBlbmNvZGluZyBpcyBhbHJlYWR5IHRoZSBzYW1lXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRnZXRFbmNvZGluZygpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnByZWZlcnJlZEVuY29kaW5nIHx8IHRoaXMuY29udGVudEVuY29kaW5nO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSB0cmFjZShtc2c6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3RleHQgZmlsZSBtb2RlbF0gJHttc2d9YCwgdGhpcy5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGlzUmVzb2x2ZWQoKTogdGhpcyBpcyBJUmVzb2x2ZWRUZXh0RmlsZUVkaXRvck1vZGVsIHtcblx0XHRyZXR1cm4gISF0aGlzLnRleHRFZGl0b3JNb2RlbDtcblx0fVxuXG5cdG92ZXJyaWRlIGlzUmVhZG9ubHkoKTogYm9vbGVhbiB8IElNYXJrZG93blN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5pc1JlYWRvbmx5KHRoaXMucmVzb3VyY2UsIHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnRyYWNlKCdkaXNwb3NlKCknKTtcblxuXHRcdHRoaXMuaW5Db25mbGljdE1vZGUgPSBmYWxzZTtcblx0XHR0aGlzLmluT3JwaGFuTW9kZSA9IGZhbHNlO1xuXHRcdHRoaXMuaW5FcnJvck1vZGUgPSBmYWxzZTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFFeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsY0FBYyxrQkFBa0IsMEJBQStILDZCQUFvRjtBQUM1UCxTQUF5QixZQUFZLDBCQUEwQjtBQUMvRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlDQUE2RDtBQUN0RSxTQUFTLGNBQWtDLHFCQUF1QyxnQkFBdUMsZUFBZSwwQ0FB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
