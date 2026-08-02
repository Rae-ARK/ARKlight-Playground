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
var __decorateParam = (index2, decorator) => (target, key) => decorator(target, key, index2);
import { localize } from "../../../../nls.js";
import { isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import * as resources from "../../../../base/common/resources.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { index } from "../../../../base/common/arrays.js";
import { isProposedApiEnabled } from "../../extensions/common/extensions.js";
import { Extensions as ExtensionFeaturesExtensions } from "../../extensionManagement/common/extensionFeatures.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { platform } from "../../../../base/common/process.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
const apiMenus = [
  {
    key: "commandPalette",
    id: MenuId.CommandPalette,
    description: localize("menus.commandPalette", "The Command Palette"),
    supportsSubmenus: false
  },
  {
    key: "touchBar",
    id: MenuId.TouchBarContext,
    description: localize("menus.touchBar", "The touch bar (macOS only)"),
    supportsSubmenus: false
  },
  {
    key: "editor/title",
    id: MenuId.EditorTitle,
    description: localize("menus.editorTitle", "The editor title menu")
  },
  {
    key: "modalEditor/editorTitle",
    id: MenuId.ModalEditorEditorTitle,
    description: localize("menus.modalEditorEditorTitle", "The editor title menu in the modal editor")
  },
  {
    key: "editor/title/run",
    id: MenuId.EditorTitleRun,
    description: localize("menus.editorTitleRun", "Run submenu inside the editor title menu")
  },
  {
    key: "editor/context",
    id: MenuId.EditorContext,
    description: localize("menus.editorContext", "The editor context menu")
  },
  {
    key: "editor/context/copy",
    id: MenuId.EditorContextCopy,
    description: localize("menus.editorContextCopyAs", "'Copy as' submenu in the editor context menu")
  },
  {
    key: "editor/context/share",
    id: MenuId.EditorContextShare,
    description: localize("menus.editorContextShare", "'Share' submenu in the editor context menu"),
    proposed: "contribShareMenu"
  },
  {
    key: "explorer/context",
    id: MenuId.ExplorerContext,
    description: localize("menus.explorerContext", "The file explorer context menu")
  },
  {
    key: "explorer/context/share",
    id: MenuId.ExplorerContextShare,
    description: localize("menus.explorerContextShare", "'Share' submenu in the file explorer context menu"),
    proposed: "contribShareMenu"
  },
  {
    key: "editor/title/context",
    id: MenuId.EditorTitleContext,
    description: localize("menus.editorTabContext", "The editor tabs context menu")
  },
  {
    key: "editor/title/context/share",
    id: MenuId.EditorTitleContextShare,
    description: localize("menus.editorTitleContextShare", "'Share' submenu inside the editor title context menu"),
    proposed: "contribShareMenu"
  },
  {
    key: "debug/callstack/context",
    id: MenuId.DebugCallStackContext,
    description: localize("menus.debugCallstackContext", "The debug callstack view context menu")
  },
  {
    key: "debug/variables/context",
    id: MenuId.DebugVariablesContext,
    description: localize("menus.debugVariablesContext", "The debug variables view context menu")
  },
  {
    key: "debug/watch/context",
    id: MenuId.DebugWatchContext,
    description: localize("menus.debugWatchContext", "The debug watch view context menu")
  },
  {
    key: "debug/toolBar",
    id: MenuId.DebugToolBar,
    description: localize("menus.debugToolBar", "The debug toolbar menu")
  },
  {
    key: "debug/createConfiguration",
    id: MenuId.DebugCreateConfiguration,
    proposed: "contribDebugCreateConfiguration",
    description: localize("menus.debugCreateConfiguation", "The debug create configuration menu")
  },
  {
    key: "notebook/variables/context",
    id: MenuId.NotebookVariablesContext,
    description: localize("menus.notebookVariablesContext", "The notebook variables view context menu")
  },
  {
    key: "menuBar/home",
    id: MenuId.MenubarHomeMenu,
    description: localize("menus.home", "The home indicator context menu (web only)"),
    proposed: "contribMenuBarHome",
    supportsSubmenus: false
  },
  {
    key: "menuBar/edit/copy",
    id: MenuId.MenubarCopy,
    description: localize("menus.opy", "'Copy as' submenu in the top level Edit menu")
  },
  {
    key: "chat/input/status",
    id: MenuId.ChatInputStatus,
    description: localize("menus.chatInputStatus", "The status indicator area at the rightmost end of the toolbar shown beneath the chat input"),
    supportsSubmenus: false
  },
  {
    key: "scm/title",
    id: MenuId.SCMTitle,
    description: localize("menus.scmTitle", "The Source Control title menu")
  },
  {
    key: "scm/sourceControl",
    id: MenuId.SCMSourceControl,
    description: localize("menus.scmSourceControl", "The Source Control menu")
  },
  {
    key: "scm/repositories/title",
    id: MenuId.SCMSourceControlTitle,
    description: localize("menus.scmSourceControlTitle", "The Source Control Repositories title menu"),
    proposed: "contribSourceControlTitleMenu"
  },
  {
    key: "scm/repository",
    id: MenuId.SCMSourceControlInline,
    description: localize("menus.scmSourceControlInline", "The Source Control repository menu")
  },
  {
    key: "scm/resourceState/context",
    id: MenuId.SCMResourceContext,
    description: localize("menus.resourceStateContext", "The Source Control resource state context menu")
  },
  {
    key: "scm/resourceFolder/context",
    id: MenuId.SCMResourceFolderContext,
    description: localize("menus.resourceFolderContext", "The Source Control resource folder context menu")
  },
  {
    key: "scm/resourceGroup/context",
    id: MenuId.SCMResourceGroupContext,
    description: localize("menus.resourceGroupContext", "The Source Control resource group context menu")
  },
  {
    key: "scm/change/title",
    id: MenuId.SCMChangeContext,
    description: localize("menus.changeTitle", "The Source Control inline change menu")
  },
  {
    key: "scm/inputBox",
    id: MenuId.SCMInputBox,
    description: localize("menus.input", "The Source Control input box menu"),
    proposed: "contribSourceControlInputBoxMenu"
  },
  {
    key: "scm/history/title",
    id: MenuId.SCMHistoryTitle,
    description: localize("menus.scmHistoryTitle", "The Source Control History title menu"),
    proposed: "contribSourceControlHistoryTitleMenu"
  },
  {
    key: "scm/historyItem/context",
    id: MenuId.SCMHistoryItemContext,
    description: localize("menus.historyItemContext", "The Source Control history item context menu"),
    proposed: "contribSourceControlHistoryItemMenu"
  },
  {
    key: "scm/historyItemRef/context",
    id: MenuId.SCMHistoryItemRefContext,
    description: localize("menus.historyItemRefContext", "The Source Control history item reference context menu"),
    proposed: "contribSourceControlHistoryItemMenu"
  },
  {
    key: "scm/artifactGroup/context",
    id: MenuId.SCMArtifactGroupContext,
    description: localize("menus.artifactGroupContext", "The Source Control artifact group context menu"),
    proposed: "contribSourceControlArtifactGroupMenu"
  },
  {
    key: "scm/artifact/context",
    id: MenuId.SCMArtifactContext,
    description: localize("menus.artifactContext", "The Source Control artifact context menu"),
    proposed: "contribSourceControlArtifactMenu"
  },
  {
    key: "statusBar/remoteIndicator",
    id: MenuId.StatusBarRemoteIndicatorMenu,
    description: localize("menus.statusBarRemoteIndicator", "The remote indicator menu in the status bar"),
    supportsSubmenus: false
  },
  {
    key: "terminal/context",
    id: MenuId.TerminalInstanceContext,
    description: localize("menus.terminalContext", "The terminal context menu")
  },
  {
    key: "terminal/title/context",
    id: MenuId.TerminalTabContext,
    description: localize("menus.terminalTabContext", "The terminal tabs context menu")
  },
  {
    key: "view/title",
    id: MenuId.ViewTitle,
    description: localize("view.viewTitle", "The contributed view title menu")
  },
  {
    key: "viewContainer/title",
    id: MenuId.ViewContainerTitle,
    description: localize("view.containerTitle", "The contributed view container title menu"),
    proposed: "contribViewContainerTitle"
  },
  {
    key: "view/item/context",
    id: MenuId.ViewItemContext,
    description: localize("view.itemContext", "The contributed view item context menu")
  },
  {
    key: "comments/comment/editorActions",
    id: MenuId.CommentEditorActions,
    description: localize("commentThread.editorActions", "The contributed comment editor actions"),
    proposed: "contribCommentEditorActionsMenu"
  },
  {
    key: "comments/commentThread/title",
    id: MenuId.CommentThreadTitle,
    description: localize("commentThread.title", "The contributed comment thread title menu")
  },
  {
    key: "comments/commentThread/context",
    id: MenuId.CommentThreadActions,
    description: localize("commentThread.actions", "The contributed comment thread context menu, rendered as buttons below the comment editor"),
    supportsSubmenus: false
  },
  {
    key: "comments/commentThread/additionalActions",
    id: MenuId.CommentThreadAdditionalActions,
    description: localize("commentThread.actions", "The contributed comment thread context menu, rendered as buttons below the comment editor"),
    supportsSubmenus: true,
    proposed: "contribCommentThreadAdditionalMenu"
  },
  {
    key: "comments/commentThread/title/context",
    id: MenuId.CommentThreadTitleContext,
    description: localize("commentThread.titleContext", "The contributed comment thread title's peek context menu, rendered as a right click menu on the comment thread's peek title."),
    proposed: "contribCommentPeekContext"
  },
  {
    key: "comments/comment/title",
    id: MenuId.CommentTitle,
    description: localize("comment.title", "The contributed comment title menu")
  },
  {
    key: "comments/comment/context",
    id: MenuId.CommentActions,
    description: localize("comment.actions", "The contributed comment context menu, rendered as buttons below the comment editor"),
    supportsSubmenus: false
  },
  {
    key: "comments/commentThread/comment/context",
    id: MenuId.CommentThreadCommentContext,
    description: localize("comment.commentContext", "The contributed comment context menu, rendered as a right click menu on the an individual comment in the comment thread's peek view."),
    proposed: "contribCommentPeekContext"
  },
  {
    key: "commentsView/commentThread/context",
    id: MenuId.CommentsViewThreadActions,
    description: localize("commentsView.threadActions", "The contributed comment thread context menu in the comments view"),
    proposed: "contribCommentsViewThreadMenus"
  },
  {
    key: "notebook/toolbar",
    id: MenuId.NotebookToolbar,
    description: localize("notebook.toolbar", "The contributed notebook toolbar menu")
  },
  {
    key: "notebook/kernelSource",
    id: MenuId.NotebookKernelSource,
    description: localize("notebook.kernelSource", "The contributed notebook kernel sources menu"),
    proposed: "notebookKernelSource"
  },
  {
    key: "notebook/cell/title",
    id: MenuId.NotebookCellTitle,
    description: localize("notebook.cell.title", "The contributed notebook cell title menu")
  },
  {
    key: "notebook/cell/execute",
    id: MenuId.NotebookCellExecute,
    description: localize("notebook.cell.execute", "The contributed notebook cell execution menu")
  },
  {
    key: "interactive/toolbar",
    id: MenuId.InteractiveToolbar,
    description: localize("interactive.toolbar", "The contributed interactive toolbar menu")
  },
  {
    key: "interactive/cell/title",
    id: MenuId.InteractiveCellTitle,
    description: localize("interactive.cell.title", "The contributed interactive cell title menu")
  },
  {
    key: "issue/reporter",
    id: MenuId.IssueReporter,
    description: localize("issue.reporter", "The contributed issue reporter menu")
  },
  {
    key: "testing/item/context",
    id: MenuId.TestItem,
    description: localize("testing.item.context", "The contributed test item menu")
  },
  {
    key: "testing/item/gutter",
    id: MenuId.TestItemGutter,
    description: localize("testing.item.gutter.title", "The menu for a gutter decoration for a test item")
  },
  {
    key: "testing/profiles/context",
    id: MenuId.TestProfilesContext,
    description: localize("testing.profiles.context.title", "The menu for configuring testing profiles.")
  },
  {
    key: "testing/item/result",
    id: MenuId.TestPeekElement,
    description: localize("testing.item.result.title", "The menu for an item in the Test Results view or peek.")
  },
  {
    key: "testing/message/context",
    id: MenuId.TestMessageContext,
    description: localize("testing.message.context.title", "A prominent button overlaying editor content where the message is displayed")
  },
  {
    key: "testing/message/content",
    id: MenuId.TestMessageContent,
    description: localize("testing.message.content.title", "Context menu for the message in the results tree")
  },
  {
    key: "extension/context",
    id: MenuId.ExtensionContext,
    description: localize("menus.extensionContext", "The extension context menu")
  },
  {
    key: "timeline/title",
    id: MenuId.TimelineTitle,
    description: localize("view.timelineTitle", "The Timeline view title menu")
  },
  {
    key: "timeline/item/context",
    id: MenuId.TimelineItemContext,
    description: localize("view.timelineContext", "The Timeline view item context menu")
  },
  {
    key: "ports/item/context",
    id: MenuId.TunnelContext,
    description: localize("view.tunnelContext", "The Ports view item context menu")
  },
  {
    key: "ports/item/origin/inline",
    id: MenuId.TunnelOriginInline,
    description: localize("view.tunnelOriginInline", "The Ports view item origin inline menu")
  },
  {
    key: "ports/item/port/inline",
    id: MenuId.TunnelPortInline,
    description: localize("view.tunnelPortInline", "The Ports view item port inline menu")
  },
  {
    key: "file/newFile",
    id: MenuId.NewFile,
    description: localize("file.newFile", "The 'New File...' quick pick, shown on welcome page and File menu."),
    supportsSubmenus: false
  },
  {
    key: "webview/context",
    id: MenuId.WebviewContext,
    description: localize("webview.context", "The webview context menu")
  },
  {
    key: "file/share",
    id: MenuId.MenubarShare,
    description: localize("menus.share", "Share submenu shown in the top level File menu."),
    proposed: "contribShareMenu"
  },
  {
    key: "editor/inlineCompletions/actions",
    id: MenuId.InlineCompletionsActions,
    description: localize("inlineCompletions.actions", "The actions shown when hovering on an inline completion"),
    supportsSubmenus: false,
    proposed: "inlineCompletionsAdditions"
  },
  {
    key: "editor/content",
    id: MenuId.EditorContent,
    description: localize("merge.toolbar", "The prominent button in an editor, overlays its content"),
    proposed: "contribEditorContentMenu"
  },
  {
    key: "editor/lineNumber/context",
    id: MenuId.EditorLineNumberContext,
    description: localize("editorLineNumberContext", "The contributed editor line number context menu")
  },
  {
    key: "mergeEditor/result/title",
    id: MenuId.MergeInputResultToolbar,
    description: localize("menus.mergeEditorResult", "The result toolbar of the merge editor"),
    proposed: "contribMergeEditorMenus"
  },
  {
    key: "multiDiffEditor/content",
    id: MenuId.MultiDiffEditorContent,
    description: localize("menus.multiDiffEditorContent", "A prominent button overlaying the multi diff editor"),
    proposed: "contribEditorContentMenu"
  },
  {
    key: "multiDiffEditor/resource/title",
    id: MenuId.MultiDiffEditorFileToolbar,
    description: localize("menus.multiDiffEditorResource", "The resource toolbar in the multi diff editor"),
    proposed: "contribMultiDiffEditorMenus"
  },
  {
    key: "diffEditor/gutter/hunk",
    id: MenuId.DiffEditorHunkToolbar,
    description: localize("menus.diffEditorGutterToolBarMenus", "The gutter toolbar in the diff editor"),
    proposed: "contribDiffEditorGutterToolBarMenus"
  },
  {
    key: "diffEditor/gutter/selection",
    id: MenuId.DiffEditorSelectionToolbar,
    description: localize("menus.diffEditorGutterToolBarMenus", "The gutter toolbar in the diff editor"),
    proposed: "contribDiffEditorGutterToolBarMenus"
  },
  {
    key: "searchPanel/aiResults/commands",
    id: MenuId.SearchActionMenu,
    description: localize("searchPanel.aiResultsCommands", "The commands that will contribute to the menu rendered as buttons next to the AI search title")
  },
  {
    key: "editor/context/chat",
    id: MenuId.ChatTextEditorMenu,
    description: localize("menus.chatTextEditor", "The Chat submenu in the text editor context menu."),
    supportsSubmenus: false,
    proposed: "chatParticipantPrivate"
  },
  {
    key: "chat/input/editing/sessionToolbar",
    id: MenuId.ChatEditingSessionChangesToolbar,
    description: localize("menus.chatEditingSessionChangesToolbar", "The Chat Editing widget toolbar menu for session changes."),
    proposed: "chatSessionsProvider"
  },
  {
    key: "chat/input/editing/sessionTitleToolbar",
    id: MenuId.ChatEditingSessionTitleToolbar,
    description: localize("menus.chatEditingSessionTitleToolbar", "The Chat Editing widget toolbar menu for session title."),
    proposed: "chatSessionsProvider"
  },
  {
    // TODO: rename this to something like: `chatSessions/item/inline`
    key: "chat/chatSessions",
    id: MenuId.AgentSessionsContext,
    description: localize("menus.chatSessions", "The Chat Sessions menu."),
    supportsSubmenus: false,
    proposed: "chatSessionsProvider"
  },
  {
    key: "chatSessions/item/context",
    id: MenuId.SessionItemContextMenu,
    description: localize("menus.chatSessionsItemContext", "The context menu for items in the Sessions window's session list."),
    supportsSubmenus: false,
    proposed: "chatSessionsProvider"
  },
  {
    key: "chatSessions/newSession",
    id: MenuId.AgentSessionsCreateSubMenu,
    description: localize("menus.chatSessionsNewSession", "Menu for new chat sessions."),
    supportsSubmenus: false,
    proposed: "chatSessionsProvider"
  },
  {
    key: "chat/multiDiff/context",
    id: MenuId.ChatMultiDiffContext,
    description: localize("menus.chatMultiDiffContext", "The Chat Multi-Diff context menu."),
    supportsSubmenus: false,
    proposed: "chatSessionsProvider"
  },
  {
    key: "chat/customizations/create",
    id: MenuId.for("AICustomizationManagementCreate"),
    description: localize("menus.chatCustomizationsCreate", "The create button in the Chat Customizations management editor."),
    supportsSubmenus: false,
    proposed: "chatSessionCustomizationProvider"
  },
  {
    key: "chat/customizations/item",
    id: MenuId.for("AICustomizationManagementEditorItem"),
    description: localize("menus.chatCustomizationsItem", "The item context menu in the Chat Customizations management editor, including inline actions."),
    supportsSubmenus: false,
    proposed: "chatSessionCustomizationProvider"
  },
  {
    key: "chat/editor/inlineGutter",
    id: MenuId.ChatEditorInlineMenu,
    description: localize("menus.chatEditorInlineGutter", "The inline gutter menu in the chat editor."),
    supportsSubmenus: false,
    proposed: "contribChatEditorInlineGutterMenu"
  },
  {
    key: "chat/contextUsage/actions",
    id: MenuId.ChatContextUsageActions,
    description: localize("menus.chatContextUsageActions", "Actions in the chat context usage details popup."),
    proposed: "chatParticipantAdditions"
  },
  {
    key: "chat/newSession",
    id: MenuId.ChatNewMenu,
    description: localize("menus.chatNewSession", "The Chat new session menu."),
    proposed: "chatSessionsProvider"
  },
  {
    key: "agents/changes/actions",
    id: MenuId.AgentsChangesToolbar,
    description: localize("menus.agentsChangesToolbar", "The Changes view toolbar of the agents window."),
    proposed: "chatSessionsProvider"
  },
  {
    key: "agents/changes/actions/primary",
    id: MenuId.AgentsChangesPrimaryActionSubMenu,
    description: localize("menus.agentsChangesPrimaryActionSubMenu", "The Changes view toolbar primary action submenu in the agents window."),
    proposed: "chatSessionsProvider"
  },
  {
    key: "agents/change/inline",
    id: MenuId.AgentsChangeInlineToolbar,
    description: localize("menus.agentsChangeInline", "The Changes view inline menu in the agents window."),
    proposed: "chatSessionsProvider"
  }
];
var schema;
((schema2) => {
  function isMenuItem(item) {
    return typeof item.command === "string";
  }
  schema2.isMenuItem = isMenuItem;
  function isValidMenuItem(item, collector) {
    if (typeof item.command !== "string") {
      collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "command"));
      return false;
    }
    if (item.alt && typeof item.alt !== "string") {
      collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "alt"));
      return false;
    }
    if (item.when && typeof item.when !== "string") {
      collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "when"));
      return false;
    }
    if (item.group && typeof item.group !== "string") {
      collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "group"));
      return false;
    }
    return true;
  }
  schema2.isValidMenuItem = isValidMenuItem;
  function isValidSubmenuItem(item, collector) {
    if (typeof item.submenu !== "string") {
      collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "submenu"));
      return false;
    }
    if (item.when && typeof item.when !== "string") {
      collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "when"));
      return false;
    }
    if (item.group && typeof item.group !== "string") {
      collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "group"));
      return false;
    }
    return true;
  }
  schema2.isValidSubmenuItem = isValidSubmenuItem;
  function isValidItems(items, collector) {
    if (!Array.isArray(items)) {
      collector.error(localize("requirearray", "submenu items must be an array"));
      return false;
    }
    for (const item of items) {
      if (isMenuItem(item)) {
        if (!isValidMenuItem(item, collector)) {
          return false;
        }
      } else {
        if (!isValidSubmenuItem(item, collector)) {
          return false;
        }
      }
    }
    return true;
  }
  schema2.isValidItems = isValidItems;
  function isValidSubmenu(submenu2, collector) {
    if (typeof submenu2 !== "object") {
      collector.error(localize("require", "submenu items must be an object"));
      return false;
    }
    if (typeof submenu2.id !== "string") {
      collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "id"));
      return false;
    }
    if (typeof submenu2.label !== "string") {
      collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "label"));
      return false;
    }
    return true;
  }
  schema2.isValidSubmenu = isValidSubmenu;
  const menuItem = {
    type: "object",
    required: ["command"],
    properties: {
      command: {
        description: localize("vscode.extension.contributes.menuItem.command", "Identifier of the command to execute. The command must be declared in the 'commands'-section"),
        type: "string"
      },
      alt: {
        description: localize("vscode.extension.contributes.menuItem.alt", "Identifier of an alternative command to execute. The command must be declared in the 'commands'-section"),
        type: "string"
      },
      when: {
        description: localize("vscode.extension.contributes.menuItem.when", "Condition which must be true to show this item"),
        type: "string"
      },
      group: {
        description: localize("vscode.extension.contributes.menuItem.group", "Group into which this item belongs"),
        type: "string"
      }
    }
  };
  const submenuItem = {
    type: "object",
    required: ["submenu"],
    properties: {
      submenu: {
        description: localize("vscode.extension.contributes.menuItem.submenu", "Identifier of the submenu to display in this item."),
        type: "string"
      },
      when: {
        description: localize("vscode.extension.contributes.menuItem.when", "Condition which must be true to show this item"),
        type: "string"
      },
      group: {
        description: localize("vscode.extension.contributes.menuItem.group", "Group into which this item belongs"),
        type: "string"
      }
    }
  };
  const submenu = {
    type: "object",
    required: ["id", "label"],
    properties: {
      id: {
        description: localize("vscode.extension.contributes.submenu.id", "Identifier of the menu to display as a submenu."),
        type: "string"
      },
      label: {
        description: localize("vscode.extension.contributes.submenu.label", "The label of the menu item which leads to this submenu."),
        type: "string"
      },
      icon: {
        description: localize({ key: "vscode.extension.contributes.submenu.icon", comment: ['do not translate or change "\\$(zap)", \\ in front of $ is important.'] }, '(Optional) Icon which is used to represent the submenu in the UI. Either a file path, an object with file paths for dark and light themes, or a theme icon references, like "\\$(zap)"'),
        anyOf: [
          {
            type: "string"
          },
          {
            type: "object",
            properties: {
              light: {
                description: localize("vscode.extension.contributes.submenu.icon.light", "Icon path when a light theme is used"),
                type: "string"
              },
              dark: {
                description: localize("vscode.extension.contributes.submenu.icon.dark", "Icon path when a dark theme is used"),
                type: "string"
              }
            }
          }
        ]
      }
    }
  };
  schema2.menusContribution = {
    description: localize("vscode.extension.contributes.menus", "Contributes menu items to the editor"),
    type: "object",
    properties: index(apiMenus, (menu) => menu.key, (menu) => ({
      markdownDescription: menu.proposed ? localize("proposed", 'Proposed API, requires `enabledApiProposal: ["{0}"]` - {1}', menu.proposed, menu.description) : menu.description,
      type: "array",
      items: menu.supportsSubmenus === false ? menuItem : { oneOf: [menuItem, submenuItem] }
    })),
    additionalProperties: {
      description: "Submenu",
      type: "array",
      items: { oneOf: [menuItem, submenuItem] }
    }
  };
  schema2.submenusContribution = {
    description: localize("vscode.extension.contributes.submenus", "Contributes submenu items to the editor"),
    type: "array",
    items: submenu
  };
  function isValidCommand(command, collector) {
    if (!command) {
      collector.error(localize("nonempty", "expected non-empty value."));
      return false;
    }
    if (isFalsyOrWhitespace(command.command)) {
      collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "command"));
      return false;
    }
    if (!isValidLocalizedString(command.title, collector, "title")) {
      return false;
    }
    if (command.shortTitle && !isValidLocalizedString(command.shortTitle, collector, "shortTitle")) {
      return false;
    }
    if (command.enablement && typeof command.enablement !== "string") {
      collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "precondition"));
      return false;
    }
    if (command.category && !isValidLocalizedString(command.category, collector, "category")) {
      return false;
    }
    if (!isValidIcon(command.icon, collector)) {
      return false;
    }
    return true;
  }
  schema2.isValidCommand = isValidCommand;
  function isValidIcon(icon, collector) {
    if (typeof icon === "undefined") {
      return true;
    }
    if (typeof icon === "string") {
      return true;
    } else if (typeof icon.dark === "string" && typeof icon.light === "string") {
      return true;
    }
    collector.error(localize("opticon", "property `icon` can be omitted or must be either a string or a literal like `{dark, light}`"));
    return false;
  }
  function isValidLocalizedString(localized, collector, propertyName) {
    if (typeof localized === "undefined") {
      collector.error(localize("requireStringOrObject", "property `{0}` is mandatory and must be of type `string` or `object`", propertyName));
      return false;
    } else if (typeof localized === "string" && isFalsyOrWhitespace(localized)) {
      collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", propertyName));
      return false;
    } else if (typeof localized !== "string" && (isFalsyOrWhitespace(localized.original) || isFalsyOrWhitespace(localized.value))) {
      collector.error(localize("requirestrings", "properties `{0}` and `{1}` are mandatory and must be of type `string`", `${propertyName}.value`, `${propertyName}.original`));
      return false;
    }
    return true;
  }
  const commandType = {
    type: "object",
    required: ["command", "title"],
    properties: {
      command: {
        description: localize("vscode.extension.contributes.commandType.command", "Identifier of the command to execute"),
        type: "string"
      },
      title: {
        description: localize("vscode.extension.contributes.commandType.title", "Title by which the command is represented in the UI"),
        type: "string"
      },
      shortTitle: {
        markdownDescription: localize("vscode.extension.contributes.commandType.shortTitle", "(Optional) Short title by which the command is represented in the UI. Menus pick either `title` or `shortTitle` depending on the context in which they show commands."),
        type: "string"
      },
      category: {
        description: localize("vscode.extension.contributes.commandType.category", "(Optional) Category string by which the command is grouped in the UI"),
        type: "string"
      },
      enablement: {
        description: localize("vscode.extension.contributes.commandType.precondition", "(Optional) Condition which must be true to enable the command in the UI (menu and keybindings). Does not prevent executing the command by other means, like the `executeCommand`-api."),
        type: "string"
      },
      icon: {
        description: localize({ key: "vscode.extension.contributes.commandType.icon", comment: ['do not translate or change "\\$(zap)", \\ in front of $ is important.'] }, '(Optional) Icon which is used to represent the command in the UI. Either a file path, an object with file paths for dark and light themes, or a theme icon references, like "\\$(zap)"'),
        anyOf: [
          {
            type: "string"
          },
          {
            type: "object",
            properties: {
              light: {
                description: localize("vscode.extension.contributes.commandType.icon.light", "Icon path when a light theme is used"),
                type: "string"
              },
              dark: {
                description: localize("vscode.extension.contributes.commandType.icon.dark", "Icon path when a dark theme is used"),
                type: "string"
              }
            }
          }
        ]
      }
    }
  };
  schema2.commandsContribution = {
    description: localize("vscode.extension.contributes.commands", "Contributes commands to the command palette."),
    oneOf: [
      commandType,
      {
        type: "array",
        items: commandType
      }
    ]
  };
})(schema || (schema = {}));
const _commandRegistrations = new DisposableStore();
const commandsExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "commands",
  jsonSchema: schema.commandsContribution,
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      if (contrib.command) {
        yield `onCommand:${contrib.command}`;
      }
    }
  }
});
commandsExtensionPoint.setHandler((extensions) => {
  function handleCommand(userFriendlyCommand, extension) {
    if (!schema.isValidCommand(userFriendlyCommand, extension.collector)) {
      return;
    }
    const { icon, enablement, category, title, shortTitle, command } = userFriendlyCommand;
    let absoluteIcon;
    if (icon) {
      if (typeof icon === "string") {
        absoluteIcon = ThemeIcon.fromString(icon) ?? { dark: resources.joinPath(extension.description.extensionLocation, icon), light: resources.joinPath(extension.description.extensionLocation, icon) };
      } else {
        absoluteIcon = {
          dark: resources.joinPath(extension.description.extensionLocation, icon.dark),
          light: resources.joinPath(extension.description.extensionLocation, icon.light)
        };
      }
    }
    const existingCmd = MenuRegistry.getCommand(command);
    if (existingCmd) {
      if (existingCmd.source) {
        extension.collector.info(localize("dup1", "Command `{0}` already registered by {1} ({2})", userFriendlyCommand.command, existingCmd.source.title, existingCmd.source.id));
      } else {
        extension.collector.info(localize("dup0", "Command `{0}` already registered", userFriendlyCommand.command));
      }
    }
    _commandRegistrations.add(MenuRegistry.addCommand({
      id: command,
      title,
      source: { id: extension.description.identifier.value, title: extension.description.displayName ?? extension.description.name },
      shortTitle,
      tooltip: title,
      category,
      precondition: ContextKeyExpr.deserialize(enablement),
      icon: absoluteIcon
    }));
  }
  _commandRegistrations.clear();
  for (const extension of extensions) {
    const { value } = extension;
    if (Array.isArray(value)) {
      for (const command of value) {
        handleCommand(command, extension);
      }
    } else {
      handleCommand(value, extension);
    }
  }
});
const _submenus = /* @__PURE__ */ new Map();
const submenusExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "submenus",
  jsonSchema: schema.submenusContribution
});
submenusExtensionPoint.setHandler((extensions) => {
  _submenus.clear();
  for (const extension of extensions) {
    const { value, collector } = extension;
    for (const [, submenuInfo] of Object.entries(value)) {
      if (!schema.isValidSubmenu(submenuInfo, collector)) {
        continue;
      }
      if (!submenuInfo.id) {
        collector.warn(localize("submenuId.invalid.id", "`{0}` is not a valid submenu identifier", submenuInfo.id));
        continue;
      }
      if (_submenus.has(submenuInfo.id)) {
        collector.info(localize("submenuId.duplicate.id", "The `{0}` submenu was already previously registered.", submenuInfo.id));
        continue;
      }
      if (!submenuInfo.label) {
        collector.warn(localize("submenuId.invalid.label", "`{0}` is not a valid submenu label", submenuInfo.label));
        continue;
      }
      let absoluteIcon;
      if (submenuInfo.icon) {
        if (typeof submenuInfo.icon === "string") {
          absoluteIcon = ThemeIcon.fromString(submenuInfo.icon) || { dark: resources.joinPath(extension.description.extensionLocation, submenuInfo.icon) };
        } else {
          absoluteIcon = {
            dark: resources.joinPath(extension.description.extensionLocation, submenuInfo.icon.dark),
            light: resources.joinPath(extension.description.extensionLocation, submenuInfo.icon.light)
          };
        }
      }
      const item = {
        id: MenuId.for(`api:${submenuInfo.id}`),
        label: submenuInfo.label,
        icon: absoluteIcon
      };
      _submenus.set(submenuInfo.id, item);
    }
  }
});
const _apiMenusByKey = new Map(apiMenus.map((menu) => [menu.key, menu]));
const _menuRegistrations = new DisposableStore();
const _submenuMenuItems = /* @__PURE__ */ new Map();
const menusExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "menus",
  jsonSchema: schema.menusContribution,
  deps: [submenusExtensionPoint]
});
menusExtensionPoint.setHandler((extensions) => {
  _menuRegistrations.clear();
  _submenuMenuItems.clear();
  for (const extension of extensions) {
    const { value, collector } = extension;
    for (const entry of Object.entries(value)) {
      if (!schema.isValidItems(entry[1], collector)) {
        continue;
      }
      let menu = _apiMenusByKey.get(entry[0]);
      if (!menu) {
        const submenu = _submenus.get(entry[0]);
        if (submenu) {
          menu = {
            key: entry[0],
            id: submenu.id,
            description: ""
          };
        }
      }
      if (!menu) {
        continue;
      }
      if (menu.proposed && !isProposedApiEnabled(extension.description, menu.proposed)) {
        collector.error(localize("proposedAPI.invalid", `{0} is a proposed menu identifier. It requires 'package.json#enabledApiProposals: ["{1}"]' and is only available when running out of dev or with the following command line switch: --enable-proposed-api {2}`, entry[0], menu.proposed, extension.description.identifier.value));
        continue;
      }
      for (const menuItem of entry[1]) {
        let item;
        if (schema.isMenuItem(menuItem)) {
          const command = MenuRegistry.getCommand(menuItem.command);
          const alt = menuItem.alt && MenuRegistry.getCommand(menuItem.alt) || void 0;
          if (!command) {
            collector.error(localize("missing.command", "Menu item references a command `{0}` which is not defined in the 'commands' section.", menuItem.command));
            continue;
          }
          if (menuItem.alt && !alt) {
            collector.warn(localize("missing.altCommand", "Menu item references an alt-command `{0}` which is not defined in the 'commands' section.", menuItem.alt));
          }
          if (menuItem.command === menuItem.alt) {
            collector.info(localize("dupe.command", "Menu item references the same command as default and alt-command"));
          }
          item = { command, alt, group: void 0, order: void 0, when: void 0 };
        } else {
          if (menu.supportsSubmenus === false) {
            collector.error(localize("unsupported.submenureference", "Menu item references a submenu for a menu which doesn't have submenu support."));
            continue;
          }
          const submenu = _submenus.get(menuItem.submenu);
          if (!submenu) {
            collector.error(localize("missing.submenu", "Menu item references a submenu `{0}` which is not defined in the 'submenus' section.", menuItem.submenu));
            continue;
          }
          let submenuRegistrations = _submenuMenuItems.get(menu.id.id);
          if (!submenuRegistrations) {
            submenuRegistrations = /* @__PURE__ */ new Set();
            _submenuMenuItems.set(menu.id.id, submenuRegistrations);
          }
          if (submenuRegistrations.has(submenu.id.id)) {
            collector.warn(localize("submenuItem.duplicate", "The `{0}` submenu was already contributed to the `{1}` menu.", menuItem.submenu, entry[0]));
            continue;
          }
          submenuRegistrations.add(submenu.id.id);
          item = { submenu: submenu.id, icon: submenu.icon, title: submenu.label, group: void 0, order: void 0, when: void 0 };
        }
        if (menuItem.group) {
          const idx = menuItem.group.lastIndexOf("@");
          if (idx > 0) {
            item.group = menuItem.group.substr(0, idx);
            item.order = Number(menuItem.group.substr(idx + 1)) || void 0;
          } else {
            item.group = menuItem.group;
          }
        }
        if (menu.id === MenuId.ViewContainerTitle && !menuItem.when?.includes("viewContainer == workbench.view.debug")) {
          collector.error(localize("viewContainerTitle.when", "The {0} menu contribution must check {1} in its {2} clause.", "`viewContainer/title`", "`viewContainer == workbench.view.debug`", '"when"'));
          continue;
        }
        item.when = ContextKeyExpr.deserialize(menuItem.when);
        _menuRegistrations.add(MenuRegistry.appendMenuItem(menu.id, item));
      }
    }
  }
});
let CommandsTableRenderer = class extends Disposable {
  constructor(_keybindingService) {
    super();
    this._keybindingService = _keybindingService;
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.commands;
  }
  render(manifest) {
    const rawCommands = manifest.contributes?.commands || [];
    const commands = rawCommands.map((c) => ({
      id: c.command,
      title: c.title,
      keybindings: [],
      menus: []
    }));
    const byId = index(commands, (c) => c.id);
    const menus = manifest.contributes?.menus || {};
    const implicitlyOnCommandPalette = index(commands, (c) => c.id);
    if (menus["commandPalette"]) {
      for (const command of menus["commandPalette"]) {
        delete implicitlyOnCommandPalette[command.command];
      }
    }
    if (Object.keys(implicitlyOnCommandPalette).length) {
      if (!menus["commandPalette"]) {
        menus["commandPalette"] = [];
      }
      for (const command in implicitlyOnCommandPalette) {
        menus["commandPalette"].push({ command });
      }
    }
    for (const context in menus) {
      for (const menu of menus[context]) {
        if (menu.when === "false") {
          continue;
        }
        if (menu.command) {
          let command = byId[menu.command];
          if (command) {
            if (!command.menus.includes(context)) {
              command.menus.push(context);
            }
          } else {
            command = { id: menu.command, title: "", keybindings: [], menus: [context] };
            byId[command.id] = command;
            commands.push(command);
          }
        }
      }
    }
    const rawKeybindings = manifest.contributes?.keybindings ? Array.isArray(manifest.contributes.keybindings) ? manifest.contributes.keybindings : [manifest.contributes.keybindings] : [];
    rawKeybindings.forEach((rawKeybinding) => {
      const keybinding = this.resolveKeybinding(rawKeybinding);
      if (!keybinding) {
        return;
      }
      let command = byId[rawKeybinding.command];
      if (command) {
        command.keybindings.push(keybinding);
      } else {
        command = { id: rawKeybinding.command, title: "", keybindings: [keybinding], menus: [] };
        byId[command.id] = command;
        commands.push(command);
      }
    });
    if (!commands.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("command name", "ID"),
      localize("command title", "Title"),
      localize("keyboard shortcuts", "Keyboard Shortcuts"),
      localize("menuContexts", "Menu Contexts")
    ];
    const rows = commands.sort((a, b) => a.id.localeCompare(b.id)).map((command) => {
      return [
        new MarkdownString().appendMarkdown(`\`${command.id}\``),
        typeof command.title === "string" ? command.title : command.title.value,
        command.keybindings,
        new MarkdownString().appendMarkdown(`${command.menus.sort((a, b) => a.localeCompare(b)).map((menu) => `\`${menu}\``).join("&nbsp;")}`)
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
  resolveKeybinding(rawKeyBinding) {
    let key;
    switch (platform) {
      case "win32":
        key = rawKeyBinding.win;
        break;
      case "linux":
        key = rawKeyBinding.linux;
        break;
      case "darwin":
        key = rawKeyBinding.mac;
        break;
    }
    return this._keybindingService.resolveUserBinding(key ?? rawKeyBinding.key)[0];
  }
};
CommandsTableRenderer = __decorateClass([
  __decorateParam(0, IKeybindingService)
], CommandsTableRenderer);
Registry.as(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "commands",
  label: localize("commands", "Commands"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(CommandsTableRenderer)
});
export {
  commandsExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hY3Rpb25zL2NvbW1vbi9tZW51c0V4dGVuc2lvblBvaW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgaXNGYWxzeU9yV2hpdGVzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblBvaW50VXNlciwgRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3RvciwgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIE1lbnVSZWdpc3RyeSwgSU1lbnVJdGVtLCBJU3VibWVudUl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGluZGV4IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyLCBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSwgSVJlbmRlcmVkRGF0YSwgSVJvd0RhdGEsIElUYWJsZURhdGEsIEV4dGVuc2lvbnMgYXMgRXh0ZW5zaW9uRmVhdHVyZXNFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0LCBJS2V5QmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBwbGF0Zm9ybSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEFwaVByb3Bvc2FsTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNBcGlQcm9wb3NhbHMuanMnO1xuXG5pbnRlcmZhY2UgSUFQSU1lbnUge1xuXHRyZWFkb25seSBrZXk6IHN0cmluZztcblx0cmVhZG9ubHkgaWQ6IE1lbnVJZDtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcblx0cmVhZG9ubHkgcHJvcG9zZWQ/OiBBcGlQcm9wb3NhbE5hbWU7XG5cdHJlYWRvbmx5IHN1cHBvcnRzU3VibWVudXM/OiBib29sZWFuOyAvLyBkZWZhdWx0cyB0byB0cnVlXG59XG5cbmNvbnN0IGFwaU1lbnVzOiBJQVBJTWVudVtdID0gW1xuXHR7XG5cdFx0a2V5OiAnY29tbWFuZFBhbGV0dGUnLFxuXHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5jb21tYW5kUGFsZXR0ZScsIFwiVGhlIENvbW1hbmQgUGFsZXR0ZVwiKSxcblx0XHRzdXBwb3J0c1N1Ym1lbnVzOiBmYWxzZVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAndG91Y2hCYXInLFxuXHRcdGlkOiBNZW51SWQuVG91Y2hCYXJDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMudG91Y2hCYXInLCBcIlRoZSB0b3VjaCBiYXIgKG1hY09TIG9ubHkpXCIpLFxuXHRcdHN1cHBvcnRzU3VibWVudXM6IGZhbHNlXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdlZGl0b3IvdGl0bGUnLFxuXHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5lZGl0b3JUaXRsZScsIFwiVGhlIGVkaXRvciB0aXRsZSBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdtb2RhbEVkaXRvci9lZGl0b3JUaXRsZScsXG5cdFx0aWQ6IE1lbnVJZC5Nb2RhbEVkaXRvckVkaXRvclRpdGxlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMubW9kYWxFZGl0b3JFZGl0b3JUaXRsZScsIFwiVGhlIGVkaXRvciB0aXRsZSBtZW51IGluIHRoZSBtb2RhbCBlZGl0b3JcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ2VkaXRvci90aXRsZS9ydW4nLFxuXHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGVSdW4sXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5lZGl0b3JUaXRsZVJ1bicsIFwiUnVuIHN1Ym1lbnUgaW5zaWRlIHRoZSBlZGl0b3IgdGl0bGUgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZWRpdG9yL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmVkaXRvckNvbnRleHQnLCBcIlRoZSBlZGl0b3IgY29udGV4dCBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdlZGl0b3IvY29udGV4dC9jb3B5Jyxcblx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRleHRDb3B5LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuZWRpdG9yQ29udGV4dENvcHlBcycsIFwiJ0NvcHkgYXMnIHN1Ym1lbnUgaW4gdGhlIGVkaXRvciBjb250ZXh0IG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ2VkaXRvci9jb250ZXh0L3NoYXJlJyxcblx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRleHRTaGFyZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmVkaXRvckNvbnRleHRTaGFyZScsIFwiJ1NoYXJlJyBzdWJtZW51IGluIHRoZSBlZGl0b3IgY29udGV4dCBtZW51XCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYlNoYXJlTWVudSdcblx0fSxcblx0e1xuXHRcdGtleTogJ2V4cGxvcmVyL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuRXhwbG9yZXJDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuZXhwbG9yZXJDb250ZXh0JywgXCJUaGUgZmlsZSBleHBsb3JlciBjb250ZXh0IG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ2V4cGxvcmVyL2NvbnRleHQvc2hhcmUnLFxuXHRcdGlkOiBNZW51SWQuRXhwbG9yZXJDb250ZXh0U2hhcmUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5leHBsb3JlckNvbnRleHRTaGFyZScsIFwiJ1NoYXJlJyBzdWJtZW51IGluIHRoZSBmaWxlIGV4cGxvcmVyIGNvbnRleHQgbWVudVwiKSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJTaGFyZU1lbnUnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdlZGl0b3IvdGl0bGUvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5lZGl0b3JUYWJDb250ZXh0JywgXCJUaGUgZWRpdG9yIHRhYnMgY29udGV4dCBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdlZGl0b3IvdGl0bGUvY29udGV4dC9zaGFyZScsXG5cdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHRTaGFyZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmVkaXRvclRpdGxlQ29udGV4dFNoYXJlJywgXCInU2hhcmUnIHN1Ym1lbnUgaW5zaWRlIHRoZSBlZGl0b3IgdGl0bGUgY29udGV4dCBtZW51XCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYlNoYXJlTWVudSdcblx0fSxcblx0e1xuXHRcdGtleTogJ2RlYnVnL2NhbGxzdGFjay9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLkRlYnVnQ2FsbFN0YWNrQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmRlYnVnQ2FsbHN0YWNrQ29udGV4dCcsIFwiVGhlIGRlYnVnIGNhbGxzdGFjayB2aWV3IGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZGVidWcvdmFyaWFibGVzL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuRGVidWdWYXJpYWJsZXNDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuZGVidWdWYXJpYWJsZXNDb250ZXh0JywgXCJUaGUgZGVidWcgdmFyaWFibGVzIHZpZXcgY29udGV4dCBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdkZWJ1Zy93YXRjaC9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLkRlYnVnV2F0Y2hDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuZGVidWdXYXRjaENvbnRleHQnLCBcIlRoZSBkZWJ1ZyB3YXRjaCB2aWV3IGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZGVidWcvdG9vbEJhcicsXG5cdFx0aWQ6IE1lbnVJZC5EZWJ1Z1Rvb2xCYXIsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5kZWJ1Z1Rvb2xCYXInLCBcIlRoZSBkZWJ1ZyB0b29sYmFyIG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ2RlYnVnL2NyZWF0ZUNvbmZpZ3VyYXRpb24nLFxuXHRcdGlkOiBNZW51SWQuRGVidWdDcmVhdGVDb25maWd1cmF0aW9uLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYkRlYnVnQ3JlYXRlQ29uZmlndXJhdGlvbicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5kZWJ1Z0NyZWF0ZUNvbmZpZ3VhdGlvbicsIFwiVGhlIGRlYnVnIGNyZWF0ZSBjb25maWd1cmF0aW9uIG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ25vdGVib29rL3ZhcmlhYmxlcy9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLk5vdGVib29rVmFyaWFibGVzQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLm5vdGVib29rVmFyaWFibGVzQ29udGV4dCcsIFwiVGhlIG5vdGVib29rIHZhcmlhYmxlcyB2aWV3IGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnbWVudUJhci9ob21lJyxcblx0XHRpZDogTWVudUlkLk1lbnViYXJIb21lTWVudSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmhvbWUnLCBcIlRoZSBob21lIGluZGljYXRvciBjb250ZXh0IG1lbnUgKHdlYiBvbmx5KVwiKSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJNZW51QmFySG9tZScsXG5cdFx0c3VwcG9ydHNTdWJtZW51czogZmFsc2Vcblx0fSxcblx0e1xuXHRcdGtleTogJ21lbnVCYXIvZWRpdC9jb3B5Jyxcblx0XHRpZDogTWVudUlkLk1lbnViYXJDb3B5LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMub3B5JywgXCInQ29weSBhcycgc3VibWVudSBpbiB0aGUgdG9wIGxldmVsIEVkaXQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY2hhdC9pbnB1dC9zdGF0dXMnLFxuXHRcdGlkOiBNZW51SWQuQ2hhdElucHV0U3RhdHVzLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuY2hhdElucHV0U3RhdHVzJywgXCJUaGUgc3RhdHVzIGluZGljYXRvciBhcmVhIGF0IHRoZSByaWdodG1vc3QgZW5kIG9mIHRoZSB0b29sYmFyIHNob3duIGJlbmVhdGggdGhlIGNoYXQgaW5wdXRcIiksXG5cdFx0c3VwcG9ydHNTdWJtZW51czogZmFsc2Vcblx0fSxcblx0e1xuXHRcdGtleTogJ3NjbS90aXRsZScsXG5cdFx0aWQ6IE1lbnVJZC5TQ01UaXRsZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLnNjbVRpdGxlJywgXCJUaGUgU291cmNlIENvbnRyb2wgdGl0bGUgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnc2NtL3NvdXJjZUNvbnRyb2wnLFxuXHRcdGlkOiBNZW51SWQuU0NNU291cmNlQ29udHJvbCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLnNjbVNvdXJjZUNvbnRyb2wnLCBcIlRoZSBTb3VyY2UgQ29udHJvbCBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdzY20vcmVwb3NpdG9yaWVzL3RpdGxlJyxcblx0XHRpZDogTWVudUlkLlNDTVNvdXJjZUNvbnRyb2xUaXRsZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLnNjbVNvdXJjZUNvbnRyb2xUaXRsZScsIFwiVGhlIFNvdXJjZSBDb250cm9sIFJlcG9zaXRvcmllcyB0aXRsZSBtZW51XCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYlNvdXJjZUNvbnRyb2xUaXRsZU1lbnUnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdzY20vcmVwb3NpdG9yeScsXG5cdFx0aWQ6IE1lbnVJZC5TQ01Tb3VyY2VDb250cm9sSW5saW5lLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuc2NtU291cmNlQ29udHJvbElubGluZScsIFwiVGhlIFNvdXJjZSBDb250cm9sIHJlcG9zaXRvcnkgbWVudVwiKSxcblx0fSxcblx0e1xuXHRcdGtleTogJ3NjbS9yZXNvdXJjZVN0YXRlL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuU0NNUmVzb3VyY2VDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMucmVzb3VyY2VTdGF0ZUNvbnRleHQnLCBcIlRoZSBTb3VyY2UgQ29udHJvbCByZXNvdXJjZSBzdGF0ZSBjb250ZXh0IG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ3NjbS9yZXNvdXJjZUZvbGRlci9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLlNDTVJlc291cmNlRm9sZGVyQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLnJlc291cmNlRm9sZGVyQ29udGV4dCcsIFwiVGhlIFNvdXJjZSBDb250cm9sIHJlc291cmNlIGZvbGRlciBjb250ZXh0IG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ3NjbS9yZXNvdXJjZUdyb3VwL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuU0NNUmVzb3VyY2VHcm91cENvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5yZXNvdXJjZUdyb3VwQ29udGV4dCcsIFwiVGhlIFNvdXJjZSBDb250cm9sIHJlc291cmNlIGdyb3VwIGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnc2NtL2NoYW5nZS90aXRsZScsXG5cdFx0aWQ6IE1lbnVJZC5TQ01DaGFuZ2VDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuY2hhbmdlVGl0bGUnLCBcIlRoZSBTb3VyY2UgQ29udHJvbCBpbmxpbmUgY2hhbmdlIG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ3NjbS9pbnB1dEJveCcsXG5cdFx0aWQ6IE1lbnVJZC5TQ01JbnB1dEJveCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmlucHV0JywgXCJUaGUgU291cmNlIENvbnRyb2wgaW5wdXQgYm94IG1lbnVcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliU291cmNlQ29udHJvbElucHV0Qm94TWVudSdcblx0fSxcblx0e1xuXHRcdGtleTogJ3NjbS9oaXN0b3J5L3RpdGxlJyxcblx0XHRpZDogTWVudUlkLlNDTUhpc3RvcnlUaXRsZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLnNjbUhpc3RvcnlUaXRsZScsIFwiVGhlIFNvdXJjZSBDb250cm9sIEhpc3RvcnkgdGl0bGUgbWVudVwiKSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJTb3VyY2VDb250cm9sSGlzdG9yeVRpdGxlTWVudSdcblx0fSxcblx0e1xuXHRcdGtleTogJ3NjbS9oaXN0b3J5SXRlbS9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLlNDTUhpc3RvcnlJdGVtQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmhpc3RvcnlJdGVtQ29udGV4dCcsIFwiVGhlIFNvdXJjZSBDb250cm9sIGhpc3RvcnkgaXRlbSBjb250ZXh0IG1lbnVcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliU291cmNlQ29udHJvbEhpc3RvcnlJdGVtTWVudSdcblx0fSxcblx0e1xuXHRcdGtleTogJ3NjbS9oaXN0b3J5SXRlbVJlZi9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLlNDTUhpc3RvcnlJdGVtUmVmQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmhpc3RvcnlJdGVtUmVmQ29udGV4dCcsIFwiVGhlIFNvdXJjZSBDb250cm9sIGhpc3RvcnkgaXRlbSByZWZlcmVuY2UgY29udGV4dCBtZW51XCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYlNvdXJjZUNvbnRyb2xIaXN0b3J5SXRlbU1lbnUnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdzY20vYXJ0aWZhY3RHcm91cC9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLlNDTUFydGlmYWN0R3JvdXBDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuYXJ0aWZhY3RHcm91cENvbnRleHQnLCBcIlRoZSBTb3VyY2UgQ29udHJvbCBhcnRpZmFjdCBncm91cCBjb250ZXh0IG1lbnVcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliU291cmNlQ29udHJvbEFydGlmYWN0R3JvdXBNZW51J1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnc2NtL2FydGlmYWN0L2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuU0NNQXJ0aWZhY3RDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuYXJ0aWZhY3RDb250ZXh0JywgXCJUaGUgU291cmNlIENvbnRyb2wgYXJ0aWZhY3QgY29udGV4dCBtZW51XCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYlNvdXJjZUNvbnRyb2xBcnRpZmFjdE1lbnUnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdzdGF0dXNCYXIvcmVtb3RlSW5kaWNhdG9yJyxcblx0XHRpZDogTWVudUlkLlN0YXR1c0JhclJlbW90ZUluZGljYXRvck1lbnUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5zdGF0dXNCYXJSZW1vdGVJbmRpY2F0b3InLCBcIlRoZSByZW1vdGUgaW5kaWNhdG9yIG1lbnUgaW4gdGhlIHN0YXR1cyBiYXJcIiksXG5cdFx0c3VwcG9ydHNTdWJtZW51czogZmFsc2Vcblx0fSxcblx0e1xuXHRcdGtleTogJ3Rlcm1pbmFsL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuVGVybWluYWxJbnN0YW5jZUNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy50ZXJtaW5hbENvbnRleHQnLCBcIlRoZSB0ZXJtaW5hbCBjb250ZXh0IG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ3Rlcm1pbmFsL3RpdGxlL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuVGVybWluYWxUYWJDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMudGVybWluYWxUYWJDb250ZXh0JywgXCJUaGUgdGVybWluYWwgdGFicyBjb250ZXh0IG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ3ZpZXcvdGl0bGUnLFxuXHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmlldy52aWV3VGl0bGUnLCBcIlRoZSBjb250cmlidXRlZCB2aWV3IHRpdGxlIG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ3ZpZXdDb250YWluZXIvdGl0bGUnLFxuXHRcdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmlldy5jb250YWluZXJUaXRsZScsIFwiVGhlIGNvbnRyaWJ1dGVkIHZpZXcgY29udGFpbmVyIHRpdGxlIG1lbnVcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliVmlld0NvbnRhaW5lclRpdGxlJ1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAndmlldy9pdGVtL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuVmlld0l0ZW1Db250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmlldy5pdGVtQ29udGV4dCcsIFwiVGhlIGNvbnRyaWJ1dGVkIHZpZXcgaXRlbSBjb250ZXh0IG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ2NvbW1lbnRzL2NvbW1lbnQvZWRpdG9yQWN0aW9ucycsXG5cdFx0aWQ6IE1lbnVJZC5Db21tZW50RWRpdG9yQWN0aW9ucyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvbW1lbnRUaHJlYWQuZWRpdG9yQWN0aW9ucycsIFwiVGhlIGNvbnRyaWJ1dGVkIGNvbW1lbnQgZWRpdG9yIGFjdGlvbnNcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliQ29tbWVudEVkaXRvckFjdGlvbnNNZW51J1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY29tbWVudHMvY29tbWVudFRocmVhZC90aXRsZScsXG5cdFx0aWQ6IE1lbnVJZC5Db21tZW50VGhyZWFkVGl0bGUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb21tZW50VGhyZWFkLnRpdGxlJywgXCJUaGUgY29udHJpYnV0ZWQgY29tbWVudCB0aHJlYWQgdGl0bGUgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY29tbWVudHMvY29tbWVudFRocmVhZC9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLkNvbW1lbnRUaHJlYWRBY3Rpb25zLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29tbWVudFRocmVhZC5hY3Rpb25zJywgXCJUaGUgY29udHJpYnV0ZWQgY29tbWVudCB0aHJlYWQgY29udGV4dCBtZW51LCByZW5kZXJlZCBhcyBidXR0b25zIGJlbG93IHRoZSBjb21tZW50IGVkaXRvclwiKSxcblx0XHRzdXBwb3J0c1N1Ym1lbnVzOiBmYWxzZVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY29tbWVudHMvY29tbWVudFRocmVhZC9hZGRpdGlvbmFsQWN0aW9ucycsXG5cdFx0aWQ6IE1lbnVJZC5Db21tZW50VGhyZWFkQWRkaXRpb25hbEFjdGlvbnMsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb21tZW50VGhyZWFkLmFjdGlvbnMnLCBcIlRoZSBjb250cmlidXRlZCBjb21tZW50IHRocmVhZCBjb250ZXh0IG1lbnUsIHJlbmRlcmVkIGFzIGJ1dHRvbnMgYmVsb3cgdGhlIGNvbW1lbnQgZWRpdG9yXCIpLFxuXHRcdHN1cHBvcnRzU3VibWVudXM6IHRydWUsXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliQ29tbWVudFRocmVhZEFkZGl0aW9uYWxNZW51J1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY29tbWVudHMvY29tbWVudFRocmVhZC90aXRsZS9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLkNvbW1lbnRUaHJlYWRUaXRsZUNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb21tZW50VGhyZWFkLnRpdGxlQ29udGV4dCcsIFwiVGhlIGNvbnRyaWJ1dGVkIGNvbW1lbnQgdGhyZWFkIHRpdGxlJ3MgcGVlayBjb250ZXh0IG1lbnUsIHJlbmRlcmVkIGFzIGEgcmlnaHQgY2xpY2sgbWVudSBvbiB0aGUgY29tbWVudCB0aHJlYWQncyBwZWVrIHRpdGxlLlwiKSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJDb21tZW50UGVla0NvbnRleHQnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjb21tZW50cy9jb21tZW50L3RpdGxlJyxcblx0XHRpZDogTWVudUlkLkNvbW1lbnRUaXRsZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvbW1lbnQudGl0bGUnLCBcIlRoZSBjb250cmlidXRlZCBjb21tZW50IHRpdGxlIG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ2NvbW1lbnRzL2NvbW1lbnQvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5Db21tZW50QWN0aW9ucyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvbW1lbnQuYWN0aW9ucycsIFwiVGhlIGNvbnRyaWJ1dGVkIGNvbW1lbnQgY29udGV4dCBtZW51LCByZW5kZXJlZCBhcyBidXR0b25zIGJlbG93IHRoZSBjb21tZW50IGVkaXRvclwiKSxcblx0XHRzdXBwb3J0c1N1Ym1lbnVzOiBmYWxzZVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY29tbWVudHMvY29tbWVudFRocmVhZC9jb21tZW50L2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuQ29tbWVudFRocmVhZENvbW1lbnRDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29tbWVudC5jb21tZW50Q29udGV4dCcsIFwiVGhlIGNvbnRyaWJ1dGVkIGNvbW1lbnQgY29udGV4dCBtZW51LCByZW5kZXJlZCBhcyBhIHJpZ2h0IGNsaWNrIG1lbnUgb24gdGhlIGFuIGluZGl2aWR1YWwgY29tbWVudCBpbiB0aGUgY29tbWVudCB0aHJlYWQncyBwZWVrIHZpZXcuXCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYkNvbW1lbnRQZWVrQ29udGV4dCdcblx0fSxcblx0e1xuXHRcdGtleTogJ2NvbW1lbnRzVmlldy9jb21tZW50VGhyZWFkL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuQ29tbWVudHNWaWV3VGhyZWFkQWN0aW9ucyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvbW1lbnRzVmlldy50aHJlYWRBY3Rpb25zJywgXCJUaGUgY29udHJpYnV0ZWQgY29tbWVudCB0aHJlYWQgY29udGV4dCBtZW51IGluIHRoZSBjb21tZW50cyB2aWV3XCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYkNvbW1lbnRzVmlld1RocmVhZE1lbnVzJ1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnbm90ZWJvb2svdG9vbGJhcicsXG5cdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va1Rvb2xiYXIsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdub3RlYm9vay50b29sYmFyJywgXCJUaGUgY29udHJpYnV0ZWQgbm90ZWJvb2sgdG9vbGJhciBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdub3RlYm9vay9rZXJuZWxTb3VyY2UnLFxuXHRcdGlkOiBNZW51SWQuTm90ZWJvb2tLZXJuZWxTb3VyY2UsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdub3RlYm9vay5rZXJuZWxTb3VyY2UnLCBcIlRoZSBjb250cmlidXRlZCBub3RlYm9vayBrZXJuZWwgc291cmNlcyBtZW51XCIpLFxuXHRcdHByb3Bvc2VkOiAnbm90ZWJvb2tLZXJuZWxTb3VyY2UnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdub3RlYm9vay9jZWxsL3RpdGxlJyxcblx0XHRpZDogTWVudUlkLk5vdGVib29rQ2VsbFRpdGxlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbm90ZWJvb2suY2VsbC50aXRsZScsIFwiVGhlIGNvbnRyaWJ1dGVkIG5vdGVib29rIGNlbGwgdGl0bGUgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnbm90ZWJvb2svY2VsbC9leGVjdXRlJyxcblx0XHRpZDogTWVudUlkLk5vdGVib29rQ2VsbEV4ZWN1dGUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdub3RlYm9vay5jZWxsLmV4ZWN1dGUnLCBcIlRoZSBjb250cmlidXRlZCBub3RlYm9vayBjZWxsIGV4ZWN1dGlvbiBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdpbnRlcmFjdGl2ZS90b29sYmFyJyxcblx0XHRpZDogTWVudUlkLkludGVyYWN0aXZlVG9vbGJhcixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ludGVyYWN0aXZlLnRvb2xiYXInLCBcIlRoZSBjb250cmlidXRlZCBpbnRlcmFjdGl2ZSB0b29sYmFyIG1lbnVcIiksXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdpbnRlcmFjdGl2ZS9jZWxsL3RpdGxlJyxcblx0XHRpZDogTWVudUlkLkludGVyYWN0aXZlQ2VsbFRpdGxlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW50ZXJhY3RpdmUuY2VsbC50aXRsZScsIFwiVGhlIGNvbnRyaWJ1dGVkIGludGVyYWN0aXZlIGNlbGwgdGl0bGUgbWVudVwiKSxcblx0fSxcblx0e1xuXHRcdGtleTogJ2lzc3VlL3JlcG9ydGVyJyxcblx0XHRpZDogTWVudUlkLklzc3VlUmVwb3J0ZXIsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdpc3N1ZS5yZXBvcnRlcicsIFwiVGhlIGNvbnRyaWJ1dGVkIGlzc3VlIHJlcG9ydGVyIG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ3Rlc3RpbmcvaXRlbS9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLlRlc3RJdGVtLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5pdGVtLmNvbnRleHQnLCBcIlRoZSBjb250cmlidXRlZCB0ZXN0IGl0ZW0gbWVudVwiKSxcblx0fSxcblx0e1xuXHRcdGtleTogJ3Rlc3RpbmcvaXRlbS9ndXR0ZXInLFxuXHRcdGlkOiBNZW51SWQuVGVzdEl0ZW1HdXR0ZXIsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLml0ZW0uZ3V0dGVyLnRpdGxlJywgXCJUaGUgbWVudSBmb3IgYSBndXR0ZXIgZGVjb3JhdGlvbiBmb3IgYSB0ZXN0IGl0ZW1cIiksXG5cdH0sXG5cdHtcblx0XHRrZXk6ICd0ZXN0aW5nL3Byb2ZpbGVzL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuVGVzdFByb2ZpbGVzQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcucHJvZmlsZXMuY29udGV4dC50aXRsZScsIFwiVGhlIG1lbnUgZm9yIGNvbmZpZ3VyaW5nIHRlc3RpbmcgcHJvZmlsZXMuXCIpLFxuXHR9LFxuXHR7XG5cdFx0a2V5OiAndGVzdGluZy9pdGVtL3Jlc3VsdCcsXG5cdFx0aWQ6IE1lbnVJZC5UZXN0UGVla0VsZW1lbnQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLml0ZW0ucmVzdWx0LnRpdGxlJywgXCJUaGUgbWVudSBmb3IgYW4gaXRlbSBpbiB0aGUgVGVzdCBSZXN1bHRzIHZpZXcgb3IgcGVlay5cIiksXG5cdH0sXG5cdHtcblx0XHRrZXk6ICd0ZXN0aW5nL21lc3NhZ2UvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5UZXN0TWVzc2FnZUNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLm1lc3NhZ2UuY29udGV4dC50aXRsZScsIFwiQSBwcm9taW5lbnQgYnV0dG9uIG92ZXJsYXlpbmcgZWRpdG9yIGNvbnRlbnQgd2hlcmUgdGhlIG1lc3NhZ2UgaXMgZGlzcGxheWVkXCIpLFxuXHR9LFxuXHR7XG5cdFx0a2V5OiAndGVzdGluZy9tZXNzYWdlL2NvbnRlbnQnLFxuXHRcdGlkOiBNZW51SWQuVGVzdE1lc3NhZ2VDb250ZW50LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5tZXNzYWdlLmNvbnRlbnQudGl0bGUnLCBcIkNvbnRleHQgbWVudSBmb3IgdGhlIG1lc3NhZ2UgaW4gdGhlIHJlc3VsdHMgdHJlZVwiKSxcblx0fSxcblx0e1xuXHRcdGtleTogJ2V4dGVuc2lvbi9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5leHRlbnNpb25Db250ZXh0JywgXCJUaGUgZXh0ZW5zaW9uIGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAndGltZWxpbmUvdGl0bGUnLFxuXHRcdGlkOiBNZW51SWQuVGltZWxpbmVUaXRsZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZpZXcudGltZWxpbmVUaXRsZScsIFwiVGhlIFRpbWVsaW5lIHZpZXcgdGl0bGUgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAndGltZWxpbmUvaXRlbS9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLlRpbWVsaW5lSXRlbUNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2aWV3LnRpbWVsaW5lQ29udGV4dCcsIFwiVGhlIFRpbWVsaW5lIHZpZXcgaXRlbSBjb250ZXh0IG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ3BvcnRzL2l0ZW0vY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5UdW5uZWxDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmlldy50dW5uZWxDb250ZXh0JywgXCJUaGUgUG9ydHMgdmlldyBpdGVtIGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAncG9ydHMvaXRlbS9vcmlnaW4vaW5saW5lJyxcblx0XHRpZDogTWVudUlkLlR1bm5lbE9yaWdpbklubGluZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZpZXcudHVubmVsT3JpZ2luSW5saW5lJywgXCJUaGUgUG9ydHMgdmlldyBpdGVtIG9yaWdpbiBpbmxpbmUgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAncG9ydHMvaXRlbS9wb3J0L2lubGluZScsXG5cdFx0aWQ6IE1lbnVJZC5UdW5uZWxQb3J0SW5saW5lLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmlldy50dW5uZWxQb3J0SW5saW5lJywgXCJUaGUgUG9ydHMgdmlldyBpdGVtIHBvcnQgaW5saW5lIG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ2ZpbGUvbmV3RmlsZScsXG5cdFx0aWQ6IE1lbnVJZC5OZXdGaWxlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsZS5uZXdGaWxlJywgXCJUaGUgJ05ldyBGaWxlLi4uJyBxdWljayBwaWNrLCBzaG93biBvbiB3ZWxjb21lIHBhZ2UgYW5kIEZpbGUgbWVudS5cIiksXG5cdFx0c3VwcG9ydHNTdWJtZW51czogZmFsc2UsXG5cdH0sXG5cdHtcblx0XHRrZXk6ICd3ZWJ2aWV3L2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuV2Vidmlld0NvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3ZWJ2aWV3LmNvbnRleHQnLCBcIlRoZSB3ZWJ2aWV3IGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZmlsZS9zaGFyZScsXG5cdFx0aWQ6IE1lbnVJZC5NZW51YmFyU2hhcmUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5zaGFyZScsIFwiU2hhcmUgc3VibWVudSBzaG93biBpbiB0aGUgdG9wIGxldmVsIEZpbGUgbWVudS5cIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliU2hhcmVNZW51J1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZWRpdG9yL2lubGluZUNvbXBsZXRpb25zL2FjdGlvbnMnLFxuXHRcdGlkOiBNZW51SWQuSW5saW5lQ29tcGxldGlvbnNBY3Rpb25zLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW5saW5lQ29tcGxldGlvbnMuYWN0aW9ucycsIFwiVGhlIGFjdGlvbnMgc2hvd24gd2hlbiBob3ZlcmluZyBvbiBhbiBpbmxpbmUgY29tcGxldGlvblwiKSxcblx0XHRzdXBwb3J0c1N1Ym1lbnVzOiBmYWxzZSxcblx0XHRwcm9wb3NlZDogJ2lubGluZUNvbXBsZXRpb25zQWRkaXRpb25zJ1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZWRpdG9yL2NvbnRlbnQnLFxuXHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGVudCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lcmdlLnRvb2xiYXInLCBcIlRoZSBwcm9taW5lbnQgYnV0dG9uIGluIGFuIGVkaXRvciwgb3ZlcmxheXMgaXRzIGNvbnRlbnRcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliRWRpdG9yQ29udGVudE1lbnUnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdlZGl0b3IvbGluZU51bWJlci9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLkVkaXRvckxpbmVOdW1iZXJDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZWRpdG9yTGluZU51bWJlckNvbnRleHQnLCBcIlRoZSBjb250cmlidXRlZCBlZGl0b3IgbGluZSBudW1iZXIgY29udGV4dCBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdtZXJnZUVkaXRvci9yZXN1bHQvdGl0bGUnLFxuXHRcdGlkOiBNZW51SWQuTWVyZ2VJbnB1dFJlc3VsdFRvb2xiYXIsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5tZXJnZUVkaXRvclJlc3VsdCcsIFwiVGhlIHJlc3VsdCB0b29sYmFyIG9mIHRoZSBtZXJnZSBlZGl0b3JcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliTWVyZ2VFZGl0b3JNZW51cydcblx0fSxcblx0e1xuXHRcdGtleTogJ211bHRpRGlmZkVkaXRvci9jb250ZW50Jyxcblx0XHRpZDogTWVudUlkLk11bHRpRGlmZkVkaXRvckNvbnRlbnQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5tdWx0aURpZmZFZGl0b3JDb250ZW50JywgXCJBIHByb21pbmVudCBidXR0b24gb3ZlcmxheWluZyB0aGUgbXVsdGkgZGlmZiBlZGl0b3JcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliRWRpdG9yQ29udGVudE1lbnUnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdtdWx0aURpZmZFZGl0b3IvcmVzb3VyY2UvdGl0bGUnLFxuXHRcdGlkOiBNZW51SWQuTXVsdGlEaWZmRWRpdG9yRmlsZVRvb2xiYXIsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5tdWx0aURpZmZFZGl0b3JSZXNvdXJjZScsIFwiVGhlIHJlc291cmNlIHRvb2xiYXIgaW4gdGhlIG11bHRpIGRpZmYgZWRpdG9yXCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYk11bHRpRGlmZkVkaXRvck1lbnVzJ1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZGlmZkVkaXRvci9ndXR0ZXIvaHVuaycsXG5cdFx0aWQ6IE1lbnVJZC5EaWZmRWRpdG9ySHVua1Rvb2xiYXIsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5kaWZmRWRpdG9yR3V0dGVyVG9vbEJhck1lbnVzJywgXCJUaGUgZ3V0dGVyIHRvb2xiYXIgaW4gdGhlIGRpZmYgZWRpdG9yXCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYkRpZmZFZGl0b3JHdXR0ZXJUb29sQmFyTWVudXMnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdkaWZmRWRpdG9yL2d1dHRlci9zZWxlY3Rpb24nLFxuXHRcdGlkOiBNZW51SWQuRGlmZkVkaXRvclNlbGVjdGlvblRvb2xiYXIsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5kaWZmRWRpdG9yR3V0dGVyVG9vbEJhck1lbnVzJywgXCJUaGUgZ3V0dGVyIHRvb2xiYXIgaW4gdGhlIGRpZmYgZWRpdG9yXCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYkRpZmZFZGl0b3JHdXR0ZXJUb29sQmFyTWVudXMnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdzZWFyY2hQYW5lbC9haVJlc3VsdHMvY29tbWFuZHMnLFxuXHRcdGlkOiBNZW51SWQuU2VhcmNoQWN0aW9uTWVudSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NlYXJjaFBhbmVsLmFpUmVzdWx0c0NvbW1hbmRzJywgXCJUaGUgY29tbWFuZHMgdGhhdCB3aWxsIGNvbnRyaWJ1dGUgdG8gdGhlIG1lbnUgcmVuZGVyZWQgYXMgYnV0dG9ucyBuZXh0IHRvIHRoZSBBSSBzZWFyY2ggdGl0bGVcIiksXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdlZGl0b3IvY29udGV4dC9jaGF0Jyxcblx0XHRpZDogTWVudUlkLkNoYXRUZXh0RWRpdG9yTWVudSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmNoYXRUZXh0RWRpdG9yJywgXCJUaGUgQ2hhdCBzdWJtZW51IGluIHRoZSB0ZXh0IGVkaXRvciBjb250ZXh0IG1lbnUuXCIpLFxuXHRcdHN1cHBvcnRzU3VibWVudXM6IGZhbHNlLFxuXHRcdHByb3Bvc2VkOiAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZSdcblx0fSxcblx0e1xuXHRcdGtleTogJ2NoYXQvaW5wdXQvZWRpdGluZy9zZXNzaW9uVG9vbGJhcicsXG5cdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdGluZ1Nlc3Npb25DaGFuZ2VzVG9vbGJhcixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmNoYXRFZGl0aW5nU2Vzc2lvbkNoYW5nZXNUb29sYmFyJywgXCJUaGUgQ2hhdCBFZGl0aW5nIHdpZGdldCB0b29sYmFyIG1lbnUgZm9yIHNlc3Npb24gY2hhbmdlcy5cIiksXG5cdFx0cHJvcG9zZWQ6ICdjaGF0U2Vzc2lvbnNQcm92aWRlcidcblx0fSxcblx0e1xuXHRcdGtleTogJ2NoYXQvaW5wdXQvZWRpdGluZy9zZXNzaW9uVGl0bGVUb29sYmFyJyxcblx0XHRpZDogTWVudUlkLkNoYXRFZGl0aW5nU2Vzc2lvblRpdGxlVG9vbGJhcixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmNoYXRFZGl0aW5nU2Vzc2lvblRpdGxlVG9vbGJhcicsIFwiVGhlIENoYXQgRWRpdGluZyB3aWRnZXQgdG9vbGJhciBtZW51IGZvciBzZXNzaW9uIHRpdGxlLlwiKSxcblx0XHRwcm9wb3NlZDogJ2NoYXRTZXNzaW9uc1Byb3ZpZGVyJ1xuXHR9LFxuXHR7XG5cdFx0Ly8gVE9ETzogcmVuYW1lIHRoaXMgdG8gc29tZXRoaW5nIGxpa2U6IGBjaGF0U2Vzc2lvbnMvaXRlbS9pbmxpbmVgXG5cdFx0a2V5OiAnY2hhdC9jaGF0U2Vzc2lvbnMnLFxuXHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uc0NvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5jaGF0U2Vzc2lvbnMnLCBcIlRoZSBDaGF0IFNlc3Npb25zIG1lbnUuXCIpLFxuXHRcdHN1cHBvcnRzU3VibWVudXM6IGZhbHNlLFxuXHRcdHByb3Bvc2VkOiAnY2hhdFNlc3Npb25zUHJvdmlkZXInXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjaGF0U2Vzc2lvbnMvaXRlbS9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLlNlc3Npb25JdGVtQ29udGV4dE1lbnUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5jaGF0U2Vzc2lvbnNJdGVtQ29udGV4dCcsIFwiVGhlIGNvbnRleHQgbWVudSBmb3IgaXRlbXMgaW4gdGhlIFNlc3Npb25zIHdpbmRvdydzIHNlc3Npb24gbGlzdC5cIiksXG5cdFx0c3VwcG9ydHNTdWJtZW51czogZmFsc2UsXG5cdFx0cHJvcG9zZWQ6ICdjaGF0U2Vzc2lvbnNQcm92aWRlcidcblx0fSxcblx0e1xuXHRcdGtleTogJ2NoYXRTZXNzaW9ucy9uZXdTZXNzaW9uJyxcblx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvbnNDcmVhdGVTdWJNZW51LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuY2hhdFNlc3Npb25zTmV3U2Vzc2lvbicsIFwiTWVudSBmb3IgbmV3IGNoYXQgc2Vzc2lvbnMuXCIpLFxuXHRcdHN1cHBvcnRzU3VibWVudXM6IGZhbHNlLFxuXHRcdHByb3Bvc2VkOiAnY2hhdFNlc3Npb25zUHJvdmlkZXInXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjaGF0L211bHRpRGlmZi9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLkNoYXRNdWx0aURpZmZDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuY2hhdE11bHRpRGlmZkNvbnRleHQnLCBcIlRoZSBDaGF0IE11bHRpLURpZmYgY29udGV4dCBtZW51LlwiKSxcblx0XHRzdXBwb3J0c1N1Ym1lbnVzOiBmYWxzZSxcblx0XHRwcm9wb3NlZDogJ2NoYXRTZXNzaW9uc1Byb3ZpZGVyJyxcblx0fSxcblx0e1xuXHRcdGtleTogJ2NoYXQvY3VzdG9taXphdGlvbnMvY3JlYXRlJyxcblx0XHRpZDogTWVudUlkLmZvcignQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudENyZWF0ZScpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuY2hhdEN1c3RvbWl6YXRpb25zQ3JlYXRlJywgXCJUaGUgY3JlYXRlIGJ1dHRvbiBpbiB0aGUgQ2hhdCBDdXN0b21pemF0aW9ucyBtYW5hZ2VtZW50IGVkaXRvci5cIiksXG5cdFx0c3VwcG9ydHNTdWJtZW51czogZmFsc2UsXG5cdFx0cHJvcG9zZWQ6ICdjaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Qcm92aWRlcicsXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjaGF0L2N1c3RvbWl6YXRpb25zL2l0ZW0nLFxuXHRcdGlkOiBNZW51SWQuZm9yKCdBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9ySXRlbScpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuY2hhdEN1c3RvbWl6YXRpb25zSXRlbScsIFwiVGhlIGl0ZW0gY29udGV4dCBtZW51IGluIHRoZSBDaGF0IEN1c3RvbWl6YXRpb25zIG1hbmFnZW1lbnQgZWRpdG9yLCBpbmNsdWRpbmcgaW5saW5lIGFjdGlvbnMuXCIpLFxuXHRcdHN1cHBvcnRzU3VibWVudXM6IGZhbHNlLFxuXHRcdHByb3Bvc2VkOiAnY2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXInLFxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY2hhdC9lZGl0b3IvaW5saW5lR3V0dGVyJyxcblx0XHRpZDogTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVNZW51LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuY2hhdEVkaXRvcklubGluZUd1dHRlcicsIFwiVGhlIGlubGluZSBndXR0ZXIgbWVudSBpbiB0aGUgY2hhdCBlZGl0b3IuXCIpLFxuXHRcdHN1cHBvcnRzU3VibWVudXM6IGZhbHNlLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYkNoYXRFZGl0b3JJbmxpbmVHdXR0ZXJNZW51Jyxcblx0fSxcblx0e1xuXHRcdGtleTogJ2NoYXQvY29udGV4dFVzYWdlL2FjdGlvbnMnLFxuXHRcdGlkOiBNZW51SWQuQ2hhdENvbnRleHRVc2FnZUFjdGlvbnMsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5jaGF0Q29udGV4dFVzYWdlQWN0aW9ucycsIFwiQWN0aW9ucyBpbiB0aGUgY2hhdCBjb250ZXh0IHVzYWdlIGRldGFpbHMgcG9wdXAuXCIpLFxuXHRcdHByb3Bvc2VkOiAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJ1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY2hhdC9uZXdTZXNzaW9uJyxcblx0XHRpZDogTWVudUlkLkNoYXROZXdNZW51LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuY2hhdE5ld1Nlc3Npb24nLCBcIlRoZSBDaGF0IG5ldyBzZXNzaW9uIG1lbnUuXCIpLFxuXHRcdHByb3Bvc2VkOiAnY2hhdFNlc3Npb25zUHJvdmlkZXInXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdhZ2VudHMvY2hhbmdlcy9hY3Rpb25zJyxcblx0XHRpZDogTWVudUlkLkFnZW50c0NoYW5nZXNUb29sYmFyLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuYWdlbnRzQ2hhbmdlc1Rvb2xiYXInLCBcIlRoZSBDaGFuZ2VzIHZpZXcgdG9vbGJhciBvZiB0aGUgYWdlbnRzIHdpbmRvdy5cIiksXG5cdFx0cHJvcG9zZWQ6ICdjaGF0U2Vzc2lvbnNQcm92aWRlcidcblx0fSxcblx0e1xuXHRcdGtleTogJ2FnZW50cy9jaGFuZ2VzL2FjdGlvbnMvcHJpbWFyeScsXG5cdFx0aWQ6IE1lbnVJZC5BZ2VudHNDaGFuZ2VzUHJpbWFyeUFjdGlvblN1Yk1lbnUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5hZ2VudHNDaGFuZ2VzUHJpbWFyeUFjdGlvblN1Yk1lbnUnLCBcIlRoZSBDaGFuZ2VzIHZpZXcgdG9vbGJhciBwcmltYXJ5IGFjdGlvbiBzdWJtZW51IGluIHRoZSBhZ2VudHMgd2luZG93LlwiKSxcblx0XHRwcm9wb3NlZDogJ2NoYXRTZXNzaW9uc1Byb3ZpZGVyJ1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnYWdlbnRzL2NoYW5nZS9pbmxpbmUnLFxuXHRcdGlkOiBNZW51SWQuQWdlbnRzQ2hhbmdlSW5saW5lVG9vbGJhcixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmFnZW50c0NoYW5nZUlubGluZScsIFwiVGhlIENoYW5nZXMgdmlldyBpbmxpbmUgbWVudSBpbiB0aGUgYWdlbnRzIHdpbmRvdy5cIiksXG5cdFx0cHJvcG9zZWQ6ICdjaGF0U2Vzc2lvbnNQcm92aWRlcidcblx0fSxcbl07XG5cbm5hbWVzcGFjZSBzY2hlbWEge1xuXG5cdC8vIC0tLSBtZW51cywgc3VibWVudXMgY29udHJpYnV0aW9uIHBvaW50XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJVXNlckZyaWVuZGx5TWVudUl0ZW0ge1xuXHRcdGNvbW1hbmQ6IHN0cmluZztcblx0XHRhbHQ/OiBzdHJpbmc7XG5cdFx0d2hlbj86IHN0cmluZztcblx0XHRncm91cD86IHN0cmluZztcblx0fVxuXG5cdGV4cG9ydCBpbnRlcmZhY2UgSVVzZXJGcmllbmRseVN1Ym1lbnVJdGVtIHtcblx0XHRzdWJtZW51OiBzdHJpbmc7XG5cdFx0d2hlbj86IHN0cmluZztcblx0XHRncm91cD86IHN0cmluZztcblx0fVxuXG5cdGV4cG9ydCBpbnRlcmZhY2UgSVVzZXJGcmllbmRseVN1Ym1lbnUge1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0bGFiZWw6IHN0cmluZztcblx0XHRpY29uPzogSVVzZXJGcmllbmRseUljb247XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaXNNZW51SXRlbShpdGVtOiBJVXNlckZyaWVuZGx5TWVudUl0ZW0gfCBJVXNlckZyaWVuZGx5U3VibWVudUl0ZW0pOiBpdGVtIGlzIElVc2VyRnJpZW5kbHlNZW51SXRlbSB7XG5cdFx0cmV0dXJuIHR5cGVvZiAoaXRlbSBhcyBJVXNlckZyaWVuZGx5TWVudUl0ZW0pLmNvbW1hbmQgPT09ICdzdHJpbmcnO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGlzVmFsaWRNZW51SXRlbShpdGVtOiBJVXNlckZyaWVuZGx5TWVudUl0ZW0sIGNvbGxlY3RvcjogRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3Rvcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0eXBlb2YgaXRlbS5jb21tYW5kICE9PSAnc3RyaW5nJykge1xuXHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdyZXF1aXJlc3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBpcyBtYW5kYXRvcnkgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnY29tbWFuZCcpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGl0ZW0uYWx0ICYmIHR5cGVvZiBpdGVtLmFsdCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnb3B0c3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBjYW4gYmUgb21pdHRlZCBvciBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ2FsdCcpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGl0ZW0ud2hlbiAmJiB0eXBlb2YgaXRlbS53aGVuICE9PSAnc3RyaW5nJykge1xuXHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdvcHRzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIG9yIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnd2hlbicpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGl0ZW0uZ3JvdXAgJiYgdHlwZW9mIGl0ZW0uZ3JvdXAgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ29wdHN0cmluZycsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgb3IgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdncm91cCcpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpc1ZhbGlkU3VibWVudUl0ZW0oaXRlbTogSVVzZXJGcmllbmRseVN1Ym1lbnVJdGVtLCBjb2xsZWN0b3I6IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IpOiBib29sZWFuIHtcblx0XHRpZiAodHlwZW9mIGl0ZW0uc3VibWVudSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgncmVxdWlyZXN0cmluZycsIFwicHJvcGVydHkgYHswfWAgaXMgbWFuZGF0b3J5IGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ3N1Ym1lbnUnKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChpdGVtLndoZW4gJiYgdHlwZW9mIGl0ZW0ud2hlbiAhPT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnb3B0c3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBjYW4gYmUgb21pdHRlZCBvciBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ3doZW4nKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChpdGVtLmdyb3VwICYmIHR5cGVvZiBpdGVtLmdyb3VwICE9PSAnc3RyaW5nJykge1xuXHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdvcHRzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIG9yIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnZ3JvdXAnKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaXNWYWxpZEl0ZW1zKGl0ZW1zOiAoSVVzZXJGcmllbmRseU1lbnVJdGVtIHwgSVVzZXJGcmllbmRseVN1Ym1lbnVJdGVtKVtdLCBjb2xsZWN0b3I6IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IpOiBib29sZWFuIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoaXRlbXMpKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmVhcnJheScsIFwic3VibWVudSBpdGVtcyBtdXN0IGJlIGFuIGFycmF5XCIpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdGlmIChpc01lbnVJdGVtKGl0ZW0pKSB7XG5cdFx0XHRcdGlmICghaXNWYWxpZE1lbnVJdGVtKGl0ZW0sIGNvbGxlY3RvcikpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICghaXNWYWxpZFN1Ym1lbnVJdGVtKGl0ZW0sIGNvbGxlY3RvcikpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpc1ZhbGlkU3VibWVudShzdWJtZW51OiBJVXNlckZyaWVuZGx5U3VibWVudSwgY29sbGVjdG9yOiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yKTogYm9vbGVhbiB7XG5cdFx0aWYgKHR5cGVvZiBzdWJtZW51ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdyZXF1aXJlJywgXCJzdWJtZW51IGl0ZW1zIG11c3QgYmUgYW4gb2JqZWN0XCIpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHN1Ym1lbnUuaWQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmVzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdpZCcpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBzdWJtZW51LmxhYmVsICE9PSAnc3RyaW5nJykge1xuXHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdyZXF1aXJlc3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBpcyBtYW5kYXRvcnkgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnbGFiZWwnKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRjb25zdCBtZW51SXRlbTogSUpTT05TY2hlbWEgPSB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cmVxdWlyZWQ6IFsnY29tbWFuZCddLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLm1lbnVJdGVtLmNvbW1hbmQnLCAnSWRlbnRpZmllciBvZiB0aGUgY29tbWFuZCB0byBleGVjdXRlLiBUaGUgY29tbWFuZCBtdXN0IGJlIGRlY2xhcmVkIGluIHRoZSBcXCdjb21tYW5kc1xcJy1zZWN0aW9uJyksXG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9LFxuXHRcdFx0YWx0OiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5tZW51SXRlbS5hbHQnLCAnSWRlbnRpZmllciBvZiBhbiBhbHRlcm5hdGl2ZSBjb21tYW5kIHRvIGV4ZWN1dGUuIFRoZSBjb21tYW5kIG11c3QgYmUgZGVjbGFyZWQgaW4gdGhlIFxcJ2NvbW1hbmRzXFwnLXNlY3Rpb24nKSxcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0XHR3aGVuOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5tZW51SXRlbS53aGVuJywgJ0NvbmRpdGlvbiB3aGljaCBtdXN0IGJlIHRydWUgdG8gc2hvdyB0aGlzIGl0ZW0nKSxcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0XHRncm91cDoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubWVudUl0ZW0uZ3JvdXAnLCAnR3JvdXAgaW50byB3aGljaCB0aGlzIGl0ZW0gYmVsb25ncycpLFxuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRjb25zdCBzdWJtZW51SXRlbTogSUpTT05TY2hlbWEgPSB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cmVxdWlyZWQ6IFsnc3VibWVudSddLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdHN1Ym1lbnU6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLm1lbnVJdGVtLnN1Ym1lbnUnLCAnSWRlbnRpZmllciBvZiB0aGUgc3VibWVudSB0byBkaXNwbGF5IGluIHRoaXMgaXRlbS4nKSxcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0XHR3aGVuOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5tZW51SXRlbS53aGVuJywgJ0NvbmRpdGlvbiB3aGljaCBtdXN0IGJlIHRydWUgdG8gc2hvdyB0aGlzIGl0ZW0nKSxcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0XHRncm91cDoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubWVudUl0ZW0uZ3JvdXAnLCAnR3JvdXAgaW50byB3aGljaCB0aGlzIGl0ZW0gYmVsb25ncycpLFxuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRjb25zdCBzdWJtZW51OiBJSlNPTlNjaGVtYSA9IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRyZXF1aXJlZDogWydpZCcsICdsYWJlbCddLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdGlkOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5zdWJtZW51LmlkJywgJ0lkZW50aWZpZXIgb2YgdGhlIG1lbnUgdG8gZGlzcGxheSBhcyBhIHN1Ym1lbnUuJyksXG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9LFxuXHRcdFx0bGFiZWw6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnN1Ym1lbnUubGFiZWwnLCAnVGhlIGxhYmVsIG9mIHRoZSBtZW51IGl0ZW0gd2hpY2ggbGVhZHMgdG8gdGhpcyBzdWJtZW51LicpLFxuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fSxcblx0XHRcdGljb246IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKHsga2V5OiAndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5zdWJtZW51Lmljb24nLCBjb21tZW50OiBbJ2RvIG5vdCB0cmFuc2xhdGUgb3IgY2hhbmdlIFwiXFxcXCQoemFwKVwiLCBcXFxcIGluIGZyb250IG9mICQgaXMgaW1wb3J0YW50LiddIH0sICcoT3B0aW9uYWwpIEljb24gd2hpY2ggaXMgdXNlZCB0byByZXByZXNlbnQgdGhlIHN1Ym1lbnUgaW4gdGhlIFVJLiBFaXRoZXIgYSBmaWxlIHBhdGgsIGFuIG9iamVjdCB3aXRoIGZpbGUgcGF0aHMgZm9yIGRhcmsgYW5kIGxpZ2h0IHRoZW1lcywgb3IgYSB0aGVtZSBpY29uIHJlZmVyZW5jZXMsIGxpa2UgXCJcXFxcJCh6YXApXCInKSxcblx0XHRcdFx0YW55T2Y6IFt7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGxpZ2h0OiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5zdWJtZW51Lmljb24ubGlnaHQnLCAnSWNvbiBwYXRoIHdoZW4gYSBsaWdodCB0aGVtZSBpcyB1c2VkJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZGFyazoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuc3VibWVudS5pY29uLmRhcmsnLCAnSWNvbiBwYXRoIHdoZW4gYSBkYXJrIHRoZW1lIGlzIHVzZWQnKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dXG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdGV4cG9ydCBjb25zdCBtZW51c0NvbnRyaWJ1dGlvbjogSUpTT05TY2hlbWEgPSB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLm1lbnVzJywgXCJDb250cmlidXRlcyBtZW51IGl0ZW1zIHRvIHRoZSBlZGl0b3JcIiksXG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczogaW5kZXgoYXBpTWVudXMsIG1lbnUgPT4gbWVudS5rZXksIG1lbnUgPT4gKHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG1lbnUucHJvcG9zZWQgPyBsb2NhbGl6ZSgncHJvcG9zZWQnLCBcIlByb3Bvc2VkIEFQSSwgcmVxdWlyZXMgYGVuYWJsZWRBcGlQcm9wb3NhbDogW1xcXCJ7MH1cXFwiXWAgLSB7MX1cIiwgbWVudS5wcm9wb3NlZCwgbWVudS5kZXNjcmlwdGlvbikgOiBtZW51LmRlc2NyaXB0aW9uLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiBtZW51LnN1cHBvcnRzU3VibWVudXMgPT09IGZhbHNlID8gbWVudUl0ZW0gOiB7IG9uZU9mOiBbbWVudUl0ZW0sIHN1Ym1lbnVJdGVtXSB9XG5cdFx0fSkpLFxuXHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogJ1N1Ym1lbnUnLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7IG9uZU9mOiBbbWVudUl0ZW0sIHN1Ym1lbnVJdGVtXSB9XG5cdFx0fVxuXHR9O1xuXG5cdGV4cG9ydCBjb25zdCBzdWJtZW51c0NvbnRyaWJ1dGlvbjogSUpTT05TY2hlbWEgPSB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnN1Ym1lbnVzJywgXCJDb250cmlidXRlcyBzdWJtZW51IGl0ZW1zIHRvIHRoZSBlZGl0b3JcIiksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczogc3VibWVudVxuXHR9O1xuXG5cdC8vIC0tLSBjb21tYW5kcyBjb250cmlidXRpb24gcG9pbnRcblxuXHRleHBvcnQgaW50ZXJmYWNlIElVc2VyRnJpZW5kbHlDb21tYW5kIHtcblx0XHRjb21tYW5kOiBzdHJpbmc7XG5cdFx0dGl0bGU6IHN0cmluZyB8IElMb2NhbGl6ZWRTdHJpbmc7XG5cdFx0c2hvcnRUaXRsZT86IHN0cmluZyB8IElMb2NhbGl6ZWRTdHJpbmc7XG5cdFx0ZW5hYmxlbWVudD86IHN0cmluZztcblx0XHRjYXRlZ29yeT86IHN0cmluZyB8IElMb2NhbGl6ZWRTdHJpbmc7XG5cdFx0aWNvbj86IElVc2VyRnJpZW5kbHlJY29uO1xuXHR9XG5cblx0ZXhwb3J0IHR5cGUgSVVzZXJGcmllbmRseUljb24gPSBzdHJpbmcgfCB7IGxpZ2h0OiBzdHJpbmc7IGRhcms6IHN0cmluZyB9O1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBpc1ZhbGlkQ29tbWFuZChjb21tYW5kOiBJVXNlckZyaWVuZGx5Q29tbWFuZCwgY29sbGVjdG9yOiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ25vbmVtcHR5JywgXCJleHBlY3RlZCBub24tZW1wdHkgdmFsdWUuXCIpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGlzRmFsc3lPcldoaXRlc3BhY2UoY29tbWFuZC5jb21tYW5kKSkge1xuXHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdyZXF1aXJlc3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBpcyBtYW5kYXRvcnkgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnY29tbWFuZCcpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCFpc1ZhbGlkTG9jYWxpemVkU3RyaW5nKGNvbW1hbmQudGl0bGUsIGNvbGxlY3RvciwgJ3RpdGxlJykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGNvbW1hbmQuc2hvcnRUaXRsZSAmJiAhaXNWYWxpZExvY2FsaXplZFN0cmluZyhjb21tYW5kLnNob3J0VGl0bGUsIGNvbGxlY3RvciwgJ3Nob3J0VGl0bGUnKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoY29tbWFuZC5lbmFibGVtZW50ICYmIHR5cGVvZiBjb21tYW5kLmVuYWJsZW1lbnQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ29wdHN0cmluZycsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgb3IgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdwcmVjb25kaXRpb24nKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChjb21tYW5kLmNhdGVnb3J5ICYmICFpc1ZhbGlkTG9jYWxpemVkU3RyaW5nKGNvbW1hbmQuY2F0ZWdvcnksIGNvbGxlY3RvciwgJ2NhdGVnb3J5JykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCFpc1ZhbGlkSWNvbihjb21tYW5kLmljb24sIGNvbGxlY3RvcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRmdW5jdGlvbiBpc1ZhbGlkSWNvbihpY29uOiBJVXNlckZyaWVuZGx5SWNvbiB8IHVuZGVmaW5lZCwgY29sbGVjdG9yOiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yKTogYm9vbGVhbiB7XG5cdFx0aWYgKHR5cGVvZiBpY29uID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgaWNvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGljb24uZGFyayA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIGljb24ubGlnaHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdvcHRpY29uJywgXCJwcm9wZXJ0eSBgaWNvbmAgY2FuIGJlIG9taXR0ZWQgb3IgbXVzdCBiZSBlaXRoZXIgYSBzdHJpbmcgb3IgYSBsaXRlcmFsIGxpa2UgYHtkYXJrLCBsaWdodH1gXCIpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRmdW5jdGlvbiBpc1ZhbGlkTG9jYWxpemVkU3RyaW5nKGxvY2FsaXplZDogc3RyaW5nIHwgSUxvY2FsaXplZFN0cmluZywgY29sbGVjdG9yOiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yLCBwcm9wZXJ0eU5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICh0eXBlb2YgbG9jYWxpemVkID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdyZXF1aXJlU3RyaW5nT3JPYmplY3QnLCBcInByb3BlcnR5IGB7MH1gIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgIG9yIGBvYmplY3RgXCIsIHByb3BlcnR5TmFtZSkpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGxvY2FsaXplZCA9PT0gJ3N0cmluZycgJiYgaXNGYWxzeU9yV2hpdGVzcGFjZShsb2NhbGl6ZWQpKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmVzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsIHByb3BlcnR5TmFtZSkpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGxvY2FsaXplZCAhPT0gJ3N0cmluZycgJiYgKGlzRmFsc3lPcldoaXRlc3BhY2UobG9jYWxpemVkLm9yaWdpbmFsKSB8fCBpc0ZhbHN5T3JXaGl0ZXNwYWNlKGxvY2FsaXplZC52YWx1ZSkpKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmVzdHJpbmdzJywgXCJwcm9wZXJ0aWVzIGB7MH1gIGFuZCBgezF9YCBhcmUgbWFuZGF0b3J5IGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgYCR7cHJvcGVydHlOYW1lfS52YWx1ZWAsIGAke3Byb3BlcnR5TmFtZX0ub3JpZ2luYWxgKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRjb25zdCBjb21tYW5kVHlwZTogSUpTT05TY2hlbWEgPSB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cmVxdWlyZWQ6IFsnY29tbWFuZCcsICd0aXRsZSddLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmNvbW1hbmRUeXBlLmNvbW1hbmQnLCAnSWRlbnRpZmllciBvZiB0aGUgY29tbWFuZCB0byBleGVjdXRlJyksXG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9LFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmNvbW1hbmRUeXBlLnRpdGxlJywgJ1RpdGxlIGJ5IHdoaWNoIHRoZSBjb21tYW5kIGlzIHJlcHJlc2VudGVkIGluIHRoZSBVSScpLFxuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fSxcblx0XHRcdHNob3J0VGl0bGU6IHtcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuY29tbWFuZFR5cGUuc2hvcnRUaXRsZScsICcoT3B0aW9uYWwpIFNob3J0IHRpdGxlIGJ5IHdoaWNoIHRoZSBjb21tYW5kIGlzIHJlcHJlc2VudGVkIGluIHRoZSBVSS4gTWVudXMgcGljayBlaXRoZXIgYHRpdGxlYCBvciBgc2hvcnRUaXRsZWAgZGVwZW5kaW5nIG9uIHRoZSBjb250ZXh0IGluIHdoaWNoIHRoZXkgc2hvdyBjb21tYW5kcy4nKSxcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuY29tbWFuZFR5cGUuY2F0ZWdvcnknLCAnKE9wdGlvbmFsKSBDYXRlZ29yeSBzdHJpbmcgYnkgd2hpY2ggdGhlIGNvbW1hbmQgaXMgZ3JvdXBlZCBpbiB0aGUgVUknKSxcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0XHRlbmFibGVtZW50OiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5jb21tYW5kVHlwZS5wcmVjb25kaXRpb24nLCAnKE9wdGlvbmFsKSBDb25kaXRpb24gd2hpY2ggbXVzdCBiZSB0cnVlIHRvIGVuYWJsZSB0aGUgY29tbWFuZCBpbiB0aGUgVUkgKG1lbnUgYW5kIGtleWJpbmRpbmdzKS4gRG9lcyBub3QgcHJldmVudCBleGVjdXRpbmcgdGhlIGNvbW1hbmQgYnkgb3RoZXIgbWVhbnMsIGxpa2UgdGhlIGBleGVjdXRlQ29tbWFuZGAtYXBpLicpLFxuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fSxcblx0XHRcdGljb246IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKHsga2V5OiAndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5jb21tYW5kVHlwZS5pY29uJywgY29tbWVudDogWydkbyBub3QgdHJhbnNsYXRlIG9yIGNoYW5nZSBcIlxcXFwkKHphcClcIiwgXFxcXCBpbiBmcm9udCBvZiAkIGlzIGltcG9ydGFudC4nXSB9LCAnKE9wdGlvbmFsKSBJY29uIHdoaWNoIGlzIHVzZWQgdG8gcmVwcmVzZW50IHRoZSBjb21tYW5kIGluIHRoZSBVSS4gRWl0aGVyIGEgZmlsZSBwYXRoLCBhbiBvYmplY3Qgd2l0aCBmaWxlIHBhdGhzIGZvciBkYXJrIGFuZCBsaWdodCB0aGVtZXMsIG9yIGEgdGhlbWUgaWNvbiByZWZlcmVuY2VzLCBsaWtlIFwiXFxcXCQoemFwKVwiJyksXG5cdFx0XHRcdGFueU9mOiBbe1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRsaWdodDoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuY29tbWFuZFR5cGUuaWNvbi5saWdodCcsICdJY29uIHBhdGggd2hlbiBhIGxpZ2h0IHRoZW1lIGlzIHVzZWQnKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRkYXJrOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5jb21tYW5kVHlwZS5pY29uLmRhcmsnLCAnSWNvbiBwYXRoIHdoZW4gYSBkYXJrIHRoZW1lIGlzIHVzZWQnKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dXG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdGV4cG9ydCBjb25zdCBjb21tYW5kc0NvbnRyaWJ1dGlvbjogSUpTT05TY2hlbWEgPSB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmNvbW1hbmRzJywgXCJDb250cmlidXRlcyBjb21tYW5kcyB0byB0aGUgY29tbWFuZCBwYWxldHRlLlwiKSxcblx0XHRvbmVPZjogW1xuXHRcdFx0Y29tbWFuZFR5cGUsXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiBjb21tYW5kVHlwZVxuXHRcdFx0fVxuXHRcdF1cblx0fTtcbn1cblxuY29uc3QgX2NvbW1hbmRSZWdpc3RyYXRpb25zID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5leHBvcnQgY29uc3QgY29tbWFuZHNFeHRlbnNpb25Qb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PHNjaGVtYS5JVXNlckZyaWVuZGx5Q29tbWFuZCB8IHNjaGVtYS5JVXNlckZyaWVuZGx5Q29tbWFuZFtdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnY29tbWFuZHMnLFxuXHRqc29uU2NoZW1hOiBzY2hlbWEuY29tbWFuZHNDb250cmlidXRpb24sXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAoY29udHJpYnM6IHJlYWRvbmx5IHNjaGVtYS5JVXNlckZyaWVuZGx5Q29tbWFuZFtdKSB7XG5cdFx0Zm9yIChjb25zdCBjb250cmliIG9mIGNvbnRyaWJzKSB7XG5cdFx0XHRpZiAoY29udHJpYi5jb21tYW5kKSB7XG5cdFx0XHRcdHlpZWxkIGBvbkNvbW1hbmQ6JHtjb250cmliLmNvbW1hbmR9YDtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5jb21tYW5kc0V4dGVuc2lvblBvaW50LnNldEhhbmRsZXIoZXh0ZW5zaW9ucyA9PiB7XG5cblx0ZnVuY3Rpb24gaGFuZGxlQ29tbWFuZCh1c2VyRnJpZW5kbHlDb21tYW5kOiBzY2hlbWEuSVVzZXJGcmllbmRseUNvbW1hbmQsIGV4dGVuc2lvbjogSUV4dGVuc2lvblBvaW50VXNlcjx1bmtub3duPikge1xuXG5cdFx0aWYgKCFzY2hlbWEuaXNWYWxpZENvbW1hbmQodXNlckZyaWVuZGx5Q29tbWFuZCwgZXh0ZW5zaW9uLmNvbGxlY3RvcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGljb24sIGVuYWJsZW1lbnQsIGNhdGVnb3J5LCB0aXRsZSwgc2hvcnRUaXRsZSwgY29tbWFuZCB9ID0gdXNlckZyaWVuZGx5Q29tbWFuZDtcblxuXHRcdGxldCBhYnNvbHV0ZUljb246IHsgZGFyazogVVJJOyBsaWdodD86IFVSSSB9IHwgVGhlbWVJY29uIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChpY29uKSB7XG5cdFx0XHRpZiAodHlwZW9mIGljb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGFic29sdXRlSWNvbiA9IFRoZW1lSWNvbi5mcm9tU3RyaW5nKGljb24pID8/IHsgZGFyazogcmVzb3VyY2VzLmpvaW5QYXRoKGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgaWNvbiksIGxpZ2h0OiByZXNvdXJjZXMuam9pblBhdGgoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uLCBpY29uKSB9O1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhYnNvbHV0ZUljb24gPSB7XG5cdFx0XHRcdFx0ZGFyazogcmVzb3VyY2VzLmpvaW5QYXRoKGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgaWNvbi5kYXJrKSxcblx0XHRcdFx0XHRsaWdodDogcmVzb3VyY2VzLmpvaW5QYXRoKGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgaWNvbi5saWdodClcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBleGlzdGluZ0NtZCA9IE1lbnVSZWdpc3RyeS5nZXRDb21tYW5kKGNvbW1hbmQpO1xuXHRcdGlmIChleGlzdGluZ0NtZCkge1xuXHRcdFx0aWYgKGV4aXN0aW5nQ21kLnNvdXJjZSkge1xuXHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmluZm8obG9jYWxpemUoJ2R1cDEnLCBcIkNvbW1hbmQgYHswfWAgYWxyZWFkeSByZWdpc3RlcmVkIGJ5IHsxfSAoezJ9KVwiLCB1c2VyRnJpZW5kbHlDb21tYW5kLmNvbW1hbmQsIGV4aXN0aW5nQ21kLnNvdXJjZS50aXRsZSwgZXhpc3RpbmdDbWQuc291cmNlLmlkKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmluZm8obG9jYWxpemUoJ2R1cDAnLCBcIkNvbW1hbmQgYHswfWAgYWxyZWFkeSByZWdpc3RlcmVkXCIsIHVzZXJGcmllbmRseUNvbW1hbmQuY29tbWFuZCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRfY29tbWFuZFJlZ2lzdHJhdGlvbnMuYWRkKE1lbnVSZWdpc3RyeS5hZGRDb21tYW5kKHtcblx0XHRcdGlkOiBjb21tYW5kLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRzb3VyY2U6IHsgaWQ6IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlLCB0aXRsZTogZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5uYW1lIH0sXG5cdFx0XHRzaG9ydFRpdGxlLFxuXHRcdFx0dG9vbHRpcDogdGl0bGUsXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoZW5hYmxlbWVudCksXG5cdFx0XHRpY29uOiBhYnNvbHV0ZUljb25cblx0XHR9KSk7XG5cdH1cblxuXHQvLyByZW1vdmUgYWxsIHByZXZpb3VzIGNvbW1hbmQgcmVnaXN0cmF0aW9uc1xuXHRfY29tbWFuZFJlZ2lzdHJhdGlvbnMuY2xlYXIoKTtcblxuXHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0Y29uc3QgeyB2YWx1ZSB9ID0gZXh0ZW5zaW9uO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIHZhbHVlKSB7XG5cdFx0XHRcdGhhbmRsZUNvbW1hbmQoY29tbWFuZCwgZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aGFuZGxlQ29tbWFuZCh2YWx1ZSwgZXh0ZW5zaW9uKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5pbnRlcmZhY2UgSVJlZ2lzdGVyZWRTdWJtZW51IHtcblx0cmVhZG9ubHkgaWQ6IE1lbnVJZDtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbj86IHsgZGFyazogVVJJOyBsaWdodD86IFVSSSB9IHwgVGhlbWVJY29uO1xufVxuXG5jb25zdCBfc3VibWVudXMgPSBuZXcgTWFwPHN0cmluZywgSVJlZ2lzdGVyZWRTdWJtZW51PigpO1xuXG5jb25zdCBzdWJtZW51c0V4dGVuc2lvblBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8c2NoZW1hLklVc2VyRnJpZW5kbHlTdWJtZW51W10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdzdWJtZW51cycsXG5cdGpzb25TY2hlbWE6IHNjaGVtYS5zdWJtZW51c0NvbnRyaWJ1dGlvblxufSk7XG5cbnN1Ym1lbnVzRXh0ZW5zaW9uUG9pbnQuc2V0SGFuZGxlcihleHRlbnNpb25zID0+IHtcblxuXHRfc3VibWVudXMuY2xlYXIoKTtcblxuXHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0Y29uc3QgeyB2YWx1ZSwgY29sbGVjdG9yIH0gPSBleHRlbnNpb247XG5cblx0XHRmb3IgKGNvbnN0IFssIHN1Ym1lbnVJbmZvXSBvZiBPYmplY3QuZW50cmllcyh2YWx1ZSkpIHtcblxuXHRcdFx0aWYgKCFzY2hlbWEuaXNWYWxpZFN1Ym1lbnUoc3VibWVudUluZm8sIGNvbGxlY3RvcikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghc3VibWVudUluZm8uaWQpIHtcblx0XHRcdFx0Y29sbGVjdG9yLndhcm4obG9jYWxpemUoJ3N1Ym1lbnVJZC5pbnZhbGlkLmlkJywgXCJgezB9YCBpcyBub3QgYSB2YWxpZCBzdWJtZW51IGlkZW50aWZpZXJcIiwgc3VibWVudUluZm8uaWQpKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoX3N1Ym1lbnVzLmhhcyhzdWJtZW51SW5mby5pZCkpIHtcblx0XHRcdFx0Y29sbGVjdG9yLmluZm8obG9jYWxpemUoJ3N1Ym1lbnVJZC5kdXBsaWNhdGUuaWQnLCBcIlRoZSBgezB9YCBzdWJtZW51IHdhcyBhbHJlYWR5IHByZXZpb3VzbHkgcmVnaXN0ZXJlZC5cIiwgc3VibWVudUluZm8uaWQpKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXN1Ym1lbnVJbmZvLmxhYmVsKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci53YXJuKGxvY2FsaXplKCdzdWJtZW51SWQuaW52YWxpZC5sYWJlbCcsIFwiYHswfWAgaXMgbm90IGEgdmFsaWQgc3VibWVudSBsYWJlbFwiLCBzdWJtZW51SW5mby5sYWJlbCkpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGFic29sdXRlSWNvbjogeyBkYXJrOiBVUkk7IGxpZ2h0PzogVVJJIH0gfCBUaGVtZUljb24gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoc3VibWVudUluZm8uaWNvbikge1xuXHRcdFx0XHRpZiAodHlwZW9mIHN1Ym1lbnVJbmZvLmljb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0YWJzb2x1dGVJY29uID0gVGhlbWVJY29uLmZyb21TdHJpbmcoc3VibWVudUluZm8uaWNvbikgfHwgeyBkYXJrOiByZXNvdXJjZXMuam9pblBhdGgoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uLCBzdWJtZW51SW5mby5pY29uKSB9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFic29sdXRlSWNvbiA9IHtcblx0XHRcdFx0XHRcdGRhcms6IHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIHN1Ym1lbnVJbmZvLmljb24uZGFyayksXG5cdFx0XHRcdFx0XHRsaWdodDogcmVzb3VyY2VzLmpvaW5QYXRoKGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgc3VibWVudUluZm8uaWNvbi5saWdodClcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGl0ZW06IElSZWdpc3RlcmVkU3VibWVudSA9IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5mb3IoYGFwaToke3N1Ym1lbnVJbmZvLmlkfWApLFxuXHRcdFx0XHRsYWJlbDogc3VibWVudUluZm8ubGFiZWwsXG5cdFx0XHRcdGljb246IGFic29sdXRlSWNvblxuXHRcdFx0fTtcblxuXHRcdFx0X3N1Ym1lbnVzLnNldChzdWJtZW51SW5mby5pZCwgaXRlbSk7XG5cdFx0fVxuXHR9XG59KTtcblxuY29uc3QgX2FwaU1lbnVzQnlLZXkgPSBuZXcgTWFwKGFwaU1lbnVzLm1hcChtZW51ID0+IChbbWVudS5rZXksIG1lbnVdKSkpO1xuY29uc3QgX21lbnVSZWdpc3RyYXRpb25zID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuY29uc3QgX3N1Ym1lbnVNZW51SXRlbXMgPSBuZXcgTWFwPHN0cmluZyAvKiBtZW51IGlkICovLCBTZXQ8c3RyaW5nIC8qIHN1Ym1lbnUgaWQgKi8+PigpO1xuXG5jb25zdCBtZW51c0V4dGVuc2lvblBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8eyBbbG9jOiBzdHJpbmddOiAoc2NoZW1hLklVc2VyRnJpZW5kbHlNZW51SXRlbSB8IHNjaGVtYS5JVXNlckZyaWVuZGx5U3VibWVudUl0ZW0pW10gfT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ21lbnVzJyxcblx0anNvblNjaGVtYTogc2NoZW1hLm1lbnVzQ29udHJpYnV0aW9uLFxuXHRkZXBzOiBbc3VibWVudXNFeHRlbnNpb25Qb2ludF1cbn0pO1xuXG5tZW51c0V4dGVuc2lvblBvaW50LnNldEhhbmRsZXIoZXh0ZW5zaW9ucyA9PiB7XG5cblx0Ly8gcmVtb3ZlIGFsbCBwcmV2aW91cyBtZW51IHJlZ2lzdHJhdGlvbnNcblx0X21lbnVSZWdpc3RyYXRpb25zLmNsZWFyKCk7XG5cdF9zdWJtZW51TWVudUl0ZW1zLmNsZWFyKCk7XG5cblx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdGNvbnN0IHsgdmFsdWUsIGNvbGxlY3RvciB9ID0gZXh0ZW5zaW9uO1xuXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBPYmplY3QuZW50cmllcyh2YWx1ZSkpIHtcblx0XHRcdGlmICghc2NoZW1hLmlzVmFsaWRJdGVtcyhlbnRyeVsxXSwgY29sbGVjdG9yKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IG1lbnUgPSBfYXBpTWVudXNCeUtleS5nZXQoZW50cnlbMF0pO1xuXG5cdFx0XHRpZiAoIW1lbnUpIHtcblx0XHRcdFx0Y29uc3Qgc3VibWVudSA9IF9zdWJtZW51cy5nZXQoZW50cnlbMF0pO1xuXG5cdFx0XHRcdGlmIChzdWJtZW51KSB7XG5cdFx0XHRcdFx0bWVudSA9IHtcblx0XHRcdFx0XHRcdGtleTogZW50cnlbMF0sXG5cdFx0XHRcdFx0XHRpZDogc3VibWVudS5pZCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnJ1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFtZW51KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobWVudS5wcm9wb3NlZCAmJiAhaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLCBtZW51LnByb3Bvc2VkKSkge1xuXHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3Byb3Bvc2VkQVBJLmludmFsaWQnLCBcInswfSBpcyBhIHByb3Bvc2VkIG1lbnUgaWRlbnRpZmllci4gSXQgcmVxdWlyZXMgJ3BhY2thZ2UuanNvbiNlbmFibGVkQXBpUHJvcG9zYWxzOiBbXFxcInsxfVxcXCJdJyBhbmQgaXMgb25seSBhdmFpbGFibGUgd2hlbiBydW5uaW5nIG91dCBvZiBkZXYgb3Igd2l0aCB0aGUgZm9sbG93aW5nIGNvbW1hbmQgbGluZSBzd2l0Y2g6IC0tZW5hYmxlLXByb3Bvc2VkLWFwaSB7Mn1cIiwgZW50cnlbMF0sIG1lbnUucHJvcG9zZWQsIGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IG1lbnVJdGVtIG9mIGVudHJ5WzFdKSB7XG5cdFx0XHRcdGxldCBpdGVtOiBJTWVudUl0ZW0gfCBJU3VibWVudUl0ZW07XG5cblx0XHRcdFx0aWYgKHNjaGVtYS5pc01lbnVJdGVtKG1lbnVJdGVtKSkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBNZW51UmVnaXN0cnkuZ2V0Q29tbWFuZChtZW51SXRlbS5jb21tYW5kKTtcblx0XHRcdFx0XHRjb25zdCBhbHQgPSBtZW51SXRlbS5hbHQgJiYgTWVudVJlZ2lzdHJ5LmdldENvbW1hbmQobWVudUl0ZW0uYWx0KSB8fCB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHRpZiAoIWNvbW1hbmQpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnbWlzc2luZy5jb21tYW5kJywgXCJNZW51IGl0ZW0gcmVmZXJlbmNlcyBhIGNvbW1hbmQgYHswfWAgd2hpY2ggaXMgbm90IGRlZmluZWQgaW4gdGhlICdjb21tYW5kcycgc2VjdGlvbi5cIiwgbWVudUl0ZW0uY29tbWFuZCkpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtZW51SXRlbS5hbHQgJiYgIWFsdCkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLndhcm4obG9jYWxpemUoJ21pc3NpbmcuYWx0Q29tbWFuZCcsIFwiTWVudSBpdGVtIHJlZmVyZW5jZXMgYW4gYWx0LWNvbW1hbmQgYHswfWAgd2hpY2ggaXMgbm90IGRlZmluZWQgaW4gdGhlICdjb21tYW5kcycgc2VjdGlvbi5cIiwgbWVudUl0ZW0uYWx0KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtZW51SXRlbS5jb21tYW5kID09PSBtZW51SXRlbS5hbHQpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5pbmZvKGxvY2FsaXplKCdkdXBlLmNvbW1hbmQnLCBcIk1lbnUgaXRlbSByZWZlcmVuY2VzIHRoZSBzYW1lIGNvbW1hbmQgYXMgZGVmYXVsdCBhbmQgYWx0LWNvbW1hbmRcIikpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGl0ZW0gPSB7IGNvbW1hbmQsIGFsdCwgZ3JvdXA6IHVuZGVmaW5lZCwgb3JkZXI6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkIH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKG1lbnUuc3VwcG9ydHNTdWJtZW51cyA9PT0gZmFsc2UpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgndW5zdXBwb3J0ZWQuc3VibWVudXJlZmVyZW5jZScsIFwiTWVudSBpdGVtIHJlZmVyZW5jZXMgYSBzdWJtZW51IGZvciBhIG1lbnUgd2hpY2ggZG9lc24ndCBoYXZlIHN1Ym1lbnUgc3VwcG9ydC5cIikpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3Qgc3VibWVudSA9IF9zdWJtZW51cy5nZXQobWVudUl0ZW0uc3VibWVudSk7XG5cblx0XHRcdFx0XHRpZiAoIXN1Ym1lbnUpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnbWlzc2luZy5zdWJtZW51JywgXCJNZW51IGl0ZW0gcmVmZXJlbmNlcyBhIHN1Ym1lbnUgYHswfWAgd2hpY2ggaXMgbm90IGRlZmluZWQgaW4gdGhlICdzdWJtZW51cycgc2VjdGlvbi5cIiwgbWVudUl0ZW0uc3VibWVudSkpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bGV0IHN1Ym1lbnVSZWdpc3RyYXRpb25zID0gX3N1Ym1lbnVNZW51SXRlbXMuZ2V0KG1lbnUuaWQuaWQpO1xuXG5cdFx0XHRcdFx0aWYgKCFzdWJtZW51UmVnaXN0cmF0aW9ucykge1xuXHRcdFx0XHRcdFx0c3VibWVudVJlZ2lzdHJhdGlvbnMgPSBuZXcgU2V0KCk7XG5cdFx0XHRcdFx0XHRfc3VibWVudU1lbnVJdGVtcy5zZXQobWVudS5pZC5pZCwgc3VibWVudVJlZ2lzdHJhdGlvbnMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChzdWJtZW51UmVnaXN0cmF0aW9ucy5oYXMoc3VibWVudS5pZC5pZCkpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci53YXJuKGxvY2FsaXplKCdzdWJtZW51SXRlbS5kdXBsaWNhdGUnLCBcIlRoZSBgezB9YCBzdWJtZW51IHdhcyBhbHJlYWR5IGNvbnRyaWJ1dGVkIHRvIHRoZSBgezF9YCBtZW51LlwiLCBtZW51SXRlbS5zdWJtZW51LCBlbnRyeVswXSkpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0c3VibWVudVJlZ2lzdHJhdGlvbnMuYWRkKHN1Ym1lbnUuaWQuaWQpO1xuXG5cdFx0XHRcdFx0aXRlbSA9IHsgc3VibWVudTogc3VibWVudS5pZCwgaWNvbjogc3VibWVudS5pY29uLCB0aXRsZTogc3VibWVudS5sYWJlbCwgZ3JvdXA6IHVuZGVmaW5lZCwgb3JkZXI6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkIH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobWVudUl0ZW0uZ3JvdXApIHtcblx0XHRcdFx0XHRjb25zdCBpZHggPSBtZW51SXRlbS5ncm91cC5sYXN0SW5kZXhPZignQCcpO1xuXHRcdFx0XHRcdGlmIChpZHggPiAwKSB7XG5cdFx0XHRcdFx0XHRpdGVtLmdyb3VwID0gbWVudUl0ZW0uZ3JvdXAuc3Vic3RyKDAsIGlkeCk7XG5cdFx0XHRcdFx0XHRpdGVtLm9yZGVyID0gTnVtYmVyKG1lbnVJdGVtLmdyb3VwLnN1YnN0cihpZHggKyAxKSkgfHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpdGVtLmdyb3VwID0gbWVudUl0ZW0uZ3JvdXA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1lbnUuaWQgPT09IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUgJiYgIW1lbnVJdGVtLndoZW4/LmluY2x1ZGVzKCd2aWV3Q29udGFpbmVyID09IHdvcmtiZW5jaC52aWV3LmRlYnVnJykpIHtcblx0XHRcdFx0XHQvLyBOb3QgYSBwZXJmZWN0IGNoZWNrIGJ1dCBlbm91Z2ggdG8gY29tbXVuaWNhdGUgdGhhdCB0aGlzIHByb3Bvc2VkIGV4dGVuc2lvbiBwb2ludCBpcyBjdXJyZW50bHkgb25seSBmb3IgdGhlIGRlYnVnIHZpZXcgY29udGFpbmVyXG5cdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCd2aWV3Q29udGFpbmVyVGl0bGUud2hlbicsIFwiVGhlIHswfSBtZW51IGNvbnRyaWJ1dGlvbiBtdXN0IGNoZWNrIHsxfSBpbiBpdHMgezJ9IGNsYXVzZS5cIiwgJ2B2aWV3Q29udGFpbmVyL3RpdGxlYCcsICdgdmlld0NvbnRhaW5lciA9PSB3b3JrYmVuY2gudmlldy5kZWJ1Z2AnLCAnXCJ3aGVuXCInKSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpdGVtLndoZW4gPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShtZW51SXRlbS53aGVuKTtcblx0XHRcdFx0X21lbnVSZWdpc3RyYXRpb25zLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudS5pZCwgaXRlbSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmNsYXNzIENvbW1hbmRzVGFibGVSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAndGFibGUnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZVxuXHQpIHsgc3VwZXIoKTsgfVxuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/LmNvbW1hbmRzO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPElUYWJsZURhdGE+IHtcblx0XHRjb25zdCByYXdDb21tYW5kcyA9IG1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5jb21tYW5kcyB8fCBbXTtcblx0XHRjb25zdCBjb21tYW5kcyA9IHJhd0NvbW1hbmRzLm1hcChjID0+ICh7XG5cdFx0XHRpZDogYy5jb21tYW5kLFxuXHRcdFx0dGl0bGU6IGMudGl0bGUsXG5cdFx0XHRrZXliaW5kaW5nczogW10gYXMgUmVzb2x2ZWRLZXliaW5kaW5nW10sXG5cdFx0XHRtZW51czogW10gYXMgc3RyaW5nW11cblx0XHR9KSk7XG5cblx0XHRjb25zdCBieUlkID0gaW5kZXgoY29tbWFuZHMsIGMgPT4gYy5pZCk7XG5cblx0XHRjb25zdCBtZW51cyA9IG1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5tZW51cyB8fCB7fTtcblxuXHRcdC8vIEFkZCB0byBjb21tYW5kUGFsZXR0ZSBhcnJheSBhbnkgY29tbWFuZHMgbm90IGV4cGxpY2l0bHkgY29udHJpYnV0ZWQgdG8gaXRcblx0XHRjb25zdCBpbXBsaWNpdGx5T25Db21tYW5kUGFsZXR0ZSA9IGluZGV4KGNvbW1hbmRzLCBjID0+IGMuaWQpO1xuXHRcdGlmIChtZW51c1snY29tbWFuZFBhbGV0dGUnXSkge1xuXHRcdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIG1lbnVzWydjb21tYW5kUGFsZXR0ZSddKSB7XG5cdFx0XHRcdGRlbGV0ZSBpbXBsaWNpdGx5T25Db21tYW5kUGFsZXR0ZVtjb21tYW5kLmNvbW1hbmRdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChPYmplY3Qua2V5cyhpbXBsaWNpdGx5T25Db21tYW5kUGFsZXR0ZSkubGVuZ3RoKSB7XG5cdFx0XHRpZiAoIW1lbnVzWydjb21tYW5kUGFsZXR0ZSddKSB7XG5cdFx0XHRcdG1lbnVzWydjb21tYW5kUGFsZXR0ZSddID0gW107XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgaW4gaW1wbGljaXRseU9uQ29tbWFuZFBhbGV0dGUpIHtcblx0XHRcdFx0bWVudXNbJ2NvbW1hbmRQYWxldHRlJ10ucHVzaCh7IGNvbW1hbmQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBjb250ZXh0IGluIG1lbnVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG1lbnUgb2YgbWVudXNbY29udGV4dF0pIHtcblxuXHRcdFx0XHQvLyBUaGlzIHR5cGljYWxseSBoYXBwZW5zIGZvciB0aGUgY29tbWFuZFBhbGV0dGUgY29udGV4dFxuXHRcdFx0XHRpZiAobWVudS53aGVuID09PSAnZmFsc2UnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1lbnUuY29tbWFuZCkge1xuXHRcdFx0XHRcdGxldCBjb21tYW5kID0gYnlJZFttZW51LmNvbW1hbmRdO1xuXHRcdFx0XHRcdGlmIChjb21tYW5kKSB7XG5cdFx0XHRcdFx0XHRpZiAoIWNvbW1hbmQubWVudXMuaW5jbHVkZXMoY29udGV4dCkpIHtcblx0XHRcdFx0XHRcdFx0Y29tbWFuZC5tZW51cy5wdXNoKGNvbnRleHQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb21tYW5kID0geyBpZDogbWVudS5jb21tYW5kLCB0aXRsZTogJycsIGtleWJpbmRpbmdzOiBbXSwgbWVudXM6IFtjb250ZXh0XSB9O1xuXHRcdFx0XHRcdFx0YnlJZFtjb21tYW5kLmlkXSA9IGNvbW1hbmQ7XG5cdFx0XHRcdFx0XHRjb21tYW5kcy5wdXNoKGNvbW1hbmQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJhd0tleWJpbmRpbmdzID0gbWFuaWZlc3QuY29udHJpYnV0ZXM/LmtleWJpbmRpbmdzID8gKEFycmF5LmlzQXJyYXkobWFuaWZlc3QuY29udHJpYnV0ZXMua2V5YmluZGluZ3MpID8gbWFuaWZlc3QuY29udHJpYnV0ZXMua2V5YmluZGluZ3MgOiBbbWFuaWZlc3QuY29udHJpYnV0ZXMua2V5YmluZGluZ3NdKSA6IFtdO1xuXG5cdFx0cmF3S2V5YmluZGluZ3MuZm9yRWFjaChyYXdLZXliaW5kaW5nID0+IHtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLnJlc29sdmVLZXliaW5kaW5nKHJhd0tleWJpbmRpbmcpO1xuXG5cdFx0XHRpZiAoIWtleWJpbmRpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgY29tbWFuZCA9IGJ5SWRbcmF3S2V5YmluZGluZy5jb21tYW5kXTtcblxuXHRcdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdFx0Y29tbWFuZC5rZXliaW5kaW5ncy5wdXNoKGtleWJpbmRpbmcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29tbWFuZCA9IHsgaWQ6IHJhd0tleWJpbmRpbmcuY29tbWFuZCwgdGl0bGU6ICcnLCBrZXliaW5kaW5nczogW2tleWJpbmRpbmddLCBtZW51czogW10gfTtcblx0XHRcdFx0YnlJZFtjb21tYW5kLmlkXSA9IGNvbW1hbmQ7XG5cdFx0XHRcdGNvbW1hbmRzLnB1c2goY29tbWFuZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoIWNvbW1hbmRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBoZWFkZXJzOiBbXSwgcm93czogW10gfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtcblx0XHRcdGxvY2FsaXplKCdjb21tYW5kIG5hbWUnLCBcIklEXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvbW1hbmQgdGl0bGUnLCBcIlRpdGxlXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2tleWJvYXJkIHNob3J0Y3V0cycsIFwiS2V5Ym9hcmQgU2hvcnRjdXRzXCIpLFxuXHRcdFx0bG9jYWxpemUoJ21lbnVDb250ZXh0cycsIFwiTWVudSBDb250ZXh0c1wiKVxuXHRcdF07XG5cblx0XHRjb25zdCByb3dzOiBJUm93RGF0YVtdW10gPSBjb21tYW5kcy5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpXG5cdFx0XHQubWFwKGNvbW1hbmQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGBcXGAke2NvbW1hbmQuaWR9XFxgYCksXG5cdFx0XHRcdFx0dHlwZW9mIGNvbW1hbmQudGl0bGUgPT09ICdzdHJpbmcnID8gY29tbWFuZC50aXRsZSA6IGNvbW1hbmQudGl0bGUudmFsdWUsXG5cdFx0XHRcdFx0Y29tbWFuZC5rZXliaW5kaW5ncyxcblx0XHRcdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihgJHtjb21tYW5kLm1lbnVzLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSkubWFwKG1lbnUgPT4gYFxcYCR7bWVudX1cXGBgKS5qb2luKCcmbmJzcDsnKX1gKSxcblx0XHRcdFx0XTtcblx0XHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0cm93c1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVLZXliaW5kaW5nKHJhd0tleUJpbmRpbmc6IElLZXlCaW5kaW5nKTogUmVzb2x2ZWRLZXliaW5kaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQga2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRzd2l0Y2ggKHBsYXRmb3JtKSB7XG5cdFx0XHRjYXNlICd3aW4zMic6IGtleSA9IHJhd0tleUJpbmRpbmcud2luOyBicmVhaztcblx0XHRcdGNhc2UgJ2xpbnV4Jzoga2V5ID0gcmF3S2V5QmluZGluZy5saW51eDsgYnJlYWs7XG5cdFx0XHRjYXNlICdkYXJ3aW4nOiBrZXkgPSByYXdLZXlCaW5kaW5nLm1hYzsgYnJlYWs7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLnJlc29sdmVVc2VyQmluZGluZyhrZXkgPz8gcmF3S2V5QmluZGluZy5rZXkpWzBdO1xuXHR9XG5cbn1cblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbkZlYXR1cmVzRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogJ2NvbW1hbmRzJyxcblx0bGFiZWw6IGxvY2FsaXplKCdjb21tYW5kcycsIFwiQ29tbWFuZHNcIiksXG5cdGFjY2Vzczoge1xuXHRcdGNhblRvZ2dsZTogZmFsc2UsXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoQ29tbWFuZHNUYWJsZVJlbmRlcmVyKSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQjtBQUNwQyxZQUFZLGVBQWU7QUFFM0IsU0FBeUQsMEJBQTBCO0FBQ25GLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsUUFBUSxvQkFBNkM7QUFFOUQsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGFBQWE7QUFDdEIsU0FBUyw0QkFBNEI7QUFFckMsU0FBMEcsY0FBYyxtQ0FBbUM7QUFFM0osU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUywwQkFBMEI7QUFXbkMsTUFBTSxXQUF1QjtBQUFBLEVBQzVCO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyx3QkFBd0IscUJBQXFCO0FBQUEsSUFDbkUsa0JBQWtCO0FBQUEsRUFDbkI7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyxrQkFBa0IsNEJBQTRCO0FBQUEsSUFDcEUsa0JBQWtCO0FBQUEsRUFDbkI7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyxxQkFBcUIsdUJBQXVCO0FBQUEsRUFDbkU7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyxnQ0FBZ0MsMkNBQTJDO0FBQUEsRUFDbEc7QUFBQSxFQUNBO0FB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QUFJO0FBQ25CLGlCQUFTLEtBQUssT0FBTztBQUFBLE1BQ3RCO0FBQUEsSUFDRCxDQUFDO0FBRUQsUUFBSSxDQUFDLFNBQVMsUUFBUTtBQUNyQixhQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxFQUFFLEdBQUcsU0FBUyxNQUFNO0FBQUEsTUFBRSxFQUFFO0FBQUEsSUFDOUQ7QUFFQSxVQUFNLFVBQVU7QUFBQSxNQUNmLFNBQVMsZ0JBQWdCLElBQUk7QUFBQSxNQUM3QixTQUFTLGlCQUFpQixPQUFPO0FBQUEsTUFDakMsU0FBUyxzQkFBc0Isb0JBQW9CO0FBQUEsTUFDbkQsU0FBUyxnQkFBZ0IsZUFBZTtBQUFBLElBQ3pDO0FBRUEsVUFBTSxPQUFxQixTQUFTLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxHQUFHLGNBQWMsRUFBRSxFQUFFLENBQUMsRUFDekUsSUFBSSxhQUFXO0FBQ2YsYUFBTztBQUFBLFFBQ04sSUFBSSxlQUFlLEVBQUUsZUFBZSxLQUFLLFFBQVEsRUFBRSxJQUFJO0FBQUEsUUFDdkQsT0FBTyxRQUFRLFVBQVUsV0FBVyxRQUFRLFFBQVEsUUFBUSxNQUFNO0FBQUEsUUFDbEUsUUFBUTtBQUFBLFFBQ1IsSUFBSSxlQUFlLEVBQUUsZUFBZSxHQUFHLFFBQVEsTUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUMsRUFBRSxJQUFJLFVBQVEsS0FBSyxJQUFJLElBQUksRUFBRSxLQUFLLFFBQVEsQ0FBQyxFQUFFO0FBQUEsTUFDcEk7QUFBQSxJQUNELENBQUM7QUFFRixXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsUUFDTDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxTQUFTLE1BQU07QUFBQSxNQUFFO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsZUFBNEQ7QUFDckYsUUFBSTtBQUVKLFlBQVEsVUFBVTtBQUFBLE1BQ2pCLEtBQUs7QUFBUyxjQUFNLGNBQWM7QUFBSztBQUFBLE1BQ3ZDLEtBQUs7QUFBUyxjQUFNLGNBQWM7QUFBTztBQUFBLE1BQ3pDLEtBQUs7QUFBVSxjQUFNLGNBQWM7QUFBSztBQUFBLElBQ3pDO0FBRUEsV0FBTyxLQUFLLG1CQUFtQixtQkFBbUIsT0FBTyxjQUFjLEdBQUcsRUFBRSxDQUFDO0FBQUEsRUFDOUU7QUFFRDtBQTlITSx3QkFBTjtBQUFBLEVBS0c7QUFBQSxHQUxHO0FBZ0lOLFNBQVMsR0FBK0IsNEJBQTRCLHlCQUF5QixFQUFFLHlCQUF5QjtBQUFBLEVBQ3ZILElBQUk7QUFBQSxFQUNKLE9BQU8sU0FBUyxZQUFZLFVBQVU7QUFBQSxFQUN0QyxRQUFRO0FBQUEsSUFDUCxXQUFXO0FBQUEsRUFDWjtBQUFBLEVBQ0EsVUFBVSxJQUFJLGVBQWUscUJBQXFCO0FBQ25ELENBQUM7IiwKICAibmFtZXMiOiBbInNjaGVtYSIsICJzdWJtZW51Il0KfQo=
