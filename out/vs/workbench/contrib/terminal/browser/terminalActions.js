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
import { isKeyboardEvent, isMouseEvent, isPointerEvent, getActiveWindow } from "../../../../base/browser/dom.js";
import { Action } from "../../../../base/common/actions.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Schemas } from "../../../../base/common/network.js";
import { isAbsolute } from "../../../../base/common/path.js";
import { isWindows } from "../../../../base/common/platform.js";
import { dirname } from "../../../../base/common/resources.js";
import { hasKey, isObject, isString } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { EndOfLinePreference } from "../../../../editor/common/model.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { localize, localize2 } from "../../../../nls.js";
import { AccessibleViewProviderId } from "../../../../platform/accessibility/browser/accessibleView.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalExitReason, TerminalLocation, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { createProfileSchemaEnums } from "../../../../platform/terminal/common/terminalProfiles.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from "../../../browser/actions/workspaceCommands.js";
import { CLOSE_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { ConfigurationResolverExpression } from "../../../services/configurationResolver/common/configurationResolverExpression.js";
import { editorGroupToColumn } from "../../../services/editor/common/editorGroupColumn.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { accessibleViewCurrentProviderId, accessibleViewIsShown, accessibleViewOnLastLine } from "../../accessibility/browser/accessibilityConfiguration.js";
import { ITerminalProfileResolverService, ITerminalProfileService, TERMINAL_VIEW_ID, TerminalCommandId } from "../common/terminal.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { terminalStrings } from "../common/terminalStrings.js";
import { Direction, ITerminalConfigurationService, ITerminalEditorService, ITerminalEditingService, ITerminalGroupService, ITerminalInstanceService, ITerminalService } from "./terminal.js";
import { isAuxiliaryWindow } from "../../../../base/browser/window.js";
import { InstanceContext } from "./terminalContextMenu.js";
import { getColorClass, getIconId, getUriClasses } from "./terminalIcon.js";
import { killTerminalIcon, newTerminalIcon } from "./terminalIcons.js";
import { TerminalTabList } from "./terminalTabsList.js";
import { ResourceContextKey } from "../../../common/contextkeys.js";
import { SeparatorSelectOption } from "../../../../base/browser/ui/selectBox/selectBox.js";
const switchTerminalShowTabsTitle = localize("showTerminalTabs", "Show Tabs");
const category = terminalStrings.actionCategory;
const sharedWhenClause = (() => {
  const terminalAvailable = ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated);
  return {
    terminalAvailable,
    terminalAvailable_and_opened: ContextKeyExpr.and(terminalAvailable, TerminalContextKeys.isOpen),
    terminalAvailable_and_editorActive: ContextKeyExpr.and(terminalAvailable, TerminalContextKeys.terminalEditorActive),
    terminalAvailable_and_singularSelection: ContextKeyExpr.and(terminalAvailable, TerminalContextKeys.tabsSingularSelection),
    focusInAny_and_normalBuffer: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.altBufferActive.negate())
  };
})();
async function getCwdForSplit(instance, folders, commandService, configService) {
  switch (configService.config.splitCwd) {
    case "workspaceRoot":
      if (folders !== void 0 && commandService !== void 0) {
        if (folders.length === 1) {
          return folders[0].uri;
        } else if (folders.length > 1) {
          const options = {
            placeHolder: localize("workbench.action.terminal.newWorkspacePlaceholder", "Select current working directory for new terminal")
          };
          const workspace = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options]);
          if (!workspace) {
            return void 0;
          }
          return Promise.resolve(workspace.uri);
        }
      }
      return "";
    case "initial":
      return instance.getInitialCwd();
    case "inherited":
      return instance.getSpeculativeCwd();
  }
}
let TerminalLaunchHelpAction = class extends Action {
  constructor(_openerService) {
    super("workbench.action.terminal.launchHelp", localize("terminalLaunchHelp", "Open Help"));
    this._openerService = _openerService;
  }
  async run() {
    this._openerService.open("https://aka.ms/vscode-troubleshoot-terminal-launch");
  }
};
TerminalLaunchHelpAction = __decorateClass([
  __decorateParam(0, IOpenerService)
], TerminalLaunchHelpAction);
function registerTerminalAction(options) {
  options.f1 = options.f1 ?? true;
  options.category = options.category ?? category;
  options.precondition = options.precondition ?? TerminalContextKeys.processSupported;
  const runFunc = options.run;
  const strictOptions = options;
  delete strictOptions["run"];
  return registerAction2(class extends Action2 {
    constructor() {
      super(strictOptions);
    }
    run(accessor, args, args2) {
      return runFunc(getTerminalServices(accessor), accessor, args, args2);
    }
  });
}
function parseActionArgs(args) {
  if (Array.isArray(args)) {
    if (args.every((e) => e instanceof InstanceContext)) {
      return args;
    }
  } else if (args instanceof InstanceContext) {
    return [args];
  }
  return void 0;
}
function registerContextualInstanceAction(options) {
  const originalRun = options.run;
  return registerTerminalAction({
    ...options,
    run: async (c, accessor, focusedInstanceArgs, allInstanceArgs) => {
      let instances = getSelectedViewInstances2(accessor, allInstanceArgs);
      if (!instances) {
        const activeInstance = (options.activeInstanceType === "view" ? c.groupService : options.activeInstanceType === "editor" ? c.editorService : c.service).activeInstance;
        if (!activeInstance) {
          return;
        }
        instances = [activeInstance];
      }
      const results = [];
      for (const instance of instances) {
        results.push(originalRun(instance, c, accessor, focusedInstanceArgs));
      }
      await Promise.all(results);
      if (options.runAfter) {
        options.runAfter(instances, c, accessor, focusedInstanceArgs);
      }
    }
  });
}
function registerActiveInstanceAction(options) {
  const originalRun = options.run;
  return registerTerminalAction({
    ...options,
    run: (c, accessor, args) => {
      const activeInstance = c.service.activeInstance;
      if (activeInstance) {
        return originalRun(activeInstance, c, accessor, args);
      }
    }
  });
}
function registerActiveXtermAction(options) {
  const originalRun = options.run;
  return registerTerminalAction({
    ...options,
    run: (c, accessor, args) => {
      const activeDetached = Iterable.find(c.service.detachedInstances, (d) => d.xterm.isFocused);
      if (activeDetached) {
        return originalRun(activeDetached.xterm, accessor, activeDetached, args);
      }
      const activeInstance = c.service.activeInstance;
      if (activeInstance?.xterm) {
        return originalRun(activeInstance.xterm, accessor, activeInstance, args);
      }
    }
  });
}
function getTerminalServices(accessor) {
  return {
    service: accessor.get(ITerminalService),
    configService: accessor.get(ITerminalConfigurationService),
    groupService: accessor.get(ITerminalGroupService),
    instanceService: accessor.get(ITerminalInstanceService),
    editorService: accessor.get(ITerminalEditorService),
    editingService: accessor.get(ITerminalEditingService),
    profileService: accessor.get(ITerminalProfileService),
    profileResolverService: accessor.get(ITerminalProfileResolverService)
  };
}
function registerTerminalActions() {
  registerTerminalAction({
    id: TerminalCommandId.NewInActiveWorkspace,
    title: localize2("workbench.action.terminal.newInActiveWorkspace", "Create New Terminal (In Active Workspace)"),
    run: async (c) => {
      if (c.service.isProcessSupportRegistered) {
        const instance = await c.service.createTerminal({ location: c.configService.defaultLocation });
        if (!instance) {
          return;
        }
        c.service.setActiveInstance(instance);
        await focusActiveTerminal(instance, c);
      }
    }
  });
  refreshTerminalActions([]);
  registerTerminalAction({
    id: TerminalCommandId.CreateTerminalEditor,
    title: localize2("workbench.action.terminal.createTerminalEditor", "Create New Terminal in Editor Area"),
    run: async (c, _, args) => {
      function isCreateTerminalOptions(obj) {
        return isObject(obj) && "location" in obj;
      }
      const options = isCreateTerminalOptions(args) ? args : { location: { viewColumn: ACTIVE_GROUP } };
      const instance = await c.service.createTerminal(options);
      await instance.focusWhenReady();
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.CreateTerminalEditorSameGroup,
    title: localize2("workbench.action.terminal.createTerminalEditor", "Create New Terminal in Editor Area"),
    f1: false,
    run: async (c, accessor, args) => {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      const instance = await c.service.createTerminal({
        location: {
          viewColumn: editorGroupToColumn(editorGroupsService, editorGroupsService.activeGroup)
        }
      });
      await instance.focusWhenReady();
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.CreateTerminalEditorSide,
    title: localize2("workbench.action.terminal.createTerminalEditorSide", "Create New Terminal in Editor Area to the Side"),
    run: async (c) => {
      const instance = await c.service.createTerminal({
        location: { viewColumn: SIDE_GROUP }
      });
      await instance.focusWhenReady();
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.NewInNewWindow,
    title: terminalStrings.newInNewWindow,
    precondition: sharedWhenClause.terminalAvailable,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.Backquote,
      mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyMod.Alt | KeyCode.Backquote },
      weight: KeybindingWeight.WorkbenchContrib
    },
    run: async (c) => {
      const instance = await c.service.createTerminal({
        location: {
          viewColumn: AUX_WINDOW_GROUP,
          auxiliary: { compact: true }
        }
      });
      await instance.focusWhenReady();
    }
  });
  registerContextualInstanceAction({
    id: TerminalCommandId.MoveToEditor,
    title: terminalStrings.moveToEditor,
    precondition: sharedWhenClause.terminalAvailable_and_opened,
    activeInstanceType: "view",
    run: (instance, c) => c.service.moveToEditor(instance),
    runAfter: (instances) => instances.at(-1)?.focus()
  });
  registerContextualInstanceAction({
    id: TerminalCommandId.MoveIntoNewWindow,
    title: terminalStrings.moveIntoNewWindow,
    precondition: sharedWhenClause.terminalAvailable_and_opened,
    run: (instance, c) => c.service.moveIntoNewEditor(instance),
    runAfter: (instances) => instances.at(-1)?.focus()
  });
  registerTerminalAction({
    id: TerminalCommandId.MoveToTerminalPanel,
    title: terminalStrings.moveToTerminalPanel,
    precondition: sharedWhenClause.terminalAvailable_and_editorActive,
    run: (c, _, args) => {
      const source = toOptionalUri(args) ?? c.editorService.activeInstance;
      if (source) {
        c.service.moveToTerminalView(source);
      }
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.FocusPreviousPane,
    title: localize2("workbench.action.terminal.focusPreviousPane", "Focus Previous Terminal in Terminal Group"),
    keybinding: {
      primary: KeyMod.Alt | KeyCode.LeftArrow,
      secondary: [KeyMod.Alt | KeyCode.UpArrow],
      mac: {
        primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.LeftArrow,
        secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.UpArrow]
      },
      when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.splitTerminalActive),
      // Should win over send sequence commands https://github.com/microsoft/vscode/issues/259326
      weight: KeybindingWeight.WorkbenchContrib + 1
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: async (c) => {
      c.groupService.activeGroup?.focusPreviousPane();
      await c.groupService.showPanel(true);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.FocusNextPane,
    title: localize2("workbench.action.terminal.focusNextPane", "Focus Next Terminal in Terminal Group"),
    keybinding: {
      primary: KeyMod.Alt | KeyCode.RightArrow,
      secondary: [KeyMod.Alt | KeyCode.DownArrow],
      mac: {
        primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.RightArrow,
        secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.DownArrow]
      },
      when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.splitTerminalActive),
      // Should win over send sequence commands https://github.com/microsoft/vscode/issues/259326
      weight: KeybindingWeight.WorkbenchContrib + 1
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: async (c) => {
      c.groupService.activeGroup?.focusNextPane();
      await c.groupService.showPanel(true);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.ResizePaneLeft,
    title: localize2("workbench.action.terminal.resizePaneLeft", "Resize Terminal Left"),
    keybinding: {
      linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow },
      mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow },
      when: TerminalContextKeys.focus,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (c) => c.groupService.activeGroup?.resizePane(Direction.Left)
  });
  registerTerminalAction({
    id: TerminalCommandId.ResizePaneRight,
    title: localize2("workbench.action.terminal.resizePaneRight", "Resize Terminal Right"),
    keybinding: {
      linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow },
      mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow },
      when: TerminalContextKeys.focus,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (c) => c.groupService.activeGroup?.resizePane(Direction.Right)
  });
  registerTerminalAction({
    id: TerminalCommandId.ResizePaneUp,
    title: localize2("workbench.action.terminal.resizePaneUp", "Resize Terminal Up"),
    keybinding: {
      mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.UpArrow },
      when: TerminalContextKeys.focus,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (c) => c.groupService.activeGroup?.resizePane(Direction.Up)
  });
  registerTerminalAction({
    id: TerminalCommandId.ResizePaneDown,
    title: localize2("workbench.action.terminal.resizePaneDown", "Resize Terminal Down"),
    keybinding: {
      mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.DownArrow },
      when: TerminalContextKeys.focus,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (c) => c.groupService.activeGroup?.resizePane(Direction.Down)
  });
  registerTerminalAction({
    id: TerminalCommandId.Focus,
    title: terminalStrings.focus,
    keybinding: {
      when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, accessibleViewOnLastLine, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Terminal)),
      primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: async (c) => {
      const instance = c.service.activeInstance || await c.service.createTerminal({ location: TerminalLocation.Panel });
      if (!instance) {
        return;
      }
      c.service.setActiveInstance(instance);
      await focusActiveTerminal(instance, c);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.FocusTabs,
    title: localize2("workbench.action.terminal.focus.tabsView", "Focus Terminal Tabs View"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.or(TerminalContextKeys.tabsFocus, TerminalContextKeys.focus)
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (c) => c.groupService.focusTabs()
  });
  registerTerminalAction({
    id: TerminalCommandId.FocusNext,
    title: localize2("workbench.action.terminal.focusNext", "Focus Next Terminal Group"),
    precondition: sharedWhenClause.terminalAvailable,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.PageDown,
      mac: {
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight
      },
      when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.editorFocus.negate()),
      weight: KeybindingWeight.WorkbenchContrib
    },
    run: async (c) => {
      c.groupService.setActiveGroupToNext();
      await c.groupService.showPanel(true);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.FocusPrevious,
    title: localize2("workbench.action.terminal.focusPrevious", "Focus Previous Terminal Group"),
    precondition: sharedWhenClause.terminalAvailable,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.PageUp,
      mac: {
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft
      },
      when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.editorFocus.negate()),
      weight: KeybindingWeight.WorkbenchContrib
    },
    run: async (c) => {
      c.groupService.setActiveGroupToPrevious();
      await c.groupService.showPanel(true);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.RunSelectedText,
    title: localize2("workbench.action.terminal.runSelectedText", "Run Selected Text In Active Terminal"),
    run: async (c, accessor) => {
      const codeEditorService = accessor.get(ICodeEditorService);
      const editor = codeEditorService.getActiveCodeEditor();
      if (!editor || !editor.hasModel()) {
        return;
      }
      const instance = await c.service.getActiveOrCreateInstance({ acceptsInput: true });
      const selection = editor.getSelection();
      let text;
      if (selection.isEmpty()) {
        text = editor.getModel().getLineContent(selection.selectionStartLineNumber).trim();
      } else {
        const endOfLinePreference = isWindows ? EndOfLinePreference.LF : EndOfLinePreference.CRLF;
        text = editor.getModel().getValueInRange(selection, endOfLinePreference);
      }
      instance.sendText(text, true, true);
      await c.service.revealActiveTerminal(true);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.RunActiveFile,
    title: localize2("workbench.action.terminal.runActiveFile", "Run Active File In Active Terminal"),
    precondition: sharedWhenClause.terminalAvailable,
    run: async (c, accessor) => {
      const codeEditorService = accessor.get(ICodeEditorService);
      const notificationService = accessor.get(INotificationService);
      const workbenchEnvironmentService = accessor.get(IWorkbenchEnvironmentService);
      const editor = codeEditorService.getActiveCodeEditor();
      if (!editor || !editor.hasModel()) {
        return;
      }
      const instance = await c.service.getActiveOrCreateInstance({ acceptsInput: true });
      const isRemote = instance ? instance.hasRemoteAuthority : workbenchEnvironmentService.remoteAuthority ? true : false;
      const uri = editor.getModel().uri;
      if (!isRemote && uri.scheme !== Schemas.file && uri.scheme !== Schemas.vscodeUserData || isRemote && uri.scheme !== Schemas.vscodeRemote) {
        notificationService.warn(localize("workbench.action.terminal.runActiveFile.noFile", "Only files on disk can be run in the terminal"));
        return;
      }
      await instance.sendPath(uri, true);
      return c.groupService.showPanel();
    }
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ScrollDownLine,
    title: localize2("workbench.action.terminal.scrollDown", "Scroll Down (Line)"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown,
      linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow },
      when: sharedWhenClause.focusInAny_and_normalBuffer,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => xterm.scrollDownLine()
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ScrollDownPage,
    title: localize2("workbench.action.terminal.scrollDownPage", "Scroll Down (Page)"),
    keybinding: {
      primary: KeyMod.Shift | KeyCode.PageDown,
      mac: { primary: KeyCode.PageDown },
      when: sharedWhenClause.focusInAny_and_normalBuffer,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => xterm.scrollDownPage()
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ScrollToBottom,
    title: localize2("workbench.action.terminal.scrollToBottom", "Scroll to Bottom"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.End,
      linux: { primary: KeyMod.Shift | KeyCode.End },
      when: sharedWhenClause.focusInAny_and_normalBuffer,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => xterm.scrollToBottom()
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ScrollUpLine,
    title: localize2("workbench.action.terminal.scrollUp", "Scroll Up (Line)"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp,
      linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow },
      when: sharedWhenClause.focusInAny_and_normalBuffer,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => xterm.scrollUpLine()
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ScrollUpPage,
    title: localize2("workbench.action.terminal.scrollUpPage", "Scroll Up (Page)"),
    f1: true,
    keybinding: {
      primary: KeyMod.Shift | KeyCode.PageUp,
      mac: { primary: KeyCode.PageUp },
      when: sharedWhenClause.focusInAny_and_normalBuffer,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => xterm.scrollUpPage()
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ScrollToTop,
    title: localize2("workbench.action.terminal.scrollToTop", "Scroll to Top"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.Home,
      linux: { primary: KeyMod.Shift | KeyCode.Home },
      when: sharedWhenClause.focusInAny_and_normalBuffer,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => xterm.scrollToTop()
  });
  registerActiveXtermAction({
    id: TerminalCommandId.ClearSelection,
    title: localize2("workbench.action.terminal.clearSelection", "Clear Selection"),
    keybinding: {
      primary: KeyCode.Escape,
      when: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.textSelected, TerminalContextKeys.notFindVisible),
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (xterm) => {
      if (xterm.hasSelection()) {
        xterm.clearSelection();
      }
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.ChangeIcon,
    title: terminalStrings.changeIcon,
    precondition: sharedWhenClause.terminalAvailable,
    run: (c, _, args) => getResourceOrActiveInstance(c, args)?.changeIcon()
  });
  registerTerminalAction({
    id: TerminalCommandId.ChangeIconActiveTab,
    title: terminalStrings.changeIcon,
    f1: false,
    precondition: sharedWhenClause.terminalAvailable_and_singularSelection,
    run: async (c, accessor, args) => {
      let icon;
      if (c.groupService.lastAccessedMenu === "inline-tab") {
        getResourceOrActiveInstance(c, args)?.changeIcon();
        return;
      }
      for (const terminal of getSelectedViewInstances(accessor) ?? []) {
        icon = await terminal.changeIcon(icon);
      }
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.ChangeColor,
    title: terminalStrings.changeColor,
    precondition: sharedWhenClause.terminalAvailable,
    run: (c, _, args) => getResourceOrActiveInstance(c, args)?.changeColor()
  });
  registerTerminalAction({
    id: TerminalCommandId.ChangeColorActiveTab,
    title: terminalStrings.changeColor,
    f1: false,
    precondition: sharedWhenClause.terminalAvailable_and_singularSelection,
    run: async (c, accessor, args) => {
      let color;
      let i = 0;
      if (c.groupService.lastAccessedMenu === "inline-tab") {
        getResourceOrActiveInstance(c, args)?.changeColor();
        return;
      }
      for (const terminal of getSelectedViewInstances(accessor) ?? []) {
        const skipQuickPick = i !== 0;
        color = await terminal.changeColor(color, skipQuickPick);
        i++;
      }
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.Rename,
    title: terminalStrings.rename,
    precondition: sharedWhenClause.terminalAvailable,
    run: (c, accessor, args) => renameWithQuickPick(c, accessor, args)
  });
  registerTerminalAction({
    id: TerminalCommandId.RenameActiveTab,
    title: terminalStrings.rename,
    f1: false,
    keybinding: {
      primary: KeyCode.F2,
      mac: {
        primary: KeyCode.Enter
      },
      when: ContextKeyExpr.and(TerminalContextKeys.tabsFocus),
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable_and_singularSelection,
    run: async (c, accessor) => {
      const terminalGroupService = accessor.get(ITerminalGroupService);
      const notificationService = accessor.get(INotificationService);
      const instances = getSelectedViewInstances(accessor);
      const firstInstance = instances?.[0];
      if (!firstInstance) {
        return;
      }
      if (terminalGroupService.lastAccessedMenu === "inline-tab") {
        return renameWithQuickPick(c, accessor, firstInstance);
      }
      c.editingService.setEditingTerminal(firstInstance);
      c.editingService.setEditable(firstInstance, {
        validationMessage: (value) => validateTerminalName(value),
        onFinish: async (value, success) => {
          c.editingService.setEditable(firstInstance, null);
          c.editingService.setEditingTerminal(void 0);
          if (success) {
            const promises = [];
            for (const instance of instances) {
              promises.push((async () => {
                await instance.rename(value);
              })());
            }
            try {
              await Promise.all(promises);
            } catch (e) {
              notificationService.error(e);
            }
          }
        }
      });
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.DetachSession,
    title: localize2("workbench.action.terminal.detachSession", "Detach Session"),
    run: (activeInstance) => activeInstance.detachProcessAndDispose(TerminalExitReason.User)
  });
  registerTerminalAction({
    id: TerminalCommandId.AttachToSession,
    title: localize2("workbench.action.terminal.attachToSession", "Attach to Session"),
    run: async (c, accessor) => {
      const quickInputService = accessor.get(IQuickInputService);
      const labelService = accessor.get(ILabelService);
      const remoteAgentService = accessor.get(IRemoteAgentService);
      const notificationService = accessor.get(INotificationService);
      const remoteAuthority = remoteAgentService.getConnection()?.remoteAuthority ?? void 0;
      const backend = await accessor.get(ITerminalInstanceService).getBackend(remoteAuthority);
      if (!backend) {
        throw new Error(`No backend registered for remote authority '${remoteAuthority}'`);
      }
      const terms = await backend.listProcesses();
      backend.reduceConnectionGraceTime();
      const unattachedTerms = terms.filter((term) => !c.service.isAttachedToTerminal(term));
      const items = unattachedTerms.map((term) => {
        const cwdLabel = labelService.getUriLabel(URI.file(term.cwd));
        return {
          label: term.title,
          detail: term.workspaceName ? `${term.workspaceName} \u2E31 ${cwdLabel}` : cwdLabel,
          description: term.pid ? String(term.pid) : "",
          term
        };
      });
      if (items.length === 0) {
        notificationService.info(localize("noUnattachedTerminals", "There are no unattached terminals to attach to"));
        return;
      }
      const selected = await quickInputService.pick(items, { canPickMany: false });
      if (selected) {
        const instance = await c.service.createTerminal({
          config: { attachPersistentProcess: selected.term }
        });
        c.service.setActiveInstance(instance);
        await focusActiveTerminal(instance, c);
      }
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.ScrollToPreviousCommand,
    title: terminalStrings.scrollToPreviousCommand,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
      when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    icon: Codicon.arrowUp,
    menu: [
      {
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 4,
        when: ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
        isHiddenByDefault: true
      },
      ...[MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map((id) => ({
        id,
        group: "1_shellIntegration",
        order: 4,
        when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
        isHiddenByDefault: true
      }))
    ],
    run: (activeInstance) => activeInstance.xterm?.markTracker.scrollToPreviousMark(void 0, void 0, activeInstance.capabilities.has(TerminalCapability.CommandDetection))
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.ScrollToNextCommand,
    title: terminalStrings.scrollToNextCommand,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
      when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    icon: Codicon.arrowDown,
    menu: [
      {
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 5,
        when: ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
        isHiddenByDefault: true
      },
      ...[MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map((id) => ({
        id,
        group: "1_shellIntegration",
        order: 5,
        when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
        isHiddenByDefault: true
      }))
    ],
    run: (activeInstance) => {
      activeInstance.xterm?.markTracker.scrollToNextMark();
      activeInstance.focus();
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.SelectToPreviousCommand,
    title: localize2("workbench.action.terminal.selectToPreviousCommand", "Select to Previous Command"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow,
      when: TerminalContextKeys.focus,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (activeInstance) => {
      activeInstance.xterm?.markTracker.selectToPreviousMark();
      activeInstance.focus();
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.SelectToNextCommand,
    title: localize2("workbench.action.terminal.selectToNextCommand", "Select to Next Command"),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow,
      when: TerminalContextKeys.focus,
      weight: KeybindingWeight.WorkbenchContrib
    },
    precondition: sharedWhenClause.terminalAvailable,
    run: (activeInstance) => {
      activeInstance.xterm?.markTracker.selectToNextMark();
      activeInstance.focus();
    }
  });
  registerActiveXtermAction({
    id: TerminalCommandId.SelectToPreviousLine,
    title: localize2("workbench.action.terminal.selectToPreviousLine", "Select to Previous Line"),
    precondition: sharedWhenClause.terminalAvailable,
    run: async (xterm, _, instance) => {
      xterm.markTracker.selectToPreviousLine();
      (instance || xterm).focus();
    }
  });
  registerActiveXtermAction({
    id: TerminalCommandId.SelectToNextLine,
    title: localize2("workbench.action.terminal.selectToNextLine", "Select to Next Line"),
    precondition: sharedWhenClause.terminalAvailable,
    run: async (xterm, _, instance) => {
      xterm.markTracker.selectToNextLine();
      (instance || xterm).focus();
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.NewWithCwd,
    title: terminalStrings.newWithCwd,
    metadata: {
      description: terminalStrings.newWithCwd.value,
      args: [{
        name: "args",
        schema: {
          type: "object",
          required: ["cwd"],
          properties: {
            cwd: {
              description: localize("workbench.action.terminal.newWithCwd.cwd", "The directory to start the terminal at"),
              type: "string"
            }
          }
        }
      }]
    },
    run: async (c, _, args) => {
      const cwd = args ? toOptionalString(args.cwd) : void 0;
      const instance = await c.service.createTerminal({ cwd });
      if (!instance) {
        return;
      }
      c.service.setActiveInstance(instance);
      await focusActiveTerminal(instance, c);
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.RenameWithArgs,
    title: terminalStrings.renameWithArgs,
    metadata: {
      description: terminalStrings.renameWithArgs.value,
      args: [{
        name: "args",
        schema: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              description: localize("workbench.action.terminal.renameWithArg.name", "The new name for the terminal"),
              type: "string",
              minLength: 1
            }
          }
        }
      }]
    },
    precondition: sharedWhenClause.terminalAvailable,
    f1: false,
    run: async (activeInstance, c, accessor, args) => {
      const notificationService = accessor.get(INotificationService);
      const name = args ? toOptionalString(args.name) : void 0;
      if (!name) {
        notificationService.warn(localize("workbench.action.terminal.renameWithArg.noName", "No name argument provided"));
        return;
      }
      activeInstance.rename(name);
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.Relaunch,
    title: localize2("workbench.action.terminal.relaunch", "Relaunch Active Terminal"),
    run: (activeInstance) => activeInstance.relaunch()
  });
  registerTerminalAction({
    id: TerminalCommandId.Split,
    title: terminalStrings.split,
    precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.webExtensionContributedProfile),
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit5,
      weight: KeybindingWeight.WorkbenchContrib,
      mac: {
        primary: KeyMod.CtrlCmd | KeyCode.Backslash,
        secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Digit5]
      },
      when: TerminalContextKeys.focus
    },
    icon: Codicon.splitHorizontal,
    run: async (c, accessor, args) => {
      const optionsOrProfile = isObject(args) ? args : void 0;
      const commandService = accessor.get(ICommandService);
      const workspaceContextService = accessor.get(IWorkspaceContextService);
      const options = convertOptionsOrProfileToOptions(optionsOrProfile);
      const activeInstance = (await c.service.getInstanceHost(options?.location)).activeInstance;
      if (!activeInstance) {
        return;
      }
      const cwd = await getCwdForSplit(activeInstance, workspaceContextService.getWorkspace().folders, commandService, c.configService);
      if (cwd === void 0) {
        return;
      }
      const instance = await c.service.createTerminal({ location: { parentTerminal: activeInstance }, config: options?.config, cwd });
      await focusActiveTerminal(instance, c);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.SplitActiveTab,
    title: terminalStrings.split,
    f1: false,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit5,
      mac: {
        primary: KeyMod.CtrlCmd | KeyCode.Backslash,
        secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Digit5]
      },
      weight: KeybindingWeight.WorkbenchContrib,
      when: TerminalContextKeys.tabsFocus
    },
    run: async (c, accessor) => {
      const instances = getSelectedViewInstances(accessor);
      if (instances) {
        const promises = [];
        for (const t of instances) {
          promises.push((async () => {
            await c.service.createTerminal({ location: { parentTerminal: t } });
            await c.groupService.showPanel(true);
          })());
        }
        await Promise.all(promises);
      }
    }
  });
  registerContextualInstanceAction({
    id: TerminalCommandId.Unsplit,
    title: terminalStrings.unsplit,
    precondition: sharedWhenClause.terminalAvailable,
    run: async (instance, c) => {
      const group = c.groupService.getGroupForInstance(instance);
      if (group && group?.terminalInstances.length > 1) {
        c.groupService.unsplitInstance(instance);
      }
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.JoinActiveTab,
    title: localize2("workbench.action.terminal.joinInstance", "Join Terminals"),
    precondition: ContextKeyExpr.and(sharedWhenClause.terminalAvailable, TerminalContextKeys.tabsSingularSelection.toNegated()),
    run: async (c, accessor) => {
      const instances = getSelectedViewInstances(accessor);
      if (instances && instances.length > 1) {
        c.groupService.joinInstances(instances);
      }
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.Join,
    title: localize2("workbench.action.terminal.join", "Join Terminals..."),
    precondition: sharedWhenClause.terminalAvailable,
    run: async (c, accessor) => {
      const themeService = accessor.get(IThemeService);
      const notificationService = accessor.get(INotificationService);
      const quickInputService = accessor.get(IQuickInputService);
      const picks = [];
      if (c.groupService.instances.length <= 1) {
        notificationService.warn(localize("workbench.action.terminal.join.insufficientTerminals", "Insufficient terminals for the join action"));
        return;
      }
      const otherInstances = c.groupService.instances.filter((i) => i.instanceId !== c.groupService.activeInstance?.instanceId);
      for (const terminal of otherInstances) {
        const group = c.groupService.getGroupForInstance(terminal);
        if (group?.terminalInstances.length === 1) {
          const iconId = getIconId(accessor, terminal);
          const label = `$(${iconId}): ${terminal.title}`;
          const iconClasses = [];
          const colorClass = getColorClass(terminal);
          if (colorClass) {
            iconClasses.push(colorClass);
          }
          const uriClasses = getUriClasses(terminal, themeService.getColorTheme().type);
          if (uriClasses) {
            iconClasses.push(...uriClasses);
          }
          picks.push({
            terminal,
            label,
            iconClasses
          });
        }
      }
      if (picks.length === 0) {
        notificationService.warn(localize("workbench.action.terminal.join.onlySplits", "All terminals are joined already"));
        return;
      }
      const result = await quickInputService.pick(picks, {});
      if (result) {
        c.groupService.joinInstances([result.terminal, c.groupService.activeInstance]);
      }
    }
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.SplitInActiveWorkspace,
    title: localize2("workbench.action.terminal.splitInActiveWorkspace", "Split Terminal (In Active Workspace)"),
    run: async (instance, c) => {
      const newInstance = await c.service.createTerminal({ location: { parentTerminal: instance } });
      if (newInstance?.target !== TerminalLocation.Editor) {
        await c.groupService.showPanel(true);
      }
    }
  });
  registerActiveXtermAction({
    id: TerminalCommandId.SelectAll,
    title: localize2("workbench.action.terminal.selectAll", "Select All"),
    precondition: sharedWhenClause.terminalAvailable,
    keybinding: [{
      // Don't use ctrl+a by default as that would override the common go to start
      // of prompt shell binding
      primary: 0,
      // Technically this doesn't need to be here as it will fall back to this
      // behavior anyway when handed to xterm.js, having this handled by VS Code
      // makes it easier for users to see how it works though.
      mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyA },
      weight: KeybindingWeight.WorkbenchContrib,
      when: TerminalContextKeys.focusInAny
    }],
    run: (xterm) => xterm.selectAll()
  });
  registerTerminalAction({
    id: TerminalCommandId.New,
    title: localize2("workbench.action.terminal.new", "Create New Terminal"),
    precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.webExtensionContributedProfile),
    icon: newTerminalIcon,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backquote,
      mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Backquote },
      weight: KeybindingWeight.WorkbenchContrib
    },
    run: async (c, accessor, args) => {
      let eventOrOptions = isObject(args) ? args : void 0;
      const workspaceContextService = accessor.get(IWorkspaceContextService);
      const commandService = accessor.get(ICommandService);
      const editorGroupsService = accessor.get(IEditorGroupsService);
      const folders = workspaceContextService.getWorkspace().folders;
      if (eventOrOptions && isMouseEvent(eventOrOptions) && (eventOrOptions.altKey || eventOrOptions.ctrlKey)) {
        await c.service.createTerminal({ location: { splitActiveTerminal: true } });
        return;
      }
      if (c.service.isProcessSupportRegistered) {
        eventOrOptions = !eventOrOptions || isMouseEvent(eventOrOptions) ? {} : eventOrOptions;
        if (isAuxiliaryWindow(getActiveWindow()) && !eventOrOptions.location) {
          eventOrOptions.location = { viewColumn: editorGroupToColumn(editorGroupsService, editorGroupsService.activeGroup) };
        }
        let instance;
        if (folders.length <= 1) {
          instance = await c.service.createTerminal(eventOrOptions);
        } else {
          const cwd = (await pickTerminalCwd(accessor))?.cwd;
          if (!cwd) {
            return;
          }
          eventOrOptions.cwd = cwd;
          instance = await c.service.createTerminal(eventOrOptions);
        }
        c.service.setActiveInstance(instance);
        await focusActiveTerminal(instance, c);
      } else {
        if (c.profileService.contributedProfiles.length > 0) {
          commandService.executeCommand(TerminalCommandId.NewWithProfile);
        } else {
          commandService.executeCommand(TerminalCommandId.Toggle);
        }
      }
    }
  });
  async function killInstance(c, instance) {
    if (!instance) {
      return;
    }
    await c.service.safeDisposeTerminal(instance);
    if (c.groupService.instances.length > 0) {
      await c.groupService.showPanel(true);
    }
  }
  registerTerminalAction({
    id: TerminalCommandId.Kill,
    title: localize2("workbench.action.terminal.kill", "Kill the Active Terminal Instance"),
    precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
    icon: killTerminalIcon,
    run: async (c) => killInstance(c, c.groupService.activeInstance)
  });
  registerTerminalAction({
    id: TerminalCommandId.KillViewOrEditor,
    title: terminalStrings.kill,
    f1: false,
    // This is an internal command used for context menus
    precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
    run: async (c) => killInstance(c, c.service.activeInstance)
  });
  registerTerminalAction({
    id: TerminalCommandId.KillAll,
    title: localize2("workbench.action.terminal.killAll", "Kill All Terminals"),
    precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
    icon: Codicon.trash,
    run: async (c) => {
      const disposePromises = [];
      for (const instance of c.service.instances) {
        disposePromises.push(c.service.safeDisposeTerminal(instance));
      }
      await Promise.all(disposePromises);
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.KillEditor,
    title: localize2("workbench.action.terminal.killEditor", "Kill the Active Terminal in Editor Area"),
    precondition: sharedWhenClause.terminalAvailable,
    keybinding: {
      primary: KeyMod.CtrlCmd | KeyCode.KeyW,
      win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.editorFocus)
    },
    run: (c, accessor) => accessor.get(ICommandService).executeCommand(CLOSE_EDITOR_COMMAND_ID)
  });
  registerTerminalAction({
    id: TerminalCommandId.KillActiveTab,
    title: terminalStrings.kill,
    f1: false,
    precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
    keybinding: {
      primary: KeyCode.Delete,
      mac: {
        primary: KeyMod.CtrlCmd | KeyCode.Backspace,
        secondary: [KeyCode.Delete]
      },
      weight: KeybindingWeight.WorkbenchContrib,
      when: TerminalContextKeys.tabsFocus
    },
    run: async (c, accessor) => {
      const disposePromises = [];
      for (const terminal of getSelectedViewInstances(accessor, true) ?? []) {
        disposePromises.push(c.service.safeDisposeTerminal(terminal));
      }
      await Promise.all(disposePromises);
      c.groupService.focusTabs();
    }
  });
  registerTerminalAction({
    id: TerminalCommandId.FocusHover,
    title: terminalStrings.focusHover,
    precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
    keybinding: {
      primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.or(TerminalContextKeys.tabsFocus, TerminalContextKeys.focus)
    },
    run: (c) => c.groupService.focusHover()
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.Clear,
    title: localize2("workbench.action.terminal.clear", "Clear"),
    precondition: sharedWhenClause.terminalAvailable,
    keybinding: [{
      primary: 0,
      mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyK },
      // Weight is higher than work workbench contributions so the keybinding remains
      // highest priority when chords are registered afterwards
      weight: KeybindingWeight.WorkbenchContrib + 1,
      // Disable the keybinding when accessibility mode is enabled as chords include
      // important screen reader keybindings such as cmd+k, cmd+i to show the hover
      when: ContextKeyExpr.or(ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()), ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, accessibleViewIsShown, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Terminal)))
    }],
    run: (activeInstance) => activeInstance.clearBuffer()
  });
  registerTerminalAction({
    id: TerminalCommandId.SelectDefaultProfile,
    title: localize2("workbench.action.terminal.selectDefaultShell", "Select Default Profile"),
    run: (c) => c.service.showProfileQuickPick("setDefault")
  });
  registerTerminalAction({
    id: TerminalCommandId.ConfigureTerminalSettings,
    title: localize2("workbench.action.terminal.openSettings", "Configure Terminal Settings"),
    precondition: sharedWhenClause.terminalAvailable,
    run: (c, accessor) => accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: "@feature:terminal" })
  });
  registerActiveInstanceAction({
    id: TerminalCommandId.SetDimensions,
    title: localize2("workbench.action.terminal.setFixedDimensions", "Set Fixed Dimensions"),
    precondition: sharedWhenClause.terminalAvailable_and_opened,
    run: (activeInstance) => activeInstance.setFixedDimensions()
  });
  registerContextualInstanceAction({
    id: TerminalCommandId.SizeToContentWidth,
    title: terminalStrings.toggleSizeToContentWidth,
    precondition: sharedWhenClause.terminalAvailable_and_opened,
    keybinding: {
      primary: KeyMod.Alt | KeyCode.KeyZ,
      weight: KeybindingWeight.WorkbenchContrib,
      when: TerminalContextKeys.focus
    },
    run: (instance) => instance.toggleSizeToContentWidth()
  });
  registerTerminalAction({
    id: TerminalCommandId.SwitchTerminal,
    title: localize2("workbench.action.terminal.switchTerminal", "Switch Terminal"),
    precondition: sharedWhenClause.terminalAvailable,
    run: async (c, accessor, args) => {
      const item = toOptionalString(args);
      if (!item) {
        return;
      }
      if (item === SeparatorSelectOption.text) {
        c.service.refreshActiveGroup();
        return;
      }
      if (item === switchTerminalShowTabsTitle) {
        accessor.get(IConfigurationService).updateValue(TerminalSettingId.TabsEnabled, true);
        return;
      }
      const terminalIndexRe = /^([0-9]+): /;
      const indexMatches = terminalIndexRe.exec(item);
      if (indexMatches) {
        c.groupService.setActiveGroupByIndex(Number(indexMatches[1]) - 1);
        return c.groupService.showPanel(true);
      }
      const quickSelectProfiles = c.profileService.availableProfiles;
      const profileSelection = item.substring(4);
      if (quickSelectProfiles) {
        const profile = quickSelectProfiles.find((profile2) => profile2.profileName === profileSelection);
        if (profile) {
          const instance = await c.service.createTerminal({
            config: profile
          });
          c.service.setActiveInstance(instance);
        } else {
          console.warn(`No profile with name "${profileSelection}"`);
        }
      } else {
        console.warn(`Unmatched terminal item: "${item}"`);
      }
    }
  });
}
function getSelectedViewInstances2(accessor, args) {
  const terminalService = accessor.get(ITerminalService);
  const result = [];
  const context = parseActionArgs(args);
  if (context && context.length > 0) {
    for (const instanceContext of context) {
      const instance = terminalService.getInstanceFromId(instanceContext.instanceId);
      if (instance) {
        result.push(instance);
      }
    }
    if (result.length > 0) {
      return result;
    }
  }
  return void 0;
}
function getSelectedViewInstances(accessor, args, args2) {
  const listService = accessor.get(IListService);
  const terminalGroupService = accessor.get(ITerminalGroupService);
  const result = [];
  const list = listService.lastFocusedList instanceof TerminalTabList ? listService.lastFocusedList : void 0;
  const selections = list?.getSelection();
  if (terminalGroupService.lastAccessedMenu === "inline-tab" && !selections?.length) {
    const instance = terminalGroupService.activeInstance;
    return instance ? [terminalGroupService.activeInstance] : void 0;
  }
  if (!list || !selections) {
    return void 0;
  }
  const focused = list.getFocus();
  const viewInstances = terminalGroupService.instances;
  if (focused.length === 1 && !selections.includes(focused[0])) {
    result.push(viewInstances[focused[0]]);
    return result;
  }
  for (const selection of selections) {
    result.push(viewInstances[selection]);
  }
  return result.filter((r) => !!r);
}
function validateTerminalName(name) {
  if (!name || name.trim().length === 0) {
    return {
      content: localize("emptyTerminalNameInfo", "Providing no name will reset it to the default value"),
      severity: Severity.Info
    };
  }
  return null;
}
function isTerminalProfile(obj) {
  return isObject(obj) && "profileName" in obj;
}
function convertOptionsOrProfileToOptions(optionsOrProfile) {
  if (isTerminalProfile(optionsOrProfile)) {
    return { config: optionsOrProfile, location: optionsOrProfile.location };
  }
  return optionsOrProfile;
}
let newWithProfileAction;
function refreshTerminalActions(detectedProfiles) {
  const profileEnum = createProfileSchemaEnums(detectedProfiles);
  newWithProfileAction?.dispose();
  newWithProfileAction = registerAction2(class extends Action2 {
    constructor() {
      super({
        id: TerminalCommandId.NewWithProfile,
        title: localize2("workbench.action.terminal.newWithProfile", "Create New Terminal (With Profile)"),
        f1: true,
        precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.webExtensionContributedProfile),
        metadata: {
          description: TerminalCommandId.NewWithProfile,
          args: [{
            name: "args",
            schema: {
              type: "object",
              required: ["profileName"],
              properties: {
                profileName: {
                  description: localize("workbench.action.terminal.newWithProfile.profileName", "The name of the profile to create"),
                  type: "string",
                  enum: profileEnum.values,
                  markdownEnumDescriptions: profileEnum.markdownDescriptions
                },
                location: {
                  description: localize("newWithProfile.location", "Where to create the terminal"),
                  type: "string",
                  enum: ["view", "editor"],
                  enumDescriptions: [
                    localize("newWithProfile.location.view", "Create the terminal in the terminal view"),
                    localize("newWithProfile.location.editor", "Create the terminal in the editor")
                  ]
                }
              }
            }
          }]
        }
      });
    }
    async run(accessor, eventOrOptionsOrProfile, profile) {
      const c = getTerminalServices(accessor);
      const workspaceContextService = accessor.get(IWorkspaceContextService);
      const commandService = accessor.get(ICommandService);
      let event;
      let options;
      let instance;
      let cwd;
      if (isObject(eventOrOptionsOrProfile) && eventOrOptionsOrProfile && hasKey(eventOrOptionsOrProfile, { profileName: true })) {
        let isSimpleArgs2 = function(obj) {
          return isObject(obj) && "location" in obj;
        };
        var isSimpleArgs = isSimpleArgs2;
        const config = c.profileService.availableProfiles.find((profile2) => profile2.profileName === eventOrOptionsOrProfile.profileName);
        if (!config) {
          throw new Error(`Could not find terminal profile "${eventOrOptionsOrProfile.profileName}"`);
        }
        options = { config };
        if (isSimpleArgs2(eventOrOptionsOrProfile)) {
          switch (eventOrOptionsOrProfile.location) {
            case "editor":
              options.location = TerminalLocation.Editor;
              break;
            case "view":
              options.location = TerminalLocation.Panel;
              break;
          }
        }
      } else if (isMouseEvent(eventOrOptionsOrProfile) || isPointerEvent(eventOrOptionsOrProfile) || isKeyboardEvent(eventOrOptionsOrProfile)) {
        event = eventOrOptionsOrProfile;
        options = profile ? { config: profile } : void 0;
      } else {
        options = convertOptionsOrProfileToOptions(eventOrOptionsOrProfile);
      }
      if (event && (event.altKey || event.ctrlKey)) {
        const parentTerminal = c.service.activeInstance;
        if (parentTerminal) {
          await c.service.createTerminal({ location: { parentTerminal }, config: options?.config });
          return;
        }
      }
      const folders = workspaceContextService.getWorkspace().folders;
      if (folders.length > 1) {
        const options2 = {
          placeHolder: localize("workbench.action.terminal.newWorkspacePlaceholder", "Select current working directory for new terminal")
        };
        const workspace = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options2]);
        if (!workspace) {
          return;
        }
        cwd = workspace.uri;
      }
      if (options) {
        options.cwd = cwd;
        instance = await c.service.createTerminal(options);
      } else {
        instance = await c.service.showProfileQuickPick("createInstance", cwd);
      }
      if (instance) {
        c.service.setActiveInstance(instance);
        await focusActiveTerminal(instance, c);
      }
    }
  });
  return newWithProfileAction;
}
function getResourceOrActiveInstance(c, resource) {
  return c.service.getInstanceFromResource(toOptionalUri(resource)) || c.service.activeInstance;
}
async function pickTerminalCwd(accessor, cancel) {
  const quickInputService = accessor.get(IQuickInputService);
  const labelService = accessor.get(ILabelService);
  const contextService = accessor.get(IWorkspaceContextService);
  const modelService = accessor.get(IModelService);
  const languageService = accessor.get(ILanguageService);
  const configurationService = accessor.get(IConfigurationService);
  const configurationResolverService = accessor.get(IConfigurationResolverService);
  const folders = contextService.getWorkspace().folders;
  if (!folders.length) {
    return;
  }
  const folderCwdPairs = await Promise.all(folders.map((e) => resolveWorkspaceFolderCwd(e, configurationService, configurationResolverService)));
  const shrinkedPairs = shrinkWorkspaceFolderCwdPairs(folderCwdPairs);
  if (shrinkedPairs.length === 1) {
    return shrinkedPairs[0];
  }
  const folderPicks = shrinkedPairs.map((pair) => {
    const label = pair.folder.name;
    const description = pair.isOverridden ? localize("workbench.action.terminal.overriddenCwdDescription", "(Overridden) {0}", labelService.getUriLabel(pair.cwd, { relative: !pair.isAbsolute })) : labelService.getUriLabel(dirname(pair.cwd), { relative: true });
    return {
      label,
      description: description !== label ? description : void 0,
      pair,
      iconClasses: getIconClasses(modelService, languageService, pair.cwd, FileKind.ROOT_FOLDER)
    };
  });
  const options = {
    placeHolder: localize("workbench.action.terminal.newWorkspacePlaceholder", "Select current working directory for new terminal"),
    matchOnDescription: true,
    canPickMany: false
  };
  const token = cancel || CancellationToken.None;
  const pick = await quickInputService.pick(folderPicks, options, token);
  return pick?.pair;
}
async function resolveWorkspaceFolderCwd(folder, configurationService, configurationResolverService) {
  const cwdConfig = configurationService.getValue(TerminalSettingId.Cwd, { resource: folder.uri });
  if (!isString(cwdConfig) || cwdConfig.length === 0) {
    return { folder, cwd: folder.uri, isAbsolute: false, isOverridden: false };
  }
  const resolvedCwdConfig = await configurationResolverService.resolveAsync(folder, cwdConfig);
  return isAbsolute(resolvedCwdConfig) || resolvedCwdConfig.startsWith(ConfigurationResolverExpression.VARIABLE_LHS) ? { folder, isAbsolute: true, isOverridden: true, cwd: URI.from({ ...folder.uri, path: resolvedCwdConfig }) } : { folder, isAbsolute: false, isOverridden: true, cwd: URI.joinPath(folder.uri, resolvedCwdConfig) };
}
function shrinkWorkspaceFolderCwdPairs(pairs) {
  const map = /* @__PURE__ */ new Map();
  for (const pair of pairs) {
    const key = pair.cwd.toString();
    const value = map.get(key);
    if (!value || key === pair.folder.uri.toString()) {
      map.set(key, pair);
    }
  }
  const selectedPairs = new Set(map.values());
  const selectedPairsInOrder = pairs.filter((x) => selectedPairs.has(x));
  return selectedPairsInOrder;
}
async function focusActiveTerminal(instance, c) {
  const target = instance ?? c.service.activeInstance ?? c.editorService.activeInstance ?? c.groupService.activeInstance;
  if (!target) {
    if (c.groupService.instances.length > 0) {
      await c.groupService.showPanel(true);
    }
    return;
  }
  await c.service.focusInstance(target);
}
async function renameWithQuickPick(c, accessor, resource) {
  let instance = resource;
  if (!instance || !instance?.rename) {
    instance = getResourceOrActiveInstance(c, resource);
  }
  if (instance) {
    const title = await accessor.get(IQuickInputService).input({
      value: instance.title,
      prompt: localize("workbench.action.terminal.rename.prompt", "Enter terminal name")
    });
    if (title) {
      instance.rename(title);
    }
  }
}
function toOptionalUri(obj) {
  return URI.isUri(obj) ? obj : void 0;
}
function toOptionalString(obj) {
  return isString(obj) ? obj : void 0;
}
export {
  TerminalLaunchHelpAction,
  getCwdForSplit,
  refreshTerminalActions,
  registerActiveInstanceAction,
  registerActiveXtermAction,
  registerContextualInstanceAction,
  registerTerminalAction,
  registerTerminalActions,
  sharedWhenClause,
  shrinkWorkspaceFolderCwdPairs,
  switchTerminalShowTabsTitle,
  validateTerminalName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNLZXlib2FyZEV2ZW50LCBpc01vdXNlRXZlbnQsIGlzUG9pbnRlckV2ZW50LCBnZXRBY3RpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzQWJzb2x1dGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaGFzS2V5LCBpc09iamVjdCwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVEIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJQWN0aW9uMk9wdGlvbnMsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUGlja09wdGlvbnMsIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2ZpbGUsIFRlcm1pbmFsRXhpdFJlYXNvbiwgVGVybWluYWxJY29uLCBUZXJtaW5hbExvY2F0aW9uLCBUZXJtaW5hbFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVQcm9maWxlU2NoZW1hRW51bXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxQcm9maWxlcy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBQSUNLX1dPUktTUEFDRV9GT0xERVJfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93b3Jrc3BhY2VDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDTE9TRV9FRElUT1JfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5qcyc7XG5pbXBvcnQgeyBlZGl0b3JHcm91cFRvQ29sdW1uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cENvbHVtbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIEFVWF9XSU5ET1dfR1JPVVAsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYWNjZXNzaWJsZVZpZXdDdXJyZW50UHJvdmlkZXJJZCwgYWNjZXNzaWJsZVZpZXdJc1Nob3duLCBhY2Nlc3NpYmxlVmlld09uTGFzdExpbmUgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVJlbW90ZVRlcm1pbmFsQXR0YWNoVGFyZ2V0LCBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCBJVGVybWluYWxQcm9maWxlU2VydmljZSwgVEVSTUlOQUxfVklFV19JRCwgVGVybWluYWxDb21tYW5kSWQgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb250ZXh0S2V5cyB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbENvbnRleHRLZXkuanMnO1xuaW1wb3J0IHsgdGVybWluYWxTdHJpbmdzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsU3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBEaXJlY3Rpb24sIElDcmVhdGVUZXJtaW5hbE9wdGlvbnMsIElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2UsIElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJVGVybWluYWxFZGl0b3JTZXJ2aWNlLCBJVGVybWluYWxFZGl0aW5nU2VydmljZSwgSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLCBJVGVybWluYWxTZXJ2aWNlLCBJWHRlcm1UZXJtaW5hbCB9IGZyb20gJy4vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgaXNBdXhpbGlhcnlXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEluc3RhbmNlQ29udGV4dCB9IGZyb20gJy4vdGVybWluYWxDb250ZXh0TWVudS5qcyc7XG5pbXBvcnQgeyBnZXRDb2xvckNsYXNzLCBnZXRJY29uSWQsIGdldFVyaUNsYXNzZXMgfSBmcm9tICcuL3Rlcm1pbmFsSWNvbi5qcyc7XG5pbXBvcnQgeyBraWxsVGVybWluYWxJY29uLCBuZXdUZXJtaW5hbEljb24gfSBmcm9tICcuL3Rlcm1pbmFsSWNvbnMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4vdGVybWluYWxQcm9maWxlUXVpY2twaWNrLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsVGFiTGlzdCB9IGZyb20gJy4vdGVybWluYWxUYWJzTGlzdC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgU2VwYXJhdG9yU2VsZWN0T3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NlbGVjdEJveC9zZWxlY3RCb3guanMnO1xuXG5leHBvcnQgY29uc3Qgc3dpdGNoVGVybWluYWxTaG93VGFic1RpdGxlID0gbG9jYWxpemUoJ3Nob3dUZXJtaW5hbFRhYnMnLCBcIlNob3cgVGFic1wiKTtcblxuY29uc3QgY2F0ZWdvcnkgPSB0ZXJtaW5hbFN0cmluZ3MuYWN0aW9uQ2F0ZWdvcnk7XG5cbi8vIFNvbWUgdGVybWluYWwgY29udGV4dCBrZXlzIGdldCBjb21wbGljYXRlZC4gU2luY2Ugbm9ybWFsaXppbmcgYW5kL29yIGNvbnRleHQga2V5cyBjYW4gYmVcbi8vIGV4cGVuc2l2ZSB0aGlzIGlzIGRvbmUgb25jZSBwZXIgY29udGV4dCBrZXkgYW5kIHNoYXJlZC5cbmV4cG9ydCBjb25zdCBzaGFyZWRXaGVuQ2xhdXNlID0gKCgpID0+IHtcblx0Y29uc3QgdGVybWluYWxBdmFpbGFibGUgPSBDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNCZWVuQ3JlYXRlZCk7XG5cdHJldHVybiB7XG5cdFx0dGVybWluYWxBdmFpbGFibGUsXG5cdFx0dGVybWluYWxBdmFpbGFibGVfYW5kX29wZW5lZDogQ29udGV4dEtleUV4cHIuYW5kKHRlcm1pbmFsQXZhaWxhYmxlLCBUZXJtaW5hbENvbnRleHRLZXlzLmlzT3BlbiksXG5cdFx0dGVybWluYWxBdmFpbGFibGVfYW5kX2VkaXRvckFjdGl2ZTogQ29udGV4dEtleUV4cHIuYW5kKHRlcm1pbmFsQXZhaWxhYmxlLCBUZXJtaW5hbENvbnRleHRLZXlzLnRlcm1pbmFsRWRpdG9yQWN0aXZlKSxcblx0XHR0ZXJtaW5hbEF2YWlsYWJsZV9hbmRfc2luZ3VsYXJTZWxlY3Rpb246IENvbnRleHRLZXlFeHByLmFuZCh0ZXJtaW5hbEF2YWlsYWJsZSwgVGVybWluYWxDb250ZXh0S2V5cy50YWJzU2luZ3VsYXJTZWxlY3Rpb24pLFxuXHRcdGZvY3VzSW5BbnlfYW5kX25vcm1hbEJ1ZmZlcjogQ29udGV4dEtleUV4cHIuYW5kKFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXNJbkFueSwgVGVybWluYWxDb250ZXh0S2V5cy5hbHRCdWZmZXJBY3RpdmUubmVnYXRlKCkpXG5cdH07XG59KSgpO1xuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmtzcGFjZUZvbGRlckN3ZFBhaXIge1xuXHRmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXI7XG5cdGN3ZDogVVJJO1xuXHRpc0Fic29sdXRlOiBib29sZWFuO1xuXHRpc092ZXJyaWRkZW46IGJvb2xlYW47XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRDd2RGb3JTcGxpdChcblx0aW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLFxuXHRmb2xkZXJzOiBJV29ya3NwYWNlRm9sZGVyW10gfCB1bmRlZmluZWQsXG5cdGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdGNvbmZpZ1NlcnZpY2U6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlXG4pOiBQcm9taXNlPHN0cmluZyB8IFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRzd2l0Y2ggKGNvbmZpZ1NlcnZpY2UuY29uZmlnLnNwbGl0Q3dkKSB7XG5cdFx0Y2FzZSAnd29ya3NwYWNlUm9vdCc6XG5cdFx0XHRpZiAoZm9sZGVycyAhPT0gdW5kZWZpbmVkICYmIGNvbW1hbmRTZXJ2aWNlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKGZvbGRlcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZvbGRlcnNbMF0udXJpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGZvbGRlcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdC8vIE9ubHkgY2hvb3NlIGEgcGF0aCB3aGVuIHRoZXJlJ3MgbW9yZSB0aGFuIDEgZm9sZGVyXG5cdFx0XHRcdFx0Y29uc3Qgb3B0aW9uczogSVBpY2tPcHRpb25zPElRdWlja1BpY2tJdGVtPiA9IHtcblx0XHRcdFx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5uZXdXb3Jrc3BhY2VQbGFjZWhvbGRlcicsIFwiU2VsZWN0IGN1cnJlbnQgd29ya2luZyBkaXJlY3RvcnkgZm9yIG5ldyB0ZXJtaW5hbFwiKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8SVdvcmtzcGFjZUZvbGRlcj4oUElDS19XT1JLU1BBQ0VfRk9MREVSX0NPTU1BTkRfSUQsIFtvcHRpb25zXSk7XG5cdFx0XHRcdFx0aWYgKCF3b3Jrc3BhY2UpIHtcblx0XHRcdFx0XHRcdC8vIERvbid0IHNwbGl0IHRoZSBpbnN0YW5jZSBpZiB0aGUgd29ya3NwYWNlIHBpY2tlciB3YXMgY2FuY2VsZWRcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUod29ya3NwYWNlLnVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiAnJztcblx0XHRjYXNlICdpbml0aWFsJzpcblx0XHRcdHJldHVybiBpbnN0YW5jZS5nZXRJbml0aWFsQ3dkKCk7XG5cdFx0Y2FzZSAnaW5oZXJpdGVkJzpcblx0XHRcdHJldHVybiBpbnN0YW5jZS5nZXRTcGVjdWxhdGl2ZUN3ZCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbExhdW5jaEhlbHBBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5sYXVuY2hIZWxwJywgbG9jYWxpemUoJ3Rlcm1pbmFsTGF1bmNoSGVscCcsIFwiT3BlbiBIZWxwXCIpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4oJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS10cm91Ymxlc2hvb3QtdGVybWluYWwtbGF1bmNoJyk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIHdyYXBwZXIgZnVuY3Rpb24gYXJvdW5kIHJlZ2lzdGVyQWN0aW9uMiB0byBoZWxwIG1ha2UgcmVnaXN0ZXJpbmcgdGVybWluYWwgYWN0aW9ucyBtb3JlIGNvbmNpc2UuXG4gKiBUaGUgZm9sbG93aW5nIGRlZmF1bHQgb3B0aW9ucyBhcmUgdXNlZCBpZiB1bmRlZmluZWQ6XG4gKlxuICogLSBgZjFgOiB0cnVlXG4gKiAtIGBjYXRlZ29yeWA6IFRlcm1pbmFsXG4gKiAtIGBwcmVjb25kaXRpb25gOiBUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oXG5cdG9wdGlvbnM6IElBY3Rpb24yT3B0aW9ucyAmIHsgcnVuOiAoYzogSVRlcm1pbmFsU2VydmljZXNDb2xsZWN0aW9uLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IHVua25vd24sIGFyZ3MyPzogdW5rbm93bikgPT4gdm9pZCB8IFByb21pc2U8dW5rbm93bj4gfVxuKTogSURpc3Bvc2FibGUge1xuXHQvLyBTZXQgZGVmYXVsdHNcblx0b3B0aW9ucy5mMSA9IG9wdGlvbnMuZjEgPz8gdHJ1ZTtcblx0b3B0aW9ucy5jYXRlZ29yeSA9IG9wdGlvbnMuY2F0ZWdvcnkgPz8gY2F0ZWdvcnk7XG5cdG9wdGlvbnMucHJlY29uZGl0aW9uID0gb3B0aW9ucy5wcmVjb25kaXRpb24gPz8gVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkO1xuXHQvLyBSZW1vdmUgcnVuIGZ1bmN0aW9uIGZyb20gb3B0aW9ucyBzbyBpdCdzIG5vdCBwYXNzZWQgdGhyb3VnaCB0byByZWdpc3RlckFjdGlvbjJcblx0Y29uc3QgcnVuRnVuYyA9IG9wdGlvbnMucnVuO1xuXHRjb25zdCBzdHJpY3RPcHRpb25zOiBJQWN0aW9uMk9wdGlvbnMgJiB7IHJ1bj86IChjOiBJVGVybWluYWxTZXJ2aWNlc0NvbGxlY3Rpb24sIGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzPzogdW5rbm93bikgPT4gdm9pZCB8IFByb21pc2U8dW5rbm93bj4gfSA9IG9wdGlvbnM7XG5cdGRlbGV0ZSAoc3RyaWN0T3B0aW9ucyBhcyBJQWN0aW9uMk9wdGlvbnMgJiB7IHJ1bj86IChjOiBJVGVybWluYWxTZXJ2aWNlc0NvbGxlY3Rpb24sIGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzPzogdW5rbm93bikgPT4gdm9pZCB8IFByb21pc2U8dW5rbm93bj4gfSlbJ3J1biddO1xuXHQvLyBSZWdpc3RlclxuXHRyZXR1cm4gcmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcihzdHJpY3RPcHRpb25zIGFzIElBY3Rpb24yT3B0aW9ucyk7XG5cdFx0fVxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IHVua25vd24sIGFyZ3MyPzogdW5rbm93bikge1xuXHRcdFx0cmV0dXJuIHJ1bkZ1bmMoZ2V0VGVybWluYWxTZXJ2aWNlcyhhY2Nlc3NvciksIGFjY2Vzc29yLCBhcmdzLCBhcmdzMik7XG5cdFx0fVxuXHR9KTtcbn1cblxuZnVuY3Rpb24gcGFyc2VBY3Rpb25BcmdzKGFyZ3M/OiB1bmtub3duKTogSW5zdGFuY2VDb250ZXh0W10gfCB1bmRlZmluZWQge1xuXHRpZiAoQXJyYXkuaXNBcnJheShhcmdzKSkge1xuXHRcdGlmIChhcmdzLmV2ZXJ5KGUgPT4gZSBpbnN0YW5jZW9mIEluc3RhbmNlQ29udGV4dCkpIHtcblx0XHRcdHJldHVybiBhcmdzIGFzIEluc3RhbmNlQ29udGV4dFtdO1xuXHRcdH1cblx0fSBlbHNlIGlmIChhcmdzIGluc3RhbmNlb2YgSW5zdGFuY2VDb250ZXh0KSB7XG5cdFx0cmV0dXJuIFthcmdzXTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuLyoqXG4gKiBBIHdyYXBwZXIgYXJvdW5kIHtAbGluayByZWdpc3RlclRlcm1pbmFsQWN0aW9ufSB0aGF0IHJ1bnMgYSBjYWxsYmFjayBmb3IgYWxsIGN1cnJlbnRseSBzZWxlY3RlZFxuICogaW5zdGFuY2VzIHByb3ZpZGVkIGluIHRoZSBhY3Rpb24gY29udGV4dC4gVGhpcyBmYWxscyBiYWNrIHRvIHRoZSBhY3RpdmUgaW5zdGFuY2UgaWYgdGhlcmUgYXJlIG5vXG4gKiBjb250ZXh0dWFsIGluc3RhbmNlcyBwcm92aWRlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29udGV4dHVhbEluc3RhbmNlQWN0aW9uKFxuXHRvcHRpb25zOiBJQWN0aW9uMk9wdGlvbnMgJiB7XG5cdFx0LyoqXG5cdFx0ICogV2hlbiBzcGVjaWZpZWQsIG9ubHkgdGhpcyB0eXBlIG9mIGFjdGl2ZSBpbnN0YW5jZSB3aWxsIGJlIHVzZWQgd2hlbiB0aGVyZSBhcmUgbm9cblx0XHQgKiBjb250ZXh0dWFsIGluc3RhbmNlcy5cblx0XHQgKi9cblx0XHRhY3RpdmVJbnN0YW5jZVR5cGU/OiAndmlldycgfCAnZWRpdG9yJztcblx0XHRydW46IChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGM6IElUZXJtaW5hbFNlcnZpY2VzQ29sbGVjdGlvbiwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiB1bmtub3duKSA9PiB2b2lkIHwgUHJvbWlzZTx1bmtub3duPjtcblx0XHQvKipcblx0XHQgKiBBIGNhbGxiYWNrIHRvIHJ1biBhZnRlciB0aGUgYHJ1bmAgY2FsbGJhY2tzIGhhdmUgY29tcGxldGVkLlxuXHRcdCAqIEBwYXJhbSBpbnN0YW5jZXMgVGhlIHNlbGVjdGVkIGluc3RhbmNlKHMpIHRoYXQgdGhlIGNvbW1hbmQgd2FzIHJ1biBvbi5cblx0XHQgKi9cblx0XHRydW5BZnRlcj86IChpbnN0YW5jZXM6IElUZXJtaW5hbEluc3RhbmNlW10sIGM6IElUZXJtaW5hbFNlcnZpY2VzQ29sbGVjdGlvbiwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiB1bmtub3duKSA9PiB2b2lkIHwgUHJvbWlzZTx1bmtub3duPjtcblx0fVxuKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBvcmlnaW5hbFJ1biA9IG9wdGlvbnMucnVuO1xuXHRyZXR1cm4gcmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0Li4ub3B0aW9ucyxcblx0XHRydW46IGFzeW5jIChjLCBhY2Nlc3NvciwgZm9jdXNlZEluc3RhbmNlQXJncywgYWxsSW5zdGFuY2VBcmdzKSA9PiB7XG5cdFx0XHRsZXQgaW5zdGFuY2VzID0gZ2V0U2VsZWN0ZWRWaWV3SW5zdGFuY2VzMihhY2Nlc3NvciwgYWxsSW5zdGFuY2VBcmdzKTtcblx0XHRcdGlmICghaW5zdGFuY2VzKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUluc3RhbmNlID0gKFxuXHRcdFx0XHRcdG9wdGlvbnMuYWN0aXZlSW5zdGFuY2VUeXBlID09PSAndmlldydcblx0XHRcdFx0XHRcdD8gYy5ncm91cFNlcnZpY2Vcblx0XHRcdFx0XHRcdDogb3B0aW9ucy5hY3RpdmVJbnN0YW5jZVR5cGUgPT09ICdlZGl0b3InID9cblx0XHRcdFx0XHRcdFx0Yy5lZGl0b3JTZXJ2aWNlXG5cdFx0XHRcdFx0XHRcdDogYy5zZXJ2aWNlXG5cdFx0XHRcdCkuYWN0aXZlSW5zdGFuY2U7XG5cdFx0XHRcdGlmICghYWN0aXZlSW5zdGFuY2UpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aW5zdGFuY2VzID0gW2FjdGl2ZUluc3RhbmNlXTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdHM6IChQcm9taXNlPHVua25vd24+IHwgdm9pZClbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiBpbnN0YW5jZXMpIHtcblx0XHRcdFx0cmVzdWx0cy5wdXNoKG9yaWdpbmFsUnVuKGluc3RhbmNlLCBjLCBhY2Nlc3NvciwgZm9jdXNlZEluc3RhbmNlQXJncykpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocmVzdWx0cyk7XG5cdFx0XHRpZiAob3B0aW9ucy5ydW5BZnRlcikge1xuXHRcdFx0XHRvcHRpb25zLnJ1bkFmdGVyKGluc3RhbmNlcywgYywgYWNjZXNzb3IsIGZvY3VzZWRJbnN0YW5jZUFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG5cbi8qKlxuICogQSB3cmFwcGVyIGFyb3VuZCB7QGxpbmsgcmVnaXN0ZXJUZXJtaW5hbEFjdGlvbn0gdGhhdCBlbnN1cmVzIGFuIGFjdGl2ZSBpbnN0YW5jZSBleGlzdHMgYW5kXG4gKiBwcm92aWRlcyBpdCB0byB0aGUgcnVuIGZ1bmN0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJBY3RpdmVJbnN0YW5jZUFjdGlvbihcblx0b3B0aW9uczogSUFjdGlvbjJPcHRpb25zICYgeyBydW46IChhY3RpdmVJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGM6IElUZXJtaW5hbFNlcnZpY2VzQ29sbGVjdGlvbiwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiB1bmtub3duKSA9PiB2b2lkIHwgUHJvbWlzZTx1bmtub3duPiB9XG4pOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IG9yaWdpbmFsUnVuID0gb3B0aW9ucy5ydW47XG5cdHJldHVybiByZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHQuLi5vcHRpb25zLFxuXHRcdHJ1bjogKGMsIGFjY2Vzc29yLCBhcmdzKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVJbnN0YW5jZSA9IGMuc2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRcdGlmIChhY3RpdmVJbnN0YW5jZSkge1xuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxSdW4oYWN0aXZlSW5zdGFuY2UsIGMsIGFjY2Vzc29yLCBhcmdzKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xufVxuXG4vKipcbiAqIEEgd3JhcHBlciBhcm91bmQge0BsaW5rIHJlZ2lzdGVyVGVybWluYWxBY3Rpb259IHRoYXQgZW5zdXJlcyBhbiBhY3RpdmUgdGVybWluYWxcbiAqIGV4aXN0cyBhbmQgcHJvdmlkZXMgaXQgdG8gdGhlIHJ1biBmdW5jdGlvbi5cbiAqXG4gKiBUaGlzIGluY2x1ZGVzIGRldGFjaGVkIHh0ZXJtIHRlcm1pbmFscyB0aGF0IGFyZSBub3QgbWFuYWdlZCBieSBhbiB7QGxpbmsgSVRlcm1pbmFsSW5zdGFuY2V9LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJBY3RpdmVYdGVybUFjdGlvbihcblx0b3B0aW9uczogSUFjdGlvbjJPcHRpb25zICYgeyBydW46IChhY3RpdmVUZXJtaW5hbDogSVh0ZXJtVGVybWluYWwsIGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlLCBhcmdzPzogdW5rbm93bikgPT4gdm9pZCB8IFByb21pc2U8dW5rbm93bj4gfVxuKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBvcmlnaW5hbFJ1biA9IG9wdGlvbnMucnVuO1xuXHRyZXR1cm4gcmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0Li4ub3B0aW9ucyxcblx0XHRydW46IChjLCBhY2Nlc3NvciwgYXJncykgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlRGV0YWNoZWQgPSBJdGVyYWJsZS5maW5kKGMuc2VydmljZS5kZXRhY2hlZEluc3RhbmNlcywgZCA9PiBkLnh0ZXJtLmlzRm9jdXNlZCk7XG5cdFx0XHRpZiAoYWN0aXZlRGV0YWNoZWQpIHtcblx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsUnVuKGFjdGl2ZURldGFjaGVkLnh0ZXJtLCBhY2Nlc3NvciwgYWN0aXZlRGV0YWNoZWQsIGFyZ3MpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3RpdmVJbnN0YW5jZSA9IGMuc2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRcdGlmIChhY3RpdmVJbnN0YW5jZT8ueHRlcm0pIHtcblx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsUnVuKGFjdGl2ZUluc3RhbmNlLnh0ZXJtLCBhY2Nlc3NvciwgYWN0aXZlSW5zdGFuY2UsIGFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsU2VydmljZXNDb2xsZWN0aW9uIHtcblx0c2VydmljZTogSVRlcm1pbmFsU2VydmljZTtcblx0Y29uZmlnU2VydmljZTogSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGdyb3VwU2VydmljZTogSVRlcm1pbmFsR3JvdXBTZXJ2aWNlO1xuXHRpbnN0YW5jZVNlcnZpY2U6IElUZXJtaW5hbEluc3RhbmNlU2VydmljZTtcblx0ZWRpdG9yU2VydmljZTogSVRlcm1pbmFsRWRpdG9yU2VydmljZTtcblx0ZWRpdGluZ1NlcnZpY2U6IElUZXJtaW5hbEVkaXRpbmdTZXJ2aWNlO1xuXHRwcm9maWxlU2VydmljZTogSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2U7XG5cdHByb2ZpbGVSZXNvbHZlclNlcnZpY2U6IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2U7XG59XG5cbmZ1bmN0aW9uIGdldFRlcm1pbmFsU2VydmljZXMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBJVGVybWluYWxTZXJ2aWNlc0NvbGxlY3Rpb24ge1xuXHRyZXR1cm4ge1xuXHRcdHNlcnZpY2U6IGFjY2Vzc29yLmdldChJVGVybWluYWxTZXJ2aWNlKSxcblx0XHRjb25maWdTZXJ2aWNlOiBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UpLFxuXHRcdGdyb3VwU2VydmljZTogYWNjZXNzb3IuZ2V0KElUZXJtaW5hbEdyb3VwU2VydmljZSksXG5cdFx0aW5zdGFuY2VTZXJ2aWNlOiBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlKSxcblx0XHRlZGl0b3JTZXJ2aWNlOiBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsRWRpdG9yU2VydmljZSksXG5cdFx0ZWRpdGluZ1NlcnZpY2U6IGFjY2Vzc29yLmdldChJVGVybWluYWxFZGl0aW5nU2VydmljZSksXG5cdFx0cHJvZmlsZVNlcnZpY2U6IGFjY2Vzc29yLmdldChJVGVybWluYWxQcm9maWxlU2VydmljZSksXG5cdFx0cHJvZmlsZVJlc29sdmVyU2VydmljZTogYWNjZXNzb3IuZ2V0KElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UpXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclRlcm1pbmFsQWN0aW9ucygpIHtcblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLk5ld0luQWN0aXZlV29ya3NwYWNlLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubmV3SW5BY3RpdmVXb3Jrc3BhY2UnLCAnQ3JlYXRlIE5ldyBUZXJtaW5hbCAoSW4gQWN0aXZlIFdvcmtzcGFjZSknKSxcblx0XHRydW46IGFzeW5jIChjKSA9PiB7XG5cdFx0XHRpZiAoYy5zZXJ2aWNlLmlzUHJvY2Vzc1N1cHBvcnRSZWdpc3RlcmVkKSB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgYy5zZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgbG9jYXRpb246IGMuY29uZmlnU2VydmljZS5kZWZhdWx0TG9jYXRpb24gfSk7XG5cdFx0XHRcdGlmICghaW5zdGFuY2UpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Yy5zZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdFx0YXdhaXQgZm9jdXNBY3RpdmVUZXJtaW5hbChpbnN0YW5jZSwgYyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBSZWdpc3RlciBuZXcgd2l0aCBwcm9maWxlIGNvbW1hbmRcblx0cmVmcmVzaFRlcm1pbmFsQWN0aW9ucyhbXSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNyZWF0ZVRlcm1pbmFsRWRpdG9yLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY3JlYXRlVGVybWluYWxFZGl0b3InLCAnQ3JlYXRlIE5ldyBUZXJtaW5hbCBpbiBFZGl0b3IgQXJlYScpLFxuXHRcdHJ1bjogYXN5bmMgKGMsIF8sIGFyZ3MpID0+IHtcblx0XHRcdGZ1bmN0aW9uIGlzQ3JlYXRlVGVybWluYWxPcHRpb25zKG9iajogdW5rbm93bik6IG9iaiBpcyBJQ3JlYXRlVGVybWluYWxPcHRpb25zIHtcblx0XHRcdFx0cmV0dXJuIGlzT2JqZWN0KG9iaikgJiYgJ2xvY2F0aW9uJyBpbiBvYmo7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBvcHRpb25zID0gaXNDcmVhdGVUZXJtaW5hbE9wdGlvbnMoYXJncykgPyBhcmdzIDogeyBsb2NhdGlvbjogeyB2aWV3Q29sdW1uOiBBQ1RJVkVfR1JPVVAgfSB9O1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCBjLnNlcnZpY2UuY3JlYXRlVGVybWluYWwob3B0aW9ucyk7XG5cdFx0XHRhd2FpdCBpbnN0YW5jZS5mb2N1c1doZW5SZWFkeSgpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNyZWF0ZVRlcm1pbmFsRWRpdG9yU2FtZUdyb3VwLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY3JlYXRlVGVybWluYWxFZGl0b3InLCAnQ3JlYXRlIE5ldyBUZXJtaW5hbCBpbiBFZGl0b3IgQXJlYScpLFxuXHRcdGYxOiBmYWxzZSxcblx0XHRydW46IGFzeW5jIChjLCBhY2Nlc3NvciwgYXJncykgPT4ge1xuXHRcdFx0Ly8gRm9yY2UgdGhlIGVkaXRvciBpbnRvIHRoZSBzYW1lIGVkaXRvciBncm91cCBpZiBpdCdzIGxvY2tlZC4gVGhpcyBjb21tYW5kIGlzIG9ubHkgZXZlclxuXHRcdFx0Ly8gY2FsbGVkIHdoZW4gYSB0ZXJtaW5hbCBpcyB0aGUgYWN0aXZlIGVkaXRvclxuXHRcdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRcdGxvY2F0aW9uOiB7XG5cdFx0XHRcdFx0dmlld0NvbHVtbjogZWRpdG9yR3JvdXBUb0NvbHVtbihlZGl0b3JHcm91cHNTZXJ2aWNlLCBlZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2ZUdyb3VwKSxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBpbnN0YW5jZS5mb2N1c1doZW5SZWFkeSgpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNyZWF0ZVRlcm1pbmFsRWRpdG9yU2lkZSxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNyZWF0ZVRlcm1pbmFsRWRpdG9yU2lkZScsICdDcmVhdGUgTmV3IFRlcm1pbmFsIGluIEVkaXRvciBBcmVhIHRvIHRoZSBTaWRlJyksXG5cdFx0cnVuOiBhc3luYyAoYykgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCBjLnNlcnZpY2UuY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0XHRsb2NhdGlvbjogeyB2aWV3Q29sdW1uOiBTSURFX0dST1VQIH1cblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgaW5zdGFuY2UuZm9jdXNXaGVuUmVhZHkoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5OZXdJbk5ld1dpbmRvdyxcblx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLm5ld0luTmV3V2luZG93LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkJhY2txdW90ZSxcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkJhY2txdW90ZSB9LFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHJ1bjogYXN5bmMgKGMpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgYy5zZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdFx0bG9jYXRpb246IHtcblx0XHRcdFx0XHR2aWV3Q29sdW1uOiBBVVhfV0lORE9XX0dST1VQLFxuXHRcdFx0XHRcdGF1eGlsaWFyeTogeyBjb21wYWN0OiB0cnVlIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGluc3RhbmNlLmZvY3VzV2hlblJlYWR5KCk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckNvbnRleHR1YWxJbnN0YW5jZUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLk1vdmVUb0VkaXRvcixcblx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLm1vdmVUb0VkaXRvcixcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGVfYW5kX29wZW5lZCxcblx0XHRhY3RpdmVJbnN0YW5jZVR5cGU6ICd2aWV3Jyxcblx0XHRydW46IChpbnN0YW5jZSwgYykgPT4gYy5zZXJ2aWNlLm1vdmVUb0VkaXRvcihpbnN0YW5jZSksXG5cdFx0cnVuQWZ0ZXI6IChpbnN0YW5jZXMpID0+IGluc3RhbmNlcy5hdCgtMSk/LmZvY3VzKClcblx0fSk7XG5cblx0cmVnaXN0ZXJDb250ZXh0dWFsSW5zdGFuY2VBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Nb3ZlSW50b05ld1dpbmRvdyxcblx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLm1vdmVJbnRvTmV3V2luZG93LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZV9hbmRfb3BlbmVkLFxuXHRcdHJ1bjogKGluc3RhbmNlLCBjKSA9PiBjLnNlcnZpY2UubW92ZUludG9OZXdFZGl0b3IoaW5zdGFuY2UpLFxuXHRcdHJ1bkFmdGVyOiAoaW5zdGFuY2VzKSA9PiBpbnN0YW5jZXMuYXQoLTEpPy5mb2N1cygpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Nb3ZlVG9UZXJtaW5hbFBhbmVsLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MubW92ZVRvVGVybWluYWxQYW5lbCxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGVfYW5kX2VkaXRvckFjdGl2ZSxcblx0XHRydW46IChjLCBfLCBhcmdzKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSB0b09wdGlvbmFsVXJpKGFyZ3MpID8/IGMuZWRpdG9yU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRcdGlmIChzb3VyY2UpIHtcblx0XHRcdFx0Yy5zZXJ2aWNlLm1vdmVUb1Rlcm1pbmFsVmlldyhzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkZvY3VzUHJldmlvdXNQYW5lLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNQcmV2aW91c1BhbmUnLCAnRm9jdXMgUHJldmlvdXMgVGVybWluYWwgaW4gVGVybWluYWwgR3JvdXAnKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5MZWZ0QXJyb3csXG5cdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQWx0IHwgS2V5Q29kZS5VcEFycm93XSxcblx0XHRcdG1hYzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkxlZnRBcnJvdyxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkFsdCB8IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93XVxuXHRcdFx0fSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLCBUZXJtaW5hbENvbnRleHRLZXlzLnNwbGl0VGVybWluYWxBY3RpdmUpLFxuXHRcdFx0Ly8gU2hvdWxkIHdpbiBvdmVyIHNlbmQgc2VxdWVuY2UgY29tbWFuZHMgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1OTMyNlxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0cnVuOiBhc3luYyAoYykgPT4ge1xuXHRcdFx0Yy5ncm91cFNlcnZpY2UuYWN0aXZlR3JvdXA/LmZvY3VzUHJldmlvdXNQYW5lKCk7XG5cdFx0XHRhd2FpdCBjLmdyb3VwU2VydmljZS5zaG93UGFuZWwodHJ1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuRm9jdXNOZXh0UGFuZSxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzTmV4dFBhbmUnLCAnRm9jdXMgTmV4dCBUZXJtaW5hbCBpbiBUZXJtaW5hbCBHcm91cCcpLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQWx0IHwgS2V5Q29kZS5Eb3duQXJyb3ddLFxuXHRcdFx0bWFjOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkFsdCB8IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3ddXG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIFRlcm1pbmFsQ29udGV4dEtleXMuc3BsaXRUZXJtaW5hbEFjdGl2ZSksXG5cdFx0XHQvLyBTaG91bGQgd2luIG92ZXIgc2VuZCBzZXF1ZW5jZSBjb21tYW5kcyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjU5MzI2XG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDFcblx0XHR9LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46IGFzeW5jIChjKSA9PiB7XG5cdFx0XHRjLmdyb3VwU2VydmljZS5hY3RpdmVHcm91cD8uZm9jdXNOZXh0UGFuZSgpO1xuXHRcdFx0YXdhaXQgYy5ncm91cFNlcnZpY2Uuc2hvd1BhbmVsKHRydWUpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlJlc2l6ZVBhbmVMZWZ0LFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVzaXplUGFuZUxlZnQnLCAnUmVzaXplIFRlcm1pbmFsIExlZnQnKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRsaW51eDogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuTGVmdEFycm93IH0sXG5cdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuTGVmdEFycm93IH0sXG5cdFx0XHR3aGVuOiBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46IChjKSA9PiBjLmdyb3VwU2VydmljZS5hY3RpdmVHcm91cD8ucmVzaXplUGFuZShEaXJlY3Rpb24uTGVmdClcblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlJlc2l6ZVBhbmVSaWdodCxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJlc2l6ZVBhbmVSaWdodCcsICdSZXNpemUgVGVybWluYWwgUmlnaHQnKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRsaW51eDogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuUmlnaHRBcnJvdyB9LFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLlJpZ2h0QXJyb3cgfSxcblx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKGMpID0+IGMuZ3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwPy5yZXNpemVQYW5lKERpcmVjdGlvbi5SaWdodClcblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlJlc2l6ZVBhbmVVcCxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJlc2l6ZVBhbmVVcCcsICdSZXNpemUgVGVybWluYWwgVXAnKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuVXBBcnJvdyB9LFxuXHRcdFx0d2hlbjogVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0cnVuOiAoYykgPT4gYy5ncm91cFNlcnZpY2UuYWN0aXZlR3JvdXA/LnJlc2l6ZVBhbmUoRGlyZWN0aW9uLlVwKVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUmVzaXplUGFuZURvd24sXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5yZXNpemVQYW5lRG93bicsICdSZXNpemUgVGVybWluYWwgRG93bicpLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5Eb3duQXJyb3cgfSxcblx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKGMpID0+IGMuZ3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwPy5yZXNpemVQYW5lKERpcmVjdGlvbi5Eb3duKVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuRm9jdXMsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5mb2N1cyxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCwgYWNjZXNzaWJsZVZpZXdPbkxhc3RMaW5lLCBhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkLmlzRXF1YWxUbyhBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuVGVybWluYWwpKSxcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogYXN5bmMgKGMpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYy5zZXJ2aWNlLmFjdGl2ZUluc3RhbmNlIHx8IGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGxvY2F0aW9uOiBUZXJtaW5hbExvY2F0aW9uLlBhbmVsIH0pO1xuXHRcdFx0aWYgKCFpbnN0YW5jZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjLnNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0YXdhaXQgZm9jdXNBY3RpdmVUZXJtaW5hbChpbnN0YW5jZSwgYyk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuRm9jdXNUYWJzLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXMudGFic1ZpZXcnLCAnRm9jdXMgVGVybWluYWwgVGFicyBWaWV3JyksXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkJhY2tzbGFzaCxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoVGVybWluYWxDb250ZXh0S2V5cy50YWJzRm9jdXMsIFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMpLFxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKGMpID0+IGMuZ3JvdXBTZXJ2aWNlLmZvY3VzVGFicygpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Gb2N1c05leHQsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c05leHQnLCAnRm9jdXMgTmV4dCBUZXJtaW5hbCBHcm91cCcpLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUGFnZURvd24sXG5cdFx0XHRtYWM6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkJyYWNrZXRSaWdodFxuXHRcdFx0fSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLCBUZXJtaW5hbENvbnRleHRLZXlzLmVkaXRvckZvY3VzLm5lZ2F0ZSgpKSxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0fSxcblx0XHRydW46IGFzeW5jIChjKSA9PiB7XG5cdFx0XHRjLmdyb3VwU2VydmljZS5zZXRBY3RpdmVHcm91cFRvTmV4dCgpO1xuXHRcdFx0YXdhaXQgYy5ncm91cFNlcnZpY2Uuc2hvd1BhbmVsKHRydWUpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkZvY3VzUHJldmlvdXMsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c1ByZXZpb3VzJywgJ0ZvY3VzIFByZXZpb3VzIFRlcm1pbmFsIEdyb3VwJyksXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5QYWdlVXAsXG5cdFx0XHRtYWM6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkJyYWNrZXRMZWZ0XG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIFRlcm1pbmFsQ29udGV4dEtleXMuZWRpdG9yRm9jdXMubmVnYXRlKCkpLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHJ1bjogYXN5bmMgKGMpID0+IHtcblx0XHRcdGMuZ3JvdXBTZXJ2aWNlLnNldEFjdGl2ZUdyb3VwVG9QcmV2aW91cygpO1xuXHRcdFx0YXdhaXQgYy5ncm91cFNlcnZpY2Uuc2hvd1BhbmVsKHRydWUpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlJ1blNlbGVjdGVkVGV4dCxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJ1blNlbGVjdGVkVGV4dCcsICdSdW4gU2VsZWN0ZWQgVGV4dCBJbiBBY3RpdmUgVGVybWluYWwnKSxcblx0XHRydW46IGFzeW5jIChjLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGNvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRcdGlmICghZWRpdG9yIHx8ICFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5nZXRBY3RpdmVPckNyZWF0ZUluc3RhbmNlKHsgYWNjZXB0c0lucHV0OiB0cnVlIH0pO1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0bGV0IHRleHQ6IHN0cmluZztcblx0XHRcdGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdHRleHQgPSBlZGl0b3IuZ2V0TW9kZWwoKS5nZXRMaW5lQ29udGVudChzZWxlY3Rpb24uc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyKS50cmltKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBlbmRPZkxpbmVQcmVmZXJlbmNlID0gaXNXaW5kb3dzID8gRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiA6IEVuZE9mTGluZVByZWZlcmVuY2UuQ1JMRjtcblx0XHRcdFx0dGV4dCA9IGVkaXRvci5nZXRNb2RlbCgpLmdldFZhbHVlSW5SYW5nZShzZWxlY3Rpb24sIGVuZE9mTGluZVByZWZlcmVuY2UpO1xuXHRcdFx0fVxuXHRcdFx0aW5zdGFuY2Uuc2VuZFRleHQodGV4dCwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0XHRhd2FpdCBjLnNlcnZpY2UucmV2ZWFsQWN0aXZlVGVybWluYWwodHJ1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUnVuQWN0aXZlRmlsZSxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJ1bkFjdGl2ZUZpbGUnLCAnUnVuIEFjdGl2ZSBGaWxlIEluIEFjdGl2ZSBUZXJtaW5hbCcpLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46IGFzeW5jIChjLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgd29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBlZGl0b3IgPSBjb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0XHRpZiAoIWVkaXRvciB8fCAhZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5nZXRBY3RpdmVPckNyZWF0ZUluc3RhbmNlKHsgYWNjZXB0c0lucHV0OiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgaXNSZW1vdGUgPSBpbnN0YW5jZSA/IGluc3RhbmNlLmhhc1JlbW90ZUF1dGhvcml0eSA6ICh3b3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ID8gdHJ1ZSA6IGZhbHNlKTtcblx0XHRcdGNvbnN0IHVyaSA9IGVkaXRvci5nZXRNb2RlbCgpLnVyaTtcblx0XHRcdGlmICgoIWlzUmVtb3RlICYmIHVyaS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSAmJiB1cmkuc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZVVzZXJEYXRhKSB8fCAoaXNSZW1vdGUgJiYgdXJpLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVSZW1vdGUpKSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5ydW5BY3RpdmVGaWxlLm5vRmlsZScsICdPbmx5IGZpbGVzIG9uIGRpc2sgY2FuIGJlIHJ1biBpbiB0aGUgdGVybWluYWwnKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVE9ETzogQ29udmVydCB0aGlzIHRvIGN0cmwrYywgY3RybCt2IGZvciBwd3NoP1xuXHRcdFx0YXdhaXQgaW5zdGFuY2Uuc2VuZFBhdGgodXJpLCB0cnVlKTtcblx0XHRcdHJldHVybiBjLmdyb3VwU2VydmljZS5zaG93UGFuZWwoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlWHRlcm1BY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TY3JvbGxEb3duTGluZSxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNjcm9sbERvd24nLCAnU2Nyb2xsIERvd24gKExpbmUpJyksXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5QYWdlRG93bixcblx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Eb3duQXJyb3cgfSxcblx0XHRcdHdoZW46IHNoYXJlZFdoZW5DbGF1c2UuZm9jdXNJbkFueV9hbmRfbm9ybWFsQnVmZmVyLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46ICh4dGVybSkgPT4geHRlcm0uc2Nyb2xsRG93bkxpbmUoKVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZVh0ZXJtQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2Nyb2xsRG93blBhZ2UsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zY3JvbGxEb3duUGFnZScsICdTY3JvbGwgRG93biAoUGFnZSknKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlBhZ2VEb3duLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleUNvZGUuUGFnZURvd24gfSxcblx0XHRcdHdoZW46IHNoYXJlZFdoZW5DbGF1c2UuZm9jdXNJbkFueV9hbmRfbm9ybWFsQnVmZmVyLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46ICh4dGVybSkgPT4geHRlcm0uc2Nyb2xsRG93blBhZ2UoKVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZVh0ZXJtQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2Nyb2xsVG9Cb3R0b20sXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zY3JvbGxUb0JvdHRvbScsICdTY3JvbGwgdG8gQm90dG9tJyksXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVuZCxcblx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRW5kIH0sXG5cdFx0XHR3aGVuOiBzaGFyZWRXaGVuQ2xhdXNlLmZvY3VzSW5BbnlfYW5kX25vcm1hbEJ1ZmZlcixcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0cnVuOiAoeHRlcm0pID0+IHh0ZXJtLnNjcm9sbFRvQm90dG9tKClcblx0fSk7XG5cblx0cmVnaXN0ZXJBY3RpdmVYdGVybUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNjcm9sbFVwTGluZSxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNjcm9sbFVwJywgJ1Njcm9sbCBVcCAoTGluZSknKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLlBhZ2VVcCxcblx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5VcEFycm93IH0sXG5cdFx0XHR3aGVuOiBzaGFyZWRXaGVuQ2xhdXNlLmZvY3VzSW5BbnlfYW5kX25vcm1hbEJ1ZmZlcixcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0cnVuOiAoeHRlcm0pID0+IHh0ZXJtLnNjcm9sbFVwTGluZSgpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlWHRlcm1BY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TY3JvbGxVcFBhZ2UsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zY3JvbGxVcFBhZ2UnLCAnU2Nyb2xsIFVwIChQYWdlKScpLFxuXHRcdGYxOiB0cnVlLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuUGFnZVVwLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleUNvZGUuUGFnZVVwIH0sXG5cdFx0XHR3aGVuOiBzaGFyZWRXaGVuQ2xhdXNlLmZvY3VzSW5BbnlfYW5kX25vcm1hbEJ1ZmZlcixcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0cnVuOiAoeHRlcm0pID0+IHh0ZXJtLnNjcm9sbFVwUGFnZSgpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlWHRlcm1BY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TY3JvbGxUb1RvcCxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNjcm9sbFRvVG9wJywgJ1Njcm9sbCB0byBUb3AnKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuSG9tZSxcblx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuSG9tZSB9LFxuXHRcdFx0d2hlbjogc2hhcmVkV2hlbkNsYXVzZS5mb2N1c0luQW55X2FuZF9ub3JtYWxCdWZmZXIsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKHh0ZXJtKSA9PiB4dGVybS5zY3JvbGxUb1RvcCgpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlWHRlcm1BY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5DbGVhclNlbGVjdGlvbixcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNsZWFyU2VsZWN0aW9uJywgJ0NsZWFyIFNlbGVjdGlvbicpLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXNJbkFueSwgVGVybWluYWxDb250ZXh0S2V5cy50ZXh0U2VsZWN0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMubm90RmluZFZpc2libGUpLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46ICh4dGVybSkgPT4ge1xuXHRcdFx0aWYgKHh0ZXJtLmhhc1NlbGVjdGlvbigpKSB7XG5cdFx0XHRcdHh0ZXJtLmNsZWFyU2VsZWN0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ2hhbmdlSWNvbixcblx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLmNoYW5nZUljb24sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKGMsIF8sIGFyZ3M6IHVua25vd24pID0+IGdldFJlc291cmNlT3JBY3RpdmVJbnN0YW5jZShjLCBhcmdzKT8uY2hhbmdlSWNvbigpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5DaGFuZ2VJY29uQWN0aXZlVGFiLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MuY2hhbmdlSWNvbixcblx0XHRmMTogZmFsc2UsXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlX2FuZF9zaW5ndWxhclNlbGVjdGlvbixcblx0XHRydW46IGFzeW5jIChjLCBhY2Nlc3NvciwgYXJncykgPT4ge1xuXHRcdFx0bGV0IGljb246IFRlcm1pbmFsSWNvbiB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjLmdyb3VwU2VydmljZS5sYXN0QWNjZXNzZWRNZW51ID09PSAnaW5saW5lLXRhYicpIHtcblx0XHRcdFx0Z2V0UmVzb3VyY2VPckFjdGl2ZUluc3RhbmNlKGMsIGFyZ3MpPy5jaGFuZ2VJY29uKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgdGVybWluYWwgb2YgZ2V0U2VsZWN0ZWRWaWV3SW5zdGFuY2VzKGFjY2Vzc29yKSA/PyBbXSkge1xuXHRcdFx0XHRpY29uID0gYXdhaXQgdGVybWluYWwuY2hhbmdlSWNvbihpY29uKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5DaGFuZ2VDb2xvcixcblx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLmNoYW5nZUNvbG9yLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46IChjLCBfLCBhcmdzKSA9PiBnZXRSZXNvdXJjZU9yQWN0aXZlSW5zdGFuY2UoYywgYXJncyk/LmNoYW5nZUNvbG9yKClcblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNoYW5nZUNvbG9yQWN0aXZlVGFiLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MuY2hhbmdlQ29sb3IsXG5cdFx0ZjE6IGZhbHNlLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZV9hbmRfc2luZ3VsYXJTZWxlY3Rpb24sXG5cdFx0cnVuOiBhc3luYyAoYywgYWNjZXNzb3IsIGFyZ3MpID0+IHtcblx0XHRcdGxldCBjb2xvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGkgPSAwO1xuXHRcdFx0aWYgKGMuZ3JvdXBTZXJ2aWNlLmxhc3RBY2Nlc3NlZE1lbnUgPT09ICdpbmxpbmUtdGFiJykge1xuXHRcdFx0XHRnZXRSZXNvdXJjZU9yQWN0aXZlSW5zdGFuY2UoYywgYXJncyk/LmNoYW5nZUNvbG9yKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgdGVybWluYWwgb2YgZ2V0U2VsZWN0ZWRWaWV3SW5zdGFuY2VzKGFjY2Vzc29yKSA/PyBbXSkge1xuXHRcdFx0XHRjb25zdCBza2lwUXVpY2tQaWNrID0gaSAhPT0gMDtcblx0XHRcdFx0Ly8gQWx3YXlzIHNob3cgdGhlIHF1aWNrcGljayBvbiB0aGUgZmlyc3QgaXRlcmF0aW9uXG5cdFx0XHRcdGNvbG9yID0gYXdhaXQgdGVybWluYWwuY2hhbmdlQ29sb3IoY29sb3IsIHNraXBRdWlja1BpY2spO1xuXHRcdFx0XHRpKys7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUmVuYW1lLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MucmVuYW1lLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46IChjLCBhY2Nlc3NvciwgYXJncykgPT4gcmVuYW1lV2l0aFF1aWNrUGljayhjLCBhY2Nlc3NvciwgYXJncylcblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlJlbmFtZUFjdGl2ZVRhYixcblx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLnJlbmFtZSxcblx0XHRmMTogZmFsc2UsXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5Q29kZS5GMixcblx0XHRcdG1hYzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyXG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlcm1pbmFsQ29udGV4dEtleXMudGFic0ZvY3VzKSxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0fSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGVfYW5kX3Npbmd1bGFyU2VsZWN0aW9uLFxuXHRcdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbEdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVybWluYWxHcm91cFNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBpbnN0YW5jZXMgPSBnZXRTZWxlY3RlZFZpZXdJbnN0YW5jZXMoYWNjZXNzb3IpO1xuXHRcdFx0Y29uc3QgZmlyc3RJbnN0YW5jZSA9IGluc3RhbmNlcz8uWzBdO1xuXHRcdFx0aWYgKCFmaXJzdEluc3RhbmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRlcm1pbmFsR3JvdXBTZXJ2aWNlLmxhc3RBY2Nlc3NlZE1lbnUgPT09ICdpbmxpbmUtdGFiJykge1xuXHRcdFx0XHRyZXR1cm4gcmVuYW1lV2l0aFF1aWNrUGljayhjLCBhY2Nlc3NvciwgZmlyc3RJbnN0YW5jZSk7XG5cdFx0XHR9XG5cblx0XHRcdGMuZWRpdGluZ1NlcnZpY2Uuc2V0RWRpdGluZ1Rlcm1pbmFsKGZpcnN0SW5zdGFuY2UpO1xuXHRcdFx0Yy5lZGl0aW5nU2VydmljZS5zZXRFZGl0YWJsZShmaXJzdEluc3RhbmNlLCB7XG5cdFx0XHRcdHZhbGlkYXRpb25NZXNzYWdlOiB2YWx1ZSA9PiB2YWxpZGF0ZVRlcm1pbmFsTmFtZSh2YWx1ZSksXG5cdFx0XHRcdG9uRmluaXNoOiBhc3luYyAodmFsdWUsIHN1Y2Nlc3MpID0+IHtcblx0XHRcdFx0XHQvLyBDYW5jZWwgZWRpdGluZyBmaXJzdCBhcyBpbnN0YW5jZS5yZW5hbWUgd2lsbCB0cmlnZ2VyIGEgcmVyZW5kZXIgYXV0b21hdGljYWxseVxuXHRcdFx0XHRcdGMuZWRpdGluZ1NlcnZpY2Uuc2V0RWRpdGFibGUoZmlyc3RJbnN0YW5jZSwgbnVsbCk7XG5cdFx0XHRcdFx0Yy5lZGl0aW5nU2VydmljZS5zZXRFZGl0aW5nVGVybWluYWwodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiBpbnN0YW5jZXMpIHtcblx0XHRcdFx0XHRcdFx0cHJvbWlzZXMucHVzaCgoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IGluc3RhbmNlLnJlbmFtZSh2YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdH0pKCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuRGV0YWNoU2Vzc2lvbixcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmRldGFjaFNlc3Npb24nLCAnRGV0YWNoIFNlc3Npb24nKSxcblx0XHRydW46IChhY3RpdmVJbnN0YW5jZSkgPT4gYWN0aXZlSW5zdGFuY2UuZGV0YWNoUHJvY2Vzc0FuZERpc3Bvc2UoVGVybWluYWxFeGl0UmVhc29uLlVzZXIpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5BdHRhY2hUb1Nlc3Npb24sXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5hdHRhY2hUb1Nlc3Npb24nLCAnQXR0YWNoIHRvIFNlc3Npb24nKSxcblx0XHRydW46IGFzeW5jIChjLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGxhYmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFiZWxTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHJlbW90ZUFnZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJUmVtb3RlQWdlbnRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSByZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpPy5yZW1vdGVBdXRob3JpdHkgPz8gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgYmFja2VuZCA9IGF3YWl0IGFjY2Vzc29yLmdldChJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UpLmdldEJhY2tlbmQocmVtb3RlQXV0aG9yaXR5KTtcblxuXHRcdFx0aWYgKCFiYWNrZW5kKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gYmFja2VuZCByZWdpc3RlcmVkIGZvciByZW1vdGUgYXV0aG9yaXR5ICcke3JlbW90ZUF1dGhvcml0eX0nYCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRlcm1zID0gYXdhaXQgYmFja2VuZC5saXN0UHJvY2Vzc2VzKCk7XG5cblx0XHRcdGJhY2tlbmQucmVkdWNlQ29ubmVjdGlvbkdyYWNlVGltZSgpO1xuXG5cdFx0XHRjb25zdCB1bmF0dGFjaGVkVGVybXMgPSB0ZXJtcy5maWx0ZXIodGVybSA9PiAhYy5zZXJ2aWNlLmlzQXR0YWNoZWRUb1Rlcm1pbmFsKHRlcm0pKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gdW5hdHRhY2hlZFRlcm1zLm1hcCh0ZXJtID0+IHtcblx0XHRcdFx0Y29uc3QgY3dkTGFiZWwgPSBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoVVJJLmZpbGUodGVybS5jd2QpKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRsYWJlbDogdGVybS50aXRsZSxcblx0XHRcdFx0XHRkZXRhaWw6IHRlcm0ud29ya3NwYWNlTmFtZSA/IGAke3Rlcm0ud29ya3NwYWNlTmFtZX0gXFx1MkUzMSAke2N3ZExhYmVsfWAgOiBjd2RMYWJlbCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogdGVybS5waWQgPyBTdHJpbmcodGVybS5waWQpIDogJycsXG5cdFx0XHRcdFx0dGVybVxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdFx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnbm9VbmF0dGFjaGVkVGVybWluYWxzJywgJ1RoZXJlIGFyZSBubyB1bmF0dGFjaGVkIHRlcm1pbmFscyB0byBhdHRhY2ggdG8nKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljazxJUmVtb3RlVGVybWluYWxQaWNrPihpdGVtcywgeyBjYW5QaWNrTWFueTogZmFsc2UgfSk7XG5cdFx0XHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCBjLnNlcnZpY2UuY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0XHRcdGNvbmZpZzogeyBhdHRhY2hQZXJzaXN0ZW50UHJvY2Vzczogc2VsZWN0ZWQudGVybSB9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjLnNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0XHRhd2FpdCBmb2N1c0FjdGl2ZVRlcm1pbmFsKGluc3RhbmNlLCBjKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlSW5zdGFuY2VBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TY3JvbGxUb1ByZXZpb3VzQ29tbWFuZCxcblx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLnNjcm9sbFRvUHJldmlvdXNDb21tYW5kLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQubmVnYXRlKCkpLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRpY29uOiBDb2RpY29uLmFycm93VXAsXG5cdFx0bWVudTogW1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRFUk1JTkFMX1ZJRVdfSUQpLFxuXHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdC4uLltNZW51SWQuRWRpdG9yVGl0bGUsIE1lbnVJZC5Db21wYWN0V2luZG93RWRpdG9yVGl0bGVdLm1hcChpZCA9PiAoe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0Z3JvdXA6ICcxX3NoZWxsSW50ZWdyYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVUZXJtaW5hbCksXG5cdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlXG5cdFx0XHR9KSksXG5cdFx0XSxcblx0XHRydW46IChhY3RpdmVJbnN0YW5jZSkgPT4gYWN0aXZlSW5zdGFuY2UueHRlcm0/Lm1hcmtUcmFja2VyLnNjcm9sbFRvUHJldmlvdXNNYXJrKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBhY3RpdmVJbnN0YW5jZS5jYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSlcblx0fSk7XG5cblx0cmVnaXN0ZXJBY3RpdmVJbnN0YW5jZUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNjcm9sbFRvTmV4dENvbW1hbmQsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5zY3JvbGxUb05leHRDb21tYW5kLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cywgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRC5uZWdhdGUoKSksXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdGljb246IENvZGljb24uYXJyb3dEb3duLFxuXHRcdG1lbnU6IFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiA1LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBURVJNSU5BTF9WSUVXX0lEKSxcblx0XHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWVcblx0XHRcdH0sXG5cdFx0XHQuLi5bTWVudUlkLkVkaXRvclRpdGxlLCBNZW51SWQuQ29tcGFjdFdpbmRvd0VkaXRvclRpdGxlXS5tYXAoaWQgPT4gKHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGdyb3VwOiAnMV9zaGVsbEludGVncmF0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDUsXG5cdFx0XHRcdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlVGVybWluYWwpLFxuXHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdFx0fSkpLFxuXHRcdF0sXG5cdFx0cnVuOiAoYWN0aXZlSW5zdGFuY2UpID0+IHtcblx0XHRcdGFjdGl2ZUluc3RhbmNlLnh0ZXJtPy5tYXJrVHJhY2tlci5zY3JvbGxUb05leHRNYXJrKCk7XG5cdFx0XHRhY3RpdmVJbnN0YW5jZS5mb2N1cygpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3RpdmVJbnN0YW5jZUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNlbGVjdFRvUHJldmlvdXNDb21tYW5kLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VsZWN0VG9QcmV2aW91c0NvbW1hbmQnLCAnU2VsZWN0IHRvIFByZXZpb3VzIENvbW1hbmQnKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogKGFjdGl2ZUluc3RhbmNlKSA9PiB7XG5cdFx0XHRhY3RpdmVJbnN0YW5jZS54dGVybT8ubWFya1RyYWNrZXIuc2VsZWN0VG9QcmV2aW91c01hcmsoKTtcblx0XHRcdGFjdGl2ZUluc3RhbmNlLmZvY3VzKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2VsZWN0VG9OZXh0Q29tbWFuZCxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNlbGVjdFRvTmV4dENvbW1hbmQnLCAnU2VsZWN0IHRvIE5leHQgQ29tbWFuZCcpLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHR3aGVuOiBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHR9LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46IChhY3RpdmVJbnN0YW5jZSkgPT4ge1xuXHRcdFx0YWN0aXZlSW5zdGFuY2UueHRlcm0/Lm1hcmtUcmFja2VyLnNlbGVjdFRvTmV4dE1hcmsoKTtcblx0XHRcdGFjdGl2ZUluc3RhbmNlLmZvY3VzKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZVh0ZXJtQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2VsZWN0VG9QcmV2aW91c0xpbmUsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zZWxlY3RUb1ByZXZpb3VzTGluZScsICdTZWxlY3QgdG8gUHJldmlvdXMgTGluZScpLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46IGFzeW5jICh4dGVybSwgXywgaW5zdGFuY2UpID0+IHtcblx0XHRcdHh0ZXJtLm1hcmtUcmFja2VyLnNlbGVjdFRvUHJldmlvdXNMaW5lKCk7XG5cdFx0XHQvLyBwcmVmZXIgdG8gY2FsbCBmb2N1cyBvbiB0aGUgVGVybWluYWxJbnN0YW5jZSBmb3IgYWRkaXRpb25hbCBhY2Nlc3NpYmlsaXR5IHRyaWdnZXJzXG5cdFx0XHQoaW5zdGFuY2UgfHwgeHRlcm0pLmZvY3VzKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZVh0ZXJtQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2VsZWN0VG9OZXh0TGluZSxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNlbGVjdFRvTmV4dExpbmUnLCAnU2VsZWN0IHRvIE5leHQgTGluZScpLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46IGFzeW5jICh4dGVybSwgXywgaW5zdGFuY2UpID0+IHtcblx0XHRcdHh0ZXJtLm1hcmtUcmFja2VyLnNlbGVjdFRvTmV4dExpbmUoKTtcblx0XHRcdC8vIHByZWZlciB0byBjYWxsIGZvY3VzIG9uIHRoZSBUZXJtaW5hbEluc3RhbmNlIGZvciBhZGRpdGlvbmFsIGFjY2Vzc2liaWxpdHkgdHJpZ2dlcnNcblx0XHRcdChpbnN0YW5jZSB8fCB4dGVybSkuZm9jdXMoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5OZXdXaXRoQ3dkLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MubmV3V2l0aEN3ZCxcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0ZGVzY3JpcHRpb246IHRlcm1pbmFsU3RyaW5ncy5uZXdXaXRoQ3dkLnZhbHVlLFxuXHRcdFx0YXJnczogW3tcblx0XHRcdFx0bmFtZTogJ2FyZ3MnLFxuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRyZXF1aXJlZDogWydjd2QnXSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRjd2Q6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLm5ld1dpdGhDd2QuY3dkJywgXCJUaGUgZGlyZWN0b3J5IHRvIHN0YXJ0IHRoZSB0ZXJtaW5hbCBhdFwiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XG5cdFx0XHR9XVxuXHRcdH0sXG5cdFx0cnVuOiBhc3luYyAoYywgXywgYXJncykgPT4ge1xuXHRcdFx0Y29uc3QgY3dkID0gYXJncyA/IHRvT3B0aW9uYWxTdHJpbmcoKDx7IGN3ZD86IHN0cmluZyB9PmFyZ3MpLmN3ZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGN3ZCB9KTtcblx0XHRcdGlmICghaW5zdGFuY2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Yy5zZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdGF3YWl0IGZvY3VzQWN0aXZlVGVybWluYWwoaW5zdGFuY2UsIGMpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3RpdmVJbnN0YW5jZUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlJlbmFtZVdpdGhBcmdzLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MucmVuYW1lV2l0aEFyZ3MsXG5cdFx0bWV0YWRhdGE6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiB0ZXJtaW5hbFN0cmluZ3MucmVuYW1lV2l0aEFyZ3MudmFsdWUsXG5cdFx0XHRhcmdzOiBbe1xuXHRcdFx0XHRuYW1lOiAnYXJncycsXG5cdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBbJ25hbWUnXSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRuYW1lOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5yZW5hbWVXaXRoQXJnLm5hbWUnLCBcIlRoZSBuZXcgbmFtZSBmb3IgdGhlIHRlcm1pbmFsXCIpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0bWluTGVuZ3RoOiAxXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XVxuXHRcdH0sXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdGYxOiBmYWxzZSxcblx0XHRydW46IGFzeW5jIChhY3RpdmVJbnN0YW5jZSwgYywgYWNjZXNzb3IsIGFyZ3MpID0+IHtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbmFtZSA9IGFyZ3MgPyB0b09wdGlvbmFsU3RyaW5nKCg8eyBuYW1lPzogc3RyaW5nIH0+YXJncykubmFtZSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIW5hbWUpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS53YXJuKGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJlbmFtZVdpdGhBcmcubm9OYW1lJywgXCJObyBuYW1lIGFyZ3VtZW50IHByb3ZpZGVkXCIpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YWN0aXZlSW5zdGFuY2UucmVuYW1lKG5hbWUpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3RpdmVJbnN0YW5jZUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlJlbGF1bmNoLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVsYXVuY2gnLCAnUmVsYXVuY2ggQWN0aXZlIFRlcm1pbmFsJyksXG5cdFx0cnVuOiAoYWN0aXZlSW5zdGFuY2UpID0+IGFjdGl2ZUluc3RhbmNlLnJlbGF1bmNoKClcblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNwbGl0LFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Muc3BsaXQsXG5cdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMud2ViRXh0ZW5zaW9uQ29udHJpYnV0ZWRQcm9maWxlKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRGlnaXQ1LFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRtYWM6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzbGFzaCxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRpZ2l0NV1cblx0XHRcdH0sXG5cdFx0XHR3aGVuOiBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzXG5cdFx0fSxcblx0XHRpY29uOiBDb2RpY29uLnNwbGl0SG9yaXpvbnRhbCxcblx0XHRydW46IGFzeW5jIChjLCBhY2Nlc3NvciwgYXJncykgPT4ge1xuXHRcdFx0Y29uc3Qgb3B0aW9uc09yUHJvZmlsZSA9IGlzT2JqZWN0KGFyZ3MpID8gYXJncyBhcyBJQ3JlYXRlVGVybWluYWxPcHRpb25zIHwgSVRlcm1pbmFsUHJvZmlsZSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IGNvbnZlcnRPcHRpb25zT3JQcm9maWxlVG9PcHRpb25zKG9wdGlvbnNPclByb2ZpbGUpO1xuXHRcdFx0Y29uc3QgYWN0aXZlSW5zdGFuY2UgPSAoYXdhaXQgYy5zZXJ2aWNlLmdldEluc3RhbmNlSG9zdChvcHRpb25zPy5sb2NhdGlvbikpLmFjdGl2ZUluc3RhbmNlO1xuXHRcdFx0aWYgKCFhY3RpdmVJbnN0YW5jZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjd2QgPSBhd2FpdCBnZXRDd2RGb3JTcGxpdChhY3RpdmVJbnN0YW5jZSwgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycywgY29tbWFuZFNlcnZpY2UsIGMuY29uZmlnU2VydmljZSk7XG5cdFx0XHRpZiAoY3dkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCBjLnNlcnZpY2UuY3JlYXRlVGVybWluYWwoeyBsb2NhdGlvbjogeyBwYXJlbnRUZXJtaW5hbDogYWN0aXZlSW5zdGFuY2UgfSwgY29uZmlnOiBvcHRpb25zPy5jb25maWcsIGN3ZCB9KTtcblx0XHRcdGF3YWl0IGZvY3VzQWN0aXZlVGVybWluYWwoaW5zdGFuY2UsIGMpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNwbGl0QWN0aXZlVGFiLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Muc3BsaXQsXG5cdFx0ZjE6IGZhbHNlLFxuXHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5EaWdpdDUsXG5cdFx0XHRtYWM6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzbGFzaCxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRpZ2l0NV1cblx0XHRcdH0sXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMudGFic0ZvY3VzXG5cdFx0fSxcblx0XHRydW46IGFzeW5jIChjLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2VzID0gZ2V0U2VsZWN0ZWRWaWV3SW5zdGFuY2VzKGFjY2Vzc29yKTtcblx0XHRcdGlmIChpbnN0YW5jZXMpIHtcblx0XHRcdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHQgb2YgaW5zdGFuY2VzKSB7XG5cdFx0XHRcdFx0cHJvbWlzZXMucHVzaCgoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgYy5zZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgbG9jYXRpb246IHsgcGFyZW50VGVybWluYWw6IHQgfSB9KTtcblx0XHRcdFx0XHRcdGF3YWl0IGMuZ3JvdXBTZXJ2aWNlLnNob3dQYW5lbCh0cnVlKTtcblx0XHRcdFx0XHR9KSgpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckNvbnRleHR1YWxJbnN0YW5jZUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlVuc3BsaXQsXG5cdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy51bnNwbGl0LFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46IGFzeW5jIChpbnN0YW5jZSwgYykgPT4ge1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSBjLmdyb3VwU2VydmljZS5nZXRHcm91cEZvckluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdGlmIChncm91cCAmJiBncm91cD8udGVybWluYWxJbnN0YW5jZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRjLmdyb3VwU2VydmljZS51bnNwbGl0SW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkpvaW5BY3RpdmVUYWIsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5qb2luSW5zdGFuY2UnLCAnSm9pbiBUZXJtaW5hbHMnKSxcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLCBUZXJtaW5hbENvbnRleHRLZXlzLnRhYnNTaW5ndWxhclNlbGVjdGlvbi50b05lZ2F0ZWQoKSksXG5cdFx0cnVuOiBhc3luYyAoYywgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbmNlcyA9IGdldFNlbGVjdGVkVmlld0luc3RhbmNlcyhhY2Nlc3Nvcik7XG5cdFx0XHRpZiAoaW5zdGFuY2VzICYmIGluc3RhbmNlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGMuZ3JvdXBTZXJ2aWNlLmpvaW5JbnN0YW5jZXMoaW5zdGFuY2VzKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Kb2luLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuam9pbicsICdKb2luIFRlcm1pbmFscy4uLicpLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46IGFzeW5jIChjLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgdGhlbWVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUaGVtZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBwaWNrczogSVRlcm1pbmFsUXVpY2tQaWNrSXRlbVtdID0gW107XG5cdFx0XHRpZiAoYy5ncm91cFNlcnZpY2UuaW5zdGFuY2VzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5qb2luLmluc3VmZmljaWVudFRlcm1pbmFscycsICdJbnN1ZmZpY2llbnQgdGVybWluYWxzIGZvciB0aGUgam9pbiBhY3Rpb24nKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG90aGVySW5zdGFuY2VzID0gYy5ncm91cFNlcnZpY2UuaW5zdGFuY2VzLmZpbHRlcihpID0+IGkuaW5zdGFuY2VJZCAhPT0gYy5ncm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U/Lmluc3RhbmNlSWQpO1xuXHRcdFx0Zm9yIChjb25zdCB0ZXJtaW5hbCBvZiBvdGhlckluc3RhbmNlcykge1xuXHRcdFx0XHRjb25zdCBncm91cCA9IGMuZ3JvdXBTZXJ2aWNlLmdldEdyb3VwRm9ySW5zdGFuY2UodGVybWluYWwpO1xuXHRcdFx0XHRpZiAoZ3JvdXA/LnRlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IGljb25JZCA9IGdldEljb25JZChhY2Nlc3NvciwgdGVybWluYWwpO1xuXHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gYCQoJHtpY29uSWR9KTogJHt0ZXJtaW5hbC50aXRsZX1gO1xuXHRcdFx0XHRcdGNvbnN0IGljb25DbGFzc2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRcdGNvbnN0IGNvbG9yQ2xhc3MgPSBnZXRDb2xvckNsYXNzKHRlcm1pbmFsKTtcblx0XHRcdFx0XHRpZiAoY29sb3JDbGFzcykge1xuXHRcdFx0XHRcdFx0aWNvbkNsYXNzZXMucHVzaChjb2xvckNsYXNzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgdXJpQ2xhc3NlcyA9IGdldFVyaUNsYXNzZXModGVybWluYWwsIHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSk7XG5cdFx0XHRcdFx0aWYgKHVyaUNsYXNzZXMpIHtcblx0XHRcdFx0XHRcdGljb25DbGFzc2VzLnB1c2goLi4udXJpQ2xhc3Nlcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHBpY2tzLnB1c2goe1xuXHRcdFx0XHRcdFx0dGVybWluYWwsXG5cdFx0XHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0XHRcdGljb25DbGFzc2VzXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChwaWNrcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS53YXJuKGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmpvaW4ub25seVNwbGl0cycsICdBbGwgdGVybWluYWxzIGFyZSBqb2luZWQgYWxyZWFkeScpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywge30pO1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRjLmdyb3VwU2VydmljZS5qb2luSW5zdGFuY2VzKFtyZXN1bHQudGVybWluYWwsIGMuZ3JvdXBTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlIV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3RpdmVJbnN0YW5jZUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNwbGl0SW5BY3RpdmVXb3Jrc3BhY2UsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zcGxpdEluQWN0aXZlV29ya3NwYWNlJywgJ1NwbGl0IFRlcm1pbmFsIChJbiBBY3RpdmUgV29ya3NwYWNlKScpLFxuXHRcdHJ1bjogYXN5bmMgKGluc3RhbmNlLCBjKSA9PiB7XG5cdFx0XHRjb25zdCBuZXdJbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGxvY2F0aW9uOiB7IHBhcmVudFRlcm1pbmFsOiBpbnN0YW5jZSB9IH0pO1xuXHRcdFx0aWYgKG5ld0luc3RhbmNlPy50YXJnZXQgIT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yKSB7XG5cdFx0XHRcdGF3YWl0IGMuZ3JvdXBTZXJ2aWNlLnNob3dQYW5lbCh0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aXZlWHRlcm1BY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TZWxlY3RBbGwsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zZWxlY3RBbGwnLCAnU2VsZWN0IEFsbCcpLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0Ly8gRG9uJ3QgdXNlIGN0cmwrYSBieSBkZWZhdWx0IGFzIHRoYXQgd291bGQgb3ZlcnJpZGUgdGhlIGNvbW1vbiBnbyB0byBzdGFydFxuXHRcdFx0Ly8gb2YgcHJvbXB0IHNoZWxsIGJpbmRpbmdcblx0XHRcdHByaW1hcnk6IDAsXG5cdFx0XHQvLyBUZWNobmljYWxseSB0aGlzIGRvZXNuJ3QgbmVlZCB0byBiZSBoZXJlIGFzIGl0IHdpbGwgZmFsbCBiYWNrIHRvIHRoaXNcblx0XHRcdC8vIGJlaGF2aW9yIGFueXdheSB3aGVuIGhhbmRlZCB0byB4dGVybS5qcywgaGF2aW5nIHRoaXMgaGFuZGxlZCBieSBWUyBDb2RlXG5cdFx0XHQvLyBtYWtlcyBpdCBlYXNpZXIgZm9yIHVzZXJzIHRvIHNlZSBob3cgaXQgd29ya3MgdGhvdWdoLlxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlBIH0sXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXNJbkFueVxuXHRcdH1dLFxuXHRcdHJ1bjogKHh0ZXJtKSA9PiB4dGVybS5zZWxlY3RBbGwoKVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuTmV3LFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubmV3JywgJ0NyZWF0ZSBOZXcgVGVybWluYWwnKSxcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZCwgVGVybWluYWxDb250ZXh0S2V5cy53ZWJFeHRlbnNpb25Db250cmlidXRlZFByb2ZpbGUpLFxuXHRcdGljb246IG5ld1Rlcm1pbmFsSWNvbixcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQmFja3F1b3RlLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5CYWNrcXVvdGUgfSxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0fSxcblx0XHRydW46IGFzeW5jIChjLCBhY2Nlc3NvciwgYXJncykgPT4ge1xuXHRcdFx0bGV0IGV2ZW50T3JPcHRpb25zID0gaXNPYmplY3QoYXJncykgPyBhcmdzIGFzIE1vdXNlRXZlbnQgfCBJQ3JlYXRlVGVybWluYWxPcHRpb25zIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZvbGRlcnMgPSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdFx0aWYgKGV2ZW50T3JPcHRpb25zICYmIGlzTW91c2VFdmVudChldmVudE9yT3B0aW9ucykgJiYgKGV2ZW50T3JPcHRpb25zLmFsdEtleSB8fCBldmVudE9yT3B0aW9ucy5jdHJsS2V5KSkge1xuXHRcdFx0XHRhd2FpdCBjLnNlcnZpY2UuY3JlYXRlVGVybWluYWwoeyBsb2NhdGlvbjogeyBzcGxpdEFjdGl2ZVRlcm1pbmFsOiB0cnVlIH0gfSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGMuc2VydmljZS5pc1Byb2Nlc3NTdXBwb3J0UmVnaXN0ZXJlZCkge1xuXHRcdFx0XHRldmVudE9yT3B0aW9ucyA9ICFldmVudE9yT3B0aW9ucyB8fCBpc01vdXNlRXZlbnQoZXZlbnRPck9wdGlvbnMpID8ge30gOiBldmVudE9yT3B0aW9ucztcblxuXHRcdFx0XHRpZiAoaXNBdXhpbGlhcnlXaW5kb3coZ2V0QWN0aXZlV2luZG93KCkpICYmICFldmVudE9yT3B0aW9ucy5sb2NhdGlvbikge1xuXHRcdFx0XHRcdGV2ZW50T3JPcHRpb25zLmxvY2F0aW9uID0geyB2aWV3Q29sdW1uOiBlZGl0b3JHcm91cFRvQ29sdW1uKGVkaXRvckdyb3Vwc1NlcnZpY2UsIGVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXApIH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoZm9sZGVycy5sZW5ndGggPD0gMSkge1xuXHRcdFx0XHRcdC8vIEFsbG93IHRlcm1pbmFsIHNlcnZpY2UgdG8gaGFuZGxlIHRoZSBwYXRoIHdoZW4gdGhlcmUgaXMgb25seSBhXG5cdFx0XHRcdFx0Ly8gc2luZ2xlIHJvb3Rcblx0XHRcdFx0XHRpbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbChldmVudE9yT3B0aW9ucyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgY3dkID0gKGF3YWl0IHBpY2tUZXJtaW5hbEN3ZChhY2Nlc3NvcikpPy5jd2Q7XG5cdFx0XHRcdFx0aWYgKCFjd2QpIHtcblx0XHRcdFx0XHRcdC8vIERvbid0IGNyZWF0ZSB0aGUgaW5zdGFuY2UgaWYgdGhlIHdvcmtzcGFjZSBwaWNrZXIgd2FzIGNhbmNlbGVkXG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGV2ZW50T3JPcHRpb25zLmN3ZCA9IGN3ZDtcblx0XHRcdFx0XHRpbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbChldmVudE9yT3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Yy5zZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdFx0YXdhaXQgZm9jdXNBY3RpdmVUZXJtaW5hbChpbnN0YW5jZSwgYyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoYy5wcm9maWxlU2VydmljZS5jb250cmlidXRlZFByb2ZpbGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChUZXJtaW5hbENvbW1hbmRJZC5OZXdXaXRoUHJvZmlsZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoVGVybWluYWxDb21tYW5kSWQuVG9nZ2xlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24ga2lsbEluc3RhbmNlKGM6IElUZXJtaW5hbFNlcnZpY2VzQ29sbGVjdGlvbiwgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFpbnN0YW5jZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBjLnNlcnZpY2Uuc2FmZURpc3Bvc2VUZXJtaW5hbChpbnN0YW5jZSk7XG5cdFx0aWYgKGMuZ3JvdXBTZXJ2aWNlLmluc3RhbmNlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRhd2FpdCBjLmdyb3VwU2VydmljZS5zaG93UGFuZWwodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5LaWxsLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwua2lsbCcsICdLaWxsIHRoZSBBY3RpdmUgVGVybWluYWwgSW5zdGFuY2UnKSxcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsIFRlcm1pbmFsQ29udGV4dEtleXMuaXNPcGVuKSxcblx0XHRpY29uOiBraWxsVGVybWluYWxJY29uLFxuXHRcdHJ1bjogYXN5bmMgKGMpID0+IGtpbGxJbnN0YW5jZShjLCBjLmdyb3VwU2VydmljZS5hY3RpdmVJbnN0YW5jZSlcblx0fSk7XG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5LaWxsVmlld09yRWRpdG9yLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Mua2lsbCxcblx0XHRmMTogZmFsc2UsIC8vIFRoaXMgaXMgYW4gaW50ZXJuYWwgY29tbWFuZCB1c2VkIGZvciBjb250ZXh0IG1lbnVzXG5cdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLCBUZXJtaW5hbENvbnRleHRLZXlzLmlzT3BlbiksXG5cdFx0cnVuOiBhc3luYyAoYykgPT4ga2lsbEluc3RhbmNlKGMsIGMuc2VydmljZS5hY3RpdmVJbnN0YW5jZSlcblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLktpbGxBbGwsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5raWxsQWxsJywgJ0tpbGwgQWxsIFRlcm1pbmFscycpLFxuXHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3Ioc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSwgVGVybWluYWxDb250ZXh0S2V5cy5pc09wZW4pLFxuXHRcdGljb246IENvZGljb24udHJhc2gsXG5cdFx0cnVuOiBhc3luYyAoYykgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zZVByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgYy5zZXJ2aWNlLmluc3RhbmNlcykge1xuXHRcdFx0XHRkaXNwb3NlUHJvbWlzZXMucHVzaChjLnNlcnZpY2Uuc2FmZURpc3Bvc2VUZXJtaW5hbChpbnN0YW5jZSkpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZGlzcG9zZVByb21pc2VzKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5LaWxsRWRpdG9yLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwua2lsbEVkaXRvcicsICdLaWxsIHRoZSBBY3RpdmUgVGVybWluYWwgaW4gRWRpdG9yIEFyZWEnKSxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVcsXG5cdFx0XHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkY0LCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5V10gfSxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIFRlcm1pbmFsQ29udGV4dEtleXMuZWRpdG9yRm9jdXMpXG5cdFx0fSxcblx0XHRydW46IChjLCBhY2Nlc3NvcikgPT4gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoQ0xPU0VfRURJVE9SX0NPTU1BTkRfSUQpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5LaWxsQWN0aXZlVGFiLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Mua2lsbCxcblx0XHRmMTogZmFsc2UsXG5cdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLCBUZXJtaW5hbENvbnRleHRLZXlzLmlzT3BlbiksXG5cdFx0a2V5YmluZGluZzoge1xuXHRcdFx0cHJpbWFyeTogS2V5Q29kZS5EZWxldGUsXG5cdFx0XHRtYWM6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzcGFjZSxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5Q29kZS5EZWxldGVdXG5cdFx0XHR9LFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBUZXJtaW5hbENvbnRleHRLZXlzLnRhYnNGb2N1c1xuXHRcdH0sXG5cdFx0cnVuOiBhc3luYyAoYywgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2VQcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHRlcm1pbmFsIG9mIGdldFNlbGVjdGVkVmlld0luc3RhbmNlcyhhY2Nlc3NvciwgdHJ1ZSkgPz8gW10pIHtcblx0XHRcdFx0ZGlzcG9zZVByb21pc2VzLnB1c2goYy5zZXJ2aWNlLnNhZmVEaXNwb3NlVGVybWluYWwodGVybWluYWwpKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGRpc3Bvc2VQcm9taXNlcyk7XG5cdFx0XHRjLmdyb3VwU2VydmljZS5mb2N1c1RhYnMoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Gb2N1c0hvdmVyLFxuXHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MuZm9jdXNIb3Zlcixcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGUsIFRlcm1pbmFsQ29udGV4dEtleXMuaXNPcGVuKSxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUkpLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnRhYnNGb2N1cywgVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cylcblx0XHR9LFxuXHRcdHJ1bjogKGMpID0+IGMuZ3JvdXBTZXJ2aWNlLmZvY3VzSG92ZXIoKVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ2xlYXIsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jbGVhcicsICdDbGVhcicpLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0cHJpbWFyeTogMCxcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SyB9LFxuXHRcdFx0Ly8gV2VpZ2h0IGlzIGhpZ2hlciB0aGFuIHdvcmsgd29ya2JlbmNoIGNvbnRyaWJ1dGlvbnMgc28gdGhlIGtleWJpbmRpbmcgcmVtYWluc1xuXHRcdFx0Ly8gaGlnaGVzdCBwcmlvcml0eSB3aGVuIGNob3JkcyBhcmUgcmVnaXN0ZXJlZCBhZnRlcndhcmRzXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHQvLyBEaXNhYmxlIHRoZSBrZXliaW5kaW5nIHdoZW4gYWNjZXNzaWJpbGl0eSBtb2RlIGlzIGVuYWJsZWQgYXMgY2hvcmRzIGluY2x1ZGVcblx0XHRcdC8vIGltcG9ydGFudCBzY3JlZW4gcmVhZGVyIGtleWJpbmRpbmdzIHN1Y2ggYXMgY21kK2ssIGNtZCtpIHRvIHNob3cgdGhlIGhvdmVyXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihDb250ZXh0S2V5RXhwci5hbmQoVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cywgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRC5uZWdhdGUoKSksIENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELCBhY2Nlc3NpYmxlVmlld0lzU2hvd24sIGFjY2Vzc2libGVWaWV3Q3VycmVudFByb3ZpZGVySWQuaXNFcXVhbFRvKEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZC5UZXJtaW5hbCkpKSxcblx0XHR9XSxcblx0XHRydW46IChhY3RpdmVJbnN0YW5jZSkgPT4gYWN0aXZlSW5zdGFuY2UuY2xlYXJCdWZmZXIoKVxuXHR9KTtcblxuXHRyZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2VsZWN0RGVmYXVsdFByb2ZpbGUsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zZWxlY3REZWZhdWx0U2hlbGwnLCAnU2VsZWN0IERlZmF1bHQgUHJvZmlsZScpLFxuXHRcdHJ1bjogKGMpID0+IGMuc2VydmljZS5zaG93UHJvZmlsZVF1aWNrUGljaygnc2V0RGVmYXVsdCcpXG5cdH0pO1xuXG5cdHJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Db25maWd1cmVUZXJtaW5hbFNldHRpbmdzLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwub3BlblNldHRpbmdzJywgJ0NvbmZpZ3VyZSBUZXJtaW5hbCBTZXR0aW5ncycpLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZSxcblx0XHRydW46IChjLCBhY2Nlc3NvcikgPT4gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5TZXR0aW5ncyh7IGpzb25FZGl0b3I6IGZhbHNlLCBxdWVyeTogJ0BmZWF0dXJlOnRlcm1pbmFsJyB9KVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2V0RGltZW5zaW9ucyxcblx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNldEZpeGVkRGltZW5zaW9ucycsICdTZXQgRml4ZWQgRGltZW5zaW9ucycpLFxuXHRcdHByZWNvbmRpdGlvbjogc2hhcmVkV2hlbkNsYXVzZS50ZXJtaW5hbEF2YWlsYWJsZV9hbmRfb3BlbmVkLFxuXHRcdHJ1bjogKGFjdGl2ZUluc3RhbmNlKSA9PiBhY3RpdmVJbnN0YW5jZS5zZXRGaXhlZERpbWVuc2lvbnMoKVxuXHR9KTtcblxuXHRyZWdpc3RlckNvbnRleHR1YWxJbnN0YW5jZUFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNpemVUb0NvbnRlbnRXaWR0aCxcblx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLnRvZ2dsZVNpemVUb0NvbnRlbnRXaWR0aCxcblx0XHRwcmVjb25kaXRpb246IHNoYXJlZFdoZW5DbGF1c2UudGVybWluYWxBdmFpbGFibGVfYW5kX29wZW5lZCxcblx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlaLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzXG5cdFx0fSxcblx0XHRydW46IChpbnN0YW5jZSkgPT4gaW5zdGFuY2UudG9nZ2xlU2l6ZVRvQ29udGVudFdpZHRoKClcblx0fSk7XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlN3aXRjaFRlcm1pbmFsLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc3dpdGNoVGVybWluYWwnLCAnU3dpdGNoIFRlcm1pbmFsJyksXG5cdFx0cHJlY29uZGl0aW9uOiBzaGFyZWRXaGVuQ2xhdXNlLnRlcm1pbmFsQXZhaWxhYmxlLFxuXHRcdHJ1bjogYXN5bmMgKGMsIGFjY2Vzc29yLCBhcmdzKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtID0gdG9PcHRpb25hbFN0cmluZyhhcmdzKTtcblx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXRlbSA9PT0gU2VwYXJhdG9yU2VsZWN0T3B0aW9uLnRleHQpIHtcblx0XHRcdFx0Yy5zZXJ2aWNlLnJlZnJlc2hBY3RpdmVHcm91cCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXRlbSA9PT0gc3dpdGNoVGVybWluYWxTaG93VGFic1RpdGxlKSB7XG5cdFx0XHRcdGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpLnVwZGF0ZVZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLlRhYnNFbmFibGVkLCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0ZXJtaW5hbEluZGV4UmUgPSAvXihbMC05XSspOiAvO1xuXHRcdFx0Y29uc3QgaW5kZXhNYXRjaGVzID0gdGVybWluYWxJbmRleFJlLmV4ZWMoaXRlbSk7XG5cdFx0XHRpZiAoaW5kZXhNYXRjaGVzKSB7XG5cdFx0XHRcdGMuZ3JvdXBTZXJ2aWNlLnNldEFjdGl2ZUdyb3VwQnlJbmRleChOdW1iZXIoaW5kZXhNYXRjaGVzWzFdKSAtIDEpO1xuXHRcdFx0XHRyZXR1cm4gYy5ncm91cFNlcnZpY2Uuc2hvd1BhbmVsKHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBxdWlja1NlbGVjdFByb2ZpbGVzID0gYy5wcm9maWxlU2VydmljZS5hdmFpbGFibGVQcm9maWxlcztcblxuXHRcdFx0Ly8gUmVtb3ZlICdOZXcgJyBmcm9tIHRoZSBzZWxlY3RlZCBpdGVtIHRvIGdldCB0aGUgcHJvZmlsZSBuYW1lXG5cdFx0XHRjb25zdCBwcm9maWxlU2VsZWN0aW9uID0gaXRlbS5zdWJzdHJpbmcoNCk7XG5cdFx0XHRpZiAocXVpY2tTZWxlY3RQcm9maWxlcykge1xuXHRcdFx0XHRjb25zdCBwcm9maWxlID0gcXVpY2tTZWxlY3RQcm9maWxlcy5maW5kKHByb2ZpbGUgPT4gcHJvZmlsZS5wcm9maWxlTmFtZSA9PT0gcHJvZmlsZVNlbGVjdGlvbik7XG5cdFx0XHRcdGlmIChwcm9maWxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCBjLnNlcnZpY2UuY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0XHRcdFx0Y29uZmlnOiBwcm9maWxlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Yy5zZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zb2xlLndhcm4oYE5vIHByb2ZpbGUgd2l0aCBuYW1lIFwiJHtwcm9maWxlU2VsZWN0aW9ufVwiYCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybihgVW5tYXRjaGVkIHRlcm1pbmFsIGl0ZW06IFwiJHtpdGVtfVwiYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cblxuaW50ZXJmYWNlIElSZW1vdGVUZXJtaW5hbFBpY2sgZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHRlcm06IElSZW1vdGVUZXJtaW5hbEF0dGFjaFRhcmdldDtcbn1cblxuZnVuY3Rpb24gZ2V0U2VsZWN0ZWRWaWV3SW5zdGFuY2VzMihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IHVua25vd24pOiBJVGVybWluYWxJbnN0YW5jZVtdIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdGVybWluYWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXJtaW5hbFNlcnZpY2UpO1xuXHRjb25zdCByZXN1bHQ6IElUZXJtaW5hbEluc3RhbmNlW10gPSBbXTtcblx0Y29uc3QgY29udGV4dCA9IHBhcnNlQWN0aW9uQXJncyhhcmdzKTtcblx0aWYgKGNvbnRleHQgJiYgY29udGV4dC5sZW5ndGggPiAwKSB7XG5cdFx0Zm9yIChjb25zdCBpbnN0YW5jZUNvbnRleHQgb2YgY29udGV4dCkge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSB0ZXJtaW5hbFNlcnZpY2UuZ2V0SW5zdGFuY2VGcm9tSWQoaW5zdGFuY2VDb250ZXh0Lmluc3RhbmNlSWQpO1xuXHRcdFx0aWYgKGluc3RhbmNlKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGluc3RhbmNlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHJlc3VsdC5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRTZWxlY3RlZFZpZXdJbnN0YW5jZXMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiB1bmtub3duLCBhcmdzMj86IHVua25vd24pOiBJVGVybWluYWxJbnN0YW5jZVtdIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbGlzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKTtcblx0Y29uc3QgdGVybWluYWxHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsR3JvdXBTZXJ2aWNlKTtcblx0Y29uc3QgcmVzdWx0OiBJVGVybWluYWxJbnN0YW5jZVtdID0gW107XG5cblx0Ly8gQXNzaWduIGxpc3Qgb25seSBpZiBpdCdzIGFuIGluc3RhbmNlIG9mIFRlcm1pbmFsVGFiTGlzdCAoIzIzNDc5MSlcblx0Y29uc3QgbGlzdCA9IGxpc3RTZXJ2aWNlLmxhc3RGb2N1c2VkTGlzdCBpbnN0YW5jZW9mIFRlcm1pbmFsVGFiTGlzdCA/IGxpc3RTZXJ2aWNlLmxhc3RGb2N1c2VkTGlzdCA6IHVuZGVmaW5lZDtcblx0Ly8gR2V0IHNlbGVjdGVkIHRhYiBsaXN0IGluc3RhbmNlKHMpXG5cdGNvbnN0IHNlbGVjdGlvbnMgPSBsaXN0Py5nZXRTZWxlY3Rpb24oKTtcblx0Ly8gR2V0IGlubGluZSB0YWIgaW5zdGFuY2UgaWYgdGhlcmUgYXJlIG5vdCB0YWIgbGlzdCBzZWxlY3Rpb25zICMxOTY1Nzhcblx0aWYgKHRlcm1pbmFsR3JvdXBTZXJ2aWNlLmxhc3RBY2Nlc3NlZE1lbnUgPT09ICdpbmxpbmUtdGFiJyAmJiAhc2VsZWN0aW9ucz8ubGVuZ3RoKSB7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSB0ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRyZXR1cm4gaW5zdGFuY2UgPyBbdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2VdIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0aWYgKCFsaXN0IHx8ICFzZWxlY3Rpb25zKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBmb2N1c2VkID0gbGlzdC5nZXRGb2N1cygpO1xuXG5cdGNvbnN0IHZpZXdJbnN0YW5jZXMgPSB0ZXJtaW5hbEdyb3VwU2VydmljZS5pbnN0YW5jZXM7XG5cdGlmIChmb2N1c2VkLmxlbmd0aCA9PT0gMSAmJiAhc2VsZWN0aW9ucy5pbmNsdWRlcyhmb2N1c2VkWzBdKSkge1xuXHRcdC8vIGZvY3VzZWQgbGVuZ3RoIGlzIGFsd2F5cyBhIG1heCBvZiAxXG5cdFx0Ly8gaWYgdGhlIGZvY3VzZWQgb25lIGlzIG5vdCBpbiB0aGUgc2VsZWN0ZWQgbGlzdCwgcmV0dXJuIHRoYXQgaXRlbVxuXHRcdHJlc3VsdC5wdXNoKHZpZXdJbnN0YW5jZXNbZm9jdXNlZFswXV0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyBtdWx0aS1zZWxlY3Rcblx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2Ygc2VsZWN0aW9ucykge1xuXHRcdHJlc3VsdC5wdXNoKHZpZXdJbnN0YW5jZXNbc2VsZWN0aW9uXSk7XG5cdH1cblx0cmV0dXJuIHJlc3VsdC5maWx0ZXIociA9PiAhIXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVUZXJtaW5hbE5hbWUobmFtZTogc3RyaW5nKTogeyBjb250ZW50OiBzdHJpbmc7IHNldmVyaXR5OiBTZXZlcml0eSB9IHwgbnVsbCB7XG5cdGlmICghbmFtZSB8fCBuYW1lLnRyaW0oKS5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogbG9jYWxpemUoJ2VtcHR5VGVybWluYWxOYW1lSW5mbycsIFwiUHJvdmlkaW5nIG5vIG5hbWUgd2lsbCByZXNldCBpdCB0byB0aGUgZGVmYXVsdCB2YWx1ZVwiKSxcblx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvXG5cdFx0fTtcblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBpc1Rlcm1pbmFsUHJvZmlsZShvYmo6IHVua25vd24pOiBvYmogaXMgSVRlcm1pbmFsUHJvZmlsZSB7XG5cdHJldHVybiBpc09iamVjdChvYmopICYmICdwcm9maWxlTmFtZScgaW4gb2JqO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0T3B0aW9uc09yUHJvZmlsZVRvT3B0aW9ucyhvcHRpb25zT3JQcm9maWxlPzogSUNyZWF0ZVRlcm1pbmFsT3B0aW9ucyB8IElUZXJtaW5hbFByb2ZpbGUpOiBJQ3JlYXRlVGVybWluYWxPcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0aWYgKGlzVGVybWluYWxQcm9maWxlKG9wdGlvbnNPclByb2ZpbGUpKSB7XG5cdFx0cmV0dXJuIHsgY29uZmlnOiBvcHRpb25zT3JQcm9maWxlLCBsb2NhdGlvbjogKG9wdGlvbnNPclByb2ZpbGUgYXMgSUNyZWF0ZVRlcm1pbmFsT3B0aW9ucykubG9jYXRpb24gfTtcblx0fVxuXHRyZXR1cm4gb3B0aW9uc09yUHJvZmlsZTtcbn1cblxubGV0IG5ld1dpdGhQcm9maWxlQWN0aW9uOiBJRGlzcG9zYWJsZTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZnJlc2hUZXJtaW5hbEFjdGlvbnMoZGV0ZWN0ZWRQcm9maWxlczogSVRlcm1pbmFsUHJvZmlsZVtdKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBwcm9maWxlRW51bSA9IGNyZWF0ZVByb2ZpbGVTY2hlbWFFbnVtcyhkZXRlY3RlZFByb2ZpbGVzKTtcblx0bmV3V2l0aFByb2ZpbGVBY3Rpb24/LmRpc3Bvc2UoKTtcblx0Ly8gVE9ETzogVXNlIG5ldyByZWdpc3RlciBmdW5jdGlvblxuXHRuZXdXaXRoUHJvZmlsZUFjdGlvbiA9IHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuTmV3V2l0aFByb2ZpbGUsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubmV3V2l0aFByb2ZpbGUnLCAnQ3JlYXRlIE5ldyBUZXJtaW5hbCAoV2l0aCBQcm9maWxlKScpLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMud2ViRXh0ZW5zaW9uQ29udHJpYnV0ZWRQcm9maWxlKSxcblx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogVGVybWluYWxDb21tYW5kSWQuTmV3V2l0aFByb2ZpbGUsXG5cdFx0XHRcdFx0YXJnczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICdhcmdzJyxcblx0XHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsncHJvZmlsZU5hbWUnXSxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdHByb2ZpbGVOYW1lOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubmV3V2l0aFByb2ZpbGUucHJvZmlsZU5hbWUnLCBcIlRoZSBuYW1lIG9mIHRoZSBwcm9maWxlIHRvIGNyZWF0ZVwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZW51bTogcHJvZmlsZUVudW0udmFsdWVzLFxuXHRcdFx0XHRcdFx0XHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBwcm9maWxlRW51bS5tYXJrZG93bkRlc2NyaXB0aW9uc1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0bG9jYXRpb246IHtcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbmV3V2l0aFByb2ZpbGUubG9jYXRpb24nLCBcIldoZXJlIHRvIGNyZWF0ZSB0aGUgdGVybWluYWxcIiksXG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdGVudW06IFsndmlldycsICdlZGl0b3InXSxcblx0XHRcdFx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ25ld1dpdGhQcm9maWxlLmxvY2F0aW9uLnZpZXcnLCAnQ3JlYXRlIHRoZSB0ZXJtaW5hbCBpbiB0aGUgdGVybWluYWwgdmlldycpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnbmV3V2l0aFByb2ZpbGUubG9jYXRpb24uZWRpdG9yJywgJ0NyZWF0ZSB0aGUgdGVybWluYWwgaW4gdGhlIGVkaXRvcicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXN5bmMgcnVuKFxuXHRcdFx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdFx0XHRldmVudE9yT3B0aW9uc09yUHJvZmlsZTogTW91c2VFdmVudCB8IElDcmVhdGVUZXJtaW5hbE9wdGlvbnMgfCBJVGVybWluYWxQcm9maWxlIHwgeyBwcm9maWxlTmFtZTogc3RyaW5nOyBsb2NhdGlvbj86ICd2aWV3JyB8ICdlZGl0b3InIHwgdW5rbm93biB9IHwgdW5kZWZpbmVkLFxuXHRcdFx0cHJvZmlsZT86IElUZXJtaW5hbFByb2ZpbGVcblx0XHQpIHtcblx0XHRcdGNvbnN0IGMgPSBnZXRUZXJtaW5hbFNlcnZpY2VzKGFjY2Vzc29yKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0XHRsZXQgZXZlbnQ6IE1vdXNlRXZlbnQgfCBQb2ludGVyRXZlbnQgfCBLZXlib2FyZEV2ZW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IG9wdGlvbnM6IElDcmVhdGVUZXJtaW5hbE9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGN3ZDogc3RyaW5nIHwgVVJJIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoaXNPYmplY3QoZXZlbnRPck9wdGlvbnNPclByb2ZpbGUpICYmIGV2ZW50T3JPcHRpb25zT3JQcm9maWxlICYmIGhhc0tleShldmVudE9yT3B0aW9uc09yUHJvZmlsZSwgeyBwcm9maWxlTmFtZTogdHJ1ZSB9KSkge1xuXHRcdFx0XHRjb25zdCBjb25maWcgPSBjLnByb2ZpbGVTZXJ2aWNlLmF2YWlsYWJsZVByb2ZpbGVzLmZpbmQocHJvZmlsZSA9PiBwcm9maWxlLnByb2ZpbGVOYW1lID09PSBldmVudE9yT3B0aW9uc09yUHJvZmlsZS5wcm9maWxlTmFtZSk7XG5cdFx0XHRcdGlmICghY29uZmlnKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgZmluZCB0ZXJtaW5hbCBwcm9maWxlIFwiJHtldmVudE9yT3B0aW9uc09yUHJvZmlsZS5wcm9maWxlTmFtZX1cImApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9wdGlvbnMgPSB7IGNvbmZpZyB9O1xuXHRcdFx0XHRmdW5jdGlvbiBpc1NpbXBsZUFyZ3Mob2JqOiB1bmtub3duKTogb2JqIGlzIHsgcHJvZmlsZU5hbWU6IHN0cmluZzsgbG9jYXRpb24/OiAndmlldycgfCAnZWRpdG9yJyB8IHVua25vd24gfSB7XG5cdFx0XHRcdFx0cmV0dXJuIGlzT2JqZWN0KG9iaikgJiYgJ2xvY2F0aW9uJyBpbiBvYmo7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzU2ltcGxlQXJncyhldmVudE9yT3B0aW9uc09yUHJvZmlsZSkpIHtcblx0XHRcdFx0XHRzd2l0Y2ggKGV2ZW50T3JPcHRpb25zT3JQcm9maWxlLmxvY2F0aW9uKSB7XG5cdFx0XHRcdFx0XHRjYXNlICdlZGl0b3InOiBvcHRpb25zLmxvY2F0aW9uID0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3I7IGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSAndmlldyc6IG9wdGlvbnMubG9jYXRpb24gPSBUZXJtaW5hbExvY2F0aW9uLlBhbmVsOyBicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXNNb3VzZUV2ZW50KGV2ZW50T3JPcHRpb25zT3JQcm9maWxlKSB8fCBpc1BvaW50ZXJFdmVudChldmVudE9yT3B0aW9uc09yUHJvZmlsZSkgfHwgaXNLZXlib2FyZEV2ZW50KGV2ZW50T3JPcHRpb25zT3JQcm9maWxlKSkge1xuXHRcdFx0XHRldmVudCA9IGV2ZW50T3JPcHRpb25zT3JQcm9maWxlO1xuXHRcdFx0XHRvcHRpb25zID0gcHJvZmlsZSA/IHsgY29uZmlnOiBwcm9maWxlIH0gOiB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvcHRpb25zID0gY29udmVydE9wdGlvbnNPclByb2ZpbGVUb09wdGlvbnMoZXZlbnRPck9wdGlvbnNPclByb2ZpbGUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBzcGxpdCB0ZXJtaW5hbFxuXHRcdFx0aWYgKGV2ZW50ICYmIChldmVudC5hbHRLZXkgfHwgZXZlbnQuY3RybEtleSkpIHtcblx0XHRcdFx0Y29uc3QgcGFyZW50VGVybWluYWwgPSBjLnNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0XHRcdGlmIChwYXJlbnRUZXJtaW5hbCkge1xuXHRcdFx0XHRcdGF3YWl0IGMuc2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGxvY2F0aW9uOiB7IHBhcmVudFRlcm1pbmFsIH0sIGNvbmZpZzogb3B0aW9ucz8uY29uZmlnIH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmb2xkZXJzID0gd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRcdGlmIChmb2xkZXJzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Ly8gbXVsdGktcm9vdCB3b3Jrc3BhY2UsIGNyZWF0ZSByb290IHBpY2tlclxuXHRcdFx0XHRjb25zdCBvcHRpb25zOiBJUGlja09wdGlvbnM8SVF1aWNrUGlja0l0ZW0+ID0ge1xuXHRcdFx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5uZXdXb3Jrc3BhY2VQbGFjZWhvbGRlcicsIFwiU2VsZWN0IGN1cnJlbnQgd29ya2luZyBkaXJlY3RvcnkgZm9yIG5ldyB0ZXJtaW5hbFwiKVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxJV29ya3NwYWNlRm9sZGVyPihQSUNLX1dPUktTUEFDRV9GT0xERVJfQ09NTUFORF9JRCwgW29wdGlvbnNdKTtcblx0XHRcdFx0aWYgKCF3b3Jrc3BhY2UpIHtcblx0XHRcdFx0XHQvLyBEb24ndCBjcmVhdGUgdGhlIGluc3RhbmNlIGlmIHRoZSB3b3Jrc3BhY2UgcGlja2VyIHdhcyBjYW5jZWxlZFxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjd2QgPSB3b3Jrc3BhY2UudXJpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3B0aW9ucykge1xuXHRcdFx0XHRvcHRpb25zLmN3ZCA9IGN3ZDtcblx0XHRcdFx0aW5zdGFuY2UgPSBhd2FpdCBjLnNlcnZpY2UuY3JlYXRlVGVybWluYWwob3B0aW9ucyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbnN0YW5jZSA9IGF3YWl0IGMuc2VydmljZS5zaG93UHJvZmlsZVF1aWNrUGljaygnY3JlYXRlSW5zdGFuY2UnLCBjd2QpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaW5zdGFuY2UpIHtcblx0XHRcdFx0Yy5zZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdFx0YXdhaXQgZm9jdXNBY3RpdmVUZXJtaW5hbChpbnN0YW5jZSwgYyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblx0cmV0dXJuIG5ld1dpdGhQcm9maWxlQWN0aW9uO1xufVxuXG5mdW5jdGlvbiBnZXRSZXNvdXJjZU9yQWN0aXZlSW5zdGFuY2UoYzogSVRlcm1pbmFsU2VydmljZXNDb2xsZWN0aW9uLCByZXNvdXJjZTogdW5rbm93bik6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGMuc2VydmljZS5nZXRJbnN0YW5jZUZyb21SZXNvdXJjZSh0b09wdGlvbmFsVXJpKHJlc291cmNlKSkgfHwgYy5zZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xufVxuXG5hc3luYyBmdW5jdGlvbiBwaWNrVGVybWluYWxDd2QoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNhbmNlbD86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxXb3Jrc3BhY2VGb2xkZXJDd2RQYWlyIHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdGNvbnN0IGxhYmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFiZWxTZXJ2aWNlKTtcblx0Y29uc3QgY29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNb2RlbFNlcnZpY2UpO1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UpO1xuXG5cdGNvbnN0IGZvbGRlcnMgPSBjb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRpZiAoIWZvbGRlcnMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgZm9sZGVyQ3dkUGFpcnMgPSBhd2FpdCBQcm9taXNlLmFsbChmb2xkZXJzLm1hcChlID0+IHJlc29sdmVXb3Jrc3BhY2VGb2xkZXJDd2QoZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UpKSk7XG5cdGNvbnN0IHNocmlua2VkUGFpcnMgPSBzaHJpbmtXb3Jrc3BhY2VGb2xkZXJDd2RQYWlycyhmb2xkZXJDd2RQYWlycyk7XG5cblx0aWYgKHNocmlua2VkUGFpcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0cmV0dXJuIHNocmlua2VkUGFpcnNbMF07XG5cdH1cblxuXHR0eXBlIEl0ZW0gPSBJUXVpY2tQaWNrSXRlbSAmIHsgcGFpcjogV29ya3NwYWNlRm9sZGVyQ3dkUGFpciB9O1xuXHRjb25zdCBmb2xkZXJQaWNrczogSXRlbVtdID0gc2hyaW5rZWRQYWlycy5tYXAocGFpciA9PiB7XG5cdFx0Y29uc3QgbGFiZWwgPSBwYWlyLmZvbGRlci5uYW1lO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gcGFpci5pc092ZXJyaWRkZW5cblx0XHRcdD8gbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwub3ZlcnJpZGRlbkN3ZERlc2NyaXB0aW9uJywgXCIoT3ZlcnJpZGRlbikgezB9XCIsIGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChwYWlyLmN3ZCwgeyByZWxhdGl2ZTogIXBhaXIuaXNBYnNvbHV0ZSB9KSlcblx0XHRcdDogbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcm5hbWUocGFpci5jd2QpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uICE9PSBsYWJlbCA/IGRlc2NyaXB0aW9uIDogdW5kZWZpbmVkLFxuXHRcdFx0cGFpcjogcGFpcixcblx0XHRcdGljb25DbGFzc2VzOiBnZXRJY29uQ2xhc3Nlcyhtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgcGFpci5jd2QsIEZpbGVLaW5kLlJPT1RfRk9MREVSKVxuXHRcdH07XG5cdH0pO1xuXHRjb25zdCBvcHRpb25zOiBJUGlja09wdGlvbnM8SXRlbT4gPSB7XG5cdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLm5ld1dvcmtzcGFjZVBsYWNlaG9sZGVyJywgXCJTZWxlY3QgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeSBmb3IgbmV3IHRlcm1pbmFsXCIpLFxuXHRcdG1hdGNoT25EZXNjcmlwdGlvbjogdHJ1ZSxcblx0XHRjYW5QaWNrTWFueTogZmFsc2UsXG5cdH07XG5cblx0Y29uc3QgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gY2FuY2VsIHx8IENhbmNlbGxhdGlvblRva2VuLk5vbmU7XG5cdGNvbnN0IHBpY2sgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrPEl0ZW0+KGZvbGRlclBpY2tzLCBvcHRpb25zLCB0b2tlbik7XG5cdHJldHVybiBwaWNrPy5wYWlyO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlV29ya3NwYWNlRm9sZGVyQ3dkKGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZTogSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UpOiBQcm9taXNlPFdvcmtzcGFjZUZvbGRlckN3ZFBhaXI+IHtcblx0Y29uc3QgY3dkQ29uZmlnID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuQ3dkLCB7IHJlc291cmNlOiBmb2xkZXIudXJpIH0pO1xuXHRpZiAoIWlzU3RyaW5nKGN3ZENvbmZpZykgfHwgY3dkQ29uZmlnLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB7IGZvbGRlciwgY3dkOiBmb2xkZXIudXJpLCBpc0Fic29sdXRlOiBmYWxzZSwgaXNPdmVycmlkZGVuOiBmYWxzZSB9O1xuXHR9XG5cblx0Y29uc3QgcmVzb2x2ZWRDd2RDb25maWcgPSBhd2FpdCBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVBc3luYyhmb2xkZXIsIGN3ZENvbmZpZyk7XG5cdHJldHVybiBpc0Fic29sdXRlKHJlc29sdmVkQ3dkQ29uZmlnKSB8fCByZXNvbHZlZEN3ZENvbmZpZy5zdGFydHNXaXRoKENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24uVkFSSUFCTEVfTEhTKVxuXHRcdD8geyBmb2xkZXIsIGlzQWJzb2x1dGU6IHRydWUsIGlzT3ZlcnJpZGRlbjogdHJ1ZSwgY3dkOiBVUkkuZnJvbSh7IC4uLmZvbGRlci51cmksIHBhdGg6IHJlc29sdmVkQ3dkQ29uZmlnIH0pIH1cblx0XHQ6IHsgZm9sZGVyLCBpc0Fic29sdXRlOiBmYWxzZSwgaXNPdmVycmlkZGVuOiB0cnVlLCBjd2Q6IFVSSS5qb2luUGF0aChmb2xkZXIudXJpLCByZXNvbHZlZEN3ZENvbmZpZykgfTtcbn1cblxuLyoqXG4gKiBEcm9wcyByZXBlYXRlZCBDV0RzLCBpZiBhbnksIGJ5IGtlZXBpbmcgdGhlIG9uZSB3aGljaCBiZXN0IG1hdGNoZXMgdGhlIHdvcmtzcGFjZSBmb2xkZXIuIEl0IGFsc28gcHJlc2VydmVzIHRoZSBvcmlnaW5hbCBvcmRlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNocmlua1dvcmtzcGFjZUZvbGRlckN3ZFBhaXJzKHBhaXJzOiBXb3Jrc3BhY2VGb2xkZXJDd2RQYWlyW10pOiBXb3Jrc3BhY2VGb2xkZXJDd2RQYWlyW10ge1xuXHRjb25zdCBtYXAgPSBuZXcgTWFwPHN0cmluZywgV29ya3NwYWNlRm9sZGVyQ3dkUGFpcj4oKTtcblx0Zm9yIChjb25zdCBwYWlyIG9mIHBhaXJzKSB7XG5cdFx0Y29uc3Qga2V5ID0gcGFpci5jd2QudG9TdHJpbmcoKTtcblx0XHRjb25zdCB2YWx1ZSA9IG1hcC5nZXQoa2V5KTtcblx0XHRpZiAoIXZhbHVlIHx8IGtleSA9PT0gcGFpci5mb2xkZXIudXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdG1hcC5zZXQoa2V5LCBwYWlyKTtcblx0XHR9XG5cdH1cblx0Y29uc3Qgc2VsZWN0ZWRQYWlycyA9IG5ldyBTZXQobWFwLnZhbHVlcygpKTtcblx0Y29uc3Qgc2VsZWN0ZWRQYWlyc0luT3JkZXIgPSBwYWlycy5maWx0ZXIoeCA9PiBzZWxlY3RlZFBhaXJzLmhhcyh4KSk7XG5cdHJldHVybiBzZWxlY3RlZFBhaXJzSW5PcmRlcjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZm9jdXNBY3RpdmVUZXJtaW5hbChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQsIGM6IElUZXJtaW5hbFNlcnZpY2VzQ29sbGVjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCB0YXJnZXQgPSBpbnN0YW5jZVxuXHRcdD8/IGMuc2VydmljZS5hY3RpdmVJbnN0YW5jZVxuXHRcdD8/IGMuZWRpdG9yU2VydmljZS5hY3RpdmVJbnN0YW5jZVxuXHRcdD8/IGMuZ3JvdXBTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRpZiAoIXRhcmdldCkge1xuXHRcdGlmIChjLmdyb3VwU2VydmljZS5pbnN0YW5jZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0YXdhaXQgYy5ncm91cFNlcnZpY2Uuc2hvd1BhbmVsKHRydWUpO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblx0YXdhaXQgYy5zZXJ2aWNlLmZvY3VzSW5zdGFuY2UodGFyZ2V0KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVuYW1lV2l0aFF1aWNrUGljayhjOiBJVGVybWluYWxTZXJ2aWNlc0NvbGxlY3Rpb24sIGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZT86IHVua25vd24pIHtcblx0bGV0IGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCA9IHJlc291cmNlIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXHQvLyBDaGVjayBpZiB0aGUgJ2luc3RhbmNlJyBkb2VzIG5vdCBleGlzdCBvciBpZiAnaW5zdGFuY2UucmVuYW1lJyBpcyBub3QgZGVmaW5lZFxuXHRpZiAoIWluc3RhbmNlIHx8ICFpbnN0YW5jZT8ucmVuYW1lKSB7XG5cdFx0Ly8gSWYgbm90LCBvYnRhaW4gdGhlIHJlc291cmNlIGluc3RhbmNlIHVzaW5nICdnZXRSZXNvdXJjZU9yQWN0aXZlSW5zdGFuY2UnXG5cdFx0aW5zdGFuY2UgPSBnZXRSZXNvdXJjZU9yQWN0aXZlSW5zdGFuY2UoYywgcmVzb3VyY2UpO1xuXHR9XG5cblx0aWYgKGluc3RhbmNlKSB7XG5cdFx0Y29uc3QgdGl0bGUgPSBhd2FpdCBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKS5pbnB1dCh7XG5cdFx0XHR2YWx1ZTogaW5zdGFuY2UudGl0bGUsXG5cdFx0XHRwcm9tcHQ6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJlbmFtZS5wcm9tcHQnLCBcIkVudGVyIHRlcm1pbmFsIG5hbWVcIiksXG5cdFx0fSk7XG5cdFx0aWYgKHRpdGxlKSB7XG5cdFx0XHRpbnN0YW5jZS5yZW5hbWUodGl0bGUpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiB0b09wdGlvbmFsVXJpKG9iajogdW5rbm93bik6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBVUkkuaXNVcmkob2JqKSA/IG9iaiA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdG9PcHRpb25hbFN0cmluZyhvYmo6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gaXNTdHJpbmcob2JqKSA/IG9iaiA6IHVuZGVmaW5lZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBaUIsY0FBYyxnQkFBZ0IsdUJBQXVCO0FBQy9FLFNBQVMsY0FBYztBQUN2QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUUxQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsUUFBUSxVQUFVLGdCQUFnQjtBQUMzQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLFNBQTBCLFFBQVEsdUJBQXVCO0FBQ2xFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLHNCQUFzQjtBQUMvQixTQUF1QiwwQkFBMEM7QUFDakUsU0FBUywwQkFBMEI7QUFDbkMsU0FBMkIsb0JBQWtDLGtCQUFrQix5QkFBeUI7QUFDeEcsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQ0FBa0Q7QUFDM0QsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxjQUFjLGtCQUFrQixrQkFBa0I7QUFDM0QsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQ0FBaUMsdUJBQXVCLGdDQUFnQztBQUNqRyxTQUFzQyxpQ0FBaUMseUJBQXlCLGtCQUFrQix5QkFBeUI7QUFDM0ksU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUE4RCwrQkFBK0Isd0JBQXdCLHlCQUF5Qix1QkFBMEMsMEJBQTBCLHdCQUF3QztBQUNuUSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWUsV0FBVyxxQkFBcUI7QUFDeEQsU0FBUyxrQkFBa0IsdUJBQXVCO0FBRWxELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBRS9CLE1BQU0sOEJBQThCLFNBQVMsb0JBQW9CLFdBQVc7QUFFbkYsTUFBTSxXQUFXLGdCQUFnQjtBQUkxQixNQUFNLG9CQUFvQixNQUFNO0FBQ3RDLFFBQU0sb0JBQW9CLGVBQWUsR0FBRyxvQkFBb0Isa0JBQWtCLG9CQUFvQixzQkFBc0I7QUFDNUgsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBLDhCQUE4QixlQUFlLElBQUksbUJBQW1CLG9CQUFvQixNQUFNO0FBQUEsSUFDOUYsb0NBQW9DLGVBQWUsSUFBSSxtQkFBbUIsb0JBQW9CLG9CQUFvQjtBQUFBLElBQ2xILHlDQUF5QyxlQUFlLElBQUksbUJBQW1CLG9CQUFvQixxQkFBcUI7QUFBQSxJQUN4SCw2QkFBNkIsZUFBZSxJQUFJLG9CQUFvQixZQUFZLG9CQUFvQixnQkFBZ0IsT0FBTyxDQUFDO0FBQUEsRUFDN0g7QUFDRCxHQUFHO0FBU0gsZUFBc0IsZUFDckIsVUFDQSxTQUNBLGdCQUNBLGVBQ29DO0FBQ3BDLFVBQVEsY0FBYyxPQUFPLFVBQVU7QUFBQSxJQUN0QyxLQUFLO0FBQ0osVUFBSSxZQUFZLFVBQWEsbUJBQW1CLFFBQVc7QUFDMUQsWUFBSSxRQUFRLFdBQVcsR0FBRztBQUN6QixpQkFBTyxRQUFRLENBQUMsRUFBRTtBQUFBLFFBQ25CLFdBQVcsUUFBUSxTQUFTLEdBQUc7QUFFOUIsZ0JBQU0sVUFBd0M7QUFBQSxZQUM3QyxhQUFhLFNBQVMscURBQXFELG1EQUFtRDtBQUFBLFVBQy9IO0FBQ0EsZ0JBQU0sWUFBWSxNQUFNLGVBQWUsZUFBaUMsa0NBQWtDLENBQUMsT0FBTyxDQUFDO0FBQ25ILGNBQUksQ0FBQyxXQUFXO0FBRWYsbUJBQU87QUFBQSxVQUNSO0FBQ0EsaUJBQU8sUUFBUSxRQUFRLFVBQVUsR0FBRztBQUFBLFFBQ3JDO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPLFNBQVMsY0FBYztBQUFBLElBQy9CLEtBQUs7QUFDSixhQUFPLFNBQVMsa0JBQWtCO0FBQUEsRUFDcEM7QUFDRDtBQUVPLElBQU0sMkJBQU4sY0FBdUMsT0FBTztBQUFBLEVBRXBELFlBQ2tDLGdCQUNoQztBQUNELFVBQU0sd0NBQXdDLFNBQVMsc0JBQXNCLFdBQVcsQ0FBQztBQUZ4RDtBQUFBLEVBR2xDO0FBQUEsRUFFQSxNQUFlLE1BQXFCO0FBQ25DLFNBQUssZUFBZSxLQUFLLG9EQUFvRDtBQUFBLEVBQzlFO0FBQ0Q7QUFYYSwyQkFBTjtBQUFBLEVBR0o7QUFBQSxHQUhVO0FBcUJOLFNBQVMsdUJBQ2YsU0FDYztBQUVkLFVBQVEsS0FBSyxRQUFRLE1BQU07QUFDM0IsVUFBUSxXQUFXLFFBQVEsWUFBWTtBQUN2QyxVQUFRLGVBQWUsUUFBUSxnQkFBZ0Isb0JBQW9CO0FBRW5FLFFBQU0sVUFBVSxRQUFRO0FBQ3hCLFFBQU0sZ0JBQXFKO0FBQzNKLFNBQVEsY0FBc0osS0FBSztBQUVuSyxTQUFPLGdCQUFnQixjQUFjLFFBQVE7QUFBQSxJQUM1QyxjQUFjO0FBQ2IsWUFBTSxhQUFnQztBQUFBLElBQ3ZDO0FBQUEsSUFDQSxJQUFJLFVBQTRCLE1BQWdCLE9BQWlCO0FBQ2hFLGFBQU8sUUFBUSxvQkFBb0IsUUFBUSxHQUFHLFVBQVUsTUFBTSxLQUFLO0FBQUEsSUFDcEU7QUFBQSxFQUNELENBQUM7QUFDRjtBQUVBLFNBQVMsZ0JBQWdCLE1BQStDO0FBQ3ZFLE1BQUksTUFBTSxRQUFRLElBQUksR0FBRztBQUN4QixRQUFJLEtBQUssTUFBTSxPQUFLLGFBQWEsZUFBZSxHQUFHO0FBQ2xELGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRCxXQUFXLGdCQUFnQixpQkFBaUI7QUFDM0MsV0FBTyxDQUFDLElBQUk7QUFBQSxFQUNiO0FBQ0EsU0FBTztBQUNSO0FBTU8sU0FBUyxpQ0FDZixTQWFjO0FBQ2QsUUFBTSxjQUFjLFFBQVE7QUFDNUIsU0FBTyx1QkFBdUI7QUFBQSxJQUM3QixHQUFHO0FBQUEsSUFDSCxLQUFLLE9BQU8sR0FBRyxVQUFVLHFCQUFxQixvQkFBb0I7QUFDakUsVUFBSSxZQUFZLDBCQUEwQixVQUFVLGVBQWU7QUFDbkUsVUFBSSxDQUFDLFdBQVc7QUFDZixjQUFNLGtCQUNMLFFBQVEsdUJBQXVCLFNBQzVCLEVBQUUsZUFDRixRQUFRLHVCQUF1QixXQUNoQyxFQUFFLGdCQUNBLEVBQUUsU0FDTDtBQUNGLFlBQUksQ0FBQyxnQkFBZ0I7QUFDcEI7QUFBQSxRQUNEO0FBQ0Esb0JBQVksQ0FBQyxjQUFjO0FBQUEsTUFDNUI7QUFDQSxZQUFNLFVBQXVDLENBQUM7QUFDOUMsaUJBQVcsWUFBWSxXQUFXO0FBQ2pDLGdCQUFRLEtBQUssWUFBWSxVQUFVLEdBQUcsVUFBVSxtQkFBbUIsQ0FBQztBQUFBLE1BQ3JFO0FBQ0EsWUFBTSxRQUFRLElBQUksT0FBTztBQUN6QixVQUFJLFFBQVEsVUFBVTtBQUNyQixnQkFBUSxTQUFTLFdBQVcsR0FBRyxVQUFVLG1CQUFtQjtBQUFBLE1BQzdEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUNGO0FBTU8sU0FBUyw2QkFDZixTQUNjO0FBQ2QsUUFBTSxjQUFjLFFBQVE7QUFDNUIsU0FBTyx1QkFBdUI7QUFBQSxJQUM3QixHQUFHO0FBQUEsSUFDSCxLQUFLLENBQUMsR0FBRyxVQUFVLFNBQVM7QUFDM0IsWUFBTSxpQkFBaUIsRUFBRSxRQUFRO0FBQ2pDLFVBQUksZ0JBQWdCO0FBQ25CLGVBQU8sWUFBWSxnQkFBZ0IsR0FBRyxVQUFVLElBQUk7QUFBQSxNQUNyRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFDRjtBQVFPLFNBQVMsMEJBQ2YsU0FDYztBQUNkLFFBQU0sY0FBYyxRQUFRO0FBQzVCLFNBQU8sdUJBQXVCO0FBQUEsSUFDN0IsR0FBRztBQUFBLElBQ0gsS0FBSyxDQUFDLEdBQUcsVUFBVSxTQUFTO0FBQzNCLFlBQU0saUJBQWlCLFNBQVMsS0FBSyxFQUFFLFFBQVEsbUJBQW1CLE9BQUssRUFBRSxNQUFNLFNBQVM7QUFDeEYsVUFBSSxnQkFBZ0I7QUFDbkIsZUFBTyxZQUFZLGVBQWUsT0FBTyxVQUFVLGdCQUFnQixJQUFJO0FBQUEsTUFDeEU7QUFFQSxZQUFNLGlCQUFpQixFQUFFLFFBQVE7QUFDakMsVUFBSSxnQkFBZ0IsT0FBTztBQUMxQixlQUFPLFlBQVksZUFBZSxPQUFPLFVBQVUsZ0JBQWdCLElBQUk7QUFBQSxNQUN4RTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFDRjtBQWFBLFNBQVMsb0JBQW9CLFVBQXlEO0FBQ3JGLFNBQU87QUFBQSxJQUNOLFNBQVMsU0FBUyxJQUFJLGdCQUFnQjtBQUFBLElBQ3RDLGVBQWUsU0FBUyxJQUFJLDZCQUE2QjtBQUFBLElBQ3pELGNBQWMsU0FBUyxJQUFJLHFCQUFxQjtBQUFBLElBQ2hELGlCQUFpQixTQUFTLElBQUksd0JBQXdCO0FBQUEsSUFDdEQsZUFBZSxTQUFTLElBQUksc0JBQXNCO0FBQUEsSUFDbEQsZ0JBQWdCLFNBQVMsSUFBSSx1QkFBdUI7QUFBQSxJQUNwRCxnQkFBZ0IsU0FBUyxJQUFJLHVCQUF1QjtBQUFBLElBQ3BELHdCQUF3QixTQUFTLElBQUksK0JBQStCO0FBQUEsRUFDckU7QUFDRDtBQUVPLFNBQVMsMEJBQTBCO0FBQ3pDLHlCQUF1QjtBQUFBLElBQ3RCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxVQUFVLGtEQUFrRCwyQ0FBMkM7QUFBQSxJQUM5RyxLQUFLLE9BQU8sTUFBTTtBQUNqQixVQUFJLEVBQUUsUUFBUSw0QkFBNEI7QUFDekMsY0FBTSxXQUFXLE1BQU0sRUFBRSxRQUFRLGVBQWUsRUFBRSxVQUFVLEVBQUUsY0FBYyxnQkFBZ0IsQ0FBQztBQUM3RixZQUFJLENBQUMsVUFBVTtBQUNkO0FBQUEsUUFDRDtBQUNBLFVBQUUsUUFBUSxrQkFBa0IsUUFBUTtBQUNwQyxjQUFNLG9CQUFvQixVQUFVLENBQUM7QUFBQSxNQUN0QztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFHRCx5QkFBdUIsQ0FBQyxDQUFDO0FBRXpCLHlCQUF1QjtBQUFBLElBQ3RCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxVQUFVLGtEQUFrRCxvQ0FBb0M7QUFBQSxJQUN2RyxLQUFLLE9BQU8sR0FBRyxHQUFHLFNBQVM7QUFDMUIsZUFBUyx3QkFBd0IsS0FBNkM7QUFDN0UsZUFBTyxTQUFTLEdBQUcsS0FBSyxjQUFjO0FBQUEsTUFDdkM7QUFDQSxZQUFNLFVBQVUsd0JBQXdCLElBQUksSUFBSSxPQUFPLEVBQUUsVUFBVSxFQUFFLFlBQVksYUFBYSxFQUFFO0FBQ2hHLFlBQU0sV0FBVyxNQUFNLEVBQUUsUUFBUSxlQUFlLE9BQU87QUFDdkQsWUFBTSxTQUFTLGVBQWU7QUFBQSxJQUMvQjtBQUFBLEVBQ0QsQ0FBQztBQUVELHlCQUF1QjtBQUFBLElBQ3RCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxVQUFVLGtEQUFrRCxvQ0FBb0M7QUFBQSxJQUN2RyxJQUFJO0FBQUEsSUFDSixLQUFLLE9BQU8sR0FBRyxVQUFVLFNBQVM7QUFHakMsWUFBTSxzQkFBc0IsU0FBUyxJQUFJLG9CQUFvQjtBQUM3RCxZQUFNLFdBQVcsTUFBTSxFQUFFLFFBQVEsZUFBZTtBQUFBLFFBQy9DLFVBQVU7QUFBQSxVQUNULFlBQVksb0JBQW9CLHFCQUFxQixvQkFBb0IsV0FBVztBQUFBLFFBQ3JGO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxTQUFTLGVBQWU7QUFBQSxJQUMvQjtBQUFBLEVBQ0QsQ0FBQztBQUVELHlCQUF1QjtBQUFBLElBQ3RCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxVQUFVLHNEQUFzRCxnREFBZ0Q7QUFBQSxJQUN2SCxLQUFLLE9BQU8sTUFBTTtBQUNqQixZQUFNLFdBQVcsTUFBTSxFQUFFLFFBQVEsZUFBZTtBQUFBLFFBQy9DLFVBQVUsRUFBRSxZQUFZLFdBQVc7QUFBQSxNQUNwQyxDQUFDO0FBQ0QsWUFBTSxTQUFTLGVBQWU7QUFBQSxJQUMvQjtBQUFBLEVBQ0QsQ0FBQztBQUVELHlCQUF1QjtBQUFBLElBQ3RCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxnQkFBZ0I7QUFBQSxJQUN2QixjQUFjLGlCQUFpQjtBQUFBLElBQy9CLFlBQVk7QUFBQSxNQUNYLFNBQVMsT0FBTyxVQUFVLE9BQU8sUUFBUSxPQUFPLE1BQU0sUUFBUTtBQUFBLE1BQzlELEtBQUssRUFBRSxTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsT0FBTyxNQUFNLFFBQVEsVUFBVTtBQUFBLE1BQy9FLFFBQVEsaUJBQWlCO0FBQUEsSUFDMUI7QUFBQSxJQUNBLEtBQUssT0FBTyxNQUFNO0FBQ2pCLFlBQU0sV0FBVyxNQUFNLEVBQUUsUUFBUSxlQUFlO0FBQUEsUUFDL0MsVUFBVTtBQUFBLFVBQ1QsWUFBWTtBQUFBLFVBQ1osV0FBVyxFQUFFLFNBQVMsS0FBSztBQUFBLFFBQzVCO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxTQUFTLGVBQWU7QUFBQSxJQUMvQjtBQUFBLEVBQ0QsQ0FBQztBQUVELG1DQUFpQztBQUFBLElBQ2hDLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxnQkFBZ0I7QUFBQSxJQUN2QixjQUFjLGlCQUFpQjtBQUFBLElBQy9CLG9CQUFvQjtBQUFBLElBQ3BCLEtBQUssQ0FBQyxVQUFVLE1BQU0sRUFBRSxRQUFRLGFBQWEsUUFBUTtBQUFBLElBQ3JELFVBQVUsQ0FBQyxjQUFjLFVBQVUsR0FBRyxFQUFFLEdBQUcsTUFBTTtBQUFBLEVBQ2xELENBQUM7QUFFRCxtQ0FBaUM7QUFBQSxJQUNoQyxJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sZ0JBQWdCO0FBQUEsSUFDdkIsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLENBQUMsVUFBVSxNQUFNLEVBQUUsUUFBUSxrQkFBa0IsUUFBUTtBQUFBLElBQzFELFVBQVUsQ0FBQyxjQUFjLFVBQVUsR0FBRyxFQUFFLEdBQUcsTUFBTTtBQUFBLEVBQ2xELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sZ0JBQWdCO0FBQUEsSUFDdkIsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLENBQUMsR0FBRyxHQUFHLFNBQVM7QUFDcEIsWUFBTSxTQUFTLGNBQWMsSUFBSSxLQUFLLEVBQUUsY0FBYztBQUN0RCxVQUFJLFFBQVE7QUFDWCxVQUFFLFFBQVEsbUJBQW1CLE1BQU07QUFBQSxNQUNwQztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSwrQ0FBK0MsMkNBQTJDO0FBQUEsSUFDM0csWUFBWTtBQUFBLE1BQ1gsU0FBUyxPQUFPLE1BQU0sUUFBUTtBQUFBLE1BQzlCLFdBQVcsQ0FBQyxPQUFPLE1BQU0sUUFBUSxPQUFPO0FBQUEsTUFDeEMsS0FBSztBQUFBLFFBQ0osU0FBUyxPQUFPLE1BQU0sT0FBTyxVQUFVLFFBQVE7QUFBQSxRQUMvQyxXQUFXLENBQUMsT0FBTyxNQUFNLE9BQU8sVUFBVSxRQUFRLE9BQU87QUFBQSxNQUMxRDtBQUFBLE1BQ0EsTUFBTSxlQUFlLElBQUksb0JBQW9CLE9BQU8sb0JBQW9CLG1CQUFtQjtBQUFBO0FBQUEsTUFFM0YsUUFBUSxpQkFBaUIsbUJBQW1CO0FBQUEsSUFDN0M7QUFBQSxJQUNBLGNBQWMsaUJBQWlCO0FBQUEsSUFDL0IsS0FBSyxPQUFPLE1BQU07QUFDakIsUUFBRSxhQUFhLGFBQWEsa0JBQWtCO0FBQzlDLFlBQU0sRUFBRSxhQUFhLFVBQVUsSUFBSTtBQUFBLElBQ3BDO0FBQUEsRUFDRCxDQUFDO0FBRUQseUJBQXVCO0FBQUEsSUFDdEIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLFVBQVUsMkNBQTJDLHVDQUF1QztBQUFBLElBQ25HLFlBQVk7QUFBQSxNQUNYLFNBQVMsT0FBTyxNQUFNLFFBQVE7QUFBQSxNQUM5QixXQUFXLENBQUMsT0FBTyxNQUFNLFFBQVEsU0FBUztBQUFBLE1BQzFDLEtBQUs7QUFBQSxRQUNKLFNBQVMsT0FBTyxNQUFNLE9BQU8sVUFBVSxRQUFRO0FBQUEsUUFDL0MsV0FBVyxDQUFDLE9BQU8sTUFBTSxPQUFPLFVBQVUsUUFBUSxTQUFTO0FBQUEsTUFDNUQ7QUFBQSxNQUNBLE1BQU0sZUFBZSxJQUFJLG9CQUFvQixPQUFPLG9CQUFvQixtQkFBbUI7QUFBQTtBQUFBLE1BRTNGLFFBQVEsaUJBQWlCLG1CQUFtQjtBQUFBLElBQzdDO0FBQUEsSUFDQSxjQUFjLGlCQUFpQjtBQUFBLElBQy9CLEtBQUssT0FBTyxNQUFNO0FBQ2pCLFFBQUUsYUFBYSxhQUFhLGNBQWM7QUFDMUMsWUFBTSxFQUFFLGFBQWEsVUFBVSxJQUFJO0FBQUEsSUFDcEM7QUFBQSxFQUNELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSw0Q0FBNEMsc0JBQXNCO0FBQUEsSUFDbkYsWUFBWTtBQUFBLE1BQ1gsT0FBTyxFQUFFLFNBQVMsT0FBTyxVQUFVLE9BQU8sUUFBUSxRQUFRLFVBQVU7QUFBQSxNQUNwRSxLQUFLLEVBQUUsU0FBUyxPQUFPLFVBQVUsT0FBTyxVQUFVLFFBQVEsVUFBVTtBQUFBLE1BQ3BFLE1BQU0sb0JBQW9CO0FBQUEsTUFDMUIsUUFBUSxpQkFBaUI7QUFBQSxJQUMxQjtBQUFBLElBQ0EsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLENBQUMsTUFBTSxFQUFFLGFBQWEsYUFBYSxXQUFXLFVBQVUsSUFBSTtBQUFBLEVBQ2xFLENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSw2Q0FBNkMsdUJBQXVCO0FBQUEsSUFDckYsWUFBWTtBQUFBLE1BQ1gsT0FBTyxFQUFFLFNBQVMsT0FBTyxVQUFVLE9BQU8sUUFBUSxRQUFRLFdBQVc7QUFBQSxNQUNyRSxLQUFLLEVBQUUsU0FBUyxPQUFPLFVBQVUsT0FBTyxVQUFVLFFBQVEsV0FBVztBQUFBLE1BQ3JFLE1BQU0sb0JBQW9CO0FBQUEsTUFDMUIsUUFBUSxpQkFBaUI7QUFBQSxJQUMxQjtBQUFBLElBQ0EsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLENBQUMsTUFBTSxFQUFFLGFBQWEsYUFBYSxXQUFXLFVBQVUsS0FBSztBQUFBLEVBQ25FLENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSwwQ0FBMEMsb0JBQW9CO0FBQUEsSUFDL0UsWUFBWTtBQUFBLE1BQ1gsS0FBSyxFQUFFLFNBQVMsT0FBTyxVQUFVLE9BQU8sVUFBVSxRQUFRLFFBQVE7QUFBQSxNQUNsRSxNQUFNLG9CQUFvQjtBQUFBLE1BQzFCLFFBQVEsaUJBQWlCO0FBQUEsSUFDMUI7QUFBQSxJQUNBLGNBQWMsaUJBQWlCO0FBQUEsSUFDL0IsS0FBSyxDQUFDLE1BQU0sRUFBRSxhQUFhLGFBQWEsV0FBVyxVQUFVLEVBQUU7QUFBQSxFQUNoRSxDQUFDO0FBRUQseUJBQXVCO0FBQUEsSUFDdEIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLFVBQVUsNENBQTRDLHNCQUFzQjtBQUFBLElBQ25GLFlBQVk7QUFBQSxNQUNYLEtBQUssRUFBRSxTQUFTLE9BQU8sVUFBVSxPQUFPLFVBQVUsUUFBUSxVQUFVO0FBQUEsTUFDcEUsTUFBTSxvQkFBb0I7QUFBQSxNQUMxQixRQUFRLGlCQUFpQjtBQUFBLElBQzFCO0FBQUEsSUFDQSxjQUFjLGlCQUFpQjtBQUFBLElBQy9CLEtBQUssQ0FBQyxNQUFNLEVBQUUsYUFBYSxhQUFhLFdBQVcsVUFBVSxJQUFJO0FBQUEsRUFDbEUsQ0FBQztBQUVELHlCQUF1QjtBQUFBLElBQ3RCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxnQkFBZ0I7QUFBQSxJQUN2QixZQUFZO0FBQUEsTUFDWCxNQUFNLGVBQWUsSUFBSSxvQ0FBb0MsMEJBQTBCLGdDQUFnQyxVQUFVLHlCQUF5QixRQUFRLENBQUM7QUFBQSxNQUNuSyxTQUFTLE9BQU8sVUFBVSxRQUFRO0FBQUEsTUFDbEMsUUFBUSxpQkFBaUI7QUFBQSxJQUMxQjtBQUFBLElBQ0EsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLE9BQU8sTUFBTTtBQUNqQixZQUFNLFdBQVcsRUFBRSxRQUFRLGtCQUFrQixNQUFNLEVBQUUsUUFBUSxlQUFlLEVBQUUsVUFBVSxpQkFBaUIsTUFBTSxDQUFDO0FBQ2hILFVBQUksQ0FBQyxVQUFVO0FBQ2Q7QUFBQSxNQUNEO0FBQ0EsUUFBRSxRQUFRLGtCQUFrQixRQUFRO0FBQ3BDLFlBQU0sb0JBQW9CLFVBQVUsQ0FBQztBQUFBLElBQ3RDO0FBQUEsRUFDRCxDQUFDO0FBRUQseUJBQXVCO0FBQUEsSUFDdEIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLFVBQVUsNENBQTRDLDBCQUEwQjtBQUFBLElBQ3ZGLFlBQVk7QUFBQSxNQUNYLFNBQVMsT0FBTyxVQUFVLE9BQU8sUUFBUSxRQUFRO0FBQUEsTUFDakQsUUFBUSxpQkFBaUI7QUFBQSxNQUN6QixNQUFNLGVBQWUsR0FBRyxvQkFBb0IsV0FBVyxvQkFBb0IsS0FBSztBQUFBLElBQ2pGO0FBQUEsSUFDQSxjQUFjLGlCQUFpQjtBQUFBLElBQy9CLEtBQUssQ0FBQyxNQUFNLEVBQUUsYUFBYSxVQUFVO0FBQUEsRUFDdEMsQ0FBQztBQUVELHlCQUF1QjtBQUFBLElBQ3RCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxVQUFVLHVDQUF1QywyQkFBMkI7QUFBQSxJQUNuRixjQUFjLGlCQUFpQjtBQUFBLElBQy9CLFlBQVk7QUFBQSxNQUNYLFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxNQUNsQyxLQUFLO0FBQUEsUUFDSixTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUTtBQUFBLE1BQ2xEO0FBQUEsTUFDQSxNQUFNLGVBQWUsSUFBSSxvQkFBb0IsT0FBTyxvQkFBb0IsWUFBWSxPQUFPLENBQUM7QUFBQSxNQUM1RixRQUFRLGlCQUFpQjtBQUFBLElBQzFCO0FBQUEsSUFDQSxLQUFLLE9BQU8sTUFBTTtBQUNqQixRQUFFLGFBQWEscUJBQXFCO0FBQ3BDLFlBQU0sRUFBRSxhQUFhLFVBQVUsSUFBSTtBQUFBLElBQ3BDO0FBQUEsRUFDRCxDQUFDO0FBRUQseUJBQXVCO0FBQUEsSUFDdEIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLFVBQVUsMkNBQTJDLCtCQUErQjtBQUFBLElBQzNGLGNBQWMsaUJBQWlCO0FBQUEsSUFDL0IsWUFBWTtBQUFBLE1BQ1gsU0FBUyxPQUFPLFVBQVUsUUFBUTtBQUFBLE1BQ2xDLEtBQUs7QUFBQSxRQUNKLFNBQVMsT0FBTyxVQUFVLE9BQU8sUUFBUSxRQUFRO0FBQUEsTUFDbEQ7QUFBQSxNQUNBLE1BQU0sZUFBZSxJQUFJLG9CQUFvQixPQUFPLG9CQUFvQixZQUFZLE9BQU8sQ0FBQztBQUFBLE1BQzVGLFFBQVEsaUJBQWlCO0FBQUEsSUFDMUI7QUFBQSxJQUNBLEtBQUssT0FBTyxNQUFNO0FBQ2pCLFFBQUUsYUFBYSx5QkFBeUI7QUFDeEMsWUFBTSxFQUFFLGFBQWEsVUFBVSxJQUFJO0FBQUEsSUFDcEM7QUFBQSxFQUNELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSw2Q0FBNkMsc0NBQXNDO0FBQUEsSUFDcEcsS0FBSyxPQUFPLEdBQUcsYUFBYTtBQUMzQixZQUFNLG9CQUFvQixTQUFTLElBQUksa0JBQWtCO0FBQ3pELFlBQU0sU0FBUyxrQkFBa0Isb0JBQW9CO0FBQ3JELFVBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxTQUFTLEdBQUc7QUFDbEM7QUFBQSxNQUNEO0FBQ0EsWUFBTSxXQUFXLE1BQU0sRUFBRSxRQUFRLDBCQUEwQixFQUFFLGNBQWMsS0FBSyxDQUFDO0FBQ2pGLFlBQU0sWUFBWSxPQUFPLGFBQWE7QUFDdEMsVUFBSTtBQUNKLFVBQUksVUFBVSxRQUFRLEdBQUc7QUFDeEIsZUFBTyxPQUFPLFNBQVMsRUFBRSxlQUFlLFVBQVUsd0JBQXdCLEVBQUUsS0FBSztBQUFBLE1BQ2xGLE9BQU87QUFDTixjQUFNLHNCQUFzQixZQUFZLG9CQUFvQixLQUFLLG9CQUFvQjtBQUNyRixlQUFPLE9BQU8sU0FBUyxFQUFFLGdCQUFnQixXQUFXLG1CQUFtQjtBQUFBLE1BQ3hFO0FBQ0EsZUFBUyxTQUFTLE1BQU0sTUFBTSxJQUFJO0FBQ2xDLFlBQU0sRUFBRSxRQUFRLHFCQUFxQixJQUFJO0FBQUEsSUFDMUM7QUFBQSxFQUNELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSwyQ0FBMkMsb0NBQW9DO0FBQUEsSUFDaEcsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLE9BQU8sR0FBRyxhQUFhO0FBQzNCLFlBQU0sb0JBQW9CLFNBQVMsSUFBSSxrQkFBa0I7QUFDekQsWUFBTSxzQkFBc0IsU0FBUyxJQUFJLG9CQUFvQjtBQUM3RCxZQUFNLDhCQUE4QixTQUFTLElBQUksNEJBQTRCO0FBRTdFLFlBQU0sU0FBUyxrQkFBa0Isb0JBQW9CO0FBQ3JELFVBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxTQUFTLEdBQUc7QUFDbEM7QUFBQSxNQUNEO0FBRUEsWUFBTSxXQUFXLE1BQU0sRUFBRSxRQUFRLDBCQUEwQixFQUFFLGNBQWMsS0FBSyxDQUFDO0FBQ2pGLFlBQU0sV0FBVyxXQUFXLFNBQVMscUJBQXNCLDRCQUE0QixrQkFBa0IsT0FBTztBQUNoSCxZQUFNLE1BQU0sT0FBTyxTQUFTLEVBQUU7QUFDOUIsVUFBSyxDQUFDLFlBQVksSUFBSSxXQUFXLFFBQVEsUUFBUSxJQUFJLFdBQVcsUUFBUSxrQkFBb0IsWUFBWSxJQUFJLFdBQVcsUUFBUSxjQUFlO0FBQzdJLDRCQUFvQixLQUFLLFNBQVMsa0RBQWtELCtDQUErQyxDQUFDO0FBQ3BJO0FBQUEsTUFDRDtBQUdBLFlBQU0sU0FBUyxTQUFTLEtBQUssSUFBSTtBQUNqQyxhQUFPLEVBQUUsYUFBYSxVQUFVO0FBQUEsSUFDakM7QUFBQSxFQUNELENBQUM7QUFFRCw0QkFBMEI7QUFBQSxJQUN6QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSx3Q0FBd0Msb0JBQW9CO0FBQUEsSUFDN0UsWUFBWTtBQUFBLE1BQ1gsU0FBUyxPQUFPLFVBQVUsT0FBTyxNQUFNLFFBQVE7QUFBQSxNQUMvQyxPQUFPLEVBQUUsU0FBUyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVEsVUFBVTtBQUFBLE1BQ3BFLE1BQU0saUJBQWlCO0FBQUEsTUFDdkIsUUFBUSxpQkFBaUI7QUFBQSxJQUMxQjtBQUFBLElBQ0EsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLENBQUMsVUFBVSxNQUFNLGVBQWU7QUFBQSxFQUN0QyxDQUFDO0FBRUQsNEJBQTBCO0FBQUEsSUFDekIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLFVBQVUsNENBQTRDLG9CQUFvQjtBQUFBLElBQ2pGLFlBQVk7QUFBQSxNQUNYLFNBQVMsT0FBTyxRQUFRLFFBQVE7QUFBQSxNQUNoQyxLQUFLLEVBQUUsU0FBUyxRQUFRLFNBQVM7QUFBQSxNQUNqQyxNQUFNLGlCQUFpQjtBQUFBLE1BQ3ZCLFFBQVEsaUJBQWlCO0FBQUEsSUFDMUI7QUFBQSxJQUNBLGNBQWMsaUJBQWlCO0FBQUEsSUFDL0IsS0FBSyxDQUFDLFVBQVUsTUFBTSxlQUFlO0FBQUEsRUFDdEMsQ0FBQztBQUVELDRCQUEwQjtBQUFBLElBQ3pCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxVQUFVLDRDQUE0QyxrQkFBa0I7QUFBQSxJQUMvRSxZQUFZO0FBQUEsTUFDWCxTQUFTLE9BQU8sVUFBVSxRQUFRO0FBQUEsTUFDbEMsT0FBTyxFQUFFLFNBQVMsT0FBTyxRQUFRLFFBQVEsSUFBSTtBQUFBLE1BQzdDLE1BQU0saUJBQWlCO0FBQUEsTUFDdkIsUUFBUSxpQkFBaUI7QUFBQSxJQUMxQjtBQUFBLElBQ0EsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLENBQUMsVUFBVSxNQUFNLGVBQWU7QUFBQSxFQUN0QyxDQUFDO0FBRUQsNEJBQTBCO0FBQUEsSUFDekIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLFVBQVUsc0NBQXNDLGtCQUFrQjtBQUFBLElBQ3pFLFlBQVk7QUFBQSxNQUNYLFNBQVMsT0FBTyxVQUFVLE9BQU8sTUFBTSxRQUFRO0FBQUEsTUFDL0MsT0FBTyxFQUFFLFNBQVMsT0FBTyxVQUFVLE9BQU8sUUFBUSxRQUFRLFFBQVE7QUFBQSxNQUNsRSxNQUFNLGlCQUFpQjtBQUFBLE1BQ3ZCLFFBQVEsaUJBQWlCO0FBQUEsSUFDMUI7QUFBQSxJQUNBLGNBQWMsaUJBQWlCO0FBQUEsSUFDL0IsS0FBSyxDQUFDLFVBQVUsTUFBTSxhQUFhO0FBQUEsRUFDcEMsQ0FBQztBQUVELDRCQUEwQjtBQUFBLElBQ3pCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxVQUFVLDBDQUEwQyxrQkFBa0I7QUFBQSxJQUM3RSxJQUFJO0FBQUEsSUFDSixZQUFZO0FBQUEsTUFDWCxTQUFTLE9BQU8sUUFBUSxRQUFRO0FBQUEsTUFDaEMsS0FBSyxFQUFFLFNBQVMsUUFBUSxPQUFPO0FBQUEsTUFDL0IsTUFBTSxpQkFBaUI7QUFBQSxNQUN2QixRQUFRLGlCQUFpQjtBQUFBLElBQzFCO0FBQUEsSUFDQSxjQUFjLGlCQUFpQjtBQUFBLElBQy9CLEtBQUssQ0FBQyxVQUFVLE1BQU0sYUFBYTtBQUFBLEVBQ3BDLENBQUM7QUFFRCw0QkFBMEI7QUFBQSxJQUN6QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSx5Q0FBeUMsZUFBZTtBQUFBLElBQ3pFLFlBQVk7QUFBQSxNQUNYLFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxNQUNsQyxPQUFPLEVBQUUsU0FBUyxPQUFPLFFBQVEsUUFBUSxLQUFLO0FBQUEsTUFDOUMsTUFBTSxpQkFBaUI7QUFBQSxNQUN2QixRQUFRLGlCQUFpQjtBQUFBLElBQzFCO0FBQUEsSUFDQSxjQUFjLGlCQUFpQjtBQUFBLElBQy9CLEtBQUssQ0FBQyxVQUFVLE1BQU0sWUFBWTtBQUFBLEVBQ25DLENBQUM7QUFFRCw0QkFBMEI7QUFBQSxJQUN6QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSw0Q0FBNEMsaUJBQWlCO0FBQUEsSUFDOUUsWUFBWTtBQUFBLE1BQ1gsU0FBUyxRQUFRO0FBQUEsTUFDakIsTUFBTSxlQUFlLElBQUksb0JBQW9CLFlBQVksb0JBQW9CLGNBQWMsb0JBQW9CLGNBQWM7QUFBQSxNQUM3SCxRQUFRLGlCQUFpQjtBQUFBLElBQzFCO0FBQUEsSUFDQSxjQUFjLGlCQUFpQjtBQUFBLElBQy9CLEtBQUssQ0FBQyxVQUFVO0FBQ2YsVUFBSSxNQUFNLGFBQWEsR0FBRztBQUN6QixjQUFNLGVBQWU7QUFBQSxNQUN0QjtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sZ0JBQWdCO0FBQUEsSUFDdkIsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLENBQUMsR0FBRyxHQUFHLFNBQWtCLDRCQUE0QixHQUFHLElBQUksR0FBRyxXQUFXO0FBQUEsRUFDaEYsQ0FBQztBQUVELHlCQUF1QjtBQUFBLElBQ3RCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxnQkFBZ0I7QUFBQSxJQUN2QixJQUFJO0FBQUEsSUFDSixjQUFjLGlCQUFpQjtBQUFBLElBQy9CLEtBQUssT0FBTyxHQUFHLFVBQVUsU0FBUztBQUNqQyxVQUFJO0FBQ0osVUFBSSxFQUFFLGFBQWEscUJBQXFCLGNBQWM7QUFDckQsb0NBQTRCLEdBQUcsSUFBSSxHQUFHLFdBQVc7QUFDakQ7QUFBQSxNQUNEO0FBQ0EsaUJBQVcsWUFBWSx5QkFBeUIsUUFBUSxLQUFLLENBQUMsR0FBRztBQUNoRSxlQUFPLE1BQU0sU0FBUyxXQUFXLElBQUk7QUFBQSxNQUN0QztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sZ0JBQWdCO0FBQUEsSUFDdkIsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLENBQUMsR0FBRyxHQUFHLFNBQVMsNEJBQTRCLEdBQUcsSUFBSSxHQUFHLFlBQVk7QUFBQSxFQUN4RSxDQUFDO0FBRUQseUJBQXVCO0FBQUEsSUFDdEIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLGdCQUFnQjtBQUFBLElBQ3ZCLElBQUk7QUFBQSxJQUNKLGNBQWMsaUJBQWlCO0FBQUEsSUFDL0IsS0FBSyxPQUFPLEdBQUcsVUFBVSxTQUFTO0FBQ2pDLFVBQUk7QUFDSixVQUFJLElBQUk7QUFDUixVQUFJLEVBQUUsYUFBYSxxQkFBcUIsY0FBYztBQUNyRCxvQ0FBNEIsR0FBRyxJQUFJLEdBQUcsWUFBWTtBQUNsRDtBQUFBLE1BQ0Q7QUFDQSxpQkFBVyxZQUFZLHlCQUF5QixRQUFRLEtBQUssQ0FBQyxHQUFHO0FBQ2hFLGNBQU0sZ0JBQWdCLE1BQU07QUFFNUIsZ0JBQVEsTUFBTSxTQUFTLFlBQVksT0FBTyxhQUFhO0FBQ3ZEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sZ0JBQWdCO0FBQUEsSUFDdkIsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLENBQUMsR0FBRyxVQUFVLFNBQVMsb0JBQW9CLEdBQUcsVUFBVSxJQUFJO0FBQUEsRUFDbEUsQ0FBQztBQUVELHlCQUF1QjtBQUFBLElBQ3RCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxnQkFBZ0I7QUFBQSxJQUN2QixJQUFJO0FBQUEsSUFDSixZQUFZO0FBQUEsTUFDWCxTQUFTLFFBQVE7QUFBQSxNQUNqQixLQUFLO0FBQUEsUUFDSixTQUFTLFFBQVE7QUFBQSxNQUNsQjtBQUFBLE1BQ0EsTUFBTSxlQUFlLElBQUksb0JBQW9CLFNBQVM7QUFBQSxNQUN0RCxRQUFRLGlCQUFpQjtBQUFBLElBQzFCO0FBQUEsSUFDQSxjQUFjLGlCQUFpQjtBQUFBLElBQy9CLEtBQUssT0FBTyxHQUFHLGFBQWE7QUFDM0IsWUFBTSx1QkFBdUIsU0FBUyxJQUFJLHFCQUFxQjtBQUMvRCxZQUFNLHNCQUFzQixTQUFTLElBQUksb0JBQW9CO0FBQzdELFlBQU0sWUFBWSx5QkFBeUIsUUFBUTtBQUNuRCxZQUFNLGdCQUFnQixZQUFZLENBQUM7QUFDbkMsVUFBSSxDQUFDLGVBQWU7QUFDbkI7QUFBQSxNQUNEO0FBRUEsVUFBSSxxQkFBcUIscUJBQXFCLGNBQWM7QUFDM0QsZUFBTyxvQkFBb0IsR0FBRyxVQUFVLGFBQWE7QUFBQSxNQUN0RDtBQUVBLFFBQUUsZUFBZSxtQkFBbUIsYUFBYTtBQUNqRCxRQUFFLGVBQWUsWUFBWSxlQUFlO0FBQUEsUUFDM0MsbUJBQW1CLFdBQVMscUJBQXFCLEtBQUs7QUFBQSxRQUN0RCxVQUFVLE9BQU8sT0FBTyxZQUFZO0FBRW5DLFlBQUUsZUFBZSxZQUFZLGVBQWUsSUFBSTtBQUNoRCxZQUFFLGVBQWUsbUJBQW1CLE1BQVM7QUFDN0MsY0FBSSxTQUFTO0FBQ1osa0JBQU0sV0FBNEIsQ0FBQztBQUNuQyx1QkFBVyxZQUFZLFdBQVc7QUFDakMsdUJBQVMsTUFBTSxZQUFZO0FBQzFCLHNCQUFNLFNBQVMsT0FBTyxLQUFLO0FBQUEsY0FDNUIsR0FBRyxDQUFDO0FBQUEsWUFDTDtBQUNBLGdCQUFJO0FBQ0gsb0JBQU0sUUFBUSxJQUFJLFFBQVE7QUFBQSxZQUMzQixTQUFTLEdBQUc7QUFDWCxrQ0FBb0IsTUFBTSxDQUFDO0FBQUEsWUFDNUI7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCwrQkFBNkI7QUFBQSxJQUM1QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSwyQ0FBMkMsZ0JBQWdCO0FBQUEsSUFDNUUsS0FBSyxDQUFDLG1CQUFtQixlQUFlLHdCQUF3QixtQkFBbUIsSUFBSTtBQUFBLEVBQ3hGLENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSw2Q0FBNkMsbUJBQW1CO0FBQUEsSUFDakYsS0FBSyxPQUFPLEdBQUcsYUFBYTtBQUMzQixZQUFNLG9CQUFvQixTQUFTLElBQUksa0JBQWtCO0FBQ3pELFlBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUMvQyxZQUFNLHFCQUFxQixTQUFTLElBQUksbUJBQW1CO0FBQzNELFlBQU0sc0JBQXNCLFNBQVMsSUFBSSxvQkFBb0I7QUFFN0QsWUFBTSxrQkFBa0IsbUJBQW1CLGNBQWMsR0FBRyxtQkFBbUI7QUFDL0UsWUFBTSxVQUFVLE1BQU0sU0FBUyxJQUFJLHdCQUF3QixFQUFFLFdBQVcsZUFBZTtBQUV2RixVQUFJLENBQUMsU0FBUztBQUNiLGNBQU0sSUFBSSxNQUFNLCtDQUErQyxlQUFlLEdBQUc7QUFBQSxNQUNsRjtBQUVBLFlBQU0sUUFBUSxNQUFNLFFBQVEsY0FBYztBQUUxQyxjQUFRLDBCQUEwQjtBQUVsQyxZQUFNLGtCQUFrQixNQUFNLE9BQU8sVUFBUSxDQUFDLEVBQUUsUUFBUSxxQkFBcUIsSUFBSSxDQUFDO0FBQ2xGLFlBQU0sUUFBUSxnQkFBZ0IsSUFBSSxVQUFRO0FBQ3pDLGNBQU0sV0FBVyxhQUFhLFlBQVksSUFBSSxLQUFLLEtBQUssR0FBRyxDQUFDO0FBQzVELGVBQU87QUFBQSxVQUNOLE9BQU8sS0FBSztBQUFBLFVBQ1osUUFBUSxLQUFLLGdCQUFnQixHQUFHLEtBQUssYUFBYSxXQUFXLFFBQVEsS0FBSztBQUFBLFVBQzFFLGFBQWEsS0FBSyxNQUFNLE9BQU8sS0FBSyxHQUFHLElBQUk7QUFBQSxVQUMzQztBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxVQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3ZCLDRCQUFvQixLQUFLLFNBQVMseUJBQXlCLGdEQUFnRCxDQUFDO0FBQzVHO0FBQUEsTUFDRDtBQUNBLFlBQU0sV0FBVyxNQUFNLGtCQUFrQixLQUEwQixPQUFPLEVBQUUsYUFBYSxNQUFNLENBQUM7QUFDaEcsVUFBSSxVQUFVO0FBQ2IsY0FBTSxXQUFXLE1BQU0sRUFBRSxRQUFRLGVBQWU7QUFBQSxVQUMvQyxRQUFRLEVBQUUseUJBQXlCLFNBQVMsS0FBSztBQUFBLFFBQ2xELENBQUM7QUFDRCxVQUFFLFFBQVEsa0JBQWtCLFFBQVE7QUFDcEMsY0FBTSxvQkFBb0IsVUFBVSxDQUFDO0FBQUEsTUFDdEM7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsK0JBQTZCO0FBQUEsSUFDNUIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLGdCQUFnQjtBQUFBLElBQ3ZCLFlBQVk7QUFBQSxNQUNYLFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxNQUNsQyxNQUFNLGVBQWUsSUFBSSxvQkFBb0IsT0FBTyxtQ0FBbUMsT0FBTyxDQUFDO0FBQUEsTUFDL0YsUUFBUSxpQkFBaUI7QUFBQSxJQUMxQjtBQUFBLElBQ0EsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixNQUFNLFFBQVE7QUFBQSxJQUNkLE1BQU07QUFBQSxNQUNMO0FBQUEsUUFDQyxJQUFJLE9BQU87QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLE1BQU0sZUFBZSxPQUFPLFFBQVEsZ0JBQWdCO0FBQUEsUUFDcEQsbUJBQW1CO0FBQUEsTUFDcEI7QUFBQSxNQUNBLEdBQUcsQ0FBQyxPQUFPLGFBQWEsT0FBTyx3QkFBd0IsRUFBRSxJQUFJLFNBQU87QUFBQSxRQUNuRTtBQUFBLFFBQ0EsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxtQkFBbUIsT0FBTyxVQUFVLFFBQVEsY0FBYztBQUFBLFFBQ2hFLG1CQUFtQjtBQUFBLE1BQ3BCLEVBQUU7QUFBQSxJQUNIO0FBQUEsSUFDQSxLQUFLLENBQUMsbUJBQW1CLGVBQWUsT0FBTyxZQUFZLHFCQUFxQixRQUFXLFFBQVcsZUFBZSxhQUFhLElBQUksbUJBQW1CLGdCQUFnQixDQUFDO0FBQUEsRUFDM0ssQ0FBQztBQUVELCtCQUE2QjtBQUFBLElBQzVCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxnQkFBZ0I7QUFBQSxJQUN2QixZQUFZO0FBQUEsTUFDWCxTQUFTLE9BQU8sVUFBVSxRQUFRO0FBQUEsTUFDbEMsTUFBTSxlQUFlLElBQUksb0JBQW9CLE9BQU8sbUNBQW1DLE9BQU8sQ0FBQztBQUFBLE1BQy9GLFFBQVEsaUJBQWlCO0FBQUEsSUFDMUI7QUFBQSxJQUNBLGNBQWMsaUJBQWlCO0FBQUEsSUFDL0IsTUFBTSxRQUFRO0FBQUEsSUFDZCxNQUFNO0FBQUEsTUFDTDtBQUFBLFFBQ0MsSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLGVBQWUsT0FBTyxRQUFRLGdCQUFnQjtBQUFBLFFBQ3BELG1CQUFtQjtBQUFBLE1BQ3BCO0FBQUEsTUFDQSxHQUFHLENBQUMsT0FBTyxhQUFhLE9BQU8sd0JBQXdCLEVBQUUsSUFBSSxTQUFPO0FBQUEsUUFDbkU7QUFBQSxRQUNBLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLE1BQU0sbUJBQW1CLE9BQU8sVUFBVSxRQUFRLGNBQWM7QUFBQSxRQUNoRSxtQkFBbUI7QUFBQSxNQUNwQixFQUFFO0FBQUEsSUFDSDtBQUFBLElBQ0EsS0FBSyxDQUFDLG1CQUFtQjtBQUN4QixxQkFBZSxPQUFPLFlBQVksaUJBQWlCO0FBQ25ELHFCQUFlLE1BQU07QUFBQSxJQUN0QjtBQUFBLEVBQ0QsQ0FBQztBQUVELCtCQUE2QjtBQUFBLElBQzVCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxVQUFVLHFEQUFxRCw0QkFBNEI7QUFBQSxJQUNsRyxZQUFZO0FBQUEsTUFDWCxTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUTtBQUFBLE1BQ2pELE1BQU0sb0JBQW9CO0FBQUEsTUFDMUIsUUFBUSxpQkFBaUI7QUFBQSxJQUMxQjtBQUFBLElBQ0EsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLENBQUMsbUJBQW1CO0FBQ3hCLHFCQUFlLE9BQU8sWUFBWSxxQkFBcUI7QUFDdkQscUJBQWUsTUFBTTtBQUFBLElBQ3RCO0FBQUEsRUFDRCxDQUFDO0FBRUQsK0JBQTZCO0FBQUEsSUFDNUIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLFVBQVUsaURBQWlELHdCQUF3QjtBQUFBLElBQzFGLFlBQVk7QUFBQSxNQUNYLFNBQVMsT0FBTyxVQUFVLE9BQU8sUUFBUSxRQUFRO0FBQUEsTUFDakQsTUFBTSxvQkFBb0I7QUFBQSxNQUMxQixRQUFRLGlCQUFpQjtBQUFBLElBQzFCO0FBQUEsSUFDQSxjQUFjLGlCQUFpQjtBQUFBLElBQy9CLEtBQUssQ0FBQyxtQkFBbUI7QUFDeEIscUJBQWUsT0FBTyxZQUFZLGlCQUFpQjtBQUNuRCxxQkFBZSxNQUFNO0FBQUEsSUFDdEI7QUFBQSxFQUNELENBQUM7QUFFRCw0QkFBMEI7QUFBQSxJQUN6QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSxrREFBa0QseUJBQXlCO0FBQUEsSUFDNUYsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLE9BQU8sT0FBTyxHQUFHLGFBQWE7QUFDbEMsWUFBTSxZQUFZLHFCQUFxQjtBQUV2QyxPQUFDLFlBQVksT0FBTyxNQUFNO0FBQUEsSUFDM0I7QUFBQSxFQUNELENBQUM7QUFFRCw0QkFBMEI7QUFBQSxJQUN6QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSw4Q0FBOEMscUJBQXFCO0FBQUEsSUFDcEYsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLE9BQU8sT0FBTyxHQUFHLGFBQWE7QUFDbEMsWUFBTSxZQUFZLGlCQUFpQjtBQUVuQyxPQUFDLFlBQVksT0FBTyxNQUFNO0FBQUEsSUFDM0I7QUFBQSxFQUNELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sZ0JBQWdCO0FBQUEsSUFDdkIsVUFBVTtBQUFBLE1BQ1QsYUFBYSxnQkFBZ0IsV0FBVztBQUFBLE1BQ3hDLE1BQU0sQ0FBQztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sUUFBUTtBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sVUFBVSxDQUFDLEtBQUs7QUFBQSxVQUNoQixZQUFZO0FBQUEsWUFDWCxLQUFLO0FBQUEsY0FDSixhQUFhLFNBQVMsNENBQTRDLHdDQUF3QztBQUFBLGNBQzFHLE1BQU07QUFBQSxZQUNQO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQUEsSUFDQSxLQUFLLE9BQU8sR0FBRyxHQUFHLFNBQVM7QUFDMUIsWUFBTSxNQUFNLE9BQU8saUJBQW9DLEtBQU0sR0FBRyxJQUFJO0FBQ3BFLFlBQU0sV0FBVyxNQUFNLEVBQUUsUUFBUSxlQUFlLEVBQUUsSUFBSSxDQUFDO0FBQ3ZELFVBQUksQ0FBQyxVQUFVO0FBQ2Q7QUFBQSxNQUNEO0FBQ0EsUUFBRSxRQUFRLGtCQUFrQixRQUFRO0FBQ3BDLFlBQU0sb0JBQW9CLFVBQVUsQ0FBQztBQUFBLElBQ3RDO0FBQUEsRUFDRCxDQUFDO0FBRUQsK0JBQTZCO0FBQUEsSUFDNUIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLGdCQUFnQjtBQUFBLElBQ3ZCLFVBQVU7QUFBQSxNQUNULGFBQWEsZ0JBQWdCLGVBQWU7QUFBQSxNQUM1QyxNQUFNLENBQUM7QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLFFBQVE7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLFVBQVUsQ0FBQyxNQUFNO0FBQUEsVUFDakIsWUFBWTtBQUFBLFlBQ1gsTUFBTTtBQUFBLGNBQ0wsYUFBYSxTQUFTLGdEQUFnRCwrQkFBK0I7QUFBQSxjQUNyRyxNQUFNO0FBQUEsY0FDTixXQUFXO0FBQUEsWUFDWjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLElBQ0EsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixJQUFJO0FBQUEsSUFDSixLQUFLLE9BQU8sZ0JBQWdCLEdBQUcsVUFBVSxTQUFTO0FBQ2pELFlBQU0sc0JBQXNCLFNBQVMsSUFBSSxvQkFBb0I7QUFDN0QsWUFBTSxPQUFPLE9BQU8saUJBQXFDLEtBQU0sSUFBSSxJQUFJO0FBQ3ZFLFVBQUksQ0FBQyxNQUFNO0FBQ1YsNEJBQW9CLEtBQUssU0FBUyxrREFBa0QsMkJBQTJCLENBQUM7QUFDaEg7QUFBQSxNQUNEO0FBQ0EscUJBQWUsT0FBTyxJQUFJO0FBQUEsSUFDM0I7QUFBQSxFQUNELENBQUM7QUFFRCwrQkFBNkI7QUFBQSxJQUM1QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSxzQ0FBc0MsMEJBQTBCO0FBQUEsSUFDakYsS0FBSyxDQUFDLG1CQUFtQixlQUFlLFNBQVM7QUFBQSxFQUNsRCxDQUFDO0FBRUQseUJBQXVCO0FBQUEsSUFDdEIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLGdCQUFnQjtBQUFBLElBQ3ZCLGNBQWMsZUFBZSxHQUFHLG9CQUFvQixrQkFBa0Isb0JBQW9CLDhCQUE4QjtBQUFBLElBQ3hILFlBQVk7QUFBQSxNQUNYLFNBQVMsT0FBTyxVQUFVLE9BQU8sUUFBUSxRQUFRO0FBQUEsTUFDakQsUUFBUSxpQkFBaUI7QUFBQSxNQUN6QixLQUFLO0FBQUEsUUFDSixTQUFTLE9BQU8sVUFBVSxRQUFRO0FBQUEsUUFDbEMsV0FBVyxDQUFDLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUSxNQUFNO0FBQUEsTUFDM0Q7QUFBQSxNQUNBLE1BQU0sb0JBQW9CO0FBQUEsSUFDM0I7QUFBQSxJQUNBLE1BQU0sUUFBUTtBQUFBLElBQ2QsS0FBSyxPQUFPLEdBQUcsVUFBVSxTQUFTO0FBQ2pDLFlBQU0sbUJBQW1CLFNBQVMsSUFBSSxJQUFJLE9BQW9EO0FBQzlGLFlBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBQ25ELFlBQU0sMEJBQTBCLFNBQVMsSUFBSSx3QkFBd0I7QUFDckUsWUFBTSxVQUFVLGlDQUFpQyxnQkFBZ0I7QUFDakUsWUFBTSxrQkFBa0IsTUFBTSxFQUFFLFFBQVEsZ0JBQWdCLFNBQVMsUUFBUSxHQUFHO0FBQzVFLFVBQUksQ0FBQyxnQkFBZ0I7QUFDcEI7QUFBQSxNQUNEO0FBQ0EsWUFBTSxNQUFNLE1BQU0sZUFBZSxnQkFBZ0Isd0JBQXdCLGFBQWEsRUFBRSxTQUFTLGdCQUFnQixFQUFFLGFBQWE7QUFDaEksVUFBSSxRQUFRLFFBQVc7QUFDdEI7QUFBQSxNQUNEO0FBQ0EsWUFBTSxXQUFXLE1BQU0sRUFBRSxRQUFRLGVBQWUsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLGVBQWUsR0FBRyxRQUFRLFNBQVMsUUFBUSxJQUFJLENBQUM7QUFDOUgsWUFBTSxvQkFBb0IsVUFBVSxDQUFDO0FBQUEsSUFDdEM7QUFBQSxFQUNELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sZ0JBQWdCO0FBQUEsSUFDdkIsSUFBSTtBQUFBLElBQ0osWUFBWTtBQUFBLE1BQ1gsU0FBUyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVE7QUFBQSxNQUNqRCxLQUFLO0FBQUEsUUFDSixTQUFTLE9BQU8sVUFBVSxRQUFRO0FBQUEsUUFDbEMsV0FBVyxDQUFDLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUSxNQUFNO0FBQUEsTUFDM0Q7QUFBQSxNQUNBLFFBQVEsaUJBQWlCO0FBQUEsTUFDekIsTUFBTSxvQkFBb0I7QUFBQSxJQUMzQjtBQUFBLElBQ0EsS0FBSyxPQUFPLEdBQUcsYUFBYTtBQUMzQixZQUFNLFlBQVkseUJBQXlCLFFBQVE7QUFDbkQsVUFBSSxXQUFXO0FBQ2QsY0FBTSxXQUE0QixDQUFDO0FBQ25DLG1CQUFXLEtBQUssV0FBVztBQUMxQixtQkFBUyxNQUFNLFlBQVk7QUFDMUIsa0JBQU0sRUFBRSxRQUFRLGVBQWUsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsRUFBRSxDQUFDO0FBQ2xFLGtCQUFNLEVBQUUsYUFBYSxVQUFVLElBQUk7QUFBQSxVQUNwQyxHQUFHLENBQUM7QUFBQSxRQUNMO0FBQ0EsY0FBTSxRQUFRLElBQUksUUFBUTtBQUFBLE1BQzNCO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELG1DQUFpQztBQUFBLElBQ2hDLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxnQkFBZ0I7QUFBQSxJQUN2QixjQUFjLGlCQUFpQjtBQUFBLElBQy9CLEtBQUssT0FBTyxVQUFVLE1BQU07QUFDM0IsWUFBTSxRQUFRLEVBQUUsYUFBYSxvQkFBb0IsUUFBUTtBQUN6RCxVQUFJLFNBQVMsT0FBTyxrQkFBa0IsU0FBUyxHQUFHO0FBQ2pELFVBQUUsYUFBYSxnQkFBZ0IsUUFBUTtBQUFBLE1BQ3hDO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELHlCQUF1QjtBQUFBLElBQ3RCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxVQUFVLDBDQUEwQyxnQkFBZ0I7QUFBQSxJQUMzRSxjQUFjLGVBQWUsSUFBSSxpQkFBaUIsbUJBQW1CLG9CQUFvQixzQkFBc0IsVUFBVSxDQUFDO0FBQUEsSUFDMUgsS0FBSyxPQUFPLEdBQUcsYUFBYTtBQUMzQixZQUFNLFlBQVkseUJBQXlCLFFBQVE7QUFDbkQsVUFBSSxhQUFhLFVBQVUsU0FBUyxHQUFHO0FBQ3RDLFVBQUUsYUFBYSxjQUFjLFNBQVM7QUFBQSxNQUN2QztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSxrQ0FBa0MsbUJBQW1CO0FBQUEsSUFDdEUsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLE9BQU8sR0FBRyxhQUFhO0FBQzNCLFlBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUMvQyxZQUFNLHNCQUFzQixTQUFTLElBQUksb0JBQW9CO0FBQzdELFlBQU0sb0JBQW9CLFNBQVMsSUFBSSxrQkFBa0I7QUFFekQsWUFBTSxRQUFrQyxDQUFDO0FBQ3pDLFVBQUksRUFBRSxhQUFhLFVBQVUsVUFBVSxHQUFHO0FBQ3pDLDRCQUFvQixLQUFLLFNBQVMsd0RBQXdELDRDQUE0QyxDQUFDO0FBQ3ZJO0FBQUEsTUFDRDtBQUNBLFlBQU0saUJBQWlCLEVBQUUsYUFBYSxVQUFVLE9BQU8sT0FBSyxFQUFFLGVBQWUsRUFBRSxhQUFhLGdCQUFnQixVQUFVO0FBQ3RILGlCQUFXLFlBQVksZ0JBQWdCO0FBQ3RDLGNBQU0sUUFBUSxFQUFFLGFBQWEsb0JBQW9CLFFBQVE7QUFDekQsWUFBSSxPQUFPLGtCQUFrQixXQUFXLEdBQUc7QUFDMUMsZ0JBQU0sU0FBUyxVQUFVLFVBQVUsUUFBUTtBQUMzQyxnQkFBTSxRQUFRLEtBQUssTUFBTSxNQUFNLFNBQVMsS0FBSztBQUM3QyxnQkFBTSxjQUF3QixDQUFDO0FBQy9CLGdCQUFNLGFBQWEsY0FBYyxRQUFRO0FBQ3pDLGNBQUksWUFBWTtBQUNmLHdCQUFZLEtBQUssVUFBVTtBQUFBLFVBQzVCO0FBQ0EsZ0JBQU0sYUFBYSxjQUFjLFVBQVUsYUFBYSxjQUFjLEVBQUUsSUFBSTtBQUM1RSxjQUFJLFlBQVk7QUFDZix3QkFBWSxLQUFLLEdBQUcsVUFBVTtBQUFBLFVBQy9CO0FBQ0EsZ0JBQU0sS0FBSztBQUFBLFlBQ1Y7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBQ0EsVUFBSSxNQUFNLFdBQVcsR0FBRztBQUN2Qiw0QkFBb0IsS0FBSyxTQUFTLDZDQUE2QyxrQ0FBa0MsQ0FBQztBQUNsSDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFNBQVMsTUFBTSxrQkFBa0IsS0FBSyxPQUFPLENBQUMsQ0FBQztBQUNyRCxVQUFJLFFBQVE7QUFDWCxVQUFFLGFBQWEsY0FBYyxDQUFDLE9BQU8sVUFBVSxFQUFFLGFBQWEsY0FBZSxDQUFDO0FBQUEsTUFDL0U7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsK0JBQTZCO0FBQUEsSUFDNUIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLFVBQVUsb0RBQW9ELHNDQUFzQztBQUFBLElBQzNHLEtBQUssT0FBTyxVQUFVLE1BQU07QUFDM0IsWUFBTSxjQUFjLE1BQU0sRUFBRSxRQUFRLGVBQWUsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLFNBQVMsRUFBRSxDQUFDO0FBQzdGLFVBQUksYUFBYSxXQUFXLGlCQUFpQixRQUFRO0FBQ3BELGNBQU0sRUFBRSxhQUFhLFVBQVUsSUFBSTtBQUFBLE1BQ3BDO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELDRCQUEwQjtBQUFBLElBQ3pCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxVQUFVLHVDQUF1QyxZQUFZO0FBQUEsSUFDcEUsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixZQUFZLENBQUM7QUFBQTtBQUFBO0FBQUEsTUFHWixTQUFTO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFJVCxLQUFLLEVBQUUsU0FBUyxPQUFPLFVBQVUsUUFBUSxLQUFLO0FBQUEsTUFDOUMsUUFBUSxpQkFBaUI7QUFBQSxNQUN6QixNQUFNLG9CQUFvQjtBQUFBLElBQzNCLENBQUM7QUFBQSxJQUNELEtBQUssQ0FBQyxVQUFVLE1BQU0sVUFBVTtBQUFBLEVBQ2pDLENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSxpQ0FBaUMscUJBQXFCO0FBQUEsSUFDdkUsY0FBYyxlQUFlLEdBQUcsb0JBQW9CLGtCQUFrQixvQkFBb0IsOEJBQThCO0FBQUEsSUFDeEgsTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLE1BQ1gsU0FBUyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVE7QUFBQSxNQUNqRCxLQUFLLEVBQUUsU0FBUyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVEsVUFBVTtBQUFBLE1BQ2xFLFFBQVEsaUJBQWlCO0FBQUEsSUFDMUI7QUFBQSxJQUNBLEtBQUssT0FBTyxHQUFHLFVBQVUsU0FBUztBQUNqQyxVQUFJLGlCQUFpQixTQUFTLElBQUksSUFBSSxPQUE4QztBQUNwRixZQUFNLDBCQUEwQixTQUFTLElBQUksd0JBQXdCO0FBQ3JFLFlBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBQ25ELFlBQU0sc0JBQXNCLFNBQVMsSUFBSSxvQkFBb0I7QUFDN0QsWUFBTSxVQUFVLHdCQUF3QixhQUFhLEVBQUU7QUFDdkQsVUFBSSxrQkFBa0IsYUFBYSxjQUFjLE1BQU0sZUFBZSxVQUFVLGVBQWUsVUFBVTtBQUN4RyxjQUFNLEVBQUUsUUFBUSxlQUFlLEVBQUUsVUFBVSxFQUFFLHFCQUFxQixLQUFLLEVBQUUsQ0FBQztBQUMxRTtBQUFBLE1BQ0Q7QUFFQSxVQUFJLEVBQUUsUUFBUSw0QkFBNEI7QUFDekMseUJBQWlCLENBQUMsa0JBQWtCLGFBQWEsY0FBYyxJQUFJLENBQUMsSUFBSTtBQUV4RSxZQUFJLGtCQUFrQixnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsZUFBZSxVQUFVO0FBQ3JFLHlCQUFlLFdBQVcsRUFBRSxZQUFZLG9CQUFvQixxQkFBcUIsb0JBQW9CLFdBQVcsRUFBRTtBQUFBLFFBQ25IO0FBRUEsWUFBSTtBQUNKLFlBQUksUUFBUSxVQUFVLEdBQUc7QUFHeEIscUJBQVcsTUFBTSxFQUFFLFFBQVEsZUFBZSxjQUFjO0FBQUEsUUFDekQsT0FBTztBQUNOLGdCQUFNLE9BQU8sTUFBTSxnQkFBZ0IsUUFBUSxJQUFJO0FBQy9DLGNBQUksQ0FBQyxLQUFLO0FBRVQ7QUFBQSxVQUNEO0FBQ0EseUJBQWUsTUFBTTtBQUNyQixxQkFBVyxNQUFNLEVBQUUsUUFBUSxlQUFlLGNBQWM7QUFBQSxRQUN6RDtBQUNBLFVBQUUsUUFBUSxrQkFBa0IsUUFBUTtBQUNwQyxjQUFNLG9CQUFvQixVQUFVLENBQUM7QUFBQSxNQUN0QyxPQUFPO0FBQ04sWUFBSSxFQUFFLGVBQWUsb0JBQW9CLFNBQVMsR0FBRztBQUNwRCx5QkFBZSxlQUFlLGtCQUFrQixjQUFjO0FBQUEsUUFDL0QsT0FBTztBQUNOLHlCQUFlLGVBQWUsa0JBQWtCLE1BQU07QUFBQSxRQUN2RDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsaUJBQWUsYUFBYSxHQUFnQyxVQUF3RDtBQUNuSCxRQUFJLENBQUMsVUFBVTtBQUNkO0FBQUEsSUFDRDtBQUNBLFVBQU0sRUFBRSxRQUFRLG9CQUFvQixRQUFRO0FBQzVDLFFBQUksRUFBRSxhQUFhLFVBQVUsU0FBUyxHQUFHO0FBQ3hDLFlBQU0sRUFBRSxhQUFhLFVBQVUsSUFBSTtBQUFBLElBQ3BDO0FBQUEsRUFDRDtBQUNBLHlCQUF1QjtBQUFBLElBQ3RCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxVQUFVLGtDQUFrQyxtQ0FBbUM7QUFBQSxJQUN0RixjQUFjLGVBQWUsR0FBRyxpQkFBaUIsbUJBQW1CLG9CQUFvQixNQUFNO0FBQUEsSUFDOUYsTUFBTTtBQUFBLElBQ04sS0FBSyxPQUFPLE1BQU0sYUFBYSxHQUFHLEVBQUUsYUFBYSxjQUFjO0FBQUEsRUFDaEUsQ0FBQztBQUNELHlCQUF1QjtBQUFBLElBQ3RCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxnQkFBZ0I7QUFBQSxJQUN2QixJQUFJO0FBQUE7QUFBQSxJQUNKLGNBQWMsZUFBZSxHQUFHLGlCQUFpQixtQkFBbUIsb0JBQW9CLE1BQU07QUFBQSxJQUM5RixLQUFLLE9BQU8sTUFBTSxhQUFhLEdBQUcsRUFBRSxRQUFRLGNBQWM7QUFBQSxFQUMzRCxDQUFDO0FBRUQseUJBQXVCO0FBQUEsSUFDdEIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLFVBQVUscUNBQXFDLG9CQUFvQjtBQUFBLElBQzFFLGNBQWMsZUFBZSxHQUFHLGlCQUFpQixtQkFBbUIsb0JBQW9CLE1BQU07QUFBQSxJQUM5RixNQUFNLFFBQVE7QUFBQSxJQUNkLEtBQUssT0FBTyxNQUFNO0FBQ2pCLFlBQU0sa0JBQW1DLENBQUM7QUFDMUMsaUJBQVcsWUFBWSxFQUFFLFFBQVEsV0FBVztBQUMzQyx3QkFBZ0IsS0FBSyxFQUFFLFFBQVEsb0JBQW9CLFFBQVEsQ0FBQztBQUFBLE1BQzdEO0FBQ0EsWUFBTSxRQUFRLElBQUksZUFBZTtBQUFBLElBQ2xDO0FBQUEsRUFDRCxDQUFDO0FBRUQseUJBQXVCO0FBQUEsSUFDdEIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLFVBQVUsd0NBQXdDLHlDQUF5QztBQUFBLElBQ2xHLGNBQWMsaUJBQWlCO0FBQUEsSUFDL0IsWUFBWTtBQUFBLE1BQ1gsU0FBUyxPQUFPLFVBQVUsUUFBUTtBQUFBLE1BQ2xDLEtBQUssRUFBRSxTQUFTLE9BQU8sVUFBVSxRQUFRLElBQUksV0FBVyxDQUFDLE9BQU8sVUFBVSxRQUFRLElBQUksRUFBRTtBQUFBLE1BQ3hGLFFBQVEsaUJBQWlCO0FBQUEsTUFDekIsTUFBTSxlQUFlLElBQUksb0JBQW9CLE9BQU8sb0JBQW9CLFdBQVc7QUFBQSxJQUNwRjtBQUFBLElBQ0EsS0FBSyxDQUFDLEdBQUcsYUFBYSxTQUFTLElBQUksZUFBZSxFQUFFLGVBQWUsdUJBQXVCO0FBQUEsRUFDM0YsQ0FBQztBQUVELHlCQUF1QjtBQUFBLElBQ3RCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxnQkFBZ0I7QUFBQSxJQUN2QixJQUFJO0FBQUEsSUFDSixjQUFjLGVBQWUsR0FBRyxpQkFBaUIsbUJBQW1CLG9CQUFvQixNQUFNO0FBQUEsSUFDOUYsWUFBWTtBQUFBLE1BQ1gsU0FBUyxRQUFRO0FBQUEsTUFDakIsS0FBSztBQUFBLFFBQ0osU0FBUyxPQUFPLFVBQVUsUUFBUTtBQUFBLFFBQ2xDLFdBQVcsQ0FBQyxRQUFRLE1BQU07QUFBQSxNQUMzQjtBQUFBLE1BQ0EsUUFBUSxpQkFBaUI7QUFBQSxNQUN6QixNQUFNLG9CQUFvQjtBQUFBLElBQzNCO0FBQUEsSUFDQSxLQUFLLE9BQU8sR0FBRyxhQUFhO0FBQzNCLFlBQU0sa0JBQW1DLENBQUM7QUFDMUMsaUJBQVcsWUFBWSx5QkFBeUIsVUFBVSxJQUFJLEtBQUssQ0FBQyxHQUFHO0FBQ3RFLHdCQUFnQixLQUFLLEVBQUUsUUFBUSxvQkFBb0IsUUFBUSxDQUFDO0FBQUEsTUFDN0Q7QUFDQSxZQUFNLFFBQVEsSUFBSSxlQUFlO0FBQ2pDLFFBQUUsYUFBYSxVQUFVO0FBQUEsSUFDMUI7QUFBQSxFQUNELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sZ0JBQWdCO0FBQUEsSUFDdkIsY0FBYyxlQUFlLEdBQUcsaUJBQWlCLG1CQUFtQixvQkFBb0IsTUFBTTtBQUFBLElBQzlGLFlBQVk7QUFBQSxNQUNYLFNBQVMsU0FBUyxPQUFPLFVBQVUsUUFBUSxNQUFNLE9BQU8sVUFBVSxRQUFRLElBQUk7QUFBQSxNQUM5RSxRQUFRLGlCQUFpQjtBQUFBLE1BQ3pCLE1BQU0sZUFBZSxHQUFHLG9CQUFvQixXQUFXLG9CQUFvQixLQUFLO0FBQUEsSUFDakY7QUFBQSxJQUNBLEtBQUssQ0FBQyxNQUFNLEVBQUUsYUFBYSxXQUFXO0FBQUEsRUFDdkMsQ0FBQztBQUVELCtCQUE2QjtBQUFBLElBQzVCLElBQUksa0JBQWtCO0FBQUEsSUFDdEIsT0FBTyxVQUFVLG1DQUFtQyxPQUFPO0FBQUEsSUFDM0QsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixZQUFZLENBQUM7QUFBQSxNQUNaLFNBQVM7QUFBQSxNQUNULEtBQUssRUFBRSxTQUFTLE9BQU8sVUFBVSxRQUFRLEtBQUs7QUFBQTtBQUFBO0FBQUEsTUFHOUMsUUFBUSxpQkFBaUIsbUJBQW1CO0FBQUE7QUFBQTtBQUFBLE1BRzVDLE1BQU0sZUFBZSxHQUFHLGVBQWUsSUFBSSxvQkFBb0IsT0FBTyxtQ0FBbUMsT0FBTyxDQUFDLEdBQUcsZUFBZSxJQUFJLG9DQUFvQyx1QkFBdUIsZ0NBQWdDLFVBQVUseUJBQXlCLFFBQVEsQ0FBQyxDQUFDO0FBQUEsSUFDaFIsQ0FBQztBQUFBLElBQ0QsS0FBSyxDQUFDLG1CQUFtQixlQUFlLFlBQVk7QUFBQSxFQUNyRCxDQUFDO0FBRUQseUJBQXVCO0FBQUEsSUFDdEIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLFVBQVUsZ0RBQWdELHdCQUF3QjtBQUFBLElBQ3pGLEtBQUssQ0FBQyxNQUFNLEVBQUUsUUFBUSxxQkFBcUIsWUFBWTtBQUFBLEVBQ3hELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSwwQ0FBMEMsNkJBQTZCO0FBQUEsSUFDeEYsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLENBQUMsR0FBRyxhQUFhLFNBQVMsSUFBSSxtQkFBbUIsRUFBRSxhQUFhLEVBQUUsWUFBWSxPQUFPLE9BQU8sb0JBQW9CLENBQUM7QUFBQSxFQUN2SCxDQUFDO0FBRUQsK0JBQTZCO0FBQUEsSUFDNUIsSUFBSSxrQkFBa0I7QUFBQSxJQUN0QixPQUFPLFVBQVUsZ0RBQWdELHNCQUFzQjtBQUFBLElBQ3ZGLGNBQWMsaUJBQWlCO0FBQUEsSUFDL0IsS0FBSyxDQUFDLG1CQUFtQixlQUFlLG1CQUFtQjtBQUFBLEVBQzVELENBQUM7QUFFRCxtQ0FBaUM7QUFBQSxJQUNoQyxJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sZ0JBQWdCO0FBQUEsSUFDdkIsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixZQUFZO0FBQUEsTUFDWCxTQUFTLE9BQU8sTUFBTSxRQUFRO0FBQUEsTUFDOUIsUUFBUSxpQkFBaUI7QUFBQSxNQUN6QixNQUFNLG9CQUFvQjtBQUFBLElBQzNCO0FBQUEsSUFDQSxLQUFLLENBQUMsYUFBYSxTQUFTLHlCQUF5QjtBQUFBLEVBQ3RELENBQUM7QUFFRCx5QkFBdUI7QUFBQSxJQUN0QixJQUFJLGtCQUFrQjtBQUFBLElBQ3RCLE9BQU8sVUFBVSw0Q0FBNEMsaUJBQWlCO0FBQUEsSUFDOUUsY0FBYyxpQkFBaUI7QUFBQSxJQUMvQixLQUFLLE9BQU8sR0FBRyxVQUFVLFNBQVM7QUFDakMsWUFBTSxPQUFPLGlCQUFpQixJQUFJO0FBQ2xDLFVBQUksQ0FBQyxNQUFNO0FBQ1Y7QUFBQSxNQUNEO0FBQ0EsVUFBSSxTQUFTLHNCQUFzQixNQUFNO0FBQ3hDLFVBQUUsUUFBUSxtQkFBbUI7QUFDN0I7QUFBQSxNQUNEO0FBQ0EsVUFBSSxTQUFTLDZCQUE2QjtBQUN6QyxpQkFBUyxJQUFJLHFCQUFxQixFQUFFLFlBQVksa0JBQWtCLGFBQWEsSUFBSTtBQUNuRjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLGtCQUFrQjtBQUN4QixZQUFNLGVBQWUsZ0JBQWdCLEtBQUssSUFBSTtBQUM5QyxVQUFJLGNBQWM7QUFDakIsVUFBRSxhQUFhLHNCQUFzQixPQUFPLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQztBQUNoRSxlQUFPLEVBQUUsYUFBYSxVQUFVLElBQUk7QUFBQSxNQUNyQztBQUVBLFlBQU0sc0JBQXNCLEVBQUUsZUFBZTtBQUc3QyxZQUFNLG1CQUFtQixLQUFLLFVBQVUsQ0FBQztBQUN6QyxVQUFJLHFCQUFxQjtBQUN4QixjQUFNLFVBQVUsb0JBQW9CLEtBQUssQ0FBQUEsYUFBV0EsU0FBUSxnQkFBZ0IsZ0JBQWdCO0FBQzVGLFlBQUksU0FBUztBQUNaLGdCQUFNLFdBQVcsTUFBTSxFQUFFLFFBQVEsZUFBZTtBQUFBLFlBQy9DLFFBQVE7QUFBQSxVQUNULENBQUM7QUFDRCxZQUFFLFFBQVEsa0JBQWtCLFFBQVE7QUFBQSxRQUNyQyxPQUFPO0FBQ04sa0JBQVEsS0FBSyx5QkFBeUIsZ0JBQWdCLEdBQUc7QUFBQSxRQUMxRDtBQUFBLE1BQ0QsT0FBTztBQUNOLGdCQUFRLEtBQUssNkJBQTZCLElBQUksR0FBRztBQUFBLE1BQ2xEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUNGO0FBTUEsU0FBUywwQkFBMEIsVUFBNEIsTUFBaUQ7QUFDL0csUUFBTSxrQkFBa0IsU0FBUyxJQUFJLGdCQUFnQjtBQUNyRCxRQUFNLFNBQThCLENBQUM7QUFDckMsUUFBTSxVQUFVLGdCQUFnQixJQUFJO0FBQ3BDLE1BQUksV0FBVyxRQUFRLFNBQVMsR0FBRztBQUNsQyxlQUFXLG1CQUFtQixTQUFTO0FBQ3RDLFlBQU0sV0FBVyxnQkFBZ0Isa0JBQWtCLGdCQUFnQixVQUFVO0FBQzdFLFVBQUksVUFBVTtBQUNiLGVBQU8sS0FBSyxRQUFRO0FBQUEsTUFDckI7QUFBQSxJQUNEO0FBQ0EsUUFBSSxPQUFPLFNBQVMsR0FBRztBQUN0QixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLHlCQUF5QixVQUE0QixNQUFnQixPQUFrRDtBQUMvSCxRQUFNLGNBQWMsU0FBUyxJQUFJLFlBQVk7QUFDN0MsUUFBTSx1QkFBdUIsU0FBUyxJQUFJLHFCQUFxQjtBQUMvRCxRQUFNLFNBQThCLENBQUM7QUFHckMsUUFBTSxPQUFPLFlBQVksMkJBQTJCLGtCQUFrQixZQUFZLGtCQUFrQjtBQUVwRyxRQUFNLGFBQWEsTUFBTSxhQUFhO0FBRXRDLE1BQUkscUJBQXFCLHFCQUFxQixnQkFBZ0IsQ0FBQyxZQUFZLFFBQVE7QUFDbEYsVUFBTSxXQUFXLHFCQUFxQjtBQUN0QyxXQUFPLFdBQVcsQ0FBQyxxQkFBcUIsY0FBYyxJQUFJO0FBQUEsRUFDM0Q7QUFFQSxNQUFJLENBQUMsUUFBUSxDQUFDLFlBQVk7QUFDekIsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLFVBQVUsS0FBSyxTQUFTO0FBRTlCLFFBQU0sZ0JBQWdCLHFCQUFxQjtBQUMzQyxNQUFJLFFBQVEsV0FBVyxLQUFLLENBQUMsV0FBVyxTQUFTLFFBQVEsQ0FBQyxDQUFDLEdBQUc7QUFHN0QsV0FBTyxLQUFLLGNBQWMsUUFBUSxDQUFDLENBQUMsQ0FBQztBQUNyQyxXQUFPO0FBQUEsRUFDUjtBQUdBLGFBQVcsYUFBYSxZQUFZO0FBQ25DLFdBQU8sS0FBSyxjQUFjLFNBQVMsQ0FBQztBQUFBLEVBQ3JDO0FBQ0EsU0FBTyxPQUFPLE9BQU8sT0FBSyxDQUFDLENBQUMsQ0FBQztBQUM5QjtBQUVPLFNBQVMscUJBQXFCLE1BQThEO0FBQ2xHLE1BQUksQ0FBQyxRQUFRLEtBQUssS0FBSyxFQUFFLFdBQVcsR0FBRztBQUN0QyxXQUFPO0FBQUEsTUFDTixTQUFTLFNBQVMseUJBQXlCLHNEQUFzRDtBQUFBLE1BQ2pHLFVBQVUsU0FBUztBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjtBQUVBLFNBQVMsa0JBQWtCLEtBQXVDO0FBQ2pFLFNBQU8sU0FBUyxHQUFHLEtBQUssaUJBQWlCO0FBQzFDO0FBRUEsU0FBUyxpQ0FBaUMsa0JBQWtHO0FBQzNJLE1BQUksa0JBQWtCLGdCQUFnQixHQUFHO0FBQ3hDLFdBQU8sRUFBRSxRQUFRLGtCQUFrQixVQUFXLGlCQUE0QyxTQUFTO0FBQUEsRUFDcEc7QUFDQSxTQUFPO0FBQ1I7QUFFQSxJQUFJO0FBRUcsU0FBUyx1QkFBdUIsa0JBQW1EO0FBQ3pGLFFBQU0sY0FBYyx5QkFBeUIsZ0JBQWdCO0FBQzdELHdCQUFzQixRQUFRO0FBRTlCLHlCQUF1QixnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsSUFDNUQsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUksa0JBQWtCO0FBQUEsUUFDdEIsT0FBTyxVQUFVLDRDQUE0QyxvQ0FBb0M7QUFBQSxRQUNqRyxJQUFJO0FBQUEsUUFDSixjQUFjLGVBQWUsR0FBRyxvQkFBb0Isa0JBQWtCLG9CQUFvQiw4QkFBOEI7QUFBQSxRQUN4SCxVQUFVO0FBQUEsVUFDVCxhQUFhLGtCQUFrQjtBQUFBLFVBQy9CLE1BQU0sQ0FBQztBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ04sUUFBUTtBQUFBLGNBQ1AsTUFBTTtBQUFBLGNBQ04sVUFBVSxDQUFDLGFBQWE7QUFBQSxjQUN4QixZQUFZO0FBQUEsZ0JBQ1gsYUFBYTtBQUFBLGtCQUNaLGFBQWEsU0FBUyx3REFBd0QsbUNBQW1DO0FBQUEsa0JBQ2pILE1BQU07QUFBQSxrQkFDTixNQUFNLFlBQVk7QUFBQSxrQkFDbEIsMEJBQTBCLFlBQVk7QUFBQSxnQkFDdkM7QUFBQSxnQkFDQSxVQUFVO0FBQUEsa0JBQ1QsYUFBYSxTQUFTLDJCQUEyQiw4QkFBOEI7QUFBQSxrQkFDL0UsTUFBTTtBQUFBLGtCQUNOLE1BQU0sQ0FBQyxRQUFRLFFBQVE7QUFBQSxrQkFDdkIsa0JBQWtCO0FBQUEsb0JBQ2pCLFNBQVMsZ0NBQWdDLDBDQUEwQztBQUFBLG9CQUNuRixTQUFTLGtDQUFrQyxtQ0FBbUM7QUFBQSxrQkFDL0U7QUFBQSxnQkFDRDtBQUFBLGNBQ0Q7QUFBQSxZQUNEO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUNBLE1BQU0sSUFDTCxVQUNBLHlCQUNBLFNBQ0M7QUFDRCxZQUFNLElBQUksb0JBQW9CLFFBQVE7QUFDdEMsWUFBTSwwQkFBMEIsU0FBUyxJQUFJLHdCQUF3QjtBQUNyRSxZQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUVuRCxVQUFJO0FBQ0osVUFBSTtBQUNKLFVBQUk7QUFDSixVQUFJO0FBRUosVUFBSSxTQUFTLHVCQUF1QixLQUFLLDJCQUEyQixPQUFPLHlCQUF5QixFQUFFLGFBQWEsS0FBSyxDQUFDLEdBQUc7QUFNM0gsWUFBU0MsZ0JBQVQsU0FBc0IsS0FBc0Y7QUFDM0csaUJBQU8sU0FBUyxHQUFHLEtBQUssY0FBYztBQUFBLFFBQ3ZDO0FBRlMsMkJBQUFBO0FBTFQsY0FBTSxTQUFTLEVBQUUsZUFBZSxrQkFBa0IsS0FBSyxDQUFBRCxhQUFXQSxTQUFRLGdCQUFnQix3QkFBd0IsV0FBVztBQUM3SCxZQUFJLENBQUMsUUFBUTtBQUNaLGdCQUFNLElBQUksTUFBTSxvQ0FBb0Msd0JBQXdCLFdBQVcsR0FBRztBQUFBLFFBQzNGO0FBQ0Esa0JBQVUsRUFBRSxPQUFPO0FBSW5CLFlBQUlDLGNBQWEsdUJBQXVCLEdBQUc7QUFDMUMsa0JBQVEsd0JBQXdCLFVBQVU7QUFBQSxZQUN6QyxLQUFLO0FBQVUsc0JBQVEsV0FBVyxpQkFBaUI7QUFBUTtBQUFBLFlBQzNELEtBQUs7QUFBUSxzQkFBUSxXQUFXLGlCQUFpQjtBQUFPO0FBQUEsVUFDekQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxXQUFXLGFBQWEsdUJBQXVCLEtBQUssZUFBZSx1QkFBdUIsS0FBSyxnQkFBZ0IsdUJBQXVCLEdBQUc7QUFDeEksZ0JBQVE7QUFDUixrQkFBVSxVQUFVLEVBQUUsUUFBUSxRQUFRLElBQUk7QUFBQSxNQUMzQyxPQUFPO0FBQ04sa0JBQVUsaUNBQWlDLHVCQUF1QjtBQUFBLE1BQ25FO0FBR0EsVUFBSSxVQUFVLE1BQU0sVUFBVSxNQUFNLFVBQVU7QUFDN0MsY0FBTSxpQkFBaUIsRUFBRSxRQUFRO0FBQ2pDLFlBQUksZ0JBQWdCO0FBQ25CLGdCQUFNLEVBQUUsUUFBUSxlQUFlLEVBQUUsVUFBVSxFQUFFLGVBQWUsR0FBRyxRQUFRLFNBQVMsT0FBTyxDQUFDO0FBQ3hGO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFVBQVUsd0JBQXdCLGFBQWEsRUFBRTtBQUN2RCxVQUFJLFFBQVEsU0FBUyxHQUFHO0FBRXZCLGNBQU1DLFdBQXdDO0FBQUEsVUFDN0MsYUFBYSxTQUFTLHFEQUFxRCxtREFBbUQ7QUFBQSxRQUMvSDtBQUNBLGNBQU0sWUFBWSxNQUFNLGVBQWUsZUFBaUMsa0NBQWtDLENBQUNBLFFBQU8sQ0FBQztBQUNuSCxZQUFJLENBQUMsV0FBVztBQUVmO0FBQUEsUUFDRDtBQUNBLGNBQU0sVUFBVTtBQUFBLE1BQ2pCO0FBRUEsVUFBSSxTQUFTO0FBQ1osZ0JBQVEsTUFBTTtBQUNkLG1CQUFXLE1BQU0sRUFBRSxRQUFRLGVBQWUsT0FBTztBQUFBLE1BQ2xELE9BQU87QUFDTixtQkFBVyxNQUFNLEVBQUUsUUFBUSxxQkFBcUIsa0JBQWtCLEdBQUc7QUFBQSxNQUN0RTtBQUVBLFVBQUksVUFBVTtBQUNiLFVBQUUsUUFBUSxrQkFBa0IsUUFBUTtBQUNwQyxjQUFNLG9CQUFvQixVQUFVLENBQUM7QUFBQSxNQUN0QztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFDRCxTQUFPO0FBQ1I7QUFFQSxTQUFTLDRCQUE0QixHQUFnQyxVQUFrRDtBQUN0SCxTQUFPLEVBQUUsUUFBUSx3QkFBd0IsY0FBYyxRQUFRLENBQUMsS0FBSyxFQUFFLFFBQVE7QUFDaEY7QUFFQSxlQUFlLGdCQUFnQixVQUE0QixRQUF5RTtBQUNuSSxRQUFNLG9CQUFvQixTQUFTLElBQUksa0JBQWtCO0FBQ3pELFFBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUMvQyxRQUFNLGlCQUFpQixTQUFTLElBQUksd0JBQXdCO0FBQzVELFFBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUMvQyxRQUFNLGtCQUFrQixTQUFTLElBQUksZ0JBQWdCO0FBQ3JELFFBQU0sdUJBQXVCLFNBQVMsSUFBSSxxQkFBcUI7QUFDL0QsUUFBTSwrQkFBK0IsU0FBUyxJQUFJLDZCQUE2QjtBQUUvRSxRQUFNLFVBQVUsZUFBZSxhQUFhLEVBQUU7QUFDOUMsTUFBSSxDQUFDLFFBQVEsUUFBUTtBQUNwQjtBQUFBLEVBQ0Q7QUFFQSxRQUFNLGlCQUFpQixNQUFNLFFBQVEsSUFBSSxRQUFRLElBQUksT0FBSywwQkFBMEIsR0FBRyxzQkFBc0IsNEJBQTRCLENBQUMsQ0FBQztBQUMzSSxRQUFNLGdCQUFnQiw4QkFBOEIsY0FBYztBQUVsRSxNQUFJLGNBQWMsV0FBVyxHQUFHO0FBQy9CLFdBQU8sY0FBYyxDQUFDO0FBQUEsRUFDdkI7QUFHQSxRQUFNLGNBQXNCLGNBQWMsSUFBSSxVQUFRO0FBQ3JELFVBQU0sUUFBUSxLQUFLLE9BQU87QUFDMUIsVUFBTSxjQUFjLEtBQUssZUFDdEIsU0FBUyxzREFBc0Qsb0JBQW9CLGFBQWEsWUFBWSxLQUFLLEtBQUssRUFBRSxVQUFVLENBQUMsS0FBSyxXQUFXLENBQUMsQ0FBQyxJQUNySixhQUFhLFlBQVksUUFBUSxLQUFLLEdBQUcsR0FBRyxFQUFFLFVBQVUsS0FBSyxDQUFDO0FBRWpFLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQSxhQUFhLGdCQUFnQixRQUFRLGNBQWM7QUFBQSxNQUNuRDtBQUFBLE1BQ0EsYUFBYSxlQUFlLGNBQWMsaUJBQWlCLEtBQUssS0FBSyxTQUFTLFdBQVc7QUFBQSxJQUMxRjtBQUFBLEVBQ0QsQ0FBQztBQUNELFFBQU0sVUFBOEI7QUFBQSxJQUNuQyxhQUFhLFNBQVMscURBQXFELG1EQUFtRDtBQUFBLElBQzlILG9CQUFvQjtBQUFBLElBQ3BCLGFBQWE7QUFBQSxFQUNkO0FBRUEsUUFBTSxRQUEyQixVQUFVLGtCQUFrQjtBQUM3RCxRQUFNLE9BQU8sTUFBTSxrQkFBa0IsS0FBVyxhQUFhLFNBQVMsS0FBSztBQUMzRSxTQUFPLE1BQU07QUFDZDtBQUVBLGVBQWUsMEJBQTBCLFFBQTBCLHNCQUE2Qyw4QkFBOEY7QUFDN00sUUFBTSxZQUFZLHFCQUFxQixTQUFTLGtCQUFrQixLQUFLLEVBQUUsVUFBVSxPQUFPLElBQUksQ0FBQztBQUMvRixNQUFJLENBQUMsU0FBUyxTQUFTLEtBQUssVUFBVSxXQUFXLEdBQUc7QUFDbkQsV0FBTyxFQUFFLFFBQVEsS0FBSyxPQUFPLEtBQUssWUFBWSxPQUFPLGNBQWMsTUFBTTtBQUFBLEVBQzFFO0FBRUEsUUFBTSxvQkFBb0IsTUFBTSw2QkFBNkIsYUFBYSxRQUFRLFNBQVM7QUFDM0YsU0FBTyxXQUFXLGlCQUFpQixLQUFLLGtCQUFrQixXQUFXLGdDQUFnQyxZQUFZLElBQzlHLEVBQUUsUUFBUSxZQUFZLE1BQU0sY0FBYyxNQUFNLEtBQUssSUFBSSxLQUFLLEVBQUUsR0FBRyxPQUFPLEtBQUssTUFBTSxrQkFBa0IsQ0FBQyxFQUFFLElBQzFHLEVBQUUsUUFBUSxZQUFZLE9BQU8sY0FBYyxNQUFNLEtBQUssSUFBSSxTQUFTLE9BQU8sS0FBSyxpQkFBaUIsRUFBRTtBQUN0RztBQUtPLFNBQVMsOEJBQThCLE9BQTJEO0FBQ3hHLFFBQU0sTUFBTSxvQkFBSSxJQUFvQztBQUNwRCxhQUFXLFFBQVEsT0FBTztBQUN6QixVQUFNLE1BQU0sS0FBSyxJQUFJLFNBQVM7QUFDOUIsVUFBTSxRQUFRLElBQUksSUFBSSxHQUFHO0FBQ3pCLFFBQUksQ0FBQyxTQUFTLFFBQVEsS0FBSyxPQUFPLElBQUksU0FBUyxHQUFHO0FBQ2pELFVBQUksSUFBSSxLQUFLLElBQUk7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFDQSxRQUFNLGdCQUFnQixJQUFJLElBQUksSUFBSSxPQUFPLENBQUM7QUFDMUMsUUFBTSx1QkFBdUIsTUFBTSxPQUFPLE9BQUssY0FBYyxJQUFJLENBQUMsQ0FBQztBQUNuRSxTQUFPO0FBQ1I7QUFFQSxlQUFlLG9CQUFvQixVQUF5QyxHQUErQztBQUMxSCxRQUFNLFNBQVMsWUFDWCxFQUFFLFFBQVEsa0JBQ1YsRUFBRSxjQUFjLGtCQUNoQixFQUFFLGFBQWE7QUFDbkIsTUFBSSxDQUFDLFFBQVE7QUFDWixRQUFJLEVBQUUsYUFBYSxVQUFVLFNBQVMsR0FBRztBQUN4QyxZQUFNLEVBQUUsYUFBYSxVQUFVLElBQUk7QUFBQSxJQUNwQztBQUNBO0FBQUEsRUFDRDtBQUNBLFFBQU0sRUFBRSxRQUFRLGNBQWMsTUFBTTtBQUNyQztBQUVBLGVBQWUsb0JBQW9CLEdBQWdDLFVBQTRCLFVBQW9CO0FBQ2xILE1BQUksV0FBMEM7QUFFOUMsTUFBSSxDQUFDLFlBQVksQ0FBQyxVQUFVLFFBQVE7QUFFbkMsZUFBVyw0QkFBNEIsR0FBRyxRQUFRO0FBQUEsRUFDbkQ7QUFFQSxNQUFJLFVBQVU7QUFDYixVQUFNLFFBQVEsTUFBTSxTQUFTLElBQUksa0JBQWtCLEVBQUUsTUFBTTtBQUFBLE1BQzFELE9BQU8sU0FBUztBQUFBLE1BQ2hCLFFBQVEsU0FBUywyQ0FBMkMscUJBQXFCO0FBQUEsSUFDbEYsQ0FBQztBQUNELFFBQUksT0FBTztBQUNWLGVBQVMsT0FBTyxLQUFLO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLGNBQWMsS0FBK0I7QUFDckQsU0FBTyxJQUFJLE1BQU0sR0FBRyxJQUFJLE1BQU07QUFDL0I7QUFFQSxTQUFTLGlCQUFpQixLQUFrQztBQUMzRCxTQUFPLFNBQVMsR0FBRyxJQUFJLE1BQU07QUFDOUI7IiwKICAibmFtZXMiOiBbInByb2ZpbGUiLCAiaXNTaW1wbGVBcmdzIiwgIm9wdGlvbnMiXQp9Cg==
