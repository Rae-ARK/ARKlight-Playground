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
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { SideBySideEditor, isEditorInputWithOptions, SaveReason, EditorsOrder, EditorResourceAccessor, EditorInputCapabilities, isResourceDiffEditorInput, isResourceEditorInput, isEditorInput, isEditorInputWithOptionsAndGroup, isResourceMergeEditorInput } from "../../../common/editor.js";
import { EditorInput } from "../../../common/editor/editorInput.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { ResourceMap, ResourceSet } from "../../../../base/common/map.js";
import { IFileService, FileOperation, FileChangesEvent, FileChangeType } from "../../../../platform/files/common/files.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { joinPath } from "../../../../base/common/resources.js";
import { DiffEditorInput } from "../../../common/editor/diffEditorInput.js";
import { SideBySideEditor as SideBySideEditorPane } from "../../../browser/parts/editor/sideBySideEditor.js";
import { IEditorGroupsService, GroupsOrder, isEditorReplacement } from "../common/editorGroupsService.js";
import { IEditorService, isPreferredGroup } from "../common/editorService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Disposable, dispose, DisposableStore } from "../../../../base/common/lifecycle.js";
import { coalesce, distinct } from "../../../../base/common/arrays.js";
import { isCodeEditor, isDiffEditor, isCompositeEditor } from "../../../../editor/browser/editorBrowser.js";
import { registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { isUndefined } from "../../../../base/common/types.js";
import { EditorsObserver } from "../../../browser/parts/editor/editorsObserver.js";
import { Promises, timeout } from "../../../../base/common/async.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { indexOfPath } from "../../../../base/common/extpath.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IEditorResolverService, ResolvedStatus } from "../common/editorResolverService.js";
import { IWorkspaceTrustRequestService, WorkspaceTrustUriResponse } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IHostService } from "../../host/browser/host.js";
import { findGroup } from "../common/editorGroupFinder.js";
import { ITextEditorService } from "../../textfile/common/textEditorService.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
let EditorService = class extends Disposable {
  constructor(editorGroupsContainer, editorGroupService, instantiationService, fileService, configurationService, contextService, uriIdentityService, editorResolverService, workspaceTrustRequestService, hostService, textEditorService) {
    super();
    this.editorGroupService = editorGroupService;
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.uriIdentityService = uriIdentityService;
    this.editorResolverService = editorResolverService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.hostService = hostService;
    this.textEditorService = textEditorService;
    //#region events
    this._onDidActiveEditorChange = this._register(new Emitter());
    this.onDidActiveEditorChange = this._onDidActiveEditorChange.event;
    this._onDidVisibleEditorsChange = this._register(new Emitter());
    this.onDidVisibleEditorsChange = this._onDidVisibleEditorsChange.event;
    this._onDidEditorsChange = this._register(new Emitter());
    this.onDidEditorsChange = this._onDidEditorsChange.event;
    this._onWillOpenEditor = this._register(new Emitter());
    this.onWillOpenEditor = this._onWillOpenEditor.event;
    this._onDidCloseEditor = this._register(new Emitter());
    this.onDidCloseEditor = this._onDidCloseEditor.event;
    this._onDidOpenEditorFail = this._register(new Emitter());
    this.onDidOpenEditorFail = this._onDidOpenEditorFail.event;
    this._onDidMostRecentlyActiveEditorsChange = this._register(new Emitter());
    this.onDidMostRecentlyActiveEditorsChange = this._onDidMostRecentlyActiveEditorsChange.event;
    //#region Editor & group event handlers
    this.lastActiveEditor = void 0;
    //#endregion
    //#region Visible Editors Change: Install file watchers for out of workspace resources that became visible
    this.activeOutOfWorkspaceWatchers = new ResourceMap();
    this.closeOnFileDelete = false;
    this.editorGroupsContainer = editorGroupsContainer ?? editorGroupService;
    this.editorsObserver = this._register(this.instantiationService.createInstance(EditorsObserver, this.editorGroupsContainer));
    this.onConfigurationUpdated();
    this.registerListeners();
  }
  createScoped(editorGroupsContainer, disposables) {
    return disposables.add(new EditorService(editorGroupsContainer, this.editorGroupService, this.instantiationService, this.fileService, this.configurationService, this.contextService, this.uriIdentityService, this.editorResolverService, this.workspaceTrustRequestService, this.hostService, this.textEditorService));
  }
  registerListeners() {
    if (this.editorGroupsContainer === this.editorGroupService.mainPart || this.editorGroupsContainer === this.editorGroupService) {
      this.editorGroupService.whenReady.then(() => this.onEditorGroupsReady());
    } else {
      this.onEditorGroupsReady();
    }
    this._register(this.editorGroupsContainer.onDidChangeActiveGroup((group) => this.handleActiveEditorChange(group)));
    this._register(this.editorGroupsContainer.onDidAddGroup((group) => this.registerGroupListeners(group)));
    this._register(this.editorsObserver.onDidMostRecentlyActiveEditorsChange(() => this._onDidMostRecentlyActiveEditorsChange.fire()));
    this._register(this.onDidVisibleEditorsChange(() => this.handleVisibleEditorsChange()));
    this._register(this.fileService.onDidRunOperation((e) => this.onDidRunFileOperation(e)));
    this._register(this.fileService.onDidFilesChange((e) => this.onDidFilesChange(e)));
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
  }
  onEditorGroupsReady() {
    for (const group of this.editorGroupsContainer.groups) {
      this.registerGroupListeners(group);
    }
    if (this.activeEditor) {
      this.doHandleActiveEditorChangeEvent();
      this._onDidVisibleEditorsChange.fire({ isExplicit: false });
    }
  }
  handleActiveEditorChange(group) {
    if (group !== this.editorGroupsContainer.activeGroup) {
      return;
    }
    if (!this.lastActiveEditor && !group.activeEditor) {
      return;
    }
    this.doHandleActiveEditorChangeEvent();
  }
  doHandleActiveEditorChangeEvent() {
    const activeGroup = this.editorGroupsContainer.activeGroup;
    this.lastActiveEditor = activeGroup.activeEditor ?? void 0;
    this._onDidActiveEditorChange.fire();
  }
  registerGroupListeners(group) {
    const groupDisposables = new DisposableStore();
    groupDisposables.add(group.onDidModelChange((e) => {
      this._onDidEditorsChange.fire({ groupId: group.id, event: e });
    }));
    groupDisposables.add(group.onDidActiveEditorChange((e) => {
      this.handleActiveEditorChange(group);
      this._onDidVisibleEditorsChange.fire({
        isExplicit: e.isExplicit !== false
        /* treat undefined as explicit */
      });
    }));
    groupDisposables.add(group.onWillOpenEditor((e) => {
      this._onWillOpenEditor.fire(e);
    }));
    groupDisposables.add(group.onDidCloseEditor((e) => {
      this._onDidCloseEditor.fire(e);
    }));
    groupDisposables.add(group.onDidOpenEditorFail((editor) => {
      this._onDidOpenEditorFail.fire({ editor, groupId: group.id });
    }));
    Event.once(group.onWillDispose)(() => {
      dispose(groupDisposables);
    });
  }
  handleVisibleEditorsChange() {
    const visibleOutOfWorkspaceResources = new ResourceSet();
    for (const editor of this.visibleEditors) {
      const resources = distinct(coalesce([
        EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }),
        EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY })
      ]), (resource) => resource.toString());
      for (const resource of resources) {
        if (this.fileService.hasProvider(resource) && !this.contextService.isInsideWorkspace(resource)) {
          visibleOutOfWorkspaceResources.add(resource);
        }
      }
    }
    for (const resource of this.activeOutOfWorkspaceWatchers.keys()) {
      if (!visibleOutOfWorkspaceResources.has(resource)) {
        dispose(this.activeOutOfWorkspaceWatchers.get(resource));
        this.activeOutOfWorkspaceWatchers.delete(resource);
      }
    }
    for (const resource of visibleOutOfWorkspaceResources.keys()) {
      if (!this.activeOutOfWorkspaceWatchers.get(resource)) {
        const disposable = this.fileService.watch(resource);
        this.activeOutOfWorkspaceWatchers.set(resource, disposable);
      }
    }
  }
  //#endregion
  //#region File Changes: Move & Deletes to move or close opend editors
  async onDidRunFileOperation(e) {
    if (e.isOperation(FileOperation.MOVE)) {
      this.handleMovedFile(e.resource, e.target.resource);
    }
    if (e.isOperation(FileOperation.DELETE) || e.isOperation(FileOperation.MOVE)) {
      this.handleDeletedFile(e.resource, false, e.target ? e.target.resource : void 0);
    }
  }
  onDidFilesChange(e) {
    if (e.gotDeleted()) {
      this.handleDeletedFile(e, true);
    }
  }
  async handleMovedFile(source, target) {
    for (const group of this.editorGroupsContainer.groups) {
      const replacements = [];
      for (const editor of group.editors) {
        const resource = editor.resource;
        if (!resource || !this.uriIdentityService.extUri.isEqualOrParent(resource, source)) {
          continue;
        }
        let targetResource;
        if (this.uriIdentityService.extUri.isEqual(source, resource)) {
          targetResource = target;
        } else {
          const index = indexOfPath(resource.path, source.path, this.uriIdentityService.extUri.ignorePathCasing(resource));
          targetResource = joinPath(target, resource.path.substr(index + source.path.length + 1));
        }
        const moveResult = await editor.rename(group.id, targetResource);
        if (!moveResult) {
          return;
        }
        const optionOverrides = {
          preserveFocus: true,
          pinned: group.isPinned(editor),
          sticky: group.isSticky(editor),
          index: group.getIndexOfEditor(editor),
          inactive: !group.isActive(editor)
        };
        if (isEditorInput(moveResult.editor)) {
          replacements.push({
            editor,
            replacement: moveResult.editor,
            options: {
              ...moveResult.options,
              ...optionOverrides
            }
          });
        } else {
          replacements.push({
            editor,
            replacement: {
              ...moveResult.editor,
              options: {
                ...moveResult.editor.options,
                ...optionOverrides
              }
            }
          });
        }
      }
      if (replacements.length) {
        this.replaceEditors(replacements, group);
      }
    }
  }
  onConfigurationUpdated(e) {
    if (e && !e.affectsConfiguration("workbench.editor.closeOnFileDelete")) {
      return;
    }
    const configuration = this.configurationService.getValue();
    if (typeof configuration.workbench?.editor?.closeOnFileDelete === "boolean") {
      this.closeOnFileDelete = configuration.workbench.editor.closeOnFileDelete;
    } else {
      this.closeOnFileDelete = false;
    }
  }
  handleDeletedFile(arg1, isExternal, movedTo) {
    for (const editor of this.getAllNonDirtyEditors({ includeUntitled: false, supportSideBySide: true })) {
      (async () => {
        const resource = editor.resource;
        if (!resource) {
          return;
        }
        if (this.closeOnFileDelete || !isExternal) {
          if (movedTo && this.uriIdentityService.extUri.isEqualOrParent(resource, movedTo)) {
            return;
          }
          let matches = false;
          if (arg1 instanceof FileChangesEvent) {
            matches = arg1.contains(resource, FileChangeType.DELETED);
          } else {
            matches = this.uriIdentityService.extUri.isEqualOrParent(resource, arg1);
          }
          if (!matches) {
            return;
          }
          let exists = false;
          if (isExternal && this.fileService.hasProvider(resource)) {
            await timeout(100);
            exists = await this.fileService.exists(resource);
          }
          if (!exists && !editor.isDisposed()) {
            editor.dispose();
          }
        }
      })();
    }
  }
  getAllNonDirtyEditors(options) {
    const editors = [];
    function conditionallyAddEditor(editor) {
      if (editor.hasCapability(EditorInputCapabilities.Untitled) && !options.includeUntitled) {
        return;
      }
      if (editor.isDirty()) {
        return;
      }
      editors.push(editor);
    }
    for (const editor of this.editors) {
      if (options.supportSideBySide && editor instanceof SideBySideEditorInput) {
        conditionallyAddEditor(editor.primary);
        conditionallyAddEditor(editor.secondary);
      } else {
        conditionallyAddEditor(editor);
      }
    }
    return editors;
  }
  get activeEditorPane() {
    return this.editorGroupsContainer.activeGroup?.activeEditorPane;
  }
  get activeTextEditorControl() {
    const activeEditorPane = this.activeEditorPane;
    if (activeEditorPane) {
      const activeControl = activeEditorPane.getControl();
      if (isCodeEditor(activeControl) || isDiffEditor(activeControl)) {
        return activeControl;
      }
      if (isCompositeEditor(activeControl) && isCodeEditor(activeControl.activeCodeEditor)) {
        return activeControl.activeCodeEditor;
      }
    }
    return void 0;
  }
  get activeTextEditorLanguageId() {
    let activeCodeEditor = void 0;
    const activeTextEditorControl = this.activeTextEditorControl;
    if (isDiffEditor(activeTextEditorControl)) {
      activeCodeEditor = activeTextEditorControl.getModifiedEditor();
    } else {
      activeCodeEditor = activeTextEditorControl;
    }
    return activeCodeEditor?.getModel()?.getLanguageId();
  }
  get count() {
    return this.editorsObserver.count;
  }
  get editors() {
    return this.getEditors(EditorsOrder.SEQUENTIAL).map(({ editor }) => editor);
  }
  getEditors(order, options) {
    switch (order) {
      // MRU
      case EditorsOrder.MOST_RECENTLY_ACTIVE:
        if (options?.excludeSticky) {
          return this.editorsObserver.editors.filter(({ groupId, editor }) => !this.editorGroupsContainer.getGroup(groupId)?.isSticky(editor));
        }
        return this.editorsObserver.editors;
      // Sequential
      case EditorsOrder.SEQUENTIAL: {
        const editors = [];
        for (const group of this.editorGroupsContainer.getGroups(GroupsOrder.GRID_APPEARANCE)) {
          editors.push(...group.getEditors(EditorsOrder.SEQUENTIAL, options).map((editor) => ({ editor, groupId: group.id })));
        }
        return editors;
      }
    }
  }
  get activeEditor() {
    const activeGroup = this.editorGroupsContainer.activeGroup;
    return activeGroup ? activeGroup.activeEditor ?? void 0 : void 0;
  }
  get visibleEditorPanes() {
    return coalesce(this.editorGroupsContainer.groups.map((group) => group.activeEditorPane));
  }
  get visibleTextEditorControls() {
    return this.doGetVisibleTextEditorControls(this.visibleEditorPanes);
  }
  doGetVisibleTextEditorControls(editorPanes) {
    const visibleTextEditorControls = [];
    for (const editorPane of editorPanes) {
      const controls = [];
      if (editorPane instanceof SideBySideEditorPane) {
        controls.push(editorPane.getPrimaryEditorPane()?.getControl());
        controls.push(editorPane.getSecondaryEditorPane()?.getControl());
      } else {
        controls.push(editorPane.getControl());
      }
      for (const control of controls) {
        if (isCodeEditor(control) || isDiffEditor(control)) {
          visibleTextEditorControls.push(control);
        }
      }
    }
    return visibleTextEditorControls;
  }
  getVisibleTextEditorControls(order) {
    return this.doGetVisibleTextEditorControls(coalesce(this.editorGroupsContainer.getGroups(order === EditorsOrder.SEQUENTIAL ? GroupsOrder.GRID_APPEARANCE : GroupsOrder.MOST_RECENTLY_ACTIVE).map((group) => group.activeEditorPane)));
  }
  get visibleEditors() {
    return coalesce(this.editorGroupsContainer.groups.map((group) => group.activeEditor));
  }
  async openEditor(editor, optionsOrPreferredGroup, preferredGroup) {
    let typedEditor = void 0;
    let options = isEditorInput(editor) ? optionsOrPreferredGroup : editor.options;
    let group = void 0;
    if (isPreferredGroup(optionsOrPreferredGroup)) {
      preferredGroup = optionsOrPreferredGroup;
    }
    if (!isEditorInput(editor)) {
      const resolvedEditor = await this.editorResolverService.resolveEditor(editor, preferredGroup);
      if (resolvedEditor === ResolvedStatus.ABORT) {
        return;
      }
      if (isEditorInputWithOptionsAndGroup(resolvedEditor)) {
        typedEditor = resolvedEditor.editor;
        options = resolvedEditor.options;
        group = resolvedEditor.group;
      }
    }
    if (!typedEditor) {
      typedEditor = isEditorInput(editor) ? editor : await this.textEditorService.resolveTextEditor(editor);
    }
    if (!group) {
      let activation = void 0;
      const findGroupResult = this.instantiationService.invokeFunction(findGroup, { editor: typedEditor, options }, preferredGroup);
      if (findGroupResult instanceof Promise) {
        [group, activation] = await findGroupResult;
      } else {
        [group, activation] = findGroupResult;
      }
      if (activation) {
        options = { ...options, activation };
      }
    }
    if (options?.preserveFocus && this.editorGroupService.activeModalEditorPart?.groups.some((modalGroup) => modalGroup.id === group.id) && this.editorGroupService.activeModalEditorPart.count === 1 && this.editorGroupService.activeModalEditorPart.groups[0].isEmpty) {
      options = { ...options, preserveFocus: false };
    }
    return group.openEditor(typedEditor, options);
  }
  async openEditors(editors, preferredGroup, options) {
    if (options?.validateTrust) {
      const editorsTrusted = await this.handleWorkspaceTrust(editors);
      if (!editorsTrusted) {
        return [];
      }
    }
    const mapGroupToTypedEditors = /* @__PURE__ */ new Map();
    for (const editor of editors) {
      let typedEditor = void 0;
      let group = void 0;
      if (!isEditorInputWithOptions(editor)) {
        const resolvedEditor = await this.editorResolverService.resolveEditor(editor, preferredGroup);
        if (resolvedEditor === ResolvedStatus.ABORT) {
          continue;
        }
        if (isEditorInputWithOptionsAndGroup(resolvedEditor)) {
          typedEditor = resolvedEditor;
          group = resolvedEditor.group;
        }
      }
      if (!typedEditor) {
        typedEditor = isEditorInputWithOptions(editor) ? editor : { editor: await this.textEditorService.resolveTextEditor(editor), options: editor.options };
      }
      if (!group) {
        const findGroupResult = this.instantiationService.invokeFunction(findGroup, typedEditor, preferredGroup);
        if (findGroupResult instanceof Promise) {
          [group] = await findGroupResult;
        } else {
          [group] = findGroupResult;
        }
      }
      if (typedEditor.options?.preserveFocus && this.editorGroupService.activeModalEditorPart?.groups.some((modalGroup) => modalGroup.id === group.id) && this.editorGroupService.activeModalEditorPart.count === 1 && this.editorGroupService.activeModalEditorPart.groups[0].isEmpty) {
        typedEditor = { ...typedEditor, options: { ...typedEditor.options, preserveFocus: false } };
      }
      let targetGroupEditors = mapGroupToTypedEditors.get(group);
      if (!targetGroupEditors) {
        targetGroupEditors = [];
        mapGroupToTypedEditors.set(group, targetGroupEditors);
      }
      targetGroupEditors.push(typedEditor);
    }
    const result = [];
    for (const [group, editors2] of mapGroupToTypedEditors) {
      result.push(group.openEditors(editors2));
    }
    return coalesce(await Promises.settled(result));
  }
  async handleWorkspaceTrust(editors) {
    const { resources, diffMode, mergeMode } = this.extractEditorResources(editors);
    const trustResult = await this.workspaceTrustRequestService.requestOpenFilesTrust(resources);
    switch (trustResult) {
      case WorkspaceTrustUriResponse.Open:
        return true;
      case WorkspaceTrustUriResponse.OpenInNewWindow:
        await this.hostService.openWindow(resources.map((resource) => ({ fileUri: resource })), { forceNewWindow: true, diffMode, mergeMode });
        return false;
      case WorkspaceTrustUriResponse.Cancel:
        return false;
    }
  }
  extractEditorResources(editors) {
    const resources = new ResourceSet();
    let diffMode = false;
    let mergeMode = false;
    for (const editor of editors) {
      if (isEditorInputWithOptions(editor)) {
        const resource = EditorResourceAccessor.getOriginalUri(editor.editor, { supportSideBySide: SideBySideEditor.BOTH });
        if (URI.isUri(resource)) {
          resources.add(resource);
        } else if (resource) {
          if (resource.primary) {
            resources.add(resource.primary);
          }
          if (resource.secondary) {
            resources.add(resource.secondary);
          }
          diffMode = editor.editor instanceof DiffEditorInput;
        }
      } else {
        if (isResourceMergeEditorInput(editor)) {
          if (URI.isUri(editor.input1)) {
            resources.add(editor.input1.resource);
          }
          if (URI.isUri(editor.input2)) {
            resources.add(editor.input2.resource);
          }
          if (URI.isUri(editor.base)) {
            resources.add(editor.base.resource);
          }
          if (URI.isUri(editor.result)) {
            resources.add(editor.result.resource);
          }
          mergeMode = true;
        }
        if (isResourceDiffEditorInput(editor)) {
          if (URI.isUri(editor.original.resource)) {
            resources.add(editor.original.resource);
          }
          if (URI.isUri(editor.modified.resource)) {
            resources.add(editor.modified.resource);
          }
          diffMode = true;
        } else if (isResourceEditorInput(editor)) {
          resources.add(editor.resource);
        }
      }
    }
    return {
      resources: Array.from(resources.keys()),
      diffMode,
      mergeMode
    };
  }
  //#endregion
  //#region isOpened() / isVisible()
  isOpened(editor) {
    return this.editorsObserver.hasEditor({
      resource: this.uriIdentityService.asCanonicalUri(editor.resource),
      typeId: editor.typeId,
      editorId: editor.editorId
    });
  }
  isVisible(editor) {
    for (const group of this.editorGroupsContainer.groups) {
      if (group.activeEditor?.matches(editor)) {
        return true;
      }
    }
    return false;
  }
  //#endregion
  //#region closeEditor()
  async closeEditor({ editor, groupId }, options) {
    const group = this.editorGroupsContainer.getGroup(groupId);
    await group?.closeEditor(editor, options);
  }
  //#endregion
  //#region closeEditors()
  async closeEditors(editors, options) {
    const mapGroupToEditors = /* @__PURE__ */ new Map();
    for (const { editor, groupId } of editors) {
      const group = this.editorGroupsContainer.getGroup(groupId);
      if (!group) {
        continue;
      }
      let editors2 = mapGroupToEditors.get(group);
      if (!editors2) {
        editors2 = [];
        mapGroupToEditors.set(group, editors2);
      }
      editors2.push(editor);
    }
    for (const [group, editors2] of mapGroupToEditors) {
      await group.closeEditors(editors2, options);
    }
  }
  findEditors(arg1, options, arg2) {
    const resource = URI.isUri(arg1) ? arg1 : arg1.resource;
    const typeId = URI.isUri(arg1) ? void 0 : arg1.typeId;
    if (options?.supportSideBySide !== SideBySideEditor.ANY && options?.supportSideBySide !== SideBySideEditor.SECONDARY) {
      if (!this.editorsObserver.hasEditors(resource)) {
        if (URI.isUri(arg1) || isUndefined(arg2)) {
          return [];
        }
        return void 0;
      }
    }
    if (!isUndefined(arg2)) {
      const targetGroup = typeof arg2 === "number" ? this.editorGroupsContainer.getGroup(arg2) : arg2;
      if (URI.isUri(arg1)) {
        if (!targetGroup) {
          return [];
        }
        return targetGroup.findEditors(resource, options);
      } else {
        if (!targetGroup) {
          return void 0;
        }
        const editors = targetGroup.findEditors(resource, options);
        for (const editor of editors) {
          if (editor.typeId === typeId) {
            return editor;
          }
        }
        return void 0;
      }
    } else {
      const result = [];
      for (const group of this.editorGroupsContainer.getGroups(options?.order === EditorsOrder.SEQUENTIAL ? GroupsOrder.GRID_APPEARANCE : GroupsOrder.MOST_RECENTLY_ACTIVE)) {
        const editors = [];
        if (URI.isUri(arg1)) {
          editors.push(...this.findEditors(arg1, options, group));
        } else {
          const editor = this.findEditors(arg1, options, group);
          if (editor) {
            editors.push(editor);
          }
        }
        result.push(...editors.map((editor) => ({ editor, groupId: group.id })));
      }
      return result;
    }
  }
  async replaceEditors(replacements, group) {
    const targetGroup = typeof group === "number" ? this.editorGroupsContainer.getGroup(group) : group;
    const typedReplacements = [];
    for (const replacement of replacements) {
      let typedReplacement = void 0;
      if (!isEditorInput(replacement.replacement)) {
        const resolvedEditor = await this.editorResolverService.resolveEditor(
          replacement.replacement,
          targetGroup
        );
        if (resolvedEditor === ResolvedStatus.ABORT) {
          continue;
        }
        if (isEditorInputWithOptionsAndGroup(resolvedEditor)) {
          typedReplacement = {
            editor: replacement.editor,
            replacement: resolvedEditor.editor,
            options: resolvedEditor.options,
            forceReplaceDirty: replacement.forceReplaceDirty
          };
        }
      }
      if (!typedReplacement) {
        typedReplacement = {
          editor: replacement.editor,
          replacement: isEditorReplacement(replacement) ? replacement.replacement : await this.textEditorService.resolveTextEditor(replacement.replacement),
          options: isEditorReplacement(replacement) ? replacement.options : replacement.replacement.options,
          forceReplaceDirty: replacement.forceReplaceDirty
        };
      }
      typedReplacements.push(typedReplacement);
    }
    return targetGroup?.replaceEditors(typedReplacements);
  }
  //#endregion
  //#region save/revert
  async save(editors, options) {
    if (!Array.isArray(editors)) {
      editors = [editors];
    }
    const uniqueEditors = this.getUniqueEditors(editors);
    const editorsToSaveParallel = [];
    const editorsToSaveSequentially = [];
    if (options?.saveAs) {
      editorsToSaveSequentially.push(...uniqueEditors);
    } else {
      for (const { groupId, editor } of uniqueEditors) {
        if (editor.hasCapability(EditorInputCapabilities.Untitled)) {
          editorsToSaveSequentially.push({ groupId, editor });
        } else {
          editorsToSaveParallel.push({ groupId, editor });
        }
      }
    }
    const saveResults = await Promises.settled(editorsToSaveParallel.map(({ groupId, editor }) => {
      if (options?.reason === SaveReason.EXPLICIT) {
        this.editorGroupsContainer.getGroup(groupId)?.pinEditor(editor);
      }
      return editor.save(groupId, options);
    }));
    for (const { groupId, editor } of editorsToSaveSequentially) {
      if (editor.isDisposed()) {
        continue;
      }
      const editorPane = await this.openEditor(editor, groupId);
      const editorOptions = {
        pinned: true,
        viewState: editorPane?.getViewState()
      };
      const result = options?.saveAs ? await editor.saveAs(groupId, options) : await editor.save(groupId, options);
      saveResults.push(result);
      if (!result) {
        break;
      }
      if (!editor.matches(result)) {
        const targetGroups = editor.hasCapability(EditorInputCapabilities.Untitled) ? this.editorGroupsContainer.groups.map((group) => group.id) : [groupId];
        for (const targetGroup of targetGroups) {
          if (result instanceof EditorInput) {
            await this.replaceEditors([{ editor, replacement: result, options: editorOptions }], targetGroup);
          } else {
            await this.replaceEditors([{ editor, replacement: { ...result, options: editorOptions } }], targetGroup);
          }
        }
      }
    }
    return {
      success: saveResults.every((result) => !!result),
      editors: coalesce(saveResults)
    };
  }
  saveAll(options) {
    return this.save(this.getAllModifiedEditors(options), options);
  }
  async revert(editors, options) {
    if (!Array.isArray(editors)) {
      editors = [editors];
    }
    const uniqueEditors = this.getUniqueEditors(editors);
    await Promises.settled(uniqueEditors.map(async ({ groupId, editor }) => {
      this.editorGroupsContainer.getGroup(groupId)?.pinEditor(editor);
      return editor.revert(groupId, options);
    }));
    return !uniqueEditors.some(({ editor }) => editor.isDirty());
  }
  async revertAll(options) {
    return this.revert(this.getAllModifiedEditors(options), options);
  }
  getAllModifiedEditors(options) {
    const editors = [];
    for (const group of this.editorGroupsContainer.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
      for (const editor of group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
        if (!editor.isModified()) {
          continue;
        }
        if ((typeof options?.includeUntitled === "boolean" || !options?.includeUntitled?.includeScratchpad) && editor.hasCapability(EditorInputCapabilities.Scratchpad)) {
          continue;
        }
        if (!options?.includeUntitled && editor.hasCapability(EditorInputCapabilities.Untitled)) {
          continue;
        }
        if (options?.excludeSticky && group.isSticky(editor)) {
          continue;
        }
        editors.push({ groupId: group.id, editor });
      }
    }
    return editors;
  }
  getUniqueEditors(editors) {
    const uniqueEditors = [];
    for (const { editor, groupId } of editors) {
      if (uniqueEditors.some((uniqueEditor) => uniqueEditor.editor.matches(editor))) {
        continue;
      }
      uniqueEditors.push({ editor, groupId });
    }
    return uniqueEditors;
  }
  //#endregion
  dispose() {
    super.dispose();
    this.activeOutOfWorkspaceWatchers.forEach((disposable) => dispose(disposable));
    this.activeOutOfWorkspaceWatchers.clear();
  }
};
EditorService = __decorateClass([
  __decorateParam(1, IEditorGroupsService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IUriIdentityService),
  __decorateParam(7, IEditorResolverService),
  __decorateParam(8, IWorkspaceTrustRequestService),
  __decorateParam(9, IHostService),
  __decorateParam(10, ITextEditorService)
], EditorService);
registerSingleton(IEditorService, new SyncDescriptor(EditorService, [void 0], false));
export {
  EditorService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvYnJvd3Nlci9lZGl0b3JTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VFZGl0b3JJbnB1dCwgSUVkaXRvck9wdGlvbnMsIEVkaXRvckFjdGl2YXRpb24sIElSZXNvdXJjZUVkaXRvcklucHV0SWRlbnRpZmllciwgSVRleHRSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgU2lkZUJ5U2lkZUVkaXRvciwgSUVkaXRvclBhbmUsIEdyb3VwSWRlbnRpZmllciwgSVVudGl0bGVkVGV4dFJlc291cmNlRWRpdG9ySW5wdXQsIElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCwgRWRpdG9ySW5wdXRXaXRoT3B0aW9ucywgaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zLCBJRWRpdG9ySWRlbnRpZmllciwgSUVkaXRvckNsb3NlRXZlbnQsIElUZXh0RGlmZkVkaXRvclBhbmUsIElSZXZlcnRPcHRpb25zLCBTYXZlUmVhc29uLCBFZGl0b3JzT3JkZXIsIElXb3JrYmVuY2hFZGl0b3JDb25maWd1cmF0aW9uLCBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBJVmlzaWJsZUVkaXRvclBhbmUsIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBpc1Jlc291cmNlRGlmZkVkaXRvcklucHV0LCBJVW50eXBlZEVkaXRvcklucHV0LCBpc1Jlc291cmNlRWRpdG9ySW5wdXQsIGlzRWRpdG9ySW5wdXQsIGlzRWRpdG9ySW5wdXRXaXRoT3B0aW9uc0FuZEdyb3VwLCBJRmluZEVkaXRvck9wdGlvbnMsIGlzUmVzb3VyY2VNZXJnZUVkaXRvcklucHV0LCBJRWRpdG9yV2lsbE9wZW5FdmVudCwgSUVkaXRvckNvbnRyb2wsIElUZXh0UmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBGaWxlT3BlcmF0aW9uRXZlbnQsIEZpbGVPcGVyYXRpb24sIEZpbGVDaGFuZ2VzRXZlbnQsIEZpbGVDaGFuZ2VUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3IgYXMgU2lkZUJ5U2lkZUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9zaWRlQnlTaWRlRWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlLCBJRWRpdG9yR3JvdXAsIEdyb3Vwc09yZGVyLCBJRWRpdG9yUmVwbGFjZW1lbnQsIGlzRWRpdG9yUmVwbGFjZW1lbnQsIElDbG9zZUVkaXRvck9wdGlvbnMsIElFZGl0b3JHcm91cHNDb250YWluZXIgfSBmcm9tICcuLi9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVW50eXBlZEVkaXRvclJlcGxhY2VtZW50LCBJRWRpdG9yU2VydmljZSwgSVNhdmVFZGl0b3JzT3B0aW9ucywgSVNhdmVBbGxFZGl0b3JzT3B0aW9ucywgSVJldmVydEFsbEVkaXRvcnNPcHRpb25zLCBJQmFzZVNhdmVSZXZlcnRBbGxFZGl0b3JPcHRpb25zLCBJT3BlbkVkaXRvcnNPcHRpb25zLCBQcmVmZXJyZWRHcm91cCwgaXNQcmVmZXJyZWRHcm91cCwgSUVkaXRvcnNDaGFuZ2VFdmVudCwgSVNhdmVFZGl0b3JzUmVzdWx0LCBJVmlzaWJsZUVkaXRvcnNDaGFuZ2VFdmVudCB9IGZyb20gJy4uL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIGRpc3Bvc2UsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSwgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgaXNDb2RlRWRpdG9yLCBpc0RpZmZFZGl0b3IsIElDb2RlRWRpdG9yLCBJRGlmZkVkaXRvciwgaXNDb21wb3NpdGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cFZpZXcsIEVkaXRvclNlcnZpY2VJbXBsIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEVkaXRvcnNPYnNlcnZlciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvcnNPYnNlcnZlci5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGluZGV4T2ZQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsIFJlc29sdmVkU3RhdHVzIH0gZnJvbSAnLi4vY29tbW9uL2VkaXRvclJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSwgV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgZmluZEdyb3VwIH0gZnJvbSAnLi4vY29tbW9uL2VkaXRvckdyb3VwRmluZGVyLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3RleHRmaWxlL2NvbW1vbi90ZXh0RWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcblxuZXhwb3J0IGNsYXNzIEVkaXRvclNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgRWRpdG9yU2VydmljZUltcGwge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8vI3JlZ2lvbiBldmVudHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSA9IHRoaXMuX29uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVmlzaWJsZUVkaXRvcnNDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UgPSB0aGlzLl9vbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRWRpdG9yc0NoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JzQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEVkaXRvcnNDaGFuZ2UgPSB0aGlzLl9vbkRpZEVkaXRvcnNDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsT3BlbkVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JXaWxsT3BlbkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25XaWxsT3BlbkVkaXRvciA9IHRoaXMuX29uV2lsbE9wZW5FZGl0b3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZUVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JDbG9zZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZUVkaXRvciA9IHRoaXMuX29uRGlkQ2xvc2VFZGl0b3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRPcGVuRWRpdG9yRmFpbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JJZGVudGlmaWVyPigpKTtcblx0cmVhZG9ubHkgb25EaWRPcGVuRWRpdG9yRmFpbCA9IHRoaXMuX29uRGlkT3BlbkVkaXRvckZhaWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRNb3N0UmVjZW50bHlBY3RpdmVFZGl0b3JzQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTW9zdFJlY2VudGx5QWN0aXZlRWRpdG9yc0NoYW5nZSA9IHRoaXMuX29uRGlkTW9zdFJlY2VudGx5QWN0aXZlRWRpdG9yc0NoYW5nZS5ldmVudDtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3Vwc0NvbnRhaW5lcjogSUVkaXRvckdyb3Vwc0NvbnRhaW5lcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3JHcm91cHNDb250YWluZXI6IElFZGl0b3JHcm91cHNDb250YWluZXIgfCB1bmRlZmluZWQsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUVkaXRvclJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclJlc29sdmVyU2VydmljZTogSUVkaXRvclJlc29sdmVyU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVRleHRFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEVkaXRvclNlcnZpY2U6IElUZXh0RWRpdG9yU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIgPSBlZGl0b3JHcm91cHNDb250YWluZXIgPz8gZWRpdG9yR3JvdXBTZXJ2aWNlO1xuXHRcdHRoaXMuZWRpdG9yc09ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JzT2JzZXJ2ZXIsIHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyKSk7XG5cblx0XHR0aGlzLm9uQ29uZmlndXJhdGlvblVwZGF0ZWQoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdGNyZWF0ZVNjb3BlZChlZGl0b3JHcm91cHNDb250YWluZXI6IElFZGl0b3JHcm91cHNDb250YWluZXIsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBJRWRpdG9yU2VydmljZSB7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChuZXcgRWRpdG9yU2VydmljZShlZGl0b3JHcm91cHNDb250YWluZXIsIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmNvbnRleHRTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSwgdGhpcy5lZGl0b3JSZXNvbHZlclNlcnZpY2UsIHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSwgdGhpcy5ob3N0U2VydmljZSwgdGhpcy50ZXh0RWRpdG9yU2VydmljZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIEVkaXRvciAmIGdyb3VwIGNoYW5nZXNcblx0XHRpZiAodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIgPT09IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0IHx8IHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyID09PSB0aGlzLmVkaXRvckdyb3VwU2VydmljZSkge1xuXHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2Uud2hlblJlYWR5LnRoZW4oKCkgPT4gdGhpcy5vbkVkaXRvckdyb3Vwc1JlYWR5KCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm9uRWRpdG9yR3JvdXBzUmVhZHkoKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIub25EaWRDaGFuZ2VBY3RpdmVHcm91cChncm91cCA9PiB0aGlzLmhhbmRsZUFjdGl2ZUVkaXRvckNoYW5nZShncm91cCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5vbkRpZEFkZEdyb3VwKGdyb3VwID0+IHRoaXMucmVnaXN0ZXJHcm91cExpc3RlbmVycyhncm91cCBhcyBJRWRpdG9yR3JvdXBWaWV3KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yc09ic2VydmVyLm9uRGlkTW9zdFJlY2VudGx5QWN0aXZlRWRpdG9yc0NoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZE1vc3RSZWNlbnRseUFjdGl2ZUVkaXRvcnNDaGFuZ2UuZmlyZSgpKSk7XG5cblx0XHQvLyBPdXQgb2Ygd29ya3NwYWNlIGZpbGUgd2F0Y2hlcnNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UoKCkgPT4gdGhpcy5oYW5kbGVWaXNpYmxlRWRpdG9yc0NoYW5nZSgpKSk7XG5cblx0XHQvLyBGaWxlIGNoYW5nZXMgJiBvcGVyYXRpb25zXG5cdFx0Ly8gTm90ZTogdGhlcmUgaXMgc29tZSBkdXBsaWNhdGlvbiB3aXRoIHRoZSB0d28gZmlsZSBldmVudCBoYW5kbGVycy0gU2luY2Ugd2UgY2Fubm90IGFsd2F5cyByZWx5IG9uIHRoZSBkaXNrIGV2ZW50c1xuXHRcdC8vIGNhcnJ5aW5nIGFsbCBuZWNlc3NhcnkgZGF0YSBpbiBhbGwgZW52aXJvbm1lbnRzLCB3ZSBhbHNvIHVzZSB0aGUgZmlsZSBvcGVyYXRpb24gZXZlbnRzIHRvIG1ha2Ugc3VyZSBvcGVyYXRpb25zIGFyZSBoYW5kbGVkLlxuXHRcdC8vIEluIGFueSBjYXNlIHRoZXJlIGlzIG5vIGd1YXJhbnRlZSBpZiB0aGUgbG9jYWwgZXZlbnQgaXMgZmlyZWQgZmlyc3Qgb3IgdGhlIGRpc2sgb25lLiBUaHVzLCBjb2RlIG11c3QgaGFuZGxlIHRoZSBjYXNlXG5cdFx0Ly8gdGhhdCB0aGUgZXZlbnQgb3JkZXJpbmcgaXMgcmFuZG9tIGFzIHdlbGwgYXMgbWlnaHQgbm90IGNhcnJ5IGFsbCBpbmZvcm1hdGlvbiBuZWVkZWQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IHRoaXMub25EaWRSdW5GaWxlT3BlcmF0aW9uKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4gdGhpcy5vbkRpZEZpbGVzQ2hhbmdlKGUpKSk7XG5cblx0XHQvLyBDb25maWd1cmF0aW9uXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB0aGlzLm9uQ29uZmlndXJhdGlvblVwZGF0ZWQoZSkpKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBFZGl0b3IgJiBncm91cCBldmVudCBoYW5kbGVyc1xuXG5cdHByaXZhdGUgbGFzdEFjdGl2ZUVkaXRvcjogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBvbkVkaXRvckdyb3Vwc1JlYWR5KCk6IHZvaWQge1xuXG5cdFx0Ly8gUmVnaXN0ZXIgbGlzdGVuZXJzIHRvIGVhY2ggb3BlbmVkIGdyb3VwXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5ncm91cHMpIHtcblx0XHRcdHRoaXMucmVnaXN0ZXJHcm91cExpc3RlbmVycyhncm91cCBhcyBJRWRpdG9yR3JvdXBWaWV3KTtcblx0XHR9XG5cblx0XHQvLyBGaXJlIGluaXRpYWwgc2V0IG9mIGVkaXRvciBldmVudHMgaWYgdGhlcmUgaXMgYW4gYWN0aXZlIGVkaXRvclxuXHRcdGlmICh0aGlzLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0dGhpcy5kb0hhbmRsZUFjdGl2ZUVkaXRvckNoYW5nZUV2ZW50KCk7XG5cdFx0XHR0aGlzLl9vbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlLmZpcmUoeyBpc0V4cGxpY2l0OiBmYWxzZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUFjdGl2ZUVkaXRvckNoYW5nZShncm91cDogSUVkaXRvckdyb3VwKTogdm9pZCB7XG5cdFx0aWYgKGdyb3VwICE9PSB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5hY3RpdmVHcm91cCkge1xuXHRcdFx0cmV0dXJuOyAvLyBpZ25vcmUgaWYgbm90IHRoZSBhY3RpdmUgZ3JvdXBcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMubGFzdEFjdGl2ZUVkaXRvciAmJiAhZ3JvdXAuYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47IC8vIGlnbm9yZSBpZiB3ZSBzdGlsbCBoYXZlIG5vIGFjdGl2ZSBlZGl0b3Jcblx0XHR9XG5cblx0XHR0aGlzLmRvSGFuZGxlQWN0aXZlRWRpdG9yQ2hhbmdlRXZlbnQoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9IYW5kbGVBY3RpdmVFZGl0b3JDaGFuZ2VFdmVudCgpOiB2b2lkIHtcblxuXHRcdC8vIFJlbWVtYmVyIGFzIGxhc3QgYWN0aXZlXG5cdFx0Y29uc3QgYWN0aXZlR3JvdXAgPSB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5hY3RpdmVHcm91cDtcblx0XHR0aGlzLmxhc3RBY3RpdmVFZGl0b3IgPSBhY3RpdmVHcm91cC5hY3RpdmVFZGl0b3IgPz8gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gRmlyZSBldmVudCB0byBvdXRzaWRlIHBhcnRpZXNcblx0XHR0aGlzLl9vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyR3JvdXBMaXN0ZW5lcnMoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Z3JvdXBEaXNwb3NhYmxlcy5hZGQoZ3JvdXAub25EaWRNb2RlbENoYW5nZShlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkRWRpdG9yc0NoYW5nZS5maXJlKHsgZ3JvdXBJZDogZ3JvdXAuaWQsIGV2ZW50OiBlIH0pO1xuXHRcdH0pKTtcblxuXHRcdGdyb3VwRGlzcG9zYWJsZXMuYWRkKGdyb3VwLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKGUgPT4ge1xuXHRcdFx0dGhpcy5oYW5kbGVBY3RpdmVFZGl0b3JDaGFuZ2UoZ3JvdXApO1xuXHRcdFx0dGhpcy5fb25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZS5maXJlKHsgaXNFeHBsaWNpdDogZS5pc0V4cGxpY2l0ICE9PSBmYWxzZSAvKiB0cmVhdCB1bmRlZmluZWQgYXMgZXhwbGljaXQgKi8gfSk7XG5cdFx0fSkpO1xuXG5cdFx0Z3JvdXBEaXNwb3NhYmxlcy5hZGQoZ3JvdXAub25XaWxsT3BlbkVkaXRvcihlID0+IHtcblx0XHRcdHRoaXMuX29uV2lsbE9wZW5FZGl0b3IuZmlyZShlKTtcblx0XHR9KSk7XG5cblx0XHRncm91cERpc3Bvc2FibGVzLmFkZChncm91cC5vbkRpZENsb3NlRWRpdG9yKGUgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDbG9zZUVkaXRvci5maXJlKGUpO1xuXHRcdH0pKTtcblxuXHRcdGdyb3VwRGlzcG9zYWJsZXMuYWRkKGdyb3VwLm9uRGlkT3BlbkVkaXRvckZhaWwoZWRpdG9yID0+IHtcblx0XHRcdHRoaXMuX29uRGlkT3BlbkVkaXRvckZhaWwuZmlyZSh7IGVkaXRvciwgZ3JvdXBJZDogZ3JvdXAuaWQgfSk7XG5cdFx0fSkpO1xuXG5cdFx0RXZlbnQub25jZShncm91cC5vbldpbGxEaXNwb3NlKSgoKSA9PiB7XG5cdFx0XHRkaXNwb3NlKGdyb3VwRGlzcG9zYWJsZXMpO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFZpc2libGUgRWRpdG9ycyBDaGFuZ2U6IEluc3RhbGwgZmlsZSB3YXRjaGVycyBmb3Igb3V0IG9mIHdvcmtzcGFjZSByZXNvdXJjZXMgdGhhdCBiZWNhbWUgdmlzaWJsZVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlT3V0T2ZXb3Jrc3BhY2VXYXRjaGVycyA9IG5ldyBSZXNvdXJjZU1hcDxJRGlzcG9zYWJsZT4oKTtcblxuXHRwcml2YXRlIGhhbmRsZVZpc2libGVFZGl0b3JzQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHZpc2libGVPdXRPZldvcmtzcGFjZVJlc291cmNlcyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgdGhpcy52aXNpYmxlRWRpdG9ycykge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VzID0gZGlzdGluY3QoY29hbGVzY2UoW1xuXHRcdFx0XHRFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaShlZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KSxcblx0XHRcdFx0RWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlNFQ09OREFSWSB9KVxuXHRcdFx0XSksIHJlc291cmNlID0+IHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHJlc291cmNlcykge1xuXHRcdFx0XHRpZiAodGhpcy5maWxlU2VydmljZS5oYXNQcm92aWRlcihyZXNvdXJjZSkgJiYgIXRoaXMuY29udGV4dFNlcnZpY2UuaXNJbnNpZGVXb3Jrc3BhY2UocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0dmlzaWJsZU91dE9mV29ya3NwYWNlUmVzb3VyY2VzLmFkZChyZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgbm8gbG9uZ2VyIHZpc2libGUgb3V0IG9mIHdvcmtzcGFjZSByZXNvdXJjZXNcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHRoaXMuYWN0aXZlT3V0T2ZXb3Jrc3BhY2VXYXRjaGVycy5rZXlzKCkpIHtcblx0XHRcdGlmICghdmlzaWJsZU91dE9mV29ya3NwYWNlUmVzb3VyY2VzLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdFx0ZGlzcG9zZSh0aGlzLmFjdGl2ZU91dE9mV29ya3NwYWNlV2F0Y2hlcnMuZ2V0KHJlc291cmNlKSk7XG5cdFx0XHRcdHRoaXMuYWN0aXZlT3V0T2ZXb3Jrc3BhY2VXYXRjaGVycy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBuZXdseSB2aXNpYmxlIG91dCBvZiB3b3Jrc3BhY2UgcmVzb3VyY2VzXG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiB2aXNpYmxlT3V0T2ZXb3Jrc3BhY2VSZXNvdXJjZXMua2V5cygpKSB7XG5cdFx0XHRpZiAoIXRoaXMuYWN0aXZlT3V0T2ZXb3Jrc3BhY2VXYXRjaGVycy5nZXQocmVzb3VyY2UpKSB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKHJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5hY3RpdmVPdXRPZldvcmtzcGFjZVdhdGNoZXJzLnNldChyZXNvdXJjZSwgZGlzcG9zYWJsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEZpbGUgQ2hhbmdlczogTW92ZSAmIERlbGV0ZXMgdG8gbW92ZSBvciBjbG9zZSBvcGVuZCBlZGl0b3JzXG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZFJ1bkZpbGVPcGVyYXRpb24oZTogRmlsZU9wZXJhdGlvbkV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBIYW5kbGUgbW92ZXMgc3BlY2lhbGx5IHdoZW4gZmlsZSBpcyBvcGVuZWRcblx0XHRpZiAoZS5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLk1PVkUpKSB7XG5cdFx0XHR0aGlzLmhhbmRsZU1vdmVkRmlsZShlLnJlc291cmNlLCBlLnRhcmdldC5yZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGRlbGV0ZXNcblx0XHRpZiAoZS5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLkRFTEVURSkgfHwgZS5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLk1PVkUpKSB7XG5cdFx0XHR0aGlzLmhhbmRsZURlbGV0ZWRGaWxlKGUucmVzb3VyY2UsIGZhbHNlLCBlLnRhcmdldCA/IGUudGFyZ2V0LnJlc291cmNlIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkRmlsZXNDaGFuZ2UoZTogRmlsZUNoYW5nZXNFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmdvdERlbGV0ZWQoKSkge1xuXHRcdFx0dGhpcy5oYW5kbGVEZWxldGVkRmlsZShlLCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZU1vdmVkRmlsZShzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdyb3Vwcykge1xuXHRcdFx0Y29uc3QgcmVwbGFjZW1lbnRzOiAoSVVudHlwZWRFZGl0b3JSZXBsYWNlbWVudCB8IElFZGl0b3JSZXBsYWNlbWVudClbXSA9IFtdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBncm91cC5lZGl0b3JzKSB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gZWRpdG9yLnJlc291cmNlO1xuXHRcdFx0XHRpZiAoIXJlc291cmNlIHx8ICF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHJlc291cmNlLCBzb3VyY2UpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7IC8vIG5vdCBtYXRjaGluZyBvdXIgcmVzb3VyY2Vcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIERldGVybWluZSBuZXcgcmVzdWx0aW5nIHRhcmdldCByZXNvdXJjZVxuXHRcdFx0XHRsZXQgdGFyZ2V0UmVzb3VyY2U6IFVSSTtcblx0XHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHNvdXJjZSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0dGFyZ2V0UmVzb3VyY2UgPSB0YXJnZXQ7IC8vIGZpbGUgZ290IG1vdmVkXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBpbmRleE9mUGF0aChyZXNvdXJjZS5wYXRoLCBzb3VyY2UucGF0aCwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlnbm9yZVBhdGhDYXNpbmcocmVzb3VyY2UpKTtcblx0XHRcdFx0XHR0YXJnZXRSZXNvdXJjZSA9IGpvaW5QYXRoKHRhcmdldCwgcmVzb3VyY2UucGF0aC5zdWJzdHIoaW5kZXggKyBzb3VyY2UucGF0aC5sZW5ndGggKyAxKSk7IC8vIHBhcmVudCBmb2xkZXIgZ290IG1vdmVkXG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBEZWxlZ2F0ZSByZW5hbWUoKSB0byBlZGl0b3IgaW5zdGFuY2Vcblx0XHRcdFx0Y29uc3QgbW92ZVJlc3VsdCA9IGF3YWl0IGVkaXRvci5yZW5hbWUoZ3JvdXAuaWQsIHRhcmdldFJlc291cmNlKTtcblx0XHRcdFx0aWYgKCFtb3ZlUmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBub3QgdGFyZ2V0IC0gaWdub3JlXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBvcHRpb25PdmVycmlkZXMgPSB7XG5cdFx0XHRcdFx0cHJlc2VydmVGb2N1czogdHJ1ZSxcblx0XHRcdFx0XHRwaW5uZWQ6IGdyb3VwLmlzUGlubmVkKGVkaXRvciksXG5cdFx0XHRcdFx0c3RpY2t5OiBncm91cC5pc1N0aWNreShlZGl0b3IpLFxuXHRcdFx0XHRcdGluZGV4OiBncm91cC5nZXRJbmRleE9mRWRpdG9yKGVkaXRvciksXG5cdFx0XHRcdFx0aW5hY3RpdmU6ICFncm91cC5pc0FjdGl2ZShlZGl0b3IpXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Ly8gQ29uc3RydWN0IGEgcmVwbGFjZW1lbnQgd2l0aCBvdXIgZXh0cmEgb3B0aW9ucyBtaXhlZCBpblxuXHRcdFx0XHRpZiAoaXNFZGl0b3JJbnB1dChtb3ZlUmVzdWx0LmVkaXRvcikpIHtcblx0XHRcdFx0XHRyZXBsYWNlbWVudHMucHVzaCh7XG5cdFx0XHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdFx0XHRyZXBsYWNlbWVudDogbW92ZVJlc3VsdC5lZGl0b3IsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdC4uLm1vdmVSZXN1bHQub3B0aW9ucyxcblx0XHRcdFx0XHRcdFx0Li4ub3B0aW9uT3ZlcnJpZGVzXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVwbGFjZW1lbnRzLnB1c2goe1xuXHRcdFx0XHRcdFx0ZWRpdG9yLFxuXHRcdFx0XHRcdFx0cmVwbGFjZW1lbnQ6IHtcblx0XHRcdFx0XHRcdFx0Li4ubW92ZVJlc3VsdC5lZGl0b3IsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHQuLi5tb3ZlUmVzdWx0LmVkaXRvci5vcHRpb25zLFxuXHRcdFx0XHRcdFx0XHRcdC4uLm9wdGlvbk92ZXJyaWRlc1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQXBwbHkgcmVwbGFjZW1lbnRzXG5cdFx0XHRpZiAocmVwbGFjZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLnJlcGxhY2VFZGl0b3JzKHJlcGxhY2VtZW50cywgZ3JvdXApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xvc2VPbkZpbGVEZWxldGUgPSBmYWxzZTtcblxuXHRwcml2YXRlIG9uQ29uZmlndXJhdGlvblVwZGF0ZWQoZT86IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZSAmJiAhZS5hZmZlY3RzQ29uZmlndXJhdGlvbignd29ya2JlbmNoLmVkaXRvci5jbG9zZU9uRmlsZURlbGV0ZScpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVdvcmtiZW5jaEVkaXRvckNvbmZpZ3VyYXRpb24+KCk7XG5cdFx0aWYgKHR5cGVvZiBjb25maWd1cmF0aW9uLndvcmtiZW5jaD8uZWRpdG9yPy5jbG9zZU9uRmlsZURlbGV0ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR0aGlzLmNsb3NlT25GaWxlRGVsZXRlID0gY29uZmlndXJhdGlvbi53b3JrYmVuY2guZWRpdG9yLmNsb3NlT25GaWxlRGVsZXRlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNsb3NlT25GaWxlRGVsZXRlID0gZmFsc2U7IC8vIGRlZmF1bHRcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZURlbGV0ZWRGaWxlKGFyZzE6IFVSSSB8IEZpbGVDaGFuZ2VzRXZlbnQsIGlzRXh0ZXJuYWw6IGJvb2xlYW4sIG1vdmVkVG8/OiBVUkkpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiB0aGlzLmdldEFsbE5vbkRpcnR5RWRpdG9ycyh7IGluY2x1ZGVVbnRpdGxlZDogZmFsc2UsIHN1cHBvcnRTaWRlQnlTaWRlOiB0cnVlIH0pKSB7XG5cdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IGVkaXRvci5yZXNvdXJjZTtcblx0XHRcdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEhhbmRsZSBkZWxldGVzIGluIG9wZW5lZCBlZGl0b3JzIGRlcGVuZGluZyBvbjpcblx0XHRcdFx0Ly8gLSB3ZSBjbG9zZSBhbnkgZWRpdG9yIHdoZW4gYGNsb3NlT25GaWxlRGVsZXRlOiB0cnVlYFxuXHRcdFx0XHQvLyAtIHdlIGNsb3NlIGFueSBlZGl0b3Igd2hlbiB0aGUgZGVsZXRlIG9jY3VycmVkIGZyb20gd2l0aGluIFZTQ29kZVxuXHRcdFx0XHRpZiAodGhpcy5jbG9zZU9uRmlsZURlbGV0ZSB8fCAhaXNFeHRlcm5hbCkge1xuXG5cdFx0XHRcdFx0Ly8gRG8gTk9UIGNsb3NlIGFueSBvcGVuZWQgZWRpdG9yIHRoYXQgbWF0Y2hlcyB0aGUgcmVzb3VyY2UgcGF0aCAoZWl0aGVyIGVxdWFsIG9yIGJlaW5nIHBhcmVudCkgb2YgdGhlXG5cdFx0XHRcdFx0Ly8gcmVzb3VyY2Ugd2UgbW92ZSB0byAobW92ZWRUbykuIE90aGVyd2lzZSB3ZSB3b3VsZCBjbG9zZSBhIHJlc291cmNlIHRoYXQgaGFzIGJlZW4gcmVuYW1lZCB0byB0aGUgc2FtZVxuXHRcdFx0XHRcdC8vIHBhdGggYnV0IGRpZmZlcmVudCBjYXNpbmcuXG5cdFx0XHRcdFx0aWYgKG1vdmVkVG8gJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgbW92ZWRUbykpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZXQgbWF0Y2hlcyA9IGZhbHNlO1xuXHRcdFx0XHRcdGlmIChhcmcxIGluc3RhbmNlb2YgRmlsZUNoYW5nZXNFdmVudCkge1xuXHRcdFx0XHRcdFx0bWF0Y2hlcyA9IGFyZzEuY29udGFpbnMocmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtYXRjaGVzID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgYXJnMSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCFtYXRjaGVzKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gV2UgaGF2ZSByZWNlaXZlZCByZXBvcnRzIG9mIHVzZXJzIHNlZWluZyBkZWxldGUgZXZlbnRzIGV2ZW4gdGhvdWdoIHRoZSBmaWxlIHN0aWxsXG5cdFx0XHRcdFx0Ly8gZXhpc3RzIChuZXR3b3JrIHNoYXJlcyBpc3N1ZTogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzNjY1KS5cblx0XHRcdFx0XHQvLyBTaW5jZSB3ZSBkbyBub3Qgd2FudCB0byBjbG9zZSBhbiBlZGl0b3Igd2l0aG91dCByZWFzb24sIHdlIGhhdmUgdG8gY2hlY2sgaWYgdGhlXG5cdFx0XHRcdFx0Ly8gZmlsZSBpcyByZWFsbHkgZ29uZSBhbmQgbm90IGp1c3QgYSBmYXVsdHkgZmlsZSBldmVudC5cblx0XHRcdFx0XHQvLyBUaGlzIG9ubHkgYXBwbGllcyB0byBleHRlcm5hbCBmaWxlIGV2ZW50cywgc28gd2UgbmVlZCB0byBjaGVjayBmb3IgdGhlIGlzRXh0ZXJuYWxcblx0XHRcdFx0XHQvLyBmbGFnLlxuXHRcdFx0XHRcdGxldCBleGlzdHMgPSBmYWxzZTtcblx0XHRcdFx0XHRpZiAoaXNFeHRlcm5hbCAmJiB0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDApO1xuXHRcdFx0XHRcdFx0ZXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMocmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghZXhpc3RzICYmICFlZGl0b3IuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdFx0XHRlZGl0b3IuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEFsbE5vbkRpcnR5RWRpdG9ycyhvcHRpb25zOiB7IGluY2x1ZGVVbnRpdGxlZDogYm9vbGVhbjsgc3VwcG9ydFNpZGVCeVNpZGU6IGJvb2xlYW4gfSk6IEVkaXRvcklucHV0W10ge1xuXHRcdGNvbnN0IGVkaXRvcnM6IEVkaXRvcklucHV0W10gPSBbXTtcblxuXHRcdGZ1bmN0aW9uIGNvbmRpdGlvbmFsbHlBZGRFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdFx0aWYgKGVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkKSAmJiAhb3B0aW9ucy5pbmNsdWRlVW50aXRsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWRpdG9yLmlzRGlydHkoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGVkaXRvcnMucHVzaChlZGl0b3IpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHRoaXMuZWRpdG9ycykge1xuXHRcdFx0aWYgKG9wdGlvbnMuc3VwcG9ydFNpZGVCeVNpZGUgJiYgZWRpdG9yIGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0KSB7XG5cdFx0XHRcdGNvbmRpdGlvbmFsbHlBZGRFZGl0b3IoZWRpdG9yLnByaW1hcnkpO1xuXHRcdFx0XHRjb25kaXRpb25hbGx5QWRkRWRpdG9yKGVkaXRvci5zZWNvbmRhcnkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uZGl0aW9uYWxseUFkZEVkaXRvcihlZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3JzO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEVkaXRvciBhY2Nlc3NvcnNcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcnNPYnNlcnZlcjogRWRpdG9yc09ic2VydmVyO1xuXG5cdGdldCBhY3RpdmVFZGl0b3JQYW5lKCk6IElWaXNpYmxlRWRpdG9yUGFuZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmFjdGl2ZUdyb3VwPy5hY3RpdmVFZGl0b3JQYW5lO1xuXHR9XG5cblx0Z2V0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKCk6IElDb2RlRWRpdG9yIHwgSURpZmZFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSB0aGlzLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZUNvbnRyb2wgPSBhY3RpdmVFZGl0b3JQYW5lLmdldENvbnRyb2woKTtcblx0XHRcdGlmIChpc0NvZGVFZGl0b3IoYWN0aXZlQ29udHJvbCkgfHwgaXNEaWZmRWRpdG9yKGFjdGl2ZUNvbnRyb2wpKSB7XG5cdFx0XHRcdHJldHVybiBhY3RpdmVDb250cm9sO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQ29tcG9zaXRlRWRpdG9yKGFjdGl2ZUNvbnRyb2wpICYmIGlzQ29kZUVkaXRvcihhY3RpdmVDb250cm9sLmFjdGl2ZUNvZGVFZGl0b3IpKSB7XG5cdFx0XHRcdHJldHVybiBhY3RpdmVDb250cm9sLmFjdGl2ZUNvZGVFZGl0b3I7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBhY3RpdmVUZXh0RWRpdG9yTGFuZ3VhZ2VJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGxldCBhY3RpdmVDb2RlRWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gdGhpcy5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHRpZiAoaXNEaWZmRWRpdG9yKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSkge1xuXHRcdFx0YWN0aXZlQ29kZUVkaXRvciA9IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldE1vZGlmaWVkRWRpdG9yKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjdGl2ZUNvZGVFZGl0b3IgPSBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gYWN0aXZlQ29kZUVkaXRvcj8uZ2V0TW9kZWwoKT8uZ2V0TGFuZ3VhZ2VJZCgpO1xuXHR9XG5cblx0Z2V0IGNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yc09ic2VydmVyLmNvdW50O1xuXHR9XG5cblx0Z2V0IGVkaXRvcnMoKTogRWRpdG9ySW5wdXRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkubWFwKCh7IGVkaXRvciB9KSA9PiBlZGl0b3IpO1xuXHR9XG5cblx0Z2V0RWRpdG9ycyhvcmRlcjogRWRpdG9yc09yZGVyLCBvcHRpb25zPzogeyBleGNsdWRlU3RpY2t5PzogYm9vbGVhbiB9KTogSUVkaXRvcklkZW50aWZpZXJbXSB7XG5cdFx0c3dpdGNoIChvcmRlcikge1xuXG5cdFx0XHQvLyBNUlVcblx0XHRcdGNhc2UgRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFOlxuXHRcdFx0XHRpZiAob3B0aW9ucz8uZXhjbHVkZVN0aWNreSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmVkaXRvcnNPYnNlcnZlci5lZGl0b3JzLmZpbHRlcigoeyBncm91cElkLCBlZGl0b3IgfSkgPT4gIXRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdldEdyb3VwKGdyb3VwSWQpPy5pc1N0aWNreShlZGl0b3IpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlzLmVkaXRvcnNPYnNlcnZlci5lZGl0b3JzO1xuXG5cdFx0XHQvLyBTZXF1ZW50aWFsXG5cdFx0XHRjYXNlIEVkaXRvcnNPcmRlci5TRVFVRU5USUFMOiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvcnM6IElFZGl0b3JJZGVudGlmaWVyW10gPSBbXTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdldEdyb3VwcyhHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0UpKSB7XG5cdFx0XHRcdFx0ZWRpdG9ycy5wdXNoKC4uLmdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwsIG9wdGlvbnMpLm1hcChlZGl0b3IgPT4gKHsgZWRpdG9yLCBncm91cElkOiBncm91cC5pZCB9KSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGVkaXRvcnM7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGFjdGl2ZUVkaXRvcigpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWN0aXZlR3JvdXAgPSB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5hY3RpdmVHcm91cDtcblxuXHRcdHJldHVybiBhY3RpdmVHcm91cCA/IGFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvciA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgdmlzaWJsZUVkaXRvclBhbmVzKCk6IElWaXNpYmxlRWRpdG9yUGFuZVtdIHtcblx0XHRyZXR1cm4gY29hbGVzY2UodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5hY3RpdmVFZGl0b3JQYW5lKSk7XG5cdH1cblxuXHRnZXQgdmlzaWJsZVRleHRFZGl0b3JDb250cm9scygpOiBBcnJheTxJQ29kZUVkaXRvciB8IElEaWZmRWRpdG9yPiB7XG5cdFx0cmV0dXJuIHRoaXMuZG9HZXRWaXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzKHRoaXMudmlzaWJsZUVkaXRvclBhbmVzKTtcblx0fVxuXG5cdHByaXZhdGUgZG9HZXRWaXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzKGVkaXRvclBhbmVzOiBJVmlzaWJsZUVkaXRvclBhbmVbXSk6IEFycmF5PElDb2RlRWRpdG9yIHwgSURpZmZFZGl0b3I+IHtcblx0XHRjb25zdCB2aXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzOiBBcnJheTxJQ29kZUVkaXRvciB8IElEaWZmRWRpdG9yPiA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdG9yUGFuZSBvZiBlZGl0b3JQYW5lcykge1xuXHRcdFx0Y29uc3QgY29udHJvbHM6IEFycmF5PElFZGl0b3JDb250cm9sIHwgdW5kZWZpbmVkPiA9IFtdO1xuXHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9yUGFuZSkge1xuXHRcdFx0XHRjb250cm9scy5wdXNoKGVkaXRvclBhbmUuZ2V0UHJpbWFyeUVkaXRvclBhbmUoKT8uZ2V0Q29udHJvbCgpKTtcblx0XHRcdFx0Y29udHJvbHMucHVzaChlZGl0b3JQYW5lLmdldFNlY29uZGFyeUVkaXRvclBhbmUoKT8uZ2V0Q29udHJvbCgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRyb2xzLnB1c2goZWRpdG9yUGFuZS5nZXRDb250cm9sKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGNvbnRyb2wgb2YgY29udHJvbHMpIHtcblx0XHRcdFx0aWYgKGlzQ29kZUVkaXRvcihjb250cm9sKSB8fCBpc0RpZmZFZGl0b3IoY29udHJvbCkpIHtcblx0XHRcdFx0XHR2aXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzLnB1c2goY29udHJvbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdmlzaWJsZVRleHRFZGl0b3JDb250cm9scztcblx0fVxuXG5cdGdldFZpc2libGVUZXh0RWRpdG9yQ29udHJvbHMob3JkZXI6IEVkaXRvcnNPcmRlcik6IHJlYWRvbmx5IChJQ29kZUVkaXRvciB8IElEaWZmRWRpdG9yKVtdIHtcblx0XHRyZXR1cm4gdGhpcy5kb0dldFZpc2libGVUZXh0RWRpdG9yQ29udHJvbHMoY29hbGVzY2UodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ2V0R3JvdXBzKG9yZGVyID09PSBFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCA/IEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSA6IEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5tYXAoZ3JvdXAgPT4gZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZSkpKTtcblx0fVxuXG5cdGdldCB2aXNpYmxlRWRpdG9ycygpOiBFZGl0b3JJbnB1dFtdIHtcblx0XHRyZXR1cm4gY29hbGVzY2UodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5hY3RpdmVFZGl0b3IpKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBvcGVuRWRpdG9yKClcblxuXHRvcGVuRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucywgZ3JvdXA/OiBQcmVmZXJyZWRHcm91cCk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+O1xuXHRvcGVuRWRpdG9yKGVkaXRvcjogSVVudHlwZWRFZGl0b3JJbnB1dCwgZ3JvdXA/OiBQcmVmZXJyZWRHcm91cCk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+O1xuXHRvcGVuRWRpdG9yKGVkaXRvcjogSVJlc291cmNlRWRpdG9ySW5wdXQsIGdyb3VwPzogUHJlZmVycmVkR3JvdXApOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPjtcblx0b3BlbkVkaXRvcihlZGl0b3I6IElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB8IElVbnRpdGxlZFRleHRSZXNvdXJjZUVkaXRvcklucHV0LCBncm91cD86IFByZWZlcnJlZEdyb3VwKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD47XG5cdG9wZW5FZGl0b3IoZWRpdG9yOiBJVGV4dFJlc291cmNlRGlmZkVkaXRvcklucHV0LCBncm91cD86IFByZWZlcnJlZEdyb3VwKTogUHJvbWlzZTxJVGV4dERpZmZFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPjtcblx0b3BlbkVkaXRvcihlZGl0b3I6IElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCwgZ3JvdXA/OiBQcmVmZXJyZWRHcm91cCk6IFByb21pc2U8SVRleHREaWZmRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD47XG5cdG9wZW5FZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQsIG9wdGlvbnNPclByZWZlcnJlZEdyb3VwPzogSUVkaXRvck9wdGlvbnMgfCBQcmVmZXJyZWRHcm91cCwgcHJlZmVycmVkR3JvdXA/OiBQcmVmZXJyZWRHcm91cCk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+O1xuXHRhc3luYyBvcGVuRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0LCBvcHRpb25zT3JQcmVmZXJyZWRHcm91cD86IElFZGl0b3JPcHRpb25zIHwgUHJlZmVycmVkR3JvdXAsIHByZWZlcnJlZEdyb3VwPzogUHJlZmVycmVkR3JvdXApOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IHR5cGVkRWRpdG9yOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgb3B0aW9ucyA9IGlzRWRpdG9ySW5wdXQoZWRpdG9yKSA/IG9wdGlvbnNPclByZWZlcnJlZEdyb3VwIGFzIElFZGl0b3JPcHRpb25zIDogZWRpdG9yLm9wdGlvbnM7XG5cdFx0bGV0IGdyb3VwOiBJRWRpdG9yR3JvdXAgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAoaXNQcmVmZXJyZWRHcm91cChvcHRpb25zT3JQcmVmZXJyZWRHcm91cCkpIHtcblx0XHRcdHByZWZlcnJlZEdyb3VwID0gb3B0aW9uc09yUHJlZmVycmVkR3JvdXA7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSBvdmVycmlkZSB1bmxlc3MgZGlzYWJsZWRcblx0XHRpZiAoIWlzRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRFZGl0b3IgPSBhd2FpdCB0aGlzLmVkaXRvclJlc29sdmVyU2VydmljZS5yZXNvbHZlRWRpdG9yKGVkaXRvciwgcHJlZmVycmVkR3JvdXApO1xuXG5cdFx0XHRpZiAocmVzb2x2ZWRFZGl0b3IgPT09IFJlc29sdmVkU3RhdHVzLkFCT1JUKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gc2tpcCBlZGl0b3IgaWYgb3ZlcnJpZGUgaXMgYWJvcnRlZFxuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSByZXNvbHZlZCBhbiBlZGl0b3IgdG8gdXNlXG5cdFx0XHRpZiAoaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zQW5kR3JvdXAocmVzb2x2ZWRFZGl0b3IpKSB7XG5cdFx0XHRcdHR5cGVkRWRpdG9yID0gcmVzb2x2ZWRFZGl0b3IuZWRpdG9yO1xuXHRcdFx0XHRvcHRpb25zID0gcmVzb2x2ZWRFZGl0b3Iub3B0aW9ucztcblx0XHRcdFx0Z3JvdXAgPSByZXNvbHZlZEVkaXRvci5ncm91cDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPdmVycmlkZSBpcyBkaXNhYmxlZCBvciBkaWQgbm90IGFwcGx5OiBmYWxsYmFjayB0byBkZWZhdWx0XG5cdFx0aWYgKCF0eXBlZEVkaXRvcikge1xuXHRcdFx0dHlwZWRFZGl0b3IgPSBpc0VkaXRvcklucHV0KGVkaXRvcikgPyBlZGl0b3IgOiBhd2FpdCB0aGlzLnRleHRFZGl0b3JTZXJ2aWNlLnJlc29sdmVUZXh0RWRpdG9yKGVkaXRvcik7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgZ3JvdXAgc3RpbGwgaXNuJ3QgZGVmaW5lZCBiZWNhdXNlIG9mIGEgZGlzYWJsZWQgb3ZlcnJpZGUgd2UgcmVzb2x2ZSBpdFxuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdGxldCBhY3RpdmF0aW9uOiBFZGl0b3JBY3RpdmF0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgZmluZEdyb3VwUmVzdWx0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmaW5kR3JvdXAsIHsgZWRpdG9yOiB0eXBlZEVkaXRvciwgb3B0aW9ucyB9LCBwcmVmZXJyZWRHcm91cCk7XG5cdFx0XHRpZiAoZmluZEdyb3VwUmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSkge1xuXHRcdFx0XHQoW2dyb3VwLCBhY3RpdmF0aW9uXSA9IGF3YWl0IGZpbmRHcm91cFJlc3VsdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQoW2dyb3VwLCBhY3RpdmF0aW9uXSA9IGZpbmRHcm91cFJlc3VsdCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1peGluIGVkaXRvciBncm91cCBhY3RpdmF0aW9uIGlmIHJldHVybmVkXG5cdFx0XHRpZiAoYWN0aXZhdGlvbikge1xuXHRcdFx0XHRvcHRpb25zID0geyAuLi5vcHRpb25zLCBhY3RpdmF0aW9uIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTW9kYWwgZ3JvdXA6IG92ZXJyaWRlIGBwcmVzZXJ2ZUZvY3VzYCB0byBtb3ZlIGZvY3VzIGludG8gdGhlIG1vZGFsIGJlY2F1c2UgdGhlcmUgaXMgbm90aGluZyB0byBwcmVzZXJ2ZSBpZiB0aGlzIGlzIHRoZSBmaXJzdCBtb2RhbCBlZGl0b3Jcblx0XHRpZiAoXG5cdFx0XHRvcHRpb25zPy5wcmVzZXJ2ZUZvY3VzICYmXG5cdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVNb2RhbEVkaXRvclBhcnQ/Lmdyb3Vwcy5zb21lKG1vZGFsR3JvdXAgPT4gbW9kYWxHcm91cC5pZCA9PT0gZ3JvdXAuaWQpICYmXG5cdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVNb2RhbEVkaXRvclBhcnQuY291bnQgPT09IDEgJiZcblx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZU1vZGFsRWRpdG9yUGFydC5ncm91cHNbMF0uaXNFbXB0eVxuXHRcdCkge1xuXHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgcHJlc2VydmVGb2N1czogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ3JvdXAub3BlbkVkaXRvcih0eXBlZEVkaXRvciwgb3B0aW9ucyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gb3BlbkVkaXRvcnMoKVxuXG5cdG9wZW5FZGl0b3JzKGVkaXRvcnM6IEVkaXRvcklucHV0V2l0aE9wdGlvbnNbXSwgZ3JvdXA/OiBQcmVmZXJyZWRHcm91cCwgb3B0aW9ucz86IElPcGVuRWRpdG9yc09wdGlvbnMpOiBQcm9taXNlPElFZGl0b3JQYW5lW10+O1xuXHRvcGVuRWRpdG9ycyhlZGl0b3JzOiBJVW50eXBlZEVkaXRvcklucHV0W10sIGdyb3VwPzogUHJlZmVycmVkR3JvdXAsIG9wdGlvbnM/OiBJT3BlbkVkaXRvcnNPcHRpb25zKTogUHJvbWlzZTxJRWRpdG9yUGFuZVtdPjtcblx0b3BlbkVkaXRvcnMoZWRpdG9yczogQXJyYXk8RWRpdG9ySW5wdXRXaXRoT3B0aW9ucyB8IElVbnR5cGVkRWRpdG9ySW5wdXQ+LCBncm91cD86IFByZWZlcnJlZEdyb3VwLCBvcHRpb25zPzogSU9wZW5FZGl0b3JzT3B0aW9ucyk6IFByb21pc2U8SUVkaXRvclBhbmVbXT47XG5cdGFzeW5jIG9wZW5FZGl0b3JzKGVkaXRvcnM6IEFycmF5PEVkaXRvcklucHV0V2l0aE9wdGlvbnMgfCBJVW50eXBlZEVkaXRvcklucHV0PiwgcHJlZmVycmVkR3JvdXA/OiBQcmVmZXJyZWRHcm91cCwgb3B0aW9ucz86IElPcGVuRWRpdG9yc09wdGlvbnMpOiBQcm9taXNlPElFZGl0b3JQYW5lW10+IHtcblxuXHRcdC8vIFBhc3MgYWxsIGVkaXRvcnMgdG8gdHJ1c3Qgc2VydmljZSB0byBkZXRlcm1pbmUgaWZcblx0XHQvLyB3ZSBzaG91bGQgcHJvY2VlZCB3aXRoIG9wZW5pbmcgdGhlIGVkaXRvcnMgaWYgd2Vcblx0XHQvLyBhcmUgYXNrZWQgdG8gdmFsaWRhdGUgdHJ1c3QuXG5cdFx0aWYgKG9wdGlvbnM/LnZhbGlkYXRlVHJ1c3QpIHtcblx0XHRcdGNvbnN0IGVkaXRvcnNUcnVzdGVkID0gYXdhaXQgdGhpcy5oYW5kbGVXb3Jrc3BhY2VUcnVzdChlZGl0b3JzKTtcblx0XHRcdGlmICghZWRpdG9yc1RydXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpbmQgdGFyZ2V0IGdyb3VwcyBmb3IgZWRpdG9ycyB0byBvcGVuXG5cdFx0Y29uc3QgbWFwR3JvdXBUb1R5cGVkRWRpdG9ycyA9IG5ldyBNYXA8SUVkaXRvckdyb3VwLCBBcnJheTxFZGl0b3JJbnB1dFdpdGhPcHRpb25zPj4oKTtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JzKSB7XG5cdFx0XHRsZXQgdHlwZWRFZGl0b3I6IEVkaXRvcklucHV0V2l0aE9wdGlvbnMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgZ3JvdXA6IElFZGl0b3JHcm91cCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gUmVzb2x2ZSBvdmVycmlkZSB1bmxlc3MgZGlzYWJsZWRcblx0XHRcdGlmICghaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zKGVkaXRvcikpIHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRFZGl0b3IgPSBhd2FpdCB0aGlzLmVkaXRvclJlc29sdmVyU2VydmljZS5yZXNvbHZlRWRpdG9yKGVkaXRvciwgcHJlZmVycmVkR3JvdXApO1xuXG5cdFx0XHRcdGlmIChyZXNvbHZlZEVkaXRvciA9PT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQpIHtcblx0XHRcdFx0XHRjb250aW51ZTsgLy8gc2tpcCBlZGl0b3IgaWYgb3ZlcnJpZGUgaXMgYWJvcnRlZFxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gV2UgcmVzb2x2ZWQgYW4gZWRpdG9yIHRvIHVzZVxuXHRcdFx0XHRpZiAoaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zQW5kR3JvdXAocmVzb2x2ZWRFZGl0b3IpKSB7XG5cdFx0XHRcdFx0dHlwZWRFZGl0b3IgPSByZXNvbHZlZEVkaXRvcjtcblx0XHRcdFx0XHRncm91cCA9IHJlc29sdmVkRWRpdG9yLmdyb3VwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE92ZXJyaWRlIGlzIGRpc2FibGVkIG9yIGRpZCBub3QgYXBwbHk6IGZhbGxiYWNrIHRvIGRlZmF1bHRcblx0XHRcdGlmICghdHlwZWRFZGl0b3IpIHtcblx0XHRcdFx0dHlwZWRFZGl0b3IgPSBpc0VkaXRvcklucHV0V2l0aE9wdGlvbnMoZWRpdG9yKSA/IGVkaXRvciA6IHsgZWRpdG9yOiBhd2FpdCB0aGlzLnRleHRFZGl0b3JTZXJ2aWNlLnJlc29sdmVUZXh0RWRpdG9yKGVkaXRvciksIG9wdGlvbnM6IGVkaXRvci5vcHRpb25zIH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIGdyb3VwIHN0aWxsIGlzbid0IGRlZmluZWQgYmVjYXVzZSBvZiBhIGRpc2FibGVkIG92ZXJyaWRlIHdlIHJlc29sdmUgaXRcblx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0Y29uc3QgZmluZEdyb3VwUmVzdWx0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmaW5kR3JvdXAsIHR5cGVkRWRpdG9yLCBwcmVmZXJyZWRHcm91cCk7XG5cdFx0XHRcdGlmIChmaW5kR3JvdXBSZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG5cdFx0XHRcdFx0KFtncm91cF0gPSBhd2FpdCBmaW5kR3JvdXBSZXN1bHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdChbZ3JvdXBdID0gZmluZEdyb3VwUmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBNb2RhbCBncm91cDogb3ZlcnJpZGUgYHByZXNlcnZlRm9jdXNgIHRvIG1vdmUgZm9jdXMgaW50byB0aGUgbW9kYWwgdGhlcmUgaXMgbm90aGluZyB0byBwcmVzZXJ2ZSBpZiB0aGlzIGlzIHRoZSBmaXJzdCBtb2RhbCBlZGl0b3Jcblx0XHRcdGlmIChcblx0XHRcdFx0dHlwZWRFZGl0b3Iub3B0aW9ucz8ucHJlc2VydmVGb2N1cyAmJlxuXHRcdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVNb2RhbEVkaXRvclBhcnQ/Lmdyb3Vwcy5zb21lKG1vZGFsR3JvdXAgPT4gbW9kYWxHcm91cC5pZCA9PT0gZ3JvdXAuaWQpICYmXG5cdFx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZU1vZGFsRWRpdG9yUGFydC5jb3VudCA9PT0gMSAmJlxuXHRcdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVNb2RhbEVkaXRvclBhcnQuZ3JvdXBzWzBdLmlzRW1wdHlcblx0XHRcdCkge1xuXHRcdFx0XHR0eXBlZEVkaXRvciA9IHsgLi4udHlwZWRFZGl0b3IsIG9wdGlvbnM6IHsgLi4udHlwZWRFZGl0b3Iub3B0aW9ucywgcHJlc2VydmVGb2N1czogZmFsc2UgfSB9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVcGRhdGUgbWFwIG9mIGdyb3VwcyB0byBlZGl0b3JzXG5cdFx0XHRsZXQgdGFyZ2V0R3JvdXBFZGl0b3JzID0gbWFwR3JvdXBUb1R5cGVkRWRpdG9ycy5nZXQoZ3JvdXApO1xuXHRcdFx0aWYgKCF0YXJnZXRHcm91cEVkaXRvcnMpIHtcblx0XHRcdFx0dGFyZ2V0R3JvdXBFZGl0b3JzID0gW107XG5cdFx0XHRcdG1hcEdyb3VwVG9UeXBlZEVkaXRvcnMuc2V0KGdyb3VwLCB0YXJnZXRHcm91cEVkaXRvcnMpO1xuXHRcdFx0fVxuXG5cdFx0XHR0YXJnZXRHcm91cEVkaXRvcnMucHVzaCh0eXBlZEVkaXRvcik7XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiBpbiB0YXJnZXQgZ3JvdXBzXG5cdFx0Y29uc3QgcmVzdWx0OiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPltdID0gW107XG5cdFx0Zm9yIChjb25zdCBbZ3JvdXAsIGVkaXRvcnNdIG9mIG1hcEdyb3VwVG9UeXBlZEVkaXRvcnMpIHtcblx0XHRcdHJlc3VsdC5wdXNoKGdyb3VwLm9wZW5FZGl0b3JzKGVkaXRvcnMpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29hbGVzY2UoYXdhaXQgUHJvbWlzZXMuc2V0dGxlZChyZXN1bHQpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlV29ya3NwYWNlVHJ1c3QoZWRpdG9yczogQXJyYXk8RWRpdG9ySW5wdXRXaXRoT3B0aW9ucyB8IElVbnR5cGVkRWRpdG9ySW5wdXQ+KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgeyByZXNvdXJjZXMsIGRpZmZNb2RlLCBtZXJnZU1vZGUgfSA9IHRoaXMuZXh0cmFjdEVkaXRvclJlc291cmNlcyhlZGl0b3JzKTtcblxuXHRcdGNvbnN0IHRydXN0UmVzdWx0ID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RPcGVuRmlsZXNUcnVzdChyZXNvdXJjZXMpO1xuXHRcdHN3aXRjaCAodHJ1c3RSZXN1bHQpIHtcblx0XHRcdGNhc2UgV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5PcGVuOlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5PcGVuSW5OZXdXaW5kb3c6XG5cdFx0XHRcdGF3YWl0IHRoaXMuaG9zdFNlcnZpY2Uub3BlbldpbmRvdyhyZXNvdXJjZXMubWFwKHJlc291cmNlID0+ICh7IGZpbGVVcmk6IHJlc291cmNlIH0pKSwgeyBmb3JjZU5ld1dpbmRvdzogdHJ1ZSwgZGlmZk1vZGUsIG1lcmdlTW9kZSB9KTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0Y2FzZSBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLkNhbmNlbDpcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZXh0cmFjdEVkaXRvclJlc291cmNlcyhlZGl0b3JzOiBBcnJheTxFZGl0b3JJbnB1dFdpdGhPcHRpb25zIHwgSVVudHlwZWRFZGl0b3JJbnB1dD4pOiB7IHJlc291cmNlczogVVJJW107IGRpZmZNb2RlPzogYm9vbGVhbjsgbWVyZ2VNb2RlPzogYm9vbGVhbiB9IHtcblx0XHRjb25zdCByZXNvdXJjZXMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRsZXQgZGlmZk1vZGUgPSBmYWxzZTtcblx0XHRsZXQgbWVyZ2VNb2RlID0gZmFsc2U7XG5cblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JzKSB7XG5cblx0XHRcdC8vIFR5cGVkIEVkaXRvclxuXHRcdFx0aWYgKGlzRWRpdG9ySW5wdXRXaXRoT3B0aW9ucyhlZGl0b3IpKSB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShlZGl0b3IuZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkJPVEggfSk7XG5cdFx0XHRcdGlmIChVUkkuaXNVcmkocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0cmVzb3VyY2VzLmFkZChyZXNvdXJjZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0XHRpZiAocmVzb3VyY2UucHJpbWFyeSkge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2VzLmFkZChyZXNvdXJjZS5wcmltYXJ5KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocmVzb3VyY2Uuc2Vjb25kYXJ5KSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZXMuYWRkKHJlc291cmNlLnNlY29uZGFyeSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0ZGlmZk1vZGUgPSBlZGl0b3IuZWRpdG9yIGluc3RhbmNlb2YgRGlmZkVkaXRvcklucHV0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVudHlwZWQgZWRpdG9yXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0aWYgKGlzUmVzb3VyY2VNZXJnZUVkaXRvcklucHV0KGVkaXRvcikpIHtcblx0XHRcdFx0XHRpZiAoVVJJLmlzVXJpKGVkaXRvci5pbnB1dDEpKSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZXMuYWRkKGVkaXRvci5pbnB1dDEucmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChVUkkuaXNVcmkoZWRpdG9yLmlucHV0MikpIHtcblx0XHRcdFx0XHRcdHJlc291cmNlcy5hZGQoZWRpdG9yLmlucHV0Mi5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKFVSSS5pc1VyaShlZGl0b3IuYmFzZSkpIHtcblx0XHRcdFx0XHRcdHJlc291cmNlcy5hZGQoZWRpdG9yLmJhc2UucmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChVUkkuaXNVcmkoZWRpdG9yLnJlc3VsdCkpIHtcblx0XHRcdFx0XHRcdHJlc291cmNlcy5hZGQoZWRpdG9yLnJlc3VsdC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bWVyZ2VNb2RlID0gdHJ1ZTtcblx0XHRcdFx0fSBpZiAoaXNSZXNvdXJjZURpZmZFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cdFx0XHRcdFx0aWYgKFVSSS5pc1VyaShlZGl0b3Iub3JpZ2luYWwucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZXMuYWRkKGVkaXRvci5vcmlnaW5hbC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKFVSSS5pc1VyaShlZGl0b3IubW9kaWZpZWQucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZXMuYWRkKGVkaXRvci5tb2RpZmllZC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0ZGlmZk1vZGUgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzUmVzb3VyY2VFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cdFx0XHRcdFx0cmVzb3VyY2VzLmFkZChlZGl0b3IucmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlczogQXJyYXkuZnJvbShyZXNvdXJjZXMua2V5cygpKSxcblx0XHRcdGRpZmZNb2RlLFxuXHRcdFx0bWVyZ2VNb2RlXG5cdFx0fTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBpc09wZW5lZCgpIC8gaXNWaXNpYmxlKClcblxuXHRpc09wZW5lZChlZGl0b3I6IElSZXNvdXJjZUVkaXRvcklucHV0SWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvcnNPYnNlcnZlci5oYXNFZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKGVkaXRvci5yZXNvdXJjZSksXG5cdFx0XHR0eXBlSWQ6IGVkaXRvci50eXBlSWQsXG5cdFx0XHRlZGl0b3JJZDogZWRpdG9yLmVkaXRvcklkXG5cdFx0fSk7XG5cdH1cblxuXHRpc1Zpc2libGUoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ3JvdXBzKSB7XG5cdFx0XHRpZiAoZ3JvdXAuYWN0aXZlRWRpdG9yPy5tYXRjaGVzKGVkaXRvcikpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIGNsb3NlRWRpdG9yKClcblxuXHRhc3luYyBjbG9zZUVkaXRvcih7IGVkaXRvciwgZ3JvdXBJZCB9OiBJRWRpdG9ySWRlbnRpZmllciwgb3B0aW9ucz86IElDbG9zZUVkaXRvck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdldEdyb3VwKGdyb3VwSWQpO1xuXG5cdFx0YXdhaXQgZ3JvdXA/LmNsb3NlRWRpdG9yKGVkaXRvciwgb3B0aW9ucyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gY2xvc2VFZGl0b3JzKClcblxuXHRhc3luYyBjbG9zZUVkaXRvcnMoZWRpdG9yczogSUVkaXRvcklkZW50aWZpZXJbXSwgb3B0aW9ucz86IElDbG9zZUVkaXRvck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtYXBHcm91cFRvRWRpdG9ycyA9IG5ldyBNYXA8SUVkaXRvckdyb3VwLCBFZGl0b3JJbnB1dFtdPigpO1xuXG5cdFx0Zm9yIChjb25zdCB7IGVkaXRvciwgZ3JvdXBJZCB9IG9mIGVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ2V0R3JvdXAoZ3JvdXBJZCk7XG5cdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZWRpdG9ycyA9IG1hcEdyb3VwVG9FZGl0b3JzLmdldChncm91cCk7XG5cdFx0XHRpZiAoIWVkaXRvcnMpIHtcblx0XHRcdFx0ZWRpdG9ycyA9IFtdO1xuXHRcdFx0XHRtYXBHcm91cFRvRWRpdG9ycy5zZXQoZ3JvdXAsIGVkaXRvcnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRlZGl0b3JzLnB1c2goZWRpdG9yKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFtncm91cCwgZWRpdG9yc10gb2YgbWFwR3JvdXBUb0VkaXRvcnMpIHtcblx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyhlZGl0b3JzLCBvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gZmluZEVkaXRvcnMoKVxuXG5cdGZpbmRFZGl0b3JzKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJRmluZEVkaXRvck9wdGlvbnMpOiByZWFkb25seSBJRWRpdG9ySWRlbnRpZmllcltdO1xuXHRmaW5kRWRpdG9ycyhlZGl0b3I6IElSZXNvdXJjZUVkaXRvcklucHV0SWRlbnRpZmllciwgb3B0aW9ucz86IElGaW5kRWRpdG9yT3B0aW9ucyk6IHJlYWRvbmx5IElFZGl0b3JJZGVudGlmaWVyW107XG5cdGZpbmRFZGl0b3JzKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElGaW5kRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgZ3JvdXA6IElFZGl0b3JHcm91cCB8IEdyb3VwSWRlbnRpZmllcik6IHJlYWRvbmx5IEVkaXRvcklucHV0W107XG5cdGZpbmRFZGl0b3JzKGVkaXRvcjogSVJlc291cmNlRWRpdG9ySW5wdXRJZGVudGlmaWVyLCBvcHRpb25zOiBJRmluZEVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGdyb3VwOiBJRWRpdG9yR3JvdXAgfCBHcm91cElkZW50aWZpZXIpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblx0ZmluZEVkaXRvcnMoYXJnMTogVVJJIHwgSVJlc291cmNlRWRpdG9ySW5wdXRJZGVudGlmaWVyLCBvcHRpb25zOiBJRmluZEVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGFyZzI/OiBJRWRpdG9yR3JvdXAgfCBHcm91cElkZW50aWZpZXIpOiByZWFkb25seSBJRWRpdG9ySWRlbnRpZmllcltdIHwgcmVhZG9ubHkgRWRpdG9ySW5wdXRbXSB8IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkO1xuXHRmaW5kRWRpdG9ycyhhcmcxOiBVUkkgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dElkZW50aWZpZXIsIG9wdGlvbnM6IElGaW5kRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgYXJnMj86IElFZGl0b3JHcm91cCB8IEdyb3VwSWRlbnRpZmllcik6IHJlYWRvbmx5IElFZGl0b3JJZGVudGlmaWVyW10gfCByZWFkb25seSBFZGl0b3JJbnB1dFtdIHwgRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmlzVXJpKGFyZzEpID8gYXJnMSA6IGFyZzEucmVzb3VyY2U7XG5cdFx0Y29uc3QgdHlwZUlkID0gVVJJLmlzVXJpKGFyZzEpID8gdW5kZWZpbmVkIDogYXJnMS50eXBlSWQ7XG5cblx0XHQvLyBEbyBhIHF1aWNrIGNoZWNrIGZvciB0aGUgcmVzb3VyY2UgdmlhIHRoZSBlZGl0b3Igb2JzZXJ2ZXJcblx0XHQvLyB3aGljaCBpcyBhIHZlcnkgZWZmaWNpZW50IHdheSB0byBmaW5kIGFuIGVkaXRvciBieSByZXNvdXJjZS5cblx0XHQvLyBIb3dldmVyLCB3ZSBjYW4gb25seSBkbyB0aGF0IHVubGVzcyB3ZSBhcmUgYXNrZWQgdG8gZmluZCBhblxuXHRcdC8vIGVkaXRvciBvbiB0aGUgc2Vjb25kYXJ5IHNpZGUgb2YgYSBzaWRlIGJ5IHNpZGUgZWRpdG9yLCBiZWNhdXNlXG5cdFx0Ly8gdGhlIGVkaXRvciBvYnNlcnZlciBwcm92aWRlcyBmYXN0IGxvb2t1cHMgb25seSBmb3IgcHJpbWFyeVxuXHRcdC8vIGVkaXRvcnMuXG5cdFx0aWYgKG9wdGlvbnM/LnN1cHBvcnRTaWRlQnlTaWRlICE9PSBTaWRlQnlTaWRlRWRpdG9yLkFOWSAmJiBvcHRpb25zPy5zdXBwb3J0U2lkZUJ5U2lkZSAhPT0gU2lkZUJ5U2lkZUVkaXRvci5TRUNPTkRBUlkpIHtcblx0XHRcdGlmICghdGhpcy5lZGl0b3JzT2JzZXJ2ZXIuaGFzRWRpdG9ycyhyZXNvdXJjZSkpIHtcblx0XHRcdFx0aWYgKFVSSS5pc1VyaShhcmcxKSB8fCBpc1VuZGVmaW5lZChhcmcyKSkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2VhcmNoIG9ubHkgaW4gc3BlY2lmaWMgZ3JvdXBcblx0XHRpZiAoIWlzVW5kZWZpbmVkKGFyZzIpKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRHcm91cCA9IHR5cGVvZiBhcmcyID09PSAnbnVtYmVyJyA/IHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdldEdyb3VwKGFyZzIpIDogYXJnMjtcblxuXHRcdFx0Ly8gUmVzb3VyY2UgcHJvdmlkZWQ6IHJlc3VsdCBpcyBhbiBhcnJheVxuXHRcdFx0aWYgKFVSSS5pc1VyaShhcmcxKSkge1xuXHRcdFx0XHRpZiAoIXRhcmdldEdyb3VwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHRhcmdldEdyb3VwLmZpbmRFZGl0b3JzKHJlc291cmNlLCBvcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRWRpdG9yIGlkZW50aWZpZXIgcHJvdmlkZWQsIHJlc3VsdCBpcyBzaW5nbGVcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRpZiAoIXRhcmdldEdyb3VwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGVkaXRvcnMgPSB0YXJnZXRHcm91cC5maW5kRWRpdG9ycyhyZXNvdXJjZSwgb3B0aW9ucyk7XG5cdFx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0XHRpZiAoZWRpdG9yLnR5cGVJZCA9PT0gdHlwZUlkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWRpdG9yO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2VhcmNoIGFjcm9zcyBhbGwgZ3JvdXBzIGluIE1SVSBvcmRlclxuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJRWRpdG9ySWRlbnRpZmllcltdID0gW107XG5cblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ2V0R3JvdXBzKG9wdGlvbnM/Lm9yZGVyID09PSBFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCA/IEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSA6IEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKSkge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JzOiBFZGl0b3JJbnB1dFtdID0gW107XG5cblx0XHRcdFx0Ly8gUmVzb3VyY2UgcHJvdmlkZWQ6IHJlc3VsdCBpcyBhbiBhcnJheVxuXHRcdFx0XHRpZiAoVVJJLmlzVXJpKGFyZzEpKSB7XG5cdFx0XHRcdFx0ZWRpdG9ycy5wdXNoKC4uLnRoaXMuZmluZEVkaXRvcnMoYXJnMSwgb3B0aW9ucywgZ3JvdXApKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEVkaXRvciBpZGVudGlmaWVyIHByb3ZpZGVkLCByZXN1bHQgaXMgc2luZ2xlXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuZmluZEVkaXRvcnMoYXJnMSwgb3B0aW9ucywgZ3JvdXApO1xuXHRcdFx0XHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdFx0XHRcdGVkaXRvcnMucHVzaChlZGl0b3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlc3VsdC5wdXNoKC4uLmVkaXRvcnMubWFwKGVkaXRvciA9PiAoeyBlZGl0b3IsIGdyb3VwSWQ6IGdyb3VwLmlkIH0pKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIHJlcGxhY2VFZGl0b3JzKClcblxuXHRhc3luYyByZXBsYWNlRWRpdG9ycyhyZXBsYWNlbWVudHM6IElVbnR5cGVkRWRpdG9yUmVwbGFjZW1lbnRbXSwgZ3JvdXA6IElFZGl0b3JHcm91cCB8IEdyb3VwSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD47XG5cdGFzeW5jIHJlcGxhY2VFZGl0b3JzKHJlcGxhY2VtZW50czogSUVkaXRvclJlcGxhY2VtZW50W10sIGdyb3VwOiBJRWRpdG9yR3JvdXAgfCBHcm91cElkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+O1xuXHRhc3luYyByZXBsYWNlRWRpdG9ycyhyZXBsYWNlbWVudHM6IEFycmF5PElFZGl0b3JSZXBsYWNlbWVudCB8IElVbnR5cGVkRWRpdG9yUmVwbGFjZW1lbnQ+LCBncm91cDogSUVkaXRvckdyb3VwIHwgR3JvdXBJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGFyZ2V0R3JvdXAgPSB0eXBlb2YgZ3JvdXAgPT09ICdudW1iZXInID8gdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ2V0R3JvdXAoZ3JvdXApIDogZ3JvdXA7XG5cblx0XHQvLyBDb252ZXJ0IGFsbCByZXBsYWNlbWVudHMgdG8gdHlwZWQgZWRpdG9ycyB1bmxlc3MgYWxyZWFkeVxuXHRcdC8vIHR5cGVkIGFuZCBoYW5kbGUgb3ZlcnJpZGVzIHByb3Blcmx5LlxuXHRcdGNvbnN0IHR5cGVkUmVwbGFjZW1lbnRzOiBJRWRpdG9yUmVwbGFjZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRsZXQgdHlwZWRSZXBsYWNlbWVudDogSUVkaXRvclJlcGxhY2VtZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBSZXNvbHZlIG92ZXJyaWRlIHVubGVzcyBkaXNhYmxlZFxuXHRcdFx0aWYgKCFpc0VkaXRvcklucHV0KHJlcGxhY2VtZW50LnJlcGxhY2VtZW50KSkge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZEVkaXRvciA9IGF3YWl0IHRoaXMuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVFZGl0b3IoXG5cdFx0XHRcdFx0cmVwbGFjZW1lbnQucmVwbGFjZW1lbnQsXG5cdFx0XHRcdFx0dGFyZ2V0R3JvdXBcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRpZiAocmVzb2x2ZWRFZGl0b3IgPT09IFJlc29sdmVkU3RhdHVzLkFCT1JUKSB7XG5cdFx0XHRcdFx0Y29udGludWU7IC8vIHNraXAgZWRpdG9yIGlmIG92ZXJyaWRlIGlzIGFib3J0ZWRcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFdlIHJlc29sdmVkIGFuIGVkaXRvciB0byB1c2Vcblx0XHRcdFx0aWYgKGlzRWRpdG9ySW5wdXRXaXRoT3B0aW9uc0FuZEdyb3VwKHJlc29sdmVkRWRpdG9yKSkge1xuXHRcdFx0XHRcdHR5cGVkUmVwbGFjZW1lbnQgPSB7XG5cdFx0XHRcdFx0XHRlZGl0b3I6IHJlcGxhY2VtZW50LmVkaXRvcixcblx0XHRcdFx0XHRcdHJlcGxhY2VtZW50OiByZXNvbHZlZEVkaXRvci5lZGl0b3IsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiByZXNvbHZlZEVkaXRvci5vcHRpb25zLFxuXHRcdFx0XHRcdFx0Zm9yY2VSZXBsYWNlRGlydHk6IHJlcGxhY2VtZW50LmZvcmNlUmVwbGFjZURpcnR5XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdmVycmlkZSBpcyBkaXNhYmxlZCBvciBkaWQgbm90IGFwcGx5OiBmYWxsYmFjayB0byBkZWZhdWx0XG5cdFx0XHRpZiAoIXR5cGVkUmVwbGFjZW1lbnQpIHtcblx0XHRcdFx0dHlwZWRSZXBsYWNlbWVudCA9IHtcblx0XHRcdFx0XHRlZGl0b3I6IHJlcGxhY2VtZW50LmVkaXRvcixcblx0XHRcdFx0XHRyZXBsYWNlbWVudDogaXNFZGl0b3JSZXBsYWNlbWVudChyZXBsYWNlbWVudCkgPyByZXBsYWNlbWVudC5yZXBsYWNlbWVudCA6IGF3YWl0IHRoaXMudGV4dEVkaXRvclNlcnZpY2UucmVzb2x2ZVRleHRFZGl0b3IocmVwbGFjZW1lbnQucmVwbGFjZW1lbnQpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IGlzRWRpdG9yUmVwbGFjZW1lbnQocmVwbGFjZW1lbnQpID8gcmVwbGFjZW1lbnQub3B0aW9ucyA6IHJlcGxhY2VtZW50LnJlcGxhY2VtZW50Lm9wdGlvbnMsXG5cdFx0XHRcdFx0Zm9yY2VSZXBsYWNlRGlydHk6IHJlcGxhY2VtZW50LmZvcmNlUmVwbGFjZURpcnR5XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHR5cGVkUmVwbGFjZW1lbnRzLnB1c2godHlwZWRSZXBsYWNlbWVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRhcmdldEdyb3VwPy5yZXBsYWNlRWRpdG9ycyh0eXBlZFJlcGxhY2VtZW50cyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gc2F2ZS9yZXZlcnRcblxuXHRhc3luYyBzYXZlKGVkaXRvcnM6IElFZGl0b3JJZGVudGlmaWVyIHwgSUVkaXRvcklkZW50aWZpZXJbXSwgb3B0aW9ucz86IElTYXZlRWRpdG9yc09wdGlvbnMpOiBQcm9taXNlPElTYXZlRWRpdG9yc1Jlc3VsdD4ge1xuXG5cdFx0Ly8gQ29udmVydCB0byBhcnJheVxuXHRcdGlmICghQXJyYXkuaXNBcnJheShlZGl0b3JzKSkge1xuXHRcdFx0ZWRpdG9ycyA9IFtlZGl0b3JzXTtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gbm90IHNhdmUgdGhlIHNhbWUgZWRpdG9yIG11bHRpcGxlIHRpbWVzXG5cdFx0Ly8gYnkgdXNpbmcgdGhlIGBtYXRjaGVzKClgIG1ldGhvZCB0byBmaW5kIGR1cGxpY2F0ZXNcblx0XHRjb25zdCB1bmlxdWVFZGl0b3JzID0gdGhpcy5nZXRVbmlxdWVFZGl0b3JzKGVkaXRvcnMpO1xuXG5cdFx0Ly8gU3BsaXQgZWRpdG9ycyB1cCBpbnRvIGEgYnVja2V0IHRoYXQgaXMgc2F2ZWQgaW4gcGFyYWxsZWxcblx0XHQvLyBhbmQgc2VxdWVudGlhbGx5LiBVbmxlc3MgXCJTYXZlIEFzXCIsIGFsbCBub24tdW50aXRsZWQgZWRpdG9yc1xuXHRcdC8vIGNhbiBiZSBzYXZlZCBpbiBwYXJhbGxlbCB0byBzcGVlZCB1cCB0aGUgb3BlcmF0aW9uLiBSZW1haW5pbmdcblx0XHQvLyBlZGl0b3JzIGFyZSBwb3RlbnRpYWxseSBicmluZ2luZyB1cCBzb21lIFVJIGFuZCB0aHVzIHJ1blxuXHRcdC8vIHNlcXVlbnRpYWxseS5cblx0XHRjb25zdCBlZGl0b3JzVG9TYXZlUGFyYWxsZWw6IElFZGl0b3JJZGVudGlmaWVyW10gPSBbXTtcblx0XHRjb25zdCBlZGl0b3JzVG9TYXZlU2VxdWVudGlhbGx5OiBJRWRpdG9ySWRlbnRpZmllcltdID0gW107XG5cdFx0aWYgKG9wdGlvbnM/LnNhdmVBcykge1xuXHRcdFx0ZWRpdG9yc1RvU2F2ZVNlcXVlbnRpYWxseS5wdXNoKC4uLnVuaXF1ZUVkaXRvcnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IHsgZ3JvdXBJZCwgZWRpdG9yIH0gb2YgdW5pcXVlRWRpdG9ycykge1xuXHRcdFx0XHRpZiAoZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpKSB7XG5cdFx0XHRcdFx0ZWRpdG9yc1RvU2F2ZVNlcXVlbnRpYWxseS5wdXNoKHsgZ3JvdXBJZCwgZWRpdG9yIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVkaXRvcnNUb1NhdmVQYXJhbGxlbC5wdXNoKHsgZ3JvdXBJZCwgZWRpdG9yIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRWRpdG9ycyB0byBzYXZlIGluIHBhcmFsbGVsXG5cdFx0Y29uc3Qgc2F2ZVJlc3VsdHMgPSBhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGVkaXRvcnNUb1NhdmVQYXJhbGxlbC5tYXAoKHsgZ3JvdXBJZCwgZWRpdG9yIH0pID0+IHtcblxuXHRcdFx0Ly8gVXNlIHNhdmUgYXMgYSBoaW50IHRvIHBpbiB0aGUgZWRpdG9yIGlmIHVzZWQgZXhwbGljaXRseVxuXHRcdFx0aWYgKG9wdGlvbnM/LnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5FWFBMSUNJVCkge1xuXHRcdFx0XHR0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5nZXRHcm91cChncm91cElkKT8ucGluRWRpdG9yKGVkaXRvcik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNhdmVcblx0XHRcdHJldHVybiBlZGl0b3Iuc2F2ZShncm91cElkLCBvcHRpb25zKTtcblx0XHR9KSk7XG5cblx0XHQvLyBFZGl0b3JzIHRvIHNhdmUgc2VxdWVudGlhbGx5XG5cdFx0Zm9yIChjb25zdCB7IGdyb3VwSWQsIGVkaXRvciB9IG9mIGVkaXRvcnNUb1NhdmVTZXF1ZW50aWFsbHkpIHtcblx0XHRcdGlmIChlZGl0b3IuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBtaWdodCBoYXZlIGJlZW4gZGlzcG9zZWQgZnJvbSB0aGUgc2F2ZSBhbHJlYWR5XG5cdFx0XHR9XG5cblx0XHRcdC8vIFByZXNlcnZlIHZpZXcgc3RhdGUgYnkgb3BlbmluZyB0aGUgZWRpdG9yIGZpcnN0IGlmIHRoZSBlZGl0b3Jcblx0XHRcdC8vIGlzIHVudGl0bGVkIG9yIHdlIFwiU2F2ZSBBc1wiLiBUaGlzIGFsc28gYWxsb3dzIHRoZSB1c2VyIHRvIHJldmlld1xuXHRcdFx0Ly8gdGhlIGNvbnRlbnRzIG9mIHRoZSBlZGl0b3IgYmVmb3JlIG1ha2luZyBhIGRlY2lzaW9uLlxuXHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGF3YWl0IHRoaXMub3BlbkVkaXRvcihlZGl0b3IsIGdyb3VwSWQpO1xuXHRcdFx0Y29uc3QgZWRpdG9yT3B0aW9uczogSUVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRcdHBpbm5lZDogdHJ1ZSxcblx0XHRcdFx0dmlld1N0YXRlOiBlZGl0b3JQYW5lPy5nZXRWaWV3U3RhdGUoKVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gb3B0aW9ucz8uc2F2ZUFzID8gYXdhaXQgZWRpdG9yLnNhdmVBcyhncm91cElkLCBvcHRpb25zKSA6IGF3YWl0IGVkaXRvci5zYXZlKGdyb3VwSWQsIG9wdGlvbnMpO1xuXHRcdFx0c2F2ZVJlc3VsdHMucHVzaChyZXN1bHQpO1xuXG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRicmVhazsgLy8gZmFpbGVkIG9yIGNhbmNlbGxlZCwgYWJvcnRcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVwbGFjZSBlZGl0b3IgcHJlc2VydmluZyB2aWV3c3RhdGUgKGVpdGhlciBhY3Jvc3MgYWxsIGdyb3VwcyBvclxuXHRcdFx0Ly8gb25seSBzZWxlY3RlZCBncm91cCkgaWYgdGhlIHJlc3VsdGluZyBlZGl0b3IgaXMgZGlmZmVyZW50IGZyb20gdGhlXG5cdFx0XHQvLyBjdXJyZW50IG9uZS5cblx0XHRcdGlmICghZWRpdG9yLm1hdGNoZXMocmVzdWx0KSkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRHcm91cHMgPSBlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZCkgPyB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmlkKSAvKiB1bnRpdGxlZCByZXBsYWNlcyBhY3Jvc3MgYWxsIGdyb3VwcyAqLyA6IFtncm91cElkXTtcblx0XHRcdFx0Zm9yIChjb25zdCB0YXJnZXRHcm91cCBvZiB0YXJnZXRHcm91cHMpIHtcblx0XHRcdFx0XHRpZiAocmVzdWx0IGluc3RhbmNlb2YgRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucmVwbGFjZUVkaXRvcnMoW3sgZWRpdG9yLCByZXBsYWNlbWVudDogcmVzdWx0LCBvcHRpb25zOiBlZGl0b3JPcHRpb25zIH1dLCB0YXJnZXRHcm91cCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucmVwbGFjZUVkaXRvcnMoW3sgZWRpdG9yLCByZXBsYWNlbWVudDogeyAuLi5yZXN1bHQsIG9wdGlvbnM6IGVkaXRvck9wdGlvbnMgfSB9XSwgdGFyZ2V0R3JvdXApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3VjY2Vzczogc2F2ZVJlc3VsdHMuZXZlcnkocmVzdWx0ID0+ICEhcmVzdWx0KSxcblx0XHRcdGVkaXRvcnM6IGNvYWxlc2NlKHNhdmVSZXN1bHRzKVxuXHRcdH07XG5cdH1cblxuXHRzYXZlQWxsKG9wdGlvbnM/OiBJU2F2ZUFsbEVkaXRvcnNPcHRpb25zKTogUHJvbWlzZTxJU2F2ZUVkaXRvcnNSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zYXZlKHRoaXMuZ2V0QWxsTW9kaWZpZWRFZGl0b3JzKG9wdGlvbnMpLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHJldmVydChlZGl0b3JzOiBJRWRpdG9ySWRlbnRpZmllciB8IElFZGl0b3JJZGVudGlmaWVyW10sIG9wdGlvbnM/OiBJUmV2ZXJ0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Ly8gQ29udmVydCB0byBhcnJheVxuXHRcdGlmICghQXJyYXkuaXNBcnJheShlZGl0b3JzKSkge1xuXHRcdFx0ZWRpdG9ycyA9IFtlZGl0b3JzXTtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gbm90IHJldmVydCB0aGUgc2FtZSBlZGl0b3IgbXVsdGlwbGUgdGltZXNcblx0XHQvLyBieSB1c2luZyB0aGUgYG1hdGNoZXMoKWAgbWV0aG9kIHRvIGZpbmQgZHVwbGljYXRlc1xuXHRcdGNvbnN0IHVuaXF1ZUVkaXRvcnMgPSB0aGlzLmdldFVuaXF1ZUVkaXRvcnMoZWRpdG9ycyk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKHVuaXF1ZUVkaXRvcnMubWFwKGFzeW5jICh7IGdyb3VwSWQsIGVkaXRvciB9KSA9PiB7XG5cblx0XHRcdC8vIFVzZSByZXZlcnQgYXMgYSBoaW50IHRvIHBpbiB0aGUgZWRpdG9yXG5cdFx0XHR0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5nZXRHcm91cChncm91cElkKT8ucGluRWRpdG9yKGVkaXRvcik7XG5cblx0XHRcdHJldHVybiBlZGl0b3IucmV2ZXJ0KGdyb3VwSWQsIG9wdGlvbnMpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiAhdW5pcXVlRWRpdG9ycy5zb21lKCh7IGVkaXRvciB9KSA9PiBlZGl0b3IuaXNEaXJ0eSgpKTtcblx0fVxuXG5cdGFzeW5jIHJldmVydEFsbChvcHRpb25zPzogSVJldmVydEFsbEVkaXRvcnNPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMucmV2ZXJ0KHRoaXMuZ2V0QWxsTW9kaWZpZWRFZGl0b3JzKG9wdGlvbnMpLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWxsTW9kaWZpZWRFZGl0b3JzKG9wdGlvbnM/OiBJQmFzZVNhdmVSZXZlcnRBbGxFZGl0b3JPcHRpb25zKTogSUVkaXRvcklkZW50aWZpZXJbXSB7XG5cdFx0Y29uc3QgZWRpdG9yczogSUVkaXRvcklkZW50aWZpZXJbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkpIHtcblx0XHRcdFx0aWYgKCFlZGl0b3IuaXNNb2RpZmllZCgpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoKHR5cGVvZiBvcHRpb25zPy5pbmNsdWRlVW50aXRsZWQgPT09ICdib29sZWFuJyB8fCAhb3B0aW9ucz8uaW5jbHVkZVVudGl0bGVkPy5pbmNsdWRlU2NyYXRjaHBhZClcblx0XHRcdFx0XHQmJiBlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TY3JhdGNocGFkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFvcHRpb25zPy5pbmNsdWRlVW50aXRsZWQgJiYgZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAob3B0aW9ucz8uZXhjbHVkZVN0aWNreSAmJiBncm91cC5pc1N0aWNreShlZGl0b3IpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlZGl0b3JzLnB1c2goeyBncm91cElkOiBncm91cC5pZCwgZWRpdG9yIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3JzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRVbmlxdWVFZGl0b3JzKGVkaXRvcnM6IElFZGl0b3JJZGVudGlmaWVyW10pOiBJRWRpdG9ySWRlbnRpZmllcltdIHtcblx0XHRjb25zdCB1bmlxdWVFZGl0b3JzOiBJRWRpdG9ySWRlbnRpZmllcltdID0gW107XG5cdFx0Zm9yIChjb25zdCB7IGVkaXRvciwgZ3JvdXBJZCB9IG9mIGVkaXRvcnMpIHtcblx0XHRcdGlmICh1bmlxdWVFZGl0b3JzLnNvbWUodW5pcXVlRWRpdG9yID0+IHVuaXF1ZUVkaXRvci5lZGl0b3IubWF0Y2hlcyhlZGl0b3IpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dW5pcXVlRWRpdG9ycy5wdXNoKHsgZWRpdG9yLCBncm91cElkIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmlxdWVFZGl0b3JzO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHQvLyBEaXNwb3NlIHJlbWFpbmluZyB3YXRjaGVycyBpZiBhbnlcblx0XHR0aGlzLmFjdGl2ZU91dE9mV29ya3NwYWNlV2F0Y2hlcnMuZm9yRWFjaChkaXNwb3NhYmxlID0+IGRpc3Bvc2UoZGlzcG9zYWJsZSkpO1xuXHRcdHRoaXMuYWN0aXZlT3V0T2ZXb3Jrc3BhY2VXYXRjaGVycy5jbGVhcigpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElFZGl0b3JTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoRWRpdG9yU2VydmljZSwgW3VuZGVmaW5lZF0sIGZhbHNlKSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsa0JBQW9JLDBCQUFxRyxZQUFZLGNBQTZDLHdCQUE0Qyx5QkFBeUIsMkJBQWdELHVCQUF1QixlQUFlLGtDQUFzRCxrQ0FBc0c7QUFDbG1CLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsYUFBYSxtQkFBbUI7QUFDekMsU0FBUyxjQUFrQyxlQUFlLGtCQUFrQixzQkFBc0I7QUFDbEcsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CLDRCQUE0QjtBQUN6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
