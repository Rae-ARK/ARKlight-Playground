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
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { IViewsService } from "../../../../workbench/services/views/common/viewsService.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { ActiveSessionContextKeys, CHANGES_VIEW_ID, ChangesContextKeys, ChangesViewMode, SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING } from "../common/changes.js";
import { ActiveEditorContext, AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from "../../../../workbench/common/contextkeys.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { IChangesViewService } from "../common/changesViewService.js";
import { Menus } from "../../../browser/menus.js";
import { SessionChangesEditor } from "./sessionChangesEditor.js";
import { CHANGES_HEADER_ACTIONS_ID } from "./changesView.js";
import { SinglePaneLayoutEnabledContext } from "../../../common/contextkeys.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { TOGGLE_DIFF_SIDE_BY_SIDE } from "../../../../workbench/browser/parts/editor/diffEditorCommands.js";
import { logChangesViewViewModeChange } from "../../../common/sessionsTelemetry.js";
import { ChangesetHasOperationsContext } from "./changesViewService.js";
const openChangesViewActionOptions = {
  id: "workbench.action.agentSessions.openChangesView",
  title: localize2("openChangesView", "Changes"),
  icon: Codicon.diffMultiple,
  f1: false
};
class OpenChangesViewAction extends Action2 {
  constructor() {
    super(openChangesViewActionOptions);
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    await viewsService.openView(CHANGES_VIEW_ID, true);
  }
}
OpenChangesViewAction.ID = openChangesViewActionOptions.id;
registerAction2(OpenChangesViewAction);
let ChangesViewActionsContribution = class extends Disposable {
  constructor(contextKeyService, sessionsService, changesViewService) {
    super();
    this._register(bindContextKey(ActiveSessionContextKeys.HasChanges, contextKeyService, (reader) => {
      const activeSession = sessionsService.activeSession.read(reader);
      if (!activeSession) {
        return false;
      }
      const changes = activeSession.changes.read(reader);
      return changes.length > 0;
    }));
    this._register(bindContextKey(ChangesContextKeys.ViewMode, contextKeyService, (reader) => {
      return changesViewService.viewModeObs.read(reader);
    }));
  }
};
ChangesViewActionsContribution.ID = "workbench.contrib.changesViewActions";
ChangesViewActionsContribution = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ISessionsService),
  __decorateParam(2, IChangesViewService)
], ChangesViewActionsContribution);
registerWorkbenchContribution2(ChangesViewActionsContribution.ID, ChangesViewActionsContribution, WorkbenchPhase.AfterRestored);
const _OpenPullRequestAction = class _OpenPullRequestAction extends Action2 {
  constructor() {
    super({
      id: _OpenPullRequestAction.ID,
      title: localize2("openPullRequest", "Open Pull Request"),
      icon: Codicon.gitPullRequest,
      f1: false,
      menu: {
        id: MenuId.AgentsChangesToolbar,
        group: "navigation",
        order: 9,
        when: ContextKeyExpr.and(
          IsSessionsWindowContext,
          ActiveSessionContextKeys.HasPullRequest
        )
      }
    });
  }
  async run(accessor) {
    const openerService = accessor.get(IOpenerService);
    const sessionsService = accessor.get(ISessionsService);
    const activeSession = sessionsService.activeSession.get();
    if (!activeSession) {
      return;
    }
    const gitHubInfo = activeSession.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
    if (!gitHubInfo?.pullRequest?.uri) {
      return;
    }
    await openerService.open(gitHubInfo.pullRequest.uri);
  }
};
_OpenPullRequestAction.ID = "workbench.action.agentSessions.openPullRequest";
let OpenPullRequestAction = _OpenPullRequestAction;
registerAction2(OpenPullRequestAction);
const singlePaneChangesEditorActive = ContextKeyExpr.and(
  IsSessionsWindowContext,
  ActiveEditorContext.isEqualTo(SessionChangesEditor.ID),
  SinglePaneLayoutEnabledContext
);
const singlePaneChangesEditorTitle = ContextKeyExpr.and(
  singlePaneChangesEditorActive,
  IsAuxiliaryWindowContext.toNegated(),
  IsTopRightEditorGroupContext
);
const singlePaneChangesEditorTitleVisible = ContextKeyExpr.and(
  singlePaneChangesEditorTitle,
  MainEditorAreaVisibleContext
);
class ChangesHeaderActionsAction extends Action2 {
  constructor() {
    super({
      id: CHANGES_HEADER_ACTIONS_ID,
      title: localize2("changesView.headerActions", "Changes Actions"),
      f1: false,
      menu: {
        id: Menus.SessionsEditorTitle,
        group: "navigation",
        order: 5,
        when: ContextKeyExpr.and(
          singlePaneChangesEditorTitle,
          ChangesetHasOperationsContext
        )
      }
    });
  }
  async run() {
  }
}
registerAction2(ChangesHeaderActionsAction);
const _SetChangesListViewModeAction = class _SetChangesListViewModeAction extends Action2 {
  constructor() {
    super({
      id: _SetChangesListViewModeAction.ID,
      title: localize2("agentSessions.setChangesListViewMode", "View as List"),
      icon: Codicon.listFlat,
      f1: false,
      menu: {
        // Always in the overflow ("…") of the right header, whether the editor
        // area is visible or collapsed (as long as the changes list is shown).
        id: Menus.SessionsEditorHeaderSecondary,
        group: "secondary",
        order: 20,
        when: ContextKeyExpr.and(
          singlePaneChangesEditorTitle,
          AuxiliaryBarVisibleContext,
          ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.Tree)
        )
      }
    });
  }
  run(accessor) {
    logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.List);
    accessor.get(IChangesViewService).setViewMode(ChangesViewMode.List);
  }
};
_SetChangesListViewModeAction.ID = "workbench.action.agentSessions.setChangesListViewMode";
let SetChangesListViewModeAction = _SetChangesListViewModeAction;
registerAction2(SetChangesListViewModeAction);
const _SetChangesTreeViewModeAction = class _SetChangesTreeViewModeAction extends Action2 {
  constructor() {
    super({
      id: _SetChangesTreeViewModeAction.ID,
      title: localize2("agentSessions.setChangesTreeViewMode", "View as Tree"),
      icon: Codicon.listTree,
      f1: false,
      menu: {
        // Always in the overflow ("…") of the right header, whether the editor
        // area is visible or collapsed (as long as the changes list is shown).
        id: Menus.SessionsEditorHeaderSecondary,
        group: "secondary",
        order: 20,
        when: ContextKeyExpr.and(
          singlePaneChangesEditorTitle,
          AuxiliaryBarVisibleContext,
          ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.List)
        )
      }
    });
  }
  run(accessor) {
    logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.Tree);
    accessor.get(IChangesViewService).setViewMode(ChangesViewMode.Tree);
  }
};
_SetChangesTreeViewModeAction.ID = "workbench.action.agentSessions.setChangesTreeViewMode";
let SetChangesTreeViewModeAction = _SetChangesTreeViewModeAction;
registerAction2(SetChangesTreeViewModeAction);
const _CollapseAllSessionChangesDiffsAction = class _CollapseAllSessionChangesDiffsAction extends Action2 {
  constructor() {
    super({
      id: _CollapseAllSessionChangesDiffsAction.ID,
      title: localize2("agentSessions.collapseAllDiffs", "Collapse All Diffs"),
      icon: Codicon.collapseAll,
      f1: false,
      menu: {
        id: Menus.SessionsEditorHeaderSecondary,
        group: "1_diff",
        order: 10,
        when: ContextKeyExpr.and(
          singlePaneChangesEditorTitleVisible,
          ContextKeyExpr.not("multiDiffEditorAllCollapsed")
        )
      }
    });
  }
  run(accessor) {
    const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
    if (activeEditorPane instanceof SessionChangesEditor) {
      activeEditorPane.collapseAllDiffs();
    }
  }
};
_CollapseAllSessionChangesDiffsAction.ID = "workbench.action.agentSessions.collapseAllDiffs";
let CollapseAllSessionChangesDiffsAction = _CollapseAllSessionChangesDiffsAction;
registerAction2(CollapseAllSessionChangesDiffsAction);
const _ExpandAllSessionChangesDiffsAction = class _ExpandAllSessionChangesDiffsAction extends Action2 {
  constructor() {
    super({
      id: _ExpandAllSessionChangesDiffsAction.ID,
      title: localize2("agentSessions.expandAllDiffs", "Expand All Diffs"),
      icon: Codicon.expandAll,
      f1: false,
      menu: {
        id: Menus.SessionsEditorHeaderSecondary,
        group: "1_diff",
        order: 10,
        when: ContextKeyExpr.and(
          singlePaneChangesEditorActive,
          IsAuxiliaryWindowContext.toNegated(),
          IsTopRightEditorGroupContext,
          MainEditorAreaVisibleContext,
          ContextKeyExpr.has("multiDiffEditorAllCollapsed")
        )
      }
    });
  }
  run(accessor) {
    const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
    if (activeEditorPane instanceof SessionChangesEditor) {
      activeEditorPane.expandAllDiffs();
    }
  }
};
_ExpandAllSessionChangesDiffsAction.ID = "workbench.action.agentSessions.expandAllDiffs";
let ExpandAllSessionChangesDiffsAction = _ExpandAllSessionChangesDiffsAction;
registerAction2(ExpandAllSessionChangesDiffsAction);
MenuRegistry.appendMenuItem(Menus.SessionsEditorHeaderSecondary, {
  command: {
    id: TOGGLE_DIFF_SIDE_BY_SIDE,
    title: localize("showSideBySideDiff", "Show Side by Side Diff"),
    icon: Codicon.diffSidebyside,
    toggled: {
      condition: EditorContextKeys.multiDiffEditorRenderSideBySide,
      title: localize("showInlineDiff", "Show Inline Diff")
    }
  },
  group: "1_diff",
  order: 20,
  when: singlePaneChangesEditorTitleVisible
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: TOGGLE_DIFF_SIDE_BY_SIDE,
    title: localize2("toggleDiffView", "Toggle Diff View"),
    category: localize2("changes", "Changes")
  },
  when: singlePaneChangesEditorTitleVisible
});
const _OpenChangesAction = class _OpenChangesAction extends Action2 {
  constructor() {
    super({
      id: _OpenChangesAction.ID,
      title: localize2("openChanges", "Open Changes"),
      icon: Codicon.gitCompare,
      f1: false
    });
  }
  async run(accessor, _sessionResource, _ref, ...resources) {
    const editorService = accessor.get(IEditorService);
    const changesViewService = accessor.get(IChangesViewService);
    const sessionChanges = changesViewService.activeSessionChangesObs.get();
    const changes = sessionChanges?.filter(
      (change) => resources.some((resource) => isEqual(change.modifiedUri ?? change.originalUri, resource))
    ) ?? [];
    await Promise.all(changes.map((change) => editorService.openEditor({
      original: { resource: change.originalUri },
      modified: { resource: change.modifiedUri }
    })));
  }
};
_OpenChangesAction.ID = "workbench.action.agentSessions.openChanges";
let OpenChangesAction = _OpenChangesAction;
registerAction2(OpenChangesAction);
const openSingleFileDiffEnabled = ContextKeyExpr.equals(`config.${SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING}`, true);
const _OpenFileAction = class _OpenFileAction extends Action2 {
  constructor() {
    super({
      id: _OpenFileAction.ID,
      title: localize2("openFile", "Open File"),
      icon: Codicon.goToFile,
      f1: false,
      menu: [
        // When opening a file already shows a single file diff, the "Open
        // Changes" alt action is redundant and is therefore omitted.
        {
          id: MenuId.AgentsChangeInlineToolbar,
          group: "navigation",
          order: 1,
          when: ContextKeyExpr.and(
            IsSessionsWindowContext,
            ChangesContextKeys.ChangeKind.isEqualTo("file"),
            openSingleFileDiffEnabled
          )
        },
        // Default behavior: the alt action ("Open Changes") opens a diff
        // editor for the selected change(s).
        {
          id: MenuId.AgentsChangeInlineToolbar,
          group: "navigation",
          order: 1,
          alt: {
            id: OpenChangesAction.ID,
            title: localize2("openChanges", "Open Changes"),
            icon: Codicon.gitCompare
          },
          when: ContextKeyExpr.and(
            IsSessionsWindowContext,
            ChangesContextKeys.ChangeKind.isEqualTo("file"),
            openSingleFileDiffEnabled.negate()
          )
        }
      ]
    });
  }
  async run(accessor, _sessionResource, _ref, ...resources) {
    const editorService = accessor.get(IEditorService);
    await Promise.all(resources.map((resource) => editorService.openEditor({ resource })));
  }
};
_OpenFileAction.ID = "workbench.action.agentSessions.openFile";
let OpenFileAction = _OpenFileAction;
registerAction2(OpenFileAction);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhbmdlcy9icm93c2VyL2NoYW5nZXNWaWV3QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSUFjdGlvbjJPcHRpb25zLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgYmluZENvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMsIENIQU5HRVNfVklFV19JRCwgQ2hhbmdlc0NvbnRleHRLZXlzLCBDaGFuZ2VzVmlld01vZGUsIFNFU1NJT05TX0NIQU5HRVNfT1BFTl9TSU5HTEVfRklMRV9ESUZGX1NFVFRJTkcgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlcy5qcyc7XG5pbXBvcnQgeyBBY3RpdmVFZGl0b3JDb250ZXh0LCBBdXhpbGlhcnlCYXJWaXNpYmxlQ29udGV4dCwgSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgSXNUb3BSaWdodEVkaXRvckdyb3VwQ29udGV4dCwgTWFpbkVkaXRvckFyZWFWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGFuZ2VzVmlld1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ2hhbmdlc0VkaXRvciB9IGZyb20gJy4vc2Vzc2lvbkNoYW5nZXNFZGl0b3IuanMnO1xuaW1wb3J0IHsgQ0hBTkdFU19IRUFERVJfQUNUSU9OU19JRCB9IGZyb20gJy4vY2hhbmdlc1ZpZXcuanMnO1xuaW1wb3J0IHsgU2luZ2xlUGFuZUxheW91dEVuYWJsZWRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgVE9HR0xFX0RJRkZfU0lERV9CWV9TSURFIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2RpZmZFZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBsb2dDaGFuZ2VzVmlld1ZpZXdNb2RlQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25zVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IENoYW5nZXNldEhhc09wZXJhdGlvbnNDb250ZXh0IH0gZnJvbSAnLi9jaGFuZ2VzVmlld1NlcnZpY2UuanMnO1xuXG5jb25zdCBvcGVuQ2hhbmdlc1ZpZXdBY3Rpb25PcHRpb25zOiBJQWN0aW9uMk9wdGlvbnMgPSB7XG5cdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLm9wZW5DaGFuZ2VzVmlldycsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5DaGFuZ2VzVmlldycsIFwiQ2hhbmdlc1wiKSxcblx0aWNvbjogQ29kaWNvbi5kaWZmTXVsdGlwbGUsXG5cdGYxOiBmYWxzZSxcbn07XG5cbmNsYXNzIE9wZW5DaGFuZ2VzVmlld0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9IG9wZW5DaGFuZ2VzVmlld0FjdGlvbk9wdGlvbnMuaWQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIob3BlbkNoYW5nZXNWaWV3QWN0aW9uT3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0YXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3KENIQU5HRVNfVklFV19JRCwgdHJ1ZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKE9wZW5DaGFuZ2VzVmlld0FjdGlvbik7XG5cbmNsYXNzIENoYW5nZXNWaWV3QWN0aW9uc0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhbmdlc1ZpZXdBY3Rpb25zJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2Ugc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIGNoYW5nZXNWaWV3U2VydmljZTogSUNoYW5nZXNWaWV3U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIEJpbmQgY29udGV4dCBrZXk6IHRydWUgd2hlbiB0aGUgYWN0aXZlIHNlc3Npb24gaGFzIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMuSGFzQ2hhbmdlcywgY29udGV4dEtleVNlcnZpY2UsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNoYW5nZXMgPSBhY3RpdmVTZXNzaW9uLmNoYW5nZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIGNoYW5nZXMubGVuZ3RoID4gMDtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShDaGFuZ2VzQ29udGV4dEtleXMuVmlld01vZGUsIGNvbnRleHRLZXlTZXJ2aWNlLCByZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIGNoYW5nZXNWaWV3U2VydmljZS52aWV3TW9kZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0fSkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGFuZ2VzVmlld0FjdGlvbnNDb250cmlidXRpb24uSUQsIENoYW5nZXNWaWV3QWN0aW9uc0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5cbmNsYXNzIE9wZW5QdWxsUmVxdWVzdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLm9wZW5QdWxsUmVxdWVzdCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5QdWxsUmVxdWVzdEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5QdWxsUmVxdWVzdCcsIFwiT3BlbiBQdWxsIFJlcXVlc3RcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmdpdFB1bGxSZXF1ZXN0LFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50c0NoYW5nZXNUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogOSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0XHRcdEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNQdWxsUmVxdWVzdClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2l0SHViSW5mbyA9IGFjdGl2ZVNlc3Npb24ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5Py5naXRIdWJJbmZvLmdldCgpO1xuXHRcdGlmICghZ2l0SHViSW5mbz8ucHVsbFJlcXVlc3Q/LnVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IG9wZW5lclNlcnZpY2Uub3BlbihnaXRIdWJJbmZvLnB1bGxSZXF1ZXN0LnVyaSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKE9wZW5QdWxsUmVxdWVzdEFjdGlvbik7XG5cbmNvbnN0IHNpbmdsZVBhbmVDaGFuZ2VzRWRpdG9yQWN0aXZlID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0QWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oU2Vzc2lvbkNoYW5nZXNFZGl0b3IuSUQpLFxuXHRTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZENvbnRleHRcbik7XG5cbi8vIFRpdGxlLWJhciAodGFiLXJvdykgZ2F0ZSB0aGF0IGRvZXMgTk9UIHJlcXVpcmUgdGhlIGVkaXRvciBjb250ZW50IGFyZWEgdG8gYmVcbi8vIHZpc2libGUsIHNvIHNlc3Npb24tbGV2ZWwgdGl0bGUgYWN0aW9ucyAoZS5nLiBDcmVhdGUgUHVsbCBSZXF1ZXN0KSBzdGF5IGF2YWlsYWJsZVxuLy8gd2hlbiB0aGUgZWRpdG9yIGFyZWEgaXMgY2xvc2VkIGJ1dCB0aGUgZG9ja2VkIHRhYiBiYXIgaXMgc3RpbGwgc2hvd24uXG5jb25zdCBzaW5nbGVQYW5lQ2hhbmdlc0VkaXRvclRpdGxlID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRzaW5nbGVQYW5lQ2hhbmdlc0VkaXRvckFjdGl2ZSxcblx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRJc1RvcFJpZ2h0RWRpdG9yR3JvdXBDb250ZXh0XG4pO1xuXG5jb25zdCBzaW5nbGVQYW5lQ2hhbmdlc0VkaXRvclRpdGxlVmlzaWJsZSA9IENvbnRleHRLZXlFeHByLmFuZChcblx0c2luZ2xlUGFuZUNoYW5nZXNFZGl0b3JUaXRsZSxcblx0TWFpbkVkaXRvckFyZWFWaXNpYmxlQ29udGV4dFxuKTtcblxuLyoqXG4gKiBBbmNob3IgYWN0aW9uIGhvc3RpbmcgdGhlIENyZWF0ZSBQdWxsIFJlcXVlc3QgYnV0dG9uIGJhciAoe0BsaW5rIENoYW5nZXNBY3Rpb25zQmFyfSlcbiAqIGluIHRoZSBzaW5nbGUtcGFuZSBlZGl0b3IgdGFicyB0aXRsZSAodGhlIGVkaXRvci1hY3Rpb25zIGFyZWEgb2YgdGhlIGRvY2tlZCB0YWIgYmFyKS5cbiAqIFRoZSBjdXN0b20gYWN0aW9uIHZpZXcgaXRlbSBpcyBwcm92aWRlZCBieSB0aGUgQ2hhbmdlcyBlZGl0b3IgcGFuZVxuICogKHtAbGluayBTZXNzaW9uQ2hhbmdlc0VkaXRvci5nZXRBY3Rpb25WaWV3SXRlbX0pIHdoZW4gdGhlIENoYW5nZXMgZWRpdG9yIGlzIGFjdGl2ZSxcbiAqIHNvIHRoZSBhbmNob3IgaXMgZ2F0ZWQgb24gdGhlIHNhbWUuIFRoZSBiYXIgaGlkZXMgaXRzZWxmIHdoZW4gaXRzIHVuZGVybHlpbmcgbWVudSBoYXNcbiAqIG5vIGFjdGlvbnMuXG4gKi9cbmNsYXNzIENoYW5nZXNIZWFkZXJBY3Rpb25zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDSEFOR0VTX0hFQURFUl9BQ1RJT05TX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhbmdlc1ZpZXcuaGVhZGVyQWN0aW9ucycsIFwiQ2hhbmdlcyBBY3Rpb25zXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudXMuU2Vzc2lvbnNFZGl0b3JUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRzaW5nbGVQYW5lQ2hhbmdlc0VkaXRvclRpdGxlLFxuXHRcdFx0XHRcdENoYW5nZXNldEhhc09wZXJhdGlvbnNDb250ZXh0XG5cdFx0XHRcdClcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyB9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihDaGFuZ2VzSGVhZGVyQWN0aW9uc0FjdGlvbik7XG5cblxuY2xhc3MgU2V0Q2hhbmdlc0xpc3RWaWV3TW9kZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLnNldENoYW5nZXNMaXN0Vmlld01vZGUnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTZXRDaGFuZ2VzTGlzdFZpZXdNb2RlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRTZXNzaW9ucy5zZXRDaGFuZ2VzTGlzdFZpZXdNb2RlJywgXCJWaWV3IGFzIExpc3RcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmxpc3RGbGF0LFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHQvLyBBbHdheXMgaW4gdGhlIG92ZXJmbG93IChcIlx1MjAyNlwiKSBvZiB0aGUgcmlnaHQgaGVhZGVyLCB3aGV0aGVyIHRoZSBlZGl0b3Jcblx0XHRcdFx0Ly8gYXJlYSBpcyB2aXNpYmxlIG9yIGNvbGxhcHNlZCAoYXMgbG9uZyBhcyB0aGUgY2hhbmdlcyBsaXN0IGlzIHNob3duKS5cblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyU2Vjb25kYXJ5LFxuXHRcdFx0XHRncm91cDogJ3NlY29uZGFyeScsXG5cdFx0XHRcdG9yZGVyOiAyMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdHNpbmdsZVBhbmVDaGFuZ2VzRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0QXV4aWxpYXJ5QmFyVmlzaWJsZUNvbnRleHQsXG5cdFx0XHRcdFx0Q2hhbmdlc0NvbnRleHRLZXlzLlZpZXdNb2RlLmlzRXF1YWxUbyhDaGFuZ2VzVmlld01vZGUuVHJlZSkpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRsb2dDaGFuZ2VzVmlld1ZpZXdNb2RlQ2hhbmdlKGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSksIENoYW5nZXNWaWV3TW9kZS5MaXN0KTtcblx0XHRhY2Nlc3Nvci5nZXQoSUNoYW5nZXNWaWV3U2VydmljZSkuc2V0Vmlld01vZGUoQ2hhbmdlc1ZpZXdNb2RlLkxpc3QpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihTZXRDaGFuZ2VzTGlzdFZpZXdNb2RlQWN0aW9uKTtcblxuY2xhc3MgU2V0Q2hhbmdlc1RyZWVWaWV3TW9kZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLnNldENoYW5nZXNUcmVlVmlld01vZGUnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTZXRDaGFuZ2VzVHJlZVZpZXdNb2RlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRTZXNzaW9ucy5zZXRDaGFuZ2VzVHJlZVZpZXdNb2RlJywgXCJWaWV3IGFzIFRyZWVcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmxpc3RUcmVlLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHQvLyBBbHdheXMgaW4gdGhlIG92ZXJmbG93IChcIlx1MjAyNlwiKSBvZiB0aGUgcmlnaHQgaGVhZGVyLCB3aGV0aGVyIHRoZSBlZGl0b3Jcblx0XHRcdFx0Ly8gYXJlYSBpcyB2aXNpYmxlIG9yIGNvbGxhcHNlZCAoYXMgbG9uZyBhcyB0aGUgY2hhbmdlcyBsaXN0IGlzIHNob3duKS5cblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyU2Vjb25kYXJ5LFxuXHRcdFx0XHRncm91cDogJ3NlY29uZGFyeScsXG5cdFx0XHRcdG9yZGVyOiAyMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdHNpbmdsZVBhbmVDaGFuZ2VzRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0QXV4aWxpYXJ5QmFyVmlzaWJsZUNvbnRleHQsXG5cdFx0XHRcdFx0Q2hhbmdlc0NvbnRleHRLZXlzLlZpZXdNb2RlLmlzRXF1YWxUbyhDaGFuZ2VzVmlld01vZGUuTGlzdCkpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRsb2dDaGFuZ2VzVmlld1ZpZXdNb2RlQ2hhbmdlKGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSksIENoYW5nZXNWaWV3TW9kZS5UcmVlKTtcblx0XHRhY2Nlc3Nvci5nZXQoSUNoYW5nZXNWaWV3U2VydmljZSkuc2V0Vmlld01vZGUoQ2hhbmdlc1ZpZXdNb2RlLlRyZWUpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihTZXRDaGFuZ2VzVHJlZVZpZXdNb2RlQWN0aW9uKTtcblxuY2xhc3MgQ29sbGFwc2VBbGxTZXNzaW9uQ2hhbmdlc0RpZmZzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMuY29sbGFwc2VBbGxEaWZmcyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbGxhcHNlQWxsU2Vzc2lvbkNoYW5nZXNEaWZmc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FnZW50U2Vzc2lvbnMuY29sbGFwc2VBbGxEaWZmcycsIFwiQ29sbGFwc2UgQWxsIERpZmZzXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jb2xsYXBzZUFsbCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyU2Vjb25kYXJ5LFxuXHRcdFx0XHRncm91cDogJzFfZGlmZicsXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdHNpbmdsZVBhbmVDaGFuZ2VzRWRpdG9yVGl0bGVWaXNpYmxlLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdCgnbXVsdGlEaWZmRWRpdG9yQWxsQ29sbGFwc2VkJykpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmIChhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgU2Vzc2lvbkNoYW5nZXNFZGl0b3IpIHtcblx0XHRcdGFjdGl2ZUVkaXRvclBhbmUuY29sbGFwc2VBbGxEaWZmcygpO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoQ29sbGFwc2VBbGxTZXNzaW9uQ2hhbmdlc0RpZmZzQWN0aW9uKTtcblxuY2xhc3MgRXhwYW5kQWxsU2Vzc2lvbkNoYW5nZXNEaWZmc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLmV4cGFuZEFsbERpZmZzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRXhwYW5kQWxsU2Vzc2lvbkNoYW5nZXNEaWZmc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FnZW50U2Vzc2lvbnMuZXhwYW5kQWxsRGlmZnMnLCBcIkV4cGFuZCBBbGwgRGlmZnNcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmV4cGFuZEFsbCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyU2Vjb25kYXJ5LFxuXHRcdFx0XHRncm91cDogJzFfZGlmZicsXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdHNpbmdsZVBhbmVDaGFuZ2VzRWRpdG9yQWN0aXZlLFxuXHRcdFx0XHRcdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRJc1RvcFJpZ2h0RWRpdG9yR3JvdXBDb250ZXh0LFxuXHRcdFx0XHRcdE1haW5FZGl0b3JBcmVhVmlzaWJsZUNvbnRleHQsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdtdWx0aURpZmZFZGl0b3JBbGxDb2xsYXBzZWQnKSlcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBTZXNzaW9uQ2hhbmdlc0VkaXRvcikge1xuXHRcdFx0YWN0aXZlRWRpdG9yUGFuZS5leHBhbmRBbGxEaWZmcygpO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoRXhwYW5kQWxsU2Vzc2lvbkNoYW5nZXNEaWZmc0FjdGlvbik7XG5cbi8vIFRoZSBBZ2VudHMgd2luZG93IHJldXNlcyB0aGUgd29ya2JlbmNoIGB0b2dnbGUuZGlmZi5yZW5kZXJTaWRlQnlTaWRlYCBjb21tYW5kIHNvIGFcbi8vIHVzZXIncyBrZXliaW5kaW5nIGZvciBpdCBjYXJyaWVzIG92ZXIgaGVyZSAoaXNzdWUgIzMyNDc2NSkuIFRoZSBzZXNzaW9ucyBvdmVycmlkZSBvZlxuLy8gSURpZmZFZGl0b3JDb21tYW5kc1NlcnZpY2UgZmxpcHMgdGhlIHdvcmtzcGFjZSBgZGlmZkVkaXRvci5yZW5kZXJTaWRlQnlTaWRlYCBzZXR0aW5nLFxuLy8gd2hpY2ggdGhlIENoYW5nZXMgZWRpdG9yIG9ic2VydmVzLlxuXG4vLyBQcmltYXJ5IGhlYWRlciBidXR0b24gd2l0aCBzdGF0ZS1zcGVjaWZpYyB0aXRsZXM6IFwiU2hvdyBTaWRlIGJ5IFNpZGUgRGlmZlwiIHdoZW5cbi8vIGN1cnJlbnRseSBpbmxpbmUsIGFuZCAoY2hlY2tlZCkgXCJTaG93IElubGluZSBEaWZmXCIgd2hlbiBjdXJyZW50bHkgc2lkZSBieSBzaWRlLlxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyU2Vjb25kYXJ5LCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogVE9HR0xFX0RJRkZfU0lERV9CWV9TSURFLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2hvd1NpZGVCeVNpZGVEaWZmJywgXCJTaG93IFNpZGUgYnkgU2lkZSBEaWZmXCIpLFxuXHRcdGljb246IENvZGljb24uZGlmZlNpZGVieXNpZGUsXG5cdFx0dG9nZ2xlZDoge1xuXHRcdFx0Y29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy5tdWx0aURpZmZFZGl0b3JSZW5kZXJTaWRlQnlTaWRlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaG93SW5saW5lRGlmZicsIFwiU2hvdyBJbmxpbmUgRGlmZlwiKSxcblx0XHR9LFxuXHR9LFxuXHRncm91cDogJzFfZGlmZicsXG5cdG9yZGVyOiAyMCxcblx0d2hlbjogc2luZ2xlUGFuZUNoYW5nZXNFZGl0b3JUaXRsZVZpc2libGVcbn0pO1xuXG4vLyBEaXNjb3ZlcmFibGUgaW4gdGhlIGNvbW1hbmQgcGFsZXR0ZSB3aGlsZSB0aGUgQ2hhbmdlcyBlZGl0b3IgaXMgdmlzaWJsZS5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBUT0dHTEVfRElGRl9TSURFX0JZX1NJREUsXG5cdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlRGlmZlZpZXcnLCBcIlRvZ2dsZSBEaWZmIFZpZXdcIiksXG5cdFx0Y2F0ZWdvcnk6IGxvY2FsaXplMignY2hhbmdlcycsIFwiQ2hhbmdlc1wiKSxcblx0fSxcblx0d2hlbjogc2luZ2xlUGFuZUNoYW5nZXNFZGl0b3JUaXRsZVZpc2libGVcbn0pO1xuXG5jbGFzcyBPcGVuQ2hhbmdlc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLm9wZW5DaGFuZ2VzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlbkNoYW5nZXNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuQ2hhbmdlcycsIFwiT3BlbiBDaGFuZ2VzXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5naXRDb21wYXJlLFxuXHRcdFx0ZjE6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgX3JlZjogc3RyaW5nLCAuLi5yZXNvdXJjZXM6IFVSSVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgY2hhbmdlc1ZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGFuZ2VzVmlld1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkNoYW5nZXMgPSBjaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNPYnMuZ2V0KCk7XG5cblx0XHRjb25zdCBjaGFuZ2VzID0gc2Vzc2lvbkNoYW5nZXM/LmZpbHRlcihjaGFuZ2UgPT5cblx0XHRcdHJlc291cmNlcy5zb21lKHJlc291cmNlID0+IGlzRXF1YWwoY2hhbmdlLm1vZGlmaWVkVXJpID8/IGNoYW5nZS5vcmlnaW5hbFVyaSwgcmVzb3VyY2UpKVxuXHRcdCkgPz8gW107XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChjaGFuZ2VzLm1hcChjaGFuZ2UgPT4gZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBjaGFuZ2Uub3JpZ2luYWxVcmkgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBjaGFuZ2UubW9kaWZpZWRVcmkgfVxuXHRcdH0pKSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKE9wZW5DaGFuZ2VzQWN0aW9uKTtcblxuY29uc3Qgb3BlblNpbmdsZUZpbGVEaWZmRW5hYmxlZCA9IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7U0VTU0lPTlNfQ0hBTkdFU19PUEVOX1NJTkdMRV9GSUxFX0RJRkZfU0VUVElOR31gLCB0cnVlKTtcblxuY2xhc3MgT3BlbkZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5vcGVuRmlsZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5GaWxlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkZpbGUnLCBcIk9wZW4gRmlsZVwiKSxcblx0XHRcdGljb246IENvZGljb24uZ29Ub0ZpbGUsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdC8vIFdoZW4gb3BlbmluZyBhIGZpbGUgYWxyZWFkeSBzaG93cyBhIHNpbmdsZSBmaWxlIGRpZmYsIHRoZSBcIk9wZW5cblx0XHRcdFx0Ly8gQ2hhbmdlc1wiIGFsdCBhY3Rpb24gaXMgcmVkdW5kYW50IGFuZCBpcyB0aGVyZWZvcmUgb21pdHRlZC5cblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRzQ2hhbmdlSW5saW5lVG9vbGJhcixcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0XHRcdFx0Q2hhbmdlc0NvbnRleHRLZXlzLkNoYW5nZUtpbmQuaXNFcXVhbFRvKCdmaWxlJyksXG5cdFx0XHRcdFx0XHRvcGVuU2luZ2xlRmlsZURpZmZFbmFibGVkKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBEZWZhdWx0IGJlaGF2aW9yOiB0aGUgYWx0IGFjdGlvbiAoXCJPcGVuIENoYW5nZXNcIikgb3BlbnMgYSBkaWZmXG5cdFx0XHRcdC8vIGVkaXRvciBmb3IgdGhlIHNlbGVjdGVkIGNoYW5nZShzKS5cblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRzQ2hhbmdlSW5saW5lVG9vbGJhcixcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdGFsdDoge1xuXHRcdFx0XHRcdFx0aWQ6IE9wZW5DaGFuZ2VzQWN0aW9uLklELFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkNoYW5nZXMnLCBcIk9wZW4gQ2hhbmdlc1wiKSxcblx0XHRcdFx0XHRcdGljb246IENvZGljb24uZ2l0Q29tcGFyZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0XHRcdFx0Q2hhbmdlc0NvbnRleHRLZXlzLkNoYW5nZUtpbmQuaXNFcXVhbFRvKCdmaWxlJyksXG5cdFx0XHRcdFx0XHRvcGVuU2luZ2xlRmlsZURpZmZFbmFibGVkLm5lZ2F0ZSgpKVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgX3JlZjogc3RyaW5nLCAuLi5yZXNvdXJjZXM6IFVSSVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocmVzb3VyY2VzLm1hcChyZXNvdXJjZSA9PiBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSB9KSkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihPcGVuRmlsZUFjdGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsU0FBMEIsUUFBUSxjQUFjLHVCQUF1QjtBQUVoRixTQUFpQyxnQ0FBZ0Msc0JBQXNCO0FBQ3ZGLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUNuRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwQixpQkFBaUIsb0JBQW9CLGlCQUFpQixzREFBc0Q7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
