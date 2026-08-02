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
import "./media/notificationsCenter.css";
import "./media/notificationsActions.css";
import { NOTIFICATIONS_CENTER_HEADER_FOREGROUND, NOTIFICATIONS_CENTER_HEADER_BACKGROUND, NOTIFICATIONS_CENTER_BORDER } from "../../../common/theme.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { NotificationChangeType, NotificationViewItemContentChangeKind, NotificationsSettings, NotificationsPosition, getNotificationsPosition } from "../../../common/notifications.js";
import { IWorkbenchLayoutService, Parts } from "../../../services/layout/browser/layoutService.js";
import { Emitter } from "../../../../base/common/event.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { NotificationActionRunner } from "./notificationsCommands.js";
import { NotificationsList } from "./notificationsList.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { $, Dimension, isAncestorOfActiveElement } from "../../../../base/browser/dom.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { localize } from "../../../../nls.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ClearAllNotificationsAction, ConfigureDoNotDisturbAction, ConfigureNotificationsPositionAction, ToggleDoNotDisturbBySourceAction, HideNotificationsCenterAction, ToggleDoNotDisturbAction, hideIcon, hideUpIcon } from "./notificationsActions.js";
import { Separator, toAction } from "../../../../base/common/actions.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { assertReturnsAllDefined, assertReturnsDefined } from "../../../../base/common/types.js";
import { NotificationsCenterVisibleContext } from "../../../common/contextkeys.js";
import { INotificationService, NotificationsFilter } from "../../../../platform/notification/common/notification.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { DropdownMenuActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { DEFAULT_CUSTOM_TITLEBAR_HEIGHT } from "../../../../platform/window/common/window.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
let NotificationsCenter = class extends Themable {
  constructor(container, model, themeService, instantiationService, layoutService, contextKeyService, editorGroupService, keybindingService, notificationService, accessibilitySignalService, contextMenuService, configurationService, menuService) {
    super(themeService);
    this.container = container;
    this.model = model;
    this.instantiationService = instantiationService;
    this.layoutService = layoutService;
    this.contextKeyService = contextKeyService;
    this.editorGroupService = editorGroupService;
    this.keybindingService = keybindingService;
    this.notificationService = notificationService;
    this.accessibilitySignalService = accessibilitySignalService;
    this.contextMenuService = contextMenuService;
    this.configurationService = configurationService;
    this.menuService = menuService;
    // maximum number of notification sources to show in configure dropdown
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this.notificationsCenterVisibleContextKey = NotificationsCenterVisibleContext.bindTo(contextKeyService);
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.model.onDidChangeNotification((e) => this.onDidChangeNotification(e)));
    this._register(this.layoutService.onDidLayoutMainContainer((dimension) => this.layout(Dimension.lift(dimension))));
    this._register(this.notificationService.onDidChangeFilter(() => this.onDidChangeFilter()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotificationsSettings.NOTIFICATIONS_POSITION)) {
        this.updatePositionClass();
      }
    }));
  }
  updatePositionClass() {
    if (!this.notificationsCenterContainer) {
      return;
    }
    const position = getNotificationsPosition(this.configurationService);
    this.notificationsCenterContainer.classList.remove("bottom-right", "bottom-left", "top-right");
    this.notificationsCenterContainer.classList.add(position);
    this.updateHideActionIcon();
    this.updateTopOffset();
  }
  updateHideActionIcon() {
    if (!this.hideAction) {
      return;
    }
    const position = getNotificationsPosition(this.configurationService);
    this.hideAction.class = ThemeIcon.asClassName(position === NotificationsPosition.TOP_RIGHT ? hideUpIcon : hideIcon);
  }
  updateTopOffset() {
    if (!this.notificationsCenterContainer) {
      return;
    }
    const position = getNotificationsPosition(this.configurationService);
    if (position === NotificationsPosition.TOP_RIGHT) {
      let topOffset = 7;
      if (this.layoutService.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
        topOffset += DEFAULT_CUSTOM_TITLEBAR_HEIGHT;
      }
      this.notificationsCenterContainer.style.top = `${topOffset}px`;
    } else {
      this.notificationsCenterContainer.style.top = "";
    }
  }
  onDidChangeFilter() {
    if (this.notificationService.getFilter() === NotificationsFilter.ERROR) {
      this.hide();
    }
  }
  get isVisible() {
    return !!this._isVisible;
  }
  show() {
    if (this._isVisible) {
      const notificationsList2 = assertReturnsDefined(this.notificationsList);
      notificationsList2.show();
      notificationsList2.focusFirst();
      return;
    }
    if (!this.notificationsCenterContainer) {
      this.create();
    }
    this.updateTitle();
    const [notificationsList, notificationsCenterContainer] = assertReturnsAllDefined(this.notificationsList, this.notificationsCenterContainer);
    this._isVisible = true;
    notificationsCenterContainer.classList.add("visible");
    notificationsList.show();
    this.layout(this.workbenchDimensions);
    notificationsList.updateNotificationsList(0, 0, this.model.notifications);
    notificationsList.focusFirst();
    this.updateStyles();
    this.model.notifications.forEach((notification) => notification.updateVisibility(true));
    this.notificationsCenterVisibleContextKey.set(true);
    this._onDidChangeVisibility.fire();
  }
  updateTitle() {
    const [notificationsCenterTitle, clearAllAction] = assertReturnsAllDefined(this.notificationsCenterTitle, this.clearAllAction);
    if (this.model.notifications.length === 0) {
      notificationsCenterTitle.textContent = localize("notificationsEmpty", "No new notifications");
      clearAllAction.enabled = false;
    } else {
      notificationsCenterTitle.textContent = localize("notifications", "Notifications");
      clearAllAction.enabled = this.model.notifications.some((notification) => !notification.hasProgress);
    }
  }
  create() {
    this.notificationsCenterContainer = $(".notifications-center");
    this.updatePositionClass();
    this.notificationsCenterHeader = $(".notifications-center-header");
    this.notificationsCenterContainer.appendChild(this.notificationsCenterHeader);
    this.notificationsCenterTitle = $("span.notifications-center-header-title");
    this.notificationsCenterHeader.appendChild(this.notificationsCenterTitle);
    const toolbarContainer = $(".notifications-center-header-toolbar");
    this.notificationsCenterHeader.appendChild(toolbarContainer);
    const actionRunner = this._register(this.instantiationService.createInstance(NotificationActionRunner));
    const that = this;
    const notificationsToolBar = this._register(new ActionBar(toolbarContainer, {
      ariaLabel: localize("notificationsToolbar", "Notification Center Actions"),
      actionRunner,
      actionViewItemProvider: (action, options) => {
        if (action.id === ConfigureNotificationsPositionAction.ID) {
          return this._register(this.instantiationService.createInstance(DropdownMenuActionViewItem, action, {
            getActions: () => Separator.join(...this.menuService.getMenuActions(MenuId.NotificationsCenterPositionMenu, this.contextKeyService).map(([, actions]) => actions))
          }, this.contextMenuService, {
            ...options,
            actionRunner,
            classNames: action.class,
            keybindingProvider: (action2) => this.keybindingService.lookupKeybinding(action2.id)
          }));
        }
        if (action.id === ConfigureDoNotDisturbAction.ID) {
          return this._register(this.instantiationService.createInstance(DropdownMenuActionViewItem, action, {
            getActions() {
              const actions = [toAction({
                id: ToggleDoNotDisturbAction.ID,
                label: that.notificationService.getFilter() === NotificationsFilter.OFF ? localize("turnOnNotifications", "Enable Do Not Disturb Mode") : localize("turnOffNotifications", "Disable Do Not Disturb Mode"),
                run: () => that.notificationService.setFilter(that.notificationService.getFilter() === NotificationsFilter.OFF ? NotificationsFilter.ERROR : NotificationsFilter.OFF)
              })];
              const sortedFilters = that.notificationService.getFilters().sort((a, b) => a.label.localeCompare(b.label));
              for (const source of sortedFilters.slice(0, NotificationsCenter.MAX_NOTIFICATION_SOURCES)) {
                if (actions.length === 1) {
                  actions.push(new Separator());
                }
                actions.push(toAction({
                  id: `${ToggleDoNotDisturbAction.ID}.${source.id}`,
                  label: source.label,
                  checked: source.filter !== NotificationsFilter.ERROR,
                  run: () => that.notificationService.setFilter({
                    ...source,
                    filter: source.filter === NotificationsFilter.ERROR ? NotificationsFilter.OFF : NotificationsFilter.ERROR
                  })
                }));
              }
              if (sortedFilters.length > NotificationsCenter.MAX_NOTIFICATION_SOURCES) {
                actions.push(new Separator());
                actions.push(that._register(that.instantiationService.createInstance(ToggleDoNotDisturbBySourceAction, ToggleDoNotDisturbBySourceAction.ID, localize("moreSources", "More\u2026"))));
              }
              return actions;
            }
          }, this.contextMenuService, {
            ...options,
            actionRunner,
            classNames: action.class,
            keybindingProvider: (action2) => this.keybindingService.lookupKeybinding(action2.id)
          }));
        }
        return createActionViewItem(this.instantiationService, action, options);
      }
    }));
    this.clearAllAction = this._register(this.instantiationService.createInstance(ClearAllNotificationsAction, ClearAllNotificationsAction.ID, ClearAllNotificationsAction.LABEL));
    notificationsToolBar.push(this.clearAllAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(this.clearAllAction) });
    this.configureDoNotDisturbAction = this._register(this.instantiationService.createInstance(ConfigureDoNotDisturbAction, ConfigureDoNotDisturbAction.ID, ConfigureDoNotDisturbAction.LABEL));
    notificationsToolBar.push(this.configureDoNotDisturbAction, { icon: true, label: false });
    const configureNotificationsPositionAction = this._register(this.instantiationService.createInstance(ConfigureNotificationsPositionAction, ConfigureNotificationsPositionAction.ID, ConfigureNotificationsPositionAction.LABEL));
    notificationsToolBar.push(configureNotificationsPositionAction, { icon: true, label: false });
    this.hideAction = this._register(this.instantiationService.createInstance(HideNotificationsCenterAction, HideNotificationsCenterAction.ID, HideNotificationsCenterAction.LABEL));
    this.updateHideActionIcon();
    notificationsToolBar.push(this.hideAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(this.hideAction) });
    this.notificationsList = this.instantiationService.createInstance(NotificationsList, this.notificationsCenterContainer, {
      widgetAriaLabel: localize("notificationsCenterWidgetAriaLabel", "Notifications Center")
    });
    this.container.appendChild(this.notificationsCenterContainer);
  }
  getKeybindingLabel(action) {
    const keybinding = this.keybindingService.lookupKeybinding(action.id);
    return keybinding ? keybinding.getLabel() : null;
  }
  onDidChangeNotification(e) {
    if (!this._isVisible) {
      return;
    }
    let focusEditor = false;
    const [notificationsList, notificationsCenterContainer] = assertReturnsAllDefined(this.notificationsList, this.notificationsCenterContainer);
    switch (e.kind) {
      case NotificationChangeType.ADD:
        notificationsList.updateNotificationsList(e.index, 0, [e.item]);
        e.item.updateVisibility(true);
        break;
      case NotificationChangeType.CHANGE:
        switch (e.detail) {
          case NotificationViewItemContentChangeKind.ACTIONS:
            notificationsList.updateNotificationsList(e.index, 1, [e.item]);
            break;
          case NotificationViewItemContentChangeKind.MESSAGE:
            if (e.item.expanded) {
              notificationsList.updateNotificationHeight(e.item);
            }
            break;
        }
        break;
      case NotificationChangeType.EXPAND_COLLAPSE:
        notificationsList.updateNotificationsList(e.index, 1, [e.item]);
        break;
      case NotificationChangeType.REMOVE:
        focusEditor = isAncestorOfActiveElement(notificationsCenterContainer);
        notificationsList.updateNotificationsList(e.index, 1);
        e.item.updateVisibility(false);
        break;
    }
    this.updateTitle();
    if (this.model.notifications.length === 0) {
      this.hide();
      if (focusEditor) {
        this.editorGroupService.activeGroup.focus();
      }
    }
  }
  hide() {
    if (!this._isVisible || !this.notificationsCenterContainer || !this.notificationsList) {
      return;
    }
    const focusEditor = isAncestorOfActiveElement(this.notificationsCenterContainer);
    this._isVisible = false;
    this.notificationsCenterContainer.classList.remove("visible");
    this.notificationsList.hide();
    this.model.notifications.forEach((notification) => notification.updateVisibility(false));
    this.notificationsCenterVisibleContextKey.set(false);
    this._onDidChangeVisibility.fire();
    if (focusEditor) {
      this.editorGroupService.activeGroup.focus();
    }
  }
  updateStyles() {
    if (this.notificationsCenterContainer && this.notificationsCenterHeader) {
      const borderColor = this.getColor(NOTIFICATIONS_CENTER_BORDER);
      this.notificationsCenterContainer.style.border = borderColor ? `1px solid ${borderColor}` : "";
      const headerForeground = this.getColor(NOTIFICATIONS_CENTER_HEADER_FOREGROUND);
      this.notificationsCenterHeader.style.color = headerForeground ?? "";
      const headerBackground = this.getColor(NOTIFICATIONS_CENTER_HEADER_BACKGROUND);
      this.notificationsCenterHeader.style.background = headerBackground ?? "";
    }
  }
  layout(dimension) {
    this.workbenchDimensions = dimension;
    if (this._isVisible && this.notificationsCenterContainer) {
      const maxWidth = NotificationsCenter.MAX_DIMENSIONS.width;
      const maxHeight = NotificationsCenter.MAX_DIMENSIONS.height;
      let availableWidth = maxWidth;
      let availableHeight = maxHeight;
      if (this.workbenchDimensions) {
        availableWidth = this.workbenchDimensions.width;
        availableWidth -= 2 * 8;
        availableHeight = this.workbenchDimensions.height - 35;
        if (this.layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow)) {
          availableHeight -= 22;
        }
        if (this.layoutService.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
          availableHeight -= 22;
        }
        availableHeight -= 2 * 12;
      }
      this.updateTopOffset();
      const notificationsList = assertReturnsDefined(this.notificationsList);
      notificationsList.layout(Math.min(maxWidth, availableWidth), Math.min(maxHeight, availableHeight));
    }
  }
  clearAll() {
    this.hide();
    for (const notification of [...this.model.notifications]) {
      if (!notification.hasProgress) {
        notification.close();
      }
      this.accessibilitySignalService.playSignal(AccessibilitySignal.clear);
    }
  }
};
NotificationsCenter.MAX_DIMENSIONS = new Dimension(450, 400);
NotificationsCenter.MAX_NOTIFICATION_SOURCES = 10;
NotificationsCenter = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IWorkbenchLayoutService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IEditorGroupsService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, INotificationService),
  __decorateParam(9, IAccessibilitySignalService),
  __decorateParam(10, IContextMenuService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IMenuService)
], NotificationsCenter);
export {
  NotificationsCenter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL25vdGlmaWNhdGlvbnMvbm90aWZpY2F0aW9uc0NlbnRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9ub3RpZmljYXRpb25zQ2VudGVyLmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvbm90aWZpY2F0aW9uc0FjdGlvbnMuY3NzJztcbmltcG9ydCB7IE5PVElGSUNBVElPTlNfQ0VOVEVSX0hFQURFUl9GT1JFR1JPVU5ELCBOT1RJRklDQVRJT05TX0NFTlRFUl9IRUFERVJfQkFDS0dST1VORCwgTk9USUZJQ0FUSU9OU19DRU5URVJfQk9SREVSIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UsIFRoZW1hYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uc01vZGVsLCBJTm90aWZpY2F0aW9uQ2hhbmdlRXZlbnQsIE5vdGlmaWNhdGlvbkNoYW5nZVR5cGUsIE5vdGlmaWNhdGlvblZpZXdJdGVtQ29udGVudENoYW5nZUtpbmQsIE5vdGlmaWNhdGlvbnNTZXR0aW5ncywgTm90aWZpY2F0aW9uc1Bvc2l0aW9uLCBnZXROb3RpZmljYXRpb25zUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90aWZpY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25zQ2VudGVyQ29udHJvbGxlciwgTm90aWZpY2F0aW9uQWN0aW9uUnVubmVyIH0gZnJvbSAnLi9ub3RpZmljYXRpb25zQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uc0xpc3QgfSBmcm9tICcuL25vdGlmaWNhdGlvbnNMaXN0LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgJCwgRGltZW5zaW9uLCBpc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBDbGVhckFsbE5vdGlmaWNhdGlvbnNBY3Rpb24sIENvbmZpZ3VyZURvTm90RGlzdHVyYkFjdGlvbiwgQ29uZmlndXJlTm90aWZpY2F0aW9uc1Bvc2l0aW9uQWN0aW9uLCBUb2dnbGVEb05vdERpc3R1cmJCeVNvdXJjZUFjdGlvbiwgSGlkZU5vdGlmaWNhdGlvbnNDZW50ZXJBY3Rpb24sIFRvZ2dsZURvTm90RGlzdHVyYkFjdGlvbiwgaGlkZUljb24sIGhpZGVVcEljb24gfSBmcm9tICcuL25vdGlmaWNhdGlvbnNBY3Rpb25zLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIFNlcGFyYXRvciwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNBbGxEZWZpbmVkLCBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IE5vdGlmaWNhdGlvbnNDZW50ZXJWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgTm90aWZpY2F0aW9uc0ZpbHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2Ryb3Bkb3duL2Ryb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVNpZ25hbCwgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgREVGQVVMVF9DVVNUT01fVElUTEVCQVJfSEVJR0hUIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcblxuZXhwb3J0IGNsYXNzIE5vdGlmaWNhdGlvbnNDZW50ZXIgZXh0ZW5kcyBUaGVtYWJsZSBpbXBsZW1lbnRzIElOb3RpZmljYXRpb25zQ2VudGVyQ29udHJvbGxlciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0RJTUVOU0lPTlMgPSBuZXcgRGltZW5zaW9uKDQ1MCwgNDAwKTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfTk9USUZJQ0FUSU9OX1NPVVJDRVMgPSAxMDsgLy8gbWF4aW11bSBudW1iZXIgb2Ygbm90aWZpY2F0aW9uIHNvdXJjZXMgdG8gc2hvdyBpbiBjb25maWd1cmUgZHJvcGRvd25cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgbm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbm90aWZpY2F0aW9uc0NlbnRlckhlYWRlcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbm90aWZpY2F0aW9uc0NlbnRlclRpdGxlOiBIVE1MU3BhbkVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbm90aWZpY2F0aW9uc0xpc3Q6IE5vdGlmaWNhdGlvbnNMaXN0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc1Zpc2libGU6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgd29ya2JlbmNoRGltZW5zaW9uczogRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvbnNDZW50ZXJWaXNpYmxlQ29udGV4dEtleTtcblx0cHJpdmF0ZSBjbGVhckFsbEFjdGlvbjogQ2xlYXJBbGxOb3RpZmljYXRpb25zQWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbmZpZ3VyZURvTm90RGlzdHVyYkFjdGlvbjogQ29uZmlndXJlRG9Ob3REaXN0dXJiQWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGhpZGVBY3Rpb246IEhpZGVOb3RpZmljYXRpb25zQ2VudGVyQWN0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsOiBJTm90aWZpY2F0aW9uc01vZGVsLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHRoZW1lU2VydmljZSk7XG5cblx0XHR0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJWaXNpYmxlQ29udGV4dEtleSA9IE5vdGlmaWNhdGlvbnNDZW50ZXJWaXNpYmxlQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uKGUgPT4gdGhpcy5vbkRpZENoYW5nZU5vdGlmaWNhdGlvbihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGF5b3V0U2VydmljZS5vbkRpZExheW91dE1haW5Db250YWluZXIoZGltZW5zaW9uID0+IHRoaXMubGF5b3V0KERpbWVuc2lvbi5saWZ0KGRpbWVuc2lvbikpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRmlsdGVyKCgpID0+IHRoaXMub25EaWRDaGFuZ2VGaWx0ZXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90aWZpY2F0aW9uc1NldHRpbmdzLk5PVElGSUNBVElPTlNfUE9TSVRJT04pKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlUG9zaXRpb25DbGFzcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUG9zaXRpb25DbGFzcygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gZ2V0Tm90aWZpY2F0aW9uc1Bvc2l0aW9uKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMubm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdib3R0b20tcmlnaHQnLCAnYm90dG9tLWxlZnQnLCAndG9wLXJpZ2h0Jyk7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQocG9zaXRpb24pO1xuXG5cdFx0dGhpcy51cGRhdGVIaWRlQWN0aW9uSWNvbigpO1xuXHRcdHRoaXMudXBkYXRlVG9wT2Zmc2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUhpZGVBY3Rpb25JY29uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5oaWRlQWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBnZXROb3RpZmljYXRpb25zUG9zaXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5oaWRlQWN0aW9uLmNsYXNzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHBvc2l0aW9uID09PSBOb3RpZmljYXRpb25zUG9zaXRpb24uVE9QX1JJR0hUID8gaGlkZVVwSWNvbiA6IGhpZGVJY29uKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVG9wT2Zmc2V0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBnZXROb3RpZmljYXRpb25zUG9zaXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aWYgKHBvc2l0aW9uID09PSBOb3RpZmljYXRpb25zUG9zaXRpb24uVE9QX1JJR0hUKSB7XG5cdFx0XHRsZXQgdG9wT2Zmc2V0ID0gNztcblx0XHRcdGlmICh0aGlzLmxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlRJVExFQkFSX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdHRvcE9mZnNldCArPSBERUZBVUxUX0NVU1RPTV9USVRMRUJBUl9IRUlHSFQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXIuc3R5bGUudG9wID0gYCR7dG9wT2Zmc2V0fXB4YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyLnN0eWxlLnRvcCA9ICcnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VGaWx0ZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5nZXRGaWx0ZXIoKSA9PT0gTm90aWZpY2F0aW9uc0ZpbHRlci5FUlJPUikge1xuXHRcdFx0dGhpcy5oaWRlKCk7IC8vIGhpZGUgdGhlIG5vdGlmaWNhdGlvbiBjZW50ZXIgd2hlbiB3ZSBoYXZlIGEgZXJyb3IgZmlsdGVyIGVuYWJsZWRcblx0XHR9XG5cdH1cblxuXHRnZXQgaXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2lzVmlzaWJsZTtcblx0fVxuXG5cdHNob3coKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uc0xpc3QgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLm5vdGlmaWNhdGlvbnNMaXN0KTtcblxuXHRcdFx0Ly8gTWFrZSB2aXNpYmxlXG5cdFx0XHRub3RpZmljYXRpb25zTGlzdC5zaG93KCk7XG5cblx0XHRcdC8vIEZvY3VzIGZpcnN0XG5cdFx0XHRub3RpZmljYXRpb25zTGlzdC5mb2N1c0ZpcnN0KCk7XG5cblx0XHRcdHJldHVybjsgLy8gYWxyZWFkeSB2aXNpYmxlXG5cdFx0fVxuXG5cdFx0Ly8gTGF6aWx5IGNyZWF0ZSBpZiBzaG93aW5nIGZvciB0aGUgZmlyc3QgdGltZVxuXHRcdGlmICghdGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZSgpO1xuXHRcdH1cblxuXHRcdC8vIFRpdGxlXG5cdFx0dGhpcy51cGRhdGVUaXRsZSgpO1xuXG5cdFx0Ly8gTWFrZSB2aXNpYmxlXG5cdFx0Y29uc3QgW25vdGlmaWNhdGlvbnNMaXN0LCBub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyXSA9IGFzc2VydFJldHVybnNBbGxEZWZpbmVkKHRoaXMubm90aWZpY2F0aW9uc0xpc3QsIHRoaXMubm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lcik7XG5cdFx0dGhpcy5faXNWaXNpYmxlID0gdHJ1ZTtcblx0XHRub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblx0XHRub3RpZmljYXRpb25zTGlzdC5zaG93KCk7XG5cblx0XHQvLyBMYXlvdXRcblx0XHR0aGlzLmxheW91dCh0aGlzLndvcmtiZW5jaERpbWVuc2lvbnMpO1xuXG5cdFx0Ly8gU2hvdyBhbGwgbm90aWZpY2F0aW9ucyB0aGF0IGFyZSBwcmVzZW50IG5vd1xuXHRcdG5vdGlmaWNhdGlvbnNMaXN0LnVwZGF0ZU5vdGlmaWNhdGlvbnNMaXN0KDAsIDAsIHRoaXMubW9kZWwubm90aWZpY2F0aW9ucyk7XG5cblx0XHQvLyBGb2N1cyBmaXJzdFxuXHRcdG5vdGlmaWNhdGlvbnNMaXN0LmZvY3VzRmlyc3QoKTtcblxuXHRcdC8vIFRoZW1pbmdcblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXG5cdFx0Ly8gTWFyayBhcyB2aXNpYmxlXG5cdFx0dGhpcy5tb2RlbC5ub3RpZmljYXRpb25zLmZvckVhY2gobm90aWZpY2F0aW9uID0+IG5vdGlmaWNhdGlvbi51cGRhdGVWaXNpYmlsaXR5KHRydWUpKTtcblxuXHRcdC8vIENvbnRleHQgS2V5XG5cdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVyVmlzaWJsZUNvbnRleHRLZXkuc2V0KHRydWUpO1xuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUaXRsZSgpOiB2b2lkIHtcblx0XHRjb25zdCBbbm90aWZpY2F0aW9uc0NlbnRlclRpdGxlLCBjbGVhckFsbEFjdGlvbl0gPSBhc3NlcnRSZXR1cm5zQWxsRGVmaW5lZCh0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJUaXRsZSwgdGhpcy5jbGVhckFsbEFjdGlvbik7XG5cblx0XHRpZiAodGhpcy5tb2RlbC5ub3RpZmljYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0bm90aWZpY2F0aW9uc0NlbnRlclRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vdGlmaWNhdGlvbnNFbXB0eScsIFwiTm8gbmV3IG5vdGlmaWNhdGlvbnNcIik7XG5cdFx0XHRjbGVhckFsbEFjdGlvbi5lbmFibGVkID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5vdGlmaWNhdGlvbnNDZW50ZXJUaXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub3RpZmljYXRpb25zJywgXCJOb3RpZmljYXRpb25zXCIpO1xuXHRcdFx0Y2xlYXJBbGxBY3Rpb24uZW5hYmxlZCA9IHRoaXMubW9kZWwubm90aWZpY2F0aW9ucy5zb21lKG5vdGlmaWNhdGlvbiA9PiAhbm90aWZpY2F0aW9uLmhhc1Byb2dyZXNzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZSgpOiB2b2lkIHtcblxuXHRcdC8vIENvbnRhaW5lclxuXHRcdHRoaXMubm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lciA9ICQoJy5ub3RpZmljYXRpb25zLWNlbnRlcicpO1xuXG5cdFx0Ly8gQXBwbHkgcG9zaXRpb24gY2xhc3Ncblx0XHR0aGlzLnVwZGF0ZVBvc2l0aW9uQ2xhc3MoKTtcblxuXHRcdC8vIEhlYWRlclxuXHRcdHRoaXMubm90aWZpY2F0aW9uc0NlbnRlckhlYWRlciA9ICQoJy5ub3RpZmljYXRpb25zLWNlbnRlci1oZWFkZXInKTtcblx0XHR0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5ub3RpZmljYXRpb25zQ2VudGVySGVhZGVyKTtcblxuXHRcdC8vIEhlYWRlciBUaXRsZVxuXHRcdHRoaXMubm90aWZpY2F0aW9uc0NlbnRlclRpdGxlID0gJCgnc3Bhbi5ub3RpZmljYXRpb25zLWNlbnRlci1oZWFkZXItdGl0bGUnKTtcblx0XHR0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJIZWFkZXIuYXBwZW5kQ2hpbGQodGhpcy5ub3RpZmljYXRpb25zQ2VudGVyVGl0bGUpO1xuXG5cdFx0Ly8gSGVhZGVyIFRvb2xiYXJcblx0XHRjb25zdCB0b29sYmFyQ29udGFpbmVyID0gJCgnLm5vdGlmaWNhdGlvbnMtY2VudGVyLWhlYWRlci10b29sYmFyJyk7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVySGVhZGVyLmFwcGVuZENoaWxkKHRvb2xiYXJDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgYWN0aW9uUnVubmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RpZmljYXRpb25BY3Rpb25SdW5uZXIpKTtcblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnNUb29sQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcih0b29sYmFyQ29udGFpbmVyLCB7XG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdub3RpZmljYXRpb25zVG9vbGJhcicsIFwiTm90aWZpY2F0aW9uIENlbnRlciBBY3Rpb25zXCIpLFxuXHRcdFx0YWN0aW9uUnVubmVyLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSBDb25maWd1cmVOb3RpZmljYXRpb25zUG9zaXRpb25BY3Rpb24uSUQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7XG5cdFx0XHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBTZXBhcmF0b3Iuam9pbiguLi50aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5Ob3RpZmljYXRpb25zQ2VudGVyUG9zaXRpb25NZW51LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKS5tYXAoKFssIGFjdGlvbnNdKSA9PiBhY3Rpb25zKSksXG5cdFx0XHRcdFx0fSwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIHtcblx0XHRcdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdFx0XHRhY3Rpb25SdW5uZXIsXG5cdFx0XHRcdFx0XHRjbGFzc05hbWVzOiBhY3Rpb24uY2xhc3MsXG5cdFx0XHRcdFx0XHRrZXliaW5kaW5nUHJvdmlkZXI6IGFjdGlvbiA9PiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IENvbmZpZ3VyZURvTm90RGlzdHVyYkFjdGlvbi5JRCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHtcblx0XHRcdFx0XHRcdGdldEFjdGlvbnMoKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSBbdG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBUb2dnbGVEb05vdERpc3R1cmJBY3Rpb24uSUQsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IHRoYXQubm90aWZpY2F0aW9uU2VydmljZS5nZXRGaWx0ZXIoKSA9PT0gTm90aWZpY2F0aW9uc0ZpbHRlci5PRkYgPyBsb2NhbGl6ZSgndHVybk9uTm90aWZpY2F0aW9ucycsIFwiRW5hYmxlIERvIE5vdCBEaXN0dXJiIE1vZGVcIikgOiBsb2NhbGl6ZSgndHVybk9mZk5vdGlmaWNhdGlvbnMnLCBcIkRpc2FibGUgRG8gTm90IERpc3R1cmIgTW9kZVwiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHRoYXQubm90aWZpY2F0aW9uU2VydmljZS5zZXRGaWx0ZXIodGhhdC5ub3RpZmljYXRpb25TZXJ2aWNlLmdldEZpbHRlcigpID09PSBOb3RpZmljYXRpb25zRmlsdGVyLk9GRiA/IE5vdGlmaWNhdGlvbnNGaWx0ZXIuRVJST1IgOiBOb3RpZmljYXRpb25zRmlsdGVyLk9GRilcblx0XHRcdFx0XHRcdFx0fSldO1xuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IHNvcnRlZEZpbHRlcnMgPSB0aGF0Lm5vdGlmaWNhdGlvblNlcnZpY2UuZ2V0RmlsdGVycygpLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSk7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3Qgc291cmNlIG9mIHNvcnRlZEZpbHRlcnMuc2xpY2UoMCwgTm90aWZpY2F0aW9uc0NlbnRlci5NQVhfTk9USUZJQ0FUSU9OX1NPVVJDRVMpKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdFx0aWQ6IGAke1RvZ2dsZURvTm90RGlzdHVyYkFjdGlvbi5JRH0uJHtzb3VyY2UuaWR9YCxcblx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBzb3VyY2UubGFiZWwsXG5cdFx0XHRcdFx0XHRcdFx0XHRjaGVja2VkOiBzb3VyY2UuZmlsdGVyICE9PSBOb3RpZmljYXRpb25zRmlsdGVyLkVSUk9SLFxuXHRcdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGF0Lm5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0RmlsdGVyKHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Li4uc291cmNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRmaWx0ZXI6IHNvdXJjZS5maWx0ZXIgPT09IE5vdGlmaWNhdGlvbnNGaWx0ZXIuRVJST1IgPyBOb3RpZmljYXRpb25zRmlsdGVyLk9GRiA6IE5vdGlmaWNhdGlvbnNGaWx0ZXIuRVJST1Jcblx0XHRcdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0aWYgKHNvcnRlZEZpbHRlcnMubGVuZ3RoID4gTm90aWZpY2F0aW9uc0NlbnRlci5NQVhfTk9USUZJQ0FUSU9OX1NPVVJDRVMpIHtcblx0XHRcdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2godGhhdC5fcmVnaXN0ZXIodGhhdC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUb2dnbGVEb05vdERpc3R1cmJCeVNvdXJjZUFjdGlvbiwgVG9nZ2xlRG9Ob3REaXN0dXJiQnlTb3VyY2VBY3Rpb24uSUQsIGxvY2FsaXplKCdtb3JlU291cmNlcycsIFwiTW9yZVx1MjAyNlwiKSkpKTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHJldHVybiBhY3Rpb25zO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwge1xuXHRcdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0XHRcdGFjdGlvblJ1bm5lcixcblx0XHRcdFx0XHRcdGNsYXNzTmFtZXM6IGFjdGlvbi5jbGFzcyxcblx0XHRcdFx0XHRcdGtleWJpbmRpbmdQcm92aWRlcjogYWN0aW9uID0+IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUFjdGlvblZpZXdJdGVtKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5jbGVhckFsbEFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2xlYXJBbGxOb3RpZmljYXRpb25zQWN0aW9uLCBDbGVhckFsbE5vdGlmaWNhdGlvbnNBY3Rpb24uSUQsIENsZWFyQWxsTm90aWZpY2F0aW9uc0FjdGlvbi5MQUJFTCkpO1xuXHRcdG5vdGlmaWNhdGlvbnNUb29sQmFyLnB1c2godGhpcy5jbGVhckFsbEFjdGlvbiwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UsIGtleWJpbmRpbmc6IHRoaXMuZ2V0S2V5YmluZGluZ0xhYmVsKHRoaXMuY2xlYXJBbGxBY3Rpb24pIH0pO1xuXG5cdFx0dGhpcy5jb25maWd1cmVEb05vdERpc3R1cmJBY3Rpb24gPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbmZpZ3VyZURvTm90RGlzdHVyYkFjdGlvbiwgQ29uZmlndXJlRG9Ob3REaXN0dXJiQWN0aW9uLklELCBDb25maWd1cmVEb05vdERpc3R1cmJBY3Rpb24uTEFCRUwpKTtcblx0XHRub3RpZmljYXRpb25zVG9vbEJhci5wdXNoKHRoaXMuY29uZmlndXJlRG9Ob3REaXN0dXJiQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyZU5vdGlmaWNhdGlvbnNQb3NpdGlvbkFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29uZmlndXJlTm90aWZpY2F0aW9uc1Bvc2l0aW9uQWN0aW9uLCBDb25maWd1cmVOb3RpZmljYXRpb25zUG9zaXRpb25BY3Rpb24uSUQsIENvbmZpZ3VyZU5vdGlmaWNhdGlvbnNQb3NpdGlvbkFjdGlvbi5MQUJFTCkpO1xuXHRcdG5vdGlmaWNhdGlvbnNUb29sQmFyLnB1c2goY29uZmlndXJlTm90aWZpY2F0aW9uc1Bvc2l0aW9uQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblxuXHRcdHRoaXMuaGlkZUFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSGlkZU5vdGlmaWNhdGlvbnNDZW50ZXJBY3Rpb24sIEhpZGVOb3RpZmljYXRpb25zQ2VudGVyQWN0aW9uLklELCBIaWRlTm90aWZpY2F0aW9uc0NlbnRlckFjdGlvbi5MQUJFTCkpO1xuXHRcdHRoaXMudXBkYXRlSGlkZUFjdGlvbkljb24oKTtcblx0XHRub3RpZmljYXRpb25zVG9vbEJhci5wdXNoKHRoaXMuaGlkZUFjdGlvbiwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UsIGtleWJpbmRpbmc6IHRoaXMuZ2V0S2V5YmluZGluZ0xhYmVsKHRoaXMuaGlkZUFjdGlvbikgfSk7XG5cblx0XHQvLyBOb3RpZmljYXRpb25zIExpc3Rcblx0XHR0aGlzLm5vdGlmaWNhdGlvbnNMaXN0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RpZmljYXRpb25zTGlzdCwgdGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyLCB7XG5cdFx0XHR3aWRnZXRBcmlhTGFiZWw6IGxvY2FsaXplKCdub3RpZmljYXRpb25zQ2VudGVyV2lkZ2V0QXJpYUxhYmVsJywgXCJOb3RpZmljYXRpb25zIENlbnRlclwiKVxuXHRcdH0pO1xuXHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMubm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIGdldEtleWJpbmRpbmdMYWJlbChhY3Rpb246IElBY3Rpb24pOiBzdHJpbmcgfCBudWxsIHtcblx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCk7XG5cblx0XHRyZXR1cm4ga2V5YmluZGluZyA/IGtleWJpbmRpbmcuZ2V0TGFiZWwoKSA6IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uKGU6IElOb3RpZmljYXRpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgaWYgdmlzaWJsZVxuXHRcdH1cblxuXHRcdGxldCBmb2N1c0VkaXRvciA9IGZhbHNlO1xuXG5cdFx0Ly8gVXBkYXRlIG5vdGlmaWNhdGlvbnMgbGlzdCBiYXNlZCBvbiBldmVudCBraW5kXG5cdFx0Y29uc3QgW25vdGlmaWNhdGlvbnNMaXN0LCBub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyXSA9IGFzc2VydFJldHVybnNBbGxEZWZpbmVkKHRoaXMubm90aWZpY2F0aW9uc0xpc3QsIHRoaXMubm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lcik7XG5cdFx0c3dpdGNoIChlLmtpbmQpIHtcblx0XHRcdGNhc2UgTm90aWZpY2F0aW9uQ2hhbmdlVHlwZS5BREQ6XG5cdFx0XHRcdG5vdGlmaWNhdGlvbnNMaXN0LnVwZGF0ZU5vdGlmaWNhdGlvbnNMaXN0KGUuaW5kZXgsIDAsIFtlLml0ZW1dKTtcblx0XHRcdFx0ZS5pdGVtLnVwZGF0ZVZpc2liaWxpdHkodHJ1ZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBOb3RpZmljYXRpb25DaGFuZ2VUeXBlLkNIQU5HRTpcblx0XHRcdFx0Ly8gSGFuZGxlIGNvbnRlbnQgY2hhbmdlc1xuXHRcdFx0XHQvLyAtIGFjdGlvbnM6IHJlLWRyYXcgdG8gcHJvcGVybHkgc2hvdyB0aGVtXG5cdFx0XHRcdC8vIC0gbWVzc2FnZTogdXBkYXRlIG5vdGlmaWNhdGlvbiBoZWlnaHQgdW5sZXNzIGNvbGxhcHNlZFxuXHRcdFx0XHRzd2l0Y2ggKGUuZGV0YWlsKSB7XG5cdFx0XHRcdFx0Y2FzZSBOb3RpZmljYXRpb25WaWV3SXRlbUNvbnRlbnRDaGFuZ2VLaW5kLkFDVElPTlM6XG5cdFx0XHRcdFx0XHRub3RpZmljYXRpb25zTGlzdC51cGRhdGVOb3RpZmljYXRpb25zTGlzdChlLmluZGV4LCAxLCBbZS5pdGVtXSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIE5vdGlmaWNhdGlvblZpZXdJdGVtQ29udGVudENoYW5nZUtpbmQuTUVTU0FHRTpcblx0XHRcdFx0XHRcdGlmIChlLml0ZW0uZXhwYW5kZWQpIHtcblx0XHRcdFx0XHRcdFx0bm90aWZpY2F0aW9uc0xpc3QudXBkYXRlTm90aWZpY2F0aW9uSGVpZ2h0KGUuaXRlbSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgTm90aWZpY2F0aW9uQ2hhbmdlVHlwZS5FWFBBTkRfQ09MTEFQU0U6XG5cdFx0XHRcdC8vIFJlLWRyYXcgZW50aXJlIGl0ZW0gd2hlbiBleHBhbnNpb24gY2hhbmdlcyB0byByZXZlYWwgb3IgaGlkZSBkZXRhaWxzXG5cdFx0XHRcdG5vdGlmaWNhdGlvbnNMaXN0LnVwZGF0ZU5vdGlmaWNhdGlvbnNMaXN0KGUuaW5kZXgsIDEsIFtlLml0ZW1dKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE5vdGlmaWNhdGlvbkNoYW5nZVR5cGUuUkVNT1ZFOlxuXHRcdFx0XHRmb2N1c0VkaXRvciA9IGlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQobm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lcik7XG5cdFx0XHRcdG5vdGlmaWNhdGlvbnNMaXN0LnVwZGF0ZU5vdGlmaWNhdGlvbnNMaXN0KGUuaW5kZXgsIDEpO1xuXHRcdFx0XHRlLml0ZW0udXBkYXRlVmlzaWJpbGl0eShmYWxzZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0aXRsZVxuXHRcdHRoaXMudXBkYXRlVGl0bGUoKTtcblxuXHRcdC8vIEhpZGUgaWYgbm8gbW9yZSBub3RpZmljYXRpb25zIHRvIHNob3dcblx0XHRpZiAodGhpcy5tb2RlbC5ub3RpZmljYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5oaWRlKCk7XG5cblx0XHRcdC8vIFJlc3RvcmUgZm9jdXMgdG8gZWRpdG9yIGdyb3VwIGlmIHdlIGhhZCBmb2N1c1xuXHRcdFx0aWYgKGZvY3VzRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aGlkZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzVmlzaWJsZSB8fCAhdGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyIHx8ICF0aGlzLm5vdGlmaWNhdGlvbnNMaXN0KSB7XG5cdFx0XHRyZXR1cm47IC8vIGFscmVhZHkgaGlkZGVuXG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXNFZGl0b3IgPSBpc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMubm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lcik7XG5cblx0XHQvLyBIaWRlXG5cdFx0dGhpcy5faXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKTtcblx0XHR0aGlzLm5vdGlmaWNhdGlvbnNMaXN0LmhpZGUoKTtcblxuXHRcdC8vIE1hcmsgYXMgaGlkZGVuXG5cdFx0dGhpcy5tb2RlbC5ub3RpZmljYXRpb25zLmZvckVhY2gobm90aWZpY2F0aW9uID0+IG5vdGlmaWNhdGlvbi51cGRhdGVWaXNpYmlsaXR5KGZhbHNlKSk7XG5cblx0XHQvLyBDb250ZXh0IEtleVxuXHRcdHRoaXMubm90aWZpY2F0aW9uc0NlbnRlclZpc2libGVDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cblx0XHQvLyBFdmVudFxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKCk7XG5cblx0XHQvLyBSZXN0b3JlIGZvY3VzIHRvIGVkaXRvciBncm91cCBpZiB3ZSBoYWQgZm9jdXNcblx0XHRpZiAoZm9jdXNFZGl0b3IpIHtcblx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlU3R5bGVzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXIgJiYgdGhpcy5ub3RpZmljYXRpb25zQ2VudGVySGVhZGVyKSB7XG5cblx0XHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihOT1RJRklDQVRJT05TX0NFTlRFUl9CT1JERVIpO1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyLnN0eWxlLmJvcmRlciA9IGJvcmRlckNvbG9yID8gYDFweCBzb2xpZCAke2JvcmRlckNvbG9yfWAgOiAnJztcblxuXHRcdFx0Y29uc3QgaGVhZGVyRm9yZWdyb3VuZCA9IHRoaXMuZ2V0Q29sb3IoTk9USUZJQ0FUSU9OU19DRU5URVJfSEVBREVSX0ZPUkVHUk9VTkQpO1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVySGVhZGVyLnN0eWxlLmNvbG9yID0gaGVhZGVyRm9yZWdyb3VuZCA/PyAnJztcblxuXHRcdFx0Y29uc3QgaGVhZGVyQmFja2dyb3VuZCA9IHRoaXMuZ2V0Q29sb3IoTk9USUZJQ0FUSU9OU19DRU5URVJfSEVBREVSX0JBQ0tHUk9VTkQpO1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVySGVhZGVyLnN0eWxlLmJhY2tncm91bmQgPSBoZWFkZXJCYWNrZ3JvdW5kID8/ICcnO1xuXG5cdFx0fVxuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy53b3JrYmVuY2hEaW1lbnNpb25zID0gZGltZW5zaW9uO1xuXG5cdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSAmJiB0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXIpIHtcblx0XHRcdGNvbnN0IG1heFdpZHRoID0gTm90aWZpY2F0aW9uc0NlbnRlci5NQVhfRElNRU5TSU9OUy53aWR0aDtcblx0XHRcdGNvbnN0IG1heEhlaWdodCA9IE5vdGlmaWNhdGlvbnNDZW50ZXIuTUFYX0RJTUVOU0lPTlMuaGVpZ2h0O1xuXG5cdFx0XHRsZXQgYXZhaWxhYmxlV2lkdGggPSBtYXhXaWR0aDtcblx0XHRcdGxldCBhdmFpbGFibGVIZWlnaHQgPSBtYXhIZWlnaHQ7XG5cblx0XHRcdGlmICh0aGlzLndvcmtiZW5jaERpbWVuc2lvbnMpIHtcblxuXHRcdFx0XHQvLyBNYWtlIHN1cmUgbm90aWZpY2F0aW9ucyBhcmUgbm90IGV4Y2VkaW5nIGF2YWlsYWJsZSB3aWR0aFxuXHRcdFx0XHRhdmFpbGFibGVXaWR0aCA9IHRoaXMud29ya2JlbmNoRGltZW5zaW9ucy53aWR0aDtcblx0XHRcdFx0YXZhaWxhYmxlV2lkdGggLT0gKDIgKiA4KTsgLy8gYWRqdXN0IGZvciBwYWRkaW5ncyBsZWZ0IGFuZCByaWdodFxuXG5cdFx0XHRcdC8vIE1ha2Ugc3VyZSBub3RpZmljYXRpb25zIGFyZSBub3QgZXhjZWVkaW5nIGF2YWlsYWJsZSBoZWlnaHRcblx0XHRcdFx0YXZhaWxhYmxlSGVpZ2h0ID0gdGhpcy53b3JrYmVuY2hEaW1lbnNpb25zLmhlaWdodCAtIDM1IC8qIGhlYWRlciAqLztcblx0XHRcdFx0aWYgKHRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuU1RBVFVTQkFSX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdFx0YXZhaWxhYmxlSGVpZ2h0IC09IDIyOyAvLyBhZGp1c3QgZm9yIHN0YXR1cyBiYXJcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLmxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlRJVExFQkFSX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdFx0YXZhaWxhYmxlSGVpZ2h0IC09IDIyOyAvLyBhZGp1c3QgZm9yIHRpdGxlIGJhclxuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXZhaWxhYmxlSGVpZ2h0IC09ICgyICogMTIpOyAvLyBhZGp1c3QgZm9yIHBhZGRpbmdzIHRvcCBhbmQgYm90dG9tXG5cdFx0XHR9XG5cblx0XHRcdC8vIFVwZGF0ZSBwb3NpdGlvbiBvZmZzZXRcblx0XHRcdHRoaXMudXBkYXRlVG9wT2Zmc2V0KCk7XG5cblx0XHRcdC8vIEFwcGx5IHRvIGxpc3Rcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbnNMaXN0ID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5ub3RpZmljYXRpb25zTGlzdCk7XG5cdFx0XHRub3RpZmljYXRpb25zTGlzdC5sYXlvdXQoTWF0aC5taW4obWF4V2lkdGgsIGF2YWlsYWJsZVdpZHRoKSwgTWF0aC5taW4obWF4SGVpZ2h0LCBhdmFpbGFibGVIZWlnaHQpKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhckFsbCgpOiB2b2lkIHtcblxuXHRcdC8vIEhpZGUgbm90aWZpY2F0aW9ucyBjZW50ZXIgZmlyc3Rcblx0XHR0aGlzLmhpZGUoKTtcblxuXHRcdC8vIENsb3NlIGFsbFxuXHRcdGZvciAoY29uc3Qgbm90aWZpY2F0aW9uIG9mIFsuLi50aGlzLm1vZGVsLm5vdGlmaWNhdGlvbnNdIC8qIGNvcHkgYXJyYXkgc2luY2Ugd2UgbW9kaWZ5IGl0IGZyb20gY2xvc2luZyAqLykge1xuXHRcdFx0aWYgKCFub3RpZmljYXRpb24uaGFzUHJvZ3Jlc3MpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uLmNsb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5jbGVhcik7XG5cdFx0fVxuXHR9XG59XG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLE9BQU87QUFDUCxTQUFTLHdDQUF3Qyx3Q0FBd0MsbUNBQW1DO0FBQzVILFNBQVMsZUFBZSxnQkFBZ0I7QUFDeEMsU0FBd0Qsd0JBQXdCLHVDQUF1Qyx1QkFBdUIsdUJBQXVCLGdDQUFnQztBQUNyTSxTQUFTLHlCQUF5QixhQUFhO0FBQy9DLFNBQVMsZUFBZTtBQUN4QixTQUFTLDBCQUEwQjtBQUNuQyxTQUF5QyxnQ0FBZ0M7QUFDekUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxHQUFHLFdBQVcsaUNBQWlDO0FBQ3hELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsNkJBQTZCLDZCQUE2QixzQ0FBc0Msa0NBQWtDLCtCQUErQiwwQkFBMEIsVUFBVSxrQkFBa0I7QUFDaE8sU0FBa0IsV0FBVyxnQkFBZ0I7QUFDN0MsU0FBUyxjQUFjLGNBQWM7QUFDckMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUIsNEJBQTRCO0FBQzlELFNBQVMseUNBQXlDO0FBQ2xE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
