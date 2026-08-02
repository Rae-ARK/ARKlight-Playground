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
import { distinct } from "../../../../base/common/arrays.js";
import { createCancelablePromise, Promises, raceCancellablePromises, raceCancellation, timeout } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { isString } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { RecommendationsNotificationResult, RecommendationSource, RecommendationSourceToString } from "../../../../platform/extensionRecommendations/common/extensionRecommendations.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IUserDataSyncEnablementService, SyncResource } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IExtensionsWorkbenchService } from "../common/extensions.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { EnablementState, IWorkbenchExtensionManagementService, IWorkbenchExtensionEnablementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IExtensionIgnoredRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
const ignoreImportantExtensionRecommendationStorageKey = "extensionsAssistant/importantRecommendationsIgnore";
const donotShowWorkspaceRecommendationsStorageKey = "extensionsAssistant/workspaceRecommendationsIgnore";
class RecommendationsNotification extends Disposable {
  constructor(severity, message, choices, notificationService) {
    super();
    this.severity = severity;
    this.message = message;
    this.choices = choices;
    this.notificationService = notificationService;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this.cancelled = false;
    this.onDidCloseDisposable = this._register(new MutableDisposable());
    this.onDidChangeVisibilityDisposable = this._register(new MutableDisposable());
  }
  show() {
    if (!this.notificationHandle) {
      this.updateNotificationHandle(this.notificationService.prompt(this.severity, this.message, this.choices, { sticky: true, priority: NotificationPriority.OPTIONAL, onCancel: () => this.cancelled = true }));
    }
  }
  hide() {
    if (this.notificationHandle) {
      this.onDidCloseDisposable.clear();
      this.notificationHandle.close();
      this.cancelled = false;
      this.updateNotificationHandle(this.notificationService.prompt(this.severity, this.message, this.choices, { priority: NotificationPriority.SILENT, onCancel: () => this.cancelled = true }));
    }
  }
  isCancelled() {
    return this.cancelled;
  }
  updateNotificationHandle(notificationHandle) {
    this.onDidCloseDisposable.clear();
    this.onDidChangeVisibilityDisposable.clear();
    this.notificationHandle = notificationHandle;
    this.onDidCloseDisposable.value = this.notificationHandle.onDidClose(() => {
      this.onDidCloseDisposable.dispose();
      this.onDidChangeVisibilityDisposable.dispose();
      this._onDidClose.fire();
      this._onDidClose.dispose();
      this._onDidChangeVisibility.dispose();
    });
    this.onDidChangeVisibilityDisposable.value = this.notificationHandle.onDidChangeVisibility((e) => this._onDidChangeVisibility.fire(e));
  }
}
let ExtensionRecommendationNotificationService = class extends Disposable {
  constructor(configurationService, storageService, notificationService, telemetryService, extensionsWorkbenchService, extensionManagementService, extensionEnablementService, extensionIgnoredRecommendationsService, userDataSyncEnablementService, workbenchEnvironmentService, uriIdentityService) {
    super();
    this.configurationService = configurationService;
    this.storageService = storageService;
    this.notificationService = notificationService;
    this.telemetryService = telemetryService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionManagementService = extensionManagementService;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionIgnoredRecommendationsService = extensionIgnoredRecommendationsService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.workbenchEnvironmentService = workbenchEnvironmentService;
    this.uriIdentityService = uriIdentityService;
    this.recommendedExtensions = [];
    this.recommendationSources = [];
    this.pendingNotificaitons = [];
  }
  // Ignored Important Recommendations
  get ignoredRecommendations() {
    return distinct([...JSON.parse(this.storageService.get(ignoreImportantExtensionRecommendationStorageKey, StorageScope.PROFILE, "[]"))].map((i) => i.toLowerCase()));
  }
  hasToIgnoreRecommendationNotifications() {
    const config = this.configurationService.getValue("extensions");
    return config.ignoreRecommendations || !!config.showRecommendationsOnlyOnDemand;
  }
  async promptImportantExtensionsInstallNotification(extensionRecommendations) {
    const ignoredRecommendations = [...this.extensionIgnoredRecommendationsService.ignoredRecommendations, ...this.ignoredRecommendations];
    const extensions = extensionRecommendations.extensions.filter((id) => !ignoredRecommendations.includes(id));
    if (!extensions.length) {
      return RecommendationsNotificationResult.Ignored;
    }
    return this.promptRecommendationsNotification({ ...extensionRecommendations, extensions }, {
      onDidInstallRecommendedExtensions: (extensions2) => extensions2.forEach((extension) => this.telemetryService.publicLog2("extensionRecommendations:popup", { userReaction: "install", extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) })),
      onDidShowRecommendedExtensions: (extensions2) => extensions2.forEach((extension) => this.telemetryService.publicLog2("extensionRecommendations:popup", { userReaction: "show", extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) })),
      onDidCancelRecommendedExtensions: (extensions2) => extensions2.forEach((extension) => this.telemetryService.publicLog2("extensionRecommendations:popup", { userReaction: "cancelled", extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) })),
      onDidNeverShowRecommendedExtensionsAgain: (extensions2) => {
        for (const extension of extensions2) {
          this.addToImportantRecommendationsIgnore(extension.identifier.id);
          this.telemetryService.publicLog2("extensionRecommendations:popup", { userReaction: "neverShowAgain", extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) });
        }
        this.notificationService.prompt(
          Severity.Info,
          localize("ignoreExtensionRecommendations", "Do you want to ignore all extension recommendations?"),
          [{
            label: localize("ignoreAll", "Yes, Ignore All"),
            run: () => this.setIgnoreRecommendationsConfig(true)
          }, {
            label: localize("no", "No"),
            run: () => this.setIgnoreRecommendationsConfig(false)
          }]
        );
      }
    });
  }
  async promptWorkspaceRecommendations(recommendations) {
    if (this.storageService.getBoolean(donotShowWorkspaceRecommendationsStorageKey, StorageScope.WORKSPACE, false)) {
      return;
    }
    let installed = await this.extensionManagementService.getInstalled();
    installed = installed.filter((l) => this.extensionEnablementService.getEnablementState(l) !== EnablementState.DisabledByExtensionKind);
    recommendations = recommendations.filter((recommendation) => installed.every(
      (local) => isString(recommendation) ? !areSameExtensions({ id: recommendation }, local.identifier) : !this.uriIdentityService.extUri.isEqual(recommendation, local.location)
    ));
    if (!recommendations.length) {
      return;
    }
    await this.promptRecommendationsNotification({ extensions: recommendations, source: RecommendationSource.WORKSPACE, name: localize({ key: "this repository", comment: ["this repository means the current repository that is opened"] }, "this repository") }, {
      onDidInstallRecommendedExtensions: () => this.telemetryService.publicLog2("extensionWorkspaceRecommendations:popup", { userReaction: "install" }),
      onDidShowRecommendedExtensions: () => this.telemetryService.publicLog2("extensionWorkspaceRecommendations:popup", { userReaction: "show" }),
      onDidCancelRecommendedExtensions: () => this.telemetryService.publicLog2("extensionWorkspaceRecommendations:popup", { userReaction: "cancelled" }),
      onDidNeverShowRecommendedExtensionsAgain: () => {
        this.telemetryService.publicLog2("extensionWorkspaceRecommendations:popup", { userReaction: "neverShowAgain" });
        this.storageService.store(donotShowWorkspaceRecommendationsStorageKey, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
      }
    });
  }
  async promptRecommendationsNotification({ extensions: extensionIds, source, name, searchValue }, recommendationsNotificationActions) {
    if (this.hasToIgnoreRecommendationNotifications()) {
      return RecommendationsNotificationResult.Ignored;
    }
    if (source === RecommendationSource.EXE && this.workbenchEnvironmentService.remoteAuthority) {
      return RecommendationsNotificationResult.IncompatibleWindow;
    }
    if (source === RecommendationSource.EXE && (this.recommendationSources.includes(RecommendationSource.EXE) || this.recommendationSources.length >= 2)) {
      return RecommendationsNotificationResult.TooMany;
    }
    this.recommendationSources.push(source);
    if (source === RecommendationSource.EXE && extensionIds.every((id) => isString(id) && this.recommendedExtensions.includes(id))) {
      return RecommendationsNotificationResult.Ignored;
    }
    const extensions = await this.getInstallableExtensions(extensionIds);
    if (!extensions.length) {
      return RecommendationsNotificationResult.Ignored;
    }
    this.recommendedExtensions = distinct([...this.recommendedExtensions, ...extensionIds.filter(isString)]);
    let extensionsMessage = "";
    if (extensions.length === 1) {
      extensionsMessage = localize("extensionFromPublisher", "'{0}' extension from {1}", extensions[0].displayName, extensions[0].publisherDisplayName);
    } else {
      const publishers = [...extensions.reduce((result, extension) => result.add(extension.publisherDisplayName), /* @__PURE__ */ new Set())];
      if (publishers.length > 2) {
        extensionsMessage = localize("extensionsFromMultiplePublishers", "extensions from {0}, {1} and others", publishers[0], publishers[1]);
      } else if (publishers.length === 2) {
        extensionsMessage = localize("extensionsFromPublishers", "extensions from {0} and {1}", publishers[0], publishers[1]);
      } else {
        extensionsMessage = localize("extensionsFromPublisher", "extensions from {0}", publishers[0]);
      }
    }
    let message = localize("recommended", "Do you want to install the recommended {0} for {1}?", extensionsMessage, name);
    if (source === RecommendationSource.EXE) {
      message = localize({ key: "exeRecommended", comment: ["Placeholder string is the name of the software that is installed."] }, "You have {0} installed on your system. Do you want to install the recommended {1} for it?", name, extensionsMessage);
    }
    if (!searchValue) {
      searchValue = source === RecommendationSource.WORKSPACE ? "@recommended" : extensions.map((extensionId) => `@id:${extensionId.identifier.id}`).join(" ");
    }
    const donotShowAgainLabel = source === RecommendationSource.WORKSPACE ? localize("donotShowAgain", "Don't Show Again for this Repository") : extensions.length > 1 ? localize("donotShowAgainExtension", "Don't Show Again for these Extensions") : localize("donotShowAgainExtensionSingle", "Don't Show Again for this Extension");
    return raceCancellablePromises([
      this._registerP(this.showRecommendationsNotification(extensions, message, searchValue, donotShowAgainLabel, source, recommendationsNotificationActions)),
      this._registerP(this.waitUntilRecommendationsAreInstalled(extensions))
    ]);
  }
  showRecommendationsNotification(extensions, message, searchValue, donotShowAgainLabel, source, { onDidInstallRecommendedExtensions, onDidShowRecommendedExtensions, onDidCancelRecommendedExtensions, onDidNeverShowRecommendedExtensionsAgain }) {
    return createCancelablePromise(async (token) => {
      let accepted = false;
      const choices = [];
      const installExtensions = async (isMachineScoped) => {
        this.extensionsWorkbenchService.openSearch(searchValue);
        onDidInstallRecommendedExtensions(extensions);
        const galleryExtensions = [], resourceExtensions = [];
        for (const extension of extensions) {
          if (extension.gallery) {
            galleryExtensions.push(extension.gallery);
          } else if (extension.resourceExtension) {
            resourceExtensions.push(extension);
          }
        }
        await Promises.settled([
          Promises.settled(extensions.map((extension) => this.extensionsWorkbenchService.open(extension, { pinned: true }))),
          galleryExtensions.length ? this.extensionManagementService.installGalleryExtensions(galleryExtensions.map((e) => ({ extension: e, options: { isMachineScoped } }))) : Promise.resolve(),
          resourceExtensions.length ? Promise.allSettled(resourceExtensions.map((r) => this.extensionsWorkbenchService.install(r))) : Promise.resolve()
        ]);
      };
      choices.push({
        label: localize("install", "Install"),
        run: () => installExtensions(false),
        menu: this.userDataSyncEnablementService.isEnabled() && this.userDataSyncEnablementService.isResourceEnabled(SyncResource.Extensions) ? [{
          label: localize("install and do no sync", "Install (Do not sync)"),
          run: () => installExtensions(true)
        }] : void 0
      });
      choices.push(...[{
        label: localize("show recommendations", "Show Recommendations"),
        run: async () => {
          onDidShowRecommendedExtensions(extensions);
          for (const extension of extensions) {
            this.extensionsWorkbenchService.open(extension, { pinned: true });
          }
          this.extensionsWorkbenchService.openSearch(searchValue);
        }
      }, {
        label: donotShowAgainLabel,
        isSecondary: true,
        run: () => {
          onDidNeverShowRecommendedExtensionsAgain(extensions);
        }
      }]);
      try {
        accepted = await this.doShowRecommendationsNotification(Severity.Info, message, choices, source, token);
      } catch (error) {
        if (!isCancellationError(error)) {
          throw error;
        }
      }
      if (accepted) {
        return RecommendationsNotificationResult.Accepted;
      } else {
        onDidCancelRecommendedExtensions(extensions);
        return RecommendationsNotificationResult.Cancelled;
      }
    });
  }
  waitUntilRecommendationsAreInstalled(extensions) {
    const installedExtensions = [];
    const disposables = new DisposableStore();
    return createCancelablePromise(async (token) => {
      disposables.add(token.onCancellationRequested((e) => disposables.dispose()));
      return new Promise((c, e) => {
        disposables.add(this.extensionManagementService.onInstallExtension((e2) => {
          installedExtensions.push(e2.identifier.id.toLowerCase());
          if (extensions.every((e3) => installedExtensions.includes(e3.identifier.id.toLowerCase()))) {
            c(RecommendationsNotificationResult.Accepted);
          }
        }));
      });
    });
  }
  /**
   * Show recommendations in Queue
   * At any time only one recommendation is shown
   * If a new recommendation comes in
   * 		=> If no recommendation is visible, show it immediately
   *		=> Otherwise, add to the pending queue
   * 			=> If it is not exe based and has higher or same priority as current, hide the current notification after showing it for 3s.
   * 			=> Otherwise wait until the current notification is hidden.
   */
  async doShowRecommendationsNotification(severity, message, choices, source, token) {
    const disposables = new DisposableStore();
    try {
      const recommendationsNotification = disposables.add(new RecommendationsNotification(severity, message, choices, this.notificationService));
      disposables.add(Event.once(Event.filter(recommendationsNotification.onDidChangeVisibility, (e) => !e))(() => this.showNextNotification()));
      if (this.visibleNotification) {
        const index = this.pendingNotificaitons.length;
        disposables.add(token.onCancellationRequested(() => this.pendingNotificaitons.splice(index, 1)));
        this.pendingNotificaitons.push({ recommendationsNotification, source, token });
        if (source !== RecommendationSource.EXE && source <= this.visibleNotification.source) {
          this.hideVisibleNotification(3e3);
        }
      } else {
        this.visibleNotification = { recommendationsNotification, source, from: Date.now() };
        recommendationsNotification.show();
      }
      await raceCancellation(new Promise((c) => disposables.add(Event.once(recommendationsNotification.onDidClose)(c))), token);
      return !recommendationsNotification.isCancelled();
    } finally {
      disposables.dispose();
    }
  }
  showNextNotification() {
    const index = this.getNextPendingNotificationIndex();
    const [nextNotificaiton] = index > -1 ? this.pendingNotificaitons.splice(index, 1) : [];
    timeout(nextNotificaiton ? 500 : 0).then(() => {
      this.unsetVisibileNotification();
      if (nextNotificaiton) {
        this.visibleNotification = { recommendationsNotification: nextNotificaiton.recommendationsNotification, source: nextNotificaiton.source, from: Date.now() };
        nextNotificaiton.recommendationsNotification.show();
      }
    });
  }
  /**
   * Return the recent high priroity pending notification
   */
  getNextPendingNotificationIndex() {
    let index = this.pendingNotificaitons.length - 1;
    if (this.pendingNotificaitons.length) {
      for (let i = 0; i < this.pendingNotificaitons.length; i++) {
        if (this.pendingNotificaitons[i].source <= this.pendingNotificaitons[index].source) {
          index = i;
        }
      }
    }
    return index;
  }
  hideVisibleNotification(timeInMillis) {
    if (this.visibleNotification && !this.hideVisibleNotificationPromise) {
      const visibleNotification = this.visibleNotification;
      this.hideVisibleNotificationPromise = timeout(Math.max(timeInMillis - (Date.now() - visibleNotification.from), 0));
      this.hideVisibleNotificationPromise.then(() => visibleNotification.recommendationsNotification.hide());
    }
  }
  unsetVisibileNotification() {
    this.hideVisibleNotificationPromise?.cancel();
    this.hideVisibleNotificationPromise = void 0;
    this.visibleNotification = void 0;
  }
  async getInstallableExtensions(recommendations) {
    const result = [];
    if (recommendations.length) {
      const galleryExtensions = [];
      const resourceExtensions = [];
      for (const recommendation of recommendations) {
        if (typeof recommendation === "string") {
          galleryExtensions.push(recommendation);
        } else {
          resourceExtensions.push(recommendation);
        }
      }
      if (galleryExtensions.length) {
        const extensions = await this.extensionsWorkbenchService.getExtensions(galleryExtensions.map((id) => ({ id })), { source: "install-recommendations" }, CancellationToken.None);
        for (const extension of extensions) {
          if (extension.gallery && await this.extensionManagementService.canInstall(extension.gallery) === true) {
            result.push(extension);
          }
        }
      }
      if (resourceExtensions.length) {
        const extensions = await this.extensionsWorkbenchService.getResourceExtensions(resourceExtensions, true);
        for (const extension of extensions) {
          if (await this.extensionsWorkbenchService.canInstall(extension) === true) {
            result.push(extension);
          }
        }
      }
    }
    return result;
  }
  addToImportantRecommendationsIgnore(id) {
    const importantRecommendationsIgnoreList = [...this.ignoredRecommendations];
    if (!importantRecommendationsIgnoreList.includes(id.toLowerCase())) {
      importantRecommendationsIgnoreList.push(id.toLowerCase());
      this.storageService.store(ignoreImportantExtensionRecommendationStorageKey, JSON.stringify(importantRecommendationsIgnoreList), StorageScope.PROFILE, StorageTarget.USER);
    }
  }
  setIgnoreRecommendationsConfig(configVal) {
    this.configurationService.updateValue("extensions.ignoreRecommendations", configVal);
  }
  _registerP(o) {
    this._register(toDisposable(() => o.cancel()));
    return o;
  }
};
ExtensionRecommendationNotificationService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IExtensionsWorkbenchService),
  __decorateParam(5, IWorkbenchExtensionManagementService),
  __decorateParam(6, IWorkbenchExtensionEnablementService),
  __decorateParam(7, IExtensionIgnoredRecommendationsService),
  __decorateParam(8, IUserDataSyncEnablementService),
  __decorateParam(9, IWorkbenchEnvironmentService),
  __decorateParam(10, IUriIdentityService)
], ExtensionRecommendationNotificationService);
export {
  ExtensionRecommendationNotificationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIFByb21pc2VzLCByYWNlQ2FuY2VsbGFibGVQcm9taXNlcywgcmFjZUNhbmNlbGxhdGlvbiwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJR2FsbGVyeUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlLCBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLCBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQsIFJlY29tbWVuZGF0aW9uU291cmNlLCBSZWNvbW1lbmRhdGlvblNvdXJjZVRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvbkhhbmRsZSwgSU5vdGlmaWNhdGlvblNlcnZpY2UsIElQcm9tcHRDaG9pY2UsIElQcm9tcHRDaG9pY2VXaXRoTWVudSwgTm90aWZpY2F0aW9uUHJpb3JpdHksIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIFN5bmNSZXNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb24sIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVuYWJsZW1lbnRTdGF0ZSwgSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy9jb21tb24vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcblxudHlwZSBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdzYW5keTA4MSc7XG5cdGNvbW1lbnQ6ICdSZXNwb25zZSBpbmZvcm1hdGlvbiB3aGVuIGFuIGV4dGVuc2lvbiBpcyByZWNvbW1lbmRlZCc7XG5cdHVzZXJSZWFjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1VzZXIgcmVhY3Rpb24gYWZ0ZXIgc2hvd2luZyB0aGUgcmVjb21tZW5kYXRpb24gcHJvbXB0LiBFZy4sIGluc3RhbGwsIGNhbmNlbCwgc2hvdywgbmV2ZXJTaG93QWdhaW4nIH07XG5cdGV4dGVuc2lvbklkPzogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdJZCBvZiB0aGUgZXh0ZW5zaW9uIHRoYXQgaXMgcmVjb21tZW5kZWQnIH07XG5cdHNvdXJjZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBzb3VyY2UgZnJvbSB3aGljaCB0aGlzIHJlY29tbWVuZGF0aW9uIGlzIGNvbWluZyBmcm9tLiBFZy4sIGZpbGUsIGV4ZS4sJyB9O1xufTtcblxudHlwZSBFeHRlbnNpb25Xb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdzYW5keTA4MSc7XG5cdGNvbW1lbnQ6ICdSZXNwb25zZSBpbmZvcm1hdGlvbiB3aGVuIGEgcmVjb21tZW5kYXRpb24gZnJvbSB3b3Jrc3BhY2UgaXMgcmVjb21tZW5kZWQnO1xuXHR1c2VyUmVhY3Rpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdVc2VyIHJlYWN0aW9uIGFmdGVyIHNob3dpbmcgdGhlIHJlY29tbWVuZGF0aW9uIHByb21wdC4gRWcuLCBpbnN0YWxsLCBjYW5jZWwsIHNob3csIG5ldmVyU2hvd0FnYWluJyB9O1xufTtcblxuY29uc3QgaWdub3JlSW1wb3J0YW50RXh0ZW5zaW9uUmVjb21tZW5kYXRpb25TdG9yYWdlS2V5ID0gJ2V4dGVuc2lvbnNBc3Npc3RhbnQvaW1wb3J0YW50UmVjb21tZW5kYXRpb25zSWdub3JlJztcbmNvbnN0IGRvbm90U2hvd1dvcmtzcGFjZVJlY29tbWVuZGF0aW9uc1N0b3JhZ2VLZXkgPSAnZXh0ZW5zaW9uc0Fzc2lzdGFudC93b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnNJZ25vcmUnO1xuXG50eXBlIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbkFjdGlvbnMgPSB7XG5cdG9uRGlkSW5zdGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pOiB2b2lkO1xuXHRvbkRpZFNob3dSZWNvbW1lbmRlZEV4dGVuc2lvbnMoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKTogdm9pZDtcblx0b25EaWRDYW5jZWxSZWNvbW1lbmRlZEV4dGVuc2lvbnMoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKTogdm9pZDtcblx0b25EaWROZXZlclNob3dSZWNvbW1lbmRlZEV4dGVuc2lvbnNBZ2FpbihleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pOiB2b2lkO1xufTtcblxudHlwZSBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMgPSBPbWl0PElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMsICdleHRlbnNpb25zJz4gJiB7IGV4dGVuc2lvbnM6IEFycmF5PHN0cmluZyB8IFVSST4gfTtcblxuY2xhc3MgUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfb25EaWRDbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlID0gdGhpcy5fb25EaWRDbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgbm90aWZpY2F0aW9uSGFuZGxlOiBJTm90aWZpY2F0aW9uSGFuZGxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNhbmNlbGxlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2V2ZXJpdHk6IFNldmVyaXR5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWVzc2FnZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2hvaWNlczogSVByb21wdENob2ljZVtdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHNob3coKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm5vdGlmaWNhdGlvbkhhbmRsZSkge1xuXHRcdFx0dGhpcy51cGRhdGVOb3RpZmljYXRpb25IYW5kbGUodGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdCh0aGlzLnNldmVyaXR5LCB0aGlzLm1lc3NhZ2UsIHRoaXMuY2hvaWNlcywgeyBzdGlja3k6IHRydWUsIHByaW9yaXR5OiBOb3RpZmljYXRpb25Qcmlvcml0eS5PUFRJT05BTCwgb25DYW5jZWw6ICgpID0+IHRoaXMuY2FuY2VsbGVkID0gdHJ1ZSB9KSk7XG5cdFx0fVxuXHR9XG5cblx0aGlkZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5ub3RpZmljYXRpb25IYW5kbGUpIHtcblx0XHRcdHRoaXMub25EaWRDbG9zZURpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uSGFuZGxlLmNsb3NlKCk7XG5cdFx0XHR0aGlzLmNhbmNlbGxlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy51cGRhdGVOb3RpZmljYXRpb25IYW5kbGUodGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdCh0aGlzLnNldmVyaXR5LCB0aGlzLm1lc3NhZ2UsIHRoaXMuY2hvaWNlcywgeyBwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuU0lMRU5ULCBvbkNhbmNlbDogKCkgPT4gdGhpcy5jYW5jZWxsZWQgPSB0cnVlIH0pKTtcblx0XHR9XG5cdH1cblxuXHRpc0NhbmNlbGxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jYW5jZWxsZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2xvc2VEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgdXBkYXRlTm90aWZpY2F0aW9uSGFuZGxlKG5vdGlmaWNhdGlvbkhhbmRsZTogSU5vdGlmaWNhdGlvbkhhbmRsZSkge1xuXHRcdHRoaXMub25EaWRDbG9zZURpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eURpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR0aGlzLm5vdGlmaWNhdGlvbkhhbmRsZSA9IG5vdGlmaWNhdGlvbkhhbmRsZTtcblxuXHRcdHRoaXMub25EaWRDbG9zZURpc3Bvc2FibGUudmFsdWUgPSB0aGlzLm5vdGlmaWNhdGlvbkhhbmRsZS5vbkRpZENsb3NlKCgpID0+IHtcblx0XHRcdHRoaXMub25EaWRDbG9zZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZVZpc2liaWxpdHlEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblxuXHRcdFx0dGhpcy5fb25EaWRDbG9zZS5maXJlKCk7XG5cblx0XHRcdHRoaXMuX29uRGlkQ2xvc2UuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eURpc3Bvc2FibGUudmFsdWUgPSB0aGlzLm5vdGlmaWNhdGlvbkhhbmRsZS5vbkRpZENoYW5nZVZpc2liaWxpdHkoKGUpID0+IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKGUpKTtcblx0fVxufVxuXG50eXBlIFBlbmRpbmdSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb24gPSB7IHJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbjogUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uOyBzb3VyY2U6IFJlY29tbWVuZGF0aW9uU291cmNlOyB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gfTtcbnR5cGUgVmlzaWJsZVJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbiA9IHsgcmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uOiBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb247IHNvdXJjZTogUmVjb21tZW5kYXRpb25Tb3VyY2U7IGZyb206IG51bWJlciB9O1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8vIElnbm9yZWQgSW1wb3J0YW50IFJlY29tbWVuZGF0aW9uc1xuXHRnZXQgaWdub3JlZFJlY29tbWVuZGF0aW9ucygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIGRpc3RpbmN0KFsuLi4oPHN0cmluZ1tdPkpTT04ucGFyc2UodGhpcy5zdG9yYWdlU2VydmljZS5nZXQoaWdub3JlSW1wb3J0YW50RXh0ZW5zaW9uUmVjb21tZW5kYXRpb25TdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ1tdJykpKV0ubWFwKGkgPT4gaS50b0xvd2VyQ2FzZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlY29tbWVuZGVkRXh0ZW5zaW9uczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSByZWNvbW1lbmRhdGlvblNvdXJjZXM6IFJlY29tbWVuZGF0aW9uU291cmNlW10gPSBbXTtcblxuXHRwcml2YXRlIGhpZGVWaXNpYmxlTm90aWZpY2F0aW9uUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdmlzaWJsZU5vdGlmaWNhdGlvbjogVmlzaWJsZVJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwZW5kaW5nTm90aWZpY2FpdG9uczogUGVuZGluZ1JlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbltdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlOiBJRXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRoYXNUb0lnbm9yZVJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9ucygpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgaWdub3JlUmVjb21tZW5kYXRpb25zOiBib29sZWFuOyBzaG93UmVjb21tZW5kYXRpb25zT25seU9uRGVtYW5kPzogYm9vbGVhbiB9PignZXh0ZW5zaW9ucycpO1xuXHRcdHJldHVybiBjb25maWcuaWdub3JlUmVjb21tZW5kYXRpb25zIHx8ICEhY29uZmlnLnNob3dSZWNvbW1lbmRhdGlvbnNPbmx5T25EZW1hbmQ7XG5cdH1cblxuXHRhc3luYyBwcm9tcHRJbXBvcnRhbnRFeHRlbnNpb25zSW5zdGFsbE5vdGlmaWNhdGlvbihleHRlbnNpb25SZWNvbW1lbmRhdGlvbnM6IElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMpOiBQcm9taXNlPFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdD4ge1xuXHRcdGNvbnN0IGlnbm9yZWRSZWNvbW1lbmRhdGlvbnMgPSBbLi4udGhpcy5leHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZS5pZ25vcmVkUmVjb21tZW5kYXRpb25zLCAuLi50aGlzLmlnbm9yZWRSZWNvbW1lbmRhdGlvbnNdO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBleHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuZXh0ZW5zaW9ucy5maWx0ZXIoaWQgPT4gIWlnbm9yZWRSZWNvbW1lbmRhdGlvbnMuaW5jbHVkZXMoaWQpKTtcblx0XHRpZiAoIWV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0Lklnbm9yZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucHJvbXB0UmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uKHsgLi4uZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLCBleHRlbnNpb25zIH0sIHtcblx0XHRcdG9uRGlkSW5zdGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9uczogKGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSkgPT4gZXh0ZW5zaW9ucy5mb3JFYWNoKGV4dGVuc2lvbiA9PiB0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7IHVzZXJSZWFjdGlvbjogc3RyaW5nOyBleHRlbnNpb25JZDogc3RyaW5nOyBzb3VyY2U6IHN0cmluZyB9LCBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25DbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvblJlY29tbWVuZGF0aW9uczpwb3B1cCcsIHsgdXNlclJlYWN0aW9uOiAnaW5zdGFsbCcsIGV4dGVuc2lvbklkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgc291cmNlOiBSZWNvbW1lbmRhdGlvblNvdXJjZVRvU3RyaW5nKGV4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5zb3VyY2UpIH0pKSxcblx0XHRcdG9uRGlkU2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9uczogKGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSkgPT4gZXh0ZW5zaW9ucy5mb3JFYWNoKGV4dGVuc2lvbiA9PiB0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7IHVzZXJSZWFjdGlvbjogc3RyaW5nOyBleHRlbnNpb25JZDogc3RyaW5nOyBzb3VyY2U6IHN0cmluZyB9LCBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25DbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvblJlY29tbWVuZGF0aW9uczpwb3B1cCcsIHsgdXNlclJlYWN0aW9uOiAnc2hvdycsIGV4dGVuc2lvbklkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgc291cmNlOiBSZWNvbW1lbmRhdGlvblNvdXJjZVRvU3RyaW5nKGV4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5zb3VyY2UpIH0pKSxcblx0XHRcdG9uRGlkQ2FuY2VsUmVjb21tZW5kZWRFeHRlbnNpb25zOiAoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKSA9PiBleHRlbnNpb25zLmZvckVhY2goZXh0ZW5zaW9uID0+IHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgdXNlclJlYWN0aW9uOiBzdHJpbmc7IGV4dGVuc2lvbklkOiBzdHJpbmc7IHNvdXJjZTogc3RyaW5nIH0sIEV4dGVuc2lvblJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbkNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zOnBvcHVwJywgeyB1c2VyUmVhY3Rpb246ICdjYW5jZWxsZWQnLCBleHRlbnNpb25JZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHNvdXJjZTogUmVjb21tZW5kYXRpb25Tb3VyY2VUb1N0cmluZyhleHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuc291cmNlKSB9KSksXG5cdFx0XHRvbkRpZE5ldmVyU2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9uc0FnYWluOiAoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHR0aGlzLmFkZFRvSW1wb3J0YW50UmVjb21tZW5kYXRpb25zSWdub3JlKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7IHVzZXJSZWFjdGlvbjogc3RyaW5nOyBleHRlbnNpb25JZDogc3RyaW5nOyBzb3VyY2U6IHN0cmluZyB9LCBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25DbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvblJlY29tbWVuZGF0aW9uczpwb3B1cCcsIHsgdXNlclJlYWN0aW9uOiAnbmV2ZXJTaG93QWdhaW4nLCBleHRlbnNpb25JZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHNvdXJjZTogUmVjb21tZW5kYXRpb25Tb3VyY2VUb1N0cmluZyhleHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuc291cmNlKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2lnbm9yZUV4dGVuc2lvblJlY29tbWVuZGF0aW9ucycsIFwiRG8geW91IHdhbnQgdG8gaWdub3JlIGFsbCBleHRlbnNpb24gcmVjb21tZW5kYXRpb25zP1wiKSxcblx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpZ25vcmVBbGwnLCBcIlllcywgSWdub3JlIEFsbFwiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5zZXRJZ25vcmVSZWNvbW1lbmRhdGlvbnNDb25maWcodHJ1ZSlcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ25vJywgXCJOb1wiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5zZXRJZ25vcmVSZWNvbW1lbmRhdGlvbnNDb25maWcoZmFsc2UpXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0KTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBwcm9tcHRXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMocmVjb21tZW5kYXRpb25zOiBBcnJheTxzdHJpbmcgfCBVUkk+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihkb25vdFNob3dXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnNTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBmYWxzZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoKTtcblx0XHRpbnN0YWxsZWQgPSBpbnN0YWxsZWQuZmlsdGVyKGwgPT4gdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXRFbmFibGVtZW50U3RhdGUobCkgIT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RXh0ZW5zaW9uS2luZCk7IC8vIEZpbHRlciBleHRlbnNpb25zIGRpc2FibGVkIGJ5IGtpbmRcblx0XHRyZWNvbW1lbmRhdGlvbnMgPSByZWNvbW1lbmRhdGlvbnMuZmlsdGVyKHJlY29tbWVuZGF0aW9uID0+IGluc3RhbGxlZC5ldmVyeShsb2NhbCA9PlxuXHRcdFx0aXNTdHJpbmcocmVjb21tZW5kYXRpb24pID8gIWFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IHJlY29tbWVuZGF0aW9uIH0sIGxvY2FsLmlkZW50aWZpZXIpIDogIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHJlY29tbWVuZGF0aW9uLCBsb2NhbC5sb2NhdGlvbilcblx0XHQpKTtcblx0XHRpZiAoIXJlY29tbWVuZGF0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnByb21wdFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbih7IGV4dGVuc2lvbnM6IHJlY29tbWVuZGF0aW9ucywgc291cmNlOiBSZWNvbW1lbmRhdGlvblNvdXJjZS5XT1JLU1BBQ0UsIG5hbWU6IGxvY2FsaXplKHsga2V5OiAndGhpcyByZXBvc2l0b3J5JywgY29tbWVudDogWyd0aGlzIHJlcG9zaXRvcnkgbWVhbnMgdGhlIGN1cnJlbnQgcmVwb3NpdG9yeSB0aGF0IGlzIG9wZW5lZCddIH0sIFwidGhpcyByZXBvc2l0b3J5XCIpIH0sIHtcblx0XHRcdG9uRGlkSW5zdGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9uczogKCkgPT4gdGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyB1c2VyUmVhY3Rpb246IHN0cmluZyB9LCBFeHRlbnNpb25Xb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25DbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbldvcmtzcGFjZVJlY29tbWVuZGF0aW9uczpwb3B1cCcsIHsgdXNlclJlYWN0aW9uOiAnaW5zdGFsbCcgfSksXG5cdFx0XHRvbkRpZFNob3dSZWNvbW1lbmRlZEV4dGVuc2lvbnM6ICgpID0+IHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgdXNlclJlYWN0aW9uOiBzdHJpbmcgfSwgRXh0ZW5zaW9uV29ya3NwYWNlUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25Xb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnM6cG9wdXAnLCB7IHVzZXJSZWFjdGlvbjogJ3Nob3cnIH0pLFxuXHRcdFx0b25EaWRDYW5jZWxSZWNvbW1lbmRlZEV4dGVuc2lvbnM6ICgpID0+IHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgdXNlclJlYWN0aW9uOiBzdHJpbmcgfSwgRXh0ZW5zaW9uV29ya3NwYWNlUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25Xb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnM6cG9wdXAnLCB7IHVzZXJSZWFjdGlvbjogJ2NhbmNlbGxlZCcgfSksXG5cdFx0XHRvbkRpZE5ldmVyU2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9uc0FnYWluOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgdXNlclJlYWN0aW9uOiBzdHJpbmcgfSwgRXh0ZW5zaW9uV29ya3NwYWNlUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25Xb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnM6cG9wdXAnLCB7IHVzZXJSZWFjdGlvbjogJ25ldmVyU2hvd0FnYWluJyB9KTtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShkb25vdFNob3dXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnNTdG9yYWdlS2V5LCB0cnVlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwcm9tcHRSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb24oeyBleHRlbnNpb25zOiBleHRlbnNpb25JZHMsIHNvdXJjZSwgbmFtZSwgc2VhcmNoVmFsdWUgfTogRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLCByZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25BY3Rpb25zOiBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25BY3Rpb25zKTogUHJvbWlzZTxSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQ+IHtcblxuXHRcdGlmICh0aGlzLmhhc1RvSWdub3JlUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25zKCkpIHtcblx0XHRcdHJldHVybiBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuSWdub3JlZDtcblx0XHR9XG5cblx0XHQvLyBEbyBub3Qgc2hvdyBleGUgYmFzZWQgcmVjb21tZW5kYXRpb25zIGluIHJlbW90ZSB3aW5kb3dcblx0XHRpZiAoc291cmNlID09PSBSZWNvbW1lbmRhdGlvblNvdXJjZS5FWEUgJiYgdGhpcy53b3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRyZXR1cm4gUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0LkluY29tcGF0aWJsZVdpbmRvdztcblx0XHR9XG5cblx0XHQvLyBJZ25vcmUgZXhlIHJlY29tbWVuZGF0aW9uIGlmIHRoZSB3aW5kb3dcblx0XHQvLyBcdFx0PT4gaGFzIHNob3duIGFuIGV4ZSBiYXNlZCByZWNvbW1lbmRhdGlvbiBhbHJlYWR5XG5cdFx0Ly8gXHRcdD0+IG9yIGhhcyBzaG93biBhbnkgdHdvIHJlY29tbWVuZGF0aW9ucyBhbHJlYWR5XG5cdFx0aWYgKHNvdXJjZSA9PT0gUmVjb21tZW5kYXRpb25Tb3VyY2UuRVhFICYmICh0aGlzLnJlY29tbWVuZGF0aW9uU291cmNlcy5pbmNsdWRlcyhSZWNvbW1lbmRhdGlvblNvdXJjZS5FWEUpIHx8IHRoaXMucmVjb21tZW5kYXRpb25Tb3VyY2VzLmxlbmd0aCA+PSAyKSkge1xuXHRcdFx0cmV0dXJuIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdC5Ub29NYW55O1xuXHRcdH1cblxuXHRcdHRoaXMucmVjb21tZW5kYXRpb25Tb3VyY2VzLnB1c2goc291cmNlKTtcblxuXHRcdC8vIElnbm9yZSBleGUgcmVjb21tZW5kYXRpb24gaWYgcmVjb21tZW5kYXRpb25zIGFyZSBhbHJlYWR5IHNob3duXG5cdFx0aWYgKHNvdXJjZSA9PT0gUmVjb21tZW5kYXRpb25Tb3VyY2UuRVhFICYmIGV4dGVuc2lvbklkcy5ldmVyeShpZCA9PiBpc1N0cmluZyhpZCkgJiYgdGhpcy5yZWNvbW1lbmRlZEV4dGVuc2lvbnMuaW5jbHVkZXMoaWQpKSkge1xuXHRcdFx0cmV0dXJuIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdC5JZ25vcmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldEluc3RhbGxhYmxlRXh0ZW5zaW9ucyhleHRlbnNpb25JZHMpO1xuXHRcdGlmICghZXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuSWdub3JlZDtcblx0XHR9XG5cblx0XHR0aGlzLnJlY29tbWVuZGVkRXh0ZW5zaW9ucyA9IGRpc3RpbmN0KFsuLi50aGlzLnJlY29tbWVuZGVkRXh0ZW5zaW9ucywgLi4uZXh0ZW5zaW9uSWRzLmZpbHRlcihpc1N0cmluZyldKTtcblxuXHRcdGxldCBleHRlbnNpb25zTWVzc2FnZSA9ICcnO1xuXHRcdGlmIChleHRlbnNpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0ZXh0ZW5zaW9uc01lc3NhZ2UgPSBsb2NhbGl6ZSgnZXh0ZW5zaW9uRnJvbVB1Ymxpc2hlcicsIFwiJ3swfScgZXh0ZW5zaW9uIGZyb20gezF9XCIsIGV4dGVuc2lvbnNbMF0uZGlzcGxheU5hbWUsIGV4dGVuc2lvbnNbMF0ucHVibGlzaGVyRGlzcGxheU5hbWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwdWJsaXNoZXJzID0gWy4uLmV4dGVuc2lvbnMucmVkdWNlKChyZXN1bHQsIGV4dGVuc2lvbikgPT4gcmVzdWx0LmFkZChleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUpLCBuZXcgU2V0PHN0cmluZz4oKSldO1xuXHRcdFx0aWYgKHB1Ymxpc2hlcnMubGVuZ3RoID4gMikge1xuXHRcdFx0XHRleHRlbnNpb25zTWVzc2FnZSA9IGxvY2FsaXplKCdleHRlbnNpb25zRnJvbU11bHRpcGxlUHVibGlzaGVycycsIFwiZXh0ZW5zaW9ucyBmcm9tIHswfSwgezF9IGFuZCBvdGhlcnNcIiwgcHVibGlzaGVyc1swXSwgcHVibGlzaGVyc1sxXSk7XG5cdFx0XHR9IGVsc2UgaWYgKHB1Ymxpc2hlcnMubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRcdGV4dGVuc2lvbnNNZXNzYWdlID0gbG9jYWxpemUoJ2V4dGVuc2lvbnNGcm9tUHVibGlzaGVycycsIFwiZXh0ZW5zaW9ucyBmcm9tIHswfSBhbmQgezF9XCIsIHB1Ymxpc2hlcnNbMF0sIHB1Ymxpc2hlcnNbMV0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXh0ZW5zaW9uc01lc3NhZ2UgPSBsb2NhbGl6ZSgnZXh0ZW5zaW9uc0Zyb21QdWJsaXNoZXInLCBcImV4dGVuc2lvbnMgZnJvbSB7MH1cIiwgcHVibGlzaGVyc1swXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IG1lc3NhZ2UgPSBsb2NhbGl6ZSgncmVjb21tZW5kZWQnLCBcIkRvIHlvdSB3YW50IHRvIGluc3RhbGwgdGhlIHJlY29tbWVuZGVkIHswfSBmb3IgezF9P1wiLCBleHRlbnNpb25zTWVzc2FnZSwgbmFtZSk7XG5cdFx0aWYgKHNvdXJjZSA9PT0gUmVjb21tZW5kYXRpb25Tb3VyY2UuRVhFKSB7XG5cdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoeyBrZXk6ICdleGVSZWNvbW1lbmRlZCcsIGNvbW1lbnQ6IFsnUGxhY2Vob2xkZXIgc3RyaW5nIGlzIHRoZSBuYW1lIG9mIHRoZSBzb2Z0d2FyZSB0aGF0IGlzIGluc3RhbGxlZC4nXSB9LCBcIllvdSBoYXZlIHswfSBpbnN0YWxsZWQgb24geW91ciBzeXN0ZW0uIERvIHlvdSB3YW50IHRvIGluc3RhbGwgdGhlIHJlY29tbWVuZGVkIHsxfSBmb3IgaXQ/XCIsIG5hbWUsIGV4dGVuc2lvbnNNZXNzYWdlKTtcblx0XHR9XG5cdFx0aWYgKCFzZWFyY2hWYWx1ZSkge1xuXHRcdFx0c2VhcmNoVmFsdWUgPSBzb3VyY2UgPT09IFJlY29tbWVuZGF0aW9uU291cmNlLldPUktTUEFDRSA/ICdAcmVjb21tZW5kZWQnIDogZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uSWQgPT4gYEBpZDoke2V4dGVuc2lvbklkLmlkZW50aWZpZXIuaWR9YCkuam9pbignICcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRvbm90U2hvd0FnYWluTGFiZWwgPSBzb3VyY2UgPT09IFJlY29tbWVuZGF0aW9uU291cmNlLldPUktTUEFDRSA/IGxvY2FsaXplKCdkb25vdFNob3dBZ2FpbicsIFwiRG9uJ3QgU2hvdyBBZ2FpbiBmb3IgdGhpcyBSZXBvc2l0b3J5XCIpXG5cdFx0XHQ6IGV4dGVuc2lvbnMubGVuZ3RoID4gMSA/IGxvY2FsaXplKCdkb25vdFNob3dBZ2FpbkV4dGVuc2lvbicsIFwiRG9uJ3QgU2hvdyBBZ2FpbiBmb3IgdGhlc2UgRXh0ZW5zaW9uc1wiKSA6IGxvY2FsaXplKCdkb25vdFNob3dBZ2FpbkV4dGVuc2lvblNpbmdsZScsIFwiRG9uJ3QgU2hvdyBBZ2FpbiBmb3IgdGhpcyBFeHRlbnNpb25cIik7XG5cblx0XHRyZXR1cm4gcmFjZUNhbmNlbGxhYmxlUHJvbWlzZXMoW1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXJQKHRoaXMuc2hvd1JlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbihleHRlbnNpb25zLCBtZXNzYWdlLCBzZWFyY2hWYWx1ZSwgZG9ub3RTaG93QWdhaW5MYWJlbCwgc291cmNlLCByZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25BY3Rpb25zKSksXG5cdFx0XHR0aGlzLl9yZWdpc3RlclAodGhpcy53YWl0VW50aWxSZWNvbW1lbmRhdGlvbnNBcmVJbnN0YWxsZWQoZXh0ZW5zaW9ucykpXG5cdFx0XSk7XG5cblx0fVxuXG5cdHByaXZhdGUgc2hvd1JlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbihleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10sIG1lc3NhZ2U6IHN0cmluZywgc2VhcmNoVmFsdWU6IHN0cmluZywgZG9ub3RTaG93QWdhaW5MYWJlbDogc3RyaW5nLCBzb3VyY2U6IFJlY29tbWVuZGF0aW9uU291cmNlLFxuXHRcdHsgb25EaWRJbnN0YWxsUmVjb21tZW5kZWRFeHRlbnNpb25zLCBvbkRpZFNob3dSZWNvbW1lbmRlZEV4dGVuc2lvbnMsIG9uRGlkQ2FuY2VsUmVjb21tZW5kZWRFeHRlbnNpb25zLCBvbkRpZE5ldmVyU2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9uc0FnYWluIH06IFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbkFjdGlvbnMpOiBDYW5jZWxhYmxlUHJvbWlzZTxSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQ+IHtcblx0XHRyZXR1cm4gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2U8UmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0Pihhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRsZXQgYWNjZXB0ZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGNob2ljZXM6IChJUHJvbXB0Q2hvaWNlIHwgSVByb21wdENob2ljZVdpdGhNZW51KVtdID0gW107XG5cdFx0XHRjb25zdCBpbnN0YWxsRXh0ZW5zaW9ucyA9IGFzeW5jIChpc01hY2hpbmVTY29wZWQ6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0dGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKHNlYXJjaFZhbHVlKTtcblx0XHRcdFx0b25EaWRJbnN0YWxsUmVjb21tZW5kZWRFeHRlbnNpb25zKGV4dGVuc2lvbnMpO1xuXHRcdFx0XHRjb25zdCBnYWxsZXJ5RXh0ZW5zaW9uczogSUdhbGxlcnlFeHRlbnNpb25bXSA9IFtdLCByZXNvdXJjZUV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5nYWxsZXJ5KSB7XG5cdFx0XHRcdFx0XHRnYWxsZXJ5RXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbi5nYWxsZXJ5KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGV4dGVuc2lvbi5yZXNvdXJjZUV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2VFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZDxhbnk+KFtcblx0XHRcdFx0XHRQcm9taXNlcy5zZXR0bGVkKGV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW4oZXh0ZW5zaW9uLCB7IHBpbm5lZDogdHJ1ZSB9KSkpLFxuXHRcdFx0XHRcdGdhbGxlcnlFeHRlbnNpb25zLmxlbmd0aCA/IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEdhbGxlcnlFeHRlbnNpb25zKGdhbGxlcnlFeHRlbnNpb25zLm1hcChlID0+ICh7IGV4dGVuc2lvbjogZSwgb3B0aW9uczogeyBpc01hY2hpbmVTY29wZWQgfSB9KSkpIDogUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHRcdFx0cmVzb3VyY2VFeHRlbnNpb25zLmxlbmd0aCA/IFByb21pc2UuYWxsU2V0dGxlZChyZXNvdXJjZUV4dGVuc2lvbnMubWFwKHIgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKHIpKSkgOiBQcm9taXNlLnJlc29sdmUoKVxuXHRcdFx0XHRdKTtcblx0XHRcdH07XG5cdFx0XHRjaG9pY2VzLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2luc3RhbGwnLCBcIkluc3RhbGxcIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4gaW5zdGFsbEV4dGVuc2lvbnMoZmFsc2UpLFxuXHRcdFx0XHRtZW51OiB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpICYmIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNSZXNvdXJjZUVuYWJsZWQoU3luY1Jlc291cmNlLkV4dGVuc2lvbnMpID8gW3tcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2luc3RhbGwgYW5kIGRvIG5vIHN5bmMnLCBcIkluc3RhbGwgKERvIG5vdCBzeW5jKVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IGluc3RhbGxFeHRlbnNpb25zKHRydWUpXG5cdFx0XHRcdH1dIDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0XHRjaG9pY2VzLnB1c2goLi4uW3tcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaG93IHJlY29tbWVuZGF0aW9ucycsIFwiU2hvdyBSZWNvbW1lbmRhdGlvbnNcIiksXG5cdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdG9uRGlkU2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9ucyhleHRlbnNpb25zKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW4oZXh0ZW5zaW9uLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKHNlYXJjaFZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwge1xuXHRcdFx0XHRsYWJlbDogZG9ub3RTaG93QWdhaW5MYWJlbCxcblx0XHRcdFx0aXNTZWNvbmRhcnk6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdG9uRGlkTmV2ZXJTaG93UmVjb21tZW5kZWRFeHRlbnNpb25zQWdhaW4oZXh0ZW5zaW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1dKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFjY2VwdGVkID0gYXdhaXQgdGhpcy5kb1Nob3dSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb24oU2V2ZXJpdHkuSW5mbywgbWVzc2FnZSwgY2hvaWNlcywgc291cmNlLCB0b2tlbik7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGFjY2VwdGVkKSB7XG5cdFx0XHRcdHJldHVybiBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuQWNjZXB0ZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvbkRpZENhbmNlbFJlY29tbWVuZGVkRXh0ZW5zaW9ucyhleHRlbnNpb25zKTtcblx0XHRcdFx0cmV0dXJuIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdC5DYW5jZWxsZWQ7XG5cdFx0XHR9XG5cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgd2FpdFVudGlsUmVjb21tZW5kYXRpb25zQXJlSW5zdGFsbGVkKGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSk6IENhbmNlbGFibGVQcm9taXNlPFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdC5BY2NlcHRlZD4ge1xuXHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0cmV0dXJuIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGFzeW5jIHRva2VuID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZChlID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdC5BY2NlcHRlZD4oKGMsIGUpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25JbnN0YWxsRXh0ZW5zaW9uKGUgPT4ge1xuXHRcdFx0XHRcdGluc3RhbGxlZEV4dGVuc2lvbnMucHVzaChlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbnMuZXZlcnkoZSA9PiBpbnN0YWxsZWRFeHRlbnNpb25zLmluY2x1ZGVzKGUuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKSkpIHtcblx0XHRcdFx0XHRcdGMoUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0LkFjY2VwdGVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3cgcmVjb21tZW5kYXRpb25zIGluIFF1ZXVlXG5cdCAqIEF0IGFueSB0aW1lIG9ubHkgb25lIHJlY29tbWVuZGF0aW9uIGlzIHNob3duXG5cdCAqIElmIGEgbmV3IHJlY29tbWVuZGF0aW9uIGNvbWVzIGluXG5cdCAqIFx0XHQ9PiBJZiBubyByZWNvbW1lbmRhdGlvbiBpcyB2aXNpYmxlLCBzaG93IGl0IGltbWVkaWF0ZWx5XG5cdCAqXHRcdD0+IE90aGVyd2lzZSwgYWRkIHRvIHRoZSBwZW5kaW5nIHF1ZXVlXG5cdCAqIFx0XHRcdD0+IElmIGl0IGlzIG5vdCBleGUgYmFzZWQgYW5kIGhhcyBoaWdoZXIgb3Igc2FtZSBwcmlvcml0eSBhcyBjdXJyZW50LCBoaWRlIHRoZSBjdXJyZW50IG5vdGlmaWNhdGlvbiBhZnRlciBzaG93aW5nIGl0IGZvciAzcy5cblx0ICogXHRcdFx0PT4gT3RoZXJ3aXNlIHdhaXQgdW50aWwgdGhlIGN1cnJlbnQgbm90aWZpY2F0aW9uIGlzIGhpZGRlbi5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgZG9TaG93UmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uKHNldmVyaXR5OiBTZXZlcml0eSwgbWVzc2FnZTogc3RyaW5nLCBjaG9pY2VzOiBJUHJvbXB0Q2hvaWNlW10sIHNvdXJjZTogUmVjb21tZW5kYXRpb25Tb3VyY2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbihzZXZlcml0eSwgbWVzc2FnZSwgY2hvaWNlcywgdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQub25jZShFdmVudC5maWx0ZXIocmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSwgZSA9PiAhZSkpKCgpID0+IHRoaXMuc2hvd05leHROb3RpZmljYXRpb24oKSkpO1xuXHRcdFx0aWYgKHRoaXMudmlzaWJsZU5vdGlmaWNhdGlvbikge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMucGVuZGluZ05vdGlmaWNhaXRvbnMubGVuZ3RoO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gdGhpcy5wZW5kaW5nTm90aWZpY2FpdG9ucy5zcGxpY2UoaW5kZXgsIDEpKSk7XG5cdFx0XHRcdHRoaXMucGVuZGluZ05vdGlmaWNhaXRvbnMucHVzaCh7IHJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbiwgc291cmNlLCB0b2tlbiB9KTtcblx0XHRcdFx0aWYgKHNvdXJjZSAhPT0gUmVjb21tZW5kYXRpb25Tb3VyY2UuRVhFICYmIHNvdXJjZSA8PSB0aGlzLnZpc2libGVOb3RpZmljYXRpb24uc291cmNlKSB7XG5cdFx0XHRcdFx0dGhpcy5oaWRlVmlzaWJsZU5vdGlmaWNhdGlvbigzMDAwKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy52aXNpYmxlTm90aWZpY2F0aW9uID0geyByZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb24sIHNvdXJjZSwgZnJvbTogRGF0ZS5ub3coKSB9O1xuXHRcdFx0XHRyZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb24uc2hvdygpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgcmFjZUNhbmNlbGxhdGlvbihuZXcgUHJvbWlzZShjID0+IGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKHJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbi5vbkRpZENsb3NlKShjKSkpLCB0b2tlbik7XG5cdFx0XHRyZXR1cm4gIXJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvbi5pc0NhbmNlbGxlZCgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG93TmV4dE5vdGlmaWNhdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuZ2V0TmV4dFBlbmRpbmdOb3RpZmljYXRpb25JbmRleCgpO1xuXHRcdGNvbnN0IFtuZXh0Tm90aWZpY2FpdG9uXSA9IGluZGV4ID4gLTEgPyB0aGlzLnBlbmRpbmdOb3RpZmljYWl0b25zLnNwbGljZShpbmRleCwgMSkgOiBbXTtcblxuXHRcdC8vIFNob3cgdGhlIG5leHQgbm90aWZpY2F0aW9uIGFmdGVyIGEgZGVsYXkgb2YgNTAwbXMgKGFmdGVyIHRoZSBjdXJyZW50IG5vdGlmaWNhdGlvbiBpcyBkaXNtaXNzZWQpXG5cdFx0dGltZW91dChuZXh0Tm90aWZpY2FpdG9uID8gNTAwIDogMClcblx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0dGhpcy51bnNldFZpc2liaWxlTm90aWZpY2F0aW9uKCk7XG5cdFx0XHRcdGlmIChuZXh0Tm90aWZpY2FpdG9uKSB7XG5cdFx0XHRcdFx0dGhpcy52aXNpYmxlTm90aWZpY2F0aW9uID0geyByZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb246IG5leHROb3RpZmljYWl0b24ucmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uLCBzb3VyY2U6IG5leHROb3RpZmljYWl0b24uc291cmNlLCBmcm9tOiBEYXRlLm5vdygpIH07XG5cdFx0XHRcdFx0bmV4dE5vdGlmaWNhaXRvbi5yZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb24uc2hvdygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm4gdGhlIHJlY2VudCBoaWdoIHByaXJvaXR5IHBlbmRpbmcgbm90aWZpY2F0aW9uXG5cdCAqL1xuXHRwcml2YXRlIGdldE5leHRQZW5kaW5nTm90aWZpY2F0aW9uSW5kZXgoKTogbnVtYmVyIHtcblx0XHRsZXQgaW5kZXggPSB0aGlzLnBlbmRpbmdOb3RpZmljYWl0b25zLmxlbmd0aCAtIDE7XG5cdFx0aWYgKHRoaXMucGVuZGluZ05vdGlmaWNhaXRvbnMubGVuZ3RoKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucGVuZGluZ05vdGlmaWNhaXRvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKHRoaXMucGVuZGluZ05vdGlmaWNhaXRvbnNbaV0uc291cmNlIDw9IHRoaXMucGVuZGluZ05vdGlmaWNhaXRvbnNbaW5kZXhdLnNvdXJjZSkge1xuXHRcdFx0XHRcdGluZGV4ID0gaTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaW5kZXg7XG5cdH1cblxuXHRwcml2YXRlIGhpZGVWaXNpYmxlTm90aWZpY2F0aW9uKHRpbWVJbk1pbGxpczogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlzaWJsZU5vdGlmaWNhdGlvbiAmJiAhdGhpcy5oaWRlVmlzaWJsZU5vdGlmaWNhdGlvblByb21pc2UpIHtcblx0XHRcdGNvbnN0IHZpc2libGVOb3RpZmljYXRpb24gPSB0aGlzLnZpc2libGVOb3RpZmljYXRpb247XG5cdFx0XHR0aGlzLmhpZGVWaXNpYmxlTm90aWZpY2F0aW9uUHJvbWlzZSA9IHRpbWVvdXQoTWF0aC5tYXgodGltZUluTWlsbGlzIC0gKERhdGUubm93KCkgLSB2aXNpYmxlTm90aWZpY2F0aW9uLmZyb20pLCAwKSk7XG5cdFx0XHR0aGlzLmhpZGVWaXNpYmxlTm90aWZpY2F0aW9uUHJvbWlzZS50aGVuKCgpID0+IHZpc2libGVOb3RpZmljYXRpb24ucmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uLmhpZGUoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1bnNldFZpc2liaWxlTm90aWZpY2F0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuaGlkZVZpc2libGVOb3RpZmljYXRpb25Qcm9taXNlPy5jYW5jZWwoKTtcblx0XHR0aGlzLmhpZGVWaXNpYmxlTm90aWZpY2F0aW9uUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnZpc2libGVOb3RpZmljYXRpb24gPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEluc3RhbGxhYmxlRXh0ZW5zaW9ucyhyZWNvbW1lbmRhdGlvbnM6IEFycmF5PHN0cmluZyB8IFVSST4pOiBQcm9taXNlPElFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUV4dGVuc2lvbltdID0gW107XG5cdFx0aWYgKHJlY29tbWVuZGF0aW9ucy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VFeHRlbnNpb25zOiBVUklbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCByZWNvbW1lbmRhdGlvbiBvZiByZWNvbW1lbmRhdGlvbnMpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiByZWNvbW1lbmRhdGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRnYWxsZXJ5RXh0ZW5zaW9ucy5wdXNoKHJlY29tbWVuZGF0aW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvdXJjZUV4dGVuc2lvbnMucHVzaChyZWNvbW1lbmRhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChnYWxsZXJ5RXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhnYWxsZXJ5RXh0ZW5zaW9ucy5tYXAoaWQgPT4gKHsgaWQgfSkpLCB7IHNvdXJjZTogJ2luc3RhbGwtcmVjb21tZW5kYXRpb25zJyB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdGlmIChleHRlbnNpb24uZ2FsbGVyeSAmJiBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmNhbkluc3RhbGwoZXh0ZW5zaW9uLmdhbGxlcnkpID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc291cmNlRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuZ2V0UmVzb3VyY2VFeHRlbnNpb25zKHJlc291cmNlRXh0ZW5zaW9ucywgdHJ1ZSk7XG5cdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5jYW5JbnN0YWxsKGV4dGVuc2lvbikgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFkZFRvSW1wb3J0YW50UmVjb21tZW5kYXRpb25zSWdub3JlKGlkOiBzdHJpbmcpIHtcblx0XHRjb25zdCBpbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnNJZ25vcmVMaXN0ID0gWy4uLnRoaXMuaWdub3JlZFJlY29tbWVuZGF0aW9uc107XG5cdFx0aWYgKCFpbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnNJZ25vcmVMaXN0LmluY2x1ZGVzKGlkLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRpbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnNJZ25vcmVMaXN0LnB1c2goaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGlnbm9yZUltcG9ydGFudEV4dGVuc2lvblJlY29tbWVuZGF0aW9uU3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoaW1wb3J0YW50UmVjb21tZW5kYXRpb25zSWdub3JlTGlzdCksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0SWdub3JlUmVjb21tZW5kYXRpb25zQ29uZmlnKGNvbmZpZ1ZhbDogYm9vbGVhbikge1xuXHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2V4dGVuc2lvbnMuaWdub3JlUmVjb21tZW5kYXRpb25zJywgY29uZmlnVmFsKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyUDxUPihvOiBDYW5jZWxhYmxlUHJvbWlzZTxUPik6IENhbmNlbGFibGVQcm9taXNlPFQ+IHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gby5jYW5jZWwoKSkpO1xuXHRcdHJldHVybiBvO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTRCLHlCQUF5QixVQUFVLHlCQUF5QixrQkFBa0IsZUFBZTtBQUN6SCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFDN0UsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBaUYsbUNBQW1DLHNCQUFzQixvQ0FBb0M7QUFDOUssU0FBOEIsc0JBQTRELHNCQUFzQixnQkFBZ0I7QUFDaEksU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBZ0Msb0JBQW9CO0FBQzdELFNBQXFCLG1DQUFtQztBQUN4RCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGlCQUFpQixzQ0FBc0MsNENBQTRDO0FBQzVHLFNBQVMsK0NBQStDO0FBZ0J4RCxNQUFNLG1EQUFtRDtBQUN6RCxNQUFNLDhDQUE4QztBQVdwRCxNQUFNLG9DQUFvQyxXQUFXO0FBQUEsRUFXcEQsWUFDa0IsVUFDQSxTQUNBLFNBQ0EscUJBQ2hCO0FBQ0QsVUFBTTtBQUxXO0FBQ0E7QUFDQTtBQUNBO0FBYmxCLFNBQVEsY0FBYyxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDeEQsU0FBUyxhQUFhLEtBQUssWUFBWTtBQUV2QyxTQUFRLHlCQUF5QixLQUFLLFVBQVUsSUFBSSxRQUFpQixDQUFDO0FBQ3RFLFNBQVMsd0JBQXdCLEtBQUssdUJBQXVCO0FBRzdELFNBQVEsWUFBcUI7QUE4QjdCLFNBQWlCLHVCQUF1QixLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQUM5RSxTQUFpQixrQ0FBa0MsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFBQSxFQXRCekY7QUFBQSxFQUVBLE9BQWE7QUFDWixRQUFJLENBQUMsS0FBSyxvQkFBb0I7QUFDN0IsV0FBSyx5QkFBeUIsS0FBSyxvQkFBb0IsT0FBTyxLQUFLLFVBQVUsS0FBSyxTQUFTLEtBQUssU0FBUyxFQUFFLFFBQVEsTUFBTSxVQUFVLHFCQUFxQixVQUFVLFVBQVUsTUFBTSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUM7QUFBQSxJQUMzTTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQWE7QUFDWixRQUFJLEtBQUssb0JBQW9CO0FBQzVCLFdBQUsscUJBQXFCLE1BQU07QUFDaEMsV0FBSyxtQkFBbUIsTUFBTTtBQUM5QixXQUFLLFlBQVk7QUFDakIsV0FBSyx5QkFBeUIsS0FBSyxvQkFBb0IsT0FBTyxLQUFLLFVBQVUsS0FBSyxTQUFTLEtBQUssU0FBUyxFQUFFLFVBQVUscUJBQXFCLFFBQVEsVUFBVSxNQUFNLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQztBQUFBLElBQzNMO0FBQUEsRUFDRDtBQUFBLEVBRUEsY0FBdUI7QUFDdEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBSVEseUJBQXlCLG9CQUF5QztBQUN6RSxTQUFLLHFCQUFxQixNQUFNO0FBQ2hDLFNBQUssZ0NBQWdDLE1BQU07QUFDM0MsU0FBSyxxQkFBcUI7QUFFMUIsU0FBSyxxQkFBcUIsUUFBUSxLQUFLLG1CQUFtQixXQUFXLE1BQU07QUFDMUUsV0FBSyxxQkFBcUIsUUFBUTtBQUNsQyxXQUFLLGdDQUFnQyxRQUFRO0FBRTdDLFdBQUssWUFBWSxLQUFLO0FBRXRCLFdBQUssWUFBWSxRQUFRO0FBQ3pCLFdBQUssdUJBQXVCLFFBQVE7QUFBQSxJQUNyQyxDQUFDO0FBQ0QsU0FBSyxnQ0FBZ0MsUUFBUSxLQUFLLG1CQUFtQixzQkFBc0IsQ0FBQyxNQUFNLEtBQUssdUJBQXVCLEtBQUssQ0FBQyxDQUFDO0FBQUEsRUFDdEk7QUFDRDtBQUtPLElBQU0sNkNBQU4sY0FBeUQsV0FBa0U7QUFBQSxFQWdCakksWUFDeUMsc0JBQ04sZ0JBQ0sscUJBQ0gsa0JBQ1UsNEJBQ1MsNEJBQ0EsNEJBQ0csd0NBQ1QsK0JBQ0YsNkJBQ1Qsb0JBQ3JDO0FBQ0QsVUFBTTtBQVprQztBQUNOO0FBQ0s7QUFDSDtBQUNVO0FBQ1M7QUFDQTtBQUNHO0FBQ1Q7QUFDRjtBQUNUO0FBbEJ2QyxTQUFRLHdCQUFrQyxDQUFDO0FBQzNDLFNBQVEsd0JBQWdELENBQUM7QUFJekQsU0FBUSx1QkFBNkQsQ0FBQztBQUFBLEVBZ0J0RTtBQUFBO0FBQUEsRUF6QkEsSUFBSSx5QkFBbUM7QUFDdEMsV0FBTyxTQUFTLENBQUMsR0FBYyxLQUFLLE1BQU0sS0FBSyxlQUFlLElBQUksa0RBQWtELGFBQWEsU0FBUyxJQUFJLENBQUMsQ0FBRSxFQUFFLElBQUksT0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFDO0FBQUEsRUFDN0s7QUFBQSxFQXlCQSx5Q0FBa0Q7QUFDakQsVUFBTSxTQUFTLEtBQUsscUJBQXFCLFNBQXdGLFlBQVk7QUFDN0ksV0FBTyxPQUFPLHlCQUF5QixDQUFDLENBQUMsT0FBTztBQUFBLEVBQ2pEO0FBQUEsRUFFQSxNQUFNLDZDQUE2QywwQkFBaUc7QUFDbkosVUFBTSx5QkFBeUIsQ0FBQyxHQUFHLEtBQUssdUNBQXVDLHdCQUF3QixHQUFHLEtBQUssc0JBQXNCO0FBQ3JJLFVBQU0sYUFBYSx5QkFBeUIsV0FBVyxPQUFPLFFBQU0sQ0FBQyx1QkFBdUIsU0FBUyxFQUFFLENBQUM7QUFDeEcsUUFBSSxDQUFDLFdBQVcsUUFBUTtBQUN2QixhQUFPLGtDQUFrQztBQUFBLElBQzFDO0FBRUEsV0FBTyxLQUFLLGtDQUFrQyxFQUFFLEdBQUcsMEJBQTBCLFdBQVcsR0FBRztBQUFBLE1BQzFGLG1DQUFtQyxDQUFDQSxnQkFBNkJBLFlBQVcsUUFBUSxlQUFhLEtBQUssaUJBQWlCLFdBQThILGtDQUFrQyxFQUFFLGNBQWMsV0FBVyxhQUFhLFVBQVUsV0FBVyxJQUFJLFFBQVEsNkJBQTZCLHlCQUF5QixNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBQUEsTUFDaGEsZ0NBQWdDLENBQUNBLGdCQUE2QkEsWUFBVyxRQUFRLGVBQWEsS0FBSyxpQkFBaUIsV0FBOEgsa0NBQWtDLEVBQUUsY0FBYyxRQUFRLGFBQWEsVUFBVSxXQUFXLElBQUksUUFBUSw2QkFBNkIseUJBQXlCLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFBQSxNQUMxWixrQ0FBa0MsQ0FBQ0EsZ0JBQTZCQSxZQUFXLFFBQVEsZUFBYSxLQUFLLGlCQUFpQixXQUE4SCxrQ0FBa0MsRUFBRSxjQUFjLGFBQWEsYUFBYSxVQUFVLFdBQVcsSUFBSSxRQUFRLDZCQUE2Qix5QkFBeUIsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUFBLE1BQ2phLDBDQUEwQyxDQUFDQSxnQkFBNkI7QUFDdkUsbUJBQVcsYUFBYUEsYUFBWTtBQUNuQyxlQUFLLG9DQUFvQyxVQUFVLFdBQVcsRUFBRTtBQUNoRSxlQUFLLGlCQUFpQixXQUE4SCxrQ0FBa0MsRUFBRSxjQUFjLGtCQUFrQixhQUFhLFVBQVUsV0FBVyxJQUFJLFFBQVEsNkJBQTZCLHlCQUF5QixNQUFNLEVBQUUsQ0FBQztBQUFBLFFBQ3RVO0FBQ0EsYUFBSyxvQkFBb0I7QUFBQSxVQUN4QixTQUFTO0FBQUEsVUFDVCxTQUFTLGtDQUFrQyxzREFBc0Q7QUFBQSxVQUNqRyxDQUFDO0FBQUEsWUFDQSxPQUFPLFNBQVMsYUFBYSxpQkFBaUI7QUFBQSxZQUM5QyxLQUFLLE1BQU0sS0FBSywrQkFBK0IsSUFBSTtBQUFBLFVBQ3BELEdBQUc7QUFBQSxZQUNGLE9BQU8sU0FBUyxNQUFNLElBQUk7QUFBQSxZQUMxQixLQUFLLE1BQU0sS0FBSywrQkFBK0IsS0FBSztBQUFBLFVBQ3JELENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sK0JBQStCLGlCQUFxRDtBQUN6RixRQUFJLEtBQUssZUFBZSxXQUFXLDZDQUE2QyxhQUFhLFdBQVcsS0FBSyxHQUFHO0FBQy9HO0FBQUEsSUFDRDtBQUVBLFFBQUksWUFBWSxNQUFNLEtBQUssMkJBQTJCLGFBQWE7QUFDbkUsZ0JBQVksVUFBVSxPQUFPLE9BQUssS0FBSywyQkFBMkIsbUJBQW1CLENBQUMsTUFBTSxnQkFBZ0IsdUJBQXVCO0FBQ25JLHNCQUFrQixnQkFBZ0IsT0FBTyxvQkFBa0IsVUFBVTtBQUFBLE1BQU0sV0FDMUUsU0FBUyxjQUFjLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLGVBQWUsR0FBRyxNQUFNLFVBQVUsSUFBSSxDQUFDLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxnQkFBZ0IsTUFBTSxRQUFRO0FBQUEsSUFDakssQ0FBQztBQUNELFFBQUksQ0FBQyxnQkFBZ0IsUUFBUTtBQUM1QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLEtBQUssa0NBQWtDLEVBQUUsWUFBWSxpQkFBaUIsUUFBUSxxQkFBcUIsV0FBVyxNQUFNLFNBQVMsRUFBRSxLQUFLLG1CQUFtQixTQUFTLENBQUMsNkRBQTZELEVBQUUsR0FBRyxpQkFBaUIsRUFBRSxHQUFHO0FBQUEsTUFDOVAsbUNBQW1DLE1BQU0sS0FBSyxpQkFBaUIsV0FBa0csMkNBQTJDLEVBQUUsY0FBYyxVQUFVLENBQUM7QUFBQSxNQUN2TyxnQ0FBZ0MsTUFBTSxLQUFLLGlCQUFpQixXQUFrRywyQ0FBMkMsRUFBRSxjQUFjLE9BQU8sQ0FBQztBQUFBLE1BQ2pPLGtDQUFrQyxNQUFNLEtBQUssaUJBQWlCLFdBQWtHLDJDQUEyQyxFQUFFLGNBQWMsWUFBWSxDQUFDO0FBQUEsTUFDeE8sMENBQTBDLE1BQU07QUFDL0MsYUFBSyxpQkFBaUIsV0FBa0csMkNBQTJDLEVBQUUsY0FBYyxpQkFBaUIsQ0FBQztBQUNyTSxhQUFLLGVBQWUsTUFBTSw2Q0FBNkMsTUFBTSxhQUFhLFdBQVcsY0FBYyxPQUFPO0FBQUEsTUFDM0g7QUFBQSxJQUNELENBQUM7QUFBQSxFQUVGO0FBQUEsRUFFQSxNQUFjLGtDQUFrQyxFQUFFLFlBQVksY0FBYyxRQUFRLE1BQU0sWUFBWSxHQUE2QixvQ0FBb0g7QUFFdFAsUUFBSSxLQUFLLHVDQUF1QyxHQUFHO0FBQ2xELGFBQU8sa0NBQWtDO0FBQUEsSUFDMUM7QUFHQSxRQUFJLFdBQVcscUJBQXFCLE9BQU8sS0FBSyw0QkFBNEIsaUJBQWlCO0FBQzVGLGFBQU8sa0NBQWtDO0FBQUEsSUFDMUM7QUFLQSxRQUFJLFdBQVcscUJBQXFCLFFBQVEsS0FBSyxzQkFBc0IsU0FBUyxxQkFBcUIsR0FBRyxLQUFLLEtBQUssc0JBQXNCLFVBQVUsSUFBSTtBQUNySixhQUFPLGtDQUFrQztBQUFBLElBQzFDO0FBRUEsU0FBSyxzQkFBc0IsS0FBSyxNQUFNO0FBR3RDLFFBQUksV0FBVyxxQkFBcUIsT0FBTyxhQUFhLE1BQU0sUUFBTSxTQUFTLEVBQUUsS0FBSyxLQUFLLHNCQUFzQixTQUFTLEVBQUUsQ0FBQyxHQUFHO0FBQzdILGFBQU8sa0NBQWtDO0FBQUEsSUFDMUM7QUFFQSxVQUFNLGFBQWEsTUFBTSxLQUFLLHlCQUF5QixZQUFZO0FBQ25FLFFBQUksQ0FBQyxXQUFXLFFBQVE7QUFDdkIsYUFBTyxrQ0FBa0M7QUFBQSxJQUMxQztBQUVBLFNBQUssd0JBQXdCLFNBQVMsQ0FBQyxHQUFHLEtBQUssdUJBQXVCLEdBQUcsYUFBYSxPQUFPLFFBQVEsQ0FBQyxDQUFDO0FBRXZHLFFBQUksb0JBQW9CO0FBQ3hCLFFBQUksV0FBVyxXQUFXLEdBQUc7QUFDNUIsMEJBQW9CLFNBQVMsMEJBQTBCLDRCQUE0QixXQUFXLENBQUMsRUFBRSxhQUFhLFdBQVcsQ0FBQyxFQUFFLG9CQUFvQjtBQUFBLElBQ2pKLE9BQU87QUFDTixZQUFNLGFBQWEsQ0FBQyxHQUFHLFdBQVcsT0FBTyxDQUFDLFFBQVEsY0FBYyxPQUFPLElBQUksVUFBVSxvQkFBb0IsR0FBRyxvQkFBSSxJQUFZLENBQUMsQ0FBQztBQUM5SCxVQUFJLFdBQVcsU0FBUyxHQUFHO0FBQzFCLDRCQUFvQixTQUFTLG9DQUFvQyx1Q0FBdUMsV0FBVyxDQUFDLEdBQUcsV0FBVyxDQUFDLENBQUM7QUFBQSxNQUNySSxXQUFXLFdBQVcsV0FBVyxHQUFHO0FBQ25DLDRCQUFvQixTQUFTLDRCQUE0QiwrQkFBK0IsV0FBVyxDQUFDLEdBQUcsV0FBVyxDQUFDLENBQUM7QUFBQSxNQUNySCxPQUFPO0FBQ04sNEJBQW9CLFNBQVMsMkJBQTJCLHVCQUF1QixXQUFXLENBQUMsQ0FBQztBQUFBLE1BQzdGO0FBQUEsSUFDRDtBQUVBLFFBQUksVUFBVSxTQUFTLGVBQWUsdURBQXVELG1CQUFtQixJQUFJO0FBQ3BILFFBQUksV0FBVyxxQkFBcUIsS0FBSztBQUN4QyxnQkFBVSxTQUFTLEVBQUUsS0FBSyxrQkFBa0IsU0FBUyxDQUFDLG1FQUFtRSxFQUFFLEdBQUcsNkZBQTZGLE1BQU0saUJBQWlCO0FBQUEsSUFDblA7QUFDQSxRQUFJLENBQUMsYUFBYTtBQUNqQixvQkFBYyxXQUFXLHFCQUFxQixZQUFZLGlCQUFpQixXQUFXLElBQUksaUJBQWUsT0FBTyxZQUFZLFdBQVcsRUFBRSxFQUFFLEVBQUUsS0FBSyxHQUFHO0FBQUEsSUFDdEo7QUFFQSxVQUFNLHNCQUFzQixXQUFXLHFCQUFxQixZQUFZLFNBQVMsa0JBQWtCLHNDQUFzQyxJQUN0SSxXQUFXLFNBQVMsSUFBSSxTQUFTLDJCQUEyQix1Q0FBdUMsSUFBSSxTQUFTLGlDQUFpQyxxQ0FBcUM7QUFFekwsV0FBTyx3QkFBd0I7QUFBQSxNQUM5QixLQUFLLFdBQVcsS0FBSyxnQ0FBZ0MsWUFBWSxTQUFTLGFBQWEscUJBQXFCLFFBQVEsa0NBQWtDLENBQUM7QUFBQSxNQUN2SixLQUFLLFdBQVcsS0FBSyxxQ0FBcUMsVUFBVSxDQUFDO0FBQUEsSUFDdEUsQ0FBQztBQUFBLEVBRUY7QUFBQSxFQUVRLGdDQUFnQyxZQUEwQixTQUFpQixhQUFxQixxQkFBNkIsUUFDcEksRUFBRSxtQ0FBbUMsZ0NBQWdDLGtDQUFrQyx5Q0FBeUMsR0FBNkY7QUFDN08sV0FBTyx3QkFBMkQsT0FBTSxVQUFTO0FBQ2hGLFVBQUksV0FBVztBQUNmLFlBQU0sVUFBcUQsQ0FBQztBQUM1RCxZQUFNLG9CQUFvQixPQUFPLG9CQUE2QjtBQUM3RCxhQUFLLDJCQUEyQixXQUFXLFdBQVc7QUFDdEQsMENBQWtDLFVBQVU7QUFDNUMsY0FBTSxvQkFBeUMsQ0FBQyxHQUFHLHFCQUFtQyxDQUFDO0FBQ3ZGLG1CQUFXLGFBQWEsWUFBWTtBQUNuQyxjQUFJLFVBQVUsU0FBUztBQUN0Qiw4QkFBa0IsS0FBSyxVQUFVLE9BQU87QUFBQSxVQUN6QyxXQUFXLFVBQVUsbUJBQW1CO0FBQ3ZDLCtCQUFtQixLQUFLLFNBQVM7QUFBQSxVQUNsQztBQUFBLFFBQ0Q7QUFDQSxjQUFNLFNBQVMsUUFBYTtBQUFBLFVBQzNCLFNBQVMsUUFBUSxXQUFXLElBQUksZUFBYSxLQUFLLDJCQUEyQixLQUFLLFdBQVcsRUFBRSxRQUFRLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFBQSxVQUMvRyxrQkFBa0IsU0FBUyxLQUFLLDJCQUEyQix5QkFBeUIsa0JBQWtCLElBQUksUUFBTSxFQUFFLFdBQVcsR0FBRyxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsRUFBRSxDQUFDLElBQUksUUFBUSxRQUFRO0FBQUEsVUFDcEwsbUJBQW1CLFNBQVMsUUFBUSxXQUFXLG1CQUFtQixJQUFJLE9BQUssS0FBSywyQkFBMkIsUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLFFBQVEsUUFBUTtBQUFBLFFBQzNJLENBQUM7QUFBQSxNQUNGO0FBQ0EsY0FBUSxLQUFLO0FBQUEsUUFDWixPQUFPLFNBQVMsV0FBVyxTQUFTO0FBQUEsUUFDcEMsS0FBSyxNQUFNLGtCQUFrQixLQUFLO0FBQUEsUUFDbEMsTUFBTSxLQUFLLDhCQUE4QixVQUFVLEtBQUssS0FBSyw4QkFBOEIsa0JBQWtCLGFBQWEsVUFBVSxJQUFJLENBQUM7QUFBQSxVQUN4SSxPQUFPLFNBQVMsMEJBQTBCLHVCQUF1QjtBQUFBLFVBQ2pFLEtBQUssTUFBTSxrQkFBa0IsSUFBSTtBQUFBLFFBQ2xDLENBQUMsSUFBSTtBQUFBLE1BQ04sQ0FBQztBQUNELGNBQVEsS0FBSyxHQUFHLENBQUM7QUFBQSxRQUNoQixPQUFPLFNBQVMsd0JBQXdCLHNCQUFzQjtBQUFBLFFBQzlELEtBQUssWUFBWTtBQUNoQix5Q0FBK0IsVUFBVTtBQUN6QyxxQkFBVyxhQUFhLFlBQVk7QUFDbkMsaUJBQUssMkJBQTJCLEtBQUssV0FBVyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQUEsVUFDakU7QUFDQSxlQUFLLDJCQUEyQixXQUFXLFdBQVc7QUFBQSxRQUN2RDtBQUFBLE1BQ0QsR0FBRztBQUFBLFFBQ0YsT0FBTztBQUFBLFFBQ1AsYUFBYTtBQUFBLFFBQ2IsS0FBSyxNQUFNO0FBQ1YsbURBQXlDLFVBQVU7QUFBQSxRQUNwRDtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQ0YsVUFBSTtBQUNILG1CQUFXLE1BQU0sS0FBSyxrQ0FBa0MsU0FBUyxNQUFNLFNBQVMsU0FBUyxRQUFRLEtBQUs7QUFBQSxNQUN2RyxTQUFTLE9BQU87QUFDZixZQUFJLENBQUMsb0JBQW9CLEtBQUssR0FBRztBQUNoQyxnQkFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNEO0FBRUEsVUFBSSxVQUFVO0FBQ2IsZUFBTyxrQ0FBa0M7QUFBQSxNQUMxQyxPQUFPO0FBQ04seUNBQWlDLFVBQVU7QUFDM0MsZUFBTyxrQ0FBa0M7QUFBQSxNQUMxQztBQUFBLElBRUQsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLHFDQUFxQyxZQUF5RjtBQUNySSxVQUFNLHNCQUFnQyxDQUFDO0FBQ3ZDLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxXQUFPLHdCQUF3QixPQUFNLFVBQVM7QUFDN0Msa0JBQVksSUFBSSxNQUFNLHdCQUF3QixPQUFLLFlBQVksUUFBUSxDQUFDLENBQUM7QUFDekUsYUFBTyxJQUFJLFFBQW9ELENBQUMsR0FBRyxNQUFNO0FBQ3hFLG9CQUFZLElBQUksS0FBSywyQkFBMkIsbUJBQW1CLENBQUFDLE9BQUs7QUFDdkUsOEJBQW9CLEtBQUtBLEdBQUUsV0FBVyxHQUFHLFlBQVksQ0FBQztBQUN0RCxjQUFJLFdBQVcsTUFBTSxDQUFBQSxPQUFLLG9CQUFvQixTQUFTQSxHQUFFLFdBQVcsR0FBRyxZQUFZLENBQUMsQ0FBQyxHQUFHO0FBQ3ZGLGNBQUUsa0NBQWtDLFFBQVE7QUFBQSxVQUM3QztBQUFBLFFBQ0QsQ0FBQyxDQUFDO0FBQUEsTUFDSCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBV0EsTUFBYyxrQ0FBa0MsVUFBb0IsU0FBaUIsU0FBMEIsUUFBOEIsT0FBNEM7QUFDeEwsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFFBQUk7QUFDSCxZQUFNLDhCQUE4QixZQUFZLElBQUksSUFBSSw0QkFBNEIsVUFBVSxTQUFTLFNBQVMsS0FBSyxtQkFBbUIsQ0FBQztBQUN6SSxrQkFBWSxJQUFJLE1BQU0sS0FBSyxNQUFNLE9BQU8sNEJBQTRCLHVCQUF1QixPQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxLQUFLLHFCQUFxQixDQUFDLENBQUM7QUFDdkksVUFBSSxLQUFLLHFCQUFxQjtBQUM3QixjQUFNLFFBQVEsS0FBSyxxQkFBcUI7QUFDeEMsb0JBQVksSUFBSSxNQUFNLHdCQUF3QixNQUFNLEtBQUsscUJBQXFCLE9BQU8sT0FBTyxDQUFDLENBQUMsQ0FBQztBQUMvRixhQUFLLHFCQUFxQixLQUFLLEVBQUUsNkJBQTZCLFFBQVEsTUFBTSxDQUFDO0FBQzdFLFlBQUksV0FBVyxxQkFBcUIsT0FBTyxVQUFVLEtBQUssb0JBQW9CLFFBQVE7QUFDckYsZUFBSyx3QkFBd0IsR0FBSTtBQUFBLFFBQ2xDO0FBQUEsTUFDRCxPQUFPO0FBQ04sYUFBSyxzQkFBc0IsRUFBRSw2QkFBNkIsUUFBUSxNQUFNLEtBQUssSUFBSSxFQUFFO0FBQ25GLG9DQUE0QixLQUFLO0FBQUEsTUFDbEM7QUFDQSxZQUFNLGlCQUFpQixJQUFJLFFBQVEsT0FBSyxZQUFZLElBQUksTUFBTSxLQUFLLDRCQUE0QixVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLO0FBQ3RILGFBQU8sQ0FBQyw0QkFBNEIsWUFBWTtBQUFBLElBQ2pELFVBQUU7QUFDRCxrQkFBWSxRQUFRO0FBQUEsSUFDckI7QUFBQSxFQUNEO0FBQUEsRUFFUSx1QkFBNkI7QUFDcEMsVUFBTSxRQUFRLEtBQUssZ0NBQWdDO0FBQ25ELFVBQU0sQ0FBQyxnQkFBZ0IsSUFBSSxRQUFRLEtBQUssS0FBSyxxQkFBcUIsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFDO0FBR3RGLFlBQVEsbUJBQW1CLE1BQU0sQ0FBQyxFQUNoQyxLQUFLLE1BQU07QUFDWCxXQUFLLDBCQUEwQjtBQUMvQixVQUFJLGtCQUFrQjtBQUNyQixhQUFLLHNCQUFzQixFQUFFLDZCQUE2QixpQkFBaUIsNkJBQTZCLFFBQVEsaUJBQWlCLFFBQVEsTUFBTSxLQUFLLElBQUksRUFBRTtBQUMxSix5QkFBaUIsNEJBQTRCLEtBQUs7QUFBQSxNQUNuRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0g7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLGtDQUEwQztBQUNqRCxRQUFJLFFBQVEsS0FBSyxxQkFBcUIsU0FBUztBQUMvQyxRQUFJLEtBQUsscUJBQXFCLFFBQVE7QUFDckMsZUFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLHFCQUFxQixRQUFRLEtBQUs7QUFDMUQsWUFBSSxLQUFLLHFCQUFxQixDQUFDLEVBQUUsVUFBVSxLQUFLLHFCQUFxQixLQUFLLEVBQUUsUUFBUTtBQUNuRixrQkFBUTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx3QkFBd0IsY0FBNEI7QUFDM0QsUUFBSSxLQUFLLHVCQUF1QixDQUFDLEtBQUssZ0NBQWdDO0FBQ3JFLFlBQU0sc0JBQXNCLEtBQUs7QUFDakMsV0FBSyxpQ0FBaUMsUUFBUSxLQUFLLElBQUksZ0JBQWdCLEtBQUssSUFBSSxJQUFJLG9CQUFvQixPQUFPLENBQUMsQ0FBQztBQUNqSCxXQUFLLCtCQUErQixLQUFLLE1BQU0sb0JBQW9CLDRCQUE0QixLQUFLLENBQUM7QUFBQSxJQUN0RztBQUFBLEVBQ0Q7QUFBQSxFQUVRLDRCQUFrQztBQUN6QyxTQUFLLGdDQUFnQyxPQUFPO0FBQzVDLFNBQUssaUNBQWlDO0FBQ3RDLFNBQUssc0JBQXNCO0FBQUEsRUFDNUI7QUFBQSxFQUVBLE1BQWMseUJBQXlCLGlCQUE2RDtBQUNuRyxVQUFNLFNBQXVCLENBQUM7QUFDOUIsUUFBSSxnQkFBZ0IsUUFBUTtBQUMzQixZQUFNLG9CQUE4QixDQUFDO0FBQ3JDLFlBQU0scUJBQTRCLENBQUM7QUFDbkMsaUJBQVcsa0JBQWtCLGlCQUFpQjtBQUM3QyxZQUFJLE9BQU8sbUJBQW1CLFVBQVU7QUFDdkMsNEJBQWtCLEtBQUssY0FBYztBQUFBLFFBQ3RDLE9BQU87QUFDTiw2QkFBbUIsS0FBSyxjQUFjO0FBQUEsUUFDdkM7QUFBQSxNQUNEO0FBQ0EsVUFBSSxrQkFBa0IsUUFBUTtBQUM3QixjQUFNLGFBQWEsTUFBTSxLQUFLLDJCQUEyQixjQUFjLGtCQUFrQixJQUFJLFNBQU8sRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLFFBQVEsMEJBQTBCLEdBQUcsa0JBQWtCLElBQUk7QUFDM0ssbUJBQVcsYUFBYSxZQUFZO0FBQ25DLGNBQUksVUFBVSxXQUFXLE1BQU0sS0FBSywyQkFBMkIsV0FBVyxVQUFVLE9BQU8sTUFBTSxNQUFNO0FBQ3RHLG1CQUFPLEtBQUssU0FBUztBQUFBLFVBQ3RCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxVQUFJLG1CQUFtQixRQUFRO0FBQzlCLGNBQU0sYUFBYSxNQUFNLEtBQUssMkJBQTJCLHNCQUFzQixvQkFBb0IsSUFBSTtBQUN2RyxtQkFBVyxhQUFhLFlBQVk7QUFDbkMsY0FBSSxNQUFNLEtBQUssMkJBQTJCLFdBQVcsU0FBUyxNQUFNLE1BQU07QUFDekUsbUJBQU8sS0FBSyxTQUFTO0FBQUEsVUFDdEI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsb0NBQW9DLElBQVk7QUFDdkQsVUFBTSxxQ0FBcUMsQ0FBQyxHQUFHLEtBQUssc0JBQXNCO0FBQzFFLFFBQUksQ0FBQyxtQ0FBbUMsU0FBUyxHQUFHLFlBQVksQ0FBQyxHQUFHO0FBQ25FLHlDQUFtQyxLQUFLLEdBQUcsWUFBWSxDQUFDO0FBQ3hELFdBQUssZUFBZSxNQUFNLGtEQUFrRCxLQUFLLFVBQVUsa0NBQWtDLEdBQUcsYUFBYSxTQUFTLGNBQWMsSUFBSTtBQUFBLElBQ3pLO0FBQUEsRUFDRDtBQUFBLEVBRVEsK0JBQStCLFdBQW9CO0FBQzFELFNBQUsscUJBQXFCLFlBQVksb0NBQW9DLFNBQVM7QUFBQSxFQUNwRjtBQUFBLEVBRVEsV0FBYyxHQUErQztBQUNwRSxTQUFLLFVBQVUsYUFBYSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDN0MsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQTFXYSw2Q0FBTjtBQUFBLEVBaUJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBM0JVOyIsCiAgIm5hbWVzIjogWyJleHRlbnNpb25zIiwgImUiXQp9Cg==
