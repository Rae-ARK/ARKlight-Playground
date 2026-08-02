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
import * as glob from "../../../../base/common/glob.js";
import { EditorInputCapabilities, Verbosity, isResourceEditorInput } from "../../../common/editor.js";
import { INotebookService, SimpleNotebookProviderInfo } from "./notebookService.js";
import { URI } from "../../../../base/common/uri.js";
import { isEqual, toLocalResource } from "../../../../base/common/resources.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { INotebookEditorModelResolverService } from "./notebookEditorModelResolverService.js";
import { CellEditType, CellUri } from "./notebookCommon.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { Schemas } from "../../../../base/common/network.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { AbstractResourceEditorInput } from "../../../common/editor/resourceEditorInput.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { localize } from "../../../../nls.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { ICustomEditorLabelService } from "../../../services/editor/common/customEditorLabelService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { isAbsolute } from "../../../../base/common/path.js";
let NotebookEditorInput = class extends AbstractResourceEditorInput {
  constructor(resource, preferredResource, viewType, options, _notebookService, _notebookModelResolverService, _fileDialogService, labelService, fileService, filesConfigurationService, extensionService, editorService, textResourceConfigurationService, customEditorLabelService, environmentService, pathService) {
    super(resource, preferredResource, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
    this.viewType = viewType;
    this.options = options;
    this._notebookService = _notebookService;
    this._notebookModelResolverService = _notebookModelResolverService;
    this._fileDialogService = _fileDialogService;
    this.environmentService = environmentService;
    this.pathService = pathService;
    this.editorModelReference = null;
    this._defaultDirtyState = false;
    this._defaultDirtyState = !!options.startDirty;
    this._sideLoadedListener = _notebookService.onDidAddNotebookDocument((e) => {
      if (e.viewType === this.viewType && e.uri.toString() === this.resource.toString()) {
        this.resolve().catch(onUnexpectedError);
      }
    });
    this._register(extensionService.onWillStop((e) => {
      if (!e.auto && !this.isDirty()) {
        return;
      }
      const reason = e.auto ? localize("vetoAutoExtHostRestart", "An extension provided notebook for '{0}' is still open that would close otherwise.", this.getName()) : localize("vetoExtHostRestart", "An extension provided notebook for '{0}' could not be saved.", this.getName());
      e.veto((async () => {
        const editors = editorService.findEditors(this);
        if (e.auto) {
          return true;
        }
        if (editors.length > 0) {
          const result = await editorService.save(editors[0]);
          if (result.success) {
            return false;
          }
        }
        return true;
      })(), reason);
    }));
  }
  static getOrCreate(instantiationService, resource, preferredResource, viewType, options = {}) {
    const editor = instantiationService.createInstance(NotebookEditorInput, resource, preferredResource, viewType, options);
    if (preferredResource) {
      editor.setPreferredResource(preferredResource);
    }
    return editor;
  }
  dispose() {
    this._sideLoadedListener.dispose();
    this.editorModelReference?.dispose();
    this.editorModelReference = null;
    super.dispose();
  }
  get typeId() {
    return NotebookEditorInput.ID;
  }
  get editorId() {
    return this.viewType;
  }
  get capabilities() {
    let capabilities = EditorInputCapabilities.None;
    if (this.resource.scheme === Schemas.untitled) {
      capabilities |= EditorInputCapabilities.Untitled;
    }
    if (this.editorModelReference) {
      if (this.editorModelReference.object.isReadonly()) {
        capabilities |= EditorInputCapabilities.Readonly;
      }
    } else {
      if (this.filesConfigurationService.isReadonly(this.resource)) {
        capabilities |= EditorInputCapabilities.Readonly;
      }
    }
    if (!(capabilities & EditorInputCapabilities.Readonly)) {
      capabilities |= EditorInputCapabilities.CanDropIntoEditor;
    }
    return capabilities;
  }
  getDescription(verbosity = Verbosity.MEDIUM) {
    if (!this.hasCapability(EditorInputCapabilities.Untitled) || this.editorModelReference?.object.hasAssociatedFilePath()) {
      return super.getDescription(verbosity);
    }
    return void 0;
  }
  isReadonly() {
    if (!this.editorModelReference) {
      return this.filesConfigurationService.isReadonly(this.resource);
    }
    return this.editorModelReference.object.isReadonly();
  }
  isDirty() {
    if (!this.editorModelReference) {
      return this._defaultDirtyState;
    }
    return this.editorModelReference.object.isDirty();
  }
  isSaving() {
    const model = this.editorModelReference?.object;
    if (!model || !model.isDirty() || model.hasErrorState || this.hasCapability(EditorInputCapabilities.Untitled)) {
      return false;
    }
    return this.filesConfigurationService.hasShortAutoSaveDelay(this);
  }
  async save(group, options) {
    if (this.editorModelReference) {
      if (this.hasCapability(EditorInputCapabilities.Untitled)) {
        return this.saveAs(group, options);
      } else {
        await this.editorModelReference.object.save(options);
      }
      return this;
    }
    return void 0;
  }
  async saveAs(group, options) {
    if (!this.editorModelReference) {
      return void 0;
    }
    const provider = this._notebookService.getContributedNotebookType(this.viewType);
    if (!provider) {
      return void 0;
    }
    const pathCandidate = this.hasCapability(EditorInputCapabilities.Untitled) ? await this._suggestName(provider) : this.editorModelReference.object.resource;
    let target;
    if (this.editorModelReference.object.hasAssociatedFilePath()) {
      target = pathCandidate;
    } else {
      target = await this._fileDialogService.pickFileToSave(pathCandidate, options?.availableFileSystems);
      if (!target) {
        return void 0;
      }
    }
    if (!provider.matches(target)) {
      const patterns = provider.selectors.map((pattern) => {
        if (typeof pattern === "string") {
          return pattern;
        }
        if (glob.isRelativePattern(pattern)) {
          return `${pattern} (base ${pattern.base})`;
        }
        if (pattern.exclude) {
          return `${pattern.include} (exclude: ${pattern.exclude})`;
        } else {
          return `${pattern.include}`;
        }
      }).join(", ");
      throw new Error(`File name ${target} is not supported by ${provider.providerDisplayName}.

Please make sure the file name matches following patterns:
${patterns}`);
    }
    return await this.editorModelReference.object.saveAs(target);
  }
  async _suggestName(provider) {
    const resource = await this.ensureAbsolutePath(this.ensureProviderExtension(provider));
    const remoteAuthority = this.environmentService.remoteAuthority;
    return toLocalResource(resource, remoteAuthority, this.pathService.defaultUriScheme);
  }
  async ensureAbsolutePath(resource) {
    if (resource.scheme !== Schemas.untitled || isAbsolute(resource.path)) {
      return resource;
    }
    const defaultFilePath = await this._fileDialogService.defaultFilePath();
    return URI.joinPath(defaultFilePath, resource.path);
  }
  ensureProviderExtension(provider) {
    const firstSelector = provider.selectors[0];
    let selectorStr = firstSelector && typeof firstSelector === "string" ? firstSelector : void 0;
    if (!selectorStr && firstSelector) {
      const include = firstSelector.include;
      if (typeof include === "string") {
        selectorStr = include;
      }
    }
    const resource = this.resource;
    if (selectorStr) {
      const matches = /^\*\.([A-Za-z_-]*)$/.exec(selectorStr);
      if (matches && matches.length > 1) {
        const fileExt = matches[1];
        if (!resource.path.endsWith(fileExt)) {
          return resource.with({ path: resource.path + "." + fileExt });
        }
      }
    }
    return resource;
  }
  // called when users rename a notebook document
  async rename(group, target) {
    if (this.editorModelReference) {
      return { editor: { resource: target }, options: { override: this.viewType } };
    }
    return void 0;
  }
  async revert(_group, options) {
    if (this.editorModelReference && this.editorModelReference.object.isDirty()) {
      await this.editorModelReference.object.revert(options);
    }
  }
  async resolve(_options, perf) {
    if (!await this._notebookService.canResolve(this.viewType)) {
      return null;
    }
    perf?.mark("extensionActivated");
    this._sideLoadedListener.dispose();
    if (!this.editorModelReference) {
      const scratchpad = this.capabilities & EditorInputCapabilities.Scratchpad ? true : false;
      const ref = await this._notebookModelResolverService.resolve(this.resource, this.viewType, { limits: this.ensureLimits(_options), scratchpad, viewType: this.editorId });
      if (this.editorModelReference) {
        ref.dispose();
        return this.editorModelReference.object;
      }
      this.editorModelReference = ref;
      if (this.isDisposed()) {
        this.editorModelReference.dispose();
        this.editorModelReference = null;
        return null;
      }
      this._register(this.editorModelReference.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
      this._register(this.editorModelReference.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
      this._register(this.editorModelReference.object.onDidRevertUntitled(() => this.dispose()));
      if (this.editorModelReference.object.isDirty()) {
        this._onDidChangeDirty.fire();
      }
    } else {
      this.editorModelReference.object.load({ limits: this.ensureLimits(_options) });
    }
    if (this.options._backupId) {
      const info = await this._notebookService.withNotebookDataProvider(this.editorModelReference.object.notebook.viewType);
      if (!(info instanceof SimpleNotebookProviderInfo)) {
        throw new Error("CANNOT open file notebook with this provider");
      }
      const data = await info.serializer.dataToNotebook(VSBuffer.fromString(JSON.stringify({ __webview_backup: this.options._backupId })));
      this.editorModelReference.object.notebook.applyEdits([
        {
          editType: CellEditType.Replace,
          index: 0,
          count: this.editorModelReference.object.notebook.length,
          cells: data.cells
        }
      ], true, void 0, () => void 0, void 0, false);
      if (this.options._workingCopy) {
        this.options._backupId = void 0;
        this.options._workingCopy = void 0;
        this.options.startDirty = void 0;
      }
    }
    return this.editorModelReference.object;
  }
  toUntyped() {
    return {
      resource: this.resource,
      options: {
        override: this.viewType
      }
    };
  }
  matches(otherInput) {
    if (super.matches(otherInput)) {
      return true;
    }
    if (otherInput instanceof NotebookEditorInput) {
      return this.viewType === otherInput.viewType && isEqual(this.resource, otherInput.resource);
    }
    if (isResourceEditorInput(otherInput) && otherInput.resource.scheme === CellUri.scheme) {
      return isEqual(this.resource, CellUri.parse(otherInput.resource)?.notebook);
    }
    return false;
  }
};
NotebookEditorInput.ID = "workbench.input.notebook";
NotebookEditorInput = __decorateClass([
  __decorateParam(4, INotebookService),
  __decorateParam(5, INotebookEditorModelResolverService),
  __decorateParam(6, IFileDialogService),
  __decorateParam(7, ILabelService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IFilesConfigurationService),
  __decorateParam(10, IExtensionService),
  __decorateParam(11, IEditorService),
  __decorateParam(12, ITextResourceConfigurationService),
  __decorateParam(13, ICustomEditorLabelService),
  __decorateParam(14, IWorkbenchEnvironmentService),
  __decorateParam(15, IPathService)
], NotebookEditorInput);
function isCompositeNotebookEditorInput(thing) {
  return !!thing && typeof thing === "object" && Array.isArray(thing.editorInputs) && thing.editorInputs.every((input) => input instanceof NotebookEditorInput);
}
function isNotebookEditorInput(thing) {
  return !!thing && typeof thing === "object" && thing.typeId === NotebookEditorInput.ID;
}
export {
  NotebookEditorInput,
  isCompositeNotebookEditorInput,
  isNotebookEditorInput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0VkaXRvcklucHV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZ2xvYiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IEdyb3VwSWRlbnRpZmllciwgSVNhdmVPcHRpb25zLCBJTW92ZVJlc3VsdCwgSVJldmVydE9wdGlvbnMsIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBWZXJib3NpdHksIElVbnR5cGVkRWRpdG9ySW5wdXQsIElGaWxlTGltaXRlZEVkaXRvcklucHV0T3B0aW9ucywgaXNSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSwgU2ltcGxlTm90ZWJvb2tQcm92aWRlckluZm8gfSBmcm9tICcuL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCwgdG9Mb2NhbFJlc291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSB9IGZyb20gJy4vbm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFR5cGUsIENlbGxVcmksIElSZXNvbHZlZE5vdGVib29rRWRpdG9yTW9kZWwgfSBmcm9tICcuL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEFic3RyYWN0UmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvcmVzb3VyY2VFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tQcm92aWRlckluZm8gfSBmcm9tICcuL25vdGVib29rUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tQZXJmTWFya3MgfSBmcm9tICcuL25vdGVib29rUGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9jdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNBYnNvbHV0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rRWRpdG9ySW5wdXRPcHRpb25zIHtcblx0c3RhcnREaXJ0eT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBiYWNrdXBJZCBmb3Igd2Vidmlld1xuXHQgKi9cblx0X2JhY2t1cElkPzogc3RyaW5nO1xuXHRfd29ya2luZ0NvcHk/OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyO1xufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tFZGl0b3JJbnB1dCBleHRlbmRzIEFic3RyYWN0UmVzb3VyY2VFZGl0b3JJbnB1dCB7XG5cblx0c3RhdGljIGdldE9yQ3JlYXRlKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHJlc291cmNlOiBVUkksIHByZWZlcnJlZFJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHZpZXdUeXBlOiBzdHJpbmcsIG9wdGlvbnM6IE5vdGVib29rRWRpdG9ySW5wdXRPcHRpb25zID0ge30pIHtcblx0XHRjb25zdCBlZGl0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0VkaXRvcklucHV0LCByZXNvdXJjZSwgcHJlZmVycmVkUmVzb3VyY2UsIHZpZXdUeXBlLCBvcHRpb25zKTtcblx0XHRpZiAocHJlZmVycmVkUmVzb3VyY2UpIHtcblx0XHRcdGVkaXRvci5zZXRQcmVmZXJyZWRSZXNvdXJjZShwcmVmZXJyZWRSZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHJldHVybiBlZGl0b3I7XG5cdH1cblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guaW5wdXQubm90ZWJvb2snO1xuXG5cdHByb3RlY3RlZCBlZGl0b3JNb2RlbFJlZmVyZW5jZTogSVJlZmVyZW5jZTxJUmVzb2x2ZWROb3RlYm9va0VkaXRvck1vZGVsPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9zaWRlTG9hZGVkTGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXHRwcml2YXRlIF9kZWZhdWx0RGlydHlTdGF0ZTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlc291cmNlOiBVUkksXG5cdFx0cHJlZmVycmVkUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdmlld1R5cGU6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgb3B0aW9uczogTm90ZWJvb2tFZGl0b3JJbnB1dE9wdGlvbnMsXG5cdFx0QElOb3RlYm9va1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va01vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UgY3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlOiBJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIocmVzb3VyY2UsIHByZWZlcnJlZFJlc291cmNlLCBsYWJlbFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSwgY3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlKTtcblx0XHR0aGlzLl9kZWZhdWx0RGlydHlTdGF0ZSA9ICEhb3B0aW9ucy5zdGFydERpcnR5O1xuXG5cdFx0Ly8gQXV0b21hdGljYWxseSByZXNvbHZlIHRoaXMgaW5wdXQgd2hlbiB0aGUgXCJ3YW50ZWRcIiBtb2RlbCBjb21lcyB0byBsaWZlIHZpYVxuXHRcdC8vIHNvbWUgb3RoZXIgd2F5LiBUaGlzIGhhcHBlbnMgb25seSBvbmNlIHBlciBpbnB1dCBhbmQgcmVzb2x2ZSBkaXNwb3Nlc1xuXHRcdC8vIHRoaXMgbGlzdGVuZXJcblx0XHR0aGlzLl9zaWRlTG9hZGVkTGlzdGVuZXIgPSBfbm90ZWJvb2tTZXJ2aWNlLm9uRGlkQWRkTm90ZWJvb2tEb2N1bWVudChlID0+IHtcblx0XHRcdGlmIChlLnZpZXdUeXBlID09PSB0aGlzLnZpZXdUeXBlICYmIGUudXJpLnRvU3RyaW5nKCkgPT09IHRoaXMucmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHR0aGlzLnJlc29sdmUoKS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25TZXJ2aWNlLm9uV2lsbFN0b3AoZSA9PiB7XG5cdFx0XHRpZiAoIWUuYXV0byAmJiAhdGhpcy5pc0RpcnR5KCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZWFzb24gPSBlLmF1dG9cblx0XHRcdFx0PyBsb2NhbGl6ZSgndmV0b0F1dG9FeHRIb3N0UmVzdGFydCcsIFwiQW4gZXh0ZW5zaW9uIHByb3ZpZGVkIG5vdGVib29rIGZvciAnezB9JyBpcyBzdGlsbCBvcGVuIHRoYXQgd291bGQgY2xvc2Ugb3RoZXJ3aXNlLlwiLCB0aGlzLmdldE5hbWUoKSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgndmV0b0V4dEhvc3RSZXN0YXJ0JywgXCJBbiBleHRlbnNpb24gcHJvdmlkZWQgbm90ZWJvb2sgZm9yICd7MH0nIGNvdWxkIG5vdCBiZSBzYXZlZC5cIiwgdGhpcy5nZXROYW1lKCkpO1xuXG5cdFx0XHRlLnZldG8oKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9ycyA9IGVkaXRvclNlcnZpY2UuZmluZEVkaXRvcnModGhpcyk7XG5cdFx0XHRcdGlmIChlLmF1dG8pIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZWRpdG9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZWRpdG9yU2VydmljZS5zYXZlKGVkaXRvcnNbMF0pO1xuXHRcdFx0XHRcdGlmIChyZXN1bHQuc3VjY2Vzcykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBEb24ndCBWZXRvXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlOyAvLyBWZXRvXG5cdFx0XHR9KSgpLCByZWFzb24pO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fc2lkZUxvYWRlZExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZSA9IG51bGw7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBOb3RlYm9va0VkaXRvcklucHV0LklEO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGVkaXRvcklkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudmlld1R5cGU7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgY2FwYWJpbGl0aWVzKCk6IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzIHtcblx0XHRsZXQgY2FwYWJpbGl0aWVzID0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuTm9uZTtcblxuXHRcdGlmICh0aGlzLnJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCkge1xuXHRcdFx0Y2FwYWJpbGl0aWVzIHw9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlKSB7XG5cdFx0XHRpZiAodGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZS5vYmplY3QuaXNSZWFkb25seSgpKSB7XG5cdFx0XHRcdGNhcGFiaWxpdGllcyB8PSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZWFkb25seTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5pc1JlYWRvbmx5KHRoaXMucmVzb3VyY2UpKSB7XG5cdFx0XHRcdGNhcGFiaWxpdGllcyB8PSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZWFkb25seTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIShjYXBhYmlsaXRpZXMgJiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZWFkb25seSkpIHtcblx0XHRcdGNhcGFiaWxpdGllcyB8PSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5DYW5Ecm9wSW50b0VkaXRvcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2FwYWJpbGl0aWVzO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0RGVzY3JpcHRpb24odmVyYm9zaXR5ID0gVmVyYm9zaXR5Lk1FRElVTSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpIHx8IHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2U/Lm9iamVjdC5oYXNBc3NvY2lhdGVkRmlsZVBhdGgoKSkge1xuXHRcdFx0cmV0dXJuIHN1cGVyLmdldERlc2NyaXB0aW9uKHZlcmJvc2l0eSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gbm8gZGVzY3JpcHRpb24gZm9yIHVudGl0bGVkIG5vdGVib29rcyB3aXRob3V0IGFzc29jaWF0ZWQgZmlsZSBwYXRoXG5cdH1cblxuXHRvdmVycmlkZSBpc1JlYWRvbmx5KCk6IGJvb2xlYW4gfCBJTWFya2Rvd25TdHJpbmcge1xuXHRcdGlmICghdGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5pc1JlYWRvbmx5KHRoaXMucmVzb3VyY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZS5vYmplY3QuaXNSZWFkb25seSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgaXNEaXJ0eSgpIHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2UpIHtcblx0XHRcdHJldHVybiB0aGlzLl9kZWZhdWx0RGlydHlTdGF0ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2Uub2JqZWN0LmlzRGlydHkoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGlzU2F2aW5nKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZT8ub2JqZWN0O1xuXHRcdGlmICghbW9kZWwgfHwgIW1vZGVsLmlzRGlydHkoKSB8fCBtb2RlbC5oYXNFcnJvclN0YXRlIHx8IHRoaXMuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gcmVxdWlyZSB0aGUgbW9kZWwgdG8gYmUgZGlydHksIGZpbGUtYmFja2VkIGFuZCBub3QgaW4gYW4gZXJyb3Igc3RhdGVcblx0XHR9XG5cblx0XHQvLyBpZiBhIHNob3J0IGF1dG8gc2F2ZSBpcyBjb25maWd1cmVkLCB0cmVhdCB0aGlzIGFzIGJlaW5nIHNhdmVkXG5cdFx0cmV0dXJuIHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5oYXNTaG9ydEF1dG9TYXZlRGVsYXkodGhpcyk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzYXZlKGdyb3VwOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlKSB7XG5cblx0XHRcdGlmICh0aGlzLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNhdmVBcyhncm91cCwgb3B0aW9ucyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLm9iamVjdC5zYXZlKG9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2F2ZUFzKGdyb3VwOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPElVbnR5cGVkRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9ub3RlYm9va1NlcnZpY2UuZ2V0Q29udHJpYnV0ZWROb3RlYm9va1R5cGUodGhpcy52aWV3VHlwZSk7XG5cblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhdGhDYW5kaWRhdGUgPSB0aGlzLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpXG5cdFx0XHQ/IGF3YWl0IHRoaXMuX3N1Z2dlc3ROYW1lKHByb3ZpZGVyKVxuXHRcdFx0OiB0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLm9iamVjdC5yZXNvdXJjZTtcblxuXHRcdGxldCB0YXJnZXQ6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZS5vYmplY3QuaGFzQXNzb2NpYXRlZEZpbGVQYXRoKCkpIHtcblx0XHRcdHRhcmdldCA9IHBhdGhDYW5kaWRhdGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhcmdldCA9IGF3YWl0IHRoaXMuX2ZpbGVEaWFsb2dTZXJ2aWNlLnBpY2tGaWxlVG9TYXZlKHBhdGhDYW5kaWRhdGUsIG9wdGlvbnM/LmF2YWlsYWJsZUZpbGVTeXN0ZW1zKTtcblx0XHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIHNhdmUgY2FuY2VsbGVkXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFwcm92aWRlci5tYXRjaGVzKHRhcmdldCkpIHtcblx0XHRcdGNvbnN0IHBhdHRlcm5zID0gcHJvdmlkZXIuc2VsZWN0b3JzLm1hcChwYXR0ZXJuID0+IHtcblx0XHRcdFx0aWYgKHR5cGVvZiBwYXR0ZXJuID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHJldHVybiBwYXR0ZXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGdsb2IuaXNSZWxhdGl2ZVBhdHRlcm4ocGF0dGVybikpIHtcblx0XHRcdFx0XHRyZXR1cm4gYCR7cGF0dGVybn0gKGJhc2UgJHtwYXR0ZXJuLmJhc2V9KWA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocGF0dGVybi5leGNsdWRlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGAke3BhdHRlcm4uaW5jbHVkZX0gKGV4Y2x1ZGU6ICR7cGF0dGVybi5leGNsdWRlfSlgO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBgJHtwYXR0ZXJuLmluY2x1ZGV9YDtcblx0XHRcdFx0fVxuXG5cdFx0XHR9KS5qb2luKCcsICcpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGaWxlIG5hbWUgJHt0YXJnZXR9IGlzIG5vdCBzdXBwb3J0ZWQgYnkgJHtwcm92aWRlci5wcm92aWRlckRpc3BsYXlOYW1lfS5cXG5cXG5QbGVhc2UgbWFrZSBzdXJlIHRoZSBmaWxlIG5hbWUgbWF0Y2hlcyBmb2xsb3dpbmcgcGF0dGVybnM6XFxuJHtwYXR0ZXJuc31gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZS5vYmplY3Quc2F2ZUFzKHRhcmdldCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zdWdnZXN0TmFtZShwcm92aWRlcjogTm90ZWJvb2tQcm92aWRlckluZm8pIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IGF3YWl0IHRoaXMuZW5zdXJlQWJzb2x1dGVQYXRoKHRoaXMuZW5zdXJlUHJvdmlkZXJFeHRlbnNpb24ocHJvdmlkZXIpKTtcblx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0cmV0dXJuIHRvTG9jYWxSZXNvdXJjZShyZXNvdXJjZSwgcmVtb3RlQXV0aG9yaXR5LCB0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBlbnN1cmVBYnNvbHV0ZVBhdGgocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VVJJPiB7XG5cdFx0aWYgKHJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy51bnRpdGxlZCB8fCBpc0Fic29sdXRlKHJlc291cmNlLnBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gcmVzb3VyY2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmYXVsdEZpbGVQYXRoID0gYXdhaXQgdGhpcy5fZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdEZpbGVQYXRoKCk7XG5cdFx0cmV0dXJuIFVSSS5qb2luUGF0aChkZWZhdWx0RmlsZVBhdGgsIHJlc291cmNlLnBhdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBlbnN1cmVQcm92aWRlckV4dGVuc2lvbihwcm92aWRlcjogTm90ZWJvb2tQcm92aWRlckluZm8pIHtcblx0XHRjb25zdCBmaXJzdFNlbGVjdG9yID0gcHJvdmlkZXIuc2VsZWN0b3JzWzBdO1xuXHRcdGxldCBzZWxlY3RvclN0ciA9IGZpcnN0U2VsZWN0b3IgJiYgdHlwZW9mIGZpcnN0U2VsZWN0b3IgPT09ICdzdHJpbmcnID8gZmlyc3RTZWxlY3RvciA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXNlbGVjdG9yU3RyICYmIGZpcnN0U2VsZWN0b3IpIHtcblx0XHRcdGNvbnN0IGluY2x1ZGUgPSAoZmlyc3RTZWxlY3RvciBhcyB7IGluY2x1ZGU/OiBzdHJpbmcgfSkuaW5jbHVkZTtcblx0XHRcdGlmICh0eXBlb2YgaW5jbHVkZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0c2VsZWN0b3JTdHIgPSBpbmNsdWRlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5yZXNvdXJjZTtcblx0XHRpZiAoc2VsZWN0b3JTdHIpIHtcblx0XHRcdGNvbnN0IG1hdGNoZXMgPSAvXlxcKlxcLihbQS1aYS16Xy1dKikkLy5leGVjKHNlbGVjdG9yU3RyKTtcblx0XHRcdGlmIChtYXRjaGVzICYmIG1hdGNoZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRjb25zdCBmaWxlRXh0ID0gbWF0Y2hlc1sxXTtcblx0XHRcdFx0aWYgKCFyZXNvdXJjZS5wYXRoLmVuZHNXaXRoKGZpbGVFeHQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc291cmNlLndpdGgoeyBwYXRoOiByZXNvdXJjZS5wYXRoICsgJy4nICsgZmlsZUV4dCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXNvdXJjZTtcblx0fVxuXG5cdC8vIGNhbGxlZCB3aGVuIHVzZXJzIHJlbmFtZSBhIG5vdGVib29rIGRvY3VtZW50XG5cdG92ZXJyaWRlIGFzeW5jIHJlbmFtZShncm91cDogR3JvdXBJZGVudGlmaWVyLCB0YXJnZXQ6IFVSSSk6IFByb21pc2U8SU1vdmVSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuIHsgZWRpdG9yOiB7IHJlc291cmNlOiB0YXJnZXQgfSwgb3B0aW9uczogeyBvdmVycmlkZTogdGhpcy52aWV3VHlwZSB9IH07XG5cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJldmVydChfZ3JvdXA6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElSZXZlcnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2UgJiYgdGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZS5vYmplY3QuaXNEaXJ0eSgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLm9iamVjdC5yZXZlcnQob3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZShfb3B0aW9ucz86IElGaWxlTGltaXRlZEVkaXRvcklucHV0T3B0aW9ucywgcGVyZj86IE5vdGVib29rUGVyZk1hcmtzKTogUHJvbWlzZTxJUmVzb2x2ZWROb3RlYm9va0VkaXRvck1vZGVsIHwgbnVsbD4ge1xuXHRcdGlmICghYXdhaXQgdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLmNhblJlc29sdmUodGhpcy52aWV3VHlwZSkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHBlcmY/Lm1hcmsoJ2V4dGVuc2lvbkFjdGl2YXRlZCcpO1xuXG5cdFx0Ly8gd2UgYXJlIG5vdyBsb2FkaW5nIHRoZSBub3RlYm9vayBhbmQgZG9uJ3QgbmVlZCB0byBsaXN0ZW4gdG9cblx0XHQvLyBcIm90aGVyXCIgbG9hZGluZyBhbnltb3JlXG5cdFx0dGhpcy5fc2lkZUxvYWRlZExpc3RlbmVyLmRpc3Bvc2UoKTtcblxuXHRcdGlmICghdGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZSkge1xuXHRcdFx0Y29uc3Qgc2NyYXRjaHBhZCA9IHRoaXMuY2FwYWJpbGl0aWVzICYgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuU2NyYXRjaHBhZCA/IHRydWUgOiBmYWxzZTtcblx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX25vdGVib29rTW9kZWxSZXNvbHZlclNlcnZpY2UucmVzb2x2ZSh0aGlzLnJlc291cmNlLCB0aGlzLnZpZXdUeXBlLCB7IGxpbWl0czogdGhpcy5lbnN1cmVMaW1pdHMoX29wdGlvbnMpLCBzY3JhdGNocGFkLCB2aWV3VHlwZTogdGhpcy5lZGl0b3JJZCB9KTtcblx0XHRcdGlmICh0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlKSB7XG5cdFx0XHRcdC8vIFJlLWVudHJhbnQsIGRvdWJsZSByZXNvbHZlIGhhcHBlbmVkLiBEaXNwb3NlIHRoZSBhZGRpdGlvbiByZWZlcmVuY2VzIGFuZCBwcm9jZWVkXG5cdFx0XHRcdC8vIHdpdGggdGhlIHRydXRoLlxuXHRcdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm4gKDxJUmVmZXJlbmNlPElSZXNvbHZlZE5vdGVib29rRWRpdG9yTW9kZWw+PnRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2UpLm9iamVjdDtcblx0XHRcdH1cblx0XHRcdHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2UgPSByZWY7XG5cdFx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2UgPSBudWxsO1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2Uub2JqZWN0Lm9uRGlkQ2hhbmdlRGlydHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2Uub2JqZWN0Lm9uRGlkQ2hhbmdlUmVhZG9ubHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMuZmlyZSgpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLm9iamVjdC5vbkRpZFJldmVydFVudGl0bGVkKCgpID0+IHRoaXMuZGlzcG9zZSgpKSk7XG5cdFx0XHRpZiAodGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZS5vYmplY3QuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLm9iamVjdC5sb2FkKHsgbGltaXRzOiB0aGlzLmVuc3VyZUxpbWl0cyhfb3B0aW9ucykgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5fYmFja3VwSWQpIHtcblx0XHRcdGNvbnN0IGluZm8gPSBhd2FpdCB0aGlzLl9ub3RlYm9va1NlcnZpY2Uud2l0aE5vdGVib29rRGF0YVByb3ZpZGVyKHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2Uub2JqZWN0Lm5vdGVib29rLnZpZXdUeXBlKTtcblx0XHRcdGlmICghKGluZm8gaW5zdGFuY2VvZiBTaW1wbGVOb3RlYm9va1Byb3ZpZGVySW5mbykpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDQU5OT1Qgb3BlbiBmaWxlIG5vdGVib29rIHdpdGggdGhpcyBwcm92aWRlcicpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkYXRhID0gYXdhaXQgaW5mby5zZXJpYWxpemVyLmRhdGFUb05vdGVib29rKFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyBfX3dlYnZpZXdfYmFja3VwOiB0aGlzLm9wdGlvbnMuX2JhY2t1cElkIH0pKSk7XG5cdFx0XHR0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLm9iamVjdC5ub3RlYm9vay5hcHBseUVkaXRzKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRjb3VudDogdGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZS5vYmplY3Qubm90ZWJvb2subGVuZ3RoLFxuXHRcdFx0XHRcdGNlbGxzOiBkYXRhLmNlbGxzXG5cdFx0XHRcdH1cblx0XHRcdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlKTtcblxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5fd29ya2luZ0NvcHkpIHtcblx0XHRcdFx0dGhpcy5vcHRpb25zLl9iYWNrdXBJZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5vcHRpb25zLl93b3JraW5nQ29weSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5vcHRpb25zLnN0YXJ0RGlydHkgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2Uub2JqZWN0O1xuXHR9XG5cblx0b3ZlcnJpZGUgdG9VbnR5cGVkKCk6IElSZXNvdXJjZUVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMucmVzb3VyY2UsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdG92ZXJyaWRlOiB0aGlzLnZpZXdUeXBlXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIG1hdGNoZXMob3RoZXJJbnB1dDogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0aWYgKHN1cGVyLm1hdGNoZXMob3RoZXJJbnB1dCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAob3RoZXJJbnB1dCBpbnN0YW5jZW9mIE5vdGVib29rRWRpdG9ySW5wdXQpIHtcblx0XHRcdHJldHVybiB0aGlzLnZpZXdUeXBlID09PSBvdGhlcklucHV0LnZpZXdUeXBlICYmIGlzRXF1YWwodGhpcy5yZXNvdXJjZSwgb3RoZXJJbnB1dC5yZXNvdXJjZSk7XG5cdFx0fVxuXHRcdGlmIChpc1Jlc291cmNlRWRpdG9ySW5wdXQob3RoZXJJbnB1dCkgJiYgb3RoZXJJbnB1dC5yZXNvdXJjZS5zY2hlbWUgPT09IENlbGxVcmkuc2NoZW1lKSB7XG5cdFx0XHRyZXR1cm4gaXNFcXVhbCh0aGlzLnJlc291cmNlLCBDZWxsVXJpLnBhcnNlKG90aGVySW5wdXQucmVzb3VyY2UpPy5ub3RlYm9vayk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21wb3NpdGVOb3RlYm9va0VkaXRvcklucHV0IHtcblx0cmVhZG9ubHkgZWRpdG9ySW5wdXRzOiBOb3RlYm9va0VkaXRvcklucHV0W107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0NvbXBvc2l0ZU5vdGVib29rRWRpdG9ySW5wdXQodGhpbmc6IHVua25vd24pOiB0aGluZyBpcyBJQ29tcG9zaXRlTm90ZWJvb2tFZGl0b3JJbnB1dCB7XG5cdHJldHVybiAhIXRoaW5nXG5cdFx0JiYgdHlwZW9mIHRoaW5nID09PSAnb2JqZWN0J1xuXHRcdCYmIEFycmF5LmlzQXJyYXkoKDxJQ29tcG9zaXRlTm90ZWJvb2tFZGl0b3JJbnB1dD50aGluZykuZWRpdG9ySW5wdXRzKVxuXHRcdCYmICgoPElDb21wb3NpdGVOb3RlYm9va0VkaXRvcklucHV0PnRoaW5nKS5lZGl0b3JJbnB1dHMuZXZlcnkoaW5wdXQgPT4gaW5wdXQgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvcklucHV0KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc05vdGVib29rRWRpdG9ySW5wdXQodGhpbmc6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkKTogdGhpbmcgaXMgTm90ZWJvb2tFZGl0b3JJbnB1dCB7XG5cdHJldHVybiAhIXRoaW5nXG5cdFx0JiYgdHlwZW9mIHRoaW5nID09PSAnb2JqZWN0J1xuXHRcdCYmIHRoaW5nLnR5cGVJZCA9PT0gTm90ZWJvb2tFZGl0b3JJbnB1dC5JRDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxVQUFVO0FBQ3RCLFNBQXFFLHlCQUF5QixXQUFnRSw2QkFBNkI7QUFFM0wsU0FBUyxrQkFBa0Isa0NBQWtDO0FBQzdELFNBQVMsV0FBVztBQUNwQixTQUFTLFNBQVMsdUJBQXVCO0FBRXpDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkNBQTJDO0FBRXBELFNBQVMsY0FBYyxlQUE2QztBQUNwRSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQ0FBbUM7QUFFNUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0I7QUFJekIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQkFBa0I7QUFXcEIsSUFBTSxzQkFBTixjQUFrQyw0QkFBNEI7QUFBQSxFQWdCcEUsWUFDQyxVQUNBLG1CQUNnQixVQUNBLFNBQ21CLGtCQUNtQiwrQkFDakIsb0JBQ3RCLGNBQ0QsYUFDYywyQkFDVCxrQkFDSCxlQUNtQixrQ0FDUiwwQkFDc0Isb0JBQ2xCLGFBQzlCO0FBQ0QsVUFBTSxVQUFVLG1CQUFtQixjQUFjLGFBQWEsMkJBQTJCLGtDQUFrQyx3QkFBd0I7QUFmbkk7QUFDQTtBQUNtQjtBQUNtQjtBQUNqQjtBQVFZO0FBQ2xCO0FBcEJoQyxTQUFVLHVCQUF3RTtBQUVsRixTQUFRLHFCQUE4QjtBQXFCckMs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
