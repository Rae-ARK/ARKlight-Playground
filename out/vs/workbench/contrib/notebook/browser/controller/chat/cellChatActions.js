import { Codicon } from "../../../../../../base/common/codicons.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { MenuId, MenuRegistry, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContextKey } from "../../../../../../platform/contextkey/common/contextkeys.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { CTX_INLINE_CHAT_REQUEST_IN_PROGRESS, CTX_INLINE_CHAT_VISIBLE } from "../../../../inlineChat/common/inlineChat.js";
import { CTX_NOTEBOOK_CHAT_HAS_AGENT } from "./notebookChatContext.js";
import { NotebookAction, getContextFromActiveEditor, getEditorFromArgsOrActivePane } from "../coreActions.js";
import { insertNewCell } from "../insertCellActions.js";
import { CellKind, NotebookSetting } from "../../../common/notebookCommon.js";
import { NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED } from "../../../common/notebookContextKeys.js";
import { Iterable } from "../../../../../../base/common/iterator.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { ChatContextKeys } from "../../../../chat/common/actions/chatContextKeys.js";
import { InlineChatController } from "../../../../inlineChat/browser/inlineChatController.js";
import { EditorAction2 } from "../../../../../../editor/browser/editorExtensions.js";
async function startChat(accessor, context, index, input, autoSend, source) {
  const configurationService = accessor.get(IConfigurationService);
  const commandService = accessor.get(ICommandService);
  if (configurationService.getValue(NotebookSetting.cellGenerate) || configurationService.getValue(NotebookSetting.cellChat)) {
    const activeCell = context.notebookEditor.getActiveCell();
    const targetCell = activeCell?.getTextLength() === 0 && source !== "insertToolbar" ? activeCell : await insertNewCell(accessor, context, CellKind.Code, "below", true);
    if (targetCell) {
      targetCell.enableAutoLanguageDetection();
      await context.notebookEditor.revealFirstLineIfOutsideViewport(targetCell);
      const codeEditor = context.notebookEditor.codeEditors.find((ce) => ce[0] === targetCell)?.[1];
      if (codeEditor) {
        codeEditor.focus();
        commandService.executeCommand("inlineChat.start");
      }
    }
  }
}
registerAction2(class extends NotebookAction {
  constructor() {
    super(
      {
        id: "notebook.cell.chat.start",
        title: {
          value: "$(sparkle) " + localize("notebookActions.menu.insertCodeCellWithChat", "Generate"),
          original: "$(sparkle) Generate"
        },
        tooltip: localize("notebookActions.menu.insertCodeCellWithChat.tooltip", "Start Chat to Generate Code"),
        metadata: {
          description: localize("notebookActions.menu.insertCodeCellWithChat.tooltip", "Start Chat to Generate Code"),
          args: [
            {
              name: "args",
              schema: {
                type: "object",
                required: ["index"],
                properties: {
                  "index": {
                    type: "number"
                  },
                  "input": {
                    type: "string"
                  },
                  "autoSend": {
                    type: "boolean"
                  }
                }
              }
            }
          ]
        },
        f1: false,
        keybinding: {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
            ContextKeyExpr.not(InputFocusedContextKey),
            CTX_NOTEBOOK_CHAT_HAS_AGENT,
            ContextKeyExpr.or(
              ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true),
              ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)
            )
          ),
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.CtrlCmd | KeyCode.KeyI,
          secondary: [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyI)]
        },
        menu: [
          {
            id: MenuId.NotebookCellBetween,
            group: "inline",
            order: -1,
            when: ContextKeyExpr.and(
              NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
              CTX_NOTEBOOK_CHAT_HAS_AGENT,
              ContextKeyExpr.or(
                ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true),
                ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)
              )
            )
          }
        ]
      }
    );
  }
  getEditorContextFromArgsOrActive(accessor, ...args) {
    const [firstArg] = args;
    if (!firstArg) {
      const notebookEditor2 = getEditorFromArgsOrActivePane(accessor);
      if (!notebookEditor2) {
        return void 0;
      }
      const activeCell = notebookEditor2.getActiveCell();
      if (!activeCell) {
        return void 0;
      }
      return {
        cell: activeCell,
        notebookEditor: notebookEditor2,
        input: void 0,
        autoSend: void 0
      };
    }
    if (typeof firstArg !== "object" || typeof firstArg.index !== "number") {
      return void 0;
    }
    const notebookEditor = getEditorFromArgsOrActivePane(accessor);
    if (!notebookEditor) {
      return void 0;
    }
    const cell = firstArg.index <= 0 ? void 0 : notebookEditor.cellAt(firstArg.index - 1);
    return {
      cell,
      notebookEditor,
      input: firstArg.input,
      autoSend: firstArg.autoSend
    };
  }
  async runWithContext(accessor, context) {
    const index = Math.max(0, context.cell ? context.notebookEditor.getCellIndex(context.cell) + 1 : 0);
    await startChat(accessor, context, index, context.input, context.autoSend, context.source);
  }
});
registerAction2(class extends NotebookAction {
  constructor() {
    super(
      {
        id: "notebook.cell.chat.startAtTop",
        title: {
          value: "$(sparkle) " + localize("notebookActions.menu.insertCodeCellWithChat", "Generate"),
          original: "$(sparkle) Generate"
        },
        tooltip: localize("notebookActions.menu.insertCodeCellWithChat.tooltip", "Start Chat to Generate Code"),
        f1: false,
        menu: [
          {
            id: MenuId.NotebookCellListTop,
            group: "inline",
            order: -1,
            when: ContextKeyExpr.and(
              NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
              CTX_NOTEBOOK_CHAT_HAS_AGENT,
              ContextKeyExpr.or(
                ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true),
                ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)
              )
            )
          }
        ]
      }
    );
  }
  async runWithContext(accessor, context) {
    await startChat(accessor, context, 0, "", false);
  }
});
MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
  command: {
    id: "notebook.cell.chat.start",
    icon: Codicon.sparkle,
    title: localize("notebookActions.menu.insertCode.ontoolbar", "Generate"),
    tooltip: localize("notebookActions.menu.insertCode.tooltip", "Start Chat to Generate Code")
  },
  order: -10,
  group: "navigation/add",
  when: ContextKeyExpr.and(
    NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
    ContextKeyExpr.notEquals("config.notebook.insertToolbarLocation", "betweenCells"),
    ContextKeyExpr.notEquals("config.notebook.insertToolbarLocation", "hidden"),
    CTX_NOTEBOOK_CHAT_HAS_AGENT,
    ContextKeyExpr.or(
      ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true),
      ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)
    )
  )
});
class AcceptChangesAndRun extends EditorAction2 {
  constructor() {
    super({
      id: "notebook.inlineChat.acceptChangesAndRun",
      title: localize2("notebook.apply1", "Accept and Run"),
      shortTitle: localize("notebook.apply2", "Accept & Run"),
      tooltip: localize("notebook.apply3", "Accept the changes and run the cell"),
      icon: Codicon.check,
      f1: true,
      precondition: ContextKeyExpr.and(
        NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
        CTX_INLINE_CHAT_VISIBLE
      ),
      keybinding: void 0,
      menu: [{
        id: MenuId.ChatEditorInlineExecute,
        group: "0_main",
        order: 2,
        when: ContextKeyExpr.and(
          NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
          ChatContextKeys.inputHasText.toNegated(),
          CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.toNegated()
        )
      }]
    });
  }
  runEditorCommand(accessor, codeEditor) {
    const editor = getContextFromActiveEditor(accessor.get(IEditorService));
    const ctrl = InlineChatController.get(codeEditor);
    if (!editor || !ctrl) {
      return;
    }
    const matchedCell = editor.notebookEditor.codeEditors.find((e) => e[1] === codeEditor);
    const cell = matchedCell?.[0];
    if (!cell) {
      return;
    }
    ctrl.acceptSession();
    return editor.notebookEditor.executeNotebookCells(Iterable.single(cell));
  }
}
registerAction2(AcceptChangesAndRun);
export {
  AcceptChangesAndRun
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJvbGxlci9jaGF0L2NlbGxDaGF0QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSW5wdXRGb2N1c2VkQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENUWF9JTkxJTkVfQ0hBVF9SRVFVRVNUX0lOX1BST0dSRVNTLCBDVFhfSU5MSU5FX0NIQVRfVklTSUJMRSB9IGZyb20gJy4uLy4uLy4uLy4uL2lubGluZUNoYXQvY29tbW9uL2lubGluZUNoYXQuanMnO1xuaW1wb3J0IHsgQ1RYX05PVEVCT09LX0NIQVRfSEFTX0FHRU5UIH0gZnJvbSAnLi9ub3RlYm9va0NoYXRDb250ZXh0LmpzJztcbmltcG9ydCB7IElOb3RlYm9va0FjdGlvbkNvbnRleHQsIE5vdGVib29rQWN0aW9uLCBnZXRDb250ZXh0RnJvbUFjdGl2ZUVkaXRvciwgZ2V0RWRpdG9yRnJvbUFyZ3NPckFjdGl2ZVBhbmUgfSBmcm9tICcuLi9jb3JlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBpbnNlcnROZXdDZWxsIH0gZnJvbSAnLi4vaW5zZXJ0Q2VsbEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIE5vdGVib29rU2V0dGluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUsIE5PVEVCT09LX0VESVRPUl9GT0NVU0VEIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSW5saW5lQ2hhdENvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuXG5pbnRlcmZhY2UgSUluc2VydENlbGxXaXRoQ2hhdEFyZ3MgZXh0ZW5kcyBJTm90ZWJvb2tBY3Rpb25Db250ZXh0IHtcblx0aW5wdXQ/OiBzdHJpbmc7XG5cdGF1dG9TZW5kPzogYm9vbGVhbjtcblx0c291cmNlPzogc3RyaW5nO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzdGFydENoYXQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQsIGluZGV4OiBudW1iZXIsIGlucHV0Pzogc3RyaW5nLCBhdXRvU2VuZD86IGJvb2xlYW4sIHNvdXJjZT86IHN0cmluZykge1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdGlmIChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcuY2VsbEdlbmVyYXRlKSB8fCBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcuY2VsbENoYXQpKSB7XG5cdFx0Y29uc3QgYWN0aXZlQ2VsbCA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3IuZ2V0QWN0aXZlQ2VsbCgpO1xuXHRcdGNvbnN0IHRhcmdldENlbGwgPSBhY3RpdmVDZWxsPy5nZXRUZXh0TGVuZ3RoKCkgPT09IDAgJiYgc291cmNlICE9PSAnaW5zZXJ0VG9vbGJhcicgPyBhY3RpdmVDZWxsIDogKGF3YWl0IGluc2VydE5ld0NlbGwoYWNjZXNzb3IsIGNvbnRleHQsIENlbGxLaW5kLkNvZGUsICdiZWxvdycsIHRydWUpKTtcblxuXHRcdGlmICh0YXJnZXRDZWxsKSB7XG5cdFx0XHR0YXJnZXRDZWxsLmVuYWJsZUF1dG9MYW5ndWFnZURldGVjdGlvbigpO1xuXHRcdFx0YXdhaXQgY29udGV4dC5ub3RlYm9va0VkaXRvci5yZXZlYWxGaXJzdExpbmVJZk91dHNpZGVWaWV3cG9ydCh0YXJnZXRDZWxsKTtcblx0XHRcdGNvbnN0IGNvZGVFZGl0b3IgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmNvZGVFZGl0b3JzLmZpbmQoY2UgPT4gY2VbMF0gPT09IHRhcmdldENlbGwpPy5bMV07XG5cdFx0XHRpZiAoY29kZUVkaXRvcikge1xuXHRcdFx0XHRjb2RlRWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdpbmxpbmVDaGF0LnN0YXJ0Jyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnbm90ZWJvb2suY2VsbC5jaGF0LnN0YXJ0Jyxcblx0XHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0XHR2YWx1ZTogJyQoc3BhcmtsZSkgJyArIGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMubWVudS5pbnNlcnRDb2RlQ2VsbFdpdGhDaGF0JywgXCJHZW5lcmF0ZVwiKSxcblx0XHRcdFx0XHRvcmlnaW5hbDogJyQoc3BhcmtsZSkgR2VuZXJhdGUnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLm1lbnUuaW5zZXJ0Q29kZUNlbGxXaXRoQ2hhdC50b29sdGlwJywgXCJTdGFydCBDaGF0IHRvIEdlbmVyYXRlIENvZGVcIiksXG5cdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMubWVudS5pbnNlcnRDb2RlQ2VsbFdpdGhDaGF0LnRvb2x0aXAnLCBcIlN0YXJ0IENoYXQgdG8gR2VuZXJhdGUgQ29kZVwiKSxcblx0XHRcdFx0XHRhcmdzOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdhcmdzJyxcblx0XHRcdFx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnaW5kZXgnXSxcblx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHQnaW5kZXgnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdudW1iZXInXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0J2lucHV0Jzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdCdhdXRvU2VuZCc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9FRElUQUJMRS5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5ub3QoSW5wdXRGb2N1c2VkQ29udGV4dEtleSksXG5cdFx0XHRcdFx0XHRDVFhfTk9URUJPT0tfQ0hBVF9IQVNfQUdFTlQsXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtOb3RlYm9va1NldHRpbmcuY2VsbENoYXR9YCwgdHJ1ZSksXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Tm90ZWJvb2tTZXR0aW5nLmNlbGxHZW5lcmF0ZX1gLCB0cnVlKVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUksXG5cdFx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5SSldLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxCZXR3ZWVuLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICdpbmxpbmUnLFxuXHRcdFx0XHRcdFx0b3JkZXI6IC0xLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRURJVEFCTEUuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHRcdFx0XHRDVFhfTk9URUJPT0tfQ0hBVF9IQVNfQUdFTlQsXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Tm90ZWJvb2tTZXR0aW5nLmNlbGxDaGF0fWAsIHRydWUpLFxuXHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Tm90ZWJvb2tTZXR0aW5nLmNlbGxHZW5lcmF0ZX1gLCB0cnVlKVxuXHRcdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEVkaXRvckNvbnRleHRGcm9tQXJnc09yQWN0aXZlKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiBhbnlbXSk6IElJbnNlcnRDZWxsV2l0aENoYXRBcmdzIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBbZmlyc3RBcmddID0gYXJncztcblx0XHRpZiAoIWZpcnN0QXJnKSB7XG5cdFx0XHRjb25zdCBub3RlYm9va0VkaXRvciA9IGdldEVkaXRvckZyb21BcmdzT3JBY3RpdmVQYW5lKGFjY2Vzc29yKTtcblx0XHRcdGlmICghbm90ZWJvb2tFZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWN0aXZlQ2VsbCA9IG5vdGVib29rRWRpdG9yLmdldEFjdGl2ZUNlbGwoKTtcblx0XHRcdGlmICghYWN0aXZlQ2VsbCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjZWxsOiBhY3RpdmVDZWxsLFxuXHRcdFx0XHRub3RlYm9va0VkaXRvcixcblx0XHRcdFx0aW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0YXV0b1NlbmQ6IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIGZpcnN0QXJnICE9PSAnb2JqZWN0JyB8fCB0eXBlb2YgZmlyc3RBcmcuaW5kZXggIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0gZ2V0RWRpdG9yRnJvbUFyZ3NPckFjdGl2ZVBhbmUoYWNjZXNzb3IpO1xuXHRcdGlmICghbm90ZWJvb2tFZGl0b3IpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbCA9IGZpcnN0QXJnLmluZGV4IDw9IDAgPyB1bmRlZmluZWQgOiBub3RlYm9va0VkaXRvci5jZWxsQXQoZmlyc3RBcmcuaW5kZXggLSAxKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjZWxsLFxuXHRcdFx0bm90ZWJvb2tFZGl0b3IsXG5cdFx0XHRpbnB1dDogZmlyc3RBcmcuaW5wdXQsXG5cdFx0XHRhdXRvU2VuZDogZmlyc3RBcmcuYXV0b1NlbmRcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElJbnNlcnRDZWxsV2l0aENoYXRBcmdzKSB7XG5cdFx0Y29uc3QgaW5kZXggPSBNYXRoLm1heCgwLCBjb250ZXh0LmNlbGwgPyBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmdldENlbGxJbmRleChjb250ZXh0LmNlbGwpICsgMSA6IDApO1xuXHRcdGF3YWl0IHN0YXJ0Q2hhdChhY2Nlc3NvciwgY29udGV4dCwgaW5kZXgsIGNvbnRleHQuaW5wdXQsIGNvbnRleHQuYXV0b1NlbmQsIGNvbnRleHQuc291cmNlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnbm90ZWJvb2suY2VsbC5jaGF0LnN0YXJ0QXRUb3AnLFxuXHRcdFx0XHR0aXRsZToge1xuXHRcdFx0XHRcdHZhbHVlOiAnJChzcGFya2xlKSAnICsgbG9jYWxpemUoJ25vdGVib29rQWN0aW9ucy5tZW51Lmluc2VydENvZGVDZWxsV2l0aENoYXQnLCBcIkdlbmVyYXRlXCIpLFxuXHRcdFx0XHRcdG9yaWdpbmFsOiAnJChzcGFya2xlKSBHZW5lcmF0ZScsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMubWVudS5pbnNlcnRDb2RlQ2VsbFdpdGhDaGF0LnRvb2x0aXAnLCBcIlN0YXJ0IENoYXQgdG8gR2VuZXJhdGUgQ29kZVwiKSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxMaXN0VG9wLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICdpbmxpbmUnLFxuXHRcdFx0XHRcdFx0b3JkZXI6IC0xLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRURJVEFCTEUuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHRcdFx0XHRDVFhfTk9URUJPT0tfQ0hBVF9IQVNfQUdFTlQsXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Tm90ZWJvb2tTZXR0aW5nLmNlbGxDaGF0fWAsIHRydWUpLFxuXHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Tm90ZWJvb2tTZXR0aW5nLmNlbGxHZW5lcmF0ZX1gLCB0cnVlKVxuXHRcdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQWN0aW9uQ29udGV4dCkge1xuXHRcdGF3YWl0IHN0YXJ0Q2hhdChhY2Nlc3NvciwgY29udGV4dCwgMCwgJycsIGZhbHNlKTtcblx0fVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTm90ZWJvb2tUb29sYmFyLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ25vdGVib29rLmNlbGwuY2hhdC5zdGFydCcsXG5cdFx0aWNvbjogQ29kaWNvbi5zcGFya2xlLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLm1lbnUuaW5zZXJ0Q29kZS5vbnRvb2xiYXInLCBcIkdlbmVyYXRlXCIpLFxuXHRcdHRvb2x0aXA6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMubWVudS5pbnNlcnRDb2RlLnRvb2x0aXAnLCBcIlN0YXJ0IENoYXQgdG8gR2VuZXJhdGUgQ29kZVwiKVxuXHR9LFxuXHRvcmRlcjogLTEwLFxuXHRncm91cDogJ25hdmlnYXRpb24vYWRkJyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdE5PVEVCT09LX0VESVRPUl9FRElUQUJMRS5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKCdjb25maWcubm90ZWJvb2suaW5zZXJ0VG9vbGJhckxvY2F0aW9uJywgJ2JldHdlZW5DZWxscycpLFxuXHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnY29uZmlnLm5vdGVib29rLmluc2VydFRvb2xiYXJMb2NhdGlvbicsICdoaWRkZW4nKSxcblx0XHRDVFhfTk9URUJPT0tfQ0hBVF9IQVNfQUdFTlQsXG5cdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke05vdGVib29rU2V0dGluZy5jZWxsQ2hhdH1gLCB0cnVlKSxcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Tm90ZWJvb2tTZXR0aW5nLmNlbGxHZW5lcmF0ZX1gLCB0cnVlKVxuXHRcdClcblx0KVxufSk7XG5cbmV4cG9ydCBjbGFzcyBBY2NlcHRDaGFuZ2VzQW5kUnVuIGV4dGVuZHMgRWRpdG9yQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay5pbmxpbmVDaGF0LmFjY2VwdENoYW5nZXNBbmRSdW4nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2suYXBwbHkxJywgXCJBY2NlcHQgYW5kIFJ1blwiKSxcblx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplKCdub3RlYm9vay5hcHBseTInLCAnQWNjZXB0ICYgUnVuJyksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbm90ZWJvb2suYXBwbHkzJywgJ0FjY2VwdCB0aGUgY2hhbmdlcyBhbmQgcnVuIHRoZSBjZWxsJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNoZWNrLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0VESVRBQkxFLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFx0Q1RYX0lOTElORV9DSEFUX1ZJU0lCTEUsXG5cdFx0XHQpLFxuXHRcdFx0a2V5YmluZGluZzogdW5kZWZpbmVkLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdG9ySW5saW5lRXhlY3V0ZSxcblx0XHRcdFx0Z3JvdXA6ICcwX21haW4nLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9FRElUQUJMRS5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlucHV0SGFzVGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRDVFhfSU5MSU5FX0NIQVRfUkVRVUVTVF9JTl9QUk9HUkVTUy50b05lZ2F0ZWQoKVxuXHRcdFx0XHQpXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29kZUVkaXRvcjogSUNvZGVFZGl0b3IpIHtcblx0XHRjb25zdCBlZGl0b3IgPSBnZXRDb250ZXh0RnJvbUFjdGl2ZUVkaXRvcihhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpKTtcblx0XHRjb25zdCBjdHJsID0gSW5saW5lQ2hhdENvbnRyb2xsZXIuZ2V0KGNvZGVFZGl0b3IpO1xuXG5cdFx0aWYgKCFlZGl0b3IgfHwgIWN0cmwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtYXRjaGVkQ2VsbCA9IGVkaXRvci5ub3RlYm9va0VkaXRvci5jb2RlRWRpdG9ycy5maW5kKGUgPT4gZVsxXSA9PT0gY29kZUVkaXRvcik7XG5cdFx0Y29uc3QgY2VsbCA9IG1hdGNoZWRDZWxsPy5bMF07XG5cblx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjdHJsLmFjY2VwdFNlc3Npb24oKTtcblx0XHRyZXR1cm4gZWRpdG9yLm5vdGVib29rRWRpdG9yLmV4ZWN1dGVOb3RlYm9va0NlbGxzKEl0ZXJhYmxlLnNpbmdsZShjZWxsKSk7XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihBY2NlcHRDaGFuZ2VzQW5kUnVuKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsU0FBUyxjQUFjO0FBQzFDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxRQUFRLGNBQWMsdUJBQXVCO0FBQ3RELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsOEJBQThCO0FBRXZDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUNBQXFDLCtCQUErQjtBQUM3RSxTQUFTLG1DQUFtQztBQUM1QyxTQUFpQyxnQkFBZ0IsNEJBQTRCLHFDQUFxQztBQUNsSCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFVBQVUsdUJBQXVCO0FBQzFDLFNBQVMsMEJBQTBCLCtCQUErQjtBQUNsRSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHFCQUFxQjtBQVE5QixlQUFlLFVBQVUsVUFBNEIsU0FBaUMsT0FBZSxPQUFnQixVQUFvQixRQUFpQjtBQUN6SixRQUFNLHVCQUF1QixTQUFTLElBQUkscUJBQXFCO0FBQy9ELFFBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBRW5ELE1BQUkscUJBQXFCLFNBQWtCLGdCQUFnQixZQUFZLEtBQUsscUJBQXFCLFNBQWtCLGdCQUFnQixRQUFRLEdBQUc7QUFDN0ksVUFBTSxhQUFhLFFBQVEsZUFBZSxjQUFjO0FBQ3hELFVBQU0sYUFBYSxZQUFZLGNBQWMsTUFBTSxLQUFL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
