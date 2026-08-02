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
import "./media/editorgroupview.css";
import { EditorGroupModel, isGroupEditorCloseEvent, isGroupEditorOpenEvent, isSerializedEditorGroupModel } from "../../../common/editor/editorGroupModel.js";
import { CloseDirection, SaveReason, EditorsOrder, EditorResourceAccessor, EditorInputCapabilities, DEFAULT_EDITOR_ASSOCIATION, SideBySideEditor, EditorCloseContext, GroupModelChangeKind, TEXT_DIFF_EDITOR_ID } from "../../../common/editor.js";
import { ActiveEditorGroupLockedContext, ActiveEditorDirtyContext, EditorGroupEditorsCountContext, ActiveEditorStickyContext, ActiveEditorPinnedContext, ActiveEditorLastInGroupContext, ActiveEditorFirstInGroupContext, ResourceContextKey, applyAvailableEditorIds, ActiveEditorAvailableEditorIdsContext, ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext, TextCompareEditorVisibleContext, TextCompareEditorActiveContext, ActiveEditorContext, ActiveEditorReadonlyContext, ActiveEditorCanRevertContext, ActiveEditorCanToggleReadonlyContext, ActiveCompareEditorCanSwapContext, MultipleEditorsSelectedInGroupContext, TwoEditorsSelectedInGroupContext, SelectedEditorsInGroupFileOrUntitledResourceContextKey } from "../../../common/contextkeys.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { Emitter, Relay } from "../../../../base/common/event.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Dimension, trackFocus, addDisposableListener, EventType, EventHelper, findParentWithClass, isAncestor, isMouseEvent, isActiveElement, getWindow, getActiveElement, $, append } from "../../../../base/browser/dom.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ProgressBar } from "../../../../base/browser/ui/progressbar/progressbar.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { editorBackground, contrastBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { EDITOR_GROUP_HEADER_TABS_BACKGROUND, EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND, EDITOR_GROUP_EMPTY_BACKGROUND, EDITOR_GROUP_HEADER_BORDER } from "../../../common/theme.js";
import { GroupsOrder } from "../../../services/editor/common/editorGroupsService.js";
import { EditorPanes } from "./editorPanes.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { EditorProgressIndicator } from "../../../services/progress/browser/progressIndicator.js";
import { localize } from "../../../../nls.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { DeferredPromise, Promises, RunOnceWorker } from "../../../../base/common/async.js";
import { EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { fillActiveEditorViewState } from "./editor.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { Separator, SubmenuAction } from "../../../../base/common/actions.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { getActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { createEditorTypeActions, getAvailableEditorTypes } from "./editorTypePicker.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { hash } from "../../../../base/common/hash.js";
import { getMimeTypes } from "../../../../editor/common/services/languagesAssociations.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { Schemas } from "../../../../base/common/network.js";
import { EditorActivation } from "../../../../platform/editor/common/editor.js";
import { IFileDialogService, ConfirmResult, IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFilesConfigurationService, AutoSaveMode } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { URI } from "../../../../base/common/uri.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { isLinux, isMacintosh, isNative, isWindows } from "../../../../base/common/platform.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { TelemetryTrustedValue } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { defaultProgressBarStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { EditorGroupWatermark } from "./editorGroupWatermark.js";
import { EditorTitleControl } from "./editorTitleControl.js";
import { EditorPane } from "./editorPane.js";
import { IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { DiffEditorInput } from "../../../common/editor/diffEditorInput.js";
import { FileSystemProviderCapabilities, IFileService } from "../../../../platform/files/common/files.js";
let EditorGroupView = class extends Themable {
  constructor(from, editorPartsView, groupsView, groupsLabel, _index, options, instantiationService, contextKeyService, themeService, telemetryService, keybindingService, menuService, contextMenuService, fileDialogService, editorService, filesConfigurationService, uriIdentityService, logService, editorResolverService, hostService, dialogService, fileService, commandService) {
    super(themeService);
    this.editorPartsView = editorPartsView;
    this.groupsView = groupsView;
    this.groupsLabel = groupsLabel;
    this._index = _index;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.telemetryService = telemetryService;
    this.keybindingService = keybindingService;
    this.menuService = menuService;
    this.contextMenuService = contextMenuService;
    this.fileDialogService = fileDialogService;
    this.editorService = editorService;
    this.filesConfigurationService = filesConfigurationService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this.editorResolverService = editorResolverService;
    this.hostService = hostService;
    this.dialogService = dialogService;
    this.fileService = fileService;
    this.commandService = commandService;
    //#region events
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._onDidModelChange = this._register(new Emitter());
    this.onDidModelChange = this._onDidModelChange.event;
    this._onDidActiveEditorChange = this._register(new Emitter());
    this.onDidActiveEditorChange = this._onDidActiveEditorChange.event;
    this._onDidOpenEditorFail = this._register(new Emitter());
    this.onDidOpenEditorFail = this._onDidOpenEditorFail.event;
    this._onWillCloseEditor = this._register(new Emitter());
    this.onWillCloseEditor = this._onWillCloseEditor.event;
    this._onDidCloseEditor = this._register(new Emitter());
    this.onDidCloseEditor = this._onDidCloseEditor.event;
    this._onWillMoveEditor = this._register(new Emitter());
    this.onWillMoveEditor = this._onWillMoveEditor.event;
    this._onWillOpenEditor = this._register(new Emitter());
    this.onWillOpenEditor = this._onWillOpenEditor.event;
    /**
     * Optional inset (in px) reserved on the right of the editor pane while the
     * title control keeps the full group width. Used by the Agents window to dock
     * the detail panel beside the editor content under one full-width tab bar.
     * `0` (default) is a no-op for all other layouts.
     */
    this._contentRightInset = 0;
    /**
     * Height (in px) of the optional {@link headerContainer} rendered as a flow
     * row between the tab bar and the editor pane. Used by the Agents window to
     * host a full-width header below the tabs. `0` (default) hides the header.
     */
    this._headerHeight = 0;
    /** Renders and auto-sizes the optional header content (see {@link setHeaderContent}). */
    this._headerContent = this._register(new MutableDisposable());
    this._onDidChangeHeaderHeight = this._register(new Emitter());
    this.onDidChangeHeaderHeight = this._onDidChangeHeaderHeight.event;
    /** The active editor's declared header toolbars (see {@link IEditorPane.getHeaderActions}). */
    this._editorHeaderContent = this._register(new MutableDisposable());
    this.disposedEditorsWorker = this._register(new RunOnceWorker((editors) => this.handleDisposedEditors(editors), 0));
    this.mapEditorToPendingConfirmation = /* @__PURE__ */ new Map();
    this.containerToolBarMenuDisposable = this._register(new MutableDisposable());
    this.whenRestoredPromise = new DeferredPromise();
    this.whenRestored = this.whenRestoredPromise.p;
    this._disposed = false;
    //#endregion
    //#region ISerializableView
    this.element = $("div");
    this._onDidChange = this._register(new Relay());
    this.onDidChange = this._onDidChange.event;
    this._menuIds = options?.menuIds;
    if (from instanceof EditorGroupView) {
      this.model = this._register(from.model.clone());
    } else if (isSerializedEditorGroupModel(from)) {
      this.model = this._register(instantiationService.createInstance(EditorGroupModel, from));
    } else {
      this.model = this._register(instantiationService.createInstance(EditorGroupModel, void 0));
    }
    {
      this.scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.element));
      this.element.classList.add(...coalesce(["editor-group-container", this.model.isLocked ? "locked" : void 0]));
      this.registerContainerListeners();
      this.createContainerToolbar();
      this.createContainerContextMenu();
      this._register(this.instantiationService.createInstance(EditorGroupWatermark, this.element));
      this.progressBar = this._register(new ProgressBar(this.element, defaultProgressBarStyles));
      this.progressBar.hide();
      this.scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
        [IContextKeyService, this.scopedContextKeyService],
        [IEditorProgressService, this._register(new EditorProgressIndicator(this.progressBar, this))]
      )));
      this.resourceContext = this._register(this.scopedInstantiationService.createInstance(ResourceContextKey));
      this.handleGroupContextKeys();
      this.titleContainer = $(".title");
      this.element.appendChild(this.titleContainer);
      this.titleControl = this._register(this.scopedInstantiationService.createInstance(EditorTitleControl, this.titleContainer, this.editorPartsView, this.groupsView, this, this.model, this._menuIds));
      this.headerContainer = $(".editor-group-header");
      this.headerContainer.style.height = "0px";
      this.element.appendChild(this.headerContainer);
      this.editorContainer = $(".editor-container");
      this.element.appendChild(this.editorContainer);
      this.editorPane = this._register(this.scopedInstantiationService.createInstance(EditorPanes, this.element, this.editorContainer, this));
      this._onDidChange.input = this.editorPane.onDidChangeSizeConstraints;
      this.doTrackFocus();
      this._register(this.onDidActiveEditorChange(() => this._renderEditorHeader()));
      this.updateTitleContainer();
      this.updateContainer();
      this.updateStyles();
    }
    const restoreEditorsPromise = this.restoreEditors(from, options) ?? Promise.resolve();
    restoreEditorsPromise.finally(() => {
      this.whenRestoredPromise.complete();
    });
    this.registerListeners();
  }
  //#region factory
  static createNew(editorPartsView, groupsView, groupsLabel, groupIndex, instantiationService, options) {
    return instantiationService.createInstance(EditorGroupView, null, editorPartsView, groupsView, groupsLabel, groupIndex, options);
  }
  static createFromSerialized(serialized, editorPartsView, groupsView, groupsLabel, groupIndex, instantiationService, options) {
    return instantiationService.createInstance(EditorGroupView, serialized, editorPartsView, groupsView, groupsLabel, groupIndex, options);
  }
  static createCopy(copyFrom, editorPartsView, groupsView, groupsLabel, groupIndex, instantiationService, options) {
    return instantiationService.createInstance(EditorGroupView, copyFrom, editorPartsView, groupsView, groupsLabel, groupIndex, options);
  }
  handleGroupContextKeys() {
    const groupActiveEditorDirtyContext = this.editorPartsView.bind(ActiveEditorDirtyContext, this);
    const groupActiveEditorPinnedContext = this.editorPartsView.bind(ActiveEditorPinnedContext, this);
    const groupActiveEditorFirstContext = this.editorPartsView.bind(ActiveEditorFirstInGroupContext, this);
    const groupActiveEditorLastContext = this.editorPartsView.bind(ActiveEditorLastInGroupContext, this);
    const groupActiveEditorStickyContext = this.editorPartsView.bind(ActiveEditorStickyContext, this);
    const groupEditorsCountContext = this.editorPartsView.bind(EditorGroupEditorsCountContext, this);
    const groupLockedContext = this.editorPartsView.bind(ActiveEditorGroupLockedContext, this);
    const multipleEditorsSelectedContext = MultipleEditorsSelectedInGroupContext.bindTo(this.scopedContextKeyService);
    const twoEditorsSelectedContext = TwoEditorsSelectedInGroupContext.bindTo(this.scopedContextKeyService);
    const selectedEditorsHaveFileOrUntitledResourceContext = SelectedEditorsInGroupFileOrUntitledResourceContextKey.bindTo(this.scopedContextKeyService);
    const groupActiveEditorContext = this.editorPartsView.bind(ActiveEditorContext, this);
    const groupActiveEditorIsReadonly = this.editorPartsView.bind(ActiveEditorReadonlyContext, this);
    const groupActiveEditorCanRevert = this.editorPartsView.bind(ActiveEditorCanRevertContext, this);
    const groupActiveEditorCanToggleReadonly = this.editorPartsView.bind(ActiveEditorCanToggleReadonlyContext, this);
    const groupActiveCompareEditorCanSwap = this.editorPartsView.bind(ActiveCompareEditorCanSwapContext, this);
    const groupTextCompareEditorVisibleContext = this.editorPartsView.bind(TextCompareEditorVisibleContext, this);
    const groupTextCompareEditorActiveContext = this.editorPartsView.bind(TextCompareEditorActiveContext, this);
    const groupActiveEditorAvailableEditorIds = this.editorPartsView.bind(ActiveEditorAvailableEditorIdsContext, this);
    const groupActiveEditorCanSplitInGroupContext = this.editorPartsView.bind(ActiveEditorCanSplitInGroupContext, this);
    const groupActiveEditorIsSideBySideEditorContext = this.editorPartsView.bind(SideBySideEditorActiveContext, this);
    const activeEditorListener = this._register(new MutableDisposable());
    const observeActiveEditor = () => {
      activeEditorListener.clear();
      this.scopedContextKeyService.bufferChangeEvents(() => {
        const activeEditor = this.activeEditor;
        const activeEditorPane = this.activeEditorPane;
        this.resourceContext.set(EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY }));
        applyAvailableEditorIds(groupActiveEditorAvailableEditorIds, activeEditor, this.editorResolverService);
        if (activeEditor) {
          groupActiveEditorCanSplitInGroupContext.set(activeEditor.hasCapability(EditorInputCapabilities.CanSplitInGroup));
          groupActiveEditorIsSideBySideEditorContext.set(activeEditor.typeId === SideBySideEditorInput.ID);
          groupActiveEditorDirtyContext.set(activeEditor.isDirty() && !activeEditor.isSaving());
          activeEditorListener.value = activeEditor.onDidChangeDirty(() => {
            groupActiveEditorDirtyContext.set(activeEditor.isDirty() && !activeEditor.isSaving());
          });
        } else {
          groupActiveEditorCanSplitInGroupContext.set(false);
          groupActiveEditorIsSideBySideEditorContext.set(false);
          groupActiveEditorDirtyContext.set(false);
        }
        if (activeEditorPane) {
          groupActiveEditorContext.set(activeEditorPane.getId());
          groupActiveEditorCanRevert.set(!activeEditorPane.input.hasCapability(EditorInputCapabilities.Untitled));
          groupActiveEditorIsReadonly.set(!!activeEditorPane.input.isReadonly());
          const primaryEditorResource = EditorResourceAccessor.getOriginalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.PRIMARY });
          const secondaryEditorResource = EditorResourceAccessor.getOriginalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.SECONDARY });
          groupActiveCompareEditorCanSwap.set(activeEditorPane.input instanceof DiffEditorInput && !activeEditorPane.input.original.isReadonly() && !!primaryEditorResource && (this.fileService.hasProvider(primaryEditorResource) || primaryEditorResource.scheme === Schemas.untitled) && !!secondaryEditorResource && (this.fileService.hasProvider(secondaryEditorResource) || secondaryEditorResource.scheme === Schemas.untitled));
          groupActiveEditorCanToggleReadonly.set(!!primaryEditorResource && this.fileService.hasProvider(primaryEditorResource) && !this.fileService.hasCapability(primaryEditorResource, FileSystemProviderCapabilities.Readonly));
          const activePaneDiffEditor = activeEditorPane?.getId() === TEXT_DIFF_EDITOR_ID;
          groupTextCompareEditorActiveContext.set(activePaneDiffEditor);
          groupTextCompareEditorVisibleContext.set(activePaneDiffEditor);
        } else {
          groupActiveEditorContext.reset();
          groupActiveEditorCanRevert.reset();
          groupActiveEditorIsReadonly.reset();
          groupActiveCompareEditorCanSwap.reset();
          groupActiveEditorCanToggleReadonly.reset();
        }
      });
    };
    const updateGroupContextKeys = (e) => {
      switch (e.kind) {
        case GroupModelChangeKind.GROUP_LOCKED:
          groupLockedContext.set(this.isLocked);
          break;
        case GroupModelChangeKind.EDITOR_ACTIVE:
          groupActiveEditorFirstContext.set(this.model.isFirst(this.model.activeEditor));
          groupActiveEditorLastContext.set(this.model.isLast(this.model.activeEditor));
          groupActiveEditorPinnedContext.set(this.model.activeEditor ? this.model.isPinned(this.model.activeEditor) : false);
          groupActiveEditorStickyContext.set(this.model.activeEditor ? this.model.isSticky(this.model.activeEditor) : false);
          break;
        case GroupModelChangeKind.EDITOR_CLOSE:
          groupActiveEditorPinnedContext.set(this.model.activeEditor ? this.model.isPinned(this.model.activeEditor) : false);
          groupActiveEditorStickyContext.set(this.model.activeEditor ? this.model.isSticky(this.model.activeEditor) : false);
          break;
        case GroupModelChangeKind.EDITOR_OPEN:
        case GroupModelChangeKind.EDITOR_MOVE:
          groupActiveEditorFirstContext.set(this.model.isFirst(this.model.activeEditor));
          groupActiveEditorLastContext.set(this.model.isLast(this.model.activeEditor));
          break;
        case GroupModelChangeKind.EDITOR_PIN:
          if (e.editor && e.editor === this.model.activeEditor) {
            groupActiveEditorPinnedContext.set(this.model.isPinned(this.model.activeEditor));
          }
          break;
        case GroupModelChangeKind.EDITOR_STICKY:
          if (e.editor && e.editor === this.model.activeEditor) {
            groupActiveEditorStickyContext.set(this.model.isSticky(this.model.activeEditor));
          }
          break;
        case GroupModelChangeKind.EDITORS_SELECTION:
          multipleEditorsSelectedContext.set(this.model.selectedEditors.length > 1);
          twoEditorsSelectedContext.set(this.model.selectedEditors.length === 2);
          selectedEditorsHaveFileOrUntitledResourceContext.set(this.model.selectedEditors.every((e2) => e2.resource && (this.fileService.hasProvider(e2.resource) || e2.resource.scheme === Schemas.untitled)));
          break;
      }
      groupEditorsCountContext.set(this.count);
    };
    this._register(this.onDidModelChange((e) => updateGroupContextKeys(e)));
    this._register(this.onDidActiveEditorChange(() => observeActiveEditor()));
    observeActiveEditor();
    updateGroupContextKeys({ kind: GroupModelChangeKind.EDITOR_ACTIVE });
    updateGroupContextKeys({ kind: GroupModelChangeKind.GROUP_LOCKED });
  }
  registerContainerListeners() {
    this._register(addDisposableListener(this.element, EventType.DBLCLICK, (e) => {
      if (this.isEmpty) {
        EventHelper.stop(e);
        this.editorService.openEditor({
          resource: void 0,
          options: {
            pinned: true,
            override: DEFAULT_EDITOR_ASSOCIATION.id
          }
        }, this.id);
      }
    }));
    this._register(addDisposableListener(this.element, EventType.AUXCLICK, (e) => {
      if (this.isEmpty && e.button === 1) {
        EventHelper.stop(e, true);
        this.groupsView.removeGroup(this);
      }
    }));
  }
  createContainerToolbar() {
    const toolbarContainer = $(".editor-group-container-toolbar");
    this.element.appendChild(toolbarContainer);
    const containerToolbar = this._register(new ActionBar(toolbarContainer, {
      ariaLabel: localize("ariaLabelGroupActions", "Empty editor group actions"),
      highlightToggledItems: true
    }));
    const containerToolbarMenu = this._register(this.menuService.createMenu(MenuId.EmptyEditorGroup, this.scopedContextKeyService));
    const updateContainerToolbar = () => {
      this.containerToolBarMenuDisposable.value = toDisposable(() => containerToolbar.clear());
      const actions = getActionBarActions(
        containerToolbarMenu.getActions({ arg: { groupId: this.id }, shouldForwardArgs: true }),
        "navigation"
      );
      for (const action of [...actions.primary, ...actions.secondary]) {
        const keybinding = this.keybindingService.lookupKeybinding(action.id);
        containerToolbar.push(action, { icon: true, label: false, keybinding: keybinding?.getLabel() });
      }
    };
    updateContainerToolbar();
    this._register(containerToolbarMenu.onDidChange(updateContainerToolbar));
  }
  createContainerContextMenu() {
    this._register(addDisposableListener(this.element, EventType.CONTEXT_MENU, (e) => this.onShowContainerContextMenu(e)));
    this._register(addDisposableListener(this.element, TouchEventType.Contextmenu, () => this.onShowContainerContextMenu()));
  }
  onShowContainerContextMenu(e) {
    if (!this.isEmpty) {
      return;
    }
    let anchor = this.element;
    if (e) {
      anchor = new StandardMouseEvent(getWindow(this.element), e);
    }
    this.contextMenuService.showContextMenu({
      menuId: MenuId.EmptyEditorGroupContext,
      contextKeyService: this.contextKeyService,
      getAnchor: () => anchor,
      onHide: () => this.focus()
    });
  }
  doTrackFocus() {
    const containerFocusTracker = this._register(trackFocus(this.element));
    this._register(containerFocusTracker.onDidFocus(() => {
      if (this.isEmpty) {
        this._onDidFocus.fire();
      }
    }));
    const handleTitleClickOrTouch = (e) => {
      let target;
      if (isMouseEvent(e)) {
        if (e.button !== 0 || isMacintosh && e.ctrlKey) {
          return void 0;
        }
        target = e.target;
      } else {
        target = e.initialTarget;
      }
      if (findParentWithClass(target, "monaco-action-bar", this.titleContainer) || findParentWithClass(target, "monaco-breadcrumb-item", this.titleContainer)) {
        return;
      }
      setTimeout(() => {
        this.focus();
      });
    };
    this._register(addDisposableListener(this.titleContainer, EventType.MOUSE_DOWN, (e) => handleTitleClickOrTouch(e)));
    this._register(addDisposableListener(this.titleContainer, TouchEventType.Tap, (e) => handleTitleClickOrTouch(e)));
    this._register(this.editorPane.onDidFocus(() => {
      this._onDidFocus.fire();
    }));
  }
  updateContainer() {
    if (this.isEmpty) {
      this.element.classList.add("empty");
      this.element.tabIndex = 0;
      this.element.setAttribute("aria-label", localize("emptyEditorGroup", "{0} (empty)", this.ariaLabel));
    } else {
      this.element.classList.remove("empty");
      this.element.removeAttribute("tabIndex");
      this.element.removeAttribute("aria-label");
    }
    this.updateStyles();
  }
  updateTitleContainer() {
    this.titleContainer.classList.toggle("tabs", this.groupsView.partOptions.showTabs === "multiple");
    this.titleContainer.classList.toggle("show-file-icons", this.groupsView.partOptions.showIcons);
  }
  restoreEditors(from, groupViewOptions) {
    if (this.count === 0) {
      return;
    }
    let options;
    if (from instanceof EditorGroupView) {
      options = fillActiveEditorViewState(from);
    } else {
      options = /* @__PURE__ */ Object.create(null);
    }
    const activeEditor = this.model.activeEditor;
    if (!activeEditor) {
      return;
    }
    options.pinned = this.model.isPinned(activeEditor);
    options.sticky = this.model.isSticky(activeEditor);
    options.preserveFocus = true;
    const internalOptions = {
      preserveWindowOrder: true,
      // handle window order after editor is restored
      skipTitleUpdate: true
      // update the title later for all editors at once
    };
    const activeElement = getActiveElement();
    const result = this.doShowEditor(activeEditor, {
      active: true,
      isNew: false
      /* restored */
    }, options, internalOptions).then(() => {
      if (this.groupsView.activeGroup === this && activeElement && isActiveElement(activeElement) && !groupViewOptions?.preserveFocus) {
        this.focus();
      }
    });
    this.titleControl.openEditors(this.editors);
    return result;
  }
  //#region event handling
  registerListeners() {
    this._register(this.model.onDidModelChange((e) => this.onDidGroupModelChange(e)));
    this._register(this.groupsView.onDidChangeEditorPartOptions((e) => this.onDidChangeEditorPartOptions(e)));
    this._register(this.groupsView.onDidVisibilityChange((e) => this.onDidVisibilityChange(e)));
    this._register(this.onDidFocus(() => this.onDidGainFocus()));
  }
  onDidGroupModelChange(e) {
    this._onDidModelChange.fire(e);
    switch (e.kind) {
      case GroupModelChangeKind.GROUP_LOCKED:
        this.element.classList.toggle("locked", this.isLocked);
        break;
      case GroupModelChangeKind.EDITORS_SELECTION:
        this.onDidChangeEditorSelection();
        break;
    }
    if (!e.editor) {
      return;
    }
    switch (e.kind) {
      case GroupModelChangeKind.EDITOR_OPEN:
        if (isGroupEditorOpenEvent(e)) {
          this.onDidOpenEditor(e.editor, e.editorIndex);
        }
        break;
      case GroupModelChangeKind.EDITOR_CLOSE:
        if (isGroupEditorCloseEvent(e)) {
          this.handleOnDidCloseEditor(e.editor, e.editorIndex, e.context, e.sticky);
        }
        break;
      case GroupModelChangeKind.EDITOR_WILL_DISPOSE:
        this.onWillDisposeEditor(e.editor);
        break;
      case GroupModelChangeKind.EDITOR_DIRTY:
        this.onDidChangeEditorDirty(e.editor);
        break;
      case GroupModelChangeKind.EDITOR_TRANSIENT:
        this.onDidChangeEditorTransient(e.editor);
        break;
      case GroupModelChangeKind.EDITOR_LABEL:
        this.onDidChangeEditorLabel(e.editor);
        break;
    }
  }
  onDidOpenEditor(editor, editorIndex) {
    this.telemetryService.publicLog("editorOpened", this.toEditorTelemetryDescriptor(editor));
    this.updateContainer();
  }
  handleOnDidCloseEditor(editor, editorIndex, context, sticky) {
    this._onWillCloseEditor.fire({ groupId: this.id, editor, context, index: editorIndex, sticky });
    const editorsToClose = [editor];
    if (editor instanceof SideBySideEditorInput) {
      editorsToClose.push(editor.primary, editor.secondary);
    }
    for (const editor2 of editorsToClose) {
      if (this.canDispose(editor2)) {
        editor2.dispose();
      }
    }
    this.updateContainer();
    this._onDidCloseEditor.fire({ groupId: this.id, editor, context, index: editorIndex, sticky });
  }
  canDispose(editor) {
    for (const groupView of this.editorPartsView.groups) {
      if (groupView instanceof EditorGroupView && groupView.model.contains(editor, {
        strictEquals: true,
        // only if this input is not shared across editor groups
        supportSideBySide: SideBySideEditor.ANY
        // include any side of an opened side by side editor
      })) {
        return false;
      }
    }
    return true;
  }
  toResourceTelemetryDescriptor(resource) {
    if (!resource) {
      return void 0;
    }
    const path = resource ? resource.scheme === Schemas.file ? resource.fsPath : resource.path : void 0;
    if (!path) {
      return void 0;
    }
    let resourceExt = extname(resource);
    const queryStringLocation = resourceExt.indexOf("?");
    resourceExt = queryStringLocation !== -1 ? resourceExt.substr(0, queryStringLocation) : resourceExt;
    return {
      mimeType: new TelemetryTrustedValue(getMimeTypes(resource).join(", ")),
      scheme: resource.scheme,
      ext: resourceExt,
      path: hash(path)
    };
  }
  toEditorTelemetryDescriptor(editor) {
    const descriptor = editor.getTelemetryDescriptor();
    const resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH });
    if (URI.isUri(resource)) {
      descriptor["resource"] = this.toResourceTelemetryDescriptor(resource);
      return descriptor;
    } else if (resource) {
      if (resource.primary) {
        descriptor["resource"] = this.toResourceTelemetryDescriptor(resource.primary);
      }
      if (resource.secondary) {
        descriptor["resourceSecondary"] = this.toResourceTelemetryDescriptor(resource.secondary);
      }
      return descriptor;
    }
    return descriptor;
  }
  onWillDisposeEditor(editor) {
    this.disposedEditorsWorker.work(editor);
  }
  handleDisposedEditors(disposedEditors) {
    let activeEditor;
    const inactiveEditors = [];
    for (const disposedEditor of disposedEditors) {
      const editorFindResult = this.model.findEditor(disposedEditor);
      if (!editorFindResult) {
        continue;
      }
      const editor = editorFindResult[0];
      if (!editor.isDisposed()) {
        continue;
      }
      if (this.model.isActive(editor)) {
        activeEditor = editor;
      } else {
        inactiveEditors.push(editor);
      }
    }
    for (const inactiveEditor of inactiveEditors) {
      this.doCloseEditor(inactiveEditor, true);
    }
    if (activeEditor) {
      this.doCloseEditor(activeEditor, true);
    }
  }
  onDidChangeEditorPartOptions(event) {
    this.updateTitleContainer();
    this.titleControl.updateOptions(event.oldPartOptions, event.newPartOptions);
    if (event.oldPartOptions.showTabs !== event.newPartOptions.showTabs || event.oldPartOptions.tabHeight !== event.newPartOptions.tabHeight || event.oldPartOptions.showTabs === "multiple" && event.oldPartOptions.pinnedTabsOnSeparateRow !== event.newPartOptions.pinnedTabsOnSeparateRow) {
      this.relayout();
      if (this.model.activeEditor) {
        this.titleControl.openEditors(this.model.getEditors(EditorsOrder.SEQUENTIAL));
      }
    }
    this.updateStyles();
    if (event.oldPartOptions.enablePreview && !event.newPartOptions.enablePreview) {
      if (this.model.previewEditor) {
        this.pinEditor(this.model.previewEditor);
      }
    }
  }
  onDidChangeEditorDirty(editor) {
    this.pinEditor(editor);
    this.titleControl.updateEditorDirty(editor);
  }
  onDidChangeEditorTransient(editor) {
    const transient = this.model.isTransient(editor);
    if (!transient && !this.groupsView.partOptions.enablePreview) {
      this.pinEditor(editor);
    }
  }
  onDidChangeEditorLabel(editor) {
    this.titleControl.updateEditorLabel(editor);
  }
  onDidChangeEditorSelection() {
    this.titleControl.updateEditorSelections();
  }
  onDidVisibilityChange(visible) {
    this.editorPane.setVisible(visible);
  }
  onDidGainFocus() {
    if (this.activeEditor) {
      this.model.setTransient(this.activeEditor, false);
    }
  }
  //#endregion
  //#region IEditorGroupView
  get index() {
    return this._index;
  }
  get label() {
    if (this.groupsLabel) {
      return localize("groupLabelLong", "{0}: Group {1}", this.groupsLabel, this._index + 1);
    }
    return localize("groupLabel", "Group {0}", this._index + 1);
  }
  get ariaLabel() {
    if (this.groupsLabel) {
      return localize("groupAriaLabelLong", "{0}: Editor Group {1}", this.groupsLabel, this._index + 1);
    }
    return localize("groupAriaLabel", "Editor Group {0}", this._index + 1);
  }
  get disposed() {
    return this._disposed;
  }
  get isEmpty() {
    return this.count === 0;
  }
  get titleHeight() {
    return this.titleControl.getHeight();
  }
  notifyIndexChanged(newIndex) {
    if (this._index !== newIndex) {
      this._index = newIndex;
      this.model.setIndex(newIndex);
    }
  }
  notifyLabelChanged(newLabel) {
    if (this.groupsLabel !== newLabel) {
      this.groupsLabel = newLabel;
      this.model.setLabel(newLabel);
    }
  }
  setActive(isActive) {
    this.active = isActive;
    if (!isActive && this.activeEditor && this.selectedEditors.length > 1) {
      this.setSelection(this.activeEditor, []);
    }
    this.element.classList.toggle("active", isActive);
    this.element.classList.toggle("inactive", !isActive);
    this.titleControl.setActive(isActive);
    this.updateStyles();
    this.model.setActive(
      void 0
      /* entire group got active */
    );
  }
  //#endregion
  //#region basics()
  get id() {
    return this.model.id;
  }
  get windowId() {
    return this.groupsView.windowId;
  }
  get editors() {
    return this.model.getEditors(EditorsOrder.SEQUENTIAL);
  }
  get count() {
    return this.model.count;
  }
  get stickyCount() {
    return this.model.stickyCount;
  }
  /** The container that bounds the editor pane, excluding any docked content inset. */
  get editorPaneContainer() {
    return this.editorContainer;
  }
  get activeEditorPane() {
    return this.editorPane ? this.editorPane.activeEditorPane ?? void 0 : void 0;
  }
  get activeEditor() {
    return this.model.activeEditor;
  }
  get selectedEditors() {
    return this.model.selectedEditors;
  }
  get previewEditor() {
    return this.model.previewEditor;
  }
  isPinned(editorOrIndex) {
    return this.model.isPinned(editorOrIndex);
  }
  isSticky(editorOrIndex) {
    return this.model.isSticky(editorOrIndex);
  }
  isSelected(editor) {
    return this.model.isSelected(editor);
  }
  isTransient(editorOrIndex) {
    return this.model.isTransient(editorOrIndex);
  }
  isActive(editor) {
    return this.model.isActive(editor);
  }
  async setSelection(activeSelectedEditor, inactiveSelectedEditors) {
    if (!this.isActive(activeSelectedEditor)) {
      await this.openEditor(activeSelectedEditor, { activation: EditorActivation.ACTIVATE }, { inactiveSelection: inactiveSelectedEditors });
    } else {
      this.model.setSelection(activeSelectedEditor, inactiveSelectedEditors);
    }
  }
  contains(candidate, options) {
    return this.model.contains(candidate, options);
  }
  getEditors(order, options) {
    return this.model.getEditors(order, options);
  }
  findEditors(resource, options) {
    const canonicalResource = this.uriIdentityService.asCanonicalUri(resource);
    return this.getEditors(options?.order ?? EditorsOrder.SEQUENTIAL).filter((editor) => {
      if (editor.resource && isEqual(editor.resource, canonicalResource)) {
        return true;
      }
      if (options?.supportSideBySide === SideBySideEditor.PRIMARY || options?.supportSideBySide === SideBySideEditor.ANY) {
        const primaryResource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
        if (primaryResource && isEqual(primaryResource, canonicalResource)) {
          return true;
        }
      }
      if (options?.supportSideBySide === SideBySideEditor.SECONDARY || options?.supportSideBySide === SideBySideEditor.ANY) {
        const secondaryResource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY });
        if (secondaryResource && isEqual(secondaryResource, canonicalResource)) {
          return true;
        }
      }
      return false;
    });
  }
  getEditorByIndex(index) {
    return this.model.getEditorByIndex(index);
  }
  getIndexOfEditor(editor) {
    return this.model.indexOf(editor);
  }
  isFirst(editor) {
    return this.model.isFirst(editor);
  }
  isLast(editor) {
    return this.model.isLast(editor);
  }
  focus() {
    if (this.activeEditorPane) {
      this.activeEditorPane.focus();
    } else {
      this.element.focus();
    }
    this._onDidFocus.fire();
  }
  pinEditor(candidate = this.activeEditor || void 0) {
    if (candidate && !this.model.isPinned(candidate)) {
      const editor = this.model.pin(candidate);
      if (editor) {
        this.titleControl.pinEditor(editor);
      }
    }
  }
  stickEditor(candidate = this.activeEditor || void 0) {
    this.doStickEditor(candidate, true);
  }
  unstickEditor(candidate = this.activeEditor || void 0) {
    this.doStickEditor(candidate, false);
  }
  doStickEditor(candidate, sticky) {
    if (candidate && this.model.isSticky(candidate) !== sticky) {
      const oldIndexOfEditor = this.getIndexOfEditor(candidate);
      const editor = sticky ? this.model.stick(candidate) : this.model.unstick(candidate);
      if (!editor) {
        return;
      }
      const newIndexOfEditor = this.getIndexOfEditor(editor);
      if (newIndexOfEditor !== oldIndexOfEditor) {
        this.titleControl.moveEditor(editor, oldIndexOfEditor, newIndexOfEditor, true);
      }
      if (sticky) {
        this.titleControl.stickEditor(editor);
      } else {
        this.titleControl.unstickEditor(editor);
      }
    }
  }
  //#endregion
  //#region openEditor()
  async openEditor(editor, options, internalOptions) {
    return this.doOpenEditor(editor, options, {
      // Appply given internal open options
      ...internalOptions,
      // Allow to match on a side-by-side editor when same
      // editor is opened on both sides. In that case we
      // do not want to open a new editor but reuse that one.
      supportSideBySide: SideBySideEditor.BOTH
    });
  }
  async doOpenEditor(editor, options, internalOptions) {
    if (!editor || editor.isDisposed()) {
      return;
    }
    this._onWillOpenEditor.fire({ editor, groupId: this.id });
    const pinned = options?.sticky || !this.groupsView.partOptions.enablePreview && !options?.transient || editor.isDirty() || (options?.pinned ?? typeof options?.index === "number") || typeof options?.index === "number" && this.model.isSticky(options.index) || editor.hasCapability(EditorInputCapabilities.Scratchpad);
    const openEditorOptions = {
      index: options ? options.index : void 0,
      pinned,
      sticky: options?.sticky || typeof options?.index === "number" && this.model.isSticky(options.index),
      transient: !!options?.transient,
      inactiveSelection: internalOptions?.inactiveSelection,
      active: this.count === 0 || !options?.inactive,
      supportSideBySide: internalOptions?.supportSideBySide
    };
    if (!openEditorOptions.active && !openEditorOptions.pinned && this.model.activeEditor && !this.model.isPinned(this.model.activeEditor)) {
      openEditorOptions.active = true;
    }
    let activateGroup = false;
    let restoreGroup = false;
    if (options?.activation === EditorActivation.ACTIVATE) {
      activateGroup = true;
    } else if (options?.activation === EditorActivation.RESTORE) {
      restoreGroup = true;
    } else if (options?.activation === EditorActivation.PRESERVE) {
      activateGroup = false;
      restoreGroup = false;
    } else if (openEditorOptions.active) {
      activateGroup = !options?.preserveFocus;
      restoreGroup = !activateGroup;
    }
    if (typeof openEditorOptions.index === "number") {
      const indexOfEditor = this.model.indexOf(editor);
      if (indexOfEditor !== -1 && indexOfEditor !== openEditorOptions.index) {
        this.doMoveEditorInsideGroup(editor, openEditorOptions);
      }
    }
    const { editor: openedEditor, isNew } = this.model.openEditor(editor, openEditorOptions);
    if (isNew && // only if this editor was new for the group
    this.count === 1 && // only when this editor was the first editor in the group
    this.editorPartsView.groups.length > 1) {
      if (openedEditor.editorId && this.groupsView.partOptions.autoLockGroups?.has(openedEditor.editorId)) {
        this.lock(true);
      }
    }
    const showEditorResult = this.doShowEditor(openedEditor, { active: !!openEditorOptions.active, isNew }, options, internalOptions);
    if (activateGroup) {
      this.groupsView.activateGroup(this);
    } else if (restoreGroup) {
      this.groupsView.restoreGroup(this);
    }
    return showEditorResult;
  }
  doShowEditor(editor, context, options, internalOptions) {
    let openEditorPromise;
    if (context.active) {
      openEditorPromise = (async () => {
        const { pane, changed, cancelled, error } = await this.editorPane.openEditor(editor, options, internalOptions, { newInGroup: context.isNew });
        if (cancelled) {
          return void 0;
        }
        if (changed) {
          this._onDidActiveEditorChange.fire({ editor, isExplicit: options?.isExplicit });
        }
        if (error) {
          this._onDidOpenEditorFail.fire(editor);
        }
        if (!pane && this.activeEditor === editor) {
          this.doCloseEditor(editor, options?.preserveFocus, { fromError: true });
        }
        return pane;
      })();
    } else {
      openEditorPromise = Promise.resolve(void 0);
    }
    if (!internalOptions?.skipTitleUpdate) {
      this.titleControl.openEditor(editor, internalOptions);
    }
    return openEditorPromise;
  }
  //#endregion
  //#region openEditors()
  async openEditors(editors) {
    const editorsToOpen = coalesce(editors).filter(({ editor }) => !editor.isDisposed());
    const firstEditor = editorsToOpen.at(0);
    if (!firstEditor) {
      return;
    }
    const openEditorsOptions = {
      // Allow to match on a side-by-side editor when same
      // editor is opened on both sides. In that case we
      // do not want to open a new editor but reuse that one.
      supportSideBySide: SideBySideEditor.BOTH
    };
    await this.doOpenEditor(firstEditor.editor, firstEditor.options, openEditorsOptions);
    const inactiveEditors = editorsToOpen.slice(1);
    const startingIndex = this.getIndexOfEditor(firstEditor.editor) + 1;
    await Promises.settled(inactiveEditors.map(({ editor, options }, index) => {
      return this.doOpenEditor(editor, {
        ...options,
        inactive: true,
        pinned: true,
        index: startingIndex + index
      }, {
        ...openEditorsOptions,
        // optimization: update the title control later
        // https://github.com/microsoft/vscode/issues/130634
        skipTitleUpdate: true
      });
    }));
    this.titleControl.openEditors(inactiveEditors.map(({ editor }) => editor));
    return this.editorPane.activeEditorPane ?? void 0;
  }
  //#endregion
  //#region moveEditor()
  moveEditors(editors, target) {
    const internalOptions = {
      skipTitleUpdate: this !== target
    };
    let moveFailed = false;
    const movedEditors = /* @__PURE__ */ new Set();
    for (const { editor, options } of editors) {
      if (this.moveEditor(editor, target, options, internalOptions)) {
        movedEditors.add(editor);
      } else {
        moveFailed = true;
      }
    }
    if (internalOptions.skipTitleUpdate) {
      target.titleControl.openEditors(Array.from(movedEditors));
      this.titleControl.closeEditors(Array.from(movedEditors));
    }
    return !moveFailed;
  }
  moveEditor(editor, target, options, internalOptions) {
    if (this === target) {
      this.doMoveEditorInsideGroup(editor, options);
      return true;
    } else {
      return this.doMoveOrCopyEditorAcrossGroups(editor, target, options, { ...internalOptions, keepCopy: false });
    }
  }
  doMoveEditorInsideGroup(candidate, options) {
    const moveToIndex = options ? options.index : void 0;
    if (typeof moveToIndex !== "number") {
      return;
    }
    const currentIndex = this.model.indexOf(candidate);
    const editor = this.model.getEditorByIndex(currentIndex);
    if (!editor) {
      return;
    }
    if (currentIndex !== moveToIndex) {
      const oldStickyCount = this.model.stickyCount;
      this.model.moveEditor(editor, moveToIndex);
      this.model.pin(editor);
      this.titleControl.moveEditor(editor, currentIndex, moveToIndex, oldStickyCount !== this.model.stickyCount);
      this.titleControl.pinEditor(editor);
    }
    if (options?.sticky) {
      this.stickEditor(editor);
    }
  }
  doMoveOrCopyEditorAcrossGroups(editor, target, openOptions, internalOptions) {
    const keepCopy = internalOptions?.keepCopy;
    if (!keepCopy || editor.hasCapability(EditorInputCapabilities.Singleton)) {
      const canMoveVeto = editor.canMove(this.id, target.id);
      if (typeof canMoveVeto === "string") {
        this.dialogService.error(canMoveVeto, localize("moveErrorDetails", "Try saving or reverting the editor first and then try again."));
        return false;
      }
    }
    const options = fillActiveEditorViewState(this, editor, {
      ...openOptions,
      pinned: true,
      // always pin moved editor
      sticky: openOptions?.sticky ?? (!keepCopy && this.model.isSticky(editor))
      // preserve sticky state only if editor is moved or explicitly wanted (https://github.com/microsoft/vscode/issues/99035)
    });
    if (!keepCopy) {
      this._onWillMoveEditor.fire({
        groupId: this.id,
        editor,
        target: target.id
      });
    }
    target.doOpenEditor(keepCopy ? editor.copy() : editor, options, internalOptions);
    if (!keepCopy) {
      this.doCloseEditor(editor, true, { ...internalOptions, context: EditorCloseContext.MOVE });
    }
    return true;
  }
  //#endregion
  //#region copyEditor()
  copyEditors(editors, target) {
    const internalOptions = {
      skipTitleUpdate: this !== target
    };
    for (const { editor, options } of editors) {
      this.copyEditor(editor, target, options, internalOptions);
    }
    if (internalOptions.skipTitleUpdate) {
      const copiedEditors = editors.map(({ editor }) => editor);
      target.titleControl.openEditors(copiedEditors);
    }
  }
  copyEditor(editor, target, options, internalOptions) {
    if (this === target) {
      this.doMoveEditorInsideGroup(editor, options);
    } else {
      this.doMoveOrCopyEditorAcrossGroups(editor, target, options, { ...internalOptions, keepCopy: true });
    }
  }
  //#endregion
  //#region closeEditor()
  async closeEditor(editor = this.activeEditor || void 0, options) {
    return this.doCloseEditorWithConfirmationHandling(editor, options);
  }
  async doCloseEditorWithConfirmationHandling(editor = this.activeEditor || void 0, options, internalOptions) {
    if (!editor) {
      return false;
    }
    const veto = await this.handleCloseConfirmation([editor]);
    if (veto) {
      return false;
    }
    this.doCloseEditor(editor, options?.preserveFocus, internalOptions);
    return true;
  }
  doCloseEditor(editor, preserveFocus = this.groupsView.activeGroup !== this, internalOptions) {
    if (!internalOptions?.skipTitleUpdate) {
      this.titleControl.beforeCloseEditor(editor);
    }
    if (this.model.isActive(editor)) {
      this.doCloseActiveEditor(preserveFocus, internalOptions);
    } else {
      this.doCloseInactiveEditor(editor, internalOptions);
    }
    if (!internalOptions?.skipTitleUpdate) {
      this.titleControl.closeEditor(editor);
    }
  }
  doCloseActiveEditor(preserveFocus = this.groupsView.activeGroup !== this, internalOptions) {
    const editorToClose = this.activeEditor;
    const restoreFocus = !preserveFocus && this.shouldRestoreFocus(this.element);
    const closeEmptyGroup = this.groupsView.partOptions.closeEmptyGroups;
    if (closeEmptyGroup && this.active && this.count === 1) {
      const mostRecentlyActiveGroups = this.groupsView.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
      const nextActiveGroup = mostRecentlyActiveGroups[1];
      if (nextActiveGroup) {
        if (restoreFocus) {
          nextActiveGroup.focus();
        } else {
          this.groupsView.activateGroup(nextActiveGroup, true);
        }
      }
    }
    if (editorToClose) {
      this.model.closeEditor(editorToClose, internalOptions?.context);
    }
    const nextActiveEditor = this.model.activeEditor;
    if (nextActiveEditor) {
      let activation = void 0;
      if (preserveFocus && this.groupsView.activeGroup !== this) {
        activation = EditorActivation.PRESERVE;
      }
      const options = {
        preserveFocus,
        activation,
        // When closing an editor due to an error we can end up in a loop where we continue closing
        // editors that fail to open (e.g. when the file no longer exists). We do not want to show
        // repeated errors in this case to the user. As such, if we open the next editor and we are
        // in a scope of a previous editor failing, we silence the input errors until the editor is
        // opened by setting ignoreError: true.
        ignoreError: internalOptions?.fromError
      };
      const internalEditorOpenOptions = {
        // When closing an editor, we reveal the next one in the group.
        // However, this can be a result of moving an editor to another
        // window so we explicitly disable window reordering in this case.
        preserveWindowOrder: true
      };
      this.doOpenEditor(nextActiveEditor, options, internalEditorOpenOptions);
    } else {
      if (editorToClose) {
        this.editorPane.closeEditor(editorToClose);
      }
      if (restoreFocus && !closeEmptyGroup) {
        this.focus();
      }
      this._onDidActiveEditorChange.fire({ editor: void 0 });
      if (closeEmptyGroup) {
        this.groupsView.removeGroup(this, preserveFocus);
      }
    }
  }
  shouldRestoreFocus(target) {
    const activeElement = getActiveElement();
    if (activeElement === target.ownerDocument.body) {
      return true;
    }
    return isAncestor(activeElement, target);
  }
  doCloseInactiveEditor(editor, internalOptions) {
    this.model.closeEditor(editor, internalOptions?.context);
  }
  async handleCloseConfirmation(editors) {
    if (!editors.length) {
      return false;
    }
    const editor = editors.shift();
    let handleCloseConfirmationPromise = this.mapEditorToPendingConfirmation.get(editor);
    if (!handleCloseConfirmationPromise) {
      handleCloseConfirmationPromise = this.doHandleCloseConfirmation(editor);
      this.mapEditorToPendingConfirmation.set(editor, handleCloseConfirmationPromise);
    }
    let veto;
    try {
      veto = await handleCloseConfirmationPromise;
    } finally {
      this.mapEditorToPendingConfirmation.delete(editor);
    }
    if (veto) {
      return veto;
    }
    return this.handleCloseConfirmation(editors);
  }
  async doHandleCloseConfirmation(editor, options) {
    if (!this.shouldConfirmClose(editor)) {
      return false;
    }
    if (editor instanceof SideBySideEditorInput && this.model.contains(editor.primary)) {
      return false;
    }
    if (this.editorPartsView.groups.some((groupView) => {
      if (groupView === this) {
        return false;
      }
      const otherGroup = groupView;
      if (otherGroup.contains(editor, { supportSideBySide: SideBySideEditor.BOTH })) {
        return true;
      }
      if (editor instanceof SideBySideEditorInput && otherGroup.contains(editor.primary)) {
        return true;
      }
      return false;
    })) {
      return false;
    }
    let confirmation = ConfirmResult.CANCEL;
    let saveReason = SaveReason.EXPLICIT;
    let autoSave = false;
    if (!editor.hasCapability(EditorInputCapabilities.Untitled) && !options?.skipAutoSave && !editor.closeHandler) {
      if (this.filesConfigurationService.getAutoSaveMode(editor).mode === AutoSaveMode.ON_FOCUS_CHANGE) {
        autoSave = true;
        confirmation = ConfirmResult.SAVE;
        saveReason = SaveReason.FOCUS_CHANGE;
      } else if (isNative && (isWindows || isLinux) && this.filesConfigurationService.getAutoSaveMode(editor).mode === AutoSaveMode.ON_WINDOW_CHANGE) {
        autoSave = true;
        confirmation = ConfirmResult.SAVE;
        saveReason = SaveReason.WINDOW_CHANGE;
      }
    }
    if (!autoSave) {
      if (!this.activeEditor?.matches(editor)) {
        await this.doOpenEditor(editor);
      }
      await this.hostService.focus(getWindow(this.element));
      let handlerDidError = false;
      if (typeof editor.closeHandler?.confirm === "function") {
        try {
          confirmation = await editor.closeHandler.confirm([{ editor, groupId: this.id }]);
        } catch (e) {
          this.logService.error(e);
          handlerDidError = true;
        }
      }
      if (typeof editor.closeHandler?.confirm !== "function" || handlerDidError) {
        let name;
        if (editor instanceof SideBySideEditorInput) {
          name = editor.primary.getName();
        } else {
          name = editor.getName();
        }
        confirmation = await this.fileDialogService.showSaveConfirm([name]);
      }
    }
    if (!editor.closeHandler && !this.shouldConfirmClose(editor)) {
      return confirmation === ConfirmResult.CANCEL;
    }
    switch (confirmation) {
      case ConfirmResult.SAVE: {
        const result = await editor.save(this.id, { reason: saveReason });
        if (!result && autoSave) {
          return this.doHandleCloseConfirmation(editor, { skipAutoSave: true });
        }
        return editor.isDirty();
      }
      case ConfirmResult.DONT_SAVE:
        try {
          await editor.revert(this.id);
          return editor.isDirty();
        } catch (error) {
          this.logService.error(error);
          await editor.revert(this.id, { soft: true });
          return editor.isDirty();
        }
      case ConfirmResult.CANCEL:
        return true;
    }
  }
  shouldConfirmClose(editor) {
    if (editor.closeHandler) {
      try {
        return editor.closeHandler.showConfirm();
      } catch (error) {
        this.logService.error(error);
      }
    }
    return editor.isDirty() && !editor.isSaving();
  }
  //#endregion
  //#region closeEditors()
  async closeEditors(args, options) {
    if (this.isEmpty) {
      return true;
    }
    const editors = this.doGetEditorsToClose(args);
    const veto = await this.handleCloseConfirmation(editors.slice(0));
    if (veto) {
      return false;
    }
    this.doCloseEditors(editors, options);
    return true;
  }
  doGetEditorsToClose(args) {
    if (Array.isArray(args)) {
      return args;
    }
    const filter = args;
    const hasDirection = typeof filter.direction === "number";
    let editorsToClose = this.model.getEditors(hasDirection ? EditorsOrder.SEQUENTIAL : EditorsOrder.MOST_RECENTLY_ACTIVE, filter);
    if (filter.savedOnly) {
      editorsToClose = editorsToClose.filter((editor) => !editor.isDirty() || editor.isSaving());
    } else if (hasDirection && filter.except) {
      editorsToClose = filter.direction === CloseDirection.LEFT ? editorsToClose.slice(0, this.model.indexOf(filter.except, editorsToClose)) : editorsToClose.slice(this.model.indexOf(filter.except, editorsToClose) + 1);
    } else if (filter.except) {
      editorsToClose = editorsToClose.filter((editor) => filter.except && !editor.matches(filter.except));
    }
    return editorsToClose;
  }
  doCloseEditors(editors, options) {
    let closeActiveEditor = false;
    for (const editor of editors) {
      if (!this.isActive(editor)) {
        this.doCloseInactiveEditor(editor);
      } else {
        closeActiveEditor = true;
      }
    }
    if (closeActiveEditor) {
      this.doCloseActiveEditor(options?.preserveFocus);
    }
    if (editors.length) {
      this.titleControl.closeEditors(editors);
    }
  }
  closeAllEditors(options) {
    if (this.isEmpty) {
      if (this.groupsView.partOptions.closeEmptyGroups) {
        this.groupsView.removeGroup(this);
      }
      return true;
    }
    if (options?.excludeConfirming) {
      this.doCloseAllEditors(options);
      return true;
    }
    return this.handleCloseConfirmation(this.model.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, options)).then((veto) => {
      if (veto) {
        return false;
      }
      this.doCloseAllEditors(options);
      return true;
    });
  }
  doCloseAllEditors(options) {
    let editors = this.model.getEditors(EditorsOrder.SEQUENTIAL, options);
    if (options?.excludeConfirming) {
      editors = editors.filter((editor) => !this.shouldConfirmClose(editor));
    }
    const editorsToClose = [];
    for (const editor of editors) {
      if (!this.isActive(editor)) {
        this.doCloseInactiveEditor(editor);
      }
      editorsToClose.push(editor);
    }
    if (this.activeEditor && editorsToClose.includes(this.activeEditor)) {
      this.doCloseActiveEditor();
    }
    if (editorsToClose.length) {
      this.titleControl.closeEditors(editorsToClose);
    }
  }
  //#endregion
  //#region replaceEditors()
  async replaceEditors(editors) {
    let activeReplacement;
    const inactiveReplacements = [];
    for (let { editor, replacement, forceReplaceDirty, options } of editors) {
      const index = this.getIndexOfEditor(editor);
      if (index >= 0) {
        const isActiveEditor = this.isActive(editor);
        if (options) {
          options.index = index;
        } else {
          options = { index };
        }
        options.inactive = !isActiveEditor;
        options.pinned = options.pinned ?? true;
        const editorToReplace = { editor, replacement, forceReplaceDirty, options };
        if (isActiveEditor) {
          activeReplacement = editorToReplace;
        } else {
          inactiveReplacements.push(editorToReplace);
        }
      }
    }
    for (const { editor, replacement, forceReplaceDirty, options } of inactiveReplacements) {
      await this.doOpenEditor(replacement, options);
      if (!editor.matches(replacement)) {
        let closed = false;
        if (forceReplaceDirty) {
          this.doCloseEditor(editor, true, { context: EditorCloseContext.REPLACE });
          closed = true;
        } else {
          closed = await this.doCloseEditorWithConfirmationHandling(editor, { preserveFocus: true }, { context: EditorCloseContext.REPLACE });
        }
        if (!closed) {
          return;
        }
      }
    }
    if (activeReplacement) {
      const openEditorResult = this.doOpenEditor(activeReplacement.replacement, activeReplacement.options);
      if (!activeReplacement.editor.matches(activeReplacement.replacement)) {
        if (activeReplacement.forceReplaceDirty) {
          this.doCloseEditor(activeReplacement.editor, true, { context: EditorCloseContext.REPLACE });
        } else {
          await this.doCloseEditorWithConfirmationHandling(activeReplacement.editor, { preserveFocus: true }, { context: EditorCloseContext.REPLACE });
        }
      }
      await openEditorResult;
    }
  }
  //#endregion
  //#region Locking
  get isLocked() {
    return this.model.isLocked;
  }
  lock(locked) {
    this.model.lock(locked);
  }
  //#endregion
  //#region Editor Actions
  createEditorActions(disposables, menuId = MenuId.EditorTitle) {
    let actions = { primary: [], secondary: [] };
    let onDidChange;
    const activeEditorPane = this.activeEditorPane;
    if (activeEditorPane instanceof EditorPane) {
      const editorScopedContextKeyService = activeEditorPane.scopedContextKeyService ?? this.scopedContextKeyService;
      const editorTitleMenu = disposables.add(this.menuService.createMenu(menuId, editorScopedContextKeyService, { emitEventsForSubmenuChanges: true, eventDebounceDelay: 0 }));
      onDidChange = editorTitleMenu.onDidChange;
      const shouldInlineGroup = (action, group) => group === "navigation" && action.actions.length <= 1;
      actions = getActionBarActions(
        editorTitleMenu.getActions({ arg: this.resourceContext.get(), shouldForwardArgs: true, renderShortTitle: true }),
        "navigation",
        shouldInlineGroup
      );
      if (menuId === MenuId.EditorTitle) {
        const available = getAvailableEditorTypes(this.activeEditor, this.editorResolverService);
        if (available) {
          const editorTypeActions = createEditorTypeActions(available, this.editorResolverService, this.commandService, this.editorService);
          const reopenWithSubmenu = new SubmenuAction("editor.reopenWith", localize("reopenWith", "Reopen Editor With"), editorTypeActions);
          if (actions.secondary.length) {
            actions.secondary.push(new Separator());
          }
          actions.secondary.push(reopenWithSubmenu);
        }
      }
    } else {
      const onDidChangeEmitter = disposables.add(new Emitter());
      onDidChange = onDidChangeEmitter.event;
      disposables.add(this.onDidActiveEditorChange(() => onDidChangeEmitter.fire()));
    }
    return { actions, onDidChange };
  }
  //#endregion
  //#region Themable
  updateStyles() {
    const isEmpty = this.isEmpty;
    if (isEmpty) {
      this.element.style.backgroundColor = this.getColor(EDITOR_GROUP_EMPTY_BACKGROUND) || "";
    } else {
      this.element.style.backgroundColor = "";
    }
    const borderColor = this.getColor(EDITOR_GROUP_HEADER_BORDER) || this.getColor(contrastBorder);
    if (!isEmpty && borderColor) {
      this.titleContainer.classList.add("title-border-bottom");
      this.titleContainer.style.setProperty("--title-border-bottom-color", borderColor);
    } else {
      this.titleContainer.classList.remove("title-border-bottom");
      this.titleContainer.style.removeProperty("--title-border-bottom-color");
    }
    const { showTabs } = this.groupsView.partOptions;
    this.titleContainer.style.backgroundColor = this.getColor(showTabs === "multiple" ? EDITOR_GROUP_HEADER_TABS_BACKGROUND : EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND) || "";
    this.editorContainer.style.backgroundColor = this.getColor(editorBackground) || "";
  }
  get minimumWidth() {
    return this.editorPane.minimumWidth;
  }
  get minimumHeight() {
    return this.editorPane.minimumHeight;
  }
  get maximumWidth() {
    return this.editorPane.maximumWidth;
  }
  get maximumHeight() {
    return this.editorPane.maximumHeight;
  }
  get proportionalLayout() {
    if (!this.lastLayout) {
      return true;
    }
    return !(this.lastLayout.width === this.minimumWidth || this.lastLayout.height === this.minimumHeight);
  }
  layout(width, height, top, left) {
    this.lastLayout = { width, height, top, left };
    this.element.classList.toggle("max-height-478px", height <= 478);
    const titleControlSize = this.titleControl.layout({
      container: new Dimension(width, height),
      available: new Dimension(width, height - this.editorPane.minimumHeight)
    }, this._contentRightInset);
    this.progressBar.getContainer().style.top = `${Math.max(this.titleHeight.offset - 2, 0)}px`;
    const headerBoxHeight = this._headerHeight;
    this.headerContainer.style.display = "";
    this.headerContainer.style.height = `${headerBoxHeight}px`;
    const contentWidth = Math.max(0, width - this._contentRightInset);
    const editorHeight = Math.max(0, height - titleControlSize.height - headerBoxHeight);
    this.editorContainer.style.width = `${contentWidth}px`;
    this.editorContainer.style.height = `${editorHeight}px`;
    this.editorPane.layout({ width: contentWidth, height: editorHeight, top: top + titleControlSize.height + headerBoxHeight, left });
  }
  /**
   * Sets the right inset reserved beside the breadcrumbs and editor pane while tabs remain full-width.
   * `0` restores the default full-width content.
   */
  setContentRightInset(inset) {
    const next = Math.max(0, Math.round(inset));
    if (next === this._contentRightInset) {
      return;
    }
    this._contentRightInset = next;
    this.relayout();
  }
  /** The reserved height of the header row (its content height). */
  get headerHeight() {
    return this._headerHeight;
  }
  /**
   * Renders caller-provided content into a full-width header row between the tab
   * bar and the editor pane, and keeps the row sized to that content (it wraps and
   * grows automatically via a `ResizeObserver`, firing {@link onDidChangeHeaderHeight}).
   * The returned disposable clears the header. Only one content is shown at a time.
   */
  setHeaderContent(render) {
    this._headerContent.clear();
    const store = new DisposableStore();
    const content = append(this.headerContainer, $(".editor-group-header-content"));
    store.add(render(content));
    const updateHeight = () => this._setHeaderHeight(content.offsetHeight);
    const resizeObserver = new (getWindow(this.headerContainer)).ResizeObserver(() => updateHeight());
    resizeObserver.observe(content);
    store.add(toDisposable(() => resizeObserver.disconnect()));
    updateHeight();
    store.add(toDisposable(() => {
      content.remove();
      this._setHeaderHeight(0);
    }));
    this._headerContent.value = store;
    return toDisposable(() => {
      if (this._headerContent.value === store) {
        this._headerContent.clear();
      }
    });
  }
  _setHeaderHeight(height) {
    const next = Math.max(0, Math.round(height));
    if (next === this._headerHeight) {
      return;
    }
    this._headerHeight = next;
    this.relayout();
    this._onDidChangeHeaderHeight.fire();
  }
  /**
   * Renders the group's configured header menus ({@link IEditorGroupViewOptions.menuIds})
   * as leading/trailing toolbars below the tab bar, but only while the active editor
   * opts in ({@link IEditorPane.getHeaderActions}, which supplies the editor-scoped
   * instantiation service). The header height follows its rendered content, and
   * re-renders whenever the active editor changes.
   */
  _renderEditorHeader() {
    const menuIds = this._menuIds;
    const headerActions = this.activeEditorPane?.getHeaderActions?.();
    if (!menuIds?.headerPrimary && !menuIds?.headerSecondary || !headerActions) {
      this._editorHeaderContent.clear();
      return;
    }
    const headerPrimaryMenuId = menuIds.headerPrimary;
    const headerSecondaryMenuId = menuIds.headerSecondary;
    this._editorHeaderContent.value = this.setHeaderContent((container) => {
      const store = new DisposableStore();
      container.classList.add("editor-group-header-toolbars");
      const primaryContainer = append(container, $(".editor-group-header-primary"));
      const secondaryContainer = append(container, $(".editor-group-header-secondary"));
      const toolbarOptions = {
        menuOptions: { shouldForwardArgs: true },
        highlightToggledItems: true,
        toolbarOptions: { primaryGroup: (group) => group !== "secondary", useSeparatorsInPrimaryActions: true }
      };
      if (headerPrimaryMenuId) {
        store.add(headerActions.instantiationService.createInstance(MenuWorkbenchToolBar, primaryContainer, headerPrimaryMenuId, toolbarOptions));
      }
      if (headerSecondaryMenuId) {
        store.add(headerActions.instantiationService.createInstance(MenuWorkbenchToolBar, secondaryContainer, headerSecondaryMenuId, toolbarOptions));
      }
      return store;
    });
  }
  relayout() {
    if (this.lastLayout) {
      const { width, height, top, left } = this.lastLayout;
      this.layout(width, height, top, left);
    }
  }
  setBoundarySashes(sashes) {
    this.editorPane.setBoundarySashes(sashes);
  }
  toJSON() {
    return this.model.serialize();
  }
  //#endregion
  dispose() {
    this._disposed = true;
    this._onWillDispose.fire();
    super.dispose();
  }
};
EditorGroupView = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IMenuService),
  __decorateParam(12, IContextMenuService),
  __decorateParam(13, IFileDialogService),
  __decorateParam(14, IEditorService),
  __decorateParam(15, IFilesConfigurationService),
  __decorateParam(16, IUriIdentityService),
  __decorateParam(17, ILogService),
  __decorateParam(18, IEditorResolverService),
  __decorateParam(19, IHostService),
  __decorateParam(20, IDialogService),
  __decorateParam(21, IFileService),
  __decorateParam(22, ICommandService)
], EditorGroupView);
export {
  EditorGroupView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JHcm91cFZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvZWRpdG9yZ3JvdXB2aWV3LmNzcyc7XG5pbXBvcnQgeyBFZGl0b3JHcm91cE1vZGVsLCBJRWRpdG9yT3Blbk9wdGlvbnMsIElHcm91cE1vZGVsQ2hhbmdlRXZlbnQsIElTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbCwgaXNHcm91cEVkaXRvckNsb3NlRXZlbnQsIGlzR3JvdXBFZGl0b3JPcGVuRXZlbnQsIGlzU2VyaWFsaXplZEVkaXRvckdyb3VwTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvckdyb3VwTW9kZWwuanMnO1xuaW1wb3J0IHsgR3JvdXBJZGVudGlmaWVyLCBDbG9zZURpcmVjdGlvbiwgSUVkaXRvckNsb3NlRXZlbnQsIElFZGl0b3JQYW5lLCBTYXZlUmVhc29uLCBJRWRpdG9yUGFydE9wdGlvbnNDaGFuZ2VFdmVudCwgRWRpdG9yc09yZGVyLCBJVmlzaWJsZUVkaXRvclBhbmUsIEVkaXRvclJlc291cmNlQWNjZXNzb3IsIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBJVW50eXBlZEVkaXRvcklucHV0LCBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTiwgU2lkZUJ5U2lkZUVkaXRvciwgRWRpdG9yQ2xvc2VDb250ZXh0LCBJRWRpdG9yV2lsbE1vdmVFdmVudCwgSUVkaXRvcldpbGxPcGVuRXZlbnQsIElNYXRjaEVkaXRvck9wdGlvbnMsIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLCBJQWN0aXZlRWRpdG9yQ2hhbmdlRXZlbnQsIElGaW5kRWRpdG9yT3B0aW9ucywgVEVYVF9ESUZGX0VESVRPUl9JRCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQWN0aXZlRWRpdG9yR3JvdXBMb2NrZWRDb250ZXh0LCBBY3RpdmVFZGl0b3JEaXJ0eUNvbnRleHQsIEVkaXRvckdyb3VwRWRpdG9yc0NvdW50Q29udGV4dCwgQWN0aXZlRWRpdG9yU3RpY2t5Q29udGV4dCwgQWN0aXZlRWRpdG9yUGlubmVkQ29udGV4dCwgQWN0aXZlRWRpdG9yTGFzdEluR3JvdXBDb250ZXh0LCBBY3RpdmVFZGl0b3JGaXJzdEluR3JvdXBDb250ZXh0LCBSZXNvdXJjZUNvbnRleHRLZXksIGFwcGx5QXZhaWxhYmxlRWRpdG9ySWRzLCBBY3RpdmVFZGl0b3JBdmFpbGFibGVFZGl0b3JJZHNDb250ZXh0LCBBY3RpdmVFZGl0b3JDYW5TcGxpdEluR3JvdXBDb250ZXh0LCBTaWRlQnlTaWRlRWRpdG9yQWN0aXZlQ29udGV4dCwgVGV4dENvbXBhcmVFZGl0b3JWaXNpYmxlQ29udGV4dCwgVGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0LCBBY3RpdmVFZGl0b3JDb250ZXh0LCBBY3RpdmVFZGl0b3JSZWFkb25seUNvbnRleHQsIEFjdGl2ZUVkaXRvckNhblJldmVydENvbnRleHQsIEFjdGl2ZUVkaXRvckNhblRvZ2dsZVJlYWRvbmx5Q29udGV4dCwgQWN0aXZlQ29tcGFyZUVkaXRvckNhblN3YXBDb250ZXh0LCBNdWx0aXBsZUVkaXRvcnNTZWxlY3RlZEluR3JvdXBDb250ZXh0LCBUd29FZGl0b3JzU2VsZWN0ZWRJbkdyb3VwQ29udGV4dCwgU2VsZWN0ZWRFZGl0b3JzSW5Hcm91cEZpbGVPclVudGl0bGVkUmVzb3VyY2VDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCwgUmVsYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IERpbWVuc2lvbiwgdHJhY2tGb2N1cywgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIEV2ZW50SGVscGVyLCBmaW5kUGFyZW50V2l0aENsYXNzLCBpc0FuY2VzdG9yLCBJRG9tTm9kZVBhZ2VQb3NpdGlvbiwgaXNNb3VzZUV2ZW50LCBpc0FjdGl2ZUVsZW1lbnQsIGdldFdpbmRvdywgZ2V0QWN0aXZlRWxlbWVudCwgJCwgYXBwZW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3NCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcHJvZ3Jlc3NiYXIvcHJvZ3Jlc3NiYXIuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgVGhlbWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVkaXRvckJhY2tncm91bmQsIGNvbnRyYXN0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRURJVE9SX0dST1VQX0hFQURFUl9UQUJTX0JBQ0tHUk9VTkQsIEVESVRPUl9HUk9VUF9IRUFERVJfTk9fVEFCU19CQUNLR1JPVU5ELCBFRElUT1JfR1JPVVBfRU1QVFlfQkFDS0dST1VORCwgRURJVE9SX0dST1VQX0hFQURFUl9CT1JERVIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSUNsb3NlRWRpdG9yc0ZpbHRlciwgR3JvdXBzT3JkZXIsIElDbG9zZUVkaXRvck9wdGlvbnMsIElDbG9zZUFsbEVkaXRvcnNPcHRpb25zLCBJRWRpdG9yUmVwbGFjZW1lbnQsIElBY3RpdmVFZGl0b3JBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmVzIH0gZnJvbSAnLi9lZGl0b3JQYW5lcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IEVkaXRvclByb2dyZXNzSW5kaWNhdG9yIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJvZ3Jlc3MvYnJvd3Nlci9wcm9ncmVzc0luZGljYXRvci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlEYXRhLCBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgUHJvbWlzZXMsIFJ1bk9uY2VXb3JrZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUsIEdlc3R1cmVFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzVmlldywgSUVkaXRvckdyb3VwVmlldywgZmlsbEFjdGl2ZUVkaXRvclZpZXdTdGF0ZSwgRWRpdG9yU2VydmljZUltcGwsIElFZGl0b3JHcm91cFRpdGxlSGVpZ2h0LCBJSW50ZXJuYWxFZGl0b3JPcGVuT3B0aW9ucywgSUludGVybmFsTW92ZUNvcHlPcHRpb25zLCBJSW50ZXJuYWxFZGl0b3JDbG9zZU9wdGlvbnMsIElJbnRlcm5hbEVkaXRvclRpdGxlQ29udHJvbE9wdGlvbnMsIElFZGl0b3JQYXJ0c1ZpZXcsIElFZGl0b3JHcm91cFZpZXdPcHRpb25zLCBJRWRpdG9yR3JvdXBNZW51SWRzIH0gZnJvbSAnLi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBTZXBhcmF0b3IsIFN1Ym1lbnVBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElNZW51Q2hhbmdlRXZlbnQsIElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IGdldEFjdGlvbkJhckFjdGlvbnMsIFByaW1hcnlBbmRTZWNvbmRhcnlBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUVkaXRvclR5cGVBY3Rpb25zLCBnZXRBdmFpbGFibGVFZGl0b3JUeXBlcyB9IGZyb20gJy4vZWRpdG9yVHlwZVBpY2tlci5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgZ2V0TWltZVR5cGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZXNBc3NvY2lhdGlvbnMuanMnO1xuaW1wb3J0IHsgZXh0bmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3RpdmF0aW9uLCBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSwgQ29uZmlybVJlc3VsdCwgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBBdXRvU2F2ZU1vZGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzTmF0aXZlLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgZGVmYXVsdFByb2dyZXNzQmFyU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElCb3VuZGFyeVNhc2hlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgRWRpdG9yR3JvdXBXYXRlcm1hcmsgfSBmcm9tICcuL2VkaXRvckdyb3VwV2F0ZXJtYXJrLmpzJztcbmltcG9ydCB7IEVkaXRvclRpdGxlQ29udHJvbCB9IGZyb20gJy4vZWRpdG9yVGl0bGVDb250cm9sLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvclJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcywgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcblxuZXhwb3J0IGNsYXNzIEVkaXRvckdyb3VwVmlldyBleHRlbmRzIFRoZW1hYmxlIGltcGxlbWVudHMgSUVkaXRvckdyb3VwVmlldyB7XG5cblx0Ly8jcmVnaW9uIGZhY3RvcnlcblxuXHRzdGF0aWMgY3JlYXRlTmV3KGVkaXRvclBhcnRzVmlldzogSUVkaXRvclBhcnRzVmlldywgZ3JvdXBzVmlldzogSUVkaXRvckdyb3Vwc1ZpZXcsIGdyb3Vwc0xhYmVsOiBzdHJpbmcsIGdyb3VwSW5kZXg6IG51bWJlciwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgb3B0aW9ucz86IElFZGl0b3JHcm91cFZpZXdPcHRpb25zKTogSUVkaXRvckdyb3VwVmlldyB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvckdyb3VwVmlldywgbnVsbCwgZWRpdG9yUGFydHNWaWV3LCBncm91cHNWaWV3LCBncm91cHNMYWJlbCwgZ3JvdXBJbmRleCwgb3B0aW9ucyk7XG5cdH1cblxuXHRzdGF0aWMgY3JlYXRlRnJvbVNlcmlhbGl6ZWQoc2VyaWFsaXplZDogSVNlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsLCBlZGl0b3JQYXJ0c1ZpZXc6IElFZGl0b3JQYXJ0c1ZpZXcsIGdyb3Vwc1ZpZXc6IElFZGl0b3JHcm91cHNWaWV3LCBncm91cHNMYWJlbDogc3RyaW5nLCBncm91cEluZGV4OiBudW1iZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIG9wdGlvbnM/OiBJRWRpdG9yR3JvdXBWaWV3T3B0aW9ucyk6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JHcm91cFZpZXcsIHNlcmlhbGl6ZWQsIGVkaXRvclBhcnRzVmlldywgZ3JvdXBzVmlldywgZ3JvdXBzTGFiZWwsIGdyb3VwSW5kZXgsIG9wdGlvbnMpO1xuXHR9XG5cblx0c3RhdGljIGNyZWF0ZUNvcHkoY29weUZyb206IElFZGl0b3JHcm91cFZpZXcsIGVkaXRvclBhcnRzVmlldzogSUVkaXRvclBhcnRzVmlldywgZ3JvdXBzVmlldzogSUVkaXRvckdyb3Vwc1ZpZXcsIGdyb3Vwc0xhYmVsOiBzdHJpbmcsIGdyb3VwSW5kZXg6IG51bWJlciwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgb3B0aW9ucz86IElFZGl0b3JHcm91cFZpZXdPcHRpb25zKTogSUVkaXRvckdyb3VwVmlldyB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvckdyb3VwVmlldywgY29weUZyb20sIGVkaXRvclBhcnRzVmlldywgZ3JvdXBzVmlldywgZ3JvdXBzTGFiZWwsIGdyb3VwSW5kZXgsIG9wdGlvbnMpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0LyoqXG5cdCAqIEFjY2VzcyB0byB0aGUgY29udGV4dCBrZXkgc2VydmljZSBzY29wZWQgdG8gdGhpcyBlZGl0b3IgZ3JvdXAuXG5cdCAqL1xuXHRyZWFkb25seSBzY29wZWRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXG5cdC8vI3JlZ2lvbiBldmVudHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXMgPSB0aGlzLl9vbkRpZEZvY3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25XaWxsRGlzcG9zZSA9IHRoaXMuX29uV2lsbERpc3Bvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRNb2RlbENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElHcm91cE1vZGVsQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZE1vZGVsQ2hhbmdlID0gdGhpcy5fb25EaWRNb2RlbENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElBY3RpdmVFZGl0b3JDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlID0gdGhpcy5fb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRPcGVuRWRpdG9yRmFpbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEVkaXRvcklucHV0PigpKTtcblx0cmVhZG9ubHkgb25EaWRPcGVuRWRpdG9yRmFpbCA9IHRoaXMuX29uRGlkT3BlbkVkaXRvckZhaWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsQ2xvc2VFZGl0b3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRWRpdG9yQ2xvc2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbENsb3NlRWRpdG9yID0gdGhpcy5fb25XaWxsQ2xvc2VFZGl0b3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZUVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JDbG9zZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZUVkaXRvciA9IHRoaXMuX29uRGlkQ2xvc2VFZGl0b3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsTW92ZUVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JXaWxsTW92ZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25XaWxsTW92ZUVkaXRvciA9IHRoaXMuX29uV2lsbE1vdmVFZGl0b3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsT3BlbkVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JXaWxsT3BlbkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25XaWxsT3BlbkVkaXRvciA9IHRoaXMuX29uV2lsbE9wZW5FZGl0b3IuZXZlbnQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbDogRWRpdG9yR3JvdXBNb2RlbDtcblxuXHRwcml2YXRlIGFjdGl2ZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsYXN0TGF5b3V0OiBJRG9tTm9kZVBhZ2VQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZUNvbnRleHQ6IFJlc291cmNlQ29udGV4dEtleTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRpdGxlQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSB0aXRsZUNvbnRyb2w6IEVkaXRvclRpdGxlQ29udHJvbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzQmFyOiBQcm9ncmVzc0JhcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGhlYWRlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JQYW5lOiBFZGl0b3JQYW5lcztcblxuXHQvKipcblx0ICogT3B0aW9uYWwgaW5zZXQgKGluIHB4KSByZXNlcnZlZCBvbiB0aGUgcmlnaHQgb2YgdGhlIGVkaXRvciBwYW5lIHdoaWxlIHRoZVxuXHQgKiB0aXRsZSBjb250cm9sIGtlZXBzIHRoZSBmdWxsIGdyb3VwIHdpZHRoLiBVc2VkIGJ5IHRoZSBBZ2VudHMgd2luZG93IHRvIGRvY2tcblx0ICogdGhlIGRldGFpbCBwYW5lbCBiZXNpZGUgdGhlIGVkaXRvciBjb250ZW50IHVuZGVyIG9uZSBmdWxsLXdpZHRoIHRhYiBiYXIuXG5cdCAqIGAwYCAoZGVmYXVsdCkgaXMgYSBuby1vcCBmb3IgYWxsIG90aGVyIGxheW91dHMuXG5cdCAqL1xuXHRwcml2YXRlIF9jb250ZW50UmlnaHRJbnNldCA9IDA7XG5cblx0LyoqXG5cdCAqIEhlaWdodCAoaW4gcHgpIG9mIHRoZSBvcHRpb25hbCB7QGxpbmsgaGVhZGVyQ29udGFpbmVyfSByZW5kZXJlZCBhcyBhIGZsb3dcblx0ICogcm93IGJldHdlZW4gdGhlIHRhYiBiYXIgYW5kIHRoZSBlZGl0b3IgcGFuZS4gVXNlZCBieSB0aGUgQWdlbnRzIHdpbmRvdyB0b1xuXHQgKiBob3N0IGEgZnVsbC13aWR0aCBoZWFkZXIgYmVsb3cgdGhlIHRhYnMuIGAwYCAoZGVmYXVsdCkgaGlkZXMgdGhlIGhlYWRlci5cblx0ICovXG5cdHByaXZhdGUgX2hlYWRlckhlaWdodCA9IDA7XG5cblx0LyoqIFRoZSBncm91cCdzIGNvbmZpZ3VyZWQgbWVudSBpZHMgKHNlZSB7QGxpbmsgSUVkaXRvckdyb3VwVmlld09wdGlvbnMubWVudUlkc30pLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZW51SWRzOiBJRWRpdG9yR3JvdXBNZW51SWRzIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBSZW5kZXJzIGFuZCBhdXRvLXNpemVzIHRoZSBvcHRpb25hbCBoZWFkZXIgY29udGVudCAoc2VlIHtAbGluayBzZXRIZWFkZXJDb250ZW50fSkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hlYWRlckNvbnRlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSGVhZGVySGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGVhZGVySGVpZ2h0ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWFkZXJIZWlnaHQuZXZlbnQ7XG5cblx0LyoqIFRoZSBhY3RpdmUgZWRpdG9yJ3MgZGVjbGFyZWQgaGVhZGVyIHRvb2xiYXJzIChzZWUge0BsaW5rIElFZGl0b3JQYW5lLmdldEhlYWRlckFjdGlvbnN9KS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9ySGVhZGVyQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2VkRWRpdG9yc1dvcmtlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlV29ya2VyPEVkaXRvcklucHV0PihlZGl0b3JzID0+IHRoaXMuaGFuZGxlRGlzcG9zZWRFZGl0b3JzKGVkaXRvcnMpLCAwKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtYXBFZGl0b3JUb1BlbmRpbmdDb25maXJtYXRpb24gPSBuZXcgTWFwPEVkaXRvcklucHV0LCBQcm9taXNlPGJvb2xlYW4+PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyVG9vbEJhck1lbnVEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2hlblJlc3RvcmVkUHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cmVhZG9ubHkgd2hlblJlc3RvcmVkID0gdGhpcy53aGVuUmVzdG9yZWRQcm9taXNlLnA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZnJvbTogSUVkaXRvckdyb3VwVmlldyB8IElTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbCB8IG51bGwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JQYXJ0c1ZpZXc6IElFZGl0b3JQYXJ0c1ZpZXcsXG5cdFx0cmVhZG9ubHkgZ3JvdXBzVmlldzogSUVkaXRvckdyb3Vwc1ZpZXcsXG5cdFx0cHJpdmF0ZSBncm91cHNMYWJlbDogc3RyaW5nLFxuXHRcdHByaXZhdGUgX2luZGV4OiBudW1iZXIsXG5cdFx0b3B0aW9uczogSUVkaXRvckdyb3VwVmlld09wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IEVkaXRvclNlcnZpY2VJbXBsLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlOiBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHRoZW1lU2VydmljZSk7XG5cblx0XHR0aGlzLl9tZW51SWRzID0gb3B0aW9ucz8ubWVudUlkcztcblxuXHRcdGlmIChmcm9tIGluc3RhbmNlb2YgRWRpdG9yR3JvdXBWaWV3KSB7XG5cdFx0XHR0aGlzLm1vZGVsID0gdGhpcy5fcmVnaXN0ZXIoZnJvbS5tb2RlbC5jbG9uZSgpKTtcblx0XHR9IGVsc2UgaWYgKGlzU2VyaWFsaXplZEVkaXRvckdyb3VwTW9kZWwoZnJvbSkpIHtcblx0XHRcdHRoaXMubW9kZWwgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JHcm91cE1vZGVsLCBmcm9tKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubW9kZWwgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JHcm91cE1vZGVsLCB1bmRlZmluZWQpKTtcblx0XHR9XG5cblx0XHQvLyNyZWdpb24gY3JlYXRlKClcblx0XHR7XG5cdFx0XHQvLyBTY29wZWQgY29udGV4dCBrZXkgc2VydmljZVxuXHRcdFx0dGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuZWxlbWVudCkpO1xuXG5cdFx0XHQvLyBDb250YWluZXJcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLmNvYWxlc2NlKFsnZWRpdG9yLWdyb3VwLWNvbnRhaW5lcicsIHRoaXMubW9kZWwuaXNMb2NrZWQgPyAnbG9ja2VkJyA6IHVuZGVmaW5lZF0pKTtcblxuXHRcdFx0Ly8gQ29udGFpbmVyIGxpc3RlbmVyc1xuXHRcdFx0dGhpcy5yZWdpc3RlckNvbnRhaW5lckxpc3RlbmVycygpO1xuXG5cdFx0XHQvLyBDb250YWluZXIgdG9vbGJhclxuXHRcdFx0dGhpcy5jcmVhdGVDb250YWluZXJUb29sYmFyKCk7XG5cblx0XHRcdC8vIENvbnRhaW5lciBjb250ZXh0IG1lbnVcblx0XHRcdHRoaXMuY3JlYXRlQ29udGFpbmVyQ29udGV4dE1lbnUoKTtcblxuXHRcdFx0Ly8gV2F0ZXJtYXJrICYgc2hvcnRjdXRzXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvckdyb3VwV2F0ZXJtYXJrLCB0aGlzLmVsZW1lbnQpKTtcblxuXHRcdFx0Ly8gUHJvZ3Jlc3MgYmFyXG5cdFx0XHR0aGlzLnByb2dyZXNzQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFByb2dyZXNzQmFyKHRoaXMuZWxlbWVudCwgZGVmYXVsdFByb2dyZXNzQmFyU3R5bGVzKSk7XG5cdFx0XHR0aGlzLnByb2dyZXNzQmFyLmhpZGUoKTtcblxuXHRcdFx0Ly8gU2NvcGVkIGluc3RhbnRpYXRpb24gc2VydmljZVxuXHRcdFx0dGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0XHRbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSxcblx0XHRcdFx0W0lFZGl0b3JQcm9ncmVzc1NlcnZpY2UsIHRoaXMuX3JlZ2lzdGVyKG5ldyBFZGl0b3JQcm9ncmVzc0luZGljYXRvcih0aGlzLnByb2dyZXNzQmFyLCB0aGlzKSldXG5cdFx0XHQpKSk7XG5cblx0XHRcdC8vIENvbnRleHQga2V5c1xuXHRcdFx0dGhpcy5yZXNvdXJjZUNvbnRleHQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlQ29udGV4dEtleSkpO1xuXHRcdFx0dGhpcy5oYW5kbGVHcm91cENvbnRleHRLZXlzKCk7XG5cblx0XHRcdC8vIFRpdGxlIGNvbnRhaW5lclxuXHRcdFx0dGhpcy50aXRsZUNvbnRhaW5lciA9ICQoJy50aXRsZScpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMudGl0bGVDb250YWluZXIpO1xuXG5cdFx0XHQvLyBUaXRsZSBjb250cm9sXG5cdFx0XHR0aGlzLnRpdGxlQ29udHJvbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yVGl0bGVDb250cm9sLCB0aGlzLnRpdGxlQ29udGFpbmVyLCB0aGlzLmVkaXRvclBhcnRzVmlldywgdGhpcy5ncm91cHNWaWV3LCB0aGlzLCB0aGlzLm1vZGVsLCB0aGlzLl9tZW51SWRzKSk7XG5cblx0XHRcdC8vIEhlYWRlciBjb250YWluZXIgKG9wdGlvbmFsLCBiZWxvdyB0aGUgdGFiIGJhcjsgZW1wdHkgYnkgZGVmYXVsdClcblx0XHRcdHRoaXMuaGVhZGVyQ29udGFpbmVyID0gJCgnLmVkaXRvci1ncm91cC1oZWFkZXInKTtcblx0XHRcdHRoaXMuaGVhZGVyQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcwcHgnO1xuXHRcdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuaGVhZGVyQ29udGFpbmVyKTtcblxuXHRcdFx0Ly8gRWRpdG9yIGNvbnRhaW5lclxuXHRcdFx0dGhpcy5lZGl0b3JDb250YWluZXIgPSAkKCcuZWRpdG9yLWNvbnRhaW5lcicpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuZWRpdG9yQ29udGFpbmVyKTtcblxuXHRcdFx0Ly8gRWRpdG9yIHBhbmVcblx0XHRcdHRoaXMuZWRpdG9yUGFuZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yUGFuZXMsIHRoaXMuZWxlbWVudCwgdGhpcy5lZGl0b3JDb250YWluZXIsIHRoaXMpKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmlucHV0ID0gdGhpcy5lZGl0b3JQYW5lLm9uRGlkQ2hhbmdlU2l6ZUNvbnN0cmFpbnRzO1xuXG5cdFx0XHQvLyBUcmFjayBGb2N1c1xuXHRcdFx0dGhpcy5kb1RyYWNrRm9jdXMoKTtcblxuXHRcdFx0Ly8gRWRpdG9yIGhlYWRlciAob3B0aW9uYWwgZnVsbC13aWR0aCB0b29sYmFycyBkZWNsYXJlZCBieSB0aGUgYWN0aXZlIGVkaXRvcilcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4gdGhpcy5fcmVuZGVyRWRpdG9ySGVhZGVyKCkpKTtcblxuXHRcdFx0Ly8gVXBkYXRlIGNvbnRhaW5lcnNcblx0XHRcdHRoaXMudXBkYXRlVGl0bGVDb250YWluZXIoKTtcblx0XHRcdHRoaXMudXBkYXRlQ29udGFpbmVyKCk7XG5cblx0XHRcdC8vIFVwZGF0ZSBzdHlsZXNcblx0XHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdFx0fVxuXHRcdC8vI2VuZHJlZ2lvblxuXG5cdFx0Ly8gUmVzdG9yZSBlZGl0b3JzIGlmIHByb3ZpZGVkXG5cdFx0Y29uc3QgcmVzdG9yZUVkaXRvcnNQcm9taXNlID0gdGhpcy5yZXN0b3JlRWRpdG9ycyhmcm9tLCBvcHRpb25zKSA/PyBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdC8vIFNpZ25hbCByZXN0b3JlZCBvbmNlIGVkaXRvcnMgaGF2ZSByZXN0b3JlZFxuXHRcdHJlc3RvcmVFZGl0b3JzUHJvbWlzZS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHRoaXMud2hlblJlc3RvcmVkUHJvbWlzZS5jb21wbGV0ZSgpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgTGlzdGVuZXJzXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVHcm91cENvbnRleHRLZXlzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwQWN0aXZlRWRpdG9yRGlydHlDb250ZXh0ID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuYmluZChBY3RpdmVFZGl0b3JEaXJ0eUNvbnRleHQsIHRoaXMpO1xuXHRcdGNvbnN0IGdyb3VwQWN0aXZlRWRpdG9yUGlubmVkQ29udGV4dCA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoQWN0aXZlRWRpdG9yUGlubmVkQ29udGV4dCwgdGhpcyk7XG5cdFx0Y29uc3QgZ3JvdXBBY3RpdmVFZGl0b3JGaXJzdENvbnRleHQgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKEFjdGl2ZUVkaXRvckZpcnN0SW5Hcm91cENvbnRleHQsIHRoaXMpO1xuXHRcdGNvbnN0IGdyb3VwQWN0aXZlRWRpdG9yTGFzdENvbnRleHQgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKEFjdGl2ZUVkaXRvckxhc3RJbkdyb3VwQ29udGV4dCwgdGhpcyk7XG5cdFx0Y29uc3QgZ3JvdXBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0ID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuYmluZChBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0LCB0aGlzKTtcblx0XHRjb25zdCBncm91cEVkaXRvcnNDb3VudENvbnRleHQgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKEVkaXRvckdyb3VwRWRpdG9yc0NvdW50Q29udGV4dCwgdGhpcyk7XG5cdFx0Y29uc3QgZ3JvdXBMb2NrZWRDb250ZXh0ID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuYmluZChBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQsIHRoaXMpO1xuXG5cdFx0Y29uc3QgbXVsdGlwbGVFZGl0b3JzU2VsZWN0ZWRDb250ZXh0ID0gTXVsdGlwbGVFZGl0b3JzU2VsZWN0ZWRJbkdyb3VwQ29udGV4dC5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgdHdvRWRpdG9yc1NlbGVjdGVkQ29udGV4dCA9IFR3b0VkaXRvcnNTZWxlY3RlZEluR3JvdXBDb250ZXh0LmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBzZWxlY3RlZEVkaXRvcnNIYXZlRmlsZU9yVW50aXRsZWRSZXNvdXJjZUNvbnRleHQgPSBTZWxlY3RlZEVkaXRvcnNJbkdyb3VwRmlsZU9yVW50aXRsZWRSZXNvdXJjZUNvbnRleHRLZXkuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZ3JvdXBBY3RpdmVFZGl0b3JDb250ZXh0ID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuYmluZChBY3RpdmVFZGl0b3JDb250ZXh0LCB0aGlzKTtcblx0XHRjb25zdCBncm91cEFjdGl2ZUVkaXRvcklzUmVhZG9ubHkgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKEFjdGl2ZUVkaXRvclJlYWRvbmx5Q29udGV4dCwgdGhpcyk7XG5cdFx0Y29uc3QgZ3JvdXBBY3RpdmVFZGl0b3JDYW5SZXZlcnQgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKEFjdGl2ZUVkaXRvckNhblJldmVydENvbnRleHQsIHRoaXMpO1xuXHRcdGNvbnN0IGdyb3VwQWN0aXZlRWRpdG9yQ2FuVG9nZ2xlUmVhZG9ubHkgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKEFjdGl2ZUVkaXRvckNhblRvZ2dsZVJlYWRvbmx5Q29udGV4dCwgdGhpcyk7XG5cdFx0Y29uc3QgZ3JvdXBBY3RpdmVDb21wYXJlRWRpdG9yQ2FuU3dhcCA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoQWN0aXZlQ29tcGFyZUVkaXRvckNhblN3YXBDb250ZXh0LCB0aGlzKTtcblx0XHRjb25zdCBncm91cFRleHRDb21wYXJlRWRpdG9yVmlzaWJsZUNvbnRleHQgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKFRleHRDb21wYXJlRWRpdG9yVmlzaWJsZUNvbnRleHQsIHRoaXMpO1xuXHRcdGNvbnN0IGdyb3VwVGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0ID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuYmluZChUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQsIHRoaXMpO1xuXG5cdFx0Y29uc3QgZ3JvdXBBY3RpdmVFZGl0b3JBdmFpbGFibGVFZGl0b3JJZHMgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKEFjdGl2ZUVkaXRvckF2YWlsYWJsZUVkaXRvcklkc0NvbnRleHQsIHRoaXMpO1xuXHRcdGNvbnN0IGdyb3VwQWN0aXZlRWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dCA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoQWN0aXZlRWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dCwgdGhpcyk7XG5cdFx0Y29uc3QgZ3JvdXBBY3RpdmVFZGl0b3JJc1NpZGVCeVNpZGVFZGl0b3JDb250ZXh0ID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuYmluZChTaWRlQnlTaWRlRWRpdG9yQWN0aXZlQ29udGV4dCwgdGhpcyk7XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRcdGNvbnN0IG9ic2VydmVBY3RpdmVFZGl0b3IgPSAoKSA9PiB7XG5cdFx0XHRhY3RpdmVFZGl0b3JMaXN0ZW5lci5jbGVhcigpO1xuXG5cdFx0XHR0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLmJ1ZmZlckNoYW5nZUV2ZW50cygoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IHRoaXMuYWN0aXZlRWRpdG9yO1xuXHRcdFx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gdGhpcy5hY3RpdmVFZGl0b3JQYW5lO1xuXG5cdFx0XHRcdHRoaXMucmVzb3VyY2VDb250ZXh0LnNldChFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGFjdGl2ZUVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pKTtcblxuXHRcdFx0XHRhcHBseUF2YWlsYWJsZUVkaXRvcklkcyhncm91cEFjdGl2ZUVkaXRvckF2YWlsYWJsZUVkaXRvcklkcywgYWN0aXZlRWRpdG9yLCB0aGlzLmVkaXRvclJlc29sdmVyU2VydmljZSk7XG5cblx0XHRcdFx0aWYgKGFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dC5zZXQoYWN0aXZlRWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuQ2FuU3BsaXRJbkdyb3VwKSk7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JJc1NpZGVCeVNpZGVFZGl0b3JDb250ZXh0LnNldChhY3RpdmVFZGl0b3IudHlwZUlkID09PSBTaWRlQnlTaWRlRWRpdG9ySW5wdXQuSUQpO1xuXG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JEaXJ0eUNvbnRleHQuc2V0KGFjdGl2ZUVkaXRvci5pc0RpcnR5KCkgJiYgIWFjdGl2ZUVkaXRvci5pc1NhdmluZygpKTtcblx0XHRcdFx0XHRhY3RpdmVFZGl0b3JMaXN0ZW5lci52YWx1ZSA9IGFjdGl2ZUVkaXRvci5vbkRpZENoYW5nZURpcnR5KCgpID0+IHtcblx0XHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9yRGlydHlDb250ZXh0LnNldChhY3RpdmVFZGl0b3IuaXNEaXJ0eSgpICYmICFhY3RpdmVFZGl0b3IuaXNTYXZpbmcoKSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JDYW5TcGxpdEluR3JvdXBDb250ZXh0LnNldChmYWxzZSk7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JJc1NpZGVCeVNpZGVFZGl0b3JDb250ZXh0LnNldChmYWxzZSk7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JEaXJ0eUNvbnRleHQuc2V0KGZhbHNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhY3RpdmVFZGl0b3JQYW5lKSB7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JDb250ZXh0LnNldChhY3RpdmVFZGl0b3JQYW5lLmdldElkKCkpO1xuXHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9yQ2FuUmV2ZXJ0LnNldCghYWN0aXZlRWRpdG9yUGFuZS5pbnB1dC5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkKSk7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JJc1JlYWRvbmx5LnNldCghIWFjdGl2ZUVkaXRvclBhbmUuaW5wdXQuaXNSZWFkb25seSgpKTtcblxuXHRcdFx0XHRcdGNvbnN0IHByaW1hcnlFZGl0b3JSZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdFx0XHRcdGNvbnN0IHNlY29uZGFyeUVkaXRvclJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShhY3RpdmVFZGl0b3JQYW5lLmlucHV0LCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlNFQ09OREFSWSB9KTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUNvbXBhcmVFZGl0b3JDYW5Td2FwLnNldChhY3RpdmVFZGl0b3JQYW5lLmlucHV0IGluc3RhbmNlb2YgRGlmZkVkaXRvcklucHV0ICYmICFhY3RpdmVFZGl0b3JQYW5lLmlucHV0Lm9yaWdpbmFsLmlzUmVhZG9ubHkoKSAmJiAhIXByaW1hcnlFZGl0b3JSZXNvdXJjZSAmJiAodGhpcy5maWxlU2VydmljZS5oYXNQcm92aWRlcihwcmltYXJ5RWRpdG9yUmVzb3VyY2UpIHx8IHByaW1hcnlFZGl0b3JSZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpICYmICEhc2Vjb25kYXJ5RWRpdG9yUmVzb3VyY2UgJiYgKHRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIoc2Vjb25kYXJ5RWRpdG9yUmVzb3VyY2UpIHx8IHNlY29uZGFyeUVkaXRvclJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCkpO1xuXHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9yQ2FuVG9nZ2xlUmVhZG9ubHkuc2V0KCEhcHJpbWFyeUVkaXRvclJlc291cmNlICYmIHRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIocHJpbWFyeUVkaXRvclJlc291cmNlKSAmJiAhdGhpcy5maWxlU2VydmljZS5oYXNDYXBhYmlsaXR5KHByaW1hcnlFZGl0b3JSZXNvdXJjZSwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlJlYWRvbmx5KSk7XG5cblx0XHRcdFx0XHRjb25zdCBhY3RpdmVQYW5lRGlmZkVkaXRvciA9IGFjdGl2ZUVkaXRvclBhbmU/LmdldElkKCkgPT09IFRFWFRfRElGRl9FRElUT1JfSUQ7XG5cdFx0XHRcdFx0Z3JvdXBUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQuc2V0KGFjdGl2ZVBhbmVEaWZmRWRpdG9yKTtcblx0XHRcdFx0XHRncm91cFRleHRDb21wYXJlRWRpdG9yVmlzaWJsZUNvbnRleHQuc2V0KGFjdGl2ZVBhbmVEaWZmRWRpdG9yKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvckNvbnRleHQucmVzZXQoKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvckNhblJldmVydC5yZXNldCgpO1xuXHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9ySXNSZWFkb25seS5yZXNldCgpO1xuXHRcdFx0XHRcdGdyb3VwQWN0aXZlQ29tcGFyZUVkaXRvckNhblN3YXAucmVzZXQoKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvckNhblRvZ2dsZVJlYWRvbmx5LnJlc2V0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHQvLyBVcGRhdGUgZ3JvdXAgY29udGV4dHMgYmFzZWQgb24gZ3JvdXAgY2hhbmdlc1xuXHRcdGNvbnN0IHVwZGF0ZUdyb3VwQ29udGV4dEtleXMgPSAoZTogSUdyb3VwTW9kZWxDaGFuZ2VFdmVudCkgPT4ge1xuXHRcdFx0c3dpdGNoIChlLmtpbmQpIHtcblx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5HUk9VUF9MT0NLRUQ6XG5cdFx0XHRcdFx0Z3JvdXBMb2NrZWRDb250ZXh0LnNldCh0aGlzLmlzTG9ja2VkKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQUNUSVZFOlxuXHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9yRmlyc3RDb250ZXh0LnNldCh0aGlzLm1vZGVsLmlzRmlyc3QodGhpcy5tb2RlbC5hY3RpdmVFZGl0b3IpKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvckxhc3RDb250ZXh0LnNldCh0aGlzLm1vZGVsLmlzTGFzdCh0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcikpO1xuXHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9yUGlubmVkQ29udGV4dC5zZXQodGhpcy5tb2RlbC5hY3RpdmVFZGl0b3IgPyB0aGlzLm1vZGVsLmlzUGlubmVkKHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yKSA6IGZhbHNlKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvclN0aWNreUNvbnRleHQuc2V0KHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yID8gdGhpcy5tb2RlbC5pc1N0aWNreSh0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcikgOiBmYWxzZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0NMT1NFOlxuXHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9yUGlubmVkQ29udGV4dC5zZXQodGhpcy5tb2RlbC5hY3RpdmVFZGl0b3IgPyB0aGlzLm1vZGVsLmlzUGlubmVkKHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yKSA6IGZhbHNlKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvclN0aWNreUNvbnRleHQuc2V0KHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yID8gdGhpcy5tb2RlbC5pc1N0aWNreSh0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcikgOiBmYWxzZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX09QRU46XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX01PVkU6XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JGaXJzdENvbnRleHQuc2V0KHRoaXMubW9kZWwuaXNGaXJzdCh0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcikpO1xuXHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9yTGFzdENvbnRleHQuc2V0KHRoaXMubW9kZWwuaXNMYXN0KHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1BJTjpcblx0XHRcdFx0XHRpZiAoZS5lZGl0b3IgJiYgZS5lZGl0b3IgPT09IHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvclBpbm5lZENvbnRleHQuc2V0KHRoaXMubW9kZWwuaXNQaW5uZWQodGhpcy5tb2RlbC5hY3RpdmVFZGl0b3IpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1NUSUNLWTpcblx0XHRcdFx0XHRpZiAoZS5lZGl0b3IgJiYgZS5lZGl0b3IgPT09IHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvclN0aWNreUNvbnRleHQuc2V0KHRoaXMubW9kZWwuaXNTdGlja3kodGhpcy5tb2RlbC5hY3RpdmVFZGl0b3IpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SU19TRUxFQ1RJT046XG5cdFx0XHRcdFx0bXVsdGlwbGVFZGl0b3JzU2VsZWN0ZWRDb250ZXh0LnNldCh0aGlzLm1vZGVsLnNlbGVjdGVkRWRpdG9ycy5sZW5ndGggPiAxKTtcblx0XHRcdFx0XHR0d29FZGl0b3JzU2VsZWN0ZWRDb250ZXh0LnNldCh0aGlzLm1vZGVsLnNlbGVjdGVkRWRpdG9ycy5sZW5ndGggPT09IDIpO1xuXHRcdFx0XHRcdHNlbGVjdGVkRWRpdG9yc0hhdmVGaWxlT3JVbnRpdGxlZFJlc291cmNlQ29udGV4dC5zZXQodGhpcy5tb2RlbC5zZWxlY3RlZEVkaXRvcnMuZXZlcnkoZSA9PiBlLnJlc291cmNlICYmICh0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKGUucmVzb3VyY2UpIHx8IGUucmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBHcm91cCBlZGl0b3JzIGNvdW50IGNvbnRleHRcblx0XHRcdGdyb3VwRWRpdG9yc0NvdW50Q29udGV4dC5zZXQodGhpcy5jb3VudCk7XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRNb2RlbENoYW5nZShlID0+IHVwZGF0ZUdyb3VwQ29udGV4dEtleXMoZSkpKTtcblxuXHRcdC8vIFRyYWNrIHRoZSBhY3RpdmUgZWRpdG9yIGFuZCB1cGRhdGUgY29udGV4dCBrZXkgdGhhdCByZWZsZWN0c1xuXHRcdC8vIHRoZSBkaXJ0eSBzdGF0ZSBvZiB0aGlzIGVkaXRvclxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4gb2JzZXJ2ZUFjdGl2ZUVkaXRvcigpKSk7XG5cblx0XHQvLyBVcGRhdGUgY29udGV4dCBrZXlzIG9uIHN0YXJ0dXBcblx0XHRvYnNlcnZlQWN0aXZlRWRpdG9yKCk7XG5cdFx0dXBkYXRlR3JvdXBDb250ZXh0S2V5cyh7IGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9BQ1RJVkUgfSk7XG5cdFx0dXBkYXRlR3JvdXBDb250ZXh0S2V5cyh7IGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0xPQ0tFRCB9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDb250YWluZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBPcGVuIG5ldyBmaWxlIHZpYSBkb3VibGVjbGljayBvbiBlbXB0eSBjb250YWluZXJcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBFdmVudFR5cGUuREJMQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNFbXB0eSkge1xuXHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdHBpbm5lZDogdHJ1ZSxcblx0XHRcdFx0XHRcdG92ZXJyaWRlOiBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgdGhpcy5pZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xvc2UgZW1wdHkgZWRpdG9yIGdyb3VwIHZpYSBtaWRkbGUgbW91c2UgY2xpY2tcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBFdmVudFR5cGUuQVVYQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNFbXB0eSAmJiBlLmJ1dHRvbiA9PT0gMSAvKiBNaWRkbGUgQnV0dG9uICovKSB7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cblx0XHRcdFx0dGhpcy5ncm91cHNWaWV3LnJlbW92ZUdyb3VwKHRoaXMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ29udGFpbmVyVG9vbGJhcigpOiB2b2lkIHtcblxuXHRcdC8vIFRvb2xiYXIgQ29udGFpbmVyXG5cdFx0Y29uc3QgdG9vbGJhckNvbnRhaW5lciA9ICQoJy5lZGl0b3ItZ3JvdXAtY29udGFpbmVyLXRvb2xiYXInKTtcblx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQodG9vbGJhckNvbnRhaW5lcik7XG5cblx0XHQvLyBUb29sYmFyXG5cdFx0Y29uc3QgY29udGFpbmVyVG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIodG9vbGJhckNvbnRhaW5lciwge1xuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnYXJpYUxhYmVsR3JvdXBBY3Rpb25zJywgXCJFbXB0eSBlZGl0b3IgZ3JvdXAgYWN0aW9uc1wiKSxcblx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdC8vIFRvb2xiYXIgYWN0aW9uc1xuXHRcdGNvbnN0IGNvbnRhaW5lclRvb2xiYXJNZW51ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5FbXB0eUVkaXRvckdyb3VwLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdXBkYXRlQ29udGFpbmVyVG9vbGJhciA9ICgpID0+IHtcblxuXHRcdFx0Ly8gQ2xlYXIgb2xkIGFjdGlvbnNcblx0XHRcdHRoaXMuY29udGFpbmVyVG9vbEJhck1lbnVEaXNwb3NhYmxlLnZhbHVlID0gdG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lclRvb2xiYXIuY2xlYXIoKSk7XG5cblx0XHRcdC8vIENyZWF0ZSBuZXcgYWN0aW9uc1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkJhckFjdGlvbnMoXG5cdFx0XHRcdGNvbnRhaW5lclRvb2xiYXJNZW51LmdldEFjdGlvbnMoeyBhcmc6IHsgZ3JvdXBJZDogdGhpcy5pZCB9LCBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KSxcblx0XHRcdFx0J25hdmlnYXRpb24nXG5cdFx0XHQpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBbLi4uYWN0aW9ucy5wcmltYXJ5LCAuLi5hY3Rpb25zLnNlY29uZGFyeV0pIHtcblx0XHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpO1xuXHRcdFx0XHRjb250YWluZXJUb29sYmFyLnB1c2goYWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSwga2V5YmluZGluZzoga2V5YmluZGluZz8uZ2V0TGFiZWwoKSB9KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHVwZGF0ZUNvbnRhaW5lclRvb2xiYXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb250YWluZXJUb29sYmFyTWVudS5vbkRpZENoYW5nZSh1cGRhdGVDb250YWluZXJUb29sYmFyKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvbnRhaW5lckNvbnRleHRNZW51KCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIEV2ZW50VHlwZS5DT05URVhUX01FTlUsIGUgPT4gdGhpcy5vblNob3dDb250YWluZXJDb250ZXh0TWVudShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIFRvdWNoRXZlbnRUeXBlLkNvbnRleHRtZW51LCAoKSA9PiB0aGlzLm9uU2hvd0NvbnRhaW5lckNvbnRleHRNZW51KCkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25TaG93Q29udGFpbmVyQ29udGV4dE1lbnUoZT86IE1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNFbXB0eSkge1xuXHRcdFx0cmV0dXJuOyAvLyBvbmx5IGZvciBlbXB0eSBlZGl0b3IgZ3JvdXBzXG5cdFx0fVxuXG5cdFx0Ly8gRmluZCB0YXJnZXQgYW5jaG9yXG5cdFx0bGV0IGFuY2hvcjogSFRNTEVsZW1lbnQgfCBTdGFuZGFyZE1vdXNlRXZlbnQgPSB0aGlzLmVsZW1lbnQ7XG5cdFx0aWYgKGUpIHtcblx0XHRcdGFuY2hvciA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0V2luZG93KHRoaXMuZWxlbWVudCksIGUpO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgaXRcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0bWVudUlkOiBNZW51SWQuRW1wdHlFZGl0b3JHcm91cENvbnRleHQsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogdGhpcy5jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdFx0b25IaWRlOiAoKSA9PiB0aGlzLmZvY3VzKClcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZG9UcmFja0ZvY3VzKCk6IHZvaWQge1xuXG5cdFx0Ly8gQ29udGFpbmVyXG5cdFx0Y29uc3QgY29udGFpbmVyRm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIodHJhY2tGb2N1cyh0aGlzLmVsZW1lbnQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb250YWluZXJGb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc0VtcHR5KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpOyAvLyBvbmx5IHdoZW4gZW1wdHkgdG8gcHJldmVudCBkdXBsaWNhdGUgZXZlbnRzIGZyb20gYGVkaXRvclBhbmUub25EaWRGb2N1c2Bcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBUaXRsZSBDb250YWluZXJcblx0XHRjb25zdCBoYW5kbGVUaXRsZUNsaWNrT3JUb3VjaCA9IChlOiBNb3VzZUV2ZW50IHwgR2VzdHVyZUV2ZW50KTogdm9pZCA9PiB7XG5cdFx0XHRsZXQgdGFyZ2V0OiBIVE1MRWxlbWVudDtcblx0XHRcdGlmIChpc01vdXNlRXZlbnQoZSkpIHtcblx0XHRcdFx0aWYgKGUuYnV0dG9uICE9PSAwIC8qIG1pZGRsZS9yaWdodCBtb3VzZSBidXR0b24gKi8gfHwgKGlzTWFjaW50b3NoICYmIGUuY3RybEtleSAvKiBtYWNPUyBjb250ZXh0IG1lbnUgKi8pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGFyZ2V0ID0gKGUgYXMgR2VzdHVyZUV2ZW50KS5pbml0aWFsVGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZmluZFBhcmVudFdpdGhDbGFzcyh0YXJnZXQsICdtb25hY28tYWN0aW9uLWJhcicsIHRoaXMudGl0bGVDb250YWluZXIpIHx8XG5cdFx0XHRcdGZpbmRQYXJlbnRXaXRoQ2xhc3ModGFyZ2V0LCAnbW9uYWNvLWJyZWFkY3J1bWItaXRlbScsIHRoaXMudGl0bGVDb250YWluZXIpXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBub3Qgd2hlbiBjbGlja2luZyBvbiBhY3Rpb25zIG9yIGJyZWFkY3J1bWJzXG5cdFx0XHR9XG5cblx0XHRcdC8vIHRpbWVvdXQgdG8ga2VlcCBmb2N1cyBpbiBlZGl0b3IgYWZ0ZXIgbW91c2UgdXBcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMudGl0bGVDb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlID0+IGhhbmRsZVRpdGxlQ2xpY2tPclRvdWNoKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMudGl0bGVDb250YWluZXIsIFRvdWNoRXZlbnRUeXBlLlRhcCwgZSA9PiBoYW5kbGVUaXRsZUNsaWNrT3JUb3VjaChlKSkpO1xuXG5cdFx0Ly8gRWRpdG9yIHBhbmVcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclBhbmUub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZEZvY3VzLmZpcmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbnRhaW5lcigpOiB2b2lkIHtcblxuXHRcdC8vIEVtcHR5IENvbnRhaW5lcjogYWRkIHNvbWUgZW1wdHkgY29udGFpbmVyIGF0dHJpYnV0ZXNcblx0XHRpZiAodGhpcy5pc0VtcHR5KSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZW1wdHknKTtcblx0XHRcdHRoaXMuZWxlbWVudC50YWJJbmRleCA9IDA7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2VtcHR5RWRpdG9yR3JvdXAnLCBcInswfSAoZW1wdHkpXCIsIHRoaXMuYXJpYUxhYmVsKSk7XG5cdFx0fVxuXG5cdFx0Ly8gTm9uLUVtcHR5IENvbnRhaW5lcjogcmV2ZXJ0IGVtcHR5IGNvbnRhaW5lciBhdHRyaWJ1dGVzXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZW1wdHknKTtcblx0XHRcdHRoaXMuZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ3RhYkluZGV4Jyk7XG5cdFx0XHR0aGlzLmVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHN0eWxlc1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRpdGxlQ29udGFpbmVyKCk6IHZvaWQge1xuXHRcdHRoaXMudGl0bGVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgndGFicycsIHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5zaG93VGFicyA9PT0gJ211bHRpcGxlJyk7XG5cdFx0dGhpcy50aXRsZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzaG93LWZpbGUtaWNvbnMnLCB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMuc2hvd0ljb25zKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzdG9yZUVkaXRvcnMoZnJvbTogSUVkaXRvckdyb3VwVmlldyB8IElTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbCB8IG51bGwsIGdyb3VwVmlld09wdGlvbnM/OiBJRWRpdG9yR3JvdXBWaWV3T3B0aW9ucyk6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmNvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vdGhpbmcgdG8gc2hvd1xuXHRcdH1cblxuXHRcdC8vIERldGVybWluZSBlZGl0b3Igb3B0aW9uc1xuXHRcdGxldCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucztcblx0XHRpZiAoZnJvbSBpbnN0YW5jZW9mIEVkaXRvckdyb3VwVmlldykge1xuXHRcdFx0b3B0aW9ucyA9IGZpbGxBY3RpdmVFZGl0b3JWaWV3U3RhdGUoZnJvbSk7IC8vIGlmIHdlIGNvcHkgZnJvbSBhbm90aGVyIGdyb3VwLCBlbnN1cmUgdG8gY29weSBpdHMgYWN0aXZlIGVkaXRvciB2aWV3c3RhdGVcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3B0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5tb2RlbC5hY3RpdmVFZGl0b3I7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRvcHRpb25zLnBpbm5lZCA9IHRoaXMubW9kZWwuaXNQaW5uZWQoYWN0aXZlRWRpdG9yKTtcdC8vIHByZXNlcnZlIHBpbm5lZCBzdGF0ZVxuXHRcdG9wdGlvbnMuc3RpY2t5ID0gdGhpcy5tb2RlbC5pc1N0aWNreShhY3RpdmVFZGl0b3IpO1x0Ly8gcHJlc2VydmUgc3RpY2t5IHN0YXRlXG5cdFx0b3B0aW9ucy5wcmVzZXJ2ZUZvY3VzID0gdHJ1ZTtcdFx0XHRcdFx0XHQvLyBoYW5kbGUgZm9jdXMgYWZ0ZXIgZWRpdG9yIGlzIHJlc3RvcmVkXG5cblx0XHRjb25zdCBpbnRlcm5hbE9wdGlvbnM6IElJbnRlcm5hbEVkaXRvck9wZW5PcHRpb25zID0ge1xuXHRcdFx0cHJlc2VydmVXaW5kb3dPcmRlcjogdHJ1ZSxcdFx0XHRcdFx0XHQvLyBoYW5kbGUgd2luZG93IG9yZGVyIGFmdGVyIGVkaXRvciBpcyByZXN0b3JlZFxuXHRcdFx0c2tpcFRpdGxlVXBkYXRlOiB0cnVlLFx0XHRcdFx0XHRcdFx0Ly8gdXBkYXRlIHRoZSB0aXRsZSBsYXRlciBmb3IgYWxsIGVkaXRvcnMgYXQgb25jZVxuXHRcdH07XG5cblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpO1xuXG5cdFx0Ly8gU2hvdyBhY3RpdmUgZWRpdG9yIChpbnRlbnRpb25hbGx5IG5vdCB1c2luZyBhc3luYyB0byBrZWVwXG5cdFx0Ly8gYHJlc3RvcmVFZGl0b3JzYCBmcm9tIGV4ZWN1dGluZyBpbiBzYW1lIHN0YWNrKVxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuZG9TaG93RWRpdG9yKGFjdGl2ZUVkaXRvciwgeyBhY3RpdmU6IHRydWUsIGlzTmV3OiBmYWxzZSAvKiByZXN0b3JlZCAqLyB9LCBvcHRpb25zLCBpbnRlcm5hbE9wdGlvbnMpLnRoZW4oKCkgPT4ge1xuXG5cdFx0XHQvLyBTZXQgZm9jdXNlZCBub3cgaWYgdGhpcyBpcyB0aGUgYWN0aXZlIGdyb3VwIGFuZCBmb2N1cyBoYXNcblx0XHRcdC8vIG5vdCBjaGFuZ2VkIG1lYW53aGlsZS4gVGhpcyBwcmV2ZW50cyBmb2N1cyBmcm9tIGJlaW5nXG5cdFx0XHQvLyBzdG9sZW4gYWNjaWRlbnRhbGx5IG9uIHN0YXJ0dXAgd2hlbiB0aGUgdXNlciBhbHJlYWR5XG5cdFx0XHQvLyBjbGlja2VkIHNvbWV3aGVyZS5cblxuXHRcdFx0aWYgKHRoaXMuZ3JvdXBzVmlldy5hY3RpdmVHcm91cCA9PT0gdGhpcyAmJiBhY3RpdmVFbGVtZW50ICYmIGlzQWN0aXZlRWxlbWVudChhY3RpdmVFbGVtZW50KSAmJiAhZ3JvdXBWaWV3T3B0aW9ucz8ucHJlc2VydmVGb2N1cykge1xuXHRcdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBSZXN0b3JlIGVkaXRvcnMgaW4gdGl0bGUgY29udHJvbFxuXHRcdHRoaXMudGl0bGVDb250cm9sLm9wZW5FZGl0b3JzKHRoaXMuZWRpdG9ycyk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Ly8jcmVnaW9uIGV2ZW50IGhhbmRsaW5nXG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIE1vZGVsIEV2ZW50c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWwub25EaWRNb2RlbENoYW5nZShlID0+IHRoaXMub25EaWRHcm91cE1vZGVsQ2hhbmdlKGUpKSk7XG5cblx0XHQvLyBPcHRpb24gQ2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZ3JvdXBzVmlldy5vbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zKGUgPT4gdGhpcy5vbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zKGUpKSk7XG5cblx0XHQvLyBWaXNpYmlsaXR5XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ncm91cHNWaWV3Lm9uRGlkVmlzaWJpbGl0eUNoYW5nZShlID0+IHRoaXMub25EaWRWaXNpYmlsaXR5Q2hhbmdlKGUpKSk7XG5cblx0XHQvLyBGb2N1c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRGb2N1cygoKSA9PiB0aGlzLm9uRGlkR2FpbkZvY3VzKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRHcm91cE1vZGVsQ2hhbmdlKGU6IElHcm91cE1vZGVsQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblxuXHRcdC8vIFJlLWVtaXQgdG8gb3V0c2lkZVxuXHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShlKTtcblxuXHRcdC8vIEhhbmRsZSB3aXRoaW5cblxuXHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0xPQ0tFRDpcblx0XHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2xvY2tlZCcsIHRoaXMuaXNMb2NrZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SU19TRUxFQ1RJT046XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VFZGl0b3JTZWxlY3Rpb24oKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKCFlLmVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9PUEVOOlxuXHRcdFx0XHRpZiAoaXNHcm91cEVkaXRvck9wZW5FdmVudChlKSkge1xuXHRcdFx0XHRcdHRoaXMub25EaWRPcGVuRWRpdG9yKGUuZWRpdG9yLCBlLmVkaXRvckluZGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0NMT1NFOlxuXHRcdFx0XHRpZiAoaXNHcm91cEVkaXRvckNsb3NlRXZlbnQoZSkpIHtcblx0XHRcdFx0XHR0aGlzLmhhbmRsZU9uRGlkQ2xvc2VFZGl0b3IoZS5lZGl0b3IsIGUuZWRpdG9ySW5kZXgsIGUuY29udGV4dCwgZS5zdGlja3kpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfV0lMTF9ESVNQT1NFOlxuXHRcdFx0XHR0aGlzLm9uV2lsbERpc3Bvc2VFZGl0b3IoZS5lZGl0b3IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0RJUlRZOlxuXHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRWRpdG9yRGlydHkoZS5lZGl0b3IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1RSQU5TSUVOVDpcblx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZUVkaXRvclRyYW5zaWVudChlLmVkaXRvcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfTEFCRUw6XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VFZGl0b3JMYWJlbChlLmVkaXRvcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRPcGVuRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIGVkaXRvckluZGV4OiBudW1iZXIpOiB2b2lkIHtcblxuXHRcdC8qIF9fR0RQUl9fXG5cdFx0XHRcImVkaXRvck9wZW5lZFwiIDoge1xuXHRcdFx0XHRcIm93bmVyXCI6IFwiaXNpZG9yblwiLFxuXHRcdFx0XHRcIiR7aW5jbHVkZX1cIjogW1xuXHRcdFx0XHRcdFwiJHtFZGl0b3JUZWxlbWV0cnlEZXNjcmlwdG9yfVwiXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHQqL1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2coJ2VkaXRvck9wZW5lZCcsIHRoaXMudG9FZGl0b3JUZWxlbWV0cnlEZXNjcmlwdG9yKGVkaXRvcikpO1xuXG5cdFx0Ly8gVXBkYXRlIGNvbnRhaW5lclxuXHRcdHRoaXMudXBkYXRlQ29udGFpbmVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZU9uRGlkQ2xvc2VFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCwgZWRpdG9ySW5kZXg6IG51bWJlciwgY29udGV4dDogRWRpdG9yQ2xvc2VDb250ZXh0LCBzdGlja3k6IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdC8vIEJlZm9yZSBjbG9zZVxuXHRcdHRoaXMuX29uV2lsbENsb3NlRWRpdG9yLmZpcmUoeyBncm91cElkOiB0aGlzLmlkLCBlZGl0b3IsIGNvbnRleHQsIGluZGV4OiBlZGl0b3JJbmRleCwgc3RpY2t5IH0pO1xuXG5cdFx0Ly8gSGFuZGxlIGV2ZW50XG5cdFx0Y29uc3QgZWRpdG9yc1RvQ2xvc2U6IEVkaXRvcklucHV0W10gPSBbZWRpdG9yXTtcblxuXHRcdC8vIEluY2x1ZGUgYm90aCBzaWRlcyBvZiBzaWRlIGJ5IHNpZGUgZWRpdG9ycyB3aGVuIGJlaW5nIGNsb3NlZFxuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQpIHtcblx0XHRcdGVkaXRvcnNUb0Nsb3NlLnB1c2goZWRpdG9yLnByaW1hcnksIGVkaXRvci5zZWNvbmRhcnkpO1xuXHRcdH1cblxuXHRcdC8vIEZvciBlYWNoIGVkaXRvciB0byBjbG9zZSwgd2UgY2FsbCBkaXNwb3NlKCkgdG8gZnJlZSB1cCBhbnkgcmVzb3VyY2VzLlxuXHRcdC8vIEhvd2V2ZXIsIGNlcnRhaW4gZWRpdG9ycyBtaWdodCBiZSBzaGFyZWQgYWNyb3NzIG11bHRpcGxlIGVkaXRvciBncm91cHNcblx0XHQvLyAoaW5jbHVkaW5nIGJlaW5nIHZpc2libGUgaW4gc2lkZSBieSBzaWRlIC8gZGlmZiBlZGl0b3JzKSBhbmQgYXMgc3VjaCB3ZVxuXHRcdC8vIG9ubHkgZGlzcG9zZSB3aGVuIHRoZXkgYXJlIG5vdCBvcGVuZWQgZWxzZXdoZXJlLlxuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnNUb0Nsb3NlKSB7XG5cdFx0XHRpZiAodGhpcy5jYW5EaXNwb3NlKGVkaXRvcikpIHtcblx0XHRcdFx0ZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgY29udGFpbmVyXG5cdFx0dGhpcy51cGRhdGVDb250YWluZXIoKTtcblxuXHRcdC8vIEV2ZW50XG5cdFx0dGhpcy5fb25EaWRDbG9zZUVkaXRvci5maXJlKHsgZ3JvdXBJZDogdGhpcy5pZCwgZWRpdG9yLCBjb250ZXh0LCBpbmRleDogZWRpdG9ySW5kZXgsIHN0aWNreSB9KTtcblx0fVxuXG5cdHByaXZhdGUgY2FuRGlzcG9zZShlZGl0b3I6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBncm91cFZpZXcgb2YgdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuZ3JvdXBzKSB7XG5cdFx0XHRpZiAoZ3JvdXBWaWV3IGluc3RhbmNlb2YgRWRpdG9yR3JvdXBWaWV3ICYmIGdyb3VwVmlldy5tb2RlbC5jb250YWlucyhlZGl0b3IsIHtcblx0XHRcdFx0c3RyaWN0RXF1YWxzOiB0cnVlLFx0XHRcdFx0XHRcdC8vIG9ubHkgaWYgdGhpcyBpbnB1dCBpcyBub3Qgc2hhcmVkIGFjcm9zcyBlZGl0b3IgZ3JvdXBzXG5cdFx0XHRcdHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkFOWSAvLyBpbmNsdWRlIGFueSBzaWRlIG9mIGFuIG9wZW5lZCBzaWRlIGJ5IHNpZGUgZWRpdG9yXG5cdFx0XHR9KSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHRvUmVzb3VyY2VUZWxlbWV0cnlEZXNjcmlwdG9yKHJlc291cmNlOiBVUkkpOiBvYmplY3QgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGF0aCA9IHJlc291cmNlID8gcmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgPyByZXNvdXJjZS5mc1BhdGggOiByZXNvdXJjZS5wYXRoIDogdW5kZWZpbmVkO1xuXHRcdGlmICghcGF0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgcXVlcnkgcGFyYW1ldGVycyBmcm9tIHRoZSByZXNvdXJjZSBleHRlbnNpb25cblx0XHRsZXQgcmVzb3VyY2VFeHQgPSBleHRuYW1lKHJlc291cmNlKTtcblx0XHRjb25zdCBxdWVyeVN0cmluZ0xvY2F0aW9uID0gcmVzb3VyY2VFeHQuaW5kZXhPZignPycpO1xuXHRcdHJlc291cmNlRXh0ID0gcXVlcnlTdHJpbmdMb2NhdGlvbiAhPT0gLTEgPyByZXNvdXJjZUV4dC5zdWJzdHIoMCwgcXVlcnlTdHJpbmdMb2NhdGlvbikgOiByZXNvdXJjZUV4dDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRtaW1lVHlwZTogbmV3IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZShnZXRNaW1lVHlwZXMocmVzb3VyY2UpLmpvaW4oJywgJykpLFxuXHRcdFx0c2NoZW1lOiByZXNvdXJjZS5zY2hlbWUsXG5cdFx0XHRleHQ6IHJlc291cmNlRXh0LFxuXHRcdFx0cGF0aDogaGFzaChwYXRoKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHRvRWRpdG9yVGVsZW1ldHJ5RGVzY3JpcHRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogSVRlbGVtZXRyeURhdGEge1xuXHRcdGNvbnN0IGRlc2NyaXB0b3IgPSBlZGl0b3IuZ2V0VGVsZW1ldHJ5RGVzY3JpcHRvcigpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5CT1RIIH0pO1xuXHRcdGlmIChVUkkuaXNVcmkocmVzb3VyY2UpKSB7XG5cdFx0XHRkZXNjcmlwdG9yWydyZXNvdXJjZSddID0gdGhpcy50b1Jlc291cmNlVGVsZW1ldHJ5RGVzY3JpcHRvcihyZXNvdXJjZSk7XG5cblx0XHRcdC8qIF9fR0RQUl9fRlJBR01FTlRfX1xuXHRcdFx0XHRcIkVkaXRvclRlbGVtZXRyeURlc2NyaXB0b3JcIiA6IHtcblx0XHRcdFx0XHRcInJlc291cmNlXCI6IHsgXCIke2lubGluZX1cIjogWyBcIiR7VVJJRGVzY3JpcHRvcn1cIiBdIH1cblx0XHRcdFx0fVxuXHRcdFx0Ki9cblx0XHRcdHJldHVybiBkZXNjcmlwdG9yO1xuXHRcdH0gZWxzZSBpZiAocmVzb3VyY2UpIHtcblx0XHRcdGlmIChyZXNvdXJjZS5wcmltYXJ5KSB7XG5cdFx0XHRcdGRlc2NyaXB0b3JbJ3Jlc291cmNlJ10gPSB0aGlzLnRvUmVzb3VyY2VUZWxlbWV0cnlEZXNjcmlwdG9yKHJlc291cmNlLnByaW1hcnkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc291cmNlLnNlY29uZGFyeSkge1xuXHRcdFx0XHRkZXNjcmlwdG9yWydyZXNvdXJjZVNlY29uZGFyeSddID0gdGhpcy50b1Jlc291cmNlVGVsZW1ldHJ5RGVzY3JpcHRvcihyZXNvdXJjZS5zZWNvbmRhcnkpO1xuXHRcdFx0fVxuXHRcdFx0LyogX19HRFBSX19GUkFHTUVOVF9fXG5cdFx0XHRcdFwiRWRpdG9yVGVsZW1ldHJ5RGVzY3JpcHRvclwiIDoge1xuXHRcdFx0XHRcdFwicmVzb3VyY2VcIjogeyBcIiR7aW5saW5lfVwiOiBbIFwiJHtVUklEZXNjcmlwdG9yfVwiIF0gfSxcblx0XHRcdFx0XHRcInJlc291cmNlU2Vjb25kYXJ5XCI6IHsgXCIke2lubGluZX1cIjogWyBcIiR7VVJJRGVzY3JpcHRvcn1cIiBdIH1cblx0XHRcdFx0fVxuXHRcdFx0Ki9cblx0XHRcdHJldHVybiBkZXNjcmlwdG9yO1xuXHRcdH1cblxuXHRcdHJldHVybiBkZXNjcmlwdG9yO1xuXHR9XG5cblx0cHJpdmF0ZSBvbldpbGxEaXNwb3NlRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblxuXHRcdC8vIFRvIHByZXZlbnQgcmFjZSBjb25kaXRpb25zLCB3ZSBoYW5kbGUgZGlzcG9zZWQgZWRpdG9ycyBpbiBvdXIgd29ya2VyIHdpdGggYSB0aW1lb3V0XG5cdFx0Ly8gYmVjYXVzZSBpdCBjYW4gaGFwcGVuIHRoYXQgYW4gaW5wdXQgaXMgYmVpbmcgZGlzcG9zZWQgd2l0aCB0aGUgaW50ZW50IHRvIHJlcGxhY2Vcblx0XHQvLyBpdCB3aXRoIHNvbWUgb3RoZXIgaW5wdXQgcmlnaHQgYWZ0ZXIuXG5cdFx0dGhpcy5kaXNwb3NlZEVkaXRvcnNXb3JrZXIud29yayhlZGl0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVEaXNwb3NlZEVkaXRvcnMoZGlzcG9zZWRFZGl0b3JzOiBFZGl0b3JJbnB1dFtdKTogdm9pZCB7XG5cblx0XHQvLyBTcGxpdCBiZXR3ZWVuIHZpc2libGUgYW5kIGhpZGRlbiBlZGl0b3JzXG5cdFx0bGV0IGFjdGl2ZUVkaXRvcjogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaW5hY3RpdmVFZGl0b3JzOiBFZGl0b3JJbnB1dFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBkaXNwb3NlZEVkaXRvciBvZiBkaXNwb3NlZEVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IGVkaXRvckZpbmRSZXN1bHQgPSB0aGlzLm1vZGVsLmZpbmRFZGl0b3IoZGlzcG9zZWRFZGl0b3IpO1xuXHRcdFx0aWYgKCFlZGl0b3JGaW5kUmVzdWx0KSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBub3QgcGFydCBvZiB0aGUgbW9kZWwgYW55bW9yZVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlZGl0b3IgPSBlZGl0b3JGaW5kUmVzdWx0WzBdO1xuXHRcdFx0aWYgKCFlZGl0b3IuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBlZGl0b3IgZ290IHJlb3BlbmVkIG1lYW53aGlsZVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5tb2RlbC5pc0FjdGl2ZShlZGl0b3IpKSB7XG5cdFx0XHRcdGFjdGl2ZUVkaXRvciA9IGVkaXRvcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGluYWN0aXZlRWRpdG9ycy5wdXNoKGVkaXRvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvc2UgYWxsIGluYWN0aXZlIGVkaXRvcnMgZmlyc3QgdG8gcHJldmVudCBVSSBmbGlja2VyXG5cdFx0Zm9yIChjb25zdCBpbmFjdGl2ZUVkaXRvciBvZiBpbmFjdGl2ZUVkaXRvcnMpIHtcblx0XHRcdHRoaXMuZG9DbG9zZUVkaXRvcihpbmFjdGl2ZUVkaXRvciwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvc2UgYWN0aXZlIG9uZSBsYXN0XG5cdFx0aWYgKGFjdGl2ZUVkaXRvcikge1xuXHRcdFx0dGhpcy5kb0Nsb3NlRWRpdG9yKGFjdGl2ZUVkaXRvciwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zKGV2ZW50OiBJRWRpdG9yUGFydE9wdGlvbnNDaGFuZ2VFdmVudCk6IHZvaWQge1xuXG5cdFx0Ly8gVGl0bGUgY29udGFpbmVyXG5cdFx0dGhpcy51cGRhdGVUaXRsZUNvbnRhaW5lcigpO1xuXG5cdFx0Ly8gVGl0bGUgY29udHJvbFxuXHRcdHRoaXMudGl0bGVDb250cm9sLnVwZGF0ZU9wdGlvbnMoZXZlbnQub2xkUGFydE9wdGlvbnMsIGV2ZW50Lm5ld1BhcnRPcHRpb25zKTtcblxuXHRcdC8vIFRpdGxlIGNvbnRyb2wgc3dpdGNoIGJldHdlZW4gc2luZ2xlRWRpdG9yVGFicywgbXVsdGlFZGl0b3JUYWJzIGFuZCBtdWx0aVJvd0VkaXRvclRhYnNcblx0XHRpZiAoXG5cdFx0XHRldmVudC5vbGRQYXJ0T3B0aW9ucy5zaG93VGFicyAhPT0gZXZlbnQubmV3UGFydE9wdGlvbnMuc2hvd1RhYnMgfHxcblx0XHRcdGV2ZW50Lm9sZFBhcnRPcHRpb25zLnRhYkhlaWdodCAhPT0gZXZlbnQubmV3UGFydE9wdGlvbnMudGFiSGVpZ2h0IHx8XG5cdFx0XHQoZXZlbnQub2xkUGFydE9wdGlvbnMuc2hvd1RhYnMgPT09ICdtdWx0aXBsZScgJiYgZXZlbnQub2xkUGFydE9wdGlvbnMucGlubmVkVGFic09uU2VwYXJhdGVSb3cgIT09IGV2ZW50Lm5ld1BhcnRPcHRpb25zLnBpbm5lZFRhYnNPblNlcGFyYXRlUm93KVxuXHRcdCkge1xuXG5cdFx0XHQvLyBSZS1sYXlvdXRcblx0XHRcdHRoaXMucmVsYXlvdXQoKTtcblxuXHRcdFx0Ly8gRW5zdXJlIHRvIHNob3cgYWN0aXZlIGVkaXRvciBpZiBhbnlcblx0XHRcdGlmICh0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHR0aGlzLnRpdGxlQ29udHJvbC5vcGVuRWRpdG9ycyh0aGlzLm1vZGVsLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTdHlsZXNcblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXG5cdFx0Ly8gUGluIHByZXZpZXcgZWRpdG9yIG9uY2UgdXNlciBkaXNhYmxlcyBwcmV2aWV3XG5cdFx0aWYgKGV2ZW50Lm9sZFBhcnRPcHRpb25zLmVuYWJsZVByZXZpZXcgJiYgIWV2ZW50Lm5ld1BhcnRPcHRpb25zLmVuYWJsZVByZXZpZXcpIHtcblx0XHRcdGlmICh0aGlzLm1vZGVsLnByZXZpZXdFZGl0b3IpIHtcblx0XHRcdFx0dGhpcy5waW5FZGl0b3IodGhpcy5tb2RlbC5wcmV2aWV3RWRpdG9yKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlRWRpdG9yRGlydHkoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXG5cdFx0Ly8gQWx3YXlzIHNob3cgZGlydHkgZWRpdG9ycyBwaW5uZWRcblx0XHR0aGlzLnBpbkVkaXRvcihlZGl0b3IpO1xuXG5cdFx0Ly8gRm9yd2FyZCB0byB0aXRsZSBjb250cm9sXG5cdFx0dGhpcy50aXRsZUNvbnRyb2wudXBkYXRlRWRpdG9yRGlydHkoZWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VFZGl0b3JUcmFuc2llbnQoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdGNvbnN0IHRyYW5zaWVudCA9IHRoaXMubW9kZWwuaXNUcmFuc2llbnQoZWRpdG9yKTtcblxuXHRcdC8vIFRyYW5zaWVudCBzdGF0ZSBvdmVycmlkZXMgdGhlIGBlbmFibGVQcmV2aWV3YCBzZXR0aW5nLFxuXHRcdC8vIHNvIHdoZW4gYW4gZWRpdG9yIGxlYXZlcyB0aGUgdHJhbnNpZW50IHN0YXRlLCB3ZSBoYXZlXG5cdFx0Ly8gdG8gZW5zdXJlIGl0cyBwcmV2aWV3IHN0YXRlIGlzIGFsc28gY2xlYXJlZC5cblx0XHRpZiAoIXRyYW5zaWVudCAmJiAhdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLmVuYWJsZVByZXZpZXcpIHtcblx0XHRcdHRoaXMucGluRWRpdG9yKGVkaXRvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUVkaXRvckxhYmVsKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblxuXHRcdC8vIEZvcndhcmQgdG8gdGl0bGUgY29udHJvbFxuXHRcdHRoaXMudGl0bGVDb250cm9sLnVwZGF0ZUVkaXRvckxhYmVsKGVkaXRvcik7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlRWRpdG9yU2VsZWN0aW9uKCk6IHZvaWQge1xuXG5cdFx0Ly8gRm9yd2FyZCB0byB0aXRsZSBjb250cm9sXG5cdFx0dGhpcy50aXRsZUNvbnRyb2wudXBkYXRlRWRpdG9yU2VsZWN0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFZpc2liaWxpdHlDaGFuZ2UodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXG5cdFx0Ly8gRm9yd2FyZCB0byBhY3RpdmUgZWRpdG9yIHBhbmVcblx0XHR0aGlzLmVkaXRvclBhbmUuc2V0VmlzaWJsZSh2aXNpYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRHYWluRm9jdXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYWN0aXZlRWRpdG9yKSB7XG5cblx0XHRcdC8vIFdlIGFnZ3Jlc3NpdmVseSBjbGVhciB0aGUgdHJhbnNpZW50IHN0YXRlIG9mIGVkaXRvcnNcblx0XHRcdC8vIGFzIHNvb24gYXMgdGhlIGdyb3VwIGdhaW5zIGZvY3VzLiBUaGlzIGlzIHRvIGVuc3VyZVxuXHRcdFx0Ly8gdGhhdCB0aGUgdHJhbnNpZW50IHN0YXRlIGlzIG5vdCBzdGF5aW5nIGFyb3VuZCB3aGVuXG5cdFx0XHQvLyB0aGUgdXNlciBpbnRlcmFjdHMgd2l0aCB0aGUgZWRpdG9yLlxuXG5cdFx0XHR0aGlzLm1vZGVsLnNldFRyYW5zaWVudCh0aGlzLmFjdGl2ZUVkaXRvciwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBJRWRpdG9yR3JvdXBWaWV3XG5cblx0Z2V0IGluZGV4KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2luZGV4O1xuXHR9XG5cblx0Z2V0IGxhYmVsKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuZ3JvdXBzTGFiZWwpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnZ3JvdXBMYWJlbExvbmcnLCBcInswfTogR3JvdXAgezF9XCIsIHRoaXMuZ3JvdXBzTGFiZWwsIHRoaXMuX2luZGV4ICsgMSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxvY2FsaXplKCdncm91cExhYmVsJywgXCJHcm91cCB7MH1cIiwgdGhpcy5faW5kZXggKyAxKTtcblx0fVxuXG5cdGdldCBhcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5ncm91cHNMYWJlbCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdncm91cEFyaWFMYWJlbExvbmcnLCBcInswfTogRWRpdG9yIEdyb3VwIHsxfVwiLCB0aGlzLmdyb3Vwc0xhYmVsLCB0aGlzLl9pbmRleCArIDEpO1xuXHRcdH1cblxuXHRcdHJldHVybiBsb2NhbGl6ZSgnZ3JvdXBBcmlhTGFiZWwnLCBcIkVkaXRvciBHcm91cCB7MH1cIiwgdGhpcy5faW5kZXggKyAxKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VkID0gZmFsc2U7XG5cdGdldCBkaXNwb3NlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZGlzcG9zZWQ7XG5cdH1cblxuXHRnZXQgaXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb3VudCA9PT0gMDtcblx0fVxuXG5cdGdldCB0aXRsZUhlaWdodCgpOiBJRWRpdG9yR3JvdXBUaXRsZUhlaWdodCB7XG5cdFx0cmV0dXJuIHRoaXMudGl0bGVDb250cm9sLmdldEhlaWdodCgpO1xuXHR9XG5cblx0bm90aWZ5SW5kZXhDaGFuZ2VkKG5ld0luZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faW5kZXggIT09IG5ld0luZGV4KSB7XG5cdFx0XHR0aGlzLl9pbmRleCA9IG5ld0luZGV4O1xuXHRcdFx0dGhpcy5tb2RlbC5zZXRJbmRleChuZXdJbmRleCk7XG5cdFx0fVxuXHR9XG5cblx0bm90aWZ5TGFiZWxDaGFuZ2VkKG5ld0xhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5ncm91cHNMYWJlbCAhPT0gbmV3TGFiZWwpIHtcblx0XHRcdHRoaXMuZ3JvdXBzTGFiZWwgPSBuZXdMYWJlbDtcblx0XHRcdHRoaXMubW9kZWwuc2V0TGFiZWwobmV3TGFiZWwpO1xuXHRcdH1cblx0fVxuXG5cdHNldEFjdGl2ZShpc0FjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuYWN0aXZlID0gaXNBY3RpdmU7XG5cblx0XHQvLyBDbGVhciBzZWxlY3Rpb24gd2hlbiBncm91cCBubyBsb25nZXIgYWN0aXZlXG5cdFx0aWYgKCFpc0FjdGl2ZSAmJiB0aGlzLmFjdGl2ZUVkaXRvciAmJiB0aGlzLnNlbGVjdGVkRWRpdG9ycy5sZW5ndGggPiAxKSB7XG5cdFx0XHR0aGlzLnNldFNlbGVjdGlvbih0aGlzLmFjdGl2ZUVkaXRvciwgW10pO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBjb250YWluZXJcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgaXNBY3RpdmUpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdpbmFjdGl2ZScsICFpc0FjdGl2ZSk7XG5cblx0XHQvLyBVcGRhdGUgdGl0bGUgY29udHJvbFxuXHRcdHRoaXMudGl0bGVDb250cm9sLnNldEFjdGl2ZShpc0FjdGl2ZSk7XG5cblx0XHQvLyBVcGRhdGUgc3R5bGVzXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblxuXHRcdC8vIFVwZGF0ZSBtb2RlbFxuXHRcdHRoaXMubW9kZWwuc2V0QWN0aXZlKHVuZGVmaW5lZCAvKiBlbnRpcmUgZ3JvdXAgZ290IGFjdGl2ZSAqLyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gYmFzaWNzKClcblxuXHRnZXQgaWQoKTogR3JvdXBJZGVudGlmaWVyIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5pZDtcblx0fVxuXG5cdGdldCB3aW5kb3dJZCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmdyb3Vwc1ZpZXcud2luZG93SWQ7XG5cdH1cblxuXHRnZXQgZWRpdG9ycygpOiBFZGl0b3JJbnB1dFtdIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKTtcblx0fVxuXG5cdGdldCBjb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmNvdW50O1xuXHR9XG5cblx0Z2V0IHN0aWNreUNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuc3RpY2t5Q291bnQ7XG5cdH1cblxuXHQvKiogVGhlIGNvbnRhaW5lciB0aGF0IGJvdW5kcyB0aGUgZWRpdG9yIHBhbmUsIGV4Y2x1ZGluZyBhbnkgZG9ja2VkIGNvbnRlbnQgaW5zZXQuICovXG5cdGdldCBlZGl0b3JQYW5lQ29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JDb250YWluZXI7XG5cdH1cblxuXHRnZXQgYWN0aXZlRWRpdG9yUGFuZSgpOiBJVmlzaWJsZUVkaXRvclBhbmUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvclBhbmUgPyB0aGlzLmVkaXRvclBhbmUuYWN0aXZlRWRpdG9yUGFuZSA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgYWN0aXZlRWRpdG9yKCk6IEVkaXRvcklucHV0IHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yO1xuXHR9XG5cblx0Z2V0IHNlbGVjdGVkRWRpdG9ycygpOiBFZGl0b3JJbnB1dFtdIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5zZWxlY3RlZEVkaXRvcnM7XG5cdH1cblxuXHRnZXQgcHJldmlld0VkaXRvcigpOiBFZGl0b3JJbnB1dCB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLnByZXZpZXdFZGl0b3I7XG5cdH1cblxuXHRpc1Bpbm5lZChlZGl0b3JPckluZGV4OiBFZGl0b3JJbnB1dCB8IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmlzUGlubmVkKGVkaXRvck9ySW5kZXgpO1xuXHR9XG5cblx0aXNTdGlja3koZWRpdG9yT3JJbmRleDogRWRpdG9ySW5wdXQgfCBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5pc1N0aWNreShlZGl0b3JPckluZGV4KTtcblx0fVxuXG5cdGlzU2VsZWN0ZWQoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmlzU2VsZWN0ZWQoZWRpdG9yKTtcblx0fVxuXG5cdGlzVHJhbnNpZW50KGVkaXRvck9ySW5kZXg6IEVkaXRvcklucHV0IHwgbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuaXNUcmFuc2llbnQoZWRpdG9yT3JJbmRleCk7XG5cdH1cblxuXHRpc0FjdGl2ZShlZGl0b3I6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmlzQWN0aXZlKGVkaXRvcik7XG5cdH1cblxuXHRhc3luYyBzZXRTZWxlY3Rpb24oYWN0aXZlU2VsZWN0ZWRFZGl0b3I6IEVkaXRvcklucHV0LCBpbmFjdGl2ZVNlbGVjdGVkRWRpdG9yczogRWRpdG9ySW5wdXRbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pc0FjdGl2ZShhY3RpdmVTZWxlY3RlZEVkaXRvcikpIHtcblx0XHRcdC8vIFRoZSBhY3RpdmUgc2VsZWN0ZWQgZWRpdG9yIGlzIG5vdCB5ZXQgb3BlbmVkLCBzbyB3ZSBnb1xuXHRcdFx0Ly8gdGhyb3VnaCBgb3BlbkVkaXRvcmAgdG8gc2hvdyBpdC4gV2UgcGFzcyB0aGUgaW5hY3RpdmVcblx0XHRcdC8vIHNlbGVjdGlvbiBhcyBpbnRlcm5hbCBvcHRpb25zXG5cdFx0XHRhd2FpdCB0aGlzLm9wZW5FZGl0b3IoYWN0aXZlU2VsZWN0ZWRFZGl0b3IsIHsgYWN0aXZhdGlvbjogRWRpdG9yQWN0aXZhdGlvbi5BQ1RJVkFURSB9LCB7IGluYWN0aXZlU2VsZWN0aW9uOiBpbmFjdGl2ZVNlbGVjdGVkRWRpdG9ycyB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tb2RlbC5zZXRTZWxlY3Rpb24oYWN0aXZlU2VsZWN0ZWRFZGl0b3IsIGluYWN0aXZlU2VsZWN0ZWRFZGl0b3JzKTtcblx0XHR9XG5cdH1cblxuXHRjb250YWlucyhjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCwgb3B0aW9ucz86IElNYXRjaEVkaXRvck9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5jb250YWlucyhjYW5kaWRhdGUsIG9wdGlvbnMpO1xuXHR9XG5cblx0Z2V0RWRpdG9ycyhvcmRlcjogRWRpdG9yc09yZGVyLCBvcHRpb25zPzogeyBleGNsdWRlU3RpY2t5PzogYm9vbGVhbiB9KTogRWRpdG9ySW5wdXRbXSB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0RWRpdG9ycyhvcmRlciwgb3B0aW9ucyk7XG5cdH1cblxuXHRmaW5kRWRpdG9ycyhyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSUZpbmRFZGl0b3JPcHRpb25zKTogRWRpdG9ySW5wdXRbXSB7XG5cdFx0Y29uc3QgY2Fub25pY2FsUmVzb3VyY2UgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5hc0Nhbm9uaWNhbFVyaShyZXNvdXJjZSk7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0RWRpdG9ycyhvcHRpb25zPy5vcmRlciA/PyBFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkuZmlsdGVyKGVkaXRvciA9PiB7XG5cdFx0XHRpZiAoZWRpdG9yLnJlc291cmNlICYmIGlzRXF1YWwoZWRpdG9yLnJlc291cmNlLCBjYW5vbmljYWxSZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN1cHBvcnQgc2lkZSBieSBzaWRlIGVkaXRvciBwcmltYXJ5IHNpZGUgaWYgc3BlY2lmaWVkXG5cdFx0XHRpZiAob3B0aW9ucz8uc3VwcG9ydFNpZGVCeVNpZGUgPT09IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB8fCBvcHRpb25zPy5zdXBwb3J0U2lkZUJ5U2lkZSA9PT0gU2lkZUJ5U2lkZUVkaXRvci5BTlkpIHtcblx0XHRcdFx0Y29uc3QgcHJpbWFyeVJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0XHRcdGlmIChwcmltYXJ5UmVzb3VyY2UgJiYgaXNFcXVhbChwcmltYXJ5UmVzb3VyY2UsIGNhbm9uaWNhbFJlc291cmNlKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN1cHBvcnQgc2lkZSBieSBzaWRlIGVkaXRvciBzZWNvbmRhcnkgc2lkZSBpZiBzcGVjaWZpZWRcblx0XHRcdGlmIChvcHRpb25zPy5zdXBwb3J0U2lkZUJ5U2lkZSA9PT0gU2lkZUJ5U2lkZUVkaXRvci5TRUNPTkRBUlkgfHwgb3B0aW9ucz8uc3VwcG9ydFNpZGVCeVNpZGUgPT09IFNpZGVCeVNpZGVFZGl0b3IuQU5ZKSB7XG5cdFx0XHRcdGNvbnN0IHNlY29uZGFyeVJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlNFQ09OREFSWSB9KTtcblx0XHRcdFx0aWYgKHNlY29uZGFyeVJlc291cmNlICYmIGlzRXF1YWwoc2Vjb25kYXJ5UmVzb3VyY2UsIGNhbm9uaWNhbFJlc291cmNlKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblx0fVxuXG5cdGdldEVkaXRvckJ5SW5kZXgoaW5kZXg6IG51bWJlcik6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRFZGl0b3JCeUluZGV4KGluZGV4KTtcblx0fVxuXG5cdGdldEluZGV4T2ZFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuaW5kZXhPZihlZGl0b3IpO1xuXHR9XG5cblx0aXNGaXJzdChlZGl0b3I6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuaXNGaXJzdChlZGl0b3IpO1xuXHR9XG5cblx0aXNMYXN0KGVkaXRvcjogRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5pc0xhc3QoZWRpdG9yKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXG5cdFx0Ly8gUGFzcyBmb2N1cyB0byBlZGl0b3IgcGFuZXNcblx0XHRpZiAodGhpcy5hY3RpdmVFZGl0b3JQYW5lKSB7XG5cdFx0XHR0aGlzLmFjdGl2ZUVkaXRvclBhbmUuZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbGVtZW50LmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZEZvY3VzLmZpcmUoKTtcblx0fVxuXG5cdHBpbkVkaXRvcihjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkID0gdGhpcy5hY3RpdmVFZGl0b3IgfHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKGNhbmRpZGF0ZSAmJiAhdGhpcy5tb2RlbC5pc1Bpbm5lZChjYW5kaWRhdGUpKSB7XG5cblx0XHRcdC8vIFVwZGF0ZSBtb2RlbFxuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5tb2RlbC5waW4oY2FuZGlkYXRlKTtcblxuXHRcdFx0Ly8gRm9yd2FyZCB0byB0aXRsZSBjb250cm9sXG5cdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMudGl0bGVDb250cm9sLnBpbkVkaXRvcihlZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHN0aWNrRWRpdG9yKGNhbmRpZGF0ZTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQgPSB0aGlzLmFjdGl2ZUVkaXRvciB8fCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmRvU3RpY2tFZGl0b3IoY2FuZGlkYXRlLCB0cnVlKTtcblx0fVxuXG5cdHVuc3RpY2tFZGl0b3IoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCA9IHRoaXMuYWN0aXZlRWRpdG9yIHx8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuZG9TdGlja0VkaXRvcihjYW5kaWRhdGUsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgZG9TdGlja0VkaXRvcihjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkLCBzdGlja3k6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoY2FuZGlkYXRlICYmIHRoaXMubW9kZWwuaXNTdGlja3koY2FuZGlkYXRlKSAhPT0gc3RpY2t5KSB7XG5cdFx0XHRjb25zdCBvbGRJbmRleE9mRWRpdG9yID0gdGhpcy5nZXRJbmRleE9mRWRpdG9yKGNhbmRpZGF0ZSk7XG5cblx0XHRcdC8vIFVwZGF0ZSBtb2RlbFxuXHRcdFx0Y29uc3QgZWRpdG9yID0gc3RpY2t5ID8gdGhpcy5tb2RlbC5zdGljayhjYW5kaWRhdGUpIDogdGhpcy5tb2RlbC51bnN0aWNrKGNhbmRpZGF0ZSk7XG5cdFx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZSBpbmRleCBvZiB0aGUgZWRpdG9yIGNoYW5nZWQsIHdlIG5lZWQgdG8gZm9yd2FyZCB0aGlzIHRvXG5cdFx0XHQvLyB0aXRsZSBjb250cm9sIGFuZCBhbHNvIG1ha2Ugc3VyZSB0byBlbWl0IHRoaXMgYXMgYW4gZXZlbnRcblx0XHRcdGNvbnN0IG5ld0luZGV4T2ZFZGl0b3IgPSB0aGlzLmdldEluZGV4T2ZFZGl0b3IoZWRpdG9yKTtcblx0XHRcdGlmIChuZXdJbmRleE9mRWRpdG9yICE9PSBvbGRJbmRleE9mRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMudGl0bGVDb250cm9sLm1vdmVFZGl0b3IoZWRpdG9yLCBvbGRJbmRleE9mRWRpdG9yLCBuZXdJbmRleE9mRWRpdG9yLCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRm9yd2FyZCBzdGlja3kgc3RhdGUgdG8gdGl0bGUgY29udHJvbFxuXHRcdFx0aWYgKHN0aWNreSkge1xuXHRcdFx0XHR0aGlzLnRpdGxlQ29udHJvbC5zdGlja0VkaXRvcihlZGl0b3IpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50aXRsZUNvbnRyb2wudW5zdGlja0VkaXRvcihlZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBvcGVuRWRpdG9yKClcblxuXHRhc3luYyBvcGVuRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZG9PcGVuRWRpdG9yKGVkaXRvciwgb3B0aW9ucywge1xuXHRcdFx0Ly8gQXBwcGx5IGdpdmVuIGludGVybmFsIG9wZW4gb3B0aW9uc1xuXHRcdFx0Li4uaW50ZXJuYWxPcHRpb25zLFxuXHRcdFx0Ly8gQWxsb3cgdG8gbWF0Y2ggb24gYSBzaWRlLWJ5LXNpZGUgZWRpdG9yIHdoZW4gc2FtZVxuXHRcdFx0Ly8gZWRpdG9yIGlzIG9wZW5lZCBvbiBib3RoIHNpZGVzLiBJbiB0aGF0IGNhc2Ugd2Vcblx0XHRcdC8vIGRvIG5vdCB3YW50IHRvIG9wZW4gYSBuZXcgZWRpdG9yIGJ1dCByZXVzZSB0aGF0IG9uZS5cblx0XHRcdHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkJPVEhcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvLyBHdWFyZCBhZ2FpbnN0IGludmFsaWQgZWRpdG9ycy4gRGlzcG9zZWQgZWRpdG9yc1xuXHRcdC8vIHNob3VsZCBuZXZlciBvcGVuIGJlY2F1c2UgdGhleSBlbWl0IG5vIGV2ZW50c1xuXHRcdC8vIGUuZy4gdG8gaW5kaWNhdGUgZGlydHkgY2hhbmdlcy5cblx0XHRpZiAoIWVkaXRvciB8fCBlZGl0b3IuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRmlyZSB0aGUgZXZlbnQgbGV0dGluZyBldmVyeW9uZSBrbm93IHdlIGFyZSBhYm91dCB0byBvcGVuIGFuIGVkaXRvclxuXHRcdHRoaXMuX29uV2lsbE9wZW5FZGl0b3IuZmlyZSh7IGVkaXRvciwgZ3JvdXBJZDogdGhpcy5pZCB9KTtcblxuXHRcdC8vIERldGVybWluZSBvcHRpb25zXG5cdFx0Y29uc3QgcGlubmVkID0gb3B0aW9ucz8uc3RpY2t5XG5cdFx0XHR8fCAoIXRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5lbmFibGVQcmV2aWV3ICYmICFvcHRpb25zPy50cmFuc2llbnQpXG5cdFx0XHR8fCBlZGl0b3IuaXNEaXJ0eSgpXG5cdFx0XHR8fCAob3B0aW9ucz8ucGlubmVkID8/IHR5cGVvZiBvcHRpb25zPy5pbmRleCA9PT0gJ251bWJlcicgLyogdW5sZXNzIHNwZWNpZmllZCwgcHJlZmVyIHRvIHBpbiB3aGVuIG9wZW5pbmcgd2l0aCBpbmRleCAqLylcblx0XHRcdHx8ICh0eXBlb2Ygb3B0aW9ucz8uaW5kZXggPT09ICdudW1iZXInICYmIHRoaXMubW9kZWwuaXNTdGlja3kob3B0aW9ucy5pbmRleCkpXG5cdFx0XHR8fCBlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TY3JhdGNocGFkKTtcblx0XHRjb25zdCBvcGVuRWRpdG9yT3B0aW9uczogSUVkaXRvck9wZW5PcHRpb25zID0ge1xuXHRcdFx0aW5kZXg6IG9wdGlvbnMgPyBvcHRpb25zLmluZGV4IDogdW5kZWZpbmVkLFxuXHRcdFx0cGlubmVkLFxuXHRcdFx0c3RpY2t5OiBvcHRpb25zPy5zdGlja3kgfHwgKHR5cGVvZiBvcHRpb25zPy5pbmRleCA9PT0gJ251bWJlcicgJiYgdGhpcy5tb2RlbC5pc1N0aWNreShvcHRpb25zLmluZGV4KSksXG5cdFx0XHR0cmFuc2llbnQ6ICEhb3B0aW9ucz8udHJhbnNpZW50LFxuXHRcdFx0aW5hY3RpdmVTZWxlY3Rpb246IGludGVybmFsT3B0aW9ucz8uaW5hY3RpdmVTZWxlY3Rpb24sXG5cdFx0XHRhY3RpdmU6IHRoaXMuY291bnQgPT09IDAgfHwgIW9wdGlvbnM/LmluYWN0aXZlLFxuXHRcdFx0c3VwcG9ydFNpZGVCeVNpZGU6IGludGVybmFsT3B0aW9ucz8uc3VwcG9ydFNpZGVCeVNpZGVcblx0XHR9O1xuXG5cdFx0aWYgKCFvcGVuRWRpdG9yT3B0aW9ucy5hY3RpdmUgJiYgIW9wZW5FZGl0b3JPcHRpb25zLnBpbm5lZCAmJiB0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvciAmJiAhdGhpcy5tb2RlbC5pc1Bpbm5lZCh0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcikpIHtcblx0XHRcdC8vIFNwZWNpYWwgY2FzZTogd2UgYXJlIHRvIG9wZW4gYW4gZWRpdG9yIGluYWN0aXZlIGFuZCBub3QgcGlubmVkLCBidXQgdGhlIGN1cnJlbnQgYWN0aXZlXG5cdFx0XHQvLyBlZGl0b3IgaXMgYWxzbyBub3QgcGlubmVkLCB3aGljaCBtZWFucyBpdCB3aWxsIGdldCByZXBsYWNlZCB3aXRoIHRoaXMgb25lLiBBcyBzdWNoLFxuXHRcdFx0Ly8gdGhlIGVkaXRvciBjYW4gb25seSBiZSBhY3RpdmUuXG5cdFx0XHRvcGVuRWRpdG9yT3B0aW9ucy5hY3RpdmUgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGxldCBhY3RpdmF0ZUdyb3VwID0gZmFsc2U7XG5cdFx0bGV0IHJlc3RvcmVHcm91cCA9IGZhbHNlO1xuXG5cdFx0aWYgKG9wdGlvbnM/LmFjdGl2YXRpb24gPT09IEVkaXRvckFjdGl2YXRpb24uQUNUSVZBVEUpIHtcblx0XHRcdC8vIFJlc3BlY3Qgb3B0aW9uIHRvIGZvcmNlIGFjdGl2YXRlIGFuIGVkaXRvciBncm91cC5cblx0XHRcdGFjdGl2YXRlR3JvdXAgPSB0cnVlO1xuXHRcdH0gZWxzZSBpZiAob3B0aW9ucz8uYWN0aXZhdGlvbiA9PT0gRWRpdG9yQWN0aXZhdGlvbi5SRVNUT1JFKSB7XG5cdFx0XHQvLyBSZXNwZWN0IG9wdGlvbiB0byBmb3JjZSByZXN0b3JlIGFuIGVkaXRvciBncm91cC5cblx0XHRcdHJlc3RvcmVHcm91cCA9IHRydWU7XG5cdFx0fSBlbHNlIGlmIChvcHRpb25zPy5hY3RpdmF0aW9uID09PSBFZGl0b3JBY3RpdmF0aW9uLlBSRVNFUlZFKSB7XG5cdFx0XHQvLyBSZXNwZWN0IG9wdGlvbiB0byBwcmVzZXJ2ZSBhY3RpdmUgZWRpdG9yIGdyb3VwLlxuXHRcdFx0YWN0aXZhdGVHcm91cCA9IGZhbHNlO1xuXHRcdFx0cmVzdG9yZUdyb3VwID0gZmFsc2U7XG5cdFx0fSBlbHNlIGlmIChvcGVuRWRpdG9yT3B0aW9ucy5hY3RpdmUpIHtcblx0XHRcdC8vIEZpbmFsbHksIHdlIG9ubHkgYWN0aXZhdGUvcmVzdG9yZSBhbiBlZGl0b3Igd2hpY2ggaXNcblx0XHRcdC8vIG9wZW5pbmcgYXMgYWN0aXZlIGVkaXRvci5cblx0XHRcdC8vIElmIHByZXNlcnZlRm9jdXMgaXMgZW5hYmxlZCwgd2Ugb25seSByZXN0b3JlIGJ1dCBuZXZlclxuXHRcdFx0Ly8gYWN0aXZhdGUgdGhlIGdyb3VwLlxuXHRcdFx0YWN0aXZhdGVHcm91cCA9ICFvcHRpb25zPy5wcmVzZXJ2ZUZvY3VzO1xuXHRcdFx0cmVzdG9yZUdyb3VwID0gIWFjdGl2YXRlR3JvdXA7XG5cdFx0fVxuXG5cdFx0Ly8gQWN0dWFsbHkgbW92ZSB0aGUgZWRpdG9yIGlmIGEgc3BlY2lmaWMgaW5kZXggaXMgcHJvdmlkZWQgYW5kIHdlIGZpZ3VyZVxuXHRcdC8vIG91dCB0aGF0IHRoZSBlZGl0b3IgaXMgYWxyZWFkeSBvcGVuZWQgYXQgYSBkaWZmZXJlbnQgaW5kZXguIFRoaXNcblx0XHQvLyBlbnN1cmVzIHRoZSByaWdodCBzZXQgb2YgZXZlbnRzIGFyZSBmaXJlZCB0byB0aGUgb3V0c2lkZS5cblx0XHRpZiAodHlwZW9mIG9wZW5FZGl0b3JPcHRpb25zLmluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgaW5kZXhPZkVkaXRvciA9IHRoaXMubW9kZWwuaW5kZXhPZihlZGl0b3IpO1xuXHRcdFx0aWYgKGluZGV4T2ZFZGl0b3IgIT09IC0xICYmIGluZGV4T2ZFZGl0b3IgIT09IG9wZW5FZGl0b3JPcHRpb25zLmluZGV4KSB7XG5cdFx0XHRcdHRoaXMuZG9Nb3ZlRWRpdG9ySW5zaWRlR3JvdXAoZWRpdG9yLCBvcGVuRWRpdG9yT3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIG1vZGVsIGFuZCBtYWtlIHN1cmUgdG8gY29udGludWUgdG8gdXNlIHRoZSBlZGl0b3Igd2UgZ2V0IGZyb21cblx0XHQvLyB0aGUgbW9kZWwuIEl0IGlzIHBvc3NpYmxlIHRoYXQgdGhlIGVkaXRvciB3YXMgYWxyZWFkeSBvcGVuZWQgYW5kIHdlXG5cdFx0Ly8gd2FudCB0byBlbnN1cmUgdGhhdCB3ZSB1c2UgdGhlIGV4aXN0aW5nIGluc3RhbmNlIGluIHRoYXQgY2FzZS5cblx0XHRjb25zdCB7IGVkaXRvcjogb3BlbmVkRWRpdG9yLCBpc05ldyB9ID0gdGhpcy5tb2RlbC5vcGVuRWRpdG9yKGVkaXRvciwgb3BlbkVkaXRvck9wdGlvbnMpO1xuXG5cdFx0Ly8gQ29uZGl0aW9uYWxseSBsb2NrIHRoZSBncm91cFxuXHRcdGlmIChcblx0XHRcdGlzTmV3ICYmXHRcdFx0XHRcdFx0XHRcdC8vIG9ubHkgaWYgdGhpcyBlZGl0b3Igd2FzIG5ldyBmb3IgdGhlIGdyb3VwXG5cdFx0XHR0aGlzLmNvdW50ID09PSAxICYmXHRcdFx0XHRcdFx0Ly8gb25seSB3aGVuIHRoaXMgZWRpdG9yIHdhcyB0aGUgZmlyc3QgZWRpdG9yIGluIHRoZSBncm91cFxuXHRcdFx0dGhpcy5lZGl0b3JQYXJ0c1ZpZXcuZ3JvdXBzLmxlbmd0aCA+IDEgXHQvLyBvbmx5IGFsbG93IGF1dG8gbG9ja2luZyBpZiBtb3JlIHRoYW4gMSBncm91cCBpcyBvcGVuZWRcblx0XHQpIHtcblx0XHRcdC8vIG9ubHkgd2hlbiB0aGUgZWRpdG9yIGlkZW50aWZpZXIgaXMgY29uZmlndXJlZCBhcyBzdWNoXG5cdFx0XHRpZiAob3BlbmVkRWRpdG9yLmVkaXRvcklkICYmIHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5hdXRvTG9ja0dyb3Vwcz8uaGFzKG9wZW5lZEVkaXRvci5lZGl0b3JJZCkpIHtcblx0XHRcdFx0dGhpcy5sb2NrKHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNob3cgZWRpdG9yXG5cdFx0Y29uc3Qgc2hvd0VkaXRvclJlc3VsdCA9IHRoaXMuZG9TaG93RWRpdG9yKG9wZW5lZEVkaXRvciwgeyBhY3RpdmU6ICEhb3BlbkVkaXRvck9wdGlvbnMuYWN0aXZlLCBpc05ldyB9LCBvcHRpb25zLCBpbnRlcm5hbE9wdGlvbnMpO1xuXG5cdFx0Ly8gRmluYWxseSBtYWtlIHN1cmUgdGhlIGdyb3VwIGlzIGFjdGl2ZSBvciByZXN0b3JlZCBhcyBpbnN0cnVjdGVkXG5cdFx0aWYgKGFjdGl2YXRlR3JvdXApIHtcblx0XHRcdHRoaXMuZ3JvdXBzVmlldy5hY3RpdmF0ZUdyb3VwKHRoaXMpO1xuXHRcdH0gZWxzZSBpZiAocmVzdG9yZUdyb3VwKSB7XG5cdFx0XHR0aGlzLmdyb3Vwc1ZpZXcucmVzdG9yZUdyb3VwKHRoaXMpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzaG93RWRpdG9yUmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBkb1Nob3dFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCwgY29udGV4dDogeyBhY3RpdmU6IGJvb2xlYW47IGlzTmV3OiBib29sZWFuIH0sIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvLyBTaG93IGluIGVkaXRvciBjb250cm9sIGlmIHRoZSBhY3RpdmUgZWRpdG9yIGNoYW5nZWRcblx0XHRsZXQgb3BlbkVkaXRvclByb21pc2U6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+O1xuXHRcdGlmIChjb250ZXh0LmFjdGl2ZSkge1xuXHRcdFx0b3BlbkVkaXRvclByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IHBhbmUsIGNoYW5nZWQsIGNhbmNlbGxlZCwgZXJyb3IgfSA9IGF3YWl0IHRoaXMuZWRpdG9yUGFuZS5vcGVuRWRpdG9yKGVkaXRvciwgb3B0aW9ucywgaW50ZXJuYWxPcHRpb25zLCB7IG5ld0luR3JvdXA6IGNvbnRleHQuaXNOZXcgfSk7XG5cblx0XHRcdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIHRoZSBvcGVyYXRpb24gd2FzIGNhbmNlbGxlZCBieSBhbm90aGVyIG9wZXJhdGlvblxuXHRcdFx0XHRpZiAoY2FuY2VsbGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEVkaXRvciBjaGFuZ2UgZXZlbnRcblx0XHRcdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKHsgZWRpdG9yLCBpc0V4cGxpY2l0OiBvcHRpb25zPy5pc0V4cGxpY2l0IH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSW5kaWNhdGUgZXJyb3IgYXMgYW4gZXZlbnQgYnV0IGRvIG5vdCBidWJibGUgdGhlbSB1cFxuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZE9wZW5FZGl0b3JGYWlsLmZpcmUoZWRpdG9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFdpdGhvdXQgYW4gZWRpdG9yIHBhbmUsIHJlY292ZXIgYnkgY2xvc2luZyB0aGUgYWN0aXZlIGVkaXRvclxuXHRcdFx0XHQvLyAoaWYgdGhlIGlucHV0IGlzIHN0aWxsIHRoZSBhY3RpdmUgb25lKVxuXHRcdFx0XHRpZiAoIXBhbmUgJiYgdGhpcy5hY3RpdmVFZGl0b3IgPT09IGVkaXRvcikge1xuXHRcdFx0XHRcdHRoaXMuZG9DbG9zZUVkaXRvcihlZGl0b3IsIG9wdGlvbnM/LnByZXNlcnZlRm9jdXMsIHsgZnJvbUVycm9yOiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHBhbmU7XG5cdFx0XHR9KSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvcGVuRWRpdG9yUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpOyAvLyBpbmFjdGl2ZTogcmV0dXJuIHVuZGVmaW5lZCBhcyByZXN1bHQgdG8gc2lnbmFsIHRoaXNcblx0XHR9XG5cblx0XHQvLyBTaG93IGluIHRpdGxlIGNvbnRyb2wgYWZ0ZXIgZWRpdG9yIGNvbnRyb2wgYmVjYXVzZSBzb21lIGFjdGlvbnMgZGVwZW5kIG9uIGl0XG5cdFx0Ly8gYnV0IHJlc3BlY3QgdGhlIGludGVybmFsIG9wdGlvbnMgaW4gY2FzZSB0aXRsZSBjb250cm9sIHVwZGF0ZXMgc2hvdWxkIHNraXAuXG5cdFx0aWYgKCFpbnRlcm5hbE9wdGlvbnM/LnNraXBUaXRsZVVwZGF0ZSkge1xuXHRcdFx0dGhpcy50aXRsZUNvbnRyb2wub3BlbkVkaXRvcihlZGl0b3IsIGludGVybmFsT3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9wZW5FZGl0b3JQcm9taXNlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIG9wZW5FZGl0b3JzKClcblxuXHRhc3luYyBvcGVuRWRpdG9ycyhlZGl0b3JzOiB7IGVkaXRvcjogRWRpdG9ySW5wdXQ7IG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucyB9W10pOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvLyBHdWFyZCBhZ2FpbnN0IGludmFsaWQgZWRpdG9ycy4gRGlzcG9zZWQgZWRpdG9yc1xuXHRcdC8vIHNob3VsZCBuZXZlciBvcGVuIGJlY2F1c2UgdGhleSBlbWl0IG5vIGV2ZW50c1xuXHRcdC8vIGUuZy4gdG8gaW5kaWNhdGUgZGlydHkgY2hhbmdlcy5cblx0XHRjb25zdCBlZGl0b3JzVG9PcGVuID0gY29hbGVzY2UoZWRpdG9ycykuZmlsdGVyKCh7IGVkaXRvciB9KSA9PiAhZWRpdG9yLmlzRGlzcG9zZWQoKSk7XG5cblx0XHQvLyBVc2UgdGhlIGZpcnN0IGVkaXRvciBhcyBhY3RpdmUgZWRpdG9yXG5cdFx0Y29uc3QgZmlyc3RFZGl0b3IgPSBlZGl0b3JzVG9PcGVuLmF0KDApO1xuXHRcdGlmICghZmlyc3RFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvcGVuRWRpdG9yc09wdGlvbnM6IElJbnRlcm5hbEVkaXRvck9wZW5PcHRpb25zID0ge1xuXHRcdFx0Ly8gQWxsb3cgdG8gbWF0Y2ggb24gYSBzaWRlLWJ5LXNpZGUgZWRpdG9yIHdoZW4gc2FtZVxuXHRcdFx0Ly8gZWRpdG9yIGlzIG9wZW5lZCBvbiBib3RoIHNpZGVzLiBJbiB0aGF0IGNhc2Ugd2Vcblx0XHRcdC8vIGRvIG5vdCB3YW50IHRvIG9wZW4gYSBuZXcgZWRpdG9yIGJ1dCByZXVzZSB0aGF0IG9uZS5cblx0XHRcdHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkJPVEhcblx0XHR9O1xuXG5cdFx0YXdhaXQgdGhpcy5kb09wZW5FZGl0b3IoZmlyc3RFZGl0b3IuZWRpdG9yLCBmaXJzdEVkaXRvci5vcHRpb25zLCBvcGVuRWRpdG9yc09wdGlvbnMpO1xuXG5cdFx0Ly8gT3BlbiB0aGUgb3RoZXIgb25lcyBpbmFjdGl2ZVxuXHRcdGNvbnN0IGluYWN0aXZlRWRpdG9ycyA9IGVkaXRvcnNUb09wZW4uc2xpY2UoMSk7XG5cdFx0Y29uc3Qgc3RhcnRpbmdJbmRleCA9IHRoaXMuZ2V0SW5kZXhPZkVkaXRvcihmaXJzdEVkaXRvci5lZGl0b3IpICsgMTtcblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGluYWN0aXZlRWRpdG9ycy5tYXAoKHsgZWRpdG9yLCBvcHRpb25zIH0sIGluZGV4KSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb09wZW5FZGl0b3IoZWRpdG9yLCB7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdGluYWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRwaW5uZWQ6IHRydWUsXG5cdFx0XHRcdGluZGV4OiBzdGFydGluZ0luZGV4ICsgaW5kZXhcblx0XHRcdH0sIHtcblx0XHRcdFx0Li4ub3BlbkVkaXRvcnNPcHRpb25zLFxuXHRcdFx0XHQvLyBvcHRpbWl6YXRpb246IHVwZGF0ZSB0aGUgdGl0bGUgY29udHJvbCBsYXRlclxuXHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTMwNjM0XG5cdFx0XHRcdHNraXBUaXRsZVVwZGF0ZTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVXBkYXRlIHRoZSB0aXRsZSBjb250cm9sIGFsbCBhdCBvbmNlIHdpdGggYWxsIGVkaXRvcnNcblx0XHR0aGlzLnRpdGxlQ29udHJvbC5vcGVuRWRpdG9ycyhpbmFjdGl2ZUVkaXRvcnMubWFwKCh7IGVkaXRvciB9KSA9PiBlZGl0b3IpKTtcblxuXHRcdC8vIE9wZW5pbmcgbWFueSBlZGl0b3JzIGF0IG9uY2UgY2FuIHB1dCBhbnkgZWRpdG9yIHRvIGJlXG5cdFx0Ly8gdGhlIGFjdGl2ZSBvbmUgZGVwZW5kaW5nIG9uIG9wdGlvbnMuIEFzIHN1Y2gsIHdlIHNpbXBseVxuXHRcdC8vIHJldHVybiB0aGUgYWN0aXZlIGVkaXRvciBwYW5lIGFmdGVyIHRoaXMgb3BlcmF0aW9uLlxuXHRcdHJldHVybiB0aGlzLmVkaXRvclBhbmUuYWN0aXZlRWRpdG9yUGFuZSA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gbW92ZUVkaXRvcigpXG5cblx0bW92ZUVkaXRvcnMoZWRpdG9yczogeyBlZGl0b3I6IEVkaXRvcklucHV0OyBvcHRpb25zPzogSUVkaXRvck9wdGlvbnMgfVtdLCB0YXJnZXQ6IEVkaXRvckdyb3VwVmlldyk6IGJvb2xlYW4ge1xuXG5cdFx0Ly8gT3B0aW1pemF0aW9uOiBrbm93aW5nIHRoYXQgd2UgbW92ZSBtYW55IGVkaXRvcnMsIHdlXG5cdFx0Ly8gZGVsYXkgdGhlIHRpdGxlIHVwZGF0ZSB0byBhIGxhdGVyIHBvaW50IGZvciB0aGlzIGdyb3VwXG5cdFx0Ly8gdGhyb3VnaCBhIG1ldGhvZCB0aGF0IGFsbG93cyBmb3IgYnVsayB1cGRhdGVzIGJ1dCBvbmx5XG5cdFx0Ly8gd2hlbiBtb3ZpbmcgdG8gYSBkaWZmZXJlbnQgZ3JvdXAgd2hlcmUgbWFueSBlZGl0b3JzXG5cdFx0Ly8gYXJlIG1vcmUgbGlrZWx5IHRvIG9jY3VyLlxuXHRcdGNvbnN0IGludGVybmFsT3B0aW9uczogSUludGVybmFsTW92ZUNvcHlPcHRpb25zID0ge1xuXHRcdFx0c2tpcFRpdGxlVXBkYXRlOiB0aGlzICE9PSB0YXJnZXRcblx0XHR9O1xuXG5cdFx0bGV0IG1vdmVGYWlsZWQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IG1vdmVkRWRpdG9ycyA9IG5ldyBTZXQ8RWRpdG9ySW5wdXQ+KCk7XG5cdFx0Zm9yIChjb25zdCB7IGVkaXRvciwgb3B0aW9ucyB9IG9mIGVkaXRvcnMpIHtcblx0XHRcdGlmICh0aGlzLm1vdmVFZGl0b3IoZWRpdG9yLCB0YXJnZXQsIG9wdGlvbnMsIGludGVybmFsT3B0aW9ucykpIHtcblx0XHRcdFx0bW92ZWRFZGl0b3JzLmFkZChlZGl0b3IpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bW92ZUZhaWxlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRoZSB0aXRsZSBjb250cm9sIGFsbCBhdCBvbmNlIHdpdGggYWxsIGVkaXRvcnNcblx0XHQvLyBpbiBzb3VyY2UgYW5kIHRhcmdldCBpZiB0aGUgdGl0bGUgdXBkYXRlIHdhcyBza2lwcGVkXG5cdFx0aWYgKGludGVybmFsT3B0aW9ucy5za2lwVGl0bGVVcGRhdGUpIHtcblx0XHRcdHRhcmdldC50aXRsZUNvbnRyb2wub3BlbkVkaXRvcnMoQXJyYXkuZnJvbShtb3ZlZEVkaXRvcnMpKTtcblx0XHRcdHRoaXMudGl0bGVDb250cm9sLmNsb3NlRWRpdG9ycyhBcnJheS5mcm9tKG1vdmVkRWRpdG9ycykpO1xuXHRcdH1cblxuXHRcdHJldHVybiAhbW92ZUZhaWxlZDtcblx0fVxuXG5cdG1vdmVFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCwgdGFyZ2V0OiBFZGl0b3JHcm91cFZpZXcsIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSUludGVybmFsTW92ZUNvcHlPcHRpb25zKTogYm9vbGVhbiB7XG5cblx0XHQvLyBNb3ZlIHdpdGhpbiBzYW1lIGdyb3VwXG5cdFx0aWYgKHRoaXMgPT09IHRhcmdldCkge1xuXHRcdFx0dGhpcy5kb01vdmVFZGl0b3JJbnNpZGVHcm91cChlZGl0b3IsIG9wdGlvbnMpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gTW92ZSBhY3Jvc3MgZ3JvdXBzXG5cdFx0ZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb01vdmVPckNvcHlFZGl0b3JBY3Jvc3NHcm91cHMoZWRpdG9yLCB0YXJnZXQsIG9wdGlvbnMsIHsgLi4uaW50ZXJuYWxPcHRpb25zLCBrZWVwQ29weTogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb01vdmVFZGl0b3JJbnNpZGVHcm91cChjYW5kaWRhdGU6IEVkaXRvcklucHV0LCBvcHRpb25zPzogSUVkaXRvck9wZW5PcHRpb25zKTogdm9pZCB7XG5cdFx0Y29uc3QgbW92ZVRvSW5kZXggPSBvcHRpb25zID8gb3B0aW9ucy5pbmRleCA6IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIG1vdmVUb0luZGV4ICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuOyAvLyBkbyBub3RoaW5nIGlmIHdlIG1vdmUgaW50byBzYW1lIGdyb3VwIHdpdGhvdXQgaW5kZXhcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgbW9kZWwgYW5kIG1ha2Ugc3VyZSB0byBjb250aW51ZSB0byB1c2UgdGhlIGVkaXRvciB3ZSBnZXQgZnJvbVxuXHRcdC8vIHRoZSBtb2RlbC4gSXQgaXMgcG9zc2libGUgdGhhdCB0aGUgZWRpdG9yIHdhcyBhbHJlYWR5IG9wZW5lZCBhbmQgd2Vcblx0XHQvLyB3YW50IHRvIGVuc3VyZSB0aGF0IHdlIHVzZSB0aGUgZXhpc3RpbmcgaW5zdGFuY2UgaW4gdGhhdCBjYXNlLlxuXHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IHRoaXMubW9kZWwuaW5kZXhPZihjYW5kaWRhdGUpO1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMubW9kZWwuZ2V0RWRpdG9yQnlJbmRleChjdXJyZW50SW5kZXgpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTW92ZSB3aGVuIGluZGV4IGhhcyBhY3R1YWxseSBjaGFuZ2VkXG5cdFx0aWYgKGN1cnJlbnRJbmRleCAhPT0gbW92ZVRvSW5kZXgpIHtcblx0XHRcdGNvbnN0IG9sZFN0aWNreUNvdW50ID0gdGhpcy5tb2RlbC5zdGlja3lDb3VudDtcblxuXHRcdFx0Ly8gVXBkYXRlIG1vZGVsXG5cdFx0XHR0aGlzLm1vZGVsLm1vdmVFZGl0b3IoZWRpdG9yLCBtb3ZlVG9JbmRleCk7XG5cdFx0XHR0aGlzLm1vZGVsLnBpbihlZGl0b3IpO1xuXG5cdFx0XHQvLyBGb3J3YXJkIHRvIHRpdGxlIGNvbnRyb2xcblx0XHRcdHRoaXMudGl0bGVDb250cm9sLm1vdmVFZGl0b3IoZWRpdG9yLCBjdXJyZW50SW5kZXgsIG1vdmVUb0luZGV4LCBvbGRTdGlja3lDb3VudCAhPT0gdGhpcy5tb2RlbC5zdGlja3lDb3VudCk7XG5cdFx0XHR0aGlzLnRpdGxlQ29udHJvbC5waW5FZGl0b3IoZWRpdG9yKTtcblx0XHR9XG5cblx0XHQvLyBTdXBwb3J0IHRoZSBvcHRpb24gdG8gc3RpY2sgdGhlIGVkaXRvciBldmVuIGlmIGl0IGlzIG1vdmVkLlxuXHRcdC8vIEl0IGlzIGltcG9ydGFudCB0aGF0IHdlIGNhbGwgdGhpcyBtZXRob2QgYWZ0ZXIgd2UgaGF2ZSBtb3ZlZFxuXHRcdC8vIHRoZSBlZGl0b3IgYmVjYXVzZSB0aGUgcmVzdWx0IG9mIG1vdmluZyB0aGUgZWRpdG9yIGNvdWxkIGhhdmVcblx0XHQvLyBjYXVzZWQgYSBjaGFuZ2UgaW4gc3RpY2t5IHN0YXRlLlxuXHRcdGlmIChvcHRpb25zPy5zdGlja3kpIHtcblx0XHRcdHRoaXMuc3RpY2tFZGl0b3IoZWRpdG9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvTW92ZU9yQ29weUVkaXRvckFjcm9zc0dyb3VwcyhlZGl0b3I6IEVkaXRvcklucHV0LCB0YXJnZXQ6IEVkaXRvckdyb3VwVmlldywgb3Blbk9wdGlvbnM/OiBJRWRpdG9yT3Blbk9wdGlvbnMsIGludGVybmFsT3B0aW9ucz86IElJbnRlcm5hbE1vdmVDb3B5T3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGtlZXBDb3B5ID0gaW50ZXJuYWxPcHRpb25zPy5rZWVwQ29weTtcblxuXHRcdC8vIFZhbGlkYXRlIHRoYXQgd2UgY2FuIG1vdmVcblx0XHRpZiAoIWtlZXBDb3B5IHx8IGVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlNpbmdsZXRvbikgLyogc2luZ2xldG9uIGVkaXRvcnMgd2lsbCBhbHdheXMgbW92ZSAqLykge1xuXHRcdFx0Y29uc3QgY2FuTW92ZVZldG8gPSBlZGl0b3IuY2FuTW92ZSh0aGlzLmlkLCB0YXJnZXQuaWQpO1xuXHRcdFx0aWYgKHR5cGVvZiBjYW5Nb3ZlVmV0byA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGhpcy5kaWFsb2dTZXJ2aWNlLmVycm9yKGNhbk1vdmVWZXRvLCBsb2NhbGl6ZSgnbW92ZUVycm9yRGV0YWlscycsIFwiVHJ5IHNhdmluZyBvciByZXZlcnRpbmcgdGhlIGVkaXRvciBmaXJzdCBhbmQgdGhlbiB0cnkgYWdhaW4uXCIpKTtcblxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiBtb3ZpbmcvY29weWluZyBhbiBlZGl0b3IsIHRyeSB0byBwcmVzZXJ2ZSBhcyBtdWNoIHZpZXcgc3RhdGUgYXMgcG9zc2libGVcblx0XHQvLyBieSBjaGVja2luZyBmb3IgdGhlIGVkaXRvciB0byBiZSBhIHRleHQgZWRpdG9yIGFuZCBjcmVhdGluZyB0aGUgb3B0aW9ucyBhY2NvcmRpbmdseVxuXHRcdC8vIGlmIHNvXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGZpbGxBY3RpdmVFZGl0b3JWaWV3U3RhdGUodGhpcywgZWRpdG9yLCB7XG5cdFx0XHQuLi5vcGVuT3B0aW9ucyxcblx0XHRcdHBpbm5lZDogdHJ1ZSwgXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBhbHdheXMgcGluIG1vdmVkIGVkaXRvclxuXHRcdFx0c3RpY2t5OiBvcGVuT3B0aW9ucz8uc3RpY2t5ID8/ICgha2VlcENvcHkgJiYgdGhpcy5tb2RlbC5pc1N0aWNreShlZGl0b3IpKVx0Ly8gcHJlc2VydmUgc3RpY2t5IHN0YXRlIG9ubHkgaWYgZWRpdG9yIGlzIG1vdmVkIG9yIGV4cGxpY2l0bHkgd2FudGVkIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTkwMzUpXG5cdFx0fSk7XG5cblx0XHQvLyBJbmRpY2F0ZSB3aWxsIG1vdmUgZXZlbnRcblx0XHRpZiAoIWtlZXBDb3B5KSB7XG5cdFx0XHR0aGlzLl9vbldpbGxNb3ZlRWRpdG9yLmZpcmUoe1xuXHRcdFx0XHRncm91cElkOiB0aGlzLmlkLFxuXHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdHRhcmdldDogdGFyZ2V0LmlkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBBIG1vdmUgdG8gYW5vdGhlciBncm91cCBpcyBhbiBvcGVuIGZpcnN0Li4uXG5cdFx0dGFyZ2V0LmRvT3BlbkVkaXRvcihrZWVwQ29weSA/IGVkaXRvci5jb3B5KCkgOiBlZGl0b3IsIG9wdGlvbnMsIGludGVybmFsT3B0aW9ucyk7XG5cblx0XHQvLyAuLi5hbmQgYSBjbG9zZSBhZnRlcndhcmRzICh1bmxlc3Mgd2UgY29weSlcblx0XHRpZiAoIWtlZXBDb3B5KSB7XG5cdFx0XHR0aGlzLmRvQ2xvc2VFZGl0b3IoZWRpdG9yLCB0cnVlIC8qIGRvIG5vdCBmb2N1cyBuZXh0IG9uZSBiZWhpbmQgaWYgYW55ICovLCB7IC4uLmludGVybmFsT3B0aW9ucywgY29udGV4dDogRWRpdG9yQ2xvc2VDb250ZXh0Lk1PVkUgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gY29weUVkaXRvcigpXG5cblx0Y29weUVkaXRvcnMoZWRpdG9yczogeyBlZGl0b3I6IEVkaXRvcklucHV0OyBvcHRpb25zPzogSUVkaXRvck9wdGlvbnMgfVtdLCB0YXJnZXQ6IEVkaXRvckdyb3VwVmlldyk6IHZvaWQge1xuXG5cdFx0Ly8gT3B0aW1pemF0aW9uOiBrbm93aW5nIHRoYXQgd2UgbW92ZSBtYW55IGVkaXRvcnMsIHdlXG5cdFx0Ly8gZGVsYXkgdGhlIHRpdGxlIHVwZGF0ZSB0byBhIGxhdGVyIHBvaW50IGZvciB0aGlzIGdyb3VwXG5cdFx0Ly8gdGhyb3VnaCBhIG1ldGhvZCB0aGF0IGFsbG93cyBmb3IgYnVsayB1cGRhdGVzIGJ1dCBvbmx5XG5cdFx0Ly8gd2hlbiBtb3ZpbmcgdG8gYSBkaWZmZXJlbnQgZ3JvdXAgd2hlcmUgbWFueSBlZGl0b3JzXG5cdFx0Ly8gYXJlIG1vcmUgbGlrZWx5IHRvIG9jY3VyLlxuXHRcdGNvbnN0IGludGVybmFsT3B0aW9uczogSUludGVybmFsTW92ZUNvcHlPcHRpb25zID0ge1xuXHRcdFx0c2tpcFRpdGxlVXBkYXRlOiB0aGlzICE9PSB0YXJnZXRcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCB7IGVkaXRvciwgb3B0aW9ucyB9IG9mIGVkaXRvcnMpIHtcblx0XHRcdHRoaXMuY29weUVkaXRvcihlZGl0b3IsIHRhcmdldCwgb3B0aW9ucywgaW50ZXJuYWxPcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdGhlIHRpdGxlIGNvbnRyb2wgYWxsIGF0IG9uY2Ugd2l0aCBhbGwgZWRpdG9yc1xuXHRcdC8vIGluIHRhcmdldCBpZiB0aGUgdGl0bGUgdXBkYXRlIHdhcyBza2lwcGVkXG5cdFx0aWYgKGludGVybmFsT3B0aW9ucy5za2lwVGl0bGVVcGRhdGUpIHtcblx0XHRcdGNvbnN0IGNvcGllZEVkaXRvcnMgPSBlZGl0b3JzLm1hcCgoeyBlZGl0b3IgfSkgPT4gZWRpdG9yKTtcblx0XHRcdHRhcmdldC50aXRsZUNvbnRyb2wub3BlbkVkaXRvcnMoY29waWVkRWRpdG9ycyk7XG5cdFx0fVxuXHR9XG5cblx0Y29weUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0LCB0YXJnZXQ6IEVkaXRvckdyb3VwVmlldywgb3B0aW9ucz86IElFZGl0b3JPcHRpb25zLCBpbnRlcm5hbE9wdGlvbnM/OiBJSW50ZXJuYWxFZGl0b3JUaXRsZUNvbnRyb2xPcHRpb25zKTogdm9pZCB7XG5cblx0XHQvLyBNb3ZlIHdpdGhpbiBzYW1lIGdyb3VwIGJlY2F1c2Ugd2UgZG8gbm90IHN1cHBvcnQgdG8gc2hvdyB0aGUgc2FtZSBlZGl0b3Jcblx0XHQvLyBtdWx0aXBsZSB0aW1lcyBpbiB0aGUgc2FtZSBncm91cFxuXHRcdGlmICh0aGlzID09PSB0YXJnZXQpIHtcblx0XHRcdHRoaXMuZG9Nb3ZlRWRpdG9ySW5zaWRlR3JvdXAoZWRpdG9yLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBDb3B5IGFjcm9zcyBncm91cHNcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMuZG9Nb3ZlT3JDb3B5RWRpdG9yQWNyb3NzR3JvdXBzKGVkaXRvciwgdGFyZ2V0LCBvcHRpb25zLCB7IC4uLmludGVybmFsT3B0aW9ucywga2VlcENvcHk6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIGNsb3NlRWRpdG9yKClcblxuXHRhc3luYyBjbG9zZUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkID0gdGhpcy5hY3RpdmVFZGl0b3IgfHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSUNsb3NlRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLmRvQ2xvc2VFZGl0b3JXaXRoQ29uZmlybWF0aW9uSGFuZGxpbmcoZWRpdG9yLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9DbG9zZUVkaXRvcldpdGhDb25maXJtYXRpb25IYW5kbGluZyhlZGl0b3I6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkID0gdGhpcy5hY3RpdmVFZGl0b3IgfHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSUNsb3NlRWRpdG9yT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSUludGVybmFsRWRpdG9yQ2xvc2VPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3IgY29uZmlybWF0aW9uIGFuZCB2ZXRvXG5cdFx0Y29uc3QgdmV0byA9IGF3YWl0IHRoaXMuaGFuZGxlQ2xvc2VDb25maXJtYXRpb24oW2VkaXRvcl0pO1xuXHRcdGlmICh2ZXRvKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gRG8gY2xvc2Vcblx0XHR0aGlzLmRvQ2xvc2VFZGl0b3IoZWRpdG9yLCBvcHRpb25zPy5wcmVzZXJ2ZUZvY3VzLCBpbnRlcm5hbE9wdGlvbnMpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGRvQ2xvc2VFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCwgcHJlc2VydmVGb2N1cyA9ICh0aGlzLmdyb3Vwc1ZpZXcuYWN0aXZlR3JvdXAgIT09IHRoaXMpLCBpbnRlcm5hbE9wdGlvbnM/OiBJSW50ZXJuYWxFZGl0b3JDbG9zZU9wdGlvbnMpOiB2b2lkIHtcblxuXHRcdC8vIEZvcndhcmQgdG8gdGl0bGUgY29udHJvbCB1bmxlc3Mgc2tpcHBlZCB2aWEgaW50ZXJuYWwgb3B0aW9uc1xuXHRcdGlmICghaW50ZXJuYWxPcHRpb25zPy5za2lwVGl0bGVVcGRhdGUpIHtcblx0XHRcdHRoaXMudGl0bGVDb250cm9sLmJlZm9yZUNsb3NlRWRpdG9yKGVkaXRvcik7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvc2luZyB0aGUgYWN0aXZlIGVkaXRvciBvZiB0aGUgZ3JvdXAgaXMgYSBiaXQgbW9yZSB3b3JrXG5cdFx0aWYgKHRoaXMubW9kZWwuaXNBY3RpdmUoZWRpdG9yKSkge1xuXHRcdFx0dGhpcy5kb0Nsb3NlQWN0aXZlRWRpdG9yKHByZXNlcnZlRm9jdXMsIGludGVybmFsT3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvc2luZyBpbmFjdGl2ZSBlZGl0b3IgaXMganVzdCBhIG1vZGVsIHVwZGF0ZVxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5kb0Nsb3NlSW5hY3RpdmVFZGl0b3IoZWRpdG9yLCBpbnRlcm5hbE9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdC8vIEZvcndhcmQgdG8gdGl0bGUgY29udHJvbCB1bmxlc3Mgc2tpcHBlZCB2aWEgaW50ZXJuYWwgb3B0aW9uc1xuXHRcdGlmICghaW50ZXJuYWxPcHRpb25zPy5za2lwVGl0bGVVcGRhdGUpIHtcblx0XHRcdHRoaXMudGl0bGVDb250cm9sLmNsb3NlRWRpdG9yKGVkaXRvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb0Nsb3NlQWN0aXZlRWRpdG9yKHByZXNlcnZlRm9jdXMgPSAodGhpcy5ncm91cHNWaWV3LmFjdGl2ZUdyb3VwICE9PSB0aGlzKSwgaW50ZXJuYWxPcHRpb25zPzogSUludGVybmFsRWRpdG9yQ2xvc2VPcHRpb25zKTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yVG9DbG9zZSA9IHRoaXMuYWN0aXZlRWRpdG9yO1xuXHRcdGNvbnN0IHJlc3RvcmVGb2N1cyA9ICFwcmVzZXJ2ZUZvY3VzICYmIHRoaXMuc2hvdWxkUmVzdG9yZUZvY3VzKHRoaXMuZWxlbWVudCk7XG5cblx0XHQvLyBPcHRpbWl6YXRpb246IGlmIHdlIGFyZSBhYm91dCB0byBjbG9zZSB0aGUgbGFzdCBlZGl0b3IgaW4gdGhpcyBncm91cCBhbmQgc2V0dGluZ3Ncblx0XHQvLyBhcmUgY29uZmlndXJlZCB0byBjbG9zZSB0aGUgZ3JvdXAgc2luY2UgaXQgd2lsbCBiZSBlbXB0eSwgd2UgZmlyc3Qgc2V0IHRoZSBsYXN0XG5cdFx0Ly8gYWN0aXZlIGdyb3VwIGFzIGVtcHR5IGJlZm9yZSBjbG9zaW5nIHRoZSBlZGl0b3IuIFRoaXMgcmVkdWNlcyB0aGUgYW1vdW50IG9mIGVkaXRvclxuXHRcdC8vIGNoYW5nZSBldmVudHMgdGhhdCB0aGlzIG9wZXJhdGlvbiBlbWl0cyBhbmQgd2lsbCByZWR1Y2UgZmxpY2tlci4gV2l0aG91dCB0aGlzXG5cdFx0Ly8gb3B0aW1pemF0aW9uLCB0aGlzIGdyb3VwIChpZiBhY3RpdmUpIHdvdWxkIGZpcnN0IHRyaWdnZXIgYSBhY3RpdmUgZWRpdG9yIGNoYW5nZVxuXHRcdC8vIGV2ZW50IGJlY2F1c2UgaXQgYmVjYW1lIGVtcHR5LCBvbmx5IHRvIHRoZW4gdHJpZ2dlciBhbm90aGVyIG9uZSB3aGVuIHRoZSBuZXh0XG5cdFx0Ly8gZ3JvdXAgZ2V0cyBhY3RpdmUuXG5cdFx0Y29uc3QgY2xvc2VFbXB0eUdyb3VwID0gdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLmNsb3NlRW1wdHlHcm91cHM7XG5cdFx0aWYgKGNsb3NlRW1wdHlHcm91cCAmJiB0aGlzLmFjdGl2ZSAmJiB0aGlzLmNvdW50ID09PSAxKSB7XG5cdFx0XHRjb25zdCBtb3N0UmVjZW50bHlBY3RpdmVHcm91cHMgPSB0aGlzLmdyb3Vwc1ZpZXcuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKTtcblx0XHRcdGNvbnN0IG5leHRBY3RpdmVHcm91cCA9IG1vc3RSZWNlbnRseUFjdGl2ZUdyb3Vwc1sxXTsgLy8gWzBdIHdpbGwgYmUgdGhlIGN1cnJlbnQgb25lLCBzbyB0YWtlIFsxXVxuXHRcdFx0aWYgKG5leHRBY3RpdmVHcm91cCkge1xuXHRcdFx0XHRpZiAocmVzdG9yZUZvY3VzKSB7XG5cdFx0XHRcdFx0bmV4dEFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5ncm91cHNWaWV3LmFjdGl2YXRlR3JvdXAobmV4dEFjdGl2ZUdyb3VwLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBtb2RlbFxuXHRcdGlmIChlZGl0b3JUb0Nsb3NlKSB7XG5cdFx0XHR0aGlzLm1vZGVsLmNsb3NlRWRpdG9yKGVkaXRvclRvQ2xvc2UsIGludGVybmFsT3B0aW9ucz8uY29udGV4dCk7XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiBuZXh0IGFjdGl2ZSBpZiB0aGVyZSBhcmUgbW9yZSB0byBzaG93XG5cdFx0Y29uc3QgbmV4dEFjdGl2ZUVkaXRvciA9IHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yO1xuXHRcdGlmIChuZXh0QWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRsZXQgYWN0aXZhdGlvbjogRWRpdG9yQWN0aXZhdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChwcmVzZXJ2ZUZvY3VzICYmIHRoaXMuZ3JvdXBzVmlldy5hY3RpdmVHcm91cCAhPT0gdGhpcykge1xuXHRcdFx0XHQvLyBJZiB3ZSBhcmUgb3BlbmluZyB0aGUgbmV4dCBlZGl0b3IgaW4gYW4gaW5hY3RpdmUgZ3JvdXBcblx0XHRcdFx0Ly8gd2l0aG91dCBmb2N1c3NpbmcgaXQsIGVuc3VyZSB3ZSBwcmVzZXJ2ZSB0aGUgZWRpdG9yXG5cdFx0XHRcdC8vIGdyb3VwIHNpemVzIGluIGNhc2UgdGhhdCBncm91cCBpcyBtaW5pbWl6ZWQuXG5cdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTc2ODZcblx0XHRcdFx0YWN0aXZhdGlvbiA9IEVkaXRvckFjdGl2YXRpb24uUFJFU0VSVkU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9wdGlvbnM6IElFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzLFxuXHRcdFx0XHRhY3RpdmF0aW9uLFxuXHRcdFx0XHQvLyBXaGVuIGNsb3NpbmcgYW4gZWRpdG9yIGR1ZSB0byBhbiBlcnJvciB3ZSBjYW4gZW5kIHVwIGluIGEgbG9vcCB3aGVyZSB3ZSBjb250aW51ZSBjbG9zaW5nXG5cdFx0XHRcdC8vIGVkaXRvcnMgdGhhdCBmYWlsIHRvIG9wZW4gKGUuZy4gd2hlbiB0aGUgZmlsZSBubyBsb25nZXIgZXhpc3RzKS4gV2UgZG8gbm90IHdhbnQgdG8gc2hvd1xuXHRcdFx0XHQvLyByZXBlYXRlZCBlcnJvcnMgaW4gdGhpcyBjYXNlIHRvIHRoZSB1c2VyLiBBcyBzdWNoLCBpZiB3ZSBvcGVuIHRoZSBuZXh0IGVkaXRvciBhbmQgd2UgYXJlXG5cdFx0XHRcdC8vIGluIGEgc2NvcGUgb2YgYSBwcmV2aW91cyBlZGl0b3IgZmFpbGluZywgd2Ugc2lsZW5jZSB0aGUgaW5wdXQgZXJyb3JzIHVudGlsIHRoZSBlZGl0b3IgaXNcblx0XHRcdFx0Ly8gb3BlbmVkIGJ5IHNldHRpbmcgaWdub3JlRXJyb3I6IHRydWUuXG5cdFx0XHRcdGlnbm9yZUVycm9yOiBpbnRlcm5hbE9wdGlvbnM/LmZyb21FcnJvclxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgaW50ZXJuYWxFZGl0b3JPcGVuT3B0aW9uczogSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMgPSB7XG5cdFx0XHRcdC8vIFdoZW4gY2xvc2luZyBhbiBlZGl0b3IsIHdlIHJldmVhbCB0aGUgbmV4dCBvbmUgaW4gdGhlIGdyb3VwLlxuXHRcdFx0XHQvLyBIb3dldmVyLCB0aGlzIGNhbiBiZSBhIHJlc3VsdCBvZiBtb3ZpbmcgYW4gZWRpdG9yIHRvIGFub3RoZXJcblx0XHRcdFx0Ly8gd2luZG93IHNvIHdlIGV4cGxpY2l0bHkgZGlzYWJsZSB3aW5kb3cgcmVvcmRlcmluZyBpbiB0aGlzIGNhc2UuXG5cdFx0XHRcdHByZXNlcnZlV2luZG93T3JkZXI6IHRydWVcblx0XHRcdH07XG5cblx0XHRcdHRoaXMuZG9PcGVuRWRpdG9yKG5leHRBY3RpdmVFZGl0b3IsIG9wdGlvbnMsIGludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSB3ZSBhcmUgZW1wdHksIHNvIGNsZWFyIGZyb20gZWRpdG9yIGNvbnRyb2wgYW5kIHNlbmQgZXZlbnRcblx0XHRlbHNlIHtcblxuXHRcdFx0Ly8gRm9yd2FyZCB0byBlZGl0b3IgcGFuZVxuXHRcdFx0aWYgKGVkaXRvclRvQ2xvc2UpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3JQYW5lLmNsb3NlRWRpdG9yKGVkaXRvclRvQ2xvc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXN0b3JlIGZvY3VzIHRvIGdyb3VwIGNvbnRhaW5lciBhcyBuZWVkZWQgdW5sZXNzIGdyb3VwIGdldHMgY2xvc2VkXG5cdFx0XHRpZiAocmVzdG9yZUZvY3VzICYmICFjbG9zZUVtcHR5R3JvdXApIHtcblx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFdmVudHNcblx0XHRcdHRoaXMuX29uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoeyBlZGl0b3I6IHVuZGVmaW5lZCB9KTtcblxuXHRcdFx0Ly8gUmVtb3ZlIGVtcHR5IGdyb3VwIGlmIHdlIHNob3VsZFxuXHRcdFx0aWYgKGNsb3NlRW1wdHlHcm91cCkge1xuXHRcdFx0XHR0aGlzLmdyb3Vwc1ZpZXcucmVtb3ZlR3JvdXAodGhpcywgcHJlc2VydmVGb2N1cyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRSZXN0b3JlRm9jdXModGFyZ2V0OiBFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IGdldEFjdGl2ZUVsZW1lbnQoKTtcblx0XHRpZiAoYWN0aXZlRWxlbWVudCA9PT0gdGFyZ2V0Lm93bmVyRG9jdW1lbnQuYm9keSkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIGFsd2F5cyByZXN0b3JlIGZvY3VzIGlmIG5vdGhpbmcgaXMgZm9jdXNlZCBjdXJyZW50bHlcblx0XHR9XG5cblx0XHQvLyBvdGhlcndpc2UgY2hlY2sgZm9yIHRoZSBhY3RpdmUgZWxlbWVudCBiZWluZyBhbiBhbmNlc3RvciBvZiB0aGUgdGFyZ2V0XG5cdFx0cmV0dXJuIGlzQW5jZXN0b3IoYWN0aXZlRWxlbWVudCwgdGFyZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgZG9DbG9zZUluYWN0aXZlRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIGludGVybmFsT3B0aW9ucz86IElJbnRlcm5hbEVkaXRvckNsb3NlT3B0aW9ucyk6IHZvaWQge1xuXG5cdFx0Ly8gVXBkYXRlIG1vZGVsXG5cdFx0dGhpcy5tb2RlbC5jbG9zZUVkaXRvcihlZGl0b3IsIGludGVybmFsT3B0aW9ucz8uY29udGV4dCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZUNsb3NlQ29uZmlybWF0aW9uKGVkaXRvcnM6IEVkaXRvcklucHV0W10pOiBQcm9taXNlPGJvb2xlYW4gLyogdmV0byAqLz4ge1xuXHRcdGlmICghZWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gbm8gdmV0b1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IGVkaXRvcnMuc2hpZnQoKSE7XG5cblx0XHQvLyBUbyBwcmV2ZW50IG11bHRpcGxlIGNvbmZpcm1hdGlvbiBkaWFsb2dzIGZyb20gc2hvd2luZyB1cCBvbmUgYWZ0ZXIgdGhlIG90aGVyXG5cdFx0Ly8gd2UgY2hlY2sgaWYgYSBwZW5kaW5nIGNvbmZpcm1hdGlvbiBpcyBjdXJyZW50bHkgc2hvd2luZyBhbmQgaWYgc28sIGpvaW4gdGhhdFxuXHRcdGxldCBoYW5kbGVDbG9zZUNvbmZpcm1hdGlvblByb21pc2UgPSB0aGlzLm1hcEVkaXRvclRvUGVuZGluZ0NvbmZpcm1hdGlvbi5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWhhbmRsZUNsb3NlQ29uZmlybWF0aW9uUHJvbWlzZSkge1xuXHRcdFx0aGFuZGxlQ2xvc2VDb25maXJtYXRpb25Qcm9taXNlID0gdGhpcy5kb0hhbmRsZUNsb3NlQ29uZmlybWF0aW9uKGVkaXRvcik7XG5cdFx0XHR0aGlzLm1hcEVkaXRvclRvUGVuZGluZ0NvbmZpcm1hdGlvbi5zZXQoZWRpdG9yLCBoYW5kbGVDbG9zZUNvbmZpcm1hdGlvblByb21pc2UpO1xuXHRcdH1cblxuXHRcdGxldCB2ZXRvOiBib29sZWFuO1xuXHRcdHRyeSB7XG5cdFx0XHR2ZXRvID0gYXdhaXQgaGFuZGxlQ2xvc2VDb25maXJtYXRpb25Qcm9taXNlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLm1hcEVkaXRvclRvUGVuZGluZ0NvbmZpcm1hdGlvbi5kZWxldGUoZWRpdG9yKTtcblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gZm9yIHRoZSBmaXJzdCB2ZXRvIHdlIGdvdFxuXHRcdGlmICh2ZXRvKSB7XG5cdFx0XHRyZXR1cm4gdmV0bztcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgY29udGludWUgd2l0aCB0aGUgcmVtYWluZGVyc1xuXHRcdHJldHVybiB0aGlzLmhhbmRsZUNsb3NlQ29uZmlybWF0aW9uKGVkaXRvcnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0hhbmRsZUNsb3NlQ29uZmlybWF0aW9uKGVkaXRvcjogRWRpdG9ySW5wdXQsIG9wdGlvbnM/OiB7IHNraXBBdXRvU2F2ZTogYm9vbGVhbiB9KTogUHJvbWlzZTxib29sZWFuIC8qIHZldG8gKi8+IHtcblx0XHRpZiAoIXRoaXMuc2hvdWxkQ29uZmlybUNsb3NlKGVkaXRvcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gbm8gdmV0b1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgJiYgdGhpcy5tb2RlbC5jb250YWlucyhlZGl0b3IucHJpbWFyeSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gcHJpbWFyeS1zaWRlIG9mIGVkaXRvciBpcyBzdGlsbCBvcGVuZWQgc29tZXdoZXJlIGVsc2Vcblx0XHR9XG5cblx0XHQvLyBOb3RlOiB3ZSBleHBsaWNpdGx5IGRlY2lkZSB0byBhc2sgZm9yIGNvbmZpcm0gaWYgY2xvc2luZyBhIG5vcm1hbCBlZGl0b3IgZXZlblxuXHRcdC8vIGlmIGl0IGlzIG9wZW5lZCBpbiBhIHNpZGUtYnktc2lkZSBlZGl0b3IgaW4gdGhlIGdyb3VwLiBUaGlzIGRlY2lzaW9uIGlzIG1hZGVcblx0XHQvLyBiZWNhdXNlIGl0IG1heSBiZSBsZXNzIG9idmlvdXMgdGhhdCBvbmUgc2lkZSBvZiBhIHNpZGUgYnkgc2lkZSBlZGl0b3IgaXMgZGlydHlcblx0XHQvLyBhbmQgY2FuIHN0aWxsIGJlIGNoYW5nZWQuXG5cdFx0Ly8gVGhlIG9ubHkgZXhjZXB0aW9uIGlzIHdoZW4gdGhlIHNhbWUgZWRpdG9yIGlzIG9wZW5lZCBvbiBib3RoIHNpZGVzIG9mIGEgc2lkZVxuXHRcdC8vIGJ5IHNpZGUgZWRpdG9yIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM4NDQyKVxuXG5cdFx0aWYgKHRoaXMuZWRpdG9yUGFydHNWaWV3Lmdyb3Vwcy5zb21lKGdyb3VwVmlldyA9PiB7XG5cdFx0XHRpZiAoZ3JvdXBWaWV3ID09PSB0aGlzKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gc2tpcCAod2UgYWxyZWFkeSBoYW5kbGVkIG91ciBncm91cCBhYm92ZSlcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3RoZXJHcm91cCA9IGdyb3VwVmlldztcblx0XHRcdGlmIChvdGhlckdyb3VwLmNvbnRhaW5zKGVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5CT1RIIH0pKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlOyAvLyBleGFjdCBlZGl0b3Igc3RpbGwgb3BlbmVkIChlaXRoZXIgc2luZ2xlLCBvciBzcGxpdC1pbi1ncm91cClcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3JJbnB1dCAmJiBvdGhlckdyb3VwLmNvbnRhaW5zKGVkaXRvci5wcmltYXJ5KSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gcHJpbWFyeSBzaWRlIG9mIHNpZGUgYnkgc2lkZSBlZGl0b3Igc3RpbGwgb3BlbmVkXG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBlZGl0b3IgaXMgc3RpbGwgZWRpdGFibGUgc29tZXdoZXJlIGVsc2Vcblx0XHR9XG5cblx0XHQvLyBJbiBzb21lIGNhc2VzIHRyaWdnZXIgc2F2ZSBiZWZvcmUgb3BlbmluZyB0aGUgZGlhbG9nIGRlcGVuZGluZ1xuXHRcdC8vIG9uIGF1dG8tc2F2ZSBjb25maWd1cmF0aW9uLlxuXHRcdC8vIEhvd2V2ZXIsIG1ha2Ugc3VyZSB0byByZXNwZWN0IGBza2lwQXV0b1NhdmVgIG9wdGlvbiBpbiBjYXNlIHRoZSBhdXRvbWF0ZWRcblx0XHQvLyBzYXZlIGZhaWxzIHdoaWNoIHdvdWxkIHJlc3VsdCBpbiB0aGUgZWRpdG9yIG5ldmVyIGNsb3NpbmcuXG5cdFx0Ly8gQWxzbywgd2Ugb25seSBkbyB0aGlzIGlmIG5vIGN1c3RvbSBjb25maXJtYXRpb24gaGFuZGxpbmcgaXMgaW1wbGVtZW50ZWQuXG5cdFx0bGV0IGNvbmZpcm1hdGlvbiA9IENvbmZpcm1SZXN1bHQuQ0FOQ0VMO1xuXHRcdGxldCBzYXZlUmVhc29uID0gU2F2ZVJlYXNvbi5FWFBMSUNJVDtcblx0XHRsZXQgYXV0b1NhdmUgPSBmYWxzZTtcblx0XHRpZiAoIWVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkKSAmJiAhb3B0aW9ucz8uc2tpcEF1dG9TYXZlICYmICFlZGl0b3IuY2xvc2VIYW5kbGVyKSB7XG5cblx0XHRcdC8vIEF1dG8tc2F2ZSBvbiBmb2N1cyBjaGFuZ2U6IHNhdmUsIGJlY2F1c2UgYSBkaWFsb2cgd291bGQgc3RlYWwgZm9jdXNcblx0XHRcdC8vIChzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwODc1Milcblx0XHRcdGlmICh0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0QXV0b1NhdmVNb2RlKGVkaXRvcikubW9kZSA9PT0gQXV0b1NhdmVNb2RlLk9OX0ZPQ1VTX0NIQU5HRSkge1xuXHRcdFx0XHRhdXRvU2F2ZSA9IHRydWU7XG5cdFx0XHRcdGNvbmZpcm1hdGlvbiA9IENvbmZpcm1SZXN1bHQuU0FWRTtcblx0XHRcdFx0c2F2ZVJlYXNvbiA9IFNhdmVSZWFzb24uRk9DVVNfQ0hBTkdFO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBdXRvLXNhdmUgb24gd2luZG93IGNoYW5nZTogc2F2ZSwgYmVjYXVzZSBvbiBXaW5kb3dzIGFuZCBMaW51eCwgYVxuXHRcdFx0Ly8gbmF0aXZlIGRpYWxvZyB0cmlnZ2VycyB0aGUgd2luZG93IGZvY3VzIGNoYW5nZVxuXHRcdFx0Ly8gKHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM0MjUwKVxuXHRcdFx0ZWxzZSBpZiAoKGlzTmF0aXZlICYmIChpc1dpbmRvd3MgfHwgaXNMaW51eCkpICYmIHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5nZXRBdXRvU2F2ZU1vZGUoZWRpdG9yKS5tb2RlID09PSBBdXRvU2F2ZU1vZGUuT05fV0lORE9XX0NIQU5HRSkge1xuXHRcdFx0XHRhdXRvU2F2ZSA9IHRydWU7XG5cdFx0XHRcdGNvbmZpcm1hdGlvbiA9IENvbmZpcm1SZXN1bHQuU0FWRTtcblx0XHRcdFx0c2F2ZVJlYXNvbiA9IFNhdmVSZWFzb24uV0lORE9XX0NIQU5HRTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBObyBhdXRvLXNhdmUgb24gZm9jdXMgY2hhbmdlIG9yIGN1c3RvbSBjb25maXJtYXRpb24gaGFuZGxlcjogYXNrIHVzZXJcblx0XHRpZiAoIWF1dG9TYXZlKSB7XG5cblx0XHRcdC8vIFN3aXRjaCB0byBlZGl0b3IgdGhhdCB3ZSB3YW50IHRvIGhhbmRsZSBmb3IgY29uZmlybWF0aW9uIHVubGVzcyBzaG93aW5nIGFscmVhZHlcblx0XHRcdGlmICghdGhpcy5hY3RpdmVFZGl0b3I/Lm1hdGNoZXMoZWRpdG9yKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvT3BlbkVkaXRvcihlZGl0b3IpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFbnN1cmUgb3VyIHdpbmRvdyBoYXMgZm9jdXMgc2luY2Ugd2UgYXJlIGFib3V0IHRvIHNob3cgYSBkaWFsb2dcblx0XHRcdGF3YWl0IHRoaXMuaG9zdFNlcnZpY2UuZm9jdXMoZ2V0V2luZG93KHRoaXMuZWxlbWVudCkpO1xuXG5cdFx0XHQvLyBMZXQgZWRpdG9yIGhhbmRsZSBjb25maXJtYXRpb24gaWYgaW1wbGVtZW50ZWRcblx0XHRcdGxldCBoYW5kbGVyRGlkRXJyb3IgPSBmYWxzZTtcblx0XHRcdGlmICh0eXBlb2YgZWRpdG9yLmNsb3NlSGFuZGxlcj8uY29uZmlybSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbmZpcm1hdGlvbiA9IGF3YWl0IGVkaXRvci5jbG9zZUhhbmRsZXIuY29uZmlybShbeyBlZGl0b3IsIGdyb3VwSWQ6IHRoaXMuaWQgfV0pO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0XHRcdGhhbmRsZXJEaWRFcnJvciA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gU2hvdyBhIGZpbGUgc3BlY2lmaWMgY29uZmlybWF0aW9uIGlmIHRoZXJlIGlzIG5vIGhhbmRsZXIgb3IgaXQgZXJyb3JlZFxuXHRcdFx0aWYgKHR5cGVvZiBlZGl0b3IuY2xvc2VIYW5kbGVyPy5jb25maXJtICE9PSAnZnVuY3Rpb24nIHx8IGhhbmRsZXJEaWRFcnJvcikge1xuXHRcdFx0XHRsZXQgbmFtZTogc3RyaW5nO1xuXHRcdFx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0KSB7XG5cdFx0XHRcdFx0bmFtZSA9IGVkaXRvci5wcmltYXJ5LmdldE5hbWUoKTsgLy8gcHJlZmVyIHNob3J0ZXIgbmFtZXMgYnkgdXNpbmcgcHJpbWFyeSdzIG5hbWUgaW4gdGhpcyBjYXNlXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmFtZSA9IGVkaXRvci5nZXROYW1lKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25maXJtYXRpb24gPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dTYXZlQ29uZmlybShbbmFtZV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEl0IGNvdWxkIGJlIHRoYXQgdGhlIGVkaXRvcidzIGNob2ljZSBvZiBjb25maXJtYXRpb24gaGFzIGNoYW5nZWRcblx0XHQvLyBnaXZlbiB0aGUgY2hlY2sgZm9yIGNvbmZpcm1hdGlvbiBpcyBsb25nIHJ1bm5pbmcsIHNvIHdlIGNoZWNrXG5cdFx0Ly8gYWdhaW4gdG8gc2VlIGlmIGFueXRoaW5nIG5lZWRzIHRvIGhhcHBlbiBiZWZvcmUgY2xvc2luZyBmb3IgZ29vZC5cblx0XHQvLyBUaGlzIGNhbiBoYXBwZW4gZm9yIGV4YW1wbGUgaWYgYGF1dG9TYXZlOiBvbkZvY3VzQ2hhbmdlYCBpcyBjb25maWd1cmVkXG5cdFx0Ly8gc28gdGhhdCB0aGUgc2F2ZSBoYXBwZW5zIHdoZW4gdGhlIGRpYWxvZyBvcGVucy5cblx0XHQvLyBIb3dldmVyLCB3ZSBvbmx5IGRvIHRoaXMgdW5sZXNzIGEgY3VzdG9tIGNvbmZpcm0gaGFuZGxlciBpcyBpbnN0YWxsZWRcblx0XHQvLyB0aGF0IG1heSBub3QgYmUgZml0IHRvIGJlIGFza2VkIGEgc2Vjb25kIHRpbWUgcmlnaHQgYWZ0ZXIuXG5cdFx0aWYgKCFlZGl0b3IuY2xvc2VIYW5kbGVyICYmICF0aGlzLnNob3VsZENvbmZpcm1DbG9zZShlZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlybWF0aW9uID09PSBDb25maXJtUmVzdWx0LkNBTkNFTDtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UsIGhhbmRsZSBhY2NvcmRpbmdseVxuXHRcdHN3aXRjaCAoY29uZmlybWF0aW9uKSB7XG5cdFx0XHRjYXNlIENvbmZpcm1SZXN1bHQuU0FWRToge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBlZGl0b3Iuc2F2ZSh0aGlzLmlkLCB7IHJlYXNvbjogc2F2ZVJlYXNvbiB9KTtcblx0XHRcdFx0aWYgKCFyZXN1bHQgJiYgYXV0b1NhdmUpIHtcblx0XHRcdFx0XHQvLyBTYXZlIGZhaWxlZCBhbmQgd2UgbmVlZCB0byBzaWduYWwgdGhpcyBiYWNrIHRvIHRoZSB1c2VyLCBzb1xuXHRcdFx0XHRcdC8vIHdlIGhhbmRsZSB0aGUgZGlydHkgZWRpdG9yIGFnYWluIGJ1dCB0aGlzIHRpbWUgZW5zdXJpbmcgdG9cblx0XHRcdFx0XHQvLyBzaG93IHRoZSBjb25maXJtIGRpYWxvZ1xuXHRcdFx0XHRcdC8vIChzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwODc1Milcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5kb0hhbmRsZUNsb3NlQ29uZmlybWF0aW9uKGVkaXRvciwgeyBza2lwQXV0b1NhdmU6IHRydWUgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gZWRpdG9yLmlzRGlydHkoKTsgLy8gdmV0byBpZiBzdGlsbCBkaXJ0eVxuXHRcdFx0fVxuXHRcdFx0Y2FzZSBDb25maXJtUmVzdWx0LkRPTlRfU0FWRTpcblx0XHRcdFx0dHJ5IHtcblxuXHRcdFx0XHRcdC8vIGZpcnN0IHRyeSBhIG5vcm1hbCByZXZlcnQgd2hlcmUgdGhlIGNvbnRlbnRzIG9mIHRoZSBlZGl0b3IgYXJlIHJlc3RvcmVkXG5cdFx0XHRcdFx0YXdhaXQgZWRpdG9yLnJldmVydCh0aGlzLmlkKTtcblxuXHRcdFx0XHRcdHJldHVybiBlZGl0b3IuaXNEaXJ0eSgpOyAvLyB2ZXRvIGlmIHN0aWxsIGRpcnR5XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblxuXHRcdFx0XHRcdC8vIGlmIHRoYXQgZmFpbHMsIHNpbmNlIHdlIGFyZSBhYm91dCB0byBjbG9zZSB0aGUgZWRpdG9yLCB3ZSBhY2NlcHQgdGhhdFxuXHRcdFx0XHRcdC8vIHRoZSBlZGl0b3IgY2Fubm90IGJlIHJldmVydGVkIGFuZCBpbnN0ZWFkIGRvIGEgc29mdCByZXZlcnQgdGhhdCBqdXN0XG5cdFx0XHRcdFx0Ly8gZW5hYmxlcyB1cyB0byBjbG9zZSB0aGUgZWRpdG9yLiBXaXRoIHRoaXMsIGEgdXNlciBjYW4gYWx3YXlzIGNsb3NlIGFcblx0XHRcdFx0XHQvLyBkaXJ0eSBlZGl0b3IgZXZlbiB3aGVuIHJldmVydGluZyBmYWlscy5cblxuXHRcdFx0XHRcdGF3YWl0IGVkaXRvci5yZXZlcnQodGhpcy5pZCwgeyBzb2Z0OiB0cnVlIH0pO1xuXG5cdFx0XHRcdFx0cmV0dXJuIGVkaXRvci5pc0RpcnR5KCk7IC8vIHZldG8gaWYgc3RpbGwgZGlydHlcblx0XHRcdFx0fVxuXHRcdFx0Y2FzZSBDb25maXJtUmVzdWx0LkNBTkNFTDpcblx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIHZldG9cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZENvbmZpcm1DbG9zZShlZGl0b3I6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0aWYgKGVkaXRvci5jbG9zZUhhbmRsZXIpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBlZGl0b3IuY2xvc2VIYW5kbGVyLnNob3dDb25maXJtKCk7IC8vIGN1c3RvbSBoYW5kbGluZyBvZiBjb25maXJtYXRpb24gb24gY2xvc2Vcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvci5pc0RpcnR5KCkgJiYgIWVkaXRvci5pc1NhdmluZygpOyAvLyBlZGl0b3IgbXVzdCBiZSBkaXJ0eSBhbmQgbm90IHNhdmluZ1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIGNsb3NlRWRpdG9ycygpXG5cblx0YXN5bmMgY2xvc2VFZGl0b3JzKGFyZ3M6IEVkaXRvcklucHV0W10gfCBJQ2xvc2VFZGl0b3JzRmlsdGVyLCBvcHRpb25zPzogSUNsb3NlRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLmlzRW1wdHkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvcnMgPSB0aGlzLmRvR2V0RWRpdG9yc1RvQ2xvc2UoYXJncyk7XG5cblx0XHQvLyBDaGVjayBmb3IgY29uZmlybWF0aW9uIGFuZCB2ZXRvXG5cdFx0Y29uc3QgdmV0byA9IGF3YWl0IHRoaXMuaGFuZGxlQ2xvc2VDb25maXJtYXRpb24oZWRpdG9ycy5zbGljZSgwKSk7XG5cdFx0aWYgKHZldG8pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBEbyBjbG9zZVxuXHRcdHRoaXMuZG9DbG9zZUVkaXRvcnMoZWRpdG9ycywgb3B0aW9ucyk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZG9HZXRFZGl0b3JzVG9DbG9zZShhcmdzOiBFZGl0b3JJbnB1dFtdIHwgSUNsb3NlRWRpdG9yc0ZpbHRlcik6IEVkaXRvcklucHV0W10ge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG5cdFx0XHRyZXR1cm4gYXJncztcblx0XHR9XG5cblx0XHRjb25zdCBmaWx0ZXIgPSBhcmdzO1xuXHRcdGNvbnN0IGhhc0RpcmVjdGlvbiA9IHR5cGVvZiBmaWx0ZXIuZGlyZWN0aW9uID09PSAnbnVtYmVyJztcblxuXHRcdGxldCBlZGl0b3JzVG9DbG9zZSA9IHRoaXMubW9kZWwuZ2V0RWRpdG9ycyhoYXNEaXJlY3Rpb24gPyBFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCA6IEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSwgZmlsdGVyKTsgLy8gaW4gTVJVIG9yZGVyIG9ubHkgaWYgZGlyZWN0aW9uIGlzIG5vdCBzcGVjaWZpZWRcblxuXHRcdC8vIEZpbHRlcjogc2F2ZWQgb3Igc2F2aW5nIG9ubHlcblx0XHRpZiAoZmlsdGVyLnNhdmVkT25seSkge1xuXHRcdFx0ZWRpdG9yc1RvQ2xvc2UgPSBlZGl0b3JzVG9DbG9zZS5maWx0ZXIoZWRpdG9yID0+ICFlZGl0b3IuaXNEaXJ0eSgpIHx8IGVkaXRvci5pc1NhdmluZygpKTtcblx0XHR9XG5cblx0XHQvLyBGaWx0ZXI6IGRpcmVjdGlvbiAobGVmdCAvIHJpZ2h0KVxuXHRcdGVsc2UgaWYgKGhhc0RpcmVjdGlvbiAmJiBmaWx0ZXIuZXhjZXB0KSB7XG5cdFx0XHRlZGl0b3JzVG9DbG9zZSA9IChmaWx0ZXIuZGlyZWN0aW9uID09PSBDbG9zZURpcmVjdGlvbi5MRUZUKSA/XG5cdFx0XHRcdGVkaXRvcnNUb0Nsb3NlLnNsaWNlKDAsIHRoaXMubW9kZWwuaW5kZXhPZihmaWx0ZXIuZXhjZXB0LCBlZGl0b3JzVG9DbG9zZSkpIDpcblx0XHRcdFx0ZWRpdG9yc1RvQ2xvc2Uuc2xpY2UodGhpcy5tb2RlbC5pbmRleE9mKGZpbHRlci5leGNlcHQsIGVkaXRvcnNUb0Nsb3NlKSArIDEpO1xuXHRcdH1cblxuXHRcdC8vIEZpbHRlcjogZXhjZXB0XG5cdFx0ZWxzZSBpZiAoZmlsdGVyLmV4Y2VwdCkge1xuXHRcdFx0ZWRpdG9yc1RvQ2xvc2UgPSBlZGl0b3JzVG9DbG9zZS5maWx0ZXIoZWRpdG9yID0+IGZpbHRlci5leGNlcHQgJiYgIWVkaXRvci5tYXRjaGVzKGZpbHRlci5leGNlcHQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdG9yc1RvQ2xvc2U7XG5cdH1cblxuXHRwcml2YXRlIGRvQ2xvc2VFZGl0b3JzKGVkaXRvcnM6IEVkaXRvcklucHV0W10sIG9wdGlvbnM/OiBJQ2xvc2VFZGl0b3JPcHRpb25zKTogdm9pZCB7XG5cblx0XHQvLyBDbG9zZSBhbGwgaW5hY3RpdmUgZWRpdG9ycyBmaXJzdFxuXHRcdGxldCBjbG9zZUFjdGl2ZUVkaXRvciA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdGlmICghdGhpcy5pc0FjdGl2ZShlZGl0b3IpKSB7XG5cdFx0XHRcdHRoaXMuZG9DbG9zZUluYWN0aXZlRWRpdG9yKGVkaXRvcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjbG9zZUFjdGl2ZUVkaXRvciA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvc2UgYWN0aXZlIGVkaXRvciBsYXN0IGlmIGNvbnRhaW5lZCBpbiBlZGl0b3JzIGxpc3QgdG8gY2xvc2Vcblx0XHRpZiAoY2xvc2VBY3RpdmVFZGl0b3IpIHtcblx0XHRcdHRoaXMuZG9DbG9zZUFjdGl2ZUVkaXRvcihvcHRpb25zPy5wcmVzZXJ2ZUZvY3VzKTtcblx0XHR9XG5cblx0XHQvLyBGb3J3YXJkIHRvIHRpdGxlIGNvbnRyb2xcblx0XHRpZiAoZWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdHRoaXMudGl0bGVDb250cm9sLmNsb3NlRWRpdG9ycyhlZGl0b3JzKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gY2xvc2VBbGxFZGl0b3JzKClcblxuXHRjbG9zZUFsbEVkaXRvcnMob3B0aW9uczogeyBleGNsdWRlQ29uZmlybWluZzogdHJ1ZSB9KTogYm9vbGVhbjtcblx0Y2xvc2VBbGxFZGl0b3JzKG9wdGlvbnM/OiBJQ2xvc2VBbGxFZGl0b3JzT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj47XG5cdGNsb3NlQWxsRWRpdG9ycyhvcHRpb25zPzogSUNsb3NlQWxsRWRpdG9yc09wdGlvbnMpOiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHRoaXMuaXNFbXB0eSkge1xuXG5cdFx0XHQvLyBJZiB0aGUgZ3JvdXAgaXMgZW1wdHkgYW5kIHRoZSByZXF1ZXN0IGlzIHRvIGNsb3NlIGFsbCBlZGl0b3JzLCB3ZSBzdGlsbCBjbG9zZVxuXHRcdFx0Ly8gdGhlIGVkaXRvciBncm91cCBpcyB0aGUgcmVsYXRlZCBzZXR0aW5nIHRvIGNsb3NlIGVtcHR5IGdyb3VwcyBpcyBlbmFibGVkIGZvclxuXHRcdFx0Ly8gYSBjb252ZW5pZW50IHdheSBvZiByZW1vdmluZyBlbXB0eSBlZGl0b3IgZ3JvdXBzIGZvciB0aGUgdXNlci5cblx0XHRcdGlmICh0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMuY2xvc2VFbXB0eUdyb3Vwcykge1xuXHRcdFx0XHR0aGlzLmdyb3Vwc1ZpZXcucmVtb3ZlR3JvdXAodGhpcyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFdlIGNhbiBnbyBhaGVhZCBhbmQgY2xvc2UgXCJzeW5jXCIgd2hlbiB3ZSBleGNsdWRlIGNvbmZpcm1pbmcgZWRpdG9yc1xuXHRcdGlmIChvcHRpb25zPy5leGNsdWRlQ29uZmlybWluZykge1xuXHRcdFx0dGhpcy5kb0Nsb3NlQWxsRWRpdG9ycyhvcHRpb25zKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBnbyB0aHJvdWdoIHBvdGVudGlhbCBjb25maXJtYXRpb24gXCJhc3luY1wiXG5cdFx0cmV0dXJuIHRoaXMuaGFuZGxlQ2xvc2VDb25maXJtYXRpb24odGhpcy5tb2RlbC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSwgb3B0aW9ucykpLnRoZW4odmV0byA9PiB7XG5cdFx0XHRpZiAodmV0bykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZG9DbG9zZUFsbEVkaXRvcnMob3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZG9DbG9zZUFsbEVkaXRvcnMob3B0aW9ucz86IElDbG9zZUFsbEVkaXRvcnNPcHRpb25zKTogdm9pZCB7XG5cdFx0bGV0IGVkaXRvcnMgPSB0aGlzLm1vZGVsLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwsIG9wdGlvbnMpO1xuXHRcdGlmIChvcHRpb25zPy5leGNsdWRlQ29uZmlybWluZykge1xuXHRcdFx0ZWRpdG9ycyA9IGVkaXRvcnMuZmlsdGVyKGVkaXRvciA9PiAhdGhpcy5zaG91bGRDb25maXJtQ2xvc2UoZWRpdG9yKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvc2UgYWxsIGluYWN0aXZlIGVkaXRvcnMgZmlyc3Rcblx0XHRjb25zdCBlZGl0b3JzVG9DbG9zZTogRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdGlmICghdGhpcy5pc0FjdGl2ZShlZGl0b3IpKSB7XG5cdFx0XHRcdHRoaXMuZG9DbG9zZUluYWN0aXZlRWRpdG9yKGVkaXRvcik7XG5cdFx0XHR9XG5cblx0XHRcdGVkaXRvcnNUb0Nsb3NlLnB1c2goZWRpdG9yKTtcblx0XHR9XG5cblx0XHQvLyBDbG9zZSBhY3RpdmUgZWRpdG9yIGxhc3QgKHVubGVzcyB3ZSBza2lwIGl0LCBlLmcuIGJlY2F1c2UgaXQgaXMgc3RpY2t5KVxuXHRcdGlmICh0aGlzLmFjdGl2ZUVkaXRvciAmJiBlZGl0b3JzVG9DbG9zZS5pbmNsdWRlcyh0aGlzLmFjdGl2ZUVkaXRvcikpIHtcblx0XHRcdHRoaXMuZG9DbG9zZUFjdGl2ZUVkaXRvcigpO1xuXHRcdH1cblxuXHRcdC8vIEZvcndhcmQgdG8gdGl0bGUgY29udHJvbFxuXHRcdGlmIChlZGl0b3JzVG9DbG9zZS5sZW5ndGgpIHtcblx0XHRcdHRoaXMudGl0bGVDb250cm9sLmNsb3NlRWRpdG9ycyhlZGl0b3JzVG9DbG9zZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIHJlcGxhY2VFZGl0b3JzKClcblxuXHRhc3luYyByZXBsYWNlRWRpdG9ycyhlZGl0b3JzOiBFZGl0b3JSZXBsYWNlbWVudFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBFeHRyYWN0IGFjdGl2ZSB2cy4gaW5hY3RpdmUgcmVwbGFjZW1lbnRzXG5cdFx0bGV0IGFjdGl2ZVJlcGxhY2VtZW50OiBFZGl0b3JSZXBsYWNlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpbmFjdGl2ZVJlcGxhY2VtZW50czogRWRpdG9yUmVwbGFjZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAobGV0IHsgZWRpdG9yLCByZXBsYWNlbWVudCwgZm9yY2VSZXBsYWNlRGlydHksIG9wdGlvbnMgfSBvZiBlZGl0b3JzKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuZ2V0SW5kZXhPZkVkaXRvcihlZGl0b3IpO1xuXHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0Y29uc3QgaXNBY3RpdmVFZGl0b3IgPSB0aGlzLmlzQWN0aXZlKGVkaXRvcik7XG5cblx0XHRcdFx0Ly8gbWFrZSBzdXJlIHdlIHJlc3BlY3QgdGhlIGluZGV4IG9mIHRoZSBlZGl0b3IgdG8gcmVwbGFjZVxuXHRcdFx0XHRpZiAob3B0aW9ucykge1xuXHRcdFx0XHRcdG9wdGlvbnMuaW5kZXggPSBpbmRleDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvcHRpb25zID0geyBpbmRleCB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0b3B0aW9ucy5pbmFjdGl2ZSA9ICFpc0FjdGl2ZUVkaXRvcjtcblx0XHRcdFx0b3B0aW9ucy5waW5uZWQgPSBvcHRpb25zLnBpbm5lZCA/PyB0cnVlOyAvLyB1bmxlc3Mgc3BlY2lmaWVkLCBwcmVmZXIgdG8gcGluIHVwb24gcmVwbGFjZVxuXG5cdFx0XHRcdGNvbnN0IGVkaXRvclRvUmVwbGFjZSA9IHsgZWRpdG9yLCByZXBsYWNlbWVudCwgZm9yY2VSZXBsYWNlRGlydHksIG9wdGlvbnMgfTtcblx0XHRcdFx0aWYgKGlzQWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdFx0YWN0aXZlUmVwbGFjZW1lbnQgPSBlZGl0b3JUb1JlcGxhY2U7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5hY3RpdmVSZXBsYWNlbWVudHMucHVzaChlZGl0b3JUb1JlcGxhY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGluYWN0aXZlIGZpcnN0XG5cdFx0Zm9yIChjb25zdCB7IGVkaXRvciwgcmVwbGFjZW1lbnQsIGZvcmNlUmVwbGFjZURpcnR5LCBvcHRpb25zIH0gb2YgaW5hY3RpdmVSZXBsYWNlbWVudHMpIHtcblxuXHRcdFx0Ly8gT3BlbiBpbmFjdGl2ZSBlZGl0b3Jcblx0XHRcdGF3YWl0IHRoaXMuZG9PcGVuRWRpdG9yKHJlcGxhY2VtZW50LCBvcHRpb25zKTtcblxuXHRcdFx0Ly8gQ2xvc2UgcmVwbGFjZWQgaW5hY3RpdmUgZWRpdG9yIHVubGVzcyB0aGV5IG1hdGNoXG5cdFx0XHRpZiAoIWVkaXRvci5tYXRjaGVzKHJlcGxhY2VtZW50KSkge1xuXHRcdFx0XHRsZXQgY2xvc2VkID0gZmFsc2U7XG5cdFx0XHRcdGlmIChmb3JjZVJlcGxhY2VEaXJ0eSkge1xuXHRcdFx0XHRcdHRoaXMuZG9DbG9zZUVkaXRvcihlZGl0b3IsIHRydWUsIHsgY29udGV4dDogRWRpdG9yQ2xvc2VDb250ZXh0LlJFUExBQ0UgfSk7XG5cdFx0XHRcdFx0Y2xvc2VkID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjbG9zZWQgPSBhd2FpdCB0aGlzLmRvQ2xvc2VFZGl0b3JXaXRoQ29uZmlybWF0aW9uSGFuZGxpbmcoZWRpdG9yLCB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSwgeyBjb250ZXh0OiBFZGl0b3JDbG9zZUNvbnRleHQuUkVQTEFDRSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghY2xvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBjYW5jZWxlZFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGFjdGl2ZSBsYXN0XG5cdFx0aWYgKGFjdGl2ZVJlcGxhY2VtZW50KSB7XG5cblx0XHRcdC8vIE9wZW4gcmVwbGFjZW1lbnQgYXMgYWN0aXZlIGVkaXRvclxuXHRcdFx0Y29uc3Qgb3BlbkVkaXRvclJlc3VsdCA9IHRoaXMuZG9PcGVuRWRpdG9yKGFjdGl2ZVJlcGxhY2VtZW50LnJlcGxhY2VtZW50LCBhY3RpdmVSZXBsYWNlbWVudC5vcHRpb25zKTtcblxuXHRcdFx0Ly8gQ2xvc2UgcmVwbGFjZWQgYWN0aXZlIGVkaXRvciB1bmxlc3MgdGhleSBtYXRjaFxuXHRcdFx0aWYgKCFhY3RpdmVSZXBsYWNlbWVudC5lZGl0b3IubWF0Y2hlcyhhY3RpdmVSZXBsYWNlbWVudC5yZXBsYWNlbWVudCkpIHtcblx0XHRcdFx0aWYgKGFjdGl2ZVJlcGxhY2VtZW50LmZvcmNlUmVwbGFjZURpcnR5KSB7XG5cdFx0XHRcdFx0dGhpcy5kb0Nsb3NlRWRpdG9yKGFjdGl2ZVJlcGxhY2VtZW50LmVkaXRvciwgdHJ1ZSwgeyBjb250ZXh0OiBFZGl0b3JDbG9zZUNvbnRleHQuUkVQTEFDRSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRvQ2xvc2VFZGl0b3JXaXRoQ29uZmlybWF0aW9uSGFuZGxpbmcoYWN0aXZlUmVwbGFjZW1lbnQuZWRpdG9yLCB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSwgeyBjb250ZXh0OiBFZGl0b3JDbG9zZUNvbnRleHQuUkVQTEFDRSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCBvcGVuRWRpdG9yUmVzdWx0O1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBMb2NraW5nXG5cblx0Z2V0IGlzTG9ja2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmlzTG9ja2VkO1xuXHR9XG5cblx0bG9jayhsb2NrZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLmxvY2sobG9ja2VkKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBFZGl0b3IgQWN0aW9uc1xuXG5cdGNyZWF0ZUVkaXRvckFjdGlvbnMoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgbWVudUlkID0gTWVudUlkLkVkaXRvclRpdGxlKTogSUFjdGl2ZUVkaXRvckFjdGlvbnMge1xuXHRcdGxldCBhY3Rpb25zOiBQcmltYXJ5QW5kU2Vjb25kYXJ5QWN0aW9ucyA9IHsgcHJpbWFyeTogW10sIHNlY29uZGFyeTogW10gfTtcblx0XHRsZXQgb25EaWRDaGFuZ2U6IEV2ZW50PElNZW51Q2hhbmdlRXZlbnQgfCB2b2lkPiB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIEVkaXRvciBhY3Rpb25zIHJlcXVpcmUgdGhlIGVkaXRvciBjb250cm9sIHRvIGJlIHRoZXJlLCBzbyB3ZSByZXRyaWV2ZSBpdCB2aWEgc2VydmljZVxuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSB0aGlzLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBFZGl0b3JQYW5lKSB7XG5cdFx0XHRjb25zdCBlZGl0b3JTY29wZWRDb250ZXh0S2V5U2VydmljZSA9IGFjdGl2ZUVkaXRvclBhbmUuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPz8gdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZTtcblx0XHRcdGNvbnN0IGVkaXRvclRpdGxlTWVudSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUobWVudUlkLCBlZGl0b3JTY29wZWRDb250ZXh0S2V5U2VydmljZSwgeyBlbWl0RXZlbnRzRm9yU3VibWVudUNoYW5nZXM6IHRydWUsIGV2ZW50RGVib3VuY2VEZWxheTogMCB9KSk7XG5cdFx0XHRvbkRpZENoYW5nZSA9IGVkaXRvclRpdGxlTWVudS5vbkRpZENoYW5nZTtcblxuXHRcdFx0Y29uc3Qgc2hvdWxkSW5saW5lR3JvdXAgPSAoYWN0aW9uOiBTdWJtZW51QWN0aW9uLCBncm91cDogc3RyaW5nKSA9PiBncm91cCA9PT0gJ25hdmlnYXRpb24nICYmIGFjdGlvbi5hY3Rpb25zLmxlbmd0aCA8PSAxO1xuXG5cdFx0XHRhY3Rpb25zID0gZ2V0QWN0aW9uQmFyQWN0aW9ucyhcblx0XHRcdFx0ZWRpdG9yVGl0bGVNZW51LmdldEFjdGlvbnMoeyBhcmc6IHRoaXMucmVzb3VyY2VDb250ZXh0LmdldCgpLCBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSwgcmVuZGVyU2hvcnRUaXRsZTogdHJ1ZSB9KSxcblx0XHRcdFx0J25hdmlnYXRpb24nLFxuXHRcdFx0XHRzaG91bGRJbmxpbmVHcm91cFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gQWRkIGEgXCJSZW9wZW4gRWRpdG9yIFdpdGhcIiBzdWJtZW51IHRvIHRoZSBvdmVyZmxvdyAoLi4uKSBtZW51IHdoZW4gdGhlIGFjdGl2ZSBlZGl0b3Inc1xuXHRcdFx0Ly8gcmVzb3VyY2UgY2FuIGJlIG9wZW5lZCBieSBtb3JlIHRoYW4gb25lIGVkaXRvciB0eXBlIChlLmcuIFRleHQgRWRpdG9yIHZzLiBNYXJrZG93blxuXHRcdFx0Ly8gUHJldmlldykuIFRoaXMgbWlycm9ycyB0aGUgZWRpdG9yIHR5cGUgZHJvcGRvd24gc2hvd24gaW4gdGhlIGJyZWFkY3J1bWJzIGJhci4gSXQgaXNcblx0XHRcdC8vIGJ1aWx0IHBlciBncm91cCBzbyBpdCByZWZsZWN0cyB0aGF0IGdyb3VwJ3MgYWN0aXZlIGVkaXRvci5cblx0XHRcdGlmIChtZW51SWQgPT09IE1lbnVJZC5FZGl0b3JUaXRsZSkge1xuXHRcdFx0XHRjb25zdCBhdmFpbGFibGUgPSBnZXRBdmFpbGFibGVFZGl0b3JUeXBlcyh0aGlzLmFjdGl2ZUVkaXRvciwgdGhpcy5lZGl0b3JSZXNvbHZlclNlcnZpY2UpO1xuXHRcdFx0XHRpZiAoYXZhaWxhYmxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9yVHlwZUFjdGlvbnMgPSBjcmVhdGVFZGl0b3JUeXBlQWN0aW9ucyhhdmFpbGFibGUsIHRoaXMuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLCB0aGlzLmNvbW1hbmRTZXJ2aWNlLCB0aGlzLmVkaXRvclNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHJlb3BlbldpdGhTdWJtZW51ID0gbmV3IFN1Ym1lbnVBY3Rpb24oJ2VkaXRvci5yZW9wZW5XaXRoJywgbG9jYWxpemUoJ3Jlb3BlbldpdGgnLCBcIlJlb3BlbiBFZGl0b3IgV2l0aFwiKSwgZWRpdG9yVHlwZUFjdGlvbnMpO1xuXHRcdFx0XHRcdGlmIChhY3Rpb25zLnNlY29uZGFyeS5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGFjdGlvbnMuc2Vjb25kYXJ5LnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YWN0aW9ucy5zZWNvbmRhcnkucHVzaChyZW9wZW5XaXRoU3VibWVudSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSWYgdGhlcmUgaXMgbm8gYWN0aXZlIHBhbmUgaW4gdGhlIGdyb3VwIChpdCdzIHRoZSBsYXN0IGdyb3VwIGFuZCBpdCdzIGVtcHR5KVxuXHRcdFx0Ly8gVHJpZ2dlciB0aGUgY2hhbmdlIGV2ZW50IHdoZW4gdGhlIGFjdGl2ZSBlZGl0b3IgY2hhbmdlc1xuXHRcdFx0Y29uc3Qgb25EaWRDaGFuZ2VFbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0b25EaWRDaGFuZ2UgPSBvbkRpZENoYW5nZUVtaXR0ZXIuZXZlbnQ7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiBvbkRpZENoYW5nZUVtaXR0ZXIuZmlyZSgpKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgYWN0aW9ucywgb25EaWRDaGFuZ2UgfTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBUaGVtYWJsZVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRjb25zdCBpc0VtcHR5ID0gdGhpcy5pc0VtcHR5O1xuXG5cdFx0Ly8gQ29udGFpbmVyXG5cdFx0aWYgKGlzRW1wdHkpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLmdldENvbG9yKEVESVRPUl9HUk9VUF9FTVBUWV9CQUNLR1JPVU5EKSB8fCAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICcnO1xuXHRcdH1cblxuXHRcdC8vIFRpdGxlIGNvbnRyb2xcblx0XHRjb25zdCBib3JkZXJDb2xvciA9IHRoaXMuZ2V0Q29sb3IoRURJVE9SX0dST1VQX0hFQURFUl9CT1JERVIpIHx8IHRoaXMuZ2V0Q29sb3IoY29udHJhc3RCb3JkZXIpO1xuXHRcdGlmICghaXNFbXB0eSAmJiBib3JkZXJDb2xvcikge1xuXHRcdFx0dGhpcy50aXRsZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd0aXRsZS1ib3JkZXItYm90dG9tJyk7XG5cdFx0XHR0aGlzLnRpdGxlQ29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXRpdGxlLWJvcmRlci1ib3R0b20tY29sb3InLCBib3JkZXJDb2xvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudGl0bGVDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgndGl0bGUtYm9yZGVyLWJvdHRvbScpO1xuXHRcdFx0dGhpcy50aXRsZUNvbnRhaW5lci5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnLS10aXRsZS1ib3JkZXItYm90dG9tLWNvbG9yJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBzaG93VGFicyB9ID0gdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zO1xuXHRcdHRoaXMudGl0bGVDb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gdGhpcy5nZXRDb2xvcihzaG93VGFicyA9PT0gJ211bHRpcGxlJyA/IEVESVRPUl9HUk9VUF9IRUFERVJfVEFCU19CQUNLR1JPVU5EIDogRURJVE9SX0dST1VQX0hFQURFUl9OT19UQUJTX0JBQ0tHUk9VTkQpIHx8ICcnO1xuXG5cdFx0Ly8gRWRpdG9yIGNvbnRhaW5lclxuXHRcdHRoaXMuZWRpdG9yQ29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRoaXMuZ2V0Q29sb3IoZWRpdG9yQmFja2dyb3VuZCkgfHwgJyc7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gSVNlcmlhbGl6YWJsZVZpZXdcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudCA9ICQoJ2RpdicpO1xuXG5cdGdldCBtaW5pbXVtV2lkdGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuZWRpdG9yUGFuZS5taW5pbXVtV2lkdGg7IH1cblx0Z2V0IG1pbmltdW1IZWlnaHQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuZWRpdG9yUGFuZS5taW5pbXVtSGVpZ2h0OyB9XG5cdGdldCBtYXhpbXVtV2lkdGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuZWRpdG9yUGFuZS5tYXhpbXVtV2lkdGg7IH1cblx0Z2V0IG1heGltdW1IZWlnaHQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuZWRpdG9yUGFuZS5tYXhpbXVtSGVpZ2h0OyB9XG5cblx0Z2V0IHByb3BvcnRpb25hbExheW91dCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMubGFzdExheW91dCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICEodGhpcy5sYXN0TGF5b3V0LndpZHRoID09PSB0aGlzLm1pbmltdW1XaWR0aCB8fCB0aGlzLmxhc3RMYXlvdXQuaGVpZ2h0ID09PSB0aGlzLm1pbmltdW1IZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVsYXk8eyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBsZWZ0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmxhc3RMYXlvdXQgPSB7IHdpZHRoLCBoZWlnaHQsIHRvcCwgbGVmdCB9O1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdtYXgtaGVpZ2h0LTQ3OHB4JywgaGVpZ2h0IDw9IDQ3OCk7XG5cblx0XHQvLyBLZWVwIHRhYnMgZnVsbC13aWR0aCB3aGlsZSBicmVhZGNydW1icyBmb2xsb3cgdGhlIGVkaXRvciBjb250ZW50IGluc2V0LlxuXHRcdGNvbnN0IHRpdGxlQ29udHJvbFNpemUgPSB0aGlzLnRpdGxlQ29udHJvbC5sYXlvdXQoe1xuXHRcdFx0Y29udGFpbmVyOiBuZXcgRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpLFxuXHRcdFx0YXZhaWxhYmxlOiBuZXcgRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQgLSB0aGlzLmVkaXRvclBhbmUubWluaW11bUhlaWdodClcblx0XHR9LCB0aGlzLl9jb250ZW50UmlnaHRJbnNldCk7XG5cblx0XHQvLyBVcGRhdGUgcHJvZ3Jlc3MgYmFyIGxvY2F0aW9uXG5cdFx0dGhpcy5wcm9ncmVzc0Jhci5nZXRDb250YWluZXIoKS5zdHlsZS50b3AgPSBgJHtNYXRoLm1heCh0aGlzLnRpdGxlSGVpZ2h0Lm9mZnNldCAtIDIsIDApfXB4YDtcblxuXHRcdC8vIFRoZSBlZGl0b3IgcGFuZSBpcyBpbnNldCBvbiB0aGUgcmlnaHQgYnkgYF9jb250ZW50UmlnaHRJbnNldGAgc28gYSBkb2NrZWRcblx0XHQvLyBwYW5lbCBjYW4gc2l0IGJlc2lkZSBpdCB1bmRlciB0aGUgZnVsbC13aWR0aCB0aXRsZSAoMCA9IGZpbGwgdGhlIGdyb3VwKS5cblx0XHQvLyBUaGUgb3B0aW9uYWwgaGVhZGVyIHJvdyBzaXRzIGluIGZsb3cgYmV0d2VlbiB0aGUgdGFiIGJhciBhbmQgdGhlIGVkaXRvclxuXHRcdC8vIHBhbmUsIHNwYW5uaW5nIHRoZSBmdWxsIGdyb3VwIHdpZHRoLlxuXHRcdGNvbnN0IGhlYWRlckJveEhlaWdodCA9IHRoaXMuX2hlYWRlckhlaWdodDtcblx0XHR0aGlzLmhlYWRlckNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy5oZWFkZXJDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVhZGVyQm94SGVpZ2h0fXB4YDtcblxuXHRcdGNvbnN0IGNvbnRlbnRXaWR0aCA9IE1hdGgubWF4KDAsIHdpZHRoIC0gdGhpcy5fY29udGVudFJpZ2h0SW5zZXQpO1xuXHRcdGNvbnN0IGVkaXRvckhlaWdodCA9IE1hdGgubWF4KDAsIGhlaWdodCAtIHRpdGxlQ29udHJvbFNpemUuaGVpZ2h0IC0gaGVhZGVyQm94SGVpZ2h0KTtcblx0XHR0aGlzLmVkaXRvckNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke2NvbnRlbnRXaWR0aH1weGA7XG5cdFx0dGhpcy5lZGl0b3JDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7ZWRpdG9ySGVpZ2h0fXB4YDtcblx0XHR0aGlzLmVkaXRvclBhbmUubGF5b3V0KHsgd2lkdGg6IGNvbnRlbnRXaWR0aCwgaGVpZ2h0OiBlZGl0b3JIZWlnaHQsIHRvcDogdG9wICsgdGl0bGVDb250cm9sU2l6ZS5oZWlnaHQgKyBoZWFkZXJCb3hIZWlnaHQsIGxlZnQgfSk7XG5cdH1cblxuXHQvKipcblx0ICogU2V0cyB0aGUgcmlnaHQgaW5zZXQgcmVzZXJ2ZWQgYmVzaWRlIHRoZSBicmVhZGNydW1icyBhbmQgZWRpdG9yIHBhbmUgd2hpbGUgdGFicyByZW1haW4gZnVsbC13aWR0aC5cblx0ICogYDBgIHJlc3RvcmVzIHRoZSBkZWZhdWx0IGZ1bGwtd2lkdGggY29udGVudC5cblx0ICovXG5cdHNldENvbnRlbnRSaWdodEluc2V0KGluc2V0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBuZXh0ID0gTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChpbnNldCkpO1xuXHRcdGlmIChuZXh0ID09PSB0aGlzLl9jb250ZW50UmlnaHRJbnNldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb250ZW50UmlnaHRJbnNldCA9IG5leHQ7XG5cdFx0dGhpcy5yZWxheW91dCgpO1xuXHR9XG5cblx0LyoqIFRoZSByZXNlcnZlZCBoZWlnaHQgb2YgdGhlIGhlYWRlciByb3cgKGl0cyBjb250ZW50IGhlaWdodCkuICovXG5cdGdldCBoZWFkZXJIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5faGVhZGVySGVpZ2h0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgY2FsbGVyLXByb3ZpZGVkIGNvbnRlbnQgaW50byBhIGZ1bGwtd2lkdGggaGVhZGVyIHJvdyBiZXR3ZWVuIHRoZSB0YWJcblx0ICogYmFyIGFuZCB0aGUgZWRpdG9yIHBhbmUsIGFuZCBrZWVwcyB0aGUgcm93IHNpemVkIHRvIHRoYXQgY29udGVudCAoaXQgd3JhcHMgYW5kXG5cdCAqIGdyb3dzIGF1dG9tYXRpY2FsbHkgdmlhIGEgYFJlc2l6ZU9ic2VydmVyYCwgZmlyaW5nIHtAbGluayBvbkRpZENoYW5nZUhlYWRlckhlaWdodH0pLlxuXHQgKiBUaGUgcmV0dXJuZWQgZGlzcG9zYWJsZSBjbGVhcnMgdGhlIGhlYWRlci4gT25seSBvbmUgY29udGVudCBpcyBzaG93biBhdCBhIHRpbWUuXG5cdCAqL1xuXHRzZXRIZWFkZXJDb250ZW50KHJlbmRlcjogKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpID0+IElEaXNwb3NhYmxlKTogSURpc3Bvc2FibGUge1xuXHRcdC8vIERpc3Bvc2UgYW55IHByZXZpb3VzIGNvbnRlbnQgZmlyc3QsIHNvIGl0cyBjbGVhbnVwIGNhbm5vdCByYWNlIChhbmQgcmVtb3ZlKVxuXHRcdC8vIHRoZSBuZXcgY29udGVudCBub2RlIGFwcGVuZGVkIGJlbG93LlxuXHRcdHRoaXMuX2hlYWRlckNvbnRlbnQuY2xlYXIoKTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhcHBlbmQodGhpcy5oZWFkZXJDb250YWluZXIsICQoJy5lZGl0b3ItZ3JvdXAtaGVhZGVyLWNvbnRlbnQnKSk7XG5cdFx0c3RvcmUuYWRkKHJlbmRlcihjb250ZW50KSk7XG5cblx0XHRjb25zdCB1cGRhdGVIZWlnaHQgPSAoKSA9PiB0aGlzLl9zZXRIZWFkZXJIZWlnaHQoY29udGVudC5vZmZzZXRIZWlnaHQpO1xuXHRcdGNvbnN0IHJlc2l6ZU9ic2VydmVyID0gbmV3IChnZXRXaW5kb3codGhpcy5oZWFkZXJDb250YWluZXIpLlJlc2l6ZU9ic2VydmVyKSgoKSA9PiB1cGRhdGVIZWlnaHQoKSk7XG5cdFx0cmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShjb250ZW50KTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHJlc2l6ZU9ic2VydmVyLmRpc2Nvbm5lY3QoKSkpO1xuXHRcdHVwZGF0ZUhlaWdodCgpO1xuXG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb250ZW50LnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5fc2V0SGVhZGVySGVpZ2h0KDApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2hlYWRlckNvbnRlbnQudmFsdWUgPSBzdG9yZTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9oZWFkZXJDb250ZW50LnZhbHVlID09PSBzdG9yZSkge1xuXHRcdFx0XHR0aGlzLl9oZWFkZXJDb250ZW50LmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRIZWFkZXJIZWlnaHQoaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBuZXh0ID0gTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChoZWlnaHQpKTtcblx0XHRpZiAobmV4dCA9PT0gdGhpcy5faGVhZGVySGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2hlYWRlckhlaWdodCA9IG5leHQ7XG5cdFx0dGhpcy5yZWxheW91dCgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVhZGVySGVpZ2h0LmZpcmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXJzIHRoZSBncm91cCdzIGNvbmZpZ3VyZWQgaGVhZGVyIG1lbnVzICh7QGxpbmsgSUVkaXRvckdyb3VwVmlld09wdGlvbnMubWVudUlkc30pXG5cdCAqIGFzIGxlYWRpbmcvdHJhaWxpbmcgdG9vbGJhcnMgYmVsb3cgdGhlIHRhYiBiYXIsIGJ1dCBvbmx5IHdoaWxlIHRoZSBhY3RpdmUgZWRpdG9yXG5cdCAqIG9wdHMgaW4gKHtAbGluayBJRWRpdG9yUGFuZS5nZXRIZWFkZXJBY3Rpb25zfSwgd2hpY2ggc3VwcGxpZXMgdGhlIGVkaXRvci1zY29wZWRcblx0ICogaW5zdGFudGlhdGlvbiBzZXJ2aWNlKS4gVGhlIGhlYWRlciBoZWlnaHQgZm9sbG93cyBpdHMgcmVuZGVyZWQgY29udGVudCwgYW5kXG5cdCAqIHJlLXJlbmRlcnMgd2hlbmV2ZXIgdGhlIGFjdGl2ZSBlZGl0b3IgY2hhbmdlcy5cblx0ICovXG5cdHByaXZhdGUgX3JlbmRlckVkaXRvckhlYWRlcigpOiB2b2lkIHtcblx0XHRjb25zdCBtZW51SWRzID0gdGhpcy5fbWVudUlkcztcblx0XHRjb25zdCBoZWFkZXJBY3Rpb25zID0gdGhpcy5hY3RpdmVFZGl0b3JQYW5lPy5nZXRIZWFkZXJBY3Rpb25zPy4oKTtcblx0XHRpZiAoKCFtZW51SWRzPy5oZWFkZXJQcmltYXJ5ICYmICFtZW51SWRzPy5oZWFkZXJTZWNvbmRhcnkpIHx8ICFoZWFkZXJBY3Rpb25zKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3JIZWFkZXJDb250ZW50LmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGhlYWRlclByaW1hcnlNZW51SWQgPSBtZW51SWRzLmhlYWRlclByaW1hcnk7XG5cdFx0Y29uc3QgaGVhZGVyU2Vjb25kYXJ5TWVudUlkID0gbWVudUlkcy5oZWFkZXJTZWNvbmRhcnk7XG5cblx0XHR0aGlzLl9lZGl0b3JIZWFkZXJDb250ZW50LnZhbHVlID0gdGhpcy5zZXRIZWFkZXJDb250ZW50KGNvbnRhaW5lciA9PiB7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdlZGl0b3ItZ3JvdXAtaGVhZGVyLXRvb2xiYXJzJyk7XG5cdFx0XHQvLyBLZWVwIGJvdGggY29udGFpbmVycyBmb3IgdGhlIGxlYWRpbmcvdHJhaWxpbmcgZmxleCBsYXlvdXQgZXZlbiB3aGVuIG9ubHlcblx0XHRcdC8vIG9uZSBtZW51IGlzIHByb3ZpZGVkOyByZW5kZXIgYSB0b29sYmFyIG9ubHkgZm9yIHdoaWNoZXZlciBpZCBpcyBkZWZpbmVkLlxuXHRcdFx0Y29uc3QgcHJpbWFyeUNvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5lZGl0b3ItZ3JvdXAtaGVhZGVyLXByaW1hcnknKSk7XG5cdFx0XHRjb25zdCBzZWNvbmRhcnlDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuZWRpdG9yLWdyb3VwLWhlYWRlci1zZWNvbmRhcnknKSk7XG5cblx0XHRcdC8vIFJlbmRlciBldmVyeSBncm91cCBpbmxpbmUgd2l0aCBzZXBhcmF0b3JzIGJldHdlZW4gZ3JvdXBzLCBzbyBoZWFkZXIgbWVudXNcblx0XHRcdC8vIGNhbiBhcnJhbmdlIGFjdGlvbnMgaW50byBzZXBhcmF0ZWQgc2VnbWVudHMuIFRoZSBzZW50aW5lbCBgc2Vjb25kYXJ5YCBncm91cFxuXHRcdFx0Ly8gaXMgdGhlIGV4Y2VwdGlvbjogaXRzIGl0ZW1zIGZhbGwgaW50byB0aGUgdG9vbGJhcidzIG92ZXJmbG93IChcIlx1MjAyNlwiKSBtZW51LlxuXHRcdFx0Y29uc3QgdG9vbGJhck9wdGlvbnMgPSB7XG5cdFx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZSxcblx0XHRcdFx0dG9vbGJhck9wdGlvbnM6IHsgcHJpbWFyeUdyb3VwOiAoZ3JvdXA6IHN0cmluZykgPT4gZ3JvdXAgIT09ICdzZWNvbmRhcnknLCB1c2VTZXBhcmF0b3JzSW5QcmltYXJ5QWN0aW9uczogdHJ1ZSB9XG5cdFx0XHR9O1xuXHRcdFx0aWYgKGhlYWRlclByaW1hcnlNZW51SWQpIHtcblx0XHRcdFx0c3RvcmUuYWRkKGhlYWRlckFjdGlvbnMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHByaW1hcnlDb250YWluZXIsIGhlYWRlclByaW1hcnlNZW51SWQsIHRvb2xiYXJPcHRpb25zKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaGVhZGVyU2Vjb25kYXJ5TWVudUlkKSB7XG5cdFx0XHRcdHN0b3JlLmFkZChoZWFkZXJBY3Rpb25zLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBzZWNvbmRhcnlDb250YWluZXIsIGhlYWRlclNlY29uZGFyeU1lbnVJZCwgdG9vbGJhck9wdGlvbnMpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHN0b3JlO1xuXHRcdH0pO1xuXHR9XG5cblx0cmVsYXlvdXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGFzdExheW91dCkge1xuXHRcdFx0Y29uc3QgeyB3aWR0aCwgaGVpZ2h0LCB0b3AsIGxlZnQgfSA9IHRoaXMubGFzdExheW91dDtcblx0XHRcdHRoaXMubGF5b3V0KHdpZHRoLCBoZWlnaHQsIHRvcCwgbGVmdCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0Qm91bmRhcnlTYXNoZXMoc2FzaGVzOiBJQm91bmRhcnlTYXNoZXMpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvclBhbmUuc2V0Qm91bmRhcnlTYXNoZXMoc2FzaGVzKTtcblx0fVxuXG5cdHRvSlNPTigpOiBJU2VyaWFsaXplZEVkaXRvckdyb3VwTW9kZWwge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLnNlcmlhbGl6ZSgpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cblx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmZpcmUoKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEVkaXRvclJlcGxhY2VtZW50IGV4dGVuZHMgSUVkaXRvclJlcGxhY2VtZW50IHtcblx0cmVhZG9ubHkgZWRpdG9yOiBFZGl0b3JJbnB1dDtcblx0cmVhZG9ubHkgcmVwbGFjZW1lbnQ6IEVkaXRvcklucHV0O1xuXHRyZWFkb25seSBvcHRpb25zPzogSUVkaXRvck9wdGlvbnM7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLGtCQUEyRix5QkFBeUIsd0JBQXdCLG9DQUFvQztBQUN6TCxTQUEwQixnQkFBZ0QsWUFBMkMsY0FBa0Msd0JBQXdCLHlCQUE4Qyw0QkFBNEIsa0JBQWtCLG9CQUFxRixzQkFBb0UsMkJBQTJCO0FBQy9iLFNBQVMsZ0NBQWdDLDBCQUEwQixnQ0FBZ0MsMkJBQTJCLDJCQUEyQixnQ0FBZ0MsaUNBQWlDLG9CQUFvQix5QkFBeUIsdUNBQXVDLG9DQUFvQywrQkFBK0IsaUNBQWlDLGdDQUFnQyxxQkFBcUIsNkJBQTZCLDhCQUE4QixzQ0FBc0MsbUNBQW1DLHVDQUF1QyxrQ0FBa0MsOERBQThEO0FBRWx0QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFNBQWdCLGFBQWE7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxXQUFXLFlBQVksdUJBQXVCLFdBQVcsYUFBYSxxQkFBcUIsWUFBa0MsY0FBYyxpQkFBaUIsV0FBVyxrQkFBa0IsR0FBRyxjQUFjO0FBQ25OLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBZSxnQkFBZ0I7QUFDeEMsU0FBUyxrQkFBa0Isc0JBQXNCO0FBQ2pELFNBQVMscUNBQXFDLHdDQUF3QywrQkFBK0Isa0NBQWtDO0FBQ3ZKLFNBQThC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
