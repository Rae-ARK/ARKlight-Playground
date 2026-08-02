import { getWindowId } from "../../../../base/browser/dom.js";
import { List } from "../../../../base/browser/ui/list/listWidget.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { deepClone } from "../../../../base/common/objects.js";
import { isWeb, isWindows } from "../../../../base/common/platform.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { ITextResourcePropertiesService } from "../../../../editor/common/services/textResourceConfiguration.js";
import * as nls from "../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { IExtensionHostDebugService } from "../../../../platform/debug/common/extensionHostDebug.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ActiveEditorContext, PanelFocusContext, ResourceContextKey } from "../../../common/contextkeys.js";
import { ViewContainerLocation } from "../../../common/views.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { TEXT_FILE_EDITOR_ID } from "../../files/common/files.js";
import { CONTEXT_BREAKPOINT_INPUT_FOCUSED, CONTEXT_BREAKPOINTS_FOCUSED, CONTEXT_DEBUG_STATE, CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DISASSEMBLY_VIEW_FOCUS, CONTEXT_EXPRESSION_SELECTED, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_IN_DEBUG_MODE, CONTEXT_IN_DEBUG_REPL, CONTEXT_JUMP_TO_CURSOR_SUPPORTED, CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_VARIABLES_FOCUSED, CONTEXT_WATCH_EXPRESSIONS_FOCUSED, DataBreakpointSetType, EDITOR_CONTRIBUTION_ID, getStateLabel, IDebugService, isFrameDeemphasized, REPL_VIEW_ID, State, VIEWLET_ID } from "../common/debug.js";
import { Breakpoint, DataBreakpoint, Expression, FunctionBreakpoint, Variable } from "../common/debugModel.js";
import { saveAllBeforeDebugStart, resolveChildSession } from "../common/debugUtils.js";
import { showLoadedScriptMenu } from "../common/loadedScriptsPicker.js";
import { openBreakpointSource } from "./breakpointsView.js";
import { showDebugSessionMenu } from "./debugSessionPicker.js";
const ADD_CONFIGURATION_ID = "debug.addConfiguration";
const COPY_ADDRESS_ID = "editor.debug.action.copyAddress";
const TOGGLE_BREAKPOINT_ID = "editor.debug.action.toggleBreakpoint";
const TOGGLE_INLINE_BREAKPOINT_ID = "editor.debug.action.toggleInlineBreakpoint";
const COPY_STACK_TRACE_ID = "debug.copyStackTrace";
const REVERSE_CONTINUE_ID = "workbench.action.debug.reverseContinue";
const STEP_BACK_ID = "workbench.action.debug.stepBack";
const RESTART_SESSION_ID = "workbench.action.debug.restart";
const TERMINATE_THREAD_ID = "workbench.action.debug.terminateThread";
const STEP_OVER_ID = "workbench.action.debug.stepOver";
const STEP_INTO_ID = "workbench.action.debug.stepInto";
const STEP_INTO_TARGET_ID = "workbench.action.debug.stepIntoTarget";
const STEP_OUT_ID = "workbench.action.debug.stepOut";
const PAUSE_ID = "workbench.action.debug.pause";
const DISCONNECT_ID = "workbench.action.debug.disconnect";
const DISCONNECT_AND_SUSPEND_ID = "workbench.action.debug.disconnectAndSuspend";
const STOP_ID = "workbench.action.debug.stop";
const RESTART_FRAME_ID = "workbench.action.debug.restartFrame";
const CONTINUE_ID = "workbench.action.debug.continue";
const FOCUS_REPL_ID = "workbench.debug.action.focusRepl";
const JUMP_TO_CURSOR_ID = "debug.jumpToCursor";
const FOCUS_SESSION_ID = "workbench.action.debug.focusProcess";
const SELECT_AND_START_ID = "workbench.action.debug.selectandstart";
const SELECT_DEBUG_CONSOLE_ID = "workbench.action.debug.selectDebugConsole";
const SELECT_DEBUG_SESSION_ID = "workbench.action.debug.selectDebugSession";
const DEBUG_CONFIGURE_COMMAND_ID = "workbench.action.debug.configure";
const DEBUG_START_COMMAND_ID = "workbench.action.debug.start";
const DEBUG_RUN_COMMAND_ID = "workbench.action.debug.run";
const EDIT_EXPRESSION_COMMAND_ID = "debug.renameWatchExpression";
const COPY_WATCH_EXPRESSION_COMMAND_ID = "debug.copyWatchExpression";
const SET_EXPRESSION_COMMAND_ID = "debug.setWatchExpression";
const REMOVE_EXPRESSION_COMMAND_ID = "debug.removeWatchExpression";
const NEXT_DEBUG_CONSOLE_ID = "workbench.action.debug.nextConsole";
const PREV_DEBUG_CONSOLE_ID = "workbench.action.debug.prevConsole";
const SHOW_LOADED_SCRIPTS_ID = "workbench.action.debug.showLoadedScripts";
const CALLSTACK_TOP_ID = "workbench.action.debug.callStackTop";
const CALLSTACK_BOTTOM_ID = "workbench.action.debug.callStackBottom";
const CALLSTACK_UP_ID = "workbench.action.debug.callStackUp";
const CALLSTACK_DOWN_ID = "workbench.action.debug.callStackDown";
const ADD_TO_WATCH_ID = "debug.addToWatchExpressions";
const COPY_EVALUATE_PATH_ID = "debug.copyEvaluatePath";
const COPY_VALUE_ID = "workbench.debug.viewlet.action.copyValue";
const BREAK_WHEN_VALUE_CHANGES_ID = "debug.breakWhenValueChanges";
const BREAK_WHEN_VALUE_IS_ACCESSED_ID = "debug.breakWhenValueIsAccessed";
const BREAK_WHEN_VALUE_IS_READ_ID = "debug.breakWhenValueIsRead";
const TOGGLE_EXCEPTION_BREAKPOINTS_ID = "debug.toggleExceptionBreakpoints";
const ATTACH_TO_CURRENT_CODE_RENDERER = "debug.attachToCurrentCodeRenderer";
const DEBUG_COMMAND_CATEGORY = nls.localize2("debug", "Debug");
const RESTART_LABEL = nls.localize2("restartDebug", "Restart");
const STEP_OVER_LABEL = nls.localize2("stepOverDebug", "Step Over");
const STEP_INTO_LABEL = nls.localize2("stepIntoDebug", "Step Into");
const STEP_INTO_TARGET_LABEL = nls.localize2("stepIntoTargetDebug", "Step Into Target");
const STEP_OUT_LABEL = nls.localize2("stepOutDebug", "Step Out");
const PAUSE_LABEL = nls.localize2("pauseDebug", "Pause");
const DISCONNECT_LABEL = nls.localize2("disconnect", "Disconnect");
const DISCONNECT_AND_SUSPEND_LABEL = nls.localize2("disconnectSuspend", "Disconnect and Suspend");
const STOP_LABEL = nls.localize2("stop", "Stop");
const CONTINUE_LABEL = nls.localize2("continueDebug", "Continue");
const FOCUS_SESSION_LABEL = nls.localize2("focusSession", "Focus Session");
const SELECT_AND_START_LABEL = nls.localize2("selectAndStartDebugging", "Select and Start Debugging");
const DEBUG_CONFIGURE_LABEL = nls.localize("openLaunchJson", "Open '{0}'", "launch.json");
const DEBUG_START_LABEL = nls.localize2("startDebug", "Start Debugging");
const DEBUG_RUN_LABEL = nls.localize2("startWithoutDebugging", "Start Without Debugging");
const NEXT_DEBUG_CONSOLE_LABEL = nls.localize2("nextDebugConsole", "Focus Next Debug Console");
const PREV_DEBUG_CONSOLE_LABEL = nls.localize2("prevDebugConsole", "Focus Previous Debug Console");
const OPEN_LOADED_SCRIPTS_LABEL = nls.localize2("openLoadedScript", "Open Loaded Script...");
const CALLSTACK_TOP_LABEL = nls.localize2("callStackTop", "Navigate to Top of Call Stack");
const CALLSTACK_BOTTOM_LABEL = nls.localize2("callStackBottom", "Navigate to Bottom of Call Stack");
const CALLSTACK_UP_LABEL = nls.localize2("callStackUp", "Navigate Up Call Stack");
const CALLSTACK_DOWN_LABEL = nls.localize2("callStackDown", "Navigate Down Call Stack");
const COPY_EVALUATE_PATH_LABEL = nls.localize2("copyAsExpression", "Copy as Expression");
const COPY_VALUE_LABEL = nls.localize2("copyValue", "Copy Value");
const COPY_ADDRESS_LABEL = nls.localize2("copyAddress", "Copy Address");
const ADD_TO_WATCH_LABEL = nls.localize2("addToWatchExpressions", "Add to Watch");
const SELECT_DEBUG_CONSOLE_LABEL = nls.localize2("selectDebugConsole", "Select Debug Console");
const SELECT_DEBUG_SESSION_LABEL = nls.localize2("selectDebugSession", "Select Debug Session");
const DEBUG_QUICK_ACCESS_PREFIX = "debug ";
const DEBUG_CONSOLE_QUICK_ACCESS_PREFIX = "debug consoles ";
let dataBreakpointInfoResponse;
function setDataBreakpointInfoResponse(resp) {
  dataBreakpointInfoResponse = resp;
}
function isThreadContext(obj) {
  return obj && typeof obj.sessionId === "string" && typeof obj.threadId === "string";
}
async function getThreadAndRun(accessor, sessionAndThreadId, run) {
  const debugService = accessor.get(IDebugService);
  let thread;
  if (isThreadContext(sessionAndThreadId)) {
    const session = debugService.getModel().getSession(sessionAndThreadId.sessionId);
    if (session) {
      thread = session.getAllThreads().find((t) => t.getId() === sessionAndThreadId.threadId);
    }
  } else if (isSessionContext(sessionAndThreadId)) {
    const session = debugService.getModel().getSession(sessionAndThreadId.sessionId);
    if (session) {
      const threads = session.getAllThreads();
      thread = threads.length > 0 ? threads[0] : void 0;
    }
  }
  if (!thread) {
    thread = debugService.getViewModel().focusedThread;
    if (!thread) {
      const focusedSession = debugService.getViewModel().focusedSession;
      const threads = focusedSession ? focusedSession.getAllThreads() : void 0;
      thread = threads && threads.length ? threads[0] : void 0;
    }
  }
  if (thread) {
    await run(thread);
  }
}
function isStackFrameContext(obj) {
  return obj && typeof obj.sessionId === "string" && typeof obj.threadId === "string" && typeof obj.frameId === "string";
}
function getFrame(debugService, context) {
  if (isStackFrameContext(context)) {
    const session = debugService.getModel().getSession(context.sessionId);
    if (session) {
      const thread = session.getAllThreads().find((t) => t.getId() === context.threadId);
      if (thread) {
        return thread.getCallStack().find((sf) => sf.getId() === context.frameId);
      }
    }
  } else {
    return debugService.getViewModel().focusedStackFrame;
  }
  return void 0;
}
function isSessionContext(obj) {
  return obj && typeof obj.sessionId === "string";
}
async function changeDebugConsoleFocus(accessor, next) {
  const debugService = accessor.get(IDebugService);
  const viewsService = accessor.get(IViewsService);
  const sessions = debugService.getModel().getSessions(true).filter((s) => s.hasSeparateRepl());
  let currSession = debugService.getViewModel().focusedSession;
  let nextIndex = 0;
  if (sessions.length > 0 && currSession) {
    while (currSession && !currSession.hasSeparateRepl()) {
      currSession = currSession.parentSession;
    }
    if (currSession) {
      const currIndex = sessions.indexOf(currSession);
      if (next) {
        nextIndex = currIndex === sessions.length - 1 ? 0 : currIndex + 1;
      } else {
        nextIndex = currIndex === 0 ? sessions.length - 1 : currIndex - 1;
      }
    }
  }
  await debugService.focusStackFrame(void 0, void 0, sessions[nextIndex], { explicit: true });
  if (!viewsService.isViewVisible(REPL_VIEW_ID)) {
    await viewsService.openView(REPL_VIEW_ID, true);
  }
}
async function navigateCallStack(debugService, down) {
  const frame = debugService.getViewModel().focusedStackFrame;
  if (frame) {
    let callStack = frame.thread.getCallStack();
    let index = callStack.findIndex((elem) => elem.frameId === frame.frameId);
    let nextVisibleFrame;
    if (down) {
      if (index >= callStack.length - 1) {
        if (frame.thread.reachedEndOfCallStack) {
          goToTopOfCallStack(debugService);
          return;
        } else {
          await debugService.getModel().fetchCallstack(frame.thread, 20);
          callStack = frame.thread.getCallStack();
          index = callStack.findIndex((elem) => elem.frameId === frame.frameId);
        }
      }
      nextVisibleFrame = findNextVisibleFrame(true, callStack, index);
    } else {
      if (index <= 0) {
        goToBottomOfCallStack(debugService);
        return;
      }
      nextVisibleFrame = findNextVisibleFrame(false, callStack, index);
    }
    if (nextVisibleFrame) {
      debugService.focusStackFrame(nextVisibleFrame, void 0, void 0, { preserveFocus: false });
    }
  }
}
async function goToBottomOfCallStack(debugService) {
  const thread = debugService.getViewModel().focusedThread;
  if (thread) {
    await debugService.getModel().fetchCallstack(thread);
    const callStack = thread.getCallStack();
    if (callStack.length > 0) {
      const nextVisibleFrame = findNextVisibleFrame(false, callStack, 0);
      if (nextVisibleFrame) {
        debugService.focusStackFrame(nextVisibleFrame, void 0, void 0, { preserveFocus: false });
      }
    }
  }
}
function goToTopOfCallStack(debugService) {
  const thread = debugService.getViewModel().focusedThread;
  if (thread) {
    debugService.focusStackFrame(thread.getTopStackFrame(), void 0, void 0, { preserveFocus: false });
  }
}
function findNextVisibleFrame(down, callStack, startIndex) {
  if (startIndex >= callStack.length) {
    startIndex = callStack.length - 1;
  } else if (startIndex < 0) {
    startIndex = 0;
  }
  let index = startIndex;
  let currFrame;
  do {
    if (down) {
      if (index === callStack.length - 1) {
        index = 0;
      } else {
        index++;
      }
    } else {
      if (index === 0) {
        index = callStack.length - 1;
      } else {
        index--;
      }
    }
    currFrame = callStack[index];
    if (!isFrameDeemphasized(currFrame)) {
      return currFrame;
    }
  } while (index !== startIndex);
  return void 0;
}
CommandsRegistry.registerCommand({
  id: COPY_STACK_TRACE_ID,
  handler: async (accessor, _, context) => {
    const textResourcePropertiesService = accessor.get(ITextResourcePropertiesService);
    const clipboardService = accessor.get(IClipboardService);
    const debugService = accessor.get(IDebugService);
    const frame = getFrame(debugService, context);
    if (frame) {
      const eol = textResourcePropertiesService.getEOL(frame.source.uri);
      await clipboardService.writeText(frame.thread.getCallStack().map((sf) => sf.toString()).join(eol));
    }
  }
});
CommandsRegistry.registerCommand({
  id: REVERSE_CONTINUE_ID,
  handler: async (accessor, _, context) => {
    await getThreadAndRun(accessor, context, (thread) => thread.reverseContinue());
  }
});
CommandsRegistry.registerCommand({
  id: STEP_BACK_ID,
  handler: async (accessor, _, context) => {
    const contextKeyService = accessor.get(IContextKeyService);
    if (CONTEXT_DISASSEMBLY_VIEW_FOCUS.getValue(contextKeyService)) {
      await getThreadAndRun(accessor, context, (thread) => thread.stepBack("instruction"));
    } else {
      await getThreadAndRun(accessor, context, (thread) => thread.stepBack());
    }
  }
});
CommandsRegistry.registerCommand({
  id: TERMINATE_THREAD_ID,
  handler: async (accessor, _, context) => {
    await getThreadAndRun(accessor, context, (thread) => thread.terminate());
  }
});
CommandsRegistry.registerCommand({
  id: JUMP_TO_CURSOR_ID,
  handler: async (accessor) => {
    const debugService = accessor.get(IDebugService);
    const stackFrame = debugService.getViewModel().focusedStackFrame;
    const editorService = accessor.get(IEditorService);
    const activeEditorControl = editorService.activeTextEditorControl;
    const notificationService = accessor.get(INotificationService);
    const quickInputService = accessor.get(IQuickInputService);
    if (stackFrame && isCodeEditor(activeEditorControl) && activeEditorControl.hasModel()) {
      const position = activeEditorControl.getPosition();
      const resource = activeEditorControl.getModel().uri;
      const source = stackFrame.thread.session.getSourceForUri(resource);
      if (source) {
        const response = await stackFrame.thread.session.gotoTargets(source.raw, position.lineNumber, position.column);
        const targets = response?.body.targets;
        if (targets && targets.length) {
          let id = targets[0].id;
          if (targets.length > 1) {
            const picks = targets.map((t) => ({ label: t.label, _id: t.id }));
            const pick = await quickInputService.pick(picks, { placeHolder: nls.localize("chooseLocation", "Choose the specific location") });
            if (!pick) {
              return;
            }
            id = pick._id;
          }
          return await stackFrame.thread.session.goto(stackFrame.thread.threadId, id).catch((e) => notificationService.warn(e));
        }
      }
    }
    return notificationService.warn(nls.localize("noExecutableCode", "No executable code is associated at the current cursor position."));
  }
});
CommandsRegistry.registerCommand({
  id: CALLSTACK_TOP_ID,
  handler: async (accessor, _, context) => {
    const debugService = accessor.get(IDebugService);
    goToTopOfCallStack(debugService);
  }
});
CommandsRegistry.registerCommand({
  id: CALLSTACK_BOTTOM_ID,
  handler: async (accessor, _, context) => {
    const debugService = accessor.get(IDebugService);
    await goToBottomOfCallStack(debugService);
  }
});
CommandsRegistry.registerCommand({
  id: CALLSTACK_UP_ID,
  handler: async (accessor, _, context) => {
    const debugService = accessor.get(IDebugService);
    navigateCallStack(debugService, false);
  }
});
CommandsRegistry.registerCommand({
  id: CALLSTACK_DOWN_ID,
  handler: async (accessor, _, context) => {
    const debugService = accessor.get(IDebugService);
    navigateCallStack(debugService, true);
  }
});
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
  command: {
    id: JUMP_TO_CURSOR_ID,
    title: nls.localize("jumpToCursor", "Jump to Cursor"),
    category: DEBUG_COMMAND_CATEGORY
  },
  when: ContextKeyExpr.and(CONTEXT_JUMP_TO_CURSOR_SUPPORTED, EditorContextKeys.editorTextFocus),
  group: "debug",
  order: 3
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: NEXT_DEBUG_CONSOLE_ID,
  weight: KeybindingWeight.WorkbenchContrib + 1,
  when: CONTEXT_IN_DEBUG_REPL,
  primary: KeyMod.CtrlCmd | KeyCode.PageDown,
  mac: { primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.BracketRight },
  handler: async (accessor, _, context) => {
    changeDebugConsoleFocus(accessor, true);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: PREV_DEBUG_CONSOLE_ID,
  weight: KeybindingWeight.WorkbenchContrib + 1,
  when: CONTEXT_IN_DEBUG_REPL,
  primary: KeyMod.CtrlCmd | KeyCode.PageUp,
  mac: { primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.BracketLeft },
  handler: async (accessor, _, context) => {
    changeDebugConsoleFocus(accessor, false);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: RESTART_SESSION_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.F5,
  when: CONTEXT_IN_DEBUG_MODE,
  handler: async (accessor, _, context) => {
    const debugService = accessor.get(IDebugService);
    const configurationService = accessor.get(IConfigurationService);
    let session;
    if (isSessionContext(context)) {
      session = debugService.getModel().getSession(context.sessionId);
    } else {
      session = debugService.getViewModel().focusedSession;
    }
    if (!session) {
      const { launch, name } = debugService.getConfigurationManager().selectedConfiguration;
      await debugService.startDebugging(launch, name, { noDebug: false, startedByUser: true });
    } else {
      const showSubSessions = configurationService.getValue("debug").showSubSessionsInToolBar;
      while (!showSubSessions && session.lifecycleManagedByParent && session.parentSession) {
        session = session.parentSession;
      }
      session.removeReplExpressions();
      await debugService.restartSession(session);
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: STEP_OVER_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyCode.F10,
  when: CONTEXT_DEBUG_STATE.isEqualTo("stopped"),
  handler: async (accessor, _, context) => {
    const contextKeyService = accessor.get(IContextKeyService);
    if (CONTEXT_DISASSEMBLY_VIEW_FOCUS.getValue(contextKeyService)) {
      await getThreadAndRun(accessor, context, (thread) => thread.next("instruction"));
    } else {
      await getThreadAndRun(accessor, context, (thread) => thread.next());
    }
  }
});
const STEP_INTO_KEYBINDING = isWeb && isWindows ? KeyMod.Alt | KeyCode.F11 : KeyCode.F11;
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: STEP_INTO_ID,
  weight: KeybindingWeight.WorkbenchContrib + 10,
  // Have a stronger weight to have priority over full screen when debugging
  primary: STEP_INTO_KEYBINDING,
  // Use a more flexible when clause to not allow full screen command to take over when F11 pressed a lot of times
  when: CONTEXT_DEBUG_STATE.notEqualsTo("inactive"),
  handler: async (accessor, _, context) => {
    const contextKeyService = accessor.get(IContextKeyService);
    if (CONTEXT_DISASSEMBLY_VIEW_FOCUS.getValue(contextKeyService)) {
      await getThreadAndRun(accessor, context, (thread) => thread.stepIn("instruction"));
    } else {
      await getThreadAndRun(accessor, context, (thread) => thread.stepIn());
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: STEP_OUT_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.Shift | KeyCode.F11,
  when: CONTEXT_DEBUG_STATE.isEqualTo("stopped"),
  handler: async (accessor, _, context) => {
    const contextKeyService = accessor.get(IContextKeyService);
    if (CONTEXT_DISASSEMBLY_VIEW_FOCUS.getValue(contextKeyService)) {
      await getThreadAndRun(accessor, context, (thread) => thread.stepOut("instruction"));
    } else {
      await getThreadAndRun(accessor, context, (thread) => thread.stepOut());
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: PAUSE_ID,
  weight: KeybindingWeight.WorkbenchContrib + 2,
  // take priority over focus next part while we are debugging
  primary: KeyCode.F6,
  when: CONTEXT_DEBUG_STATE.isEqualTo("running"),
  handler: async (accessor, _, context) => {
    await getThreadAndRun(accessor, context, (thread) => thread.pause());
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: STEP_INTO_TARGET_ID,
  primary: STEP_INTO_KEYBINDING | KeyMod.CtrlCmd,
  when: ContextKeyExpr.and(CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo("stopped")),
  weight: KeybindingWeight.WorkbenchContrib,
  handler: async (accessor, _, context) => {
    const quickInputService = accessor.get(IQuickInputService);
    const debugService = accessor.get(IDebugService);
    const session = debugService.getViewModel().focusedSession;
    const frame = debugService.getViewModel().focusedStackFrame;
    if (!frame || !session) {
      return;
    }
    const editor = await accessor.get(IEditorService).openEditor({
      resource: frame.source.uri,
      options: { revealIfOpened: true }
    });
    let codeEditor;
    if (editor) {
      const ctrl = editor?.getControl();
      if (isCodeEditor(ctrl)) {
        codeEditor = ctrl;
      }
    }
    const disposables = new DisposableStore();
    const qp = disposables.add(quickInputService.createQuickPick());
    qp.busy = true;
    qp.show();
    disposables.add(qp.onDidChangeActive(([item]) => {
      if (codeEditor && item && item.target.line !== void 0) {
        codeEditor.revealLineInCenterIfOutsideViewport(item.target.line);
        codeEditor.setSelection({
          startLineNumber: item.target.line,
          startColumn: item.target.column || 1,
          endLineNumber: item.target.endLine || item.target.line,
          endColumn: item.target.endColumn || item.target.column || 1
        });
      }
    }));
    disposables.add(qp.onDidAccept(() => {
      if (qp.activeItems.length) {
        session.stepIn(frame.thread.threadId, qp.activeItems[0].target.id);
      }
    }));
    disposables.add(qp.onDidHide(() => disposables.dispose()));
    session.stepInTargets(frame.frameId).then((targets) => {
      qp.busy = false;
      if (targets?.length) {
        qp.items = targets?.map((target) => ({ target, label: target.label }));
      } else {
        qp.placeholder = nls.localize("editor.debug.action.stepIntoTargets.none", "No step targets available");
      }
    });
  }
});
async function stopHandler(accessor, _, context, disconnect, suspend) {
  const debugService = accessor.get(IDebugService);
  let session;
  if (isSessionContext(context)) {
    session = debugService.getModel().getSession(context.sessionId);
  } else {
    session = debugService.getViewModel().focusedSession;
  }
  const configurationService = accessor.get(IConfigurationService);
  const showSubSessions = configurationService.getValue("debug").showSubSessionsInToolBar;
  while (!showSubSessions && session && session.lifecycleManagedByParent && session.parentSession) {
    session = session.parentSession;
  }
  await debugService.stopSession(session, disconnect, suspend);
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: DISCONNECT_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.Shift | KeyCode.F5,
  when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_IN_DEBUG_MODE),
  handler: (accessor, _, context) => stopHandler(accessor, _, context, true)
});
CommandsRegistry.registerCommand({
  id: DISCONNECT_AND_SUSPEND_ID,
  handler: (accessor, _, context) => stopHandler(accessor, _, context, true, true)
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: STOP_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.Shift | KeyCode.F5,
  when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_IN_DEBUG_MODE),
  handler: (accessor, _, context) => stopHandler(accessor, _, context, false)
});
CommandsRegistry.registerCommand({
  id: RESTART_FRAME_ID,
  handler: async (accessor, _, context) => {
    const debugService = accessor.get(IDebugService);
    const notificationService = accessor.get(INotificationService);
    const frame = getFrame(debugService, context);
    if (frame) {
      try {
        await frame.restart();
      } catch (e) {
        notificationService.error(e);
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CONTINUE_ID,
  weight: KeybindingWeight.WorkbenchContrib + 10,
  // Use a stronger weight to get priority over start debugging F5 shortcut
  primary: KeyCode.F5,
  when: CONTEXT_DEBUG_STATE.isEqualTo("stopped"),
  handler: async (accessor, _, context) => {
    await getThreadAndRun(accessor, context, (thread) => thread.continue());
  }
});
CommandsRegistry.registerCommand({
  id: SHOW_LOADED_SCRIPTS_ID,
  handler: async (accessor) => {
    await showLoadedScriptMenu(accessor);
  }
});
CommandsRegistry.registerCommand({
  id: "debug.startFromConfig",
  handler: async (accessor, config) => {
    const debugService = accessor.get(IDebugService);
    await debugService.startDebugging(void 0, config);
  }
});
CommandsRegistry.registerCommand({
  id: FOCUS_SESSION_ID,
  handler: async (accessor, session) => {
    const debugService = accessor.get(IDebugService);
    const editorService = accessor.get(IEditorService);
    session = resolveChildSession(session, debugService.getModel().getSessions());
    await debugService.focusStackFrame(void 0, void 0, session, { explicit: true });
    const stackFrame = debugService.getViewModel().focusedStackFrame;
    if (stackFrame) {
      await stackFrame.openInEditor(editorService, true);
    }
  }
});
CommandsRegistry.registerCommand({
  id: SELECT_AND_START_ID,
  handler: async (accessor, debugType, debugStartOptions) => {
    const quickInputService = accessor.get(IQuickInputService);
    const debugService = accessor.get(IDebugService);
    if (debugType) {
      const configManager = debugService.getConfigurationManager();
      const dynamicProviders = await configManager.getDynamicProviders();
      for (const provider of dynamicProviders) {
        if (provider.type === debugType) {
          const pick = await provider.pick();
          if (pick) {
            await configManager.selectConfiguration(pick.launch, pick.config.name, pick.config, { type: provider.type });
            debugService.startDebugging(pick.launch, pick.config, { noDebug: debugStartOptions?.noDebug, startedByUser: true });
            return;
          }
        }
      }
    }
    quickInputService.quickAccess.show(DEBUG_QUICK_ACCESS_PREFIX);
  }
});
CommandsRegistry.registerCommand({
  id: SELECT_DEBUG_CONSOLE_ID,
  handler: async (accessor) => {
    const quickInputService = accessor.get(IQuickInputService);
    quickInputService.quickAccess.show(DEBUG_CONSOLE_QUICK_ACCESS_PREFIX);
  }
});
CommandsRegistry.registerCommand({
  id: SELECT_DEBUG_SESSION_ID,
  handler: async (accessor) => {
    showDebugSessionMenu(accessor, SELECT_AND_START_ID);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: DEBUG_START_COMMAND_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyCode.F5,
  when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE.isEqualTo("inactive")),
  handler: async (accessor, debugStartOptions) => {
    const debugService = accessor.get(IDebugService);
    await saveAllBeforeDebugStart(accessor.get(IConfigurationService), accessor.get(IEditorService));
    const { launch, name, getConfig } = debugService.getConfigurationManager().selectedConfiguration;
    const config = await getConfig();
    const configOrName = config ? Object.assign(deepClone(config), debugStartOptions?.config) : name;
    await debugService.startDebugging(launch, configOrName, { noDebug: debugStartOptions?.noDebug, startedByUser: true }, false);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: DEBUG_RUN_COMMAND_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.CtrlCmd | KeyCode.F5,
  mac: { primary: KeyMod.WinCtrl | KeyCode.F5 },
  when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(State.Initializing))),
  handler: async (accessor) => {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand(DEBUG_START_COMMAND_ID, { noDebug: true });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.toggleBreakpoint",
  weight: KeybindingWeight.WorkbenchContrib + 5,
  when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_FOCUSED, InputFocusedContext.toNegated()),
  primary: KeyCode.Space,
  handler: (accessor) => {
    const listService = accessor.get(IListService);
    const debugService = accessor.get(IDebugService);
    const list = listService.lastFocusedList;
    if (list instanceof List) {
      const focused = list.getFocusedElements();
      if (focused && focused.length) {
        debugService.enableOrDisableBreakpoints(!focused[0].enabled, focused[0]);
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.enableOrDisableBreakpoint",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: void 0,
  when: EditorContextKeys.editorTextFocus,
  handler: (accessor) => {
    const debugService = accessor.get(IDebugService);
    const editorService = accessor.get(IEditorService);
    const control = editorService.activeTextEditorControl;
    if (isCodeEditor(control)) {
      const model = control.getModel();
      if (model) {
        const position = control.getPosition();
        if (position) {
          const bps = debugService.getModel().getBreakpoints({ uri: model.uri, lineNumber: position.lineNumber });
          if (bps.length) {
            debugService.enableOrDisableBreakpoints(!bps[0].enabled, bps[0]);
          }
        }
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: EDIT_EXPRESSION_COMMAND_ID,
  weight: KeybindingWeight.WorkbenchContrib + 5,
  when: CONTEXT_WATCH_EXPRESSIONS_FOCUSED,
  primary: KeyCode.F2,
  mac: { primary: KeyCode.Enter },
  handler: (accessor, expression) => {
    const debugService = accessor.get(IDebugService);
    if (!(expression instanceof Expression)) {
      const listService = accessor.get(IListService);
      const focused = listService.lastFocusedList;
      if (focused) {
        const elements = focused.getFocus();
        if (Array.isArray(elements) && elements[0] instanceof Expression) {
          expression = elements[0];
        }
      }
    }
    if (expression instanceof Expression) {
      debugService.getViewModel().setSelectedExpression(expression, false);
    }
  }
});
CommandsRegistry.registerCommand({
  id: SET_EXPRESSION_COMMAND_ID,
  handler: async (accessor, expression) => {
    const debugService = accessor.get(IDebugService);
    if (expression instanceof Expression || expression instanceof Variable) {
      debugService.getViewModel().setSelectedExpression(expression, true);
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.setVariable",
  weight: KeybindingWeight.WorkbenchContrib + 5,
  when: CONTEXT_VARIABLES_FOCUSED,
  primary: KeyCode.F2,
  mac: { primary: KeyCode.Enter },
  handler: (accessor) => {
    const listService = accessor.get(IListService);
    const debugService = accessor.get(IDebugService);
    const focused = listService.lastFocusedList;
    if (focused) {
      const elements = focused.getFocus();
      if (Array.isArray(elements) && elements[0] instanceof Variable) {
        debugService.getViewModel().setSelectedExpression(elements[0], false);
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: REMOVE_EXPRESSION_COMMAND_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(CONTEXT_WATCH_EXPRESSIONS_FOCUSED, CONTEXT_EXPRESSION_SELECTED.toNegated()),
  primary: KeyCode.Delete,
  mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
  handler: (accessor, expression) => {
    const debugService = accessor.get(IDebugService);
    if (expression instanceof Expression) {
      debugService.removeWatchExpressions(expression.getId());
      return;
    }
    const listService = accessor.get(IListService);
    const focused = listService.lastFocusedList;
    if (focused) {
      let elements = focused.getFocus();
      if (Array.isArray(elements) && elements[0] instanceof Expression) {
        const selection = focused.getSelection();
        if (selection && selection.indexOf(elements[0]) >= 0) {
          elements = selection;
        }
        elements.forEach((e) => debugService.removeWatchExpressions(e.getId()));
      }
    }
  }
});
CommandsRegistry.registerCommand({
  id: BREAK_WHEN_VALUE_CHANGES_ID,
  handler: async (accessor) => {
    const debugService = accessor.get(IDebugService);
    if (dataBreakpointInfoResponse) {
      await debugService.addDataBreakpoint({ description: dataBreakpointInfoResponse.description, src: { type: DataBreakpointSetType.Variable, dataId: dataBreakpointInfoResponse.dataId }, canPersist: !!dataBreakpointInfoResponse.canPersist, accessTypes: dataBreakpointInfoResponse.accessTypes, accessType: "write" });
    }
  }
});
CommandsRegistry.registerCommand({
  id: BREAK_WHEN_VALUE_IS_ACCESSED_ID,
  handler: async (accessor) => {
    const debugService = accessor.get(IDebugService);
    if (dataBreakpointInfoResponse) {
      await debugService.addDataBreakpoint({ description: dataBreakpointInfoResponse.description, src: { type: DataBreakpointSetType.Variable, dataId: dataBreakpointInfoResponse.dataId }, canPersist: !!dataBreakpointInfoResponse.canPersist, accessTypes: dataBreakpointInfoResponse.accessTypes, accessType: "readWrite" });
    }
  }
});
CommandsRegistry.registerCommand({
  id: BREAK_WHEN_VALUE_IS_READ_ID,
  handler: async (accessor) => {
    const debugService = accessor.get(IDebugService);
    if (dataBreakpointInfoResponse) {
      await debugService.addDataBreakpoint({ description: dataBreakpointInfoResponse.description, src: { type: DataBreakpointSetType.Variable, dataId: dataBreakpointInfoResponse.dataId }, canPersist: !!dataBreakpointInfoResponse.canPersist, accessTypes: dataBreakpointInfoResponse.accessTypes, accessType: "read" });
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.removeBreakpoint",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_FOCUSED, CONTEXT_BREAKPOINT_INPUT_FOCUSED.toNegated()),
  primary: KeyCode.Delete,
  mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
  handler: (accessor) => {
    const listService = accessor.get(IListService);
    const debugService = accessor.get(IDebugService);
    const list = listService.lastFocusedList;
    if (list instanceof List) {
      const focused = list.getFocusedElements();
      const element = focused.length ? focused[0] : void 0;
      if (element instanceof Breakpoint) {
        debugService.removeBreakpoints(element.getId());
      } else if (element instanceof FunctionBreakpoint) {
        debugService.removeFunctionBreakpoints(element.getId());
      } else if (element instanceof DataBreakpoint) {
        debugService.removeDataBreakpoints(element.getId());
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.installAdditionalDebuggers",
  weight: KeybindingWeight.WorkbenchContrib,
  when: void 0,
  primary: void 0,
  handler: async (accessor, query) => {
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    let searchFor = `@category:debuggers`;
    if (typeof query === "string") {
      searchFor += ` ${query}`;
    }
    return extensionsWorkbenchService.openSearch(searchFor);
  }
});
registerAction2(class AddConfigurationAction extends Action2 {
  constructor() {
    super({
      id: ADD_CONFIGURATION_ID,
      title: nls.localize2("addConfiguration", "Add Configuration..."),
      category: DEBUG_COMMAND_CATEGORY,
      f1: true,
      menu: {
        id: MenuId.EditorContent,
        when: ContextKeyExpr.and(
          ContextKeyExpr.regex(ResourceContextKey.Path.key, /\.vscode[/\\]launch\.json$/),
          ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID)
        )
      }
    });
  }
  async run(accessor, launchUri) {
    const manager = accessor.get(IDebugService).getConfigurationManager();
    const launch = manager.getLaunches().find((l) => l.uri.toString() === launchUri) || manager.selectedConfiguration.launch;
    if (launch) {
      const { editor, created } = await launch.openConfigFile({ preserveFocus: false });
      if (editor && !created) {
        const codeEditor = editor.getControl();
        if (codeEditor) {
          await codeEditor.getContribution(EDITOR_CONTRIBUTION_ID)?.addLaunchConfiguration();
        }
      }
    }
  }
});
const inlineBreakpointHandler = (accessor) => {
  const debugService = accessor.get(IDebugService);
  const editorService = accessor.get(IEditorService);
  const control = editorService.activeTextEditorControl;
  if (isCodeEditor(control)) {
    const position = control.getPosition();
    if (position && control.hasModel() && debugService.canSetBreakpointsIn(control.getModel())) {
      const modelUri = control.getModel().uri;
      const breakpointAlreadySet = debugService.getModel().getBreakpoints({ lineNumber: position.lineNumber, uri: modelUri }).some((bp) => bp.sessionAgnosticData.column === position.column || !bp.column && position.column <= 1);
      if (!breakpointAlreadySet) {
        debugService.addBreakpoints(modelUri, [{ lineNumber: position.lineNumber, column: position.column > 1 ? position.column : void 0 }]);
      }
    }
  }
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.Shift | KeyCode.F9,
  when: EditorContextKeys.editorTextFocus,
  id: TOGGLE_INLINE_BREAKPOINT_ID,
  handler: inlineBreakpointHandler
});
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
  command: {
    id: TOGGLE_INLINE_BREAKPOINT_ID,
    title: nls.localize("addInlineBreakpoint", "Add Inline Breakpoint"),
    category: DEBUG_COMMAND_CATEGORY
  },
  when: ContextKeyExpr.and(
    CONTEXT_IN_DEBUG_MODE,
    PanelFocusContext.toNegated(),
    EditorContextKeys.editorTextFocus,
    ChatContextKeys.inChatSession.toNegated()
  ),
  group: "debug",
  order: 1
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.openBreakpointToSide",
  weight: KeybindingWeight.WorkbenchContrib,
  when: CONTEXT_BREAKPOINTS_FOCUSED,
  primary: KeyMod.CtrlCmd | KeyCode.Enter,
  secondary: [KeyMod.Alt | KeyCode.Enter],
  handler: (accessor) => {
    const listService = accessor.get(IListService);
    const list = listService.lastFocusedList;
    if (list instanceof List) {
      const focus = list.getFocusedElements();
      if (focus.length && focus[0] instanceof Breakpoint) {
        return openBreakpointSource(focus[0], true, false, true, accessor.get(IDebugService), accessor.get(IEditorService));
      }
    }
    return void 0;
  }
});
registerAction2(class ToggleExceptionBreakpointsAction extends Action2 {
  constructor() {
    super({
      id: TOGGLE_EXCEPTION_BREAKPOINTS_ID,
      title: nls.localize2("toggleExceptionBreakpoints", "Toggle Exception Breakpoints"),
      category: DEBUG_COMMAND_CATEGORY,
      f1: true,
      precondition: CONTEXT_DEBUGGERS_AVAILABLE
    });
  }
  async run(accessor) {
    const debugService = accessor.get(IDebugService);
    const quickInputService = accessor.get(IQuickInputService);
    const debugModel = debugService.getModel();
    const session = debugService.getViewModel().focusedSession || debugModel.getSessions()[0];
    const exceptionBreakpoints = session ? debugModel.getExceptionBreakpointsForSession(session.getId()) : debugModel.getExceptionBreakpoints();
    if (exceptionBreakpoints.length === 0) {
      return;
    }
    if (exceptionBreakpoints.length === 1) {
      const breakpoint = exceptionBreakpoints[0];
      await debugService.enableOrDisableBreakpoints(!breakpoint.enabled, breakpoint);
      return;
    }
    const disposables = new DisposableStore();
    const quickPick = disposables.add(quickInputService.createQuickPick());
    quickPick.placeholder = nls.localize("selectExceptionBreakpointsPlaceholder", "Pick enabled exception breakpoints");
    quickPick.canSelectMany = true;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.items = exceptionBreakpoints.map((bp) => ({
      label: bp.label,
      description: bp.description,
      picked: bp.enabled,
      breakpoint: bp
    }));
    quickPick.selectedItems = quickPick.items.filter((item) => item.picked);
    disposables.add(quickPick.onDidAccept(() => {
      const selectedItems = quickPick.selectedItems;
      const toEnable = [];
      const toDisable = [];
      for (const bp of exceptionBreakpoints) {
        const isSelected = selectedItems.some((item) => item.breakpoint === bp);
        if (isSelected && !bp.enabled) {
          toEnable.push(bp);
        } else if (!isSelected && bp.enabled) {
          toDisable.push(bp);
        }
      }
      const promises = [];
      for (const bp of toEnable) {
        promises.push(debugService.enableOrDisableBreakpoints(true, bp));
      }
      for (const bp of toDisable) {
        promises.push(debugService.enableOrDisableBreakpoints(false, bp));
      }
      Promise.all(promises).then(() => disposables.dispose());
    }));
    disposables.add(quickPick.onDidHide(() => disposables.dispose()));
    quickPick.show();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "debug.openView",
  weight: KeybindingWeight.WorkbenchContrib,
  when: CONTEXT_DEBUGGERS_AVAILABLE.toNegated(),
  primary: KeyCode.F5,
  secondary: [KeyMod.CtrlCmd | KeyCode.F5],
  handler: async (accessor) => {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    await paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: ATTACH_TO_CURRENT_CODE_RENDERER,
      title: nls.localize2("attachToCurrentCodeRenderer", "Attach to Current Code Renderer")
    });
  }
  async run(accessor) {
    const env = accessor.get(IEnvironmentService);
    if (!env.isExtensionDevelopment && !env.extensionTestsLocationURI) {
      throw new Error("Refusing to attach to renderer outside of development context");
    }
    const windowId = getWindowId(mainWindow);
    const extDebugService = accessor.get(IExtensionHostDebugService);
    const result = await extDebugService.attachToCurrentWindowRenderer(windowId);
    return result;
  }
});
export {
  ADD_CONFIGURATION_ID,
  ADD_TO_WATCH_ID,
  ADD_TO_WATCH_LABEL,
  ATTACH_TO_CURRENT_CODE_RENDERER,
  BREAK_WHEN_VALUE_CHANGES_ID,
  BREAK_WHEN_VALUE_IS_ACCESSED_ID,
  BREAK_WHEN_VALUE_IS_READ_ID,
  CALLSTACK_BOTTOM_ID,
  CALLSTACK_BOTTOM_LABEL,
  CALLSTACK_DOWN_ID,
  CALLSTACK_DOWN_LABEL,
  CALLSTACK_TOP_ID,
  CALLSTACK_TOP_LABEL,
  CALLSTACK_UP_ID,
  CALLSTACK_UP_LABEL,
  CONTINUE_ID,
  CONTINUE_LABEL,
  COPY_ADDRESS_ID,
  COPY_ADDRESS_LABEL,
  COPY_EVALUATE_PATH_ID,
  COPY_EVALUATE_PATH_LABEL,
  COPY_STACK_TRACE_ID,
  COPY_VALUE_ID,
  COPY_VALUE_LABEL,
  COPY_WATCH_EXPRESSION_COMMAND_ID,
  DEBUG_COMMAND_CATEGORY,
  DEBUG_CONFIGURE_COMMAND_ID,
  DEBUG_CONFIGURE_LABEL,
  DEBUG_CONSOLE_QUICK_ACCESS_PREFIX,
  DEBUG_QUICK_ACCESS_PREFIX,
  DEBUG_RUN_COMMAND_ID,
  DEBUG_RUN_LABEL,
  DEBUG_START_COMMAND_ID,
  DEBUG_START_LABEL,
  DISCONNECT_AND_SUSPEND_ID,
  DISCONNECT_AND_SUSPEND_LABEL,
  DISCONNECT_ID,
  DISCONNECT_LABEL,
  EDIT_EXPRESSION_COMMAND_ID,
  FOCUS_REPL_ID,
  FOCUS_SESSION_ID,
  FOCUS_SESSION_LABEL,
  JUMP_TO_CURSOR_ID,
  NEXT_DEBUG_CONSOLE_ID,
  NEXT_DEBUG_CONSOLE_LABEL,
  OPEN_LOADED_SCRIPTS_LABEL,
  PAUSE_ID,
  PAUSE_LABEL,
  PREV_DEBUG_CONSOLE_ID,
  PREV_DEBUG_CONSOLE_LABEL,
  REMOVE_EXPRESSION_COMMAND_ID,
  RESTART_FRAME_ID,
  RESTART_LABEL,
  RESTART_SESSION_ID,
  REVERSE_CONTINUE_ID,
  SELECT_AND_START_ID,
  SELECT_AND_START_LABEL,
  SELECT_DEBUG_CONSOLE_ID,
  SELECT_DEBUG_CONSOLE_LABEL,
  SELECT_DEBUG_SESSION_ID,
  SELECT_DEBUG_SESSION_LABEL,
  SET_EXPRESSION_COMMAND_ID,
  SHOW_LOADED_SCRIPTS_ID,
  STEP_BACK_ID,
  STEP_INTO_ID,
  STEP_INTO_LABEL,
  STEP_INTO_TARGET_ID,
  STEP_INTO_TARGET_LABEL,
  STEP_OUT_ID,
  STEP_OUT_LABEL,
  STEP_OVER_ID,
  STEP_OVER_LABEL,
  STOP_ID,
  STOP_LABEL,
  TERMINATE_THREAD_ID,
  TOGGLE_BREAKPOINT_ID,
  TOGGLE_EXCEPTION_BREAKPOINTS_ID,
  TOGGLE_INLINE_BREAKPOINT_ID,
  setDataBreakpointInfoResponse
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdDb21tYW5kcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldFdpbmRvd0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGVlcENsb25lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBpc1dlYiwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIGlzQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJbnB1dEZvY3VzZWRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWJ1Zy9jb21tb24vZXh0ZW5zaW9uSG9zdERlYnVnLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgQWN0aXZlRWRpdG9yQ29udGV4dCwgUGFuZWxGb2N1c0NvbnRleHQsIFJlc291cmNlQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVEVYVF9GSUxFX0VESVRPUl9JRCB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0JSRUFLUE9JTlRfSU5QVVRfRk9DVVNFRCwgQ09OVEVYVF9CUkVBS1BPSU5UU19GT0NVU0VELCBDT05URVhUX0RFQlVHX1NUQVRFLCBDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEUsIENPTlRFWFRfRElTQVNTRU1CTFlfVklFV19GT0NVUywgQ09OVEVYVF9FWFBSRVNTSU9OX1NFTEVDVEVELCBDT05URVhUX0ZPQ1VTRURfU0VTU0lPTl9JU19BVFRBQ0gsIENPTlRFWFRfSU5fREVCVUdfTU9ERSwgQ09OVEVYVF9JTl9ERUJVR19SRVBMLCBDT05URVhUX0pVTVBfVE9fQ1VSU09SX1NVUFBPUlRFRCwgQ09OVEVYVF9TVEVQX0lOVE9fVEFSR0VUU19TVVBQT1JURUQsIENPTlRFWFRfVkFSSUFCTEVTX0ZPQ1VTRUQsIENPTlRFWFRfV0FUQ0hfRVhQUkVTU0lPTlNfRk9DVVNFRCwgRGF0YUJyZWFrcG9pbnRTZXRUeXBlLCBFRElUT1JfQ09OVFJJQlVUSU9OX0lELCBnZXRTdGF0ZUxhYmVsLCBJQ29uZmlnLCBJRGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UsIElEZWJ1Z0NvbmZpZ3VyYXRpb24sIElEZWJ1Z0VkaXRvckNvbnRyaWJ1dGlvbiwgSURlYnVnU2VydmljZSwgSURlYnVnU2Vzc2lvbiwgSUVuYWJsZW1lbnQsIElFeGNlcHRpb25CcmVha3BvaW50LCBpc0ZyYW1lRGVlbXBoYXNpemVkLCBJU3RhY2tGcmFtZSwgSVRocmVhZCwgUkVQTF9WSUVXX0lELCBTdGF0ZSwgVklFV0xFVF9JRCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBCcmVha3BvaW50LCBEYXRhQnJlYWtwb2ludCwgRXhwcmVzc2lvbiwgRnVuY3Rpb25CcmVha3BvaW50LCBUaHJlYWQsIFZhcmlhYmxlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnTW9kZWwuanMnO1xuaW1wb3J0IHsgc2F2ZUFsbEJlZm9yZURlYnVnU3RhcnQsIHJlc29sdmVDaGlsZFNlc3Npb24gfSBmcm9tICcuLi9jb21tb24vZGVidWdVdGlscy5qcyc7XG5pbXBvcnQgeyBzaG93TG9hZGVkU2NyaXB0TWVudSB9IGZyb20gJy4uL2NvbW1vbi9sb2FkZWRTY3JpcHRzUGlja2VyLmpzJztcbmltcG9ydCB7IG9wZW5CcmVha3BvaW50U291cmNlIH0gZnJvbSAnLi9icmVha3BvaW50c1ZpZXcuanMnO1xuaW1wb3J0IHsgc2hvd0RlYnVnU2Vzc2lvbk1lbnUgfSBmcm9tICcuL2RlYnVnU2Vzc2lvblBpY2tlci5qcyc7XG5cbmV4cG9ydCBjb25zdCBBRERfQ09ORklHVVJBVElPTl9JRCA9ICdkZWJ1Zy5hZGRDb25maWd1cmF0aW9uJztcbmV4cG9ydCBjb25zdCBDT1BZX0FERFJFU1NfSUQgPSAnZWRpdG9yLmRlYnVnLmFjdGlvbi5jb3B5QWRkcmVzcyc7XG5leHBvcnQgY29uc3QgVE9HR0xFX0JSRUFLUE9JTlRfSUQgPSAnZWRpdG9yLmRlYnVnLmFjdGlvbi50b2dnbGVCcmVha3BvaW50JztcbmV4cG9ydCBjb25zdCBUT0dHTEVfSU5MSU5FX0JSRUFLUE9JTlRfSUQgPSAnZWRpdG9yLmRlYnVnLmFjdGlvbi50b2dnbGVJbmxpbmVCcmVha3BvaW50JztcbmV4cG9ydCBjb25zdCBDT1BZX1NUQUNLX1RSQUNFX0lEID0gJ2RlYnVnLmNvcHlTdGFja1RyYWNlJztcbmV4cG9ydCBjb25zdCBSRVZFUlNFX0NPTlRJTlVFX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcucmV2ZXJzZUNvbnRpbnVlJztcbmV4cG9ydCBjb25zdCBTVEVQX0JBQ0tfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5zdGVwQmFjayc7XG5leHBvcnQgY29uc3QgUkVTVEFSVF9TRVNTSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcucmVzdGFydCc7XG5leHBvcnQgY29uc3QgVEVSTUlOQVRFX1RIUkVBRF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnRlcm1pbmF0ZVRocmVhZCc7XG5leHBvcnQgY29uc3QgU1RFUF9PVkVSX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc3RlcE92ZXInO1xuZXhwb3J0IGNvbnN0IFNURVBfSU5UT19JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnN0ZXBJbnRvJztcbmV4cG9ydCBjb25zdCBTVEVQX0lOVE9fVEFSR0VUX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc3RlcEludG9UYXJnZXQnO1xuZXhwb3J0IGNvbnN0IFNURVBfT1VUX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc3RlcE91dCc7XG5leHBvcnQgY29uc3QgUEFVU0VfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5wYXVzZSc7XG5leHBvcnQgY29uc3QgRElTQ09OTkVDVF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLmRpc2Nvbm5lY3QnO1xuZXhwb3J0IGNvbnN0IERJU0NPTk5FQ1RfQU5EX1NVU1BFTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5kaXNjb25uZWN0QW5kU3VzcGVuZCc7XG5leHBvcnQgY29uc3QgU1RPUF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnN0b3AnO1xuZXhwb3J0IGNvbnN0IFJFU1RBUlRfRlJBTUVfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5yZXN0YXJ0RnJhbWUnO1xuZXhwb3J0IGNvbnN0IENPTlRJTlVFX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuY29udGludWUnO1xuZXhwb3J0IGNvbnN0IEZPQ1VTX1JFUExfSUQgPSAnd29ya2JlbmNoLmRlYnVnLmFjdGlvbi5mb2N1c1JlcGwnO1xuZXhwb3J0IGNvbnN0IEpVTVBfVE9fQ1VSU09SX0lEID0gJ2RlYnVnLmp1bXBUb0N1cnNvcic7XG5leHBvcnQgY29uc3QgRk9DVVNfU0VTU0lPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLmZvY3VzUHJvY2Vzcyc7XG5leHBvcnQgY29uc3QgU0VMRUNUX0FORF9TVEFSVF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnNlbGVjdGFuZHN0YXJ0JztcbmV4cG9ydCBjb25zdCBTRUxFQ1RfREVCVUdfQ09OU09MRV9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnNlbGVjdERlYnVnQ29uc29sZSc7XG5leHBvcnQgY29uc3QgU0VMRUNUX0RFQlVHX1NFU1NJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5zZWxlY3REZWJ1Z1Nlc3Npb24nO1xuZXhwb3J0IGNvbnN0IERFQlVHX0NPTkZJR1VSRV9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuY29uZmlndXJlJztcbmV4cG9ydCBjb25zdCBERUJVR19TVEFSVF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc3RhcnQnO1xuZXhwb3J0IGNvbnN0IERFQlVHX1JVTl9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcucnVuJztcbmV4cG9ydCBjb25zdCBFRElUX0VYUFJFU1NJT05fQ09NTUFORF9JRCA9ICdkZWJ1Zy5yZW5hbWVXYXRjaEV4cHJlc3Npb24nO1xuZXhwb3J0IGNvbnN0IENPUFlfV0FUQ0hfRVhQUkVTU0lPTl9DT01NQU5EX0lEID0gJ2RlYnVnLmNvcHlXYXRjaEV4cHJlc3Npb24nO1xuZXhwb3J0IGNvbnN0IFNFVF9FWFBSRVNTSU9OX0NPTU1BTkRfSUQgPSAnZGVidWcuc2V0V2F0Y2hFeHByZXNzaW9uJztcbmV4cG9ydCBjb25zdCBSRU1PVkVfRVhQUkVTU0lPTl9DT01NQU5EX0lEID0gJ2RlYnVnLnJlbW92ZVdhdGNoRXhwcmVzc2lvbic7XG5leHBvcnQgY29uc3QgTkVYVF9ERUJVR19DT05TT0xFX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcubmV4dENvbnNvbGUnO1xuZXhwb3J0IGNvbnN0IFBSRVZfREVCVUdfQ09OU09MRV9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnByZXZDb25zb2xlJztcbmV4cG9ydCBjb25zdCBTSE9XX0xPQURFRF9TQ1JJUFRTX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc2hvd0xvYWRlZFNjcmlwdHMnO1xuZXhwb3J0IGNvbnN0IENBTExTVEFDS19UT1BfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5jYWxsU3RhY2tUb3AnO1xuZXhwb3J0IGNvbnN0IENBTExTVEFDS19CT1RUT01fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5jYWxsU3RhY2tCb3R0b20nO1xuZXhwb3J0IGNvbnN0IENBTExTVEFDS19VUF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLmNhbGxTdGFja1VwJztcbmV4cG9ydCBjb25zdCBDQUxMU1RBQ0tfRE9XTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLmNhbGxTdGFja0Rvd24nO1xuZXhwb3J0IGNvbnN0IEFERF9UT19XQVRDSF9JRCA9ICdkZWJ1Zy5hZGRUb1dhdGNoRXhwcmVzc2lvbnMnO1xuZXhwb3J0IGNvbnN0IENPUFlfRVZBTFVBVEVfUEFUSF9JRCA9ICdkZWJ1Zy5jb3B5RXZhbHVhdGVQYXRoJztcbmV4cG9ydCBjb25zdCBDT1BZX1ZBTFVFX0lEID0gJ3dvcmtiZW5jaC5kZWJ1Zy52aWV3bGV0LmFjdGlvbi5jb3B5VmFsdWUnO1xuZXhwb3J0IGNvbnN0IEJSRUFLX1dIRU5fVkFMVUVfQ0hBTkdFU19JRCA9ICdkZWJ1Zy5icmVha1doZW5WYWx1ZUNoYW5nZXMnO1xuZXhwb3J0IGNvbnN0IEJSRUFLX1dIRU5fVkFMVUVfSVNfQUNDRVNTRURfSUQgPSAnZGVidWcuYnJlYWtXaGVuVmFsdWVJc0FjY2Vzc2VkJztcbmV4cG9ydCBjb25zdCBCUkVBS19XSEVOX1ZBTFVFX0lTX1JFQURfSUQgPSAnZGVidWcuYnJlYWtXaGVuVmFsdWVJc1JlYWQnO1xuZXhwb3J0IGNvbnN0IFRPR0dMRV9FWENFUFRJT05fQlJFQUtQT0lOVFNfSUQgPSAnZGVidWcudG9nZ2xlRXhjZXB0aW9uQnJlYWtwb2ludHMnO1xuZXhwb3J0IGNvbnN0IEFUVEFDSF9UT19DVVJSRU5UX0NPREVfUkVOREVSRVIgPSAnZGVidWcuYXR0YWNoVG9DdXJyZW50Q29kZVJlbmRlcmVyJztcblxuZXhwb3J0IGNvbnN0IERFQlVHX0NPTU1BTkRfQ0FURUdPUlk6IElMb2NhbGl6ZWRTdHJpbmcgPSBubHMubG9jYWxpemUyKCdkZWJ1ZycsICdEZWJ1ZycpO1xuZXhwb3J0IGNvbnN0IFJFU1RBUlRfTEFCRUwgPSBubHMubG9jYWxpemUyKCdyZXN0YXJ0RGVidWcnLCBcIlJlc3RhcnRcIik7XG5leHBvcnQgY29uc3QgU1RFUF9PVkVSX0xBQkVMID0gbmxzLmxvY2FsaXplMignc3RlcE92ZXJEZWJ1ZycsIFwiU3RlcCBPdmVyXCIpO1xuZXhwb3J0IGNvbnN0IFNURVBfSU5UT19MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ3N0ZXBJbnRvRGVidWcnLCBcIlN0ZXAgSW50b1wiKTtcbmV4cG9ydCBjb25zdCBTVEVQX0lOVE9fVEFSR0VUX0xBQkVMID0gbmxzLmxvY2FsaXplMignc3RlcEludG9UYXJnZXREZWJ1ZycsIFwiU3RlcCBJbnRvIFRhcmdldFwiKTtcbmV4cG9ydCBjb25zdCBTVEVQX09VVF9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ3N0ZXBPdXREZWJ1ZycsIFwiU3RlcCBPdXRcIik7XG5leHBvcnQgY29uc3QgUEFVU0VfTEFCRUwgPSBubHMubG9jYWxpemUyKCdwYXVzZURlYnVnJywgXCJQYXVzZVwiKTtcbmV4cG9ydCBjb25zdCBESVNDT05ORUNUX0xBQkVMID0gbmxzLmxvY2FsaXplMignZGlzY29ubmVjdCcsIFwiRGlzY29ubmVjdFwiKTtcbmV4cG9ydCBjb25zdCBESVNDT05ORUNUX0FORF9TVVNQRU5EX0xBQkVMID0gbmxzLmxvY2FsaXplMignZGlzY29ubmVjdFN1c3BlbmQnLCBcIkRpc2Nvbm5lY3QgYW5kIFN1c3BlbmRcIik7XG5leHBvcnQgY29uc3QgU1RPUF9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ3N0b3AnLCBcIlN0b3BcIik7XG5leHBvcnQgY29uc3QgQ09OVElOVUVfTEFCRUwgPSBubHMubG9jYWxpemUyKCdjb250aW51ZURlYnVnJywgXCJDb250aW51ZVwiKTtcbmV4cG9ydCBjb25zdCBGT0NVU19TRVNTSU9OX0xBQkVMID0gbmxzLmxvY2FsaXplMignZm9jdXNTZXNzaW9uJywgXCJGb2N1cyBTZXNzaW9uXCIpO1xuZXhwb3J0IGNvbnN0IFNFTEVDVF9BTkRfU1RBUlRfTEFCRUwgPSBubHMubG9jYWxpemUyKCdzZWxlY3RBbmRTdGFydERlYnVnZ2luZycsIFwiU2VsZWN0IGFuZCBTdGFydCBEZWJ1Z2dpbmdcIik7XG5leHBvcnQgY29uc3QgREVCVUdfQ09ORklHVVJFX0xBQkVMID0gbmxzLmxvY2FsaXplKCdvcGVuTGF1bmNoSnNvbicsIFwiT3BlbiAnezB9J1wiLCAnbGF1bmNoLmpzb24nKTtcbmV4cG9ydCBjb25zdCBERUJVR19TVEFSVF9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ3N0YXJ0RGVidWcnLCBcIlN0YXJ0IERlYnVnZ2luZ1wiKTtcbmV4cG9ydCBjb25zdCBERUJVR19SVU5fTEFCRUwgPSBubHMubG9jYWxpemUyKCdzdGFydFdpdGhvdXREZWJ1Z2dpbmcnLCBcIlN0YXJ0IFdpdGhvdXQgRGVidWdnaW5nXCIpO1xuZXhwb3J0IGNvbnN0IE5FWFRfREVCVUdfQ09OU09MRV9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ25leHREZWJ1Z0NvbnNvbGUnLCBcIkZvY3VzIE5leHQgRGVidWcgQ29uc29sZVwiKTtcbmV4cG9ydCBjb25zdCBQUkVWX0RFQlVHX0NPTlNPTEVfTEFCRUwgPSBubHMubG9jYWxpemUyKCdwcmV2RGVidWdDb25zb2xlJywgXCJGb2N1cyBQcmV2aW91cyBEZWJ1ZyBDb25zb2xlXCIpO1xuZXhwb3J0IGNvbnN0IE9QRU5fTE9BREVEX1NDUklQVFNfTEFCRUwgPSBubHMubG9jYWxpemUyKCdvcGVuTG9hZGVkU2NyaXB0JywgXCJPcGVuIExvYWRlZCBTY3JpcHQuLi5cIik7XG5leHBvcnQgY29uc3QgQ0FMTFNUQUNLX1RPUF9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ2NhbGxTdGFja1RvcCcsIFwiTmF2aWdhdGUgdG8gVG9wIG9mIENhbGwgU3RhY2tcIik7XG5leHBvcnQgY29uc3QgQ0FMTFNUQUNLX0JPVFRPTV9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ2NhbGxTdGFja0JvdHRvbScsIFwiTmF2aWdhdGUgdG8gQm90dG9tIG9mIENhbGwgU3RhY2tcIik7XG5leHBvcnQgY29uc3QgQ0FMTFNUQUNLX1VQX0xBQkVMID0gbmxzLmxvY2FsaXplMignY2FsbFN0YWNrVXAnLCBcIk5hdmlnYXRlIFVwIENhbGwgU3RhY2tcIik7XG5leHBvcnQgY29uc3QgQ0FMTFNUQUNLX0RPV05fTEFCRUwgPSBubHMubG9jYWxpemUyKCdjYWxsU3RhY2tEb3duJywgXCJOYXZpZ2F0ZSBEb3duIENhbGwgU3RhY2tcIik7XG5leHBvcnQgY29uc3QgQ09QWV9FVkFMVUFURV9QQVRIX0xBQkVMID0gbmxzLmxvY2FsaXplMignY29weUFzRXhwcmVzc2lvbicsIFwiQ29weSBhcyBFeHByZXNzaW9uXCIpO1xuZXhwb3J0IGNvbnN0IENPUFlfVkFMVUVfTEFCRUwgPSBubHMubG9jYWxpemUyKCdjb3B5VmFsdWUnLCBcIkNvcHkgVmFsdWVcIik7XG5leHBvcnQgY29uc3QgQ09QWV9BRERSRVNTX0xBQkVMID0gbmxzLmxvY2FsaXplMignY29weUFkZHJlc3MnLCBcIkNvcHkgQWRkcmVzc1wiKTtcbmV4cG9ydCBjb25zdCBBRERfVE9fV0FUQ0hfTEFCRUwgPSBubHMubG9jYWxpemUyKCdhZGRUb1dhdGNoRXhwcmVzc2lvbnMnLCBcIkFkZCB0byBXYXRjaFwiKTtcblxuZXhwb3J0IGNvbnN0IFNFTEVDVF9ERUJVR19DT05TT0xFX0xBQkVMID0gbmxzLmxvY2FsaXplMignc2VsZWN0RGVidWdDb25zb2xlJywgXCJTZWxlY3QgRGVidWcgQ29uc29sZVwiKTtcbmV4cG9ydCBjb25zdCBTRUxFQ1RfREVCVUdfU0VTU0lPTl9MQUJFTCA9IG5scy5sb2NhbGl6ZTIoJ3NlbGVjdERlYnVnU2Vzc2lvbicsIFwiU2VsZWN0IERlYnVnIFNlc3Npb25cIik7XG5cbmV4cG9ydCBjb25zdCBERUJVR19RVUlDS19BQ0NFU1NfUFJFRklYID0gJ2RlYnVnICc7XG5leHBvcnQgY29uc3QgREVCVUdfQ09OU09MRV9RVUlDS19BQ0NFU1NfUFJFRklYID0gJ2RlYnVnIGNvbnNvbGVzICc7XG5cbmxldCBkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZTogSURhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlIHwgdW5kZWZpbmVkO1xuXG5leHBvcnQgZnVuY3Rpb24gc2V0RGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UocmVzcDogSURhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlIHwgdW5kZWZpbmVkKSB7XG5cdGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlID0gcmVzcDtcbn1cblxuaW50ZXJmYWNlIENhbGxTdGFja0NvbnRleHQge1xuXHRzZXNzaW9uSWQ6IHN0cmluZztcblx0dGhyZWFkSWQ6IHN0cmluZztcblx0ZnJhbWVJZDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBpc1RocmVhZENvbnRleHQob2JqOiBhbnkpOiBvYmogaXMgQ2FsbFN0YWNrQ29udGV4dCB7XG5cdHJldHVybiBvYmogJiYgdHlwZW9mIG9iai5zZXNzaW9uSWQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBvYmoudGhyZWFkSWQgPT09ICdzdHJpbmcnO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRUaHJlYWRBbmRSdW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlc3Npb25BbmRUaHJlYWRJZDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24sIHJ1bjogKHRocmVhZDogSVRocmVhZCkgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdGxldCB0aHJlYWQ6IElUaHJlYWQgfCB1bmRlZmluZWQ7XG5cdGlmIChpc1RocmVhZENvbnRleHQoc2Vzc2lvbkFuZFRocmVhZElkKSkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9uKHNlc3Npb25BbmRUaHJlYWRJZC5zZXNzaW9uSWQpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHR0aHJlYWQgPSBzZXNzaW9uLmdldEFsbFRocmVhZHMoKS5maW5kKHQgPT4gdC5nZXRJZCgpID09PSBzZXNzaW9uQW5kVGhyZWFkSWQudGhyZWFkSWQpO1xuXHRcdH1cblx0fSBlbHNlIGlmIChpc1Nlc3Npb25Db250ZXh0KHNlc3Npb25BbmRUaHJlYWRJZCkpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbihzZXNzaW9uQW5kVGhyZWFkSWQuc2Vzc2lvbklkKTtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0Y29uc3QgdGhyZWFkcyA9IHNlc3Npb24uZ2V0QWxsVGhyZWFkcygpO1xuXHRcdFx0dGhyZWFkID0gdGhyZWFkcy5sZW5ndGggPiAwID8gdGhyZWFkc1swXSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRpZiAoIXRocmVhZCkge1xuXHRcdHRocmVhZCA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkVGhyZWFkO1xuXHRcdGlmICghdGhyZWFkKSB7XG5cdFx0XHRjb25zdCBmb2N1c2VkU2Vzc2lvbiA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHRcdGNvbnN0IHRocmVhZHMgPSBmb2N1c2VkU2Vzc2lvbiA/IGZvY3VzZWRTZXNzaW9uLmdldEFsbFRocmVhZHMoKSA6IHVuZGVmaW5lZDtcblx0XHRcdHRocmVhZCA9IHRocmVhZHMgJiYgdGhyZWFkcy5sZW5ndGggPyB0aHJlYWRzWzBdIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGlmICh0aHJlYWQpIHtcblx0XHRhd2FpdCBydW4odGhyZWFkKTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc1N0YWNrRnJhbWVDb250ZXh0KG9iajogYW55KTogb2JqIGlzIENhbGxTdGFja0NvbnRleHQge1xuXHRyZXR1cm4gb2JqICYmIHR5cGVvZiBvYmouc2Vzc2lvbklkID09PSAnc3RyaW5nJyAmJiB0eXBlb2Ygb2JqLnRocmVhZElkID09PSAnc3RyaW5nJyAmJiB0eXBlb2Ygb2JqLmZyYW1lSWQgPT09ICdzdHJpbmcnO1xufVxuXG5mdW5jdGlvbiBnZXRGcmFtZShkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKTogSVN0YWNrRnJhbWUgfCB1bmRlZmluZWQge1xuXHRpZiAoaXNTdGFja0ZyYW1lQ29udGV4dChjb250ZXh0KSkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9uKGNvbnRleHQuc2Vzc2lvbklkKTtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0Y29uc3QgdGhyZWFkID0gc2Vzc2lvbi5nZXRBbGxUaHJlYWRzKCkuZmluZCh0ID0+IHQuZ2V0SWQoKSA9PT0gY29udGV4dC50aHJlYWRJZCk7XG5cdFx0XHRpZiAodGhyZWFkKSB7XG5cdFx0XHRcdHJldHVybiB0aHJlYWQuZ2V0Q2FsbFN0YWNrKCkuZmluZChzZiA9PiBzZi5nZXRJZCgpID09PSBjb250ZXh0LmZyYW1lSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaXNTZXNzaW9uQ29udGV4dChvYmo6IGFueSk6IG9iaiBpcyBDYWxsU3RhY2tDb250ZXh0IHtcblx0cmV0dXJuIG9iaiAmJiB0eXBlb2Ygb2JqLnNlc3Npb25JZCA9PT0gJ3N0cmluZyc7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNoYW5nZURlYnVnQ29uc29sZUZvY3VzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBuZXh0OiBib29sZWFuKSB7XG5cdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRjb25zdCBzZXNzaW9ucyA9IGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb25zKHRydWUpLmZpbHRlcihzID0+IHMuaGFzU2VwYXJhdGVSZXBsKCkpO1xuXHRsZXQgY3VyclNlc3Npb24gPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cblx0bGV0IG5leHRJbmRleCA9IDA7XG5cdGlmIChzZXNzaW9ucy5sZW5ndGggPiAwICYmIGN1cnJTZXNzaW9uKSB7XG5cdFx0d2hpbGUgKGN1cnJTZXNzaW9uICYmICFjdXJyU2Vzc2lvbi5oYXNTZXBhcmF0ZVJlcGwoKSkge1xuXHRcdFx0Y3VyclNlc3Npb24gPSBjdXJyU2Vzc2lvbi5wYXJlbnRTZXNzaW9uO1xuXHRcdH1cblxuXHRcdGlmIChjdXJyU2Vzc2lvbikge1xuXHRcdFx0Y29uc3QgY3VyckluZGV4ID0gc2Vzc2lvbnMuaW5kZXhPZihjdXJyU2Vzc2lvbik7XG5cdFx0XHRpZiAobmV4dCkge1xuXHRcdFx0XHRuZXh0SW5kZXggPSAoY3VyckluZGV4ID09PSAoc2Vzc2lvbnMubGVuZ3RoIC0gMSkgPyAwIDogKGN1cnJJbmRleCArIDEpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5leHRJbmRleCA9IChjdXJySW5kZXggPT09IDAgPyAoc2Vzc2lvbnMubGVuZ3RoIC0gMSkgOiAoY3VyckluZGV4IC0gMSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRhd2FpdCBkZWJ1Z1NlcnZpY2UuZm9jdXNTdGFja0ZyYW1lKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBzZXNzaW9uc1tuZXh0SW5kZXhdLCB7IGV4cGxpY2l0OiB0cnVlIH0pO1xuXG5cdGlmICghdmlld3NTZXJ2aWNlLmlzVmlld1Zpc2libGUoUkVQTF9WSUVXX0lEKSkge1xuXHRcdGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldyhSRVBMX1ZJRVdfSUQsIHRydWUpO1xuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIG5hdmlnYXRlQ2FsbFN0YWNrKGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSwgZG93bjogYm9vbGVhbikge1xuXHRjb25zdCBmcmFtZSA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0aWYgKGZyYW1lKSB7XG5cblx0XHRsZXQgY2FsbFN0YWNrID0gZnJhbWUudGhyZWFkLmdldENhbGxTdGFjaygpO1xuXHRcdGxldCBpbmRleCA9IGNhbGxTdGFjay5maW5kSW5kZXgoZWxlbSA9PiBlbGVtLmZyYW1lSWQgPT09IGZyYW1lLmZyYW1lSWQpO1xuXHRcdGxldCBuZXh0VmlzaWJsZUZyYW1lO1xuXHRcdGlmIChkb3duKSB7XG5cdFx0XHRpZiAoaW5kZXggPj0gY2FsbFN0YWNrLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0aWYgKCg8VGhyZWFkPmZyYW1lLnRocmVhZCkucmVhY2hlZEVuZE9mQ2FsbFN0YWNrKSB7XG5cdFx0XHRcdFx0Z29Ub1RvcE9mQ2FsbFN0YWNrKGRlYnVnU2VydmljZSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmZldGNoQ2FsbHN0YWNrKGZyYW1lLnRocmVhZCwgMjApO1xuXHRcdFx0XHRcdGNhbGxTdGFjayA9IGZyYW1lLnRocmVhZC5nZXRDYWxsU3RhY2soKTtcblx0XHRcdFx0XHRpbmRleCA9IGNhbGxTdGFjay5maW5kSW5kZXgoZWxlbSA9PiBlbGVtLmZyYW1lSWQgPT09IGZyYW1lLmZyYW1lSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRuZXh0VmlzaWJsZUZyYW1lID0gZmluZE5leHRWaXNpYmxlRnJhbWUodHJ1ZSwgY2FsbFN0YWNrLCBpbmRleCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChpbmRleCA8PSAwKSB7XG5cdFx0XHRcdGdvVG9Cb3R0b21PZkNhbGxTdGFjayhkZWJ1Z1NlcnZpY2UpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRuZXh0VmlzaWJsZUZyYW1lID0gZmluZE5leHRWaXNpYmxlRnJhbWUoZmFsc2UsIGNhbGxTdGFjaywgaW5kZXgpO1xuXHRcdH1cblxuXHRcdGlmIChuZXh0VmlzaWJsZUZyYW1lKSB7XG5cdFx0XHRkZWJ1Z1NlcnZpY2UuZm9jdXNTdGFja0ZyYW1lKG5leHRWaXNpYmxlRnJhbWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IHByZXNlcnZlRm9jdXM6IGZhbHNlIH0pO1xuXHRcdH1cblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBnb1RvQm90dG9tT2ZDYWxsU3RhY2soZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlKSB7XG5cdGNvbnN0IHRocmVhZCA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkVGhyZWFkO1xuXHRpZiAodGhyZWFkKSB7XG5cdFx0YXdhaXQgZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZmV0Y2hDYWxsc3RhY2sodGhyZWFkKTtcblx0XHRjb25zdCBjYWxsU3RhY2sgPSB0aHJlYWQuZ2V0Q2FsbFN0YWNrKCk7XG5cdFx0aWYgKGNhbGxTdGFjay5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBuZXh0VmlzaWJsZUZyYW1lID0gZmluZE5leHRWaXNpYmxlRnJhbWUoZmFsc2UsIGNhbGxTdGFjaywgMCk7IC8vIG11c3QgY29uc2lkZXIgdGhlIG5leHQgZnJhbWUgdXAgZmlyc3QsIHdoaWNoIHdpbGwgYmUgdGhlIGxhc3QgZnJhbWVcblx0XHRcdGlmIChuZXh0VmlzaWJsZUZyYW1lKSB7XG5cdFx0XHRcdGRlYnVnU2VydmljZS5mb2N1c1N0YWNrRnJhbWUobmV4dFZpc2libGVGcmFtZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHsgcHJlc2VydmVGb2N1czogZmFsc2UgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGdvVG9Ub3BPZkNhbGxTdGFjayhkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UpIHtcblx0Y29uc3QgdGhyZWFkID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRUaHJlYWQ7XG5cblx0aWYgKHRocmVhZCkge1xuXHRcdGRlYnVnU2VydmljZS5mb2N1c1N0YWNrRnJhbWUodGhyZWFkLmdldFRvcFN0YWNrRnJhbWUoKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHsgcHJlc2VydmVGb2N1czogZmFsc2UgfSk7XG5cdH1cbn1cblxuLyoqXG4gKiBGaW5kcyBuZXh0IGZyYW1lIHRoYXQgaXMgbm90IHNraXBwZWQgYnkgU2tpcEZpbGVzLiBTa2lwcyBmcmFtZSBhdCBpbmRleCBhbmQgc3RhcnRzIHNlYXJjaGluZyBhdCBuZXh0LlxuICogTXVzdCBzYXRpc2Z5IGAwIDw9IHN0YXJ0SW5kZXggPD0gY2FsbFN0YWNrIC0gMWBcbiAqIEBwYXJhbSBkb3duIHNwZWNpZmllcyB3aGV0aGVyIHRvIHNlYXJjaCBkb3dud2FyZHMgaWYgdGhlIGN1cnJlbnQgZmlsZSBpcyBza2lwcGVkLlxuICogQHBhcmFtIGNhbGxTdGFjayB0aGUgY2FsbCBzdGFjayB0byBzZWFyY2hcbiAqIEBwYXJhbSBzdGFydEluZGV4IHRoZSBpbmRleCB0byBzdGFydCB0aGUgc2VhcmNoIGF0XG4gKi9cbmZ1bmN0aW9uIGZpbmROZXh0VmlzaWJsZUZyYW1lKGRvd246IGJvb2xlYW4sIGNhbGxTdGFjazogcmVhZG9ubHkgSVN0YWNrRnJhbWVbXSwgc3RhcnRJbmRleDogbnVtYmVyKSB7XG5cblx0aWYgKHN0YXJ0SW5kZXggPj0gY2FsbFN0YWNrLmxlbmd0aCkge1xuXHRcdHN0YXJ0SW5kZXggPSBjYWxsU3RhY2subGVuZ3RoIC0gMTtcblx0fSBlbHNlIGlmIChzdGFydEluZGV4IDwgMCkge1xuXHRcdHN0YXJ0SW5kZXggPSAwO1xuXHR9XG5cblx0bGV0IGluZGV4ID0gc3RhcnRJbmRleDtcblxuXHRsZXQgY3VyckZyYW1lO1xuXHRkbyB7XG5cdFx0aWYgKGRvd24pIHtcblx0XHRcdGlmIChpbmRleCA9PT0gY2FsbFN0YWNrLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0aW5kZXggPSAwO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5kZXgrKztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0XHRcdGluZGV4ID0gY2FsbFN0YWNrLmxlbmd0aCAtIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbmRleC0tO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGN1cnJGcmFtZSA9IGNhbGxTdGFja1tpbmRleF07XG5cdFx0aWYgKCFpc0ZyYW1lRGVlbXBoYXNpemVkKGN1cnJGcmFtZSkpIHtcblx0XHRcdHJldHVybiBjdXJyRnJhbWU7XG5cdFx0fVxuXHR9IHdoaWxlIChpbmRleCAhPT0gc3RhcnRJbmRleCk7IC8vIGVuZCBsb29wIHdoZW4gd2UndmUganVzdCBjaGVja2VkIHRoZSBzdGFydCBpbmRleCwgc2luY2UgdGhhdCBzaG91bGQgYmUgdGhlIGxhc3Qgb25lIGNoZWNrZWRcblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vLyBUaGVzZSBjb21tYW5kcyBhcmUgdXNlZCBpbiBjYWxsIHN0YWNrIGNvbnRleHQgbWVudSwgY2FsbCBzdGFjayBpbmxpbmUgYWN0aW9ucywgY29tbWFuZCBwYWxldHRlLCBkZWJ1ZyB0b29sYmFyLCBtYWMgbmF0aXZlIHRvdWNoIGJhclxuLy8gV2hlbiB0aGUgY29tbWFuZCBpcyBleGVjdHVlZCBpbiB0aGUgY29udGV4dCBvZiBhIHRocmVhZChjb250ZXh0IG1lbnUgb24gYSB0aHJlYWQsIGlubGluZSBjYWxsIHN0YWNrIGFjdGlvbikgd2UgcGFzcyB0aGUgdGhyZWFkIGlkXG4vLyBPdGhlcndpc2Ugd2hlbiBpdCBpcyBleGVjdXRlZCBcImdsb2JhbHlcIih1c2luZyB0aGUgdG91Y2ggYmFyLCBkZWJ1ZyB0b29sYmFyLCBjb21tYW5kIHBhbGV0dGUpIHdlIGRvIG5vdCBwYXNzIGFueSBpZCBhbmQganVzdCB0YWtlIHdoYXRldmVyIGlzIHRoZSBmb2N1c3NlZCB0aHJlYWRcbi8vIFNhbWUgZm9yIHN0YWNrRnJhbWUgY29tbWFuZHMgYW5kIHNlc3Npb24gY29tbWFuZHMuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBDT1BZX1NUQUNLX1RSQUNFX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF86IHN0cmluZywgY29udGV4dDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24pID0+IHtcblx0XHRjb25zdCB0ZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCBmcmFtZSA9IGdldEZyYW1lKGRlYnVnU2VydmljZSwgY29udGV4dCk7XG5cdFx0aWYgKGZyYW1lKSB7XG5cdFx0XHRjb25zdCBlb2wgPSB0ZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZS5nZXRFT0woZnJhbWUuc291cmNlLnVyaSk7XG5cdFx0XHRhd2FpdCBjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChmcmFtZS50aHJlYWQuZ2V0Q2FsbFN0YWNrKCkubWFwKHNmID0+IHNmLnRvU3RyaW5nKCkpLmpvaW4oZW9sKSk7XG5cdFx0fVxuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogUkVWRVJTRV9DT05USU5VRV9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0YXdhaXQgZ2V0VGhyZWFkQW5kUnVuKGFjY2Vzc29yLCBjb250ZXh0LCB0aHJlYWQgPT4gdGhyZWFkLnJldmVyc2VDb250aW51ZSgpKTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IFNURVBfQkFDS19JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAoQ09OVEVYVF9ESVNBU1NFTUJMWV9WSUVXX0ZPQ1VTLmdldFZhbHVlKGNvbnRleHRLZXlTZXJ2aWNlKSkge1xuXHRcdFx0YXdhaXQgZ2V0VGhyZWFkQW5kUnVuKGFjY2Vzc29yLCBjb250ZXh0LCAodGhyZWFkOiBJVGhyZWFkKSA9PiB0aHJlYWQuc3RlcEJhY2soJ2luc3RydWN0aW9uJykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBnZXRUaHJlYWRBbmRSdW4oYWNjZXNzb3IsIGNvbnRleHQsICh0aHJlYWQ6IElUaHJlYWQpID0+IHRocmVhZC5zdGVwQmFjaygpKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBURVJNSU5BVEVfVEhSRUFEX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF86IHN0cmluZywgY29udGV4dDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24pID0+IHtcblx0XHRhd2FpdCBnZXRUaHJlYWRBbmRSdW4oYWNjZXNzb3IsIGNvbnRleHQsIHRocmVhZCA9PiB0aHJlYWQudGVybWluYXRlKCkpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogSlVNUF9UT19DVVJTT1JfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCBzdGFja0ZyYW1lID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvckNvbnRyb2wgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cblx0XHRpZiAoc3RhY2tGcmFtZSAmJiBpc0NvZGVFZGl0b3IoYWN0aXZlRWRpdG9yQ29udHJvbCkgJiYgYWN0aXZlRWRpdG9yQ29udHJvbC5oYXNNb2RlbCgpKSB7XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IGFjdGl2ZUVkaXRvckNvbnRyb2wuZ2V0UG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gYWN0aXZlRWRpdG9yQ29udHJvbC5nZXRNb2RlbCgpLnVyaTtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IHN0YWNrRnJhbWUudGhyZWFkLnNlc3Npb24uZ2V0U291cmNlRm9yVXJpKHJlc291cmNlKTtcblx0XHRcdGlmIChzb3VyY2UpIHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzdGFja0ZyYW1lLnRocmVhZC5zZXNzaW9uLmdvdG9UYXJnZXRzKHNvdXJjZS5yYXcsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbik7XG5cdFx0XHRcdGNvbnN0IHRhcmdldHMgPSByZXNwb25zZT8uYm9keS50YXJnZXRzO1xuXHRcdFx0XHRpZiAodGFyZ2V0cyAmJiB0YXJnZXRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGxldCBpZCA9IHRhcmdldHNbMF0uaWQ7XG5cdFx0XHRcdFx0aWYgKHRhcmdldHMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcGlja3MgPSB0YXJnZXRzLm1hcCh0ID0+ICh7IGxhYmVsOiB0LmxhYmVsLCBfaWQ6IHQuaWQgfSkpO1xuXHRcdFx0XHRcdFx0Y29uc3QgcGljayA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnY2hvb3NlTG9jYXRpb24nLCBcIkNob29zZSB0aGUgc3BlY2lmaWMgbG9jYXRpb25cIikgfSk7XG5cdFx0XHRcdFx0XHRpZiAoIXBpY2spIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZCA9IHBpY2suX2lkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBhd2FpdCBzdGFja0ZyYW1lLnRocmVhZC5zZXNzaW9uLmdvdG8oc3RhY2tGcmFtZS50aHJlYWQudGhyZWFkSWQsIGlkKS5jYXRjaChlID0+IG5vdGlmaWNhdGlvblNlcnZpY2Uud2FybihlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbm90aWZpY2F0aW9uU2VydmljZS53YXJuKG5scy5sb2NhbGl6ZSgnbm9FeGVjdXRhYmxlQ29kZScsIFwiTm8gZXhlY3V0YWJsZSBjb2RlIGlzIGFzc29jaWF0ZWQgYXQgdGhlIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uLlwiKSk7XG5cdH1cbn0pO1xuXG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IENBTExTVEFDS19UT1BfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgXzogc3RyaW5nLCBjb250ZXh0OiBDYWxsU3RhY2tDb250ZXh0IHwgdW5rbm93bikgPT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRnb1RvVG9wT2ZDYWxsU3RhY2soZGVidWdTZXJ2aWNlKTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IENBTExTVEFDS19CT1RUT01fSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgXzogc3RyaW5nLCBjb250ZXh0OiBDYWxsU3RhY2tDb250ZXh0IHwgdW5rbm93bikgPT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRhd2FpdCBnb1RvQm90dG9tT2ZDYWxsU3RhY2soZGVidWdTZXJ2aWNlKTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IENBTExTVEFDS19VUF9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdG5hdmlnYXRlQ2FsbFN0YWNrKGRlYnVnU2VydmljZSwgZmFsc2UpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogQ0FMTFNUQUNLX0RPV05fSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgXzogc3RyaW5nLCBjb250ZXh0OiBDYWxsU3RhY2tDb250ZXh0IHwgdW5rbm93bikgPT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRuYXZpZ2F0ZUNhbGxTdGFjayhkZWJ1Z1NlcnZpY2UsIHRydWUpO1xuXHR9XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JDb250ZXh0LCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogSlVNUF9UT19DVVJTT1JfSUQsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnanVtcFRvQ3Vyc29yJywgXCJKdW1wIHRvIEN1cnNvclwiKSxcblx0XHRjYXRlZ29yeTogREVCVUdfQ09NTUFORF9DQVRFR09SWVxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9KVU1QX1RPX0NVUlNPUl9TVVBQT1JURUQsIEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyksXG5cdGdyb3VwOiAnZGVidWcnLFxuXHRvcmRlcjogM1xufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogTkVYVF9ERUJVR19DT05TT0xFX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdHdoZW46IENPTlRFWFRfSU5fREVCVUdfUkVQTCxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlBhZ2VEb3duLFxuXHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJyYWNrZXRSaWdodCB9LFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF86IHN0cmluZywgY29udGV4dDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24pID0+IHtcblx0XHRjaGFuZ2VEZWJ1Z0NvbnNvbGVGb2N1cyhhY2Nlc3NvciwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IFBSRVZfREVCVUdfQ09OU09MRV9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxLFxuXHR3aGVuOiBDT05URVhUX0lOX0RFQlVHX1JFUEwsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5QYWdlVXAsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQnJhY2tldExlZnQgfSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0Y2hhbmdlRGVidWdDb25zb2xlRm9jdXMoYWNjZXNzb3IsIGZhbHNlKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogUkVTVEFSVF9TRVNTSU9OX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkY1LFxuXHR3aGVuOiBDT05URVhUX0lOX0RFQlVHX01PREUsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgXzogc3RyaW5nLCBjb250ZXh0OiBDYWxsU3RhY2tDb250ZXh0IHwgdW5rbm93bikgPT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGxldCBzZXNzaW9uOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChpc1Nlc3Npb25Db250ZXh0KGNvbnRleHQpKSB7XG5cdFx0XHRzZXNzaW9uID0gZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbihjb250ZXh0LnNlc3Npb25JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNlc3Npb24gPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdFx0fVxuXG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRjb25zdCB7IGxhdW5jaCwgbmFtZSB9ID0gZGVidWdTZXJ2aWNlLmdldENvbmZpZ3VyYXRpb25NYW5hZ2VyKCkuc2VsZWN0ZWRDb25maWd1cmF0aW9uO1xuXHRcdFx0YXdhaXQgZGVidWdTZXJ2aWNlLnN0YXJ0RGVidWdnaW5nKGxhdW5jaCwgbmFtZSwgeyBub0RlYnVnOiBmYWxzZSwgc3RhcnRlZEJ5VXNlcjogdHJ1ZSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc2hvd1N1YlNlc3Npb25zID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuc2hvd1N1YlNlc3Npb25zSW5Ub29sQmFyO1xuXHRcdFx0Ly8gU3RvcCBzaG91bGQgYmUgc2VudCB0byB0aGUgcm9vdCBwYXJlbnQgc2Vzc2lvblxuXHRcdFx0d2hpbGUgKCFzaG93U3ViU2Vzc2lvbnMgJiYgc2Vzc2lvbi5saWZlY3ljbGVNYW5hZ2VkQnlQYXJlbnQgJiYgc2Vzc2lvbi5wYXJlbnRTZXNzaW9uKSB7XG5cdFx0XHRcdHNlc3Npb24gPSBzZXNzaW9uLnBhcmVudFNlc3Npb247XG5cdFx0XHR9XG5cdFx0XHRzZXNzaW9uLnJlbW92ZVJlcGxFeHByZXNzaW9ucygpO1xuXHRcdFx0YXdhaXQgZGVidWdTZXJ2aWNlLnJlc3RhcnRTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogU1RFUF9PVkVSX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0cHJpbWFyeTogS2V5Q29kZS5GMTAsXG5cdHdoZW46IENPTlRFWFRfREVCVUdfU1RBVEUuaXNFcXVhbFRvKCdzdG9wcGVkJyksXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgXzogc3RyaW5nLCBjb250ZXh0OiBDYWxsU3RhY2tDb250ZXh0IHwgdW5rbm93bikgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKENPTlRFWFRfRElTQVNTRU1CTFlfVklFV19GT0NVUy5nZXRWYWx1ZShjb250ZXh0S2V5U2VydmljZSkpIHtcblx0XHRcdGF3YWl0IGdldFRocmVhZEFuZFJ1bihhY2Nlc3NvciwgY29udGV4dCwgKHRocmVhZDogSVRocmVhZCkgPT4gdGhyZWFkLm5leHQoJ2luc3RydWN0aW9uJykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBnZXRUaHJlYWRBbmRSdW4oYWNjZXNzb3IsIGNvbnRleHQsICh0aHJlYWQ6IElUaHJlYWQpID0+IHRocmVhZC5uZXh0KCkpO1xuXHRcdH1cblx0fVxufSk7XG5cbi8vIFdpbmRvd3MgYnJvd3NlcnMgdXNlIEYxMSBmb3IgZnVsbCBzY3JlZW4sIHRodXMgdXNlIGFsdCtGMTEgYXMgdGhlIGRlZmF1bHQgc2hvcnRjdXRcbmNvbnN0IFNURVBfSU5UT19LRVlCSU5ESU5HID0gKGlzV2ViICYmIGlzV2luZG93cykgPyAoS2V5TW9kLkFsdCB8IEtleUNvZGUuRjExKSA6IEtleUNvZGUuRjExO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IFNURVBfSU5UT19JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxMCwgLy8gSGF2ZSBhIHN0cm9uZ2VyIHdlaWdodCB0byBoYXZlIHByaW9yaXR5IG92ZXIgZnVsbCBzY3JlZW4gd2hlbiBkZWJ1Z2dpbmdcblx0cHJpbWFyeTogU1RFUF9JTlRPX0tFWUJJTkRJTkcsXG5cdC8vIFVzZSBhIG1vcmUgZmxleGlibGUgd2hlbiBjbGF1c2UgdG8gbm90IGFsbG93IGZ1bGwgc2NyZWVuIGNvbW1hbmQgdG8gdGFrZSBvdmVyIHdoZW4gRjExIHByZXNzZWQgYSBsb3Qgb2YgdGltZXNcblx0d2hlbjogQ09OVEVYVF9ERUJVR19TVEFURS5ub3RFcXVhbHNUbygnaW5hY3RpdmUnKSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAoQ09OVEVYVF9ESVNBU1NFTUJMWV9WSUVXX0ZPQ1VTLmdldFZhbHVlKGNvbnRleHRLZXlTZXJ2aWNlKSkge1xuXHRcdFx0YXdhaXQgZ2V0VGhyZWFkQW5kUnVuKGFjY2Vzc29yLCBjb250ZXh0LCAodGhyZWFkOiBJVGhyZWFkKSA9PiB0aHJlYWQuc3RlcEluKCdpbnN0cnVjdGlvbicpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgZ2V0VGhyZWFkQW5kUnVuKGFjY2Vzc29yLCBjb250ZXh0LCAodGhyZWFkOiBJVGhyZWFkKSA9PiB0aHJlYWQuc3RlcEluKCkpO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogU1RFUF9PVVRfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkYxMSxcblx0d2hlbjogQ09OVEVYVF9ERUJVR19TVEFURS5pc0VxdWFsVG8oJ3N0b3BwZWQnKSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAoQ09OVEVYVF9ESVNBU1NFTUJMWV9WSUVXX0ZPQ1VTLmdldFZhbHVlKGNvbnRleHRLZXlTZXJ2aWNlKSkge1xuXHRcdFx0YXdhaXQgZ2V0VGhyZWFkQW5kUnVuKGFjY2Vzc29yLCBjb250ZXh0LCAodGhyZWFkOiBJVGhyZWFkKSA9PiB0aHJlYWQuc3RlcE91dCgnaW5zdHJ1Y3Rpb24nKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IGdldFRocmVhZEFuZFJ1bihhY2Nlc3NvciwgY29udGV4dCwgKHRocmVhZDogSVRocmVhZCkgPT4gdGhyZWFkLnN0ZXBPdXQoKSk7XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBQQVVTRV9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAyLCAvLyB0YWtlIHByaW9yaXR5IG92ZXIgZm9jdXMgbmV4dCBwYXJ0IHdoaWxlIHdlIGFyZSBkZWJ1Z2dpbmdcblx0cHJpbWFyeTogS2V5Q29kZS5GNixcblx0d2hlbjogQ09OVEVYVF9ERUJVR19TVEFURS5pc0VxdWFsVG8oJ3J1bm5pbmcnKSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0YXdhaXQgZ2V0VGhyZWFkQW5kUnVuKGFjY2Vzc29yLCBjb250ZXh0LCB0aHJlYWQgPT4gdGhyZWFkLnBhdXNlKCkpO1xuXHR9XG59KTtcblxuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IFNURVBfSU5UT19UQVJHRVRfSUQsXG5cdHByaW1hcnk6IFNURVBfSU5UT19LRVlCSU5ESU5HIHwgS2V5TW9kLkN0cmxDbWQsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NURVBfSU5UT19UQVJHRVRTX1NVUFBPUlRFRCwgQ09OVEVYVF9JTl9ERUJVR19NT0RFLCBDT05URVhUX0RFQlVHX1NUQVRFLmlzRXF1YWxUbygnc3RvcHBlZCcpKSxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgXzogc3RyaW5nLCBjb250ZXh0OiBDYWxsU3RhY2tDb250ZXh0IHwgdW5rbm93bikgPT4ge1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdFx0Y29uc3QgZnJhbWUgPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0aWYgKCFmcmFtZSB8fCAhc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogZnJhbWUuc291cmNlLnVyaSxcblx0XHRcdG9wdGlvbnM6IHsgcmV2ZWFsSWZPcGVuZWQ6IHRydWUgfVxuXHRcdH0pO1xuXG5cdFx0bGV0IGNvZGVFZGl0b3I6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdGNvbnN0IGN0cmwgPSBlZGl0b3I/LmdldENvbnRyb2woKTtcblx0XHRcdGlmIChpc0NvZGVFZGl0b3IoY3RybCkpIHtcblx0XHRcdFx0Y29kZUVkaXRvciA9IGN0cmw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aW50ZXJmYWNlIElUYXJnZXRJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRcdFx0dGFyZ2V0OiBEZWJ1Z1Byb3RvY29sLlN0ZXBJblRhcmdldDtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxcCA9IGRpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVRhcmdldEl0ZW0+KCkpO1xuXHRcdHFwLmJ1c3kgPSB0cnVlO1xuXHRcdHFwLnNob3coKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxcC5vbkRpZENoYW5nZUFjdGl2ZSgoW2l0ZW1dKSA9PiB7XG5cdFx0XHRpZiAoY29kZUVkaXRvciAmJiBpdGVtICYmIGl0ZW0udGFyZ2V0LmxpbmUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb2RlRWRpdG9yLnJldmVhbExpbmVJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KGl0ZW0udGFyZ2V0LmxpbmUpO1xuXHRcdFx0XHRjb2RlRWRpdG9yLnNldFNlbGVjdGlvbih7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBpdGVtLnRhcmdldC5saW5lLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBpdGVtLnRhcmdldC5jb2x1bW4gfHwgMSxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBpdGVtLnRhcmdldC5lbmRMaW5lIHx8IGl0ZW0udGFyZ2V0LmxpbmUsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiBpdGVtLnRhcmdldC5lbmRDb2x1bW4gfHwgaXRlbS50YXJnZXQuY29sdW1uIHx8IDEsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxcC5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRpZiAocXAuYWN0aXZlSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdHNlc3Npb24uc3RlcEluKGZyYW1lLnRocmVhZC50aHJlYWRJZCwgcXAuYWN0aXZlSXRlbXNbMF0udGFyZ2V0LmlkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocXAub25EaWRIaWRlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXG5cdFx0c2Vzc2lvbi5zdGVwSW5UYXJnZXRzKGZyYW1lLmZyYW1lSWQpLnRoZW4odGFyZ2V0cyA9PiB7XG5cdFx0XHRxcC5idXN5ID0gZmFsc2U7XG5cdFx0XHRpZiAodGFyZ2V0cz8ubGVuZ3RoKSB7XG5cdFx0XHRcdHFwLml0ZW1zID0gdGFyZ2V0cz8ubWFwKHRhcmdldCA9PiAoeyB0YXJnZXQsIGxhYmVsOiB0YXJnZXQubGFiZWwgfSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cXAucGxhY2Vob2xkZXIgPSBubHMubG9jYWxpemUoJ2VkaXRvci5kZWJ1Zy5hY3Rpb24uc3RlcEludG9UYXJnZXRzLm5vbmUnLCBcIk5vIHN0ZXAgdGFyZ2V0cyBhdmFpbGFibGVcIik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5hc3luYyBmdW5jdGlvbiBzdG9wSGFuZGxlcihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgXzogdW5rbm93biwgY29udGV4dDogQ2FsbFN0YWNrQ29udGV4dCB8IHVua25vd24sIGRpc2Nvbm5lY3Q6IGJvb2xlYW4sIHN1c3BlbmQ/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0bGV0IHNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQ7XG5cdGlmIChpc1Nlc3Npb25Db250ZXh0KGNvbnRleHQpKSB7XG5cdFx0c2Vzc2lvbiA9IGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb24oY29udGV4dC5zZXNzaW9uSWQpO1xuXHR9IGVsc2Uge1xuXHRcdHNlc3Npb24gPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdH1cblxuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBzaG93U3ViU2Vzc2lvbnMgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5zaG93U3ViU2Vzc2lvbnNJblRvb2xCYXI7XG5cdC8vIFN0b3Agc2hvdWxkIGJlIHNlbnQgdG8gdGhlIHJvb3QgcGFyZW50IHNlc3Npb25cblx0d2hpbGUgKCFzaG93U3ViU2Vzc2lvbnMgJiYgc2Vzc2lvbiAmJiBzZXNzaW9uLmxpZmVjeWNsZU1hbmFnZWRCeVBhcmVudCAmJiBzZXNzaW9uLnBhcmVudFNlc3Npb24pIHtcblx0XHRzZXNzaW9uID0gc2Vzc2lvbi5wYXJlbnRTZXNzaW9uO1xuXHR9XG5cblx0YXdhaXQgZGVidWdTZXJ2aWNlLnN0b3BTZXNzaW9uKHNlc3Npb24sIGRpc2Nvbm5lY3QsIHN1c3BlbmQpO1xufVxuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IERJU0NPTk5FQ1RfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkY1LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9GT0NVU0VEX1NFU1NJT05fSVNfQVRUQUNILCBDT05URVhUX0lOX0RFQlVHX01PREUpLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IsIF8sIGNvbnRleHQpID0+IHN0b3BIYW5kbGVyKGFjY2Vzc29yLCBfLCBjb250ZXh0LCB0cnVlKVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IERJU0NPTk5FQ1RfQU5EX1NVU1BFTkRfSUQsXG5cdGhhbmRsZXI6IChhY2Nlc3NvciwgXywgY29udGV4dCkgPT4gc3RvcEhhbmRsZXIoYWNjZXNzb3IsIF8sIGNvbnRleHQsIHRydWUsIHRydWUpXG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBTVE9QX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5GNSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfRk9DVVNFRF9TRVNTSU9OX0lTX0FUVEFDSC50b05lZ2F0ZWQoKSwgQ09OVEVYVF9JTl9ERUJVR19NT0RFKSxcblx0aGFuZGxlcjogKGFjY2Vzc29yLCBfLCBjb250ZXh0KSA9PiBzdG9wSGFuZGxlcihhY2Nlc3NvciwgXywgY29udGV4dCwgZmFsc2UpXG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogUkVTVEFSVF9GUkFNRV9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfOiBzdHJpbmcsIGNvbnRleHQ6IENhbGxTdGFja0NvbnRleHQgfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGZyYW1lID0gZ2V0RnJhbWUoZGVidWdTZXJ2aWNlLCBjb250ZXh0KTtcblx0XHRpZiAoZnJhbWUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGZyYW1lLnJlc3RhcnQoKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IENPTlRJTlVFX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwLCAvLyBVc2UgYSBzdHJvbmdlciB3ZWlnaHQgdG8gZ2V0IHByaW9yaXR5IG92ZXIgc3RhcnQgZGVidWdnaW5nIEY1IHNob3J0Y3V0XG5cdHByaW1hcnk6IEtleUNvZGUuRjUsXG5cdHdoZW46IENPTlRFWFRfREVCVUdfU1RBVEUuaXNFcXVhbFRvKCdzdG9wcGVkJyksXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgXzogc3RyaW5nLCBjb250ZXh0OiBDYWxsU3RhY2tDb250ZXh0IHwgdW5rbm93bikgPT4ge1xuXHRcdGF3YWl0IGdldFRocmVhZEFuZFJ1bihhY2Nlc3NvciwgY29udGV4dCwgdGhyZWFkID0+IHRocmVhZC5jb250aW51ZSgpKTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IFNIT1dfTE9BREVEX1NDUklQVFNfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcikgPT4ge1xuXHRcdGF3YWl0IHNob3dMb2FkZWRTY3JpcHRNZW51KGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6ICdkZWJ1Zy5zdGFydEZyb21Db25maWcnLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIGNvbmZpZzogSUNvbmZpZykgPT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2Uuc3RhcnREZWJ1Z2dpbmcodW5kZWZpbmVkLCBjb25maWcpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogRk9DVVNfU0VTU0lPTl9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZXNzaW9uOiBJRGVidWdTZXNzaW9uKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdHNlc3Npb24gPSByZXNvbHZlQ2hpbGRTZXNzaW9uKHNlc3Npb24sIGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb25zKCkpO1xuXHRcdGF3YWl0IGRlYnVnU2VydmljZS5mb2N1c1N0YWNrRnJhbWUodW5kZWZpbmVkLCB1bmRlZmluZWQsIHNlc3Npb24sIHsgZXhwbGljaXQ6IHRydWUgfSk7XG5cdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRpZiAoc3RhY2tGcmFtZSkge1xuXHRcdFx0YXdhaXQgc3RhY2tGcmFtZS5vcGVuSW5FZGl0b3IoZWRpdG9yU2VydmljZSwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogU0VMRUNUX0FORF9TVEFSVF9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBkZWJ1Z1R5cGU6IHN0cmluZyB8IHVua25vd24sIGRlYnVnU3RhcnRPcHRpb25zPzogeyBub0RlYnVnPzogYm9vbGVhbiB9KSA9PiB7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cblx0XHRpZiAoZGVidWdUeXBlKSB7XG5cdFx0XHRjb25zdCBjb25maWdNYW5hZ2VyID0gZGVidWdTZXJ2aWNlLmdldENvbmZpZ3VyYXRpb25NYW5hZ2VyKCk7XG5cdFx0XHRjb25zdCBkeW5hbWljUHJvdmlkZXJzID0gYXdhaXQgY29uZmlnTWFuYWdlci5nZXREeW5hbWljUHJvdmlkZXJzKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGR5bmFtaWNQcm92aWRlcnMpIHtcblx0XHRcdFx0aWYgKHByb3ZpZGVyLnR5cGUgPT09IGRlYnVnVHlwZSkge1xuXHRcdFx0XHRcdGNvbnN0IHBpY2sgPSBhd2FpdCBwcm92aWRlci5waWNrKCk7XG5cdFx0XHRcdFx0aWYgKHBpY2spIHtcblx0XHRcdFx0XHRcdGF3YWl0IGNvbmZpZ01hbmFnZXIuc2VsZWN0Q29uZmlndXJhdGlvbihwaWNrLmxhdW5jaCwgcGljay5jb25maWcubmFtZSwgcGljay5jb25maWcsIHsgdHlwZTogcHJvdmlkZXIudHlwZSB9KTtcblx0XHRcdFx0XHRcdGRlYnVnU2VydmljZS5zdGFydERlYnVnZ2luZyhwaWNrLmxhdW5jaCwgcGljay5jb25maWcsIHsgbm9EZWJ1ZzogZGVidWdTdGFydE9wdGlvbnM/Lm5vRGVidWcsIHN0YXJ0ZWRCeVVzZXI6IHRydWUgfSk7XG5cblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRxdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KERFQlVHX1FVSUNLX0FDQ0VTU19QUkVGSVgpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogU0VMRUNUX0RFQlVHX0NPTlNPTEVfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0cXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3Muc2hvdyhERUJVR19DT05TT0xFX1FVSUNLX0FDQ0VTU19QUkVGSVgpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogU0VMRUNUX0RFQlVHX1NFU1NJT05fSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdHNob3dEZWJ1Z1Nlc3Npb25NZW51KGFjY2Vzc29yLCBTRUxFQ1RfQU5EX1NUQVJUX0lEKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogREVCVUdfU1RBUlRfQ09NTUFORF9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleUNvZGUuRjUsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0RFQlVHR0VSU19BVkFJTEFCTEUsIENPTlRFWFRfREVCVUdfU1RBVEUuaXNFcXVhbFRvKCdpbmFjdGl2ZScpKSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBkZWJ1Z1N0YXJ0T3B0aW9ucz86IHsgY29uZmlnPzogUGFydGlhbDxJQ29uZmlnPjsgbm9EZWJ1Zz86IGJvb2xlYW4gfSkgPT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRhd2FpdCBzYXZlQWxsQmVmb3JlRGVidWdTdGFydChhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgeyBsYXVuY2gsIG5hbWUsIGdldENvbmZpZyB9ID0gZGVidWdTZXJ2aWNlLmdldENvbmZpZ3VyYXRpb25NYW5hZ2VyKCkuc2VsZWN0ZWRDb25maWd1cmF0aW9uO1xuXHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IGdldENvbmZpZygpO1xuXHRcdGNvbnN0IGNvbmZpZ09yTmFtZSA9IGNvbmZpZyA/IE9iamVjdC5hc3NpZ24oZGVlcENsb25lKGNvbmZpZyksIGRlYnVnU3RhcnRPcHRpb25zPy5jb25maWcpIDogbmFtZTtcblx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2Uuc3RhcnREZWJ1Z2dpbmcobGF1bmNoLCBjb25maWdPck5hbWUsIHsgbm9EZWJ1ZzogZGVidWdTdGFydE9wdGlvbnM/Lm5vRGVidWcsIHN0YXJ0ZWRCeVVzZXI6IHRydWUgfSwgZmFsc2UpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBERUJVR19SVU5fQ09NTUFORF9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5GNSxcblx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5GNSB9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLCBDT05URVhUX0RFQlVHX1NUQVRFLm5vdEVxdWFsc1RvKGdldFN0YXRlTGFiZWwoU3RhdGUuSW5pdGlhbGl6aW5nKSkpLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKERFQlVHX1NUQVJUX0NPTU1BTkRfSUQsIHsgbm9EZWJ1ZzogdHJ1ZSB9KTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2RlYnVnLnRvZ2dsZUJyZWFrcG9pbnQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0JSRUFLUE9JTlRTX0ZPQ1VTRUQsIElucHV0Rm9jdXNlZENvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLlNwYWNlLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBsaXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCBsaXN0ID0gbGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0O1xuXHRcdGlmIChsaXN0IGluc3RhbmNlb2YgTGlzdCkge1xuXHRcdFx0Y29uc3QgZm9jdXNlZCA9IDxJRW5hYmxlbWVudFtdPmxpc3QuZ2V0Rm9jdXNlZEVsZW1lbnRzKCk7XG5cdFx0XHRpZiAoZm9jdXNlZCAmJiBmb2N1c2VkLmxlbmd0aCkge1xuXHRcdFx0XHRkZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoIWZvY3VzZWRbMF0uZW5hYmxlZCwgZm9jdXNlZFswXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnZGVidWcuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRwcmltYXJ5OiB1bmRlZmluZWQsXG5cdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRyb2wgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHRcdGlmIChpc0NvZGVFZGl0b3IoY29udHJvbCkpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY29udHJvbC5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gY29udHJvbC5nZXRQb3NpdGlvbigpO1xuXHRcdFx0XHRpZiAocG9zaXRpb24pIHtcblx0XHRcdFx0XHRjb25zdCBicHMgPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cyh7IHVyaTogbW9kZWwudXJpLCBsaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyIH0pO1xuXHRcdFx0XHRcdGlmIChicHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRkZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoIWJwc1swXS5lbmFibGVkLCBicHNbMF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogRURJVF9FWFBSRVNTSU9OX0NPTU1BTkRfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNSxcblx0d2hlbjogQ09OVEVYVF9XQVRDSF9FWFBSRVNTSU9OU19GT0NVU0VELFxuXHRwcmltYXJ5OiBLZXlDb2RlLkYyLFxuXHRtYWM6IHsgcHJpbWFyeTogS2V5Q29kZS5FbnRlciB9LFxuXHRoYW5kbGVyOiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4cHJlc3Npb246IEV4cHJlc3Npb24gfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGlmICghKGV4cHJlc3Npb24gaW5zdGFuY2VvZiBFeHByZXNzaW9uKSkge1xuXHRcdFx0Y29uc3QgbGlzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZvY3VzZWQgPSBsaXN0U2VydmljZS5sYXN0Rm9jdXNlZExpc3Q7XG5cdFx0XHRpZiAoZm9jdXNlZCkge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50cyA9IGZvY3VzZWQuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZWxlbWVudHMpICYmIGVsZW1lbnRzWzBdIGluc3RhbmNlb2YgRXhwcmVzc2lvbikge1xuXHRcdFx0XHRcdGV4cHJlc3Npb24gPSBlbGVtZW50c1swXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChleHByZXNzaW9uIGluc3RhbmNlb2YgRXhwcmVzc2lvbikge1xuXHRcdFx0ZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLnNldFNlbGVjdGVkRXhwcmVzc2lvbihleHByZXNzaW9uLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogU0VUX0VYUFJFU1NJT05fQ09NTUFORF9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBleHByZXNzaW9uOiBFeHByZXNzaW9uIHwgdW5rbm93bikgPT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRpZiAoZXhwcmVzc2lvbiBpbnN0YW5jZW9mIEV4cHJlc3Npb24gfHwgZXhwcmVzc2lvbiBpbnN0YW5jZW9mIFZhcmlhYmxlKSB7XG5cdFx0XHRkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuc2V0U2VsZWN0ZWRFeHByZXNzaW9uKGV4cHJlc3Npb24sIHRydWUpO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2RlYnVnLnNldFZhcmlhYmxlJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyA1LFxuXHR3aGVuOiBDT05URVhUX1ZBUklBQkxFU19GT0NVU0VELFxuXHRwcmltYXJ5OiBLZXlDb2RlLkYyLFxuXHRtYWM6IHsgcHJpbWFyeTogS2V5Q29kZS5FbnRlciB9LFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBsaXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCBmb2N1c2VkID0gbGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0O1xuXG5cdFx0aWYgKGZvY3VzZWQpIHtcblx0XHRcdGNvbnN0IGVsZW1lbnRzID0gZm9jdXNlZC5nZXRGb2N1cygpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZWxlbWVudHMpICYmIGVsZW1lbnRzWzBdIGluc3RhbmNlb2YgVmFyaWFibGUpIHtcblx0XHRcdFx0ZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLnNldFNlbGVjdGVkRXhwcmVzc2lvbihlbGVtZW50c1swXSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogUkVNT1ZFX0VYUFJFU1NJT05fQ09NTUFORF9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1dBVENIX0VYUFJFU1NJT05TX0ZPQ1VTRUQsIENPTlRFWFRfRVhQUkVTU0lPTl9TRUxFQ1RFRC50b05lZ2F0ZWQoKSksXG5cdHByaW1hcnk6IEtleUNvZGUuRGVsZXRlLFxuXHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzcGFjZSB9LFxuXHRoYW5kbGVyOiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4cHJlc3Npb246IEV4cHJlc3Npb24gfCB1bmtub3duKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXG5cdFx0aWYgKGV4cHJlc3Npb24gaW5zdGFuY2VvZiBFeHByZXNzaW9uKSB7XG5cdFx0XHRkZWJ1Z1NlcnZpY2UucmVtb3ZlV2F0Y2hFeHByZXNzaW9ucyhleHByZXNzaW9uLmdldElkKCkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSk7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IGxpc3RTZXJ2aWNlLmxhc3RGb2N1c2VkTGlzdDtcblx0XHRpZiAoZm9jdXNlZCkge1xuXHRcdFx0bGV0IGVsZW1lbnRzID0gZm9jdXNlZC5nZXRGb2N1cygpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZWxlbWVudHMpICYmIGVsZW1lbnRzWzBdIGluc3RhbmNlb2YgRXhwcmVzc2lvbikge1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBmb2N1c2VkLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0XHRpZiAoc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5pbmRleE9mKGVsZW1lbnRzWzBdKSA+PSAwKSB7XG5cdFx0XHRcdFx0ZWxlbWVudHMgPSBzZWxlY3Rpb247XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxlbWVudHMuZm9yRWFjaCgoZTogRXhwcmVzc2lvbikgPT4gZGVidWdTZXJ2aWNlLnJlbW92ZVdhdGNoRXhwcmVzc2lvbnMoZS5nZXRJZCgpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogQlJFQUtfV0hFTl9WQUxVRV9DSEFOR0VTX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0aWYgKGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlKSB7XG5cdFx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UuYWRkRGF0YUJyZWFrcG9pbnQoeyBkZXNjcmlwdGlvbjogZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UuZGVzY3JpcHRpb24sIHNyYzogeyB0eXBlOiBEYXRhQnJlYWtwb2ludFNldFR5cGUuVmFyaWFibGUsIGRhdGFJZDogZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UuZGF0YUlkISB9LCBjYW5QZXJzaXN0OiAhIWRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlLmNhblBlcnNpc3QsIGFjY2Vzc1R5cGVzOiBkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZS5hY2Nlc3NUeXBlcywgYWNjZXNzVHlwZTogJ3dyaXRlJyB9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBCUkVBS19XSEVOX1ZBTFVFX0lTX0FDQ0VTU0VEX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0aWYgKGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlKSB7XG5cdFx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UuYWRkRGF0YUJyZWFrcG9pbnQoeyBkZXNjcmlwdGlvbjogZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UuZGVzY3JpcHRpb24sIHNyYzogeyB0eXBlOiBEYXRhQnJlYWtwb2ludFNldFR5cGUuVmFyaWFibGUsIGRhdGFJZDogZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UuZGF0YUlkISB9LCBjYW5QZXJzaXN0OiAhIWRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlLmNhblBlcnNpc3QsIGFjY2Vzc1R5cGVzOiBkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZS5hY2Nlc3NUeXBlcywgYWNjZXNzVHlwZTogJ3JlYWRXcml0ZScgfSk7XG5cdFx0fVxuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogQlJFQUtfV0hFTl9WQUxVRV9JU19SRUFEX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0aWYgKGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlKSB7XG5cdFx0XHRhd2FpdCBkZWJ1Z1NlcnZpY2UuYWRkRGF0YUJyZWFrcG9pbnQoeyBkZXNjcmlwdGlvbjogZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UuZGVzY3JpcHRpb24sIHNyYzogeyB0eXBlOiBEYXRhQnJlYWtwb2ludFNldFR5cGUuVmFyaWFibGUsIGRhdGFJZDogZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UuZGF0YUlkISB9LCBjYW5QZXJzaXN0OiAhIWRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlLmNhblBlcnNpc3QsIGFjY2Vzc1R5cGVzOiBkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZS5hY2Nlc3NUeXBlcywgYWNjZXNzVHlwZTogJ3JlYWQnIH0pO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2RlYnVnLnJlbW92ZUJyZWFrcG9pbnQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQlJFQUtQT0lOVFNfRk9DVVNFRCwgQ09OVEVYVF9CUkVBS1BPSU5UX0lOUFVUX0ZPQ1VTRUQudG9OZWdhdGVkKCkpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkRlbGV0ZSxcblx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CYWNrc3BhY2UgfSxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgbGlzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3QgbGlzdCA9IGxpc3RTZXJ2aWNlLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmIChsaXN0IGluc3RhbmNlb2YgTGlzdCkge1xuXHRcdFx0Y29uc3QgZm9jdXNlZCA9IGxpc3QuZ2V0Rm9jdXNlZEVsZW1lbnRzKCk7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gZm9jdXNlZC5sZW5ndGggPyBmb2N1c2VkWzBdIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50KSB7XG5cdFx0XHRcdGRlYnVnU2VydmljZS5yZW1vdmVCcmVha3BvaW50cyhlbGVtZW50LmdldElkKCkpO1xuXHRcdFx0fSBlbHNlIGlmIChlbGVtZW50IGluc3RhbmNlb2YgRnVuY3Rpb25CcmVha3BvaW50KSB7XG5cdFx0XHRcdGRlYnVnU2VydmljZS5yZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGVsZW1lbnQuZ2V0SWQoKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBEYXRhQnJlYWtwb2ludCkge1xuXHRcdFx0XHRkZWJ1Z1NlcnZpY2UucmVtb3ZlRGF0YUJyZWFrcG9pbnRzKGVsZW1lbnQuZ2V0SWQoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnZGVidWcuaW5zdGFsbEFkZGl0aW9uYWxEZWJ1Z2dlcnMnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogdW5kZWZpbmVkLFxuXHRwcmltYXJ5OiB1bmRlZmluZWQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgcXVlcnk6IHN0cmluZykgPT4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0bGV0IHNlYXJjaEZvciA9IGBAY2F0ZWdvcnk6ZGVidWdnZXJzYDtcblx0XHRpZiAodHlwZW9mIHF1ZXJ5ID09PSAnc3RyaW5nJykge1xuXHRcdFx0c2VhcmNoRm9yICs9IGAgJHtxdWVyeX1gO1xuXHRcdH1cblx0XHRyZXR1cm4gZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaChzZWFyY2hGb3IpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEFkZENvbmZpZ3VyYXRpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFERF9DT05GSUdVUkFUSU9OX0lELFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FkZENvbmZpZ3VyYXRpb24nLCBcIkFkZCBDb25maWd1cmF0aW9uLi4uXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IERFQlVHX0NPTU1BTkRfQ0FURUdPUlksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZW50LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIucmVnZXgoUmVzb3VyY2VDb250ZXh0S2V5LlBhdGgua2V5LCAvXFwudnNjb2RlWy9cXFxcXWxhdW5jaFxcLmpzb24kLyksXG5cdFx0XHRcdFx0QWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oVEVYVF9GSUxFX0VESVRPUl9JRCkpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGxhdW5jaFVyaTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKS5nZXRDb25maWd1cmF0aW9uTWFuYWdlcigpO1xuXG5cdFx0Y29uc3QgbGF1bmNoID0gbWFuYWdlci5nZXRMYXVuY2hlcygpLmZpbmQobCA9PiBsLnVyaS50b1N0cmluZygpID09PSBsYXVuY2hVcmkpIHx8IG1hbmFnZXIuc2VsZWN0ZWRDb25maWd1cmF0aW9uLmxhdW5jaDtcblx0XHRpZiAobGF1bmNoKSB7XG5cdFx0XHRjb25zdCB7IGVkaXRvciwgY3JlYXRlZCB9ID0gYXdhaXQgbGF1bmNoLm9wZW5Db25maWdGaWxlKHsgcHJlc2VydmVGb2N1czogZmFsc2UgfSk7XG5cdFx0XHRpZiAoZWRpdG9yICYmICFjcmVhdGVkKSB7XG5cdFx0XHRcdGNvbnN0IGNvZGVFZGl0b3IgPSA8SUNvZGVFZGl0b3I+ZWRpdG9yLmdldENvbnRyb2woKTtcblx0XHRcdFx0aWYgKGNvZGVFZGl0b3IpIHtcblx0XHRcdFx0XHRhd2FpdCBjb2RlRWRpdG9yLmdldENvbnRyaWJ1dGlvbjxJRGVidWdFZGl0b3JDb250cmlidXRpb24+KEVESVRPUl9DT05UUklCVVRJT05fSUQpPy5hZGRMYXVuY2hDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5jb25zdCBpbmxpbmVCcmVha3BvaW50SGFuZGxlciA9IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRjb25zdCBjb250cm9sID0gZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0aWYgKGlzQ29kZUVkaXRvcihjb250cm9sKSkge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gY29udHJvbC5nZXRQb3NpdGlvbigpO1xuXHRcdGlmIChwb3NpdGlvbiAmJiBjb250cm9sLmhhc01vZGVsKCkgJiYgZGVidWdTZXJ2aWNlLmNhblNldEJyZWFrcG9pbnRzSW4oY29udHJvbC5nZXRNb2RlbCgpKSkge1xuXHRcdFx0Y29uc3QgbW9kZWxVcmkgPSBjb250cm9sLmdldE1vZGVsKCkudXJpO1xuXHRcdFx0Y29uc3QgYnJlYWtwb2ludEFscmVhZHlTZXQgPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cyh7IGxpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsIHVyaTogbW9kZWxVcmkgfSlcblx0XHRcdFx0LnNvbWUoYnAgPT4gKGJwLnNlc3Npb25BZ25vc3RpY0RhdGEuY29sdW1uID09PSBwb3NpdGlvbi5jb2x1bW4gfHwgKCFicC5jb2x1bW4gJiYgcG9zaXRpb24uY29sdW1uIDw9IDEpKSk7XG5cblx0XHRcdGlmICghYnJlYWtwb2ludEFscmVhZHlTZXQpIHtcblx0XHRcdFx0ZGVidWdTZXJ2aWNlLmFkZEJyZWFrcG9pbnRzKG1vZGVsVXJpLCBbeyBsaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyLCBjb2x1bW46IHBvc2l0aW9uLmNvbHVtbiA+IDEgPyBwb3NpdGlvbi5jb2x1bW4gOiB1bmRlZmluZWQgfV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkY5LFxuXHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdGlkOiBUT0dHTEVfSU5MSU5FX0JSRUFLUE9JTlRfSUQsXG5cdGhhbmRsZXI6IGlubGluZUJyZWFrcG9pbnRIYW5kbGVyXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JDb250ZXh0LCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogVE9HR0xFX0lOTElORV9CUkVBS1BPSU5UX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2FkZElubGluZUJyZWFrcG9pbnQnLCBcIkFkZCBJbmxpbmUgQnJlYWtwb2ludFwiKSxcblx0XHRjYXRlZ29yeTogREVCVUdfQ09NTUFORF9DQVRFR09SWVxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Q09OVEVYVF9JTl9ERUJVR19NT0RFLFxuXHRcdFBhbmVsRm9jdXNDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbi50b05lZ2F0ZWQoKSksXG5cdGdyb3VwOiAnZGVidWcnLFxuXHRvcmRlcjogMVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2RlYnVnLm9wZW5CcmVha3BvaW50VG9TaWRlJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENPTlRFWFRfQlJFQUtQT0lOVFNfRk9DVVNFRCxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHRzZWNvbmRhcnk6IFtLZXlNb2QuQWx0IHwgS2V5Q29kZS5FbnRlcl0sXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGxpc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSk7XG5cdFx0Y29uc3QgbGlzdCA9IGxpc3RTZXJ2aWNlLmxhc3RGb2N1c2VkTGlzdDtcblx0XHRpZiAobGlzdCBpbnN0YW5jZW9mIExpc3QpIHtcblx0XHRcdGNvbnN0IGZvY3VzID0gbGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKTtcblx0XHRcdGlmIChmb2N1cy5sZW5ndGggJiYgZm9jdXNbMF0gaW5zdGFuY2VvZiBCcmVha3BvaW50KSB7XG5cdFx0XHRcdHJldHVybiBvcGVuQnJlYWtwb2ludFNvdXJjZShmb2N1c1swXSwgdHJ1ZSwgZmFsc2UsIHRydWUsIGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVFeGNlcHRpb25CcmVha3BvaW50c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVE9HR0xFX0VYQ0VQVElPTl9CUkVBS1BPSU5UU19JRCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCd0b2dnbGVFeGNlcHRpb25CcmVha3BvaW50cycsIFwiVG9nZ2xlIEV4Y2VwdGlvbiBCcmVha3BvaW50c1wiKSxcblx0XHRcdGNhdGVnb3J5OiBERUJVR19DT01NQU5EX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cblx0XHQvLyBHZXQgdGhlIGZvY3VzZWQgc2Vzc2lvbiBvciB0aGUgZmlyc3QgYXZhaWxhYmxlIHNlc3Npb25cblx0XHRjb25zdCBkZWJ1Z01vZGVsID0gZGVidWdTZXJ2aWNlLmdldE1vZGVsKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbiB8fCBkZWJ1Z01vZGVsLmdldFNlc3Npb25zKClbMF07XG5cdFx0Y29uc3QgZXhjZXB0aW9uQnJlYWtwb2ludHMgPSBzZXNzaW9uID8gZGVidWdNb2RlbC5nZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oc2Vzc2lvbi5nZXRJZCgpKSA6IGRlYnVnTW9kZWwuZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHMoKTtcblx0XHRpZiAoZXhjZXB0aW9uQnJlYWtwb2ludHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgb25seSBvbmUgZXhjZXB0aW9uIGJyZWFrcG9pbnQgdHlwZSwgdG9nZ2xlIGl0IGRpcmVjdGx5XG5cdFx0aWYgKGV4Y2VwdGlvbkJyZWFrcG9pbnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3QgYnJlYWtwb2ludCA9IGV4Y2VwdGlvbkJyZWFrcG9pbnRzWzBdO1xuXHRcdFx0YXdhaXQgZGVidWdTZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKCFicmVha3BvaW50LmVuYWJsZWQsIGJyZWFrcG9pbnQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE11bHRpcGxlIGV4Y2VwdGlvbiBicmVha3BvaW50IHR5cGVzIC0gc2hvdyBxdWlja3BpY2sgZm9yIHNlbGVjdGlvblxuXHRcdGludGVyZmFjZSBJRXhjZXB0aW9uQnJlYWtwb2ludEl0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdFx0XHRicmVha3BvaW50OiBJRXhjZXB0aW9uQnJlYWtwb2ludDtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxdWlja1BpY2sgPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElFeGNlcHRpb25CcmVha3BvaW50SXRlbT4oKSk7XG5cdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbmxzLmxvY2FsaXplKCdzZWxlY3RFeGNlcHRpb25CcmVha3BvaW50c1BsYWNlaG9sZGVyJywgXCJQaWNrIGVuYWJsZWQgZXhjZXB0aW9uIGJyZWFrcG9pbnRzXCIpO1xuXHRcdHF1aWNrUGljay5jYW5TZWxlY3RNYW55ID0gdHJ1ZTtcblx0XHRxdWlja1BpY2subWF0Y2hPbkRlc2NyaXB0aW9uID0gdHJ1ZTtcblx0XHRxdWlja1BpY2subWF0Y2hPbkRldGFpbCA9IHRydWU7XG5cblx0XHQvLyBDcmVhdGUgcXVpY2twaWNrIGl0ZW1zIGZyb20gZXhjZXB0aW9uIGJyZWFrcG9pbnRzXG5cdFx0cXVpY2tQaWNrLml0ZW1zID0gZXhjZXB0aW9uQnJlYWtwb2ludHMubWFwKGJwID0+ICh7XG5cdFx0XHRsYWJlbDogYnAubGFiZWwsXG5cdFx0XHRkZXNjcmlwdGlvbjogYnAuZGVzY3JpcHRpb24sXG5cdFx0XHRwaWNrZWQ6IGJwLmVuYWJsZWQsXG5cdFx0XHRicmVha3BvaW50OiBicFxuXHRcdH0pKTtcblxuXHRcdHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zID0gcXVpY2tQaWNrLml0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0ucGlja2VkKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtcyA9IHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zO1xuXHRcdFx0Y29uc3QgdG9FbmFibGU6IElFeGNlcHRpb25CcmVha3BvaW50W10gPSBbXTtcblx0XHRcdGNvbnN0IHRvRGlzYWJsZTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRbXSA9IFtdO1xuXG5cdFx0XHQvLyBEZXRlcm1pbmUgd2hpY2ggYnJlYWtwb2ludHMgbmVlZCB0byBiZSB0b2dnbGVkXG5cdFx0XHRmb3IgKGNvbnN0IGJwIG9mIGV4Y2VwdGlvbkJyZWFrcG9pbnRzKSB7XG5cdFx0XHRcdGNvbnN0IGlzU2VsZWN0ZWQgPSBzZWxlY3RlZEl0ZW1zLnNvbWUoaXRlbSA9PiBpdGVtLmJyZWFrcG9pbnQgPT09IGJwKTtcblx0XHRcdFx0aWYgKGlzU2VsZWN0ZWQgJiYgIWJwLmVuYWJsZWQpIHtcblx0XHRcdFx0XHR0b0VuYWJsZS5wdXNoKGJwKTtcblx0XHRcdFx0fSBlbHNlIGlmICghaXNTZWxlY3RlZCAmJiBicC5lbmFibGVkKSB7XG5cdFx0XHRcdFx0dG9EaXNhYmxlLnB1c2goYnApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRvZ2dsZSB0aGUgYnJlYWtwb2ludHNcblx0XHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgYnAgb2YgdG9FbmFibGUpIHtcblx0XHRcdFx0cHJvbWlzZXMucHVzaChkZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHModHJ1ZSwgYnApKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgYnAgb2YgdG9EaXNhYmxlKSB7XG5cdFx0XHRcdHByb21pc2VzLnB1c2goZGVidWdTZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKGZhbHNlLCBicCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXHRcdHF1aWNrUGljay5zaG93KCk7XG5cdH1cbn0pO1xuXG4vLyBXaGVuIHRoZXJlIGFyZSBubyBkZWJ1ZyBleHRlbnNpb25zLCBvcGVuIHRoZSBkZWJ1ZyB2aWV3bGV0IHdoZW4gRjUgaXMgcHJlc3NlZCBzbyB0aGUgdXNlciBjYW4gcmVhZCB0aGUgbGltaXRhdGlvbnNcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2RlYnVnLm9wZW5WaWV3Jyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRS50b05lZ2F0ZWQoKSxcblx0cHJpbWFyeTogS2V5Q29kZS5GNSxcblx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkY1XSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgcGFuZUNvbXBvc2l0ZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSk7XG5cdFx0YXdhaXQgcGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUoVklFV0xFVF9JRCwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsIHRydWUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBVFRBQ0hfVE9fQ1VSUkVOVF9DT0RFX1JFTkRFUkVSLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2F0dGFjaFRvQ3VycmVudENvZGVSZW5kZXJlcicsIFwiQXR0YWNoIHRvIEN1cnJlbnQgQ29kZSBSZW5kZXJlclwiKSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgZW52ID0gYWNjZXNzb3IuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGlmICghZW52LmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQgJiYgIWVudi5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JlZnVzaW5nIHRvIGF0dGFjaCB0byByZW5kZXJlciBvdXRzaWRlIG9mIGRldmVsb3BtZW50IGNvbnRleHQnKTtcblx0XHR9XG5cblx0XHRjb25zdCB3aW5kb3dJZCA9IGdldFdpbmRvd0lkKG1haW5XaW5kb3cpO1xuXHRcdGNvbnN0IGV4dERlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXh0RGVidWdTZXJ2aWNlLmF0dGFjaFRvQ3VycmVudFdpbmRvd1JlbmRlcmVyKHdpbmRvd0lkKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsT0FBTyxpQkFBaUI7QUFDakMsU0FBc0Isb0JB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
