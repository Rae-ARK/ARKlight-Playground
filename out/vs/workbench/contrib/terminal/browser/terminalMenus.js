import { Action, Separator, SubmenuAction } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Schemas } from "../../../../base/common/network.js";
import { localize, localize2 } from "../../../../nls.js";
import { MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { TerminalLocation, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { ResourceContextKey } from "../../../common/contextkeys.js";
import { TaskExecutionSupportedContext } from "../../tasks/common/taskService.js";
import { TerminalCommandId, TERMINAL_VIEW_ID } from "../common/terminal.js";
import { TerminalContextKeys, TerminalContextKeyStrings } from "../common/terminalContextKey.js";
import { terminalStrings } from "../common/terminalStrings.js";
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { HasSpeechProvider } from "../../speech/common/speechService.js";
import { hasKey } from "../../../../base/common/types.js";
import { TerminalContribContextKeyStrings } from "../terminalContribExports.js";
var TerminalContextMenuGroup = /* @__PURE__ */ ((TerminalContextMenuGroup2) => {
  TerminalContextMenuGroup2["Chat"] = "0_chat";
  TerminalContextMenuGroup2["Create"] = "1_create";
  TerminalContextMenuGroup2["Edit"] = "3_edit";
  TerminalContextMenuGroup2["Clear"] = "5_clear";
  TerminalContextMenuGroup2["Kill"] = "7_kill";
  TerminalContextMenuGroup2["Config"] = "9_config";
  return TerminalContextMenuGroup2;
})(TerminalContextMenuGroup || {});
var TerminalMenuBarGroup = /* @__PURE__ */ ((TerminalMenuBarGroup2) => {
  TerminalMenuBarGroup2["Create"] = "1_create";
  TerminalMenuBarGroup2["Run"] = "3_run";
  TerminalMenuBarGroup2["Manage"] = "5_manage";
  TerminalMenuBarGroup2["Configure"] = "7_configure";
  return TerminalMenuBarGroup2;
})(TerminalMenuBarGroup || {});
function setupTerminalMenus() {
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.MenubarTerminalMenu,
        item: {
          group: "1_create" /* Create */,
          command: {
            id: TerminalCommandId.New,
            title: localize({ key: "miNewTerminal", comment: ["&& denotes a mnemonic"] }, "&&New Terminal")
          },
          order: 1
        }
      },
      {
        id: MenuId.MenubarTerminalMenu,
        item: {
          group: "1_create" /* Create */,
          command: {
            id: TerminalCommandId.NewInNewWindow,
            title: localize({ key: "miNewInNewWindow", comment: ["&& denotes a mnemonic"] }, "New Terminal &&Window"),
            precondition: ContextKeyExpr.has(TerminalContextKeyStrings.IsOpen)
          },
          order: 2,
          when: TerminalContextKeys.processSupported
        }
      },
      {
        id: MenuId.MenubarTerminalMenu,
        item: {
          group: "1_create" /* Create */,
          command: {
            id: TerminalCommandId.Split,
            title: localize({ key: "miSplitTerminal", comment: ["&& denotes a mnemonic"] }, "&&Split Terminal"),
            precondition: ContextKeyExpr.has(TerminalContextKeyStrings.IsOpen)
          },
          order: 2,
          when: TerminalContextKeys.processSupported
        }
      },
      {
        id: MenuId.MenubarTerminalMenu,
        item: {
          group: "3_run" /* Run */,
          command: {
            id: TerminalCommandId.RunActiveFile,
            title: localize({ key: "miRunActiveFile", comment: ["&& denotes a mnemonic"] }, "Run &&Active File")
          },
          order: 3,
          when: TerminalContextKeys.processSupported
        }
      },
      {
        id: MenuId.MenubarTerminalMenu,
        item: {
          group: "3_run" /* Run */,
          command: {
            id: TerminalCommandId.RunSelectedText,
            title: localize({ key: "miRunSelectedText", comment: ["&& denotes a mnemonic"] }, "Run &&Selected Text")
          },
          order: 4,
          when: TerminalContextKeys.processSupported
        }
      }
    ]
  );
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.KillViewOrEditor,
            title: terminalStrings.kill.value
          },
          group: "7_kill" /* Kill */
        }
      },
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.CopySelection,
            title: localize("workbench.action.terminal.copySelection.short", "Copy")
          },
          group: "3_edit" /* Edit */,
          order: 1
        }
      },
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.CopySelectionAsHtml,
            title: localize("workbench.action.terminal.copySelectionAsHtml", "Copy as HTML")
          },
          group: "3_edit" /* Edit */,
          order: 2
        }
      },
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.Paste,
            title: localize("workbench.action.terminal.paste.short", "Paste")
          },
          group: "3_edit" /* Edit */,
          order: 3
        }
      },
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.Clear,
            title: localize("workbench.action.terminal.clear", "Clear")
          },
          group: "5_clear" /* Clear */
        }
      },
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.SizeToContentWidth,
            title: terminalStrings.toggleSizeToContentWidth
          },
          group: "9_config" /* Config */
        }
      },
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.SelectAll,
            title: localize("workbench.action.terminal.selectAll", "Select All")
          },
          group: "3_edit" /* Edit */,
          order: 3
        }
      }
    ]
  );
  MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, {
    command: {
      id: TerminalCommandId.CreateTerminalEditorSameGroup,
      title: terminalStrings.new
    },
    group: "1_zzz_file",
    order: 30,
    when: TerminalContextKeys.processSupported
  });
  MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, {
    command: {
      id: TerminalCommandId.CreateTerminalEditorSameGroup,
      title: terminalStrings.new
    },
    group: "1_zzz_file",
    order: 30,
    when: TerminalContextKeys.processSupported
  });
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          group: "1_create" /* Create */,
          command: {
            id: TerminalCommandId.Split,
            title: terminalStrings.split.value
          }
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.New,
            title: terminalStrings.new
          },
          group: "1_create" /* Create */
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.KillEditor,
            title: terminalStrings.kill.value
          },
          group: "7_kill" /* Kill */
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.CopySelection,
            title: localize("workbench.action.terminal.copySelection.short", "Copy")
          },
          group: "3_edit" /* Edit */,
          order: 1
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.CopySelectionAsHtml,
            title: localize("workbench.action.terminal.copySelectionAsHtml", "Copy as HTML")
          },
          group: "3_edit" /* Edit */,
          order: 2
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.Paste,
            title: localize("workbench.action.terminal.paste.short", "Paste")
          },
          group: "3_edit" /* Edit */,
          order: 3
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.Clear,
            title: localize("workbench.action.terminal.clear", "Clear")
          },
          group: "5_clear" /* Clear */
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.SelectAll,
            title: localize("workbench.action.terminal.selectAll", "Select All")
          },
          group: "3_edit" /* Edit */,
          order: 3
        }
      },
      {
        id: MenuId.TerminalEditorInstanceContext,
        item: {
          command: {
            id: TerminalCommandId.SizeToContentWidth,
            title: terminalStrings.toggleSizeToContentWidth
          },
          group: "9_config" /* Config */
        }
      }
    ]
  );
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.TerminalTabEmptyAreaContext,
        item: {
          command: {
            id: TerminalCommandId.NewWithProfile,
            title: localize("workbench.action.terminal.newWithProfile.short", "New Terminal With Profile...")
          },
          group: "1_create" /* Create */
        }
      },
      {
        id: MenuId.TerminalTabEmptyAreaContext,
        item: {
          command: {
            id: TerminalCommandId.New,
            title: terminalStrings.new
          },
          group: "1_create" /* Create */
        }
      }
    ]
  );
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.TerminalNewDropdownContext,
        item: {
          command: {
            id: TerminalCommandId.SelectDefaultProfile,
            title: localize2("workbench.action.terminal.selectDefaultProfile", "Select Default Profile")
          },
          group: "3_configure"
        }
      },
      {
        id: MenuId.TerminalNewDropdownContext,
        item: {
          command: {
            id: TerminalCommandId.ConfigureTerminalSettings,
            title: localize("workbench.action.terminal.openSettings", "Configure Terminal Settings")
          },
          group: "3_configure"
        }
      },
      {
        id: MenuId.TerminalNewDropdownContext,
        item: {
          command: {
            id: "workbench.action.tasks.runTask",
            title: localize("workbench.action.tasks.runTask", "Run Task...")
          },
          when: TaskExecutionSupportedContext,
          group: "4_tasks",
          order: 1
        }
      },
      {
        id: MenuId.TerminalNewDropdownContext,
        item: {
          command: {
            id: "workbench.action.tasks.configureTaskRunner",
            title: localize("workbench.action.tasks.configureTaskRunner", "Configure Tasks...")
          },
          when: TaskExecutionSupportedContext,
          group: "4_tasks",
          order: 2
        }
      }
    ]
  );
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.SwitchTerminal,
            title: localize2("workbench.action.terminal.switchTerminal", "Switch Terminal")
          },
          group: "navigation",
          order: 0,
          when: ContextKeyExpr.and(
            ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
            ContextKeyExpr.not(`config.${TerminalSettingId.TabsEnabled}`)
          )
        }
      },
      {
        // This is used to show instead of tabs when there is only a single terminal
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.Focus,
            title: terminalStrings.focus
          },
          alt: {
            id: TerminalCommandId.Split,
            title: terminalStrings.split.value,
            icon: Codicon.splitHorizontal
          },
          group: "navigation",
          order: 0,
          when: ContextKeyExpr.and(
            ContextKeyExpr.not(TerminalContribContextKeyStrings.ChatHasHiddenTerminals),
            ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
            ContextKeyExpr.has(`config.${TerminalSettingId.TabsEnabled}`),
            ContextKeyExpr.or(
              ContextKeyExpr.and(
                ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, "singleTerminal"),
                ContextKeyExpr.equals(TerminalContextKeyStrings.GroupCount, 1)
              ),
              ContextKeyExpr.and(
                ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, "singleTerminalOrNarrow"),
                ContextKeyExpr.or(
                  ContextKeyExpr.equals(TerminalContextKeyStrings.GroupCount, 1),
                  ContextKeyExpr.has(TerminalContextKeyStrings.TabsNarrow)
                )
              ),
              ContextKeyExpr.and(
                ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, "singleGroup"),
                ContextKeyExpr.equals(TerminalContextKeyStrings.GroupCount, 1)
              ),
              ContextKeyExpr.equals(`config.${TerminalSettingId.TabsShowActiveTerminal}`, "always")
            )
          )
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.Split,
            title: terminalStrings.split,
            icon: Codicon.splitHorizontal
          },
          group: "navigation",
          order: 2,
          when: TerminalContextKeys.shouldShowViewInlineActions
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.Kill,
            title: terminalStrings.kill,
            icon: Codicon.trash
          },
          group: "navigation",
          order: 3,
          when: TerminalContextKeys.shouldShowViewInlineActions
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.New,
            title: terminalStrings.new,
            icon: Codicon.plus
          },
          alt: {
            id: TerminalCommandId.Split,
            title: terminalStrings.split.value,
            icon: Codicon.splitHorizontal
          },
          group: "navigation",
          order: 0,
          when: ContextKeyExpr.and(
            ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
            ContextKeyExpr.or(TerminalContextKeys.webExtensionContributedProfile, TerminalContextKeys.processSupported)
          )
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.Clear,
            title: localize("workbench.action.terminal.clearLong", "Clear Terminal"),
            icon: Codicon.clearAll
          },
          group: "navigation",
          order: 6,
          when: ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
          isHiddenByDefault: true
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.RunActiveFile,
            title: localize("workbench.action.terminal.runActiveFile", "Run Active File"),
            icon: Codicon.run
          },
          group: "navigation",
          order: 7,
          when: ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
          isHiddenByDefault: true
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.RunSelectedText,
            title: localize("workbench.action.terminal.runSelectedText", "Run Selected Text"),
            icon: Codicon.selection
          },
          group: "navigation",
          order: 8,
          when: ContextKeyExpr.equals("view", TERMINAL_VIEW_ID),
          isHiddenByDefault: true
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.StartVoice,
            title: localize("workbench.action.terminal.startVoice", "Start Dictation")
          },
          group: "navigation",
          order: 9,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("view", TERMINAL_VIEW_ID), TerminalContextKeys.terminalDictationInProgress.toNegated()),
          isHiddenByDefault: true
        }
      },
      {
        id: MenuId.ViewTitle,
        item: {
          command: {
            id: TerminalCommandId.StopVoice,
            title: localize("workbench.action.terminal.stopVoice", "Stop Dictation")
          },
          group: "navigation",
          order: 9,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("view", TERMINAL_VIEW_ID), TerminalContextKeys.terminalDictationInProgress),
          isHiddenByDefault: true
        }
      }
    ]
  );
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.SplitActiveTab,
            title: terminalStrings.split.value
          },
          group: "1_create" /* Create */,
          order: 1
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.MoveToEditor,
            title: terminalStrings.moveToEditor.value
          },
          group: "1_create" /* Create */,
          order: 2
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.MoveIntoNewWindow,
            title: terminalStrings.moveIntoNewWindow.value
          },
          group: "1_create" /* Create */,
          order: 2
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.RenameActiveTab,
            title: localize("workbench.action.terminal.renameInstance", "Rename...")
          },
          group: "3_edit" /* Edit */
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.ChangeIconActiveTab,
            title: localize("workbench.action.terminal.changeIcon", "Change Icon...")
          },
          group: "3_edit" /* Edit */
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.ChangeColorActiveTab,
            title: localize("workbench.action.terminal.changeColor", "Change Color...")
          },
          group: "3_edit" /* Edit */
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.SizeToContentWidth,
            title: terminalStrings.toggleSizeToContentWidth
          },
          group: "3_edit" /* Edit */
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.JoinActiveTab,
            title: localize("workbench.action.terminal.joinInstance", "Join Terminals")
          },
          when: TerminalContextKeys.tabsSingularSelection.toNegated(),
          group: "9_config" /* Config */
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.Unsplit,
            title: terminalStrings.unsplit.value
          },
          when: ContextKeyExpr.and(TerminalContextKeys.tabsSingularSelection, TerminalContextKeys.splitTerminalTabFocused),
          group: "9_config" /* Config */
        }
      },
      {
        id: MenuId.TerminalTabContext,
        item: {
          command: {
            id: TerminalCommandId.KillActiveTab,
            title: terminalStrings.kill.value
          },
          group: "7_kill" /* Kill */
        }
      }
    ]
  );
  MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
    command: {
      id: TerminalCommandId.MoveToTerminalPanel,
      title: terminalStrings.moveToTerminalPanel
    },
    when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
    group: "2_files"
  });
  MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
    command: {
      id: TerminalCommandId.Rename,
      title: terminalStrings.rename
    },
    when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
    group: "2_files"
  });
  MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
    command: {
      id: TerminalCommandId.ChangeColor,
      title: terminalStrings.changeColor
    },
    when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
    group: "2_files"
  });
  MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
    command: {
      id: TerminalCommandId.ChangeIcon,
      title: terminalStrings.changeIcon
    },
    when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
    group: "2_files"
  });
  MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
    command: {
      id: TerminalCommandId.SizeToContentWidth,
      title: terminalStrings.toggleSizeToContentWidth
    },
    when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
    group: "2_files"
  });
  for (const menuId of [MenuId.EditorTitle, MenuId.CompactWindowEditorTitle]) {
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: TerminalCommandId.CreateTerminalEditorSameGroup,
        title: terminalStrings.new,
        icon: Codicon.plus
      },
      alt: {
        id: TerminalCommandId.Split,
        title: terminalStrings.split.value,
        icon: Codicon.splitHorizontal
      },
      group: "navigation",
      order: 0,
      when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal)
    });
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: TerminalCommandId.Clear,
        title: localize("workbench.action.terminal.clearLong", "Clear Terminal"),
        icon: Codicon.clearAll
      },
      group: "navigation",
      order: 6,
      when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
      isHiddenByDefault: true
    });
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: TerminalCommandId.RunActiveFile,
        title: localize("workbench.action.terminal.runActiveFile", "Run Active File"),
        icon: Codicon.run
      },
      group: "navigation",
      order: 7,
      when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
      isHiddenByDefault: true
    });
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: TerminalCommandId.RunSelectedText,
        title: localize("workbench.action.terminal.runSelectedText", "Run Selected Text"),
        icon: Codicon.selection
      },
      group: "navigation",
      order: 8,
      when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
      isHiddenByDefault: true
    });
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: TerminalCommandId.StartVoice,
        title: localize("workbench.action.terminal.startVoiceEditor", "Start Dictation"),
        icon: Codicon.mic
      },
      group: "navigation",
      order: 9,
      when: ContextKeyExpr.and(ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal), TerminalContextKeys.terminalDictationInProgress.negate()),
      isHiddenByDefault: true
    });
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: TerminalCommandId.StopVoice,
        title: localize("workbench.action.terminal.stopVoiceEditor", "Stop Dictation"),
        icon: Codicon.run
      },
      group: "navigation",
      order: 10,
      when: ContextKeyExpr.and(ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal), HasSpeechProvider, TerminalContextKeys.terminalDictationInProgress),
      isHiddenByDefault: true
    });
  }
}
function getTerminalActionBarArgs(location, profiles, defaultProfileName, contributedProfiles, terminalService, dropdownMenu, disposableStore) {
  profiles = profiles.filter((e) => !e.isAutoDetected);
  const [aiProfiles, otherProfiles] = splitProfiles(profiles);
  const [aiContributedProfiles, otherContributedProfiles] = splitContributedProfiles(contributedProfiles);
  const dropdownActions = [];
  const submenuActions = [];
  const splitLocation = location === TerminalLocation.Editor || typeof location === "object" && hasKey(location, { viewColumn: true }) && location.viewColumn === ACTIVE_GROUP ? { viewColumn: SIDE_GROUP } : { splitActiveTerminal: true };
  if (location === TerminalLocation.Editor) {
    location = { viewColumn: ACTIVE_GROUP };
  }
  dropdownActions.push(disposableStore.add(new Action(TerminalCommandId.New, terminalStrings.new, void 0, true, () => terminalService.createAndFocusTerminal())));
  dropdownActions.push(disposableStore.add(new Action(TerminalCommandId.NewInNewWindow, terminalStrings.newInNewWindow.value, void 0, true, () => terminalService.createAndFocusTerminal({
    location: {
      viewColumn: AUX_WINDOW_GROUP,
      auxiliary: { compact: true }
    }
  }))));
  dropdownActions.push(disposableStore.add(new Action(TerminalCommandId.Split, terminalStrings.split.value, void 0, true, () => terminalService.createAndFocusTerminal({
    location: splitLocation
  }))));
  dropdownActions.push(new Separator());
  for (const p of aiProfiles) {
    addProfileActions(p, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore);
  }
  for (const contributed of aiContributedProfiles) {
    addContributedProfileActions(contributed, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore);
  }
  if ((aiProfiles.length > 0 || aiContributedProfiles.length > 0) && (otherProfiles.length > 0 || otherContributedProfiles.length > 0)) {
    dropdownActions.push(new Separator());
  }
  for (const p of otherProfiles) {
    addProfileActions(p, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore);
  }
  for (const contributed of otherContributedProfiles) {
    addContributedProfileActions(contributed, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore);
  }
  if (dropdownActions.length > 0) {
    dropdownActions.push(new SubmenuAction("split.profile", localize("split.profile", "Split Terminal with Profile"), submenuActions));
    dropdownActions.push(new Separator());
  }
  const actions = dropdownMenu.getActions();
  dropdownActions.push(...Separator.join(...actions.map((a) => a[1])));
  const dropdownAction = disposableStore.add(new Action("refresh profiles", localize("launchProfile", "Launch Profile..."), "codicon-chevron-down", true));
  return { dropdownAction, dropdownMenuActions: dropdownActions, className: `terminal-tab-actions-${terminalService.resolveLocation(location)}` };
}
function splitProfiles(profiles) {
  const aiProfiles = [];
  const otherProfiles = [];
  for (const profile of profiles) {
    if (isAiProfileName(profile.profileName)) {
      aiProfiles.push(profile);
    } else {
      otherProfiles.push(profile);
    }
  }
  return [aiProfiles, otherProfiles];
}
function splitContributedProfiles(contributedProfiles) {
  const aiContributedProfiles = [];
  const otherContributedProfiles = [];
  for (const profile of contributedProfiles) {
    if (isAiContributedProfile(profile)) {
      aiContributedProfiles.push(profile);
    } else {
      otherContributedProfiles.push(profile);
    }
  }
  return [aiContributedProfiles, otherContributedProfiles];
}
function isAiContributedProfile(profile) {
  const extensionIdentifier = profile.extensionIdentifier.toLowerCase();
  if (extensionIdentifier === "github.copilot-chat" || extensionIdentifier === "anthropic.claude-code") {
    return true;
  }
  return isAiProfileName(profile.title);
}
function isAiProfileName(name) {
  const lowerCaseName = name.toLowerCase();
  return lowerCaseName.includes("copilot") || lowerCaseName.includes("claude");
}
function addProfileActions(profile, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore) {
  const isDefault = profile.profileName === defaultProfileName;
  const options = { config: profile, location };
  const splitOptions = { config: profile, location: splitLocation };
  const sanitizedProfileName = profile.profileName.replace(/[\n\r\t]/g, "");
  dropdownActions.push(disposableStore.add(new Action(TerminalCommandId.NewWithProfile, isDefault ? localize("defaultTerminalProfile", "{0} (Default)", sanitizedProfileName) : sanitizedProfileName, void 0, true, async () => {
    await terminalService.createAndFocusTerminal(options);
  })));
  submenuActions.push(disposableStore.add(new Action(TerminalCommandId.Split, isDefault ? localize("defaultTerminalProfile", "{0} (Default)", sanitizedProfileName) : sanitizedProfileName, void 0, true, async () => {
    await terminalService.createAndFocusTerminal(splitOptions);
  })));
}
function addContributedProfileActions(contributed, defaultProfileName, location, splitLocation, terminalService, dropdownActions, submenuActions, disposableStore) {
  const isDefault = contributed.title === defaultProfileName;
  const title = isDefault ? localize("defaultTerminalProfile", "{0} (Default)", contributed.title.replace(/[\n\r\t]/g, "")) : contributed.title.replace(/[\n\r\t]/g, "");
  dropdownActions.push(disposableStore.add(new Action("contributed", title, void 0, true, () => terminalService.createAndFocusTerminal({
    config: {
      extensionIdentifier: contributed.extensionIdentifier,
      id: contributed.id,
      title
    },
    location
  }))));
  submenuActions.push(disposableStore.add(new Action("contributed-split", title, void 0, true, () => terminalService.createAndFocusTerminal({
    config: {
      extensionIdentifier: contributed.extensionIdentifier,
      id: contributed.id,
      title
    },
    location: splitLocation
  }))));
}
export {
  TerminalContextMenuGroup,
  TerminalMenuBarGroup,
  getTerminalActionBarArgs,
  setupTerminalMenus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxNZW51cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTWVudSwgTWVudUlkLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlLCBJVGVybWluYWxQcm9maWxlLCBUZXJtaW5hbExvY2F0aW9uLCBUZXJtaW5hbFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQgfSBmcm9tICcuLi8uLi90YXNrcy9jb21tb24vdGFza1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNyZWF0ZVRlcm1pbmFsT3B0aW9ucywgSVRlcm1pbmFsTG9jYXRpb25PcHRpb25zLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbW1hbmRJZCwgVEVSTUlOQUxfVklFV19JRCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbnRleHRLZXlzLCBUZXJtaW5hbENvbnRleHRLZXlTdHJpbmdzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsQ29udGV4dEtleS5qcyc7XG5pbXBvcnQgeyB0ZXJtaW5hbFN0cmluZ3MgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxTdHJpbmdzLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgQVVYX1dJTkRPV19HUk9VUCwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSGFzU3BlZWNoUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9zcGVlY2gvY29tbW9uL3NwZWVjaFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb250cmliQ29udGV4dEtleVN0cmluZ3MgfSBmcm9tICcuLi90ZXJtaW5hbENvbnRyaWJFeHBvcnRzLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gVGVybWluYWxDb250ZXh0TWVudUdyb3VwIHtcblx0Q2hhdCA9ICcwX2NoYXQnLFxuXHRDcmVhdGUgPSAnMV9jcmVhdGUnLFxuXHRFZGl0ID0gJzNfZWRpdCcsXG5cdENsZWFyID0gJzVfY2xlYXInLFxuXHRLaWxsID0gJzdfa2lsbCcsXG5cdENvbmZpZyA9ICc5X2NvbmZpZydcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gVGVybWluYWxNZW51QmFyR3JvdXAge1xuXHRDcmVhdGUgPSAnMV9jcmVhdGUnLFxuXHRSdW4gPSAnM19ydW4nLFxuXHRNYW5hZ2UgPSAnNV9tYW5hZ2UnLFxuXHRDb25maWd1cmUgPSAnN19jb25maWd1cmUnXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXR1cFRlcm1pbmFsTWVudXMoKTogdm9pZCB7XG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbXMoXG5cdFx0W1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJUZXJtaW5hbE1lbnUsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxNZW51QmFyR3JvdXAuQ3JlYXRlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5OZXcsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU5ld1Rlcm1pbmFsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTmV3IFRlcm1pbmFsXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJUZXJtaW5hbE1lbnUsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxNZW51QmFyR3JvdXAuQ3JlYXRlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5OZXdJbk5ld1dpbmRvdyxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pTmV3SW5OZXdXaW5kb3cnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiTmV3IFRlcm1pbmFsICYmV2luZG93XCIpLFxuXHRcdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5oYXMoVGVybWluYWxDb250ZXh0S2V5U3RyaW5ncy5Jc09wZW4pXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHR3aGVuOiBUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWRcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyVGVybWluYWxNZW51LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsTWVudUJhckdyb3VwLkNyZWF0ZSxcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU3BsaXQsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVNwbGl0VGVybWluYWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTcGxpdCBUZXJtaW5hbFwiKSxcblx0XHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuaGFzKFRlcm1pbmFsQ29udGV4dEtleVN0cmluZ3MuSXNPcGVuKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdFx0d2hlbjogVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhclRlcm1pbmFsTWVudSxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbE1lbnVCYXJHcm91cC5SdW4sXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlJ1bkFjdGl2ZUZpbGUsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVJ1bkFjdGl2ZUZpbGUnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiUnVuICYmQWN0aXZlIEZpbGVcIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJUZXJtaW5hbE1lbnUsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxNZW51QmFyR3JvdXAuUnVuLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5SdW5TZWxlY3RlZFRleHQsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVJ1blNlbGVjdGVkVGV4dCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJSdW4gJiZTZWxlY3RlZCBUZXh0XCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0XHR3aGVuOiBUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWRcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRdXG5cdCk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtcyhcblx0XHRbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxJbnN0YW5jZUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuS2lsbFZpZXdPckVkaXRvcixcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Mua2lsbC52YWx1ZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuS2lsbFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsSW5zdGFuY2VDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNvcHlTZWxlY3Rpb24sXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY29weVNlbGVjdGlvbi5zaG9ydCcsIFwiQ29weVwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5FZGl0LFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxJbnN0YW5jZUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ29weVNlbGVjdGlvbkFzSHRtbCxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jb3B5U2VsZWN0aW9uQXNIdG1sJywgXCJDb3B5IGFzIEhUTUxcIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuRWRpdCxcblx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsSW5zdGFuY2VDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlBhc3RlLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnBhc3RlLnNob3J0JywgXCJQYXN0ZVwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5FZGl0LFxuXHRcdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxJbnN0YW5jZUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ2xlYXIsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2xlYXInLCBcIkNsZWFyXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkNsZWFyLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsSW5zdGFuY2VDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNpemVUb0NvbnRlbnRXaWR0aCxcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MudG9nZ2xlU2l6ZVRvQ29udGVudFdpZHRoXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkNvbmZpZ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxJbnN0YW5jZUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2VsZWN0QWxsLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNlbGVjdEFsbCcsIFwiU2VsZWN0IEFsbFwiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuRWRpdCxcblx0XHRcdFx0XHRvcmRlcjogM1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdF1cblx0KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRhYnNCYXJDb250ZXh0LCB7XG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNyZWF0ZVRlcm1pbmFsRWRpdG9yU2FtZUdyb3VwLFxuXHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5uZXdcblx0XHR9LFxuXHRcdGdyb3VwOiAnMV96enpfZmlsZScsXG5cdFx0b3JkZXI6IDMwLFxuXHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZFxuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVtcHR5RWRpdG9yR3JvdXBDb250ZXh0LCB7XG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNyZWF0ZVRlcm1pbmFsRWRpdG9yU2FtZUdyb3VwLFxuXHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5uZXdcblx0XHR9LFxuXHRcdGdyb3VwOiAnMV96enpfZmlsZScsXG5cdFx0b3JkZXI6IDMwLFxuXHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZFxuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW1zKFxuXHRcdFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbEVkaXRvckluc3RhbmNlQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuQ3JlYXRlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TcGxpdCxcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Muc3BsaXQudmFsdWVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxFZGl0b3JJbnN0YW5jZUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuTmV3LFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5uZXdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuQ3JlYXRlXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxFZGl0b3JJbnN0YW5jZUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuS2lsbEVkaXRvcixcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Mua2lsbC52YWx1ZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5LaWxsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxFZGl0b3JJbnN0YW5jZUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ29weVNlbGVjdGlvbixcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jb3B5U2VsZWN0aW9uLnNob3J0JywgXCJDb3B5XCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkVkaXQsXG5cdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbEVkaXRvckluc3RhbmNlQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Db3B5U2VsZWN0aW9uQXNIdG1sLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNvcHlTZWxlY3Rpb25Bc0h0bWwnLCBcIkNvcHkgYXMgSFRNTFwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5FZGl0LFxuXHRcdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxFZGl0b3JJbnN0YW5jZUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUGFzdGUsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucGFzdGUuc2hvcnQnLCBcIlBhc3RlXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkVkaXQsXG5cdFx0XHRcdFx0b3JkZXI6IDNcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbEVkaXRvckluc3RhbmNlQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5DbGVhcixcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jbGVhcicsIFwiQ2xlYXJcIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuQ2xlYXIsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxFZGl0b3JJbnN0YW5jZUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2VsZWN0QWxsLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNlbGVjdEFsbCcsIFwiU2VsZWN0IEFsbFwiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuRWRpdCxcblx0XHRcdFx0XHRvcmRlcjogM1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsRWRpdG9ySW5zdGFuY2VDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNpemVUb0NvbnRlbnRXaWR0aCxcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MudG9nZ2xlU2l6ZVRvQ29udGVudFdpZHRoXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkNvbmZpZ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XVxuXHQpO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbXMoXG5cdFx0W1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsVGFiRW1wdHlBcmVhQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5OZXdXaXRoUHJvZmlsZSxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5uZXdXaXRoUHJvZmlsZS5zaG9ydCcsIFwiTmV3IFRlcm1pbmFsIFdpdGggUHJvZmlsZS4uLlwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5DcmVhdGVcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbFRhYkVtcHR5QXJlYUNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuTmV3LFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5uZXdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuQ3JlYXRlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRdXG5cdCk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtcyhcblx0XHRbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxOZXdEcm9wZG93bkNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2VsZWN0RGVmYXVsdFByb2ZpbGUsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNlbGVjdERlZmF1bHRQcm9maWxlJywgJ1NlbGVjdCBEZWZhdWx0IFByb2ZpbGUnKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiAnM19jb25maWd1cmUnXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxOZXdEcm9wZG93bkNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ29uZmlndXJlVGVybWluYWxTZXR0aW5ncyxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5vcGVuU2V0dGluZ3MnLCBcIkNvbmZpZ3VyZSBUZXJtaW5hbCBTZXR0aW5nc1wiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6ICczX2NvbmZpZ3VyZSdcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbE5ld0Ryb3Bkb3duQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5ydW5UYXNrJyxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5ydW5UYXNrJywgXCJSdW4gVGFzay4uLlwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQsXG5cdFx0XHRcdFx0Z3JvdXA6ICc0X3Rhc2tzJyxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbE5ld0Ryb3Bkb3duQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5jb25maWd1cmVUYXNrUnVubmVyJyxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5jb25maWd1cmVUYXNrUnVubmVyJywgXCJDb25maWd1cmUgVGFza3MuLi5cIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0LFxuXHRcdFx0XHRcdGdyb3VwOiAnNF90YXNrcycsXG5cdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHRdXG5cdCk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtcyhcblx0XHRbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlN3aXRjaFRlcm1pbmFsLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zd2l0Y2hUZXJtaW5hbCcsICdTd2l0Y2ggVGVybWluYWwnKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBURVJNSU5BTF9WSUVXX0lEKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdChgY29uZmlnLiR7VGVybWluYWxTZXR0aW5nSWQuVGFic0VuYWJsZWR9YClcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHQvLyBUaGlzIGlzIHVzZWQgdG8gc2hvdyBpbnN0ZWFkIG9mIHRhYnMgd2hlbiB0aGVyZSBpcyBvbmx5IGEgc2luZ2xlIHRlcm1pbmFsXG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkZvY3VzLFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5mb2N1c1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YWx0OiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU3BsaXQsXG5cdFx0XHRcdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLnNwbGl0LnZhbHVlLFxuXHRcdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5zcGxpdEhvcml6b250YWxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90KFRlcm1pbmFsQ29udHJpYkNvbnRleHRLZXlTdHJpbmdzLkNoYXRIYXNIaWRkZW5UZXJtaW5hbHMpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVEVSTUlOQUxfVklFV19JRCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoYGNvbmZpZy4ke1Rlcm1pbmFsU2V0dGluZ0lkLlRhYnNFbmFibGVkfWApLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1Rlcm1pbmFsU2V0dGluZ0lkLlRhYnNTaG93QWN0aXZlVGVybWluYWx9YCwgJ3NpbmdsZVRlcm1pbmFsJyksXG5cdFx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKFRlcm1pbmFsQ29udGV4dEtleVN0cmluZ3MuR3JvdXBDb3VudCwgMSlcblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7VGVybWluYWxTZXR0aW5nSWQuVGFic1Nob3dBY3RpdmVUZXJtaW5hbH1gLCAnc2luZ2xlVGVybWluYWxPck5hcnJvdycpLFxuXHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKFRlcm1pbmFsQ29udGV4dEtleVN0cmluZ3MuR3JvdXBDb3VudCwgMSksXG5cdFx0XHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoVGVybWluYWxDb250ZXh0S2V5U3RyaW5ncy5UYWJzTmFycm93KVxuXHRcdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7VGVybWluYWxTZXR0aW5nSWQuVGFic1Nob3dBY3RpdmVUZXJtaW5hbH1gLCAnc2luZ2xlR3JvdXAnKSxcblx0XHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoVGVybWluYWxDb250ZXh0S2V5U3RyaW5ncy5Hcm91cENvdW50LCAxKVxuXHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1Rlcm1pbmFsU2V0dGluZ0lkLlRhYnNTaG93QWN0aXZlVGVybWluYWx9YCwgJ2Fsd2F5cycpXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU3BsaXQsXG5cdFx0XHRcdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLnNwbGl0LFxuXHRcdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5zcGxpdEhvcml6b250YWxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdFx0d2hlbjogVGVybWluYWxDb250ZXh0S2V5cy5zaG91bGRTaG93Vmlld0lubGluZUFjdGlvbnNcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuS2lsbCxcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Mua2lsbCxcblx0XHRcdFx0XHRcdGljb246IENvZGljb24udHJhc2hcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdFx0d2hlbjogVGVybWluYWxDb250ZXh0S2V5cy5zaG91bGRTaG93Vmlld0lubGluZUFjdGlvbnNcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuTmV3LFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5uZXcsXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnBsdXNcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFsdDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNwbGl0LFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5zcGxpdC52YWx1ZSxcblx0XHRcdFx0XHRcdGljb246IENvZGljb24uc3BsaXRIb3Jpem9udGFsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRFUk1JTkFMX1ZJRVdfSUQpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoVGVybWluYWxDb250ZXh0S2V5cy53ZWJFeHRlbnNpb25Db250cmlidXRlZFByb2ZpbGUsIFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZClcblx0XHRcdFx0XHQpXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNsZWFyLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNsZWFyTG9uZycsIFwiQ2xlYXIgVGVybWluYWxcIiksXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmNsZWFyQWxsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiA2LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRFUk1JTkFMX1ZJRVdfSUQpLFxuXHRcdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlJ1bkFjdGl2ZUZpbGUsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucnVuQWN0aXZlRmlsZScsIFwiUnVuIEFjdGl2ZSBGaWxlXCIpLFxuXHRcdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5ydW5cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDcsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVEVSTUlOQUxfVklFV19JRCksXG5cdFx0XHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUnVuU2VsZWN0ZWRUZXh0LFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJ1blNlbGVjdGVkVGV4dCcsIFwiUnVuIFNlbGVjdGVkIFRleHRcIiksXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnNlbGVjdGlvblxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogOCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBURVJNSU5BTF9WSUVXX0lEKSxcblx0XHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU3RhcnRWb2ljZSxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zdGFydFZvaWNlJywgXCJTdGFydCBEaWN0YXRpb25cIiksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiA5LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBURVJNSU5BTF9WSUVXX0lEKSwgVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbERpY3RhdGlvbkluUHJvZ3Jlc3MudG9OZWdhdGVkKCkpLFxuXHRcdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TdG9wVm9pY2UsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc3RvcFZvaWNlJywgXCJTdG9wIERpY3RhdGlvblwiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDksXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRFUk1JTkFMX1ZJRVdfSUQpLCBUZXJtaW5hbENvbnRleHRLZXlzLnRlcm1pbmFsRGljdGF0aW9uSW5Qcm9ncmVzcyksXG5cdFx0XHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XVxuXHQpO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbXMoXG5cdFx0W1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsVGFiQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5TcGxpdEFjdGl2ZVRhYixcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Muc3BsaXQudmFsdWUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkNyZWF0ZSxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsVGFiQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Nb3ZlVG9FZGl0b3IsXG5cdFx0XHRcdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLm1vdmVUb0VkaXRvci52YWx1ZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5DcmVhdGUsXG5cdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbFRhYkNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuTW92ZUludG9OZXdXaW5kb3csXG5cdFx0XHRcdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLm1vdmVJbnRvTmV3V2luZG93LnZhbHVlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkNyZWF0ZSxcblx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsVGFiQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5SZW5hbWVBY3RpdmVUYWIsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVuYW1lSW5zdGFuY2UnLCBcIlJlbmFtZS4uLlwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5FZGl0XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxUYWJDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNoYW5nZUljb25BY3RpdmVUYWIsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2hhbmdlSWNvbicsIFwiQ2hhbmdlIEljb24uLi5cIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuRWRpdFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsVGFiQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5DaGFuZ2VDb2xvckFjdGl2ZVRhYixcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGFuZ2VDb2xvcicsIFwiQ2hhbmdlIENvbG9yLi4uXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogVGVybWluYWxDb250ZXh0TWVudUdyb3VwLkVkaXRcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbFRhYkNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuU2l6ZVRvQ29udGVudFdpZHRoLFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy50b2dnbGVTaXplVG9Db250ZW50V2lkdGhcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuRWRpdFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlRlcm1pbmFsVGFiQ29udGV4dCxcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbENvbW1hbmRJZC5Kb2luQWN0aXZlVGFiLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmpvaW5JbnN0YW5jZScsIFwiSm9pbiBUZXJtaW5hbHNcIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMudGFic1Npbmd1bGFyU2VsZWN0aW9uLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdGdyb3VwOiBUZXJtaW5hbENvbnRleHRNZW51R3JvdXAuQ29uZmlnXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVybWluYWxUYWJDb250ZXh0LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlVuc3BsaXQsXG5cdFx0XHRcdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLnVuc3BsaXQudmFsdWVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChUZXJtaW5hbENvbnRleHRLZXlzLnRhYnNTaW5ndWxhclNlbGVjdGlvbiwgVGVybWluYWxDb250ZXh0S2V5cy5zcGxpdFRlcm1pbmFsVGFiRm9jdXNlZCksXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5Db25maWdcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbFRhYkNvbnRleHQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuS2lsbEFjdGl2ZVRhYixcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3Mua2lsbC52YWx1ZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5LaWxsLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XVxuXHQpO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7XG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLk1vdmVUb1Rlcm1pbmFsUGFuZWwsXG5cdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLm1vdmVUb1Rlcm1pbmFsUGFuZWxcblx0XHR9LFxuXHRcdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlVGVybWluYWwpLFxuXHRcdGdyb3VwOiAnMl9maWxlcydcblx0fSk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHtcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuUmVuYW1lLFxuXHRcdFx0dGl0bGU6IHRlcm1pbmFsU3RyaW5ncy5yZW5hbWVcblx0XHR9LFxuXHRcdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlVGVybWluYWwpLFxuXHRcdGdyb3VwOiAnMl9maWxlcydcblx0fSk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHtcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ2hhbmdlQ29sb3IsXG5cdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLmNoYW5nZUNvbG9yXG5cdFx0fSxcblx0XHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnZzY29kZVRlcm1pbmFsKSxcblx0XHRncm91cDogJzJfZmlsZXMnXG5cdH0pO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7XG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLkNoYW5nZUljb24sXG5cdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLmNoYW5nZUljb25cblx0XHR9LFxuXHRcdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlVGVybWluYWwpLFxuXHRcdGdyb3VwOiAnMl9maWxlcydcblx0fSk7XG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7XG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNpemVUb0NvbnRlbnRXaWR0aCxcblx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MudG9nZ2xlU2l6ZVRvQ29udGVudFdpZHRoXG5cdFx0fSxcblx0XHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnZzY29kZVRlcm1pbmFsKSxcblx0XHRncm91cDogJzJfZmlsZXMnXG5cdH0pO1xuXG5cdGZvciAoY29uc3QgbWVudUlkIG9mIFtNZW51SWQuRWRpdG9yVGl0bGUsIE1lbnVJZC5Db21wYWN0V2luZG93RWRpdG9yVGl0bGVdKSB7XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ3JlYXRlVGVybWluYWxFZGl0b3JTYW1lR3JvdXAsXG5cdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbFN0cmluZ3MubmV3LFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnBsdXNcblx0XHRcdH0sXG5cdFx0XHRhbHQ6IHtcblx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlNwbGl0LFxuXHRcdFx0XHR0aXRsZTogdGVybWluYWxTdHJpbmdzLnNwbGl0LnZhbHVlLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNwbGl0SG9yaXpvbnRhbFxuXHRcdFx0fSxcblx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRvcmRlcjogMCxcblx0XHRcdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlVGVybWluYWwpXG5cdFx0fSk7XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogVGVybWluYWxDb21tYW5kSWQuQ2xlYXIsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jbGVhckxvbmcnLCBcIkNsZWFyIFRlcm1pbmFsXCIpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNsZWFyQWxsXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiA2LFxuXHRcdFx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVUZXJtaW5hbCksXG5cdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdH0pO1xuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlJ1bkFjdGl2ZUZpbGUsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5ydW5BY3RpdmVGaWxlJywgXCJSdW4gQWN0aXZlIEZpbGVcIiksXG5cdFx0XHRcdGljb246IENvZGljb24ucnVuXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiA3LFxuXHRcdFx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVUZXJtaW5hbCksXG5cdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdH0pO1xuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlJ1blNlbGVjdGVkVGV4dCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJ1blNlbGVjdGVkVGV4dCcsIFwiUnVuIFNlbGVjdGVkIFRleHRcIiksXG5cdFx0XHRcdGljb246IENvZGljb24uc2VsZWN0aW9uXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiA4LFxuXHRcdFx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVUZXJtaW5hbCksXG5cdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdH0pO1xuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlN0YXJ0Vm9pY2UsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zdGFydFZvaWNlRWRpdG9yJywgXCJTdGFydCBEaWN0YXRpb25cIiksXG5cdFx0XHRcdGljb246IENvZGljb24ubWljXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiA5LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlVGVybWluYWwpLCBUZXJtaW5hbENvbnRleHRLZXlzLnRlcm1pbmFsRGljdGF0aW9uSW5Qcm9ncmVzcy5uZWdhdGUoKSksXG5cdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdH0pO1xuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IFRlcm1pbmFsQ29tbWFuZElkLlN0b3BWb2ljZSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnN0b3BWb2ljZUVkaXRvcicsIFwiU3RvcCBEaWN0YXRpb25cIiksXG5cdFx0XHRcdGljb246IENvZGljb24ucnVuXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnZzY29kZVRlcm1pbmFsKSwgSGFzU3BlZWNoUHJvdmlkZXIsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxEaWN0YXRpb25JblByb2dyZXNzKSxcblx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRlcm1pbmFsQWN0aW9uQmFyQXJncyhsb2NhdGlvbjogSVRlcm1pbmFsTG9jYXRpb25PcHRpb25zLCBwcm9maWxlczogSVRlcm1pbmFsUHJvZmlsZVtdLCBkZWZhdWx0UHJvZmlsZU5hbWU6IHN0cmluZywgY29udHJpYnV0ZWRQcm9maWxlczogcmVhZG9ubHkgSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZVtdLCB0ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsIGRyb3Bkb3duTWVudTogSU1lbnUsIGRpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlKToge1xuXHRkcm9wZG93bkFjdGlvbjogSUFjdGlvbjtcblx0ZHJvcGRvd25NZW51QWN0aW9uczogSUFjdGlvbltdO1xuXHRjbGFzc05hbWU6IHN0cmluZztcblx0ZHJvcGRvd25JY29uPzogc3RyaW5nO1xufSB7XG5cdHByb2ZpbGVzID0gcHJvZmlsZXMuZmlsdGVyKGUgPT4gIWUuaXNBdXRvRGV0ZWN0ZWQpO1xuXHRjb25zdCBbYWlQcm9maWxlcywgb3RoZXJQcm9maWxlc10gPSBzcGxpdFByb2ZpbGVzKHByb2ZpbGVzKTtcblx0Y29uc3QgW2FpQ29udHJpYnV0ZWRQcm9maWxlcywgb3RoZXJDb250cmlidXRlZFByb2ZpbGVzXSA9IHNwbGl0Q29udHJpYnV0ZWRQcm9maWxlcyhjb250cmlidXRlZFByb2ZpbGVzKTtcblx0Y29uc3QgZHJvcGRvd25BY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0Y29uc3Qgc3VibWVudUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRjb25zdCBzcGxpdExvY2F0aW9uID0gKGxvY2F0aW9uID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvciB8fCAodHlwZW9mIGxvY2F0aW9uID09PSAnb2JqZWN0JyAmJiBoYXNLZXkobG9jYXRpb24sIHsgdmlld0NvbHVtbjogdHJ1ZSB9KSAmJiBsb2NhdGlvbi52aWV3Q29sdW1uID09PSBBQ1RJVkVfR1JPVVApKSA/IHsgdmlld0NvbHVtbjogU0lERV9HUk9VUCB9IDogeyBzcGxpdEFjdGl2ZVRlcm1pbmFsOiB0cnVlIH07XG5cblx0aWYgKGxvY2F0aW9uID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdGxvY2F0aW9uID0geyB2aWV3Q29sdW1uOiBBQ1RJVkVfR1JPVVAgfTtcblx0fVxuXG5cdGRyb3Bkb3duQWN0aW9ucy5wdXNoKGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEFjdGlvbihUZXJtaW5hbENvbW1hbmRJZC5OZXcsIHRlcm1pbmFsU3RyaW5ncy5uZXcsIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gdGVybWluYWxTZXJ2aWNlLmNyZWF0ZUFuZEZvY3VzVGVybWluYWwoKSkpKTtcblx0ZHJvcGRvd25BY3Rpb25zLnB1c2goZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgQWN0aW9uKFRlcm1pbmFsQ29tbWFuZElkLk5ld0luTmV3V2luZG93LCB0ZXJtaW5hbFN0cmluZ3MubmV3SW5OZXdXaW5kb3cudmFsdWUsIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gdGVybWluYWxTZXJ2aWNlLmNyZWF0ZUFuZEZvY3VzVGVybWluYWwoe1xuXHRcdGxvY2F0aW9uOiB7XG5cdFx0XHR2aWV3Q29sdW1uOiBBVVhfV0lORE9XX0dST1VQLFxuXHRcdFx0YXV4aWxpYXJ5OiB7IGNvbXBhY3Q6IHRydWUgfSxcblx0XHR9XG5cdH0pKSkpO1xuXHRkcm9wZG93bkFjdGlvbnMucHVzaChkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oVGVybWluYWxDb21tYW5kSWQuU3BsaXQsIHRlcm1pbmFsU3RyaW5ncy5zcGxpdC52YWx1ZSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0ZXJtaW5hbFNlcnZpY2UuY3JlYXRlQW5kRm9jdXNUZXJtaW5hbCh7XG5cdFx0bG9jYXRpb246IHNwbGl0TG9jYXRpb25cblx0fSkpKSk7XG5cdGRyb3Bkb3duQWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdGZvciAoY29uc3QgcCBvZiBhaVByb2ZpbGVzKSB7XG5cdFx0YWRkUHJvZmlsZUFjdGlvbnMocCwgZGVmYXVsdFByb2ZpbGVOYW1lLCBsb2NhdGlvbiwgc3BsaXRMb2NhdGlvbiwgdGVybWluYWxTZXJ2aWNlLCBkcm9wZG93bkFjdGlvbnMsIHN1Ym1lbnVBY3Rpb25zLCBkaXNwb3NhYmxlU3RvcmUpO1xuXHR9XG5cdGZvciAoY29uc3QgY29udHJpYnV0ZWQgb2YgYWlDb250cmlidXRlZFByb2ZpbGVzKSB7XG5cdFx0YWRkQ29udHJpYnV0ZWRQcm9maWxlQWN0aW9ucyhjb250cmlidXRlZCwgZGVmYXVsdFByb2ZpbGVOYW1lLCBsb2NhdGlvbiwgc3BsaXRMb2NhdGlvbiwgdGVybWluYWxTZXJ2aWNlLCBkcm9wZG93bkFjdGlvbnMsIHN1Ym1lbnVBY3Rpb25zLCBkaXNwb3NhYmxlU3RvcmUpO1xuXHR9XG5cdGlmICgoYWlQcm9maWxlcy5sZW5ndGggPiAwIHx8IGFpQ29udHJpYnV0ZWRQcm9maWxlcy5sZW5ndGggPiAwKSAmJiAob3RoZXJQcm9maWxlcy5sZW5ndGggPiAwIHx8IG90aGVyQ29udHJpYnV0ZWRQcm9maWxlcy5sZW5ndGggPiAwKSkge1xuXHRcdGRyb3Bkb3duQWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdH1cblxuXHRmb3IgKGNvbnN0IHAgb2Ygb3RoZXJQcm9maWxlcykge1xuXHRcdGFkZFByb2ZpbGVBY3Rpb25zKHAsIGRlZmF1bHRQcm9maWxlTmFtZSwgbG9jYXRpb24sIHNwbGl0TG9jYXRpb24sIHRlcm1pbmFsU2VydmljZSwgZHJvcGRvd25BY3Rpb25zLCBzdWJtZW51QWN0aW9ucywgZGlzcG9zYWJsZVN0b3JlKTtcblx0fVxuXG5cdGZvciAoY29uc3QgY29udHJpYnV0ZWQgb2Ygb3RoZXJDb250cmlidXRlZFByb2ZpbGVzKSB7XG5cdFx0YWRkQ29udHJpYnV0ZWRQcm9maWxlQWN0aW9ucyhjb250cmlidXRlZCwgZGVmYXVsdFByb2ZpbGVOYW1lLCBsb2NhdGlvbiwgc3BsaXRMb2NhdGlvbiwgdGVybWluYWxTZXJ2aWNlLCBkcm9wZG93bkFjdGlvbnMsIHN1Ym1lbnVBY3Rpb25zLCBkaXNwb3NhYmxlU3RvcmUpO1xuXHR9XG5cblx0aWYgKGRyb3Bkb3duQWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0ZHJvcGRvd25BY3Rpb25zLnB1c2gobmV3IFN1Ym1lbnVBY3Rpb24oJ3NwbGl0LnByb2ZpbGUnLCBsb2NhbGl6ZSgnc3BsaXQucHJvZmlsZScsICdTcGxpdCBUZXJtaW5hbCB3aXRoIFByb2ZpbGUnKSwgc3VibWVudUFjdGlvbnMpKTtcblx0XHRkcm9wZG93bkFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHR9XG5cdGNvbnN0IGFjdGlvbnMgPSBkcm9wZG93bk1lbnUuZ2V0QWN0aW9ucygpO1xuXHRkcm9wZG93bkFjdGlvbnMucHVzaCguLi5TZXBhcmF0b3Iuam9pbiguLi5hY3Rpb25zLm1hcChhID0+IGFbMV0pKSk7XG5cblx0Y29uc3QgZHJvcGRvd25BY3Rpb24gPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oJ3JlZnJlc2ggcHJvZmlsZXMnLCBsb2NhbGl6ZSgnbGF1bmNoUHJvZmlsZScsICdMYXVuY2ggUHJvZmlsZS4uLicpLCAnY29kaWNvbi1jaGV2cm9uLWRvd24nLCB0cnVlKSk7XG5cdHJldHVybiB7IGRyb3Bkb3duQWN0aW9uLCBkcm9wZG93bk1lbnVBY3Rpb25zOiBkcm9wZG93bkFjdGlvbnMsIGNsYXNzTmFtZTogYHRlcm1pbmFsLXRhYi1hY3Rpb25zLSR7dGVybWluYWxTZXJ2aWNlLnJlc29sdmVMb2NhdGlvbihsb2NhdGlvbil9YCB9O1xufVxuXG5mdW5jdGlvbiBzcGxpdFByb2ZpbGVzKHByb2ZpbGVzOiByZWFkb25seSBJVGVybWluYWxQcm9maWxlW10pOiBbSVRlcm1pbmFsUHJvZmlsZVtdLCBJVGVybWluYWxQcm9maWxlW11dIHtcblx0Y29uc3QgYWlQcm9maWxlczogSVRlcm1pbmFsUHJvZmlsZVtdID0gW107XG5cdGNvbnN0IG90aGVyUHJvZmlsZXM6IElUZXJtaW5hbFByb2ZpbGVbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgcHJvZmlsZXMpIHtcblx0XHRpZiAoaXNBaVByb2ZpbGVOYW1lKHByb2ZpbGUucHJvZmlsZU5hbWUpKSB7XG5cdFx0XHRhaVByb2ZpbGVzLnB1c2gocHJvZmlsZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG90aGVyUHJvZmlsZXMucHVzaChwcm9maWxlKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIFthaVByb2ZpbGVzLCBvdGhlclByb2ZpbGVzXTtcbn1cblxuZnVuY3Rpb24gc3BsaXRDb250cmlidXRlZFByb2ZpbGVzKGNvbnRyaWJ1dGVkUHJvZmlsZXM6IHJlYWRvbmx5IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGVbXSk6IFtJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlW10sIElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGVbXV0ge1xuXHRjb25zdCBhaUNvbnRyaWJ1dGVkUHJvZmlsZXM6IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGVbXSA9IFtdO1xuXHRjb25zdCBvdGhlckNvbnRyaWJ1dGVkUHJvZmlsZXM6IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGVbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgY29udHJpYnV0ZWRQcm9maWxlcykge1xuXHRcdGlmIChpc0FpQ29udHJpYnV0ZWRQcm9maWxlKHByb2ZpbGUpKSB7XG5cdFx0XHRhaUNvbnRyaWJ1dGVkUHJvZmlsZXMucHVzaChwcm9maWxlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3RoZXJDb250cmlidXRlZFByb2ZpbGVzLnB1c2gocHJvZmlsZSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBbYWlDb250cmlidXRlZFByb2ZpbGVzLCBvdGhlckNvbnRyaWJ1dGVkUHJvZmlsZXNdO1xufVxuXG5mdW5jdGlvbiBpc0FpQ29udHJpYnV0ZWRQcm9maWxlKHByb2ZpbGU6IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUpOiBib29sZWFuIHtcblx0Y29uc3QgZXh0ZW5zaW9uSWRlbnRpZmllciA9IHByb2ZpbGUuZXh0ZW5zaW9uSWRlbnRpZmllci50b0xvd2VyQ2FzZSgpO1xuXHRpZiAoZXh0ZW5zaW9uSWRlbnRpZmllciA9PT0gJ2dpdGh1Yi5jb3BpbG90LWNoYXQnIHx8IGV4dGVuc2lvbklkZW50aWZpZXIgPT09ICdhbnRocm9waWMuY2xhdWRlLWNvZGUnKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRyZXR1cm4gaXNBaVByb2ZpbGVOYW1lKHByb2ZpbGUudGl0bGUpO1xufVxuXG5mdW5jdGlvbiBpc0FpUHJvZmlsZU5hbWUobmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IGxvd2VyQ2FzZU5hbWUgPSBuYW1lLnRvTG93ZXJDYXNlKCk7XG5cdHJldHVybiBsb3dlckNhc2VOYW1lLmluY2x1ZGVzKCdjb3BpbG90JykgfHwgbG93ZXJDYXNlTmFtZS5pbmNsdWRlcygnY2xhdWRlJyk7XG59XG5cbmZ1bmN0aW9uIGFkZFByb2ZpbGVBY3Rpb25zKFxuXHRwcm9maWxlOiBJVGVybWluYWxQcm9maWxlLFxuXHRkZWZhdWx0UHJvZmlsZU5hbWU6IHN0cmluZyxcblx0bG9jYXRpb246IElUZXJtaW5hbExvY2F0aW9uT3B0aW9ucyxcblx0c3BsaXRMb2NhdGlvbjogSVRlcm1pbmFsTG9jYXRpb25PcHRpb25zLFxuXHR0ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdGRyb3Bkb3duQWN0aW9uczogSUFjdGlvbltdLFxuXHRzdWJtZW51QWN0aW9uczogSUFjdGlvbltdLFxuXHRkaXNwb3NhYmxlU3RvcmU6IERpc3Bvc2FibGVTdG9yZVxuKTogdm9pZCB7XG5cdGNvbnN0IGlzRGVmYXVsdCA9IHByb2ZpbGUucHJvZmlsZU5hbWUgPT09IGRlZmF1bHRQcm9maWxlTmFtZTtcblx0Y29uc3Qgb3B0aW9uczogSUNyZWF0ZVRlcm1pbmFsT3B0aW9ucyA9IHsgY29uZmlnOiBwcm9maWxlLCBsb2NhdGlvbiB9O1xuXHRjb25zdCBzcGxpdE9wdGlvbnM6IElDcmVhdGVUZXJtaW5hbE9wdGlvbnMgPSB7IGNvbmZpZzogcHJvZmlsZSwgbG9jYXRpb246IHNwbGl0TG9jYXRpb24gfTtcblx0Y29uc3Qgc2FuaXRpemVkUHJvZmlsZU5hbWUgPSBwcm9maWxlLnByb2ZpbGVOYW1lLnJlcGxhY2UoL1tcXG5cXHJcXHRdL2csICcnKTtcblx0ZHJvcGRvd25BY3Rpb25zLnB1c2goZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgQWN0aW9uKFRlcm1pbmFsQ29tbWFuZElkLk5ld1dpdGhQcm9maWxlLCBpc0RlZmF1bHQgPyBsb2NhbGl6ZSgnZGVmYXVsdFRlcm1pbmFsUHJvZmlsZScsIFwiezB9IChEZWZhdWx0KVwiLCBzYW5pdGl6ZWRQcm9maWxlTmFtZSkgOiBzYW5pdGl6ZWRQcm9maWxlTmFtZSwgdW5kZWZpbmVkLCB0cnVlLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVybWluYWxTZXJ2aWNlLmNyZWF0ZUFuZEZvY3VzVGVybWluYWwob3B0aW9ucyk7XG5cdH0pKSk7XG5cdHN1Ym1lbnVBY3Rpb25zLnB1c2goZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgQWN0aW9uKFRlcm1pbmFsQ29tbWFuZElkLlNwbGl0LCBpc0RlZmF1bHQgPyBsb2NhbGl6ZSgnZGVmYXVsdFRlcm1pbmFsUHJvZmlsZScsIFwiezB9IChEZWZhdWx0KVwiLCBzYW5pdGl6ZWRQcm9maWxlTmFtZSkgOiBzYW5pdGl6ZWRQcm9maWxlTmFtZSwgdW5kZWZpbmVkLCB0cnVlLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVybWluYWxTZXJ2aWNlLmNyZWF0ZUFuZEZvY3VzVGVybWluYWwoc3BsaXRPcHRpb25zKTtcblx0fSkpKTtcbn1cblxuZnVuY3Rpb24gYWRkQ29udHJpYnV0ZWRQcm9maWxlQWN0aW9ucyhcblx0Y29udHJpYnV0ZWQ6IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUsXG5cdGRlZmF1bHRQcm9maWxlTmFtZTogc3RyaW5nLFxuXHRsb2NhdGlvbjogSVRlcm1pbmFsTG9jYXRpb25PcHRpb25zLFxuXHRzcGxpdExvY2F0aW9uOiBJVGVybWluYWxMb2NhdGlvbk9wdGlvbnMsXG5cdHRlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0ZHJvcGRvd25BY3Rpb25zOiBJQWN0aW9uW10sXG5cdHN1Ym1lbnVBY3Rpb25zOiBJQWN0aW9uW10sXG5cdGRpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlXG4pOiB2b2lkIHtcblx0Y29uc3QgaXNEZWZhdWx0ID0gY29udHJpYnV0ZWQudGl0bGUgPT09IGRlZmF1bHRQcm9maWxlTmFtZTtcblx0Y29uc3QgdGl0bGUgPSBpc0RlZmF1bHQgPyBsb2NhbGl6ZSgnZGVmYXVsdFRlcm1pbmFsUHJvZmlsZScsIFwiezB9IChEZWZhdWx0KVwiLCBjb250cmlidXRlZC50aXRsZS5yZXBsYWNlKC9bXFxuXFxyXFx0XS9nLCAnJykpIDogY29udHJpYnV0ZWQudGl0bGUucmVwbGFjZSgvW1xcblxcclxcdF0vZywgJycpO1xuXHRkcm9wZG93bkFjdGlvbnMucHVzaChkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oJ2NvbnRyaWJ1dGVkJywgdGl0bGUsIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gdGVybWluYWxTZXJ2aWNlLmNyZWF0ZUFuZEZvY3VzVGVybWluYWwoe1xuXHRcdGNvbmZpZzoge1xuXHRcdFx0ZXh0ZW5zaW9uSWRlbnRpZmllcjogY29udHJpYnV0ZWQuZXh0ZW5zaW9uSWRlbnRpZmllcixcblx0XHRcdGlkOiBjb250cmlidXRlZC5pZCxcblx0XHRcdHRpdGxlXG5cdFx0fSxcblx0XHRsb2NhdGlvblxuXHR9KSkpKTtcblx0c3VibWVudUFjdGlvbnMucHVzaChkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBBY3Rpb24oJ2NvbnRyaWJ1dGVkLXNwbGl0JywgdGl0bGUsIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gdGVybWluYWxTZXJ2aWNlLmNyZWF0ZUFuZEZvY3VzVGVybWluYWwoe1xuXHRcdGNvbmZpZzoge1xuXHRcdFx0ZXh0ZW5zaW9uSWRlbnRpZmllcjogY29udHJpYnV0ZWQuZXh0ZW5zaW9uSWRlbnRpZmllcixcblx0XHRcdGlkOiBjb250cmlidXRlZC5pZCxcblx0XHRcdHRpdGxlXG5cdFx0fSxcblx0XHRsb2NhdGlvbjogc3BsaXRMb2NhdGlvblxuXHR9KSkpKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsUUFBaUIsV0FBVyxxQkFBcUI7QUFDMUQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQWdCLFFBQVEsb0JBQW9CO0FBQzVDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQXNELGtCQUFrQix5QkFBeUI7QUFDakcsU0FBUywwQkFBMEI7QUFD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
