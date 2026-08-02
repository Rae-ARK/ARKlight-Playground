import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import "./media/review.css";
import { isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorContributionInstantiation, registerEditorContribution } from "../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import * as nls from "../../../../nls.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ICommentService } from "./commentService.js";
import { ctxCommentEditorFocused, SimpleCommentEditor } from "./simpleCommentEditor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { CommentController, ID } from "./commentsController.js";
import { Range } from "../../../../editor/common/core/range.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { CommentContextKeys } from "../common/commentContextKeys.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { accessibilityHelpIsShown, accessibleViewCurrentProviderId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { CommentCommandId } from "../common/commentCommandIds.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { CommentsInputContentProvider } from "./commentsInputContentProvider.js";
import { AccessibleViewProviderId } from "../../../../platform/accessibility/browser/accessibleView.js";
import { CommentWidgetFocus } from "./commentThreadZoneWidget.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { CommentThreadCollapsibleState, CommentThreadState } from "../../../../editor/common/languages.js";
registerEditorContribution(ID, CommentController, EditorContributionInstantiation.AfterFirstRender);
registerWorkbenchContribution2(CommentsInputContentProvider.ID, CommentsInputContentProvider, WorkbenchPhase.BlockRestore);
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CommentCommandId.NextThread,
  handler: async (accessor, args) => {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return Promise.resolve();
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return Promise.resolve();
    }
    controller.nextCommentThread(true);
  },
  weight: KeybindingWeight.EditorContrib,
  primary: KeyMod.Alt | KeyCode.F9
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CommentCommandId.PreviousThread,
  handler: async (accessor, args) => {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return Promise.resolve();
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return Promise.resolve();
    }
    controller.previousCommentThread(true);
  },
  weight: KeybindingWeight.EditorContrib,
  primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F9
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.NextCommentedRange,
      title: {
        value: nls.localize("comments.NextCommentedRange", "Go to Next Commented Range"),
        original: "Go to Next Commented Range"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.activeEditorHasCommentingRange
      }],
      keybinding: {
        primary: KeyMod.Alt | KeyCode.F10,
        weight: KeybindingWeight.EditorContrib,
        when: CommentContextKeys.activeEditorHasCommentingRange
      }
    });
  }
  run(accessor, ...args) {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return;
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return;
    }
    controller.nextCommentThread(false);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.PreviousCommentedRange,
      title: {
        value: nls.localize("comments.previousCommentedRange", "Go to Previous Commented Range"),
        original: "Go to Previous Commented Range"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.activeEditorHasCommentingRange
      }],
      keybinding: {
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F10,
        weight: KeybindingWeight.EditorContrib,
        when: CommentContextKeys.activeEditorHasCommentingRange
      }
    });
  }
  run(accessor, ...args) {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return;
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return;
    }
    controller.previousCommentThread(false);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.NextRange,
      title: {
        value: nls.localize("comments.nextCommentingRange", "Go to Next Commenting Range"),
        original: "Go to Next Commenting Range"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.activeEditorHasCommentingRange
      }],
      keybinding: {
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow),
        weight: KeybindingWeight.EditorContrib,
        when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ContextKeyExpr.or(EditorContextKeys.focus, CommentContextKeys.commentFocused, ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Comments))))
      }
    });
  }
  run(accessor, args) {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return;
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return;
    }
    controller.nextCommentingRange();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.PreviousRange,
      title: {
        value: nls.localize("comments.previousCommentingRange", "Go to Previous Commenting Range"),
        original: "Go to Previous Commenting Range"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.activeEditorHasCommentingRange
      }],
      keybinding: {
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow),
        weight: KeybindingWeight.EditorContrib,
        when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ContextKeyExpr.or(EditorContextKeys.focus, CommentContextKeys.commentFocused, ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Comments))))
      }
    });
  }
  async run(accessor, ...args) {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return;
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return;
    }
    controller.previousCommentingRange();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.ToggleCommenting,
      title: {
        value: nls.localize("comments.toggleCommenting", "Toggle Editor Commenting"),
        original: "Toggle Editor Commenting"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.WorkspaceHasCommenting
      }]
    });
  }
  run(accessor, ...args) {
    const commentService = accessor.get(ICommentService);
    const enable = commentService.isCommentingEnabled;
    commentService.enableCommenting(!enable);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.Add,
      title: {
        value: nls.localize("comments.addCommand", "Add Comment on Current Selection"),
        original: "Add Comment on Current Selection"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.activeCursorHasCommentingRange
      }],
      keybinding: {
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC),
        weight: KeybindingWeight.EditorContrib,
        when: CommentContextKeys.activeCursorHasCommentingRange
      }
    });
  }
  async run(accessor, args) {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return;
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return;
    }
    const position = args?.range ? new Range(args.range.startLineNumber, args.range.startLineNumber, args.range.endLineNumber, args.range.endColumn) : args?.fileComment ? void 0 : activeEditor.getSelection();
    await controller.addOrToggleCommentAtLine(position, void 0);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.FocusCommentOnCurrentLine,
      title: {
        value: nls.localize("comments.focusCommentOnCurrentLine", "Focus Comment on Current Line"),
        original: "Focus Comment on Current Line"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      f1: true,
      precondition: CommentContextKeys.activeCursorHasComment
    });
  }
  async run(accessor, ...args) {
    const activeEditor = getActiveEditor(accessor);
    if (!activeEditor) {
      return;
    }
    const controller = CommentController.get(activeEditor);
    if (!controller) {
      return;
    }
    const position = activeEditor.getSelection();
    const notificationService = accessor.get(INotificationService);
    let error = false;
    try {
      const commentAtLine = controller.getCommentsAtLine(position);
      if (commentAtLine.length === 0) {
        error = true;
      } else {
        await controller.revealCommentThread(commentAtLine[0].commentThread.threadId, void 0, false, CommentWidgetFocus.Widget);
      }
    } catch (e) {
      error = true;
    }
    if (error) {
      notificationService.error(nls.localize("comments.focusCommand.error", "The cursor must be on a line with a comment to focus the comment"));
    }
  }
});
function changeAllCollapseState(commentService, newState) {
  for (const resource of commentService.commentsModel.resourceCommentThreads) {
    for (const thread of resource.commentThreads) {
      thread.thread.collapsibleState = newState(thread.thread);
    }
  }
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.CollapseAll,
      title: {
        value: nls.localize("comments.collapseAll", "Collapse All Comments"),
        original: "Collapse All Comments"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.WorkspaceHasCommenting
      }]
    });
  }
  run(accessor, ...args) {
    const commentService = accessor.get(ICommentService);
    changeAllCollapseState(commentService, () => CommentThreadCollapsibleState.Collapsed);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.ExpandAll,
      title: {
        value: nls.localize("comments.expandAll", "Expand All Comments"),
        original: "Expand All Comments"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.WorkspaceHasCommenting
      }]
    });
  }
  run(accessor, ...args) {
    const commentService = accessor.get(ICommentService);
    changeAllCollapseState(commentService, () => CommentThreadCollapsibleState.Expanded);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CommentCommandId.ExpandUnresolved,
      title: {
        value: nls.localize("comments.expandUnresolved", "Expand Unresolved Comments"),
        original: "Expand Unresolved Comments"
      },
      category: {
        value: nls.localize("commentsCategory", "Comments"),
        original: "Comments"
      },
      menu: [{
        id: MenuId.CommandPalette,
        when: CommentContextKeys.WorkspaceHasCommenting
      }]
    });
  }
  run(accessor, ...args) {
    const commentService = accessor.get(ICommentService);
    changeAllCollapseState(commentService, (commentThread) => {
      return commentThread.state === CommentThreadState.Unresolved ? CommentThreadCollapsibleState.Expanded : CommentThreadCollapsibleState.Collapsed;
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CommentCommandId.Submit,
  weight: KeybindingWeight.EditorContrib,
  primary: KeyMod.CtrlCmd | KeyCode.Enter,
  when: ctxCommentEditorFocused,
  handler: (accessor, args) => {
    const activeCodeEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    if (activeCodeEditor instanceof SimpleCommentEditor) {
      activeCodeEditor.getParentThread().submitComment();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CommentCommandId.Hide,
  weight: KeybindingWeight.EditorContrib,
  primary: KeyCode.Escape,
  secondary: [KeyMod.Shift | KeyCode.Escape],
  when: ContextKeyExpr.or(ctxCommentEditorFocused, CommentContextKeys.commentFocused),
  handler: async (accessor, args) => {
    const activeCodeEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    const keybindingService = accessor.get(IKeybindingService);
    const notificationService = accessor.get(INotificationService);
    const commentService = accessor.get(ICommentService);
    await keybindingService.enableKeybindingHoldMode(CommentCommandId.Hide);
    if (activeCodeEditor instanceof SimpleCommentEditor) {
      activeCodeEditor.getParentThread().collapse();
    } else if (activeCodeEditor) {
      const controller = CommentController.get(activeCodeEditor);
      if (!controller) {
        return;
      }
      let error = false;
      try {
        const activeComment = commentService.lastActiveCommentcontroller?.activeComment;
        if (!activeComment) {
          error = true;
        } else {
          controller.collapseAndFocusRange(activeComment.thread.threadId);
        }
      } catch (e) {
        error = true;
      }
      if (error) {
        notificationService.error(nls.localize("comments.focusCommand.error", "The cursor must be on a line with a comment to focus the comment"));
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CommentCommandId.Hide,
  weight: KeybindingWeight.EditorContrib,
  primary: KeyMod.CtrlCmd | KeyCode.Escape,
  win: { primary: KeyMod.Alt | KeyCode.Backspace },
  when: ContextKeyExpr.and(EditorContextKeys.focus, CommentContextKeys.commentWidgetVisible),
  handler: async (accessor, args) => {
    const activeCodeEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    const keybindingService = accessor.get(IKeybindingService);
    await keybindingService.enableKeybindingHoldMode(CommentCommandId.Hide);
    if (activeCodeEditor) {
      const controller = CommentController.get(activeCodeEditor);
      if (controller) {
        await controller.collapseVisibleComments();
      }
    }
  }
});
function getActiveEditor(accessor) {
  let activeTextEditorControl = accessor.get(IEditorService).activeTextEditorControl;
  if (isDiffEditor(activeTextEditorControl)) {
    if (activeTextEditorControl.getOriginalEditor().hasTextFocus()) {
      activeTextEditorControl = activeTextEditorControl.getOriginalEditor();
    } else {
      activeTextEditorControl = activeTextEditorControl.getModifiedEditor();
    }
  }
  if (!isCodeEditor(activeTextEditorControl) || !activeTextEditorControl.hasModel()) {
    return null;
  }
  return activeTextEditorControl;
}
export {
  getActiveEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudHNFZGl0b3JDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0ICcuL21lZGlhL3Jldmlldy5jc3MnO1xuaW1wb3J0IHsgSUFjdGl2ZUNvZGVFZGl0b3IsIGlzQ29kZUVkaXRvciwgaXNEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29tbWVudFNlcnZpY2UgfSBmcm9tICcuL2NvbW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGN0eENvbW1lbnRFZGl0b3JGb2N1c2VkLCBTaW1wbGVDb21tZW50RWRpdG9yIH0gZnJvbSAnLi9zaW1wbGVDb21tZW50RWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ29tbWVudENvbnRyb2xsZXIsIElEIH0gZnJvbSAnLi9jb21tZW50c0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IENvbW1lbnRDb250ZXh0S2V5cyB9IGZyb20gJy4uL2NvbW1vbi9jb21tZW50Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGFjY2Vzc2liaWxpdHlIZWxwSXNTaG93biwgYWNjZXNzaWJsZVZpZXdDdXJyZW50UHJvdmlkZXJJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb21tZW50Q29tbWFuZElkIH0gZnJvbSAnLi4vY29tbW9uL2NvbW1lbnRDb21tYW5kSWRzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tZW50c0lucHV0Q29udGVudFByb3ZpZGVyIH0gZnJvbSAnLi9jb21tZW50c0lucHV0Q29udGVudFByb3ZpZGVyLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBDb21tZW50V2lkZ2V0Rm9jdXMgfSBmcm9tICcuL2NvbW1lbnRUaHJlYWRab25lV2lkZ2V0LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgQ29tbWVudFRocmVhZCwgQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUsIENvbW1lbnRUaHJlYWRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcblxucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oSUQsIENvbW1lbnRDb250cm9sbGVyLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkFmdGVyRmlyc3RSZW5kZXIpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENvbW1lbnRzSW5wdXRDb250ZW50UHJvdmlkZXIuSUQsIENvbW1lbnRzSW5wdXRDb250ZW50UHJvdmlkZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogQ29tbWVudENvbW1hbmRJZC5OZXh0VGhyZWFkLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIGFyZ3M/OiB7IHJhbmdlOiBJUmFuZ2U7IGZpbGVDb21tZW50OiBib29sZWFuIH0pID0+IHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBnZXRBY3RpdmVFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGlmICghYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1lbnRDb250cm9sbGVyLmdldChhY3RpdmVFZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRjb250cm9sbGVyLm5leHRDb21tZW50VGhyZWFkKHRydWUpO1xuXHR9LFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuRjksXG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBDb21tZW50Q29tbWFuZElkLlByZXZpb3VzVGhyZWFkLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIGFyZ3M/OiB7IHJhbmdlOiBJUmFuZ2U7IGZpbGVDb21tZW50OiBib29sZWFuIH0pID0+IHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBnZXRBY3RpdmVFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGlmICghYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1lbnRDb250cm9sbGVyLmdldChhY3RpdmVFZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRjb250cm9sbGVyLnByZXZpb3VzQ29tbWVudFRocmVhZCh0cnVlKTtcblx0fSxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkY5XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb21tZW50Q29tbWFuZElkLk5leHRDb21tZW50ZWRSYW5nZSxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzLk5leHRDb21tZW50ZWRSYW5nZScsIFwiR28gdG8gTmV4dCBDb21tZW50ZWQgUmFuZ2VcIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnR28gdG8gTmV4dCBDb21tZW50ZWQgUmFuZ2UnXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IHtcblx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY29tbWVudHNDYXRlZ29yeScsIFwiQ29tbWVudHNcIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnQ29tbWVudHMnXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29tbWVudENvbnRleHRLZXlzLmFjdGl2ZUVkaXRvckhhc0NvbW1lbnRpbmdSYW5nZVxuXHRcdFx0fV0sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkYxMCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbW1lbnRDb250ZXh0S2V5cy5hY3RpdmVFZGl0b3JIYXNDb21tZW50aW5nUmFuZ2Vcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGdldEFjdGl2ZUVkaXRvcihhY2Nlc3Nvcik7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29tbWVudENvbnRyb2xsZXIuZ2V0KGFjdGl2ZUVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIubmV4dENvbW1lbnRUaHJlYWQoZmFsc2UpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb21tZW50Q29tbWFuZElkLlByZXZpb3VzQ29tbWVudGVkUmFuZ2UsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjb21tZW50cy5wcmV2aW91c0NvbW1lbnRlZFJhbmdlJywgXCJHbyB0byBQcmV2aW91cyBDb21tZW50ZWQgUmFuZ2VcIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnR28gdG8gUHJldmlvdXMgQ29tbWVudGVkIFJhbmdlJ1xuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzQ2F0ZWdvcnknLCBcIkNvbW1lbnRzXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0NvbW1lbnRzJ1xuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbW1lbnRDb250ZXh0S2V5cy5hY3RpdmVFZGl0b3JIYXNDb21tZW50aW5nUmFuZ2Vcblx0XHRcdH1dLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GMTAsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb21tZW50Q29udGV4dEtleXMuYWN0aXZlRWRpdG9ySGFzQ29tbWVudGluZ1JhbmdlXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBnZXRBY3RpdmVFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGlmICghYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1lbnRDb250cm9sbGVyLmdldChhY3RpdmVFZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb250cm9sbGVyLnByZXZpb3VzQ29tbWVudFRocmVhZChmYWxzZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbW1lbnRDb21tYW5kSWQuTmV4dFJhbmdlLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY29tbWVudHMubmV4dENvbW1lbnRpbmdSYW5nZScsIFwiR28gdG8gTmV4dCBDb21tZW50aW5nIFJhbmdlXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0dvIHRvIE5leHQgQ29tbWVudGluZyBSYW5nZSdcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeToge1xuXHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjb21tZW50c0NhdGVnb3J5JywgXCJDb21tZW50c1wiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdDb21tZW50cydcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb21tZW50Q29udGV4dEtleXMuYWN0aXZlRWRpdG9ySGFzQ29tbWVudGluZ1JhbmdlXG5cdFx0XHR9XSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuRG93bkFycm93KSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELCBDb250ZXh0S2V5RXhwci5vcihFZGl0b3JDb250ZXh0S2V5cy5mb2N1cywgQ29tbWVudENvbnRleHRLZXlzLmNvbW1lbnRGb2N1c2VkLCBDb250ZXh0S2V5RXhwci5hbmQoYWNjZXNzaWJpbGl0eUhlbHBJc1Nob3duLCBhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkLmlzRXF1YWxUbyhBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuQ29tbWVudHMpKSkpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiB7IHJhbmdlOiBJUmFuZ2U7IGZpbGVDb21tZW50OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBnZXRBY3RpdmVFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGlmICghYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1lbnRDb250cm9sbGVyLmdldChhY3RpdmVFZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb250cm9sbGVyLm5leHRDb21tZW50aW5nUmFuZ2UoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29tbWVudENvbW1hbmRJZC5QcmV2aW91c1JhbmdlLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY29tbWVudHMucHJldmlvdXNDb21tZW50aW5nUmFuZ2UnLCBcIkdvIHRvIFByZXZpb3VzIENvbW1lbnRpbmcgUmFuZ2VcIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnR28gdG8gUHJldmlvdXMgQ29tbWVudGluZyBSYW5nZSdcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeToge1xuXHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjb21tZW50c0NhdGVnb3J5JywgXCJDb21tZW50c1wiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdDb21tZW50cydcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb21tZW50Q29udGV4dEtleXMuYWN0aXZlRWRpdG9ySGFzQ29tbWVudGluZ1JhbmdlXG5cdFx0XHR9XSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuVXBBcnJvdyksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCwgQ29udGV4dEtleUV4cHIub3IoRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsIENvbW1lbnRDb250ZXh0S2V5cy5jb21tZW50Rm9jdXNlZCwgQ29udGV4dEtleUV4cHIuYW5kKGFjY2Vzc2liaWxpdHlIZWxwSXNTaG93biwgYWNjZXNzaWJsZVZpZXdDdXJyZW50UHJvdmlkZXJJZC5pc0VxdWFsVG8oQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLkNvbW1lbnRzKSkpKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBnZXRBY3RpdmVFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGlmICghYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1lbnRDb250cm9sbGVyLmdldChhY3RpdmVFZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb250cm9sbGVyLnByZXZpb3VzQ29tbWVudGluZ1JhbmdlKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbW1lbnRDb21tYW5kSWQuVG9nZ2xlQ29tbWVudGluZyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzLnRvZ2dsZUNvbW1lbnRpbmcnLCBcIlRvZ2dsZSBFZGl0b3IgQ29tbWVudGluZ1wiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdUb2dnbGUgRWRpdG9yIENvbW1lbnRpbmcnXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IHtcblx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY29tbWVudHNDYXRlZ29yeScsIFwiQ29tbWVudHNcIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnQ29tbWVudHMnXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29tbWVudENvbnRleHRLZXlzLldvcmtzcGFjZUhhc0NvbW1lbnRpbmdcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCBjb21tZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVuYWJsZSA9IGNvbW1lbnRTZXJ2aWNlLmlzQ29tbWVudGluZ0VuYWJsZWQ7XG5cdFx0Y29tbWVudFNlcnZpY2UuZW5hYmxlQ29tbWVudGluZyghZW5hYmxlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29tbWVudENvbW1hbmRJZC5BZGQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjb21tZW50cy5hZGRDb21tYW5kJywgXCJBZGQgQ29tbWVudCBvbiBDdXJyZW50IFNlbGVjdGlvblwiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdBZGQgQ29tbWVudCBvbiBDdXJyZW50IFNlbGVjdGlvbidcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeToge1xuXHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjb21tZW50c0NhdGVnb3J5JywgXCJDb21tZW50c1wiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdDb21tZW50cydcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb21tZW50Q29udGV4dEtleXMuYWN0aXZlQ3Vyc29ySGFzQ29tbWVudGluZ1JhbmdlXG5cdFx0XHR9XSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5QyksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb21tZW50Q29udGV4dEtleXMuYWN0aXZlQ3Vyc29ySGFzQ29tbWVudGluZ1JhbmdlXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiB7IHJhbmdlOiBJUmFuZ2U7IGZpbGVDb21tZW50OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBnZXRBY3RpdmVFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGlmICghYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1lbnRDb250cm9sbGVyLmdldChhY3RpdmVFZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gYXJncz8ucmFuZ2UgPyBuZXcgUmFuZ2UoYXJncy5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGFyZ3MucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBhcmdzLnJhbmdlLmVuZExpbmVOdW1iZXIsIGFyZ3MucmFuZ2UuZW5kQ29sdW1uKVxuXHRcdFx0OiAoYXJncz8uZmlsZUNvbW1lbnQgPyB1bmRlZmluZWQgOiBhY3RpdmVFZGl0b3IuZ2V0U2VsZWN0aW9uKCkpO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuYWRkT3JUb2dnbGVDb21tZW50QXRMaW5lKHBvc2l0aW9uLCB1bmRlZmluZWQpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb21tZW50Q29tbWFuZElkLkZvY3VzQ29tbWVudE9uQ3VycmVudExpbmUsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjb21tZW50cy5mb2N1c0NvbW1lbnRPbkN1cnJlbnRMaW5lJywgXCJGb2N1cyBDb21tZW50IG9uIEN1cnJlbnQgTGluZVwiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdGb2N1cyBDb21tZW50IG9uIEN1cnJlbnQgTGluZSdcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeToge1xuXHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjb21tZW50c0NhdGVnb3J5JywgXCJDb21tZW50c1wiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdDb21tZW50cydcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29tbWVudENvbnRleHRLZXlzLmFjdGl2ZUN1cnNvckhhc0NvbW1lbnQsXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBnZXRBY3RpdmVFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGlmICghYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1lbnRDb250cm9sbGVyLmdldChhY3RpdmVFZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwb3NpdGlvbiA9IGFjdGl2ZUVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRsZXQgZXJyb3IgPSBmYWxzZTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29tbWVudEF0TGluZSA9IGNvbnRyb2xsZXIuZ2V0Q29tbWVudHNBdExpbmUocG9zaXRpb24pO1xuXHRcdFx0aWYgKGNvbW1lbnRBdExpbmUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGVycm9yID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmV2ZWFsQ29tbWVudFRocmVhZChjb21tZW50QXRMaW5lWzBdLmNvbW1lbnRUaHJlYWQudGhyZWFkSWQsIHVuZGVmaW5lZCwgZmFsc2UsIENvbW1lbnRXaWRnZXRGb2N1cy5XaWRnZXQpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGVycm9yID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnY29tbWVudHMuZm9jdXNDb21tYW5kLmVycm9yJywgXCJUaGUgY3Vyc29yIG11c3QgYmUgb24gYSBsaW5lIHdpdGggYSBjb21tZW50IHRvIGZvY3VzIHRoZSBjb21tZW50XCIpKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5mdW5jdGlvbiBjaGFuZ2VBbGxDb2xsYXBzZVN0YXRlKGNvbW1lbnRTZXJ2aWNlOiBJQ29tbWVudFNlcnZpY2UsIG5ld1N0YXRlOiAoY29tbWVudFRocmVhZDogQ29tbWVudFRocmVhZCkgPT4gQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUpIHtcblx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBjb21tZW50U2VydmljZS5jb21tZW50c01vZGVsLnJlc291cmNlQ29tbWVudFRocmVhZHMpIHtcblx0XHRmb3IgKGNvbnN0IHRocmVhZCBvZiByZXNvdXJjZS5jb21tZW50VGhyZWFkcykge1xuXHRcdFx0dGhyZWFkLnRocmVhZC5jb2xsYXBzaWJsZVN0YXRlID0gbmV3U3RhdGUodGhyZWFkLnRocmVhZCk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29tbWVudENvbW1hbmRJZC5Db2xsYXBzZUFsbCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzLmNvbGxhcHNlQWxsJywgXCJDb2xsYXBzZSBBbGwgQ29tbWVudHNcIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnQ29sbGFwc2UgQWxsIENvbW1lbnRzJ1xuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzQ2F0ZWdvcnknLCBcIkNvbW1lbnRzXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0NvbW1lbnRzJ1xuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbW1lbnRDb250ZXh0S2V5cy5Xb3Jrc3BhY2VIYXNDb21tZW50aW5nXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1lbnRTZXJ2aWNlKTtcblx0XHRjaGFuZ2VBbGxDb2xsYXBzZVN0YXRlKGNvbW1lbnRTZXJ2aWNlLCAoKSA9PiBDb21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb21tZW50Q29tbWFuZElkLkV4cGFuZEFsbCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzLmV4cGFuZEFsbCcsIFwiRXhwYW5kIEFsbCBDb21tZW50c1wiKSxcblx0XHRcdFx0b3JpZ2luYWw6ICdFeHBhbmQgQWxsIENvbW1lbnRzJ1xuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzQ2F0ZWdvcnknLCBcIkNvbW1lbnRzXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0NvbW1lbnRzJ1xuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbW1lbnRDb250ZXh0S2V5cy5Xb3Jrc3BhY2VIYXNDb21tZW50aW5nXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1lbnRTZXJ2aWNlKTtcblx0XHRjaGFuZ2VBbGxDb2xsYXBzZVN0YXRlKGNvbW1lbnRTZXJ2aWNlLCAoKSA9PiBDb21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5FeHBhbmRlZCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbW1lbnRDb21tYW5kSWQuRXhwYW5kVW5yZXNvbHZlZCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzLmV4cGFuZFVucmVzb2x2ZWQnLCBcIkV4cGFuZCBVbnJlc29sdmVkIENvbW1lbnRzXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0V4cGFuZCBVbnJlc29sdmVkIENvbW1lbnRzJ1xuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiB7XG5cdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzQ2F0ZWdvcnknLCBcIkNvbW1lbnRzXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0NvbW1lbnRzJ1xuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbW1lbnRDb250ZXh0S2V5cy5Xb3Jrc3BhY2VIYXNDb21tZW50aW5nXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1lbnRTZXJ2aWNlKTtcblx0XHRjaGFuZ2VBbGxDb2xsYXBzZVN0YXRlKGNvbW1lbnRTZXJ2aWNlLCAoY29tbWVudFRocmVhZCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNvbW1lbnRUaHJlYWQuc3RhdGUgPT09IENvbW1lbnRUaHJlYWRTdGF0ZS5VbnJlc29sdmVkID8gQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuRXhwYW5kZWQgOiBDb21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQ7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IENvbW1lbnRDb21tYW5kSWQuU3VibWl0LFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHR3aGVuOiBjdHhDb21tZW50RWRpdG9yRm9jdXNlZCxcblx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzKSA9PiB7XG5cdFx0Y29uc3QgYWN0aXZlQ29kZUVkaXRvciA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpLmdldEZvY3VzZWRDb2RlRWRpdG9yKCk7XG5cdFx0aWYgKGFjdGl2ZUNvZGVFZGl0b3IgaW5zdGFuY2VvZiBTaW1wbGVDb21tZW50RWRpdG9yKSB7XG5cdFx0XHRhY3RpdmVDb2RlRWRpdG9yLmdldFBhcmVudFRocmVhZCgpLnN1Ym1pdENvbW1lbnQoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IENvbW1lbnRDb21tYW5kSWQuSGlkZSxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRzZWNvbmRhcnk6IFtLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVzY2FwZV0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLm9yKGN0eENvbW1lbnRFZGl0b3JGb2N1c2VkLCBDb21tZW50Q29udGV4dEtleXMuY29tbWVudEZvY3VzZWQpLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIGFyZ3MpID0+IHtcblx0XHRjb25zdCBhY3RpdmVDb2RlRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSkuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKTtcblx0XHRjb25zdCBrZXliaW5kaW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJS2V5YmluZGluZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tZW50U2VydmljZSk7XG5cdFx0Ly8gVW5mb3J0dW5hdGUsIGJ1dCBjb2xsYXBzaW5nIHRoZSBjb21tZW50IHRocmVhZCBtaWdodCBjYXVzZSBhIGRpYWxvZyB0byBzaG93XG5cdFx0Ly8gSWYgd2UgZG9uJ3Qgd2FpdCBmb3IgdGhlIGtleSB1cCBoZXJlLCB0aGVuIHRoZSBkaWFsb2cgd2lsbCBjb25zdW1lIGl0IGFuZCBpbW1lZGlhdGVseSBjbG9zZVxuXHRcdGF3YWl0IGtleWJpbmRpbmdTZXJ2aWNlLmVuYWJsZUtleWJpbmRpbmdIb2xkTW9kZShDb21tZW50Q29tbWFuZElkLkhpZGUpO1xuXHRcdGlmIChhY3RpdmVDb2RlRWRpdG9yIGluc3RhbmNlb2YgU2ltcGxlQ29tbWVudEVkaXRvcikge1xuXHRcdFx0YWN0aXZlQ29kZUVkaXRvci5nZXRQYXJlbnRUaHJlYWQoKS5jb2xsYXBzZSgpO1xuXHRcdH0gZWxzZSBpZiAoYWN0aXZlQ29kZUVkaXRvcikge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1lbnRDb250cm9sbGVyLmdldChhY3RpdmVDb2RlRWRpdG9yKTtcblx0XHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBlcnJvciA9IGZhbHNlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlQ29tbWVudCA9IGNvbW1lbnRTZXJ2aWNlLmxhc3RBY3RpdmVDb21tZW50Y29udHJvbGxlcj8uYWN0aXZlQ29tbWVudDtcblx0XHRcdFx0aWYgKCFhY3RpdmVDb21tZW50KSB7XG5cdFx0XHRcdFx0ZXJyb3IgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnRyb2xsZXIuY29sbGFwc2VBbmRGb2N1c1JhbmdlKGFjdGl2ZUNvbW1lbnQudGhyZWFkLnRocmVhZElkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRlcnJvciA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihubHMubG9jYWxpemUoJ2NvbW1lbnRzLmZvY3VzQ29tbWFuZC5lcnJvcicsIFwiVGhlIGN1cnNvciBtdXN0IGJlIG9uIGEgbGluZSB3aXRoIGEgY29tbWVudCB0byBmb2N1cyB0aGUgY29tbWVudFwiKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBDb21tZW50Q29tbWFuZElkLkhpZGUsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRXNjYXBlLFxuXHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuQmFja3NwYWNlIH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy5mb2N1cywgQ29tbWVudENvbnRleHRLZXlzLmNvbW1lbnRXaWRnZXRWaXNpYmxlKSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCBhcmdzKSA9PiB7XG5cdFx0Y29uc3QgYWN0aXZlQ29kZUVkaXRvciA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpLmdldEZvY3VzZWRDb2RlRWRpdG9yKCk7XG5cdFx0Y29uc3Qga2V5YmluZGluZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUtleWJpbmRpbmdTZXJ2aWNlKTtcblx0XHQvLyBVbmZvcnR1bmF0ZSwgYnV0IGNvbGxhcHNpbmcgdGhlIGNvbW1lbnQgdGhyZWFkIG1pZ2h0IGNhdXNlIGEgZGlhbG9nIHRvIHNob3dcblx0XHQvLyBJZiB3ZSBkb24ndCB3YWl0IGZvciB0aGUga2V5IHVwIGhlcmUsIHRoZW4gdGhlIGRpYWxvZyB3aWxsIGNvbnN1bWUgaXQgYW5kIGltbWVkaWF0ZWx5IGNsb3NlXG5cdFx0YXdhaXQga2V5YmluZGluZ1NlcnZpY2UuZW5hYmxlS2V5YmluZGluZ0hvbGRNb2RlKENvbW1lbnRDb21tYW5kSWQuSGlkZSk7XG5cdFx0aWYgKGFjdGl2ZUNvZGVFZGl0b3IpIHtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb21tZW50Q29udHJvbGxlci5nZXQoYWN0aXZlQ29kZUVkaXRvcik7XG5cdFx0XHRpZiAoY29udHJvbGxlcikge1xuXHRcdFx0XHRhd2FpdCBjb250cm9sbGVyLmNvbGxhcHNlVmlzaWJsZUNvbW1lbnRzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFjdGl2ZUVkaXRvcihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IElBY3RpdmVDb2RlRWRpdG9yIHwgbnVsbCB7XG5cdGxldCBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cblx0aWYgKGlzRGlmZkVkaXRvcihhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCkpIHtcblx0XHRpZiAoYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0T3JpZ2luYWxFZGl0b3IoKS5oYXNUZXh0Rm9jdXMoKSkge1xuXHRcdFx0YWN0aXZlVGV4dEVkaXRvckNvbnRyb2wgPSBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRPcmlnaW5hbEVkaXRvcigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCA9IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldE1vZGlmaWVkRWRpdG9yKCk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKCFpc0NvZGVFZGl0b3IoYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpIHx8ICFhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5oYXNNb2RlbCgpKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRyZXR1cm4gYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG59XG5cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFDMUMsT0FBTztBQUNQLFNBQTRCLGNBQWMsb0JBQW9CO0FBQzlELFNBQVMsaUNBQWlDLGtDQUFrQztBQUM1RSxTQUFTLDBCQUEwQjtBQUNuQyxZQUFZLFNBQVM7QUFFckIsU0FBUyxxQkFBcUIsd0JBQXdCO0FBQ3RELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCLDJCQUEyQjtBQUM3RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFB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
