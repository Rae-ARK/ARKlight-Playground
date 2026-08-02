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
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Event } from "../../../../base/common/event.js";
import Severity from "../../../../base/common/severity.js";
import { localize } from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService, NotificationPriority } from "../../../../platform/notification/common/notification.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
let AccessibilityStatus = class extends Disposable {
  constructor(configurationService, notificationService, accessibilityService, statusbarService, openerService) {
    super();
    this.configurationService = configurationService;
    this.notificationService = notificationService;
    this.accessibilityService = accessibilityService;
    this.statusbarService = statusbarService;
    this.openerService = openerService;
    this.screenReaderNotification = null;
    this.promptedScreenReader = false;
    this.screenReaderModeElement = this._register(new MutableDisposable());
    this._register(CommandsRegistry.registerCommand({ id: "showEditorScreenReaderNotification", handler: () => this.showScreenReaderNotification() }));
    this.updateScreenReaderModeElement(this.accessibilityService.isScreenReaderOptimized());
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this.onScreenReaderModeChange()));
    this._register(this.configurationService.onDidChangeConfiguration((c) => {
      if (c.affectsConfiguration("editor.accessibilitySupport")) {
        this.onScreenReaderModeChange();
      }
    }));
  }
  showScreenReaderNotification() {
    this.screenReaderNotification = this.notificationService.prompt(
      Severity.Info,
      localize("screenReaderDetectedExplanation.question", "Screen reader usage detected. Do you want to enable {0} to optimize the editor for screen reader usage?", "editor.accessibilitySupport"),
      [
        {
          label: localize("screenReaderDetectedExplanation.answerYes", "Yes"),
          run: () => {
            this.configurationService.updateValue("editor.accessibilitySupport", "on", ConfigurationTarget.USER);
          }
        },
        {
          label: localize("screenReaderDetectedExplanation.answerNo", "No"),
          run: () => {
            this.configurationService.updateValue("editor.accessibilitySupport", "off", ConfigurationTarget.USER);
          }
        },
        {
          label: localize("screenReaderDetectedExplanation.answerLearnMore", "Learn More"),
          run: () => {
            this.openerService.open("https://code.visualstudio.com/docs/editor/accessibility#_screen-readers");
          }
        }
      ],
      {
        sticky: true,
        priority: NotificationPriority.URGENT
      }
    );
    Event.once(this.screenReaderNotification.onDidClose)(() => this.screenReaderNotification = null);
  }
  updateScreenReaderModeElement(visible) {
    if (visible) {
      if (!this.screenReaderModeElement.value) {
        const text = localize("screenReaderDetected", "Screen Reader Optimized");
        this.screenReaderModeElement.value = this.statusbarService.addEntry({
          name: localize("status.editor.screenReaderMode", "Screen Reader Mode"),
          text,
          ariaLabel: text,
          command: "showEditorScreenReaderNotification",
          kind: "prominent",
          showInAllWindows: true
        }, "status.editor.screenReaderMode", StatusbarAlignment.RIGHT, 100.6);
      }
    } else {
      this.screenReaderModeElement.clear();
    }
  }
  onScreenReaderModeChange() {
    const screenReaderDetected = this.accessibilityService.isScreenReaderOptimized();
    if (screenReaderDetected) {
      const screenReaderConfiguration = this.configurationService.getValue("editor.accessibilitySupport");
      if (screenReaderConfiguration === "auto") {
        if (!this.promptedScreenReader) {
          this.promptedScreenReader = true;
          setTimeout(() => this.showScreenReaderNotification(), 100);
        }
      }
    }
    if (this.screenReaderNotification) {
      this.screenReaderNotification.close();
    }
    this.updateScreenReaderModeElement(this.accessibilityService.isScreenReaderOptimized());
  }
};
AccessibilityStatus.ID = "workbench.contrib.accessibilityStatus";
AccessibilityStatus = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IAccessibilityService),
  __decorateParam(3, IStatusbarService),
  __decorateParam(4, IOpenerService)
], AccessibilityStatus);
export {
  AccessibilityStatus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U3RhdHVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvbkhhbmRsZSwgSU5vdGlmaWNhdGlvblNlcnZpY2UsIE5vdGlmaWNhdGlvblByaW9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yLCBJU3RhdHVzYmFyU2VydmljZSwgU3RhdHVzYmFyQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuXG5leHBvcnQgY2xhc3MgQWNjZXNzaWJpbGl0eVN0YXR1cyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuYWNjZXNzaWJpbGl0eVN0YXR1cyc7XG5cblx0cHJpdmF0ZSBzY3JlZW5SZWFkZXJOb3RpZmljYXRpb246IElOb3RpZmljYXRpb25IYW5kbGUgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBwcm9tcHRlZFNjcmVlblJlYWRlcjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNjcmVlblJlYWRlck1vZGVFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdGF0dXNiYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHsgaWQ6ICdzaG93RWRpdG9yU2NyZWVuUmVhZGVyTm90aWZpY2F0aW9uJywgaGFuZGxlcjogKCkgPT4gdGhpcy5zaG93U2NyZWVuUmVhZGVyTm90aWZpY2F0aW9uKCkgfSkpO1xuXG5cdFx0dGhpcy51cGRhdGVTY3JlZW5SZWFkZXJNb2RlRWxlbWVudCh0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlU2NyZWVuUmVhZGVyT3B0aW1pemVkKCgpID0+IHRoaXMub25TY3JlZW5SZWFkZXJNb2RlQ2hhbmdlKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGMgPT4ge1xuXHRcdFx0aWYgKGMuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5hY2Nlc3NpYmlsaXR5U3VwcG9ydCcpKSB7XG5cdFx0XHRcdHRoaXMub25TY3JlZW5SZWFkZXJNb2RlQ2hhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93U2NyZWVuUmVhZGVyTm90aWZpY2F0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuc2NyZWVuUmVhZGVyTm90aWZpY2F0aW9uID0gdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRsb2NhbGl6ZSgnc2NyZWVuUmVhZGVyRGV0ZWN0ZWRFeHBsYW5hdGlvbi5xdWVzdGlvbicsIFwiU2NyZWVuIHJlYWRlciB1c2FnZSBkZXRlY3RlZC4gRG8geW91IHdhbnQgdG8gZW5hYmxlIHswfSB0byBvcHRpbWl6ZSB0aGUgZWRpdG9yIGZvciBzY3JlZW4gcmVhZGVyIHVzYWdlP1wiLCAnZWRpdG9yLmFjY2Vzc2liaWxpdHlTdXBwb3J0JyksXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NjcmVlblJlYWRlckRldGVjdGVkRXhwbGFuYXRpb24uYW5zd2VyWWVzJywgXCJZZXNcIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2VkaXRvci5hY2Nlc3NpYmlsaXR5U3VwcG9ydCcsICdvbicsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzY3JlZW5SZWFkZXJEZXRlY3RlZEV4cGxhbmF0aW9uLmFuc3dlck5vJywgXCJOb1wiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnZWRpdG9yLmFjY2Vzc2liaWxpdHlTdXBwb3J0JywgJ29mZicsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2NyZWVuUmVhZGVyRGV0ZWN0ZWRFeHBsYW5hdGlvbi5hbnN3ZXJMZWFybk1vcmUnLCBcIkxlYXJuIE1vcmVcIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKCdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2VkaXRvci9hY2Nlc3NpYmlsaXR5I19zY3JlZW4tcmVhZGVycycpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XSxcblx0XHRcdHtcblx0XHRcdFx0c3RpY2t5OiB0cnVlLFxuXHRcdFx0XHRwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuVVJHRU5UXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdEV2ZW50Lm9uY2UodGhpcy5zY3JlZW5SZWFkZXJOb3RpZmljYXRpb24ub25EaWRDbG9zZSkoKCkgPT4gdGhpcy5zY3JlZW5SZWFkZXJOb3RpZmljYXRpb24gPSBudWxsKTtcblx0fVxuXHRwcml2YXRlIHVwZGF0ZVNjcmVlblJlYWRlck1vZGVFbGVtZW50KHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0aWYgKCF0aGlzLnNjcmVlblJlYWRlck1vZGVFbGVtZW50LnZhbHVlKSB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBsb2NhbGl6ZSgnc2NyZWVuUmVhZGVyRGV0ZWN0ZWQnLCBcIlNjcmVlbiBSZWFkZXIgT3B0aW1pemVkXCIpO1xuXHRcdFx0XHR0aGlzLnNjcmVlblJlYWRlck1vZGVFbGVtZW50LnZhbHVlID0gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KHtcblx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnc3RhdHVzLmVkaXRvci5zY3JlZW5SZWFkZXJNb2RlJywgXCJTY3JlZW4gUmVhZGVyIE1vZGVcIiksXG5cdFx0XHRcdFx0dGV4dCxcblx0XHRcdFx0XHRhcmlhTGFiZWw6IHRleHQsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ3Nob3dFZGl0b3JTY3JlZW5SZWFkZXJOb3RpZmljYXRpb24nLFxuXHRcdFx0XHRcdGtpbmQ6ICdwcm9taW5lbnQnLFxuXHRcdFx0XHRcdHNob3dJbkFsbFdpbmRvd3M6IHRydWVcblx0XHRcdFx0fSwgJ3N0YXR1cy5lZGl0b3Iuc2NyZWVuUmVhZGVyTW9kZScsIFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCwgMTAwLjYpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNjcmVlblJlYWRlck1vZGVFbGVtZW50LmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblNjcmVlblJlYWRlck1vZGVDaGFuZ2UoKTogdm9pZCB7XG5cblx0XHQvLyBXZSBvbmx5IHN1cHBvcnQgdGV4dCBiYXNlZCBlZGl0b3JzXG5cdFx0Y29uc3Qgc2NyZWVuUmVhZGVyRGV0ZWN0ZWQgPSB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCk7XG5cdFx0aWYgKHNjcmVlblJlYWRlckRldGVjdGVkKSB7XG5cdFx0XHRjb25zdCBzY3JlZW5SZWFkZXJDb25maWd1cmF0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLmFjY2Vzc2liaWxpdHlTdXBwb3J0Jyk7XG5cdFx0XHRpZiAoc2NyZWVuUmVhZGVyQ29uZmlndXJhdGlvbiA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRcdGlmICghdGhpcy5wcm9tcHRlZFNjcmVlblJlYWRlcikge1xuXHRcdFx0XHRcdHRoaXMucHJvbXB0ZWRTY3JlZW5SZWFkZXIgPSB0cnVlO1xuXHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gdGhpcy5zaG93U2NyZWVuUmVhZGVyTm90aWZpY2F0aW9uKCksIDEwMCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5zY3JlZW5SZWFkZXJOb3RpZmljYXRpb24pIHtcblx0XHRcdHRoaXMuc2NyZWVuUmVhZGVyTm90aWZpY2F0aW9uLmNsb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlU2NyZWVuUmVhZGVyTW9kZUVsZW1lbnQodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsYUFBYTtBQUN0QixPQUFPLGNBQWM7QUFDckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQThCLHNCQUFzQiw0QkFBNEI7QUFFaEYsU0FBa0MsbUJBQW1CLDBCQUEwQjtBQUMvRSxTQUFTLHNCQUFzQjtBQUV4QixJQUFNLHNCQUFOLGNBQWtDLFdBQTZDO0FBQUEsRUFRckYsWUFDeUMsc0JBQ0QscUJBQ0Msc0JBQ0osa0JBQ0gsZUFDaEM7QUFDRCxVQUFNO0FBTmtDO0FBQ0Q7QUFDQztBQUNKO0FBQ0g7QUFUbEMsU0FBUSwyQkFBdUQ7QUFDL0QsU0FBUSx1QkFBZ0M7QUFDeEMsU0FBaUIsMEJBQTBCLEtBQUssVUFBVSxJQUFJLGtCQUEyQyxDQUFDO0FBV3pHLFNBQUssVUFBVSxpQkFBaUIsZ0JBQWdCLEVBQUUsSUFB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
