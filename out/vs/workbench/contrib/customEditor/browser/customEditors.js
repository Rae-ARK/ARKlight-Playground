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
import "./media/customEditor.css";
import { coalesce } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { RedoCommand, UndoCommand } from "../../../../editor/browser/editorExtensions.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { FileOperation, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { DEFAULT_EDITOR_ASSOCIATION, EditorExtensions } from "../../../common/editor.js";
import { DiffEditorInput } from "../../../common/editor/diffEditorInput.js";
import { ActiveCustomEditorDiffCanToggleLayoutContext, ActiveCustomEditorTextDiffContext } from "../../../common/contextkeys.js";
import { CONTEXT_ACTIVE_CUSTOM_EDITOR_ID, CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE, CustomEditorDiffEditorLayout, CustomEditorInfoCollection } from "../common/customEditor.js";
import { CustomEditorModelManager } from "../common/customEditorModelManager.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorResolverService, RegisteredEditorPriority } from "../../../services/editor/common/editorResolverService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ContributedCustomEditors } from "../common/contributedCustomEditors.js";
import { CustomEditorDiffInput, CustomEditorSideBySideDiffInput } from "./customEditorDiffInput.js";
import { CustomEditorInput } from "./customEditorInput.js";
let CustomEditorService = class extends Disposable {
  constructor(fileService, storageService, editorService, editorGroupService, instantiationService, uriIdentityService, editorResolverService, textResourceConfigurationService, extensionService) {
    super();
    this.editorService = editorService;
    this.editorGroupService = editorGroupService;
    this.instantiationService = instantiationService;
    this.uriIdentityService = uriIdentityService;
    this.editorResolverService = editorResolverService;
    this.textResourceConfigurationService = textResourceConfigurationService;
    this.extensionService = extensionService;
    this._untitledCounter = 0;
    this._editorResolverDisposables = this._register(new DisposableStore());
    this._editorCapabilities = /* @__PURE__ */ new Map();
    this._onDidChangeEditorTypes = this._register(new Emitter());
    this.onDidChangeEditorTypes = this._onDidChangeEditorTypes.event;
    this._fileEditorFactory = Registry.as(EditorExtensions.EditorFactory).getFileEditorFactory();
    this._models = new CustomEditorModelManager();
    this._contributedEditors = this._register(new ContributedCustomEditors(storageService));
    this.editorResolverService.bufferChangeEvents(this.registerContributionPoints.bind(this));
    this._register(this._contributedEditors.onChange(() => {
      this.editorResolverService.bufferChangeEvents(this.registerContributionPoints.bind(this));
      this._onDidChangeEditorTypes.fire();
    }));
    const activeCustomEditorContextKeyProvider = {
      contextKey: CONTEXT_ACTIVE_CUSTOM_EDITOR_ID,
      getGroupContextKeyValue: (group) => this.getActiveCustomEditorId(group),
      onDidChange: this.onDidChangeEditorTypes
    };
    const customEditorIsEditableContextKeyProvider = {
      contextKey: CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE,
      getGroupContextKeyValue: (group) => this.getCustomEditorIsEditable(group),
      onDidChange: this.onDidChangeEditorTypes
    };
    const customEditorDiffCanToggleLayoutContextKeyProvider = {
      contextKey: ActiveCustomEditorDiffCanToggleLayoutContext,
      getGroupContextKeyValue: (group) => this.getActiveCustomEditorDiffCanToggleLayout(group),
      onDidChange: this.onDidChangeEditorTypes
    };
    const customEditorTextDiffContextKeyProvider = {
      contextKey: ActiveCustomEditorTextDiffContext,
      getGroupContextKeyValue: (group) => this.getActiveCustomEditorTextDiff(group),
      onDidChange: this.onDidChangeEditorTypes
    };
    this._register(this.editorGroupService.registerContextKeyProvider(activeCustomEditorContextKeyProvider));
    this._register(this.editorGroupService.registerContextKeyProvider(customEditorIsEditableContextKeyProvider));
    this._register(this.editorGroupService.registerContextKeyProvider(customEditorDiffCanToggleLayoutContextKeyProvider));
    this._register(this.editorGroupService.registerContextKeyProvider(customEditorTextDiffContextKeyProvider));
    this._register(this.textResourceConfigurationService.onDidChangeConfiguration((e) => {
      void this.updateCustomDiffEditorsForDiffConfigurationChange(e);
    }));
    this._register(fileService.onDidRunOperation((e) => {
      if (e.isOperation(FileOperation.MOVE)) {
        this.handleMovedFileInOpenedFileEditors(e.resource, this.uriIdentityService.asCanonicalUri(e.target.resource));
      }
      if (e.isOperation(FileOperation.DELETE)) {
        this.handleDeletedFile(e.resource);
      }
    }));
    const PRIORITY = 105;
    this._register(UndoCommand.addImplementation(PRIORITY, "custom-editor", () => {
      return this.withActiveCustomEditor((editor) => editor.undo());
    }));
    this._register(RedoCommand.addImplementation(PRIORITY, "custom-editor", () => {
      return this.withActiveCustomEditor((editor) => editor.redo());
    }));
  }
  getEditorTypes() {
    return [...this._contributedEditors];
  }
  withActiveCustomEditor(f) {
    const editor = this.getActiveCustomEditorUndoRedoInput();
    if (editor) {
      const result = f(editor);
      if (result) {
        return result;
      }
      return true;
    }
    return false;
  }
  getActiveCustomEditorUndoRedoInput() {
    const activeEditor = this.editorService.activeEditor;
    if (activeEditor instanceof CustomEditorInput || activeEditor instanceof CustomEditorDiffInput || activeEditor instanceof CustomEditorSideBySideDiffInput) {
      return activeEditor;
    }
    if (activeEditor instanceof DiffEditorInput && activeEditor.modified instanceof CustomEditorSideBySideDiffInput) {
      return activeEditor.modified;
    }
    return void 0;
  }
  registerContributionPoints() {
    this._editorResolverDisposables.clear();
    for (const contributedEditor of this._contributedEditors) {
      for (const globPattern of contributedEditor.selector) {
        if (!globPattern.filenamePattern) {
          continue;
        }
        this._editorResolverDisposables.add(this.editorResolverService.registerEditor(
          globPattern.filenamePattern,
          {
            id: contributedEditor.id,
            label: contributedEditor.displayName,
            detail: contributedEditor.providerDisplayName,
            priority: contributedEditor.priority
          },
          {
            singlePerResource: () => !(this.getCustomEditorCapabilities(contributedEditor.id)?.supportsMultipleEditorsPerDocument ?? false)
          },
          {
            createEditorInput: ({ resource, label }, group) => {
              return { editor: CustomEditorInput.create(this.instantiationService, { resource, viewType: contributedEditor.id, webviewTitle: void 0, preferredName: label, iconPath: void 0 }, group.id) };
            },
            createUntitledEditorInput: ({ resource }, group) => {
              return { editor: CustomEditorInput.create(this.instantiationService, { resource: resource ?? URI.from({ scheme: Schemas.untitled, authority: `Untitled-${this._untitledCounter++}` }), viewType: contributedEditor.id, webviewTitle: void 0, preferredName: void 0, iconPath: void 0 }, group.id) };
            },
            createDiffEditorInput: async (diffEditorInput, group) => {
              await this.extensionService.activateByEvent(`onCustomEditor:${contributedEditor.id}`);
              return { editor: this.createDiffEditorInput(diffEditorInput, contributedEditor, group) };
            }
          }
        ));
      }
    }
  }
  createDiffEditorInput(editor, contributedEditor, group) {
    const originalResource = assertReturnsDefined(editor.original.resource);
    const modifiedResource = assertReturnsDefined(editor.modified.resource);
    const diffEditorLayout = this.getDiffEditorLayout(contributedEditor, modifiedResource);
    if (diffEditorLayout === CustomEditorDiffEditorLayout.Inline) {
      return CustomEditorDiffInput.create(this.instantiationService, {
        originalResource,
        modifiedResource,
        viewType: contributedEditor.id,
        label: editor.label,
        description: editor.description,
        iconPath: void 0
      }, group);
    }
    if (diffEditorLayout === CustomEditorDiffEditorLayout.SideBySide) {
      const diffId = generateUuid();
      const originalOverride2 = CustomEditorSideBySideDiffInput.create(this.instantiationService, {
        originalResource,
        modifiedResource,
        viewType: contributedEditor.id,
        diffId,
        side: "original",
        label: editor.label,
        description: editor.description,
        iconPath: void 0
      }, group);
      const modifiedOverride2 = CustomEditorSideBySideDiffInput.create(this.instantiationService, {
        originalResource,
        modifiedResource,
        viewType: contributedEditor.id,
        diffId,
        side: "modified",
        label: editor.label,
        description: editor.description,
        iconPath: void 0
      }, group);
      return this.instantiationService.createInstance(DiffEditorInput, editor.label, editor.description, originalOverride2, modifiedOverride2, true);
    }
    const modifiedOverride = CustomEditorInput.create(this.instantiationService, { resource: modifiedResource, viewType: contributedEditor.id, webviewTitle: void 0, preferredName: void 0, iconPath: void 0 }, group.id, { customClasses: "modified" });
    const originalOverride = CustomEditorInput.create(this.instantiationService, { resource: originalResource, viewType: contributedEditor.id, webviewTitle: void 0, preferredName: void 0, iconPath: void 0 }, group.id, { customClasses: "original" });
    return this.instantiationService.createInstance(DiffEditorInput, editor.label, editor.description, originalOverride, modifiedOverride, true);
  }
  getDiffEditorLayout(contributedEditor, modifiedResource) {
    const capabilities = this.getCustomEditorCapabilities(contributedEditor.id);
    const supportsInlineDiff = capabilities?.supportsInlineDiff === true;
    const supportsSideBySideDiff = capabilities?.supportsSideBySideDiff === true;
    if (supportsInlineDiff && supportsSideBySideDiff) {
      return this.textResourceConfigurationService.getValue(modifiedResource, "diffEditor.renderSideBySide") ? CustomEditorDiffEditorLayout.SideBySide : CustomEditorDiffEditorLayout.Inline;
    }
    return supportsInlineDiff ? CustomEditorDiffEditorLayout.Inline : supportsSideBySideDiff ? CustomEditorDiffEditorLayout.SideBySide : void 0;
  }
  async updateCustomDiffEditorsForDiffConfigurationChange(e) {
    for (const group of this.editorGroupService.groups) {
      const replacements = [];
      for (const editor of group.editors) {
        const diffInfo = this.getCustomEditorDiffInputInfo(editor);
        const contributedEditor = diffInfo ? this._contributedEditors.get(diffInfo.viewType) : void 0;
        if (!diffInfo || !contributedEditor || !e.affectsConfiguration(diffInfo.modifiedResource, "diffEditor.renderSideBySide") || !this.getCustomEditorCapabilities(contributedEditor.id)?.supportsInlineDiff || !this.getCustomEditorCapabilities(contributedEditor.id)?.supportsSideBySideDiff || this.getDiffEditorLayout(contributedEditor, diffInfo.modifiedResource) === diffInfo.layout) {
          continue;
        }
        replacements.push({
          editor,
          replacement: {
            original: { resource: diffInfo.originalResource },
            modified: { resource: diffInfo.modifiedResource },
            label: editor.getName(),
            description: editor.getDescription(),
            options: {
              override: diffInfo.viewType,
              pinned: group.isPinned(editor),
              sticky: group.isSticky(editor),
              preserveFocus: group.activeEditor !== editor
            }
          }
        });
      }
      if (replacements.length) {
        await this.editorService.replaceEditors(replacements, group);
      }
    }
  }
  getCustomEditorDiffInputInfo(input) {
    if (input instanceof CustomEditorDiffInput) {
      return {
        viewType: input.viewType,
        originalResource: input.originalResource,
        modifiedResource: input.modifiedResource,
        layout: CustomEditorDiffEditorLayout.Inline
      };
    }
    if (input instanceof DiffEditorInput && input.original instanceof CustomEditorSideBySideDiffInput && input.modified instanceof CustomEditorSideBySideDiffInput && input.original.side === "original" && input.modified.side === "modified" && input.original.viewType === input.modified.viewType && input.original.diffId === input.modified.diffId) {
      return {
        viewType: input.original.viewType,
        originalResource: input.original.originalResource,
        modifiedResource: input.original.modifiedResource,
        layout: CustomEditorDiffEditorLayout.SideBySide
      };
    }
    return void 0;
  }
  get models() {
    return this._models;
  }
  getCustomEditor(viewType) {
    return this._contributedEditors.get(viewType);
  }
  getContributedCustomEditors(resource) {
    return new CustomEditorInfoCollection(this._contributedEditors.getContributedEditors(resource));
  }
  getUserConfiguredCustomEditors(resource) {
    const resourceAssocations = this.editorResolverService.getAssociationsForResource(resource);
    return new CustomEditorInfoCollection(
      coalesce(resourceAssocations.map((association) => this._contributedEditors.get(association.viewType)))
    );
  }
  getAllCustomEditors(resource) {
    return new CustomEditorInfoCollection([
      ...this.getUserConfiguredCustomEditors(resource).allEditors,
      ...this.getContributedCustomEditors(resource).allEditors
    ]);
  }
  registerCustomEditorCapabilities(viewType, options) {
    if (this._editorCapabilities.has(viewType)) {
      throw new Error(`Capabilities for ${viewType} already set`);
    }
    this._editorCapabilities.set(viewType, options);
    this._onDidChangeEditorTypes.fire();
    return toDisposable(() => {
      this._editorCapabilities.delete(viewType);
      this._onDidChangeEditorTypes.fire();
    });
  }
  getCustomEditorCapabilities(viewType) {
    return this._editorCapabilities.get(viewType);
  }
  getActiveCustomEditorId(group) {
    const activeEditorPane = group.activeEditorPane;
    const input = activeEditorPane?.input;
    const diffInfo = this.getCustomEditorDiffInputInfo(input);
    if (diffInfo) {
      return diffInfo.viewType;
    }
    return input instanceof CustomEditorInput && input.resource ? input.viewType : "";
  }
  getActiveCustomEditorDiffCanToggleLayout(group) {
    const diffInfo = this.getCustomEditorDiffInputInfo(group.activeEditorPane?.input);
    const capabilities = diffInfo ? this.getCustomEditorCapabilities(diffInfo.viewType) : void 0;
    return capabilities?.supportsInlineDiff === true && capabilities.supportsSideBySideDiff === true;
  }
  getActiveCustomEditorTextDiff(group) {
    const diffInfo = this.getCustomEditorDiffInputInfo(group.activeEditorPane?.input);
    return !!diffInfo && this.getCustomEditorCapabilities(diffInfo.viewType)?.isTextEditor === true;
  }
  getCustomEditorIsEditable(group) {
    const activeEditorPane = group.activeEditorPane;
    const resource = activeEditorPane?.input?.resource;
    if (!resource) {
      return false;
    }
    return activeEditorPane?.input instanceof CustomEditorInput;
  }
  handleDeletedFile(resource) {
    this._models.disposeAllModelsForResource(resource);
  }
  async handleMovedFileInOpenedFileEditors(oldResource, newResource) {
    if (extname(oldResource).toLowerCase() === extname(newResource).toLowerCase()) {
      return;
    }
    const possibleEditors = this.getAllCustomEditors(newResource);
    if (!possibleEditors.allEditors.some((editor) => editor.priority.editor !== RegisteredEditorPriority.option)) {
      return;
    }
    const editorsToReplace = /* @__PURE__ */ new Map();
    for (const group of this.editorGroupService.groups) {
      for (const editor of group.editors) {
        if (this._fileEditorFactory.isFileEditor(editor) && !(editor instanceof CustomEditorInput) && isEqual(editor.resource, newResource)) {
          let entry = editorsToReplace.get(group.id);
          if (!entry) {
            entry = [];
            editorsToReplace.set(group.id, entry);
          }
          entry.push(editor);
        }
      }
    }
    if (!editorsToReplace.size) {
      return;
    }
    for (const [group, entries] of editorsToReplace) {
      this.editorService.replaceEditors(entries.map((editor) => {
        let replacement;
        if (possibleEditors.defaultEditor) {
          const viewType = possibleEditors.defaultEditor.id;
          replacement = CustomEditorInput.create(this.instantiationService, { resource: newResource, viewType, webviewTitle: void 0, preferredName: void 0, iconPath: void 0 }, group);
        } else {
          replacement = { resource: newResource, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
        }
        return {
          editor,
          replacement,
          options: {
            preserveFocus: true
          }
        };
      }), group);
    }
  }
};
CustomEditorService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IEditorGroupsService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, IEditorResolverService),
  __decorateParam(7, ITextResourceConfigurationService),
  __decorateParam(8, IExtensionService)
], CustomEditorService);
export {
  CustomEditorService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2N1c3RvbUVkaXRvci9icm93c2VyL2N1c3RvbUVkaXRvcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY3VzdG9tRWRpdG9yLmNzcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBleHRuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgUmVkb0NvbW1hbmQsIFVuZG9Db21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04sIEVkaXRvckV4dGVuc2lvbnMsIEdyb3VwSWRlbnRpZmllciwgSUVkaXRvckZhY3RvcnlSZWdpc3RyeSwgSVJlc291cmNlRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2RpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQWN0aXZlQ3VzdG9tRWRpdG9yRGlmZkNhblRvZ2dsZUxheW91dENvbnRleHQsIEFjdGl2ZUN1c3RvbUVkaXRvclRleHREaWZmQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0FDVElWRV9DVVNUT01fRURJVE9SX0lELCBDT05URVhUX0ZPQ1VTRURfQ1VTVE9NX0VESVRPUl9JU19FRElUQUJMRSwgQ3VzdG9tRWRpdG9yQ2FwYWJpbGl0aWVzLCBDdXN0b21FZGl0b3JEaWZmRWRpdG9yTGF5b3V0LCBDdXN0b21FZGl0b3JJbmZvLCBDdXN0b21FZGl0b3JJbmZvQ29sbGVjdGlvbiwgSUN1c3RvbUVkaXRvck1vZGVsTWFuYWdlciwgSUN1c3RvbUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY3VzdG9tRWRpdG9yLmpzJztcbmltcG9ydCB7IEN1c3RvbUVkaXRvck1vZGVsTWFuYWdlciB9IGZyb20gJy4uL2NvbW1vbi9jdXN0b21FZGl0b3JNb2RlbE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBDb250ZXh0S2V5UHJvdmlkZXIsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsIElFZGl0b3JUeXBlLCBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSwgSVVudHlwZWRFZGl0b3JSZXBsYWNlbWVudCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29udHJpYnV0ZWRDdXN0b21FZGl0b3JzIH0gZnJvbSAnLi4vY29tbW9uL2NvbnRyaWJ1dGVkQ3VzdG9tRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBDdXN0b21FZGl0b3JEaWZmSW5wdXQsIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXQgfSBmcm9tICcuL2N1c3RvbUVkaXRvckRpZmZJbnB1dC5qcyc7XG5pbXBvcnQgeyBDdXN0b21FZGl0b3JJbnB1dCB9IGZyb20gJy4vY3VzdG9tRWRpdG9ySW5wdXQuanMnO1xuXG5pbnRlcmZhY2UgQ3VzdG9tRWRpdG9yRGlmZklucHV0SW5mbyB7XG5cdHJlYWRvbmx5IHZpZXdUeXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9yaWdpbmFsUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgbW9kaWZpZWRSZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBsYXlvdXQ6IEN1c3RvbUVkaXRvckRpZmZFZGl0b3JMYXlvdXQ7XG59XG5cbnR5cGUgQ3VzdG9tRWRpdG9yVW5kb1JlZG9JbnB1dCA9IEN1c3RvbUVkaXRvcklucHV0IHwgQ3VzdG9tRWRpdG9yRGlmZklucHV0IHwgQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dDtcblxuZXhwb3J0IGNsYXNzIEN1c3RvbUVkaXRvclNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUN1c3RvbUVkaXRvclNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiBhbnk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udHJpYnV0ZWRFZGl0b3JzOiBDb250cmlidXRlZEN1c3RvbUVkaXRvcnM7XG5cdHByaXZhdGUgX3VudGl0bGVkQ291bnRlciA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclJlc29sdmVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JDYXBhYmlsaXRpZXMgPSBuZXcgTWFwPHN0cmluZywgQ3VzdG9tRWRpdG9yQ2FwYWJpbGl0aWVzPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsczogSUN1c3RvbUVkaXRvck1vZGVsTWFuYWdlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVkaXRvclR5cGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUVkaXRvclR5cGVzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yVHlwZXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZmlsZUVkaXRvckZhY3RvcnkgPSBSZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLmdldEZpbGVFZGl0b3JGYWN0b3J5KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlOiBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fbW9kZWxzID0gbmV3IEN1c3RvbUVkaXRvck1vZGVsTWFuYWdlcigpO1xuXG5cdFx0dGhpcy5fY29udHJpYnV0ZWRFZGl0b3JzID0gdGhpcy5fcmVnaXN0ZXIobmV3IENvbnRyaWJ1dGVkQ3VzdG9tRWRpdG9ycyhzdG9yYWdlU2VydmljZSkpO1xuXHRcdC8vIFJlZ2lzdGVyIHRoZSBjb250cmlidXRpb24gcG9pbnRzIG9ubHkgZW1pdHRpbmcgb25lIGNoYW5nZSBmcm9tIHRoZSByZXNvbHZlclxuXHRcdHRoaXMuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmJ1ZmZlckNoYW5nZUV2ZW50cyh0aGlzLnJlZ2lzdGVyQ29udHJpYnV0aW9uUG9pbnRzLmJpbmQodGhpcykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29udHJpYnV0ZWRFZGl0b3JzLm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdC8vIFJlZ2lzdGVyIHRoZSBjb250cmlidXRpb24gcG9pbnRzIG9ubHkgZW1pdHRpbmcgb25lIGNoYW5nZSBmcm9tIHRoZSByZXNvbHZlclxuXHRcdFx0dGhpcy5lZGl0b3JSZXNvbHZlclNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKHRoaXMucmVnaXN0ZXJDb250cmlidXRpb25Qb2ludHMuYmluZCh0aGlzKSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUVkaXRvclR5cGVzLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZWdpc3RlciBncm91cCBjb250ZXh0IGtleSBwcm92aWRlcnMuXG5cdFx0Ly8gVGhlc2Ugc2V0IHRoZSBjb250ZXh0IGtleXMgZm9yIGVhY2ggZWRpdG9yIGdyb3VwIGFuZCB0aGUgZ2xvYmFsIGNvbnRleHRcblx0XHRjb25zdCBhY3RpdmVDdXN0b21FZGl0b3JDb250ZXh0S2V5UHJvdmlkZXI6IElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlcjxzdHJpbmc+ID0ge1xuXHRcdFx0Y29udGV4dEtleTogQ09OVEVYVF9BQ1RJVkVfQ1VTVE9NX0VESVRPUl9JRCxcblx0XHRcdGdldEdyb3VwQ29udGV4dEtleVZhbHVlOiBncm91cCA9PiB0aGlzLmdldEFjdGl2ZUN1c3RvbUVkaXRvcklkKGdyb3VwKSxcblx0XHRcdG9uRGlkQ2hhbmdlOiB0aGlzLm9uRGlkQ2hhbmdlRWRpdG9yVHlwZXNcblx0XHR9O1xuXG5cdFx0Y29uc3QgY3VzdG9tRWRpdG9ySXNFZGl0YWJsZUNvbnRleHRLZXlQcm92aWRlcjogSUVkaXRvckdyb3VwQ29udGV4dEtleVByb3ZpZGVyPGJvb2xlYW4+ID0ge1xuXHRcdFx0Y29udGV4dEtleTogQ09OVEVYVF9GT0NVU0VEX0NVU1RPTV9FRElUT1JfSVNfRURJVEFCTEUsXG5cdFx0XHRnZXRHcm91cENvbnRleHRLZXlWYWx1ZTogZ3JvdXAgPT4gdGhpcy5nZXRDdXN0b21FZGl0b3JJc0VkaXRhYmxlKGdyb3VwKSxcblx0XHRcdG9uRGlkQ2hhbmdlOiB0aGlzLm9uRGlkQ2hhbmdlRWRpdG9yVHlwZXNcblx0XHR9O1xuXG5cdFx0Y29uc3QgY3VzdG9tRWRpdG9yRGlmZkNhblRvZ2dsZUxheW91dENvbnRleHRLZXlQcm92aWRlcjogSUVkaXRvckdyb3VwQ29udGV4dEtleVByb3ZpZGVyPGJvb2xlYW4+ID0ge1xuXHRcdFx0Y29udGV4dEtleTogQWN0aXZlQ3VzdG9tRWRpdG9yRGlmZkNhblRvZ2dsZUxheW91dENvbnRleHQsXG5cdFx0XHRnZXRHcm91cENvbnRleHRLZXlWYWx1ZTogZ3JvdXAgPT4gdGhpcy5nZXRBY3RpdmVDdXN0b21FZGl0b3JEaWZmQ2FuVG9nZ2xlTGF5b3V0KGdyb3VwKSxcblx0XHRcdG9uRGlkQ2hhbmdlOiB0aGlzLm9uRGlkQ2hhbmdlRWRpdG9yVHlwZXNcblx0XHR9O1xuXG5cdFx0Y29uc3QgY3VzdG9tRWRpdG9yVGV4dERpZmZDb250ZXh0S2V5UHJvdmlkZXI6IElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlcjxib29sZWFuPiA9IHtcblx0XHRcdGNvbnRleHRLZXk6IEFjdGl2ZUN1c3RvbUVkaXRvclRleHREaWZmQ29udGV4dCxcblx0XHRcdGdldEdyb3VwQ29udGV4dEtleVZhbHVlOiBncm91cCA9PiB0aGlzLmdldEFjdGl2ZUN1c3RvbUVkaXRvclRleHREaWZmKGdyb3VwKSxcblx0XHRcdG9uRGlkQ2hhbmdlOiB0aGlzLm9uRGlkQ2hhbmdlRWRpdG9yVHlwZXNcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cFNlcnZpY2UucmVnaXN0ZXJDb250ZXh0S2V5UHJvdmlkZXIoYWN0aXZlQ3VzdG9tRWRpdG9yQ29udGV4dEtleVByb3ZpZGVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cFNlcnZpY2UucmVnaXN0ZXJDb250ZXh0S2V5UHJvdmlkZXIoY3VzdG9tRWRpdG9ySXNFZGl0YWJsZUNvbnRleHRLZXlQcm92aWRlcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLnJlZ2lzdGVyQ29udGV4dEtleVByb3ZpZGVyKGN1c3RvbUVkaXRvckRpZmZDYW5Ub2dnbGVMYXlvdXRDb250ZXh0S2V5UHJvdmlkZXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3VwU2VydmljZS5yZWdpc3RlckNvbnRleHRLZXlQcm92aWRlcihjdXN0b21FZGl0b3JUZXh0RGlmZkNvbnRleHRLZXlQcm92aWRlcikpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMudXBkYXRlQ3VzdG9tRGlmZkVkaXRvcnNGb3JEaWZmQ29uZmlndXJhdGlvbkNoYW5nZShlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihmaWxlU2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uTU9WRSkpIHtcblx0XHRcdFx0dGhpcy5oYW5kbGVNb3ZlZEZpbGVJbk9wZW5lZEZpbGVFZGl0b3JzKGUucmVzb3VyY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKGUudGFyZ2V0LnJlc291cmNlKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLkRFTEVURSkpIHtcblx0XHRcdFx0dGhpcy5oYW5kbGVEZWxldGVkRmlsZShlLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBQUklPUklUWSA9IDEwNTtcblx0XHR0aGlzLl9yZWdpc3RlcihVbmRvQ29tbWFuZC5hZGRJbXBsZW1lbnRhdGlvbihQUklPUklUWSwgJ2N1c3RvbS1lZGl0b3InLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy53aXRoQWN0aXZlQ3VzdG9tRWRpdG9yKGVkaXRvciA9PiBlZGl0b3IudW5kbygpKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoUmVkb0NvbW1hbmQuYWRkSW1wbGVtZW50YXRpb24oUFJJT1JJVFksICdjdXN0b20tZWRpdG9yJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMud2l0aEFjdGl2ZUN1c3RvbUVkaXRvcihlZGl0b3IgPT4gZWRpdG9yLnJlZG8oKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0RWRpdG9yVHlwZXMoKTogSUVkaXRvclR5cGVbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9jb250cmlidXRlZEVkaXRvcnNdO1xuXHR9XG5cblx0cHJpdmF0ZSB3aXRoQWN0aXZlQ3VzdG9tRWRpdG9yKGY6IChlZGl0b3I6IEN1c3RvbUVkaXRvclVuZG9SZWRvSW5wdXQpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+KTogYm9vbGVhbiB8IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuZ2V0QWN0aXZlQ3VzdG9tRWRpdG9yVW5kb1JlZG9JbnB1dCgpO1xuXHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGYoZWRpdG9yKTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGl2ZUN1c3RvbUVkaXRvclVuZG9SZWRvSW5wdXQoKTogQ3VzdG9tRWRpdG9yVW5kb1JlZG9JbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0XHRpZiAoYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9ySW5wdXQgfHwgYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yRGlmZklucHV0IHx8IGFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXQpIHtcblx0XHRcdHJldHVybiBhY3RpdmVFZGl0b3I7XG5cdFx0fVxuXHRcdGlmIChhY3RpdmVFZGl0b3IgaW5zdGFuY2VvZiBEaWZmRWRpdG9ySW5wdXQgJiYgYWN0aXZlRWRpdG9yLm1vZGlmaWVkIGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dCkge1xuXHRcdFx0cmV0dXJuIGFjdGl2ZUVkaXRvci5tb2RpZmllZDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDb250cmlidXRpb25Qb2ludHMoKTogdm9pZCB7XG5cdFx0Ly8gQ2xlYXIgYWxsIHByZXZpb3VzIGNvbnRyaWJ1dGlvbnMgd2Uga25vd1xuXHRcdHRoaXMuX2VkaXRvclJlc29sdmVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGZvciAoY29uc3QgY29udHJpYnV0ZWRFZGl0b3Igb2YgdGhpcy5fY29udHJpYnV0ZWRFZGl0b3JzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGdsb2JQYXR0ZXJuIG9mIGNvbnRyaWJ1dGVkRWRpdG9yLnNlbGVjdG9yKSB7XG5cdFx0XHRcdGlmICghZ2xvYlBhdHRlcm4uZmlsZW5hbWVQYXR0ZXJuKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9lZGl0b3JSZXNvbHZlckRpc3Bvc2FibGVzLmFkZCh0aGlzLmVkaXRvclJlc29sdmVyU2VydmljZS5yZWdpc3RlckVkaXRvcihcblx0XHRcdFx0XHRnbG9iUGF0dGVybi5maWxlbmFtZVBhdHRlcm4sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6IGNvbnRyaWJ1dGVkRWRpdG9yLmlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGNvbnRyaWJ1dGVkRWRpdG9yLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdFx0ZGV0YWlsOiBjb250cmlidXRlZEVkaXRvci5wcm92aWRlckRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdFx0cHJpb3JpdHk6IGNvbnRyaWJ1dGVkRWRpdG9yLnByaW9yaXR5LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2luZ2xlUGVyUmVzb3VyY2U6ICgpID0+ICEodGhpcy5nZXRDdXN0b21FZGl0b3JDYXBhYmlsaXRpZXMoY29udHJpYnV0ZWRFZGl0b3IuaWQpPy5zdXBwb3J0c011bHRpcGxlRWRpdG9yc1BlckRvY3VtZW50ID8/IGZhbHNlKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBsYWJlbCB9LCBncm91cCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyBlZGl0b3I6IEN1c3RvbUVkaXRvcklucHV0LmNyZWF0ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB7IHJlc291cmNlLCB2aWV3VHlwZTogY29udHJpYnV0ZWRFZGl0b3IuaWQsIHdlYnZpZXdUaXRsZTogdW5kZWZpbmVkLCBwcmVmZXJyZWROYW1lOiBsYWJlbCwgaWNvblBhdGg6IHVuZGVmaW5lZCB9LCBncm91cC5pZCkgfTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRjcmVhdGVVbnRpdGxlZEVkaXRvcklucHV0OiAoeyByZXNvdXJjZSB9LCBncm91cCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyBlZGl0b3I6IEN1c3RvbUVkaXRvcklucHV0LmNyZWF0ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB7IHJlc291cmNlOiByZXNvdXJjZSA/PyBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy51bnRpdGxlZCwgYXV0aG9yaXR5OiBgVW50aXRsZWQtJHt0aGlzLl91bnRpdGxlZENvdW50ZXIrK31gIH0pLCB2aWV3VHlwZTogY29udHJpYnV0ZWRFZGl0b3IuaWQsIHdlYnZpZXdUaXRsZTogdW5kZWZpbmVkLCBwcmVmZXJyZWROYW1lOiB1bmRlZmluZWQsIGljb25QYXRoOiB1bmRlZmluZWQgfSwgZ3JvdXAuaWQpIH07XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Y3JlYXRlRGlmZkVkaXRvcklucHV0OiBhc3luYyAoZGlmZkVkaXRvcklucHV0LCBncm91cCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvbkN1c3RvbUVkaXRvcjoke2NvbnRyaWJ1dGVkRWRpdG9yLmlkfWApO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyBlZGl0b3I6IHRoaXMuY3JlYXRlRGlmZkVkaXRvcklucHV0KGRpZmZFZGl0b3JJbnB1dCwgY29udHJpYnV0ZWRFZGl0b3IsIGdyb3VwKSB9O1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRGlmZkVkaXRvcklucHV0KFxuXHRcdGVkaXRvcjogSVJlc291cmNlRGlmZkVkaXRvcklucHV0LFxuXHRcdGNvbnRyaWJ1dGVkRWRpdG9yOiBDdXN0b21FZGl0b3JJbmZvLFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdCk6IEVkaXRvcklucHV0IHtcblx0XHRjb25zdCBvcmlnaW5hbFJlc291cmNlID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQoZWRpdG9yLm9yaWdpbmFsLnJlc291cmNlKTtcblx0XHRjb25zdCBtb2RpZmllZFJlc291cmNlID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQoZWRpdG9yLm1vZGlmaWVkLnJlc291cmNlKTtcblx0XHRjb25zdCBkaWZmRWRpdG9yTGF5b3V0ID0gdGhpcy5nZXREaWZmRWRpdG9yTGF5b3V0KGNvbnRyaWJ1dGVkRWRpdG9yLCBtb2RpZmllZFJlc291cmNlKTtcblxuXHRcdGlmIChkaWZmRWRpdG9yTGF5b3V0ID09PSBDdXN0b21FZGl0b3JEaWZmRWRpdG9yTGF5b3V0LklubGluZSkge1xuXHRcdFx0cmV0dXJuIEN1c3RvbUVkaXRvckRpZmZJbnB1dC5jcmVhdGUodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwge1xuXHRcdFx0XHRvcmlnaW5hbFJlc291cmNlLFxuXHRcdFx0XHRtb2RpZmllZFJlc291cmNlLFxuXHRcdFx0XHR2aWV3VHlwZTogY29udHJpYnV0ZWRFZGl0b3IuaWQsXG5cdFx0XHRcdGxhYmVsOiBlZGl0b3IubGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBlZGl0b3IuZGVzY3JpcHRpb24sXG5cdFx0XHRcdGljb25QYXRoOiB1bmRlZmluZWRcblx0XHRcdH0sIGdyb3VwKTtcblx0XHR9XG5cblx0XHRpZiAoZGlmZkVkaXRvckxheW91dCA9PT0gQ3VzdG9tRWRpdG9yRGlmZkVkaXRvckxheW91dC5TaWRlQnlTaWRlKSB7XG5cdFx0XHRjb25zdCBkaWZmSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsT3ZlcnJpZGUgPSBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0LmNyZWF0ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRcdG9yaWdpbmFsUmVzb3VyY2UsXG5cdFx0XHRcdG1vZGlmaWVkUmVzb3VyY2UsXG5cdFx0XHRcdHZpZXdUeXBlOiBjb250cmlidXRlZEVkaXRvci5pZCxcblx0XHRcdFx0ZGlmZklkLFxuXHRcdFx0XHRzaWRlOiAnb3JpZ2luYWwnLFxuXHRcdFx0XHRsYWJlbDogZWRpdG9yLmxhYmVsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZWRpdG9yLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRpY29uUGF0aDogdW5kZWZpbmVkXG5cdFx0XHR9LCBncm91cCk7XG5cdFx0XHRjb25zdCBtb2RpZmllZE92ZXJyaWRlID0gQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dC5jcmVhdGUodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwge1xuXHRcdFx0XHRvcmlnaW5hbFJlc291cmNlLFxuXHRcdFx0XHRtb2RpZmllZFJlc291cmNlLFxuXHRcdFx0XHR2aWV3VHlwZTogY29udHJpYnV0ZWRFZGl0b3IuaWQsXG5cdFx0XHRcdGRpZmZJZCxcblx0XHRcdFx0c2lkZTogJ21vZGlmaWVkJyxcblx0XHRcdFx0bGFiZWw6IGVkaXRvci5sYWJlbCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGVkaXRvci5kZXNjcmlwdGlvbixcblx0XHRcdFx0aWNvblBhdGg6IHVuZGVmaW5lZFxuXHRcdFx0fSwgZ3JvdXApO1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlmZkVkaXRvcklucHV0LCBlZGl0b3IubGFiZWwsIGVkaXRvci5kZXNjcmlwdGlvbiwgb3JpZ2luYWxPdmVycmlkZSwgbW9kaWZpZWRPdmVycmlkZSwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kaWZpZWRPdmVycmlkZSA9IEN1c3RvbUVkaXRvcklucHV0LmNyZWF0ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB7IHJlc291cmNlOiBtb2RpZmllZFJlc291cmNlLCB2aWV3VHlwZTogY29udHJpYnV0ZWRFZGl0b3IuaWQsIHdlYnZpZXdUaXRsZTogdW5kZWZpbmVkLCBwcmVmZXJyZWROYW1lOiB1bmRlZmluZWQsIGljb25QYXRoOiB1bmRlZmluZWQgfSwgZ3JvdXAuaWQsIHsgY3VzdG9tQ2xhc3NlczogJ21vZGlmaWVkJyB9KTtcblx0XHRjb25zdCBvcmlnaW5hbE92ZXJyaWRlID0gQ3VzdG9tRWRpdG9ySW5wdXQuY3JlYXRlKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHsgcmVzb3VyY2U6IG9yaWdpbmFsUmVzb3VyY2UsIHZpZXdUeXBlOiBjb250cmlidXRlZEVkaXRvci5pZCwgd2Vidmlld1RpdGxlOiB1bmRlZmluZWQsIHByZWZlcnJlZE5hbWU6IHVuZGVmaW5lZCwgaWNvblBhdGg6IHVuZGVmaW5lZCB9LCBncm91cC5pZCwgeyBjdXN0b21DbGFzc2VzOiAnb3JpZ2luYWwnIH0pO1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpZmZFZGl0b3JJbnB1dCwgZWRpdG9yLmxhYmVsLCBlZGl0b3IuZGVzY3JpcHRpb24sIG9yaWdpbmFsT3ZlcnJpZGUsIG1vZGlmaWVkT3ZlcnJpZGUsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREaWZmRWRpdG9yTGF5b3V0KGNvbnRyaWJ1dGVkRWRpdG9yOiBDdXN0b21FZGl0b3JJbmZvLCBtb2RpZmllZFJlc291cmNlOiBVUkkpOiBDdXN0b21FZGl0b3JEaWZmRWRpdG9yTGF5b3V0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjYXBhYmlsaXRpZXMgPSB0aGlzLmdldEN1c3RvbUVkaXRvckNhcGFiaWxpdGllcyhjb250cmlidXRlZEVkaXRvci5pZCk7XG5cdFx0Y29uc3Qgc3VwcG9ydHNJbmxpbmVEaWZmID0gY2FwYWJpbGl0aWVzPy5zdXBwb3J0c0lubGluZURpZmYgPT09IHRydWU7XG5cdFx0Y29uc3Qgc3VwcG9ydHNTaWRlQnlTaWRlRGlmZiA9IGNhcGFiaWxpdGllcz8uc3VwcG9ydHNTaWRlQnlTaWRlRGlmZiA9PT0gdHJ1ZTtcblxuXHRcdGlmIChzdXBwb3J0c0lubGluZURpZmYgJiYgc3VwcG9ydHNTaWRlQnlTaWRlRGlmZikge1xuXHRcdFx0cmV0dXJuIHRoaXMudGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4obW9kaWZpZWRSZXNvdXJjZSwgJ2RpZmZFZGl0b3IucmVuZGVyU2lkZUJ5U2lkZScpID8gQ3VzdG9tRWRpdG9yRGlmZkVkaXRvckxheW91dC5TaWRlQnlTaWRlIDogQ3VzdG9tRWRpdG9yRGlmZkVkaXRvckxheW91dC5JbmxpbmU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cHBvcnRzSW5saW5lRGlmZiA/IEN1c3RvbUVkaXRvckRpZmZFZGl0b3JMYXlvdXQuSW5saW5lIDogc3VwcG9ydHNTaWRlQnlTaWRlRGlmZiA/IEN1c3RvbUVkaXRvckRpZmZFZGl0b3JMYXlvdXQuU2lkZUJ5U2lkZSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlQ3VzdG9tRGlmZkVkaXRvcnNGb3JEaWZmQ29uZmlndXJhdGlvbkNoYW5nZShlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5ncm91cHMpIHtcblx0XHRcdGNvbnN0IHJlcGxhY2VtZW50czogSVVudHlwZWRFZGl0b3JSZXBsYWNlbWVudFtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBncm91cC5lZGl0b3JzKSB7XG5cdFx0XHRcdGNvbnN0IGRpZmZJbmZvID0gdGhpcy5nZXRDdXN0b21FZGl0b3JEaWZmSW5wdXRJbmZvKGVkaXRvcik7XG5cdFx0XHRcdGNvbnN0IGNvbnRyaWJ1dGVkRWRpdG9yID0gZGlmZkluZm8gPyB0aGlzLl9jb250cmlidXRlZEVkaXRvcnMuZ2V0KGRpZmZJbmZvLnZpZXdUeXBlKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKCFkaWZmSW5mb1xuXHRcdFx0XHRcdHx8ICFjb250cmlidXRlZEVkaXRvclxuXHRcdFx0XHRcdHx8ICFlLmFmZmVjdHNDb25maWd1cmF0aW9uKGRpZmZJbmZvLm1vZGlmaWVkUmVzb3VyY2UsICdkaWZmRWRpdG9yLnJlbmRlclNpZGVCeVNpZGUnKVxuXHRcdFx0XHRcdHx8ICF0aGlzLmdldEN1c3RvbUVkaXRvckNhcGFiaWxpdGllcyhjb250cmlidXRlZEVkaXRvci5pZCk/LnN1cHBvcnRzSW5saW5lRGlmZlxuXHRcdFx0XHRcdHx8ICF0aGlzLmdldEN1c3RvbUVkaXRvckNhcGFiaWxpdGllcyhjb250cmlidXRlZEVkaXRvci5pZCk/LnN1cHBvcnRzU2lkZUJ5U2lkZURpZmZcblx0XHRcdFx0XHR8fCB0aGlzLmdldERpZmZFZGl0b3JMYXlvdXQoY29udHJpYnV0ZWRFZGl0b3IsIGRpZmZJbmZvLm1vZGlmaWVkUmVzb3VyY2UpID09PSBkaWZmSW5mby5sYXlvdXQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlcGxhY2VtZW50cy5wdXNoKHtcblx0XHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdFx0cmVwbGFjZW1lbnQ6IHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBkaWZmSW5mby5vcmlnaW5hbFJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogZGlmZkluZm8ubW9kaWZpZWRSZXNvdXJjZSB9LFxuXHRcdFx0XHRcdFx0bGFiZWw6IGVkaXRvci5nZXROYW1lKCksXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZWRpdG9yLmdldERlc2NyaXB0aW9uKCksXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdG92ZXJyaWRlOiBkaWZmSW5mby52aWV3VHlwZSxcblx0XHRcdFx0XHRcdFx0cGlubmVkOiBncm91cC5pc1Bpbm5lZChlZGl0b3IpLFxuXHRcdFx0XHRcdFx0XHRzdGlja3k6IGdyb3VwLmlzU3RpY2t5KGVkaXRvciksXG5cdFx0XHRcdFx0XHRcdHByZXNlcnZlRm9jdXM6IGdyb3VwLmFjdGl2ZUVkaXRvciAhPT0gZWRpdG9yLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXBsYWNlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5yZXBsYWNlRWRpdG9ycyhyZXBsYWNlbWVudHMsIGdyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEN1c3RvbUVkaXRvckRpZmZJbnB1dEluZm8oaW5wdXQ6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkKTogQ3VzdG9tRWRpdG9yRGlmZklucHV0SW5mbyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yRGlmZklucHV0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR2aWV3VHlwZTogaW5wdXQudmlld1R5cGUsXG5cdFx0XHRcdG9yaWdpbmFsUmVzb3VyY2U6IGlucHV0Lm9yaWdpbmFsUmVzb3VyY2UsXG5cdFx0XHRcdG1vZGlmaWVkUmVzb3VyY2U6IGlucHV0Lm1vZGlmaWVkUmVzb3VyY2UsXG5cdFx0XHRcdGxheW91dDogQ3VzdG9tRWRpdG9yRGlmZkVkaXRvckxheW91dC5JbmxpbmUsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIERpZmZFZGl0b3JJbnB1dFxuXHRcdFx0JiYgaW5wdXQub3JpZ2luYWwgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0XG5cdFx0XHQmJiBpbnB1dC5tb2RpZmllZCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXRcblx0XHRcdCYmIGlucHV0Lm9yaWdpbmFsLnNpZGUgPT09ICdvcmlnaW5hbCdcblx0XHRcdCYmIGlucHV0Lm1vZGlmaWVkLnNpZGUgPT09ICdtb2RpZmllZCdcblx0XHRcdCYmIGlucHV0Lm9yaWdpbmFsLnZpZXdUeXBlID09PSBpbnB1dC5tb2RpZmllZC52aWV3VHlwZVxuXHRcdFx0JiYgaW5wdXQub3JpZ2luYWwuZGlmZklkID09PSBpbnB1dC5tb2RpZmllZC5kaWZmSWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHZpZXdUeXBlOiBpbnB1dC5vcmlnaW5hbC52aWV3VHlwZSxcblx0XHRcdFx0b3JpZ2luYWxSZXNvdXJjZTogaW5wdXQub3JpZ2luYWwub3JpZ2luYWxSZXNvdXJjZSxcblx0XHRcdFx0bW9kaWZpZWRSZXNvdXJjZTogaW5wdXQub3JpZ2luYWwubW9kaWZpZWRSZXNvdXJjZSxcblx0XHRcdFx0bGF5b3V0OiBDdXN0b21FZGl0b3JEaWZmRWRpdG9yTGF5b3V0LlNpZGVCeVNpZGUsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG1vZGVscygpIHsgcmV0dXJuIHRoaXMuX21vZGVsczsgfVxuXG5cdHB1YmxpYyBnZXRDdXN0b21FZGl0b3Iodmlld1R5cGU6IHN0cmluZyk6IEN1c3RvbUVkaXRvckluZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb250cmlidXRlZEVkaXRvcnMuZ2V0KHZpZXdUeXBlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb250cmlidXRlZEN1c3RvbUVkaXRvcnMocmVzb3VyY2U6IFVSSSk6IEN1c3RvbUVkaXRvckluZm9Db2xsZWN0aW9uIHtcblx0XHRyZXR1cm4gbmV3IEN1c3RvbUVkaXRvckluZm9Db2xsZWN0aW9uKHRoaXMuX2NvbnRyaWJ1dGVkRWRpdG9ycy5nZXRDb250cmlidXRlZEVkaXRvcnMocmVzb3VyY2UpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRVc2VyQ29uZmlndXJlZEN1c3RvbUVkaXRvcnMocmVzb3VyY2U6IFVSSSk6IEN1c3RvbUVkaXRvckluZm9Db2xsZWN0aW9uIHtcblx0XHRjb25zdCByZXNvdXJjZUFzc29jYXRpb25zID0gdGhpcy5lZGl0b3JSZXNvbHZlclNlcnZpY2UuZ2V0QXNzb2NpYXRpb25zRm9yUmVzb3VyY2UocmVzb3VyY2UpO1xuXHRcdHJldHVybiBuZXcgQ3VzdG9tRWRpdG9ySW5mb0NvbGxlY3Rpb24oXG5cdFx0XHRjb2FsZXNjZShyZXNvdXJjZUFzc29jYXRpb25zXG5cdFx0XHRcdC5tYXAoYXNzb2NpYXRpb24gPT4gdGhpcy5fY29udHJpYnV0ZWRFZGl0b3JzLmdldChhc3NvY2lhdGlvbi52aWV3VHlwZSkpKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWxsQ3VzdG9tRWRpdG9ycyhyZXNvdXJjZTogVVJJKTogQ3VzdG9tRWRpdG9ySW5mb0NvbGxlY3Rpb24ge1xuXHRcdHJldHVybiBuZXcgQ3VzdG9tRWRpdG9ySW5mb0NvbGxlY3Rpb24oW1xuXHRcdFx0Li4udGhpcy5nZXRVc2VyQ29uZmlndXJlZEN1c3RvbUVkaXRvcnMocmVzb3VyY2UpLmFsbEVkaXRvcnMsXG5cdFx0XHQuLi50aGlzLmdldENvbnRyaWJ1dGVkQ3VzdG9tRWRpdG9ycyhyZXNvdXJjZSkuYWxsRWRpdG9ycyxcblx0XHRdKTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlckN1c3RvbUVkaXRvckNhcGFiaWxpdGllcyh2aWV3VHlwZTogc3RyaW5nLCBvcHRpb25zOiBDdXN0b21FZGl0b3JDYXBhYmlsaXRpZXMpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX2VkaXRvckNhcGFiaWxpdGllcy5oYXModmlld1R5cGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhcGFiaWxpdGllcyBmb3IgJHt2aWV3VHlwZX0gYWxyZWFkeSBzZXRgKTtcblx0XHR9XG5cdFx0dGhpcy5fZWRpdG9yQ2FwYWJpbGl0aWVzLnNldCh2aWV3VHlwZSwgb3B0aW9ucyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JUeXBlcy5maXJlKCk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9lZGl0b3JDYXBhYmlsaXRpZXMuZGVsZXRlKHZpZXdUeXBlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yVHlwZXMuZmlyZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldEN1c3RvbUVkaXRvckNhcGFiaWxpdGllcyh2aWV3VHlwZTogc3RyaW5nKTogQ3VzdG9tRWRpdG9yQ2FwYWJpbGl0aWVzIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yQ2FwYWJpbGl0aWVzLmdldCh2aWV3VHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGl2ZUN1c3RvbUVkaXRvcklkKGdyb3VwOiBJRWRpdG9yR3JvdXApOiBzdHJpbmcge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBncm91cC5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGNvbnN0IGlucHV0ID0gYWN0aXZlRWRpdG9yUGFuZT8uaW5wdXQ7XG5cdFx0Y29uc3QgZGlmZkluZm8gPSB0aGlzLmdldEN1c3RvbUVkaXRvckRpZmZJbnB1dEluZm8oaW5wdXQpO1xuXHRcdGlmIChkaWZmSW5mbykge1xuXHRcdFx0cmV0dXJuIGRpZmZJbmZvLnZpZXdUeXBlO1xuXHRcdH1cblxuXHRcdHJldHVybiBpbnB1dCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvcklucHV0ICYmIGlucHV0LnJlc291cmNlID8gaW5wdXQudmlld1R5cGUgOiAnJztcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aXZlQ3VzdG9tRWRpdG9yRGlmZkNhblRvZ2dsZUxheW91dChncm91cDogSUVkaXRvckdyb3VwKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZGlmZkluZm8gPSB0aGlzLmdldEN1c3RvbUVkaXRvckRpZmZJbnB1dEluZm8oZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZT8uaW5wdXQpO1xuXHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9IGRpZmZJbmZvID8gdGhpcy5nZXRDdXN0b21FZGl0b3JDYXBhYmlsaXRpZXMoZGlmZkluZm8udmlld1R5cGUpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBjYXBhYmlsaXRpZXM/LnN1cHBvcnRzSW5saW5lRGlmZiA9PT0gdHJ1ZSAmJiBjYXBhYmlsaXRpZXMuc3VwcG9ydHNTaWRlQnlTaWRlRGlmZiA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aXZlQ3VzdG9tRWRpdG9yVGV4dERpZmYoZ3JvdXA6IElFZGl0b3JHcm91cCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGRpZmZJbmZvID0gdGhpcy5nZXRDdXN0b21FZGl0b3JEaWZmSW5wdXRJbmZvKGdyb3VwLmFjdGl2ZUVkaXRvclBhbmU/LmlucHV0KTtcblx0XHRyZXR1cm4gISFkaWZmSW5mbyAmJiB0aGlzLmdldEN1c3RvbUVkaXRvckNhcGFiaWxpdGllcyhkaWZmSW5mby52aWV3VHlwZSk/LmlzVGV4dEVkaXRvciA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q3VzdG9tRWRpdG9ySXNFZGl0YWJsZShncm91cDogSUVkaXRvckdyb3VwKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGdyb3VwLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBhY3RpdmVFZGl0b3JQYW5lPy5pbnB1dD8ucmVzb3VyY2U7XG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBhY3RpdmVFZGl0b3JQYW5lPy5pbnB1dCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvcklucHV0O1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVEZWxldGVkRmlsZShyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Ly8gRGlzcG9zZSBhbGwgY3VzdG9tIGVkaXRvciBtb2RlbHMgYXNzb2NpYXRlZCB3aXRoIHRoZSBkZWxldGVkIHJlc291cmNlXG5cdFx0Ly8gdG8gcHJldmVudCBzdGFsZSByZWZlcmVuY2VzIHRoYXQgY2FuIGNhdXNlIGlzc3VlcyB3aGVuIHJlY3JlYXRpbmcgZmlsZXMgd2l0aCB0aGUgc2FtZSBuYW1lXG5cdFx0dGhpcy5fbW9kZWxzLmRpc3Bvc2VBbGxNb2RlbHNGb3JSZXNvdXJjZShyZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZU1vdmVkRmlsZUluT3BlbmVkRmlsZUVkaXRvcnMob2xkUmVzb3VyY2U6IFVSSSwgbmV3UmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChleHRuYW1lKG9sZFJlc291cmNlKS50b0xvd2VyQ2FzZSgpID09PSBleHRuYW1lKG5ld1Jlc291cmNlKS50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zc2libGVFZGl0b3JzID0gdGhpcy5nZXRBbGxDdXN0b21FZGl0b3JzKG5ld1Jlc291cmNlKTtcblxuXHRcdC8vIFNlZSBpZiB3ZSBoYXZlIGFueSBub24tb3B0aW9uYWwgY3VzdG9tIGVkaXRvciBmb3IgdGhpcyByZXNvdXJjZVxuXHRcdGlmICghcG9zc2libGVFZGl0b3JzLmFsbEVkaXRvcnMuc29tZShlZGl0b3IgPT4gZWRpdG9yLnByaW9yaXR5LmVkaXRvciAhPT0gUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5Lm9wdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiBzbywgY2hlY2sgYWxsIGVkaXRvcnMgdG8gc2VlIGlmIHRoZXJlIGFyZSBhbnkgZmlsZSBlZGl0b3JzIG9wZW4gZm9yIHRoZSBuZXcgcmVzb3VyY2Vcblx0XHRjb25zdCBlZGl0b3JzVG9SZXBsYWNlID0gbmV3IE1hcDxHcm91cElkZW50aWZpZXIsIEVkaXRvcklucHV0W10+KCk7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5ncm91cHMpIHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGdyb3VwLmVkaXRvcnMpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2ZpbGVFZGl0b3JGYWN0b3J5LmlzRmlsZUVkaXRvcihlZGl0b3IpXG5cdFx0XHRcdFx0JiYgIShlZGl0b3IgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JJbnB1dClcblx0XHRcdFx0XHQmJiBpc0VxdWFsKGVkaXRvci5yZXNvdXJjZSwgbmV3UmVzb3VyY2UpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGxldCBlbnRyeSA9IGVkaXRvcnNUb1JlcGxhY2UuZ2V0KGdyb3VwLmlkKTtcblx0XHRcdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdFx0XHRlbnRyeSA9IFtdO1xuXHRcdFx0XHRcdFx0ZWRpdG9yc1RvUmVwbGFjZS5zZXQoZ3JvdXAuaWQsIGVudHJ5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZW50cnkucHVzaChlZGl0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFlZGl0b3JzVG9SZXBsYWNlLnNpemUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFtncm91cCwgZW50cmllc10gb2YgZWRpdG9yc1RvUmVwbGFjZSkge1xuXHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLnJlcGxhY2VFZGl0b3JzKGVudHJpZXMubWFwKGVkaXRvciA9PiB7XG5cdFx0XHRcdGxldCByZXBsYWNlbWVudDogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dDtcblx0XHRcdFx0aWYgKHBvc3NpYmxlRWRpdG9ycy5kZWZhdWx0RWRpdG9yKSB7XG5cdFx0XHRcdFx0Y29uc3Qgdmlld1R5cGUgPSBwb3NzaWJsZUVkaXRvcnMuZGVmYXVsdEVkaXRvci5pZDtcblx0XHRcdFx0XHRyZXBsYWNlbWVudCA9IEN1c3RvbUVkaXRvcklucHV0LmNyZWF0ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB7IHJlc291cmNlOiBuZXdSZXNvdXJjZSwgdmlld1R5cGUsIHdlYnZpZXdUaXRsZTogdW5kZWZpbmVkLCBwcmVmZXJyZWROYW1lOiB1bmRlZmluZWQsIGljb25QYXRoOiB1bmRlZmluZWQgfSwgZ3JvdXApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlcGxhY2VtZW50ID0geyByZXNvdXJjZTogbmV3UmVzb3VyY2UsIG9wdGlvbnM6IHsgb3ZlcnJpZGU6IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLmlkIH0gfTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZWRpdG9yLFxuXHRcdFx0XHRcdHJlcGxhY2VtZW50LFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdHByZXNlcnZlRm9jdXM6IHRydWUsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0fSksIGdyb3VwKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxlQUFlO0FBQ2pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGFBQWEsbUJBQW1CO0FBQ3pDLFNBQWdELHlDQUF5QztBQUV6RixTQUFTLGVBQWUsb0JBQW9CO0FBQzVDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNEJBQTRCLHdCQUEyRjtBQUNoSSxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLDhDQUE4Qyx5Q0FBeUM7QUFDaEcsU0FBUyxpQ0FBaUMsMkNBQXFFLDhCQUFnRCxrQ0FBbUY7QUFDbFAsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBdUQsNEJBQTRCO0FBQ25GLFNBQVMsd0JBQXFDLGdDQUFnQztBQUM5RSxTQUFTLHNCQUFpRDtBQUMxRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHVCQUF1Qix1Q0FBdUM7QUFDdkUsU0FBUyx5QkFBeUI7QUFXM0IsSUFBTSxzQkFBTixjQUFrQyxXQUEyQztBQUFBLEVBZW5GLFlBQ2UsYUFDRyxnQkFD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
