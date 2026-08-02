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
import { Separator } from "../../../../base/common/actions.js";
import { IMenuService, SubmenuItemAction, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IWorkspacesService } from "../../../../platform/workspaces/common/workspaces.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IUpdateService } from "../../../../platform/update/common/update.js";
import { MenubarControl } from "../../../browser/parts/titlebar/menubarControl.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IMenubarService } from "../../../../platform/menubar/electron-browser/menubar.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { OpenRecentAction } from "../../../browser/actions/windowActions.js";
import { isICommandActionToggleInfo } from "../../../../platform/action/common/action.js";
import { getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
let NativeMenubarControl = class extends MenubarControl {
  constructor(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, menubarService, hostService, nativeHostService, commandService) {
    super(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, hostService, commandService);
    this.menubarService = menubarService;
    this.nativeHostService = nativeHostService;
    (async () => {
      this.recentlyOpened = await this.workspacesService.getRecentlyOpened();
      this.doUpdateMenubar();
    })();
    this.registerListeners();
  }
  setupMainMenu() {
    super.setupMainMenu();
    for (const topLevelMenuName of Object.keys(this.topLevelTitles)) {
      const menu = this.menus[topLevelMenuName];
      if (menu) {
        this.mainMenuDisposables.add(menu.onDidChange(() => this.updateMenubar()));
      }
    }
  }
  doUpdateMenubar() {
    if (!this.hostService.hasFocus) {
      return;
    }
    const menubarData = { menus: {}, keybindings: {} };
    if (this.getMenubarMenus(menubarData)) {
      this.menubarService.updateMenubar(this.nativeHostService.windowId, menubarData);
    }
  }
  getMenubarMenus(menubarData) {
    if (!menubarData) {
      return false;
    }
    menubarData.keybindings = this.getAdditionalKeybindings();
    for (const topLevelMenuName of Object.keys(this.topLevelTitles)) {
      const menu = this.menus[topLevelMenuName];
      if (menu) {
        const menubarMenu = { items: [] };
        const menuActions = getFlatContextMenuActions(menu.getActions({ shouldForwardArgs: true }));
        this.populateMenuItems(menuActions, menubarMenu, menubarData.keybindings);
        if (menubarMenu.items.length === 0) {
          return false;
        }
        menubarData.menus[topLevelMenuName] = menubarMenu;
      }
    }
    return true;
  }
  populateMenuItems(menuActions, menuToPopulate, keybindings) {
    for (const menuItem of menuActions) {
      if (menuItem instanceof Separator) {
        menuToPopulate.items.push({ id: "vscode.menubar.separator" });
      } else if (menuItem instanceof MenuItemAction || menuItem instanceof SubmenuItemAction) {
        const title = typeof menuItem.item.title === "string" ? menuItem.item.title : menuItem.item.title.mnemonicTitle ?? menuItem.item.title.value;
        if (menuItem instanceof SubmenuItemAction) {
          const submenu = { items: [] };
          this.populateMenuItems(menuItem.actions, submenu, keybindings);
          if (submenu.items.length > 0) {
            const menubarSubmenuItem = {
              id: menuItem.id,
              label: title,
              submenu
            };
            menuToPopulate.items.push(menubarSubmenuItem);
          }
        } else {
          if (menuItem.id === OpenRecentAction.ID) {
            const actions = this.getOpenRecentActions().map(this.transformOpenRecentAction);
            menuToPopulate.items.push(...actions);
          }
          const menubarMenuItem = {
            id: menuItem.id,
            label: title
          };
          if (isICommandActionToggleInfo(menuItem.item.toggled)) {
            menubarMenuItem.label = menuItem.item.toggled.mnemonicTitle ?? menuItem.item.toggled.title ?? title;
          }
          if (menuItem.checked) {
            menubarMenuItem.checked = true;
          }
          if (!menuItem.enabled) {
            menubarMenuItem.enabled = false;
          }
          keybindings[menuItem.id] = this.getMenubarKeybinding(menuItem.id);
          menuToPopulate.items.push(menubarMenuItem);
        }
      }
    }
  }
  transformOpenRecentAction(action) {
    if (action instanceof Separator) {
      return { id: "vscode.menubar.separator" };
    }
    return {
      id: action.id,
      uri: action.uri,
      remoteAuthority: action.remoteAuthority,
      enabled: action.enabled,
      label: action.label
    };
  }
  getAdditionalKeybindings() {
    const keybindings = {};
    if (isMacintosh) {
      const keybinding = this.getMenubarKeybinding("workbench.action.quit");
      if (keybinding) {
        keybindings["workbench.action.quit"] = keybinding;
      }
    }
    return keybindings;
  }
  getMenubarKeybinding(id) {
    const binding = this.keybindingService.lookupKeybinding(id);
    if (!binding) {
      return void 0;
    }
    const electronAccelerator = binding.getElectronAccelerator();
    if (electronAccelerator) {
      return { label: electronAccelerator, userSettingsLabel: binding.getUserSettingsLabel() ?? void 0 };
    }
    const acceleratorLabel = binding.getLabel();
    if (acceleratorLabel) {
      return { label: acceleratorLabel, isNative: false, userSettingsLabel: binding.getUserSettingsLabel() ?? void 0 };
    }
    return void 0;
  }
};
NativeMenubarControl = __decorateClass([
  __decorateParam(0, IMenuService),
  __decorateParam(1, IWorkspacesService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, IUpdateService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, INotificationService),
  __decorateParam(9, IPreferencesService),
  __decorateParam(10, INativeWorkbenchEnvironmentService),
  __decorateParam(11, IAccessibilityService),
  __decorateParam(12, IMenubarService),
  __decorateParam(13, IHostService),
  __decorateParam(14, INativeHostService),
  __decorateParam(15, ICommandService)
], NativeMenubarControl);
export {
  NativeMenubarControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9lbGVjdHJvbi1icm93c2VyL3BhcnRzL3RpdGxlYmFyL21lbnViYXJDb250cm9sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIFN1Ym1lbnVJdGVtQWN0aW9uLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9lbGVjdHJvbi1icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJVXBkYXRlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VwZGF0ZS9jb21tb24vdXBkYXRlLmpzJztcbmltcG9ydCB7IElPcGVuUmVjZW50QWN0aW9uLCBNZW51YmFyQ29udHJvbCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdGl0bGViYXIvbWVudWJhckNvbnRyb2wuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJTWVudWJhckRhdGEsIElNZW51YmFyTWVudSwgSU1lbnViYXJLZXliaW5kaW5nLCBJTWVudWJhck1lbnVJdGVtU3VibWVudSwgSU1lbnViYXJNZW51SXRlbUFjdGlvbiwgTWVudWJhck1lbnVJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWVudWJhci9jb21tb24vbWVudWJhci5qcyc7XG5pbXBvcnQgeyBJTWVudWJhclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tZW51YmFyL2VsZWN0cm9uLWJyb3dzZXIvbWVudWJhci5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBPcGVuUmVjZW50QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL3dpbmRvd0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgaXNJQ29tbWFuZEFjdGlvblRvZ2dsZUluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcblxuZXhwb3J0IGNsYXNzIE5hdGl2ZU1lbnViYXJDb250cm9sIGV4dGVuZHMgTWVudWJhckNvbnRyb2wge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVdvcmtzcGFjZXNTZXJ2aWNlIHdvcmtzcGFjZXNTZXJ2aWNlOiBJV29ya3NwYWNlc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVXBkYXRlU2VydmljZSB1cGRhdGVTZXJ2aWNlOiBJVXBkYXRlU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJTWVudWJhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51YmFyU2VydmljZTogSU1lbnViYXJTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG1lbnVTZXJ2aWNlLCB3b3Jrc3BhY2VzU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgbGFiZWxTZXJ2aWNlLCB1cGRhdGVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgcHJlZmVyZW5jZXNTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBob3N0U2VydmljZSwgY29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMucmVjZW50bHlPcGVuZWQgPSBhd2FpdCB0aGlzLndvcmtzcGFjZXNTZXJ2aWNlLmdldFJlY2VudGx5T3BlbmVkKCk7XG5cblx0XHRcdHRoaXMuZG9VcGRhdGVNZW51YmFyKCk7XG5cdFx0fSkoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzZXR1cE1haW5NZW51KCk6IHZvaWQge1xuXHRcdHN1cGVyLnNldHVwTWFpbk1lbnUoKTtcblxuXHRcdGZvciAoY29uc3QgdG9wTGV2ZWxNZW51TmFtZSBvZiBPYmplY3Qua2V5cyh0aGlzLnRvcExldmVsVGl0bGVzKSkge1xuXHRcdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudXNbdG9wTGV2ZWxNZW51TmFtZV07XG5cdFx0XHRpZiAobWVudSkge1xuXHRcdFx0XHR0aGlzLm1haW5NZW51RGlzcG9zYWJsZXMuYWRkKG1lbnUub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVNZW51YmFyKCkpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgZG9VcGRhdGVNZW51YmFyKCk6IHZvaWQge1xuXHRcdC8vIFNpbmNlIHRoZSBuYXRpdmUgbWVudWJhciBpcyBzaGFyZWQgYmV0d2VlbiB3aW5kb3dzIChtYWluIHByb2Nlc3MpXG5cdFx0Ly8gb25seSBhbGxvdyB0aGUgZm9jdXNlZCB3aW5kb3cgdG8gdXBkYXRlIHRoZSBtZW51YmFyXG5cdFx0aWYgKCF0aGlzLmhvc3RTZXJ2aWNlLmhhc0ZvY3VzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2VuZCBtZW51cyB0byBtYWluIHByb2Nlc3MgdG8gYmUgcmVuZGVyZWQgYnkgRWxlY3Ryb25cblx0XHRjb25zdCBtZW51YmFyRGF0YSA9IHsgbWVudXM6IHt9LCBrZXliaW5kaW5nczoge30gfTtcblx0XHRpZiAodGhpcy5nZXRNZW51YmFyTWVudXMobWVudWJhckRhdGEpKSB7XG5cdFx0XHR0aGlzLm1lbnViYXJTZXJ2aWNlLnVwZGF0ZU1lbnViYXIodGhpcy5uYXRpdmVIb3N0U2VydmljZS53aW5kb3dJZCwgbWVudWJhckRhdGEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0TWVudWJhck1lbnVzKG1lbnViYXJEYXRhOiBJTWVudWJhckRhdGEpOiBib29sZWFuIHtcblx0XHRpZiAoIW1lbnViYXJEYXRhKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bWVudWJhckRhdGEua2V5YmluZGluZ3MgPSB0aGlzLmdldEFkZGl0aW9uYWxLZXliaW5kaW5ncygpO1xuXHRcdGZvciAoY29uc3QgdG9wTGV2ZWxNZW51TmFtZSBvZiBPYmplY3Qua2V5cyh0aGlzLnRvcExldmVsVGl0bGVzKSkge1xuXHRcdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudXNbdG9wTGV2ZWxNZW51TmFtZV07XG5cdFx0XHRpZiAobWVudSkge1xuXHRcdFx0XHRjb25zdCBtZW51YmFyTWVudTogSU1lbnViYXJNZW51ID0geyBpdGVtczogW10gfTtcblx0XHRcdFx0Y29uc3QgbWVudUFjdGlvbnMgPSBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pKTtcblx0XHRcdFx0dGhpcy5wb3B1bGF0ZU1lbnVJdGVtcyhtZW51QWN0aW9ucywgbWVudWJhck1lbnUsIG1lbnViYXJEYXRhLmtleWJpbmRpbmdzKTtcblx0XHRcdFx0aWYgKG1lbnViYXJNZW51Lml0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gTWVudXMgYXJlIGluY29tcGxldGVcblx0XHRcdFx0fVxuXHRcdFx0XHRtZW51YmFyRGF0YS5tZW51c1t0b3BMZXZlbE1lbnVOYW1lXSA9IG1lbnViYXJNZW51O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBwb3B1bGF0ZU1lbnVJdGVtcyhtZW51QWN0aW9uczogcmVhZG9ubHkgSUFjdGlvbltdLCBtZW51VG9Qb3B1bGF0ZTogSU1lbnViYXJNZW51LCBrZXliaW5kaW5nczogeyBbaWQ6IHN0cmluZ106IElNZW51YmFyS2V5YmluZGluZyB8IHVuZGVmaW5lZCB9KSB7XG5cdFx0Zm9yIChjb25zdCBtZW51SXRlbSBvZiBtZW51QWN0aW9ucykge1xuXHRcdFx0aWYgKG1lbnVJdGVtIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRcdG1lbnVUb1BvcHVsYXRlLml0ZW1zLnB1c2goeyBpZDogJ3ZzY29kZS5tZW51YmFyLnNlcGFyYXRvcicgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKG1lbnVJdGVtIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24gfHwgbWVudUl0ZW0gaW5zdGFuY2VvZiBTdWJtZW51SXRlbUFjdGlvbikge1xuXG5cdFx0XHRcdC8vIHVzZSBtbmVtb25pY1RpdGxlIHdoZW5ldmVyIHBvc3NpYmxlXG5cdFx0XHRcdGNvbnN0IHRpdGxlID0gdHlwZW9mIG1lbnVJdGVtLml0ZW0udGl0bGUgPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0PyBtZW51SXRlbS5pdGVtLnRpdGxlXG5cdFx0XHRcdFx0OiBtZW51SXRlbS5pdGVtLnRpdGxlLm1uZW1vbmljVGl0bGUgPz8gbWVudUl0ZW0uaXRlbS50aXRsZS52YWx1ZTtcblxuXHRcdFx0XHRpZiAobWVudUl0ZW0gaW5zdGFuY2VvZiBTdWJtZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IHN1Ym1lbnUgPSB7IGl0ZW1zOiBbXSB9O1xuXG5cdFx0XHRcdFx0dGhpcy5wb3B1bGF0ZU1lbnVJdGVtcyhtZW51SXRlbS5hY3Rpb25zLCBzdWJtZW51LCBrZXliaW5kaW5ncyk7XG5cblx0XHRcdFx0XHRpZiAoc3VibWVudS5pdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtZW51YmFyU3VibWVudUl0ZW06IElNZW51YmFyTWVudUl0ZW1TdWJtZW51ID0ge1xuXHRcdFx0XHRcdFx0XHRpZDogbWVudUl0ZW0uaWQsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiB0aXRsZSxcblx0XHRcdFx0XHRcdFx0c3VibWVudVxuXHRcdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdFx0bWVudVRvUG9wdWxhdGUuaXRlbXMucHVzaChtZW51YmFyU3VibWVudUl0ZW0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAobWVudUl0ZW0uaWQgPT09IE9wZW5SZWNlbnRBY3Rpb24uSUQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLmdldE9wZW5SZWNlbnRBY3Rpb25zKCkubWFwKHRoaXMudHJhbnNmb3JtT3BlblJlY2VudEFjdGlvbik7XG5cdFx0XHRcdFx0XHRtZW51VG9Qb3B1bGF0ZS5pdGVtcy5wdXNoKC4uLmFjdGlvbnMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IG1lbnViYXJNZW51SXRlbTogSU1lbnViYXJNZW51SXRlbUFjdGlvbiA9IHtcblx0XHRcdFx0XHRcdGlkOiBtZW51SXRlbS5pZCxcblx0XHRcdFx0XHRcdGxhYmVsOiB0aXRsZVxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRpZiAoaXNJQ29tbWFuZEFjdGlvblRvZ2dsZUluZm8obWVudUl0ZW0uaXRlbS50b2dnbGVkKSkge1xuXHRcdFx0XHRcdFx0bWVudWJhck1lbnVJdGVtLmxhYmVsID0gbWVudUl0ZW0uaXRlbS50b2dnbGVkLm1uZW1vbmljVGl0bGUgPz8gbWVudUl0ZW0uaXRlbS50b2dnbGVkLnRpdGxlID8/IHRpdGxlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChtZW51SXRlbS5jaGVja2VkKSB7XG5cdFx0XHRcdFx0XHRtZW51YmFyTWVudUl0ZW0uY2hlY2tlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCFtZW51SXRlbS5lbmFibGVkKSB7XG5cdFx0XHRcdFx0XHRtZW51YmFyTWVudUl0ZW0uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGtleWJpbmRpbmdzW21lbnVJdGVtLmlkXSA9IHRoaXMuZ2V0TWVudWJhcktleWJpbmRpbmcobWVudUl0ZW0uaWQpO1xuXHRcdFx0XHRcdG1lbnVUb1BvcHVsYXRlLml0ZW1zLnB1c2gobWVudWJhck1lbnVJdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdHJhbnNmb3JtT3BlblJlY2VudEFjdGlvbihhY3Rpb246IFNlcGFyYXRvciB8IElPcGVuUmVjZW50QWN0aW9uKTogTWVudWJhck1lbnVJdGVtIHtcblx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRyZXR1cm4geyBpZDogJ3ZzY29kZS5tZW51YmFyLnNlcGFyYXRvcicgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGFjdGlvbi5pZCxcblx0XHRcdHVyaTogYWN0aW9uLnVyaSxcblx0XHRcdHJlbW90ZUF1dGhvcml0eTogYWN0aW9uLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdGVuYWJsZWQ6IGFjdGlvbi5lbmFibGVkLFxuXHRcdFx0bGFiZWw6IGFjdGlvbi5sYWJlbFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldEFkZGl0aW9uYWxLZXliaW5kaW5ncygpOiB7IFtpZDogc3RyaW5nXTogSU1lbnViYXJLZXliaW5kaW5nIH0ge1xuXHRcdGNvbnN0IGtleWJpbmRpbmdzOiB7IFtpZDogc3RyaW5nXTogSU1lbnViYXJLZXliaW5kaW5nIH0gPSB7fTtcblx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmdldE1lbnViYXJLZXliaW5kaW5nKCd3b3JrYmVuY2guYWN0aW9uLnF1aXQnKTtcblx0XHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRcdGtleWJpbmRpbmdzWyd3b3JrYmVuY2guYWN0aW9uLnF1aXQnXSA9IGtleWJpbmRpbmc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGtleWJpbmRpbmdzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNZW51YmFyS2V5YmluZGluZyhpZDogc3RyaW5nKTogSU1lbnViYXJLZXliaW5kaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBiaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGlkKTtcblx0XHRpZiAoIWJpbmRpbmcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gZmlyc3QgdHJ5IHRvIHJlc29sdmUgYSBuYXRpdmUgYWNjZWxlcmF0b3Jcblx0XHRjb25zdCBlbGVjdHJvbkFjY2VsZXJhdG9yID0gYmluZGluZy5nZXRFbGVjdHJvbkFjY2VsZXJhdG9yKCk7XG5cdFx0aWYgKGVsZWN0cm9uQWNjZWxlcmF0b3IpIHtcblx0XHRcdHJldHVybiB7IGxhYmVsOiBlbGVjdHJvbkFjY2VsZXJhdG9yLCB1c2VyU2V0dGluZ3NMYWJlbDogYmluZGluZy5nZXRVc2VyU2V0dGluZ3NMYWJlbCgpID8/IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdC8vIHdlIG5lZWQgdGhpcyBmYWxsYmFjayB0byBzdXBwb3J0IGtleWJpbmRpbmdzIHRoYXQgY2Fubm90IHNob3cgaW4gZWxlY3Ryb24gbWVudXMgKGUuZy4gY2hvcmRzKVxuXHRcdGNvbnN0IGFjY2VsZXJhdG9yTGFiZWwgPSBiaW5kaW5nLmdldExhYmVsKCk7XG5cdFx0aWYgKGFjY2VsZXJhdG9yTGFiZWwpIHtcblx0XHRcdHJldHVybiB7IGxhYmVsOiBhY2NlbGVyYXRvckxhYmVsLCBpc05hdGl2ZTogZmFsc2UsIHVzZXJTZXR0aW5nc0xhYmVsOiBiaW5kaW5nLmdldFVzZXJTZXR0aW5nc0xhYmVsKCkgPz8gdW5kZWZpbmVkIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFrQixpQkFBaUI7QUFDbkMsU0FBUyxjQUFjLG1CQUFtQixzQkFBc0I7QUFDaEUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBNEIsc0JBQXNCO0FBQ2xELFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FB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
