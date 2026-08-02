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
import { getWindow } from "../../../../base/browser/dom.js";
import { toAction } from "../../../../base/common/actions.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename } from "../../../../base/common/path.js";
import { dirname, isEqual } from "../../../../base/common/resources.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { EditorInputCapabilities, Verbosity, createEditorOpenError } from "../../../common/editor.js";
import { ICustomEditorLabelService } from "../../../services/editor/common/customEditorLabelService.js";
import { ICustomEditorService } from "../common/customEditor.js";
import { IWebviewService } from "../../webview/browser/webview.js";
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput } from "../../webviewPanel/browser/webviewWorkbenchService.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { IUntitledTextEditorService } from "../../../services/untitled/common/untitledTextEditorService.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
let CustomEditorInput = class extends LazilyResolvedWebviewEditorInput {
  constructor(init, webview, options, themeService, webviewWorkbenchService, instantiationService, labelService, customEditorService, fileDialogService, undoRedoService, fileService, filesConfigurationService, editorGroupsService, layoutService, customEditorLabelService) {
    super({ providedId: init.viewType, viewType: init.viewType, name: init.preferredName ?? "", iconPath: init.iconPath }, webview, themeService, webviewWorkbenchService);
    this.instantiationService = instantiationService;
    this.labelService = labelService;
    this.customEditorService = customEditorService;
    this.fileDialogService = fileDialogService;
    this.undoRedoService = undoRedoService;
    this.fileService = fileService;
    this.filesConfigurationService = filesConfigurationService;
    this.editorGroupsService = editorGroupsService;
    this.layoutService = layoutService;
    this.customEditorLabelService = customEditorLabelService;
    this._editorName = void 0;
    this._shortDescription = void 0;
    this._mediumDescription = void 0;
    this._longDescription = void 0;
    this._shortTitle = void 0;
    this._mediumTitle = void 0;
    this._longTitle = void 0;
    this._editorResource = init.resource;
    this.oldResource = options.oldResource;
    this._defaultDirtyState = options.startsDirty;
    this._backupId = options.backupId;
    this._untitledDocumentData = options.untitledDocumentData;
    this.registerListeners();
  }
  static create(instantiationService, init, group, options) {
    return instantiationService.invokeFunction((accessor) => {
      const untitledTextEditorService = accessor.get(IUntitledTextEditorService);
      const untitledTextModel = untitledTextEditorService.get(init.resource);
      const untitledString = untitledTextModel?.textEditorModel?.getValue();
      const untitledDocumentData = untitledString ? VSBuffer.fromString(untitledString) : void 0;
      const webview = accessor.get(IWebviewService).createWebviewOverlay({
        providedViewType: init.viewType,
        title: init.webviewTitle,
        options: { customClasses: options?.customClasses },
        contentOptions: {},
        extension: void 0
      });
      const input = instantiationService.createInstance(CustomEditorInput, init, webview, { untitledDocumentData, oldResource: options?.oldResource });
      if (typeof group !== "undefined") {
        input.updateGroup(group);
      }
      return input;
    });
  }
  get resource() {
    return this._editorResource;
  }
  registerListeners() {
    this._register(this.labelService.onDidChangeFormatters((e) => this.onLabelEvent(e.scheme)));
    this._register(this.fileService.onDidChangeFileSystemProviderRegistrations((e) => this.onLabelEvent(e.scheme)));
    this._register(this.fileService.onDidChangeFileSystemProviderCapabilities((e) => this.onLabelEvent(e.scheme)));
    this._register(this.customEditorLabelService.onDidChange(() => this.updateLabel()));
    this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
  }
  onLabelEvent(scheme) {
    if (scheme === this.resource.scheme) {
      this.updateLabel();
    }
  }
  updateLabel() {
    this._editorName = void 0;
    this._shortDescription = void 0;
    this._mediumDescription = void 0;
    this._longDescription = void 0;
    this._shortTitle = void 0;
    this._mediumTitle = void 0;
    this._longTitle = void 0;
    this._onDidChangeLabel.fire();
  }
  get typeId() {
    return CustomEditorInput.typeId;
  }
  get editorId() {
    return this.viewType;
  }
  get capabilities() {
    let capabilities = EditorInputCapabilities.None;
    capabilities |= EditorInputCapabilities.CanDropIntoEditor;
    if (!this.customEditorService.getCustomEditorCapabilities(this.viewType)?.supportsMultipleEditorsPerDocument) {
      capabilities |= EditorInputCapabilities.Singleton;
    }
    if (this.isReadonly()) {
      capabilities |= EditorInputCapabilities.Readonly;
    }
    if (this.resource.scheme === Schemas.untitled) {
      capabilities |= EditorInputCapabilities.Untitled;
    }
    return capabilities;
  }
  getName() {
    const customTitle = this.getWebviewTitle();
    if (customTitle) {
      return customTitle;
    }
    this._editorName ??= this.customEditorLabelService.getName(this.resource) ?? basename(this.labelService.getUriLabel(this.resource));
    return this._editorName;
  }
  getDescription(verbosity = Verbosity.MEDIUM) {
    switch (verbosity) {
      case Verbosity.SHORT:
        return this.shortDescription;
      case Verbosity.LONG:
        return this.longDescription;
      case Verbosity.MEDIUM:
      default:
        return this.mediumDescription;
    }
  }
  get shortDescription() {
    this._shortDescription ??= this.labelService.getUriBasenameLabel(dirname(this.resource));
    return this._shortDescription;
  }
  get mediumDescription() {
    this._mediumDescription ??= this.labelService.getUriLabel(dirname(this.resource), { relative: true });
    return this._mediumDescription;
  }
  get longDescription() {
    this._longDescription ??= this.labelService.getUriLabel(dirname(this.resource));
    return this._longDescription;
  }
  get shortTitle() {
    this._shortTitle ??= this.getName();
    return this._shortTitle;
  }
  get mediumTitle() {
    this._mediumTitle ??= this.labelService.getUriLabel(this.resource, { relative: true });
    return this._mediumTitle;
  }
  get longTitle() {
    this._longTitle ??= this.labelService.getUriLabel(this.resource);
    return this._longTitle;
  }
  getTitle(verbosity) {
    const customTitle = this.getWebviewTitle();
    if (customTitle) {
      return customTitle;
    }
    switch (verbosity) {
      case Verbosity.SHORT:
        return this.shortTitle;
      case Verbosity.LONG:
        return this.longTitle;
      default:
      case Verbosity.MEDIUM:
        return this.mediumTitle;
    }
  }
  matches(other) {
    if (super.matches(other)) {
      return true;
    }
    return this === other || other instanceof CustomEditorInput && this.viewType === other.viewType && isEqual(this.resource, other.resource);
  }
  copy() {
    return CustomEditorInput.create(
      this.instantiationService,
      { resource: this.resource, viewType: this.viewType, webviewTitle: this.getWebviewTitle(), preferredName: void 0, iconPath: this.iconPath },
      this.group,
      this.webview.options
    );
  }
  isReadonly() {
    if (!this._modelRef) {
      return this.filesConfigurationService.isReadonly(this.resource);
    }
    return this._modelRef.object.isReadonly();
  }
  isDirty() {
    if (!this._modelRef) {
      return !!this._defaultDirtyState;
    }
    return this._modelRef.object.isDirty();
  }
  async save(groupId, options) {
    if (!this._modelRef) {
      return void 0;
    }
    const target = await this._modelRef.object.saveCustomEditor(options);
    if (!target) {
      return void 0;
    }
    if (!isEqual(target, this.resource)) {
      return { resource: target };
    }
    return this;
  }
  async saveAs(groupId, options) {
    if (!this._modelRef) {
      return void 0;
    }
    const dialogPath = this._editorResource;
    const target = await this.fileDialogService.pickFileToSave(dialogPath, options?.availableFileSystems);
    if (!target) {
      return void 0;
    }
    if (!await this._modelRef.object.saveCustomEditorAs(this._editorResource, target, options)) {
      return void 0;
    }
    return (await this.rename(groupId, target))?.editor;
  }
  async revert(group, options) {
    if (this._modelRef) {
      return this._modelRef.object.revert(options);
    }
    this._defaultDirtyState = false;
    this._onDidChangeDirty.fire();
  }
  async resolve() {
    await super.resolve();
    if (this.isDisposed()) {
      return null;
    }
    if (!this._modelRef) {
      const oldCapabilities = this.capabilities;
      this._modelRef = this._register(assertReturnsDefined(await this.customEditorService.models.tryRetain(this.resource, this.viewType)));
      this._register(this._modelRef.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
      this._register(this._modelRef.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
      if (this._untitledDocumentData) {
        this._defaultDirtyState = true;
      }
      if (this.isDirty()) {
        this._onDidChangeDirty.fire();
      }
      if (this.capabilities !== oldCapabilities) {
        this._onDidChangeCapabilities.fire();
      }
    }
    return null;
  }
  async rename(group, newResource) {
    return { editor: { resource: newResource } };
  }
  undo() {
    assertReturnsDefined(this._modelRef);
    return this.undoRedoService.undo(this.resource);
  }
  redo() {
    assertReturnsDefined(this._modelRef);
    return this.undoRedoService.redo(this.resource);
  }
  onMove(handler) {
    this._moveHandler = handler;
  }
  transfer(other) {
    if (!super.transfer(other)) {
      return;
    }
    other._moveHandler = this._moveHandler;
    this._moveHandler = void 0;
    return other;
  }
  get backupId() {
    if (this._modelRef) {
      return this._modelRef.object.backupId;
    }
    return this._backupId;
  }
  get untitledDocumentData() {
    return this._untitledDocumentData;
  }
  toUntyped() {
    return {
      resource: this.resource,
      options: {
        override: this.viewType
      }
    };
  }
  claim(claimant, targetWindow, scopedContextKeyService) {
    if (this.doCanMove(targetWindow.vscodeWindowId) !== true) {
      throw createEditorOpenError(localize("editorUnsupportedInWindow", "Unable to open the editor in this window, it contains modifications that can only be saved in the original window."), [
        toAction({
          id: "openInOriginalWindow",
          label: localize("reopenInOriginalWindow", "Open in Original Window"),
          run: async () => {
            const originalPart = this.editorGroupsService.getPart(this.layoutService.getContainer(getWindow(this.webview.container).window));
            const currentPart = this.editorGroupsService.getPart(this.layoutService.getContainer(targetWindow.window));
            currentPart.activeGroup.moveEditor(this, originalPart.activeGroup);
          }
        })
      ], { forceMessage: true });
    }
    return super.claim(claimant, targetWindow, scopedContextKeyService);
  }
  canMove(sourceGroup, targetGroup) {
    const resolvedTargetGroup = this.editorGroupsService.getGroup(targetGroup);
    if (resolvedTargetGroup) {
      const canMove = this.doCanMove(resolvedTargetGroup.windowId);
      if (typeof canMove === "string") {
        return canMove;
      }
    }
    return super.canMove(sourceGroup, targetGroup);
  }
  doCanMove(targetWindowId) {
    if (this.isModified() && this._modelRef?.object.canHotExit === false) {
      const sourceWindowId = getWindow(this.webview.container).vscodeWindowId;
      if (sourceWindowId !== targetWindowId) {
        return localize("editorCannotMove", "Unable to move '{0}': The editor contains changes that can only be saved in its current window.", this.getName());
      }
    }
    return true;
  }
};
CustomEditorInput.typeId = "workbench.editors.webviewEditor";
CustomEditorInput = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, IWebviewWorkbenchService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, ICustomEditorService),
  __decorateParam(8, IFileDialogService),
  __decorateParam(9, IUndoRedoService),
  __decorateParam(10, IFileService),
  __decorateParam(11, IFilesConfigurationService),
  __decorateParam(12, IEditorGroupsService),
  __decorateParam(13, IWorkbenchLayoutService),
  __decorateParam(14, ICustomEditorLabelService)
], CustomEditorInput);
export {
  CustomEditorInput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2N1c3RvbUVkaXRvci9icm93c2VyL2N1c3RvbUVkaXRvcklucHV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2RlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElVbmRvUmVkb1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8uanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMsIEdyb3VwSWRlbnRpZmllciwgSU1vdmVSZXN1bHQsIElSZXZlcnRPcHRpb25zLCBJU2F2ZU9wdGlvbnMsIElVbnR5cGVkRWRpdG9ySW5wdXQsIFZlcmJvc2l0eSwgY3JlYXRlRWRpdG9yT3BlbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vY3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21FZGl0b3JNb2RlbCwgSUN1c3RvbUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY3VzdG9tRWRpdG9yLmpzJztcbmltcG9ydCB7IElPdmVybGF5V2VidmlldywgSVdlYnZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd2Vidmlldy9icm93c2VyL3dlYnZpZXcuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlLCBMYXppbHlSZXNvbHZlZFdlYnZpZXdFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL3dlYnZpZXdQYW5lbC9icm93c2VyL3dlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VudGl0bGVkL2NvbW1vbi91bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFdlYnZpZXdJY29uUGF0aCB9IGZyb20gJy4uLy4uL3dlYnZpZXdQYW5lbC9icm93c2VyL3dlYnZpZXdFZGl0b3JJbnB1dC5qcyc7XG5cbmludGVyZmFjZSBDdXN0b21FZGl0b3JJbnB1dEluaXRJbmZvIHtcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgdmlld1R5cGU6IHN0cmluZztcblx0cmVhZG9ubHkgd2Vidmlld1RpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHByZWZlcnJlZE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaWNvblBhdGg6IFdlYnZpZXdJY29uUGF0aCB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIEN1c3RvbUVkaXRvcklucHV0IGV4dGVuZHMgTGF6aWx5UmVzb2x2ZWRXZWJ2aWV3RWRpdG9ySW5wdXQge1xuXG5cdHN0YXRpYyBjcmVhdGUoXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRpbml0OiBDdXN0b21FZGl0b3JJbnB1dEluaXRJbmZvLFxuXHRcdGdyb3VwOiBHcm91cElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9ucz86IHsgcmVhZG9ubHkgY3VzdG9tQ2xhc3Nlcz86IHN0cmluZzsgcmVhZG9ubHkgb2xkUmVzb3VyY2U/OiBVUkkgfSxcblx0KTogRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHQvLyBJZiBpdCdzIGFuIHVudGl0bGVkIGZpbGUgd2UgbXVzdCBwb3B1bGF0ZSB0aGUgdW50aXRsZWREb2N1bWVudERhdGFcblx0XHRcdGNvbnN0IHVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdW50aXRsZWRUZXh0TW9kZWwgPSB1bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLmdldChpbml0LnJlc291cmNlKTtcblx0XHRcdGNvbnN0IHVudGl0bGVkU3RyaW5nID0gdW50aXRsZWRUZXh0TW9kZWw/LnRleHRFZGl0b3JNb2RlbD8uZ2V0VmFsdWUoKTtcblx0XHRcdGNvbnN0IHVudGl0bGVkRG9jdW1lbnREYXRhID0gdW50aXRsZWRTdHJpbmcgPyBWU0J1ZmZlci5mcm9tU3RyaW5nKHVudGl0bGVkU3RyaW5nKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3Qgd2VidmlldyA9IGFjY2Vzc29yLmdldChJV2Vidmlld1NlcnZpY2UpLmNyZWF0ZVdlYnZpZXdPdmVybGF5KHtcblx0XHRcdFx0cHJvdmlkZWRWaWV3VHlwZTogaW5pdC52aWV3VHlwZSxcblx0XHRcdFx0dGl0bGU6IGluaXQud2Vidmlld1RpdGxlLFxuXHRcdFx0XHRvcHRpb25zOiB7IGN1c3RvbUNsYXNzZXM6IG9wdGlvbnM/LmN1c3RvbUNsYXNzZXMgfSxcblx0XHRcdFx0Y29udGVudE9wdGlvbnM6IHt9LFxuXHRcdFx0XHRleHRlbnNpb246IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDdXN0b21FZGl0b3JJbnB1dCwgaW5pdCwgd2VidmlldywgeyB1bnRpdGxlZERvY3VtZW50RGF0YTogdW50aXRsZWREb2N1bWVudERhdGEsIG9sZFJlc291cmNlOiBvcHRpb25zPy5vbGRSZXNvdXJjZSB9KTtcblx0XHRcdGlmICh0eXBlb2YgZ3JvdXAgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdGlucHV0LnVwZGF0ZUdyb3VwKGdyb3VwKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnB1dDtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgb3ZlcnJpZGUgcmVhZG9ubHkgdHlwZUlkID0gJ3dvcmtiZW5jaC5lZGl0b3JzLndlYnZpZXdFZGl0b3InO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclJlc291cmNlOiBVUkk7XG5cdHB1YmxpYyByZWFkb25seSBvbGRSZXNvdXJjZT86IFVSSTtcblx0cHJpdmF0ZSBfZGVmYXVsdERpcnR5U3RhdGU6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfZWRpdG9yTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JhY2t1cElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdW50aXRsZWREb2N1bWVudERhdGE6IFZTQnVmZmVyIHwgdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIGdldCByZXNvdXJjZSgpIHsgcmV0dXJuIHRoaXMuX2VkaXRvclJlc291cmNlOyB9XG5cblx0cHJpdmF0ZSBfbW9kZWxSZWY/OiBJUmVmZXJlbmNlPElDdXN0b21FZGl0b3JNb2RlbD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aW5pdDogQ3VzdG9tRWRpdG9ySW5wdXRJbml0SW5mbyxcblx0XHR3ZWJ2aWV3OiBJT3ZlcmxheVdlYnZpZXcsXG5cdFx0b3B0aW9uczogeyBzdGFydHNEaXJ0eT86IGJvb2xlYW47IGJhY2t1cElkPzogc3RyaW5nOyB1bnRpdGxlZERvY3VtZW50RGF0YT86IFZTQnVmZmVyOyByZWFkb25seSBvbGRSZXNvdXJjZT86IFVSSSB9LFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVdlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlIHdlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlOiBJV2Vidmlld1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElDdXN0b21FZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY3VzdG9tRWRpdG9yU2VydmljZTogSUN1c3RvbUVkaXRvclNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElVbmRvUmVkb1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1bmRvUmVkb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjdXN0b21FZGl0b3JMYWJlbFNlcnZpY2U6IElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHsgcHJvdmlkZWRJZDogaW5pdC52aWV3VHlwZSwgdmlld1R5cGU6IGluaXQudmlld1R5cGUsIG5hbWU6IGluaXQucHJlZmVycmVkTmFtZSA/PyAnJywgaWNvblBhdGg6IGluaXQuaWNvblBhdGggfSwgd2VidmlldywgdGhlbWVTZXJ2aWNlLCB3ZWJ2aWV3V29ya2JlbmNoU2VydmljZSk7XG5cdFx0dGhpcy5fZWRpdG9yUmVzb3VyY2UgPSBpbml0LnJlc291cmNlO1xuXHRcdHRoaXMub2xkUmVzb3VyY2UgPSBvcHRpb25zLm9sZFJlc291cmNlO1xuXHRcdHRoaXMuX2RlZmF1bHREaXJ0eVN0YXRlID0gb3B0aW9ucy5zdGFydHNEaXJ0eTtcblx0XHR0aGlzLl9iYWNrdXBJZCA9IG9wdGlvbnMuYmFja3VwSWQ7XG5cdFx0dGhpcy5fdW50aXRsZWREb2N1bWVudERhdGEgPSBvcHRpb25zLnVudGl0bGVkRG9jdW1lbnREYXRhO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHQvLyBDbGVhciBvdXIgbGFiZWxzIG9uIGNlcnRhaW4gbGFiZWwgcmVsYXRlZCBldmVudHNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhYmVsU2VydmljZS5vbkRpZENoYW5nZUZvcm1hdHRlcnMoZSA9PiB0aGlzLm9uTGFiZWxFdmVudChlLnNjaGVtZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9ucyhlID0+IHRoaXMub25MYWJlbEV2ZW50KGUuc2NoZW1lKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMoZSA9PiB0aGlzLm9uTGFiZWxFdmVudChlLnNjaGVtZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmN1c3RvbUVkaXRvckxhYmVsU2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZUxhYmVsKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VSZWFkb25seSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUNhcGFiaWxpdGllcy5maXJlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25MYWJlbEV2ZW50KHNjaGVtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHNjaGVtZSA9PT0gdGhpcy5yZXNvdXJjZS5zY2hlbWUpIHtcblx0XHRcdHRoaXMudXBkYXRlTGFiZWwoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUxhYmVsKCk6IHZvaWQge1xuXG5cdFx0Ly8gQ2xlYXIgYW55IGNhY2hlZCBsYWJlbHMgZnJvbSBiZWZvcmVcblx0XHR0aGlzLl9lZGl0b3JOYW1lID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Nob3J0RGVzY3JpcHRpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbWVkaXVtRGVzY3JpcHRpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbG9uZ0Rlc2NyaXB0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Nob3J0VGl0bGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbWVkaXVtVGl0bGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbG9uZ1RpdGxlID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gVHJpZ2dlciByZWNvbXB1dGUgb2YgbGFiZWxcblx0XHR0aGlzLl9vbkRpZENoYW5nZUxhYmVsLmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEN1c3RvbUVkaXRvcklucHV0LnR5cGVJZDtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXQgZWRpdG9ySWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMudmlld1R5cGU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0IGNhcGFiaWxpdGllcygpOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcyB7XG5cdFx0bGV0IGNhcGFiaWxpdGllcyA9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLk5vbmU7XG5cblx0XHRjYXBhYmlsaXRpZXMgfD0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuQ2FuRHJvcEludG9FZGl0b3I7XG5cblx0XHRpZiAoIXRoaXMuY3VzdG9tRWRpdG9yU2VydmljZS5nZXRDdXN0b21FZGl0b3JDYXBhYmlsaXRpZXModGhpcy52aWV3VHlwZSk/LnN1cHBvcnRzTXVsdGlwbGVFZGl0b3JzUGVyRG9jdW1lbnQpIHtcblx0XHRcdGNhcGFiaWxpdGllcyB8PSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TaW5nbGV0b247XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNSZWFkb25seSgpKSB7XG5cdFx0XHRjYXBhYmlsaXRpZXMgfD0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuUmVhZG9ubHk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRjYXBhYmlsaXRpZXMgfD0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNhcGFiaWxpdGllcztcblx0fVxuXG5cdG92ZXJyaWRlIGdldE5hbWUoKTogc3RyaW5nIHtcblx0XHRjb25zdCBjdXN0b21UaXRsZSA9IHRoaXMuZ2V0V2Vidmlld1RpdGxlKCk7XG5cdFx0aWYgKGN1c3RvbVRpdGxlKSB7XG5cdFx0XHRyZXR1cm4gY3VzdG9tVGl0bGU7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdG9yTmFtZSA/Pz0gdGhpcy5jdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UuZ2V0TmFtZSh0aGlzLnJlc291cmNlKSA/PyBiYXNlbmFtZSh0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh0aGlzLnJlc291cmNlKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvck5hbWU7XG5cdH1cblxuXHRvdmVycmlkZSBnZXREZXNjcmlwdGlvbih2ZXJib3NpdHkgPSBWZXJib3NpdHkuTUVESVVNKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRzd2l0Y2ggKHZlcmJvc2l0eSkge1xuXHRcdFx0Y2FzZSBWZXJib3NpdHkuU0hPUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnNob3J0RGVzY3JpcHRpb247XG5cdFx0XHRjYXNlIFZlcmJvc2l0eS5MT05HOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5sb25nRGVzY3JpcHRpb247XG5cdFx0XHRjYXNlIFZlcmJvc2l0eS5NRURJVU06XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5tZWRpdW1EZXNjcmlwdGlvbjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG9ydERlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IHNob3J0RGVzY3JpcHRpb24oKTogc3RyaW5nIHtcblx0XHR0aGlzLl9zaG9ydERlc2NyaXB0aW9uID8/PSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKGRpcm5hbWUodGhpcy5yZXNvdXJjZSkpO1xuXHRcdHJldHVybiB0aGlzLl9zaG9ydERlc2NyaXB0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWVkaXVtRGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgbWVkaXVtRGVzY3JpcHRpb24oKTogc3RyaW5nIHtcblx0XHR0aGlzLl9tZWRpdW1EZXNjcmlwdGlvbiA/Pz0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGlybmFtZSh0aGlzLnJlc291cmNlKSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gdGhpcy5fbWVkaXVtRGVzY3JpcHRpb247XG5cdH1cblxuXHRwcml2YXRlIF9sb25nRGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgbG9uZ0Rlc2NyaXB0aW9uKCk6IHN0cmluZyB7XG5cdFx0dGhpcy5fbG9uZ0Rlc2NyaXB0aW9uID8/PSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKHRoaXMucmVzb3VyY2UpKTtcblx0XHRyZXR1cm4gdGhpcy5fbG9uZ0Rlc2NyaXB0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvcnRUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBzaG9ydFRpdGxlKCk6IHN0cmluZyB7XG5cdFx0dGhpcy5fc2hvcnRUaXRsZSA/Pz0gdGhpcy5nZXROYW1lKCk7XG5cdFx0cmV0dXJuIHRoaXMuX3Nob3J0VGl0bGU7XG5cdH1cblxuXHRwcml2YXRlIF9tZWRpdW1UaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBtZWRpdW1UaXRsZSgpOiBzdHJpbmcge1xuXHRcdHRoaXMuX21lZGl1bVRpdGxlID8/PSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh0aGlzLnJlc291cmNlLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdHJldHVybiB0aGlzLl9tZWRpdW1UaXRsZTtcblx0fVxuXG5cdHByaXZhdGUgX2xvbmdUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBsb25nVGl0bGUoKTogc3RyaW5nIHtcblx0XHR0aGlzLl9sb25nVGl0bGUgPz89IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHRoaXMucmVzb3VyY2UpO1xuXHRcdHJldHVybiB0aGlzLl9sb25nVGl0bGU7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRUaXRsZSh2ZXJib3NpdHk/OiBWZXJib3NpdHkpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGN1c3RvbVRpdGxlID0gdGhpcy5nZXRXZWJ2aWV3VGl0bGUoKTtcblx0XHRpZiAoY3VzdG9tVGl0bGUpIHtcblx0XHRcdHJldHVybiBjdXN0b21UaXRsZTtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKHZlcmJvc2l0eSkge1xuXHRcdFx0Y2FzZSBWZXJib3NpdHkuU0hPUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnNob3J0VGl0bGU7XG5cdFx0XHRjYXNlIFZlcmJvc2l0eS5MT05HOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5sb25nVGl0bGU7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0Y2FzZSBWZXJib3NpdHkuTUVESVVNOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5tZWRpdW1UaXRsZTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgbWF0Y2hlcyhvdGhlcjogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0aWYgKHN1cGVyLm1hdGNoZXMob3RoZXIpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMgPT09IG90aGVyIHx8IChvdGhlciBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvcklucHV0XG5cdFx0XHQmJiB0aGlzLnZpZXdUeXBlID09PSBvdGhlci52aWV3VHlwZVxuXHRcdFx0JiYgaXNFcXVhbCh0aGlzLnJlc291cmNlLCBvdGhlci5yZXNvdXJjZSkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGNvcHkoKTogRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBDdXN0b21FZGl0b3JJbnB1dC5jcmVhdGUodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdHsgcmVzb3VyY2U6IHRoaXMucmVzb3VyY2UsIHZpZXdUeXBlOiB0aGlzLnZpZXdUeXBlLCB3ZWJ2aWV3VGl0bGU6IHRoaXMuZ2V0V2Vidmlld1RpdGxlKCksIHByZWZlcnJlZE5hbWU6IHVuZGVmaW5lZCwgaWNvblBhdGg6IHRoaXMuaWNvblBhdGgsIH0sXG5cdFx0XHR0aGlzLmdyb3VwLFxuXHRcdFx0dGhpcy53ZWJ2aWV3Lm9wdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGlzUmVhZG9ubHkoKTogYm9vbGVhbiB8IElNYXJrZG93blN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5pc1JlYWRvbmx5KHRoaXMucmVzb3VyY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxSZWYub2JqZWN0LmlzUmVhZG9ubHkoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBpc0RpcnR5KCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fbW9kZWxSZWYpIHtcblx0XHRcdHJldHVybiAhIXRoaXMuX2RlZmF1bHREaXJ0eVN0YXRlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxSZWYub2JqZWN0LmlzRGlydHkoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyBzYXZlKGdyb3VwSWQ6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8RWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCB0aGlzLl9tb2RlbFJlZi5vYmplY3Quc2F2ZUN1c3RvbUVkaXRvcihvcHRpb25zKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gc2F2ZSBjYW5jZWxsZWRcblx0XHR9XG5cblx0XHQvLyBEaWZmZXJlbnQgVVJJcyA9PSB1bnR5cGVkIGlucHV0IHJldHVybmVkIHRvIGFsbG93IHJlc29sdmVyIHRvIHBvc3NpYmx5IHJlc29sdmUgdG8gYSBkaWZmZXJlbnQgZWRpdG9yIHR5cGVcblx0XHRpZiAoIWlzRXF1YWwodGFyZ2V0LCB0aGlzLnJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHsgcmVzb3VyY2U6IHRhcmdldCB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHNhdmVBcyhncm91cElkOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5fbW9kZWxSZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlhbG9nUGF0aCA9IHRoaXMuX2VkaXRvclJlc291cmNlO1xuXHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UucGlja0ZpbGVUb1NhdmUoZGlhbG9nUGF0aCwgb3B0aW9ucz8uYXZhaWxhYmxlRmlsZVN5c3RlbXMpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBzYXZlIGNhbmNlbGxlZFxuXHRcdH1cblxuXHRcdGlmICghYXdhaXQgdGhpcy5fbW9kZWxSZWYub2JqZWN0LnNhdmVDdXN0b21FZGl0b3JBcyh0aGlzLl9lZGl0b3JSZXNvdXJjZSwgdGFyZ2V0LCBvcHRpb25zKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMucmVuYW1lKGdyb3VwSWQsIHRhcmdldCkpPy5lZGl0b3I7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgcmV2ZXJ0KGdyb3VwOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJUmV2ZXJ0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9tb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21vZGVsUmVmLm9iamVjdC5yZXZlcnQob3B0aW9ucyk7XG5cdFx0fVxuXHRcdHRoaXMuX2RlZmF1bHREaXJ0eVN0YXRlID0gZmFsc2U7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZSgpOiBQcm9taXNlPG51bGw+IHtcblx0XHRhd2FpdCBzdXBlci5yZXNvbHZlKCk7XG5cblx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fbW9kZWxSZWYpIHtcblx0XHRcdGNvbnN0IG9sZENhcGFiaWxpdGllcyA9IHRoaXMuY2FwYWJpbGl0aWVzO1xuXHRcdFx0dGhpcy5fbW9kZWxSZWYgPSB0aGlzLl9yZWdpc3Rlcihhc3NlcnRSZXR1cm5zRGVmaW5lZChhd2FpdCB0aGlzLmN1c3RvbUVkaXRvclNlcnZpY2UubW9kZWxzLnRyeVJldGFpbih0aGlzLnJlc291cmNlLCB0aGlzLnZpZXdUeXBlKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbW9kZWxSZWYub2JqZWN0Lm9uRGlkQ2hhbmdlRGlydHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21vZGVsUmVmLm9iamVjdC5vbkRpZENoYW5nZVJlYWRvbmx5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzLmZpcmUoKSkpO1xuXHRcdFx0Ly8gSWYgd2UncmUgbG9hZGluZyB1bnRpdGxlZCBmaWxlIGRhdGEgd2Ugc2hvdWxkIGVuc3VyZSBpdCdzIGRpcnR5XG5cdFx0XHRpZiAodGhpcy5fdW50aXRsZWREb2N1bWVudERhdGEpIHtcblx0XHRcdFx0dGhpcy5fZGVmYXVsdERpcnR5U3RhdGUgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzICE9PSBvbGRDYXBhYmlsaXRpZXMpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHJlbmFtZShncm91cDogR3JvdXBJZGVudGlmaWVyLCBuZXdSZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJTW92ZVJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIFdlIHJldHVybiBhbiB1bnR5cGVkIGVkaXRvciBpbnB1dCB3aGljaCBjYW4gdGhlbiBiZSByZXNvbHZlZCBpbiB0aGUgZWRpdG9yIHNlcnZpY2Vcblx0XHRyZXR1cm4geyBlZGl0b3I6IHsgcmVzb3VyY2U6IG5ld1Jlc291cmNlIH0gfTtcblx0fVxuXG5cdHB1YmxpYyB1bmRvKCk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLl9tb2RlbFJlZik7XG5cdFx0cmV0dXJuIHRoaXMudW5kb1JlZG9TZXJ2aWNlLnVuZG8odGhpcy5yZXNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVkbygpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5fbW9kZWxSZWYpO1xuXHRcdHJldHVybiB0aGlzLnVuZG9SZWRvU2VydmljZS5yZWRvKHRoaXMucmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbW92ZUhhbmRsZXI/OiAobmV3UmVzb3VyY2U6IFVSSSkgPT4gdm9pZDtcblxuXHRwdWJsaWMgb25Nb3ZlKGhhbmRsZXI6IChuZXdSZXNvdXJjZTogVVJJKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Ly8gVE9ETzogTW92ZSB0aGlzIHRvIHRoZSBzZXJ2aWNlXG5cdFx0dGhpcy5fbW92ZUhhbmRsZXIgPSBoYW5kbGVyO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHRyYW5zZmVyKG90aGVyOiBDdXN0b21FZGl0b3JJbnB1dCk6IEN1c3RvbUVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXN1cGVyLnRyYW5zZmVyKG90aGVyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdG90aGVyLl9tb3ZlSGFuZGxlciA9IHRoaXMuX21vdmVIYW5kbGVyO1xuXHRcdHRoaXMuX21vdmVIYW5kbGVyID0gdW5kZWZpbmVkO1xuXHRcdHJldHVybiBvdGhlcjtcblx0fVxuXG5cdHB1YmxpYyBnZXQgYmFja3VwSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fbW9kZWxSZWYpIHtcblx0XHRcdHJldHVybiB0aGlzLl9tb2RlbFJlZi5vYmplY3QuYmFja3VwSWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9iYWNrdXBJZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdW50aXRsZWREb2N1bWVudERhdGEoKTogVlNCdWZmZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl91bnRpdGxlZERvY3VtZW50RGF0YTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSB0b1VudHlwZWQoKTogSVJlc291cmNlRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZTogdGhpcy5yZXNvdXJjZSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0b3ZlcnJpZGU6IHRoaXMudmlld1R5cGVcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGNsYWltKGNsYWltYW50OiB1bmtub3duLCB0YXJnZXRXaW5kb3c6IENvZGVXaW5kb3csIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5kb0Nhbk1vdmUodGFyZ2V0V2luZG93LnZzY29kZVdpbmRvd0lkKSAhPT0gdHJ1ZSkge1xuXHRcdFx0dGhyb3cgY3JlYXRlRWRpdG9yT3BlbkVycm9yKGxvY2FsaXplKCdlZGl0b3JVbnN1cHBvcnRlZEluV2luZG93JywgXCJVbmFibGUgdG8gb3BlbiB0aGUgZWRpdG9yIGluIHRoaXMgd2luZG93LCBpdCBjb250YWlucyBtb2RpZmljYXRpb25zIHRoYXQgY2FuIG9ubHkgYmUgc2F2ZWQgaW4gdGhlIG9yaWdpbmFsIHdpbmRvdy5cIiksIFtcblx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdGlkOiAnb3BlbkluT3JpZ2luYWxXaW5kb3cnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVvcGVuSW5PcmlnaW5hbFdpbmRvdycsIFwiT3BlbiBpbiBPcmlnaW5hbCBXaW5kb3dcIiksXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbFBhcnQgPSB0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0UGFydCh0aGlzLmxheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKGdldFdpbmRvdyh0aGlzLndlYnZpZXcuY29udGFpbmVyKS53aW5kb3cpKTtcblx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRQYXJ0ID0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmdldFBhcnQodGhpcy5sYXlvdXRTZXJ2aWNlLmdldENvbnRhaW5lcih0YXJnZXRXaW5kb3cud2luZG93KSk7XG5cdFx0XHRcdFx0XHRjdXJyZW50UGFydC5hY3RpdmVHcm91cC5tb3ZlRWRpdG9yKHRoaXMsIG9yaWdpbmFsUGFydC5hY3RpdmVHcm91cCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KVxuXHRcdFx0XSwgeyBmb3JjZU1lc3NhZ2U6IHRydWUgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5jbGFpbShjbGFpbWFudCwgdGFyZ2V0V2luZG93LCBzY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgY2FuTW92ZShzb3VyY2VHcm91cDogR3JvdXBJZGVudGlmaWVyLCB0YXJnZXRHcm91cDogR3JvdXBJZGVudGlmaWVyKTogdHJ1ZSB8IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVzb2x2ZWRUYXJnZXRHcm91cCA9IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5nZXRHcm91cCh0YXJnZXRHcm91cCk7XG5cdFx0aWYgKHJlc29sdmVkVGFyZ2V0R3JvdXApIHtcblx0XHRcdGNvbnN0IGNhbk1vdmUgPSB0aGlzLmRvQ2FuTW92ZShyZXNvbHZlZFRhcmdldEdyb3VwLndpbmRvd0lkKTtcblx0XHRcdGlmICh0eXBlb2YgY2FuTW92ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIGNhbk1vdmU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLmNhbk1vdmUoc291cmNlR3JvdXAsIHRhcmdldEdyb3VwKTtcblx0fVxuXG5cdHByaXZhdGUgZG9DYW5Nb3ZlKHRhcmdldFdpbmRvd0lkOiBudW1iZXIpOiB0cnVlIHwgc3RyaW5nIHtcblx0XHRpZiAodGhpcy5pc01vZGlmaWVkKCkgJiYgdGhpcy5fbW9kZWxSZWY/Lm9iamVjdC5jYW5Ib3RFeGl0ID09PSBmYWxzZSkge1xuXHRcdFx0Y29uc3Qgc291cmNlV2luZG93SWQgPSBnZXRXaW5kb3codGhpcy53ZWJ2aWV3LmNvbnRhaW5lcikudnNjb2RlV2luZG93SWQ7XG5cdFx0XHRpZiAoc291cmNlV2luZG93SWQgIT09IHRhcmdldFdpbmRvd0lkKSB7XG5cblx0XHRcdFx0Ly8gVGhlIGN1c3RvbSBlZGl0b3IgaXMgbW9kaWZpZWQsIG5vdCBiYWNrZWQgYnkgYSBmaWxlIGFuZCB3aXRob3V0IGEgYmFja3VwLlxuXHRcdFx0XHQvLyBXZSBoYXZlIHRvIGFzc3VtZSB0aGF0IHRoZSBtb2RpZmllZCBzdGF0ZSBpcyBlbmNsb3NlZCBpbnRvIHRoZSB3ZWJ2aWV3XG5cdFx0XHRcdC8vIG1hbmFnZWQgYnkgYW4gZXh0ZW5zaW9uLiBBcyBzdWNoLCB3ZSBjYW5ub3QganVzdCBtb3ZlIHRoZSB3ZWJ2aWV3XG5cdFx0XHRcdC8vIGludG8gYW5vdGhlciB3aW5kb3cgYmVjYXVzZSB0aGF0IG1lYW5zLCB3ZSBwb3RlbnRhbGx5IGxvb3NlIHRoZSBtb2RpZmllZFxuXHRcdFx0XHQvLyBzdGF0ZSBhbmQgdGh1cyB0cmlnZ2VyIGRhdGEgbG9zcy5cblxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2VkaXRvckNhbm5vdE1vdmUnLCBcIlVuYWJsZSB0byBtb3ZlICd7MH0nOiBUaGUgZWRpdG9yIGNvbnRhaW5zIGNoYW5nZXMgdGhhdCBjYW4gb25seSBiZSBzYXZlZCBpbiBpdHMgY3VycmVudCB3aW5kb3cuXCIsIHRoaXMuZ2V0TmFtZSgpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUd6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGVBQWU7QUFDakMsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBMEcsV0FBVyw2QkFBNkI7QUFFM0osU0FBUyxpQ0FBaUM7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
