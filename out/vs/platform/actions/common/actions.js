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
import { SubmenuAction } from "../../../base/common/actions.js";
import { MicrotaskEmitter } from "../../../base/common/event.js";
import { DisposableStore, dispose, markAsSingleton, toDisposable } from "../../../base/common/lifecycle.js";
import { LinkedList } from "../../../base/common/linkedList.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { CommandsRegistry, ICommandService } from "../../commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../contextkey/common/contextkey.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { KeybindingsRegistry } from "../../keybinding/common/keybindingsRegistry.js";
function isIMenuItem(item) {
  return item.command !== void 0;
}
function isISubmenuItem(item) {
  return item.submenu !== void 0;
}
const _MenuId = class _MenuId {
  /**
   * Create or reuse a `MenuId` with the given identifier
   */
  static for(identifier) {
    return _MenuId._instances.get(identifier) ?? new _MenuId(identifier);
  }
  /**
   * Create a new `MenuId` with the unique identifier. Will throw if a menu
   * with the identifier already exists, use `MenuId.for(ident)` or a unique
   * identifier
   */
  constructor(identifier) {
    if (_MenuId._instances.has(identifier)) {
      throw new TypeError(`MenuId with identifier '${identifier}' already exists. Use MenuId.for(ident) or a unique identifier`);
    }
    _MenuId._instances.set(identifier, this);
    this.id = identifier;
  }
};
_MenuId._instances = /* @__PURE__ */ new Map();
_MenuId.CommandPalette = new _MenuId("CommandPalette");
_MenuId.DebugBreakpointsContext = new _MenuId("DebugBreakpointsContext");
_MenuId.DebugCallStackContext = new _MenuId("DebugCallStackContext");
_MenuId.DebugConsoleContext = new _MenuId("DebugConsoleContext");
_MenuId.DebugVariablesContext = new _MenuId("DebugVariablesContext");
_MenuId.NotebookVariablesContext = new _MenuId("NotebookVariablesContext");
_MenuId.DebugHoverContext = new _MenuId("DebugHoverContext");
_MenuId.DebugWatchContext = new _MenuId("DebugWatchContext");
_MenuId.DebugToolBar = new _MenuId("DebugToolBar");
_MenuId.DebugToolBarStop = new _MenuId("DebugToolBarStop");
_MenuId.DebugDisassemblyContext = new _MenuId("DebugDisassemblyContext");
_MenuId.DebugCallStackToolbar = new _MenuId("DebugCallStackToolbar");
_MenuId.DebugCreateConfiguration = new _MenuId("DebugCreateConfiguration");
_MenuId.DebugScopesContext = new _MenuId("DebugScopesContext");
_MenuId.EditorContext = new _MenuId("EditorContext");
_MenuId.SimpleEditorContext = new _MenuId("SimpleEditorContext");
_MenuId.EditorContent = new _MenuId("EditorContent");
_MenuId.EditorLineNumberContext = new _MenuId("EditorLineNumberContext");
_MenuId.EditorContextCopy = new _MenuId("EditorContextCopy");
_MenuId.EditorContextPeek = new _MenuId("EditorContextPeek");
_MenuId.EditorContextShare = new _MenuId("EditorContextShare");
_MenuId.EditorTitle = new _MenuId("EditorTitle");
_MenuId.EditorTitleLayout = new _MenuId("EditorTitleLayout");
_MenuId.ModalEditorTitle = new _MenuId("ModalEditorTitle");
_MenuId.ModalEditorTitleContext = new _MenuId("ModalEditorTitleContext");
_MenuId.ModalEditorEditorTitle = new _MenuId("ModalEditorEditorTitle");
_MenuId.CompactWindowEditorTitle = new _MenuId("CompactWindowEditorTitle");
_MenuId.EditorTitleRun = new _MenuId("EditorTitleRun");
_MenuId.EditorTitleContext = new _MenuId("EditorTitleContext");
_MenuId.EditorTitleContextShare = new _MenuId("EditorTitleContextShare");
_MenuId.EmptyEditorGroup = new _MenuId("EmptyEditorGroup");
_MenuId.EmptyEditorGroupContext = new _MenuId("EmptyEditorGroupContext");
_MenuId.EditorGroupWatermarkToolbar = new _MenuId("EditorGroupWatermarkToolbar");
_MenuId.EditorTabsBarContext = new _MenuId("EditorTabsBarContext");
_MenuId.EditorTabsBarShowTabsSubmenu = new _MenuId("EditorTabsBarShowTabsSubmenu");
_MenuId.EditorTabsBarShowTabsZenModeSubmenu = new _MenuId("EditorTabsBarShowTabsZenModeSubmenu");
_MenuId.EditorActionsPositionSubmenu = new _MenuId("EditorActionsPositionSubmenu");
_MenuId.EditorRenderWhitespaceSubmenu = new _MenuId("EditorRenderWhitespaceSubmenu");
_MenuId.EditorSplitMoveSubmenu = new _MenuId("EditorSplitMoveSubmenu");
_MenuId.ExplorerContext = new _MenuId("ExplorerContext");
_MenuId.ExplorerContextShare = new _MenuId("ExplorerContextShare");
_MenuId.ExtensionContext = new _MenuId("ExtensionContext");
_MenuId.ExtensionEditorContextMenu = new _MenuId("ExtensionEditorContextMenu");
_MenuId.GlobalActivity = new _MenuId("GlobalActivity");
_MenuId.CommandCenter = new _MenuId("CommandCenter");
_MenuId.CommandCenterCenter = new _MenuId("CommandCenterCenter");
_MenuId.LayoutControlMenuSubmenu = new _MenuId("LayoutControlMenuSubmenu");
_MenuId.LayoutControlMenu = new _MenuId("LayoutControlMenu");
_MenuId.MenubarMainMenu = new _MenuId("MenubarMainMenu");
_MenuId.MenubarAppearanceMenu = new _MenuId("MenubarAppearanceMenu");
_MenuId.MenubarDebugMenu = new _MenuId("MenubarDebugMenu");
_MenuId.MenubarEditMenu = new _MenuId("MenubarEditMenu");
_MenuId.MenubarCopy = new _MenuId("MenubarCopy");
_MenuId.MenubarFileMenu = new _MenuId("MenubarFileMenu");
_MenuId.MenubarGoMenu = new _MenuId("MenubarGoMenu");
_MenuId.MenubarHelpMenu = new _MenuId("MenubarHelpMenu");
_MenuId.MenubarLayoutMenu = new _MenuId("MenubarLayoutMenu");
_MenuId.MenubarNewBreakpointMenu = new _MenuId("MenubarNewBreakpointMenu");
_MenuId.PanelAlignmentMenu = new _MenuId("PanelAlignmentMenu");
_MenuId.PanelPositionMenu = new _MenuId("PanelPositionMenu");
_MenuId.ActivityBarPositionMenu = new _MenuId("ActivityBarPositionMenu");
_MenuId.NotificationsCenterPositionMenu = new _MenuId("NotificationsCenterPositionMenu");
_MenuId.MenubarPreferencesMenu = new _MenuId("MenubarPreferencesMenu");
_MenuId.MenubarRecentMenu = new _MenuId("MenubarRecentMenu");
_MenuId.MenubarSelectionMenu = new _MenuId("MenubarSelectionMenu");
_MenuId.MenubarShare = new _MenuId("MenubarShare");
_MenuId.MenubarSwitchEditorMenu = new _MenuId("MenubarSwitchEditorMenu");
_MenuId.MenubarSwitchGroupMenu = new _MenuId("MenubarSwitchGroupMenu");
_MenuId.MenubarTerminalMenu = new _MenuId("MenubarTerminalMenu");
_MenuId.MenubarTerminalSuggestStatusMenu = new _MenuId("MenubarTerminalSuggestStatusMenu");
_MenuId.MenubarViewMenu = new _MenuId("MenubarViewMenu");
_MenuId.MenubarHomeMenu = new _MenuId("MenubarHomeMenu");
_MenuId.OpenEditorsContext = new _MenuId("OpenEditorsContext");
_MenuId.OpenEditorsContextShare = new _MenuId("OpenEditorsContextShare");
_MenuId.ProblemsPanelContext = new _MenuId("ProblemsPanelContext");
_MenuId.SCMInputBox = new _MenuId("SCMInputBox");
_MenuId.SCMChangeContext = new _MenuId("SCMChangeContext");
_MenuId.SCMResourceContext = new _MenuId("SCMResourceContext");
_MenuId.SCMResourceContextShare = new _MenuId("SCMResourceContextShare");
_MenuId.SCMResourceFolderContext = new _MenuId("SCMResourceFolderContext");
_MenuId.SCMResourceGroupContext = new _MenuId("SCMResourceGroupContext");
_MenuId.SCMSourceControl = new _MenuId("SCMSourceControl");
_MenuId.SCMSourceControlInline = new _MenuId("SCMSourceControlInline");
_MenuId.SCMSourceControlTitle = new _MenuId("SCMSourceControlTitle");
_MenuId.SCMHistoryTitle = new _MenuId("SCMHistoryTitle");
_MenuId.SCMHistoryItemContext = new _MenuId("SCMHistoryItemContext");
_MenuId.SCMHistoryItemChangeContext = new _MenuId("SCMHistoryItemChangeContext");
_MenuId.SCMHistoryItemRefContext = new _MenuId("SCMHistoryItemRefContext");
_MenuId.SCMArtifactGroupContext = new _MenuId("SCMArtifactGroupContext");
_MenuId.SCMArtifactContext = new _MenuId("SCMArtifactContext");
_MenuId.SCMQuickDiffDecorations = new _MenuId("SCMQuickDiffDecorations");
_MenuId.SCMTitle = new _MenuId("SCMTitle");
_MenuId.SearchContext = new _MenuId("SearchContext");
_MenuId.SearchActionMenu = new _MenuId("SearchActionContext");
_MenuId.StatusBarWindowIndicatorMenu = new _MenuId("StatusBarWindowIndicatorMenu");
_MenuId.StatusBarRemoteIndicatorMenu = new _MenuId("StatusBarRemoteIndicatorMenu");
_MenuId.StickyScrollContext = new _MenuId("StickyScrollContext");
_MenuId.TestItem = new _MenuId("TestItem");
_MenuId.TestItemGutter = new _MenuId("TestItemGutter");
_MenuId.TestProfilesContext = new _MenuId("TestProfilesContext");
_MenuId.TestMessageContext = new _MenuId("TestMessageContext");
_MenuId.TestMessageContent = new _MenuId("TestMessageContent");
_MenuId.TestPeekElement = new _MenuId("TestPeekElement");
_MenuId.TestPeekTitle = new _MenuId("TestPeekTitle");
_MenuId.TestCallStack = new _MenuId("TestCallStack");
_MenuId.TestCoverageFilterItem = new _MenuId("TestCoverageFilterItem");
_MenuId.TouchBarContext = new _MenuId("TouchBarContext");
_MenuId.TitleBar = new _MenuId("TitleBar");
_MenuId.TitleBarAdjacentCenter = new _MenuId("TitleBarAdjacentCenter");
_MenuId.TitleBarContext = new _MenuId("TitleBarContext");
_MenuId.TitleBarTitleContext = new _MenuId("TitleBarTitleContext");
_MenuId.TunnelContext = new _MenuId("TunnelContext");
_MenuId.TunnelPrivacy = new _MenuId("TunnelPrivacy");
_MenuId.TunnelProtocol = new _MenuId("TunnelProtocol");
_MenuId.TunnelPortInline = new _MenuId("TunnelInline");
_MenuId.TunnelTitle = new _MenuId("TunnelTitle");
_MenuId.TunnelLocalAddressInline = new _MenuId("TunnelLocalAddressInline");
_MenuId.TunnelOriginInline = new _MenuId("TunnelOriginInline");
_MenuId.ViewItemContext = new _MenuId("ViewItemContext");
_MenuId.ViewContainerTitle = new _MenuId("ViewContainerTitle");
_MenuId.ViewContainerTitleContext = new _MenuId("ViewContainerTitleContext");
_MenuId.ViewTitle = new _MenuId("ViewTitle");
_MenuId.ViewTitleContext = new _MenuId("ViewTitleContext");
_MenuId.CommentEditorActions = new _MenuId("CommentEditorActions");
_MenuId.CommentThreadTitle = new _MenuId("CommentThreadTitle");
_MenuId.CommentThreadActions = new _MenuId("CommentThreadActions");
_MenuId.CommentThreadAdditionalActions = new _MenuId("CommentThreadAdditionalActions");
_MenuId.CommentThreadTitleContext = new _MenuId("CommentThreadTitleContext");
_MenuId.CommentThreadCommentContext = new _MenuId("CommentThreadCommentContext");
_MenuId.CommentTitle = new _MenuId("CommentTitle");
_MenuId.CommentActions = new _MenuId("CommentActions");
_MenuId.CommentsViewThreadActions = new _MenuId("CommentsViewThreadActions");
_MenuId.InteractiveToolbar = new _MenuId("InteractiveToolbar");
_MenuId.InteractiveCellTitle = new _MenuId("InteractiveCellTitle");
_MenuId.InteractiveCellDelete = new _MenuId("InteractiveCellDelete");
_MenuId.InteractiveCellExecute = new _MenuId("InteractiveCellExecute");
_MenuId.InteractiveInputExecute = new _MenuId("InteractiveInputExecute");
_MenuId.InteractiveInputConfig = new _MenuId("InteractiveInputConfig");
_MenuId.ReplInputExecute = new _MenuId("ReplInputExecute");
_MenuId.IssueReporter = new _MenuId("IssueReporter");
_MenuId.NotebookToolbar = new _MenuId("NotebookToolbar");
_MenuId.NotebookToolbarContext = new _MenuId("NotebookToolbarContext");
_MenuId.NotebookStickyScrollContext = new _MenuId("NotebookStickyScrollContext");
_MenuId.NotebookCellTitle = new _MenuId("NotebookCellTitle");
_MenuId.NotebookCellDelete = new _MenuId("NotebookCellDelete");
_MenuId.NotebookCellInsert = new _MenuId("NotebookCellInsert");
_MenuId.NotebookCellBetween = new _MenuId("NotebookCellBetween");
_MenuId.NotebookCellListTop = new _MenuId("NotebookCellTop");
_MenuId.NotebookCellExecute = new _MenuId("NotebookCellExecute");
_MenuId.NotebookCellExecuteGoTo = new _MenuId("NotebookCellExecuteGoTo");
_MenuId.NotebookCellExecutePrimary = new _MenuId("NotebookCellExecutePrimary");
_MenuId.NotebookDiffCellInputTitle = new _MenuId("NotebookDiffCellInputTitle");
_MenuId.NotebookDiffDocumentMetadata = new _MenuId("NotebookDiffDocumentMetadata");
_MenuId.NotebookDiffCellMetadataTitle = new _MenuId("NotebookDiffCellMetadataTitle");
_MenuId.NotebookDiffCellOutputsTitle = new _MenuId("NotebookDiffCellOutputsTitle");
_MenuId.NotebookOutputToolbar = new _MenuId("NotebookOutputToolbar");
_MenuId.NotebookOutlineFilter = new _MenuId("NotebookOutlineFilter");
_MenuId.NotebookOutlineActionMenu = new _MenuId("NotebookOutlineActionMenu");
_MenuId.NotebookEditorLayoutConfigure = new _MenuId("NotebookEditorLayoutConfigure");
_MenuId.NotebookKernelSource = new _MenuId("NotebookKernelSource");
_MenuId.BulkEditTitle = new _MenuId("BulkEditTitle");
_MenuId.BulkEditContext = new _MenuId("BulkEditContext");
_MenuId.TimelineItemContext = new _MenuId("TimelineItemContext");
_MenuId.TimelineTitle = new _MenuId("TimelineTitle");
_MenuId.TimelineTitleContext = new _MenuId("TimelineTitleContext");
_MenuId.TimelineFilterSubMenu = new _MenuId("TimelineFilterSubMenu");
_MenuId.AccountsContext = new _MenuId("AccountsContext");
_MenuId.SidebarTitle = new _MenuId("SidebarTitle");
_MenuId.PanelTitle = new _MenuId("PanelTitle");
_MenuId.AuxiliaryBarTitle = new _MenuId("AuxiliaryBarTitle");
_MenuId.TerminalInstanceContext = new _MenuId("TerminalInstanceContext");
_MenuId.TerminalEditorInstanceContext = new _MenuId("TerminalEditorInstanceContext");
_MenuId.TerminalNewDropdownContext = new _MenuId("TerminalNewDropdownContext");
_MenuId.TerminalTabContext = new _MenuId("TerminalTabContext");
_MenuId.TerminalTabEmptyAreaContext = new _MenuId("TerminalTabEmptyAreaContext");
_MenuId.TerminalStickyScrollContext = new _MenuId("TerminalStickyScrollContext");
_MenuId.WebviewContext = new _MenuId("WebviewContext");
_MenuId.InlineCompletionsActions = new _MenuId("InlineCompletionsActions");
_MenuId.InlineEditsActions = new _MenuId("InlineEditsActions");
_MenuId.NewFile = new _MenuId("NewFile");
_MenuId.MergeInput1Toolbar = new _MenuId("MergeToolbar1Toolbar");
_MenuId.MergeInput2Toolbar = new _MenuId("MergeToolbar2Toolbar");
_MenuId.MergeBaseToolbar = new _MenuId("MergeBaseToolbar");
_MenuId.MergeInputResultToolbar = new _MenuId("MergeToolbarResultToolbar");
_MenuId.InlineSuggestionToolbar = new _MenuId("InlineSuggestionToolbar");
_MenuId.InlineEditToolbar = new _MenuId("InlineEditToolbar");
_MenuId.ChatContext = new _MenuId("ChatContext");
_MenuId.ChatCodeBlock = new _MenuId("ChatCodeblock");
_MenuId.ChatCompareBlock = new _MenuId("ChatCompareBlock");
_MenuId.ChatMessageTitle = new _MenuId("ChatMessageTitle");
_MenuId.ChatWelcomeContext = new _MenuId("ChatWelcomeContext");
_MenuId.ChatMessageFooter = new _MenuId("ChatMessageFooter");
_MenuId.ChatSubagentContent = new _MenuId("ChatSubagentContent");
_MenuId.ChatExecute = new _MenuId("ChatExecute");
_MenuId.ChatExecuteQueue = new _MenuId("ChatExecuteQueue");
_MenuId.ChatInput = new _MenuId("ChatInput");
_MenuId.ChatInputSecondary = new _MenuId("ChatInputSecondary");
_MenuId.ChatInputStatus = new _MenuId("ChatInputStatus");
_MenuId.ChatInputSide = new _MenuId("ChatInputSide");
_MenuId.AutomationsDialogInput = new _MenuId("AutomationsDialogInput");
_MenuId.ChatModePicker = new _MenuId("ChatModePicker");
_MenuId.ChatEditingWidgetToolbar = new _MenuId("ChatEditingWidgetToolbar");
_MenuId.ChatEditingSessionChangesToolbar = new _MenuId("ChatEditingSessionChangesToolbar");
_MenuId.ChatEditingSessionTitleToolbar = new _MenuId("ChatEditingSessionTitleToolbar");
_MenuId.ChatEditingSessionChangesVersionsSubmenu = new _MenuId("ChatEditingSessionChangesVersionsSubmenu");
_MenuId.ChatEditingSessionChangesFileHeaderToolbar = new _MenuId("ChatEditingSessionChangesFileHeaderToolbar");
_MenuId.ChatEditingSessionChangesFileHeaderRightToolbar = new _MenuId("ChatEditingSessionChangesFileHeaderRightToolbar");
_MenuId.ChatEditingEditorContent = new _MenuId("ChatEditingEditorContent");
_MenuId.ChatEditingEditorHunk = new _MenuId("ChatEditingEditorHunk");
_MenuId.ChatEditingDeletedNotebookCell = new _MenuId("ChatEditingDeletedNotebookCell");
_MenuId.ChatInputAttachmentToolbar = new _MenuId("ChatInputAttachmentToolbar");
_MenuId.ChatEditingWidgetModifiedFilesToolbar = new _MenuId("ChatEditingWidgetModifiedFilesToolbar");
_MenuId.ChatInputResourceAttachmentContext = new _MenuId("ChatInputResourceAttachmentContext");
_MenuId.ChatInputSymbolAttachmentContext = new _MenuId("ChatInputSymbolAttachmentContext");
_MenuId.ChatInlineResourceAnchorContext = new _MenuId("ChatInlineResourceAnchorContext");
_MenuId.ChatInlineSymbolAnchorContext = new _MenuId("ChatInlineSymbolAnchorContext");
_MenuId.ChatMessageCheckpoint = new _MenuId("ChatMessageCheckpoint");
_MenuId.ChatMessageRestoreCheckpoint = new _MenuId("ChatMessageRestoreCheckpoint");
_MenuId.ChatNewMenu = new _MenuId("ChatNewMenu");
_MenuId.ChatEditingCodeBlockContext = new _MenuId("ChatEditingCodeBlockContext");
_MenuId.ChatTitleBarMenu = new _MenuId("ChatTitleBarMenu");
_MenuId.ChatAttachmentsContext = new _MenuId("ChatAttachmentsContext");
_MenuId.ChatTipContext = new _MenuId("ChatTipContext");
_MenuId.ChatTipToolbar = new _MenuId("ChatTipToolbar");
_MenuId.ChatToolOutputResourceToolbar = new _MenuId("ChatToolOutputResourceToolbar");
_MenuId.ChatTextEditorMenu = new _MenuId("ChatTextEditorMenu");
_MenuId.ChatToolOutputResourceContext = new _MenuId("ChatToolOutputResourceContext");
_MenuId.ChatMultiDiffContext = new _MenuId("ChatMultiDiffContext");
_MenuId.ChatConfirmationMenu = new _MenuId("ChatConfirmationMenu");
_MenuId.ChatEditorInlineMenu = new _MenuId("ChatEditorInlineGutter");
_MenuId.ChatEditorInlineExecute = new _MenuId("ChatEditorInputExecute");
_MenuId.ChatEditorInlineInputSide = new _MenuId("ChatEditorInputSide");
_MenuId.InlineChatEditorAffordance = new _MenuId("InlineChatEditorAffordance");
_MenuId.AccessibleView = new _MenuId("AccessibleView");
_MenuId.MultiDiffEditorContent = new _MenuId("MultiDiffEditorContent");
_MenuId.MultiDiffEditorFileToolbar = new _MenuId("MultiDiffEditorFileToolbar");
_MenuId.DiffEditorHunkToolbar = new _MenuId("DiffEditorHunkToolbar");
_MenuId.DiffEditorSelectionToolbar = new _MenuId("DiffEditorSelectionToolbar");
_MenuId.BrowserNavigationToolbar = new _MenuId("BrowserNavigationToolbar");
_MenuId.BrowserActionsToolbar = new _MenuId("BrowserActionsToolbar");
_MenuId.BrowserChatActionsMenu = new _MenuId("BrowserChatActionsMenu");
_MenuId.BrowserEmulationToolbar = new _MenuId("BrowserEmulationToolbar");
_MenuId.AgentSessionsViewerFilterSubMenu = new _MenuId("AgentSessionsViewerFilterSubMenu");
_MenuId.AgentSessionsContext = new _MenuId("AgentSessionsContext");
_MenuId.AgentSessionSectionContext = new _MenuId("AgentSessionSectionContext");
_MenuId.AgentSessionsCreateSubMenu = new _MenuId("AgentSessionsCreateSubMenu");
_MenuId.AgentSessionsToolbar = new _MenuId("AgentSessionsToolbar");
_MenuId.AgentSessionItemToolbar = new _MenuId("AgentSessionItemToolbar");
_MenuId.AgentSessionSectionToolbar = new _MenuId("AgentSessionSectionToolbar");
_MenuId.SessionItemContextMenu = new _MenuId("SessionItemContextMenu");
_MenuId.SessionHeaderContext = new _MenuId("SessionsSessionHeaderContext");
_MenuId.AgentsTitleBarControlMenu = new _MenuId("AgentsTitleBarControlMenu");
_MenuId.AgentsChangesToolbar = new _MenuId("AgentsChangesToolbar");
_MenuId.AgentsChangesPrimaryActionSubMenu = new _MenuId("AgentsChangesPrimaryActionSubMenu");
_MenuId.AgentsChangeInlineToolbar = new _MenuId("AgentsChangeInlineToolbar");
_MenuId.ChatViewSessionTitleNavigationToolbar = new _MenuId("ChatViewSessionTitleNavigationToolbar");
_MenuId.ChatViewSessionTitleToolbar = new _MenuId("ChatViewSessionTitleToolbar");
_MenuId.ChatContextUsageActions = new _MenuId("ChatContextUsageActions");
_MenuId.MarkerHoverStatusBar = new _MenuId("MarkerHoverParticipant.StatusBar");
let MenuId = _MenuId;
const IMenuService = createDecorator("menuService");
const _MenuRegistryChangeEvent = class _MenuRegistryChangeEvent {
  constructor(id) {
    this.id = id;
    this.has = (candidate) => candidate === id;
  }
  static for(id) {
    let value = this._all.get(id);
    if (!value) {
      value = new _MenuRegistryChangeEvent(id);
      this._all.set(id, value);
    }
    return value;
  }
  static merge(events) {
    const ids = /* @__PURE__ */ new Set();
    for (const item of events) {
      if (item instanceof _MenuRegistryChangeEvent) {
        ids.add(item.id);
      }
    }
    return ids;
  }
};
_MenuRegistryChangeEvent._all = /* @__PURE__ */ new Map();
let MenuRegistryChangeEvent = _MenuRegistryChangeEvent;
const MenuRegistry = new class {
  constructor() {
    this._commands = /* @__PURE__ */ new Map();
    this._menuItems = /* @__PURE__ */ new Map();
    this._onDidChangeMenu = new MicrotaskEmitter({
      merge: MenuRegistryChangeEvent.merge
    });
    this.onDidChangeMenu = this._onDidChangeMenu.event;
  }
  addCommand(command) {
    this._commands.set(command.id, command);
    this._onDidChangeMenu.fire(MenuRegistryChangeEvent.for(MenuId.CommandPalette));
    return markAsSingleton(toDisposable(() => {
      if (this._commands.delete(command.id)) {
        this._onDidChangeMenu.fire(MenuRegistryChangeEvent.for(MenuId.CommandPalette));
      }
    }));
  }
  getCommand(id) {
    return this._commands.get(id);
  }
  getCommands() {
    const map = /* @__PURE__ */ new Map();
    this._commands.forEach((value, key) => map.set(key, value));
    return map;
  }
  appendMenuItem(id, item) {
    let list = this._menuItems.get(id);
    if (!list) {
      list = new LinkedList();
      this._menuItems.set(id, list);
    }
    const rm = list.push(item);
    this._onDidChangeMenu.fire(MenuRegistryChangeEvent.for(id));
    return markAsSingleton(toDisposable(() => {
      rm();
      this._onDidChangeMenu.fire(MenuRegistryChangeEvent.for(id));
    }));
  }
  appendMenuItems(items) {
    const result = new DisposableStore();
    for (const { id, item } of items) {
      result.add(this.appendMenuItem(id, item));
    }
    return result;
  }
  getMenuItems(id) {
    let result;
    if (this._menuItems.has(id)) {
      result = [...this._menuItems.get(id)];
    } else {
      result = [];
    }
    if (id === MenuId.CommandPalette) {
      this._appendImplicitItems(result);
    }
    return result;
  }
  _appendImplicitItems(result) {
    const set = /* @__PURE__ */ new Set();
    for (const item of result) {
      if (isIMenuItem(item)) {
        set.add(item.command.id);
        if (item.alt) {
          set.add(item.alt.id);
        }
      }
    }
    this._commands.forEach((command, id) => {
      if (!set.has(id)) {
        result.push({ command });
      }
    });
  }
}();
class SubmenuItemAction extends SubmenuAction {
  constructor(item, hideActions, actions) {
    super(`submenuitem.${item.submenu.id}`, typeof item.title === "string" ? item.title : item.title.value, actions, "submenu");
    this.item = item;
    this.hideActions = hideActions;
  }
}
let MenuItemAction = class {
  constructor(item, alt, options, hideActions, menuKeybinding, contextKeyService, _commandService) {
    this.hideActions = hideActions;
    this.menuKeybinding = menuKeybinding;
    this._commandService = _commandService;
    this.id = item.id;
    this.label = MenuItemAction.label(item, options);
    this.tooltip = (typeof item.tooltip === "string" ? item.tooltip : item.tooltip?.value) ?? "";
    this.enabled = !item.precondition || contextKeyService.contextMatchesRules(item.precondition);
    this.checked = void 0;
    let icon;
    if (item.toggled) {
      const toggled = item.toggled.condition ? item.toggled : { condition: item.toggled };
      this.checked = contextKeyService.contextMatchesRules(toggled.condition);
      if (this.checked && toggled.tooltip) {
        this.tooltip = typeof toggled.tooltip === "string" ? toggled.tooltip : toggled.tooltip.value;
      }
      if (this.checked && ThemeIcon.isThemeIcon(toggled.icon)) {
        icon = toggled.icon;
      }
      if (this.checked && toggled.title) {
        this.label = typeof toggled.title === "string" ? toggled.title : toggled.title.value;
      }
    }
    if (!icon) {
      icon = ThemeIcon.isThemeIcon(item.icon) ? item.icon : void 0;
    }
    this.item = item;
    this.alt = alt ? new MenuItemAction(alt, void 0, options, hideActions, void 0, contextKeyService, _commandService) : void 0;
    this._options = options;
    this.class = icon && ThemeIcon.asClassName(icon);
  }
  static label(action, options) {
    return options?.renderShortTitle && action.shortTitle ? typeof action.shortTitle === "string" ? action.shortTitle : action.shortTitle.value : typeof action.title === "string" ? action.title : action.title.value;
  }
  run(...args) {
    let runArgs = [];
    if (this._options?.args) {
      runArgs = [...runArgs, ...this._options.args];
    } else if (this._options?.arg) {
      runArgs = [...runArgs, this._options.arg];
    }
    if (this._options?.shouldForwardArgs) {
      runArgs = [...runArgs, ...args];
    }
    return this._commandService.executeCommand(this.id, ...runArgs);
  }
};
MenuItemAction = __decorateClass([
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, ICommandService)
], MenuItemAction);
class Action2 {
  constructor(desc) {
    this.desc = desc;
  }
}
function registerAction2(ctor) {
  const disposables = [];
  const action = new ctor();
  const { f1, menu, keybinding, ...command } = action.desc;
  if (CommandsRegistry.getCommand(command.id)) {
    throw new Error(`Cannot register two commands with the same id: ${command.id}`);
  }
  disposables.push(CommandsRegistry.registerCommand({
    id: command.id,
    handler: (accessor, ...args) => action.run(accessor, ...args),
    metadata: command.metadata ?? { description: action.desc.title }
  }));
  if (Array.isArray(menu)) {
    for (const item of menu) {
      disposables.push(MenuRegistry.appendMenuItem(item.id, { command: { ...command, precondition: item.precondition === null ? void 0 : command.precondition }, ...item }));
    }
  } else if (menu) {
    disposables.push(MenuRegistry.appendMenuItem(menu.id, { command: { ...command, precondition: menu.precondition === null ? void 0 : command.precondition }, ...menu }));
  }
  if (f1) {
    disposables.push(MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command, when: command.precondition }));
    disposables.push(MenuRegistry.addCommand(command));
  }
  if (Array.isArray(keybinding)) {
    for (const item of keybinding) {
      disposables.push(KeybindingsRegistry.registerKeybindingRule({
        ...item,
        id: command.id,
        when: command.precondition ? ContextKeyExpr.and(command.precondition, item.when) : item.when
      }));
    }
  } else if (keybinding) {
    disposables.push(KeybindingsRegistry.registerKeybindingRule({
      ...keybinding,
      id: command.id,
      when: command.precondition ? ContextKeyExpr.and(command.precondition, keybinding.when) : keybinding.when
    }));
  }
  return {
    dispose() {
      dispose(disposables);
    }
  };
}
export {
  Action2,
  IMenuService,
  MenuId,
  MenuItemAction,
  MenuRegistry,
  SubmenuItemAction,
  isIMenuItem,
  isISubmenuItem,
  registerAction2
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQWN0aW9uLCBTdWJtZW51QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCwgTWljcm90YXNrRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIG1hcmtBc1NpbmdsZXRvbiwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRMaXN0LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEFjdGlvbiwgSUNvbW1hbmRBY3Rpb25UaXRsZSwgSWNvbiwgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5RXhwcmVzc2lvbiwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nUnVsZSwgS2V5YmluZGluZ3NSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElNZW51SXRlbSB7XG5cdGNvbW1hbmQ6IElDb21tYW5kQWN0aW9uO1xuXHRhbHQ/OiBJQ29tbWFuZEFjdGlvbjtcblx0LyoqXG5cdCAqIE1lbnUgaXRlbSBpcyBoaWRkZW4gaWYgdGhpcyBleHByZXNzaW9uIHJldHVybnMgZmFsc2UuXG5cdCAqL1xuXHR3aGVuPzogQ29udGV4dEtleUV4cHJlc3Npb247XG5cdGdyb3VwPzogJ25hdmlnYXRpb24nIHwgc3RyaW5nO1xuXHRvcmRlcj86IG51bWJlcjtcblx0aXNIaWRkZW5CeURlZmF1bHQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdWJtZW51SXRlbSB7XG5cdHRpdGxlOiBzdHJpbmcgfCBJQ29tbWFuZEFjdGlvblRpdGxlO1xuXHRzdWJtZW51OiBNZW51SWQ7XG5cdGljb24/OiBJY29uO1xuXHR3aGVuPzogQ29udGV4dEtleUV4cHJlc3Npb247XG5cdGdyb3VwPzogJ25hdmlnYXRpb24nIHwgc3RyaW5nO1xuXHRvcmRlcj86IG51bWJlcjtcblx0aXNTZWxlY3Rpb24/OiBib29sZWFuO1xuXHQvKipcblx0ICogQSBzcGxpdCBidXR0b24gc2hvd3MgdGhlIGZpcnN0IGFjdGlvblxuXHQgKiBhcyBwcmltYXJ5IGFjdGlvbiBhbmQgdGhlIHJlc3Qgb2YgdGhlXG5cdCAqIGFjdGlvbnMgaW4gYSBkcm9wZG93bi5cblx0ICpcblx0ICogVXNlIGB0b2dnbGVQcmltYXJ5QWN0aW9uYCB0byBwcm9tb3RlXG5cdCAqIHRoZSBhY3Rpb24gdGhhdCB3YXMgbGFzdCB1c2VkIHRvIGJlXG5cdCAqIHRoZSBwcmltYXJ5IGFjdGlvbiBhbmQgcmVtZW1iZXIgdGhhdFxuXHQgKiBjaG9pY2UuXG5cdCAqL1xuXHRpc1NwbGl0QnV0dG9uPzogYm9vbGVhbiB8IHtcblx0XHQvKipcblx0XHQgKiBXaWxsIHVwZGF0ZSB0aGUgcHJpbWFyeSBhY3Rpb24gYmFzZWRcblx0XHQgKiBvbiB0aGUgYWN0aW9uIHRoYXQgd2FzIGxhc3QgcnVuLlxuXHRcdCAqL1xuXHRcdHRvZ2dsZVByaW1hcnlBY3Rpb246IHRydWU7XG5cdFx0LyoqXG5cdFx0ICogUmVzdHJpY3RzIHdoaWNoIHN1Ym1lbnUgY29tbWFuZHMgY2FuIGJlY29tZSB0aGUgcHJpbWFyeSBhY3Rpb24uXG5cdFx0ICogUnVubmluZyBhbiBlbGlnaWJsZSBjb21tYW5kIG91dHNpZGUgdGhlIHN1Ym1lbnUgYWxzbyB1cGRhdGVzIHRoZSBwcmltYXJ5IGFjdGlvbi5cblx0XHQgKi9cblx0XHRwcmltYXJ5QWN0aW9uSWRzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0lNZW51SXRlbShpdGVtOiB1bmtub3duKTogaXRlbSBpcyBJTWVudUl0ZW0ge1xuXHRyZXR1cm4gKGl0ZW0gYXMgSU1lbnVJdGVtKS5jb21tYW5kICE9PSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0lTdWJtZW51SXRlbShpdGVtOiB1bmtub3duKTogaXRlbSBpcyBJU3VibWVudUl0ZW0ge1xuXHRyZXR1cm4gKGl0ZW0gYXMgSVN1Ym1lbnVJdGVtKS5zdWJtZW51ICE9PSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBNZW51SWQge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9pbnN0YW5jZXMgPSBuZXcgTWFwPHN0cmluZywgTWVudUlkPigpO1xuXG5cdHN0YXRpYyByZWFkb25seSBDb21tYW5kUGFsZXR0ZSA9IG5ldyBNZW51SWQoJ0NvbW1hbmRQYWxldHRlJyk7XG5cdHN0YXRpYyByZWFkb25seSBEZWJ1Z0JyZWFrcG9pbnRzQ29udGV4dCA9IG5ldyBNZW51SWQoJ0RlYnVnQnJlYWtwb2ludHNDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBEZWJ1Z0NhbGxTdGFja0NvbnRleHQgPSBuZXcgTWVudUlkKCdEZWJ1Z0NhbGxTdGFja0NvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IERlYnVnQ29uc29sZUNvbnRleHQgPSBuZXcgTWVudUlkKCdEZWJ1Z0NvbnNvbGVDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBEZWJ1Z1ZhcmlhYmxlc0NvbnRleHQgPSBuZXcgTWVudUlkKCdEZWJ1Z1ZhcmlhYmxlc0NvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGVib29rVmFyaWFibGVzQ29udGV4dCA9IG5ldyBNZW51SWQoJ05vdGVib29rVmFyaWFibGVzQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRGVidWdIb3ZlckNvbnRleHQgPSBuZXcgTWVudUlkKCdEZWJ1Z0hvdmVyQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRGVidWdXYXRjaENvbnRleHQgPSBuZXcgTWVudUlkKCdEZWJ1Z1dhdGNoQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRGVidWdUb29sQmFyID0gbmV3IE1lbnVJZCgnRGVidWdUb29sQmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBEZWJ1Z1Rvb2xCYXJTdG9wID0gbmV3IE1lbnVJZCgnRGVidWdUb29sQmFyU3RvcCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRGVidWdEaXNhc3NlbWJseUNvbnRleHQgPSBuZXcgTWVudUlkKCdEZWJ1Z0Rpc2Fzc2VtYmx5Q29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRGVidWdDYWxsU3RhY2tUb29sYmFyID0gbmV3IE1lbnVJZCgnRGVidWdDYWxsU3RhY2tUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBEZWJ1Z0NyZWF0ZUNvbmZpZ3VyYXRpb24gPSBuZXcgTWVudUlkKCdEZWJ1Z0NyZWF0ZUNvbmZpZ3VyYXRpb24nKTtcblx0c3RhdGljIHJlYWRvbmx5IERlYnVnU2NvcGVzQ29udGV4dCA9IG5ldyBNZW51SWQoJ0RlYnVnU2NvcGVzQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yQ29udGV4dCA9IG5ldyBNZW51SWQoJ0VkaXRvckNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNpbXBsZUVkaXRvckNvbnRleHQgPSBuZXcgTWVudUlkKCdTaW1wbGVFZGl0b3JDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBFZGl0b3JDb250ZW50ID0gbmV3IE1lbnVJZCgnRWRpdG9yQ29udGVudCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yTGluZU51bWJlckNvbnRleHQgPSBuZXcgTWVudUlkKCdFZGl0b3JMaW5lTnVtYmVyQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yQ29udGV4dENvcHkgPSBuZXcgTWVudUlkKCdFZGl0b3JDb250ZXh0Q29weScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yQ29udGV4dFBlZWsgPSBuZXcgTWVudUlkKCdFZGl0b3JDb250ZXh0UGVlaycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yQ29udGV4dFNoYXJlID0gbmV3IE1lbnVJZCgnRWRpdG9yQ29udGV4dFNoYXJlJyk7XG5cdHN0YXRpYyByZWFkb25seSBFZGl0b3JUaXRsZSA9IG5ldyBNZW51SWQoJ0VkaXRvclRpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBFZGl0b3JUaXRsZUxheW91dCA9IG5ldyBNZW51SWQoJ0VkaXRvclRpdGxlTGF5b3V0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBNb2RhbEVkaXRvclRpdGxlID0gbmV3IE1lbnVJZCgnTW9kYWxFZGl0b3JUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTW9kYWxFZGl0b3JUaXRsZUNvbnRleHQgPSBuZXcgTWVudUlkKCdNb2RhbEVkaXRvclRpdGxlQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTW9kYWxFZGl0b3JFZGl0b3JUaXRsZSA9IG5ldyBNZW51SWQoJ01vZGFsRWRpdG9yRWRpdG9yVGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IENvbXBhY3RXaW5kb3dFZGl0b3JUaXRsZSA9IG5ldyBNZW51SWQoJ0NvbXBhY3RXaW5kb3dFZGl0b3JUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yVGl0bGVSdW4gPSBuZXcgTWVudUlkKCdFZGl0b3JUaXRsZVJ1bicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yVGl0bGVDb250ZXh0ID0gbmV3IE1lbnVJZCgnRWRpdG9yVGl0bGVDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBFZGl0b3JUaXRsZUNvbnRleHRTaGFyZSA9IG5ldyBNZW51SWQoJ0VkaXRvclRpdGxlQ29udGV4dFNoYXJlJyk7XG5cdHN0YXRpYyByZWFkb25seSBFbXB0eUVkaXRvckdyb3VwID0gbmV3IE1lbnVJZCgnRW1wdHlFZGl0b3JHcm91cCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRW1wdHlFZGl0b3JHcm91cENvbnRleHQgPSBuZXcgTWVudUlkKCdFbXB0eUVkaXRvckdyb3VwQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yR3JvdXBXYXRlcm1hcmtUb29sYmFyID0gbmV3IE1lbnVJZCgnRWRpdG9yR3JvdXBXYXRlcm1hcmtUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBFZGl0b3JUYWJzQmFyQ29udGV4dCA9IG5ldyBNZW51SWQoJ0VkaXRvclRhYnNCYXJDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBFZGl0b3JUYWJzQmFyU2hvd1RhYnNTdWJtZW51ID0gbmV3IE1lbnVJZCgnRWRpdG9yVGFic0JhclNob3dUYWJzU3VibWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yVGFic0JhclNob3dUYWJzWmVuTW9kZVN1Ym1lbnUgPSBuZXcgTWVudUlkKCdFZGl0b3JUYWJzQmFyU2hvd1RhYnNaZW5Nb2RlU3VibWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yQWN0aW9uc1Bvc2l0aW9uU3VibWVudSA9IG5ldyBNZW51SWQoJ0VkaXRvckFjdGlvbnNQb3NpdGlvblN1Ym1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEVkaXRvclJlbmRlcldoaXRlc3BhY2VTdWJtZW51ID0gbmV3IE1lbnVJZCgnRWRpdG9yUmVuZGVyV2hpdGVzcGFjZVN1Ym1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEVkaXRvclNwbGl0TW92ZVN1Ym1lbnUgPSBuZXcgTWVudUlkKCdFZGl0b3JTcGxpdE1vdmVTdWJtZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBFeHBsb3JlckNvbnRleHQgPSBuZXcgTWVudUlkKCdFeHBsb3JlckNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IEV4cGxvcmVyQ29udGV4dFNoYXJlID0gbmV3IE1lbnVJZCgnRXhwbG9yZXJDb250ZXh0U2hhcmUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEV4dGVuc2lvbkNvbnRleHQgPSBuZXcgTWVudUlkKCdFeHRlbnNpb25Db250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBFeHRlbnNpb25FZGl0b3JDb250ZXh0TWVudSA9IG5ldyBNZW51SWQoJ0V4dGVuc2lvbkVkaXRvckNvbnRleHRNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBHbG9iYWxBY3Rpdml0eSA9IG5ldyBNZW51SWQoJ0dsb2JhbEFjdGl2aXR5Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDb21tYW5kQ2VudGVyID0gbmV3IE1lbnVJZCgnQ29tbWFuZENlbnRlcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ29tbWFuZENlbnRlckNlbnRlciA9IG5ldyBNZW51SWQoJ0NvbW1hbmRDZW50ZXJDZW50ZXInKTtcblx0c3RhdGljIHJlYWRvbmx5IExheW91dENvbnRyb2xNZW51U3VibWVudSA9IG5ldyBNZW51SWQoJ0xheW91dENvbnRyb2xNZW51U3VibWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTGF5b3V0Q29udHJvbE1lbnUgPSBuZXcgTWVudUlkKCdMYXlvdXRDb250cm9sTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhck1haW5NZW51ID0gbmV3IE1lbnVJZCgnTWVudWJhck1haW5NZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBNZW51YmFyQXBwZWFyYW5jZU1lbnUgPSBuZXcgTWVudUlkKCdNZW51YmFyQXBwZWFyYW5jZU1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJEZWJ1Z01lbnUgPSBuZXcgTWVudUlkKCdNZW51YmFyRGVidWdNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBNZW51YmFyRWRpdE1lbnUgPSBuZXcgTWVudUlkKCdNZW51YmFyRWRpdE1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJDb3B5ID0gbmV3IE1lbnVJZCgnTWVudWJhckNvcHknKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJGaWxlTWVudSA9IG5ldyBNZW51SWQoJ01lbnViYXJGaWxlTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhckdvTWVudSA9IG5ldyBNZW51SWQoJ01lbnViYXJHb01lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJIZWxwTWVudSA9IG5ldyBNZW51SWQoJ01lbnViYXJIZWxwTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhckxheW91dE1lbnUgPSBuZXcgTWVudUlkKCdNZW51YmFyTGF5b3V0TWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhck5ld0JyZWFrcG9pbnRNZW51ID0gbmV3IE1lbnVJZCgnTWVudWJhck5ld0JyZWFrcG9pbnRNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBQYW5lbEFsaWdubWVudE1lbnUgPSBuZXcgTWVudUlkKCdQYW5lbEFsaWdubWVudE1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IFBhbmVsUG9zaXRpb25NZW51ID0gbmV3IE1lbnVJZCgnUGFuZWxQb3NpdGlvbk1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEFjdGl2aXR5QmFyUG9zaXRpb25NZW51ID0gbmV3IE1lbnVJZCgnQWN0aXZpdHlCYXJQb3NpdGlvbk1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGlmaWNhdGlvbnNDZW50ZXJQb3NpdGlvbk1lbnUgPSBuZXcgTWVudUlkKCdOb3RpZmljYXRpb25zQ2VudGVyUG9zaXRpb25NZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBNZW51YmFyUHJlZmVyZW5jZXNNZW51ID0gbmV3IE1lbnVJZCgnTWVudWJhclByZWZlcmVuY2VzTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhclJlY2VudE1lbnUgPSBuZXcgTWVudUlkKCdNZW51YmFyUmVjZW50TWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhclNlbGVjdGlvbk1lbnUgPSBuZXcgTWVudUlkKCdNZW51YmFyU2VsZWN0aW9uTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhclNoYXJlID0gbmV3IE1lbnVJZCgnTWVudWJhclNoYXJlJyk7XG5cdHN0YXRpYyByZWFkb25seSBNZW51YmFyU3dpdGNoRWRpdG9yTWVudSA9IG5ldyBNZW51SWQoJ01lbnViYXJTd2l0Y2hFZGl0b3JNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBNZW51YmFyU3dpdGNoR3JvdXBNZW51ID0gbmV3IE1lbnVJZCgnTWVudWJhclN3aXRjaEdyb3VwTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhclRlcm1pbmFsTWVudSA9IG5ldyBNZW51SWQoJ01lbnViYXJUZXJtaW5hbE1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJUZXJtaW5hbFN1Z2dlc3RTdGF0dXNNZW51ID0gbmV3IE1lbnVJZCgnTWVudWJhclRlcm1pbmFsU3VnZ2VzdFN0YXR1c01lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJWaWV3TWVudSA9IG5ldyBNZW51SWQoJ01lbnViYXJWaWV3TWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhckhvbWVNZW51ID0gbmV3IE1lbnVJZCgnTWVudWJhckhvbWVNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBPcGVuRWRpdG9yc0NvbnRleHQgPSBuZXcgTWVudUlkKCdPcGVuRWRpdG9yc0NvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IE9wZW5FZGl0b3JzQ29udGV4dFNoYXJlID0gbmV3IE1lbnVJZCgnT3BlbkVkaXRvcnNDb250ZXh0U2hhcmUnKTtcblx0c3RhdGljIHJlYWRvbmx5IFByb2JsZW1zUGFuZWxDb250ZXh0ID0gbmV3IE1lbnVJZCgnUHJvYmxlbXNQYW5lbENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNDTUlucHV0Qm94ID0gbmV3IE1lbnVJZCgnU0NNSW5wdXRCb3gnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNDTUNoYW5nZUNvbnRleHQgPSBuZXcgTWVudUlkKCdTQ01DaGFuZ2VDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBTQ01SZXNvdXJjZUNvbnRleHQgPSBuZXcgTWVudUlkKCdTQ01SZXNvdXJjZUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNDTVJlc291cmNlQ29udGV4dFNoYXJlID0gbmV3IE1lbnVJZCgnU0NNUmVzb3VyY2VDb250ZXh0U2hhcmUnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNDTVJlc291cmNlRm9sZGVyQ29udGV4dCA9IG5ldyBNZW51SWQoJ1NDTVJlc291cmNlRm9sZGVyQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU0NNUmVzb3VyY2VHcm91cENvbnRleHQgPSBuZXcgTWVudUlkKCdTQ01SZXNvdXJjZUdyb3VwQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU0NNU291cmNlQ29udHJvbCA9IG5ldyBNZW51SWQoJ1NDTVNvdXJjZUNvbnRyb2wnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNDTVNvdXJjZUNvbnRyb2xJbmxpbmUgPSBuZXcgTWVudUlkKCdTQ01Tb3VyY2VDb250cm9sSW5saW5lJyk7XG5cdHN0YXRpYyByZWFkb25seSBTQ01Tb3VyY2VDb250cm9sVGl0bGUgPSBuZXcgTWVudUlkKCdTQ01Tb3VyY2VDb250cm9sVGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNDTUhpc3RvcnlUaXRsZSA9IG5ldyBNZW51SWQoJ1NDTUhpc3RvcnlUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU0NNSGlzdG9yeUl0ZW1Db250ZXh0ID0gbmV3IE1lbnVJZCgnU0NNSGlzdG9yeUl0ZW1Db250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBTQ01IaXN0b3J5SXRlbUNoYW5nZUNvbnRleHQgPSBuZXcgTWVudUlkKCdTQ01IaXN0b3J5SXRlbUNoYW5nZUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNDTUhpc3RvcnlJdGVtUmVmQ29udGV4dCA9IG5ldyBNZW51SWQoJ1NDTUhpc3RvcnlJdGVtUmVmQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU0NNQXJ0aWZhY3RHcm91cENvbnRleHQgPSBuZXcgTWVudUlkKCdTQ01BcnRpZmFjdEdyb3VwQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU0NNQXJ0aWZhY3RDb250ZXh0ID0gbmV3IE1lbnVJZCgnU0NNQXJ0aWZhY3RDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBTQ01RdWlja0RpZmZEZWNvcmF0aW9ucyA9IG5ldyBNZW51SWQoJ1NDTVF1aWNrRGlmZkRlY29yYXRpb25zJyk7XG5cdHN0YXRpYyByZWFkb25seSBTQ01UaXRsZSA9IG5ldyBNZW51SWQoJ1NDTVRpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBTZWFyY2hDb250ZXh0ID0gbmV3IE1lbnVJZCgnU2VhcmNoQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU2VhcmNoQWN0aW9uTWVudSA9IG5ldyBNZW51SWQoJ1NlYXJjaEFjdGlvbkNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFN0YXR1c0JhcldpbmRvd0luZGljYXRvck1lbnUgPSBuZXcgTWVudUlkKCdTdGF0dXNCYXJXaW5kb3dJbmRpY2F0b3JNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBTdGF0dXNCYXJSZW1vdGVJbmRpY2F0b3JNZW51ID0gbmV3IE1lbnVJZCgnU3RhdHVzQmFyUmVtb3RlSW5kaWNhdG9yTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU3RpY2t5U2Nyb2xsQ29udGV4dCA9IG5ldyBNZW51SWQoJ1N0aWNreVNjcm9sbENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRlc3RJdGVtID0gbmV3IE1lbnVJZCgnVGVzdEl0ZW0nKTtcblx0c3RhdGljIHJlYWRvbmx5IFRlc3RJdGVtR3V0dGVyID0gbmV3IE1lbnVJZCgnVGVzdEl0ZW1HdXR0ZXInKTtcblx0c3RhdGljIHJlYWRvbmx5IFRlc3RQcm9maWxlc0NvbnRleHQgPSBuZXcgTWVudUlkKCdUZXN0UHJvZmlsZXNDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBUZXN0TWVzc2FnZUNvbnRleHQgPSBuZXcgTWVudUlkKCdUZXN0TWVzc2FnZUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRlc3RNZXNzYWdlQ29udGVudCA9IG5ldyBNZW51SWQoJ1Rlc3RNZXNzYWdlQ29udGVudCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGVzdFBlZWtFbGVtZW50ID0gbmV3IE1lbnVJZCgnVGVzdFBlZWtFbGVtZW50Jyk7XG5cdHN0YXRpYyByZWFkb25seSBUZXN0UGVla1RpdGxlID0gbmV3IE1lbnVJZCgnVGVzdFBlZWtUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGVzdENhbGxTdGFjayA9IG5ldyBNZW51SWQoJ1Rlc3RDYWxsU3RhY2snKTtcblx0c3RhdGljIHJlYWRvbmx5IFRlc3RDb3ZlcmFnZUZpbHRlckl0ZW0gPSBuZXcgTWVudUlkKCdUZXN0Q292ZXJhZ2VGaWx0ZXJJdGVtJyk7XG5cdHN0YXRpYyByZWFkb25seSBUb3VjaEJhckNvbnRleHQgPSBuZXcgTWVudUlkKCdUb3VjaEJhckNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRpdGxlQmFyID0gbmV3IE1lbnVJZCgnVGl0bGVCYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IFRpdGxlQmFyQWRqYWNlbnRDZW50ZXIgPSBuZXcgTWVudUlkKCdUaXRsZUJhckFkamFjZW50Q2VudGVyJyk7XG5cdHN0YXRpYyByZWFkb25seSBUaXRsZUJhckNvbnRleHQgPSBuZXcgTWVudUlkKCdUaXRsZUJhckNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRpdGxlQmFyVGl0bGVDb250ZXh0ID0gbmV3IE1lbnVJZCgnVGl0bGVCYXJUaXRsZUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFR1bm5lbENvbnRleHQgPSBuZXcgTWVudUlkKCdUdW5uZWxDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBUdW5uZWxQcml2YWN5ID0gbmV3IE1lbnVJZCgnVHVubmVsUHJpdmFjeScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVHVubmVsUHJvdG9jb2wgPSBuZXcgTWVudUlkKCdUdW5uZWxQcm90b2NvbCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVHVubmVsUG9ydElubGluZSA9IG5ldyBNZW51SWQoJ1R1bm5lbElubGluZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVHVubmVsVGl0bGUgPSBuZXcgTWVudUlkKCdUdW5uZWxUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVHVubmVsTG9jYWxBZGRyZXNzSW5saW5lID0gbmV3IE1lbnVJZCgnVHVubmVsTG9jYWxBZGRyZXNzSW5saW5lJyk7XG5cdHN0YXRpYyByZWFkb25seSBUdW5uZWxPcmlnaW5JbmxpbmUgPSBuZXcgTWVudUlkKCdUdW5uZWxPcmlnaW5JbmxpbmUnKTtcblx0c3RhdGljIHJlYWRvbmx5IFZpZXdJdGVtQ29udGV4dCA9IG5ldyBNZW51SWQoJ1ZpZXdJdGVtQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVmlld0NvbnRhaW5lclRpdGxlID0gbmV3IE1lbnVJZCgnVmlld0NvbnRhaW5lclRpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBWaWV3Q29udGFpbmVyVGl0bGVDb250ZXh0ID0gbmV3IE1lbnVJZCgnVmlld0NvbnRhaW5lclRpdGxlQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVmlld1RpdGxlID0gbmV3IE1lbnVJZCgnVmlld1RpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBWaWV3VGl0bGVDb250ZXh0ID0gbmV3IE1lbnVJZCgnVmlld1RpdGxlQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ29tbWVudEVkaXRvckFjdGlvbnMgPSBuZXcgTWVudUlkKCdDb21tZW50RWRpdG9yQWN0aW9ucycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ29tbWVudFRocmVhZFRpdGxlID0gbmV3IE1lbnVJZCgnQ29tbWVudFRocmVhZFRpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBDb21tZW50VGhyZWFkQWN0aW9ucyA9IG5ldyBNZW51SWQoJ0NvbW1lbnRUaHJlYWRBY3Rpb25zJyk7XG5cdHN0YXRpYyByZWFkb25seSBDb21tZW50VGhyZWFkQWRkaXRpb25hbEFjdGlvbnMgPSBuZXcgTWVudUlkKCdDb21tZW50VGhyZWFkQWRkaXRpb25hbEFjdGlvbnMnKTtcblx0c3RhdGljIHJlYWRvbmx5IENvbW1lbnRUaHJlYWRUaXRsZUNvbnRleHQgPSBuZXcgTWVudUlkKCdDb21tZW50VGhyZWFkVGl0bGVDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDb21tZW50VGhyZWFkQ29tbWVudENvbnRleHQgPSBuZXcgTWVudUlkKCdDb21tZW50VGhyZWFkQ29tbWVudENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENvbW1lbnRUaXRsZSA9IG5ldyBNZW51SWQoJ0NvbW1lbnRUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ29tbWVudEFjdGlvbnMgPSBuZXcgTWVudUlkKCdDb21tZW50QWN0aW9ucycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ29tbWVudHNWaWV3VGhyZWFkQWN0aW9ucyA9IG5ldyBNZW51SWQoJ0NvbW1lbnRzVmlld1RocmVhZEFjdGlvbnMnKTtcblx0c3RhdGljIHJlYWRvbmx5IEludGVyYWN0aXZlVG9vbGJhciA9IG5ldyBNZW51SWQoJ0ludGVyYWN0aXZlVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgSW50ZXJhY3RpdmVDZWxsVGl0bGUgPSBuZXcgTWVudUlkKCdJbnRlcmFjdGl2ZUNlbGxUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgSW50ZXJhY3RpdmVDZWxsRGVsZXRlID0gbmV3IE1lbnVJZCgnSW50ZXJhY3RpdmVDZWxsRGVsZXRlJyk7XG5cdHN0YXRpYyByZWFkb25seSBJbnRlcmFjdGl2ZUNlbGxFeGVjdXRlID0gbmV3IE1lbnVJZCgnSW50ZXJhY3RpdmVDZWxsRXhlY3V0ZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgSW50ZXJhY3RpdmVJbnB1dEV4ZWN1dGUgPSBuZXcgTWVudUlkKCdJbnRlcmFjdGl2ZUlucHV0RXhlY3V0ZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgSW50ZXJhY3RpdmVJbnB1dENvbmZpZyA9IG5ldyBNZW51SWQoJ0ludGVyYWN0aXZlSW5wdXRDb25maWcnKTtcblx0c3RhdGljIHJlYWRvbmx5IFJlcGxJbnB1dEV4ZWN1dGUgPSBuZXcgTWVudUlkKCdSZXBsSW5wdXRFeGVjdXRlJyk7XG5cdHN0YXRpYyByZWFkb25seSBJc3N1ZVJlcG9ydGVyID0gbmV3IE1lbnVJZCgnSXNzdWVSZXBvcnRlcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tUb29sYmFyID0gbmV3IE1lbnVJZCgnTm90ZWJvb2tUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RlYm9va1Rvb2xiYXJDb250ZXh0ID0gbmV3IE1lbnVJZCgnTm90ZWJvb2tUb29sYmFyQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tTdGlja3lTY3JvbGxDb250ZXh0ID0gbmV3IE1lbnVJZCgnTm90ZWJvb2tTdGlja3lTY3JvbGxDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RlYm9va0NlbGxUaXRsZSA9IG5ldyBNZW51SWQoJ05vdGVib29rQ2VsbFRpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RlYm9va0NlbGxEZWxldGUgPSBuZXcgTWVudUlkKCdOb3RlYm9va0NlbGxEZWxldGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGVib29rQ2VsbEluc2VydCA9IG5ldyBNZW51SWQoJ05vdGVib29rQ2VsbEluc2VydCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tDZWxsQmV0d2VlbiA9IG5ldyBNZW51SWQoJ05vdGVib29rQ2VsbEJldHdlZW4nKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGVib29rQ2VsbExpc3RUb3AgPSBuZXcgTWVudUlkKCdOb3RlYm9va0NlbGxUb3AnKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGVib29rQ2VsbEV4ZWN1dGUgPSBuZXcgTWVudUlkKCdOb3RlYm9va0NlbGxFeGVjdXRlJyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RlYm9va0NlbGxFeGVjdXRlR29UbyA9IG5ldyBNZW51SWQoJ05vdGVib29rQ2VsbEV4ZWN1dGVHb1RvJyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RlYm9va0NlbGxFeGVjdXRlUHJpbWFyeSA9IG5ldyBNZW51SWQoJ05vdGVib29rQ2VsbEV4ZWN1dGVQcmltYXJ5Jyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RlYm9va0RpZmZDZWxsSW5wdXRUaXRsZSA9IG5ldyBNZW51SWQoJ05vdGVib29rRGlmZkNlbGxJbnB1dFRpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RlYm9va0RpZmZEb2N1bWVudE1ldGFkYXRhID0gbmV3IE1lbnVJZCgnTm90ZWJvb2tEaWZmRG9jdW1lbnRNZXRhZGF0YScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tEaWZmQ2VsbE1ldGFkYXRhVGl0bGUgPSBuZXcgTWVudUlkKCdOb3RlYm9va0RpZmZDZWxsTWV0YWRhdGFUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tEaWZmQ2VsbE91dHB1dHNUaXRsZSA9IG5ldyBNZW51SWQoJ05vdGVib29rRGlmZkNlbGxPdXRwdXRzVGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGVib29rT3V0cHV0VG9vbGJhciA9IG5ldyBNZW51SWQoJ05vdGVib29rT3V0cHV0VG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tPdXRsaW5lRmlsdGVyID0gbmV3IE1lbnVJZCgnTm90ZWJvb2tPdXRsaW5lRmlsdGVyJyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RlYm9va091dGxpbmVBY3Rpb25NZW51ID0gbmV3IE1lbnVJZCgnTm90ZWJvb2tPdXRsaW5lQWN0aW9uTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tFZGl0b3JMYXlvdXRDb25maWd1cmUgPSBuZXcgTWVudUlkKCdOb3RlYm9va0VkaXRvckxheW91dENvbmZpZ3VyZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tLZXJuZWxTb3VyY2UgPSBuZXcgTWVudUlkKCdOb3RlYm9va0tlcm5lbFNvdXJjZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQnVsa0VkaXRUaXRsZSA9IG5ldyBNZW51SWQoJ0J1bGtFZGl0VGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEJ1bGtFZGl0Q29udGV4dCA9IG5ldyBNZW51SWQoJ0J1bGtFZGl0Q29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGltZWxpbmVJdGVtQ29udGV4dCA9IG5ldyBNZW51SWQoJ1RpbWVsaW5lSXRlbUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRpbWVsaW5lVGl0bGUgPSBuZXcgTWVudUlkKCdUaW1lbGluZVRpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBUaW1lbGluZVRpdGxlQ29udGV4dCA9IG5ldyBNZW51SWQoJ1RpbWVsaW5lVGl0bGVDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBUaW1lbGluZUZpbHRlclN1Yk1lbnUgPSBuZXcgTWVudUlkKCdUaW1lbGluZUZpbHRlclN1Yk1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEFjY291bnRzQ29udGV4dCA9IG5ldyBNZW51SWQoJ0FjY291bnRzQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU2lkZWJhclRpdGxlID0gbmV3IE1lbnVJZCgnU2lkZWJhclRpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBQYW5lbFRpdGxlID0gbmV3IE1lbnVJZCgnUGFuZWxUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQXV4aWxpYXJ5QmFyVGl0bGUgPSBuZXcgTWVudUlkKCdBdXhpbGlhcnlCYXJUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGVybWluYWxJbnN0YW5jZUNvbnRleHQgPSBuZXcgTWVudUlkKCdUZXJtaW5hbEluc3RhbmNlQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGVybWluYWxFZGl0b3JJbnN0YW5jZUNvbnRleHQgPSBuZXcgTWVudUlkKCdUZXJtaW5hbEVkaXRvckluc3RhbmNlQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGVybWluYWxOZXdEcm9wZG93bkNvbnRleHQgPSBuZXcgTWVudUlkKCdUZXJtaW5hbE5ld0Ryb3Bkb3duQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGVybWluYWxUYWJDb250ZXh0ID0gbmV3IE1lbnVJZCgnVGVybWluYWxUYWJDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBUZXJtaW5hbFRhYkVtcHR5QXJlYUNvbnRleHQgPSBuZXcgTWVudUlkKCdUZXJtaW5hbFRhYkVtcHR5QXJlYUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRlcm1pbmFsU3RpY2t5U2Nyb2xsQ29udGV4dCA9IG5ldyBNZW51SWQoJ1Rlcm1pbmFsU3RpY2t5U2Nyb2xsQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgV2Vidmlld0NvbnRleHQgPSBuZXcgTWVudUlkKCdXZWJ2aWV3Q29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgSW5saW5lQ29tcGxldGlvbnNBY3Rpb25zID0gbmV3IE1lbnVJZCgnSW5saW5lQ29tcGxldGlvbnNBY3Rpb25zJyk7XG5cdHN0YXRpYyByZWFkb25seSBJbmxpbmVFZGl0c0FjdGlvbnMgPSBuZXcgTWVudUlkKCdJbmxpbmVFZGl0c0FjdGlvbnMnKTtcblx0c3RhdGljIHJlYWRvbmx5IE5ld0ZpbGUgPSBuZXcgTWVudUlkKCdOZXdGaWxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBNZXJnZUlucHV0MVRvb2xiYXIgPSBuZXcgTWVudUlkKCdNZXJnZVRvb2xiYXIxVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVyZ2VJbnB1dDJUb29sYmFyID0gbmV3IE1lbnVJZCgnTWVyZ2VUb29sYmFyMlRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lcmdlQmFzZVRvb2xiYXIgPSBuZXcgTWVudUlkKCdNZXJnZUJhc2VUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBNZXJnZUlucHV0UmVzdWx0VG9vbGJhciA9IG5ldyBNZW51SWQoJ01lcmdlVG9vbGJhclJlc3VsdFRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IElubGluZVN1Z2dlc3Rpb25Ub29sYmFyID0gbmV3IE1lbnVJZCgnSW5saW5lU3VnZ2VzdGlvblRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IElubGluZUVkaXRUb29sYmFyID0gbmV3IE1lbnVJZCgnSW5saW5lRWRpdFRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRDb250ZXh0ID0gbmV3IE1lbnVJZCgnQ2hhdENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRDb2RlQmxvY2sgPSBuZXcgTWVudUlkKCdDaGF0Q29kZWJsb2NrJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0Q29tcGFyZUJsb2NrID0gbmV3IE1lbnVJZCgnQ2hhdENvbXBhcmVCbG9jaycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdE1lc3NhZ2VUaXRsZSA9IG5ldyBNZW51SWQoJ0NoYXRNZXNzYWdlVGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRXZWxjb21lQ29udGV4dCA9IG5ldyBNZW51SWQoJ0NoYXRXZWxjb21lQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdE1lc3NhZ2VGb290ZXIgPSBuZXcgTWVudUlkKCdDaGF0TWVzc2FnZUZvb3RlcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdFN1YmFnZW50Q29udGVudCA9IG5ldyBNZW51SWQoJ0NoYXRTdWJhZ2VudENvbnRlbnQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRFeGVjdXRlID0gbmV3IE1lbnVJZCgnQ2hhdEV4ZWN1dGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRFeGVjdXRlUXVldWUgPSBuZXcgTWVudUlkKCdDaGF0RXhlY3V0ZVF1ZXVlJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0SW5wdXQgPSBuZXcgTWVudUlkKCdDaGF0SW5wdXQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRJbnB1dFNlY29uZGFyeSA9IG5ldyBNZW51SWQoJ0NoYXRJbnB1dFNlY29uZGFyeScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdElucHV0U3RhdHVzID0gbmV3IE1lbnVJZCgnQ2hhdElucHV0U3RhdHVzJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0SW5wdXRTaWRlID0gbmV3IE1lbnVJZCgnQ2hhdElucHV0U2lkZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQXV0b21hdGlvbnNEaWFsb2dJbnB1dCA9IG5ldyBNZW51SWQoJ0F1dG9tYXRpb25zRGlhbG9nSW5wdXQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRNb2RlUGlja2VyID0gbmV3IE1lbnVJZCgnQ2hhdE1vZGVQaWNrZXInKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRFZGl0aW5nV2lkZ2V0VG9vbGJhciA9IG5ldyBNZW51SWQoJ0NoYXRFZGl0aW5nV2lkZ2V0VG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdEVkaXRpbmdTZXNzaW9uQ2hhbmdlc1Rvb2xiYXIgPSBuZXcgTWVudUlkKCdDaGF0RWRpdGluZ1Nlc3Npb25DaGFuZ2VzVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdEVkaXRpbmdTZXNzaW9uVGl0bGVUb29sYmFyID0gbmV3IE1lbnVJZCgnQ2hhdEVkaXRpbmdTZXNzaW9uVGl0bGVUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0RWRpdGluZ1Nlc3Npb25DaGFuZ2VzVmVyc2lvbnNTdWJtZW51ID0gbmV3IE1lbnVJZCgnQ2hhdEVkaXRpbmdTZXNzaW9uQ2hhbmdlc1ZlcnNpb25zU3VibWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdEVkaXRpbmdTZXNzaW9uQ2hhbmdlc0ZpbGVIZWFkZXJUb29sYmFyID0gbmV3IE1lbnVJZCgnQ2hhdEVkaXRpbmdTZXNzaW9uQ2hhbmdlc0ZpbGVIZWFkZXJUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0RWRpdGluZ1Nlc3Npb25DaGFuZ2VzRmlsZUhlYWRlclJpZ2h0VG9vbGJhciA9IG5ldyBNZW51SWQoJ0NoYXRFZGl0aW5nU2Vzc2lvbkNoYW5nZXNGaWxlSGVhZGVyUmlnaHRUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0RWRpdGluZ0VkaXRvckNvbnRlbnQgPSBuZXcgTWVudUlkKCdDaGF0RWRpdGluZ0VkaXRvckNvbnRlbnQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRFZGl0aW5nRWRpdG9ySHVuayA9IG5ldyBNZW51SWQoJ0NoYXRFZGl0aW5nRWRpdG9ySHVuaycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdEVkaXRpbmdEZWxldGVkTm90ZWJvb2tDZWxsID0gbmV3IE1lbnVJZCgnQ2hhdEVkaXRpbmdEZWxldGVkTm90ZWJvb2tDZWxsJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0SW5wdXRBdHRhY2htZW50VG9vbGJhciA9IG5ldyBNZW51SWQoJ0NoYXRJbnB1dEF0dGFjaG1lbnRUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0RWRpdGluZ1dpZGdldE1vZGlmaWVkRmlsZXNUb29sYmFyID0gbmV3IE1lbnVJZCgnQ2hhdEVkaXRpbmdXaWRnZXRNb2RpZmllZEZpbGVzVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdElucHV0UmVzb3VyY2VBdHRhY2htZW50Q29udGV4dCA9IG5ldyBNZW51SWQoJ0NoYXRJbnB1dFJlc291cmNlQXR0YWNobWVudENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRJbnB1dFN5bWJvbEF0dGFjaG1lbnRDb250ZXh0ID0gbmV3IE1lbnVJZCgnQ2hhdElucHV0U3ltYm9sQXR0YWNobWVudENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRJbmxpbmVSZXNvdXJjZUFuY2hvckNvbnRleHQgPSBuZXcgTWVudUlkKCdDaGF0SW5saW5lUmVzb3VyY2VBbmNob3JDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0SW5saW5lU3ltYm9sQW5jaG9yQ29udGV4dCA9IG5ldyBNZW51SWQoJ0NoYXRJbmxpbmVTeW1ib2xBbmNob3JDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0TWVzc2FnZUNoZWNrcG9pbnQ6IE1lbnVJZCA9IG5ldyBNZW51SWQoJ0NoYXRNZXNzYWdlQ2hlY2twb2ludCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdE1lc3NhZ2VSZXN0b3JlQ2hlY2twb2ludDogTWVudUlkID0gbmV3IE1lbnVJZCgnQ2hhdE1lc3NhZ2VSZXN0b3JlQ2hlY2twb2ludCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdE5ld01lbnUgPSBuZXcgTWVudUlkKCdDaGF0TmV3TWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdEVkaXRpbmdDb2RlQmxvY2tDb250ZXh0ID0gbmV3IE1lbnVJZCgnQ2hhdEVkaXRpbmdDb2RlQmxvY2tDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0VGl0bGVCYXJNZW51ID0gbmV3IE1lbnVJZCgnQ2hhdFRpdGxlQmFyTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdEF0dGFjaG1lbnRzQ29udGV4dCA9IG5ldyBNZW51SWQoJ0NoYXRBdHRhY2htZW50c0NvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRUaXBDb250ZXh0ID0gbmV3IE1lbnVJZCgnQ2hhdFRpcENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRUaXBUb29sYmFyID0gbmV3IE1lbnVJZCgnQ2hhdFRpcFRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRUb29sT3V0cHV0UmVzb3VyY2VUb29sYmFyID0gbmV3IE1lbnVJZCgnQ2hhdFRvb2xPdXRwdXRSZXNvdXJjZVRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRUZXh0RWRpdG9yTWVudSA9IG5ldyBNZW51SWQoJ0NoYXRUZXh0RWRpdG9yTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdFRvb2xPdXRwdXRSZXNvdXJjZUNvbnRleHQgPSBuZXcgTWVudUlkKCdDaGF0VG9vbE91dHB1dFJlc291cmNlQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdE11bHRpRGlmZkNvbnRleHQgPSBuZXcgTWVudUlkKCdDaGF0TXVsdGlEaWZmQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdENvbmZpcm1hdGlvbk1lbnUgPSBuZXcgTWVudUlkKCdDaGF0Q29uZmlybWF0aW9uTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdEVkaXRvcklubGluZU1lbnUgPSBuZXcgTWVudUlkKCdDaGF0RWRpdG9ySW5saW5lR3V0dGVyJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0RWRpdG9ySW5saW5lRXhlY3V0ZSA9IG5ldyBNZW51SWQoJ0NoYXRFZGl0b3JJbnB1dEV4ZWN1dGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRFZGl0b3JJbmxpbmVJbnB1dFNpZGUgPSBuZXcgTWVudUlkKCdDaGF0RWRpdG9ySW5wdXRTaWRlJyk7XG5cdHN0YXRpYyByZWFkb25seSBJbmxpbmVDaGF0RWRpdG9yQWZmb3JkYW5jZSA9IG5ldyBNZW51SWQoJ0lubGluZUNoYXRFZGl0b3JBZmZvcmRhbmNlJyk7XG5cblx0c3RhdGljIHJlYWRvbmx5IEFjY2Vzc2libGVWaWV3ID0gbmV3IE1lbnVJZCgnQWNjZXNzaWJsZVZpZXcnKTtcblx0c3RhdGljIHJlYWRvbmx5IE11bHRpRGlmZkVkaXRvckNvbnRlbnQgPSBuZXcgTWVudUlkKCdNdWx0aURpZmZFZGl0b3JDb250ZW50Jyk7XG5cdHN0YXRpYyByZWFkb25seSBNdWx0aURpZmZFZGl0b3JGaWxlVG9vbGJhciA9IG5ldyBNZW51SWQoJ011bHRpRGlmZkVkaXRvckZpbGVUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBEaWZmRWRpdG9ySHVua1Rvb2xiYXIgPSBuZXcgTWVudUlkKCdEaWZmRWRpdG9ySHVua1Rvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IERpZmZFZGl0b3JTZWxlY3Rpb25Ub29sYmFyID0gbmV3IE1lbnVJZCgnRGlmZkVkaXRvclNlbGVjdGlvblRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IEJyb3dzZXJOYXZpZ2F0aW9uVG9vbGJhciA9IG5ldyBNZW51SWQoJ0Jyb3dzZXJOYXZpZ2F0aW9uVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQnJvd3NlckFjdGlvbnNUb29sYmFyID0gbmV3IE1lbnVJZCgnQnJvd3NlckFjdGlvbnNUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBCcm93c2VyQ2hhdEFjdGlvbnNNZW51ID0gbmV3IE1lbnVJZCgnQnJvd3NlckNoYXRBY3Rpb25zTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQnJvd3NlckVtdWxhdGlvblRvb2xiYXIgPSBuZXcgTWVudUlkKCdCcm93c2VyRW11bGF0aW9uVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQWdlbnRTZXNzaW9uc1ZpZXdlckZpbHRlclN1Yk1lbnUgPSBuZXcgTWVudUlkKCdBZ2VudFNlc3Npb25zVmlld2VyRmlsdGVyU3ViTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQWdlbnRTZXNzaW9uc0NvbnRleHQgPSBuZXcgTWVudUlkKCdBZ2VudFNlc3Npb25zQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQWdlbnRTZXNzaW9uU2VjdGlvbkNvbnRleHQgPSBuZXcgTWVudUlkKCdBZ2VudFNlc3Npb25TZWN0aW9uQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQWdlbnRTZXNzaW9uc0NyZWF0ZVN1Yk1lbnUgPSBuZXcgTWVudUlkKCdBZ2VudFNlc3Npb25zQ3JlYXRlU3ViTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQWdlbnRTZXNzaW9uc1Rvb2xiYXIgPSBuZXcgTWVudUlkKCdBZ2VudFNlc3Npb25zVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQWdlbnRTZXNzaW9uSXRlbVRvb2xiYXIgPSBuZXcgTWVudUlkKCdBZ2VudFNlc3Npb25JdGVtVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQWdlbnRTZXNzaW9uU2VjdGlvblRvb2xiYXIgPSBuZXcgTWVudUlkKCdBZ2VudFNlc3Npb25TZWN0aW9uVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU2Vzc2lvbkl0ZW1Db250ZXh0TWVudSA9IG5ldyBNZW51SWQoJ1Nlc3Npb25JdGVtQ29udGV4dE1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNlc3Npb25IZWFkZXJDb250ZXh0ID0gbmV3IE1lbnVJZCgnU2Vzc2lvbnNTZXNzaW9uSGVhZGVyQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQWdlbnRzVGl0bGVCYXJDb250cm9sTWVudSA9IG5ldyBNZW51SWQoJ0FnZW50c1RpdGxlQmFyQ29udHJvbE1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEFnZW50c0NoYW5nZXNUb29sYmFyID0gbmV3IE1lbnVJZCgnQWdlbnRzQ2hhbmdlc1Rvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IEFnZW50c0NoYW5nZXNQcmltYXJ5QWN0aW9uU3ViTWVudSA9IG5ldyBNZW51SWQoJ0FnZW50c0NoYW5nZXNQcmltYXJ5QWN0aW9uU3ViTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQWdlbnRzQ2hhbmdlSW5saW5lVG9vbGJhciA9IG5ldyBNZW51SWQoJ0FnZW50c0NoYW5nZUlubGluZVRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRWaWV3U2Vzc2lvblRpdGxlTmF2aWdhdGlvblRvb2xiYXIgPSBuZXcgTWVudUlkKCdDaGF0Vmlld1Nlc3Npb25UaXRsZU5hdmlnYXRpb25Ub29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0Vmlld1Nlc3Npb25UaXRsZVRvb2xiYXIgPSBuZXcgTWVudUlkKCdDaGF0Vmlld1Nlc3Npb25UaXRsZVRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRDb250ZXh0VXNhZ2VBY3Rpb25zID0gbmV3IE1lbnVJZCgnQ2hhdENvbnRleHRVc2FnZUFjdGlvbnMnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1hcmtlckhvdmVyU3RhdHVzQmFyID0gbmV3IE1lbnVJZCgnTWFya2VySG92ZXJQYXJ0aWNpcGFudC5TdGF0dXNCYXInKTtcblxuXHQvKipcblx0ICogQ3JlYXRlIG9yIHJldXNlIGEgYE1lbnVJZGAgd2l0aCB0aGUgZ2l2ZW4gaWRlbnRpZmllclxuXHQgKi9cblx0c3RhdGljIGZvcihpZGVudGlmaWVyOiBzdHJpbmcpOiBNZW51SWQge1xuXHRcdHJldHVybiBNZW51SWQuX2luc3RhbmNlcy5nZXQoaWRlbnRpZmllcikgPz8gbmV3IE1lbnVJZChpZGVudGlmaWVyKTtcblx0fVxuXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyBgTWVudUlkYCB3aXRoIHRoZSB1bmlxdWUgaWRlbnRpZmllci4gV2lsbCB0aHJvdyBpZiBhIG1lbnVcblx0ICogd2l0aCB0aGUgaWRlbnRpZmllciBhbHJlYWR5IGV4aXN0cywgdXNlIGBNZW51SWQuZm9yKGlkZW50KWAgb3IgYSB1bmlxdWVcblx0ICogaWRlbnRpZmllclxuXHQgKi9cblx0Y29uc3RydWN0b3IoaWRlbnRpZmllcjogc3RyaW5nKSB7XG5cdFx0aWYgKE1lbnVJZC5faW5zdGFuY2VzLmhhcyhpZGVudGlmaWVyKSkge1xuXHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcihgTWVudUlkIHdpdGggaWRlbnRpZmllciAnJHtpZGVudGlmaWVyfScgYWxyZWFkeSBleGlzdHMuIFVzZSBNZW51SWQuZm9yKGlkZW50KSBvciBhIHVuaXF1ZSBpZGVudGlmaWVyYCk7XG5cdFx0fVxuXHRcdE1lbnVJZC5faW5zdGFuY2VzLnNldChpZGVudGlmaWVyLCB0aGlzKTtcblx0XHR0aGlzLmlkID0gaWRlbnRpZmllcjtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNZW51QWN0aW9uT3B0aW9ucyB7XG5cdGFyZz86IHVua25vd247XG5cdGFyZ3M/OiB1bmtub3duW107XG5cdHNob3VsZEZvcndhcmRBcmdzPzogYm9vbGVhbjtcblx0cmVuZGVyU2hvcnRUaXRsZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lbnVDaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IG1lbnU6IElNZW51O1xuXHRyZWFkb25seSBpc1N0cnVjdHVyYWxDaGFuZ2U6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzVG9nZ2xlQ2hhbmdlOiBib29sZWFuO1xuXHRyZWFkb25seSBpc0VuYWJsZW1lbnRDaGFuZ2U6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lbnUgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxJTWVudUNoYW5nZUV2ZW50Pjtcblx0Z2V0QWN0aW9ucyhvcHRpb25zPzogSU1lbnVBY3Rpb25PcHRpb25zKTogW3N0cmluZywgQXJyYXk8TWVudUl0ZW1BY3Rpb24gfCBTdWJtZW51SXRlbUFjdGlvbj5dW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lbnVEYXRhIHtcblx0Y29udGV4dHM6IFJlYWRvbmx5U2V0PHN0cmluZz47XG5cdGFjdGlvbnM6IFtzdHJpbmcsIEFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XVtdO1xufVxuXG5leHBvcnQgY29uc3QgSU1lbnVTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElNZW51U2VydmljZT4oJ21lbnVTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lbnVDcmVhdGVPcHRpb25zIHtcblx0ZW1pdEV2ZW50c0ZvclN1Ym1lbnVDaGFuZ2VzPzogYm9vbGVhbjtcblx0ZXZlbnREZWJvdW5jZURlbGF5PzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNZW51U2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBDb25zaWRlciB1c2luZyBnZXRNZW51QWN0aW9ucyBpZiB5b3UgZG9uJ3QgbmVlZCB0byBsaXN0ZW4gdG8gZXZlbnRzLlxuXHQgKlxuXHQgKiBDcmVhdGUgYSBuZXcgbWVudSBmb3IgdGhlIGdpdmVuIG1lbnUgaWRlbnRpZmllci4gQSBtZW51IHNlbmRzIGV2ZW50cyB3aGVuIGl0J3MgZW50cmllc1xuXHQgKiBoYXZlIGNoYW5nZWQgKHBsYWNlbWVudCwgZW5hYmxlbWVudCwgY2hlY2tlZC1zdGF0ZSkuIEJ5IGRlZmF1bHQgaXQgZG9lcyBub3Qgc2VuZCBldmVudHMgZm9yXG5cdCAqIHN1Ym1lbnUgZW50cmllcy4gVGhhdCBpcyBtb3JlIGV4cGVuc2l2ZSBhbmQgbXVzdCBiZSBleHBsaWNpdGx5IGVuYWJsZWQgd2l0aCB0aGVcblx0ICogYGVtaXRFdmVudHNGb3JTdWJtZW51Q2hhbmdlc2AgZmxhZy5cblx0ICovXG5cdGNyZWF0ZU1lbnUoaWQ6IE1lbnVJZCwgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSwgb3B0aW9ucz86IElNZW51Q3JlYXRlT3B0aW9ucyk6IElNZW51O1xuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmV3IG1lbnUsIGdldHMgdGhlIGFjdGlvbnMsIGFuZCB0aGVuIGRpc3Bvc2VzIG9mIHRoZSBtZW51LlxuXHQgKi9cblx0Z2V0TWVudUFjdGlvbnMoaWQ6IE1lbnVJZCwgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSwgb3B0aW9ucz86IElNZW51QWN0aW9uT3B0aW9ucyk6IFtzdHJpbmcsIEFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XVtdO1xuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBuYW1lcyBvZiB0aGUgY29udGV4dHMgdGhhdCB0aGlzIG1lbnUgbGlzdGVucyBvbi5cblx0ICovXG5cdGdldE1lbnVDb250ZXh0cyhpZDogTWVudUlkKTogUmVhZG9ubHlTZXQ8c3RyaW5nPjtcblxuXHQvKipcblx0ICogUmVzZXQgKiphbGwqKiBtZW51IGl0ZW0gaGlkZGVuIHN0YXRlcy5cblx0ICovXG5cdHJlc2V0SGlkZGVuU3RhdGVzKCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFJlc2V0IHRoZSBtZW51J3MgaGlkZGVuIHN0YXRlcy5cblx0ICovXG5cdHJlc2V0SGlkZGVuU3RhdGVzKG1lbnVJZHM6IHJlYWRvbmx5IE1lbnVJZFtdIHwgdW5kZWZpbmVkKTogdm9pZDtcbn1cblxudHlwZSBJQ29tbWFuZHNNYXAgPSBNYXA8c3RyaW5nLCBJQ29tbWFuZEFjdGlvbj47XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lbnVSZWdpc3RyeUNoYW5nZUV2ZW50IHtcblx0aGFzKGlkOiBNZW51SWQpOiBib29sZWFuO1xufVxuXG5jbGFzcyBNZW51UmVnaXN0cnlDaGFuZ2VFdmVudCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FsbCA9IG5ldyBNYXA8TWVudUlkLCBNZW51UmVnaXN0cnlDaGFuZ2VFdmVudD4oKTtcblxuXHRzdGF0aWMgZm9yKGlkOiBNZW51SWQpOiBNZW51UmVnaXN0cnlDaGFuZ2VFdmVudCB7XG5cdFx0bGV0IHZhbHVlID0gdGhpcy5fYWxsLmdldChpZCk7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0dmFsdWUgPSBuZXcgTWVudVJlZ2lzdHJ5Q2hhbmdlRXZlbnQoaWQpO1xuXHRcdFx0dGhpcy5fYWxsLnNldChpZCwgdmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRzdGF0aWMgbWVyZ2UoZXZlbnRzOiBJTWVudVJlZ2lzdHJ5Q2hhbmdlRXZlbnRbXSk6IElNZW51UmVnaXN0cnlDaGFuZ2VFdmVudCB7XG5cdFx0Y29uc3QgaWRzID0gbmV3IFNldDxNZW51SWQ+KCk7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGV2ZW50cykge1xuXHRcdFx0aWYgKGl0ZW0gaW5zdGFuY2VvZiBNZW51UmVnaXN0cnlDaGFuZ2VFdmVudCkge1xuXHRcdFx0XHRpZHMuYWRkKGl0ZW0uaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaWRzO1xuXHR9XG5cblx0cmVhZG9ubHkgaGFzOiAoaWQ6IE1lbnVJZCkgPT4gYm9vbGVhbjtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgaWQ6IE1lbnVJZCkge1xuXHRcdHRoaXMuaGFzID0gY2FuZGlkYXRlID0+IGNhbmRpZGF0ZSA9PT0gaWQ7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWVudVJlZ2lzdHJ5IHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNZW51OiBFdmVudDxJTWVudVJlZ2lzdHJ5Q2hhbmdlRXZlbnQ+O1xuXHRhZGRDb21tYW5kKHVzZXJDb21tYW5kOiBJQ29tbWFuZEFjdGlvbik6IElEaXNwb3NhYmxlO1xuXHRnZXRDb21tYW5kKGlkOiBzdHJpbmcpOiBJQ29tbWFuZEFjdGlvbiB8IHVuZGVmaW5lZDtcblx0Z2V0Q29tbWFuZHMoKTogSUNvbW1hbmRzTWFwO1xuXG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZCBVc2UgYGFwcGVuZE1lbnVJdGVtYCBvciBtb3N0IGxpa2VseSB1c2UgYHJlZ2lzdGVyQWN0aW9uMmAgaW5zdGVhZC4gVGhlcmUgc2hvdWxkIGJlIG5vIHN0cm9uZ1xuXHQgKiByZWFzb24gdG8gdXNlIHRoaXMgZGlyZWN0bHkuXG5cdCAqL1xuXHRhcHBlbmRNZW51SXRlbXMoaXRlbXM6IEl0ZXJhYmxlPHsgaWQ6IE1lbnVJZDsgaXRlbTogSU1lbnVJdGVtIHwgSVN1Ym1lbnVJdGVtIH0+KTogSURpc3Bvc2FibGU7XG5cdGFwcGVuZE1lbnVJdGVtKG1lbnU6IE1lbnVJZCwgaXRlbTogSU1lbnVJdGVtIHwgSVN1Ym1lbnVJdGVtKTogSURpc3Bvc2FibGU7XG5cdGdldE1lbnVJdGVtcyhsb2M6IE1lbnVJZCk6IEFycmF5PElNZW51SXRlbSB8IElTdWJtZW51SXRlbT47XG59XG5cbmV4cG9ydCBjb25zdCBNZW51UmVnaXN0cnk6IElNZW51UmVnaXN0cnkgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJTWVudVJlZ2lzdHJ5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kcyA9IG5ldyBNYXA8c3RyaW5nLCBJQ29tbWFuZEFjdGlvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbWVudUl0ZW1zID0gbmV3IE1hcDxNZW51SWQsIExpbmtlZExpc3Q8SU1lbnVJdGVtIHwgSVN1Ym1lbnVJdGVtPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNZW51ID0gbmV3IE1pY3JvdGFza0VtaXR0ZXI8SU1lbnVSZWdpc3RyeUNoYW5nZUV2ZW50Pih7XG5cdFx0bWVyZ2U6IE1lbnVSZWdpc3RyeUNoYW5nZUV2ZW50Lm1lcmdlXG5cdH0pO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWVudTogRXZlbnQ8SU1lbnVSZWdpc3RyeUNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlTWVudS5ldmVudDtcblxuXHRhZGRDb21tYW5kKGNvbW1hbmQ6IElDb21tYW5kQWN0aW9uKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX2NvbW1hbmRzLnNldChjb21tYW5kLmlkLCBjb21tYW5kKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU1lbnUuZmlyZShNZW51UmVnaXN0cnlDaGFuZ2VFdmVudC5mb3IoTWVudUlkLkNvbW1hbmRQYWxldHRlKSk7XG5cblx0XHRyZXR1cm4gbWFya0FzU2luZ2xldG9uKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY29tbWFuZHMuZGVsZXRlKGNvbW1hbmQuaWQpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTWVudS5maXJlKE1lbnVSZWdpc3RyeUNoYW5nZUV2ZW50LmZvcihNZW51SWQuQ29tbWFuZFBhbGV0dGUpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRnZXRDb21tYW5kKGlkOiBzdHJpbmcpOiBJQ29tbWFuZEFjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbW1hbmRzLmdldChpZCk7XG5cdH1cblxuXHRnZXRDb21tYW5kcygpOiBJQ29tbWFuZHNNYXAge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBNYXA8c3RyaW5nLCBJQ29tbWFuZEFjdGlvbj4oKTtcblx0XHR0aGlzLl9jb21tYW5kcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiBtYXAuc2V0KGtleSwgdmFsdWUpKTtcblx0XHRyZXR1cm4gbWFwO1xuXHR9XG5cblx0YXBwZW5kTWVudUl0ZW0oaWQ6IE1lbnVJZCwgaXRlbTogSU1lbnVJdGVtIHwgSVN1Ym1lbnVJdGVtKTogSURpc3Bvc2FibGUge1xuXHRcdGxldCBsaXN0ID0gdGhpcy5fbWVudUl0ZW1zLmdldChpZCk7XG5cdFx0aWYgKCFsaXN0KSB7XG5cdFx0XHRsaXN0ID0gbmV3IExpbmtlZExpc3QoKTtcblx0XHRcdHRoaXMuX21lbnVJdGVtcy5zZXQoaWQsIGxpc3QpO1xuXHRcdH1cblx0XHRjb25zdCBybSA9IGxpc3QucHVzaChpdGVtKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU1lbnUuZmlyZShNZW51UmVnaXN0cnlDaGFuZ2VFdmVudC5mb3IoaWQpKTtcblx0XHRyZXR1cm4gbWFya0FzU2luZ2xldG9uKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRybSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNZW51LmZpcmUoTWVudVJlZ2lzdHJ5Q2hhbmdlRXZlbnQuZm9yKGlkKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0YXBwZW5kTWVudUl0ZW1zKGl0ZW1zOiBJdGVyYWJsZTx7IGlkOiBNZW51SWQ7IGl0ZW06IElNZW51SXRlbSB8IElTdWJtZW51SXRlbSB9Pik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Zm9yIChjb25zdCB7IGlkLCBpdGVtIH0gb2YgaXRlbXMpIHtcblx0XHRcdHJlc3VsdC5hZGQodGhpcy5hcHBlbmRNZW51SXRlbShpZCwgaXRlbSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Z2V0TWVudUl0ZW1zKGlkOiBNZW51SWQpOiBBcnJheTxJTWVudUl0ZW0gfCBJU3VibWVudUl0ZW0+IHtcblx0XHRsZXQgcmVzdWx0OiBBcnJheTxJTWVudUl0ZW0gfCBJU3VibWVudUl0ZW0+O1xuXHRcdGlmICh0aGlzLl9tZW51SXRlbXMuaGFzKGlkKSkge1xuXHRcdFx0cmVzdWx0ID0gWy4uLnRoaXMuX21lbnVJdGVtcy5nZXQoaWQpIV07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdCA9IFtdO1xuXHRcdH1cblx0XHRpZiAoaWQgPT09IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSkge1xuXHRcdFx0Ly8gQ29tbWFuZFBhbGV0dGUgaXMgc3BlY2lhbCBiZWNhdXNlIGl0IHNob3dzXG5cdFx0XHQvLyBhbGwgY29tbWFuZHMgYnkgZGVmYXVsdFxuXHRcdFx0dGhpcy5fYXBwZW5kSW1wbGljaXRJdGVtcyhyZXN1bHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwZW5kSW1wbGljaXRJdGVtcyhyZXN1bHQ6IEFycmF5PElNZW51SXRlbSB8IElTdWJtZW51SXRlbT4pIHtcblx0XHRjb25zdCBzZXQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiByZXN1bHQpIHtcblx0XHRcdGlmIChpc0lNZW51SXRlbShpdGVtKSkge1xuXHRcdFx0XHRzZXQuYWRkKGl0ZW0uY29tbWFuZC5pZCk7XG5cdFx0XHRcdGlmIChpdGVtLmFsdCkge1xuXHRcdFx0XHRcdHNldC5hZGQoaXRlbS5hbHQuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1hbmRzLmZvckVhY2goKGNvbW1hbmQsIGlkKSA9PiB7XG5cdFx0XHRpZiAoIXNldC5oYXMoaWQpKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgY29tbWFuZCB9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufTtcblxuZXhwb3J0IGNsYXNzIFN1Ym1lbnVJdGVtQWN0aW9uIGV4dGVuZHMgU3VibWVudUFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgaXRlbTogSVN1Ym1lbnVJdGVtLFxuXHRcdHJlYWRvbmx5IGhpZGVBY3Rpb25zOiBJTWVudUl0ZW1IaWRlIHwgdW5kZWZpbmVkLFxuXHRcdGFjdGlvbnM6IHJlYWRvbmx5IElBY3Rpb25bXSxcblx0KSB7XG5cdFx0c3VwZXIoYHN1Ym1lbnVpdGVtLiR7aXRlbS5zdWJtZW51LmlkfWAsIHR5cGVvZiBpdGVtLnRpdGxlID09PSAnc3RyaW5nJyA/IGl0ZW0udGl0bGUgOiBpdGVtLnRpdGxlLnZhbHVlLCBhY3Rpb25zLCAnc3VibWVudScpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lbnVJdGVtSGlkZSB7XG5cdHJlYWRvbmx5IGlzSGlkZGVuOiBib29sZWFuO1xuXHRyZWFkb25seSBoaWRlOiBJQWN0aW9uO1xuXHRyZWFkb25seSB0b2dnbGU6IElBY3Rpb247XG59XG5cbi8vIGltcGxlbWVudHMgSUFjdGlvbiwgZG9lcyBOT1QgZXh0ZW5kIEFjdGlvbiwgc28gdGhhdCBubyBvbmVcbi8vIHN1YnNjcmliZXMgdG8gZXZlbnRzIG9mIEFjdGlvbiBvciBtb2RpZmllZCBwcm9wZXJ0aWVzXG5leHBvcnQgY2xhc3MgTWVudUl0ZW1BY3Rpb24gaW1wbGVtZW50cyBJQWN0aW9uIHtcblxuXHRzdGF0aWMgbGFiZWwoYWN0aW9uOiBJQ29tbWFuZEFjdGlvbiwgb3B0aW9ucz86IElNZW51QWN0aW9uT3B0aW9ucyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG9wdGlvbnM/LnJlbmRlclNob3J0VGl0bGUgJiYgYWN0aW9uLnNob3J0VGl0bGVcblx0XHRcdD8gKHR5cGVvZiBhY3Rpb24uc2hvcnRUaXRsZSA9PT0gJ3N0cmluZycgPyBhY3Rpb24uc2hvcnRUaXRsZSA6IGFjdGlvbi5zaG9ydFRpdGxlLnZhbHVlKVxuXHRcdFx0OiAodHlwZW9mIGFjdGlvbi50aXRsZSA9PT0gJ3N0cmluZycgPyBhY3Rpb24udGl0bGUgOiBhY3Rpb24udGl0bGUudmFsdWUpO1xuXHR9XG5cblx0cmVhZG9ubHkgaXRlbTogSUNvbW1hbmRBY3Rpb247XG5cdHJlYWRvbmx5IGFsdDogTWVudUl0ZW1BY3Rpb24gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSU1lbnVBY3Rpb25PcHRpb25zIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRvb2x0aXA6IHN0cmluZztcblx0cmVhZG9ubHkgY2xhc3M6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2hlY2tlZD86IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aXRlbTogSUNvbW1hbmRBY3Rpb24sXG5cdFx0YWx0OiBJQ29tbWFuZEFjdGlvbiB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zOiBJTWVudUFjdGlvbk9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgaGlkZUFjdGlvbnM6IElNZW51SXRlbUhpZGUgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgbWVudUtleWJpbmRpbmc6IElBY3Rpb24gfCB1bmRlZmluZWQsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLmlkID0gaXRlbS5pZDtcblx0XHR0aGlzLmxhYmVsID0gTWVudUl0ZW1BY3Rpb24ubGFiZWwoaXRlbSwgb3B0aW9ucyk7XG5cdFx0dGhpcy50b29sdGlwID0gKHR5cGVvZiBpdGVtLnRvb2x0aXAgPT09ICdzdHJpbmcnID8gaXRlbS50b29sdGlwIDogaXRlbS50b29sdGlwPy52YWx1ZSkgPz8gJyc7XG5cdFx0dGhpcy5lbmFibGVkID0gIWl0ZW0ucHJlY29uZGl0aW9uIHx8IGNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoaXRlbS5wcmVjb25kaXRpb24pO1xuXHRcdHRoaXMuY2hlY2tlZCA9IHVuZGVmaW5lZDtcblxuXHRcdGxldCBpY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoaXRlbS50b2dnbGVkKSB7XG5cdFx0XHRjb25zdCB0b2dnbGVkID0gKChpdGVtLnRvZ2dsZWQgYXMgeyBjb25kaXRpb246IENvbnRleHRLZXlFeHByZXNzaW9uIH0pLmNvbmRpdGlvbiA/IGl0ZW0udG9nZ2xlZCA6IHsgY29uZGl0aW9uOiBpdGVtLnRvZ2dsZWQgfSkgYXMge1xuXHRcdFx0XHRjb25kaXRpb246IENvbnRleHRLZXlFeHByZXNzaW9uOyBpY29uPzogSWNvbjsgdG9vbHRpcD86IHN0cmluZyB8IElMb2NhbGl6ZWRTdHJpbmc7IHRpdGxlPzogc3RyaW5nIHwgSUxvY2FsaXplZFN0cmluZztcblx0XHRcdH07XG5cdFx0XHR0aGlzLmNoZWNrZWQgPSBjb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHRvZ2dsZWQuY29uZGl0aW9uKTtcblx0XHRcdGlmICh0aGlzLmNoZWNrZWQgJiYgdG9nZ2xlZC50b29sdGlwKSB7XG5cdFx0XHRcdHRoaXMudG9vbHRpcCA9IHR5cGVvZiB0b2dnbGVkLnRvb2x0aXAgPT09ICdzdHJpbmcnID8gdG9nZ2xlZC50b29sdGlwIDogdG9nZ2xlZC50b29sdGlwLnZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5jaGVja2VkICYmIFRoZW1lSWNvbi5pc1RoZW1lSWNvbih0b2dnbGVkLmljb24pKSB7XG5cdFx0XHRcdGljb24gPSB0b2dnbGVkLmljb247XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmNoZWNrZWQgJiYgdG9nZ2xlZC50aXRsZSkge1xuXHRcdFx0XHR0aGlzLmxhYmVsID0gdHlwZW9mIHRvZ2dsZWQudGl0bGUgPT09ICdzdHJpbmcnID8gdG9nZ2xlZC50aXRsZSA6IHRvZ2dsZWQudGl0bGUudmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFpY29uKSB7XG5cdFx0XHRpY29uID0gVGhlbWVJY29uLmlzVGhlbWVJY29uKGl0ZW0uaWNvbikgPyBpdGVtLmljb24gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5pdGVtID0gaXRlbTtcblx0XHR0aGlzLmFsdCA9IGFsdCA/IG5ldyBNZW51SXRlbUFjdGlvbihhbHQsIHVuZGVmaW5lZCwgb3B0aW9ucywgaGlkZUFjdGlvbnMsIHVuZGVmaW5lZCwgY29udGV4dEtleVNlcnZpY2UsIF9jb21tYW5kU2VydmljZSkgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5jbGFzcyA9IGljb24gJiYgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pO1xuXG5cdH1cblxuXHRydW4oLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHJ1bkFyZ3M6IHVua25vd25bXSA9IFtdO1xuXG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LmFyZ3MpIHtcblx0XHRcdHJ1bkFyZ3MgPSBbLi4ucnVuQXJncywgLi4udGhpcy5fb3B0aW9ucy5hcmdzXTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX29wdGlvbnM/LmFyZykge1xuXHRcdFx0cnVuQXJncyA9IFsuLi5ydW5BcmdzLCB0aGlzLl9vcHRpb25zLmFyZ107XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LnNob3VsZEZvcndhcmRBcmdzKSB7XG5cdFx0XHRydW5BcmdzID0gWy4uLnJ1bkFyZ3MsIC4uLmFyZ3NdO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCh0aGlzLmlkLCAuLi5ydW5BcmdzKTtcblx0fVxufVxuXG4vLyNyZWdpb24gLS0tIElBY3Rpb24yXG5cbnR5cGUgT25lT3JOPFQ+ID0gVCB8IFRbXTtcblxuaW50ZXJmYWNlIElBY3Rpb24yQ29tbW9uT3B0aW9ucyBleHRlbmRzIElDb21tYW5kQWN0aW9uIHtcblx0LyoqXG5cdCAqIE9uZSBvciBtYW55IG1lbnUgaXRlbXMuXG5cdCAqL1xuXHRtZW51PzogT25lT3JOPHsgaWQ6IE1lbnVJZDsgcHJlY29uZGl0aW9uPzogbnVsbCB9ICYgT21pdDxJTWVudUl0ZW0sICdjb21tYW5kJz4+O1xuXG5cdC8qKlxuXHQgKiBPbmUga2V5YmluZGluZy5cblx0ICovXG5cdGtleWJpbmRpbmc/OiBPbmVPck48T21pdDxJS2V5YmluZGluZ1J1bGUsICdpZCc+Pjtcbn1cblxuaW50ZXJmYWNlIElCYXNlQWN0aW9uMk9wdGlvbnMgZXh0ZW5kcyBJQWN0aW9uMkNvbW1vbk9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBUaGlzIHR5cGUgaXMgdXNlZCB3aGVuIGFuIGFjdGlvbiBpcyBub3QgZ29pbmcgdG8gc2hvdyB1cCBpbiB0aGUgY29tbWFuZCBwYWxldHRlLlxuXHQgKiBJbiB0aGF0IGNhc2UsIGl0J3MgYWJsZSB0byB1c2UgYSBzdHJpbmcgZm9yIHRoZSBgdGl0bGVgIGFuZCBgY2F0ZWdvcnlgIHByb3BlcnRpZXMuXG5cdCAqL1xuXHRmMT86IGZhbHNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21tYW5kUGFsZXR0ZU9wdGlvbnMgZXh0ZW5kcyBJQWN0aW9uMkNvbW1vbk9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBUaGUgdGl0bGUgb2YgdGhlIGNvbW1hbmQgdGhhdCB3aWxsIGJlIGRpc3BsYXllZCBpbiB0aGUgY29tbWFuZCBwYWxldHRlIGFmdGVyIHRoZSBjYXRlZ29yeS5cblx0ICogIFRoaXMgb3ZlcnJpZGVzIHtAbGluayBJQ29tbWFuZEFjdGlvbi50aXRsZX0gdG8gZW5zdXJlIGEgc3RyaW5nIGlzbid0IHVzZWQgc28gdGhhdCB0aGUgdGl0bGVcblx0ICogIGluY2x1ZGVzIHRoZSBsb2NhbGl6ZWQgdmFsdWUgYW5kIHRoZSBvcmlnaW5hbCB2YWx1ZSBmb3IgdXNlcnMgdXNpbmcgbGFuZ3VhZ2UgcGFja3MuXG5cdCAqL1xuXHR0aXRsZTogSUNvbW1hbmRBY3Rpb25UaXRsZTtcblxuXHQvKipcblx0ICogVGhlIGNhdGVnb3J5IG9mIHRoZSBjb21tYW5kIHRoYXQgd2lsbCBiZSBkaXNwbGF5ZWQgaW4gdGhlIGNvbW1hbmQgcGFsZXR0ZSBiZWZvcmUgdGhlIHRpdGxlIHN1ZmZpeGVkLlxuXHQgKiB3aXRoIGEgY29sb24gVGhpcyBvdmVycmlkZXMge0BsaW5rIElDb21tYW5kQWN0aW9uLnRpdGxlfSB0byBlbnN1cmUgYSBzdHJpbmcgaXNuJ3QgdXNlZCBzbyB0aGF0XG5cdCAqIHRoZSB0aXRsZSBpbmNsdWRlcyB0aGUgbG9jYWxpemVkIHZhbHVlIGFuZCB0aGUgb3JpZ2luYWwgdmFsdWUgZm9yIHVzZXJzIHVzaW5nIGxhbmd1YWdlIHBhY2tzLlxuXHQgKi9cblx0Y2F0ZWdvcnk/OiBrZXlvZiB0eXBlb2YgQ2F0ZWdvcmllcyB8IElMb2NhbGl6ZWRTdHJpbmc7XG5cblx0LyoqXG5cdCAqIFNob3J0aGFuZCB0byBhZGQgdGhpcyBjb21tYW5kIHRvIHRoZSBjb21tYW5kIHBhbGV0dGUuIE5vdGU6IHRoaXMgaXMgbm90IHRoZSBvbmx5IHdheSB0byBkZWNsYXJlIHRoYXRcblx0ICogYSBjb21tYW5kIHNob3VsZCBiZSBpbiB0aGUgY29tbWFuZCBwYWxldHRlLi4uIGhvd2V2ZXIsIGVuZm9yY2luZyBJTG9jYWxpemVkU3RyaW5nIGluIHRoZSBvdGhlciBzY2VuYXJpb3Ncblx0ICogaXMgbXVjaCBtb3JlIGNoYWxsZW5naW5nIGFuZCB0aGlzIGdldHMgdXMgbW9zdCBvZiB0aGUgd2F5IHRoZXJlLlxuXHQgKi9cblx0ZjE6IHRydWU7XG59XG5cbmV4cG9ydCB0eXBlIElBY3Rpb24yT3B0aW9ucyA9IElDb21tYW5kUGFsZXR0ZU9wdGlvbnMgfCBJQmFzZUFjdGlvbjJPcHRpb25zO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBY3Rpb24yRjFSZXF1aXJlZE9wdGlvbnMge1xuXHR0aXRsZTogSUNvbW1hbmRBY3Rpb25UaXRsZTtcblx0Y2F0ZWdvcnk/OiBrZXlvZiB0eXBlb2YgQ2F0ZWdvcmllcyB8IElMb2NhbGl6ZWRTdHJpbmc7XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgZGVzYzogUmVhZG9ubHk8SUFjdGlvbjJPcHRpb25zPikgeyB9XG5cdGFic3RyYWN0IHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQWN0aW9uMihjdG9yOiB7IG5ldygpOiBBY3Rpb24yIH0pOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107IC8vIG5vdCB1c2luZyBgRGlzcG9zYWJsZVN0b3JlYCB0byByZWR1Y2Ugc3RhcnR1cCBwZXJmIGNvc3Rcblx0Y29uc3QgYWN0aW9uID0gbmV3IGN0b3IoKTtcblxuXHRjb25zdCB7IGYxLCBtZW51LCBrZXliaW5kaW5nLCAuLi5jb21tYW5kIH0gPSBhY3Rpb24uZGVzYztcblxuXHRpZiAoQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKGNvbW1hbmQuaWQpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgcmVnaXN0ZXIgdHdvIGNvbW1hbmRzIHdpdGggdGhlIHNhbWUgaWQ6ICR7Y29tbWFuZC5pZH1gKTtcblx0fVxuXG5cdC8vIGNvbW1hbmRcblx0ZGlzcG9zYWJsZXMucHVzaChDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdFx0aWQ6IGNvbW1hbmQuaWQsXG5cdFx0aGFuZGxlcjogKGFjY2Vzc29yLCAuLi5hcmdzKSA9PiBhY3Rpb24ucnVuKGFjY2Vzc29yLCAuLi5hcmdzKSxcblx0XHRtZXRhZGF0YTogY29tbWFuZC5tZXRhZGF0YSA/PyB7IGRlc2NyaXB0aW9uOiBhY3Rpb24uZGVzYy50aXRsZSB9XG5cdH0pKTtcblxuXHQvLyBtZW51XG5cdGlmIChBcnJheS5pc0FycmF5KG1lbnUpKSB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIG1lbnUpIHtcblx0XHRcdGRpc3Bvc2FibGVzLnB1c2goTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKGl0ZW0uaWQsIHsgY29tbWFuZDogeyAuLi5jb21tYW5kLCBwcmVjb25kaXRpb246IGl0ZW0ucHJlY29uZGl0aW9uID09PSBudWxsID8gdW5kZWZpbmVkIDogY29tbWFuZC5wcmVjb25kaXRpb24gfSwgLi4uaXRlbSB9KSk7XG5cdFx0fVxuXG5cdH0gZWxzZSBpZiAobWVudSkge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnUuaWQsIHsgY29tbWFuZDogeyAuLi5jb21tYW5kLCBwcmVjb25kaXRpb246IG1lbnUucHJlY29uZGl0aW9uID09PSBudWxsID8gdW5kZWZpbmVkIDogY29tbWFuZC5wcmVjb25kaXRpb24gfSwgLi4ubWVudSB9KSk7XG5cdH1cblx0aWYgKGYxKSB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQsIHdoZW46IGNvbW1hbmQucHJlY29uZGl0aW9uIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKE1lbnVSZWdpc3RyeS5hZGRDb21tYW5kKGNvbW1hbmQpKTtcblx0fVxuXG5cdC8vIGtleWJpbmRpbmdcblx0aWYgKEFycmF5LmlzQXJyYXkoa2V5YmluZGluZykpIHtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2Yga2V5YmluZGluZykge1xuXHRcdFx0ZGlzcG9zYWJsZXMucHVzaChLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0XHQuLi5pdGVtLFxuXHRcdFx0XHRpZDogY29tbWFuZC5pZCxcblx0XHRcdFx0d2hlbjogY29tbWFuZC5wcmVjb25kaXRpb24gPyBDb250ZXh0S2V5RXhwci5hbmQoY29tbWFuZC5wcmVjb25kaXRpb24sIGl0ZW0ud2hlbikgOiBpdGVtLndoZW5cblx0XHRcdH0pKTtcblx0XHR9XG5cdH0gZWxzZSBpZiAoa2V5YmluZGluZykge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlcktleWJpbmRpbmdSdWxlKHtcblx0XHRcdC4uLmtleWJpbmRpbmcsXG5cdFx0XHRpZDogY29tbWFuZC5pZCxcblx0XHRcdHdoZW46IGNvbW1hbmQucHJlY29uZGl0aW9uID8gQ29udGV4dEtleUV4cHIuYW5kKGNvbW1hbmQucHJlY29uZGl0aW9uLCBrZXliaW5kaW5nLndoZW4pIDoga2V5YmluZGluZy53aGVuXG5cdFx0fSkpO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRkaXNwb3NlKCkge1xuXHRcdFx0ZGlzcG9zZShkaXNwb3NhYmxlcyk7XG5cdFx0fVxuXHR9O1xufVxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQWtCLHFCQUFxQjtBQUN2QyxTQUFnQix3QkFBd0I7QUFDeEMsU0FBUyxpQkFBaUIsU0FBc0IsaUJBQWlCLG9CQUFvQjtBQUNyRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQjtBQUcxQixTQUFTLGtCQUFrQix1QkFBdUI7QUFDbEQsU0FBUyxnQkFBc0MsMEJBQTBCO0FBQ3pFLFNBQVMsdUJBQXlDO0FBQ2xELFNBQTBCLDJCQUEyQjtBQThDOUMsU0FBUyxZQUFZLE1BQWtDO0FBQzdELFNBQVEsS0FBbUIsWUFBWTtBQUN4QztBQUVPLFNBQVMsZUFBZSxNQUFxQztBQUNuRSxTQUFRLEtBQXNCLFlBQVk7QUFDM0M7QUFFTyxNQUFNLFVBQU4sTUFBTSxRQUFPO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUE0UW5CLE9BQU8sSUFBSSxZQUE0QjtBQUN0QyxXQUFPLFFBQU8sV0FBVyxJQUFJLFVBQVUsS0FBSyxJQUFJLFFBQU8s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
