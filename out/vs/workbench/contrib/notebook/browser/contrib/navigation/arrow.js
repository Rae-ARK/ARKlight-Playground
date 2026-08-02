import { timeout } from "../../../../../../base/common/async.js";
import { KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { EditorExtensionsRegistry } from "../../../../../../editor/browser/editorExtensions.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../../../platform/accessibility/common/accessibility.js";
import { Action2, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { Extensions as ConfigurationExtensions } from "../../../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr } from "../../../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContextKey, IsWindowsContext } from "../../../../../../platform/contextkey/common/contextkeys.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { InlineChatController } from "../../../../inlineChat/browser/inlineChatController.js";
import { NotebookAction, NotebookCellAction, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, findTargetCellEditor } from "../../controller/coreActions.js";
import { CellEditState } from "../../notebookBrowser.js";
import { CellKind, NOTEBOOK_EDITOR_CURSOR_BOUNDARY, NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY } from "../../../common/notebookCommon.js";
import { NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_TYPE, NOTEBOOK_CURSOR_NAVIGATION_MODE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_INPUT_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED, NOTEBOOK_CELL_EDITOR_FOCUSED, IS_COMPOSITE_NOTEBOOK, NOTEBOOK_OR_COMPOSITE_IS_ACTIVE_EDITOR } from "../../../common/notebookContextKeys.js";
const NOTEBOOK_FOCUS_TOP = "notebook.focusTop";
const NOTEBOOK_FOCUS_BOTTOM = "notebook.focusBottom";
const NOTEBOOK_FOCUS_PREVIOUS_EDITOR = "notebook.focusPreviousEditor";
const NOTEBOOK_FOCUS_NEXT_EDITOR = "notebook.focusNextEditor";
const FOCUS_IN_OUTPUT_COMMAND_ID = "notebook.cell.focusInOutput";
const FOCUS_OUT_OUTPUT_COMMAND_ID = "notebook.cell.focusOutOutput";
const CENTER_ACTIVE_CELL = "notebook.centerActiveCell";
const NOTEBOOK_CURSOR_PAGEUP_COMMAND_ID = "notebook.cell.cursorPageUp";
const NOTEBOOK_CURSOR_PAGEUP_SELECT_COMMAND_ID = "notebook.cell.cursorPageUpSelect";
const NOTEBOOK_CURSOR_PAGEDOWN_COMMAND_ID = "notebook.cell.cursorPageDown";
const NOTEBOOK_CURSOR_PAGEDOWN_SELECT_COMMAND_ID = "notebook.cell.cursorPageDownSelect";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.cell.nullAction",
      title: localize("notebook.cell.webviewHandledEvents", "Keypresses that should be handled by the focused element in the cell output."),
      keybinding: [{
        when: NOTEBOOK_OUTPUT_INPUT_FOCUSED,
        primary: KeyCode.DownArrow,
        weight: KeybindingWeight.WorkbenchContrib + 1
      }, {
        when: NOTEBOOK_OUTPUT_INPUT_FOCUSED,
        primary: KeyCode.UpArrow,
        weight: KeybindingWeight.WorkbenchContrib + 1
      }],
      f1: false
    });
  }
  run() {
    return;
  }
});
registerAction2(class FocusNextCellAction extends NotebookCellAction {
  constructor() {
    super({
      id: NOTEBOOK_FOCUS_NEXT_EDITOR,
      title: localize("cursorMoveDown", "Focus Next Cell Editor"),
      keybinding: [
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
            ContextKeyExpr.equals("config.notebook.navigation.allowNavigateToSurroundingCells", true),
            ContextKeyExpr.and(
              ContextKeyExpr.has(InputFocusedContextKey),
              EditorContextKeys.editorTextFocus,
              NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo("top"),
              NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo("none"),
              ContextKeyExpr.or(
                NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY.isEqualTo("end"),
                NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY.isEqualTo("both")
              )
            ),
            EditorContextKeys.isEmbeddedDiffEditor.negate()
          ),
          primary: KeyCode.DownArrow,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
          // code cell keybinding, focus inside editor: lower weight to not override suggest widget
        },
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
            ContextKeyExpr.equals("config.notebook.navigation.allowNavigateToSurroundingCells", true),
            ContextKeyExpr.and(
              NOTEBOOK_CELL_TYPE.isEqualTo("markup"),
              NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.isEqualTo(false),
              NOTEBOOK_CURSOR_NAVIGATION_MODE
            ),
            EditorContextKeys.isEmbeddedDiffEditor.negate()
          ),
          primary: KeyCode.DownArrow,
          weight: KeybindingWeight.WorkbenchContrib
          // markdown keybinding, focus on list: higher weight to override list.focusDown
        },
        {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED),
          primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
          mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.DownArrow },
          weight: KeybindingWeight.WorkbenchContrib
        },
        {
          when: ContextKeyExpr.and(NOTEBOOK_CELL_EDITOR_FOCUSED, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
          primary: KeyMod.CtrlCmd | KeyCode.PageDown,
          mac: { primary: KeyMod.WinCtrl | KeyCode.PageUp },
          weight: KeybindingWeight.WorkbenchContrib + 1
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    const activeCell = context.cell;
    const idx = editor.getCellIndex(activeCell);
    if (typeof idx !== "number") {
      return;
    }
    if (idx >= editor.getLength() - 1) {
      return;
    }
    const focusEditorLine = activeCell.textBuffer.getLineCount();
    const targetCell = context.cell ?? context.selectedCells?.[0];
    const foundEditor = targetCell ? findTargetCellEditor(context, targetCell) : void 0;
    if (foundEditor && foundEditor.hasTextFocus() && InlineChatController.get(foundEditor)?.getWidgetPosition()?.lineNumber === focusEditorLine) {
      InlineChatController.get(foundEditor)?.focus();
    } else {
      const newCell = editor.cellAt(idx + 1);
      const newFocusMode = newCell.cellKind === CellKind.Markup && newCell.getEditState() === CellEditState.Preview ? "container" : "editor";
      await editor.focusNotebookCell(newCell, newFocusMode, { focusEditorLine: 1 });
    }
  }
});
registerAction2(class FocusPreviousCellAction extends NotebookCellAction {
  constructor() {
    super({
      id: NOTEBOOK_FOCUS_PREVIOUS_EDITOR,
      title: localize("cursorMoveUp", "Focus Previous Cell Editor"),
      keybinding: [
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
            ContextKeyExpr.equals("config.notebook.navigation.allowNavigateToSurroundingCells", true),
            ContextKeyExpr.and(
              ContextKeyExpr.has(InputFocusedContextKey),
              EditorContextKeys.editorTextFocus,
              NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo("bottom"),
              NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo("none"),
              ContextKeyExpr.or(
                NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY.isEqualTo("start"),
                NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY.isEqualTo("both")
              )
            ),
            EditorContextKeys.isEmbeddedDiffEditor.negate()
          ),
          primary: KeyCode.UpArrow,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
          // code cell keybinding, focus inside editor: lower weight to not override suggest widget
        },
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
            ContextKeyExpr.equals("config.notebook.navigation.allowNavigateToSurroundingCells", true),
            ContextKeyExpr.and(
              NOTEBOOK_CELL_TYPE.isEqualTo("markup"),
              NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.isEqualTo(false),
              NOTEBOOK_CURSOR_NAVIGATION_MODE
            ),
            EditorContextKeys.isEmbeddedDiffEditor.negate()
          ),
          primary: KeyCode.UpArrow,
          weight: KeybindingWeight.WorkbenchContrib
          // markdown keybinding, focus on list: higher weight to override list.focusDown
        },
        {
          when: ContextKeyExpr.and(NOTEBOOK_CELL_EDITOR_FOCUSED, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
          primary: KeyMod.CtrlCmd | KeyCode.PageUp,
          mac: { primary: KeyMod.WinCtrl | KeyCode.PageUp },
          weight: KeybindingWeight.WorkbenchContrib + 1
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    const activeCell = context.cell;
    const idx = editor.getCellIndex(activeCell);
    if (typeof idx !== "number") {
      return;
    }
    if (idx < 1 || editor.getLength() === 0) {
      return;
    }
    const newCell = editor.cellAt(idx - 1);
    const newFocusMode = newCell.cellKind === CellKind.Markup && newCell.getEditState() === CellEditState.Preview ? "container" : "editor";
    const focusEditorLine = newCell.textBuffer.getLineCount();
    await editor.focusNotebookCell(newCell, newFocusMode, { focusEditorLine });
    const foundEditor = findTargetCellEditor(context, newCell);
    if (foundEditor && InlineChatController.get(foundEditor)?.getWidgetPosition()?.lineNumber === focusEditorLine) {
      InlineChatController.get(foundEditor)?.focus();
    }
  }
});
registerAction2(class extends NotebookAction {
  constructor() {
    super({
      id: NOTEBOOK_FOCUS_TOP,
      title: localize("focusFirstCell", "Focus First Cell"),
      keybinding: [
        {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          primary: KeyMod.CtrlCmd | KeyCode.Home,
          weight: KeybindingWeight.WorkbenchContrib
        },
        {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow },
          weight: KeybindingWeight.WorkbenchContrib
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    if (editor.getLength() === 0) {
      return;
    }
    const firstCell = editor.cellAt(0);
    await editor.focusNotebookCell(firstCell, "container");
  }
});
registerAction2(class extends NotebookAction {
  constructor() {
    super({
      id: NOTEBOOK_FOCUS_BOTTOM,
      title: localize("focusLastCell", "Focus Last Cell"),
      keybinding: [
        {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          primary: KeyMod.CtrlCmd | KeyCode.End,
          mac: void 0,
          weight: KeybindingWeight.WorkbenchContrib
        },
        {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow },
          weight: KeybindingWeight.WorkbenchContrib
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    if (!editor.hasModel() || editor.getLength() === 0) {
      return;
    }
    const lastIdx = editor.getLength() - 1;
    const lastVisibleIdx = editor.getPreviousVisibleCellIndex(lastIdx);
    if (lastVisibleIdx) {
      const cell = editor.cellAt(lastVisibleIdx);
      await editor.focusNotebookCell(cell, "container");
    }
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super({
      id: FOCUS_IN_OUTPUT_COMMAND_ID,
      title: localize2("focusOutput", "Focus In Active Cell Output"),
      f1: true,
      keybinding: [{
        when: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK.negate(), IsWindowsContext, NOTEBOOK_CELL_HAS_OUTPUTS),
        primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
        weight: KeybindingWeight.WorkbenchContrib
      }, {
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow,
        mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.DownArrow },
        weight: KeybindingWeight.WorkbenchContrib
      }],
      precondition: NOTEBOOK_OR_COMPOSITE_IS_ACTIVE_EDITOR
    });
  }
  async runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    const activeCell = context.cell;
    return timeout(0).then(() => editor.focusNotebookCell(activeCell, "output"));
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super({
      id: FOCUS_OUT_OUTPUT_COMMAND_ID,
      title: localize("focusOutputOut", "Focus Out Active Cell Output"),
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow,
        mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.UpArrow },
        weight: KeybindingWeight.WorkbenchContrib
      },
      precondition: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED)
    });
  }
  async runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    const activeCell = context.cell;
    await editor.focusNotebookCell(activeCell, "editor");
  }
});
registerAction2(class CenterActiveCellAction extends NotebookCellAction {
  constructor() {
    super({
      id: CENTER_ACTIVE_CELL,
      title: localize("notebookActions.centerActiveCell", "Center Active Cell"),
      keybinding: {
        when: NOTEBOOK_EDITOR_FOCUSED,
        primary: KeyMod.CtrlCmd | KeyCode.KeyL,
        mac: {
          primary: KeyMod.WinCtrl | KeyCode.KeyL
        },
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    return context.notebookEditor.revealInCenter(context.cell);
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super({
      id: NOTEBOOK_CURSOR_PAGEUP_COMMAND_ID,
      title: localize("cursorPageUp", "Cell Cursor Page Up"),
      keybinding: [
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            ContextKeyExpr.has(InputFocusedContextKey),
            EditorContextKeys.editorTextFocus
          ),
          primary: KeyCode.PageUp,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    EditorExtensionsRegistry.getEditorCommand("cursorPageUp").runCommand(accessor, { pageSize: getPageSize(context) });
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super({
      id: NOTEBOOK_CURSOR_PAGEUP_SELECT_COMMAND_ID,
      title: localize("cursorPageUpSelect", "Cell Cursor Page Up Select"),
      keybinding: [
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            ContextKeyExpr.has(InputFocusedContextKey),
            EditorContextKeys.editorTextFocus,
            NOTEBOOK_OUTPUT_FOCUSED.negate()
            // Webview handles Shift+PageUp for selection of output contents
          ),
          primary: KeyMod.Shift | KeyCode.PageUp,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    EditorExtensionsRegistry.getEditorCommand("cursorPageUpSelect").runCommand(accessor, { pageSize: getPageSize(context) });
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super({
      id: NOTEBOOK_CURSOR_PAGEDOWN_COMMAND_ID,
      title: localize("cursorPageDown", "Cell Cursor Page Down"),
      keybinding: [
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            ContextKeyExpr.has(InputFocusedContextKey),
            EditorContextKeys.editorTextFocus
          ),
          primary: KeyCode.PageDown,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    EditorExtensionsRegistry.getEditorCommand("cursorPageDown").runCommand(accessor, { pageSize: getPageSize(context) });
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super({
      id: NOTEBOOK_CURSOR_PAGEDOWN_SELECT_COMMAND_ID,
      title: localize("cursorPageDownSelect", "Cell Cursor Page Down Select"),
      keybinding: [
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            ContextKeyExpr.has(InputFocusedContextKey),
            EditorContextKeys.editorTextFocus,
            NOTEBOOK_OUTPUT_FOCUSED.negate()
            // Webview handles Shift+PageDown for selection of output contents
          ),
          primary: KeyMod.Shift | KeyCode.PageDown,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    EditorExtensionsRegistry.getEditorCommand("cursorPageDownSelect").runCommand(accessor, { pageSize: getPageSize(context) });
  }
});
function getPageSize(context) {
  const editor = context.notebookEditor;
  const layoutInfo = editor.getViewModel().layoutInfo;
  const lineHeight = layoutInfo?.fontInfo.lineHeight || 17;
  return Math.max(1, Math.floor((layoutInfo?.height || 0) / lineHeight) - 2);
}
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "notebook",
  order: 100,
  type: "object",
  "properties": {
    "notebook.navigation.allowNavigateToSurroundingCells": {
      type: "boolean",
      default: true,
      markdownDescription: localize("notebook.navigation.allowNavigateToSurroundingCells", "When enabled cursor can navigate to the next/previous cell when the current cursor in the cell editor is at the first/last line.")
    }
  }
});
export {
  CENTER_ACTIVE_CELL
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9uYXZpZ2F0aW9uL2Fycm93LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSW5wdXRGb2N1c2VkQ29udGV4dEtleSwgSXNXaW5kb3dzQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElubGluZUNoYXRDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vaW5saW5lQ2hhdC9icm93c2VyL2lubGluZUNoYXRDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0FjdGlvbkNvbnRleHQsIElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0LCBOb3RlYm9va0FjdGlvbiwgTm90ZWJvb2tDZWxsQWN0aW9uLCBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFQsIGZpbmRUYXJnZXRDZWxsRWRpdG9yIH0gZnJvbSAnLi4vLi4vY29udHJvbGxlci9jb3JlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFN0YXRlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IENlbGxLaW5kLCBOT1RFQk9PS19FRElUT1JfQ1VSU09SX0JPVU5EQVJZLCBOT1RFQk9PS19FRElUT1JfQ1VSU09SX0xJTkVfQk9VTkRBUlkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgTk9URUJPT0tfQ0VMTF9IQVNfT1VUUFVUUywgTk9URUJPT0tfQ0VMTF9NQVJLRE9XTl9FRElUX01PREUsIE5PVEVCT09LX0NFTExfVFlQRSwgTk9URUJPT0tfQ1VSU09SX05BVklHQVRJT05fTU9ERSwgTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIE5PVEVCT09LX09VVFBVVF9JTlBVVF9GT0NVU0VELCBOT1RFQk9PS19PVVRQVVRfRk9DVVNFRCwgTk9URUJPT0tfQ0VMTF9FRElUT1JfRk9DVVNFRCwgSVNfQ09NUE9TSVRFX05PVEVCT09LLCBOT1RFQk9PS19PUl9DT01QT1NJVEVfSVNfQUNUSVZFX0VESVRPUiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcblxuY29uc3QgTk9URUJPT0tfRk9DVVNfVE9QID0gJ25vdGVib29rLmZvY3VzVG9wJztcbmNvbnN0IE5PVEVCT09LX0ZPQ1VTX0JPVFRPTSA9ICdub3RlYm9vay5mb2N1c0JvdHRvbSc7XG5jb25zdCBOT1RFQk9PS19GT0NVU19QUkVWSU9VU19FRElUT1IgPSAnbm90ZWJvb2suZm9jdXNQcmV2aW91c0VkaXRvcic7XG5jb25zdCBOT1RFQk9PS19GT0NVU19ORVhUX0VESVRPUiA9ICdub3RlYm9vay5mb2N1c05leHRFZGl0b3InO1xuY29uc3QgRk9DVVNfSU5fT1VUUFVUX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5mb2N1c0luT3V0cHV0JztcbmNvbnN0IEZPQ1VTX09VVF9PVVRQVVRfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmZvY3VzT3V0T3V0cHV0JztcbmV4cG9ydCBjb25zdCBDRU5URVJfQUNUSVZFX0NFTEwgPSAnbm90ZWJvb2suY2VudGVyQWN0aXZlQ2VsbCc7XG5jb25zdCBOT1RFQk9PS19DVVJTT1JfUEFHRVVQX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5jdXJzb3JQYWdlVXAnO1xuY29uc3QgTk9URUJPT0tfQ1VSU09SX1BBR0VVUF9TRUxFQ1RfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmN1cnNvclBhZ2VVcFNlbGVjdCc7XG5jb25zdCBOT1RFQk9PS19DVVJTT1JfUEFHRURPV05fQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmN1cnNvclBhZ2VEb3duJztcbmNvbnN0IE5PVEVCT09LX0NVUlNPUl9QQUdFRE9XTl9TRUxFQ1RfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmN1cnNvclBhZ2VEb3duU2VsZWN0JztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbm90ZWJvb2suY2VsbC5udWxsQWN0aW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2suY2VsbC53ZWJ2aWV3SGFuZGxlZEV2ZW50cycsIFwiS2V5cHJlc3NlcyB0aGF0IHNob3VsZCBiZSBoYW5kbGVkIGJ5IHRoZSBmb2N1c2VkIGVsZW1lbnQgaW4gdGhlIGNlbGwgb3V0cHV0LlwiKSxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHdoZW46IE5PVEVCT09LX09VVFBVVF9JTlBVVF9GT0NVU0VELFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdoZW46IE5PVEVCT09LX09VVFBVVF9JTlBVVF9GT0NVU0VELFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMVxuXHRcdFx0fV0sXG5cdFx0XHRmMTogZmFsc2Vcblx0XHR9KTtcblx0fVxuXG5cdHJ1bigpIHtcblx0XHQvLyBub29wLCB0aGVzZSBhcmUgaGFuZGxlZCBieSB0aGUgb3V0cHV0IHdlYnZpZXdcblx0XHRyZXR1cm47XG5cdH1cblxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c05leHRDZWxsQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE5PVEVCT09LX0ZPQ1VTX05FWFRfRURJVE9SLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjdXJzb3JNb3ZlRG93bicsICdGb2N1cyBOZXh0IENlbGwgRWRpdG9yJyksXG5cdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0XHRcdENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5uYXZpZ2F0aW9uLmFsbG93TmF2aWdhdGVUb1N1cnJvdW5kaW5nQ2VsbHMnLCB0cnVlKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKElucHV0Rm9jdXNlZENvbnRleHRLZXkpLFxuXHRcdFx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9DVVJTT1JfQk9VTkRBUlkubm90RXF1YWxzVG8oJ3RvcCcpLFxuXHRcdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfQ1VSU09SX0JPVU5EQVJZLm5vdEVxdWFsc1RvKCdub25lJyksXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9DVVJTT1JfTElORV9CT1VOREFSWS5pc0VxdWFsVG8oJ2VuZCcpLFxuXHRcdFx0XHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9DVVJTT1JfTElORV9CT1VOREFSWS5pc0VxdWFsVG8oJ2JvdGgnKVxuXHRcdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaXNFbWJlZGRlZERpZmZFZGl0b3IubmVnYXRlKClcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0XHRcdHdlaWdodDogTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hULCAvLyBjb2RlIGNlbGwga2V5YmluZGluZywgZm9jdXMgaW5zaWRlIGVkaXRvcjogbG93ZXIgd2VpZ2h0IHRvIG5vdCBvdmVycmlkZSBzdWdnZXN0IHdpZGdldFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsXG5cdFx0XHRcdFx0XHRDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2submF2aWdhdGlvbi5hbGxvd05hdmlnYXRlVG9TdXJyb3VuZGluZ0NlbGxzJywgdHJ1ZSksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRcdE5PVEVCT09LX0NFTExfVFlQRS5pc0VxdWFsVG8oJ21hcmt1cCcpLFxuXHRcdFx0XHRcdFx0XHROT1RFQk9PS19DRUxMX01BUktET1dOX0VESVRfTU9ERS5pc0VxdWFsVG8oZmFsc2UpLFxuXHRcdFx0XHRcdFx0XHROT1RFQk9PS19DVVJTT1JfTkFWSUdBVElPTl9NT0RFKSxcblx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmlzRW1iZWRkZWREaWZmRWRpdG9yLm5lZ2F0ZSgpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiwgLy8gbWFya2Rvd24ga2V5YmluZGluZywgZm9jdXMgb24gbGlzdDogaGlnaGVyIHdlaWdodCB0byBvdmVycmlkZSBsaXN0LmZvY3VzRG93blxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19PVVRQVVRfRk9DVVNFRCksXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93LCB9LFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfQ0VMTF9FRElUT1JfRk9DVVNFRCwgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCksXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlBhZ2VEb3duLFxuXHRcdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuUGFnZVVwLCB9LFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMVxuXHRcdFx0XHR9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gY29udGV4dC5ub3RlYm9va0VkaXRvcjtcblx0XHRjb25zdCBhY3RpdmVDZWxsID0gY29udGV4dC5jZWxsO1xuXG5cdFx0Y29uc3QgaWR4ID0gZWRpdG9yLmdldENlbGxJbmRleChhY3RpdmVDZWxsKTtcblx0XHRpZiAodHlwZW9mIGlkeCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaWR4ID49IGVkaXRvci5nZXRMZW5ndGgoKSAtIDEpIHtcblx0XHRcdC8vIGxhc3Qgb25lXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXNFZGl0b3JMaW5lID0gYWN0aXZlQ2VsbC50ZXh0QnVmZmVyLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IHRhcmdldENlbGwgPSAoY29udGV4dC5jZWxsID8/IGNvbnRleHQuc2VsZWN0ZWRDZWxscz8uWzBdKTtcblx0XHRjb25zdCBmb3VuZEVkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQgPSB0YXJnZXRDZWxsID8gZmluZFRhcmdldENlbGxFZGl0b3IoY29udGV4dCwgdGFyZ2V0Q2VsbCkgOiB1bmRlZmluZWQ7XG5cblx0XHRpZiAoZm91bmRFZGl0b3IgJiYgZm91bmRFZGl0b3IuaGFzVGV4dEZvY3VzKCkgJiYgSW5saW5lQ2hhdENvbnRyb2xsZXIuZ2V0KGZvdW5kRWRpdG9yKT8uZ2V0V2lkZ2V0UG9zaXRpb24oKT8ubGluZU51bWJlciA9PT0gZm9jdXNFZGl0b3JMaW5lKSB7XG5cdFx0XHRJbmxpbmVDaGF0Q29udHJvbGxlci5nZXQoZm91bmRFZGl0b3IpPy5mb2N1cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBuZXdDZWxsID0gZWRpdG9yLmNlbGxBdChpZHggKyAxKTtcblx0XHRcdGNvbnN0IG5ld0ZvY3VzTW9kZSA9IG5ld0NlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBuZXdDZWxsLmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLlByZXZpZXcgPyAnY29udGFpbmVyJyA6ICdlZGl0b3InO1xuXHRcdFx0YXdhaXQgZWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKG5ld0NlbGwsIG5ld0ZvY3VzTW9kZSwgeyBmb2N1c0VkaXRvckxpbmU6IDEgfSk7XG5cdFx0fVxuXHR9XG59KTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNQcmV2aW91c0NlbGxBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTk9URUJPT0tfRk9DVVNfUFJFVklPVVNfRURJVE9SLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjdXJzb3JNb3ZlVXAnLCAnRm9jdXMgUHJldmlvdXMgQ2VsbCBFZGl0b3InKSxcblx0XHRcdGtleWJpbmRpbmc6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9GT0NVU0VELFxuXHRcdFx0XHRcdFx0Q09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLm5hdmlnYXRpb24uYWxsb3dOYXZpZ2F0ZVRvU3Vycm91bmRpbmdDZWxscycsIHRydWUpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoSW5wdXRGb2N1c2VkQ29udGV4dEtleSksXG5cdFx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0NVUlNPUl9CT1VOREFSWS5ub3RFcXVhbHNUbygnYm90dG9tJyksXG5cdFx0XHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9DVVJTT1JfQk9VTkRBUlkubm90RXF1YWxzVG8oJ25vbmUnKSxcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0NVUlNPUl9MSU5FX0JPVU5EQVJZLmlzRXF1YWxUbygnc3RhcnQnKSxcblx0XHRcdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfQ1VSU09SX0xJTkVfQk9VTkRBUlkuaXNFcXVhbFRvKCdib3RoJylcblx0XHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmlzRW1iZWRkZWREaWZmRWRpdG9yLm5lZ2F0ZSgpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdFx0d2VpZ2h0OiBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFQsIC8vIGNvZGUgY2VsbCBrZXliaW5kaW5nLCBmb2N1cyBpbnNpZGUgZWRpdG9yOiBsb3dlciB3ZWlnaHQgdG8gbm90IG92ZXJyaWRlIHN1Z2dlc3Qgd2lkZ2V0XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0XHRcdENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5uYXZpZ2F0aW9uLmFsbG93TmF2aWdhdGVUb1N1cnJvdW5kaW5nQ2VsbHMnLCB0cnVlKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0Tk9URUJPT0tfQ0VMTF9UWVBFLmlzRXF1YWxUbygnbWFya3VwJyksXG5cdFx0XHRcdFx0XHRcdE5PVEVCT09LX0NFTExfTUFSS0RPV05fRURJVF9NT0RFLmlzRXF1YWxUbyhmYWxzZSksXG5cdFx0XHRcdFx0XHRcdE5PVEVCT09LX0NVUlNPUl9OQVZJR0FUSU9OX01PREVcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5pc0VtYmVkZGVkRGlmZkVkaXRvci5uZWdhdGUoKVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLCAvLyBtYXJrZG93biBrZXliaW5kaW5nLCBmb2N1cyBvbiBsaXN0OiBoaWdoZXIgd2VpZ2h0IHRvIG92ZXJyaWRlIGxpc3QuZm9jdXNEb3duXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfQ0VMTF9FRElUT1JfRk9DVVNFRCwgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCksXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlBhZ2VVcCxcblx0XHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLlBhZ2VVcCwgfSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDFcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yO1xuXHRcdGNvbnN0IGFjdGl2ZUNlbGwgPSBjb250ZXh0LmNlbGw7XG5cblx0XHRjb25zdCBpZHggPSBlZGl0b3IuZ2V0Q2VsbEluZGV4KGFjdGl2ZUNlbGwpO1xuXHRcdGlmICh0eXBlb2YgaWR4ICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpZHggPCAxIHx8IGVkaXRvci5nZXRMZW5ndGgoKSA9PT0gMCkge1xuXHRcdFx0Ly8gd2UgZG9uJ3QgZG8gbG9vcFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld0NlbGwgPSBlZGl0b3IuY2VsbEF0KGlkeCAtIDEpO1xuXHRcdGNvbnN0IG5ld0ZvY3VzTW9kZSA9IG5ld0NlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBuZXdDZWxsLmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLlByZXZpZXcgPyAnY29udGFpbmVyJyA6ICdlZGl0b3InO1xuXHRcdGNvbnN0IGZvY3VzRWRpdG9yTGluZSA9IG5ld0NlbGwudGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKTtcblx0XHRhd2FpdCBlZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwobmV3Q2VsbCwgbmV3Rm9jdXNNb2RlLCB7IGZvY3VzRWRpdG9yTGluZTogZm9jdXNFZGl0b3JMaW5lIH0pO1xuXG5cdFx0Y29uc3QgZm91bmRFZGl0b3I6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkID0gZmluZFRhcmdldENlbGxFZGl0b3IoY29udGV4dCwgbmV3Q2VsbCk7XG5cblx0XHRpZiAoZm91bmRFZGl0b3IgJiYgSW5saW5lQ2hhdENvbnRyb2xsZXIuZ2V0KGZvdW5kRWRpdG9yKT8uZ2V0V2lkZ2V0UG9zaXRpb24oKT8ubGluZU51bWJlciA9PT0gZm9jdXNFZGl0b3JMaW5lKSB7XG5cdFx0XHRJbmxpbmVDaGF0Q29udHJvbGxlci5nZXQoZm91bmRFZGl0b3IpPy5mb2N1cygpO1xuXHRcdH1cblx0fVxufSk7XG5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTm90ZWJvb2tBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTk9URUJPT0tfRk9DVVNfVE9QLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdmb2N1c0ZpcnN0Q2VsbCcsICdGb2N1cyBGaXJzdCBDZWxsJyksXG5cdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIENvbnRleHRLZXlFeHByLm5vdChJbnB1dEZvY3VzZWRDb250ZXh0S2V5KSksXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkhvbWUsXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgQ29udGV4dEtleUV4cHIubm90KElucHV0Rm9jdXNlZENvbnRleHRLZXkpKSxcblx0XHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3cgfSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yO1xuXHRcdGlmIChlZGl0b3IuZ2V0TGVuZ3RoKCkgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaXJzdENlbGwgPSBlZGl0b3IuY2VsbEF0KDApO1xuXHRcdGF3YWl0IGVkaXRvci5mb2N1c05vdGVib29rQ2VsbChmaXJzdENlbGwsICdjb250YWluZXInKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE5PVEVCT09LX0ZPQ1VTX0JPVFRPTSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZm9jdXNMYXN0Q2VsbCcsICdGb2N1cyBMYXN0IENlbGwnKSxcblx0XHRcdGtleWJpbmRpbmc6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgQ29udGV4dEtleUV4cHIubm90KElucHV0Rm9jdXNlZENvbnRleHRLZXkpKSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW5kLFxuXHRcdFx0XHRcdG1hYzogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIENvbnRleHRLZXlFeHByLm5vdChJbnB1dEZvY3VzZWRDb250ZXh0S2V5KSksXG5cdFx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3cgfSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yO1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkgfHwgZWRpdG9yLmdldExlbmd0aCgpID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdElkeCA9IGVkaXRvci5nZXRMZW5ndGgoKSAtIDE7XG5cdFx0Y29uc3QgbGFzdFZpc2libGVJZHggPSBlZGl0b3IuZ2V0UHJldmlvdXNWaXNpYmxlQ2VsbEluZGV4KGxhc3RJZHgpO1xuXHRcdGlmIChsYXN0VmlzaWJsZUlkeCkge1xuXHRcdFx0Y29uc3QgY2VsbCA9IGVkaXRvci5jZWxsQXQobGFzdFZpc2libGVJZHgpO1xuXHRcdFx0YXdhaXQgZWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKGNlbGwsICdjb250YWluZXInKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBGT0NVU19JTl9PVVRQVVRfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvY3VzT3V0cHV0JywgJ0ZvY3VzIEluIEFjdGl2ZSBDZWxsIE91dHB1dCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSVNfQ09NUE9TSVRFX05PVEVCT09LLm5lZ2F0ZSgpLCBJc1dpbmRvd3NDb250ZXh0LCBOT1RFQk9PS19DRUxMX0hBU19PVVRQVVRTKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH0sIHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdywgfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH1dLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBOT1RFQk9PS19PUl9DT01QT1NJVEVfSVNfQUNUSVZFX0VESVRPUlxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gY29udGV4dC5ub3RlYm9va0VkaXRvcjtcblx0XHRjb25zdCBhY3RpdmVDZWxsID0gY29udGV4dC5jZWxsO1xuXHRcdHJldHVybiB0aW1lb3V0KDApLnRoZW4oKCkgPT4gZWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKGFjdGl2ZUNlbGwsICdvdXRwdXQnKSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRk9DVVNfT1VUX09VVFBVVF9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdmb2N1c091dHB1dE91dCcsICdGb2N1cyBPdXQgQWN0aXZlIENlbGwgT3V0cHV0JyksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvdywgfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfT1VUUFVUX0ZPQ1VTRUQpLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gY29udGV4dC5ub3RlYm9va0VkaXRvcjtcblx0XHRjb25zdCBhY3RpdmVDZWxsID0gY29udGV4dC5jZWxsO1xuXHRcdGF3YWl0IGVkaXRvci5mb2N1c05vdGVib29rQ2VsbChhY3RpdmVDZWxsLCAnZWRpdG9yJyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2VudGVyQWN0aXZlQ2VsbEFjdGlvbiBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDRU5URVJfQUNUSVZFX0NFTEwsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rQWN0aW9ucy5jZW50ZXJBY3RpdmVDZWxsJywgXCJDZW50ZXIgQWN0aXZlIENlbGxcIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IE5PVEVCT09LX0VESVRPUl9GT0NVU0VELFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5TCxcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleUwsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIGNvbnRleHQubm90ZWJvb2tFZGl0b3IucmV2ZWFsSW5DZW50ZXIoY29udGV4dC5jZWxsKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBOT1RFQk9PS19DVVJTT1JfUEFHRVVQX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2N1cnNvclBhZ2VVcCcsIFwiQ2VsbCBDdXJzb3IgUGFnZSBVcFwiKSxcblx0XHRcdGtleWJpbmRpbmc6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9GT0NVU0VELFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKElucHV0Rm9jdXNlZENvbnRleHRLZXkpLFxuXHRcdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5QYWdlVXAsXG5cdFx0XHRcdFx0d2VpZ2h0OiBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFRcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0RWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbW1hbmQoJ2N1cnNvclBhZ2VVcCcpLnJ1bkNvbW1hbmQoYWNjZXNzb3IsIHsgcGFnZVNpemU6IGdldFBhZ2VTaXplKGNvbnRleHQpIH0pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE5PVEVCT09LX0NVUlNPUl9QQUdFVVBfU0VMRUNUX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2N1cnNvclBhZ2VVcFNlbGVjdCcsIFwiQ2VsbCBDdXJzb3IgUGFnZSBVcCBTZWxlY3RcIiksXG5cdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcyhJbnB1dEZvY3VzZWRDb250ZXh0S2V5KSxcblx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0XHRcdE5PVEVCT09LX09VVFBVVF9GT0NVU0VELm5lZ2F0ZSgpLCAvLyBXZWJ2aWV3IGhhbmRsZXMgU2hpZnQrUGFnZVVwIGZvciBzZWxlY3Rpb24gb2Ygb3V0cHV0IGNvbnRlbnRzXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlBhZ2VVcCxcblx0XHRcdFx0XHR3ZWlnaHQ6IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVFxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0RWRpdG9yQ29tbWFuZCgnY3Vyc29yUGFnZVVwU2VsZWN0JykucnVuQ29tbWFuZChhY2Nlc3NvciwgeyBwYWdlU2l6ZTogZ2V0UGFnZVNpemUoY29udGV4dCkgfSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTk9URUJPT0tfQ1VSU09SX1BBR0VET1dOX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2N1cnNvclBhZ2VEb3duJywgXCJDZWxsIEN1cnNvciBQYWdlIERvd25cIiksXG5cdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcyhJbnB1dEZvY3VzZWRDb250ZXh0S2V5KSxcblx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuUGFnZURvd24sXG5cdFx0XHRcdFx0d2VpZ2h0OiBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFRcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0RWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbW1hbmQoJ2N1cnNvclBhZ2VEb3duJykucnVuQ29tbWFuZChhY2Nlc3NvciwgeyBwYWdlU2l6ZTogZ2V0UGFnZVNpemUoY29udGV4dCkgfSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTk9URUJPT0tfQ1VSU09SX1BBR0VET1dOX1NFTEVDVF9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjdXJzb3JQYWdlRG93blNlbGVjdCcsIFwiQ2VsbCBDdXJzb3IgUGFnZSBEb3duIFNlbGVjdFwiKSxcblx0XHRcdGtleWJpbmRpbmc6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9GT0NVU0VELFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKElucHV0Rm9jdXNlZENvbnRleHRLZXkpLFxuXHRcdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfT1VUUFVUX0ZPQ1VTRUQubmVnYXRlKCksIC8vIFdlYnZpZXcgaGFuZGxlcyBTaGlmdCtQYWdlRG93biBmb3Igc2VsZWN0aW9uIG9mIG91dHB1dCBjb250ZW50c1xuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5QYWdlRG93bixcblx0XHRcdFx0XHR3ZWlnaHQ6IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVFxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0RWRpdG9yQ29tbWFuZCgnY3Vyc29yUGFnZURvd25TZWxlY3QnKS5ydW5Db21tYW5kKGFjY2Vzc29yLCB7IHBhZ2VTaXplOiBnZXRQYWdlU2l6ZShjb250ZXh0KSB9KTtcblx0fVxufSk7XG5cblxuZnVuY3Rpb24gZ2V0UGFnZVNpemUoY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpIHtcblx0Y29uc3QgZWRpdG9yID0gY29udGV4dC5ub3RlYm9va0VkaXRvcjtcblx0Y29uc3QgbGF5b3V0SW5mbyA9IGVkaXRvci5nZXRWaWV3TW9kZWwoKS5sYXlvdXRJbmZvO1xuXHRjb25zdCBsaW5lSGVpZ2h0ID0gbGF5b3V0SW5mbz8uZm9udEluZm8ubGluZUhlaWdodCB8fCAxNztcblx0cmV0dXJuIE1hdGgubWF4KDEsIE1hdGguZmxvb3IoKGxheW91dEluZm8/LmhlaWdodCB8fCAwKSAvIGxpbmVIZWlnaHQpIC0gMik7XG59XG5cblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICdub3RlYm9vaycsXG5cdG9yZGVyOiAxMDAsXG5cdHR5cGU6ICdvYmplY3QnLFxuXHQncHJvcGVydGllcyc6IHtcblx0XHQnbm90ZWJvb2submF2aWdhdGlvbi5hbGxvd05hdmlnYXRlVG9TdXJyb3VuZGluZ0NlbGxzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdub3RlYm9vay5uYXZpZ2F0aW9uLmFsbG93TmF2aWdhdGVUb1N1cnJvdW5kaW5nQ2VsbHMnLCBcIldoZW4gZW5hYmxlZCBjdXJzb3IgY2FuIG5hdmlnYXRlIHRvIHRoZSBuZXh0L3ByZXZpb3VzIGNlbGwgd2hlbiB0aGUgY3VycmVudCBjdXJzb3IgaW4gdGhlIGNlbGwgZWRpdG9yIGlzIGF0IHRoZSBmaXJzdC9sYXN0IGxpbmUuXCIpXG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsY0FBYztBQUVoQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxjQUFjLCtCQUF1RDtBQUM5RSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHdCQUF3Qix3QkFBd0I7QUFFekQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNEI7QUFDckMsU0FBNkQsZ0JBQWdCLG9CQUFvQixzQ0FBc0MsNEJBQTRCO0FBQ25LLFNBQVMscUJBQXFCO0FBQzlC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
