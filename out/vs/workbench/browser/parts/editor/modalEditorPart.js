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
import "./media/modalEditorPart.css";
import { $, addDisposableListener, append, Dimension, EventHelper, EventType, hide, isHTMLElement, setVisibility, show } from "../../../../base/browser/dom.js";
import { GlobalPointerMoveMonitor } from "../../../../base/browser/globalPointerMoveMonitor.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { ActionBar, prepareActions } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Orientation, Sash, SashState } from "../../../../base/browser/ui/sash/sash.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ResizableHTMLElement } from "../../../../base/browser/ui/resizable/resizable.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ResultKind } from "../../../../platform/keybinding/common/keybindingResolver.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPart } from "./editorPart.js";
import { GroupDirection, GroupsOrder, GroupActivationReason } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService, USE_MODAL_EDITOR_SETTING } from "../../../services/editor/common/editorService.js";
import { EditorPartModalContext, EditorPartModalMaximizedContext, EditorPartModalNavigationContext, EditorPartModalSidebarContext, EditorPartModalSidebarVisibleContext } from "../../../common/contextkeys.js";
import { EditorResourceAccessor, SideBySideEditor, Verbosity } from "../../../common/editor.js";
import { ResourceLabel } from "../../labels.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IWorkbenchLayoutService, Parts } from "../../../services/layout/browser/layoutService.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { localize } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { CLOSE_MODAL_EDITOR_COMMAND_ID, MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID, MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID, NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID, NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID, TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID, TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID } from "./editorCommands.js";
import { isModalEditorOptionsProvider } from "../../../../platform/editor/common/editor.js";
const MODAL_MIN_WIDTH = 400;
const MODAL_MIN_HEIGHT = 300;
const MODAL_MAX_DEFAULT_WIDTH = 1400;
const MODAL_MAX_DEFAULT_HEIGHT = 900;
const MODAL_BORDER_WIDTH = 1;
const MODAL_BORDER_SIZE = MODAL_BORDER_WIDTH * 2;
const MODAL_HEADER_HEIGHT = 33;
const MODAL_SNAP_THRESHOLD = 20;
const MODAL_MAXIMIZED_PADDING = 16;
const MODAL_SIDEBAR_MIN_WIDTH = 160;
const MODAL_SIDEBAR_DEFAULT_WIDTH = 260;
const MODAL_SIDEBAR_PADDING = 8;
const MODAL_SIDEBAR_BORDER_RIGHT = 1;
const defaultModalEditorAllowableCommands = /* @__PURE__ */ new Set([
  // Application
  "workbench.action.quit",
  "workbench.action.reloadWindow",
  "workbench.action.toggleFullScreen",
  // Quick access
  "workbench.action.gotoSymbol",
  "workbench.action.gotoLine",
  // Zoom
  "workbench.action.zoomIn",
  "workbench.action.zoomOut",
  "workbench.action.zoomReset",
  // File operations
  "workbench.action.files.save",
  "workbench.action.files.saveAll",
  "workbench.action.files.revert",
  // Close editors
  "workbench.action.closeActiveEditor",
  "workbench.action.closeAllEditors",
  "workbench.action.closeEditorsInGroup",
  "workbench.action.closeUnmodifiedEditors",
  // Settings
  "workbench.action.openSettings",
  "workbench.action.openSettings2",
  "workbench.action.openSettingsJson",
  "workbench.action.openGlobalSettings",
  "workbench.action.openApplicationSettingsJson",
  "workbench.action.openRawDefaultSettings",
  "workbench.action.openWorkspaceSettings",
  "workbench.action.openWorkspaceSettingsFile",
  "workbench.action.openFolderSettings",
  "workbench.action.openFolderSettingsFile",
  "workbench.action.openRemoteSettings",
  "workbench.action.openRemoteSettingsFile",
  "workbench.action.openAccessibilitySettings",
  "workbench.action.configureLanguageBasedSettings",
  // Keybindings
  "workbench.action.openGlobalKeybindings",
  "workbench.action.openDefaultKeybindingsFile",
  "workbench.action.openGlobalKeybindingsFile",
  "workbench.action.openKeyboardLayoutPicker",
  // Modal editor
  CLOSE_MODAL_EDITOR_COMMAND_ID,
  MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID,
  MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID,
  TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID,
  NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID,
  NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID,
  TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID
]);
let ModalEditorPart = class {
  constructor(editorPartsView, instantiationService, editorService, layoutService, keybindingService, hostService, configurationService, contextMenuService, contextKeyService) {
    this.editorPartsView = editorPartsView;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.layoutService = layoutService;
    this.keybindingService = keybindingService;
    this.hostService = hostService;
    this.configurationService = configurationService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
  }
  async create(options) {
    const disposables = new DisposableStore();
    const modalElement = $(".monaco-modal-editor-block");
    this.layoutService.mainContainer.appendChild(modalElement);
    disposables.add(toDisposable(() => modalElement.remove()));
    const modalContextKeyService = disposables.add(this.contextKeyService.createScoped(modalElement));
    disposables.add(addDisposableListener(modalElement, EventType.MOUSE_DOWN, (e) => {
      if (e.target === modalElement) {
        EventHelper.stop(e, true);
        void editorPart.close();
      }
    }));
    let useModalMode = this.configurationService.getValue(USE_MODAL_EDITOR_SETTING);
    disposables.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(USE_MODAL_EDITOR_SETTING)) {
        useModalMode = this.configurationService.getValue(USE_MODAL_EDITOR_SETTING);
      }
    }));
    disposables.add(addDisposableListener(modalElement, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (useModalMode !== "all") {
        const resolved = this.keybindingService.softDispatch(event, this.layoutService.mainContainer);
        if (resolved.kind === ResultKind.KbFound && resolved.commandId) {
          if (resolved.commandId.startsWith("workbench.") && !defaultModalEditorAllowableCommands.has(resolved.commandId)) {
            EventHelper.stop(event, true);
          }
        }
      }
    }));
    const resizableElement = new ResizableHTMLElement();
    disposables.add(toDisposable(() => resizableElement.dispose()));
    resizableElement.domNode.classList.add("modal-editor-resizable");
    const effectiveMinWidth = MODAL_MIN_WIDTH + (options?.sidebar ? MODAL_SIDEBAR_MIN_WIDTH : 0);
    resizableElement.minSize = new Dimension(effectiveMinWidth, MODAL_MIN_HEIGHT);
    modalElement.appendChild(resizableElement.domNode);
    const shadowElement = resizableElement.domNode.appendChild($(".modal-editor-shadow"));
    const titleId = "modal-editor-title";
    const editorPartContainer = $(".part.editor.modal-editor-part", {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId
    });
    shadowElement.appendChild(editorPartContainer);
    const headerElement = editorPartContainer.appendChild($(".modal-editor-header"));
    const sidebarToggleContainer = append(headerElement, $("div.modal-editor-sidebar-toggle"));
    if (!options?.sidebar) {
      hide(sidebarToggleContainer);
    }
    const sidebarToggleIcon = options?.sidebar?.sidebarHidden ? Codicon.layoutSidebarLeftOff : Codicon.layoutSidebarLeft;
    const sidebarToggleAction = disposables.add(new Action(TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID, localize("toggleSidebar", "Toggle Sidebar"), ThemeIcon.asClassName(sidebarToggleIcon), true));
    const sidebarToggleActionBar = disposables.add(new ActionBar(sidebarToggleContainer));
    sidebarToggleActionBar.push(sidebarToggleAction, { icon: true, label: false });
    const titleElement = append(headerElement, $("div.modal-editor-title.show-file-icons"));
    titleElement.id = titleId;
    titleElement.textContent = "";
    const navigationContainer = append(headerElement, $("div.modal-editor-navigation"));
    hide(navigationContainer);
    disposables.add(addDisposableListener(navigationContainer, EventType.DBLCLICK, (e) => EventHelper.stop(e, true)));
    const previousButton = disposables.add(new Button(navigationContainer, { title: localize("previousItem", "Previous") }));
    previousButton.icon = Codicon.chevronLeft;
    previousButton.element.classList.add("modal-editor-nav-button");
    disposables.add(previousButton.onDidClick(() => {
      const navigation = editorPart.navigation;
      if (navigation && navigation.current > 0) {
        navigation.navigate(navigation.current - 1);
      }
    }));
    const navigationLabel = append(navigationContainer, $("span.modal-editor-nav-label"));
    navigationLabel.setAttribute("aria-live", "polite");
    const nextButton = disposables.add(new Button(navigationContainer, { title: localize("nextItem", "Next") }));
    nextButton.icon = Codicon.chevronRight;
    nextButton.element.classList.add("modal-editor-nav-button");
    disposables.add(nextButton.onDidClick(() => {
      const navigation = editorPart.navigation;
      if (navigation && navigation.current < navigation.total - 1) {
        navigation.navigate(navigation.current + 1);
      }
    }));
    const actionBarContainer = append(headerElement, $("div.modal-editor-action-container"));
    const sidebarResult = this.createSidebar(editorPartContainer, headerElement, options?.sidebar, modalContextKeyService, disposables);
    if (sidebarResult) {
      if (sidebarResult.isVisible()) {
        editorPartContainer.classList.add("has-sidebar");
      }
      disposables.add(sidebarResult.onDidResize(() => layoutModal()));
    }
    const modalInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, modalContextKeyService]
    )));
    const editorPart = disposables.add(modalInstantiationService.createInstance(
      ModalEditorPartImpl,
      mainWindow.vscodeWindowId,
      this.editorPartsView,
      modalElement,
      options
    ));
    disposables.add(this.editorPartsView.registerPart(editorPart));
    editorPart.create(editorPartContainer);
    disposables.add(Event.once(editorPart.onWillClose)(() => disposables.dispose()));
    disposables.add(Event.runAndSubscribe(editorPart.onDidChangeNavigation, ((navigation) => {
      if (navigation && navigation.total > 1) {
        show(navigationContainer);
        navigationLabel.textContent = localize("navigationCounter", "{0} of {1}", navigation.current + 1, navigation.total);
        previousButton.enabled = navigation.current > 0;
        nextButton.enabled = navigation.current < navigation.total - 1;
      } else {
        hide(navigationContainer);
      }
    }), editorPart.navigation));
    if (sidebarResult) {
      disposables.add(Event.runAndSubscribe(sidebarResult.onDidResize, () => {
        if (sidebarResult.isVisible()) {
          editorPart.sidebarWidth = sidebarResult.hasCustomWidth() ? sidebarResult.getWidth() : void 0;
        }
      }));
      disposables.add(editorPart.onDidToggleSidebar(() => {
        sidebarResult.setVisible(!editorPart.sidebarHidden);
        sidebarToggleAction.class = ThemeIcon.asClassName(editorPart.sidebarHidden ? Codicon.layoutSidebarLeftOff : Codicon.layoutSidebarLeft);
        layoutModal();
      }));
    }
    disposables.add(sidebarToggleActionBar.onDidRun(() => editorPart.toggleSidebar()));
    const modalEditorService = this.editorService.createScoped(editorPart, disposables);
    const scopedInstantiationService = disposables.add(editorPart.scopedInstantiationService.createChild(new ServiceCollection(
      [IEditorService, modalEditorService]
    )));
    const editorActionsToolbarContainer = append(actionBarContainer, $("div.modal-editor-editor-actions"));
    const editorActionsToolbar = disposables.add(scopedInstantiationService.createInstance(WorkbenchToolBar, editorActionsToolbarContainer, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      highlightToggledItems: true
    }));
    const editorActionsSeparator = append(actionBarContainer, $("div.modal-editor-action-separator"));
    const editorActionsDisposables = disposables.add(new DisposableStore());
    const updateEditorActions = () => {
      editorActionsDisposables.clear();
      const editorActions = editorPart.activeGroup.createEditorActions(editorActionsDisposables, MenuId.ModalEditorEditorTitle);
      editorActionsDisposables.add(editorActions.onDidChange(() => updateEditorActions()));
      const { primary, secondary } = editorActions.actions;
      editorActionsToolbar.setActions(prepareActions(primary), prepareActions(secondary));
      const hasActions = primary.length > 0 || secondary.length > 0;
      setVisibility(hasActions, editorActionsSeparator);
    };
    disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, () => updateEditorActions()));
    disposables.add(modalEditorService.onDidEditorsChange(() => editorPart.enforceModalPartOptions()));
    disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.ModalEditorTitle, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      highlightToggledItems: true,
      menuOptions: { shouldForwardArgs: true }
    }));
    const label = disposables.add(scopedInstantiationService.createInstance(ResourceLabel, titleElement, {}));
    const labelChangeDisposable = disposables.add(new MutableDisposable());
    let trackedEditor;
    const updateLabel = () => {
      const activeEditor = editorPart.activeGroup.activeEditor;
      if (activeEditor) {
        const { labelFormat } = editorPart.partOptions;
        label.element.setResource(
          {
            resource: EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.BOTH }),
            name: activeEditor.getName(),
            description: activeEditor.getDescription(labelFormat === "short" ? Verbosity.SHORT : labelFormat === "long" ? Verbosity.LONG : Verbosity.MEDIUM) || ""
          },
          {
            title: activeEditor.getTitle(Verbosity.LONG),
            icon: activeEditor.getIcon(),
            extraClasses: activeEditor.getLabelExtraClasses()
          }
        );
        if (trackedEditor !== activeEditor) {
          trackedEditor = activeEditor;
          labelChangeDisposable.value = activeEditor.onDidChangeLabel(() => updateLabel());
        }
      } else {
        label.element.clear();
        trackedEditor = void 0;
        labelChangeDisposable.clear();
      }
    };
    disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, updateLabel));
    disposables.add(addDisposableListener(headerElement, EventType.DBLCLICK, (e) => {
      EventHelper.stop(e);
      editorPart.handleHeaderDoubleClick();
    }));
    disposables.add(addDisposableListener(headerElement, EventType.CONTEXT_MENU, (e) => {
      const target = e.target;
      if (isHTMLElement(target) && (target.closest(".monaco-button") || target.closest(".action-item"))) {
        return;
      }
      EventHelper.stop(e, true);
      const contextMenuDisposables = new DisposableStore();
      const activeGroup = editorPart.activeGroup;
      const activeEditor = activeGroup.activeEditor;
      const editorScopedContextKeyService = activeGroup.activeEditorPane?.scopedContextKeyService ?? activeGroup.scopedContextKeyService;
      const editorActions = activeGroup.createEditorActions(contextMenuDisposables, MenuId.EditorTitle);
      const { primary, secondary } = editorActions.actions;
      this.contextMenuService.showContextMenu({
        menuId: MenuId.ModalEditorTitleContext,
        contextKeyService: editorScopedContextKeyService,
        getAnchor: () => ({ x: e.clientX, y: e.clientY }),
        getActions: () => Separator.join(primary, secondary),
        getActionsContext: () => ({ groupId: activeGroup.id, editorIndex: activeEditor ? activeGroup.getIndexOfEditor(activeEditor) : void 0 }),
        getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id, editorScopedContextKeyService),
        onHide: () => contextMenuDisposables.dispose()
      });
    }));
    const layout = (sizeChanged) => {
      const { width: modalWidth, height: modalHeight } = resizableElement.size;
      const { top: topPx, left: leftPx } = resizableElement.domNode.style;
      const sidebarWidth = sidebarResult?.getWidth() ?? 0;
      const headerHeight = headerElement.offsetHeight;
      editorPart.layout(
        Math.max(0, modalWidth - MODAL_BORDER_SIZE - sidebarWidth),
        modalHeight - MODAL_BORDER_SIZE - headerHeight,
        parseFloat(topPx) + MODAL_BORDER_WIDTH + headerHeight,
        parseFloat(leftPx) + MODAL_BORDER_WIDTH + sidebarWidth
      );
      if (sizeChanged) {
        sidebarResult?.layout(modalHeight - MODAL_BORDER_SIZE - headerHeight);
      }
    };
    const dragMonitor = disposables.add(new GlobalPointerMoveMonitor());
    const dragDisposables = disposables.add(new DisposableStore());
    let didDrag = false;
    disposables.add(addDisposableListener(headerElement, EventType.POINTER_DOWN, (e) => {
      if (editorPart.maximized) {
        return;
      }
      if (e.button !== 0) {
        return;
      }
      const target = e.target;
      if (!isHTMLElement(target)) {
        return;
      }
      if (target.closest(".monaco-button") || target.closest(".action-item")) {
        return;
      }
      EventHelper.stop(e, true);
      dragDisposables.clear();
      headerElement.classList.add("dragging");
      dragDisposables.add(toDisposable(() => headerElement.classList.remove("dragging")));
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseFloat(resizableElement.domNode.style.left) || 0;
      const startTop = parseFloat(resizableElement.domNode.style.top) || 0;
      didDrag = false;
      const onPointerMove = (moveEvent) => {
        didDrag = true;
        EventHelper.stop(moveEvent, true);
        const containerDimension = this.layoutService.mainContainerDimension;
        const titleBarOffset = this.layoutService.mainContainerOffset.top;
        const dialogWidth = resizableElement.size.width;
        const dialogHeight = resizableElement.size.height;
        const minLeft = 0;
        const minTop = titleBarOffset;
        const maxLeft = Math.max(minLeft, containerDimension.width - dialogWidth);
        const maxTop = Math.max(minTop, containerDimension.height - dialogHeight);
        let newLeft = Math.max(minLeft, Math.min(maxLeft, startLeft + (moveEvent.clientX - startX)));
        let newTop = Math.max(minTop, Math.min(maxTop, startTop + (moveEvent.clientY - startY)));
        const centerLeft = (containerDimension.width - dialogWidth) / 2;
        const centerTop = Math.max(titleBarOffset, (containerDimension.height - dialogHeight) / 2);
        if (Math.abs(newLeft - centerLeft) < MODAL_SNAP_THRESHOLD && Math.abs(newTop - centerTop) < MODAL_SNAP_THRESHOLD) {
          newLeft = centerLeft;
          newTop = centerTop;
        }
        resizableElement.domNode.style.left = `${newLeft}px`;
        resizableElement.domNode.style.top = `${newTop}px`;
        layout(false);
      };
      const onStop = () => {
        dragDisposables.clear();
        if (didDrag) {
          const currentLeft = parseFloat(resizableElement.domNode.style.left) || 0;
          const currentTop = parseFloat(resizableElement.domNode.style.top) || 0;
          const containerDimension = this.layoutService.mainContainerDimension;
          const titleBarOffset = this.layoutService.mainContainerOffset.top;
          const centerLeft = (containerDimension.width - resizableElement.size.width) / 2;
          const centerTop = Math.max(titleBarOffset, (containerDimension.height - resizableElement.size.height) / 2);
          if (Math.abs(currentLeft - centerLeft) < 1 && Math.abs(currentTop - centerTop) < 1) {
            editorPart.position = void 0;
          } else {
            editorPart.position = { left: currentLeft, top: currentTop };
          }
        }
      };
      dragMonitor.startMonitoring(headerElement, e.pointerId, e.buttons, onPointerMove, onStop);
    }));
    disposables.add(addDisposableListener(headerElement, EventType.CLICK, (e) => {
      const wasDrag = didDrag;
      didDrag = false;
      if (wasDrag) {
        return;
      }
      EventHelper.stop(e);
      editorPart.activeGroup.focus();
    }));
    let isResizing = false;
    let resizeStartLeft = 0;
    let resizeStartTop = 0;
    let resizeStartSize = Dimension.None;
    disposables.add(resizableElement.onDidWillResize(() => {
      isResizing = true;
      resizeStartLeft = parseFloat(resizableElement.domNode.style.left) || 0;
      resizeStartTop = parseFloat(resizableElement.domNode.style.top) || 0;
      resizeStartSize = new Dimension(resizableElement.size.width, resizableElement.size.height);
    }));
    disposables.add(resizableElement.onDidResize((e) => {
      if (!e.done) {
        const containerDimension = this.layoutService.mainContainerDimension;
        const titleBarOffset = this.layoutService.mainContainerOffset.top;
        const deltaWidth = e.dimension.width - resizeStartSize.width;
        const deltaHeight = e.dimension.height - resizeStartSize.height;
        let newLeft = e.west ? resizeStartLeft - deltaWidth : resizeStartLeft;
        let newTop = e.north ? resizeStartTop - deltaHeight : resizeStartTop;
        let newWidth = e.dimension.width;
        let newHeight = e.dimension.height;
        if (newLeft < 0) {
          newWidth += newLeft;
          newLeft = 0;
        }
        if (newTop < titleBarOffset) {
          newHeight += newTop - titleBarOffset;
          newTop = titleBarOffset;
        }
        if (newLeft + newWidth > containerDimension.width) {
          newWidth = containerDimension.width - newLeft;
        }
        if (newTop + newHeight > containerDimension.height) {
          newHeight = containerDimension.height - newTop;
        }
        if (newWidth !== e.dimension.width || newHeight !== e.dimension.height) {
          resizableElement.layout(newHeight, newWidth);
        }
        if (e.west) {
          resizableElement.domNode.style.left = `${newLeft}px`;
        }
        if (e.north) {
          resizableElement.domNode.style.top = `${newTop}px`;
        }
      }
      layout(true);
      if (e.done) {
        isResizing = false;
        const defaultSize = getDefaultSize();
        const size = resizableElement.size;
        if (size.width === defaultSize.width && size.height === defaultSize.height) {
          editorPart.size = void 0;
          editorPart.position = void 0;
          layoutModal();
        } else {
          editorPart.size = new Dimension(size.width, size.height);
          editorPart.position = {
            left: parseFloat(resizableElement.domNode.style.left) || 0,
            top: parseFloat(resizableElement.domNode.style.top) || 0
          };
        }
      }
    }));
    const getDefaultSize = () => {
      const containerDimension = this.layoutService.mainContainerDimension;
      const titleBarOffset = this.layoutService.mainContainerOffset.top;
      const availableHeight = Math.max(containerDimension.height - titleBarOffset, 0);
      const targetWidth = containerDimension.width * 0.8;
      const targetHeight = availableHeight * 0.8;
      const width = Math.min(targetWidth, MODAL_MAX_DEFAULT_WIDTH, containerDimension.width);
      const height = Math.min(targetHeight, MODAL_MAX_DEFAULT_HEIGHT, availableHeight);
      return new Dimension(width, height);
    };
    let isFirstLayout = true;
    const layoutModal = () => {
      if (isResizing) {
        return;
      }
      const containerDimension = this.layoutService.mainContainerDimension;
      const titleBarOffset = this.layoutService.mainContainerOffset.top;
      const availableHeight = Math.max(containerDimension.height - titleBarOffset, 0);
      const defaultSize = getDefaultSize();
      let width;
      let height;
      if (editorPart.maximized) {
        const verticalPadding = Math.max(titleBarOffset, MODAL_MAXIMIZED_PADDING);
        width = Math.max(containerDimension.width - MODAL_MAXIMIZED_PADDING, 0);
        height = Math.max(availableHeight - verticalPadding, 0);
      } else if (editorPart.size) {
        width = Math.min(editorPart.size.width, containerDimension.width);
        height = Math.min(editorPart.size.height, availableHeight);
      } else {
        width = defaultSize.width;
        height = defaultSize.height;
      }
      height = Math.min(height, availableHeight);
      if (isFirstLayout) {
        isFirstLayout = false;
        sidebarResult?.clampWidth(width);
      }
      resizableElement.maxSize = new Dimension(containerDimension.width, availableHeight);
      resizableElement.preferredSize = defaultSize;
      resizableElement.layout(height, width);
      const canResize = !editorPart.maximized;
      resizableElement.enableSashes(canResize, canResize, canResize, canResize);
      if (!editorPart.maximized && editorPart.position) {
        const clampedLeft = Math.max(0, Math.min(editorPart.position.left, containerDimension.width - width));
        const clampedTop = Math.max(titleBarOffset, Math.min(editorPart.position.top, titleBarOffset + availableHeight - height));
        resizableElement.domNode.style.left = `${clampedLeft}px`;
        resizableElement.domNode.style.top = `${clampedTop}px`;
      } else {
        const left = (containerDimension.width - width) / 2;
        const top = Math.max(titleBarOffset, (containerDimension.height - height) / 2);
        resizableElement.domNode.style.left = `${left}px`;
        resizableElement.domNode.style.top = `${top}px`;
      }
      layout(true);
    };
    disposables.add(Event.runAndSubscribe(this.layoutService.onDidLayoutMainContainer, layoutModal));
    disposables.add(editorPart.onDidChangeMaximized(() => layoutModal()));
    disposables.add(editorPart.onDidRequestLayout(() => layoutModal()));
    disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, () => {
      const activeEditor = editorPart.activeGroup.activeEditor;
      const editorModalOptions = isModalEditorOptionsProvider(activeEditor) ? activeEditor.getModalEditorOptions() : void 0;
      modalElement.classList.toggle("compact-header", !!editorModalOptions?.compactHeader);
      layoutModal();
    }));
    this.hostService.setWindowDimmed(mainWindow, true);
    disposables.add(toDisposable(() => this.hostService.setWindowDimmed(mainWindow, false)));
    editorPart.activeGroup.focus();
    return {
      part: editorPart,
      instantiationService: scopedInstantiationService,
      disposables
    };
  }
  createSidebar(container, headerElement, content, modalContextKeyService, disposables) {
    if (!content) {
      return void 0;
    }
    let sidebarWidth = content.sidebarWidth && content.sidebarWidth > 0 ? content.sidebarWidth : MODAL_SIDEBAR_DEFAULT_WIDTH;
    let customWidth = content.sidebarWidth !== void 0 && content.sidebarWidth > 0;
    let visible = !content.sidebarHidden;
    const sidebarContainer = append(container, $("div.modal-editor-sidebar.show-file-icons"));
    sidebarContainer.style.width = `${sidebarWidth}px`;
    setVisibility(visible, sidebarContainer);
    const sidebarContextKeyService = disposables.add(modalContextKeyService.createScoped(sidebarContainer));
    const onDidLayoutEmitter = disposables.add(new Emitter());
    const contentDisposable = disposables.add(new MutableDisposable());
    contentDisposable.value = content.render(sidebarContainer, onDidLayoutEmitter.event, sidebarContextKeyService);
    const getHeaderHeight = () => headerElement.offsetHeight || MODAL_HEADER_HEIGHT;
    const sash = disposables.add(new Sash(container, {
      getVerticalSashLeft: () => sidebarWidth,
      getVerticalSashTop: () => getHeaderHeight(),
      getVerticalSashHeight: () => container.clientHeight - getHeaderHeight()
    }, { orientation: Orientation.VERTICAL }));
    if (!visible) {
      sash.state = SashState.Disabled;
    }
    const onDidResizeEmitter = disposables.add(new Emitter());
    let sashStartWidth;
    disposables.add(sash.onDidStart(() => sashStartWidth = sidebarWidth));
    disposables.add(sash.onDidEnd(() => sashStartWidth = void 0));
    disposables.add(sash.onDidChange((e) => {
      if (sashStartWidth === void 0) {
        return;
      }
      const delta = e.currentX - e.startX;
      const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, container.clientWidth - MODAL_MIN_WIDTH);
      sidebarWidth = Math.min(maxWidth, Math.max(MODAL_SIDEBAR_MIN_WIDTH, sashStartWidth + delta));
      customWidth = true;
      sidebarContainer.style.width = `${sidebarWidth}px`;
      sash.layout();
      onDidResizeEmitter.fire();
    }));
    disposables.add(sash.onDidReset(() => {
      const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, container.clientWidth - MODAL_MIN_WIDTH);
      sidebarWidth = Math.min(maxWidth, MODAL_SIDEBAR_DEFAULT_WIDTH);
      customWidth = false;
      sidebarContainer.style.width = `${sidebarWidth}px`;
      sash.layout();
      onDidResizeEmitter.fire();
    }));
    return {
      onDidResize: onDidResizeEmitter.event,
      getWidth: () => visible ? sidebarWidth : 0,
      hasCustomWidth: () => customWidth,
      clampWidth: (modalWidth) => {
        if (sidebarWidth + MODAL_MIN_WIDTH > modalWidth) {
          sidebarWidth = Math.min(MODAL_SIDEBAR_DEFAULT_WIDTH, Math.max(MODAL_SIDEBAR_MIN_WIDTH, modalWidth - MODAL_MIN_WIDTH));
          customWidth = false;
          sidebarContainer.style.width = `${sidebarWidth}px`;
          sash.layout();
          onDidResizeEmitter.fire();
        }
      },
      isVisible: () => visible,
      setVisible: (value) => {
        visible = value;
        setVisibility(visible, sidebarContainer);
        container.classList.toggle("has-sidebar", visible);
        sash.state = visible ? SashState.Enabled : SashState.Disabled;
        onDidResizeEmitter.fire();
      },
      layout: (height) => {
        if (visible) {
          onDidLayoutEmitter.fire({
            height: height - MODAL_SIDEBAR_PADDING * 2,
            width: sidebarWidth - MODAL_SIDEBAR_PADDING * 2 - MODAL_SIDEBAR_BORDER_RIGHT
          });
        }
        sash.layout();
      },
      updateContent: (newContent) => {
        contentDisposable.clear();
        sidebarContainer.textContent = "";
        contentDisposable.value = newContent.render(sidebarContainer, onDidLayoutEmitter.event, sidebarContextKeyService);
      }
    };
  }
};
ModalEditorPart = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IHostService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IContextKeyService)
], ModalEditorPart);
let ModalEditorPartImpl = class extends EditorPart {
  constructor(windowId, editorPartsView, modalElement, options, instantiationService, themeService, configurationService, storageService, layoutService, hostService, modalContextKeyService) {
    const id = ModalEditorPartImpl.COUNTER++;
    super(editorPartsView, `workbench.parts.modalEditor.${id}`, localize("modalEditorPart", "Modal Editor Area"), windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, modalContextKeyService);
    this.modalElement = modalElement;
    this.modalContextKeyService = modalContextKeyService;
    this._onWillClose = this._register(new Emitter());
    this.onWillClose = this._onWillClose.event;
    this._onDidChangeMaximized = this._register(new Emitter());
    this.onDidChangeMaximized = this._onDidChangeMaximized.event;
    this._onDidRequestLayout = this._register(new Emitter());
    this.onDidRequestLayout = this._onDidRequestLayout.event;
    this._onDidChangeNavigation = this._register(new Emitter());
    this.onDidChangeNavigation = this._onDidChangeNavigation.event;
    this._sidebarHidden = false;
    this._hasSidebar = false;
    this._onDidToggleSidebar = this._register(new Emitter());
    this.onDidToggleSidebar = this._onDidToggleSidebar.event;
    this.optionsDisposable = this._register(new MutableDisposable());
    this.previousMainWindowActiveElement = null;
    this._maximized = options?.maximized ?? false;
    this._size = options?.size;
    this._position = options?.position;
    this._navigation = options?.navigation;
    this._hasSidebar = !!options?.sidebar;
    this._sidebarHidden = options?.sidebar?.sidebarHidden ?? false;
    this._sidebarWidth = options?.sidebar?.sidebarWidth;
    if (this._maximized) {
      this.savedSize = this._size;
      this.savedPosition = this._position;
    }
    this.enforceModalPartOptions();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(USE_MODAL_EDITOR_SETTING)) {
        this.enforceModalPartOptions();
      }
    }));
  }
  get maximized() {
    return this._maximized;
  }
  get size() {
    return this._size;
  }
  set size(value) {
    this._size = value;
  }
  get position() {
    return this._position;
  }
  set position(value) {
    this._position = value;
  }
  get sidebarWidth() {
    return this._sidebarWidth;
  }
  set sidebarWidth(value) {
    this._sidebarWidth = value;
  }
  get sidebarHidden() {
    return this._sidebarHidden;
  }
  set sidebarHidden(value) {
    this._sidebarHidden = value;
  }
  get hasSidebar() {
    return this._hasSidebar;
  }
  set hasSidebar(value) {
    this._hasSidebar = value;
  }
  get navigation() {
    return this._navigation;
  }
  create(parent, options) {
    this.previousMainWindowActiveElement = mainWindow.document.activeElement;
    super.create(parent, options);
  }
  enforceModalPartOptions() {
    const useModalForAll = this.configurationService.getValue(USE_MODAL_EDITOR_SETTING) === "all";
    const editorCount = this.groups.reduce((count, group) => count + group.count, 0);
    const showTabs = useModalForAll && editorCount > 1 ? "multiple" : "none";
    this.optionsDisposable.value = this.enforcePartOptions({
      showTabs,
      enablePreview: true,
      closeEmptyGroups: true,
      tabActionCloseVisibility: showTabs !== "none",
      editorActionsLocation: "hidden",
      tabHeight: "default",
      wrapTabs: false,
      allowDropIntoGroup: false
    });
  }
  updateOptions(options) {
    if (typeof options?.maximized === "boolean" && options.maximized !== this._maximized) {
      this.toggleMaximized();
    }
    this._navigation = options?.navigation;
    this._onDidChangeNavigation.fire(options?.navigation);
  }
  toggleMaximized() {
    this._maximized = !this._maximized;
    if (this._maximized) {
      this.savedSize = this._size;
      this.savedPosition = this._position;
    } else {
      this._size = this.savedSize;
      this._position = this.savedPosition;
      this.savedSize = void 0;
      this.savedPosition = void 0;
    }
    this._onDidChangeMaximized.fire(this._maximized);
  }
  toggleSidebar() {
    this._sidebarHidden = !this._sidebarHidden;
    this._onDidToggleSidebar.fire();
  }
  handleHeaderDoubleClick() {
    if (this._maximized) {
      this.savedSize = void 0;
      this.savedPosition = void 0;
      this.toggleMaximized();
    } else if (this._size) {
      this._size = void 0;
      this._position = void 0;
      this._onDidRequestLayout.fire();
    } else {
      this.toggleMaximized();
    }
  }
  handleContextKeys() {
    const isModalEditorPartContext = EditorPartModalContext.bindTo(this.modalContextKeyService);
    isModalEditorPartContext.set(true);
    const isMaximizedContext = EditorPartModalMaximizedContext.bindTo(this.modalContextKeyService);
    isMaximizedContext.set(this._maximized);
    this._register(this.onDidChangeMaximized((maximized) => isMaximizedContext.set(maximized)));
    const hasNavigationContext = EditorPartModalNavigationContext.bindTo(this.modalContextKeyService);
    hasNavigationContext.set(!!this._navigation && this._navigation.total > 1);
    this._register(this.onDidChangeNavigation((navigation) => hasNavigationContext.set(!!navigation && navigation.total > 1)));
    const sidebarContext = EditorPartModalSidebarContext.bindTo(this.modalContextKeyService);
    sidebarContext.set(this._hasSidebar);
    const sidebarVisibleContext = EditorPartModalSidebarVisibleContext.bindTo(this.modalContextKeyService);
    sidebarVisibleContext.set(this._hasSidebar && !this._sidebarHidden);
    this._register(this.onDidToggleSidebar(() => sidebarVisibleContext.set(this._hasSidebar && !this._sidebarHidden)));
    super.handleContextKeys();
  }
  removeGroup(group, preserveFocus) {
    const groupView = this.assertGroupView(group);
    if (this.count === 1 && this.activeGroup === groupView) {
      this.doRemoveLastGroup();
    } else {
      super.removeGroup(group, preserveFocus);
    }
  }
  doRemoveLastGroup() {
    const activeMainGroup = this.editorPartsView.mainPart.activeGroup;
    this.editorPartsView.mainPart.activateGroup(activeMainGroup, void 0, GroupActivationReason.PART_CLOSE);
    const mainEditorPartContainer = this.layoutService.getContainer(mainWindow, Parts.EDITOR_PART);
    if (!isHTMLElement(this.previousMainWindowActiveElement) || // invalid previous element
    !this.previousMainWindowActiveElement.isConnected || // previous element no longer in the DOM
    mainEditorPartContainer?.contains(this.previousMainWindowActiveElement)) {
      activeMainGroup.focus();
    } else {
      this.previousMainWindowActiveElement.focus();
    }
    this._onWillClose.fire();
  }
  saveState() {
    return;
  }
  async close(options) {
    if (options?.mergeAllEditorsToMainPart) {
      const result = this.mergeGroupsToMainPart();
      if (!result) {
        return false;
      }
    } else {
      for (const group of this.groups) {
        const closed = await group.closeAllEditors();
        if (!closed) {
          return false;
        }
      }
    }
    this._onWillClose.fire();
    return true;
  }
  mergeGroupsToMainPart() {
    if (!this.groups.some((group) => group.count > 0)) {
      return true;
    }
    let targetGroup = void 0;
    for (const group of this.editorPartsView.mainPart.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
      if (!group.isLocked) {
        targetGroup = group;
        break;
      }
    }
    if (!targetGroup) {
      targetGroup = this.editorPartsView.mainPart.addGroup(this.editorPartsView.mainPart.activeGroup, this.partOptions.openSideBySideDirection === "right" ? GroupDirection.RIGHT : GroupDirection.DOWN);
    }
    const result = this.mergeAllGroups(targetGroup, {
      // Try to reduce the impact of closing the modal
      // as much as possible by not changing existing editors
      // in the main window.
      preserveExistingIndex: true
    });
    targetGroup.focus();
    return result;
  }
  dispose() {
    this._navigation = void 0;
    super.dispose();
  }
};
ModalEditorPartImpl.COUNTER = 1;
ModalEditorPartImpl = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IWorkbenchLayoutService),
  __decorateParam(9, IHostService),
  __decorateParam(10, IContextKeyService)
], ModalEditorPartImpl);
export {
  ModalEditorPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9tb2RhbEVkaXRvclBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvbW9kYWxFZGl0b3JQYXJ0LmNzcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgRGltZW5zaW9uLCBFdmVudEhlbHBlciwgRXZlbnRUeXBlLCBoaWRlLCBJRGltZW5zaW9uLCBpc0hUTUxFbGVtZW50LCBzZXRWaXNpYmlsaXR5LCBzaG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBHbG9iYWxQb2ludGVyTW92ZU1vbml0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZ2xvYmFsUG9pbnRlck1vdmVNb25pdG9yLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciwgcHJlcGFyZUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IE9yaWVudGF0aW9uLCBTYXNoLCBTYXNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc2l6YWJsZUhUTUxFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Jlc2l6YWJsZS9yZXNpemFibGUuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyLCBXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFJlc3VsdEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBWaWV3LCBJRWRpdG9yUGFydHNWaWV3IH0gZnJvbSAnLi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFydCB9IGZyb20gJy4vZWRpdG9yUGFydC5qcyc7XG5pbXBvcnQgeyBHcm91cERpcmVjdGlvbiwgR3JvdXBzT3JkZXIsIElNb2RhbEVkaXRvclBhcnQsIEdyb3VwQWN0aXZhdGlvblJlYXNvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSwgVVNFX01PREFMX0VESVRPUl9TRVRUSU5HLCBVc2VNb2RhbEVkaXRvck1vZGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFydE1vZGFsQ29udGV4dCwgRWRpdG9yUGFydE1vZGFsTWF4aW1pemVkQ29udGV4dCwgRWRpdG9yUGFydE1vZGFsTmF2aWdhdGlvbkNvbnRleHQsIEVkaXRvclBhcnRNb2RhbFNpZGViYXJDb250ZXh0LCBFZGl0b3JQYXJ0TW9kYWxTaWRlYmFyVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgSUVkaXRvckNvbW1hbmRzQ29udGV4dCwgU2lkZUJ5U2lkZUVkaXRvciwgVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VMYWJlbCB9IGZyb20gJy4uLy4uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBDTE9TRV9NT0RBTF9FRElUT1JfQ09NTUFORF9JRCwgTU9WRV9NT0RBTF9FRElUT1JfVE9fTUFJTl9DT01NQU5EX0lELCBNT1ZFX01PREFMX0VESVRPUl9UT19XSU5ET1dfQ09NTUFORF9JRCwgTkFWSUdBVEVfTU9EQUxfRURJVE9SX05FWFRfQ09NTUFORF9JRCwgTkFWSUdBVEVfTU9EQUxfRURJVE9SX1BSRVZJT1VTX0NPTU1BTkRfSUQsIFRPR0dMRV9NT0RBTF9FRElUT1JfTUFYSU1JWkVEX0NPTU1BTkRfSUQsIFRPR0dMRV9NT0RBTF9FRElUT1JfU0lERUJBUl9DT01NQU5EX0lEIH0gZnJvbSAnLi9lZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJTW9kYWxFZGl0b3JOYXZpZ2F0aW9uLCBJTW9kYWxFZGl0b3JQYXJ0T3B0aW9ucywgSU1vZGFsRWRpdG9yU2lkZWJhciwgaXNNb2RhbEVkaXRvck9wdGlvbnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcblxuY29uc3QgTU9EQUxfTUlOX1dJRFRIID0gNDAwO1xuY29uc3QgTU9EQUxfTUlOX0hFSUdIVCA9IDMwMDtcbmNvbnN0IE1PREFMX01BWF9ERUZBVUxUX1dJRFRIID0gMTQwMDtcbmNvbnN0IE1PREFMX01BWF9ERUZBVUxUX0hFSUdIVCA9IDkwMDtcbmNvbnN0IE1PREFMX0JPUkRFUl9XSURUSCA9IDE7IC8vIDFweCBib3JkZXIgb24gZWFjaCBzaWRlXG5jb25zdCBNT0RBTF9CT1JERVJfU0laRSA9IE1PREFMX0JPUkRFUl9XSURUSCAqIDI7XG5jb25zdCBNT0RBTF9IRUFERVJfSEVJR0hUID0gMzM7IC8vIEZhbGxiYWNrIG9ubHkgXHUyMDE0IGFjdHVhbCBoZWlnaHQgaXMgbWVhc3VyZWQgZnJvbSB0aGUgcmVuZGVyZWQgaGVhZGVyIGVsZW1lbnQgdG8gYWNjb3VudCBmb3IgdGhlIGNvbXBhY3QtaGVhZGVyIHZhcmlhbnQuXG5jb25zdCBNT0RBTF9TTkFQX1RIUkVTSE9MRCA9IDIwO1xuY29uc3QgTU9EQUxfTUFYSU1JWkVEX1BBRERJTkcgPSAxNjtcbmNvbnN0IE1PREFMX1NJREVCQVJfTUlOX1dJRFRIID0gMTYwO1xuY29uc3QgTU9EQUxfU0lERUJBUl9ERUZBVUxUX1dJRFRIID0gMjYwO1xuY29uc3QgTU9EQUxfU0lERUJBUl9QQURESU5HID0gODsgLy8gbWF0Y2hlcyBDU1MgcGFkZGluZyBvbiBzaWRlYmFyIGNvbnRhaW5lclxuY29uc3QgTU9EQUxfU0lERUJBUl9CT1JERVJfUklHSFQgPSAxOyAvLyBtYXRjaGVzIENTUyBib3JkZXItcmlnaHQgb24gc2lkZWJhciBjb250YWluZXJcblxuY29uc3QgZGVmYXVsdE1vZGFsRWRpdG9yQWxsb3dhYmxlQ29tbWFuZHMgPSBuZXcgU2V0KFtcblxuXHQvLyBBcHBsaWNhdGlvblxuXHQnd29ya2JlbmNoLmFjdGlvbi5xdWl0Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ucmVsb2FkV2luZG93Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlRnVsbFNjcmVlbicsXG5cblx0Ly8gUXVpY2sgYWNjZXNzXG5cdCd3b3JrYmVuY2guYWN0aW9uLmdvdG9TeW1ib2wnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5nb3RvTGluZScsXG5cblx0Ly8gWm9vbVxuXHQnd29ya2JlbmNoLmFjdGlvbi56b29tSW4nLFxuXHQnd29ya2JlbmNoLmFjdGlvbi56b29tT3V0Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uem9vbVJlc2V0JyxcblxuXHQvLyBGaWxlIG9wZXJhdGlvbnNcblx0J3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMuc2F2ZScsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLnNhdmVBbGwnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5yZXZlcnQnLFxuXG5cdC8vIENsb3NlIGVkaXRvcnNcblx0J3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VBY3RpdmVFZGl0b3InLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5jbG9zZUFsbEVkaXRvcnMnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5jbG9zZUVkaXRvcnNJbkdyb3VwJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VVbm1vZGlmaWVkRWRpdG9ycycsXG5cblx0Ly8gU2V0dGluZ3Ncblx0J3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzMicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5nc0pzb24nLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuR2xvYmFsU2V0dGluZ3MnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuQXBwbGljYXRpb25TZXR0aW5nc0pzb24nLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuUmF3RGVmYXVsdFNldHRpbmdzJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3BlbldvcmtzcGFjZVNldHRpbmdzJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3BlbldvcmtzcGFjZVNldHRpbmdzRmlsZScsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm9wZW5Gb2xkZXJTZXR0aW5ncycsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm9wZW5Gb2xkZXJTZXR0aW5nc0ZpbGUnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuUmVtb3RlU2V0dGluZ3MnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuUmVtb3RlU2V0dGluZ3NGaWxlJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3BlbkFjY2Vzc2liaWxpdHlTZXR0aW5ncycsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmNvbmZpZ3VyZUxhbmd1YWdlQmFzZWRTZXR0aW5ncycsXG5cblx0Ly8gS2V5YmluZGluZ3Ncblx0J3dvcmtiZW5jaC5hY3Rpb24ub3Blbkdsb2JhbEtleWJpbmRpbmdzJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3BlbkRlZmF1bHRLZXliaW5kaW5nc0ZpbGUnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuR2xvYmFsS2V5YmluZGluZ3NGaWxlJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3BlbktleWJvYXJkTGF5b3V0UGlja2VyJyxcblxuXHQvLyBNb2RhbCBlZGl0b3Jcblx0Q0xPU0VfTU9EQUxfRURJVE9SX0NPTU1BTkRfSUQsXG5cdE1PVkVfTU9EQUxfRURJVE9SX1RPX01BSU5fQ09NTUFORF9JRCxcblx0TU9WRV9NT0RBTF9FRElUT1JfVE9fV0lORE9XX0NPTU1BTkRfSUQsXG5cdFRPR0dMRV9NT0RBTF9FRElUT1JfTUFYSU1JWkVEX0NPTU1BTkRfSUQsXG5cdE5BVklHQVRFX01PREFMX0VESVRPUl9QUkVWSU9VU19DT01NQU5EX0lELFxuXHROQVZJR0FURV9NT0RBTF9FRElUT1JfTkVYVF9DT01NQU5EX0lELFxuXHRUT0dHTEVfTU9EQUxfRURJVE9SX1NJREVCQVJfQ09NTUFORF9JRCxcbl0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDcmVhdGVNb2RhbEVkaXRvclBhcnRSZXN1bHQge1xuXHRyZWFkb25seSBwYXJ0OiBNb2RhbEVkaXRvclBhcnRJbXBsO1xuXHRyZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5pbnRlcmZhY2UgSU1vZGFsRWRpdG9yU2lkZWJhckNvbnRyb2xsZXIge1xuXG5cdHJlYWRvbmx5IG9uRGlkUmVzaXplOiBFdmVudDx2b2lkPjtcblxuXHRnZXRXaWR0aCgpOiBudW1iZXI7XG5cdGhhc0N1c3RvbVdpZHRoKCk6IGJvb2xlYW47XG5cdGNsYW1wV2lkdGgobW9kYWxXaWR0aDogbnVtYmVyKTogdm9pZDtcblxuXHRpc1Zpc2libGUoKTogYm9vbGVhbjtcblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZDtcblxuXHRsYXlvdXQoaGVpZ2h0OiBudW1iZXIpOiB2b2lkO1xuXHR1cGRhdGVDb250ZW50KGNvbnRlbnQ6IElNb2RhbEVkaXRvclNpZGViYXIpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgTW9kYWxFZGl0b3JQYXJ0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvclBhcnRzVmlldzogSUVkaXRvclBhcnRzVmlldyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRhc3luYyBjcmVhdGUob3B0aW9ucz86IElNb2RhbEVkaXRvclBhcnRPcHRpb25zKTogUHJvbWlzZTxJQ3JlYXRlTW9kYWxFZGl0b3JQYXJ0UmVzdWx0PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBNb2RhbCBjb250YWluZXJcblx0XHRjb25zdCBtb2RhbEVsZW1lbnQgPSAkKCcubW9uYWNvLW1vZGFsLWVkaXRvci1ibG9jaycpO1xuXHRcdHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLmFwcGVuZENoaWxkKG1vZGFsRWxlbWVudCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBtb2RhbEVsZW1lbnQucmVtb3ZlKCkpKTtcblxuXHRcdC8vIENvbnRleHQga2V5IHNlcnZpY2Ugc2NvcGVkIHRvIHRoZSBlbnRpcmUgbW9kYWwgZWxlbWVudCBzbyB0aGF0IHRoZVxuXHRcdC8vIG1vZGFsLWxldmVsIGNvbnRleHQga2V5cyAoZS5nLiBgZWRpdG9yUGFydE1vZGFsYCkgYXJlIGFjdGl2ZSB3aGVuIGZvY3VzXG5cdFx0Ly8gaXMgYW55d2hlcmUgaW5zaWRlIHRoZSBtb2RhbC4gQm90aCB0aGUgZWRpdG9yIHBhcnQgYW5kIHRoZSBzaWRlYmFyXG5cdFx0Ly8gY29udGVudCBhcmUgd2lyZWQgdXAgdG8gZGVzY2VuZCBmcm9tIHRoaXMgc2VydmljZSBzbyB0aGF0IGNvbW1hbmRzIGxpa2Vcblx0XHQvLyBjbG9zaW5nIHRoZSBtb2RhbCBvbiBgRXNjYXBlYCB3b3JrIHJlZ2FyZGxlc3Mgb2Ygd2hpY2ggYXJlYSBoYXMgZm9jdXNcblx0XHQvLyAoZS5nLiB0aGUgc2lkZWJhciBjaGFuZ2VzIHRyZWUpLlxuXHRcdGNvbnN0IG1vZGFsQ29udGV4dEtleVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQobW9kYWxFbGVtZW50KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1vZGFsRWxlbWVudCwgRXZlbnRUeXBlLk1PVVNFX0RPV04sIGUgPT4ge1xuXHRcdFx0aWYgKGUudGFyZ2V0ID09PSBtb2RhbEVsZW1lbnQpIHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdFx0XHQvLyBDbG9zZSBtb2RhbCB3aGVuIGNsaWNraW5nIG91dHNpZGUgdGhlIGRpYWxvZ1xuXHRcdFx0XHR2b2lkIGVkaXRvclBhcnQuY2xvc2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRsZXQgdXNlTW9kYWxNb2RlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxVc2VNb2RhbEVkaXRvck1vZGU+KFVTRV9NT0RBTF9FRElUT1JfU0VUVElORyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVVNFX01PREFMX0VESVRPUl9TRVRUSU5HKSkge1xuXHRcdFx0XHR1c2VNb2RhbE1vZGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFVzZU1vZGFsRWRpdG9yTW9kZT4oVVNFX01PREFMX0VESVRPUl9TRVRUSU5HKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1vZGFsRWxlbWVudCwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblxuXHRcdFx0Ly8gUHJldmVudCB1bnN1cHBvcnRlZCBjb21tYW5kcyB1bmxlc3MgYWxsIGVkaXRvcnMgb3BlbiBpbiBtb2RhbFxuXHRcdFx0aWYgKHVzZU1vZGFsTW9kZSAhPT0gJ2FsbCcpIHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLnNvZnREaXNwYXRjaChldmVudCwgdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIpO1xuXHRcdFx0XHRpZiAocmVzb2x2ZWQua2luZCA9PT0gUmVzdWx0S2luZC5LYkZvdW5kICYmIHJlc29sdmVkLmNvbW1hbmRJZCkge1xuXHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdHJlc29sdmVkLmNvbW1hbmRJZC5zdGFydHNXaXRoKCd3b3JrYmVuY2guJykgJiZcblx0XHRcdFx0XHRcdCFkZWZhdWx0TW9kYWxFZGl0b3JBbGxvd2FibGVDb21tYW5kcy5oYXMocmVzb2x2ZWQuY29tbWFuZElkKVxuXHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChldmVudCwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVzaXphYmxlIHdyYXBwZXJcblx0XHRjb25zdCByZXNpemFibGVFbGVtZW50ID0gbmV3IFJlc2l6YWJsZUhUTUxFbGVtZW50KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByZXNpemFibGVFbGVtZW50LmRpc3Bvc2UoKSkpO1xuXHRcdHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdtb2RhbC1lZGl0b3ItcmVzaXphYmxlJyk7XG5cdFx0Y29uc3QgZWZmZWN0aXZlTWluV2lkdGggPSBNT0RBTF9NSU5fV0lEVEggKyAob3B0aW9ucz8uc2lkZWJhciA/IE1PREFMX1NJREVCQVJfTUlOX1dJRFRIIDogMCk7XG5cdFx0cmVzaXphYmxlRWxlbWVudC5taW5TaXplID0gbmV3IERpbWVuc2lvbihlZmZlY3RpdmVNaW5XaWR0aCwgTU9EQUxfTUlOX0hFSUdIVCk7XG5cdFx0bW9kYWxFbGVtZW50LmFwcGVuZENoaWxkKHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZSk7XG5cblx0XHRjb25zdCBzaGFkb3dFbGVtZW50ID0gcmVzaXphYmxlRWxlbWVudC5kb21Ob2RlLmFwcGVuZENoaWxkKCQoJy5tb2RhbC1lZGl0b3Itc2hhZG93JykpO1xuXG5cdFx0Ly8gRWRpdG9yIHBhcnQgY29udGFpbmVyXG5cdFx0Y29uc3QgdGl0bGVJZCA9ICdtb2RhbC1lZGl0b3ItdGl0bGUnO1xuXHRcdGNvbnN0IGVkaXRvclBhcnRDb250YWluZXIgPSAkKCcucGFydC5lZGl0b3IubW9kYWwtZWRpdG9yLXBhcnQnLCB7XG5cdFx0XHRyb2xlOiAnZGlhbG9nJyxcblx0XHRcdCdhcmlhLW1vZGFsJzogJ3RydWUnLFxuXHRcdFx0J2FyaWEtbGFiZWxsZWRieSc6IHRpdGxlSWQsXG5cdFx0fSk7XG5cdFx0c2hhZG93RWxlbWVudC5hcHBlbmRDaGlsZChlZGl0b3JQYXJ0Q29udGFpbmVyKTtcblxuXHRcdC8vIEhlYWRlclxuXHRcdGNvbnN0IGhlYWRlckVsZW1lbnQgPSBlZGl0b3JQYXJ0Q29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5tb2RhbC1lZGl0b3ItaGVhZGVyJykpO1xuXG5cdFx0Ly8gU2lkZWJhciB0b2dnbGUgYnV0dG9uIChvbmx5IHdoZW4gc2lkZWJhciBpcyBjb25maWd1cmVkKVxuXHRcdGNvbnN0IHNpZGViYXJUb2dnbGVDb250YWluZXIgPSBhcHBlbmQoaGVhZGVyRWxlbWVudCwgJCgnZGl2Lm1vZGFsLWVkaXRvci1zaWRlYmFyLXRvZ2dsZScpKTtcblx0XHRpZiAoIW9wdGlvbnM/LnNpZGViYXIpIHtcblx0XHRcdGhpZGUoc2lkZWJhclRvZ2dsZUNvbnRhaW5lcik7XG5cdFx0fVxuXHRcdGNvbnN0IHNpZGViYXJUb2dnbGVJY29uID0gb3B0aW9ucz8uc2lkZWJhcj8uc2lkZWJhckhpZGRlbiA/IENvZGljb24ubGF5b3V0U2lkZWJhckxlZnRPZmYgOiBDb2RpY29uLmxheW91dFNpZGViYXJMZWZ0O1xuXHRcdGNvbnN0IHNpZGViYXJUb2dnbGVBY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbihUT0dHTEVfTU9EQUxfRURJVE9SX1NJREVCQVJfQ09NTUFORF9JRCwgbG9jYWxpemUoJ3RvZ2dsZVNpZGViYXInLCBcIlRvZ2dsZSBTaWRlYmFyXCIpLCBUaGVtZUljb24uYXNDbGFzc05hbWUoc2lkZWJhclRvZ2dsZUljb24pLCB0cnVlKSk7XG5cdFx0Y29uc3Qgc2lkZWJhclRvZ2dsZUFjdGlvbkJhciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uQmFyKHNpZGViYXJUb2dnbGVDb250YWluZXIpKTtcblx0XHRzaWRlYmFyVG9nZ2xlQWN0aW9uQmFyLnB1c2goc2lkZWJhclRvZ2dsZUFjdGlvbiwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cblx0XHQvLyBUaXRsZSBlbGVtZW50XG5cdFx0Y29uc3QgdGl0bGVFbGVtZW50ID0gYXBwZW5kKGhlYWRlckVsZW1lbnQsICQoJ2Rpdi5tb2RhbC1lZGl0b3ItdGl0bGUuc2hvdy1maWxlLWljb25zJykpO1xuXHRcdHRpdGxlRWxlbWVudC5pZCA9IHRpdGxlSWQ7XG5cdFx0dGl0bGVFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cblx0XHQvLyBOYXZpZ2F0aW9uIHdpZGdldFxuXHRcdGNvbnN0IG5hdmlnYXRpb25Db250YWluZXIgPSBhcHBlbmQoaGVhZGVyRWxlbWVudCwgJCgnZGl2Lm1vZGFsLWVkaXRvci1uYXZpZ2F0aW9uJykpO1xuXHRcdGhpZGUobmF2aWdhdGlvbkNvbnRhaW5lcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihuYXZpZ2F0aW9uQ29udGFpbmVyLCBFdmVudFR5cGUuREJMQ0xJQ0ssIGUgPT4gRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKSkpO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNCdXR0b24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihuYXZpZ2F0aW9uQ29udGFpbmVyLCB7IHRpdGxlOiBsb2NhbGl6ZSgncHJldmlvdXNJdGVtJywgXCJQcmV2aW91c1wiKSB9KSk7XG5cdFx0cHJldmlvdXNCdXR0b24uaWNvbiA9IENvZGljb24uY2hldnJvbkxlZnQ7XG5cdFx0cHJldmlvdXNCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb2RhbC1lZGl0b3ItbmF2LWJ1dHRvbicpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcmV2aW91c0J1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdGNvbnN0IG5hdmlnYXRpb24gPSBlZGl0b3JQYXJ0Lm5hdmlnYXRpb247XG5cdFx0XHRpZiAobmF2aWdhdGlvbiAmJiBuYXZpZ2F0aW9uLmN1cnJlbnQgPiAwKSB7XG5cdFx0XHRcdG5hdmlnYXRpb24ubmF2aWdhdGUobmF2aWdhdGlvbi5jdXJyZW50IC0gMSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbmF2aWdhdGlvbkxhYmVsID0gYXBwZW5kKG5hdmlnYXRpb25Db250YWluZXIsICQoJ3NwYW4ubW9kYWwtZWRpdG9yLW5hdi1sYWJlbCcpKTtcblx0XHRuYXZpZ2F0aW9uTGFiZWwuc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAncG9saXRlJyk7XG5cblx0XHRjb25zdCBuZXh0QnV0dG9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24obmF2aWdhdGlvbkNvbnRhaW5lciwgeyB0aXRsZTogbG9jYWxpemUoJ25leHRJdGVtJywgXCJOZXh0XCIpIH0pKTtcblx0XHRuZXh0QnV0dG9uLmljb24gPSBDb2RpY29uLmNoZXZyb25SaWdodDtcblx0XHRuZXh0QnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbW9kYWwtZWRpdG9yLW5hdi1idXR0b24nKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobmV4dEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdGNvbnN0IG5hdmlnYXRpb24gPSBlZGl0b3JQYXJ0Lm5hdmlnYXRpb247XG5cdFx0XHRpZiAobmF2aWdhdGlvbiAmJiBuYXZpZ2F0aW9uLmN1cnJlbnQgPCBuYXZpZ2F0aW9uLnRvdGFsIC0gMSkge1xuXHRcdFx0XHRuYXZpZ2F0aW9uLm5hdmlnYXRlKG5hdmlnYXRpb24uY3VycmVudCArIDEpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFRvb2xiYXJcblx0XHRjb25zdCBhY3Rpb25CYXJDb250YWluZXIgPSBhcHBlbmQoaGVhZGVyRWxlbWVudCwgJCgnZGl2Lm1vZGFsLWVkaXRvci1hY3Rpb24tY29udGFpbmVyJykpO1xuXG5cdFx0Ly8gU2lkZWJhclxuXHRcdGNvbnN0IHNpZGViYXJSZXN1bHQgPSB0aGlzLmNyZWF0ZVNpZGViYXIoZWRpdG9yUGFydENvbnRhaW5lciwgaGVhZGVyRWxlbWVudCwgb3B0aW9ucz8uc2lkZWJhciwgbW9kYWxDb250ZXh0S2V5U2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXHRcdGlmIChzaWRlYmFyUmVzdWx0KSB7XG5cdFx0XHRpZiAoc2lkZWJhclJlc3VsdC5pc1Zpc2libGUoKSkge1xuXHRcdFx0XHRlZGl0b3JQYXJ0Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2hhcy1zaWRlYmFyJyk7XG5cdFx0XHR9XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZWJhclJlc3VsdC5vbkRpZFJlc2l6ZSgoKSA9PiBsYXlvdXRNb2RhbCgpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBlZGl0b3IgcGFydCAoc2NvcGVkIHRvIHRoZSBtb2RhbCBjb250ZXh0IGtleSBzZXJ2aWNlIHNvIHRoYXRcblx0XHQvLyB0aGUgZWRpdG9yIGFyZWEgYWxzbyBkZXNjZW5kcyBmcm9tIGl0KVxuXHRcdGNvbnN0IG1vZGFsSW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUNvbnRleHRLZXlTZXJ2aWNlLCBtb2RhbENvbnRleHRLZXlTZXJ2aWNlXVxuXHRcdCkpKTtcblx0XHRjb25zdCBlZGl0b3JQYXJ0ID0gZGlzcG9zYWJsZXMuYWRkKG1vZGFsSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRNb2RhbEVkaXRvclBhcnRJbXBsLFxuXHRcdFx0bWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZCxcblx0XHRcdHRoaXMuZWRpdG9yUGFydHNWaWV3LFxuXHRcdFx0bW9kYWxFbGVtZW50LFxuXHRcdFx0b3B0aW9ucyxcblx0XHQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5lZGl0b3JQYXJ0c1ZpZXcucmVnaXN0ZXJQYXJ0KGVkaXRvclBhcnQpKTtcblx0XHRlZGl0b3JQYXJ0LmNyZWF0ZShlZGl0b3JQYXJ0Q29udGFpbmVyKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKGVkaXRvclBhcnQub25XaWxsQ2xvc2UpKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5ydW5BbmRTdWJzY3JpYmUoZWRpdG9yUGFydC5vbkRpZENoYW5nZU5hdmlnYXRpb24sICgobmF2aWdhdGlvbjogSU1vZGFsRWRpdG9yTmF2aWdhdGlvbiB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0aWYgKG5hdmlnYXRpb24gJiYgbmF2aWdhdGlvbi50b3RhbCA+IDEpIHtcblx0XHRcdFx0c2hvdyhuYXZpZ2F0aW9uQ29udGFpbmVyKTtcblx0XHRcdFx0bmF2aWdhdGlvbkxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25hdmlnYXRpb25Db3VudGVyJywgXCJ7MH0gb2YgezF9XCIsIG5hdmlnYXRpb24uY3VycmVudCArIDEsIG5hdmlnYXRpb24udG90YWwpO1xuXHRcdFx0XHRwcmV2aW91c0J1dHRvbi5lbmFibGVkID0gbmF2aWdhdGlvbi5jdXJyZW50ID4gMDtcblx0XHRcdFx0bmV4dEJ1dHRvbi5lbmFibGVkID0gbmF2aWdhdGlvbi5jdXJyZW50IDwgbmF2aWdhdGlvbi50b3RhbCAtIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoaWRlKG5hdmlnYXRpb25Db250YWluZXIpO1xuXHRcdFx0fVxuXHRcdH0pLCBlZGl0b3JQYXJ0Lm5hdmlnYXRpb24pKTtcblx0XHRpZiAoc2lkZWJhclJlc3VsdCkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShzaWRlYmFyUmVzdWx0Lm9uRGlkUmVzaXplLCAoKSA9PiB7XG5cdFx0XHRcdGlmIChzaWRlYmFyUmVzdWx0LmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFydC5zaWRlYmFyV2lkdGggPSBzaWRlYmFyUmVzdWx0Lmhhc0N1c3RvbVdpZHRoKCkgPyBzaWRlYmFyUmVzdWx0LmdldFdpZHRoKCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JQYXJ0Lm9uRGlkVG9nZ2xlU2lkZWJhcigoKSA9PiB7XG5cdFx0XHRcdHNpZGViYXJSZXN1bHQuc2V0VmlzaWJsZSghZWRpdG9yUGFydC5zaWRlYmFySGlkZGVuKTtcblx0XHRcdFx0c2lkZWJhclRvZ2dsZUFjdGlvbi5jbGFzcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShlZGl0b3JQYXJ0LnNpZGViYXJIaWRkZW4gPyBDb2RpY29uLmxheW91dFNpZGViYXJMZWZ0T2ZmIDogQ29kaWNvbi5sYXlvdXRTaWRlYmFyTGVmdCk7XG5cdFx0XHRcdGxheW91dE1vZGFsKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gV2lyZSB1cCBzaWRlYmFyIHRvZ2dsZSBidXR0b25cblx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZWJhclRvZ2dsZUFjdGlvbkJhci5vbkRpZFJ1bigoKSA9PiBlZGl0b3JQYXJ0LnRvZ2dsZVNpZGViYXIoKSkpO1xuXG5cdFx0Ly8gQ3JlYXRlIHNjb3BlZCBpbnN0YW50aWF0aW9uIHNlcnZpY2Vcblx0XHRjb25zdCBtb2RhbEVkaXRvclNlcnZpY2UgPSB0aGlzLmVkaXRvclNlcnZpY2UuY3JlYXRlU2NvcGVkKGVkaXRvclBhcnQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChlZGl0b3JQYXJ0LnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJRWRpdG9yU2VydmljZSwgbW9kYWxFZGl0b3JTZXJ2aWNlXVxuXHRcdCkpKTtcblxuXHRcdC8vIENyZWF0ZSBlZGl0b3IgdG9vbGJhclxuXHRcdGNvbnN0IGVkaXRvckFjdGlvbnNUb29sYmFyQ29udGFpbmVyID0gYXBwZW5kKGFjdGlvbkJhckNvbnRhaW5lciwgJCgnZGl2Lm1vZGFsLWVkaXRvci1lZGl0b3ItYWN0aW9ucycpKTtcblx0XHRjb25zdCBlZGl0b3JBY3Rpb25zVG9vbGJhciA9IGRpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUb29sQmFyLCBlZGl0b3JBY3Rpb25zVG9vbGJhckNvbnRhaW5lciwge1xuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0aGlnaGxpZ2h0VG9nZ2xlZEl0ZW1zOiB0cnVlLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGVkaXRvckFjdGlvbnNTZXBhcmF0b3IgPSBhcHBlbmQoYWN0aW9uQmFyQ29udGFpbmVyLCAkKCdkaXYubW9kYWwtZWRpdG9yLWFjdGlvbi1zZXBhcmF0b3InKSk7XG5cdFx0Y29uc3QgZWRpdG9yQWN0aW9uc0Rpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgdXBkYXRlRWRpdG9yQWN0aW9ucyA9ICgpID0+IHtcblx0XHRcdGVkaXRvckFjdGlvbnNEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHRjb25zdCBlZGl0b3JBY3Rpb25zID0gZWRpdG9yUGFydC5hY3RpdmVHcm91cC5jcmVhdGVFZGl0b3JBY3Rpb25zKGVkaXRvckFjdGlvbnNEaXNwb3NhYmxlcywgTWVudUlkLk1vZGFsRWRpdG9yRWRpdG9yVGl0bGUpO1xuXHRcdFx0ZWRpdG9yQWN0aW9uc0Rpc3Bvc2FibGVzLmFkZChlZGl0b3JBY3Rpb25zLm9uRGlkQ2hhbmdlKCgpID0+IHVwZGF0ZUVkaXRvckFjdGlvbnMoKSkpO1xuXG5cdFx0XHRjb25zdCB7IHByaW1hcnksIHNlY29uZGFyeSB9ID0gZWRpdG9yQWN0aW9ucy5hY3Rpb25zO1xuXHRcdFx0ZWRpdG9yQWN0aW9uc1Rvb2xiYXIuc2V0QWN0aW9ucyhwcmVwYXJlQWN0aW9ucyhwcmltYXJ5KSwgcHJlcGFyZUFjdGlvbnMoc2Vjb25kYXJ5KSk7XG5cblx0XHRcdGNvbnN0IGhhc0FjdGlvbnMgPSBwcmltYXJ5Lmxlbmd0aCA+IDAgfHwgc2Vjb25kYXJ5Lmxlbmd0aCA+IDA7XG5cdFx0XHRzZXRWaXNpYmlsaXR5KGhhc0FjdGlvbnMsIGVkaXRvckFjdGlvbnNTZXBhcmF0b3IpO1xuXHRcdH07XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShtb2RhbEVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UsICgpID0+IHVwZGF0ZUVkaXRvckFjdGlvbnMoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RhbEVkaXRvclNlcnZpY2Uub25EaWRFZGl0b3JzQ2hhbmdlKCgpID0+IGVkaXRvclBhcnQuZW5mb3JjZU1vZGFsUGFydE9wdGlvbnMoKSkpO1xuXG5cdFx0Ly8gQ3JlYXRlIGdsb2JhbCB0b29sYmFyXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBhY3Rpb25CYXJDb250YWluZXIsIE1lbnVJZC5Nb2RhbEVkaXRvclRpdGxlLCB7XG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHRoaWdobGlnaHRUb2dnbGVkSXRlbXM6IHRydWUsXG5cdFx0XHRtZW51T3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ3JlYXRlIGxhYmVsXG5cdFx0Y29uc3QgbGFiZWwgPSBkaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbCwgdGl0bGVFbGVtZW50LCB7fSkpO1xuXHRcdGNvbnN0IGxhYmVsQ2hhbmdlRGlzcG9zYWJsZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0bGV0IHRyYWNrZWRFZGl0b3I6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHVwZGF0ZUxhYmVsID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gZWRpdG9yUGFydC5hY3RpdmVHcm91cC5hY3RpdmVFZGl0b3I7XG5cdFx0XHRpZiAoYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdGNvbnN0IHsgbGFiZWxGb3JtYXQgfSA9IGVkaXRvclBhcnQucGFydE9wdGlvbnM7XG5cblx0XHRcdFx0bGFiZWwuZWxlbWVudC5zZXRSZXNvdXJjZShcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShhY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQk9USCB9KSxcblx0XHRcdFx0XHRcdG5hbWU6IGFjdGl2ZUVkaXRvci5nZXROYW1lKCksXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogYWN0aXZlRWRpdG9yLmdldERlc2NyaXB0aW9uKGxhYmVsRm9ybWF0ID09PSAnc2hvcnQnID8gVmVyYm9zaXR5LlNIT1JUIDogbGFiZWxGb3JtYXQgPT09ICdsb25nJyA/IFZlcmJvc2l0eS5MT05HIDogVmVyYm9zaXR5Lk1FRElVTSkgfHwgJydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHRpdGxlOiBhY3RpdmVFZGl0b3IuZ2V0VGl0bGUoVmVyYm9zaXR5LkxPTkcpLFxuXHRcdFx0XHRcdFx0aWNvbjogYWN0aXZlRWRpdG9yLmdldEljb24oKSxcblx0XHRcdFx0XHRcdGV4dHJhQ2xhc3NlczogYWN0aXZlRWRpdG9yLmdldExhYmVsRXh0cmFDbGFzc2VzKCksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdC8vIE9ubHkgKHJlKXN1YnNjcmliZSB3aGVuIHRoZSBhY3RpdmUgZWRpdG9yIGNoYW5nZXMsIG5vdCBvbiBldmVyeSBsYWJlbCB1cGRhdGVcblx0XHRcdFx0aWYgKHRyYWNrZWRFZGl0b3IgIT09IGFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdHRyYWNrZWRFZGl0b3IgPSBhY3RpdmVFZGl0b3I7XG5cdFx0XHRcdFx0bGFiZWxDaGFuZ2VEaXNwb3NhYmxlLnZhbHVlID0gYWN0aXZlRWRpdG9yLm9uRGlkQ2hhbmdlTGFiZWwoKCkgPT4gdXBkYXRlTGFiZWwoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhYmVsLmVsZW1lbnQuY2xlYXIoKTtcblx0XHRcdFx0dHJhY2tlZEVkaXRvciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0bGFiZWxDaGFuZ2VEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQucnVuQW5kU3Vic2NyaWJlKG1vZGFsRWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSwgdXBkYXRlTGFiZWwpKTtcblxuXHRcdC8vIEhhbmRsZSBkb3VibGUtY2xpY2sgb24gaGVhZGVyIHRvIHRvZ2dsZSBtYXhpbWl6ZVxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaGVhZGVyRWxlbWVudCwgRXZlbnRUeXBlLkRCTENMSUNLLCBlID0+IHtcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRcdGVkaXRvclBhcnQuaGFuZGxlSGVhZGVyRG91YmxlQ2xpY2soKTtcblx0XHR9KSk7XG5cblx0XHQvLyBIYW5kbGUgcmlnaHQtY2xpY2sgb24gaGVhZGVyIHRvIG9wZW4gY29udGV4dCBtZW51LiBUaGUgY29udGV4dCBtZW51XG5cdFx0Ly8gYWxzbyBzdXJmYWNlcyB0aGUgZWRpdG9yIGFjdGlvbnMgb2YgdGhlIGFjdGl2ZSBlZGl0b3IgZ3JvdXAsIG1pcnJvcmluZ1xuXHRcdC8vIGhvdyB0aGUgd29ya2JlbmNoIHRpdGxlYmFyIGV4cG9zZXMgdGhlbSB3aGVuXG5cdFx0Ly8gYHdvcmtiZW5jaC5lZGl0b3IuZWRpdG9yQWN0aW9uc0xvY2F0aW9uYCBpcyBzZXQgdG8gYHRpdGxlQmFyYC4gVGhlXG5cdFx0Ly8gYWN0aXZlIGVkaXRvciBwYW5lJ3MgYHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlYCBpcyB1c2VkIHNvIHRoZSBhY3Rpb25zJ1xuXHRcdC8vIGB3aGVuYC9gcHJlY29uZGl0aW9uYCBhbmQga2V5YmluZGluZyBsYWJlbHMgYXJlIGV2YWx1YXRlZCBpbiB0aGUgY29ycmVjdFxuXHRcdC8vIHNjb3BlLlxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaGVhZGVyRWxlbWVudCwgRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldDtcblx0XHRcdGlmIChpc0hUTUxFbGVtZW50KHRhcmdldCkgJiYgKHRhcmdldC5jbG9zZXN0KCcubW9uYWNvLWJ1dHRvbicpIHx8IHRhcmdldC5jbG9zZXN0KCcuYWN0aW9uLWl0ZW0nKSkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBkbyBub3Qgc2hvdyBvdXIgY29udGV4dCBtZW51IG92ZXIgaGVhZGVyIGJ1dHRvbnMgLyBhY3Rpb25zXG5cdFx0XHR9XG5cblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGNvbnRleHRNZW51RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBhY3RpdmVHcm91cCA9IGVkaXRvclBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBhY3RpdmVHcm91cC5hY3RpdmVFZGl0b3I7XG5cdFx0XHRjb25zdCBlZGl0b3JTY29wZWRDb250ZXh0S2V5U2VydmljZSA9IGFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvclBhbmU/LnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID8/IGFjdGl2ZUdyb3VwLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdFx0Y29uc3QgZWRpdG9yQWN0aW9ucyA9IGFjdGl2ZUdyb3VwLmNyZWF0ZUVkaXRvckFjdGlvbnMoY29udGV4dE1lbnVEaXNwb3NhYmxlcywgTWVudUlkLkVkaXRvclRpdGxlKTtcblx0XHRcdGNvbnN0IHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH0gPSBlZGl0b3JBY3Rpb25zLmFjdGlvbnM7XG5cblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdG1lbnVJZDogTWVudUlkLk1vZGFsRWRpdG9yVGl0bGVDb250ZXh0LFxuXHRcdFx0XHRjb250ZXh0S2V5U2VydmljZTogZWRpdG9yU2NvcGVkQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gKHsgeDogZS5jbGllbnRYLCB5OiBlLmNsaWVudFkgfSksXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IFNlcGFyYXRvci5qb2luKHByaW1hcnksIHNlY29uZGFyeSksXG5cdFx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiAoeyBncm91cElkOiBhY3RpdmVHcm91cC5pZCwgZWRpdG9ySW5kZXg6IGFjdGl2ZUVkaXRvciA/IGFjdGl2ZUdyb3VwLmdldEluZGV4T2ZFZGl0b3IoYWN0aXZlRWRpdG9yKSA6IHVuZGVmaW5lZCB9IHNhdGlzZmllcyBJRWRpdG9yQ29tbWFuZHNDb250ZXh0KSxcblx0XHRcdFx0Z2V0S2V5QmluZGluZzogYWN0aW9uID0+IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQsIGVkaXRvclNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKSxcblx0XHRcdFx0b25IaWRlOiAoKSA9PiBjb250ZXh0TWVudURpc3Bvc2FibGVzLmRpc3Bvc2UoKSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGxheW91dCA9IChzaXplQ2hhbmdlZDogYm9vbGVhbikgPT4ge1xuXHRcdFx0Y29uc3QgeyB3aWR0aDogbW9kYWxXaWR0aCwgaGVpZ2h0OiBtb2RhbEhlaWdodCB9ID0gcmVzaXphYmxlRWxlbWVudC5zaXplO1xuXHRcdFx0Y29uc3QgeyB0b3A6IHRvcFB4LCBsZWZ0OiBsZWZ0UHggfSA9IHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZS5zdHlsZTtcblx0XHRcdGNvbnN0IHNpZGViYXJXaWR0aCA9IHNpZGViYXJSZXN1bHQ/LmdldFdpZHRoKCkgPz8gMDtcblx0XHRcdGNvbnN0IGhlYWRlckhlaWdodCA9IGhlYWRlckVsZW1lbnQub2Zmc2V0SGVpZ2h0O1xuXG5cdFx0XHRlZGl0b3JQYXJ0LmxheW91dChcblx0XHRcdFx0TWF0aC5tYXgoMCwgbW9kYWxXaWR0aCAtIE1PREFMX0JPUkRFUl9TSVpFIC0gc2lkZWJhcldpZHRoKSxcblx0XHRcdFx0bW9kYWxIZWlnaHQgLSBNT0RBTF9CT1JERVJfU0laRSAtIGhlYWRlckhlaWdodCxcblx0XHRcdFx0cGFyc2VGbG9hdCh0b3BQeCkgKyBNT0RBTF9CT1JERVJfV0lEVEggKyBoZWFkZXJIZWlnaHQsXG5cdFx0XHRcdHBhcnNlRmxvYXQobGVmdFB4KSArIE1PREFMX0JPUkRFUl9XSURUSCArIHNpZGViYXJXaWR0aCxcblx0XHRcdCk7XG5cblx0XHRcdGlmIChzaXplQ2hhbmdlZCkge1xuXHRcdFx0XHRzaWRlYmFyUmVzdWx0Py5sYXlvdXQobW9kYWxIZWlnaHQgLSBNT0RBTF9CT1JERVJfU0laRSAtIGhlYWRlckhlaWdodCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIEhhbmRsZSBkcmFnIG9uIGhlYWRlciB0byBtb3ZlIHRoZSBtb2RhbFxuXHRcdGNvbnN0IGRyYWdNb25pdG9yID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHbG9iYWxQb2ludGVyTW92ZU1vbml0b3IoKSk7XG5cdFx0Y29uc3QgZHJhZ0Rpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0bGV0IGRpZERyYWcgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGhlYWRlckVsZW1lbnQsIEV2ZW50VHlwZS5QT0lOVEVSX0RPV04sIGUgPT4ge1xuXHRcdFx0aWYgKGVkaXRvclBhcnQubWF4aW1pemVkKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gbm8gZHJhZyB3aGVuIG1heGltaXplZFxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5idXR0b24gIT09IDApIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBvbmx5IGxlZnQgYnV0dG9uXG5cdFx0XHR9XG5cblx0XHRcdC8vIElnbm9yZSBpZiB0YXJnZXQgaXMgYSBidXR0b24gb3IgYWN0aW9uXG5cdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldDtcblx0XHRcdGlmICghaXNIVE1MRWxlbWVudCh0YXJnZXQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRhcmdldC5jbG9zZXN0KCcubW9uYWNvLWJ1dHRvbicpIHx8IHRhcmdldC5jbG9zZXN0KCcuYWN0aW9uLWl0ZW0nKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFByZXZlbnQgdGV4dCBzZWxlY3Rpb24gZHVyaW5nIGRyYWdcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRkcmFnRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdFx0aGVhZGVyRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkcmFnZ2luZycpO1xuXHRcdFx0ZHJhZ0Rpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gaGVhZGVyRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnZ2luZycpKSk7XG5cblx0XHRcdGNvbnN0IHN0YXJ0WCA9IGUuY2xpZW50WDtcblx0XHRcdGNvbnN0IHN0YXJ0WSA9IGUuY2xpZW50WTtcblx0XHRcdGNvbnN0IHN0YXJ0TGVmdCA9IHBhcnNlRmxvYXQocmVzaXphYmxlRWxlbWVudC5kb21Ob2RlLnN0eWxlLmxlZnQpIHx8IDA7XG5cdFx0XHRjb25zdCBzdGFydFRvcCA9IHBhcnNlRmxvYXQocmVzaXphYmxlRWxlbWVudC5kb21Ob2RlLnN0eWxlLnRvcCkgfHwgMDtcblx0XHRcdGRpZERyYWcgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3Qgb25Qb2ludGVyTW92ZSA9IChtb3ZlRXZlbnQ6IFBvaW50ZXJFdmVudCkgPT4ge1xuXHRcdFx0XHRkaWREcmFnID0gdHJ1ZTtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChtb3ZlRXZlbnQsIHRydWUpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5lckRpbWVuc2lvbiA9IHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyRGltZW5zaW9uO1xuXHRcdFx0XHRjb25zdCB0aXRsZUJhck9mZnNldCA9IHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyT2Zmc2V0LnRvcDtcblx0XHRcdFx0Y29uc3QgZGlhbG9nV2lkdGggPSByZXNpemFibGVFbGVtZW50LnNpemUud2lkdGg7XG5cdFx0XHRcdGNvbnN0IGRpYWxvZ0hlaWdodCA9IHJlc2l6YWJsZUVsZW1lbnQuc2l6ZS5oZWlnaHQ7XG5cblx0XHRcdFx0Ly8gQ2xhbXAgdG8gd2luZG93IGJvdW5kc1xuXHRcdFx0XHRjb25zdCBtaW5MZWZ0ID0gMDtcblx0XHRcdFx0Y29uc3QgbWluVG9wID0gdGl0bGVCYXJPZmZzZXQ7XG5cdFx0XHRcdGNvbnN0IG1heExlZnQgPSBNYXRoLm1heChtaW5MZWZ0LCBjb250YWluZXJEaW1lbnNpb24ud2lkdGggLSBkaWFsb2dXaWR0aCk7XG5cdFx0XHRcdGNvbnN0IG1heFRvcCA9IE1hdGgubWF4KG1pblRvcCwgY29udGFpbmVyRGltZW5zaW9uLmhlaWdodCAtIGRpYWxvZ0hlaWdodCk7XG5cblx0XHRcdFx0bGV0IG5ld0xlZnQgPSBNYXRoLm1heChtaW5MZWZ0LCBNYXRoLm1pbihtYXhMZWZ0LCBzdGFydExlZnQgKyAobW92ZUV2ZW50LmNsaWVudFggLSBzdGFydFgpKSk7XG5cdFx0XHRcdGxldCBuZXdUb3AgPSBNYXRoLm1heChtaW5Ub3AsIE1hdGgubWluKG1heFRvcCwgc3RhcnRUb3AgKyAobW92ZUV2ZW50LmNsaWVudFkgLSBzdGFydFkpKSk7XG5cblx0XHRcdFx0Ly8gU25hcCB0byBjZW50ZXIgcG9zaXRpb24gd2hlbiBjbG9zZVxuXHRcdFx0XHRjb25zdCBjZW50ZXJMZWZ0ID0gKGNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAtIGRpYWxvZ1dpZHRoKSAvIDI7XG5cdFx0XHRcdGNvbnN0IGNlbnRlclRvcCA9IE1hdGgubWF4KHRpdGxlQmFyT2Zmc2V0LCAoY29udGFpbmVyRGltZW5zaW9uLmhlaWdodCAtIGRpYWxvZ0hlaWdodCkgLyAyKTtcblxuXHRcdFx0XHRpZiAoTWF0aC5hYnMobmV3TGVmdCAtIGNlbnRlckxlZnQpIDwgTU9EQUxfU05BUF9USFJFU0hPTEQgJiYgTWF0aC5hYnMobmV3VG9wIC0gY2VudGVyVG9wKSA8IE1PREFMX1NOQVBfVEhSRVNIT0xEKSB7XG5cdFx0XHRcdFx0bmV3TGVmdCA9IGNlbnRlckxlZnQ7XG5cdFx0XHRcdFx0bmV3VG9wID0gY2VudGVyVG9wO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVzaXphYmxlRWxlbWVudC5kb21Ob2RlLnN0eWxlLmxlZnQgPSBgJHtuZXdMZWZ0fXB4YDtcblx0XHRcdFx0cmVzaXphYmxlRWxlbWVudC5kb21Ob2RlLnN0eWxlLnRvcCA9IGAke25ld1RvcH1weGA7XG5cblx0XHRcdFx0Ly8gVXBkYXRlIGVkaXRvciBwYXJ0IHBvc2l0aW9uIGR1cmluZyBkcmFnXG5cdFx0XHRcdGxheW91dChmYWxzZSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBvblN0b3AgPSAoKSA9PiB7XG5cdFx0XHRcdGRyYWdEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHRcdGlmIChkaWREcmFnKSB7XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudExlZnQgPSBwYXJzZUZsb2F0KHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZS5zdHlsZS5sZWZ0KSB8fCAwO1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRUb3AgPSBwYXJzZUZsb2F0KHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZS5zdHlsZS50b3ApIHx8IDA7XG5cblx0XHRcdFx0XHQvLyBDaGVjayBpZiBzbmFwcGVkIHRvIGNlbnRlciBcdTIwMTQgaWYgc28sIGNsZWFyIGN1c3RvbSBwb3NpdGlvblxuXHRcdFx0XHRcdGNvbnN0IGNvbnRhaW5lckRpbWVuc2lvbiA9IHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyRGltZW5zaW9uO1xuXHRcdFx0XHRcdGNvbnN0IHRpdGxlQmFyT2Zmc2V0ID0gdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXJPZmZzZXQudG9wO1xuXHRcdFx0XHRcdGNvbnN0IGNlbnRlckxlZnQgPSAoY29udGFpbmVyRGltZW5zaW9uLndpZHRoIC0gcmVzaXphYmxlRWxlbWVudC5zaXplLndpZHRoKSAvIDI7XG5cdFx0XHRcdFx0Y29uc3QgY2VudGVyVG9wID0gTWF0aC5tYXgodGl0bGVCYXJPZmZzZXQsIChjb250YWluZXJEaW1lbnNpb24uaGVpZ2h0IC0gcmVzaXphYmxlRWxlbWVudC5zaXplLmhlaWdodCkgLyAyKTtcblxuXHRcdFx0XHRcdGlmIChNYXRoLmFicyhjdXJyZW50TGVmdCAtIGNlbnRlckxlZnQpIDwgMSAmJiBNYXRoLmFicyhjdXJyZW50VG9wIC0gY2VudGVyVG9wKSA8IDEpIHtcblx0XHRcdFx0XHRcdGVkaXRvclBhcnQucG9zaXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGVkaXRvclBhcnQucG9zaXRpb24gPSB7IGxlZnQ6IGN1cnJlbnRMZWZ0LCB0b3A6IGN1cnJlbnRUb3AgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGRyYWdNb25pdG9yLnN0YXJ0TW9uaXRvcmluZyhoZWFkZXJFbGVtZW50LCBlLnBvaW50ZXJJZCwgZS5idXR0b25zLCBvblBvaW50ZXJNb3ZlLCBvblN0b3ApO1xuXHRcdH0pKTtcblxuXHRcdC8vIEZvY3VzIGFjdGl2ZSBlZGl0b3Igd2hlbiBjbGlja2luZyBpbnRvIHRoZSB0aXRsZSBhcmVhIHdpdGggbm8gb3RoZXIgY2xpY2sgdGFyZ2V0XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihoZWFkZXJFbGVtZW50LCBFdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0Y29uc3Qgd2FzRHJhZyA9IGRpZERyYWc7XG5cdFx0XHRkaWREcmFnID0gZmFsc2U7XG5cdFx0XHRpZiAod2FzRHJhZykge1xuXHRcdFx0XHRyZXR1cm47IC8vIHNraXAgZm9jdXMgYWZ0ZXIgZHJhZ1xuXHRcdFx0fVxuXG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0XHRlZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGFuZGxlIHJlc2l6ZSBmcm9tIHNhc2hlc1xuXHRcdGxldCBpc1Jlc2l6aW5nID0gZmFsc2U7XG5cdFx0bGV0IHJlc2l6ZVN0YXJ0TGVmdCA9IDA7XG5cdFx0bGV0IHJlc2l6ZVN0YXJ0VG9wID0gMDtcblx0XHRsZXQgcmVzaXplU3RhcnRTaXplID0gRGltZW5zaW9uLk5vbmU7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVzaXphYmxlRWxlbWVudC5vbkRpZFdpbGxSZXNpemUoKCkgPT4ge1xuXHRcdFx0aXNSZXNpemluZyA9IHRydWU7XG5cdFx0XHRyZXNpemVTdGFydExlZnQgPSBwYXJzZUZsb2F0KHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZS5zdHlsZS5sZWZ0KSB8fCAwO1xuXHRcdFx0cmVzaXplU3RhcnRUb3AgPSBwYXJzZUZsb2F0KHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZS5zdHlsZS50b3ApIHx8IDA7XG5cdFx0XHRyZXNpemVTdGFydFNpemUgPSBuZXcgRGltZW5zaW9uKHJlc2l6YWJsZUVsZW1lbnQuc2l6ZS53aWR0aCwgcmVzaXphYmxlRWxlbWVudC5zaXplLmhlaWdodCk7XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlc2l6YWJsZUVsZW1lbnQub25EaWRSZXNpemUoZSA9PiB7XG5cblx0XHRcdC8vIENsYW1wIHBvc2l0aW9uIGFuZCBzaXplIHRvIHdpbmRvdyBib3VuZHMgZHVyaW5nIGFjdGl2ZSByZXNpemVcblx0XHRcdC8vIChza2lwIG9uIGBkb25lYCBcdTIwMTQgdmFsdWVzIGFyZSBhbHJlYWR5IGNvcnJlY3QgZnJvbSBwcmlvciBldmVudHMsXG5cdFx0XHQvLyAgYW5kIGRpcmVjdGlvbmFsIGZsYWdzIGFyZSBub3Qgc2V0IG9uIHRoZSBkb25lIGV2ZW50KVxuXHRcdFx0aWYgKCFlLmRvbmUpIHtcblx0XHRcdFx0Y29uc3QgY29udGFpbmVyRGltZW5zaW9uID0gdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXJEaW1lbnNpb247XG5cdFx0XHRcdGNvbnN0IHRpdGxlQmFyT2Zmc2V0ID0gdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXJPZmZzZXQudG9wO1xuXG5cdFx0XHRcdGNvbnN0IGRlbHRhV2lkdGggPSBlLmRpbWVuc2lvbi53aWR0aCAtIHJlc2l6ZVN0YXJ0U2l6ZS53aWR0aDtcblx0XHRcdFx0Y29uc3QgZGVsdGFIZWlnaHQgPSBlLmRpbWVuc2lvbi5oZWlnaHQgLSByZXNpemVTdGFydFNpemUuaGVpZ2h0O1xuXG5cdFx0XHRcdGxldCBuZXdMZWZ0ID0gZS53ZXN0ID8gcmVzaXplU3RhcnRMZWZ0IC0gZGVsdGFXaWR0aCA6IHJlc2l6ZVN0YXJ0TGVmdDtcblx0XHRcdFx0bGV0IG5ld1RvcCA9IGUubm9ydGggPyByZXNpemVTdGFydFRvcCAtIGRlbHRhSGVpZ2h0IDogcmVzaXplU3RhcnRUb3A7XG5cdFx0XHRcdGxldCBuZXdXaWR0aCA9IGUuZGltZW5zaW9uLndpZHRoO1xuXHRcdFx0XHRsZXQgbmV3SGVpZ2h0ID0gZS5kaW1lbnNpb24uaGVpZ2h0O1xuXG5cdFx0XHRcdGlmIChuZXdMZWZ0IDwgMCkge1xuXHRcdFx0XHRcdG5ld1dpZHRoICs9IG5ld0xlZnQ7XG5cdFx0XHRcdFx0bmV3TGVmdCA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5ld1RvcCA8IHRpdGxlQmFyT2Zmc2V0KSB7XG5cdFx0XHRcdFx0bmV3SGVpZ2h0ICs9IG5ld1RvcCAtIHRpdGxlQmFyT2Zmc2V0O1xuXHRcdFx0XHRcdG5ld1RvcCA9IHRpdGxlQmFyT2Zmc2V0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChuZXdMZWZ0ICsgbmV3V2lkdGggPiBjb250YWluZXJEaW1lbnNpb24ud2lkdGgpIHtcblx0XHRcdFx0XHRuZXdXaWR0aCA9IGNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAtIG5ld0xlZnQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5ld1RvcCArIG5ld0hlaWdodCA+IGNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQpIHtcblx0XHRcdFx0XHRuZXdIZWlnaHQgPSBjb250YWluZXJEaW1lbnNpb24uaGVpZ2h0IC0gbmV3VG9wO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQXBwbHkgY29ycmVjdGVkIHNpemUgaWYgaXQgd2FzIGNsYW1wZWRcblx0XHRcdFx0aWYgKG5ld1dpZHRoICE9PSBlLmRpbWVuc2lvbi53aWR0aCB8fCBuZXdIZWlnaHQgIT09IGUuZGltZW5zaW9uLmhlaWdodCkge1xuXHRcdFx0XHRcdHJlc2l6YWJsZUVsZW1lbnQubGF5b3V0KG5ld0hlaWdodCwgbmV3V2lkdGgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQWRqdXN0IHBvc2l0aW9uIHRvIGtlZXAgdGhlIG9wcG9zaXRlIGVkZ2UgZml4ZWRcblx0XHRcdFx0aWYgKGUud2VzdCkge1xuXHRcdFx0XHRcdHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZS5zdHlsZS5sZWZ0ID0gYCR7bmV3TGVmdH1weGA7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUubm9ydGgpIHtcblx0XHRcdFx0XHRyZXNpemFibGVFbGVtZW50LmRvbU5vZGUuc3R5bGUudG9wID0gYCR7bmV3VG9wfXB4YDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBVcGRhdGUgZWRpdG9yIHBhcnQgbGF5b3V0IGR1cmluZyByZXNpemVcblx0XHRcdGxheW91dCh0cnVlKTtcblxuXHRcdFx0aWYgKGUuZG9uZSkge1xuXHRcdFx0XHRpc1Jlc2l6aW5nID0gZmFsc2U7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYgc2l6ZSBtYXRjaGVzIHRoZSBkZWZhdWx0IChmcm9tIHNhc2ggZG91YmxlLWNsaWNrIHJlc2V0KVxuXHRcdFx0XHRjb25zdCBkZWZhdWx0U2l6ZSA9IGdldERlZmF1bHRTaXplKCk7XG5cdFx0XHRcdGNvbnN0IHNpemUgPSByZXNpemFibGVFbGVtZW50LnNpemU7XG5cdFx0XHRcdGlmIChzaXplLndpZHRoID09PSBkZWZhdWx0U2l6ZS53aWR0aCAmJiBzaXplLmhlaWdodCA9PT0gZGVmYXVsdFNpemUuaGVpZ2h0KSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFydC5zaXplID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGVkaXRvclBhcnQucG9zaXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0bGF5b3V0TW9kYWwoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlZGl0b3JQYXJ0LnNpemUgPSBuZXcgRGltZW5zaW9uKHNpemUud2lkdGgsIHNpemUuaGVpZ2h0KTtcblx0XHRcdFx0XHRlZGl0b3JQYXJ0LnBvc2l0aW9uID0ge1xuXHRcdFx0XHRcdFx0bGVmdDogcGFyc2VGbG9hdChyZXNpemFibGVFbGVtZW50LmRvbU5vZGUuc3R5bGUubGVmdCkgfHwgMCxcblx0XHRcdFx0XHRcdHRvcDogcGFyc2VGbG9hdChyZXNpemFibGVFbGVtZW50LmRvbU5vZGUuc3R5bGUudG9wKSB8fCAwLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBDb21wdXRlIGRlZmF1bHQgKG5vbi1jdXN0b20sIG5vbi1tYXhpbWl6ZWQpIG1vZGFsIHNpemVcblx0XHRjb25zdCBnZXREZWZhdWx0U2l6ZSA9ICgpOiBEaW1lbnNpb24gPT4ge1xuXHRcdFx0Y29uc3QgY29udGFpbmVyRGltZW5zaW9uID0gdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXJEaW1lbnNpb247XG5cdFx0XHRjb25zdCB0aXRsZUJhck9mZnNldCA9IHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyT2Zmc2V0LnRvcDtcblx0XHRcdGNvbnN0IGF2YWlsYWJsZUhlaWdodCA9IE1hdGgubWF4KGNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLSB0aXRsZUJhck9mZnNldCwgMCk7XG5cdFx0XHRjb25zdCB0YXJnZXRXaWR0aCA9IGNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAqIDAuODtcblx0XHRcdGNvbnN0IHRhcmdldEhlaWdodCA9IGF2YWlsYWJsZUhlaWdodCAqIDAuODtcblx0XHRcdGNvbnN0IHdpZHRoID0gTWF0aC5taW4odGFyZ2V0V2lkdGgsIE1PREFMX01BWF9ERUZBVUxUX1dJRFRILCBjb250YWluZXJEaW1lbnNpb24ud2lkdGgpO1xuXHRcdFx0Y29uc3QgaGVpZ2h0ID0gTWF0aC5taW4odGFyZ2V0SGVpZ2h0LCBNT0RBTF9NQVhfREVGQVVMVF9IRUlHSFQsIGF2YWlsYWJsZUhlaWdodCk7XG5cblx0XHRcdHJldHVybiBuZXcgRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpO1xuXHRcdH07XG5cblx0XHQvLyBMYXlvdXQgdGhlIG1vZGFsIGVkaXRvciBwYXJ0XG5cdFx0bGV0IGlzRmlyc3RMYXlvdXQgPSB0cnVlO1xuXHRcdGNvbnN0IGxheW91dE1vZGFsID0gKCkgPT4ge1xuXHRcdFx0aWYgKGlzUmVzaXppbmcpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBza2lwIGxheW91dCBkdXJpbmcgaW50ZXJhY3RpdmUgcmVzaXplXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbnRhaW5lckRpbWVuc2lvbiA9IHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyRGltZW5zaW9uO1xuXHRcdFx0Y29uc3QgdGl0bGVCYXJPZmZzZXQgPSB0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lck9mZnNldC50b3A7XG5cdFx0XHRjb25zdCBhdmFpbGFibGVIZWlnaHQgPSBNYXRoLm1heChjb250YWluZXJEaW1lbnNpb24uaGVpZ2h0IC0gdGl0bGVCYXJPZmZzZXQsIDApO1xuXG5cdFx0XHRjb25zdCBkZWZhdWx0U2l6ZSA9IGdldERlZmF1bHRTaXplKCk7XG5cblx0XHRcdGxldCB3aWR0aDogbnVtYmVyO1xuXHRcdFx0bGV0IGhlaWdodDogbnVtYmVyO1xuXG5cdFx0XHRpZiAoZWRpdG9yUGFydC5tYXhpbWl6ZWQpIHtcblx0XHRcdFx0Y29uc3QgdmVydGljYWxQYWRkaW5nID0gTWF0aC5tYXgodGl0bGVCYXJPZmZzZXQgLyoga2VlcCBhd2F5IGZyb20gdGl0bGUgYmFyIHRvIHByZXZlbnQgY2xpcHBpbmcgaXNzdWVzIHdpdGggV0NPICovLCBNT0RBTF9NQVhJTUlaRURfUEFERElORyk7XG5cdFx0XHRcdHdpZHRoID0gTWF0aC5tYXgoY29udGFpbmVyRGltZW5zaW9uLndpZHRoIC0gTU9EQUxfTUFYSU1JWkVEX1BBRERJTkcsIDApO1xuXHRcdFx0XHRoZWlnaHQgPSBNYXRoLm1heChhdmFpbGFibGVIZWlnaHQgLSB2ZXJ0aWNhbFBhZGRpbmcsIDApO1xuXHRcdFx0fSBlbHNlIGlmIChlZGl0b3JQYXJ0LnNpemUpIHtcblx0XHRcdFx0d2lkdGggPSBNYXRoLm1pbihlZGl0b3JQYXJ0LnNpemUud2lkdGgsIGNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCk7XG5cdFx0XHRcdGhlaWdodCA9IE1hdGgubWluKGVkaXRvclBhcnQuc2l6ZS5oZWlnaHQsIGF2YWlsYWJsZUhlaWdodCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3aWR0aCA9IGRlZmF1bHRTaXplLndpZHRoO1xuXHRcdFx0XHRoZWlnaHQgPSBkZWZhdWx0U2l6ZS5oZWlnaHQ7XG5cdFx0XHR9XG5cblx0XHRcdGhlaWdodCA9IE1hdGgubWluKGhlaWdodCwgYXZhaWxhYmxlSGVpZ2h0KTsgLy8gRW5zdXJlIHRoZSBtb2RhbCBuZXZlciBleGNlZWRzIGF2YWlsYWJsZSBoZWlnaHQgKGJlbG93IHRoZSB0aXRsZSBiYXIpXG5cblx0XHRcdC8vIE9uIGZpcnN0IGxheW91dCwgY2xhbXAgc2lkZWJhciB3aWR0aCBpZiBpdCB3b3VsZCBsZWF2ZSB0aGUgZWRpdG9yIHRvbyBuYXJyb3dcblx0XHRcdGlmIChpc0ZpcnN0TGF5b3V0KSB7XG5cdFx0XHRcdGlzRmlyc3RMYXlvdXQgPSBmYWxzZTtcblx0XHRcdFx0c2lkZWJhclJlc3VsdD8uY2xhbXBXaWR0aCh3aWR0aCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVwZGF0ZSByZXNpemFibGUgZWxlbWVudCBzaXplIGFuZCBjb25zdHJhaW50c1xuXHRcdFx0cmVzaXphYmxlRWxlbWVudC5tYXhTaXplID0gbmV3IERpbWVuc2lvbihjb250YWluZXJEaW1lbnNpb24ud2lkdGgsIGF2YWlsYWJsZUhlaWdodCk7XG5cdFx0XHRyZXNpemFibGVFbGVtZW50LnByZWZlcnJlZFNpemUgPSBkZWZhdWx0U2l6ZTtcblx0XHRcdHJlc2l6YWJsZUVsZW1lbnQubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXG5cdFx0XHQvLyBFbmFibGUvZGlzYWJsZSBzYXNoZXMgYmFzZWQgb24gbWF4aW1pemVkIHN0YXRlXG5cdFx0XHRjb25zdCBjYW5SZXNpemUgPSAhZWRpdG9yUGFydC5tYXhpbWl6ZWQ7XG5cdFx0XHRyZXNpemFibGVFbGVtZW50LmVuYWJsZVNhc2hlcyhjYW5SZXNpemUsIGNhblJlc2l6ZSwgY2FuUmVzaXplLCBjYW5SZXNpemUpO1xuXG5cdFx0XHQvLyBQb3NpdGlvbjogdXNlIGN1c3RvbSBwb3NpdGlvbiBpZiBhdmFpbGFibGUgKGNsYW1wZWQgdG8gYm91bmRzKSwgb3RoZXJ3aXNlIGNlbnRlclxuXHRcdFx0aWYgKCFlZGl0b3JQYXJ0Lm1heGltaXplZCAmJiBlZGl0b3JQYXJ0LnBvc2l0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGNsYW1wZWRMZWZ0ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oZWRpdG9yUGFydC5wb3NpdGlvbi5sZWZ0LCBjb250YWluZXJEaW1lbnNpb24ud2lkdGggLSB3aWR0aCkpO1xuXHRcdFx0XHRjb25zdCBjbGFtcGVkVG9wID0gTWF0aC5tYXgodGl0bGVCYXJPZmZzZXQsIE1hdGgubWluKGVkaXRvclBhcnQucG9zaXRpb24udG9wLCB0aXRsZUJhck9mZnNldCArIGF2YWlsYWJsZUhlaWdodCAtIGhlaWdodCkpO1xuXHRcdFx0XHRyZXNpemFibGVFbGVtZW50LmRvbU5vZGUuc3R5bGUubGVmdCA9IGAke2NsYW1wZWRMZWZ0fXB4YDtcblx0XHRcdFx0cmVzaXphYmxlRWxlbWVudC5kb21Ob2RlLnN0eWxlLnRvcCA9IGAke2NsYW1wZWRUb3B9cHhgO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbGVmdCA9IChjb250YWluZXJEaW1lbnNpb24ud2lkdGggLSB3aWR0aCkgLyAyO1xuXHRcdFx0XHRjb25zdCB0b3AgPSBNYXRoLm1heCh0aXRsZUJhck9mZnNldCwgKGNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLSBoZWlnaHQpIC8gMik7IC8vIGNlbnRlciBpbiBmdWxsIHdpbmRvdywgYnV0IGNsYW1wIHRvIHN0YXkgYmVsb3cgdGhlIHRpdGxlIGJhclxuXHRcdFx0XHRyZXNpemFibGVFbGVtZW50LmRvbU5vZGUuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xuXHRcdFx0XHRyZXNpemFibGVFbGVtZW50LmRvbU5vZGUuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHRcdH1cblxuXHRcdFx0bGF5b3V0KHRydWUpO1xuXHRcdH07XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLmxheW91dFNlcnZpY2Uub25EaWRMYXlvdXRNYWluQ29udGFpbmVyLCBsYXlvdXRNb2RhbCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JQYXJ0Lm9uRGlkQ2hhbmdlTWF4aW1pemVkKCgpID0+IGxheW91dE1vZGFsKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yUGFydC5vbkRpZFJlcXVlc3RMYXlvdXQoKCkgPT4gbGF5b3V0TW9kYWwoKSkpO1xuXG5cdFx0Ly8gUmVmbGVjdCBtb2RhbC1vcHRpb25zIGZyb20gdGhlIGFjdGl2ZSBlZGl0b3IgKGUuZy4gY29tcGFjdCBoZWFkZXIpXG5cdFx0Ly8gYXMgY2xhc3NlcyBvbiB0aGUgbW9kYWwgYmxvY2ssIGFuZCByZS1sYXlvdXQgc28gZGltZW5zaW9ucyBhY2NvdW50XG5cdFx0Ly8gZm9yIGFueSBoZWFkZXIgc2l6ZSBjaGFuZ2UuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShtb2RhbEVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UsICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGVkaXRvclBhcnQuYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yO1xuXHRcdFx0Y29uc3QgZWRpdG9yTW9kYWxPcHRpb25zID0gaXNNb2RhbEVkaXRvck9wdGlvbnNQcm92aWRlcihhY3RpdmVFZGl0b3IpID8gYWN0aXZlRWRpdG9yLmdldE1vZGFsRWRpdG9yT3B0aW9ucygpIDogdW5kZWZpbmVkO1xuXHRcdFx0bW9kYWxFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2NvbXBhY3QtaGVhZGVyJywgISFlZGl0b3JNb2RhbE9wdGlvbnM/LmNvbXBhY3RIZWFkZXIpO1xuXHRcdFx0bGF5b3V0TW9kYWwoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBEaW0gd2luZG93IGNvbnRyb2xzIHRvIG1hdGNoIHRoZSBtb2RhbCBvdmVybGF5XG5cdFx0dGhpcy5ob3N0U2VydmljZS5zZXRXaW5kb3dEaW1tZWQobWFpbldpbmRvdywgdHJ1ZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmhvc3RTZXJ2aWNlLnNldFdpbmRvd0RpbW1lZChtYWluV2luZG93LCBmYWxzZSkpKTtcblxuXHRcdC8vIEZvY3VzXG5cdFx0ZWRpdG9yUGFydC5hY3RpdmVHcm91cC5mb2N1cygpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHBhcnQ6IGVkaXRvclBhcnQsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRkaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNpZGViYXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgaGVhZGVyRWxlbWVudDogSFRNTEVsZW1lbnQsIGNvbnRlbnQ6IElNb2RhbEVkaXRvclNpZGViYXIgfCB1bmRlZmluZWQsIG1vZGFsQ29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IElNb2RhbEVkaXRvclNpZGViYXJDb250cm9sbGVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWNvbnRlbnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IHNpZGViYXJXaWR0aCA9IGNvbnRlbnQuc2lkZWJhcldpZHRoICYmIGNvbnRlbnQuc2lkZWJhcldpZHRoID4gMCA/IGNvbnRlbnQuc2lkZWJhcldpZHRoIDogTU9EQUxfU0lERUJBUl9ERUZBVUxUX1dJRFRIO1xuXHRcdGxldCBjdXN0b21XaWR0aCA9IGNvbnRlbnQuc2lkZWJhcldpZHRoICE9PSB1bmRlZmluZWQgJiYgY29udGVudC5zaWRlYmFyV2lkdGggPiAwO1xuXHRcdGxldCB2aXNpYmxlID0gIWNvbnRlbnQuc2lkZWJhckhpZGRlbjtcblxuXHRcdGNvbnN0IHNpZGViYXJDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdkaXYubW9kYWwtZWRpdG9yLXNpZGViYXIuc2hvdy1maWxlLWljb25zJykpO1xuXHRcdHNpZGViYXJDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHtzaWRlYmFyV2lkdGh9cHhgO1xuXHRcdHNldFZpc2liaWxpdHkodmlzaWJsZSwgc2lkZWJhckNvbnRhaW5lcik7XG5cblx0XHQvLyBDb250ZXh0IGtleSBzZXJ2aWNlIHNjb3BlZCB0byB0aGUgc2lkZWJhciBjb250YWluZXIsIGRlc2NlbmRpbmcgZnJvbSB0aGVcblx0XHQvLyBtb2RhbCBjb250ZXh0IGtleSBzZXJ2aWNlIHNvIHRoYXQgY29udGVudCByZW5kZXJlZCBoZXJlIChlLmcuIHRoZSBjaGFuZ2VzXG5cdFx0Ly8gdHJlZSkgaW5oZXJpdHMgdGhlIG1vZGFsLWxldmVsIGNvbnRleHQga2V5cy5cblx0XHRjb25zdCBzaWRlYmFyQ29udGV4dEtleVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobW9kYWxDb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoc2lkZWJhckNvbnRhaW5lcikpO1xuXG5cdFx0Ly8gTGV0IHRoZSBjYWxsZXIgcmVuZGVyIGNvbnRlbnRcblx0XHRjb25zdCBvbkRpZExheW91dEVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyByZWFkb25seSBoZWlnaHQ6IG51bWJlcjsgcmVhZG9ubHkgd2lkdGg6IG51bWJlciB9PigpKTtcblx0XHRjb25zdCBjb250ZW50RGlzcG9zYWJsZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0Y29udGVudERpc3Bvc2FibGUudmFsdWUgPSBjb250ZW50LnJlbmRlcihzaWRlYmFyQ29udGFpbmVyLCBvbkRpZExheW91dEVtaXR0ZXIuZXZlbnQsIHNpZGViYXJDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHQvLyBTYXNoIGZvciByZXNpemluZyBzaWRlYmFyLlxuXHRcdC8vIFByZWZlciB0aGUgbWVhc3VyZWQgaGVhZGVyIGhlaWdodCBzbyB0aGUgc2FzaCBhbGlnbnMgd2l0aCB0aGUgcmVhbCBjaHJvbWVcblx0XHQvLyAodGhlIGNvbXBhY3QtaGVhZGVyIHZhcmlhbnQgaXMgNDBweCwgdGhlIGRlZmF1bHQgaGVhZGVyIGlzIDMzcHgpLiBUaGVcblx0XHQvLyBjb25zdGFudCBvbmx5IGFwcGxpZXMgYmVmb3JlIHRoZSBoZWFkZXIgaGFzIGJlZW4gbGFpZCBvdXQuXG5cdFx0Y29uc3QgZ2V0SGVhZGVySGVpZ2h0ID0gKCkgPT4gKGhlYWRlckVsZW1lbnQub2Zmc2V0SGVpZ2h0IHx8IE1PREFMX0hFQURFUl9IRUlHSFQpO1xuXHRcdGNvbnN0IHNhc2ggPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNhc2goY29udGFpbmVyLCB7XG5cdFx0XHRnZXRWZXJ0aWNhbFNhc2hMZWZ0OiAoKSA9PiBzaWRlYmFyV2lkdGgsXG5cdFx0XHRnZXRWZXJ0aWNhbFNhc2hUb3A6ICgpID0+IGdldEhlYWRlckhlaWdodCgpLFxuXHRcdFx0Z2V0VmVydGljYWxTYXNoSGVpZ2h0OiAoKSA9PiAoY29udGFpbmVyLmNsaWVudEhlaWdodCAtIGdldEhlYWRlckhlaWdodCgpKSxcblx0XHR9LCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCB9KSk7XG5cdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHRzYXNoLnN0YXRlID0gU2FzaFN0YXRlLkRpc2FibGVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9uRGlkUmVzaXplRW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblxuXHRcdGxldCBzYXNoU3RhcnRXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzYXNoLm9uRGlkU3RhcnQoKCkgPT4gc2FzaFN0YXJ0V2lkdGggPSBzaWRlYmFyV2lkdGgpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2FzaC5vbkRpZEVuZCgoKSA9PiBzYXNoU3RhcnRXaWR0aCA9IHVuZGVmaW5lZCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzYXNoLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKHNhc2hTdGFydFdpZHRoID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWx0YSA9IGUuY3VycmVudFggLSBlLnN0YXJ0WDtcblx0XHRcdGNvbnN0IG1heFdpZHRoID0gTWF0aC5tYXgoTU9EQUxfU0lERUJBUl9NSU5fV0lEVEgsIGNvbnRhaW5lci5jbGllbnRXaWR0aCAtIE1PREFMX01JTl9XSURUSCk7XG5cdFx0XHRzaWRlYmFyV2lkdGggPSBNYXRoLm1pbihtYXhXaWR0aCwgTWF0aC5tYXgoTU9EQUxfU0lERUJBUl9NSU5fV0lEVEgsIHNhc2hTdGFydFdpZHRoICsgZGVsdGEpKTtcblx0XHRcdGN1c3RvbVdpZHRoID0gdHJ1ZTtcblx0XHRcdHNpZGViYXJDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHtzaWRlYmFyV2lkdGh9cHhgO1xuXHRcdFx0c2FzaC5sYXlvdXQoKTtcblx0XHRcdG9uRGlkUmVzaXplRW1pdHRlci5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzYXNoLm9uRGlkUmVzZXQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWF4V2lkdGggPSBNYXRoLm1heChNT0RBTF9TSURFQkFSX01JTl9XSURUSCwgY29udGFpbmVyLmNsaWVudFdpZHRoIC0gTU9EQUxfTUlOX1dJRFRIKTtcblx0XHRcdHNpZGViYXJXaWR0aCA9IE1hdGgubWluKG1heFdpZHRoLCBNT0RBTF9TSURFQkFSX0RFRkFVTFRfV0lEVEgpO1xuXHRcdFx0Y3VzdG9tV2lkdGggPSBmYWxzZTtcblx0XHRcdHNpZGViYXJDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHtzaWRlYmFyV2lkdGh9cHhgO1xuXHRcdFx0c2FzaC5sYXlvdXQoKTtcblx0XHRcdG9uRGlkUmVzaXplRW1pdHRlci5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uRGlkUmVzaXplOiBvbkRpZFJlc2l6ZUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRnZXRXaWR0aDogKCkgPT4gdmlzaWJsZSA/IHNpZGViYXJXaWR0aCA6IDAsXG5cdFx0XHRoYXNDdXN0b21XaWR0aDogKCkgPT4gY3VzdG9tV2lkdGgsXG5cdFx0XHRjbGFtcFdpZHRoOiAobW9kYWxXaWR0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdGlmIChzaWRlYmFyV2lkdGggKyBNT0RBTF9NSU5fV0lEVEggPiBtb2RhbFdpZHRoKSB7XG5cdFx0XHRcdFx0c2lkZWJhcldpZHRoID0gTWF0aC5taW4oTU9EQUxfU0lERUJBUl9ERUZBVUxUX1dJRFRILCBNYXRoLm1heChNT0RBTF9TSURFQkFSX01JTl9XSURUSCwgbW9kYWxXaWR0aCAtIE1PREFMX01JTl9XSURUSCkpO1xuXHRcdFx0XHRcdGN1c3RvbVdpZHRoID0gZmFsc2U7XG5cdFx0XHRcdFx0c2lkZWJhckNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3NpZGViYXJXaWR0aH1weGA7XG5cdFx0XHRcdFx0c2FzaC5sYXlvdXQoKTtcblx0XHRcdFx0XHRvbkRpZFJlc2l6ZUVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0aXNWaXNpYmxlOiAoKSA9PiB2aXNpYmxlLFxuXHRcdFx0c2V0VmlzaWJsZTogKHZhbHVlOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdHZpc2libGUgPSB2YWx1ZTtcblx0XHRcdFx0c2V0VmlzaWJpbGl0eSh2aXNpYmxlLCBzaWRlYmFyQ29udGFpbmVyKTtcblx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1zaWRlYmFyJywgdmlzaWJsZSk7XG5cdFx0XHRcdHNhc2guc3RhdGUgPSB2aXNpYmxlID8gU2FzaFN0YXRlLkVuYWJsZWQgOiBTYXNoU3RhdGUuRGlzYWJsZWQ7XG5cdFx0XHRcdG9uRGlkUmVzaXplRW1pdHRlci5maXJlKCk7XG5cdFx0XHR9LFxuXHRcdFx0bGF5b3V0OiAoaGVpZ2h0OiBudW1iZXIpID0+IHtcblx0XHRcdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdFx0XHRvbkRpZExheW91dEVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdFx0XHRoZWlnaHQ6IGhlaWdodCAtIE1PREFMX1NJREVCQVJfUEFERElORyAqIDIsXG5cdFx0XHRcdFx0XHR3aWR0aDogc2lkZWJhcldpZHRoIC0gTU9EQUxfU0lERUJBUl9QQURESU5HICogMiAtIE1PREFMX1NJREVCQVJfQk9SREVSX1JJR0hUXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2FzaC5sYXlvdXQoKTtcblx0XHRcdH0sXG5cdFx0XHR1cGRhdGVDb250ZW50OiAobmV3Q29udGVudDogSU1vZGFsRWRpdG9yU2lkZWJhcikgPT4ge1xuXHRcdFx0XHRjb250ZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0XHRzaWRlYmFyQ29udGFpbmVyLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRcdGNvbnRlbnREaXNwb3NhYmxlLnZhbHVlID0gbmV3Q29udGVudC5yZW5kZXIoc2lkZWJhckNvbnRhaW5lciwgb25EaWRMYXlvdXRFbWl0dGVyLmV2ZW50LCBzaWRlYmFyQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG59XG5cbmludGVyZmFjZSBJUG9zaXRpb24ge1xuXHRsZWZ0OiBudW1iZXI7XG5cdHRvcDogbnVtYmVyO1xufVxuXG5jbGFzcyBNb2RhbEVkaXRvclBhcnRJbXBsIGV4dGVuZHMgRWRpdG9yUGFydCBpbXBsZW1lbnRzIElNb2RhbEVkaXRvclBhcnQge1xuXG5cdHByaXZhdGUgc3RhdGljIENPVU5URVIgPSAxO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbENsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbENsb3NlID0gdGhpcy5fb25XaWxsQ2xvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNYXhpbWl6ZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNYXhpbWl6ZWQgPSB0aGlzLl9vbkRpZENoYW5nZU1heGltaXplZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RMYXlvdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0TGF5b3V0ID0gdGhpcy5fb25EaWRSZXF1ZXN0TGF5b3V0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTmF2aWdhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElNb2RhbEVkaXRvck5hdmlnYXRpb24gfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU5hdmlnYXRpb24gPSB0aGlzLl9vbkRpZENoYW5nZU5hdmlnYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSBfbWF4aW1pemVkOiBib29sZWFuO1xuXHRnZXQgbWF4aW1pemVkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fbWF4aW1pemVkOyB9XG5cblx0cHJpdmF0ZSBfc2l6ZTogSURpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblx0Z2V0IHNpemUoKTogSURpbWVuc2lvbiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9zaXplOyB9XG5cdHNldCBzaXplKHZhbHVlOiBJRGltZW5zaW9uIHwgdW5kZWZpbmVkKSB7IHRoaXMuX3NpemUgPSB2YWx1ZTsgfVxuXG5cdHByaXZhdGUgX3Bvc2l0aW9uOiBJUG9zaXRpb24gfCB1bmRlZmluZWQ7XG5cdGdldCBwb3NpdGlvbigpOiBJUG9zaXRpb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcG9zaXRpb247IH1cblx0c2V0IHBvc2l0aW9uKHZhbHVlOiBJUG9zaXRpb24gfCB1bmRlZmluZWQpIHsgdGhpcy5fcG9zaXRpb24gPSB2YWx1ZTsgfVxuXG5cdHByaXZhdGUgX3NpZGViYXJXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRnZXQgc2lkZWJhcldpZHRoKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9zaWRlYmFyV2lkdGg7IH1cblx0c2V0IHNpZGViYXJXaWR0aCh2YWx1ZTogbnVtYmVyIHwgdW5kZWZpbmVkKSB7IHRoaXMuX3NpZGViYXJXaWR0aCA9IHZhbHVlOyB9XG5cblx0cHJpdmF0ZSBfc2lkZWJhckhpZGRlbiA9IGZhbHNlO1xuXHRnZXQgc2lkZWJhckhpZGRlbigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3NpZGViYXJIaWRkZW47IH1cblx0c2V0IHNpZGViYXJIaWRkZW4odmFsdWU6IGJvb2xlYW4pIHsgdGhpcy5fc2lkZWJhckhpZGRlbiA9IHZhbHVlOyB9XG5cblx0cHJpdmF0ZSBfaGFzU2lkZWJhciA9IGZhbHNlO1xuXHRnZXQgaGFzU2lkZWJhcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2hhc1NpZGViYXI7IH1cblx0c2V0IGhhc1NpZGViYXIodmFsdWU6IGJvb2xlYW4pIHsgdGhpcy5faGFzU2lkZWJhciA9IHZhbHVlOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUb2dnbGVTaWRlYmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVG9nZ2xlU2lkZWJhciA9IHRoaXMuX29uRGlkVG9nZ2xlU2lkZWJhci5ldmVudDtcblxuXHRwcml2YXRlIHNhdmVkU2l6ZTogSURpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzYXZlZFBvc2l0aW9uOiBJUG9zaXRpb24gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfbmF2aWdhdGlvbjogSU1vZGFsRWRpdG9yTmF2aWdhdGlvbiB8IHVuZGVmaW5lZDtcblx0Z2V0IG5hdmlnYXRpb24oKTogSU1vZGFsRWRpdG9yTmF2aWdhdGlvbiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9uYXZpZ2F0aW9uOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIHByZXZpb3VzTWFpbldpbmRvd0FjdGl2ZUVsZW1lbnQ6IEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR3aW5kb3dJZDogbnVtYmVyLFxuXHRcdGVkaXRvclBhcnRzVmlldzogSUVkaXRvclBhcnRzVmlldyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbW9kYWxFbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRvcHRpb25zOiBJTW9kYWxFZGl0b3JQYXJ0T3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kYWxDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBpZCA9IE1vZGFsRWRpdG9yUGFydEltcGwuQ09VTlRFUisrO1xuXHRcdHN1cGVyKGVkaXRvclBhcnRzVmlldywgYHdvcmtiZW5jaC5wYXJ0cy5tb2RhbEVkaXRvci4ke2lkfWAsIGxvY2FsaXplKCdtb2RhbEVkaXRvclBhcnQnLCBcIk1vZGFsIEVkaXRvciBBcmVhXCIpLCB3aW5kb3dJZCwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlLCBob3N0U2VydmljZSwgbW9kYWxDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9tYXhpbWl6ZWQgPSBvcHRpb25zPy5tYXhpbWl6ZWQgPz8gZmFsc2U7XG5cdFx0dGhpcy5fc2l6ZSA9IG9wdGlvbnM/LnNpemU7XG5cdFx0dGhpcy5fcG9zaXRpb24gPSBvcHRpb25zPy5wb3NpdGlvbjtcblx0XHR0aGlzLl9uYXZpZ2F0aW9uID0gb3B0aW9ucz8ubmF2aWdhdGlvbjtcblx0XHR0aGlzLl9oYXNTaWRlYmFyID0gISFvcHRpb25zPy5zaWRlYmFyO1xuXHRcdHRoaXMuX3NpZGViYXJIaWRkZW4gPSBvcHRpb25zPy5zaWRlYmFyPy5zaWRlYmFySGlkZGVuID8/IGZhbHNlO1xuXHRcdHRoaXMuX3NpZGViYXJXaWR0aCA9IG9wdGlvbnM/LnNpZGViYXI/LnNpZGViYXJXaWR0aDtcblxuXHRcdC8vIFdoZW4gcmVzdG9yaW5nIGEgbWF4aW1pemVkIHN0YXRlIHdpdGggY3VzdG9tIGxheW91dCxcblx0XHQvLyBpbml0aWFsaXplIHNhdmVkIHN0YXRlIHNvIHVuLW1heGltaXplIGNhbiByZXN0b3JlIGl0XG5cdFx0aWYgKHRoaXMuX21heGltaXplZCkge1xuXHRcdFx0dGhpcy5zYXZlZFNpemUgPSB0aGlzLl9zaXplO1xuXHRcdFx0dGhpcy5zYXZlZFBvc2l0aW9uID0gdGhpcy5fcG9zaXRpb247XG5cdFx0fVxuXG5cdFx0dGhpcy5lbmZvcmNlTW9kYWxQYXJ0T3B0aW9ucygpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihVU0VfTU9EQUxfRURJVE9SX1NFVFRJTkcpKSB7XG5cdFx0XHRcdHRoaXMuZW5mb3JjZU1vZGFsUGFydE9wdGlvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBjcmVhdGUocGFyZW50OiBIVE1MRWxlbWVudCwgb3B0aW9ucz86IG9iamVjdCk6IHZvaWQge1xuXHRcdHRoaXMucHJldmlvdXNNYWluV2luZG93QWN0aXZlRWxlbWVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcblxuXHRcdHN1cGVyLmNyZWF0ZShwYXJlbnQsIG9wdGlvbnMpO1xuXHR9XG5cblx0ZW5mb3JjZU1vZGFsUGFydE9wdGlvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgdXNlTW9kYWxGb3JBbGwgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFVzZU1vZGFsRWRpdG9yTW9kZT4oVVNFX01PREFMX0VESVRPUl9TRVRUSU5HKSA9PT0gJ2FsbCc7XG5cdFx0Y29uc3QgZWRpdG9yQ291bnQgPSB0aGlzLmdyb3Vwcy5yZWR1Y2UoKGNvdW50LCBncm91cCkgPT4gY291bnQgKyBncm91cC5jb3VudCwgMCk7XG5cdFx0Y29uc3Qgc2hvd1RhYnMgPSB1c2VNb2RhbEZvckFsbCAmJiBlZGl0b3JDb3VudCA+IDEgPyAnbXVsdGlwbGUnIDogJ25vbmUnO1xuXG5cdFx0dGhpcy5vcHRpb25zRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMuZW5mb3JjZVBhcnRPcHRpb25zKHtcblx0XHRcdHNob3dUYWJzLFxuXHRcdFx0ZW5hYmxlUHJldmlldzogdHJ1ZSxcblx0XHRcdGNsb3NlRW1wdHlHcm91cHM6IHRydWUsXG5cdFx0XHR0YWJBY3Rpb25DbG9zZVZpc2liaWxpdHk6IHNob3dUYWJzICE9PSAnbm9uZScsXG5cdFx0XHRlZGl0b3JBY3Rpb25zTG9jYXRpb246ICdoaWRkZW4nLFxuXHRcdFx0dGFiSGVpZ2h0OiAnZGVmYXVsdCcsXG5cdFx0XHR3cmFwVGFiczogZmFsc2UsXG5cdFx0XHRhbGxvd0Ryb3BJbnRvR3JvdXA6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnM/OiBJTW9kYWxFZGl0b3JQYXJ0T3B0aW9ucyk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucz8ubWF4aW1pemVkID09PSAnYm9vbGVhbicgJiYgb3B0aW9ucy5tYXhpbWl6ZWQgIT09IHRoaXMuX21heGltaXplZCkge1xuXHRcdFx0dGhpcy50b2dnbGVNYXhpbWl6ZWQoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9uYXZpZ2F0aW9uID0gb3B0aW9ucz8ubmF2aWdhdGlvbjtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTmF2aWdhdGlvbi5maXJlKG9wdGlvbnM/Lm5hdmlnYXRpb24pO1xuXHR9XG5cblx0dG9nZ2xlTWF4aW1pemVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX21heGltaXplZCA9ICF0aGlzLl9tYXhpbWl6ZWQ7XG5cblx0XHRpZiAodGhpcy5fbWF4aW1pemVkKSB7XG5cdFx0XHR0aGlzLnNhdmVkU2l6ZSA9IHRoaXMuX3NpemU7XG5cdFx0XHR0aGlzLnNhdmVkUG9zaXRpb24gPSB0aGlzLl9wb3NpdGlvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2l6ZSA9IHRoaXMuc2F2ZWRTaXplO1xuXHRcdFx0dGhpcy5fcG9zaXRpb24gPSB0aGlzLnNhdmVkUG9zaXRpb247XG5cdFx0XHR0aGlzLnNhdmVkU2l6ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuc2F2ZWRQb3NpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZU1heGltaXplZC5maXJlKHRoaXMuX21heGltaXplZCk7XG5cdH1cblxuXHR0b2dnbGVTaWRlYmFyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NpZGViYXJIaWRkZW4gPSAhdGhpcy5fc2lkZWJhckhpZGRlbjtcblxuXHRcdHRoaXMuX29uRGlkVG9nZ2xlU2lkZWJhci5maXJlKCk7XG5cdH1cblxuXHRoYW5kbGVIZWFkZXJEb3VibGVDbGljaygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbWF4aW1pemVkKSB7XG5cdFx0XHQvLyBDbGVhciBzYXZlZCBzdGF0ZSBzbyB0aGF0IHRvZ2dsZU1heGltaXplZCByZXN0b3JlcyB0byBkZWZhdWx0XG5cdFx0XHR0aGlzLnNhdmVkU2l6ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuc2F2ZWRQb3NpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMudG9nZ2xlTWF4aW1pemVkKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9zaXplKSB7XG5cdFx0XHR0aGlzLl9zaXplID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fcG9zaXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RMYXlvdXQuZmlyZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRvZ2dsZU1heGltaXplZCgpOyAvLyBtYXhpbWl6ZVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBoYW5kbGVDb250ZXh0S2V5cygpOiB2b2lkIHtcblxuXHRcdC8vIEJpbmQgdGhlIG1vZGFsLWxldmVsIGNvbnRleHQga2V5cyB0byB0aGUgbW9kYWwgY29udGV4dCBrZXkgc2VydmljZSB3aGljaFxuXHRcdC8vIGlzIHNjb3BlZCB0byB0aGUgZW50aXJlIG1vZGFsIGVsZW1lbnQgKG5vdCBqdXN0IHRoZSBlZGl0b3IgcGFydFxuXHRcdC8vIGNvbnRhaW5lcikuIFRoaXMga2VlcHMgdGhlbSBhY3RpdmUgd2hlbiBmb2N1cyBpcyBhbnl3aGVyZSBpbnNpZGUgdGhlXG5cdFx0Ly8gbW9kYWwsIGluY2x1ZGluZyB0aGUgc2lkZWJhciAoZS5nLiB0aGUgY2hhbmdlcyB0cmVlKS4gT3RoZXJ3aXNlIGNvbW1hbmRzXG5cdFx0Ly8gbGlrZSBjbG9zaW5nIHRoZSBtb2RhbCBvbiBgRXNjYXBlYCB3b3VsZCBub3QgZmlyZSB3aGlsZSB0aGUgc2lkZWJhciBoYXNcblx0XHQvLyBmb2N1cy5cblx0XHRjb25zdCBpc01vZGFsRWRpdG9yUGFydENvbnRleHQgPSBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LmJpbmRUbyh0aGlzLm1vZGFsQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlzTW9kYWxFZGl0b3JQYXJ0Q29udGV4dC5zZXQodHJ1ZSk7XG5cblx0XHRjb25zdCBpc01heGltaXplZENvbnRleHQgPSBFZGl0b3JQYXJ0TW9kYWxNYXhpbWl6ZWRDb250ZXh0LmJpbmRUbyh0aGlzLm1vZGFsQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlzTWF4aW1pemVkQ29udGV4dC5zZXQodGhpcy5fbWF4aW1pemVkKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlTWF4aW1pemVkKG1heGltaXplZCA9PiBpc01heGltaXplZENvbnRleHQuc2V0KG1heGltaXplZCkpKTtcblxuXHRcdGNvbnN0IGhhc05hdmlnYXRpb25Db250ZXh0ID0gRWRpdG9yUGFydE1vZGFsTmF2aWdhdGlvbkNvbnRleHQuYmluZFRvKHRoaXMubW9kYWxDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aGFzTmF2aWdhdGlvbkNvbnRleHQuc2V0KCEhdGhpcy5fbmF2aWdhdGlvbiAmJiB0aGlzLl9uYXZpZ2F0aW9uLnRvdGFsID4gMSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZU5hdmlnYXRpb24obmF2aWdhdGlvbiA9PiBoYXNOYXZpZ2F0aW9uQ29udGV4dC5zZXQoISFuYXZpZ2F0aW9uICYmIG5hdmlnYXRpb24udG90YWwgPiAxKSkpO1xuXG5cdFx0Y29uc3Qgc2lkZWJhckNvbnRleHQgPSBFZGl0b3JQYXJ0TW9kYWxTaWRlYmFyQ29udGV4dC5iaW5kVG8odGhpcy5tb2RhbENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRzaWRlYmFyQ29udGV4dC5zZXQodGhpcy5faGFzU2lkZWJhcik7XG5cblx0XHRjb25zdCBzaWRlYmFyVmlzaWJsZUNvbnRleHQgPSBFZGl0b3JQYXJ0TW9kYWxTaWRlYmFyVmlzaWJsZUNvbnRleHQuYmluZFRvKHRoaXMubW9kYWxDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0c2lkZWJhclZpc2libGVDb250ZXh0LnNldCh0aGlzLl9oYXNTaWRlYmFyICYmICF0aGlzLl9zaWRlYmFySGlkZGVuKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkVG9nZ2xlU2lkZWJhcigoKSA9PiBzaWRlYmFyVmlzaWJsZUNvbnRleHQuc2V0KHRoaXMuX2hhc1NpZGViYXIgJiYgIXRoaXMuX3NpZGViYXJIaWRkZW4pKSk7XG5cblx0XHRzdXBlci5oYW5kbGVDb250ZXh0S2V5cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVtb3ZlR3JvdXAoZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cFZpZXcsIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogdm9pZCB7XG5cblx0XHQvLyBDbG9zZSBtb2RhbCB3aGVuIGxhc3QgZ3JvdXAgcmVtb3ZlZFxuXHRcdGNvbnN0IGdyb3VwVmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KGdyb3VwKTtcblx0XHRpZiAodGhpcy5jb3VudCA9PT0gMSAmJiB0aGlzLmFjdGl2ZUdyb3VwID09PSBncm91cFZpZXcpIHtcblx0XHRcdHRoaXMuZG9SZW1vdmVMYXN0R3JvdXAoKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgZGVsZWdhdGUgdG8gcGFyZW50IGltcGxlbWVudGF0aW9uXG5cdFx0ZWxzZSB7XG5cdFx0XHRzdXBlci5yZW1vdmVHcm91cChncm91cCwgcHJlc2VydmVGb2N1cyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1JlbW92ZUxhc3RHcm91cCgpOiB2b2lkIHtcblxuXHRcdC8vIEFjdGl2YXRlIG1haW4gZWRpdG9yIGdyb3VwIHdoZW4gY2xvc2luZ1xuXHRcdGNvbnN0IGFjdGl2ZU1haW5Hcm91cCA9IHRoaXMuZWRpdG9yUGFydHNWaWV3Lm1haW5QYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdHRoaXMuZWRpdG9yUGFydHNWaWV3Lm1haW5QYXJ0LmFjdGl2YXRlR3JvdXAoYWN0aXZlTWFpbkdyb3VwLCB1bmRlZmluZWQsIEdyb3VwQWN0aXZhdGlvblJlYXNvbi5QQVJUX0NMT1NFKTtcblxuXHRcdC8vIERlYWwgd2l0aCBmb2N1czogcmVtb3ZpbmcgdGhlIGxhc3QgbW9kYWwgZ3JvdXBcblx0XHQvLyBtZWFucyB3ZSByZXR1cm4gYmFjayB0byB0aGUgbWFpbiBlZGl0b3IgcGFydC5cblx0XHQvLyBCdXQgd2Ugb25seSB3YW50IHRvIGZvY3VzIHRoYXQgaWYgaXQgd2FzIGZvY3VzZWRcblx0XHQvLyBiZWZvcmUgdG8gcHJldmVudCByZXZlYWxpbmcgdGhlIGVkaXRvciBwYXJ0IGlmXG5cdFx0Ly8gaXQgd2FzIG1heWJlIGhpZGRlbiBiZWZvcmUuXG5cdFx0Y29uc3QgbWFpbkVkaXRvclBhcnRDb250YWluZXIgPSB0aGlzLmxheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKG1haW5XaW5kb3csIFBhcnRzLkVESVRPUl9QQVJUKTtcblx0XHRpZiAoXG5cdFx0XHQhaXNIVE1MRWxlbWVudCh0aGlzLnByZXZpb3VzTWFpbldpbmRvd0FjdGl2ZUVsZW1lbnQpIHx8XHRcdFx0XHRcdC8vIGludmFsaWQgcHJldmlvdXMgZWxlbWVudFxuXHRcdFx0IXRoaXMucHJldmlvdXNNYWluV2luZG93QWN0aXZlRWxlbWVudC5pc0Nvbm5lY3RlZCB8fFx0XHRcdFx0XHQvLyBwcmV2aW91cyBlbGVtZW50IG5vIGxvbmdlciBpbiB0aGUgRE9NXG5cdFx0XHRtYWluRWRpdG9yUGFydENvbnRhaW5lcj8uY29udGFpbnModGhpcy5wcmV2aW91c01haW5XaW5kb3dBY3RpdmVFbGVtZW50KVx0Ly8gcHJldmlvdXMgZWxlbWVudCBpcyBpbnNpZGUgbWFpbiBlZGl0b3IgcGFydFxuXHRcdCkge1xuXHRcdFx0YWN0aXZlTWFpbkdyb3VwLmZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucHJldmlvdXNNYWluV2luZG93QWN0aXZlRWxlbWVudC5mb2N1cygpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uV2lsbENsb3NlLmZpcmUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0cmV0dXJuOyAvLyBkaXNhYmxlZCwgbW9kYWwgZWRpdG9yIHBhcnQgc3RhdGUgaXMgbm90IHBlcnNpc3RlZFxuXHR9XG5cblx0YXN5bmMgY2xvc2Uob3B0aW9ucz86IHsgbWVyZ2VBbGxFZGl0b3JzVG9NYWluUGFydD86IGJvb2xlYW4gfSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Ly8gTWVyZ2UgYWxsIGVkaXRvcnMgdG8gbWFpbiBwYXJ0IChlZGl0b3JzIHN0YXkgb3Blbiwgbm8gY29uZmlybWF0aW9uIG5lZWRlZClcblx0XHRpZiAob3B0aW9ucz8ubWVyZ2VBbGxFZGl0b3JzVG9NYWluUGFydCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5tZXJnZUdyb3Vwc1RvTWFpblBhcnQoKTtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDbG9zZSBhbGwgZWRpdG9ycyBpbiBlYWNoIGdyb3VwLCBsZXZlcmFnaW5nIHRoZSBleGlzdGluZ1xuXHRcdC8vIGNvbmZpcm1hdGlvbiBpbmZyYXN0cnVjdHVyZSBmb3IgZGlydHkgZWRpdG9yc1xuXHRcdGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmdyb3Vwcykge1xuXHRcdFx0XHRjb25zdCBjbG9zZWQgPSBhd2FpdCBncm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblx0XHRcdFx0aWYgKCFjbG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHVzZXIgY2FuY2VsbGVkXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9vbldpbGxDbG9zZS5maXJlKCk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgbWVyZ2VHcm91cHNUb01haW5QYXJ0KCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5ncm91cHMuc29tZShncm91cCA9PiBncm91cC5jb3VudCA+IDApKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gc2tpcCBpZiB3ZSBoYXZlIG5vIGVkaXRvcnMgb3BlbmVkXG5cdFx0fVxuXG5cdFx0Ly8gRmluZCB0aGUgbW9zdCByZWNlbnQgZ3JvdXAgdGhhdCBpcyBub3QgbG9ja2VkXG5cdFx0bGV0IHRhcmdldEdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5lZGl0b3JQYXJ0c1ZpZXcubWFpblBhcnQuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKSkge1xuXHRcdFx0aWYgKCFncm91cC5pc0xvY2tlZCkge1xuXHRcdFx0XHR0YXJnZXRHcm91cCA9IGdyb3VwO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRhcmdldEdyb3VwKSB7XG5cdFx0XHR0YXJnZXRHcm91cCA9IHRoaXMuZWRpdG9yUGFydHNWaWV3Lm1haW5QYXJ0LmFkZEdyb3VwKHRoaXMuZWRpdG9yUGFydHNWaWV3Lm1haW5QYXJ0LmFjdGl2ZUdyb3VwLCB0aGlzLnBhcnRPcHRpb25zLm9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uID09PSAncmlnaHQnID8gR3JvdXBEaXJlY3Rpb24uUklHSFQgOiBHcm91cERpcmVjdGlvbi5ET1dOKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLm1lcmdlQWxsR3JvdXBzKHRhcmdldEdyb3VwLCB7XG5cdFx0XHQvLyBUcnkgdG8gcmVkdWNlIHRoZSBpbXBhY3Qgb2YgY2xvc2luZyB0aGUgbW9kYWxcblx0XHRcdC8vIGFzIG11Y2ggYXMgcG9zc2libGUgYnkgbm90IGNoYW5naW5nIGV4aXN0aW5nIGVkaXRvcnNcblx0XHRcdC8vIGluIHRoZSBtYWluIHdpbmRvdy5cblx0XHRcdHByZXNlcnZlRXhpc3RpbmdJbmRleDogdHJ1ZVxuXHRcdH0pO1xuXHRcdHRhcmdldEdyb3VwLmZvY3VzKCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9uYXZpZ2F0aW9uID0gdW5kZWZpbmVkOyAvLyBlbnN1cmUgdG8gZnJlZSB0aGUgcmVmZXJlbmNlIHRvIHRoZSBuYXZpZ2F0aW9uIGNsb3N1cmVcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxHQUFHLHVCQUF1QixRQUFRLFdBQVcsYUFBYSxXQUFXLE1BQWtCLGVBQWUsZUFBZSxZQUFZO0FBQzFJLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsV0FBVyxzQkFBc0I7QUFDMUMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsUUFBUSxpQkFBaUI7QUFDbEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxhQUFhLE1B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
