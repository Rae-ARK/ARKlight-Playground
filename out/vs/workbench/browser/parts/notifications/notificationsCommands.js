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
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { isNotificationViewItem, NotificationsPosition, NotificationsSettings } from "../../../common/notifications.js";
import { Action2, MenuRegistry, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { localize, localize2 } from "../../../../nls.js";
import { IListService, WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { NotificationFocusedContext, NotificationsCenterVisibleContext, NotificationsToastsVisibleContext } from "../../../common/contextkeys.js";
import { INotificationService, NotificationsFilter } from "../../../../platform/notification/common/notification.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ActionRunner } from "../../../../base/common/actions.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
const SHOW_NOTIFICATIONS_CENTER = "notifications.showList";
const HIDE_NOTIFICATIONS_CENTER = "notifications.hideList";
const TOGGLE_NOTIFICATIONS_CENTER = "notifications.toggleList";
const HIDE_NOTIFICATION_TOAST = "notifications.hideToasts";
const FOCUS_NOTIFICATION_TOAST = "notifications.focusToasts";
const FOCUS_NEXT_NOTIFICATION_TOAST = "notifications.focusNextToast";
const FOCUS_PREVIOUS_NOTIFICATION_TOAST = "notifications.focusPreviousToast";
const FOCUS_FIRST_NOTIFICATION_TOAST = "notifications.focusFirstToast";
const FOCUS_LAST_NOTIFICATION_TOAST = "notifications.focusLastToast";
const COLLAPSE_NOTIFICATION = "notification.collapse";
const EXPAND_NOTIFICATION = "notification.expand";
const ACCEPT_PRIMARY_ACTION_NOTIFICATION = "notification.acceptPrimaryAction";
const TOGGLE_NOTIFICATION = "notification.toggle";
const CLEAR_NOTIFICATION = "notification.clear";
const CLEAR_ALL_NOTIFICATIONS = "notifications.clearAll";
const TOGGLE_DO_NOT_DISTURB_MODE = "notifications.toggleDoNotDisturbMode";
const TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE = "notifications.toggleDoNotDisturbModeBySource";
function getNotificationFromContext(listService, context) {
  if (isNotificationViewItem(context)) {
    return context;
  }
  const list = listService.lastFocusedList;
  if (list instanceof WorkbenchList) {
    let element = list.getFocusedElements()[0];
    if (!isNotificationViewItem(element)) {
      if (list.isDOMFocused()) {
        element = list.element(0);
      }
    }
    if (isNotificationViewItem(element)) {
      return element;
    }
  }
  return void 0;
}
function registerNotificationCommands(center, toasts, model) {
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: SHOW_NOTIFICATIONS_CENTER,
    weight: KeybindingWeight.WorkbenchContrib,
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN),
    handler: () => {
      toasts.hide();
      center.show();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: HIDE_NOTIFICATIONS_CENTER,
    weight: KeybindingWeight.WorkbenchContrib + 50,
    when: NotificationsCenterVisibleContext,
    primary: KeyCode.Escape,
    handler: () => center.hide()
  });
  CommandsRegistry.registerCommand(TOGGLE_NOTIFICATIONS_CENTER, () => {
    if (center.isVisible) {
      center.hide();
    } else {
      toasts.hide();
      center.show();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLEAR_NOTIFICATION,
    weight: KeybindingWeight.WorkbenchContrib,
    when: NotificationFocusedContext,
    primary: KeyCode.Delete,
    mac: {
      primary: KeyMod.CtrlCmd | KeyCode.Backspace
    },
    handler: (accessor, args) => {
      const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
      const notification = getNotificationFromContext(accessor.get(IListService), args);
      if (notification && !notification.hasProgress) {
        notification.close();
        accessibilitySignalService.playSignal(AccessibilitySignal.clear);
      }
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: EXPAND_NOTIFICATION,
    weight: KeybindingWeight.WorkbenchContrib,
    when: NotificationFocusedContext,
    primary: KeyCode.RightArrow,
    handler: (accessor, args) => {
      const notification = getNotificationFromContext(accessor.get(IListService), args);
      notification?.expand();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: ACCEPT_PRIMARY_ACTION_NOTIFICATION,
    weight: KeybindingWeight.WorkbenchContrib + 1,
    when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ContextKeyExpr.or(NotificationFocusedContext, NotificationsToastsVisibleContext)),
    primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
    handler: (accessor) => {
      const actionRunner = accessor.get(IInstantiationService).createInstance(NotificationActionRunner);
      const notification = getNotificationFromContext(accessor.get(IListService)) || model.notifications.at(0);
      if (!notification) {
        return;
      }
      const primaryAction = notification.actions?.primary ? notification.actions.primary.at(0) : void 0;
      if (!primaryAction) {
        return;
      }
      actionRunner.run(primaryAction, notification);
      notification.close();
      actionRunner.dispose();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: COLLAPSE_NOTIFICATION,
    weight: KeybindingWeight.WorkbenchContrib,
    when: NotificationFocusedContext,
    primary: KeyCode.LeftArrow,
    handler: (accessor, args) => {
      const notification = getNotificationFromContext(accessor.get(IListService), args);
      notification?.collapse();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: TOGGLE_NOTIFICATION,
    weight: KeybindingWeight.WorkbenchContrib,
    when: NotificationFocusedContext,
    primary: KeyCode.Space,
    secondary: [KeyCode.Enter],
    handler: (accessor) => {
      const notification = getNotificationFromContext(accessor.get(IListService));
      notification?.toggle();
    }
  });
  CommandsRegistry.registerCommand(HIDE_NOTIFICATION_TOAST, (accessor) => {
    toasts.hide();
  });
  KeybindingsRegistry.registerKeybindingRule({
    id: HIDE_NOTIFICATION_TOAST,
    weight: KeybindingWeight.WorkbenchContrib - 50,
    // lower when not focused (e.g. let editor suggest win over this command)
    when: NotificationsToastsVisibleContext,
    primary: KeyCode.Escape
  });
  KeybindingsRegistry.registerKeybindingRule({
    id: HIDE_NOTIFICATION_TOAST,
    weight: KeybindingWeight.WorkbenchContrib + 100,
    // higher when focused
    when: ContextKeyExpr.and(NotificationsToastsVisibleContext, NotificationFocusedContext),
    primary: KeyCode.Escape
  });
  CommandsRegistry.registerCommand(FOCUS_NOTIFICATION_TOAST, () => toasts.focus());
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: FOCUS_NEXT_NOTIFICATION_TOAST,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
    primary: KeyCode.DownArrow,
    handler: () => {
      toasts.focusNext();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: FOCUS_PREVIOUS_NOTIFICATION_TOAST,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
    primary: KeyCode.UpArrow,
    handler: () => {
      toasts.focusPrevious();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: FOCUS_FIRST_NOTIFICATION_TOAST,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
    primary: KeyCode.PageUp,
    secondary: [KeyCode.Home],
    handler: () => {
      toasts.focusFirst();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: FOCUS_LAST_NOTIFICATION_TOAST,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
    primary: KeyCode.PageDown,
    secondary: [KeyCode.End],
    handler: () => {
      toasts.focusLast();
    }
  });
  CommandsRegistry.registerCommand(CLEAR_ALL_NOTIFICATIONS, () => center.clearAll());
  CommandsRegistry.registerCommand(TOGGLE_DO_NOT_DISTURB_MODE, (accessor) => {
    const notificationService = accessor.get(INotificationService);
    notificationService.setFilter(notificationService.getFilter() === NotificationsFilter.ERROR ? NotificationsFilter.OFF : NotificationsFilter.ERROR);
  });
  CommandsRegistry.registerCommand(TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE, (accessor) => {
    const notificationService = accessor.get(INotificationService);
    const quickInputService = accessor.get(IQuickInputService);
    const sortedFilters = notificationService.getFilters().sort((a, b) => a.label.localeCompare(b.label));
    const disposables = new DisposableStore();
    const picker = disposables.add(quickInputService.createQuickPick());
    picker.items = sortedFilters.map((source) => ({
      id: source.id,
      label: source.label,
      tooltip: `${source.label} (${source.id})`,
      filter: source.filter
    }));
    picker.canSelectMany = true;
    picker.placeholder = localize("selectSources", "Select sources to enable all notifications from");
    picker.selectedItems = picker.items.filter((item) => item.filter === NotificationsFilter.OFF);
    picker.show();
    disposables.add(picker.onDidAccept(async () => {
      for (const item of picker.items) {
        notificationService.setFilter({
          id: item.id,
          label: item.label,
          filter: picker.selectedItems.includes(item) ? NotificationsFilter.OFF : NotificationsFilter.ERROR
        });
      }
      picker.hide();
    }));
    disposables.add(picker.onDidHide(() => disposables.dispose()));
  });
  const category = localize2("notifications", "Notifications");
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: SHOW_NOTIFICATIONS_CENTER, title: localize2("showNotifications", "Show Notifications"), category } });
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: HIDE_NOTIFICATIONS_CENTER, title: localize2("hideNotifications", "Hide Notifications"), category }, when: NotificationsCenterVisibleContext });
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLEAR_ALL_NOTIFICATIONS, title: localize2("clearAllNotifications", "Clear All Notifications"), category } });
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: ACCEPT_PRIMARY_ACTION_NOTIFICATION, title: localize2("acceptNotificationPrimaryAction", "Accept Notification Primary Action"), category } });
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: TOGGLE_DO_NOT_DISTURB_MODE, title: localize2("toggleDoNotDisturbMode", "Toggle Do Not Disturb Mode"), category } });
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE, title: localize2("toggleDoNotDisturbModeBySource", "Toggle Do Not Disturb Mode By Source..."), category } });
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: FOCUS_NOTIFICATION_TOAST, title: localize2("focusNotificationToasts", "Focus Notification Toast"), category }, when: NotificationsToastsVisibleContext });
  MenuRegistry.appendMenuItem(MenuId.TitleBar, {
    command: {
      id: TOGGLE_NOTIFICATIONS_CENTER,
      title: localize("toggleNotifications", "Toggle Notifications"),
      icon: Codicon.bell
    },
    group: "navigation",
    order: 1e4,
    when: ContextKeyExpr.and(
      ContextKeyExpr.equals(`config.${NotificationsSettings.NOTIFICATIONS_POSITION}`, NotificationsPosition.TOP_RIGHT),
      ContextKeyExpr.equals(`config.${NotificationsSettings.NOTIFICATIONS_BUTTON}`, true)
    )
  });
}
registerAction2(class SetNotificationsPositionBottomRight extends Action2 {
  constructor() {
    super({
      id: "workbench.action.setNotificationsPosition.bottomRight",
      title: localize2("positionBottomRight", "Bottom Right"),
      toggled: ContextKeyExpr.equals(`config.${NotificationsSettings.NOTIFICATIONS_POSITION}`, NotificationsPosition.BOTTOM_RIGHT),
      menu: {
        id: MenuId.NotificationsCenterPositionMenu,
        order: 1
      }
    });
  }
  run(accessor) {
    accessor.get(IConfigurationService).updateValue(NotificationsSettings.NOTIFICATIONS_POSITION, NotificationsPosition.BOTTOM_RIGHT);
  }
});
registerAction2(class SetNotificationsPositionBottomLeft extends Action2 {
  constructor() {
    super({
      id: "workbench.action.setNotificationsPosition.bottomLeft",
      title: localize2("positionBottomLeft", "Bottom Left"),
      toggled: ContextKeyExpr.equals(`config.${NotificationsSettings.NOTIFICATIONS_POSITION}`, NotificationsPosition.BOTTOM_LEFT),
      menu: {
        id: MenuId.NotificationsCenterPositionMenu,
        order: 2
      }
    });
  }
  run(accessor) {
    accessor.get(IConfigurationService).updateValue(NotificationsSettings.NOTIFICATIONS_POSITION, NotificationsPosition.BOTTOM_LEFT);
  }
});
registerAction2(class SetNotificationsPositionTopRight extends Action2 {
  constructor() {
    super({
      id: "workbench.action.setNotificationsPosition.topRight",
      title: localize2("positionTopRight", "Top Right"),
      toggled: ContextKeyExpr.equals(`config.${NotificationsSettings.NOTIFICATIONS_POSITION}`, NotificationsPosition.TOP_RIGHT),
      menu: {
        id: MenuId.NotificationsCenterPositionMenu,
        order: 3
      }
    });
  }
  run(accessor) {
    accessor.get(IConfigurationService).updateValue(NotificationsSettings.NOTIFICATIONS_POSITION, NotificationsPosition.TOP_RIGHT);
  }
});
let NotificationActionRunner = class extends ActionRunner {
  constructor(telemetryService, notificationService) {
    super();
    this.telemetryService = telemetryService;
    this.notificationService = notificationService;
  }
  async runAction(action, context) {
    this.telemetryService.publicLog2("workbenchActionExecuted", { id: action.id, from: "message" });
    try {
      await super.runAction(action, context);
    } catch (error) {
      this.notificationService.error(error);
    }
  }
};
NotificationActionRunner = __decorateClass([
  __decorateParam(0, ITelemetryService),
  __decorateParam(1, INotificationService)
], NotificationActionRunner);
export {
  ACCEPT_PRIMARY_ACTION_NOTIFICATION,
  CLEAR_ALL_NOTIFICATIONS,
  CLEAR_NOTIFICATION,
  COLLAPSE_NOTIFICATION,
  EXPAND_NOTIFICATION,
  HIDE_NOTIFICATIONS_CENTER,
  HIDE_NOTIFICATION_TOAST,
  NotificationActionRunner,
  SHOW_NOTIFICATIONS_CENTER,
  TOGGLE_DO_NOT_DISTURB_MODE,
  TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE,
  getNotificationFromContext,
  registerNotificationCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL25vdGlmaWNhdGlvbnMvbm90aWZpY2F0aW9uc0NvbW1hbmRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25WaWV3SXRlbSwgaXNOb3RpZmljYXRpb25WaWV3SXRlbSwgTm90aWZpY2F0aW9uc01vZGVsLCBOb3RpZmljYXRpb25zUG9zaXRpb24sIE5vdGlmaWNhdGlvbnNTZXR0aW5ncyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RpZmljYXRpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVSZWdpc3RyeSwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlLCBXb3JrYmVuY2hMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uRm9jdXNlZENvbnRleHQsIE5vdGlmaWNhdGlvbnNDZW50ZXJWaXNpYmxlQ29udGV4dCwgTm90aWZpY2F0aW9uc1RvYXN0c1Zpc2libGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBJTm90aWZpY2F0aW9uU291cmNlRmlsdGVyLCBOb3RpZmljYXRpb25zRmlsdGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb25SdW5uZXIsIElBY3Rpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuXG4vLyBDZW50ZXJcbmV4cG9ydCBjb25zdCBTSE9XX05PVElGSUNBVElPTlNfQ0VOVEVSID0gJ25vdGlmaWNhdGlvbnMuc2hvd0xpc3QnO1xuZXhwb3J0IGNvbnN0IEhJREVfTk9USUZJQ0FUSU9OU19DRU5URVIgPSAnbm90aWZpY2F0aW9ucy5oaWRlTGlzdCc7XG5jb25zdCBUT0dHTEVfTk9USUZJQ0FUSU9OU19DRU5URVIgPSAnbm90aWZpY2F0aW9ucy50b2dnbGVMaXN0JztcblxuLy8gVG9hc3RzXG5leHBvcnQgY29uc3QgSElERV9OT1RJRklDQVRJT05fVE9BU1QgPSAnbm90aWZpY2F0aW9ucy5oaWRlVG9hc3RzJztcbmNvbnN0IEZPQ1VTX05PVElGSUNBVElPTl9UT0FTVCA9ICdub3RpZmljYXRpb25zLmZvY3VzVG9hc3RzJztcbmNvbnN0IEZPQ1VTX05FWFRfTk9USUZJQ0FUSU9OX1RPQVNUID0gJ25vdGlmaWNhdGlvbnMuZm9jdXNOZXh0VG9hc3QnO1xuY29uc3QgRk9DVVNfUFJFVklPVVNfTk9USUZJQ0FUSU9OX1RPQVNUID0gJ25vdGlmaWNhdGlvbnMuZm9jdXNQcmV2aW91c1RvYXN0JztcbmNvbnN0IEZPQ1VTX0ZJUlNUX05PVElGSUNBVElPTl9UT0FTVCA9ICdub3RpZmljYXRpb25zLmZvY3VzRmlyc3RUb2FzdCc7XG5jb25zdCBGT0NVU19MQVNUX05PVElGSUNBVElPTl9UT0FTVCA9ICdub3RpZmljYXRpb25zLmZvY3VzTGFzdFRvYXN0JztcblxuLy8gTm90aWZpY2F0aW9uXG5leHBvcnQgY29uc3QgQ09MTEFQU0VfTk9USUZJQ0FUSU9OID0gJ25vdGlmaWNhdGlvbi5jb2xsYXBzZSc7XG5leHBvcnQgY29uc3QgRVhQQU5EX05PVElGSUNBVElPTiA9ICdub3RpZmljYXRpb24uZXhwYW5kJztcbmV4cG9ydCBjb25zdCBBQ0NFUFRfUFJJTUFSWV9BQ1RJT05fTk9USUZJQ0FUSU9OID0gJ25vdGlmaWNhdGlvbi5hY2NlcHRQcmltYXJ5QWN0aW9uJztcbmNvbnN0IFRPR0dMRV9OT1RJRklDQVRJT04gPSAnbm90aWZpY2F0aW9uLnRvZ2dsZSc7XG5leHBvcnQgY29uc3QgQ0xFQVJfTk9USUZJQ0FUSU9OID0gJ25vdGlmaWNhdGlvbi5jbGVhcic7XG5leHBvcnQgY29uc3QgQ0xFQVJfQUxMX05PVElGSUNBVElPTlMgPSAnbm90aWZpY2F0aW9ucy5jbGVhckFsbCc7XG5leHBvcnQgY29uc3QgVE9HR0xFX0RPX05PVF9ESVNUVVJCX01PREUgPSAnbm90aWZpY2F0aW9ucy50b2dnbGVEb05vdERpc3R1cmJNb2RlJztcbmV4cG9ydCBjb25zdCBUT0dHTEVfRE9fTk9UX0RJU1RVUkJfTU9ERV9CWV9TT1VSQ0UgPSAnbm90aWZpY2F0aW9ucy50b2dnbGVEb05vdERpc3R1cmJNb2RlQnlTb3VyY2UnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RpZmljYXRpb25zQ2VudGVyQ29udHJvbGxlciB7XG5cdHJlYWRvbmx5IGlzVmlzaWJsZTogYm9vbGVhbjtcblxuXHRzaG93KCk6IHZvaWQ7XG5cdGhpZGUoKTogdm9pZDtcblxuXHRjbGVhckFsbCgpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RpZmljYXRpb25zVG9hc3RDb250cm9sbGVyIHtcblx0Zm9jdXMoKTogdm9pZDtcblx0Zm9jdXNOZXh0KCk6IHZvaWQ7XG5cdGZvY3VzUHJldmlvdXMoKTogdm9pZDtcblx0Zm9jdXNGaXJzdCgpOiB2b2lkO1xuXHRmb2N1c0xhc3QoKTogdm9pZDtcblxuXHRoaWRlKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXROb3RpZmljYXRpb25Gcm9tQ29udGV4dChsaXN0U2VydmljZTogSUxpc3RTZXJ2aWNlLCBjb250ZXh0PzogdW5rbm93bik6IElOb3RpZmljYXRpb25WaWV3SXRlbSB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc05vdGlmaWNhdGlvblZpZXdJdGVtKGNvbnRleHQpKSB7XG5cdFx0cmV0dXJuIGNvbnRleHQ7XG5cdH1cblxuXHRjb25zdCBsaXN0ID0gbGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0O1xuXHRpZiAobGlzdCBpbnN0YW5jZW9mIFdvcmtiZW5jaExpc3QpIHtcblx0XHRsZXQgZWxlbWVudCA9IGxpc3QuZ2V0Rm9jdXNlZEVsZW1lbnRzKClbMF07XG5cdFx0aWYgKCFpc05vdGlmaWNhdGlvblZpZXdJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRpZiAobGlzdC5pc0RPTUZvY3VzZWQoKSkge1xuXHRcdFx0XHQvLyB0aGUgbm90aWZpY2F0aW9uIGxpc3QgbWlnaHQgaGF2ZSByZWNlaXZlZCBmb2N1c1xuXHRcdFx0XHQvLyB2aWEga2V5Ym9hcmQgYW5kIG1pZ2h0IG5vdCBoYXZlIGEgZm9jdXNlZCBlbGVtZW50LlxuXHRcdFx0XHQvLyBpbiB0aGF0IGNhc2UganVzdCByZXR1cm4gdGhlIGZpcnN0IGVsZW1lbnRcblx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE5MTcwNVxuXHRcdFx0XHRlbGVtZW50ID0gbGlzdC5lbGVtZW50KDApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChpc05vdGlmaWNhdGlvblZpZXdJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudDtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJOb3RpZmljYXRpb25Db21tYW5kcyhjZW50ZXI6IElOb3RpZmljYXRpb25zQ2VudGVyQ29udHJvbGxlciwgdG9hc3RzOiBJTm90aWZpY2F0aW9uc1RvYXN0Q29udHJvbGxlciwgbW9kZWw6IE5vdGlmaWNhdGlvbnNNb2RlbCk6IHZvaWQge1xuXG5cdC8vIFNob3cgTm90aWZpY2F0aW9ucyBDbmV0ZXJcblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IFNIT1dfTk9USUZJQ0FUSU9OU19DRU5URVIsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlOKSxcblx0XHRoYW5kbGVyOiAoKSA9PiB7XG5cdFx0XHR0b2FzdHMuaGlkZSgpO1xuXHRcdFx0Y2VudGVyLnNob3coKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIEhpZGUgTm90aWZpY2F0aW9ucyBDZW50ZXJcblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IEhJREVfTk9USUZJQ0FUSU9OU19DRU5URVIsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyA1MCxcblx0XHR3aGVuOiBOb3RpZmljYXRpb25zQ2VudGVyVmlzaWJsZUNvbnRleHQsXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0aGFuZGxlcjogKCkgPT4gY2VudGVyLmhpZGUoKVxuXHR9KTtcblxuXHQvLyBUb2dnbGUgTm90aWZpY2F0aW9ucyBDZW50ZXJcblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoVE9HR0xFX05PVElGSUNBVElPTlNfQ0VOVEVSLCAoKSA9PiB7XG5cdFx0aWYgKGNlbnRlci5pc1Zpc2libGUpIHtcblx0XHRcdGNlbnRlci5oaWRlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRvYXN0cy5oaWRlKCk7XG5cdFx0XHRjZW50ZXIuc2hvdygpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gQ2xlYXIgTm90aWZpY2F0aW9uXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBDTEVBUl9OT1RJRklDQVRJT04sXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogTm90aWZpY2F0aW9uRm9jdXNlZENvbnRleHQsXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5EZWxldGUsXG5cdFx0bWFjOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NwYWNlXG5cdFx0fSxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIGFyZ3M/KSA9PiB7XG5cdFx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSA9IGFjY2Vzc29yLmdldChJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gZ2V0Tm90aWZpY2F0aW9uRnJvbUNvbnRleHQoYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSksIGFyZ3MpO1xuXHRcdFx0aWYgKG5vdGlmaWNhdGlvbiAmJiAhbm90aWZpY2F0aW9uLmhhc1Byb2dyZXNzKSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvbi5jbG9zZSgpO1xuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuY2xlYXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0Ly8gRXhwYW5kIE5vdGlmaWNhdGlvblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogRVhQQU5EX05PVElGSUNBVElPTixcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHR3aGVuOiBOb3RpZmljYXRpb25Gb2N1c2VkQ29udGV4dCxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzPykgPT4ge1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gZ2V0Tm90aWZpY2F0aW9uRnJvbUNvbnRleHQoYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSksIGFyZ3MpO1xuXHRcdFx0bm90aWZpY2F0aW9uPy5leHBhbmQoKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIEFjY2VwdCBQcmltYXJ5IEFjdGlvblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogQUNDRVBUX1BSSU1BUllfQUNUSU9OX05PVElGSUNBVElPTixcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQsIENvbnRleHRLZXlFeHByLm9yKE5vdGlmaWNhdGlvbkZvY3VzZWRDb250ZXh0LCBOb3RpZmljYXRpb25zVG9hc3RzVmlzaWJsZUNvbnRleHQpKSxcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5QSxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvblJ1bm5lciA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpLmNyZWF0ZUluc3RhbmNlKE5vdGlmaWNhdGlvbkFjdGlvblJ1bm5lcik7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb24gPSBnZXROb3RpZmljYXRpb25Gcm9tQ29udGV4dChhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSkgfHwgbW9kZWwubm90aWZpY2F0aW9ucy5hdCgwKTtcblx0XHRcdGlmICghbm90aWZpY2F0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHByaW1hcnlBY3Rpb24gPSBub3RpZmljYXRpb24uYWN0aW9ucz8ucHJpbWFyeSA/IG5vdGlmaWNhdGlvbi5hY3Rpb25zLnByaW1hcnkuYXQoMCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIXByaW1hcnlBY3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YWN0aW9uUnVubmVyLnJ1bihwcmltYXJ5QWN0aW9uLCBub3RpZmljYXRpb24pO1xuXHRcdFx0bm90aWZpY2F0aW9uLmNsb3NlKCk7XG5cdFx0XHRhY3Rpb25SdW5uZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gQ29sbGFwc2UgTm90aWZpY2F0aW9uXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBDT0xMQVBTRV9OT1RJRklDQVRJT04sXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogTm90aWZpY2F0aW9uRm9jdXNlZENvbnRleHQsXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5MZWZ0QXJyb3csXG5cdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzPykgPT4ge1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gZ2V0Tm90aWZpY2F0aW9uRnJvbUNvbnRleHQoYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSksIGFyZ3MpO1xuXHRcdFx0bm90aWZpY2F0aW9uPy5jb2xsYXBzZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gVG9nZ2xlIE5vdGlmaWNhdGlvblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogVE9HR0xFX05PVElGSUNBVElPTixcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHR3aGVuOiBOb3RpZmljYXRpb25Gb2N1c2VkQ29udGV4dCxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLlNwYWNlLFxuXHRcdHNlY29uZGFyeTogW0tleUNvZGUuRW50ZXJdLFxuXHRcdGhhbmRsZXI6IGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IGdldE5vdGlmaWNhdGlvbkZyb21Db250ZXh0KGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblx0XHRcdG5vdGlmaWNhdGlvbj8udG9nZ2xlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBIaWRlIFRvYXN0c1xuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChISURFX05PVElGSUNBVElPTl9UT0FTVCwgYWNjZXNzb3IgPT4ge1xuXHRcdHRvYXN0cy5oaWRlKCk7XG5cdH0pO1xuXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IEhJREVfTk9USUZJQ0FUSU9OX1RPQVNULFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliIC0gNTAsIC8vIGxvd2VyIHdoZW4gbm90IGZvY3VzZWQgKGUuZy4gbGV0IGVkaXRvciBzdWdnZXN0IHdpbiBvdmVyIHRoaXMgY29tbWFuZClcblx0XHR3aGVuOiBOb3RpZmljYXRpb25zVG9hc3RzVmlzaWJsZUNvbnRleHQsXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGVcblx0fSk7XG5cblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlcktleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogSElERV9OT1RJRklDQVRJT05fVE9BU1QsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxMDAsIC8vIGhpZ2hlciB3aGVuIGZvY3VzZWRcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTm90aWZpY2F0aW9uc1RvYXN0c1Zpc2libGVDb250ZXh0LCBOb3RpZmljYXRpb25Gb2N1c2VkQ29udGV4dCksXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGVcblx0fSk7XG5cblx0Ly8gRm9jdXMgVG9hc3RzXG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKEZPQ1VTX05PVElGSUNBVElPTl9UT0FTVCwgKCkgPT4gdG9hc3RzLmZvY3VzKCkpO1xuXG5cdC8vIEZvY3VzIE5leHQgVG9hc3Rcblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IEZPQ1VTX05FWFRfTk9USUZJQ0FUSU9OX1RPQVNULFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOb3RpZmljYXRpb25Gb2N1c2VkQ29udGV4dCwgTm90aWZpY2F0aW9uc1RvYXN0c1Zpc2libGVDb250ZXh0KSxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRoYW5kbGVyOiAoKSA9PiB7XG5cdFx0XHR0b2FzdHMuZm9jdXNOZXh0KCk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBGb2N1cyBQcmV2aW91cyBUb2FzdFxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogRk9DVVNfUFJFVklPVVNfTk9USUZJQ0FUSU9OX1RPQVNULFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOb3RpZmljYXRpb25Gb2N1c2VkQ29udGV4dCwgTm90aWZpY2F0aW9uc1RvYXN0c1Zpc2libGVDb250ZXh0KSxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLlVwQXJyb3csXG5cdFx0aGFuZGxlcjogKCkgPT4ge1xuXHRcdFx0dG9hc3RzLmZvY3VzUHJldmlvdXMoKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIEZvY3VzIEZpcnN0IFRvYXN0XG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBGT0NVU19GSVJTVF9OT1RJRklDQVRJT05fVE9BU1QsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5vdGlmaWNhdGlvbkZvY3VzZWRDb250ZXh0LCBOb3RpZmljYXRpb25zVG9hc3RzVmlzaWJsZUNvbnRleHQpLFxuXHRcdHByaW1hcnk6IEtleUNvZGUuUGFnZVVwLFxuXHRcdHNlY29uZGFyeTogW0tleUNvZGUuSG9tZV0sXG5cdFx0aGFuZGxlcjogKCkgPT4ge1xuXHRcdFx0dG9hc3RzLmZvY3VzRmlyc3QoKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIEZvY3VzIExhc3QgVG9hc3Rcblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IEZPQ1VTX0xBU1RfTk9USUZJQ0FUSU9OX1RPQVNULFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOb3RpZmljYXRpb25Gb2N1c2VkQ29udGV4dCwgTm90aWZpY2F0aW9uc1RvYXN0c1Zpc2libGVDb250ZXh0KSxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLlBhZ2VEb3duLFxuXHRcdHNlY29uZGFyeTogW0tleUNvZGUuRW5kXSxcblx0XHRoYW5kbGVyOiAoKSA9PiB7XG5cdFx0XHR0b2FzdHMuZm9jdXNMYXN0KCk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBDbGVhciBBbGwgTm90aWZpY2F0aW9uc1xuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChDTEVBUl9BTExfTk9USUZJQ0FUSU9OUywgKCkgPT4gY2VudGVyLmNsZWFyQWxsKCkpO1xuXG5cdC8vIFRvZ2dsZSBEbyBOb3QgRGlzdHVyYiBNb2RlXG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFRPR0dMRV9ET19OT1RfRElTVFVSQl9NT0RFLCBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLnNldEZpbHRlcihub3RpZmljYXRpb25TZXJ2aWNlLmdldEZpbHRlcigpID09PSBOb3RpZmljYXRpb25zRmlsdGVyLkVSUk9SID8gTm90aWZpY2F0aW9uc0ZpbHRlci5PRkYgOiBOb3RpZmljYXRpb25zRmlsdGVyLkVSUk9SKTtcblx0fSk7XG5cblx0Ly8gQ29uZmlndXJlIERvIE5vdCBEaXN0dXJiIGJ5IFNvdXJjZVxuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChUT0dHTEVfRE9fTk9UX0RJU1RVUkJfTU9ERV9CWV9TT1VSQ0UsIGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc29ydGVkRmlsdGVycyA9IG5vdGlmaWNhdGlvblNlcnZpY2UuZ2V0RmlsdGVycygpLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwaWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtICYgSU5vdGlmaWNhdGlvblNvdXJjZUZpbHRlcj4oKSk7XG5cblx0XHRwaWNrZXIuaXRlbXMgPSBzb3J0ZWRGaWx0ZXJzLm1hcChzb3VyY2UgPT4gKHtcblx0XHRcdGlkOiBzb3VyY2UuaWQsXG5cdFx0XHRsYWJlbDogc291cmNlLmxhYmVsLFxuXHRcdFx0dG9vbHRpcDogYCR7c291cmNlLmxhYmVsfSAoJHtzb3VyY2UuaWR9KWAsXG5cdFx0XHRmaWx0ZXI6IHNvdXJjZS5maWx0ZXJcblx0XHR9KSk7XG5cblx0XHRwaWNrZXIuY2FuU2VsZWN0TWFueSA9IHRydWU7XG5cdFx0cGlja2VyLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3NlbGVjdFNvdXJjZXMnLCBcIlNlbGVjdCBzb3VyY2VzIHRvIGVuYWJsZSBhbGwgbm90aWZpY2F0aW9ucyBmcm9tXCIpO1xuXHRcdHBpY2tlci5zZWxlY3RlZEl0ZW1zID0gcGlja2VyLml0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0uZmlsdGVyID09PSBOb3RpZmljYXRpb25zRmlsdGVyLk9GRik7XG5cblx0XHRwaWNrZXIuc2hvdygpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEFjY2VwdChhc3luYyAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgcGlja2VyLml0ZW1zKSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0RmlsdGVyKHtcblx0XHRcdFx0XHRpZDogaXRlbS5pZCxcblx0XHRcdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdFx0XHRmaWx0ZXI6IHBpY2tlci5zZWxlY3RlZEl0ZW1zLmluY2x1ZGVzKGl0ZW0pID8gTm90aWZpY2F0aW9uc0ZpbHRlci5PRkYgOiBOb3RpZmljYXRpb25zRmlsdGVyLkVSUk9SXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRIaWRlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXHR9KTtcblxuXHQvLyBDb21tYW5kcyBmb3IgQ29tbWFuZCBQYWxldHRlXG5cdGNvbnN0IGNhdGVnb3J5ID0gbG9jYWxpemUyKCdub3RpZmljYXRpb25zJywgJ05vdGlmaWNhdGlvbnMnKTtcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgeyBjb21tYW5kOiB7IGlkOiBTSE9XX05PVElGSUNBVElPTlNfQ0VOVEVSLCB0aXRsZTogbG9jYWxpemUyKCdzaG93Tm90aWZpY2F0aW9ucycsICdTaG93IE5vdGlmaWNhdGlvbnMnKSwgY2F0ZWdvcnkgfSB9KTtcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgeyBjb21tYW5kOiB7IGlkOiBISURFX05PVElGSUNBVElPTlNfQ0VOVEVSLCB0aXRsZTogbG9jYWxpemUyKCdoaWRlTm90aWZpY2F0aW9ucycsICdIaWRlIE5vdGlmaWNhdGlvbnMnKSwgY2F0ZWdvcnkgfSwgd2hlbjogTm90aWZpY2F0aW9uc0NlbnRlclZpc2libGVDb250ZXh0IH0pO1xuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IENMRUFSX0FMTF9OT1RJRklDQVRJT05TLCB0aXRsZTogbG9jYWxpemUyKCdjbGVhckFsbE5vdGlmaWNhdGlvbnMnLCAnQ2xlYXIgQWxsIE5vdGlmaWNhdGlvbnMnKSwgY2F0ZWdvcnkgfSB9KTtcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgeyBjb21tYW5kOiB7IGlkOiBBQ0NFUFRfUFJJTUFSWV9BQ1RJT05fTk9USUZJQ0FUSU9OLCB0aXRsZTogbG9jYWxpemUyKCdhY2NlcHROb3RpZmljYXRpb25QcmltYXJ5QWN0aW9uJywgJ0FjY2VwdCBOb3RpZmljYXRpb24gUHJpbWFyeSBBY3Rpb24nKSwgY2F0ZWdvcnkgfSB9KTtcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgeyBjb21tYW5kOiB7IGlkOiBUT0dHTEVfRE9fTk9UX0RJU1RVUkJfTU9ERSwgdGl0bGU6IGxvY2FsaXplMigndG9nZ2xlRG9Ob3REaXN0dXJiTW9kZScsICdUb2dnbGUgRG8gTm90IERpc3R1cmIgTW9kZScpLCBjYXRlZ29yeSB9IH0pO1xuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IFRPR0dMRV9ET19OT1RfRElTVFVSQl9NT0RFX0JZX1NPVVJDRSwgdGl0bGU6IGxvY2FsaXplMigndG9nZ2xlRG9Ob3REaXN0dXJiTW9kZUJ5U291cmNlJywgJ1RvZ2dsZSBEbyBOb3QgRGlzdHVyYiBNb2RlIEJ5IFNvdXJjZS4uLicpLCBjYXRlZ29yeSB9IH0pO1xuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IEZPQ1VTX05PVElGSUNBVElPTl9UT0FTVCwgdGl0bGU6IGxvY2FsaXplMignZm9jdXNOb3RpZmljYXRpb25Ub2FzdHMnLCAnRm9jdXMgTm90aWZpY2F0aW9uIFRvYXN0JyksIGNhdGVnb3J5IH0sIHdoZW46IE5vdGlmaWNhdGlvbnNUb2FzdHNWaXNpYmxlQ29udGV4dCB9KTtcblxuXHQvLyBCZWxsIGljb24gaW4gdGhlIHRpdGxlIGJhciAod2hlbiBub3RpZmljYXRpb25zIGFyZSBwb3NpdGlvbmVkIGF0IHRvcC1yaWdodClcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UaXRsZUJhciwge1xuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiBUT0dHTEVfTk9USUZJQ0FUSU9OU19DRU5URVIsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3RvZ2dsZU5vdGlmaWNhdGlvbnMnLCBcIlRvZ2dsZSBOb3RpZmljYXRpb25zXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5iZWxsLFxuXHRcdH0sXG5cdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRvcmRlcjogMTAwMDAsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtOb3RpZmljYXRpb25zU2V0dGluZ3MuTk9USUZJQ0FUSU9OU19QT1NJVElPTn1gLCBOb3RpZmljYXRpb25zUG9zaXRpb24uVE9QX1JJR0hUKSxcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Tm90aWZpY2F0aW9uc1NldHRpbmdzLk5PVElGSUNBVElPTlNfQlVUVE9OfWAsIHRydWUpXG5cdFx0KVxuXHR9KTtcbn1cblxuLy8gTm90aWZpY2F0aW9uIFBvc2l0aW9uIEFjdGlvbnNcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFNldE5vdGlmaWNhdGlvbnNQb3NpdGlvbkJvdHRvbVJpZ2h0IGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5zZXROb3RpZmljYXRpb25zUG9zaXRpb24uYm90dG9tUmlnaHQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncG9zaXRpb25Cb3R0b21SaWdodCcsICdCb3R0b20gUmlnaHQnKSxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Tm90aWZpY2F0aW9uc1NldHRpbmdzLk5PVElGSUNBVElPTlNfUE9TSVRJT059YCwgTm90aWZpY2F0aW9uc1Bvc2l0aW9uLkJPVFRPTV9SSUdIVCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTm90aWZpY2F0aW9uc0NlbnRlclBvc2l0aW9uTWVudSxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKS51cGRhdGVWYWx1ZShOb3RpZmljYXRpb25zU2V0dGluZ3MuTk9USUZJQ0FUSU9OU19QT1NJVElPTiwgTm90aWZpY2F0aW9uc1Bvc2l0aW9uLkJPVFRPTV9SSUdIVCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgU2V0Tm90aWZpY2F0aW9uc1Bvc2l0aW9uQm90dG9tTGVmdCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc2V0Tm90aWZpY2F0aW9uc1Bvc2l0aW9uLmJvdHRvbUxlZnQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncG9zaXRpb25Cb3R0b21MZWZ0JywgJ0JvdHRvbSBMZWZ0JyksXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke05vdGlmaWNhdGlvbnNTZXR0aW5ncy5OT1RJRklDQVRJT05TX1BPU0lUSU9OfWAsIE5vdGlmaWNhdGlvbnNQb3NpdGlvbi5CT1RUT01fTEVGVCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTm90aWZpY2F0aW9uc0NlbnRlclBvc2l0aW9uTWVudSxcblx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKS51cGRhdGVWYWx1ZShOb3RpZmljYXRpb25zU2V0dGluZ3MuTk9USUZJQ0FUSU9OU19QT1NJVElPTiwgTm90aWZpY2F0aW9uc1Bvc2l0aW9uLkJPVFRPTV9MRUZUKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTZXROb3RpZmljYXRpb25zUG9zaXRpb25Ub3BSaWdodCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc2V0Tm90aWZpY2F0aW9uc1Bvc2l0aW9uLnRvcFJpZ2h0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Bvc2l0aW9uVG9wUmlnaHQnLCAnVG9wIFJpZ2h0JyksXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke05vdGlmaWNhdGlvbnNTZXR0aW5ncy5OT1RJRklDQVRJT05TX1BPU0lUSU9OfWAsIE5vdGlmaWNhdGlvbnNQb3NpdGlvbi5UT1BfUklHSFQpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLk5vdGlmaWNhdGlvbnNDZW50ZXJQb3NpdGlvbk1lbnUsXG5cdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0YWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkudXBkYXRlVmFsdWUoTm90aWZpY2F0aW9uc1NldHRpbmdzLk5PVElGSUNBVElPTlNfUE9TSVRJT04sIE5vdGlmaWNhdGlvbnNQb3NpdGlvbi5UT1BfUklHSFQpO1xuXHR9XG59KTtcblxuXG5leHBvcnQgY2xhc3MgTm90aWZpY2F0aW9uQWN0aW9uUnVubmVyIGV4dGVuZHMgQWN0aW9uUnVubmVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIHJ1bkFjdGlvbihhY3Rpb246IElBY3Rpb24sIGNvbnRleHQ6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiBhY3Rpb24uaWQsIGZyb206ICdtZXNzYWdlJyB9KTtcblxuXHRcdC8vIFJ1biBhbmQgbWFrZSBzdXJlIHRvIG5vdGlmeSBvbiBhbnkgZXJyb3IgYWdhaW5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc3VwZXIucnVuQWN0aW9uKGFjdGlvbiwgY29udGV4dCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCLHdCQUF3QjtBQUN0RCxTQUFTLFVBQVUsU0FBUyxjQUFjO0FBQzFDLFNBQWdDLHdCQUE0Qyx1QkFBdUIsNkJBQTZCO0FBQ2hJLFNBQVMsU0FBUyxjQUFjLFFBQVEsdUJBQXVCO0FBQy9ELFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxjQUFjLHFCQUFxQjtBQUM1QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QixtQ0FBbUMseUNBQXlDO0FBQ2pILFNBQVMsc0JBQWlELDJCQUEyQjtBQUNyRixTQUFTLDZCQUErQztBQUN4RCxTQUFTLG9CQUFrRztBQUMzRyxTQUFTLDBCQUEwQztBQUNuRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHFCQUFxQixtQ0FBbUM7QUFDakUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMENBQTBDO0FBRzVDLE1BQU0sNEJBQTRCO0FBQ2xDLE1BQU0sNEJBQTRCO0FBQ3pDLE1BQU0sOEJBQThCO0FBRzdCLE1BQU0sMEJBQTBCO0FBQ3ZDLE1BQU0sMkJBQTJCO0FBQ2pDLE1BQU0sZ0NBQWdDO0FBQ3RDLE1BQU0sb0NBQW9DO0FBQzFDLE1BQU0saUNBQWlDO0FBQ3ZDLE1BQU0sZ0NBQWdDO0FBRy9CLE1BQU0sd0JBQXdCO0FBQzlCLE1BQU0sc0JBQXNCO0FBQzVCLE1BQU0scUNBQXFDO0FBQ2xELE1BQU0sc0JBQXNCO0FBQ3JCLE1BQU0scUJBQXFCO0FBQzNCLE1BQU0sMEJBQTBCO0FBQ2hDLE1BQU0sNkJBQTZCO0FBQ25DLE1BQU0sdUNBQXVDO0FBcUI3QyxTQUFTLDJCQUEyQixhQUEyQixT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
