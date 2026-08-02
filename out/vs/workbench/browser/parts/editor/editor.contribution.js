import { Registry } from "../../../../platform/registry/common/platform.js";
import { localize, localize2 } from "../../../../nls.js";
import { EditorPaneDescriptor } from "../../editor.js";
import { EditorExtensions } from "../../../common/editor.js";
import {
  TextCompareEditorActiveContext,
  ActiveEditorPinnedContext,
  EditorGroupEditorsCountContext,
  ActiveEditorStickyContext,
  ActiveEditorAvailableEditorIdsContext,
  EditorPartMultipleEditorGroupsContext,
  ActiveEditorDirtyContext,
  ActiveEditorGroupLockedContext,
  ActiveEditorCanSplitInGroupContext,
  SideBySideEditorActiveContext,
  EditorTabsVisibleContext,
  ActiveEditorLastInGroupContext,
  EditorPartMaximizedEditorGroupContext,
  MultipleEditorGroupsContext,
  InEditorZenModeContext,
  IsAuxiliaryWindowContext,
  ActiveCompareEditorCanSwapContext,
  MultipleEditorsSelectedInGroupContext,
  SplitEditorsVertically,
  IsSessionsWindowContext,
  ActiveCustomEditorDiffCanToggleLayoutContext,
  ActiveCustomEditorTextDiffContext,
  EditorPartModalContext
} from "../../../common/contextkeys.js";
import { SideBySideEditorInput, SideBySideEditorInputSerializer } from "../../../common/editor/sideBySideEditorInput.js";
import { TextResourceEditor } from "./textResourceEditor.js";
import { SideBySideEditor } from "./sideBySideEditor.js";
import { DiffEditorInput, DiffEditorInputSerializer } from "../../../common/editor/diffEditorInput.js";
import { UntitledTextEditorInput } from "../../../services/untitled/common/untitledTextEditorInput.js";
import { TextResourceEditorInput } from "../../../common/editor/textResourceEditorInput.js";
import { TextDiffEditor } from "./textDiffEditor.js";
import { BinaryResourceDiffEditor } from "./binaryDiffEditor.js";
import { ChangeEncodingAction, ChangeEOLAction, ChangeLanguageAction, EditorStatusContribution } from "./editorStatus.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { MenuRegistry, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import {
  CloseEditorsInOtherGroupsAction,
  CloseAllEditorsAction,
  MoveGroupLeftAction,
  MoveGroupRightAction,
  SplitEditorAction,
  JoinTwoGroupsAction,
  RevertAndCloseEditorAction,
  NavigateBetweenGroupsAction,
  FocusActiveGroupAction,
  FocusFirstGroupAction,
  ResetGroupSizesAction,
  MinimizeOtherGroupsAction,
  FocusPreviousGroup,
  FocusNextGroup,
  CloseLeftEditorsInGroupAction,
  OpenNextEditor,
  OpenPreviousEditor,
  NavigateBackwardsAction,
  NavigateForwardAction,
  NavigatePreviousAction,
  ReopenClosedEditorAction,
  QuickAccessPreviousRecentlyUsedEditorInGroupAction,
  QuickAccessPreviousEditorFromHistoryAction,
  ShowAllEditorsByAppearanceAction,
  ClearEditorHistoryAction,
  MoveEditorRightInGroupAction,
  OpenNextEditorInGroup,
  OpenPreviousEditorInGroup,
  OpenNextRecentlyUsedEditorAction,
  OpenPreviousRecentlyUsedEditorAction,
  MoveEditorToPreviousGroupAction,
  MoveEditorToNextGroupAction,
  MoveEditorToFirstGroupAction,
  MoveEditorLeftInGroupAction,
  MoveEditorToStartAction,
  MoveEditorToEndAction,
  ClearRecentFilesAction,
  OpenLastEditorInGroup,
  ShowEditorsInActiveGroupByMostRecentlyUsedAction,
  MoveEditorToLastGroupAction,
  OpenFirstEditorInGroup,
  MoveGroupUpAction,
  MoveGroupDownAction,
  FocusLastGroupAction,
  SplitEditorLeftAction,
  SplitEditorRightAction,
  SplitEditorUpAction,
  SplitEditorDownAction,
  MoveEditorToLeftGroupAction,
  MoveEditorToRightGroupAction,
  MoveEditorToAboveGroupAction,
  MoveEditorToBelowGroupAction,
  CloseAllEditorGroupsAction,
  JoinAllGroupsAction,
  FocusLeftGroup,
  FocusAboveGroup,
  FocusRightGroup,
  FocusBelowGroup,
  EditorLayoutSingleAction,
  EditorLayoutTwoColumnsAction,
  EditorLayoutThreeColumnsAction,
  EditorLayoutTwoByTwoGridAction,
  EditorLayoutTwoRowsAction,
  EditorLayoutThreeRowsAction,
  EditorLayoutTwoColumnsBottomAction,
  EditorLayoutTwoRowsRightAction,
  NewEditorGroupLeftAction,
  NewEditorGroupRightAction,
  NewEditorGroupAboveAction,
  NewEditorGroupBelowAction,
  SplitEditorOrthogonalAction,
  CloseEditorInAllGroupsAction,
  NavigateToLastEditLocationAction,
  ToggleGroupSizesAction,
  ShowAllEditorsByMostRecentlyUsedAction,
  QuickAccessPreviousRecentlyUsedEditorAction,
  OpenPreviousRecentlyUsedEditorInGroupAction,
  OpenNextRecentlyUsedEditorInGroupAction,
  QuickAccessLeastRecentlyUsedEditorAction,
  QuickAccessLeastRecentlyUsedEditorInGroupAction,
  ReOpenInTextEditorAction,
  DuplicateGroupDownAction,
  DuplicateGroupLeftAction,
  DuplicateGroupRightAction,
  DuplicateGroupUpAction,
  ToggleEditorTypeAction,
  SplitEditorToAboveGroupAction,
  SplitEditorToBelowGroupAction,
  SplitEditorToFirstGroupAction,
  SplitEditorToLastGroupAction,
  SplitEditorToLeftGroupAction,
  SplitEditorToNextGroupAction,
  SplitEditorToPreviousGroupAction,
  SplitEditorToRightGroupAction,
  NavigateForwardInEditsAction,
  NavigateBackwardsInEditsAction,
  NavigateForwardInNavigationsAction,
  NavigateBackwardsInNavigationsAction,
  NavigatePreviousInNavigationsAction,
  NavigatePreviousInEditsAction,
  NavigateToLastNavigationLocationAction,
  MaximizeGroupHideSidebarAction,
  MoveEditorToNewWindowAction,
  CopyEditorToNewindowAction,
  RestoreEditorsToMainWindowAction,
  ToggleMaximizeEditorGroupAction,
  MinimizeOtherGroupsHideSidebarAction,
  CopyEditorGroupToNewWindowAction,
  MoveEditorGroupToNewWindowAction,
  NewEmptyEditorWindowAction,
  ClearEditorHistoryWithoutConfirmAction
} from "./editorActions.js";
import {
  CLOSE_EDITORS_AND_GROUP_COMMAND_ID,
  CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
  CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID,
  CLOSE_EDITOR_COMMAND_ID,
  CLOSE_EDITOR_GROUP_COMMAND_ID,
  CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
  CLOSE_PINNED_EDITOR_COMMAND_ID,
  CLOSE_SAVED_EDITORS_COMMAND_ID,
  KEEP_EDITOR_COMMAND_ID,
  PIN_EDITOR_COMMAND_ID,
  SHOW_EDITORS_IN_GROUP,
  SPLIT_EDITOR_DOWN,
  SPLIT_EDITOR_LEFT,
  SPLIT_EDITOR_RIGHT,
  SPLIT_EDITOR_UP,
  TOGGLE_KEEP_EDITORS_COMMAND_ID,
  UNPIN_EDITOR_COMMAND_ID,
  setup as registerEditorCommands,
  REOPEN_WITH_COMMAND_ID,
  TOGGLE_LOCK_GROUP_COMMAND_ID,
  UNLOCK_GROUP_COMMAND_ID,
  SPLIT_EDITOR_IN_GROUP,
  JOIN_EDITOR_IN_GROUP,
  FOCUS_FIRST_SIDE_EDITOR,
  FOCUS_SECOND_SIDE_EDITOR,
  TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT,
  LOCK_GROUP_COMMAND_ID,
  SPLIT_EDITOR,
  TOGGLE_MAXIMIZE_EDITOR_GROUP,
  MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
  COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
  MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID,
  COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID,
  NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID,
  MOVE_EDITOR_INTO_RIGHT_GROUP,
  MOVE_EDITOR_INTO_LEFT_GROUP,
  MOVE_EDITOR_INTO_ABOVE_GROUP,
  MOVE_EDITOR_INTO_BELOW_GROUP
} from "./editorCommands.js";
import { GOTO_NEXT_CHANGE, GOTO_PREVIOUS_CHANGE, TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE, TOGGLE_DIFF_SIDE_BY_SIDE, DIFF_SWAP_SIDES } from "./diffEditorCommands.js";
import { inQuickPickContext, getQuickNavigateHandler } from "../../quickaccess.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { EditorAutoSave } from "./editorAutoSave.js";
import { Extensions as QuickAccessExtensions } from "../../../../platform/quickinput/common/quickAccess.js";
import { ActiveGroupEditorsByMostRecentlyUsedQuickAccess, AllEditorsByAppearanceQuickAccess, AllEditorsByMostRecentlyUsedQuickAccess } from "./editorQuickAccess.js";
import { FileAccess } from "../../../../base/common/network.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { UntitledTextEditorInputSerializer, UntitledTextEditorWorkingCopyEditorHandler } from "../../../services/untitled/common/untitledTextEditorHandler.js";
import { DynamicEditorConfigurations } from "./editorConfiguration.js";
import { ConfigureEditorAction, ConfigureEditorTabsAction, EditorActionsDefaultAction, EditorActionsTitleBarAction, HideEditorActionsAction, HideEditorTabsAction, ShowMultipleEditorTabsAction, ShowSingleEditorTabAction, ZenHideEditorTabsAction, ZenShowMultipleEditorTabsAction, ZenShowSingleEditorTabAction } from "../../actions/layoutActions.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { getFontSnippets } from "../../../../base/browser/fonts.js";
import { registerEditorFontConfigurations } from "../../../../editor/common/config/editorConfigurationSchema.js";
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    TextResourceEditor,
    TextResourceEditor.ID,
    localize("textEditor", "Text Editor")
  ),
  [
    new SyncDescriptor(UntitledTextEditorInput),
    new SyncDescriptor(TextResourceEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    TextDiffEditor,
    TextDiffEditor.ID,
    localize("textDiffEditor", "Text Diff Editor")
  ),
  [
    new SyncDescriptor(DiffEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    BinaryResourceDiffEditor,
    BinaryResourceDiffEditor.ID,
    localize("binaryDiffEditor", "Binary Diff Editor")
  ),
  [
    new SyncDescriptor(DiffEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    SideBySideEditor,
    SideBySideEditor.ID,
    localize("sideBySideEditor", "Side by Side Editor")
  ),
  [
    new SyncDescriptor(SideBySideEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(UntitledTextEditorInput.ID, UntitledTextEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(SideBySideEditorInput.ID, SideBySideEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(DiffEditorInput.ID, DiffEditorInputSerializer);
registerWorkbenchContribution2(EditorAutoSave.ID, EditorAutoSave, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(EditorStatusContribution.ID, EditorStatusContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(UntitledTextEditorWorkingCopyEditorHandler.ID, UntitledTextEditorWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(DynamicEditorConfigurations.ID, DynamicEditorConfigurations, WorkbenchPhase.BlockRestore);
const quickAccessRegistry = Registry.as(QuickAccessExtensions.Quickaccess);
const editorPickerContextKey = "inEditorsPicker";
const editorPickerContext = ContextKeyExpr.and(inQuickPickContext, ContextKeyExpr.has(editorPickerContextKey));
quickAccessRegistry.registerQuickAccessProvider({
  ctor: ActiveGroupEditorsByMostRecentlyUsedQuickAccess,
  prefix: ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX,
  contextKey: editorPickerContextKey,
  placeholder: localize("editorQuickAccessPlaceholder", "Type the name of an editor to open it."),
  helpEntries: [{ description: localize("activeGroupEditorsByMostRecentlyUsedQuickAccess", "Show Editors in Active Group by Most Recently Used"), commandId: ShowEditorsInActiveGroupByMostRecentlyUsedAction.ID }]
});
quickAccessRegistry.registerQuickAccessProvider({
  ctor: AllEditorsByAppearanceQuickAccess,
  prefix: AllEditorsByAppearanceQuickAccess.PREFIX,
  contextKey: editorPickerContextKey,
  placeholder: localize("editorQuickAccessPlaceholder", "Type the name of an editor to open it."),
  helpEntries: [{ description: localize("allEditorsByAppearanceQuickAccess", "Show All Opened Editors By Appearance"), commandId: ShowAllEditorsByAppearanceAction.ID }]
});
quickAccessRegistry.registerQuickAccessProvider({
  ctor: AllEditorsByMostRecentlyUsedQuickAccess,
  prefix: AllEditorsByMostRecentlyUsedQuickAccess.PREFIX,
  contextKey: editorPickerContextKey,
  placeholder: localize("editorQuickAccessPlaceholder", "Type the name of an editor to open it."),
  helpEntries: [{ description: localize("allEditorsByMostRecentlyUsedQuickAccess", "Show All Opened Editors By Most Recently Used"), commandId: ShowAllEditorsByMostRecentlyUsedAction.ID }]
});
registerAction2(ChangeLanguageAction);
registerAction2(ChangeEOLAction);
registerAction2(ChangeEncodingAction);
registerAction2(NavigateForwardAction);
registerAction2(NavigateBackwardsAction);
registerAction2(OpenNextEditor);
registerAction2(OpenPreviousEditor);
registerAction2(OpenNextEditorInGroup);
registerAction2(OpenPreviousEditorInGroup);
registerAction2(OpenFirstEditorInGroup);
registerAction2(OpenLastEditorInGroup);
registerAction2(OpenNextRecentlyUsedEditorAction);
registerAction2(OpenPreviousRecentlyUsedEditorAction);
registerAction2(OpenNextRecentlyUsedEditorInGroupAction);
registerAction2(OpenPreviousRecentlyUsedEditorInGroupAction);
registerAction2(ReopenClosedEditorAction);
registerAction2(ClearRecentFilesAction);
registerAction2(ShowAllEditorsByAppearanceAction);
registerAction2(ShowAllEditorsByMostRecentlyUsedAction);
registerAction2(ShowEditorsInActiveGroupByMostRecentlyUsedAction);
registerAction2(CloseAllEditorsAction);
registerAction2(CloseAllEditorGroupsAction);
registerAction2(CloseLeftEditorsInGroupAction);
registerAction2(CloseEditorsInOtherGroupsAction);
registerAction2(CloseEditorInAllGroupsAction);
registerAction2(RevertAndCloseEditorAction);
registerAction2(SplitEditorAction);
registerAction2(SplitEditorOrthogonalAction);
registerAction2(SplitEditorLeftAction);
registerAction2(SplitEditorRightAction);
registerAction2(SplitEditorUpAction);
registerAction2(SplitEditorDownAction);
registerAction2(JoinTwoGroupsAction);
registerAction2(JoinAllGroupsAction);
registerAction2(NavigateBetweenGroupsAction);
registerAction2(ResetGroupSizesAction);
registerAction2(ToggleGroupSizesAction);
registerAction2(MaximizeGroupHideSidebarAction);
registerAction2(ToggleMaximizeEditorGroupAction);
registerAction2(MinimizeOtherGroupsAction);
registerAction2(MinimizeOtherGroupsHideSidebarAction);
registerAction2(MoveEditorLeftInGroupAction);
registerAction2(MoveEditorRightInGroupAction);
registerAction2(MoveEditorToStartAction);
registerAction2(MoveEditorToEndAction);
registerAction2(MoveGroupLeftAction);
registerAction2(MoveGroupRightAction);
registerAction2(MoveGroupUpAction);
registerAction2(MoveGroupDownAction);
registerAction2(DuplicateGroupLeftAction);
registerAction2(DuplicateGroupRightAction);
registerAction2(DuplicateGroupUpAction);
registerAction2(DuplicateGroupDownAction);
registerAction2(MoveEditorToPreviousGroupAction);
registerAction2(MoveEditorToNextGroupAction);
registerAction2(MoveEditorToFirstGroupAction);
registerAction2(MoveEditorToLastGroupAction);
registerAction2(MoveEditorToLeftGroupAction);
registerAction2(MoveEditorToRightGroupAction);
registerAction2(MoveEditorToAboveGroupAction);
registerAction2(MoveEditorToBelowGroupAction);
registerAction2(SplitEditorToPreviousGroupAction);
registerAction2(SplitEditorToNextGroupAction);
registerAction2(SplitEditorToFirstGroupAction);
registerAction2(SplitEditorToLastGroupAction);
registerAction2(SplitEditorToLeftGroupAction);
registerAction2(SplitEditorToRightGroupAction);
registerAction2(SplitEditorToAboveGroupAction);
registerAction2(SplitEditorToBelowGroupAction);
registerAction2(FocusActiveGroupAction);
registerAction2(FocusFirstGroupAction);
registerAction2(FocusLastGroupAction);
registerAction2(FocusPreviousGroup);
registerAction2(FocusNextGroup);
registerAction2(FocusLeftGroup);
registerAction2(FocusRightGroup);
registerAction2(FocusAboveGroup);
registerAction2(FocusBelowGroup);
registerAction2(NewEditorGroupLeftAction);
registerAction2(NewEditorGroupRightAction);
registerAction2(NewEditorGroupAboveAction);
registerAction2(NewEditorGroupBelowAction);
registerAction2(NavigatePreviousAction);
registerAction2(NavigateForwardInEditsAction);
registerAction2(NavigateBackwardsInEditsAction);
registerAction2(NavigatePreviousInEditsAction);
registerAction2(NavigateToLastEditLocationAction);
registerAction2(NavigateForwardInNavigationsAction);
registerAction2(NavigateBackwardsInNavigationsAction);
registerAction2(NavigatePreviousInNavigationsAction);
registerAction2(NavigateToLastNavigationLocationAction);
registerAction2(ClearEditorHistoryAction);
registerAction2(ClearEditorHistoryWithoutConfirmAction);
registerAction2(EditorLayoutSingleAction);
registerAction2(EditorLayoutTwoColumnsAction);
registerAction2(EditorLayoutThreeColumnsAction);
registerAction2(EditorLayoutTwoRowsAction);
registerAction2(EditorLayoutThreeRowsAction);
registerAction2(EditorLayoutTwoByTwoGridAction);
registerAction2(EditorLayoutTwoRowsRightAction);
registerAction2(EditorLayoutTwoColumnsBottomAction);
registerAction2(ToggleEditorTypeAction);
registerAction2(ReOpenInTextEditorAction);
registerAction2(QuickAccessPreviousRecentlyUsedEditorAction);
registerAction2(QuickAccessLeastRecentlyUsedEditorAction);
registerAction2(QuickAccessPreviousRecentlyUsedEditorInGroupAction);
registerAction2(QuickAccessLeastRecentlyUsedEditorInGroupAction);
registerAction2(QuickAccessPreviousEditorFromHistoryAction);
registerAction2(MoveEditorToNewWindowAction);
registerAction2(CopyEditorToNewindowAction);
registerAction2(MoveEditorGroupToNewWindowAction);
registerAction2(CopyEditorGroupToNewWindowAction);
registerAction2(RestoreEditorsToMainWindowAction);
registerAction2(NewEmptyEditorWindowAction);
const quickAccessNavigateNextInEditorPickerId = "workbench.action.quickOpenNavigateNextInEditorPicker";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: quickAccessNavigateNextInEditorPickerId,
  weight: KeybindingWeight.WorkbenchContrib + 50,
  handler: getQuickNavigateHandler(quickAccessNavigateNextInEditorPickerId, true),
  when: editorPickerContext,
  primary: KeyMod.CtrlCmd | KeyCode.Tab,
  mac: { primary: KeyMod.WinCtrl | KeyCode.Tab }
});
const quickAccessNavigatePreviousInEditorPickerId = "workbench.action.quickOpenNavigatePreviousInEditorPicker";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: quickAccessNavigatePreviousInEditorPickerId,
  weight: KeybindingWeight.WorkbenchContrib + 50,
  handler: getQuickNavigateHandler(quickAccessNavigatePreviousInEditorPickerId, false),
  when: editorPickerContext,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
  mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab }
});
registerEditorCommands();
if (isMacintosh) {
  MenuRegistry.appendMenuItem(MenuId.TouchBarContext, {
    command: { id: NavigateBackwardsAction.ID, title: NavigateBackwardsAction.LABEL, icon: { dark: FileAccess.asFileUri("vs/workbench/browser/parts/editor/media/back-tb.png") } },
    group: "navigation",
    order: 0
  });
  MenuRegistry.appendMenuItem(MenuId.TouchBarContext, {
    command: { id: NavigateForwardAction.ID, title: NavigateForwardAction.LABEL, icon: { dark: FileAccess.asFileUri("vs/workbench/browser/parts/editor/media/forward-tb.png") } },
    group: "navigation",
    order: 1
  });
}
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroup, { command: { id: LOCK_GROUP_COMMAND_ID, title: localize("lockGroupAction", "Lock Group"), icon: Codicon.unlock }, group: "navigation", order: 10, when: ContextKeyExpr.and(IsAuxiliaryWindowContext, ActiveEditorGroupLockedContext.toNegated()) });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroup, { command: { id: UNLOCK_GROUP_COMMAND_ID, title: localize("unlockGroupAction", "Unlock Group"), icon: Codicon.lock, toggled: ContextKeyExpr.true() }, group: "navigation", order: 10, when: ActiveEditorGroupLockedContext });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroup, { command: { id: CLOSE_EDITOR_GROUP_COMMAND_ID, title: localize("closeGroupAction", "Close Group"), icon: Codicon.close }, group: "navigation", order: 20, when: ContextKeyExpr.or(IsAuxiliaryWindowContext, EditorPartMultipleEditorGroupsContext) });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_UP, title: localize("splitUp", "Split Up") }, group: "2_split", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_DOWN, title: localize("splitDown", "Split Down") }, group: "2_split", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_LEFT, title: localize("splitLeft", "Split Left") }, group: "2_split", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_RIGHT, title: localize("splitRight", "Split Right") }, group: "2_split", order: 40 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID, title: localize("newWindow", "New Window") }, group: "3_window", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, {
  command: { id: TOGGLE_LOCK_GROUP_COMMAND_ID, title: localize("toggleLockGroup", "Lock Group"), toggled: ActiveEditorGroupLockedContext },
  group: "4_lock",
  order: 10,
  when: IsAuxiliaryWindowContext.toNegated()
  /* already a primary action for aux windows */
});
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: CLOSE_EDITOR_GROUP_COMMAND_ID, title: localize("close", "Close") }, group: "5_close", order: 10, when: MultipleEditorGroupsContext });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: SPLIT_EDITOR_UP, title: localize("splitUp", "Split Up") }, group: "2_split", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: SPLIT_EDITOR_DOWN, title: localize("splitDown", "Split Down") }, group: "2_split", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: SPLIT_EDITOR_LEFT, title: localize("splitLeft", "Split Left") }, group: "2_split", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: SPLIT_EDITOR_RIGHT, title: localize("splitRight", "Split Right") }, group: "2_split", order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, title: localize("moveEditorGroupToNewWindow", "Move into New Window") }, group: "3_window", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, title: localize("copyEditorGroupToNewWindow", "Copy into New Window") }, group: "3_window", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { submenu: MenuId.EditorTabsBarShowTabsSubmenu, title: localize("tabBar", "Tab Bar"), group: "4_config", order: 10, when: InEditorZenModeContext.negate() });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsSubmenu, { command: { id: ShowMultipleEditorTabsAction.ID, title: localize("multipleTabs", "Multiple Tabs"), toggled: ContextKeyExpr.equals("config.workbench.editor.showTabs", "multiple") }, group: "1_config", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsSubmenu, { command: { id: ShowSingleEditorTabAction.ID, title: localize("singleTab", "Single Tab"), toggled: ContextKeyExpr.equals("config.workbench.editor.showTabs", "single") }, group: "1_config", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsSubmenu, { command: { id: HideEditorTabsAction.ID, title: localize("hideTabs", "Hidden"), toggled: ContextKeyExpr.equals("config.workbench.editor.showTabs", "none") }, group: "1_config", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { submenu: MenuId.EditorTabsBarShowTabsZenModeSubmenu, title: localize("tabBar", "Tab Bar"), group: "4_config", order: 10, when: InEditorZenModeContext });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsZenModeSubmenu, { command: { id: ZenShowMultipleEditorTabsAction.ID, title: localize("multipleTabs", "Multiple Tabs"), toggled: ContextKeyExpr.equals("config.zenMode.showTabs", "multiple") }, group: "1_config", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsZenModeSubmenu, { command: { id: ZenShowSingleEditorTabAction.ID, title: localize("singleTab", "Single Tab"), toggled: ContextKeyExpr.equals("config.zenMode.showTabs", "single") }, group: "1_config", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsZenModeSubmenu, { command: { id: ZenHideEditorTabsAction.ID, title: localize("hideTabs", "Hidden"), toggled: ContextKeyExpr.equals("config.zenMode.showTabs", "none") }, group: "1_config", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { submenu: MenuId.EditorActionsPositionSubmenu, title: localize("editorActionsPosition", "Editor Actions Position"), group: "4_config", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorActionsPositionSubmenu, { command: { id: EditorActionsDefaultAction.ID, title: localize("tabBar", "Tab Bar"), toggled: ContextKeyExpr.equals("config.workbench.editor.editorActionsLocation", "default") }, group: "1_config", order: 10, when: ContextKeyExpr.equals("config.workbench.editor.showTabs", "none").negate() });
MenuRegistry.appendMenuItem(MenuId.EditorActionsPositionSubmenu, { command: { id: EditorActionsTitleBarAction.ID, title: localize("titleBar", "Title Bar"), toggled: ContextKeyExpr.or(ContextKeyExpr.equals("config.workbench.editor.editorActionsLocation", "titleBar"), ContextKeyExpr.and(ContextKeyExpr.equals("config.workbench.editor.showTabs", "none"), ContextKeyExpr.equals("config.workbench.editor.editorActionsLocation", "default"))) }, group: "1_config", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorActionsPositionSubmenu, { command: { id: HideEditorActionsAction.ID, title: localize("hidden", "Hidden"), toggled: ContextKeyExpr.equals("config.workbench.editor.editorActionsLocation", "hidden") }, group: "1_config", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: ConfigureEditorTabsAction.ID, title: localize("configureTabs", "Configure Tabs") }, group: "9_configure", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_EDITOR_COMMAND_ID, title: localize("close", "Close") }, group: "1_close", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, title: localize("closeOthers", "Close Others"), precondition: EditorGroupEditorsCountContext.notEqualsTo("1") }, group: "1_close", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, title: localize("closeRight", "Close to the Right"), precondition: ContextKeyExpr.and(ActiveEditorLastInGroupContext.toNegated(), MultipleEditorsSelectedInGroupContext.negate()) }, group: "1_close", order: 30, when: EditorTabsVisibleContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_SAVED_EDITORS_COMMAND_ID, title: localize("closeAllSaved", "Close Saved") }, group: "1_close", order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: localize("closeAll", "Close All") }, group: "1_close", order: 50 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: REOPEN_WITH_COMMAND_ID, title: localize("reopenWith", "Reopen Editor With...") }, group: "1_open", order: 10, when: ActiveEditorAvailableEditorIdsContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: KEEP_EDITOR_COMMAND_ID, title: localize("keepOpen", "Keep Open"), precondition: ActiveEditorPinnedContext.toNegated() }, group: "3_preview", order: 10, when: ContextKeyExpr.has("config.workbench.editor.enablePreview") });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: PIN_EDITOR_COMMAND_ID, title: localize("pin", "Pin") }, group: "3_preview", order: 20, when: ActiveEditorStickyContext.toNegated() });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: UNPIN_EDITOR_COMMAND_ID, title: localize("unpin", "Unpin") }, group: "3_preview", order: 20, when: ActiveEditorStickyContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: SPLIT_EDITOR, title: localize("splitRight", "Split Right") }, group: "5_split", order: 10, when: SplitEditorsVertically.negate() });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: SPLIT_EDITOR, title: localize("splitDown", "Split Down") }, group: "5_split", order: 10, when: SplitEditorsVertically });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { submenu: MenuId.EditorSplitMoveSubmenu, title: localize("splitAndMoveEditor", "Split & Move"), group: "5_split", order: 15 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, title: localize("moveToNewWindow", "Move into New Window") }, group: "7_new_window", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, title: localize("copyToNewWindow", "Copy into New Window") }, group: "7_new_window", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { submenu: MenuId.EditorTitleContextShare, title: localize("share", "Share"), group: "11_share", order: -1, when: MultipleEditorsSelectedInGroupContext.negate() });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_UP, title: localize("splitUp", "Split Up") }, group: "1_split", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_DOWN, title: localize("splitDown", "Split Down") }, group: "1_split", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_LEFT, title: localize("splitLeft", "Split Left") }, group: "1_split", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_RIGHT, title: localize("splitRight", "Split Right") }, group: "1_split", order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: MOVE_EDITOR_INTO_ABOVE_GROUP, title: localize("moveAbove", "Move Above") }, group: "2_move", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: MOVE_EDITOR_INTO_BELOW_GROUP, title: localize("moveBelow", "Move Below") }, group: "2_move", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: MOVE_EDITOR_INTO_LEFT_GROUP, title: localize("moveLeft", "Move Left") }, group: "2_move", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: MOVE_EDITOR_INTO_RIGHT_GROUP, title: localize("moveRight", "Move Right") }, group: "2_move", order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_IN_GROUP, title: localize("splitInGroup", "Split in Group"), precondition: MultipleEditorsSelectedInGroupContext.negate() }, group: "3_split_in_group", order: 10, when: ActiveEditorCanSplitInGroupContext });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: JOIN_EDITOR_IN_GROUP, title: localize("joinInGroup", "Join in Group"), precondition: MultipleEditorsSelectedInGroupContext.negate() }, group: "3_split_in_group", order: 10, when: SideBySideEditorActiveContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_DIFF_SIDE_BY_SIDE, title: localize("inlineView", "Inline View"), toggled: ContextKeyExpr.equals("config.diffEditor.renderSideBySide", false) }, group: "1_diff", order: 10, when: ContextKeyExpr.or(ContextKeyExpr.has("isInDiffEditor"), ActiveCustomEditorDiffCanToggleLayoutContext) });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: { id: SHOW_EDITORS_IN_GROUP, title: localize("showOpenedEditors", "Show Opened Editors") },
  group: "3_open",
  order: 10,
  when: EditorPartModalContext.toNegated()
  /* not applicable to modal editor */
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: { id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: localize("closeAll", "Close All") },
  group: "5_close",
  order: 10,
  when: EditorPartModalContext.toNegated()
  /* not applicable to modal editor */
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: { id: CLOSE_SAVED_EDITORS_COMMAND_ID, title: localize("closeAllSaved", "Close Saved") },
  group: "5_close",
  order: 20,
  when: EditorPartModalContext.toNegated()
  /* not applicable to modal editor */
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: { id: TOGGLE_KEEP_EDITORS_COMMAND_ID, title: localize("togglePreviewMode", "Enable Preview Editors"), toggled: ContextKeyExpr.has("config.workbench.editor.enablePreview") },
  group: "7_settings",
  order: 10,
  when: EditorPartModalContext.toNegated()
  /* not applicable to modal editor */
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_MAXIMIZE_EDITOR_GROUP, title: localize("maximizeGroup", "Maximize Group") }, group: "8_group_operations", order: 5, when: ContextKeyExpr.and(EditorPartMaximizedEditorGroupContext.negate(), EditorPartMultipleEditorGroupsContext) });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_MAXIMIZE_EDITOR_GROUP, title: localize("unmaximizeGroup", "Unmaximize Group") }, group: "8_group_operations", order: 5, when: EditorPartMaximizedEditorGroupContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: { id: TOGGLE_LOCK_GROUP_COMMAND_ID, title: localize("lockGroup", "Lock Group"), toggled: ActiveEditorGroupLockedContext },
  group: "8_group_operations",
  order: 10,
  when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), EditorPartModalContext.toNegated())
  /* already a primary action for aux windows, not applicable to modal editor */
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: { id: ConfigureEditorAction.ID, title: localize("configureEditors", "Configure Editors") },
  group: "9_configure",
  order: 10,
  when: EditorPartModalContext.toNegated()
  /* not applicable to modal editor */
});
function appendEditorToolItem(primary, when, order, alternative, precondition, enableInCompactMode, enableInModalMode) {
  const item = {
    command: {
      id: primary.id,
      title: primary.title,
      icon: primary.icon,
      toggled: primary.toggled,
      precondition
    },
    group: "navigation",
    when,
    order
  };
  if (alternative) {
    item.alt = {
      id: alternative.id,
      title: alternative.title,
      icon: alternative.icon
    };
  }
  MenuRegistry.appendMenuItem(MenuId.EditorTitle, item);
  if (enableInCompactMode) {
    MenuRegistry.appendMenuItem(MenuId.CompactWindowEditorTitle, item);
  }
  if (enableInModalMode) {
    MenuRegistry.appendMenuItem(MenuId.ModalEditorEditorTitle, item);
  }
}
const SPLIT_ORDER = 1e5;
const CLOSE_ORDER = 1e6;
appendEditorToolItem(
  {
    id: SPLIT_EDITOR,
    title: localize("splitEditorRight", "Split Editor Right"),
    icon: Codicon.splitHorizontal
  },
  ContextKeyExpr.and(SplitEditorsVertically.negate(), IsSessionsWindowContext.toNegated()),
  SPLIT_ORDER,
  {
    id: SPLIT_EDITOR_DOWN,
    title: localize("splitEditorDown", "Split Editor Down"),
    icon: Codicon.splitVertical
  }
);
appendEditorToolItem(
  {
    id: SPLIT_EDITOR,
    title: localize("splitEditorDown", "Split Editor Down"),
    icon: Codicon.splitVertical
  },
  ContextKeyExpr.and(SplitEditorsVertically, IsSessionsWindowContext.toNegated()),
  SPLIT_ORDER,
  {
    id: SPLIT_EDITOR_RIGHT,
    title: localize("splitEditorRight", "Split Editor Right"),
    icon: Codicon.splitHorizontal
  }
);
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: {
    id: SPLIT_EDITOR,
    title: localize("splitEditorRight", "Split Editor Right"),
    icon: Codicon.splitHorizontal
  },
  group: "4_split",
  order: 10,
  when: ContextKeyExpr.and(IsSessionsWindowContext, SplitEditorsVertically.negate())
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: {
    id: SPLIT_EDITOR,
    title: localize("splitEditorDown", "Split Editor Down"),
    icon: Codicon.splitVertical
  },
  group: "4_split",
  order: 10,
  when: ContextKeyExpr.and(IsSessionsWindowContext, SplitEditorsVertically)
});
appendEditorToolItem(
  {
    id: TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT,
    title: localize("toggleSplitEditorInGroupLayout", "Toggle Layout"),
    icon: Codicon.editorLayout
  },
  SideBySideEditorActiveContext,
  SPLIT_ORDER - 1
  // left to split actions
);
appendEditorToolItem(
  {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: localize("close", "Close"),
    icon: Codicon.close
  },
  ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext.toNegated(), ActiveEditorStickyContext.toNegated()),
  CLOSE_ORDER,
  {
    id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
    title: localize("closeAll", "Close All"),
    icon: Codicon.closeAll
  }
);
appendEditorToolItem(
  {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: localize("close", "Close"),
    icon: Codicon.closeDirty
  },
  ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext, ActiveEditorStickyContext.toNegated()),
  CLOSE_ORDER,
  {
    id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
    title: localize("closeAll", "Close All"),
    icon: Codicon.closeAll
  }
);
appendEditorToolItem(
  {
    id: UNPIN_EDITOR_COMMAND_ID,
    title: localize("unpin", "Unpin"),
    icon: Codicon.pinned
  },
  ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext.toNegated(), ActiveEditorStickyContext),
  CLOSE_ORDER,
  {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: localize("close", "Close"),
    icon: Codicon.close
  }
);
appendEditorToolItem(
  {
    id: UNPIN_EDITOR_COMMAND_ID,
    title: localize("unpin", "Unpin"),
    icon: Codicon.pinnedDirty
  },
  ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext, ActiveEditorStickyContext),
  CLOSE_ORDER,
  {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: localize("close", "Close"),
    icon: Codicon.close
  }
);
appendEditorToolItem(
  {
    id: LOCK_GROUP_COMMAND_ID,
    title: localize("lockEditorGroup", "Lock Group"),
    icon: Codicon.unlock
  },
  ContextKeyExpr.and(IsAuxiliaryWindowContext, ActiveEditorGroupLockedContext.toNegated()),
  CLOSE_ORDER - 1
  // immediately to the left of close action
);
appendEditorToolItem(
  {
    id: UNLOCK_GROUP_COMMAND_ID,
    title: localize("unlockEditorGroup", "Unlock Group"),
    icon: Codicon.lock,
    toggled: ContextKeyExpr.true()
  },
  ActiveEditorGroupLockedContext,
  CLOSE_ORDER - 1
  // immediately to the left of close action
);
const previousChangeIcon = registerIcon("diff-editor-previous-change", Codicon.arrowUp, localize("previousChangeIcon", "Icon for the previous change action in the diff editor."));
appendEditorToolItem(
  {
    id: GOTO_PREVIOUS_CHANGE,
    title: localize("navigate.prev.label", "Previous Change"),
    icon: previousChangeIcon
  },
  TextCompareEditorActiveContext,
  10,
  void 0,
  EditorContextKeys.hasChanges,
  true,
  true
);
const nextChangeIcon = registerIcon("diff-editor-next-change", Codicon.arrowDown, localize("nextChangeIcon", "Icon for the next change action in the diff editor."));
appendEditorToolItem(
  {
    id: GOTO_NEXT_CHANGE,
    title: localize("navigate.next.label", "Next Change"),
    icon: nextChangeIcon
  },
  TextCompareEditorActiveContext,
  11,
  void 0,
  EditorContextKeys.hasChanges,
  true,
  true
);
appendEditorToolItem(
  {
    id: DIFF_SWAP_SIDES,
    title: localize("swapDiffSides", "Swap Left and Right Side"),
    icon: Codicon.arrowSwap
  },
  ContextKeyExpr.and(TextCompareEditorActiveContext, ActiveCompareEditorCanSwapContext),
  15,
  void 0,
  void 0
);
appendEditorToolItem(
  {
    id: ReOpenInTextEditorAction.ID,
    title: localize("reopenAsText", "Reopen as Text"),
    icon: Codicon.fileCode
  },
  ActiveCustomEditorTextDiffContext,
  16,
  void 0,
  void 0,
  void 0,
  true
);
const toggleWhitespace = registerIcon("diff-editor-toggle-whitespace", Codicon.whitespace, localize("toggleWhitespace", "Icon for the toggle whitespace action in the diff editor."));
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: {
    id: TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE,
    title: localize("ignoreTrimWhitespace.label", "Show Leading/Trailing Whitespace Differences"),
    icon: toggleWhitespace,
    precondition: TextCompareEditorActiveContext,
    toggled: ContextKeyExpr.equals("config.diffEditor.ignoreTrimWhitespace", false)
  },
  group: "navigation",
  when: TextCompareEditorActiveContext,
  order: 20
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: KEEP_EDITOR_COMMAND_ID, title: localize2("keepEditor", "Keep Editor"), category: Categories.View }, when: ContextKeyExpr.has("config.workbench.editor.enablePreview") });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: PIN_EDITOR_COMMAND_ID, title: localize2("pinEditor", "Pin Editor"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: UNPIN_EDITOR_COMMAND_ID, title: localize2("unpinEditor", "Unpin Editor"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITOR_COMMAND_ID, title: localize2("closeEditor", "Close Editor"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_PINNED_EDITOR_COMMAND_ID, title: localize2("closePinnedEditor", "Close Pinned Editor"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: localize2("closeEditorsInGroup", "Close All Editors in Group"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_SAVED_EDITORS_COMMAND_ID, title: localize2("closeSavedEditors", "Close Saved Editors in Group"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, title: localize2("closeOtherEditors", "Close Other Editors in Group"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, title: localize2("closeRightEditors", "Close Editors to the Right in Group"), category: Categories.View }, when: ActiveEditorLastInGroupContext.toNegated() });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITORS_AND_GROUP_COMMAND_ID, title: localize2("closeEditorGroup", "Close Editor Group"), category: Categories.View }, when: MultipleEditorGroupsContext });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: REOPEN_WITH_COMMAND_ID, title: localize2("reopenWith", "Reopen Editor With..."), category: Categories.View }, when: ActiveEditorAvailableEditorIdsContext });
MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
  group: "1_editor",
  command: {
    id: ReopenClosedEditorAction.ID,
    title: localize({ key: "miReopenClosedEditor", comment: ["&& denotes a mnemonic"] }, "&&Reopen Closed Editor"),
    precondition: ContextKeyExpr.has("canReopenClosedEditor")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
  group: "z_clear",
  command: {
    id: ClearRecentFilesAction.ID,
    title: localize({ key: "miClearRecentOpen", comment: ["&& denotes a mnemonic"] }, "&&Clear Recently Opened...")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  title: localize("miShare", "Share"),
  submenu: MenuId.MenubarShare,
  group: "45_share",
  order: 1,
  when: IsSessionsWindowContext.negate()
});
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
  group: "2_appearance",
  title: localize({ key: "miEditorLayout", comment: ["&& denotes a mnemonic"] }, "Editor &&Layout"),
  submenu: MenuId.MenubarLayoutMenu,
  order: 2,
  when: IsSessionsWindowContext.negate()
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "1_split",
  command: {
    id: SPLIT_EDITOR_UP,
    title: {
      ...localize2("miSplitEditorUpWithoutMnemonic", "Split Up"),
      mnemonicTitle: localize({ key: "miSplitEditorUp", comment: ["&& denotes a mnemonic"] }, "Split &&Up")
    }
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "1_split",
  command: {
    id: SPLIT_EDITOR_DOWN,
    title: {
      ...localize2("miSplitEditorDownWithoutMnemonic", "Split Down"),
      mnemonicTitle: localize({ key: "miSplitEditorDown", comment: ["&& denotes a mnemonic"] }, "Split &&Down")
    }
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "1_split",
  command: {
    id: SPLIT_EDITOR_LEFT,
    title: {
      ...localize2("miSplitEditorLeftWithoutMnemonic", "Split Left"),
      mnemonicTitle: localize({ key: "miSplitEditorLeft", comment: ["&& denotes a mnemonic"] }, "Split &&Left")
    }
  },
  order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "1_split",
  command: {
    id: SPLIT_EDITOR_RIGHT,
    title: {
      ...localize2("miSplitEditorRightWithoutMnemonic", "Split Right"),
      mnemonicTitle: localize({ key: "miSplitEditorRight", comment: ["&& denotes a mnemonic"] }, "Split &&Right")
    }
  },
  order: 4
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "2_split_in_group",
  command: {
    id: SPLIT_EDITOR_IN_GROUP,
    title: {
      ...localize2("miSplitEditorInGroupWithoutMnemonic", "Split in Group"),
      mnemonicTitle: localize({ key: "miSplitEditorInGroup", comment: ["&& denotes a mnemonic"] }, "Split in &&Group")
    }
  },
  when: ActiveEditorCanSplitInGroupContext,
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "2_split_in_group",
  command: {
    id: JOIN_EDITOR_IN_GROUP,
    title: {
      ...localize2("miJoinEditorInGroupWithoutMnemonic", "Join in Group"),
      mnemonicTitle: localize({ key: "miJoinEditorInGroup", comment: ["&& denotes a mnemonic"] }, "Join in &&Group")
    }
  },
  when: SideBySideEditorActiveContext,
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "3_new_window",
  command: {
    id: MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
    title: {
      ...localize2("moveEditorToNewWindow", "Move Editor into New Window"),
      mnemonicTitle: localize({ key: "miMoveEditorToNewWindow", comment: ["&& denotes a mnemonic"] }, "&&Move Editor into New Window")
    }
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "3_new_window",
  command: {
    id: COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
    title: {
      ...localize2("copyEditorToNewWindow", "Copy Editor into New Window"),
      mnemonicTitle: localize({ key: "miCopyEditorToNewWindow", comment: ["&& denotes a mnemonic"] }, "&&Copy Editor into New Window")
    }
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutSingleAction.ID,
    title: {
      ...localize2("miSingleColumnEditorLayoutWithoutMnemonic", "Single"),
      mnemonicTitle: localize({ key: "miSingleColumnEditorLayout", comment: ["&& denotes a mnemonic"] }, "&&Single")
    }
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutTwoColumnsAction.ID,
    title: {
      ...localize2("miTwoColumnsEditorLayoutWithoutMnemonic", "Two Columns"),
      mnemonicTitle: localize({ key: "miTwoColumnsEditorLayout", comment: ["&& denotes a mnemonic"] }, "&&Two Columns")
    }
  },
  order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutThreeColumnsAction.ID,
    title: {
      ...localize2("miThreeColumnsEditorLayoutWithoutMnemonic", "Three Columns"),
      mnemonicTitle: localize({ key: "miThreeColumnsEditorLayout", comment: ["&& denotes a mnemonic"] }, "T&&hree Columns")
    }
  },
  order: 4
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutTwoRowsAction.ID,
    title: {
      ...localize2("miTwoRowsEditorLayoutWithoutMnemonic", "Two Rows"),
      mnemonicTitle: localize({ key: "miTwoRowsEditorLayout", comment: ["&& denotes a mnemonic"] }, "T&&wo Rows")
    }
  },
  order: 5
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutThreeRowsAction.ID,
    title: {
      ...localize2("miThreeRowsEditorLayoutWithoutMnemonic", "Three Rows"),
      mnemonicTitle: localize({ key: "miThreeRowsEditorLayout", comment: ["&& denotes a mnemonic"] }, "Three &&Rows")
    }
  },
  order: 6
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutTwoByTwoGridAction.ID,
    title: {
      ...localize2("miTwoByTwoGridEditorLayoutWithoutMnemonic", "Grid (2x2)"),
      mnemonicTitle: localize({ key: "miTwoByTwoGridEditorLayout", comment: ["&& denotes a mnemonic"] }, "&&Grid (2x2)")
    }
  },
  order: 7
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutTwoRowsRightAction.ID,
    title: {
      ...localize2("miTwoRowsRightEditorLayoutWithoutMnemonic", "Two Rows Right"),
      mnemonicTitle: localize({ key: "miTwoRowsRightEditorLayout", comment: ["&& denotes a mnemonic"] }, "Two R&&ows Right")
    }
  },
  order: 8
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutTwoColumnsBottomAction.ID,
    title: {
      ...localize2("miTwoColumnsBottomEditorLayoutWithoutMnemonic", "Two Columns Bottom"),
      mnemonicTitle: localize({ key: "miTwoColumnsBottomEditorLayout", comment: ["&& denotes a mnemonic"] }, "Two &&Columns Bottom")
    }
  },
  order: 9
});
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "1_history_nav",
  command: {
    id: "workbench.action.navigateToLastEditLocation",
    title: localize({ key: "miLastEditLocation", comment: ["&& denotes a mnemonic"] }, "&&Last Edit Location"),
    precondition: ContextKeyExpr.has("canNavigateToLastEditLocation")
  },
  order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "1_sideBySide",
  command: {
    id: FOCUS_FIRST_SIDE_EDITOR,
    title: localize({ key: "miFirstSideEditor", comment: ["&& denotes a mnemonic"] }, "&&First Side in Editor")
  },
  when: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "1_sideBySide",
  command: {
    id: FOCUS_SECOND_SIDE_EDITOR,
    title: localize({ key: "miSecondSideEditor", comment: ["&& denotes a mnemonic"] }, "&&Second Side in Editor")
  },
  when: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "2_any",
  command: {
    id: "workbench.action.nextEditor",
    title: localize({ key: "miNextEditor", comment: ["&& denotes a mnemonic"] }, "&&Next Editor")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "2_any",
  command: {
    id: "workbench.action.previousEditor",
    title: localize({ key: "miPreviousEditor", comment: ["&& denotes a mnemonic"] }, "&&Previous Editor")
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "3_any_used",
  command: {
    id: "workbench.action.openNextRecentlyUsedEditor",
    title: localize({ key: "miNextRecentlyUsedEditor", comment: ["&& denotes a mnemonic"] }, "&&Next Used Editor")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "3_any_used",
  command: {
    id: "workbench.action.openPreviousRecentlyUsedEditor",
    title: localize({ key: "miPreviousRecentlyUsedEditor", comment: ["&& denotes a mnemonic"] }, "&&Previous Used Editor")
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "4_group",
  command: {
    id: "workbench.action.nextEditorInGroup",
    title: localize({ key: "miNextEditorInGroup", comment: ["&& denotes a mnemonic"] }, "&&Next Editor in Group")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "4_group",
  command: {
    id: "workbench.action.previousEditorInGroup",
    title: localize({ key: "miPreviousEditorInGroup", comment: ["&& denotes a mnemonic"] }, "&&Previous Editor in Group")
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "5_group_used",
  command: {
    id: "workbench.action.openNextRecentlyUsedEditorInGroup",
    title: localize({ key: "miNextUsedEditorInGroup", comment: ["&& denotes a mnemonic"] }, "&&Next Used Editor in Group")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "5_group_used",
  command: {
    id: "workbench.action.openPreviousRecentlyUsedEditorInGroup",
    title: localize({ key: "miPreviousUsedEditorInGroup", comment: ["&& denotes a mnemonic"] }, "&&Previous Used Editor in Group")
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "2_editor_nav",
  title: localize({ key: "miSwitchEditor", comment: ["&& denotes a mnemonic"] }, "Switch &&Editor"),
  submenu: MenuId.MenubarSwitchEditorMenu,
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "1_focus_index",
  command: {
    id: "workbench.action.focusFirstEditorGroup",
    title: localize({ key: "miFocusFirstGroup", comment: ["&& denotes a mnemonic"] }, "Group &&1")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "1_focus_index",
  command: {
    id: "workbench.action.focusSecondEditorGroup",
    title: localize({ key: "miFocusSecondGroup", comment: ["&& denotes a mnemonic"] }, "Group &&2")
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "1_focus_index",
  command: {
    id: "workbench.action.focusThirdEditorGroup",
    title: localize({ key: "miFocusThirdGroup", comment: ["&& denotes a mnemonic"] }, "Group &&3"),
    precondition: MultipleEditorGroupsContext
  },
  order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "1_focus_index",
  command: {
    id: "workbench.action.focusFourthEditorGroup",
    title: localize({ key: "miFocusFourthGroup", comment: ["&& denotes a mnemonic"] }, "Group &&4"),
    precondition: MultipleEditorGroupsContext
  },
  order: 4
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "1_focus_index",
  command: {
    id: "workbench.action.focusFifthEditorGroup",
    title: localize({ key: "miFocusFifthGroup", comment: ["&& denotes a mnemonic"] }, "Group &&5"),
    precondition: MultipleEditorGroupsContext
  },
  order: 5
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "2_next_prev",
  command: {
    id: "workbench.action.focusNextGroup",
    title: localize({ key: "miNextGroup", comment: ["&& denotes a mnemonic"] }, "&&Next Group"),
    precondition: MultipleEditorGroupsContext
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "2_next_prev",
  command: {
    id: "workbench.action.focusPreviousGroup",
    title: localize({ key: "miPreviousGroup", comment: ["&& denotes a mnemonic"] }, "&&Previous Group"),
    precondition: MultipleEditorGroupsContext
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "3_directional",
  command: {
    id: "workbench.action.focusLeftGroup",
    title: localize({ key: "miFocusLeftGroup", comment: ["&& denotes a mnemonic"] }, "Group &&Left"),
    precondition: MultipleEditorGroupsContext
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "3_directional",
  command: {
    id: "workbench.action.focusRightGroup",
    title: localize({ key: "miFocusRightGroup", comment: ["&& denotes a mnemonic"] }, "Group &&Right"),
    precondition: MultipleEditorGroupsContext
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "3_directional",
  command: {
    id: "workbench.action.focusAboveGroup",
    title: localize({ key: "miFocusAboveGroup", comment: ["&& denotes a mnemonic"] }, "Group &&Above"),
    precondition: MultipleEditorGroupsContext
  },
  order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "3_directional",
  command: {
    id: "workbench.action.focusBelowGroup",
    title: localize({ key: "miFocusBelowGroup", comment: ["&& denotes a mnemonic"] }, "Group &&Below"),
    precondition: MultipleEditorGroupsContext
  },
  order: 4
});
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "2_editor_nav",
  title: localize({ key: "miSwitchGroup", comment: ["&& denotes a mnemonic"] }, "Switch &&Group"),
  submenu: MenuId.MenubarSwitchGroupMenu,
  order: 2
});
registerEditorFontConfigurations(getFontSnippets);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3IuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZVJlZ2lzdHJ5LCBFZGl0b3JQYW5lRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBFZGl0b3JFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQge1xuXHRUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQsIEFjdGl2ZUVkaXRvclBpbm5lZENvbnRleHQsIEVkaXRvckdyb3VwRWRpdG9yc0NvdW50Q29udGV4dCwgQWN0aXZlRWRpdG9yU3RpY2t5Q29udGV4dCwgQWN0aXZlRWRpdG9yQXZhaWxhYmxlRWRpdG9ySWRzQ29udGV4dCxcblx0RWRpdG9yUGFydE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dCwgQWN0aXZlRWRpdG9yRGlydHlDb250ZXh0LCBBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQsIEFjdGl2ZUVkaXRvckNhblNwbGl0SW5Hcm91cENvbnRleHQsIFNpZGVCeVNpZGVFZGl0b3JBY3RpdmVDb250ZXh0LFxuXHRFZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQsIEFjdGl2ZUVkaXRvckxhc3RJbkdyb3VwQ29udGV4dCwgRWRpdG9yUGFydE1heGltaXplZEVkaXRvckdyb3VwQ29udGV4dCwgTXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0LCBJbkVkaXRvclplbk1vZGVDb250ZXh0LFxuXHRJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQsIEFjdGl2ZUNvbXBhcmVFZGl0b3JDYW5Td2FwQ29udGV4dCwgTXVsdGlwbGVFZGl0b3JzU2VsZWN0ZWRJbkdyb3VwQ29udGV4dCwgU3BsaXRFZGl0b3JzVmVydGljYWxseSxcblx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIEFjdGl2ZUN1c3RvbUVkaXRvckRpZmZDYW5Ub2dnbGVMYXlvdXRDb250ZXh0LCBBY3RpdmVDdXN0b21FZGl0b3JUZXh0RGlmZkNvbnRleHQsIEVkaXRvclBhcnRNb2RhbENvbnRleHRcbn0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCwgU2lkZUJ5U2lkZUVkaXRvcklucHV0U2VyaWFsaXplciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3Ivc2lkZUJ5U2lkZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFRleHRSZXNvdXJjZUVkaXRvciB9IGZyb20gJy4vdGV4dFJlc291cmNlRWRpdG9yLmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuL3NpZGVCeVNpZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvcklucHV0LCBEaWZmRWRpdG9ySW5wdXRTZXJpYWxpemVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9kaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91bnRpdGxlZC9jb21tb24vdW50aXRsZWRUZXh0RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3RleHRSZXNvdXJjZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFRleHREaWZmRWRpdG9yIH0gZnJvbSAnLi90ZXh0RGlmZkVkaXRvci5qcyc7XG5pbXBvcnQgeyBCaW5hcnlSZXNvdXJjZURpZmZFZGl0b3IgfSBmcm9tICcuL2JpbmFyeURpZmZFZGl0b3IuanMnO1xuaW1wb3J0IHsgQ2hhbmdlRW5jb2RpbmdBY3Rpb24sIENoYW5nZUVPTEFjdGlvbiwgQ2hhbmdlTGFuZ3VhZ2VBY3Rpb24sIEVkaXRvclN0YXR1c0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4vZWRpdG9yU3RhdHVzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgTWVudVJlZ2lzdHJ5LCBNZW51SWQsIElNZW51SXRlbSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IEtleU1vZCwgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7XG5cdENsb3NlRWRpdG9yc0luT3RoZXJHcm91cHNBY3Rpb24sIENsb3NlQWxsRWRpdG9yc0FjdGlvbiwgTW92ZUdyb3VwTGVmdEFjdGlvbiwgTW92ZUdyb3VwUmlnaHRBY3Rpb24sIFNwbGl0RWRpdG9yQWN0aW9uLCBKb2luVHdvR3JvdXBzQWN0aW9uLCBSZXZlcnRBbmRDbG9zZUVkaXRvckFjdGlvbixcblx0TmF2aWdhdGVCZXR3ZWVuR3JvdXBzQWN0aW9uLCBGb2N1c0FjdGl2ZUdyb3VwQWN0aW9uLCBGb2N1c0ZpcnN0R3JvdXBBY3Rpb24sIFJlc2V0R3JvdXBTaXplc0FjdGlvbiwgTWluaW1pemVPdGhlckdyb3Vwc0FjdGlvbiwgRm9jdXNQcmV2aW91c0dyb3VwLCBGb2N1c05leHRHcm91cCxcblx0Q2xvc2VMZWZ0RWRpdG9yc0luR3JvdXBBY3Rpb24sIE9wZW5OZXh0RWRpdG9yLCBPcGVuUHJldmlvdXNFZGl0b3IsIE5hdmlnYXRlQmFja3dhcmRzQWN0aW9uLCBOYXZpZ2F0ZUZvcndhcmRBY3Rpb24sIE5hdmlnYXRlUHJldmlvdXNBY3Rpb24sIFJlb3BlbkNsb3NlZEVkaXRvckFjdGlvbixcblx0UXVpY2tBY2Nlc3NQcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvckluR3JvdXBBY3Rpb24sIFF1aWNrQWNjZXNzUHJldmlvdXNFZGl0b3JGcm9tSGlzdG9yeUFjdGlvbiwgU2hvd0FsbEVkaXRvcnNCeUFwcGVhcmFuY2VBY3Rpb24sIENsZWFyRWRpdG9ySGlzdG9yeUFjdGlvbiwgTW92ZUVkaXRvclJpZ2h0SW5Hcm91cEFjdGlvbiwgT3Blbk5leHRFZGl0b3JJbkdyb3VwLFxuXHRPcGVuUHJldmlvdXNFZGl0b3JJbkdyb3VwLCBPcGVuTmV4dFJlY2VudGx5VXNlZEVkaXRvckFjdGlvbiwgT3BlblByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9yQWN0aW9uLCBNb3ZlRWRpdG9yVG9QcmV2aW91c0dyb3VwQWN0aW9uLFxuXHRNb3ZlRWRpdG9yVG9OZXh0R3JvdXBBY3Rpb24sIE1vdmVFZGl0b3JUb0ZpcnN0R3JvdXBBY3Rpb24sIE1vdmVFZGl0b3JMZWZ0SW5Hcm91cEFjdGlvbiwgTW92ZUVkaXRvclRvU3RhcnRBY3Rpb24sIE1vdmVFZGl0b3JUb0VuZEFjdGlvbiwgQ2xlYXJSZWNlbnRGaWxlc0FjdGlvbiwgT3Blbkxhc3RFZGl0b3JJbkdyb3VwLFxuXHRTaG93RWRpdG9yc0luQWN0aXZlR3JvdXBCeU1vc3RSZWNlbnRseVVzZWRBY3Rpb24sIE1vdmVFZGl0b3JUb0xhc3RHcm91cEFjdGlvbiwgT3BlbkZpcnN0RWRpdG9ySW5Hcm91cCwgTW92ZUdyb3VwVXBBY3Rpb24sIE1vdmVHcm91cERvd25BY3Rpb24sIEZvY3VzTGFzdEdyb3VwQWN0aW9uLCBTcGxpdEVkaXRvckxlZnRBY3Rpb24sIFNwbGl0RWRpdG9yUmlnaHRBY3Rpb24sXG5cdFNwbGl0RWRpdG9yVXBBY3Rpb24sIFNwbGl0RWRpdG9yRG93bkFjdGlvbiwgTW92ZUVkaXRvclRvTGVmdEdyb3VwQWN0aW9uLCBNb3ZlRWRpdG9yVG9SaWdodEdyb3VwQWN0aW9uLCBNb3ZlRWRpdG9yVG9BYm92ZUdyb3VwQWN0aW9uLCBNb3ZlRWRpdG9yVG9CZWxvd0dyb3VwQWN0aW9uLCBDbG9zZUFsbEVkaXRvckdyb3Vwc0FjdGlvbixcblx0Sm9pbkFsbEdyb3Vwc0FjdGlvbiwgRm9jdXNMZWZ0R3JvdXAsIEZvY3VzQWJvdmVHcm91cCwgRm9jdXNSaWdodEdyb3VwLCBGb2N1c0JlbG93R3JvdXAsIEVkaXRvckxheW91dFNpbmdsZUFjdGlvbiwgRWRpdG9yTGF5b3V0VHdvQ29sdW1uc0FjdGlvbiwgRWRpdG9yTGF5b3V0VGhyZWVDb2x1bW5zQWN0aW9uLCBFZGl0b3JMYXlvdXRUd29CeVR3b0dyaWRBY3Rpb24sXG5cdEVkaXRvckxheW91dFR3b1Jvd3NBY3Rpb24sIEVkaXRvckxheW91dFRocmVlUm93c0FjdGlvbiwgRWRpdG9yTGF5b3V0VHdvQ29sdW1uc0JvdHRvbUFjdGlvbiwgRWRpdG9yTGF5b3V0VHdvUm93c1JpZ2h0QWN0aW9uLCBOZXdFZGl0b3JHcm91cExlZnRBY3Rpb24sIE5ld0VkaXRvckdyb3VwUmlnaHRBY3Rpb24sXG5cdE5ld0VkaXRvckdyb3VwQWJvdmVBY3Rpb24sIE5ld0VkaXRvckdyb3VwQmVsb3dBY3Rpb24sIFNwbGl0RWRpdG9yT3J0aG9nb25hbEFjdGlvbiwgQ2xvc2VFZGl0b3JJbkFsbEdyb3Vwc0FjdGlvbiwgTmF2aWdhdGVUb0xhc3RFZGl0TG9jYXRpb25BY3Rpb24sIFRvZ2dsZUdyb3VwU2l6ZXNBY3Rpb24sIFNob3dBbGxFZGl0b3JzQnlNb3N0UmVjZW50bHlVc2VkQWN0aW9uLFxuXHRRdWlja0FjY2Vzc1ByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9yQWN0aW9uLCBPcGVuUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3JJbkdyb3VwQWN0aW9uLCBPcGVuTmV4dFJlY2VudGx5VXNlZEVkaXRvckluR3JvdXBBY3Rpb24sIFF1aWNrQWNjZXNzTGVhc3RSZWNlbnRseVVzZWRFZGl0b3JBY3Rpb24sIFF1aWNrQWNjZXNzTGVhc3RSZWNlbnRseVVzZWRFZGl0b3JJbkdyb3VwQWN0aW9uLFxuXHRSZU9wZW5JblRleHRFZGl0b3JBY3Rpb24sIER1cGxpY2F0ZUdyb3VwRG93bkFjdGlvbiwgRHVwbGljYXRlR3JvdXBMZWZ0QWN0aW9uLCBEdXBsaWNhdGVHcm91cFJpZ2h0QWN0aW9uLCBEdXBsaWNhdGVHcm91cFVwQWN0aW9uLCBUb2dnbGVFZGl0b3JUeXBlQWN0aW9uLCBTcGxpdEVkaXRvclRvQWJvdmVHcm91cEFjdGlvbiwgU3BsaXRFZGl0b3JUb0JlbG93R3JvdXBBY3Rpb24sXG5cdFNwbGl0RWRpdG9yVG9GaXJzdEdyb3VwQWN0aW9uLCBTcGxpdEVkaXRvclRvTGFzdEdyb3VwQWN0aW9uLCBTcGxpdEVkaXRvclRvTGVmdEdyb3VwQWN0aW9uLCBTcGxpdEVkaXRvclRvTmV4dEdyb3VwQWN0aW9uLCBTcGxpdEVkaXRvclRvUHJldmlvdXNHcm91cEFjdGlvbiwgU3BsaXRFZGl0b3JUb1JpZ2h0R3JvdXBBY3Rpb24sIE5hdmlnYXRlRm9yd2FyZEluRWRpdHNBY3Rpb24sXG5cdE5hdmlnYXRlQmFja3dhcmRzSW5FZGl0c0FjdGlvbiwgTmF2aWdhdGVGb3J3YXJkSW5OYXZpZ2F0aW9uc0FjdGlvbiwgTmF2aWdhdGVCYWNrd2FyZHNJbk5hdmlnYXRpb25zQWN0aW9uLCBOYXZpZ2F0ZVByZXZpb3VzSW5OYXZpZ2F0aW9uc0FjdGlvbiwgTmF2aWdhdGVQcmV2aW91c0luRWRpdHNBY3Rpb24sIE5hdmlnYXRlVG9MYXN0TmF2aWdhdGlvbkxvY2F0aW9uQWN0aW9uLFxuXHRNYXhpbWl6ZUdyb3VwSGlkZVNpZGViYXJBY3Rpb24sIE1vdmVFZGl0b3JUb05ld1dpbmRvd0FjdGlvbiwgQ29weUVkaXRvclRvTmV3aW5kb3dBY3Rpb24sIFJlc3RvcmVFZGl0b3JzVG9NYWluV2luZG93QWN0aW9uLCBUb2dnbGVNYXhpbWl6ZUVkaXRvckdyb3VwQWN0aW9uLCBNaW5pbWl6ZU90aGVyR3JvdXBzSGlkZVNpZGViYXJBY3Rpb24sIENvcHlFZGl0b3JHcm91cFRvTmV3V2luZG93QWN0aW9uLFxuXHRNb3ZlRWRpdG9yR3JvdXBUb05ld1dpbmRvd0FjdGlvbiwgTmV3RW1wdHlFZGl0b3JXaW5kb3dBY3Rpb24sXG5cdENsZWFyRWRpdG9ySGlzdG9yeVdpdGhvdXRDb25maXJtQWN0aW9uXG59IGZyb20gJy4vZWRpdG9yQWN0aW9ucy5qcyc7XG5pbXBvcnQge1xuXHRDTE9TRV9FRElUT1JTX0FORF9HUk9VUF9DT01NQU5EX0lELCBDTE9TRV9FRElUT1JTX0lOX0dST1VQX0NPTU1BTkRfSUQsIENMT1NFX0VESVRPUlNfVE9fVEhFX1JJR0hUX0NPTU1BTkRfSUQsIENMT1NFX0VESVRPUl9DT01NQU5EX0lELCBDTE9TRV9FRElUT1JfR1JPVVBfQ09NTUFORF9JRCwgQ0xPU0VfT1RIRVJfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELFxuXHRDTE9TRV9QSU5ORURfRURJVE9SX0NPTU1BTkRfSUQsIENMT1NFX1NBVkVEX0VESVRPUlNfQ09NTUFORF9JRCwgS0VFUF9FRElUT1JfQ09NTUFORF9JRCwgUElOX0VESVRPUl9DT01NQU5EX0lELCBTSE9XX0VESVRPUlNfSU5fR1JPVVAsIFNQTElUX0VESVRPUl9ET1dOLCBTUExJVF9FRElUT1JfTEVGVCxcblx0U1BMSVRfRURJVE9SX1JJR0hULCBTUExJVF9FRElUT1JfVVAsIFRPR0dMRV9LRUVQX0VESVRPUlNfQ09NTUFORF9JRCwgVU5QSU5fRURJVE9SX0NPTU1BTkRfSUQsIHNldHVwIGFzIHJlZ2lzdGVyRWRpdG9yQ29tbWFuZHMsIFJFT1BFTl9XSVRIX0NPTU1BTkRfSUQsXG5cdFRPR0dMRV9MT0NLX0dST1VQX0NPTU1BTkRfSUQsIFVOTE9DS19HUk9VUF9DT01NQU5EX0lELCBTUExJVF9FRElUT1JfSU5fR1JPVVAsIEpPSU5fRURJVE9SX0lOX0dST1VQLCBGT0NVU19GSVJTVF9TSURFX0VESVRPUiwgRk9DVVNfU0VDT05EX1NJREVfRURJVE9SLCBUT0dHTEVfU1BMSVRfRURJVE9SX0lOX0dST1VQX0xBWU9VVCwgTE9DS19HUk9VUF9DT01NQU5EX0lELFxuXHRTUExJVF9FRElUT1IsIFRPR0dMRV9NQVhJTUlaRV9FRElUT1JfR1JPVVAsIE1PVkVfRURJVE9SX0lOVE9fTkVXX1dJTkRPV19DT01NQU5EX0lELCBDT1BZX0VESVRPUl9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCwgTU9WRV9FRElUT1JfR1JPVVBfSU5UT19ORVdfV0lORE9XX0NPTU1BTkRfSUQsIENPUFlfRURJVE9SX0dST1VQX0lOVE9fTkVXX1dJTkRPV19DT01NQU5EX0lELFxuXHRORVdfRU1QVFlfRURJVE9SX1dJTkRPV19DT01NQU5EX0lELCBNT1ZFX0VESVRPUl9JTlRPX1JJR0hUX0dST1VQLCBNT1ZFX0VESVRPUl9JTlRPX0xFRlRfR1JPVVAsIE1PVkVfRURJVE9SX0lOVE9fQUJPVkVfR1JPVVAsIE1PVkVfRURJVE9SX0lOVE9fQkVMT1dfR1JPVVBcbn0gZnJvbSAnLi9lZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBHT1RPX05FWFRfQ0hBTkdFLCBHT1RPX1BSRVZJT1VTX0NIQU5HRSwgVE9HR0xFX0RJRkZfSUdOT1JFX1RSSU1fV0hJVEVTUEFDRSwgVE9HR0xFX0RJRkZfU0lERV9CWV9TSURFLCBESUZGX1NXQVBfU0lERVMgfSBmcm9tICcuL2RpZmZFZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBpblF1aWNrUGlja0NvbnRleHQsIGdldFF1aWNrTmF2aWdhdGVIYW5kbGVyIH0gZnJvbSAnLi4vLi4vcXVpY2thY2Nlc3MuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFBoYXNlLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBdXRvU2F2ZSB9IGZyb20gJy4vZWRpdG9yQXV0b1NhdmUuanMnO1xuaW1wb3J0IHsgSVF1aWNrQWNjZXNzUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgUXVpY2tBY2Nlc3NFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgQWN0aXZlR3JvdXBFZGl0b3JzQnlNb3N0UmVjZW50bHlVc2VkUXVpY2tBY2Nlc3MsIEFsbEVkaXRvcnNCeUFwcGVhcmFuY2VRdWlja0FjY2VzcywgQWxsRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZFF1aWNrQWNjZXNzIH0gZnJvbSAnLi9lZGl0b3JRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBVbnRpdGxlZFRleHRFZGl0b3JJbnB1dFNlcmlhbGl6ZXIsIFVudGl0bGVkVGV4dEVkaXRvcldvcmtpbmdDb3B5RWRpdG9ySGFuZGxlciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VudGl0bGVkL2NvbW1vbi91bnRpdGxlZFRleHRFZGl0b3JIYW5kbGVyLmpzJztcbmltcG9ydCB7IER5bmFtaWNFZGl0b3JDb25maWd1cmF0aW9ucyB9IGZyb20gJy4vZWRpdG9yQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmVFZGl0b3JBY3Rpb24sIENvbmZpZ3VyZUVkaXRvclRhYnNBY3Rpb24sIEVkaXRvckFjdGlvbnNEZWZhdWx0QWN0aW9uLCBFZGl0b3JBY3Rpb25zVGl0bGVCYXJBY3Rpb24sIEhpZGVFZGl0b3JBY3Rpb25zQWN0aW9uLCBIaWRlRWRpdG9yVGFic0FjdGlvbiwgU2hvd011bHRpcGxlRWRpdG9yVGFic0FjdGlvbiwgU2hvd1NpbmdsZUVkaXRvclRhYkFjdGlvbiwgWmVuSGlkZUVkaXRvclRhYnNBY3Rpb24sIFplblNob3dNdWx0aXBsZUVkaXRvclRhYnNBY3Rpb24sIFplblNob3dTaW5nbGVFZGl0b3JUYWJBY3Rpb24gfSBmcm9tICcuLi8uLi9hY3Rpb25zL2xheW91dEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgZ2V0Rm9udFNuaXBwZXRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2ZvbnRzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyRWRpdG9yRm9udENvbmZpZ3VyYXRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvblNjaGVtYS5qcyc7XG5cbi8vI3JlZ2lvbiBFZGl0b3IgUmVnaXN0cmF0aW9uc1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdFRleHRSZXNvdXJjZUVkaXRvcixcblx0XHRUZXh0UmVzb3VyY2VFZGl0b3IuSUQsXG5cdFx0bG9jYWxpemUoJ3RleHRFZGl0b3InLCBcIlRleHQgRWRpdG9yXCIpLFxuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKFVudGl0bGVkVGV4dEVkaXRvcklucHV0KSxcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoVGV4dFJlc291cmNlRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0VGV4dERpZmZFZGl0b3IsXG5cdFx0VGV4dERpZmZFZGl0b3IuSUQsXG5cdFx0bG9jYWxpemUoJ3RleHREaWZmRWRpdG9yJywgXCJUZXh0IERpZmYgRWRpdG9yXCIpXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoRGlmZkVkaXRvcklucHV0KVxuXHRdXG4pO1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdEJpbmFyeVJlc291cmNlRGlmZkVkaXRvcixcblx0XHRCaW5hcnlSZXNvdXJjZURpZmZFZGl0b3IuSUQsXG5cdFx0bG9jYWxpemUoJ2JpbmFyeURpZmZFZGl0b3InLCBcIkJpbmFyeSBEaWZmIEVkaXRvclwiKVxuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKERpZmZFZGl0b3JJbnB1dClcblx0XVxuKTtcblxuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRTaWRlQnlTaWRlRWRpdG9yLFxuXHRcdFNpZGVCeVNpZGVFZGl0b3IuSUQsXG5cdFx0bG9jYWxpemUoJ3NpZGVCeVNpZGVFZGl0b3InLCBcIlNpZGUgYnkgU2lkZSBFZGl0b3JcIilcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihTaWRlQnlTaWRlRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKFVudGl0bGVkVGV4dEVkaXRvcklucHV0LklELCBVbnRpdGxlZFRleHRFZGl0b3JJbnB1dFNlcmlhbGl6ZXIpO1xuUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5yZWdpc3RlckVkaXRvclNlcmlhbGl6ZXIoU2lkZUJ5U2lkZUVkaXRvcklucHV0LklELCBTaWRlQnlTaWRlRWRpdG9ySW5wdXRTZXJpYWxpemVyKTtcblJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKERpZmZFZGl0b3JJbnB1dC5JRCwgRGlmZkVkaXRvcklucHV0U2VyaWFsaXplcik7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gV29ya2JlbmNoIENvbnRyaWJ1dGlvbnNcblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEVkaXRvckF1dG9TYXZlLklELCBFZGl0b3JBdXRvU2F2ZSwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihFZGl0b3JTdGF0dXNDb250cmlidXRpb24uSUQsIEVkaXRvclN0YXR1c0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihVbnRpdGxlZFRleHRFZGl0b3JXb3JraW5nQ29weUVkaXRvckhhbmRsZXIuSUQsIFVudGl0bGVkVGV4dEVkaXRvcldvcmtpbmdDb3B5RWRpdG9ySGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihEeW5hbWljRWRpdG9yQ29uZmlndXJhdGlvbnMuSUQsIER5bmFtaWNFZGl0b3JDb25maWd1cmF0aW9ucywgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBRdWljayBBY2Nlc3NcblxuY29uc3QgcXVpY2tBY2Nlc3NSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElRdWlja0FjY2Vzc1JlZ2lzdHJ5PihRdWlja0FjY2Vzc0V4dGVuc2lvbnMuUXVpY2thY2Nlc3MpO1xuY29uc3QgZWRpdG9yUGlja2VyQ29udGV4dEtleSA9ICdpbkVkaXRvcnNQaWNrZXInO1xuY29uc3QgZWRpdG9yUGlja2VyQ29udGV4dCA9IENvbnRleHRLZXlFeHByLmFuZChpblF1aWNrUGlja0NvbnRleHQsIENvbnRleHRLZXlFeHByLmhhcyhlZGl0b3JQaWNrZXJDb250ZXh0S2V5KSk7XG5cbnF1aWNrQWNjZXNzUmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKHtcblx0Y3RvcjogQWN0aXZlR3JvdXBFZGl0b3JzQnlNb3N0UmVjZW50bHlVc2VkUXVpY2tBY2Nlc3MsXG5cdHByZWZpeDogQWN0aXZlR3JvdXBFZGl0b3JzQnlNb3N0UmVjZW50bHlVc2VkUXVpY2tBY2Nlc3MuUFJFRklYLFxuXHRjb250ZXh0S2V5OiBlZGl0b3JQaWNrZXJDb250ZXh0S2V5LFxuXHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ2VkaXRvclF1aWNrQWNjZXNzUGxhY2Vob2xkZXInLCBcIlR5cGUgdGhlIG5hbWUgb2YgYW4gZWRpdG9yIHRvIG9wZW4gaXQuXCIpLFxuXHRoZWxwRW50cmllczogW3sgZGVzY3JpcHRpb246IGxvY2FsaXplKCdhY3RpdmVHcm91cEVkaXRvcnNCeU1vc3RSZWNlbnRseVVzZWRRdWlja0FjY2VzcycsIFwiU2hvdyBFZGl0b3JzIGluIEFjdGl2ZSBHcm91cCBieSBNb3N0IFJlY2VudGx5IFVzZWRcIiksIGNvbW1hbmRJZDogU2hvd0VkaXRvcnNJbkFjdGl2ZUdyb3VwQnlNb3N0UmVjZW50bHlVc2VkQWN0aW9uLklEIH1dXG59KTtcblxucXVpY2tBY2Nlc3NSZWdpc3RyeS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoe1xuXHRjdG9yOiBBbGxFZGl0b3JzQnlBcHBlYXJhbmNlUXVpY2tBY2Nlc3MsXG5cdHByZWZpeDogQWxsRWRpdG9yc0J5QXBwZWFyYW5jZVF1aWNrQWNjZXNzLlBSRUZJWCxcblx0Y29udGV4dEtleTogZWRpdG9yUGlja2VyQ29udGV4dEtleSxcblx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdlZGl0b3JRdWlja0FjY2Vzc1BsYWNlaG9sZGVyJywgXCJUeXBlIHRoZSBuYW1lIG9mIGFuIGVkaXRvciB0byBvcGVuIGl0LlwiKSxcblx0aGVscEVudHJpZXM6IFt7IGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWxsRWRpdG9yc0J5QXBwZWFyYW5jZVF1aWNrQWNjZXNzJywgXCJTaG93IEFsbCBPcGVuZWQgRWRpdG9ycyBCeSBBcHBlYXJhbmNlXCIpLCBjb21tYW5kSWQ6IFNob3dBbGxFZGl0b3JzQnlBcHBlYXJhbmNlQWN0aW9uLklEIH1dXG59KTtcblxucXVpY2tBY2Nlc3NSZWdpc3RyeS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoe1xuXHRjdG9yOiBBbGxFZGl0b3JzQnlNb3N0UmVjZW50bHlVc2VkUXVpY2tBY2Nlc3MsXG5cdHByZWZpeDogQWxsRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZFF1aWNrQWNjZXNzLlBSRUZJWCxcblx0Y29udGV4dEtleTogZWRpdG9yUGlja2VyQ29udGV4dEtleSxcblx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdlZGl0b3JRdWlja0FjY2Vzc1BsYWNlaG9sZGVyJywgXCJUeXBlIHRoZSBuYW1lIG9mIGFuIGVkaXRvciB0byBvcGVuIGl0LlwiKSxcblx0aGVscEVudHJpZXM6IFt7IGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWxsRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZFF1aWNrQWNjZXNzJywgXCJTaG93IEFsbCBPcGVuZWQgRWRpdG9ycyBCeSBNb3N0IFJlY2VudGx5IFVzZWRcIiksIGNvbW1hbmRJZDogU2hvd0FsbEVkaXRvcnNCeU1vc3RSZWNlbnRseVVzZWRBY3Rpb24uSUQgfV1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEFjdGlvbnMgJiBDb21tYW5kc1xuXG5yZWdpc3RlckFjdGlvbjIoQ2hhbmdlTGFuZ3VhZ2VBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKENoYW5nZUVPTEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoQ2hhbmdlRW5jb2RpbmdBY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoTmF2aWdhdGVGb3J3YXJkQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihOYXZpZ2F0ZUJhY2t3YXJkc0FjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihPcGVuTmV4dEVkaXRvcik7XG5yZWdpc3RlckFjdGlvbjIoT3BlblByZXZpb3VzRWRpdG9yKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuTmV4dEVkaXRvckluR3JvdXApO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5QcmV2aW91c0VkaXRvckluR3JvdXApO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5GaXJzdEVkaXRvckluR3JvdXApO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5MYXN0RWRpdG9ySW5Hcm91cCk7XG5cbnJlZ2lzdGVyQWN0aW9uMihPcGVuTmV4dFJlY2VudGx5VXNlZEVkaXRvckFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoT3BlblByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9yQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuTmV4dFJlY2VudGx5VXNlZEVkaXRvckluR3JvdXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5QcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvckluR3JvdXBBY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoUmVvcGVuQ2xvc2VkRWRpdG9yQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihDbGVhclJlY2VudEZpbGVzQWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKFNob3dBbGxFZGl0b3JzQnlBcHBlYXJhbmNlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTaG93QWxsRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU2hvd0VkaXRvcnNJbkFjdGl2ZUdyb3VwQnlNb3N0UmVjZW50bHlVc2VkQWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKENsb3NlQWxsRWRpdG9yc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoQ2xvc2VBbGxFZGl0b3JHcm91cHNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKENsb3NlTGVmdEVkaXRvcnNJbkdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihDbG9zZUVkaXRvcnNJbk90aGVyR3JvdXBzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihDbG9zZUVkaXRvckluQWxsR3JvdXBzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihSZXZlcnRBbmRDbG9zZUVkaXRvckFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihTcGxpdEVkaXRvckFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3BsaXRFZGl0b3JPcnRob2dvbmFsQWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKFNwbGl0RWRpdG9yTGVmdEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3BsaXRFZGl0b3JSaWdodEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3BsaXRFZGl0b3JVcEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3BsaXRFZGl0b3JEb3duQWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKEpvaW5Ud29Hcm91cHNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEpvaW5BbGxHcm91cHNBY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoTmF2aWdhdGVCZXR3ZWVuR3JvdXBzQWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKFJlc2V0R3JvdXBTaXplc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoVG9nZ2xlR3JvdXBTaXplc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTWF4aW1pemVHcm91cEhpZGVTaWRlYmFyQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihUb2dnbGVNYXhpbWl6ZUVkaXRvckdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNaW5pbWl6ZU90aGVyR3JvdXBzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNaW5pbWl6ZU90aGVyR3JvdXBzSGlkZVNpZGViYXJBY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoTW92ZUVkaXRvckxlZnRJbkdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlRWRpdG9yUmlnaHRJbkdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlRWRpdG9yVG9TdGFydEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTW92ZUVkaXRvclRvRW5kQWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKE1vdmVHcm91cExlZnRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE1vdmVHcm91cFJpZ2h0QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlR3JvdXBVcEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTW92ZUdyb3VwRG93bkFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihEdXBsaWNhdGVHcm91cExlZnRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKER1cGxpY2F0ZUdyb3VwUmlnaHRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKER1cGxpY2F0ZUdyb3VwVXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKER1cGxpY2F0ZUdyb3VwRG93bkFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihNb3ZlRWRpdG9yVG9QcmV2aW91c0dyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlRWRpdG9yVG9OZXh0R3JvdXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE1vdmVFZGl0b3JUb0ZpcnN0R3JvdXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE1vdmVFZGl0b3JUb0xhc3RHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTW92ZUVkaXRvclRvTGVmdEdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlRWRpdG9yVG9SaWdodEdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlRWRpdG9yVG9BYm92ZUdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlRWRpdG9yVG9CZWxvd0dyb3VwQWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKFNwbGl0RWRpdG9yVG9QcmV2aW91c0dyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTcGxpdEVkaXRvclRvTmV4dEdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTcGxpdEVkaXRvclRvRmlyc3RHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3BsaXRFZGl0b3JUb0xhc3RHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3BsaXRFZGl0b3JUb0xlZnRHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3BsaXRFZGl0b3JUb1JpZ2h0R3JvdXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNwbGl0RWRpdG9yVG9BYm92ZUdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTcGxpdEVkaXRvclRvQmVsb3dHcm91cEFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihGb2N1c0FjdGl2ZUdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihGb2N1c0ZpcnN0R3JvdXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEZvY3VzTGFzdEdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihGb2N1c1ByZXZpb3VzR3JvdXApO1xucmVnaXN0ZXJBY3Rpb24yKEZvY3VzTmV4dEdyb3VwKTtcbnJlZ2lzdGVyQWN0aW9uMihGb2N1c0xlZnRHcm91cCk7XG5yZWdpc3RlckFjdGlvbjIoRm9jdXNSaWdodEdyb3VwKTtcbnJlZ2lzdGVyQWN0aW9uMihGb2N1c0Fib3ZlR3JvdXApO1xucmVnaXN0ZXJBY3Rpb24yKEZvY3VzQmVsb3dHcm91cCk7XG5cbnJlZ2lzdGVyQWN0aW9uMihOZXdFZGl0b3JHcm91cExlZnRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE5ld0VkaXRvckdyb3VwUmlnaHRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE5ld0VkaXRvckdyb3VwQWJvdmVBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE5ld0VkaXRvckdyb3VwQmVsb3dBY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoTmF2aWdhdGVQcmV2aW91c0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTmF2aWdhdGVGb3J3YXJkSW5FZGl0c0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTmF2aWdhdGVCYWNrd2FyZHNJbkVkaXRzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihOYXZpZ2F0ZVByZXZpb3VzSW5FZGl0c0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTmF2aWdhdGVUb0xhc3RFZGl0TG9jYXRpb25BY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE5hdmlnYXRlRm9yd2FyZEluTmF2aWdhdGlvbnNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE5hdmlnYXRlQmFja3dhcmRzSW5OYXZpZ2F0aW9uc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTmF2aWdhdGVQcmV2aW91c0luTmF2aWdhdGlvbnNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE5hdmlnYXRlVG9MYXN0TmF2aWdhdGlvbkxvY2F0aW9uQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihDbGVhckVkaXRvckhpc3RvcnlBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKENsZWFyRWRpdG9ySGlzdG9yeVdpdGhvdXRDb25maXJtQWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKEVkaXRvckxheW91dFNpbmdsZUFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRWRpdG9yTGF5b3V0VHdvQ29sdW1uc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRWRpdG9yTGF5b3V0VGhyZWVDb2x1bW5zQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihFZGl0b3JMYXlvdXRUd29Sb3dzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihFZGl0b3JMYXlvdXRUaHJlZVJvd3NBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEVkaXRvckxheW91dFR3b0J5VHdvR3JpZEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRWRpdG9yTGF5b3V0VHdvUm93c1JpZ2h0QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihFZGl0b3JMYXlvdXRUd29Db2x1bW5zQm90dG9tQWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZUVkaXRvclR5cGVBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFJlT3BlbkluVGV4dEVkaXRvckFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihRdWlja0FjY2Vzc1ByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9yQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihRdWlja0FjY2Vzc0xlYXN0UmVjZW50bHlVc2VkRWRpdG9yQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihRdWlja0FjY2Vzc1ByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9ySW5Hcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoUXVpY2tBY2Nlc3NMZWFzdFJlY2VudGx5VXNlZEVkaXRvckluR3JvdXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFF1aWNrQWNjZXNzUHJldmlvdXNFZGl0b3JGcm9tSGlzdG9yeUFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihNb3ZlRWRpdG9yVG9OZXdXaW5kb3dBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKENvcHlFZGl0b3JUb05ld2luZG93QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlRWRpdG9yR3JvdXBUb05ld1dpbmRvd0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoQ29weUVkaXRvckdyb3VwVG9OZXdXaW5kb3dBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFJlc3RvcmVFZGl0b3JzVG9NYWluV2luZG93QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihOZXdFbXB0eUVkaXRvcldpbmRvd0FjdGlvbik7XG5cbmNvbnN0IHF1aWNrQWNjZXNzTmF2aWdhdGVOZXh0SW5FZGl0b3JQaWNrZXJJZCA9ICd3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3Blbk5hdmlnYXRlTmV4dEluRWRpdG9yUGlja2VyJztcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogcXVpY2tBY2Nlc3NOYXZpZ2F0ZU5leHRJbkVkaXRvclBpY2tlcklkLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUwLFxuXHRoYW5kbGVyOiBnZXRRdWlja05hdmlnYXRlSGFuZGxlcihxdWlja0FjY2Vzc05hdmlnYXRlTmV4dEluRWRpdG9yUGlja2VySWQsIHRydWUpLFxuXHR3aGVuOiBlZGl0b3JQaWNrZXJDb250ZXh0LFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVGFiLFxuXHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLlRhYiB9XG59KTtcblxuY29uc3QgcXVpY2tBY2Nlc3NOYXZpZ2F0ZVByZXZpb3VzSW5FZGl0b3JQaWNrZXJJZCA9ICd3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3Blbk5hdmlnYXRlUHJldmlvdXNJbkVkaXRvclBpY2tlcic7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IHF1aWNrQWNjZXNzTmF2aWdhdGVQcmV2aW91c0luRWRpdG9yUGlja2VySWQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNTAsXG5cdGhhbmRsZXI6IGdldFF1aWNrTmF2aWdhdGVIYW5kbGVyKHF1aWNrQWNjZXNzTmF2aWdhdGVQcmV2aW91c0luRWRpdG9yUGlja2VySWQsIGZhbHNlKSxcblx0d2hlbjogZWRpdG9yUGlja2VyQ29udGV4dCxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlRhYixcblx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWIgfVxufSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZHMoKTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBNZW51c1xuXG4vLyBtYWNPUzogVG91Y2hiYXJcbmlmIChpc01hY2ludG9zaCkge1xuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlRvdWNoQmFyQ29udGV4dCwge1xuXHRcdGNvbW1hbmQ6IHsgaWQ6IE5hdmlnYXRlQmFja3dhcmRzQWN0aW9uLklELCB0aXRsZTogTmF2aWdhdGVCYWNrd2FyZHNBY3Rpb24uTEFCRUwsIGljb246IHsgZGFyazogRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9tZWRpYS9iYWNrLXRiLnBuZycpIH0gfSxcblx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdG9yZGVyOiAwXG5cdH0pO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVG91Y2hCYXJDb250ZXh0LCB7XG5cdFx0Y29tbWFuZDogeyBpZDogTmF2aWdhdGVGb3J3YXJkQWN0aW9uLklELCB0aXRsZTogTmF2aWdhdGVGb3J3YXJkQWN0aW9uLkxBQkVMLCBpY29uOiB7IGRhcms6IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvbWVkaWEvZm9yd2FyZC10Yi5wbmcnKSB9IH0sXG5cdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRvcmRlcjogMVxuXHR9KTtcbn1cblxuLy8gRW1wdHkgRWRpdG9yIEdyb3VwIFRvb2xiYXJcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRW1wdHlFZGl0b3JHcm91cCwgeyBjb21tYW5kOiB7IGlkOiBMT0NLX0dST1VQX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgnbG9ja0dyb3VwQWN0aW9uJywgXCJMb2NrIEdyb3VwXCIpLCBpY29uOiBDb2RpY29uLnVubG9jayB9LCBncm91cDogJ25hdmlnYXRpb24nLCBvcmRlcjogMTAsIHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQsIEFjdGl2ZUVkaXRvckdyb3VwTG9ja2VkQ29udGV4dC50b05lZ2F0ZWQoKSkgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVtcHR5RWRpdG9yR3JvdXAsIHsgY29tbWFuZDogeyBpZDogVU5MT0NLX0dST1VQX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgndW5sb2NrR3JvdXBBY3Rpb24nLCBcIlVubG9jayBHcm91cFwiKSwgaWNvbjogQ29kaWNvbi5sb2NrLCB0b2dnbGVkOiBDb250ZXh0S2V5RXhwci50cnVlKCkgfSwgZ3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IDEwLCB3aGVuOiBBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVtcHR5RWRpdG9yR3JvdXAsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfRURJVE9SX0dST1VQX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgnY2xvc2VHcm91cEFjdGlvbicsIFwiQ2xvc2UgR3JvdXBcIiksIGljb246IENvZGljb24uY2xvc2UgfSwgZ3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IDIwLCB3aGVuOiBDb250ZXh0S2V5RXhwci5vcihJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQsIEVkaXRvclBhcnRNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHQpIH0pO1xuXG4vLyBFbXB0eSBFZGl0b3IgR3JvdXAgQ29udGV4dCBNZW51XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVtcHR5RWRpdG9yR3JvdXBDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IFNQTElUX0VESVRPUl9VUCwgdGl0bGU6IGxvY2FsaXplKCdzcGxpdFVwJywgXCJTcGxpdCBVcFwiKSB9LCBncm91cDogJzJfc3BsaXQnLCBvcmRlcjogMTAgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVtcHR5RWRpdG9yR3JvdXBDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IFNQTElUX0VESVRPUl9ET1dOLCB0aXRsZTogbG9jYWxpemUoJ3NwbGl0RG93bicsIFwiU3BsaXQgRG93blwiKSB9LCBncm91cDogJzJfc3BsaXQnLCBvcmRlcjogMjAgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVtcHR5RWRpdG9yR3JvdXBDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IFNQTElUX0VESVRPUl9MRUZULCB0aXRsZTogbG9jYWxpemUoJ3NwbGl0TGVmdCcsIFwiU3BsaXQgTGVmdFwiKSB9LCBncm91cDogJzJfc3BsaXQnLCBvcmRlcjogMzAgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVtcHR5RWRpdG9yR3JvdXBDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IFNQTElUX0VESVRPUl9SSUdIVCwgdGl0bGU6IGxvY2FsaXplKCdzcGxpdFJpZ2h0JywgXCJTcGxpdCBSaWdodFwiKSB9LCBncm91cDogJzJfc3BsaXQnLCBvcmRlcjogNDAgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVtcHR5RWRpdG9yR3JvdXBDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IE5FV19FTVBUWV9FRElUT1JfV0lORE9XX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgnbmV3V2luZG93JywgXCJOZXcgV2luZG93XCIpIH0sIGdyb3VwOiAnM193aW5kb3cnLCBvcmRlcjogMTAgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVtcHR5RWRpdG9yR3JvdXBDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IFRPR0dMRV9MT0NLX0dST1VQX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgndG9nZ2xlTG9ja0dyb3VwJywgXCJMb2NrIEdyb3VwXCIpLCB0b2dnbGVkOiBBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQgfSwgZ3JvdXA6ICc0X2xvY2snLCBvcmRlcjogMTAsIHdoZW46IElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSAvKiBhbHJlYWR5IGEgcHJpbWFyeSBhY3Rpb24gZm9yIGF1eCB3aW5kb3dzICovIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FbXB0eUVkaXRvckdyb3VwQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBDTE9TRV9FRElUT1JfR1JPVVBfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplKCdjbG9zZScsIFwiQ2xvc2VcIikgfSwgZ3JvdXA6ICc1X2Nsb3NlJywgb3JkZXI6IDEwLCB3aGVuOiBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHQgfSk7XG5cbi8vIEVkaXRvciBUYWIgQ29udGFpbmVyIENvbnRleHQgTWVudVxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBTUExJVF9FRElUT1JfVVAsIHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRVcCcsIFwiU3BsaXQgVXBcIikgfSwgZ3JvdXA6ICcyX3NwbGl0Jywgb3JkZXI6IDEwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBTUExJVF9FRElUT1JfRE9XTiwgdGl0bGU6IGxvY2FsaXplKCdzcGxpdERvd24nLCBcIlNwbGl0IERvd25cIikgfSwgZ3JvdXA6ICcyX3NwbGl0Jywgb3JkZXI6IDIwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBTUExJVF9FRElUT1JfTEVGVCwgdGl0bGU6IGxvY2FsaXplKCdzcGxpdExlZnQnLCBcIlNwbGl0IExlZnRcIikgfSwgZ3JvdXA6ICcyX3NwbGl0Jywgb3JkZXI6IDMwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBTUExJVF9FRElUT1JfUklHSFQsIHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRSaWdodCcsIFwiU3BsaXQgUmlnaHRcIikgfSwgZ3JvdXA6ICcyX3NwbGl0Jywgb3JkZXI6IDQwIH0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRhYnNCYXJDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IE1PVkVfRURJVE9SX0dST1VQX0lOVE9fTkVXX1dJTkRPV19DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ21vdmVFZGl0b3JHcm91cFRvTmV3V2luZG93JywgXCJNb3ZlIGludG8gTmV3IFdpbmRvd1wiKSB9LCBncm91cDogJzNfd2luZG93Jywgb3JkZXI6IDEwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBDT1BZX0VESVRPUl9HUk9VUF9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplKCdjb3B5RWRpdG9yR3JvdXBUb05ld1dpbmRvdycsIFwiQ29weSBpbnRvIE5ldyBXaW5kb3dcIikgfSwgZ3JvdXA6ICczX3dpbmRvdycsIG9yZGVyOiAyMCB9KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyQ29udGV4dCwgeyBzdWJtZW51OiBNZW51SWQuRWRpdG9yVGFic0JhclNob3dUYWJzU3VibWVudSwgdGl0bGU6IGxvY2FsaXplKCd0YWJCYXInLCBcIlRhYiBCYXJcIiksIGdyb3VwOiAnNF9jb25maWcnLCBvcmRlcjogMTAsIHdoZW46IEluRWRpdG9yWmVuTW9kZUNvbnRleHQubmVnYXRlKCkgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRhYnNCYXJTaG93VGFic1N1Ym1lbnUsIHsgY29tbWFuZDogeyBpZDogU2hvd011bHRpcGxlRWRpdG9yVGFic0FjdGlvbi5JRCwgdGl0bGU6IGxvY2FsaXplKCdtdWx0aXBsZVRhYnMnLCBcIk11bHRpcGxlIFRhYnNcIiksIHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5lZGl0b3Iuc2hvd1RhYnMnLCAnbXVsdGlwbGUnKSB9LCBncm91cDogJzFfY29uZmlnJywgb3JkZXI6IDEwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyU2hvd1RhYnNTdWJtZW51LCB7IGNvbW1hbmQ6IHsgaWQ6IFNob3dTaW5nbGVFZGl0b3JUYWJBY3Rpb24uSUQsIHRpdGxlOiBsb2NhbGl6ZSgnc2luZ2xlVGFiJywgXCJTaW5nbGUgVGFiXCIpLCB0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guZWRpdG9yLnNob3dUYWJzJywgJ3NpbmdsZScpIH0sIGdyb3VwOiAnMV9jb25maWcnLCBvcmRlcjogMjAgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRhYnNCYXJTaG93VGFic1N1Ym1lbnUsIHsgY29tbWFuZDogeyBpZDogSGlkZUVkaXRvclRhYnNBY3Rpb24uSUQsIHRpdGxlOiBsb2NhbGl6ZSgnaGlkZVRhYnMnLCBcIkhpZGRlblwiKSwgdG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLmVkaXRvci5zaG93VGFicycsICdub25lJykgfSwgZ3JvdXA6ICcxX2NvbmZpZycsIG9yZGVyOiAzMCB9KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyQ29udGV4dCwgeyBzdWJtZW51OiBNZW51SWQuRWRpdG9yVGFic0JhclNob3dUYWJzWmVuTW9kZVN1Ym1lbnUsIHRpdGxlOiBsb2NhbGl6ZSgndGFiQmFyJywgXCJUYWIgQmFyXCIpLCBncm91cDogJzRfY29uZmlnJywgb3JkZXI6IDEwLCB3aGVuOiBJbkVkaXRvclplbk1vZGVDb250ZXh0IH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyU2hvd1RhYnNaZW5Nb2RlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBaZW5TaG93TXVsdGlwbGVFZGl0b3JUYWJzQWN0aW9uLklELCB0aXRsZTogbG9jYWxpemUoJ211bHRpcGxlVGFicycsIFwiTXVsdGlwbGUgVGFic1wiKSwgdG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuemVuTW9kZS5zaG93VGFicycsICdtdWx0aXBsZScpIH0sIGdyb3VwOiAnMV9jb25maWcnLCBvcmRlcjogMTAgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRhYnNCYXJTaG93VGFic1plbk1vZGVTdWJtZW51LCB7IGNvbW1hbmQ6IHsgaWQ6IFplblNob3dTaW5nbGVFZGl0b3JUYWJBY3Rpb24uSUQsIHRpdGxlOiBsb2NhbGl6ZSgnc2luZ2xlVGFiJywgXCJTaW5nbGUgVGFiXCIpLCB0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy56ZW5Nb2RlLnNob3dUYWJzJywgJ3NpbmdsZScpIH0sIGdyb3VwOiAnMV9jb25maWcnLCBvcmRlcjogMjAgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRhYnNCYXJTaG93VGFic1plbk1vZGVTdWJtZW51LCB7IGNvbW1hbmQ6IHsgaWQ6IFplbkhpZGVFZGl0b3JUYWJzQWN0aW9uLklELCB0aXRsZTogbG9jYWxpemUoJ2hpZGVUYWJzJywgXCJIaWRkZW5cIiksIHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLnplbk1vZGUuc2hvd1RhYnMnLCAnbm9uZScpIH0sIGdyb3VwOiAnMV9jb25maWcnLCBvcmRlcjogMzAgfSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGFic0JhckNvbnRleHQsIHsgc3VibWVudTogTWVudUlkLkVkaXRvckFjdGlvbnNQb3NpdGlvblN1Ym1lbnUsIHRpdGxlOiBsb2NhbGl6ZSgnZWRpdG9yQWN0aW9uc1Bvc2l0aW9uJywgXCJFZGl0b3IgQWN0aW9ucyBQb3NpdGlvblwiKSwgZ3JvdXA6ICc0X2NvbmZpZycsIG9yZGVyOiAyMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yQWN0aW9uc1Bvc2l0aW9uU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBFZGl0b3JBY3Rpb25zRGVmYXVsdEFjdGlvbi5JRCwgdGl0bGU6IGxvY2FsaXplKCd0YWJCYXInLCBcIlRhYiBCYXJcIiksIHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5lZGl0b3IuZWRpdG9yQWN0aW9uc0xvY2F0aW9uJywgJ2RlZmF1bHQnKSB9LCBncm91cDogJzFfY29uZmlnJywgb3JkZXI6IDEwLCB3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guZWRpdG9yLnNob3dUYWJzJywgJ25vbmUnKS5uZWdhdGUoKSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yQWN0aW9uc1Bvc2l0aW9uU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBFZGl0b3JBY3Rpb25zVGl0bGVCYXJBY3Rpb24uSUQsIHRpdGxlOiBsb2NhbGl6ZSgndGl0bGVCYXInLCBcIlRpdGxlIEJhclwiKSwgdG9nZ2xlZDogQ29udGV4dEtleUV4cHIub3IoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLmVkaXRvci5lZGl0b3JBY3Rpb25zTG9jYXRpb24nLCAndGl0bGVCYXInKSwgQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5lZGl0b3Iuc2hvd1RhYnMnLCAnbm9uZScpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guZWRpdG9yLmVkaXRvckFjdGlvbnNMb2NhdGlvbicsICdkZWZhdWx0JykpKSB9LCBncm91cDogJzFfY29uZmlnJywgb3JkZXI6IDIwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JBY3Rpb25zUG9zaXRpb25TdWJtZW51LCB7IGNvbW1hbmQ6IHsgaWQ6IEhpZGVFZGl0b3JBY3Rpb25zQWN0aW9uLklELCB0aXRsZTogbG9jYWxpemUoJ2hpZGRlbicsIFwiSGlkZGVuXCIpLCB0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guZWRpdG9yLmVkaXRvckFjdGlvbnNMb2NhdGlvbicsICdoaWRkZW4nKSB9LCBncm91cDogJzFfY29uZmlnJywgb3JkZXI6IDMwIH0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRhYnNCYXJDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IENvbmZpZ3VyZUVkaXRvclRhYnNBY3Rpb24uSUQsIHRpdGxlOiBsb2NhbGl6ZSgnY29uZmlndXJlVGFicycsIFwiQ29uZmlndXJlIFRhYnNcIikgfSwgZ3JvdXA6ICc5X2NvbmZpZ3VyZScsIG9yZGVyOiAxMCB9KTtcblxuLy8gRWRpdG9yIFRpdGxlIENvbnRleHQgTWVudVxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfRURJVE9SX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgnY2xvc2UnLCBcIkNsb3NlXCIpIH0sIGdyb3VwOiAnMV9jbG9zZScsIG9yZGVyOiAxMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX09USEVSX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplKCdjbG9zZU90aGVycycsIFwiQ2xvc2UgT3RoZXJzXCIpLCBwcmVjb25kaXRpb246IEVkaXRvckdyb3VwRWRpdG9yc0NvdW50Q29udGV4dC5ub3RFcXVhbHNUbygnMScpIH0sIGdyb3VwOiAnMV9jbG9zZScsIG9yZGVyOiAyMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX0VESVRPUlNfVE9fVEhFX1JJR0hUX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgnY2xvc2VSaWdodCcsIFwiQ2xvc2UgdG8gdGhlIFJpZ2h0XCIpLCBwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChBY3RpdmVFZGl0b3JMYXN0SW5Hcm91cENvbnRleHQudG9OZWdhdGVkKCksIE11bHRpcGxlRWRpdG9yc1NlbGVjdGVkSW5Hcm91cENvbnRleHQubmVnYXRlKCkpIH0sIGdyb3VwOiAnMV9jbG9zZScsIG9yZGVyOiAzMCwgd2hlbjogRWRpdG9yVGFic1Zpc2libGVDb250ZXh0IH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfU0FWRURfRURJVE9SU19DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ2Nsb3NlQWxsU2F2ZWQnLCBcIkNsb3NlIFNhdmVkXCIpIH0sIGdyb3VwOiAnMV9jbG9zZScsIG9yZGVyOiA0MCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplKCdjbG9zZUFsbCcsIFwiQ2xvc2UgQWxsXCIpIH0sIGdyb3VwOiAnMV9jbG9zZScsIG9yZGVyOiA1MCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IFJFT1BFTl9XSVRIX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgncmVvcGVuV2l0aCcsIFwiUmVvcGVuIEVkaXRvciBXaXRoLi4uXCIpIH0sIGdyb3VwOiAnMV9vcGVuJywgb3JkZXI6IDEwLCB3aGVuOiBBY3RpdmVFZGl0b3JBdmFpbGFibGVFZGl0b3JJZHNDb250ZXh0IH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogS0VFUF9FRElUT1JfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplKCdrZWVwT3BlbicsIFwiS2VlcCBPcGVuXCIpLCBwcmVjb25kaXRpb246IEFjdGl2ZUVkaXRvclBpbm5lZENvbnRleHQudG9OZWdhdGVkKCkgfSwgZ3JvdXA6ICczX3ByZXZpZXcnLCBvcmRlcjogMTAsIHdoZW46IENvbnRleHRLZXlFeHByLmhhcygnY29uZmlnLndvcmtiZW5jaC5lZGl0b3IuZW5hYmxlUHJldmlldycpIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogUElOX0VESVRPUl9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ3BpbicsIFwiUGluXCIpIH0sIGdyb3VwOiAnM19wcmV2aWV3Jywgb3JkZXI6IDIwLCB3aGVuOiBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0LnRvTmVnYXRlZCgpIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogVU5QSU5fRURJVE9SX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgndW5waW4nLCBcIlVucGluXCIpIH0sIGdyb3VwOiAnM19wcmV2aWV3Jywgb3JkZXI6IDIwLCB3aGVuOiBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0IH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogU1BMSVRfRURJVE9SLCB0aXRsZTogbG9jYWxpemUoJ3NwbGl0UmlnaHQnLCBcIlNwbGl0IFJpZ2h0XCIpIH0sIGdyb3VwOiAnNV9zcGxpdCcsIG9yZGVyOiAxMCwgd2hlbjogU3BsaXRFZGl0b3JzVmVydGljYWxseS5uZWdhdGUoKSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IFNQTElUX0VESVRPUiwgdGl0bGU6IGxvY2FsaXplKCdzcGxpdERvd24nLCBcIlNwbGl0IERvd25cIikgfSwgZ3JvdXA6ICc1X3NwbGl0Jywgb3JkZXI6IDEwLCB3aGVuOiBTcGxpdEVkaXRvcnNWZXJ0aWNhbGx5IH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgc3VibWVudTogTWVudUlkLkVkaXRvclNwbGl0TW92ZVN1Ym1lbnUsIHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRBbmRNb3ZlRWRpdG9yJywgXCJTcGxpdCAmIE1vdmVcIiksIGdyb3VwOiAnNV9zcGxpdCcsIG9yZGVyOiAxNSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IE1PVkVfRURJVE9SX0lOVE9fTkVXX1dJTkRPV19DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ21vdmVUb05ld1dpbmRvdycsIFwiTW92ZSBpbnRvIE5ldyBXaW5kb3dcIikgfSwgZ3JvdXA6ICc3X25ld193aW5kb3cnLCBvcmRlcjogMTAgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBDT1BZX0VESVRPUl9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplKCdjb3B5VG9OZXdXaW5kb3cnLCBcIkNvcHkgaW50byBOZXcgV2luZG93XCIpIH0sIGdyb3VwOiAnN19uZXdfd2luZG93Jywgb3JkZXI6IDIwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgc3VibWVudTogTWVudUlkLkVkaXRvclRpdGxlQ29udGV4dFNoYXJlLCB0aXRsZTogbG9jYWxpemUoJ3NoYXJlJywgXCJTaGFyZVwiKSwgZ3JvdXA6ICcxMV9zaGFyZScsIG9yZGVyOiAtMSwgd2hlbjogTXVsdGlwbGVFZGl0b3JzU2VsZWN0ZWRJbkdyb3VwQ29udGV4dC5uZWdhdGUoKSB9KTtcblxuLy8gRWRpdG9yIFRpdGxlIENvbnRleHQgTWVudTogU3BsaXQgJiBNb3ZlIEVkaXRvciBTdWJtZW51XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclNwbGl0TW92ZVN1Ym1lbnUsIHsgY29tbWFuZDogeyBpZDogU1BMSVRfRURJVE9SX1VQLCB0aXRsZTogbG9jYWxpemUoJ3NwbGl0VXAnLCBcIlNwbGl0IFVwXCIpIH0sIGdyb3VwOiAnMV9zcGxpdCcsIG9yZGVyOiAxMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBTUExJVF9FRElUT1JfRE9XTiwgdGl0bGU6IGxvY2FsaXplKCdzcGxpdERvd24nLCBcIlNwbGl0IERvd25cIikgfSwgZ3JvdXA6ICcxX3NwbGl0Jywgb3JkZXI6IDIwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JTcGxpdE1vdmVTdWJtZW51LCB7IGNvbW1hbmQ6IHsgaWQ6IFNQTElUX0VESVRPUl9MRUZULCB0aXRsZTogbG9jYWxpemUoJ3NwbGl0TGVmdCcsIFwiU3BsaXQgTGVmdFwiKSB9LCBncm91cDogJzFfc3BsaXQnLCBvcmRlcjogMzAgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclNwbGl0TW92ZVN1Ym1lbnUsIHsgY29tbWFuZDogeyBpZDogU1BMSVRfRURJVE9SX1JJR0hULCB0aXRsZTogbG9jYWxpemUoJ3NwbGl0UmlnaHQnLCBcIlNwbGl0IFJpZ2h0XCIpIH0sIGdyb3VwOiAnMV9zcGxpdCcsIG9yZGVyOiA0MCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBNT1ZFX0VESVRPUl9JTlRPX0FCT1ZFX0dST1VQLCB0aXRsZTogbG9jYWxpemUoJ21vdmVBYm92ZScsIFwiTW92ZSBBYm92ZVwiKSB9LCBncm91cDogJzJfbW92ZScsIG9yZGVyOiAxMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBNT1ZFX0VESVRPUl9JTlRPX0JFTE9XX0dST1VQLCB0aXRsZTogbG9jYWxpemUoJ21vdmVCZWxvdycsIFwiTW92ZSBCZWxvd1wiKSB9LCBncm91cDogJzJfbW92ZScsIG9yZGVyOiAyMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBNT1ZFX0VESVRPUl9JTlRPX0xFRlRfR1JPVVAsIHRpdGxlOiBsb2NhbGl6ZSgnbW92ZUxlZnQnLCBcIk1vdmUgTGVmdFwiKSB9LCBncm91cDogJzJfbW92ZScsIG9yZGVyOiAzMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBNT1ZFX0VESVRPUl9JTlRPX1JJR0hUX0dST1VQLCB0aXRsZTogbG9jYWxpemUoJ21vdmVSaWdodCcsIFwiTW92ZSBSaWdodFwiKSB9LCBncm91cDogJzJfbW92ZScsIG9yZGVyOiA0MCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBTUExJVF9FRElUT1JfSU5fR1JPVVAsIHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRJbkdyb3VwJywgXCJTcGxpdCBpbiBHcm91cFwiKSwgcHJlY29uZGl0aW9uOiBNdWx0aXBsZUVkaXRvcnNTZWxlY3RlZEluR3JvdXBDb250ZXh0Lm5lZ2F0ZSgpIH0sIGdyb3VwOiAnM19zcGxpdF9pbl9ncm91cCcsIG9yZGVyOiAxMCwgd2hlbjogQWN0aXZlRWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBKT0lOX0VESVRPUl9JTl9HUk9VUCwgdGl0bGU6IGxvY2FsaXplKCdqb2luSW5Hcm91cCcsIFwiSm9pbiBpbiBHcm91cFwiKSwgcHJlY29uZGl0aW9uOiBNdWx0aXBsZUVkaXRvcnNTZWxlY3RlZEluR3JvdXBDb250ZXh0Lm5lZ2F0ZSgpIH0sIGdyb3VwOiAnM19zcGxpdF9pbl9ncm91cCcsIG9yZGVyOiAxMCwgd2hlbjogU2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQgfSk7XG5cbi8vIEVkaXRvciBUaXRsZSBNZW51XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlLCB7IGNvbW1hbmQ6IHsgaWQ6IFRPR0dMRV9ESUZGX1NJREVfQllfU0lERSwgdGl0bGU6IGxvY2FsaXplKCdpbmxpbmVWaWV3JywgXCJJbmxpbmUgVmlld1wiKSwgdG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuZGlmZkVkaXRvci5yZW5kZXJTaWRlQnlTaWRlJywgZmFsc2UpIH0sIGdyb3VwOiAnMV9kaWZmJywgb3JkZXI6IDEwLCB3aGVuOiBDb250ZXh0S2V5RXhwci5vcihDb250ZXh0S2V5RXhwci5oYXMoJ2lzSW5EaWZmRWRpdG9yJyksIEFjdGl2ZUN1c3RvbUVkaXRvckRpZmZDYW5Ub2dnbGVMYXlvdXRDb250ZXh0KSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHsgY29tbWFuZDogeyBpZDogU0hPV19FRElUT1JTX0lOX0dST1VQLCB0aXRsZTogbG9jYWxpemUoJ3Nob3dPcGVuZWRFZGl0b3JzJywgXCJTaG93IE9wZW5lZCBFZGl0b3JzXCIpIH0sIGdyb3VwOiAnM19vcGVuJywgb3JkZXI6IDEwLCB3aGVuOiBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LnRvTmVnYXRlZCgpIC8qIG5vdCBhcHBsaWNhYmxlIHRvIG1vZGFsIGVkaXRvciAqLyB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ2Nsb3NlQWxsJywgXCJDbG9zZSBBbGxcIikgfSwgZ3JvdXA6ICc1X2Nsb3NlJywgb3JkZXI6IDEwLCB3aGVuOiBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LnRvTmVnYXRlZCgpIC8qIG5vdCBhcHBsaWNhYmxlIHRvIG1vZGFsIGVkaXRvciAqLyB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfU0FWRURfRURJVE9SU19DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ2Nsb3NlQWxsU2F2ZWQnLCBcIkNsb3NlIFNhdmVkXCIpIH0sIGdyb3VwOiAnNV9jbG9zZScsIG9yZGVyOiAyMCwgd2hlbjogRWRpdG9yUGFydE1vZGFsQ29udGV4dC50b05lZ2F0ZWQoKSAvKiBub3QgYXBwbGljYWJsZSB0byBtb2RhbCBlZGl0b3IgKi8gfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlLCB7IGNvbW1hbmQ6IHsgaWQ6IFRPR0dMRV9LRUVQX0VESVRPUlNfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplKCd0b2dnbGVQcmV2aWV3TW9kZScsIFwiRW5hYmxlIFByZXZpZXcgRWRpdG9yc1wiKSwgdG9nZ2xlZDogQ29udGV4dEtleUV4cHIuaGFzKCdjb25maWcud29ya2JlbmNoLmVkaXRvci5lbmFibGVQcmV2aWV3JykgfSwgZ3JvdXA6ICc3X3NldHRpbmdzJywgb3JkZXI6IDEwLCB3aGVuOiBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LnRvTmVnYXRlZCgpIC8qIG5vdCBhcHBsaWNhYmxlIHRvIG1vZGFsIGVkaXRvciAqLyB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHsgY29tbWFuZDogeyBpZDogVE9HR0xFX01BWElNSVpFX0VESVRPUl9HUk9VUCwgdGl0bGU6IGxvY2FsaXplKCdtYXhpbWl6ZUdyb3VwJywgXCJNYXhpbWl6ZSBHcm91cFwiKSB9LCBncm91cDogJzhfZ3JvdXBfb3BlcmF0aW9ucycsIG9yZGVyOiA1LCB3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yUGFydE1heGltaXplZEVkaXRvckdyb3VwQ29udGV4dC5uZWdhdGUoKSwgRWRpdG9yUGFydE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dCkgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlLCB7IGNvbW1hbmQ6IHsgaWQ6IFRPR0dMRV9NQVhJTUlaRV9FRElUT1JfR1JPVVAsIHRpdGxlOiBsb2NhbGl6ZSgndW5tYXhpbWl6ZUdyb3VwJywgXCJVbm1heGltaXplIEdyb3VwXCIpIH0sIGdyb3VwOiAnOF9ncm91cF9vcGVyYXRpb25zJywgb3JkZXI6IDUsIHdoZW46IEVkaXRvclBhcnRNYXhpbWl6ZWRFZGl0b3JHcm91cENvbnRleHQgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlLCB7IGNvbW1hbmQ6IHsgaWQ6IFRPR0dMRV9MT0NLX0dST1VQX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgnbG9ja0dyb3VwJywgXCJMb2NrIEdyb3VwXCIpLCB0b2dnbGVkOiBBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQgfSwgZ3JvdXA6ICc4X2dyb3VwX29wZXJhdGlvbnMnLCBvcmRlcjogMTAsIHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKCksIEVkaXRvclBhcnRNb2RhbENvbnRleHQudG9OZWdhdGVkKCkpIC8qIGFscmVhZHkgYSBwcmltYXJ5IGFjdGlvbiBmb3IgYXV4IHdpbmRvd3MsIG5vdCBhcHBsaWNhYmxlIHRvIG1vZGFsIGVkaXRvciAqLyB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHsgY29tbWFuZDogeyBpZDogQ29uZmlndXJlRWRpdG9yQWN0aW9uLklELCB0aXRsZTogbG9jYWxpemUoJ2NvbmZpZ3VyZUVkaXRvcnMnLCBcIkNvbmZpZ3VyZSBFZGl0b3JzXCIpIH0sIGdyb3VwOiAnOV9jb25maWd1cmUnLCBvcmRlcjogMTAsIHdoZW46IEVkaXRvclBhcnRNb2RhbENvbnRleHQudG9OZWdhdGVkKCkgLyogbm90IGFwcGxpY2FibGUgdG8gbW9kYWwgZWRpdG9yICovIH0pO1xuXG5mdW5jdGlvbiBhcHBlbmRFZGl0b3JUb29sSXRlbShwcmltYXJ5OiBJQ29tbWFuZEFjdGlvbiwgd2hlbjogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQsIG9yZGVyOiBudW1iZXIsIGFsdGVybmF0aXZlPzogSUNvbW1hbmRBY3Rpb24sIHByZWNvbmRpdGlvbj86IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkLCBlbmFibGVJbkNvbXBhY3RNb2RlPzogYm9vbGVhbiwgZW5hYmxlSW5Nb2RhbE1vZGU/OiBib29sZWFuKTogdm9pZCB7XG5cdGNvbnN0IGl0ZW06IElNZW51SXRlbSA9IHtcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogcHJpbWFyeS5pZCxcblx0XHRcdHRpdGxlOiBwcmltYXJ5LnRpdGxlLFxuXHRcdFx0aWNvbjogcHJpbWFyeS5pY29uLFxuXHRcdFx0dG9nZ2xlZDogcHJpbWFyeS50b2dnbGVkLFxuXHRcdFx0cHJlY29uZGl0aW9uXG5cdFx0fSxcblx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdHdoZW4sXG5cdFx0b3JkZXJcblx0fTtcblxuXHRpZiAoYWx0ZXJuYXRpdmUpIHtcblx0XHRpdGVtLmFsdCA9IHtcblx0XHRcdGlkOiBhbHRlcm5hdGl2ZS5pZCxcblx0XHRcdHRpdGxlOiBhbHRlcm5hdGl2ZS50aXRsZSxcblx0XHRcdGljb246IGFsdGVybmF0aXZlLmljb25cblx0XHR9O1xuXHR9XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZSwgaXRlbSk7XG5cdGlmIChlbmFibGVJbkNvbXBhY3RNb2RlKSB7XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21wYWN0V2luZG93RWRpdG9yVGl0bGUsIGl0ZW0pO1xuXHR9XG5cdGlmIChlbmFibGVJbk1vZGFsTW9kZSkge1xuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTW9kYWxFZGl0b3JFZGl0b3JUaXRsZSwgaXRlbSk7XG5cdH1cbn1cblxuY29uc3QgU1BMSVRfT1JERVIgPSAxMDAwMDA7ICAvLyB0b3dhcmRzIHRoZSBlbmRcbmNvbnN0IENMT1NFX09SREVSID0gMTAwMDAwMDsgLy8gdG93YXJkcyB0aGUgZmFyIGVuZFxuXG4vLyBFZGl0b3IgVGl0bGUgTWVudTogU3BsaXQgRWRpdG9yXG4vLyBJbiB0aGUgYWdlbnRzIHdpbmRvdyB0aGUgc3BsaXQgZWRpdG9yIGFjdGlvbiBpcyBtb3ZlZCBpbnRvIHRoZSBvdmVyZmxvdyAoLi4uKVxuLy8gbWVudSAoc2VlIGJlbG93KSByYXRoZXIgdGhhbiBiZWluZyBzaG93biBhcyBhIHByaW1hcnkgdG9vbGJhciBpY29uLlxuYXBwZW5kRWRpdG9yVG9vbEl0ZW0oXG5cdHtcblx0XHRpZDogU1BMSVRfRURJVE9SLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRFZGl0b3JSaWdodCcsIFwiU3BsaXQgRWRpdG9yIFJpZ2h0XCIpLFxuXHRcdGljb246IENvZGljb24uc3BsaXRIb3Jpem9udGFsXG5cdH0sXG5cdENvbnRleHRLZXlFeHByLmFuZChTcGxpdEVkaXRvcnNWZXJ0aWNhbGx5Lm5lZ2F0ZSgpLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFNQTElUX09SREVSLFxuXHR7XG5cdFx0aWQ6IFNQTElUX0VESVRPUl9ET1dOLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRFZGl0b3JEb3duJywgXCJTcGxpdCBFZGl0b3IgRG93blwiKSxcblx0XHRpY29uOiBDb2RpY29uLnNwbGl0VmVydGljYWxcblx0fVxuKTtcblxuYXBwZW5kRWRpdG9yVG9vbEl0ZW0oXG5cdHtcblx0XHRpZDogU1BMSVRfRURJVE9SLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRFZGl0b3JEb3duJywgXCJTcGxpdCBFZGl0b3IgRG93blwiKSxcblx0XHRpY29uOiBDb2RpY29uLnNwbGl0VmVydGljYWxcblx0fSxcblx0Q29udGV4dEtleUV4cHIuYW5kKFNwbGl0RWRpdG9yc1ZlcnRpY2FsbHksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0U1BMSVRfT1JERVIsXG5cdHtcblx0XHRpZDogU1BMSVRfRURJVE9SX1JJR0hULFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRFZGl0b3JSaWdodCcsIFwiU3BsaXQgRWRpdG9yIFJpZ2h0XCIpLFxuXHRcdGljb246IENvZGljb24uc3BsaXRIb3Jpem9udGFsXG5cdH1cbik7XG5cbi8vIEFnZW50cyB3aW5kb3c6IHNob3cgU3BsaXQgRWRpdG9yIGluIHRoZSBlZGl0b3IgdGl0bGUgb3ZlcmZsb3cgKC4uLikgbWVudVxuLy8gaW5zdGVhZCBvZiBhcyBhIHByaW1hcnkgdG9vbGJhciBpY29uLiBNaXJyb3IgdGhlIG9yaWVudGF0aW9uIGhhbmRsaW5nIG9mIHRoZVxuLy8gcHJpbWFyeSB0b29sYmFyIGl0ZW1zIHNvIHRoZSBsYWJlbC9pY29uIG1hdGNoIHRoZSBjb25maWd1cmVkIHNwbGl0IGRpcmVjdGlvbi5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTUExJVF9FRElUT1IsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdzcGxpdEVkaXRvclJpZ2h0JywgXCJTcGxpdCBFZGl0b3IgUmlnaHRcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5zcGxpdEhvcml6b250YWxcblx0fSxcblx0Z3JvdXA6ICc0X3NwbGl0Jyxcblx0b3JkZXI6IDEwLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIFNwbGl0RWRpdG9yc1ZlcnRpY2FsbHkubmVnYXRlKCkpXG59KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTUExJVF9FRElUT1IsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdzcGxpdEVkaXRvckRvd24nLCBcIlNwbGl0IEVkaXRvciBEb3duXCIpLFxuXHRcdGljb246IENvZGljb24uc3BsaXRWZXJ0aWNhbFxuXHR9LFxuXHRncm91cDogJzRfc3BsaXQnLFxuXHRvcmRlcjogMTAsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgU3BsaXRFZGl0b3JzVmVydGljYWxseSlcbn0pO1xuXG4vLyBTaWRlIGJ5IHNpZGU6IGxheW91dFxuYXBwZW5kRWRpdG9yVG9vbEl0ZW0oXG5cdHtcblx0XHRpZDogVE9HR0xFX1NQTElUX0VESVRPUl9JTl9HUk9VUF9MQVlPVVQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCd0b2dnbGVTcGxpdEVkaXRvckluR3JvdXBMYXlvdXQnLCBcIlRvZ2dsZSBMYXlvdXRcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5lZGl0b3JMYXlvdXRcblx0fSxcblx0U2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQsXG5cdFNQTElUX09SREVSIC0gMSwgLy8gbGVmdCB0byBzcGxpdCBhY3Rpb25zXG4pO1xuXG4vLyBFZGl0b3IgVGl0bGUgTWVudTogQ2xvc2UgKHRhYnMgZGlzYWJsZWQsIG5vcm1hbCBlZGl0b3IpXG5hcHBlbmRFZGl0b3JUb29sSXRlbShcblx0e1xuXHRcdGlkOiBDTE9TRV9FRElUT1JfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2Nsb3NlJywgXCJDbG9zZVwiKSxcblx0XHRpY29uOiBDb2RpY29uLmNsb3NlXG5cdH0sXG5cdENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQudG9OZWdhdGVkKCksIEFjdGl2ZUVkaXRvckRpcnR5Q29udGV4dC50b05lZ2F0ZWQoKSwgQWN0aXZlRWRpdG9yU3RpY2t5Q29udGV4dC50b05lZ2F0ZWQoKSksXG5cdENMT1NFX09SREVSLFxuXHR7XG5cdFx0aWQ6IENMT1NFX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2Nsb3NlQWxsJywgXCJDbG9zZSBBbGxcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5jbG9zZUFsbFxuXHR9XG4pO1xuXG4vLyBFZGl0b3IgVGl0bGUgTWVudTogQ2xvc2UgKHRhYnMgZGlzYWJsZWQsIGRpcnR5IGVkaXRvcilcbmFwcGVuZEVkaXRvclRvb2xJdGVtKFxuXHR7XG5cdFx0aWQ6IENMT1NFX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2xvc2UnLCBcIkNsb3NlXCIpLFxuXHRcdGljb246IENvZGljb24uY2xvc2VEaXJ0eVxuXHR9LFxuXHRDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yVGFic1Zpc2libGVDb250ZXh0LnRvTmVnYXRlZCgpLCBBY3RpdmVFZGl0b3JEaXJ0eUNvbnRleHQsIEFjdGl2ZUVkaXRvclN0aWNreUNvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRDTE9TRV9PUkRFUixcblx0e1xuXHRcdGlkOiBDTE9TRV9FRElUT1JTX0lOX0dST1VQX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjbG9zZUFsbCcsIFwiQ2xvc2UgQWxsXCIpLFxuXHRcdGljb246IENvZGljb24uY2xvc2VBbGxcblx0fVxuKTtcblxuLy8gRWRpdG9yIFRpdGxlIE1lbnU6IENsb3NlICh0YWJzIGRpc2FibGVkLCBzdGlja3kgZWRpdG9yKVxuYXBwZW5kRWRpdG9yVG9vbEl0ZW0oXG5cdHtcblx0XHRpZDogVU5QSU5fRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCd1bnBpbicsIFwiVW5waW5cIiksXG5cdFx0aWNvbjogQ29kaWNvbi5waW5uZWRcblx0fSxcblx0Q29udGV4dEtleUV4cHIuYW5kKEVkaXRvclRhYnNWaXNpYmxlQ29udGV4dC50b05lZ2F0ZWQoKSwgQWN0aXZlRWRpdG9yRGlydHlDb250ZXh0LnRvTmVnYXRlZCgpLCBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0KSxcblx0Q0xPU0VfT1JERVIsXG5cdHtcblx0XHRpZDogQ0xPU0VfRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjbG9zZScsIFwiQ2xvc2VcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5jbG9zZVxuXHR9XG4pO1xuXG4vLyBFZGl0b3IgVGl0bGUgTWVudTogQ2xvc2UgKHRhYnMgZGlzYWJsZWQsIGRpcnR5ICYgc3RpY2t5IGVkaXRvcilcbmFwcGVuZEVkaXRvclRvb2xJdGVtKFxuXHR7XG5cdFx0aWQ6IFVOUElOX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgndW5waW4nLCBcIlVucGluXCIpLFxuXHRcdGljb246IENvZGljb24ucGlubmVkRGlydHlcblx0fSxcblx0Q29udGV4dEtleUV4cHIuYW5kKEVkaXRvclRhYnNWaXNpYmxlQ29udGV4dC50b05lZ2F0ZWQoKSwgQWN0aXZlRWRpdG9yRGlydHlDb250ZXh0LCBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0KSxcblx0Q0xPU0VfT1JERVIsXG5cdHtcblx0XHRpZDogQ0xPU0VfRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjbG9zZScsIFwiQ2xvc2VcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5jbG9zZVxuXHR9XG4pO1xuXG4vLyBMb2NrIEdyb3VwOiBvbmx5IG9uIGF1eGlsaWFyeSB3aW5kb3cgYW5kIHdoZW4gZ3JvdXAgaXMgdW5sb2NrZWRcbmFwcGVuZEVkaXRvclRvb2xJdGVtKFxuXHR7XG5cdFx0aWQ6IExPQ0tfR1JPVVBfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2xvY2tFZGl0b3JHcm91cCcsIFwiTG9jayBHcm91cFwiKSxcblx0XHRpY29uOiBDb2RpY29uLnVubG9ja1xuXHR9LFxuXHRDb250ZXh0S2V5RXhwci5hbmQoSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LCBBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRDTE9TRV9PUkRFUiAtIDEsIC8vIGltbWVkaWF0ZWx5IHRvIHRoZSBsZWZ0IG9mIGNsb3NlIGFjdGlvblxuKTtcblxuLy8gVW5sb2NrIEdyb3VwOiBvbmx5IHdoZW4gZ3JvdXAgaXMgbG9ja2VkXG5hcHBlbmRFZGl0b3JUb29sSXRlbShcblx0e1xuXHRcdGlkOiBVTkxPQ0tfR1JPVVBfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ3VubG9ja0VkaXRvckdyb3VwJywgXCJVbmxvY2sgR3JvdXBcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5sb2NrLFxuXHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLnRydWUoKVxuXHR9LFxuXHRBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQsXG5cdENMT1NFX09SREVSIC0gMSwgLy8gaW1tZWRpYXRlbHkgdG8gdGhlIGxlZnQgb2YgY2xvc2UgYWN0aW9uXG4pO1xuXG4vLyBEaWZmIEVkaXRvciBUaXRsZSBNZW51OiBQcmV2aW91cyBDaGFuZ2VcbmNvbnN0IHByZXZpb3VzQ2hhbmdlSWNvbiA9IHJlZ2lzdGVySWNvbignZGlmZi1lZGl0b3ItcHJldmlvdXMtY2hhbmdlJywgQ29kaWNvbi5hcnJvd1VwLCBsb2NhbGl6ZSgncHJldmlvdXNDaGFuZ2VJY29uJywgJ0ljb24gZm9yIHRoZSBwcmV2aW91cyBjaGFuZ2UgYWN0aW9uIGluIHRoZSBkaWZmIGVkaXRvci4nKSk7XG5hcHBlbmRFZGl0b3JUb29sSXRlbShcblx0e1xuXHRcdGlkOiBHT1RPX1BSRVZJT1VTX0NIQU5HRSxcblx0XHR0aXRsZTogbG9jYWxpemUoJ25hdmlnYXRlLnByZXYubGFiZWwnLCBcIlByZXZpb3VzIENoYW5nZVwiKSxcblx0XHRpY29uOiBwcmV2aW91c0NoYW5nZUljb25cblx0fSxcblx0VGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0LFxuXHQxMCxcblx0dW5kZWZpbmVkLFxuXHRFZGl0b3JDb250ZXh0S2V5cy5oYXNDaGFuZ2VzLFxuXHR0cnVlLFxuXHR0cnVlXG4pO1xuXG4vLyBEaWZmIEVkaXRvciBUaXRsZSBNZW51OiBOZXh0IENoYW5nZVxuY29uc3QgbmV4dENoYW5nZUljb24gPSByZWdpc3Rlckljb24oJ2RpZmYtZWRpdG9yLW5leHQtY2hhbmdlJywgQ29kaWNvbi5hcnJvd0Rvd24sIGxvY2FsaXplKCduZXh0Q2hhbmdlSWNvbicsICdJY29uIGZvciB0aGUgbmV4dCBjaGFuZ2UgYWN0aW9uIGluIHRoZSBkaWZmIGVkaXRvci4nKSk7XG5hcHBlbmRFZGl0b3JUb29sSXRlbShcblx0e1xuXHRcdGlkOiBHT1RPX05FWFRfQ0hBTkdFLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnbmF2aWdhdGUubmV4dC5sYWJlbCcsIFwiTmV4dCBDaGFuZ2VcIiksXG5cdFx0aWNvbjogbmV4dENoYW5nZUljb25cblx0fSxcblx0VGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0LFxuXHQxMSxcblx0dW5kZWZpbmVkLFxuXHRFZGl0b3JDb250ZXh0S2V5cy5oYXNDaGFuZ2VzLFxuXHR0cnVlLFxuXHR0cnVlXG4pO1xuXG4vLyBEaWZmIEVkaXRvciBUaXRsZSBNZW51OiBTd2FwIFNpZGVzXG5hcHBlbmRFZGl0b3JUb29sSXRlbShcblx0e1xuXHRcdGlkOiBESUZGX1NXQVBfU0lERVMsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdzd2FwRGlmZlNpZGVzJywgXCJTd2FwIExlZnQgYW5kIFJpZ2h0IFNpZGVcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5hcnJvd1N3YXBcblx0fSxcblx0Q29udGV4dEtleUV4cHIuYW5kKFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dCwgQWN0aXZlQ29tcGFyZUVkaXRvckNhblN3YXBDb250ZXh0KSxcblx0MTUsXG5cdHVuZGVmaW5lZCxcblx0dW5kZWZpbmVkXG4pO1xuXG4vLyBDdXN0b20gVGV4dCBEaWZmIEVkaXRvciBUaXRsZSBNZW51OiBSZW9wZW4gYXMgVGV4dFxuYXBwZW5kRWRpdG9yVG9vbEl0ZW0oXG5cdHtcblx0XHRpZDogUmVPcGVuSW5UZXh0RWRpdG9yQWN0aW9uLklELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVvcGVuQXNUZXh0JywgXCJSZW9wZW4gYXMgVGV4dFwiKSxcblx0XHRpY29uOiBDb2RpY29uLmZpbGVDb2RlXG5cdH0sXG5cdEFjdGl2ZUN1c3RvbUVkaXRvclRleHREaWZmQ29udGV4dCxcblx0MTYsXG5cdHVuZGVmaW5lZCxcblx0dW5kZWZpbmVkLFxuXHR1bmRlZmluZWQsXG5cdHRydWVcbik7XG5cbmNvbnN0IHRvZ2dsZVdoaXRlc3BhY2UgPSByZWdpc3Rlckljb24oJ2RpZmYtZWRpdG9yLXRvZ2dsZS13aGl0ZXNwYWNlJywgQ29kaWNvbi53aGl0ZXNwYWNlLCBsb2NhbGl6ZSgndG9nZ2xlV2hpdGVzcGFjZScsICdJY29uIGZvciB0aGUgdG9nZ2xlIHdoaXRlc3BhY2UgYWN0aW9uIGluIHRoZSBkaWZmIGVkaXRvci4nKSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogVE9HR0xFX0RJRkZfSUdOT1JFX1RSSU1fV0hJVEVTUEFDRSxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2lnbm9yZVRyaW1XaGl0ZXNwYWNlLmxhYmVsJywgXCJTaG93IExlYWRpbmcvVHJhaWxpbmcgV2hpdGVzcGFjZSBEaWZmZXJlbmNlc1wiKSxcblx0XHRpY29uOiB0b2dnbGVXaGl0ZXNwYWNlLFxuXHRcdHByZWNvbmRpdGlvbjogVGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0LFxuXHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmRpZmZFZGl0b3IuaWdub3JlVHJpbVdoaXRlc3BhY2UnLCBmYWxzZSksXG5cdH0sXG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdHdoZW46IFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dCxcblx0b3JkZXI6IDIwLFxufSk7XG5cbi8vIEVkaXRvciBDb21tYW5kcyBmb3IgQ29tbWFuZCBQYWxldHRlXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IEtFRVBfRURJVE9SX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZTIoJ2tlZXBFZGl0b3InLCAnS2VlcCBFZGl0b3InKSwgY2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyB9LCB3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoJ2NvbmZpZy53b3JrYmVuY2guZWRpdG9yLmVuYWJsZVByZXZpZXcnKSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHsgY29tbWFuZDogeyBpZDogUElOX0VESVRPUl9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUyKCdwaW5FZGl0b3InLCAnUGluIEVkaXRvcicpLCBjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3IH0gfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IFVOUElOX0VESVRPUl9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUyKCd1bnBpbkVkaXRvcicsICdVbnBpbiBFZGl0b3InKSwgY2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyB9IH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgeyBjb21tYW5kOiB7IGlkOiBDTE9TRV9FRElUT1JfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplMignY2xvc2VFZGl0b3InLCAnQ2xvc2UgRWRpdG9yJyksIGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcgfSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfUElOTkVEX0VESVRPUl9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUyKCdjbG9zZVBpbm5lZEVkaXRvcicsICdDbG9zZSBQaW5uZWQgRWRpdG9yJyksIGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcgfSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUyKCdjbG9zZUVkaXRvcnNJbkdyb3VwJywgJ0Nsb3NlIEFsbCBFZGl0b3JzIGluIEdyb3VwJyksIGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcgfSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfU0FWRURfRURJVE9SU19DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUyKCdjbG9zZVNhdmVkRWRpdG9ycycsICdDbG9zZSBTYXZlZCBFZGl0b3JzIGluIEdyb3VwJyksIGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcgfSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfT1RIRVJfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUyKCdjbG9zZU90aGVyRWRpdG9ycycsICdDbG9zZSBPdGhlciBFZGl0b3JzIGluIEdyb3VwJyksIGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcgfSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfRURJVE9SU19UT19USEVfUklHSFRfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplMignY2xvc2VSaWdodEVkaXRvcnMnLCAnQ2xvc2UgRWRpdG9ycyB0byB0aGUgUmlnaHQgaW4gR3JvdXAnKSwgY2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyB9LCB3aGVuOiBBY3RpdmVFZGl0b3JMYXN0SW5Hcm91cENvbnRleHQudG9OZWdhdGVkKCkgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX0VESVRPUlNfQU5EX0dST1VQX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZTIoJ2Nsb3NlRWRpdG9yR3JvdXAnLCAnQ2xvc2UgRWRpdG9yIEdyb3VwJyksIGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcgfSwgd2hlbjogTXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0IH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgeyBjb21tYW5kOiB7IGlkOiBSRU9QRU5fV0lUSF9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUyKCdyZW9wZW5XaXRoJywgXCJSZW9wZW4gRWRpdG9yIFdpdGguLi5cIiksIGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcgfSwgd2hlbjogQWN0aXZlRWRpdG9yQXZhaWxhYmxlRWRpdG9ySWRzQ29udGV4dCB9KTtcblxuLy8gRmlsZSBtZW51XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJSZWNlbnRNZW51LCB7XG5cdGdyb3VwOiAnMV9lZGl0b3InLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFJlb3BlbkNsb3NlZEVkaXRvckFjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVJlb3BlbkNsb3NlZEVkaXRvcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlb3BlbiBDbG9zZWQgRWRpdG9yXCIpLFxuXHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuaGFzKCdjYW5SZW9wZW5DbG9zZWRFZGl0b3InKVxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclJlY2VudE1lbnUsIHtcblx0Z3JvdXA6ICd6X2NsZWFyJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBDbGVhclJlY2VudEZpbGVzQWN0aW9uLklELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pQ2xlYXJSZWNlbnRPcGVuJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ2xlYXIgUmVjZW50bHkgT3BlbmVkLi4uXCIpXG5cdH0sXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0dGl0bGU6IGxvY2FsaXplKCdtaVNoYXJlJywgXCJTaGFyZVwiKSxcblx0c3VibWVudTogTWVudUlkLk1lbnViYXJTaGFyZSxcblx0Z3JvdXA6ICc0NV9zaGFyZScsXG5cdG9yZGVyOiAxLFxuXHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKVxufSk7XG5cbi8vIExheW91dCBtZW51XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJWaWV3TWVudSwge1xuXHRncm91cDogJzJfYXBwZWFyYW5jZScsXG5cdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRWRpdG9yTGF5b3V0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkVkaXRvciAmJkxheW91dFwiKSxcblx0c3VibWVudTogTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LFxuXHRvcmRlcjogMixcblx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LCB7XG5cdGdyb3VwOiAnMV9zcGxpdCcsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU1BMSVRfRURJVE9SX1VQLFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5sb2NhbGl6ZTIoJ21pU3BsaXRFZGl0b3JVcFdpdGhvdXRNbmVtb25pYycsIFwiU3BsaXQgVXBcIiksXG5cdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pU3BsaXRFZGl0b3JVcCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJTcGxpdCAmJlVwXCIpLFxuXHRcdH1cblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LCB7XG5cdGdyb3VwOiAnMV9zcGxpdCcsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU1BMSVRfRURJVE9SX0RPV04sXG5cdFx0dGl0bGU6IHtcblx0XHRcdC4uLmxvY2FsaXplMignbWlTcGxpdEVkaXRvckRvd25XaXRob3V0TW5lbW9uaWMnLCBcIlNwbGl0IERvd25cIiksXG5cdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pU3BsaXRFZGl0b3JEb3duJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlNwbGl0ICYmRG93blwiKSxcblx0XHR9XG5cdH0sXG5cdG9yZGVyOiAyXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSwge1xuXHRncm91cDogJzFfc3BsaXQnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFNQTElUX0VESVRPUl9MRUZULFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5sb2NhbGl6ZTIoJ21pU3BsaXRFZGl0b3JMZWZ0V2l0aG91dE1uZW1vbmljJywgXCJTcGxpdCBMZWZ0XCIpLFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVNwbGl0RWRpdG9yTGVmdCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJTcGxpdCAmJkxlZnRcIiksXG5cdFx0fVxuXHR9LFxuXHRvcmRlcjogM1xufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckxheW91dE1lbnUsIHtcblx0Z3JvdXA6ICcxX3NwbGl0Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTUExJVF9FRElUT1JfUklHSFQsXG5cdFx0dGl0bGU6IHtcblx0XHRcdC4uLmxvY2FsaXplMignbWlTcGxpdEVkaXRvclJpZ2h0V2l0aG91dE1uZW1vbmljJywgXCJTcGxpdCBSaWdodFwiKSxcblx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlTcGxpdEVkaXRvclJpZ2h0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlNwbGl0ICYmUmlnaHRcIiksXG5cdFx0fVxuXHR9LFxuXHRvcmRlcjogNFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckxheW91dE1lbnUsIHtcblx0Z3JvdXA6ICcyX3NwbGl0X2luX2dyb3VwJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTUExJVF9FRElUT1JfSU5fR1JPVVAsXG5cdFx0dGl0bGU6IHtcblx0XHRcdC4uLmxvY2FsaXplMignbWlTcGxpdEVkaXRvckluR3JvdXBXaXRob3V0TW5lbW9uaWMnLCBcIlNwbGl0IGluIEdyb3VwXCIpLFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVNwbGl0RWRpdG9ySW5Hcm91cCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJTcGxpdCBpbiAmJkdyb3VwXCIpLFxuXHRcdH1cblx0fSxcblx0d2hlbjogQWN0aXZlRWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dCxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LCB7XG5cdGdyb3VwOiAnMl9zcGxpdF9pbl9ncm91cCcsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogSk9JTl9FRElUT1JfSU5fR1JPVVAsXG5cdFx0dGl0bGU6IHtcblx0XHRcdC4uLmxvY2FsaXplMignbWlKb2luRWRpdG9ySW5Hcm91cFdpdGhvdXRNbmVtb25pYycsIFwiSm9pbiBpbiBHcm91cFwiKSxcblx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlKb2luRWRpdG9ySW5Hcm91cCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJKb2luIGluICYmR3JvdXBcIiksXG5cdFx0fVxuXHR9LFxuXHR3aGVuOiBTaWRlQnlTaWRlRWRpdG9yQWN0aXZlQ29udGV4dCxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LCB7XG5cdGdyb3VwOiAnM19uZXdfd2luZG93Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBNT1ZFX0VESVRPUl9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCxcblx0XHR0aXRsZToge1xuXHRcdFx0Li4ubG9jYWxpemUyKCdtb3ZlRWRpdG9yVG9OZXdXaW5kb3cnLCBcIk1vdmUgRWRpdG9yIGludG8gTmV3IFdpbmRvd1wiKSxcblx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlNb3ZlRWRpdG9yVG9OZXdXaW5kb3cnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZNb3ZlIEVkaXRvciBpbnRvIE5ldyBXaW5kb3dcIiksXG5cdFx0fVxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckxheW91dE1lbnUsIHtcblx0Z3JvdXA6ICczX25ld193aW5kb3cnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENPUFlfRURJVE9SX0lOVE9fTkVXX1dJTkRPV19DT01NQU5EX0lELFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5sb2NhbGl6ZTIoJ2NvcHlFZGl0b3JUb05ld1dpbmRvdycsIFwiQ29weSBFZGl0b3IgaW50byBOZXcgV2luZG93XCIpLFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaUNvcHlFZGl0b3JUb05ld1dpbmRvdycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNvcHkgRWRpdG9yIGludG8gTmV3IFdpbmRvd1wiKSxcblx0XHR9XG5cdH0sXG5cdG9yZGVyOiAyXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSwge1xuXHRncm91cDogJzRfbGF5b3V0cycsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRWRpdG9yTGF5b3V0U2luZ2xlQWN0aW9uLklELFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5sb2NhbGl6ZTIoJ21pU2luZ2xlQ29sdW1uRWRpdG9yTGF5b3V0V2l0aG91dE1uZW1vbmljJywgXCJTaW5nbGVcIiksXG5cdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pU2luZ2xlQ29sdW1uRWRpdG9yTGF5b3V0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmU2luZ2xlXCIpLFxuXHRcdH1cblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LCB7XG5cdGdyb3VwOiAnNF9sYXlvdXRzJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBFZGl0b3JMYXlvdXRUd29Db2x1bW5zQWN0aW9uLklELFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5sb2NhbGl6ZTIoJ21pVHdvQ29sdW1uc0VkaXRvckxheW91dFdpdGhvdXRNbmVtb25pYycsIFwiVHdvIENvbHVtbnNcIiksXG5cdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pVHdvQ29sdW1uc0VkaXRvckxheW91dCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlR3byBDb2x1bW5zXCIpLFxuXHRcdH1cblx0fSxcblx0b3JkZXI6IDNcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LCB7XG5cdGdyb3VwOiAnNF9sYXlvdXRzJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBFZGl0b3JMYXlvdXRUaHJlZUNvbHVtbnNBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IHtcblx0XHRcdC4uLmxvY2FsaXplMignbWlUaHJlZUNvbHVtbnNFZGl0b3JMYXlvdXRXaXRob3V0TW5lbW9uaWMnLCBcIlRocmVlIENvbHVtbnNcIiksXG5cdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pVGhyZWVDb2x1bW5zRWRpdG9yTGF5b3V0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlQmJmhyZWUgQ29sdW1uc1wiKSxcblx0XHR9XG5cdH0sXG5cdG9yZGVyOiA0XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSwge1xuXHRncm91cDogJzRfbGF5b3V0cycsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRWRpdG9yTGF5b3V0VHdvUm93c0FjdGlvbi5JRCxcblx0XHR0aXRsZToge1xuXHRcdFx0Li4ubG9jYWxpemUyKCdtaVR3b1Jvd3NFZGl0b3JMYXlvdXRXaXRob3V0TW5lbW9uaWMnLCBcIlR3byBSb3dzXCIpLFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVR3b1Jvd3NFZGl0b3JMYXlvdXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiVCYmd28gUm93c1wiKSxcblx0XHR9XG5cdH0sXG5cdG9yZGVyOiA1XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSwge1xuXHRncm91cDogJzRfbGF5b3V0cycsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRWRpdG9yTGF5b3V0VGhyZWVSb3dzQWN0aW9uLklELFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5sb2NhbGl6ZTIoJ21pVGhyZWVSb3dzRWRpdG9yTGF5b3V0V2l0aG91dE1uZW1vbmljJywgXCJUaHJlZSBSb3dzXCIpLFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVRocmVlUm93c0VkaXRvckxheW91dCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJUaHJlZSAmJlJvd3NcIiksXG5cdFx0fVxuXHR9LFxuXHRvcmRlcjogNlxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckxheW91dE1lbnUsIHtcblx0Z3JvdXA6ICc0X2xheW91dHMnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IEVkaXRvckxheW91dFR3b0J5VHdvR3JpZEFjdGlvbi5JRCxcblx0XHR0aXRsZToge1xuXHRcdFx0Li4ubG9jYWxpemUyKCdtaVR3b0J5VHdvR3JpZEVkaXRvckxheW91dFdpdGhvdXRNbmVtb25pYycsIFwiR3JpZCAoMngyKVwiKSxcblx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlUd29CeVR3b0dyaWRFZGl0b3JMYXlvdXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZHcmlkICgyeDIpXCIpLFxuXHRcdH1cblx0fSxcblx0b3JkZXI6IDdcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LCB7XG5cdGdyb3VwOiAnNF9sYXlvdXRzJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBFZGl0b3JMYXlvdXRUd29Sb3dzUmlnaHRBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IHtcblx0XHRcdC4uLmxvY2FsaXplMignbWlUd29Sb3dzUmlnaHRFZGl0b3JMYXlvdXRXaXRob3V0TW5lbW9uaWMnLCBcIlR3byBSb3dzIFJpZ2h0XCIpLFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVR3b1Jvd3NSaWdodEVkaXRvckxheW91dCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJUd28gUiYmb3dzIFJpZ2h0XCIpLFxuXHRcdH1cblx0fSxcblx0b3JkZXI6IDhcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LCB7XG5cdGdyb3VwOiAnNF9sYXlvdXRzJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBFZGl0b3JMYXlvdXRUd29Db2x1bW5zQm90dG9tQWN0aW9uLklELFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5sb2NhbGl6ZTIoJ21pVHdvQ29sdW1uc0JvdHRvbUVkaXRvckxheW91dFdpdGhvdXRNbmVtb25pYycsIFwiVHdvIENvbHVtbnMgQm90dG9tXCIpLFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVR3b0NvbHVtbnNCb3R0b21FZGl0b3JMYXlvdXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiVHdvICYmQ29sdW1ucyBCb3R0b21cIiksXG5cdFx0fVxuXHR9LFxuXHRvcmRlcjogOVxufSk7XG5cbi8vIE1haW4gTWVudSBCYXIgQ29udHJpYnV0aW9uczpcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyR29NZW51LCB7XG5cdGdyb3VwOiAnMV9oaXN0b3J5X25hdicsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubmF2aWdhdGVUb0xhc3RFZGl0TG9jYXRpb24nLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pTGFzdEVkaXRMb2NhdGlvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkxhc3QgRWRpdCBMb2NhdGlvblwiKSxcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmhhcygnY2FuTmF2aWdhdGVUb0xhc3RFZGl0TG9jYXRpb24nKVxuXHR9LFxuXHRvcmRlcjogM1xufSk7XG5cbi8vIFN3aXRjaCBFZGl0b3JcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyU3dpdGNoRWRpdG9yTWVudSwge1xuXHRncm91cDogJzFfc2lkZUJ5U2lkZScsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRk9DVVNfRklSU1RfU0lERV9FRElUT1IsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlGaXJzdFNpZGVFZGl0b3InLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZGaXJzdCBTaWRlIGluIEVkaXRvclwiKVxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihTaWRlQnlTaWRlRWRpdG9yQWN0aXZlQ29udGV4dCwgVGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0KSxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTd2l0Y2hFZGl0b3JNZW51LCB7XG5cdGdyb3VwOiAnMV9zaWRlQnlTaWRlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBGT0NVU19TRUNPTkRfU0lERV9FRElUT1IsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlTZWNvbmRTaWRlRWRpdG9yJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmU2Vjb25kIFNpZGUgaW4gRWRpdG9yXCIpXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLm9yKFNpZGVCeVNpZGVFZGl0b3JBY3RpdmVDb250ZXh0LCBUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQpLFxuXHRvcmRlcjogMlxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEVkaXRvck1lbnUsIHtcblx0Z3JvdXA6ICcyX2FueScsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubmV4dEVkaXRvcicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlOZXh0RWRpdG9yJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTmV4dCBFZGl0b3JcIilcblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTd2l0Y2hFZGl0b3JNZW51LCB7XG5cdGdyb3VwOiAnMl9hbnknLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnByZXZpb3VzRWRpdG9yJyxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVByZXZpb3VzRWRpdG9yJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUHJldmlvdXMgRWRpdG9yXCIpXG5cdH0sXG5cdG9yZGVyOiAyXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyU3dpdGNoRWRpdG9yTWVudSwge1xuXHRncm91cDogJzNfYW55X3VzZWQnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5OZXh0UmVjZW50bHlVc2VkRWRpdG9yJyxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU5leHRSZWNlbnRseVVzZWRFZGl0b3InLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZOZXh0IFVzZWQgRWRpdG9yXCIpXG5cdH0sXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyU3dpdGNoRWRpdG9yTWVudSwge1xuXHRncm91cDogJzNfYW55X3VzZWQnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5QcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvcicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlQcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlByZXZpb3VzIFVzZWQgRWRpdG9yXCIpXG5cdH0sXG5cdG9yZGVyOiAyXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyU3dpdGNoRWRpdG9yTWVudSwge1xuXHRncm91cDogJzRfZ3JvdXAnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm5leHRFZGl0b3JJbkdyb3VwJyxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU5leHRFZGl0b3JJbkdyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTmV4dCBFZGl0b3IgaW4gR3JvdXBcIilcblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTd2l0Y2hFZGl0b3JNZW51LCB7XG5cdGdyb3VwOiAnNF9ncm91cCcsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ucHJldmlvdXNFZGl0b3JJbkdyb3VwJyxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVByZXZpb3VzRWRpdG9ySW5Hcm91cCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlByZXZpb3VzIEVkaXRvciBpbiBHcm91cFwiKVxuXHR9LFxuXHRvcmRlcjogMlxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEVkaXRvck1lbnUsIHtcblx0Z3JvdXA6ICc1X2dyb3VwX3VzZWQnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5OZXh0UmVjZW50bHlVc2VkRWRpdG9ySW5Hcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlOZXh0VXNlZEVkaXRvckluR3JvdXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZOZXh0IFVzZWQgRWRpdG9yIGluIEdyb3VwXCIpXG5cdH0sXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyU3dpdGNoRWRpdG9yTWVudSwge1xuXHRncm91cDogJzVfZ3JvdXBfdXNlZCcsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9ySW5Hcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlQcmV2aW91c1VzZWRFZGl0b3JJbkdyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUHJldmlvdXMgVXNlZCBFZGl0b3IgaW4gR3JvdXBcIilcblx0fSxcblx0b3JkZXI6IDJcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJHb01lbnUsIHtcblx0Z3JvdXA6ICcyX2VkaXRvcl9uYXYnLFxuXHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVN3aXRjaEVkaXRvcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJTd2l0Y2ggJiZFZGl0b3JcIiksXG5cdHN1Ym1lbnU6IE1lbnVJZC5NZW51YmFyU3dpdGNoRWRpdG9yTWVudSxcblx0b3JkZXI6IDFcbn0pO1xuXG4vLyBTd2l0Y2ggR3JvdXBcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEdyb3VwTWVudSwge1xuXHRncm91cDogJzFfZm9jdXNfaW5kZXgnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzRmlyc3RFZGl0b3JHcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlGb2N1c0ZpcnN0R3JvdXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiR3JvdXAgJiYxXCIpXG5cdH0sXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyU3dpdGNoR3JvdXBNZW51LCB7XG5cdGdyb3VwOiAnMV9mb2N1c19pbmRleCcsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNTZWNvbmRFZGl0b3JHcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlGb2N1c1NlY29uZEdyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdyb3VwICYmMlwiKVxuXHR9LFxuXHRvcmRlcjogMlxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEdyb3VwTWVudSwge1xuXHRncm91cDogJzFfZm9jdXNfaW5kZXgnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzVGhpcmRFZGl0b3JHcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlGb2N1c1RoaXJkR3JvdXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiR3JvdXAgJiYzXCIpLFxuXHRcdHByZWNvbmRpdGlvbjogTXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0XG5cdH0sXG5cdG9yZGVyOiAzXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyU3dpdGNoR3JvdXBNZW51LCB7XG5cdGdyb3VwOiAnMV9mb2N1c19pbmRleCcsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNGb3VydGhFZGl0b3JHcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlGb2N1c0ZvdXJ0aEdyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdyb3VwICYmNFwiKSxcblx0XHRwcmVjb25kaXRpb246IE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dFxuXHR9LFxuXHRvcmRlcjogNFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEdyb3VwTWVudSwge1xuXHRncm91cDogJzFfZm9jdXNfaW5kZXgnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzRmlmdGhFZGl0b3JHcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlGb2N1c0ZpZnRoR3JvdXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiR3JvdXAgJiY1XCIpLFxuXHRcdHByZWNvbmRpdGlvbjogTXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0XG5cdH0sXG5cdG9yZGVyOiA1XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyU3dpdGNoR3JvdXBNZW51LCB7XG5cdGdyb3VwOiAnMl9uZXh0X3ByZXYnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzTmV4dEdyb3VwJyxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU5leHRHcm91cCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk5leHQgR3JvdXBcIiksXG5cdFx0cHJlY29uZGl0aW9uOiBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHRcblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTd2l0Y2hHcm91cE1lbnUsIHtcblx0Z3JvdXA6ICcyX25leHRfcHJldicsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNQcmV2aW91c0dyb3VwJyxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVByZXZpb3VzR3JvdXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZQcmV2aW91cyBHcm91cFwiKSxcblx0XHRwcmVjb25kaXRpb246IE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dFxuXHR9LFxuXHRvcmRlcjogMlxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEdyb3VwTWVudSwge1xuXHRncm91cDogJzNfZGlyZWN0aW9uYWwnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzTGVmdEdyb3VwJyxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaUZvY3VzTGVmdEdyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdyb3VwICYmTGVmdFwiKSxcblx0XHRwcmVjb25kaXRpb246IE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dFxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEdyb3VwTWVudSwge1xuXHRncm91cDogJzNfZGlyZWN0aW9uYWwnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzUmlnaHRHcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlGb2N1c1JpZ2h0R3JvdXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiR3JvdXAgJiZSaWdodFwiKSxcblx0XHRwcmVjb25kaXRpb246IE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dFxuXHR9LFxuXHRvcmRlcjogMlxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEdyb3VwTWVudSwge1xuXHRncm91cDogJzNfZGlyZWN0aW9uYWwnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzQWJvdmVHcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlGb2N1c0Fib3ZlR3JvdXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiR3JvdXAgJiZBYm92ZVwiKSxcblx0XHRwcmVjb25kaXRpb246IE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dFxuXHR9LFxuXHRvcmRlcjogM1xufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEdyb3VwTWVudSwge1xuXHRncm91cDogJzNfZGlyZWN0aW9uYWwnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzQmVsb3dHcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlGb2N1c0JlbG93R3JvdXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiR3JvdXAgJiZCZWxvd1wiKSxcblx0XHRwcmVjb25kaXRpb246IE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dFxuXHR9LFxuXHRvcmRlcjogNFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckdvTWVudSwge1xuXHRncm91cDogJzJfZWRpdG9yX25hdicsXG5cdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pU3dpdGNoR3JvdXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiU3dpdGNoICYmR3JvdXBcIiksXG5cdHN1Ym1lbnU6IE1lbnVJZC5NZW51YmFyU3dpdGNoR3JvdXBNZW51LFxuXHRvcmRlcjogMlxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG5cbnJlZ2lzdGVyRWRpdG9yRm9udENvbmZpZ3VyYXRpb25zKGdldEZvbnRTbmlwcGV0cyk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQThCLDRCQUE0QjtBQUMxRCxTQUFpQyx3QkFBd0I7QUFDekQ7QUFBQSxFQUNDO0FBQUEsRUFBZ0M7QUFBQSxFQUEyQjtBQUFBLEVBQWdDO0FBQUEsRUFBMkI7QUFBQSxFQUN0SDtBQUFBLEVBQXVDO0FBQUEsRUFBMEI7QUFBQSxFQUFnQztBQUFBLEVBQW9DO0FBQUEsRUFDckk7QUFBQSxFQUEwQjtBQUFBLEVBQWdDO0FBQUEsRUFBdUM7QUFBQSxFQUE2QjtBQUFBLEVBQzlIO0FBQUEsRUFBMEI7QUFBQSxFQUFtQztBQUFBLEVBQXVDO0FBQUEsRUFDcEc7QUFBQSxFQUF5QjtBQUFBLEVBQThDO0FBQUEsRUFBbUM7QUFBQSxPQUNwRztBQUNQLFNBQVMsdUJBQXVCLHVDQUF1QztBQUN2RSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGlCQUFpQixpQ0FBaUM7QUFDM0QsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQkFBc0IsaUJBQWlCLHNCQUFzQixnQ0FBZ0M7QUFDdEcsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjLFFBQW1CLHVCQUF1QjtBQUNqRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFFBQVEsZUFBZTtBQUNoQztBQUFBLEVBQ0M7QUFBQSxFQUFpQztBQUFBLEVBQXVCO0FBQUEsRUFBcUI7QUFBQSxFQUFzQjtBQUFBLEVBQW1CO0FBQUEsRUFBcUI7QUFBQSxFQUMzSTtBQUFBLEVBQTZC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
