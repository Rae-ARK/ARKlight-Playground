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
import "./media/editorTabs.css";
import "./diffEditor.sessions.contribution.js";
import { NewBrowserTabAction, NewChangesTabAction, NewFileTabAction, NewSearchTabAction } from "./addTabActions.js";
import { localize2 } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { Action2, isIMenuItem, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ActiveEditorContext, AuxiliaryBarVisibleContext, EditorPartModalContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from "../../../../workbench/common/contextkeys.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { Menus } from "../../../browser/menus.js";
import { IAgentWorkbenchLayoutService } from "../../../browser/workbench.js";
import { CustomViewVisibleContext, EditorMaximizedContext, HasDockedDetailsContext, SinglePaneLayoutEnabledContext } from "../../../common/contextkeys.js";
import { IViewsService } from "../../../../workbench/services/views/common/viewsService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IEditorGroupsService } from "../../../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../../workbench/common/editor.js";
import { resolveCommandsContext } from "../../../../workbench/browser/parts/editor/editorCommandsContext.js";
import { MultiDiffEditorInput } from "../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js";
import { CHANGES_VIEW_ID } from "../../changes/common/changes.js";
import { prepareMoveCopyEditors } from "../../../../workbench/browser/parts/editor/editor.js";
import { Parts } from "../../../../workbench/services/layout/browser/layoutService.js";
import { MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID } from "../../../../workbench/browser/parts/editor/editorCommands.js";
import { TERMINAL_VIEW_ID } from "../../../../workbench/contrib/terminal/common/terminal.js";
import { TEXT_FILE_EDITOR_ID } from "../../../../workbench/contrib/files/common/files.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ISessionsPartService } from "../../../services/sessions/browser/sessionsPartService.js";
import { SessionsCategories } from "../../../common/categories.js";
import { IChangesViewService } from "../../changes/common/changesViewService.js";
const terminalPanelHiddenForMaximizedEditor = /* @__PURE__ */ new WeakSet();
const singlePaneDetailPanel = SinglePaneLayoutEnabledContext;
const notSinglePaneDetailPanel = singlePaneDetailPanel.negate();
const editorTitleActionsWhen = ContextKeyExpr.and(
  IsSessionsWindowContext,
  IsAuxiliaryWindowContext.toNegated(),
  IsTopRightEditorGroupContext
);
const singlePaneLayoutHideEditorOrder = 10;
const singlePaneLayoutMaximizeOrder = 20;
const singlePaneMaximizeKeybindingWhen = ContextKeyExpr.and(
  IsSessionsWindowContext,
  IsAuxiliaryWindowContext.toNegated(),
  singlePaneDetailPanel,
  MainEditorAreaVisibleContext
);
let SinglePaneAddTabContribution = class extends Disposable {
  constructor(layoutService) {
    super();
    if (!layoutService.isSinglePaneLayoutEnabled) {
      return;
    }
    this._register(registerAction2(NewFileTabAction));
    this._register(registerAction2(NewBrowserTabAction));
    this._register(registerAction2(NewSearchTabAction));
    this._register(registerAction2(NewChangesTabAction));
  }
};
SinglePaneAddTabContribution.ID = "workbench.contrib.sessions.singlePaneAddTab";
SinglePaneAddTabContribution = __decorateClass([
  __decorateParam(0, IAgentWorkbenchLayoutService)
], SinglePaneAddTabContribution);
registerWorkbenchContribution2(SinglePaneAddTabContribution.ID, SinglePaneAddTabContribution, WorkbenchPhase.BlockStartup);
const _MaximizeMainEditorPartAction = class _MaximizeMainEditorPartAction extends Action2 {
  constructor() {
    super({
      id: _MaximizeMainEditorPartAction.ID,
      title: localize2("maximizeMainEditorPart", "Maximize Editor Area"),
      icon: Codicon.screenFull,
      f1: false,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyE,
        when: ContextKeyExpr.and(singlePaneMaximizeKeybindingWhen, EditorMaximizedContext.negate())
      },
      menu: [
        {
          id: MenuId.EditorTitleLayout,
          group: "navigation",
          order: singlePaneLayoutMaximizeOrder,
          when: ContextKeyExpr.and(editorTitleActionsWhen, EditorMaximizedContext.negate(), singlePaneDetailPanel, MainEditorAreaVisibleContext)
        },
        {
          id: MenuId.EditorTitleLayout,
          group: "navigation",
          order: 99,
          when: ContextKeyExpr.and(editorTitleActionsWhen, EditorMaximizedContext.negate(), notSinglePaneDetailPanel)
        }
      ]
    });
  }
  async run(accessor) {
    const layoutService = accessor.get(IAgentWorkbenchLayoutService);
    const viewsService = accessor.get(IViewsService);
    let hidTerminalPanel = false;
    if (layoutService.isVisible(Parts.PANEL_PART) && viewsService.isViewVisible(TERMINAL_VIEW_ID)) {
      layoutService.setPartHidden(true, Parts.PANEL_PART);
      hidTerminalPanel = true;
    }
    if (hidTerminalPanel) {
      terminalPanelHiddenForMaximizedEditor.add(layoutService);
    } else {
      terminalPanelHiddenForMaximizedEditor.delete(layoutService);
    }
    layoutService.setEditorMaximized(true);
  }
};
_MaximizeMainEditorPartAction.ID = "workbench.action.agentSessions.maximizeMainEditorPart";
let MaximizeMainEditorPartAction = _MaximizeMainEditorPartAction;
registerAction2(MaximizeMainEditorPartAction);
const _RestoreMainEditorPartAction = class _RestoreMainEditorPartAction extends Action2 {
  constructor() {
    super({
      id: _RestoreMainEditorPartAction.ID,
      title: localize2("restoreMainEditorPart", "Restore Editor Area"),
      icon: Codicon.screenNormal,
      f1: false,
      toggled: EditorMaximizedContext,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyE,
        when: ContextKeyExpr.and(singlePaneMaximizeKeybindingWhen, EditorMaximizedContext)
      },
      menu: [
        {
          id: MenuId.EditorTitleLayout,
          group: "navigation",
          order: singlePaneLayoutMaximizeOrder,
          when: ContextKeyExpr.and(editorTitleActionsWhen, EditorMaximizedContext, singlePaneDetailPanel, MainEditorAreaVisibleContext)
        },
        {
          id: MenuId.EditorTitleLayout,
          group: "navigation",
          order: 99,
          when: ContextKeyExpr.and(editorTitleActionsWhen, EditorMaximizedContext, notSinglePaneDetailPanel)
        }
      ]
    });
  }
  async run(accessor) {
    const layoutService = accessor.get(IAgentWorkbenchLayoutService);
    const shouldRestoreTerminalPanel = terminalPanelHiddenForMaximizedEditor.has(layoutService);
    layoutService.setEditorMaximized(false);
    if (shouldRestoreTerminalPanel && !layoutService.isVisible(Parts.PANEL_PART)) {
      layoutService.setPartHidden(false, Parts.PANEL_PART);
    }
    terminalPanelHiddenForMaximizedEditor.delete(layoutService);
  }
};
_RestoreMainEditorPartAction.ID = "workbench.action.agentSessions.restoreMainEditorPart";
let RestoreMainEditorPartAction = _RestoreMainEditorPartAction;
registerAction2(RestoreMainEditorPartAction);
const _HideMainEditorPartAction = class _HideMainEditorPartAction extends Action2 {
  constructor() {
    super({
      id: _HideMainEditorPartAction.ID,
      title: localize2("hideMainEditorPart", "Hide Editor"),
      icon: Codicon.chevronRight,
      f1: false,
      menu: {
        id: MenuId.EditorTitleLayout,
        group: "navigation",
        order: singlePaneLayoutHideEditorOrder,
        when: ContextKeyExpr.and(
          editorTitleActionsWhen,
          singlePaneDetailPanel,
          EditorMaximizedContext.negate(),
          AuxiliaryBarVisibleContext,
          HasDockedDetailsContext,
          MainEditorAreaVisibleContext
        )
      }
    });
  }
  run(accessor) {
    const layoutService = accessor.get(IAgentWorkbenchLayoutService);
    layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
    layoutService.setPartHidden(true, Parts.EDITOR_PART);
    layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
  }
};
_HideMainEditorPartAction.ID = "workbench.action.agentSessions.hideMainEditorPart";
let HideMainEditorPartAction = _HideMainEditorPartAction;
registerAction2(HideMainEditorPartAction);
const _CloseMainEditorPartAction = class _CloseMainEditorPartAction extends Action2 {
  constructor() {
    super({
      id: _CloseMainEditorPartAction.ID,
      title: localize2("closeMainEditorPart", "Close Editor Area"),
      icon: Codicon.close,
      f1: false,
      menu: {
        id: MenuId.EditorTitleLayout,
        group: "navigation",
        order: 100,
        when: ContextKeyExpr.and(
          IsSessionsWindowContext,
          IsAuxiliaryWindowContext.toNegated(),
          IsTopRightEditorGroupContext,
          notSinglePaneDetailPanel
        )
      }
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand("workbench.action.closeAllGroups");
  }
};
_CloseMainEditorPartAction.ID = "workbench.action.agentSessions.closeMainEditorPart";
let CloseMainEditorPartAction = _CloseMainEditorPartAction;
registerAction2(CloseMainEditorPartAction);
const _OpenEditorInModalEditorAction = class _OpenEditorInModalEditorAction extends Action2 {
  constructor() {
    super({
      id: _OpenEditorInModalEditorAction.ID,
      title: localize2("openEditorInModal", "Open in Modal Editor"),
      icon: Codicon.openInWindow,
      f1: false,
      menu: {
        id: MenuId.EditorTitleLayout,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.and(
          IsSessionsWindowContext,
          IsAuxiliaryWindowContext.toNegated(),
          notSinglePaneDetailPanel
        )
      }
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const layoutService = accessor.get(IAgentWorkbenchLayoutService);
    const configurationService = accessor.get(IConfigurationService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const isMaximized = layoutService.isEditorMaximized();
    await configurationService.updateValue("workbench.editor.useModal", "all");
    const activeGroup = editorGroupsService.mainPart.activeGroup;
    const multiFileDiffEditor = activeGroup.editors.find((editor) => editor instanceof MultiDiffEditorInput);
    if (multiFileDiffEditor) {
      const view = viewsService.getViewWithId(CHANGES_VIEW_ID);
      await view?.openChanges();
      await activeGroup.closeEditor(multiFileDiffEditor);
    }
    const modalPart = await editorGroupsService.createModalEditorPart();
    const editorsToMove = prepareMoveCopyEditors(activeGroup, activeGroup.editors.slice(), true);
    activeGroup.moveEditors(editorsToMove, modalPart.activeGroup);
    if (isMaximized && !modalPart.maximized) {
      modalPart.toggleMaximized();
    }
    modalPart.activeGroup.focus();
  }
};
_OpenEditorInModalEditorAction.ID = "workbench.action.agentSessions.openEditorInModal";
let OpenEditorInModalEditorAction = _OpenEditorInModalEditorAction;
registerAction2(OpenEditorInModalEditorAction);
const _OpenModalEditorInEditorAction = class _OpenModalEditorInEditorAction extends Action2 {
  constructor() {
    super({
      id: _OpenModalEditorInEditorAction.ID,
      title: localize2("openModalEditorInEditor", "Open in Editor Area"),
      icon: Codicon.openInWindow,
      f1: false,
      // The editor area is not rendered while a custom view replaces the sessions grid.
      precondition: CustomViewVisibleContext.negate(),
      menu: {
        id: MenuId.ModalEditorTitle,
        group: "navigation",
        order: 98,
        when: ContextKeyExpr.and(
          IsSessionsWindowContext,
          EditorPartModalContext
        )
      }
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const commandService = accessor.get(ICommandService);
    const configurationService = accessor.get(IConfigurationService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const layoutService = accessor.get(IAgentWorkbenchLayoutService);
    const changesViewService = accessor.get(IChangesViewService);
    const activeEditorPart = editorGroupsService.activeModalEditorPart;
    const activeGroup = activeEditorPart?.activeGroup;
    if (!activeEditorPart || !activeGroup) {
      return;
    }
    const isMaximized = activeEditorPart.maximized;
    await configurationService.updateValue("workbench.editor.useModal", "some");
    layoutService.setPartHidden(false, Parts.EDITOR_PART);
    const navigation = activeGroup.activeEditorPane?.options?.modal?.navigation;
    if (navigation) {
      const view = viewsService.getViewWithId(CHANGES_VIEW_ID);
      const changes = changesViewService.activeSessionChangesObs.get();
      if (changes && navigation.current < changes.length) {
        await view?.openChanges(changes[navigation.current].modifiedUri ?? changes[navigation.current].originalUri);
        await activeGroup.closeEditor(activeGroup.editors[0]);
      }
    }
    await commandService.executeCommand(MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID);
    if (isMaximized) {
      layoutService.setEditorMaximized(true);
    }
    editorGroupsService.activeGroup.focus();
  }
};
_OpenModalEditorInEditorAction.ID = "workbench.action.agentSessions.openModalEditorInEditor";
let OpenModalEditorInEditorAction = _OpenModalEditorInEditorAction;
registerAction2(OpenModalEditorInEditorAction);
const _AddFileAsContextAction = class _AddFileAsContextAction extends Action2 {
  constructor() {
    const precondition = ContextKeyExpr.and(
      IsSessionsWindowContext,
      IsAuxiliaryWindowContext.toNegated(),
      ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID)
    );
    super({
      id: _AddFileAsContextAction.ID,
      title: localize2("addFileAsContext", "Add File as Context"),
      category: SessionsCategories.Sessions,
      icon: Codicon.attach,
      f1: true,
      precondition,
      menu: [{
        id: Menus.SessionsEditorTitle,
        group: "navigation",
        order: 1e5,
        when: ContextKeyExpr.and(precondition, singlePaneDetailPanel)
      }, {
        id: MenuId.EditorTitle,
        group: "navigation",
        order: 1e5,
        // towards the far right, mirroring Split Editor Right in the regular window
        when: ContextKeyExpr.and(precondition, notSinglePaneDetailPanel)
      }]
    });
  }
  run(accessor, ...args) {
    const editorService = accessor.get(IEditorService);
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    const resolvedContext = resolveCommandsContext(args, editorService, accessor.get(IEditorGroupsService), accessor.get(IListService));
    const resources = resolvedContext.groupedEditors.flatMap((groupedEditor) => groupedEditor.editors).map((editor) => EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY })).filter((uri) => uri !== void 0 && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(uri.scheme));
    if (resources.length === 0) {
      return;
    }
    const sessionId = sessionsService.activeSession.get()?.sessionId;
    sessionsPartService.getSessionView(sessionId)?.attach(resources);
  }
};
_AddFileAsContextAction.ID = "workbench.action.agentSessions.addFileAsContext";
let AddFileAsContextAction = _AddFileAsContextAction;
registerAction2(AddFileAsContextAction);
let EditorTitleMenuBridgeContribution = class extends Disposable {
  constructor(layoutService) {
    super();
    this._mirrored = this._register(new DisposableStore());
    if (!layoutService.isSinglePaneLayoutEnabled) {
      return;
    }
    this._sync();
    this._register(MenuRegistry.onDidChangeMenu((e) => {
      if (e.has(MenuId.EditorTitle)) {
        this._sync();
      }
    }));
  }
  _sync() {
    this._mirrored.clear();
    for (const item of MenuRegistry.getMenuItems(MenuId.EditorTitle)) {
      const isExtensionItem = isIMenuItem(item) ? !!item.command.source : item.submenu.id.startsWith(EditorTitleMenuBridgeContribution._extensionSubmenuPrefix);
      if (isExtensionItem) {
        this._mirrored.add(MenuRegistry.appendMenuItem(Menus.SessionsEditorTitle, item));
      }
    }
  }
};
EditorTitleMenuBridgeContribution.ID = "workbench.contrib.sessions.editorTitleMenuBridge";
// Extension submenus are registered with a `MenuId.for('api:<id>')` id (see the
// `submenus` extension point), which distinguishes them from core submenus.
EditorTitleMenuBridgeContribution._extensionSubmenuPrefix = "api:";
EditorTitleMenuBridgeContribution = __decorateClass([
  __decorateParam(0, IAgentWorkbenchLayoutService)
], EditorTitleMenuBridgeContribution);
registerWorkbenchContribution2(EditorTitleMenuBridgeContribution.ID, EditorTitleMenuBridgeContribution, WorkbenchPhase.BlockStartup);
export {
  EditorTitleMenuBridgeContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvZWRpdG9yL2Jyb3dzZXIvZWRpdG9yLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9lZGl0b3JUYWJzLmNzcyc7XG5pbXBvcnQgJy4vZGlmZkVkaXRvci5zZXNzaW9ucy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgTmV3QnJvd3NlclRhYkFjdGlvbiwgTmV3Q2hhbmdlc1RhYkFjdGlvbiwgTmV3RmlsZVRhYkFjdGlvbiwgTmV3U2VhcmNoVGFiQWN0aW9uIH0gZnJvbSAnLi9hZGRUYWJBY3Rpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBpc0lNZW51SXRlbSwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBY3RpdmVFZGl0b3JDb250ZXh0LCBBdXhpbGlhcnlCYXJWaXNpYmxlQ29udGV4dCwgRWRpdG9yUGFydE1vZGFsQ29udGV4dCwgSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgSXNUb3BSaWdodEVkaXRvckdyb3VwQ29udGV4dCwgTWFpbkVkaXRvckFyZWFWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd29ya2JlbmNoLmpzJztcbmltcG9ydCB7IEN1c3RvbVZpZXdWaXNpYmxlQ29udGV4dCwgRWRpdG9yTWF4aW1pemVkQ29udGV4dCwgSGFzRG9ja2VkRGV0YWlsc0NvbnRleHQsIFNpbmdsZVBhbmVMYXlvdXRFbmFibGVkQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUNvbW1hbmRzQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JDb21tYW5kc0NvbnRleHQuanMnO1xuaW1wb3J0IHsgTXVsdGlEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9tdWx0aURpZmZFZGl0b3IvYnJvd3Nlci9tdWx0aURpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBDSEFOR0VTX1ZJRVdfSUQgfSBmcm9tICcuLi8uLi9jaGFuZ2VzL2NvbW1vbi9jaGFuZ2VzLmpzJztcbmltcG9ydCB7IENoYW5nZXNWaWV3UGFuZSB9IGZyb20gJy4uLy4uL2NoYW5nZXMvYnJvd3Nlci9jaGFuZ2VzVmlldy5qcyc7XG5pbXBvcnQgeyBwcmVwYXJlTW92ZUNvcHlFZGl0b3JzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1PVkVfTU9EQUxfRURJVE9SX1RPX01BSU5fQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBURVJNSU5BTF9WSUVXX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRFWFRfRklMRV9FRElUT1JfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1BhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1BhcnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25zQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IElDaGFuZ2VzVmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGFuZ2VzL2NvbW1vbi9jaGFuZ2VzVmlld1NlcnZpY2UuanMnO1xuXG5jb25zdCB0ZXJtaW5hbFBhbmVsSGlkZGVuRm9yTWF4aW1pemVkRWRpdG9yID0gbmV3IFdlYWtTZXQ8SUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZT4oKTtcblxuLy8gVGhlIHBvcC1vdXQtdG8tbW9kYWwgYW5kIGNsb3NlLWVkaXRvci1hcmVhIGJ1dHRvbnMgZG8gbm90IGFwcGx5IHRvIHRoZSBzaW5nbGUtcGFuZVxuLy8gcmVkZXNpZ24sIHNvIHRoZXkgYXJlIGhpZGRlbiB3aGVuIHNpbmdsZS1wYW5lIGlzIGVuYWJsZWQgKG9yaWdpbmFsIGxheW91dCBrZWVwcyB0aGVtKS5cbmNvbnN0IHNpbmdsZVBhbmVEZXRhaWxQYW5lbCA9IFNpbmdsZVBhbmVMYXlvdXRFbmFibGVkQ29udGV4dDtcbmNvbnN0IG5vdFNpbmdsZVBhbmVEZXRhaWxQYW5lbCA9IHNpbmdsZVBhbmVEZXRhaWxQYW5lbC5uZWdhdGUoKTtcblxuY29uc3QgZWRpdG9yVGl0bGVBY3Rpb25zV2hlbiA9IENvbnRleHRLZXlFeHByLmFuZChcblx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSxcblx0SXNUb3BSaWdodEVkaXRvckdyb3VwQ29udGV4dCk7XG4vLyBTaW5nbGUtcGFuZSBcImxheW91dFwiIGFjdGlvbnMgKG1heGltaXplL3Jlc3RvcmUsIGhpZGUgZWRpdG9yLCB0b2dnbGUgZGV0YWlscylcbi8vIHJlbmRlciBpbiB0aGUgZWRpdG9yLXRpdGxlICpsYXlvdXQqIGNsdXN0ZXIgKE1lbnVJZC5FZGl0b3JUaXRsZUxheW91dCksIGFmdGVyXG4vLyB0aGUgZWRpdG9yLXRpdGxlIGFjdGlvbnMgYW5kIHRoZWlyIHNlcGFyYXRvciBcdTIwMTQgbWlycm9yaW5nIHRoZSBjbGFzc2ljIGxheW91dC5cbi8vIFRoZSBkZXRhaWwtcGFuZWwgdG9nZ2xlIGlzIGNvbmRpdGlvbmFsIChoaWRkZW4gZm9yIHRhYiB0eXBlcyB3aXRoIG5vIGRldGFpbCxcbi8vIGUuZy4gYnJvd3NlciBhbmQgc2VhcmNoIFx1MjAxNCBzZWUgYHNpbmdsZVBhbmVMYXlvdXRUb2dnbGVEZXRhaWxzT3JkZXJgIGluXG4vLyBgc2luZ2xlUGFuZVJlc3BvbnNpdmVTaWRlYmFyU3RyYXRlZ3kudHNgKSBhbmQga2VlcHMgaXRzIHRyYWlsaW5nIHBvc2l0aW9uIGFmdGVyXG4vLyB0aGUgaGlkZSBjaGV2cm9uIGFuZCBtYXhpbWl6ZS9yZXN0b3JlLlxuY29uc3Qgc2luZ2xlUGFuZUxheW91dEhpZGVFZGl0b3JPcmRlciA9IDEwO1xuY29uc3Qgc2luZ2xlUGFuZUxheW91dE1heGltaXplT3JkZXIgPSAyMDtcblxuLy8gS2V5YmluZGluZyBzY29wZSBmb3IgdGhlIHNpbmdsZS1wYW5lIG1heGltaXplL3Jlc3RvcmUgdG9nZ2xlOiBhY3RpdmUgaW4gdGhlXG4vLyBtYWluIHNlc3Npb25zIHdpbmRvdyB3aGVuZXZlciB0aGUgc2luZ2xlLXBhbmUgbGF5b3V0IGlzIG9uIGFuZCB0aGUgZWRpdG9yXG4vLyBhcmVhIGlzIHZpc2libGUuIERlbGliZXJhdGVseSBkb2VzIG5vdCByZXF1aXJlIHRoZSBlZGl0b3IgZ3JvdXAgdG8gYmUgZm9jdXNlZFxuLy8gc28gdGhlIHRvZ2dsZSB3b3JrcyB3aGlsZSB0eXBpbmcgaW4gdGhlIGNoYXQuXG5jb25zdCBzaW5nbGVQYW5lTWF4aW1pemVLZXliaW5kaW5nV2hlbiA9IENvbnRleHRLZXlFeHByLmFuZChcblx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSxcblx0c2luZ2xlUGFuZURldGFpbFBhbmVsLFxuXHRNYWluRWRpdG9yQXJlYVZpc2libGVDb250ZXh0KTtcblxuY2xhc3MgU2luZ2xlUGFuZUFkZFRhYkNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuc2Vzc2lvbnMuc2luZ2xlUGFuZUFkZFRhYic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmICghbGF5b3V0U2VydmljZS5pc1NpbmdsZVBhbmVMYXlvdXRFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKE5ld0ZpbGVUYWJBY3Rpb24pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoTmV3QnJvd3NlclRhYkFjdGlvbikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihOZXdTZWFyY2hUYWJBY3Rpb24pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoTmV3Q2hhbmdlc1RhYkFjdGlvbikpO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihTaW5nbGVQYW5lQWRkVGFiQ29udHJpYnV0aW9uLklELCBTaW5nbGVQYW5lQWRkVGFiQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xuXG5jbGFzcyBNYXhpbWl6ZU1haW5FZGl0b3JQYXJ0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMubWF4aW1pemVNYWluRWRpdG9yUGFydCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1heGltaXplTWFpbkVkaXRvclBhcnRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtYXhpbWl6ZU1haW5FZGl0b3JQYXJ0JywgXCJNYXhpbWl6ZSBFZGl0b3IgQXJlYVwiKSxcblx0XHRcdGljb246IENvZGljb24uc2NyZWVuRnVsbCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlFLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoc2luZ2xlUGFuZU1heGltaXplS2V5YmluZGluZ1doZW4sIEVkaXRvck1heGltaXplZENvbnRleHQubmVnYXRlKCkpXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZUxheW91dCxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiBzaW5nbGVQYW5lTGF5b3V0TWF4aW1pemVPcmRlcixcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoZWRpdG9yVGl0bGVBY3Rpb25zV2hlbiwgRWRpdG9yTWF4aW1pemVkQ29udGV4dC5uZWdhdGUoKSwgc2luZ2xlUGFuZURldGFpbFBhbmVsLCBNYWluRWRpdG9yQXJlYVZpc2libGVDb250ZXh0KVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZUxheW91dCxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiA5OSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoZWRpdG9yVGl0bGVBY3Rpb25zV2hlbiwgRWRpdG9yTWF4aW1pemVkQ29udGV4dC5uZWdhdGUoKSwgbm90U2luZ2xlUGFuZURldGFpbFBhbmVsKVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRsZXQgaGlkVGVybWluYWxQYW5lbCA9IGZhbHNlO1xuXG5cdFx0aWYgKGxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpICYmIHZpZXdzU2VydmljZS5pc1ZpZXdWaXNpYmxlKFRFUk1JTkFMX1ZJRVdfSUQpKSB7XG5cdFx0XHRsYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuUEFORUxfUEFSVCk7XG5cdFx0XHRoaWRUZXJtaW5hbFBhbmVsID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoaGlkVGVybWluYWxQYW5lbCkge1xuXHRcdFx0dGVybWluYWxQYW5lbEhpZGRlbkZvck1heGltaXplZEVkaXRvci5hZGQobGF5b3V0U2VydmljZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlcm1pbmFsUGFuZWxIaWRkZW5Gb3JNYXhpbWl6ZWRFZGl0b3IuZGVsZXRlKGxheW91dFNlcnZpY2UpO1xuXHRcdH1cblxuXHRcdGxheW91dFNlcnZpY2Uuc2V0RWRpdG9yTWF4aW1pemVkKHRydWUpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihNYXhpbWl6ZU1haW5FZGl0b3JQYXJ0QWN0aW9uKTtcblxuY2xhc3MgUmVzdG9yZU1haW5FZGl0b3JQYXJ0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMucmVzdG9yZU1haW5FZGl0b3JQYXJ0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUmVzdG9yZU1haW5FZGl0b3JQYXJ0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVzdG9yZU1haW5FZGl0b3JQYXJ0JywgXCJSZXN0b3JlIEVkaXRvciBBcmVhXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zY3JlZW5Ob3JtYWwsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHR0b2dnbGVkOiBFZGl0b3JNYXhpbWl6ZWRDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChzaW5nbGVQYW5lTWF4aW1pemVLZXliaW5kaW5nV2hlbiwgRWRpdG9yTWF4aW1pemVkQ29udGV4dClcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlTGF5b3V0LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IHNpbmdsZVBhbmVMYXlvdXRNYXhpbWl6ZU9yZGVyLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChlZGl0b3JUaXRsZUFjdGlvbnNXaGVuLCBFZGl0b3JNYXhpbWl6ZWRDb250ZXh0LCBzaW5nbGVQYW5lRGV0YWlsUGFuZWwsIE1haW5FZGl0b3JBcmVhVmlzaWJsZUNvbnRleHQpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlTGF5b3V0LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDk5LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChlZGl0b3JUaXRsZUFjdGlvbnNXaGVuLCBFZGl0b3JNYXhpbWl6ZWRDb250ZXh0LCBub3RTaW5nbGVQYW5lRGV0YWlsUGFuZWwpXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0Y29uc3Qgc2hvdWxkUmVzdG9yZVRlcm1pbmFsUGFuZWwgPSB0ZXJtaW5hbFBhbmVsSGlkZGVuRm9yTWF4aW1pemVkRWRpdG9yLmhhcyhsYXlvdXRTZXJ2aWNlKTtcblxuXHRcdGxheW91dFNlcnZpY2Uuc2V0RWRpdG9yTWF4aW1pemVkKGZhbHNlKTtcblxuXHRcdGlmIChzaG91bGRSZXN0b3JlVGVybWluYWxQYW5lbCAmJiAhbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCkpIHtcblx0XHRcdGxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuUEFORUxfUEFSVCk7XG5cdFx0fVxuXG5cdFx0dGVybWluYWxQYW5lbEhpZGRlbkZvck1heGltaXplZEVkaXRvci5kZWxldGUobGF5b3V0U2VydmljZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFJlc3RvcmVNYWluRWRpdG9yUGFydEFjdGlvbik7XG5cbmNsYXNzIEhpZGVNYWluRWRpdG9yUGFydEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLmhpZGVNYWluRWRpdG9yUGFydCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEhpZGVNYWluRWRpdG9yUGFydEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2hpZGVNYWluRWRpdG9yUGFydCcsIFwiSGlkZSBFZGl0b3JcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNoZXZyb25SaWdodCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZUxheW91dCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IHNpbmdsZVBhbmVMYXlvdXRIaWRlRWRpdG9yT3JkZXIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRlZGl0b3JUaXRsZUFjdGlvbnNXaGVuLFxuXHRcdFx0XHRcdHNpbmdsZVBhbmVEZXRhaWxQYW5lbCxcblx0XHRcdFx0XHRFZGl0b3JNYXhpbWl6ZWRDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdEF1eGlsaWFyeUJhclZpc2libGVDb250ZXh0LFxuXHRcdFx0XHRcdEhhc0RvY2tlZERldGFpbHNDb250ZXh0LFxuXHRcdFx0XHRcdE1haW5FZGl0b3JBcmVhVmlzaWJsZUNvbnRleHQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdGxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdGxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5FRElUT1JfUEFSVCk7XG5cdFx0Ly8gQ2xvc2luZyB0aGUgZWRpdG9yIGFyZWEgZnJlZXMgaG9yaXpvbnRhbCBzcGFjZSwgc28gYnJpbmcgdGhlIHNlc3Npb25zXG5cdFx0Ly8gbGlzdCBiYWNrIChpdCBtYXkgaGF2ZSBiZWVuIGF1dG8tY29sbGFwc2VkIHdoZW4gZGV0YWlscyB3YXMgb3BlbmVkKS5cblx0XHRsYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLlNJREVCQVJfUEFSVCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKEhpZGVNYWluRWRpdG9yUGFydEFjdGlvbik7XG5cbmNsYXNzIENsb3NlTWFpbkVkaXRvclBhcnRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5jbG9zZU1haW5FZGl0b3JQYXJ0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2xvc2VNYWluRWRpdG9yUGFydEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Nsb3NlTWFpbkVkaXRvclBhcnQnLCBcIkNsb3NlIEVkaXRvciBBcmVhXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jbG9zZSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZUxheW91dCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEwMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0XHRcdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRJc1RvcFJpZ2h0RWRpdG9yR3JvdXBDb250ZXh0LFxuXHRcdFx0XHRcdG5vdFNpbmdsZVBhbmVEZXRhaWxQYW5lbClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VBbGxHcm91cHMnKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoQ2xvc2VNYWluRWRpdG9yUGFydEFjdGlvbik7XG5cbmNsYXNzIE9wZW5FZGl0b3JJbk1vZGFsRWRpdG9yQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMub3BlbkVkaXRvckluTW9kYWwnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuRWRpdG9ySW5Nb2RhbEVkaXRvckFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5FZGl0b3JJbk1vZGFsJywgXCJPcGVuIGluIE1vZGFsIEVkaXRvclwiKSxcblx0XHRcdGljb246IENvZGljb24ub3BlbkluV2luZG93LFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlTGF5b3V0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0XHRcdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRub3RTaW5nbGVQYW5lRGV0YWlsUGFuZWxcblx0XHRcdFx0KVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGlzTWF4aW1pemVkID0gbGF5b3V0U2VydmljZS5pc0VkaXRvck1heGltaXplZCgpO1xuXG5cdFx0Ly8gU2V0IHRoZSBgd29ya2JlbmNoLmVkaXRvci51c2VNb2RhbGAgc2V0dGluZyB0byAnYWxsJ1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCd3b3JrYmVuY2guZWRpdG9yLnVzZU1vZGFsJywgJ2FsbCcpO1xuXG5cdFx0Ly8gTW92ZSBhbGwgZWRpdG9ycyBmcm9tIHRoZSBhY3RpdmUgZ3JvdXAgdG8gdGhlIG1vZGFsIGVkaXRvclxuXHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gZWRpdG9yR3JvdXBzU2VydmljZS5tYWluUGFydC5hY3RpdmVHcm91cDtcblxuXHRcdC8vIENoZWNrIGZvciBtdWx0aS1maWxlIGRpZmYgZWRpdG9yXG5cdFx0Y29uc3QgbXVsdGlGaWxlRGlmZkVkaXRvciA9IGFjdGl2ZUdyb3VwLmVkaXRvcnNcblx0XHRcdC5maW5kKGVkaXRvciA9PiBlZGl0b3IgaW5zdGFuY2VvZiBNdWx0aURpZmZFZGl0b3JJbnB1dCk7XG5cblx0XHRpZiAobXVsdGlGaWxlRGlmZkVkaXRvcikge1xuXHRcdFx0Ly8gUmVvcGVuIG11bHRpLWZpbGUgZGlmZiBlZGl0b3IgYXMgdGhlIGZpcnN0IGVkaXRvciBpbiB0aGUgbW9kYWwgZWRpdG9yXG5cdFx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8Q2hhbmdlc1ZpZXdQYW5lPihDSEFOR0VTX1ZJRVdfSUQpO1xuXHRcdFx0YXdhaXQgdmlldz8ub3BlbkNoYW5nZXMoKTtcblxuXHRcdFx0Ly8gQ2xvc2UgdGhlIG11bHRpLWZpbGUgZGlmZiBlZGl0b3Jcblx0XHRcdGF3YWl0IGFjdGl2ZUdyb3VwLmNsb3NlRWRpdG9yKG11bHRpRmlsZURpZmZFZGl0b3IpO1xuXHRcdH1cblxuXHRcdC8vIE1vdmUgYWxsIHJlbWFpbmluZyBlZGl0b3JzIHRvIHRoZSBtb2RhbCBlZGl0b3Jcblx0XHRjb25zdCBtb2RhbFBhcnQgPSBhd2FpdCBlZGl0b3JHcm91cHNTZXJ2aWNlLmNyZWF0ZU1vZGFsRWRpdG9yUGFydCgpO1xuXHRcdGNvbnN0IGVkaXRvcnNUb01vdmUgPSBwcmVwYXJlTW92ZUNvcHlFZGl0b3JzKGFjdGl2ZUdyb3VwLCBhY3RpdmVHcm91cC5lZGl0b3JzLnNsaWNlKCksIHRydWUpO1xuXHRcdGFjdGl2ZUdyb3VwLm1vdmVFZGl0b3JzKGVkaXRvcnNUb01vdmUsIG1vZGFsUGFydC5hY3RpdmVHcm91cCk7XG5cblx0XHQvLyBNYXhpbWl6ZVxuXHRcdGlmIChpc01heGltaXplZCAmJiAhbW9kYWxQYXJ0Lm1heGltaXplZCkge1xuXHRcdFx0bW9kYWxQYXJ0LnRvZ2dsZU1heGltaXplZCgpO1xuXHRcdH1cblxuXHRcdC8vIEZvY3VzXG5cdFx0bW9kYWxQYXJ0LmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKE9wZW5FZGl0b3JJbk1vZGFsRWRpdG9yQWN0aW9uKTtcblxuY2xhc3MgT3Blbk1vZGFsRWRpdG9ySW5FZGl0b3JBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5vcGVuTW9kYWxFZGl0b3JJbkVkaXRvcic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5Nb2RhbEVkaXRvckluRWRpdG9yQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3Blbk1vZGFsRWRpdG9ySW5FZGl0b3InLCBcIk9wZW4gaW4gRWRpdG9yIEFyZWFcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLm9wZW5JbldpbmRvdyxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdC8vIFRoZSBlZGl0b3IgYXJlYSBpcyBub3QgcmVuZGVyZWQgd2hpbGUgYSBjdXN0b20gdmlldyByZXBsYWNlcyB0aGUgc2Vzc2lvbnMgZ3JpZC5cblx0XHRcdHByZWNvbmRpdGlvbjogQ3VzdG9tVmlld1Zpc2libGVDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLk1vZGFsRWRpdG9yVGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiA5OCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0XHRcdEVkaXRvclBhcnRNb2RhbENvbnRleHQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0Y29uc3QgY2hhbmdlc1ZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGFuZ2VzVmlld1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFydCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlTW9kYWxFZGl0b3JQYXJ0O1xuXHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gYWN0aXZlRWRpdG9yUGFydD8uYWN0aXZlR3JvdXA7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3JQYXJ0IHx8ICFhY3RpdmVHcm91cCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzTWF4aW1pemVkID0gYWN0aXZlRWRpdG9yUGFydC5tYXhpbWl6ZWQ7XG5cblx0XHQvLyBTZXQgdGhlIGB3b3JrYmVuY2guZWRpdG9yLnVzZU1vZGFsYCBzZXR0aW5nIGJhY2sgdG8gJ3NvbWUnXG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ3dvcmtiZW5jaC5lZGl0b3IudXNlTW9kYWwnLCAnc29tZScpO1xuXG5cdFx0Ly8gU2hvdyB0aGUgbWFpbiBlZGl0b3IgcGFydFxuXHRcdGxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIG5hdmlnYXRpb24gaW4gdGhlIG1vZGFsIGVkaXRvclxuXHRcdGNvbnN0IG5hdmlnYXRpb24gPSBhY3RpdmVHcm91cC5hY3RpdmVFZGl0b3JQYW5lPy5vcHRpb25zPy5tb2RhbD8ubmF2aWdhdGlvbjtcblx0XHRpZiAobmF2aWdhdGlvbikge1xuXHRcdFx0Y29uc3QgdmlldyA9IHZpZXdzU2VydmljZS5nZXRWaWV3V2l0aElkPENoYW5nZXNWaWV3UGFuZT4oQ0hBTkdFU19WSUVXX0lEKTtcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSBjaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNPYnMuZ2V0KCk7XG5cblx0XHRcdGlmIChjaGFuZ2VzICYmIG5hdmlnYXRpb24uY3VycmVudCA8IGNoYW5nZXMubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIFJlb3BlbiBtdWx0aS1maWxlIGRpZmYgZWRpdG9yIGZvciB0aGUgY3VycmVudCBmaWxlXG5cdFx0XHRcdGF3YWl0IHZpZXc/Lm9wZW5DaGFuZ2VzKGNoYW5nZXNbbmF2aWdhdGlvbi5jdXJyZW50XS5tb2RpZmllZFVyaSA/PyBjaGFuZ2VzW25hdmlnYXRpb24uY3VycmVudF0ub3JpZ2luYWxVcmkpO1xuXG5cdFx0XHRcdC8vIENsb3NlIHRoZSBlZGl0b3IgaW4gdGhlIG1vZGFsIGVkaXRvciAoYXNzdW1lIHRoYXQgdGhlXG5cdFx0XHRcdC8vIG11bHRpLWZpbGUgZGlmZiBlZGl0b3IgaXMgdGhlIGZpcnN0IGVkaXRvciBpbiB0aGUgbW9kYWxcblx0XHRcdFx0Ly8gZWRpdG9yKVxuXHRcdFx0XHRhd2FpdCBhY3RpdmVHcm91cC5jbG9zZUVkaXRvcihhY3RpdmVHcm91cC5lZGl0b3JzWzBdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBNb3ZlIGFsbCByZW1haW5pbmcgZWRpdG9ycyB0byB0aGUgbWFpbiBlZGl0b3IgcGFydFxuXHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE1PVkVfTU9EQUxfRURJVE9SX1RPX01BSU5fQ09NTUFORF9JRCk7XG5cblx0XHQvLyBNYXhpbWl6ZVxuXHRcdGlmIChpc01heGltaXplZCkge1xuXHRcdFx0bGF5b3V0U2VydmljZS5zZXRFZGl0b3JNYXhpbWl6ZWQodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gRm9jdXNcblx0XHRlZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKE9wZW5Nb2RhbEVkaXRvckluRWRpdG9yQWN0aW9uKTtcblxuY2xhc3MgQWRkRmlsZUFzQ29udGV4dEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLmFkZEZpbGVBc0NvbnRleHQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IHByZWNvbmRpdGlvbiA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0QWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oVEVYVF9GSUxFX0VESVRPUl9JRClcblx0XHQpO1xuXG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFkZEZpbGVBc0NvbnRleHRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZGRGaWxlQXNDb250ZXh0JywgXCJBZGQgRmlsZSBhcyBDb250ZXh0XCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGljb246IENvZGljb24uYXR0YWNoLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb24sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudXMuU2Vzc2lvbnNFZGl0b3JUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEwMDAwMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKHByZWNvbmRpdGlvbiwgc2luZ2xlUGFuZURldGFpbFBhbmVsKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTAwMDAwLCAvLyB0b3dhcmRzIHRoZSBmYXIgcmlnaHQsIG1pcnJvcmluZyBTcGxpdCBFZGl0b3IgUmlnaHQgaW4gdGhlIHJlZ3VsYXIgd2luZG93XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChwcmVjb25kaXRpb24sIG5vdFNpbmdsZVBhbmVEZXRhaWxQYW5lbClcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc1BhcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1BhcnRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgZWRpdG9yU2VydmljZSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc291cmNlcyA9IHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9yc1xuXHRcdFx0LmZsYXRNYXAoZ3JvdXBlZEVkaXRvciA9PiBncm91cGVkRWRpdG9yLmVkaXRvcnMpXG5cdFx0XHQubWFwKGVkaXRvciA9PiBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaShlZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KSlcblx0XHRcdC5maWx0ZXIoKHVyaSk6IHVyaSBpcyBVUkkgPT4gdXJpICE9PSB1bmRlZmluZWQgJiYgW1NjaGVtYXMuZmlsZSwgU2NoZW1hcy52c2NvZGVSZW1vdGUsIFNjaGVtYXMudW50aXRsZWRdLmluY2x1ZGVzKHVyaS5zY2hlbWUpKTtcblx0XHRpZiAocmVzb3VyY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQ7XG5cdFx0c2Vzc2lvbnNQYXJ0U2VydmljZS5nZXRTZXNzaW9uVmlldyhzZXNzaW9uSWQpPy5hdHRhY2gocmVzb3VyY2VzKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoQWRkRmlsZUFzQ29udGV4dEFjdGlvbik7XG5cbi8qKlxuICogTWlycm9ycyBleHRlbnNpb24tY29udHJpYnV0ZWQgYGVkaXRvci90aXRsZWAgaXRlbXMgaW50byB7QGxpbmsgTWVudXMuU2Vzc2lvbnNFZGl0b3JUaXRsZX1cbiAqIHNvIHRoZXkgYXJlIG5vdCBsb3N0IGluIHRoZSBzaW5nbGUtcGFuZSBsYXlvdXQuIFNlZSBgTEFZT1VULm1kYCBmb3IgZGV0YWlscy5cbiAqL1xuZXhwb3J0IGNsYXNzIEVkaXRvclRpdGxlTWVudUJyaWRnZUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuc2Vzc2lvbnMuZWRpdG9yVGl0bGVNZW51QnJpZGdlJztcblxuXHQvLyBFeHRlbnNpb24gc3VibWVudXMgYXJlIHJlZ2lzdGVyZWQgd2l0aCBhIGBNZW51SWQuZm9yKCdhcGk6PGlkPicpYCBpZCAoc2VlIHRoZVxuXHQvLyBgc3VibWVudXNgIGV4dGVuc2lvbiBwb2ludCksIHdoaWNoIGRpc3Rpbmd1aXNoZXMgdGhlbSBmcm9tIGNvcmUgc3VibWVudXMuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9leHRlbnNpb25TdWJtZW51UHJlZml4ID0gJ2FwaTonO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21pcnJvcmVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKCFsYXlvdXRTZXJ2aWNlLmlzU2luZ2xlUGFuZUxheW91dEVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zeW5jKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoTWVudVJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlTWVudShlID0+IHtcblx0XHRcdGlmIChlLmhhcyhNZW51SWQuRWRpdG9yVGl0bGUpKSB7XG5cdFx0XHRcdHRoaXMuX3N5bmMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9zeW5jKCk6IHZvaWQge1xuXHRcdHRoaXMuX21pcnJvcmVkLmNsZWFyKCk7XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgTWVudVJlZ2lzdHJ5LmdldE1lbnVJdGVtcyhNZW51SWQuRWRpdG9yVGl0bGUpKSB7XG5cdFx0XHQvLyBCcmlkZ2Ugb25seSBleHRlbnNpb24gY29udHJpYnV0aW9uczogY29tbWFuZCBpdGVtcyB3aG9zZSBjb21tYW5kIGNhcnJpZXMgYVxuXHRcdFx0Ly8gYHNvdXJjZWAgKHNldCBieSB0aGUgYGNvbW1hbmRzYCBleHRlbnNpb24gcG9pbnQpLCBhbmQgc3VibWVudSBpdGVtcyB3aG9zZVxuXHRcdFx0Ly8gc3VibWVudSBpcyBhbiBleHRlbnNpb24gYGFwaTpgIG1lbnUuIENvcmUgaXRlbXMgaGF2ZSBuZWl0aGVyLlxuXHRcdFx0Y29uc3QgaXNFeHRlbnNpb25JdGVtID0gaXNJTWVudUl0ZW0oaXRlbSlcblx0XHRcdFx0PyAhIWl0ZW0uY29tbWFuZC5zb3VyY2Vcblx0XHRcdFx0OiBpdGVtLnN1Ym1lbnUuaWQuc3RhcnRzV2l0aChFZGl0b3JUaXRsZU1lbnVCcmlkZ2VDb250cmlidXRpb24uX2V4dGVuc2lvblN1Ym1lbnVQcmVmaXgpO1xuXHRcdFx0aWYgKGlzRXh0ZW5zaW9uSXRlbSkge1xuXHRcdFx0XHR0aGlzLl9taXJyb3JlZC5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVzLlNlc3Npb25zRWRpdG9yVGl0bGUsIGl0ZW0pKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEVkaXRvclRpdGxlTWVudUJyaWRnZUNvbnRyaWJ1dGlvbi5JRCwgRWRpdG9yVGl0bGVNZW51QnJpZGdlQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsT0FBTztBQUNQLFNBQVMscUJBQXFCLHFCQUFxQixrQkFBa0IsMEJBQTBCO0FBQy9GLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsZUFBZTtBQUd4QixTQUFTLFNBQVMsYUFBYSxRQUFRLGNBQWMsdUJBQXVCO0FBQzVFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCLDRCQUE0Qix3QkFBd0IsMEJBQTBCLHlCQUF5Qiw4QkFB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
