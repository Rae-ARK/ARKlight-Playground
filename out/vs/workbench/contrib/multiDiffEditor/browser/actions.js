import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { localize2 } from "../../../../nls.js";
import { Action2, MenuId } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { resolveCommandsContext } from "../../../browser/parts/editor/editorCommandsContext.js";
import { MultiDiffEditor } from "./multiDiffEditor.js";
import { MultiDiffEditorInput } from "./multiDiffEditorInput.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ActiveEditorContext, IsSessionsWindowContext } from "../../../common/contextkeys.js";
class GoToFileAction extends Action2 {
  constructor() {
    super({
      id: "multiDiffEditor.goToFile",
      title: localize2("goToFile", "Open File"),
      icon: Codicon.goToFile,
      precondition: ActiveEditorContext.isEqualTo(MultiDiffEditor.ID),
      menu: {
        when: ActiveEditorContext.isEqualTo(MultiDiffEditor.ID),
        id: MenuId.MultiDiffEditorFileToolbar,
        order: 22,
        group: "navigation"
      }
    });
  }
  async run(accessor, ...args) {
    const uri = args[0];
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    let selections = void 0;
    if (!(activeEditorPane instanceof MultiDiffEditor)) {
      return;
    }
    const editor = activeEditorPane.tryGetCodeEditor(uri);
    if (editor) {
      selections = editor.editor.getSelections() ?? void 0;
    }
    let targetUri = uri;
    const item = activeEditorPane.findDocumentDiffItem(uri);
    if (item && item.goToFileUri) {
      targetUri = item.goToFileUri;
    }
    await editorService.openEditor({
      label: item?.goToFileEditorTitle,
      resource: targetUri,
      options: {
        selection: selections?.[0],
        selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport
      }
    });
  }
}
class GoToNextChangeAction extends Action2 {
  constructor() {
    super({
      id: "multiDiffEditor.goToNextChange",
      title: localize2("goToNextChange", "Go to Next Change"),
      icon: Codicon.arrowDown,
      precondition: ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID),
      menu: [MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map((id) => ({
        id,
        when: ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID),
        group: "navigation",
        order: 2
      })),
      keybinding: {
        primary: KeyMod.Alt | KeyCode.F5,
        weight: KeybindingWeight.EditorContrib,
        when: ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID)
      },
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    if (!(activeEditorPane instanceof MultiDiffEditor)) {
      return;
    }
    activeEditorPane.goToNextChange();
  }
}
class GoToPreviousChangeAction extends Action2 {
  constructor() {
    super({
      id: "multiDiffEditor.goToPreviousChange",
      title: localize2("goToPreviousChange", "Go to Previous Change"),
      icon: Codicon.arrowUp,
      precondition: ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID),
      menu: [MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map((id) => ({
        id,
        when: ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID),
        group: "navigation",
        order: 1
      })),
      keybinding: {
        primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F5,
        weight: KeybindingWeight.EditorContrib,
        when: ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID)
      },
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    if (!(activeEditorPane instanceof MultiDiffEditor)) {
      return;
    }
    activeEditorPane.goToPreviousChange();
  }
}
class CollapseAllAction extends Action2 {
  constructor() {
    super({
      id: "multiDiffEditor.collapseAll",
      title: localize2("collapseAllDiffs", "Collapse All Diffs"),
      icon: Codicon.collapseAll,
      precondition: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.not("multiDiffEditorAllCollapsed")),
      menu: [
        // In the agents window this action lives in the editor title overflow (...) menu instead of as a primary toolbar icon.
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.not("multiDiffEditorAllCollapsed"), IsSessionsWindowContext.toNegated()),
          group: "navigation",
          order: 100
        },
        // The compact window editor title has no overflow menu, so keep the primary toolbar icon there.
        {
          id: MenuId.CompactWindowEditorTitle,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.not("multiDiffEditorAllCollapsed")),
          group: "navigation",
          order: 100
        },
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.not("multiDiffEditorAllCollapsed"), IsSessionsWindowContext),
          group: "4_collapse",
          order: 10
        }
      ],
      f1: true
    });
  }
  async run(accessor, ...args) {
    const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
    const groupContext = resolvedContext.groupedEditors[0];
    if (!groupContext) {
      return;
    }
    const editor = groupContext.editors[0];
    if (editor instanceof MultiDiffEditorInput) {
      const viewModel = await editor.getViewModel();
      viewModel.collapseAll();
    }
  }
}
class ExpandAllAction extends Action2 {
  constructor() {
    super({
      id: "multiDiffEditor.expandAll",
      title: localize2("ExpandAllDiffs", "Expand All Diffs"),
      icon: Codicon.expandAll,
      precondition: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.has("multiDiffEditorAllCollapsed")),
      menu: [
        // In the agents window this action lives in the editor title overflow (...) menu instead of as a primary toolbar icon.
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.has("multiDiffEditorAllCollapsed"), IsSessionsWindowContext.toNegated()),
          group: "navigation",
          order: 100
        },
        // The compact window editor title has no overflow menu, so keep the primary toolbar icon there.
        {
          id: MenuId.CompactWindowEditorTitle,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.has("multiDiffEditorAllCollapsed")),
          group: "navigation",
          order: 100
        },
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.has("multiDiffEditorAllCollapsed"), IsSessionsWindowContext),
          group: "4_collapse",
          order: 10
        }
      ],
      f1: true
    });
  }
  async run(accessor, ...args) {
    const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
    const groupContext = resolvedContext.groupedEditors[0];
    if (!groupContext) {
      return;
    }
    const editor = groupContext.editors[0];
    if (editor instanceof MultiDiffEditorInput) {
      const viewModel = await editor.getViewModel();
      viewModel.expandAll();
    }
  }
}
export {
  CollapseAllAction,
  ExpandAllAction,
  GoToFileAction,
  GoToNextChangeAction,
  GoToPreviousChangeAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL211bHRpRGlmZkVkaXRvci9icm93c2VyL2FjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucywgVGV4dEVkaXRvclNlbGVjdGlvblJldmVhbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUNvbW1hbmRzQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckNvbW1hbmRzQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3IgfSBmcm9tICcuL211bHRpRGlmZkVkaXRvci5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4vbXVsdGlEaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aXZlRWRpdG9yQ29udGV4dCwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuXG5leHBvcnQgY2xhc3MgR29Ub0ZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdtdWx0aURpZmZFZGl0b3IuZ29Ub0ZpbGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZ29Ub0ZpbGUnLCAnT3BlbiBGaWxlJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLmdvVG9GaWxlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhNdWx0aURpZmZFZGl0b3IuSUQpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHR3aGVuOiBBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhNdWx0aURpZmZFZGl0b3IuSUQpLFxuXHRcdFx0XHRpZDogTWVudUlkLk11bHRpRGlmZkVkaXRvckZpbGVUb29sYmFyLFxuXHRcdFx0XHRvcmRlcjogMjIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1cmkgPSBhcmdzWzBdIGFzIFVSSTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGxldCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoIShhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgTXVsdGlEaWZmRWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IGFjdGl2ZUVkaXRvclBhbmUudHJ5R2V0Q29kZUVkaXRvcih1cmkpO1xuXHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdHNlbGVjdGlvbnMgPSBlZGl0b3IuZWRpdG9yLmdldFNlbGVjdGlvbnMoKSA/PyB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IHRhcmdldFVyaSA9IHVyaTtcblx0XHRjb25zdCBpdGVtID0gYWN0aXZlRWRpdG9yUGFuZS5maW5kRG9jdW1lbnREaWZmSXRlbSh1cmkpO1xuXHRcdGlmIChpdGVtICYmIGl0ZW0uZ29Ub0ZpbGVVcmkpIHtcblx0XHRcdHRhcmdldFVyaSA9IGl0ZW0uZ29Ub0ZpbGVVcmk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdGxhYmVsOiBpdGVtPy5nb1RvRmlsZUVkaXRvclRpdGxlLFxuXHRcdFx0cmVzb3VyY2U6IHRhcmdldFVyaSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0c2VsZWN0aW9uOiBzZWxlY3Rpb25zPy5bMF0sXG5cdFx0XHRcdHNlbGVjdGlvblJldmVhbFR5cGU6IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0fSBzYXRpc2ZpZXMgSVRleHRFZGl0b3JPcHRpb25zLFxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBHb1RvTmV4dENoYW5nZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ211bHRpRGlmZkVkaXRvci5nb1RvTmV4dENoYW5nZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdnb1RvTmV4dENoYW5nZScsICdHbyB0byBOZXh0IENoYW5nZScpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd0Rvd24sXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgTXVsdGlEaWZmRWRpdG9yLklEKSxcblx0XHRcdG1lbnU6IFtNZW51SWQuRWRpdG9yVGl0bGUsIE1lbnVJZC5Db21wYWN0V2luZG93RWRpdG9yVGl0bGVdLm1hcChpZCA9PiAoe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBNdWx0aURpZmZFZGl0b3IuSUQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fSkpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GNSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgTXVsdGlEaWZmRWRpdG9yLklEKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cblx0XHRpZiAoIShhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgTXVsdGlEaWZmRWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFjdGl2ZUVkaXRvclBhbmUuZ29Ub05leHRDaGFuZ2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgR29Ub1ByZXZpb3VzQ2hhbmdlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbXVsdGlEaWZmRWRpdG9yLmdvVG9QcmV2aW91c0NoYW5nZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdnb1RvUHJldmlvdXNDaGFuZ2UnLCAnR28gdG8gUHJldmlvdXMgQ2hhbmdlJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLmFycm93VXAsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgTXVsdGlEaWZmRWRpdG9yLklEKSxcblx0XHRcdG1lbnU6IFtNZW51SWQuRWRpdG9yVGl0bGUsIE1lbnVJZC5Db21wYWN0V2luZG93RWRpdG9yVGl0bGVdLm1hcChpZCA9PiAoe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBNdWx0aURpZmZFZGl0b3IuSUQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fSkpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5GNSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgTXVsdGlEaWZmRWRpdG9yLklEKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cblx0XHRpZiAoIShhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgTXVsdGlEaWZmRWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFjdGl2ZUVkaXRvclBhbmUuZ29Ub1ByZXZpb3VzQ2hhbmdlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbGxhcHNlQWxsQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbXVsdGlEaWZmRWRpdG9yLmNvbGxhcHNlQWxsJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NvbGxhcHNlQWxsRGlmZnMnLCAnQ29sbGFwc2UgQWxsIERpZmZzJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNvbGxhcHNlQWxsLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBNdWx0aURpZmZFZGl0b3IuSUQpLCBDb250ZXh0S2V5RXhwci5ub3QoJ211bHRpRGlmZkVkaXRvckFsbENvbGxhcHNlZCcpKSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0Ly8gSW4gdGhlIGFnZW50cyB3aW5kb3cgdGhpcyBhY3Rpb24gbGl2ZXMgaW4gdGhlIGVkaXRvciB0aXRsZSBvdmVyZmxvdyAoLi4uKSBtZW51IGluc3RlYWQgb2YgYXMgYSBwcmltYXJ5IHRvb2xiYXIgaWNvbi5cblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgTXVsdGlEaWZmRWRpdG9yLklEKSwgQ29udGV4dEtleUV4cHIubm90KCdtdWx0aURpZmZFZGl0b3JBbGxDb2xsYXBzZWQnKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDEwMFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBUaGUgY29tcGFjdCB3aW5kb3cgZWRpdG9yIHRpdGxlIGhhcyBubyBvdmVyZmxvdyBtZW51LCBzbyBrZWVwIHRoZSBwcmltYXJ5IHRvb2xiYXIgaWNvbiB0aGVyZS5cblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tcGFjdFdpbmRvd0VkaXRvclRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsIE11bHRpRGlmZkVkaXRvci5JRCksIENvbnRleHRLZXlFeHByLm5vdCgnbXVsdGlEaWZmRWRpdG9yQWxsQ29sbGFwc2VkJykpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDEwMFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBNdWx0aURpZmZFZGl0b3IuSUQpLCBDb250ZXh0S2V5RXhwci5ub3QoJ211bHRpRGlmZkVkaXRvckFsbENvbGxhcHNlZCcpLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCksXG5cdFx0XHRcdFx0Z3JvdXA6ICc0X2NvbGxhcHNlJyxcblx0XHRcdFx0XHRvcmRlcjogMTBcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGdyb3VwQ29udGV4dCA9IHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9yc1swXTtcblx0XHRpZiAoIWdyb3VwQ29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IGdyb3VwQ29udGV4dC5lZGl0b3JzWzBdO1xuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBNdWx0aURpZmZFZGl0b3JJbnB1dCkge1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gYXdhaXQgZWRpdG9yLmdldFZpZXdNb2RlbCgpO1xuXHRcdFx0dmlld01vZGVsLmNvbGxhcHNlQWxsKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHBhbmRBbGxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdtdWx0aURpZmZFZGl0b3IuZXhwYW5kQWxsJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ0V4cGFuZEFsbERpZmZzJywgJ0V4cGFuZCBBbGwgRGlmZnMnKSxcblx0XHRcdGljb246IENvZGljb24uZXhwYW5kQWxsLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBNdWx0aURpZmZFZGl0b3IuSUQpLCBDb250ZXh0S2V5RXhwci5oYXMoJ211bHRpRGlmZkVkaXRvckFsbENvbGxhcHNlZCcpKSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0Ly8gSW4gdGhlIGFnZW50cyB3aW5kb3cgdGhpcyBhY3Rpb24gbGl2ZXMgaW4gdGhlIGVkaXRvciB0aXRsZSBvdmVyZmxvdyAoLi4uKSBtZW51IGluc3RlYWQgb2YgYXMgYSBwcmltYXJ5IHRvb2xiYXIgaWNvbi5cblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgTXVsdGlEaWZmRWRpdG9yLklEKSwgQ29udGV4dEtleUV4cHIuaGFzKCdtdWx0aURpZmZFZGl0b3JBbGxDb2xsYXBzZWQnKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDEwMFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBUaGUgY29tcGFjdCB3aW5kb3cgZWRpdG9yIHRpdGxlIGhhcyBubyBvdmVyZmxvdyBtZW51LCBzbyBrZWVwIHRoZSBwcmltYXJ5IHRvb2xiYXIgaWNvbiB0aGVyZS5cblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tcGFjdFdpbmRvd0VkaXRvclRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsIE11bHRpRGlmZkVkaXRvci5JRCksIENvbnRleHRLZXlFeHByLmhhcygnbXVsdGlEaWZmRWRpdG9yQWxsQ29sbGFwc2VkJykpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDEwMFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBNdWx0aURpZmZFZGl0b3IuSUQpLCBDb250ZXh0S2V5RXhwci5oYXMoJ211bHRpRGlmZkVkaXRvckFsbENvbGxhcHNlZCcpLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCksXG5cdFx0XHRcdFx0Z3JvdXA6ICc0X2NvbGxhcHNlJyxcblx0XHRcdFx0XHRvcmRlcjogMTBcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGdyb3VwQ29udGV4dCA9IHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9yc1swXTtcblx0XHRpZiAoIWdyb3VwQ29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IGdyb3VwQ29udGV4dC5lZGl0b3JzWzBdO1xuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBNdWx0aURpZmZFZGl0b3JJbnB1dCkge1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gYXdhaXQgZWRpdG9yLmdldFZpZXdNb2RlbCgpO1xuXHRcdFx0dmlld01vZGVsLmV4cGFuZEFsbCgpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxjQUFjO0FBR2hDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQTZCLHFDQUFxQztBQUVsRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFT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
