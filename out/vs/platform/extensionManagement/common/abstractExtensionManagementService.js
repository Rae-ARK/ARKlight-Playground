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
import { distinct, isNonEmptyArray } from "../../../base/common/arrays.js";
import { Barrier, createCancelablePromise } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { CancellationError, getErrorMessage, isCancellationError } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { isWeb } from "../../../base/common/platform.js";
import { URI } from "../../../base/common/uri.js";
import * as nls from "../../../nls.js";
import {
  ExtensionManagementError,
  IExtensionGalleryService,
  InstallOperation,
  StatisticType,
  isTargetPlatformCompatible,
  TargetPlatformToString,
  ExtensionManagementErrorCode,
  EXTENSION_INSTALL_DEP_PACK_CONTEXT,
  ExtensionGalleryError,
  ExtensionGalleryErrorCode,
  EXTENSION_INSTALL_SOURCE_CONTEXT,
  ExtensionSignatureVerificationCode,
  IAllowedExtensionsService
} from "./extensionManagement.js";
import { areSameExtensions, ExtensionKey, getGalleryExtensionId, getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, isMalicious } from "./extensionManagementUtil.js";
import { ExtensionType, isApplicationScopedExtension } from "../../extensions/common/extensions.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { MarkdownString } from "../../../base/common/htmlContent.js";
let CommontExtensionManagementService = class extends Disposable {
  constructor(productService, allowedExtensionsService) {
    super();
    this.productService = productService;
    this.allowedExtensionsService = allowedExtensionsService;
    this.preferPreReleases = this.productService.quality !== "stable";
  }
  async canInstall(extension) {
    const allowedToInstall = this.allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName });
    if (allowedToInstall !== true) {
      return new MarkdownString(nls.localize("not allowed to install", "This extension cannot be installed because {0}", allowedToInstall.value));
    }
    if (!await this.isExtensionPlatformCompatible(extension)) {
      const learnLink = isWeb ? "https://aka.ms/vscode-web-extensions-guide" : "https://aka.ms/vscode-platform-specific-extensions";
      return new MarkdownString(`${nls.localize(
        "incompatible platform",
        "The '{0}' extension is not available in {1} for the {2} platform.",
        extension.displayName ?? extension.identifier.id,
        this.productService.nameLong,
        TargetPlatformToString(await this.getTargetPlatform())
      )} [${nls.localize("learn why", "Learn Why")}](${learnLink})`);
    }
    return true;
  }
  async isExtensionPlatformCompatible(extension) {
    const currentTargetPlatform = await this.getTargetPlatform();
    return extension.allTargetPlatforms.some((targetPlatform) => isTargetPlatformCompatible(targetPlatform, extension.allTargetPlatforms, currentTargetPlatform));
  }
};
CommontExtensionManagementService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IAllowedExtensionsService)
], CommontExtensionManagementService);
let AbstractExtensionManagementService = class extends CommontExtensionManagementService {
  constructor(galleryService, telemetryService, uriIdentityService, logService, productService, allowedExtensionsService, userDataProfilesService) {
    super(productService, allowedExtensionsService);
    this.galleryService = galleryService;
    this.telemetryService = telemetryService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this.userDataProfilesService = userDataProfilesService;
    this.lastReportTimestamp = 0;
    this.installingExtensions = /* @__PURE__ */ new Map();
    this.uninstallingExtensions = /* @__PURE__ */ new Map();
    this._onInstallExtension = this._register(new Emitter());
    this._onDidInstallExtensions = this._register(new Emitter());
    this._onUninstallExtension = this._register(new Emitter());
    this._onDidUninstallExtension = this._register(new Emitter());
    this._onDidUpdateExtensionMetadata = this._register(new Emitter());
    this.participants = [];
    this._register(toDisposable(() => {
      this.installingExtensions.forEach(({ task }) => task.cancel());
      this.uninstallingExtensions.forEach((promise) => promise.cancel());
      this.installingExtensions.clear();
      this.uninstallingExtensions.clear();
    }));
  }
  get onInstallExtension() {
    return this._onInstallExtension.event;
  }
  get onDidInstallExtensions() {
    return this._onDidInstallExtensions.event;
  }
  get onUninstallExtension() {
    return this._onUninstallExtension.event;
  }
  get onDidUninstallExtension() {
    return this._onDidUninstallExtension.event;
  }
  get onDidUpdateExtensionMetadata() {
    return this._onDidUpdateExtensionMetadata.event;
  }
  async installFromGallery(extension, options = {}) {
    try {
      const results = await this.installGalleryExtensions([{ extension, options }]);
      const result = results.find(({ identifier }) => areSameExtensions(identifier, extension.identifier));
      if (result?.local) {
        return result.local;
      }
      if (result?.error) {
        throw result.error;
      }
      const redirectedResult = results[0];
      if (redirectedResult?.local) {
        return redirectedResult.local;
      }
      if (redirectedResult?.error) {
        throw redirectedResult.error;
      }
      throw new ExtensionManagementError(`Unknown error while installing extension ${extension.identifier.id}`, ExtensionManagementErrorCode.Unknown);
    } catch (error) {
      throw toExtensionManagementError(error);
    }
  }
  async installGalleryExtensions(extensions) {
    if (!this.galleryService.isEnabled()) {
      throw new ExtensionManagementError(nls.localize("MarketPlaceDisabled", "Marketplace is not enabled"), ExtensionManagementErrorCode.NotAllowed);
    }
    const results = [];
    const installableExtensions = [];
    await Promise.allSettled(extensions.map(async ({ extension, options }) => {
      try {
        const compatible = await this.checkAndGetCompatibleVersion(extension, !!options?.installGivenVersion, !!options?.installPreReleaseVersion, options.productVersion ?? { version: this.productService.version, date: this.productService.date });
        installableExtensions.push({ ...compatible, options });
      } catch (error) {
        results.push({ identifier: extension.identifier, operation: InstallOperation.Install, source: extension, error, profileLocation: options.profileLocation ?? this.getCurrentExtensionsManifestLocation() });
      }
    }));
    if (installableExtensions.length) {
      results.push(...await this.installExtensions(installableExtensions));
    }
    return results;
  }
  async uninstall(extension, options) {
    this.logService.trace("ExtensionManagementService#uninstall", extension.identifier.id);
    return this.uninstallExtensions([{ extension, options }]);
  }
  async toggleApplicationScope(extension, fromProfileLocation) {
    if (isApplicationScopedExtension(extension.manifest) || extension.isBuiltin) {
      return extension;
    }
    if (extension.isApplicationScoped) {
      let local = await this.updateMetadata(extension, { isApplicationScoped: false }, this.userDataProfilesService.defaultProfile.extensionsResource);
      if (!this.uriIdentityService.extUri.isEqual(fromProfileLocation, this.userDataProfilesService.defaultProfile.extensionsResource)) {
        local = await this.copyExtension(extension, this.userDataProfilesService.defaultProfile.extensionsResource, fromProfileLocation);
      }
      for (const profile of this.userDataProfilesService.profiles) {
        const existing = (await this.getInstalled(ExtensionType.User, profile.extensionsResource)).find((e) => areSameExtensions(e.identifier, extension.identifier));
        if (existing) {
          this._onDidUpdateExtensionMetadata.fire({ local: existing, profileLocation: profile.extensionsResource });
        } else {
          this._onDidUninstallExtension.fire({ identifier: extension.identifier, profileLocation: profile.extensionsResource });
        }
      }
      return local;
    } else {
      const local = this.uriIdentityService.extUri.isEqual(fromProfileLocation, this.userDataProfilesService.defaultProfile.extensionsResource) ? await this.updateMetadata(extension, { isApplicationScoped: true }, this.userDataProfilesService.defaultProfile.extensionsResource) : await this.copyExtension(extension, fromProfileLocation, this.userDataProfilesService.defaultProfile.extensionsResource, { isApplicationScoped: true });
      this._onDidInstallExtensions.fire([{ identifier: local.identifier, operation: InstallOperation.Install, local, profileLocation: this.userDataProfilesService.defaultProfile.extensionsResource, applicationScoped: true }]);
      return local;
    }
  }
  getExtensionsControlManifest() {
    const now = (/* @__PURE__ */ new Date()).getTime();
    if (!this.extensionsControlManifest || now - this.lastReportTimestamp > 1e3 * 60 * 5) {
      this.extensionsControlManifest = this.updateControlCache();
      this.lastReportTimestamp = now;
    }
    return this.extensionsControlManifest;
  }
  registerParticipant(participant) {
    this.participants.push(participant);
  }
  async resetPinnedStateForAllUserExtensions(pinned) {
    try {
      await this.joinAllSettled(this.userDataProfilesService.profiles.map(
        async (profile) => {
          const extensions = await this.getInstalled(ExtensionType.User, profile.extensionsResource);
          await this.joinAllSettled(extensions.map(
            async (extension) => {
              if (extension.pinned !== pinned) {
                await this.updateMetadata(extension, { pinned }, profile.extensionsResource);
              }
            }
          ));
        }
      ));
    } catch (error) {
      this.logService.error("Error while resetting pinned state for all user extensions", getErrorMessage(error));
      throw error;
    }
  }
  async installExtensions(extensions) {
    const installExtensionResultsMap = /* @__PURE__ */ new Map();
    const installingExtensionsMap = /* @__PURE__ */ new Map();
    const alreadyRequestedInstallations = [];
    const getInstallExtensionTaskKey = (extension, profileLocation) => `${ExtensionKey.create(extension).toString()}-${profileLocation.toString()}`;
    const createInstallExtensionTask = (manifest, extension, options, root) => {
      let uninstallTaskToWaitFor;
      if (!URI.isUri(extension)) {
        if (installingExtensionsMap.has(`${extension.identifier.id.toLowerCase()}-${options.profileLocation.toString()}`)) {
          return;
        }
        const existingInstallingExtension = this.installingExtensions.get(getInstallExtensionTaskKey(extension, options.profileLocation));
        if (existingInstallingExtension) {
          if (root && this.canWaitForTask(root, existingInstallingExtension.task)) {
            const identifier = existingInstallingExtension.task.identifier;
            this.logService.info("Waiting for already requested installing extension", identifier.id, root.identifier.id, options.profileLocation.toString());
            existingInstallingExtension.waitingTasks.push(root);
            const waitForInstallation = Event.toPromise(
              Event.filter(this.onDidInstallExtensions, (results2) => results2.some((result) => areSameExtensions(result.identifier, identifier)))
            ).then((results2) => {
              this.logService.info("Finished waiting for already requested installing extension", identifier.id, root.identifier.id, options.profileLocation.toString());
              const result = results2.find((result2) => areSameExtensions(result2.identifier, identifier));
              if (!result?.local) {
                throw new Error(`Extension ${identifier.id} is not installed`);
              }
              return result.local;
            });
            alreadyRequestedInstallations.push(waitForInstallation);
            waitForInstallation.catch(() => {
            });
          }
          return;
        }
        uninstallTaskToWaitFor = this.uninstallingExtensions.get(this.getUninstallExtensionTaskKey(extension.identifier, options.profileLocation));
      }
      const installExtensionTask = this.createInstallExtensionTask(manifest, extension, options);
      const key = `${getGalleryExtensionId(manifest.publisher, manifest.name)}-${options.profileLocation.toString()}`;
      installingExtensionsMap.set(key, { task: installExtensionTask, root, uninstallTaskToWaitFor });
      this._onInstallExtension.fire({ identifier: installExtensionTask.identifier, source: extension, profileLocation: options.profileLocation });
      this.logService.info("Installing extension:", installExtensionTask.identifier.id, options);
      if (!URI.isUri(extension)) {
        this.installingExtensions.set(getInstallExtensionTaskKey(extension, options.profileLocation), { task: installExtensionTask, waitingTasks: [] });
      }
    };
    try {
      const systemExtensions = await this.getInstalled(ExtensionType.System);
      for (const { manifest, extension, options } of extensions) {
        const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
        const isSystemExtension = systemExtensions.some((e) => areSameExtensions(e.identifier, { id: extensionId }));
        const isBuiltin = options.isBuiltin || isSystemExtension;
        const isApplicationScoped = options.isApplicationScoped || isBuiltin || isApplicationScopedExtension(manifest);
        const installExtensionTaskOptions = {
          ...options,
          isBuiltin,
          isApplicationScoped,
          profileLocation: isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : options.profileLocation ?? this.getCurrentExtensionsManifestLocation(),
          productVersion: options.productVersion ?? { version: this.productService.version, date: this.productService.date }
        };
        const existingInstallExtensionTask = !URI.isUri(extension) ? this.installingExtensions.get(getInstallExtensionTaskKey(extension, installExtensionTaskOptions.profileLocation)) : void 0;
        if (existingInstallExtensionTask) {
          const existingTask = existingInstallExtensionTask.task;
          this.logService.info("Extension is already requested to install", existingTask.identifier.id, installExtensionTaskOptions.profileLocation.toString());
          const resultKey = `${existingTask.identifier.id.toLowerCase()}-${installExtensionTaskOptions.profileLocation.toString()}`;
          const waitForInstallation = existingTask.waitUntilTaskIsFinished().then((local) => {
            installExtensionResultsMap.set(resultKey, {
              local,
              identifier: existingTask.identifier,
              operation: existingTask.operation,
              source: existingTask.source,
              context: installExtensionTaskOptions.context,
              profileLocation: installExtensionTaskOptions.profileLocation,
              applicationScoped: local.isApplicationScoped
            });
            return local;
          }, (error) => {
            installExtensionResultsMap.set(resultKey, {
              error: toExtensionManagementError(error),
              identifier: existingTask.identifier,
              operation: existingTask.operation,
              source: existingTask.source,
              context: installExtensionTaskOptions.context,
              profileLocation: installExtensionTaskOptions.profileLocation
            });
            throw error;
          });
          alreadyRequestedInstallations.push(waitForInstallation);
          waitForInstallation.catch(() => {
          });
        } else {
          createInstallExtensionTask(manifest, extension, installExtensionTaskOptions, void 0);
        }
      }
      await Promise.all([...installingExtensionsMap.values()].map(async ({ task }) => {
        if (task.options.donotIncludePackAndDependencies) {
          this.logService.info("Installing the extension without checking dependencies and pack", task.identifier.id);
        } else {
          try {
            let preferPreRelease = this.preferPreReleases;
            if (task.options.installPreReleaseVersion) {
              preferPreRelease = true;
            } else if (!URI.isUri(task.source) && task.source.hasPreReleaseVersion) {
              preferPreRelease = false;
            }
            const installed = await this.getInstalled(void 0, task.options.profileLocation, task.options.productVersion);
            const allDepsAndPackExtensionsToInstall = await this.getAllDepsAndPackExtensions(task.identifier, task.manifest, preferPreRelease, task.options.productVersion, installed);
            const options = { ...task.options, pinned: false, installGivenVersion: false, context: { ...task.options.context, [EXTENSION_INSTALL_DEP_PACK_CONTEXT]: true } };
            for (const { gallery, manifest } of distinct(allDepsAndPackExtensionsToInstall, ({ gallery: gallery2 }) => gallery2.identifier.id)) {
              const existing = installed.find((e) => areSameExtensions(e.identifier, gallery.identifier));
              if (existing && existing.isApplicationScoped === !!options.isApplicationScoped) {
                continue;
              }
              createInstallExtensionTask(manifest, gallery, options, task);
            }
          } catch (error) {
            if (URI.isUri(task.source)) {
              if (isNonEmptyArray(task.manifest.extensionDependencies)) {
                this.logService.warn(`Cannot install dependencies of extension:`, task.identifier.id, error.message);
              }
              if (isNonEmptyArray(task.manifest.extensionPack)) {
                this.logService.warn(`Cannot install packed extensions of extension:`, task.identifier.id, error.message);
              }
            } else {
              this.logService.error("Error while preparing to install dependencies and extension packs of the extension:", task.identifier.id);
              throw error;
            }
          }
        }
      }));
      const otherProfilesToUpdate = await this.getOtherProfilesToUpdateExtension([...installingExtensionsMap.values()].map(({ task }) => task));
      for (const [profileLocation, task] of otherProfilesToUpdate) {
        createInstallExtensionTask(task.manifest, task.source, { ...task.options, profileLocation }, void 0);
      }
      await this.joinAllSettled([...installingExtensionsMap.entries()].map(async ([key, { task, uninstallTaskToWaitFor }]) => {
        const startTime = (/* @__PURE__ */ new Date()).getTime();
        let local;
        try {
          if (uninstallTaskToWaitFor) {
            this.logService.info("Waiting for existing uninstall task to complete before installing", task.identifier.id);
            try {
              await uninstallTaskToWaitFor.waitUntilTaskIsFinished();
              this.logService.info("Finished waiting for uninstall task, proceeding with install", task.identifier.id);
            } catch (error) {
              this.logService.info("Uninstall task failed, proceeding with install anyway", task.identifier.id, getErrorMessage(error));
            }
          }
          local = await task.run();
          await this.joinAllSettled(this.participants.map((participant) => participant.postInstall(local, task.source, task.options, CancellationToken.None)), ExtensionManagementErrorCode.PostInstall);
        } catch (e) {
          const error = toExtensionManagementError(e);
          if (!URI.isUri(task.source)) {
            reportTelemetry(this.telemetryService, task.operation === InstallOperation.Update ? "extensionGallery:update" : "extensionGallery:install", {
              extensionData: getGalleryExtensionTelemetryData(task.source),
              error,
              source: task.options.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT]
            });
          }
          installExtensionResultsMap.set(key, { error, identifier: task.identifier, operation: task.operation, source: task.source, context: task.options.context, profileLocation: task.options.profileLocation, applicationScoped: task.options.isApplicationScoped });
          this.logService.error("Error while installing the extension", task.identifier.id, getErrorMessage(error), task.options.profileLocation.toString());
          throw error;
        }
        if (!URI.isUri(task.source)) {
          const isUpdate = task.operation === InstallOperation.Update;
          const durationSinceUpdate = isUpdate ? void 0 : ((/* @__PURE__ */ new Date()).getTime() - task.source.lastUpdated) / 1e3;
          reportTelemetry(this.telemetryService, isUpdate ? "extensionGallery:update" : "extensionGallery:install", {
            extensionData: getGalleryExtensionTelemetryData(task.source),
            verificationStatus: task.verificationStatus,
            duration: (/* @__PURE__ */ new Date()).getTime() - startTime,
            durationSinceUpdate,
            source: task.options.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT]
          });
        }
        installExtensionResultsMap.set(key, { local, identifier: task.identifier, operation: task.operation, source: task.source, context: task.options.context, profileLocation: task.options.profileLocation, applicationScoped: local.isApplicationScoped });
      }));
      if (alreadyRequestedInstallations.length) {
        await this.joinAllSettled(alreadyRequestedInstallations);
      }
    } catch (error) {
      const getAllDepsAndPacks = (extension, profileLocation, allDepsOrPacks) => {
        const depsOrPacks = [];
        if (extension.manifest.extensionDependencies?.length) {
          depsOrPacks.push(...extension.manifest.extensionDependencies);
        }
        if (extension.manifest.extensionPack?.length) {
          depsOrPacks.push(...extension.manifest.extensionPack);
        }
        for (const id of depsOrPacks) {
          if (allDepsOrPacks.includes(id.toLowerCase())) {
            continue;
          }
          allDepsOrPacks.push(id.toLowerCase());
          const installed = installExtensionResultsMap.get(`${id.toLowerCase()}-${profileLocation.toString()}`);
          if (installed?.local) {
            allDepsOrPacks = getAllDepsAndPacks(installed.local, profileLocation, allDepsOrPacks);
          }
        }
        return allDepsOrPacks;
      };
      const getErrorResult = (task) => ({ identifier: task.identifier, operation: InstallOperation.Install, source: task.source, context: task.options.context, profileLocation: task.options.profileLocation, error });
      const rollbackTasks = [];
      for (const [key, { task, root }] of installingExtensionsMap) {
        const result = installExtensionResultsMap.get(key);
        if (!result) {
          task.cancel();
          installExtensionResultsMap.set(key, getErrorResult(task));
        } else if (result.local && root && !installExtensionResultsMap.get(`${root.identifier.id.toLowerCase()}-${task.options.profileLocation.toString()}`)?.local) {
          rollbackTasks.push(this.createUninstallExtensionTask(result.local, { versionOnly: true, profileLocation: task.options.profileLocation }));
          installExtensionResultsMap.set(key, getErrorResult(task));
        }
      }
      for (const [key, { task }] of installingExtensionsMap) {
        const result = installExtensionResultsMap.get(key);
        if (!result?.local) {
          continue;
        }
        if (task.options.donotIncludePackAndDependencies) {
          continue;
        }
        const depsOrPacks = getAllDepsAndPacks(result.local, task.options.profileLocation, [result.local.identifier.id.toLowerCase()]).slice(1);
        if (depsOrPacks.some((depOrPack) => installingExtensionsMap.has(`${depOrPack.toLowerCase()}-${task.options.profileLocation.toString()}`) && !installExtensionResultsMap.get(`${depOrPack.toLowerCase()}-${task.options.profileLocation.toString()}`)?.local)) {
          rollbackTasks.push(this.createUninstallExtensionTask(result.local, { versionOnly: true, profileLocation: task.options.profileLocation }));
          installExtensionResultsMap.set(key, getErrorResult(task));
        }
      }
      if (rollbackTasks.length) {
        await Promise.allSettled(rollbackTasks.map(async (rollbackTask) => {
          try {
            await rollbackTask.run();
            this.logService.info("Rollback: Uninstalled extension", rollbackTask.extension.identifier.id);
          } catch (error2) {
            this.logService.warn("Rollback: Error while uninstalling extension", rollbackTask.extension.identifier.id, getErrorMessage(error2));
          }
        }));
      }
    } finally {
      for (const { task } of installingExtensionsMap.values()) {
        if (task.source && !URI.isUri(task.source)) {
          this.installingExtensions.delete(getInstallExtensionTaskKey(task.source, task.options.profileLocation));
        }
      }
    }
    const results = [...installExtensionResultsMap.values()];
    for (const result of results) {
      if (result.local) {
        this.logService.info(`Extension installed successfully:`, result.identifier.id, result.profileLocation.toString());
      }
    }
    this._onDidInstallExtensions.fire(results);
    return results;
  }
  async getOtherProfilesToUpdateExtension(tasks) {
    const otherProfilesToUpdate = [];
    const profileExtensionsCache = new ResourceMap();
    for (const task of tasks) {
      if (task.operation !== InstallOperation.Update || task.options.isApplicationScoped || task.options.pinned || task.options.installGivenVersion || URI.isUri(task.source)) {
        continue;
      }
      for (const profile of this.userDataProfilesService.profiles) {
        if (this.uriIdentityService.extUri.isEqual(profile.extensionsResource, task.options.profileLocation)) {
          continue;
        }
        let installedExtensions = profileExtensionsCache.get(profile.extensionsResource);
        if (!installedExtensions) {
          installedExtensions = await this.getInstalled(ExtensionType.User, profile.extensionsResource);
          profileExtensionsCache.set(profile.extensionsResource, installedExtensions);
        }
        const installedExtension = installedExtensions.find((e) => areSameExtensions(e.identifier, task.identifier));
        if (installedExtension && !installedExtension.pinned) {
          otherProfilesToUpdate.push([profile.extensionsResource, task]);
        }
      }
    }
    return otherProfilesToUpdate;
  }
  canWaitForTask(taskToWait, taskToWaitFor) {
    for (const [, { task, waitingTasks }] of this.installingExtensions.entries()) {
      if (task === taskToWait) {
        if (waitingTasks.includes(taskToWaitFor)) {
          return false;
        }
        if (waitingTasks.some((waitingTask) => this.canWaitForTask(waitingTask, taskToWaitFor))) {
          return false;
        }
      }
      if (task === taskToWaitFor && waitingTasks[0] && !this.canWaitForTask(taskToWait, waitingTasks[0])) {
        return false;
      }
    }
    return true;
  }
  async joinAllSettled(promises, errorCode) {
    const results = [];
    const errors = [];
    const promiseResults = await Promise.allSettled(promises);
    for (const r of promiseResults) {
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        errors.push(toExtensionManagementError(r.reason, errorCode));
      }
    }
    if (!errors.length) {
      return results;
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    let error = new ExtensionManagementError("", ExtensionManagementErrorCode.Unknown);
    for (const current of errors) {
      error = new ExtensionManagementError(
        error.message ? `${error.message}, ${current.message}` : current.message,
        current.code !== ExtensionManagementErrorCode.Unknown && current.code !== ExtensionManagementErrorCode.Internal ? current.code : error.code
      );
    }
    throw error;
  }
  async getAllDepsAndPackExtensions(extensionIdentifier, manifest, preferPreRelease, productVersion, installed) {
    if (!this.galleryService.isEnabled()) {
      return [];
    }
    const knownIdentifiers = [];
    const allDependenciesAndPacks = [];
    const collectDependenciesAndPackExtensionsToInstall = async (extensionIdentifier2, manifest2) => {
      knownIdentifiers.push(extensionIdentifier2);
      const dependecies = manifest2.extensionDependencies ? manifest2.extensionDependencies.filter((dep) => !installed.some((e) => areSameExtensions(e.identifier, { id: dep }))) : [];
      const dependenciesAndPackExtensions = [...dependecies];
      if (manifest2.extensionPack) {
        const existing = installed.find((e) => areSameExtensions(e.identifier, extensionIdentifier2));
        for (const extension of manifest2.extensionPack) {
          if (!(existing && existing.manifest.extensionPack && existing.manifest.extensionPack.some((old) => areSameExtensions({ id: old }, { id: extension })))) {
            if (dependenciesAndPackExtensions.every((e) => !areSameExtensions({ id: e }, { id: extension }))) {
              dependenciesAndPackExtensions.push(extension);
            }
          }
        }
      }
      if (dependenciesAndPackExtensions.length) {
        const ids = dependenciesAndPackExtensions.filter((id) => knownIdentifiers.every((galleryIdentifier) => !areSameExtensions(galleryIdentifier, { id })));
        if (ids.length) {
          const galleryExtensions = await this.galleryService.getExtensions(ids.map((id) => ({ id, preRelease: preferPreRelease })), CancellationToken.None);
          for (const galleryExtension of galleryExtensions) {
            if (knownIdentifiers.find((identifier) => areSameExtensions(identifier, galleryExtension.identifier))) {
              continue;
            }
            const isDependency = dependecies.some((id) => areSameExtensions({ id }, galleryExtension.identifier));
            let compatible;
            try {
              compatible = await this.checkAndGetCompatibleVersion(galleryExtension, false, preferPreRelease, productVersion);
            } catch (error) {
              if (!isDependency) {
                this.logService.info("Skipping the packed extension as it cannot be installed", galleryExtension.identifier.id, getErrorMessage(error));
                continue;
              } else {
                throw error;
              }
            }
            allDependenciesAndPacks.push({ gallery: compatible.extension, manifest: compatible.manifest });
            await collectDependenciesAndPackExtensionsToInstall(compatible.extension.identifier, compatible.manifest);
          }
        }
      }
    };
    await collectDependenciesAndPackExtensionsToInstall(extensionIdentifier, manifest);
    return allDependenciesAndPacks;
  }
  async checkAndGetCompatibleVersion(extension, sameVersion, installPreRelease, productVersion) {
    let compatibleExtension;
    const extensionsControlManifest = await this.getExtensionsControlManifest();
    if (isMalicious(extension.identifier, extensionsControlManifest.malicious)) {
      throw new ExtensionManagementError(nls.localize("malicious extension", "Can't install '{0}' extension since it was reported to be problematic.", extension.identifier.id), ExtensionManagementErrorCode.Malicious);
    }
    const deprecationInfo = extensionsControlManifest.deprecated[extension.identifier.id.toLowerCase()];
    if (deprecationInfo?.extension?.autoMigrate) {
      this.logService.info(`The '${extension.identifier.id}' extension is deprecated, fetching the compatible '${deprecationInfo.extension.id}' extension instead.`);
      compatibleExtension = (await this.galleryService.getExtensions([{ id: deprecationInfo.extension.id, preRelease: deprecationInfo.extension.preRelease }], { targetPlatform: await this.getTargetPlatform(), compatible: true, productVersion }, CancellationToken.None))[0];
      if (!compatibleExtension) {
        throw new ExtensionManagementError(nls.localize("notFoundDeprecatedReplacementExtension", "Can't install '{0}' extension since it was deprecated and the replacement extension '{1}' can't be found.", extension.identifier.id, deprecationInfo.extension.id), ExtensionManagementErrorCode.Deprecated);
      }
    } else {
      if (await this.canInstall(extension) !== true) {
        const targetPlatform = await this.getTargetPlatform();
        throw new ExtensionManagementError(nls.localize("incompatible platform", "The '{0}' extension is not available in {1} for the {2} platform.", extension.identifier.id, this.productService.nameLong, TargetPlatformToString(targetPlatform)), ExtensionManagementErrorCode.IncompatibleTargetPlatform);
      }
      compatibleExtension = await this.getCompatibleVersion(extension, sameVersion, installPreRelease, productVersion);
      if (!compatibleExtension) {
        if (!installPreRelease && extension.hasPreReleaseVersion && extension.properties.isPreReleaseVersion && (await this.galleryService.getExtensions([extension.identifier], CancellationToken.None))[0]) {
          throw new ExtensionManagementError(nls.localize("notFoundReleaseExtension", "Can't install release version of '{0}' extension because it has no release version.", extension.displayName ?? extension.identifier.id), ExtensionManagementErrorCode.ReleaseVersionNotFound);
        }
        throw new ExtensionManagementError(nls.localize("notFoundCompatibleDependency", "Can't install '{0}' extension because it is not compatible with the current version of {1} (version {2}).", extension.identifier.id, this.productService.nameLong, this.productService.version), ExtensionManagementErrorCode.Incompatible);
      }
    }
    this.logService.info("Getting Manifest...", compatibleExtension.identifier.id);
    const manifest = await this.galleryService.getManifest(compatibleExtension, CancellationToken.None);
    if (manifest === null) {
      throw new ExtensionManagementError(`Missing manifest for extension ${compatibleExtension.identifier.id}`, ExtensionManagementErrorCode.Invalid);
    }
    if (manifest.version !== compatibleExtension.version) {
      throw new ExtensionManagementError(`Cannot install '${compatibleExtension.identifier.id}' extension because of version mismatch in Marketplace`, ExtensionManagementErrorCode.Invalid);
    }
    return { extension: compatibleExtension, manifest };
  }
  async getCompatibleVersion(extension, sameVersion, includePreRelease, productVersion) {
    const targetPlatform = await this.getTargetPlatform();
    let compatibleExtension = null;
    if (!sameVersion && extension.hasPreReleaseVersion && extension.properties.isPreReleaseVersion !== includePreRelease) {
      compatibleExtension = (await this.galleryService.getExtensions([{ ...extension.identifier, preRelease: includePreRelease }], { targetPlatform, compatible: true, productVersion }, CancellationToken.None))[0] || null;
    }
    if (!compatibleExtension && await this.galleryService.isExtensionCompatible(extension, includePreRelease, targetPlatform, productVersion)) {
      compatibleExtension = extension;
    }
    if (!compatibleExtension) {
      if (sameVersion) {
        compatibleExtension = (await this.galleryService.getExtensions([{ ...extension.identifier, version: extension.version }], { targetPlatform, compatible: true, productVersion }, CancellationToken.None))[0] || null;
      } else {
        compatibleExtension = await this.galleryService.getCompatibleExtension(extension, includePreRelease, targetPlatform, productVersion);
      }
    }
    return compatibleExtension;
  }
  getUninstallExtensionTaskKey(identifier, profileLocation, version) {
    return `${identifier.id.toLowerCase()}${version ? `-${version}` : ""}@${profileLocation.toString()}`;
  }
  async uninstallExtensions(extensions) {
    const getUninstallExtensionTaskKey = (extension, uninstallOptions) => this.getUninstallExtensionTaskKey(extension.identifier, uninstallOptions.profileLocation, uninstallOptions.versionOnly ? extension.manifest.version : void 0);
    const createUninstallExtensionTask = (extension, uninstallOptions) => {
      let installTaskToWaitFor;
      for (const { task: task2 } of this.installingExtensions.values()) {
        if (!(task2.source instanceof URI) && areSameExtensions(task2.identifier, extension.identifier) && this.uriIdentityService.extUri.isEqual(task2.options.profileLocation, uninstallOptions.profileLocation)) {
          installTaskToWaitFor = task2;
          break;
        }
      }
      const task = this.createUninstallExtensionTask(extension, uninstallOptions);
      this.uninstallingExtensions.set(getUninstallExtensionTaskKey(task.extension, uninstallOptions), task);
      this.logService.info("Uninstalling extension from the profile:", `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString());
      this._onUninstallExtension.fire({ identifier: extension.identifier, profileLocation: uninstallOptions.profileLocation, applicationScoped: extension.isApplicationScoped });
      allTasks.push({ task, installTaskToWaitFor });
    };
    const postUninstallExtension = (extension, uninstallOptions, error) => {
      if (error) {
        this.logService.error("Failed to uninstall extension from the profile:", `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString(), error.message);
      } else {
        this.logService.info("Successfully uninstalled extension from the profile", `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString());
      }
      reportTelemetry(this.telemetryService, "extensionGallery:uninstall", { extensionData: getLocalExtensionTelemetryData(extension), error });
      this._onDidUninstallExtension.fire({ identifier: extension.identifier, error: error?.code, profileLocation: uninstallOptions.profileLocation, applicationScoped: extension.isApplicationScoped });
    };
    const allTasks = [];
    const processedTasks = [];
    const alreadyRequestedUninstalls = [];
    const extensionsToRemove = [];
    const installedExtensionsMap = new ResourceMap();
    const getInstalledExtensions = async (profileLocation) => {
      let installed = installedExtensionsMap.get(profileLocation);
      if (!installed) {
        installedExtensionsMap.set(profileLocation, installed = await this.getInstalled(ExtensionType.User, profileLocation));
      }
      return installed;
    };
    for (const { extension, options } of extensions) {
      const uninstallOptions = {
        ...options,
        profileLocation: extension.isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : options?.profileLocation ?? this.getCurrentExtensionsManifestLocation()
      };
      const uninstallExtensionTask = this.uninstallingExtensions.get(getUninstallExtensionTaskKey(extension, uninstallOptions));
      if (uninstallExtensionTask) {
        this.logService.info("Extensions is already requested to uninstall", extension.identifier.id);
        alreadyRequestedUninstalls.push(uninstallExtensionTask.waitUntilTaskIsFinished());
      } else {
        createUninstallExtensionTask(extension, uninstallOptions);
      }
      if (uninstallOptions.remove || extension.isApplicationScoped) {
        if (uninstallOptions.remove) {
          extensionsToRemove.push(extension);
        }
        for (const profile of this.userDataProfilesService.profiles) {
          if (this.uriIdentityService.extUri.isEqual(profile.extensionsResource, uninstallOptions.profileLocation)) {
            continue;
          }
          const installed = await getInstalledExtensions(profile.extensionsResource);
          const profileExtension = installed.find((e) => areSameExtensions(e.identifier, extension.identifier));
          if (profileExtension) {
            const uninstallOptionsWithProfile = { ...uninstallOptions, profileLocation: profile.extensionsResource };
            const uninstallExtensionTask2 = this.uninstallingExtensions.get(getUninstallExtensionTaskKey(profileExtension, uninstallOptionsWithProfile));
            if (uninstallExtensionTask2) {
              this.logService.info("Extensions is already requested to uninstall", profileExtension.identifier.id);
              alreadyRequestedUninstalls.push(uninstallExtensionTask2.waitUntilTaskIsFinished());
            } else {
              createUninstallExtensionTask(profileExtension, uninstallOptionsWithProfile);
            }
          }
        }
      }
    }
    try {
      for (const { task } of allTasks.slice(0)) {
        const installed = await getInstalledExtensions(task.options.profileLocation);
        if (task.options.donotIncludePack) {
          this.logService.info("Uninstalling the extension without including packed extension", `${task.extension.identifier.id}@${task.extension.manifest.version}`);
        } else {
          const packedExtensions = this.getAllPackExtensionsToUninstall(task.extension, installed);
          for (const packedExtension of packedExtensions) {
            if (this.uninstallingExtensions.has(getUninstallExtensionTaskKey(packedExtension, task.options))) {
              this.logService.info("Extensions is already requested to uninstall", packedExtension.identifier.id);
            } else {
              createUninstallExtensionTask(packedExtension, task.options);
            }
          }
        }
        if (task.options.donotCheckDependents) {
          this.logService.info("Uninstalling the extension without checking dependents", `${task.extension.identifier.id}@${task.extension.manifest.version}`);
        } else {
          this.checkForDependents(allTasks.map(({ task: task2 }) => task2.extension), installed, task.extension);
        }
      }
      await this.joinAllSettled(allTasks.map(async ({ task, installTaskToWaitFor }) => {
        try {
          if (installTaskToWaitFor) {
            this.logService.info("Waiting for existing install task to complete before uninstalling", task.extension.identifier.id);
            try {
              await installTaskToWaitFor.waitUntilTaskIsFinished();
              this.logService.info("Finished waiting for install task, proceeding with uninstall", task.extension.identifier.id);
            } catch (error) {
              this.logService.info("Install task failed, proceeding with uninstall anyway", task.extension.identifier.id, getErrorMessage(error));
            }
          }
          await task.run();
          await this.joinAllSettled(this.participants.map((participant) => participant.postUninstall(task.extension, task.options, CancellationToken.None)));
          if (task.extension.identifier.uuid && !isWeb) {
            try {
              await this.galleryService.reportStatistic(task.extension.manifest.publisher, task.extension.manifest.name, task.extension.manifest.version, StatisticType.Uninstall);
            } catch (error) {
            }
          }
        } catch (e) {
          const error = toExtensionManagementError(e);
          postUninstallExtension(task.extension, task.options, error);
          throw error;
        } finally {
          processedTasks.push(task);
        }
      }));
      if (alreadyRequestedUninstalls.length) {
        await this.joinAllSettled(alreadyRequestedUninstalls);
      }
      for (const { task } of allTasks) {
        postUninstallExtension(task.extension, task.options);
      }
      if (extensionsToRemove.length) {
        await this.joinAllSettled(extensionsToRemove.map((extension) => this.deleteExtension(extension)));
      }
    } catch (e) {
      const error = toExtensionManagementError(e);
      for (const { task } of allTasks) {
        try {
          task.cancel();
        } catch (error2) {
        }
        if (!processedTasks.includes(task)) {
          postUninstallExtension(task.extension, task.options, error);
        }
      }
      throw error;
    } finally {
      for (const { task } of allTasks) {
        if (!this.uninstallingExtensions.delete(getUninstallExtensionTaskKey(task.extension, task.options))) {
          this.logService.warn("Uninstallation task is not found in the cache", task.extension.identifier.id);
        }
      }
    }
  }
  checkForDependents(extensionsToUninstall, installed, extensionToUninstall) {
    for (const extension of extensionsToUninstall) {
      const dependents = this.getDependents(extension, installed);
      if (dependents.length) {
        const remainingDependents = dependents.filter((dependent) => !extensionsToUninstall.some((e) => areSameExtensions(e.identifier, dependent.identifier)));
        if (remainingDependents.length) {
          throw new Error(this.getDependentsErrorMessage(extension, remainingDependents, extensionToUninstall));
        }
      }
    }
  }
  getDependentsErrorMessage(dependingExtension, dependents, extensionToUninstall) {
    if (extensionToUninstall === dependingExtension) {
      if (dependents.length === 1) {
        return nls.localize(
          "singleDependentError",
          "Cannot uninstall '{0}' extension. '{1}' extension depends on this.",
          extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name,
          dependents[0].manifest.displayName || dependents[0].manifest.name
        );
      }
      if (dependents.length === 2) {
        return nls.localize(
          "twoDependentsError",
          "Cannot uninstall '{0}' extension. '{1}' and '{2}' extensions depend on this.",
          extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name,
          dependents[0].manifest.displayName || dependents[0].manifest.name,
          dependents[1].manifest.displayName || dependents[1].manifest.name
        );
      }
      return nls.localize(
        "multipleDependentsError",
        "Cannot uninstall '{0}' extension. '{1}', '{2}' and other extension depend on this.",
        extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name,
        dependents[0].manifest.displayName || dependents[0].manifest.name,
        dependents[1].manifest.displayName || dependents[1].manifest.name
      );
    }
    if (dependents.length === 1) {
      return nls.localize(
        "singleIndirectDependentError",
        "Cannot uninstall '{0}' extension . It includes uninstalling '{1}' extension and '{2}' extension depends on this.",
        extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name,
        dependingExtension.manifest.displayName || dependingExtension.manifest.name,
        dependents[0].manifest.displayName || dependents[0].manifest.name
      );
    }
    if (dependents.length === 2) {
      return nls.localize(
        "twoIndirectDependentsError",
        "Cannot uninstall '{0}' extension. It includes uninstalling '{1}' extension and '{2}' and '{3}' extensions depend on this.",
        extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name,
        dependingExtension.manifest.displayName || dependingExtension.manifest.name,
        dependents[0].manifest.displayName || dependents[0].manifest.name,
        dependents[1].manifest.displayName || dependents[1].manifest.name
      );
    }
    return nls.localize(
      "multipleIndirectDependentsError",
      "Cannot uninstall '{0}' extension. It includes uninstalling '{1}' extension and '{2}', '{3}' and other extensions depend on this.",
      extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name,
      dependingExtension.manifest.displayName || dependingExtension.manifest.name,
      dependents[0].manifest.displayName || dependents[0].manifest.name,
      dependents[1].manifest.displayName || dependents[1].manifest.name
    );
  }
  getAllPackExtensionsToUninstall(extension, installed, checked = []) {
    if (checked.indexOf(extension) !== -1) {
      return [];
    }
    if (areSameExtensions(extension.identifier, { id: this.productService.defaultChatAgent.extensionId })) {
      return [];
    }
    checked.push(extension);
    const extensionsPack = extension.manifest.extensionPack ? extension.manifest.extensionPack : [];
    if (extensionsPack.length) {
      const packedExtensions = installed.filter((i) => !i.isBuiltin && extensionsPack.some((id) => areSameExtensions({ id }, i.identifier)));
      const packOfPackedExtensions = [];
      for (const packedExtension of packedExtensions) {
        packOfPackedExtensions.push(...this.getAllPackExtensionsToUninstall(packedExtension, installed, checked));
      }
      return [...packedExtensions, ...packOfPackedExtensions];
    }
    return [];
  }
  getDependents(extension, installed) {
    return installed.filter((e) => e.manifest.extensionDependencies && e.manifest.extensionDependencies.some((id) => areSameExtensions({ id }, extension.identifier)));
  }
  async updateControlCache() {
    try {
      this.logService.trace("ExtensionManagementService.updateControlCache");
      return await this.galleryService.getExtensionsControlManifest();
    } catch (err) {
      this.logService.trace("ExtensionManagementService.refreshControlCache - failed to get extension control manifest", getErrorMessage(err));
      return { malicious: [], deprecated: {}, search: [] };
    }
  }
};
AbstractExtensionManagementService = __decorateClass([
  __decorateParam(0, IExtensionGalleryService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IAllowedExtensionsService),
  __decorateParam(6, IUserDataProfilesService)
], AbstractExtensionManagementService);
function toExtensionManagementError(error, code) {
  if (error instanceof ExtensionManagementError) {
    return error;
  }
  let extensionManagementError;
  if (error instanceof ExtensionGalleryError) {
    extensionManagementError = new ExtensionManagementError(error.message, error.code === ExtensionGalleryErrorCode.DownloadFailedWriting ? ExtensionManagementErrorCode.DownloadFailedWriting : ExtensionManagementErrorCode.Gallery);
  } else {
    extensionManagementError = new ExtensionManagementError(error.message, isCancellationError(error) ? ExtensionManagementErrorCode.Cancelled : code ?? ExtensionManagementErrorCode.Internal);
  }
  extensionManagementError.stack = error.stack;
  return extensionManagementError;
}
function reportTelemetry(telemetryService, eventName, {
  extensionData,
  verificationStatus,
  duration,
  error,
  source,
  durationSinceUpdate
}) {
  telemetryService.publicLog(eventName, {
    ...extensionData,
    source,
    duration,
    durationSinceUpdate,
    success: !error,
    errorcode: error?.code,
    verificationStatus: verificationStatus === ExtensionSignatureVerificationCode.Success ? "Verified" : verificationStatus ?? "Unverified"
  });
}
class AbstractExtensionTask {
  constructor() {
    this.barrier = new Barrier();
  }
  async waitUntilTaskIsFinished() {
    await this.barrier.wait();
    return this.cancellablePromise;
  }
  run() {
    if (!this.cancellablePromise) {
      this.cancellablePromise = createCancelablePromise((token) => this.doRun(token));
    }
    this.barrier.open();
    return this.cancellablePromise;
  }
  cancel() {
    if (!this.cancellablePromise) {
      this.cancellablePromise = createCancelablePromise((token) => {
        return new Promise((c, e) => {
          const disposable = token.onCancellationRequested(() => {
            disposable.dispose();
            e(new CancellationError());
          });
        });
      });
      this.barrier.open();
    }
    this.cancellablePromise.cancel();
  }
}
export {
  AbstractExtensionManagementService,
  AbstractExtensionTask,
  CommontExtensionManagementService,
  toExtensionManagementError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2Fic3RyYWN0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXN0aW5jdCwgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEJhcnJpZXIsIENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBnZXRFcnJvck1lc3NhZ2UsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQge1xuXHRFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IsIElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25NYW5hZ2VtZW50UGFydGljaXBhbnQsIElHYWxsZXJ5RXh0ZW5zaW9uLCBJTG9jYWxFeHRlbnNpb24sIEluc3RhbGxPcGVyYXRpb24sXG5cdElFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0LCBTdGF0aXN0aWNUeXBlLCBpc1RhcmdldFBsYXRmb3JtQ29tcGF0aWJsZSwgVGFyZ2V0UGxhdGZvcm1Ub1N0cmluZywgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZSxcblx0SW5zdGFsbE9wdGlvbnMsIFVuaW5zdGFsbE9wdGlvbnMsIE1ldGFkYXRhLCBJbnN0YWxsRXh0ZW5zaW9uRXZlbnQsIERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50LCBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0LCBVbmluc3RhbGxFeHRlbnNpb25FdmVudCwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJbnN0YWxsRXh0ZW5zaW9uSW5mbywgRVhURU5TSU9OX0lOU1RBTExfREVQX1BBQ0tfQ09OVEVYVCwgRXh0ZW5zaW9uR2FsbGVyeUVycm9yLFxuXHRJUHJvZHVjdFZlcnNpb24sIEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUsXG5cdEVYVEVOU0lPTl9JTlNUQUxMX1NPVVJDRV9DT05URVhULFxuXHREaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSxcblx0VW5pbnN0YWxsRXh0ZW5zaW9uSW5mbyxcblx0RXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZSxcblx0SUFsbG93ZWRFeHRlbnNpb25zU2VydmljZVxufSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMsIEV4dGVuc2lvbktleSwgZ2V0R2FsbGVyeUV4dGVuc2lvbklkLCBnZXRHYWxsZXJ5RXh0ZW5zaW9uVGVsZW1ldHJ5RGF0YSwgZ2V0TG9jYWxFeHRlbnNpb25UZWxlbWV0cnlEYXRhLCBpc01hbGljaW91cyB9IGZyb20gJy4vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSwgSUV4dGVuc2lvbk1hbmlmZXN0LCBpc0FwcGxpY2F0aW9uU2NvcGVkRXh0ZW5zaW9uLCBUYXJnZXRQbGF0Zm9ybSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcblxuZXhwb3J0IHR5cGUgSW5zdGFsbGFibGVFeHRlbnNpb24gPSB7IHJlYWRvbmx5IG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3Q7IGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24gfCBVUkk7IG9wdGlvbnM6IEluc3RhbGxPcHRpb25zIH07XG5cbmV4cG9ydCB0eXBlIEluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyA9IEluc3RhbGxPcHRpb25zICYgeyByZWFkb25seSBwcm9maWxlTG9jYXRpb246IFVSSTsgcmVhZG9ubHkgcHJvZHVjdFZlcnNpb246IElQcm9kdWN0VmVyc2lvbiB9O1xuZXhwb3J0IGludGVyZmFjZSBJSW5zdGFsbEV4dGVuc2lvblRhc2sge1xuXHRyZWFkb25seSBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0O1xuXHRyZWFkb25seSBpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcjtcblx0cmVhZG9ubHkgc291cmNlOiBJR2FsbGVyeUV4dGVuc2lvbiB8IFVSSTtcblx0cmVhZG9ubHkgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uO1xuXHRyZWFkb25seSBvcHRpb25zOiBJbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnM7XG5cdHJlYWRvbmx5IHZlcmlmaWNhdGlvblN0YXR1cz86IEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGU7XG5cdHJ1bigpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj47XG5cdHdhaXRVbnRpbFRhc2tJc0ZpbmlzaGVkKCk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPjtcblx0Y2FuY2VsKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCB0eXBlIFVuaW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zID0gVW5pbnN0YWxsT3B0aW9ucyAmIHsgcmVhZG9ubHkgcHJvZmlsZUxvY2F0aW9uOiBVUkkgfTtcbmV4cG9ydCBpbnRlcmZhY2UgSVVuaW5zdGFsbEV4dGVuc2lvblRhc2sge1xuXHRyZWFkb25seSBvcHRpb25zOiBVbmluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucztcblx0cmVhZG9ubHkgZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb247XG5cdHJ1bigpOiBQcm9taXNlPHZvaWQ+O1xuXHR3YWl0VW50aWxUYXNrSXNGaW5pc2hlZCgpOiBQcm9taXNlPHZvaWQ+O1xuXHRjYW5jZWwoKTogdm9pZDtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIENvbW1vbnRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBwcmVmZXJQcmVSZWxlYXNlczogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5wcmVmZXJQcmVSZWxlYXNlcyA9IHRoaXMucHJvZHVjdFNlcnZpY2UucXVhbGl0eSAhPT0gJ3N0YWJsZSc7XG5cdH1cblxuXHRhc3luYyBjYW5JbnN0YWxsKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24pOiBQcm9taXNlPHRydWUgfCBJTWFya2Rvd25TdHJpbmc+IHtcblx0XHRjb25zdCBhbGxvd2VkVG9JbnN0YWxsID0gdGhpcy5hbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UuaXNBbGxvd2VkKHsgaWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBwdWJsaXNoZXJEaXNwbGF5TmFtZTogZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lIH0pO1xuXHRcdGlmIChhbGxvd2VkVG9JbnN0YWxsICE9PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKG5scy5sb2NhbGl6ZSgnbm90IGFsbG93ZWQgdG8gaW5zdGFsbCcsIFwiVGhpcyBleHRlbnNpb24gY2Fubm90IGJlIGluc3RhbGxlZCBiZWNhdXNlIHswfVwiLCBhbGxvd2VkVG9JbnN0YWxsLnZhbHVlKSk7XG5cdFx0fVxuXG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5pc0V4dGVuc2lvblBsYXRmb3JtQ29tcGF0aWJsZShleHRlbnNpb24pKSkge1xuXHRcdFx0Y29uc3QgbGVhcm5MaW5rID0gaXNXZWIgPyAnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXdlYi1leHRlbnNpb25zLWd1aWRlJyA6ICdodHRwczovL2FrYS5tcy92c2NvZGUtcGxhdGZvcm0tc3BlY2lmaWMtZXh0ZW5zaW9ucyc7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKGAke25scy5sb2NhbGl6ZSgnaW5jb21wYXRpYmxlIHBsYXRmb3JtJywgXCJUaGUgJ3swfScgZXh0ZW5zaW9uIGlzIG5vdCBhdmFpbGFibGUgaW4gezF9IGZvciB0aGUgezJ9IHBsYXRmb3JtLlwiLFxuXHRcdFx0XHRleHRlbnNpb24uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcsIFRhcmdldFBsYXRmb3JtVG9TdHJpbmcoYXdhaXQgdGhpcy5nZXRUYXJnZXRQbGF0Zm9ybSgpKSl9IFske25scy5sb2NhbGl6ZSgnbGVhcm4gd2h5JywgXCJMZWFybiBXaHlcIil9XSgke2xlYXJuTGlua30pYCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgaXNFeHRlbnNpb25QbGF0Zm9ybUNvbXBhdGlibGUoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGN1cnJlbnRUYXJnZXRQbGF0Zm9ybSA9IGF3YWl0IHRoaXMuZ2V0VGFyZ2V0UGxhdGZvcm0oKTtcblx0XHRyZXR1cm4gZXh0ZW5zaW9uLmFsbFRhcmdldFBsYXRmb3Jtcy5zb21lKHRhcmdldFBsYXRmb3JtID0+IGlzVGFyZ2V0UGxhdGZvcm1Db21wYXRpYmxlKHRhcmdldFBsYXRmb3JtLCBleHRlbnNpb24uYWxsVGFyZ2V0UGxhdGZvcm1zLCBjdXJyZW50VGFyZ2V0UGxhdGZvcm0pKTtcblx0fVxuXG5cdGFic3RyYWN0IHJlYWRvbmx5IG9uSW5zdGFsbEV4dGVuc2lvbjogRXZlbnQ8SW5zdGFsbEV4dGVuc2lvbkV2ZW50Pjtcblx0YWJzdHJhY3QgcmVhZG9ubHkgb25EaWRJbnN0YWxsRXh0ZW5zaW9uczogRXZlbnQ8cmVhZG9ubHkgSW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPjtcblx0YWJzdHJhY3QgcmVhZG9ubHkgb25Vbmluc3RhbGxFeHRlbnNpb246IEV2ZW50PFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50Pjtcblx0YWJzdHJhY3QgcmVhZG9ubHkgb25EaWRVbmluc3RhbGxFeHRlbnNpb246IEV2ZW50PERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50Pjtcblx0YWJzdHJhY3QgcmVhZG9ubHkgb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YTogRXZlbnQ8RGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGE+O1xuXHRhYnN0cmFjdCBpbnN0YWxsRnJvbUdhbGxlcnkoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+O1xuXHRhYnN0cmFjdCBpbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoZXh0ZW5zaW9uczogSW5zdGFsbEV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8SW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPjtcblx0YWJzdHJhY3QgdW5pbnN0YWxsKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBvcHRpb25zPzogVW5pbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cdGFic3RyYWN0IHVuaW5zdGFsbEV4dGVuc2lvbnMoZXh0ZW5zaW9uczogVW5pbnN0YWxsRXh0ZW5zaW9uSW5mb1tdKTogUHJvbWlzZTx2b2lkPjtcblx0YWJzdHJhY3QgdG9nZ2xlQXBwbGljYXRpb25TY29wZShleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+O1xuXHRhYnN0cmFjdCBnZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk6IFByb21pc2U8SUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3Q+O1xuXHRhYnN0cmFjdCByZXNldFBpbm5lZFN0YXRlRm9yQWxsVXNlckV4dGVuc2lvbnMocGlubmVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPjtcblx0YWJzdHJhY3QgcmVnaXN0ZXJQYXJ0aWNpcGFudChwYXJpdGljaXBhbnQ6IElFeHRlbnNpb25NYW5hZ2VtZW50UGFydGljaXBhbnQpOiB2b2lkO1xuXHRhYnN0cmFjdCBnZXRUYXJnZXRQbGF0Zm9ybSgpOiBQcm9taXNlPFRhcmdldFBsYXRmb3JtPjtcblx0YWJzdHJhY3QgemlwKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogUHJvbWlzZTxVUkk+O1xuXHRhYnN0cmFjdCBnZXRNYW5pZmVzdCh2c2l4OiBVUkkpOiBQcm9taXNlPElFeHRlbnNpb25NYW5pZmVzdD47XG5cdGFic3RyYWN0IGluc3RhbGwodnNpeDogVVJJLCBvcHRpb25zPzogSW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj47XG5cdGFic3RyYWN0IGluc3RhbGxGcm9tTG9jYXRpb24obG9jYXRpb246IFVSSSwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj47XG5cdGFic3RyYWN0IGluc3RhbGxFeHRlbnNpb25zRnJvbVByb2ZpbGUoZXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT47XG5cdGFic3RyYWN0IGdldEluc3RhbGxlZCh0eXBlPzogRXh0ZW5zaW9uVHlwZSwgcHJvZmlsZUxvY2F0aW9uPzogVVJJLCBwcm9kdWN0VmVyc2lvbj86IElQcm9kdWN0VmVyc2lvbik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uW10+O1xuXHRhYnN0cmFjdCBjb3B5RXh0ZW5zaW9ucyhmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+O1xuXHRhYnN0cmFjdCBkb3dubG9hZChleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24sIGRvbm90VmVyaWZ5U2lnbmF0dXJlOiBib29sZWFuKTogUHJvbWlzZTxVUkk+O1xuXHRhYnN0cmFjdCBjbGVhblVwKCk6IFByb21pc2U8dm9pZD47XG5cdGFic3RyYWN0IHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJTG9jYWxFeHRlbnNpb24sIG1ldGFkYXRhOiBQYXJ0aWFsPE1ldGFkYXRhPiwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj47XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgQ29tbW9udEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGltcGxlbWVudHMgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3Q6IFByb21pc2U8SUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3Q+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGxhc3RSZXBvcnRUaW1lc3RhbXAgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IGluc3RhbGxpbmdFeHRlbnNpb25zID0gbmV3IE1hcDxzdHJpbmcsIHsgdGFzazogSUluc3RhbGxFeHRlbnNpb25UYXNrOyB3YWl0aW5nVGFza3M6IElJbnN0YWxsRXh0ZW5zaW9uVGFza1tdIH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdW5pbnN0YWxsaW5nRXh0ZW5zaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJVW5pbnN0YWxsRXh0ZW5zaW9uVGFzaz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkluc3RhbGxFeHRlbnNpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJbnN0YWxsRXh0ZW5zaW9uRXZlbnQ+KCkpO1xuXHRnZXQgb25JbnN0YWxsRXh0ZW5zaW9uKCkgeyByZXR1cm4gdGhpcy5fb25JbnN0YWxsRXh0ZW5zaW9uLmV2ZW50OyB9XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZEluc3RhbGxFeHRlbnNpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPigpKTtcblx0Z2V0IG9uRGlkSW5zdGFsbEV4dGVuc2lvbnMoKSB7IHJldHVybiB0aGlzLl9vbkRpZEluc3RhbGxFeHRlbnNpb25zLmV2ZW50OyB9XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vblVuaW5zdGFsbEV4dGVuc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50PigpKTtcblx0Z2V0IG9uVW5pbnN0YWxsRXh0ZW5zaW9uKCkgeyByZXR1cm4gdGhpcy5fb25Vbmluc3RhbGxFeHRlbnNpb24uZXZlbnQ7IH1cblxuXHRwcm90ZWN0ZWQgX29uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQ+KCkpO1xuXHRnZXQgb25EaWRVbmluc3RhbGxFeHRlbnNpb24oKSB7IHJldHVybiB0aGlzLl9vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbi5ldmVudDsgfVxuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhPigpKTtcblx0Z2V0IG9uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEoKSB7IHJldHVybiB0aGlzLl9vbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBwYXJ0aWNpcGFudHM6IElFeHRlbnNpb25NYW5hZ2VtZW50UGFydGljaXBhbnRbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlIGFsbG93ZWRFeHRlbnNpb25zU2VydmljZTogSUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihwcm9kdWN0U2VydmljZSwgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5pbnN0YWxsaW5nRXh0ZW5zaW9ucy5mb3JFYWNoKCh7IHRhc2sgfSkgPT4gdGFzay5jYW5jZWwoKSk7XG5cdFx0XHR0aGlzLnVuaW5zdGFsbGluZ0V4dGVuc2lvbnMuZm9yRWFjaChwcm9taXNlID0+IHByb21pc2UuY2FuY2VsKCkpO1xuXHRcdFx0dGhpcy5pbnN0YWxsaW5nRXh0ZW5zaW9ucy5jbGVhcigpO1xuXHRcdFx0dGhpcy51bmluc3RhbGxpbmdFeHRlbnNpb25zLmNsZWFyKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbEZyb21HYWxsZXJ5KGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIG9wdGlvbnM6IEluc3RhbGxPcHRpb25zID0ge30pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5pbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoW3sgZXh0ZW5zaW9uLCBvcHRpb25zIH1dKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc3VsdHMuZmluZCgoeyBpZGVudGlmaWVyIH0pID0+IGFyZVNhbWVFeHRlbnNpb25zKGlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHRpZiAocmVzdWx0Py5sb2NhbCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0LmxvY2FsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdD8uZXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgcmVzdWx0LmVycm9yO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRXh0ZW5zaW9uIG1pZ2h0IGhhdmUgYmVlbiByZWRpcmVjdGVkIGR1ZSB0byBkZXByZWNhdGlvbiAoZS5nLiwgZ2l0aHViLmNvcGlsb3QgLT4gZ2l0aHViLmNvcGlsb3QtY2hhdClcblx0XHRcdC8vIEluIHRoaXMgY2FzZSwgdGhlIHJlc3VsdCB3aWxsIGhhdmUgdGhlIHJlZGlyZWN0ZWQgZXh0ZW5zaW9uJ3MgaWRlbnRpZmllclxuXHRcdFx0Y29uc3QgcmVkaXJlY3RlZFJlc3VsdCA9IHJlc3VsdHNbMF07XG5cdFx0XHRpZiAocmVkaXJlY3RlZFJlc3VsdD8ubG9jYWwpIHtcblx0XHRcdFx0cmV0dXJuIHJlZGlyZWN0ZWRSZXN1bHQubG9jYWw7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVkaXJlY3RlZFJlc3VsdD8uZXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgcmVkaXJlY3RlZFJlc3VsdC5lcnJvcjtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoYFVua25vd24gZXJyb3Igd2hpbGUgaW5zdGFsbGluZyBleHRlbnNpb24gJHtleHRlbnNpb24uaWRlbnRpZmllci5pZH1gLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlVua25vd24pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgaW5zdGFsbEdhbGxlcnlFeHRlbnNpb25zKGV4dGVuc2lvbnM6IEluc3RhbGxFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT4ge1xuXHRcdGlmICghdGhpcy5nYWxsZXJ5U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihubHMubG9jYWxpemUoJ01hcmtldFBsYWNlRGlzYWJsZWQnLCBcIk1hcmtldHBsYWNlIGlzIG5vdCBlbmFibGVkXCIpLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLk5vdEFsbG93ZWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdHM6IEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXSA9IFtdO1xuXHRcdGNvbnN0IGluc3RhbGxhYmxlRXh0ZW5zaW9uczogSW5zdGFsbGFibGVFeHRlbnNpb25bXSA9IFtdO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKGV4dGVuc2lvbnMubWFwKGFzeW5jICh7IGV4dGVuc2lvbiwgb3B0aW9ucyB9KSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb21wYXRpYmxlID0gYXdhaXQgdGhpcy5jaGVja0FuZEdldENvbXBhdGlibGVWZXJzaW9uKGV4dGVuc2lvbiwgISFvcHRpb25zPy5pbnN0YWxsR2l2ZW5WZXJzaW9uLCAhIW9wdGlvbnM/Lmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbiwgb3B0aW9ucy5wcm9kdWN0VmVyc2lvbiA/PyB7IHZlcnNpb246IHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgZGF0ZTogdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlIH0pO1xuXHRcdFx0XHRpbnN0YWxsYWJsZUV4dGVuc2lvbnMucHVzaCh7IC4uLmNvbXBhdGlibGUsIG9wdGlvbnMgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRyZXN1bHRzLnB1c2goeyBpZGVudGlmaWVyOiBleHRlbnNpb24uaWRlbnRpZmllciwgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLkluc3RhbGwsIHNvdXJjZTogZXh0ZW5zaW9uLCBlcnJvciwgcHJvZmlsZUxvY2F0aW9uOiBvcHRpb25zLnByb2ZpbGVMb2NhdGlvbiA/PyB0aGlzLmdldEN1cnJlbnRFeHRlbnNpb25zTWFuaWZlc3RMb2NhdGlvbigpIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmIChpbnN0YWxsYWJsZUV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRyZXN1bHRzLnB1c2goLi4uYXdhaXQgdGhpcy5pbnN0YWxsRXh0ZW5zaW9ucyhpbnN0YWxsYWJsZUV4dGVuc2lvbnMpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0cztcblx0fVxuXG5cdGFzeW5jIHVuaW5zdGFsbChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgb3B0aW9ucz86IFVuaW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlI3VuaW5zdGFsbCcsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRyZXR1cm4gdGhpcy51bmluc3RhbGxFeHRlbnNpb25zKFt7IGV4dGVuc2lvbiwgb3B0aW9ucyB9XSk7XG5cdH1cblxuXHRhc3luYyB0b2dnbGVBcHBsaWNhdGlvblNjb3BlKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGlmIChpc0FwcGxpY2F0aW9uU2NvcGVkRXh0ZW5zaW9uKGV4dGVuc2lvbi5tYW5pZmVzdCkgfHwgZXh0ZW5zaW9uLmlzQnVpbHRpbikge1xuXHRcdFx0cmV0dXJuIGV4dGVuc2lvbjtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uLmlzQXBwbGljYXRpb25TY29wZWQpIHtcblx0XHRcdGxldCBsb2NhbCA9IGF3YWl0IHRoaXMudXBkYXRlTWV0YWRhdGEoZXh0ZW5zaW9uLCB7IGlzQXBwbGljYXRpb25TY29wZWQ6IGZhbHNlIH0sIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdGlmICghdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZnJvbVByb2ZpbGVMb2NhdGlvbiwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpKSB7XG5cdFx0XHRcdGxvY2FsID0gYXdhaXQgdGhpcy5jb3B5RXh0ZW5zaW9uKGV4dGVuc2lvbiwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsIGZyb21Qcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcykge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IChhd2FpdCB0aGlzLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIsIHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKSlcblx0XHRcdFx0XHQuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YS5maXJlKHsgbG9jYWw6IGV4aXN0aW5nLCBwcm9maWxlTG9jYXRpb246IHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uLmZpcmUoeyBpZGVudGlmaWVyOiBleHRlbnNpb24uaWRlbnRpZmllciwgcHJvZmlsZUxvY2F0aW9uOiBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsO1xuXHRcdH1cblxuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgbG9jYWwgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChmcm9tUHJvZmlsZUxvY2F0aW9uLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSlcblx0XHRcdFx0PyBhd2FpdCB0aGlzLnVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbiwgeyBpc0FwcGxpY2F0aW9uU2NvcGVkOiB0cnVlIH0sIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKVxuXHRcdFx0XHQ6IGF3YWl0IHRoaXMuY29weUV4dGVuc2lvbihleHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb24sIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLCB7IGlzQXBwbGljYXRpb25TY29wZWQ6IHRydWUgfSk7XG5cblx0XHRcdHRoaXMuX29uRGlkSW5zdGFsbEV4dGVuc2lvbnMuZmlyZShbeyBpZGVudGlmaWVyOiBsb2NhbC5pZGVudGlmaWVyLCBvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24uSW5zdGFsbCwgbG9jYWwsIHByb2ZpbGVMb2NhdGlvbjogdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsIGFwcGxpY2F0aW9uU2NvcGVkOiB0cnVlIH1dKTtcblx0XHRcdHJldHVybiBsb2NhbDtcblx0XHR9XG5cblx0fVxuXG5cdGdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTogUHJvbWlzZTxJRXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdD4ge1xuXHRcdGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QgfHwgbm93IC0gdGhpcy5sYXN0UmVwb3J0VGltZXN0YW1wID4gMTAwMCAqIDYwICogNSkgeyAvLyA1IG1pbnV0ZSBjYWNoZSBmcmVzaG5lc3Ncblx0XHRcdHRoaXMuZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCA9IHRoaXMudXBkYXRlQ29udHJvbENhY2hlKCk7XG5cdFx0XHR0aGlzLmxhc3RSZXBvcnRUaW1lc3RhbXAgPSBub3c7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdDtcblx0fVxuXG5cdHJlZ2lzdGVyUGFydGljaXBhbnQocGFydGljaXBhbnQ6IElFeHRlbnNpb25NYW5hZ2VtZW50UGFydGljaXBhbnQpOiB2b2lkIHtcblx0XHR0aGlzLnBhcnRpY2lwYW50cy5wdXNoKHBhcnRpY2lwYW50KTtcblx0fVxuXG5cdGFzeW5jIHJlc2V0UGlubmVkU3RhdGVGb3JBbGxVc2VyRXh0ZW5zaW9ucyhwaW5uZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5qb2luQWxsU2V0dGxlZCh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLm1hcChcblx0XHRcdFx0YXN5bmMgcHJvZmlsZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZ2V0SW5zdGFsbGVkKEV4dGVuc2lvblR5cGUuVXNlciwgcHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuam9pbkFsbFNldHRsZWQoZXh0ZW5zaW9ucy5tYXAoXG5cdFx0XHRcdFx0XHRhc3luYyBleHRlbnNpb24gPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uLnBpbm5lZCAhPT0gcGlubmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVNZXRhZGF0YShleHRlbnNpb24sIHsgcGlubmVkIH0sIHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9KSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXJyb3Igd2hpbGUgcmVzZXR0aW5nIHBpbm5lZCBzdGF0ZSBmb3IgYWxsIHVzZXIgZXh0ZW5zaW9ucycsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGluc3RhbGxFeHRlbnNpb25zKGV4dGVuc2lvbnM6IEluc3RhbGxhYmxlRXh0ZW5zaW9uW10pOiBQcm9taXNlPEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT4ge1xuXHRcdGNvbnN0IGluc3RhbGxFeHRlbnNpb25SZXN1bHRzTWFwID0gbmV3IE1hcDxzdHJpbmcsIEluc3RhbGxFeHRlbnNpb25SZXN1bHQgJiB7IHByb2ZpbGVMb2NhdGlvbjogVVJJIH0+KCk7XG5cdFx0Y29uc3QgaW5zdGFsbGluZ0V4dGVuc2lvbnNNYXAgPSBuZXcgTWFwPHN0cmluZywgeyB0YXNrOiBJSW5zdGFsbEV4dGVuc2lvblRhc2s7IHJvb3Q6IElJbnN0YWxsRXh0ZW5zaW9uVGFzayB8IHVuZGVmaW5lZDsgdW5pbnN0YWxsVGFza1RvV2FpdEZvcj86IElVbmluc3RhbGxFeHRlbnNpb25UYXNrIH0+KCk7XG5cdFx0Y29uc3QgYWxyZWFkeVJlcXVlc3RlZEluc3RhbGxhdGlvbnM6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPltdID0gW107XG5cblx0XHRjb25zdCBnZXRJbnN0YWxsRXh0ZW5zaW9uVGFza0tleSA9IChleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBwcm9maWxlTG9jYXRpb246IFVSSSkgPT4gYCR7RXh0ZW5zaW9uS2V5LmNyZWF0ZShleHRlbnNpb24pLnRvU3RyaW5nKCl9LSR7cHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCl9YDtcblx0XHRjb25zdCBjcmVhdGVJbnN0YWxsRXh0ZW5zaW9uVGFzayA9IChtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LCBleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uIHwgVVJJLCBvcHRpb25zOiBJbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMsIHJvb3Q6IElJbnN0YWxsRXh0ZW5zaW9uVGFzayB8IHVuZGVmaW5lZCk6IHZvaWQgPT4ge1xuXHRcdFx0bGV0IHVuaW5zdGFsbFRhc2tUb1dhaXRGb3I7XG5cdFx0XHRpZiAoIVVSSS5pc1VyaShleHRlbnNpb24pKSB7XG5cdFx0XHRcdGlmIChpbnN0YWxsaW5nRXh0ZW5zaW9uc01hcC5oYXMoYCR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKX0tJHtvcHRpb25zLnByb2ZpbGVMb2NhdGlvbi50b1N0cmluZygpfWApKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nSW5zdGFsbGluZ0V4dGVuc2lvbiA9IHRoaXMuaW5zdGFsbGluZ0V4dGVuc2lvbnMuZ2V0KGdldEluc3RhbGxFeHRlbnNpb25UYXNrS2V5KGV4dGVuc2lvbiwgb3B0aW9ucy5wcm9maWxlTG9jYXRpb24pKTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nSW5zdGFsbGluZ0V4dGVuc2lvbikge1xuXHRcdFx0XHRcdGlmIChyb290ICYmIHRoaXMuY2FuV2FpdEZvclRhc2socm9vdCwgZXhpc3RpbmdJbnN0YWxsaW5nRXh0ZW5zaW9uLnRhc2spKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpZGVudGlmaWVyID0gZXhpc3RpbmdJbnN0YWxsaW5nRXh0ZW5zaW9uLnRhc2suaWRlbnRpZmllcjtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdXYWl0aW5nIGZvciBhbHJlYWR5IHJlcXVlc3RlZCBpbnN0YWxsaW5nIGV4dGVuc2lvbicsIGlkZW50aWZpZXIuaWQsIHJvb3QuaWRlbnRpZmllci5pZCwgb3B0aW9ucy5wcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHRleGlzdGluZ0luc3RhbGxpbmdFeHRlbnNpb24ud2FpdGluZ1Rhc2tzLnB1c2gocm9vdCk7XG5cdFx0XHRcdFx0XHQvLyBhZGQgcHJvbWlzZSB0aGF0IHdhaXRzIHVudGlsIHRoZSBleHRlbnNpb24gaXMgY29tcGxldGVseSBpbnN0YWxsZWQsIGllLiwgb25EaWRJbnN0YWxsRXh0ZW5zaW9ucyBldmVudCBpcyB0cmlnZ2VyZWQgZm9yIHRoaXMgZXh0ZW5zaW9uXG5cdFx0XHRcdFx0XHRjb25zdCB3YWl0Rm9ySW5zdGFsbGF0aW9uID0gRXZlbnQudG9Qcm9taXNlKFxuXHRcdFx0XHRcdFx0XHRFdmVudC5maWx0ZXIodGhpcy5vbkRpZEluc3RhbGxFeHRlbnNpb25zLCByZXN1bHRzID0+IHJlc3VsdHMuc29tZShyZXN1bHQgPT4gYXJlU2FtZUV4dGVuc2lvbnMocmVzdWx0LmlkZW50aWZpZXIsIGlkZW50aWZpZXIpKSlcblx0XHRcdFx0XHRcdCkudGhlbihyZXN1bHRzID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0ZpbmlzaGVkIHdhaXRpbmcgZm9yIGFscmVhZHkgcmVxdWVzdGVkIGluc3RhbGxpbmcgZXh0ZW5zaW9uJywgaWRlbnRpZmllci5pZCwgcm9vdC5pZGVudGlmaWVyLmlkLCBvcHRpb25zLnByb2ZpbGVMb2NhdGlvbi50b1N0cmluZygpKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzdWx0cy5maW5kKHJlc3VsdCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhyZXN1bHQuaWRlbnRpZmllciwgaWRlbnRpZmllcikpO1xuXHRcdFx0XHRcdFx0XHRpZiAoIXJlc3VsdD8ubG9jYWwpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBFeHRlbnNpb24gZmFpbGVkIHRvIGluc3RhbGxcblx0XHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEV4dGVuc2lvbiAke2lkZW50aWZpZXIuaWR9IGlzIG5vdCBpbnN0YWxsZWRgKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0LmxvY2FsO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRhbHJlYWR5UmVxdWVzdGVkSW5zdGFsbGF0aW9ucy5wdXNoKHdhaXRGb3JJbnN0YWxsYXRpb24pO1xuXHRcdFx0XHRcdFx0Ly8gQXR0YWNoIGEgbm8tb3AgcmVqZWN0aW9uIGhhbmRsZXIgdG8gcHJldmVudCBhbiB1bmhhbmRsZWRSZWplY3Rpb24gaWYgdGhlXG5cdFx0XHRcdFx0XHQvLyBvdXRlciB0cnkgdGhyb3dzIGJlZm9yZSBgYWxyZWFkeVJlcXVlc3RlZEluc3RhbGxhdGlvbnNgIGlzIGF3YWl0ZWQgYmVsb3cuXG5cdFx0XHRcdFx0XHQvLyBUaGUgb3JpZ2luYWwgcHJvbWlzZSBpcyBzdGlsbCBvYnNlcnZlZCB2aWEgYGpvaW5BbGxTZXR0bGVkYCBvbiB0aGUgaGFwcHkgcGF0aCxcblx0XHRcdFx0XHRcdC8vIGFuZCB0aGUgdW5kZXJseWluZyBpbnN0YWxsIGZhaWx1cmUgaXMgYWxyZWFkeSByZXBvcnRlZCBieSB0aGUgcHJpbWFyeSB0YXNrLlxuXHRcdFx0XHRcdFx0d2FpdEZvckluc3RhbGxhdGlvbi5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dW5pbnN0YWxsVGFza1RvV2FpdEZvciA9IHRoaXMudW5pbnN0YWxsaW5nRXh0ZW5zaW9ucy5nZXQodGhpcy5nZXRVbmluc3RhbGxFeHRlbnNpb25UYXNrS2V5KGV4dGVuc2lvbi5pZGVudGlmaWVyLCBvcHRpb25zLnByb2ZpbGVMb2NhdGlvbikpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5zdGFsbEV4dGVuc2lvblRhc2sgPSB0aGlzLmNyZWF0ZUluc3RhbGxFeHRlbnNpb25UYXNrKG1hbmlmZXN0LCBleHRlbnNpb24sIG9wdGlvbnMpO1xuXHRcdFx0Y29uc3Qga2V5ID0gYCR7Z2V0R2FsbGVyeUV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSl9LSR7b3B0aW9ucy5wcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKX1gO1xuXHRcdFx0aW5zdGFsbGluZ0V4dGVuc2lvbnNNYXAuc2V0KGtleSwgeyB0YXNrOiBpbnN0YWxsRXh0ZW5zaW9uVGFzaywgcm9vdCwgdW5pbnN0YWxsVGFza1RvV2FpdEZvciB9KTtcblx0XHRcdHRoaXMuX29uSW5zdGFsbEV4dGVuc2lvbi5maXJlKHsgaWRlbnRpZmllcjogaW5zdGFsbEV4dGVuc2lvblRhc2suaWRlbnRpZmllciwgc291cmNlOiBleHRlbnNpb24sIHByb2ZpbGVMb2NhdGlvbjogb3B0aW9ucy5wcm9maWxlTG9jYXRpb24gfSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnSW5zdGFsbGluZyBleHRlbnNpb246JywgaW5zdGFsbEV4dGVuc2lvblRhc2suaWRlbnRpZmllci5pZCwgb3B0aW9ucyk7XG5cdFx0XHQvLyBvbmx5IGNhY2hlIGdhbGxlcnkgZXh0ZW5zaW9ucyB0YXNrc1xuXHRcdFx0aWYgKCFVUkkuaXNVcmkoZXh0ZW5zaW9uKSkge1xuXHRcdFx0XHR0aGlzLmluc3RhbGxpbmdFeHRlbnNpb25zLnNldChnZXRJbnN0YWxsRXh0ZW5zaW9uVGFza0tleShleHRlbnNpb24sIG9wdGlvbnMucHJvZmlsZUxvY2F0aW9uKSwgeyB0YXNrOiBpbnN0YWxsRXh0ZW5zaW9uVGFzaywgd2FpdGluZ1Rhc2tzOiBbXSB9KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN5c3RlbUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlN5c3RlbSk7XG5cdFx0XHQvLyBTdGFydCBpbnN0YWxsaW5nIGV4dGVuc2lvbnNcblx0XHRcdGZvciAoY29uc3QgeyBtYW5pZmVzdCwgZXh0ZW5zaW9uLCBvcHRpb25zIH0gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpO1xuXHRcdFx0XHRjb25zdCBpc1N5c3RlbUV4dGVuc2lvbiA9IHN5c3RlbUV4dGVuc2lvbnMuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZDogZXh0ZW5zaW9uSWQgfSkpO1xuXHRcdFx0XHRjb25zdCBpc0J1aWx0aW4gPSBvcHRpb25zLmlzQnVpbHRpbiB8fCBpc1N5c3RlbUV4dGVuc2lvbjtcblx0XHRcdFx0Y29uc3QgaXNBcHBsaWNhdGlvblNjb3BlZCA9IG9wdGlvbnMuaXNBcHBsaWNhdGlvblNjb3BlZCB8fCBpc0J1aWx0aW4gfHwgaXNBcHBsaWNhdGlvblNjb3BlZEV4dGVuc2lvbihtYW5pZmVzdCk7XG5cdFx0XHRcdGNvbnN0IGluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9uczogSW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zID0ge1xuXHRcdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdFx0aXNCdWlsdGluLFxuXHRcdFx0XHRcdGlzQXBwbGljYXRpb25TY29wZWQsXG5cdFx0XHRcdFx0cHJvZmlsZUxvY2F0aW9uOiBpc0FwcGxpY2F0aW9uU2NvcGVkID8gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UgOiBvcHRpb25zLnByb2ZpbGVMb2NhdGlvbiA/PyB0aGlzLmdldEN1cnJlbnRFeHRlbnNpb25zTWFuaWZlc3RMb2NhdGlvbigpLFxuXHRcdFx0XHRcdHByb2R1Y3RWZXJzaW9uOiBvcHRpb25zLnByb2R1Y3RWZXJzaW9uID8/IHsgdmVyc2lvbjogdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLCBkYXRlOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRhdGUgfVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nSW5zdGFsbEV4dGVuc2lvblRhc2sgPSAhVVJJLmlzVXJpKGV4dGVuc2lvbikgPyB0aGlzLmluc3RhbGxpbmdFeHRlbnNpb25zLmdldChnZXRJbnN0YWxsRXh0ZW5zaW9uVGFza0tleShleHRlbnNpb24sIGluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucy5wcm9maWxlTG9jYXRpb24pKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGV4aXN0aW5nSW5zdGFsbEV4dGVuc2lvblRhc2spIHtcblx0XHRcdFx0XHRjb25zdCBleGlzdGluZ1Rhc2sgPSBleGlzdGluZ0luc3RhbGxFeHRlbnNpb25UYXNrLnRhc2s7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0V4dGVuc2lvbiBpcyBhbHJlYWR5IHJlcXVlc3RlZCB0byBpbnN0YWxsJywgZXhpc3RpbmdUYXNrLmlkZW50aWZpZXIuaWQsIGluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucy5wcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0Ly8gUmVjb3JkIHRoZSByZXN1bHQgb2YgdGhlIGluLWZsaWdodCBpbnN0YWxsIGludG8gb3VyIHJlc3VsdHMgbWFwIHNvIGNhbGxlcnNcblx0XHRcdFx0XHQvLyAoZS5nLiBpbnN0YWxsRnJvbUdhbGxlcnkpIGNhbiBmaW5kIHRoZSBhY3R1YWwgbG9jYWwgZXh0ZW5zaW9uIG9yIHJlYWwgZXJyb3Jcblx0XHRcdFx0XHQvLyBpbnN0ZWFkIG9mIGZhbGxpbmcgdGhyb3VnaCB0byBhIGdlbmVyaWMgXCJVbmtub3duIGVycm9yXCIuXG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0S2V5ID0gYCR7ZXhpc3RpbmdUYXNrLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKX0tJHtpbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMucHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCl9YDtcblx0XHRcdFx0XHRjb25zdCB3YWl0Rm9ySW5zdGFsbGF0aW9uID0gZXhpc3RpbmdUYXNrLndhaXRVbnRpbFRhc2tJc0ZpbmlzaGVkKCkudGhlbihsb2NhbCA9PiB7XG5cdFx0XHRcdFx0XHRpbnN0YWxsRXh0ZW5zaW9uUmVzdWx0c01hcC5zZXQocmVzdWx0S2V5LCB7XG5cdFx0XHRcdFx0XHRcdGxvY2FsLFxuXHRcdFx0XHRcdFx0XHRpZGVudGlmaWVyOiBleGlzdGluZ1Rhc2suaWRlbnRpZmllcixcblx0XHRcdFx0XHRcdFx0b3BlcmF0aW9uOiBleGlzdGluZ1Rhc2sub3BlcmF0aW9uLFxuXHRcdFx0XHRcdFx0XHRzb3VyY2U6IGV4aXN0aW5nVGFzay5zb3VyY2UsXG5cdFx0XHRcdFx0XHRcdGNvbnRleHQ6IGluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucy5jb250ZXh0LFxuXHRcdFx0XHRcdFx0XHRwcm9maWxlTG9jYXRpb246IGluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucy5wcm9maWxlTG9jYXRpb24sXG5cdFx0XHRcdFx0XHRcdGFwcGxpY2F0aW9uU2NvcGVkOiBsb2NhbC5pc0FwcGxpY2F0aW9uU2NvcGVkLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWw7XG5cdFx0XHRcdFx0fSwgZXJyb3IgPT4ge1xuXHRcdFx0XHRcdFx0aW5zdGFsbEV4dGVuc2lvblJlc3VsdHNNYXAuc2V0KHJlc3VsdEtleSwge1xuXHRcdFx0XHRcdFx0XHRlcnJvcjogdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZXJyb3IpLFxuXHRcdFx0XHRcdFx0XHRpZGVudGlmaWVyOiBleGlzdGluZ1Rhc2suaWRlbnRpZmllcixcblx0XHRcdFx0XHRcdFx0b3BlcmF0aW9uOiBleGlzdGluZ1Rhc2sub3BlcmF0aW9uLFxuXHRcdFx0XHRcdFx0XHRzb3VyY2U6IGV4aXN0aW5nVGFzay5zb3VyY2UsXG5cdFx0XHRcdFx0XHRcdGNvbnRleHQ6IGluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucy5jb250ZXh0LFxuXHRcdFx0XHRcdFx0XHRwcm9maWxlTG9jYXRpb246IGluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucy5wcm9maWxlTG9jYXRpb24sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGFscmVhZHlSZXF1ZXN0ZWRJbnN0YWxsYXRpb25zLnB1c2god2FpdEZvckluc3RhbGxhdGlvbik7XG5cdFx0XHRcdFx0Ly8gQXR0YWNoIGEgbm8tb3AgcmVqZWN0aW9uIGhhbmRsZXIgdG8gcHJldmVudCBhbiB1bmhhbmRsZWRSZWplY3Rpb24gaWYgdGhlXG5cdFx0XHRcdFx0Ly8gb3V0ZXIgdHJ5IHRocm93cyBiZWZvcmUgYGFscmVhZHlSZXF1ZXN0ZWRJbnN0YWxsYXRpb25zYCBpcyBhd2FpdGVkIGJlbG93LlxuXHRcdFx0XHRcdC8vIFRoZSBvcmlnaW5hbCBwcm9taXNlIGlzIHN0aWxsIG9ic2VydmVkIHZpYSBgam9pbkFsbFNldHRsZWRgIG9uIHRoZSBoYXBweSBwYXRoLlxuXHRcdFx0XHRcdHdhaXRGb3JJbnN0YWxsYXRpb24uY2F0Y2goKCkgPT4geyB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjcmVhdGVJbnN0YWxsRXh0ZW5zaW9uVGFzayhtYW5pZmVzdCwgZXh0ZW5zaW9uLCBpbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gY29sbGVjdCBhbmQgc3RhcnQgaW5zdGFsbGluZyBhbGwgZGVwZW5kZW5jaWVzIGFuZCBwYWNrIGV4dGVuc2lvbnNcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbnN0YWxsaW5nRXh0ZW5zaW9uc01hcC52YWx1ZXMoKV0ubWFwKGFzeW5jICh7IHRhc2sgfSkgPT4ge1xuXHRcdFx0XHRpZiAodGFzay5vcHRpb25zLmRvbm90SW5jbHVkZVBhY2tBbmREZXBlbmRlbmNpZXMpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnSW5zdGFsbGluZyB0aGUgZXh0ZW5zaW9uIHdpdGhvdXQgY2hlY2tpbmcgZGVwZW5kZW5jaWVzIGFuZCBwYWNrJywgdGFzay5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0bGV0IHByZWZlclByZVJlbGVhc2UgPSB0aGlzLnByZWZlclByZVJlbGVhc2VzO1xuXHRcdFx0XHRcdFx0aWYgKHRhc2sub3B0aW9ucy5pbnN0YWxsUHJlUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdFx0XHRcdFx0cHJlZmVyUHJlUmVsZWFzZSA9IHRydWU7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKCFVUkkuaXNVcmkodGFzay5zb3VyY2UpICYmIHRhc2suc291cmNlLmhhc1ByZVJlbGVhc2VWZXJzaW9uKSB7XG5cdFx0XHRcdFx0XHRcdC8vIEV4cGxpY2l0bHkgYXNrZWQgdG8gaW5zdGFsbCB0aGUgcmVsZWFzZSB2ZXJzaW9uXG5cdFx0XHRcdFx0XHRcdHByZWZlclByZVJlbGVhc2UgPSBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IHRoaXMuZ2V0SW5zdGFsbGVkKHVuZGVmaW5lZCwgdGFzay5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbiwgdGFzay5vcHRpb25zLnByb2R1Y3RWZXJzaW9uKTtcblx0XHRcdFx0XHRcdGNvbnN0IGFsbERlcHNBbmRQYWNrRXh0ZW5zaW9uc1RvSW5zdGFsbCA9IGF3YWl0IHRoaXMuZ2V0QWxsRGVwc0FuZFBhY2tFeHRlbnNpb25zKHRhc2suaWRlbnRpZmllciwgdGFzay5tYW5pZmVzdCwgcHJlZmVyUHJlUmVsZWFzZSwgdGFzay5vcHRpb25zLnByb2R1Y3RWZXJzaW9uLCBpbnN0YWxsZWQpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgb3B0aW9uczogSW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zID0geyAuLi50YXNrLm9wdGlvbnMsIHBpbm5lZDogZmFsc2UsIGluc3RhbGxHaXZlblZlcnNpb246IGZhbHNlLCBjb250ZXh0OiB7IC4uLnRhc2sub3B0aW9ucy5jb250ZXh0LCBbRVhURU5TSU9OX0lOU1RBTExfREVQX1BBQ0tfQ09OVEVYVF06IHRydWUgfSB9O1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCB7IGdhbGxlcnksIG1hbmlmZXN0IH0gb2YgZGlzdGluY3QoYWxsRGVwc0FuZFBhY2tFeHRlbnNpb25zVG9JbnN0YWxsLCAoeyBnYWxsZXJ5IH0pID0+IGdhbGxlcnkuaWRlbnRpZmllci5pZCkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBpbnN0YWxsZWQuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZ2FsbGVyeS5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdFx0XHRcdC8vIFNraXAgaWYgdGhlIGV4dGVuc2lvbiBpcyBhbHJlYWR5IGluc3RhbGxlZCBhbmQgaGFzIHRoZSBzYW1lIGFwcGxpY2F0aW9uIHNjb3BlXG5cdFx0XHRcdFx0XHRcdGlmIChleGlzdGluZyAmJiBleGlzdGluZy5pc0FwcGxpY2F0aW9uU2NvcGVkID09PSAhIW9wdGlvbnMuaXNBcHBsaWNhdGlvblNjb3BlZCkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNyZWF0ZUluc3RhbGxFeHRlbnNpb25UYXNrKG1hbmlmZXN0LCBnYWxsZXJ5LCBvcHRpb25zLCB0YXNrKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0Ly8gSW5zdGFsbGluZyB0aHJvdWdoIFZTSVhcblx0XHRcdFx0XHRcdGlmIChVUkkuaXNVcmkodGFzay5zb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdC8vIElnbm9yZSBpbnN0YWxsaW5nIGRlcGVuZGVuY2llcyBhbmQgcGFja3Ncblx0XHRcdFx0XHRcdFx0aWYgKGlzTm9uRW1wdHlBcnJheSh0YXNrLm1hbmlmZXN0LmV4dGVuc2lvbkRlcGVuZGVuY2llcykpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgQ2Fubm90IGluc3RhbGwgZGVwZW5kZW5jaWVzIG9mIGV4dGVuc2lvbjpgLCB0YXNrLmlkZW50aWZpZXIuaWQsIGVycm9yLm1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmIChpc05vbkVtcHR5QXJyYXkodGFzay5tYW5pZmVzdC5leHRlbnNpb25QYWNrKSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBDYW5ub3QgaW5zdGFsbCBwYWNrZWQgZXh0ZW5zaW9ucyBvZiBleHRlbnNpb246YCwgdGFzay5pZGVudGlmaWVyLmlkLCBlcnJvci5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFcnJvciB3aGlsZSBwcmVwYXJpbmcgdG8gaW5zdGFsbCBkZXBlbmRlbmNpZXMgYW5kIGV4dGVuc2lvbiBwYWNrcyBvZiB0aGUgZXh0ZW5zaW9uOicsIHRhc2suaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBvdGhlclByb2ZpbGVzVG9VcGRhdGUgPSBhd2FpdCB0aGlzLmdldE90aGVyUHJvZmlsZXNUb1VwZGF0ZUV4dGVuc2lvbihbLi4uaW5zdGFsbGluZ0V4dGVuc2lvbnNNYXAudmFsdWVzKCldLm1hcCgoeyB0YXNrIH0pID0+IHRhc2spKTtcblx0XHRcdGZvciAoY29uc3QgW3Byb2ZpbGVMb2NhdGlvbiwgdGFza10gb2Ygb3RoZXJQcm9maWxlc1RvVXBkYXRlKSB7XG5cdFx0XHRcdGNyZWF0ZUluc3RhbGxFeHRlbnNpb25UYXNrKHRhc2subWFuaWZlc3QsIHRhc2suc291cmNlLCB7IC4uLnRhc2sub3B0aW9ucywgcHJvZmlsZUxvY2F0aW9uIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEluc3RhbGwgZXh0ZW5zaW9ucyBpbiBwYXJhbGxlbCBhbmQgd2FpdCB1bnRpbCBhbGwgZXh0ZW5zaW9ucyBhcmUgaW5zdGFsbGVkIC8gZmFpbGVkXG5cdFx0XHRhd2FpdCB0aGlzLmpvaW5BbGxTZXR0bGVkKFsuLi5pbnN0YWxsaW5nRXh0ZW5zaW9uc01hcC5lbnRyaWVzKCldLm1hcChhc3luYyAoW2tleSwgeyB0YXNrLCB1bmluc3RhbGxUYXNrVG9XYWl0Rm9yIH1dKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0VGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXHRcdFx0XHRsZXQgbG9jYWw6IElMb2NhbEV4dGVuc2lvbjtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAodW5pbnN0YWxsVGFza1RvV2FpdEZvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1dhaXRpbmcgZm9yIGV4aXN0aW5nIHVuaW5zdGFsbCB0YXNrIHRvIGNvbXBsZXRlIGJlZm9yZSBpbnN0YWxsaW5nJywgdGFzay5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHVuaW5zdGFsbFRhc2tUb1dhaXRGb3Iud2FpdFVudGlsVGFza0lzRmluaXNoZWQoKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0ZpbmlzaGVkIHdhaXRpbmcgZm9yIHVuaW5zdGFsbCB0YXNrLCBwcm9jZWVkaW5nIHdpdGggaW5zdGFsbCcsIHRhc2suaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnVW5pbnN0YWxsIHRhc2sgZmFpbGVkLCBwcm9jZWVkaW5nIHdpdGggaW5zdGFsbCBhbnl3YXknLCB0YXNrLmlkZW50aWZpZXIuaWQsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGxvY2FsID0gYXdhaXQgdGFzay5ydW4oKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmpvaW5BbGxTZXR0bGVkKHRoaXMucGFydGljaXBhbnRzLm1hcChwYXJ0aWNpcGFudCA9PiBwYXJ0aWNpcGFudC5wb3N0SW5zdGFsbChsb2NhbCwgdGFzay5zb3VyY2UsIHRhc2sub3B0aW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlBvc3RJbnN0YWxsKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGNvbnN0IGVycm9yID0gdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZSk7XG5cdFx0XHRcdFx0aWYgKCFVUkkuaXNVcmkodGFzay5zb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRyZXBvcnRUZWxlbWV0cnkodGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCB0YXNrLm9wZXJhdGlvbiA9PT0gSW5zdGFsbE9wZXJhdGlvbi5VcGRhdGUgPyAnZXh0ZW5zaW9uR2FsbGVyeTp1cGRhdGUnIDogJ2V4dGVuc2lvbkdhbGxlcnk6aW5zdGFsbCcsIHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uRGF0YTogZ2V0R2FsbGVyeUV4dGVuc2lvblRlbGVtZXRyeURhdGEodGFzay5zb3VyY2UpLFxuXHRcdFx0XHRcdFx0XHRlcnJvcixcblx0XHRcdFx0XHRcdFx0c291cmNlOiB0YXNrLm9wdGlvbnMuY29udGV4dD8uW0VYVEVOU0lPTl9JTlNUQUxMX1NPVVJDRV9DT05URVhUXSBhcyBzdHJpbmcgfCB1bmRlZmluZWRcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpbnN0YWxsRXh0ZW5zaW9uUmVzdWx0c01hcC5zZXQoa2V5LCB7IGVycm9yLCBpZGVudGlmaWVyOiB0YXNrLmlkZW50aWZpZXIsIG9wZXJhdGlvbjogdGFzay5vcGVyYXRpb24sIHNvdXJjZTogdGFzay5zb3VyY2UsIGNvbnRleHQ6IHRhc2sub3B0aW9ucy5jb250ZXh0LCBwcm9maWxlTG9jYXRpb246IHRhc2sub3B0aW9ucy5wcm9maWxlTG9jYXRpb24sIGFwcGxpY2F0aW9uU2NvcGVkOiB0YXNrLm9wdGlvbnMuaXNBcHBsaWNhdGlvblNjb3BlZCB9KTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Vycm9yIHdoaWxlIGluc3RhbGxpbmcgdGhlIGV4dGVuc2lvbicsIHRhc2suaWRlbnRpZmllci5pZCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSwgdGFzay5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbi50b1N0cmluZygpKTtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIVVSSS5pc1VyaSh0YXNrLnNvdXJjZSkpIHtcblx0XHRcdFx0XHRjb25zdCBpc1VwZGF0ZSA9IHRhc2sub3BlcmF0aW9uID09PSBJbnN0YWxsT3BlcmF0aW9uLlVwZGF0ZTtcblx0XHRcdFx0XHRjb25zdCBkdXJhdGlvblNpbmNlVXBkYXRlID0gaXNVcGRhdGUgPyB1bmRlZmluZWQgOiAobmV3IERhdGUoKS5nZXRUaW1lKCkgLSB0YXNrLnNvdXJjZS5sYXN0VXBkYXRlZCkgLyAxMDAwO1xuXHRcdFx0XHRcdHJlcG9ydFRlbGVtZXRyeSh0aGlzLnRlbGVtZXRyeVNlcnZpY2UsIGlzVXBkYXRlID8gJ2V4dGVuc2lvbkdhbGxlcnk6dXBkYXRlJyA6ICdleHRlbnNpb25HYWxsZXJ5Omluc3RhbGwnLCB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb25EYXRhOiBnZXRHYWxsZXJ5RXh0ZW5zaW9uVGVsZW1ldHJ5RGF0YSh0YXNrLnNvdXJjZSksXG5cdFx0XHRcdFx0XHR2ZXJpZmljYXRpb25TdGF0dXM6IHRhc2sudmVyaWZpY2F0aW9uU3RhdHVzLFxuXHRcdFx0XHRcdFx0ZHVyYXRpb246IG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gc3RhcnRUaW1lLFxuXHRcdFx0XHRcdFx0ZHVyYXRpb25TaW5jZVVwZGF0ZSxcblx0XHRcdFx0XHRcdHNvdXJjZTogdGFzay5vcHRpb25zLmNvbnRleHQ/LltFWFRFTlNJT05fSU5TVEFMTF9TT1VSQ0VfQ09OVEVYVF0gYXMgc3RyaW5nIHwgdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aW5zdGFsbEV4dGVuc2lvblJlc3VsdHNNYXAuc2V0KGtleSwgeyBsb2NhbCwgaWRlbnRpZmllcjogdGFzay5pZGVudGlmaWVyLCBvcGVyYXRpb246IHRhc2sub3BlcmF0aW9uLCBzb3VyY2U6IHRhc2suc291cmNlLCBjb250ZXh0OiB0YXNrLm9wdGlvbnMuY29udGV4dCwgcHJvZmlsZUxvY2F0aW9uOiB0YXNrLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLCBhcHBsaWNhdGlvblNjb3BlZDogbG9jYWwuaXNBcHBsaWNhdGlvblNjb3BlZCB9KTtcblx0XHRcdH0pKTtcblxuXHRcdFx0aWYgKGFscmVhZHlSZXF1ZXN0ZWRJbnN0YWxsYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmpvaW5BbGxTZXR0bGVkKGFscmVhZHlSZXF1ZXN0ZWRJbnN0YWxsYXRpb25zKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc3QgZ2V0QWxsRGVwc0FuZFBhY2tzID0gKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBwcm9maWxlTG9jYXRpb246IFVSSSwgYWxsRGVwc09yUGFja3M6IHN0cmluZ1tdKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRlcHNPclBhY2tzID0gW107XG5cdFx0XHRcdGlmIChleHRlbnNpb24ubWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRkZXBzT3JQYWNrcy5wdXNoKC4uLmV4dGVuc2lvbi5tYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb24ubWFuaWZlc3QuZXh0ZW5zaW9uUGFjaz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZGVwc09yUGFja3MucHVzaCguLi5leHRlbnNpb24ubWFuaWZlc3QuZXh0ZW5zaW9uUGFjayk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBpZCBvZiBkZXBzT3JQYWNrcykge1xuXHRcdFx0XHRcdGlmIChhbGxEZXBzT3JQYWNrcy5pbmNsdWRlcyhpZC50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGFsbERlcHNPclBhY2tzLnB1c2goaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRcdFx0Y29uc3QgaW5zdGFsbGVkID0gaW5zdGFsbEV4dGVuc2lvblJlc3VsdHNNYXAuZ2V0KGAke2lkLnRvTG93ZXJDYXNlKCl9LSR7cHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdFx0aWYgKGluc3RhbGxlZD8ubG9jYWwpIHtcblx0XHRcdFx0XHRcdGFsbERlcHNPclBhY2tzID0gZ2V0QWxsRGVwc0FuZFBhY2tzKGluc3RhbGxlZC5sb2NhbCwgcHJvZmlsZUxvY2F0aW9uLCBhbGxEZXBzT3JQYWNrcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhbGxEZXBzT3JQYWNrcztcblx0XHRcdH07XG5cdFx0XHRjb25zdCBnZXRFcnJvclJlc3VsdCA9ICh0YXNrOiBJSW5zdGFsbEV4dGVuc2lvblRhc2spID0+ICh7IGlkZW50aWZpZXI6IHRhc2suaWRlbnRpZmllciwgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLkluc3RhbGwsIHNvdXJjZTogdGFzay5zb3VyY2UsIGNvbnRleHQ6IHRhc2sub3B0aW9ucy5jb250ZXh0LCBwcm9maWxlTG9jYXRpb246IHRhc2sub3B0aW9ucy5wcm9maWxlTG9jYXRpb24sIGVycm9yIH0pO1xuXG5cdFx0XHRjb25zdCByb2xsYmFja1Rhc2tzOiBJVW5pbnN0YWxsRXh0ZW5zaW9uVGFza1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHsgdGFzaywgcm9vdCB9XSBvZiBpbnN0YWxsaW5nRXh0ZW5zaW9uc01hcCkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBpbnN0YWxsRXh0ZW5zaW9uUmVzdWx0c01hcC5nZXQoa2V5KTtcblx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHR0YXNrLmNhbmNlbCgpO1xuXHRcdFx0XHRcdGluc3RhbGxFeHRlbnNpb25SZXN1bHRzTWFwLnNldChrZXksIGdldEVycm9yUmVzdWx0KHRhc2spKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBJZiB0aGUgZXh0ZW5zaW9uIGlzIGluc3RhbGxlZCBieSBhIHJvb3QgdGFzayBhbmQgdGhlIHJvb3QgdGFzayBpcyBmYWlsZWQsIHRoZW4gdW5pbnN0YWxsIHRoZSBleHRlbnNpb25cblx0XHRcdFx0ZWxzZSBpZiAocmVzdWx0LmxvY2FsICYmIHJvb3QgJiYgIWluc3RhbGxFeHRlbnNpb25SZXN1bHRzTWFwLmdldChgJHtyb290LmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKX0tJHt0YXNrLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCl9YCk/LmxvY2FsKSB7XG5cdFx0XHRcdFx0cm9sbGJhY2tUYXNrcy5wdXNoKHRoaXMuY3JlYXRlVW5pbnN0YWxsRXh0ZW5zaW9uVGFzayhyZXN1bHQubG9jYWwsIHsgdmVyc2lvbk9ubHk6IHRydWUsIHByb2ZpbGVMb2NhdGlvbjogdGFzay5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbiB9KSk7XG5cdFx0XHRcdFx0aW5zdGFsbEV4dGVuc2lvblJlc3VsdHNNYXAuc2V0KGtleSwgZ2V0RXJyb3JSZXN1bHQodGFzaykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHsgdGFzayB9XSBvZiBpbnN0YWxsaW5nRXh0ZW5zaW9uc01hcCkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBpbnN0YWxsRXh0ZW5zaW9uUmVzdWx0c01hcC5nZXQoa2V5KTtcblx0XHRcdFx0aWYgKCFyZXN1bHQ/LmxvY2FsKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRhc2sub3B0aW9ucy5kb25vdEluY2x1ZGVQYWNrQW5kRGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZGVwc09yUGFja3MgPSBnZXRBbGxEZXBzQW5kUGFja3MocmVzdWx0LmxvY2FsLCB0YXNrLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLCBbcmVzdWx0LmxvY2FsLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKV0pLnNsaWNlKDEpO1xuXHRcdFx0XHRpZiAoZGVwc09yUGFja3Muc29tZShkZXBPclBhY2sgPT4gaW5zdGFsbGluZ0V4dGVuc2lvbnNNYXAuaGFzKGAke2RlcE9yUGFjay50b0xvd2VyQ2FzZSgpfS0ke3Rhc2sub3B0aW9ucy5wcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKX1gKSAmJiAhaW5zdGFsbEV4dGVuc2lvblJlc3VsdHNNYXAuZ2V0KGAke2RlcE9yUGFjay50b0xvd2VyQ2FzZSgpfS0ke3Rhc2sub3B0aW9ucy5wcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKX1gKT8ubG9jYWwpKSB7XG5cdFx0XHRcdFx0cm9sbGJhY2tUYXNrcy5wdXNoKHRoaXMuY3JlYXRlVW5pbnN0YWxsRXh0ZW5zaW9uVGFzayhyZXN1bHQubG9jYWwsIHsgdmVyc2lvbk9ubHk6IHRydWUsIHByb2ZpbGVMb2NhdGlvbjogdGFzay5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbiB9KSk7XG5cdFx0XHRcdFx0aW5zdGFsbEV4dGVuc2lvblJlc3VsdHNNYXAuc2V0KGtleSwgZ2V0RXJyb3JSZXN1bHQodGFzaykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyb2xsYmFja1Rhc2tzLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQocm9sbGJhY2tUYXNrcy5tYXAoYXN5bmMgcm9sbGJhY2tUYXNrID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgcm9sbGJhY2tUYXNrLnJ1bigpO1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1JvbGxiYWNrOiBVbmluc3RhbGxlZCBleHRlbnNpb24nLCByb2xsYmFja1Rhc2suZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignUm9sbGJhY2s6IEVycm9yIHdoaWxlIHVuaW5zdGFsbGluZyBleHRlbnNpb24nLCByb2xsYmFja1Rhc2suZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBGaW5hbGx5LCByZW1vdmUgYWxsIHRoZSB0YXNrcyBmcm9tIHRoZSBjYWNoZVxuXHRcdFx0Zm9yIChjb25zdCB7IHRhc2sgfSBvZiBpbnN0YWxsaW5nRXh0ZW5zaW9uc01hcC52YWx1ZXMoKSkge1xuXHRcdFx0XHRpZiAodGFzay5zb3VyY2UgJiYgIVVSSS5pc1VyaSh0YXNrLnNvdXJjZSkpIHtcblx0XHRcdFx0XHR0aGlzLmluc3RhbGxpbmdFeHRlbnNpb25zLmRlbGV0ZShnZXRJbnN0YWxsRXh0ZW5zaW9uVGFza0tleSh0YXNrLnNvdXJjZSwgdGFzay5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdHMgPSBbLi4uaW5zdGFsbEV4dGVuc2lvblJlc3VsdHNNYXAudmFsdWVzKCldO1xuXHRcdGZvciAoY29uc3QgcmVzdWx0IG9mIHJlc3VsdHMpIHtcblx0XHRcdGlmIChyZXN1bHQubG9jYWwpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEV4dGVuc2lvbiBpbnN0YWxsZWQgc3VjY2Vzc2Z1bGx5OmAsIHJlc3VsdC5pZGVudGlmaWVyLmlkLCByZXN1bHQucHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9vbkRpZEluc3RhbGxFeHRlbnNpb25zLmZpcmUocmVzdWx0cyk7XG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE90aGVyUHJvZmlsZXNUb1VwZGF0ZUV4dGVuc2lvbih0YXNrczogSUluc3RhbGxFeHRlbnNpb25UYXNrW10pOiBQcm9taXNlPFtVUkksIElJbnN0YWxsRXh0ZW5zaW9uVGFza11bXT4ge1xuXHRcdGNvbnN0IG90aGVyUHJvZmlsZXNUb1VwZGF0ZTogW1VSSSwgSUluc3RhbGxFeHRlbnNpb25UYXNrXVtdID0gW107XG5cdFx0Y29uc3QgcHJvZmlsZUV4dGVuc2lvbnNDYWNoZSA9IG5ldyBSZXNvdXJjZU1hcDxJTG9jYWxFeHRlbnNpb25bXT4oKTtcblx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRcdGlmICh0YXNrLm9wZXJhdGlvbiAhPT0gSW5zdGFsbE9wZXJhdGlvbi5VcGRhdGVcblx0XHRcdFx0fHwgdGFzay5vcHRpb25zLmlzQXBwbGljYXRpb25TY29wZWRcblx0XHRcdFx0fHwgdGFzay5vcHRpb25zLnBpbm5lZFxuXHRcdFx0XHR8fCB0YXNrLm9wdGlvbnMuaW5zdGFsbEdpdmVuVmVyc2lvblxuXHRcdFx0XHR8fCBVUkkuaXNVcmkodGFzay5zb3VyY2UpXG5cdFx0XHQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcykge1xuXHRcdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsIHRhc2sub3B0aW9ucy5wcm9maWxlTG9jYXRpb24pKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGV0IGluc3RhbGxlZEV4dGVuc2lvbnMgPSBwcm9maWxlRXh0ZW5zaW9uc0NhY2hlLmdldChwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHRcdGlmICghaW5zdGFsbGVkRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdGluc3RhbGxlZEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIsIHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdFx0XHRwcm9maWxlRXh0ZW5zaW9uc0NhY2hlLnNldChwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSwgaW5zdGFsbGVkRXh0ZW5zaW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9uID0gaW5zdGFsbGVkRXh0ZW5zaW9ucy5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB0YXNrLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0aWYgKGluc3RhbGxlZEV4dGVuc2lvbiAmJiAhaW5zdGFsbGVkRXh0ZW5zaW9uLnBpbm5lZCkge1xuXHRcdFx0XHRcdG90aGVyUHJvZmlsZXNUb1VwZGF0ZS5wdXNoKFtwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSwgdGFza10pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdGhlclByb2ZpbGVzVG9VcGRhdGU7XG5cdH1cblxuXHRwcml2YXRlIGNhbldhaXRGb3JUYXNrKHRhc2tUb1dhaXQ6IElJbnN0YWxsRXh0ZW5zaW9uVGFzaywgdGFza1RvV2FpdEZvcjogSUluc3RhbGxFeHRlbnNpb25UYXNrKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBbLCB7IHRhc2ssIHdhaXRpbmdUYXNrcyB9XSBvZiB0aGlzLmluc3RhbGxpbmdFeHRlbnNpb25zLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKHRhc2sgPT09IHRhc2tUb1dhaXQpIHtcblx0XHRcdFx0Ly8gQ2Fubm90IGJlIHdhaXRlZCwgSWYgdGFza1RvV2FpdEZvciBpcyB3YWl0aW5nIGZvciB0YXNrVG9XYWl0XG5cdFx0XHRcdGlmICh3YWl0aW5nVGFza3MuaW5jbHVkZXModGFza1RvV2FpdEZvcikpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQ2Fubm90IGJlIHdhaXRlZCwgSWYgdGFza1RvV2FpdEZvciBpcyB3YWl0aW5nIGZvciB0YXNrcyB3YWl0aW5nIGZvciB0YXNrVG9XYWl0XG5cdFx0XHRcdGlmICh3YWl0aW5nVGFza3Muc29tZSh3YWl0aW5nVGFzayA9PiB0aGlzLmNhbldhaXRGb3JUYXNrKHdhaXRpbmdUYXNrLCB0YXNrVG9XYWl0Rm9yKSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIENhbm5vdCBiZSB3YWl0ZWQsIGlmIHRoZSB0YXNrVG9XYWl0IGNhbm5vdCBiZSB3YWl0ZWQgZm9yIHRoZSB0YXNrIGNyZWF0ZWQgdGhlIHRhc2tUb1dhaXRGb3Jcblx0XHRcdC8vIEJlY2F1c2UsIHRoZSB0YXNrIHdhaXRzIGZvciB0aGUgdGFza3MgaXQgY3JlYXRlZFxuXHRcdFx0aWYgKHRhc2sgPT09IHRhc2tUb1dhaXRGb3IgJiYgd2FpdGluZ1Rhc2tzWzBdICYmICF0aGlzLmNhbldhaXRGb3JUYXNrKHRhc2tUb1dhaXQsIHdhaXRpbmdUYXNrc1swXSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgam9pbkFsbFNldHRsZWQ8VD4ocHJvbWlzZXM6IFByb21pc2U8VD5bXSwgZXJyb3JDb2RlPzogRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZSk6IFByb21pc2U8VFtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0czogVFtdID0gW107XG5cdFx0Y29uc3QgZXJyb3JzOiBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JbXSA9IFtdO1xuXHRcdGNvbnN0IHByb21pc2VSZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHByb21pc2VzKTtcblx0XHRmb3IgKGNvbnN0IHIgb2YgcHJvbWlzZVJlc3VsdHMpIHtcblx0XHRcdGlmIChyLnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcpIHtcblx0XHRcdFx0cmVzdWx0cy5wdXNoKHIudmFsdWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXJyb3JzLnB1c2godG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3Ioci5yZWFzb24sIGVycm9yQ29kZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghZXJyb3JzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdHM7XG5cdFx0fVxuXG5cdFx0Ly8gVGhyb3cgaWYgdGhlcmUgYXJlIGVycm9yc1xuXHRcdGlmIChlcnJvcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHR0aHJvdyBlcnJvcnNbMF07XG5cdFx0fVxuXG5cdFx0bGV0IGVycm9yID0gbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcignJywgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5Vbmtub3duKTtcblx0XHRmb3IgKGNvbnN0IGN1cnJlbnQgb2YgZXJyb3JzKSB7XG5cdFx0XHRlcnJvciA9IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoXG5cdFx0XHRcdGVycm9yLm1lc3NhZ2UgPyBgJHtlcnJvci5tZXNzYWdlfSwgJHtjdXJyZW50Lm1lc3NhZ2V9YCA6IGN1cnJlbnQubWVzc2FnZSxcblx0XHRcdFx0Y3VycmVudC5jb2RlICE9PSBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlVua25vd24gJiYgY3VycmVudC5jb2RlICE9PSBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkludGVybmFsID8gY3VycmVudC5jb2RlIDogZXJyb3IuY29kZVxuXHRcdFx0KTtcblx0XHR9XG5cdFx0dGhyb3cgZXJyb3I7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEFsbERlcHNBbmRQYWNrRXh0ZW5zaW9ucyhleHRlbnNpb25JZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllciwgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCwgcHJlZmVyUHJlUmVsZWFzZTogYm9vbGVhbiwgcHJvZHVjdFZlcnNpb246IElQcm9kdWN0VmVyc2lvbiwgaW5zdGFsbGVkOiBJTG9jYWxFeHRlbnNpb25bXSk6IFByb21pc2U8eyBnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbjsgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCB9W10+IHtcblx0XHRpZiAoIXRoaXMuZ2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBrbm93bklkZW50aWZpZXJzOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdID0gW107XG5cblx0XHRjb25zdCBhbGxEZXBlbmRlbmNpZXNBbmRQYWNrczogeyBnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbjsgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCB9W10gPSBbXTtcblx0XHRjb25zdCBjb2xsZWN0RGVwZW5kZW5jaWVzQW5kUGFja0V4dGVuc2lvbnNUb0luc3RhbGwgPSBhc3luYyAoZXh0ZW5zaW9uSWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIsIG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdGtub3duSWRlbnRpZmllcnMucHVzaChleHRlbnNpb25JZGVudGlmaWVyKTtcblx0XHRcdGNvbnN0IGRlcGVuZGVjaWVzOiBzdHJpbmdbXSA9IG1hbmlmZXN0LmV4dGVuc2lvbkRlcGVuZGVuY2llcyA/IG1hbmlmZXN0LmV4dGVuc2lvbkRlcGVuZGVuY2llcy5maWx0ZXIoZGVwID0+ICFpbnN0YWxsZWQuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZDogZGVwIH0pKSkgOiBbXTtcblx0XHRcdGNvbnN0IGRlcGVuZGVuY2llc0FuZFBhY2tFeHRlbnNpb25zID0gWy4uLmRlcGVuZGVjaWVzXTtcblx0XHRcdGlmIChtYW5pZmVzdC5leHRlbnNpb25QYWNrKSB7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gaW5zdGFsbGVkLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbklkZW50aWZpZXIpKTtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgbWFuaWZlc3QuZXh0ZW5zaW9uUGFjaykge1xuXHRcdFx0XHRcdC8vIGFkZCBvbmx5IHRob3NlIGV4dGVuc2lvbnMgd2hpY2ggYXJlIG5ldyBpbiBjdXJyZW50bHkgaW5zdGFsbGVkIGV4dGVuc2lvblxuXHRcdFx0XHRcdGlmICghKGV4aXN0aW5nICYmIGV4aXN0aW5nLm1hbmlmZXN0LmV4dGVuc2lvblBhY2sgJiYgZXhpc3RpbmcubWFuaWZlc3QuZXh0ZW5zaW9uUGFjay5zb21lKG9sZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkOiBvbGQgfSwgeyBpZDogZXh0ZW5zaW9uIH0pKSkpIHtcblx0XHRcdFx0XHRcdGlmIChkZXBlbmRlbmNpZXNBbmRQYWNrRXh0ZW5zaW9ucy5ldmVyeShlID0+ICFhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkOiBlIH0sIHsgaWQ6IGV4dGVuc2lvbiB9KSkpIHtcblx0XHRcdFx0XHRcdFx0ZGVwZW5kZW5jaWVzQW5kUGFja0V4dGVuc2lvbnMucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZGVwZW5kZW5jaWVzQW5kUGFja0V4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGZpbHRlciBvdXQga25vd24gZXh0ZW5zaW9uc1xuXHRcdFx0XHRjb25zdCBpZHMgPSBkZXBlbmRlbmNpZXNBbmRQYWNrRXh0ZW5zaW9ucy5maWx0ZXIoaWQgPT4ga25vd25JZGVudGlmaWVycy5ldmVyeShnYWxsZXJ5SWRlbnRpZmllciA9PiAhYXJlU2FtZUV4dGVuc2lvbnMoZ2FsbGVyeUlkZW50aWZpZXIsIHsgaWQgfSkpKTtcblx0XHRcdFx0aWYgKGlkcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBnYWxsZXJ5RXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhpZHMubWFwKGlkID0+ICh7IGlkLCBwcmVSZWxlYXNlOiBwcmVmZXJQcmVSZWxlYXNlIH0pKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBnYWxsZXJ5RXh0ZW5zaW9uIG9mIGdhbGxlcnlFeHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0XHRpZiAoa25vd25JZGVudGlmaWVycy5maW5kKGlkZW50aWZpZXIgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaWRlbnRpZmllciwgZ2FsbGVyeUV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBpc0RlcGVuZGVuY3kgPSBkZXBlbmRlY2llcy5zb21lKGlkID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQgfSwgZ2FsbGVyeUV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdFx0XHRsZXQgY29tcGF0aWJsZTtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNvbXBhdGlibGUgPSBhd2FpdCB0aGlzLmNoZWNrQW5kR2V0Q29tcGF0aWJsZVZlcnNpb24oZ2FsbGVyeUV4dGVuc2lvbiwgZmFsc2UsIHByZWZlclByZVJlbGVhc2UsIHByb2R1Y3RWZXJzaW9uKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghaXNEZXBlbmRlbmN5KSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1NraXBwaW5nIHRoZSBwYWNrZWQgZXh0ZW5zaW9uIGFzIGl0IGNhbm5vdCBiZSBpbnN0YWxsZWQnLCBnYWxsZXJ5RXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhbGxEZXBlbmRlbmNpZXNBbmRQYWNrcy5wdXNoKHsgZ2FsbGVyeTogY29tcGF0aWJsZS5leHRlbnNpb24sIG1hbmlmZXN0OiBjb21wYXRpYmxlLm1hbmlmZXN0IH0pO1xuXHRcdFx0XHRcdFx0YXdhaXQgY29sbGVjdERlcGVuZGVuY2llc0FuZFBhY2tFeHRlbnNpb25zVG9JbnN0YWxsKGNvbXBhdGlibGUuZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGNvbXBhdGlibGUubWFuaWZlc3QpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRhd2FpdCBjb2xsZWN0RGVwZW5kZW5jaWVzQW5kUGFja0V4dGVuc2lvbnNUb0luc3RhbGwoZXh0ZW5zaW9uSWRlbnRpZmllciwgbWFuaWZlc3QpO1xuXHRcdHJldHVybiBhbGxEZXBlbmRlbmNpZXNBbmRQYWNrcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2hlY2tBbmRHZXRDb21wYXRpYmxlVmVyc2lvbihleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBzYW1lVmVyc2lvbjogYm9vbGVhbiwgaW5zdGFsbFByZVJlbGVhc2U6IGJvb2xlYW4sIHByb2R1Y3RWZXJzaW9uOiBJUHJvZHVjdFZlcnNpb24pOiBQcm9taXNlPHsgZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbjsgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCB9PiB7XG5cdFx0bGV0IGNvbXBhdGlibGVFeHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uIHwgbnVsbDtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTtcblx0XHRpZiAoaXNNYWxpY2lvdXMoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QubWFsaWNpb3VzKSkge1xuXHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihubHMubG9jYWxpemUoJ21hbGljaW91cyBleHRlbnNpb24nLCBcIkNhbid0IGluc3RhbGwgJ3swfScgZXh0ZW5zaW9uIHNpbmNlIGl0IHdhcyByZXBvcnRlZCB0byBiZSBwcm9ibGVtYXRpYy5cIiwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLk1hbGljaW91cyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVwcmVjYXRpb25JbmZvID0gZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdC5kZXByZWNhdGVkW2V4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCldO1xuXHRcdGlmIChkZXByZWNhdGlvbkluZm8/LmV4dGVuc2lvbj8uYXV0b01pZ3JhdGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBUaGUgJyR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9JyBleHRlbnNpb24gaXMgZGVwcmVjYXRlZCwgZmV0Y2hpbmcgdGhlIGNvbXBhdGlibGUgJyR7ZGVwcmVjYXRpb25JbmZvLmV4dGVuc2lvbi5pZH0nIGV4dGVuc2lvbiBpbnN0ZWFkLmApO1xuXHRcdFx0Y29tcGF0aWJsZUV4dGVuc2lvbiA9IChhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6IGRlcHJlY2F0aW9uSW5mby5leHRlbnNpb24uaWQsIHByZVJlbGVhc2U6IGRlcHJlY2F0aW9uSW5mby5leHRlbnNpb24ucHJlUmVsZWFzZSB9XSwgeyB0YXJnZXRQbGF0Zm9ybTogYXdhaXQgdGhpcy5nZXRUYXJnZXRQbGF0Zm9ybSgpLCBjb21wYXRpYmxlOiB0cnVlLCBwcm9kdWN0VmVyc2lvbiB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlbMF07XG5cdFx0XHRpZiAoIWNvbXBhdGlibGVFeHRlbnNpb24pIHtcblx0XHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihubHMubG9jYWxpemUoJ25vdEZvdW5kRGVwcmVjYXRlZFJlcGxhY2VtZW50RXh0ZW5zaW9uJywgXCJDYW4ndCBpbnN0YWxsICd7MH0nIGV4dGVuc2lvbiBzaW5jZSBpdCB3YXMgZGVwcmVjYXRlZCBhbmQgdGhlIHJlcGxhY2VtZW50IGV4dGVuc2lvbiAnezF9JyBjYW4ndCBiZSBmb3VuZC5cIiwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGRlcHJlY2F0aW9uSW5mby5leHRlbnNpb24uaWQpLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkRlcHJlY2F0ZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGVsc2Uge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuY2FuSW5zdGFsbChleHRlbnNpb24pICE9PSB0cnVlKSB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldFBsYXRmb3JtID0gYXdhaXQgdGhpcy5nZXRUYXJnZXRQbGF0Zm9ybSgpO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKG5scy5sb2NhbGl6ZSgnaW5jb21wYXRpYmxlIHBsYXRmb3JtJywgXCJUaGUgJ3swfScgZXh0ZW5zaW9uIGlzIG5vdCBhdmFpbGFibGUgaW4gezF9IGZvciB0aGUgezJ9IHBsYXRmb3JtLlwiLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZywgVGFyZ2V0UGxhdGZvcm1Ub1N0cmluZyh0YXJnZXRQbGF0Zm9ybSkpLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkluY29tcGF0aWJsZVRhcmdldFBsYXRmb3JtKTtcblx0XHRcdH1cblxuXHRcdFx0Y29tcGF0aWJsZUV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuZ2V0Q29tcGF0aWJsZVZlcnNpb24oZXh0ZW5zaW9uLCBzYW1lVmVyc2lvbiwgaW5zdGFsbFByZVJlbGVhc2UsIHByb2R1Y3RWZXJzaW9uKTtcblx0XHRcdGlmICghY29tcGF0aWJsZUV4dGVuc2lvbikge1xuXHRcdFx0XHQvKiogSWYgbm8gY29tcGF0aWJsZSByZWxlYXNlIHZlcnNpb24gaXMgZm91bmQsIGNoZWNrIGlmIHRoZSBleHRlbnNpb24gaGFzIGEgcmVsZWFzZSB2ZXJzaW9uIG9yIG5vdCBhbmQgdGhyb3cgcmVsZXZhbnQgZXJyb3IgKi9cblx0XHRcdFx0aWYgKCFpbnN0YWxsUHJlUmVsZWFzZSAmJiBleHRlbnNpb24uaGFzUHJlUmVsZWFzZVZlcnNpb24gJiYgZXh0ZW5zaW9uLnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbiAmJiAoYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFtleHRlbnNpb24uaWRlbnRpZmllcl0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmxzLmxvY2FsaXplKCdub3RGb3VuZFJlbGVhc2VFeHRlbnNpb24nLCBcIkNhbid0IGluc3RhbGwgcmVsZWFzZSB2ZXJzaW9uIG9mICd7MH0nIGV4dGVuc2lvbiBiZWNhdXNlIGl0IGhhcyBubyByZWxlYXNlIHZlcnNpb24uXCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24uaWRlbnRpZmllci5pZCksIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuUmVsZWFzZVZlcnNpb25Ob3RGb3VuZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihubHMubG9jYWxpemUoJ25vdEZvdW5kQ29tcGF0aWJsZURlcGVuZGVuY3knLCBcIkNhbid0IGluc3RhbGwgJ3swfScgZXh0ZW5zaW9uIGJlY2F1c2UgaXQgaXMgbm90IGNvbXBhdGlibGUgd2l0aCB0aGUgY3VycmVudCB2ZXJzaW9uIG9mIHsxfSAodmVyc2lvbiB7Mn0pLlwiLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZywgdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uKSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbmNvbXBhdGlibGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdHZXR0aW5nIE1hbmlmZXN0Li4uJywgY29tcGF0aWJsZUV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0TWFuaWZlc3QoY29tcGF0aWJsZUV4dGVuc2lvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKG1hbmlmZXN0ID09PSBudWxsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGBNaXNzaW5nIG1hbmlmZXN0IGZvciBleHRlbnNpb24gJHtjb21wYXRpYmxlRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9YCwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbnZhbGlkKTtcblx0XHR9XG5cblx0XHRpZiAobWFuaWZlc3QudmVyc2lvbiAhPT0gY29tcGF0aWJsZUV4dGVuc2lvbi52ZXJzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGBDYW5ub3QgaW5zdGFsbCAnJHtjb21wYXRpYmxlRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9JyBleHRlbnNpb24gYmVjYXVzZSBvZiB2ZXJzaW9uIG1pc21hdGNoIGluIE1hcmtldHBsYWNlYCwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbnZhbGlkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBleHRlbnNpb246IGNvbXBhdGlibGVFeHRlbnNpb24sIG1hbmlmZXN0IH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0Q29tcGF0aWJsZVZlcnNpb24oZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgc2FtZVZlcnNpb246IGJvb2xlYW4sIGluY2x1ZGVQcmVSZWxlYXNlOiBib29sZWFuLCBwcm9kdWN0VmVyc2lvbjogSVByb2R1Y3RWZXJzaW9uKTogUHJvbWlzZTxJR2FsbGVyeUV4dGVuc2lvbiB8IG51bGw+IHtcblx0XHRjb25zdCB0YXJnZXRQbGF0Zm9ybSA9IGF3YWl0IHRoaXMuZ2V0VGFyZ2V0UGxhdGZvcm0oKTtcblx0XHRsZXQgY29tcGF0aWJsZUV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24gfCBudWxsID0gbnVsbDtcblxuXHRcdGlmICghc2FtZVZlcnNpb24gJiYgZXh0ZW5zaW9uLmhhc1ByZVJlbGVhc2VWZXJzaW9uICYmIGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24gIT09IGluY2x1ZGVQcmVSZWxlYXNlKSB7XG5cdFx0XHRjb21wYXRpYmxlRXh0ZW5zaW9uID0gKGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyAuLi5leHRlbnNpb24uaWRlbnRpZmllciwgcHJlUmVsZWFzZTogaW5jbHVkZVByZVJlbGVhc2UgfV0sIHsgdGFyZ2V0UGxhdGZvcm0sIGNvbXBhdGlibGU6IHRydWUsIHByb2R1Y3RWZXJzaW9uIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXSB8fCBudWxsO1xuXHRcdH1cblxuXHRcdGlmICghY29tcGF0aWJsZUV4dGVuc2lvbiAmJiBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmlzRXh0ZW5zaW9uQ29tcGF0aWJsZShleHRlbnNpb24sIGluY2x1ZGVQcmVSZWxlYXNlLCB0YXJnZXRQbGF0Zm9ybSwgcHJvZHVjdFZlcnNpb24pKSB7XG5cdFx0XHRjb21wYXRpYmxlRXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdH1cblxuXHRcdGlmICghY29tcGF0aWJsZUV4dGVuc2lvbikge1xuXHRcdFx0aWYgKHNhbWVWZXJzaW9uKSB7XG5cdFx0XHRcdGNvbXBhdGlibGVFeHRlbnNpb24gPSAoYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFt7IC4uLmV4dGVuc2lvbi5pZGVudGlmaWVyLCB2ZXJzaW9uOiBleHRlbnNpb24udmVyc2lvbiB9XSwgeyB0YXJnZXRQbGF0Zm9ybSwgY29tcGF0aWJsZTogdHJ1ZSwgcHJvZHVjdFZlcnNpb24gfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpWzBdIHx8IG51bGw7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb21wYXRpYmxlRXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRDb21wYXRpYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbiwgaW5jbHVkZVByZVJlbGVhc2UsIHRhcmdldFBsYXRmb3JtLCBwcm9kdWN0VmVyc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbXBhdGlibGVFeHRlbnNpb247XG5cdH1cblxuXHRwcml2YXRlIGdldFVuaW5zdGFsbEV4dGVuc2lvblRhc2tLZXkoaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIsIHByb2ZpbGVMb2NhdGlvbjogVVJJLCB2ZXJzaW9uPzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7aWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpfSR7dmVyc2lvbiA/IGAtJHt2ZXJzaW9ufWAgOiAnJ31AJHtwcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKX1gO1xuXHR9XG5cblx0YXN5bmMgdW5pbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zOiBVbmluc3RhbGxFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IGdldFVuaW5zdGFsbEV4dGVuc2lvblRhc2tLZXkgPSAoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIHVuaW5zdGFsbE9wdGlvbnM6IFVuaW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zKSA9PiB0aGlzLmdldFVuaW5zdGFsbEV4dGVuc2lvblRhc2tLZXkoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHVuaW5zdGFsbE9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLCB1bmluc3RhbGxPcHRpb25zLnZlcnNpb25Pbmx5ID8gZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24gOiB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgY3JlYXRlVW5pbnN0YWxsRXh0ZW5zaW9uVGFzayA9IChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgdW5pbnN0YWxsT3B0aW9uczogVW5pbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMpOiB2b2lkID0+IHtcblx0XHRcdGxldCBpbnN0YWxsVGFza1RvV2FpdEZvcjogSUluc3RhbGxFeHRlbnNpb25UYXNrIHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCB7IHRhc2sgfSBvZiB0aGlzLmluc3RhbGxpbmdFeHRlbnNpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRcdGlmICghKHRhc2suc291cmNlIGluc3RhbmNlb2YgVVJJKSAmJiBhcmVTYW1lRXh0ZW5zaW9ucyh0YXNrLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh0YXNrLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLCB1bmluc3RhbGxPcHRpb25zLnByb2ZpbGVMb2NhdGlvbikpIHtcblx0XHRcdFx0XHRpbnN0YWxsVGFza1RvV2FpdEZvciA9IHRhc2s7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHRhc2sgPSB0aGlzLmNyZWF0ZVVuaW5zdGFsbEV4dGVuc2lvblRhc2soZXh0ZW5zaW9uLCB1bmluc3RhbGxPcHRpb25zKTtcblx0XHRcdHRoaXMudW5pbnN0YWxsaW5nRXh0ZW5zaW9ucy5zZXQoZ2V0VW5pbnN0YWxsRXh0ZW5zaW9uVGFza0tleSh0YXNrLmV4dGVuc2lvbiwgdW5pbnN0YWxsT3B0aW9ucyksIHRhc2spO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1VuaW5zdGFsbGluZyBleHRlbnNpb24gZnJvbSB0aGUgcHJvZmlsZTonLCBgJHtleHRlbnNpb24uaWRlbnRpZmllci5pZH1AJHtleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbn1gLCB1bmluc3RhbGxPcHRpb25zLnByb2ZpbGVMb2NhdGlvbi50b1N0cmluZygpKTtcblx0XHRcdHRoaXMuX29uVW5pbnN0YWxsRXh0ZW5zaW9uLmZpcmUoeyBpZGVudGlmaWVyOiBleHRlbnNpb24uaWRlbnRpZmllciwgcHJvZmlsZUxvY2F0aW9uOiB1bmluc3RhbGxPcHRpb25zLnByb2ZpbGVMb2NhdGlvbiwgYXBwbGljYXRpb25TY29wZWQ6IGV4dGVuc2lvbi5pc0FwcGxpY2F0aW9uU2NvcGVkIH0pO1xuXHRcdFx0YWxsVGFza3MucHVzaCh7IHRhc2ssIGluc3RhbGxUYXNrVG9XYWl0Rm9yIH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCBwb3N0VW5pbnN0YWxsRXh0ZW5zaW9uID0gKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCB1bmluc3RhbGxPcHRpb25zOiBVbmluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucywgZXJyb3I/OiBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IpOiB2b2lkID0+IHtcblx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byB1bmluc3RhbGwgZXh0ZW5zaW9uIGZyb20gdGhlIHByb2ZpbGU6JywgYCR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9QCR7ZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb259YCwgdW5pbnN0YWxsT3B0aW9ucy5wcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKSwgZXJyb3IubWVzc2FnZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnU3VjY2Vzc2Z1bGx5IHVuaW5zdGFsbGVkIGV4dGVuc2lvbiBmcm9tIHRoZSBwcm9maWxlJywgYCR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9QCR7ZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb259YCwgdW5pbnN0YWxsT3B0aW9ucy5wcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXBvcnRUZWxlbWV0cnkodGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCAnZXh0ZW5zaW9uR2FsbGVyeTp1bmluc3RhbGwnLCB7IGV4dGVuc2lvbkRhdGE6IGdldExvY2FsRXh0ZW5zaW9uVGVsZW1ldHJ5RGF0YShleHRlbnNpb24pLCBlcnJvciB9KTtcblx0XHRcdHRoaXMuX29uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uLmZpcmUoeyBpZGVudGlmaWVyOiBleHRlbnNpb24uaWRlbnRpZmllciwgZXJyb3I6IGVycm9yPy5jb2RlLCBwcm9maWxlTG9jYXRpb246IHVuaW5zdGFsbE9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLCBhcHBsaWNhdGlvblNjb3BlZDogZXh0ZW5zaW9uLmlzQXBwbGljYXRpb25TY29wZWQgfSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGFsbFRhc2tzOiB7IHRhc2s6IElVbmluc3RhbGxFeHRlbnNpb25UYXNrOyBpbnN0YWxsVGFza1RvV2FpdEZvcj86IElJbnN0YWxsRXh0ZW5zaW9uVGFzayB9W10gPSBbXTtcblx0XHRjb25zdCBwcm9jZXNzZWRUYXNrczogSVVuaW5zdGFsbEV4dGVuc2lvblRhc2tbXSA9IFtdO1xuXHRcdGNvbnN0IGFscmVhZHlSZXF1ZXN0ZWRVbmluc3RhbGxzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRjb25zdCBleHRlbnNpb25zVG9SZW1vdmU6IElMb2NhbEV4dGVuc2lvbltdID0gW107XG5cblx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zTWFwID0gbmV3IFJlc291cmNlTWFwPElMb2NhbEV4dGVuc2lvbltdPigpO1xuXHRcdGNvbnN0IGdldEluc3RhbGxlZEV4dGVuc2lvbnMgPSBhc3luYyAocHJvZmlsZUxvY2F0aW9uOiBVUkkpID0+IHtcblx0XHRcdGxldCBpbnN0YWxsZWQgPSBpbnN0YWxsZWRFeHRlbnNpb25zTWFwLmdldChwcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0aWYgKCFpbnN0YWxsZWQpIHtcblx0XHRcdFx0aW5zdGFsbGVkRXh0ZW5zaW9uc01hcC5zZXQocHJvZmlsZUxvY2F0aW9uLCBpbnN0YWxsZWQgPSBhd2FpdCB0aGlzLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIsIHByb2ZpbGVMb2NhdGlvbikpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGluc3RhbGxlZDtcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCB7IGV4dGVuc2lvbiwgb3B0aW9ucyB9IG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IHVuaW5zdGFsbE9wdGlvbnM6IFVuaW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zID0ge1xuXHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRwcm9maWxlTG9jYXRpb246IGV4dGVuc2lvbi5pc0FwcGxpY2F0aW9uU2NvcGVkID8gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UgOiBvcHRpb25zPy5wcm9maWxlTG9jYXRpb24gPz8gdGhpcy5nZXRDdXJyZW50RXh0ZW5zaW9uc01hbmlmZXN0TG9jYXRpb24oKVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHVuaW5zdGFsbEV4dGVuc2lvblRhc2sgPSB0aGlzLnVuaW5zdGFsbGluZ0V4dGVuc2lvbnMuZ2V0KGdldFVuaW5zdGFsbEV4dGVuc2lvblRhc2tLZXkoZXh0ZW5zaW9uLCB1bmluc3RhbGxPcHRpb25zKSk7XG5cdFx0XHRpZiAodW5pbnN0YWxsRXh0ZW5zaW9uVGFzaykge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnRXh0ZW5zaW9ucyBpcyBhbHJlYWR5IHJlcXVlc3RlZCB0byB1bmluc3RhbGwnLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdGFscmVhZHlSZXF1ZXN0ZWRVbmluc3RhbGxzLnB1c2godW5pbnN0YWxsRXh0ZW5zaW9uVGFzay53YWl0VW50aWxUYXNrSXNGaW5pc2hlZCgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNyZWF0ZVVuaW5zdGFsbEV4dGVuc2lvblRhc2soZXh0ZW5zaW9uLCB1bmluc3RhbGxPcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHVuaW5zdGFsbE9wdGlvbnMucmVtb3ZlIHx8IGV4dGVuc2lvbi5pc0FwcGxpY2F0aW9uU2NvcGVkKSB7XG5cdFx0XHRcdGlmICh1bmluc3RhbGxPcHRpb25zLnJlbW92ZSkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbnNUb1JlbW92ZS5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMpIHtcblx0XHRcdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsIHVuaW5zdGFsbE9wdGlvbnMucHJvZmlsZUxvY2F0aW9uKSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IGdldEluc3RhbGxlZEV4dGVuc2lvbnMocHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHByb2ZpbGVFeHRlbnNpb24gPSBpbnN0YWxsZWQuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0XHRpZiAocHJvZmlsZUV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgdW5pbnN0YWxsT3B0aW9uc1dpdGhQcm9maWxlID0geyAuLi51bmluc3RhbGxPcHRpb25zLCBwcm9maWxlTG9jYXRpb246IHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlIH07XG5cdFx0XHRcdFx0XHRjb25zdCB1bmluc3RhbGxFeHRlbnNpb25UYXNrID0gdGhpcy51bmluc3RhbGxpbmdFeHRlbnNpb25zLmdldChnZXRVbmluc3RhbGxFeHRlbnNpb25UYXNrS2V5KHByb2ZpbGVFeHRlbnNpb24sIHVuaW5zdGFsbE9wdGlvbnNXaXRoUHJvZmlsZSkpO1xuXHRcdFx0XHRcdFx0aWYgKHVuaW5zdGFsbEV4dGVuc2lvblRhc2spIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0V4dGVuc2lvbnMgaXMgYWxyZWFkeSByZXF1ZXN0ZWQgdG8gdW5pbnN0YWxsJywgcHJvZmlsZUV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHRcdFx0YWxyZWFkeVJlcXVlc3RlZFVuaW5zdGFsbHMucHVzaCh1bmluc3RhbGxFeHRlbnNpb25UYXNrLndhaXRVbnRpbFRhc2tJc0ZpbmlzaGVkKCkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y3JlYXRlVW5pbnN0YWxsRXh0ZW5zaW9uVGFzayhwcm9maWxlRXh0ZW5zaW9uLCB1bmluc3RhbGxPcHRpb25zV2l0aFByb2ZpbGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKGNvbnN0IHsgdGFzayB9IG9mIGFsbFRhc2tzLnNsaWNlKDApKSB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IGdldEluc3RhbGxlZEV4dGVuc2lvbnModGFzay5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbik7XG5cblx0XHRcdFx0aWYgKHRhc2sub3B0aW9ucy5kb25vdEluY2x1ZGVQYWNrKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1VuaW5zdGFsbGluZyB0aGUgZXh0ZW5zaW9uIHdpdGhvdXQgaW5jbHVkaW5nIHBhY2tlZCBleHRlbnNpb24nLCBgJHt0YXNrLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkfUAke3Rhc2suZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb259YCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFja2VkRXh0ZW5zaW9ucyA9IHRoaXMuZ2V0QWxsUGFja0V4dGVuc2lvbnNUb1VuaW5zdGFsbCh0YXNrLmV4dGVuc2lvbiwgaW5zdGFsbGVkKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHBhY2tlZEV4dGVuc2lvbiBvZiBwYWNrZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy51bmluc3RhbGxpbmdFeHRlbnNpb25zLmhhcyhnZXRVbmluc3RhbGxFeHRlbnNpb25UYXNrS2V5KHBhY2tlZEV4dGVuc2lvbiwgdGFzay5vcHRpb25zKSkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0V4dGVuc2lvbnMgaXMgYWxyZWFkeSByZXF1ZXN0ZWQgdG8gdW5pbnN0YWxsJywgcGFja2VkRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y3JlYXRlVW5pbnN0YWxsRXh0ZW5zaW9uVGFzayhwYWNrZWRFeHRlbnNpb24sIHRhc2sub3B0aW9ucyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0YXNrLm9wdGlvbnMuZG9ub3RDaGVja0RlcGVuZGVudHMpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnVW5pbnN0YWxsaW5nIHRoZSBleHRlbnNpb24gd2l0aG91dCBjaGVja2luZyBkZXBlbmRlbnRzJywgYCR7dGFzay5leHRlbnNpb24uaWRlbnRpZmllci5pZH1AJHt0YXNrLmV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9ufWApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuY2hlY2tGb3JEZXBlbmRlbnRzKGFsbFRhc2tzLm1hcCgoeyB0YXNrIH0pID0+IHRhc2suZXh0ZW5zaW9uKSwgaW5zdGFsbGVkLCB0YXNrLmV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVW5pbnN0YWxsIGV4dGVuc2lvbnMgaW4gcGFyYWxsZWwgYW5kIHdhaXQgdW50aWwgYWxsIGV4dGVuc2lvbnMgYXJlIHVuaW5zdGFsbGVkIC8gZmFpbGVkXG5cdFx0XHRhd2FpdCB0aGlzLmpvaW5BbGxTZXR0bGVkKGFsbFRhc2tzLm1hcChhc3luYyAoeyB0YXNrLCBpbnN0YWxsVGFza1RvV2FpdEZvciB9KSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Ly8gV2FpdCBmb3Igb3Bwb3NpdGUgdGFzayBpZiBpdCBleGlzdHNcblx0XHRcdFx0XHRpZiAoaW5zdGFsbFRhc2tUb1dhaXRGb3IpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdXYWl0aW5nIGZvciBleGlzdGluZyBpbnN0YWxsIHRhc2sgdG8gY29tcGxldGUgYmVmb3JlIHVuaW5zdGFsbGluZycsIHRhc2suZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgaW5zdGFsbFRhc2tUb1dhaXRGb3Iud2FpdFVudGlsVGFza0lzRmluaXNoZWQoKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0ZpbmlzaGVkIHdhaXRpbmcgZm9yIGluc3RhbGwgdGFzaywgcHJvY2VlZGluZyB3aXRoIHVuaW5zdGFsbCcsIHRhc2suZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0luc3RhbGwgdGFzayBmYWlsZWQsIHByb2NlZWRpbmcgd2l0aCB1bmluc3RhbGwgYW55d2F5JywgdGFzay5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0YXdhaXQgdGFzay5ydW4oKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmpvaW5BbGxTZXR0bGVkKHRoaXMucGFydGljaXBhbnRzLm1hcChwYXJ0aWNpcGFudCA9PiBwYXJ0aWNpcGFudC5wb3N0VW5pbnN0YWxsKHRhc2suZXh0ZW5zaW9uLCB0YXNrLm9wdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKSk7XG5cdFx0XHRcdFx0Ly8gb25seSByZXBvcnQgaWYgZXh0ZW5zaW9uIGhhcyBhIG1hcHBlZCBnYWxsZXJ5IGV4dGVuc2lvbiBhbmQgbm90IGluIHdlYi4gVVVJRCBpZGVudGlmaWVzIHRoZSBnYWxsZXJ5IGV4dGVuc2lvbi5cblx0XHRcdFx0XHRpZiAodGFzay5leHRlbnNpb24uaWRlbnRpZmllci51dWlkICYmICFpc1dlYikge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5yZXBvcnRTdGF0aXN0aWModGFzay5leHRlbnNpb24ubWFuaWZlc3QucHVibGlzaGVyLCB0YXNrLmV4dGVuc2lvbi5tYW5pZmVzdC5uYW1lLCB0YXNrLmV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uLCBTdGF0aXN0aWNUeXBlLlVuaW5zdGFsbCk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikgeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGNvbnN0IGVycm9yID0gdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZSk7XG5cdFx0XHRcdFx0cG9zdFVuaW5zdGFsbEV4dGVuc2lvbih0YXNrLmV4dGVuc2lvbiwgdGFzay5vcHRpb25zLCBlcnJvcik7XG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0cHJvY2Vzc2VkVGFza3MucHVzaCh0YXNrKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRpZiAoYWxyZWFkeVJlcXVlc3RlZFVuaW5zdGFsbHMubGVuZ3RoKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuam9pbkFsbFNldHRsZWQoYWxyZWFkeVJlcXVlc3RlZFVuaW5zdGFsbHMpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHsgdGFzayB9IG9mIGFsbFRhc2tzKSB7XG5cdFx0XHRcdHBvc3RVbmluc3RhbGxFeHRlbnNpb24odGFzay5leHRlbnNpb24sIHRhc2sub3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChleHRlbnNpb25zVG9SZW1vdmUubGVuZ3RoKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuam9pbkFsbFNldHRsZWQoZXh0ZW5zaW9uc1RvUmVtb3ZlLm1hcChleHRlbnNpb24gPT4gdGhpcy5kZWxldGVFeHRlbnNpb24oZXh0ZW5zaW9uKSkpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnN0IGVycm9yID0gdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZSk7XG5cdFx0XHRmb3IgKGNvbnN0IHsgdGFzayB9IG9mIGFsbFRhc2tzKSB7XG5cdFx0XHRcdC8vIGNhbmNlbCB0aGUgdGFza3Ncblx0XHRcdFx0dHJ5IHsgdGFzay5jYW5jZWwoKTsgfSBjYXRjaCAoZXJyb3IpIHsgLyogaWdub3JlICovIH1cblx0XHRcdFx0aWYgKCFwcm9jZXNzZWRUYXNrcy5pbmNsdWRlcyh0YXNrKSkge1xuXHRcdFx0XHRcdHBvc3RVbmluc3RhbGxFeHRlbnNpb24odGFzay5leHRlbnNpb24sIHRhc2sub3B0aW9ucywgZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Ly8gUmVtb3ZlIHRhc2tzIGZyb20gY2FjaGVcblx0XHRcdGZvciAoY29uc3QgeyB0YXNrIH0gb2YgYWxsVGFza3MpIHtcblx0XHRcdFx0aWYgKCF0aGlzLnVuaW5zdGFsbGluZ0V4dGVuc2lvbnMuZGVsZXRlKGdldFVuaW5zdGFsbEV4dGVuc2lvblRhc2tLZXkodGFzay5leHRlbnNpb24sIHRhc2sub3B0aW9ucykpKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1VuaW5zdGFsbGF0aW9uIHRhc2sgaXMgbm90IGZvdW5kIGluIHRoZSBjYWNoZScsIHRhc2suZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjaGVja0ZvckRlcGVuZGVudHMoZXh0ZW5zaW9uc1RvVW5pbnN0YWxsOiBJTG9jYWxFeHRlbnNpb25bXSwgaW5zdGFsbGVkOiBJTG9jYWxFeHRlbnNpb25bXSwgZXh0ZW5zaW9uVG9Vbmluc3RhbGw6IElMb2NhbEV4dGVuc2lvbik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnNUb1VuaW5zdGFsbCkge1xuXHRcdFx0Y29uc3QgZGVwZW5kZW50cyA9IHRoaXMuZ2V0RGVwZW5kZW50cyhleHRlbnNpb24sIGluc3RhbGxlZCk7XG5cdFx0XHRpZiAoZGVwZW5kZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgcmVtYWluaW5nRGVwZW5kZW50cyA9IGRlcGVuZGVudHMuZmlsdGVyKGRlcGVuZGVudCA9PiAhZXh0ZW5zaW9uc1RvVW5pbnN0YWxsLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGRlcGVuZGVudC5pZGVudGlmaWVyKSkpO1xuXHRcdFx0XHRpZiAocmVtYWluaW5nRGVwZW5kZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5nZXREZXBlbmRlbnRzRXJyb3JNZXNzYWdlKGV4dGVuc2lvbiwgcmVtYWluaW5nRGVwZW5kZW50cywgZXh0ZW5zaW9uVG9Vbmluc3RhbGwpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVwZW5kZW50c0Vycm9yTWVzc2FnZShkZXBlbmRpbmdFeHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZGVwZW5kZW50czogSUxvY2FsRXh0ZW5zaW9uW10sIGV4dGVuc2lvblRvVW5pbnN0YWxsOiBJTG9jYWxFeHRlbnNpb24pOiBzdHJpbmcge1xuXHRcdGlmIChleHRlbnNpb25Ub1VuaW5zdGFsbCA9PT0gZGVwZW5kaW5nRXh0ZW5zaW9uKSB7XG5cdFx0XHRpZiAoZGVwZW5kZW50cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnc2luZ2xlRGVwZW5kZW50RXJyb3InLCBcIkNhbm5vdCB1bmluc3RhbGwgJ3swfScgZXh0ZW5zaW9uLiAnezF9JyBleHRlbnNpb24gZGVwZW5kcyBvbiB0aGlzLlwiLFxuXHRcdFx0XHRcdGV4dGVuc2lvblRvVW5pbnN0YWxsLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvblRvVW5pbnN0YWxsLm1hbmlmZXN0Lm5hbWUsIGRlcGVuZGVudHNbMF0ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZGVwZW5kZW50c1swXS5tYW5pZmVzdC5uYW1lKTtcblx0XHRcdH1cblx0XHRcdGlmIChkZXBlbmRlbnRzLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd0d29EZXBlbmRlbnRzRXJyb3InLCBcIkNhbm5vdCB1bmluc3RhbGwgJ3swfScgZXh0ZW5zaW9uLiAnezF9JyBhbmQgJ3syfScgZXh0ZW5zaW9ucyBkZXBlbmQgb24gdGhpcy5cIixcblx0XHRcdFx0XHRleHRlbnNpb25Ub1VuaW5zdGFsbC5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb25Ub1VuaW5zdGFsbC5tYW5pZmVzdC5uYW1lLCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGRlcGVuZGVudHNbMF0ubWFuaWZlc3QubmFtZSwgZGVwZW5kZW50c1sxXS5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBkZXBlbmRlbnRzWzFdLm1hbmlmZXN0Lm5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnbXVsdGlwbGVEZXBlbmRlbnRzRXJyb3InLCBcIkNhbm5vdCB1bmluc3RhbGwgJ3swfScgZXh0ZW5zaW9uLiAnezF9JywgJ3syfScgYW5kIG90aGVyIGV4dGVuc2lvbiBkZXBlbmQgb24gdGhpcy5cIixcblx0XHRcdFx0ZXh0ZW5zaW9uVG9Vbmluc3RhbGwubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uVG9Vbmluc3RhbGwubWFuaWZlc3QubmFtZSwgZGVwZW5kZW50c1swXS5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0Lm5hbWUsIGRlcGVuZGVudHNbMV0ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZGVwZW5kZW50c1sxXS5tYW5pZmVzdC5uYW1lKTtcblx0XHR9XG5cdFx0aWYgKGRlcGVuZGVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdzaW5nbGVJbmRpcmVjdERlcGVuZGVudEVycm9yJywgXCJDYW5ub3QgdW5pbnN0YWxsICd7MH0nIGV4dGVuc2lvbiAuIEl0IGluY2x1ZGVzIHVuaW5zdGFsbGluZyAnezF9JyBleHRlbnNpb24gYW5kICd7Mn0nIGV4dGVuc2lvbiBkZXBlbmRzIG9uIHRoaXMuXCIsXG5cdFx0XHRcdGV4dGVuc2lvblRvVW5pbnN0YWxsLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvblRvVW5pbnN0YWxsLm1hbmlmZXN0Lm5hbWUsIGRlcGVuZGluZ0V4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZVxuXHRcdFx0fHwgZGVwZW5kaW5nRXh0ZW5zaW9uLm1hbmlmZXN0Lm5hbWUsIGRlcGVuZGVudHNbMF0ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZGVwZW5kZW50c1swXS5tYW5pZmVzdC5uYW1lKTtcblx0XHR9XG5cdFx0aWYgKGRlcGVuZGVudHMubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd0d29JbmRpcmVjdERlcGVuZGVudHNFcnJvcicsIFwiQ2Fubm90IHVuaW5zdGFsbCAnezB9JyBleHRlbnNpb24uIEl0IGluY2x1ZGVzIHVuaW5zdGFsbGluZyAnezF9JyBleHRlbnNpb24gYW5kICd7Mn0nIGFuZCAnezN9JyBleHRlbnNpb25zIGRlcGVuZCBvbiB0aGlzLlwiLFxuXHRcdFx0XHRleHRlbnNpb25Ub1VuaW5zdGFsbC5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb25Ub1VuaW5zdGFsbC5tYW5pZmVzdC5uYW1lLCBkZXBlbmRpbmdFeHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWVcblx0XHRcdHx8IGRlcGVuZGluZ0V4dGVuc2lvbi5tYW5pZmVzdC5uYW1lLCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGRlcGVuZGVudHNbMF0ubWFuaWZlc3QubmFtZSwgZGVwZW5kZW50c1sxXS5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBkZXBlbmRlbnRzWzFdLm1hbmlmZXN0Lm5hbWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdtdWx0aXBsZUluZGlyZWN0RGVwZW5kZW50c0Vycm9yJywgXCJDYW5ub3QgdW5pbnN0YWxsICd7MH0nIGV4dGVuc2lvbi4gSXQgaW5jbHVkZXMgdW5pbnN0YWxsaW5nICd7MX0nIGV4dGVuc2lvbiBhbmQgJ3syfScsICd7M30nIGFuZCBvdGhlciBleHRlbnNpb25zIGRlcGVuZCBvbiB0aGlzLlwiLFxuXHRcdFx0ZXh0ZW5zaW9uVG9Vbmluc3RhbGwubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uVG9Vbmluc3RhbGwubWFuaWZlc3QubmFtZSwgZGVwZW5kaW5nRXh0ZW5zaW9uLm1hbmlmZXN0LmRpc3BsYXlOYW1lXG5cdFx0fHwgZGVwZW5kaW5nRXh0ZW5zaW9uLm1hbmlmZXN0Lm5hbWUsIGRlcGVuZGVudHNbMF0ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZGVwZW5kZW50c1swXS5tYW5pZmVzdC5uYW1lLCBkZXBlbmRlbnRzWzFdLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGRlcGVuZGVudHNbMV0ubWFuaWZlc3QubmFtZSk7XG5cblx0fVxuXG5cdHByaXZhdGUgZ2V0QWxsUGFja0V4dGVuc2lvbnNUb1VuaW5zdGFsbChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgaW5zdGFsbGVkOiBJTG9jYWxFeHRlbnNpb25bXSwgY2hlY2tlZDogSUxvY2FsRXh0ZW5zaW9uW10gPSBbXSk6IElMb2NhbEV4dGVuc2lvbltdIHtcblx0XHRpZiAoY2hlY2tlZC5pbmRleE9mKGV4dGVuc2lvbikgIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGlmIChhcmVTYW1lRXh0ZW5zaW9ucyhleHRlbnNpb24uaWRlbnRpZmllciwgeyBpZDogdGhpcy5wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50LmV4dGVuc2lvbklkIH0pKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNoZWNrZWQucHVzaChleHRlbnNpb24pO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNQYWNrID0gZXh0ZW5zaW9uLm1hbmlmZXN0LmV4dGVuc2lvblBhY2sgPyBleHRlbnNpb24ubWFuaWZlc3QuZXh0ZW5zaW9uUGFjayA6IFtdO1xuXHRcdGlmIChleHRlbnNpb25zUGFjay5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHBhY2tlZEV4dGVuc2lvbnMgPSBpbnN0YWxsZWQuZmlsdGVyKGkgPT4gIWkuaXNCdWlsdGluICYmIGV4dGVuc2lvbnNQYWNrLnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBpLmlkZW50aWZpZXIpKSk7XG5cdFx0XHRjb25zdCBwYWNrT2ZQYWNrZWRFeHRlbnNpb25zOiBJTG9jYWxFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBwYWNrZWRFeHRlbnNpb24gb2YgcGFja2VkRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRwYWNrT2ZQYWNrZWRFeHRlbnNpb25zLnB1c2goLi4udGhpcy5nZXRBbGxQYWNrRXh0ZW5zaW9uc1RvVW5pbnN0YWxsKHBhY2tlZEV4dGVuc2lvbiwgaW5zdGFsbGVkLCBjaGVja2VkKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gWy4uLnBhY2tlZEV4dGVuc2lvbnMsIC4uLnBhY2tPZlBhY2tlZEV4dGVuc2lvbnNdO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIGdldERlcGVuZGVudHMoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGluc3RhbGxlZDogSUxvY2FsRXh0ZW5zaW9uW10pOiBJTG9jYWxFeHRlbnNpb25bXSB7XG5cdFx0cmV0dXJuIGluc3RhbGxlZC5maWx0ZXIoZSA9PiBlLm1hbmlmZXN0LmV4dGVuc2lvbkRlcGVuZGVuY2llcyAmJiBlLm1hbmlmZXN0LmV4dGVuc2lvbkRlcGVuZGVuY2llcy5zb21lKGlkID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQgfSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUNvbnRyb2xDYWNoZSgpOiBQcm9taXNlPElFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0PiB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudXBkYXRlQ29udHJvbENhY2hlJyk7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnJlZnJlc2hDb250cm9sQ2FjaGUgLSBmYWlsZWQgdG8gZ2V0IGV4dGVuc2lvbiBjb250cm9sIG1hbmlmZXN0JywgZ2V0RXJyb3JNZXNzYWdlKGVycikpO1xuXHRcdFx0cmV0dXJuIHsgbWFsaWNpb3VzOiBbXSwgZGVwcmVjYXRlZDoge30sIHNlYXJjaDogW10gfTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0Q3VycmVudEV4dGVuc2lvbnNNYW5pZmVzdExvY2F0aW9uKCk6IFVSSTtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGNyZWF0ZUluc3RhbGxFeHRlbnNpb25UYXNrKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QsIGV4dGVuc2lvbjogVVJJIHwgSUdhbGxlcnlFeHRlbnNpb24sIG9wdGlvbnM6IEluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyk6IElJbnN0YWxsRXh0ZW5zaW9uVGFzaztcblx0cHJvdGVjdGVkIGFic3RyYWN0IGNyZWF0ZVVuaW5zdGFsbEV4dGVuc2lvblRhc2soZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIG9wdGlvbnM6IFVuaW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zKTogSVVuaW5zdGFsbEV4dGVuc2lvblRhc2s7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBjb3B5RXh0ZW5zaW9uKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkksIG1ldGFkYXRhPzogUGFydGlhbDxNZXRhZGF0YT4pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBtb3ZlRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkksIG1ldGFkYXRhPzogUGFydGlhbDxNZXRhZGF0YT4pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCByZW1vdmVFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8dm9pZD47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBkZWxldGVFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZXJyb3I6IEVycm9yLCBjb2RlPzogRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZSk6IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvciB7XG5cdGlmIChlcnJvciBpbnN0YW5jZW9mIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcikge1xuXHRcdHJldHVybiBlcnJvcjtcblx0fVxuXHRsZXQgZXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yOiBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3I7XG5cdGlmIChlcnJvciBpbnN0YW5jZW9mIEV4dGVuc2lvbkdhbGxlcnlFcnJvcikge1xuXHRcdGV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvciA9IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZXJyb3IubWVzc2FnZSwgZXJyb3IuY29kZSA9PT0gRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5Eb3dubG9hZEZhaWxlZFdyaXRpbmcgPyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkRvd25sb2FkRmFpbGVkV3JpdGluZyA6IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuR2FsbGVyeSk7XG5cdH0gZWxzZSB7XG5cdFx0ZXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yID0gbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlcnJvci5tZXNzYWdlLCBpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSA/IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuQ2FuY2VsbGVkIDogKGNvZGUgPz8gRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbnRlcm5hbCkpO1xuXHR9XG5cdGV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvci5zdGFjayA9IGVycm9yLnN0YWNrO1xuXHRyZXR1cm4gZXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yO1xufVxuXG5mdW5jdGlvbiByZXBvcnRUZWxlbWV0cnkodGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsIGV2ZW50TmFtZTogc3RyaW5nLFxuXHR7XG5cdFx0ZXh0ZW5zaW9uRGF0YSxcblx0XHR2ZXJpZmljYXRpb25TdGF0dXMsXG5cdFx0ZHVyYXRpb24sXG5cdFx0ZXJyb3IsXG5cdFx0c291cmNlLFxuXHRcdGR1cmF0aW9uU2luY2VVcGRhdGVcblx0fToge1xuXHRcdGV4dGVuc2lvbkRhdGE6IG9iamVjdDtcblx0XHR2ZXJpZmljYXRpb25TdGF0dXM/OiBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlO1xuXHRcdGR1cmF0aW9uPzogbnVtYmVyO1xuXHRcdGR1cmF0aW9uU2luY2VVcGRhdGU/OiBudW1iZXI7XG5cdFx0c291cmNlPzogc3RyaW5nO1xuXHRcdGVycm9yPzogRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yIHwgRXh0ZW5zaW9uR2FsbGVyeUVycm9yO1xuXHR9KTogdm9pZCB7XG5cblx0LyogX19HRFBSX19cblx0XHRcImV4dGVuc2lvbkdhbGxlcnk6aW5zdGFsbFwiIDoge1xuXHRcdFx0XCJvd25lclwiOiBcInNhbmR5MDgxXCIsXG5cdFx0XHRcInN1Y2Nlc3NcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiUGVyZm9ybWFuY2VBbmRIZWFsdGhcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfSxcblx0XHRcdFwiZHVyYXRpb25cIiA6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIlBlcmZvcm1hbmNlQW5kSGVhbHRoXCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XHRcImR1cmF0aW9uU2luY2VVcGRhdGVcIiA6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XHRcImVycm9yY29kZVwiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJDYWxsc3RhY2tPckV4Y2VwdGlvblwiLCBcInB1cnBvc2VcIjogXCJQZXJmb3JtYW5jZUFuZEhlYWx0aFwiIH0sXG5cdFx0XHRcInJlY29tbWVuZGF0aW9uUmVhc29uXCI6IHsgXCJyZXRpcmVkRnJvbVZlcnNpb25cIjogXCIxLjIzLjBcIiwgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XHRcInZlcmlmaWNhdGlvblN0YXR1c1wiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiB9LFxuXHRcdFx0XCJzb3VyY2VcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiB9LFxuXHRcdFx0XCIke2luY2x1ZGV9XCI6IFtcblx0XHRcdFx0XCIke0dhbGxlcnlFeHRlbnNpb25UZWxlbWV0cnlEYXRhfVwiXG5cdFx0XHRdXG5cdFx0fVxuXHQqL1xuXHQvKiBfX0dEUFJfX1xuXHRcdFwiZXh0ZW5zaW9uR2FsbGVyeTp1bmluc3RhbGxcIiA6IHtcblx0XHRcdFwib3duZXJcIjogXCJzYW5keTA4MVwiLFxuXHRcdFx0XCJzdWNjZXNzXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIlBlcmZvcm1hbmNlQW5kSGVhbHRoXCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XHRcImR1cmF0aW9uXCIgOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJQZXJmb3JtYW5jZUFuZEhlYWx0aFwiLCBcImlzTWVhc3VyZW1lbnRcIjogdHJ1ZSB9LFxuXHRcdFx0XCJlcnJvcmNvZGVcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiQ2FsbHN0YWNrT3JFeGNlcHRpb25cIiwgXCJwdXJwb3NlXCI6IFwiUGVyZm9ybWFuY2VBbmRIZWFsdGhcIiB9LFxuXHRcdFx0XCIke2luY2x1ZGV9XCI6IFtcblx0XHRcdFx0XCIke0dhbGxlcnlFeHRlbnNpb25UZWxlbWV0cnlEYXRhfVwiXG5cdFx0XHRdXG5cdFx0fVxuXHQqL1xuXHQvKiBfX0dEUFJfX1xuXHRcdFwiZXh0ZW5zaW9uR2FsbGVyeTp1cGRhdGVcIiA6IHtcblx0XHRcdFwib3duZXJcIjogXCJzYW5keTA4MVwiLFxuXHRcdFx0XCJzdWNjZXNzXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIlBlcmZvcm1hbmNlQW5kSGVhbHRoXCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XHRcImR1cmF0aW9uXCIgOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJQZXJmb3JtYW5jZUFuZEhlYWx0aFwiLCBcImlzTWVhc3VyZW1lbnRcIjogdHJ1ZSB9LFxuXHRcdFx0XCJlcnJvcmNvZGVcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiQ2FsbHN0YWNrT3JFeGNlcHRpb25cIiwgXCJwdXJwb3NlXCI6IFwiUGVyZm9ybWFuY2VBbmRIZWFsdGhcIiB9LFxuXHRcdFx0XCJ2ZXJpZmljYXRpb25TdGF0dXNcIiA6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIgfSxcblx0XHRcdFwic291cmNlXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIgfSxcblx0XHRcdFwiJHtpbmNsdWRlfVwiOiBbXG5cdFx0XHRcdFwiJHtHYWxsZXJ5RXh0ZW5zaW9uVGVsZW1ldHJ5RGF0YX1cIlxuXHRcdFx0XVxuXHRcdH1cblx0Ki9cblx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2coZXZlbnROYW1lLCB7XG5cdFx0Li4uZXh0ZW5zaW9uRGF0YSxcblx0XHRzb3VyY2UsXG5cdFx0ZHVyYXRpb24sXG5cdFx0ZHVyYXRpb25TaW5jZVVwZGF0ZSxcblx0XHRzdWNjZXNzOiAhZXJyb3IsXG5cdFx0ZXJyb3Jjb2RlOiBlcnJvcj8uY29kZSxcblx0XHR2ZXJpZmljYXRpb25TdGF0dXM6IHZlcmlmaWNhdGlvblN0YXR1cyA9PT0gRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5TdWNjZXNzID8gJ1ZlcmlmaWVkJyA6ICh2ZXJpZmljYXRpb25TdGF0dXMgPz8gJ1VudmVyaWZpZWQnKVxuXHR9KTtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0RXh0ZW5zaW9uVGFzazxUPiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBiYXJyaWVyID0gbmV3IEJhcnJpZXIoKTtcblx0cHJpdmF0ZSBjYW5jZWxsYWJsZVByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPFQ+IHwgdW5kZWZpbmVkO1xuXG5cdGFzeW5jIHdhaXRVbnRpbFRhc2tJc0ZpbmlzaGVkKCk6IFByb21pc2U8VD4ge1xuXHRcdGF3YWl0IHRoaXMuYmFycmllci53YWl0KCk7XG5cdFx0cmV0dXJuIHRoaXMuY2FuY2VsbGFibGVQcm9taXNlITtcblx0fVxuXG5cdHJ1bigpOiBQcm9taXNlPFQ+IHtcblx0XHRpZiAoIXRoaXMuY2FuY2VsbGFibGVQcm9taXNlKSB7XG5cdFx0XHR0aGlzLmNhbmNlbGxhYmxlUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHRoaXMuZG9SdW4odG9rZW4pKTtcblx0XHR9XG5cdFx0dGhpcy5iYXJyaWVyLm9wZW4oKTtcblx0XHRyZXR1cm4gdGhpcy5jYW5jZWxsYWJsZVByb21pc2U7XG5cdH1cblxuXHRjYW5jZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNhbmNlbGxhYmxlUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5jYW5jZWxsYWJsZVByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSh0b2tlbiA9PiB7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZSgoYywgZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdGUobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5iYXJyaWVyLm9wZW4oKTtcblx0XHR9XG5cdFx0dGhpcy5jYW5jZWxsYWJsZVByb21pc2UuY2FuY2VsKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZG9SdW4odG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxUPjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxVQUFVLHVCQUF1QjtBQUMxQyxTQUFTLFNBQTRCLCtCQUErQjtBQUNwRSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQixpQkFBaUIsMkJBQTJCO0FBQ3hFLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVztBQUNwQixZQUFZ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QzNDLFVBQU0sS0FBSyxRQUFRLEtBQUs7QUFDeEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsTUFBa0I7QUFDakIsUUFBSSxDQUFDLEtBQUssb0JBQW9CO0FBQzdCLFdBQUsscUJBQXFCLHdCQUF3QixXQUFTLEtBQUssTUFBTSxLQUFLLENBQUM7QUFBQSxJQUM3RTtBQUNBLFNBQUssUUFBUSxLQUFLO0FBQ2xCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLFNBQWU7QUFDZCxRQUFJLENBQUMsS0FBSyxvQkFBb0I7QUFDN0IsV0FBSyxxQkFBcUIsd0JBQXdCLFdBQVM7QUFDMUQsZUFBTyxJQUFJLFFBQVEsQ0FBQyxHQUFHLE1BQU07QUFDNUIsZ0JBQU0sYUFBYSxNQUFNLHdCQUF3QixNQUFNO0FBQ3RELHVCQUFXLFFBQVE7QUFDbkIsY0FBRSxJQUFJLGtCQUFrQixDQUFDO0FBQUEsVUFDMUIsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUNELFdBQUssUUFBUSxLQUFLO0FBQUEsSUFDbkI7QUFDQSxTQUFLLG1CQUFtQixPQUFPO0FBQUEsRUFDaEM7QUFHRDsiLAogICJuYW1lcyI6IFsicmVzdWx0cyIsICJyZXN1bHQiLCAiZ2FsbGVyeSIsICJlcnJvciIsICJleHRlbnNpb25JZGVudGlmaWVyIiwgIm1hbmlmZXN0IiwgInRhc2siLCAidW5pbnN0YWxsRXh0ZW5zaW9uVGFzayJdCn0K
