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
import { basename, isEqual } from "../../../../base/common/resources.js";
import { MutableDisposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { EditorInputCapabilities, isEditorInput, isResourceEditorInput, isResourceDiffEditorInput } from "../../../common/editor.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { ICustomEditorService } from "../common/customEditor.js";
import { IWebviewService } from "../../webview/browser/webview.js";
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput } from "../../webviewPanel/browser/webviewWorkbenchService.js";
function getCustomEditorSideBySideDiffInputResource(init) {
  return init.side === "original" ? init.originalResource : init.modifiedResource;
}
let CustomEditorDiffInput = class extends LazilyResolvedWebviewEditorInput {
  constructor(init, webview, themeService, webviewWorkbenchService, instantiationService, customEditorService, filesConfigurationService, fileDialogService, undoRedoService) {
    super({ providedId: init.viewType, viewType: init.viewType, name: init.label ?? "", iconPath: init.iconPath }, webview, themeService, webviewWorkbenchService);
    this.init = init;
    this.instantiationService = instantiationService;
    this.customEditorService = customEditorService;
    this.filesConfigurationService = filesConfigurationService;
    this.fileDialogService = fileDialogService;
    this.undoRedoService = undoRedoService;
    this._modelRef = this._register(new MutableDisposable());
    this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
  }
  static create(instantiationService, init, group) {
    return instantiationService.invokeFunction((accessor) => {
      const webview = accessor.get(IWebviewService).createWebviewOverlay({
        providedViewType: init.viewType,
        title: init.label,
        options: {},
        contentOptions: {},
        extension: void 0
      });
      const input = instantiationService.createInstance(CustomEditorDiffInput, init, webview);
      if (group) {
        input.updateGroup(group.id);
      }
      return input;
    });
  }
  get typeId() {
    return CustomEditorDiffInput.typeId;
  }
  get editorId() {
    return this.viewType;
  }
  get capabilities() {
    let capabilities = EditorInputCapabilities.Singleton | EditorInputCapabilities.CanDropIntoEditor;
    if (this.isReadonly()) {
      capabilities |= EditorInputCapabilities.Readonly;
    }
    return capabilities;
  }
  get resource() {
    return this.modifiedResource;
  }
  get originalResource() {
    return this.init.originalResource;
  }
  get modifiedResource() {
    return this.init.modifiedResource;
  }
  get diffResources() {
    return {
      original: this.originalResource,
      modified: this.modifiedResource
    };
  }
  getName() {
    return this.init.label ?? localize("customEditorDiffLabel", "{0} - {1}", basename(this.originalResource), basename(this.modifiedResource));
  }
  getDescription(_verbosity) {
    return this.init.description ?? super.getDescription();
  }
  getTitle(verbosity) {
    const description = this.getDescription(verbosity);
    if (description) {
      return localize("customEditorDiffTitle", "{0} ({1})", this.getName(), description);
    }
    return this.getName();
  }
  isReadonly() {
    const modelRef = this._modelRef.value;
    if (!modelRef) {
      return this.filesConfigurationService.isReadonly(this.modifiedResource);
    }
    return modelRef.object.isReadonly();
  }
  isDirty() {
    return this._modelRef.value?.object.isDirty() ?? false;
  }
  matches(otherInput) {
    if (this === otherInput) {
      return true;
    }
    if (otherInput instanceof CustomEditorDiffInput) {
      return this.viewType === otherInput.viewType && isEqual(this.originalResource, otherInput.originalResource) && isEqual(this.modifiedResource, otherInput.modifiedResource);
    }
    if (isEditorInput(otherInput)) {
      return false;
    }
    if (isResourceDiffEditorInput(otherInput)) {
      const override = otherInput.options?.override;
      return override === this.viewType && isEqual(this.originalResource, otherInput.original.resource) && isEqual(this.modifiedResource, otherInput.modified.resource);
    }
    return false;
  }
  copy() {
    return CustomEditorDiffInput.create(this.instantiationService, this.init, void 0);
  }
  async save(groupId, options) {
    const modelRef = this._modelRef.value;
    if (!modelRef) {
      return void 0;
    }
    const target = await modelRef.object.saveCustomEditor(options);
    if (!target) {
      return void 0;
    }
    if (!isEqual(target, this.modifiedResource)) {
      return this.toUntypedWithModifiedResource(target);
    }
    return this;
  }
  async saveAs(groupId, options) {
    const modelRef = this._modelRef.value;
    if (!modelRef) {
      return void 0;
    }
    const target = await this.fileDialogService.pickFileToSave(this.modifiedResource, options?.availableFileSystems);
    if (!target) {
      return void 0;
    }
    if (!await modelRef.object.saveCustomEditorAs(this.modifiedResource, target, options)) {
      return void 0;
    }
    return this.toUntypedWithModifiedResource(target);
  }
  async revert(group, options) {
    await this._modelRef.value?.object.revert(options);
  }
  async resolve() {
    await super.resolve();
    if (this.isDisposed()) {
      return null;
    }
    if (!this._modelRef.value) {
      const modelRef = this.customEditorService.models.tryRetain(this.modifiedResource, this.viewType);
      if (modelRef) {
        const oldCapabilities = this.capabilities;
        const retainedModelRef = await modelRef;
        if (this.isDisposed()) {
          retainedModelRef.dispose();
          return null;
        }
        this._modelRef.value = retainedModelRef;
        this._register(retainedModelRef.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
        this._register(retainedModelRef.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
        if (this.isDirty()) {
          this._onDidChangeDirty.fire();
        }
        if (this.capabilities !== oldCapabilities) {
          this._onDidChangeCapabilities.fire();
        }
      }
    }
    return null;
  }
  undo() {
    return this.undoRedoService.undo(this.modifiedResource);
  }
  redo() {
    return this.undoRedoService.redo(this.modifiedResource);
  }
  toUntyped(_options) {
    return this.toUntypedWithModifiedResource(this.modifiedResource);
  }
  toUntypedWithModifiedResource(modifiedResource) {
    return {
      original: { resource: this.originalResource },
      modified: { resource: modifiedResource },
      label: this.init.label,
      description: this.init.description,
      options: {
        override: this.viewType
      }
    };
  }
};
CustomEditorDiffInput.typeId = "workbench.editors.customDiffEditor";
CustomEditorDiffInput = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IWebviewWorkbenchService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ICustomEditorService),
  __decorateParam(6, IFilesConfigurationService),
  __decorateParam(7, IFileDialogService),
  __decorateParam(8, IUndoRedoService)
], CustomEditorDiffInput);
let CustomEditorSideBySideDiffInput = class extends LazilyResolvedWebviewEditorInput {
  constructor(init, webview, themeService, webviewWorkbenchService, instantiationService, customEditorService, filesConfigurationService, fileDialogService, undoRedoService) {
    super({ providedId: init.viewType, viewType: init.viewType, name: basename(getCustomEditorSideBySideDiffInputResource(init)), iconPath: init.iconPath }, webview, themeService, webviewWorkbenchService);
    this.init = init;
    this.instantiationService = instantiationService;
    this.customEditorService = customEditorService;
    this.filesConfigurationService = filesConfigurationService;
    this.fileDialogService = fileDialogService;
    this.undoRedoService = undoRedoService;
    this._modelRef = this._register(new MutableDisposable());
    this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
  }
  static create(instantiationService, init, group) {
    return instantiationService.invokeFunction((accessor) => {
      const webview = accessor.get(IWebviewService).createWebviewOverlay({
        providedViewType: init.viewType,
        title: basename(getCustomEditorSideBySideDiffInputResource(init)),
        options: {},
        contentOptions: {},
        extension: void 0
      });
      const input = instantiationService.createInstance(CustomEditorSideBySideDiffInput, init, webview);
      if (group) {
        input.updateGroup(group.id);
      }
      return input;
    });
  }
  get typeId() {
    return CustomEditorSideBySideDiffInput.typeId;
  }
  get editorId() {
    return this.viewType;
  }
  get capabilities() {
    let capabilities = EditorInputCapabilities.Singleton | EditorInputCapabilities.CanDropIntoEditor;
    if (this.isReadonly()) {
      capabilities |= EditorInputCapabilities.Readonly;
    }
    return capabilities;
  }
  get resource() {
    return this.side === "original" ? this.originalResource : this.modifiedResource;
  }
  get originalResource() {
    return this.init.originalResource;
  }
  get modifiedResource() {
    return this.init.modifiedResource;
  }
  get side() {
    return this.init.side;
  }
  get diffId() {
    return this.init.diffId;
  }
  getName() {
    return basename(this.resource);
  }
  getDescription(_verbosity) {
    return this.init.description ?? super.getDescription();
  }
  getTitle(verbosity) {
    const description = this.getDescription(verbosity);
    if (description) {
      return localize("customEditorSideBySideDiffTitle", "{0} ({1})", this.getName(), description);
    }
    return this.getName();
  }
  isReadonly() {
    if (this.side === "original") {
      return true;
    }
    const modelRef = this._modelRef.value;
    if (!modelRef) {
      return this.filesConfigurationService.isReadonly(this.modifiedResource);
    }
    return modelRef.object.isReadonly();
  }
  isDirty() {
    return this.side === "modified" ? this._modelRef.value?.object.isDirty() ?? false : false;
  }
  matches(otherInput) {
    if (this === otherInput) {
      return true;
    }
    if (otherInput instanceof CustomEditorSideBySideDiffInput) {
      return this.editorId === otherInput.editorId && this.side === otherInput.side && isEqual(this.originalResource, otherInput.originalResource) && isEqual(this.modifiedResource, otherInput.modifiedResource);
    }
    if (isEditorInput(otherInput)) {
      return false;
    }
    if (isResourceEditorInput(otherInput)) {
      return isEqual(this.resource, otherInput.resource);
    }
    return false;
  }
  copy() {
    return CustomEditorSideBySideDiffInput.create(this.instantiationService, this.init, void 0);
  }
  async save(groupId, options) {
    const modelRef = this._modelRef.value;
    if (!modelRef) {
      return void 0;
    }
    const target = await modelRef.object.saveCustomEditor(options);
    if (!target) {
      return void 0;
    }
    if (!isEqual(target, this.modifiedResource)) {
      return { resource: target };
    }
    return this;
  }
  async saveAs(groupId, options) {
    const modelRef = this._modelRef.value;
    if (!modelRef) {
      return void 0;
    }
    const target = await this.fileDialogService.pickFileToSave(this.modifiedResource, options?.availableFileSystems);
    if (!target) {
      return void 0;
    }
    if (!await modelRef.object.saveCustomEditorAs(this.modifiedResource, target, options)) {
      return void 0;
    }
    return { resource: target };
  }
  async revert(group, options) {
    await this._modelRef.value?.object.revert(options);
  }
  async resolve() {
    await super.resolve();
    if (this.isDisposed()) {
      return null;
    }
    if (this.side === "modified" && !this._modelRef.value) {
      const modelRef = this.customEditorService.models.tryRetain(this.modifiedResource, this.viewType);
      if (modelRef) {
        const oldCapabilities = this.capabilities;
        const retainedModelRef = await modelRef;
        if (this.isDisposed()) {
          retainedModelRef.dispose();
          return null;
        }
        this._modelRef.value = retainedModelRef;
        this._register(retainedModelRef.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
        this._register(retainedModelRef.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
        if (this.isDirty()) {
          this._onDidChangeDirty.fire();
        }
        if (this.capabilities !== oldCapabilities) {
          this._onDidChangeCapabilities.fire();
        }
      }
    }
    return null;
  }
  undo() {
    return this.undoRedoService.undo(this.modifiedResource);
  }
  redo() {
    return this.undoRedoService.redo(this.modifiedResource);
  }
  toUntyped(_options) {
    return { resource: this.resource };
  }
};
CustomEditorSideBySideDiffInput.typeId = "workbench.editors.customSideBySideDiffEditor";
CustomEditorSideBySideDiffInput = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IWebviewWorkbenchService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ICustomEditorService),
  __decorateParam(6, IFilesConfigurationService),
  __decorateParam(7, IFileDialogService),
  __decorateParam(8, IUndoRedoService)
], CustomEditorSideBySideDiffInput);
export {
  CustomEditorDiffInput,
  CustomEditorSideBySideDiffInput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2N1c3RvbUVkaXRvci9icm93c2VyL2N1c3RvbUVkaXRvckRpZmZJbnB1dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGJhc2VuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElSZWZlcmVuY2UsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgR3JvdXBJZGVudGlmaWVyLCBJRWRpdG9ySW5wdXRXaXRoRGlmZlJlc291cmNlcywgSVJlc291cmNlRGlmZkVkaXRvcklucHV0LCBJUmV2ZXJ0T3B0aW9ucywgSVNhdmVPcHRpb25zLCBJVW50eXBlZEVkaXRvcklucHV0LCBpc0VkaXRvcklucHV0LCBpc1Jlc291cmNlRWRpdG9ySW5wdXQsIGlzUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQsIFZlcmJvc2l0eSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQsIElVbnR5cGVkRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21FZGl0b3JNb2RlbCwgSUN1c3RvbUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY3VzdG9tRWRpdG9yLmpzJztcbmltcG9ydCB7IElPdmVybGF5V2VidmlldywgSVdlYnZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd2Vidmlldy9icm93c2VyL3dlYnZpZXcuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlLCBMYXppbHlSZXNvbHZlZFdlYnZpZXdFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL3dlYnZpZXdQYW5lbC9icm93c2VyL3dlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFdlYnZpZXdJY29uUGF0aCB9IGZyb20gJy4uLy4uL3dlYnZpZXdQYW5lbC9icm93c2VyL3dlYnZpZXdFZGl0b3JJbnB1dC5qcyc7XG5cbmludGVyZmFjZSBDdXN0b21FZGl0b3JEaWZmSW5wdXRJbml0SW5mbyB7XG5cdHJlYWRvbmx5IG9yaWdpbmFsUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgbW9kaWZpZWRSZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSB2aWV3VHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpY29uUGF0aDogV2Vidmlld0ljb25QYXRoIHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dEluaXRJbmZvIGV4dGVuZHMgQ3VzdG9tRWRpdG9yRGlmZklucHV0SW5pdEluZm8ge1xuXHRyZWFkb25seSBkaWZmSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2lkZTogQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZTaWRlO1xufVxuXG5leHBvcnQgdHlwZSBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZlNpZGUgPSAnb3JpZ2luYWwnIHwgJ21vZGlmaWVkJztcblxuZnVuY3Rpb24gZ2V0Q3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dFJlc291cmNlKGluaXQ6IEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXRJbml0SW5mbyk6IFVSSSB7XG5cdHJldHVybiBpbml0LnNpZGUgPT09ICdvcmlnaW5hbCcgPyBpbml0Lm9yaWdpbmFsUmVzb3VyY2UgOiBpbml0Lm1vZGlmaWVkUmVzb3VyY2U7XG59XG5cbmV4cG9ydCBjbGFzcyBDdXN0b21FZGl0b3JEaWZmSW5wdXQgZXh0ZW5kcyBMYXppbHlSZXNvbHZlZFdlYnZpZXdFZGl0b3JJbnB1dCBpbXBsZW1lbnRzIElFZGl0b3JJbnB1dFdpdGhEaWZmUmVzb3VyY2VzIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFJlZiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJUmVmZXJlbmNlPElDdXN0b21FZGl0b3JNb2RlbD4+KCkpO1xuXG5cdHN0YXRpYyBjcmVhdGUoXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRpbml0OiBDdXN0b21FZGl0b3JEaWZmSW5wdXRJbml0SW5mbyxcblx0XHRncm91cDogSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkLFxuXHQpOiBDdXN0b21FZGl0b3JEaWZmSW5wdXQge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCB3ZWJ2aWV3ID0gYWNjZXNzb3IuZ2V0KElXZWJ2aWV3U2VydmljZSkuY3JlYXRlV2Vidmlld092ZXJsYXkoe1xuXHRcdFx0XHRwcm92aWRlZFZpZXdUeXBlOiBpbml0LnZpZXdUeXBlLFxuXHRcdFx0XHR0aXRsZTogaW5pdC5sYWJlbCxcblx0XHRcdFx0b3B0aW9uczoge30sXG5cdFx0XHRcdGNvbnRlbnRPcHRpb25zOiB7fSxcblx0XHRcdFx0ZXh0ZW5zaW9uOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaW5wdXQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDdXN0b21FZGl0b3JEaWZmSW5wdXQsIGluaXQsIHdlYnZpZXcpO1xuXHRcdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRcdGlucHV0LnVwZGF0ZUdyb3VwKGdyb3VwLmlkKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGlucHV0O1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBvdmVycmlkZSByZWFkb25seSB0eXBlSWQgPSAnd29ya2JlbmNoLmVkaXRvcnMuY3VzdG9tRGlmZkVkaXRvcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbml0OiBDdXN0b21FZGl0b3JEaWZmSW5wdXRJbml0SW5mbyxcblx0XHR3ZWJ2aWV3OiBJT3ZlcmxheVdlYnZpZXcsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJV2Vidmlld1dvcmtiZW5jaFNlcnZpY2Ugd2Vidmlld1dvcmtiZW5jaFNlcnZpY2U6IElXZWJ2aWV3V29ya2JlbmNoU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUN1c3RvbUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjdXN0b21FZGl0b3JTZXJ2aWNlOiBJQ3VzdG9tRWRpdG9yU2VydmljZSxcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASVVuZG9SZWRvU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVuZG9SZWRvU2VydmljZTogSVVuZG9SZWRvU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoeyBwcm92aWRlZElkOiBpbml0LnZpZXdUeXBlLCB2aWV3VHlwZTogaW5pdC52aWV3VHlwZSwgbmFtZTogaW5pdC5sYWJlbCA/PyAnJywgaWNvblBhdGg6IGluaXQuaWNvblBhdGggfSwgd2VidmlldywgdGhlbWVTZXJ2aWNlLCB3ZWJ2aWV3V29ya2JlbmNoU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlUmVhZG9ubHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMuZmlyZSgpKSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEN1c3RvbUVkaXRvckRpZmZJbnB1dC50eXBlSWQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgZWRpdG9ySWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3VHlwZTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBjYXBhYmlsaXRpZXMoKTogRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMge1xuXHRcdGxldCBjYXBhYmlsaXRpZXMgPSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TaW5nbGV0b24gfCBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5DYW5Ecm9wSW50b0VkaXRvcjtcblx0XHRpZiAodGhpcy5pc1JlYWRvbmx5KCkpIHtcblx0XHRcdGNhcGFiaWxpdGllcyB8PSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZWFkb25seTtcblx0XHR9XG5cdFx0cmV0dXJuIGNhcGFiaWxpdGllcztcblx0fVxuXG5cdG92ZXJyaWRlIGdldCByZXNvdXJjZSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLm1vZGlmaWVkUmVzb3VyY2U7XG5cdH1cblxuXHRnZXQgb3JpZ2luYWxSZXNvdXJjZSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLmluaXQub3JpZ2luYWxSZXNvdXJjZTtcblx0fVxuXG5cdGdldCBtb2RpZmllZFJlc291cmNlKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5pdC5tb2RpZmllZFJlc291cmNlO1xuXHR9XG5cblx0Z2V0IGRpZmZSZXNvdXJjZXMoKTogSUVkaXRvcklucHV0V2l0aERpZmZSZXNvdXJjZXNbJ2RpZmZSZXNvdXJjZXMnXSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9yaWdpbmFsOiB0aGlzLm9yaWdpbmFsUmVzb3VyY2UsXG5cdFx0XHRtb2RpZmllZDogdGhpcy5tb2RpZmllZFJlc291cmNlLFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBnZXROYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaW5pdC5sYWJlbCA/PyBsb2NhbGl6ZSgnY3VzdG9tRWRpdG9yRGlmZkxhYmVsJywgXCJ7MH0gLSB7MX1cIiwgYmFzZW5hbWUodGhpcy5vcmlnaW5hbFJlc291cmNlKSwgYmFzZW5hbWUodGhpcy5tb2RpZmllZFJlc291cmNlKSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXREZXNjcmlwdGlvbihfdmVyYm9zaXR5PzogVmVyYm9zaXR5KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5pbml0LmRlc2NyaXB0aW9uID8/IHN1cGVyLmdldERlc2NyaXB0aW9uKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRUaXRsZSh2ZXJib3NpdHk/OiBWZXJib3NpdHkpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gdGhpcy5nZXREZXNjcmlwdGlvbih2ZXJib3NpdHkpO1xuXHRcdGlmIChkZXNjcmlwdGlvbikge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjdXN0b21FZGl0b3JEaWZmVGl0bGUnLCBcInswfSAoezF9KVwiLCB0aGlzLmdldE5hbWUoKSwgZGVzY3JpcHRpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmdldE5hbWUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGlzUmVhZG9ubHkoKTogYm9vbGVhbiB8IElNYXJrZG93blN0cmluZyB7XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSB0aGlzLl9tb2RlbFJlZi52YWx1ZTtcblx0XHRpZiAoIW1vZGVsUmVmKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmlzUmVhZG9ubHkodGhpcy5tb2RpZmllZFJlc291cmNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1vZGVsUmVmLm9iamVjdC5pc1JlYWRvbmx5KCk7XG5cdH1cblxuXHRvdmVycmlkZSBpc0RpcnR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbFJlZi52YWx1ZT8ub2JqZWN0LmlzRGlydHkoKSA/PyBmYWxzZTtcblx0fVxuXG5cdG92ZXJyaWRlIG1hdGNoZXMob3RoZXJJbnB1dDogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMgPT09IG90aGVySW5wdXQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChvdGhlcklucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yRGlmZklucHV0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy52aWV3VHlwZSA9PT0gb3RoZXJJbnB1dC52aWV3VHlwZVxuXHRcdFx0XHQmJiBpc0VxdWFsKHRoaXMub3JpZ2luYWxSZXNvdXJjZSwgb3RoZXJJbnB1dC5vcmlnaW5hbFJlc291cmNlKVxuXHRcdFx0XHQmJiBpc0VxdWFsKHRoaXMubW9kaWZpZWRSZXNvdXJjZSwgb3RoZXJJbnB1dC5tb2RpZmllZFJlc291cmNlKTtcblx0XHR9XG5cblx0XHRpZiAoaXNFZGl0b3JJbnB1dChvdGhlcklucHV0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChpc1Jlc291cmNlRGlmZkVkaXRvcklucHV0KG90aGVySW5wdXQpKSB7XG5cdFx0XHRjb25zdCBvdmVycmlkZSA9IG90aGVySW5wdXQub3B0aW9ucz8ub3ZlcnJpZGU7XG5cdFx0XHRyZXR1cm4gb3ZlcnJpZGUgPT09IHRoaXMudmlld1R5cGVcblx0XHRcdFx0JiYgaXNFcXVhbCh0aGlzLm9yaWdpbmFsUmVzb3VyY2UsIG90aGVySW5wdXQub3JpZ2luYWwucmVzb3VyY2UpXG5cdFx0XHRcdCYmIGlzRXF1YWwodGhpcy5tb2RpZmllZFJlc291cmNlLCBvdGhlcklucHV0Lm1vZGlmaWVkLnJlc291cmNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRvdmVycmlkZSBjb3B5KCk6IEVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gQ3VzdG9tRWRpdG9yRGlmZklucHV0LmNyZWF0ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLmluaXQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzYXZlKGdyb3VwSWQ6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8RWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSB0aGlzLl9tb2RlbFJlZi52YWx1ZTtcblx0XHRpZiAoIW1vZGVsUmVmKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IG1vZGVsUmVmLm9iamVjdC5zYXZlQ3VzdG9tRWRpdG9yKG9wdGlvbnMpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghaXNFcXVhbCh0YXJnZXQsIHRoaXMubW9kaWZpZWRSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLnRvVW50eXBlZFdpdGhNb2RpZmllZFJlc291cmNlKHRhcmdldCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzYXZlQXMoZ3JvdXBJZDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVNhdmVPcHRpb25zKTogUHJvbWlzZTxFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBtb2RlbFJlZiA9IHRoaXMuX21vZGVsUmVmLnZhbHVlO1xuXHRcdGlmICghbW9kZWxSZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5waWNrRmlsZVRvU2F2ZSh0aGlzLm1vZGlmaWVkUmVzb3VyY2UsIG9wdGlvbnM/LmF2YWlsYWJsZUZpbGVTeXN0ZW1zKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIWF3YWl0IG1vZGVsUmVmLm9iamVjdC5zYXZlQ3VzdG9tRWRpdG9yQXModGhpcy5tb2RpZmllZFJlc291cmNlLCB0YXJnZXQsIG9wdGlvbnMpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnRvVW50eXBlZFdpdGhNb2RpZmllZFJlc291cmNlKHRhcmdldCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZXZlcnQoZ3JvdXA6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElSZXZlcnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fbW9kZWxSZWYudmFsdWU/Lm9iamVjdC5yZXZlcnQob3B0aW9ucyk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZXNvbHZlKCk6IFByb21pc2U8bnVsbD4ge1xuXHRcdGF3YWl0IHN1cGVyLnJlc29sdmUoKTtcblxuXHRcdGlmICh0aGlzLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9tb2RlbFJlZi52YWx1ZSkge1xuXHRcdFx0Y29uc3QgbW9kZWxSZWYgPSB0aGlzLmN1c3RvbUVkaXRvclNlcnZpY2UubW9kZWxzLnRyeVJldGFpbih0aGlzLm1vZGlmaWVkUmVzb3VyY2UsIHRoaXMudmlld1R5cGUpO1xuXHRcdFx0aWYgKG1vZGVsUmVmKSB7XG5cdFx0XHRcdGNvbnN0IG9sZENhcGFiaWxpdGllcyA9IHRoaXMuY2FwYWJpbGl0aWVzO1xuXHRcdFx0XHRjb25zdCByZXRhaW5lZE1vZGVsUmVmID0gYXdhaXQgbW9kZWxSZWY7XG5cdFx0XHRcdGlmICh0aGlzLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHRcdHJldGFpbmVkTW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX21vZGVsUmVmLnZhbHVlID0gcmV0YWluZWRNb2RlbFJlZjtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIocmV0YWluZWRNb2RlbFJlZi5vYmplY3Qub25EaWRDaGFuZ2VEaXJ0eSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZURpcnR5LmZpcmUoKSkpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihyZXRhaW5lZE1vZGVsUmVmLm9iamVjdC5vbkRpZENoYW5nZVJlYWRvbmx5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzLmZpcmUoKSkpO1xuXHRcdFx0XHRpZiAodGhpcy5pc0RpcnR5KCkpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURpcnR5LmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMgIT09IG9sZENhcGFiaWxpdGllcykge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIHVuZG8oKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnVuZG9SZWRvU2VydmljZS51bmRvKHRoaXMubW9kaWZpZWRSZXNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVkbygpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMudW5kb1JlZG9TZXJ2aWNlLnJlZG8odGhpcy5tb2RpZmllZFJlc291cmNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIHRvVW50eXBlZChfb3B0aW9ucz86IElVbnR5cGVkRWRpdG9yT3B0aW9ucyk6IElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIHRoaXMudG9VbnR5cGVkV2l0aE1vZGlmaWVkUmVzb3VyY2UodGhpcy5tb2RpZmllZFJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgdG9VbnR5cGVkV2l0aE1vZGlmaWVkUmVzb3VyY2UobW9kaWZpZWRSZXNvdXJjZTogVVJJKTogSVJlc291cmNlRGlmZkVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IHRoaXMub3JpZ2luYWxSZXNvdXJjZSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IG1vZGlmaWVkUmVzb3VyY2UgfSxcblx0XHRcdGxhYmVsOiB0aGlzLmluaXQubGFiZWwsXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5pbml0LmRlc2NyaXB0aW9uLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRvdmVycmlkZTogdGhpcy52aWV3VHlwZSxcblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0IGV4dGVuZHMgTGF6aWx5UmVzb2x2ZWRXZWJ2aWV3RWRpdG9ySW5wdXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsUmVmID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElSZWZlcmVuY2U8SUN1c3RvbUVkaXRvck1vZGVsPj4oKSk7XG5cblx0c3RhdGljIGNyZWF0ZShcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdGluaXQ6IEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXRJbml0SW5mbyxcblx0XHRncm91cDogSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkLFxuXHQpOiBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0IHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0Y29uc3Qgd2VidmlldyA9IGFjY2Vzc29yLmdldChJV2Vidmlld1NlcnZpY2UpLmNyZWF0ZVdlYnZpZXdPdmVybGF5KHtcblx0XHRcdFx0cHJvdmlkZWRWaWV3VHlwZTogaW5pdC52aWV3VHlwZSxcblx0XHRcdFx0dGl0bGU6IGJhc2VuYW1lKGdldEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXRSZXNvdXJjZShpbml0KSksXG5cdFx0XHRcdG9wdGlvbnM6IHt9LFxuXHRcdFx0XHRjb250ZW50T3B0aW9uczoge30sXG5cdFx0XHRcdGV4dGVuc2lvbjogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGlucHV0ID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dCwgaW5pdCwgd2Vidmlldyk7XG5cdFx0XHRpZiAoZ3JvdXApIHtcblx0XHRcdFx0aW5wdXQudXBkYXRlR3JvdXAoZ3JvdXAuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaW5wdXQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIG92ZXJyaWRlIHJlYWRvbmx5IHR5cGVJZCA9ICd3b3JrYmVuY2guZWRpdG9ycy5jdXN0b21TaWRlQnlTaWRlRGlmZkVkaXRvcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbml0OiBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0SW5pdEluZm8sXG5cdFx0d2VidmlldzogSU92ZXJsYXlXZWJ2aWV3LFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVdlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlIHdlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlOiBJV2Vidmlld1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDdXN0b21FZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY3VzdG9tRWRpdG9yU2VydmljZTogSUN1c3RvbUVkaXRvclNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElVbmRvUmVkb1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1bmRvUmVkb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHsgcHJvdmlkZWRJZDogaW5pdC52aWV3VHlwZSwgdmlld1R5cGU6IGluaXQudmlld1R5cGUsIG5hbWU6IGJhc2VuYW1lKGdldEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXRSZXNvdXJjZShpbml0KSksIGljb25QYXRoOiBpbml0Lmljb25QYXRoIH0sIHdlYnZpZXcsIHRoZW1lU2VydmljZSwgd2Vidmlld1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZVJlYWRvbmx5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzLmZpcmUoKSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0LnR5cGVJZDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBlZGl0b3JJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnZpZXdUeXBlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGNhcGFiaWxpdGllcygpOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcyB7XG5cdFx0bGV0IGNhcGFiaWxpdGllcyA9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlNpbmdsZXRvbiB8IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkNhbkRyb3BJbnRvRWRpdG9yO1xuXHRcdGlmICh0aGlzLmlzUmVhZG9ubHkoKSkge1xuXHRcdFx0Y2FwYWJpbGl0aWVzIHw9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlJlYWRvbmx5O1xuXHRcdH1cblx0XHRyZXR1cm4gY2FwYWJpbGl0aWVzO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHJlc291cmNlKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuc2lkZSA9PT0gJ29yaWdpbmFsJyA/IHRoaXMub3JpZ2luYWxSZXNvdXJjZSA6IHRoaXMubW9kaWZpZWRSZXNvdXJjZTtcblx0fVxuXG5cdGdldCBvcmlnaW5hbFJlc291cmNlKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5pdC5vcmlnaW5hbFJlc291cmNlO1xuXHR9XG5cblx0Z2V0IG1vZGlmaWVkUmVzb3VyY2UoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5pbml0Lm1vZGlmaWVkUmVzb3VyY2U7XG5cdH1cblxuXHRnZXQgc2lkZSgpOiBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZlNpZGUge1xuXHRcdHJldHVybiB0aGlzLmluaXQuc2lkZTtcblx0fVxuXG5cdGdldCBkaWZmSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pbml0LmRpZmZJZDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldE5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYmFzZW5hbWUodGhpcy5yZXNvdXJjZSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXREZXNjcmlwdGlvbihfdmVyYm9zaXR5PzogVmVyYm9zaXR5KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5pbml0LmRlc2NyaXB0aW9uID8/IHN1cGVyLmdldERlc2NyaXB0aW9uKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRUaXRsZSh2ZXJib3NpdHk/OiBWZXJib3NpdHkpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gdGhpcy5nZXREZXNjcmlwdGlvbih2ZXJib3NpdHkpO1xuXHRcdGlmIChkZXNjcmlwdGlvbikge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZlRpdGxlJywgXCJ7MH0gKHsxfSlcIiwgdGhpcy5nZXROYW1lKCksIGRlc2NyaXB0aW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5nZXROYW1lKCk7XG5cdH1cblxuXHRvdmVycmlkZSBpc1JlYWRvbmx5KCk6IGJvb2xlYW4gfCBJTWFya2Rvd25TdHJpbmcge1xuXHRcdGlmICh0aGlzLnNpZGUgPT09ICdvcmlnaW5hbCcpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbFJlZiA9IHRoaXMuX21vZGVsUmVmLnZhbHVlO1xuXHRcdGlmICghbW9kZWxSZWYpIHtcblx0XHRcdHJldHVybiB0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuaXNSZWFkb25seSh0aGlzLm1vZGlmaWVkUmVzb3VyY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gbW9kZWxSZWYub2JqZWN0LmlzUmVhZG9ubHkoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGlzRGlydHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc2lkZSA9PT0gJ21vZGlmaWVkJyA/IHRoaXMuX21vZGVsUmVmLnZhbHVlPy5vYmplY3QuaXNEaXJ0eSgpID8/IGZhbHNlIDogZmFsc2U7XG5cdH1cblxuXHRvdmVycmlkZSBtYXRjaGVzKG90aGVySW5wdXQ6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzID09PSBvdGhlcklucHV0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAob3RoZXJJbnB1dCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXQpIHtcblx0XHRcdHJldHVybiB0aGlzLmVkaXRvcklkID09PSBvdGhlcklucHV0LmVkaXRvcklkXG5cdFx0XHRcdCYmIHRoaXMuc2lkZSA9PT0gb3RoZXJJbnB1dC5zaWRlXG5cdFx0XHRcdCYmIGlzRXF1YWwodGhpcy5vcmlnaW5hbFJlc291cmNlLCBvdGhlcklucHV0Lm9yaWdpbmFsUmVzb3VyY2UpXG5cdFx0XHRcdCYmIGlzRXF1YWwodGhpcy5tb2RpZmllZFJlc291cmNlLCBvdGhlcklucHV0Lm1vZGlmaWVkUmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdGlmIChpc0VkaXRvcklucHV0KG90aGVySW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGlzUmVzb3VyY2VFZGl0b3JJbnB1dChvdGhlcklucHV0KSkge1xuXHRcdFx0cmV0dXJuIGlzRXF1YWwodGhpcy5yZXNvdXJjZSwgb3RoZXJJbnB1dC5yZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgY29weSgpOiBFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXQuY3JlYXRlKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMuaW5pdCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNhdmUoZ3JvdXBJZDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVNhdmVPcHRpb25zKTogUHJvbWlzZTxFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBtb2RlbFJlZiA9IHRoaXMuX21vZGVsUmVmLnZhbHVlO1xuXHRcdGlmICghbW9kZWxSZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgbW9kZWxSZWYub2JqZWN0LnNhdmVDdXN0b21FZGl0b3Iob3B0aW9ucyk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc0VxdWFsKHRhcmdldCwgdGhpcy5tb2RpZmllZFJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHsgcmVzb3VyY2U6IHRhcmdldCB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2F2ZUFzKGdyb3VwSWQ6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8RWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSB0aGlzLl9tb2RlbFJlZi52YWx1ZTtcblx0XHRpZiAoIW1vZGVsUmVmKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UucGlja0ZpbGVUb1NhdmUodGhpcy5tb2RpZmllZFJlc291cmNlLCBvcHRpb25zPy5hdmFpbGFibGVGaWxlU3lzdGVtcyk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCFhd2FpdCBtb2RlbFJlZi5vYmplY3Quc2F2ZUN1c3RvbUVkaXRvckFzKHRoaXMubW9kaWZpZWRSZXNvdXJjZSwgdGFyZ2V0LCBvcHRpb25zKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4geyByZXNvdXJjZTogdGFyZ2V0IH07XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZXZlcnQoZ3JvdXA6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElSZXZlcnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fbW9kZWxSZWYudmFsdWU/Lm9iamVjdC5yZXZlcnQob3B0aW9ucyk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZXNvbHZlKCk6IFByb21pc2U8bnVsbD4ge1xuXHRcdGF3YWl0IHN1cGVyLnJlc29sdmUoKTtcblxuXHRcdGlmICh0aGlzLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2lkZSA9PT0gJ21vZGlmaWVkJyAmJiAhdGhpcy5fbW9kZWxSZWYudmFsdWUpIHtcblx0XHRcdGNvbnN0IG1vZGVsUmVmID0gdGhpcy5jdXN0b21FZGl0b3JTZXJ2aWNlLm1vZGVscy50cnlSZXRhaW4odGhpcy5tb2RpZmllZFJlc291cmNlLCB0aGlzLnZpZXdUeXBlKTtcblx0XHRcdGlmIChtb2RlbFJlZikge1xuXHRcdFx0XHRjb25zdCBvbGRDYXBhYmlsaXRpZXMgPSB0aGlzLmNhcGFiaWxpdGllcztcblx0XHRcdFx0Y29uc3QgcmV0YWluZWRNb2RlbFJlZiA9IGF3YWl0IG1vZGVsUmVmO1xuXHRcdFx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0XHRyZXRhaW5lZE1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9tb2RlbFJlZi52YWx1ZSA9IHJldGFpbmVkTW9kZWxSZWY7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJldGFpbmVkTW9kZWxSZWYub2JqZWN0Lm9uRGlkQ2hhbmdlRGlydHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCkpKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIocmV0YWluZWRNb2RlbFJlZi5vYmplY3Qub25EaWRDaGFuZ2VSZWFkb25seSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUNhcGFiaWxpdGllcy5maXJlKCkpKTtcblx0XHRcdFx0aWYgKHRoaXMuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzICE9PSBvbGRDYXBhYmlsaXRpZXMpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNhcGFiaWxpdGllcy5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyB1bmRvKCk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy51bmRvUmVkb1NlcnZpY2UudW5kbyh0aGlzLm1vZGlmaWVkUmVzb3VyY2UpO1xuXHR9XG5cblx0cHVibGljIHJlZG8oKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnVuZG9SZWRvU2VydmljZS5yZWRvKHRoaXMubW9kaWZpZWRSZXNvdXJjZSk7XG5cdH1cblxuXHRvdmVycmlkZSB0b1VudHlwZWQoX29wdGlvbnM/OiBJVW50eXBlZEVkaXRvck9wdGlvbnMpOiBJVW50eXBlZEVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4geyByZXNvdXJjZTogdGhpcy5yZXNvdXJjZSB9O1xuXHR9XG59XG4i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
