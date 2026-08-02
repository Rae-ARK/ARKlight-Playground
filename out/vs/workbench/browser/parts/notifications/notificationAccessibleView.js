import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IAccessibleViewService, AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from "../../../../platform/accessibility/browser/accessibleView.js";
import { IAccessibilitySignalService, AccessibilitySignal } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IListService, WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { getNotificationFromContext } from "./notificationsCommands.js";
import { NotificationFocusedContext } from "../../../common/contextkeys.js";
import { withSeverityPrefix } from "../../../../platform/notification/common/notification.js";
class NotificationAccessibleView {
  constructor() {
    this.priority = 90;
    this.name = "notifications";
    this.when = NotificationFocusedContext;
    this.type = AccessibleViewType.View;
  }
  getProvider(accessor) {
    const accessibleViewService = accessor.get(IAccessibleViewService);
    const listService = accessor.get(IListService);
    const commandService = accessor.get(ICommandService);
    const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
    function getProvider() {
      const notification = getNotificationFromContext(listService);
      if (!notification) {
        return;
      }
      commandService.executeCommand("notifications.showList");
      let notificationIndex;
      const list = listService.lastFocusedList;
      if (list instanceof WorkbenchList) {
        notificationIndex = list.indexOf(notification);
      }
      if (notificationIndex === void 0) {
        return;
      }
      function focusList() {
        commandService.executeCommand("notifications.showList");
        if (list && notificationIndex !== void 0) {
          list.domFocus();
          try {
            list.setFocus([notificationIndex]);
          } catch {
          }
        }
      }
      function getContentForNotification() {
        const notification2 = getNotificationFromContext(listService);
        const message = notification2?.message.original.toString();
        if (!notification2 || !message) {
          return;
        }
        return withSeverityPrefix(notification2.source ? localize("notification.accessibleViewSrc", "{0} Source: {1}", message, notification2.source) : message, notification2.severity);
      }
      const content = getContentForNotification();
      if (!content) {
        return;
      }
      notification.onDidClose(() => accessibleViewService.next());
      return new AccessibleContentProvider(
        AccessibleViewProviderId.Notification,
        { type: AccessibleViewType.View },
        () => content,
        () => focusList(),
        "accessibility.verbosity.notification",
        void 0,
        getActionsFromNotification(notification, accessibilitySignalService),
        () => {
          if (!list) {
            return;
          }
          focusList();
          list.focusNext();
          return getContentForNotification();
        },
        () => {
          if (!list) {
            return;
          }
          focusList();
          list.focusPrevious();
          return getContentForNotification();
        }
      );
    }
    return getProvider();
  }
}
function getActionsFromNotification(notification, accessibilitySignalService) {
  let actions = void 0;
  if (notification.actions) {
    actions = [];
    if (notification.actions.primary) {
      actions.push(...notification.actions.primary);
    }
    if (notification.actions.secondary) {
      actions.push(...notification.actions.secondary);
    }
  }
  if (actions) {
    for (const action of actions) {
      action.class = ThemeIcon.asClassName(Codicon.bell);
      const initialAction = action.run;
      action.run = () => {
        initialAction();
        notification.close();
      };
    }
  }
  const manageExtension = actions?.find((a) => a.label.includes("Manage Extension"));
  if (manageExtension) {
    manageExtension.class = ThemeIcon.asClassName(Codicon.gear);
  }
  if (actions) {
    actions.push({
      id: "clearNotification",
      label: localize("clearNotification", "Clear Notification"),
      tooltip: localize("clearNotification", "Clear Notification"),
      run: () => {
        notification.close();
        accessibilitySignalService.playSignal(AccessibilitySignal.clear);
      },
      enabled: true,
      class: ThemeIcon.asClassName(Codicon.clearAll)
    });
  }
  return actions;
}
export {
  NotificationAccessibleView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL25vdGlmaWNhdGlvbnMvbm90aWZpY2F0aW9uQWNjZXNzaWJsZVZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsIEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZCwgQWNjZXNzaWJsZVZpZXdUeXBlLCBBY2Nlc3NpYmxlQ29udGVudFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmxlVmlld0ltcGxlbWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLCBBY2Nlc3NpYmlsaXR5U2lnbmFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIFdvcmtiZW5jaExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Tm90aWZpY2F0aW9uRnJvbUNvbnRleHQgfSBmcm9tICcuL25vdGlmaWNhdGlvbnNDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBOb3RpZmljYXRpb25Gb2N1c2VkQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90aWZpY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyB3aXRoU2V2ZXJpdHlQcmVmaXggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBOb3RpZmljYXRpb25BY2Nlc3NpYmxlVmlldyBpbXBsZW1lbnRzIElBY2Nlc3NpYmxlVmlld0ltcGxlbWVudGF0aW9uIHtcblx0cmVhZG9ubHkgcHJpb3JpdHkgPSA5MDtcblx0cmVhZG9ubHkgbmFtZSA9ICdub3RpZmljYXRpb25zJztcblx0cmVhZG9ubHkgd2hlbiA9IE5vdGlmaWNhdGlvbkZvY3VzZWRDb250ZXh0O1xuXHRyZWFkb25seSB0eXBlID0gQWNjZXNzaWJsZVZpZXdUeXBlLlZpZXc7XG5cdGdldFByb3ZpZGVyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgYWNjZXNzaWJsZVZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY2Nlc3NpYmxlVmlld1NlcnZpY2UpO1xuXHRcdGNvbnN0IGxpc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSA9IGFjY2Vzc29yLmdldChJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UpO1xuXG5cdFx0ZnVuY3Rpb24gZ2V0UHJvdmlkZXIoKSB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb24gPSBnZXROb3RpZmljYXRpb25Gcm9tQ29udGV4dChsaXN0U2VydmljZSk7XG5cdFx0XHRpZiAoIW5vdGlmaWNhdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnbm90aWZpY2F0aW9ucy5zaG93TGlzdCcpO1xuXHRcdFx0bGV0IG5vdGlmaWNhdGlvbkluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBsaXN0ID0gbGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0O1xuXHRcdFx0aWYgKGxpc3QgaW5zdGFuY2VvZiBXb3JrYmVuY2hMaXN0KSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvbkluZGV4ID0gbGlzdC5pbmRleE9mKG5vdGlmaWNhdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAobm90aWZpY2F0aW9uSW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmN0aW9uIGZvY3VzTGlzdCgpOiB2b2lkIHtcblx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ25vdGlmaWNhdGlvbnMuc2hvd0xpc3QnKTtcblx0XHRcdFx0aWYgKGxpc3QgJiYgbm90aWZpY2F0aW9uSW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGxpc3QuZG9tRm9jdXMoKTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0bGlzdC5zZXRGb2N1cyhbbm90aWZpY2F0aW9uSW5kZXhdKTtcblx0XHRcdFx0XHR9IGNhdGNoIHsgfVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmN0aW9uIGdldENvbnRlbnRGb3JOb3RpZmljYXRpb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gZ2V0Tm90aWZpY2F0aW9uRnJvbUNvbnRleHQobGlzdFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbm90aWZpY2F0aW9uPy5tZXNzYWdlLm9yaWdpbmFsLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGlmICghbm90aWZpY2F0aW9uIHx8ICFtZXNzYWdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB3aXRoU2V2ZXJpdHlQcmVmaXgobm90aWZpY2F0aW9uLnNvdXJjZSA/IGxvY2FsaXplKCdub3RpZmljYXRpb24uYWNjZXNzaWJsZVZpZXdTcmMnLCAnezB9IFNvdXJjZTogezF9JywgbWVzc2FnZSwgbm90aWZpY2F0aW9uLnNvdXJjZSkgOiBtZXNzYWdlLCBub3RpZmljYXRpb24uc2V2ZXJpdHkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29udGVudCA9IGdldENvbnRlbnRGb3JOb3RpZmljYXRpb24oKTtcblx0XHRcdGlmICghY29udGVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRub3RpZmljYXRpb24ub25EaWRDbG9zZSgoKSA9PiBhY2Nlc3NpYmxlVmlld1NlcnZpY2UubmV4dCgpKTtcblx0XHRcdHJldHVybiBuZXcgQWNjZXNzaWJsZUNvbnRlbnRQcm92aWRlcihcblx0XHRcdFx0QWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLk5vdGlmaWNhdGlvbixcblx0XHRcdFx0eyB0eXBlOiBBY2Nlc3NpYmxlVmlld1R5cGUuVmlldyB9LFxuXHRcdFx0XHQoKSA9PiBjb250ZW50LFxuXHRcdFx0XHQoKSA9PiBmb2N1c0xpc3QoKSxcblx0XHRcdFx0J2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5Lm5vdGlmaWNhdGlvbicsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0Z2V0QWN0aW9uc0Zyb21Ob3RpZmljYXRpb24obm90aWZpY2F0aW9uLCBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSksXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHRpZiAoIWxpc3QpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9jdXNMaXN0KCk7XG5cdFx0XHRcdFx0bGlzdC5mb2N1c05leHQoKTtcblx0XHRcdFx0XHRyZXR1cm4gZ2V0Q29udGVudEZvck5vdGlmaWNhdGlvbigpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFsaXN0KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvY3VzTGlzdCgpO1xuXHRcdFx0XHRcdGxpc3QuZm9jdXNQcmV2aW91cygpO1xuXHRcdFx0XHRcdHJldHVybiBnZXRDb250ZW50Rm9yTm90aWZpY2F0aW9uKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gZ2V0UHJvdmlkZXIoKTtcblx0fVxufVxuXG5cbmZ1bmN0aW9uIGdldEFjdGlvbnNGcm9tTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvblZpZXdJdGVtLCBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlKTogSUFjdGlvbltdIHwgdW5kZWZpbmVkIHtcblx0bGV0IGFjdGlvbnMgPSB1bmRlZmluZWQ7XG5cdGlmIChub3RpZmljYXRpb24uYWN0aW9ucykge1xuXHRcdGFjdGlvbnMgPSBbXTtcblx0XHRpZiAobm90aWZpY2F0aW9uLmFjdGlvbnMucHJpbWFyeSkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKC4uLm5vdGlmaWNhdGlvbi5hY3Rpb25zLnByaW1hcnkpO1xuXHRcdH1cblx0XHRpZiAobm90aWZpY2F0aW9uLmFjdGlvbnMuc2Vjb25kYXJ5KSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goLi4ubm90aWZpY2F0aW9uLmFjdGlvbnMuc2Vjb25kYXJ5KTtcblx0XHR9XG5cdH1cblx0aWYgKGFjdGlvbnMpIHtcblx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRhY3Rpb24uY2xhc3MgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5iZWxsKTtcblx0XHRcdGNvbnN0IGluaXRpYWxBY3Rpb24gPSBhY3Rpb24ucnVuO1xuXHRcdFx0YWN0aW9uLnJ1biA9ICgpID0+IHtcblx0XHRcdFx0aW5pdGlhbEFjdGlvbigpO1xuXHRcdFx0XHRub3RpZmljYXRpb24uY2xvc2UoKTtcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cdGNvbnN0IG1hbmFnZUV4dGVuc2lvbiA9IGFjdGlvbnM/LmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdNYW5hZ2UgRXh0ZW5zaW9uJykpO1xuXHRpZiAobWFuYWdlRXh0ZW5zaW9uKSB7XG5cdFx0bWFuYWdlRXh0ZW5zaW9uLmNsYXNzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZ2Vhcik7XG5cdH1cblx0aWYgKGFjdGlvbnMpIHtcblx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0aWQ6ICdjbGVhck5vdGlmaWNhdGlvbicsIGxhYmVsOiBsb2NhbGl6ZSgnY2xlYXJOb3RpZmljYXRpb24nLCBcIkNsZWFyIE5vdGlmaWNhdGlvblwiKSwgdG9vbHRpcDogbG9jYWxpemUoJ2NsZWFyTm90aWZpY2F0aW9uJywgXCJDbGVhciBOb3RpZmljYXRpb25cIiksIHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRub3RpZmljYXRpb24uY2xvc2UoKTtcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmNsZWFyKTtcblx0XHRcdH0sIGVuYWJsZWQ6IHRydWUsIGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbGVhckFsbClcblx0XHR9KTtcblx0fVxuXHRyZXR1cm4gYWN0aW9ucztcbn1cblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCLDBCQUEwQixvQkFBb0IsaUNBQWlDO0FBRWhILFNBQVMsNkJBQTZCLDJCQUEyQjtBQUNqRSxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGNBQWMscUJBQXFCO0FBQzVDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsa0NBQWtDO0FBRTNDLFNBQVMsMEJBQTBCO0FBRTVCLE1BQU0sMkJBQW9FO0FBQUEsRUFBMUU7QUFDTixTQUFTLFdBQVc7QUFDcEIsU0FBUyxPQUFPO0FBQ2hCLFNBQVMsT0FBTztBQUNoQixTQUFTLE9BQU8sbUJBQW1CO0FBQUE7QUFBQSxFQUNuQyxZQUFZLFVBQTRCO0FBQ3ZDLFVBQU0sd0JBQXdCLFNBQVMsSUFBSSxzQkFBc0I7QUFDakUsVUFBTSxjQUFjLFNBQVMsSUFBSSxZQUFZO0FBQzdDLFVBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBQ25ELFVBQU0sNkJBQTZCLFNBQVMsSUFBSSwyQkFBMkI7QUFFM0UsYUFBUyxjQUFjO0FBQ3RCLFlBQU0sZUFBZSwyQkFBMkIsV0FBVztBQUMzRCxVQUFJLENBQUMsY0FBYztBQUNsQjtBQUFBLE1BQ0Q7QUFDQSxxQkFBZSxlQUFlLHdCQUF3QjtBQUN0RCxVQUFJO0FBQ0osWUFBTSxPQUFPLFlBQVk7QUFDekIsVUFBSSxnQkFBZ0IsZUFBZTtBQUNsQyw0QkFBb0IsS0FBSyxRQUFRLFlBQVk7QUFBQSxNQUM5QztBQUNBLFVBQUksc0JBQXNCLFFBQVc7QUFDcEM7QUFBQSxNQUNEO0FBRUEsZUFBUyxZQUFrQjtBQUMxQix1QkFBZSxlQUFlLHdCQUF3QjtBQUN0RCxZQUFJLFFBQVEsc0JBQXNCLFFBQVc7QUFDNUMsZUFBSyxTQUFTO0FBQ2QsY0FBSTtBQUNILGlCQUFLLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQztBQUFBLFVBQ2xDLFFBQVE7QUFBQSxVQUFFO0FBQUEsUUFDWDtBQUFBLE1BQ0Q7QUFFQSxlQUFTLDRCQUFnRDtBQUN4RCxjQUFNQSxnQkFBZSwyQkFBMkIsV0FBVztBQUMzRCxjQUFNLFVBQVVBLGVBQWMsUUFBUSxTQUFTLFNBQVM7QUFDeEQsWUFBSSxDQUFDQSxpQkFBZ0IsQ0FBQyxTQUFTO0FBQzlCO0FBQUEsUUFDRDtBQUNBLGVBQU8sbUJBQW1CQSxjQUFhLFNBQVMsU0FBUyxrQ0FBa0MsbUJBQW1CLFNBQVNBLGNBQWEsTUFBTSxJQUFJLFNBQVNBLGNBQWEsUUFBUTtBQUFBLE1BQzdLO0FBQ0EsWUFBTSxVQUFVLDBCQUEwQjtBQUMxQyxVQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsTUFDRDtBQUNBLG1CQUFhLFdBQVcsTUFBTSxzQkFBc0IsS0FBSyxDQUFDO0FBQzFELGFBQU8sSUFBSTtBQUFBLFFBQ1YseUJBQXlCO0FBQUEsUUFDekIsRUFBRSxNQUFNLG1CQUFtQixLQUFLO0FBQUEsUUFDaEMsTUFBTTtBQUFBLFFBQ04sTUFBTSxVQUFVO0FBQUEsUUFDaEI7QUFBQSxRQUNBO0FBQUEsUUFDQSwyQkFBMkIsY0FBYywwQkFBMEI7QUFBQSxRQUNuRSxNQUFNO0FBQ0wsY0FBSSxDQUFDLE1BQU07QUFDVjtBQUFBLFVBQ0Q7QUFDQSxvQkFBVTtBQUNWLGVBQUssVUFBVTtBQUNmLGlCQUFPLDBCQUEwQjtBQUFBLFFBQ2xDO0FBQUEsUUFDQSxNQUFNO0FBQ0wsY0FBSSxDQUFDLE1BQU07QUFDVjtBQUFBLFVBQ0Q7QUFDQSxvQkFBVTtBQUNWLGVBQUssY0FBYztBQUNuQixpQkFBTywwQkFBMEI7QUFBQSxRQUNsQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTyxZQUFZO0FBQUEsRUFDcEI7QUFDRDtBQUdBLFNBQVMsMkJBQTJCLGNBQXFDLDRCQUFnRjtBQUN4SixNQUFJLFVBQVU7QUFDZCxNQUFJLGFBQWEsU0FBUztBQUN6QixjQUFVLENBQUM7QUFDWCxRQUFJLGFBQWEsUUFBUSxTQUFTO0FBQ2pDLGNBQVEsS0FBSyxHQUFHLGFBQWEsUUFBUSxPQUFPO0FBQUEsSUFDN0M7QUFDQSxRQUFJLGFBQWEsUUFBUSxXQUFXO0FBQ25DLGNBQVEsS0FBSyxHQUFHLGFBQWEsUUFBUSxTQUFTO0FBQUEsSUFDL0M7QUFBQSxFQUNEO0FBQ0EsTUFBSSxTQUFTO0FBQ1osZUFBVyxVQUFVLFNBQVM7QUFDN0IsYUFBTyxRQUFRLFVBQVUsWUFBWSxRQUFRLElBQUk7QUFDakQsWUFBTSxnQkFBZ0IsT0FBTztBQUM3QixhQUFPLE1BQU0sTUFBTTtBQUNsQixzQkFBYztBQUNkLHFCQUFhLE1BQU07QUFBQSxNQUNwQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsUUFBTSxrQkFBa0IsU0FBUyxLQUFLLE9BQUssRUFBRSxNQUFNLFNBQVMsa0JBQWtCLENBQUM7QUFDL0UsTUFBSSxpQkFBaUI7QUFDcEIsb0JBQWdCLFFBQVEsVUFBVSxZQUFZLFFBQVEsSUFBSTtBQUFBLEVBQzNEO0FBQ0EsTUFBSSxTQUFTO0FBQ1osWUFBUSxLQUFLO0FBQUEsTUFDWixJQUFJO0FBQUEsTUFBcUIsT0FBTyxTQUFTLHFCQUFxQixvQkFBb0I7QUFBQSxNQUFHLFNBQVMsU0FBUyxxQkFBcUIsb0JBQW9CO0FBQUEsTUFBRyxLQUFLLE1BQU07QUFDN0oscUJBQWEsTUFBTTtBQUNuQixtQ0FBMkIsV0FBVyxvQkFBb0IsS0FBSztBQUFBLE1BQ2hFO0FBQUEsTUFBRyxTQUFTO0FBQUEsTUFBTSxPQUFPLFVBQVUsWUFBWSxRQUFRLFFBQVE7QUFBQSxJQUNoRSxDQUFDO0FBQUEsRUFDRjtBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsibm90aWZpY2F0aW9uIl0KfQo=
