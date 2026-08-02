var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _internalOrg;
import * as nls from "../../../../nls.js";
import severity from "../../../../base/common/severity.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { IActivityService, NumberBadge, ProgressBadge } from "../../../services/activity/common/activity.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUpdateService, StateType } from "../../../../platform/update/common/update.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { ReleaseNotesManager } from "./releaseNotesEditor.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { RawContextKey, IContextKeyService, ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { MenuRegistry, MenuId, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, SyncStatus } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { Promises, Throttler } from "../../../../base/common/async.js";
import { IUserDataSyncWorkbenchService } from "../../../services/userDataSync/common/userDataSync.js";
import { Event } from "../../../../base/common/event.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { getInternalOrg } from "../../../../platform/assignment/common/assignment.js";
import { tryParseVersion } from "../common/updateUtils.js";
const CONTEXT_UPDATE_STATE = new RawContextKey("updateState", StateType.Uninitialized);
const MAJOR_MINOR_UPDATE_AVAILABLE = new RawContextKey("majorMinorUpdateAvailable", false);
let releaseNotesManager = void 0;
function showReleaseNotesInEditor(instantiationService, version, useCurrentFile) {
  if (!releaseNotesManager) {
    releaseNotesManager = instantiationService.createInstance(ReleaseNotesManager);
  }
  return releaseNotesManager.show(version, useCurrentFile);
}
async function openLatestReleaseNotesInBrowser(accessor) {
  const openerService = accessor.get(IOpenerService);
  const productService = accessor.get(IProductService);
  if (productService.releaseNotesUrl) {
    const uri = URI.parse(productService.releaseNotesUrl);
    await openerService.open(uri);
  } else {
    throw new Error(nls.localize("update.noReleaseNotesOnline", "This version of {0} does not have release notes online", productService.nameLong));
  }
}
async function showReleaseNotes(accessor, version) {
  const instantiationService = accessor.get(IInstantiationService);
  try {
    await showReleaseNotesInEditor(instantiationService, version, false);
  } catch (err) {
    try {
      await instantiationService.invokeFunction(openLatestReleaseNotesInBrowser);
    } catch (err2) {
      throw new Error(`${err.message} and ${err2.message}`);
    }
  }
}
function appendUpdateMenuItems(menuId, group) {
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.check",
      title: nls.localize("checkForUpdates", "Check for Updates...")
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Idle)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.checking",
      title: nls.localize("checkingForUpdates2", "Checking for Updates..."),
      precondition: ContextKeyExpr.false()
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.CheckingForUpdates)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.downloadNow",
      title: nls.localize("download update_1", "Download Update (1)")
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.AvailableForDownload)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.downloading",
      title: nls.localize("DownloadingUpdate", "Downloading Update..."),
      precondition: ContextKeyExpr.false()
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Downloading)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.install",
      title: nls.localize("installUpdate...", "Install Update... (1)")
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Downloaded)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.updating",
      title: nls.localize("installingUpdate", "Installing Update..."),
      precondition: ContextKeyExpr.false()
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Updating)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.cancelling",
      title: nls.localize("cancellingUpdateMenuEntry", "Cancelling Update..."),
      precondition: ContextKeyExpr.false()
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Cancelling)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    order: 2,
    command: {
      id: "update.restart",
      title: nls.localize("restartToUpdate", "Restart to Update (1)")
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Ready)
  });
}
function isMajorMinorUpdate(before, after) {
  return before.major < after.major || before.minor < after.minor;
}
let ProductContribution = class {
  constructor(storageService, instantiationService, notificationService, environmentService, openerService, configurationService, hostService, productService) {
    if (isWeb) {
      return;
    }
    hostService.hadLastFocus().then(async (hadLastFocus) => {
      if (!hadLastFocus) {
        return;
      }
      const lastVersion = tryParseVersion(storageService.get(ProductContribution.KEY, StorageScope.APPLICATION, ""));
      const currentVersion = tryParseVersion(productService.version);
      const shouldShowReleaseNotes = configurationService.getValue("update.showReleaseNotes");
      const shouldShowPostInstallInfo = configurationService.getValue("update.showPostInstallInfo");
      const releaseNotesUrl = productService.releaseNotesUrl;
      if (shouldShowReleaseNotes && !shouldShowPostInstallInfo && !environmentService.skipReleaseNotes && releaseNotesUrl && lastVersion && currentVersion && isMajorMinorUpdate(lastVersion, currentVersion)) {
        showReleaseNotesInEditor(instantiationService, productService.version, false).then(void 0, () => {
          notificationService.prompt(
            severity.Info,
            nls.localize("read the release notes", "Welcome to {0} v{1}! Would you like to read the Release Notes?", productService.nameLong, productService.version),
            [{
              label: nls.localize("releaseNotes", "Release Notes"),
              run: () => {
                const uri = URI.parse(releaseNotesUrl);
                openerService.open(uri);
              }
            }],
            { priority: NotificationPriority.OPTIONAL }
          );
        });
      }
      storageService.store(ProductContribution.KEY, productService.version, StorageScope.APPLICATION, StorageTarget.MACHINE);
    });
  }
};
ProductContribution.KEY = "releaseNotes/lastVersion";
ProductContribution = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IBrowserWorkbenchEnvironmentService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IHostService),
  __decorateParam(7, IProductService)
], ProductContribution);
let UpdateContribution = class extends Disposable {
  constructor(storageService, instantiationService, dialogService, updateService, activityService, contextKeyService, productService, hostService) {
    super();
    this.instantiationService = instantiationService;
    this.dialogService = dialogService;
    this.updateService = updateService;
    this.activityService = activityService;
    this.productService = productService;
    this.hostService = hostService;
    this.badgeDisposable = this._register(new MutableDisposable());
    this.state = updateService.state;
    this.updateStateContextKey = CONTEXT_UPDATE_STATE.bindTo(contextKeyService);
    this.majorMinorUpdateAvailableContextKey = MAJOR_MINOR_UPDATE_AVAILABLE.bindTo(contextKeyService);
    this._register(updateService.onStateChange(this.onUpdateStateChange, this));
    this.onUpdateStateChange(this.updateService.state);
    const currentVersion = this.productService.commit;
    const lastKnownVersion = storageService.get("update/lastKnownVersion", StorageScope.APPLICATION);
    if (currentVersion !== lastKnownVersion) {
      storageService.remove("update/lastKnownVersion", StorageScope.APPLICATION);
      storageService.remove("update/updateNotificationTime", StorageScope.APPLICATION);
    }
    this.registerGlobalActivityActions();
  }
  async onUpdateStateChange(state) {
    this.updateStateContextKey.set(state.type);
    switch (state.type) {
      case StateType.Idle:
        if (state.notAvailable && !state.error && await this.hostService.hadLastFocus()) {
          this.dialogService.info(nls.localize("noUpdatesAvailable", "There are currently no updates available."));
        }
        break;
      case StateType.Ready: {
        const productVersion = state.update.productVersion;
        if (productVersion) {
          const currentVersion = tryParseVersion(this.productService.version);
          const nextVersion = tryParseVersion(productVersion);
          this.majorMinorUpdateAvailableContextKey.set(Boolean(currentVersion && nextVersion && isMajorMinorUpdate(currentVersion, nextVersion)));
        }
        break;
      }
    }
    let badge = void 0;
    if (state.type === StateType.AvailableForDownload || state.type === StateType.Downloaded || state.type === StateType.Ready) {
      badge = new NumberBadge(1, () => nls.localize("updateIsReady", "New {0} update available.", this.productService.nameShort));
    } else if (state.type === StateType.CheckingForUpdates) {
      badge = new ProgressBadge(() => nls.localize("checkingForUpdates", "Checking for {0} updates...", this.productService.nameShort));
    } else if (state.type === StateType.Downloading || state.type === StateType.Overwriting) {
      badge = new ProgressBadge(() => nls.localize("downloading", "Downloading {0} update...", this.productService.nameShort));
    } else if (state.type === StateType.Updating) {
      badge = new ProgressBadge(() => nls.localize("updating", "Updating {0}...", this.productService.nameShort));
    } else if (state.type === StateType.Cancelling) {
      badge = new ProgressBadge(() => nls.localize("cancellingUpdate", "Cancelling {0} update...", this.productService.nameShort));
    }
    this.badgeDisposable.clear();
    if (badge) {
      this.badgeDisposable.value = this.activityService.showGlobalActivity({ badge });
    }
    this.state = state;
  }
  registerGlobalActivityActions() {
    CommandsRegistry.registerCommand("update.check", () => this.updateService.checkForUpdates(true));
    CommandsRegistry.registerCommand("update.checking", () => {
    });
    CommandsRegistry.registerCommand("update.downloadNow", () => this.updateService.downloadUpdate(true));
    CommandsRegistry.registerCommand("update.downloading", () => {
    });
    CommandsRegistry.registerCommand("update.install", () => this.updateService.applyUpdate());
    CommandsRegistry.registerCommand("update.updating", () => {
    });
    CommandsRegistry.registerCommand("update.cancelling", () => {
    });
    CommandsRegistry.registerCommand("update.restart", () => this.updateService.quitAndInstall());
    CommandsRegistry.registerCommand("_update.state", () => {
      return this.state;
    });
    appendUpdateMenuItems(MenuId.GlobalActivity, "7_update");
    if (this.productService.quality === "stable") {
      CommandsRegistry.registerCommand("update.showUpdateReleaseNotes", () => {
        if (this.updateService.state.type !== StateType.Ready) {
          return;
        }
        const productVersion = this.updateService.state.update.productVersion;
        if (productVersion) {
          this.instantiationService.invokeFunction((accessor) => showReleaseNotes(accessor, productVersion));
        }
      });
      MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
        group: "7_update",
        order: 1,
        command: {
          id: "update.showUpdateReleaseNotes",
          title: nls.localize("showUpdateReleaseNotes", "Show Update Release Notes")
        },
        when: ContextKeyExpr.and(CONTEXT_UPDATE_STATE.isEqualTo(StateType.Ready), MAJOR_MINOR_UPDATE_AVAILABLE)
      });
    }
  }
};
UpdateContribution = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IUpdateService),
  __decorateParam(4, IActivityService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IHostService)
], UpdateContribution);
let SwitchProductQualityContribution = class extends Disposable {
  constructor(productService, environmentService) {
    super();
    this.productService = productService;
    this.environmentService = environmentService;
    this.registerGlobalActivityActions();
  }
  registerGlobalActivityActions() {
    const quality = this.productService.quality;
    const productQualityChangeHandler = this.environmentService.options?.productQualityChangeHandler;
    if (productQualityChangeHandler && (quality === "stable" || quality === "insider")) {
      const newQuality = quality === "stable" ? "insider" : "stable";
      const commandId = `update.switchQuality.${newQuality}`;
      const isSwitchingToInsiders = newQuality === "insider";
      this._register(registerAction2(class SwitchQuality extends Action2 {
        constructor() {
          super({
            id: commandId,
            title: isSwitchingToInsiders ? nls.localize("switchToInsiders", "Switch to Insiders Version...") : nls.localize("switchToStable", "Switch to Stable Version..."),
            precondition: IsWebContext,
            menu: {
              id: MenuId.GlobalActivity,
              when: IsWebContext,
              group: "7_update"
            }
          });
        }
        async run(accessor) {
          const dialogService = accessor.get(IDialogService);
          const userDataSyncEnablementService = accessor.get(IUserDataSyncEnablementService);
          const userDataSyncStoreManagementService = accessor.get(IUserDataSyncStoreManagementService);
          const storageService = accessor.get(IStorageService);
          const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
          const userDataSyncService = accessor.get(IUserDataSyncService);
          const notificationService = accessor.get(INotificationService);
          try {
            const selectSettingsSyncServiceDialogShownKey = "switchQuality.selectSettingsSyncServiceDialogShown";
            const userDataSyncStore = userDataSyncStoreManagementService.userDataSyncStore;
            let userDataSyncStoreType;
            if (userDataSyncStore && isSwitchingToInsiders && userDataSyncEnablementService.isEnabled() && !storageService.getBoolean(selectSettingsSyncServiceDialogShownKey, StorageScope.APPLICATION, false)) {
              userDataSyncStoreType = await this.selectSettingsSyncService(dialogService);
              if (!userDataSyncStoreType) {
                return;
              }
              storageService.store(selectSettingsSyncServiceDialogShownKey, true, StorageScope.APPLICATION, StorageTarget.USER);
              if (userDataSyncStoreType === "stable") {
                await userDataSyncStoreManagementService.switch(userDataSyncStoreType);
              }
            }
            const res = await dialogService.confirm({
              type: "info",
              message: nls.localize("relaunchMessage", "Changing the version requires a reload to take effect"),
              detail: newQuality === "insider" ? nls.localize("relaunchDetailInsiders", "Press the reload button to switch to the Insiders version of VS Code.") : nls.localize("relaunchDetailStable", "Press the reload button to switch to the Stable version of VS Code."),
              primaryButton: nls.localize({ key: "reload", comment: ["&& denotes a mnemonic"] }, "&&Reload")
            });
            if (res.confirmed) {
              const promises = [];
              if (userDataSyncService.status === SyncStatus.Syncing) {
                promises.push(Event.toPromise(Event.filter(userDataSyncService.onDidChangeStatus, (status) => status !== SyncStatus.Syncing)));
              }
              if (isSwitchingToInsiders && userDataSyncStoreType) {
                promises.push(userDataSyncWorkbenchService.synchroniseUserDataSyncStoreType());
              }
              await Promises.settled(promises);
              productQualityChangeHandler(newQuality);
            } else {
              if (userDataSyncStoreType) {
                storageService.remove(selectSettingsSyncServiceDialogShownKey, StorageScope.APPLICATION);
              }
            }
          } catch (error) {
            notificationService.error(error);
          }
        }
        async selectSettingsSyncService(dialogService) {
          const { result } = await dialogService.prompt({
            type: Severity.Info,
            message: nls.localize("selectSyncService.message", "Choose the settings sync service to use after changing the version"),
            detail: nls.localize("selectSyncService.detail", "The Insiders version of VS Code will synchronize your settings, keybindings, extensions, snippets and UI State using separate insiders settings sync service by default."),
            buttons: [
              {
                label: nls.localize({ key: "use insiders", comment: ["&& denotes a mnemonic"] }, "&&Insiders"),
                run: () => "insiders"
              },
              {
                label: nls.localize({ key: "use stable", comment: ["&& denotes a mnemonic"] }, "&&Stable (current)"),
                run: () => "stable"
              }
            ],
            cancelButton: true
          });
          return result;
        }
      }));
    }
  }
};
SwitchProductQualityContribution = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IBrowserWorkbenchEnvironmentService)
], SwitchProductQualityContribution);
let DefaultAccountUpdateContribution = class extends Disposable {
  constructor(updateService, defaultAccountService, storageService) {
    super();
    this.updateService = updateService;
    this.defaultAccountService = defaultAccountService;
    this.storageService = storageService;
    __privateAdd(this, _internalOrg);
    this.throttler = this._register(new Throttler());
    if (isWeb) {
      return;
    }
    __privateSet(this, _internalOrg, this.storageService.get(DefaultAccountUpdateContribution.STORAGE_KEY, StorageScope.APPLICATION, void 0));
    this.throttler.queue(() => this.updateService.setInternalOrg(__privateGet(this, _internalOrg)));
    this.refresh();
    this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.refresh()));
  }
  refresh() {
    this.throttler.queue(() => this.doRefresh());
  }
  async doRefresh() {
    try {
      const defaultAccount = await this.defaultAccountService.getDefaultAccount();
      const internalOrg = getInternalOrg(defaultAccount?.entitlementsData?.organization_login_list);
      if (internalOrg === __privateGet(this, _internalOrg)) {
        return;
      }
      __privateSet(this, _internalOrg, internalOrg);
      await this.updateService.setInternalOrg(__privateGet(this, _internalOrg));
      if (__privateGet(this, _internalOrg)) {
        this.storageService.store(DefaultAccountUpdateContribution.STORAGE_KEY, internalOrg, StorageScope.APPLICATION, StorageTarget.MACHINE);
      } else {
        this.storageService.remove(DefaultAccountUpdateContribution.STORAGE_KEY, StorageScope.APPLICATION);
      }
    } catch (error) {
    }
  }
};
_internalOrg = new WeakMap();
DefaultAccountUpdateContribution.STORAGE_KEY = "update/internalOrg";
DefaultAccountUpdateContribution = __decorateClass([
  __decorateParam(0, IUpdateService),
  __decorateParam(1, IDefaultAccountService),
  __decorateParam(2, IStorageService)
], DefaultAccountUpdateContribution);
export {
  CONTEXT_UPDATE_STATE,
  DefaultAccountUpdateContribution,
  MAJOR_MINOR_UPDATE_AVAILABLE,
  ProductContribution,
  SwitchProductQualityContribution,
  UpdateContribution,
  appendUpdateMenuItems,
  showReleaseNotesInEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VwZGF0ZS9icm93c2VyL3VwZGF0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZpdHlTZXJ2aWNlLCBOdW1iZXJCYWRnZSwgSUJhZGdlLCBQcm9ncmVzc0JhZGdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVcGRhdGVTZXJ2aWNlLCBTdGF0ZSBhcyBVcGRhdGVTdGF0ZSwgU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIE5vdGlmaWNhdGlvblByaW9yaXR5LCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlbGVhc2VOb3Rlc01hbmFnZXIgfSBmcm9tICcuL3JlbGVhc2VOb3Rlc0VkaXRvci5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgUmF3Q29udGV4dEtleSwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IE1lbnVSZWdpc3RyeSwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIsIEFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsIFN5bmNTdGF0dXMsIFVzZXJEYXRhU3luY1N0b3JlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElzV2ViQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFByb21pc2VzLCBUaHJvdHRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBnZXRJbnRlcm5hbE9yZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnQuanMnO1xuaW1wb3J0IHsgSVZlcnNpb24sIHRyeVBhcnNlVmVyc2lvbiB9IGZyb20gJy4uL2NvbW1vbi91cGRhdGVVdGlscy5qcyc7XG5cbmV4cG9ydCBjb25zdCBDT05URVhUX1VQREFURV9TVEFURSA9IG5ldyBSYXdDb250ZXh0S2V5PHN0cmluZz4oJ3VwZGF0ZVN0YXRlJywgU3RhdGVUeXBlLlVuaW5pdGlhbGl6ZWQpO1xuZXhwb3J0IGNvbnN0IE1BSk9SX01JTk9SX1VQREFURV9BVkFJTEFCTEUgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignbWFqb3JNaW5vclVwZGF0ZUF2YWlsYWJsZScsIGZhbHNlKTtcblxubGV0IHJlbGVhc2VOb3Rlc01hbmFnZXI6IFJlbGVhc2VOb3Rlc01hbmFnZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93UmVsZWFzZU5vdGVzSW5FZGl0b3IoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgdmVyc2lvbjogc3RyaW5nLCB1c2VDdXJyZW50RmlsZTogYm9vbGVhbikge1xuXHRpZiAoIXJlbGVhc2VOb3Rlc01hbmFnZXIpIHtcblx0XHRyZWxlYXNlTm90ZXNNYW5hZ2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVsZWFzZU5vdGVzTWFuYWdlcik7XG5cdH1cblxuXHRyZXR1cm4gcmVsZWFzZU5vdGVzTWFuYWdlci5zaG93KHZlcnNpb24sIHVzZUN1cnJlbnRGaWxlKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gb3BlbkxhdGVzdFJlbGVhc2VOb3Rlc0luQnJvd3NlcihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb2R1Y3RTZXJ2aWNlKTtcblxuXHRpZiAocHJvZHVjdFNlcnZpY2UucmVsZWFzZU5vdGVzVXJsKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHByb2R1Y3RTZXJ2aWNlLnJlbGVhc2VOb3Rlc1VybCk7XG5cdFx0YXdhaXQgb3BlbmVyU2VydmljZS5vcGVuKHVyaSk7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgndXBkYXRlLm5vUmVsZWFzZU5vdGVzT25saW5lJywgXCJUaGlzIHZlcnNpb24gb2YgezB9IGRvZXMgbm90IGhhdmUgcmVsZWFzZSBub3RlcyBvbmxpbmVcIiwgcHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpKTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBzaG93UmVsZWFzZU5vdGVzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2ZXJzaW9uOiBzdHJpbmcpIHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0dHJ5IHtcblx0XHRhd2FpdCBzaG93UmVsZWFzZU5vdGVzSW5FZGl0b3IoaW5zdGFudGlhdGlvblNlcnZpY2UsIHZlcnNpb24sIGZhbHNlKTtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKG9wZW5MYXRlc3RSZWxlYXNlTm90ZXNJbkJyb3dzZXIpO1xuXHRcdH0gY2F0Y2ggKGVycjIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgJHtlcnIubWVzc2FnZX0gYW5kICR7ZXJyMi5tZXNzYWdlfWApO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEFwcGVuZHMgdXBkYXRlLXJlbGF0ZWQgbWVudSBpdGVtcyB0byB0aGUgZ2l2ZW4gbWVudS4gVGhpcyByZWdpc3RlcnMgbWVudSBpdGVtc1xuICogZm9yIGFsbCB1cGRhdGUgc3RhdGVzIChpZGxlLCBjaGVja2luZywgZG93bmxvYWRpbmcsIGV0Yy4pIHRoYXQgc2hvdyB0aGUgY3VycmVudFxuICogdXBkYXRlIHN0YXR1cy4gVGhlIHVuZGVybHlpbmcgY29tbWFuZHMgKGB1cGRhdGUuY2hlY2tgLCBgdXBkYXRlLnJlc3RhcnRgLCBldGMuKVxuICogbXVzdCBiZSByZWdpc3RlcmVkIHNlcGFyYXRlbHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcHBlbmRVcGRhdGVNZW51SXRlbXMobWVudUlkOiBNZW51SWQsIGdyb3VwOiBzdHJpbmcpOiB2b2lkIHtcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdGdyb3VwLFxuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiAndXBkYXRlLmNoZWNrJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NoZWNrRm9yVXBkYXRlcycsIFwiQ2hlY2sgZm9yIFVwZGF0ZXMuLi5cIilcblx0XHR9LFxuXHRcdHdoZW46IENPTlRFWFRfVVBEQVRFX1NUQVRFLmlzRXF1YWxUbyhTdGF0ZVR5cGUuSWRsZSlcblx0fSk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdGdyb3VwLFxuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiAndXBkYXRlLmNoZWNraW5nJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NoZWNraW5nRm9yVXBkYXRlczInLCBcIkNoZWNraW5nIGZvciBVcGRhdGVzLi4uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5mYWxzZSgpXG5cdFx0fSxcblx0XHR3aGVuOiBDT05URVhUX1VQREFURV9TVEFURS5pc0VxdWFsVG8oU3RhdGVUeXBlLkNoZWNraW5nRm9yVXBkYXRlcylcblx0fSk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdGdyb3VwLFxuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiAndXBkYXRlLmRvd25sb2FkTm93Jyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2Rvd25sb2FkIHVwZGF0ZV8xJywgXCJEb3dubG9hZCBVcGRhdGUgKDEpXCIpXG5cdFx0fSxcblx0XHR3aGVuOiBDT05URVhUX1VQREFURV9TVEFURS5pc0VxdWFsVG8oU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkKVxuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudUlkLCB7XG5cdFx0Z3JvdXAsXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6ICd1cGRhdGUuZG93bmxvYWRpbmcnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnRG93bmxvYWRpbmdVcGRhdGUnLCBcIkRvd25sb2FkaW5nIFVwZGF0ZS4uLlwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZmFsc2UoKVxuXHRcdH0sXG5cdFx0d2hlbjogQ09OVEVYVF9VUERBVEVfU1RBVEUuaXNFcXVhbFRvKFN0YXRlVHlwZS5Eb3dubG9hZGluZylcblx0fSk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdGdyb3VwLFxuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiAndXBkYXRlLmluc3RhbGwnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnaW5zdGFsbFVwZGF0ZS4uLicsIFwiSW5zdGFsbCBVcGRhdGUuLi4gKDEpXCIpXG5cdFx0fSxcblx0XHR3aGVuOiBDT05URVhUX1VQREFURV9TVEFURS5pc0VxdWFsVG8oU3RhdGVUeXBlLkRvd25sb2FkZWQpXG5cdH0pO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIHtcblx0XHRncm91cCxcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogJ3VwZGF0ZS51cGRhdGluZycsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdpbnN0YWxsaW5nVXBkYXRlJywgXCJJbnN0YWxsaW5nIFVwZGF0ZS4uLlwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZmFsc2UoKVxuXHRcdH0sXG5cdFx0d2hlbjogQ09OVEVYVF9VUERBVEVfU1RBVEUuaXNFcXVhbFRvKFN0YXRlVHlwZS5VcGRhdGluZylcblx0fSk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdGdyb3VwLFxuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiAndXBkYXRlLmNhbmNlbGxpbmcnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2FuY2VsbGluZ1VwZGF0ZU1lbnVFbnRyeScsIFwiQ2FuY2VsbGluZyBVcGRhdGUuLi5cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmZhbHNlKClcblx0XHR9LFxuXHRcdHdoZW46IENPTlRFWFRfVVBEQVRFX1NUQVRFLmlzRXF1YWxUbyhTdGF0ZVR5cGUuQ2FuY2VsbGluZylcblx0fSk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdGdyb3VwLFxuXHRcdG9yZGVyOiAyLFxuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiAndXBkYXRlLnJlc3RhcnQnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgncmVzdGFydFRvVXBkYXRlJywgXCJSZXN0YXJ0IHRvIFVwZGF0ZSAoMSlcIilcblx0XHR9LFxuXHRcdHdoZW46IENPTlRFWFRfVVBEQVRFX1NUQVRFLmlzRXF1YWxUbyhTdGF0ZVR5cGUuUmVhZHkpXG5cdH0pO1xufVxuXG5mdW5jdGlvbiBpc01ham9yTWlub3JVcGRhdGUoYmVmb3JlOiBJVmVyc2lvbiwgYWZ0ZXI6IElWZXJzaW9uKTogYm9vbGVhbiB7XG5cdHJldHVybiBiZWZvcmUubWFqb3IgPCBhZnRlci5tYWpvciB8fCBiZWZvcmUubWlub3IgPCBhZnRlci5taW5vcjtcbn1cblxuZXhwb3J0IGNsYXNzIFByb2R1Y3RDb250cmlidXRpb24gaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBLRVkgPSAncmVsZWFzZU5vdGVzL2xhc3RWZXJzaW9uJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGhvc3RTZXJ2aWNlLmhhZExhc3RGb2N1cygpLnRoZW4oYXN5bmMgaGFkTGFzdEZvY3VzID0+IHtcblx0XHRcdGlmICghaGFkTGFzdEZvY3VzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGFzdFZlcnNpb24gPSB0cnlQYXJzZVZlcnNpb24oc3RvcmFnZVNlcnZpY2UuZ2V0KFByb2R1Y3RDb250cmlidXRpb24uS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sICcnKSk7XG5cdFx0XHRjb25zdCBjdXJyZW50VmVyc2lvbiA9IHRyeVBhcnNlVmVyc2lvbihwcm9kdWN0U2VydmljZS52ZXJzaW9uKTtcblx0XHRcdGNvbnN0IHNob3VsZFNob3dSZWxlYXNlTm90ZXMgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPigndXBkYXRlLnNob3dSZWxlYXNlTm90ZXMnKTtcblx0XHRcdGNvbnN0IHNob3VsZFNob3dQb3N0SW5zdGFsbEluZm8gPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPigndXBkYXRlLnNob3dQb3N0SW5zdGFsbEluZm8nKTtcblx0XHRcdGNvbnN0IHJlbGVhc2VOb3Rlc1VybCA9IHByb2R1Y3RTZXJ2aWNlLnJlbGVhc2VOb3Rlc1VybDtcblxuXHRcdFx0Ly8gd2FzIHRoZXJlIGEgbWFqb3IvbWlub3IgdXBkYXRlPyBpZiBzbywgb3BlbiByZWxlYXNlIG5vdGVzICh1bmxlc3MgcG9zdC1pbnN0YWxsIGluZm8gaXMgZW5hYmxlZCwgd2hpY2ggdGFrZXMgb3Zlcilcblx0XHRcdGlmIChzaG91bGRTaG93UmVsZWFzZU5vdGVzICYmICFzaG91bGRTaG93UG9zdEluc3RhbGxJbmZvICYmICFlbnZpcm9ubWVudFNlcnZpY2Uuc2tpcFJlbGVhc2VOb3RlcyAmJiByZWxlYXNlTm90ZXNVcmwgJiYgbGFzdFZlcnNpb24gJiYgY3VycmVudFZlcnNpb24gJiYgaXNNYWpvck1pbm9yVXBkYXRlKGxhc3RWZXJzaW9uLCBjdXJyZW50VmVyc2lvbikpIHtcblx0XHRcdFx0c2hvd1JlbGVhc2VOb3Rlc0luRWRpdG9yKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBwcm9kdWN0U2VydmljZS52ZXJzaW9uLCBmYWxzZSlcblx0XHRcdFx0XHQudGhlbih1bmRlZmluZWQsICgpID0+IHtcblx0XHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRcdFx0XHRzZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3JlYWQgdGhlIHJlbGVhc2Ugbm90ZXMnLCBcIldlbGNvbWUgdG8gezB9IHZ7MX0hIFdvdWxkIHlvdSBsaWtlIHRvIHJlYWQgdGhlIFJlbGVhc2UgTm90ZXM/XCIsIHByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nLCBwcm9kdWN0U2VydmljZS52ZXJzaW9uKSxcblx0XHRcdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZWxlYXNlTm90ZXMnLCBcIlJlbGVhc2UgTm90ZXNcIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UocmVsZWFzZU5vdGVzVXJsKTtcblx0XHRcdFx0XHRcdFx0XHRcdG9wZW5lclNlcnZpY2Uub3Blbih1cmkpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRcdHsgcHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5Lk9QVElPTkFMIH1cblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFByb2R1Y3RDb250cmlidXRpb24uS0VZLCBwcm9kdWN0U2VydmljZS52ZXJzaW9uLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFVwZGF0ZUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHN0YXRlOiBVcGRhdGVTdGF0ZTtcblx0cHJpdmF0ZSByZWFkb25seSBiYWRnZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgdXBkYXRlU3RhdGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIG1ham9yTWlub3JVcGRhdGVBdmFpbGFibGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElVcGRhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlU2VydmljZTogSVVwZGF0ZVNlcnZpY2UsXG5cdFx0QElBY3Rpdml0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc3RhdGUgPSB1cGRhdGVTZXJ2aWNlLnN0YXRlO1xuXHRcdHRoaXMudXBkYXRlU3RhdGVDb250ZXh0S2V5ID0gQ09OVEVYVF9VUERBVEVfU1RBVEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLm1ham9yTWlub3JVcGRhdGVBdmFpbGFibGVDb250ZXh0S2V5ID0gTUFKT1JfTUlOT1JfVVBEQVRFX0FWQUlMQUJMRS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodXBkYXRlU2VydmljZS5vblN0YXRlQ2hhbmdlKHRoaXMub25VcGRhdGVTdGF0ZUNoYW5nZSwgdGhpcykpO1xuXHRcdHRoaXMub25VcGRhdGVTdGF0ZUNoYW5nZSh0aGlzLnVwZGF0ZVNlcnZpY2Uuc3RhdGUpO1xuXG5cdFx0Lypcblx0XHRUaGUgYHVwZGF0ZS9sYXN0S25vd25WZXJzaW9uYCBhbmQgYHVwZGF0ZS91cGRhdGVOb3RpZmljYXRpb25UaW1lYCBzdG9yYWdlIGtleXMgYXJlIHVzZWQgaW5cblx0XHRjb21iaW5hdGlvbiB0byBmaWd1cmUgb3V0IHdoZW4gdG8gc2hvdyBhIG1lc3NhZ2UgdG8gdGhlIHVzZXIgdGhhdCBoZSBzaG91bGQgdXBkYXRlLlxuXG5cdFx0VGhpcyBtZXNzYWdlIHNob3VsZCBhcHBlYXIgaWYgdGhlIHVzZXIgaGFzIHJlY2VpdmVkIGFuIHVwZGF0ZSBub3RpZmljYXRpb24gYnV0IGhhc24ndFxuXHRcdHVwZGF0ZWQgc2luY2UgNSBkYXlzLlxuXHRcdCovXG5cblx0XHRjb25zdCBjdXJyZW50VmVyc2lvbiA9IHRoaXMucHJvZHVjdFNlcnZpY2UuY29tbWl0O1xuXHRcdGNvbnN0IGxhc3RLbm93blZlcnNpb24gPSBzdG9yYWdlU2VydmljZS5nZXQoJ3VwZGF0ZS9sYXN0S25vd25WZXJzaW9uJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblxuXHRcdC8vIGlmIGN1cnJlbnQgdmVyc2lvbiAhPSBzdG9yZWQgdmVyc2lvbiwgY2xlYXIgYm90aCBmaWVsZHNcblx0XHRpZiAoY3VycmVudFZlcnNpb24gIT09IGxhc3RLbm93blZlcnNpb24pIHtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnJlbW92ZSgndXBkYXRlL2xhc3RLbm93blZlcnNpb24nLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdFx0c3RvcmFnZVNlcnZpY2UucmVtb3ZlKCd1cGRhdGUvdXBkYXRlTm90aWZpY2F0aW9uVGltZScsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZWdpc3Rlckdsb2JhbEFjdGl2aXR5QWN0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvblVwZGF0ZVN0YXRlQ2hhbmdlKHN0YXRlOiBVcGRhdGVTdGF0ZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudXBkYXRlU3RhdGVDb250ZXh0S2V5LnNldChzdGF0ZS50eXBlKTtcblxuXHRcdHN3aXRjaCAoc3RhdGUudHlwZSkge1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuSWRsZTpcblx0XHRcdFx0Ly8gVGhlbWVkIGRpYWxvZyBzaG93biBmcm9tIHRoZSBsYXN0IGZvY3VzZWQgd2luZG93OyB0aGUgd2luZG93bGVzcyBtYWNPUyBjYXNlIGlzIGhhbmRsZWQgYnkgdGhlIG1haW4gcHJvY2Vzcy5cblx0XHRcdFx0aWYgKHN0YXRlLm5vdEF2YWlsYWJsZSAmJiAhc3RhdGUuZXJyb3IgJiYgYXdhaXQgdGhpcy5ob3N0U2VydmljZS5oYWRMYXN0Rm9jdXMoKSkge1xuXHRcdFx0XHRcdHRoaXMuZGlhbG9nU2VydmljZS5pbmZvKG5scy5sb2NhbGl6ZSgnbm9VcGRhdGVzQXZhaWxhYmxlJywgXCJUaGVyZSBhcmUgY3VycmVudGx5IG5vIHVwZGF0ZXMgYXZhaWxhYmxlLlwiKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLlJlYWR5OiB7XG5cdFx0XHRcdGNvbnN0IHByb2R1Y3RWZXJzaW9uID0gc3RhdGUudXBkYXRlLnByb2R1Y3RWZXJzaW9uO1xuXHRcdFx0XHRpZiAocHJvZHVjdFZlcnNpb24pIHtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50VmVyc2lvbiA9IHRyeVBhcnNlVmVyc2lvbih0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24pO1xuXHRcdFx0XHRcdGNvbnN0IG5leHRWZXJzaW9uID0gdHJ5UGFyc2VWZXJzaW9uKHByb2R1Y3RWZXJzaW9uKTtcblx0XHRcdFx0XHR0aGlzLm1ham9yTWlub3JVcGRhdGVBdmFpbGFibGVDb250ZXh0S2V5LnNldChCb29sZWFuKGN1cnJlbnRWZXJzaW9uICYmIG5leHRWZXJzaW9uICYmIGlzTWFqb3JNaW5vclVwZGF0ZShjdXJyZW50VmVyc2lvbiwgbmV4dFZlcnNpb24pKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGJhZGdlOiBJQmFkZ2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAoc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkIHx8IHN0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5Eb3dubG9hZGVkIHx8IHN0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5SZWFkeSkge1xuXHRcdFx0YmFkZ2UgPSBuZXcgTnVtYmVyQmFkZ2UoMSwgKCkgPT4gbmxzLmxvY2FsaXplKCd1cGRhdGVJc1JlYWR5JywgXCJOZXcgezB9IHVwZGF0ZSBhdmFpbGFibGUuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KSk7XG5cdFx0fSBlbHNlIGlmIChzdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuQ2hlY2tpbmdGb3JVcGRhdGVzKSB7XG5cdFx0XHRiYWRnZSA9IG5ldyBQcm9ncmVzc0JhZGdlKCgpID0+IG5scy5sb2NhbGl6ZSgnY2hlY2tpbmdGb3JVcGRhdGVzJywgXCJDaGVja2luZyBmb3IgezB9IHVwZGF0ZXMuLi5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lU2hvcnQpKTtcblx0XHR9IGVsc2UgaWYgKHN0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5Eb3dubG9hZGluZyB8fCBzdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuT3ZlcndyaXRpbmcpIHtcblx0XHRcdGJhZGdlID0gbmV3IFByb2dyZXNzQmFkZ2UoKCkgPT4gbmxzLmxvY2FsaXplKCdkb3dubG9hZGluZycsIFwiRG93bmxvYWRpbmcgezB9IHVwZGF0ZS4uLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCkpO1xuXHRcdH0gZWxzZSBpZiAoc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLlVwZGF0aW5nKSB7XG5cdFx0XHRiYWRnZSA9IG5ldyBQcm9ncmVzc0JhZGdlKCgpID0+IG5scy5sb2NhbGl6ZSgndXBkYXRpbmcnLCBcIlVwZGF0aW5nIHswfS4uLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCkpO1xuXHRcdH0gZWxzZSBpZiAoc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLkNhbmNlbGxpbmcpIHtcblx0XHRcdGJhZGdlID0gbmV3IFByb2dyZXNzQmFkZ2UoKCkgPT4gbmxzLmxvY2FsaXplKCdjYW5jZWxsaW5nVXBkYXRlJywgXCJDYW5jZWxsaW5nIHswfSB1cGRhdGUuLi5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lU2hvcnQpKTtcblx0XHR9XG5cblx0XHR0aGlzLmJhZGdlRGlzcG9zYWJsZS5jbGVhcigpO1xuXG5cdFx0aWYgKGJhZGdlKSB7XG5cdFx0XHR0aGlzLmJhZGdlRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMuYWN0aXZpdHlTZXJ2aWNlLnNob3dHbG9iYWxBY3Rpdml0eSh7IGJhZGdlIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhdGUgPSBzdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJHbG9iYWxBY3Rpdml0eUFjdGlvbnMoKTogdm9pZCB7XG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3VwZGF0ZS5jaGVjaycsICgpID0+IHRoaXMudXBkYXRlU2VydmljZS5jaGVja0ZvclVwZGF0ZXModHJ1ZSkpO1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd1cGRhdGUuY2hlY2tpbmcnLCAoKSA9PiB7IH0pO1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd1cGRhdGUuZG93bmxvYWROb3cnLCAoKSA9PiB0aGlzLnVwZGF0ZVNlcnZpY2UuZG93bmxvYWRVcGRhdGUodHJ1ZSkpO1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd1cGRhdGUuZG93bmxvYWRpbmcnLCAoKSA9PiB7IH0pO1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd1cGRhdGUuaW5zdGFsbCcsICgpID0+IHRoaXMudXBkYXRlU2VydmljZS5hcHBseVVwZGF0ZSgpKTtcblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgndXBkYXRlLnVwZGF0aW5nJywgKCkgPT4geyB9KTtcblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgndXBkYXRlLmNhbmNlbGxpbmcnLCAoKSA9PiB7IH0pO1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd1cGRhdGUucmVzdGFydCcsICgpID0+IHRoaXMudXBkYXRlU2VydmljZS5xdWl0QW5kSW5zdGFsbCgpKTtcblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnX3VwZGF0ZS5zdGF0ZScsICgpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLnN0YXRlO1xuXHRcdH0pO1xuXG5cdFx0YXBwZW5kVXBkYXRlTWVudUl0ZW1zKE1lbnVJZC5HbG9iYWxBY3Rpdml0eSwgJzdfdXBkYXRlJyk7XG5cblx0XHRpZiAodGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5ID09PSAnc3RhYmxlJykge1xuXHRcdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3VwZGF0ZS5zaG93VXBkYXRlUmVsZWFzZU5vdGVzJywgKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy51cGRhdGVTZXJ2aWNlLnN0YXRlLnR5cGUgIT09IFN0YXRlVHlwZS5SZWFkeSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHByb2R1Y3RWZXJzaW9uID0gdGhpcy51cGRhdGVTZXJ2aWNlLnN0YXRlLnVwZGF0ZS5wcm9kdWN0VmVyc2lvbjtcblx0XHRcdFx0aWYgKHByb2R1Y3RWZXJzaW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBzaG93UmVsZWFzZU5vdGVzKGFjY2Vzc29yLCBwcm9kdWN0VmVyc2lvbikpO1xuXHRcdFx0XHR9XG5cblx0XHRcdH0pO1xuXHRcdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5HbG9iYWxBY3Rpdml0eSwge1xuXHRcdFx0XHRncm91cDogJzdfdXBkYXRlJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRpZDogJ3VwZGF0ZS5zaG93VXBkYXRlUmVsZWFzZU5vdGVzJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzaG93VXBkYXRlUmVsZWFzZU5vdGVzJywgXCJTaG93IFVwZGF0ZSBSZWxlYXNlIE5vdGVzXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1VQREFURV9TVEFURS5pc0VxdWFsVG8oU3RhdGVUeXBlLlJlYWR5KSwgTUFKT1JfTUlOT1JfVVBEQVRFX0FWQUlMQUJMRSlcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3dpdGNoUHJvZHVjdFF1YWxpdHlDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckdsb2JhbEFjdGl2aXR5QWN0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckdsb2JhbEFjdGl2aXR5QWN0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBxdWFsaXR5ID0gdGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5O1xuXHRcdGNvbnN0IHByb2R1Y3RRdWFsaXR5Q2hhbmdlSGFuZGxlciA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LnByb2R1Y3RRdWFsaXR5Q2hhbmdlSGFuZGxlcjtcblx0XHRpZiAocHJvZHVjdFF1YWxpdHlDaGFuZ2VIYW5kbGVyICYmIChxdWFsaXR5ID09PSAnc3RhYmxlJyB8fCBxdWFsaXR5ID09PSAnaW5zaWRlcicpKSB7XG5cdFx0XHRjb25zdCBuZXdRdWFsaXR5ID0gcXVhbGl0eSA9PT0gJ3N0YWJsZScgPyAnaW5zaWRlcicgOiAnc3RhYmxlJztcblx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9IGB1cGRhdGUuc3dpdGNoUXVhbGl0eS4ke25ld1F1YWxpdHl9YDtcblx0XHRcdGNvbnN0IGlzU3dpdGNoaW5nVG9JbnNpZGVycyA9IG5ld1F1YWxpdHkgPT09ICdpbnNpZGVyJztcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTd2l0Y2hRdWFsaXR5IGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkOiBjb21tYW5kSWQsXG5cdFx0XHRcdFx0XHR0aXRsZTogaXNTd2l0Y2hpbmdUb0luc2lkZXJzID8gbmxzLmxvY2FsaXplKCdzd2l0Y2hUb0luc2lkZXJzJywgXCJTd2l0Y2ggdG8gSW5zaWRlcnMgVmVyc2lvbi4uLlwiKSA6IG5scy5sb2NhbGl6ZSgnc3dpdGNoVG9TdGFibGUnLCBcIlN3aXRjaCB0byBTdGFibGUgVmVyc2lvbi4uLlwiKSxcblx0XHRcdFx0XHRcdHByZWNvbmRpdGlvbjogSXNXZWJDb250ZXh0LFxuXHRcdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLkdsb2JhbEFjdGl2aXR5LFxuXHRcdFx0XHRcdFx0XHR3aGVuOiBJc1dlYkNvbnRleHQsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnN191cGRhdGUnLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVzZXJEYXRhU3luY1NlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IHNlbGVjdFNldHRpbmdzU3luY1NlcnZpY2VEaWFsb2dTaG93bktleSA9ICdzd2l0Y2hRdWFsaXR5LnNlbGVjdFNldHRpbmdzU3luY1NlcnZpY2VEaWFsb2dTaG93bic7XG5cdFx0XHRcdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNTdG9yZSA9IHVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UudXNlckRhdGFTeW5jU3RvcmU7XG5cdFx0XHRcdFx0XHRsZXQgdXNlckRhdGFTeW5jU3RvcmVUeXBlOiBVc2VyRGF0YVN5bmNTdG9yZVR5cGUgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRpZiAodXNlckRhdGFTeW5jU3RvcmUgJiYgaXNTd2l0Y2hpbmdUb0luc2lkZXJzICYmIHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpXG5cdFx0XHRcdFx0XHRcdCYmICFzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKHNlbGVjdFNldHRpbmdzU3luY1NlcnZpY2VEaWFsb2dTaG93bktleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSkpIHtcblx0XHRcdFx0XHRcdFx0dXNlckRhdGFTeW5jU3RvcmVUeXBlID0gYXdhaXQgdGhpcy5zZWxlY3RTZXR0aW5nc1N5bmNTZXJ2aWNlKGRpYWxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRcdFx0XHRpZiAoIXVzZXJEYXRhU3luY1N0b3JlVHlwZSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShzZWxlY3RTZXR0aW5nc1N5bmNTZXJ2aWNlRGlhbG9nU2hvd25LZXksIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdFx0XHRcdFx0aWYgKHVzZXJEYXRhU3luY1N0b3JlVHlwZSA9PT0gJ3N0YWJsZScpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBVcGRhdGUgdGhlIHN0YWJsZSBzZXJ2aWNlIHR5cGUgaW4gdGhlIGN1cnJlbnQgd2luZG93LCBzbyB0aGF0IGl0IHVzZXMgc3RhYmxlIHNlcnZpY2UgYWZ0ZXIgc3dpdGNoZWQgdG8gaW5zaWRlcnMgdmVyc2lvbiAoYWZ0ZXIgcmVsb2FkKS5cblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB1c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnN3aXRjaCh1c2VyRGF0YVN5bmNTdG9yZVR5cGUpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdpbmZvJyxcblx0XHRcdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdyZWxhdW5jaE1lc3NhZ2UnLCBcIkNoYW5naW5nIHRoZSB2ZXJzaW9uIHJlcXVpcmVzIGEgcmVsb2FkIHRvIHRha2UgZWZmZWN0XCIpLFxuXHRcdFx0XHRcdFx0XHRkZXRhaWw6IG5ld1F1YWxpdHkgPT09ICdpbnNpZGVyJyA/XG5cdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdyZWxhdW5jaERldGFpbEluc2lkZXJzJywgXCJQcmVzcyB0aGUgcmVsb2FkIGJ1dHRvbiB0byBzd2l0Y2ggdG8gdGhlIEluc2lkZXJzIHZlcnNpb24gb2YgVlMgQ29kZS5cIikgOlxuXHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgncmVsYXVuY2hEZXRhaWxTdGFibGUnLCBcIlByZXNzIHRoZSByZWxvYWQgYnV0dG9uIHRvIHN3aXRjaCB0byB0aGUgU3RhYmxlIHZlcnNpb24gb2YgVlMgQ29kZS5cIiksXG5cdFx0XHRcdFx0XHRcdHByaW1hcnlCdXR0b246IG5scy5sb2NhbGl6ZSh7IGtleTogJ3JlbG9hZCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlbG9hZFwiKVxuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdGlmIChyZXMuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPHVua25vd24+W10gPSBbXTtcblxuXHRcdFx0XHRcdFx0XHQvLyBJZiBzeW5jIGlzIGhhcHBlbmluZyB3YWl0IHVudGlsIGl0IGlzIGZpbmlzaGVkIGJlZm9yZSByZWxvYWRcblx0XHRcdFx0XHRcdFx0aWYgKHVzZXJEYXRhU3luY1NlcnZpY2Uuc3RhdHVzID09PSBTeW5jU3RhdHVzLlN5bmNpbmcpIHtcblx0XHRcdFx0XHRcdFx0XHRwcm9taXNlcy5wdXNoKEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIodXNlckRhdGFTeW5jU2VydmljZS5vbkRpZENoYW5nZVN0YXR1cywgc3RhdHVzID0+IHN0YXR1cyAhPT0gU3luY1N0YXR1cy5TeW5jaW5nKSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0Ly8gSWYgdXNlciBjaG9zZSB0aGUgc3luYyBzZXJ2aWNlIHRoZW4gc3luY2hyb25pc2UgdGhlIHN0b3JlIHR5cGUgb3B0aW9uIGluIGluc2lkZXJzIHNlcnZpY2UsIHNvIHRoYXQgb3RoZXIgY2xpZW50cyB1c2luZyBpbnNpZGVycyBzZXJ2aWNlIGFyZSBhbHNvIHVwZGF0ZWQuXG5cdFx0XHRcdFx0XHRcdGlmIChpc1N3aXRjaGluZ1RvSW5zaWRlcnMgJiYgdXNlckRhdGFTeW5jU3RvcmVUeXBlKSB7XG5cdFx0XHRcdFx0XHRcdFx0cHJvbWlzZXMucHVzaCh1c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLnN5bmNocm9uaXNlVXNlckRhdGFTeW5jU3RvcmVUeXBlKCkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChwcm9taXNlcyk7XG5cblx0XHRcdFx0XHRcdFx0cHJvZHVjdFF1YWxpdHlDaGFuZ2VIYW5kbGVyKG5ld1F1YWxpdHkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gUmVzZXRcblx0XHRcdFx0XHRcdFx0aWYgKHVzZXJEYXRhU3luY1N0b3JlVHlwZSkge1xuXHRcdFx0XHRcdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShzZWxlY3RTZXR0aW5nc1N5bmNTZXJ2aWNlRGlhbG9nU2hvd25LZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cHJpdmF0ZSBhc3luYyBzZWxlY3RTZXR0aW5nc1N5bmNTZXJ2aWNlKGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlKTogUHJvbWlzZTxVc2VyRGF0YVN5bmNTdG9yZVR5cGUgfCB1bmRlZmluZWQ+IHtcblx0XHRcdFx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgZGlhbG9nU2VydmljZS5wcm9tcHQ8VXNlckRhdGFTeW5jU3RvcmVUeXBlPih7XG5cdFx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdzZWxlY3RTeW5jU2VydmljZS5tZXNzYWdlJywgXCJDaG9vc2UgdGhlIHNldHRpbmdzIHN5bmMgc2VydmljZSB0byB1c2UgYWZ0ZXIgY2hhbmdpbmcgdGhlIHZlcnNpb25cIiksXG5cdFx0XHRcdFx0XHRkZXRhaWw6IG5scy5sb2NhbGl6ZSgnc2VsZWN0U3luY1NlcnZpY2UuZGV0YWlsJywgXCJUaGUgSW5zaWRlcnMgdmVyc2lvbiBvZiBWUyBDb2RlIHdpbGwgc3luY2hyb25pemUgeW91ciBzZXR0aW5ncywga2V5YmluZGluZ3MsIGV4dGVuc2lvbnMsIHNuaXBwZXRzIGFuZCBVSSBTdGF0ZSB1c2luZyBzZXBhcmF0ZSBpbnNpZGVycyBzZXR0aW5ncyBzeW5jIHNlcnZpY2UgYnkgZGVmYXVsdC5cIiksXG5cdFx0XHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKHsga2V5OiAndXNlIGluc2lkZXJzJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmSW5zaWRlcnNcIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiAnaW5zaWRlcnMnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKHsga2V5OiAndXNlIHN0YWJsZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlN0YWJsZSAoY3VycmVudClcIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiAnc3RhYmxlJ1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVmYXVsdEFjY291bnRVcGRhdGVDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU1RPUkFHRV9LRVkgPSAndXBkYXRlL2ludGVybmFsT3JnJztcblx0I2ludGVybmFsT3JnOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdGhyb3R0bGVyOiBUaHJvdHRsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVyKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXBkYXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZVNlcnZpY2U6IElVcGRhdGVTZXJ2aWNlLFxuXHRcdEBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdEFjY291bnRTZXJ2aWNlOiBJRGVmYXVsdEFjY291bnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHJldHVybjsgLy8gRWxlY3Ryb24gb25seVxuXHRcdH1cblxuXHRcdHRoaXMuI2ludGVybmFsT3JnID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoRGVmYXVsdEFjY291bnRVcGRhdGVDb250cmlidXRpb24uU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLnRocm90dGxlci5xdWV1ZSgoKSA9PiB0aGlzLnVwZGF0ZVNlcnZpY2Uuc2V0SW50ZXJuYWxPcmcodGhpcy4jaW50ZXJuYWxPcmcpKTtcblxuXHRcdC8vIENoZWNrIG9uIHN0YXJ0dXBcblx0XHR0aGlzLnJlZnJlc2goKTtcblxuXHRcdC8vIExpc3RlbiBmb3IgYWNjb3VudCBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2Uub25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudCgoKSA9PiB0aGlzLnJlZnJlc2goKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoKCk6IHZvaWQge1xuXHRcdHRoaXMudGhyb3R0bGVyLnF1ZXVlKCgpID0+IHRoaXMuZG9SZWZyZXNoKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1JlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50ID0gYXdhaXQgdGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2UuZ2V0RGVmYXVsdEFjY291bnQoKTtcblx0XHRcdGNvbnN0IGludGVybmFsT3JnID0gZ2V0SW50ZXJuYWxPcmcoZGVmYXVsdEFjY291bnQ/LmVudGl0bGVtZW50c0RhdGE/Lm9yZ2FuaXphdGlvbl9sb2dpbl9saXN0KTtcblxuXHRcdFx0aWYgKGludGVybmFsT3JnID09PSB0aGlzLiNpbnRlcm5hbE9yZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuI2ludGVybmFsT3JnID0gaW50ZXJuYWxPcmc7XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZVNlcnZpY2Uuc2V0SW50ZXJuYWxPcmcodGhpcy4jaW50ZXJuYWxPcmcpO1xuXG5cdFx0XHRpZiAodGhpcy4jaW50ZXJuYWxPcmcpIHtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShEZWZhdWx0QWNjb3VudFVwZGF0ZUNvbnRyaWJ1dGlvbi5TVE9SQUdFX0tFWSwgaW50ZXJuYWxPcmcsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKERlZmF1bHRBY2NvdW50VXBkYXRlQ29udHJpYnV0aW9uLlNUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBTaWxlbnRseSBpZ25vcmUgZXJyb3JzIC0gaWYgd2UgY2FuJ3QgZ2V0IHRoZSBhY2NvdW50LCB3ZSBkb24ndCBkaXNhYmxlIGJhY2tncm91bmQgdXBkYXRlc1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFLQSxZQUFZLFNBQVM7QUFDckIsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsWUFBWSx5QkFBeUI7QUFDOUMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsa0JBQWtCLGFBQXFCLHFCQUFxQjtBQUNyRSxTQUFTLDZCQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGdCQUFzQyxpQkFBaUI7QUFDaEUsU0FBUyxzQkFBc0Isc0JBQXNCLGdCQUFnQjtBQUNyRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJDQUEyQztBQUNwRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxlQUE0QixvQkFBb0Isc0JBQXNCO0FBQy9FLFNBQVMsY0FBYyxRQUFRLGlCQUFpQixlQUFlO0FBQy9ELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0NBQWdDLHNCQUFzQixxQ0FBcUMsa0JBQXlDO0FBQzdJLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQW1CLHVCQUF1QjtBQUVuQyxNQUFNLHVCQUF1QixJQUFJLGNBQXNCLGVBQWUs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
