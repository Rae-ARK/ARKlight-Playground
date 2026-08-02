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
import { URI } from "../../../../base/common/uri.js";
import { EditorResourceAccessor, EditorsOrder, SideBySideEditor, isResourceEditorInput, isEditorInput, isSideBySideEditorInput, EditorCloseContext, EditorPaneSelectionCompareResult, EditorPaneSelectionChangeReason, isEditorPaneWithSelection, GroupModelChangeKind } from "../../../common/editor.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { GoFilter, GoScope, IHistoryService, MOUSE_BACK_FORWARD_NAVIGATION_SETTING } from "../common/history.js";
import { FileChangesEvent, IFileService, FileChangeType, FILES_EXCLUDE_CONFIG, FileOperationEvent, FileOperation } from "../../../../platform/files/common/files.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { Disposable, DisposableStore, DisposableMap } from "../../../../base/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IEditorGroupsService } from "../../editor/common/editorGroupsService.js";
import { getExcludes, SEARCH_EXCLUDE_CONFIG } from "../../search/common/search.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IWorkbenchLayoutService } from "../../layout/browser/layoutService.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { addDisposableListener, EventType, EventHelper, WindowIdleValue } from "../../../../base/browser/dom.js";
import { IWorkspacesService } from "../../../../platform/workspaces/common/workspaces.js";
import { Schemas } from "../../../../base/common/network.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { ResourceGlobMatcher } from "../../../common/resources.js";
import { IPathService } from "../../path/common/pathService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { ILogService, LogLevel } from "../../../../platform/log/common/log.js";
import { mainWindow } from "../../../../base/browser/window.js";
let HistoryService = class extends Disposable {
  constructor(editorService, editorGroupService, contextService, storageService, configurationService, fileService, workspacesService, instantiationService, layoutService, contextKeyService, logService) {
    super();
    this.editorService = editorService;
    this.editorGroupService = editorGroupService;
    this.contextService = contextService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.fileService = fileService;
    this.workspacesService = workspacesService;
    this.instantiationService = instantiationService;
    this.layoutService = layoutService;
    this.contextKeyService = contextKeyService;
    this.logService = logService;
    this.activeEditorListeners = this._register(new DisposableStore());
    this.lastActiveEditor = void 0;
    //#endregion
    //#region Editor History Navigation (limit: 50)
    this._onDidChangeEditorNavigationStack = this._register(new Emitter());
    this.onDidChangeEditorNavigationStack = this._onDidChangeEditorNavigationStack.event;
    this.defaultScopedEditorNavigationStack = void 0;
    this.editorGroupScopedNavigationStacks = /* @__PURE__ */ new Map();
    this.editorScopedNavigationStacks = /* @__PURE__ */ new Map();
    this.editorNavigationScope = GoScope.DEFAULT;
    //#endregion
    //#region Navigation: Next/Previous Used Editor
    this.recentlyUsedEditorsStack = void 0;
    this.recentlyUsedEditorsStackIndex = 0;
    this.recentlyUsedEditorsInGroupStack = void 0;
    this.recentlyUsedEditorsInGroupStackIndex = 0;
    this.navigatingInRecentlyUsedEditorsStack = false;
    this.navigatingInRecentlyUsedEditorsInGroupStack = false;
    this.recentlyClosedEditors = [];
    this.ignoreEditorCloseEvent = false;
    this.recentlyClosedEditorsBatchId = 0;
    this.recentlyClosedEditorsBatchScheduled = false;
    this.history = void 0;
    this.editorHistoryListeners = this._register(new DisposableMap());
    this.resourceExcludeMatcher = this._register(new WindowIdleValue(mainWindow, () => {
      const matcher = this._register(this.instantiationService.createInstance(
        ResourceGlobMatcher,
        (root) => getExcludes(root ? this.configurationService.getValue({ resource: root }) : this.configurationService.getValue()) || /* @__PURE__ */ Object.create(null),
        (event) => event.affectsConfiguration(FILES_EXCLUDE_CONFIG) || event.affectsConfiguration(SEARCH_EXCLUDE_CONFIG)
      ));
      this._register(matcher.onExpressionChange(() => this.removeExcludedFromHistory()));
      return matcher;
    }));
    this.editorHelper = this.instantiationService.createInstance(EditorHelper);
    this.canNavigateBackContextKey = new RawContextKey("canNavigateBack", false, localize("canNavigateBack", "Whether it is possible to navigate back in editor history")).bindTo(this.contextKeyService);
    this.canNavigateForwardContextKey = new RawContextKey("canNavigateForward", false, localize("canNavigateForward", "Whether it is possible to navigate forward in editor history")).bindTo(this.contextKeyService);
    this.canNavigateBackInNavigationsContextKey = new RawContextKey("canNavigateBackInNavigationLocations", false, localize("canNavigateBackInNavigationLocations", "Whether it is possible to navigate back in editor navigation locations history")).bindTo(this.contextKeyService);
    this.canNavigateForwardInNavigationsContextKey = new RawContextKey("canNavigateForwardInNavigationLocations", false, localize("canNavigateForwardInNavigationLocations", "Whether it is possible to navigate forward in editor navigation locations history")).bindTo(this.contextKeyService);
    this.canNavigateToLastNavigationLocationContextKey = new RawContextKey("canNavigateToLastNavigationLocation", false, localize("canNavigateToLastNavigationLocation", "Whether it is possible to navigate to the last editor navigation location")).bindTo(this.contextKeyService);
    this.canNavigateBackInEditsContextKey = new RawContextKey("canNavigateBackInEditLocations", false, localize("canNavigateBackInEditLocations", "Whether it is possible to navigate back in editor edit locations history")).bindTo(this.contextKeyService);
    this.canNavigateForwardInEditsContextKey = new RawContextKey("canNavigateForwardInEditLocations", false, localize("canNavigateForwardInEditLocations", "Whether it is possible to navigate forward in editor edit locations history")).bindTo(this.contextKeyService);
    this.canNavigateToLastEditLocationContextKey = new RawContextKey("canNavigateToLastEditLocation", false, localize("canNavigateToLastEditLocation", "Whether it is possible to navigate to the last editor edit location")).bindTo(this.contextKeyService);
    this.canReopenClosedEditorContextKey = new RawContextKey("canReopenClosedEditor", false, localize("canReopenClosedEditor", "Whether it is possible to reopen the last closed editor")).bindTo(this.contextKeyService);
    this.registerListeners();
    if (this.editorService.activeEditorPane) {
      this.onDidActiveEditorChange();
    }
  }
  registerListeners() {
    this.registerMouseNavigationListener();
    this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));
    this._register(this.editorService.onDidOpenEditorFail((event) => this.remove(event.editor)));
    this._register(this.editorService.onDidCloseEditor((event) => this.onDidCloseEditor(event)));
    this._register(this.editorService.onDidMostRecentlyActiveEditorsChange(() => this.handleEditorEventInRecentEditorsStack()));
    this._register(this.editorGroupService.onDidRemoveGroup((e) => this.onDidRemoveGroup(e)));
    this._register(this.fileService.onDidFilesChange((event) => this.onDidFilesChange(event)));
    this._register(this.fileService.onDidRunOperation((event) => this.onDidFilesChange(event)));
    this._register(this.storageService.onWillSaveState(() => this.saveState()));
    this.registerEditorNavigationScopeChangeListener();
    this._register(this.onDidChangeEditorNavigationStack(() => this.updateContextKeys()));
    this._register(this.editorGroupService.onDidChangeActiveGroup(() => this.updateContextKeys()));
  }
  onDidCloseEditor(e) {
    this.handleEditorCloseEventInHistory(e);
    this.handleEditorCloseEventInReopen(e);
  }
  registerMouseNavigationListener() {
    const mouseBackForwardSupportListener = this._register(new DisposableStore());
    const handleMouseBackForwardSupport = () => {
      mouseBackForwardSupportListener.clear();
      if (this.configurationService.getValue(MOUSE_BACK_FORWARD_NAVIGATION_SETTING)) {
        this._register(Event.runAndSubscribe(this.layoutService.onDidAddContainer, ({ container, disposables }) => {
          const eventDisposables = disposables.add(new DisposableStore());
          eventDisposables.add(addDisposableListener(container, EventType.MOUSE_DOWN, (e) => this.onMouseDownOrUp(e, true)));
          eventDisposables.add(addDisposableListener(container, EventType.MOUSE_UP, (e) => this.onMouseDownOrUp(e, false)));
          mouseBackForwardSupportListener.add(eventDisposables);
        }, { container: this.layoutService.mainContainer, disposables: this._store }));
      }
    };
    this._register(this.configurationService.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(MOUSE_BACK_FORWARD_NAVIGATION_SETTING)) {
        handleMouseBackForwardSupport();
      }
    }));
    handleMouseBackForwardSupport();
  }
  onMouseDownOrUp(event, isMouseDown) {
    switch (event.button) {
      case 3:
        EventHelper.stop(event);
        if (isMouseDown) {
          this.goBack();
        }
        break;
      case 4:
        EventHelper.stop(event);
        if (isMouseDown) {
          this.goForward();
        }
        break;
    }
  }
  onDidRemoveGroup(group) {
    this.handleEditorGroupRemoveInNavigationStacks(group);
  }
  onDidActiveEditorChange() {
    const activeEditorGroup = this.editorGroupService.activeGroup;
    const activeEditorPane = activeEditorGroup.activeEditorPane;
    if (this.lastActiveEditor && this.editorHelper.matchesEditorIdentifier(this.lastActiveEditor, activeEditorPane)) {
      return;
    }
    this.lastActiveEditor = activeEditorPane?.input ? { editor: activeEditorPane.input, groupId: activeEditorPane.group.id } : void 0;
    this.activeEditorListeners.clear();
    if (!activeEditorPane?.group.isTransient(activeEditorPane.input)) {
      this.handleActiveEditorChange(activeEditorGroup, activeEditorPane);
    } else {
      this.logService.trace(`[History]: ignoring transient editor change until becoming non-transient (editor: ${activeEditorPane.input?.resource?.toString()}})`);
      const transientListener = activeEditorGroup.onDidModelChange((e) => {
        if (e.kind === GroupModelChangeKind.EDITOR_TRANSIENT && e.editor === activeEditorPane.input && !activeEditorPane.group.isTransient(activeEditorPane.input)) {
          transientListener.dispose();
          this.handleActiveEditorChange(activeEditorGroup, activeEditorPane);
        }
      });
      this.activeEditorListeners.add(transientListener);
    }
    if (isEditorPaneWithSelection(activeEditorPane)) {
      this.activeEditorListeners.add(activeEditorPane.onDidChangeSelection((e) => {
        if (!activeEditorPane.group.isTransient(activeEditorPane.input)) {
          this.handleActiveEditorSelectionChangeEvent(activeEditorGroup, activeEditorPane, e);
        } else {
          this.logService.trace(`[History]: ignoring transient editor selection change (editor: ${activeEditorPane.input?.resource?.toString()}})`);
        }
      }));
    }
    this.updateContextKeys();
  }
  onDidFilesChange(event) {
    if (event instanceof FileChangesEvent) {
      if (event.gotDeleted()) {
        this.remove(event);
      }
    } else {
      if (event.isOperation(FileOperation.DELETE)) {
        this.remove(event);
      } else if (event.isOperation(FileOperation.MOVE) && event.target.isFile) {
        this.move(event);
      }
    }
  }
  handleActiveEditorChange(group, editorPane) {
    this.handleActiveEditorChangeInHistory(editorPane);
    this.handleActiveEditorChangeInNavigationStacks(group, editorPane);
  }
  handleActiveEditorSelectionChangeEvent(group, editorPane, event) {
    this.handleActiveEditorSelectionChangeInNavigationStacks(group, editorPane, event);
  }
  move(event) {
    this.moveInHistory(event);
    this.moveInEditorNavigationStacks(event);
  }
  remove(arg1) {
    this.removeFromHistory(arg1);
    this.removeFromEditorNavigationStacks(arg1);
    this.removeFromRecentlyClosedEditors(arg1);
    this.removeFromRecentlyOpened(arg1);
  }
  removeFromRecentlyOpened(arg1) {
    let resource = void 0;
    if (isEditorInput(arg1)) {
      resource = EditorResourceAccessor.getOriginalUri(arg1);
    } else if (arg1 instanceof FileChangesEvent) {
    } else {
      resource = arg1.resource;
    }
    if (resource) {
      this.workspacesService.removeRecentlyOpened([resource]);
    }
  }
  clear() {
    this.clearRecentlyOpened();
    this.clearEditorNavigationStacks();
    this.recentlyClosedEditors = [];
    this.updateContextKeys();
  }
  updateContextKeys() {
    this.contextKeyService.bufferChangeEvents(() => {
      const activeStack = this.getStack();
      this.canNavigateBackContextKey.set(activeStack.canGoBack(GoFilter.NONE));
      this.canNavigateForwardContextKey.set(activeStack.canGoForward(GoFilter.NONE));
      this.canNavigateBackInNavigationsContextKey.set(activeStack.canGoBack(GoFilter.NAVIGATION));
      this.canNavigateForwardInNavigationsContextKey.set(activeStack.canGoForward(GoFilter.NAVIGATION));
      this.canNavigateToLastNavigationLocationContextKey.set(activeStack.canGoLast(GoFilter.NAVIGATION));
      this.canNavigateBackInEditsContextKey.set(activeStack.canGoBack(GoFilter.EDITS));
      this.canNavigateForwardInEditsContextKey.set(activeStack.canGoForward(GoFilter.EDITS));
      this.canNavigateToLastEditLocationContextKey.set(activeStack.canGoLast(GoFilter.EDITS));
      this.canReopenClosedEditorContextKey.set(this.recentlyClosedEditors.length > 0);
    });
  }
  registerEditorNavigationScopeChangeListener() {
    const handleEditorNavigationScopeChange = () => {
      this.disposeEditorNavigationStacks();
      const configuredScope = this.configurationService.getValue(HistoryService.NAVIGATION_SCOPE_SETTING);
      if (configuredScope === "editorGroup") {
        this.editorNavigationScope = GoScope.EDITOR_GROUP;
      } else if (configuredScope === "editor") {
        this.editorNavigationScope = GoScope.EDITOR;
      } else {
        this.editorNavigationScope = GoScope.DEFAULT;
      }
    };
    this._register(this.configurationService.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(HistoryService.NAVIGATION_SCOPE_SETTING)) {
        handleEditorNavigationScopeChange();
      }
    }));
    handleEditorNavigationScopeChange();
  }
  getStack(group = this.editorGroupService.activeGroup, editor = group.activeEditor) {
    switch (this.editorNavigationScope) {
      // Per Editor
      case GoScope.EDITOR: {
        if (!editor) {
          return new NoOpEditorNavigationStacks();
        }
        let stacksForGroup = this.editorScopedNavigationStacks.get(group.id);
        if (!stacksForGroup) {
          stacksForGroup = /* @__PURE__ */ new Map();
          this.editorScopedNavigationStacks.set(group.id, stacksForGroup);
        }
        let stack = stacksForGroup.get(editor)?.stack;
        if (!stack) {
          const disposable = new DisposableStore();
          stack = disposable.add(this.instantiationService.createInstance(EditorNavigationStacks, GoScope.EDITOR));
          disposable.add(stack.onDidChange(() => this._onDidChangeEditorNavigationStack.fire()));
          stacksForGroup.set(editor, { stack, disposable });
        }
        return stack;
      }
      // Per Editor Group
      case GoScope.EDITOR_GROUP: {
        let stack = this.editorGroupScopedNavigationStacks.get(group.id)?.stack;
        if (!stack) {
          const disposable = new DisposableStore();
          stack = disposable.add(this.instantiationService.createInstance(EditorNavigationStacks, GoScope.EDITOR_GROUP));
          disposable.add(stack.onDidChange(() => this._onDidChangeEditorNavigationStack.fire()));
          this.editorGroupScopedNavigationStacks.set(group.id, { stack, disposable });
        }
        return stack;
      }
      // Global
      case GoScope.DEFAULT: {
        if (!this.defaultScopedEditorNavigationStack) {
          this.defaultScopedEditorNavigationStack = this._register(this.instantiationService.createInstance(EditorNavigationStacks, GoScope.DEFAULT));
          this._register(this.defaultScopedEditorNavigationStack.onDidChange(() => this._onDidChangeEditorNavigationStack.fire()));
        }
        return this.defaultScopedEditorNavigationStack;
      }
    }
  }
  goForward(filter) {
    return this.getStack().goForward(filter);
  }
  goBack(filter) {
    return this.getStack().goBack(filter);
  }
  goPrevious(filter) {
    return this.getStack().goPrevious(filter);
  }
  goLast(filter) {
    return this.getStack().goLast(filter);
  }
  handleActiveEditorChangeInNavigationStacks(group, editorPane) {
    this.getStack(group, editorPane?.input).handleActiveEditorChange(editorPane);
  }
  handleActiveEditorSelectionChangeInNavigationStacks(group, editorPane, event) {
    this.getStack(group, editorPane.input).handleActiveEditorSelectionChange(editorPane, event);
  }
  handleEditorCloseEventInHistory(e) {
    const editors = this.editorScopedNavigationStacks.get(e.groupId);
    if (editors) {
      const editorStack = editors.get(e.editor);
      if (editorStack) {
        editorStack.disposable.dispose();
        editors.delete(e.editor);
      }
      if (editors.size === 0) {
        this.editorScopedNavigationStacks.delete(e.groupId);
      }
    }
  }
  handleEditorGroupRemoveInNavigationStacks(group) {
    this.defaultScopedEditorNavigationStack?.remove(group.id);
    const editorGroupStack = this.editorGroupScopedNavigationStacks.get(group.id);
    if (editorGroupStack) {
      editorGroupStack.disposable.dispose();
      this.editorGroupScopedNavigationStacks.delete(group.id);
    }
  }
  clearEditorNavigationStacks() {
    this.withEachEditorNavigationStack((stack) => stack.clear());
  }
  removeFromEditorNavigationStacks(arg1) {
    this.withEachEditorNavigationStack((stack) => stack.remove(arg1));
  }
  moveInEditorNavigationStacks(event) {
    this.withEachEditorNavigationStack((stack) => stack.move(event));
  }
  withEachEditorNavigationStack(fn) {
    if (this.defaultScopedEditorNavigationStack) {
      fn(this.defaultScopedEditorNavigationStack);
    }
    for (const [, entry] of this.editorGroupScopedNavigationStacks) {
      fn(entry.stack);
    }
    for (const [, entries] of this.editorScopedNavigationStacks) {
      for (const [, entry] of entries) {
        fn(entry.stack);
      }
    }
  }
  disposeEditorNavigationStacks() {
    this.defaultScopedEditorNavigationStack?.dispose();
    this.defaultScopedEditorNavigationStack = void 0;
    for (const [, stack] of this.editorGroupScopedNavigationStacks) {
      stack.disposable.dispose();
    }
    this.editorGroupScopedNavigationStacks.clear();
    for (const [, stacks] of this.editorScopedNavigationStacks) {
      for (const [, stack] of stacks) {
        stack.disposable.dispose();
      }
    }
    this.editorScopedNavigationStacks.clear();
  }
  openNextRecentlyUsedEditor(groupId) {
    const [stack, index] = this.ensureRecentlyUsedStack((index2) => index2 - 1, groupId);
    return this.doNavigateInRecentlyUsedEditorsStack(stack[index], groupId);
  }
  openPreviouslyUsedEditor(groupId) {
    const [stack, index] = this.ensureRecentlyUsedStack((index2) => index2 + 1, groupId);
    return this.doNavigateInRecentlyUsedEditorsStack(stack[index], groupId);
  }
  async doNavigateInRecentlyUsedEditorsStack(editorIdentifier, groupId) {
    if (editorIdentifier) {
      const acrossGroups = typeof groupId !== "number" || !this.editorGroupService.getGroup(groupId);
      if (acrossGroups) {
        this.navigatingInRecentlyUsedEditorsStack = true;
      } else {
        this.navigatingInRecentlyUsedEditorsInGroupStack = true;
      }
      const group = this.editorGroupService.getGroup(editorIdentifier.groupId) ?? this.editorGroupService.activeGroup;
      try {
        await group.openEditor(editorIdentifier.editor);
      } finally {
        if (acrossGroups) {
          this.navigatingInRecentlyUsedEditorsStack = false;
        } else {
          this.navigatingInRecentlyUsedEditorsInGroupStack = false;
        }
      }
    }
  }
  ensureRecentlyUsedStack(indexModifier, groupId) {
    let editors;
    let index;
    const group = typeof groupId === "number" ? this.editorGroupService.getGroup(groupId) : void 0;
    if (!group) {
      editors = this.recentlyUsedEditorsStack || this.editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
      index = this.recentlyUsedEditorsStackIndex;
    } else {
      editors = this.recentlyUsedEditorsInGroupStack || group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).map((editor) => ({ groupId: group.id, editor }));
      index = this.recentlyUsedEditorsInGroupStackIndex;
    }
    let newIndex = indexModifier(index);
    if (newIndex < 0) {
      newIndex = 0;
    } else if (newIndex > editors.length - 1) {
      newIndex = editors.length - 1;
    }
    if (!group) {
      this.recentlyUsedEditorsStack = editors;
      this.recentlyUsedEditorsStackIndex = newIndex;
    } else {
      this.recentlyUsedEditorsInGroupStack = editors;
      this.recentlyUsedEditorsInGroupStackIndex = newIndex;
    }
    return [editors, newIndex];
  }
  handleEditorEventInRecentEditorsStack() {
    if (!this.navigatingInRecentlyUsedEditorsStack) {
      this.recentlyUsedEditorsStack = void 0;
      this.recentlyUsedEditorsStackIndex = 0;
    }
    if (!this.navigatingInRecentlyUsedEditorsInGroupStack) {
      this.recentlyUsedEditorsInGroupStack = void 0;
      this.recentlyUsedEditorsInGroupStackIndex = 0;
    }
  }
  handleEditorCloseEventInReopen(event) {
    if (this.ignoreEditorCloseEvent) {
      return;
    }
    const { editor, context } = event;
    if (context === EditorCloseContext.REPLACE || context === EditorCloseContext.MOVE) {
      return;
    }
    if (!editor.canReopen()) {
      return;
    }
    const untypedEditor = editor.toUntyped();
    if (!untypedEditor) {
      return;
    }
    const associatedResources = [];
    const editorResource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH });
    if (URI.isUri(editorResource)) {
      associatedResources.push(editorResource);
    } else if (editorResource) {
      associatedResources.push(...coalesce([editorResource.primary, editorResource.secondary]));
    }
    this.removeFromRecentlyClosedEditors(editor);
    this.recentlyClosedEditors.push({
      editorId: editor.editorId,
      editor: untypedEditor,
      resource: EditorResourceAccessor.getOriginalUri(editor),
      associatedResources,
      index: event.index,
      sticky: event.sticky,
      batchId: this.currentRecentlyClosedEditorsBatchId()
    });
    if (this.recentlyClosedEditors.length > HistoryService.MAX_RECENTLY_CLOSED_EDITORS) {
      this.recentlyClosedEditors.shift();
    }
    this.canReopenClosedEditorContextKey.set(true);
  }
  currentRecentlyClosedEditorsBatchId() {
    if (!this.recentlyClosedEditorsBatchScheduled) {
      this.recentlyClosedEditorsBatchScheduled = true;
      this.recentlyClosedEditorsBatchId++;
      queueMicrotask(() => this.recentlyClosedEditorsBatchScheduled = false);
    }
    return this.recentlyClosedEditorsBatchId;
  }
  async reopenLastClosedEditor() {
    const lastClosedEditors = this.takeLastClosedEditorsBatch();
    let reopenClosedEditorPromise = void 0;
    if (lastClosedEditors.length) {
      reopenClosedEditorPromise = this.doReopenLastClosedEditors(lastClosedEditors);
    }
    this.canReopenClosedEditorContextKey.set(this.recentlyClosedEditors.length > 0);
    return reopenClosedEditorPromise;
  }
  takeLastClosedEditorsBatch() {
    const lastClosedEditor = this.recentlyClosedEditors.at(-1);
    if (!lastClosedEditor) {
      return [];
    }
    const batch = [];
    while (this.recentlyClosedEditors.length && this.recentlyClosedEditors[this.recentlyClosedEditors.length - 1].batchId === lastClosedEditor.batchId) {
      batch.unshift(this.recentlyClosedEditors.pop());
    }
    return batch;
  }
  async doReopenLastClosedEditors(lastClosedEditors) {
    let anyReopened = false;
    for (const lastClosedEditor of lastClosedEditors) {
      const editorPane = await this.doReopenLastClosedEditor(lastClosedEditor);
      if (editorPane) {
        anyReopened = true;
      }
    }
    if (!anyReopened && this.recentlyClosedEditors.length) {
      return this.reopenLastClosedEditor();
    }
  }
  async doReopenLastClosedEditor(lastClosedEditor) {
    const options = { pinned: true, sticky: lastClosedEditor.sticky, index: lastClosedEditor.index, ignoreError: true };
    if (lastClosedEditor.sticky && !this.editorGroupService.activeGroup.isSticky(lastClosedEditor.index) || !lastClosedEditor.sticky && this.editorGroupService.activeGroup.isSticky(lastClosedEditor.index)) {
      options.index = void 0;
    }
    let editorPane = void 0;
    if (!this.editorGroupService.activeGroup.contains(lastClosedEditor.editor)) {
      this.ignoreEditorCloseEvent = true;
      try {
        editorPane = await this.editorService.openEditor({
          ...lastClosedEditor.editor,
          options: {
            ...lastClosedEditor.editor.options,
            ...options
          }
        });
      } finally {
        this.ignoreEditorCloseEvent = false;
      }
    }
    return editorPane;
  }
  removeFromRecentlyClosedEditors(arg1) {
    this.recentlyClosedEditors = this.recentlyClosedEditors.filter((recentlyClosedEditor) => {
      if (isEditorInput(arg1) && recentlyClosedEditor.editorId !== arg1.editorId) {
        return true;
      }
      if (recentlyClosedEditor.resource && this.editorHelper.matchesFile(recentlyClosedEditor.resource, arg1)) {
        return false;
      }
      if (recentlyClosedEditor.associatedResources.some((associatedResource) => this.editorHelper.matchesFile(associatedResource, arg1))) {
        return false;
      }
      return true;
    });
    this.canReopenClosedEditorContextKey.set(this.recentlyClosedEditors.length > 0);
  }
  handleActiveEditorChangeInHistory(editorPane) {
    const editor = editorPane?.input;
    if (!editor || editor.isDisposed() || !this.includeInHistory(editor)) {
      return;
    }
    this.removeFromHistory(editor);
    this.addToHistory(editor);
  }
  addToHistory(editor, insertFirst = true) {
    this.ensureHistoryLoaded(this.history);
    const historyInput = this.editorHelper.preferResourceEditorInput(editor);
    if (!historyInput) {
      return;
    }
    if (insertFirst) {
      this.history.unshift(historyInput);
    } else {
      this.history.push(historyInput);
    }
    if (this.history.length > HistoryService.MAX_HISTORY_ITEMS) {
      this.editorHelper.clearOnEditorDispose(this.history.pop(), this.editorHistoryListeners);
    }
    if (isEditorInput(editor)) {
      this.editorHelper.onEditorDispose(editor, () => this.updateHistoryOnEditorDispose(historyInput), this.editorHistoryListeners);
    }
  }
  updateHistoryOnEditorDispose(editor) {
    if (isEditorInput(editor)) {
      if (!isSideBySideEditorInput(editor)) {
        this.removeFromHistory(editor);
      } else {
        const resourceInputs = [];
        const sideInputs = editor.primary.matches(editor.secondary) ? [editor.primary] : [editor.primary, editor.secondary];
        for (const sideInput of sideInputs) {
          const candidateResourceInput = this.editorHelper.preferResourceEditorInput(sideInput);
          if (isResourceEditorInput(candidateResourceInput) && this.includeInHistory(candidateResourceInput)) {
            resourceInputs.push(candidateResourceInput);
          }
        }
        this.replaceInHistory(editor, ...resourceInputs);
      }
    } else {
      if (!this.includeInHistory(editor)) {
        this.removeFromHistory(editor);
      }
    }
  }
  includeInHistory(editor) {
    if (isEditorInput(editor)) {
      return true;
    }
    return !this.resourceExcludeMatcher.value.matches(editor.resource);
  }
  removeExcludedFromHistory() {
    this.ensureHistoryLoaded(this.history);
    this.history = this.history.filter((entry) => {
      const include = this.includeInHistory(entry);
      if (!include) {
        this.editorHelper.clearOnEditorDispose(entry, this.editorHistoryListeners);
      }
      return include;
    });
  }
  moveInHistory(event) {
    if (event.isOperation(FileOperation.MOVE)) {
      const removed = this.removeFromHistory(event);
      if (removed) {
        this.addToHistory({ resource: event.target.resource });
      }
    }
  }
  removeFromHistory(arg1) {
    let removed = false;
    this.ensureHistoryLoaded(this.history);
    this.history = this.history.filter((entry) => {
      const matches = this.editorHelper.matchesEditor(arg1, entry);
      if (matches) {
        this.editorHelper.clearOnEditorDispose(arg1, this.editorHistoryListeners);
        removed = true;
      }
      return !matches;
    });
    return removed;
  }
  replaceInHistory(editor, ...replacements) {
    this.ensureHistoryLoaded(this.history);
    let replaced = false;
    const newHistory = [];
    for (const entry of this.history) {
      if (this.editorHelper.matchesEditor(editor, entry)) {
        this.editorHelper.clearOnEditorDispose(editor, this.editorHistoryListeners);
        if (!replaced) {
          newHistory.push(...replacements);
          replaced = true;
        }
      } else if (!replacements.some((replacement) => this.editorHelper.matchesEditor(replacement, entry))) {
        newHistory.push(entry);
      }
    }
    if (!replaced) {
      newHistory.push(...replacements);
    }
    this.history = newHistory;
  }
  clearRecentlyOpened() {
    this.history = [];
    this.editorHistoryListeners.clearAndDisposeAll();
  }
  getHistory() {
    this.ensureHistoryLoaded(this.history);
    return this.history;
  }
  ensureHistoryLoaded(history) {
    if (!this.history) {
      this.history = [];
      if (this.editorGroupService.isReady) {
        this.loadHistory();
      } else {
        (async () => {
          await this.editorGroupService.whenReady;
          this.loadHistory();
        })();
      }
    }
  }
  loadHistory() {
    this.history = [];
    const storedEditorHistory = this.loadHistoryFromStorage();
    const openedEditorsLru = [...this.editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)].reverse();
    const handledEditors = /* @__PURE__ */ new Set();
    for (const { editor } of openedEditorsLru) {
      if (!this.includeInHistory(editor)) {
        continue;
      }
      if (editor.resource) {
        const historyEntryId = `${editor.resource.toString()}/${editor.editorId}`;
        if (handledEditors.has(historyEntryId)) {
          continue;
        }
        handledEditors.add(historyEntryId);
      }
      this.addToHistory(editor);
    }
    for (const editor of storedEditorHistory) {
      const historyEntryId = `${editor.resource.toString()}/${editor.options?.override}`;
      if (!handledEditors.has(historyEntryId) && this.includeInHistory(editor)) {
        handledEditors.add(historyEntryId);
        this.addToHistory(
          editor,
          false
          /* at the end */
        );
      }
    }
  }
  loadHistoryFromStorage() {
    const entries = [];
    const entriesRaw = this.storageService.get(HistoryService.HISTORY_STORAGE_KEY, StorageScope.WORKSPACE);
    if (entriesRaw) {
      try {
        const entriesParsed = JSON.parse(entriesRaw);
        for (const entryParsed of entriesParsed) {
          if (!entryParsed.editor || !entryParsed.editor.resource) {
            continue;
          }
          try {
            entries.push({
              ...entryParsed.editor,
              resource: typeof entryParsed.editor.resource === "string" ? URI.parse(entryParsed.editor.resource) : (
                //  from 1.67.x: URI is stored efficiently as URI.toString()
                URI.from(entryParsed.editor.resource)
              )
              // until 1.66.x: URI was stored very verbose as URI.toJSON()
            });
          } catch (error) {
            onUnexpectedError(error);
          }
        }
      } catch (error) {
        onUnexpectedError(error);
      }
    }
    return entries;
  }
  saveState() {
    if (!this.history) {
      return;
    }
    const entries = [];
    for (const editor of this.history) {
      if (isEditorInput(editor) || !isResourceEditorInput(editor)) {
        continue;
      }
      entries.push({
        editor: {
          ...editor,
          resource: editor.resource.toString()
        }
      });
    }
    this.storageService.store(HistoryService.HISTORY_STORAGE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  //#endregion
  //#region Last Active Workspace/File
  getLastActiveWorkspaceRoot(schemeFilter, authorityFilter) {
    const folders = this.contextService.getWorkspace().folders;
    if (folders.length === 0) {
      return void 0;
    }
    if (folders.length === 1) {
      const resource = folders[0].uri;
      if ((!schemeFilter || resource.scheme === schemeFilter) && (!authorityFilter || resource.authority === authorityFilter)) {
        return resource;
      }
      return void 0;
    }
    for (const input of this.getHistory()) {
      if (isEditorInput(input)) {
        continue;
      }
      if (schemeFilter && input.resource.scheme !== schemeFilter) {
        continue;
      }
      if (authorityFilter && input.resource.authority !== authorityFilter) {
        continue;
      }
      const resourceWorkspace = this.contextService.getWorkspaceFolder(input.resource);
      if (resourceWorkspace) {
        return resourceWorkspace.uri;
      }
    }
    for (const folder of folders) {
      const resource = folder.uri;
      if ((!schemeFilter || resource.scheme === schemeFilter) && (!authorityFilter || resource.authority === authorityFilter)) {
        return resource;
      }
    }
    return void 0;
  }
  getLastActiveFile(filterByScheme, filterByAuthority) {
    for (const input of this.getHistory()) {
      let resource;
      if (isEditorInput(input)) {
        resource = EditorResourceAccessor.getOriginalUri(input, { filterByScheme });
      } else {
        resource = input.resource;
      }
      if (resource && resource.scheme === filterByScheme && (!filterByAuthority || resource.authority === filterByAuthority)) {
        return resource;
      }
    }
    return void 0;
  }
  //#endregion
  dispose() {
    super.dispose();
    for (const [, stack] of this.editorGroupScopedNavigationStacks) {
      stack.disposable.dispose();
    }
    for (const [, editors] of this.editorScopedNavigationStacks) {
      for (const [, stack] of editors) {
        stack.disposable.dispose();
      }
    }
    for (const [, listener] of this.editorHistoryListeners) {
      listener.dispose();
    }
  }
};
HistoryService.NAVIGATION_SCOPE_SETTING = "workbench.editor.navigationScope";
//#endregion
//#region File: Reopen Closed Editor (limit: 20)
HistoryService.MAX_RECENTLY_CLOSED_EDITORS = 20;
//#endregion
//#region Go to: Recently Opened Editor (limit: 200, persisted)
HistoryService.MAX_HISTORY_ITEMS = 200;
HistoryService.HISTORY_STORAGE_KEY = "history.entries";
HistoryService = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IEditorGroupsService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IWorkspacesService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IWorkbenchLayoutService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, ILogService)
], HistoryService);
registerSingleton(IHistoryService, HistoryService, InstantiationType.Eager);
class EditorSelectionState {
  constructor(editorIdentifier, selection, reason) {
    this.editorIdentifier = editorIdentifier;
    this.selection = selection;
    this.reason = reason;
  }
  justifiesNewNavigationEntry(other) {
    if (this.editorIdentifier.groupId !== other.editorIdentifier.groupId) {
      return true;
    }
    if (!this.editorIdentifier.editor.matches(other.editorIdentifier.editor)) {
      return true;
    }
    if (!this.selection || !other.selection) {
      return true;
    }
    const result = this.selection.compare(other.selection);
    if (result === EditorPaneSelectionCompareResult.SIMILAR && (other.reason === EditorPaneSelectionChangeReason.NAVIGATION || other.reason === EditorPaneSelectionChangeReason.JUMP)) {
      return true;
    }
    return result === EditorPaneSelectionCompareResult.DIFFERENT;
  }
}
let EditorNavigationStacks = class extends Disposable {
  constructor(scope, instantiationService) {
    super();
    this.scope = scope;
    this.instantiationService = instantiationService;
    this.selectionsStack = this._register(this.instantiationService.createInstance(EditorNavigationStack, GoFilter.NONE, this.scope));
    this.editsStack = this._register(this.instantiationService.createInstance(EditorNavigationStack, GoFilter.EDITS, this.scope));
    this.navigationsStack = this._register(this.instantiationService.createInstance(EditorNavigationStack, GoFilter.NAVIGATION, this.scope));
    this.stacks = [
      this.selectionsStack,
      this.editsStack,
      this.navigationsStack
    ];
    this.onDidChange = Event.any(
      this.selectionsStack.onDidChange,
      this.editsStack.onDidChange,
      this.navigationsStack.onDidChange
    );
  }
  canGoForward(filter) {
    return this.getStack(filter).canGoForward();
  }
  goForward(filter) {
    return this.getStack(filter).goForward();
  }
  canGoBack(filter) {
    return this.getStack(filter).canGoBack();
  }
  goBack(filter) {
    return this.getStack(filter).goBack();
  }
  goPrevious(filter) {
    return this.getStack(filter).goPrevious();
  }
  canGoLast(filter) {
    return this.getStack(filter).canGoLast();
  }
  goLast(filter) {
    return this.getStack(filter).goLast();
  }
  getStack(filter = GoFilter.NONE) {
    switch (filter) {
      case GoFilter.NONE:
        return this.selectionsStack;
      case GoFilter.EDITS:
        return this.editsStack;
      case GoFilter.NAVIGATION:
        return this.navigationsStack;
    }
  }
  handleActiveEditorChange(editorPane) {
    this.selectionsStack.notifyNavigation(editorPane);
  }
  handleActiveEditorSelectionChange(editorPane, event) {
    const previous = this.selectionsStack.current;
    this.selectionsStack.notifyNavigation(editorPane, event);
    if (event.reason === EditorPaneSelectionChangeReason.EDIT) {
      this.editsStack.notifyNavigation(editorPane, event);
    } else if ((event.reason === EditorPaneSelectionChangeReason.NAVIGATION || event.reason === EditorPaneSelectionChangeReason.JUMP) && !this.selectionsStack.isNavigating()) {
      if (event.reason === EditorPaneSelectionChangeReason.JUMP && !this.navigationsStack.isNavigating()) {
        if (previous) {
          this.navigationsStack.addOrReplace(previous.groupId, previous.editor, previous.selection);
        }
      }
      this.navigationsStack.notifyNavigation(editorPane, event);
    }
  }
  clear() {
    for (const stack of this.stacks) {
      stack.clear();
    }
  }
  remove(arg1) {
    for (const stack of this.stacks) {
      stack.remove(arg1);
    }
  }
  move(event) {
    for (const stack of this.stacks) {
      stack.move(event);
    }
  }
};
EditorNavigationStacks = __decorateClass([
  __decorateParam(1, IInstantiationService)
], EditorNavigationStacks);
class NoOpEditorNavigationStacks {
  constructor() {
    this.onDidChange = Event.None;
  }
  canGoForward() {
    return false;
  }
  async goForward() {
  }
  canGoBack() {
    return false;
  }
  async goBack() {
  }
  async goPrevious() {
  }
  canGoLast() {
    return false;
  }
  async goLast() {
  }
  handleActiveEditorChange() {
  }
  handleActiveEditorSelectionChange() {
  }
  clear() {
  }
  remove() {
  }
  move() {
  }
  dispose() {
  }
}
let EditorNavigationStack = class extends Disposable {
  constructor(filter, scope, instantiationService, editorService, editorGroupService, logService) {
    super();
    this.filter = filter;
    this.scope = scope;
    this.editorService = editorService;
    this.editorGroupService = editorGroupService;
    this.logService = logService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.mapEditorToDisposable = this._register(new DisposableMap());
    this.mapGroupToDisposable = this._register(new DisposableMap());
    this.stack = [];
    this.index = -1;
    this.previousIndex = -1;
    this.navigating = false;
    this.currentSelectionState = void 0;
    this.editorHelper = instantiationService.createInstance(EditorHelper);
    this.registerListeners();
  }
  get current() {
    return this.stack[this.index];
  }
  set current(entry) {
    if (entry) {
      this.stack[this.index] = entry;
    }
  }
  registerListeners() {
    this._register(this.onDidChange(() => this.traceStack()));
    this._register(this.logService.onDidChangeLogLevel(() => this.traceStack()));
    this._register(this.editorGroupService.onDidRemoveGroup((group) => {
      this.mapGroupToDisposable.deleteAndDispose(group.id);
    }));
  }
  traceStack() {
    if (this.logService.getLevel() !== LogLevel.Trace) {
      return;
    }
    const entryLabels = [];
    for (const entry of this.stack) {
      if (typeof entry.selection?.log === "function") {
        entryLabels.push(`- group: ${entry.groupId}, editor: ${entry.editor.resource?.toString()}, selection: ${entry.selection.log()}`);
      } else {
        entryLabels.push(`- group: ${entry.groupId}, editor: ${entry.editor.resource?.toString()}, selection: <none>`);
      }
    }
    if (entryLabels.length === 0) {
      this.trace(`index: ${this.index}, navigating: ${this.isNavigating()}: <empty>`);
    } else {
      this.trace(`index: ${this.index}, navigating: ${this.isNavigating()}
${entryLabels.join("\n")}
			`);
    }
  }
  trace(msg, editor = null, event) {
    if (this.logService.getLevel() !== LogLevel.Trace) {
      return;
    }
    let filterLabel;
    switch (this.filter) {
      case GoFilter.NONE:
        filterLabel = "global";
        break;
      case GoFilter.EDITS:
        filterLabel = "edits";
        break;
      case GoFilter.NAVIGATION:
        filterLabel = "navigation";
        break;
    }
    let scopeLabel;
    switch (this.scope) {
      case GoScope.DEFAULT:
        scopeLabel = "default";
        break;
      case GoScope.EDITOR_GROUP:
        scopeLabel = "editorGroup";
        break;
      case GoScope.EDITOR:
        scopeLabel = "editor";
        break;
    }
    if (editor !== null) {
      this.logService.trace(`[History stack ${filterLabel}-${scopeLabel}]: ${msg} (editor: ${editor?.resource?.toString()}, event: ${this.traceEvent(event)})`);
    } else {
      this.logService.trace(`[History stack ${filterLabel}-${scopeLabel}]: ${msg}`);
    }
  }
  traceEvent(event) {
    if (!event) {
      return "<none>";
    }
    switch (event.reason) {
      case EditorPaneSelectionChangeReason.EDIT:
        return "edit";
      case EditorPaneSelectionChangeReason.NAVIGATION:
        return "navigation";
      case EditorPaneSelectionChangeReason.JUMP:
        return "jump";
      case EditorPaneSelectionChangeReason.PROGRAMMATIC:
        return "programmatic";
      case EditorPaneSelectionChangeReason.USER:
        return "user";
    }
  }
  registerGroupListeners(groupId) {
    if (!this.mapGroupToDisposable.has(groupId)) {
      const group = this.editorGroupService.getGroup(groupId);
      if (group) {
        this.mapGroupToDisposable.set(groupId, group.onWillMoveEditor((e) => this.onWillMoveEditor(e)));
      }
    }
  }
  onWillMoveEditor(e) {
    this.trace("onWillMoveEditor()", e.editor);
    if (this.scope === GoScope.EDITOR_GROUP) {
      return;
    }
    for (const entry of this.stack) {
      if (entry.groupId !== e.groupId) {
        continue;
      }
      if (!this.editorHelper.matchesEditor(e.editor, entry.editor)) {
        continue;
      }
      entry.groupId = e.target;
    }
  }
  //#region Stack Mutation
  notifyNavigation(editorPane, event) {
    this.trace("notifyNavigation()", editorPane?.input, event);
    const isSelectionAwareEditorPane = isEditorPaneWithSelection(editorPane);
    const hasValidEditor = editorPane?.input && !editorPane.input.isDisposed();
    if (this.navigating) {
      this.trace(`notifyNavigation() ignoring (navigating)`, editorPane?.input, event);
      if (isSelectionAwareEditorPane && hasValidEditor) {
        this.trace("notifyNavigation() updating current selection state", editorPane?.input, event);
        this.currentSelectionState = new EditorSelectionState({ groupId: editorPane.group.id, editor: editorPane.input }, editorPane.getSelection(), event?.reason);
      } else {
        this.trace("notifyNavigation() dropping current selection state", editorPane?.input, event);
        this.currentSelectionState = void 0;
      }
    } else {
      this.trace(`notifyNavigation() not ignoring`, editorPane?.input, event);
      if (isSelectionAwareEditorPane && hasValidEditor) {
        this.onSelectionAwareEditorNavigation(editorPane.group.id, editorPane.input, editorPane.getSelection(), event);
      } else {
        this.currentSelectionState = void 0;
        if (hasValidEditor) {
          this.onNonSelectionAwareEditorNavigation(editorPane.group.id, editorPane.input);
        }
      }
    }
  }
  onSelectionAwareEditorNavigation(groupId, editor, selection, event) {
    if (this.current?.groupId === groupId && !selection && this.editorHelper.matchesEditor(this.current.editor, editor)) {
      return;
    }
    this.trace("onSelectionAwareEditorNavigation()", editor, event);
    const stateCandidate = new EditorSelectionState({ groupId, editor }, selection, event?.reason);
    if (!this.currentSelectionState || this.currentSelectionState.justifiesNewNavigationEntry(stateCandidate)) {
      this.doAdd(groupId, editor, stateCandidate.selection);
    } else {
      this.doReplace(groupId, editor, stateCandidate.selection);
    }
    this.currentSelectionState = stateCandidate;
  }
  onNonSelectionAwareEditorNavigation(groupId, editor) {
    if (this.current?.groupId === groupId && this.editorHelper.matchesEditor(this.current.editor, editor)) {
      return;
    }
    this.trace("onNonSelectionAwareEditorNavigation()", editor);
    this.doAdd(groupId, editor);
  }
  doAdd(groupId, editor, selection) {
    if (!this.navigating) {
      this.addOrReplace(groupId, editor, selection);
    }
  }
  doReplace(groupId, editor, selection) {
    if (!this.navigating) {
      this.addOrReplace(
        groupId,
        editor,
        selection,
        true
        /* force replace */
      );
    }
  }
  addOrReplace(groupId, editorCandidate, selection, forceReplace) {
    this.registerGroupListeners(groupId);
    let replace = false;
    if (this.current) {
      if (forceReplace) {
        replace = true;
      } else if (this.shouldReplaceStackEntry(this.current, { groupId, editor: editorCandidate, selection })) {
        replace = true;
      }
    }
    const editor = this.editorHelper.preferResourceEditorInput(editorCandidate);
    if (!editor) {
      return;
    }
    if (replace) {
      this.trace("replace()", editor);
    } else {
      this.trace("add()", editor);
    }
    const newStackEntry = { groupId, editor, selection };
    const removedEntries = [];
    if (replace) {
      if (this.current) {
        removedEntries.push(this.current);
      }
      this.current = newStackEntry;
    } else {
      if (this.stack.length > this.index + 1) {
        for (let i = this.index + 1; i < this.stack.length; i++) {
          removedEntries.push(this.stack[i]);
        }
        this.stack = this.stack.slice(0, this.index + 1);
      }
      this.stack.splice(this.index + 1, 0, newStackEntry);
      if (this.stack.length > EditorNavigationStack.MAX_STACK_SIZE) {
        removedEntries.push(this.stack.shift());
        if (this.previousIndex >= 0) {
          this.previousIndex--;
        }
      } else {
        this.setIndex(
          this.index + 1,
          true
          /* skip event, we fire it later */
        );
      }
    }
    for (const removedEntry of removedEntries) {
      this.editorHelper.clearOnEditorDispose(removedEntry.editor, this.mapEditorToDisposable);
    }
    if (isEditorInput(editor)) {
      this.editorHelper.onEditorDispose(editor, () => this.remove(editor), this.mapEditorToDisposable);
    }
    this._onDidChange.fire();
  }
  shouldReplaceStackEntry(entry, candidate) {
    if (entry.groupId !== candidate.groupId) {
      return false;
    }
    if (!this.editorHelper.matchesEditor(entry.editor, candidate.editor)) {
      return false;
    }
    if (!entry.selection) {
      return true;
    }
    if (!candidate.selection) {
      return false;
    }
    return entry.selection.compare(candidate.selection) === EditorPaneSelectionCompareResult.IDENTICAL;
  }
  move(event) {
    if (event.isOperation(FileOperation.MOVE)) {
      for (const entry of this.stack) {
        if (this.editorHelper.matchesEditor(event, entry.editor)) {
          entry.editor = { resource: event.target.resource };
        }
      }
    }
  }
  remove(arg1) {
    const previousStackSize = this.stack.length;
    this.stack = this.stack.filter((entry) => {
      const matches = typeof arg1 === "number" ? entry.groupId === arg1 : this.editorHelper.matchesEditor(arg1, entry.editor);
      if (matches) {
        this.editorHelper.clearOnEditorDispose(entry.editor, this.mapEditorToDisposable);
      }
      return !matches;
    });
    if (previousStackSize === this.stack.length) {
      return;
    }
    this.flatten();
    this.index = this.stack.length - 1;
    this.previousIndex = -1;
    if (typeof arg1 === "number") {
      this.mapGroupToDisposable.deleteAndDispose(arg1);
    }
    this._onDidChange.fire();
  }
  flatten() {
    const flattenedStack = [];
    let previousEntry = void 0;
    for (const entry of this.stack) {
      if (previousEntry && this.shouldReplaceStackEntry(entry, previousEntry)) {
        continue;
      }
      previousEntry = entry;
      flattenedStack.push(entry);
    }
    this.stack = flattenedStack;
  }
  clear() {
    this.index = -1;
    this.previousIndex = -1;
    this.stack.splice(0);
    this.mapEditorToDisposable.clearAndDisposeAll();
    this.mapGroupToDisposable.clearAndDisposeAll();
  }
  dispose() {
    this.clear();
    super.dispose();
  }
  //#endregion
  //#region Navigation
  canGoForward() {
    return this.stack.length > this.index + 1;
  }
  async goForward() {
    const navigated = await this.maybeGoCurrent();
    if (navigated) {
      return;
    }
    if (!this.canGoForward()) {
      return;
    }
    this.setIndex(this.index + 1);
    return this.navigate();
  }
  canGoBack() {
    return this.index > 0;
  }
  async goBack() {
    const navigated = await this.maybeGoCurrent();
    if (navigated) {
      return;
    }
    if (!this.canGoBack()) {
      return;
    }
    this.setIndex(this.index - 1);
    return this.navigate();
  }
  async goPrevious() {
    const navigated = await this.maybeGoCurrent();
    if (navigated) {
      return;
    }
    if (this.previousIndex === -1) {
      return this.goBack();
    }
    this.setIndex(this.previousIndex);
    return this.navigate();
  }
  canGoLast() {
    return this.stack.length > 0;
  }
  async goLast() {
    if (!this.canGoLast()) {
      return;
    }
    this.setIndex(this.stack.length - 1);
    return this.navigate();
  }
  async maybeGoCurrent() {
    if (this.filter === GoFilter.NONE) {
      return false;
    }
    if (this.isCurrentSelectionActive()) {
      return false;
    }
    await this.navigate();
    return true;
  }
  isCurrentSelectionActive() {
    if (!this.current?.selection) {
      return false;
    }
    const pane = this.editorService.activeEditorPane;
    if (!isEditorPaneWithSelection(pane)) {
      return false;
    }
    if (pane.group.id !== this.current.groupId) {
      return false;
    }
    if (!pane.input || !this.editorHelper.matchesEditor(pane.input, this.current.editor)) {
      return false;
    }
    const paneSelection = pane.getSelection();
    if (!paneSelection) {
      return false;
    }
    return paneSelection.compare(this.current.selection) === EditorPaneSelectionCompareResult.IDENTICAL;
  }
  setIndex(newIndex, skipEvent) {
    this.previousIndex = this.index;
    this.index = newIndex;
    if (!skipEvent) {
      this._onDidChange.fire();
    }
  }
  async navigate() {
    this.navigating = true;
    try {
      if (this.current) {
        await this.doNavigate(this.current);
      }
    } finally {
      this.navigating = false;
    }
  }
  doNavigate(location) {
    let options = /* @__PURE__ */ Object.create(null);
    if (location.selection) {
      options = location.selection.restore(options);
    }
    if (isEditorInput(location.editor)) {
      return this.editorService.openEditor(location.editor, options, location.groupId);
    }
    return this.editorService.openEditor({
      ...location.editor,
      options: {
        ...location.editor.options,
        ...options
      }
    }, location.groupId);
  }
  isNavigating() {
    return this.navigating;
  }
  //#endregion
};
EditorNavigationStack.MAX_STACK_SIZE = 50;
EditorNavigationStack = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IEditorGroupsService),
  __decorateParam(5, ILogService)
], EditorNavigationStack);
let EditorHelper = class {
  constructor(uriIdentityService, lifecycleService, fileService, pathService) {
    this.uriIdentityService = uriIdentityService;
    this.lifecycleService = lifecycleService;
    this.fileService = fileService;
    this.pathService = pathService;
  }
  preferResourceEditorInput(editor) {
    const resource = EditorResourceAccessor.getOriginalUri(editor);
    const hasValidResourceEditorInputScheme = resource?.scheme === Schemas.file || resource?.scheme === Schemas.vscodeRemote || resource?.scheme === Schemas.vscodeUserData || resource?.scheme === this.pathService.defaultUriScheme;
    if (hasValidResourceEditorInputScheme) {
      if (isEditorInput(editor)) {
        const untypedInput = editor.toUntyped();
        if (isResourceEditorInput(untypedInput)) {
          return untypedInput;
        }
      }
      return editor;
    } else {
      return isEditorInput(editor) ? editor : void 0;
    }
  }
  matchesEditor(arg1, inputB) {
    if (arg1 instanceof FileChangesEvent || arg1 instanceof FileOperationEvent) {
      if (isEditorInput(inputB)) {
        return false;
      }
      if (arg1 instanceof FileChangesEvent) {
        return arg1.contains(inputB.resource, FileChangeType.DELETED);
      }
      return this.matchesFile(inputB.resource, arg1);
    }
    if (isEditorInput(arg1)) {
      if (isEditorInput(inputB)) {
        return arg1.matches(inputB);
      }
      return this.matchesFile(inputB.resource, arg1);
    }
    if (isEditorInput(inputB)) {
      return this.matchesFile(arg1.resource, inputB);
    }
    return arg1 && inputB && this.uriIdentityService.extUri.isEqual(arg1.resource, inputB.resource);
  }
  matchesFile(resource, arg2) {
    if (arg2 instanceof FileChangesEvent) {
      return arg2.contains(resource, FileChangeType.DELETED);
    }
    if (arg2 instanceof FileOperationEvent) {
      return this.uriIdentityService.extUri.isEqualOrParent(resource, arg2.resource);
    }
    if (isEditorInput(arg2)) {
      const inputResource = arg2.resource;
      if (!inputResource) {
        return false;
      }
      if (this.lifecycleService.phase >= LifecyclePhase.Restored && !this.fileService.hasProvider(inputResource)) {
        return false;
      }
      return this.uriIdentityService.extUri.isEqual(inputResource, resource);
    }
    return this.uriIdentityService.extUri.isEqual(arg2?.resource, resource);
  }
  matchesEditorIdentifier(identifier, editorPane) {
    if (!editorPane?.group) {
      return false;
    }
    if (identifier.groupId !== editorPane.group.id) {
      return false;
    }
    return editorPane.input ? identifier.editor.matches(editorPane.input) : false;
  }
  onEditorDispose(editor, listener, mapEditorToDispose) {
    const toDispose = Event.once(editor.onWillDispose)(() => {
      mapEditorToDispose.deleteAndDispose(editor);
      listener();
    });
    let disposables = mapEditorToDispose.get(editor);
    if (!disposables) {
      disposables = new DisposableStore();
      mapEditorToDispose.set(editor, disposables);
    }
    disposables.add(toDispose);
  }
  clearOnEditorDispose(editor, mapEditorToDispose) {
    if (!isEditorInput(editor)) {
      return;
    }
    mapEditorToDispose.deleteAndDispose(editor);
  }
};
EditorHelper = __decorateClass([
  __decorateParam(0, IUriIdentityService),
  __decorateParam(1, ILifecycleService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IPathService)
], EditorHelper);
export {
  EditorNavigationStack,
  HistoryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9oaXN0b3J5L2Jyb3dzZXIvaGlzdG9yeVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlRWRpdG9ySW5wdXQsIElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmUsIElFZGl0b3JDbG9zZUV2ZW50LCBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBJRWRpdG9ySWRlbnRpZmllciwgR3JvdXBJZGVudGlmaWVyLCBFZGl0b3JzT3JkZXIsIFNpZGVCeVNpZGVFZGl0b3IsIElVbnR5cGVkRWRpdG9ySW5wdXQsIGlzUmVzb3VyY2VFZGl0b3JJbnB1dCwgaXNFZGl0b3JJbnB1dCwgaXNTaWRlQnlTaWRlRWRpdG9ySW5wdXQsIEVkaXRvckNsb3NlQ29udGV4dCwgSUVkaXRvclBhbmVTZWxlY3Rpb24sIEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0LCBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLCBpc0VkaXRvclBhbmVXaXRoU2VsZWN0aW9uLCBJRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZUV2ZW50LCBJRWRpdG9yUGFuZVdpdGhTZWxlY3Rpb24sIElFZGl0b3JXaWxsTW92ZUV2ZW50LCBHcm91cE1vZGVsQ2hhbmdlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdvRmlsdGVyLCBHb1Njb3BlLCBJSGlzdG9yeVNlcnZpY2UsIE1PVVNFX0JBQ0tfRk9SV0FSRF9OQVZJR0FUSU9OX1NFVFRJTkcgfSBmcm9tICcuLi9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlc0V2ZW50LCBJRmlsZVNlcnZpY2UsIEZpbGVDaGFuZ2VUeXBlLCBGSUxFU19FWENMVURFX0NPTkZJRywgRmlsZU9wZXJhdGlvbkV2ZW50LCBGaWxlT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldEV4Y2x1ZGVzLCBJU2VhcmNoQ29uZmlndXJhdGlvbiwgU0VBUkNIX0VYQ0xVREVfQ09ORklHIH0gZnJvbSAnLi4vLi4vc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JTZXJ2aWNlSW1wbCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgRXZlbnRIZWxwZXIsIFdpbmRvd0lkbGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUdsb2JNYXRjaGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcblxuaW50ZXJmYWNlIElTZXJpYWxpemVkRWRpdG9ySGlzdG9yeUVudHJ5IHtcblx0cmVhZG9ubHkgZWRpdG9yOiBPbWl0PElSZXNvdXJjZUVkaXRvcklucHV0LCAncmVzb3VyY2UnPiAmIHsgcmVzb3VyY2U6IHN0cmluZyB9O1xufVxuXG5pbnRlcmZhY2UgSVJlY2VudGx5Q2xvc2VkRWRpdG9yIHtcblx0cmVhZG9ubHkgZWRpdG9ySWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZWRpdG9yOiBJVW50eXBlZEVkaXRvcklucHV0O1xuXG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGFzc29jaWF0ZWRSZXNvdXJjZXM6IFVSSVtdO1xuXG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IHN0aWNreTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogSWRlbnRpZmllcyB0aGUgYmF0Y2ggb2YgZWRpdG9ycyB0aGF0IHdlcmUgY2xvc2VkIHRvZ2V0aGVyIChlLmcuIHZpYVxuXHQgKiBcIkNsb3NlIEFsbCBFZGl0b3JzXCIgb3IgXCJDbG9zZSBPdGhlcnNcIikuIEVkaXRvcnMgc2hhcmluZyB0aGUgc2FtZSBiYXRjaFxuXHQgKiBpZGVudGlmaWVyIGFyZSByZW9wZW5lZCB0b2dldGhlciBieSBcIlJlb3BlbiBDbG9zZWQgRWRpdG9yXCIuXG5cdCAqL1xuXHRyZWFkb25seSBiYXRjaElkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBIaXN0b3J5U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJSGlzdG9yeVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE5BVklHQVRJT05fU0NPUEVfU0VUVElORyA9ICd3b3JrYmVuY2guZWRpdG9yLm5hdmlnYXRpb25TY29wZSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVFZGl0b3JMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIGxhc3RBY3RpdmVFZGl0b3I6IElFZGl0b3JJZGVudGlmaWVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9ySGVscGVyOiBFZGl0b3JIZWxwZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogRWRpdG9yU2VydmljZUltcGwsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlc1NlcnZpY2U6IElXb3Jrc3BhY2VzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lZGl0b3JIZWxwZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvckhlbHBlcik7XG5cblx0XHR0aGlzLmNhbk5hdmlnYXRlQmFja0NvbnRleHRLZXkgPSAobmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2Nhbk5hdmlnYXRlQmFjaycsIGZhbHNlLCBsb2NhbGl6ZSgnY2FuTmF2aWdhdGVCYWNrJywgXCJXaGV0aGVyIGl0IGlzIHBvc3NpYmxlIHRvIG5hdmlnYXRlIGJhY2sgaW4gZWRpdG9yIGhpc3RvcnlcIikpKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jYW5OYXZpZ2F0ZUZvcndhcmRDb250ZXh0S2V5ID0gKG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjYW5OYXZpZ2F0ZUZvcndhcmQnLCBmYWxzZSwgbG9jYWxpemUoJ2Nhbk5hdmlnYXRlRm9yd2FyZCcsIFwiV2hldGhlciBpdCBpcyBwb3NzaWJsZSB0byBuYXZpZ2F0ZSBmb3J3YXJkIGluIGVkaXRvciBoaXN0b3J5XCIpKSkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5jYW5OYXZpZ2F0ZUJhY2tJbk5hdmlnYXRpb25zQ29udGV4dEtleSA9IChuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY2FuTmF2aWdhdGVCYWNrSW5OYXZpZ2F0aW9uTG9jYXRpb25zJywgZmFsc2UsIGxvY2FsaXplKCdjYW5OYXZpZ2F0ZUJhY2tJbk5hdmlnYXRpb25Mb2NhdGlvbnMnLCBcIldoZXRoZXIgaXQgaXMgcG9zc2libGUgdG8gbmF2aWdhdGUgYmFjayBpbiBlZGl0b3IgbmF2aWdhdGlvbiBsb2NhdGlvbnMgaGlzdG9yeVwiKSkpLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmNhbk5hdmlnYXRlRm9yd2FyZEluTmF2aWdhdGlvbnNDb250ZXh0S2V5ID0gKG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjYW5OYXZpZ2F0ZUZvcndhcmRJbk5hdmlnYXRpb25Mb2NhdGlvbnMnLCBmYWxzZSwgbG9jYWxpemUoJ2Nhbk5hdmlnYXRlRm9yd2FyZEluTmF2aWdhdGlvbkxvY2F0aW9ucycsIFwiV2hldGhlciBpdCBpcyBwb3NzaWJsZSB0byBuYXZpZ2F0ZSBmb3J3YXJkIGluIGVkaXRvciBuYXZpZ2F0aW9uIGxvY2F0aW9ucyBoaXN0b3J5XCIpKSkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuY2FuTmF2aWdhdGVUb0xhc3ROYXZpZ2F0aW9uTG9jYXRpb25Db250ZXh0S2V5ID0gKG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjYW5OYXZpZ2F0ZVRvTGFzdE5hdmlnYXRpb25Mb2NhdGlvbicsIGZhbHNlLCBsb2NhbGl6ZSgnY2FuTmF2aWdhdGVUb0xhc3ROYXZpZ2F0aW9uTG9jYXRpb24nLCBcIldoZXRoZXIgaXQgaXMgcG9zc2libGUgdG8gbmF2aWdhdGUgdG8gdGhlIGxhc3QgZWRpdG9yIG5hdmlnYXRpb24gbG9jYXRpb25cIikpKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLmNhbk5hdmlnYXRlQmFja0luRWRpdHNDb250ZXh0S2V5ID0gKG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjYW5OYXZpZ2F0ZUJhY2tJbkVkaXRMb2NhdGlvbnMnLCBmYWxzZSwgbG9jYWxpemUoJ2Nhbk5hdmlnYXRlQmFja0luRWRpdExvY2F0aW9ucycsIFwiV2hldGhlciBpdCBpcyBwb3NzaWJsZSB0byBuYXZpZ2F0ZSBiYWNrIGluIGVkaXRvciBlZGl0IGxvY2F0aW9ucyBoaXN0b3J5XCIpKSkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuY2FuTmF2aWdhdGVGb3J3YXJkSW5FZGl0c0NvbnRleHRLZXkgPSAobmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2Nhbk5hdmlnYXRlRm9yd2FyZEluRWRpdExvY2F0aW9ucycsIGZhbHNlLCBsb2NhbGl6ZSgnY2FuTmF2aWdhdGVGb3J3YXJkSW5FZGl0TG9jYXRpb25zJywgXCJXaGV0aGVyIGl0IGlzIHBvc3NpYmxlIHRvIG5hdmlnYXRlIGZvcndhcmQgaW4gZWRpdG9yIGVkaXQgbG9jYXRpb25zIGhpc3RvcnlcIikpKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jYW5OYXZpZ2F0ZVRvTGFzdEVkaXRMb2NhdGlvbkNvbnRleHRLZXkgPSAobmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2Nhbk5hdmlnYXRlVG9MYXN0RWRpdExvY2F0aW9uJywgZmFsc2UsIGxvY2FsaXplKCdjYW5OYXZpZ2F0ZVRvTGFzdEVkaXRMb2NhdGlvbicsIFwiV2hldGhlciBpdCBpcyBwb3NzaWJsZSB0byBuYXZpZ2F0ZSB0byB0aGUgbGFzdCBlZGl0b3IgZWRpdCBsb2NhdGlvblwiKSkpLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuY2FuUmVvcGVuQ2xvc2VkRWRpdG9yQ29udGV4dEtleSA9IChuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY2FuUmVvcGVuQ2xvc2VkRWRpdG9yJywgZmFsc2UsIGxvY2FsaXplKCdjYW5SZW9wZW5DbG9zZWRFZGl0b3InLCBcIldoZXRoZXIgaXQgaXMgcG9zc2libGUgdG8gcmVvcGVuIHRoZSBsYXN0IGNsb3NlZCBlZGl0b3JcIikpKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cblx0XHQvLyBpZiB0aGUgc2VydmljZSBpcyBjcmVhdGVkIGxhdGUgZW5vdWdoIHRoYXQgYW4gZWRpdG9yIGlzIGFscmVhZHkgb3BlbmVkXG5cdFx0Ly8gbWFrZSBzdXJlIHRvIHRyaWdnZXIgdGhlIG9uQWN0aXZlRWRpdG9yQ2hhbmdlZCgpIHRvIHRyYWNrIHRoZSBlZGl0b3Jcblx0XHQvLyBwcm9wZXJseSAoZml4ZXMgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzU5OTA4KVxuXHRcdGlmICh0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSkge1xuXHRcdFx0dGhpcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBNb3VzZSBiYWNrL2ZvcndhcmQgc3VwcG9ydFxuXHRcdHRoaXMucmVnaXN0ZXJNb3VzZU5hdmlnYXRpb25MaXN0ZW5lcigpO1xuXG5cdFx0Ly8gRWRpdG9yIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4gdGhpcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkT3BlbkVkaXRvckZhaWwoZXZlbnQgPT4gdGhpcy5yZW1vdmUoZXZlbnQuZWRpdG9yKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZENsb3NlRWRpdG9yKGV2ZW50ID0+IHRoaXMub25EaWRDbG9zZUVkaXRvcihldmVudCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRNb3N0UmVjZW50bHlBY3RpdmVFZGl0b3JzQ2hhbmdlKCgpID0+IHRoaXMuaGFuZGxlRWRpdG9yRXZlbnRJblJlY2VudEVkaXRvcnNTdGFjaygpKSk7XG5cblx0XHQvLyBFZGl0b3IgZ3JvdXAgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm9uRGlkUmVtb3ZlR3JvdXAoZSA9PiB0aGlzLm9uRGlkUmVtb3ZlR3JvdXAoZSkpKTtcblxuXHRcdC8vIEZpbGUgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShldmVudCA9PiB0aGlzLm9uRGlkRmlsZXNDaGFuZ2UoZXZlbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihldmVudCA9PiB0aGlzLm9uRGlkRmlsZXNDaGFuZ2UoZXZlbnQpKSk7XG5cblx0XHQvLyBTdG9yYWdlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4gdGhpcy5zYXZlU3RhdGUoKSkpO1xuXG5cdFx0Ly8gQ29uZmlndXJhdGlvblxuXHRcdHRoaXMucmVnaXN0ZXJFZGl0b3JOYXZpZ2F0aW9uU2NvcGVDaGFuZ2VMaXN0ZW5lcigpO1xuXG5cdFx0Ly8gQ29udGV4dCBrZXlzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUVkaXRvck5hdmlnYXRpb25TdGFjaygoKSA9PiB0aGlzLnVwZGF0ZUNvbnRleHRLZXlzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3VwU2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZUdyb3VwKCgpID0+IHRoaXMudXBkYXRlQ29udGV4dEtleXMoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENsb3NlRWRpdG9yKGU6IElFZGl0b3JDbG9zZUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5oYW5kbGVFZGl0b3JDbG9zZUV2ZW50SW5IaXN0b3J5KGUpO1xuXHRcdHRoaXMuaGFuZGxlRWRpdG9yQ2xvc2VFdmVudEluUmVvcGVuKGUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck1vdXNlTmF2aWdhdGlvbkxpc3RlbmVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vdXNlQmFja0ZvcndhcmRTdXBwb3J0TGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGhhbmRsZU1vdXNlQmFja0ZvcndhcmRTdXBwb3J0ID0gKCkgPT4ge1xuXHRcdFx0bW91c2VCYWNrRm9yd2FyZFN1cHBvcnRMaXN0ZW5lci5jbGVhcigpO1xuXG5cdFx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShNT1VTRV9CQUNLX0ZPUldBUkRfTkFWSUdBVElPTl9TRVRUSU5HKSkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5sYXlvdXRTZXJ2aWNlLm9uRGlkQWRkQ29udGFpbmVyLCAoeyBjb250YWluZXIsIGRpc3Bvc2FibGVzIH0pID0+IHtcblx0XHRcdFx0XHRjb25zdCBldmVudERpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0XHRcdFx0ZXZlbnREaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX0RPV04sIGUgPT4gdGhpcy5vbk1vdXNlRG93bk9yVXAoZSwgdHJ1ZSkpKTtcblx0XHRcdFx0XHRldmVudERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoY29udGFpbmVyLCBFdmVudFR5cGUuTU9VU0VfVVAsIGUgPT4gdGhpcy5vbk1vdXNlRG93bk9yVXAoZSwgZmFsc2UpKSk7XG5cblx0XHRcdFx0XHRtb3VzZUJhY2tGb3J3YXJkU3VwcG9ydExpc3RlbmVyLmFkZChldmVudERpc3Bvc2FibGVzKTtcblx0XHRcdFx0fSwgeyBjb250YWluZXI6IHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLCBkaXNwb3NhYmxlczogdGhpcy5fc3RvcmUgfSkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTU9VU0VfQkFDS19GT1JXQVJEX05BVklHQVRJT05fU0VUVElORykpIHtcblx0XHRcdFx0aGFuZGxlTW91c2VCYWNrRm9yd2FyZFN1cHBvcnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRoYW5kbGVNb3VzZUJhY2tGb3J3YXJkU3VwcG9ydCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbk1vdXNlRG93bk9yVXAoZXZlbnQ6IE1vdXNlRXZlbnQsIGlzTW91c2VEb3duOiBib29sZWFuKTogdm9pZCB7XG5cblx0XHQvLyBTdXBwb3J0IHRvIG5hdmlnYXRlIGluIGhpc3Rvcnkgd2hlbiBtb3VzZSBidXR0b25zIDQvNSBhcmUgcHJlc3NlZFxuXHRcdC8vIFdlIHdhbnQgdG8gdHJpZ2dlciB0aGlzIG9uIG1vdXNlIGRvd24gZm9yIGEgZmFzdGVyIGV4cGVyaWVuY2Vcblx0XHQvLyBidXQgd2UgYWxzbyBuZWVkIHRvIHByZXZlbnQgbW91c2UgdXAgZnJvbSB0cmlnZ2VyaW5nIHRoZSBkZWZhdWx0XG5cdFx0Ly8gd2hpY2ggaXMgdG8gbmF2aWdhdGUgaW4gdGhlIGJyb3dzZXIgaGlzdG9yeS5cblxuXHRcdHN3aXRjaCAoZXZlbnQuYnV0dG9uKSB7XG5cdFx0XHRjYXNlIDM6XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZXZlbnQpO1xuXHRcdFx0XHRpZiAoaXNNb3VzZURvd24pIHtcblx0XHRcdFx0XHR0aGlzLmdvQmFjaygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSA0OlxuXHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGV2ZW50KTtcblx0XHRcdFx0aWYgKGlzTW91c2VEb3duKSB7XG5cdFx0XHRcdFx0dGhpcy5nb0ZvcndhcmQoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRSZW1vdmVHcm91cChncm91cDogSUVkaXRvckdyb3VwKTogdm9pZCB7XG5cdFx0dGhpcy5oYW5kbGVFZGl0b3JHcm91cFJlbW92ZUluTmF2aWdhdGlvblN0YWNrcyhncm91cCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvckdyb3VwID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGFjdGl2ZUVkaXRvckdyb3VwLmFjdGl2ZUVkaXRvclBhbmU7XG5cblx0XHRpZiAodGhpcy5sYXN0QWN0aXZlRWRpdG9yICYmIHRoaXMuZWRpdG9ySGVscGVyLm1hdGNoZXNFZGl0b3JJZGVudGlmaWVyKHRoaXMubGFzdEFjdGl2ZUVkaXRvciwgYWN0aXZlRWRpdG9yUGFuZSkpIHtcblx0XHRcdHJldHVybjsgLy8gcmV0dXJuIGlmIHRoZSBhY3RpdmUgZWRpdG9yIGlzIHN0aWxsIHRoZSBzYW1lXG5cdFx0fVxuXG5cdFx0Ly8gUmVtZW1iZXIgYXMgbGFzdCBhY3RpdmUgZWRpdG9yIChjYW4gYmUgdW5kZWZpbmVkIGlmIG5vbmUgb3BlbmVkKVxuXHRcdHRoaXMubGFzdEFjdGl2ZUVkaXRvciA9IGFjdGl2ZUVkaXRvclBhbmU/LmlucHV0ID8geyBlZGl0b3I6IGFjdGl2ZUVkaXRvclBhbmUuaW5wdXQsIGdyb3VwSWQ6IGFjdGl2ZUVkaXRvclBhbmUuZ3JvdXAuaWQgfSA6IHVuZGVmaW5lZDtcblxuXHRcdC8vIERpc3Bvc2Ugb2xkIGxpc3RlbmVyc1xuXHRcdHRoaXMuYWN0aXZlRWRpdG9yTGlzdGVuZXJzLmNsZWFyKCk7XG5cblx0XHQvLyBIYW5kbGUgZWRpdG9yIGNoYW5nZSB1bmxlc3MgdGhlIGVkaXRvciBpcyB0cmFuc2llbnQuIEluIHRoYXQgY2FzZVxuXHRcdC8vIHNldHVwIGEgbGlzdGVuZXIgdG8gc2VlIGlmIHRoZSB0cmFuc2llbnQgZWRpdG9yIGJlY29tZXMgbm9uLXRyYW5zaWVudFxuXHRcdC8vIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjExNzY5KVxuXHRcdGlmICghYWN0aXZlRWRpdG9yUGFuZT8uZ3JvdXAuaXNUcmFuc2llbnQoYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCkpIHtcblx0XHRcdHRoaXMuaGFuZGxlQWN0aXZlRWRpdG9yQ2hhbmdlKGFjdGl2ZUVkaXRvckdyb3VwLCBhY3RpdmVFZGl0b3JQYW5lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbSGlzdG9yeV06IGlnbm9yaW5nIHRyYW5zaWVudCBlZGl0b3IgY2hhbmdlIHVudGlsIGJlY29taW5nIG5vbi10cmFuc2llbnQgKGVkaXRvcjogJHthY3RpdmVFZGl0b3JQYW5lLmlucHV0Py5yZXNvdXJjZT8udG9TdHJpbmcoKX19KWApO1xuXG5cdFx0XHRjb25zdCB0cmFuc2llbnRMaXN0ZW5lciA9IGFjdGl2ZUVkaXRvckdyb3VwLm9uRGlkTW9kZWxDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9UUkFOU0lFTlQgJiYgZS5lZGl0b3IgPT09IGFjdGl2ZUVkaXRvclBhbmUuaW5wdXQgJiYgIWFjdGl2ZUVkaXRvclBhbmUuZ3JvdXAuaXNUcmFuc2llbnQoYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCkpIHtcblx0XHRcdFx0XHR0cmFuc2llbnRMaXN0ZW5lci5kaXNwb3NlKCk7XG5cblx0XHRcdFx0XHR0aGlzLmhhbmRsZUFjdGl2ZUVkaXRvckNoYW5nZShhY3RpdmVFZGl0b3JHcm91cCwgYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmFjdGl2ZUVkaXRvckxpc3RlbmVycy5hZGQodHJhbnNpZW50TGlzdGVuZXIpO1xuXHRcdH1cblxuXHRcdC8vIExpc3RlbiB0byBzZWxlY3Rpb24gY2hhbmdlcyB1bmxlc3MgdGhlIGVkaXRvciBpcyB0cmFuc2llbnRcblx0XHRpZiAoaXNFZGl0b3JQYW5lV2l0aFNlbGVjdGlvbihhY3RpdmVFZGl0b3JQYW5lKSkge1xuXHRcdFx0dGhpcy5hY3RpdmVFZGl0b3JMaXN0ZW5lcnMuYWRkKGFjdGl2ZUVkaXRvclBhbmUub25EaWRDaGFuZ2VTZWxlY3Rpb24oZSA9PiB7XG5cdFx0XHRcdGlmICghYWN0aXZlRWRpdG9yUGFuZS5ncm91cC5pc1RyYW5zaWVudChhY3RpdmVFZGl0b3JQYW5lLmlucHV0KSkge1xuXHRcdFx0XHRcdHRoaXMuaGFuZGxlQWN0aXZlRWRpdG9yU2VsZWN0aW9uQ2hhbmdlRXZlbnQoYWN0aXZlRWRpdG9yR3JvdXAsIGFjdGl2ZUVkaXRvclBhbmUsIGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0hpc3RvcnldOiBpZ25vcmluZyB0cmFuc2llbnQgZWRpdG9yIHNlbGVjdGlvbiBjaGFuZ2UgKGVkaXRvcjogJHthY3RpdmVFZGl0b3JQYW5lLmlucHV0Py5yZXNvdXJjZT8udG9TdHJpbmcoKX19KWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGV4dCBrZXlzXG5cdFx0dGhpcy51cGRhdGVDb250ZXh0S2V5cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZEZpbGVzQ2hhbmdlKGV2ZW50OiBGaWxlQ2hhbmdlc0V2ZW50IHwgRmlsZU9wZXJhdGlvbkV2ZW50KTogdm9pZCB7XG5cblx0XHQvLyBFeHRlcm5hbCBmaWxlIGNoYW5nZXMgKHdhdGNoZXIpXG5cdFx0aWYgKGV2ZW50IGluc3RhbmNlb2YgRmlsZUNoYW5nZXNFdmVudCkge1xuXHRcdFx0aWYgKGV2ZW50LmdvdERlbGV0ZWQoKSkge1xuXHRcdFx0XHR0aGlzLnJlbW92ZShldmVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSW50ZXJuYWwgZmlsZSBjaGFuZ2VzIChlLmcuIGV4cGxvcmVyKVxuXHRcdGVsc2Uge1xuXG5cdFx0XHQvLyBEZWxldGVcblx0XHRcdGlmIChldmVudC5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLkRFTEVURSkpIHtcblx0XHRcdFx0dGhpcy5yZW1vdmUoZXZlbnQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNb3ZlXG5cdFx0XHRlbHNlIGlmIChldmVudC5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLk1PVkUpICYmIGV2ZW50LnRhcmdldC5pc0ZpbGUpIHtcblx0XHRcdFx0dGhpcy5tb3ZlKGV2ZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUFjdGl2ZUVkaXRvckNoYW5nZShncm91cDogSUVkaXRvckdyb3VwLCBlZGl0b3JQYW5lPzogSUVkaXRvclBhbmUpOiB2b2lkIHtcblx0XHR0aGlzLmhhbmRsZUFjdGl2ZUVkaXRvckNoYW5nZUluSGlzdG9yeShlZGl0b3JQYW5lKTtcblx0XHR0aGlzLmhhbmRsZUFjdGl2ZUVkaXRvckNoYW5nZUluTmF2aWdhdGlvblN0YWNrcyhncm91cCwgZWRpdG9yUGFuZSk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUFjdGl2ZUVkaXRvclNlbGVjdGlvbkNoYW5nZUV2ZW50KGdyb3VwOiBJRWRpdG9yR3JvdXAsIGVkaXRvclBhbmU6IElFZGl0b3JQYW5lV2l0aFNlbGVjdGlvbiwgZXZlbnQ6IElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmhhbmRsZUFjdGl2ZUVkaXRvclNlbGVjdGlvbkNoYW5nZUluTmF2aWdhdGlvblN0YWNrcyhncm91cCwgZWRpdG9yUGFuZSwgZXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBtb3ZlKGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLm1vdmVJbkhpc3RvcnkoZXZlbnQpO1xuXHRcdHRoaXMubW92ZUluRWRpdG9yTmF2aWdhdGlvblN0YWNrcyhldmVudCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZShlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZDtcblx0cHJpdmF0ZSByZW1vdmUoZXZlbnQ6IEZpbGVDaGFuZ2VzRXZlbnQpOiB2b2lkO1xuXHRwcml2YXRlIHJlbW92ZShldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50KTogdm9pZDtcblx0cHJpdmF0ZSByZW1vdmUoYXJnMTogRWRpdG9ySW5wdXQgfCBGaWxlQ2hhbmdlc0V2ZW50IHwgRmlsZU9wZXJhdGlvbkV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5yZW1vdmVGcm9tSGlzdG9yeShhcmcxKTtcblx0XHR0aGlzLnJlbW92ZUZyb21FZGl0b3JOYXZpZ2F0aW9uU3RhY2tzKGFyZzEpO1xuXHRcdHRoaXMucmVtb3ZlRnJvbVJlY2VudGx5Q2xvc2VkRWRpdG9ycyhhcmcxKTtcblx0XHR0aGlzLnJlbW92ZUZyb21SZWNlbnRseU9wZW5lZChhcmcxKTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlRnJvbVJlY2VudGx5T3BlbmVkKGFyZzE6IEVkaXRvcklucHV0IHwgRmlsZUNoYW5nZXNFdmVudCB8IEZpbGVPcGVyYXRpb25FdmVudCk6IHZvaWQge1xuXHRcdGxldCByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChpc0VkaXRvcklucHV0KGFyZzEpKSB7XG5cdFx0XHRyZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoYXJnMSk7XG5cdFx0fSBlbHNlIGlmIChhcmcxIGluc3RhbmNlb2YgRmlsZUNoYW5nZXNFdmVudCkge1xuXHRcdFx0Ly8gSWdub3JlIGZvciBub3cgKHJlY2VudGx5IG9wZW5lZCBhcmUgbW9zdCBvZnRlbiBvdXQgb2Ygd29ya3NwYWNlIGZpbGVzIGFueXdheSBmb3Igd2hpY2ggdGhlcmUgYXJlIG5vIGZpbGUgZXZlbnRzKVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNvdXJjZSA9IGFyZzEucmVzb3VyY2U7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHR0aGlzLndvcmtzcGFjZXNTZXJ2aWNlLnJlbW92ZVJlY2VudGx5T3BlbmVkKFtyZXNvdXJjZV0pO1xuXHRcdH1cblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXG5cdFx0Ly8gSGlzdG9yeVxuXHRcdHRoaXMuY2xlYXJSZWNlbnRseU9wZW5lZCgpO1xuXG5cdFx0Ly8gTmF2aWdhdGlvbiAobmV4dCwgcHJldmlvdXMpXG5cdFx0dGhpcy5jbGVhckVkaXRvck5hdmlnYXRpb25TdGFja3MoKTtcblxuXHRcdC8vIFJlY2VudGx5IGNsb3NlZCBlZGl0b3JzXG5cdFx0dGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnMgPSBbXTtcblxuXHRcdC8vIENvbnRleHQgS2V5c1xuXHRcdHRoaXMudXBkYXRlQ29udGV4dEtleXMoKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBIaXN0b3J5IENvbnRleHQgS2V5c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2FuTmF2aWdhdGVCYWNrQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgY2FuTmF2aWdhdGVGb3J3YXJkQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBjYW5OYXZpZ2F0ZUJhY2tJbk5hdmlnYXRpb25zQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgY2FuTmF2aWdhdGVGb3J3YXJkSW5OYXZpZ2F0aW9uc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGNhbk5hdmlnYXRlVG9MYXN0TmF2aWdhdGlvbkxvY2F0aW9uQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBjYW5OYXZpZ2F0ZUJhY2tJbkVkaXRzQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgY2FuTmF2aWdhdGVGb3J3YXJkSW5FZGl0c0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGNhbk5hdmlnYXRlVG9MYXN0RWRpdExvY2F0aW9uQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBjYW5SZW9wZW5DbG9zZWRFZGl0b3JDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHR1cGRhdGVDb250ZXh0S2V5cygpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmJ1ZmZlckNoYW5nZUV2ZW50cygoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTdGFjayA9IHRoaXMuZ2V0U3RhY2soKTtcblxuXHRcdFx0dGhpcy5jYW5OYXZpZ2F0ZUJhY2tDb250ZXh0S2V5LnNldChhY3RpdmVTdGFjay5jYW5Hb0JhY2soR29GaWx0ZXIuTk9ORSkpO1xuXHRcdFx0dGhpcy5jYW5OYXZpZ2F0ZUZvcndhcmRDb250ZXh0S2V5LnNldChhY3RpdmVTdGFjay5jYW5Hb0ZvcndhcmQoR29GaWx0ZXIuTk9ORSkpO1xuXG5cdFx0XHR0aGlzLmNhbk5hdmlnYXRlQmFja0luTmF2aWdhdGlvbnNDb250ZXh0S2V5LnNldChhY3RpdmVTdGFjay5jYW5Hb0JhY2soR29GaWx0ZXIuTkFWSUdBVElPTikpO1xuXHRcdFx0dGhpcy5jYW5OYXZpZ2F0ZUZvcndhcmRJbk5hdmlnYXRpb25zQ29udGV4dEtleS5zZXQoYWN0aXZlU3RhY2suY2FuR29Gb3J3YXJkKEdvRmlsdGVyLk5BVklHQVRJT04pKTtcblx0XHRcdHRoaXMuY2FuTmF2aWdhdGVUb0xhc3ROYXZpZ2F0aW9uTG9jYXRpb25Db250ZXh0S2V5LnNldChhY3RpdmVTdGFjay5jYW5Hb0xhc3QoR29GaWx0ZXIuTkFWSUdBVElPTikpO1xuXG5cdFx0XHR0aGlzLmNhbk5hdmlnYXRlQmFja0luRWRpdHNDb250ZXh0S2V5LnNldChhY3RpdmVTdGFjay5jYW5Hb0JhY2soR29GaWx0ZXIuRURJVFMpKTtcblx0XHRcdHRoaXMuY2FuTmF2aWdhdGVGb3J3YXJkSW5FZGl0c0NvbnRleHRLZXkuc2V0KGFjdGl2ZVN0YWNrLmNhbkdvRm9yd2FyZChHb0ZpbHRlci5FRElUUykpO1xuXHRcdFx0dGhpcy5jYW5OYXZpZ2F0ZVRvTGFzdEVkaXRMb2NhdGlvbkNvbnRleHRLZXkuc2V0KGFjdGl2ZVN0YWNrLmNhbkdvTGFzdChHb0ZpbHRlci5FRElUUykpO1xuXG5cdFx0XHR0aGlzLmNhblJlb3BlbkNsb3NlZEVkaXRvckNvbnRleHRLZXkuc2V0KHRoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzLmxlbmd0aCA+IDApO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEVkaXRvciBIaXN0b3J5IE5hdmlnYXRpb24gKGxpbWl0OiA1MClcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVkaXRvck5hdmlnYXRpb25TdGFjayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUVkaXRvck5hdmlnYXRpb25TdGFjayA9IHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yTmF2aWdhdGlvblN0YWNrLmV2ZW50O1xuXG5cdHByaXZhdGUgZGVmYXVsdFNjb3BlZEVkaXRvck5hdmlnYXRpb25TdGFjazogSUVkaXRvck5hdmlnYXRpb25TdGFja3MgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBTY29wZWROYXZpZ2F0aW9uU3RhY2tzID0gbmV3IE1hcDxHcm91cElkZW50aWZpZXIsIHsgc3RhY2s6IElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzOyBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNjb3BlZE5hdmlnYXRpb25TdGFja3MgPSBuZXcgTWFwPEdyb3VwSWRlbnRpZmllciwgTWFwPEVkaXRvcklucHV0LCB7IHN0YWNrOiBJRWRpdG9yTmF2aWdhdGlvblN0YWNrczsgZGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfT4+KCk7XG5cblx0cHJpdmF0ZSBlZGl0b3JOYXZpZ2F0aW9uU2NvcGUgPSBHb1Njb3BlLkRFRkFVTFQ7XG5cblx0cHJpdmF0ZSByZWdpc3RlckVkaXRvck5hdmlnYXRpb25TY29wZUNoYW5nZUxpc3RlbmVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGhhbmRsZUVkaXRvck5hdmlnYXRpb25TY29wZUNoYW5nZSA9ICgpID0+IHtcblxuXHRcdFx0Ly8gRW5zdXJlIHRvIHN0YXJ0IGZyZXNoIHdoZW4gc2V0dGluZyBjaGFuZ2VzXG5cdFx0XHR0aGlzLmRpc3Bvc2VFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzKCk7XG5cblx0XHRcdC8vIFVwZGF0ZSBzY29wZVxuXHRcdFx0Y29uc3QgY29uZmlndXJlZFNjb3BlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShIaXN0b3J5U2VydmljZS5OQVZJR0FUSU9OX1NDT1BFX1NFVFRJTkcpO1xuXHRcdFx0aWYgKGNvbmZpZ3VyZWRTY29wZSA9PT0gJ2VkaXRvckdyb3VwJykge1xuXHRcdFx0XHR0aGlzLmVkaXRvck5hdmlnYXRpb25TY29wZSA9IEdvU2NvcGUuRURJVE9SX0dST1VQO1xuXHRcdFx0fSBlbHNlIGlmIChjb25maWd1cmVkU2NvcGUgPT09ICdlZGl0b3InKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yTmF2aWdhdGlvblNjb3BlID0gR29TY29wZS5FRElUT1I7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVkaXRvck5hdmlnYXRpb25TY29wZSA9IEdvU2NvcGUuREVGQVVMVDtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKEhpc3RvcnlTZXJ2aWNlLk5BVklHQVRJT05fU0NPUEVfU0VUVElORykpIHtcblx0XHRcdFx0aGFuZGxlRWRpdG9yTmF2aWdhdGlvblNjb3BlQ2hhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aGFuZGxlRWRpdG9yTmF2aWdhdGlvblNjb3BlQ2hhbmdlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFN0YWNrKGdyb3VwID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXAsIGVkaXRvciA9IGdyb3VwLmFjdGl2ZUVkaXRvcik6IElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzIHtcblx0XHRzd2l0Y2ggKHRoaXMuZWRpdG9yTmF2aWdhdGlvblNjb3BlKSB7XG5cblx0XHRcdC8vIFBlciBFZGl0b3Jcblx0XHRcdGNhc2UgR29TY29wZS5FRElUT1I6IHtcblx0XHRcdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IE5vT3BFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgc3RhY2tzRm9yR3JvdXAgPSB0aGlzLmVkaXRvclNjb3BlZE5hdmlnYXRpb25TdGFja3MuZ2V0KGdyb3VwLmlkKTtcblx0XHRcdFx0aWYgKCFzdGFja3NGb3JHcm91cCkge1xuXHRcdFx0XHRcdHN0YWNrc0Zvckdyb3VwID0gbmV3IE1hcDxFZGl0b3JJbnB1dCwgeyBzdGFjazogSUVkaXRvck5hdmlnYXRpb25TdGFja3M7IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIH0+KCk7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JTY29wZWROYXZpZ2F0aW9uU3RhY2tzLnNldChncm91cC5pZCwgc3RhY2tzRm9yR3JvdXApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IHN0YWNrID0gc3RhY2tzRm9yR3JvdXAuZ2V0KGVkaXRvcik/LnN0YWNrO1xuXHRcdFx0XHRpZiAoIXN0YWNrKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0XHRcdHN0YWNrID0gZGlzcG9zYWJsZS5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzLCBHb1Njb3BlLkVESVRPUikpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUuYWRkKHN0YWNrLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yTmF2aWdhdGlvblN0YWNrLmZpcmUoKSkpO1xuXG5cdFx0XHRcdFx0c3RhY2tzRm9yR3JvdXAuc2V0KGVkaXRvciwgeyBzdGFjaywgZGlzcG9zYWJsZSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBzdGFjaztcblx0XHRcdH1cblxuXHRcdFx0Ly8gUGVyIEVkaXRvciBHcm91cFxuXHRcdFx0Y2FzZSBHb1Njb3BlLkVESVRPUl9HUk9VUDoge1xuXHRcdFx0XHRsZXQgc3RhY2sgPSB0aGlzLmVkaXRvckdyb3VwU2NvcGVkTmF2aWdhdGlvblN0YWNrcy5nZXQoZ3JvdXAuaWQpPy5zdGFjaztcblx0XHRcdFx0aWYgKCFzdGFjaykge1xuXHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdFx0XHRzdGFjayA9IGRpc3Bvc2FibGUuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yTmF2aWdhdGlvblN0YWNrcywgR29TY29wZS5FRElUT1JfR1JPVVApKTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlLmFkZChzdGFjay5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUVkaXRvck5hdmlnYXRpb25TdGFjay5maXJlKCkpKTtcblxuXHRcdFx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTY29wZWROYXZpZ2F0aW9uU3RhY2tzLnNldChncm91cC5pZCwgeyBzdGFjaywgZGlzcG9zYWJsZSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBzdGFjaztcblx0XHRcdH1cblxuXHRcdFx0Ly8gR2xvYmFsXG5cdFx0XHRjYXNlIEdvU2NvcGUuREVGQVVMVDoge1xuXHRcdFx0XHRpZiAoIXRoaXMuZGVmYXVsdFNjb3BlZEVkaXRvck5hdmlnYXRpb25TdGFjaykge1xuXHRcdFx0XHRcdHRoaXMuZGVmYXVsdFNjb3BlZEVkaXRvck5hdmlnYXRpb25TdGFjayA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yTmF2aWdhdGlvblN0YWNrcywgR29TY29wZS5ERUZBVUxUKSk7XG5cblx0XHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlZmF1bHRTY29wZWRFZGl0b3JOYXZpZ2F0aW9uU3RhY2sub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JOYXZpZ2F0aW9uU3RhY2suZmlyZSgpKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0U2NvcGVkRWRpdG9yTmF2aWdhdGlvblN0YWNrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdvRm9yd2FyZChmaWx0ZXI/OiBHb0ZpbHRlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmdldFN0YWNrKCkuZ29Gb3J3YXJkKGZpbHRlcik7XG5cdH1cblxuXHRnb0JhY2soZmlsdGVyPzogR29GaWx0ZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTdGFjaygpLmdvQmFjayhmaWx0ZXIpO1xuXHR9XG5cblx0Z29QcmV2aW91cyhmaWx0ZXI/OiBHb0ZpbHRlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmdldFN0YWNrKCkuZ29QcmV2aW91cyhmaWx0ZXIpO1xuXHR9XG5cblx0Z29MYXN0KGZpbHRlcj86IEdvRmlsdGVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RhY2soKS5nb0xhc3QoZmlsdGVyKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQWN0aXZlRWRpdG9yQ2hhbmdlSW5OYXZpZ2F0aW9uU3RhY2tzKGdyb3VwOiBJRWRpdG9yR3JvdXAsIGVkaXRvclBhbmU/OiBJRWRpdG9yUGFuZSk6IHZvaWQge1xuXHRcdHRoaXMuZ2V0U3RhY2soZ3JvdXAsIGVkaXRvclBhbmU/LmlucHV0KS5oYW5kbGVBY3RpdmVFZGl0b3JDaGFuZ2UoZWRpdG9yUGFuZSk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUFjdGl2ZUVkaXRvclNlbGVjdGlvbkNoYW5nZUluTmF2aWdhdGlvblN0YWNrcyhncm91cDogSUVkaXRvckdyb3VwLCBlZGl0b3JQYW5lOiBJRWRpdG9yUGFuZVdpdGhTZWxlY3Rpb24sIGV2ZW50OiBJRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5nZXRTdGFjayhncm91cCwgZWRpdG9yUGFuZS5pbnB1dCkuaGFuZGxlQWN0aXZlRWRpdG9yU2VsZWN0aW9uQ2hhbmdlKGVkaXRvclBhbmUsIGV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlRWRpdG9yQ2xvc2VFdmVudEluSGlzdG9yeShlOiBJRWRpdG9yQ2xvc2VFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvcnMgPSB0aGlzLmVkaXRvclNjb3BlZE5hdmlnYXRpb25TdGFja3MuZ2V0KGUuZ3JvdXBJZCk7XG5cdFx0aWYgKGVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IGVkaXRvclN0YWNrID0gZWRpdG9ycy5nZXQoZS5lZGl0b3IpO1xuXHRcdFx0aWYgKGVkaXRvclN0YWNrKSB7XG5cdFx0XHRcdGVkaXRvclN0YWNrLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRlZGl0b3JzLmRlbGV0ZShlLmVkaXRvcik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlZGl0b3JzLnNpemUgPT09IDApIHtcblx0XHRcdFx0dGhpcy5lZGl0b3JTY29wZWROYXZpZ2F0aW9uU3RhY2tzLmRlbGV0ZShlLmdyb3VwSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlRWRpdG9yR3JvdXBSZW1vdmVJbk5hdmlnYXRpb25TdGFja3MoZ3JvdXA6IElFZGl0b3JHcm91cCk6IHZvaWQge1xuXG5cdFx0Ly8gR2xvYmFsXG5cdFx0dGhpcy5kZWZhdWx0U2NvcGVkRWRpdG9yTmF2aWdhdGlvblN0YWNrPy5yZW1vdmUoZ3JvdXAuaWQpO1xuXG5cdFx0Ly8gRWRpdG9yIGdyb3Vwc1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU3RhY2sgPSB0aGlzLmVkaXRvckdyb3VwU2NvcGVkTmF2aWdhdGlvblN0YWNrcy5nZXQoZ3JvdXAuaWQpO1xuXHRcdGlmIChlZGl0b3JHcm91cFN0YWNrKSB7XG5cdFx0XHRlZGl0b3JHcm91cFN0YWNrLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5lZGl0b3JHcm91cFNjb3BlZE5hdmlnYXRpb25TdGFja3MuZGVsZXRlKGdyb3VwLmlkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyRWRpdG9yTmF2aWdhdGlvblN0YWNrcygpOiB2b2lkIHtcblx0XHR0aGlzLndpdGhFYWNoRWRpdG9yTmF2aWdhdGlvblN0YWNrKHN0YWNrID0+IHN0YWNrLmNsZWFyKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVGcm9tRWRpdG9yTmF2aWdhdGlvblN0YWNrcyhhcmcxOiBFZGl0b3JJbnB1dCB8IEZpbGVDaGFuZ2VzRXZlbnQgfCBGaWxlT3BlcmF0aW9uRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLndpdGhFYWNoRWRpdG9yTmF2aWdhdGlvblN0YWNrKHN0YWNrID0+IHN0YWNrLnJlbW92ZShhcmcxKSk7XG5cdH1cblxuXHRwcml2YXRlIG1vdmVJbkVkaXRvck5hdmlnYXRpb25TdGFja3MoZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudCk6IHZvaWQge1xuXHRcdHRoaXMud2l0aEVhY2hFZGl0b3JOYXZpZ2F0aW9uU3RhY2soc3RhY2sgPT4gc3RhY2subW92ZShldmVudCkpO1xuXHR9XG5cblx0cHJpdmF0ZSB3aXRoRWFjaEVkaXRvck5hdmlnYXRpb25TdGFjayhmbjogKHN0YWNrOiBJRWRpdG9yTmF2aWdhdGlvblN0YWNrcykgPT4gdm9pZCk6IHZvaWQge1xuXG5cdFx0Ly8gR2xvYmFsXG5cdFx0aWYgKHRoaXMuZGVmYXVsdFNjb3BlZEVkaXRvck5hdmlnYXRpb25TdGFjaykge1xuXHRcdFx0Zm4odGhpcy5kZWZhdWx0U2NvcGVkRWRpdG9yTmF2aWdhdGlvblN0YWNrKTtcblx0XHR9XG5cblx0XHQvLyBQZXIgZWRpdG9yIGdyb3VwXG5cdFx0Zm9yIChjb25zdCBbLCBlbnRyeV0gb2YgdGhpcy5lZGl0b3JHcm91cFNjb3BlZE5hdmlnYXRpb25TdGFja3MpIHtcblx0XHRcdGZuKGVudHJ5LnN0YWNrKTtcblx0XHR9XG5cblx0XHQvLyBQZXIgZWRpdG9yXG5cdFx0Zm9yIChjb25zdCBbLCBlbnRyaWVzXSBvZiB0aGlzLmVkaXRvclNjb3BlZE5hdmlnYXRpb25TdGFja3MpIHtcblx0XHRcdGZvciAoY29uc3QgWywgZW50cnldIG9mIGVudHJpZXMpIHtcblx0XHRcdFx0Zm4oZW50cnkuc3RhY2spO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZUVkaXRvck5hdmlnYXRpb25TdGFja3MoKTogdm9pZCB7XG5cblx0XHQvLyBHbG9iYWxcblx0XHR0aGlzLmRlZmF1bHRTY29wZWRFZGl0b3JOYXZpZ2F0aW9uU3RhY2s/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRlZmF1bHRTY29wZWRFZGl0b3JOYXZpZ2F0aW9uU3RhY2sgPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBQZXIgRWRpdG9yIGdyb3VwXG5cdFx0Zm9yIChjb25zdCBbLCBzdGFja10gb2YgdGhpcy5lZGl0b3JHcm91cFNjb3BlZE5hdmlnYXRpb25TdGFja3MpIHtcblx0XHRcdHN0YWNrLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLmVkaXRvckdyb3VwU2NvcGVkTmF2aWdhdGlvblN0YWNrcy5jbGVhcigpO1xuXG5cdFx0Ly8gUGVyIEVkaXRvclxuXHRcdGZvciAoY29uc3QgWywgc3RhY2tzXSBvZiB0aGlzLmVkaXRvclNjb3BlZE5hdmlnYXRpb25TdGFja3MpIHtcblx0XHRcdGZvciAoY29uc3QgWywgc3RhY2tdIG9mIHN0YWNrcykge1xuXHRcdFx0XHRzdGFjay5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5lZGl0b3JTY29wZWROYXZpZ2F0aW9uU3RhY2tzLmNsZWFyKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTmF2aWdhdGlvbjogTmV4dC9QcmV2aW91cyBVc2VkIEVkaXRvclxuXG5cdHByaXZhdGUgcmVjZW50bHlVc2VkRWRpdG9yc1N0YWNrOiByZWFkb25seSBJRWRpdG9ySWRlbnRpZmllcltdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlY2VudGx5VXNlZEVkaXRvcnNTdGFja0luZGV4ID0gMDtcblxuXHRwcml2YXRlIHJlY2VudGx5VXNlZEVkaXRvcnNJbkdyb3VwU3RhY2s6IHJlYWRvbmx5IElFZGl0b3JJZGVudGlmaWVyW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVjZW50bHlVc2VkRWRpdG9yc0luR3JvdXBTdGFja0luZGV4ID0gMDtcblxuXHRwcml2YXRlIG5hdmlnYXRpbmdJblJlY2VudGx5VXNlZEVkaXRvcnNTdGFjayA9IGZhbHNlO1xuXHRwcml2YXRlIG5hdmlnYXRpbmdJblJlY2VudGx5VXNlZEVkaXRvcnNJbkdyb3VwU3RhY2sgPSBmYWxzZTtcblxuXHRvcGVuTmV4dFJlY2VudGx5VXNlZEVkaXRvcihncm91cElkPzogR3JvdXBJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgW3N0YWNrLCBpbmRleF0gPSB0aGlzLmVuc3VyZVJlY2VudGx5VXNlZFN0YWNrKGluZGV4ID0+IGluZGV4IC0gMSwgZ3JvdXBJZCk7XG5cblx0XHRyZXR1cm4gdGhpcy5kb05hdmlnYXRlSW5SZWNlbnRseVVzZWRFZGl0b3JzU3RhY2soc3RhY2tbaW5kZXhdLCBncm91cElkKTtcblx0fVxuXG5cdG9wZW5QcmV2aW91c2x5VXNlZEVkaXRvcihncm91cElkPzogR3JvdXBJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgW3N0YWNrLCBpbmRleF0gPSB0aGlzLmVuc3VyZVJlY2VudGx5VXNlZFN0YWNrKGluZGV4ID0+IGluZGV4ICsgMSwgZ3JvdXBJZCk7XG5cblx0XHRyZXR1cm4gdGhpcy5kb05hdmlnYXRlSW5SZWNlbnRseVVzZWRFZGl0b3JzU3RhY2soc3RhY2tbaW5kZXhdLCBncm91cElkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9OYXZpZ2F0ZUluUmVjZW50bHlVc2VkRWRpdG9yc1N0YWNrKGVkaXRvcklkZW50aWZpZXI6IElFZGl0b3JJZGVudGlmaWVyIHwgdW5kZWZpbmVkLCBncm91cElkPzogR3JvdXBJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGVkaXRvcklkZW50aWZpZXIpIHtcblx0XHRcdGNvbnN0IGFjcm9zc0dyb3VwcyA9IHR5cGVvZiBncm91cElkICE9PSAnbnVtYmVyJyB8fCAhdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ2V0R3JvdXAoZ3JvdXBJZCk7XG5cblx0XHRcdGlmIChhY3Jvc3NHcm91cHMpIHtcblx0XHRcdFx0dGhpcy5uYXZpZ2F0aW5nSW5SZWNlbnRseVVzZWRFZGl0b3JzU3RhY2sgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5uYXZpZ2F0aW5nSW5SZWNlbnRseVVzZWRFZGl0b3JzSW5Hcm91cFN0YWNrID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cChlZGl0b3JJZGVudGlmaWVyLmdyb3VwSWQpID8/IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihlZGl0b3JJZGVudGlmaWVyLmVkaXRvcik7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRpZiAoYWNyb3NzR3JvdXBzKSB7XG5cdFx0XHRcdFx0dGhpcy5uYXZpZ2F0aW5nSW5SZWNlbnRseVVzZWRFZGl0b3JzU3RhY2sgPSBmYWxzZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLm5hdmlnYXRpbmdJblJlY2VudGx5VXNlZEVkaXRvcnNJbkdyb3VwU3RhY2sgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlUmVjZW50bHlVc2VkU3RhY2soaW5kZXhNb2RpZmllcjogKGluZGV4OiBudW1iZXIpID0+IG51bWJlciwgZ3JvdXBJZD86IEdyb3VwSWRlbnRpZmllcik6IFtyZWFkb25seSBJRWRpdG9ySWRlbnRpZmllcltdLCBudW1iZXJdIHtcblx0XHRsZXQgZWRpdG9yczogcmVhZG9ubHkgSUVkaXRvcklkZW50aWZpZXJbXTtcblx0XHRsZXQgaW5kZXg6IG51bWJlcjtcblxuXHRcdGNvbnN0IGdyb3VwID0gdHlwZW9mIGdyb3VwSWQgPT09ICdudW1iZXInID8gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ2V0R3JvdXAoZ3JvdXBJZCkgOiB1bmRlZmluZWQ7XG5cblx0XHQvLyBBY3Jvc3MgZ3JvdXBzXG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0ZWRpdG9ycyA9IHRoaXMucmVjZW50bHlVc2VkRWRpdG9yc1N0YWNrIHx8IHRoaXMuZWRpdG9yU2VydmljZS5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0XHRpbmRleCA9IHRoaXMucmVjZW50bHlVc2VkRWRpdG9yc1N0YWNrSW5kZXg7XG5cdFx0fVxuXG5cdFx0Ly8gV2l0aGluIGdyb3VwXG5cdFx0ZWxzZSB7XG5cdFx0XHRlZGl0b3JzID0gdGhpcy5yZWNlbnRseVVzZWRFZGl0b3JzSW5Hcm91cFN0YWNrIHx8IGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5tYXAoZWRpdG9yID0+ICh7IGdyb3VwSWQ6IGdyb3VwLmlkLCBlZGl0b3IgfSkpO1xuXHRcdFx0aW5kZXggPSB0aGlzLnJlY2VudGx5VXNlZEVkaXRvcnNJbkdyb3VwU3RhY2tJbmRleDtcblx0XHR9XG5cblx0XHQvLyBBZGp1c3QgaW5kZXhcblx0XHRsZXQgbmV3SW5kZXggPSBpbmRleE1vZGlmaWVyKGluZGV4KTtcblx0XHRpZiAobmV3SW5kZXggPCAwKSB7XG5cdFx0XHRuZXdJbmRleCA9IDA7XG5cdFx0fSBlbHNlIGlmIChuZXdJbmRleCA+IGVkaXRvcnMubGVuZ3RoIC0gMSkge1xuXHRcdFx0bmV3SW5kZXggPSBlZGl0b3JzLmxlbmd0aCAtIDE7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtZW1iZXIgaW5kZXggYW5kIGVkaXRvcnNcblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHR0aGlzLnJlY2VudGx5VXNlZEVkaXRvcnNTdGFjayA9IGVkaXRvcnM7XG5cdFx0XHR0aGlzLnJlY2VudGx5VXNlZEVkaXRvcnNTdGFja0luZGV4ID0gbmV3SW5kZXg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVjZW50bHlVc2VkRWRpdG9yc0luR3JvdXBTdGFjayA9IGVkaXRvcnM7XG5cdFx0XHR0aGlzLnJlY2VudGx5VXNlZEVkaXRvcnNJbkdyb3VwU3RhY2tJbmRleCA9IG5ld0luZGV4O1xuXHRcdH1cblxuXHRcdHJldHVybiBbZWRpdG9ycywgbmV3SW5kZXhdO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVFZGl0b3JFdmVudEluUmVjZW50RWRpdG9yc1N0YWNrKCk6IHZvaWQge1xuXG5cdFx0Ly8gRHJvcCBhbGwtZWRpdG9ycyBzdGFjayB1bmxlc3MgbmF2aWdhdGluZyBpbiBhbGwgZWRpdG9yc1xuXHRcdGlmICghdGhpcy5uYXZpZ2F0aW5nSW5SZWNlbnRseVVzZWRFZGl0b3JzU3RhY2spIHtcblx0XHRcdHRoaXMucmVjZW50bHlVc2VkRWRpdG9yc1N0YWNrID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5yZWNlbnRseVVzZWRFZGl0b3JzU3RhY2tJbmRleCA9IDA7XG5cdFx0fVxuXG5cdFx0Ly8gRHJvcCBpbi1ncm91cC1lZGl0b3JzIHN0YWNrIHVubGVzcyBuYXZpZ2F0aW5nIGluIGdyb3VwXG5cdFx0aWYgKCF0aGlzLm5hdmlnYXRpbmdJblJlY2VudGx5VXNlZEVkaXRvcnNJbkdyb3VwU3RhY2spIHtcblx0XHRcdHRoaXMucmVjZW50bHlVc2VkRWRpdG9yc0luR3JvdXBTdGFjayA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMucmVjZW50bHlVc2VkRWRpdG9yc0luR3JvdXBTdGFja0luZGV4ID0gMDtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRmlsZTogUmVvcGVuIENsb3NlZCBFZGl0b3IgKGxpbWl0OiAyMClcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfUkVDRU5UTFlfQ0xPU0VEX0VESVRPUlMgPSAyMDtcblxuXHRwcml2YXRlIHJlY2VudGx5Q2xvc2VkRWRpdG9yczogSVJlY2VudGx5Q2xvc2VkRWRpdG9yW10gPSBbXTtcblx0cHJpdmF0ZSBpZ25vcmVFZGl0b3JDbG9zZUV2ZW50ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWNlbnRseUNsb3NlZEVkaXRvcnNCYXRjaElkID0gMDtcblx0cHJpdmF0ZSByZWNlbnRseUNsb3NlZEVkaXRvcnNCYXRjaFNjaGVkdWxlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgaGFuZGxlRWRpdG9yQ2xvc2VFdmVudEluUmVvcGVuKGV2ZW50OiBJRWRpdG9yQ2xvc2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlnbm9yZUVkaXRvckNsb3NlRXZlbnQpIHtcblx0XHRcdHJldHVybjsgLy8gYmxvY2tlZFxuXHRcdH1cblxuXHRcdGNvbnN0IHsgZWRpdG9yLCBjb250ZXh0IH0gPSBldmVudDtcblx0XHRpZiAoY29udGV4dCA9PT0gRWRpdG9yQ2xvc2VDb250ZXh0LlJFUExBQ0UgfHwgY29udGV4dCA9PT0gRWRpdG9yQ2xvc2VDb250ZXh0Lk1PVkUpIHtcblx0XHRcdHJldHVybjsgLy8gaWdub3JlIGlmIGVkaXRvciB3YXMgcmVwbGFjZWQgb3IgbW92ZWRcblx0XHR9XG5cblx0XHRpZiAoIWVkaXRvci5jYW5SZW9wZW4oKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBvbmx5IGVkaXRvcnMgdGhhdCBjYW4gYmUgcmVvcGVuZWRcblx0XHR9XG5cblx0XHRjb25zdCB1bnR5cGVkRWRpdG9yID0gZWRpdG9yLnRvVW50eXBlZCgpO1xuXHRcdGlmICghdW50eXBlZEVkaXRvcikge1xuXHRcdFx0cmV0dXJuOyAvLyB3ZSBuZWVkIGEgdW50eXBlZCBlZGl0b3IgdG8gcmVzdG9yZSBmcm9tIGdvaW5nIGZvcndhcmRcblx0XHR9XG5cblx0XHRjb25zdCBhc3NvY2lhdGVkUmVzb3VyY2VzOiBVUklbXSA9IFtdO1xuXHRcdGNvbnN0IGVkaXRvclJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShlZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQk9USCB9KTtcblx0XHRpZiAoVVJJLmlzVXJpKGVkaXRvclJlc291cmNlKSkge1xuXHRcdFx0YXNzb2NpYXRlZFJlc291cmNlcy5wdXNoKGVkaXRvclJlc291cmNlKTtcblx0XHR9IGVsc2UgaWYgKGVkaXRvclJlc291cmNlKSB7XG5cdFx0XHRhc3NvY2lhdGVkUmVzb3VyY2VzLnB1c2goLi4uY29hbGVzY2UoW2VkaXRvclJlc291cmNlLnByaW1hcnksIGVkaXRvclJlc291cmNlLnNlY29uZGFyeV0pKTtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBsaXN0IG9mIHJlY2VudGx5IGNsb3NlZCBiZWZvcmUuLi5cblx0XHR0aGlzLnJlbW92ZUZyb21SZWNlbnRseUNsb3NlZEVkaXRvcnMoZWRpdG9yKTtcblxuXHRcdC8vIC4uLmFkZGluZyBpdCBhcyBsYXN0IHJlY2VudGx5IGNsb3NlZFxuXHRcdHRoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzLnB1c2goe1xuXHRcdFx0ZWRpdG9ySWQ6IGVkaXRvci5lZGl0b3JJZCxcblx0XHRcdGVkaXRvcjogdW50eXBlZEVkaXRvcixcblx0XHRcdHJlc291cmNlOiBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvciksXG5cdFx0XHRhc3NvY2lhdGVkUmVzb3VyY2VzLFxuXHRcdFx0aW5kZXg6IGV2ZW50LmluZGV4LFxuXHRcdFx0c3RpY2t5OiBldmVudC5zdGlja3ksXG5cdFx0XHRiYXRjaElkOiB0aGlzLmN1cnJlbnRSZWNlbnRseUNsb3NlZEVkaXRvcnNCYXRjaElkKClcblx0XHR9KTtcblxuXHRcdC8vIEJvdW5kaW5nXG5cdFx0aWYgKHRoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzLmxlbmd0aCA+IEhpc3RvcnlTZXJ2aWNlLk1BWF9SRUNFTlRMWV9DTE9TRURfRURJVE9SUykge1xuXHRcdFx0dGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnMuc2hpZnQoKTtcblx0XHR9XG5cblx0XHQvLyBDb250ZXh0XG5cdFx0dGhpcy5jYW5SZW9wZW5DbG9zZWRFZGl0b3JDb250ZXh0S2V5LnNldCh0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgY3VycmVudFJlY2VudGx5Q2xvc2VkRWRpdG9yc0JhdGNoSWQoKTogbnVtYmVyIHtcblxuXHRcdC8vIEFsbCBlZGl0b3JzIHRoYXQgYXJlIGNsb3NlZCB3aXRoaW4gdGhlIHNhbWUgc3luY2hyb25vdXMgdHVyblxuXHRcdC8vIChlLmcuIFwiQ2xvc2UgQWxsIEVkaXRvcnNcIiBvciBcIkNsb3NlIE90aGVyc1wiKSBzaGFyZSB0aGUgc2FtZSBiYXRjaFxuXHRcdC8vIGlkZW50aWZpZXIgc28gdGhhdCB0aGV5IGFyZSByZW9wZW5lZCB0b2dldGhlci4gV2Ugb3BlbiBhIG5ldyBiYXRjaFxuXHRcdC8vIG9uIHRoZSBmaXJzdCBjbG9zZSBldmVudCBhbmQgcmVzZXQgaXQgb24gdGhlIG5leHQgbWljcm90YXNrLCBhZnRlclxuXHRcdC8vIGFsbCBzeW5jaHJvbm91c2x5IGZpcmVkIGNsb3NlIGV2ZW50cyBoYXZlIGJlZW4gaGFuZGxlZC5cblx0XHRpZiAoIXRoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzQmF0Y2hTY2hlZHVsZWQpIHtcblx0XHRcdHRoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzQmF0Y2hTY2hlZHVsZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnNCYXRjaElkKys7XG5cdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB0aGlzLnJlY2VudGx5Q2xvc2VkRWRpdG9yc0JhdGNoU2NoZWR1bGVkID0gZmFsc2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJlY2VudGx5Q2xvc2VkRWRpdG9yc0JhdGNoSWQ7XG5cdH1cblxuXHRhc3luYyByZW9wZW5MYXN0Q2xvc2VkRWRpdG9yKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gUmVvcGVuIHRoZSBsYXN0IGJhdGNoIG9mIGVkaXRvcnMgdGhhdCB3ZXJlIGNsb3NlZCB0b2dldGhlclxuXHRcdGNvbnN0IGxhc3RDbG9zZWRFZGl0b3JzID0gdGhpcy50YWtlTGFzdENsb3NlZEVkaXRvcnNCYXRjaCgpO1xuXHRcdGxldCByZW9wZW5DbG9zZWRFZGl0b3JQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChsYXN0Q2xvc2VkRWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdHJlb3BlbkNsb3NlZEVkaXRvclByb21pc2UgPSB0aGlzLmRvUmVvcGVuTGFzdENsb3NlZEVkaXRvcnMobGFzdENsb3NlZEVkaXRvcnMpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBjb250ZXh0XG5cdFx0dGhpcy5jYW5SZW9wZW5DbG9zZWRFZGl0b3JDb250ZXh0S2V5LnNldCh0aGlzLnJlY2VudGx5Q2xvc2VkRWRpdG9ycy5sZW5ndGggPiAwKTtcblxuXHRcdHJldHVybiByZW9wZW5DbG9zZWRFZGl0b3JQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSB0YWtlTGFzdENsb3NlZEVkaXRvcnNCYXRjaCgpOiBJUmVjZW50bHlDbG9zZWRFZGl0b3JbXSB7XG5cdFx0Y29uc3QgbGFzdENsb3NlZEVkaXRvciA9IHRoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzLmF0KC0xKTtcblx0XHRpZiAoIWxhc3RDbG9zZWRFZGl0b3IpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBDb2xsZWN0IGFsbCB0cmFpbGluZyBlZGl0b3JzIHRoYXQgYmVsb25nIHRvIHRoZSBzYW1lIGJhdGNoLiBUaGV5IGFyZVxuXHRcdC8vIGNvbnRpZ3VvdXMgYXQgdGhlIGVuZCBvZiB0aGUgbGlzdCBiZWNhdXNlIGVkaXRvcnMgYXJlIGFwcGVuZGVkIGluIHRoZVxuXHRcdC8vIG9yZGVyIHRoZXkgYXJlIGNsb3NlZC5cblx0XHRjb25zdCBiYXRjaDogSVJlY2VudGx5Q2xvc2VkRWRpdG9yW10gPSBbXTtcblx0XHR3aGlsZSAodGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnMubGVuZ3RoICYmIHRoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzW3RoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzLmxlbmd0aCAtIDFdLmJhdGNoSWQgPT09IGxhc3RDbG9zZWRFZGl0b3IuYmF0Y2hJZCkge1xuXHRcdFx0YmF0Y2gudW5zaGlmdCh0aGlzLnJlY2VudGx5Q2xvc2VkRWRpdG9ycy5wb3AoKSEpO1xuXHRcdH1cblxuXHRcdHJldHVybiBiYXRjaDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZW9wZW5MYXN0Q2xvc2VkRWRpdG9ycyhsYXN0Q2xvc2VkRWRpdG9yczogSVJlY2VudGx5Q2xvc2VkRWRpdG9yW10pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFJlb3BlbiBhbGwgZWRpdG9ycyBvZiB0aGUgYmF0Y2ggaW4gdGhlIG9yZGVyIHRoZXkgd2VyZSBvcmlnaW5hbGx5IGNsb3NlZFxuXHRcdGxldCBhbnlSZW9wZW5lZCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgbGFzdENsb3NlZEVkaXRvciBvZiBsYXN0Q2xvc2VkRWRpdG9ycykge1xuXHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGF3YWl0IHRoaXMuZG9SZW9wZW5MYXN0Q2xvc2VkRWRpdG9yKGxhc3RDbG9zZWRFZGl0b3IpO1xuXHRcdFx0aWYgKGVkaXRvclBhbmUpIHtcblx0XHRcdFx0YW55UmVvcGVuZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpeCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzY3ODgyXG5cdFx0Ly8gSWYgbm9uZSBvZiB0aGUgZWRpdG9ycyBpbiB0aGUgYmF0Y2ggY291bGQgYmUgcmVvcGVuZWQsIG1ha2Ugc3VyZSB0b1xuXHRcdC8vIHRyeSB0aGUgcHJldmlvdXMgYmF0Y2guIFRoZSBmYWlsaW5nIGVkaXRvcnMgaGF2ZSBhbHJlYWR5IGJlZW4gcmVtb3ZlZFxuXHRcdC8vIGZyb20gdGhlIGxpc3Qgb2YgcmVjZW50bHkgY2xvc2VkIGVkaXRvcnMgdG8gcHJldmVudCBlbmRsZXNzIGxvb3BzLlxuXHRcdGlmICghYW55UmVvcGVuZWQgJiYgdGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZW9wZW5MYXN0Q2xvc2VkRWRpdG9yKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1Jlb3Blbkxhc3RDbG9zZWRFZGl0b3IobGFzdENsb3NlZEVkaXRvcjogSVJlY2VudGx5Q2xvc2VkRWRpdG9yKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IG9wdGlvbnM6IElFZGl0b3JPcHRpb25zID0geyBwaW5uZWQ6IHRydWUsIHN0aWNreTogbGFzdENsb3NlZEVkaXRvci5zdGlja3ksIGluZGV4OiBsYXN0Q2xvc2VkRWRpdG9yLmluZGV4LCBpZ25vcmVFcnJvcjogdHJ1ZSB9O1xuXG5cdFx0Ly8gU3BlY2lhbCBzdGlja3kgaGFuZGxpbmc6IHJlbW92ZSB0aGUgaW5kZXggcHJvcGVydHkgZnJvbSBvcHRpb25zXG5cdFx0Ly8gaWYgdGhhdCB3b3VsZCByZXN1bHQgaW4gc3RpY2t5IHN0YXRlIHRvIG5vdCBwcmVzZXJ2ZSBvciBhcHBseVxuXHRcdC8vIHdyb25nbHkuXG5cdFx0aWYgKFxuXHRcdFx0KGxhc3RDbG9zZWRFZGl0b3Iuc3RpY2t5ICYmICF0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cC5pc1N0aWNreShsYXN0Q2xvc2VkRWRpdG9yLmluZGV4KSkgfHxcblx0XHRcdCghbGFzdENsb3NlZEVkaXRvci5zdGlja3kgJiYgdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXAuaXNTdGlja3kobGFzdENsb3NlZEVkaXRvci5pbmRleCkpXG5cdFx0KSB7XG5cdFx0XHRvcHRpb25zLmluZGV4ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFJlLW9wZW4gZWRpdG9yIHVubGVzcyBhbHJlYWR5IG9wZW5lZFxuXHRcdGxldCBlZGl0b3JQYW5lOiBJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoIXRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLmNvbnRhaW5zKGxhc3RDbG9zZWRFZGl0b3IuZWRpdG9yKSkge1xuXG5cdFx0XHQvLyBGaXggZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDc4NTBcblx0XHRcdC8vIElmIG9wZW5pbmcgYW4gZWRpdG9yIGZhaWxzLCBpdCBpcyBwb3NzaWJsZSB0aGF0IHdlIGdldFxuXHRcdFx0Ly8gYW5vdGhlciBlZGl0b3ItY2xvc2UgZXZlbnQgYXMgYSByZXN1bHQuIEJ1dCB3ZSByZWFsbHkgZG9cblx0XHRcdC8vIHdhbnQgdG8gaWdub3JlIHRoYXQgaW4gb3VyIGxpc3Qgb2YgcmVjZW50bHkgY2xvc2VkIGVkaXRvcnNcblx0XHRcdC8vICB0byBwcmV2ZW50IGVuZGxlc3MgbG9vcHMuXG5cblx0XHRcdHRoaXMuaWdub3JlRWRpdG9yQ2xvc2VFdmVudCA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRlZGl0b3JQYW5lID0gYXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdC4uLmxhc3RDbG9zZWRFZGl0b3IuZWRpdG9yLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdC4uLmxhc3RDbG9zZWRFZGl0b3IuZWRpdG9yLm9wdGlvbnMsXG5cdFx0XHRcdFx0XHQuLi5vcHRpb25zXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuaWdub3JlRWRpdG9yQ2xvc2VFdmVudCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3JQYW5lO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVGcm9tUmVjZW50bHlDbG9zZWRFZGl0b3JzKGFyZzE6IEVkaXRvcklucHV0IHwgRmlsZUNoYW5nZXNFdmVudCB8IEZpbGVPcGVyYXRpb25FdmVudCk6IHZvaWQge1xuXHRcdHRoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzID0gdGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnMuZmlsdGVyKHJlY2VudGx5Q2xvc2VkRWRpdG9yID0+IHtcblx0XHRcdGlmIChpc0VkaXRvcklucHV0KGFyZzEpICYmIHJlY2VudGx5Q2xvc2VkRWRpdG9yLmVkaXRvcklkICE9PSBhcmcxLmVkaXRvcklkKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlOyAvLyBrZWVwOiBkaWZmZXJlbnQgZWRpdG9yIGlkZW50aWZpZXJzXG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZWNlbnRseUNsb3NlZEVkaXRvci5yZXNvdXJjZSAmJiB0aGlzLmVkaXRvckhlbHBlci5tYXRjaGVzRmlsZShyZWNlbnRseUNsb3NlZEVkaXRvci5yZXNvdXJjZSwgYXJnMSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyByZW1vdmU6IGVkaXRvciBtYXRjaGVzIGRpcmVjdGx5XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZWNlbnRseUNsb3NlZEVkaXRvci5hc3NvY2lhdGVkUmVzb3VyY2VzLnNvbWUoYXNzb2NpYXRlZFJlc291cmNlID0+IHRoaXMuZWRpdG9ySGVscGVyLm1hdGNoZXNGaWxlKGFzc29jaWF0ZWRSZXNvdXJjZSwgYXJnMSkpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gcmVtb3ZlOiBhbiBhc3NvY2lhdGVkIHJlc291cmNlIG1hdGNoZXNcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7IC8vIGtlZXBcblx0XHR9KTtcblxuXHRcdC8vIFVwZGF0ZSBjb250ZXh0XG5cdFx0dGhpcy5jYW5SZW9wZW5DbG9zZWRFZGl0b3JDb250ZXh0S2V5LnNldCh0aGlzLnJlY2VudGx5Q2xvc2VkRWRpdG9ycy5sZW5ndGggPiAwKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBHbyB0bzogUmVjZW50bHkgT3BlbmVkIEVkaXRvciAobGltaXQ6IDIwMCwgcGVyc2lzdGVkKVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9ISVNUT1JZX0lURU1TID0gMjAwO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBISVNUT1JZX1NUT1JBR0VfS0VZID0gJ2hpc3RvcnkuZW50cmllcyc7XG5cblx0cHJpdmF0ZSBoaXN0b3J5OiBBcnJheTxFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0PiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvckhpc3RvcnlMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxFZGl0b3JJbnB1dCwgRGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlc291cmNlRXhjbHVkZU1hdGNoZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgV2luZG93SWRsZVZhbHVlKG1haW5XaW5kb3csICgpID0+IHtcblx0XHRjb25zdCBtYXRjaGVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFJlc291cmNlR2xvYk1hdGNoZXIsXG5cdFx0XHRyb290ID0+IGdldEV4Y2x1ZGVzKHJvb3QgPyB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uPih7IHJlc291cmNlOiByb290IH0pIDogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvbj4oKSkgfHwgT2JqZWN0LmNyZWF0ZShudWxsKSxcblx0XHRcdGV2ZW50ID0+IGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKEZJTEVTX0VYQ0xVREVfQ09ORklHKSB8fCBldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihTRUFSQ0hfRVhDTFVERV9DT05GSUcpXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihtYXRjaGVyLm9uRXhwcmVzc2lvbkNoYW5nZSgoKSA9PiB0aGlzLnJlbW92ZUV4Y2x1ZGVkRnJvbUhpc3RvcnkoKSkpO1xuXG5cdFx0cmV0dXJuIG1hdGNoZXI7XG5cdH0pKTtcblxuXHRwcml2YXRlIGhhbmRsZUFjdGl2ZUVkaXRvckNoYW5nZUluSGlzdG9yeShlZGl0b3JQYW5lPzogSUVkaXRvclBhbmUpOiB2b2lkIHtcblxuXHRcdC8vIEVuc3VyZSB3ZSBoYXZlIG5vdCBjb25maWd1cmVkIHRvIGV4Y2x1ZGUgaW5wdXQgYW5kIGRvbid0IHRyYWNrIGludmFsaWQgaW5wdXRzXG5cdFx0Y29uc3QgZWRpdG9yID0gZWRpdG9yUGFuZT8uaW5wdXQ7XG5cdFx0aWYgKCFlZGl0b3IgfHwgZWRpdG9yLmlzRGlzcG9zZWQoKSB8fCAhdGhpcy5pbmNsdWRlSW5IaXN0b3J5KGVkaXRvcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgYW55IGV4aXN0aW5nIGVudHJ5IGFuZCBhZGQgdG8gdGhlIGJlZ2lubmluZ1xuXHRcdHRoaXMucmVtb3ZlRnJvbUhpc3RvcnkoZWRpdG9yKTtcblx0XHR0aGlzLmFkZFRvSGlzdG9yeShlZGl0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRUb0hpc3RvcnkoZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0LCBpbnNlcnRGaXJzdCA9IHRydWUpOiB2b2lkIHtcblx0XHR0aGlzLmVuc3VyZUhpc3RvcnlMb2FkZWQodGhpcy5oaXN0b3J5KTtcblxuXHRcdGNvbnN0IGhpc3RvcnlJbnB1dCA9IHRoaXMuZWRpdG9ySGVscGVyLnByZWZlclJlc291cmNlRWRpdG9ySW5wdXQoZWRpdG9yKTtcblx0XHRpZiAoIWhpc3RvcnlJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEluc2VydCBiYXNlZCBvbiBwcmVmZXJlbmNlXG5cdFx0aWYgKGluc2VydEZpcnN0KSB7XG5cdFx0XHR0aGlzLmhpc3RvcnkudW5zaGlmdChoaXN0b3J5SW5wdXQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmhpc3RvcnkucHVzaChoaXN0b3J5SW5wdXQpO1xuXHRcdH1cblxuXHRcdC8vIFJlc3BlY3QgbWF4IGVudHJpZXMgc2V0dGluZ1xuXHRcdGlmICh0aGlzLmhpc3RvcnkubGVuZ3RoID4gSGlzdG9yeVNlcnZpY2UuTUFYX0hJU1RPUllfSVRFTVMpIHtcblx0XHRcdHRoaXMuZWRpdG9ySGVscGVyLmNsZWFyT25FZGl0b3JEaXNwb3NlKHRoaXMuaGlzdG9yeS5wb3AoKSEsIHRoaXMuZWRpdG9ySGlzdG9yeUxpc3RlbmVycyk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVhY3QgdG8gZWRpdG9yIGlucHV0IGRpc3Bvc2luZ1xuXHRcdGlmIChpc0VkaXRvcklucHV0KGVkaXRvcikpIHtcblx0XHRcdHRoaXMuZWRpdG9ySGVscGVyLm9uRWRpdG9yRGlzcG9zZShlZGl0b3IsICgpID0+IHRoaXMudXBkYXRlSGlzdG9yeU9uRWRpdG9yRGlzcG9zZShoaXN0b3J5SW5wdXQpLCB0aGlzLmVkaXRvckhpc3RvcnlMaXN0ZW5lcnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSGlzdG9yeU9uRWRpdG9yRGlzcG9zZShlZGl0b3I6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQpOiB2b2lkIHtcblx0XHRpZiAoaXNFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cblx0XHRcdC8vIEFueSBub24gc2lkZS1ieS1zaWRlIGVkaXRvciBpbnB1dCBnZXRzIHJlbW92ZWQgZGlyZWN0bHkgb24gZGlzcG9zZVxuXHRcdFx0aWYgKCFpc1NpZGVCeVNpZGVFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlRnJvbUhpc3RvcnkoZWRpdG9yKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2lkZS1ieS1zaWRlIGVkaXRvcnMgZ2V0IHNwZWNpYWwgdHJlYXRtZW50OiB3ZSB0cnkgdG8gZGlzdGlsbCB0aGVcblx0XHRcdC8vIHBvc3NpYmx5IHVudHlwZWQgcmVzb3VyY2UgaW5wdXRzIGZyb20gYm90aCBzaWRlcyB0byBiZSBhYmxlIHRvXG5cdFx0XHQvLyBvZmZlciB0aGVzZSBlbnRyaWVzIGZyb20gdGhlIGhpc3RvcnkgdG8gdGhlIHVzZXIgc3RpbGwgdW5sZXNzXG5cdFx0XHQvLyB0aGV5IGFyZSBleGNsdWRlZC5cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZUlucHV0czogSVJlc291cmNlRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBzaWRlSW5wdXRzID0gZWRpdG9yLnByaW1hcnkubWF0Y2hlcyhlZGl0b3Iuc2Vjb25kYXJ5KSA/IFtlZGl0b3IucHJpbWFyeV0gOiBbZWRpdG9yLnByaW1hcnksIGVkaXRvci5zZWNvbmRhcnldO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNpZGVJbnB1dCBvZiBzaWRlSW5wdXRzKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2FuZGlkYXRlUmVzb3VyY2VJbnB1dCA9IHRoaXMuZWRpdG9ySGVscGVyLnByZWZlclJlc291cmNlRWRpdG9ySW5wdXQoc2lkZUlucHV0KTtcblx0XHRcdFx0XHRpZiAoaXNSZXNvdXJjZUVkaXRvcklucHV0KGNhbmRpZGF0ZVJlc291cmNlSW5wdXQpICYmIHRoaXMuaW5jbHVkZUluSGlzdG9yeShjYW5kaWRhdGVSZXNvdXJjZUlucHV0KSkge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2VJbnB1dHMucHVzaChjYW5kaWRhdGVSZXNvdXJjZUlucHV0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJbnNlcnQgdGhlIHVudHlwZWQgcmVzb3VyY2UgaW5wdXRzIHdoZXJlIG91ciBkaXNwb3NlZFxuXHRcdFx0XHQvLyBzaWRlLWJ5LXNpZGUgZWRpdG9yIGlucHV0IGlzIGluIHRoZSBoaXN0b3J5IHN0YWNrXG5cdFx0XHRcdHRoaXMucmVwbGFjZUluSGlzdG9yeShlZGl0b3IsIC4uLnJlc291cmNlSW5wdXRzKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXG5cdFx0XHQvLyBSZW1vdmUgYW55IGVkaXRvciB0aGF0IHNob3VsZCBub3QgYmUgaW5jbHVkZWQgaW4gaGlzdG9yeVxuXHRcdFx0aWYgKCF0aGlzLmluY2x1ZGVJbkhpc3RvcnkoZWRpdG9yKSkge1xuXHRcdFx0XHR0aGlzLnJlbW92ZUZyb21IaXN0b3J5KGVkaXRvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpbmNsdWRlSW5IaXN0b3J5KGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc0VkaXRvcklucHV0KGVkaXRvcikpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBpbmNsdWRlIGFueSBub24gZmlsZXNcblx0XHR9XG5cblx0XHRyZXR1cm4gIXRoaXMucmVzb3VyY2VFeGNsdWRlTWF0Y2hlci52YWx1ZS5tYXRjaGVzKGVkaXRvci5yZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUV4Y2x1ZGVkRnJvbUhpc3RvcnkoKTogdm9pZCB7XG5cdFx0dGhpcy5lbnN1cmVIaXN0b3J5TG9hZGVkKHRoaXMuaGlzdG9yeSk7XG5cblx0XHR0aGlzLmhpc3RvcnkgPSB0aGlzLmhpc3RvcnkuZmlsdGVyKGVudHJ5ID0+IHtcblx0XHRcdGNvbnN0IGluY2x1ZGUgPSB0aGlzLmluY2x1ZGVJbkhpc3RvcnkoZW50cnkpO1xuXG5cdFx0XHQvLyBDbGVhbnVwIGFueSBsaXN0ZW5lcnMgYXNzb2NpYXRlZCB3aXRoIHRoZSBpbnB1dCB3aGVuIHJlbW92aW5nIGZyb20gaGlzdG9yeVxuXHRcdFx0aWYgKCFpbmNsdWRlKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9ySGVscGVyLmNsZWFyT25FZGl0b3JEaXNwb3NlKGVudHJ5LCB0aGlzLmVkaXRvckhpc3RvcnlMaXN0ZW5lcnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaW5jbHVkZTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgbW92ZUluSGlzdG9yeShldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGV2ZW50LmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uTU9WRSkpIHtcblx0XHRcdGNvbnN0IHJlbW92ZWQgPSB0aGlzLnJlbW92ZUZyb21IaXN0b3J5KGV2ZW50KTtcblx0XHRcdGlmIChyZW1vdmVkKSB7XG5cdFx0XHRcdHRoaXMuYWRkVG9IaXN0b3J5KHsgcmVzb3VyY2U6IGV2ZW50LnRhcmdldC5yZXNvdXJjZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZW1vdmVGcm9tSGlzdG9yeShhcmcxOiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0IHwgRmlsZUNoYW5nZXNFdmVudCB8IEZpbGVPcGVyYXRpb25FdmVudCk6IGJvb2xlYW4ge1xuXHRcdGxldCByZW1vdmVkID0gZmFsc2U7XG5cblx0XHR0aGlzLmVuc3VyZUhpc3RvcnlMb2FkZWQodGhpcy5oaXN0b3J5KTtcblxuXHRcdHRoaXMuaGlzdG9yeSA9IHRoaXMuaGlzdG9yeS5maWx0ZXIoZW50cnkgPT4ge1xuXHRcdFx0Y29uc3QgbWF0Y2hlcyA9IHRoaXMuZWRpdG9ySGVscGVyLm1hdGNoZXNFZGl0b3IoYXJnMSwgZW50cnkpO1xuXG5cdFx0XHQvLyBDbGVhbnVwIGFueSBsaXN0ZW5lcnMgYXNzb2NpYXRlZCB3aXRoIHRoZSBpbnB1dCB3aGVuIHJlbW92aW5nIGZyb20gaGlzdG9yeVxuXHRcdFx0aWYgKG1hdGNoZXMpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3JIZWxwZXIuY2xlYXJPbkVkaXRvckRpc3Bvc2UoYXJnMSwgdGhpcy5lZGl0b3JIaXN0b3J5TGlzdGVuZXJzKTtcblx0XHRcdFx0cmVtb3ZlZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAhbWF0Y2hlcztcblx0XHR9KTtcblxuXHRcdHJldHVybiByZW1vdmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZXBsYWNlSW5IaXN0b3J5KGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dCwgLi4ucmVwbGFjZW1lbnRzOiBSZWFkb25seUFycmF5PEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQ+KTogdm9pZCB7XG5cdFx0dGhpcy5lbnN1cmVIaXN0b3J5TG9hZGVkKHRoaXMuaGlzdG9yeSk7XG5cblx0XHRsZXQgcmVwbGFjZWQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IG5ld0hpc3Rvcnk6IEFycmF5PEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQ+ID0gW107XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLmhpc3RvcnkpIHtcblxuXHRcdFx0Ly8gRW50cnkgbWF0Y2hlcyBhbmQgaXMgZ29pbmcgdG8gYmUgZGlzcG9zZWQgKyByZXBsYWNlZFxuXHRcdFx0aWYgKHRoaXMuZWRpdG9ySGVscGVyLm1hdGNoZXNFZGl0b3IoZWRpdG9yLCBlbnRyeSkpIHtcblxuXHRcdFx0XHQvLyBDbGVhbnVwIGFueSBsaXN0ZW5lcnMgYXNzb2NpYXRlZCB3aXRoIHRoZSBpbnB1dCB3aGVuIHJlcGxhY2luZyBmcm9tIGhpc3Rvcnlcblx0XHRcdFx0dGhpcy5lZGl0b3JIZWxwZXIuY2xlYXJPbkVkaXRvckRpc3Bvc2UoZWRpdG9yLCB0aGlzLmVkaXRvckhpc3RvcnlMaXN0ZW5lcnMpO1xuXG5cdFx0XHRcdC8vIEluc2VydCByZXBsYWNlbWVudHMgYnV0IG9ubHkgb25jZVxuXHRcdFx0XHRpZiAoIXJlcGxhY2VkKSB7XG5cdFx0XHRcdFx0bmV3SGlzdG9yeS5wdXNoKC4uLnJlcGxhY2VtZW50cyk7XG5cdFx0XHRcdFx0cmVwbGFjZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVudHJ5IGRvZXMgbm90IG1hdGNoLCBidXQgb25seSBhZGQgaXQgaWYgaXQgZGlkbid0IG1hdGNoXG5cdFx0XHQvLyBvdXIgcmVwbGFjZW1lbnRzIGFscmVhZHlcblx0XHRcdGVsc2UgaWYgKCFyZXBsYWNlbWVudHMuc29tZShyZXBsYWNlbWVudCA9PiB0aGlzLmVkaXRvckhlbHBlci5tYXRjaGVzRWRpdG9yKHJlcGxhY2VtZW50LCBlbnRyeSkpKSB7XG5cdFx0XHRcdG5ld0hpc3RvcnkucHVzaChlbnRyeSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIHRhcmdldCBlZGl0b3IgdG8gcmVwbGFjZSB3YXMgbm90IGZvdW5kLCBtYWtlIHN1cmUgdG9cblx0XHQvLyBpbnNlcnQgdGhlIHJlcGxhY2VtZW50cyB0byB0aGUgZW5kIHRvIGVuc3VyZSB3ZSBnb3QgdGhlbVxuXHRcdGlmICghcmVwbGFjZWQpIHtcblx0XHRcdG5ld0hpc3RvcnkucHVzaCguLi5yZXBsYWNlbWVudHMpO1xuXHRcdH1cblxuXHRcdHRoaXMuaGlzdG9yeSA9IG5ld0hpc3Rvcnk7XG5cdH1cblxuXHRjbGVhclJlY2VudGx5T3BlbmVkKCk6IHZvaWQge1xuXHRcdHRoaXMuaGlzdG9yeSA9IFtdO1xuXG5cdFx0dGhpcy5lZGl0b3JIaXN0b3J5TGlzdGVuZXJzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHR9XG5cblx0Z2V0SGlzdG9yeSgpOiByZWFkb25seSAoRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dClbXSB7XG5cdFx0dGhpcy5lbnN1cmVIaXN0b3J5TG9hZGVkKHRoaXMuaGlzdG9yeSk7XG5cblx0XHRyZXR1cm4gdGhpcy5oaXN0b3J5O1xuXHR9XG5cblx0cHJpdmF0ZSBlbnN1cmVIaXN0b3J5TG9hZGVkKGhpc3Rvcnk6IEFycmF5PEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQ+IHwgdW5kZWZpbmVkKTogYXNzZXJ0cyBoaXN0b3J5IHtcblx0XHRpZiAoIXRoaXMuaGlzdG9yeSkge1xuXG5cdFx0XHQvLyBVbnRpbCBoaXN0b3J5IGlzIGxvYWRlZCwgaXQgaXMganVzdCBlbXB0eVxuXHRcdFx0dGhpcy5oaXN0b3J5ID0gW107XG5cblx0XHRcdC8vIFdlIHdhbnQgdG8gc2VlZCBoaXN0b3J5IGZyb20gb3BlbmVkIGVkaXRvcnNcblx0XHRcdC8vIHRvbyBhcyB3ZWxsIGFzIHByZXZpb3VzIHN0b3JlZCBzdGF0ZSwgc28gd2Vcblx0XHRcdC8vIG5lZWQgdG8gd2FpdCBmb3IgdGhlIGVkaXRvciBncm91cHMgYmVpbmcgcmVhZHlcblx0XHRcdGlmICh0aGlzLmVkaXRvckdyb3VwU2VydmljZS5pc1JlYWR5KSB7XG5cdFx0XHRcdHRoaXMubG9hZEhpc3RvcnkoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JHcm91cFNlcnZpY2Uud2hlblJlYWR5O1xuXG5cdFx0XHRcdFx0dGhpcy5sb2FkSGlzdG9yeSgpO1xuXHRcdFx0XHR9KSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbG9hZEhpc3RvcnkoKTogdm9pZCB7XG5cblx0XHQvLyBJbml0IGFzIGVtcHR5IGJlZm9yZSBhZGRpbmcgLSBzaW5jZSB3ZSBhcmUgYWJvdXQgdG9cblx0XHQvLyBwb3B1bGF0ZSB0aGUgaGlzdG9yeSBmcm9tIG9wZW5lZCBlZGl0b3JzLCB3ZSBjYXB0dXJlXG5cdFx0Ly8gdGhlIHJpZ2h0IG9yZGVyIGhlcmUuXG5cdFx0dGhpcy5oaXN0b3J5ID0gW107XG5cblx0XHQvLyBBbGwgc3RvcmVkIGVkaXRvcnMgZnJvbSBwcmV2aW91cyBzZXNzaW9uXG5cdFx0Y29uc3Qgc3RvcmVkRWRpdG9ySGlzdG9yeSA9IHRoaXMubG9hZEhpc3RvcnlGcm9tU3RvcmFnZSgpO1xuXG5cdFx0Ly8gQWxsIHJlc3RvcmVkIGVkaXRvcnMgZnJvbSBwcmV2aW91cyBzZXNzaW9uXG5cdFx0Ly8gaW4gcmV2ZXJzZSBlZGl0b3IgZnJvbSBsZWFzdCB0byBtb3N0IHJlY2VudGx5XG5cdFx0Ly8gdXNlZC5cblx0XHRjb25zdCBvcGVuZWRFZGl0b3JzTHJ1ID0gWy4uLnRoaXMuZWRpdG9yU2VydmljZS5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSldLnJldmVyc2UoKTtcblxuXHRcdC8vIFdlIHdhbnQgdG8gbWVyZ2UgdGhlIG9wZW5lZCBlZGl0b3JzIGZyb20gdGhlIGxhc3Rcblx0XHQvLyBzZXNzaW9uIHdpdGggdGhlIHN0b3JlZCBlZGl0b3JzIGZyb20gdGhlIGxhc3Rcblx0XHQvLyBzZXNzaW9uLiBCZWNhdXNlIG5vdCBhbGwgZWRpdG9ycyBjYW4gYmUgc2VyaWFsaXNlZFxuXHRcdC8vIHdlIHdhbnQgdG8gbWFrZSBzdXJlIHRvIGluY2x1ZGUgYWxsIG9wZW5lZCBlZGl0b3JzXG5cdFx0Ly8gdG9vLlxuXHRcdC8vIE9wZW5lZCBlZGl0b3JzIHNob3VsZCBhbHdheXMgYmUgZmlyc3QgaW4gdGhlIGhpc3RvcnlcblxuXHRcdGNvbnN0IGhhbmRsZWRFZGl0b3JzID0gbmV3IFNldDxzdHJpbmcgLyogcmVzb3VyY2UgKyBlZGl0b3JJZCAqLz4oKTtcblxuXHRcdC8vIEFkZCBhbGwgb3BlbmVkIGVkaXRvcnMgZmlyc3Rcblx0XHRmb3IgKGNvbnN0IHsgZWRpdG9yIH0gb2Ygb3BlbmVkRWRpdG9yc0xydSkge1xuXHRcdFx0aWYgKCF0aGlzLmluY2x1ZGVJbkhpc3RvcnkoZWRpdG9yKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWFrZSBzdXJlIHRvIHNraXAgZHVwbGljYXRlcyBmcm9tIHRoZSBlZGl0b3JzIExSVVxuXHRcdFx0aWYgKGVkaXRvci5yZXNvdXJjZSkge1xuXHRcdFx0XHRjb25zdCBoaXN0b3J5RW50cnlJZCA9IGAke2VkaXRvci5yZXNvdXJjZS50b1N0cmluZygpfS8ke2VkaXRvci5lZGl0b3JJZH1gO1xuXHRcdFx0XHRpZiAoaGFuZGxlZEVkaXRvcnMuaGFzKGhpc3RvcnlFbnRyeUlkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlOyAvLyBhbHJlYWR5IGFkZGVkXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRoYW5kbGVkRWRpdG9ycy5hZGQoaGlzdG9yeUVudHJ5SWQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBZGQgaW50byBoaXN0b3J5XG5cdFx0XHR0aGlzLmFkZFRvSGlzdG9yeShlZGl0b3IpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCByZW1haW5pbmcgZnJvbSBzdG9yYWdlIGlmIG5vdCB0aGVyZSBhbHJlYWR5XG5cdFx0Ly8gV2UgY2hlY2sgb24gcmVzb3VyY2UgYW5kIGBlZGl0b3JJZGAgKGZyb20gYG92ZXJyaWRlYClcblx0XHQvLyB0byBmaWd1cmUgb3V0IGlmIHRoZSBlZGl0b3IgaGFzIGJlZW4gYWxyZWFkeSBhZGRlZC5cblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBzdG9yZWRFZGl0b3JIaXN0b3J5KSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5RW50cnlJZCA9IGAke2VkaXRvci5yZXNvdXJjZS50b1N0cmluZygpfS8ke2VkaXRvci5vcHRpb25zPy5vdmVycmlkZX1gO1xuXHRcdFx0aWYgKFxuXHRcdFx0XHQhaGFuZGxlZEVkaXRvcnMuaGFzKGhpc3RvcnlFbnRyeUlkKSAmJlxuXHRcdFx0XHR0aGlzLmluY2x1ZGVJbkhpc3RvcnkoZWRpdG9yKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGhhbmRsZWRFZGl0b3JzLmFkZChoaXN0b3J5RW50cnlJZCk7XG5cdFx0XHRcdHRoaXMuYWRkVG9IaXN0b3J5KGVkaXRvciwgZmFsc2UgLyogYXQgdGhlIGVuZCAqLyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsb2FkSGlzdG9yeUZyb21TdG9yYWdlKCk6IEFycmF5PElSZXNvdXJjZUVkaXRvcklucHV0PiB7XG5cdFx0Y29uc3QgZW50cmllczogSVJlc291cmNlRWRpdG9ySW5wdXRbXSA9IFtdO1xuXG5cdFx0Y29uc3QgZW50cmllc1JhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEhpc3RvcnlTZXJ2aWNlLkhJU1RPUllfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmIChlbnRyaWVzUmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzUGFyc2VkOiBJU2VyaWFsaXplZEVkaXRvckhpc3RvcnlFbnRyeVtdID0gSlNPTi5wYXJzZShlbnRyaWVzUmF3KTtcblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeVBhcnNlZCBvZiBlbnRyaWVzUGFyc2VkKSB7XG5cdFx0XHRcdFx0aWYgKCFlbnRyeVBhcnNlZC5lZGl0b3IgfHwgIWVudHJ5UGFyc2VkLmVkaXRvci5yZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7IC8vIHVuZXhwZWN0ZWQgZGF0YSBmb3JtYXRcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0Li4uZW50cnlQYXJzZWQuZWRpdG9yLFxuXHRcdFx0XHRcdFx0XHRyZXNvdXJjZTogdHlwZW9mIGVudHJ5UGFyc2VkLmVkaXRvci5yZXNvdXJjZSA9PT0gJ3N0cmluZycgP1xuXHRcdFx0XHRcdFx0XHRcdFVSSS5wYXJzZShlbnRyeVBhcnNlZC5lZGl0b3IucmVzb3VyY2UpIDogIFx0Ly8gIGZyb20gMS42Ny54OiBVUkkgaXMgc3RvcmVkIGVmZmljaWVudGx5IGFzIFVSSS50b1N0cmluZygpXG5cdFx0XHRcdFx0XHRcdFx0VVJJLmZyb20oZW50cnlQYXJzZWQuZWRpdG9yLnJlc291cmNlKVx0XHQvLyB1bnRpbCAxLjY2Lng6IFVSSSB3YXMgc3RvcmVkIHZlcnkgdmVyYm9zZSBhcyBVUkkudG9KU09OKClcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7IC8vIGRvIG5vdCBmYWlsIGVudGlyZSBoaXN0b3J5IHdoZW4gb25lIGVudHJ5IGZhaWxzXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7IC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85OTA3NVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlbnRyaWVzO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmhpc3RvcnkpIHtcblx0XHRcdHJldHVybjsgLy8gbm90aGluZyB0byBzYXZlIGJlY2F1c2UgaGlzdG9yeSB3YXMgbm90IHVzZWRcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyaWVzOiBJU2VyaWFsaXplZEVkaXRvckhpc3RvcnlFbnRyeVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgdGhpcy5oaXN0b3J5KSB7XG5cdFx0XHRpZiAoaXNFZGl0b3JJbnB1dChlZGl0b3IpIHx8ICFpc1Jlc291cmNlRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gb25seSBzYXZlIHJlc291cmNlIGVkaXRvciBpbnB1dHNcblx0XHRcdH1cblxuXHRcdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdFx0ZWRpdG9yOiB7XG5cdFx0XHRcdFx0Li4uZWRpdG9yLFxuXHRcdFx0XHRcdHJlc291cmNlOiBlZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEhpc3RvcnlTZXJ2aWNlLkhJU1RPUllfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KGVudHJpZXMpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIExhc3QgQWN0aXZlIFdvcmtzcGFjZS9GaWxlXG5cblx0Z2V0TGFzdEFjdGl2ZVdvcmtzcGFjZVJvb3Qoc2NoZW1lRmlsdGVyPzogc3RyaW5nLCBhdXRob3JpdHlGaWx0ZXI/OiBzdHJpbmcpOiBVUkkgfCB1bmRlZmluZWQge1xuXG5cdFx0Ly8gTm8gRm9sZGVyOiByZXR1cm4gZWFybHlcblx0XHRjb25zdCBmb2xkZXJzID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdGlmIChmb2xkZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBTaW5nbGUgRm9sZGVyOiByZXR1cm4gZWFybHlcblx0XHRpZiAoZm9sZGVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gZm9sZGVyc1swXS51cmk7XG5cdFx0XHRpZiAoKCFzY2hlbWVGaWx0ZXIgfHwgcmVzb3VyY2Uuc2NoZW1lID09PSBzY2hlbWVGaWx0ZXIpICYmICghYXV0aG9yaXR5RmlsdGVyIHx8IHJlc291cmNlLmF1dGhvcml0eSA9PT0gYXV0aG9yaXR5RmlsdGVyKSkge1xuXHRcdFx0XHRyZXR1cm4gcmVzb3VyY2U7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gTXVsdGlwbGUgZm9sZGVyczogZmluZCB0aGUgbGFzdCBhY3RpdmUgb25lXG5cdFx0Zm9yIChjb25zdCBpbnB1dCBvZiB0aGlzLmdldEhpc3RvcnkoKSkge1xuXHRcdFx0aWYgKGlzRWRpdG9ySW5wdXQoaW5wdXQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2NoZW1lRmlsdGVyICYmIGlucHV0LnJlc291cmNlLnNjaGVtZSAhPT0gc2NoZW1lRmlsdGVyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYXV0aG9yaXR5RmlsdGVyICYmIGlucHV0LnJlc291cmNlLmF1dGhvcml0eSAhPT0gYXV0aG9yaXR5RmlsdGVyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXNvdXJjZVdvcmtzcGFjZSA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKGlucHV0LnJlc291cmNlKTtcblx0XHRcdGlmIChyZXNvdXJjZVdvcmtzcGFjZSkge1xuXHRcdFx0XHRyZXR1cm4gcmVzb3VyY2VXb3Jrc3BhY2UudXJpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZhbGxiYWNrIHRvIGZpcnN0IHdvcmtzcGFjZSBtYXRjaGluZyBzY2hlbWUgZmlsdGVyIGlmIGFueVxuXHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIGZvbGRlcnMpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gZm9sZGVyLnVyaTtcblx0XHRcdGlmICgoIXNjaGVtZUZpbHRlciB8fCByZXNvdXJjZS5zY2hlbWUgPT09IHNjaGVtZUZpbHRlcikgJiYgKCFhdXRob3JpdHlGaWx0ZXIgfHwgcmVzb3VyY2UuYXV0aG9yaXR5ID09PSBhdXRob3JpdHlGaWx0ZXIpKSB7XG5cdFx0XHRcdHJldHVybiByZXNvdXJjZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0TGFzdEFjdGl2ZUZpbGUoZmlsdGVyQnlTY2hlbWU6IHN0cmluZywgZmlsdGVyQnlBdXRob3JpdHk/OiBzdHJpbmcpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgaW5wdXQgb2YgdGhpcy5nZXRIaXN0b3J5KCkpIHtcblx0XHRcdGxldCByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGlzRWRpdG9ySW5wdXQoaW5wdXQpKSB7XG5cdFx0XHRcdHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShpbnB1dCwgeyBmaWx0ZXJCeVNjaGVtZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc291cmNlID0gaW5wdXQucmVzb3VyY2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXNvdXJjZSAmJiByZXNvdXJjZS5zY2hlbWUgPT09IGZpbHRlckJ5U2NoZW1lICYmICghZmlsdGVyQnlBdXRob3JpdHkgfHwgcmVzb3VyY2UuYXV0aG9yaXR5ID09PSBmaWx0ZXJCeUF1dGhvcml0eSkpIHtcblx0XHRcdFx0cmV0dXJuIHJlc291cmNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdGZvciAoY29uc3QgWywgc3RhY2tdIG9mIHRoaXMuZWRpdG9yR3JvdXBTY29wZWROYXZpZ2F0aW9uU3RhY2tzKSB7XG5cdFx0XHRzdGFjay5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFssIGVkaXRvcnNdIG9mIHRoaXMuZWRpdG9yU2NvcGVkTmF2aWdhdGlvblN0YWNrcykge1xuXHRcdFx0Zm9yIChjb25zdCBbLCBzdGFja10gb2YgZWRpdG9ycykge1xuXHRcdFx0XHRzdGFjay5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFssIGxpc3RlbmVyXSBvZiB0aGlzLmVkaXRvckhpc3RvcnlMaXN0ZW5lcnMpIHtcblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUhpc3RvcnlTZXJ2aWNlLCBIaXN0b3J5U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xuXG5jbGFzcyBFZGl0b3JTZWxlY3Rpb25TdGF0ZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JJZGVudGlmaWVyOiBJRWRpdG9ySWRlbnRpZmllcixcblx0XHRyZWFkb25seSBzZWxlY3Rpb246IElFZGl0b3JQYW5lU2VsZWN0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVhc29uOiBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uIHwgdW5kZWZpbmVkXG5cdCkgeyB9XG5cblx0anVzdGlmaWVzTmV3TmF2aWdhdGlvbkVudHJ5KG90aGVyOiBFZGl0b3JTZWxlY3Rpb25TdGF0ZSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmVkaXRvcklkZW50aWZpZXIuZ3JvdXBJZCAhPT0gb3RoZXIuZWRpdG9ySWRlbnRpZmllci5ncm91cElkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gZGlmZmVyZW50IGdyb3VwXG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmVkaXRvcklkZW50aWZpZXIuZWRpdG9yLm1hdGNoZXMob3RoZXIuZWRpdG9ySWRlbnRpZmllci5lZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gZGlmZmVyZW50IGVkaXRvclxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5zZWxlY3Rpb24gfHwgIW90aGVyLnNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIHVua25vd24gc2VsZWN0aW9uc1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuc2VsZWN0aW9uLmNvbXBhcmUob3RoZXIuc2VsZWN0aW9uKTtcblxuXHRcdGlmIChyZXN1bHQgPT09IEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0LlNJTUlMQVIgJiYgKG90aGVyLnJlYXNvbiA9PT0gRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5OQVZJR0FUSU9OIHx8IG90aGVyLnJlYXNvbiA9PT0gRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5KVU1QKSkge1xuXHRcdFx0Ly8gbGV0IG5hdmlnYXRpb24gc291cmNlcyB3aW4gZXZlbiBpZiB0aGUgc2VsZWN0aW9uIGlzIGBTSU1JTEFSYFxuXHRcdFx0Ly8gKGUuZy4gXCJHbyB0byBkZWZpbml0aW9uXCIgc2hvdWxkIGFkZCBhIGhpc3RvcnkgZW50cnkpXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0ID09PSBFZGl0b3JQYW5lU2VsZWN0aW9uQ29tcGFyZVJlc3VsdC5ESUZGRVJFTlQ7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD47XG5cblx0Y2FuR29Gb3J3YXJkKGZpbHRlcj86IEdvRmlsdGVyKTogYm9vbGVhbjtcblx0Z29Gb3J3YXJkKGZpbHRlcj86IEdvRmlsdGVyKTogUHJvbWlzZTx2b2lkPjtcblx0Y2FuR29CYWNrKGZpbHRlcj86IEdvRmlsdGVyKTogYm9vbGVhbjtcblx0Z29CYWNrKGZpbHRlcj86IEdvRmlsdGVyKTogUHJvbWlzZTx2b2lkPjtcblx0Z29QcmV2aW91cyhmaWx0ZXI/OiBHb0ZpbHRlcik6IFByb21pc2U8dm9pZD47XG5cdGNhbkdvTGFzdChmaWx0ZXI/OiBHb0ZpbHRlcik6IGJvb2xlYW47XG5cdGdvTGFzdChmaWx0ZXI/OiBHb0ZpbHRlcik6IFByb21pc2U8dm9pZD47XG5cblx0aGFuZGxlQWN0aXZlRWRpdG9yQ2hhbmdlKGVkaXRvclBhbmU/OiBJRWRpdG9yUGFuZSk6IHZvaWQ7XG5cdGhhbmRsZUFjdGl2ZUVkaXRvclNlbGVjdGlvbkNoYW5nZShlZGl0b3JQYW5lOiBJRWRpdG9yUGFuZVdpdGhTZWxlY3Rpb24sIGV2ZW50OiBJRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZUV2ZW50KTogdm9pZDtcblxuXHRjbGVhcigpOiB2b2lkO1xuXHRyZW1vdmUoYXJnMTogRWRpdG9ySW5wdXQgfCBGaWxlQ2hhbmdlc0V2ZW50IHwgRmlsZU9wZXJhdGlvbkV2ZW50IHwgR3JvdXBJZGVudGlmaWVyKTogdm9pZDtcblx0bW92ZShldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50KTogdm9pZDtcbn1cblxuY2xhc3MgRWRpdG9yTmF2aWdhdGlvblN0YWNrcyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yTmF2aWdhdGlvblN0YWNrcyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzZWxlY3Rpb25zU3RhY2s6IEVkaXRvck5hdmlnYXRpb25TdGFjaztcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0c1N0YWNrOiBFZGl0b3JOYXZpZ2F0aW9uU3RhY2s7XG5cdHByaXZhdGUgcmVhZG9ubHkgbmF2aWdhdGlvbnNTdGFjazogRWRpdG9yTmF2aWdhdGlvblN0YWNrO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RhY2tzOiBFZGl0b3JOYXZpZ2F0aW9uU3RhY2tbXTtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzY29wZTogR29TY29wZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zZWxlY3Rpb25zU3RhY2sgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvck5hdmlnYXRpb25TdGFjaywgR29GaWx0ZXIuTk9ORSwgdGhpcy5zY29wZSkpO1xuXHRcdHRoaXMuZWRpdHNTdGFjayA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yTmF2aWdhdGlvblN0YWNrLCBHb0ZpbHRlci5FRElUUywgdGhpcy5zY29wZSkpO1xuXHRcdHRoaXMubmF2aWdhdGlvbnNTdGFjayA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yTmF2aWdhdGlvblN0YWNrLCBHb0ZpbHRlci5OQVZJR0FUSU9OLCB0aGlzLnNjb3BlKSk7XG5cblx0XHR0aGlzLnN0YWNrcyA9IFtcblx0XHRcdHRoaXMuc2VsZWN0aW9uc1N0YWNrLFxuXHRcdFx0dGhpcy5lZGl0c1N0YWNrLFxuXHRcdFx0dGhpcy5uYXZpZ2F0aW9uc1N0YWNrXG5cdFx0XTtcblxuXHRcdHRoaXMub25EaWRDaGFuZ2UgPSBFdmVudC5hbnkoXG5cdFx0XHR0aGlzLnNlbGVjdGlvbnNTdGFjay5vbkRpZENoYW5nZSxcblx0XHRcdHRoaXMuZWRpdHNTdGFjay5vbkRpZENoYW5nZSxcblx0XHRcdHRoaXMubmF2aWdhdGlvbnNTdGFjay5vbkRpZENoYW5nZVxuXHRcdCk7XG5cdH1cblxuXHRjYW5Hb0ZvcndhcmQoZmlsdGVyPzogR29GaWx0ZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTdGFjayhmaWx0ZXIpLmNhbkdvRm9yd2FyZCgpO1xuXHR9XG5cblx0Z29Gb3J3YXJkKGZpbHRlcj86IEdvRmlsdGVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RhY2soZmlsdGVyKS5nb0ZvcndhcmQoKTtcblx0fVxuXG5cdGNhbkdvQmFjayhmaWx0ZXI/OiBHb0ZpbHRlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmdldFN0YWNrKGZpbHRlcikuY2FuR29CYWNrKCk7XG5cdH1cblxuXHRnb0JhY2soZmlsdGVyPzogR29GaWx0ZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTdGFjayhmaWx0ZXIpLmdvQmFjaygpO1xuXHR9XG5cblx0Z29QcmV2aW91cyhmaWx0ZXI/OiBHb0ZpbHRlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmdldFN0YWNrKGZpbHRlcikuZ29QcmV2aW91cygpO1xuXHR9XG5cblx0Y2FuR29MYXN0KGZpbHRlcj86IEdvRmlsdGVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RhY2soZmlsdGVyKS5jYW5Hb0xhc3QoKTtcblx0fVxuXG5cdGdvTGFzdChmaWx0ZXI/OiBHb0ZpbHRlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmdldFN0YWNrKGZpbHRlcikuZ29MYXN0KCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFN0YWNrKGZpbHRlciA9IEdvRmlsdGVyLk5PTkUpOiBFZGl0b3JOYXZpZ2F0aW9uU3RhY2sge1xuXHRcdHN3aXRjaCAoZmlsdGVyKSB7XG5cdFx0XHRjYXNlIEdvRmlsdGVyLk5PTkU6IHJldHVybiB0aGlzLnNlbGVjdGlvbnNTdGFjaztcblx0XHRcdGNhc2UgR29GaWx0ZXIuRURJVFM6IHJldHVybiB0aGlzLmVkaXRzU3RhY2s7XG5cdFx0XHRjYXNlIEdvRmlsdGVyLk5BVklHQVRJT046IHJldHVybiB0aGlzLm5hdmlnYXRpb25zU3RhY2s7XG5cdFx0fVxuXHR9XG5cblx0aGFuZGxlQWN0aXZlRWRpdG9yQ2hhbmdlKGVkaXRvclBhbmU/OiBJRWRpdG9yUGFuZSk6IHZvaWQge1xuXG5cdFx0Ly8gQWx3YXlzIHNlbmQgdG8gc2VsZWN0aW9ucyBuYXZpZ2F0aW9uIHN0YWNrXG5cdFx0dGhpcy5zZWxlY3Rpb25zU3RhY2subm90aWZ5TmF2aWdhdGlvbihlZGl0b3JQYW5lKTtcblx0fVxuXG5cdGhhbmRsZUFjdGl2ZUVkaXRvclNlbGVjdGlvbkNoYW5nZShlZGl0b3JQYW5lOiBJRWRpdG9yUGFuZVdpdGhTZWxlY3Rpb24sIGV2ZW50OiBJRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLnNlbGVjdGlvbnNTdGFjay5jdXJyZW50O1xuXG5cdFx0Ly8gQWx3YXlzIHNlbmQgdG8gc2VsZWN0aW9ucyBuYXZpZ2F0aW9uIHN0YWNrXG5cdFx0dGhpcy5zZWxlY3Rpb25zU3RhY2subm90aWZ5TmF2aWdhdGlvbihlZGl0b3JQYW5lLCBldmVudCk7XG5cblx0XHQvLyBDaGVjayBmb3IgZWRpdHNcblx0XHRpZiAoZXZlbnQucmVhc29uID09PSBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLkVESVQpIHtcblx0XHRcdHRoaXMuZWRpdHNTdGFjay5ub3RpZnlOYXZpZ2F0aW9uKGVkaXRvclBhbmUsIGV2ZW50KTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3IgbmF2aWdhdGlvbnNcblx0XHQvL1xuXHRcdC8vIE5vdGU6IGlnbm9yZSBpZiBzZWxlY3Rpb25zIG5hdmlnYXRpb24gc3RhY2sgaXMgbmF2aWdhdGluZyBiZWNhdXNlXG5cdFx0Ly8gaW4gdGhhdCBjYXNlIHdlIGRvIG5vdCB3YW50IHRvIHJlY2VpdmUgcmVwZWF0ZWQgZW50cmllcyBpblxuXHRcdC8vIHRoZSBuYXZpZ2F0aW9uIHN0YWNrLlxuXHRcdGVsc2UgaWYgKFxuXHRcdFx0KGV2ZW50LnJlYXNvbiA9PT0gRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5OQVZJR0FUSU9OIHx8IGV2ZW50LnJlYXNvbiA9PT0gRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5KVU1QKSAmJlxuXHRcdFx0IXRoaXMuc2VsZWN0aW9uc1N0YWNrLmlzTmF2aWdhdGluZygpXG5cdFx0KSB7XG5cblx0XHRcdC8vIEEgXCJKVU1QXCIgbmF2aWdhdGlvbiBzZWxlY3Rpb24gY2hhbmdlIGFsd2F5cyBoYXMgYSBzb3VyY2UgYW5kXG5cdFx0XHQvLyB0YXJnZXQuIEFzIHN1Y2gsIHdlIGFkZCB0aGUgcHJldmlvdXMgZW50cnkgb2YgdGhlIHNlbGVjdGlvbnNcblx0XHRcdC8vIG5hdmlnYXRpb24gc3RhY2sgc28gdGhhdCBvdXIgbmF2aWdhdGlvbiBzdGFjayByZWNlaXZlcyBib3RoXG5cdFx0XHQvLyBlbnRyaWVzIHVubGVzcyB0aGUgdXNlciBpcyBjdXJyZW50bHkgbmF2aWdhdGluZy5cblxuXHRcdFx0aWYgKGV2ZW50LnJlYXNvbiA9PT0gRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5KVU1QICYmICF0aGlzLm5hdmlnYXRpb25zU3RhY2suaXNOYXZpZ2F0aW5nKCkpIHtcblx0XHRcdFx0aWYgKHByZXZpb3VzKSB7XG5cdFx0XHRcdFx0dGhpcy5uYXZpZ2F0aW9uc1N0YWNrLmFkZE9yUmVwbGFjZShwcmV2aW91cy5ncm91cElkLCBwcmV2aW91cy5lZGl0b3IsIHByZXZpb3VzLnNlbGVjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5uYXZpZ2F0aW9uc1N0YWNrLm5vdGlmeU5hdmlnYXRpb24oZWRpdG9yUGFuZSwgZXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc3RhY2sgb2YgdGhpcy5zdGFja3MpIHtcblx0XHRcdHN0YWNrLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlKGFyZzE6IEVkaXRvcklucHV0IHwgRmlsZUNoYW5nZXNFdmVudCB8IEZpbGVPcGVyYXRpb25FdmVudCB8IEdyb3VwSWRlbnRpZmllcik6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc3RhY2sgb2YgdGhpcy5zdGFja3MpIHtcblx0XHRcdHN0YWNrLnJlbW92ZShhcmcxKTtcblx0XHR9XG5cdH1cblxuXHRtb3ZlKGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHN0YWNrIG9mIHRoaXMuc3RhY2tzKSB7XG5cdFx0XHRzdGFjay5tb3ZlKGV2ZW50KTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTm9PcEVkaXRvck5hdmlnYXRpb25TdGFja3MgaW1wbGVtZW50cyBJRWRpdG9yTmF2aWdhdGlvblN0YWNrcyB7XG5cdG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblxuXHRjYW5Hb0ZvcndhcmQoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBnb0ZvcndhcmQoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0Y2FuR29CYWNrKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0YXN5bmMgZ29CYWNrKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGdvUHJldmlvdXMoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0Y2FuR29MYXN0KCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0YXN5bmMgZ29MYXN0KCk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0aGFuZGxlQWN0aXZlRWRpdG9yQ2hhbmdlKCk6IHZvaWQgeyB9XG5cdGhhbmRsZUFjdGl2ZUVkaXRvclNlbGVjdGlvbkNoYW5nZSgpOiB2b2lkIHsgfVxuXG5cdGNsZWFyKCk6IHZvaWQgeyB9XG5cdHJlbW92ZSgpOiB2b2lkIHsgfVxuXHRtb3ZlKCk6IHZvaWQgeyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxufVxuXG5pbnRlcmZhY2UgSUVkaXRvck5hdmlnYXRpb25TdGFja0VudHJ5IHtcblx0Z3JvdXBJZDogR3JvdXBJZGVudGlmaWVyO1xuXHRlZGl0b3I6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQ7XG5cdHNlbGVjdGlvbj86IElFZGl0b3JQYW5lU2VsZWN0aW9uO1xufVxuXG5leHBvcnQgY2xhc3MgRWRpdG9yTmF2aWdhdGlvblN0YWNrIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX1NUQUNLX1NJWkUgPSA1MDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwRWRpdG9yVG9EaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8RWRpdG9ySW5wdXQsIERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwR3JvdXBUb0Rpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxHcm91cElkZW50aWZpZXIsIElEaXNwb3NhYmxlPik7XG5cblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JIZWxwZXI6IEVkaXRvckhlbHBlcjtcblxuXHRwcml2YXRlIHN0YWNrOiBJRWRpdG9yTmF2aWdhdGlvblN0YWNrRW50cnlbXSA9IFtdO1xuXG5cdHByaXZhdGUgaW5kZXggPSAtMTtcblx0cHJpdmF0ZSBwcmV2aW91c0luZGV4ID0gLTE7XG5cblx0cHJpdmF0ZSBuYXZpZ2F0aW5nID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBjdXJyZW50U2VsZWN0aW9uU3RhdGU6IEVkaXRvclNlbGVjdGlvblN0YXRlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGdldCBjdXJyZW50KCk6IElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhY2tbdGhpcy5pbmRleF07XG5cdH1cblxuXHRwcml2YXRlIHNldCBjdXJyZW50KGVudHJ5OiBJRWRpdG9yTmF2aWdhdGlvblN0YWNrRW50cnkgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdHRoaXMuc3RhY2tbdGhpcy5pbmRleF0gPSBlbnRyeTtcblx0XHR9XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbHRlcjogR29GaWx0ZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzY29wZTogR29TY29wZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lZGl0b3JIZWxwZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JIZWxwZXIpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMudHJhY2VTdGFjaygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sb2dTZXJ2aWNlLm9uRGlkQ2hhbmdlTG9nTGV2ZWwoKCkgPT4gdGhpcy50cmFjZVN0YWNrKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3VwU2VydmljZS5vbkRpZFJlbW92ZUdyb3VwKGdyb3VwID0+IHtcblx0XHRcdHRoaXMubWFwR3JvdXBUb0Rpc3Bvc2FibGUuZGVsZXRlQW5kRGlzcG9zZShncm91cC5pZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB0cmFjZVN0YWNrKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSAhPT0gTG9nTGV2ZWwuVHJhY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyeUxhYmVsczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuc3RhY2spIHtcblx0XHRcdGlmICh0eXBlb2YgZW50cnkuc2VsZWN0aW9uPy5sb2cgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0ZW50cnlMYWJlbHMucHVzaChgLSBncm91cDogJHtlbnRyeS5ncm91cElkfSwgZWRpdG9yOiAke2VudHJ5LmVkaXRvci5yZXNvdXJjZT8udG9TdHJpbmcoKX0sIHNlbGVjdGlvbjogJHtlbnRyeS5zZWxlY3Rpb24ubG9nKCl9YCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbnRyeUxhYmVscy5wdXNoKGAtIGdyb3VwOiAke2VudHJ5Lmdyb3VwSWR9LCBlZGl0b3I6ICR7ZW50cnkuZWRpdG9yLnJlc291cmNlPy50b1N0cmluZygpfSwgc2VsZWN0aW9uOiA8bm9uZT5gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZW50cnlMYWJlbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBpbmRleDogJHt0aGlzLmluZGV4fSwgbmF2aWdhdGluZzogJHt0aGlzLmlzTmF2aWdhdGluZygpfTogPGVtcHR5PmApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBpbmRleDogJHt0aGlzLmluZGV4fSwgbmF2aWdhdGluZzogJHt0aGlzLmlzTmF2aWdhdGluZygpfVxuJHtlbnRyeUxhYmVscy5qb2luKCdcXG4nKX1cblx0XHRcdGApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdHJhY2UobXNnOiBzdHJpbmcsIGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB8IG51bGwgPSBudWxsLCBldmVudD86IElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sb2dTZXJ2aWNlLmdldExldmVsKCkgIT09IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGZpbHRlckxhYmVsOiBzdHJpbmc7XG5cdFx0c3dpdGNoICh0aGlzLmZpbHRlcikge1xuXHRcdFx0Y2FzZSBHb0ZpbHRlci5OT05FOiBmaWx0ZXJMYWJlbCA9ICdnbG9iYWwnO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgR29GaWx0ZXIuRURJVFM6IGZpbHRlckxhYmVsID0gJ2VkaXRzJztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEdvRmlsdGVyLk5BVklHQVRJT046IGZpbHRlckxhYmVsID0gJ25hdmlnYXRpb24nO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRsZXQgc2NvcGVMYWJlbDogc3RyaW5nO1xuXHRcdHN3aXRjaCAodGhpcy5zY29wZSkge1xuXHRcdFx0Y2FzZSBHb1Njb3BlLkRFRkFVTFQ6IHNjb3BlTGFiZWwgPSAnZGVmYXVsdCc7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHb1Njb3BlLkVESVRPUl9HUk9VUDogc2NvcGVMYWJlbCA9ICdlZGl0b3JHcm91cCc7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHb1Njb3BlLkVESVRPUjogc2NvcGVMYWJlbCA9ICdlZGl0b3InO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yICE9PSBudWxsKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtIaXN0b3J5IHN0YWNrICR7ZmlsdGVyTGFiZWx9LSR7c2NvcGVMYWJlbH1dOiAke21zZ30gKGVkaXRvcjogJHtlZGl0b3I/LnJlc291cmNlPy50b1N0cmluZygpfSwgZXZlbnQ6ICR7dGhpcy50cmFjZUV2ZW50KGV2ZW50KX0pYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0hpc3Rvcnkgc3RhY2sgJHtmaWx0ZXJMYWJlbH0tJHtzY29wZUxhYmVsfV06ICR7bXNnfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdHJhY2VFdmVudChldmVudD86IElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQpOiBzdHJpbmcge1xuXHRcdGlmICghZXZlbnQpIHtcblx0XHRcdHJldHVybiAnPG5vbmU+Jztcblx0XHR9XG5cblx0XHRzd2l0Y2ggKGV2ZW50LnJlYXNvbikge1xuXHRcdFx0Y2FzZSBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLkVESVQ6IHJldHVybiAnZWRpdCc7XG5cdFx0XHRjYXNlIEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24uTkFWSUdBVElPTjogcmV0dXJuICduYXZpZ2F0aW9uJztcblx0XHRcdGNhc2UgRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5KVU1QOiByZXR1cm4gJ2p1bXAnO1xuXHRcdFx0Y2FzZSBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLlBST0dSQU1NQVRJQzogcmV0dXJuICdwcm9ncmFtbWF0aWMnO1xuXHRcdFx0Y2FzZSBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLlVTRVI6IHJldHVybiAndXNlcic7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckdyb3VwTGlzdGVuZXJzKGdyb3VwSWQ6IEdyb3VwSWRlbnRpZmllcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5tYXBHcm91cFRvRGlzcG9zYWJsZS5oYXMoZ3JvdXBJZCkpIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ2V0R3JvdXAoZ3JvdXBJZCk7XG5cdFx0XHRpZiAoZ3JvdXApIHtcblx0XHRcdFx0dGhpcy5tYXBHcm91cFRvRGlzcG9zYWJsZS5zZXQoZ3JvdXBJZCwgZ3JvdXAub25XaWxsTW92ZUVkaXRvcihlID0+IHRoaXMub25XaWxsTW92ZUVkaXRvcihlKSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25XaWxsTW92ZUVkaXRvcihlOiBJRWRpdG9yV2lsbE1vdmVFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMudHJhY2UoJ29uV2lsbE1vdmVFZGl0b3IoKScsIGUuZWRpdG9yKTtcblxuXHRcdGlmICh0aGlzLnNjb3BlID09PSBHb1Njb3BlLkVESVRPUl9HUk9VUCkge1xuXHRcdFx0cmV0dXJuOyAvLyBpZ25vcmUgbW92ZSBldmVudHMgaWYgb3VyIHNjb3BlIGlzIGdyb3VwIGJhc2VkXG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLnN0YWNrKSB7XG5cdFx0XHRpZiAoZW50cnkuZ3JvdXBJZCAhPT0gZS5ncm91cElkKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBub3QgaW4gdGhlIGdyb3VwIHRoYXQgcmVwb3J0ZWQgdGhlIGV2ZW50XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5lZGl0b3JIZWxwZXIubWF0Y2hlc0VkaXRvcihlLmVkaXRvciwgZW50cnkuZWRpdG9yKSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gbm90IHRoZSBlZGl0b3IgdGhpcyBldmVudCBpcyBhYm91dFxuXHRcdFx0fVxuXG5cdFx0XHQvLyBVcGRhdGUgdG8gdGFyZ2V0IGdyb3VwXG5cdFx0XHRlbnRyeS5ncm91cElkID0gZS50YXJnZXQ7XG5cdFx0fVxuXHR9XG5cblx0Ly8jcmVnaW9uIFN0YWNrIE11dGF0aW9uXG5cblx0bm90aWZ5TmF2aWdhdGlvbihlZGl0b3JQYW5lOiBJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZCwgZXZlbnQ/OiBJRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy50cmFjZSgnbm90aWZ5TmF2aWdhdGlvbigpJywgZWRpdG9yUGFuZT8uaW5wdXQsIGV2ZW50KTtcblxuXHRcdGNvbnN0IGlzU2VsZWN0aW9uQXdhcmVFZGl0b3JQYW5lID0gaXNFZGl0b3JQYW5lV2l0aFNlbGVjdGlvbihlZGl0b3JQYW5lKTtcblx0XHRjb25zdCBoYXNWYWxpZEVkaXRvciA9IGVkaXRvclBhbmU/LmlucHV0ICYmICFlZGl0b3JQYW5lLmlucHV0LmlzRGlzcG9zZWQoKTtcblxuXHRcdC8vIFRyZWF0IGVkaXRvciBjaGFuZ2VzIHRoYXQgaGFwcGVuIGFzIHBhcnQgb2Ygc3RhY2sgbmF2aWdhdGlvbiBzcGVjaWFsbHlcblx0XHQvLyB3ZSBkbyBub3Qgd2FudCB0byBhZGQgYSBuZXcgc3RhY2sgZW50cnkgYXMgYSBtYXR0ZXIgb2YgbmF2aWdhdGluZyB0aGVcblx0XHQvLyBzdGFjayBidXQgd2UgbmVlZCB0byBrZWVwIG91ciBjdXJyZW50RWRpdG9yU2VsZWN0aW9uU3RhdGUgdXAgdG8gZGF0ZVxuXHRcdC8vIHdpdGggdGhlIG5hdmlndGlvbiB0aGF0IG9jY3Vycy5cblx0XHRpZiAodGhpcy5uYXZpZ2F0aW5nKSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBub3RpZnlOYXZpZ2F0aW9uKCkgaWdub3JpbmcgKG5hdmlnYXRpbmcpYCwgZWRpdG9yUGFuZT8uaW5wdXQsIGV2ZW50KTtcblxuXHRcdFx0aWYgKGlzU2VsZWN0aW9uQXdhcmVFZGl0b3JQYW5lICYmIGhhc1ZhbGlkRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMudHJhY2UoJ25vdGlmeU5hdmlnYXRpb24oKSB1cGRhdGluZyBjdXJyZW50IHNlbGVjdGlvbiBzdGF0ZScsIGVkaXRvclBhbmU/LmlucHV0LCBldmVudCk7XG5cblx0XHRcdFx0dGhpcy5jdXJyZW50U2VsZWN0aW9uU3RhdGUgPSBuZXcgRWRpdG9yU2VsZWN0aW9uU3RhdGUoeyBncm91cElkOiBlZGl0b3JQYW5lLmdyb3VwLmlkLCBlZGl0b3I6IGVkaXRvclBhbmUuaW5wdXQgfSwgZWRpdG9yUGFuZS5nZXRTZWxlY3Rpb24oKSwgZXZlbnQ/LnJlYXNvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRyYWNlKCdub3RpZnlOYXZpZ2F0aW9uKCkgZHJvcHBpbmcgY3VycmVudCBzZWxlY3Rpb24gc3RhdGUnLCBlZGl0b3JQYW5lPy5pbnB1dCwgZXZlbnQpO1xuXG5cdFx0XHRcdHRoaXMuY3VycmVudFNlbGVjdGlvblN0YXRlID0gdW5kZWZpbmVkOyAvLyB3ZSBuYXZpZ2F0ZWQgdG8gYSBub24tc2VsZWN0aW9uIGF3YXJlIG9yIGRpc3Bvc2VkIGVkaXRvclxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE5vcm1hbCBuYXZpZ2F0aW9uIG5vdCBwYXJ0IG9mIHN0YWNrIG5hdmlnYXRpb25cblx0XHRlbHNlIHtcblx0XHRcdHRoaXMudHJhY2UoYG5vdGlmeU5hdmlnYXRpb24oKSBub3QgaWdub3JpbmdgLCBlZGl0b3JQYW5lPy5pbnB1dCwgZXZlbnQpO1xuXG5cdFx0XHQvLyBOYXZpZ2F0aW9uIGluc2lkZSBzZWxlY3Rpb24gYXdhcmUgZWRpdG9yXG5cdFx0XHRpZiAoaXNTZWxlY3Rpb25Bd2FyZUVkaXRvclBhbmUgJiYgaGFzVmFsaWRFZGl0b3IpIHtcblx0XHRcdFx0dGhpcy5vblNlbGVjdGlvbkF3YXJlRWRpdG9yTmF2aWdhdGlvbihlZGl0b3JQYW5lLmdyb3VwLmlkLCBlZGl0b3JQYW5lLmlucHV0LCBlZGl0b3JQYW5lLmdldFNlbGVjdGlvbigpLCBldmVudCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE5hdmlnYXRpb24gdG8gbm9uLXNlbGVjdGlvbiBhd2FyZSBvciBkaXNwb3NlZCBlZGl0b3Jcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRTZWxlY3Rpb25TdGF0ZSA9IHVuZGVmaW5lZDsgLy8gYXQgdGhpcyB0aW1lIHdlIGhhdmUgbm8gYWN0aXZlIHNlbGVjdGlvbiBhd2FyZSBlZGl0b3JcblxuXHRcdFx0XHRpZiAoaGFzVmFsaWRFZGl0b3IpIHtcblx0XHRcdFx0XHR0aGlzLm9uTm9uU2VsZWN0aW9uQXdhcmVFZGl0b3JOYXZpZ2F0aW9uKGVkaXRvclBhbmUuZ3JvdXAuaWQsIGVkaXRvclBhbmUuaW5wdXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblNlbGVjdGlvbkF3YXJlRWRpdG9yTmF2aWdhdGlvbihncm91cElkOiBHcm91cElkZW50aWZpZXIsIGVkaXRvcjogRWRpdG9ySW5wdXQsIHNlbGVjdGlvbjogSUVkaXRvclBhbmVTZWxlY3Rpb24gfCB1bmRlZmluZWQsIGV2ZW50PzogSUVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmN1cnJlbnQ/Lmdyb3VwSWQgPT09IGdyb3VwSWQgJiYgIXNlbGVjdGlvbiAmJiB0aGlzLmVkaXRvckhlbHBlci5tYXRjaGVzRWRpdG9yKHRoaXMuY3VycmVudC5lZGl0b3IsIGVkaXRvcikpIHtcblx0XHRcdHJldHVybjsgLy8gZG8gbm90IHB1c2ggc2FtZSBlZGl0b3IgaW5wdXQgYWdhaW4gb2Ygc2FtZSBncm91cCBpZiB3ZSBoYXZlIG5vIHZhbGlkIHNlbGVjdGlvblxuXHRcdH1cblxuXHRcdHRoaXMudHJhY2UoJ29uU2VsZWN0aW9uQXdhcmVFZGl0b3JOYXZpZ2F0aW9uKCknLCBlZGl0b3IsIGV2ZW50KTtcblxuXHRcdGNvbnN0IHN0YXRlQ2FuZGlkYXRlID0gbmV3IEVkaXRvclNlbGVjdGlvblN0YXRlKHsgZ3JvdXBJZCwgZWRpdG9yIH0sIHNlbGVjdGlvbiwgZXZlbnQ/LnJlYXNvbik7XG5cblx0XHQvLyBBZGQgdG8gc3RhY2sgaWYgd2UgZG9udCBoYXZlIGEgY3VycmVudCBzdGF0ZSBvciB0aGlzIG5ldyBzdGF0ZSBqdXN0aWZpZXMgYSBwdXNoXG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRTZWxlY3Rpb25TdGF0ZSB8fCB0aGlzLmN1cnJlbnRTZWxlY3Rpb25TdGF0ZS5qdXN0aWZpZXNOZXdOYXZpZ2F0aW9uRW50cnkoc3RhdGVDYW5kaWRhdGUpKSB7XG5cdFx0XHR0aGlzLmRvQWRkKGdyb3VwSWQsIGVkaXRvciwgc3RhdGVDYW5kaWRhdGUuc2VsZWN0aW9uKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2Ugd2UgcmVwbGFjZSB0aGUgY3VycmVudCBzdGFjayBlbnRyeSB3aXRoIHRoaXMgb25lXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLmRvUmVwbGFjZShncm91cElkLCBlZGl0b3IsIHN0YXRlQ2FuZGlkYXRlLnNlbGVjdGlvbik7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIG91ciBjdXJyZW50IG5hdmlnYXRpb24gZWRpdG9yIHN0YXRlXG5cdFx0dGhpcy5jdXJyZW50U2VsZWN0aW9uU3RhdGUgPSBzdGF0ZUNhbmRpZGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgb25Ob25TZWxlY3Rpb25Bd2FyZUVkaXRvck5hdmlnYXRpb24oZ3JvdXBJZDogR3JvdXBJZGVudGlmaWVyLCBlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY3VycmVudD8uZ3JvdXBJZCA9PT0gZ3JvdXBJZCAmJiB0aGlzLmVkaXRvckhlbHBlci5tYXRjaGVzRWRpdG9yKHRoaXMuY3VycmVudC5lZGl0b3IsIGVkaXRvcikpIHtcblx0XHRcdHJldHVybjsgLy8gZG8gbm90IHB1c2ggc2FtZSBlZGl0b3IgaW5wdXQgYWdhaW4gb2Ygc2FtZSBncm91cFxuXHRcdH1cblxuXHRcdHRoaXMudHJhY2UoJ29uTm9uU2VsZWN0aW9uQXdhcmVFZGl0b3JOYXZpZ2F0aW9uKCknLCBlZGl0b3IpO1xuXG5cdFx0dGhpcy5kb0FkZChncm91cElkLCBlZGl0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0FkZChncm91cElkOiBHcm91cElkZW50aWZpZXIsIGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dCwgc2VsZWN0aW9uPzogSUVkaXRvclBhbmVTZWxlY3Rpb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubmF2aWdhdGluZykge1xuXHRcdFx0dGhpcy5hZGRPclJlcGxhY2UoZ3JvdXBJZCwgZWRpdG9yLCBzZWxlY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9SZXBsYWNlKGdyb3VwSWQ6IEdyb3VwSWRlbnRpZmllciwgZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0LCBzZWxlY3Rpb24/OiBJRWRpdG9yUGFuZVNlbGVjdGlvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5uYXZpZ2F0aW5nKSB7XG5cdFx0XHR0aGlzLmFkZE9yUmVwbGFjZShncm91cElkLCBlZGl0b3IsIHNlbGVjdGlvbiwgdHJ1ZSAvKiBmb3JjZSByZXBsYWNlICovKTtcblx0XHR9XG5cdH1cblxuXHRhZGRPclJlcGxhY2UoZ3JvdXBJZDogR3JvdXBJZGVudGlmaWVyLCBlZGl0b3JDYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQsIHNlbGVjdGlvbj86IElFZGl0b3JQYW5lU2VsZWN0aW9uLCBmb3JjZVJlcGxhY2U/OiBib29sZWFuKTogdm9pZCB7XG5cblx0XHQvLyBFbnN1cmUgd2UgbGlzdGVuIHRvIGNoYW5nZXMgaW4gZ3JvdXBcblx0XHR0aGlzLnJlZ2lzdGVyR3JvdXBMaXN0ZW5lcnMoZ3JvdXBJZCk7XG5cblx0XHQvLyBDaGVjayB3aGV0aGVyIHRvIHJlcGxhY2UgYW4gZXhpc3RpbmcgZW50cnkgb3Igbm90XG5cdFx0bGV0IHJlcGxhY2UgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5jdXJyZW50KSB7XG5cdFx0XHRpZiAoZm9yY2VSZXBsYWNlKSB7XG5cdFx0XHRcdHJlcGxhY2UgPSB0cnVlOyAvLyByZXBsYWNlIGlmIHdlIGFyZSBmb3JjZWQgdG9cblx0XHRcdH0gZWxzZSBpZiAodGhpcy5zaG91bGRSZXBsYWNlU3RhY2tFbnRyeSh0aGlzLmN1cnJlbnQsIHsgZ3JvdXBJZCwgZWRpdG9yOiBlZGl0b3JDYW5kaWRhdGUsIHNlbGVjdGlvbiB9KSkge1xuXHRcdFx0XHRyZXBsYWNlID0gdHJ1ZTsgLy8gcmVwbGFjZSBpZiB0aGUgZ3JvdXAgJiBpbnB1dCBpcyB0aGUgc2FtZSBhbmQgc2VsZWN0aW9uIGluZGljYXRlcyBhcyBzdWNoXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5lZGl0b3JIZWxwZXIucHJlZmVyUmVzb3VyY2VFZGl0b3JJbnB1dChlZGl0b3JDYW5kaWRhdGUpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHJlcGxhY2UpIHtcblx0XHRcdHRoaXMudHJhY2UoJ3JlcGxhY2UoKScsIGVkaXRvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHJhY2UoJ2FkZCgpJywgZWRpdG9yKTtcblx0XHR9XG5cblx0XHRjb25zdCBuZXdTdGFja0VudHJ5OiBJRWRpdG9yTmF2aWdhdGlvblN0YWNrRW50cnkgPSB7IGdyb3VwSWQsIGVkaXRvciwgc2VsZWN0aW9uIH07XG5cblx0XHQvLyBSZXBsYWNlIGF0IGN1cnJlbnQgcG9zaXRpb25cblx0XHRjb25zdCByZW1vdmVkRW50cmllczogSUVkaXRvck5hdmlnYXRpb25TdGFja0VudHJ5W10gPSBbXTtcblx0XHRpZiAocmVwbGFjZSkge1xuXHRcdFx0aWYgKHRoaXMuY3VycmVudCkge1xuXHRcdFx0XHRyZW1vdmVkRW50cmllcy5wdXNoKHRoaXMuY3VycmVudCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmN1cnJlbnQgPSBuZXdTdGFja0VudHJ5O1xuXHRcdH1cblxuXHRcdC8vIEFkZCB0byBzdGFjayBhdCBjdXJyZW50IHBvc2l0aW9uXG5cdFx0ZWxzZSB7XG5cblx0XHRcdC8vIElmIHdlIGFyZSBub3QgYXQgdGhlIGVuZCBvZiBoaXN0b3J5LCB3ZSByZW1vdmUgYW55dGhpbmcgYWZ0ZXJcblx0XHRcdGlmICh0aGlzLnN0YWNrLmxlbmd0aCA+IHRoaXMuaW5kZXggKyAxKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSB0aGlzLmluZGV4ICsgMTsgaSA8IHRoaXMuc3RhY2subGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRyZW1vdmVkRW50cmllcy5wdXNoKHRoaXMuc3RhY2tbaV0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5zdGFjayA9IHRoaXMuc3RhY2suc2xpY2UoMCwgdGhpcy5pbmRleCArIDEpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbnNlcnQgZW50cnkgYXQgaW5kZXhcblx0XHRcdHRoaXMuc3RhY2suc3BsaWNlKHRoaXMuaW5kZXggKyAxLCAwLCBuZXdTdGFja0VudHJ5KTtcblxuXHRcdFx0Ly8gQ2hlY2sgZm9yIGxpbWl0XG5cdFx0XHRpZiAodGhpcy5zdGFjay5sZW5ndGggPiBFZGl0b3JOYXZpZ2F0aW9uU3RhY2suTUFYX1NUQUNLX1NJWkUpIHtcblx0XHRcdFx0cmVtb3ZlZEVudHJpZXMucHVzaCh0aGlzLnN0YWNrLnNoaWZ0KCkhKTsgLy8gcmVtb3ZlIGZpcnN0XG5cdFx0XHRcdGlmICh0aGlzLnByZXZpb3VzSW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdHRoaXMucHJldmlvdXNJbmRleC0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnNldEluZGV4KHRoaXMuaW5kZXggKyAxLCB0cnVlIC8qIHNraXAgZXZlbnQsIHdlIGZpcmUgaXQgbGF0ZXIgKi8pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENsZWFyIGVkaXRvciBsaXN0ZW5lcnMgZnJvbSByZW1vdmVkIGVudHJpZXNcblx0XHRmb3IgKGNvbnN0IHJlbW92ZWRFbnRyeSBvZiByZW1vdmVkRW50cmllcykge1xuXHRcdFx0dGhpcy5lZGl0b3JIZWxwZXIuY2xlYXJPbkVkaXRvckRpc3Bvc2UocmVtb3ZlZEVudHJ5LmVkaXRvciwgdGhpcy5tYXBFZGl0b3JUb0Rpc3Bvc2FibGUpO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSB0aGlzIGZyb20gdGhlIHN0YWNrIHVubGVzcyB0aGUgc3RhY2sgaW5wdXQgaXMgYSByZXNvdXJjZVxuXHRcdC8vIHRoYXQgY2FuIGVhc2lseSBiZSByZXN0b3JlZCBldmVuIHdoZW4gdGhlIGlucHV0IGdldHMgZGlzcG9zZWRcblx0XHRpZiAoaXNFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cdFx0XHR0aGlzLmVkaXRvckhlbHBlci5vbkVkaXRvckRpc3Bvc2UoZWRpdG9yLCAoKSA9PiB0aGlzLnJlbW92ZShlZGl0b3IpLCB0aGlzLm1hcEVkaXRvclRvRGlzcG9zYWJsZSk7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFJlcGxhY2VTdGFja0VudHJ5KGVudHJ5OiBJRWRpdG9yTmF2aWdhdGlvblN0YWNrRW50cnksIGNhbmRpZGF0ZTogSUVkaXRvck5hdmlnYXRpb25TdGFja0VudHJ5KTogYm9vbGVhbiB7XG5cdFx0aWYgKGVudHJ5Lmdyb3VwSWQgIT09IGNhbmRpZGF0ZS5ncm91cElkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGRpZmZlcmVudCBncm91cFxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5lZGl0b3JIZWxwZXIubWF0Y2hlc0VkaXRvcihlbnRyeS5lZGl0b3IsIGNhbmRpZGF0ZS5lZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGRpZmZlcmVudCBlZGl0b3Jcblx0XHR9XG5cblx0XHRpZiAoIWVudHJ5LnNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIGFsd2F5cyByZXBsYWNlIHdoZW4gd2UgaGF2ZSBubyBzcGVjaWZpYyBzZWxlY3Rpb24geWV0XG5cdFx0fVxuXG5cdFx0aWYgKCFjYW5kaWRhdGUuc2VsZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIG90aGVyd2lzZSwgcHJlZmVyIHRvIGtlZXAgZXhpc3Rpbmcgc3BlY2lmaWMgc2VsZWN0aW9uIG92ZXIgbmV3IHVuc3BlY2lmaWMgb25lXG5cdFx0fVxuXG5cdFx0Ly8gRmluYWxseSwgcmVwbGFjZSB3aGVuIHNlbGVjdGlvbnMgYXJlIGNvbnNpZGVyZWQgaWRlbnRpY2FsXG5cdFx0cmV0dXJuIGVudHJ5LnNlbGVjdGlvbi5jb21wYXJlKGNhbmRpZGF0ZS5zZWxlY3Rpb24pID09PSBFZGl0b3JQYW5lU2VsZWN0aW9uQ29tcGFyZVJlc3VsdC5JREVOVElDQUw7XG5cdH1cblxuXHRtb3ZlKGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZXZlbnQuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5NT1ZFKSkge1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLnN0YWNrKSB7XG5cdFx0XHRcdGlmICh0aGlzLmVkaXRvckhlbHBlci5tYXRjaGVzRWRpdG9yKGV2ZW50LCBlbnRyeS5lZGl0b3IpKSB7XG5cdFx0XHRcdFx0ZW50cnkuZWRpdG9yID0geyByZXNvdXJjZTogZXZlbnQudGFyZ2V0LnJlc291cmNlIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZW1vdmUoYXJnMTogRWRpdG9ySW5wdXQgfCBGaWxlQ2hhbmdlc0V2ZW50IHwgRmlsZU9wZXJhdGlvbkV2ZW50IHwgR3JvdXBJZGVudGlmaWVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXNTdGFja1NpemUgPSB0aGlzLnN0YWNrLmxlbmd0aDtcblxuXHRcdC8vIFJlbW92ZSBhbGwgc3RhY2sgZW50cmllcyB0aGF0IG1hdGNoIGBhcmcxYFxuXHRcdHRoaXMuc3RhY2sgPSB0aGlzLnN0YWNrLmZpbHRlcihlbnRyeSA9PiB7XG5cdFx0XHRjb25zdCBtYXRjaGVzID0gdHlwZW9mIGFyZzEgPT09ICdudW1iZXInID8gZW50cnkuZ3JvdXBJZCA9PT0gYXJnMSA6IHRoaXMuZWRpdG9ySGVscGVyLm1hdGNoZXNFZGl0b3IoYXJnMSwgZW50cnkuZWRpdG9yKTtcblxuXHRcdFx0Ly8gQ2xlYW51cCBhbnkgbGlzdGVuZXJzIGFzc29jaWF0ZWQgd2l0aCB0aGUgaW5wdXQgd2hlbiByZW1vdmluZ1xuXHRcdFx0aWYgKG1hdGNoZXMpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3JIZWxwZXIuY2xlYXJPbkVkaXRvckRpc3Bvc2UoZW50cnkuZWRpdG9yLCB0aGlzLm1hcEVkaXRvclRvRGlzcG9zYWJsZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAhbWF0Y2hlcztcblx0XHR9KTtcblxuXHRcdGlmIChwcmV2aW91c1N0YWNrU2l6ZSA9PT0gdGhpcy5zdGFjay5sZW5ndGgpIHtcblx0XHRcdHJldHVybjsgLy8gbm90aGluZyByZW1vdmVkXG5cdFx0fVxuXG5cdFx0Ly8gR2l2ZW4gd2UganVzdCByZW1vdmVkIGVudHJpZXMsIHdlIG5lZWQgdG8gbWFrZSBzdXJlXG5cdFx0Ly8gdG8gcmVtb3ZlIGVudHJpZXMgdGhhdCBhcmUgbm93IGlkZW50aWNhbCBhbmQgbmV4dFxuXHRcdC8vIHRvIGVhY2ggb3RoZXIgdG8gcHJldmVudCBuby1vcCBuYXZpZ2F0aW9ucy5cblx0XHR0aGlzLmZsYXR0ZW4oKTtcblxuXHRcdC8vIFJlc2V0IGluZGVjZXNcblx0XHR0aGlzLmluZGV4ID0gdGhpcy5zdGFjay5sZW5ndGggLSAxO1xuXHRcdHRoaXMucHJldmlvdXNJbmRleCA9IC0xO1xuXG5cdFx0Ly8gQ2xlYXIgZ3JvdXAgbGlzdGVuZXJcblx0XHRpZiAodHlwZW9mIGFyZzEgPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLm1hcEdyb3VwVG9EaXNwb3NhYmxlLmRlbGV0ZUFuZERpc3Bvc2UoYXJnMSk7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGZsYXR0ZW4oKTogdm9pZCB7XG5cdFx0Y29uc3QgZmxhdHRlbmVkU3RhY2s6IElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tFbnRyeVtdID0gW107XG5cblx0XHRsZXQgcHJldmlvdXNFbnRyeTogSUVkaXRvck5hdmlnYXRpb25TdGFja0VudHJ5IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5zdGFjaykge1xuXHRcdFx0aWYgKHByZXZpb3VzRW50cnkgJiYgdGhpcy5zaG91bGRSZXBsYWNlU3RhY2tFbnRyeShlbnRyeSwgcHJldmlvdXNFbnRyeSkpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIHNraXAgb3ZlciBlbnRyeSB3aGVuIGl0IGlzIGNvbnNpZGVyZWQgdGhlIHNhbWVcblx0XHRcdH1cblxuXHRcdFx0cHJldmlvdXNFbnRyeSA9IGVudHJ5O1xuXHRcdFx0ZmxhdHRlbmVkU3RhY2sucHVzaChlbnRyeSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdGFjayA9IGZsYXR0ZW5lZFN0YWNrO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5pbmRleCA9IC0xO1xuXHRcdHRoaXMucHJldmlvdXNJbmRleCA9IC0xO1xuXHRcdHRoaXMuc3RhY2suc3BsaWNlKDApO1xuXG5cdFx0dGhpcy5tYXBFZGl0b3JUb0Rpc3Bvc2FibGUuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdFx0dGhpcy5tYXBHcm91cFRvRGlzcG9zYWJsZS5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIE5hdmlnYXRpb25cblxuXHRjYW5Hb0ZvcndhcmQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhY2subGVuZ3RoID4gdGhpcy5pbmRleCArIDE7XG5cdH1cblxuXHRhc3luYyBnb0ZvcndhcmQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbmF2aWdhdGVkID0gYXdhaXQgdGhpcy5tYXliZUdvQ3VycmVudCgpO1xuXHRcdGlmIChuYXZpZ2F0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuY2FuR29Gb3J3YXJkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnNldEluZGV4KHRoaXMuaW5kZXggKyAxKTtcblx0XHRyZXR1cm4gdGhpcy5uYXZpZ2F0ZSgpO1xuXHR9XG5cblx0Y2FuR29CYWNrKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmluZGV4ID4gMDtcblx0fVxuXG5cdGFzeW5jIGdvQmFjaygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuYXZpZ2F0ZWQgPSBhd2FpdCB0aGlzLm1heWJlR29DdXJyZW50KCk7XG5cdFx0aWYgKG5hdmlnYXRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5jYW5Hb0JhY2soKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0SW5kZXgodGhpcy5pbmRleCAtIDEpO1xuXHRcdHJldHVybiB0aGlzLm5hdmlnYXRlKCk7XG5cdH1cblxuXHRhc3luYyBnb1ByZXZpb3VzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5hdmlnYXRlZCA9IGF3YWl0IHRoaXMubWF5YmVHb0N1cnJlbnQoKTtcblx0XHRpZiAobmF2aWdhdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgbmV2ZXIgbmF2aWdhdGVkLCBqdXN0IGdvIGJhY2tcblx0XHRpZiAodGhpcy5wcmV2aW91c0luZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ29CYWNrKCk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIGp1bXAgdG8gcHJldmlvdXMgc3RhY2sgZW50cnlcblx0XHR0aGlzLnNldEluZGV4KHRoaXMucHJldmlvdXNJbmRleCk7XG5cdFx0cmV0dXJuIHRoaXMubmF2aWdhdGUoKTtcblx0fVxuXG5cdGNhbkdvTGFzdCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zdGFjay5sZW5ndGggPiAwO1xuXHR9XG5cblx0YXN5bmMgZ29MYXN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5jYW5Hb0xhc3QoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0SW5kZXgodGhpcy5zdGFjay5sZW5ndGggLSAxKTtcblx0XHRyZXR1cm4gdGhpcy5uYXZpZ2F0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBtYXliZUdvQ3VycmVudCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vIFdoZW4gdGhpcyBuYXZpZ2F0aW9uIHN0YWNrIHdvcmtzIHdpdGggYSBzcGVjaWZpY1xuXHRcdC8vIGZpbHRlciB3aGVyZSBub3QgZXZlcnkgc2VsZWN0aW9uIGNoYW5nZSBpcyBhZGRlZFxuXHRcdC8vIHRvIHRoZSBzdGFjaywgd2Ugd2FudCB0byBmaXJzdCByZXZlYWwgdGhlIGN1cnJlbnRcblx0XHQvLyBzZWxlY3Rpb24gYmVmb3JlIGF0dGVtcHRpbmcgdG8gbmF2aWdhdGUgaW4gdGhlXG5cdFx0Ly8gc3RhY2suXG5cblx0XHRpZiAodGhpcy5maWx0ZXIgPT09IEdvRmlsdGVyLk5PTkUpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gb25seSBhcHBsaWVzIHdoZW4gIHdlIGFyZSBhIGZpbHRlcmQgc3RhY2tcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc0N1cnJlbnRTZWxlY3Rpb25BY3RpdmUoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyB3ZSBhcmUgYXQgdGhlIGN1cnJlbnQgbmF2aWdhdGlvbiBzdG9wXG5cdFx0fVxuXG5cdFx0Ly8gR28gdG8gY3VycmVudCBzZWxlY3Rpb25cblx0XHRhd2FpdCB0aGlzLm5hdmlnYXRlKCk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgaXNDdXJyZW50U2VsZWN0aW9uQWN0aXZlKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5jdXJyZW50Py5zZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gd2UgbmVlZCBhIGN1cnJlbnQgc2VsZWN0aW9uXG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFuZSA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmICghaXNFZGl0b3JQYW5lV2l0aFNlbGVjdGlvbihwYW5lKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyB3ZSBuZWVkIGFuIGFjdGl2ZSBlZGl0b3IgcGFuZSB3aXRoIHNlbGVjdGlvbiBzdXBwb3J0XG5cdFx0fVxuXG5cdFx0aWYgKHBhbmUuZ3JvdXAuaWQgIT09IHRoaXMuY3VycmVudC5ncm91cElkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHdlIG5lZWQgbWF0Y2hpbmcgZ3JvdXBzXG5cdFx0fVxuXG5cdFx0aWYgKCFwYW5lLmlucHV0IHx8ICF0aGlzLmVkaXRvckhlbHBlci5tYXRjaGVzRWRpdG9yKHBhbmUuaW5wdXQsIHRoaXMuY3VycmVudC5lZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHdlIG5lZWQgbWF0Y2hpbmcgZWRpdG9yc1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhbmVTZWxlY3Rpb24gPSBwYW5lLmdldFNlbGVjdGlvbigpO1xuXHRcdGlmICghcGFuZVNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyB3ZSBuZWVkIGEgc2VsZWN0aW9uIHRvIGNvbXBhcmUgd2l0aFxuXHRcdH1cblxuXHRcdHJldHVybiBwYW5lU2VsZWN0aW9uLmNvbXBhcmUodGhpcy5jdXJyZW50LnNlbGVjdGlvbikgPT09IEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0LklERU5USUNBTDtcblx0fVxuXG5cdHByaXZhdGUgc2V0SW5kZXgobmV3SW5kZXg6IG51bWJlciwgc2tpcEV2ZW50PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMucHJldmlvdXNJbmRleCA9IHRoaXMuaW5kZXg7XG5cdFx0dGhpcy5pbmRleCA9IG5ld0luZGV4O1xuXG5cdFx0Ly8gRXZlbnRcblx0XHRpZiAoIXNraXBFdmVudCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbmF2aWdhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5uYXZpZ2F0aW5nID0gdHJ1ZTtcblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9OYXZpZ2F0ZSh0aGlzLmN1cnJlbnQpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLm5hdmlnYXRpbmcgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvTmF2aWdhdGUobG9jYXRpb246IElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tFbnRyeSk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgb3B0aW9uczogSUVkaXRvck9wdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdFx0Ly8gQXBwbHkgc2VsZWN0aW9uIGlmIGFueVxuXHRcdGlmIChsb2NhdGlvbi5zZWxlY3Rpb24pIHtcblx0XHRcdG9wdGlvbnMgPSBsb2NhdGlvbi5zZWxlY3Rpb24ucmVzdG9yZShvcHRpb25zKTtcblx0XHR9XG5cblx0XHRpZiAoaXNFZGl0b3JJbnB1dChsb2NhdGlvbi5lZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IobG9jYXRpb24uZWRpdG9yLCBvcHRpb25zLCBsb2NhdGlvbi5ncm91cElkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0Li4ubG9jYXRpb24uZWRpdG9yLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHQuLi5sb2NhdGlvbi5lZGl0b3Iub3B0aW9ucyxcblx0XHRcdFx0Li4ub3B0aW9uc1xuXHRcdFx0fVxuXHRcdH0sIGxvY2F0aW9uLmdyb3VwSWQpO1xuXHR9XG5cblx0aXNOYXZpZ2F0aW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm5hdmlnYXRpbmc7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cblxuY2xhc3MgRWRpdG9ySGVscGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZVxuXHQpIHsgfVxuXG5cdHByZWZlclJlc291cmNlRWRpdG9ySW5wdXQoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQ7XG5cdHByZWZlclJlc291cmNlRWRpdG9ySW5wdXQoZWRpdG9yOiBJUmVzb3VyY2VFZGl0b3JJbnB1dCk6IElSZXNvdXJjZUVkaXRvcklucHV0IHwgdW5kZWZpbmVkO1xuXHRwcmVmZXJSZXNvdXJjZUVkaXRvcklucHV0KGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dCk6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdHByZWZlclJlc291cmNlRWRpdG9ySW5wdXQoZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0KTogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvcik7XG5cblx0XHQvLyBGb3Igbm93LCBvbmx5IHByZWZlciB3ZWxsIGtub3duIHNjaGVtZXMgdGhhdCB3ZSBjb250cm9sIHRvIHByZXZlbnRcblx0XHQvLyBpc3N1ZXMgc3VjaCBhcyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvODUyMDRcblx0XHQvLyBmcm9tIGJlaW5nIHVzZWQgYXMgcmVzb3VyY2UgaW5wdXRzXG5cdFx0Ly8gcmVzb3VyY2UgaW5wdXRzIHN1cnZpdmUgZWRpdG9yIGRpc3Bvc2FsIGFuZCBhcyBzdWNoIGFyZSBhIGxvdCBtb3JlXG5cdFx0Ly8gZHVyYWJsZSBhY3Jvc3MgZWRpdG9yIGNoYW5nZXMgYW5kIHJlc3RhcnRzXG5cdFx0Y29uc3QgaGFzVmFsaWRSZXNvdXJjZUVkaXRvcklucHV0U2NoZW1lID1cblx0XHRcdHJlc291cmNlPy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSB8fFxuXHRcdFx0cmVzb3VyY2U/LnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGUgfHxcblx0XHRcdHJlc291cmNlPy5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlVXNlckRhdGEgfHxcblx0XHRcdHJlc291cmNlPy5zY2hlbWUgPT09IHRoaXMucGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZTtcblxuXHRcdC8vIFNjaGVtZSBpcyB2YWxpZDogcHJlZmVyIHRoZSB1bnR5cGVkIGlucHV0XG5cdFx0Ly8gb3ZlciB0aGUgdHlwZWQgaW5wdXQgaWYgcG9zc2libGUgdG8ga2VlcFxuXHRcdC8vIHRoZSBlbnRyeSBhY3Jvc3MgcmVzdGFydHNcblx0XHRpZiAoaGFzVmFsaWRSZXNvdXJjZUVkaXRvcklucHV0U2NoZW1lKSB7XG5cdFx0XHRpZiAoaXNFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRJbnB1dCA9IGVkaXRvci50b1VudHlwZWQoKTtcblx0XHRcdFx0aWYgKGlzUmVzb3VyY2VFZGl0b3JJbnB1dCh1bnR5cGVkSW5wdXQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVudHlwZWRJbnB1dDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZWRpdG9yO1xuXHRcdH1cblxuXHRcdC8vIFNjaGVtZSBpcyBpbnZhbGlkOiBhbGxvdyB0aGUgZWRpdG9yIGlucHV0XG5cdFx0Ly8gZm9yIGFzIGxvbmcgYXMgaXQgaXMgbm90IGRpc3Bvc2VkXG5cdFx0ZWxzZSB7XG5cdFx0XHRyZXR1cm4gaXNFZGl0b3JJbnB1dChlZGl0b3IpID8gZWRpdG9yIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdG1hdGNoZXNFZGl0b3IoYXJnMTogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dCB8IEZpbGVDaGFuZ2VzRXZlbnQgfCBGaWxlT3BlcmF0aW9uRXZlbnQsIGlucHV0QjogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGlmIChhcmcxIGluc3RhbmNlb2YgRmlsZUNoYW5nZXNFdmVudCB8fCBhcmcxIGluc3RhbmNlb2YgRmlsZU9wZXJhdGlvbkV2ZW50KSB7XG5cdFx0XHRpZiAoaXNFZGl0b3JJbnB1dChpbnB1dEIpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gd2Ugb25seSBzdXBwb3J0IHRoaXMgZm9yIGBJUmVzb3VyY2VFZGl0b3JJbnB1dHNgIHRoYXQgYXJlIGZpbGUgYmFzZWRcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFyZzEgaW5zdGFuY2VvZiBGaWxlQ2hhbmdlc0V2ZW50KSB7XG5cdFx0XHRcdHJldHVybiBhcmcxLmNvbnRhaW5zKGlucHV0Qi5yZXNvdXJjZSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLm1hdGNoZXNGaWxlKGlucHV0Qi5yZXNvdXJjZSwgYXJnMSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzRWRpdG9ySW5wdXQoYXJnMSkpIHtcblx0XHRcdGlmIChpc0VkaXRvcklucHV0KGlucHV0QikpIHtcblx0XHRcdFx0cmV0dXJuIGFyZzEubWF0Y2hlcyhpbnB1dEIpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5tYXRjaGVzRmlsZShpbnB1dEIucmVzb3VyY2UsIGFyZzEpO1xuXHRcdH1cblxuXHRcdGlmIChpc0VkaXRvcklucHV0KGlucHV0QikpIHtcblx0XHRcdHJldHVybiB0aGlzLm1hdGNoZXNGaWxlKGFyZzEucmVzb3VyY2UsIGlucHV0Qik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFyZzEgJiYgaW5wdXRCICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGFyZzEucmVzb3VyY2UsIGlucHV0Qi5yZXNvdXJjZSk7XG5cdH1cblxuXHRtYXRjaGVzRmlsZShyZXNvdXJjZTogVVJJLCBhcmcyOiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0IHwgRmlsZUNoYW5nZXNFdmVudCB8IEZpbGVPcGVyYXRpb25FdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChhcmcyIGluc3RhbmNlb2YgRmlsZUNoYW5nZXNFdmVudCkge1xuXHRcdFx0cmV0dXJuIGFyZzIuY29udGFpbnMocmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdH1cblxuXHRcdGlmIChhcmcyIGluc3RhbmNlb2YgRmlsZU9wZXJhdGlvbkV2ZW50KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgYXJnMi5yZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzRWRpdG9ySW5wdXQoYXJnMikpIHtcblx0XHRcdGNvbnN0IGlucHV0UmVzb3VyY2UgPSBhcmcyLnJlc291cmNlO1xuXHRcdFx0aWYgKCFpbnB1dFJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMubGlmZWN5Y2xlU2VydmljZS5waGFzZSA+PSBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCAmJiAhdGhpcy5maWxlU2VydmljZS5oYXNQcm92aWRlcihpbnB1dFJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIG1ha2Ugc3VyZSB0byBvbmx5IGNoZWNrIHRoaXMgd2hlbiB3b3JrYmVuY2ggaGFzIHJlc3RvcmVkIChmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzQ4Mjc1KVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoaW5wdXRSZXNvdXJjZSwgcmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChhcmcyPy5yZXNvdXJjZSwgcmVzb3VyY2UpO1xuXHR9XG5cblx0bWF0Y2hlc0VkaXRvcklkZW50aWZpZXIoaWRlbnRpZmllcjogSUVkaXRvcklkZW50aWZpZXIsIGVkaXRvclBhbmU/OiBJRWRpdG9yUGFuZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghZWRpdG9yUGFuZT8uZ3JvdXApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoaWRlbnRpZmllci5ncm91cElkICE9PSBlZGl0b3JQYW5lLmdyb3VwLmlkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvclBhbmUuaW5wdXQgPyBpZGVudGlmaWVyLmVkaXRvci5tYXRjaGVzKGVkaXRvclBhbmUuaW5wdXQpIDogZmFsc2U7XG5cdH1cblxuXHRvbkVkaXRvckRpc3Bvc2UoZWRpdG9yOiBFZGl0b3JJbnB1dCwgbGlzdGVuZXI6IEZ1bmN0aW9uLCBtYXBFZGl0b3JUb0Rpc3Bvc2U6IERpc3Bvc2FibGVNYXA8RWRpdG9ySW5wdXQsIERpc3Bvc2FibGVTdG9yZT4pOiB2b2lkIHtcblx0XHRjb25zdCB0b0Rpc3Bvc2UgPSBFdmVudC5vbmNlKGVkaXRvci5vbldpbGxEaXNwb3NlKSgoKSA9PiB7XG5cdFx0XHRtYXBFZGl0b3JUb0Rpc3Bvc2UuZGVsZXRlQW5kRGlzcG9zZShlZGl0b3IpO1xuXHRcdFx0bGlzdGVuZXIoKTtcblx0XHR9KTtcblxuXHRcdGxldCBkaXNwb3NhYmxlcyA9IG1hcEVkaXRvclRvRGlzcG9zZS5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWRpc3Bvc2FibGVzKSB7XG5cdFx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdG1hcEVkaXRvclRvRGlzcG9zZS5zZXQoZWRpdG9yLCBkaXNwb3NhYmxlcyk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zZSk7XG5cdH1cblxuXHRjbGVhck9uRWRpdG9yRGlzcG9zZShlZGl0b3I6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQgfCBGaWxlQ2hhbmdlc0V2ZW50IHwgRmlsZU9wZXJhdGlvbkV2ZW50LCBtYXBFZGl0b3JUb0Rpc3Bvc2U6IERpc3Bvc2FibGVNYXA8RWRpdG9ySW5wdXQsIERpc3Bvc2FibGVTdG9yZT4pOiB2b2lkIHtcblx0XHRpZiAoIWlzRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBvbmx5IHN1cHBvcnRlZCB3aGVuIHBhc3NpbmcgaW4gYW4gYWN0dWFsIGVkaXRvciBpbnB1dFxuXHRcdH1cblxuXHRcdG1hcEVkaXRvclRvRGlzcG9zZS5kZWxldGVBbmREaXNwb3NlKGVkaXRvcik7XG5cdH1cbn1cbiJdLAogICJtYXBw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
