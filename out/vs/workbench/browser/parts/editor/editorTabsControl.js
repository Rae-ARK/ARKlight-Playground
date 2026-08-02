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
import "./media/editortabscontrol.css";
import { localize } from "../../../../nls.js";
import { DataTransfers } from "../../../../base/browser/dnd.js";
import { $, getActiveWindow, getWindow, isMouseEvent, setVisibility } from "../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { ActionsOrientation, prepareActions } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ActionRunner } from "../../../../base/common/actions.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { DraggedEditorGroupIdentifier, fillEditorsDragData, isWindowDraggedOver } from "../../dnd.js";
import { EditorPane } from "./editorPane.js";
import { EditorResourceAccessor, SideBySideEditor, EditorsOrder, EditorInputCapabilities, Verbosity } from "../../../common/editor.js";
import { ResourceContextKey, ActiveEditorPinnedContext, ActiveEditorStickyContext, ActiveEditorDirtyContext, ActiveEditorGroupLockedContext, ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext, ActiveEditorFirstInGroupContext, ActiveEditorAvailableEditorIdsContext, applyAvailableEditorIds, ActiveEditorLastInGroupContext } from "../../../common/contextkeys.js";
import { AnchorAlignment } from "../../../../base/browser/ui/contextview/contextview.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { isFirefox } from "../../../../base/browser/browser.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { WorkbenchToolBar, HiddenItemStrategy } from "../../../../platform/actions/browser/toolbar.js";
import { LocalSelectionTransfer } from "../../../../platform/dnd/browser/dnd.js";
import { IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { EDITOR_CORE_NAVIGATION_COMMANDS } from "./editorCommands.js";
import { MergeGroupMode } from "../../../services/editor/common/editorGroupsService.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { applyDragImage } from "../../../../base/browser/ui/dnd/dnd.js";
class EditorCommandsContextActionRunner extends ActionRunner {
  constructor(context) {
    super();
    this.context = context;
  }
  run(action, context) {
    let mergedContext = this.context;
    if (context?.preserveFocus) {
      mergedContext = {
        ...this.context,
        preserveFocus: true
      };
    }
    return super.run(action, mergedContext);
  }
}
let EditorTabsControl = class extends Themable {
  constructor(parent, editorPartsView, groupsView, groupView, tabsModel, menuIds, contextMenuService, instantiationService, contextKeyService, keybindingService, notificationService, quickInputService, themeService, editorResolverService, hostService, menuService) {
    super(themeService);
    this.parent = parent;
    this.editorPartsView = editorPartsView;
    this.groupsView = groupsView;
    this.groupView = groupView;
    this.tabsModel = tabsModel;
    this.menuIds = menuIds;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.keybindingService = keybindingService;
    this.notificationService = notificationService;
    this.quickInputService = quickInputService;
    this.editorResolverService = editorResolverService;
    this.hostService = hostService;
    this.menuService = menuService;
    this.editorTransfer = LocalSelectionTransfer.getInstance();
    this.groupTransfer = LocalSelectionTransfer.getInstance();
    this.treeItemsTransfer = LocalSelectionTransfer.getInstance();
    this.editorActionsToolbarDisposables = this._register(new DisposableStore());
    this.editorActionsDisposables = this._register(new DisposableStore());
    /** Whether the editor-actions toolbar currently has any actions (drives the layout-actions separator). */
    this.editorActionsToolbarHasActions = false;
    this.editorLayoutActionsToolbarDisposables = this._register(new DisposableStore());
    this.editorLayoutActionsDisposables = this._register(new DisposableStore());
    this.renderDropdownAsChildElement = false;
    const container = this.create(parent);
    this.contextMenuContextKeyService = this._register(this.contextKeyService.createScoped(container));
    const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, this.contextMenuContextKeyService]
    )));
    this.resourceContext = this._register(scopedInstantiationService.createInstance(ResourceContextKey));
    this.editorPinnedContext = ActiveEditorPinnedContext.bindTo(this.contextMenuContextKeyService);
    this.editorIsFirstContext = ActiveEditorFirstInGroupContext.bindTo(this.contextMenuContextKeyService);
    this.editorIsLastContext = ActiveEditorLastInGroupContext.bindTo(this.contextMenuContextKeyService);
    this.editorStickyContext = ActiveEditorStickyContext.bindTo(this.contextMenuContextKeyService);
    this.editorDirtyContext = ActiveEditorDirtyContext.bindTo(this.contextMenuContextKeyService);
    this.editorAvailableEditorIds = ActiveEditorAvailableEditorIdsContext.bindTo(this.contextMenuContextKeyService);
    this.editorCanSplitInGroupContext = ActiveEditorCanSplitInGroupContext.bindTo(this.contextMenuContextKeyService);
    this.sideBySideEditorContext = SideBySideEditorActiveContext.bindTo(this.contextMenuContextKeyService);
    this.groupLockedContext = ActiveEditorGroupLockedContext.bindTo(this.contextMenuContextKeyService);
  }
  create(parent) {
    this.updateTabHeight();
    return parent;
  }
  get editorActionsEnabled() {
    return this.groupsView.partOptions.editorActionsLocation === "default" && this.groupsView.partOptions.showTabs !== "none";
  }
  createEditorActionsToolBar(parent, classes) {
    this.editorActionsToolbarContainer = $("div");
    this.editorActionsToolbarContainer.classList.add(...classes);
    parent.appendChild(this.editorActionsToolbarContainer);
    this.handleEditorActionToolBarVisibility(this.editorActionsToolbarContainer);
    this.editorLayoutActionsSeparator = $("div.editor-actions-separator");
    parent.appendChild(this.editorLayoutActionsSeparator);
    this.editorLayoutActionsToolbarContainer = $("div.editor-layout-actions");
    parent.appendChild(this.editorLayoutActionsToolbarContainer);
    this.handleEditorLayoutActionsToolBarVisibility(this.editorLayoutActionsToolbarContainer);
  }
  handleEditorActionToolBarVisibility(container) {
    const editorActionsEnabled = this.editorActionsEnabled;
    const editorActionsVisible = !!this.editorActionsToolbar;
    if (editorActionsEnabled && !editorActionsVisible) {
      this.doCreateEditorActionsToolBar(container);
    } else if (!editorActionsEnabled && editorActionsVisible) {
      this.editorActionsToolbar?.getElement().remove();
      this.editorActionsToolbar = void 0;
      this.editorActionsToolbarDisposables.clear();
      this.editorActionsDisposables.clear();
    }
    container.classList.toggle("hidden", !editorActionsEnabled);
  }
  handleEditorLayoutActionsToolBarVisibility(container) {
    const editorActionsEnabled = this.editorActionsEnabled;
    const editorActionsVisible = !!this.editorLayoutActionsToolbar;
    if (editorActionsEnabled && !editorActionsVisible) {
      this.doCreateEditorLayoutActionsToolBar(container);
    } else if (!editorActionsEnabled && editorActionsVisible) {
      this.editorLayoutActionsToolbar?.getElement().remove();
      this.editorLayoutActionsToolbar = void 0;
      this.editorLayoutActionsToolbarDisposables.clear();
      this.editorLayoutActionsDisposables.clear();
    }
    container.classList.toggle("hidden", !editorActionsEnabled);
    if (this.editorLayoutActionsSeparator && !editorActionsEnabled) {
      setVisibility(false, this.editorLayoutActionsSeparator);
    }
  }
  doCreateEditorActionsToolBar(container) {
    const context = { groupId: this.groupView.id };
    const editorActionsMenuId = this.menuIds?.editorActions ?? MenuId.EditorTitle;
    this.editorActionsToolbar = this.editorActionsToolbarDisposables.add(this.instantiationService.createInstance(WorkbenchToolBar, container, {
      actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
      orientation: ActionsOrientation.HORIZONTAL,
      ariaLabel: localize("ariaLabelEditorActions", "Editor actions"),
      getKeyBinding: (action) => this.getKeybinding(action),
      actionRunner: this.editorActionsToolbarDisposables.add(new EditorCommandsContextActionRunner(context)),
      anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
      renderDropdownAsChildElement: this.renderDropdownAsChildElement,
      telemetrySource: "editorPart",
      resetMenu: editorActionsMenuId,
      overflowBehavior: { maxItems: 9, exempted: EDITOR_CORE_NAVIGATION_COMMANDS },
      highlightToggledItems: true
    }));
    this.editorActionsToolbar.context = context;
    this.editorActionsToolbarDisposables.add(this.editorActionsToolbar.actionRunner.onDidRun((e) => {
      if (e.error && !isCancellationError(e.error)) {
        this.notificationService.error(e.error);
      }
    }));
  }
  doCreateEditorLayoutActionsToolBar(container) {
    const context = { groupId: this.groupView.id };
    this.editorLayoutActionsToolbar = this.editorLayoutActionsToolbarDisposables.add(this.instantiationService.createInstance(WorkbenchToolBar, container, {
      actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
      orientation: ActionsOrientation.HORIZONTAL,
      ariaLabel: localize("ariaLabelEditorActionsLayout", "Editor layout actions"),
      getKeyBinding: (action) => this.getKeybinding(action),
      actionRunner: this.editorLayoutActionsToolbarDisposables.add(new EditorCommandsContextActionRunner(context)),
      anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
      renderDropdownAsChildElement: this.renderDropdownAsChildElement,
      telemetrySource: "editorPartTrailing",
      resetMenu: MenuId.EditorTitleLayout,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      highlightToggledItems: true
    }));
    this.editorLayoutActionsToolbar.context = context;
    this.editorLayoutActionsToolbarDisposables.add(this.editorLayoutActionsToolbar.actionRunner.onDidRun((e) => {
      if (e.error && !isCancellationError(e.error)) {
        this.notificationService.error(e.error);
      }
    }));
  }
  actionViewItemProvider(action, options) {
    const activeEditorPane = this.groupView.activeEditorPane;
    if (activeEditorPane instanceof EditorPane) {
      const result = activeEditorPane.getActionViewItem(action, options);
      if (result) {
        return result;
      }
    }
    return createActionViewItem(this.instantiationService, action, { ...options, menuAsChild: this.renderDropdownAsChildElement });
  }
  updateEditorActionsToolbar() {
    if (!this.editorActionsEnabled) {
      return;
    }
    this.editorActionsDisposables.clear();
    const editorActions = this.groupView.createEditorActions(this.editorActionsDisposables, this.menuIds?.editorActions ?? MenuId.EditorTitle);
    this.editorActionsDisposables.add(editorActions.onDidChange(() => this.updateEditorActionsToolbar()));
    const editorActionsToolbar = assertReturnsDefined(this.editorActionsToolbar);
    const { primary, secondary } = this.prepareEditorActions(editorActions.actions);
    editorActionsToolbar.setActions(prepareActions(primary), prepareActions(secondary));
    this.editorActionsToolbarHasActions = primary.length > 0 || secondary.length > 0;
    this.updateEditorLayoutActionsToolbar();
  }
  updateEditorLayoutActionsToolbar() {
    if (!this.editorActionsEnabled || !this.editorLayoutActionsToolbarContainer || !this.editorLayoutActionsToolbar) {
      return;
    }
    this.editorLayoutActionsDisposables.clear();
    const editorActions = this.groupView.createEditorActions(this.editorLayoutActionsDisposables, MenuId.EditorTitleLayout);
    this.editorLayoutActionsDisposables.add(editorActions.onDidChange(() => this.updateEditorLayoutActionsToolbar()));
    const { primary, secondary } = this.prepareEditorLayoutActions(editorActions.actions);
    this.editorLayoutActionsToolbar.setActions(prepareActions(primary), prepareActions(secondary));
    const hasLayoutActions = primary.length > 0 || secondary.length > 0;
    if (this.editorLayoutActionsSeparator) {
      setVisibility(hasLayoutActions && this.editorActionsToolbarHasActions, this.editorLayoutActionsSeparator);
    }
    setVisibility(hasLayoutActions, this.editorLayoutActionsToolbarContainer);
  }
  getEditorPaneAwareContextKeyService() {
    return this.groupView.activeEditorPane?.scopedContextKeyService ?? this.contextKeyService;
  }
  clearEditorActionsToolbar() {
    if (!this.editorActionsEnabled) {
      return;
    }
    const editorActionsToolbar = assertReturnsDefined(this.editorActionsToolbar);
    editorActionsToolbar.setActions([], []);
    this.editorActionsToolbarHasActions = false;
    this.editorLayoutActionsToolbar?.setActions([], []);
    if (this.editorLayoutActionsSeparator) {
      setVisibility(false, this.editorLayoutActionsSeparator);
    }
    if (this.editorLayoutActionsToolbarContainer) {
      setVisibility(false, this.editorLayoutActionsToolbarContainer);
    }
  }
  onGroupDragStart(e, element) {
    if (e.target !== element) {
      return false;
    }
    const isNewWindowOperation = this.isNewWindowOperation(e);
    this.groupTransfer.setData([new DraggedEditorGroupIdentifier(this.groupView.id)], DraggedEditorGroupIdentifier.prototype);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "copyMove";
    }
    let hasDataTransfer = false;
    if (this.groupsView.partOptions.showTabs === "multiple") {
      hasDataTransfer = this.doFillResourceDataTransfers(this.groupView.getEditors(EditorsOrder.SEQUENTIAL), e, isNewWindowOperation);
    } else {
      if (this.groupView.activeEditor) {
        hasDataTransfer = this.doFillResourceDataTransfers([this.groupView.activeEditor], e, isNewWindowOperation);
      }
    }
    if (!hasDataTransfer && isFirefox) {
      e.dataTransfer?.setData(DataTransfers.TEXT, String(this.groupView.label));
    }
    if (this.groupView.activeEditor) {
      let label = this.groupView.activeEditor.getName();
      if (this.groupsView.partOptions.showTabs === "multiple" && this.groupView.count > 1) {
        label = localize("draggedEditorGroup", "{0} (+{1})", label, this.groupView.count - 1);
      }
      applyDragImage(e, element, label);
    }
    return isNewWindowOperation;
  }
  async onGroupDragEnd(e, previousDragEvent, element, isNewWindowOperation) {
    this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
    if (e.target !== element || !isNewWindowOperation || isWindowDraggedOver()) {
      return;
    }
    const auxiliaryEditorPart = await this.maybeCreateAuxiliaryEditorPartAt(e, element);
    if (!auxiliaryEditorPart) {
      return;
    }
    const targetGroup = auxiliaryEditorPart.activeGroup;
    this.groupsView.mergeGroup(this.groupView, targetGroup.id, {
      mode: this.isMoveOperation(previousDragEvent ?? e, targetGroup.id) ? MergeGroupMode.MOVE_EDITORS : MergeGroupMode.COPY_EDITORS
    });
    targetGroup.focus();
  }
  async maybeCreateAuxiliaryEditorPartAt(e, offsetElement) {
    const { point, display } = await this.hostService.getCursorScreenPoint() ?? { point: { x: e.screenX, y: e.screenY } };
    const window = getActiveWindow();
    if (window.document.visibilityState === "visible" && window.document.hasFocus()) {
      if (point.x >= window.screenX && point.x <= window.screenX + window.outerWidth && point.y >= window.screenY && point.y <= window.screenY + window.outerHeight) {
        return;
      }
    }
    const offsetX = offsetElement.offsetWidth / 2;
    const offsetY = 30 + offsetElement.offsetHeight / 2;
    const bounds = {
      x: point.x - offsetX,
      y: point.y - offsetY
    };
    if (display) {
      if (bounds.x < display.x) {
        bounds.x = display.x;
      }
      if (bounds.y < display.y) {
        bounds.y = display.y;
      }
    }
    return this.editorPartsView.createAuxiliaryEditorPart({ bounds });
  }
  isNewWindowOperation(e) {
    if (this.groupsView.partOptions.dragToOpenWindow) {
      return !e.altKey;
    }
    return e.altKey;
  }
  isMoveOperation(e, sourceGroup, sourceEditor) {
    if (sourceEditor?.hasCapability(EditorInputCapabilities.Singleton)) {
      return true;
    }
    const isCopy = e.ctrlKey && !isMacintosh || e.altKey && isMacintosh;
    return !isCopy || sourceGroup === this.groupView.id;
  }
  doFillResourceDataTransfers(editors, e, disableStandardTransfer) {
    if (editors.length) {
      this.instantiationService.invokeFunction(fillEditorsDragData, editors.map((editor) => ({ editor, groupId: this.groupView.id })), e, { disableStandardTransfer });
      return true;
    }
    return false;
  }
  onTabContextMenu(editor, e, node) {
    this.resourceContext.set(EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }));
    this.editorPinnedContext.set(this.tabsModel.isPinned(editor));
    this.editorIsFirstContext.set(this.tabsModel.isFirst(editor));
    this.editorIsLastContext.set(this.tabsModel.isLast(editor));
    this.editorStickyContext.set(this.tabsModel.isSticky(editor));
    this.editorDirtyContext.set(editor.isDirty() && !editor.isSaving());
    this.groupLockedContext.set(this.tabsModel.isLocked);
    this.editorCanSplitInGroupContext.set(editor.hasCapability(EditorInputCapabilities.CanSplitInGroup));
    this.sideBySideEditorContext.set(editor.typeId === SideBySideEditorInput.ID);
    applyAvailableEditorIds(this.editorAvailableEditorIds, editor, this.editorResolverService);
    let anchor = node;
    if (isMouseEvent(e)) {
      anchor = new StandardMouseEvent(getWindow(node), e);
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => anchor,
      menuId: MenuId.EditorTitleContext,
      menuActionOptions: { shouldForwardArgs: true, arg: this.resourceContext.get() },
      contextKeyService: this.contextMenuContextKeyService,
      getActionsContext: () => ({ groupId: this.groupView.id, editorIndex: this.groupView.getIndexOfEditor(editor) }),
      getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id, this.contextMenuContextKeyService),
      onHide: () => this.groupsView.activeGroup.focus()
      // restore focus to active group
    });
  }
  getKeybinding(action) {
    return this.keybindingService.lookupKeybinding(action.id, this.getEditorPaneAwareContextKeyService());
  }
  getKeybindingLabel(action) {
    const keybinding = this.getKeybinding(action);
    return keybinding ? keybinding.getLabel() ?? void 0 : void 0;
  }
  get tabHeight() {
    const isCompact = this.groupsView.partOptions.tabHeight === "compact";
    if (this.parent.classList.contains("tabs") && this.parent.closest(".style-override")) {
      return isCompact ? EditorTabsControl.EDITOR_TAB_HEIGHT.styleOverrideCompact : EditorTabsControl.EDITOR_TAB_HEIGHT.styleOverride;
    }
    return isCompact ? EditorTabsControl.EDITOR_TAB_HEIGHT.compact : EditorTabsControl.EDITOR_TAB_HEIGHT.normal;
  }
  getHoverTitle(editor) {
    const title = editor.getTitle(Verbosity.LONG);
    if (!this.tabsModel.isPinned(editor)) {
      return {
        markdown: new MarkdownString("", { supportThemeIcons: true, isTrusted: true }).appendText(title).appendMarkdown(' (_preview_ [$(gear)](command:workbench.action.openSettings?%5B%22workbench.editor.enablePreview%22%5D "Configure Preview Mode"))'),
        markdownNotSupportedFallback: title + " (preview)"
      };
    }
    return title;
  }
  updateTabHeight() {
    this.parent.style.setProperty("--editor-group-tab-height", `${this.tabHeight}px`);
    this.parent.classList.toggle("compact-height", this.groupsView.partOptions.tabHeight === "compact");
  }
  updateOptions(oldOptions, newOptions) {
    if (oldOptions.tabHeight !== newOptions.tabHeight) {
      this.updateTabHeight();
    }
    if (oldOptions.editorActionsLocation !== newOptions.editorActionsLocation || oldOptions.showTabs !== newOptions.showTabs) {
      if (this.editorActionsToolbarContainer) {
        this.handleEditorActionToolBarVisibility(this.editorActionsToolbarContainer);
        this.updateEditorActionsToolbar();
      }
      if (this.editorLayoutActionsToolbarContainer) {
        this.handleEditorLayoutActionsToolBarVisibility(this.editorLayoutActionsToolbarContainer);
        this.updateEditorLayoutActionsToolbar();
      }
    }
  }
};
EditorTabsControl.EDITOR_TAB_HEIGHT = {
  normal: 35,
  compact: 22,
  // Style-override (Modern UI) multi-tab mode adds 4px top + 4px bottom padding to
  // the tabs-and-actions-container (tabs.css), so the total title-bar height is the
  // --editor-group-tab-height CSS value (24px / 20px) plus that 8px padding.
  styleOverride: 32,
  // 24px tab  + 4px top + 4px bottom padding
  styleOverrideCompact: 28
  // 20px tab  + 4px top + 4px bottom padding (20px = minimum to fit 16px icon + 2px padding)
};
EditorTabsControl = __decorateClass([
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, INotificationService),
  __decorateParam(11, IQuickInputService),
  __decorateParam(12, IThemeService),
  __decorateParam(13, IEditorResolverService),
  __decorateParam(14, IHostService),
  __decorateParam(15, IMenuService)
], EditorTabsControl);
export {
  EditorCommandsContextActionRunner,
  EditorTabsControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JUYWJzQ29udHJvbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9lZGl0b3J0YWJzY29udHJvbC5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRGF0YVRyYW5zZmVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgJCwgRGltZW5zaW9uLCBnZXRBY3RpdmVXaW5kb3csIGdldFdpbmRvdywgaXNNb3VzZUV2ZW50LCBzZXRWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25zT3JpZW50YXRpb24sIElBY3Rpb25WaWV3SXRlbSwgcHJlcGFyZUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBBY3Rpb25SdW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgSUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgVGhlbWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERyYWdnZWRFZGl0b3JHcm91cElkZW50aWZpZXIsIERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLCBmaWxsRWRpdG9yc0RyYWdEYXRhLCBpc1dpbmRvd0RyYWdnZWRPdmVyIH0gZnJvbSAnLi4vLi4vZG5kLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwTWVudUlkcywgSUVkaXRvckdyb3Vwc1ZpZXcsIElFZGl0b3JHcm91cFZpZXcsIElFZGl0b3JQYXJ0c1ZpZXcsIElJbnRlcm5hbEVkaXRvck9wZW5PcHRpb25zIH0gZnJvbSAnLi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbW1hbmRzQ29udGV4dCwgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgSUVkaXRvclBhcnRPcHRpb25zLCBTaWRlQnlTaWRlRWRpdG9yLCBFZGl0b3JzT3JkZXIsIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBJVG9vbGJhckFjdGlvbnMsIEdyb3VwSWRlbnRpZmllciwgVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VDb250ZXh0S2V5LCBBY3RpdmVFZGl0b3JQaW5uZWRDb250ZXh0LCBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0LCBBY3RpdmVFZGl0b3JEaXJ0eUNvbnRleHQsIEFjdGl2ZUVkaXRvckdyb3VwTG9ja2VkQ29udGV4dCwgQWN0aXZlRWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dCwgU2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQsIEFjdGl2ZUVkaXRvckZpcnN0SW5Hcm91cENvbnRleHQsIEFjdGl2ZUVkaXRvckF2YWlsYWJsZUVkaXRvcklkc0NvbnRleHQsIGFwcGx5QXZhaWxhYmxlRWRpdG9ySWRzLCBBY3RpdmVFZGl0b3JMYXN0SW5Hcm91cENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgaXNGaXJlZm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hUb29sQmFyLCBIaWRkZW5JdGVtU3RyYXRlZ3kgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBMb2NhbFNlbGVjdGlvblRyYW5zZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IERyYWdnZWRUcmVlSXRlbXNJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90cmVlVmlld3NEbmQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JUaXRsZUNvbnRyb2xEaW1lbnNpb25zIH0gZnJvbSAnLi9lZGl0b3JUaXRsZUNvbnRyb2wuanMnO1xuaW1wb3J0IHsgSVJlYWRvbmx5RWRpdG9yR3JvdXBNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yR3JvdXBNb2RlbC5qcyc7XG5pbXBvcnQgeyBFRElUT1JfQ09SRV9OQVZJR0FUSU9OX0NPTU1BTkRTIH0gZnJvbSAnLi9lZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5RWRpdG9yUGFydCwgTWVyZ2VHcm91cE1vZGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJTWFuYWdlZEhvdmVyVG9vbHRpcE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IGFwcGx5RHJhZ0ltYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2RuZC9kbmQuanMnO1xuXG5leHBvcnQgY2xhc3MgRWRpdG9yQ29tbWFuZHNDb250ZXh0QWN0aW9uUnVubmVyIGV4dGVuZHMgQWN0aW9uUnVubmVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGNvbnRleHQ6IElFZGl0b3JDb21tYW5kc0NvbnRleHRcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY3Rpb246IElBY3Rpb24sIGNvbnRleHQ/OiB7IHByZXNlcnZlRm9jdXM/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIEV2ZW4gdGhvdWdoIHdlIGhhdmUgYSBmaXhlZCBjb250ZXh0IGZvciBlZGl0b3IgY29tbWFuZHMsXG5cdFx0Ly8gYWxsb3cgdG8gcHJlc2VydmUgdGhlIGNvbnRleHQgdGhhdCBpcyBnaXZlbiB0byB1cyBpbiBjYXNlXG5cdFx0Ly8gaXQgYXBwbGllcy5cblxuXHRcdGxldCBtZXJnZWRDb250ZXh0ID0gdGhpcy5jb250ZXh0O1xuXHRcdGlmIChjb250ZXh0Py5wcmVzZXJ2ZUZvY3VzKSB7XG5cdFx0XHRtZXJnZWRDb250ZXh0ID0ge1xuXHRcdFx0XHQuLi50aGlzLmNvbnRleHQsXG5cdFx0XHRcdHByZXNlcnZlRm9jdXM6IHRydWVcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLnJ1bihhY3Rpb24sIG1lcmdlZENvbnRleHQpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvclRhYnNDb250cm9sIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHR1cGRhdGVPcHRpb25zKG9sZE9wdGlvbnM6IElFZGl0b3JQYXJ0T3B0aW9ucywgbmV3T3B0aW9uczogSUVkaXRvclBhcnRPcHRpb25zKTogdm9pZDtcblx0b3BlbkVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0LCBvcHRpb25zPzogSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMpOiBib29sZWFuO1xuXHRvcGVuRWRpdG9ycyhlZGl0b3JzOiBFZGl0b3JJbnB1dFtdKTogYm9vbGVhbjtcblx0YmVmb3JlQ2xvc2VFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQ7XG5cdGNsb3NlRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkO1xuXHRjbG9zZUVkaXRvcnMoZWRpdG9yczogRWRpdG9ySW5wdXRbXSk6IHZvaWQ7XG5cdG1vdmVFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCwgZnJvbUluZGV4OiBudW1iZXIsIHRhcmdldEluZGV4OiBudW1iZXIsIHN0aWNreVN0YXRlQ2hhbmdlOiBib29sZWFuKTogdm9pZDtcblx0cGluRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkO1xuXHRzdGlja0VkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZDtcblx0dW5zdGlja0VkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZDtcblx0c2V0QWN0aXZlKGlzQWN0aXZlOiBib29sZWFuKTogdm9pZDtcblx0dXBkYXRlRWRpdG9yU2VsZWN0aW9ucygpOiB2b2lkO1xuXHR1cGRhdGVFZGl0b3JMYWJlbChlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZDtcblx0dXBkYXRlRWRpdG9yRGlydHkoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQ7XG5cdGxheW91dChkaW1lbnNpb25zOiBJRWRpdG9yVGl0bGVDb250cm9sRGltZW5zaW9ucyk6IERpbWVuc2lvbjtcblx0Z2V0SGVpZ2h0KCk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEVkaXRvclRhYnNDb250cm9sIGV4dGVuZHMgVGhlbWFibGUgaW1wbGVtZW50cyBJRWRpdG9yVGFic0NvbnRyb2wge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBlZGl0b3JUcmFuc2ZlciA9IExvY2FsU2VsZWN0aW9uVHJhbnNmZXIuZ2V0SW5zdGFuY2U8RHJhZ2dlZEVkaXRvcklkZW50aWZpZXI+KCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBncm91cFRyYW5zZmVyID0gTG9jYWxTZWxlY3Rpb25UcmFuc2Zlci5nZXRJbnN0YW5jZTxEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyPigpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdHJlZUl0ZW1zVHJhbnNmZXIgPSBMb2NhbFNlbGVjdGlvblRyYW5zZmVyLmdldEluc3RhbmNlPERyYWdnZWRUcmVlSXRlbXNJZGVudGlmaWVyPigpO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVESVRPUl9UQUJfSEVJR0hUID0ge1xuXHRcdG5vcm1hbDogMzUgYXMgY29uc3QsXG5cdFx0Y29tcGFjdDogMjIgYXMgY29uc3QsXG5cdFx0Ly8gU3R5bGUtb3ZlcnJpZGUgKE1vZGVybiBVSSkgbXVsdGktdGFiIG1vZGUgYWRkcyA0cHggdG9wICsgNHB4IGJvdHRvbSBwYWRkaW5nIHRvXG5cdFx0Ly8gdGhlIHRhYnMtYW5kLWFjdGlvbnMtY29udGFpbmVyICh0YWJzLmNzcyksIHNvIHRoZSB0b3RhbCB0aXRsZS1iYXIgaGVpZ2h0IGlzIHRoZVxuXHRcdC8vIC0tZWRpdG9yLWdyb3VwLXRhYi1oZWlnaHQgQ1NTIHZhbHVlICgyNHB4IC8gMjBweCkgcGx1cyB0aGF0IDhweCBwYWRkaW5nLlxuXHRcdHN0eWxlT3ZlcnJpZGU6IDMyIGFzIGNvbnN0LCAgICAgICAgLy8gMjRweCB0YWIgICsgNHB4IHRvcCArIDRweCBib3R0b20gcGFkZGluZ1xuXHRcdHN0eWxlT3ZlcnJpZGVDb21wYWN0OiAyOCBhcyBjb25zdCwgLy8gMjBweCB0YWIgICsgNHB4IHRvcCArIDRweCBib3R0b20gcGFkZGluZyAoMjBweCA9IG1pbmltdW0gdG8gZml0IDE2cHggaWNvbiArIDJweCBwYWRkaW5nKVxuXHR9O1xuXG5cdHByb3RlY3RlZCBlZGl0b3JBY3Rpb25zVG9vbGJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZWRpdG9yQWN0aW9uc1Rvb2xiYXI6IFdvcmtiZW5jaFRvb2xCYXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yQWN0aW9uc1Rvb2xiYXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yQWN0aW9uc0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0LyoqIFdoZXRoZXIgdGhlIGVkaXRvci1hY3Rpb25zIHRvb2xiYXIgY3VycmVudGx5IGhhcyBhbnkgYWN0aW9ucyAoZHJpdmVzIHRoZSBsYXlvdXQtYWN0aW9ucyBzZXBhcmF0b3IpLiAqL1xuXHRwcml2YXRlIGVkaXRvckFjdGlvbnNUb29sYmFySGFzQWN0aW9ucyA9IGZhbHNlO1xuXG5cdHByaXZhdGUgZWRpdG9yTGF5b3V0QWN0aW9uc1NlcGFyYXRvcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBlZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXI6IFdvcmtiZW5jaFRvb2xCYXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yTGF5b3V0QWN0aW9uc0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51Q29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblx0cHJpdmF0ZSByZXNvdXJjZUNvbnRleHQ6IFJlc291cmNlQ29udGV4dEtleTtcblxuXHRwcml2YXRlIGVkaXRvclBpbm5lZENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGVkaXRvcklzRmlyc3RDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBlZGl0b3JJc0xhc3RDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBlZGl0b3JTdGlja3lDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBlZGl0b3JEaXJ0eUNvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGVkaXRvckF2YWlsYWJsZUVkaXRvcklkczogSUNvbnRleHRLZXk8c3RyaW5nPjtcblxuXHRwcml2YXRlIGVkaXRvckNhblNwbGl0SW5Hcm91cENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHNpZGVCeVNpZGVFZGl0b3JDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIGdyb3VwTG9ja2VkQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZW5kZXJEcm9wZG93bkFzQ2hpbGRFbGVtZW50OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBlZGl0b3JQYXJ0c1ZpZXc6IElFZGl0b3JQYXJ0c1ZpZXcsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGdyb3Vwc1ZpZXc6IElFZGl0b3JHcm91cHNWaWV3LFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBncm91cFZpZXc6IElFZGl0b3JHcm91cFZpZXcsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IHRhYnNNb2RlbDogSVJlYWRvbmx5RWRpdG9yR3JvdXBNb2RlbCxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgbWVudUlkczogSUVkaXRvckdyb3VwTWVudUlkcyB8IHVuZGVmaW5lZCxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByb3RlY3RlZCBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUVkaXRvclJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclJlc29sdmVyU2VydmljZTogSUVkaXRvclJlc29sdmVyU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0aGVtZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5yZW5kZXJEcm9wZG93bkFzQ2hpbGRFbGVtZW50ID0gZmFsc2U7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmNyZWF0ZShwYXJlbnQpO1xuXG5cdFx0Ly8gQ29udGV4dCBLZXlzXG5cdFx0dGhpcy5jb250ZXh0TWVudUNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoY29udGFpbmVyKSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuY29udGV4dE1lbnVDb250ZXh0S2V5U2VydmljZV0sXG5cdFx0KSkpO1xuXG5cdFx0dGhpcy5yZXNvdXJjZUNvbnRleHQgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUNvbnRleHRLZXkpKTtcblxuXHRcdHRoaXMuZWRpdG9yUGlubmVkQ29udGV4dCA9IEFjdGl2ZUVkaXRvclBpbm5lZENvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dE1lbnVDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5lZGl0b3JJc0ZpcnN0Q29udGV4dCA9IEFjdGl2ZUVkaXRvckZpcnN0SW5Hcm91cENvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dE1lbnVDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5lZGl0b3JJc0xhc3RDb250ZXh0ID0gQWN0aXZlRWRpdG9yTGFzdEluR3JvdXBDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRNZW51Q29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZWRpdG9yU3RpY2t5Q29udGV4dCA9IEFjdGl2ZUVkaXRvclN0aWNreUNvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dE1lbnVDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5lZGl0b3JEaXJ0eUNvbnRleHQgPSBBY3RpdmVFZGl0b3JEaXJ0eUNvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dE1lbnVDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5lZGl0b3JBdmFpbGFibGVFZGl0b3JJZHMgPSBBY3RpdmVFZGl0b3JBdmFpbGFibGVFZGl0b3JJZHNDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRNZW51Q29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5lZGl0b3JDYW5TcGxpdEluR3JvdXBDb250ZXh0ID0gQWN0aXZlRWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dC5iaW5kVG8odGhpcy5jb250ZXh0TWVudUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNpZGVCeVNpZGVFZGl0b3JDb250ZXh0ID0gU2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dE1lbnVDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLmdyb3VwTG9ja2VkQ29udGV4dCA9IEFjdGl2ZUVkaXRvckdyb3VwTG9ja2VkQ29udGV4dC5iaW5kVG8odGhpcy5jb250ZXh0TWVudUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHR0aGlzLnVwZGF0ZVRhYkhlaWdodCgpO1xuXHRcdHJldHVybiBwYXJlbnQ7XG5cdH1cblxuXHRwcml2YXRlIGdldCBlZGl0b3JBY3Rpb25zRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLmVkaXRvckFjdGlvbnNMb2NhdGlvbiA9PT0gJ2RlZmF1bHQnICYmIHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5zaG93VGFicyAhPT0gJ25vbmUnO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvckFjdGlvbnNUb29sQmFyKHBhcmVudDogSFRNTEVsZW1lbnQsIGNsYXNzZXM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhckNvbnRhaW5lciA9ICQoJ2RpdicpO1xuXHRcdHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJDb250YWluZXIuY2xhc3NMaXN0LmFkZCguLi5jbGFzc2VzKTtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhckNvbnRhaW5lcik7XG5cblx0XHR0aGlzLmhhbmRsZUVkaXRvckFjdGlvblRvb2xCYXJWaXNpYmlsaXR5KHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJDb250YWluZXIpO1xuXG5cdFx0dGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zU2VwYXJhdG9yID0gJCgnZGl2LmVkaXRvci1hY3Rpb25zLXNlcGFyYXRvcicpO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLmVkaXRvckxheW91dEFjdGlvbnNTZXBhcmF0b3IpO1xuXG5cdFx0dGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhckNvbnRhaW5lciA9ICQoJ2Rpdi5lZGl0b3ItbGF5b3V0LWFjdGlvbnMnKTtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhckNvbnRhaW5lcik7XG5cblx0XHR0aGlzLmhhbmRsZUVkaXRvckxheW91dEFjdGlvbnNUb29sQmFyVmlzaWJpbGl0eSh0aGlzLmVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyQ29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlRWRpdG9yQWN0aW9uVG9vbEJhclZpc2liaWxpdHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvckFjdGlvbnNFbmFibGVkID0gdGhpcy5lZGl0b3JBY3Rpb25zRW5hYmxlZDtcblx0XHRjb25zdCBlZGl0b3JBY3Rpb25zVmlzaWJsZSA9ICEhdGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhcjtcblxuXHRcdC8vIENyZWF0ZSB0b29sYmFyIGlmIGl0IGlzIGVuYWJsZWQgKGFuZCBub3QgeWV0IGNyZWF0ZWQpXG5cdFx0aWYgKGVkaXRvckFjdGlvbnNFbmFibGVkICYmICFlZGl0b3JBY3Rpb25zVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5kb0NyZWF0ZUVkaXRvckFjdGlvbnNUb29sQmFyKGNvbnRhaW5lcik7XG5cdFx0fVxuXHRcdC8vIFJlbW92ZSB0b29sYmFyIGlmIGl0IGlzIG5vdCBlbmFibGVkIChhbmQgaXMgdmlzaWJsZSlcblx0XHRlbHNlIGlmICghZWRpdG9yQWN0aW9uc0VuYWJsZWQgJiYgZWRpdG9yQWN0aW9uc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXI/LmdldEVsZW1lbnQoKS5yZW1vdmUoKTtcblx0XHRcdHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmVkaXRvckFjdGlvbnNUb29sYmFyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuZWRpdG9yQWN0aW9uc0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fVxuXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFlZGl0b3JBY3Rpb25zRW5hYmxlZCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUVkaXRvckxheW91dEFjdGlvbnNUb29sQmFyVmlzaWJpbGl0eShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yQWN0aW9uc0VuYWJsZWQgPSB0aGlzLmVkaXRvckFjdGlvbnNFbmFibGVkO1xuXHRcdGNvbnN0IGVkaXRvckFjdGlvbnNWaXNpYmxlID0gISF0aGlzLmVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyO1xuXG5cdFx0Ly8gQ3JlYXRlIHRvb2xiYXIgaWYgaXQgaXMgZW5hYmxlZCAoYW5kIG5vdCB5ZXQgY3JlYXRlZClcblx0XHRpZiAoZWRpdG9yQWN0aW9uc0VuYWJsZWQgJiYgIWVkaXRvckFjdGlvbnNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLmRvQ3JlYXRlRWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xCYXIoY29udGFpbmVyKTtcblx0XHR9XG5cdFx0Ly8gUmVtb3ZlIHRvb2xiYXIgaWYgaXQgaXMgbm90IGVuYWJsZWQgKGFuZCBpcyB2aXNpYmxlKVxuXHRcdGVsc2UgaWYgKCFlZGl0b3JBY3Rpb25zRW5hYmxlZCAmJiBlZGl0b3JBY3Rpb25zVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhcj8uZ2V0RWxlbWVudCgpLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhciA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9XG5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIWVkaXRvckFjdGlvbnNFbmFibGVkKTtcblxuXHRcdC8vIEtlZXAgdGhlIHNpYmxpbmcgc2VwYXJhdG9yIGluIHN5bmMgd2l0aCB0aGUgdG9vbGJhci4gVGhlIHNlcGFyYXRvciBsaXZlcyBvdXRzaWRlXG5cdFx0Ly8gdGhlIGhpZGRlbiBjb250YWluZXJzIHNvIGl0IG11c3QgYmUgZXhwbGljaXRseSBoaWRkZW4gd2hlbmV2ZXIgdGhlIGxheW91dCB0b29sYmFyXG5cdFx0Ly8gaXMgZGlzYWJsZWQvcmVtb3ZlZDsgb3RoZXJ3aXNlIGl0IHdvdWxkIHJlbWFpbiB2aXNpYmxlIGFzIGFuIG9ycGhhbiBsaW5lLlxuXHRcdGlmICh0aGlzLmVkaXRvckxheW91dEFjdGlvbnNTZXBhcmF0b3IgJiYgIWVkaXRvckFjdGlvbnNFbmFibGVkKSB7XG5cdFx0XHRzZXRWaXNpYmlsaXR5KGZhbHNlLCB0aGlzLmVkaXRvckxheW91dEFjdGlvbnNTZXBhcmF0b3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9DcmVhdGVFZGl0b3JBY3Rpb25zVG9vbEJhcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGV4dDogSUVkaXRvckNvbW1hbmRzQ29udGV4dCA9IHsgZ3JvdXBJZDogdGhpcy5ncm91cFZpZXcuaWQgfTtcblx0XHRjb25zdCBlZGl0b3JBY3Rpb25zTWVudUlkID0gdGhpcy5tZW51SWRzPy5lZGl0b3JBY3Rpb25zID8/IE1lbnVJZC5FZGl0b3JUaXRsZTtcblxuXHRcdC8vIFRvb2xiYXIgV2lkZ2V0XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhciA9IHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUb29sQmFyLCBjb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHRoaXMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb24sIG9wdGlvbnMpLFxuXHRcdFx0b3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnYXJpYUxhYmVsRWRpdG9yQWN0aW9ucycsIFwiRWRpdG9yIGFjdGlvbnNcIiksXG5cdFx0XHRnZXRLZXlCaW5kaW5nOiBhY3Rpb24gPT4gdGhpcy5nZXRLZXliaW5kaW5nKGFjdGlvbiksXG5cdFx0XHRhY3Rpb25SdW5uZXI6IHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJEaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRvckNvbW1hbmRzQ29udGV4dEFjdGlvblJ1bm5lcihjb250ZXh0KSksXG5cdFx0XHRhbmNob3JBbGlnbm1lbnRQcm92aWRlcjogKCkgPT4gQW5jaG9yQWxpZ25tZW50LlJJR0hULFxuXHRcdFx0cmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudDogdGhpcy5yZW5kZXJEcm9wZG93bkFzQ2hpbGRFbGVtZW50LFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnZWRpdG9yUGFydCcsXG5cdFx0XHRyZXNldE1lbnU6IGVkaXRvckFjdGlvbnNNZW51SWQsXG5cdFx0XHRvdmVyZmxvd0JlaGF2aW9yOiB7IG1heEl0ZW1zOiA5LCBleGVtcHRlZDogRURJVE9SX0NPUkVfTkFWSUdBVElPTl9DT01NQU5EUyB9LFxuXHRcdFx0aGlnaGxpZ2h0VG9nZ2xlZEl0ZW1zOiB0cnVlXG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29udGV4dFxuXHRcdHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXIuY29udGV4dCA9IGNvbnRleHQ7XG5cblx0XHQvLyBBY3Rpb24gUnVuIEhhbmRsaW5nXG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhckRpc3Bvc2FibGVzLmFkZCh0aGlzLmVkaXRvckFjdGlvbnNUb29sYmFyLmFjdGlvblJ1bm5lci5vbkRpZFJ1bihlID0+IHtcblxuXHRcdFx0Ly8gTm90aWZ5IGZvciBFcnJvclxuXHRcdFx0aWYgKGUuZXJyb3IgJiYgIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZS5lcnJvcikpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGUuZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZG9DcmVhdGVFZGl0b3JMYXlvdXRBY3Rpb25zVG9vbEJhcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGV4dDogSUVkaXRvckNvbW1hbmRzQ29udGV4dCA9IHsgZ3JvdXBJZDogdGhpcy5ncm91cFZpZXcuaWQgfTtcblxuXHRcdC8vIFRvb2xiYXIgV2lkZ2V0IChubyBvdmVyZmxvdywgbm8gaGlkZGVuLWl0ZW0gXCIuLi5cIiBidXR0b24gc28gbGF5b3V0IGFjdGlvbnNcblx0XHQvLyBhcmUgYWx3YXlzIHJlbmRlcmVkIGlubGluZSBhZnRlciB0aGUgcHJpbWFyeSB0b29sYmFyJ3Mgb3duIG92ZXJmbG93KS5cblx0XHR0aGlzLmVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyID0gdGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhckRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsIGNvbnRhaW5lciwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4gdGhpcy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyKGFjdGlvbiwgb3B0aW9ucyksXG5cdFx0XHRvcmllbnRhdGlvbjogQWN0aW9uc09yaWVudGF0aW9uLkhPUklaT05UQUwsXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdhcmlhTGFiZWxFZGl0b3JBY3Rpb25zTGF5b3V0JywgXCJFZGl0b3IgbGF5b3V0IGFjdGlvbnNcIiksXG5cdFx0XHRnZXRLZXlCaW5kaW5nOiBhY3Rpb24gPT4gdGhpcy5nZXRLZXliaW5kaW5nKGFjdGlvbiksXG5cdFx0XHRhY3Rpb25SdW5uZXI6IHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJEaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRvckNvbW1hbmRzQ29udGV4dEFjdGlvblJ1bm5lcihjb250ZXh0KSksXG5cdFx0XHRhbmNob3JBbGlnbm1lbnRQcm92aWRlcjogKCkgPT4gQW5jaG9yQWxpZ25tZW50LlJJR0hULFxuXHRcdFx0cmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudDogdGhpcy5yZW5kZXJEcm9wZG93bkFzQ2hpbGRFbGVtZW50LFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnZWRpdG9yUGFydFRyYWlsaW5nJyxcblx0XHRcdHJlc2V0TWVudTogTWVudUlkLkVkaXRvclRpdGxlTGF5b3V0LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0aGlnaGxpZ2h0VG9nZ2xlZEl0ZW1zOiB0cnVlXG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29udGV4dFxuXHRcdHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXIuY29udGV4dCA9IGNvbnRleHQ7XG5cblx0XHQvLyBBY3Rpb24gUnVuIEhhbmRsaW5nXG5cdFx0dGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhckRpc3Bvc2FibGVzLmFkZCh0aGlzLmVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyLmFjdGlvblJ1bm5lci5vbkRpZFJ1bihlID0+IHtcblxuXHRcdFx0Ly8gTm90aWZ5IGZvciBFcnJvclxuXHRcdFx0aWYgKGUuZXJyb3IgJiYgIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZS5lcnJvcikpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGUuZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zKTogSUFjdGlvblZpZXdJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gdGhpcy5ncm91cFZpZXcuYWN0aXZlRWRpdG9yUGFuZTtcblxuXHRcdC8vIENoZWNrIEFjdGl2ZSBFZGl0b3Jcblx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIEVkaXRvclBhbmUpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFjdGl2ZUVkaXRvclBhbmUuZ2V0QWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBvcHRpb25zKTtcblxuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIGV4dGVuc2lvbnNcblx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0odGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIG1lbnVBc0NoaWxkOiB0aGlzLnJlbmRlckRyb3Bkb3duQXNDaGlsZEVsZW1lbnQgfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlRWRpdG9yQWN0aW9uc1Rvb2xiYXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvckFjdGlvbnNFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25zRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IGVkaXRvckFjdGlvbnMgPSB0aGlzLmdyb3VwVmlldy5jcmVhdGVFZGl0b3JBY3Rpb25zKHRoaXMuZWRpdG9yQWN0aW9uc0Rpc3Bvc2FibGVzLCB0aGlzLm1lbnVJZHM/LmVkaXRvckFjdGlvbnMgPz8gTWVudUlkLkVkaXRvclRpdGxlKTtcblx0XHR0aGlzLmVkaXRvckFjdGlvbnNEaXNwb3NhYmxlcy5hZGQoZWRpdG9yQWN0aW9ucy5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZUVkaXRvckFjdGlvbnNUb29sYmFyKCkpKTtcblxuXHRcdGNvbnN0IGVkaXRvckFjdGlvbnNUb29sYmFyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhcik7XG5cdFx0Y29uc3QgeyBwcmltYXJ5LCBzZWNvbmRhcnkgfSA9IHRoaXMucHJlcGFyZUVkaXRvckFjdGlvbnMoZWRpdG9yQWN0aW9ucy5hY3Rpb25zKTtcblx0XHRlZGl0b3JBY3Rpb25zVG9vbGJhci5zZXRBY3Rpb25zKHByZXBhcmVBY3Rpb25zKHByaW1hcnkpLCBwcmVwYXJlQWN0aW9ucyhzZWNvbmRhcnkpKTtcblx0XHR0aGlzLmVkaXRvckFjdGlvbnNUb29sYmFySGFzQWN0aW9ucyA9IHByaW1hcnkubGVuZ3RoID4gMCB8fCBzZWNvbmRhcnkubGVuZ3RoID4gMDtcblxuXHRcdHRoaXMudXBkYXRlRWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXIoKTogdm9pZCB7XG5cdFx0aWYgKFxuXHRcdFx0IXRoaXMuZWRpdG9yQWN0aW9uc0VuYWJsZWQgfHxcblx0XHRcdCF0aGlzLmVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyQ29udGFpbmVyIHx8XG5cdFx0XHQhdGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhclxuXHRcdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBlZGl0b3JBY3Rpb25zID0gdGhpcy5ncm91cFZpZXcuY3JlYXRlRWRpdG9yQWN0aW9ucyh0aGlzLmVkaXRvckxheW91dEFjdGlvbnNEaXNwb3NhYmxlcywgTWVudUlkLkVkaXRvclRpdGxlTGF5b3V0KTtcblx0XHR0aGlzLmVkaXRvckxheW91dEFjdGlvbnNEaXNwb3NhYmxlcy5hZGQoZWRpdG9yQWN0aW9ucy5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZUVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyKCkpKTtcblxuXHRcdGNvbnN0IHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH0gPSB0aGlzLnByZXBhcmVFZGl0b3JMYXlvdXRBY3Rpb25zKGVkaXRvckFjdGlvbnMuYWN0aW9ucyk7XG5cdFx0dGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhci5zZXRBY3Rpb25zKHByZXBhcmVBY3Rpb25zKHByaW1hcnkpLCBwcmVwYXJlQWN0aW9ucyhzZWNvbmRhcnkpKTtcblxuXHRcdGNvbnN0IGhhc0xheW91dEFjdGlvbnMgPSBwcmltYXJ5Lmxlbmd0aCA+IDAgfHwgc2Vjb25kYXJ5Lmxlbmd0aCA+IDA7XG5cblx0XHQvLyBPbmx5IHNob3cgdGhlIHNlcGFyYXRvciBhbmQgdGhlIHRvb2xiYXIgY29udGFpbmVyIHdoZW4gdGhlIGxheW91dCB0b29sYmFyXG5cdFx0Ly8gaGFzIGFjdGlvbnMgQU5EIHRoZXJlIGFyZSBlZGl0b3IgYWN0aW9ucyB0byBpdHMgbGVmdCB0byBzZXBhcmF0ZSBmcm9tLlxuXHRcdGlmICh0aGlzLmVkaXRvckxheW91dEFjdGlvbnNTZXBhcmF0b3IpIHtcblx0XHRcdHNldFZpc2liaWxpdHkoaGFzTGF5b3V0QWN0aW9ucyAmJiB0aGlzLmVkaXRvckFjdGlvbnNUb29sYmFySGFzQWN0aW9ucywgdGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zU2VwYXJhdG9yKTtcblx0XHR9XG5cblx0XHRzZXRWaXNpYmlsaXR5KGhhc0xheW91dEFjdGlvbnMsIHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJDb250YWluZXIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IHByZXBhcmVFZGl0b3JBY3Rpb25zKGVkaXRvckFjdGlvbnM6IElUb29sYmFyQWN0aW9ucyk6IElUb29sYmFyQWN0aW9ucztcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgcHJlcGFyZUVkaXRvckxheW91dEFjdGlvbnMoZWRpdG9yQWN0aW9uczogSVRvb2xiYXJBY3Rpb25zKTogSVRvb2xiYXJBY3Rpb25zO1xuXG5cdHByaXZhdGUgZ2V0RWRpdG9yUGFuZUF3YXJlQ29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHtcblx0XHRyZXR1cm4gdGhpcy5ncm91cFZpZXcuYWN0aXZlRWRpdG9yUGFuZT8uc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPz8gdGhpcy5jb250ZXh0S2V5U2VydmljZTtcblx0fVxuXG5cdHByb3RlY3RlZCBjbGVhckVkaXRvckFjdGlvbnNUb29sYmFyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lZGl0b3JBY3Rpb25zRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvckFjdGlvbnNUb29sYmFyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhcik7XG5cdFx0ZWRpdG9yQWN0aW9uc1Rvb2xiYXIuc2V0QWN0aW9ucyhbXSwgW10pO1xuXHRcdHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJIYXNBY3Rpb25zID0gZmFsc2U7XG5cblx0XHR0aGlzLmVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyPy5zZXRBY3Rpb25zKFtdLCBbXSk7XG5cdFx0aWYgKHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1NlcGFyYXRvcikge1xuXHRcdFx0c2V0VmlzaWJpbGl0eShmYWxzZSwgdGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zU2VwYXJhdG9yKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJDb250YWluZXIpIHtcblx0XHRcdHNldFZpc2liaWxpdHkoZmFsc2UsIHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJDb250YWluZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvbkdyb3VwRHJhZ1N0YXJ0KGU6IERyYWdFdmVudCwgZWxlbWVudDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAoZS50YXJnZXQgIT09IGVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gb25seSBpZiBvcmlnaW5hdGluZyBmcm9tIHRhYnMgY29udGFpbmVyXG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNOZXdXaW5kb3dPcGVyYXRpb24gPSB0aGlzLmlzTmV3V2luZG93T3BlcmF0aW9uKGUpO1xuXG5cdFx0Ly8gU2V0IGVkaXRvciBncm91cCBhcyB0cmFuc2ZlclxuXHRcdHRoaXMuZ3JvdXBUcmFuc2Zlci5zZXREYXRhKFtuZXcgRHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllcih0aGlzLmdyb3VwVmlldy5pZCldLCBEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0aWYgKGUuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRlLmRhdGFUcmFuc2Zlci5lZmZlY3RBbGxvd2VkID0gJ2NvcHlNb3ZlJztcblx0XHR9XG5cblx0XHQvLyBEcmFnIGFsbCB0YWJzIG9mIHRoZSBncm91cCBpZiB0YWJzIGFyZSBlbmFibGVkXG5cdFx0bGV0IGhhc0RhdGFUcmFuc2ZlciA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMuc2hvd1RhYnMgPT09ICdtdWx0aXBsZScpIHtcblx0XHRcdGhhc0RhdGFUcmFuc2ZlciA9IHRoaXMuZG9GaWxsUmVzb3VyY2VEYXRhVHJhbnNmZXJzKHRoaXMuZ3JvdXBWaWV3LmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLCBlLCBpc05ld1dpbmRvd09wZXJhdGlvbik7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIG9ubHkgZHJhZyB0aGUgYWN0aXZlIGVkaXRvclxuXHRcdGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMuZ3JvdXBWaWV3LmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRoYXNEYXRhVHJhbnNmZXIgPSB0aGlzLmRvRmlsbFJlc291cmNlRGF0YVRyYW5zZmVycyhbdGhpcy5ncm91cFZpZXcuYWN0aXZlRWRpdG9yXSwgZSwgaXNOZXdXaW5kb3dPcGVyYXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpcmVmb3g6IHJlcXVpcmVzIHRvIHNldCBhIHRleHQgZGF0YSB0cmFuc2ZlciB0byBnZXQgZ29pbmdcblx0XHRpZiAoIWhhc0RhdGFUcmFuc2ZlciAmJiBpc0ZpcmVmb3gpIHtcblx0XHRcdGUuZGF0YVRyYW5zZmVyPy5zZXREYXRhKERhdGFUcmFuc2ZlcnMuVEVYVCwgU3RyaW5nKHRoaXMuZ3JvdXBWaWV3LmxhYmVsKSk7XG5cdFx0fVxuXG5cdFx0Ly8gRHJhZyBJbWFnZVxuXHRcdGlmICh0aGlzLmdyb3VwVmlldy5hY3RpdmVFZGl0b3IpIHtcblx0XHRcdGxldCBsYWJlbCA9IHRoaXMuZ3JvdXBWaWV3LmFjdGl2ZUVkaXRvci5nZXROYW1lKCk7XG5cdFx0XHRpZiAodGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLnNob3dUYWJzID09PSAnbXVsdGlwbGUnICYmIHRoaXMuZ3JvdXBWaWV3LmNvdW50ID4gMSkge1xuXHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdkcmFnZ2VkRWRpdG9yR3JvdXAnLCBcInswfSAoK3sxfSlcIiwgbGFiZWwsIHRoaXMuZ3JvdXBWaWV3LmNvdW50IC0gMSk7XG5cdFx0XHR9XG5cblx0XHRcdGFwcGx5RHJhZ0ltYWdlKGUsIGVsZW1lbnQsIGxhYmVsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaXNOZXdXaW5kb3dPcGVyYXRpb247XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgb25Hcm91cERyYWdFbmQoZTogRHJhZ0V2ZW50LCBwcmV2aW91c0RyYWdFdmVudDogRHJhZ0V2ZW50IHwgdW5kZWZpbmVkLCBlbGVtZW50OiBIVE1MRWxlbWVudCwgaXNOZXdXaW5kb3dPcGVyYXRpb246IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmdyb3VwVHJhbnNmZXIuY2xlYXJEYXRhKERyYWdnZWRFZGl0b3JHcm91cElkZW50aWZpZXIucHJvdG90eXBlKTtcblxuXHRcdGlmIChcblx0XHRcdGUudGFyZ2V0ICE9PSBlbGVtZW50IHx8XG5cdFx0XHQhaXNOZXdXaW5kb3dPcGVyYXRpb24gfHxcblx0XHRcdGlzV2luZG93RHJhZ2dlZE92ZXIoKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuOyAvLyBkcmFnIHRvIG9wZW4gaW4gbmV3IHdpbmRvdyBpcyBkaXNhYmxlZFxuXHRcdH1cblxuXHRcdGNvbnN0IGF1eGlsaWFyeUVkaXRvclBhcnQgPSBhd2FpdCB0aGlzLm1heWJlQ3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydEF0KGUsIGVsZW1lbnQpO1xuXHRcdGlmICghYXV4aWxpYXJ5RWRpdG9yUGFydCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldEdyb3VwID0gYXV4aWxpYXJ5RWRpdG9yUGFydC5hY3RpdmVHcm91cDtcblx0XHR0aGlzLmdyb3Vwc1ZpZXcubWVyZ2VHcm91cCh0aGlzLmdyb3VwVmlldywgdGFyZ2V0R3JvdXAuaWQsIHtcblx0XHRcdG1vZGU6IHRoaXMuaXNNb3ZlT3BlcmF0aW9uKHByZXZpb3VzRHJhZ0V2ZW50ID8/IGUsIHRhcmdldEdyb3VwLmlkKSA/IE1lcmdlR3JvdXBNb2RlLk1PVkVfRURJVE9SUyA6IE1lcmdlR3JvdXBNb2RlLkNPUFlfRURJVE9SU1xuXHRcdH0pO1xuXG5cdFx0dGFyZ2V0R3JvdXAuZm9jdXMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBtYXliZUNyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnRBdChlOiBEcmFnRXZlbnQsIG9mZnNldEVsZW1lbnQ6IEhUTUxFbGVtZW50KTogUHJvbWlzZTxJQXV4aWxpYXJ5RWRpdG9yUGFydCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHsgcG9pbnQsIGRpc3BsYXkgfSA9IGF3YWl0IHRoaXMuaG9zdFNlcnZpY2UuZ2V0Q3Vyc29yU2NyZWVuUG9pbnQoKSA/PyB7IHBvaW50OiB7IHg6IGUuc2NyZWVuWCwgeTogZS5zY3JlZW5ZIH0gfTtcblx0XHRjb25zdCB3aW5kb3cgPSBnZXRBY3RpdmVXaW5kb3coKTtcblx0XHRpZiAod2luZG93LmRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSA9PT0gJ3Zpc2libGUnICYmIHdpbmRvdy5kb2N1bWVudC5oYXNGb2N1cygpKSB7XG5cdFx0XHRpZiAocG9pbnQueCA+PSB3aW5kb3cuc2NyZWVuWCAmJiBwb2ludC54IDw9IHdpbmRvdy5zY3JlZW5YICsgd2luZG93Lm91dGVyV2lkdGggJiYgcG9pbnQueSA+PSB3aW5kb3cuc2NyZWVuWSAmJiBwb2ludC55IDw9IHdpbmRvdy5zY3JlZW5ZICsgd2luZG93Lm91dGVySGVpZ2h0KSB7XG5cdFx0XHRcdHJldHVybjsgLy8gcmVmdXNlIHRvIGNyZWF0ZSBhcyBsb25nIGFzIHRoZSBtb3VzZSB3YXMgcmVsZWFzZWQgb3ZlciBhY3RpdmUgZm9jdXNlZCB3aW5kb3cgdG8gcmVkdWNlIGNoYW5jZSBvZiBvcGVuaW5nIGJ5IGFjY2lkZW50XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb2Zmc2V0WCA9IG9mZnNldEVsZW1lbnQub2Zmc2V0V2lkdGggLyAyO1xuXHRcdGNvbnN0IG9mZnNldFkgPSAzMC8qIHRha2UgdGl0bGUgYmFyIGhlaWdodCBpbnRvIGFjY291bnQgKGFwcHJveGltYXRpb24pICovICsgb2Zmc2V0RWxlbWVudC5vZmZzZXRIZWlnaHQgLyAyO1xuXG5cdFx0Y29uc3QgYm91bmRzID0ge1xuXHRcdFx0eDogcG9pbnQueCAtIG9mZnNldFgsXG5cdFx0XHR5OiBwb2ludC55IC0gb2Zmc2V0WVxuXHRcdH07XG5cblx0XHRpZiAoZGlzcGxheSkge1xuXHRcdFx0aWYgKGJvdW5kcy54IDwgZGlzcGxheS54KSB7XG5cdFx0XHRcdGJvdW5kcy54ID0gZGlzcGxheS54OyAvLyBwcmV2ZW50IG92ZXJmbG93IHRvIHRoZSBsZWZ0XG5cdFx0XHR9XG5cblx0XHRcdGlmIChib3VuZHMueSA8IGRpc3BsYXkueSkge1xuXHRcdFx0XHRib3VuZHMueSA9IGRpc3BsYXkueTsgLy8gcHJldmVudCBvdmVyZmxvdyB0byB0aGUgdG9wXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yUGFydHNWaWV3LmNyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnQoeyBib3VuZHMgfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgaXNOZXdXaW5kb3dPcGVyYXRpb24oZTogRHJhZ0V2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5kcmFnVG9PcGVuV2luZG93KSB7XG5cdFx0XHRyZXR1cm4gIWUuYWx0S2V5O1xuXHRcdH1cblxuXHRcdHJldHVybiBlLmFsdEtleTtcblx0fVxuXG5cdHByb3RlY3RlZCBpc01vdmVPcGVyYXRpb24oZTogRHJhZ0V2ZW50LCBzb3VyY2VHcm91cDogR3JvdXBJZGVudGlmaWVyLCBzb3VyY2VFZGl0b3I/OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGlmIChzb3VyY2VFZGl0b3I/Lmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuU2luZ2xldG9uKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIFNpbmdsZXRvbiBlZGl0b3JzIGNhbm5vdCBiZSBzcGxpdFxuXHRcdH1cblxuXHRcdGNvbnN0IGlzQ29weSA9IChlLmN0cmxLZXkgJiYgIWlzTWFjaW50b3NoKSB8fCAoZS5hbHRLZXkgJiYgaXNNYWNpbnRvc2gpO1xuXG5cdFx0cmV0dXJuICghaXNDb3B5IHx8IHNvdXJjZUdyb3VwID09PSB0aGlzLmdyb3VwVmlldy5pZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZG9GaWxsUmVzb3VyY2VEYXRhVHJhbnNmZXJzKGVkaXRvcnM6IHJlYWRvbmx5IEVkaXRvcklucHV0W10sIGU6IERyYWdFdmVudCwgZGlzYWJsZVN0YW5kYXJkVHJhbnNmZXI6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAoZWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZmlsbEVkaXRvcnNEcmFnRGF0YSwgZWRpdG9ycy5tYXAoZWRpdG9yID0+ICh7IGVkaXRvciwgZ3JvdXBJZDogdGhpcy5ncm91cFZpZXcuaWQgfSkpLCBlLCB7IGRpc2FibGVTdGFuZGFyZFRyYW5zZmVyIH0pO1xuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25UYWJDb250ZXh0TWVudShlZGl0b3I6IEVkaXRvcklucHV0LCBlOiBFdmVudCwgbm9kZTogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblxuXHRcdC8vIFVwZGF0ZSBjb250ZXh0cyBiYXNlZCBvbiBlZGl0b3IgcGlja2VkIGFuZCByZW1lbWJlciBwcmV2aW91cyB0byByZXN0b3JlXG5cdFx0dGhpcy5yZXNvdXJjZUNvbnRleHQuc2V0KEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSkpO1xuXHRcdHRoaXMuZWRpdG9yUGlubmVkQ29udGV4dC5zZXQodGhpcy50YWJzTW9kZWwuaXNQaW5uZWQoZWRpdG9yKSk7XG5cdFx0dGhpcy5lZGl0b3JJc0ZpcnN0Q29udGV4dC5zZXQodGhpcy50YWJzTW9kZWwuaXNGaXJzdChlZGl0b3IpKTtcblx0XHR0aGlzLmVkaXRvcklzTGFzdENvbnRleHQuc2V0KHRoaXMudGFic01vZGVsLmlzTGFzdChlZGl0b3IpKTtcblx0XHR0aGlzLmVkaXRvclN0aWNreUNvbnRleHQuc2V0KHRoaXMudGFic01vZGVsLmlzU3RpY2t5KGVkaXRvcikpO1xuXHRcdHRoaXMuZWRpdG9yRGlydHlDb250ZXh0LnNldChlZGl0b3IuaXNEaXJ0eSgpICYmICFlZGl0b3IuaXNTYXZpbmcoKSk7XG5cdFx0dGhpcy5ncm91cExvY2tlZENvbnRleHQuc2V0KHRoaXMudGFic01vZGVsLmlzTG9ja2VkKTtcblx0XHR0aGlzLmVkaXRvckNhblNwbGl0SW5Hcm91cENvbnRleHQuc2V0KGVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkNhblNwbGl0SW5Hcm91cCkpO1xuXHRcdHRoaXMuc2lkZUJ5U2lkZUVkaXRvckNvbnRleHQuc2V0KGVkaXRvci50eXBlSWQgPT09IFNpZGVCeVNpZGVFZGl0b3JJbnB1dC5JRCk7XG5cdFx0YXBwbHlBdmFpbGFibGVFZGl0b3JJZHModGhpcy5lZGl0b3JBdmFpbGFibGVFZGl0b3JJZHMsIGVkaXRvciwgdGhpcy5lZGl0b3JSZXNvbHZlclNlcnZpY2UpO1xuXG5cdFx0Ly8gRmluZCB0YXJnZXQgYW5jaG9yXG5cdFx0bGV0IGFuY2hvcjogSFRNTEVsZW1lbnQgfCBTdGFuZGFyZE1vdXNlRXZlbnQgPSBub2RlO1xuXHRcdGlmIChpc01vdXNlRXZlbnQoZSkpIHtcblx0XHRcdGFuY2hvciA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0V2luZG93KG5vZGUpLCBlKTtcblx0XHR9XG5cblx0XHQvLyBTaG93IGl0XG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdFx0bWVudUlkOiBNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LFxuXHRcdFx0bWVudUFjdGlvbk9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUsIGFyZzogdGhpcy5yZXNvdXJjZUNvbnRleHQuZ2V0KCkgfSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLmNvbnRleHRNZW51Q29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gKHsgZ3JvdXBJZDogdGhpcy5ncm91cFZpZXcuaWQsIGVkaXRvckluZGV4OiB0aGlzLmdyb3VwVmlldy5nZXRJbmRleE9mRWRpdG9yKGVkaXRvcikgfSksXG5cdFx0XHRnZXRLZXlCaW5kaW5nOiBhY3Rpb24gPT4gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCwgdGhpcy5jb250ZXh0TWVudUNvbnRleHRLZXlTZXJ2aWNlKSxcblx0XHRcdG9uSGlkZTogKCkgPT4gdGhpcy5ncm91cHNWaWV3LmFjdGl2ZUdyb3VwLmZvY3VzKCkgLy8gcmVzdG9yZSBmb2N1cyB0byBhY3RpdmUgZ3JvdXBcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRLZXliaW5kaW5nKGFjdGlvbjogSUFjdGlvbik6IFJlc29sdmVkS2V5YmluZGluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQsIHRoaXMuZ2V0RWRpdG9yUGFuZUF3YXJlQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0S2V5YmluZGluZ0xhYmVsKGFjdGlvbjogSUFjdGlvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMuZ2V0S2V5YmluZGluZyhhY3Rpb24pO1xuXG5cdFx0cmV0dXJuIGtleWJpbmRpbmcgPyBrZXliaW5kaW5nLmdldExhYmVsKCkgPz8gdW5kZWZpbmVkIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldCB0YWJIZWlnaHQoKSB7XG5cdFx0Y29uc3QgaXNDb21wYWN0ID0gdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLnRhYkhlaWdodCA9PT0gJ2NvbXBhY3QnO1xuXHRcdC8vIEluIHN0eWxlLW92ZXJyaWRlIG11bHRpLXRhYiBtb2RlIHRoZSB0YWJzLWFuZC1hY3Rpb25zLWNvbnRhaW5lciBnYWlucyBleHRyYVxuXHRcdC8vIHBhZGRpbmcgKHRhYnMuY3NzKSwgc28gdGhlIHRvdGFsIGhlaWdodCBkaWZmZXJzIGZyb20gdGhlIGJhc2UgdmFsdWVzLlxuXHRcdC8vIFRoZSBgLnRhYnNgIGNsYXNzIGlzIHByZXNlbnQgb25seSB3aGVuIHNob3dUYWJzID09PSAnbXVsdGlwbGUnOyBzaW5nbGUtdGFiXG5cdFx0Ly8gYW5kIG5vLXRhYiBtb2RlcyBhcmUgbm90IGFmZmVjdGVkIGJ5IHRob3NlIENTUyBvdmVycmlkZXMuXG5cdFx0aWYgKHRoaXMucGFyZW50LmNsYXNzTGlzdC5jb250YWlucygndGFicycpICYmIHRoaXMucGFyZW50LmNsb3Nlc3QoJy5zdHlsZS1vdmVycmlkZScpKSB7XG5cdFx0XHRyZXR1cm4gaXNDb21wYWN0ID8gRWRpdG9yVGFic0NvbnRyb2wuRURJVE9SX1RBQl9IRUlHSFQuc3R5bGVPdmVycmlkZUNvbXBhY3QgOiBFZGl0b3JUYWJzQ29udHJvbC5FRElUT1JfVEFCX0hFSUdIVC5zdHlsZU92ZXJyaWRlO1xuXHRcdH1cblx0XHRyZXR1cm4gaXNDb21wYWN0ID8gRWRpdG9yVGFic0NvbnRyb2wuRURJVE9SX1RBQl9IRUlHSFQuY29tcGFjdCA6IEVkaXRvclRhYnNDb250cm9sLkVESVRPUl9UQUJfSEVJR0hULm5vcm1hbDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRIb3ZlclRpdGxlKGVkaXRvcjogRWRpdG9ySW5wdXQpOiBzdHJpbmcgfCBJTWFuYWdlZEhvdmVyVG9vbHRpcE1hcmtkb3duU3RyaW5nIHtcblx0XHRjb25zdCB0aXRsZSA9IGVkaXRvci5nZXRUaXRsZShWZXJib3NpdHkuTE9ORyk7XG5cdFx0aWYgKCF0aGlzLnRhYnNNb2RlbC5pc1Bpbm5lZChlZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRtYXJrZG93bjogbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlLCBpc1RydXN0ZWQ6IHRydWUgfSkuXG5cdFx0XHRcdFx0YXBwZW5kVGV4dCh0aXRsZSkuXG5cdFx0XHRcdFx0YXBwZW5kTWFya2Rvd24oJyAoX3ByZXZpZXdfIFskKGdlYXIpXShjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzPyU1QiUyMndvcmtiZW5jaC5lZGl0b3IuZW5hYmxlUHJldmlldyUyMiU1RCBcIkNvbmZpZ3VyZSBQcmV2aWV3IE1vZGVcIikpJyksXG5cdFx0XHRcdG1hcmtkb3duTm90U3VwcG9ydGVkRmFsbGJhY2s6IHRpdGxlICsgJyAocHJldmlldyknXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gdGl0bGU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlVGFiSGVpZ2h0KCk6IHZvaWQge1xuXHRcdHRoaXMucGFyZW50LnN0eWxlLnNldFByb3BlcnR5KCctLWVkaXRvci1ncm91cC10YWItaGVpZ2h0JywgYCR7dGhpcy50YWJIZWlnaHR9cHhgKTtcblx0XHQvLyBTaWduYWwgY29tcGFjdCBtb2RlIHZpYSBhIENTUyBjbGFzcyBzbyB0aGUgc3R5bGUtb3ZlcnJpZGUgcnVsZXMgaW4gdGFicy5jc3Ncblx0XHQvLyBjYW4gYXBwbHkgYSBwcm9wb3J0aW9uYWxseSBzbWFsbGVyIC0tZWRpdG9yLWdyb3VwLXRhYi1oZWlnaHQgdmFsdWUuXG5cdFx0dGhpcy5wYXJlbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY29tcGFjdC1oZWlnaHQnLCB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMudGFiSGVpZ2h0ID09PSAnY29tcGFjdCcpO1xuXHR9XG5cblx0dXBkYXRlT3B0aW9ucyhvbGRPcHRpb25zOiBJRWRpdG9yUGFydE9wdGlvbnMsIG5ld09wdGlvbnM6IElFZGl0b3JQYXJ0T3B0aW9ucyk6IHZvaWQge1xuXG5cdFx0Ly8gVXBkYXRlIHRhYiBoZWlnaHRcblx0XHRpZiAob2xkT3B0aW9ucy50YWJIZWlnaHQgIT09IG5ld09wdGlvbnMudGFiSGVpZ2h0KSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRhYkhlaWdodCgpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBFZGl0b3IgQWN0aW9ucyBUb29sYmFyXG5cdFx0aWYgKFxuXHRcdFx0b2xkT3B0aW9ucy5lZGl0b3JBY3Rpb25zTG9jYXRpb24gIT09IG5ld09wdGlvbnMuZWRpdG9yQWN0aW9uc0xvY2F0aW9uIHx8XG5cdFx0XHRvbGRPcHRpb25zLnNob3dUYWJzICE9PSBuZXdPcHRpb25zLnNob3dUYWJzXG5cdFx0KSB7XG5cdFx0XHRpZiAodGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhckNvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLmhhbmRsZUVkaXRvckFjdGlvblRvb2xCYXJWaXNpYmlsaXR5KHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJDb250YWluZXIpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUVkaXRvckFjdGlvbnNUb29sYmFyKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhckNvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLmhhbmRsZUVkaXRvckxheW91dEFjdGlvbnNUb29sQmFyVmlzaWJpbGl0eSh0aGlzLmVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyQ29udGFpbmVyKTtcblx0XHRcdFx0dGhpcy51cGRhdGVFZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhcigpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFic3RyYWN0IG9wZW5FZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGJvb2xlYW47XG5cblx0YWJzdHJhY3Qgb3BlbkVkaXRvcnMoZWRpdG9yczogRWRpdG9ySW5wdXRbXSk6IGJvb2xlYW47XG5cblx0YWJzdHJhY3QgYmVmb3JlQ2xvc2VFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQ7XG5cblx0YWJzdHJhY3QgY2xvc2VFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQ7XG5cblx0YWJzdHJhY3QgY2xvc2VFZGl0b3JzKGVkaXRvcnM6IEVkaXRvcklucHV0W10pOiB2b2lkO1xuXG5cdGFic3RyYWN0IG1vdmVFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCwgZnJvbUluZGV4OiBudW1iZXIsIHRhcmdldEluZGV4OiBudW1iZXIpOiB2b2lkO1xuXG5cdGFic3RyYWN0IHBpbkVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZDtcblxuXHRhYnN0cmFjdCBzdGlja0VkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZDtcblxuXHRhYnN0cmFjdCB1bnN0aWNrRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkO1xuXG5cdGFic3RyYWN0IHNldEFjdGl2ZShpc0FjdGl2ZTogYm9vbGVhbik6IHZvaWQ7XG5cblx0YWJzdHJhY3QgdXBkYXRlRWRpdG9yU2VsZWN0aW9ucygpOiB2b2lkO1xuXG5cdGFic3RyYWN0IHVwZGF0ZUVkaXRvckxhYmVsKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkO1xuXG5cdGFic3RyYWN0IHVwZGF0ZUVkaXRvckRpcnR5KGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkO1xuXG5cdGFic3RyYWN0IGxheW91dChkaW1lbnNpb25zOiBJRWRpdG9yVGl0bGVDb250cm9sRGltZW5zaW9ucyk6IERpbWVuc2lvbjtcblxuXHRhYnN0cmFjdCBnZXRIZWlnaHQoKTogbnVtYmVyO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxHQUFjLGlCQUFpQixXQUFXLGNBQWMscUJBQXFCO0FBQ3RGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQXFDLHNCQUFzQjtBQUNwRSxTQUFrQixvQkFBb0I7QUFFdEMsU0FBUyx1QkFBb0M7QUFDN0MsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxjQUFjLGNBQWM7QUFDckMsU0FBUywwQkFBdUM7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlLGdCQUFnQjtBQUN4QyxTQUFTLDhCQUF1RCxxQkFBcUIsMkJBQTJCO0FBQ2hILFNBQVMsa0JBQWtCO0FBRTNCLFNBQWlDLHdCQUE0QyxrQkFBa0IsY0FBYyx5QkFBMkQsaUJBQWlCO0FBRXpMLFNBQVMsb0JBQW9CLDJCQUEyQiwyQkFBMkIsMEJBQTBCLGdDQUFnQyxvQ0FBb0MsK0JBQStCLGlDQUFpQyx1Q0FBdUMseUJBQXlCLHNDQUFzQztBQUN2VixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2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
