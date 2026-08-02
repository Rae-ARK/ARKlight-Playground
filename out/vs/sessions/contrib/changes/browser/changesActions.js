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
import { $ } from "../../../../base/browser/dom.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { structuralEquals } from "../../../../base/common/equals.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun, derivedOpts, observableValue, transaction } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../nls.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId, MenuItemAction, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { ActiveEditorContext } from "../../../../workbench/common/contextkeys.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { MultiDiffEditor } from "../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditor.js";
import { DiffEditorWidget } from "../../../../editor/browser/widget/diffEditor/diffEditorWidget.js";
import { IAgentWorkbenchLayoutService } from "../../../browser/workbench.js";
import { Menus } from "../../../browser/menus.js";
import { SessionHeaderMetaActionViewItem } from "../../../browser/parts/sessionHeaderMetaActionViewItem.js";
import { SessionHasChangesContext, IsQuickChatSessionContext } from "../../../common/contextkeys.js";
import { ISessionContext } from "../../../services/sessions/browser/sessionContext.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { SessionChangesetOperationScope } from "../../../services/sessions/common/session.js";
import { IChangesViewService } from "../common/changesViewService.js";
import { ChangesMultiDiffSourceResolver, SessionChangesReviewedFilesContext } from "./changesMultiDiffSourceResolver.js";
import { ISessionChangesService } from "./sessionChangesService.js";
import { SessionChangesEditor } from "./sessionChangesEditor.js";
import { VIEW_SESSION_CHANGES_COMMAND_ID } from "../common/changes.js";
const _ViewAllChangesAction = class _ViewAllChangesAction extends Action2 {
  constructor() {
    super({
      id: _ViewAllChangesAction.ID,
      title: localize2("agentSessions.changes", "Changes"),
      icon: Codicon.diffMultiple,
      f1: false,
      // Diff stats shown in the session header meta row
      // (vs/sessions/browser/parts/sessionHeader.ts). Rendered with a
      // custom action view item that shows the live +/- counts.
      menu: {
        id: Menus.SessionHeaderMeta,
        group: "navigation",
        order: 0,
        when: ContextKeyExpr.and(SessionHasChangesContext, IsQuickChatSessionContext.negate())
      }
    });
  }
  async run(accessor, session) {
    const sessionsService = accessor.get(ISessionsService);
    const sessionChangesService = accessor.get(ISessionChangesService);
    const changesViewService = accessor.get(IChangesViewService);
    const layoutService = accessor.get(IAgentWorkbenchLayoutService);
    const sessionResource = (session ?? sessionsService.activeSession.get())?.resource;
    if (!sessionResource) {
      return;
    }
    changesViewService.setChangesetId(void 0);
    layoutService.revealEditorPartExplicitly();
    await sessionChangesService.openChangesEditor(sessionResource);
  }
};
_ViewAllChangesAction.ID = VIEW_SESSION_CHANGES_COMMAND_ID;
let ViewAllChangesAction = _ViewAllChangesAction;
registerAction2(ViewAllChangesAction);
const _OpenChangedFileAction = class _OpenChangedFileAction extends Action2 {
  constructor() {
    super({
      id: _OpenChangedFileAction.ID,
      title: localize2("agentSessions.changes.openFile", "Open File"),
      icon: Codicon.goToFile,
      f1: false,
      menu: {
        id: MenuId.MultiDiffEditorFileToolbar,
        when: ActiveEditorContext.isEqualTo(SessionChangesEditor.ID),
        group: "navigation",
        order: 22
      }
    });
  }
  async run(accessor, ...args) {
    const resource = args[0];
    if (!(resource instanceof URI)) {
      return;
    }
    await accessor.get(IEditorService).openEditor({ resource });
  }
};
_OpenChangedFileAction.ID = "workbench.agentSessions.changes.openFile";
let OpenChangedFileAction = _OpenChangedFileAction;
registerAction2(OpenChangedFileAction);
function getChangesDiffEditor(pane, resource) {
  const codeEditor = pane instanceof SessionChangesEditor || pane instanceof MultiDiffEditor ? pane.tryGetCodeEditor(resource) : void 0;
  return codeEditor?.diffEditor instanceof DiffEditorWidget ? codeEditor.diffEditor : void 0;
}
const _ExpandFullFileAction = class _ExpandFullFileAction extends Action2 {
  constructor() {
    super({
      id: _ExpandFullFileAction.ID,
      title: localize2("agentSessions.changes.expandFullFile", "Expand Full File"),
      icon: Codicon.unfold,
      f1: false,
      menu: {
        id: MenuId.MultiDiffEditorFileToolbar,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("resourceScheme", "changes-multi-diff-source"),
          EditorContextKeys.multiDiffEditorItemAllUnchangedRegionsShown.toNegated()
        ),
        group: "navigation",
        order: 21
      }
    });
  }
  async run(accessor, ...args) {
    const resource = args[0];
    if (!(resource instanceof URI)) {
      return;
    }
    getChangesDiffEditor(accessor.get(IEditorService).activeEditorPane, resource)?.showAllUnchangedRegions();
  }
};
_ExpandFullFileAction.ID = "workbench.agentSessions.changes.expandFullFile";
let ExpandFullFileAction = _ExpandFullFileAction;
registerAction2(ExpandFullFileAction);
const _CollapseUnchangedRegionsAction = class _CollapseUnchangedRegionsAction extends Action2 {
  constructor() {
    super({
      id: _CollapseUnchangedRegionsAction.ID,
      title: localize2("agentSessions.changes.collapseUnchangedRegions", "Collapse Unchanged Regions"),
      icon: Codicon.fold,
      f1: false,
      menu: {
        id: MenuId.MultiDiffEditorFileToolbar,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("resourceScheme", "changes-multi-diff-source"),
          EditorContextKeys.multiDiffEditorItemAllUnchangedRegionsShown
        ),
        group: "navigation",
        order: 21
      }
    });
  }
  async run(accessor, ...args) {
    const resource = args[0];
    if (!(resource instanceof URI)) {
      return;
    }
    getChangesDiffEditor(accessor.get(IEditorService).activeEditorPane, resource)?.collapseAllUnchangedRegions();
  }
};
_CollapseUnchangedRegionsAction.ID = "workbench.agentSessions.changes.collapseUnchangedRegions";
let CollapseUnchangedRegionsAction = _CollapseUnchangedRegionsAction;
registerAction2(CollapseUnchangedRegionsAction);
let ViewAllChangesActionViewItem = class extends SessionHeaderMetaActionViewItem {
  constructor(action, options, sessionContext) {
    super(void 0, action, options);
    this._diffStatsObs = derivedOpts({ owner: this, equalsFn: structuralEquals }, (reader) => {
      const session = sessionContext.session.read(reader);
      const workspace = session?.workspace.read(reader);
      const branch = workspace?.folders[0]?.gitRepository?.branchName?.trim();
      const changesSummary = session?.changesSummary?.read(reader);
      if (changesSummary) {
        return {
          branch,
          files: changesSummary.files,
          insertions: changesSummary.additions,
          deletions: changesSummary.deletions
        };
      }
      const defaultChangeset = session?.changesets.read(reader)?.find((c) => c.isDefault.read(reader));
      const changes = defaultChangeset?.changes.read(reader) ?? session?.changes.read(reader) ?? [];
      let insertions = 0, deletions = 0;
      for (const change of changes) {
        insertions += change.insertions;
        deletions += change.deletions;
      }
      return {
        branch,
        files: changes.length,
        insertions,
        deletions
      };
    });
    this._register(autorun((reader) => {
      this._diffStatsObs.read(reader);
      this.updateLabel();
      this.updateTooltip();
      this.updateAriaLabel();
    }));
  }
  getLabelText() {
    const { files } = this._diffStatsObs.get();
    return files === 1 ? localize("agentSessions.changes.file", "{0} file", files) : localize("agentSessions.changes.files", "{0} files", files);
  }
  getAdditionalLabelContent() {
    const { insertions, deletions } = this._diffStatsObs.get();
    return [
      $("span.chat-composite-bar-meta-added", void 0, `+${insertions}`),
      $("span.chat-composite-bar-meta-removed", void 0, `-${deletions}`)
    ];
  }
  getTooltip() {
    const { branch } = this._diffStatsObs.get();
    return branch ? localize("agentSessions.viewChanges.tooltip.branch", "View All Changes ({0})", branch) : localize("agentSessions.viewChanges.tooltip", "View All Changes");
  }
  getAriaLabel() {
    const { files, insertions, deletions } = this._diffStatsObs.get();
    const filesLabel = files === 1 ? localize("agentSessions.changes.file", "{0} file", files) : localize("agentSessions.changes.files", "{0} files", files);
    return localize("agentSessions.viewChanges.ariaLabel", "{0}: {1}, +{2}, -{3}", this.getTooltip(), filesLabel, insertions, deletions);
  }
};
ViewAllChangesActionViewItem = __decorateClass([
  __decorateParam(2, ISessionContext)
], ViewAllChangesActionViewItem);
let ViewAllChangesActionViewItemContribution = class extends Disposable {
  constructor(actionViewItemService) {
    super();
    const onDidRegister = this._register(new Emitter());
    this._register(actionViewItemService.register(Menus.SessionHeaderMeta, ViewAllChangesAction.ID, (action, options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(ViewAllChangesActionViewItem, action, options);
    }, onDidRegister.event));
    onDidRegister.fire();
  }
};
ViewAllChangesActionViewItemContribution.ID = "workbench.contrib.viewAllChangesActionViewItem";
ViewAllChangesActionViewItemContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService)
], ViewAllChangesActionViewItemContribution);
let ChangesMultiDiffSourceResolverContribution = class extends Disposable {
  constructor(instantiationService) {
    super();
    this._register(instantiationService.createInstance(ChangesMultiDiffSourceResolver));
  }
};
ChangesMultiDiffSourceResolverContribution.ID = "workbench.contrib.sessions.changesMultiDiffSourceResolver";
ChangesMultiDiffSourceResolverContribution = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ChangesMultiDiffSourceResolverContribution);
let ChangesetOperationsActionControllerContribution = class extends Disposable {
  constructor(changesViewService, contextKeyService) {
    super();
    const clientReviewedFilesObs = observableValue(this, void 0);
    const agentHostReviewedFilesObs = observableValue(this, []);
    this._register(autorun((reader) => {
      const changes = changesViewService.activeSessionChangesObs.read(reader);
      const reviewedFiles = changes.filter((change) => change.reviewed).map((change) => change.modifiedUri?.toString() ?? change.originalUri?.toString()).filter((uri) => uri !== void 0);
      transaction((tx) => {
        clientReviewedFilesObs.set(void 0, tx);
        agentHostReviewedFilesObs.set(reviewedFiles, tx);
      });
    }));
    this._register(bindContextKey(SessionChangesReviewedFilesContext, contextKeyService, (reader) => {
      return clientReviewedFilesObs.read(reader) ?? agentHostReviewedFilesObs.read(reader);
    }));
    this._register(autorun((reader) => {
      const changeset = changesViewService.activeSessionChangesetObs.read(reader);
      const resourceOperations = (changeset?.operations.read(reader) ?? []).filter((op) => op.scopes.includes(SessionChangesetOperationScope.Resource));
      if (resourceOperations.length === 0) {
        return;
      }
      for (const operation of resourceOperations) {
        reader.store.add(registerAction2(class extends Action2 {
          constructor() {
            super({
              id: `workbench.contrib.sessions.changesetOperation.${operation.id}`,
              title: operation.label,
              icon: operation.icon,
              f1: false,
              menu: [
                {
                  id: MenuId.AgentsChangeInlineToolbar,
                  group: "navigation",
                  order: 100
                },
                {
                  id: MenuId.MultiDiffEditorFileToolbar,
                  group: "navigation",
                  order: 100
                }
              ]
            });
          }
          async run(accessor, ...args) {
            const resource = args.length === 3 ? args[2] : args[0];
            if (!resource || !(resource instanceof URI)) {
              return;
            }
            await changeset?.invokeOperation(operation.id, {
              kind: "resource",
              resource
            });
          }
        }));
      }
    }));
  }
};
ChangesetOperationsActionControllerContribution.ID = "workbench.contrib.sessions.changesetOperationsActionController";
ChangesetOperationsActionControllerContribution = __decorateClass([
  __decorateParam(0, IChangesViewService),
  __decorateParam(1, IContextKeyService)
], ChangesetOperationsActionControllerContribution);
registerWorkbenchContribution2(ChangesMultiDiffSourceResolverContribution.ID, ChangesMultiDiffSourceResolverContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChangesetOperationsActionControllerContribution.ID, ChangesetOperationsActionControllerContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ViewAllChangesActionViewItemContribution.ID, ViewAllChangesActionViewItemContribution, WorkbenchPhase.AfterRestored);
export {
  ViewAllChangesActionViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhbmdlcy9icm93c2VyL2NoYW5nZXNBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBzdHJ1Y3R1cmFsRXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBiaW5kQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IEFjdGl2ZUVkaXRvckNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgTXVsdGlEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvbXVsdGlEaWZmRWRpdG9yL2Jyb3dzZXIvbXVsdGlEaWZmRWRpdG9yLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9kaWZmRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dvcmtiZW5jaC5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkhlYWRlck1ldGFBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvc2Vzc2lvbkhlYWRlck1ldGFBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uSGFzQ2hhbmdlc0NvbnRleHQsIElzUXVpY2tDaGF0U2Vzc2lvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElDaGFuZ2VzVmlld1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYW5nZXNNdWx0aURpZmZTb3VyY2VSZXNvbHZlciwgU2Vzc2lvbkNoYW5nZXNSZXZpZXdlZEZpbGVzQ29udGV4dCB9IGZyb20gJy4vY2hhbmdlc011bHRpRGlmZlNvdXJjZVJlc29sdmVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuL3Nlc3Npb25DaGFuZ2VzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ2hhbmdlc0VkaXRvciB9IGZyb20gJy4vc2Vzc2lvbkNoYW5nZXNFZGl0b3IuanMnO1xuaW1wb3J0IHsgVklFV19TRVNTSU9OX0NIQU5HRVNfQ09NTUFORF9JRCB9IGZyb20gJy4uL2NvbW1vbi9jaGFuZ2VzLmpzJztcblxuLy8gLS0tIFZpZXcgQWxsIENoYW5nZXMgYWN0aW9uXG5cbmNsYXNzIFZpZXdBbGxDaGFuZ2VzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9IFZJRVdfU0VTU0lPTl9DSEFOR0VTX0NPTU1BTkRfSUQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFZpZXdBbGxDaGFuZ2VzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRTZXNzaW9ucy5jaGFuZ2VzJywgJ0NoYW5nZXMnKSxcblx0XHRcdGljb246IENvZGljb24uZGlmZk11bHRpcGxlLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0Ly8gRGlmZiBzdGF0cyBzaG93biBpbiB0aGUgc2Vzc2lvbiBoZWFkZXIgbWV0YSByb3dcblx0XHRcdC8vICh2cy9zZXNzaW9ucy9icm93c2VyL3BhcnRzL3Nlc3Npb25IZWFkZXIudHMpLiBSZW5kZXJlZCB3aXRoIGFcblx0XHRcdC8vIGN1c3RvbSBhY3Rpb24gdmlldyBpdGVtIHRoYXQgc2hvd3MgdGhlIGxpdmUgKy8tIGNvdW50cy5cblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25IZWFkZXJNZXRhLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFNlc3Npb25IYXNDaGFuZ2VzQ29udGV4dCwgSXNRdWlja0NoYXRTZXNzaW9uQ29udGV4dC5uZWdhdGUoKSlcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlc3Npb24/OiBJQWN0aXZlU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uQ2hhbmdlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25DaGFuZ2VzU2VydmljZSk7XG5cdFx0Y29uc3QgY2hhbmdlc1ZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGFuZ2VzVmlld1NlcnZpY2UpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cblx0XHQvLyBUaGUgY2xpY2tlZCBzZXNzaW9uIGlzIGZvcndhcmRlZCBhcyB0aGUgYXJndW1lbnQgYnkgdGhlIHNlc3Npb24gaGVhZGVyLFxuXHRcdC8vIHdoaWNoIGhhcyBhbHJlYWR5IHByb21vdGVkIGl0IHRvIGJlIHRoZSBhY3RpdmUgc2Vzc2lvbi4gRmFsbCBiYWNrIHRvIHRoZVxuXHRcdC8vIGFjdGl2ZSBzZXNzaW9uIHdoZW4gaW52b2tlZCB3aXRob3V0IGFuIGV4cGxpY2l0IGFyZ3VtZW50LlxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IChzZXNzaW9uID8/IHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpKT8ucmVzb3VyY2U7XG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUaGUgaGVhZGVyIHBpbGwgcmVmbGVjdHMgdGhlIHNlc3Npb24ncyBkZWZhdWx0IGNoYW5nZXNldCwgc28gcmVzZXQgYW55XG5cdFx0Ly8gQ2hhbmdlcy12aWV3IHNlbGVjdGlvbiB0byB0aGUgZGVmYXVsdCBiZWZvcmUgb3BlbmluZyBzbyB0aGUgZGlmZiBlZGl0b3Jcblx0XHQvLyAoYSBzaGFyZWQgcGVyLXNlc3Npb24gcmVzb3VyY2UpIHNob3dzIHRoZSBzYW1lIGNoYW5nZXMgYXMgdGhlIHBpbGwuXG5cdFx0Y2hhbmdlc1ZpZXdTZXJ2aWNlLnNldENoYW5nZXNldElkKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBPcGVuaW5nIHRoZSBDaGFuZ2VzIGVkaXRvciBmcm9tIHRoZSBwaWxsIGlzIGEgZGVsaWJlcmF0ZSB1c2VyIGFjdGlvbiwgc29cblx0XHQvLyByZXZlYWwgdGhlIChwb3NzaWJseSBoaWRkZW4pIGVkaXRvciBhcmVhIGV4cGxpY2l0bHkgXHUyMDE0IHRoZSBhdXRvbWF0aWNcblx0XHQvLyBzaW5nbGUtcGFuZSBoaWRlIHJ1bGVzIG11c3Qgbm90IHVuZG8gaXQuXG5cdFx0bGF5b3V0U2VydmljZS5yZXZlYWxFZGl0b3JQYXJ0RXhwbGljaXRseSgpO1xuXG5cdFx0Ly8gT3BlbiB0aGUgc2Vzc2lvbiBDaGFuZ2VzIGVkaXRvciBpbiB0aGUgZWRpdG9yIHBhcnQuIFRoZSByZXNvdXJjZSBsaXN0IGlzXG5cdFx0Ly8gcmVzb2x2ZWQgcmVhY3RpdmVseSB2aWEgdGhlIGBDaGFuZ2VzTXVsdGlEaWZmU291cmNlUmVzb2x2ZXJgIHJlZ2lzdGVyZWQgYXNcblx0XHQvLyBhIHdvcmtiZW5jaCBjb250cmlidXRpb24uXG5cdFx0YXdhaXQgc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLm9wZW5DaGFuZ2VzRWRpdG9yKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihWaWV3QWxsQ2hhbmdlc0FjdGlvbik7XG5cbi8vIC0tLSBPcGVuIEZpbGUgYWN0aW9uIChwZXItZmlsZSB0b29sYmFyIGluIHRoZSBzaW5nbGUtcGFuZSBzZXNzaW9uIGNoYW5nZXMgZWRpdG9yKVxuXG4vKipcbiAqIE9wZW5zIHRoZSBmaWxlIHNob3duIGluIGEgZGlmZiByb3cgb2YgdGhlIEFnZW50cyB3aW5kb3cncyBzaW5nbGUtcGFuZSBzZXNzaW9uXG4gKiBDaGFuZ2VzIGVkaXRvciAoe0BsaW5rIFNlc3Npb25DaGFuZ2VzRWRpdG9yfSkgYXMgYSByZWd1bGFyIGVkaXRvci4gVGhlIHdvcmtiZW5jaFxuICoge0BsaW5rIEdvVG9GaWxlQWN0aW9ufSBvbmx5IGFwcGVhcnMgZm9yIHRoZSBnZW5lcmljIHtAbGluayBNdWx0aURpZmZFZGl0b3J9LCBzb1xuICogdGhlIGN1c3RvbSBzaW5nbGUtcGFuZSBlZGl0b3IgbmVlZHMgaXRzIG93biBlbnRyeSBpbiB0aGUgcGVyLWZpbGUgdG9vbGJhci4gSXQgaXNcbiAqIHNjb3BlZCB0byB0aGUge0BsaW5rIFNlc3Npb25DaGFuZ2VzRWRpdG9yfSByYXRoZXIgdGhhbiB0aGUgc2hhcmVkXG4gKiBgY2hhbmdlcy1tdWx0aS1kaWZmLXNvdXJjZWAgc2NoZW1lIHNvIGl0IGRvZXMgbm90IGR1cGxpY2F0ZSB0aGUgd29ya2JlbmNoIGFjdGlvblxuICogd2hlbiB0aGUgc2FtZSBjaGFuZ2VzIGFyZSBzaG93biBpbiB0aGUgZ2VuZXJpYyBtdWx0aS1maWxlIGRpZmYgZWRpdG9yLlxuICovXG5jbGFzcyBPcGVuQ2hhbmdlZEZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFnZW50U2Vzc2lvbnMuY2hhbmdlcy5vcGVuRmlsZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5DaGFuZ2VkRmlsZUFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FnZW50U2Vzc2lvbnMuY2hhbmdlcy5vcGVuRmlsZScsICdPcGVuIEZpbGUnKSxcblx0XHRcdGljb246IENvZGljb24uZ29Ub0ZpbGUsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTXVsdGlEaWZmRWRpdG9yRmlsZVRvb2xiYXIsXG5cdFx0XHRcdHdoZW46IEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKFNlc3Npb25DaGFuZ2VzRWRpdG9yLklEKSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIyLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBhcmdzWzBdO1xuXHRcdGlmICghKHJlc291cmNlIGluc3RhbmNlb2YgVVJJKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkub3BlbkVkaXRvcih7IHJlc291cmNlIH0pO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoT3BlbkNoYW5nZWRGaWxlQWN0aW9uKTtcblxuLy8gLS0tIEV4cGFuZCBGdWxsIEZpbGUgYWN0aW9uIChwZXItZmlsZSB0b29sYmFyIGluIHRoZSBzZXNzaW9uIGNoYW5nZXMgbXVsdGktZGlmZiBlZGl0b3IpXG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIHtAbGluayBEaWZmRWRpdG9yV2lkZ2V0fSBzaG93aW5nIGByZXNvdXJjZWAgaW4gdGhlIGFjdGl2ZSBDaGFuZ2VzXG4gKiBtdWx0aS1kaWZmIGVkaXRvci4gVGhlIENoYW5nZXMgZWRpdG9yIG9wZW5zIGVpdGhlciBhcyB0aGUgZG9ja2VkXG4gKiB7QGxpbmsgU2Vzc2lvbkNoYW5nZXNFZGl0b3J9IG9yLCBpbiB0aGUgbm9uLWRvY2tlZCBsYXlvdXQsIGFzIGEgcGxhaW5cbiAqIHtAbGluayBNdWx0aURpZmZFZGl0b3J9OyBib3RoIGV4cG9zZSBgdHJ5R2V0Q29kZUVkaXRvcmAsIHNvIHRoZSBleHBhbmQvY29sbGFwc2VcbiAqIGFjdGlvbnMgd29yayBpbiBlaXRoZXIgbW9kZS5cbiAqL1xuZnVuY3Rpb24gZ2V0Q2hhbmdlc0RpZmZFZGl0b3IocGFuZTogSUVkaXRvclBhbmUgfCB1bmRlZmluZWQsIHJlc291cmNlOiBVUkkpOiBEaWZmRWRpdG9yV2lkZ2V0IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY29kZUVkaXRvciA9IHBhbmUgaW5zdGFuY2VvZiBTZXNzaW9uQ2hhbmdlc0VkaXRvciB8fCBwYW5lIGluc3RhbmNlb2YgTXVsdGlEaWZmRWRpdG9yXG5cdFx0PyBwYW5lLnRyeUdldENvZGVFZGl0b3IocmVzb3VyY2UpXG5cdFx0OiB1bmRlZmluZWQ7XG5cdHJldHVybiBjb2RlRWRpdG9yPy5kaWZmRWRpdG9yIGluc3RhbmNlb2YgRGlmZkVkaXRvcldpZGdldCA/IGNvZGVFZGl0b3IuZGlmZkVkaXRvciA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBSZXZlYWxzIGFsbCBoaWRkZW4gdW5jaGFuZ2VkIHJlZ2lvbnMgZm9yIHRoZSBmaWxlIHNob3duIGluIGEgZGlmZiByb3cgb2YgdGhlXG4gKiBBZ2VudHMgd2luZG93J3MgQ2hhbmdlcyBlZGl0b3IsIHNob3dpbmcgdGhlIHdob2xlIGZpbGUgYXQgb25jZSAoYSBwZXItZmlsZVxuICogY291bnRlcnBhcnQgdG8gdGhlIHBlci1yZWdpb24gcmV2ZWFsIGNvbnRyb2xzKS5cbiAqL1xuY2xhc3MgRXhwYW5kRnVsbEZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFnZW50U2Vzc2lvbnMuY2hhbmdlcy5leHBhbmRGdWxsRmlsZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEV4cGFuZEZ1bGxGaWxlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRTZXNzaW9ucy5jaGFuZ2VzLmV4cGFuZEZ1bGxGaWxlJywgJ0V4cGFuZCBGdWxsIEZpbGUnKSxcblx0XHRcdGljb246IENvZGljb24udW5mb2xkLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLk11bHRpRGlmZkVkaXRvckZpbGVUb29sYmFyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdyZXNvdXJjZVNjaGVtZScsICdjaGFuZ2VzLW11bHRpLWRpZmYtc291cmNlJyksXG5cdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMubXVsdGlEaWZmRWRpdG9ySXRlbUFsbFVuY2hhbmdlZFJlZ2lvbnNTaG93bi50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyMSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gYXJnc1swXTtcblx0XHRpZiAoIShyZXNvdXJjZSBpbnN0YW5jZW9mIFVSSSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRnZXRDaGFuZ2VzRGlmZkVkaXRvcihhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmUsIHJlc291cmNlKT8uc2hvd0FsbFVuY2hhbmdlZFJlZ2lvbnMoKTtcblx0fVxufVxucmVnaXN0ZXJBY3Rpb24yKEV4cGFuZEZ1bGxGaWxlQWN0aW9uKTtcblxuLy8gLS0tIENvbGxhcHNlIFVuY2hhbmdlZCBSZWdpb25zIGFjdGlvbiAocGVyLWZpbGUgdG9vbGJhciBpbiB0aGUgc2Vzc2lvbiBjaGFuZ2VzIG11bHRpLWRpZmYgZWRpdG9yKVxuXG4vKipcbiAqIENvbGxhcHNlcyBhbGwgdW5jaGFuZ2VkIHJlZ2lvbnMgZm9yIHRoZSBmaWxlIHNob3duIGluIGEgZGlmZiByb3cgb2YgdGhlIEFnZW50c1xuICogd2luZG93J3MgQ2hhbmdlcyBlZGl0b3IsIGhpZGluZyB0aGUgdW5jaGFuZ2VkIGNvbnRleHQgc28gb25seSB0aGUgY2hhbmdlcyBhcmVcbiAqIHNob3duLiBUaGUgc3ltbWV0cmljIGNvdW50ZXJwYXJ0IG9mIHtAbGluayBFeHBhbmRGdWxsRmlsZUFjdGlvbn06IHRoZSB0d29cbiAqIG9jY3VweSB0aGUgc2FtZSB0b29sYmFyIHNsb3QgYW5kIHN3YXAgYmFzZWQgb24gd2hldGhlciB0aGUgZmlsZSBpcyBmdWxseVxuICogZXhwYW5kZWQuXG4gKi9cbmNsYXNzIENvbGxhcHNlVW5jaGFuZ2VkUmVnaW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWdlbnRTZXNzaW9ucy5jaGFuZ2VzLmNvbGxhcHNlVW5jaGFuZ2VkUmVnaW9ucyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbGxhcHNlVW5jaGFuZ2VkUmVnaW9uc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FnZW50U2Vzc2lvbnMuY2hhbmdlcy5jb2xsYXBzZVVuY2hhbmdlZFJlZ2lvbnMnLCAnQ29sbGFwc2UgVW5jaGFuZ2VkIFJlZ2lvbnMnKSxcblx0XHRcdGljb246IENvZGljb24uZm9sZCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NdWx0aURpZmZFZGl0b3JGaWxlVG9vbGJhcixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygncmVzb3VyY2VTY2hlbWUnLCAnY2hhbmdlcy1tdWx0aS1kaWZmLXNvdXJjZScpLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLm11bHRpRGlmZkVkaXRvckl0ZW1BbGxVbmNoYW5nZWRSZWdpb25zU2hvd24pLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMjEsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IGFyZ3NbMF07XG5cdFx0aWYgKCEocmVzb3VyY2UgaW5zdGFuY2VvZiBVUkkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Z2V0Q2hhbmdlc0RpZmZFZGl0b3IoYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lLCByZXNvdXJjZSk/LmNvbGxhcHNlQWxsVW5jaGFuZ2VkUmVnaW9ucygpO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoQ29sbGFwc2VVbmNoYW5nZWRSZWdpb25zQWN0aW9uKTtcblxuLy8gLS0tIFZpZXcgQWxsIENoYW5nZXMgYWN0aW9uIHZpZXcgaXRlbSAoc2Vzc2lvbiBoZWFkZXIgZGlmZiBzdGF0cylcblxuaW50ZXJmYWNlIElEaWZmU3RhdHMge1xuXHRyZWFkb25seSBmaWxlczogbnVtYmVyO1xuXHRyZWFkb25seSBpbnNlcnRpb25zOiBudW1iZXI7XG5cdHJlYWRvbmx5IGRlbGV0aW9uczogbnVtYmVyO1xuXHRyZWFkb25seSBicmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBSZW5kZXJzIHRoZSB7QGxpbmsgVmlld0FsbENoYW5nZXNBY3Rpb259IG1lbnUgaXRlbSBjb250cmlidXRlZCBpbnRvIHtAbGluayBNZW51cy5TZXNzaW9uSGVhZGVyTWV0YX1cbiAqICh0aGUgc2Vzc2lvbiBoZWFkZXIgbWV0YSByb3cpIGFzIGEgYDxkaWZmLWljb24+IDxuPiBmaWxlcyAraW5zZXJ0aW9ucyAtZGVsZXRpb25zYCBwaWxsLiBJdCBleHRlbmRzIHRoZVxuICogZ2VuZXJpYyB7QGxpbmsgU2Vzc2lvbkhlYWRlck1ldGFBY3Rpb25WaWV3SXRlbX0gKHNvIHRoZSBpY29uIGFuZCBsYWJlbCByZW5kZXIgY29uc2lzdGVudGx5IHdpdGggb3RoZXJcbiAqIG1ldGEgYWN0aW9ucykgYW5kIGFwcGVuZHMgdGhlIHNlc3Npb24ncyBsaXZlIGFnZ3JlZ2F0ZSBkaWZmIHN0YXRzLiBBY3RpdmF0aW5nIHRoZSBpdGVtIHJ1bnMgdGhlXG4gKiBhY3Rpb24sIHdoaWNoIG9wZW5zIHRoZSBtdWx0aS1maWxlIGRpZmYgZWRpdG9yLlxuICpcbiAqIFRoZSBzdGF0cyBhcmUgcmVhZCBmcm9tIHRoZSB7QGxpbmsgSVNlc3Npb25Db250ZXh0fSBzbyB0aGUgY29ycmVjdCBwZXItc2Vzc2lvbiBjaGFuZ2VzXG4gKiBhcmUgc2hvd24gZXZlbiB3aGVuIHNldmVyYWwgc2Vzc2lvbiB2aWV3cyBhcmUgdmlzaWJsZSBhdCBvbmNlLiBUaGUgY291bnRzIGNvbWUgZnJvbSB0aGVcbiAqIHNlc3Npb24ncyB7QGxpbmsgSVNlc3Npb24uY2hhbmdlc1N1bW1hcnl9IHdoZW4gYXZhaWxhYmxlLCBmYWxsaW5nIGJhY2sgdG8gYWdncmVnYXRpbmcgdGhlXG4gKiBjaGFuZ2VzZXQgdGhlIHByb3ZpZGVyIG1hcmtzIGFzIHtAbGluayBJU2Vzc2lvbkNoYW5nZXNldC5pc0RlZmF1bHR9IChvciB0aGUgc2Vzc2lvbidzXG4gKiB0b3AtbGV2ZWwge0BsaW5rIElBY3RpdmVTZXNzaW9uLmNoYW5nZXN9IHdoZW4gbm9uZSBpcyBkZWZhdWx0KS5cbiAqL1xuZXhwb3J0IGNsYXNzIFZpZXdBbGxDaGFuZ2VzQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBTZXNzaW9uSGVhZGVyTWV0YUFjdGlvblZpZXdJdGVtIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmU3RhdHNPYnM6IElPYnNlcnZhYmxlPElEaWZmU3RhdHM+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogTWVudUl0ZW1BY3Rpb24sXG5cdFx0b3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRASVNlc3Npb25Db250ZXh0IHNlc3Npb25Db250ZXh0OiBJU2Vzc2lvbkNvbnRleHQsXG5cdCkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uLCBvcHRpb25zKTtcblxuXHRcdHRoaXMuX2RpZmZTdGF0c09icyA9IGRlcml2ZWRPcHRzPElEaWZmU3RhdHM+KHsgb3duZXI6IHRoaXMsIGVxdWFsc0ZuOiBzdHJ1Y3R1cmFsRXF1YWxzIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbkNvbnRleHQuc2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBzZXNzaW9uPy53b3Jrc3BhY2UucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYnJhbmNoID0gd29ya3NwYWNlPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5Py5icmFuY2hOYW1lPy50cmltKCk7XG5cblx0XHRcdC8vIFByZWZlciB0aGUgcHJvdmlkZXItc3VwcGxpZWQgY2hhbmdlcyBzdW1tYXJ5IHdoaWNoIHJlZmxlY3RzIHRoZVxuXHRcdFx0Ly8gc2Vzc2lvbidzIGF1dGhvcml0YXRpdmUgYWdncmVnYXRlLiBGYWxsIGJhY2sgdG8gYWdncmVnYXRpbmcgdGhlXG5cdFx0XHQvLyBkZWZhdWx0IGNoYW5nZXNldCdzIGNoYW5nZXMgd2hlbiBubyBzdW1tYXJ5IGlzIGF2YWlsYWJsZS5cblx0XHRcdGNvbnN0IGNoYW5nZXNTdW1tYXJ5ID0gc2Vzc2lvbj8uY2hhbmdlc1N1bW1hcnk/LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjaGFuZ2VzU3VtbWFyeSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGJyYW5jaCxcblx0XHRcdFx0XHRmaWxlczogY2hhbmdlc1N1bW1hcnkuZmlsZXMsXG5cdFx0XHRcdFx0aW5zZXJ0aW9uczogY2hhbmdlc1N1bW1hcnkuYWRkaXRpb25zLFxuXHRcdFx0XHRcdGRlbGV0aW9uczogY2hhbmdlc1N1bW1hcnkuZGVsZXRpb25zLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJRGlmZlN0YXRzO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhbmdlc2V0ID0gc2Vzc2lvbj8uY2hhbmdlc2V0cy5yZWFkKHJlYWRlcik/LmZpbmQoYyA9PiBjLmlzRGVmYXVsdC5yZWFkKHJlYWRlcikpO1xuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IChkZWZhdWx0Q2hhbmdlc2V0Py5jaGFuZ2VzLnJlYWQocmVhZGVyKSA/PyBzZXNzaW9uPy5jaGFuZ2VzLnJlYWQocmVhZGVyKSkgPz8gW107XG5cblx0XHRcdGxldCBpbnNlcnRpb25zID0gMCwgZGVsZXRpb25zID0gMDtcblx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRcdFx0aW5zZXJ0aW9ucyArPSBjaGFuZ2UuaW5zZXJ0aW9ucztcblx0XHRcdFx0ZGVsZXRpb25zICs9IGNoYW5nZS5kZWxldGlvbnM7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGJyYW5jaCxcblx0XHRcdFx0ZmlsZXM6IGNoYW5nZXMubGVuZ3RoLFxuXHRcdFx0XHRpbnNlcnRpb25zLFxuXHRcdFx0XHRkZWxldGlvbnMsXG5cdFx0XHR9IHNhdGlzZmllcyBJRGlmZlN0YXRzO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fZGlmZlN0YXRzT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudXBkYXRlTGFiZWwoKTtcblx0XHRcdHRoaXMudXBkYXRlVG9vbHRpcCgpO1xuXHRcdFx0dGhpcy51cGRhdGVBcmlhTGFiZWwoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0TGFiZWxUZXh0KCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgeyBmaWxlcyB9ID0gdGhpcy5fZGlmZlN0YXRzT2JzLmdldCgpO1xuXHRcdHJldHVybiBmaWxlcyA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5jaGFuZ2VzLmZpbGUnLCBcInswfSBmaWxlXCIsIGZpbGVzKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5jaGFuZ2VzLmZpbGVzJywgXCJ7MH0gZmlsZXNcIiwgZmlsZXMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldEFkZGl0aW9uYWxMYWJlbENvbnRlbnQoKTogQXJyYXk8SFRNTEVsZW1lbnQgfCBzdHJpbmc+IHtcblx0XHRjb25zdCB7IGluc2VydGlvbnMsIGRlbGV0aW9ucyB9ID0gdGhpcy5fZGlmZlN0YXRzT2JzLmdldCgpO1xuXHRcdHJldHVybiBbXG5cdFx0XHQkKCdzcGFuLmNoYXQtY29tcG9zaXRlLWJhci1tZXRhLWFkZGVkJywgdW5kZWZpbmVkLCBgKyR7aW5zZXJ0aW9uc31gKSxcblx0XHRcdCQoJ3NwYW4uY2hhdC1jb21wb3NpdGUtYmFyLW1ldGEtcmVtb3ZlZCcsIHVuZGVmaW5lZCwgYC0ke2RlbGV0aW9uc31gKSxcblx0XHRdO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFRvb2x0aXAoKTogc3RyaW5nIHtcblx0XHRjb25zdCB7IGJyYW5jaCB9ID0gdGhpcy5fZGlmZlN0YXRzT2JzLmdldCgpO1xuXHRcdHJldHVybiBicmFuY2hcblx0XHRcdD8gbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnMudmlld0NoYW5nZXMudG9vbHRpcC5icmFuY2gnLCBcIlZpZXcgQWxsIENoYW5nZXMgKHswfSlcIiwgYnJhbmNoKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy52aWV3Q2hhbmdlcy50b29sdGlwJywgXCJWaWV3IEFsbCBDaGFuZ2VzXCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHsgZmlsZXMsIGluc2VydGlvbnMsIGRlbGV0aW9ucyB9ID0gdGhpcy5fZGlmZlN0YXRzT2JzLmdldCgpO1xuXHRcdGNvbnN0IGZpbGVzTGFiZWwgPSBmaWxlcyA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5jaGFuZ2VzLmZpbGUnLCBcInswfSBmaWxlXCIsIGZpbGVzKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5jaGFuZ2VzLmZpbGVzJywgXCJ7MH0gZmlsZXNcIiwgZmlsZXMpO1xuXHRcdC8vIGUuZy4gXCJWaWV3IEFsbCBDaGFuZ2VzIChtYWluKTogMyBmaWxlcywgKzEwLCAtNFwiXG5cdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudFNlc3Npb25zLnZpZXdDaGFuZ2VzLmFyaWFMYWJlbCcsIFwiezB9OiB7MX0sICt7Mn0sIC17M31cIiwgdGhpcy5nZXRUb29sdGlwKCksIGZpbGVzTGFiZWwsIGluc2VydGlvbnMsIGRlbGV0aW9ucyk7XG5cdH1cbn1cblxuLyoqXG4gKiBSZWdpc3RlcnMgdGhlIHtAbGluayBWaWV3QWxsQ2hhbmdlc0FjdGlvblZpZXdJdGVtfSBmb3IgdGhlIGRpZmYtc3RhdHMgYWN0aW9uIGluIHRoZVxuICogc2Vzc2lvbiBoZWFkZXIgbWV0YSB0b29sYmFyLiBSZWdpc3RlcmluZyBpdCBoZXJlIChyYXRoZXIgdGhhbiBpbiB0aGUgY29yZSBzZXNzaW9uIGhlYWRlcilcbiAqIGtlZXBzIHRoZSByZW5kZXJpbmcgb2YgdGhlIGNoYW5nZXMtb3duZWQgYWN0aW9uIGNvLWxvY2F0ZWQgd2l0aCB0aGUgYWN0aW9uIGl0c2VsZi5cbiAqL1xuY2xhc3MgVmlld0FsbENoYW5nZXNBY3Rpb25WaWV3SXRlbUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIudmlld0FsbENoYW5nZXNBY3Rpb25WaWV3SXRlbSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gVGhlIGFjdGlvbiB2aWV3IGl0ZW0gc2VydmljZSBvbmx5IG5vdGlmaWVzIHRvb2xiYXJzIG9mIGEgZmFjdG9yeSB2aWFcblx0XHQvLyB0aGUgZXZlbnQgcGFzc2VkIHRvIHJlZ2lzdGVyKCksIG5vdCBvbiByZWdpc3RyYXRpb24gaXRzZWxmLiBBIHNlc3Npb25cblx0XHQvLyBoZWFkZXIgcmVzdG9yZWQgd2l0aCBleGlzdGluZyBjaGFuZ2VzIG1heSBjcmVhdGUgaXRzIG1ldGEgdG9vbGJhclxuXHRcdC8vIGJlZm9yZSB0aGlzIGNvbnRyaWJ1dGlvbiBydW5zLCBzbyBhbm5vdW5jZSB0aGUgZmFjdG9yeSBvbmNlIHJpZ2h0XG5cdFx0Ly8gYWZ0ZXIgcmVnaXN0ZXJpbmcgdG8gbWFrZSB0aG9zZSB0b29sYmFycyByZS1yZW5kZXIgYW5kIHBpY2sgaXQgdXAuXG5cdFx0Y29uc3Qgb25EaWRSZWdpc3RlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51cy5TZXNzaW9uSGVhZGVyTWV0YSwgVmlld0FsbENoYW5nZXNBY3Rpb24uSUQsIChhY3Rpb24sIG9wdGlvbnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWaWV3QWxsQ2hhbmdlc0FjdGlvblZpZXdJdGVtLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdH0sIG9uRGlkUmVnaXN0ZXIuZXZlbnQpKTtcblx0XHRvbkRpZFJlZ2lzdGVyLmZpcmUoKTtcblx0fVxufVxuXG4vLyAtLS0gTXVsdGktZGlmZiBzb3VyY2UgcmVzb2x2ZXJcblxuLyoqXG4gKiBSZWdpc3RlcnMgdGhlIG11bHRpLWRpZmYgc291cmNlIHJlc29sdmVyIHRoYXQgdGVhY2hlcyB0aGUgbXVsdGktZmlsZSBkaWZmXG4gKiBlZGl0b3IgaG93IHRvIHR1cm4gYSBgY2hhbmdlcy1tdWx0aS1kaWZmLXNvdXJjZTo8c2Vzc2lvbj5gIFVSSSBpbnRvIHRoZSBhY3R1YWxcbiAqIGxpc3Qgb2YgZmlsZSBkaWZmcyBmb3IgdGhhdCBzZXNzaW9uLlxuICpcbiAqIEl0IHVzZWQgdG8gYmUgY3JlYXRlZCBieSB0aGUgYENoYW5nZXNWaWV3UGFuZWAsIHNvIGl0IG9ubHkgZXhpc3RlZCB3aGlsZSB0aGVcbiAqIENoYW5nZXMgdmlldyAoYXV4aWxpYXJ5IGJhcikgd2FzIG9wZW4uIFRoZSBzZXNzaW9uIGhlYWRlcidzIFwiVmlldyBBbGwgQ2hhbmdlc1wiXG4gKiBhY3Rpb24gb3BlbnMgdGhlIG11bHRpLWRpZmYgZWRpdG9yIGRpcmVjdGx5LCBzbyB0aGUgcmVzb2x2ZXIgbXVzdCBleGlzdFxuICogaW5kZXBlbmRlbnRseSBvZiB0aGF0IHZpZXcgXHUyMDE0IGhlbmNlIHRoaXMgc3RhbmRhbG9uZSBjb250cmlidXRpb24uIEl0IHNoYXJlcyB0aGVcbiAqIGNoYW5nZXMgdmlldyBtb2RlbCB3aXRoIHRoZSBDaGFuZ2VzIHZpZXcgdmlhIHtAbGluayBJQ2hhbmdlc1ZpZXdTZXJ2aWNlfVxuICogc28gYm90aCByZXNvbHZlIHRoZSBzYW1lIGNoYW5nZXNldCBzZWxlY3Rpb24uIEl0IGlzIHJlZ2lzdGVyZWQgYXRcbiAqIHtAbGluayBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmV9IHNvIGEgcHJldmlvdXNseSBvcGVuIGNoYW5nZXMgZGlmZiBlZGl0b3JcbiAqIGNhbiByZXNvbHZlIGl0cyBjb250ZW50cyBkdXJpbmcgd29ya2JlbmNoIHJlc3RvcmUuXG4gKi9cbmNsYXNzIENoYW5nZXNNdWx0aURpZmZTb3VyY2VSZXNvbHZlckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuc2Vzc2lvbnMuY2hhbmdlc011bHRpRGlmZlNvdXJjZVJlc29sdmVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhbmdlc011bHRpRGlmZlNvdXJjZVJlc29sdmVyKSk7XG5cdH1cbn1cblxuY2xhc3MgQ2hhbmdlc2V0T3BlcmF0aW9uc0FjdGlvbkNvbnRyb2xsZXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zZXNzaW9ucy5jaGFuZ2VzZXRPcGVyYXRpb25zQWN0aW9uQ29udHJvbGxlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGFuZ2VzVmlld1NlcnZpY2UgY2hhbmdlc1ZpZXdTZXJ2aWNlOiBJQ2hhbmdlc1ZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gVXNlIHRvIG9wdGltaXN0aWNhbGx5IHVwZGF0ZSB0aGUgdG9vbGJhcnMgdW50aWwgdGhlIHNlcnZlciBjb25maXJtc1xuXHRcdC8vIHRoZSBzdGF0ZS4gQXMgc29vbiBhcyB0aGUgc2VydmVyIGNvbmZpcm1zIHRoZSBzdGF0ZSwgdGhlIGNsaWVudCBhcnJheVxuXHRcdC8vIHdpbGwgYmUgcmVzZXQgdG8gYHVuZGVmaW5lZGAgc28gdGhhdCB0aGUgc2VydmVyIHN0YXRlIHRha2VzIHByZWNlZGVuY2UuXG5cdFx0Y29uc3QgY2xpZW50UmV2aWV3ZWRGaWxlc09icyA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblxuXHRcdC8vIEF1dGhvcml0YXRpdmUgc291cmNlIG9mIHJldmlld2VkIGZpbGVzLiBUaGlzIHdpbGwgYmUgdXBkYXRlZFxuXHRcdC8vIHdoZW4gdGhlIHN0YXRlIGlzIHNhdmVkIG9uIHRoZSBzZXJ2ZXIgYW5kIGNvbmZpcm1lZCBiYWNrIHRvXG5cdFx0Ly8gdGhlIGNsaWVudFxuXHRcdGNvbnN0IGFnZW50SG9zdFJldmlld2VkRmlsZXNPYnMgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nW10+KHRoaXMsIFtdKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSBjaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNPYnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCByZXZpZXdlZEZpbGVzID0gY2hhbmdlc1xuXHRcdFx0XHQuZmlsdGVyKGNoYW5nZSA9PiBjaGFuZ2UucmV2aWV3ZWQpXG5cdFx0XHRcdC5tYXAoY2hhbmdlID0+IGNoYW5nZS5tb2RpZmllZFVyaT8udG9TdHJpbmcoKSA/PyBjaGFuZ2Uub3JpZ2luYWxVcmk/LnRvU3RyaW5nKCkpXG5cdFx0XHRcdC5maWx0ZXIoKHVyaTogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB1cmkgIT09IHVuZGVmaW5lZCk7XG5cblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0Y2xpZW50UmV2aWV3ZWRGaWxlc09icy5zZXQodW5kZWZpbmVkLCB0eCk7XG5cdFx0XHRcdGFnZW50SG9zdFJldmlld2VkRmlsZXNPYnMuc2V0KHJldmlld2VkRmlsZXMsIHR4KTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5PHN0cmluZ1tdPihTZXNzaW9uQ2hhbmdlc1Jldmlld2VkRmlsZXNDb250ZXh0LCBjb250ZXh0S2V5U2VydmljZSwgcmVhZGVyID0+IHtcblx0XHRcdHJldHVybiBjbGllbnRSZXZpZXdlZEZpbGVzT2JzLnJlYWQocmVhZGVyKSA/PyBhZ2VudEhvc3RSZXZpZXdlZEZpbGVzT2JzLnJlYWQocmVhZGVyKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjaGFuZ2VzZXQgPSBjaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCByZXNvdXJjZU9wZXJhdGlvbnMgPSAoY2hhbmdlc2V0Py5vcGVyYXRpb25zLnJlYWQocmVhZGVyKSA/PyBbXSlcblx0XHRcdFx0LmZpbHRlcihvcCA9PiBvcC5zY29wZXMuaW5jbHVkZXMoU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblNjb3BlLlJlc291cmNlKSk7XG5cblx0XHRcdGlmIChyZXNvdXJjZU9wZXJhdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBvcGVyYXRpb24gb2YgcmVzb3VyY2VPcGVyYXRpb25zKSB7XG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmNvbnRyaWIuc2Vzc2lvbnMuY2hhbmdlc2V0T3BlcmF0aW9uLiR7b3BlcmF0aW9uLmlkfWAsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiBvcGVyYXRpb24ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdGljb246IG9wZXJhdGlvbi5pY29uLFxuXHRcdFx0XHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudHNDaGFuZ2VJbmxpbmVUb29sYmFyLFxuXHRcdFx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRcdFx0b3JkZXI6IDEwMFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5NdWx0aURpZmZFZGl0b3JGaWxlVG9vbGJhcixcblx0XHRcdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0XHRcdG9yZGVyOiAxMDBcblx0XHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdFx0XHQvLyBUaGUgQ2hhbmdlcyB2aWV3IHByb3ZpZGVzIHRoZSByZXNvdXJjZSBhcyB0aGUgdGhpcmQgYXJndW1lbnQgKHVzZXMgYVxuXHRcdFx0XHRcdFx0Ly8gY3VzdG9tIGFjdGlvbiBydW5uZXIpIHdoaWxlIHRoZSBtdWx0aS1maWxlIGRpZmYgZWRpdG9yIHByb3ZpZGVzIHRoZVxuXHRcdFx0XHRcdFx0Ly8gcmVzb3VyY2UgYXMgdGhlIGZpcnN0IGFyZ3VtZW50LlxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBhcmdzLmxlbmd0aCA9PT0gMyA/IGFyZ3NbMl0gOiBhcmdzWzBdO1xuXHRcdFx0XHRcdFx0aWYgKCFyZXNvdXJjZSB8fCAhKHJlc291cmNlIGluc3RhbmNlb2YgVVJJKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGF3YWl0IGNoYW5nZXNldD8uaW52b2tlT3BlcmF0aW9uKG9wZXJhdGlvbi5pZCwge1xuXHRcdFx0XHRcdFx0XHRraW5kOiAncmVzb3VyY2UnLFxuXHRcdFx0XHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhbmdlc011bHRpRGlmZlNvdXJjZVJlc29sdmVyQ29udHJpYnV0aW9uLklELCBDaGFuZ2VzTXVsdGlEaWZmU291cmNlUmVzb2x2ZXJDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhbmdlc2V0T3BlcmF0aW9uc0FjdGlvbkNvbnRyb2xsZXJDb250cmlidXRpb24uSUQsIENoYW5nZXNldE9wZXJhdGlvbnNBY3Rpb25Db250cm9sbGVyQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihWaWV3QWxsQ2hhbmdlc0FjdGlvblZpZXdJdGVtQ29udHJpYnV0aW9uLklELCBWaWV3QWxsQ2hhbmdlc0FjdGlvblZpZXdJdGVtQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTO0FBRWxCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLGFBQTBCLGlCQUFpQixtQkFBbUI7QUFDaEYsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxTQUFTLFFBQVEsZ0JBQWdCLHVCQUF1QjtBQUNqRSxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBaUMsZ0NBQWdDLHNCQUFzQjtBQUN2RixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUywwQkFBMEIsaUNBQWlDO0FBQ3BFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0NBQXNDO0FBRS9DLFNBQVMsMkJBQTJCO0FB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
