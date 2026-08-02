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
import "./media/openeditors.css";
import * as nls from "../../../../../nls.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { ActionRunner } from "../../../../../base/common/actions.js";
import * as dom from "../../../../../base/browser/dom.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IEditorGroupsService, GroupsOrder, GroupOrientation } from "../../../../services/editor/common/editorGroupsService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { Verbosity, EditorResourceAccessor, SideBySideEditor, GroupModelChangeKind, preventEditorClose, EditorCloseMethod } from "../../../../common/editor.js";
import { SaveAllInGroupAction, CloseGroupAction } from "../fileActions.js";
import { OpenEditorsFocusedContext, ExplorerFocusedContext, OpenEditor } from "../../common/files.js";
import { CloseAllEditorsAction, CloseEditorAction, UnpinEditorAction } from "../../../../browser/parts/editor/editorActions.js";
import { IContextKeyService, ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { asCssVariable, badgeBackground, badgeForeground, contrastBorder } from "../../../../../platform/theme/common/colorRegistry.js";
import { WorkbenchList } from "../../../../../platform/list/browser/listService.js";
import { ListDragOverEffectPosition, ListDragOverEffectType } from "../../../../../base/browser/ui/list/list.js";
import { ResourceLabels } from "../../../../browser/labels.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { DisposableMap, dispose } from "../../../../../base/common/lifecycle.js";
import { MenuId, Action2, registerAction2, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { OpenEditorsDirtyEditorContext, OpenEditorsGroupContext, OpenEditorsReadonlyEditorContext, SAVE_ALL_LABEL, SAVE_ALL_COMMAND_ID, NEW_UNTITLED_FILE_COMMAND_ID, OpenEditorsSelectedFileOrUntitledContext } from "../fileConstants.js";
import { ResourceContextKey, MultipleEditorGroupsContext } from "../../../../common/contextkeys.js";
import { CodeDataTransfers, containsDragType } from "../../../../../platform/dnd/browser/dnd.js";
import { ResourcesDropHandler, fillEditorsDragData } from "../../../../browser/dnd.js";
import { ViewPane } from "../../../../browser/parts/views/viewPane.js";
import { DataTransfers } from "../../../../../base/browser/dnd.js";
import { memoize } from "../../../../../base/common/decorators.js";
import { ElementsDragAndDropData, ListViewTargetSector, NativeDragAndDropData } from "../../../../../base/browser/ui/list/listView.js";
import { IWorkingCopyService } from "../../../../services/workingCopy/common/workingCopyService.js";
import { WorkingCopyCapabilities } from "../../../../services/workingCopy/common/workingCopy.js";
import { IFilesConfigurationService } from "../../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IViewDescriptorService } from "../../../../common/views.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { Orientation } from "../../../../../base/browser/ui/splitview/splitview.js";
import { compareFileNamesDefault } from "../../../../../base/common/comparers.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { Schemas } from "../../../../../base/common/network.js";
import { extUriIgnorePathCase } from "../../../../../base/common/resources.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { EditorGroupView } from "../../../../browser/parts/editor/editorGroupView.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
const $ = dom.$;
let OpenEditorsView = class extends ViewPane {
  constructor(options, instantiationService, viewDescriptorService, contextMenuService, editorGroupService, configurationService, keybindingService, contextKeyService, themeService, telemetryService, hoverService, workingCopyService, filesConfigurationService, openerService, fileService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.editorGroupService = editorGroupService;
    this.telemetryService = telemetryService;
    this.workingCopyService = workingCopyService;
    this.filesConfigurationService = filesConfigurationService;
    this.fileService = fileService;
    this.needsRefresh = false;
    this.elements = [];
    this.blockFocusActiveEditorTracking = false;
    this.preserveSelectionOnRefresh = false;
    this.editorIds = /* @__PURE__ */ new WeakMap();
    this.editorIdPool = 0;
    this.structuralRefreshDelay = 0;
    this.sortOrder = configurationService.getValue("explorer.openEditors.sortOrder");
    this.registerUpdateEvents();
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationChange(e)));
    this._register(this.workingCopyService.onDidChangeDirty((workingCopy) => this.updateDirtyIndicator(workingCopy)));
  }
  registerUpdateEvents() {
    const updateWholeList = () => {
      if (!this.isBodyVisible() || !this.list) {
        this.needsRefresh = true;
        return;
      }
      this.scheduleListRefresh(false, this.structuralRefreshDelay);
    };
    const groupDisposables = this._register(new DisposableMap());
    const addGroupListener = (group) => {
      const groupModelChangeListener = group.onDidModelChange((e) => {
        if (this.listRefreshScheduler?.isScheduled()) {
          switch (e.kind) {
            case GroupModelChangeKind.EDITOR_ACTIVE:
            case GroupModelChangeKind.EDITOR_OPEN:
            case GroupModelChangeKind.EDITOR_MOVE:
            case GroupModelChangeKind.EDITOR_CLOSE:
              this.preserveSelectionOnRefresh = false;
          }
          return;
        }
        if (!this.isBodyVisible() || !this.list) {
          this.needsRefresh = true;
          return;
        }
        const index = this.getIndex(group, e.editor);
        switch (e.kind) {
          case GroupModelChangeKind.EDITOR_ACTIVE:
            this.focusActiveEditor();
            break;
          case GroupModelChangeKind.GROUP_INDEX:
          case GroupModelChangeKind.GROUP_LABEL:
            if (index >= 0) {
              this.list.splice(index, 1, [group]);
            }
            break;
          case GroupModelChangeKind.EDITOR_DIRTY:
          case GroupModelChangeKind.EDITOR_STICKY:
          case GroupModelChangeKind.EDITOR_CAPABILITIES:
          case GroupModelChangeKind.EDITOR_PIN:
          case GroupModelChangeKind.EDITOR_LABEL:
            this.list.splice(index, 1, [new OpenEditor(e.editor, group)]);
            this.focusActiveEditor(true);
            break;
          case GroupModelChangeKind.EDITOR_OPEN:
          case GroupModelChangeKind.EDITOR_MOVE:
          case GroupModelChangeKind.EDITOR_CLOSE:
            updateWholeList();
            break;
        }
      });
      groupDisposables.set(group.id, groupModelChangeListener);
    };
    this.editorGroupService.groups.forEach((g) => addGroupListener(g));
    this._register(this.editorGroupService.onDidAddGroup((group) => {
      addGroupListener(group);
      updateWholeList();
    }));
    this._register(this.editorGroupService.onDidMoveGroup(() => updateWholeList()));
    this._register(this.editorGroupService.onDidChangeActiveGroup(() => this.focusActiveEditor()));
    this._register(this.editorGroupService.onDidRemoveGroup((group) => {
      groupDisposables.deleteAndDispose(group.id);
      updateWholeList();
    }));
  }
  renderHeaderTitle(container) {
    super.renderHeaderTitle(container, this.title);
    const count = dom.append(container, $(".open-editors-dirty-count-container"));
    this.dirtyCountElement = dom.append(count, $(".dirty-count.monaco-count-badge.long"));
    this.dirtyCountElement.style.backgroundColor = asCssVariable(badgeBackground);
    this.dirtyCountElement.style.color = asCssVariable(badgeForeground);
    this.dirtyCountElement.style.border = `1px solid ${asCssVariable(contrastBorder)}`;
    this.updateDirtyIndicator();
  }
  renderBody(container) {
    super.renderBody(container);
    container.classList.add("open-editors");
    container.classList.add("show-file-icons");
    const delegate = new OpenEditorsDelegate();
    if (this.list) {
      this.list.dispose();
    }
    if (this.listLabels) {
      this.listLabels.clear();
    }
    this.dnd = new OpenEditorsDragAndDrop(this.sortOrder, this.instantiationService, this.editorGroupService);
    this.listLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
    this.list = this.instantiationService.createInstance(WorkbenchList, "OpenEditors", container, delegate, [
      new EditorGroupRenderer(this.keybindingService, this.instantiationService),
      new OpenEditorRenderer(this.listLabels, this.instantiationService, this.keybindingService, this.configurationService)
    ], {
      identityProvider: { getId: (element) => this.getElementId(element) },
      dnd: this.dnd,
      overrideStyles: this.getLocationBasedColors().listOverrideStyles,
      accessibilityProvider: new OpenEditorsAccessibilityProvider(),
      openOnSingleClick: true
    });
    this._register(this.list);
    this._register(this.listLabels);
    let labelChangeListeners = [];
    this.listRefreshScheduler = this._register(new RunOnceScheduler(() => {
      const preserveSelection = this.preserveSelectionOnRefresh;
      this.preserveSelectionOnRefresh = false;
      if (!this.list) {
        return;
      }
      labelChangeListeners = dispose(labelChangeListeners);
      const previousLength = this.list.length;
      const elements = this.getElements();
      this.list.splice(0, this.list.length, elements);
      this.focusActiveEditor(preserveSelection);
      if (previousLength !== this.list.length) {
        this.updateSize();
      }
      this.needsRefresh = false;
      if (this.sortOrder === "alphabetical" || this.sortOrder === "fullPath") {
        elements.forEach((e) => {
          if (e instanceof OpenEditor) {
            labelChangeListeners.push(e.editor.onDidChangeLabel(() => this.scheduleListRefresh(true)));
          }
        });
      }
    }, this.structuralRefreshDelay));
    this.updateSize();
    this.handleContextKeys();
    this._register(this.list.onContextMenu((e) => this.onListContextMenu(e)));
    this._register(this.list.onMouseMiddleClick((e) => {
      if (e && e.element instanceof OpenEditor) {
        if (preventEditorClose(e.element.group, e.element.editor, EditorCloseMethod.MOUSE, this.editorGroupService.partOptions)) {
          return;
        }
        e.element.group.closeEditor(e.element.editor, { preserveFocus: true });
      }
    }));
    this._register(this.list.onDidOpen((e) => {
      const element = e.element;
      if (!element) {
        return;
      } else if (element instanceof OpenEditor) {
        if (dom.isMouseEvent(e.browserEvent) && e.browserEvent.button === 1) {
          return;
        }
        this.withActiveEditorFocusTrackingDisabled(() => {
          this.openEditor(element, { preserveFocus: e.editorOptions.preserveFocus, pinned: e.editorOptions.pinned, sideBySide: e.sideBySide });
        });
      } else {
        this.withActiveEditorFocusTrackingDisabled(() => {
          this.editorGroupService.activateGroup(element);
          if (!e.editorOptions.preserveFocus) {
            element.focus();
          }
        });
      }
    }));
    this.scheduleListRefresh(false, 0);
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible && this.needsRefresh) {
        this.scheduleListRefresh(false, 0);
      }
    }));
    const containerModel = this.viewDescriptorService.getViewContainerModel(this.viewDescriptorService.getViewContainerByViewId(this.id));
    this._register(containerModel.onDidChangeAllViewDescriptors(() => {
      this.updateSize();
    }));
  }
  handleContextKeys() {
    if (!this.list) {
      return;
    }
    OpenEditorsFocusedContext.bindTo(this.list.contextKeyService);
    ExplorerFocusedContext.bindTo(this.list.contextKeyService);
    const groupFocusedContext = OpenEditorsGroupContext.bindTo(this.contextKeyService);
    const dirtyEditorFocusedContext = OpenEditorsDirtyEditorContext.bindTo(this.contextKeyService);
    const readonlyEditorFocusedContext = OpenEditorsReadonlyEditorContext.bindTo(this.contextKeyService);
    const openEditorsSelectedFileOrUntitledContext = OpenEditorsSelectedFileOrUntitledContext.bindTo(this.contextKeyService);
    const resourceContext = this.instantiationService.createInstance(ResourceContextKey);
    this._register(resourceContext);
    this._register(this.list.onDidChangeFocus((e) => {
      resourceContext.reset();
      groupFocusedContext.reset();
      dirtyEditorFocusedContext.reset();
      readonlyEditorFocusedContext.reset();
      const element = e.elements.length ? e.elements[0] : void 0;
      if (element instanceof OpenEditor) {
        const resource = element.getResource();
        dirtyEditorFocusedContext.set(element.editor.isDirty() && !element.editor.isSaving());
        readonlyEditorFocusedContext.set(!!element.editor.isReadonly());
        resourceContext.set(resource ?? null);
      } else if (element) {
        groupFocusedContext.set(true);
      }
    }));
    this._register(this.list.onDidChangeSelection((e) => {
      const selectedAreFileOrUntitled = e.elements.every((e2) => {
        if (e2 instanceof OpenEditor) {
          const resource = e2.getResource();
          return resource && (resource.scheme === Schemas.untitled || this.fileService.hasProvider(resource));
        }
        return false;
      });
      openEditorsSelectedFileOrUntitledContext.set(selectedAreFileOrUntitled);
    }));
  }
  focus() {
    super.focus();
    this.list?.domFocus();
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.list?.layout(height, width);
  }
  get showGroups() {
    return this.editorGroupService.groups.length > 1;
  }
  getElements() {
    this.elements = [];
    this.editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE).forEach((g) => {
      if (this.showGroups) {
        this.elements.push(g);
      }
      let editors = g.editors.map((ei) => new OpenEditor(ei, g));
      if (this.sortOrder === "alphabetical") {
        editors = editors.sort((first, second) => compareFileNamesDefault(first.editor.getName(), second.editor.getName()));
      } else if (this.sortOrder === "fullPath") {
        editors = editors.sort((first, second) => {
          const firstResource = first.editor.resource;
          const secondResource = second.editor.resource;
          if (firstResource === void 0 && secondResource === void 0) {
            return compareFileNamesDefault(first.editor.getName(), second.editor.getName());
          } else if (firstResource === void 0) {
            return -1;
          } else if (secondResource === void 0) {
            return 1;
          } else {
            const firstScheme = firstResource.scheme;
            const secondScheme = secondResource.scheme;
            if (firstScheme !== Schemas.file && secondScheme !== Schemas.file) {
              return extUriIgnorePathCase.compare(firstResource, secondResource);
            } else if (firstScheme !== Schemas.file) {
              return -1;
            } else if (secondScheme !== Schemas.file) {
              return 1;
            } else {
              return extUriIgnorePathCase.compare(firstResource, secondResource);
            }
          }
        });
      }
      this.elements.push(...editors);
    });
    return this.elements;
  }
  getIndex(group, editor) {
    if (!editor) {
      return this.elements.findIndex((e) => !(e instanceof OpenEditor) && e.id === group.id);
    }
    return this.elements.findIndex((e) => e instanceof OpenEditor && e.editor === editor && e.group.id === group.id);
  }
  openEditor(element, options) {
    if (element) {
      this.telemetryService.publicLog2("workbenchActionExecuted", { id: "workbench.files.openFile", from: "openEditors" });
      const preserveActivateGroup = options.sideBySide && options.preserveFocus;
      if (!preserveActivateGroup) {
        this.editorGroupService.activateGroup(element.group);
      }
      const targetGroup = options.sideBySide ? this.editorGroupService.sideGroup : element.group;
      targetGroup.openEditor(element.editor, options);
    }
  }
  onListContextMenu(e) {
    if (!e.element) {
      return;
    }
    const element = e.element;
    this.contextMenuService.showContextMenu({
      menuId: MenuId.OpenEditorsContext,
      menuActionOptions: { shouldForwardArgs: true, arg: element instanceof OpenEditor ? EditorResourceAccessor.getOriginalUri(element.editor) : {} },
      contextKeyService: this.list?.contextKeyService,
      getAnchor: () => e.anchor,
      getActionsContext: () => element instanceof OpenEditor ? { groupId: element.groupId, editorIndex: element.group.getIndexOfEditor(element.editor) } : { groupId: element.id }
    });
  }
  withActiveEditorFocusTrackingDisabled(fn) {
    this.blockFocusActiveEditorTracking = true;
    try {
      fn();
    } finally {
      this.blockFocusActiveEditorTracking = false;
    }
  }
  scheduleListRefresh(preserveSelection, delay) {
    if (!this.listRefreshScheduler) {
      return;
    }
    if (!preserveSelection || !this.listRefreshScheduler.isScheduled()) {
      this.preserveSelectionOnRefresh = preserveSelection;
    }
    this.listRefreshScheduler.schedule(delay);
  }
  getElementId(element) {
    if (!(element instanceof OpenEditor)) {
      return element.id.toString();
    }
    let editorId = this.editorIds.get(element.editor);
    if (editorId === void 0) {
      editorId = this.editorIdPool++;
      this.editorIds.set(element.editor, editorId);
    }
    return `openeditor:${element.groupId}:${editorId}`;
  }
  focusActiveEditor(preserveSelection = false) {
    if (!this.list || this.blockFocusActiveEditorTracking) {
      return;
    }
    if (this.list.length && this.editorGroupService.activeGroup) {
      const index = this.getIndex(this.editorGroupService.activeGroup, this.editorGroupService.activeGroup.activeEditor);
      if (index >= 0) {
        try {
          this.list.setFocus([index]);
          if (!preserveSelection) {
            this.list.setSelection([index]);
          }
          this.list.reveal(index);
        } catch (e) {
        }
        return;
      }
    }
    this.list.setFocus([]);
    if (!preserveSelection) {
      this.list.setSelection([]);
    }
  }
  onConfigurationChange(event) {
    if (event.affectsConfiguration("explorer.openEditors")) {
      this.updateSize();
    }
    if (event.affectsConfiguration("explorer.decorations") || event.affectsConfiguration("explorer.openEditors.sortOrder")) {
      this.sortOrder = this.configurationService.getValue("explorer.openEditors.sortOrder");
      if (this.dnd) {
        this.dnd.sortOrder = this.sortOrder;
      }
      this.scheduleListRefresh(false);
    }
  }
  updateSize() {
    this.minimumBodySize = this.orientation === Orientation.VERTICAL ? this.getMinExpandedBodySize() : 170;
    this.maximumBodySize = this.orientation === Orientation.VERTICAL ? this.getMaxExpandedBodySize() : Number.POSITIVE_INFINITY;
  }
  updateDirtyIndicator(workingCopy) {
    if (workingCopy) {
      const gotDirty = workingCopy.isDirty();
      if (gotDirty && !(workingCopy.capabilities & WorkingCopyCapabilities.Untitled) && this.filesConfigurationService.hasShortAutoSaveDelay(workingCopy.resource)) {
        return;
      }
    }
    const dirty = this.workingCopyService.dirtyCount;
    if (dirty === 0) {
      this.dirtyCountElement.classList.add("hidden");
    } else {
      this.dirtyCountElement.textContent = nls.localize("dirtyCounter", "{0} unsaved", dirty);
      this.dirtyCountElement.classList.remove("hidden");
    }
  }
  get elementCount() {
    return this.editorGroupService.groups.map((g) => g.count).reduce((first, second) => first + second, this.showGroups ? this.editorGroupService.groups.length : 0);
  }
  getMaxExpandedBodySize() {
    let minVisibleOpenEditors = this.configurationService.getValue("explorer.openEditors.minVisible");
    if (typeof minVisibleOpenEditors !== "number") {
      minVisibleOpenEditors = OpenEditorsView.DEFAULT_MIN_VISIBLE_OPEN_EDITORS;
    }
    const containerModel = this.viewDescriptorService.getViewContainerModel(this.viewDescriptorService.getViewContainerByViewId(this.id));
    if (containerModel.visibleViewDescriptors.length <= 1) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(this.elementCount, minVisibleOpenEditors) * OpenEditorsDelegate.ITEM_HEIGHT;
  }
  getMinExpandedBodySize() {
    let visibleOpenEditors = this.configurationService.getValue("explorer.openEditors.visible");
    if (typeof visibleOpenEditors !== "number") {
      visibleOpenEditors = OpenEditorsView.DEFAULT_VISIBLE_OPEN_EDITORS;
    }
    return this.computeMinExpandedBodySize(visibleOpenEditors);
  }
  computeMinExpandedBodySize(visibleOpenEditors = OpenEditorsView.DEFAULT_VISIBLE_OPEN_EDITORS) {
    const itemsToShow = Math.min(Math.max(visibleOpenEditors, 1), this.elementCount);
    return itemsToShow * OpenEditorsDelegate.ITEM_HEIGHT;
  }
  setStructuralRefreshDelay(delay) {
    this.structuralRefreshDelay = delay;
  }
  getOptimalWidth() {
    if (!this.list) {
      return super.getOptimalWidth();
    }
    const parentNode = this.list.getHTMLElement();
    const childNodes = [].slice.call(parentNode.querySelectorAll(".open-editor > a"));
    return dom.getLargestChildWidth(parentNode, childNodes);
  }
};
OpenEditorsView.DEFAULT_VISIBLE_OPEN_EDITORS = 9;
OpenEditorsView.DEFAULT_MIN_VISIBLE_OPEN_EDITORS = 0;
OpenEditorsView.ID = "workbench.explorer.openEditorsView";
OpenEditorsView.NAME = nls.localize2({ key: "openEditors", comment: ["Open is an adjective"] }, "Open Editors");
OpenEditorsView = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IViewDescriptorService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IEditorGroupsService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IWorkingCopyService),
  __decorateParam(12, IFilesConfigurationService),
  __decorateParam(13, IOpenerService),
  __decorateParam(14, IFileService)
], OpenEditorsView);
class OpenEditorActionRunner extends ActionRunner {
  async run(action) {
    if (!this.editor) {
      return;
    }
    return super.run(action, { groupId: this.editor.groupId, editorIndex: this.editor.group.getIndexOfEditor(this.editor.editor) });
  }
}
const _OpenEditorsDelegate = class _OpenEditorsDelegate {
  getHeight(_element) {
    return _OpenEditorsDelegate.ITEM_HEIGHT;
  }
  getTemplateId(element) {
    if (element instanceof OpenEditor) {
      return OpenEditorRenderer.ID;
    }
    return EditorGroupRenderer.ID;
  }
};
_OpenEditorsDelegate.ITEM_HEIGHT = 22;
let OpenEditorsDelegate = _OpenEditorsDelegate;
const _EditorGroupRenderer = class _EditorGroupRenderer {
  constructor(keybindingService, instantiationService) {
    this.keybindingService = keybindingService;
    this.instantiationService = instantiationService;
  }
  get templateId() {
    return _EditorGroupRenderer.ID;
  }
  renderTemplate(container) {
    const editorGroupTemplate = /* @__PURE__ */ Object.create(null);
    editorGroupTemplate.root = dom.append(container, $(".editor-group"));
    editorGroupTemplate.name = dom.append(editorGroupTemplate.root, $("span.name"));
    editorGroupTemplate.actionBar = new ActionBar(container);
    const saveAllInGroupAction = this.instantiationService.createInstance(SaveAllInGroupAction, SaveAllInGroupAction.ID, SaveAllInGroupAction.LABEL);
    const saveAllInGroupKey = this.keybindingService.lookupKeybinding(saveAllInGroupAction.id);
    editorGroupTemplate.actionBar.push(saveAllInGroupAction, { icon: true, label: false, keybinding: saveAllInGroupKey ? saveAllInGroupKey.getLabel() : void 0 });
    const closeGroupAction = this.instantiationService.createInstance(CloseGroupAction, CloseGroupAction.ID, CloseGroupAction.LABEL);
    const closeGroupActionKey = this.keybindingService.lookupKeybinding(closeGroupAction.id);
    editorGroupTemplate.actionBar.push(closeGroupAction, { icon: true, label: false, keybinding: closeGroupActionKey ? closeGroupActionKey.getLabel() : void 0 });
    return editorGroupTemplate;
  }
  renderElement(editorGroup, _index, templateData) {
    templateData.editorGroup = editorGroup;
    templateData.name.textContent = editorGroup.label;
    templateData.actionBar.context = { groupId: editorGroup.id };
  }
  disposeTemplate(templateData) {
    templateData.actionBar.dispose();
  }
};
_EditorGroupRenderer.ID = "editorgroup";
let EditorGroupRenderer = _EditorGroupRenderer;
const _OpenEditorRenderer = class _OpenEditorRenderer {
  constructor(labels, instantiationService, keybindingService, configurationService) {
    this.labels = labels;
    this.instantiationService = instantiationService;
    this.keybindingService = keybindingService;
    this.configurationService = configurationService;
    this.closeEditorAction = this.instantiationService.createInstance(CloseEditorAction, CloseEditorAction.ID, CloseEditorAction.LABEL);
    this.unpinEditorAction = this.instantiationService.createInstance(UnpinEditorAction, UnpinEditorAction.ID, UnpinEditorAction.LABEL);
  }
  get templateId() {
    return _OpenEditorRenderer.ID;
  }
  renderTemplate(container) {
    const editorTemplate = /* @__PURE__ */ Object.create(null);
    editorTemplate.container = container;
    editorTemplate.actionRunner = new OpenEditorActionRunner();
    editorTemplate.actionBar = new ActionBar(container, { actionRunner: editorTemplate.actionRunner });
    editorTemplate.root = this.labels.create(container);
    return editorTemplate;
  }
  renderElement(openedEditor, _index, templateData) {
    const editor = openedEditor.editor;
    templateData.actionRunner.editor = openedEditor;
    templateData.container.classList.toggle("dirty", editor.isDirty() && !editor.isSaving());
    templateData.container.classList.toggle("sticky", openedEditor.isSticky());
    templateData.root.setResource({
      resource: EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH }),
      name: editor.getName(),
      description: editor.getDescription(Verbosity.MEDIUM)
    }, {
      italic: openedEditor.isPreview(),
      extraClasses: ["open-editor"].concat(openedEditor.editor.getLabelExtraClasses()),
      fileDecorations: this.configurationService.getValue().explorer.decorations,
      title: editor.getTitle(Verbosity.LONG),
      icon: editor.getIcon()
    });
    const editorAction = openedEditor.isSticky() ? this.unpinEditorAction : this.closeEditorAction;
    if (!templateData.actionBar.hasAction(editorAction)) {
      if (!templateData.actionBar.isEmpty()) {
        templateData.actionBar.clear();
      }
      templateData.actionBar.push(editorAction, { icon: true, label: false, keybinding: this.keybindingService.lookupKeybinding(editorAction.id)?.getLabel() });
    }
  }
  disposeTemplate(templateData) {
    templateData.actionBar.dispose();
    templateData.root.dispose();
    templateData.actionRunner.dispose();
  }
};
_OpenEditorRenderer.ID = "openeditor";
let OpenEditorRenderer = _OpenEditorRenderer;
class OpenEditorsDragAndDrop {
  constructor(sortOrder, instantiationService, editorGroupService) {
    this.instantiationService = instantiationService;
    this.editorGroupService = editorGroupService;
    this._sortOrder = sortOrder;
  }
  set sortOrder(value) {
    this._sortOrder = value;
  }
  get dropHandler() {
    return this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: false });
  }
  getDragURI(element) {
    if (element instanceof OpenEditor) {
      const resource = element.getResource();
      if (resource) {
        return resource.toString();
      }
    }
    return null;
  }
  getDragLabel(elements) {
    if (elements.length > 1) {
      return String(elements.length);
    }
    const element = elements[0];
    return element instanceof OpenEditor ? element.editor.getName() : element.label;
  }
  onDragStart(data, originalEvent) {
    const items = data.elements;
    const editors = [];
    if (items) {
      for (const item of items) {
        if (item instanceof OpenEditor) {
          editors.push(item);
        }
      }
    }
    if (editors.length) {
      this.instantiationService.invokeFunction(fillEditorsDragData, editors, originalEvent);
    }
  }
  onDragOver(data, _targetElement, _targetIndex, targetSector, originalEvent) {
    if (data instanceof NativeDragAndDropData) {
      if (!containsDragType(originalEvent, DataTransfers.FILES, CodeDataTransfers.FILES)) {
        return false;
      }
    }
    if (this._sortOrder !== "editorOrder") {
      if (data instanceof ElementsDragAndDropData) {
        return false;
      } else {
        return { accept: true, effect: { type: ListDragOverEffectType.Move }, feedback: [-1] };
      }
    }
    let dropEffectPosition = void 0;
    switch (targetSector) {
      case ListViewTargetSector.TOP:
      case ListViewTargetSector.CENTER_TOP:
        dropEffectPosition = _targetIndex === 0 && _targetElement instanceof EditorGroupView ? ListDragOverEffectPosition.After : ListDragOverEffectPosition.Before;
        break;
      case ListViewTargetSector.CENTER_BOTTOM:
      case ListViewTargetSector.BOTTOM:
        dropEffectPosition = ListDragOverEffectPosition.After;
        break;
    }
    return { accept: true, effect: { type: ListDragOverEffectType.Move, position: dropEffectPosition }, feedback: [_targetIndex] };
  }
  drop(data, targetElement, _targetIndex, targetSector, originalEvent) {
    let group = targetElement instanceof OpenEditor ? targetElement.group : targetElement || this.editorGroupService.groups[this.editorGroupService.count - 1];
    let targetEditorIndex = targetElement instanceof OpenEditor ? targetElement.group.getIndexOfEditor(targetElement.editor) : 0;
    switch (targetSector) {
      case ListViewTargetSector.TOP:
      case ListViewTargetSector.CENTER_TOP:
        if (targetElement instanceof EditorGroupView && group.index !== 0) {
          group = this.editorGroupService.groups[group.index - 1];
          targetEditorIndex = group.count;
        }
        break;
      case ListViewTargetSector.BOTTOM:
      case ListViewTargetSector.CENTER_BOTTOM:
        if (targetElement instanceof OpenEditor) {
          targetEditorIndex++;
        }
        break;
    }
    if (data instanceof ElementsDragAndDropData) {
      for (const oe of data.elements) {
        const sourceEditorIndex = oe.group.getIndexOfEditor(oe.editor);
        if (oe.group === group && sourceEditorIndex < targetEditorIndex) {
          targetEditorIndex--;
        }
        oe.group.moveEditor(oe.editor, group, { index: targetEditorIndex, preserveFocus: true });
        targetEditorIndex++;
      }
      this.editorGroupService.activateGroup(group);
    } else {
      this.dropHandler.handleDrop(originalEvent, mainWindow, () => group, () => group.focus(), { index: targetEditorIndex });
    }
  }
  dispose() {
  }
}
__decorateClass([
  memoize
], OpenEditorsDragAndDrop.prototype, "dropHandler", 1);
class OpenEditorsAccessibilityProvider {
  getWidgetAriaLabel() {
    return nls.localize("openEditors", "Open Editors");
  }
  getAriaLabel(element) {
    if (element instanceof OpenEditor) {
      return `${element.editor.getName()}, ${element.editor.getDescription()}`;
    }
    return element.ariaLabel;
  }
}
const toggleEditorGroupLayoutId = "workbench.action.toggleEditorGroupLayout";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleEditorGroupLayout",
      title: nls.localize2("flipLayout", "Toggle Vertical/Horizontal Editor Layout"),
      f1: true,
      keybinding: {
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.Digit0,
        mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit0 },
        weight: KeybindingWeight.WorkbenchContrib
      },
      icon: Codicon.editorLayout,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", OpenEditorsView.ID), MultipleEditorGroupsContext),
        order: 10
      }
    });
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const newOrientation = editorGroupService.orientation === GroupOrientation.VERTICAL ? GroupOrientation.HORIZONTAL : GroupOrientation.VERTICAL;
    editorGroupService.setGroupOrientation(newOrientation);
    editorGroupService.activeGroup.focus();
  }
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "5_flip",
  command: {
    id: toggleEditorGroupLayoutId,
    title: {
      ...nls.localize2("miToggleEditorLayoutWithoutMnemonic", "Flip Layout"),
      mnemonicTitle: nls.localize({ key: "miToggleEditorLayout", comment: ["&& denotes a mnemonic"] }, "Flip &&Layout")
    }
  },
  order: 1
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.files.saveAll",
      title: SAVE_ALL_LABEL,
      f1: true,
      icon: Codicon.saveAll,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", OpenEditorsView.ID),
        order: 20
      }
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand(SAVE_ALL_COMMAND_ID);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "openEditors.closeAll",
      title: CloseAllEditorsAction.LABEL,
      f1: false,
      icon: Codicon.closeAll,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", OpenEditorsView.ID),
        order: 30
      }
    });
  }
  async run(accessor) {
    const instantiationService = accessor.get(IInstantiationService);
    const closeAll = new CloseAllEditorsAction();
    await instantiationService.invokeFunction((accessor2) => closeAll.run(accessor2));
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "openEditors.newUntitledFile",
      title: nls.localize2("newUntitledFile", "New Untitled Text File"),
      f1: false,
      icon: Codicon.newFile,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", OpenEditorsView.ID),
        order: 5
      }
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand(NEW_UNTITLED_FILE_COMMAND_ID);
  }
});
export {
  OpenEditorsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2Jyb3dzZXIvdmlld3Mvb3BlbkVkaXRvcnNWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL29wZW5lZGl0b3JzLmNzcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBBY3Rpb25SdW5uZXIsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIElFZGl0b3JHcm91cCwgR3JvdXBzT3JkZXIsIEdyb3VwT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFZlcmJvc2l0eSwgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgU2lkZUJ5U2lkZUVkaXRvciwgSUVkaXRvcklkZW50aWZpZXIsIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLCBwcmV2ZW50RWRpdG9yQ2xvc2UsIEVkaXRvckNsb3NlTWV0aG9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgU2F2ZUFsbEluR3JvdXBBY3Rpb24sIENsb3NlR3JvdXBBY3Rpb24gfSBmcm9tICcuLi9maWxlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBPcGVuRWRpdG9yc0ZvY3VzZWRDb250ZXh0LCBFeHBsb3JlckZvY3VzZWRDb250ZXh0LCBJRmlsZXNDb25maWd1cmF0aW9uLCBPcGVuRWRpdG9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IENsb3NlQWxsRWRpdG9yc0FjdGlvbiwgQ2xvc2VFZGl0b3JBY3Rpb24sIFVucGluRWRpdG9yQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBiYWRnZUJhY2tncm91bmQsIGJhZGdlRm9yZWdyb3VuZCwgY29udHJhc3RCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlLCBJTGlzdFJlbmRlcmVyLCBJTGlzdENvbnRleHRNZW51RXZlbnQsIElMaXN0RHJhZ0FuZERyb3AsIElMaXN0RHJhZ092ZXJSZWFjdGlvbiwgTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24sIExpc3REcmFnT3ZlckVmZmVjdFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IFJlc291cmNlTGFiZWxzLCBJUmVzb3VyY2VMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZU1hcCwgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgT3BlbkVkaXRvcnNEaXJ0eUVkaXRvckNvbnRleHQsIE9wZW5FZGl0b3JzR3JvdXBDb250ZXh0LCBPcGVuRWRpdG9yc1JlYWRvbmx5RWRpdG9yQ29udGV4dCwgU0FWRV9BTExfTEFCRUwsIFNBVkVfQUxMX0NPTU1BTkRfSUQsIE5FV19VTlRJVExFRF9GSUxFX0NPTU1BTkRfSUQsIE9wZW5FZGl0b3JzU2VsZWN0ZWRGaWxlT3JVbnRpdGxlZENvbnRleHQgfSBmcm9tICcuLi9maWxlQ29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFJlc291cmNlQ29udGV4dEtleSwgTXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IENvZGVEYXRhVHJhbnNmZXJzLCBjb250YWluc0RyYWdUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IFJlc291cmNlc0Ryb3BIYW5kbGVyLCBmaWxsRWRpdG9yc0RyYWdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJRHJhZ0FuZERyb3BEYXRhLCBEYXRhVHJhbnNmZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YSwgTGlzdFZpZXdUYXJnZXRTZWN0b3IsIE5hdGl2ZURyYWdBbmREcm9wRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weSwgV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IE9yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IGNvbXBhcmVGaWxlTmFtZXNEZWZhdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29tcGFyZXJzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZXh0VXJpSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEVkaXRvckdyb3VwVmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckdyb3VwVmlldy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmV4cG9ydCBjbGFzcyBPcGVuRWRpdG9yc1ZpZXcgZXh0ZW5kcyBWaWV3UGFuZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9WSVNJQkxFX09QRU5fRURJVE9SUyA9IDk7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERFRkFVTFRfTUlOX1ZJU0lCTEVfT1BFTl9FRElUT1JTID0gMDtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5leHBsb3Jlci5vcGVuRWRpdG9yc1ZpZXcnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTkFNRTogSUxvY2FsaXplZFN0cmluZyA9IG5scy5sb2NhbGl6ZTIoeyBrZXk6ICdvcGVuRWRpdG9ycycsIGNvbW1lbnQ6IFsnT3BlbiBpcyBhbiBhZGplY3RpdmUnXSB9LCBcIk9wZW4gRWRpdG9yc1wiKTtcblxuXHRwcml2YXRlIGRpcnR5Q291bnRFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgbGlzdFJlZnJlc2hTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3RydWN0dXJhbFJlZnJlc2hEZWxheTogbnVtYmVyO1xuXHRwcml2YXRlIGRuZDogT3BlbkVkaXRvcnNEcmFnQW5kRHJvcCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsaXN0OiBXb3JrYmVuY2hMaXN0PE9wZW5FZGl0b3IgfCBJRWRpdG9yR3JvdXA+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGxpc3RMYWJlbHM6IFJlc291cmNlTGFiZWxzIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG5lZWRzUmVmcmVzaCA9IGZhbHNlO1xuXHRwcml2YXRlIGVsZW1lbnRzOiAoT3BlbkVkaXRvciB8IElFZGl0b3JHcm91cClbXSA9IFtdO1xuXHRwcml2YXRlIHNvcnRPcmRlcjogJ2VkaXRvck9yZGVyJyB8ICdhbHBoYWJldGljYWwnIHwgJ2Z1bGxQYXRoJztcblx0cHJpdmF0ZSBibG9ja0ZvY3VzQWN0aXZlRWRpdG9yVHJhY2tpbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBwcmVzZXJ2ZVNlbGVjdGlvbk9uUmVmcmVzaCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcklkcyA9IG5ldyBXZWFrTWFwPEVkaXRvcklucHV0LCBudW1iZXI+KCk7XG5cdHByaXZhdGUgZWRpdG9ySWRQb29sID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtpbmdDb3B5U2VydmljZTogSVdvcmtpbmdDb3B5U2VydmljZSxcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cblx0XHR0aGlzLnN0cnVjdHVyYWxSZWZyZXNoRGVsYXkgPSAwO1xuXHRcdHRoaXMuc29ydE9yZGVyID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2V4cGxvcmVyLm9wZW5FZGl0b3JzLnNvcnRPcmRlcicpO1xuXG5cdFx0dGhpcy5yZWdpc3RlclVwZGF0ZUV2ZW50cygpO1xuXG5cdFx0Ly8gQWxzbyBoYW5kbGUgY29uZmlndXJhdGlvbiB1cGRhdGVzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB0aGlzLm9uQ29uZmlndXJhdGlvbkNoYW5nZShlKSkpO1xuXG5cdFx0Ly8gSGFuZGxlIGRpcnR5IGNvdW50ZXJcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtpbmdDb3B5U2VydmljZS5vbkRpZENoYW5nZURpcnR5KHdvcmtpbmdDb3B5ID0+IHRoaXMudXBkYXRlRGlydHlJbmRpY2F0b3Iod29ya2luZ0NvcHkpKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVXBkYXRlRXZlbnRzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHVwZGF0ZVdob2xlTGlzdCA9ICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5pc0JvZHlWaXNpYmxlKCkgfHwgIXRoaXMubGlzdCkge1xuXHRcdFx0XHR0aGlzLm5lZWRzUmVmcmVzaCA9IHRydWU7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zY2hlZHVsZUxpc3RSZWZyZXNoKGZhbHNlLCB0aGlzLnN0cnVjdHVyYWxSZWZyZXNoRGVsYXkpO1xuXHRcdH07XG5cblx0XHRjb25zdCBncm91cERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyPigpKTtcblx0XHRjb25zdCBhZGRHcm91cExpc3RlbmVyID0gKGdyb3VwOiBJRWRpdG9yR3JvdXApID0+IHtcblx0XHRcdGNvbnN0IGdyb3VwTW9kZWxDaGFuZ2VMaXN0ZW5lciA9IGdyb3VwLm9uRGlkTW9kZWxDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmxpc3RSZWZyZXNoU2NoZWR1bGVyPy5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdFx0c3dpdGNoIChlLmtpbmQpIHtcblx0XHRcdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0FDVElWRTpcblx0XHRcdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX09QRU46XG5cdFx0XHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9NT1ZFOlxuXHRcdFx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQ0xPU0U6XG5cdFx0XHRcdFx0XHRcdHRoaXMucHJlc2VydmVTZWxlY3Rpb25PblJlZnJlc2ggPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghdGhpcy5pc0JvZHlWaXNpYmxlKCkgfHwgIXRoaXMubGlzdCkge1xuXHRcdFx0XHRcdHRoaXMubmVlZHNSZWZyZXNoID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuZ2V0SW5kZXgoZ3JvdXAsIGUuZWRpdG9yKTtcblx0XHRcdFx0c3dpdGNoIChlLmtpbmQpIHtcblx0XHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9BQ1RJVkU6XG5cdFx0XHRcdFx0XHR0aGlzLmZvY3VzQWN0aXZlRWRpdG9yKCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0lOREVYOlxuXHRcdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfTEFCRUw6XG5cdFx0XHRcdFx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmxpc3Quc3BsaWNlKGluZGV4LCAxLCBbZ3JvdXBdKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0RJUlRZOlxuXHRcdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1NUSUNLWTpcblx0XHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9DQVBBQklMSVRJRVM6XG5cdFx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfUElOOlxuXHRcdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0xBQkVMOlxuXHRcdFx0XHRcdFx0dGhpcy5saXN0LnNwbGljZShpbmRleCwgMSwgW25ldyBPcGVuRWRpdG9yKGUuZWRpdG9yISwgZ3JvdXApXSk7XG5cdFx0XHRcdFx0XHR0aGlzLmZvY3VzQWN0aXZlRWRpdG9yKHRydWUpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfT1BFTjpcblx0XHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9NT1ZFOlxuXHRcdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0NMT1NFOlxuXHRcdFx0XHRcdFx0dXBkYXRlV2hvbGVMaXN0KCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRncm91cERpc3Bvc2FibGVzLnNldChncm91cC5pZCwgZ3JvdXBNb2RlbENoYW5nZUxpc3RlbmVyKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ3JvdXBzLmZvckVhY2goZyA9PiBhZGRHcm91cExpc3RlbmVyKGcpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3VwU2VydmljZS5vbkRpZEFkZEdyb3VwKGdyb3VwID0+IHtcblx0XHRcdGFkZEdyb3VwTGlzdGVuZXIoZ3JvdXApO1xuXHRcdFx0dXBkYXRlV2hvbGVMaXN0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm9uRGlkTW92ZUdyb3VwKCgpID0+IHVwZGF0ZVdob2xlTGlzdCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cFNlcnZpY2Uub25EaWRDaGFuZ2VBY3RpdmVHcm91cCgoKSA9PiB0aGlzLmZvY3VzQWN0aXZlRWRpdG9yKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3VwU2VydmljZS5vbkRpZFJlbW92ZUdyb3VwKGdyb3VwID0+IHtcblx0XHRcdGdyb3VwRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZShncm91cC5pZCk7XG5cdFx0XHR1cGRhdGVXaG9sZUxpc3QoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVySGVhZGVyVGl0bGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckhlYWRlclRpdGxlKGNvbnRhaW5lciwgdGhpcy50aXRsZSk7XG5cblx0XHRjb25zdCBjb3VudCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcub3Blbi1lZGl0b3JzLWRpcnR5LWNvdW50LWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLmRpcnR5Q291bnRFbGVtZW50ID0gZG9tLmFwcGVuZChjb3VudCwgJCgnLmRpcnR5LWNvdW50Lm1vbmFjby1jb3VudC1iYWRnZS5sb25nJykpO1xuXG5cdFx0dGhpcy5kaXJ0eUNvdW50RWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBhc0Nzc1ZhcmlhYmxlKGJhZGdlQmFja2dyb3VuZCk7XG5cdFx0dGhpcy5kaXJ0eUNvdW50RWxlbWVudC5zdHlsZS5jb2xvciA9IGFzQ3NzVmFyaWFibGUoYmFkZ2VGb3JlZ3JvdW5kKTtcblx0XHR0aGlzLmRpcnR5Q291bnRFbGVtZW50LnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHthc0Nzc1ZhcmlhYmxlKGNvbnRyYXN0Qm9yZGVyKX1gO1xuXG5cdFx0dGhpcy51cGRhdGVEaXJ0eUluZGljYXRvcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdvcGVuLWVkaXRvcnMnKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2hvdy1maWxlLWljb25zJyk7XG5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBPcGVuRWRpdG9yc0RlbGVnYXRlKCk7XG5cblx0XHRpZiAodGhpcy5saXN0KSB7XG5cdFx0XHR0aGlzLmxpc3QuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5saXN0TGFiZWxzKSB7XG5cdFx0XHR0aGlzLmxpc3RMYWJlbHMuY2xlYXIoKTtcblx0XHR9XG5cblx0XHR0aGlzLmRuZCA9IG5ldyBPcGVuRWRpdG9yc0RyYWdBbmREcm9wKHRoaXMuc29ydE9yZGVyLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLmVkaXRvckdyb3VwU2VydmljZSk7XG5cblx0XHR0aGlzLmxpc3RMYWJlbHMgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCB7IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogdGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5IH0pO1xuXHRcdHRoaXMubGlzdCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoTGlzdCwgJ09wZW5FZGl0b3JzJywgY29udGFpbmVyLCBkZWxlZ2F0ZSwgW1xuXHRcdFx0bmV3IEVkaXRvckdyb3VwUmVuZGVyZXIodGhpcy5rZXliaW5kaW5nU2VydmljZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSksXG5cdFx0XHRuZXcgT3BlbkVkaXRvclJlbmRlcmVyKHRoaXMubGlzdExhYmVscywgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSlcblx0XHRdLCB7XG5cdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7IGdldElkOiAoZWxlbWVudDogT3BlbkVkaXRvciB8IElFZGl0b3JHcm91cCkgPT4gdGhpcy5nZXRFbGVtZW50SWQoZWxlbWVudCkgfSxcblx0XHRcdGRuZDogdGhpcy5kbmQsXG5cdFx0XHRvdmVycmlkZVN0eWxlczogdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkubGlzdE92ZXJyaWRlU3R5bGVzLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgT3BlbkVkaXRvcnNBY2Nlc3NpYmlsaXR5UHJvdmlkZXIoKSxcblx0XHRcdG9wZW5PblNpbmdsZUNsaWNrOiB0cnVlXG5cdFx0fSkgYXMgV29ya2JlbmNoTGlzdDxPcGVuRWRpdG9yIHwgSUVkaXRvckdyb3VwPjtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3QpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdExhYmVscyk7XG5cblx0XHQvLyBSZWdpc3RlciB0aGUgcmVmcmVzaCBzY2hlZHVsZXJcblx0XHRsZXQgbGFiZWxDaGFuZ2VMaXN0ZW5lcnM6IElEaXNwb3NhYmxlW10gPSBbXTtcblx0XHR0aGlzLmxpc3RSZWZyZXNoU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJlc2VydmVTZWxlY3Rpb24gPSB0aGlzLnByZXNlcnZlU2VsZWN0aW9uT25SZWZyZXNoO1xuXHRcdFx0dGhpcy5wcmVzZXJ2ZVNlbGVjdGlvbk9uUmVmcmVzaCA9IGZhbHNlO1xuXG5cdFx0XHQvLyBObyBuZWVkIHRvIHJlZnJlc2ggdGhlIGxpc3QgaWYgaXQncyBub3QgcmVuZGVyZWRcblx0XHRcdGlmICghdGhpcy5saXN0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxhYmVsQ2hhbmdlTGlzdGVuZXJzID0gZGlzcG9zZShsYWJlbENoYW5nZUxpc3RlbmVycyk7XG5cdFx0XHRjb25zdCBwcmV2aW91c0xlbmd0aCA9IHRoaXMubGlzdC5sZW5ndGg7XG5cdFx0XHRjb25zdCBlbGVtZW50cyA9IHRoaXMuZ2V0RWxlbWVudHMoKTtcblx0XHRcdHRoaXMubGlzdC5zcGxpY2UoMCwgdGhpcy5saXN0Lmxlbmd0aCwgZWxlbWVudHMpO1xuXHRcdFx0dGhpcy5mb2N1c0FjdGl2ZUVkaXRvcihwcmVzZXJ2ZVNlbGVjdGlvbik7XG5cdFx0XHRpZiAocHJldmlvdXNMZW5ndGggIT09IHRoaXMubGlzdC5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTaXplKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm5lZWRzUmVmcmVzaCA9IGZhbHNlO1xuXG5cdFx0XHRpZiAodGhpcy5zb3J0T3JkZXIgPT09ICdhbHBoYWJldGljYWwnIHx8IHRoaXMuc29ydE9yZGVyID09PSAnZnVsbFBhdGgnKSB7XG5cdFx0XHRcdC8vIFdlIG5lZWQgdG8gcmVzb3J0IHRoZSBsaXN0IGlmIHRoZSBlZGl0b3IgbGFiZWwgY2hhbmdlZFxuXHRcdFx0XHRlbGVtZW50cy5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgT3BlbkVkaXRvcikge1xuXHRcdFx0XHRcdFx0bGFiZWxDaGFuZ2VMaXN0ZW5lcnMucHVzaChlLmVkaXRvci5vbkRpZENoYW5nZUxhYmVsKCgpID0+IHRoaXMuc2NoZWR1bGVMaXN0UmVmcmVzaCh0cnVlKSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSwgdGhpcy5zdHJ1Y3R1cmFsUmVmcmVzaERlbGF5KSk7XG5cblx0XHR0aGlzLnVwZGF0ZVNpemUoKTtcblxuXHRcdHRoaXMuaGFuZGxlQ29udGV4dEtleXMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3Qub25Db250ZXh0TWVudShlID0+IHRoaXMub25MaXN0Q29udGV4dE1lbnUoZSkpKTtcblxuXHRcdC8vIE9wZW4gd2hlbiBzZWxlY3RpbmcgdmlhIGtleWJvYXJkXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uTW91c2VNaWRkbGVDbGljayhlID0+IHtcblx0XHRcdGlmIChlICYmIGUuZWxlbWVudCBpbnN0YW5jZW9mIE9wZW5FZGl0b3IpIHtcblx0XHRcdFx0aWYgKHByZXZlbnRFZGl0b3JDbG9zZShlLmVsZW1lbnQuZ3JvdXAsIGUuZWxlbWVudC5lZGl0b3IsIEVkaXRvckNsb3NlTWV0aG9kLk1PVVNFLCB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5wYXJ0T3B0aW9ucykpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlLmVsZW1lbnQuZ3JvdXAuY2xvc2VFZGl0b3IoZS5lbGVtZW50LmVkaXRvciwgeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3Qub25EaWRPcGVuKGUgPT4ge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGUuZWxlbWVudDtcblx0XHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBPcGVuRWRpdG9yKSB7XG5cdFx0XHRcdGlmIChkb20uaXNNb3VzZUV2ZW50KGUuYnJvd3NlckV2ZW50KSAmJiBlLmJyb3dzZXJFdmVudC5idXR0b24gPT09IDEpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIG1pZGRsZSBjbGljayBhbHJlYWR5IGhhbmRsZWQgYWJvdmU6IGNsb3NlcyB0aGUgZWRpdG9yXG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLndpdGhBY3RpdmVFZGl0b3JGb2N1c1RyYWNraW5nRGlzYWJsZWQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMub3BlbkVkaXRvcihlbGVtZW50LCB7IHByZXNlcnZlRm9jdXM6IGUuZWRpdG9yT3B0aW9ucy5wcmVzZXJ2ZUZvY3VzLCBwaW5uZWQ6IGUuZWRpdG9yT3B0aW9ucy5waW5uZWQsIHNpZGVCeVNpZGU6IGUuc2lkZUJ5U2lkZSB9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLndpdGhBY3RpdmVFZGl0b3JGb2N1c1RyYWNraW5nRGlzYWJsZWQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2YXRlR3JvdXAoZWxlbWVudCk7XG5cdFx0XHRcdFx0aWYgKCFlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cykge1xuXHRcdFx0XHRcdFx0ZWxlbWVudC5mb2N1cygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zY2hlZHVsZUxpc3RSZWZyZXNoKGZhbHNlLCAwKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSh2aXNpYmxlID0+IHtcblx0XHRcdGlmICh2aXNpYmxlICYmIHRoaXMubmVlZHNSZWZyZXNoKSB7XG5cdFx0XHRcdHRoaXMuc2NoZWR1bGVMaXN0UmVmcmVzaChmYWxzZSwgMCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyTW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHRoaXMuaWQpISk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29udGFpbmVyTW9kZWwub25EaWRDaGFuZ2VBbGxWaWV3RGVzY3JpcHRvcnMoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVTaXplKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVDb250ZXh0S2V5cygpIHtcblx0XHRpZiAoIXRoaXMubGlzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEJpbmQgY29udGV4dCBrZXlzXG5cdFx0T3BlbkVkaXRvcnNGb2N1c2VkQ29udGV4dC5iaW5kVG8odGhpcy5saXN0LmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRFeHBsb3JlckZvY3VzZWRDb250ZXh0LmJpbmRUbyh0aGlzLmxpc3QuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZ3JvdXBGb2N1c2VkQ29udGV4dCA9IE9wZW5FZGl0b3JzR3JvdXBDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBkaXJ0eUVkaXRvckZvY3VzZWRDb250ZXh0ID0gT3BlbkVkaXRvcnNEaXJ0eUVkaXRvckNvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IHJlYWRvbmx5RWRpdG9yRm9jdXNlZENvbnRleHQgPSBPcGVuRWRpdG9yc1JlYWRvbmx5RWRpdG9yQ29udGV4dC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3Qgb3BlbkVkaXRvcnNTZWxlY3RlZEZpbGVPclVudGl0bGVkQ29udGV4dCA9IE9wZW5FZGl0b3JzU2VsZWN0ZWRGaWxlT3JVbnRpdGxlZENvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VDb250ZXh0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUNvbnRleHRLZXkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlc291cmNlQ29udGV4dCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3Qub25EaWRDaGFuZ2VGb2N1cyhlID0+IHtcblx0XHRcdHJlc291cmNlQ29udGV4dC5yZXNldCgpO1xuXHRcdFx0Z3JvdXBGb2N1c2VkQ29udGV4dC5yZXNldCgpO1xuXHRcdFx0ZGlydHlFZGl0b3JGb2N1c2VkQ29udGV4dC5yZXNldCgpO1xuXHRcdFx0cmVhZG9ubHlFZGl0b3JGb2N1c2VkQ29udGV4dC5yZXNldCgpO1xuXG5cdFx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50cy5sZW5ndGggPyBlLmVsZW1lbnRzWzBdIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBPcGVuRWRpdG9yKSB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gZWxlbWVudC5nZXRSZXNvdXJjZSgpO1xuXHRcdFx0XHRkaXJ0eUVkaXRvckZvY3VzZWRDb250ZXh0LnNldChlbGVtZW50LmVkaXRvci5pc0RpcnR5KCkgJiYgIWVsZW1lbnQuZWRpdG9yLmlzU2F2aW5nKCkpO1xuXHRcdFx0XHRyZWFkb25seUVkaXRvckZvY3VzZWRDb250ZXh0LnNldCghIWVsZW1lbnQuZWRpdG9yLmlzUmVhZG9ubHkoKSk7XG5cdFx0XHRcdHJlc291cmNlQ29udGV4dC5zZXQocmVzb3VyY2UgPz8gbnVsbCk7XG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQpIHtcblx0XHRcdFx0Z3JvdXBGb2N1c2VkQ29udGV4dC5zZXQodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uKGUgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRBcmVGaWxlT3JVbnRpdGxlZCA9IGUuZWxlbWVudHMuZXZlcnkoZSA9PiB7XG5cdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgT3BlbkVkaXRvcikge1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlID0gZS5nZXRSZXNvdXJjZSgpO1xuXHRcdFx0XHRcdHJldHVybiByZXNvdXJjZSAmJiAocmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkIHx8IHRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIocmVzb3VyY2UpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9KTtcblx0XHRcdG9wZW5FZGl0b3JzU2VsZWN0ZWRGaWxlT3JVbnRpdGxlZENvbnRleHQuc2V0KHNlbGVjdGVkQXJlRmlsZU9yVW50aXRsZWQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cblx0XHR0aGlzLmxpc3Q/LmRvbUZvY3VzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5saXN0Py5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBzaG93R3JvdXBzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5ncm91cHMubGVuZ3RoID4gMTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RWxlbWVudHMoKTogQXJyYXk8SUVkaXRvckdyb3VwIHwgT3BlbkVkaXRvcj4ge1xuXHRcdHRoaXMuZWxlbWVudHMgPSBbXTtcblx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cHMoR3JvdXBzT3JkZXIuR1JJRF9BUFBFQVJBTkNFKS5mb3JFYWNoKGcgPT4ge1xuXHRcdFx0aWYgKHRoaXMuc2hvd0dyb3Vwcykge1xuXHRcdFx0XHR0aGlzLmVsZW1lbnRzLnB1c2goZyk7XG5cdFx0XHR9XG5cdFx0XHRsZXQgZWRpdG9ycyA9IGcuZWRpdG9ycy5tYXAoZWkgPT4gbmV3IE9wZW5FZGl0b3IoZWksIGcpKTtcblx0XHRcdGlmICh0aGlzLnNvcnRPcmRlciA9PT0gJ2FscGhhYmV0aWNhbCcpIHtcblx0XHRcdFx0ZWRpdG9ycyA9IGVkaXRvcnMuc29ydCgoZmlyc3QsIHNlY29uZCkgPT4gY29tcGFyZUZpbGVOYW1lc0RlZmF1bHQoZmlyc3QuZWRpdG9yLmdldE5hbWUoKSwgc2Vjb25kLmVkaXRvci5nZXROYW1lKCkpKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5zb3J0T3JkZXIgPT09ICdmdWxsUGF0aCcpIHtcblx0XHRcdFx0ZWRpdG9ycyA9IGVkaXRvcnMuc29ydCgoZmlyc3QsIHNlY29uZCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGZpcnN0UmVzb3VyY2UgPSBmaXJzdC5lZGl0b3IucmVzb3VyY2U7XG5cdFx0XHRcdFx0Y29uc3Qgc2Vjb25kUmVzb3VyY2UgPSBzZWNvbmQuZWRpdG9yLnJlc291cmNlO1xuXHRcdFx0XHRcdC8vcHV0ICdzeXN0ZW0nIGVkaXRvcnMgYmVmb3JlIGV2ZXJ5dGhpbmdcblx0XHRcdFx0XHRpZiAoZmlyc3RSZXNvdXJjZSA9PT0gdW5kZWZpbmVkICYmIHNlY29uZFJlc291cmNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBjb21wYXJlRmlsZU5hbWVzRGVmYXVsdChmaXJzdC5lZGl0b3IuZ2V0TmFtZSgpLCBzZWNvbmQuZWRpdG9yLmdldE5hbWUoKSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChmaXJzdFJlc291cmNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHNlY29uZFJlc291cmNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBmaXJzdFNjaGVtZSA9IGZpcnN0UmVzb3VyY2Uuc2NoZW1lO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2Vjb25kU2NoZW1lID0gc2Vjb25kUmVzb3VyY2Uuc2NoZW1lO1xuXHRcdFx0XHRcdFx0Ly9wdXQgbm9uLWZpbGUgZWRpdG9ycyBiZWZvcmUgZmlsZXNcblx0XHRcdFx0XHRcdGlmIChmaXJzdFNjaGVtZSAhPT0gU2NoZW1hcy5maWxlICYmIHNlY29uZFNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBleHRVcmlJZ25vcmVQYXRoQ2FzZS5jb21wYXJlKGZpcnN0UmVzb3VyY2UsIHNlY29uZFJlc291cmNlKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZmlyc3RTY2hlbWUgIT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHNlY29uZFNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGV4dFVyaUlnbm9yZVBhdGhDYXNlLmNvbXBhcmUoZmlyc3RSZXNvdXJjZSwgc2Vjb25kUmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVsZW1lbnRzLnB1c2goLi4uZWRpdG9ycyk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50cztcblx0fVxuXG5cdHByaXZhdGUgZ2V0SW5kZXgoZ3JvdXA6IElFZGl0b3JHcm91cCwgZWRpdG9yOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB8IG51bGwpOiBudW1iZXIge1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5lbGVtZW50cy5maW5kSW5kZXgoZSA9PiAhKGUgaW5zdGFuY2VvZiBPcGVuRWRpdG9yKSAmJiBlLmlkID09PSBncm91cC5pZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudHMuZmluZEluZGV4KGUgPT4gZSBpbnN0YW5jZW9mIE9wZW5FZGl0b3IgJiYgZS5lZGl0b3IgPT09IGVkaXRvciAmJiBlLmdyb3VwLmlkID09PSBncm91cC5pZCk7XG5cdH1cblxuXHRwcml2YXRlIG9wZW5FZGl0b3IoZWxlbWVudDogT3BlbkVkaXRvciwgb3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbjsgcGlubmVkPzogYm9vbGVhbjsgc2lkZUJ5U2lkZT86IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiAnd29ya2JlbmNoLmZpbGVzLm9wZW5GaWxlJywgZnJvbTogJ29wZW5FZGl0b3JzJyB9KTtcblxuXHRcdFx0Y29uc3QgcHJlc2VydmVBY3RpdmF0ZUdyb3VwID0gb3B0aW9ucy5zaWRlQnlTaWRlICYmIG9wdGlvbnMucHJlc2VydmVGb2N1czsgLy8gbmVlZGVkIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNDIzOTlcblx0XHRcdGlmICghcHJlc2VydmVBY3RpdmF0ZUdyb3VwKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2YXRlR3JvdXAoZWxlbWVudC5ncm91cCk7IC8vIG5lZWRlZCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzY2NzJcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRhcmdldEdyb3VwID0gb3B0aW9ucy5zaWRlQnlTaWRlID8gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2Uuc2lkZUdyb3VwIDogZWxlbWVudC5ncm91cDtcblx0XHRcdHRhcmdldEdyb3VwLm9wZW5FZGl0b3IoZWxlbWVudC5lZGl0b3IsIG9wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25MaXN0Q29udGV4dE1lbnUoZTogSUxpc3RDb250ZXh0TWVudUV2ZW50PE9wZW5FZGl0b3IgfCBJRWRpdG9yR3JvdXA+KTogdm9pZCB7XG5cdFx0aWYgKCFlLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdG1lbnVJZDogTWVudUlkLk9wZW5FZGl0b3JzQ29udGV4dCxcblx0XHRcdG1lbnVBY3Rpb25PcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLCBhcmc6IGVsZW1lbnQgaW5zdGFuY2VvZiBPcGVuRWRpdG9yID8gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShlbGVtZW50LmVkaXRvcikgOiB7fSB9LFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMubGlzdD8uY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IGVsZW1lbnQgaW5zdGFuY2VvZiBPcGVuRWRpdG9yID8geyBncm91cElkOiBlbGVtZW50Lmdyb3VwSWQsIGVkaXRvckluZGV4OiBlbGVtZW50Lmdyb3VwLmdldEluZGV4T2ZFZGl0b3IoZWxlbWVudC5lZGl0b3IpIH0gOiB7IGdyb3VwSWQ6IGVsZW1lbnQuaWQgfVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB3aXRoQWN0aXZlRWRpdG9yRm9jdXNUcmFja2luZ0Rpc2FibGVkKGZuOiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGhpcy5ibG9ja0ZvY3VzQWN0aXZlRWRpdG9yVHJhY2tpbmcgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRmbigpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmJsb2NrRm9jdXNBY3RpdmVFZGl0b3JUcmFja2luZyA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVMaXN0UmVmcmVzaChwcmVzZXJ2ZVNlbGVjdGlvbjogYm9vbGVhbiwgZGVsYXk/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubGlzdFJlZnJlc2hTY2hlZHVsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXByZXNlcnZlU2VsZWN0aW9uIHx8ICF0aGlzLmxpc3RSZWZyZXNoU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdHRoaXMucHJlc2VydmVTZWxlY3Rpb25PblJlZnJlc2ggPSBwcmVzZXJ2ZVNlbGVjdGlvbjtcblx0XHR9XG5cdFx0dGhpcy5saXN0UmVmcmVzaFNjaGVkdWxlci5zY2hlZHVsZShkZWxheSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEVsZW1lbnRJZChlbGVtZW50OiBPcGVuRWRpdG9yIHwgSUVkaXRvckdyb3VwKTogc3RyaW5nIHtcblx0XHRpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgT3BlbkVkaXRvcikpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LmlkLnRvU3RyaW5nKCk7XG5cdFx0fVxuXG5cdFx0bGV0IGVkaXRvcklkID0gdGhpcy5lZGl0b3JJZHMuZ2V0KGVsZW1lbnQuZWRpdG9yKTtcblx0XHRpZiAoZWRpdG9ySWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZWRpdG9ySWQgPSB0aGlzLmVkaXRvcklkUG9vbCsrO1xuXHRcdFx0dGhpcy5lZGl0b3JJZHMuc2V0KGVsZW1lbnQuZWRpdG9yLCBlZGl0b3JJZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGBvcGVuZWRpdG9yOiR7ZWxlbWVudC5ncm91cElkfToke2VkaXRvcklkfWA7XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzQWN0aXZlRWRpdG9yKHByZXNlcnZlU2VsZWN0aW9uID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubGlzdCB8fCB0aGlzLmJsb2NrRm9jdXNBY3RpdmVFZGl0b3JUcmFja2luZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmxpc3QubGVuZ3RoICYmIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuZ2V0SW5kZXgodGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXAsIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvcik7XG5cdFx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRoaXMubGlzdC5zZXRGb2N1cyhbaW5kZXhdKTtcblx0XHRcdFx0XHRpZiAoIXByZXNlcnZlU2VsZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxpc3Quc2V0U2VsZWN0aW9uKFtpbmRleF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmxpc3QucmV2ZWFsKGluZGV4KTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdC8vIG5vb3AgbGlzdCB1cGRhdGVkIGluIHRoZSBtZWFudGltZVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmxpc3Quc2V0Rm9jdXMoW10pO1xuXHRcdGlmICghcHJlc2VydmVTZWxlY3Rpb24pIHtcblx0XHRcdHRoaXMubGlzdC5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Db25maWd1cmF0aW9uQ2hhbmdlKGV2ZW50OiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKCdleHBsb3Jlci5vcGVuRWRpdG9ycycpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVNpemUoKTtcblx0XHR9XG5cdFx0Ly8gVHJpZ2dlciBhICdyZXBhaW50JyB3aGVuIGRlY29yYXRpb24gc2V0dGluZ3MgY2hhbmdlIG9yIHRoZSBzb3J0IG9yZGVyIGNoYW5nZWRcblx0XHRpZiAoZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2V4cGxvcmVyLmRlY29yYXRpb25zJykgfHwgZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2V4cGxvcmVyLm9wZW5FZGl0b3JzLnNvcnRPcmRlcicpKSB7XG5cdFx0XHR0aGlzLnNvcnRPcmRlciA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2V4cGxvcmVyLm9wZW5FZGl0b3JzLnNvcnRPcmRlcicpO1xuXHRcdFx0aWYgKHRoaXMuZG5kKSB7XG5cdFx0XHRcdHRoaXMuZG5kLnNvcnRPcmRlciA9IHRoaXMuc29ydE9yZGVyO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zY2hlZHVsZUxpc3RSZWZyZXNoKGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNpemUoKTogdm9pZCB7XG5cdFx0Ly8gQWRqdXN0IGV4cGFuZGVkIGJvZHkgc2l6ZVxuXHRcdHRoaXMubWluaW11bUJvZHlTaXplID0gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwgPyB0aGlzLmdldE1pbkV4cGFuZGVkQm9keVNpemUoKSA6IDE3MDtcblx0XHR0aGlzLm1heGltdW1Cb2R5U2l6ZSA9IHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMID8gdGhpcy5nZXRNYXhFeHBhbmRlZEJvZHlTaXplKCkgOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZURpcnR5SW5kaWNhdG9yKHdvcmtpbmdDb3B5PzogSVdvcmtpbmdDb3B5KTogdm9pZCB7XG5cdFx0aWYgKHdvcmtpbmdDb3B5KSB7XG5cdFx0XHRjb25zdCBnb3REaXJ0eSA9IHdvcmtpbmdDb3B5LmlzRGlydHkoKTtcblx0XHRcdGlmIChnb3REaXJ0eSAmJiAhKHdvcmtpbmdDb3B5LmNhcGFiaWxpdGllcyAmIFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLlVudGl0bGVkKSAmJiB0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuaGFzU2hvcnRBdXRvU2F2ZURlbGF5KHdvcmtpbmdDb3B5LnJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIGRvIG5vdCBpbmRpY2F0ZSBkaXJ0eSBvZiB3b3JraW5nIGNvcGllcyB0aGF0IGFyZSBhdXRvIHNhdmVkIGFmdGVyIHNob3J0IGRlbGF5XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlydHkgPSB0aGlzLndvcmtpbmdDb3B5U2VydmljZS5kaXJ0eUNvdW50O1xuXHRcdGlmIChkaXJ0eSA9PT0gMCkge1xuXHRcdFx0dGhpcy5kaXJ0eUNvdW50RWxlbWVudC5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kaXJ0eUNvdW50RWxlbWVudC50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnZGlydHlDb3VudGVyJywgXCJ7MH0gdW5zYXZlZFwiLCBkaXJ0eSk7XG5cdFx0XHR0aGlzLmRpcnR5Q291bnRFbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0IGVsZW1lbnRDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5ncm91cHMubWFwKGcgPT4gZy5jb3VudClcblx0XHRcdC5yZWR1Y2UoKGZpcnN0LCBzZWNvbmQpID0+IGZpcnN0ICsgc2Vjb25kLCB0aGlzLnNob3dHcm91cHMgPyB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5ncm91cHMubGVuZ3RoIDogMCk7XG5cdH1cblxuXHRwcml2YXRlIGdldE1heEV4cGFuZGVkQm9keVNpemUoKTogbnVtYmVyIHtcblx0XHRsZXQgbWluVmlzaWJsZU9wZW5FZGl0b3JzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdleHBsb3Jlci5vcGVuRWRpdG9ycy5taW5WaXNpYmxlJyk7XG5cdFx0Ly8gSWYgaXQncyBub3QgYSBudW1iZXIgc2V0dGluZyBpdCB0byAwIHdpbGwgcmVzdWx0IGluIGR5bmFtaWMgcmVzaXppbmcuXG5cdFx0aWYgKHR5cGVvZiBtaW5WaXNpYmxlT3BlbkVkaXRvcnMgIT09ICdudW1iZXInKSB7XG5cdFx0XHRtaW5WaXNpYmxlT3BlbkVkaXRvcnMgPSBPcGVuRWRpdG9yc1ZpZXcuREVGQVVMVF9NSU5fVklTSUJMRV9PUEVOX0VESVRPUlM7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRhaW5lck1vZGVsID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZCh0aGlzLmlkKSEpO1xuXHRcdGlmIChjb250YWluZXJNb2RlbC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm4gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHRcdH1cblxuXHRcdHJldHVybiAoTWF0aC5tYXgodGhpcy5lbGVtZW50Q291bnQsIG1pblZpc2libGVPcGVuRWRpdG9ycykpICogT3BlbkVkaXRvcnNEZWxlZ2F0ZS5JVEVNX0hFSUdIVDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWluRXhwYW5kZWRCb2R5U2l6ZSgpOiBudW1iZXIge1xuXHRcdGxldCB2aXNpYmxlT3BlbkVkaXRvcnMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ2V4cGxvcmVyLm9wZW5FZGl0b3JzLnZpc2libGUnKTtcblx0XHRpZiAodHlwZW9mIHZpc2libGVPcGVuRWRpdG9ycyAhPT0gJ251bWJlcicpIHtcblx0XHRcdHZpc2libGVPcGVuRWRpdG9ycyA9IE9wZW5FZGl0b3JzVmlldy5ERUZBVUxUX1ZJU0lCTEVfT1BFTl9FRElUT1JTO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNvbXB1dGVNaW5FeHBhbmRlZEJvZHlTaXplKHZpc2libGVPcGVuRWRpdG9ycyk7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVNaW5FeHBhbmRlZEJvZHlTaXplKHZpc2libGVPcGVuRWRpdG9ycyA9IE9wZW5FZGl0b3JzVmlldy5ERUZBVUxUX1ZJU0lCTEVfT1BFTl9FRElUT1JTKTogbnVtYmVyIHtcblx0XHRjb25zdCBpdGVtc1RvU2hvdyA9IE1hdGgubWluKE1hdGgubWF4KHZpc2libGVPcGVuRWRpdG9ycywgMSksIHRoaXMuZWxlbWVudENvdW50KTtcblx0XHRyZXR1cm4gaXRlbXNUb1Nob3cgKiBPcGVuRWRpdG9yc0RlbGVnYXRlLklURU1fSEVJR0hUO1xuXHR9XG5cblx0c2V0U3RydWN0dXJhbFJlZnJlc2hEZWxheShkZWxheTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5zdHJ1Y3R1cmFsUmVmcmVzaERlbGF5ID0gZGVsYXk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRPcHRpbWFsV2lkdGgoKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMubGlzdCkge1xuXHRcdFx0cmV0dXJuIHN1cGVyLmdldE9wdGltYWxXaWR0aCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcmVudE5vZGUgPSB0aGlzLmxpc3QuZ2V0SFRNTEVsZW1lbnQoKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBjaGlsZE5vZGVzOiBIVE1MRWxlbWVudFtdID0gW10uc2xpY2UuY2FsbChwYXJlbnROb2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5vcGVuLWVkaXRvciA+IGEnKSk7XG5cblx0XHRyZXR1cm4gZG9tLmdldExhcmdlc3RDaGlsZFdpZHRoKHBhcmVudE5vZGUsIGNoaWxkTm9kZXMpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJT3BlbkVkaXRvclRlbXBsYXRlRGF0YSB7XG5cdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJvb3Q6IElSZXNvdXJjZUxhYmVsO1xuXHRhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0YWN0aW9uUnVubmVyOiBPcGVuRWRpdG9yQWN0aW9uUnVubmVyO1xufVxuXG5pbnRlcmZhY2UgSUVkaXRvckdyb3VwVGVtcGxhdGVEYXRhIHtcblx0cm9vdDogSFRNTEVsZW1lbnQ7XG5cdG5hbWU6IEhUTUxTcGFuRWxlbWVudDtcblx0YWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdGVkaXRvckdyb3VwOiBJRWRpdG9yR3JvdXA7XG59XG5cbmNsYXNzIE9wZW5FZGl0b3JBY3Rpb25SdW5uZXIgZXh0ZW5kcyBBY3Rpb25SdW5uZXIge1xuXHRwdWJsaWMgZWRpdG9yOiBPcGVuRWRpdG9yIHwgdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY3Rpb246IElBY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLnJ1bihhY3Rpb24sIHsgZ3JvdXBJZDogdGhpcy5lZGl0b3IuZ3JvdXBJZCwgZWRpdG9ySW5kZXg6IHRoaXMuZWRpdG9yLmdyb3VwLmdldEluZGV4T2ZFZGl0b3IodGhpcy5lZGl0b3IuZWRpdG9yKSB9KTtcblx0fVxufVxuXG5jbGFzcyBPcGVuRWRpdG9yc0RlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8T3BlbkVkaXRvciB8IElFZGl0b3JHcm91cD4ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSVRFTV9IRUlHSFQgPSAyMjtcblxuXHRnZXRIZWlnaHQoX2VsZW1lbnQ6IE9wZW5FZGl0b3IgfCBJRWRpdG9yR3JvdXApOiBudW1iZXIge1xuXHRcdHJldHVybiBPcGVuRWRpdG9yc0RlbGVnYXRlLklURU1fSEVJR0hUO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBPcGVuRWRpdG9yIHwgSUVkaXRvckdyb3VwKTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE9wZW5FZGl0b3IpIHtcblx0XHRcdHJldHVybiBPcGVuRWRpdG9yUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEVkaXRvckdyb3VwUmVuZGVyZXIuSUQ7XG5cdH1cbn1cblxuY2xhc3MgRWRpdG9yR3JvdXBSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBUZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvcmdyb3VwJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHQvLyBub29wXG5cdH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpIHtcblx0XHRyZXR1cm4gRWRpdG9yR3JvdXBSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRWRpdG9yR3JvdXBUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwVGVtcGxhdGU6IElFZGl0b3JHcm91cFRlbXBsYXRlRGF0YSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0ZWRpdG9yR3JvdXBUZW1wbGF0ZS5yb290ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5lZGl0b3ItZ3JvdXAnKSk7XG5cdFx0ZWRpdG9yR3JvdXBUZW1wbGF0ZS5uYW1lID0gZG9tLmFwcGVuZChlZGl0b3JHcm91cFRlbXBsYXRlLnJvb3QsICQoJ3NwYW4ubmFtZScpKTtcblx0XHRlZGl0b3JHcm91cFRlbXBsYXRlLmFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIoY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IHNhdmVBbGxJbkdyb3VwQWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTYXZlQWxsSW5Hcm91cEFjdGlvbiwgU2F2ZUFsbEluR3JvdXBBY3Rpb24uSUQsIFNhdmVBbGxJbkdyb3VwQWN0aW9uLkxBQkVMKTtcblx0XHRjb25zdCBzYXZlQWxsSW5Hcm91cEtleSA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhzYXZlQWxsSW5Hcm91cEFjdGlvbi5pZCk7XG5cdFx0ZWRpdG9yR3JvdXBUZW1wbGF0ZS5hY3Rpb25CYXIucHVzaChzYXZlQWxsSW5Hcm91cEFjdGlvbiwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UsIGtleWJpbmRpbmc6IHNhdmVBbGxJbkdyb3VwS2V5ID8gc2F2ZUFsbEluR3JvdXBLZXkuZ2V0TGFiZWwoKSA6IHVuZGVmaW5lZCB9KTtcblxuXHRcdGNvbnN0IGNsb3NlR3JvdXBBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENsb3NlR3JvdXBBY3Rpb24sIENsb3NlR3JvdXBBY3Rpb24uSUQsIENsb3NlR3JvdXBBY3Rpb24uTEFCRUwpO1xuXHRcdGNvbnN0IGNsb3NlR3JvdXBBY3Rpb25LZXkgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoY2xvc2VHcm91cEFjdGlvbi5pZCk7XG5cdFx0ZWRpdG9yR3JvdXBUZW1wbGF0ZS5hY3Rpb25CYXIucHVzaChjbG9zZUdyb3VwQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSwga2V5YmluZGluZzogY2xvc2VHcm91cEFjdGlvbktleSA/IGNsb3NlR3JvdXBBY3Rpb25LZXkuZ2V0TGFiZWwoKSA6IHVuZGVmaW5lZCB9KTtcblxuXHRcdHJldHVybiBlZGl0b3JHcm91cFRlbXBsYXRlO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlZGl0b3JHcm91cDogSUVkaXRvckdyb3VwLCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRWRpdG9yR3JvdXBUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWRpdG9yR3JvdXAgPSBlZGl0b3JHcm91cDtcblx0XHR0ZW1wbGF0ZURhdGEubmFtZS50ZXh0Q29udGVudCA9IGVkaXRvckdyb3VwLmxhYmVsO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY29udGV4dCA9IHsgZ3JvdXBJZDogZWRpdG9yR3JvdXAuaWQgfTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElFZGl0b3JHcm91cFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIE9wZW5FZGl0b3JSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8T3BlbkVkaXRvciwgSU9wZW5FZGl0b3JUZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ29wZW5lZGl0b3InO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2xvc2VFZGl0b3JBY3Rpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgdW5waW5FZGl0b3JBY3Rpb247XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBsYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdHByaXZhdGUgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuY2xvc2VFZGl0b3JBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENsb3NlRWRpdG9yQWN0aW9uLCBDbG9zZUVkaXRvckFjdGlvbi5JRCwgQ2xvc2VFZGl0b3JBY3Rpb24uTEFCRUwpO1xuXHRcdHRoaXMudW5waW5FZGl0b3JBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVucGluRWRpdG9yQWN0aW9uLCBVbnBpbkVkaXRvckFjdGlvbi5JRCwgVW5waW5FZGl0b3JBY3Rpb24uTEFCRUwpO1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCkge1xuXHRcdHJldHVybiBPcGVuRWRpdG9yUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSU9wZW5FZGl0b3JUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGVkaXRvclRlbXBsYXRlOiBJT3BlbkVkaXRvclRlbXBsYXRlRGF0YSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0ZWRpdG9yVGVtcGxhdGUuY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdGVkaXRvclRlbXBsYXRlLmFjdGlvblJ1bm5lciA9IG5ldyBPcGVuRWRpdG9yQWN0aW9uUnVubmVyKCk7XG5cdFx0ZWRpdG9yVGVtcGxhdGUuYWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihjb250YWluZXIsIHsgYWN0aW9uUnVubmVyOiBlZGl0b3JUZW1wbGF0ZS5hY3Rpb25SdW5uZXIgfSk7XG5cdFx0ZWRpdG9yVGVtcGxhdGUucm9vdCA9IHRoaXMubGFiZWxzLmNyZWF0ZShjb250YWluZXIpO1xuXG5cdFx0cmV0dXJuIGVkaXRvclRlbXBsYXRlO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChvcGVuZWRFZGl0b3I6IE9wZW5FZGl0b3IsIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElPcGVuRWRpdG9yVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yID0gb3BlbmVkRWRpdG9yLmVkaXRvcjtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uUnVubmVyLmVkaXRvciA9IG9wZW5lZEVkaXRvcjtcblx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2RpcnR5JywgZWRpdG9yLmlzRGlydHkoKSAmJiAhZWRpdG9yLmlzU2F2aW5nKCkpO1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc3RpY2t5Jywgb3BlbmVkRWRpdG9yLmlzU3RpY2t5KCkpO1xuXHRcdHRlbXBsYXRlRGF0YS5yb290LnNldFJlc291cmNlKHtcblx0XHRcdHJlc291cmNlOiBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5CT1RIIH0pLFxuXHRcdFx0bmFtZTogZWRpdG9yLmdldE5hbWUoKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBlZGl0b3IuZ2V0RGVzY3JpcHRpb24oVmVyYm9zaXR5Lk1FRElVTSlcblx0XHR9LCB7XG5cdFx0XHRpdGFsaWM6IG9wZW5lZEVkaXRvci5pc1ByZXZpZXcoKSxcblx0XHRcdGV4dHJhQ2xhc3NlczogWydvcGVuLWVkaXRvciddLmNvbmNhdChvcGVuZWRFZGl0b3IuZWRpdG9yLmdldExhYmVsRXh0cmFDbGFzc2VzKCkpLFxuXHRcdFx0ZmlsZURlY29yYXRpb25zOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KCkuZXhwbG9yZXIuZGVjb3JhdGlvbnMsXG5cdFx0XHR0aXRsZTogZWRpdG9yLmdldFRpdGxlKFZlcmJvc2l0eS5MT05HKSxcblx0XHRcdGljb246IGVkaXRvci5nZXRJY29uKClcblx0XHR9KTtcblx0XHRjb25zdCBlZGl0b3JBY3Rpb24gPSBvcGVuZWRFZGl0b3IuaXNTdGlja3koKSA/IHRoaXMudW5waW5FZGl0b3JBY3Rpb24gOiB0aGlzLmNsb3NlRWRpdG9yQWN0aW9uO1xuXHRcdGlmICghdGVtcGxhdGVEYXRhLmFjdGlvbkJhci5oYXNBY3Rpb24oZWRpdG9yQWN0aW9uKSkge1xuXHRcdFx0aWYgKCF0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmlzRW1wdHkoKSkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2goZWRpdG9yQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSwga2V5YmluZGluZzogdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGVkaXRvckFjdGlvbi5pZCk/LmdldExhYmVsKCkgfSk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSU9wZW5FZGl0b3JUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEucm9vdC5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvblJ1bm5lci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgT3BlbkVkaXRvcnNEcmFnQW5kRHJvcCBpbXBsZW1lbnRzIElMaXN0RHJhZ0FuZERyb3A8T3BlbkVkaXRvciB8IElFZGl0b3JHcm91cD4ge1xuXG5cdHByaXZhdGUgX3NvcnRPcmRlcjogJ2VkaXRvck9yZGVyJyB8ICdhbHBoYWJldGljYWwnIHwgJ2Z1bGxQYXRoJztcblx0cHVibGljIHNldCBzb3J0T3JkZXIodmFsdWU6ICdlZGl0b3JPcmRlcicgfCAnYWxwaGFiZXRpY2FsJyB8ICdmdWxsUGF0aCcpIHtcblx0XHR0aGlzLl9zb3J0T3JkZXIgPSB2YWx1ZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNvcnRPcmRlcjogJ2VkaXRvck9yZGVyJyB8ICdhbHBoYWJldGljYWwnIHwgJ2Z1bGxQYXRoJyxcblx0XHRwcml2YXRlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX3NvcnRPcmRlciA9IHNvcnRPcmRlcjtcblx0fVxuXG5cdEBtZW1vaXplIHByaXZhdGUgZ2V0IGRyb3BIYW5kbGVyKCk6IFJlc291cmNlc0Ryb3BIYW5kbGVyIHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZXNEcm9wSGFuZGxlciwgeyBhbGxvd1dvcmtzcGFjZU9wZW46IGZhbHNlIH0pO1xuXHR9XG5cblx0Z2V0RHJhZ1VSSShlbGVtZW50OiBPcGVuRWRpdG9yIHwgSUVkaXRvckdyb3VwKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBPcGVuRWRpdG9yKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IGVsZW1lbnQuZ2V0UmVzb3VyY2UoKTtcblx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm4gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRnZXREcmFnTGFiZWw/KGVsZW1lbnRzOiAoT3BlbkVkaXRvciB8IElFZGl0b3JHcm91cClbXSk6IHN0cmluZyB7XG5cdFx0aWYgKGVsZW1lbnRzLmxlbmd0aCA+IDEpIHtcblx0XHRcdHJldHVybiBTdHJpbmcoZWxlbWVudHMubGVuZ3RoKTtcblx0XHR9XG5cdFx0Y29uc3QgZWxlbWVudCA9IGVsZW1lbnRzWzBdO1xuXG5cdFx0cmV0dXJuIGVsZW1lbnQgaW5zdGFuY2VvZiBPcGVuRWRpdG9yID8gZWxlbWVudC5lZGl0b3IuZ2V0TmFtZSgpIDogZWxlbWVudC5sYWJlbDtcblx0fVxuXG5cdG9uRHJhZ1N0YXJ0KGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW1zID0gKGRhdGEgYXMgRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8T3BlbkVkaXRvciB8IElFZGl0b3JHcm91cD4pLmVsZW1lbnRzO1xuXHRcdGNvbnN0IGVkaXRvcnM6IElFZGl0b3JJZGVudGlmaWVyW10gPSBbXTtcblx0XHRpZiAoaXRlbXMpIHtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0XHRpZiAoaXRlbSBpbnN0YW5jZW9mIE9wZW5FZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JzLnB1c2goaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdC8vIEFwcGx5IHNvbWUgZGF0YXRyYW5zZmVyIHR5cGVzIHRvIGFsbG93IGZvciBkcmFnZ2luZyB0aGUgZWxlbWVudCBvdXRzaWRlIG9mIHRoZSBhcHBsaWNhdGlvblxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmaWxsRWRpdG9yc0RyYWdEYXRhLCBlZGl0b3JzLCBvcmlnaW5hbEV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRvbkRyYWdPdmVyKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIF90YXJnZXRFbGVtZW50OiBPcGVuRWRpdG9yIHwgSUVkaXRvckdyb3VwLCBfdGFyZ2V0SW5kZXg6IG51bWJlciwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogYm9vbGVhbiB8IElMaXN0RHJhZ092ZXJSZWFjdGlvbiB7XG5cdFx0aWYgKGRhdGEgaW5zdGFuY2VvZiBOYXRpdmVEcmFnQW5kRHJvcERhdGEpIHtcblx0XHRcdGlmICghY29udGFpbnNEcmFnVHlwZShvcmlnaW5hbEV2ZW50LCBEYXRhVHJhbnNmZXJzLkZJTEVTLCBDb2RlRGF0YVRyYW5zZmVycy5GSUxFUykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zb3J0T3JkZXIgIT09ICdlZGl0b3JPcmRlcicpIHtcblx0XHRcdGlmIChkYXRhIGluc3RhbmNlb2YgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEpIHtcblx0XHRcdFx0Ly8gTm8gcmVvcmRlcmluZyBzdXBwb3J0ZWQgd2hlbiBzb3J0ZWRcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gQWxsb3cgZHJvcGluZyBmaWxlcyB0byBvcGVuIHRoZW1cblx0XHRcdFx0cmV0dXJuIHsgYWNjZXB0OiB0cnVlLCBlZmZlY3Q6IHsgdHlwZTogTGlzdERyYWdPdmVyRWZmZWN0VHlwZS5Nb3ZlIH0sIGZlZWRiYWNrOiBbLTFdIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGRyb3BFZmZlY3RQb3NpdGlvbjogTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0c3dpdGNoICh0YXJnZXRTZWN0b3IpIHtcblx0XHRcdGNhc2UgTGlzdFZpZXdUYXJnZXRTZWN0b3IuVE9QOlxuXHRcdFx0Y2FzZSBMaXN0Vmlld1RhcmdldFNlY3Rvci5DRU5URVJfVE9QOlxuXHRcdFx0XHRkcm9wRWZmZWN0UG9zaXRpb24gPSAoX3RhcmdldEluZGV4ID09PSAwICYmIF90YXJnZXRFbGVtZW50IGluc3RhbmNlb2YgRWRpdG9yR3JvdXBWaWV3KSA/IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLkFmdGVyIDogTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uQmVmb3JlOyBicmVhaztcblx0XHRcdGNhc2UgTGlzdFZpZXdUYXJnZXRTZWN0b3IuQ0VOVEVSX0JPVFRPTTpcblx0XHRcdGNhc2UgTGlzdFZpZXdUYXJnZXRTZWN0b3IuQk9UVE9NOlxuXHRcdFx0XHRkcm9wRWZmZWN0UG9zaXRpb24gPSBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbi5BZnRlcjsgYnJlYWs7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgYWNjZXB0OiB0cnVlLCBlZmZlY3Q6IHsgdHlwZTogTGlzdERyYWdPdmVyRWZmZWN0VHlwZS5Nb3ZlLCBwb3NpdGlvbjogZHJvcEVmZmVjdFBvc2l0aW9uIH0sIGZlZWRiYWNrOiBbX3RhcmdldEluZGV4XSB9O1xuXHR9XG5cblx0ZHJvcChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRFbGVtZW50OiBPcGVuRWRpdG9yIHwgSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkLCBfdGFyZ2V0SW5kZXg6IG51bWJlciwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0bGV0IGdyb3VwID0gdGFyZ2V0RWxlbWVudCBpbnN0YW5jZW9mIE9wZW5FZGl0b3IgPyB0YXJnZXRFbGVtZW50Lmdyb3VwIDogdGFyZ2V0RWxlbWVudCB8fCB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5ncm91cHNbdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuY291bnQgLSAxXTtcblx0XHRsZXQgdGFyZ2V0RWRpdG9ySW5kZXggPSB0YXJnZXRFbGVtZW50IGluc3RhbmNlb2YgT3BlbkVkaXRvciA/IHRhcmdldEVsZW1lbnQuZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcih0YXJnZXRFbGVtZW50LmVkaXRvcikgOiAwO1xuXG5cdFx0c3dpdGNoICh0YXJnZXRTZWN0b3IpIHtcblx0XHRcdGNhc2UgTGlzdFZpZXdUYXJnZXRTZWN0b3IuVE9QOlxuXHRcdFx0Y2FzZSBMaXN0Vmlld1RhcmdldFNlY3Rvci5DRU5URVJfVE9QOlxuXHRcdFx0XHRpZiAodGFyZ2V0RWxlbWVudCBpbnN0YW5jZW9mIEVkaXRvckdyb3VwVmlldyAmJiBncm91cC5pbmRleCAhPT0gMCkge1xuXHRcdFx0XHRcdGdyb3VwID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ3JvdXBzW2dyb3VwLmluZGV4IC0gMV07XG5cdFx0XHRcdFx0dGFyZ2V0RWRpdG9ySW5kZXggPSBncm91cC5jb3VudDtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgTGlzdFZpZXdUYXJnZXRTZWN0b3IuQk9UVE9NOlxuXHRcdFx0Y2FzZSBMaXN0Vmlld1RhcmdldFNlY3Rvci5DRU5URVJfQk9UVE9NOlxuXHRcdFx0XHRpZiAodGFyZ2V0RWxlbWVudCBpbnN0YW5jZW9mIE9wZW5FZGl0b3IpIHtcblx0XHRcdFx0XHR0YXJnZXRFZGl0b3JJbmRleCsrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmIChkYXRhIGluc3RhbmNlb2YgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEpIHtcblx0XHRcdGZvciAoY29uc3Qgb2Ugb2YgZGF0YS5lbGVtZW50cykge1xuXHRcdFx0XHRjb25zdCBzb3VyY2VFZGl0b3JJbmRleCA9IG9lLmdyb3VwLmdldEluZGV4T2ZFZGl0b3Iob2UuZWRpdG9yKTtcblx0XHRcdFx0aWYgKG9lLmdyb3VwID09PSBncm91cCAmJiBzb3VyY2VFZGl0b3JJbmRleCA8IHRhcmdldEVkaXRvckluZGV4KSB7XG5cdFx0XHRcdFx0dGFyZ2V0RWRpdG9ySW5kZXgtLTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvZS5ncm91cC5tb3ZlRWRpdG9yKG9lLmVkaXRvciwgZ3JvdXAsIHsgaW5kZXg6IHRhcmdldEVkaXRvckluZGV4LCBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0pO1xuXHRcdFx0XHR0YXJnZXRFZGl0b3JJbmRleCsrO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZhdGVHcm91cChncm91cCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZHJvcEhhbmRsZXIuaGFuZGxlRHJvcChvcmlnaW5hbEV2ZW50LCBtYWluV2luZG93LCAoKSA9PiBncm91cCwgKCkgPT4gZ3JvdXAuZm9jdXMoKSwgeyBpbmRleDogdGFyZ2V0RWRpdG9ySW5kZXggfSk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxufVxuXG5jbGFzcyBPcGVuRWRpdG9yc0FjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPE9wZW5FZGl0b3IgfCBJRWRpdG9yR3JvdXA+IHtcblxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdvcGVuRWRpdG9ycycsIFwiT3BlbiBFZGl0b3JzXCIpO1xuXHR9XG5cblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IE9wZW5FZGl0b3IgfCBJRWRpdG9yR3JvdXApOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE9wZW5FZGl0b3IpIHtcblx0XHRcdHJldHVybiBgJHtlbGVtZW50LmVkaXRvci5nZXROYW1lKCl9LCAke2VsZW1lbnQuZWRpdG9yLmdldERlc2NyaXB0aW9uKCl9YDtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWxlbWVudC5hcmlhTGFiZWw7XG5cdH1cbn1cblxuY29uc3QgdG9nZ2xlRWRpdG9yR3JvdXBMYXlvdXRJZCA9ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUVkaXRvckdyb3VwTGF5b3V0JztcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlRWRpdG9yR3JvdXBMYXlvdXQnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2ZsaXBMYXlvdXQnLCBcIlRvZ2dsZSBWZXJ0aWNhbC9Ib3Jpem9udGFsIEVkaXRvciBMYXlvdXRcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuRGlnaXQwLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5EaWdpdDAgfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRpY29uOiBDb2RpY29uLmVkaXRvckxheW91dCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBPcGVuRWRpdG9yc1ZpZXcuSUQpLCBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHQpLFxuXHRcdFx0XHRvcmRlcjogMTBcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Y29uc3QgbmV3T3JpZW50YXRpb24gPSAoZWRpdG9yR3JvdXBTZXJ2aWNlLm9yaWVudGF0aW9uID09PSBHcm91cE9yaWVudGF0aW9uLlZFUlRJQ0FMKSA/IEdyb3VwT3JpZW50YXRpb24uSE9SSVpPTlRBTCA6IEdyb3VwT3JpZW50YXRpb24uVkVSVElDQUw7XG5cdFx0ZWRpdG9yR3JvdXBTZXJ2aWNlLnNldEdyb3VwT3JpZW50YXRpb24obmV3T3JpZW50YXRpb24pO1xuXHRcdGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cC5mb2N1cygpO1xuXHR9XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSwge1xuXHRncm91cDogJzVfZmxpcCcsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogdG9nZ2xlRWRpdG9yR3JvdXBMYXlvdXRJZCxcblx0XHR0aXRsZToge1xuXHRcdFx0Li4ubmxzLmxvY2FsaXplMignbWlUb2dnbGVFZGl0b3JMYXlvdXRXaXRob3V0TW5lbW9uaWMnLCBcIkZsaXAgTGF5b3V0XCIpLFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlUb2dnbGVFZGl0b3JMYXlvdXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiRmxpcCAmJkxheW91dFwiKVxuXHRcdH1cblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLnNhdmVBbGwnLFxuXHRcdFx0dGl0bGU6IFNBVkVfQUxMX0xBQkVMLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRpY29uOiBDb2RpY29uLnNhdmVBbGwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBPcGVuRWRpdG9yc1ZpZXcuSUQpLFxuXHRcdFx0XHRvcmRlcjogMjBcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoU0FWRV9BTExfQ09NTUFORF9JRCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdvcGVuRWRpdG9ycy5jbG9zZUFsbCcsXG5cdFx0XHR0aXRsZTogQ2xvc2VBbGxFZGl0b3JzQWN0aW9uLkxBQkVMLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jbG9zZUFsbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9wZW5FZGl0b3JzVmlldy5JRCksXG5cdFx0XHRcdG9yZGVyOiAzMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNsb3NlQWxsID0gbmV3IENsb3NlQWxsRWRpdG9yc0FjdGlvbigpO1xuXHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGNsb3NlQWxsLnJ1bihhY2Nlc3NvcikpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnb3BlbkVkaXRvcnMubmV3VW50aXRsZWRGaWxlJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCduZXdVbnRpdGxlZEZpbGUnLCBcIk5ldyBVbnRpdGxlZCBUZXh0IEZpbGVcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRpY29uOiBDb2RpY29uLm5ld0ZpbGUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBPcGVuRWRpdG9yc1ZpZXcuSUQpLFxuXHRcdFx0XHRvcmRlcjogNVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChORVdfVU5USVRMRURfRklMRV9DT01NQU5EX0lEKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyx3QkFBd0I7QUFDakMsU0FBa0Isb0JBQXlGO0FBQzNHLFlBQVksU0FBUztBQUNyQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLHNCQUFvQyxhQUFhLHdCQUF3QjtBQUNsRixTQUFTLDZCQUF3RDtBQUNqRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFdBQVcsd0JBQXdCLGtCQUFxQyxzQkFBc0Isb0JBQW9CLHlCQUF5QjtBQUVwSixTQUFTLHNCQUFzQix3QkFBd0I7QUFDdkQsU0FBUywyQkFBMkIsd0JBQTZDLGtCQUFrQjtBQUNuRyxTQUFTLHVCQUF1QixtQkFBbUIseUJBQXlCO0FBQzVFLFNBQVMsb0JBQW9CLHNCQUFzQjtBQUNuRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGVBQWUsaUJBQWlCLGlCQUFpQixzQkFBc0I7QUFDaEYsU0FBUyxxQkFBcUI7QUFDOUIsU0FBOEcsNEJBQTRCLDhCQUE4QjtBQUN4SyxTQUFTLHNCQUFzQztBQUMvQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQTRCLGVBQWU7QUFDcEQsU0FBUyxRQUFRLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUMvRCxTQUFTLCtCQUErQix5QkFBeUIsa0NBQWtDLGdCQUFnQixxQkFBcUIsOEJBQThCLGdEQUFnRDtBQUN0TixTQUFTLG9CQUFvQixtQ0FBbUM7QUFDaEUsU0FBUyxtQkFBbUIsd0JBQXdCO0FBQ3BELFNBQVMsc0JBQXNCLDJCQUEyQjtBQUMxRCxTQUFTLGdCQUFnQjtBQUV6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U0FBUyxFQUFFLEtBQUssd0JBQXdCLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLGVBQWU7QUFBQSxJQUNqSDtBQUFBLEVBQ0Q7QUFBQSxFQUNBLE9BQU87QUFDUixDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBQ3JDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPO0FBQUEsTUFDUCxJQUFJO0FBQUEsTUFDSixNQUFNLFFBQVE7QUFBQSxNQUNkLE1BQU07QUFBQSxRQUNMLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLE9BQU8sUUFBUSxnQkFBZ0IsRUFBRTtBQUFBLFFBQ3RELE9BQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTJDO0FBQ3BELFVBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBQ25ELFVBQU0sZUFBZSxlQUFlLG1CQUFtQjtBQUFBLEVBQ3hEO0FBQ0QsQ0FBQztBQUVELGdCQUFnQixjQUFjLFFBQVE7QUFBQSxFQUNyQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxzQkFBc0I7QUFBQSxNQUM3QixJQUFJO0FBQUEsTUFDSixNQUFNLFFBQVE7QUFBQSxNQUNkLE1BQU07QUFBQSxRQUNMLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLE9BQU8sUUFBUSxnQkFBZ0IsRUFBRTtBQUFBLFFBQ3RELE9BQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTJDO0FBQ3BELFVBQU0sdUJBQXVCLFNBQVMsSUFBSSxxQkFBcUI7QUFFL0QsVUFBTSxXQUFXLElBQUksc0JBQXNCO0FBQzNDLFVBQU0scUJBQXFCLGVBQWUsQ0FBQUMsY0FBWSxTQUFTLElBQUlBLFNBQVEsQ0FBQztBQUFBLEVBQzdFO0FBQ0QsQ0FBQztBQUVELGdCQUFnQixjQUFjLFFBQVE7QUFBQSxFQUNyQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUsbUJBQW1CLHdCQUF3QjtBQUFBLE1BQ2hFLElBQUk7QUFBQSxNQUNKLE1BQU0sUUFBUTtBQUFBLE1BQ2QsTUFBTTtBQUFBLFFBQ0wsSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxNQUFNLGVBQWUsT0FBTyxRQUFRLGdCQUFnQixFQUFFO0FBQUEsUUFDdEQsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBMkM7QUFDcEQsVUFBTSxpQkFBaUIsU0FBUyxJQUFJLGVBQWU7QUFDbkQsVUFBTSxlQUFlLGVBQWUsNEJBQTRCO0FBQUEsRUFDakU7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJlIiwgImFjY2Vzc29yIl0KfQo=
