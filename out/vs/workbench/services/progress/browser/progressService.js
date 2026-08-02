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
import "./media/progressService.css";
import { localize } from "../../../../nls.js";
import { dispose, DisposableStore, Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { IProgressService, ProgressLocation, Progress } from "../../../../platform/progress/common/progress.js";
import { StatusbarAlignment, IStatusbarService } from "../../statusbar/browser/statusbar.js";
import { DeferredPromise, RunOnceScheduler, timeout } from "../../../../base/common/async.js";
import { ProgressBadge, IActivityService } from "../../activity/common/activity.js";
import { INotificationService, Severity, NotificationPriority, isNotificationSource, NotificationsFilter } from "../../../../platform/notification/common/notification.js";
import { Action } from "../../../../base/common/actions.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { Dialog } from "../../../../base/browser/ui/dialog/dialog.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { IViewsService } from "../../views/common/viewsService.js";
import { IPaneCompositePartService } from "../../panecomposite/browser/panecomposite.js";
import { stripIcons } from "../../../../base/common/iconLabels.js";
import { IUserActivityService } from "../../userActivity/common/userActivityService.js";
import { createWorkbenchDialogOptions } from "../../../browser/parts/dialogs/dialog.js";
import { IHostService } from "../../host/browser/host.js";
let ProgressService = class extends Disposable {
  constructor(activityService, paneCompositeService, viewDescriptorService, viewsService, notificationService, statusbarService, layoutService, keybindingService, userActivityService, hostService) {
    super();
    this.activityService = activityService;
    this.paneCompositeService = paneCompositeService;
    this.viewDescriptorService = viewDescriptorService;
    this.viewsService = viewsService;
    this.notificationService = notificationService;
    this.statusbarService = statusbarService;
    this.layoutService = layoutService;
    this.keybindingService = keybindingService;
    this.userActivityService = userActivityService;
    this.hostService = hostService;
    this.windowProgressStack = [];
    this.windowProgressStatusEntry = void 0;
  }
  async withProgress(options, originalTask, onDidCancel) {
    const { location } = options;
    const task = async (progress) => {
      const activeLock = this.userActivityService.markActive({ extendOnly: true, whenHeldFor: 15e3 });
      try {
        return await originalTask(progress);
      } finally {
        activeLock.dispose();
      }
    };
    const handleStringLocation = (location2) => {
      const viewContainer = this.viewDescriptorService.getViewContainerById(location2);
      if (viewContainer) {
        const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
        if (viewContainerLocation !== null) {
          return this.withPaneCompositeProgress(location2, viewContainerLocation, task, { ...options, location: location2 });
        }
      }
      if (this.viewDescriptorService.getViewDescriptorById(location2) !== null) {
        return this.withViewProgress(location2, task, { ...options, location: location2 });
      }
      throw new Error(`Bad progress location: ${location2}`);
    };
    if (typeof location === "string") {
      return handleStringLocation(location);
    }
    switch (location) {
      case ProgressLocation.Notification: {
        let priority = options.priority;
        if (priority !== NotificationPriority.URGENT) {
          if (this.notificationService.getFilter() === NotificationsFilter.ERROR) {
            priority = NotificationPriority.SILENT;
          } else if (isNotificationSource(options.source) && this.notificationService.getFilter(options.source) === NotificationsFilter.ERROR) {
            priority = NotificationPriority.SILENT;
          }
        }
        return this.withNotificationProgress({ ...options, location, priority }, task, onDidCancel);
      }
      case ProgressLocation.Window: {
        const type = options.type;
        if (options.command) {
          return this.withWindowProgress({ ...options, location, type }, task);
        }
        return this.withNotificationProgress({ delay: 150, ...options, priority: NotificationPriority.SILENT, location: ProgressLocation.Notification, type }, task, onDidCancel);
      }
      case ProgressLocation.Explorer:
        return this.withPaneCompositeProgress("workbench.view.explorer", ViewContainerLocation.Sidebar, task, { ...options, location });
      case ProgressLocation.Scm:
        return handleStringLocation("workbench.scm");
      case ProgressLocation.Extensions:
        return this.withPaneCompositeProgress("workbench.view.extensions", ViewContainerLocation.Sidebar, task, { ...options, location });
      case ProgressLocation.Dialog:
        return this.withDialogProgress(options, task, onDidCancel);
      default:
        throw new Error(`Bad progress location: ${location}`);
    }
  }
  withWindowProgress(options, callback) {
    const task = [options, new Progress(() => this.updateWindowProgress())];
    const promise = callback(task[1]);
    let delayHandle = setTimeout(() => {
      delayHandle = void 0;
      this.windowProgressStack.unshift(task);
      this.updateWindowProgress();
      Promise.all([
        timeout(150),
        promise
      ]).finally(() => {
        const idx = this.windowProgressStack.indexOf(task);
        if (idx !== -1) {
          this.windowProgressStack.splice(idx, 1);
        }
        this.updateWindowProgress();
      });
    }, 150);
    return promise.finally(() => clearTimeout(delayHandle));
  }
  updateWindowProgress(idx = 0) {
    if (idx < this.windowProgressStack.length) {
      const [options, progress] = this.windowProgressStack[idx];
      const progressTitle = options.title;
      const progressMessage = progress.value?.message;
      const progressCommand = options.command;
      let text;
      let title;
      const source = options.source && typeof options.source !== "string" ? options.source.label : options.source;
      if (progressTitle && progressMessage) {
        text = localize("progress.text2", "{0}: {1}", progressTitle, progressMessage);
        title = source ? localize("progress.title3", "[{0}] {1}: {2}", source, progressTitle, progressMessage) : text;
      } else if (progressTitle) {
        text = progressTitle;
        title = source ? localize("progress.title2", "[{0}]: {1}", source, progressTitle) : text;
      } else if (progressMessage) {
        text = progressMessage;
        title = source ? localize("progress.title2", "[{0}]: {1}", source, progressMessage) : text;
      } else {
        this.updateWindowProgress(idx + 1);
        return;
      }
      const statusEntryProperties = {
        name: localize("status.progress", "Progress Message"),
        text,
        showProgress: options.type || true,
        ariaLabel: text,
        tooltip: stripIcons(title).trim(),
        command: progressCommand
      };
      if (this.windowProgressStatusEntry) {
        this.windowProgressStatusEntry.update(statusEntryProperties);
      } else {
        this.windowProgressStatusEntry = this.statusbarService.addEntry(
          statusEntryProperties,
          "status.progress",
          StatusbarAlignment.LEFT,
          -Number.MAX_VALUE
          /* almost last entry */
        );
      }
    } else {
      this.windowProgressStatusEntry?.dispose();
      this.windowProgressStatusEntry = void 0;
    }
  }
  withNotificationProgress(options, callback, onDidCancel) {
    const progressStateModel = new class extends Disposable {
      constructor() {
        super();
        this._onDidReport = this._register(new Emitter());
        this.onDidReport = this._onDidReport.event;
        this._onWillDispose = this._register(new Emitter());
        this.onWillDispose = this._onWillDispose.event;
        this._step = void 0;
        this._done = false;
        this.promise = callback(this);
        this.promise.finally(() => {
          this.dispose();
        });
      }
      get step() {
        return this._step;
      }
      get done() {
        return this._done;
      }
      report(step) {
        this._step = step;
        this._onDidReport.fire(step);
      }
      cancel(choice) {
        onDidCancel?.(choice);
        this.dispose();
      }
      dispose() {
        this._done = true;
        this._onWillDispose.fire();
        super.dispose();
      }
    }();
    const createWindowProgress = () => {
      const promise = new DeferredPromise();
      this.withWindowProgress({
        location: ProgressLocation.Window,
        title: options.title ? parseLinkedText(options.title).toString() : void 0,
        // convert markdown links => string
        command: "notifications.showList",
        type: options.type
      }, (progress) => {
        function reportProgress(step) {
          if (step.message) {
            progress.report({
              message: parseLinkedText(step.message).toString()
              // convert markdown links => string
            });
          }
        }
        if (progressStateModel.step) {
          reportProgress(progressStateModel.step);
        }
        const onDidReportListener = progressStateModel.onDidReport((step) => reportProgress(step));
        promise.p.finally(() => onDidReportListener.dispose());
        Event.once(progressStateModel.onWillDispose)(() => promise.complete());
        return promise.p;
      });
      return toDisposable(() => promise.complete());
    };
    const createNotification = (message, priority, increment) => {
      const notificationDisposables = new DisposableStore();
      const primaryActions = options.primaryActions ? Array.from(options.primaryActions) : [];
      const secondaryActions = options.secondaryActions ? Array.from(options.secondaryActions) : [];
      if (options.buttons) {
        options.buttons.forEach((button, index) => {
          const buttonAction = new class extends Action {
            constructor() {
              super(`progress.button.${button}`, button, void 0, true);
            }
            async run() {
              progressStateModel.cancel(index);
            }
          }();
          notificationDisposables.add(buttonAction);
          primaryActions.push(buttonAction);
        });
      }
      if (options.cancellable) {
        const cancelAction = new class extends Action {
          constructor() {
            super("progress.cancel", typeof options.cancellable === "string" ? options.cancellable : localize("cancel", "Cancel"), void 0, true);
          }
          async run() {
            progressStateModel.cancel();
          }
        }();
        notificationDisposables.add(cancelAction);
        primaryActions.push(cancelAction);
      }
      const notification = this.notificationService.notify({
        severity: Severity.Info,
        message: stripIcons(message),
        // status entries support codicons, but notifications do not (https://github.com/microsoft/vscode/issues/145722)
        source: options.source,
        actions: { primary: primaryActions, secondary: secondaryActions },
        progress: typeof increment === "number" && increment >= 0 ? { total: 100, worked: increment } : { infinite: true },
        priority
      });
      let windowProgressDisposable = void 0;
      const onVisibilityChange = (visible) => {
        dispose(windowProgressDisposable);
        if (!visible && !progressStateModel.done) {
          windowProgressDisposable = createWindowProgress();
        }
      };
      notificationDisposables.add(notification.onDidChangeVisibility(onVisibilityChange));
      if (priority === NotificationPriority.SILENT) {
        onVisibilityChange(false);
      }
      Event.once(notification.onDidClose)(() => {
        notificationDisposables.dispose();
        dispose(windowProgressDisposable);
      });
      return notification;
    };
    const updateProgress = (notification, increment) => {
      if (typeof increment === "number" && increment >= 0) {
        notification.progress.total(100);
        notification.progress.worked(increment);
      } else {
        notification.progress.infinite();
      }
    };
    let notificationHandle;
    let notificationTimeout;
    let titleAndMessage;
    const updateNotification = (step) => {
      if (step?.message && options.title) {
        titleAndMessage = `${options.title}: ${step.message}`;
      } else {
        titleAndMessage = options.title || step?.message;
      }
      if (!notificationHandle && titleAndMessage) {
        if (typeof options.delay === "number" && options.delay > 0) {
          if (notificationTimeout === void 0) {
            notificationTimeout = setTimeout(() => notificationHandle = createNotification(titleAndMessage, options.priority, step?.increment), options.delay);
          }
        } else {
          notificationHandle = createNotification(titleAndMessage, options.priority, step?.increment);
        }
      }
      if (notificationHandle) {
        if (titleAndMessage) {
          notificationHandle.updateMessage(titleAndMessage);
        }
        if (typeof step?.increment === "number") {
          updateProgress(notificationHandle, step.increment);
        }
      }
    };
    updateNotification(progressStateModel.step);
    const listener = progressStateModel.onDidReport((step) => updateNotification(step));
    Event.once(progressStateModel.onWillDispose)(() => listener.dispose());
    (async () => {
      try {
        if (typeof options.delay === "number" && options.delay > 0) {
          await progressStateModel.promise;
        } else {
          await Promise.all([timeout(800), progressStateModel.promise]);
        }
      } finally {
        clearTimeout(notificationTimeout);
        notificationHandle?.close();
      }
    })();
    return progressStateModel.promise;
  }
  withPaneCompositeProgress(paneCompositeId, viewContainerLocation, task, options) {
    const progressIndicator = this.paneCompositeService.getProgressIndicator(paneCompositeId, viewContainerLocation);
    const promise = progressIndicator ? this.withCompositeProgress(progressIndicator, task, options) : task({ report: () => {
    } });
    if (viewContainerLocation === ViewContainerLocation.Sidebar) {
      this.showOnActivityBar(paneCompositeId, options, promise);
    }
    return promise;
  }
  withViewProgress(viewId, task, options) {
    const progressIndicator = this.viewsService.getViewProgressIndicator(viewId);
    const promise = progressIndicator ? this.withCompositeProgress(progressIndicator, task, options) : task({ report: () => {
    } });
    const viewletId = this.viewDescriptorService.getViewContainerByViewId(viewId)?.id;
    if (viewletId === void 0) {
      return promise;
    }
    this.showOnActivityBar(viewletId, options, promise);
    return promise;
  }
  showOnActivityBar(viewletId, options, promise) {
    let activityProgress;
    let delayHandle = setTimeout(() => {
      delayHandle = void 0;
      const handle = this.activityService.showViewContainerActivity(viewletId, { badge: new ProgressBadge(() => "") });
      const startTimeVisible = Date.now();
      const minTimeVisible = 300;
      activityProgress = {
        dispose() {
          const d = Date.now() - startTimeVisible;
          if (d < minTimeVisible) {
            setTimeout(() => handle.dispose(), minTimeVisible - d);
          } else {
            handle.dispose();
          }
        }
      };
    }, options.delay || 300);
    promise.finally(() => {
      clearTimeout(delayHandle);
      dispose(activityProgress);
    });
  }
  withCompositeProgress(progressIndicator, task, options) {
    let discreteProgressRunner = void 0;
    function updateProgress(stepOrTotal) {
      let total = void 0;
      let increment = void 0;
      if (typeof stepOrTotal !== "undefined") {
        if (typeof stepOrTotal === "number") {
          total = stepOrTotal;
        } else if (typeof stepOrTotal.increment === "number") {
          total = stepOrTotal.total ?? 100;
          increment = stepOrTotal.increment;
        }
      }
      if (typeof total === "number") {
        if (!discreteProgressRunner) {
          discreteProgressRunner = progressIndicator.show(total, options.delay);
          promise.catch(
            () => void 0
            /* ignore */
          ).finally(() => discreteProgressRunner?.done());
        }
        if (typeof increment === "number") {
          discreteProgressRunner.worked(increment);
        }
      } else {
        discreteProgressRunner?.done();
        progressIndicator.showWhile(promise, options.delay);
      }
      return discreteProgressRunner;
    }
    const promise = task({
      report: (progress) => {
        updateProgress(progress);
      }
    });
    updateProgress(options.total);
    return promise;
  }
  withDialogProgress(options, task, onDidCancel) {
    const disposables = new DisposableStore();
    let dialog;
    let taskCompleted = false;
    const createDialog = (message) => {
      const buttons = options.buttons || [];
      if (!options.sticky) {
        buttons.push(
          options.cancellable ? typeof options.cancellable === "boolean" ? localize("cancel", "Cancel") : options.cancellable : localize("dismiss", "Dismiss")
        );
      }
      dialog = new Dialog(
        this.layoutService.activeContainer,
        message,
        buttons,
        createWorkbenchDialogOptions({
          type: "pending",
          detail: options.detail,
          cancelId: buttons.length - 1,
          disableCloseAction: options.sticky,
          disableDefaultAction: options.sticky
        }, this.keybindingService, this.layoutService, this.hostService)
      );
      disposables.add(dialog);
      dialog.show().then((dialogResult) => {
        if (!taskCompleted) {
          onDidCancel?.(dialogResult.button);
        }
        dispose(dialog);
      });
      return dialog;
    };
    let delay = options.delay ?? 0;
    let latestMessage = void 0;
    const scheduler = disposables.add(new RunOnceScheduler(() => {
      delay = 0;
      if (latestMessage && !dialog) {
        dialog = createDialog(latestMessage);
      } else if (latestMessage) {
        dialog.updateMessage(latestMessage);
      }
    }, 0));
    const updateDialog = function(message) {
      latestMessage = message;
      if (!scheduler.isScheduled()) {
        scheduler.schedule(delay);
      }
    };
    const promise = task({
      report: (progress) => {
        updateDialog(progress.message);
      }
    });
    promise.finally(() => {
      taskCompleted = true;
      dispose(disposables);
    });
    if (options.title) {
      updateDialog(options.title);
    }
    return promise;
  }
};
ProgressService = __decorateClass([
  __decorateParam(0, IActivityService),
  __decorateParam(1, IPaneCompositePartService),
  __decorateParam(2, IViewDescriptorService),
  __decorateParam(3, IViewsService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IStatusbarService),
  __decorateParam(6, ILayoutService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IUserActivityService),
  __decorateParam(9, IHostService)
], ProgressService);
registerSingleton(IProgressService, ProgressService, InstantiationType.Delayed);
export {
  ProgressService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wcm9ncmVzcy9icm93c2VyL3Byb2dyZXNzU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9wcm9ncmVzc1NlcnZpY2UuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBkaXNwb3NlLCBEaXNwb3NhYmxlU3RvcmUsIERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBJUHJvZ3Jlc3NPcHRpb25zLCBJUHJvZ3Jlc3NTdGVwLCBQcm9ncmVzc0xvY2F0aW9uLCBJUHJvZ3Jlc3MsIFByb2dyZXNzLCBJUHJvZ3Jlc3NDb21wb3NpdGVPcHRpb25zLCBJUHJvZ3Jlc3NOb3RpZmljYXRpb25PcHRpb25zLCBJUHJvZ3Jlc3NSdW5uZXIsIElQcm9ncmVzc0luZGljYXRvciwgSVByb2dyZXNzV2luZG93T3B0aW9ucywgSVByb2dyZXNzRGlhbG9nT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBTdGF0dXNiYXJBbGlnbm1lbnQsIElTdGF0dXNiYXJTZXJ2aWNlLCBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciwgSVN0YXR1c2JhckVudHJ5IH0gZnJvbSAnLi4vLi4vc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgUnVuT25jZVNjaGVkdWxlciwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFByb2dyZXNzQmFkZ2UsIElBY3Rpdml0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi9hY3Rpdml0eS9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5LCBJTm90aWZpY2F0aW9uSGFuZGxlLCBOb3RpZmljYXRpb25Qcmlvcml0eSwgaXNOb3RpZmljYXRpb25Tb3VyY2UsIE5vdGlmaWNhdGlvbnNGaWx0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRGlhbG9nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2RpYWxvZy9kaWFsb2cuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBwYXJzZUxpbmtlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRUZXh0LmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgc3RyaXBJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSVVzZXJBY3Rpdml0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyQWN0aXZpdHkvY29tbW9uL3VzZXJBY3Rpdml0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlV29ya2JlbmNoRGlhbG9nT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZGlhbG9ncy9kaWFsb2cuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaG9zdC9icm93c2VyL2hvc3QuanMnO1xuXG5leHBvcnQgY2xhc3MgUHJvZ3Jlc3NTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQcm9ncmVzc1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWN0aXZpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWN0aXZpdHlTZXJ2aWNlOiBJQWN0aXZpdHlTZXJ2aWNlLFxuXHRcdEBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGFuZUNvbXBvc2l0ZVNlcnZpY2U6IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElTdGF0dXNiYXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSUxheW91dFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElVc2VyQWN0aXZpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckFjdGl2aXR5U2VydmljZTogSVVzZXJBY3Rpdml0eVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyB3aXRoUHJvZ3Jlc3M8UiA9IHVua25vd24+KG9wdGlvbnM6IElQcm9ncmVzc09wdGlvbnMsIG9yaWdpbmFsVGFzazogKHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4pID0+IFByb21pc2U8Uj4sIG9uRGlkQ2FuY2VsPzogKGNob2ljZT86IG51bWJlcikgPT4gdm9pZCk6IFByb21pc2U8Uj4ge1xuXHRcdGNvbnN0IHsgbG9jYXRpb24gfSA9IG9wdGlvbnM7XG5cblx0XHRjb25zdCB0YXNrID0gYXN5bmMgKHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4pID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZUxvY2sgPSB0aGlzLnVzZXJBY3Rpdml0eVNlcnZpY2UubWFya0FjdGl2ZSh7IGV4dGVuZE9ubHk6IHRydWUsIHdoZW5IZWxkRm9yOiAxNV8wMDAgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgb3JpZ2luYWxUYXNrKHByb2dyZXNzKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGFjdGl2ZUxvY2suZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBoYW5kbGVTdHJpbmdMb2NhdGlvbiA9IChsb2NhdGlvbjogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQobG9jYXRpb24pO1xuXHRcdFx0aWYgKHZpZXdDb250YWluZXIpIHtcblx0XHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lckxvY2F0aW9uID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIpO1xuXHRcdFx0XHRpZiAodmlld0NvbnRhaW5lckxvY2F0aW9uICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBhbmVDb21wb3NpdGVQcm9ncmVzcyhsb2NhdGlvbiwgdmlld0NvbnRhaW5lckxvY2F0aW9uLCB0YXNrLCB7IC4uLm9wdGlvbnMsIGxvY2F0aW9uIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3RGVzY3JpcHRvckJ5SWQobG9jYXRpb24pICE9PSBudWxsKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhWaWV3UHJvZ3Jlc3MobG9jYXRpb24sIHRhc2ssIHsgLi4ub3B0aW9ucywgbG9jYXRpb24gfSk7XG5cdFx0XHR9XG5cblx0XHRcdHRocm93IG5ldyBFcnJvcihgQmFkIHByb2dyZXNzIGxvY2F0aW9uOiAke2xvY2F0aW9ufWApO1xuXHRcdH07XG5cblx0XHRpZiAodHlwZW9mIGxvY2F0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGhhbmRsZVN0cmluZ0xvY2F0aW9uKGxvY2F0aW9uKTtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKGxvY2F0aW9uKSB7XG5cdFx0XHRjYXNlIFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uOiB7XG5cdFx0XHRcdGxldCBwcmlvcml0eSA9IChvcHRpb25zIGFzIElQcm9ncmVzc05vdGlmaWNhdGlvbk9wdGlvbnMpLnByaW9yaXR5O1xuXHRcdFx0XHRpZiAocHJpb3JpdHkgIT09IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVCkge1xuXHRcdFx0XHRcdGlmICh0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZ2V0RmlsdGVyKCkgPT09IE5vdGlmaWNhdGlvbnNGaWx0ZXIuRVJST1IpIHtcblx0XHRcdFx0XHRcdHByaW9yaXR5ID0gTm90aWZpY2F0aW9uUHJpb3JpdHkuU0lMRU5UO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNOb3RpZmljYXRpb25Tb3VyY2Uob3B0aW9ucy5zb3VyY2UpICYmIHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5nZXRGaWx0ZXIob3B0aW9ucy5zb3VyY2UpID09PSBOb3RpZmljYXRpb25zRmlsdGVyLkVSUk9SKSB7XG5cdFx0XHRcdFx0XHRwcmlvcml0eSA9IE5vdGlmaWNhdGlvblByaW9yaXR5LlNJTEVOVDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoTm90aWZpY2F0aW9uUHJvZ3Jlc3MoeyAuLi5vcHRpb25zLCBsb2NhdGlvbiwgcHJpb3JpdHkgfSwgdGFzaywgb25EaWRDYW5jZWwpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdzoge1xuXHRcdFx0XHRjb25zdCB0eXBlID0gKG9wdGlvbnMgYXMgSVByb2dyZXNzV2luZG93T3B0aW9ucykudHlwZTtcblx0XHRcdFx0aWYgKChvcHRpb25zIGFzIElQcm9ncmVzc1dpbmRvd09wdGlvbnMpLmNvbW1hbmQpIHtcblx0XHRcdFx0XHQvLyBXaW5kb3cgcHJvZ3Jlc3Mgd2l0aCBjb21tYW5kIGdldCdzIHNob3duIGluIHRoZSBzdGF0dXMgYmFyXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFdpbmRvd1Byb2dyZXNzKHsgLi4ub3B0aW9ucywgbG9jYXRpb24sIHR5cGUgfSwgdGFzayk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gV2luZG93IHByb2dyZXNzIHdpdGhvdXQgY29tbWFuZCBjYW4gYmUgc2hvd24gYXMgc2lsZW50IG5vdGlmaWNhdGlvblxuXHRcdFx0XHQvLyB3aGljaCB3aWxsIGZpcnN0IGFwcGVhciBpbiB0aGUgc3RhdHVzIGJhciBhbmQgY2FuIHRoZW4gYmUgYnJvdWdodCB0b1xuXHRcdFx0XHQvLyB0aGUgZnJvbnQgd2hlbiBjbGlja2luZy5cblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aE5vdGlmaWNhdGlvblByb2dyZXNzKHsgZGVsYXk6IDE1MCAvKiBkZWZhdWx0IGZvciBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyAqLywgLi4ub3B0aW9ucywgcHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlNJTEVOVCwgbG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLCB0eXBlIH0sIHRhc2ssIG9uRGlkQ2FuY2VsKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgUHJvZ3Jlc3NMb2NhdGlvbi5FeHBsb3Jlcjpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBhbmVDb21wb3NpdGVQcm9ncmVzcygnd29ya2JlbmNoLnZpZXcuZXhwbG9yZXInLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgdGFzaywgeyAuLi5vcHRpb25zLCBsb2NhdGlvbiB9KTtcblx0XHRcdGNhc2UgUHJvZ3Jlc3NMb2NhdGlvbi5TY206XG5cdFx0XHRcdHJldHVybiBoYW5kbGVTdHJpbmdMb2NhdGlvbignd29ya2JlbmNoLnNjbScpO1xuXHRcdFx0Y2FzZSBQcm9ncmVzc0xvY2F0aW9uLkV4dGVuc2lvbnM6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQYW5lQ29tcG9zaXRlUHJvZ3Jlc3MoJ3dvcmtiZW5jaC52aWV3LmV4dGVuc2lvbnMnLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgdGFzaywgeyAuLi5vcHRpb25zLCBsb2NhdGlvbiB9KTtcblx0XHRcdGNhc2UgUHJvZ3Jlc3NMb2NhdGlvbi5EaWFsb2c6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhEaWFsb2dQcm9ncmVzcyhvcHRpb25zLCB0YXNrLCBvbkRpZENhbmNlbCk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEJhZCBwcm9ncmVzcyBsb2NhdGlvbjogJHtsb2NhdGlvbn1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHdpbmRvd1Byb2dyZXNzU3RhY2s6IFtJUHJvZ3Jlc3NXaW5kb3dPcHRpb25zLCBQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPl1bXSA9IFtdO1xuXHRwcml2YXRlIHdpbmRvd1Byb2dyZXNzU3RhdHVzRW50cnk6IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgd2l0aFdpbmRvd1Byb2dyZXNzPFIgPSB1bmtub3duPihvcHRpb25zOiBJUHJvZ3Jlc3NXaW5kb3dPcHRpb25zLCBjYWxsYmFjazogKHByb2dyZXNzOiBJUHJvZ3Jlc3M8eyBtZXNzYWdlPzogc3RyaW5nIH0+KSA9PiBQcm9taXNlPFI+KTogUHJvbWlzZTxSPiB7XG5cdFx0Y29uc3QgdGFzazogW0lQcm9ncmVzc1dpbmRvd09wdGlvbnMsIFByb2dyZXNzPElQcm9ncmVzc1N0ZXA+XSA9IFtvcHRpb25zLCBuZXcgUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4oKCkgPT4gdGhpcy51cGRhdGVXaW5kb3dQcm9ncmVzcygpKV07XG5cblx0XHRjb25zdCBwcm9taXNlID0gY2FsbGJhY2sodGFza1sxXSk7XG5cblx0XHRsZXQgZGVsYXlIYW5kbGU6IFRpbWVvdXQgfCB1bmRlZmluZWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGRlbGF5SGFuZGxlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy53aW5kb3dQcm9ncmVzc1N0YWNrLnVuc2hpZnQodGFzayk7XG5cdFx0XHR0aGlzLnVwZGF0ZVdpbmRvd1Byb2dyZXNzKCk7XG5cblx0XHRcdC8vIHNob3cgcHJvZ3Jlc3MgZm9yIGF0IGxlYXN0IDE1MG1zXG5cdFx0XHRQcm9taXNlLmFsbChbXG5cdFx0XHRcdHRpbWVvdXQoMTUwKSxcblx0XHRcdFx0cHJvbWlzZVxuXHRcdFx0XSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IHRoaXMud2luZG93UHJvZ3Jlc3NTdGFjay5pbmRleE9mKHRhc2spO1xuXHRcdFx0XHRpZiAoaWR4ICE9PSAtMSkge1xuXHRcdFx0XHRcdHRoaXMud2luZG93UHJvZ3Jlc3NTdGFjay5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnVwZGF0ZVdpbmRvd1Byb2dyZXNzKCk7XG5cdFx0XHR9KTtcblx0XHR9LCAxNTApO1xuXG5cdFx0Ly8gY2FuY2VsIGRlbGF5IGlmIHByb21pc2UgZmluaXNoZXMgYmVsb3cgMTUwbXNcblx0XHRyZXR1cm4gcHJvbWlzZS5maW5hbGx5KCgpID0+IGNsZWFyVGltZW91dChkZWxheUhhbmRsZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVXaW5kb3dQcm9ncmVzcyhpZHggPSAwKSB7XG5cblx0XHQvLyBXZSBzdGlsbCBoYXZlIHByb2dyZXNzIHRvIHNob3dcblx0XHRpZiAoaWR4IDwgdGhpcy53aW5kb3dQcm9ncmVzc1N0YWNrLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgW29wdGlvbnMsIHByb2dyZXNzXSA9IHRoaXMud2luZG93UHJvZ3Jlc3NTdGFja1tpZHhdO1xuXG5cdFx0XHRjb25zdCBwcm9ncmVzc1RpdGxlID0gb3B0aW9ucy50aXRsZTtcblx0XHRcdGNvbnN0IHByb2dyZXNzTWVzc2FnZSA9IHByb2dyZXNzLnZhbHVlPy5tZXNzYWdlO1xuXHRcdFx0Y29uc3QgcHJvZ3Jlc3NDb21tYW5kID0gb3B0aW9ucy5jb21tYW5kO1xuXHRcdFx0bGV0IHRleHQ6IHN0cmluZztcblx0XHRcdGxldCB0aXRsZTogc3RyaW5nO1xuXHRcdFx0Y29uc3Qgc291cmNlID0gb3B0aW9ucy5zb3VyY2UgJiYgdHlwZW9mIG9wdGlvbnMuc291cmNlICE9PSAnc3RyaW5nJyA/IG9wdGlvbnMuc291cmNlLmxhYmVsIDogb3B0aW9ucy5zb3VyY2U7XG5cblx0XHRcdGlmIChwcm9ncmVzc1RpdGxlICYmIHByb2dyZXNzTWVzc2FnZSkge1xuXHRcdFx0XHQvLyA8dGl0bGU+OiA8bWVzc2FnZT5cblx0XHRcdFx0dGV4dCA9IGxvY2FsaXplKCdwcm9ncmVzcy50ZXh0MicsIFwiezB9OiB7MX1cIiwgcHJvZ3Jlc3NUaXRsZSwgcHJvZ3Jlc3NNZXNzYWdlKTtcblx0XHRcdFx0dGl0bGUgPSBzb3VyY2UgPyBsb2NhbGl6ZSgncHJvZ3Jlc3MudGl0bGUzJywgXCJbezB9XSB7MX06IHsyfVwiLCBzb3VyY2UsIHByb2dyZXNzVGl0bGUsIHByb2dyZXNzTWVzc2FnZSkgOiB0ZXh0O1xuXG5cdFx0XHR9IGVsc2UgaWYgKHByb2dyZXNzVGl0bGUpIHtcblx0XHRcdFx0Ly8gPHRpdGxlPlxuXHRcdFx0XHR0ZXh0ID0gcHJvZ3Jlc3NUaXRsZTtcblx0XHRcdFx0dGl0bGUgPSBzb3VyY2UgPyBsb2NhbGl6ZSgncHJvZ3Jlc3MudGl0bGUyJywgXCJbezB9XTogezF9XCIsIHNvdXJjZSwgcHJvZ3Jlc3NUaXRsZSkgOiB0ZXh0O1xuXG5cdFx0XHR9IGVsc2UgaWYgKHByb2dyZXNzTWVzc2FnZSkge1xuXHRcdFx0XHQvLyA8bWVzc2FnZT5cblx0XHRcdFx0dGV4dCA9IHByb2dyZXNzTWVzc2FnZTtcblx0XHRcdFx0dGl0bGUgPSBzb3VyY2UgPyBsb2NhbGl6ZSgncHJvZ3Jlc3MudGl0bGUyJywgXCJbezB9XTogezF9XCIsIHNvdXJjZSwgcHJvZ3Jlc3NNZXNzYWdlKSA6IHRleHQ7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIG5vIHRpdGxlLCBubyBtZXNzYWdlIC0+IG5vIHByb2dyZXNzLiB0cnkgd2l0aCBuZXh0IG9uIHN0YWNrXG5cdFx0XHRcdHRoaXMudXBkYXRlV2luZG93UHJvZ3Jlc3MoaWR4ICsgMSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdHVzRW50cnlQcm9wZXJ0aWVzOiBJU3RhdHVzYmFyRW50cnkgPSB7XG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdzdGF0dXMucHJvZ3Jlc3MnLCBcIlByb2dyZXNzIE1lc3NhZ2VcIiksXG5cdFx0XHRcdHRleHQsXG5cdFx0XHRcdHNob3dQcm9ncmVzczogb3B0aW9ucy50eXBlIHx8IHRydWUsXG5cdFx0XHRcdGFyaWFMYWJlbDogdGV4dCxcblx0XHRcdFx0dG9vbHRpcDogc3RyaXBJY29ucyh0aXRsZSkudHJpbSgpLFxuXHRcdFx0XHRjb21tYW5kOiBwcm9ncmVzc0NvbW1hbmRcblx0XHRcdH07XG5cblx0XHRcdGlmICh0aGlzLndpbmRvd1Byb2dyZXNzU3RhdHVzRW50cnkpIHtcblx0XHRcdFx0dGhpcy53aW5kb3dQcm9ncmVzc1N0YXR1c0VudHJ5LnVwZGF0ZShzdGF0dXNFbnRyeVByb3BlcnRpZXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy53aW5kb3dQcm9ncmVzc1N0YXR1c0VudHJ5ID0gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KHN0YXR1c0VudHJ5UHJvcGVydGllcywgJ3N0YXR1cy5wcm9ncmVzcycsIFN0YXR1c2JhckFsaWdubWVudC5MRUZULCAtTnVtYmVyLk1BWF9WQUxVRSAvKiBhbG1vc3QgbGFzdCBlbnRyeSAqLyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUHJvZ3Jlc3MgaXMgZG9uZSBzbyB3ZSByZW1vdmUgdGhlIHN0YXR1cyBlbnRyeVxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy53aW5kb3dQcm9ncmVzc1N0YXR1c0VudHJ5Py5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLndpbmRvd1Byb2dyZXNzU3RhdHVzRW50cnkgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB3aXRoTm90aWZpY2F0aW9uUHJvZ3Jlc3M8UCBleHRlbmRzIFByb21pc2U8Uj4sIFIgPSB1bmtub3duPihvcHRpb25zOiBJUHJvZ3Jlc3NOb3RpZmljYXRpb25PcHRpb25zLCBjYWxsYmFjazogKHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4pID0+IFAsIG9uRGlkQ2FuY2VsPzogKGNob2ljZT86IG51bWJlcikgPT4gdm9pZCk6IFAge1xuXG5cdFx0Y29uc3QgcHJvZ3Jlc3NTdGF0ZU1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0XHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVwb3J0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVByb2dyZXNzU3RlcD4oKSk7XG5cdFx0XHRyZWFkb25seSBvbkRpZFJlcG9ydCA9IHRoaXMuX29uRGlkUmVwb3J0LmV2ZW50O1xuXG5cdFx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxEaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0XHRyZWFkb25seSBvbldpbGxEaXNwb3NlID0gdGhpcy5fb25XaWxsRGlzcG9zZS5ldmVudDtcblxuXHRcdFx0cHJpdmF0ZSBfc3RlcDogSVByb2dyZXNzU3RlcCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGdldCBzdGVwKCkgeyByZXR1cm4gdGhpcy5fc3RlcDsgfVxuXG5cdFx0XHRwcml2YXRlIF9kb25lID0gZmFsc2U7XG5cdFx0XHRnZXQgZG9uZSgpIHsgcmV0dXJuIHRoaXMuX2RvbmU7IH1cblxuXHRcdFx0cmVhZG9ubHkgcHJvbWlzZTogUDtcblxuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKCk7XG5cblx0XHRcdFx0dGhpcy5wcm9taXNlID0gY2FsbGJhY2sodGhpcyk7XG5cblx0XHRcdFx0dGhpcy5wcm9taXNlLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cmVwb3J0KHN0ZXA6IElQcm9ncmVzc1N0ZXApOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5fc3RlcCA9IHN0ZXA7XG5cblx0XHRcdFx0dGhpcy5fb25EaWRSZXBvcnQuZmlyZShzdGVwKTtcblx0XHRcdH1cblxuXHRcdFx0Y2FuY2VsKGNob2ljZT86IG51bWJlcik6IHZvaWQge1xuXHRcdFx0XHRvbkRpZENhbmNlbD8uKGNob2ljZSk7XG5cblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuX2RvbmUgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmZpcmUoKTtcblxuXHRcdFx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNyZWF0ZVdpbmRvd1Byb2dyZXNzID0gKCkgPT4ge1xuXG5cdFx0XHQvLyBDcmVhdGUgYSBwcm9taXNlIHRoYXQgd2UgY2FuIHJlc29sdmUgYXMgbmVlZGVkXG5cdFx0XHQvLyB3aGVuIHRoZSBvdXRzaWRlIGNhbGxzIGRpc3Bvc2Ugb24gdXNcblx0XHRcdGNvbnN0IHByb21pc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0XHRcdHRoaXMud2l0aFdpbmRvd1Byb2dyZXNzKHtcblx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uV2luZG93LFxuXHRcdFx0XHR0aXRsZTogb3B0aW9ucy50aXRsZSA/IHBhcnNlTGlua2VkVGV4dChvcHRpb25zLnRpdGxlKS50b1N0cmluZygpIDogdW5kZWZpbmVkLCAvLyBjb252ZXJ0IG1hcmtkb3duIGxpbmtzID0+IHN0cmluZ1xuXHRcdFx0XHRjb21tYW5kOiAnbm90aWZpY2F0aW9ucy5zaG93TGlzdCcsXG5cdFx0XHRcdHR5cGU6IG9wdGlvbnMudHlwZVxuXHRcdFx0fSwgcHJvZ3Jlc3MgPT4ge1xuXG5cdFx0XHRcdGZ1bmN0aW9uIHJlcG9ydFByb2dyZXNzKHN0ZXA6IElQcm9ncmVzc1N0ZXApIHtcblx0XHRcdFx0XHRpZiAoc3RlcC5tZXNzYWdlKSB7XG5cdFx0XHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoe1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBwYXJzZUxpbmtlZFRleHQoc3RlcC5tZXNzYWdlKS50b1N0cmluZygpICAvLyBjb252ZXJ0IG1hcmtkb3duIGxpbmtzID0+IHN0cmluZ1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQXBwbHkgYW55IHByb2dyZXNzIHRoYXQgd2FzIG1hZGUgYWxyZWFkeVxuXHRcdFx0XHRpZiAocHJvZ3Jlc3NTdGF0ZU1vZGVsLnN0ZXApIHtcblx0XHRcdFx0XHRyZXBvcnRQcm9ncmVzcyhwcm9ncmVzc1N0YXRlTW9kZWwuc3RlcCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDb250aW51ZSB0byByZXBvcnQgcHJvZ3Jlc3MgYXMgaXQgaGFwcGVuc1xuXHRcdFx0XHRjb25zdCBvbkRpZFJlcG9ydExpc3RlbmVyID0gcHJvZ3Jlc3NTdGF0ZU1vZGVsLm9uRGlkUmVwb3J0KHN0ZXAgPT4gcmVwb3J0UHJvZ3Jlc3Moc3RlcCkpO1xuXHRcdFx0XHRwcm9taXNlLnAuZmluYWxseSgoKSA9PiBvbkRpZFJlcG9ydExpc3RlbmVyLmRpc3Bvc2UoKSk7XG5cblx0XHRcdFx0Ly8gV2hlbiB0aGUgcHJvZ3Jlc3MgbW9kZWwgZ2V0cyBkaXNwb3NlZCwgd2UgYXJlIGRvbmUgYXMgd2VsbFxuXHRcdFx0XHRFdmVudC5vbmNlKHByb2dyZXNzU3RhdGVNb2RlbC5vbldpbGxEaXNwb3NlKSgoKSA9PiBwcm9taXNlLmNvbXBsZXRlKCkpO1xuXG5cdFx0XHRcdHJldHVybiBwcm9taXNlLnA7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gRGlzcG9zZSBtZWFucyBjb21wbGV0aW5nIG91ciBwcm9taXNlXG5cdFx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHByb21pc2UuY29tcGxldGUoKSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNyZWF0ZU5vdGlmaWNhdGlvbiA9IChtZXNzYWdlOiBzdHJpbmcsIHByaW9yaXR5PzogTm90aWZpY2F0aW9uUHJpb3JpdHksIGluY3JlbWVudD86IG51bWJlcik6IElOb3RpZmljYXRpb25IYW5kbGUgPT4ge1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGNvbnN0IHByaW1hcnlBY3Rpb25zID0gb3B0aW9ucy5wcmltYXJ5QWN0aW9ucyA/IEFycmF5LmZyb20ob3B0aW9ucy5wcmltYXJ5QWN0aW9ucykgOiBbXTtcblx0XHRcdGNvbnN0IHNlY29uZGFyeUFjdGlvbnMgPSBvcHRpb25zLnNlY29uZGFyeUFjdGlvbnMgPyBBcnJheS5mcm9tKG9wdGlvbnMuc2Vjb25kYXJ5QWN0aW9ucykgOiBbXTtcblxuXHRcdFx0aWYgKG9wdGlvbnMuYnV0dG9ucykge1xuXHRcdFx0XHRvcHRpb25zLmJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGJ1dHRvbkFjdGlvbiA9IG5ldyBjbGFzcyBleHRlbmRzIEFjdGlvbiB7XG5cdFx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdFx0c3VwZXIoYHByb2dyZXNzLmJ1dHRvbi4ke2J1dHRvbn1gLCBidXR0b24sIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRcdFx0cHJvZ3Jlc3NTdGF0ZU1vZGVsLmNhbmNlbChpbmRleCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRub3RpZmljYXRpb25EaXNwb3NhYmxlcy5hZGQoYnV0dG9uQWN0aW9uKTtcblxuXHRcdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2goYnV0dG9uQWN0aW9uKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvcHRpb25zLmNhbmNlbGxhYmxlKSB7XG5cdFx0XHRcdGNvbnN0IGNhbmNlbEFjdGlvbiA9IG5ldyBjbGFzcyBleHRlbmRzIEFjdGlvbiB7XG5cdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRzdXBlcigncHJvZ3Jlc3MuY2FuY2VsJywgdHlwZW9mIG9wdGlvbnMuY2FuY2VsbGFibGUgPT09ICdzdHJpbmcnID8gb3B0aW9ucy5jYW5jZWxsYWJsZSA6IGxvY2FsaXplKCdjYW5jZWwnLCBcIkNhbmNlbFwiKSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdFx0XHRwcm9ncmVzc1N0YXRlTW9kZWwuY2FuY2VsKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRub3RpZmljYXRpb25EaXNwb3NhYmxlcy5hZGQoY2FuY2VsQWN0aW9uKTtcblxuXHRcdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKGNhbmNlbEFjdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0bWVzc2FnZTogc3RyaXBJY29ucyhtZXNzYWdlKSwgLy8gc3RhdHVzIGVudHJpZXMgc3VwcG9ydCBjb2RpY29ucywgYnV0IG5vdGlmaWNhdGlvbnMgZG8gbm90IChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTQ1NzIyKVxuXHRcdFx0XHRzb3VyY2U6IG9wdGlvbnMuc291cmNlLFxuXHRcdFx0XHRhY3Rpb25zOiB7IHByaW1hcnk6IHByaW1hcnlBY3Rpb25zLCBzZWNvbmRhcnk6IHNlY29uZGFyeUFjdGlvbnMgfSxcblx0XHRcdFx0cHJvZ3Jlc3M6IHR5cGVvZiBpbmNyZW1lbnQgPT09ICdudW1iZXInICYmIGluY3JlbWVudCA+PSAwID8geyB0b3RhbDogMTAwLCB3b3JrZWQ6IGluY3JlbWVudCB9IDogeyBpbmZpbml0ZTogdHJ1ZSB9LFxuXHRcdFx0XHRwcmlvcml0eVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFN3aXRjaCB0byB3aW5kb3cgYmFzZWQgcHJvZ3Jlc3Mgb25jZSB0aGUgbm90aWZpY2F0aW9uXG5cdFx0XHQvLyBjaGFuZ2VzIHZpc2liaWxpdHkgdG8gaGlkZGVuIGFuZCBpcyBzdGlsbCBvbmdvaW5nLlxuXHRcdFx0Ly8gUmVtb3ZlIHRoYXQgd2luZG93IGJhc2VkIHByb2dyZXNzIG9uY2UgdGhlIG5vdGlmaWNhdGlvblxuXHRcdFx0Ly8gc2hvd3MgYWdhaW4uXG5cdFx0XHRsZXQgd2luZG93UHJvZ3Jlc3NEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG9uVmlzaWJpbGl0eUNoYW5nZSA9ICh2aXNpYmxlOiBib29sZWFuKSA9PiB7XG5cblx0XHRcdFx0Ly8gQ2xlYXIgYW55IHByZXZpb3VzIHJ1bm5pbmcgd2luZG93IHByb2dyZXNzXG5cdFx0XHRcdGRpc3Bvc2Uod2luZG93UHJvZ3Jlc3NEaXNwb3NhYmxlKTtcblxuXHRcdFx0XHQvLyBDcmVhdGUgbmV3IHdpbmRvdyBwcm9ncmVzcyBpZiBub3RpZmljYXRpb24gZ290IGhpZGRlblxuXHRcdFx0XHRpZiAoIXZpc2libGUgJiYgIXByb2dyZXNzU3RhdGVNb2RlbC5kb25lKSB7XG5cdFx0XHRcdFx0d2luZG93UHJvZ3Jlc3NEaXNwb3NhYmxlID0gY3JlYXRlV2luZG93UHJvZ3Jlc3MoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdG5vdGlmaWNhdGlvbkRpc3Bvc2FibGVzLmFkZChub3RpZmljYXRpb24ub25EaWRDaGFuZ2VWaXNpYmlsaXR5KG9uVmlzaWJpbGl0eUNoYW5nZSkpO1xuXHRcdFx0aWYgKHByaW9yaXR5ID09PSBOb3RpZmljYXRpb25Qcmlvcml0eS5TSUxFTlQpIHtcblx0XHRcdFx0b25WaXNpYmlsaXR5Q2hhbmdlKGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2xlYXIgdXBvbiBkaXNwb3NlXG5cdFx0XHRFdmVudC5vbmNlKG5vdGlmaWNhdGlvbi5vbkRpZENsb3NlKSgoKSA9PiB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvbkRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0ZGlzcG9zZSh3aW5kb3dQcm9ncmVzc0Rpc3Bvc2FibGUpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiBub3RpZmljYXRpb247XG5cdFx0fTtcblxuXHRcdGNvbnN0IHVwZGF0ZVByb2dyZXNzID0gKG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvbkhhbmRsZSwgaW5jcmVtZW50PzogbnVtYmVyKTogdm9pZCA9PiB7XG5cdFx0XHRpZiAodHlwZW9mIGluY3JlbWVudCA9PT0gJ251bWJlcicgJiYgaW5jcmVtZW50ID49IDApIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uLnByb2dyZXNzLnRvdGFsKDEwMCk7IC8vIGFsd2F5cyBwZXJjZW50YWdlIGJhc2VkXG5cdFx0XHRcdG5vdGlmaWNhdGlvbi5wcm9ncmVzcy53b3JrZWQoaW5jcmVtZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvbi5wcm9ncmVzcy5pbmZpbml0ZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsZXQgbm90aWZpY2F0aW9uSGFuZGxlOiBJTm90aWZpY2F0aW9uSGFuZGxlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBub3RpZmljYXRpb25UaW1lb3V0OiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXHRcdGxldCB0aXRsZUFuZE1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZDsgLy8gaG9pc3RlZCB0byBtYWtlIHN1cmUgYSBkZWxheWVkIG5vdGlmaWNhdGlvbiBzaG93cyB0aGUgbW9zdCByZWNlbnQgbWVzc2FnZVxuXG5cdFx0Y29uc3QgdXBkYXRlTm90aWZpY2F0aW9uID0gKHN0ZXA/OiBJUHJvZ3Jlc3NTdGVwKTogdm9pZCA9PiB7XG5cblx0XHRcdC8vIGZ1bGwgbWVzc2FnZSAoaW5pdGFsIG9yIHVwZGF0ZSlcblx0XHRcdGlmIChzdGVwPy5tZXNzYWdlICYmIG9wdGlvbnMudGl0bGUpIHtcblx0XHRcdFx0dGl0bGVBbmRNZXNzYWdlID0gYCR7b3B0aW9ucy50aXRsZX06ICR7c3RlcC5tZXNzYWdlfWA7IC8vIGFsd2F5cyBwcmVmaXggd2l0aCBvdmVyYWxsIHRpdGxlIGlmIHdlIGhhdmUgaXQgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy81MDkzMilcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRpdGxlQW5kTWVzc2FnZSA9IG9wdGlvbnMudGl0bGUgfHwgc3RlcD8ubWVzc2FnZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFub3RpZmljYXRpb25IYW5kbGUgJiYgdGl0bGVBbmRNZXNzYWdlKSB7XG5cblx0XHRcdFx0Ly8gY3JlYXRlIG5vdGlmaWNhdGlvbiBub3cgb3IgYWZ0ZXIgYSBkZWxheVxuXHRcdFx0XHRpZiAodHlwZW9mIG9wdGlvbnMuZGVsYXkgPT09ICdudW1iZXInICYmIG9wdGlvbnMuZGVsYXkgPiAwKSB7XG5cdFx0XHRcdFx0aWYgKG5vdGlmaWNhdGlvblRpbWVvdXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0bm90aWZpY2F0aW9uVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4gbm90aWZpY2F0aW9uSGFuZGxlID0gY3JlYXRlTm90aWZpY2F0aW9uKHRpdGxlQW5kTWVzc2FnZSEsIG9wdGlvbnMucHJpb3JpdHksIHN0ZXA/LmluY3JlbWVudCksIG9wdGlvbnMuZGVsYXkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRub3RpZmljYXRpb25IYW5kbGUgPSBjcmVhdGVOb3RpZmljYXRpb24odGl0bGVBbmRNZXNzYWdlLCBvcHRpb25zLnByaW9yaXR5LCBzdGVwPy5pbmNyZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChub3RpZmljYXRpb25IYW5kbGUpIHtcblx0XHRcdFx0aWYgKHRpdGxlQW5kTWVzc2FnZSkge1xuXHRcdFx0XHRcdG5vdGlmaWNhdGlvbkhhbmRsZS51cGRhdGVNZXNzYWdlKHRpdGxlQW5kTWVzc2FnZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodHlwZW9mIHN0ZXA/LmluY3JlbWVudCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHR1cGRhdGVQcm9ncmVzcyhub3RpZmljYXRpb25IYW5kbGUsIHN0ZXAuaW5jcmVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBTaG93IGluaXRpYWxseVxuXHRcdHVwZGF0ZU5vdGlmaWNhdGlvbihwcm9ncmVzc1N0YXRlTW9kZWwuc3RlcCk7XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBwcm9ncmVzc1N0YXRlTW9kZWwub25EaWRSZXBvcnQoc3RlcCA9PiB1cGRhdGVOb3RpZmljYXRpb24oc3RlcCkpO1xuXHRcdEV2ZW50Lm9uY2UocHJvZ3Jlc3NTdGF0ZU1vZGVsLm9uV2lsbERpc3Bvc2UpKCgpID0+IGxpc3RlbmVyLmRpc3Bvc2UoKSk7XG5cblx0XHQvLyBDbGVhbiB1cCBldmVudHVhbGx5XG5cdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cblx0XHRcdFx0Ly8gd2l0aCBhIGRlbGF5IHdlIG9ubHkgd2FpdCBmb3IgdGhlIGZpbmlzaCBvZiB0aGUgcHJvbWlzZVxuXHRcdFx0XHRpZiAodHlwZW9mIG9wdGlvbnMuZGVsYXkgPT09ICdudW1iZXInICYmIG9wdGlvbnMuZGVsYXkgPiAwKSB7XG5cdFx0XHRcdFx0YXdhaXQgcHJvZ3Jlc3NTdGF0ZU1vZGVsLnByb21pc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB3aXRob3V0IGEgZGVsYXkgd2Ugc2hvdyB0aGUgbm90aWZpY2F0aW9uIGZvciBhdCBsZWFzdCA4MDBtc1xuXHRcdFx0XHQvLyB0byByZWR1Y2UgdGhlIGNoYW5jZSBvZiB0aGUgbm90aWZpY2F0aW9uIGZsYXNoaW5nIHVwIGFuZCBoaWRpbmdcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3RpbWVvdXQoODAwKSwgcHJvZ3Jlc3NTdGF0ZU1vZGVsLnByb21pc2VdKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KG5vdGlmaWNhdGlvblRpbWVvdXQpO1xuXHRcdFx0XHRub3RpZmljYXRpb25IYW5kbGU/LmNsb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblxuXHRcdHJldHVybiBwcm9ncmVzc1N0YXRlTW9kZWwucHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgd2l0aFBhbmVDb21wb3NpdGVQcm9ncmVzczxQIGV4dGVuZHMgUHJvbWlzZTxSPiwgUiA9IHVua25vd24+KHBhbmVDb21wb3NpdGVJZDogc3RyaW5nLCB2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbiwgdGFzazogKHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4pID0+IFAsIG9wdGlvbnM6IElQcm9ncmVzc0NvbXBvc2l0ZU9wdGlvbnMpOiBQIHtcblxuXHRcdC8vIHNob3cgaW4gdmlld2xldFxuXHRcdGNvbnN0IHByb2dyZXNzSW5kaWNhdG9yID0gdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRQcm9ncmVzc0luZGljYXRvcihwYW5lQ29tcG9zaXRlSWQsIHZpZXdDb250YWluZXJMb2NhdGlvbik7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHByb2dyZXNzSW5kaWNhdG9yID8gdGhpcy53aXRoQ29tcG9zaXRlUHJvZ3Jlc3MocHJvZ3Jlc3NJbmRpY2F0b3IsIHRhc2ssIG9wdGlvbnMpIDogdGFzayh7IHJlcG9ydDogKCkgPT4geyB9IH0pO1xuXG5cdFx0Ly8gc2hvdyBvbiBhY3Rpdml0eSBiYXJcblx0XHRpZiAodmlld0NvbnRhaW5lckxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikge1xuXHRcdFx0dGhpcy5zaG93T25BY3Rpdml0eUJhcjxQLCBSPihwYW5lQ29tcG9zaXRlSWQsIG9wdGlvbnMsIHByb21pc2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSB3aXRoVmlld1Byb2dyZXNzPFAgZXh0ZW5kcyBQcm9taXNlPFI+LCBSID0gdW5rbm93bj4odmlld0lkOiBzdHJpbmcsIHRhc2s6IChwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+KSA9PiBQLCBvcHRpb25zOiBJUHJvZ3Jlc3NDb21wb3NpdGVPcHRpb25zKTogUCB7XG5cblx0XHQvLyBzaG93IGluIHZpZXdsZXRcblx0XHRjb25zdCBwcm9ncmVzc0luZGljYXRvciA9IHRoaXMudmlld3NTZXJ2aWNlLmdldFZpZXdQcm9ncmVzc0luZGljYXRvcih2aWV3SWQpO1xuXHRcdGNvbnN0IHByb21pc2UgPSBwcm9ncmVzc0luZGljYXRvciA/IHRoaXMud2l0aENvbXBvc2l0ZVByb2dyZXNzKHByb2dyZXNzSW5kaWNhdG9yLCB0YXNrLCBvcHRpb25zKSA6IHRhc2soeyByZXBvcnQ6ICgpID0+IHsgfSB9KTtcblxuXHRcdGNvbnN0IHZpZXdsZXRJZCA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZCh2aWV3SWQpPy5pZDtcblx0XHRpZiAodmlld2xldElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBwcm9taXNlO1xuXHRcdH1cblxuXHRcdC8vIHNob3cgb24gYWN0aXZpdHkgYmFyXG5cdFx0dGhpcy5zaG93T25BY3Rpdml0eUJhcih2aWV3bGV0SWQsIG9wdGlvbnMsIHByb21pc2UpO1xuXG5cdFx0cmV0dXJuIHByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIHNob3dPbkFjdGl2aXR5QmFyPFAgZXh0ZW5kcyBQcm9taXNlPFI+LCBSID0gdW5rbm93bj4odmlld2xldElkOiBzdHJpbmcsIG9wdGlvbnM6IElQcm9ncmVzc0NvbXBvc2l0ZU9wdGlvbnMsIHByb21pc2U6IFApOiB2b2lkIHtcblx0XHRsZXQgYWN0aXZpdHlQcm9ncmVzczogSURpc3Bvc2FibGU7XG5cdFx0bGV0IGRlbGF5SGFuZGxlOiBUaW1lb3V0IHwgdW5kZWZpbmVkID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRkZWxheUhhbmRsZSA9IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuYWN0aXZpdHlTZXJ2aWNlLnNob3dWaWV3Q29udGFpbmVyQWN0aXZpdHkodmlld2xldElkLCB7IGJhZGdlOiBuZXcgUHJvZ3Jlc3NCYWRnZSgoKSA9PiAnJykgfSk7XG5cdFx0XHRjb25zdCBzdGFydFRpbWVWaXNpYmxlID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IG1pblRpbWVWaXNpYmxlID0gMzAwO1xuXHRcdFx0YWN0aXZpdHlQcm9ncmVzcyA9IHtcblx0XHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0XHRjb25zdCBkID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZVZpc2libGU7XG5cdFx0XHRcdFx0aWYgKGQgPCBtaW5UaW1lVmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0Ly8gc2hvdWxkIGF0IGxlYXN0IHNob3cgZm9yIE5tc1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBoYW5kbGUuZGlzcG9zZSgpLCBtaW5UaW1lVmlzaWJsZSAtIGQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBzaG93biBsb25nIGVub3VnaFxuXHRcdFx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSwgb3B0aW9ucy5kZWxheSB8fCAzMDApO1xuXHRcdHByb21pc2UuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQoZGVsYXlIYW5kbGUpO1xuXHRcdFx0ZGlzcG9zZShhY3Rpdml0eVByb2dyZXNzKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgd2l0aENvbXBvc2l0ZVByb2dyZXNzPFAgZXh0ZW5kcyBQcm9taXNlPFI+LCBSID0gdW5rbm93bj4ocHJvZ3Jlc3NJbmRpY2F0b3I6IElQcm9ncmVzc0luZGljYXRvciwgdGFzazogKHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4pID0+IFAsIG9wdGlvbnM6IElQcm9ncmVzc0NvbXBvc2l0ZU9wdGlvbnMpOiBQIHtcblx0XHRsZXQgZGlzY3JldGVQcm9ncmVzc1J1bm5lcjogSVByb2dyZXNzUnVubmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0ZnVuY3Rpb24gdXBkYXRlUHJvZ3Jlc3Moc3RlcE9yVG90YWw6IElQcm9ncmVzc1N0ZXAgfCBudW1iZXIgfCB1bmRlZmluZWQpOiBJUHJvZ3Jlc3NSdW5uZXIgfCB1bmRlZmluZWQge1xuXG5cdFx0XHQvLyBGaWd1cmUgb3V0IHdoZXRoZXIgZGlzY3JldGUgcHJvZ3Jlc3MgYXBwbGllc1xuXHRcdFx0Ly8gYnkgZmlndXJpbmcgb3V0IHRoZSBcInRvdGFsXCIgcHJvZ3Jlc3MgdG8gc2hvd1xuXHRcdFx0Ly8gYW5kIHRoZSBpbmNyZW1lbnQgaWYgYW55LlxuXHRcdFx0bGV0IHRvdGFsOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgaW5jcmVtZW50OiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodHlwZW9mIHN0ZXBPclRvdGFsICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRpZiAodHlwZW9mIHN0ZXBPclRvdGFsID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHRvdGFsID0gc3RlcE9yVG90YWw7XG5cdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHN0ZXBPclRvdGFsLmluY3JlbWVudCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHR0b3RhbCA9IHN0ZXBPclRvdGFsLnRvdGFsID8/IDEwMDsgLy8gYWx3YXlzIHBlcmNlbnRhZ2UgYmFzZWRcblx0XHRcdFx0XHRpbmNyZW1lbnQgPSBzdGVwT3JUb3RhbC5pbmNyZW1lbnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gRGlzY3JldGVcblx0XHRcdGlmICh0eXBlb2YgdG90YWwgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGlmICghZGlzY3JldGVQcm9ncmVzc1J1bm5lcikge1xuXHRcdFx0XHRcdGRpc2NyZXRlUHJvZ3Jlc3NSdW5uZXIgPSBwcm9ncmVzc0luZGljYXRvci5zaG93KHRvdGFsLCBvcHRpb25zLmRlbGF5KTtcblx0XHRcdFx0XHRwcm9taXNlLmNhdGNoKCgpID0+IHVuZGVmaW5lZCAvKiBpZ25vcmUgKi8pLmZpbmFsbHkoKCkgPT4gZGlzY3JldGVQcm9ncmVzc1J1bm5lcj8uZG9uZSgpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0eXBlb2YgaW5jcmVtZW50ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGRpc2NyZXRlUHJvZ3Jlc3NSdW5uZXIud29ya2VkKGluY3JlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5maW5pdGVcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRkaXNjcmV0ZVByb2dyZXNzUnVubmVyPy5kb25lKCk7XG5cdFx0XHRcdHByb2dyZXNzSW5kaWNhdG9yLnNob3dXaGlsZShwcm9taXNlLCBvcHRpb25zLmRlbGF5KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGRpc2NyZXRlUHJvZ3Jlc3NSdW5uZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IHRhc2soe1xuXHRcdFx0cmVwb3J0OiBwcm9ncmVzcyA9PiB7XG5cdFx0XHRcdHVwZGF0ZVByb2dyZXNzKHByb2dyZXNzKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHVwZGF0ZVByb2dyZXNzKG9wdGlvbnMudG90YWwpO1xuXG5cdFx0cmV0dXJuIHByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIHdpdGhEaWFsb2dQcm9ncmVzczxQIGV4dGVuZHMgUHJvbWlzZTxSPiwgUiA9IHVua25vd24+KG9wdGlvbnM6IElQcm9ncmVzc0RpYWxvZ09wdGlvbnMsIHRhc2s6IChwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+KSA9PiBQLCBvbkRpZENhbmNlbD86IChjaG9pY2U/OiBudW1iZXIpID0+IHZvaWQpOiBQIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGxldCBkaWFsb2c6IERpYWxvZztcblx0XHRsZXQgdGFza0NvbXBsZXRlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgY3JlYXRlRGlhbG9nID0gKG1lc3NhZ2U6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9ucyA9IG9wdGlvbnMuYnV0dG9ucyB8fCBbXTtcblx0XHRcdGlmICghb3B0aW9ucy5zdGlja3kpIHtcblx0XHRcdFx0YnV0dG9ucy5wdXNoKG9wdGlvbnMuY2FuY2VsbGFibGVcblx0XHRcdFx0XHQ/ICh0eXBlb2Ygb3B0aW9ucy5jYW5jZWxsYWJsZSA9PT0gJ2Jvb2xlYW4nID8gbG9jYWxpemUoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpIDogb3B0aW9ucy5jYW5jZWxsYWJsZSlcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdkaXNtaXNzJywgXCJEaXNtaXNzXCIpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cblx0XHRcdGRpYWxvZyA9IG5ldyBEaWFsb2coXG5cdFx0XHRcdHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXIsXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdGJ1dHRvbnMsXG5cdFx0XHRcdGNyZWF0ZVdvcmtiZW5jaERpYWxvZ09wdGlvbnMoe1xuXHRcdFx0XHRcdHR5cGU6ICdwZW5kaW5nJyxcblx0XHRcdFx0XHRkZXRhaWw6IG9wdGlvbnMuZGV0YWlsLFxuXHRcdFx0XHRcdGNhbmNlbElkOiBidXR0b25zLmxlbmd0aCAtIDEsXG5cdFx0XHRcdFx0ZGlzYWJsZUNsb3NlQWN0aW9uOiBvcHRpb25zLnN0aWNreSxcblx0XHRcdFx0XHRkaXNhYmxlRGVmYXVsdEFjdGlvbjogb3B0aW9ucy5zdGlja3lcblx0XHRcdFx0fSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgdGhpcy5sYXlvdXRTZXJ2aWNlLCB0aGlzLmhvc3RTZXJ2aWNlKVxuXHRcdFx0KTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRpYWxvZyk7XG5cblx0XHRcdGRpYWxvZy5zaG93KCkudGhlbihkaWFsb2dSZXN1bHQgPT4ge1xuXHRcdFx0XHQvLyBUaGUgZGlhbG9nIG1heSBjbG9zZSBhcyBhIHJlc3VsdCBvZiBkaXNwb3NpbmcgaXQgYWZ0ZXIgdGhlXG5cdFx0XHRcdC8vIHRhc2sgaGFzIGNvbXBsZXRlZC4gSW4gdGhhdCBjYXNlLCB3ZSBkbyBub3Qgd2FudCB0byB0cmlnZ2VyXG5cdFx0XHRcdC8vIHRoZSBgb25EaWRDYW5jZWxgIGNhbGxiYWNrLlxuXHRcdFx0XHQvLyBIb3dldmVyLCBpZiB0aGUgdGFzayBpcyBzdGlsbCBydW5uaW5nLCB0aGlzIG1lYW5zIHRoYXQgdGhlXG5cdFx0XHRcdC8vIHVzZXIgaGFzIGNsaWNrZWQgdGhlIGNhbmNlbCBidXR0b24gYW5kIHdlIHdhbnQgdG8gdHJpZ2dlclxuXHRcdFx0XHQvLyB0aGUgYG9uRGlkQ2FuY2VsYCBjYWxsYmFjay5cblx0XHRcdFx0aWYgKCF0YXNrQ29tcGxldGVkKSB7XG5cdFx0XHRcdFx0b25EaWRDYW5jZWw/LihkaWFsb2dSZXN1bHQuYnV0dG9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkaXNwb3NlKGRpYWxvZyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIGRpYWxvZztcblx0XHR9O1xuXG5cdFx0Ly8gSW4gb3JkZXIgdG8gc3VwcG9ydCB0aGUgYGRlbGF5YCBvcHRpb24sIHdlIHVzZSBhIHNjaGVkdWxlclxuXHRcdC8vIHRoYXQgd2lsbCBndWFyZCBlYWNoIGFjY2VzcyB0byB0aGUgZGlhbG9nIGJlaGluZCBhIGRlbGF5XG5cdFx0Ly8gdGhhdCBpcyBlaXRoZXIgdGhlIG9yaWdpbmFsIGRlbGF5IGZvciBvbmUgaW52b2NhdGlvbiBhbmRcblx0XHQvLyBvdGhlcndpc2UgcnVucyB3aXRob3V0IGRlbGF5LlxuXHRcdGxldCBkZWxheSA9IG9wdGlvbnMuZGVsYXkgPz8gMDtcblx0XHRsZXQgbGF0ZXN0TWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNjaGVkdWxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRkZWxheSA9IDA7IC8vIHNpbmNlIHdlIGhhdmUgcnVuIG9uY2UsIHdlIHJlc2V0IHRoZSBkZWxheVxuXG5cdFx0XHRpZiAobGF0ZXN0TWVzc2FnZSAmJiAhZGlhbG9nKSB7XG5cdFx0XHRcdGRpYWxvZyA9IGNyZWF0ZURpYWxvZyhsYXRlc3RNZXNzYWdlKTtcblx0XHRcdH0gZWxzZSBpZiAobGF0ZXN0TWVzc2FnZSkge1xuXHRcdFx0XHRkaWFsb2cudXBkYXRlTWVzc2FnZShsYXRlc3RNZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9LCAwKSk7XG5cblx0XHRjb25zdCB1cGRhdGVEaWFsb2cgPSBmdW5jdGlvbiAobWVzc2FnZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0bGF0ZXN0TWVzc2FnZSA9IG1lc3NhZ2U7XG5cblx0XHRcdC8vIE1ha2Ugc3VyZSB0byBvbmx5IHJ1biBvbmUgZGlhbG9nIHVwZGF0ZSBhbmQgbm90IG11bHRpcGxlXG5cdFx0XHRpZiAoIXNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZShkZWxheSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb21pc2UgPSB0YXNrKHtcblx0XHRcdHJlcG9ydDogcHJvZ3Jlc3MgPT4ge1xuXHRcdFx0XHR1cGRhdGVEaWFsb2cocHJvZ3Jlc3MubWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRwcm9taXNlLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0dGFza0NvbXBsZXRlZCA9IHRydWU7XG5cdFx0XHRkaXNwb3NlKGRpc3Bvc2FibGVzKTtcblx0XHR9KTtcblxuXHRcdGlmIChvcHRpb25zLnRpdGxlKSB7XG5cdFx0XHR1cGRhdGVEaWFsb2cob3B0aW9ucy50aXRsZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb21pc2U7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5E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UUFBUSxnQkFBZ0IsWUFBWSxTQUFTLFVBQVUsUUFBUSxJQUFJLFFBQVEsY0FDbkYsU0FBUyxXQUFXLFNBQVM7QUFBQSxRQUNoQztBQUFBLE1BQ0Q7QUFFQSxlQUFTLElBQUk7QUFBQSxRQUNaLEtBQUssY0FBYztBQUFBLFFBQ25CO0FBQUEsUUFDQTtBQUFBLFFBQ0EsNkJBQTZCO0FBQUEsVUFDNUIsTUFBTTtBQUFBLFVBQ04sUUFBUSxRQUFRO0FBQUEsVUFDaEIsVUFBVSxRQUFRLFNBQVM7QUFBQSxVQUMzQixvQkFBb0IsUUFBUTtBQUFBLFVBQzVCLHNCQUFzQixRQUFRO0FBQUEsUUFDL0IsR0FBRyxLQUFLLG1CQUFtQixLQUFLLGVBQWUsS0FBSyxXQUFXO0FBQUEsTUFDaEU7QUFFQSxrQkFBWSxJQUFJLE1BQU07QUFFdEIsYUFBTyxLQUFLLEVBQUUsS0FBSyxrQkFBZ0I7QUFPbEMsWUFBSSxDQUFDLGVBQWU7QUFDbkIsd0JBQWMsYUFBYSxNQUFNO0FBQUEsUUFDbEM7QUFDQSxnQkFBUSxNQUFNO0FBQUEsTUFDZixDQUFDO0FBRUQsYUFBTztBQUFBLElBQ1I7QUFNQSxRQUFJLFFBQVEsUUFBUSxTQUFTO0FBQzdCLFFBQUksZ0JBQW9DO0FBQ3hDLFVBQU0sWUFBWSxZQUFZLElBQUksSUFBSSxpQkFBaUIsTUFBTTtBQUM1RCxjQUFRO0FBRVIsVUFBSSxpQkFBaUIsQ0FBQyxRQUFRO0FBQzdCLGlCQUFTLGFBQWEsYUFBYTtBQUFBLE1BQ3BDLFdBQVcsZUFBZTtBQUN6QixlQUFPLGNBQWMsYUFBYTtBQUFBLE1BQ25DO0FBQUEsSUFDRCxHQUFHLENBQUMsQ0FBQztBQUVMLFVBQU0sZUFBZSxTQUFVLFNBQXdCO0FBQ3RELHNCQUFnQjtBQUdoQixVQUFJLENBQUMsVUFBVSxZQUFZLEdBQUc7QUFDN0Isa0JBQVUsU0FBUyxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFVLEtBQUs7QUFBQSxNQUNwQixRQUFRLGNBQVk7QUFDbkIscUJBQWEsU0FBUyxPQUFPO0FBQUEsTUFDOUI7QUFBQSxJQUNELENBQUM7QUFFRCxZQUFRLFFBQVEsTUFBTTtBQUNyQixzQkFBZ0I7QUFDaEIsY0FBUSxXQUFXO0FBQUEsSUFDcEIsQ0FBQztBQUVELFFBQUksUUFBUSxPQUFPO0FBQ2xCLG1CQUFhLFFBQVEsS0FBSztBQUFBLElBQzNCO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQWhtQmEsa0JBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FkVTtBQWttQmIsa0JBQWtCLGtCQUFrQixpQkFBaUIsa0JBQWtCLE9BQU87IiwKICAibmFtZXMiOiBbImxvY2F0aW9uIl0KfQo=
