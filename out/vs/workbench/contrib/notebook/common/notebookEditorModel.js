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
import { streamToBuffer } from "../../../../base/common/buffer.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { assertType, hasKey } from "../../../../base/common/types.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { FileOperationError, FileOperationResult } from "../../../../platform/files/common/files.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { EditorModel } from "../../../common/editor/editorModel.js";
import { NotebookCellsChangeType, NotebookSetting } from "./notebookCommon.js";
import { INotebookLoggingService } from "./notebookLoggingService.js";
import { INotebookService, SimpleNotebookProviderInfo } from "./notebookService.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { StoredFileWorkingCopyState } from "../../../services/workingCopy/common/storedFileWorkingCopy.js";
import { WorkingCopyCapabilities } from "../../../services/workingCopy/common/workingCopy.js";
let SimpleNotebookEditorModel = class extends EditorModel {
  constructor(resource, _hasAssociatedFilePath, viewType, _workingCopyManager, scratchpad, _filesConfigurationService) {
    super();
    this.resource = resource;
    this._hasAssociatedFilePath = _hasAssociatedFilePath;
    this.viewType = viewType;
    this._workingCopyManager = _workingCopyManager;
    this._filesConfigurationService = _filesConfigurationService;
    this._onDidChangeDirty = this._register(new Emitter());
    this._onDidSave = this._register(new Emitter());
    this._onDidChangeOrphaned = this._register(new Emitter());
    this._onDidChangeReadonly = this._register(new Emitter());
    this._onDidRevertUntitled = this._register(new Emitter());
    this.onDidChangeDirty = this._onDidChangeDirty.event;
    this.onDidSave = this._onDidSave.event;
    this.onDidChangeOrphaned = this._onDidChangeOrphaned.event;
    this.onDidChangeReadonly = this._onDidChangeReadonly.event;
    this.onDidRevertUntitled = this._onDidRevertUntitled.event;
    this._workingCopyListeners = this._register(new DisposableStore());
    this.scratchPad = scratchpad;
  }
  dispose() {
    this._workingCopy?.dispose();
    super.dispose();
  }
  get notebook() {
    return this._workingCopy?.model?.notebookModel;
  }
  isResolved() {
    return Boolean(this._workingCopy?.model?.notebookModel);
  }
  async canDispose() {
    if (!this._workingCopy) {
      return true;
    }
    if (SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy)) {
      return this._workingCopyManager.stored.canDispose(this._workingCopy);
    } else {
      return true;
    }
  }
  isDirty() {
    return this._workingCopy?.isDirty() ?? false;
  }
  isModified() {
    return this._workingCopy?.isModified() ?? false;
  }
  isOrphaned() {
    return SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy) && this._workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN);
  }
  hasAssociatedFilePath() {
    return !SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy) && !!this._workingCopy?.hasAssociatedFilePath;
  }
  isReadonly() {
    if (SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy)) {
      return this._workingCopy?.isReadonly();
    } else {
      return this._filesConfigurationService.isReadonly(this.resource);
    }
  }
  get hasErrorState() {
    if (this._workingCopy && hasKey(this._workingCopy, { hasState: true })) {
      return this._workingCopy.hasState(StoredFileWorkingCopyState.ERROR);
    }
    return false;
  }
  async revert(options) {
    assertType(this.isResolved());
    return this._workingCopy.revert(options);
  }
  async save(options) {
    assertType(this.isResolved());
    return this._workingCopy.save(options);
  }
  async load(options) {
    if (!this._workingCopy || !this._workingCopy.model) {
      if (this.resource.scheme === Schemas.untitled) {
        if (this._hasAssociatedFilePath) {
          this._workingCopy = await this._workingCopyManager.resolve({ associatedResource: this.resource });
        } else {
          this._workingCopy = await this._workingCopyManager.resolve({ untitledResource: this.resource, isScratchpad: this.scratchPad });
        }
        this._register(this._workingCopy.onDidRevert(() => this._onDidRevertUntitled.fire()));
      } else {
        this._workingCopy = await this._workingCopyManager.resolve(this.resource, {
          limits: options?.limits,
          reload: options?.forceReadFromFile ? { async: false, force: true } : void 0
        });
        this._workingCopyListeners.add(this._workingCopy.onDidSave((e) => this._onDidSave.fire(e)));
        this._workingCopyListeners.add(this._workingCopy.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire()));
        this._workingCopyListeners.add(this._workingCopy.onDidChangeReadonly(() => this._onDidChangeReadonly.fire()));
      }
      this._workingCopyListeners.add(this._workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(), void 0));
      this._workingCopyListeners.add(this._workingCopy.onWillDispose(() => {
        this._workingCopyListeners.clear();
        this._workingCopy?.model?.dispose();
      }));
    } else {
      await this._workingCopyManager.resolve(this.resource, {
        reload: {
          async: !options?.forceReadFromFile,
          force: options?.forceReadFromFile
        },
        limits: options?.limits
      });
    }
    assertType(this.isResolved());
    return this;
  }
  async saveAs(target) {
    const newWorkingCopy = await this._workingCopyManager.saveAs(this.resource, target);
    if (!newWorkingCopy) {
      return void 0;
    }
    return { resource: newWorkingCopy.resource };
  }
  static _isStoredFileWorkingCopy(candidate) {
    const isUntitled = candidate && candidate.capabilities & WorkingCopyCapabilities.Untitled;
    return !isUntitled;
  }
};
SimpleNotebookEditorModel = __decorateClass([
  __decorateParam(5, IFilesConfigurationService)
], SimpleNotebookEditorModel);
class NotebookFileWorkingCopyModel extends Disposable {
  constructor(_notebookModel, _notebookService, _configurationService, _telemetryService, _notebookLogService) {
    super();
    this._notebookModel = _notebookModel;
    this._notebookService = _notebookService;
    this._configurationService = _configurationService;
    this._telemetryService = _telemetryService;
    this._notebookLogService = _notebookLogService;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this.configuration = void 0;
    this.onWillDispose = _notebookModel.onWillDispose.bind(_notebookModel);
    this._register(_notebookModel.onDidChangeContent((e) => {
      for (const rawEvent of e.rawEvents) {
        if (rawEvent.kind === NotebookCellsChangeType.Initialize) {
          continue;
        }
        if (rawEvent.transient) {
          continue;
        }
        this._onDidChangeContent.fire({
          isRedoing: false,
          //todo@rebornix forward this information from notebook model
          isUndoing: false,
          isInitial: false
          //_notebookModel.cells.length === 0 // todo@jrieken non transient metadata?
        });
        break;
      }
    }));
    const saveWithReducedCommunication = this._configurationService.getValue(NotebookSetting.remoteSaving);
    if (saveWithReducedCommunication || _notebookModel.uri.scheme === Schemas.vscodeRemote) {
      this.configuration = {
        // Intentionally pick a larger delay for triggering backups to allow auto-save
        // to complete first on the optimized save path
        backupDelay: 1e4
      };
    }
    if (saveWithReducedCommunication) {
      this.setSaveDelegate().catch((error) => this._notebookLogService.error("WorkingCopyModel", `Failed to set save delegate: ${error}`));
    }
  }
  async setSaveDelegate() {
    await this.getNotebookSerializer();
    this.save = async (options, token) => {
      try {
        let serializer = this._notebookService.tryGetDataProviderSync(this.notebookModel.viewType)?.serializer;
        if (!serializer) {
          this._notebookLogService.info("WorkingCopyModel", "No serializer found for notebook model, checking if provider still needs to be resolved");
          serializer = await this.getNotebookSerializer().catch((error) => {
            this._notebookLogService.error("WorkingCopyModel", `Failed to get notebook serializer: ${error}`);
            this.save = void 0;
            throw new NotebookSaveError("Failed to get notebook serializer");
          });
        }
        if (token.isCancellationRequested) {
          throw new CancellationError();
        }
        const stat = await serializer.save(this._notebookModel.uri, this._notebookModel.versionId, options, token);
        return stat;
      } catch (error) {
        if (!token.isCancellationRequested && error.name !== "Canceled") {
          const isIPynb = this._notebookModel.viewType === "jupyter-notebook" || this._notebookModel.viewType === "interactive";
          const errorMessage = getSaveErrorMessage(error);
          this._telemetryService.publicLogError2("notebook/SaveError", {
            isRemote: this._notebookModel.uri.scheme === Schemas.vscodeRemote,
            isIPyNbWorkerSerializer: isIPynb && this._configurationService.getValue("ipynb.experimental.serialization"),
            error: errorMessage
          });
        }
        throw error;
      }
    };
  }
  dispose() {
    this._notebookModel.dispose();
    super.dispose();
  }
  get notebookModel() {
    return this._notebookModel;
  }
  async snapshot(context, token) {
    return this._notebookService.createNotebookTextDocumentSnapshot(this._notebookModel.uri, context, token);
  }
  async update(stream, token) {
    const serializer = await this.getNotebookSerializer();
    const bytes = await streamToBuffer(stream);
    const data = await serializer.dataToNotebook(bytes);
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    this._notebookLogService.info("WorkingCopyModel", "Notebook content updated from file system - " + this._notebookModel.uri.toString());
    this._notebookModel.reset(data.cells, data.metadata, serializer.options);
  }
  async getNotebookSerializer() {
    const info = await this._notebookService.withNotebookDataProvider(this.notebookModel.viewType);
    if (!(info instanceof SimpleNotebookProviderInfo)) {
      const message = "CANNOT open notebook with this provider";
      throw new NotebookSaveError(message);
    }
    return info.serializer;
  }
  get versionId() {
    return this._notebookModel.alternativeVersionId;
  }
  pushStackElement() {
    this._notebookModel.pushStackElement();
  }
}
let NotebookFileWorkingCopyModelFactory = class {
  constructor(_viewType, _notebookService, _configurationService, _telemetryService, _notebookLogService) {
    this._viewType = _viewType;
    this._notebookService = _notebookService;
    this._configurationService = _configurationService;
    this._telemetryService = _telemetryService;
    this._notebookLogService = _notebookLogService;
  }
  async createModel(resource, stream, token) {
    const notebookModel = this._notebookService.getNotebookTextModel(resource) ?? await this._notebookService.createNotebookTextModel(this._viewType, resource, stream);
    return new NotebookFileWorkingCopyModel(notebookModel, this._notebookService, this._configurationService, this._telemetryService, this._notebookLogService);
  }
};
NotebookFileWorkingCopyModelFactory = __decorateClass([
  __decorateParam(1, INotebookService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, INotebookLoggingService)
], NotebookFileWorkingCopyModelFactory);
class NotebookSaveError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotebookSaveError";
  }
}
function getSaveErrorMessage(error) {
  if (error.name === "NotebookSaveError") {
    return error.message;
  } else if (error instanceof FileOperationError) {
    switch (error.fileOperationResult) {
      case FileOperationResult.FILE_IS_DIRECTORY:
        return "File is a directory";
      case FileOperationResult.FILE_NOT_FOUND:
        return "File not found";
      case FileOperationResult.FILE_NOT_MODIFIED_SINCE:
        return "File not modified since";
      case FileOperationResult.FILE_MODIFIED_SINCE:
        return "File modified since";
      case FileOperationResult.FILE_MOVE_CONFLICT:
        return "File move conflict";
      case FileOperationResult.FILE_WRITE_LOCKED:
        return "File write locked";
      case FileOperationResult.FILE_PERMISSION_DENIED:
        return "File permission denied";
      case FileOperationResult.FILE_TOO_LARGE:
        return "File too large";
      case FileOperationResult.FILE_INVALID_PATH:
        return "File invalid path";
      case FileOperationResult.FILE_NOT_DIRECTORY:
        return "File not directory";
      case FileOperationResult.FILE_OTHER_ERROR:
        return "File other error";
    }
  }
  return "Unknown error";
}
export {
  NotebookFileWorkingCopyModel,
  NotebookFileWorkingCopyModelFactory,
  SimpleNotebookEditorModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0VkaXRvck1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSwgc3RyZWFtVG9CdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSwgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdyaXRlRmlsZU9wdGlvbnMsIElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVJldmVydE9wdGlvbnMsIElTYXZlT3B0aW9ucywgSVVudHlwZWRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi9tb2RlbC9ub3RlYm9va1RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JNb2RlbCwgSU5vdGVib29rTG9hZE9wdGlvbnMsIElSZXNvbHZlZE5vdGVib29rRWRpdG9yTW9kZWwsIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLCBOb3RlYm9va1NldHRpbmcgfSBmcm9tICcuL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlIH0gZnJvbSAnLi9ub3RlYm9va0xvZ2dpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcmlhbGl6ZXIsIElOb3RlYm9va1NlcnZpY2UsIFNpbXBsZU5vdGVib29rUHJvdmlkZXJJbmZvIH0gZnJvbSAnLi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVXb3JraW5nQ29weU1vZGVsQ29uZmlndXJhdGlvbiwgU25hcHNob3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL2ZpbGVXb3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBJRmlsZVdvcmtpbmdDb3B5TWFuYWdlciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi9maWxlV29ya2luZ0NvcHlNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElTdG9yZWRGaWxlV29ya2luZ0NvcHksIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbCwgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsQ29udGVudENoYW5nZWRFdmVudCwgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsRmFjdG9yeSwgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudCwgU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vc3RvcmVkRmlsZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IElVbnRpdGxlZEZpbGVXb3JraW5nQ29weSwgSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TW9kZWwsIElVbnRpdGxlZEZpbGVXb3JraW5nQ29weU1vZGVsQ29udGVudENoYW5nZWRFdmVudCwgSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3VudGl0bGVkRmlsZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5LmpzJztcblxuLy8jcmVnaW9uIC0tLSBzaW1wbGUgY29udGVudCBwcm92aWRlclxuXG5leHBvcnQgY2xhc3MgU2ltcGxlTm90ZWJvb2tFZGl0b3JNb2RlbCBleHRlbmRzIEVkaXRvck1vZGVsIGltcGxlbWVudHMgSU5vdGVib29rRWRpdG9yTW9kZWwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGlydHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTYXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlT3JwaGFuZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZWFkb25seSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJldmVydFVudGl0bGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEaXJ0eTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZURpcnR5LmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZFNhdmU6IEV2ZW50PElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlRXZlbnQ+ID0gdGhpcy5fb25EaWRTYXZlLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU9ycGhhbmVkOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlT3JwaGFuZWQuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVhZG9ubHk6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5ldmVudDtcblx0cmVhZG9ubHkgb25EaWRSZXZlcnRVbnRpdGxlZDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZFJldmVydFVudGl0bGVkLmV2ZW50O1xuXG5cdHByaXZhdGUgX3dvcmtpbmdDb3B5PzogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsPiB8IElVbnRpdGxlZEZpbGVXb3JraW5nQ29weTxOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsPjtcblx0cHJpdmF0ZSByZWFkb25seSBfd29ya2luZ0NvcHlMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNjcmF0Y2hQYWQ6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYXNBc3NvY2lhdGVkRmlsZVBhdGg6IGJvb2xlYW4sXG5cdFx0cmVhZG9ubHkgdmlld1R5cGU6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93b3JraW5nQ29weU1hbmFnZXI6IElGaWxlV29ya2luZ0NvcHlNYW5hZ2VyPE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWwsIE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWw+LFxuXHRcdHNjcmF0Y2hwYWQ6IGJvb2xlYW4sXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zY3JhdGNoUGFkID0gc2NyYXRjaHBhZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya2luZ0NvcHk/LmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXQgbm90ZWJvb2soKTogTm90ZWJvb2tUZXh0TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93b3JraW5nQ29weT8ubW9kZWw/Lm5vdGVib29rTW9kZWw7XG5cdH1cblxuXHRvdmVycmlkZSBpc1Jlc29sdmVkKCk6IHRoaXMgaXMgSVJlc29sdmVkTm90ZWJvb2tFZGl0b3JNb2RlbCB7XG5cdFx0cmV0dXJuIEJvb2xlYW4odGhpcy5fd29ya2luZ0NvcHk/Lm1vZGVsPy5ub3RlYm9va01vZGVsKTtcblx0fVxuXG5cdGFzeW5jIGNhbkRpc3Bvc2UoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCF0aGlzLl93b3JraW5nQ29weSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKFNpbXBsZU5vdGVib29rRWRpdG9yTW9kZWwuX2lzU3RvcmVkRmlsZVdvcmtpbmdDb3B5KHRoaXMuX3dvcmtpbmdDb3B5KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3dvcmtpbmdDb3B5TWFuYWdlci5zdG9yZWQuY2FuRGlzcG9zZSh0aGlzLl93b3JraW5nQ29weSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdGlzRGlydHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtpbmdDb3B5Py5pc0RpcnR5KCkgPz8gZmFsc2U7XG5cdH1cblxuXHRpc01vZGlmaWVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl93b3JraW5nQ29weT8uaXNNb2RpZmllZCgpID8/IGZhbHNlO1xuXHR9XG5cblx0aXNPcnBoYW5lZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gU2ltcGxlTm90ZWJvb2tFZGl0b3JNb2RlbC5faXNTdG9yZWRGaWxlV29ya2luZ0NvcHkodGhpcy5fd29ya2luZ0NvcHkpICYmIHRoaXMuX3dvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLk9SUEhBTik7XG5cdH1cblxuXHRoYXNBc3NvY2lhdGVkRmlsZVBhdGgoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICFTaW1wbGVOb3RlYm9va0VkaXRvck1vZGVsLl9pc1N0b3JlZEZpbGVXb3JraW5nQ29weSh0aGlzLl93b3JraW5nQ29weSkgJiYgISF0aGlzLl93b3JraW5nQ29weT8uaGFzQXNzb2NpYXRlZEZpbGVQYXRoO1xuXHR9XG5cblx0aXNSZWFkb25seSgpOiBib29sZWFuIHwgSU1hcmtkb3duU3RyaW5nIHtcblx0XHRpZiAoU2ltcGxlTm90ZWJvb2tFZGl0b3JNb2RlbC5faXNTdG9yZWRGaWxlV29ya2luZ0NvcHkodGhpcy5fd29ya2luZ0NvcHkpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya2luZ0NvcHk/LmlzUmVhZG9ubHkoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuaXNSZWFkb25seSh0aGlzLnJlc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgaGFzRXJyb3JTdGF0ZSgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fd29ya2luZ0NvcHkgJiYgaGFzS2V5KHRoaXMuX3dvcmtpbmdDb3B5LCB7IGhhc1N0YXRlOiB0cnVlIH0pKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuRVJST1IpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIHJldmVydChvcHRpb25zPzogSVJldmVydE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhc3NlcnRUeXBlKHRoaXMuaXNSZXNvbHZlZCgpKTtcblx0XHRyZXR1cm4gdGhpcy5fd29ya2luZ0NvcHkhLnJldmVydChvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHNhdmUob3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGFzc2VydFR5cGUodGhpcy5pc1Jlc29sdmVkKCkpO1xuXHRcdHJldHVybiB0aGlzLl93b3JraW5nQ29weSEuc2F2ZShvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIGxvYWQob3B0aW9ucz86IElOb3RlYm9va0xvYWRPcHRpb25zKTogUHJvbWlzZTxJUmVzb2x2ZWROb3RlYm9va0VkaXRvck1vZGVsPiB7XG5cdFx0aWYgKCF0aGlzLl93b3JraW5nQ29weSB8fCAhdGhpcy5fd29ya2luZ0NvcHkubW9kZWwpIHtcblx0XHRcdGlmICh0aGlzLnJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCkge1xuXHRcdFx0XHRpZiAodGhpcy5faGFzQXNzb2NpYXRlZEZpbGVQYXRoKSB7XG5cdFx0XHRcdFx0dGhpcy5fd29ya2luZ0NvcHkgPSBhd2FpdCB0aGlzLl93b3JraW5nQ29weU1hbmFnZXIucmVzb2x2ZSh7IGFzc29jaWF0ZWRSZXNvdXJjZTogdGhpcy5yZXNvdXJjZSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl93b3JraW5nQ29weSA9IGF3YWl0IHRoaXMuX3dvcmtpbmdDb3B5TWFuYWdlci5yZXNvbHZlKHsgdW50aXRsZWRSZXNvdXJjZTogdGhpcy5yZXNvdXJjZSwgaXNTY3JhdGNocGFkOiB0aGlzLnNjcmF0Y2hQYWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd29ya2luZ0NvcHkub25EaWRSZXZlcnQoKCkgPT4gdGhpcy5fb25EaWRSZXZlcnRVbnRpdGxlZC5maXJlKCkpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3dvcmtpbmdDb3B5ID0gYXdhaXQgdGhpcy5fd29ya2luZ0NvcHlNYW5hZ2VyLnJlc29sdmUodGhpcy5yZXNvdXJjZSwge1xuXHRcdFx0XHRcdGxpbWl0czogb3B0aW9ucz8ubGltaXRzLFxuXHRcdFx0XHRcdHJlbG9hZDogb3B0aW9ucz8uZm9yY2VSZWFkRnJvbUZpbGUgPyB7IGFzeW5jOiBmYWxzZSwgZm9yY2U6IHRydWUgfSA6IHVuZGVmaW5lZFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5fd29ya2luZ0NvcHlMaXN0ZW5lcnMuYWRkKHRoaXMuX3dvcmtpbmdDb3B5Lm9uRGlkU2F2ZShlID0+IHRoaXMuX29uRGlkU2F2ZS5maXJlKGUpKSk7XG5cdFx0XHRcdHRoaXMuX3dvcmtpbmdDb3B5TGlzdGVuZXJzLmFkZCh0aGlzLl93b3JraW5nQ29weS5vbkRpZENoYW5nZU9ycGhhbmVkKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlT3JwaGFuZWQuZmlyZSgpKSk7XG5cdFx0XHRcdHRoaXMuX3dvcmtpbmdDb3B5TGlzdGVuZXJzLmFkZCh0aGlzLl93b3JraW5nQ29weS5vbkRpZENoYW5nZVJlYWRvbmx5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlUmVhZG9ubHkuZmlyZSgpKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl93b3JraW5nQ29weUxpc3RlbmVycy5hZGQodGhpcy5fd29ya2luZ0NvcHkub25EaWRDaGFuZ2VEaXJ0eSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZURpcnR5LmZpcmUoKSwgdW5kZWZpbmVkKSk7XG5cblx0XHRcdHRoaXMuX3dvcmtpbmdDb3B5TGlzdGVuZXJzLmFkZCh0aGlzLl93b3JraW5nQ29weS5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fd29ya2luZ0NvcHlMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fd29ya2luZ0NvcHk/Lm1vZGVsPy5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuX3dvcmtpbmdDb3B5TWFuYWdlci5yZXNvbHZlKHRoaXMucmVzb3VyY2UsIHtcblx0XHRcdFx0cmVsb2FkOiB7XG5cdFx0XHRcdFx0YXN5bmM6ICFvcHRpb25zPy5mb3JjZVJlYWRGcm9tRmlsZSxcblx0XHRcdFx0XHRmb3JjZTogb3B0aW9ucz8uZm9yY2VSZWFkRnJvbUZpbGVcblx0XHRcdFx0fSxcblx0XHRcdFx0bGltaXRzOiBvcHRpb25zPy5saW1pdHNcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzc2VydFR5cGUodGhpcy5pc1Jlc29sdmVkKCkpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0YXN5bmMgc2F2ZUFzKHRhcmdldDogVVJJKTogUHJvbWlzZTxJVW50eXBlZEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgbmV3V29ya2luZ0NvcHkgPSBhd2FpdCB0aGlzLl93b3JraW5nQ29weU1hbmFnZXIuc2F2ZUFzKHRoaXMucmVzb3VyY2UsIHRhcmdldCk7XG5cdFx0aWYgKCFuZXdXb3JraW5nQ29weSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gdGhpcyBpcyBhIGxpdHRsZSBoYWNreSBiZWNhdXNlIHdlIGxlYXZlIHRoZSBuZXcgd29ya2luZyBjb3B5IGFsb25lLiBCVVRcblx0XHQvLyB0aGUgbmV3bHkgY3JlYXRlZCBlZGl0b3IgaW5wdXQgd2lsbCBwaWNrIGl0IHVwIGFuZCBjbGFpbSBvd25lcnNoaXAgb2YgaXQuXG5cdFx0cmV0dXJuIHsgcmVzb3VyY2U6IG5ld1dvcmtpbmdDb3B5LnJlc291cmNlIH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaXNTdG9yZWRGaWxlV29ya2luZ0NvcHkoY2FuZGlkYXRlPzogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsPiB8IElVbnRpdGxlZEZpbGVXb3JraW5nQ29weTxOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsPik6IGNhbmRpZGF0ZSBpcyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWw+IHtcblx0XHRjb25zdCBpc1VudGl0bGVkID0gY2FuZGlkYXRlICYmIGNhbmRpZGF0ZS5jYXBhYmlsaXRpZXMgJiBXb3JraW5nQ29weUNhcGFiaWxpdGllcy5VbnRpdGxlZDtcblxuXHRcdHJldHVybiAhaXNVbnRpdGxlZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWwsIElVbnRpdGxlZEZpbGVXb3JraW5nQ29weU1vZGVsIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbnRlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50ICYgSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmV2ZW50O1xuXG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2U6IEV2ZW50PHZvaWQ+O1xuXG5cdHJlYWRvbmx5IGNvbmZpZ3VyYXRpb246IElGaWxlV29ya2luZ0NvcHlNb2RlbENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHNhdmU6ICgob3B0aW9uczogSVdyaXRlRmlsZU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+KSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va01vZGVsOiBOb3RlYm9va1RleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0xvZ1NlcnZpY2U6IElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5vbldpbGxEaXNwb3NlID0gX25vdGVib29rTW9kZWwub25XaWxsRGlzcG9zZS5iaW5kKF9ub3RlYm9va01vZGVsKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKF9ub3RlYm9va01vZGVsLm9uRGlkQ2hhbmdlQ29udGVudChlID0+IHtcblx0XHRcdGZvciAoY29uc3QgcmF3RXZlbnQgb2YgZS5yYXdFdmVudHMpIHtcblx0XHRcdFx0aWYgKHJhd0V2ZW50LmtpbmQgPT09IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkluaXRpYWxpemUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmF3RXZlbnQudHJhbnNpZW50KSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmZpcmUoe1xuXHRcdFx0XHRcdGlzUmVkb2luZzogZmFsc2UsIC8vdG9kb0ByZWJvcm5peCBmb3J3YXJkIHRoaXMgaW5mb3JtYXRpb24gZnJvbSBub3RlYm9vayBtb2RlbFxuXHRcdFx0XHRcdGlzVW5kb2luZzogZmFsc2UsXG5cdFx0XHRcdFx0aXNJbml0aWFsOiBmYWxzZSwgLy9fbm90ZWJvb2tNb2RlbC5jZWxscy5sZW5ndGggPT09IDAgLy8gdG9kb0Bqcmlla2VuIG5vbiB0cmFuc2llbnQgbWV0YWRhdGE/XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzYXZlV2l0aFJlZHVjZWRDb21tdW5pY2F0aW9uID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTm90ZWJvb2tTZXR0aW5nLnJlbW90ZVNhdmluZyk7XG5cblx0XHRpZiAoc2F2ZVdpdGhSZWR1Y2VkQ29tbXVuaWNhdGlvbiB8fCBfbm90ZWJvb2tNb2RlbC51cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZSkge1xuXHRcdFx0dGhpcy5jb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHQvLyBJbnRlbnRpb25hbGx5IHBpY2sgYSBsYXJnZXIgZGVsYXkgZm9yIHRyaWdnZXJpbmcgYmFja3VwcyB0byBhbGxvdyBhdXRvLXNhdmVcblx0XHRcdFx0Ly8gdG8gY29tcGxldGUgZmlyc3Qgb24gdGhlIG9wdGltaXplZCBzYXZlIHBhdGhcblx0XHRcdFx0YmFja3VwRGVsYXk6IDEwMDAwXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIE92ZXJyaWRlIHNhdmUgYmVoYXZpb3IgdG8gYXZvaWQgdHJhbnNmZXJyaW5nIHRoZSBidWZmZXIgYWNyb3NzIHRoZSB3aXJlIDMgdGltZXNcblx0XHRpZiAoc2F2ZVdpdGhSZWR1Y2VkQ29tbXVuaWNhdGlvbikge1xuXHRcdFx0dGhpcy5zZXRTYXZlRGVsZWdhdGUoKS5jYXRjaChlcnJvciA9PiB0aGlzLl9ub3RlYm9va0xvZ1NlcnZpY2UuZXJyb3IoJ1dvcmtpbmdDb3B5TW9kZWwnLCBgRmFpbGVkIHRvIHNldCBzYXZlIGRlbGVnYXRlOiAke2Vycm9yfWApKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNldFNhdmVEZWxlZ2F0ZSgpIHtcblx0XHQvLyBtYWtlIHN1cmUgd2Ugd2FpdCBmb3IgYSBzZXJpYWxpemVyIHRvIHJlc29sdmUgYmVmb3JlIHdlIHRyeSB0byBoYW5kbGUgc2F2ZXMgaW4gdGhlIEVIXG5cdFx0YXdhaXQgdGhpcy5nZXROb3RlYm9va1NlcmlhbGl6ZXIoKTtcblxuXHRcdHRoaXMuc2F2ZSA9IGFzeW5jIChvcHRpb25zOiBJV3JpdGVGaWxlT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRsZXQgc2VyaWFsaXplciA9IHRoaXMuX25vdGVib29rU2VydmljZS50cnlHZXREYXRhUHJvdmlkZXJTeW5jKHRoaXMubm90ZWJvb2tNb2RlbC52aWV3VHlwZSk/LnNlcmlhbGl6ZXI7XG5cblx0XHRcdFx0aWYgKCFzZXJpYWxpemVyKSB7XG5cdFx0XHRcdFx0dGhpcy5fbm90ZWJvb2tMb2dTZXJ2aWNlLmluZm8oJ1dvcmtpbmdDb3B5TW9kZWwnLCAnTm8gc2VyaWFsaXplciBmb3VuZCBmb3Igbm90ZWJvb2sgbW9kZWwsIGNoZWNraW5nIGlmIHByb3ZpZGVyIHN0aWxsIG5lZWRzIHRvIGJlIHJlc29sdmVkJyk7XG5cdFx0XHRcdFx0c2VyaWFsaXplciA9IGF3YWl0IHRoaXMuZ2V0Tm90ZWJvb2tTZXJpYWxpemVyKCkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fbm90ZWJvb2tMb2dTZXJ2aWNlLmVycm9yKCdXb3JraW5nQ29weU1vZGVsJywgYEZhaWxlZCB0byBnZXQgbm90ZWJvb2sgc2VyaWFsaXplcjogJHtlcnJvcn1gKTtcblx0XHRcdFx0XHRcdC8vIFRoZSBzZXJpYWxpemVyIHdhcyBzZXQgaW5pdGlhbGx5IGJ1dCBzb21laG93IGlzIG5vIGxvbmdlciBhdmFpbGFibGVcblx0XHRcdFx0XHRcdHRoaXMuc2F2ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBOb3RlYm9va1NhdmVFcnJvcignRmFpbGVkIHRvIGdldCBub3RlYm9vayBzZXJpYWxpemVyJyk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBzZXJpYWxpemVyLnNhdmUodGhpcy5fbm90ZWJvb2tNb2RlbC51cmksIHRoaXMuX25vdGVib29rTW9kZWwudmVyc2lvbklkLCBvcHRpb25zLCB0b2tlbik7XG5cdFx0XHRcdHJldHVybiBzdGF0O1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCAmJiBlcnJvci5uYW1lICE9PSAnQ2FuY2VsZWQnKSB7XG5cdFx0XHRcdFx0dHlwZSBub3RlYm9va1NhdmVFcnJvckRhdGEgPSB7XG5cdFx0XHRcdFx0XHRpc1JlbW90ZTogYm9vbGVhbjtcblx0XHRcdFx0XHRcdGlzSVB5TmJXb3JrZXJTZXJpYWxpemVyOiBib29sZWFuO1xuXHRcdFx0XHRcdFx0ZXJyb3I6IHN0cmluZztcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHR5cGUgbm90ZWJvb2tTYXZlRXJyb3JDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRcdG93bmVyOiAnYW11bmdlcic7XG5cdFx0XHRcdFx0XHRjb21tZW50OiAnRGV0ZWN0IGlmIHdlIGFyZSBoYXZpbmcgaXNzdWVzIHNhdmluZyBhIG5vdGVib29rIG9uIHRoZSBFeHRlbnNpb24gSG9zdCc7XG5cdFx0XHRcdFx0XHRpc1JlbW90ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1doZXRoZXIgdGhlIHNhdmUgaXMgaGFwcGVuaW5nIG9uIGEgcmVtb3RlIGZpbGUgc3lzdGVtJyB9O1xuXHRcdFx0XHRcdFx0aXNJUHlOYldvcmtlclNlcmlhbGl6ZXI6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBJUHluYiBmaWxlcyBhcmUgc2VyaWFsaXplZCBpbiB3b3JrZXJzJyB9O1xuXHRcdFx0XHRcdFx0ZXJyb3I6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdJbmZvIGFib3V0IHRoZSBlcnJvciB0aGF0IG9jY3VycmVkJyB9O1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0Y29uc3QgaXNJUHluYiA9IHRoaXMuX25vdGVib29rTW9kZWwudmlld1R5cGUgPT09ICdqdXB5dGVyLW5vdGVib29rJyB8fCB0aGlzLl9ub3RlYm9va01vZGVsLnZpZXdUeXBlID09PSAnaW50ZXJhY3RpdmUnO1xuXHRcdFx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9IGdldFNhdmVFcnJvck1lc3NhZ2UoZXJyb3IpO1xuXHRcdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nRXJyb3IyPG5vdGVib29rU2F2ZUVycm9yRGF0YSwgbm90ZWJvb2tTYXZlRXJyb3JDbGFzc2lmaWNhdGlvbj4oJ25vdGVib29rL1NhdmVFcnJvcicsIHtcblx0XHRcdFx0XHRcdGlzUmVtb3RlOiB0aGlzLl9ub3RlYm9va01vZGVsLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlLFxuXHRcdFx0XHRcdFx0aXNJUHlOYldvcmtlclNlcmlhbGl6ZXI6IGlzSVB5bmIgJiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2lweW5iLmV4cGVyaW1lbnRhbC5zZXJpYWxpemF0aW9uJyksXG5cdFx0XHRcdFx0XHRlcnJvcjogZXJyb3JNZXNzYWdlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9ub3RlYm9va01vZGVsLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXQgbm90ZWJvb2tNb2RlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2tNb2RlbDtcblx0fVxuXG5cdGFzeW5jIHNuYXBzaG90KGNvbnRleHQ6IFNuYXBzaG90Q29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxWU0J1ZmZlclJlYWRhYmxlU3RyZWFtPiB7XG5cdFx0cmV0dXJuIHRoaXMuX25vdGVib29rU2VydmljZS5jcmVhdGVOb3RlYm9va1RleHREb2N1bWVudFNuYXBzaG90KHRoaXMuX25vdGVib29rTW9kZWwudXJpLCBjb250ZXh0LCB0b2tlbik7XG5cdH1cblxuXHRhc3luYyB1cGRhdGUoc3RyZWFtOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXJpYWxpemVyID0gYXdhaXQgdGhpcy5nZXROb3RlYm9va1NlcmlhbGl6ZXIoKTtcblxuXHRcdGNvbnN0IGJ5dGVzID0gYXdhaXQgc3RyZWFtVG9CdWZmZXIoc3RyZWFtKTtcblx0XHRjb25zdCBkYXRhID0gYXdhaXQgc2VyaWFsaXplci5kYXRhVG9Ob3RlYm9vayhieXRlcyk7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblxuXHRcdHRoaXMuX25vdGVib29rTG9nU2VydmljZS5pbmZvKCdXb3JraW5nQ29weU1vZGVsJywgJ05vdGVib29rIGNvbnRlbnQgdXBkYXRlZCBmcm9tIGZpbGUgc3lzdGVtIC0gJyArIHRoaXMuX25vdGVib29rTW9kZWwudXJpLnRvU3RyaW5nKCkpO1xuXHRcdHRoaXMuX25vdGVib29rTW9kZWwucmVzZXQoZGF0YS5jZWxscywgZGF0YS5tZXRhZGF0YSwgc2VyaWFsaXplci5vcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIGdldE5vdGVib29rU2VyaWFsaXplcigpOiBQcm9taXNlPElOb3RlYm9va1NlcmlhbGl6ZXI+IHtcblx0XHRjb25zdCBpbmZvID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLndpdGhOb3RlYm9va0RhdGFQcm92aWRlcih0aGlzLm5vdGVib29rTW9kZWwudmlld1R5cGUpO1xuXHRcdGlmICghKGluZm8gaW5zdGFuY2VvZiBTaW1wbGVOb3RlYm9va1Byb3ZpZGVySW5mbykpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSAnQ0FOTk9UIG9wZW4gbm90ZWJvb2sgd2l0aCB0aGlzIHByb3ZpZGVyJztcblx0XHRcdHRocm93IG5ldyBOb3RlYm9va1NhdmVFcnJvcihtZXNzYWdlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW5mby5zZXJpYWxpemVyO1xuXHR9XG5cblx0Z2V0IHZlcnNpb25JZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2tNb2RlbC5hbHRlcm5hdGl2ZVZlcnNpb25JZDtcblx0fVxuXG5cdHB1c2hTdGFja0VsZW1lbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fbm90ZWJvb2tNb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5IGltcGxlbWVudHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsRmFjdG9yeTxOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsPiwgSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5PE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWw+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aWV3VHlwZTogc3RyaW5nLFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0xvZ1NlcnZpY2U6IElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlXG5cdCkgeyB9XG5cblx0YXN5bmMgY3JlYXRlTW9kZWwocmVzb3VyY2U6IFVSSSwgc3RyZWFtOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWw+IHtcblxuXHRcdGNvbnN0IG5vdGVib29rTW9kZWwgPSB0aGlzLl9ub3RlYm9va1NlcnZpY2UuZ2V0Tm90ZWJvb2tUZXh0TW9kZWwocmVzb3VyY2UpID8/XG5cdFx0XHRhd2FpdCB0aGlzLl9ub3RlYm9va1NlcnZpY2UuY3JlYXRlTm90ZWJvb2tUZXh0TW9kZWwodGhpcy5fdmlld1R5cGUsIHJlc291cmNlLCBzdHJlYW0pO1xuXG5cdFx0cmV0dXJuIG5ldyBOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsKG5vdGVib29rTW9kZWwsIHRoaXMuX25vdGVib29rU2VydmljZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIHRoaXMuX25vdGVib29rTG9nU2VydmljZSk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbmNsYXNzIE5vdGVib29rU2F2ZUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRjb25zdHJ1Y3RvcihtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHRzdXBlcihtZXNzYWdlKTtcblx0XHR0aGlzLm5hbWUgPSAnTm90ZWJvb2tTYXZlRXJyb3InO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFNhdmVFcnJvck1lc3NhZ2UoZXJyb3I6IEVycm9yKTogc3RyaW5nIHtcblx0aWYgKGVycm9yLm5hbWUgPT09ICdOb3RlYm9va1NhdmVFcnJvcicpIHtcblx0XHRyZXR1cm4gZXJyb3IubWVzc2FnZTtcblx0fSBlbHNlIGlmIChlcnJvciBpbnN0YW5jZW9mIEZpbGVPcGVyYXRpb25FcnJvcikge1xuXHRcdHN3aXRjaCAoZXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCkge1xuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfSVNfRElSRUNUT1JZOlxuXHRcdFx0XHRyZXR1cm4gJ0ZpbGUgaXMgYSBkaXJlY3RvcnknO1xuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EOlxuXHRcdFx0XHRyZXR1cm4gJ0ZpbGUgbm90IGZvdW5kJztcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9NT0RJRklFRF9TSU5DRTpcblx0XHRcdFx0cmV0dXJuICdGaWxlIG5vdCBtb2RpZmllZCBzaW5jZSc7XG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT0RJRklFRF9TSU5DRTpcblx0XHRcdFx0cmV0dXJuICdGaWxlIG1vZGlmaWVkIHNpbmNlJztcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PVkVfQ09ORkxJQ1Q6XG5cdFx0XHRcdHJldHVybiAnRmlsZSBtb3ZlIGNvbmZsaWN0Jztcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1dSSVRFX0xPQ0tFRDpcblx0XHRcdFx0cmV0dXJuICdGaWxlIHdyaXRlIGxvY2tlZCc7XG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9QRVJNSVNTSU9OX0RFTklFRDpcblx0XHRcdFx0cmV0dXJuICdGaWxlIHBlcm1pc3Npb24gZGVuaWVkJztcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1RPT19MQVJHRTpcblx0XHRcdFx0cmV0dXJuICdGaWxlIHRvbyBsYXJnZSc7XG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9JTlZBTElEX1BBVEg6XG5cdFx0XHRcdHJldHVybiAnRmlsZSBpbnZhbGlkIHBhdGgnO1xuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0RJUkVDVE9SWTpcblx0XHRcdFx0cmV0dXJuICdGaWxlIG5vdCBkaXJlY3RvcnknO1xuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfT1RIRVJfRVJST1I6XG5cdFx0XHRcdHJldHVybiAnRmlsZSBvdGhlciBlcnJvcic7XG5cdFx0fVxuXHR9XG5cdHJldHVybiAnVW5rbm93biBlcnJvcic7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQWlDLHNCQUFzQjtBQUV2RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBRS9CLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxjQUFjO0FBRW5DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQW1ELG9CQUFvQiwyQkFBMkI7QUFDbEcsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxtQkFBbUI7QUFFNUIsU0FBbUYseUJBQXlCLHVCQUF1QjtBQUNuSSxTQUFTLCtCQUErQjtBQUN4QyxTQUE4QixrQkFBa0Isa0NBQWtDO0FBQ2xGLFNBQVMsa0NBQWtDO0FBRzNDLFNBQW1MLGtDQUFrQztBQUVyTixTQUFTLCtCQUErQjtBQUlqQyxJQUFNLDRCQUFOLGNBQXdDLFlBQTRDO0FBQUEsRUFr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
