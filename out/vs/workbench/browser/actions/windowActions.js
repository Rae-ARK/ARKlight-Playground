import { localize, localize2 } from "../../../nls.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { MenuRegistry, MenuId, Action2, registerAction2 } from "../../../platform/actions/common/actions.js";
import { KeyChord, KeyCode, KeyMod } from "../../../base/common/keyCodes.js";
import { IsMainWindowFullscreenContext } from "../../common/contextkeys.js";
import { IsMacNativeContext, IsDevelopmentContext, IsWebContext, IsIOSContext } from "../../../platform/contextkey/common/contextkeys.js";
import { Categories } from "../../../platform/action/common/actionCommonCategories.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../platform/keybinding/common/keybindingsRegistry.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { IWorkspaceContextService, isWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from "../../../platform/workspace/common/workspace.js";
import { ILabelService, Verbosity } from "../../../platform/label/common/label.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { isRecentFolder, isRecentWorkspace, IWorkspacesService } from "../../../platform/workspaces/common/workspaces.js";
import { getIconClasses } from "../../../editor/common/services/getIconClasses.js";
import { FileKind } from "../../../platform/files/common/files.js";
import { splitRecentLabel } from "../../../base/common/labels.js";
import { isMacintosh, isWeb, isWindows } from "../../../base/common/platform.js";
import { ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { inQuickPickContext, getQuickNavigateHandler } from "../quickaccess.js";
import { IHostService } from "../../services/host/browser/host.js";
import { ResourceMap } from "../../../base/common/map.js";
import { Codicon } from "../../../base/common/codicons.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { CommandsRegistry } from "../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { isFolderBackupInfo, isWorkspaceBackupInfo } from "../../../platform/backup/common/backup.js";
import { getActiveElement, getActiveWindow, isHTMLElement } from "../../../base/browser/dom.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { isEqual } from "../../../base/common/resources.js";
const inRecentFilesPickerContextKey = "inRecentFilesPicker";
class BaseOpenRecentAction extends Action2 {
  constructor() {
    super(...arguments);
    this.removeFromRecentlyOpened = {
      iconClass: ThemeIcon.asClassName(Codicon.removeClose),
      tooltip: localize("remove", "Remove from Recently Opened")
    };
    this.dirtyRecentlyOpenedFolder = {
      iconClass: "dirty-workspace " + ThemeIcon.asClassName(Codicon.closeDirty),
      tooltip: localize("dirtyRecentlyOpenedFolder", "Folder With Unsaved Files"),
      alwaysVisible: true
    };
    this.dirtyRecentlyOpenedWorkspace = {
      ...this.dirtyRecentlyOpenedFolder,
      tooltip: localize("dirtyRecentlyOpenedWorkspace", "Workspace With Unsaved Files")
    };
    this.windowOpenedRecentlyOpenedFolder = {
      iconClass: "opened-workspace " + ThemeIcon.asClassName(Codicon.window),
      tooltip: localize("openedRecentlyOpenedFolder", "Folder Opened in a Window"),
      alwaysVisible: true
    };
    this.windowOpenedRecentlyOpenedWorkspace = {
      ...this.windowOpenedRecentlyOpenedFolder,
      tooltip: localize("openedRecentlyOpenedWorkspace", "Workspace Opened in a Window")
    };
    this.activeWindowOpenedRecentlyOpenedFolder = {
      iconClass: "opened-workspace " + ThemeIcon.asClassName(Codicon.windowActive),
      tooltip: localize("activeOpenedRecentlyOpenedFolder", "Folder Opened in Active Window"),
      alwaysVisible: true
    };
    this.activeWindowOpenedRecentlyOpenedWorkspace = {
      ...this.activeWindowOpenedRecentlyOpenedFolder,
      tooltip: localize("activeOpenedRecentlyOpenedWorkspace", "Workspace Opened in Active Window")
    };
  }
  async run(accessor) {
    const workspacesService = accessor.get(IWorkspacesService);
    const quickInputService = accessor.get(IQuickInputService);
    const contextService = accessor.get(IWorkspaceContextService);
    const labelService = accessor.get(ILabelService);
    const keybindingService = accessor.get(IKeybindingService);
    const modelService = accessor.get(IModelService);
    const languageService = accessor.get(ILanguageService);
    const hostService = accessor.get(IHostService);
    const dialogService = accessor.get(IDialogService);
    const environmentService = accessor.get(IWorkbenchEnvironmentService);
    const [mainWindows, recentlyOpened, dirtyWorkspacesAndFolders] = await Promise.all([
      hostService.getWindows({ includeAuxiliaryWindows: false }),
      workspacesService.getRecentlyOpened(),
      workspacesService.getDirtyWorkspaces()
    ]);
    let hasWorkspaces = false;
    const dirtyFolders = new ResourceMap();
    const dirtyWorkspaces = new ResourceMap();
    for (const dirtyWorkspace of dirtyWorkspacesAndFolders) {
      if (isFolderBackupInfo(dirtyWorkspace)) {
        dirtyFolders.set(dirtyWorkspace.folderUri, true);
      } else {
        dirtyWorkspaces.set(dirtyWorkspace.workspace.configPath, dirtyWorkspace.workspace);
        hasWorkspaces = true;
      }
    }
    const activeWindowId = getActiveWindow().vscodeWindowId;
    const openedInWindows = new ResourceMap();
    for (const window of mainWindows) {
      const isActive = window.id === activeWindowId;
      if (isSingleFolderWorkspaceIdentifier(window.workspace)) {
        openedInWindows.set(window.workspace.uri, { isActive });
      } else if (isWorkspaceIdentifier(window.workspace)) {
        openedInWindows.set(window.workspace.configPath, { isActive });
      }
    }
    const recentFolders = new ResourceMap();
    const recentWorkspaces = new ResourceMap();
    for (const recent of recentlyOpened.workspaces) {
      if (isRecentFolder(recent)) {
        recentFolders.set(recent.folderUri, true);
      } else {
        recentWorkspaces.set(recent.workspace.configPath, recent.workspace);
        hasWorkspaces = true;
      }
    }
    const workspacePicks = [];
    for (const recent of recentlyOpened.workspaces) {
      const isDirty = isRecentFolder(recent) ? dirtyFolders.has(recent.folderUri) : dirtyWorkspaces.has(recent.workspace.configPath);
      const windowState = isRecentFolder(recent) ? openedInWindows.get(recent.folderUri) : openedInWindows.get(recent.workspace.configPath);
      workspacePicks.push(this.toQuickPick(modelService, languageService, labelService, environmentService, recent, { isDirty, windowState }));
    }
    for (const dirtyWorkspaceOrFolder of dirtyWorkspacesAndFolders) {
      if (isFolderBackupInfo(dirtyWorkspaceOrFolder) && !recentFolders.has(dirtyWorkspaceOrFolder.folderUri)) {
        workspacePicks.push(this.toQuickPick(modelService, languageService, labelService, environmentService, dirtyWorkspaceOrFolder, { isDirty: true, windowState: void 0 }));
      } else if (isWorkspaceBackupInfo(dirtyWorkspaceOrFolder) && !recentWorkspaces.has(dirtyWorkspaceOrFolder.workspace.configPath)) {
        workspacePicks.push(this.toQuickPick(modelService, languageService, labelService, environmentService, dirtyWorkspaceOrFolder, { isDirty: true, windowState: void 0 }));
      }
    }
    const filePicks = recentlyOpened.files.map((p) => this.toQuickPick(modelService, languageService, labelService, environmentService, p, { isDirty: false, windowState: void 0 }));
    const firstEntry = recentlyOpened.workspaces[0];
    const autoFocusSecondEntry = firstEntry && (contextService.isCurrentWorkspace(isRecentWorkspace(firstEntry) ? firstEntry.workspace : firstEntry.folderUri) || isRecentWorkspace(firstEntry) && isEqual(firstEntry.workspace.configPath, environmentService.agentSessionsWorkspace));
    let keyMods;
    const workspaceSeparator = { type: "separator", label: hasWorkspaces ? localize("workspacesAndFolders", "folders & workspaces") : localize("folders", "folders") };
    const fileSeparator = { type: "separator", label: localize("files", "files") };
    const picks = [workspaceSeparator, ...workspacePicks, fileSeparator, ...filePicks];
    const pick = await quickInputService.pick(picks, {
      contextKey: inRecentFilesPickerContextKey,
      activeItem: [...workspacePicks, ...filePicks][autoFocusSecondEntry ? 1 : 0],
      placeHolder: isMacintosh ? localize("openRecentPlaceholderMac", "Select to open (hold Cmd-key to force new window or Option-key for same window)") : localize("openRecentPlaceholder", "Select to open (hold Ctrl-key to force new window or Alt-key for same window)"),
      matchOnDescription: true,
      sortByLabel: false,
      onKeyMods: (mods) => keyMods = mods,
      quickNavigate: this.isQuickNavigate() ? { keybindings: keybindingService.lookupKeybindings(this.desc.id) } : void 0,
      hideInput: this.isQuickNavigate(),
      onDidTriggerItemButton: async (context) => {
        if (context.button === this.removeFromRecentlyOpened || context.button === this.windowOpenedRecentlyOpenedFolder || context.button === this.windowOpenedRecentlyOpenedWorkspace) {
          await workspacesService.removeRecentlyOpened([context.item.resource]);
          context.removeItem();
        } else if (context.button === this.dirtyRecentlyOpenedFolder || context.button === this.dirtyRecentlyOpenedWorkspace) {
          const isDirtyWorkspace = context.button === this.dirtyRecentlyOpenedWorkspace;
          const { confirmed } = await dialogService.confirm({
            title: isDirtyWorkspace ? localize("dirtyWorkspace", "Workspace with Unsaved Files") : localize("dirtyFolder", "Folder with Unsaved Files"),
            message: isDirtyWorkspace ? localize("dirtyWorkspaceConfirm", "Do you want to open the workspace to review the unsaved files?") : localize("dirtyFolderConfirm", "Do you want to open the folder to review the unsaved files?"),
            detail: isDirtyWorkspace ? localize("dirtyWorkspaceConfirmDetail", "Workspaces with unsaved files cannot be removed until all unsaved files have been saved or reverted.") : localize("dirtyFolderConfirmDetail", "Folders with unsaved files cannot be removed until all unsaved files have been saved or reverted.")
          });
          if (confirmed) {
            hostService.openWindow(
              [context.item.openable],
              {
                remoteAuthority: context.item.remoteAuthority || null
                // local window if remoteAuthority is not set or can not be deducted from the openable
              }
            );
            quickInputService.cancel();
          }
        }
      }
    });
    if (pick) {
      return hostService.openWindow([pick.openable], {
        forceNewWindow: keyMods?.ctrlCmd,
        forceReuseWindow: keyMods?.alt,
        remoteAuthority: pick.remoteAuthority || null
        // local window if remoteAuthority is not set or can not be deducted from the openable
      });
    }
  }
  toQuickPick(modelService, languageService, labelService, environmentService, recent, kind) {
    let openable;
    let iconClasses;
    let fullLabel;
    let resource;
    let isWorkspace = false;
    if (isRecentFolder(recent)) {
      resource = recent.folderUri;
      iconClasses = getIconClasses(modelService, languageService, resource, FileKind.FOLDER);
      openable = { folderUri: resource };
      fullLabel = recent.label || labelService.getWorkspaceLabel(resource, { verbose: Verbosity.LONG });
    } else if (isRecentWorkspace(recent)) {
      resource = recent.workspace.configPath;
      iconClasses = getIconClasses(modelService, languageService, resource, FileKind.ROOT_FOLDER);
      openable = { workspaceUri: resource };
      fullLabel = recent.label || labelService.getWorkspaceLabel(recent.workspace, { verbose: Verbosity.LONG });
      isWorkspace = true;
    } else {
      resource = recent.fileUri;
      iconClasses = getIconClasses(modelService, languageService, resource, FileKind.FILE);
      openable = { fileUri: resource };
      fullLabel = recent.label || labelService.getUriLabel(resource, { appendWorkspaceSuffix: true });
    }
    const { name, parentPath } = isRecentWorkspace(recent) && isEqual(recent.workspace.configPath, environmentService.agentSessionsWorkspace) ? { name: fullLabel, parentPath: void 0 } : splitRecentLabel(fullLabel);
    const buttons = [];
    if (kind.isDirty) {
      buttons.push(isWorkspace ? this.dirtyRecentlyOpenedWorkspace : this.dirtyRecentlyOpenedFolder);
    } else if (kind.windowState) {
      if (kind.windowState.isActive) {
        buttons.push(isWorkspace ? this.activeWindowOpenedRecentlyOpenedWorkspace : this.activeWindowOpenedRecentlyOpenedFolder);
      } else {
        buttons.push(isWorkspace ? this.windowOpenedRecentlyOpenedWorkspace : this.windowOpenedRecentlyOpenedFolder);
      }
    } else {
      buttons.push(this.removeFromRecentlyOpened);
    }
    return {
      iconClasses,
      label: name,
      ariaLabel: kind.isDirty ? isWorkspace ? localize("recentDirtyWorkspaceAriaLabel", "{0}, workspace with unsaved changes", name) : localize("recentDirtyFolderAriaLabel", "{0}, folder with unsaved changes", name) : name,
      description: parentPath,
      buttons,
      openable,
      resource,
      remoteAuthority: recent.remoteAuthority
    };
  }
}
const _OpenRecentAction = class _OpenRecentAction extends BaseOpenRecentAction {
  constructor() {
    super({
      id: _OpenRecentAction.ID,
      title: {
        ...localize2("openRecent", "Open Recent..."),
        mnemonicTitle: localize({ key: "miMore", comment: ["&& denotes a mnemonic"] }, "&&More...")
      },
      category: Categories.File,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyR,
        mac: { primary: KeyMod.WinCtrl | KeyCode.KeyR }
      },
      menu: {
        id: MenuId.MenubarRecentMenu,
        group: "y_more",
        order: 1
      }
    });
  }
  isQuickNavigate() {
    return false;
  }
};
_OpenRecentAction.ID = "workbench.action.openRecent";
let OpenRecentAction = _OpenRecentAction;
class QuickPickRecentAction extends BaseOpenRecentAction {
  constructor() {
    super({
      id: "workbench.action.quickOpenRecent",
      title: localize2("quickOpenRecent", "Quick Open Recent..."),
      category: Categories.File,
      f1: false
      // hide quick pickers from command palette to not confuse with the other entry that shows a input field
    });
  }
  isQuickNavigate() {
    return true;
  }
}
class ToggleFullScreenAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleFullScreen",
      title: {
        ...localize2("toggleFullScreen", "Toggle Full Screen"),
        mnemonicTitle: localize({ key: "miToggleFullScreen", comment: ["&& denotes a mnemonic"] }, "&&Full Screen")
      },
      category: Categories.View,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyCode.F11,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyF
        }
      },
      precondition: IsIOSContext.toNegated(),
      toggled: IsMainWindowFullscreenContext,
      menu: [{
        id: MenuId.MenubarAppearanceMenu,
        group: "1_toggle_view",
        order: 1
      }]
    });
  }
  run(accessor) {
    const hostService = accessor.get(IHostService);
    return hostService.toggleFullScreen(getActiveWindow());
  }
}
const _ReloadWindowAction = class _ReloadWindowAction extends Action2 {
  constructor() {
    super({
      id: _ReloadWindowAction.ID,
      title: localize2("reloadWindow", "Reload Window"),
      category: Categories.Developer,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib + 50,
        when: IsDevelopmentContext,
        primary: KeyMod.CtrlCmd | KeyCode.KeyR
      }
    });
  }
  async run(accessor) {
    const hostService = accessor.get(IHostService);
    return hostService.reload();
  }
};
_ReloadWindowAction.ID = "workbench.action.reloadWindow";
let ReloadWindowAction = _ReloadWindowAction;
class ShowAboutDialogAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.showAboutDialog",
      title: {
        ...localize2("about", "About"),
        mnemonicTitle: localize({ key: "miAbout", comment: ["&& denotes a mnemonic"] }, "&&About")
      },
      category: Categories.Help,
      f1: true,
      menu: {
        id: MenuId.MenubarHelpMenu,
        group: "z_about",
        order: 1,
        when: IsMacNativeContext.toNegated()
      }
    });
  }
  run(accessor) {
    const dialogService = accessor.get(IDialogService);
    return dialogService.about();
  }
}
class NewWindowAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.newWindow",
      title: {
        ...localize2("newWindow", "New Window"),
        mnemonicTitle: localize({ key: "miNewWindow", comment: ["&& denotes a mnemonic"] }, "New &&Window")
      },
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: isWeb ? isWindows ? KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.Shift | KeyCode.KeyN) : KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyN : KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN,
        secondary: isWeb ? [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN] : void 0
      },
      menu: {
        id: MenuId.MenubarFileMenu,
        group: "1_new",
        order: 3
      }
    });
  }
  run(accessor) {
    const hostService = accessor.get(IHostService);
    return hostService.openWindow({ remoteAuthority: null });
  }
}
class BlurAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.blur",
      title: localize2("blur", "Remove keyboard focus from focused element")
    });
  }
  run() {
    const activeElement = getActiveElement();
    if (isHTMLElement(activeElement)) {
      activeElement.blur();
    }
  }
}
registerAction2(NewWindowAction);
registerAction2(ToggleFullScreenAction);
registerAction2(QuickPickRecentAction);
registerAction2(OpenRecentAction);
registerAction2(ReloadWindowAction);
registerAction2(ShowAboutDialogAction);
registerAction2(BlurAction);
const recentFilesPickerContext = ContextKeyExpr.and(inQuickPickContext, ContextKeyExpr.has(inRecentFilesPickerContextKey));
const quickPickNavigateNextInRecentFilesPickerId = "workbench.action.quickOpenNavigateNextInRecentFilesPicker";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: quickPickNavigateNextInRecentFilesPickerId,
  weight: KeybindingWeight.WorkbenchContrib + 50,
  handler: getQuickNavigateHandler(quickPickNavigateNextInRecentFilesPickerId, true),
  when: recentFilesPickerContext,
  primary: KeyMod.CtrlCmd | KeyCode.KeyR,
  mac: { primary: KeyMod.WinCtrl | KeyCode.KeyR }
});
const quickPickNavigatePreviousInRecentFilesPicker = "workbench.action.quickOpenNavigatePreviousInRecentFilesPicker";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: quickPickNavigatePreviousInRecentFilesPicker,
  weight: KeybindingWeight.WorkbenchContrib + 50,
  handler: getQuickNavigateHandler(quickPickNavigatePreviousInRecentFilesPicker, false),
  when: recentFilesPickerContext,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
  mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyR }
});
CommandsRegistry.registerCommand("workbench.action.toggleConfirmBeforeClose", (accessor) => {
  const configurationService = accessor.get(IConfigurationService);
  const setting = configurationService.inspect("window.confirmBeforeClose").userValue;
  return configurationService.updateValue("window.confirmBeforeClose", setting === "never" ? "keyboardOnly" : "never");
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "z_ConfirmClose",
  command: {
    id: "workbench.action.toggleConfirmBeforeClose",
    title: localize("miConfirmClose", "Confirm Before Close"),
    toggled: ContextKeyExpr.notEquals("config.window.confirmBeforeClose", "never")
  },
  order: 1,
  when: IsWebContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  title: localize({ key: "miOpenRecent", comment: ["&& denotes a mnemonic"] }, "Open &&Recent"),
  submenu: MenuId.MenubarRecentMenu,
  group: "2_open",
  order: 4
});
export {
  OpenRecentAction,
  ReloadWindowAction,
  inRecentFilesPickerContextKey
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL2FjdGlvbnMvd2luZG93QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVdpbmRvd09wZW5hYmxlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IE1lbnVSZWdpc3RyeSwgTWVudUlkLCBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJc01haW5XaW5kb3dGdWxsc2NyZWVuQ29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJc01hY05hdGl2ZUNvbnRleHQsIElzRGV2ZWxvcG1lbnRDb250ZXh0LCBJc1dlYkNvbnRleHQsIElzSU9TQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja1NlcGFyYXRvciwgSUtleU1vZHMsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc1dvcmtzcGFjZUlkZW50aWZpZXIsIGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UsIFZlcmJvc2l0eSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJUmVjZW50LCBpc1JlY2VudEZvbGRlciwgaXNSZWNlbnRXb3Jrc3BhY2UsIElXb3Jrc3BhY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBzcGxpdFJlY2VudExhYmVsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dlYiwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGluUXVpY2tQaWNrQ29udGV4dCwgZ2V0UXVpY2tOYXZpZ2F0ZUhhbmRsZXIgfSBmcm9tICcuLi9xdWlja2FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0ZvbGRlckJhY2t1cEluZm8sIGlzV29ya3NwYWNlQmFja3VwSW5mbyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2JhY2t1cC9jb21tb24vYmFja3VwLmpzJztcbmltcG9ydCB7IGdldEFjdGl2ZUVsZW1lbnQsIGdldEFjdGl2ZVdpbmRvdywgaXNIVE1MRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5cbmV4cG9ydCBjb25zdCBpblJlY2VudEZpbGVzUGlja2VyQ29udGV4dEtleSA9ICdpblJlY2VudEZpbGVzUGlja2VyJztcblxuaW50ZXJmYWNlIElSZWNlbnRseU9wZW5lZFBpY2sgZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHJlc291cmNlOiBVUkk7XG5cdG9wZW5hYmxlOiBJV2luZG93T3BlbmFibGU7XG5cdHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBCYXNlT3BlblJlY2VudEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVtb3ZlRnJvbVJlY2VudGx5T3BlbmVkOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnJlbW92ZUNsb3NlKSxcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgncmVtb3ZlJywgXCJSZW1vdmUgZnJvbSBSZWNlbnRseSBPcGVuZWRcIilcblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpcnR5UmVjZW50bHlPcGVuZWRGb2xkZXI6IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdGljb25DbGFzczogJ2RpcnR5LXdvcmtzcGFjZSAnICsgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2VEaXJ0eSksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ2RpcnR5UmVjZW50bHlPcGVuZWRGb2xkZXInLCBcIkZvbGRlciBXaXRoIFVuc2F2ZWQgRmlsZXNcIiksXG5cdFx0YWx3YXlzVmlzaWJsZTogdHJ1ZVxuXHR9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlydHlSZWNlbnRseU9wZW5lZFdvcmtzcGFjZTogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0Li4udGhpcy5kaXJ0eVJlY2VudGx5T3BlbmVkRm9sZGVyLFxuXHRcdHRvb2x0aXA6IGxvY2FsaXplKCdkaXJ0eVJlY2VudGx5T3BlbmVkV29ya3NwYWNlJywgXCJXb3Jrc3BhY2UgV2l0aCBVbnNhdmVkIEZpbGVzXCIpLFxuXHR9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2luZG93T3BlbmVkUmVjZW50bHlPcGVuZWRGb2xkZXI6IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdGljb25DbGFzczogJ29wZW5lZC13b3Jrc3BhY2UgJyArIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLndpbmRvdyksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ29wZW5lZFJlY2VudGx5T3BlbmVkRm9sZGVyJywgXCJGb2xkZXIgT3BlbmVkIGluIGEgV2luZG93XCIpLFxuXHRcdGFsd2F5c1Zpc2libGU6IHRydWVcblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHdpbmRvd09wZW5lZFJlY2VudGx5T3BlbmVkV29ya3NwYWNlOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHQuLi50aGlzLndpbmRvd09wZW5lZFJlY2VudGx5T3BlbmVkRm9sZGVyLFxuXHRcdHRvb2x0aXA6IGxvY2FsaXplKCdvcGVuZWRSZWNlbnRseU9wZW5lZFdvcmtzcGFjZScsIFwiV29ya3NwYWNlIE9wZW5lZCBpbiBhIFdpbmRvd1wiKSxcblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZVdpbmRvd09wZW5lZFJlY2VudGx5T3BlbmVkRm9sZGVyOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRpY29uQ2xhc3M6ICdvcGVuZWQtd29ya3NwYWNlICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi53aW5kb3dBY3RpdmUpLFxuXHRcdHRvb2x0aXA6IGxvY2FsaXplKCdhY3RpdmVPcGVuZWRSZWNlbnRseU9wZW5lZEZvbGRlcicsIFwiRm9sZGVyIE9wZW5lZCBpbiBBY3RpdmUgV2luZG93XCIpLFxuXHRcdGFsd2F5c1Zpc2libGU6IHRydWVcblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZVdpbmRvd09wZW5lZFJlY2VudGx5T3BlbmVkV29ya3NwYWNlOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHQuLi50aGlzLmFjdGl2ZVdpbmRvd09wZW5lZFJlY2VudGx5T3BlbmVkRm9sZGVyLFxuXHRcdHRvb2x0aXA6IGxvY2FsaXplKCdhY3RpdmVPcGVuZWRSZWNlbnRseU9wZW5lZFdvcmtzcGFjZScsIFwiV29ya3NwYWNlIE9wZW5lZCBpbiBBY3RpdmUgV2luZG93XCIpLFxuXHR9O1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBpc1F1aWNrTmF2aWdhdGUoKTogYm9vbGVhbjtcblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VzU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRjb25zdCBsYWJlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhYmVsU2VydmljZSk7XG5cdFx0Y29uc3Qga2V5YmluZGluZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUtleWJpbmRpbmdTZXJ2aWNlKTtcblx0XHRjb25zdCBtb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1vZGVsU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgW21haW5XaW5kb3dzLCByZWNlbnRseU9wZW5lZCwgZGlydHlXb3Jrc3BhY2VzQW5kRm9sZGVyc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRob3N0U2VydmljZS5nZXRXaW5kb3dzKHsgaW5jbHVkZUF1eGlsaWFyeVdpbmRvd3M6IGZhbHNlIH0pLFxuXHRcdFx0d29ya3NwYWNlc1NlcnZpY2UuZ2V0UmVjZW50bHlPcGVuZWQoKSxcblx0XHRcdHdvcmtzcGFjZXNTZXJ2aWNlLmdldERpcnR5V29ya3NwYWNlcygpXG5cdFx0XSk7XG5cblx0XHRsZXQgaGFzV29ya3NwYWNlcyA9IGZhbHNlO1xuXG5cdFx0Ly8gSWRlbnRpZnkgYWxsIGZvbGRlcnMgYW5kIHdvcmtzcGFjZXMgd2l0aCB1bnNhdmVkIGZpbGVzXG5cdFx0Y29uc3QgZGlydHlGb2xkZXJzID0gbmV3IFJlc291cmNlTWFwPGJvb2xlYW4+KCk7XG5cdFx0Y29uc3QgZGlydHlXb3Jrc3BhY2VzID0gbmV3IFJlc291cmNlTWFwPElXb3Jrc3BhY2VJZGVudGlmaWVyPigpO1xuXHRcdGZvciAoY29uc3QgZGlydHlXb3Jrc3BhY2Ugb2YgZGlydHlXb3Jrc3BhY2VzQW5kRm9sZGVycykge1xuXHRcdFx0aWYgKGlzRm9sZGVyQmFja3VwSW5mbyhkaXJ0eVdvcmtzcGFjZSkpIHtcblx0XHRcdFx0ZGlydHlGb2xkZXJzLnNldChkaXJ0eVdvcmtzcGFjZS5mb2xkZXJVcmksIHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGlydHlXb3Jrc3BhY2VzLnNldChkaXJ0eVdvcmtzcGFjZS53b3Jrc3BhY2UuY29uZmlnUGF0aCwgZGlydHlXb3Jrc3BhY2Uud29ya3NwYWNlKTtcblx0XHRcdFx0aGFzV29ya3NwYWNlcyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWRlbnRpZnkgYWxsIGZvbGRlcnMgYW5kIHdvcmtzcGFjZXMgb3BlbmVkIGluIG1haW4gd2luZG93c1xuXHRcdGNvbnN0IGFjdGl2ZVdpbmRvd0lkID0gZ2V0QWN0aXZlV2luZG93KCkudnNjb2RlV2luZG93SWQ7XG5cdFx0Y29uc3Qgb3BlbmVkSW5XaW5kb3dzID0gbmV3IFJlc291cmNlTWFwPHsgaXNBY3RpdmU6IGJvb2xlYW4gfT4oKTtcblx0XHRmb3IgKGNvbnN0IHdpbmRvdyBvZiBtYWluV2luZG93cykge1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSB3aW5kb3cuaWQgPT09IGFjdGl2ZVdpbmRvd0lkO1xuXHRcdFx0aWYgKGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih3aW5kb3cud29ya3NwYWNlKSkge1xuXHRcdFx0XHRvcGVuZWRJbldpbmRvd3Muc2V0KHdpbmRvdy53b3Jrc3BhY2UudXJpLCB7IGlzQWN0aXZlIH0pO1xuXHRcdFx0fSBlbHNlIGlmIChpc1dvcmtzcGFjZUlkZW50aWZpZXIod2luZG93LndvcmtzcGFjZSkpIHtcblx0XHRcdFx0b3BlbmVkSW5XaW5kb3dzLnNldCh3aW5kb3cud29ya3NwYWNlLmNvbmZpZ1BhdGgsIHsgaXNBY3RpdmUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWRlbnRpZnkgYWxsIHJlY2VudGx5IG9wZW5lZCBmb2xkZXJzIGFuZCB3b3Jrc3BhY2VzXG5cdFx0Y29uc3QgcmVjZW50Rm9sZGVycyA9IG5ldyBSZXNvdXJjZU1hcDxib29sZWFuPigpO1xuXHRcdGNvbnN0IHJlY2VudFdvcmtzcGFjZXMgPSBuZXcgUmVzb3VyY2VNYXA8SVdvcmtzcGFjZUlkZW50aWZpZXI+KCk7XG5cdFx0Zm9yIChjb25zdCByZWNlbnQgb2YgcmVjZW50bHlPcGVuZWQud29ya3NwYWNlcykge1xuXHRcdFx0aWYgKGlzUmVjZW50Rm9sZGVyKHJlY2VudCkpIHtcblx0XHRcdFx0cmVjZW50Rm9sZGVycy5zZXQocmVjZW50LmZvbGRlclVyaSwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZWNlbnRXb3Jrc3BhY2VzLnNldChyZWNlbnQud29ya3NwYWNlLmNvbmZpZ1BhdGgsIHJlY2VudC53b3Jrc3BhY2UpO1xuXHRcdFx0XHRoYXNXb3Jrc3BhY2VzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaWxsIGluIGFsbCBrbm93biByZWNlbnRseSBvcGVuZWQgd29ya3NwYWNlc1xuXHRcdGNvbnN0IHdvcmtzcGFjZVBpY2tzOiBJUmVjZW50bHlPcGVuZWRQaWNrW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlY2VudCBvZiByZWNlbnRseU9wZW5lZC53b3Jrc3BhY2VzKSB7XG5cdFx0XHRjb25zdCBpc0RpcnR5ID0gaXNSZWNlbnRGb2xkZXIocmVjZW50KSA/IGRpcnR5Rm9sZGVycy5oYXMocmVjZW50LmZvbGRlclVyaSkgOiBkaXJ0eVdvcmtzcGFjZXMuaGFzKHJlY2VudC53b3Jrc3BhY2UuY29uZmlnUGF0aCk7XG5cdFx0XHRjb25zdCB3aW5kb3dTdGF0ZSA9IGlzUmVjZW50Rm9sZGVyKHJlY2VudCkgPyBvcGVuZWRJbldpbmRvd3MuZ2V0KHJlY2VudC5mb2xkZXJVcmkpIDogb3BlbmVkSW5XaW5kb3dzLmdldChyZWNlbnQud29ya3NwYWNlLmNvbmZpZ1BhdGgpO1xuXG5cdFx0XHR3b3Jrc3BhY2VQaWNrcy5wdXNoKHRoaXMudG9RdWlja1BpY2sobW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIGxhYmVsU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCByZWNlbnQsIHsgaXNEaXJ0eSwgd2luZG93U3RhdGUgfSkpO1xuXHRcdH1cblxuXHRcdC8vIEZpbGwgYW55IGJhY2t1cCB3b3Jrc3BhY2UgdGhhdCBpcyBub3QgeWV0IHNob3duIGF0IHRoZSBlbmRcblx0XHRmb3IgKGNvbnN0IGRpcnR5V29ya3NwYWNlT3JGb2xkZXIgb2YgZGlydHlXb3Jrc3BhY2VzQW5kRm9sZGVycykge1xuXHRcdFx0aWYgKGlzRm9sZGVyQmFja3VwSW5mbyhkaXJ0eVdvcmtzcGFjZU9yRm9sZGVyKSAmJiAhcmVjZW50Rm9sZGVycy5oYXMoZGlydHlXb3Jrc3BhY2VPckZvbGRlci5mb2xkZXJVcmkpKSB7XG5cdFx0XHRcdHdvcmtzcGFjZVBpY2tzLnB1c2godGhpcy50b1F1aWNrUGljayhtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgbGFiZWxTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGRpcnR5V29ya3NwYWNlT3JGb2xkZXIsIHsgaXNEaXJ0eTogdHJ1ZSwgd2luZG93U3RhdGU6IHVuZGVmaW5lZCB9KSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzV29ya3NwYWNlQmFja3VwSW5mbyhkaXJ0eVdvcmtzcGFjZU9yRm9sZGVyKSAmJiAhcmVjZW50V29ya3NwYWNlcy5oYXMoZGlydHlXb3Jrc3BhY2VPckZvbGRlci53b3Jrc3BhY2UuY29uZmlnUGF0aCkpIHtcblx0XHRcdFx0d29ya3NwYWNlUGlja3MucHVzaCh0aGlzLnRvUXVpY2tQaWNrKG1vZGVsU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgZGlydHlXb3Jrc3BhY2VPckZvbGRlciwgeyBpc0RpcnR5OiB0cnVlLCB3aW5kb3dTdGF0ZTogdW5kZWZpbmVkIH0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmaWxlUGlja3MgPSByZWNlbnRseU9wZW5lZC5maWxlcy5tYXAocCA9PiB0aGlzLnRvUXVpY2tQaWNrKG1vZGVsU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgcCwgeyBpc0RpcnR5OiBmYWxzZSwgd2luZG93U3RhdGU6IHVuZGVmaW5lZCB9KSk7XG5cblx0XHQvLyBGb2N1cyB0aGUgc2Vjb25kIGVudHJ5IHdoZW4gdGhlIGZpcnN0IG9uZSByZXByZXNlbnRzIHRoZSBjdXJyZW50IHdvcmtzcGFjZS5cblx0XHRjb25zdCBmaXJzdEVudHJ5ID0gcmVjZW50bHlPcGVuZWQud29ya3NwYWNlc1swXTtcblx0XHRjb25zdCBhdXRvRm9jdXNTZWNvbmRFbnRyeTogYm9vbGVhbiA9IGZpcnN0RW50cnkgJiYgKFxuXHRcdFx0Y29udGV4dFNlcnZpY2UuaXNDdXJyZW50V29ya3NwYWNlKGlzUmVjZW50V29ya3NwYWNlKGZpcnN0RW50cnkpID8gZmlyc3RFbnRyeS53b3Jrc3BhY2UgOiBmaXJzdEVudHJ5LmZvbGRlclVyaSlcblx0XHRcdHx8IChpc1JlY2VudFdvcmtzcGFjZShmaXJzdEVudHJ5KSAmJiBpc0VxdWFsKGZpcnN0RW50cnkud29ya3NwYWNlLmNvbmZpZ1BhdGgsIGVudmlyb25tZW50U2VydmljZS5hZ2VudFNlc3Npb25zV29ya3NwYWNlKSlcblx0XHQpO1xuXG5cdFx0bGV0IGtleU1vZHM6IElLZXlNb2RzIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlU2VwYXJhdG9yOiBJUXVpY2tQaWNrU2VwYXJhdG9yID0geyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGhhc1dvcmtzcGFjZXMgPyBsb2NhbGl6ZSgnd29ya3NwYWNlc0FuZEZvbGRlcnMnLCBcImZvbGRlcnMgJiB3b3Jrc3BhY2VzXCIpIDogbG9jYWxpemUoJ2ZvbGRlcnMnLCBcImZvbGRlcnNcIikgfTtcblx0XHRjb25zdCBmaWxlU2VwYXJhdG9yOiBJUXVpY2tQaWNrU2VwYXJhdG9yID0geyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdmaWxlcycsIFwiZmlsZXNcIikgfTtcblx0XHRjb25zdCBwaWNrcyA9IFt3b3Jrc3BhY2VTZXBhcmF0b3IsIC4uLndvcmtzcGFjZVBpY2tzLCBmaWxlU2VwYXJhdG9yLCAuLi5maWxlUGlja3NdO1xuXG5cdFx0Y29uc3QgcGljayA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHtcblx0XHRcdGNvbnRleHRLZXk6IGluUmVjZW50RmlsZXNQaWNrZXJDb250ZXh0S2V5LFxuXHRcdFx0YWN0aXZlSXRlbTogWy4uLndvcmtzcGFjZVBpY2tzLCAuLi5maWxlUGlja3NdW2F1dG9Gb2N1c1NlY29uZEVudHJ5ID8gMSA6IDBdLFxuXHRcdFx0cGxhY2VIb2xkZXI6IGlzTWFjaW50b3NoID8gbG9jYWxpemUoJ29wZW5SZWNlbnRQbGFjZWhvbGRlck1hYycsIFwiU2VsZWN0IHRvIG9wZW4gKGhvbGQgQ21kLWtleSB0byBmb3JjZSBuZXcgd2luZG93IG9yIE9wdGlvbi1rZXkgZm9yIHNhbWUgd2luZG93KVwiKSA6IGxvY2FsaXplKCdvcGVuUmVjZW50UGxhY2Vob2xkZXInLCBcIlNlbGVjdCB0byBvcGVuIChob2xkIEN0cmwta2V5IHRvIGZvcmNlIG5ldyB3aW5kb3cgb3IgQWx0LWtleSBmb3Igc2FtZSB3aW5kb3cpXCIpLFxuXHRcdFx0bWF0Y2hPbkRlc2NyaXB0aW9uOiB0cnVlLFxuXHRcdFx0c29ydEJ5TGFiZWw6IGZhbHNlLFxuXHRcdFx0b25LZXlNb2RzOiBtb2RzID0+IGtleU1vZHMgPSBtb2RzLFxuXHRcdFx0cXVpY2tOYXZpZ2F0ZTogdGhpcy5pc1F1aWNrTmF2aWdhdGUoKSA/IHsga2V5YmluZGluZ3M6IGtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmdzKHRoaXMuZGVzYy5pZCkgfSA6IHVuZGVmaW5lZCxcblx0XHRcdGhpZGVJbnB1dDogdGhpcy5pc1F1aWNrTmF2aWdhdGUoKSxcblx0XHRcdG9uRGlkVHJpZ2dlckl0ZW1CdXR0b246IGFzeW5jIGNvbnRleHQgPT4ge1xuXG5cdFx0XHRcdC8vIFJlbW92ZVxuXHRcdFx0XHRpZiAoY29udGV4dC5idXR0b24gPT09IHRoaXMucmVtb3ZlRnJvbVJlY2VudGx5T3BlbmVkIHx8IGNvbnRleHQuYnV0dG9uID09PSB0aGlzLndpbmRvd09wZW5lZFJlY2VudGx5T3BlbmVkRm9sZGVyIHx8IGNvbnRleHQuYnV0dG9uID09PSB0aGlzLndpbmRvd09wZW5lZFJlY2VudGx5T3BlbmVkV29ya3NwYWNlKSB7XG5cdFx0XHRcdFx0YXdhaXQgd29ya3NwYWNlc1NlcnZpY2UucmVtb3ZlUmVjZW50bHlPcGVuZWQoW2NvbnRleHQuaXRlbS5yZXNvdXJjZV0pO1xuXHRcdFx0XHRcdGNvbnRleHQucmVtb3ZlSXRlbSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRGlydHkgRm9sZGVyL1dvcmtzcGFjZVxuXHRcdFx0XHRlbHNlIGlmIChjb250ZXh0LmJ1dHRvbiA9PT0gdGhpcy5kaXJ0eVJlY2VudGx5T3BlbmVkRm9sZGVyIHx8IGNvbnRleHQuYnV0dG9uID09PSB0aGlzLmRpcnR5UmVjZW50bHlPcGVuZWRXb3Jrc3BhY2UpIHtcblx0XHRcdFx0XHRjb25zdCBpc0RpcnR5V29ya3NwYWNlID0gY29udGV4dC5idXR0b24gPT09IHRoaXMuZGlydHlSZWNlbnRseU9wZW5lZFdvcmtzcGFjZTtcblx0XHRcdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHRcdHRpdGxlOiBpc0RpcnR5V29ya3NwYWNlID8gbG9jYWxpemUoJ2RpcnR5V29ya3NwYWNlJywgXCJXb3Jrc3BhY2Ugd2l0aCBVbnNhdmVkIEZpbGVzXCIpIDogbG9jYWxpemUoJ2RpcnR5Rm9sZGVyJywgXCJGb2xkZXIgd2l0aCBVbnNhdmVkIEZpbGVzXCIpLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogaXNEaXJ0eVdvcmtzcGFjZSA/IGxvY2FsaXplKCdkaXJ0eVdvcmtzcGFjZUNvbmZpcm0nLCBcIkRvIHlvdSB3YW50IHRvIG9wZW4gdGhlIHdvcmtzcGFjZSB0byByZXZpZXcgdGhlIHVuc2F2ZWQgZmlsZXM/XCIpIDogbG9jYWxpemUoJ2RpcnR5Rm9sZGVyQ29uZmlybScsIFwiRG8geW91IHdhbnQgdG8gb3BlbiB0aGUgZm9sZGVyIHRvIHJldmlldyB0aGUgdW5zYXZlZCBmaWxlcz9cIiksXG5cdFx0XHRcdFx0XHRkZXRhaWw6IGlzRGlydHlXb3Jrc3BhY2UgPyBsb2NhbGl6ZSgnZGlydHlXb3Jrc3BhY2VDb25maXJtRGV0YWlsJywgXCJXb3Jrc3BhY2VzIHdpdGggdW5zYXZlZCBmaWxlcyBjYW5ub3QgYmUgcmVtb3ZlZCB1bnRpbCBhbGwgdW5zYXZlZCBmaWxlcyBoYXZlIGJlZW4gc2F2ZWQgb3IgcmV2ZXJ0ZWQuXCIpIDogbG9jYWxpemUoJ2RpcnR5Rm9sZGVyQ29uZmlybURldGFpbCcsIFwiRm9sZGVycyB3aXRoIHVuc2F2ZWQgZmlsZXMgY2Fubm90IGJlIHJlbW92ZWQgdW50aWwgYWxsIHVuc2F2ZWQgZmlsZXMgaGF2ZSBiZWVuIHNhdmVkIG9yIHJldmVydGVkLlwiKVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0aG9zdFNlcnZpY2Uub3BlbldpbmRvdyhcblx0XHRcdFx0XHRcdFx0W2NvbnRleHQuaXRlbS5vcGVuYWJsZV0sIHtcblx0XHRcdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiBjb250ZXh0Lml0ZW0ucmVtb3RlQXV0aG9yaXR5IHx8IG51bGwgLy8gbG9jYWwgd2luZG93IGlmIHJlbW90ZUF1dGhvcml0eSBpcyBub3Qgc2V0IG9yIGNhbiBub3QgYmUgZGVkdWN0ZWQgZnJvbSB0aGUgb3BlbmFibGVcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0cXVpY2tJbnB1dFNlcnZpY2UuY2FuY2VsKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAocGljaykge1xuXHRcdFx0cmV0dXJuIGhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coW3BpY2sub3BlbmFibGVdLCB7XG5cdFx0XHRcdGZvcmNlTmV3V2luZG93OiBrZXlNb2RzPy5jdHJsQ21kLFxuXHRcdFx0XHRmb3JjZVJldXNlV2luZG93OiBrZXlNb2RzPy5hbHQsXG5cdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogcGljay5yZW1vdGVBdXRob3JpdHkgfHwgbnVsbCAvLyBsb2NhbCB3aW5kb3cgaWYgcmVtb3RlQXV0aG9yaXR5IGlzIG5vdCBzZXQgb3IgY2FuIG5vdCBiZSBkZWR1Y3RlZCBmcm9tIHRoZSBvcGVuYWJsZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0b1F1aWNrUGljayhtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSwgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsIHJlY2VudDogSVJlY2VudCwga2luZDogeyBpc0RpcnR5OiBib29sZWFuOyB3aW5kb3dTdGF0ZT86IHsgaXNBY3RpdmU6IGJvb2xlYW4gfSB9KTogSVJlY2VudGx5T3BlbmVkUGljayB7XG5cdFx0bGV0IG9wZW5hYmxlOiBJV2luZG93T3BlbmFibGUgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGljb25DbGFzc2VzOiBzdHJpbmdbXTtcblx0XHRsZXQgZnVsbExhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGlzV29ya3NwYWNlID0gZmFsc2U7XG5cblx0XHQvLyBGb2xkZXJcblx0XHRpZiAoaXNSZWNlbnRGb2xkZXIocmVjZW50KSkge1xuXHRcdFx0cmVzb3VyY2UgPSByZWNlbnQuZm9sZGVyVXJpO1xuXHRcdFx0aWNvbkNsYXNzZXMgPSBnZXRJY29uQ2xhc3Nlcyhtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgcmVzb3VyY2UsIEZpbGVLaW5kLkZPTERFUik7XG5cdFx0XHRvcGVuYWJsZSA9IHsgZm9sZGVyVXJpOiByZXNvdXJjZSB9O1xuXHRcdFx0ZnVsbExhYmVsID0gcmVjZW50LmxhYmVsIHx8IGxhYmVsU2VydmljZS5nZXRXb3Jrc3BhY2VMYWJlbChyZXNvdXJjZSwgeyB2ZXJib3NlOiBWZXJib3NpdHkuTE9ORyB9KTtcblx0XHR9XG5cblx0XHQvLyBXb3Jrc3BhY2Vcblx0XHRlbHNlIGlmIChpc1JlY2VudFdvcmtzcGFjZShyZWNlbnQpKSB7XG5cdFx0XHRyZXNvdXJjZSA9IHJlY2VudC53b3Jrc3BhY2UuY29uZmlnUGF0aDtcblx0XHRcdGljb25DbGFzc2VzID0gZ2V0SWNvbkNsYXNzZXMobW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIHJlc291cmNlLCBGaWxlS2luZC5ST09UX0ZPTERFUik7XG5cdFx0XHRvcGVuYWJsZSA9IHsgd29ya3NwYWNlVXJpOiByZXNvdXJjZSB9O1xuXHRcdFx0ZnVsbExhYmVsID0gcmVjZW50LmxhYmVsIHx8IGxhYmVsU2VydmljZS5nZXRXb3Jrc3BhY2VMYWJlbChyZWNlbnQud29ya3NwYWNlLCB7IHZlcmJvc2U6IFZlcmJvc2l0eS5MT05HIH0pO1xuXHRcdFx0aXNXb3Jrc3BhY2UgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIEZpbGVcblx0XHRlbHNlIHtcblx0XHRcdHJlc291cmNlID0gcmVjZW50LmZpbGVVcmk7XG5cdFx0XHRpY29uQ2xhc3NlcyA9IGdldEljb25DbGFzc2VzKG1vZGVsU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCByZXNvdXJjZSwgRmlsZUtpbmQuRklMRSk7XG5cdFx0XHRvcGVuYWJsZSA9IHsgZmlsZVVyaTogcmVzb3VyY2UgfTtcblx0XHRcdGZ1bGxMYWJlbCA9IHJlY2VudC5sYWJlbCB8fCBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVzb3VyY2UsIHsgYXBwZW5kV29ya3NwYWNlU3VmZml4OiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgbmFtZSwgcGFyZW50UGF0aCB9ID0gaXNSZWNlbnRXb3Jrc3BhY2UocmVjZW50KSAmJiBpc0VxdWFsKHJlY2VudC53b3Jrc3BhY2UuY29uZmlnUGF0aCwgZW52aXJvbm1lbnRTZXJ2aWNlLmFnZW50U2Vzc2lvbnNXb3Jrc3BhY2UpXG5cdFx0XHQ/IHsgbmFtZTogZnVsbExhYmVsLCBwYXJlbnRQYXRoOiB1bmRlZmluZWQgfVxuXHRcdFx0OiBzcGxpdFJlY2VudExhYmVsKGZ1bGxMYWJlbCk7XG5cblx0XHRjb25zdCBidXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cdFx0aWYgKGtpbmQuaXNEaXJ0eSkge1xuXHRcdFx0YnV0dG9ucy5wdXNoKGlzV29ya3NwYWNlID8gdGhpcy5kaXJ0eVJlY2VudGx5T3BlbmVkV29ya3NwYWNlIDogdGhpcy5kaXJ0eVJlY2VudGx5T3BlbmVkRm9sZGVyKTtcblx0XHR9IGVsc2UgaWYgKGtpbmQud2luZG93U3RhdGUpIHtcblx0XHRcdGlmIChraW5kLndpbmRvd1N0YXRlLmlzQWN0aXZlKSB7XG5cdFx0XHRcdGJ1dHRvbnMucHVzaChpc1dvcmtzcGFjZSA/IHRoaXMuYWN0aXZlV2luZG93T3BlbmVkUmVjZW50bHlPcGVuZWRXb3Jrc3BhY2UgOiB0aGlzLmFjdGl2ZVdpbmRvd09wZW5lZFJlY2VudGx5T3BlbmVkRm9sZGVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJ1dHRvbnMucHVzaChpc1dvcmtzcGFjZSA/IHRoaXMud2luZG93T3BlbmVkUmVjZW50bHlPcGVuZWRXb3Jrc3BhY2UgOiB0aGlzLndpbmRvd09wZW5lZFJlY2VudGx5T3BlbmVkRm9sZGVyKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0YnV0dG9ucy5wdXNoKHRoaXMucmVtb3ZlRnJvbVJlY2VudGx5T3BlbmVkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWNvbkNsYXNzZXMsXG5cdFx0XHRsYWJlbDogbmFtZSxcblx0XHRcdGFyaWFMYWJlbDoga2luZC5pc0RpcnR5ID8gaXNXb3Jrc3BhY2UgPyBsb2NhbGl6ZSgncmVjZW50RGlydHlXb3Jrc3BhY2VBcmlhTGFiZWwnLCBcInswfSwgd29ya3NwYWNlIHdpdGggdW5zYXZlZCBjaGFuZ2VzXCIsIG5hbWUpIDogbG9jYWxpemUoJ3JlY2VudERpcnR5Rm9sZGVyQXJpYUxhYmVsJywgXCJ7MH0sIGZvbGRlciB3aXRoIHVuc2F2ZWQgY2hhbmdlc1wiLCBuYW1lKSA6IG5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogcGFyZW50UGF0aCxcblx0XHRcdGJ1dHRvbnMsXG5cdFx0XHRvcGVuYWJsZSxcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiByZWNlbnQucmVtb3RlQXV0aG9yaXR5XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3BlblJlY2VudEFjdGlvbiBleHRlbmRzIEJhc2VPcGVuUmVjZW50QWN0aW9uIHtcblxuXHRzdGF0aWMgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5vcGVuUmVjZW50JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlblJlY2VudEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMignb3BlblJlY2VudCcsIFwiT3BlbiBSZWNlbnQuLi5cIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlNb3JlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTW9yZS4uLlwiKSxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Uixcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlSIH1cblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhclJlY2VudE1lbnUsXG5cdFx0XHRcdGdyb3VwOiAneV9tb3JlJyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBpc1F1aWNrTmF2aWdhdGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmNsYXNzIFF1aWNrUGlja1JlY2VudEFjdGlvbiBleHRlbmRzIEJhc2VPcGVuUmVjZW50QWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ucXVpY2tPcGVuUmVjZW50Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3F1aWNrT3BlblJlY2VudCcsICdRdWljayBPcGVuIFJlY2VudC4uLicpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZSxcblx0XHRcdGYxOiBmYWxzZSAvLyBoaWRlIHF1aWNrIHBpY2tlcnMgZnJvbSBjb21tYW5kIHBhbGV0dGUgdG8gbm90IGNvbmZ1c2Ugd2l0aCB0aGUgb3RoZXIgZW50cnkgdGhhdCBzaG93cyBhIGlucHV0IGZpZWxkXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgaXNRdWlja05hdmlnYXRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbmNsYXNzIFRvZ2dsZUZ1bGxTY3JlZW5BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlRnVsbFNjcmVlbicsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ3RvZ2dsZUZ1bGxTY3JlZW4nLCBcIlRvZ2dsZSBGdWxsIFNjcmVlblwiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVRvZ2dsZUZ1bGxTY3JlZW4nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZGdWxsIFNjcmVlblwiKSxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkYxMSxcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5RlxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBJc0lPU0NvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0XHR0b2dnbGVkOiBJc01haW5XaW5kb3dGdWxsc2NyZWVuQ29udGV4dCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckFwcGVhcmFuY2VNZW51LFxuXHRcdFx0XHRncm91cDogJzFfdG9nZ2xlX3ZpZXcnLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cblx0XHRyZXR1cm4gaG9zdFNlcnZpY2UudG9nZ2xlRnVsbFNjcmVlbihnZXRBY3RpdmVXaW5kb3coKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlbG9hZFdpbmRvd0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLnJlbG9hZFdpbmRvdyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJlbG9hZFdpbmRvd0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3JlbG9hZFdpbmRvdycsICdSZWxvYWQgV2luZG93JyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyA1MCxcblx0XHRcdFx0d2hlbjogSXNEZXZlbG9wbWVudENvbnRleHQsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlSXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIGhvc3RTZXJ2aWNlLnJlbG9hZCgpO1xuXHR9XG59XG5cbmNsYXNzIFNob3dBYm91dERpYWxvZ0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5zaG93QWJvdXREaWFsb2cnLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCdhYm91dCcsIFwiQWJvdXRcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlBYm91dCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkFib3V0XCIpLFxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkhlbHAsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFySGVscE1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnel9hYm91dCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBJc01hY05hdGl2ZUNvbnRleHQudG9OZWdhdGVkKClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIGRpYWxvZ1NlcnZpY2UuYWJvdXQoKTtcblx0fVxufVxuXG5jbGFzcyBOZXdXaW5kb3dBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubmV3V2luZG93Jyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMignbmV3V2luZG93JywgXCJOZXcgV2luZG93XCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pTmV3V2luZG93JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIk5ldyAmJldpbmRvd1wiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IGlzV2ViID8gKGlzV2luZG93cyA/IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleU4pIDogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlOKSA6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlOLFxuXHRcdFx0XHRzZWNvbmRhcnk6IGlzV2ViID8gW0tleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlOXSA6IHVuZGVmaW5lZFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMV9uZXcnLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cblx0XHRyZXR1cm4gaG9zdFNlcnZpY2Uub3BlbldpbmRvdyh7IHJlbW90ZUF1dGhvcml0eTogbnVsbCB9KTtcblx0fVxufVxuXG5jbGFzcyBCbHVyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmJsdXInLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYmx1cicsICdSZW1vdmUga2V5Ym9hcmQgZm9jdXMgZnJvbSBmb2N1c2VkIGVsZW1lbnQnKVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KCk7XG5cdFx0aWYgKGlzSFRNTEVsZW1lbnQoYWN0aXZlRWxlbWVudCkpIHtcblx0XHRcdGFjdGl2ZUVsZW1lbnQuYmx1cigpO1xuXHRcdH1cblx0fVxufVxuXG4vLyAtLS0gQWN0aW9ucyBSZWdpc3RyYXRpb25cblxucmVnaXN0ZXJBY3Rpb24yKE5ld1dpbmRvd0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoVG9nZ2xlRnVsbFNjcmVlbkFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoUXVpY2tQaWNrUmVjZW50QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuUmVjZW50QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihSZWxvYWRXaW5kb3dBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNob3dBYm91dERpYWxvZ0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoQmx1ckFjdGlvbik7XG5cbi8vIC0tLSBDb21tYW5kcy9LZXliaW5kaW5ncyBSZWdpc3RyYXRpb25cblxuY29uc3QgcmVjZW50RmlsZXNQaWNrZXJDb250ZXh0ID0gQ29udGV4dEtleUV4cHIuYW5kKGluUXVpY2tQaWNrQ29udGV4dCwgQ29udGV4dEtleUV4cHIuaGFzKGluUmVjZW50RmlsZXNQaWNrZXJDb250ZXh0S2V5KSk7XG5cbmNvbnN0IHF1aWNrUGlja05hdmlnYXRlTmV4dEluUmVjZW50RmlsZXNQaWNrZXJJZCA9ICd3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3Blbk5hdmlnYXRlTmV4dEluUmVjZW50RmlsZXNQaWNrZXInO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBxdWlja1BpY2tOYXZpZ2F0ZU5leHRJblJlY2VudEZpbGVzUGlja2VySWQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNTAsXG5cdGhhbmRsZXI6IGdldFF1aWNrTmF2aWdhdGVIYW5kbGVyKHF1aWNrUGlja05hdmlnYXRlTmV4dEluUmVjZW50RmlsZXNQaWNrZXJJZCwgdHJ1ZSksXG5cdHdoZW46IHJlY2VudEZpbGVzUGlja2VyQ29udGV4dCxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVIsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5UiB9XG59KTtcblxuY29uc3QgcXVpY2tQaWNrTmF2aWdhdGVQcmV2aW91c0luUmVjZW50RmlsZXNQaWNrZXIgPSAnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5OYXZpZ2F0ZVByZXZpb3VzSW5SZWNlbnRGaWxlc1BpY2tlcic7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IHF1aWNrUGlja05hdmlnYXRlUHJldmlvdXNJblJlY2VudEZpbGVzUGlja2VyLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUwLFxuXHRoYW5kbGVyOiBnZXRRdWlja05hdmlnYXRlSGFuZGxlcihxdWlja1BpY2tOYXZpZ2F0ZVByZXZpb3VzSW5SZWNlbnRGaWxlc1BpY2tlciwgZmFsc2UpLFxuXHR3aGVuOiByZWNlbnRGaWxlc1BpY2tlckNvbnRleHQsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlSLFxuXHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVIgfVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUNvbmZpcm1CZWZvcmVDbG9zZScsIGFjY2Vzc29yID0+IHtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3Qgc2V0dGluZyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8J2Fsd2F5cycgfCAna2V5Ym9hcmRPbmx5JyB8ICduZXZlcic+KCd3aW5kb3cuY29uZmlybUJlZm9yZUNsb3NlJykudXNlclZhbHVlO1xuXG5cdHJldHVybiBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnd2luZG93LmNvbmZpcm1CZWZvcmVDbG9zZScsIHNldHRpbmcgPT09ICduZXZlcicgPyAna2V5Ym9hcmRPbmx5JyA6ICduZXZlcicpO1xufSk7XG5cbi8vIC0tLSBNZW51IFJlZ2lzdHJhdGlvblxuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRncm91cDogJ3pfQ29uZmlybUNsb3NlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVDb25maXJtQmVmb3JlQ2xvc2UnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWlDb25maXJtQ2xvc2UnLCBcIkNvbmZpcm0gQmVmb3JlIENsb3NlXCIpLFxuXHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnY29uZmlnLndpbmRvdy5jb25maXJtQmVmb3JlQ2xvc2UnLCAnbmV2ZXInKVxuXHR9LFxuXHRvcmRlcjogMSxcblx0d2hlbjogSXNXZWJDb250ZXh0XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlPcGVuUmVjZW50JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIk9wZW4gJiZSZWNlbnRcIiksXG5cdHN1Ym1lbnU6IE1lbnVJZC5NZW51YmFyUmVjZW50TWVudSxcblx0Z3JvdXA6ICcyX29wZW4nLFxuXHRvcmRlcjogNCxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxVQUFVLGlCQUFpQjtBQUVwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGNBQWMsUUFBUSxTQUFTLHVCQUF1QjtBQUMvRCxTQUFTLFVBQVUsU0FBUyxjQUFjO0FBQzFDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsb0JBQW9CLHNCQUFzQixjQUFjLG9CQUFvQjtBQUNyRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBNEIsMEJBQXlFO0FBQ3JHLFNBQVMsMEJBQWdELHVCQUF1Qix5Q0FBeUM7QUFDekgsU0FBUyxlQUFlLGlCQUFpQjtBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFrQixnQkFBZ0IsbUJBQW1CLDBCQUEwQjtBQUUvRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGFBQWEsT0FBTyxpQkFBaUI7QUFDOUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0IsK0JBQStCO0FBQzVELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FB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
