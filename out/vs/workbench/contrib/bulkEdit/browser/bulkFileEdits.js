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
import { IFileService, FileSystemProviderCapabilities } from "../../../../platform/files/common/files.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IWorkingCopyFileService } from "../../../services/workingCopy/common/workingCopyFileService.js";
import { UndoRedoElementType, IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { Schemas } from "../../../../base/common/network.js";
class Noop {
  constructor() {
    this.uris = [];
  }
  async perform() {
    return this;
  }
  toString() {
    return "(noop)";
  }
}
class RenameEdit {
  constructor(newUri, oldUri, options) {
    this.newUri = newUri;
    this.oldUri = oldUri;
    this.options = options;
    this.type = "rename";
  }
}
let RenameOperation = class {
  constructor(_edits, _undoRedoInfo, _workingCopyFileService, _fileService) {
    this._edits = _edits;
    this._undoRedoInfo = _undoRedoInfo;
    this._workingCopyFileService = _workingCopyFileService;
    this._fileService = _fileService;
  }
  get uris() {
    return this._edits.flatMap((edit) => [edit.newUri, edit.oldUri]);
  }
  async perform(token) {
    const moves = [];
    const undoes = [];
    for (const edit of this._edits) {
      const skip = edit.options.overwrite === void 0 && edit.options.ignoreIfExists && await this._fileService.exists(edit.newUri);
      if (!skip) {
        moves.push({
          file: { source: edit.oldUri, target: edit.newUri },
          overwrite: edit.options.overwrite
        });
        undoes.push(new RenameEdit(edit.oldUri, edit.newUri, edit.options));
      }
    }
    if (moves.length === 0) {
      return new Noop();
    }
    await this._workingCopyFileService.move(moves, token, this._undoRedoInfo);
    return new RenameOperation(undoes, { isUndoing: true }, this._workingCopyFileService, this._fileService);
  }
  toString() {
    return `(rename ${this._edits.map((edit) => `${edit.oldUri} to ${edit.newUri}`).join(", ")})`;
  }
};
RenameOperation = __decorateClass([
  __decorateParam(2, IWorkingCopyFileService),
  __decorateParam(3, IFileService)
], RenameOperation);
class CopyEdit {
  constructor(newUri, oldUri, options) {
    this.newUri = newUri;
    this.oldUri = oldUri;
    this.options = options;
    this.type = "copy";
  }
}
let CopyOperation = class {
  constructor(_edits, _undoRedoInfo, _workingCopyFileService, _fileService, _instaService) {
    this._edits = _edits;
    this._undoRedoInfo = _undoRedoInfo;
    this._workingCopyFileService = _workingCopyFileService;
    this._fileService = _fileService;
    this._instaService = _instaService;
  }
  get uris() {
    return this._edits.flatMap((edit) => [edit.newUri, edit.oldUri]);
  }
  async perform(token) {
    const copies = [];
    for (const edit of this._edits) {
      const skip = edit.options.overwrite === void 0 && edit.options.ignoreIfExists && await this._fileService.exists(edit.newUri);
      if (!skip) {
        copies.push({ file: { source: edit.oldUri, target: edit.newUri }, overwrite: edit.options.overwrite });
      }
    }
    if (copies.length === 0) {
      return new Noop();
    }
    const stats = await this._workingCopyFileService.copy(copies, token, this._undoRedoInfo);
    const undoes = [];
    for (let i = 0; i < stats.length; i++) {
      const stat = stats[i];
      const edit = this._edits[i];
      undoes.push(new DeleteEdit(stat.resource, { recursive: true, folder: this._edits[i].options.folder || stat.isDirectory, ...edit.options }, false));
    }
    return this._instaService.createInstance(DeleteOperation, undoes, { isUndoing: true });
  }
  toString() {
    return `(copy ${this._edits.map((edit) => `${edit.oldUri} to ${edit.newUri}`).join(", ")})`;
  }
};
CopyOperation = __decorateClass([
  __decorateParam(2, IWorkingCopyFileService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IInstantiationService)
], CopyOperation);
class CreateEdit {
  constructor(newUri, options, contents) {
    this.newUri = newUri;
    this.options = options;
    this.contents = contents;
    this.type = "create";
  }
}
let CreateOperation = class {
  constructor(_edits, _undoRedoInfo, _fileService, _workingCopyFileService, _instaService, _textFileService) {
    this._edits = _edits;
    this._undoRedoInfo = _undoRedoInfo;
    this._fileService = _fileService;
    this._workingCopyFileService = _workingCopyFileService;
    this._instaService = _instaService;
    this._textFileService = _textFileService;
  }
  get uris() {
    return this._edits.map((edit) => edit.newUri);
  }
  async perform(token) {
    const folderCreates = [];
    const fileCreates = [];
    const undoes = [];
    for (const edit of this._edits) {
      if (edit.newUri.scheme === Schemas.untitled) {
        continue;
      }
      if (edit.options.overwrite === void 0 && edit.options.ignoreIfExists && await this._fileService.exists(edit.newUri)) {
        continue;
      }
      if (edit.options.folder) {
        folderCreates.push({ resource: edit.newUri });
      } else {
        const encodedReadable = typeof edit.contents !== "undefined" ? edit.contents : await this._textFileService.getEncodedReadable(edit.newUri);
        fileCreates.push({ resource: edit.newUri, contents: encodedReadable, overwrite: edit.options.overwrite });
      }
      undoes.push(new DeleteEdit(edit.newUri, edit.options, !edit.options.folder && !edit.contents));
    }
    if (folderCreates.length === 0 && fileCreates.length === 0) {
      return new Noop();
    }
    await this._workingCopyFileService.createFolder(folderCreates, token, this._undoRedoInfo);
    await this._workingCopyFileService.create(fileCreates, token, this._undoRedoInfo);
    return this._instaService.createInstance(DeleteOperation, undoes, { isUndoing: true });
  }
  toString() {
    return `(create ${this._edits.map((edit) => edit.options.folder ? `folder ${edit.newUri}` : `file ${edit.newUri} with ${edit.contents?.byteLength || 0} bytes`).join(", ")})`;
  }
};
CreateOperation = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, IWorkingCopyFileService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ITextFileService)
], CreateOperation);
class DeleteEdit {
  constructor(oldUri, options, undoesCreate) {
    this.oldUri = oldUri;
    this.options = options;
    this.undoesCreate = undoesCreate;
    this.type = "delete";
  }
}
let DeleteOperation = class {
  constructor(_edits, _undoRedoInfo, _workingCopyFileService, _fileService, _configurationService, _instaService, _logService) {
    this._edits = _edits;
    this._undoRedoInfo = _undoRedoInfo;
    this._workingCopyFileService = _workingCopyFileService;
    this._fileService = _fileService;
    this._configurationService = _configurationService;
    this._instaService = _instaService;
    this._logService = _logService;
  }
  get uris() {
    return this._edits.map((edit) => edit.oldUri);
  }
  async perform(token) {
    const deletes = [];
    const undoes = [];
    for (const edit of this._edits) {
      let fileStat;
      try {
        fileStat = await this._fileService.resolve(edit.oldUri, { resolveMetadata: true });
      } catch (err) {
        if (!edit.options.ignoreIfNotExists) {
          throw new Error(`${edit.oldUri} does not exist and can not be deleted`);
        }
        continue;
      }
      deletes.push({
        resource: edit.oldUri,
        recursive: edit.options.recursive,
        useTrash: !edit.options.skipTrashBin && this._fileService.hasCapability(edit.oldUri, FileSystemProviderCapabilities.Trash) && this._configurationService.getValue("files.enableTrash")
      });
      let fileContent;
      let fileContentExceedsMaxSize = false;
      if (!edit.undoesCreate && !edit.options.folder) {
        fileContentExceedsMaxSize = typeof edit.options.maxSize === "number" && fileStat.size > edit.options.maxSize;
        if (!fileContentExceedsMaxSize) {
          try {
            fileContent = await this._fileService.readFile(edit.oldUri);
          } catch (err) {
            this._logService.error(err);
          }
        }
      }
      if (!fileContentExceedsMaxSize) {
        undoes.push(new CreateEdit(edit.oldUri, edit.options, fileContent?.value));
      }
    }
    if (deletes.length === 0) {
      return new Noop();
    }
    await this._workingCopyFileService.delete(deletes, token, this._undoRedoInfo);
    if (undoes.length === 0) {
      return new Noop();
    }
    return this._instaService.createInstance(CreateOperation, undoes, { isUndoing: true });
  }
  toString() {
    return `(delete ${this._edits.map((edit) => edit.oldUri).join(", ")})`;
  }
};
DeleteOperation = __decorateClass([
  __decorateParam(2, IWorkingCopyFileService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILogService)
], DeleteOperation);
class FileUndoRedoElement {
  constructor(label, code, operations, confirmBeforeUndo) {
    this.label = label;
    this.code = code;
    this.operations = operations;
    this.confirmBeforeUndo = confirmBeforeUndo;
    this.type = UndoRedoElementType.Workspace;
    this.resources = operations.flatMap((op) => op.uris);
  }
  async undo() {
    await this._reverse();
  }
  async redo() {
    await this._reverse();
  }
  async _reverse() {
    for (let i = 0; i < this.operations.length; i++) {
      const op = this.operations[i];
      const undo = await op.perform(CancellationToken.None);
      this.operations[i] = undo;
    }
  }
  toString() {
    return this.operations.map((op) => String(op)).join(", ");
  }
}
let BulkFileEdits = class {
  constructor(_label, _code, _undoRedoGroup, _undoRedoSource, _confirmBeforeUndo, _progress, _token, _edits, _instaService, _undoRedoService) {
    this._label = _label;
    this._code = _code;
    this._undoRedoGroup = _undoRedoGroup;
    this._undoRedoSource = _undoRedoSource;
    this._confirmBeforeUndo = _confirmBeforeUndo;
    this._progress = _progress;
    this._token = _token;
    this._edits = _edits;
    this._instaService = _instaService;
    this._undoRedoService = _undoRedoService;
  }
  async apply() {
    const undoOperations = [];
    const undoRedoInfo = { undoRedoGroupId: this._undoRedoGroup.id };
    const edits = [];
    for (const edit of this._edits) {
      if (edit.newResource && edit.oldResource && !edit.options?.copy) {
        edits.push(new RenameEdit(edit.newResource, edit.oldResource, edit.options ?? {}));
      } else if (edit.newResource && edit.oldResource && edit.options?.copy) {
        edits.push(new CopyEdit(edit.newResource, edit.oldResource, edit.options ?? {}));
      } else if (!edit.newResource && edit.oldResource) {
        edits.push(new DeleteEdit(edit.oldResource, edit.options ?? {}, false));
      } else if (edit.newResource && !edit.oldResource) {
        edits.push(new CreateEdit(edit.newResource, edit.options ?? {}, await edit.options.contents));
      }
    }
    if (edits.length === 0) {
      return [];
    }
    const groups = [];
    groups[0] = [edits[0]];
    for (let i = 1; i < edits.length; i++) {
      const edit = edits[i];
      const lastGroup = groups.at(-1);
      if (lastGroup?.[0].type === edit.type) {
        lastGroup.push(edit);
      } else {
        groups.push([edit]);
      }
    }
    for (const group of groups) {
      if (this._token.isCancellationRequested) {
        break;
      }
      let op;
      switch (group[0].type) {
        case "rename":
          op = this._instaService.createInstance(RenameOperation, group, undoRedoInfo);
          break;
        case "copy":
          op = this._instaService.createInstance(CopyOperation, group, undoRedoInfo);
          break;
        case "delete":
          op = this._instaService.createInstance(DeleteOperation, group, undoRedoInfo);
          break;
        case "create":
          op = this._instaService.createInstance(CreateOperation, group, undoRedoInfo);
          break;
      }
      if (op) {
        const undoOp = await op.perform(this._token);
        undoOperations.push(undoOp);
      }
      this._progress.report(void 0);
    }
    const undoRedoElement = new FileUndoRedoElement(this._label, this._code, undoOperations, this._confirmBeforeUndo);
    this._undoRedoService.pushElement(undoRedoElement, this._undoRedoGroup, this._undoRedoSource);
    return undoRedoElement.resources;
  }
};
BulkFileEdits = __decorateClass([
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IUndoRedoService)
], BulkFileEdits);
export {
  BulkFileEdits
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2J1bGtFZGl0L2Jyb3dzZXIvYnVsa0ZpbGVFZGl0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblxuaW1wb3J0IHsgV29ya3NwYWNlRmlsZUVkaXRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMsIElGaWxlQ29udGVudCwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLCBJRmlsZU9wZXJhdGlvblVuZG9SZWRvSW5mbywgSU1vdmVPcGVyYXRpb24sIElDb3B5T3BlcmF0aW9uLCBJRGVsZXRlT3BlcmF0aW9uLCBJQ3JlYXRlT3BlcmF0aW9uLCBJQ3JlYXRlRmlsZU9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VVbmRvUmVkb0VsZW1lbnQsIFVuZG9SZWRvRWxlbWVudFR5cGUsIElVbmRvUmVkb1NlcnZpY2UsIFVuZG9SZWRvR3JvdXAsIFVuZG9SZWRvU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VGaWxlRWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5cbmludGVyZmFjZSBJRmlsZU9wZXJhdGlvbiB7XG5cdHVyaXM6IFVSSVtdO1xuXHRwZXJmb3JtKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUZpbGVPcGVyYXRpb24+O1xufVxuXG5jbGFzcyBOb29wIGltcGxlbWVudHMgSUZpbGVPcGVyYXRpb24ge1xuXHRyZWFkb25seSB1cmlzID0gW107XG5cdGFzeW5jIHBlcmZvcm0oKSB7IHJldHVybiB0aGlzOyB9XG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICcobm9vcCknO1xuXHR9XG59XG5cbmNsYXNzIFJlbmFtZUVkaXQge1xuXHRyZWFkb25seSB0eXBlID0gJ3JlbmFtZSc7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG5ld1VyaTogVVJJLFxuXHRcdHJlYWRvbmx5IG9sZFVyaTogVVJJLFxuXHRcdHJlYWRvbmx5IG9wdGlvbnM6IFdvcmtzcGFjZUZpbGVFZGl0T3B0aW9uc1xuXHQpIHsgfVxufVxuXG5jbGFzcyBSZW5hbWVPcGVyYXRpb24gaW1wbGVtZW50cyBJRmlsZU9wZXJhdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdHM6IFJlbmFtZUVkaXRbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb0luZm86IElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvLFxuXHRcdEBJV29ya2luZ0NvcHlGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3JraW5nQ29weUZpbGVTZXJ2aWNlOiBJV29ya2luZ0NvcHlGaWxlU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Z2V0IHVyaXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRzLmZsYXRNYXAoZWRpdCA9PiBbZWRpdC5uZXdVcmksIGVkaXQub2xkVXJpXSk7XG5cdH1cblxuXHRhc3luYyBwZXJmb3JtKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUZpbGVPcGVyYXRpb24+IHtcblxuXHRcdGNvbnN0IG1vdmVzOiBJTW92ZU9wZXJhdGlvbltdID0gW107XG5cdFx0Y29uc3QgdW5kb2VzOiBSZW5hbWVFZGl0W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgdGhpcy5fZWRpdHMpIHtcblx0XHRcdC8vIGNoZWNrOiBub3Qgb3ZlcndyaXRpbmcsIGJ1dCBpZ25vcmluZywgYW5kIHRoZSB0YXJnZXQgZmlsZSBleGlzdHNcblx0XHRcdGNvbnN0IHNraXAgPSBlZGl0Lm9wdGlvbnMub3ZlcndyaXRlID09PSB1bmRlZmluZWQgJiYgZWRpdC5vcHRpb25zLmlnbm9yZUlmRXhpc3RzICYmIGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhlZGl0Lm5ld1VyaSk7XG5cdFx0XHRpZiAoIXNraXApIHtcblx0XHRcdFx0bW92ZXMucHVzaCh7XG5cdFx0XHRcdFx0ZmlsZTogeyBzb3VyY2U6IGVkaXQub2xkVXJpLCB0YXJnZXQ6IGVkaXQubmV3VXJpIH0sXG5cdFx0XHRcdFx0b3ZlcndyaXRlOiBlZGl0Lm9wdGlvbnMub3ZlcndyaXRlXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIHJldmVyc2UgZWRpdFxuXHRcdFx0XHR1bmRvZXMucHVzaChuZXcgUmVuYW1lRWRpdChlZGl0Lm9sZFVyaSwgZWRpdC5uZXdVcmksIGVkaXQub3B0aW9ucykpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChtb3Zlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBuZXcgTm9vcCgpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UubW92ZShtb3ZlcywgdG9rZW4sIHRoaXMuX3VuZG9SZWRvSW5mbyk7XG5cdFx0cmV0dXJuIG5ldyBSZW5hbWVPcGVyYXRpb24odW5kb2VzLCB7IGlzVW5kb2luZzogdHJ1ZSB9LCB0aGlzLl93b3JraW5nQ29weUZpbGVTZXJ2aWNlLCB0aGlzLl9maWxlU2VydmljZSk7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgKHJlbmFtZSAke3RoaXMuX2VkaXRzLm1hcChlZGl0ID0+IGAke2VkaXQub2xkVXJpfSB0byAke2VkaXQubmV3VXJpfWApLmpvaW4oJywgJyl9KWA7XG5cdH1cbn1cblxuY2xhc3MgQ29weUVkaXQge1xuXHRyZWFkb25seSB0eXBlID0gJ2NvcHknO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBuZXdVcmk6IFVSSSxcblx0XHRyZWFkb25seSBvbGRVcmk6IFVSSSxcblx0XHRyZWFkb25seSBvcHRpb25zOiBXb3Jrc3BhY2VGaWxlRWRpdE9wdGlvbnNcblx0KSB7IH1cbn1cblxuY2xhc3MgQ29weU9wZXJhdGlvbiBpbXBsZW1lbnRzIElGaWxlT3BlcmF0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0czogQ29weUVkaXRbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb0luZm86IElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvLFxuXHRcdEBJV29ya2luZ0NvcHlGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3JraW5nQ29weUZpbGVTZXJ2aWNlOiBJV29ya2luZ0NvcHlGaWxlU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHsgfVxuXG5cdGdldCB1cmlzKCkge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0cy5mbGF0TWFwKGVkaXQgPT4gW2VkaXQubmV3VXJpLCBlZGl0Lm9sZFVyaV0pO1xuXHR9XG5cblx0YXN5bmMgcGVyZm9ybSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElGaWxlT3BlcmF0aW9uPiB7XG5cblx0XHQvLyAoMSkgY3JlYXRlIGNvcHkgb3BlcmF0aW9ucywgcmVtb3ZlIG5vb3BzXG5cdFx0Y29uc3QgY29waWVzOiBJQ29weU9wZXJhdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRoaXMuX2VkaXRzKSB7XG5cdFx0XHQvL2NoZWNrOiBub3Qgb3ZlcndyaXRpbmcsIGJ1dCBpZ25vcmluZywgYW5kIHRoZSB0YXJnZXQgZmlsZSBleGlzdHNcblx0XHRcdGNvbnN0IHNraXAgPSBlZGl0Lm9wdGlvbnMub3ZlcndyaXRlID09PSB1bmRlZmluZWQgJiYgZWRpdC5vcHRpb25zLmlnbm9yZUlmRXhpc3RzICYmIGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhlZGl0Lm5ld1VyaSk7XG5cdFx0XHRpZiAoIXNraXApIHtcblx0XHRcdFx0Y29waWVzLnB1c2goeyBmaWxlOiB7IHNvdXJjZTogZWRpdC5vbGRVcmksIHRhcmdldDogZWRpdC5uZXdVcmkgfSwgb3ZlcndyaXRlOiBlZGl0Lm9wdGlvbnMub3ZlcndyaXRlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjb3BpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE5vb3AoKTtcblx0XHR9XG5cblx0XHQvLyAoMikgcGVyZm9ybSB0aGUgYWN0dWFsIGNvcHkgYW5kIHVzZSB0aGUgcmV0dXJuIHN0YXRzIHRvIGJ1aWxkIHVuZG8gZWRpdHNcblx0XHRjb25zdCBzdGF0cyA9IGF3YWl0IHRoaXMuX3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuY29weShjb3BpZXMsIHRva2VuLCB0aGlzLl91bmRvUmVkb0luZm8pO1xuXHRcdGNvbnN0IHVuZG9lczogRGVsZXRlRWRpdFtdID0gW107XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHN0YXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBzdGF0ID0gc3RhdHNbaV07XG5cdFx0XHRjb25zdCBlZGl0ID0gdGhpcy5fZWRpdHNbaV07XG5cdFx0XHR1bmRvZXMucHVzaChuZXcgRGVsZXRlRWRpdChzdGF0LnJlc291cmNlLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9sZGVyOiB0aGlzLl9lZGl0c1tpXS5vcHRpb25zLmZvbGRlciB8fCBzdGF0LmlzRGlyZWN0b3J5LCAuLi5lZGl0Lm9wdGlvbnMgfSwgZmFsc2UpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlbGV0ZU9wZXJhdGlvbiwgdW5kb2VzLCB7IGlzVW5kb2luZzogdHJ1ZSB9KTtcblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAoY29weSAke3RoaXMuX2VkaXRzLm1hcChlZGl0ID0+IGAke2VkaXQub2xkVXJpfSB0byAke2VkaXQubmV3VXJpfWApLmpvaW4oJywgJyl9KWA7XG5cdH1cbn1cblxuY2xhc3MgQ3JlYXRlRWRpdCB7XG5cdHJlYWRvbmx5IHR5cGUgPSAnY3JlYXRlJztcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbmV3VXJpOiBVUkksXG5cdFx0cmVhZG9ubHkgb3B0aW9uczogV29ya3NwYWNlRmlsZUVkaXRPcHRpb25zLFxuXHRcdHJlYWRvbmx5IGNvbnRlbnRzOiBWU0J1ZmZlciB8IHVuZGVmaW5lZCxcblx0KSB7IH1cbn1cblxuY2xhc3MgQ3JlYXRlT3BlcmF0aW9uIGltcGxlbWVudHMgSUZpbGVPcGVyYXRpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRzOiBDcmVhdGVFZGl0W10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdW5kb1JlZG9JbmZvOiBJRmlsZU9wZXJhdGlvblVuZG9SZWRvSW5mbyxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtpbmdDb3B5RmlsZVNlcnZpY2U6IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlXG5cdCkgeyB9XG5cblx0Z2V0IHVyaXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRzLm1hcChlZGl0ID0+IGVkaXQubmV3VXJpKTtcblx0fVxuXG5cdGFzeW5jIHBlcmZvcm0odG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRmlsZU9wZXJhdGlvbj4ge1xuXG5cdFx0Y29uc3QgZm9sZGVyQ3JlYXRlczogSUNyZWF0ZU9wZXJhdGlvbltdID0gW107XG5cdFx0Y29uc3QgZmlsZUNyZWF0ZXM6IElDcmVhdGVGaWxlT3BlcmF0aW9uW10gPSBbXTtcblx0XHRjb25zdCB1bmRvZXM6IERlbGV0ZUVkaXRbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRoaXMuX2VkaXRzKSB7XG5cdFx0XHRpZiAoZWRpdC5uZXdVcmkuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBpZ25vcmUsIHdpbGwgYmUgaGFuZGxlZCBieSBhIGxhdGVyIGVkaXRcblx0XHRcdH1cblx0XHRcdGlmIChlZGl0Lm9wdGlvbnMub3ZlcndyaXRlID09PSB1bmRlZmluZWQgJiYgZWRpdC5vcHRpb25zLmlnbm9yZUlmRXhpc3RzICYmIGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhlZGl0Lm5ld1VyaSkpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIG5vdCBvdmVyd3JpdGluZywgYnV0IGlnbm9yaW5nLCBhbmQgdGhlIHRhcmdldCBmaWxlIGV4aXN0c1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVkaXQub3B0aW9ucy5mb2xkZXIpIHtcblx0XHRcdFx0Zm9sZGVyQ3JlYXRlcy5wdXNoKHsgcmVzb3VyY2U6IGVkaXQubmV3VXJpIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gSWYgdGhlIGNvbnRlbnRzIGFyZSBwYXJ0IG9mIHRoZSBlZGl0IHRoZXkgaW5jbHVkZSB0aGUgZW5jb2RpbmcsIHRodXMgdXNlIHRoZW0uIE90aGVyd2lzZSBnZXQgdGhlIGVuY29kaW5nIGZvciBhIG5ldyBlbXB0eSBmaWxlLlxuXHRcdFx0XHRjb25zdCBlbmNvZGVkUmVhZGFibGUgPSB0eXBlb2YgZWRpdC5jb250ZW50cyAhPT0gJ3VuZGVmaW5lZCcgPyBlZGl0LmNvbnRlbnRzIDogYXdhaXQgdGhpcy5fdGV4dEZpbGVTZXJ2aWNlLmdldEVuY29kZWRSZWFkYWJsZShlZGl0Lm5ld1VyaSk7XG5cdFx0XHRcdGZpbGVDcmVhdGVzLnB1c2goeyByZXNvdXJjZTogZWRpdC5uZXdVcmksIGNvbnRlbnRzOiBlbmNvZGVkUmVhZGFibGUsIG92ZXJ3cml0ZTogZWRpdC5vcHRpb25zLm92ZXJ3cml0ZSB9KTtcblx0XHRcdH1cblx0XHRcdHVuZG9lcy5wdXNoKG5ldyBEZWxldGVFZGl0KGVkaXQubmV3VXJpLCBlZGl0Lm9wdGlvbnMsICFlZGl0Lm9wdGlvbnMuZm9sZGVyICYmICFlZGl0LmNvbnRlbnRzKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGZvbGRlckNyZWF0ZXMubGVuZ3RoID09PSAwICYmIGZpbGVDcmVhdGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG5ldyBOb29wKCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fd29ya2luZ0NvcHlGaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoZm9sZGVyQ3JlYXRlcywgdG9rZW4sIHRoaXMuX3VuZG9SZWRvSW5mbyk7XG5cdFx0YXdhaXQgdGhpcy5fd29ya2luZ0NvcHlGaWxlU2VydmljZS5jcmVhdGUoZmlsZUNyZWF0ZXMsIHRva2VuLCB0aGlzLl91bmRvUmVkb0luZm8pO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWxldGVPcGVyYXRpb24sIHVuZG9lcywgeyBpc1VuZG9pbmc6IHRydWUgfSk7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgKGNyZWF0ZSAke3RoaXMuX2VkaXRzLm1hcChlZGl0ID0+IGVkaXQub3B0aW9ucy5mb2xkZXIgPyBgZm9sZGVyICR7ZWRpdC5uZXdVcml9YCA6IGBmaWxlICR7ZWRpdC5uZXdVcml9IHdpdGggJHtlZGl0LmNvbnRlbnRzPy5ieXRlTGVuZ3RoIHx8IDB9IGJ5dGVzYCkuam9pbignLCAnKX0pYDtcblx0fVxufVxuXG5jbGFzcyBEZWxldGVFZGl0IHtcblx0cmVhZG9ubHkgdHlwZSA9ICdkZWxldGUnO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBvbGRVcmk6IFVSSSxcblx0XHRyZWFkb25seSBvcHRpb25zOiBXb3Jrc3BhY2VGaWxlRWRpdE9wdGlvbnMsXG5cdFx0cmVhZG9ubHkgdW5kb2VzQ3JlYXRlOiBib29sZWFuLFxuXHQpIHsgfVxufVxuXG5jbGFzcyBEZWxldGVPcGVyYXRpb24gaW1wbGVtZW50cyBJRmlsZU9wZXJhdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfZWRpdHM6IERlbGV0ZUVkaXRbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb0luZm86IElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvLFxuXHRcdEBJV29ya2luZ0NvcHlGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3JraW5nQ29weUZpbGVTZXJ2aWNlOiBJV29ya2luZ0NvcHlGaWxlU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkgeyB9XG5cblx0Z2V0IHVyaXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRzLm1hcChlZGl0ID0+IGVkaXQub2xkVXJpKTtcblx0fVxuXG5cdGFzeW5jIHBlcmZvcm0odG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRmlsZU9wZXJhdGlvbj4ge1xuXHRcdC8vIGRlbGV0ZSBmaWxlXG5cblx0XHRjb25zdCBkZWxldGVzOiBJRGVsZXRlT3BlcmF0aW9uW10gPSBbXTtcblx0XHRjb25zdCB1bmRvZXM6IENyZWF0ZUVkaXRbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRoaXMuX2VkaXRzKSB7XG5cdFx0XHRsZXQgZmlsZVN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZpbGVTdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShlZGl0Lm9sZFVyaSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0aWYgKCFlZGl0Lm9wdGlvbnMuaWdub3JlSWZOb3RFeGlzdHMpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYCR7ZWRpdC5vbGRVcml9IGRvZXMgbm90IGV4aXN0IGFuZCBjYW4gbm90IGJlIGRlbGV0ZWRgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0ZGVsZXRlcy5wdXNoKHtcblx0XHRcdFx0cmVzb3VyY2U6IGVkaXQub2xkVXJpLFxuXHRcdFx0XHRyZWN1cnNpdmU6IGVkaXQub3B0aW9ucy5yZWN1cnNpdmUsXG5cdFx0XHRcdHVzZVRyYXNoOiAhZWRpdC5vcHRpb25zLnNraXBUcmFzaEJpbiAmJiB0aGlzLl9maWxlU2VydmljZS5oYXNDYXBhYmlsaXR5KGVkaXQub2xkVXJpLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuVHJhc2gpICYmIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdmaWxlcy5lbmFibGVUcmFzaCcpXG5cdFx0XHR9KTtcblxuXG5cdFx0XHQvLyByZWFkIGZpbGUgY29udGVudHMgZm9yIHVuZG8gb3BlcmF0aW9uLiB3aGVuIGEgZmlsZSBpcyB0b28gbGFyZ2UgaXQgd29uJ3QgYmUgcmVzdG9yZWRcblx0XHRcdGxldCBmaWxlQ29udGVudDogSUZpbGVDb250ZW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGZpbGVDb250ZW50RXhjZWVkc01heFNpemUgPSBmYWxzZTtcblx0XHRcdGlmICghZWRpdC51bmRvZXNDcmVhdGUgJiYgIWVkaXQub3B0aW9ucy5mb2xkZXIpIHtcblx0XHRcdFx0ZmlsZUNvbnRlbnRFeGNlZWRzTWF4U2l6ZSA9IHR5cGVvZiBlZGl0Lm9wdGlvbnMubWF4U2l6ZSA9PT0gJ251bWJlcicgJiYgZmlsZVN0YXQuc2l6ZSA+IGVkaXQub3B0aW9ucy5tYXhTaXplO1xuXHRcdFx0XHRpZiAoIWZpbGVDb250ZW50RXhjZWVkc01heFNpemUpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0ZmlsZUNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShlZGl0Lm9sZFVyaSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWZpbGVDb250ZW50RXhjZWVkc01heFNpemUpIHtcblx0XHRcdFx0dW5kb2VzLnB1c2gobmV3IENyZWF0ZUVkaXQoZWRpdC5vbGRVcmksIGVkaXQub3B0aW9ucywgZmlsZUNvbnRlbnQ/LnZhbHVlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGRlbGV0ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE5vb3AoKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmRlbGV0ZShkZWxldGVzLCB0b2tlbiwgdGhpcy5fdW5kb1JlZG9JbmZvKTtcblxuXHRcdGlmICh1bmRvZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE5vb3AoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDcmVhdGVPcGVyYXRpb24sIHVuZG9lcywgeyBpc1VuZG9pbmc6IHRydWUgfSk7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgKGRlbGV0ZSAke3RoaXMuX2VkaXRzLm1hcChlZGl0ID0+IGVkaXQub2xkVXJpKS5qb2luKCcsICcpfSlgO1xuXHR9XG59XG5cbmNsYXNzIEZpbGVVbmRvUmVkb0VsZW1lbnQgaW1wbGVtZW50cyBJV29ya3NwYWNlVW5kb1JlZG9FbGVtZW50IHtcblxuXHRyZWFkb25seSB0eXBlID0gVW5kb1JlZG9FbGVtZW50VHlwZS5Xb3Jrc3BhY2U7XG5cblx0cmVhZG9ubHkgcmVzb3VyY2VzOiByZWFkb25seSBVUklbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBsYWJlbDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGNvZGU6IHN0cmluZyxcblx0XHRyZWFkb25seSBvcGVyYXRpb25zOiBJRmlsZU9wZXJhdGlvbltdLFxuXHRcdHJlYWRvbmx5IGNvbmZpcm1CZWZvcmVVbmRvOiBib29sZWFuXG5cdCkge1xuXHRcdHRoaXMucmVzb3VyY2VzID0gb3BlcmF0aW9ucy5mbGF0TWFwKG9wID0+IG9wLnVyaXMpO1xuXHR9XG5cblx0YXN5bmMgdW5kbygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZXZlcnNlKCk7XG5cdH1cblxuXHRhc3luYyByZWRvKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JldmVyc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JldmVyc2UoKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm9wZXJhdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IG9wID0gdGhpcy5vcGVyYXRpb25zW2ldO1xuXHRcdFx0Y29uc3QgdW5kbyA9IGF3YWl0IG9wLnBlcmZvcm0oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHR0aGlzLm9wZXJhdGlvbnNbaV0gPSB1bmRvO1xuXHRcdH1cblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMub3BlcmF0aW9ucy5tYXAob3AgPT4gU3RyaW5nKG9wKSkuam9pbignLCAnKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnVsa0ZpbGVFZGl0cyB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWw6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb2RlOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdW5kb1JlZG9Hcm91cDogVW5kb1JlZG9Hcm91cCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb1NvdXJjZTogVW5kb1JlZG9Tb3VyY2UgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlybUJlZm9yZVVuZG86IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvZ3Jlc3M6IElQcm9ncmVzczx2b2lkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdHM6IFJlc291cmNlRmlsZUVkaXRbXSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVW5kb1JlZG9TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VuZG9SZWRvU2VydmljZTogSVVuZG9SZWRvU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBhcHBseSgpOiBQcm9taXNlPHJlYWRvbmx5IFVSSVtdPiB7XG5cdFx0Y29uc3QgdW5kb09wZXJhdGlvbnM6IElGaWxlT3BlcmF0aW9uW10gPSBbXTtcblx0XHRjb25zdCB1bmRvUmVkb0luZm8gPSB7IHVuZG9SZWRvR3JvdXBJZDogdGhpcy5fdW5kb1JlZG9Hcm91cC5pZCB9O1xuXG5cdFx0Y29uc3QgZWRpdHM6IEFycmF5PFJlbmFtZUVkaXQgfCBDb3B5RWRpdCB8IERlbGV0ZUVkaXQgfCBDcmVhdGVFZGl0PiA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdCBvZiB0aGlzLl9lZGl0cykge1xuXHRcdFx0aWYgKGVkaXQubmV3UmVzb3VyY2UgJiYgZWRpdC5vbGRSZXNvdXJjZSAmJiAhZWRpdC5vcHRpb25zPy5jb3B5KSB7XG5cdFx0XHRcdGVkaXRzLnB1c2gobmV3IFJlbmFtZUVkaXQoZWRpdC5uZXdSZXNvdXJjZSwgZWRpdC5vbGRSZXNvdXJjZSwgZWRpdC5vcHRpb25zID8/IHt9KSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVkaXQubmV3UmVzb3VyY2UgJiYgZWRpdC5vbGRSZXNvdXJjZSAmJiBlZGl0Lm9wdGlvbnM/LmNvcHkpIHtcblx0XHRcdFx0ZWRpdHMucHVzaChuZXcgQ29weUVkaXQoZWRpdC5uZXdSZXNvdXJjZSwgZWRpdC5vbGRSZXNvdXJjZSwgZWRpdC5vcHRpb25zID8/IHt9KSk7XG5cdFx0XHR9IGVsc2UgaWYgKCFlZGl0Lm5ld1Jlc291cmNlICYmIGVkaXQub2xkUmVzb3VyY2UpIHtcblx0XHRcdFx0ZWRpdHMucHVzaChuZXcgRGVsZXRlRWRpdChlZGl0Lm9sZFJlc291cmNlLCBlZGl0Lm9wdGlvbnMgPz8ge30sIGZhbHNlKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVkaXQubmV3UmVzb3VyY2UgJiYgIWVkaXQub2xkUmVzb3VyY2UpIHtcblx0XHRcdFx0ZWRpdHMucHVzaChuZXcgQ3JlYXRlRWRpdChlZGl0Lm5ld1Jlc291cmNlLCBlZGl0Lm9wdGlvbnMgPz8ge30sIGF3YWl0IGVkaXQub3B0aW9ucy5jb250ZW50cykpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBncm91cHM6IEFycmF5PFJlbmFtZUVkaXQgfCBDb3B5RWRpdCB8IERlbGV0ZUVkaXQgfCBDcmVhdGVFZGl0PltdID0gW107XG5cdFx0Z3JvdXBzWzBdID0gW2VkaXRzWzBdXTtcblxuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZWRpdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGVkaXQgPSBlZGl0c1tpXTtcblx0XHRcdGNvbnN0IGxhc3RHcm91cCA9IGdyb3Vwcy5hdCgtMSk7XG5cdFx0XHRpZiAobGFzdEdyb3VwPy5bMF0udHlwZSA9PT0gZWRpdC50eXBlKSB7XG5cdFx0XHRcdGxhc3RHcm91cC5wdXNoKGVkaXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z3JvdXBzLnB1c2goW2VkaXRdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuXG5cdFx0XHRpZiAodGhpcy5fdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBvcDogSUZpbGVPcGVyYXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0XHRzd2l0Y2ggKGdyb3VwWzBdLnR5cGUpIHtcblx0XHRcdFx0Y2FzZSAncmVuYW1lJzpcblx0XHRcdFx0XHRvcCA9IHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW5hbWVPcGVyYXRpb24sIDxSZW5hbWVFZGl0W10+Z3JvdXAsIHVuZG9SZWRvSW5mbyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2NvcHknOlxuXHRcdFx0XHRcdG9wID0gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvcHlPcGVyYXRpb24sIDxDb3B5RWRpdFtdPmdyb3VwLCB1bmRvUmVkb0luZm8pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdkZWxldGUnOlxuXHRcdFx0XHRcdG9wID0gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlbGV0ZU9wZXJhdGlvbiwgPERlbGV0ZUVkaXRbXT5ncm91cCwgdW5kb1JlZG9JbmZvKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnY3JlYXRlJzpcblx0XHRcdFx0XHRvcCA9IHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDcmVhdGVPcGVyYXRpb24sIDxDcmVhdGVFZGl0W10+Z3JvdXAsIHVuZG9SZWRvSW5mbyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvcCkge1xuXHRcdFx0XHRjb25zdCB1bmRvT3AgPSBhd2FpdCBvcC5wZXJmb3JtKHRoaXMuX3Rva2VuKTtcblx0XHRcdFx0dW5kb09wZXJhdGlvbnMucHVzaCh1bmRvT3ApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHJvZ3Jlc3MucmVwb3J0KHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdW5kb1JlZG9FbGVtZW50ID0gbmV3IEZpbGVVbmRvUmVkb0VsZW1lbnQodGhpcy5fbGFiZWwsIHRoaXMuX2NvZGUsIHVuZG9PcGVyYXRpb25zLCB0aGlzLl9jb25maXJtQmVmb3JlVW5kbyk7XG5cdFx0dGhpcy5fdW5kb1JlZG9TZXJ2aWNlLnB1c2hFbGVtZW50KHVuZG9SZWRvRWxlbWVudCwgdGhpcy5fdW5kb1JlZG9Hcm91cCwgdGhpcy5fdW5kb1JlZG9Tb3VyY2UpO1xuXHRcdHJldHVybiB1bmRvUmVkb0VsZW1lbnQucmVzb3VyY2VzO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU9BLFNBQVMsY0FBYyxzQ0FBMkU7QUFFbEcsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywrQkFBcUo7QUFDOUosU0FBb0MscUJBQXFCLHdCQUF1RDtBQUVoSCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUc1QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFPeEIsTUFBTSxLQUErQjtBQUFBLEVBQXJDO0FBQ0MsU0FBUyxPQUFPLENBQUM7QUFBQTtBQUFBLEVBQ2pCLE1BQU0sVUFBVTtBQUFFLFdBQU87QUFBQSxFQUFNO0FBQUEsRUFDL0IsV0FBbUI7QUFDbEIsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLE1BQU0sV0FBVztBQUFBLEVBRWhCLFlBQ1UsUUFDQSxRQUNBLFNBQ1I7QUFIUTtBQUNBO0FBQ0E7QUFKVixTQUFTLE9BQU87QUFBQSxFQUtaO0FBQ0w7QUFFQSxJQUFNLGtCQUFOLE1BQWdEO0FBQUEsRUFFL0MsWUFDa0IsUUFDQSxlQUN5Qix5QkFDWCxjQUM5QjtBQUpnQjtBQUNBO0FBQ3lCO0FBQ1g7QUFBQSxFQUM1QjtBQUFBLEVBRUosSUFBSSxPQUFPO0FBQ1YsV0FBTyxLQUFLLE9BQU8sUUFBUSxVQUFRLENBQUMsS0FBSyxRQUFRLEtBQUssTUFBTSxDQUFDO0FBQUEsRUFDOUQ7QUFBQSxFQUVBLE1BQU0sUUFBUSxPQUFt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
