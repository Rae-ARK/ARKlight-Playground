import { getDomNodePagePosition } from "../../../../base/browser/dom.js";
import { toAction } from "../../../../base/common/actions.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { EditorAction, registerEditorAction } from "../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { Position } from "../../../../editor/common/core/position.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { MessageController } from "../../../../editor/contrib/message/browser/messageController.js";
import * as nls from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { PanelFocusContext } from "../../../common/contextkeys.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { openBreakpointSource } from "./breakpointsView.js";
import { DisassemblyView } from "./disassemblyView.js";
import { BREAKPOINT_EDITOR_CONTRIBUTION_ID, BreakpointWidgetContext, CONTEXT_CALLSTACK_ITEM_TYPE, CONTEXT_DEBUG_STATE, CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED, CONTEXT_DISASSEMBLY_VIEW_FOCUS, CONTEXT_EXCEPTION_WIDGET_VISIBLE, CONTEXT_FOCUSED_STACK_FRAME_HAS_INSTRUCTION_POINTER_REFERENCE, CONTEXT_IN_DEBUG_MODE, CONTEXT_LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST, CONTEXT_STEP_INTO_TARGETS_SUPPORTED, EDITOR_CONTRIBUTION_ID, IDebugService, REPL_VIEW_ID, WATCH_VIEW_ID } from "../common/debug.js";
import { getEvaluatableExpressionAtPosition } from "../common/debugUtils.js";
import { DisassemblyViewInput } from "../common/disassemblyViewInput.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { TOGGLE_BREAKPOINT_ID } from "../../../../workbench/contrib/debug/browser/debugCommands.js";
class ToggleBreakpointAction extends Action2 {
  constructor() {
    super({
      id: TOGGLE_BREAKPOINT_ID,
      title: {
        ...nls.localize2("toggleBreakpointAction", "Toggle Breakpoint"),
        mnemonicTitle: nls.localize({ key: "miToggleBreakpoint", comment: ["&& denotes a mnemonic"] }, "Toggle &&Breakpoint")
      },
      category: nls.localize2("debugCategory", "Debug"),
      f1: true,
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      keybinding: {
        when: ContextKeyExpr.or(EditorContextKeys.editorTextFocus, CONTEXT_DISASSEMBLY_VIEW_FOCUS),
        primary: KeyCode.F9,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [{
        id: MenuId.MenubarDebugMenu,
        when: CONTEXT_DEBUGGERS_AVAILABLE,
        group: "4_new_breakpoint",
        order: 1
      }]
    });
  }
  async run(accessor, entry) {
    const editorService = accessor.get(IEditorService);
    const debugService = accessor.get(IDebugService);
    const activePane = editorService.activeEditorPane;
    if (activePane instanceof DisassemblyView) {
      const location = entry ? activePane.getAddressAndOffset(entry) : activePane.focusedAddressAndOffset;
      if (location) {
        const bps = debugService.getModel().getInstructionBreakpoints();
        const toRemove = bps.find((bp) => bp.address === location.address);
        if (toRemove) {
          debugService.removeInstructionBreakpoints(toRemove.instructionReference, toRemove.offset);
        } else {
          debugService.addInstructionBreakpoint({ instructionReference: location.reference, offset: location.offset, address: location.address, canPersist: false });
        }
      }
      return;
    }
    const codeEditorService = accessor.get(ICodeEditorService);
    const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
    if (editor?.hasModel()) {
      const modelUri = editor.getModel().uri;
      const canSet = debugService.canSetBreakpointsIn(editor.getModel());
      const lineNumbers = [...new Set(editor.getSelections().map((s) => s.getPosition().lineNumber))];
      await Promise.all(lineNumbers.map(async (line) => {
        const bps = debugService.getModel().getBreakpoints({ lineNumber: line, uri: modelUri });
        if (bps.length) {
          await Promise.all(bps.map((bp) => debugService.removeBreakpoints(bp.getId())));
        } else if (canSet) {
          await debugService.addBreakpoints(modelUri, [{ lineNumber: line }]);
        }
      }));
    }
  }
}
class ConditionalBreakpointAction extends EditorAction {
  constructor() {
    super({
      id: "editor.debug.action.conditionalBreakpoint",
      label: nls.localize2("conditionalBreakpointEditorAction", "Debug: Add Conditional Breakpoint..."),
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      menuOpts: {
        menuId: MenuId.MenubarNewBreakpointMenu,
        title: nls.localize({ key: "miConditionalBreakpoint", comment: ["&& denotes a mnemonic"] }, "&&Conditional Breakpoint..."),
        group: "1_breakpoints",
        order: 1,
        when: CONTEXT_DEBUGGERS_AVAILABLE
      }
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const position = editor.getPosition();
    if (position && editor.hasModel() && debugService.canSetBreakpointsIn(editor.getModel())) {
      editor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(position.lineNumber, void 0, BreakpointWidgetContext.CONDITION);
    }
  }
}
class LogPointAction extends EditorAction {
  constructor() {
    super({
      id: "editor.debug.action.addLogPoint",
      label: nls.localize2("logPointEditorAction", "Debug: Add Logpoint..."),
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      menuOpts: [
        {
          menuId: MenuId.MenubarNewBreakpointMenu,
          title: nls.localize({ key: "miLogPoint", comment: ["&& denotes a mnemonic"] }, "&&Logpoint..."),
          group: "1_breakpoints",
          order: 4,
          when: CONTEXT_DEBUGGERS_AVAILABLE
        }
      ]
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const position = editor.getPosition();
    if (position && editor.hasModel() && debugService.canSetBreakpointsIn(editor.getModel())) {
      editor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(position.lineNumber, position.column, BreakpointWidgetContext.LOG_MESSAGE);
    }
  }
}
class TriggerByBreakpointAction extends EditorAction {
  constructor() {
    super({
      id: "editor.debug.action.triggerByBreakpoint",
      label: nls.localize("triggerByBreakpointEditorAction", "Debug: Add Triggered Breakpoint..."),
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      alias: "Debug: Triggered Breakpoint...",
      menuOpts: [
        {
          menuId: MenuId.MenubarNewBreakpointMenu,
          title: nls.localize({ key: "miTriggerByBreakpoint", comment: ["&& denotes a mnemonic"] }, "&&Triggered Breakpoint..."),
          group: "1_breakpoints",
          order: 4,
          when: CONTEXT_DEBUGGERS_AVAILABLE
        }
      ]
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const position = editor.getPosition();
    if (position && editor.hasModel() && debugService.canSetBreakpointsIn(editor.getModel())) {
      editor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(position.lineNumber, position.column, BreakpointWidgetContext.TRIGGER_POINT);
    }
  }
}
class EditBreakpointAction extends EditorAction {
  constructor() {
    super({
      id: "editor.debug.action.editBreakpoint",
      label: nls.localize("EditBreakpointEditorAction", "Debug: Edit Breakpoint"),
      alias: "Debug: Edit Existing Breakpoint",
      precondition: CONTEXT_DEBUGGERS_AVAILABLE,
      menuOpts: {
        menuId: MenuId.MenubarNewBreakpointMenu,
        title: nls.localize({ key: "miEditBreakpoint", comment: ["&& denotes a mnemonic"] }, "&&Edit Breakpoint"),
        group: "1_breakpoints",
        order: 1,
        when: CONTEXT_DEBUGGERS_AVAILABLE
      }
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const position = editor.getPosition();
    const debugModel = debugService.getModel();
    if (!(editor.hasModel() && position)) {
      return;
    }
    const lineBreakpoints = debugModel.getBreakpoints({ lineNumber: position.lineNumber });
    if (lineBreakpoints.length === 0) {
      return;
    }
    const breakpointDistances = lineBreakpoints.map((b) => {
      if (!b.column) {
        return position.column;
      }
      return Math.abs(b.column - position.column);
    });
    const closestBreakpointIndex = breakpointDistances.indexOf(Math.min(...breakpointDistances));
    const closestBreakpoint = lineBreakpoints[closestBreakpointIndex];
    editor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(closestBreakpoint.lineNumber, closestBreakpoint.column);
  }
}
const _OpenDisassemblyViewAction = class _OpenDisassemblyViewAction extends Action2 {
  constructor() {
    super({
      id: _OpenDisassemblyViewAction.ID,
      title: {
        ...nls.localize2("openDisassemblyView", "Open Disassembly View"),
        mnemonicTitle: nls.localize({ key: "miDisassemblyView", comment: ["&& denotes a mnemonic"] }, "&&DisassemblyView")
      },
      precondition: CONTEXT_FOCUSED_STACK_FRAME_HAS_INSTRUCTION_POINTER_REFERENCE,
      menu: [
        {
          id: MenuId.EditorContext,
          group: "debug",
          order: 5,
          when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, PanelFocusContext.toNegated(), CONTEXT_DEBUG_STATE.isEqualTo("stopped"), EditorContextKeys.editorTextFocus, CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED, CONTEXT_LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST)
        },
        {
          id: MenuId.DebugCallStackContext,
          group: "z_commands",
          order: 50,
          when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo("stopped"), CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo("stackFrame"), CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED)
        },
        {
          id: MenuId.CommandPalette,
          when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo("stopped"), CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED)
        }
      ]
    });
  }
  run(accessor) {
    const editorService = accessor.get(IEditorService);
    editorService.openEditor(DisassemblyViewInput.instance, { pinned: true, revealIfOpened: true });
  }
};
_OpenDisassemblyViewAction.ID = "debug.action.openDisassemblyView";
let OpenDisassemblyViewAction = _OpenDisassemblyViewAction;
const _ToggleDisassemblyViewSourceCodeAction = class _ToggleDisassemblyViewSourceCodeAction extends Action2 {
  constructor() {
    super({
      id: _ToggleDisassemblyViewSourceCodeAction.ID,
      title: {
        ...nls.localize2("toggleDisassemblyViewSourceCode", "Toggle Source Code in Disassembly View"),
        mnemonicTitle: nls.localize({ key: "mitogglesource", comment: ["&& denotes a mnemonic"] }, "&&ToggleSource")
      },
      metadata: {
        description: nls.localize2("toggleDisassemblyViewSourceCodeDescription", "Shows or hides source code in disassembly")
      },
      f1: true
    });
  }
  run(accessor, editor, ...args) {
    const configService = accessor.get(IConfigurationService);
    if (configService) {
      const value = configService.getValue("debug").disassemblyView.showSourceCode;
      configService.updateValue(_ToggleDisassemblyViewSourceCodeAction.configID, !value);
    }
  }
};
_ToggleDisassemblyViewSourceCodeAction.ID = "debug.action.toggleDisassemblyViewSourceCode";
_ToggleDisassemblyViewSourceCodeAction.configID = "debug.disassemblyView.showSourceCode";
let ToggleDisassemblyViewSourceCodeAction = _ToggleDisassemblyViewSourceCodeAction;
const _RunToCursorAction = class _RunToCursorAction extends EditorAction {
  constructor() {
    super({
      id: _RunToCursorAction.ID,
      label: _RunToCursorAction.LABEL.value,
      alias: "Debug: Run to Cursor",
      precondition: ContextKeyExpr.and(
        CONTEXT_DEBUGGERS_AVAILABLE,
        PanelFocusContext.toNegated(),
        ContextKeyExpr.or(EditorContextKeys.editorTextFocus, CONTEXT_DISASSEMBLY_VIEW_FOCUS),
        ChatContextKeys.inChatSession.negate()
      ),
      contextMenuOpts: {
        group: "debug",
        order: 2,
        when: CONTEXT_IN_DEBUG_MODE
      }
    });
  }
  async run(accessor, editor) {
    const position = editor.getPosition();
    if (!(editor.hasModel() && position)) {
      return;
    }
    const uri = editor.getModel().uri;
    const debugService = accessor.get(IDebugService);
    const viewModel = debugService.getViewModel();
    const uriIdentityService = accessor.get(IUriIdentityService);
    let column = void 0;
    const focusedStackFrame = viewModel.focusedStackFrame;
    if (focusedStackFrame && uriIdentityService.extUri.isEqual(focusedStackFrame.source.uri, uri) && focusedStackFrame.range.startLineNumber === position.lineNumber) {
      column = position.column;
    }
    await debugService.runTo(uri, position.lineNumber, column);
  }
};
_RunToCursorAction.ID = "editor.debug.action.runToCursor";
_RunToCursorAction.LABEL = nls.localize2("runToCursor", "Run to Cursor");
let RunToCursorAction = _RunToCursorAction;
const _SelectionToReplAction = class _SelectionToReplAction extends EditorAction {
  constructor() {
    super({
      id: _SelectionToReplAction.ID,
      label: _SelectionToReplAction.LABEL.value,
      alias: "Debug: Evaluate in Console",
      precondition: ContextKeyExpr.and(
        CONTEXT_IN_DEBUG_MODE,
        EditorContextKeys.editorTextFocus,
        ChatContextKeys.inChatSession.negate()
      ),
      contextMenuOpts: {
        group: "debug",
        order: 0
      }
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const viewsService = accessor.get(IViewsService);
    const viewModel = debugService.getViewModel();
    const session = viewModel.focusedSession;
    if (!editor.hasModel() || !session) {
      return;
    }
    const selection = editor.getSelection();
    let text;
    if (selection.isEmpty()) {
      text = editor.getModel().getLineContent(selection.selectionStartLineNumber).trim();
    } else {
      text = editor.getModel().getValueInRange(selection);
    }
    const replView = await viewsService.openView(REPL_VIEW_ID, false);
    replView?.sendReplInput(text);
  }
};
_SelectionToReplAction.ID = "editor.debug.action.selectionToRepl";
_SelectionToReplAction.LABEL = nls.localize2("evaluateInDebugConsole", "Evaluate in Debug Console");
let SelectionToReplAction = _SelectionToReplAction;
const _SelectionToWatchExpressionsAction = class _SelectionToWatchExpressionsAction extends EditorAction {
  constructor() {
    super({
      id: _SelectionToWatchExpressionsAction.ID,
      label: _SelectionToWatchExpressionsAction.LABEL.value,
      alias: "Debug: Add to Watch",
      precondition: ContextKeyExpr.and(
        CONTEXT_IN_DEBUG_MODE,
        EditorContextKeys.editorTextFocus,
        ChatContextKeys.inChatSession.negate()
      ),
      contextMenuOpts: {
        group: "debug",
        order: 1
      }
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const viewsService = accessor.get(IViewsService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    if (!editor.hasModel()) {
      return;
    }
    let expression = void 0;
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!selection.isEmpty()) {
      expression = model.getValueInRange(selection);
    } else {
      const position = editor.getPosition();
      const evaluatableExpression = await getEvaluatableExpressionAtPosition(languageFeaturesService, model, position);
      if (!evaluatableExpression) {
        return;
      }
      expression = evaluatableExpression.matchingExpression;
    }
    if (!expression) {
      return;
    }
    await viewsService.openView(WATCH_VIEW_ID);
    debugService.addWatchExpression(expression);
  }
};
_SelectionToWatchExpressionsAction.ID = "editor.debug.action.selectionToWatch";
_SelectionToWatchExpressionsAction.LABEL = nls.localize2("addToWatch", "Add to Watch");
let SelectionToWatchExpressionsAction = _SelectionToWatchExpressionsAction;
class ShowDebugHoverAction extends EditorAction {
  constructor() {
    super({
      id: "editor.debug.action.showDebugHover",
      label: nls.localize2("showDebugHover", "Debug: Show Hover"),
      precondition: CONTEXT_IN_DEBUG_MODE,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  async run(accessor, editor) {
    const position = editor.getPosition();
    if (!position || !editor.hasModel()) {
      return;
    }
    return editor.getContribution(EDITOR_CONTRIBUTION_ID)?.showHover(position, true);
  }
}
const NO_TARGETS_MESSAGE = nls.localize("editor.debug.action.stepIntoTargets.notAvailable", "Step targets are not available here");
const _StepIntoTargetsAction = class _StepIntoTargetsAction extends EditorAction {
  constructor() {
    super({
      id: _StepIntoTargetsAction.ID,
      label: _StepIntoTargetsAction.LABEL,
      alias: "Debug: Step Into Target",
      precondition: ContextKeyExpr.and(CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo("stopped"), EditorContextKeys.editorTextFocus),
      contextMenuOpts: {
        group: "debug",
        order: 1.5
      }
    });
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const contextMenuService = accessor.get(IContextMenuService);
    const uriIdentityService = accessor.get(IUriIdentityService);
    const session = debugService.getViewModel().focusedSession;
    const frame = debugService.getViewModel().focusedStackFrame;
    const selection = editor.getSelection();
    const targetPosition = selection?.getPosition() || frame && { lineNumber: frame.range.startLineNumber, column: frame.range.startColumn };
    if (!session || !frame || !editor.hasModel() || !uriIdentityService.extUri.isEqual(editor.getModel().uri, frame.source.uri)) {
      if (targetPosition) {
        MessageController.get(editor)?.showMessage(NO_TARGETS_MESSAGE, targetPosition);
      }
      return;
    }
    const targets = await session.stepInTargets(frame.frameId);
    if (!targets?.length) {
      MessageController.get(editor)?.showMessage(NO_TARGETS_MESSAGE, targetPosition);
      return;
    }
    if (selection) {
      const positionalTargets = [];
      for (const target of targets) {
        if (target.line) {
          positionalTargets.push({
            start: new Position(target.line, target.column || 1),
            end: target.endLine ? new Position(target.endLine, target.endColumn || 1) : void 0,
            target
          });
        }
      }
      positionalTargets.sort((a, b) => b.start.lineNumber - a.start.lineNumber || b.start.column - a.start.column);
      const needle = selection.getPosition();
      const best = positionalTargets.find((t) => t.end && needle.isBefore(t.end) && t.start.isBeforeOrEqual(needle)) || positionalTargets.find((t) => t.end === void 0 && t.start.isBeforeOrEqual(needle));
      if (best) {
        session.stepIn(frame.thread.threadId, best.target.id);
        return;
      }
    }
    editor.revealLineInCenterIfOutsideViewport(frame.range.startLineNumber);
    const cursorCoords = editor.getScrolledVisiblePosition(targetPosition);
    const editorCoords = getDomNodePagePosition(editor.getDomNode());
    const x = editorCoords.left + cursorCoords.left;
    const y = editorCoords.top + cursorCoords.top + cursorCoords.height;
    contextMenuService.showContextMenu({
      getAnchor: () => ({ x, y }),
      getActions: () => {
        return targets.map((t) => toAction({ id: `stepIntoTarget:${t.id}`, label: t.label, enabled: true, run: () => session.stepIn(frame.thread.threadId, t.id) }));
      }
    });
  }
};
_StepIntoTargetsAction.ID = "editor.debug.action.stepIntoTargets";
_StepIntoTargetsAction.LABEL = nls.localize({ key: "stepIntoTargets", comment: ["Step Into Targets lets the user step into an exact function he or she is interested in."] }, "Step Into Target");
let StepIntoTargetsAction = _StepIntoTargetsAction;
class GoToBreakpointAction extends EditorAction {
  constructor(isNext, opts) {
    super(opts);
    this.isNext = isNext;
  }
  async run(accessor, editor) {
    const debugService = accessor.get(IDebugService);
    const editorService = accessor.get(IEditorService);
    const uriIdentityService = accessor.get(IUriIdentityService);
    if (editor.hasModel()) {
      const currentUri = editor.getModel().uri;
      const currentLine = editor.getPosition().lineNumber;
      const allEnabledBreakpoints = debugService.getModel().getBreakpoints({ enabledOnly: true });
      let moveBreakpoint = this.isNext ? allEnabledBreakpoints.filter((bp) => uriIdentityService.extUri.isEqual(bp.uri, currentUri) && bp.lineNumber > currentLine).shift() : allEnabledBreakpoints.filter((bp) => uriIdentityService.extUri.isEqual(bp.uri, currentUri) && bp.lineNumber < currentLine).pop();
      if (!moveBreakpoint) {
        moveBreakpoint = this.isNext ? allEnabledBreakpoints.filter((bp) => bp.uri.toString() > currentUri.toString()).shift() : allEnabledBreakpoints.filter((bp) => bp.uri.toString() < currentUri.toString()).pop();
      }
      if (!moveBreakpoint && allEnabledBreakpoints.length) {
        moveBreakpoint = this.isNext ? allEnabledBreakpoints[0] : allEnabledBreakpoints[allEnabledBreakpoints.length - 1];
      }
      if (moveBreakpoint) {
        return openBreakpointSource(moveBreakpoint, false, true, false, debugService, editorService);
      }
    }
  }
}
class GoToNextBreakpointAction extends GoToBreakpointAction {
  constructor() {
    super(true, {
      id: "editor.debug.action.goToNextBreakpoint",
      label: nls.localize2("goToNextBreakpoint", "Debug: Go to Next Breakpoint"),
      precondition: CONTEXT_DEBUGGERS_AVAILABLE
    });
  }
}
class GoToPreviousBreakpointAction extends GoToBreakpointAction {
  constructor() {
    super(false, {
      id: "editor.debug.action.goToPreviousBreakpoint",
      label: nls.localize2("goToPreviousBreakpoint", "Debug: Go to Previous Breakpoint"),
      precondition: CONTEXT_DEBUGGERS_AVAILABLE
    });
  }
}
class CloseExceptionWidgetAction extends EditorAction {
  constructor() {
    super({
      id: "editor.debug.action.closeExceptionWidget",
      label: nls.localize2("closeExceptionWidget", "Close Exception Widget"),
      precondition: CONTEXT_EXCEPTION_WIDGET_VISIBLE,
      kbOpts: {
        primary: KeyCode.Escape,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  async run(_accessor, editor) {
    const contribution = editor.getContribution(EDITOR_CONTRIBUTION_ID);
    contribution?.closeExceptionWidget();
  }
}
registerAction2(OpenDisassemblyViewAction);
registerAction2(ToggleDisassemblyViewSourceCodeAction);
registerAction2(ToggleBreakpointAction);
registerEditorAction(ConditionalBreakpointAction);
registerEditorAction(LogPointAction);
registerEditorAction(TriggerByBreakpointAction);
registerEditorAction(EditBreakpointAction);
registerEditorAction(RunToCursorAction);
registerEditorAction(StepIntoTargetsAction);
registerEditorAction(SelectionToReplAction);
registerEditorAction(SelectionToWatchExpressionsAction);
registerEditorAction(ShowDebugHoverAction);
registerEditorAction(GoToNextBreakpointAction);
registerEditorAction(GoToPreviousBreakpointAction);
registerEditorAction(CloseExceptionWidgetAction);
export {
  RunToCursorAction,
  SelectionToReplAction,
  SelectionToWatchExpressionsAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdFZGl0b3JBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBJQWN0aW9uT3B0aW9ucywgcmVnaXN0ZXJFZGl0b3JBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9tZXNzYWdlL2Jyb3dzZXIvbWVzc2FnZUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgUGFuZWxGb2N1c0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgb3BlbkJyZWFrcG9pbnRTb3VyY2UgfSBmcm9tICcuL2JyZWFrcG9pbnRzVmlldy5qcyc7XG5pbXBvcnQgeyBEaXNhc3NlbWJseVZpZXcsIElEaXNhc3NlbWJsZWRJbnN0cnVjdGlvbkVudHJ5IH0gZnJvbSAnLi9kaXNhc3NlbWJseVZpZXcuanMnO1xuaW1wb3J0IHsgUmVwbCB9IGZyb20gJy4vcmVwbC5qcyc7XG5pbXBvcnQgeyBCUkVBS1BPSU5UX0VESVRPUl9DT05UUklCVVRJT05fSUQsIEJyZWFrcG9pbnRXaWRnZXRDb250ZXh0LCBDT05URVhUX0NBTExTVEFDS19JVEVNX1RZUEUsIENPTlRFWFRfREVCVUdfU1RBVEUsIENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRSwgQ09OVEVYVF9ESVNBU1NFTUJMRV9SRVFVRVNUX1NVUFBPUlRFRCwgQ09OVEVYVF9ESVNBU1NFTUJMWV9WSUVXX0ZPQ1VTLCBDT05URVhUX0VYQ0VQVElPTl9XSURHRVRfVklTSUJMRSwgQ09OVEVYVF9GT0NVU0VEX1NUQUNLX0ZSQU1FX0hBU19JTlNUUlVDVElPTl9QT0lOVEVSX1JFRkVSRU5DRSwgQ09OVEVYVF9JTl9ERUJVR19NT0RFLCBDT05URVhUX0xBTkdVQUdFX1NVUFBPUlRTX0RJU0FTU0VNQkxFX1JFUVVFU1QsIENPTlRFWFRfU1RFUF9JTlRPX1RBUkdFVFNfU1VQUE9SVEVELCBFRElUT1JfQ09OVFJJQlVUSU9OX0lELCBJQnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbiwgSURlYnVnQ29uZmlndXJhdGlvbiwgSURlYnVnRWRpdG9yQ29udHJpYnV0aW9uLCBJRGVidWdTZXJ2aWNlLCBSRVBMX1ZJRVdfSUQsIFdBVENIX1ZJRVdfSUQgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgZ2V0RXZhbHVhdGFibGVFeHByZXNzaW9uQXRQb3NpdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1V0aWxzLmpzJztcbmltcG9ydCB7IERpc2Fzc2VtYmx5Vmlld0lucHV0IH0gZnJvbSAnLi4vY29tbW9uL2Rpc2Fzc2VtYmx5Vmlld0lucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRPR0dMRV9CUkVBS1BPSU5UX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9kZWJ1Z0NvbW1hbmRzLmpzJztcblxuY2xhc3MgVG9nZ2xlQnJlYWtwb2ludEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVE9HR0xFX0JSRUFLUE9JTlRfSUQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCd0b2dnbGVCcmVha3BvaW50QWN0aW9uJywgXCJUb2dnbGUgQnJlYWtwb2ludFwiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlUb2dnbGVCcmVha3BvaW50JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlRvZ2dsZSAmJkJyZWFrcG9pbnRcIiksXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IG5scy5sb2NhbGl6ZTIoJ2RlYnVnQ2F0ZWdvcnknLCBcIkRlYnVnXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLCBDT05URVhUX0RJU0FTU0VNQkxZX1ZJRVdfRk9DVVMpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkY5LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckRlYnVnTWVudSxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLFxuXHRcdFx0XHRncm91cDogJzRfbmV3X2JyZWFrcG9pbnQnLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZW50cnk/OiBJRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25FbnRyeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFjdGl2ZVBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGFjdGl2ZVBhbmUgaW5zdGFuY2VvZiBEaXNhc3NlbWJseVZpZXcpIHtcblx0XHRcdGNvbnN0IGxvY2F0aW9uID0gZW50cnkgPyBhY3RpdmVQYW5lLmdldEFkZHJlc3NBbmRPZmZzZXQoZW50cnkpIDogYWN0aXZlUGFuZS5mb2N1c2VkQWRkcmVzc0FuZE9mZnNldDtcblx0XHRcdGlmIChsb2NhdGlvbikge1xuXHRcdFx0XHRjb25zdCBicHMgPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKCk7XG5cdFx0XHRcdGNvbnN0IHRvUmVtb3ZlID0gYnBzLmZpbmQoYnAgPT4gYnAuYWRkcmVzcyA9PT0gbG9jYXRpb24uYWRkcmVzcyk7XG5cdFx0XHRcdGlmICh0b1JlbW92ZSkge1xuXHRcdFx0XHRcdGRlYnVnU2VydmljZS5yZW1vdmVJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKHRvUmVtb3ZlLmluc3RydWN0aW9uUmVmZXJlbmNlLCB0b1JlbW92ZS5vZmZzZXQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRlYnVnU2VydmljZS5hZGRJbnN0cnVjdGlvbkJyZWFrcG9pbnQoeyBpbnN0cnVjdGlvblJlZmVyZW5jZTogbG9jYXRpb24ucmVmZXJlbmNlLCBvZmZzZXQ6IGxvY2F0aW9uLm9mZnNldCwgYWRkcmVzczogbG9jYXRpb24uYWRkcmVzcywgY2FuUGVyc2lzdDogZmFsc2UgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvciA9IGNvZGVFZGl0b3JTZXJ2aWNlLmdldEZvY3VzZWRDb2RlRWRpdG9yKCkgfHwgY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdGlmIChlZGl0b3I/Lmhhc01vZGVsKCkpIHtcblx0XHRcdGNvbnN0IG1vZGVsVXJpID0gZWRpdG9yLmdldE1vZGVsKCkudXJpO1xuXHRcdFx0Y29uc3QgY2FuU2V0ID0gZGVidWdTZXJ2aWNlLmNhblNldEJyZWFrcG9pbnRzSW4oZWRpdG9yLmdldE1vZGVsKCkpO1xuXHRcdFx0Ly8gRG9lcyBub3QgYWNjb3VudCBmb3IgbXVsdGkgbGluZSBzZWxlY3Rpb25zLCBTZXQgdG8gcmVtb3ZlIG11bHRpcGxlIGN1cnNvciBvbiB0aGUgc2FtZSBsaW5lXG5cdFx0XHRjb25zdCBsaW5lTnVtYmVycyA9IFsuLi5uZXcgU2V0KGVkaXRvci5nZXRTZWxlY3Rpb25zKCkubWFwKHMgPT4gcy5nZXRQb3NpdGlvbigpLmxpbmVOdW1iZXIpKV07XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGxpbmVOdW1iZXJzLm1hcChhc3luYyBsaW5lID0+IHtcblx0XHRcdFx0Y29uc3QgYnBzID0gZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludHMoeyBsaW5lTnVtYmVyOiBsaW5lLCB1cmk6IG1vZGVsVXJpIH0pO1xuXHRcdFx0XHRpZiAoYnBzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGJwcy5tYXAoYnAgPT4gZGVidWdTZXJ2aWNlLnJlbW92ZUJyZWFrcG9pbnRzKGJwLmdldElkKCkpKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY2FuU2V0KSB7XG5cdFx0XHRcdFx0YXdhaXQgZGVidWdTZXJ2aWNlLmFkZEJyZWFrcG9pbnRzKG1vZGVsVXJpLCBbeyBsaW5lTnVtYmVyOiBsaW5lIH1dKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBDb25kaXRpb25hbEJyZWFrcG9pbnRBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5kZWJ1Zy5hY3Rpb24uY29uZGl0aW9uYWxCcmVha3BvaW50Jyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdjb25kaXRpb25hbEJyZWFrcG9pbnRFZGl0b3JBY3Rpb24nLCBcIkRlYnVnOiBBZGQgQ29uZGl0aW9uYWwgQnJlYWtwb2ludC4uLlwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLFxuXHRcdFx0bWVudU9wdHM6IHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuTWVudWJhck5ld0JyZWFrcG9pbnRNZW51LFxuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlDb25kaXRpb25hbEJyZWFrcG9pbnQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDb25kaXRpb25hbCBCcmVha3BvaW50Li4uXCIpLFxuXHRcdFx0XHRncm91cDogJzFfYnJlYWtwb2ludHMnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IGVkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdGlmIChwb3NpdGlvbiAmJiBlZGl0b3IuaGFzTW9kZWwoKSAmJiBkZWJ1Z1NlcnZpY2UuY2FuU2V0QnJlYWtwb2ludHNJbihlZGl0b3IuZ2V0TW9kZWwoKSkpIHtcblx0XHRcdGVkaXRvci5nZXRDb250cmlidXRpb248SUJyZWFrcG9pbnRFZGl0b3JDb250cmlidXRpb24+KEJSRUFLUE9JTlRfRURJVE9SX0NPTlRSSUJVVElPTl9JRCk/LnNob3dCcmVha3BvaW50V2lkZ2V0KHBvc2l0aW9uLmxpbmVOdW1iZXIsIHVuZGVmaW5lZCwgQnJlYWtwb2ludFdpZGdldENvbnRleHQuQ09ORElUSU9OKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTG9nUG9pbnRBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmRlYnVnLmFjdGlvbi5hZGRMb2dQb2ludCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbG9nUG9pbnRFZGl0b3JBY3Rpb24nLCBcIkRlYnVnOiBBZGQgTG9ncG9pbnQuLi5cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRSxcblx0XHRcdG1lbnVPcHRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyTmV3QnJlYWtwb2ludE1lbnUsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pTG9nUG9pbnQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZMb2dwb2ludC4uLlwiKSxcblx0XHRcdFx0XHRncm91cDogJzFfYnJlYWtwb2ludHMnLFxuXHRcdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHRcdHdoZW46IENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRSxcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBlZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRpZiAocG9zaXRpb24gJiYgZWRpdG9yLmhhc01vZGVsKCkgJiYgZGVidWdTZXJ2aWNlLmNhblNldEJyZWFrcG9pbnRzSW4oZWRpdG9yLmdldE1vZGVsKCkpKSB7XG5cdFx0XHRlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPElCcmVha3BvaW50RWRpdG9yQ29udHJpYnV0aW9uPihCUkVBS1BPSU5UX0VESVRPUl9DT05UUklCVVRJT05fSUQpPy5zaG93QnJlYWtwb2ludFdpZGdldChwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4sIEJyZWFrcG9pbnRXaWRnZXRDb250ZXh0LkxPR19NRVNTQUdFKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVHJpZ2dlckJ5QnJlYWtwb2ludEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuZGVidWcuYWN0aW9uLnRyaWdnZXJCeUJyZWFrcG9pbnQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgndHJpZ2dlckJ5QnJlYWtwb2ludEVkaXRvckFjdGlvbicsIFwiRGVidWc6IEFkZCBUcmlnZ2VyZWQgQnJlYWtwb2ludC4uLlwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLFxuXHRcdFx0YWxpYXM6ICdEZWJ1ZzogVHJpZ2dlcmVkIEJyZWFrcG9pbnQuLi4nLFxuXHRcdFx0bWVudU9wdHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1lbnVJZDogTWVudUlkLk1lbnViYXJOZXdCcmVha3BvaW50TWVudSxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlUcmlnZ2VyQnlCcmVha3BvaW50JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmVHJpZ2dlcmVkIEJyZWFrcG9pbnQuLi5cIiksXG5cdFx0XHRcdFx0Z3JvdXA6ICcxX2JyZWFrcG9pbnRzJyxcblx0XHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0XHR3aGVuOiBDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEUsXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0aWYgKHBvc2l0aW9uICYmIGVkaXRvci5oYXNNb2RlbCgpICYmIGRlYnVnU2VydmljZS5jYW5TZXRCcmVha3BvaW50c0luKGVkaXRvci5nZXRNb2RlbCgpKSkge1xuXHRcdFx0ZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxJQnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbj4oQlJFQUtQT0lOVF9FRElUT1JfQ09OVFJJQlVUSU9OX0lEKT8uc2hvd0JyZWFrcG9pbnRXaWRnZXQocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBCcmVha3BvaW50V2lkZ2V0Q29udGV4dC5UUklHR0VSX1BPSU5UKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgRWRpdEJyZWFrcG9pbnRBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5kZWJ1Zy5hY3Rpb24uZWRpdEJyZWFrcG9pbnQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnRWRpdEJyZWFrcG9pbnRFZGl0b3JBY3Rpb24nLCBcIkRlYnVnOiBFZGl0IEJyZWFrcG9pbnRcIiksXG5cdFx0XHRhbGlhczogJ0RlYnVnOiBFZGl0IEV4aXN0aW5nIEJyZWFrcG9pbnQnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEUsXG5cdFx0XHRtZW51T3B0czoge1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyTmV3QnJlYWtwb2ludE1lbnUsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUVkaXRCcmVha3BvaW50JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRWRpdCBCcmVha3BvaW50XCIpLFxuXHRcdFx0XHRncm91cDogJzFfYnJlYWtwb2ludHMnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IGVkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IGRlYnVnTW9kZWwgPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIShlZGl0b3IuaGFzTW9kZWwoKSAmJiBwb3NpdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lQnJlYWtwb2ludHMgPSBkZWJ1Z01vZGVsLmdldEJyZWFrcG9pbnRzKHsgbGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlciB9KTtcblx0XHRpZiAobGluZUJyZWFrcG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJyZWFrcG9pbnREaXN0YW5jZXMgPSBsaW5lQnJlYWtwb2ludHMubWFwKGIgPT4ge1xuXHRcdFx0aWYgKCFiLmNvbHVtbikge1xuXHRcdFx0XHRyZXR1cm4gcG9zaXRpb24uY29sdW1uO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gTWF0aC5hYnMoYi5jb2x1bW4gLSBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGNsb3Nlc3RCcmVha3BvaW50SW5kZXggPSBicmVha3BvaW50RGlzdGFuY2VzLmluZGV4T2YoTWF0aC5taW4oLi4uYnJlYWtwb2ludERpc3RhbmNlcykpO1xuXHRcdGNvbnN0IGNsb3Nlc3RCcmVha3BvaW50ID0gbGluZUJyZWFrcG9pbnRzW2Nsb3Nlc3RCcmVha3BvaW50SW5kZXhdO1xuXG5cdFx0ZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxJQnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbj4oQlJFQUtQT0lOVF9FRElUT1JfQ09OVFJJQlVUSU9OX0lEKT8uc2hvd0JyZWFrcG9pbnRXaWRnZXQoY2xvc2VzdEJyZWFrcG9pbnQubGluZU51bWJlciwgY2xvc2VzdEJyZWFrcG9pbnQuY29sdW1uKTtcblx0fVxufVxuXG5jbGFzcyBPcGVuRGlzYXNzZW1ibHlWaWV3QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdkZWJ1Zy5hY3Rpb24ub3BlbkRpc2Fzc2VtYmx5Vmlldyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5EaXNhc3NlbWJseVZpZXdBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCdvcGVuRGlzYXNzZW1ibHlWaWV3JywgXCJPcGVuIERpc2Fzc2VtYmx5IFZpZXdcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pRGlzYXNzZW1ibHlWaWV3JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRGlzYXNzZW1ibHlWaWV3XCIpLFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0NVU0VEX1NUQUNLX0ZSQU1FX0hBU19JTlNUUlVDVElPTl9QT0lOVEVSX1JFRkVSRU5DRSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJ2RlYnVnJyxcblx0XHRcdFx0XHRvcmRlcjogNSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9JTl9ERUJVR19NT0RFLCBQYW5lbEZvY3VzQ29udGV4dC50b05lZ2F0ZWQoKSwgQ09OVEVYVF9ERUJVR19TVEFURS5pc0VxdWFsVG8oJ3N0b3BwZWQnKSwgRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLCBDT05URVhUX0RJU0FTU0VNQkxFX1JFUVVFU1RfU1VQUE9SVEVELCBDT05URVhUX0xBTkdVQUdFX1NVUFBPUlRTX0RJU0FTU0VNQkxFX1JFUVVFU1QpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkRlYnVnQ2FsbFN0YWNrQ29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJ3pfY29tbWFuZHMnLFxuXHRcdFx0XHRcdG9yZGVyOiA1MCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9JTl9ERUJVR19NT0RFLCBDT05URVhUX0RFQlVHX1NUQVRFLmlzRXF1YWxUbygnc3RvcHBlZCcpLCBDT05URVhUX0NBTExTVEFDS19JVEVNX1RZUEUuaXNFcXVhbFRvKCdzdGFja0ZyYW1lJyksIENPTlRFWFRfRElTQVNTRU1CTEVfUkVRVUVTVF9TVVBQT1JURUQpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0lOX0RFQlVHX01PREUsIENPTlRFWFRfREVCVUdfU1RBVEUuaXNFcXVhbFRvKCdzdG9wcGVkJyksIENPTlRFWFRfRElTQVNTRU1CTEVfUkVRVUVTVF9TVVBQT1JURUQpXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihEaXNhc3NlbWJseVZpZXdJbnB1dC5pbnN0YW5jZSwgeyBwaW5uZWQ6IHRydWUsIHJldmVhbElmT3BlbmVkOiB0cnVlIH0pO1xuXHR9XG59XG5cbmNsYXNzIFRvZ2dsZURpc2Fzc2VtYmx5Vmlld1NvdXJjZUNvZGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2RlYnVnLmFjdGlvbi50b2dnbGVEaXNhc3NlbWJseVZpZXdTb3VyY2VDb2RlJztcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBjb25maWdJRDogc3RyaW5nID0gJ2RlYnVnLmRpc2Fzc2VtYmx5Vmlldy5zaG93U291cmNlQ29kZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRvZ2dsZURpc2Fzc2VtYmx5Vmlld1NvdXJjZUNvZGVBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCd0b2dnbGVEaXNhc3NlbWJseVZpZXdTb3VyY2VDb2RlJywgXCJUb2dnbGUgU291cmNlIENvZGUgaW4gRGlzYXNzZW1ibHkgVmlld1wiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWl0b2dnbGVzb3VyY2UnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZUb2dnbGVTb3VyY2VcIiksXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ3RvZ2dsZURpc2Fzc2VtYmx5Vmlld1NvdXJjZUNvZGVEZXNjcmlwdGlvbicsICdTaG93cyBvciBoaWRlcyBzb3VyY2UgY29kZSBpbiBkaXNhc3NlbWJseScpXG5cdFx0XHR9LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAoY29uZmlnU2VydmljZSkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBjb25maWdTZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLmRpc2Fzc2VtYmx5Vmlldy5zaG93U291cmNlQ29kZTtcblx0XHRcdGNvbmZpZ1NlcnZpY2UudXBkYXRlVmFsdWUoVG9nZ2xlRGlzYXNzZW1ibHlWaWV3U291cmNlQ29kZUFjdGlvbi5jb25maWdJRCwgIXZhbHVlKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJ1blRvQ3Vyc29yQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5kZWJ1Zy5hY3Rpb24ucnVuVG9DdXJzb3InO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IExBQkVMOiBJTG9jYWxpemVkU3RyaW5nID0gbmxzLmxvY2FsaXplMigncnVuVG9DdXJzb3InLCBcIlJ1biB0byBDdXJzb3JcIik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJ1blRvQ3Vyc29yQWN0aW9uLklELFxuXHRcdFx0bGFiZWw6IFJ1blRvQ3Vyc29yQWN0aW9uLkxBQkVMLnZhbHVlLFxuXHRcdFx0YWxpYXM6ICdEZWJ1ZzogUnVuIHRvIEN1cnNvcicsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLFxuXHRcdFx0XHRQYW5lbEZvY3VzQ29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLCBDT05URVhUX0RJU0FTU0VNQkxZX1ZJRVdfRk9DVVMpLFxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbi5uZWdhdGUoKVxuXHRcdFx0KSxcblx0XHRcdGNvbnRleHRNZW51T3B0czoge1xuXHRcdFx0XHRncm91cDogJ2RlYnVnJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENPTlRFWFRfSU5fREVCVUdfTU9ERVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBlZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRpZiAoIShlZGl0b3IuaGFzTW9kZWwoKSAmJiBwb3NpdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdXJpID0gZWRpdG9yLmdldE1vZGVsKCkudXJpO1xuXG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKTtcblx0XHRjb25zdCB1cmlJZGVudGl0eVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVyaUlkZW50aXR5U2VydmljZSk7XG5cblx0XHRsZXQgY29sdW1uOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZm9jdXNlZFN0YWNrRnJhbWUgPSB2aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0aWYgKGZvY3VzZWRTdGFja0ZyYW1lICYmIHVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChmb2N1c2VkU3RhY2tGcmFtZS5zb3VyY2UudXJpLCB1cmkpICYmIGZvY3VzZWRTdGFja0ZyYW1lLnJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gcG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0Ly8gSWYgdGhlIGN1cnNvciBpcyBvbiBhIGxpbmUgZGlmZmVyZW50IHRoYW4gdGhlIG9uZSB0aGUgZGVidWdnZXIgaXMgY3VycmVudGx5IHBhdXNlZCBvbiwgdGhlbiBzZW5kIHRoZSBicmVha3BvaW50IG9uIHRoZSBsaW5lIHdpdGhvdXQgYSBjb2x1bW5cblx0XHRcdC8vIG90aGVyd2lzZSBzZXQgaXQgYXQgdGhlIHByZWNpc2UgY29sdW1uICMxMDIxOTlcblx0XHRcdGNvbHVtbiA9IHBvc2l0aW9uLmNvbHVtbjtcblx0XHR9XG5cdFx0YXdhaXQgZGVidWdTZXJ2aWNlLnJ1blRvKHVyaSwgcG9zaXRpb24ubGluZU51bWJlciwgY29sdW1uKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2VsZWN0aW9uVG9SZXBsQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5kZWJ1Zy5hY3Rpb24uc2VsZWN0aW9uVG9SZXBsJztcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBMQUJFTDogSUxvY2FsaXplZFN0cmluZyA9IG5scy5sb2NhbGl6ZTIoJ2V2YWx1YXRlSW5EZWJ1Z0NvbnNvbGUnLCBcIkV2YWx1YXRlIGluIERlYnVnIENvbnNvbGVcIik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNlbGVjdGlvblRvUmVwbEFjdGlvbi5JRCxcblx0XHRcdGxhYmVsOiBTZWxlY3Rpb25Ub1JlcGxBY3Rpb24uTEFCRUwudmFsdWUsXG5cdFx0XHRhbGlhczogJ0RlYnVnOiBFdmFsdWF0ZSBpbiBDb25zb2xlJyxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDT05URVhUX0lOX0RFQlVHX01PREUsXG5cdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24ubmVnYXRlKCkpLFxuXHRcdFx0Y29udGV4dE1lbnVPcHRzOiB7XG5cdFx0XHRcdGdyb3VwOiAnZGVidWcnLFxuXHRcdFx0XHRvcmRlcjogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5mb2N1c2VkU2Vzc2lvbjtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpIHx8ICFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGxldCB0ZXh0OiBzdHJpbmc7XG5cdFx0aWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdHRleHQgPSBlZGl0b3IuZ2V0TW9kZWwoKS5nZXRMaW5lQ29udGVudChzZWxlY3Rpb24uc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyKS50cmltKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRleHQgPSBlZGl0b3IuZ2V0TW9kZWwoKS5nZXRWYWx1ZUluUmFuZ2Uoc2VsZWN0aW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXBsVmlldyA9IGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldyhSRVBMX1ZJRVdfSUQsIGZhbHNlKSBhcyBSZXBsIHwgdW5kZWZpbmVkO1xuXHRcdHJlcGxWaWV3Py5zZW5kUmVwbElucHV0KHRleHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZWxlY3Rpb25Ub1dhdGNoRXhwcmVzc2lvbnNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmRlYnVnLmFjdGlvbi5zZWxlY3Rpb25Ub1dhdGNoJztcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBMQUJFTDogSUxvY2FsaXplZFN0cmluZyA9IG5scy5sb2NhbGl6ZTIoJ2FkZFRvV2F0Y2gnLCBcIkFkZCB0byBXYXRjaFwiKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2VsZWN0aW9uVG9XYXRjaEV4cHJlc3Npb25zQWN0aW9uLklELFxuXHRcdFx0bGFiZWw6IFNlbGVjdGlvblRvV2F0Y2hFeHByZXNzaW9uc0FjdGlvbi5MQUJFTC52YWx1ZSxcblx0XHRcdGFsaWFzOiAnRGVidWc6IEFkZCB0byBXYXRjaCcsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q09OVEVYVF9JTl9ERUJVR19NT0RFLFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLm5lZ2F0ZSgpKSxcblx0XHRcdGNvbnRleHRNZW51T3B0czoge1xuXHRcdFx0XHRncm91cDogJ2RlYnVnJyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGV4cHJlc3Npb246IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXG5cdFx0aWYgKCFzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRleHByZXNzaW9uID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHNlbGVjdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0XHRjb25zdCBldmFsdWF0YWJsZUV4cHJlc3Npb24gPSBhd2FpdCBnZXRFdmFsdWF0YWJsZUV4cHJlc3Npb25BdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBtb2RlbCwgcG9zaXRpb24pO1xuXHRcdFx0aWYgKCFldmFsdWF0YWJsZUV4cHJlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZXhwcmVzc2lvbiA9IGV2YWx1YXRhYmxlRXhwcmVzc2lvbi5tYXRjaGluZ0V4cHJlc3Npb247XG5cdFx0fVxuXG5cdFx0aWYgKCFleHByZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3KFdBVENIX1ZJRVdfSUQpO1xuXHRcdGRlYnVnU2VydmljZS5hZGRXYXRjaEV4cHJlc3Npb24oZXhwcmVzc2lvbik7XG5cdH1cbn1cblxuY2xhc3MgU2hvd0RlYnVnSG92ZXJBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmRlYnVnLmFjdGlvbi5zaG93RGVidWdIb3ZlcicsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignc2hvd0RlYnVnSG92ZXInLCBcIkRlYnVnOiBTaG93IEhvdmVyXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0lOX0RFQlVHX01PREUsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SSksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IGVkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdGlmICghcG9zaXRpb24gfHwgIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248SURlYnVnRWRpdG9yQ29udHJpYnV0aW9uPihFRElUT1JfQ09OVFJJQlVUSU9OX0lEKT8uc2hvd0hvdmVyKHBvc2l0aW9uLCB0cnVlKTtcblx0fVxufVxuXG5jb25zdCBOT19UQVJHRVRTX01FU1NBR0UgPSBubHMubG9jYWxpemUoJ2VkaXRvci5kZWJ1Zy5hY3Rpb24uc3RlcEludG9UYXJnZXRzLm5vdEF2YWlsYWJsZScsIFwiU3RlcCB0YXJnZXRzIGFyZSBub3QgYXZhaWxhYmxlIGhlcmVcIik7XG5cbmNsYXNzIFN0ZXBJbnRvVGFyZ2V0c0FjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuZGVidWcuYWN0aW9uLnN0ZXBJbnRvVGFyZ2V0cyc7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBubHMubG9jYWxpemUoeyBrZXk6ICdzdGVwSW50b1RhcmdldHMnLCBjb21tZW50OiBbJ1N0ZXAgSW50byBUYXJnZXRzIGxldHMgdGhlIHVzZXIgc3RlcCBpbnRvIGFuIGV4YWN0IGZ1bmN0aW9uIGhlIG9yIHNoZSBpcyBpbnRlcmVzdGVkIGluLiddIH0sIFwiU3RlcCBJbnRvIFRhcmdldFwiKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU3RlcEludG9UYXJnZXRzQWN0aW9uLklELFxuXHRcdFx0bGFiZWw6IFN0ZXBJbnRvVGFyZ2V0c0FjdGlvbi5MQUJFTCxcblx0XHRcdGFsaWFzOiAnRGVidWc6IFN0ZXAgSW50byBUYXJnZXQnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TVEVQX0lOVE9fVEFSR0VUU19TVVBQT1JURUQsIENPTlRFWFRfSU5fREVCVUdfTU9ERSwgQ09OVEVYVF9ERUJVR19TVEFURS5pc0VxdWFsVG8oJ3N0b3BwZWQnKSwgRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzKSxcblx0XHRcdGNvbnRleHRNZW51T3B0czoge1xuXHRcdFx0XHRncm91cDogJ2RlYnVnJyxcblx0XHRcdFx0b3JkZXI6IDEuNVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRNZW51U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dE1lbnVTZXJ2aWNlKTtcblx0XHRjb25zdCB1cmlJZGVudGl0eVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHRjb25zdCBmcmFtZSA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cblx0XHRjb25zdCB0YXJnZXRQb3NpdGlvbiA9IHNlbGVjdGlvbj8uZ2V0UG9zaXRpb24oKSB8fCAoZnJhbWUgJiYgeyBsaW5lTnVtYmVyOiBmcmFtZS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGNvbHVtbjogZnJhbWUucmFuZ2Uuc3RhcnRDb2x1bW4gfSk7XG5cblx0XHRpZiAoIXNlc3Npb24gfHwgIWZyYW1lIHx8ICFlZGl0b3IuaGFzTW9kZWwoKSB8fCAhdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGVkaXRvci5nZXRNb2RlbCgpLnVyaSwgZnJhbWUuc291cmNlLnVyaSkpIHtcblx0XHRcdGlmICh0YXJnZXRQb3NpdGlvbikge1xuXHRcdFx0XHRNZXNzYWdlQ29udHJvbGxlci5nZXQoZWRpdG9yKT8uc2hvd01lc3NhZ2UoTk9fVEFSR0VUU19NRVNTQUdFLCB0YXJnZXRQb3NpdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cblx0XHRjb25zdCB0YXJnZXRzID0gYXdhaXQgc2Vzc2lvbi5zdGVwSW5UYXJnZXRzKGZyYW1lLmZyYW1lSWQpO1xuXHRcdGlmICghdGFyZ2V0cz8ubGVuZ3RoKSB7XG5cdFx0XHRNZXNzYWdlQ29udHJvbGxlci5nZXQoZWRpdG9yKT8uc2hvd01lc3NhZ2UoTk9fVEFSR0VUU19NRVNTQUdFLCB0YXJnZXRQb3NpdGlvbiEpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZXJlIGlzIGEgc2VsZWN0aW9uLCB0cnkgdG8gZmluZCB0aGUgYmVzdCB0YXJnZXQgd2l0aCBhIHBvc2l0aW9uIHRvIHN0ZXAgaW50by5cblx0XHRpZiAoc2VsZWN0aW9uKSB7XG5cdFx0XHRjb25zdCBwb3NpdGlvbmFsVGFyZ2V0czogeyBzdGFydDogUG9zaXRpb247IGVuZD86IFBvc2l0aW9uOyB0YXJnZXQ6IERlYnVnUHJvdG9jb2wuU3RlcEluVGFyZ2V0IH1bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCB0YXJnZXQgb2YgdGFyZ2V0cykge1xuXHRcdFx0XHRpZiAodGFyZ2V0LmxpbmUpIHtcblx0XHRcdFx0XHRwb3NpdGlvbmFsVGFyZ2V0cy5wdXNoKHtcblx0XHRcdFx0XHRcdHN0YXJ0OiBuZXcgUG9zaXRpb24odGFyZ2V0LmxpbmUsIHRhcmdldC5jb2x1bW4gfHwgMSksXG5cdFx0XHRcdFx0XHRlbmQ6IHRhcmdldC5lbmRMaW5lID8gbmV3IFBvc2l0aW9uKHRhcmdldC5lbmRMaW5lLCB0YXJnZXQuZW5kQ29sdW1uIHx8IDEpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dGFyZ2V0XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cG9zaXRpb25hbFRhcmdldHMuc29ydCgoYSwgYikgPT4gYi5zdGFydC5saW5lTnVtYmVyIC0gYS5zdGFydC5saW5lTnVtYmVyIHx8IGIuc3RhcnQuY29sdW1uIC0gYS5zdGFydC5jb2x1bW4pO1xuXG5cdFx0XHRjb25zdCBuZWVkbGUgPSBzZWxlY3Rpb24uZ2V0UG9zaXRpb24oKTtcblxuXHRcdFx0Ly8gVHJ5IHRvIGZpbmQgYSB0YXJnZXQgd2l0aCBhIHN0YXJ0IGFuZCBlbmQgdGhhdCBpcyBhcm91bmQgdGhlIGN1cnNvclxuXHRcdFx0Ly8gcG9zaXRpb24uIE9yLCBpZiBub25lLCB3aGF0ZXZlciBpcyBiZWZvcmUgdGhlIGN1cnNvci5cblx0XHRcdGNvbnN0IGJlc3QgPSBwb3NpdGlvbmFsVGFyZ2V0cy5maW5kKHQgPT4gdC5lbmQgJiYgbmVlZGxlLmlzQmVmb3JlKHQuZW5kKSAmJiB0LnN0YXJ0LmlzQmVmb3JlT3JFcXVhbChuZWVkbGUpKSB8fCBwb3NpdGlvbmFsVGFyZ2V0cy5maW5kKHQgPT4gdC5lbmQgPT09IHVuZGVmaW5lZCAmJiB0LnN0YXJ0LmlzQmVmb3JlT3JFcXVhbChuZWVkbGUpKTtcblx0XHRcdGlmIChiZXN0KSB7XG5cdFx0XHRcdHNlc3Npb24uc3RlcEluKGZyYW1lLnRocmVhZC50aHJlYWRJZCwgYmVzdC50YXJnZXQuaWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlLCBzaG93IGEgY29udGV4dCBtZW51IGFuZCBoYXZlIHRoZSB1c2VyIHBpY2sgYSB0YXJnZXRcblx0XHRlZGl0b3IucmV2ZWFsTGluZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQoZnJhbWUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCBjdXJzb3JDb29yZHMgPSBlZGl0b3IuZ2V0U2Nyb2xsZWRWaXNpYmxlUG9zaXRpb24odGFyZ2V0UG9zaXRpb24hKTtcblx0XHRjb25zdCBlZGl0b3JDb29yZHMgPSBnZXREb21Ob2RlUGFnZVBvc2l0aW9uKGVkaXRvci5nZXREb21Ob2RlKCkpO1xuXHRcdGNvbnN0IHggPSBlZGl0b3JDb29yZHMubGVmdCArIGN1cnNvckNvb3Jkcy5sZWZ0O1xuXHRcdGNvbnN0IHkgPSBlZGl0b3JDb29yZHMudG9wICsgY3Vyc29yQ29vcmRzLnRvcCArIGN1cnNvckNvb3Jkcy5oZWlnaHQ7XG5cblx0XHRjb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gKHsgeCwgeSB9KSxcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRhcmdldHMubWFwKHQgPT4gdG9BY3Rpb24oeyBpZDogYHN0ZXBJbnRvVGFyZ2V0OiR7dC5pZH1gLCBsYWJlbDogdC5sYWJlbCwgZW5hYmxlZDogdHJ1ZSwgcnVuOiAoKSA9PiBzZXNzaW9uLnN0ZXBJbihmcmFtZS50aHJlYWQudGhyZWFkSWQsIHQuaWQpIH0pKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBHb1RvQnJlYWtwb2ludEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgaXNOZXh0OiBib29sZWFuLCBvcHRzOiBJQWN0aW9uT3B0aW9ucykge1xuXHRcdHN1cGVyKG9wdHMpO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgdXJpSWRlbnRpdHlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVcmlJZGVudGl0eVNlcnZpY2UpO1xuXG5cdFx0aWYgKGVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50VXJpID0gZWRpdG9yLmdldE1vZGVsKCkudXJpO1xuXHRcdFx0Y29uc3QgY3VycmVudExpbmUgPSBlZGl0b3IuZ2V0UG9zaXRpb24oKS5saW5lTnVtYmVyO1xuXHRcdFx0Ly9CcmVha3BvaW50cyByZXR1cm5lZCBmcm9tIGBnZXRCcmVha3BvaW50c2AgYXJlIGFscmVhZHkgc29ydGVkLlxuXHRcdFx0Y29uc3QgYWxsRW5hYmxlZEJyZWFrcG9pbnRzID0gZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludHMoeyBlbmFibGVkT25seTogdHJ1ZSB9KTtcblxuXHRcdFx0Ly9UcnkgdG8gZmluZCBicmVha3BvaW50IGluIGN1cnJlbnQgZmlsZVxuXHRcdFx0bGV0IG1vdmVCcmVha3BvaW50ID1cblx0XHRcdFx0dGhpcy5pc05leHRcblx0XHRcdFx0XHQ/IGFsbEVuYWJsZWRCcmVha3BvaW50cy5maWx0ZXIoYnAgPT4gdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGJwLnVyaSwgY3VycmVudFVyaSkgJiYgYnAubGluZU51bWJlciA+IGN1cnJlbnRMaW5lKS5zaGlmdCgpXG5cdFx0XHRcdFx0OiBhbGxFbmFibGVkQnJlYWtwb2ludHMuZmlsdGVyKGJwID0+IHVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChicC51cmksIGN1cnJlbnRVcmkpICYmIGJwLmxpbmVOdW1iZXIgPCBjdXJyZW50TGluZSkucG9wKCk7XG5cblx0XHRcdC8vVHJ5IHRvIGZpbmQgYnJlYWtwb2ludHMgaW4gZm9sbG93aW5nIGZpbGVzXG5cdFx0XHRpZiAoIW1vdmVCcmVha3BvaW50KSB7XG5cdFx0XHRcdG1vdmVCcmVha3BvaW50ID1cblx0XHRcdFx0XHR0aGlzLmlzTmV4dFxuXHRcdFx0XHRcdFx0PyBhbGxFbmFibGVkQnJlYWtwb2ludHMuZmlsdGVyKGJwID0+IGJwLnVyaS50b1N0cmluZygpID4gY3VycmVudFVyaS50b1N0cmluZygpKS5zaGlmdCgpXG5cdFx0XHRcdFx0XHQ6IGFsbEVuYWJsZWRCcmVha3BvaW50cy5maWx0ZXIoYnAgPT4gYnAudXJpLnRvU3RyaW5nKCkgPCBjdXJyZW50VXJpLnRvU3RyaW5nKCkpLnBvcCgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvL01vdmUgdG8gZmlyc3Qgb3IgbGFzdCBwb3NzaWJsZSBicmVha3BvaW50XG5cdFx0XHRpZiAoIW1vdmVCcmVha3BvaW50ICYmIGFsbEVuYWJsZWRCcmVha3BvaW50cy5sZW5ndGgpIHtcblx0XHRcdFx0bW92ZUJyZWFrcG9pbnQgPSB0aGlzLmlzTmV4dCA/IGFsbEVuYWJsZWRCcmVha3BvaW50c1swXSA6IGFsbEVuYWJsZWRCcmVha3BvaW50c1thbGxFbmFibGVkQnJlYWtwb2ludHMubGVuZ3RoIC0gMV07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtb3ZlQnJlYWtwb2ludCkge1xuXHRcdFx0XHRyZXR1cm4gb3BlbkJyZWFrcG9pbnRTb3VyY2UobW92ZUJyZWFrcG9pbnQsIGZhbHNlLCB0cnVlLCBmYWxzZSwgZGVidWdTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgR29Ub05leHRCcmVha3BvaW50QWN0aW9uIGV4dGVuZHMgR29Ub0JyZWFrcG9pbnRBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih0cnVlLCB7XG5cdFx0XHRpZDogJ2VkaXRvci5kZWJ1Zy5hY3Rpb24uZ29Ub05leHRCcmVha3BvaW50Jyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdnb1RvTmV4dEJyZWFrcG9pbnQnLCBcIkRlYnVnOiBHbyB0byBOZXh0IEJyZWFrcG9pbnRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIEdvVG9QcmV2aW91c0JyZWFrcG9pbnRBY3Rpb24gZXh0ZW5kcyBHb1RvQnJlYWtwb2ludEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKGZhbHNlLCB7XG5cdFx0XHRpZDogJ2VkaXRvci5kZWJ1Zy5hY3Rpb24uZ29Ub1ByZXZpb3VzQnJlYWtwb2ludCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignZ29Ub1ByZXZpb3VzQnJlYWtwb2ludCcsIFwiRGVidWc6IEdvIHRvIFByZXZpb3VzIEJyZWFrcG9pbnRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIENsb3NlRXhjZXB0aW9uV2lkZ2V0QWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5kZWJ1Zy5hY3Rpb24uY2xvc2VFeGNlcHRpb25XaWRnZXQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2Nsb3NlRXhjZXB0aW9uV2lkZ2V0JywgXCJDbG9zZSBFeGNlcHRpb24gV2lkZ2V0XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0VYQ0VQVElPTl9XSURHRVRfVklTSUJMRSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250cmlidXRpb24gPSBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPElEZWJ1Z0VkaXRvckNvbnRyaWJ1dGlvbj4oRURJVE9SX0NPTlRSSUJVVElPTl9JRCk7XG5cdFx0Y29udHJpYnV0aW9uPy5jbG9zZUV4Y2VwdGlvbldpZGdldCgpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihPcGVuRGlzYXNzZW1ibHlWaWV3QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihUb2dnbGVEaXNhc3NlbWJseVZpZXdTb3VyY2VDb2RlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihUb2dnbGVCcmVha3BvaW50QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKENvbmRpdGlvbmFsQnJlYWtwb2ludEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihMb2dQb2ludEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihUcmlnZ2VyQnlCcmVha3BvaW50QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEVkaXRCcmVha3BvaW50QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFJ1blRvQ3Vyc29yQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFN0ZXBJbnRvVGFyZ2V0c0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihTZWxlY3Rpb25Ub1JlcGxBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oU2VsZWN0aW9uVG9XYXRjaEV4cHJlc3Npb25zQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFNob3dEZWJ1Z0hvdmVyQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEdvVG9OZXh0QnJlYWtwb2ludEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihHb1RvUHJldmlvdXNCcmVha3BvaW50QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKENsb3NlRXhjZXB0aW9uV2lkZ2V0QWN0aW9uKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFFMUMsU0FBUyxjQUE4Qiw0QkFBNEI7QUFDbkUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsWUFBWSxTQUFTO0FBRXJCLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVCQUFzRDtBQUUvRCxTQUFTLG1DQUFtQyx5QkFBeUIsNkJBQTZCLHFCQUFxQiw2QkFBNkIsdUNBQXVDLGdDQUFnQyxrQ0FBa0MsK0RBQStELHVCQUF1QiwrQ0FBK0MscUNBQXFDLHdCQUFzRyxlQUFlLGNBQWMscUJBQXFCO0FBQy9qQixTQUFTLDBDQUEwQztBQUNuRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDRCQUE0QjtBQUVyQyxNQUFNLCtCQUErQixRQUFRO0FBQUEsRUFDNUMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU87QUFBQSxRQUNOLEdBQUcsSUFBSSxVQUFVLDBCQUEwQixtQkFBbUI7QUFBQSxRQUM5RCxlQUFlLElBQUksU0FBUyxFQUFFLEtBQUssc0JBQXNCLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLHFCQUFxQjtBQUFBLE1BQ3JIO0FBQUEsTUFDQSxVQUFVLElBQUksVUFBVSxpQkFBaUIsT0FBTztBQUFBLE1BQ2hELElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxNQUNkLFlBQVk7QUFBQSxRQUNYLE1BQU0sZUFBZSxHQUFHLGtCQUFrQixpQkFBaUIsOEJBQThCO0FBQUEsUUFDekYsU0FBUyxRQUFRO0FBQUEsUUFDakIsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsTUFBTSxDQUFDO0FBQUEsUUFDTixJQUFJLE9BQU87QUFBQSxRQUNYLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBNEIsT0FBc0Q7QUFDM0YsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsVUFBTSxlQUFlLFNBQVMsSUFBSSxhQUFhO0FBRS9DLFVBQU0sYUFBYSxjQUFjO0FBQ2pDLFFBQUksc0JBQXNCLGlCQUFpQjtBQUMxQyxZQUFNLFdBQVcsUUFBUSxXQUFXLG9CQUFvQixLQUFLLElBQUksV0FBVztBQUM1RSxVQUFJLFVBQVU7QUFDYixjQUFNLE1BQU0sYUFBYSxTQUFTLEVBQUUsMEJBQTBCO0FBQzlELGNBQU0sV0FBVyxJQUFJLEtBQUssUUFBTSxHQUFHLFlBQVksU0FBUyxPQUFPO0FBQy9ELFlBQUksVUFBVTtBQUNiLHVCQUFhLDZCQUE2QixTQUFTLHNCQUFzQixTQUFTLE1BQU07QUFBQSxRQUN6RixPQUFPO0FBQ04sdUJBQWEseUJBQXlCLEVBQUUsc0JBQXNCLFNBQVMsV0FBVyxRQUFRLFNBQVMsUUFBUSxTQUFTLFNBQVMsU0FBUyxZQUFZLE1BQU0sQ0FBQztBQUFBLFFBQzFKO0FBQUEsTUFDRDtBQUNBO0FBQUEsSUFDRDtBQUVBLFVBQU0sb0JBQW9CLFNBQVMsSUFBSSxrQkFBa0I7QUFDekQsVUFBTSxTQUFTLGtCQUFrQixxQkFBcUIsS0FBSyxrQkFBa0Isb0JBQW9CO0FBQ2pHLFFBQUksUUFBUSxTQUFTLEdBQUc7QUFDdkIsWUFBTSxXQUFXLE9BQU8sU0FBUyxFQUFFO0FBQ25DLFlBQU0sU0FBUyxhQUFhLG9CQUFvQixPQUFPLFNBQVMsQ0FBQztBQUVqRSxZQUFNLGNBQWMsQ0FBQyxHQUFHLElBQUksSUFBSSxPQUFPLGNBQWMsRUFBRSxJQUFJLE9BQUssRUFBRSxZQUFZLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFFNUYsWUFBTSxRQUFRLElBQUksWUFBWSxJQUFJLE9BQU0sU0FBUTtBQUMvQyxjQUFNLE1BQU0sYUFBYSxTQUFTLEVBQUUsZUFBZSxFQUFFLFlBQVksTUFBTSxLQUFLLFNBQVMsQ0FBQztBQUN0RixZQUFJLElBQUksUUFBUTtBQUNmLGdCQUFNLFFBQVEsSUFBSSxJQUFJLElBQUksUUFBTSxhQUFhLGtCQUFrQixHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFBQSxRQUM1RSxXQUFXLFFBQVE7QUFDbEIsZ0JBQU0sYUFBYSxlQUFlLFVBQVUsQ0FBQyxFQUFFLFlBQVksS0FBSyxDQUFDLENBQUM7QUFBQSxRQUNuRTtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sb0NBQW9DLGFBQWE7QUFBQSxFQUN0RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUscUNBQXFDLHNDQUFzQztBQUFBLE1BQ2hHLGNBQWM7QUFBQSxNQUNkLFVBQVU7QUFBQSxRQUNULFFBQVEsT0FBTztBQUFBLFFBQ2YsT0FBTyxJQUFJLFNBQVMsRUFBRSxLQUFLLDJCQUEyQixTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyw2QkFBNkI7QUFBQSxRQUN6SCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE0QixRQUFvQztBQUN6RSxVQUFNLGVBQWUsU0FBUyxJQUFJLGFBQWE7QUFFL0MsVUFBTSxXQUFXLE9BQU8sWUFBWTtBQUNwQyxRQUFJLFlBQVksT0FBTyxTQUFTLEtBQUssYUFBYSxvQkFBb0IsT0FBTyxTQUFTLENBQUMsR0FBRztBQUN6RixhQUFPLGdCQUErQyxpQ0FBaUMsR0FBRyxxQkFBcUIsU0FBUyxZQUFZLFFBQVcsd0JBQXdCLFNBQVM7QUFBQSxJQUNqTDtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sdUJBQXVCLGFBQWE7QUFBQSxFQUV6QyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUsd0JBQXdCLHdCQUF3QjtBQUFBLE1BQ3JFLGNBQWM7QUFBQSxNQUNkLFVBQVU7QUFBQSxRQUNUO0FBQUEsVUFDQyxRQUFRLE9BQU87QUFBQSxVQUNmLE9BQU8sSUFBSSxTQUFTLEVBQUUsS0FBSyxjQUFjLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLGVBQWU7QUFBQSxVQUM5RixPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsVUFDUCxNQUFNO0FBQUEsUUFDUDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBNEIsUUFBb0M7QUFDekUsVUFBTSxlQUFlLFNBQVMsSUFBSSxhQUFhO0FBRS9DLFVBQU0sV0FBVyxPQUFPLFlBQVk7QUFDcEMsUUFBSSxZQUFZLE9BQU8sU0FBUyxLQUFLLGFBQWEsb0JBQW9CLE9BQU8sU0FBUyxDQUFDLEdBQUc7QUFDekYsYUFBTyxnQkFBK0MsaUNBQWlDLEdBQUcscUJBQXFCLFNBQVMsWUFBWSxTQUFTLFFBQVEsd0JBQXdCLFdBQVc7QUFBQSxJQUN6TDtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sa0NBQWtDLGFBQWE7QUFBQSxFQUVwRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFNBQVMsbUNBQW1DLG9DQUFvQztBQUFBLE1BQzNGLGNBQWM7QUFBQSxNQUNkLE9BQU87QUFBQSxNQUNQLFVBQVU7QUFBQSxRQUNUO0FBQUEsVUFDQyxRQUFRLE9BQU87QUFBQSxVQUNmLE9BQU8sSUFBSSxTQUFTLEVBQUUsS0FBSyx5QkFBeUIsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsMkJBQTJCO0FBQUEsVUFDckgsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFVBQ1AsTUFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTRCLFFBQW9DO0FBQ3pFLFVBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUUvQyxVQUFNLFdBQVcsT0FBTyxZQUFZO0FBQ3BDLFFBQUksWUFBWSxPQUFPLFNBQVMsS0FBSyxhQUFhLG9CQUFvQixPQUFPLFNBQVMsQ0FBQyxHQUFHO0FBQ3pGLGFBQU8sZ0JBQStDLGlDQUFpQyxHQUFHLHFCQUFxQixTQUFTLFlBQVksU0FBUyxRQUFRLHdCQUF3QixhQUFhO0FBQUEsSUFDM0w7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLDZCQUE2QixhQUFhO0FBQUEsRUFDL0MsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sSUFBSSxTQUFTLDhCQUE4Qix3QkFBd0I7QUFBQSxNQUMxRSxPQUFPO0FBQUEsTUFDUCxjQUFjO0FBQUEsTUFDZCxVQUFVO0FBQUEsUUFDVCxRQUFRLE9BQU87QUFBQSxRQUNmLE9BQU8sSUFBSSxTQUFTLEVBQUUsS0FBSyxvQkFBb0IsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsbUJBQW1CO0FBQUEsUUFDeEcsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBNEIsUUFBb0M7QUFDekUsVUFBTSxlQUFlLFNBQVMsSUFBSSxhQUFhO0FBRS9DLFVBQU0sV0FBVyxPQUFPLFlBQVk7QUFDcEMsVUFBTSxhQUFhLGFBQWEsU0FBUztBQUN6QyxRQUFJLEVBQUUsT0FBTyxTQUFTLEtBQUssV0FBVztBQUNyQztBQUFBLElBQ0Q7QUFFQSxVQUFNLGtCQUFrQixXQUFXLGVBQWUsRUFBRSxZQUFZLFNBQVMsV0FBVyxDQUFDO0FBQ3JGLFFBQUksZ0JBQWdCLFdBQVcsR0FBRztBQUNqQztBQUFBLElBQ0Q7QUFFQSxVQUFNLHNCQUFzQixnQkFBZ0IsSUFBSSxPQUFLO0FBQ3BELFVBQUksQ0FBQyxFQUFFLFFBQVE7QUFDZCxlQUFPLFNBQVM7QUFBQSxNQUNqQjtBQUVBLGFBQU8sS0FBSyxJQUFJLEVBQUUsU0FBUyxTQUFTLE1BQU07QUFBQSxJQUMzQyxDQUFDO0FBQ0QsVUFBTSx5QkFBeUIsb0JBQW9CLFFBQVEsS0FBSyxJQUFJLEdBQUcsbUJBQW1CLENBQUM7QUFDM0YsVUFBTSxvQkFBb0IsZ0JBQWdCLHNCQUFzQjtBQUVoRSxXQUFPLGdCQUErQyxpQ0FBaUMsR0FBRyxxQkFBcUIsa0JBQWtCLFlBQVksa0JBQWtCLE1BQU07QUFBQSxFQUN0SztBQUNEO0FBRUEsTUFBTSw2QkFBTixNQUFNLG1DQUFrQyxRQUFRO0FBQUEsRUFJL0MsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUksMkJBQTBCO0FBQUEsTUFDOUIsT0FBTztBQUFBLFFBQ04sR0FBRyxJQUFJLFVBQVUsdUJBQXVCLHVCQUF1QjtBQUFBLFFBQy9ELGVBQWUsSUFBSSxTQUFTLEVBQUUsS0FBSyxxQkFBcUIsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsbUJBQW1CO0FBQUEsTUFDbEg7QUFBQSxNQUNBLGNBQWM7QUFBQSxNQUNkLE1BQU07QUFBQSxRQUNMO0FBQUEsVUFDQyxJQUFJLE9BQU87QUFBQSxVQUNYLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxVQUNQLE1BQU0sZUFBZSxJQUFJLHVCQUF1QixrQkFBa0IsVUFBVSxHQUFHLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxrQkFBa0IsaUJBQWlCLHVDQUF1Qyw2Q0FBNkM7QUFBQSxRQUNqUDtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUksT0FBTztBQUFBLFVBQ1gsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFVBQ1AsTUFBTSxlQUFlLElBQUksdUJBQXVCLG9CQUFvQixVQUFVLFNBQVMsR0FBRyw0QkFBNEIsVUFBVSxZQUFZLEdBQUcscUNBQXFDO0FBQUEsUUFDckw7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJLE9BQU87QUFBQSxVQUNYLE1BQU0sZUFBZSxJQUFJLHVCQUF1QixvQkFBb0IsVUFBVSxTQUFTLEdBQUcscUNBQXFDO0FBQUEsUUFDaEk7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsSUFBSSxVQUFrQztBQUNyQyxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxrQkFBYyxXQUFXLHFCQUFxQixVQUFVLEVBQUUsUUFBUSxNQUFNLGdCQUFnQixLQUFLLENBQUM7QUFBQSxFQUMvRjtBQUNEO0FBckNNLDJCQUVrQixLQUFLO0FBRjdCLElBQU0sNEJBQU47QUF1Q0EsTUFBTSx5Q0FBTixNQUFNLCtDQUE4QyxRQUFRO0FBQUEsRUFLM0QsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUksdUNBQXNDO0FBQUEsTUFDMUMsT0FBTztBQUFBLFFBQ04sR0FBRyxJQUFJLFVBQVUsbUNBQW1DLHdDQUF3QztBQUFBLFFBQzVGLGVBQWUsSUFBSSxTQUFTLEVBQUUsS0FBSyxrQkFBa0IsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsZ0JBQWdCO0FBQUEsTUFDNUc7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNULGFBQWEsSUFBSSxVQUFVLDhDQUE4QywyQ0FBMkM7QUFBQSxNQUNySDtBQUFBLE1BQ0EsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLElBQUksVUFBNEIsV0FBd0IsTUFBdUI7QUFDOUUsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLHFCQUFxQjtBQUN4RCxRQUFJLGVBQWU7QUFDbEIsWUFBTSxRQUFRLGNBQWMsU0FBOEIsT0FBTyxFQUFFLGdCQUFnQjtBQUNuRixvQkFBYyxZQUFZLHVDQUFzQyxVQUFVLENBQUMsS0FBSztBQUFBLElBQ2pGO0FBQUEsRUFDRDtBQUNEO0FBMUJNLHVDQUVrQixLQUFLO0FBRnZCLHVDQUdrQixXQUFtQjtBQUgzQyxJQUFNLHdDQUFOO0FBNEJPLE1BQU0scUJBQU4sTUFBTSwyQkFBMEIsYUFBYTtBQUFBLEVBS25ELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJLG1CQUFrQjtBQUFBLE1BQ3RCLE9BQU8sbUJBQWtCLE1BQU07QUFBQSxNQUMvQixPQUFPO0FBQUEsTUFDUCxjQUFjLGVBQWU7QUFBQSxRQUM1QjtBQUFBLFFBQ0Esa0JBQWtCLFVBQVU7QUFBQSxRQUM1QixlQUFlLEdBQUcsa0JBQWtCLGlCQUFpQiw4QkFBOEI7QUFBQSxRQUNuRixnQkFBZ0IsY0FBYyxPQUFPO0FBQUEsTUFDdEM7QUFBQSxNQUNBLGlCQUFpQjtBQUFBLFFBQ2hCLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTRCLFFBQW9DO0FBQ3pFLFVBQU0sV0FBVyxPQUFPLFlBQVk7QUFDcEMsUUFBSSxFQUFFLE9BQU8sU0FBUyxLQUFLLFdBQVc7QUFDckM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxNQUFNLE9BQU8sU0FBUyxFQUFFO0FBRTlCLFVBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUMvQyxVQUFNLFlBQVksYUFBYSxhQUFhO0FBQzVDLFVBQU0scUJBQXFCLFNBQVMsSUFBSSxtQkFBbUI7QUFFM0QsUUFBSSxTQUE2QjtBQUNqQyxVQUFNLG9CQUFvQixVQUFVO0FBQ3BDLFFBQUkscUJBQXFCLG1CQUFtQixPQUFPLFFBQVEsa0JBQWtCLE9BQU8sS0FBSyxHQUFHLEtBQUssa0JBQWtCLE1BQU0sb0JBQW9CLFNBQVMsWUFBWTtBQUdqSyxlQUFTLFNBQVM7QUFBQSxJQUNuQjtBQUNBLFVBQU0sYUFBYSxNQUFNLEtBQUssU0FBUyxZQUFZLE1BQU07QUFBQSxFQUMxRDtBQUNEO0FBNUNhLG1CQUVXLEtBQUs7QUFGaEIsbUJBR1csUUFBMEIsSUFBSSxVQUFVLGVBQWUsZUFBZTtBQUh2RixJQUFNLG9CQUFOO0FBOENBLE1BQU0seUJBQU4sTUFBTSwrQkFBOEIsYUFBYTtBQUFBLEVBS3ZELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJLHVCQUFzQjtBQUFBLE1BQzFCLE9BQU8sdUJBQXNCLE1BQU07QUFBQSxNQUNuQyxPQUFPO0FBQUEsTUFDUCxjQUFjLGVBQWU7QUFBQSxRQUM1QjtBQUFBLFFBQ0Esa0JBQWtCO0FBQUEsUUFDbEIsZ0JBQWdCLGNBQWMsT0FBTztBQUFBLE1BQUM7QUFBQSxNQUN2QyxpQkFBaUI7QUFBQSxRQUNoQixPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE0QixRQUFvQztBQUN6RSxVQUFNLGVBQWUsU0FBUyxJQUFJLGFBQWE7QUFDL0MsVUFBTSxlQUFlLFNBQVMsSUFBSSxhQUFhO0FBQy9DLFVBQU0sWUFBWSxhQUFhLGFBQWE7QUFDNUMsVUFBTSxVQUFVLFVBQVU7QUFDMUIsUUFBSSxDQUFDLE9BQU8sU0FBUyxLQUFLLENBQUMsU0FBUztBQUNuQztBQUFBLElBQ0Q7QUFFQSxVQUFNLFlBQVksT0FBTyxhQUFhO0FBQ3RDLFFBQUk7QUFDSixRQUFJLFVBQVUsUUFBUSxHQUFHO0FBQ3hCLGFBQU8sT0FBTyxTQUFTLEVBQUUsZUFBZSxVQUFVLHdCQUF3QixFQUFFLEtBQUs7QUFBQSxJQUNsRixPQUFPO0FBQ04sYUFBTyxPQUFPLFNBQVMsRUFBRSxnQkFBZ0IsU0FBUztBQUFBLElBQ25EO0FBRUEsVUFBTSxXQUFXLE1BQU0sYUFBYSxTQUFTLGNBQWMsS0FBSztBQUNoRSxjQUFVLGNBQWMsSUFBSTtBQUFBLEVBQzdCO0FBQ0Q7QUF6Q2EsdUJBRVcsS0FBSztBQUZoQix1QkFHVyxRQUEwQixJQUFJLFVBQVUsMEJBQTBCLDJCQUEyQjtBQUg5RyxJQUFNLHdCQUFOO0FBMkNBLE1BQU0scUNBQU4sTUFBTSwyQ0FBMEMsYUFBYTtBQUFBLEVBS25FLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJLG1DQUFrQztBQUFBLE1BQ3RDLE9BQU8sbUNBQWtDLE1BQU07QUFBQSxNQUMvQyxPQUFPO0FBQUEsTUFDUCxjQUFjLGVBQWU7QUFBQSxRQUM1QjtBQUFBLFFBQ0Esa0JBQWtCO0FBQUEsUUFDbEIsZ0JBQWdCLGNBQWMsT0FBTztBQUFBLE1BQUM7QUFBQSxNQUN2QyxpQkFBaUI7QUFBQSxRQUNoQixPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE0QixRQUFvQztBQUN6RSxVQUFNLGVBQWUsU0FBUyxJQUFJLGFBQWE7QUFDL0MsVUFBTSxlQUFlLFNBQVMsSUFBSSxhQUFhO0FBQy9DLFVBQU0sMEJBQTBCLFNBQVMsSUFBSSx3QkFBd0I7QUFDckUsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFFBQUksYUFBaUM7QUFFckMsVUFBTSxRQUFRLE9BQU8sU0FBUztBQUM5QixVQUFNLFlBQVksT0FBTyxhQUFhO0FBRXRDLFFBQUksQ0FBQyxVQUFVLFFBQVEsR0FBRztBQUN6QixtQkFBYSxNQUFNLGdCQUFnQixTQUFTO0FBQUEsSUFDN0MsT0FBTztBQUNOLFlBQU0sV0FBVyxPQUFPLFlBQVk7QUFDcEMsWUFBTSx3QkFBd0IsTUFBTSxtQ0FBbUMseUJBQXlCLE9BQU8sUUFBUTtBQUMvRyxVQUFJLENBQUMsdUJBQXVCO0FBQzNCO0FBQUEsTUFDRDtBQUNBLG1CQUFhLHNCQUFzQjtBQUFBLElBQ3BDO0FBRUEsUUFBSSxDQUFDLFlBQVk7QUFDaEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUFhLFNBQVMsYUFBYTtBQUN6QyxpQkFBYSxtQkFBbUIsVUFBVTtBQUFBLEVBQzNDO0FBQ0Q7QUFwRGEsbUNBRVcsS0FBSztBQUZoQixtQ0FHVyxRQUEwQixJQUFJLFVBQVUsY0FBYyxjQUFjO0FBSHJGLElBQU0sb0NBQU47QUFzRFAsTUFBTSw2QkFBNkIsYUFBYTtBQUFBLEVBRS9DLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLElBQUksVUFBVSxrQkFBa0IsbUJBQW1CO0FBQUEsTUFDMUQsY0FBYztBQUFBLE1BQ2QsUUFBUTtBQUFBLFFBQ1AsUUFBUSxrQkFBa0I7QUFBQSxRQUMxQixTQUFTLFNBQVMsT0FBTyxVQUFVLFFBQVEsTUFBTSxPQUFPLFVBQVUsUUFBUSxJQUFJO0FBQUEsUUFDOUUsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE0QixRQUFvQztBQUN6RSxVQUFNLFdBQVcsT0FBTyxZQUFZO0FBQ3BDLFFBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxTQUFTLEdBQUc7QUFDcEM7QUFBQSxJQUNEO0FBRUEsV0FBTyxPQUFPLGdCQUEwQyxzQkFBc0IsR0FBRyxVQUFVLFVBQVUsSUFBSTtBQUFBLEVBQzFHO0FBQ0Q7QUFFQSxNQUFNLHFCQUFxQixJQUFJLFNBQVMsb0RBQW9ELHFDQUFxQztBQUVqSSxNQUFNLHlCQUFOLE1BQU0sK0JBQThCLGFBQWE7QUFBQSxFQUtoRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSSx1QkFBc0I7QUFBQSxNQUMxQixPQUFPLHVCQUFzQjtBQUFBLE1BQzdCLE9BQU87QUFBQSxNQUNQLGNBQWMsZUFBZSxJQUFJLHFDQUFxQyx1QkFBdUIsb0JBQW9CLFVBQVUsU0FBUyxHQUFHLGtCQUFrQixlQUFlO0FBQUEsTUFDeEssaUJBQWlCO0FBQUEsUUFDaEIsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBNEIsUUFBb0M7QUFDekUsVUFBTSxlQUFlLFNBQVMsSUFBSSxhQUFhO0FBQy9DLFVBQU0scUJBQXFCLFNBQVMsSUFBSSxtQkFBbUI7QUFDM0QsVUFBTSxxQkFBcUIsU0FBUyxJQUFJLG1CQUFtQjtBQUMzRCxVQUFNLFVBQVUsYUFBYSxhQUFhLEVBQUU7QUFDNUMsVUFBTSxRQUFRLGFBQWEsYUFBYSxFQUFFO0FBQzFDLFVBQU0sWUFBWSxPQUFPLGFBQWE7QUFFdEMsVUFBTSxpQkFBaUIsV0FBVyxZQUFZLEtBQU0sU0FBUyxFQUFFLFlBQVksTUFBTSxNQUFNLGlCQUFpQixRQUFRLE1BQU0sTUFBTSxZQUFZO0FBRXhJLFFBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE9BQU8sU0FBUyxLQUFLLENBQUMsbUJBQW1CLE9BQU8sUUFBUSxPQUFPLFNBQVMsRUFBRSxLQUFLLE1BQU0sT0FBTyxHQUFHLEdBQUc7QUFDNUgsVUFBSSxnQkFBZ0I7QUFDbkIsMEJBQWtCLElBQUksTUFBTSxHQUFHLFlBQVksb0JBQW9CLGNBQWM7QUFBQSxNQUM5RTtBQUNBO0FBQUEsSUFDRDtBQUdBLFVBQU0sVUFBVSxNQUFNLFFBQVEsY0FBYyxNQUFNLE9BQU87QUFDekQsUUFBSSxDQUFDLFNBQVMsUUFBUTtBQUNyQix3QkFBa0IsSUFBSSxNQUFNLEdBQUcsWUFBWSxvQkFBb0IsY0FBZTtBQUM5RTtBQUFBLElBQ0Q7QUFHQSxRQUFJLFdBQVc7QUFDZCxZQUFNLG9CQUErRixDQUFDO0FBQ3RHLGlCQUFXLFVBQVUsU0FBUztBQUM3QixZQUFJLE9BQU8sTUFBTTtBQUNoQiw0QkFBa0IsS0FBSztBQUFBLFlBQ3RCLE9BQU8sSUFBSSxTQUFTLE9BQU8sTUFBTSxPQUFPLFVBQVUsQ0FBQztBQUFBLFlBQ25ELEtBQUssT0FBTyxVQUFVLElBQUksU0FBUyxPQUFPLFNBQVMsT0FBTyxhQUFhLENBQUMsSUFBSTtBQUFBLFlBQzVFO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFFQSx3QkFBa0IsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLE1BQU0sYUFBYSxFQUFFLE1BQU0sY0FBYyxFQUFFLE1BQU0sU0FBUyxFQUFFLE1BQU0sTUFBTTtBQUUzRyxZQUFNLFNBQVMsVUFBVSxZQUFZO0FBSXJDLFlBQU0sT0FBTyxrQkFBa0IsS0FBSyxPQUFLLEVBQUUsT0FBTyxPQUFPLFNBQVMsRUFBRSxHQUFHLEtBQUssRUFBRSxNQUFNLGdCQUFnQixNQUFNLENBQUMsS0FBSyxrQkFBa0IsS0FBSyxPQUFLLEVBQUUsUUFBUSxVQUFhLEVBQUUsTUFBTSxnQkFBZ0IsTUFBTSxDQUFDO0FBQ2xNLFVBQUksTUFBTTtBQUNULGdCQUFRLE9BQU8sTUFBTSxPQUFPLFVBQVUsS0FBSyxPQUFPLEVBQUU7QUFDcEQ7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFdBQU8sb0NBQW9DLE1BQU0sTUFBTSxlQUFlO0FBQ3RFLFVBQU0sZUFBZSxPQUFPLDJCQUEyQixjQUFlO0FBQ3RFLFVBQU0sZUFBZSx1QkFBdUIsT0FBTyxXQUFXLENBQUM7QUFDL0QsVUFBTSxJQUFJLGFBQWEsT0FBTyxhQUFhO0FBQzNDLFVBQU0sSUFBSSxhQUFhLE1BQU0sYUFBYSxNQUFNLGFBQWE7QUFFN0QsdUJBQW1CLGdCQUFnQjtBQUFBLE1BQ2xDLFdBQVcsT0FBTyxFQUFFLEdBQUcsRUFBRTtBQUFBLE1BQ3pCLFlBQVksTUFBTTtBQUNqQixlQUFPLFFBQVEsSUFBSSxPQUFLLFNBQVMsRUFBRSxJQUFJLGtCQUFrQixFQUFFLEVBQUUsSUFBSSxPQUFPLEVBQUUsT0FBTyxTQUFTLE1BQU0sS0FBSyxNQUFNLFFBQVEsT0FBTyxNQUFNLE9BQU8sVUFBVSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFBQSxNQUMxSjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQWxGTSx1QkFFa0IsS0FBSztBQUZ2Qix1QkFHa0IsUUFBUSxJQUFJLFNBQVMsRUFBRSxLQUFLLG1CQUFtQixTQUFTLENBQUMseUZBQXlGLEVBQUUsR0FBRyxrQkFBa0I7QUFIak0sSUFBTSx3QkFBTjtBQW9GQSxNQUFNLDZCQUE2QixhQUFhO0FBQUEsRUFDL0MsWUFBb0IsUUFBaUIsTUFBc0I7QUFDMUQsVUFBTSxJQUFJO0FBRFM7QUFBQSxFQUVwQjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTRCLFFBQW1DO0FBQ3hFLFVBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUMvQyxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxVQUFNLHFCQUFxQixTQUFTLElBQUksbUJBQW1CO0FBRTNELFFBQUksT0FBTyxTQUFTLEdBQUc7QUFDdEIsWUFBTSxhQUFhLE9BQU8sU0FBUyxFQUFFO0FBQ3JDLFlBQU0sY0FBYyxPQUFPLFlBQVksRUFBRTtBQUV6QyxZQUFNLHdCQUF3QixhQUFhLFNBQVMsRUFBRSxlQUFlLEVBQUUsYUFBYSxLQUFLLENBQUM7QUFHMUYsVUFBSSxpQkFDSCxLQUFLLFNBQ0Ysc0JBQXNCLE9BQU8sUUFBTSxtQkFBbUIsT0FBTyxRQUFRLEdBQUcsS0FBSyxVQUFVLEtBQUssR0FBRyxhQUFhLFdBQVcsRUFBRSxNQUFNLElBQy9ILHNCQUFzQixPQUFPLFFBQU0sbUJBQW1CLE9BQU8sUUFBUSxHQUFHLEtBQUssVUFBVSxLQUFLLEdBQUcsYUFBYSxXQUFXLEVBQUUsSUFBSTtBQUdqSSxVQUFJLENBQUMsZ0JBQWdCO0FBQ3BCLHlCQUNDLEtBQUssU0FDRixzQkFBc0IsT0FBTyxRQUFNLEdBQUcsSUFBSSxTQUFTLElBQUksV0FBVyxTQUFTLENBQUMsRUFBRSxNQUFNLElBQ3BGLHNCQUFzQixPQUFPLFFBQU0sR0FBRyxJQUFJLFNBQVMsSUFBSSxXQUFXLFNBQVMsQ0FBQyxFQUFFLElBQUk7QUFBQSxNQUN2RjtBQUdBLFVBQUksQ0FBQyxrQkFBa0Isc0JBQXNCLFFBQVE7QUFDcEQseUJBQWlCLEtBQUssU0FBUyxzQkFBc0IsQ0FBQyxJQUFJLHNCQUFzQixzQkFBc0IsU0FBUyxDQUFDO0FBQUEsTUFDakg7QUFFQSxVQUFJLGdCQUFnQjtBQUNuQixlQUFPLHFCQUFxQixnQkFBZ0IsT0FBTyxNQUFNLE9BQU8sY0FBYyxhQUFhO0FBQUEsTUFDNUY7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSxpQ0FBaUMscUJBQXFCO0FBQUEsRUFDM0QsY0FBYztBQUNiLFVBQU0sTUFBTTtBQUFBLE1BQ1gsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUsc0JBQXNCLDhCQUE4QjtBQUFBLE1BQ3pFLGNBQWM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFFQSxNQUFNLHFDQUFxQyxxQkFBcUI7QUFBQSxFQUMvRCxjQUFjO0FBQ2IsVUFBTSxPQUFPO0FBQUEsTUFDWixJQUFJO0FBQUEsTUFDSixPQUFPLElBQUksVUFBVSwwQkFBMEIsa0NBQWtDO0FBQUEsTUFDakYsY0FBYztBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQUVBLE1BQU0sbUNBQW1DLGFBQWE7QUFBQSxFQUVyRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUsd0JBQXdCLHdCQUF3QjtBQUFBLE1BQ3JFLGNBQWM7QUFBQSxNQUNkLFFBQVE7QUFBQSxRQUNQLFNBQVMsUUFBUTtBQUFBLFFBQ2pCLFFBQVEsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksV0FBNkIsUUFBb0M7QUFDMUUsVUFBTSxlQUFlLE9BQU8sZ0JBQTBDLHNCQUFzQjtBQUM1RixrQkFBYyxxQkFBcUI7QUFBQSxFQUNwQztBQUNEO0FBRUEsZ0JBQWdCLHlCQUF5QjtBQUN6QyxnQkFBZ0IscUNBQXFDO0FBQ3JELGdCQUFnQixzQkFBc0I7QUFDdEMscUJBQXFCLDJCQUEyQjtBQUNoRCxxQkFBcUIsY0FBYztBQUNuQyxxQkFBcUIseUJBQXlCO0FBQzlDLHFCQUFxQixvQkFBb0I7QUFDekMscUJBQXFCLGlCQUFpQjtBQUN0QyxxQkFBcUIscUJBQXFCO0FBQzFDLHFCQUFxQixxQkFBcUI7QUFDMUMscUJBQXFCLGlDQUFpQztBQUN0RCxxQkFBcUIsb0JBQW9CO0FBQ3pDLHFCQUFxQix3QkFBd0I7QUFDN0MscUJBQXFCLDRCQUE0QjtBQUNqRCxxQkFBcUIsMEJBQTBCOyIsCiAgIm5hbWVzIjogW10KfQo=
