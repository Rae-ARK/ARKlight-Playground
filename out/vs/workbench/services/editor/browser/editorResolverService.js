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
import { distinct, insert } from "../../../../base/common/arrays.js";
import { PauseableEmitter } from "../../../../base/common/event.js";
import * as glob from "../../../../base/common/glob.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename, extname, isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { EditorActivation, EditorResolution } from "../../../../platform/editor/common/editor.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { DEFAULT_EDITOR_ASSOCIATION, EditorResourceAccessor, isEditorInputWithOptions, isEditorInputWithOptionsAndGroup, isResourceDiffEditorInput, isResourceMergeEditorInput, isResourceMultiDiffEditorInput, isResourceSideBySideEditorInput, isUntitledResourceEditorInput, SideBySideEditor } from "../../../common/editor.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { findGroup } from "../common/editorGroupFinder.js";
import { IEditorGroupsService } from "../common/editorGroupsService.js";
import { diffEditorsAssociationsSettingId, editorsAssociationsSettingId, globMatchesResource, IEditorResolverService, priorityToRank, RegisteredEditorPriority, ResolvedStatus, toRegisteredEditorPriorityInfo } from "../common/editorResolverService.js";
function normalizeRegisteredEditorInfo(editorInfo) {
  return {
    id: editorInfo.id,
    label: editorInfo.label,
    detail: editorInfo.detail,
    priority: toRegisteredEditorPriorityInfo(editorInfo.priority)
  };
}
var EditorAssociationType = /* @__PURE__ */ ((EditorAssociationType2) => {
  EditorAssociationType2[EditorAssociationType2["Editor"] = 0] = "Editor";
  EditorAssociationType2[EditorAssociationType2["DiffEditor"] = 1] = "DiffEditor";
  EditorAssociationType2[EditorAssociationType2["MergeEditor"] = 2] = "MergeEditor";
  return EditorAssociationType2;
})(EditorAssociationType || {});
let EditorResolverService = class extends Disposable {
  constructor(editorGroupService, instantiationService, configurationService, quickInputService, notificationService, storageService, extensionService, logService) {
    super();
    this.editorGroupService = editorGroupService;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.quickInputService = quickInputService;
    this.notificationService = notificationService;
    this.storageService = storageService;
    this.extensionService = extensionService;
    this.logService = logService;
    // Events
    this._onDidChangeEditorRegistrations = this._register(new PauseableEmitter());
    this.onDidChangeEditorRegistrations = this._onDidChangeEditorRegistrations.event;
    // Data Stores
    this._editors = /* @__PURE__ */ new Map();
    this._flattenedEditors = /* @__PURE__ */ new Map();
    this._shouldReFlattenEditors = true;
    this.cache = new Set(JSON.parse(this.storageService.get(EditorResolverService.cacheStorageID, StorageScope.PROFILE, JSON.stringify([]))));
    this.storageService.remove(EditorResolverService.cacheStorageID, StorageScope.PROFILE);
    this._register(this.storageService.onWillSaveState(() => {
      this.cacheEditors();
    }));
    this._register(this.extensionService.onDidRegisterExtensions(() => {
      this.cache = void 0;
    }));
  }
  resolveUntypedInputAndGroup(editor, preferredGroup) {
    const untypedEditor = editor;
    const findGroupResult = this.instantiationService.invokeFunction(findGroup, untypedEditor, preferredGroup);
    if (findGroupResult instanceof Promise) {
      return findGroupResult.then(([group, activation]) => [untypedEditor, group, activation]);
    } else {
      const [group, activation] = findGroupResult;
      return [untypedEditor, group, activation];
    }
  }
  async resolveEditor(editor, preferredGroup) {
    this._flattenedEditors = this._flattenEditorsMap();
    if (isResourceSideBySideEditorInput(editor)) {
      return this.doResolveSideBySideEditor(editor, preferredGroup);
    }
    let resolvedUntypedAndGroup;
    const resolvedUntypedAndGroupResult = this.resolveUntypedInputAndGroup(editor, preferredGroup);
    if (resolvedUntypedAndGroupResult instanceof Promise) {
      resolvedUntypedAndGroup = await resolvedUntypedAndGroupResult;
    } else {
      resolvedUntypedAndGroup = resolvedUntypedAndGroupResult;
    }
    if (!resolvedUntypedAndGroup) {
      return ResolvedStatus.NONE;
    }
    const [untypedEditor, group, activation] = resolvedUntypedAndGroup;
    if (activation) {
      untypedEditor.options = { ...untypedEditor.options, activation };
    }
    let resource = EditorResourceAccessor.getCanonicalUri(untypedEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    const editorAssociationType = isResourceDiffEditorInput(untypedEditor) ? 1 /* DiffEditor */ : isResourceMergeEditorInput(untypedEditor) ? 2 /* MergeEditor */ : 0 /* Editor */;
    if (this.cache && resource && (this.resourceMatchesCache(resource) || this.resourceMatchesUserAssociation(resource, editorAssociationType))) {
      await this.extensionService.whenInstalledExtensionsRegistered();
    }
    if (resource === void 0) {
      resource = URI.from({ scheme: Schemas.untitled });
    } else if (resource.scheme === void 0 || resource === null) {
      return ResolvedStatus.NONE;
    }
    if (untypedEditor.options?.override === EditorResolution.PICK) {
      const picked = await this.doPickEditor(untypedEditor);
      if (!picked) {
        return ResolvedStatus.ABORT;
      }
      untypedEditor.options = picked;
    }
    let { editor: selectedEditor, conflictingDefault } = this.getEditor(resource, untypedEditor.options?.override, editorAssociationType);
    if (!selectedEditor && (untypedEditor.options?.override || isEditorInputWithOptions(editor))) {
      return ResolvedStatus.NONE;
    } else if (!selectedEditor) {
      const resolvedEditor = this.getEditor(resource, DEFAULT_EDITOR_ASSOCIATION.id, editorAssociationType);
      selectedEditor = resolvedEditor?.editor;
      conflictingDefault = resolvedEditor?.conflictingDefault;
      if (!selectedEditor) {
        return ResolvedStatus.NONE;
      }
    }
    if (isResourceDiffEditorInput(untypedEditor) && untypedEditor.options?.override === void 0) {
      let resource2 = EditorResourceAccessor.getCanonicalUri(untypedEditor, { supportSideBySide: SideBySideEditor.SECONDARY });
      if (!resource2) {
        resource2 = URI.from({ scheme: Schemas.untitled });
      }
      const { editor: selectedEditor2 } = this.getEditor(resource2, void 0, editorAssociationType);
      if (!selectedEditor2 || selectedEditor.editorInfo.id !== selectedEditor2.editorInfo.id) {
        const { editor: selectedDiff, conflictingDefault: conflictingDefaultDiff } = this.getEditor(resource, DEFAULT_EDITOR_ASSOCIATION.id, editorAssociationType);
        selectedEditor = selectedDiff;
        conflictingDefault = conflictingDefaultDiff;
      }
      if (!selectedEditor) {
        return ResolvedStatus.NONE;
      }
    }
    untypedEditor.options = { override: selectedEditor.editorInfo.id, ...untypedEditor.options };
    if (selectedEditor.editorFactoryObject.createDiffEditorInput === void 0 && isResourceDiffEditorInput(untypedEditor)) {
      return ResolvedStatus.NONE;
    }
    const input = await this.doResolveEditor(untypedEditor, group, selectedEditor);
    if (conflictingDefault && input) {
      await this.doHandleConflictingDefaults(resource, selectedEditor.editorInfo.label, untypedEditor, input.editor, group);
    }
    if (input) {
      if (input.editor.editorId !== selectedEditor.editorInfo.id) {
        this.logService.warn(`Editor ID Mismatch: ${input.editor.editorId} !== ${selectedEditor.editorInfo.id}. This will cause bugs. Please ensure editorInput.editorId matches the registered id`);
      }
      return { ...input, group };
    }
    return ResolvedStatus.ABORT;
  }
  async doResolveSideBySideEditor(editor, preferredGroup) {
    const primaryResolvedEditor = await this.resolveEditor(editor.primary, preferredGroup);
    if (!isEditorInputWithOptionsAndGroup(primaryResolvedEditor)) {
      return ResolvedStatus.NONE;
    }
    const secondaryResolvedEditor = await this.resolveEditor(editor.secondary, primaryResolvedEditor.group ?? preferredGroup);
    if (!isEditorInputWithOptionsAndGroup(secondaryResolvedEditor)) {
      return ResolvedStatus.NONE;
    }
    return {
      group: primaryResolvedEditor.group ?? secondaryResolvedEditor.group,
      editor: this.instantiationService.createInstance(SideBySideEditorInput, editor.label, editor.description, secondaryResolvedEditor.editor, primaryResolvedEditor.editor),
      options: editor.options
    };
  }
  bufferChangeEvents(callback) {
    this._onDidChangeEditorRegistrations.pause();
    try {
      callback();
    } finally {
      this._onDidChangeEditorRegistrations.resume();
    }
  }
  registerEditor(globPattern, editorInfo, options, editorFactoryObject) {
    const registeredEditorInfo = normalizeRegisteredEditorInfo(editorInfo);
    let registeredEditor = this._editors.get(globPattern);
    if (registeredEditor === void 0) {
      registeredEditor = /* @__PURE__ */ new Map();
      this._editors.set(globPattern, registeredEditor);
    }
    let editorsWithId = registeredEditor.get(registeredEditorInfo.id);
    if (editorsWithId === void 0) {
      editorsWithId = [];
    }
    const remove = insert(editorsWithId, {
      globPattern,
      editorInfo: registeredEditorInfo,
      options,
      editorFactoryObject
    });
    registeredEditor.set(registeredEditorInfo.id, editorsWithId);
    this._shouldReFlattenEditors = true;
    this._onDidChangeEditorRegistrations.fire();
    return toDisposable(() => {
      remove();
      if (editorsWithId && editorsWithId.length === 0) {
        registeredEditor?.delete(editorInfo.id);
      }
      this._shouldReFlattenEditors = true;
      this._onDidChangeEditorRegistrations.fire();
    });
  }
  getAssociationsForResource(resource) {
    return this.getAssociationsForResourceFromSetting(resource, editorsAssociationsSettingId);
  }
  getConfiguredDefaultEditor(resource, forDiffEditor) {
    const settingId = forDiffEditor ? diffEditorsAssociationsSettingId : editorsAssociationsSettingId;
    return this.getAssociationsForResourceFromSetting(resource, settingId)[0]?.viewType;
  }
  getAssociationsForResourceByType(resource, associationType) {
    if (associationType === 0 /* Editor */) {
      return this.getAssociationsForResource(resource);
    }
    const modeAssociations = this.getAssociationsForResourceFromSetting(resource, diffEditorsAssociationsSettingId);
    if (modeAssociations.length) {
      return modeAssociations;
    }
    return this.getAssociationsForResource(resource).filter((association) => !this.isExplicitForAssociationType(association.viewType, associationType));
  }
  /**
   * Whether the editor requires an association for the given input kind instead of inheriting one
   * from another input kind.
   */
  isExplicitForAssociationType(viewType, associationType) {
    const editor = this._registeredEditors.filter((editor2) => editor2.editorInfo.id === viewType).at(0);
    return !!editor && this.getEffectivePriority(editor.editorInfo, associationType) === RegisteredEditorPriority.explicit;
  }
  getAssociationsForResourceFromSetting(resource, settingId) {
    const matchingAssociations = this.getRawAssociationsForResourceFromSetting(resource, settingId);
    const allEditors = this._registeredEditors;
    return matchingAssociations.filter((association) => allEditors.find((c) => c.editorInfo.id === association.viewType));
  }
  getRawAssociationsForResourceByType(resource, associationType) {
    if (associationType === 0 /* Editor */) {
      return this.getRawAssociationsForResourceFromSetting(resource, editorsAssociationsSettingId);
    }
    const diffAssociations = this.getRawAssociationsForResourceFromSetting(resource, diffEditorsAssociationsSettingId);
    return diffAssociations.length ? diffAssociations : this.getRawAssociationsForResourceFromSetting(resource, editorsAssociationsSettingId);
  }
  getRawAssociationsForResourceFromSetting(resource, settingId) {
    const associations = this.getAllUserAssociationsForSetting(settingId);
    const matchingAssociations = associations.filter((association) => association.filenamePattern && globMatchesResource(association.filenamePattern, resource));
    return matchingAssociations.sort((a, b) => (b.filenamePattern?.length ?? 0) - (a.filenamePattern?.length ?? 0));
  }
  getAllUserAssociations() {
    return this.getAllUserAssociationsForSetting(editorsAssociationsSettingId);
  }
  getAllUserAssociationsForSetting(settingId) {
    const inspectedEditorAssociations = this.configurationService.inspect(settingId) || {};
    const defaultAssociations = inspectedEditorAssociations.defaultValue ?? {};
    const workspaceAssociations = inspectedEditorAssociations.workspaceValue ?? {};
    const userAssociations = inspectedEditorAssociations.userValue ?? {};
    const rawAssociations = { ...workspaceAssociations };
    for (const [key, value] of Object.entries({ ...defaultAssociations, ...userAssociations })) {
      if (rawAssociations[key] === void 0) {
        rawAssociations[key] = value;
      }
    }
    const associations = [];
    for (const [key, value] of Object.entries(rawAssociations)) {
      const association = {
        filenamePattern: key,
        viewType: value
      };
      associations.push(association);
    }
    return associations;
  }
  /**
   * Given the nested nature of the editors map, we merge factories of the same glob and id to make it flat
   * and easier to work with
   */
  _flattenEditorsMap() {
    if (!this._shouldReFlattenEditors) {
      return this._flattenedEditors;
    }
    this._shouldReFlattenEditors = false;
    const editors = /* @__PURE__ */ new Map();
    for (const [glob2, value] of this._editors) {
      const registeredEditors = [];
      for (const editors2 of value.values()) {
        let registeredEditor = void 0;
        for (const editor of editors2) {
          if (!registeredEditor) {
            registeredEditor = {
              editorInfo: editor.editorInfo,
              globPattern: editor.globPattern,
              options: {},
              editorFactoryObject: {}
            };
          }
          registeredEditor.options = { ...registeredEditor.options, ...editor.options };
          registeredEditor.editorFactoryObject = { ...registeredEditor.editorFactoryObject, ...editor.editorFactoryObject };
        }
        if (registeredEditor) {
          registeredEditors.push(registeredEditor);
        }
      }
      editors.set(glob2, registeredEditors);
    }
    return editors;
  }
  /**
   * Returns all editors as an array. Possible to contain duplicates
   */
  get _registeredEditors() {
    return Array.from(this._flattenedEditors.values()).flat();
  }
  updateUserAssociations(globPattern, editorID, forDiffEditor) {
    this.updateUserAssociationsForSetting(forDiffEditor ? diffEditorsAssociationsSettingId : editorsAssociationsSettingId, globPattern, editorID);
  }
  updateUserAssociationsForType(associationType, globPattern, editorID) {
    this.updateUserAssociationsForSetting(associationType === 1 /* DiffEditor */ ? diffEditorsAssociationsSettingId : editorsAssociationsSettingId, globPattern, editorID);
  }
  updateUserAssociationsForSetting(settingId, globPattern, editorID) {
    const newAssociation = { viewType: editorID, filenamePattern: globPattern };
    const currentAssociations = this.getAllUserAssociationsForSetting(settingId);
    const newSettingObject = /* @__PURE__ */ Object.create(null);
    for (const association of [...currentAssociations, newAssociation]) {
      if (association.filenamePattern) {
        newSettingObject[association.filenamePattern] = association.viewType;
      }
    }
    this.configurationService.updateValue(settingId, newSettingObject);
  }
  removeUserAssociationForSetting(settingId, globPattern) {
    const currentAssociations = this.getAllUserAssociationsForSetting(settingId);
    if (!currentAssociations.some((association) => association.filenamePattern === globPattern)) {
      return;
    }
    const newSettingObject = /* @__PURE__ */ Object.create(null);
    for (const association of currentAssociations) {
      if (association.filenamePattern && association.filenamePattern !== globPattern) {
        newSettingObject[association.filenamePattern] = association.viewType;
      }
    }
    this.configurationService.updateValue(settingId, newSettingObject);
  }
  findMatchingEditors(resource, associationType = 0 /* Editor */) {
    const userSettings = this.getAssociationsForResourceByType(resource, associationType);
    const matchingEditors = [];
    for (const [key, editors] of this._flattenedEditors) {
      for (const editor of editors) {
        if (associationType === 1 /* DiffEditor */ && !editor.editorFactoryObject.createDiffEditorInput) {
          continue;
        }
        if (associationType === 2 /* MergeEditor */ && !editor.editorFactoryObject.createMergeEditorInput) {
          continue;
        }
        const foundInSettings = userSettings.find((setting) => setting.viewType === editor.editorInfo.id);
        if (foundInSettings && this.getEffectivePriority(editor.editorInfo, associationType) !== RegisteredEditorPriority.exclusive || globMatchesResource(key, resource)) {
          matchingEditors.push(editor);
        }
      }
    }
    return matchingEditors.sort((a, b) => {
      const aPriority = this.getEffectivePriority(a.editorInfo, associationType);
      const bPriority = this.getEffectivePriority(b.editorInfo, associationType);
      if (priorityToRank(bPriority) === priorityToRank(aPriority) && typeof b.globPattern === "string" && typeof a.globPattern === "string") {
        return b.globPattern.length - a.globPattern.length;
      }
      return priorityToRank(bPriority) - priorityToRank(aPriority);
    });
  }
  getEditors(resource) {
    this._flattenedEditors = this._flattenEditorsMap();
    if (URI.isUri(resource)) {
      const editors = this.findMatchingEditors(resource);
      if (editors.find((e) => e.editorInfo.priority.editor === RegisteredEditorPriority.exclusive)) {
        return [];
      }
      return editors.map((editor) => editor.editorInfo);
    }
    return distinct(this._registeredEditors.map((editor) => editor.editorInfo), (editor) => editor.id);
  }
  getBinaryDiffFallbackEditor(resource) {
    this._flattenedEditors = this._flattenEditorsMap();
    const editors = this.findMatchingEditors(resource, 1 /* DiffEditor */).filter((editor) => editor.editorInfo.id !== DEFAULT_EDITOR_ASSOCIATION.id);
    return editors[0]?.editorInfo.id;
  }
  /**
   * Given a resource and an editorId selects the best possible editor
   * @returns The editor and whether there was another default which conflicted with it
   */
  getEditor(resource, editorId, associationType) {
    const findMatchingEditor = (editors2, viewType) => {
      return editors2.find((editor) => {
        if (associationType === 1 /* DiffEditor */ && !editor.editorFactoryObject.createDiffEditorInput) {
          return false;
        }
        if (associationType === 2 /* MergeEditor */ && !editor.editorFactoryObject.createMergeEditorInput) {
          return false;
        }
        if (editor.options?.canSupportResource !== void 0) {
          return editor.editorInfo.id === viewType && editor.options.canSupportResource(resource);
        }
        return editor.editorInfo.id === viewType;
      });
    };
    if (editorId && editorId !== EditorResolution.EXCLUSIVE_ONLY) {
      const registeredEditors = this._registeredEditors;
      return {
        editor: findMatchingEditor(registeredEditors, editorId),
        conflictingDefault: false
      };
    }
    const editors = this.findMatchingEditors(resource, associationType);
    const associationsFromSetting = this.getAssociationsForResourceByType(resource, associationType);
    const minPriority = editorId === EditorResolution.EXCLUSIVE_ONLY ? RegisteredEditorPriority.exclusive : RegisteredEditorPriority.builtin;
    let possibleEditors = editors.filter((editor) => priorityToRank(this.getEffectivePriority(editor.editorInfo, associationType)) >= priorityToRank(minPriority) && editor.editorInfo.id !== DEFAULT_EDITOR_ASSOCIATION.id);
    if (possibleEditors.length === 0) {
      return {
        editor: associationsFromSetting[0] && minPriority !== RegisteredEditorPriority.exclusive ? findMatchingEditor(editors, associationsFromSetting[0].viewType) : void 0,
        conflictingDefault: false
      };
    }
    const selectedViewType = this.getEffectivePriority(possibleEditors[0].editorInfo, associationType) === RegisteredEditorPriority.exclusive ? possibleEditors[0].editorInfo.id : associationsFromSetting[0]?.viewType || possibleEditors.find((editor) => !editor.options?.canSupportResource || editor.options.canSupportResource(resource))?.editorInfo.id || possibleEditors[0].editorInfo.id;
    let conflictingDefault = false;
    possibleEditors = possibleEditors.filter((editor) => this.getEffectivePriority(editor.editorInfo, associationType) !== RegisteredEditorPriority.exclusive).filter((editor) => !editor.options?.canSupportResource || editor.options.canSupportResource(resource));
    if (associationsFromSetting.length === 0 && possibleEditors.length > 1) {
      conflictingDefault = true;
    }
    return {
      editor: findMatchingEditor(editors, selectedViewType),
      conflictingDefault
    };
  }
  getEffectivePriority(editorInfo, associationType) {
    switch (associationType) {
      case 1 /* DiffEditor */:
        return editorInfo.priority.diff;
      case 2 /* MergeEditor */:
        return editorInfo.priority.merge;
      default:
        return editorInfo.priority.editor;
    }
  }
  async doResolveEditor(editor, group, selectedEditor) {
    let options = editor.options;
    const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (options && typeof options.activation === "undefined") {
      options = { ...options, activation: options.preserveFocus ? EditorActivation.RESTORE : void 0 };
    }
    if (isResourceMergeEditorInput(editor)) {
      if (!selectedEditor.editorFactoryObject.createMergeEditorInput) {
        return;
      }
      const inputWithOptions2 = await selectedEditor.editorFactoryObject.createMergeEditorInput(editor, group);
      return { editor: inputWithOptions2.editor, options: inputWithOptions2.options ?? options };
    }
    if (isResourceDiffEditorInput(editor)) {
      if (!selectedEditor.editorFactoryObject.createDiffEditorInput) {
        return;
      }
      const inputWithOptions2 = await selectedEditor.editorFactoryObject.createDiffEditorInput(editor, group);
      return { editor: inputWithOptions2.editor, options: inputWithOptions2.options ?? options };
    }
    if (isResourceMultiDiffEditorInput(editor)) {
      if (!selectedEditor.editorFactoryObject.createMultiDiffEditorInput) {
        return;
      }
      const inputWithOptions2 = await selectedEditor.editorFactoryObject.createMultiDiffEditorInput(editor, group);
      return { editor: inputWithOptions2.editor, options: inputWithOptions2.options ?? options };
    }
    if (isResourceSideBySideEditorInput(editor)) {
      throw new Error(`Untyped side by side editor input not supported here.`);
    }
    if (isUntitledResourceEditorInput(editor)) {
      if (!selectedEditor.editorFactoryObject.createUntitledEditorInput) {
        return;
      }
      const inputWithOptions2 = await selectedEditor.editorFactoryObject.createUntitledEditorInput(editor, group);
      return { editor: inputWithOptions2.editor, options: inputWithOptions2.options ?? options };
    }
    if (resource === void 0) {
      throw new Error(`Undefined resource on non untitled editor input.`);
    }
    const singleEditorPerResource = typeof selectedEditor.options?.singlePerResource === "function" ? selectedEditor.options.singlePerResource() : selectedEditor.options?.singlePerResource;
    if (singleEditorPerResource) {
      const existingEditors = this.findExistingEditorsForResource(resource, selectedEditor.editorInfo.id);
      if (existingEditors.length) {
        const editor2 = await this.moveExistingEditorForResource(existingEditors, group);
        if (editor2) {
          return { editor: editor2, options };
        } else {
          return;
        }
      }
    }
    if (!selectedEditor.editorFactoryObject.createEditorInput) {
      return;
    }
    const inputWithOptions = await selectedEditor.editorFactoryObject.createEditorInput(editor, group);
    options = inputWithOptions.options ?? options;
    const input = inputWithOptions.editor;
    return { editor: input, options };
  }
  /**
   * Moves the first existing editor for a resource to the target group unless already opened there.
   * Additionally will close any other editors that are open for that resource and viewtype besides the first one found
   * @param resource The resource of the editor
   * @param viewType the viewtype of the editor
   * @param targetGroup The group to move it to
   * @returns The moved editor input or `undefined` if the editor could not be moved
   */
  async moveExistingEditorForResource(existingEditorsForResource, targetGroup) {
    const editorToUse = existingEditorsForResource[0];
    for (const { editor, group } of existingEditorsForResource) {
      if (editor !== editorToUse.editor) {
        const closed = await group.closeEditor(editor);
        if (!closed) {
          return;
        }
      }
    }
    if (targetGroup.id !== editorToUse.group.id) {
      const moved = editorToUse.group.moveEditor(editorToUse.editor, targetGroup);
      if (!moved) {
        return;
      }
    }
    return editorToUse.editor;
  }
  /**
   * Given a resource and an editorId, returns all editors open for that resource and editorId.
   * @param resource The resource specified
   * @param editorId The editorID
   * @returns A list of editors
   */
  findExistingEditorsForResource(resource, editorId) {
    const out = [];
    const orderedGroups = distinct([
      ...this.editorGroupService.groups
    ]);
    for (const group of orderedGroups) {
      for (const editor of group.editors) {
        if (isEqual(editor.resource, resource) && editor.editorId === editorId) {
          out.push({ editor, group });
        }
      }
    }
    return out;
  }
  async doHandleConflictingDefaults(resource, editorName, untypedInput, currentEditor, group) {
    const associationType = isResourceDiffEditorInput(untypedInput) ? 1 /* DiffEditor */ : isResourceMergeEditorInput(untypedInput) ? 2 /* MergeEditor */ : 0 /* Editor */;
    const editors = this.findMatchingEditors(resource, associationType);
    const storedChoices = JSON.parse(this.storageService.get(EditorResolverService.conflictingDefaultsStorageID, StorageScope.PROFILE, "{}"));
    const globForResource = `*${extname(resource)}`;
    const writeCurrentEditorsToStorage = () => {
      storedChoices[globForResource] = [];
      editors.forEach((editor) => storedChoices[globForResource].push(editor.editorInfo.id));
      this.storageService.store(EditorResolverService.conflictingDefaultsStorageID, JSON.stringify(storedChoices), StorageScope.PROFILE, StorageTarget.MACHINE);
    };
    if (storedChoices[globForResource]?.find((editorID) => editorID === currentEditor.editorId)) {
      return;
    }
    const handle = this.notificationService.prompt(
      Severity.Warning,
      localize("editorResolver.conflictingDefaults", "There are multiple default editors available for the resource."),
      [
        {
          label: localize("editorResolver.configureDefault", "Configure Default"),
          run: async () => {
            const picked = await this.doPickEditor(untypedInput, true);
            if (!picked) {
              return;
            }
            untypedInput.options = picked;
            const replacementEditor = await this.resolveEditor(untypedInput, group);
            if (replacementEditor === ResolvedStatus.ABORT || replacementEditor === ResolvedStatus.NONE) {
              return;
            }
            group.replaceEditors([
              {
                editor: currentEditor,
                replacement: replacementEditor.editor,
                options: replacementEditor.options ?? picked
              }
            ]);
          }
        },
        {
          label: localize("editorResolver.keepDefault", "Keep {0}", editorName),
          run: writeCurrentEditorsToStorage
        }
      ]
    );
    const onCloseListener = handle.onDidClose(() => {
      writeCurrentEditorsToStorage();
      onCloseListener.dispose();
    });
  }
  mapEditorsToQuickPickEntry(resource, showDefaultPicker, associationType) {
    const currentEditor = this.editorGroupService.activeGroup.findEditors(resource).at(0);
    let registeredEditors = resource.scheme === Schemas.untitled ? this._registeredEditors.filter((e) => e.editorInfo.priority.editor !== RegisteredEditorPriority.exclusive) : this.findMatchingEditors(resource, associationType);
    if (associationType === 1 /* DiffEditor */) {
      registeredEditors = registeredEditors.filter((editor) => !!editor.editorFactoryObject.createDiffEditorInput);
    }
    registeredEditors = distinct(registeredEditors, (c) => c.editorInfo.id);
    const defaultSetting = this.getAssociationsForResourceByType(resource, associationType)[0]?.viewType;
    registeredEditors = registeredEditors.sort((a, b) => {
      if (a.editorInfo.id === DEFAULT_EDITOR_ASSOCIATION.id) {
        return -1;
      } else if (b.editorInfo.id === DEFAULT_EDITOR_ASSOCIATION.id) {
        return 1;
      } else {
        return priorityToRank(this.getEffectivePriority(b.editorInfo, associationType)) - priorityToRank(this.getEffectivePriority(a.editorInfo, associationType));
      }
    });
    const quickPickEntries = [];
    const currentlyActiveLabel = localize("promptOpenWith.currentlyActive", "Active");
    const currentDefaultLabel = localize("promptOpenWith.currentDefault", "Default");
    const currentDefaultAndActiveLabel = localize("promptOpenWith.currentDefaultAndActive", "Active and Default");
    let defaultViewType = defaultSetting;
    if (!defaultViewType && registeredEditors.length > 2 && this.getEffectivePriority(registeredEditors[1].editorInfo, associationType) !== RegisteredEditorPriority.option) {
      defaultViewType = registeredEditors[1]?.editorInfo.id;
    }
    if (!defaultViewType) {
      defaultViewType = DEFAULT_EDITOR_ASSOCIATION.id;
    }
    registeredEditors.forEach((editor) => {
      const currentViewType = currentEditor?.editorId ?? DEFAULT_EDITOR_ASSOCIATION.id;
      const isActive = currentEditor ? editor.editorInfo.id === currentViewType : false;
      const isDefault = editor.editorInfo.id === defaultViewType;
      const quickPickEntry = {
        id: editor.editorInfo.id,
        label: editor.editorInfo.label,
        description: isActive && isDefault ? currentDefaultAndActiveLabel : isActive ? currentlyActiveLabel : isDefault ? currentDefaultLabel : void 0,
        detail: editor.editorInfo.detail ?? editor.editorInfo.priority.editor
      };
      quickPickEntries.push(quickPickEntry);
    });
    if (!showDefaultPicker && extname(resource) !== "") {
      const separator = { type: "separator" };
      quickPickEntries.push(separator);
      const configureDefaultEntry = {
        id: EditorResolverService.configureDefaultID,
        label: localize("promptOpenWith.configureDefault", "Configure default editor for '{0}'...", `*${extname(resource)}`)
      };
      quickPickEntries.push(configureDefaultEntry);
      if (associationType === 1 /* DiffEditor */) {
        const configureDefaultDiffEntry = {
          id: EditorResolverService.configureDefaultDiffID,
          label: localize("promptOpenWith.configureDefaultDiff", "Configure default editor (diff only) for '{0}'...", `*${extname(resource)}`)
        };
        quickPickEntries.push(configureDefaultDiffEntry);
      }
    }
    return quickPickEntries;
  }
  async doPickEditor(editor, showDefaultPicker, updateAssociationType) {
    let resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (resource === void 0) {
      resource = URI.from({ scheme: Schemas.untitled });
    }
    const associationType = isResourceDiffEditorInput(editor) ? 1 /* DiffEditor */ : 0 /* Editor */;
    const updateSettingType = updateAssociationType ?? associationType;
    const persistDefaultAssociation = (editorID) => {
      const globPattern = `*${extname(resource)}`;
      this.updateUserAssociationsForType(updateSettingType, globPattern, editorID);
      if (updateSettingType === 0 /* Editor */ && associationType === 1 /* DiffEditor */) {
        this.removeUserAssociationForSetting(diffEditorsAssociationsSettingId, globPattern);
      }
    };
    const editorPicks = this.mapEditorsToQuickPickEntry(resource, showDefaultPicker, associationType);
    const disposables = new DisposableStore();
    const editorPicker = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    const placeHolderMessage = showDefaultPicker ? updateSettingType === 1 /* DiffEditor */ ? localize("promptOpenWith.updateDefaultDiffPlaceHolder", "Select new default editor (diff only) for '{0}'", `*${extname(resource)}`) : localize("promptOpenWith.updateDefaultPlaceHolder", "Select new default editor for '{0}'", `*${extname(resource)}`) : localize("promptOpenWith.placeHolder", "Select editor for '{0}'", basename(resource));
    editorPicker.placeholder = placeHolderMessage;
    editorPicker.canAcceptInBackground = true;
    editorPicker.items = editorPicks;
    const firstItem = editorPicker.items.find((item) => item.type === "item");
    if (firstItem) {
      editorPicker.selectedItems = [firstItem];
    }
    const picked = await new Promise((resolve) => {
      disposables.add(editorPicker.onDidAccept((e) => {
        let result = void 0;
        if (editorPicker.selectedItems.length === 1) {
          result = {
            item: editorPicker.selectedItems[0],
            keyMods: editorPicker.keyMods,
            openInBackground: e.inBackground
          };
        }
        if (resource && showDefaultPicker && result?.item.id) {
          persistDefaultAssociation(result.item.id);
        }
        resolve(result);
      }));
      disposables.add(editorPicker.onDidHide(() => {
        disposables.dispose();
        resolve(void 0);
      }));
      disposables.add(editorPicker.onDidTriggerItemButton((e) => {
        resolve({ item: e.item, openInBackground: false });
        if (resource && e.item?.id) {
          persistDefaultAssociation(e.item.id);
        }
      }));
      editorPicker.show();
    });
    editorPicker.dispose();
    if (picked) {
      if (picked.item.id === EditorResolverService.configureDefaultID) {
        return this.doPickEditor(editor, true, 0 /* Editor */);
      }
      if (picked.item.id === EditorResolverService.configureDefaultDiffID) {
        return this.doPickEditor(editor, true, 1 /* DiffEditor */);
      }
      const targetOptions = {
        ...editor.options,
        override: picked.item.id,
        preserveFocus: picked.openInBackground || editor.options?.preserveFocus
      };
      return targetOptions;
    }
    return void 0;
  }
  cacheEditors() {
    const cacheStorage = /* @__PURE__ */ new Set();
    for (const [globPattern, contribPoint] of this._flattenedEditors) {
      const nonOptional = !!contribPoint.find((c) => c.editorInfo.priority.editor !== RegisteredEditorPriority.option && c.editorInfo.id !== DEFAULT_EDITOR_ASSOCIATION.id);
      if (!nonOptional) {
        continue;
      }
      if (glob.isRelativePattern(globPattern)) {
        cacheStorage.add(`${globPattern.pattern}`);
      } else {
        cacheStorage.add(globPattern);
      }
    }
    const userAssociations = [
      ...this.getAllUserAssociations(),
      ...this.getAllUserAssociationsForSetting(diffEditorsAssociationsSettingId)
    ];
    for (const association of userAssociations) {
      if (association.filenamePattern) {
        cacheStorage.add(association.filenamePattern);
      }
    }
    this.storageService.store(EditorResolverService.cacheStorageID, JSON.stringify(Array.from(cacheStorage)), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  /**
   * Checks if a resource matches any user-configured editor association that
   * points to a non-default editor. This ensures that on first startup (when
   * the cache is empty), we still wait for extensions to register before
   * resolving the editor, so that user-configured custom editors are available.
   */
  resourceMatchesUserAssociation(resource, associationType) {
    const userAssociations = this.getRawAssociationsForResourceByType(resource, associationType);
    for (const association of userAssociations) {
      if (association.viewType !== DEFAULT_EDITOR_ASSOCIATION.id) {
        return true;
      }
    }
    return false;
  }
  resourceMatchesCache(resource) {
    if (!this.cache) {
      return false;
    }
    for (const cacheEntry of this.cache) {
      if (globMatchesResource(cacheEntry, resource)) {
        return true;
      }
    }
    return false;
  }
};
// Constants
EditorResolverService.configureDefaultID = "promptOpenWith.configureDefault";
EditorResolverService.configureDefaultDiffID = "promptOpenWith.configureDefaultDiff";
EditorResolverService.cacheStorageID = "editorOverrideService.cache";
EditorResolverService.conflictingDefaultsStorageID = "editorOverrideService.conflictingDefaults";
EditorResolverService = __decorateClass([
  __decorateParam(0, IEditorGroupsService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, ILogService)
], EditorResolverService);
registerSingleton(IEditorResolverService, EditorResolverService, InstantiationType.Eager);
export {
  EditorResolverService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvYnJvd3Nlci9lZGl0b3JSZXNvbHZlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXN0aW5jdCwgaW5zZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFBhdXNlYWJsZUVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgKiBhcyBnbG9iIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBleHRuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGl2YXRpb24sIEVkaXRvclJlc29sdXRpb24sIElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleU1vZHMsIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IsIFF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTiwgRWRpdG9ySW5wdXRXaXRoT3B0aW9ucywgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgSVJlc291cmNlU2lkZUJ5U2lkZUVkaXRvcklucHV0LCBpc0VkaXRvcklucHV0V2l0aE9wdGlvbnMsIGlzRWRpdG9ySW5wdXRXaXRoT3B0aW9uc0FuZEdyb3VwLCBpc1Jlc291cmNlRGlmZkVkaXRvcklucHV0LCBpc1Jlc291cmNlTWVyZ2VFZGl0b3JJbnB1dCwgaXNSZXNvdXJjZU11bHRpRGlmZkVkaXRvcklucHV0LCBpc1Jlc291cmNlU2lkZUJ5U2lkZUVkaXRvcklucHV0LCBpc1VudGl0bGVkUmVzb3VyY2VFZGl0b3JJbnB1dCwgSVVudHlwZWRFZGl0b3JJbnB1dCwgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3Ivc2lkZUJ5U2lkZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBmaW5kR3JvdXAgfSBmcm9tICcuLi9jb21tb24vZWRpdG9yR3JvdXBGaW5kZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRpZmZFZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkLCBFZGl0b3JBc3NvY2lhdGlvbiwgRWRpdG9yQXNzb2NpYXRpb25zLCBFZGl0b3JJbnB1dEZhY3RvcnlPYmplY3QsIGVkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWQsIGdsb2JNYXRjaGVzUmVzb3VyY2UsIElFZGl0b3JSZXNvbHZlclNlcnZpY2UsIHByaW9yaXR5VG9SYW5rLCBSZWdpc3RlcmVkRWRpdG9ySW5mbywgUmVnaXN0ZXJlZEVkaXRvck9wdGlvbnMsIFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eSwgUmVnaXN0ZXJlZEVkaXRvclJlZ2lzdHJhdGlvbkluZm8sIFJlc29sdmVkRWRpdG9yLCBSZXNvbHZlZFN0YXR1cywgdG9SZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHlJbmZvIH0gZnJvbSAnLi4vY29tbW9uL2VkaXRvclJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcmVmZXJyZWRHcm91cCB9IGZyb20gJy4uL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcblxuaW50ZXJmYWNlIFJlZ2lzdGVyZWRFZGl0b3Ige1xuXHRnbG9iUGF0dGVybjogc3RyaW5nIHwgZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuO1xuXHRlZGl0b3JJbmZvOiBSZWdpc3RlcmVkRWRpdG9ySW5mbztcblx0b3B0aW9ucz86IFJlZ2lzdGVyZWRFZGl0b3JPcHRpb25zO1xuXHRlZGl0b3JGYWN0b3J5T2JqZWN0OiBFZGl0b3JJbnB1dEZhY3RvcnlPYmplY3Q7XG59XG5cbnR5cGUgUmVnaXN0ZXJlZEVkaXRvcnMgPSBBcnJheTxSZWdpc3RlcmVkRWRpdG9yPjtcblxuZnVuY3Rpb24gbm9ybWFsaXplUmVnaXN0ZXJlZEVkaXRvckluZm8oZWRpdG9ySW5mbzogUmVnaXN0ZXJlZEVkaXRvclJlZ2lzdHJhdGlvbkluZm8pOiBSZWdpc3RlcmVkRWRpdG9ySW5mbyB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IGVkaXRvckluZm8uaWQsXG5cdFx0bGFiZWw6IGVkaXRvckluZm8ubGFiZWwsXG5cdFx0ZGV0YWlsOiBlZGl0b3JJbmZvLmRldGFpbCxcblx0XHRwcmlvcml0eTogdG9SZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHlJbmZvKGVkaXRvckluZm8ucHJpb3JpdHkpLFxuXHR9O1xufVxuXG5jb25zdCBlbnVtIEVkaXRvckFzc29jaWF0aW9uVHlwZSB7XG5cdEVkaXRvcixcblx0RGlmZkVkaXRvcixcblx0TWVyZ2VFZGl0b3Jcbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvclJlc29sdmVyU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8vIEV2ZW50c1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVkaXRvclJlZ2lzdHJhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgUGF1c2VhYmxlRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFZGl0b3JSZWdpc3RyYXRpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JSZWdpc3RyYXRpb25zLmV2ZW50O1xuXG5cdC8vIENvbnN0YW50c1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBjb25maWd1cmVEZWZhdWx0SUQgPSAncHJvbXB0T3BlbldpdGguY29uZmlndXJlRGVmYXVsdCc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGNvbmZpZ3VyZURlZmF1bHREaWZmSUQgPSAncHJvbXB0T3BlbldpdGguY29uZmlndXJlRGVmYXVsdERpZmYnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBjYWNoZVN0b3JhZ2VJRCA9ICdlZGl0b3JPdmVycmlkZVNlcnZpY2UuY2FjaGUnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBjb25mbGljdGluZ0RlZmF1bHRzU3RvcmFnZUlEID0gJ2VkaXRvck92ZXJyaWRlU2VydmljZS5jb25mbGljdGluZ0RlZmF1bHRzJztcblxuXHQvLyBEYXRhIFN0b3Jlc1xuXHRwcml2YXRlIF9lZGl0b3JzOiBNYXA8c3RyaW5nIHwgZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuLCBNYXA8c3RyaW5nLCBSZWdpc3RlcmVkRWRpdG9ycz4+ID0gbmV3IE1hcDxzdHJpbmcgfCBnbG9iLklSZWxhdGl2ZVBhdHRlcm4sIE1hcDxzdHJpbmcsIFJlZ2lzdGVyZWRFZGl0b3JzPj4oKTtcblx0cHJpdmF0ZSBfZmxhdHRlbmVkRWRpdG9yczogTWFwPHN0cmluZyB8IGdsb2IuSVJlbGF0aXZlUGF0dGVybiwgUmVnaXN0ZXJlZEVkaXRvcnM+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIF9zaG91bGRSZUZsYXR0ZW5FZGl0b3JzID0gdHJ1ZTtcblx0cHJpdmF0ZSBjYWNoZTogU2V0PHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdC8vIFJlYWQgaW4gdGhlIGNhY2hlIG9uIHN0YXR1cFxuXHRcdHRoaXMuY2FjaGUgPSBuZXcgU2V0PHN0cmluZz4oSlNPTi5wYXJzZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChFZGl0b3JSZXNvbHZlclNlcnZpY2UuY2FjaGVTdG9yYWdlSUQsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBKU09OLnN0cmluZ2lmeShbXSkpKSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmNhY2hlU3RvcmFnZUlELCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZSgoKSA9PiB7XG5cdFx0XHQvLyBXZSB3YW50IHRvIHN0b3JlIHRoZSBnbG9iIHBhdHRlcm5zIHdlIHdvdWxkIGFjdGl2YXRlIG9uLCB0aGlzIGFsbG93cyB1cyB0byBrbm93IGlmIHdlIG5lZWQgdG8gYXdhaXQgdGhlIGV4dCBob3N0IG9uIHN0YXJ0dXAgZm9yIG9wZW5pbmcgYSByZXNvdXJjZVxuXHRcdFx0dGhpcy5jYWNoZUVkaXRvcnMoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBXaGVuIGV4dGVuc2lvbnMgaGF2ZSByZWdpc3RlcmVkIHdlIG5vIGxvbmdlciBuZWVkIHRoZSBjYWNoZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5vbkRpZFJlZ2lzdGVyRXh0ZW5zaW9ucygoKSA9PiB7XG5cdFx0XHR0aGlzLmNhY2hlID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZVVudHlwZWRJbnB1dEFuZEdyb3VwKGVkaXRvcjogSVVudHlwZWRFZGl0b3JJbnB1dCwgcHJlZmVycmVkR3JvdXA6IFByZWZlcnJlZEdyb3VwIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxbSVVudHlwZWRFZGl0b3JJbnB1dCwgSUVkaXRvckdyb3VwLCBFZGl0b3JBY3RpdmF0aW9uIHwgdW5kZWZpbmVkXSB8IHVuZGVmaW5lZD4gfCBbSVVudHlwZWRFZGl0b3JJbnB1dCwgSUVkaXRvckdyb3VwLCBFZGl0b3JBY3RpdmF0aW9uIHwgdW5kZWZpbmVkXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdW50eXBlZEVkaXRvciA9IGVkaXRvcjtcblxuXHRcdC8vIFVzZSB0aGUgdW50eXBlZCBlZGl0b3IgdG8gZmluZCBhIGdyb3VwXG5cdFx0Y29uc3QgZmluZEdyb3VwUmVzdWx0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmaW5kR3JvdXAsIHVudHlwZWRFZGl0b3IsIHByZWZlcnJlZEdyb3VwKTtcblx0XHRpZiAoZmluZEdyb3VwUmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSkge1xuXHRcdFx0cmV0dXJuIGZpbmRHcm91cFJlc3VsdC50aGVuKChbZ3JvdXAsIGFjdGl2YXRpb25dKSA9PiBbdW50eXBlZEVkaXRvciwgZ3JvdXAsIGFjdGl2YXRpb25dKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgW2dyb3VwLCBhY3RpdmF0aW9uXSA9IGZpbmRHcm91cFJlc3VsdDtcblx0XHRcdHJldHVybiBbdW50eXBlZEVkaXRvciwgZ3JvdXAsIGFjdGl2YXRpb25dO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc29sdmVFZGl0b3IoZWRpdG9yOiBJVW50eXBlZEVkaXRvcklucHV0LCBwcmVmZXJyZWRHcm91cDogUHJlZmVycmVkR3JvdXAgfCB1bmRlZmluZWQpOiBQcm9taXNlPFJlc29sdmVkRWRpdG9yPiB7XG5cdFx0Ly8gVXBkYXRlIHRoZSBmbGF0dGVuZWQgZWRpdG9yc1xuXHRcdHRoaXMuX2ZsYXR0ZW5lZEVkaXRvcnMgPSB0aGlzLl9mbGF0dGVuRWRpdG9yc01hcCgpO1xuXG5cdFx0Ly8gU3BlY2lhbCBjYXNlOiBzaWRlIGJ5IHNpZGUgZWRpdG9ycyByZXF1aXJlcyB1cyB0b1xuXHRcdC8vIGluZGVwZW5kZW50bHkgcmVzb2x2ZSBib3RoIHNpZGVzIGFuZCB0aGVuIGJ1aWxkXG5cdFx0Ly8gYSBzaWRlIGJ5IHNpZGUgZWRpdG9yIHdpdGggdGhlIHJlc3VsdFxuXHRcdGlmIChpc1Jlc291cmNlU2lkZUJ5U2lkZUVkaXRvcklucHV0KGVkaXRvcikpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvUmVzb2x2ZVNpZGVCeVNpZGVFZGl0b3IoZWRpdG9yLCBwcmVmZXJyZWRHcm91cCk7XG5cdFx0fVxuXG5cdFx0bGV0IHJlc29sdmVkVW50eXBlZEFuZEdyb3VwOiBbSVVudHlwZWRFZGl0b3JJbnB1dCwgSUVkaXRvckdyb3VwLCBFZGl0b3JBY3RpdmF0aW9uIHwgdW5kZWZpbmVkXSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZXNvbHZlZFVudHlwZWRBbmRHcm91cFJlc3VsdCA9IHRoaXMucmVzb2x2ZVVudHlwZWRJbnB1dEFuZEdyb3VwKGVkaXRvciwgcHJlZmVycmVkR3JvdXApO1xuXHRcdGlmIChyZXNvbHZlZFVudHlwZWRBbmRHcm91cFJlc3VsdCBpbnN0YW5jZW9mIFByb21pc2UpIHtcblx0XHRcdHJlc29sdmVkVW50eXBlZEFuZEdyb3VwID0gYXdhaXQgcmVzb2x2ZWRVbnR5cGVkQW5kR3JvdXBSZXN1bHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc29sdmVkVW50eXBlZEFuZEdyb3VwID0gcmVzb2x2ZWRVbnR5cGVkQW5kR3JvdXBSZXN1bHQ7XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXNvbHZlZFVudHlwZWRBbmRHcm91cCkge1xuXHRcdFx0cmV0dXJuIFJlc29sdmVkU3RhdHVzLk5PTkU7XG5cdFx0fVxuXHRcdC8vIEdldCB0aGUgcmVzb2x2ZWQgdW50eXBlZCBlZGl0b3IsIGdyb3VwLCBhbmQgYWN0aXZhdGlvblxuXHRcdGNvbnN0IFt1bnR5cGVkRWRpdG9yLCBncm91cCwgYWN0aXZhdGlvbl0gPSByZXNvbHZlZFVudHlwZWRBbmRHcm91cDtcblx0XHRpZiAoYWN0aXZhdGlvbikge1xuXHRcdFx0dW50eXBlZEVkaXRvci5vcHRpb25zID0geyAuLi51bnR5cGVkRWRpdG9yLm9wdGlvbnMsIGFjdGl2YXRpb24gfTtcblx0XHR9XG5cblx0XHRsZXQgcmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaSh1bnR5cGVkRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cblx0XHQvLyBJZiBpdCB3YXMgcmVzb2x2ZWQgYmVmb3JlIHdlIGF3YWl0IGZvciB0aGUgZXh0ZW5zaW9ucyB0byBhY3RpdmF0ZSBhbmQgdGhlbiBwcm9jZWVkIHdpdGggcmVzb2x1dGlvbiBvciBlbHNlIHRoZSBiYWNraW5nIGV4dGVuc2lvbnMgd29uJ3QgYmUgcmVnaXN0ZXJlZFxuXHRcdGNvbnN0IGVkaXRvckFzc29jaWF0aW9uVHlwZSA9IGlzUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQodW50eXBlZEVkaXRvcikgPyBFZGl0b3JBc3NvY2lhdGlvblR5cGUuRGlmZkVkaXRvciA6IGlzUmVzb3VyY2VNZXJnZUVkaXRvcklucHV0KHVudHlwZWRFZGl0b3IpID8gRWRpdG9yQXNzb2NpYXRpb25UeXBlLk1lcmdlRWRpdG9yIDogRWRpdG9yQXNzb2NpYXRpb25UeXBlLkVkaXRvcjtcblx0XHRpZiAodGhpcy5jYWNoZSAmJiByZXNvdXJjZSAmJiAodGhpcy5yZXNvdXJjZU1hdGNoZXNDYWNoZShyZXNvdXJjZSkgfHwgdGhpcy5yZXNvdXJjZU1hdGNoZXNVc2VyQXNzb2NpYXRpb24ocmVzb3VyY2UsIGVkaXRvckFzc29jaWF0aW9uVHlwZSkpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVW5kZWZpbmVkIHJlc291cmNlIC0+IHVudGlsdGVkLiBPdGhlciBtYWxmb3JtZWQgVVJJJ3MgYXJlIHVucmVzb2x2YWJsZVxuXHRcdGlmIChyZXNvdXJjZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkIH0pO1xuXHRcdH0gZWxzZSBpZiAocmVzb3VyY2Uuc2NoZW1lID09PSB1bmRlZmluZWQgfHwgcmVzb3VyY2UgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBSZXNvbHZlZFN0YXR1cy5OT05FO1xuXHRcdH1cblxuXHRcdGlmICh1bnR5cGVkRWRpdG9yLm9wdGlvbnM/Lm92ZXJyaWRlID09PSBFZGl0b3JSZXNvbHV0aW9uLlBJQ0spIHtcblx0XHRcdGNvbnN0IHBpY2tlZCA9IGF3YWl0IHRoaXMuZG9QaWNrRWRpdG9yKHVudHlwZWRFZGl0b3IpO1xuXHRcdFx0Ly8gSWYgdGhlIHBpY2tlciB3YXMgY2FuY2VsbGVkIHdlIHdpbGwgc3RvcCByZXNvbHZpbmcgdGhlIGVkaXRvclxuXHRcdFx0aWYgKCFwaWNrZWQpIHtcblx0XHRcdFx0cmV0dXJuIFJlc29sdmVkU3RhdHVzLkFCT1JUO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUG9wdWxhdGUgdGhlIG9wdGlvbnMgd2l0aCB0aGUgbmV3IG9uZXNcblx0XHRcdHVudHlwZWRFZGl0b3Iub3B0aW9ucyA9IHBpY2tlZDtcblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlZCB0aGUgZWRpdG9yIElEIGFzIG11Y2ggYXMgcG9zc2libGUsIG5vdyBmaW5kIGEgZ2l2ZW4gZWRpdG9yIChjYXN0IGhlcmUgaXMgb2sgYmVjYXVzZSB3ZSByZXNvbHZlIGRvd24gdG8gYSBzdHJpbmcgYWJvdmUpXG5cdFx0bGV0IHsgZWRpdG9yOiBzZWxlY3RlZEVkaXRvciwgY29uZmxpY3RpbmdEZWZhdWx0IH0gPSB0aGlzLmdldEVkaXRvcihyZXNvdXJjZSwgdW50eXBlZEVkaXRvci5vcHRpb25zPy5vdmVycmlkZSBhcyAoc3RyaW5nIHwgRWRpdG9yUmVzb2x1dGlvbi5FWENMVVNJVkVfT05MWSB8IHVuZGVmaW5lZCksIGVkaXRvckFzc29jaWF0aW9uVHlwZSk7XG5cdFx0Ly8gSWYgbm8gZWRpdG9yIHdhcyBmb3VuZCBhbmQgdGhpcyB3YXMgYSB0eXBlZCBlZGl0b3Igb3IgYW4gZWRpdG9yIHdpdGggYW4gZXhwbGljaXQgb3ZlcnJpZGUgd2UgY291bGQgbm90IHJlc29sdmUgaXRcblx0XHRpZiAoIXNlbGVjdGVkRWRpdG9yICYmICh1bnR5cGVkRWRpdG9yLm9wdGlvbnM/Lm92ZXJyaWRlIHx8IGlzRWRpdG9ySW5wdXRXaXRoT3B0aW9ucyhlZGl0b3IpKSkge1xuXHRcdFx0cmV0dXJuIFJlc29sdmVkU3RhdHVzLk5PTkU7XG5cdFx0fSBlbHNlIGlmICghc2VsZWN0ZWRFZGl0b3IpIHtcblx0XHRcdC8vIFNpbXBsZSB1bnR5cGVkIGVkaXRvcnMgdGhhdCB3ZSBjb3VsZCBub3QgcmVzb2x2ZSB3aWxsIGJlIHJlc29sdmVkIHRvIHRoZSBkZWZhdWx0IGVkaXRvclxuXHRcdFx0Y29uc3QgcmVzb2x2ZWRFZGl0b3IgPSB0aGlzLmdldEVkaXRvcihyZXNvdXJjZSwgREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQsIGVkaXRvckFzc29jaWF0aW9uVHlwZSk7XG5cdFx0XHRzZWxlY3RlZEVkaXRvciA9IHJlc29sdmVkRWRpdG9yPy5lZGl0b3I7XG5cdFx0XHRjb25mbGljdGluZ0RlZmF1bHQgPSByZXNvbHZlZEVkaXRvcj8uY29uZmxpY3RpbmdEZWZhdWx0O1xuXHRcdFx0aWYgKCFzZWxlY3RlZEVkaXRvcikge1xuXHRcdFx0XHRyZXR1cm4gUmVzb2x2ZWRTdGF0dXMuTk9ORTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJbiB0aGUgc3BlY2lhbCBjYXNlIG9mIGRpZmYgZWRpdG9ycyB3ZSBkbyBzb21lIG1vcmUgd29yayB0byBkZXRlcm1pbmUgdGhlIGNvcnJlY3QgZWRpdG9yIGZvciBib3RoIHNpZGVzXG5cdFx0aWYgKGlzUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQodW50eXBlZEVkaXRvcikgJiYgdW50eXBlZEVkaXRvci5vcHRpb25zPy5vdmVycmlkZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRsZXQgcmVzb3VyY2UyID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkodW50eXBlZEVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5TRUNPTkRBUlkgfSk7XG5cdFx0XHRpZiAoIXJlc291cmNlMikge1xuXHRcdFx0XHRyZXNvdXJjZTIgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy51bnRpdGxlZCB9KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgZWRpdG9yOiBzZWxlY3RlZEVkaXRvcjIgfSA9IHRoaXMuZ2V0RWRpdG9yKHJlc291cmNlMiwgdW5kZWZpbmVkLCBlZGl0b3JBc3NvY2lhdGlvblR5cGUpO1xuXHRcdFx0aWYgKCFzZWxlY3RlZEVkaXRvcjIgfHwgc2VsZWN0ZWRFZGl0b3IuZWRpdG9ySW5mby5pZCAhPT0gc2VsZWN0ZWRFZGl0b3IyLmVkaXRvckluZm8uaWQpIHtcblx0XHRcdFx0Y29uc3QgeyBlZGl0b3I6IHNlbGVjdGVkRGlmZiwgY29uZmxpY3RpbmdEZWZhdWx0OiBjb25mbGljdGluZ0RlZmF1bHREaWZmIH0gPSB0aGlzLmdldEVkaXRvcihyZXNvdXJjZSwgREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQsIGVkaXRvckFzc29jaWF0aW9uVHlwZSk7XG5cdFx0XHRcdHNlbGVjdGVkRWRpdG9yID0gc2VsZWN0ZWREaWZmO1xuXHRcdFx0XHRjb25mbGljdGluZ0RlZmF1bHQgPSBjb25mbGljdGluZ0RlZmF1bHREaWZmO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzZWxlY3RlZEVkaXRvcikge1xuXHRcdFx0XHRyZXR1cm4gUmVzb2x2ZWRTdGF0dXMuTk9ORTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBubyBvdmVycmlkZSB3ZSB0YWtlIHRoZSBzZWxlY3RlZCBlZGl0b3IgaWQgc28gdGhhdCBtYXRjaGVzIHdvcmtzIHdpdGggdGhlIGlzQWN0aXZlIGNoZWNrXG5cdFx0dW50eXBlZEVkaXRvci5vcHRpb25zID0geyBvdmVycmlkZTogc2VsZWN0ZWRFZGl0b3IuZWRpdG9ySW5mby5pZCwgLi4udW50eXBlZEVkaXRvci5vcHRpb25zIH07XG5cblx0XHQvLyBDaGVjayBpZiBkaWZmIGNhbiBiZSBjcmVhdGVkIGJhc2VkIG9uIHByZXNjZW5lIG9mIGZhY3RvcnkgZnVuY3Rpb25cblx0XHRpZiAoc2VsZWN0ZWRFZGl0b3IuZWRpdG9yRmFjdG9yeU9iamVjdC5jcmVhdGVEaWZmRWRpdG9ySW5wdXQgPT09IHVuZGVmaW5lZCAmJiBpc1Jlc291cmNlRGlmZkVkaXRvcklucHV0KHVudHlwZWRFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gUmVzb2x2ZWRTdGF0dXMuTk9ORTtcblx0XHR9XG5cblx0XHRjb25zdCBpbnB1dCA9IGF3YWl0IHRoaXMuZG9SZXNvbHZlRWRpdG9yKHVudHlwZWRFZGl0b3IsIGdyb3VwLCBzZWxlY3RlZEVkaXRvcik7XG5cdFx0aWYgKGNvbmZsaWN0aW5nRGVmYXVsdCAmJiBpbnB1dCkge1xuXHRcdFx0Ly8gU2hvdyB0aGUgY29uZmxpY3RpbmcgZGVmYXVsdCBkaWFsb2dcblx0XHRcdGF3YWl0IHRoaXMuZG9IYW5kbGVDb25mbGljdGluZ0RlZmF1bHRzKHJlc291cmNlLCBzZWxlY3RlZEVkaXRvci5lZGl0b3JJbmZvLmxhYmVsLCB1bnR5cGVkRWRpdG9yLCBpbnB1dC5lZGl0b3IsIGdyb3VwKTtcblx0XHR9XG5cblx0XHRpZiAoaW5wdXQpIHtcblx0XHRcdGlmIChpbnB1dC5lZGl0b3IuZWRpdG9ySWQgIT09IHNlbGVjdGVkRWRpdG9yLmVkaXRvckluZm8uaWQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEVkaXRvciBJRCBNaXNtYXRjaDogJHtpbnB1dC5lZGl0b3IuZWRpdG9ySWR9ICE9PSAke3NlbGVjdGVkRWRpdG9yLmVkaXRvckluZm8uaWR9LiBUaGlzIHdpbGwgY2F1c2UgYnVncy4gUGxlYXNlIGVuc3VyZSBlZGl0b3JJbnB1dC5lZGl0b3JJZCBtYXRjaGVzIHRoZSByZWdpc3RlcmVkIGlkYCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyAuLi5pbnB1dCwgZ3JvdXAgfTtcblx0XHR9XG5cdFx0cmV0dXJuIFJlc29sdmVkU3RhdHVzLkFCT1JUO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1Jlc29sdmVTaWRlQnlTaWRlRWRpdG9yKGVkaXRvcjogSVJlc291cmNlU2lkZUJ5U2lkZUVkaXRvcklucHV0LCBwcmVmZXJyZWRHcm91cDogUHJlZmVycmVkR3JvdXAgfCB1bmRlZmluZWQpOiBQcm9taXNlPFJlc29sdmVkRWRpdG9yPiB7XG5cdFx0Y29uc3QgcHJpbWFyeVJlc29sdmVkRWRpdG9yID0gYXdhaXQgdGhpcy5yZXNvbHZlRWRpdG9yKGVkaXRvci5wcmltYXJ5LCBwcmVmZXJyZWRHcm91cCk7XG5cdFx0aWYgKCFpc0VkaXRvcklucHV0V2l0aE9wdGlvbnNBbmRHcm91cChwcmltYXJ5UmVzb2x2ZWRFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gUmVzb2x2ZWRTdGF0dXMuTk9ORTtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5UmVzb2x2ZWRFZGl0b3IgPSBhd2FpdCB0aGlzLnJlc29sdmVFZGl0b3IoZWRpdG9yLnNlY29uZGFyeSwgcHJpbWFyeVJlc29sdmVkRWRpdG9yLmdyb3VwID8/IHByZWZlcnJlZEdyb3VwKTtcblx0XHRpZiAoIWlzRWRpdG9ySW5wdXRXaXRoT3B0aW9uc0FuZEdyb3VwKHNlY29uZGFyeVJlc29sdmVkRWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuIFJlc29sdmVkU3RhdHVzLk5PTkU7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRncm91cDogcHJpbWFyeVJlc29sdmVkRWRpdG9yLmdyb3VwID8/IHNlY29uZGFyeVJlc29sdmVkRWRpdG9yLmdyb3VwLFxuXHRcdFx0ZWRpdG9yOiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpZGVCeVNpZGVFZGl0b3JJbnB1dCwgZWRpdG9yLmxhYmVsLCBlZGl0b3IuZGVzY3JpcHRpb24sIHNlY29uZGFyeVJlc29sdmVkRWRpdG9yLmVkaXRvciwgcHJpbWFyeVJlc29sdmVkRWRpdG9yLmVkaXRvciksXG5cdFx0XHRvcHRpb25zOiBlZGl0b3Iub3B0aW9uc1xuXHRcdH07XG5cdH1cblxuXHRidWZmZXJDaGFuZ2VFdmVudHMoY2FsbGJhY2s6IEZ1bmN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JSZWdpc3RyYXRpb25zLnBhdXNlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yUmVnaXN0cmF0aW9ucy5yZXN1bWUoKTtcblx0XHR9XG5cdH1cblxuXHRyZWdpc3RlckVkaXRvcihcblx0XHRnbG9iUGF0dGVybjogc3RyaW5nIHwgZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuLFxuXHRcdGVkaXRvckluZm86IFJlZ2lzdGVyZWRFZGl0b3JSZWdpc3RyYXRpb25JbmZvLFxuXHRcdG9wdGlvbnM6IFJlZ2lzdGVyZWRFZGl0b3JPcHRpb25zLFxuXHRcdGVkaXRvckZhY3RvcnlPYmplY3Q6IEVkaXRvcklucHV0RmFjdG9yeU9iamVjdFxuXHQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZEVkaXRvckluZm8gPSBub3JtYWxpemVSZWdpc3RlcmVkRWRpdG9ySW5mbyhlZGl0b3JJbmZvKTtcblx0XHRsZXQgcmVnaXN0ZXJlZEVkaXRvciA9IHRoaXMuX2VkaXRvcnMuZ2V0KGdsb2JQYXR0ZXJuKTtcblx0XHRpZiAocmVnaXN0ZXJlZEVkaXRvciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZWdpc3RlcmVkRWRpdG9yID0gbmV3IE1hcDxzdHJpbmcsIFJlZ2lzdGVyZWRFZGl0b3JzPigpO1xuXHRcdFx0dGhpcy5fZWRpdG9ycy5zZXQoZ2xvYlBhdHRlcm4sIHJlZ2lzdGVyZWRFZGl0b3IpO1xuXHRcdH1cblxuXHRcdGxldCBlZGl0b3JzV2l0aElkID0gcmVnaXN0ZXJlZEVkaXRvci5nZXQocmVnaXN0ZXJlZEVkaXRvckluZm8uaWQpO1xuXHRcdGlmIChlZGl0b3JzV2l0aElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGVkaXRvcnNXaXRoSWQgPSBbXTtcblx0XHR9XG5cdFx0Y29uc3QgcmVtb3ZlID0gaW5zZXJ0KGVkaXRvcnNXaXRoSWQsIHtcblx0XHRcdGdsb2JQYXR0ZXJuLFxuXHRcdFx0ZWRpdG9ySW5mbzogcmVnaXN0ZXJlZEVkaXRvckluZm8sXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0ZWRpdG9yRmFjdG9yeU9iamVjdFxuXHRcdH0pO1xuXHRcdHJlZ2lzdGVyZWRFZGl0b3Iuc2V0KHJlZ2lzdGVyZWRFZGl0b3JJbmZvLmlkLCBlZGl0b3JzV2l0aElkKTtcblx0XHR0aGlzLl9zaG91bGRSZUZsYXR0ZW5FZGl0b3JzID0gdHJ1ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUVkaXRvclJlZ2lzdHJhdGlvbnMuZmlyZSgpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0cmVtb3ZlKCk7XG5cdFx0XHRpZiAoZWRpdG9yc1dpdGhJZCAmJiBlZGl0b3JzV2l0aElkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZWdpc3RlcmVkRWRpdG9yPy5kZWxldGUoZWRpdG9ySW5mby5pZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zaG91bGRSZUZsYXR0ZW5FZGl0b3JzID0gdHJ1ZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yUmVnaXN0cmF0aW9ucy5maXJlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRnZXRBc3NvY2lhdGlvbnNGb3JSZXNvdXJjZShyZXNvdXJjZTogVVJJKTogRWRpdG9yQXNzb2NpYXRpb25zIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRBc3NvY2lhdGlvbnNGb3JSZXNvdXJjZUZyb21TZXR0aW5nKHJlc291cmNlLCBlZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkKTtcblx0fVxuXG5cdGdldENvbmZpZ3VyZWREZWZhdWx0RWRpdG9yKHJlc291cmNlOiBVUkksIGZvckRpZmZFZGl0b3I/OiBib29sZWFuKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXR0aW5nSWQgPSBmb3JEaWZmRWRpdG9yID8gZGlmZkVkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWQgOiBlZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkO1xuXHRcdHJldHVybiB0aGlzLmdldEFzc29jaWF0aW9uc0ZvclJlc291cmNlRnJvbVNldHRpbmcocmVzb3VyY2UsIHNldHRpbmdJZClbMF0/LnZpZXdUeXBlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBc3NvY2lhdGlvbnNGb3JSZXNvdXJjZUJ5VHlwZShyZXNvdXJjZTogVVJJLCBhc3NvY2lhdGlvblR5cGU6IEVkaXRvckFzc29jaWF0aW9uVHlwZSk6IEVkaXRvckFzc29jaWF0aW9ucyB7XG5cdFx0aWYgKGFzc29jaWF0aW9uVHlwZSA9PT0gRWRpdG9yQXNzb2NpYXRpb25UeXBlLkVkaXRvcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0QXNzb2NpYXRpb25zRm9yUmVzb3VyY2UocmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVBc3NvY2lhdGlvbnMgPSB0aGlzLmdldEFzc29jaWF0aW9uc0ZvclJlc291cmNlRnJvbVNldHRpbmcocmVzb3VyY2UsIGRpZmZFZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkKTtcblx0XHRpZiAobW9kZUFzc29jaWF0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBtb2RlQXNzb2NpYXRpb25zO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmdldEFzc29jaWF0aW9uc0ZvclJlc291cmNlKHJlc291cmNlKVxuXHRcdFx0LmZpbHRlcihhc3NvY2lhdGlvbiA9PiAhdGhpcy5pc0V4cGxpY2l0Rm9yQXNzb2NpYXRpb25UeXBlKGFzc29jaWF0aW9uLnZpZXdUeXBlLCBhc3NvY2lhdGlvblR5cGUpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBlZGl0b3IgcmVxdWlyZXMgYW4gYXNzb2NpYXRpb24gZm9yIHRoZSBnaXZlbiBpbnB1dCBraW5kIGluc3RlYWQgb2YgaW5oZXJpdGluZyBvbmVcblx0ICogZnJvbSBhbm90aGVyIGlucHV0IGtpbmQuXG5cdCAqL1xuXHRwcml2YXRlIGlzRXhwbGljaXRGb3JBc3NvY2lhdGlvblR5cGUodmlld1R5cGU6IHN0cmluZywgYXNzb2NpYXRpb25UeXBlOiBFZGl0b3JBc3NvY2lhdGlvblR5cGUpOiBib29sZWFuIHtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9yZWdpc3RlcmVkRWRpdG9ycy5maWx0ZXIoZWRpdG9yID0+IGVkaXRvci5lZGl0b3JJbmZvLmlkID09PSB2aWV3VHlwZSkuYXQoMCk7XG5cdFx0cmV0dXJuICEhZWRpdG9yICYmIHRoaXMuZ2V0RWZmZWN0aXZlUHJpb3JpdHkoZWRpdG9yLmVkaXRvckluZm8sIGFzc29jaWF0aW9uVHlwZSkgPT09IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leHBsaWNpdDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QXNzb2NpYXRpb25zRm9yUmVzb3VyY2VGcm9tU2V0dGluZyhyZXNvdXJjZTogVVJJLCBzZXR0aW5nSWQ6IHN0cmluZyk6IEVkaXRvckFzc29jaWF0aW9ucyB7XG5cdFx0Y29uc3QgbWF0Y2hpbmdBc3NvY2lhdGlvbnMgPSB0aGlzLmdldFJhd0Fzc29jaWF0aW9uc0ZvclJlc291cmNlRnJvbVNldHRpbmcocmVzb3VyY2UsIHNldHRpbmdJZCk7XG5cdFx0Y29uc3QgYWxsRWRpdG9yczogUmVnaXN0ZXJlZEVkaXRvcnMgPSB0aGlzLl9yZWdpc3RlcmVkRWRpdG9ycztcblx0XHQvLyBFbnN1cmUgdGhhdCB0aGUgc2V0dGluZ3MgYXJlIHZhbGlkIGVkaXRvcnNcblx0XHRyZXR1cm4gbWF0Y2hpbmdBc3NvY2lhdGlvbnMuZmlsdGVyKGFzc29jaWF0aW9uID0+IGFsbEVkaXRvcnMuZmluZChjID0+IGMuZWRpdG9ySW5mby5pZCA9PT0gYXNzb2NpYXRpb24udmlld1R5cGUpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmF3QXNzb2NpYXRpb25zRm9yUmVzb3VyY2VCeVR5cGUocmVzb3VyY2U6IFVSSSwgYXNzb2NpYXRpb25UeXBlOiBFZGl0b3JBc3NvY2lhdGlvblR5cGUpOiBFZGl0b3JBc3NvY2lhdGlvbnMge1xuXHRcdGlmIChhc3NvY2lhdGlvblR5cGUgPT09IEVkaXRvckFzc29jaWF0aW9uVHlwZS5FZGl0b3IpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFJhd0Fzc29jaWF0aW9uc0ZvclJlc291cmNlRnJvbVNldHRpbmcocmVzb3VyY2UsIGVkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpZmZBc3NvY2lhdGlvbnMgPSB0aGlzLmdldFJhd0Fzc29jaWF0aW9uc0ZvclJlc291cmNlRnJvbVNldHRpbmcocmVzb3VyY2UsIGRpZmZFZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkKTtcblx0XHRyZXR1cm4gZGlmZkFzc29jaWF0aW9ucy5sZW5ndGggPyBkaWZmQXNzb2NpYXRpb25zIDogdGhpcy5nZXRSYXdBc3NvY2lhdGlvbnNGb3JSZXNvdXJjZUZyb21TZXR0aW5nKHJlc291cmNlLCBlZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmF3QXNzb2NpYXRpb25zRm9yUmVzb3VyY2VGcm9tU2V0dGluZyhyZXNvdXJjZTogVVJJLCBzZXR0aW5nSWQ6IHN0cmluZyk6IEVkaXRvckFzc29jaWF0aW9ucyB7XG5cdFx0Y29uc3QgYXNzb2NpYXRpb25zID0gdGhpcy5nZXRBbGxVc2VyQXNzb2NpYXRpb25zRm9yU2V0dGluZyhzZXR0aW5nSWQpO1xuXHRcdGNvbnN0IG1hdGNoaW5nQXNzb2NpYXRpb25zID0gYXNzb2NpYXRpb25zLmZpbHRlcihhc3NvY2lhdGlvbiA9PiBhc3NvY2lhdGlvbi5maWxlbmFtZVBhdHRlcm4gJiYgZ2xvYk1hdGNoZXNSZXNvdXJjZShhc3NvY2lhdGlvbi5maWxlbmFtZVBhdHRlcm4sIHJlc291cmNlKSk7XG5cdFx0Ly8gU29ydCBtYXRjaGluZyBhc3NvY2lhdGlvbnMgYmFzZWQgb24gZ2xvYiBsZW5ndGggYXMgYSBsb25nZXIgZ2xvYiB3aWxsIGJlIG1vcmUgc3BlY2lmaWNcblx0XHRyZXR1cm4gbWF0Y2hpbmdBc3NvY2lhdGlvbnMuc29ydCgoYSwgYikgPT4gKGIuZmlsZW5hbWVQYXR0ZXJuPy5sZW5ndGggPz8gMCkgLSAoYS5maWxlbmFtZVBhdHRlcm4/Lmxlbmd0aCA/PyAwKSk7XG5cdH1cblxuXHRnZXRBbGxVc2VyQXNzb2NpYXRpb25zKCk6IEVkaXRvckFzc29jaWF0aW9ucyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0QWxsVXNlckFzc29jaWF0aW9uc0ZvclNldHRpbmcoZWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFsbFVzZXJBc3NvY2lhdGlvbnNGb3JTZXR0aW5nKHNldHRpbmdJZDogc3RyaW5nKTogRWRpdG9yQXNzb2NpYXRpb25zIHtcblx0XHRjb25zdCBpbnNwZWN0ZWRFZGl0b3JBc3NvY2lhdGlvbnMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8eyBbZmlsZU5hbWVQYXR0ZXJuOiBzdHJpbmddOiBzdHJpbmcgfT4oc2V0dGluZ0lkKSB8fCB7fTtcblx0XHRjb25zdCBkZWZhdWx0QXNzb2NpYXRpb25zID0gaW5zcGVjdGVkRWRpdG9yQXNzb2NpYXRpb25zLmRlZmF1bHRWYWx1ZSA/PyB7fTtcblx0XHRjb25zdCB3b3Jrc3BhY2VBc3NvY2lhdGlvbnMgPSBpbnNwZWN0ZWRFZGl0b3JBc3NvY2lhdGlvbnMud29ya3NwYWNlVmFsdWUgPz8ge307XG5cdFx0Y29uc3QgdXNlckFzc29jaWF0aW9ucyA9IGluc3BlY3RlZEVkaXRvckFzc29jaWF0aW9ucy51c2VyVmFsdWUgPz8ge307XG5cdFx0Y29uc3QgcmF3QXNzb2NpYXRpb25zOiB7IFtmaWxlTmFtZVBhdHRlcm46IHN0cmluZ106IHN0cmluZyB9ID0geyAuLi53b3Jrc3BhY2VBc3NvY2lhdGlvbnMgfTtcblx0XHQvLyBXZSB3YW50IHRvIGFwcGx5IHRoZSBkZWZhdWx0IGFzc29jaWF0aW9ucyBhbmQgdXNlciBhc3NvY2lhdGlvbnMgb24gdG9wIG9mIHRoZSB3b3Jrc3BhY2UgYXNzb2NpYXRpb25zIGJ1dCBpZ25vcmUgZHVwbGljYXRlIGtleXMuXG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoeyAuLi5kZWZhdWx0QXNzb2NpYXRpb25zLCAuLi51c2VyQXNzb2NpYXRpb25zIH0pKSB7XG5cdFx0XHRpZiAocmF3QXNzb2NpYXRpb25zW2tleV0gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyYXdBc3NvY2lhdGlvbnNba2V5XSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBhc3NvY2lhdGlvbnMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhyYXdBc3NvY2lhdGlvbnMpKSB7XG5cdFx0XHRjb25zdCBhc3NvY2lhdGlvbjogRWRpdG9yQXNzb2NpYXRpb24gPSB7XG5cdFx0XHRcdGZpbGVuYW1lUGF0dGVybjoga2V5LFxuXHRcdFx0XHR2aWV3VHlwZTogdmFsdWVcblx0XHRcdH07XG5cdFx0XHRhc3NvY2lhdGlvbnMucHVzaChhc3NvY2lhdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiBhc3NvY2lhdGlvbnM7XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gdGhlIG5lc3RlZCBuYXR1cmUgb2YgdGhlIGVkaXRvcnMgbWFwLCB3ZSBtZXJnZSBmYWN0b3JpZXMgb2YgdGhlIHNhbWUgZ2xvYiBhbmQgaWQgdG8gbWFrZSBpdCBmbGF0XG5cdCAqIGFuZCBlYXNpZXIgdG8gd29yayB3aXRoXG5cdCAqL1xuXHRwcml2YXRlIF9mbGF0dGVuRWRpdG9yc01hcCgpIHtcblx0XHQvLyBJZiB3ZSBzaG91bGRuJ3QgYmUgcmUtZmxhdHRlbmluZyAoZHVlIHRvIGxhY2sgb2YgdXBkYXRlKSB0aGVuIHJldHVybiBlYXJseVxuXHRcdGlmICghdGhpcy5fc2hvdWxkUmVGbGF0dGVuRWRpdG9ycykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZsYXR0ZW5lZEVkaXRvcnM7XG5cdFx0fVxuXHRcdHRoaXMuX3Nob3VsZFJlRmxhdHRlbkVkaXRvcnMgPSBmYWxzZTtcblx0XHRjb25zdCBlZGl0b3JzID0gbmV3IE1hcDxzdHJpbmcgfCBnbG9iLklSZWxhdGl2ZVBhdHRlcm4sIFJlZ2lzdGVyZWRFZGl0b3JzPigpO1xuXHRcdGZvciAoY29uc3QgW2dsb2IsIHZhbHVlXSBvZiB0aGlzLl9lZGl0b3JzKSB7XG5cdFx0XHRjb25zdCByZWdpc3RlcmVkRWRpdG9yczogUmVnaXN0ZXJlZEVkaXRvcnMgPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9ycyBvZiB2YWx1ZS52YWx1ZXMoKSkge1xuXHRcdFx0XHRsZXQgcmVnaXN0ZXJlZEVkaXRvcjogUmVnaXN0ZXJlZEVkaXRvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Ly8gTWVyZ2UgYWxsIGVkaXRvcnMgd2l0aCB0aGUgc2FtZSBpZCBhbmQgZ2xvYiBwYXR0ZXJuIHRvZ2V0aGVyXG5cdFx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0XHRpZiAoIXJlZ2lzdGVyZWRFZGl0b3IpIHtcblx0XHRcdFx0XHRcdHJlZ2lzdGVyZWRFZGl0b3IgPSB7XG5cdFx0XHRcdFx0XHRcdGVkaXRvckluZm86IGVkaXRvci5lZGl0b3JJbmZvLFxuXHRcdFx0XHRcdFx0XHRnbG9iUGF0dGVybjogZWRpdG9yLmdsb2JQYXR0ZXJuLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7fSxcblx0XHRcdFx0XHRcdFx0ZWRpdG9yRmFjdG9yeU9iamVjdDoge31cblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIE1lcmdlIG9wdGlvbnMgYW5kIGZhY3Rvcmllc1xuXHRcdFx0XHRcdHJlZ2lzdGVyZWRFZGl0b3Iub3B0aW9ucyA9IHsgLi4ucmVnaXN0ZXJlZEVkaXRvci5vcHRpb25zLCAuLi5lZGl0b3Iub3B0aW9ucyB9O1xuXHRcdFx0XHRcdHJlZ2lzdGVyZWRFZGl0b3IuZWRpdG9yRmFjdG9yeU9iamVjdCA9IHsgLi4ucmVnaXN0ZXJlZEVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LCAuLi5lZGl0b3IuZWRpdG9yRmFjdG9yeU9iamVjdCB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyZWdpc3RlcmVkRWRpdG9yKSB7XG5cdFx0XHRcdFx0cmVnaXN0ZXJlZEVkaXRvcnMucHVzaChyZWdpc3RlcmVkRWRpdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZWRpdG9ycy5zZXQoZ2xvYiwgcmVnaXN0ZXJlZEVkaXRvcnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gZWRpdG9ycztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGFsbCBlZGl0b3JzIGFzIGFuIGFycmF5LiBQb3NzaWJsZSB0byBjb250YWluIGR1cGxpY2F0ZXNcblx0ICovXG5cdHByaXZhdGUgZ2V0IF9yZWdpc3RlcmVkRWRpdG9ycygpOiBSZWdpc3RlcmVkRWRpdG9ycyB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fZmxhdHRlbmVkRWRpdG9ycy52YWx1ZXMoKSkuZmxhdCgpO1xuXHR9XG5cblx0dXBkYXRlVXNlckFzc29jaWF0aW9ucyhnbG9iUGF0dGVybjogc3RyaW5nLCBlZGl0b3JJRDogc3RyaW5nLCBmb3JEaWZmRWRpdG9yPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlVXNlckFzc29jaWF0aW9uc0ZvclNldHRpbmcoZm9yRGlmZkVkaXRvciA/IGRpZmZFZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkIDogZWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZCwgZ2xvYlBhdHRlcm4sIGVkaXRvcklEKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVXNlckFzc29jaWF0aW9uc0ZvclR5cGUoYXNzb2NpYXRpb25UeXBlOiBFZGl0b3JBc3NvY2lhdGlvblR5cGUsIGdsb2JQYXR0ZXJuOiBzdHJpbmcsIGVkaXRvcklEOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZVVzZXJBc3NvY2lhdGlvbnNGb3JTZXR0aW5nKGFzc29jaWF0aW9uVHlwZSA9PT0gRWRpdG9yQXNzb2NpYXRpb25UeXBlLkRpZmZFZGl0b3IgPyBkaWZmRWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZCA6IGVkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWQsIGdsb2JQYXR0ZXJuLCBlZGl0b3JJRCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVVzZXJBc3NvY2lhdGlvbnNGb3JTZXR0aW5nKHNldHRpbmdJZDogc3RyaW5nLCBnbG9iUGF0dGVybjogc3RyaW5nLCBlZGl0b3JJRDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3QXNzb2NpYXRpb246IEVkaXRvckFzc29jaWF0aW9uID0geyB2aWV3VHlwZTogZWRpdG9ySUQsIGZpbGVuYW1lUGF0dGVybjogZ2xvYlBhdHRlcm4gfTtcblx0XHRjb25zdCBjdXJyZW50QXNzb2NpYXRpb25zID0gdGhpcy5nZXRBbGxVc2VyQXNzb2NpYXRpb25zRm9yU2V0dGluZyhzZXR0aW5nSWQpO1xuXHRcdGNvbnN0IG5ld1NldHRpbmdPYmplY3QgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdC8vIEZvcm0gdGhlIG5ldyBzZXR0aW5nIG9iamVjdCBpbmNsdWRpbmcgdGhlIG5ld2VzdCBhc3NvY2lhdGlvbnNcblx0XHRmb3IgKGNvbnN0IGFzc29jaWF0aW9uIG9mIFsuLi5jdXJyZW50QXNzb2NpYXRpb25zLCBuZXdBc3NvY2lhdGlvbl0pIHtcblx0XHRcdGlmIChhc3NvY2lhdGlvbi5maWxlbmFtZVBhdHRlcm4pIHtcblx0XHRcdFx0bmV3U2V0dGluZ09iamVjdFthc3NvY2lhdGlvbi5maWxlbmFtZVBhdHRlcm5dID0gYXNzb2NpYXRpb24udmlld1R5cGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoc2V0dGluZ0lkLCBuZXdTZXR0aW5nT2JqZWN0KTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlVXNlckFzc29jaWF0aW9uRm9yU2V0dGluZyhzZXR0aW5nSWQ6IHN0cmluZywgZ2xvYlBhdHRlcm46IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRBc3NvY2lhdGlvbnMgPSB0aGlzLmdldEFsbFVzZXJBc3NvY2lhdGlvbnNGb3JTZXR0aW5nKHNldHRpbmdJZCk7XG5cdFx0aWYgKCFjdXJyZW50QXNzb2NpYXRpb25zLnNvbWUoYXNzb2NpYXRpb24gPT4gYXNzb2NpYXRpb24uZmlsZW5hbWVQYXR0ZXJuID09PSBnbG9iUGF0dGVybikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbmV3U2V0dGluZ09iamVjdCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0Zm9yIChjb25zdCBhc3NvY2lhdGlvbiBvZiBjdXJyZW50QXNzb2NpYXRpb25zKSB7XG5cdFx0XHRpZiAoYXNzb2NpYXRpb24uZmlsZW5hbWVQYXR0ZXJuICYmIGFzc29jaWF0aW9uLmZpbGVuYW1lUGF0dGVybiAhPT0gZ2xvYlBhdHRlcm4pIHtcblx0XHRcdFx0bmV3U2V0dGluZ09iamVjdFthc3NvY2lhdGlvbi5maWxlbmFtZVBhdHRlcm5dID0gYXNzb2NpYXRpb24udmlld1R5cGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoc2V0dGluZ0lkLCBuZXdTZXR0aW5nT2JqZWN0KTtcblx0fVxuXG5cdHByaXZhdGUgZmluZE1hdGNoaW5nRWRpdG9ycyhyZXNvdXJjZTogVVJJLCBhc3NvY2lhdGlvblR5cGU6IEVkaXRvckFzc29jaWF0aW9uVHlwZSA9IEVkaXRvckFzc29jaWF0aW9uVHlwZS5FZGl0b3IpOiBSZWdpc3RlcmVkRWRpdG9yW10ge1xuXHRcdC8vIFRoZSB1c2VyIHNldHRpbmcgc2hvdWxkIGJlIHJlc3BlY3RlZCBldmVuIGlmIHRoZSBlZGl0b3IgZG9lc24ndCBzcGVjaWZ5IHRoYXQgcmVzb3VyY2UgaW4gcGFja2FnZS5qc29uXG5cdFx0Y29uc3QgdXNlclNldHRpbmdzID0gdGhpcy5nZXRBc3NvY2lhdGlvbnNGb3JSZXNvdXJjZUJ5VHlwZShyZXNvdXJjZSwgYXNzb2NpYXRpb25UeXBlKTtcblx0XHRjb25zdCBtYXRjaGluZ0VkaXRvcnM6IFJlZ2lzdGVyZWRFZGl0b3JbXSA9IFtdO1xuXHRcdC8vIFRoZW4gYWxsIGdsb2IgcGF0dGVybnNcblx0XHRmb3IgKGNvbnN0IFtrZXksIGVkaXRvcnNdIG9mIHRoaXMuX2ZsYXR0ZW5lZEVkaXRvcnMpIHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0aWYgKGFzc29jaWF0aW9uVHlwZSA9PT0gRWRpdG9yQXNzb2NpYXRpb25UeXBlLkRpZmZFZGl0b3IgJiYgIWVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZURpZmZFZGl0b3JJbnB1dCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhc3NvY2lhdGlvblR5cGUgPT09IEVkaXRvckFzc29jaWF0aW9uVHlwZS5NZXJnZUVkaXRvciAmJiAhZWRpdG9yLmVkaXRvckZhY3RvcnlPYmplY3QuY3JlYXRlTWVyZ2VFZGl0b3JJbnB1dCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZm91bmRJblNldHRpbmdzID0gdXNlclNldHRpbmdzLmZpbmQoc2V0dGluZyA9PiBzZXR0aW5nLnZpZXdUeXBlID09PSBlZGl0b3IuZWRpdG9ySW5mby5pZCk7XG5cdFx0XHRcdGlmICgoZm91bmRJblNldHRpbmdzICYmIHRoaXMuZ2V0RWZmZWN0aXZlUHJpb3JpdHkoZWRpdG9yLmVkaXRvckluZm8sIGFzc29jaWF0aW9uVHlwZSkgIT09IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leGNsdXNpdmUpIHx8IGdsb2JNYXRjaGVzUmVzb3VyY2Uoa2V5LCByZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRtYXRjaGluZ0VkaXRvcnMucHVzaChlZGl0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFJldHVybiB0aGUgZWRpdG9ycyBzb3J0ZWQgYnkgdGhlaXIgcHJpb3JpdHlcblx0XHRyZXR1cm4gbWF0Y2hpbmdFZGl0b3JzLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGNvbnN0IGFQcmlvcml0eSA9IHRoaXMuZ2V0RWZmZWN0aXZlUHJpb3JpdHkoYS5lZGl0b3JJbmZvLCBhc3NvY2lhdGlvblR5cGUpO1xuXHRcdFx0Y29uc3QgYlByaW9yaXR5ID0gdGhpcy5nZXRFZmZlY3RpdmVQcmlvcml0eShiLmVkaXRvckluZm8sIGFzc29jaWF0aW9uVHlwZSk7XG5cdFx0XHQvLyBWZXJ5IGNydWRlIGlmIHByaW9yaXRpZXMgbWF0Y2ggbG9uZ2VyIGdsb2Igd2lucyBhcyBsb25nZXIgZ2xvYnMgYXJlIG5vcm1hbGx5IG1vcmUgc3BlY2lmaWNcblx0XHRcdGlmIChwcmlvcml0eVRvUmFuayhiUHJpb3JpdHkpID09PSBwcmlvcml0eVRvUmFuayhhUHJpb3JpdHkpICYmIHR5cGVvZiBiLmdsb2JQYXR0ZXJuID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgYS5nbG9iUGF0dGVybiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIGIuZ2xvYlBhdHRlcm4ubGVuZ3RoIC0gYS5nbG9iUGF0dGVybi5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcHJpb3JpdHlUb1JhbmsoYlByaW9yaXR5KSAtIHByaW9yaXR5VG9SYW5rKGFQcmlvcml0eSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RWRpdG9ycyhyZXNvdXJjZT86IFVSSSk6IFJlZ2lzdGVyZWRFZGl0b3JJbmZvW10ge1xuXHRcdHRoaXMuX2ZsYXR0ZW5lZEVkaXRvcnMgPSB0aGlzLl9mbGF0dGVuRWRpdG9yc01hcCgpO1xuXG5cdFx0Ly8gQnkgcmVzb3VyY2Vcblx0XHRpZiAoVVJJLmlzVXJpKHJlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgZWRpdG9ycyA9IHRoaXMuZmluZE1hdGNoaW5nRWRpdG9ycyhyZXNvdXJjZSk7XG5cdFx0XHRpZiAoZWRpdG9ycy5maW5kKGUgPT4gZS5lZGl0b3JJbmZvLnByaW9yaXR5LmVkaXRvciA9PT0gUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4Y2x1c2l2ZSkpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGVkaXRvcnMubWFwKGVkaXRvciA9PiBlZGl0b3IuZWRpdG9ySW5mbyk7XG5cdFx0fVxuXG5cdFx0Ly8gQWxsXG5cdFx0cmV0dXJuIGRpc3RpbmN0KHRoaXMuX3JlZ2lzdGVyZWRFZGl0b3JzLm1hcChlZGl0b3IgPT4gZWRpdG9yLmVkaXRvckluZm8pLCBlZGl0b3IgPT4gZWRpdG9yLmlkKTtcblx0fVxuXG5cdGdldEJpbmFyeURpZmZGYWxsYmFja0VkaXRvcihyZXNvdXJjZTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLl9mbGF0dGVuZWRFZGl0b3JzID0gdGhpcy5fZmxhdHRlbkVkaXRvcnNNYXAoKTtcblxuXHRcdC8vIGBmaW5kTWF0Y2hpbmdFZGl0b3JzKC4uLiwgRGlmZkVkaXRvcilgIG9ubHkga2VlcHMgZWRpdG9ycyB0aGF0IHByb3ZpZGUgYSBkaWZmIGVkaXRvciBmYWN0b3J5XG5cdFx0Ly8gYW5kIHNvcnRzIHRoZW0gYnkgdGhlaXIgZGlmZiBwcmlvcml0eS4gSXQgc3RpbGwgaW5jbHVkZXMgYGV4cGxpY2l0YCBlZGl0b3JzICh0aGV5IG1hdGNoIGJ5IGdsb2IpLFxuXHRcdC8vIHdoaWNoIGlzIGV4YWN0bHkgd2hhdCB3ZSB3YW50IGhlcmU6IGFuIGBleHBsaWNpdGAgZWRpdG9yIG9wdHMgb3V0IG9mIGRpZmZzIGZvciB0ZXh0IGZpbGVzLCBidXQgaXNcblx0XHQvLyB0aGUgYmV0dGVyIGNob2ljZSB0aGFuIHRoZSBnZW5lcmljIGJpbmFyeSBmYWxsYmFjayB3aGVuIHRoZSB0ZXh0IGRpZmYgZWRpdG9yIGNhbm5vdCByZW5kZXIgdGhlXG5cdFx0Ly8gY29udGVudC4gV2UgZXhjbHVkZSB0aGUgYnVpbHQtaW4gZGVmYXVsdCB0ZXh0IGVkaXRvciBzaW5jZSB0aGF0IGlzIHRoZSBlZGl0b3IgdGhhdCBhbHJlYWR5XG5cdFx0Ly8gZmFpbGVkIHRvIHJlbmRlciB0aGUgYmluYXJ5IGNvbnRlbnQuXG5cdFx0Y29uc3QgZWRpdG9ycyA9IHRoaXMuZmluZE1hdGNoaW5nRWRpdG9ycyhyZXNvdXJjZSwgRWRpdG9yQXNzb2NpYXRpb25UeXBlLkRpZmZFZGl0b3IpXG5cdFx0XHQuZmlsdGVyKGVkaXRvciA9PiBlZGl0b3IuZWRpdG9ySW5mby5pZCAhPT0gREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQpO1xuXHRcdHJldHVybiBlZGl0b3JzWzBdPy5lZGl0b3JJbmZvLmlkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIGEgcmVzb3VyY2UgYW5kIGFuIGVkaXRvcklkIHNlbGVjdHMgdGhlIGJlc3QgcG9zc2libGUgZWRpdG9yXG5cdCAqIEByZXR1cm5zIFRoZSBlZGl0b3IgYW5kIHdoZXRoZXIgdGhlcmUgd2FzIGFub3RoZXIgZGVmYXVsdCB3aGljaCBjb25mbGljdGVkIHdpdGggaXRcblx0ICovXG5cdHByaXZhdGUgZ2V0RWRpdG9yKHJlc291cmNlOiBVUkksIGVkaXRvcklkOiBzdHJpbmcgfCBFZGl0b3JSZXNvbHV0aW9uLkVYQ0xVU0lWRV9PTkxZIHwgdW5kZWZpbmVkLCBhc3NvY2lhdGlvblR5cGU6IEVkaXRvckFzc29jaWF0aW9uVHlwZSk6IHsgZWRpdG9yOiBSZWdpc3RlcmVkRWRpdG9yIHwgdW5kZWZpbmVkOyBjb25mbGljdGluZ0RlZmF1bHQ6IGJvb2xlYW4gfSB7XG5cblx0XHRjb25zdCBmaW5kTWF0Y2hpbmdFZGl0b3IgPSAoZWRpdG9yczogUmVnaXN0ZXJlZEVkaXRvcnMsIHZpZXdUeXBlOiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiBlZGl0b3JzLmZpbmQoKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRpZiAoYXNzb2NpYXRpb25UeXBlID09PSBFZGl0b3JBc3NvY2lhdGlvblR5cGUuRGlmZkVkaXRvciAmJiAhZWRpdG9yLmVkaXRvckZhY3RvcnlPYmplY3QuY3JlYXRlRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhc3NvY2lhdGlvblR5cGUgPT09IEVkaXRvckFzc29jaWF0aW9uVHlwZS5NZXJnZUVkaXRvciAmJiAhZWRpdG9yLmVkaXRvckZhY3RvcnlPYmplY3QuY3JlYXRlTWVyZ2VFZGl0b3JJbnB1dCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlZGl0b3Iub3B0aW9ucz8uY2FuU3VwcG9ydFJlc291cmNlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZWRpdG9yLmVkaXRvckluZm8uaWQgPT09IHZpZXdUeXBlICYmIGVkaXRvci5vcHRpb25zLmNhblN1cHBvcnRSZXNvdXJjZShyZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGVkaXRvci5lZGl0b3JJbmZvLmlkID09PSB2aWV3VHlwZTtcblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRpZiAoZWRpdG9ySWQgJiYgZWRpdG9ySWQgIT09IEVkaXRvclJlc29sdXRpb24uRVhDTFVTSVZFX09OTFkpIHtcblx0XHRcdC8vIFNwZWNpZmljIGlkIHBhc3NlZCBpbiBkb2Vzbid0IGhhdmUgdG8gbWF0Y2ggdGhlIHJlc291cmNlLCBpdCBjYW4gYmUgYW55dGhpbmdcblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWRFZGl0b3JzID0gdGhpcy5fcmVnaXN0ZXJlZEVkaXRvcnM7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlZGl0b3I6IGZpbmRNYXRjaGluZ0VkaXRvcihyZWdpc3RlcmVkRWRpdG9ycywgZWRpdG9ySWQpLFxuXHRcdFx0XHRjb25mbGljdGluZ0RlZmF1bHQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvcnMgPSB0aGlzLmZpbmRNYXRjaGluZ0VkaXRvcnMocmVzb3VyY2UsIGFzc29jaWF0aW9uVHlwZSk7XG5cblx0XHRjb25zdCBhc3NvY2lhdGlvbnNGcm9tU2V0dGluZyA9IHRoaXMuZ2V0QXNzb2NpYXRpb25zRm9yUmVzb3VyY2VCeVR5cGUocmVzb3VyY2UsIGFzc29jaWF0aW9uVHlwZSk7XG5cdFx0Ly8gV2Ugb25seSB3YW50IG1pblByaW9yaXR5KyBpZiBubyB1c2VyIGRlZmluZWQgc2V0dGluZyBpcyBmb3VuZCwgZWxzZSB3ZSB3b24ndCByZXNvbHZlIGFuIGVkaXRvclxuXHRcdGNvbnN0IG1pblByaW9yaXR5ID0gZWRpdG9ySWQgPT09IEVkaXRvclJlc29sdXRpb24uRVhDTFVTSVZFX09OTFkgPyBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhjbHVzaXZlIDogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmJ1aWx0aW47XG5cdFx0bGV0IHBvc3NpYmxlRWRpdG9ycyA9IGVkaXRvcnMuZmlsdGVyKGVkaXRvciA9PiBwcmlvcml0eVRvUmFuayh0aGlzLmdldEVmZmVjdGl2ZVByaW9yaXR5KGVkaXRvci5lZGl0b3JJbmZvLCBhc3NvY2lhdGlvblR5cGUpKSA+PSBwcmlvcml0eVRvUmFuayhtaW5Qcmlvcml0eSkgJiYgZWRpdG9yLmVkaXRvckluZm8uaWQgIT09IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLmlkKTtcblx0XHRpZiAocG9zc2libGVFZGl0b3JzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZWRpdG9yOiBhc3NvY2lhdGlvbnNGcm9tU2V0dGluZ1swXSAmJiBtaW5Qcmlvcml0eSAhPT0gUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4Y2x1c2l2ZSA/IGZpbmRNYXRjaGluZ0VkaXRvcihlZGl0b3JzLCBhc3NvY2lhdGlvbnNGcm9tU2V0dGluZ1swXS52aWV3VHlwZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbmZsaWN0aW5nRGVmYXVsdDogZmFsc2Vcblx0XHRcdH07XG5cdFx0fVxuXHRcdC8vIElmIHRoZSBlZGl0b3IgaXMgZXhjbHVzaXZlIHdlIHVzZSB0aGF0LCBlbHNlIHVzZSB0aGUgdXNlciBzZXR0aW5nLCBlbHNlIHdlIGNoZWNrIGNhblN1cHBvcnRSZXNvdXJjZSwgZWxzZSB0YWtlIHRoZSB2aWV3dHlwZSBvZiBmaXJzdCBwb3NzaWJsZSBlZGl0b3Jcblx0XHRjb25zdCBzZWxlY3RlZFZpZXdUeXBlID0gdGhpcy5nZXRFZmZlY3RpdmVQcmlvcml0eShwb3NzaWJsZUVkaXRvcnNbMF0uZWRpdG9ySW5mbywgYXNzb2NpYXRpb25UeXBlKSA9PT0gUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4Y2x1c2l2ZSA/XG5cdFx0XHRwb3NzaWJsZUVkaXRvcnNbMF0uZWRpdG9ySW5mby5pZCA6XG5cdFx0XHRhc3NvY2lhdGlvbnNGcm9tU2V0dGluZ1swXT8udmlld1R5cGUgfHxcblx0XHRcdChwb3NzaWJsZUVkaXRvcnMuZmluZChlZGl0b3IgPT4gKCFlZGl0b3Iub3B0aW9ucz8uY2FuU3VwcG9ydFJlc291cmNlIHx8IGVkaXRvci5vcHRpb25zLmNhblN1cHBvcnRSZXNvdXJjZShyZXNvdXJjZSkpKT8uZWRpdG9ySW5mby5pZCkgfHxcblx0XHRcdHBvc3NpYmxlRWRpdG9yc1swXS5lZGl0b3JJbmZvLmlkO1xuXG5cdFx0bGV0IGNvbmZsaWN0aW5nRGVmYXVsdCA9IGZhbHNlO1xuXG5cdFx0Ly8gRmlsdGVyIG91dCBleGNsdXNpdmUgYmVmb3JlIHdlIGNoZWNrIGZvciBjb25mbGljdHMgYXMgZXhjbHVzaXZlIGVkaXRvcnMgY2Fubm90IGJlIG1hbnVhbGx5IGNob3NlblxuXHRcdC8vIHNpbWlsYXIgdG8gYWJvdmUsIG5lZWQgdG8gY2hlY2sgY2FuU3VwcG9ydFJlc291cmNlIGlmIG5vdGhpbmcgaXMgZXhjbHVzaXZlXG5cdFx0cG9zc2libGVFZGl0b3JzID0gcG9zc2libGVFZGl0b3JzXG5cdFx0XHQuZmlsdGVyKGVkaXRvciA9PiB0aGlzLmdldEVmZmVjdGl2ZVByaW9yaXR5KGVkaXRvci5lZGl0b3JJbmZvLCBhc3NvY2lhdGlvblR5cGUpICE9PSBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhjbHVzaXZlKVxuXHRcdFx0LmZpbHRlcihlZGl0b3IgPT4gIWVkaXRvci5vcHRpb25zPy5jYW5TdXBwb3J0UmVzb3VyY2UgfHwgZWRpdG9yLm9wdGlvbnMuY2FuU3VwcG9ydFJlc291cmNlKHJlc291cmNlKSk7XG5cdFx0aWYgKGFzc29jaWF0aW9uc0Zyb21TZXR0aW5nLmxlbmd0aCA9PT0gMCAmJiBwb3NzaWJsZUVkaXRvcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0Y29uZmxpY3RpbmdEZWZhdWx0ID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWRpdG9yOiBmaW5kTWF0Y2hpbmdFZGl0b3IoZWRpdG9ycywgc2VsZWN0ZWRWaWV3VHlwZSksXG5cdFx0XHRjb25mbGljdGluZ0RlZmF1bHRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFZmZlY3RpdmVQcmlvcml0eShlZGl0b3JJbmZvOiBSZWdpc3RlcmVkRWRpdG9ySW5mbywgYXNzb2NpYXRpb25UeXBlOiBFZGl0b3JBc3NvY2lhdGlvblR5cGUpOiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkge1xuXHRcdHN3aXRjaCAoYXNzb2NpYXRpb25UeXBlKSB7XG5cdFx0XHRjYXNlIEVkaXRvckFzc29jaWF0aW9uVHlwZS5EaWZmRWRpdG9yOlxuXHRcdFx0XHRyZXR1cm4gZWRpdG9ySW5mby5wcmlvcml0eS5kaWZmO1xuXHRcdFx0Y2FzZSBFZGl0b3JBc3NvY2lhdGlvblR5cGUuTWVyZ2VFZGl0b3I6XG5cdFx0XHRcdHJldHVybiBlZGl0b3JJbmZvLnByaW9yaXR5Lm1lcmdlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGVkaXRvckluZm8ucHJpb3JpdHkuZWRpdG9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlRWRpdG9yKGVkaXRvcjogSVVudHlwZWRFZGl0b3JJbnB1dCwgZ3JvdXA6IElFZGl0b3JHcm91cCwgc2VsZWN0ZWRFZGl0b3I6IFJlZ2lzdGVyZWRFZGl0b3IpOiBQcm9taXNlPEVkaXRvcklucHV0V2l0aE9wdGlvbnMgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgb3B0aW9ucyA9IGVkaXRvci5vcHRpb25zO1xuXHRcdGNvbnN0IHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0Ly8gSWYgbm8gYWN0aXZhdGlvbiBvcHRpb24gaXMgcHJvdmlkZWQsIHBvcHVsYXRlIGl0LlxuXHRcdGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLmFjdGl2YXRpb24gPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRvcHRpb25zID0geyAuLi5vcHRpb25zLCBhY3RpdmF0aW9uOiBvcHRpb25zLnByZXNlcnZlRm9jdXMgPyBFZGl0b3JBY3RpdmF0aW9uLlJFU1RPUkUgOiB1bmRlZmluZWQgfTtcblx0XHR9XG5cblx0XHQvLyBJZiBpdCdzIGEgbWVyZ2UgZWRpdG9yIHdlIHRyaWdnZXIgdGhlIGNyZWF0ZSBtZXJnZSBlZGl0b3IgaW5wdXRcblx0XHRpZiAoaXNSZXNvdXJjZU1lcmdlRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0aWYgKCFzZWxlY3RlZEVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZU1lcmdlRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5wdXRXaXRoT3B0aW9ucyA9IGF3YWl0IHNlbGVjdGVkRWRpdG9yLmVkaXRvckZhY3RvcnlPYmplY3QuY3JlYXRlTWVyZ2VFZGl0b3JJbnB1dChlZGl0b3IsIGdyb3VwKTtcblx0XHRcdHJldHVybiB7IGVkaXRvcjogaW5wdXRXaXRoT3B0aW9ucy5lZGl0b3IsIG9wdGlvbnM6IGlucHV0V2l0aE9wdGlvbnMub3B0aW9ucyA/PyBvcHRpb25zIH07XG5cdFx0fVxuXG5cdFx0Ly8gSWYgaXQncyBhIGRpZmYgZWRpdG9yIHdlIHRyaWdnZXIgdGhlIGNyZWF0ZSBkaWZmIGVkaXRvciBpbnB1dFxuXHRcdGlmIChpc1Jlc291cmNlRGlmZkVkaXRvcklucHV0KGVkaXRvcikpIHtcblx0XHRcdGlmICghc2VsZWN0ZWRFZGl0b3IuZWRpdG9yRmFjdG9yeU9iamVjdC5jcmVhdGVEaWZmRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5wdXRXaXRoT3B0aW9ucyA9IGF3YWl0IHNlbGVjdGVkRWRpdG9yLmVkaXRvckZhY3RvcnlPYmplY3QuY3JlYXRlRGlmZkVkaXRvcklucHV0KGVkaXRvciwgZ3JvdXApO1xuXHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBpbnB1dFdpdGhPcHRpb25zLmVkaXRvciwgb3B0aW9uczogaW5wdXRXaXRoT3B0aW9ucy5vcHRpb25zID8/IG9wdGlvbnMgfTtcblx0XHR9XG5cblx0XHQvLyBJZiBpdCdzIGEgZGlmZiBsaXN0IGVkaXRvciB3ZSB0cmlnZ2VyIHRoZSBjcmVhdGUgZGlmZiBsaXN0IGVkaXRvciBpbnB1dFxuXHRcdGlmIChpc1Jlc291cmNlTXVsdGlEaWZmRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0aWYgKCFzZWxlY3RlZEVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZU11bHRpRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlucHV0V2l0aE9wdGlvbnMgPSBhd2FpdCBzZWxlY3RlZEVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZU11bHRpRGlmZkVkaXRvcklucHV0KGVkaXRvciwgZ3JvdXApO1xuXHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBpbnB1dFdpdGhPcHRpb25zLmVkaXRvciwgb3B0aW9uczogaW5wdXRXaXRoT3B0aW9ucy5vcHRpb25zID8/IG9wdGlvbnMgfTtcblx0XHR9XG5cblx0XHRpZiAoaXNSZXNvdXJjZVNpZGVCeVNpZGVFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVudHlwZWQgc2lkZSBieSBzaWRlIGVkaXRvciBpbnB1dCBub3Qgc3VwcG9ydGVkIGhlcmUuYCk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzVW50aXRsZWRSZXNvdXJjZUVkaXRvcklucHV0KGVkaXRvcikpIHtcblx0XHRcdGlmICghc2VsZWN0ZWRFZGl0b3IuZWRpdG9yRmFjdG9yeU9iamVjdC5jcmVhdGVVbnRpdGxlZEVkaXRvcklucHV0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlucHV0V2l0aE9wdGlvbnMgPSBhd2FpdCBzZWxlY3RlZEVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZVVudGl0bGVkRWRpdG9ySW5wdXQoZWRpdG9yLCBncm91cCk7XG5cdFx0XHRyZXR1cm4geyBlZGl0b3I6IGlucHV0V2l0aE9wdGlvbnMuZWRpdG9yLCBvcHRpb25zOiBpbnB1dFdpdGhPcHRpb25zLm9wdGlvbnMgPz8gb3B0aW9ucyB9O1xuXHRcdH1cblxuXHRcdC8vIFNob3VsZCBubyBsb25nZXIgaGF2ZSBhbiB1bmRlZmluZWQgcmVzb3VyY2Ugc28gbGV0cyB0aHJvdyBhbiBlcnJvciBpZiB0aGF0J3Mgc29tZWhvdyB0aGUgY2FzZVxuXHRcdGlmIChyZXNvdXJjZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuZGVmaW5lZCByZXNvdXJjZSBvbiBub24gdW50aXRsZWQgZWRpdG9yIGlucHV0LmApO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBlZGl0b3Igc3RhdGVzIGl0IGNhbiBvbmx5IGJlIG9wZW5lZCBvbmNlIHBlciByZXNvdXJjZSB3ZSBtdXN0IGNsb3NlIGFsbCBleGlzdGluZyBvbmVzIGV4Y2VwdCBvbmUgYW5kIG1vdmUgdGhlIG5ldyBvbmUgaW50byB0aGUgZ3JvdXBcblx0XHRjb25zdCBzaW5nbGVFZGl0b3JQZXJSZXNvdXJjZSA9IHR5cGVvZiBzZWxlY3RlZEVkaXRvci5vcHRpb25zPy5zaW5nbGVQZXJSZXNvdXJjZSA9PT0gJ2Z1bmN0aW9uJyA/IHNlbGVjdGVkRWRpdG9yLm9wdGlvbnMuc2luZ2xlUGVyUmVzb3VyY2UoKSA6IHNlbGVjdGVkRWRpdG9yLm9wdGlvbnM/LnNpbmdsZVBlclJlc291cmNlO1xuXHRcdGlmIChzaW5nbGVFZGl0b3JQZXJSZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdFZGl0b3JzID0gdGhpcy5maW5kRXhpc3RpbmdFZGl0b3JzRm9yUmVzb3VyY2UocmVzb3VyY2UsIHNlbGVjdGVkRWRpdG9yLmVkaXRvckluZm8uaWQpO1xuXHRcdFx0aWYgKGV4aXN0aW5nRWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgdGhpcy5tb3ZlRXhpc3RpbmdFZGl0b3JGb3JSZXNvdXJjZShleGlzdGluZ0VkaXRvcnMsIGdyb3VwKTtcblx0XHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRcdHJldHVybiB7IGVkaXRvciwgb3B0aW9ucyB9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gZmFpbGVkIHRvIG1vdmVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIG5vIGZhY3RvcnkgaXMgYWJvdmUsIHJldHVybiBmbG93IGJhY2sgdG8gY2FsbGVyIGxldHRpbmcgdGhlbSBrbm93IHdlIGNvdWxkIG5vdCByZXNvbHZlIGl0XG5cdFx0aWYgKCFzZWxlY3RlZEVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZUVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVzcGVjdCBvcHRpb25zIHBhc3NlZCBiYWNrXG5cdFx0Y29uc3QgaW5wdXRXaXRoT3B0aW9ucyA9IGF3YWl0IHNlbGVjdGVkRWRpdG9yLmVkaXRvckZhY3RvcnlPYmplY3QuY3JlYXRlRWRpdG9ySW5wdXQoZWRpdG9yLCBncm91cCk7XG5cdFx0b3B0aW9ucyA9IGlucHV0V2l0aE9wdGlvbnMub3B0aW9ucyA/PyBvcHRpb25zO1xuXHRcdGNvbnN0IGlucHV0ID0gaW5wdXRXaXRoT3B0aW9ucy5lZGl0b3I7XG5cblx0XHRyZXR1cm4geyBlZGl0b3I6IGlucHV0LCBvcHRpb25zIH07XG5cdH1cblxuXHQvKipcblx0ICogTW92ZXMgdGhlIGZpcnN0IGV4aXN0aW5nIGVkaXRvciBmb3IgYSByZXNvdXJjZSB0byB0aGUgdGFyZ2V0IGdyb3VwIHVubGVzcyBhbHJlYWR5IG9wZW5lZCB0aGVyZS5cblx0ICogQWRkaXRpb25hbGx5IHdpbGwgY2xvc2UgYW55IG90aGVyIGVkaXRvcnMgdGhhdCBhcmUgb3BlbiBmb3IgdGhhdCByZXNvdXJjZSBhbmQgdmlld3R5cGUgYmVzaWRlcyB0aGUgZmlyc3Qgb25lIGZvdW5kXG5cdCAqIEBwYXJhbSByZXNvdXJjZSBUaGUgcmVzb3VyY2Ugb2YgdGhlIGVkaXRvclxuXHQgKiBAcGFyYW0gdmlld1R5cGUgdGhlIHZpZXd0eXBlIG9mIHRoZSBlZGl0b3Jcblx0ICogQHBhcmFtIHRhcmdldEdyb3VwIFRoZSBncm91cCB0byBtb3ZlIGl0IHRvXG5cdCAqIEByZXR1cm5zIFRoZSBtb3ZlZCBlZGl0b3IgaW5wdXQgb3IgYHVuZGVmaW5lZGAgaWYgdGhlIGVkaXRvciBjb3VsZCBub3QgYmUgbW92ZWRcblx0ICovXG5cdHByaXZhdGUgYXN5bmMgbW92ZUV4aXN0aW5nRWRpdG9yRm9yUmVzb3VyY2UoXG5cdFx0ZXhpc3RpbmdFZGl0b3JzRm9yUmVzb3VyY2U6IEFycmF5PHsgZWRpdG9yOiBFZGl0b3JJbnB1dDsgZ3JvdXA6IElFZGl0b3JHcm91cCB9Pixcblx0XHR0YXJnZXRHcm91cDogSUVkaXRvckdyb3VwLFxuXHQpOiBQcm9taXNlPEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZWRpdG9yVG9Vc2UgPSBleGlzdGluZ0VkaXRvcnNGb3JSZXNvdXJjZVswXTtcblxuXHRcdC8vIFdlIHNob3VsZCBvbmx5IGhhdmUgb25lIGVkaXRvciBidXQgaWYgdGhlcmUgYXJlIG11bHRpcGxlIHdlIGNsb3NlIHRoZSBvdGhlcnNcblx0XHRmb3IgKGNvbnN0IHsgZWRpdG9yLCBncm91cCB9IG9mIGV4aXN0aW5nRWRpdG9yc0ZvclJlc291cmNlKSB7XG5cdFx0XHRpZiAoZWRpdG9yICE9PSBlZGl0b3JUb1VzZS5lZGl0b3IpIHtcblx0XHRcdFx0Y29uc3QgY2xvc2VkID0gYXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3IoZWRpdG9yKTtcblx0XHRcdFx0aWYgKCFjbG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBNb3ZlIHRoZSBlZGl0b3IgYWxyZWFkeSBvcGVuZWQgdG8gdGhlIHRhcmdldCBncm91cFxuXHRcdGlmICh0YXJnZXRHcm91cC5pZCAhPT0gZWRpdG9yVG9Vc2UuZ3JvdXAuaWQpIHtcblx0XHRcdGNvbnN0IG1vdmVkID0gZWRpdG9yVG9Vc2UuZ3JvdXAubW92ZUVkaXRvcihlZGl0b3JUb1VzZS5lZGl0b3IsIHRhcmdldEdyb3VwKTtcblx0XHRcdGlmICghbW92ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3JUb1VzZS5lZGl0b3I7XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gYSByZXNvdXJjZSBhbmQgYW4gZWRpdG9ySWQsIHJldHVybnMgYWxsIGVkaXRvcnMgb3BlbiBmb3IgdGhhdCByZXNvdXJjZSBhbmQgZWRpdG9ySWQuXG5cdCAqIEBwYXJhbSByZXNvdXJjZSBUaGUgcmVzb3VyY2Ugc3BlY2lmaWVkXG5cdCAqIEBwYXJhbSBlZGl0b3JJZCBUaGUgZWRpdG9ySURcblx0ICogQHJldHVybnMgQSBsaXN0IG9mIGVkaXRvcnNcblx0ICovXG5cdHByaXZhdGUgZmluZEV4aXN0aW5nRWRpdG9yc0ZvclJlc291cmNlKFxuXHRcdHJlc291cmNlOiBVUkksXG5cdFx0ZWRpdG9ySWQ6IHN0cmluZyxcblx0KTogQXJyYXk8eyBlZGl0b3I6IEVkaXRvcklucHV0OyBncm91cDogSUVkaXRvckdyb3VwIH0+IHtcblx0XHRjb25zdCBvdXQ6IEFycmF5PHsgZWRpdG9yOiBFZGl0b3JJbnB1dDsgZ3JvdXA6IElFZGl0b3JHcm91cCB9PiA9IFtdO1xuXHRcdGNvbnN0IG9yZGVyZWRHcm91cHMgPSBkaXN0aW5jdChbXG5cdFx0XHQuLi50aGlzLmVkaXRvckdyb3VwU2VydmljZS5ncm91cHMsXG5cdFx0XSk7XG5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIG9yZGVyZWRHcm91cHMpIHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGdyb3VwLmVkaXRvcnMpIHtcblx0XHRcdFx0aWYgKGlzRXF1YWwoZWRpdG9yLnJlc291cmNlLCByZXNvdXJjZSkgJiYgZWRpdG9yLmVkaXRvcklkID09PSBlZGl0b3JJZCkge1xuXHRcdFx0XHRcdG91dC5wdXNoKHsgZWRpdG9yLCBncm91cCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb3V0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0hhbmRsZUNvbmZsaWN0aW5nRGVmYXVsdHMocmVzb3VyY2U6IFVSSSwgZWRpdG9yTmFtZTogc3RyaW5nLCB1bnR5cGVkSW5wdXQ6IElVbnR5cGVkRWRpdG9ySW5wdXQsIGN1cnJlbnRFZGl0b3I6IEVkaXRvcklucHV0LCBncm91cDogSUVkaXRvckdyb3VwKSB7XG5cdFx0dHlwZSBTdG9yZWRDaG9pY2UgPSB7XG5cdFx0XHRba2V5OiBzdHJpbmddOiBzdHJpbmdbXTtcblx0XHR9O1xuXHRcdGNvbnN0IGFzc29jaWF0aW9uVHlwZSA9IGlzUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQodW50eXBlZElucHV0KSA/IEVkaXRvckFzc29jaWF0aW9uVHlwZS5EaWZmRWRpdG9yIDogaXNSZXNvdXJjZU1lcmdlRWRpdG9ySW5wdXQodW50eXBlZElucHV0KSA/IEVkaXRvckFzc29jaWF0aW9uVHlwZS5NZXJnZUVkaXRvciA6IEVkaXRvckFzc29jaWF0aW9uVHlwZS5FZGl0b3I7XG5cdFx0Y29uc3QgZWRpdG9ycyA9IHRoaXMuZmluZE1hdGNoaW5nRWRpdG9ycyhyZXNvdXJjZSwgYXNzb2NpYXRpb25UeXBlKTtcblx0XHRjb25zdCBzdG9yZWRDaG9pY2VzOiBTdG9yZWRDaG9pY2UgPSBKU09OLnBhcnNlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEVkaXRvclJlc29sdmVyU2VydmljZS5jb25mbGljdGluZ0RlZmF1bHRzU3RvcmFnZUlELCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ3t9JykpO1xuXHRcdGNvbnN0IGdsb2JGb3JSZXNvdXJjZSA9IGAqJHtleHRuYW1lKHJlc291cmNlKX1gO1xuXHRcdC8vIFdyaXRlcyB0byB0aGUgc3RvcmFnZSBzZXJ2aWNlIHRoYXQgYSBjaG9pY2UgaGFzIGJlZW4gbWFkZSBmb3IgdGhlIGN1cnJlbnRseSBpbnN0YWxsZWQgZWRpdG9yc1xuXHRcdGNvbnN0IHdyaXRlQ3VycmVudEVkaXRvcnNUb1N0b3JhZ2UgPSAoKSA9PiB7XG5cdFx0XHRzdG9yZWRDaG9pY2VzW2dsb2JGb3JSZXNvdXJjZV0gPSBbXTtcblx0XHRcdGVkaXRvcnMuZm9yRWFjaChlZGl0b3IgPT4gc3RvcmVkQ2hvaWNlc1tnbG9iRm9yUmVzb3VyY2VdLnB1c2goZWRpdG9yLmVkaXRvckluZm8uaWQpKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmNvbmZsaWN0aW5nRGVmYXVsdHNTdG9yYWdlSUQsIEpTT04uc3RyaW5naWZ5KHN0b3JlZENob2ljZXMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9O1xuXG5cdFx0Ly8gSWYgdGhlIHVzZXIgaGFzIGFscmVhZHkgbWFkZSBhIGNob2ljZSBmb3IgdGhpcyBlZGl0b3Igd2UgZG9uJ3Qgd2FudCB0byBhc2sgdGhlbSBhZ2FpblxuXHRcdGlmIChzdG9yZWRDaG9pY2VzW2dsb2JGb3JSZXNvdXJjZV0/LmZpbmQoZWRpdG9ySUQgPT4gZWRpdG9ySUQgPT09IGN1cnJlbnRFZGl0b3IuZWRpdG9ySWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0bG9jYWxpemUoJ2VkaXRvclJlc29sdmVyLmNvbmZsaWN0aW5nRGVmYXVsdHMnLCAnVGhlcmUgYXJlIG11bHRpcGxlIGRlZmF1bHQgZWRpdG9ycyBhdmFpbGFibGUgZm9yIHRoZSByZXNvdXJjZS4nKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZWRpdG9yUmVzb2x2ZXIuY29uZmlndXJlRGVmYXVsdCcsICdDb25maWd1cmUgRGVmYXVsdCcpLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHQvLyBTaG93IHRoZSBwaWNrZXIgYW5kIHRlbGwgaXQgdG8gdXBkYXRlIHRoZSBzZXR0aW5nIHRvIHdoYXRldmVyIHRoZSB1c2VyIHNlbGVjdGVkXG5cdFx0XHRcdFx0Y29uc3QgcGlja2VkID0gYXdhaXQgdGhpcy5kb1BpY2tFZGl0b3IodW50eXBlZElucHV0LCB0cnVlKTtcblx0XHRcdFx0XHRpZiAoIXBpY2tlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR1bnR5cGVkSW5wdXQub3B0aW9ucyA9IHBpY2tlZDtcblx0XHRcdFx0XHRjb25zdCByZXBsYWNlbWVudEVkaXRvciA9IGF3YWl0IHRoaXMucmVzb2x2ZUVkaXRvcih1bnR5cGVkSW5wdXQsIGdyb3VwKTtcblx0XHRcdFx0XHRpZiAocmVwbGFjZW1lbnRFZGl0b3IgPT09IFJlc29sdmVkU3RhdHVzLkFCT1JUIHx8IHJlcGxhY2VtZW50RWRpdG9yID09PSBSZXNvbHZlZFN0YXR1cy5OT05FKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIFJlcGxhY2UgdGhlIGN1cnJlbnQgZWRpdG9yIHdpdGggdGhlIHBpY2tlZCBvbmVcblx0XHRcdFx0XHRncm91cC5yZXBsYWNlRWRpdG9ycyhbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGVkaXRvcjogY3VycmVudEVkaXRvcixcblx0XHRcdFx0XHRcdFx0cmVwbGFjZW1lbnQ6IHJlcGxhY2VtZW50RWRpdG9yLmVkaXRvcixcblx0XHRcdFx0XHRcdFx0b3B0aW9uczogcmVwbGFjZW1lbnRFZGl0b3Iub3B0aW9ucyA/PyBwaWNrZWQsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZWRpdG9yUmVzb2x2ZXIua2VlcERlZmF1bHQnLCAnS2VlcCB7MH0nLCBlZGl0b3JOYW1lKSxcblx0XHRcdFx0cnVuOiB3cml0ZUN1cnJlbnRFZGl0b3JzVG9TdG9yYWdlXG5cdFx0XHR9XG5cdFx0XHRdKTtcblx0XHQvLyBJZiB0aGUgdXNlciBwcmVzc2VkIFggd2UgYXNzdW1lIHRoZXkgd2FudCB0byBrZWVwIHRoZSBjdXJyZW50IGVkaXRvciBhcyBkZWZhdWx0XG5cdFx0Y29uc3Qgb25DbG9zZUxpc3RlbmVyID0gaGFuZGxlLm9uRGlkQ2xvc2UoKCkgPT4ge1xuXHRcdFx0d3JpdGVDdXJyZW50RWRpdG9yc1RvU3RvcmFnZSgpO1xuXHRcdFx0b25DbG9zZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgbWFwRWRpdG9yc1RvUXVpY2tQaWNrRW50cnkocmVzb3VyY2U6IFVSSSwgc2hvd0RlZmF1bHRQaWNrZXI6IGJvb2xlYW4gfCB1bmRlZmluZWQsIGFzc29jaWF0aW9uVHlwZTogRWRpdG9yQXNzb2NpYXRpb25UeXBlKSB7XG5cdFx0Y29uc3QgY3VycmVudEVkaXRvciA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLmZpbmRFZGl0b3JzKHJlc291cmNlKS5hdCgwKTtcblx0XHQvLyBJZiB1bnRpdGxlZCwgd2Ugd2FudCBhbGwgcmVnaXN0ZXJlZCBlZGl0b3JzXG5cdFx0bGV0IHJlZ2lzdGVyZWRFZGl0b3JzID0gcmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkID8gdGhpcy5fcmVnaXN0ZXJlZEVkaXRvcnMuZmlsdGVyKGUgPT4gZS5lZGl0b3JJbmZvLnByaW9yaXR5LmVkaXRvciAhPT0gUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4Y2x1c2l2ZSkgOiB0aGlzLmZpbmRNYXRjaGluZ0VkaXRvcnMocmVzb3VyY2UsIGFzc29jaWF0aW9uVHlwZSk7XG5cdFx0aWYgKGFzc29jaWF0aW9uVHlwZSA9PT0gRWRpdG9yQXNzb2NpYXRpb25UeXBlLkRpZmZFZGl0b3IpIHtcblx0XHRcdHJlZ2lzdGVyZWRFZGl0b3JzID0gcmVnaXN0ZXJlZEVkaXRvcnMuZmlsdGVyKGVkaXRvciA9PiAhIWVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZURpZmZFZGl0b3JJbnB1dCk7XG5cdFx0fVxuXHRcdC8vIFdlIGRvbid0IHdhbnQgZHVwbGljYXRlIElkIGVudHJpZXNcblx0XHRyZWdpc3RlcmVkRWRpdG9ycyA9IGRpc3RpbmN0KHJlZ2lzdGVyZWRFZGl0b3JzLCBjID0+IGMuZWRpdG9ySW5mby5pZCk7XG5cdFx0Y29uc3QgZGVmYXVsdFNldHRpbmcgPSB0aGlzLmdldEFzc29jaWF0aW9uc0ZvclJlc291cmNlQnlUeXBlKHJlc291cmNlLCBhc3NvY2lhdGlvblR5cGUpWzBdPy52aWV3VHlwZTtcblx0XHQvLyBOb3QgdGhlIG1vc3QgZWZmaWNpZW50IHdheSB0byBkbyB0aGlzLCBidXQgd2Ugd2FudCB0byBlbnN1cmUgdGhlIHRleHQgZWRpdG9yIGlzIGF0IHRoZSB0b3Agb2YgdGhlIHF1aWNrcGlja1xuXHRcdHJlZ2lzdGVyZWRFZGl0b3JzID0gcmVnaXN0ZXJlZEVkaXRvcnMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0aWYgKGEuZWRpdG9ySW5mby5pZCA9PT0gREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQpIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fSBlbHNlIGlmIChiLmVkaXRvckluZm8uaWQgPT09IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLmlkKSB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHByaW9yaXR5VG9SYW5rKHRoaXMuZ2V0RWZmZWN0aXZlUHJpb3JpdHkoYi5lZGl0b3JJbmZvLCBhc3NvY2lhdGlvblR5cGUpKSAtIHByaW9yaXR5VG9SYW5rKHRoaXMuZ2V0RWZmZWN0aXZlUHJpb3JpdHkoYS5lZGl0b3JJbmZvLCBhc3NvY2lhdGlvblR5cGUpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBxdWlja1BpY2tFbnRyaWVzOiBBcnJheTxRdWlja1BpY2tJdGVtPiA9IFtdO1xuXHRcdGNvbnN0IGN1cnJlbnRseUFjdGl2ZUxhYmVsID0gbG9jYWxpemUoJ3Byb21wdE9wZW5XaXRoLmN1cnJlbnRseUFjdGl2ZScsIFwiQWN0aXZlXCIpO1xuXHRcdGNvbnN0IGN1cnJlbnREZWZhdWx0TGFiZWwgPSBsb2NhbGl6ZSgncHJvbXB0T3BlbldpdGguY3VycmVudERlZmF1bHQnLCBcIkRlZmF1bHRcIik7XG5cdFx0Y29uc3QgY3VycmVudERlZmF1bHRBbmRBY3RpdmVMYWJlbCA9IGxvY2FsaXplKCdwcm9tcHRPcGVuV2l0aC5jdXJyZW50RGVmYXVsdEFuZEFjdGl2ZScsIFwiQWN0aXZlIGFuZCBEZWZhdWx0XCIpO1xuXHRcdC8vIERlZmF1bHQgb3JkZXIgPSBzZXR0aW5nIC0+IGhpZ2hlc3QgcHJpb3JpdHkgLT4gdGV4dFxuXHRcdGxldCBkZWZhdWx0Vmlld1R5cGUgPSBkZWZhdWx0U2V0dGluZztcblx0XHRpZiAoIWRlZmF1bHRWaWV3VHlwZSAmJiByZWdpc3RlcmVkRWRpdG9ycy5sZW5ndGggPiAyICYmIHRoaXMuZ2V0RWZmZWN0aXZlUHJpb3JpdHkocmVnaXN0ZXJlZEVkaXRvcnNbMV0uZWRpdG9ySW5mbywgYXNzb2NpYXRpb25UeXBlKSAhPT0gUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5Lm9wdGlvbikge1xuXHRcdFx0ZGVmYXVsdFZpZXdUeXBlID0gcmVnaXN0ZXJlZEVkaXRvcnNbMV0/LmVkaXRvckluZm8uaWQ7XG5cdFx0fVxuXHRcdGlmICghZGVmYXVsdFZpZXdUeXBlKSB7XG5cdFx0XHRkZWZhdWx0Vmlld1R5cGUgPSBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZDtcblx0XHR9XG5cdFx0Ly8gTWFwIHRoZSBlZGl0b3JzIHRvIHF1aWNrcGljayBlbnRyaWVzXG5cdFx0cmVnaXN0ZXJlZEVkaXRvcnMuZm9yRWFjaChlZGl0b3IgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudFZpZXdUeXBlID0gY3VycmVudEVkaXRvcj8uZWRpdG9ySWQgPz8gREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQ7XG5cdFx0XHRjb25zdCBpc0FjdGl2ZSA9IGN1cnJlbnRFZGl0b3IgPyBlZGl0b3IuZWRpdG9ySW5mby5pZCA9PT0gY3VycmVudFZpZXdUeXBlIDogZmFsc2U7XG5cdFx0XHRjb25zdCBpc0RlZmF1bHQgPSBlZGl0b3IuZWRpdG9ySW5mby5pZCA9PT0gZGVmYXVsdFZpZXdUeXBlO1xuXHRcdFx0Y29uc3QgcXVpY2tQaWNrRW50cnk6IElRdWlja1BpY2tJdGVtID0ge1xuXHRcdFx0XHRpZDogZWRpdG9yLmVkaXRvckluZm8uaWQsXG5cdFx0XHRcdGxhYmVsOiBlZGl0b3IuZWRpdG9ySW5mby5sYWJlbCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGlzQWN0aXZlICYmIGlzRGVmYXVsdCA/IGN1cnJlbnREZWZhdWx0QW5kQWN0aXZlTGFiZWwgOiBpc0FjdGl2ZSA/IGN1cnJlbnRseUFjdGl2ZUxhYmVsIDogaXNEZWZhdWx0ID8gY3VycmVudERlZmF1bHRMYWJlbCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZGV0YWlsOiBlZGl0b3IuZWRpdG9ySW5mby5kZXRhaWwgPz8gZWRpdG9yLmVkaXRvckluZm8ucHJpb3JpdHkuZWRpdG9yLFxuXHRcdFx0fTtcblx0XHRcdHF1aWNrUGlja0VudHJpZXMucHVzaChxdWlja1BpY2tFbnRyeSk7XG5cdFx0fSk7XG5cdFx0aWYgKCFzaG93RGVmYXVsdFBpY2tlciAmJiBleHRuYW1lKHJlc291cmNlKSAhPT0gJycpIHtcblx0XHRcdGNvbnN0IHNlcGFyYXRvcjogSVF1aWNrUGlja1NlcGFyYXRvciA9IHsgdHlwZTogJ3NlcGFyYXRvcicgfTtcblx0XHRcdHF1aWNrUGlja0VudHJpZXMucHVzaChzZXBhcmF0b3IpO1xuXHRcdFx0Y29uc3QgY29uZmlndXJlRGVmYXVsdEVudHJ5ID0ge1xuXHRcdFx0XHRpZDogRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmNvbmZpZ3VyZURlZmF1bHRJRCxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwcm9tcHRPcGVuV2l0aC5jb25maWd1cmVEZWZhdWx0JywgXCJDb25maWd1cmUgZGVmYXVsdCBlZGl0b3IgZm9yICd7MH0nLi4uXCIsIGAqJHtleHRuYW1lKHJlc291cmNlKX1gKSxcblx0XHRcdH07XG5cdFx0XHRxdWlja1BpY2tFbnRyaWVzLnB1c2goY29uZmlndXJlRGVmYXVsdEVudHJ5KTtcblx0XHRcdC8vIEZvciBkaWZmcywgYWRkaXRpb25hbGx5IG9mZmVyIHRvIGNvbmZpZ3VyZSBhIGRpZmYtb25seSBkZWZhdWx0IHNvIHRoZSBjaG9pY2UgZG9lcyBub3Rcblx0XHRcdC8vIGFmZmVjdCBob3cgdGhlIHJlc291cmNlIG9wZW5zIGFzIGEgbm9ybWFsIGVkaXRvciAod3JpdGVzIHRvIGBkaWZmRWRpdG9yQXNzb2NpYXRpb25zYCkuXG5cdFx0XHRpZiAoYXNzb2NpYXRpb25UeXBlID09PSBFZGl0b3JBc3NvY2lhdGlvblR5cGUuRGlmZkVkaXRvcikge1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmVEZWZhdWx0RGlmZkVudHJ5ID0ge1xuXHRcdFx0XHRcdGlkOiBFZGl0b3JSZXNvbHZlclNlcnZpY2UuY29uZmlndXJlRGVmYXVsdERpZmZJRCxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Byb21wdE9wZW5XaXRoLmNvbmZpZ3VyZURlZmF1bHREaWZmJywgXCJDb25maWd1cmUgZGVmYXVsdCBlZGl0b3IgKGRpZmYgb25seSkgZm9yICd7MH0nLi4uXCIsIGAqJHtleHRuYW1lKHJlc291cmNlKX1gKSxcblx0XHRcdFx0fTtcblx0XHRcdFx0cXVpY2tQaWNrRW50cmllcy5wdXNoKGNvbmZpZ3VyZURlZmF1bHREaWZmRW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcXVpY2tQaWNrRW50cmllcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9QaWNrRWRpdG9yKGVkaXRvcjogSVVudHlwZWRFZGl0b3JJbnB1dCwgc2hvd0RlZmF1bHRQaWNrZXI/OiBib29sZWFuLCB1cGRhdGVBc3NvY2lhdGlvblR5cGU/OiBFZGl0b3JBc3NvY2lhdGlvblR5cGUpOiBQcm9taXNlPElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkPiB7XG5cblx0XHR0eXBlIEVkaXRvclBpY2sgPSB7XG5cdFx0XHRyZWFkb25seSBpdGVtOiBJUXVpY2tQaWNrSXRlbTtcblx0XHRcdHJlYWRvbmx5IGtleU1vZHM/OiBJS2V5TW9kcztcblx0XHRcdHJlYWRvbmx5IG9wZW5JbkJhY2tncm91bmQ6IGJvb2xlYW47XG5cdFx0fTtcblxuXHRcdGxldCByZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cblx0XHRpZiAocmVzb3VyY2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy51bnRpdGxlZCB9KTtcblx0XHR9XG5cdFx0Y29uc3QgYXNzb2NpYXRpb25UeXBlID0gaXNSZXNvdXJjZURpZmZFZGl0b3JJbnB1dChlZGl0b3IpID8gRWRpdG9yQXNzb2NpYXRpb25UeXBlLkRpZmZFZGl0b3IgOiBFZGl0b3JBc3NvY2lhdGlvblR5cGUuRWRpdG9yO1xuXHRcdC8vIFdoaWNoIHNldHRpbmcgdGhlIGRlZmF1bHQgcGlja2VyIHNob3VsZCB3cml0ZSB0by4gRGVmYXVsdHMgdG8gdGhlIHJlc291cmNlJ3MgYXNzb2NpYXRpb24gdHlwZVxuXHRcdC8vIHNvIHRoYXQgdGhlIHBlci1pdGVtIGdlYXIgYnV0dG9uIGtlZXBzIHdyaXRpbmcgdG8gdGhlIG1hdGNoaW5nIHNldHRpbmcsIGJ1dCB0aGUgXCJDb25maWd1cmVcblx0XHQvLyBkZWZhdWx0IGVkaXRvclwiIGVudHJpZXMgY2FuIHRhcmdldCBhIHNwZWNpZmljIHNldHRpbmcgKGdlbmVyYWwgdnMuIGRpZmYtb25seSkuXG5cdFx0Y29uc3QgdXBkYXRlU2V0dGluZ1R5cGUgPSB1cGRhdGVBc3NvY2lhdGlvblR5cGUgPz8gYXNzb2NpYXRpb25UeXBlO1xuXG5cdFx0Ly8gUGVyc2lzdHMgdGhlIHBpY2tlZCBlZGl0b3IgYXMgdGhlIGRlZmF1bHQgZm9yIHRoaXMgcmVzb3VyY2UncyBnbG9iLiBXaGVuIHRoZSB1c2VyIGNvbmZpZ3VyZXNcblx0XHQvLyB0aGUgZ2VuZXJhbCBkZWZhdWx0IGZyb20gYSBkaWZmIGNvbnRleHQsIGFueSBkaWZmLW9ubHkgb3ZlcnJpZGUgZm9yIHRoZSBzYW1lIGdsb2IgaXMgY2xlYXJlZFxuXHRcdC8vIHNvIHRoYXQgdGhlIGdlbmVyYWwgZGVmYXVsdCBhbHNvIHRha2VzIGVmZmVjdCBmb3IgZGlmZnMuXG5cdFx0Y29uc3QgcGVyc2lzdERlZmF1bHRBc3NvY2lhdGlvbiA9IChlZGl0b3JJRDogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCBnbG9iUGF0dGVybiA9IGAqJHtleHRuYW1lKHJlc291cmNlKX1gO1xuXHRcdFx0dGhpcy51cGRhdGVVc2VyQXNzb2NpYXRpb25zRm9yVHlwZSh1cGRhdGVTZXR0aW5nVHlwZSwgZ2xvYlBhdHRlcm4sIGVkaXRvcklEKTtcblx0XHRcdGlmICh1cGRhdGVTZXR0aW5nVHlwZSA9PT0gRWRpdG9yQXNzb2NpYXRpb25UeXBlLkVkaXRvciAmJiBhc3NvY2lhdGlvblR5cGUgPT09IEVkaXRvckFzc29jaWF0aW9uVHlwZS5EaWZmRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlVXNlckFzc29jaWF0aW9uRm9yU2V0dGluZyhkaWZmRWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZCwgZ2xvYlBhdHRlcm4pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBHZXQgYWxsIHRoZSBlZGl0b3JzIGZvciB0aGUgcmVzb3VyY2UgYXMgcXVpY2twaWNrIGVudHJpZXNcblx0XHRjb25zdCBlZGl0b3JQaWNrcyA9IHRoaXMubWFwRWRpdG9yc1RvUXVpY2tQaWNrRW50cnkocmVzb3VyY2UsIHNob3dEZWZhdWx0UGlja2VyLCBhc3NvY2lhdGlvblR5cGUpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBlZGl0b3IgcGlja2VyXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWRpdG9yUGlja2VyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHBsYWNlSG9sZGVyTWVzc2FnZSA9IHNob3dEZWZhdWx0UGlja2VyID9cblx0XHRcdCh1cGRhdGVTZXR0aW5nVHlwZSA9PT0gRWRpdG9yQXNzb2NpYXRpb25UeXBlLkRpZmZFZGl0b3IgP1xuXHRcdFx0XHRsb2NhbGl6ZSgncHJvbXB0T3BlbldpdGgudXBkYXRlRGVmYXVsdERpZmZQbGFjZUhvbGRlcicsIFwiU2VsZWN0IG5ldyBkZWZhdWx0IGVkaXRvciAoZGlmZiBvbmx5KSBmb3IgJ3swfSdcIiwgYCoke2V4dG5hbWUocmVzb3VyY2UpfWApIDpcblx0XHRcdFx0bG9jYWxpemUoJ3Byb21wdE9wZW5XaXRoLnVwZGF0ZURlZmF1bHRQbGFjZUhvbGRlcicsIFwiU2VsZWN0IG5ldyBkZWZhdWx0IGVkaXRvciBmb3IgJ3swfSdcIiwgYCoke2V4dG5hbWUocmVzb3VyY2UpfWApKSA6XG5cdFx0XHRsb2NhbGl6ZSgncHJvbXB0T3BlbldpdGgucGxhY2VIb2xkZXInLCBcIlNlbGVjdCBlZGl0b3IgZm9yICd7MH0nXCIsIGJhc2VuYW1lKHJlc291cmNlKSk7XG5cdFx0ZWRpdG9yUGlja2VyLnBsYWNlaG9sZGVyID0gcGxhY2VIb2xkZXJNZXNzYWdlO1xuXHRcdGVkaXRvclBpY2tlci5jYW5BY2NlcHRJbkJhY2tncm91bmQgPSB0cnVlO1xuXHRcdGVkaXRvclBpY2tlci5pdGVtcyA9IGVkaXRvclBpY2tzO1xuXHRcdGNvbnN0IGZpcnN0SXRlbSA9IGVkaXRvclBpY2tlci5pdGVtcy5maW5kKGl0ZW0gPT4gaXRlbS50eXBlID09PSAnaXRlbScpIGFzIElRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChmaXJzdEl0ZW0pIHtcblx0XHRcdGVkaXRvclBpY2tlci5zZWxlY3RlZEl0ZW1zID0gW2ZpcnN0SXRlbV07XG5cdFx0fVxuXG5cdFx0Ly8gUHJvbXB0IHRoZSB1c2VyIHRvIHNlbGVjdCBhbiBlZGl0b3Jcblx0XHRjb25zdCBwaWNrZWQ6IEVkaXRvclBpY2sgfCB1bmRlZmluZWQgPSBhd2FpdCBuZXcgUHJvbWlzZTxFZGl0b3JQaWNrIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JQaWNrZXIub25EaWRBY2NlcHQoZSA9PiB7XG5cdFx0XHRcdGxldCByZXN1bHQ6IEVkaXRvclBpY2sgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0aWYgKGVkaXRvclBpY2tlci5zZWxlY3RlZEl0ZW1zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdHJlc3VsdCA9IHtcblx0XHRcdFx0XHRcdGl0ZW06IGVkaXRvclBpY2tlci5zZWxlY3RlZEl0ZW1zWzBdLFxuXHRcdFx0XHRcdFx0a2V5TW9kczogZWRpdG9yUGlja2VyLmtleU1vZHMsXG5cdFx0XHRcdFx0XHRvcGVuSW5CYWNrZ3JvdW5kOiBlLmluQmFja2dyb3VuZFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJZiBhc2tlZCB0byBhbHdheXMgdXBkYXRlIHRoZSBzZXR0aW5nIHRoZW4gdXBkYXRlIGl0IGV2ZW4gaWYgdGhlIGdlYXIgaXNuJ3QgY2xpY2tlZFxuXHRcdFx0XHRpZiAocmVzb3VyY2UgJiYgc2hvd0RlZmF1bHRQaWNrZXIgJiYgcmVzdWx0Py5pdGVtLmlkKSB7XG5cdFx0XHRcdFx0cGVyc2lzdERlZmF1bHRBc3NvY2lhdGlvbihyZXN1bHQuaXRlbS5pZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JQaWNrZXIub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JQaWNrZXIub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihlID0+IHtcblxuXHRcdFx0XHQvLyBUcmlnZ2VyIG9wZW5pbmcgYW5kIGNsb3NlIHBpY2tlclxuXHRcdFx0XHRyZXNvbHZlKHsgaXRlbTogZS5pdGVtLCBvcGVuSW5CYWNrZ3JvdW5kOiBmYWxzZSB9KTtcblxuXHRcdFx0XHQvLyBQZXJzaXN0IHNldHRpbmdcblx0XHRcdFx0aWYgKHJlc291cmNlICYmIGUuaXRlbT8uaWQpIHtcblx0XHRcdFx0XHRwZXJzaXN0RGVmYXVsdEFzc29jaWF0aW9uKGUuaXRlbS5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0ZWRpdG9yUGlja2VyLnNob3coKTtcblx0XHR9KTtcblxuXHRcdC8vIENsb3NlIHBpY2tlclxuXHRcdGVkaXRvclBpY2tlci5kaXNwb3NlKCk7XG5cblx0XHQvLyBJZiB0aGUgdXNlciBwaWNrZWQgYW4gZWRpdG9yLCBsb29rIGF0IGhvdyB0aGUgcGlja2VyIHdhc1xuXHRcdC8vIHVzZWQgKGUuZy4gbW9kaWZpZXIga2V5cywgb3BlbiBpbiBiYWNrZ3JvdW5kKSBhbmQgY3JlYXRlIHRoZVxuXHRcdC8vIG9wdGlvbnMgYW5kIGdyb3VwIHRvIHVzZSBhY2NvcmRpbmdseVxuXHRcdGlmIChwaWNrZWQpIHtcblxuXHRcdFx0Ly8gSWYgdGhlIHVzZXIgc2VsZWN0ZWQgdG8gY29uZmlndXJlIGRlZmF1bHQgd2UgdHJpZ2dlciB0aGlzIHBpY2tlciBhZ2FpbiBhbmQgdGVsbCBpdCB0byBzaG93IHRoZSBkZWZhdWx0IHBpY2tlclxuXHRcdFx0aWYgKHBpY2tlZC5pdGVtLmlkID09PSBFZGl0b3JSZXNvbHZlclNlcnZpY2UuY29uZmlndXJlRGVmYXVsdElEKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmRvUGlja0VkaXRvcihlZGl0b3IsIHRydWUsIEVkaXRvckFzc29jaWF0aW9uVHlwZS5FZGl0b3IpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVGhlIGRpZmYtb25seSB2YXJpYW50IHdyaXRlcyB0byBgZGlmZkVkaXRvckFzc29jaWF0aW9uc2Agc28gaXQgZG9lcyBub3QgY2hhbmdlIGhvdyB0aGVcblx0XHRcdC8vIHJlc291cmNlIG9wZW5zIGFzIGEgbm9ybWFsIGVkaXRvci5cblx0XHRcdGlmIChwaWNrZWQuaXRlbS5pZCA9PT0gRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmNvbmZpZ3VyZURlZmF1bHREaWZmSUQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZG9QaWNrRWRpdG9yKGVkaXRvciwgdHJ1ZSwgRWRpdG9yQXNzb2NpYXRpb25UeXBlLkRpZmZFZGl0b3IpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaWd1cmUgb3V0IG9wdGlvbnNcblx0XHRcdGNvbnN0IHRhcmdldE9wdGlvbnM6IElFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0XHQuLi5lZGl0b3Iub3B0aW9ucyxcblx0XHRcdFx0b3ZlcnJpZGU6IHBpY2tlZC5pdGVtLmlkLFxuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBwaWNrZWQub3BlbkluQmFja2dyb3VuZCB8fCBlZGl0b3Iub3B0aW9ucz8ucHJlc2VydmVGb2N1cyxcblx0XHRcdH07XG5cblx0XHRcdHJldHVybiB0YXJnZXRPcHRpb25zO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGNhY2hlRWRpdG9ycygpIHtcblx0XHQvLyBDcmVhdGUgYSBzZXQgdG8gc3RvcmUgZ2xvYiBwYXR0ZXJuc1xuXHRcdGNvbnN0IGNhY2hlU3RvcmFnZTogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdC8vIFN0b3JlIGp1c3QgdGhlIHJlbGF0aXZlIHBhdHRlcm4gcGllY2VzIHdpdGhvdXQgYW55IHBhdGggaW5mb1xuXHRcdGZvciAoY29uc3QgW2dsb2JQYXR0ZXJuLCBjb250cmliUG9pbnRdIG9mIHRoaXMuX2ZsYXR0ZW5lZEVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IG5vbk9wdGlvbmFsID0gISFjb250cmliUG9pbnQuZmluZChjID0+IGMuZWRpdG9ySW5mby5wcmlvcml0eS5lZGl0b3IgIT09IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb24gJiYgYy5lZGl0b3JJbmZvLmlkICE9PSBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCk7XG5cdFx0XHQvLyBEb24ndCBrZWVwIGEgY2FjaGUgb2YgdGhlIG9wdGlvbmFsIG9uZXMgYXMgdGhvc2Ugd291bGRuJ3QgYmUgb3BlbmVkIG9uIHN0YXJ0IGFueXdheXNcblx0XHRcdGlmICghbm9uT3B0aW9uYWwpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZ2xvYi5pc1JlbGF0aXZlUGF0dGVybihnbG9iUGF0dGVybikpIHtcblx0XHRcdFx0Y2FjaGVTdG9yYWdlLmFkZChgJHtnbG9iUGF0dGVybi5wYXR0ZXJufWApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y2FjaGVTdG9yYWdlLmFkZChnbG9iUGF0dGVybik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWxzbyBzdG9yZSB0aGUgdXNlcnMgc2V0dGluZ3MgYXMgdGhvc2Ugd291bGQgaGF2ZSB0byBhY3RpdmF0ZSBvbiBzdGFydHVwIGFzIHdlbGxcblx0XHRjb25zdCB1c2VyQXNzb2NpYXRpb25zID0gW1xuXHRcdFx0Li4udGhpcy5nZXRBbGxVc2VyQXNzb2NpYXRpb25zKCksXG5cdFx0XHQuLi50aGlzLmdldEFsbFVzZXJBc3NvY2lhdGlvbnNGb3JTZXR0aW5nKGRpZmZFZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkKVxuXHRcdF07XG5cdFx0Zm9yIChjb25zdCBhc3NvY2lhdGlvbiBvZiB1c2VyQXNzb2NpYXRpb25zKSB7XG5cdFx0XHRpZiAoYXNzb2NpYXRpb24uZmlsZW5hbWVQYXR0ZXJuKSB7XG5cdFx0XHRcdGNhY2hlU3RvcmFnZS5hZGQoYXNzb2NpYXRpb24uZmlsZW5hbWVQYXR0ZXJuKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShFZGl0b3JSZXNvbHZlclNlcnZpY2UuY2FjaGVTdG9yYWdlSUQsIEpTT04uc3RyaW5naWZ5KEFycmF5LmZyb20oY2FjaGVTdG9yYWdlKSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiBhIHJlc291cmNlIG1hdGNoZXMgYW55IHVzZXItY29uZmlndXJlZCBlZGl0b3IgYXNzb2NpYXRpb24gdGhhdFxuXHQgKiBwb2ludHMgdG8gYSBub24tZGVmYXVsdCBlZGl0b3IuIFRoaXMgZW5zdXJlcyB0aGF0IG9uIGZpcnN0IHN0YXJ0dXAgKHdoZW5cblx0ICogdGhlIGNhY2hlIGlzIGVtcHR5KSwgd2Ugc3RpbGwgd2FpdCBmb3IgZXh0ZW5zaW9ucyB0byByZWdpc3RlciBiZWZvcmVcblx0ICogcmVzb2x2aW5nIHRoZSBlZGl0b3IsIHNvIHRoYXQgdXNlci1jb25maWd1cmVkIGN1c3RvbSBlZGl0b3JzIGFyZSBhdmFpbGFibGUuXG5cdCAqL1xuXHRwcml2YXRlIHJlc291cmNlTWF0Y2hlc1VzZXJBc3NvY2lhdGlvbihyZXNvdXJjZTogVVJJLCBhc3NvY2lhdGlvblR5cGU6IEVkaXRvckFzc29jaWF0aW9uVHlwZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHVzZXJBc3NvY2lhdGlvbnMgPSB0aGlzLmdldFJhd0Fzc29jaWF0aW9uc0ZvclJlc291cmNlQnlUeXBlKHJlc291cmNlLCBhc3NvY2lhdGlvblR5cGUpO1xuXHRcdGZvciAoY29uc3QgYXNzb2NpYXRpb24gb2YgdXNlckFzc29jaWF0aW9ucykge1xuXHRcdFx0aWYgKGFzc29jaWF0aW9uLnZpZXdUeXBlICE9PSBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvdXJjZU1hdGNoZXNDYWNoZShyZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmNhY2hlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBjYWNoZUVudHJ5IG9mIHRoaXMuY2FjaGUpIHtcblx0XHRcdGlmIChnbG9iTWF0Y2hlc1Jlc291cmNlKGNhY2hlRW50cnksIHJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElFZGl0b3JSZXNvbHZlclNlcnZpY2UsIEVkaXRvclJlc29sdmVyU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsY0FBYztBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxZQUFZLFVBQVU7QUFDdEIsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxTQUFTLGVBQWU7QUFDM0MsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQWtCLHdCQUF3QztBQUNuRSxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQW1CLDBCQUE4RTtBQUNqRyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLDRCQUFvRCx3QkFBd0QsMEJBQTBCLGtDQUFrQywyQkFBMkIsNEJBQTRCLGdDQUFnQyxpQ0FBaUMsK0JBQW9ELHdCQUF3QjtBQUVyWCxTQUFTLDZCQUE2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
