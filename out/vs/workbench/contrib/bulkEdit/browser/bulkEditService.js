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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { ResourceMap, ResourceSet } from "../../../../base/common/map.js";
import { isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { IBulkEditService, ResourceFileEdit, ResourceTextEdit } from "../../../../editor/browser/services/bulkEditService.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Progress } from "../../../../platform/progress/common/progress.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { UndoRedoGroup } from "../../../../platform/undoRedo/common/undoRedo.js";
import { BulkCellEdits, ResourceNotebookCellEdit } from "./bulkCellEdits.js";
import { BulkFileEdits } from "./bulkFileEdits.js";
import { BulkTextEdits } from "./bulkTextEdits.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ILifecycleService, ShutdownReason } from "../../../services/lifecycle/common/lifecycle.js";
import { IWorkingCopyService } from "../../../services/workingCopy/common/workingCopyService.js";
import { OpaqueEdits, ResourceAttachmentEdit } from "./opaqueEdits.js";
import { isMacintosh } from "../../../../base/common/platform.js";
function liftEdits(edits) {
  return edits.map((edit) => {
    if (ResourceTextEdit.is(edit)) {
      return ResourceTextEdit.lift(edit);
    }
    if (ResourceFileEdit.is(edit)) {
      return ResourceFileEdit.lift(edit);
    }
    if (ResourceNotebookCellEdit.is(edit)) {
      return ResourceNotebookCellEdit.lift(edit);
    }
    if (ResourceAttachmentEdit.is(edit)) {
      return ResourceAttachmentEdit.lift(edit);
    }
    throw new Error("Unsupported edit");
  });
}
let BulkEdit = class {
  constructor(_label, _code, _editor, _progress, _token, _edits, _undoRedoGroup, _undoRedoSource, _confirmBeforeUndo, _instaService, _logService) {
    this._label = _label;
    this._code = _code;
    this._editor = _editor;
    this._progress = _progress;
    this._token = _token;
    this._edits = _edits;
    this._undoRedoGroup = _undoRedoGroup;
    this._undoRedoSource = _undoRedoSource;
    this._confirmBeforeUndo = _confirmBeforeUndo;
    this._instaService = _instaService;
    this._logService = _logService;
  }
  ariaMessage() {
    const otherResources = new ResourceMap();
    const textEditResources = new ResourceMap();
    let textEditCount = 0;
    for (const edit of this._edits) {
      if (edit instanceof ResourceTextEdit) {
        textEditCount += 1;
        textEditResources.set(edit.resource, true);
      } else if (edit instanceof ResourceFileEdit) {
        otherResources.set(edit.oldResource ?? edit.newResource, true);
      }
    }
    if (this._edits.length === 0) {
      return localize("summary.0", "Made no edits");
    } else if (otherResources.size === 0) {
      if (textEditCount > 1 && textEditResources.size > 1) {
        return localize("summary.nm", "Made {0} text edits in {1} files", textEditCount, textEditResources.size);
      } else {
        return localize("summary.n0", "Made {0} text edits in one file", textEditCount);
      }
    } else {
      return localize("summary.textFiles", "Made {0} text edits in {1} files, also created or deleted {2} files", textEditCount, textEditResources.size, otherResources.size);
    }
  }
  async perform(reason) {
    if (this._edits.length === 0) {
      return [];
    }
    const ranges = [1];
    for (let i = 1; i < this._edits.length; i++) {
      if (Object.getPrototypeOf(this._edits[i - 1]) === Object.getPrototypeOf(this._edits[i])) {
        ranges[ranges.length - 1]++;
      } else {
        ranges.push(1);
      }
    }
    const increment = this._edits.length > 1 ? 0 : void 0;
    this._progress.report({ increment, total: 100 });
    const progress = { report: (_) => this._progress.report({ increment: 100 / this._edits.length }) };
    const resources = [];
    let index = 0;
    for (const range of ranges) {
      if (this._token.isCancellationRequested) {
        break;
      }
      const group = this._edits.slice(index, index + range);
      if (group[0] instanceof ResourceFileEdit) {
        resources.push(await this._performFileEdits(group, this._undoRedoGroup, this._undoRedoSource, this._confirmBeforeUndo, progress));
      } else if (group[0] instanceof ResourceTextEdit) {
        resources.push(await this._performTextEdits(group, this._undoRedoGroup, this._undoRedoSource, progress, reason));
      } else if (group[0] instanceof ResourceNotebookCellEdit) {
        resources.push(await this._performCellEdits(group, this._undoRedoGroup, this._undoRedoSource, progress));
      } else if (group[0] instanceof ResourceAttachmentEdit) {
        resources.push(await this._performOpaqueEdits(group, this._undoRedoGroup, this._undoRedoSource, progress));
      } else {
        console.log("UNKNOWN EDIT");
      }
      index = index + range;
    }
    return resources.flat();
  }
  async _performFileEdits(edits, undoRedoGroup, undoRedoSource, confirmBeforeUndo, progress) {
    this._logService.debug("_performFileEdits", JSON.stringify(edits));
    const model = this._instaService.createInstance(BulkFileEdits, this._label || localize("workspaceEdit", "Workspace Edit"), this._code || "undoredo.workspaceEdit", undoRedoGroup, undoRedoSource, confirmBeforeUndo, progress, this._token, edits);
    return await model.apply();
  }
  async _performTextEdits(edits, undoRedoGroup, undoRedoSource, progress, reason) {
    this._logService.debug("_performTextEdits", JSON.stringify(edits));
    const model = this._instaService.createInstance(BulkTextEdits, this._label || localize("workspaceEdit", "Workspace Edit"), this._code || "undoredo.workspaceEdit", this._editor, undoRedoGroup, undoRedoSource, progress, this._token, edits);
    return await model.apply(reason);
  }
  async _performCellEdits(edits, undoRedoGroup, undoRedoSource, progress) {
    this._logService.debug("_performCellEdits", JSON.stringify(edits));
    const model = this._instaService.createInstance(BulkCellEdits, undoRedoGroup, undoRedoSource, progress, this._token, edits);
    return await model.apply();
  }
  async _performOpaqueEdits(edits, undoRedoGroup, undoRedoSource, progress) {
    this._logService.debug("_performOpaqueEdits", JSON.stringify(edits));
    const model = this._instaService.createInstance(OpaqueEdits, undoRedoGroup, undoRedoSource, progress, this._token, edits);
    return await model.apply();
  }
};
BulkEdit = __decorateClass([
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, ILogService)
], BulkEdit);
let BulkEditService = class {
  constructor(_instaService, _logService, _editorService, _lifecycleService, _dialogService, _workingCopyService, _configService) {
    this._instaService = _instaService;
    this._logService = _logService;
    this._editorService = _editorService;
    this._lifecycleService = _lifecycleService;
    this._dialogService = _dialogService;
    this._workingCopyService = _workingCopyService;
    this._configService = _configService;
    this._activeUndoRedoGroups = new LinkedList();
  }
  setPreviewHandler(handler) {
    this._previewHandler = handler;
    return toDisposable(() => {
      if (this._previewHandler === handler) {
        this._previewHandler = void 0;
      }
    });
  }
  hasPreviewHandler() {
    return Boolean(this._previewHandler);
  }
  async apply(editsIn, options) {
    let edits = liftEdits(Array.isArray(editsIn) ? editsIn : editsIn.edits);
    if (edits.length === 0) {
      return { ariaSummary: localize("nothing", "Made no edits"), isApplied: false };
    }
    if (this._previewHandler && (options?.showPreview || edits.some((value) => value.metadata?.needsConfirmation))) {
      edits = await this._previewHandler(edits, options);
    }
    let codeEditor = options?.editor;
    if (!codeEditor) {
      const candidate = this._editorService.activeTextEditorControl;
      if (isCodeEditor(candidate)) {
        codeEditor = candidate;
      } else if (isDiffEditor(candidate)) {
        codeEditor = candidate.getModifiedEditor();
      }
    }
    if (codeEditor && codeEditor.getOption(EditorOption.readOnly)) {
      codeEditor = void 0;
    }
    let undoRedoGroup;
    let undoRedoGroupRemove = () => {
    };
    if (typeof options?.undoRedoGroupId === "number") {
      for (const candidate of this._activeUndoRedoGroups) {
        if (candidate.id === options.undoRedoGroupId) {
          undoRedoGroup = candidate;
          break;
        }
      }
    }
    if (!undoRedoGroup) {
      undoRedoGroup = new UndoRedoGroup();
      undoRedoGroupRemove = this._activeUndoRedoGroups.push(undoRedoGroup);
    }
    const label = options?.quotableLabel || options?.label;
    const bulkEdit = this._instaService.createInstance(
      BulkEdit,
      label,
      options?.code,
      codeEditor,
      options?.progress ?? Progress.None,
      options?.token ?? CancellationToken.None,
      edits,
      undoRedoGroup,
      options?.undoRedoSource,
      !!options?.confirmBeforeUndo
    );
    let listener;
    try {
      listener = this._lifecycleService.onBeforeShutdown((e) => e.veto(this._shouldVeto(label, e.reason), "veto.blukEditService"));
      const resources = await bulkEdit.perform(options?.reason);
      if (options?.respectAutoSaveConfig && this._configService.getValue(autoSaveSetting) === true && resources.length > 1) {
        await this._saveAll(resources);
      }
      return { ariaSummary: bulkEdit.ariaMessage(), isApplied: edits.length > 0 };
    } catch (err) {
      this._logService.error(err);
      throw err;
    } finally {
      listener?.dispose();
      undoRedoGroupRemove();
    }
  }
  async _saveAll(resources) {
    const set = new ResourceSet(resources);
    const saves = this._workingCopyService.dirtyWorkingCopies.map(async (copy) => {
      if (set.has(copy.resource)) {
        await copy.save();
      }
    });
    const result = await Promise.allSettled(saves);
    for (const item of result) {
      if (item.status === "rejected") {
        this._logService.warn(item.reason);
      }
    }
  }
  async _shouldVeto(label, reason) {
    let message;
    switch (reason) {
      case ShutdownReason.CLOSE:
        message = localize("closeTheWindow.message", "Are you sure you want to close the window?");
        break;
      case ShutdownReason.LOAD:
        message = localize("changeWorkspace.message", "Are you sure you want to change the workspace?");
        break;
      case ShutdownReason.RELOAD:
        message = localize("reloadTheWindow.message", "Are you sure you want to reload the window?");
        break;
      default:
        message = isMacintosh ? localize("quitMessageMac", "Are you sure you want to quit?") : localize("quitMessage", "Are you sure you want to exit?");
        break;
    }
    const result = await this._dialogService.confirm({
      message,
      detail: localize("areYouSureQuiteBulkEdit.detail", "'{0}' is in progress.", label || localize("fileOperation", "File operation"))
    });
    return !result.confirmed;
  }
};
BulkEditService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IWorkingCopyService),
  __decorateParam(6, IConfigurationService)
], BulkEditService);
registerSingleton(IBulkEditService, BulkEditService, InstantiationType.Delayed);
const autoSaveSetting = "files.refactoring.autoSave";
Registry.as(Extensions.Configuration).registerConfiguration({
  id: "files",
  properties: {
    [autoSaveSetting]: {
      description: localize("refactoring.autoSave", "Controls if files that were part of a refactoring are saved automatically"),
      default: true,
      type: "boolean"
    }
  }
});
export {
  BulkEditService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2J1bGtFZGl0L2Jyb3dzZXIvYnVsa0VkaXRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMaW5rZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkTGlzdC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBpc0NvZGVFZGl0b3IsIGlzRGlmZkVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUJ1bGtFZGl0T3B0aW9ucywgSUJ1bGtFZGl0UHJldmlld0hhbmRsZXIsIElCdWxrRWRpdFJlc3VsdCwgSUJ1bGtFZGl0U2VydmljZSwgUmVzb3VyY2VFZGl0LCBSZXNvdXJjZUZpbGVFZGl0LCBSZXNvdXJjZVRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlRWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzLCBJUHJvZ3Jlc3NTdGVwLCBQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVbmRvUmVkb0dyb3VwLCBVbmRvUmVkb1NvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBCdWxrQ2VsbEVkaXRzLCBSZXNvdXJjZU5vdGVib29rQ2VsbEVkaXQgfSBmcm9tICcuL2J1bGtDZWxsRWRpdHMuanMnO1xuaW1wb3J0IHsgQnVsa0ZpbGVFZGl0cyB9IGZyb20gJy4vYnVsa0ZpbGVFZGl0cy5qcyc7XG5pbXBvcnQgeyBCdWxrVGV4dEVkaXRzIH0gZnJvbSAnLi9idWxrVGV4dEVkaXRzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBTaHV0ZG93blJlYXNvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE9wYXF1ZUVkaXRzLCBSZXNvdXJjZUF0dGFjaG1lbnRFZGl0IH0gZnJvbSAnLi9vcGFxdWVFZGl0cy5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxFZGl0U291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuXG5mdW5jdGlvbiBsaWZ0RWRpdHMoZWRpdHM6IFJlc291cmNlRWRpdFtdKTogUmVzb3VyY2VFZGl0W10ge1xuXHRyZXR1cm4gZWRpdHMubWFwKGVkaXQgPT4ge1xuXHRcdGlmIChSZXNvdXJjZVRleHRFZGl0LmlzKGVkaXQpKSB7XG5cdFx0XHRyZXR1cm4gUmVzb3VyY2VUZXh0RWRpdC5saWZ0KGVkaXQpO1xuXHRcdH1cblx0XHRpZiAoUmVzb3VyY2VGaWxlRWRpdC5pcyhlZGl0KSkge1xuXHRcdFx0cmV0dXJuIFJlc291cmNlRmlsZUVkaXQubGlmdChlZGl0KTtcblx0XHR9XG5cdFx0aWYgKFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdC5pcyhlZGl0KSkge1xuXHRcdFx0cmV0dXJuIFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdC5saWZ0KGVkaXQpO1xuXHRcdH1cblxuXHRcdGlmIChSZXNvdXJjZUF0dGFjaG1lbnRFZGl0LmlzKGVkaXQpKSB7XG5cdFx0XHRyZXR1cm4gUmVzb3VyY2VBdHRhY2htZW50RWRpdC5saWZ0KGVkaXQpO1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgZWRpdCcpO1xuXHR9KTtcbn1cblxuY2xhc3MgQnVsa0VkaXQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29kZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdHM6IFJlc291cmNlRWRpdFtdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VuZG9SZWRvR3JvdXA6IFVuZG9SZWRvR3JvdXAsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdW5kb1JlZG9Tb3VyY2U6IFVuZG9SZWRvU291cmNlIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpcm1CZWZvcmVVbmRvOiBib29sZWFuLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblxuXHR9XG5cblx0YXJpYU1lc3NhZ2UoKTogc3RyaW5nIHtcblxuXHRcdGNvbnN0IG90aGVyUmVzb3VyY2VzID0gbmV3IFJlc291cmNlTWFwPGJvb2xlYW4+KCk7XG5cdFx0Y29uc3QgdGV4dEVkaXRSZXNvdXJjZXMgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblx0XHRsZXQgdGV4dEVkaXRDb3VudCA9IDA7XG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRoaXMuX2VkaXRzKSB7XG5cdFx0XHRpZiAoZWRpdCBpbnN0YW5jZW9mIFJlc291cmNlVGV4dEVkaXQpIHtcblx0XHRcdFx0dGV4dEVkaXRDb3VudCArPSAxO1xuXHRcdFx0XHR0ZXh0RWRpdFJlc291cmNlcy5zZXQoZWRpdC5yZXNvdXJjZSwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVkaXQgaW5zdGFuY2VvZiBSZXNvdXJjZUZpbGVFZGl0KSB7XG5cdFx0XHRcdG90aGVyUmVzb3VyY2VzLnNldChlZGl0Lm9sZFJlc291cmNlID8/IGVkaXQubmV3UmVzb3VyY2UhLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuX2VkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzdW1tYXJ5LjAnLCBcIk1hZGUgbm8gZWRpdHNcIik7XG5cdFx0fSBlbHNlIGlmIChvdGhlclJlc291cmNlcy5zaXplID09PSAwKSB7XG5cdFx0XHRpZiAodGV4dEVkaXRDb3VudCA+IDEgJiYgdGV4dEVkaXRSZXNvdXJjZXMuc2l6ZSA+IDEpIHtcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzdW1tYXJ5Lm5tJywgXCJNYWRlIHswfSB0ZXh0IGVkaXRzIGluIHsxfSBmaWxlc1wiLCB0ZXh0RWRpdENvdW50LCB0ZXh0RWRpdFJlc291cmNlcy5zaXplKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc3VtbWFyeS5uMCcsIFwiTWFkZSB7MH0gdGV4dCBlZGl0cyBpbiBvbmUgZmlsZVwiLCB0ZXh0RWRpdENvdW50KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzdW1tYXJ5LnRleHRGaWxlcycsIFwiTWFkZSB7MH0gdGV4dCBlZGl0cyBpbiB7MX0gZmlsZXMsIGFsc28gY3JlYXRlZCBvciBkZWxldGVkIHsyfSBmaWxlc1wiLCB0ZXh0RWRpdENvdW50LCB0ZXh0RWRpdFJlc291cmNlcy5zaXplLCBvdGhlclJlc291cmNlcy5zaXplKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBwZXJmb3JtKHJlYXNvbj86IFRleHRNb2RlbEVkaXRTb3VyY2UpOiBQcm9taXNlPHJlYWRvbmx5IFVSSVtdPiB7XG5cblx0XHRpZiAodGhpcy5fZWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZ2VzOiBudW1iZXJbXSA9IFsxXTtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHRoaXMuX2VkaXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoT2JqZWN0LmdldFByb3RvdHlwZU9mKHRoaXMuX2VkaXRzW2kgLSAxXSkgPT09IE9iamVjdC5nZXRQcm90b3R5cGVPZih0aGlzLl9lZGl0c1tpXSkpIHtcblx0XHRcdFx0cmFuZ2VzW3Jhbmdlcy5sZW5ndGggLSAxXSsrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmFuZ2VzLnB1c2goMSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBpbmZpbnRlIHByb2dyZXNzIHdoZW4gdGhlcmUgaXMgb25seSAxIGl0ZW0gc2luY2Ugd2UgZG8gbm90IGtub3cgaG93IGxvbmcgaXQgdGFrZXNcblx0XHRjb25zdCBpbmNyZW1lbnQgPSB0aGlzLl9lZGl0cy5sZW5ndGggPiAxID8gMCA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9wcm9ncmVzcy5yZXBvcnQoeyBpbmNyZW1lbnQsIHRvdGFsOiAxMDAgfSk7XG5cdFx0Ly8gSW5jcmVtZW50IGJ5IHBlcmNlbnRhZ2UgcG9pbnRzIHNpbmNlIHByb2dyZXNzIEFQSSBleHBlY3RzIHRoYXRcblx0XHRjb25zdCBwcm9ncmVzczogSVByb2dyZXNzPHZvaWQ+ID0geyByZXBvcnQ6IF8gPT4gdGhpcy5fcHJvZ3Jlc3MucmVwb3J0KHsgaW5jcmVtZW50OiAxMDAgLyB0aGlzLl9lZGl0cy5sZW5ndGggfSkgfTtcblxuXHRcdGNvbnN0IHJlc291cmNlczogKHJlYWRvbmx5IFVSSVtdKVtdID0gW107XG5cdFx0bGV0IGluZGV4ID0gMDtcblx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHJhbmdlcykge1xuXHRcdFx0aWYgKHRoaXMuX3Rva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLl9lZGl0cy5zbGljZShpbmRleCwgaW5kZXggKyByYW5nZSk7XG5cdFx0XHRpZiAoZ3JvdXBbMF0gaW5zdGFuY2VvZiBSZXNvdXJjZUZpbGVFZGl0KSB7XG5cdFx0XHRcdHJlc291cmNlcy5wdXNoKGF3YWl0IHRoaXMuX3BlcmZvcm1GaWxlRWRpdHMoPFJlc291cmNlRmlsZUVkaXRbXT5ncm91cCwgdGhpcy5fdW5kb1JlZG9Hcm91cCwgdGhpcy5fdW5kb1JlZG9Tb3VyY2UsIHRoaXMuX2NvbmZpcm1CZWZvcmVVbmRvLCBwcm9ncmVzcykpO1xuXHRcdFx0fSBlbHNlIGlmIChncm91cFswXSBpbnN0YW5jZW9mIFJlc291cmNlVGV4dEVkaXQpIHtcblx0XHRcdFx0cmVzb3VyY2VzLnB1c2goYXdhaXQgdGhpcy5fcGVyZm9ybVRleHRFZGl0cyg8UmVzb3VyY2VUZXh0RWRpdFtdPmdyb3VwLCB0aGlzLl91bmRvUmVkb0dyb3VwLCB0aGlzLl91bmRvUmVkb1NvdXJjZSwgcHJvZ3Jlc3MsIHJlYXNvbikpO1xuXHRcdFx0fSBlbHNlIGlmIChncm91cFswXSBpbnN0YW5jZW9mIFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdCkge1xuXHRcdFx0XHRyZXNvdXJjZXMucHVzaChhd2FpdCB0aGlzLl9wZXJmb3JtQ2VsbEVkaXRzKDxSZXNvdXJjZU5vdGVib29rQ2VsbEVkaXRbXT5ncm91cCwgdGhpcy5fdW5kb1JlZG9Hcm91cCwgdGhpcy5fdW5kb1JlZG9Tb3VyY2UsIHByb2dyZXNzKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGdyb3VwWzBdIGluc3RhbmNlb2YgUmVzb3VyY2VBdHRhY2htZW50RWRpdCkge1xuXHRcdFx0XHRyZXNvdXJjZXMucHVzaChhd2FpdCB0aGlzLl9wZXJmb3JtT3BhcXVlRWRpdHMoPFJlc291cmNlQXR0YWNobWVudEVkaXRbXT5ncm91cCwgdGhpcy5fdW5kb1JlZG9Hcm91cCwgdGhpcy5fdW5kb1JlZG9Tb3VyY2UsIHByb2dyZXNzKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zb2xlLmxvZygnVU5LTk9XTiBFRElUJyk7XG5cdFx0XHR9XG5cdFx0XHRpbmRleCA9IGluZGV4ICsgcmFuZ2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc291cmNlcy5mbGF0KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wZXJmb3JtRmlsZUVkaXRzKGVkaXRzOiBSZXNvdXJjZUZpbGVFZGl0W10sIHVuZG9SZWRvR3JvdXA6IFVuZG9SZWRvR3JvdXAsIHVuZG9SZWRvU291cmNlOiBVbmRvUmVkb1NvdXJjZSB8IHVuZGVmaW5lZCwgY29uZmlybUJlZm9yZVVuZG86IGJvb2xlYW4sIHByb2dyZXNzOiBJUHJvZ3Jlc3M8dm9pZD4pOiBQcm9taXNlPHJlYWRvbmx5IFVSSVtdPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnX3BlcmZvcm1GaWxlRWRpdHMnLCBKU09OLnN0cmluZ2lmeShlZGl0cykpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJ1bGtGaWxlRWRpdHMsIHRoaXMuX2xhYmVsIHx8IGxvY2FsaXplKCd3b3Jrc3BhY2VFZGl0JywgXCJXb3Jrc3BhY2UgRWRpdFwiKSwgdGhpcy5fY29kZSB8fCAndW5kb3JlZG8ud29ya3NwYWNlRWRpdCcsIHVuZG9SZWRvR3JvdXAsIHVuZG9SZWRvU291cmNlLCBjb25maXJtQmVmb3JlVW5kbywgcHJvZ3Jlc3MsIHRoaXMuX3Rva2VuLCBlZGl0cyk7XG5cdFx0cmV0dXJuIGF3YWl0IG1vZGVsLmFwcGx5KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wZXJmb3JtVGV4dEVkaXRzKGVkaXRzOiBSZXNvdXJjZVRleHRFZGl0W10sIHVuZG9SZWRvR3JvdXA6IFVuZG9SZWRvR3JvdXAsIHVuZG9SZWRvU291cmNlOiBVbmRvUmVkb1NvdXJjZSB8IHVuZGVmaW5lZCwgcHJvZ3Jlc3M6IElQcm9ncmVzczx2b2lkPiwgcmVhc29uOiBUZXh0TW9kZWxFZGl0U291cmNlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxyZWFkb25seSBVUklbXT4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ19wZXJmb3JtVGV4dEVkaXRzJywgSlNPTi5zdHJpbmdpZnkoZWRpdHMpKTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShCdWxrVGV4dEVkaXRzLCB0aGlzLl9sYWJlbCB8fCBsb2NhbGl6ZSgnd29ya3NwYWNlRWRpdCcsIFwiV29ya3NwYWNlIEVkaXRcIiksIHRoaXMuX2NvZGUgfHwgJ3VuZG9yZWRvLndvcmtzcGFjZUVkaXQnLCB0aGlzLl9lZGl0b3IsIHVuZG9SZWRvR3JvdXAsIHVuZG9SZWRvU291cmNlLCBwcm9ncmVzcywgdGhpcy5fdG9rZW4sIGVkaXRzKTtcblx0XHRyZXR1cm4gYXdhaXQgbW9kZWwuYXBwbHkocmVhc29uKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BlcmZvcm1DZWxsRWRpdHMoZWRpdHM6IFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdFtdLCB1bmRvUmVkb0dyb3VwOiBVbmRvUmVkb0dyb3VwLCB1bmRvUmVkb1NvdXJjZTogVW5kb1JlZG9Tb3VyY2UgfCB1bmRlZmluZWQsIHByb2dyZXNzOiBJUHJvZ3Jlc3M8dm9pZD4pOiBQcm9taXNlPHJlYWRvbmx5IFVSSVtdPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnX3BlcmZvcm1DZWxsRWRpdHMnLCBKU09OLnN0cmluZ2lmeShlZGl0cykpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJ1bGtDZWxsRWRpdHMsIHVuZG9SZWRvR3JvdXAsIHVuZG9SZWRvU291cmNlLCBwcm9ncmVzcywgdGhpcy5fdG9rZW4sIGVkaXRzKTtcblx0XHRyZXR1cm4gYXdhaXQgbW9kZWwuYXBwbHkoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BlcmZvcm1PcGFxdWVFZGl0cyhlZGl0czogUmVzb3VyY2VBdHRhY2htZW50RWRpdFtdLCB1bmRvUmVkb0dyb3VwOiBVbmRvUmVkb0dyb3VwLCB1bmRvUmVkb1NvdXJjZTogVW5kb1JlZG9Tb3VyY2UgfCB1bmRlZmluZWQsIHByb2dyZXNzOiBJUHJvZ3Jlc3M8dm9pZD4pOiBQcm9taXNlPHJlYWRvbmx5IFVSSVtdPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnX3BlcmZvcm1PcGFxdWVFZGl0cycsIEpTT04uc3RyaW5naWZ5KGVkaXRzKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT3BhcXVlRWRpdHMsIHVuZG9SZWRvR3JvdXAsIHVuZG9SZWRvU291cmNlLCBwcm9ncmVzcywgdGhpcy5fdG9rZW4sIGVkaXRzKTtcblx0XHRyZXR1cm4gYXdhaXQgbW9kZWwuYXBwbHkoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnVsa0VkaXRTZXJ2aWNlIGltcGxlbWVudHMgSUJ1bGtFZGl0U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlVW5kb1JlZG9Hcm91cHMgPSBuZXcgTGlua2VkTGlzdDxVbmRvUmVkb0dyb3VwPigpO1xuXHRwcml2YXRlIF9wcmV2aWV3SGFuZGxlcj86IElCdWxrRWRpdFByZXZpZXdIYW5kbGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtpbmdDb3B5U2VydmljZTogSVdvcmtpbmdDb3B5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRzZXRQcmV2aWV3SGFuZGxlcihoYW5kbGVyOiBJQnVsa0VkaXRQcmV2aWV3SGFuZGxlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9wcmV2aWV3SGFuZGxlciA9IGhhbmRsZXI7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fcHJldmlld0hhbmRsZXIgPT09IGhhbmRsZXIpIHtcblx0XHRcdFx0dGhpcy5fcHJldmlld0hhbmRsZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRoYXNQcmV2aWV3SGFuZGxlcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gQm9vbGVhbih0aGlzLl9wcmV2aWV3SGFuZGxlcik7XG5cdH1cblxuXHRhc3luYyBhcHBseShlZGl0c0luOiBSZXNvdXJjZUVkaXRbXSB8IFdvcmtzcGFjZUVkaXQsIG9wdGlvbnM/OiBJQnVsa0VkaXRPcHRpb25zKTogUHJvbWlzZTxJQnVsa0VkaXRSZXN1bHQ+IHtcblx0XHRsZXQgZWRpdHMgPSBsaWZ0RWRpdHMoQXJyYXkuaXNBcnJheShlZGl0c0luKSA/IGVkaXRzSW4gOiBlZGl0c0luLmVkaXRzKTtcblxuXHRcdGlmIChlZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7IGFyaWFTdW1tYXJ5OiBsb2NhbGl6ZSgnbm90aGluZycsIFwiTWFkZSBubyBlZGl0c1wiKSwgaXNBcHBsaWVkOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9wcmV2aWV3SGFuZGxlciAmJiAob3B0aW9ucz8uc2hvd1ByZXZpZXcgfHwgZWRpdHMuc29tZSh2YWx1ZSA9PiB2YWx1ZS5tZXRhZGF0YT8ubmVlZHNDb25maXJtYXRpb24pKSkge1xuXHRcdFx0ZWRpdHMgPSBhd2FpdCB0aGlzLl9wcmV2aWV3SGFuZGxlcihlZGl0cywgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0bGV0IGNvZGVFZGl0b3IgPSBvcHRpb25zPy5lZGl0b3I7XG5cdFx0Ly8gdHJ5IHRvIGZpbmQgY29kZSBlZGl0b3Jcblx0XHRpZiAoIWNvZGVFZGl0b3IpIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0XHRpZiAoaXNDb2RlRWRpdG9yKGNhbmRpZGF0ZSkpIHtcblx0XHRcdFx0Y29kZUVkaXRvciA9IGNhbmRpZGF0ZTtcblx0XHRcdH0gZWxzZSBpZiAoaXNEaWZmRWRpdG9yKGNhbmRpZGF0ZSkpIHtcblx0XHRcdFx0Y29kZUVkaXRvciA9IGNhbmRpZGF0ZS5nZXRNb2RpZmllZEVkaXRvcigpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjb2RlRWRpdG9yICYmIGNvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSkpIHtcblx0XHRcdC8vIElmIHRoZSBjb2RlIGVkaXRvciBpcyByZWFkb25seSBzdGlsbCBhbGxvdyBidWxrIGVkaXRzIHRvIGJlIGFwcGxpZWQgIzY4NTQ5XG5cdFx0XHRjb2RlRWRpdG9yID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIHVuZG8tcmVkby1ncm91cDogaWYgYSBncm91cCBpZCBpcyBwYXNzZWQgdGhlbiB0cnkgdG8gZmluZCBpdFxuXHRcdC8vIGluIHRoZSBsaXN0IG9mIGFjdGl2ZSBlZGl0cy4gb3RoZXJ3aXNlIChvciB3aGVuIG5vdCBmb3VuZClcblx0XHQvLyBjcmVhdGUgYSBzZXBhcmF0ZSB1bmRvLXJlZG8tZ3JvdXBcblx0XHRsZXQgdW5kb1JlZG9Hcm91cDogVW5kb1JlZG9Hcm91cCB8IHVuZGVmaW5lZDtcblx0XHRsZXQgdW5kb1JlZG9Hcm91cFJlbW92ZSA9ICgpID0+IHsgfTtcblx0XHRpZiAodHlwZW9mIG9wdGlvbnM/LnVuZG9SZWRvR3JvdXBJZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRoaXMuX2FjdGl2ZVVuZG9SZWRvR3JvdXBzKSB7XG5cdFx0XHRcdGlmIChjYW5kaWRhdGUuaWQgPT09IG9wdGlvbnMudW5kb1JlZG9Hcm91cElkKSB7XG5cdFx0XHRcdFx0dW5kb1JlZG9Hcm91cCA9IGNhbmRpZGF0ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXVuZG9SZWRvR3JvdXApIHtcblx0XHRcdHVuZG9SZWRvR3JvdXAgPSBuZXcgVW5kb1JlZG9Hcm91cCgpO1xuXHRcdFx0dW5kb1JlZG9Hcm91cFJlbW92ZSA9IHRoaXMuX2FjdGl2ZVVuZG9SZWRvR3JvdXBzLnB1c2godW5kb1JlZG9Hcm91cCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFiZWwgPSBvcHRpb25zPy5xdW90YWJsZUxhYmVsIHx8IG9wdGlvbnM/LmxhYmVsO1xuXHRcdGNvbnN0IGJ1bGtFZGl0ID0gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0QnVsa0VkaXQsXG5cdFx0XHRsYWJlbCxcblx0XHRcdG9wdGlvbnM/LmNvZGUsXG5cdFx0XHRjb2RlRWRpdG9yLFxuXHRcdFx0b3B0aW9ucz8ucHJvZ3Jlc3MgPz8gUHJvZ3Jlc3MuTm9uZSxcblx0XHRcdG9wdGlvbnM/LnRva2VuID8/IENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHRlZGl0cyxcblx0XHRcdHVuZG9SZWRvR3JvdXAsXG5cdFx0XHRvcHRpb25zPy51bmRvUmVkb1NvdXJjZSxcblx0XHRcdCEhb3B0aW9ucz8uY29uZmlybUJlZm9yZVVuZG9cblx0XHQpO1xuXG5cdFx0bGV0IGxpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0bGlzdGVuZXIgPSB0aGlzLl9saWZlY3ljbGVTZXJ2aWNlLm9uQmVmb3JlU2h1dGRvd24oZSA9PiBlLnZldG8odGhpcy5fc2hvdWxkVmV0byhsYWJlbCwgZS5yZWFzb24pLCAndmV0by5ibHVrRWRpdFNlcnZpY2UnKSk7XG5cdFx0XHRjb25zdCByZXNvdXJjZXMgPSBhd2FpdCBidWxrRWRpdC5wZXJmb3JtKG9wdGlvbnM/LnJlYXNvbik7XG5cblx0XHRcdC8vIHdoZW4gZW5hYmxlZCAob3B0aW9uIEFORCBzZXR0aW5nKSBsb29wIG92ZXIgYWxsIGRpcnR5IHdvcmtpbmcgY29waWVzIGFuZCB0cmlnZ2VyIHNhdmVcblx0XHRcdC8vIGZvciB0aG9zZSB0aGF0IHdlcmUgaW52b2x2ZWQgaW4gdGhpcyBidWxrIGVkaXQgb3BlcmF0aW9uLlxuXHRcdFx0aWYgKG9wdGlvbnM/LnJlc3BlY3RBdXRvU2F2ZUNvbmZpZyAmJiB0aGlzLl9jb25maWdTZXJ2aWNlLmdldFZhbHVlKGF1dG9TYXZlU2V0dGluZykgPT09IHRydWUgJiYgcmVzb3VyY2VzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fc2F2ZUFsbChyZXNvdXJjZXMpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBhcmlhU3VtbWFyeTogYnVsa0VkaXQuYXJpYU1lc3NhZ2UoKSwgaXNBcHBsaWVkOiBlZGl0cy5sZW5ndGggPiAwIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBjb25zb2xlLmxvZygnYXBwbHkgRkFJTEVEJyk7XG5cdFx0XHQvLyBjb25zb2xlLmxvZyhlcnIpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRsaXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdFx0dW5kb1JlZG9Hcm91cFJlbW92ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NhdmVBbGwocmVzb3VyY2VzOiByZWFkb25seSBVUklbXSkge1xuXHRcdGNvbnN0IHNldCA9IG5ldyBSZXNvdXJjZVNldChyZXNvdXJjZXMpO1xuXHRcdGNvbnN0IHNhdmVzID0gdGhpcy5fd29ya2luZ0NvcHlTZXJ2aWNlLmRpcnR5V29ya2luZ0NvcGllcy5tYXAoYXN5bmMgKGNvcHkpID0+IHtcblx0XHRcdGlmIChzZXQuaGFzKGNvcHkucmVzb3VyY2UpKSB7XG5cdFx0XHRcdGF3YWl0IGNvcHkuc2F2ZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHNhdmVzKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgcmVzdWx0KSB7XG5cdFx0XHRpZiAoaXRlbS5zdGF0dXMgPT09ICdyZWplY3RlZCcpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGl0ZW0ucmVhc29uKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaG91bGRWZXRvKGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXHRcdHN3aXRjaCAocmVhc29uKSB7XG5cdFx0XHRjYXNlIFNodXRkb3duUmVhc29uLkNMT1NFOlxuXHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2Nsb3NlVGhlV2luZG93Lm1lc3NhZ2UnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBjbG9zZSB0aGUgd2luZG93P1wiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFNodXRkb3duUmVhc29uLkxPQUQ6XG5cdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnY2hhbmdlV29ya3NwYWNlLm1lc3NhZ2UnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBjaGFuZ2UgdGhlIHdvcmtzcGFjZT9cIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTaHV0ZG93blJlYXNvbi5SRUxPQUQ6XG5cdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgncmVsb2FkVGhlV2luZG93Lm1lc3NhZ2UnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byByZWxvYWQgdGhlIHdpbmRvdz9cIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0bWVzc2FnZSA9IGlzTWFjaW50b3NoID8gbG9jYWxpemUoJ3F1aXRNZXNzYWdlTWFjJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gcXVpdD9cIikgOiBsb2NhbGl6ZSgncXVpdE1lc3NhZ2UnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBleGl0P1wiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhcmVZb3VTdXJlUXVpdGVCdWxrRWRpdC5kZXRhaWwnLCBcIid7MH0nIGlzIGluIHByb2dyZXNzLlwiLCBsYWJlbCB8fCBsb2NhbGl6ZSgnZmlsZU9wZXJhdGlvbicsIFwiRmlsZSBvcGVyYXRpb25cIikpLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuICFyZXN1bHQuY29uZmlybWVkO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElCdWxrRWRpdFNlcnZpY2UsIEJ1bGtFZGl0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cbmNvbnN0IGF1dG9TYXZlU2V0dGluZyA9ICdmaWxlcy5yZWZhY3RvcmluZy5hdXRvU2F2ZSc7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICdmaWxlcycsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRbYXV0b1NhdmVTZXR0aW5nXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZWZhY3RvcmluZy5hdXRvU2F2ZScsIFwiQ29udHJvbHMgaWYgZmlsZXMgdGhhdCB3ZXJlIHBhcnQgb2YgYSByZWZhY3RvcmluZyBhcmUgc2F2ZWQgYXV0b21hdGljYWxseVwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0eXBlOiAnYm9vbGVhbidcblx0XHR9XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFzQixvQkFBb0I7QUFDMUMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhLG1CQUFtQjtBQUV6QyxTQUFzQixjQUFjLG9CQUFvQjtBQUN4RCxTQUFxRSxrQkFBZ0Msa0JBQWtCLHdCQUF3QjtBQUMvSSxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUEwQztBQUNuRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBbUMsZ0JBQWdCO0FBQ25ELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFDO0FBQzlDLFNBQVMsZUFBZSxnQ0FBZ0M7QUFDeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsYUFBYSw4QkFBOEI7QUFFcEQsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxVQUFVLE9BQXVD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
