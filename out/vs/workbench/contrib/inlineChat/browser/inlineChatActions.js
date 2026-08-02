import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorAction2 } from "../../../../editor/browser/editorExtensions.js";
import { EmbeddedDiffEditorWidget } from "../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { InlineChatController, InlineChatRunOptions } from "./inlineChatController.js";
import { ACTION_ASK_IN_CHAT, CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, CTX_INLINE_CHAT_POSSIBLE, ACTION_START, CTX_INLINE_CHAT_V2_ENABLED, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_INLINE_CHAT_TERMINATED, CTX_FIX_DIAGNOSTICS_ENABLED, CTX_INLINE_CHAT_AFFORDANCE_VISIBLE, CTX_ASK_IN_CHAT_ENABLED, CTX_INLINE_CHAT_HAS_NOTEBOOK_INLINE } from "../common/inlineChat.js";
import { ctxHasEditorModification, ctxHasRequestInProgress } from "../../chat/browser/chatEditing/chatEditingEditorContextKeys.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { IChatEditingService } from "../../chat/common/editing/chatEditingService.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
import { ChatEntitlementContextKeys } from "../../../services/chat/common/chatEntitlementService.js";
import { NOTEBOOK_IS_ACTIVE_EDITOR } from "../../notebook/common/notebookContextKeys.js";
CommandsRegistry.registerCommandAlias("interactiveEditor.start", "inlineChat.start");
const START_INLINE_CHAT = registerIcon("start-inline-chat", Codicon.sparkle, localize("startInlineChat", "Icon which spawns the inline chat from the editor toolbar."));
const inlineChatNotebooksOldEnabled = ContextKeyExpr.or(
  ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, CTX_INLINE_CHAT_HAS_NOTEBOOK_INLINE)
);
const inlineChatContextKey = ContextKeyExpr.and(
  ContextKeyExpr.or(inlineChatNotebooksOldEnabled, CTX_INLINE_CHAT_V2_ENABLED),
  CTX_INLINE_CHAT_POSSIBLE,
  EditorContextKeys.writable,
  EditorContextKeys.editorSimpleInput.negate()
);
class StartSessionAction extends Action2 {
  constructor() {
    super({
      id: ACTION_START,
      title: localize2("run", "Open Inline Chat"),
      shortTitle: localize2("runShort", "Inline Chat"),
      category: AbstractInlineChatAction.category,
      f1: true,
      precondition: ContextKeyExpr.and(inlineChatContextKey, ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate())),
      keybinding: {
        when: ContextKeyExpr.and(
          EditorContextKeys.focus,
          inlineChatContextKey,
          ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate())
        ),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyI
      },
      icon: START_INLINE_CHAT,
      menu: [{
        id: MenuId.EditorContext,
        group: "1_chat",
        order: 3,
        when: ContextKeyExpr.and(inlineChatContextKey, ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate()))
      }, {
        id: MenuId.ChatTitleBarMenu,
        group: "a_open",
        order: 3
      }]
    });
  }
  run(accessor, ...args) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const editor = codeEditorService.getActiveCodeEditor();
    if (!editor || editor.isSimpleWidget) {
      return;
    }
    return editor.invokeWithinContext((editorAccessor) => {
      const kbService = editorAccessor.get(IContextKeyService);
      const logService = editorAccessor.get(ILogService);
      const enabled = kbService.contextMatchesRules(this.desc.precondition ?? void 0);
      if (!enabled) {
        logService.debug(`[EditorAction2] NOT running command because its precondition is FALSE`, this.desc.id, this.desc.precondition?.serialize());
        return;
      }
      return this._runEditorCommand(editorAccessor, editor, ...args);
    });
  }
  async _runEditorCommand(accessor, editor, ...args) {
    const ctrl = InlineChatController.get(editor);
    if (!ctrl) {
      return;
    }
    let options;
    const arg = args[0];
    if (arg && InlineChatRunOptions.isInlineChatRunOptions(arg)) {
      options = arg;
    }
    await ctrl?.run({ ...options });
  }
}
MenuRegistry.appendMenuItem(MenuId.InlineChatEditorAffordance, {
  group: "0_chat",
  order: 1,
  when: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasNonEmptySelection, ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate()), ChatEntitlementContextKeys.Setup.hidden.negate()),
  command: {
    id: ACTION_START,
    title: localize("editCode", "Ask for Edits"),
    shortTitle: localize("editCodeShort", "Ask for Edits"),
    icon: Codicon.sparkle
  }
});
class FocusInlineChat extends EditorAction2 {
  constructor() {
    super({
      id: "inlineChat.focus",
      title: localize2("focus", "Focus Input"),
      f1: true,
      category: AbstractInlineChatAction.category,
      precondition: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_FOCUSED.negate(), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
      keybinding: [{
        weight: KeybindingWeight.EditorCore + 10,
        // win against core_command
        when: ContextKeyExpr.and(CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.isEqualTo("above"), EditorContextKeys.isEmbeddedDiffEditor.negate()),
        primary: KeyMod.CtrlCmd | KeyCode.DownArrow
      }, {
        weight: KeybindingWeight.EditorCore + 10,
        // win against core_command
        when: ContextKeyExpr.and(CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.isEqualTo("below"), EditorContextKeys.isEmbeddedDiffEditor.negate()),
        primary: KeyMod.CtrlCmd | KeyCode.UpArrow
      }]
    });
  }
  runEditorCommand(_accessor, editor, ..._args) {
    InlineChatController.get(editor)?.focus();
  }
}
const _AbstractInlineChatAction = class _AbstractInlineChatAction extends EditorAction2 {
  constructor(desc) {
    const massageMenu = (menu) => {
      if (Array.isArray(menu)) {
        for (const entry of menu) {
          entry.when = ContextKeyExpr.and(CTX_INLINE_CHAT_V2_ENABLED, entry.when);
        }
      } else if (menu) {
        menu.when = ContextKeyExpr.and(CTX_INLINE_CHAT_V2_ENABLED, menu.when);
      }
    };
    if (Array.isArray(desc.menu)) {
      massageMenu(desc.menu);
    } else {
      massageMenu(desc.menu);
    }
    super({
      ...desc,
      category: _AbstractInlineChatAction.category,
      precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_V2_ENABLED, desc.precondition)
    });
  }
  runEditorCommand(accessor, editor, ..._args) {
    const editorService = accessor.get(IEditorService);
    const logService = accessor.get(ILogService);
    let ctrl = InlineChatController.get(editor);
    if (!ctrl) {
      const { activeTextEditorControl } = editorService;
      if (isCodeEditor(activeTextEditorControl)) {
        editor = activeTextEditorControl;
      } else if (isDiffEditor(activeTextEditorControl)) {
        editor = activeTextEditorControl.getModifiedEditor();
      }
      ctrl = InlineChatController.get(editor);
    }
    if (!ctrl) {
      logService.warn("[IE] NO controller found for action", this.desc.id, editor.getModel()?.uri);
      return;
    }
    if (editor instanceof EmbeddedCodeEditorWidget) {
      editor = editor.getParentEditor();
    }
    if (!ctrl) {
      for (const diffEditor of accessor.get(ICodeEditorService).listDiffEditors()) {
        if (diffEditor.getOriginalEditor() === editor || diffEditor.getModifiedEditor() === editor) {
          if (diffEditor instanceof EmbeddedDiffEditorWidget) {
            this.runEditorCommand(accessor, diffEditor.getParentEditor(), ..._args);
          }
        }
      }
      return;
    }
    this.runInlineChatCommand(accessor, ctrl, editor, ..._args);
  }
};
_AbstractInlineChatAction.category = localize2("cat", "Inline Chat");
let AbstractInlineChatAction = _AbstractInlineChatAction;
class FixDiagnosticsAction extends AbstractInlineChatAction {
  constructor() {
    super({
      id: "inlineChat.fixDiagnostics",
      title: localize2("fix", "Fix"),
      icon: Codicon.editSparkle,
      precondition: ContextKeyExpr.and(CTX_FIX_DIAGNOSTICS_ENABLED, EditorContextKeys.selectionHasDiagnostics, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate()),
      menu: [{
        id: MenuId.InlineChatEditorAffordance,
        group: "1_quickfix",
        order: 100,
        when: ContextKeyExpr.and(CTX_FIX_DIAGNOSTICS_ENABLED, EditorContextKeys.selectionHasDiagnostics, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate())
      }, {
        id: MenuId.ChatEditorInlineMenu,
        group: "2_chat",
        order: 1,
        when: ContextKeyExpr.and(CTX_FIX_DIAGNOSTICS_ENABLED, EditorContextKeys.selectionHasDiagnostics, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate())
      }, {
        id: MenuId.MarkerHoverStatusBar,
        group: "1_fix",
        order: 1,
        when: ContextKeyExpr.and(CTX_FIX_DIAGNOSTICS_ENABLED, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate()),
        precondition: null
      }]
    });
  }
  runInlineChatCommand(_accessor, ctrl, _editor, ..._args) {
    ctrl.run({ autoSend: true, attachDiagnostics: true });
  }
}
class KeepOrUndoSessionAction extends AbstractInlineChatAction {
  constructor(_keep, desc) {
    super(desc);
    this._keep = _keep;
  }
  async runInlineChatCommand(_accessor, ctrl, editor, ..._args) {
    if (this._keep) {
      await ctrl.acceptSession();
    } else {
      await ctrl.rejectSession();
    }
    if (editor.hasModel()) {
      editor.setSelection(editor.getSelection().collapseToStart());
    }
  }
}
class KeepSessionAction2 extends KeepOrUndoSessionAction {
  constructor() {
    super(true, {
      id: "inlineChat2.keep",
      title: localize2("Keep", "Keep"),
      f1: true,
      icon: Codicon.check,
      precondition: ContextKeyExpr.and(
        CTX_INLINE_CHAT_VISIBLE,
        ctxHasRequestInProgress.negate(),
        ctxHasEditorModification
      ),
      keybinding: [{
        when: ContextKeyExpr.and(ChatContextKeys.inputHasFocus, ChatContextKeys.inputHasText.negate()),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyCode.Enter
      }, {
        weight: KeybindingWeight.WorkbenchContrib + 10,
        primary: KeyMod.CtrlCmd | KeyCode.Enter
      }],
      menu: [{
        id: MenuId.ChatEditorInlineExecute,
        group: "navigation",
        order: 4,
        when: ContextKeyExpr.and(
          ctxHasRequestInProgress.negate(),
          ctxHasEditorModification,
          ChatContextKeys.inputHasText.toNegated()
        )
      }]
    });
  }
}
class UndoAndCloseSessionAction2 extends KeepOrUndoSessionAction {
  constructor() {
    super(false, {
      id: "inlineChat2.close",
      title: localize2("close2", "Close"),
      f1: true,
      icon: Codicon.close,
      precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE),
      keybinding: [{
        when: ContextKeyExpr.or(
          ContextKeyExpr.and(EditorContextKeys.focus, ctxHasEditorModification.negate()),
          ChatContextKeys.inputHasFocus
        ),
        weight: KeybindingWeight.WorkbenchContrib + 1,
        primary: KeyCode.Escape
      }],
      menu: [{
        id: MenuId.ChatEditorInlineExecute,
        group: "navigation",
        order: 100
      }]
    });
  }
}
class CancelSessionAction extends KeepOrUndoSessionAction {
  constructor() {
    super(false, {
      id: "inlineChat2.cancel",
      title: localize2("cancel", "Cancel"),
      precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, ctxHasRequestInProgress),
      keybinding: [{
        when: ContextKeyExpr.or(
          EditorContextKeys.focus,
          ChatContextKeys.inputHasFocus
        ),
        weight: KeybindingWeight.WorkbenchContrib + 1,
        primary: KeyCode.Escape
      }],
      menu: []
    });
  }
}
class ContinueInlineChatInChatViewAction extends AbstractInlineChatAction {
  constructor() {
    super({
      id: "inlineChat2.continueInChat",
      title: localize2("continueInChat", "Ask in Chat"),
      icon: Codicon.chatSparkle,
      precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_TERMINATED),
      menu: [{
        id: MenuId.ChatEditorInlineExecute,
        group: "navigation",
        order: 2,
        when: CTX_INLINE_CHAT_TERMINATED
      }]
    });
  }
  async runInlineChatCommand(_accessor, ctrl, _editor) {
    await ctrl.continueSessionInChat();
  }
}
class RephraseInlineChatSessionAction extends AbstractInlineChatAction {
  constructor() {
    super({
      id: "inlineChat2.rephrase",
      title: localize2("rephrase", "Rephrase"),
      precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_TERMINATED),
      menu: [{
        id: MenuId.ChatEditorInlineExecute,
        group: "navigation",
        order: 1,
        when: CTX_INLINE_CHAT_TERMINATED
      }]
    });
  }
  async runInlineChatCommand(_accessor, ctrl, _editor) {
    await ctrl.rephraseSession();
  }
}
class AskInChatAction extends EditorAction2 {
  constructor() {
    super({
      id: ACTION_ASK_IN_CHAT,
      title: localize2("askInChat", "Ask in Chat"),
      category: AbstractInlineChatAction.category,
      f1: true,
      precondition: ContextKeyExpr.and(inlineChatContextKey, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_ASK_IN_CHAT_ENABLED),
      keybinding: {
        when: EditorContextKeys.focus,
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyI
      },
      icon: Codicon.chatSparkle,
      menu: [{
        id: MenuId.EditorContext,
        group: "1_chat",
        order: 3,
        when: ContextKeyExpr.and(inlineChatContextKey, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_ASK_IN_CHAT_ENABLED)
      }, {
        id: MenuId.InlineChatEditorAffordance,
        group: "0_chat",
        order: 1,
        when: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_ASK_IN_CHAT_ENABLED)
      }]
    });
  }
  async runEditorCommand(accessor, editor) {
    const chatEditingService = accessor.get(IChatEditingService);
    const chatWidgetService = accessor.get(IChatWidgetService);
    if (!editor.hasModel()) {
      return;
    }
    const session = chatEditingService.editingSessionsObs.get().find((s) => s.getEntry(editor.getModel().uri));
    if (!session) {
      return;
    }
    const widget = await chatWidgetService.openSession(session.chatSessionResource);
    if (!widget) {
      return;
    }
    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      await widget.attachmentModel.addFile(editor.getModel().uri, selection);
    }
  }
}
class DismissEditorAffordanceAction extends EditorAction2 {
  constructor() {
    super({
      id: "inlineChat.dismissEditorAffordance",
      title: localize2("dismissAffordance", "Dismiss Editor Affordance"),
      precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_AFFORDANCE_VISIBLE, ContextKeyExpr.equals("config.inlineChat.affordance", "editor")),
      keybinding: {
        when: EditorContextKeys.editorTextFocus,
        weight: KeybindingWeight.EditorContrib,
        primary: KeyCode.Escape
      }
    });
  }
  runEditorCommand(_accessor, editor) {
    InlineChatController.get(editor)?.inputOverlayWidget.dismiss();
  }
}
export {
  AbstractInlineChatAction,
  AskInChatAction,
  CancelSessionAction,
  ContinueInlineChatInChatViewAction,
  DismissEditorAffordanceAction,
  FixDiagnosticsAction,
  FocusInlineChat,
  KeepSessionAction2,
  RephraseInlineChatSessionAction,
  StartSessionAction,
  UndoAndCloseSessionAction2
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yLCBpc0RpZmZFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEVtYmVkZGVkRGlmZkVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2VtYmVkZGVkRGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9lbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElubGluZUNoYXRDb250cm9sbGVyLCBJbmxpbmVDaGF0UnVuT3B0aW9ucyB9IGZyb20gJy4vaW5saW5lQ2hhdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQUNUSU9OX0FTS19JTl9DSEFULCBDVFhfSU5MSU5FX0NIQVRfRk9DVVNFRCwgQ1RYX0lOTElORV9DSEFUX1ZJU0lCTEUsIENUWF9JTkxJTkVfQ0hBVF9PVVRFUl9DVVJTT1JfUE9TSVRJT04sIENUWF9JTkxJTkVfQ0hBVF9QT1NTSUJMRSwgQUNUSU9OX1NUQVJULCBDVFhfSU5MSU5FX0NIQVRfVjJfRU5BQkxFRCwgQ1RYX0lOTElORV9DSEFUX0ZJTEVfQkVMT05HU19UT19DSEFULCBDVFhfSU5MSU5FX0NIQVRfVEVSTUlOQVRFRCwgQ1RYX0ZJWF9ESUFHTk9TVElDU19FTkFCTEVELCBDVFhfSU5MSU5FX0NIQVRfQUZGT1JEQU5DRV9WSVNJQkxFLCBDVFhfQVNLX0lOX0NIQVRfRU5BQkxFRCwgQ1RYX0lOTElORV9DSEFUX0hBU19OT1RFQk9PS19JTkxJTkUgfSBmcm9tICcuLi9jb21tb24vaW5saW5lQ2hhdC5qcyc7XG5pbXBvcnQgeyBjdHhIYXNFZGl0b3JNb2RpZmljYXRpb24sIGN0eEhhc1JlcXVlc3RJblByb2dyZXNzIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nRWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJQWN0aW9uMk9wdGlvbnMsIE1lbnVJZCwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVEIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQWxpYXMoJ2ludGVyYWN0aXZlRWRpdG9yLnN0YXJ0JywgJ2lubGluZUNoYXQuc3RhcnQnKTtcblxuY29uc3QgU1RBUlRfSU5MSU5FX0NIQVQgPSByZWdpc3Rlckljb24oJ3N0YXJ0LWlubGluZS1jaGF0JywgQ29kaWNvbi5zcGFya2xlLCBsb2NhbGl6ZSgnc3RhcnRJbmxpbmVDaGF0JywgJ0ljb24gd2hpY2ggc3Bhd25zIHRoZSBpbmxpbmUgY2hhdCBmcm9tIHRoZSBlZGl0b3IgdG9vbGJhci4nKSk7XG5cbmNvbnN0IGlubGluZUNoYXROb3RlYm9va3NPbGRFbmFibGVkID0gQ29udGV4dEtleUV4cHIub3IoXG5cdENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLCBDVFhfSU5MSU5FX0NIQVRfSEFTX05PVEVCT09LX0lOTElORSlcbik7XG5cbmNvbnN0IGlubGluZUNoYXRDb250ZXh0S2V5ID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRDb250ZXh0S2V5RXhwci5vcihpbmxpbmVDaGF0Tm90ZWJvb2tzT2xkRW5hYmxlZCwgQ1RYX0lOTElORV9DSEFUX1YyX0VOQUJMRUQpLFxuXHRDVFhfSU5MSU5FX0NIQVRfUE9TU0lCTEUsXG5cdEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JTaW1wbGVJbnB1dC5uZWdhdGUoKVxuKTtcblxuZXhwb3J0IGNsYXNzIFN0YXJ0U2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBQ1RJT05fU1RBUlQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdydW4nLCAnT3BlbiBJbmxpbmUgQ2hhdCcpLFxuXHRcdFx0c2hvcnRUaXRsZTogbG9jYWxpemUyKCdydW5TaG9ydCcsICdJbmxpbmUgQ2hhdCcpLFxuXHRcdFx0Y2F0ZWdvcnk6IEFic3RyYWN0SW5saW5lQ2hhdEFjdGlvbi5jYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoaW5saW5lQ2hhdENvbnRleHRLZXksIENvbnRleHRLZXlFeHByLm9yKENUWF9JTkxJTkVfQ0hBVF9GSUxFX0JFTE9OR1NfVE9fQ0hBVC5uZWdhdGUoKSwgQ1RYX0FTS19JTl9DSEFUX0VOQUJMRUQubmVnYXRlKCkpKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdFx0XHRcdGlubGluZUNoYXRDb250ZXh0S2V5LFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKENUWF9JTkxJTkVfQ0hBVF9GSUxFX0JFTE9OR1NfVE9fQ0hBVC5uZWdhdGUoKSwgQ1RYX0FTS19JTl9DSEFUX0VOQUJMRUQubmVnYXRlKCkpXG5cdFx0XHRcdCksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SVxuXHRcdFx0fSxcblx0XHRcdGljb246IFNUQVJUX0lOTElORV9DSEFULFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzFfY2hhdCcsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoaW5saW5lQ2hhdENvbnRleHRLZXksIENvbnRleHRLZXlFeHByLm9yKENUWF9JTkxJTkVfQ0hBVF9GSUxFX0JFTE9OR1NfVE9fQ0hBVC5uZWdhdGUoKSwgQ1RYX0FTS19JTl9DSEFUX0VOQUJMRUQubmVnYXRlKCkpKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRUaXRsZUJhck1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnYV9vcGVuJyxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogYW55IHtcblxuXHRcdGNvbnN0IGNvZGVFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdGlmICghZWRpdG9yIHx8IGVkaXRvci5pc1NpbXBsZVdpZGdldCkge1xuXHRcdFx0Ly8gd2VsbCwgYXQgbGVhc3Qgd2UgdHJpZWQuLi5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblxuXHRcdC8vIHByZWNvbmRpdGlvbiBkb2VzIGhvbGRcblx0XHRyZXR1cm4gZWRpdG9yLmludm9rZVdpdGhpbkNvbnRleHQoKGVkaXRvckFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBlZGl0b3JBY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBlZGl0b3JBY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZW5hYmxlZCA9IGtiU2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHRoaXMuZGVzYy5wcmVjb25kaXRpb24gPz8gdW5kZWZpbmVkKTtcblx0XHRcdGlmICghZW5hYmxlZCkge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmRlYnVnKGBbRWRpdG9yQWN0aW9uMl0gTk9UIHJ1bm5pbmcgY29tbWFuZCBiZWNhdXNlIGl0cyBwcmVjb25kaXRpb24gaXMgRkFMU0VgLCB0aGlzLmRlc2MuaWQsIHRoaXMuZGVzYy5wcmVjb25kaXRpb24/LnNlcmlhbGl6ZSgpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX3J1bkVkaXRvckNvbW1hbmQoZWRpdG9yQWNjZXNzb3IsIGVkaXRvciwgLi4uYXJncyk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblxuXHRcdGNvbnN0IGN0cmwgPSBJbmxpbmVDaGF0Q29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWN0cmwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgb3B0aW9uczogSW5saW5lQ2hhdFJ1bk9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYXJnID0gYXJnc1swXTtcblx0XHRpZiAoYXJnICYmIElubGluZUNoYXRSdW5PcHRpb25zLmlzSW5saW5lQ2hhdFJ1bk9wdGlvbnMoYXJnKSkge1xuXHRcdFx0b3B0aW9ucyA9IGFyZztcblx0XHR9XG5cblx0XHRhd2FpdCBjdHJsPy5ydW4oeyAuLi5vcHRpb25zIH0pO1xuXHR9XG59XG5cbi8vIC0tLSBJbmxpbmVDaGF0RWRpdG9yQWZmb3JkYW5jZSBtZW51IC0tLVxuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLklubGluZUNoYXRFZGl0b3JBZmZvcmRhbmNlLCB7XG5cdGdyb3VwOiAnMF9jaGF0Jyxcblx0b3JkZXI6IDEsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSwgRWRpdG9yQ29udGV4dEtleXMuaGFzTm9uRW1wdHlTZWxlY3Rpb24sIENvbnRleHRLZXlFeHByLm9yKENUWF9JTkxJTkVfQ0hBVF9GSUxFX0JFTE9OR1NfVE9fQ0hBVC5uZWdhdGUoKSwgQ1RYX0FTS19JTl9DSEFUX0VOQUJMRUQubmVnYXRlKCkpLCBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCkpLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IEFDVElPTl9TVEFSVCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2VkaXRDb2RlJywgXCJBc2sgZm9yIEVkaXRzXCIpLFxuXHRcdHNob3J0VGl0bGU6IGxvY2FsaXplKCdlZGl0Q29kZVNob3J0JywgXCJBc2sgZm9yIEVkaXRzXCIpLFxuXHRcdGljb246IENvZGljb24uc3BhcmtsZSxcblx0fVxufSk7XG5cbmV4cG9ydCBjbGFzcyBGb2N1c0lubGluZUNoYXQgZXh0ZW5kcyBFZGl0b3JBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2lubGluZUNoYXQuZm9jdXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9jdXMnLCBcIkZvY3VzIElucHV0XCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQWJzdHJhY3RJbmxpbmVDaGF0QWN0aW9uLmNhdGVnb3J5LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLCBDVFhfSU5MSU5FX0NIQVRfVklTSUJMRSwgQ1RYX0lOTElORV9DSEFUX0ZPQ1VTRUQubmVnYXRlKCksIENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQubmVnYXRlKCkpLFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvcmUgKyAxMCwgLy8gd2luIGFnYWluc3QgY29yZV9jb21tYW5kXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDVFhfSU5MSU5FX0NIQVRfT1VURVJfQ1VSU09SX1BPU0lUSU9OLmlzRXF1YWxUbygnYWJvdmUnKSwgRWRpdG9yQ29udGV4dEtleXMuaXNFbWJlZGRlZERpZmZFZGl0b3IubmVnYXRlKCkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0fSwge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29yZSArIDEwLCAvLyB3aW4gYWdhaW5zdCBjb3JlX2NvbW1hbmRcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENUWF9JTkxJTkVfQ0hBVF9PVVRFUl9DVVJTT1JfUE9TSVRJT04uaXNFcXVhbFRvKCdiZWxvdycpLCBFZGl0b3JDb250ZXh0S2V5cy5pc0VtYmVkZGVkRGlmZkVkaXRvci5uZWdhdGUoKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bkVkaXRvckNvbW1hbmQoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCAuLi5fYXJnczogdW5rbm93bltdKSB7XG5cdFx0SW5saW5lQ2hhdENvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LmZvY3VzKCk7XG5cdH1cbn1cblxuLy8jcmVnaW9uIC0tLSBWRVJTSU9OIDJcbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdElubGluZUNoYXRBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgY2F0ZWdvcnkgPSBsb2NhbGl6ZTIoJ2NhdCcsIFwiSW5saW5lIENoYXRcIik7XG5cblx0Y29uc3RydWN0b3IoZGVzYzogSUFjdGlvbjJPcHRpb25zKSB7XG5cdFx0Y29uc3QgbWFzc2FnZU1lbnUgPSAobWVudTogSUFjdGlvbjJPcHRpb25zWydtZW51J10gfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KG1lbnUpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgbWVudSkge1xuXHRcdFx0XHRcdGVudHJ5LndoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoQ1RYX0lOTElORV9DSEFUX1YyX0VOQUJMRUQsIGVudHJ5LndoZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKG1lbnUpIHtcblx0XHRcdFx0bWVudS53aGVuID0gQ29udGV4dEtleUV4cHIuYW5kKENUWF9JTkxJTkVfQ0hBVF9WMl9FTkFCTEVELCBtZW51LndoZW4pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoZGVzYy5tZW51KSkge1xuXHRcdFx0bWFzc2FnZU1lbnUoZGVzYy5tZW51KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWFzc2FnZU1lbnUoZGVzYy5tZW51KTtcblx0XHR9XG5cblx0XHRzdXBlcih7XG5cdFx0XHQuLi5kZXNjLFxuXHRcdFx0Y2F0ZWdvcnk6IEFic3RyYWN0SW5saW5lQ2hhdEFjdGlvbi5jYXRlZ29yeSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENUWF9JTkxJTkVfQ0hBVF9WMl9FTkFCTEVELCBkZXNjLnByZWNvbmRpdGlvbilcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIC4uLl9hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblxuXHRcdGxldCBjdHJsID0gSW5saW5lQ2hhdENvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFjdHJsKSB7XG5cdFx0XHRjb25zdCB7IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sIH0gPSBlZGl0b3JTZXJ2aWNlO1xuXHRcdFx0aWYgKGlzQ29kZUVkaXRvcihhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCkpIHtcblx0XHRcdFx0ZWRpdG9yID0gYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0XHR9IGVsc2UgaWYgKGlzRGlmZkVkaXRvcihhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCkpIHtcblx0XHRcdFx0ZWRpdG9yID0gYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0TW9kaWZpZWRFZGl0b3IoKTtcblx0XHRcdH1cblx0XHRcdGN0cmwgPSBJbmxpbmVDaGF0Q29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHR9XG5cblx0XHRpZiAoIWN0cmwpIHtcblx0XHRcdGxvZ1NlcnZpY2Uud2FybignW0lFXSBOTyBjb250cm9sbGVyIGZvdW5kIGZvciBhY3Rpb24nLCB0aGlzLmRlc2MuaWQsIGVkaXRvci5nZXRNb2RlbCgpPy51cmkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQpIHtcblx0XHRcdGVkaXRvciA9IGVkaXRvci5nZXRQYXJlbnRFZGl0b3IoKTtcblx0XHR9XG5cdFx0aWYgKCFjdHJsKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGRpZmZFZGl0b3Igb2YgYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSkubGlzdERpZmZFZGl0b3JzKCkpIHtcblx0XHRcdFx0aWYgKGRpZmZFZGl0b3IuZ2V0T3JpZ2luYWxFZGl0b3IoKSA9PT0gZWRpdG9yIHx8IGRpZmZFZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKSA9PT0gZWRpdG9yKSB7XG5cdFx0XHRcdFx0aWYgKGRpZmZFZGl0b3IgaW5zdGFuY2VvZiBFbWJlZGRlZERpZmZFZGl0b3JXaWRnZXQpIHtcblx0XHRcdFx0XHRcdHRoaXMucnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvciwgZGlmZkVkaXRvci5nZXRQYXJlbnRFZGl0b3IoKSwgLi4uX2FyZ3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnJ1bklubGluZUNoYXRDb21tYW5kKGFjY2Vzc29yLCBjdHJsLCBlZGl0b3IsIC4uLl9hcmdzKTtcblx0fVxuXG5cdGFic3RyYWN0IHJ1bklubGluZUNoYXRDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjdHJsOiBJbmxpbmVDaGF0Q29udHJvbGxlciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIEZpeERpYWdub3N0aWNzQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RJbmxpbmVDaGF0QWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2lubGluZUNoYXQuZml4RGlhZ25vc3RpY3MnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZml4JywgJ0ZpeCcpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5lZGl0U3BhcmtsZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENUWF9GSVhfRElBR05PU1RJQ1NfRU5BQkxFRCwgRWRpdG9yQ29udGV4dEtleXMuc2VsZWN0aW9uSGFzRGlhZ25vc3RpY3MsIENUWF9JTkxJTkVfQ0hBVF9GSUxFX0JFTE9OR1NfVE9fQ0hBVC5uZWdhdGUoKSksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLklubGluZUNoYXRFZGl0b3JBZmZvcmRhbmNlLFxuXHRcdFx0XHRncm91cDogJzFfcXVpY2tmaXgnLFxuXHRcdFx0XHRvcmRlcjogMTAwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ1RYX0ZJWF9ESUFHTk9TVElDU19FTkFCTEVELCBFZGl0b3JDb250ZXh0S2V5cy5zZWxlY3Rpb25IYXNEaWFnbm9zdGljcywgQ1RYX0lOTElORV9DSEFUX0ZJTEVfQkVMT05HU19UT19DSEFULm5lZ2F0ZSgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdG9ySW5saW5lTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcyX2NoYXQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENUWF9GSVhfRElBR05PU1RJQ1NfRU5BQkxFRCwgRWRpdG9yQ29udGV4dEtleXMuc2VsZWN0aW9uSGFzRGlhZ25vc3RpY3MsIENUWF9JTkxJTkVfQ0hBVF9GSUxFX0JFTE9OR1NfVE9fQ0hBVC5uZWdhdGUoKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWFya2VySG92ZXJTdGF0dXNCYXIsXG5cdFx0XHRcdGdyb3VwOiAnMV9maXgnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENUWF9GSVhfRElBR05PU1RJQ1NfRU5BQkxFRCwgQ1RYX0lOTElORV9DSEFUX0ZJTEVfQkVMT05HU19UT19DSEFULm5lZ2F0ZSgpKSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBudWxsLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bklubGluZUNoYXRDb21tYW5kKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY3RybDogSW5saW5lQ2hhdENvbnRyb2xsZXIsIF9lZGl0b3I6IElDb2RlRWRpdG9yLCAuLi5fYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y3RybC5ydW4oeyBhdXRvU2VuZDogdHJ1ZSwgYXR0YWNoRGlhZ25vc3RpY3M6IHRydWUgfSk7XG5cdH1cbn1cblxuY2xhc3MgS2VlcE9yVW5kb1Nlc3Npb25BY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdElubGluZUNoYXRBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX2tlZXA6IGJvb2xlYW4sIGRlc2M6IElBY3Rpb24yT3B0aW9ucykge1xuXHRcdHN1cGVyKGRlc2MpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuSW5saW5lQ2hhdENvbW1hbmQoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjdHJsOiBJbmxpbmVDaGF0Q29udHJvbGxlciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgLi4uX2FyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9rZWVwKSB7XG5cdFx0XHRhd2FpdCBjdHJsLmFjY2VwdFNlc3Npb24oKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgY3RybC5yZWplY3RTZXNzaW9uKCk7XG5cdFx0fVxuXHRcdGlmIChlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuY29sbGFwc2VUb1N0YXJ0KCkpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgS2VlcFNlc3Npb25BY3Rpb24yIGV4dGVuZHMgS2VlcE9yVW5kb1Nlc3Npb25BY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih0cnVlLCB7XG5cdFx0XHRpZDogJ2lubGluZUNoYXQyLmtlZXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignS2VlcCcsIFwiS2VlcFwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGVjayxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDVFhfSU5MSU5FX0NIQVRfVklTSUJMRSxcblx0XHRcdFx0Y3R4SGFzUmVxdWVzdEluUHJvZ3Jlc3MubmVnYXRlKCksXG5cdFx0XHRcdGN0eEhhc0VkaXRvck1vZGlmaWNhdGlvbixcblx0XHRcdCksXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmlucHV0SGFzRm9jdXMsIENoYXRDb250ZXh0S2V5cy5pbnB1dEhhc1RleHQubmVnYXRlKCkpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlclxuXHRcdFx0fSwge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXJcblx0XHRcdH1dLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdG9ySW5saW5lRXhlY3V0ZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRjdHhIYXNSZXF1ZXN0SW5Qcm9ncmVzcy5uZWdhdGUoKSxcblx0XHRcdFx0XHRjdHhIYXNFZGl0b3JNb2RpZmljYXRpb24sXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlucHV0SGFzVGV4dC50b05lZ2F0ZWQoKVxuXHRcdFx0XHQpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVW5kb0FuZENsb3NlU2Vzc2lvbkFjdGlvbjIgZXh0ZW5kcyBLZWVwT3JVbmRvU2Vzc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoZmFsc2UsIHtcblx0XHRcdGlkOiAnaW5saW5lQ2hhdDIuY2xvc2UnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2xvc2UyJywgXCJDbG9zZVwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jbG9zZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENUWF9JTkxJTkVfQ0hBVF9WSVNJQkxFKSxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy5mb2N1cywgY3R4SGFzRWRpdG9yTW9kaWZpY2F0aW9uLm5lZ2F0ZSgpKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5wdXRIYXNGb2N1cyxcblx0XHRcdFx0KSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdH1dLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdG9ySW5saW5lRXhlY3V0ZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEwMCxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENhbmNlbFNlc3Npb25BY3Rpb24gZXh0ZW5kcyBLZWVwT3JVbmRvU2Vzc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoZmFsc2UsIHtcblx0XHRcdGlkOiAnaW5saW5lQ2hhdDIuY2FuY2VsJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ1RYX0lOTElORV9DSEFUX1ZJU0lCTEUsIGN0eEhhc1JlcXVlc3RJblByb2dyZXNzKSxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbnB1dEhhc0ZvY3VzLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0fV0sXG5cdFx0XHRtZW51OiBbXVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb250aW51ZUlubGluZUNoYXRJbkNoYXRWaWV3QWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RJbmxpbmVDaGF0QWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2lubGluZUNoYXQyLmNvbnRpbnVlSW5DaGF0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NvbnRpbnVlSW5DaGF0JywgXCJBc2sgaW4gQ2hhdFwiKSxcblx0XHRcdGljb246IENvZGljb24uY2hhdFNwYXJrbGUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDVFhfSU5MSU5FX0NIQVRfVklTSUJMRSwgQ1RYX0lOTElORV9DSEFUX1RFUk1JTkFURUQpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdG9ySW5saW5lRXhlY3V0ZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENUWF9JTkxJTkVfQ0hBVF9URVJNSU5BVEVEXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuSW5saW5lQ2hhdENvbW1hbmQoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjdHJsOiBJbmxpbmVDaGF0Q29udHJvbGxlciwgX2VkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBjdHJsLmNvbnRpbnVlU2Vzc2lvbkluQ2hhdCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBocmFzZUlubGluZUNoYXRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RJbmxpbmVDaGF0QWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2lubGluZUNoYXQyLnJlcGhyYXNlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3JlcGhyYXNlJywgXCJSZXBocmFzZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENUWF9JTkxJTkVfQ0hBVF9WSVNJQkxFLCBDVFhfSU5MSU5FX0NIQVRfVEVSTUlOQVRFRCksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVFeGVjdXRlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ1RYX0lOTElORV9DSEFUX1RFUk1JTkFURURcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW5JbmxpbmVDaGF0Q29tbWFuZChfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGN0cmw6IElubGluZUNoYXRDb250cm9sbGVyLCBfZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGN0cmwucmVwaHJhc2VTZXNzaW9uKCk7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgQXNrSW5DaGF0QWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFDVElPTl9BU0tfSU5fQ0hBVCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Fza0luQ2hhdCcsICdBc2sgaW4gQ2hhdCcpLFxuXHRcdFx0Y2F0ZWdvcnk6IEFic3RyYWN0SW5saW5lQ2hhdEFjdGlvbi5jYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoaW5saW5lQ2hhdENvbnRleHRLZXksIENUWF9JTkxJTkVfQ0hBVF9GSUxFX0JFTE9OR1NfVE9fQ0hBVCwgQ1RYX0FTS19JTl9DSEFUX0VOQUJMRUQpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJXG5cdFx0XHR9LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGF0U3BhcmtsZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2NoYXQnLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGlubGluZUNoYXRDb250ZXh0S2V5LCBDVFhfSU5MSU5FX0NIQVRfRklMRV9CRUxPTkdTX1RPX0NIQVQsIENUWF9BU0tfSU5fQ0hBVF9FTkFCTEVEKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLklubGluZUNoYXRFZGl0b3JBZmZvcmRhbmNlLFxuXHRcdFx0XHRncm91cDogJzBfY2hhdCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMuaGFzTm9uRW1wdHlTZWxlY3Rpb24sIENUWF9JTkxJTkVfQ0hBVF9GSUxFX0JFTE9OR1NfVE9fQ0hBVCwgQ1RYX0FTS19JTl9DSEFUX0VOQUJMRUQpXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdGNvbnN0IGNoYXRFZGl0aW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdEVkaXRpbmdTZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNoYXRFZGl0aW5nU2VydmljZS5lZGl0aW5nU2Vzc2lvbnNPYnMuZ2V0KCkuZmluZChzID0+IHMuZ2V0RW50cnkoZWRpdG9yLmdldE1vZGVsKCkudXJpKSk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHdpZGdldCA9IGF3YWl0IGNoYXRXaWRnZXRTZXJ2aWNlLm9wZW5TZXNzaW9uKHNlc3Npb24uY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGlmIChzZWxlY3Rpb24gJiYgIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdGF3YWl0IHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkRmlsZShlZGl0b3IuZ2V0TW9kZWwoKS51cmksIHNlbGVjdGlvbik7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEaXNtaXNzRWRpdG9yQWZmb3JkYW5jZUFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnaW5saW5lQ2hhdC5kaXNtaXNzRWRpdG9yQWZmb3JkYW5jZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkaXNtaXNzQWZmb3JkYW5jZScsIFwiRGlzbWlzcyBFZGl0b3IgQWZmb3JkYW5jZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENUWF9JTkxJTkVfQ0hBVF9BRkZPUkRBTkNFX1ZJU0lCTEUsIENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmlubGluZUNoYXQuYWZmb3JkYW5jZScsICdlZGl0b3InKSksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuRWRpdG9yQ29tbWFuZChfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRJbmxpbmVDaGF0Q29udHJvbGxlci5nZXQoZWRpdG9yKT8uaW5wdXRPdmVybGF5V2lkZ2V0LmRpc21pc3MoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQXNCLGNBQWMsb0JBQW9CO0FBQ3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNB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
