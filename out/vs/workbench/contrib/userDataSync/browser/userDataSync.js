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
import { toAction } from "../../../../base/common/actions.js";
import { getErrorMessage, isCancellationError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { localize, localize2 } from "../../../../nls.js";
import { MenuId, MenuRegistry, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, ContextKeyTrueExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import {
  IUserDataAutoSyncService,
  IUserDataSyncService,
  registerConfiguration,
  SyncResource,
  SyncStatus,
  UserDataSyncError,
  UserDataSyncErrorCode,
  USER_DATA_SYNC_SCHEME,
  IUserDataSyncEnablementService,
  IUserDataSyncStoreManagementService,
  USER_DATA_SYNC_LOG_ID
} from "../../../../platform/userDataSync/common/userDataSync.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { IOutputService } from "../../../services/output/common/output.js";
import { IActivityService, NumberBadge, ProgressBadge } from "../../../services/activity/common/activity.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { fromNow } from "../../../../base/common/date.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ViewContainerLocation, Extensions } from "../../../common/views.js";
import { UserDataSyncDataViews } from "./userDataSyncViews.js";
import { IUserDataSyncWorkbenchService, getSyncAreaLabel, AccountStatus, CONTEXT_SYNC_STATE, CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE, CONFIGURE_SYNC_COMMAND_ID, SHOW_SYNC_LOG_COMMAND_ID, SYNC_VIEW_CONTAINER_ID, SYNC_TITLE, SYNC_VIEW_ICON, CONTEXT_HAS_CONFLICTS, DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR } from "../../../services/userDataSync/common/userDataSync.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { ctxIsMergeResultEditor, ctxMergeBaseUri } from "../../mergeEditor/common/mergeEditor.js";
import { IWorkbenchIssueService } from "../../issue/common/issue.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { isWeb } from "../../../../base/common/platform.js";
const turnOffSyncCommand = { id: "workbench.userDataSync.actions.turnOff", title: localize2("stop sync", "Turn Off") };
const configureSyncCommand = { id: CONFIGURE_SYNC_COMMAND_ID, title: localize2("configure sync", "Configure...") };
const showConflictsCommandId = "workbench.userDataSync.actions.showConflicts";
const syncNowCommand = {
  id: "workbench.userDataSync.actions.syncNow",
  title: localize2("sync now", "Sync Now"),
  description(userDataSyncService) {
    if (userDataSyncService.status === SyncStatus.Syncing) {
      return localize("syncing", "syncing");
    }
    if (userDataSyncService.lastSyncTime) {
      return localize("synced with time", "synced {0}", fromNow(userDataSyncService.lastSyncTime, true));
    }
    return void 0;
  }
};
const showSyncSettingsCommand = { id: "workbench.userDataSync.actions.settings", title: localize2("sync settings", "Show Settings") };
const showSyncedDataCommand = { id: "workbench.userDataSync.actions.showSyncedData", title: localize2("show synced data", "Show Synced Data") };
const CONTEXT_TURNING_ON_STATE = new RawContextKey("userDataSyncTurningOn", false);
let UserDataSyncWorkbenchContribution = class extends Disposable {
  constructor(userDataSyncEnablementService, userDataSyncService, userDataSyncWorkbenchService, contextKeyService, activityService, notificationService, editorService, userDataProfileService, dialogService, quickInputService, instantiationService, outputService, userDataAutoSyncService, textModelResolverService, preferencesService, telemetryService, productService, openerService, authenticationService, userDataSyncStoreManagementService, hostService, commandService, workbenchIssueService) {
    super();
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.userDataSyncService = userDataSyncService;
    this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
    this.activityService = activityService;
    this.notificationService = notificationService;
    this.editorService = editorService;
    this.userDataProfileService = userDataProfileService;
    this.dialogService = dialogService;
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    this.outputService = outputService;
    this.preferencesService = preferencesService;
    this.telemetryService = telemetryService;
    this.productService = productService;
    this.openerService = openerService;
    this.authenticationService = authenticationService;
    this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
    this.hostService = hostService;
    this.commandService = commandService;
    this.workbenchIssueService = workbenchIssueService;
    this.globalActivityBadgeDisposable = this._register(new MutableDisposable());
    this.accountBadgeDisposable = this._register(new MutableDisposable());
    this.conflictsDisposables = /* @__PURE__ */ new Map();
    this.invalidContentErrorDisposables = /* @__PURE__ */ new Map();
    this.conflictsActionDisposable = this._register(new MutableDisposable());
    this.turningOnSyncContext = CONTEXT_TURNING_ON_STATE.bindTo(contextKeyService);
    if (userDataSyncWorkbenchService.enabled) {
      registerConfiguration();
      this.updateAccountBadge();
      this.updateGlobalActivityBadge();
      this.onDidChangeConflicts(this.userDataSyncService.conflicts);
      this._register(Event.any(
        Event.debounce(userDataSyncService.onDidChangeStatus, () => void 0, 500),
        this.userDataSyncEnablementService.onDidChangeEnablement,
        this.userDataSyncWorkbenchService.onDidChangeAccountStatus
      )(() => {
        this.updateAccountBadge();
        this.updateGlobalActivityBadge();
      }));
      this._register(userDataSyncService.onDidChangeConflicts(() => this.onDidChangeConflicts(this.userDataSyncService.conflicts)));
      this._register(userDataSyncEnablementService.onDidChangeEnablement(() => this.onDidChangeConflicts(this.userDataSyncService.conflicts)));
      this._register(userDataSyncService.onSyncErrors((errors) => this.onSynchronizerErrors(errors)));
      this._register(userDataAutoSyncService.onError((error) => this.onAutoSyncError(error)));
      this.registerActions();
      this.registerViews();
      textModelResolverService.registerTextModelContentProvider(USER_DATA_SYNC_SCHEME, instantiationService.createInstance(UserDataRemoteContentProvider));
      this._register(Event.any(userDataSyncService.onDidChangeStatus, userDataSyncEnablementService.onDidChangeEnablement)(() => this.turningOnSync = !userDataSyncEnablementService.isEnabled() && userDataSyncService.status !== SyncStatus.Idle));
    }
  }
  get turningOnSync() {
    return !!this.turningOnSyncContext.get();
  }
  set turningOnSync(turningOn) {
    this.turningOnSyncContext.set(turningOn);
    this.updateGlobalActivityBadge();
  }
  toKey({ syncResource: resource, profile }) {
    return `${profile.id}:${resource}`;
  }
  onDidChangeConflicts(conflicts) {
    this.updateGlobalActivityBadge();
    this.registerShowConflictsAction();
    if (!this.userDataSyncEnablementService.isEnabled()) {
      return;
    }
    if (conflicts.length) {
      for (const [key, disposable] of this.conflictsDisposables.entries()) {
        if (!conflicts.some((conflict) => this.toKey(conflict) === key)) {
          disposable.dispose();
          this.conflictsDisposables.delete(key);
        }
      }
      for (const conflict of this.userDataSyncService.conflicts) {
        const key = this.toKey(conflict);
        if (!this.conflictsDisposables.has(key)) {
          const conflictsArea = getSyncAreaLabel(conflict.syncResource);
          const handle = this.notificationService.prompt(
            Severity.Warning,
            localize("conflicts detected", "Unable to sync due to conflicts in {0}. Please resolve them to continue.", conflictsArea.toLowerCase()),
            [
              {
                label: localize("replace remote", "Replace Remote"),
                run: () => {
                  this.acceptLocal(conflict, conflict.conflicts[0]);
                }
              },
              {
                label: localize("replace local", "Replace Local"),
                run: () => {
                  this.acceptRemote(conflict, conflict.conflicts[0]);
                }
              },
              {
                label: localize("show conflicts", "Show Conflicts"),
                run: () => {
                  this.telemetryService.publicLog2("sync/showConflicts", { source: conflict.syncResource });
                  this.userDataSyncWorkbenchService.showConflicts(conflict.conflicts[0]);
                }
              }
            ],
            {
              sticky: true
            }
          );
          this.conflictsDisposables.set(key, toDisposable(() => {
            handle.close();
            this.conflictsDisposables.delete(key);
          }));
        }
      }
    } else {
      this.conflictsDisposables.forEach((disposable) => disposable.dispose());
      this.conflictsDisposables.clear();
    }
  }
  async acceptRemote(syncResource, conflict) {
    try {
      await this.userDataSyncService.accept(syncResource, conflict.remoteResource, void 0, this.userDataSyncEnablementService.isEnabled());
    } catch (e) {
      this.notificationService.error(localize("accept failed", "Error while accepting changes. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
    }
  }
  async acceptLocal(syncResource, conflict) {
    try {
      await this.userDataSyncService.accept(syncResource, conflict.localResource, void 0, this.userDataSyncEnablementService.isEnabled());
    } catch (e) {
      this.notificationService.error(localize("accept failed", "Error while accepting changes. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
    }
  }
  onAutoSyncError(error) {
    switch (error.code) {
      case UserDataSyncErrorCode.SessionExpired:
        this.notificationService.notify({
          severity: Severity.Info,
          message: localize("session expired", "Settings sync was turned off because current session is expired, please sign in again to turn on sync."),
          actions: {
            primary: [toAction({
              id: "turn on sync",
              label: localize("turn on sync", "Turn on Settings Sync..."),
              run: () => this.turnOn()
            })]
          }
        });
        break;
      case UserDataSyncErrorCode.TurnedOff:
        this.notificationService.notify({
          severity: Severity.Info,
          message: localize("turned off", "Settings sync was turned off from another device, please turn on sync again."),
          actions: {
            primary: [toAction({
              id: "turn on sync",
              label: localize("turn on sync", "Turn on Settings Sync..."),
              run: () => this.turnOn()
            })]
          }
        });
        break;
      case UserDataSyncErrorCode.TooLarge:
        if (error.resource === SyncResource.Keybindings || error.resource === SyncResource.Settings || error.resource === SyncResource.Tasks) {
          this.disableSync(error.resource);
          const sourceArea = getSyncAreaLabel(error.resource);
          this.handleTooLargeError(error.resource, localize("too large", "Disabled syncing {0} because size of the {1} file to sync is larger than {2}. Please open the file and reduce the size and enable sync", sourceArea.toLowerCase(), sourceArea.toLowerCase(), "100kb"), error);
        }
        break;
      case UserDataSyncErrorCode.LocalTooManyProfiles:
        this.disableSync(SyncResource.Profiles);
        this.notificationService.error(localize("too many profiles", "Disabled syncing profiles because there are too many profiles to sync. Settings Sync supports syncing maximum 20 profiles. Please reduce the number of profiles and enable sync"));
        break;
      case UserDataSyncErrorCode.IncompatibleLocalContent:
      case UserDataSyncErrorCode.Gone:
      case UserDataSyncErrorCode.UpgradeRequired: {
        const message = localize("error upgrade required", "Settings sync is disabled because the current version ({0}, {1}) is not compatible with the sync service. Please update before turning on sync.", this.productService.version, this.productService.commit);
        const operationId = error.operationId ? localize("operationId", "Operation Id: {0}", error.operationId) : void 0;
        this.notificationService.notify({
          severity: Severity.Error,
          message: operationId ? `${message} ${operationId}` : message
        });
        break;
      }
      case UserDataSyncErrorCode.MethodNotFound: {
        const message = localize("method not found", "Settings sync is disabled because the client is making invalid requests. Please report an issue with the logs.");
        const operationId = error.operationId ? localize("operationId", "Operation Id: {0}", error.operationId) : void 0;
        this.notificationService.notify({
          severity: Severity.Error,
          message: operationId ? `${message} ${operationId}` : message,
          actions: {
            primary: [
              toAction({
                id: "Show Sync Logs",
                label: localize("show sync logs", "Show Log"),
                run: () => this.commandService.executeCommand(SHOW_SYNC_LOG_COMMAND_ID)
              }),
              toAction({
                id: "Report Issue",
                label: localize("report issue", "Report Issue"),
                run: () => this.workbenchIssueService.openReporter()
              })
            ]
          }
        });
        break;
      }
      case UserDataSyncErrorCode.IncompatibleRemoteContent:
        this.notificationService.notify({
          severity: Severity.Error,
          message: localize("error reset required", "Settings sync is disabled because your data in the cloud is older than that of the client. Please clear your data in the cloud before turning on sync."),
          actions: {
            primary: [
              toAction({
                id: "reset",
                label: localize("reset", "Clear Data in Cloud..."),
                run: () => this.userDataSyncWorkbenchService.resetSyncedData()
              }),
              toAction({
                id: "show synced data",
                label: localize("show synced data action", "Show Synced Data"),
                run: () => this.userDataSyncWorkbenchService.showSyncActivity()
              })
            ]
          }
        });
        return;
      case UserDataSyncErrorCode.ServiceChanged:
        this.notificationService.notify({
          severity: Severity.Info,
          message: this.userDataSyncStoreManagementService.userDataSyncStore?.type === "insiders" ? localize("service switched to insiders", "Settings Sync has been switched to insiders service") : localize("service switched to stable", "Settings Sync has been switched to stable service")
        });
        return;
      case UserDataSyncErrorCode.DefaultServiceChanged:
        if (this.userDataSyncEnablementService.isEnabled()) {
          this.notificationService.notify({
            severity: Severity.Info,
            message: localize("using separate service", "Settings sync now uses a separate service, more information is available in the [Settings Sync Documentation](https://aka.ms/vscode-settings-sync-help#_syncing-stable-versus-insiders).")
          });
        } else {
          this.notificationService.notify({
            severity: Severity.Info,
            message: localize("service changed and turned off", "Settings sync was turned off because {0} now uses a separate service. Please turn on sync again.", this.productService.nameLong),
            actions: {
              primary: [toAction({
                id: "turn on sync",
                label: localize("turn on sync", "Turn on Settings Sync..."),
                run: () => this.turnOn()
              })]
            }
          });
        }
        return;
    }
  }
  handleTooLargeError(resource, message, error) {
    const operationId = error.operationId ? localize("operationId", "Operation Id: {0}", error.operationId) : void 0;
    this.notificationService.notify({
      severity: Severity.Error,
      message: operationId ? `${message} ${operationId}` : message,
      actions: {
        primary: [toAction({
          id: "open sync file",
          label: localize("open file", "Open {0} File", getSyncAreaLabel(resource)),
          run: () => resource === SyncResource.Settings ? this.preferencesService.openUserSettings({ jsonEditor: true }) : this.preferencesService.openGlobalKeybindingSettings(true)
        })]
      }
    });
  }
  onSynchronizerErrors(errors) {
    if (errors.length) {
      for (const { profile, syncResource: resource, error } of errors) {
        switch (error.code) {
          case UserDataSyncErrorCode.LocalInvalidContent:
            this.handleInvalidContentError({ profile, syncResource: resource });
            break;
          default: {
            const key = `${profile.id}:${resource}`;
            const disposable = this.invalidContentErrorDisposables.get(key);
            if (disposable) {
              disposable.dispose();
              this.invalidContentErrorDisposables.delete(key);
            }
          }
        }
      }
    } else {
      this.invalidContentErrorDisposables.forEach((disposable) => disposable.dispose());
      this.invalidContentErrorDisposables.clear();
    }
  }
  handleInvalidContentError({ profile, syncResource: source }) {
    if (this.userDataProfileService.currentProfile.id !== profile.id) {
      return;
    }
    const key = `${profile.id}:${source}`;
    if (this.invalidContentErrorDisposables.has(key)) {
      return;
    }
    if (source !== SyncResource.Settings && source !== SyncResource.Keybindings && source !== SyncResource.Tasks) {
      return;
    }
    if (!this.hostService.hasFocus) {
      return;
    }
    const resource = source === SyncResource.Settings ? this.userDataProfileService.currentProfile.settingsResource : source === SyncResource.Keybindings ? this.userDataProfileService.currentProfile.keybindingsResource : this.userDataProfileService.currentProfile.tasksResource;
    const editorUri = EditorResourceAccessor.getCanonicalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (isEqual(resource, editorUri)) {
      return;
    }
    const errorArea = getSyncAreaLabel(source);
    const handle = this.notificationService.notify({
      severity: Severity.Error,
      message: localize("errorInvalidConfiguration", "Unable to sync {0} because the content in the file is not valid. Please open the file and correct it.", errorArea.toLowerCase()),
      actions: {
        primary: [toAction({
          id: "open sync file",
          label: localize("open file", "Open {0} File", errorArea),
          run: () => source === SyncResource.Settings ? this.preferencesService.openUserSettings({ jsonEditor: true }) : this.preferencesService.openGlobalKeybindingSettings(true)
        })]
      }
    });
    this.invalidContentErrorDisposables.set(key, toDisposable(() => {
      handle.close();
      this.invalidContentErrorDisposables.delete(key);
    }));
  }
  getConflictsCount() {
    return this.userDataSyncService.conflicts.reduce((result, { conflicts }) => {
      return result + conflicts.length;
    }, 0);
  }
  async updateGlobalActivityBadge() {
    this.globalActivityBadgeDisposable.clear();
    let badge = void 0;
    if (this.userDataSyncService.conflicts.length && this.userDataSyncEnablementService.isEnabled()) {
      badge = new NumberBadge(this.getConflictsCount(), () => localize("has conflicts", "{0}: Conflicts Detected", SYNC_TITLE.value));
    } else if (this.turningOnSync) {
      badge = new ProgressBadge(() => localize("turning on syncing", "Turning on Settings Sync..."));
    }
    if (badge) {
      this.globalActivityBadgeDisposable.value = this.activityService.showGlobalActivity({ badge });
    }
  }
  async updateAccountBadge() {
    this.accountBadgeDisposable.clear();
    let badge = void 0;
    if (this.userDataSyncService.status !== SyncStatus.Uninitialized && this.userDataSyncEnablementService.isEnabled() && this.userDataSyncWorkbenchService.accountStatus === AccountStatus.Unavailable) {
      badge = new NumberBadge(1, () => localize("sign in to sync", "Sign in to Sync Settings"));
    }
    if (badge) {
      this.accountBadgeDisposable.value = this.activityService.showAccountsActivity({ badge });
    }
  }
  async turnOn() {
    try {
      if (!this.userDataSyncWorkbenchService.authenticationProviders.length) {
        throw new Error(localize("no authentication providers", "No authentication providers are available."));
      }
      const turnOn = await this.askToConfigure();
      if (!turnOn) {
        return;
      }
      if (this.userDataSyncStoreManagementService.userDataSyncStore?.canSwitch) {
        await this.selectSettingsSyncService(this.userDataSyncStoreManagementService.userDataSyncStore);
      }
      await this.userDataSyncWorkbenchService.turnOn();
    } catch (e) {
      if (isCancellationError(e)) {
        return;
      }
      if (e instanceof UserDataSyncError) {
        switch (e.code) {
          case UserDataSyncErrorCode.TooLarge:
            if (e.resource === SyncResource.Keybindings || e.resource === SyncResource.Settings || e.resource === SyncResource.Tasks) {
              this.handleTooLargeError(e.resource, localize("too large while starting sync", "Settings sync cannot be turned on because size of the {0} file to sync is larger than {1}. Please open the file and reduce the size and turn on sync", getSyncAreaLabel(e.resource).toLowerCase(), "100kb"), e);
              return;
            }
            break;
          case UserDataSyncErrorCode.IncompatibleLocalContent:
          case UserDataSyncErrorCode.Gone:
          case UserDataSyncErrorCode.UpgradeRequired: {
            const message = localize("error upgrade required while starting sync", "Settings sync cannot be turned on because the current version ({0}, {1}) is not compatible with the sync service. Please update before turning on sync.", this.productService.version, this.productService.commit);
            const operationId = e.operationId ? localize("operationId", "Operation Id: {0}", e.operationId) : void 0;
            this.notificationService.notify({
              severity: Severity.Error,
              message: operationId ? `${message} ${operationId}` : message
            });
            return;
          }
          case UserDataSyncErrorCode.IncompatibleRemoteContent:
            this.notificationService.notify({
              severity: Severity.Error,
              message: localize("error reset required while starting sync", "Settings sync cannot be turned on because your data in the cloud is older than that of the client. Please clear your data in the cloud before turning on sync."),
              actions: {
                primary: [
                  toAction({
                    id: "reset",
                    label: localize("reset", "Clear Data in Cloud..."),
                    run: () => this.userDataSyncWorkbenchService.resetSyncedData()
                  }),
                  toAction({
                    id: "show synced data",
                    label: localize("show synced data action", "Show Synced Data"),
                    run: () => this.userDataSyncWorkbenchService.showSyncActivity()
                  })
                ]
              }
            });
            return;
          case UserDataSyncErrorCode.Unauthorized:
          case UserDataSyncErrorCode.Forbidden:
            this.notificationService.error(localize("auth failed", "Error while turning on Settings Sync: Authentication failed."));
            return;
        }
        this.notificationService.error(localize("turn on failed with user data sync error", "Error while turning on Settings Sync. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
      } else {
        this.notificationService.error(localize({ key: "turn on failed", comment: ["Substitution is for error reason"] }, "Error while turning on Settings Sync. {0}", getErrorMessage(e)));
      }
    }
  }
  async askToConfigure() {
    return new Promise((c, e) => {
      const disposables = new DisposableStore();
      const quickPick = this.quickInputService.createQuickPick();
      disposables.add(quickPick);
      quickPick.title = SYNC_TITLE.value;
      quickPick.ok = false;
      quickPick.customButton = true;
      quickPick.customLabel = localize("sign in and turn on", "Sign in");
      quickPick.description = localize("configure and turn on sync detail", "Please sign in to backup and sync your data across devices.");
      quickPick.canSelectMany = true;
      quickPick.ignoreFocusOut = true;
      quickPick.hideInput = true;
      quickPick.hideCheckAll = true;
      const items = this.getConfigureSyncQuickPickItems();
      quickPick.items = items;
      quickPick.selectedItems = items.filter((item) => this.userDataSyncEnablementService.isResourceEnabled(item.id, true));
      let accepted = false;
      disposables.add(Event.any(quickPick.onDidAccept, quickPick.onDidCustom)(() => {
        accepted = true;
        quickPick.hide();
      }));
      disposables.add(quickPick.onDidHide(() => {
        try {
          if (accepted) {
            this.updateConfiguration(items, quickPick.selectedItems);
          }
          c(accepted);
        } catch (error) {
          e(error);
        } finally {
          disposables.dispose();
        }
      }));
      quickPick.show();
    });
  }
  getConfigureSyncQuickPickItems() {
    const result = [{
      id: SyncResource.Settings,
      label: getSyncAreaLabel(SyncResource.Settings)
    }, {
      id: SyncResource.Keybindings,
      label: getSyncAreaLabel(SyncResource.Keybindings)
    }, {
      id: SyncResource.Snippets,
      label: getSyncAreaLabel(SyncResource.Snippets)
    }, {
      id: SyncResource.Tasks,
      label: getSyncAreaLabel(SyncResource.Tasks)
    }, {
      id: SyncResource.Mcp,
      label: getSyncAreaLabel(SyncResource.Mcp)
    }, {
      id: SyncResource.GlobalState,
      label: getSyncAreaLabel(SyncResource.GlobalState)
    }, {
      id: SyncResource.Extensions,
      label: getSyncAreaLabel(SyncResource.Extensions)
    }, {
      id: SyncResource.Profiles,
      label: getSyncAreaLabel(SyncResource.Profiles)
    }, {
      id: SyncResource.Prompts,
      label: getSyncAreaLabel(SyncResource.Prompts)
    }];
    return result;
  }
  updateConfiguration(items, selectedItems) {
    for (const item of items) {
      const wasEnabled = this.userDataSyncEnablementService.isResourceEnabled(item.id);
      const isEnabled = !!selectedItems.filter((selected) => selected.id === item.id)[0];
      if (wasEnabled !== isEnabled) {
        this.userDataSyncEnablementService.setResourceEnablement(item.id, isEnabled);
      }
    }
  }
  async configureSyncOptions() {
    return new Promise((c, e) => {
      const disposables = new DisposableStore();
      const quickPick = this.quickInputService.createQuickPick();
      disposables.add(quickPick);
      quickPick.title = localize("configure sync title", "{0}: Configure...", SYNC_TITLE.value);
      quickPick.placeholder = localize("configure sync placeholder", "Choose what to sync");
      quickPick.canSelectMany = true;
      quickPick.ignoreFocusOut = true;
      quickPick.ok = true;
      const items = this.getConfigureSyncQuickPickItems();
      quickPick.items = items;
      quickPick.selectedItems = items.filter((item) => this.userDataSyncEnablementService.isResourceEnabled(item.id));
      disposables.add(quickPick.onDidAccept(async () => {
        if (quickPick.selectedItems.length) {
          this.updateConfiguration(items, quickPick.selectedItems);
          quickPick.hide();
        }
      }));
      disposables.add(quickPick.onDidHide(() => {
        disposables.dispose();
        c();
      }));
      quickPick.show();
    });
  }
  async turnOff() {
    const result = await this.dialogService.confirm({
      message: localize("turn off sync confirmation", "Do you want to turn off sync?"),
      detail: localize("turn off sync detail", "Your settings, keybindings, extensions, snippets and UI State will no longer be synced."),
      primaryButton: localize({ key: "turn off", comment: ["&& denotes a mnemonic"] }, "&&Turn off"),
      checkbox: this.userDataSyncWorkbenchService.accountStatus === AccountStatus.Available ? {
        label: localize("turn off sync everywhere", "Turn off sync on all your devices and clear the data from the cloud.")
      } : void 0
    });
    if (result.confirmed) {
      return this.userDataSyncWorkbenchService.turnoff(!!result.checkboxChecked);
    }
  }
  disableSync(source) {
    switch (source) {
      case SyncResource.Settings:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Settings, false);
      case SyncResource.Keybindings:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Keybindings, false);
      case SyncResource.Snippets:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Snippets, false);
      case SyncResource.Tasks:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Tasks, false);
      case SyncResource.Extensions:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Extensions, false);
      case SyncResource.GlobalState:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.GlobalState, false);
      case SyncResource.Profiles:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Profiles, false);
    }
  }
  showSyncActivity() {
    return this.outputService.showChannel(USER_DATA_SYNC_LOG_ID);
  }
  async selectSettingsSyncService(userDataSyncStore) {
    return new Promise((c, e) => {
      const disposables = new DisposableStore();
      const quickPick = disposables.add(this.quickInputService.createQuickPick());
      quickPick.title = localize("switchSyncService.title", "{0}: Select Service", SYNC_TITLE.value);
      quickPick.description = localize("switchSyncService.description", "Ensure you are using the same settings sync service when syncing with multiple environments");
      quickPick.hideInput = true;
      quickPick.ignoreFocusOut = true;
      const getDescription = (url) => {
        const isDefault = isEqual(url, userDataSyncStore.defaultUrl);
        if (isDefault) {
          return localize("default", "Default");
        }
        return void 0;
      };
      quickPick.items = [
        {
          id: "insiders",
          label: localize("insiders", "Insiders"),
          description: getDescription(userDataSyncStore.insidersUrl)
        },
        {
          id: "stable",
          label: localize("stable", "Stable"),
          description: getDescription(userDataSyncStore.stableUrl)
        }
      ];
      disposables.add(quickPick.onDidAccept(async () => {
        try {
          await this.userDataSyncStoreManagementService.switch(quickPick.selectedItems[0].id);
          c();
        } catch (error) {
          e(error);
        } finally {
          quickPick.hide();
        }
      }));
      disposables.add(quickPick.onDidHide(() => disposables.dispose()));
      quickPick.show();
    });
  }
  registerActions() {
    if (this.userDataSyncEnablementService.canToggleEnablement()) {
      this.registerTurnOnSyncAction();
      this.registerTurnOffSyncAction();
    }
    this.registerTurningOnSyncAction();
    this.registerCancelTurnOnSyncAction();
    this.registerSignInAction();
    this.registerShowConflictsAction();
    this.registerEnableSyncViewsAction();
    this.registerManageSyncAction();
    this.registerSyncNowAction();
    this.registerConfigureSyncAction();
    this.registerShowSettingsAction();
    this.registerHelpAction();
    this.registerShowLogAction();
    this.registerResetSyncDataAction();
    this.registerAcceptMergesAction();
    if (isWeb) {
      this.registerDownloadSyncActivityAction();
    }
  }
  registerTurnOnSyncAction() {
    const that = this;
    const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT.toNegated(), CONTEXT_TURNING_ON_STATE.negate());
    this._register(registerAction2(class TurningOnSyncAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userDataSync.actions.turnOn",
          title: localize2("global activity turn on sync", "Backup and Sync Settings..."),
          category: SYNC_TITLE,
          f1: true,
          precondition: when,
          menu: [{
            group: "3_configuration",
            id: MenuId.GlobalActivity,
            when,
            order: 2
          }, {
            group: "3_configuration",
            id: MenuId.MenubarPreferencesMenu,
            when,
            order: 2
          }, {
            group: "1_settings",
            id: MenuId.AccountsContext,
            when,
            order: 2
          }]
        });
      }
      async run() {
        return that.turnOn();
      }
    }));
  }
  registerTurningOnSyncAction() {
    const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT.toNegated(), CONTEXT_TURNING_ON_STATE);
    this._register(registerAction2(class TurningOnSyncAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userData.actions.turningOn",
          title: localize("turning on sync", "Turning on Settings Sync..."),
          precondition: ContextKeyExpr.false(),
          menu: [{
            group: "3_configuration",
            id: MenuId.GlobalActivity,
            when,
            order: 2
          }, {
            group: "1_settings",
            id: MenuId.AccountsContext,
            when
          }]
        });
      }
      async run() {
      }
    }));
  }
  registerCancelTurnOnSyncAction() {
    const that = this;
    this._register(registerAction2(class TurningOnSyncAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userData.actions.cancelTurnOn",
          title: localize("cancel turning on sync", "Cancel"),
          icon: Codicon.stopCircle,
          menu: {
            id: MenuId.ViewContainerTitle,
            when: ContextKeyExpr.and(CONTEXT_TURNING_ON_STATE, ContextKeyExpr.equals("viewContainer", SYNC_VIEW_CONTAINER_ID)),
            group: "navigation",
            order: 1
          }
        });
      }
      async run() {
        return that.userDataSyncWorkbenchService.turnoff(false);
      }
    }));
  }
  registerSignInAction() {
    const that = this;
    const id = "workbench.userData.actions.signin";
    const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Unavailable));
    this._register(registerAction2(class StopSyncAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userData.actions.signin",
          title: localize("sign in global", "Sign in to Sync Settings"),
          menu: {
            group: "3_configuration",
            id: MenuId.GlobalActivity,
            when,
            order: 2
          }
        });
      }
      async run() {
        try {
          await that.userDataSyncWorkbenchService.signIn();
        } catch (e) {
          that.notificationService.error(e);
        }
      }
    }));
    this._register(MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
      group: "1_settings",
      command: {
        id,
        title: localize("sign in accounts", "Sign in to Sync Settings (1)")
      },
      when
    }));
  }
  getShowConflictsTitle() {
    return localize2("resolveConflicts_global", "Show Conflicts ({0})", this.getConflictsCount());
  }
  registerShowConflictsAction() {
    this.conflictsActionDisposable.value = void 0;
    const that = this;
    this.conflictsActionDisposable.value = registerAction2(class TurningOnSyncAction extends Action2 {
      constructor() {
        super({
          id: showConflictsCommandId,
          get title() {
            return that.getShowConflictsTitle();
          },
          category: SYNC_TITLE,
          f1: true,
          precondition: CONTEXT_HAS_CONFLICTS,
          menu: [{
            group: "3_configuration",
            id: MenuId.GlobalActivity,
            when: CONTEXT_HAS_CONFLICTS,
            order: 2
          }, {
            group: "3_configuration",
            id: MenuId.MenubarPreferencesMenu,
            when: CONTEXT_HAS_CONFLICTS,
            order: 2
          }]
        });
      }
      async run() {
        return that.userDataSyncWorkbenchService.showConflicts();
      }
    });
  }
  registerManageSyncAction() {
    const that = this;
    const when = ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE.notEqualsTo(AccountStatus.Unavailable), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized));
    this._register(registerAction2(class SyncStatusAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userDataSync.actions.manage",
          title: localize("sync is on", "Settings Sync is On"),
          toggled: ContextKeyTrueExpr.INSTANCE,
          menu: [
            {
              id: MenuId.GlobalActivity,
              group: "3_configuration",
              when,
              order: 2
            },
            {
              id: MenuId.MenubarPreferencesMenu,
              group: "3_configuration",
              when,
              order: 2
            },
            {
              id: MenuId.AccountsContext,
              group: "1_settings",
              when
            }
          ]
        });
      }
      run(accessor) {
        return new Promise((c, e) => {
          const quickInputService = accessor.get(IQuickInputService);
          const commandService = accessor.get(ICommandService);
          const disposables = new DisposableStore();
          const quickPick = quickInputService.createQuickPick({ useSeparators: true });
          disposables.add(quickPick);
          const items = [];
          if (that.userDataSyncService.conflicts.length) {
            items.push({ id: showConflictsCommandId, label: `${SYNC_TITLE.value}: ${that.getShowConflictsTitle().original}` });
            items.push({ type: "separator" });
          }
          items.push({ id: configureSyncCommand.id, label: `${SYNC_TITLE.value}: ${configureSyncCommand.title.original}` });
          items.push({ id: showSyncSettingsCommand.id, label: `${SYNC_TITLE.value}: ${showSyncSettingsCommand.title.original}` });
          items.push({ id: showSyncedDataCommand.id, label: `${SYNC_TITLE.value}: ${showSyncedDataCommand.title.original}` });
          items.push({ type: "separator" });
          items.push({ id: syncNowCommand.id, label: `${SYNC_TITLE.value}: ${syncNowCommand.title.original}`, description: syncNowCommand.description(that.userDataSyncService) });
          if (that.userDataSyncEnablementService.canToggleEnablement()) {
            const account = that.userDataSyncWorkbenchService.current;
            items.push({ id: turnOffSyncCommand.id, label: `${SYNC_TITLE.value}: ${turnOffSyncCommand.title.original}`, description: account ? `${account.accountName} (${that.authenticationService.getProvider(account.authenticationProviderId).label})` : void 0 });
          }
          quickPick.items = items;
          disposables.add(quickPick.onDidAccept(() => {
            if (quickPick.selectedItems[0] && quickPick.selectedItems[0].id) {
              commandService.executeCommand(quickPick.selectedItems[0].id);
            }
            quickPick.hide();
          }));
          disposables.add(quickPick.onDidHide(() => {
            disposables.dispose();
            c();
          }));
          quickPick.show();
        });
      }
    }));
  }
  registerEnableSyncViewsAction() {
    const that = this;
    const when = ContextKeyExpr.and(CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized));
    this._register(registerAction2(class SyncStatusAction extends Action2 {
      constructor() {
        super({
          id: showSyncedDataCommand.id,
          title: showSyncedDataCommand.title,
          category: SYNC_TITLE,
          precondition: when,
          menu: {
            id: MenuId.CommandPalette,
            when
          }
        });
      }
      run(accessor) {
        return that.userDataSyncWorkbenchService.showSyncActivity();
      }
    }));
  }
  registerSyncNowAction() {
    const that = this;
    this._register(registerAction2(class SyncNowAction extends Action2 {
      constructor() {
        super({
          id: syncNowCommand.id,
          title: syncNowCommand.title,
          category: SYNC_TITLE,
          menu: {
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized))
          }
        });
      }
      run(accessor) {
        return that.userDataSyncWorkbenchService.syncNow();
      }
    }));
  }
  registerTurnOffSyncAction() {
    const that = this;
    this._register(registerAction2(class StopSyncAction extends Action2 {
      constructor() {
        super({
          id: turnOffSyncCommand.id,
          title: turnOffSyncCommand.title,
          category: SYNC_TITLE,
          menu: {
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT)
          }
        });
      }
      async run() {
        try {
          await that.turnOff();
        } catch (e) {
          if (!isCancellationError(e)) {
            that.notificationService.error(localize("turn off failed", "Error while turning off Settings Sync. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
          }
        }
      }
    }));
  }
  registerConfigureSyncAction() {
    const that = this;
    const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT);
    this._register(registerAction2(class ConfigureSyncAction extends Action2 {
      constructor() {
        super({
          id: configureSyncCommand.id,
          title: configureSyncCommand.title,
          category: SYNC_TITLE,
          icon: Codicon.settingsGear,
          tooltip: localize("configure", "Configure..."),
          menu: [{
            id: MenuId.CommandPalette,
            when
          }, {
            id: MenuId.ViewContainerTitle,
            when: ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, ContextKeyExpr.equals("viewContainer", SYNC_VIEW_CONTAINER_ID)),
            group: "navigation",
            order: 2
          }]
        });
      }
      run() {
        return that.configureSyncOptions();
      }
    }));
  }
  registerShowLogAction() {
    const that = this;
    this._register(registerAction2(class ShowSyncActivityAction extends Action2 {
      constructor() {
        super({
          id: SHOW_SYNC_LOG_COMMAND_ID,
          title: localize("show sync log title", "{0}: Show Log", SYNC_TITLE.value),
          tooltip: localize("show sync log toolrip", "Show Log"),
          icon: Codicon.output,
          menu: [{
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized))
          }, {
            id: MenuId.ViewContainerTitle,
            when: ContextKeyExpr.equals("viewContainer", SYNC_VIEW_CONTAINER_ID),
            group: "navigation",
            order: 1
          }]
        });
      }
      run() {
        return that.showSyncActivity();
      }
    }));
  }
  registerShowSettingsAction() {
    this._register(registerAction2(class ShowSyncSettingsAction extends Action2 {
      constructor() {
        super({
          id: showSyncSettingsCommand.id,
          title: showSyncSettingsCommand.title,
          category: SYNC_TITLE,
          menu: {
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized))
          }
        });
      }
      run(accessor) {
        accessor.get(IPreferencesService).openUserSettings({ jsonEditor: false, query: "@tag:sync" });
      }
    }));
  }
  registerHelpAction() {
    const that = this;
    this._register(registerAction2(class HelpAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userDataSync.actions.help",
          title: SYNC_TITLE,
          category: Categories.Help,
          menu: [{
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized))
          }]
        });
      }
      run() {
        return that.openerService.open(URI.parse("https://aka.ms/vscode-settings-sync-help"));
      }
    }));
    MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
      command: {
        id: "workbench.userDataSync.actions.help",
        title: Categories.Help.value
      },
      when: ContextKeyExpr.equals("viewContainer", SYNC_VIEW_CONTAINER_ID),
      group: "1_help"
    });
  }
  registerAcceptMergesAction() {
    const that = this;
    this._register(registerAction2(class AcceptMergesAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userDataSync.actions.acceptMerges",
          title: localize("complete merges title", "Complete Merge"),
          menu: [{
            id: MenuId.EditorContent,
            when: ContextKeyExpr.and(ctxIsMergeResultEditor, ContextKeyExpr.regex(ctxMergeBaseUri.key, new RegExp(`^${USER_DATA_SYNC_SCHEME}:`)))
          }]
        });
      }
      async run(accessor, previewResource) {
        const textFileService = accessor.get(ITextFileService);
        await textFileService.save(previewResource);
        const content = await textFileService.read(previewResource);
        await that.userDataSyncService.accept(this.getSyncResource(previewResource), previewResource, content.value, true);
      }
      getSyncResource(previewResource) {
        const conflict = that.userDataSyncService.conflicts.find(({ conflicts }) => conflicts.some((conflict2) => isEqual(conflict2.previewResource, previewResource)));
        if (conflict) {
          return conflict;
        }
        throw new Error(`Unknown resource: ${previewResource.toString()}`);
      }
    }));
  }
  registerDownloadSyncActivityAction() {
    this._register(registerAction2(class DownloadSyncActivityAction extends Action2 {
      constructor() {
        super(DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR);
      }
      async run(accessor) {
        const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
        const notificationService = accessor.get(INotificationService);
        const folder = await userDataSyncWorkbenchService.downloadSyncActivity();
        if (folder) {
          notificationService.info(localize("download sync activity complete", "Successfully downloaded Settings Sync activity."));
        }
      }
    }));
  }
  registerViews() {
    const container = this.registerViewContainer();
    this.registerDataViews(container);
  }
  registerViewContainer() {
    return Registry.as(Extensions.ViewContainersRegistry).registerViewContainer(
      {
        id: SYNC_VIEW_CONTAINER_ID,
        title: SYNC_TITLE,
        ctorDescriptor: new SyncDescriptor(
          ViewPaneContainer,
          [SYNC_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]
        ),
        icon: SYNC_VIEW_ICON,
        hideIfEmpty: true
      },
      ViewContainerLocation.Sidebar
    );
  }
  registerResetSyncDataAction() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.actions.syncData.reset",
          title: localize("workbench.actions.syncData.reset", "Clear Data in Cloud..."),
          menu: [{
            id: MenuId.ViewContainerTitle,
            when: ContextKeyExpr.equals("viewContainer", SYNC_VIEW_CONTAINER_ID),
            group: "0_configure"
          }]
        });
      }
      run() {
        return that.userDataSyncWorkbenchService.resetSyncedData();
      }
    }));
  }
  registerDataViews(container) {
    this._register(this.instantiationService.createInstance(UserDataSyncDataViews, container));
  }
};
UserDataSyncWorkbenchContribution = __decorateClass([
  __decorateParam(0, IUserDataSyncEnablementService),
  __decorateParam(1, IUserDataSyncService),
  __decorateParam(2, IUserDataSyncWorkbenchService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IActivityService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IUserDataProfileService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IQuickInputService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, IOutputService),
  __decorateParam(12, IUserDataAutoSyncService),
  __decorateParam(13, ITextModelService),
  __decorateParam(14, IPreferencesService),
  __decorateParam(15, ITelemetryService),
  __decorateParam(16, IProductService),
  __decorateParam(17, IOpenerService),
  __decorateParam(18, IAuthenticationService),
  __decorateParam(19, IUserDataSyncStoreManagementService),
  __decorateParam(20, IHostService),
  __decorateParam(21, ICommandService),
  __decorateParam(22, IWorkbenchIssueService)
], UserDataSyncWorkbenchContribution);
let UserDataRemoteContentProvider = class {
  constructor(userDataSyncService, modelService, languageService) {
    this.userDataSyncService = userDataSyncService;
    this.modelService = modelService;
    this.languageService = languageService;
  }
  provideTextContent(uri) {
    if (uri.scheme === USER_DATA_SYNC_SCHEME) {
      return this.userDataSyncService.resolveContent(uri).then((content) => this.modelService.createModel(content || "", this.languageService.createById("jsonc"), uri));
    }
    return null;
  }
};
UserDataRemoteContentProvider = __decorateClass([
  __decorateParam(0, IUserDataSyncService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService)
], UserDataRemoteContentProvider);
export {
  UserDataSyncWorkbenchContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VzZXJEYXRhU3luYy9icm93c2VyL3VzZXJEYXRhU3luYy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBnZXRFcnJvck1lc3NhZ2UsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlUcnVlRXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgUXVpY2tQaWNrSXRlbSwgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7XG5cdElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSwgSVVzZXJEYXRhU3luY1NlcnZpY2UsIHJlZ2lzdGVyQ29uZmlndXJhdGlvbixcblx0U3luY1Jlc291cmNlLCBTeW5jU3RhdHVzLCBVc2VyRGF0YVN5bmNFcnJvciwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLCBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0SVJlc291cmNlUHJldmlldywgSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsIFVzZXJEYXRhU3luY1N0b3JlVHlwZSwgSVVzZXJEYXRhU3luY1N0b3JlLCBJVXNlckRhdGFTeW5jUmVzb3VyY2VDb25mbGljdHMsIElVc2VyRGF0YVN5bmNSZXNvdXJjZSwgSVVzZXJEYXRhU3luY1Jlc291cmNlRXJyb3IsIFVTRVJfREFUQV9TWU5DX0xPR19JRFxufSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSU91dHB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5pbXBvcnQgeyBJQWN0aXZpdHlTZXJ2aWNlLCBJQmFkZ2UsIE51bWJlckJhZGdlLCBQcm9ncmVzc0JhZGdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgZnJvbU5vdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRhaW5lckxvY2F0aW9uLCBJVmlld0NvbnRhaW5lcnNSZWdpc3RyeSwgRXh0ZW5zaW9ucywgVmlld0NvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNEYXRhVmlld3MgfSBmcm9tICcuL3VzZXJEYXRhU3luY1ZpZXdzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLCBnZXRTeW5jQXJlYUxhYmVsLCBBY2NvdW50U3RhdHVzLCBDT05URVhUX1NZTkNfU1RBVEUsIENPTlRFWFRfU1lOQ19FTkFCTEVNRU5ULCBDT05URVhUX0FDQ09VTlRfU1RBVEUsIENPTkZJR1VSRV9TWU5DX0NPTU1BTkRfSUQsIFNIT1dfU1lOQ19MT0dfQ09NTUFORF9JRCwgU1lOQ19WSUVXX0NPTlRBSU5FUl9JRCwgU1lOQ19USVRMRSwgU1lOQ19WSUVXX0lDT04sIENPTlRFWFRfSEFTX0NPTkZMSUNUUywgRE9XTkxPQURfQUNUSVZJVFlfQUNUSU9OX0RFU0NSSVBUT1IgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVmlld1BhbmVDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lQ29udGFpbmVyLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgY3R4SXNNZXJnZVJlc3VsdEVkaXRvciwgY3R4TWVyZ2VCYXNlVXJpIH0gZnJvbSAnLi4vLi4vbWVyZ2VFZGl0b3IvY29tbW9uL21lcmdlRWRpdG9yLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hJc3N1ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9pc3N1ZS9jb21tb24vaXNzdWUuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbnR5cGUgQ29uZmlndXJlU3luY1F1aWNrUGlja0l0ZW0gPSB7IGlkOiBTeW5jUmVzb3VyY2U7IGxhYmVsOiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nIH07XG5cbnR5cGUgU3luY0NvbmZsaWN0c0NsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3NhbmR5MDgxJztcblx0Y29tbWVudDogJ1Jlc3BvbnNlIGluZm9ybWF0aW9uIHdoZW4gY29uZmxpY3QgaGFwcGVucyBkdXJpbmcgc2V0dGluZ3Mgc3luYyc7XG5cdHNvdXJjZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ3NldHRpbmdzIHN5bmMgcmVzb3VyY2UuIGVnLiwgc2V0dGluZ3MsIGtleWJpbmRpbmdzLi4uJyB9O1xuXHRhY3Rpb24/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnYWN0aW9uIHRha2VuIHdoaWxlIHJlc29sdmluZyBjb25mbGljdHMuIEVnOiBhY2NlcHRMb2NhbCwgYWNjZXB0UmVtb3RlJyB9O1xufTtcblxuY29uc3QgdHVybk9mZlN5bmNDb21tYW5kID0geyBpZDogJ3dvcmtiZW5jaC51c2VyRGF0YVN5bmMuYWN0aW9ucy50dXJuT2ZmJywgdGl0bGU6IGxvY2FsaXplMignc3RvcCBzeW5jJywgJ1R1cm4gT2ZmJykgfTtcbmNvbnN0IGNvbmZpZ3VyZVN5bmNDb21tYW5kID0geyBpZDogQ09ORklHVVJFX1NZTkNfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplMignY29uZmlndXJlIHN5bmMnLCAnQ29uZmlndXJlLi4uJykgfTtcbmNvbnN0IHNob3dDb25mbGljdHNDb21tYW5kSWQgPSAnd29ya2JlbmNoLnVzZXJEYXRhU3luYy5hY3Rpb25zLnNob3dDb25mbGljdHMnO1xuY29uc3Qgc3luY05vd0NvbW1hbmQgPSB7XG5cdGlkOiAnd29ya2JlbmNoLnVzZXJEYXRhU3luYy5hY3Rpb25zLnN5bmNOb3cnLFxuXHR0aXRsZTogbG9jYWxpemUyKCdzeW5jIG5vdycsICdTeW5jIE5vdycpLFxuXHRkZXNjcmlwdGlvbih1c2VyRGF0YVN5bmNTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU2VydmljZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHVzZXJEYXRhU3luY1NlcnZpY2Uuc3RhdHVzID09PSBTeW5jU3RhdHVzLlN5bmNpbmcpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc3luY2luZycsIFwic3luY2luZ1wiKTtcblx0XHR9XG5cdFx0aWYgKHVzZXJEYXRhU3luY1NlcnZpY2UubGFzdFN5bmNUaW1lKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3N5bmNlZCB3aXRoIHRpbWUnLCBcInN5bmNlZCB7MH1cIiwgZnJvbU5vdyh1c2VyRGF0YVN5bmNTZXJ2aWNlLmxhc3RTeW5jVGltZSwgdHJ1ZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59O1xuY29uc3Qgc2hvd1N5bmNTZXR0aW5nc0NvbW1hbmQgPSB7IGlkOiAnd29ya2JlbmNoLnVzZXJEYXRhU3luYy5hY3Rpb25zLnNldHRpbmdzJywgdGl0bGU6IGxvY2FsaXplMignc3luYyBzZXR0aW5ncycsICdTaG93IFNldHRpbmdzJyksIH07XG5jb25zdCBzaG93U3luY2VkRGF0YUNvbW1hbmQgPSB7IGlkOiAnd29ya2JlbmNoLnVzZXJEYXRhU3luYy5hY3Rpb25zLnNob3dTeW5jZWREYXRhJywgdGl0bGU6IGxvY2FsaXplMignc2hvdyBzeW5jZWQgZGF0YScsICdTaG93IFN5bmNlZCBEYXRhJyksIH07XG5cbmNvbnN0IENPTlRFWFRfVFVSTklOR19PTl9TVEFURSA9IG5ldyBSYXdDb250ZXh0S2V5PGZhbHNlPigndXNlckRhdGFTeW5jVHVybmluZ09uJywgZmFsc2UpO1xuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFTeW5jV29ya2JlbmNoQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdHVybmluZ09uU3luY0NvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZ2xvYmFsQWN0aXZpdHlCYWRnZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWNjb3VudEJhZGdlRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlOiBJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElBY3Rpdml0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPdXRwdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3V0cHV0U2VydmljZTogSU91dHB1dFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSB1c2VyRGF0YUF1dG9TeW5jU2VydmljZTogSVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoSXNzdWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2JlbmNoSXNzdWVTZXJ2aWNlOiBJV29ya2JlbmNoSXNzdWVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnR1cm5pbmdPblN5bmNDb250ZXh0ID0gQ09OVEVYVF9UVVJOSU5HX09OX1NUQVRFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRpZiAodXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5lbmFibGVkKSB7XG5cdFx0XHRyZWdpc3RlckNvbmZpZ3VyYXRpb24oKTtcblxuXHRcdFx0dGhpcy51cGRhdGVBY2NvdW50QmFkZ2UoKTtcblx0XHRcdHRoaXMudXBkYXRlR2xvYmFsQWN0aXZpdHlCYWRnZSgpO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUNvbmZsaWN0cyh0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UuY29uZmxpY3RzKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KFxuXHRcdFx0XHRFdmVudC5kZWJvdW5jZSh1c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdHVzLCAoKSA9PiB1bmRlZmluZWQsIDUwMCksXG5cdFx0XHRcdHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VFbmFibGVtZW50LFxuXHRcdFx0XHR0aGlzLnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2Uub25EaWRDaGFuZ2VBY2NvdW50U3RhdHVzXG5cdFx0XHQpKCgpID0+IHtcblx0XHRcdFx0dGhpcy51cGRhdGVBY2NvdW50QmFkZ2UoKTtcblx0XHRcdFx0dGhpcy51cGRhdGVHbG9iYWxBY3Rpdml0eUJhZGdlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmxpY3RzKCgpID0+IHRoaXMub25EaWRDaGFuZ2VDb25mbGljdHModGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLmNvbmZsaWN0cykpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW5hYmxlbWVudCgoKSA9PiB0aGlzLm9uRGlkQ2hhbmdlQ29uZmxpY3RzKHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5jb25mbGljdHMpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YVN5bmNTZXJ2aWNlLm9uU3luY0Vycm9ycyhlcnJvcnMgPT4gdGhpcy5vblN5bmNocm9uaXplckVycm9ycyhlcnJvcnMpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YUF1dG9TeW5jU2VydmljZS5vbkVycm9yKGVycm9yID0+IHRoaXMub25BdXRvU3luY0Vycm9yKGVycm9yKSkpO1xuXG5cdFx0XHR0aGlzLnJlZ2lzdGVyQWN0aW9ucygpO1xuXHRcdFx0dGhpcy5yZWdpc3RlclZpZXdzKCk7XG5cblx0XHRcdHRleHRNb2RlbFJlc29sdmVyU2VydmljZS5yZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcihVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhUmVtb3RlQ29udGVudFByb3ZpZGVyKSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSh1c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdHVzLCB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVuYWJsZW1lbnQpXG5cdFx0XHRcdCgoKSA9PiB0aGlzLnR1cm5pbmdPblN5bmMgPSAhdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkgJiYgdXNlckRhdGFTeW5jU2VydmljZS5zdGF0dXMgIT09IFN5bmNTdGF0dXMuSWRsZSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0IHR1cm5pbmdPblN5bmMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy50dXJuaW5nT25TeW5jQ29udGV4dC5nZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0IHR1cm5pbmdPblN5bmModHVybmluZ09uOiBib29sZWFuKSB7XG5cdFx0dGhpcy50dXJuaW5nT25TeW5jQ29udGV4dC5zZXQodHVybmluZ09uKTtcblx0XHR0aGlzLnVwZGF0ZUdsb2JhbEFjdGl2aXR5QmFkZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgdG9LZXkoeyBzeW5jUmVzb3VyY2U6IHJlc291cmNlLCBwcm9maWxlIH06IElVc2VyRGF0YVN5bmNSZXNvdXJjZSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3Byb2ZpbGUuaWR9OiR7cmVzb3VyY2V9YDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29uZmxpY3RzRGlzcG9zYWJsZXMgPSBuZXcgTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCk7XG5cdHByaXZhdGUgb25EaWRDaGFuZ2VDb25mbGljdHMoY29uZmxpY3RzOiBJVXNlckRhdGFTeW5jUmVzb3VyY2VDb25mbGljdHNbXSkge1xuXHRcdHRoaXMudXBkYXRlR2xvYmFsQWN0aXZpdHlCYWRnZSgpO1xuXHRcdHRoaXMucmVnaXN0ZXJTaG93Q29uZmxpY3RzQWN0aW9uKCk7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChjb25mbGljdHMubGVuZ3RoKSB7XG5cdFx0XHQvLyBDbGVhciBhbmQgZGlzcG9zZSBjb25mbGljdHMgdGhvc2Ugd2VyZSBjbGVhcmVkXG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIGRpc3Bvc2FibGVdIG9mIHRoaXMuY29uZmxpY3RzRGlzcG9zYWJsZXMuZW50cmllcygpKSB7XG5cdFx0XHRcdGlmICghY29uZmxpY3RzLnNvbWUoY29uZmxpY3QgPT4gdGhpcy50b0tleShjb25mbGljdCkgPT09IGtleSkpIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLmNvbmZsaWN0c0Rpc3Bvc2FibGVzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgY29uZmxpY3Qgb2YgdGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLmNvbmZsaWN0cykge1xuXHRcdFx0XHRjb25zdCBrZXkgPSB0aGlzLnRvS2V5KGNvbmZsaWN0KTtcblx0XHRcdFx0Ly8gU2hvdyBjb25mbGljdHMgbm90aWZpY2F0aW9uIGlmIG5vdCBzaG93biBiZWZvcmVcblx0XHRcdFx0aWYgKCF0aGlzLmNvbmZsaWN0c0Rpc3Bvc2FibGVzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29uZmxpY3RzQXJlYSA9IGdldFN5bmNBcmVhTGFiZWwoY29uZmxpY3Quc3luY1Jlc291cmNlKTtcblx0XHRcdFx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5Lldhcm5pbmcsIGxvY2FsaXplKCdjb25mbGljdHMgZGV0ZWN0ZWQnLCBcIlVuYWJsZSB0byBzeW5jIGR1ZSB0byBjb25mbGljdHMgaW4gezB9LiBQbGVhc2UgcmVzb2x2ZSB0aGVtIHRvIGNvbnRpbnVlLlwiLCBjb25mbGljdHNBcmVhLnRvTG93ZXJDYXNlKCkpLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZXBsYWNlIHJlbW90ZScsIFwiUmVwbGFjZSBSZW1vdGVcIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLmFjY2VwdExvY2FsKGNvbmZsaWN0LCBjb25mbGljdC5jb25mbGljdHNbMF0pO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVwbGFjZSBsb2NhbCcsIFwiUmVwbGFjZSBMb2NhbFwiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuYWNjZXB0UmVtb3RlKGNvbmZsaWN0LCBjb25mbGljdC5jb25mbGljdHNbMF0pO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2hvdyBjb25mbGljdHMnLCBcIlNob3cgQ29uZmxpY3RzXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyBzb3VyY2U6IHN0cmluZzsgYWN0aW9uPzogc3RyaW5nIH0sIFN5bmNDb25mbGljdHNDbGFzc2lmaWNhdGlvbj4oJ3N5bmMvc2hvd0NvbmZsaWN0cycsIHsgc291cmNlOiBjb25mbGljdC5zeW5jUmVzb3VyY2UgfSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2Uuc2hvd0NvbmZsaWN0cyhjb25mbGljdC5jb25mbGljdHNbMF0pO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0c3RpY2t5OiB0cnVlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR0aGlzLmNvbmZsaWN0c0Rpc3Bvc2FibGVzLnNldChrZXksIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBjbG9zZSB0aGUgY29uZmxpY3RzIHdhcm5pbmcgbm90aWZpY2F0aW9uXG5cdFx0XHRcdFx0XHRoYW5kbGUuY2xvc2UoKTtcblx0XHRcdFx0XHRcdHRoaXMuY29uZmxpY3RzRGlzcG9zYWJsZXMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29uZmxpY3RzRGlzcG9zYWJsZXMuZm9yRWFjaChkaXNwb3NhYmxlID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblx0XHRcdHRoaXMuY29uZmxpY3RzRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFjY2VwdFJlbW90ZShzeW5jUmVzb3VyY2U6IElVc2VyRGF0YVN5bmNSZXNvdXJjZSwgY29uZmxpY3Q6IElSZXNvdXJjZVByZXZpZXcpIHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLmFjY2VwdChzeW5jUmVzb3VyY2UsIGNvbmZsaWN0LnJlbW90ZVJlc291cmNlLCB1bmRlZmluZWQsIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnYWNjZXB0IGZhaWxlZCcsIFwiRXJyb3Igd2hpbGUgYWNjZXB0aW5nIGNoYW5nZXMuIFBsZWFzZSBjaGVjayBbbG9nc10oezB9KSBmb3IgbW9yZSBkZXRhaWxzLlwiLCBgY29tbWFuZDoke1NIT1dfU1lOQ19MT0dfQ09NTUFORF9JRH1gKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhY2NlcHRMb2NhbChzeW5jUmVzb3VyY2U6IElVc2VyRGF0YVN5bmNSZXNvdXJjZSwgY29uZmxpY3Q6IElSZXNvdXJjZVByZXZpZXcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLmFjY2VwdChzeW5jUmVzb3VyY2UsIGNvbmZsaWN0LmxvY2FsUmVzb3VyY2UsIHVuZGVmaW5lZCwgdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdhY2NlcHQgZmFpbGVkJywgXCJFcnJvciB3aGlsZSBhY2NlcHRpbmcgY2hhbmdlcy4gUGxlYXNlIGNoZWNrIFtsb2dzXSh7MH0pIGZvciBtb3JlIGRldGFpbHMuXCIsIGBjb21tYW5kOiR7U0hPV19TWU5DX0xPR19DT01NQU5EX0lEfWApKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uQXV0b1N5bmNFcnJvcihlcnJvcjogVXNlckRhdGFTeW5jRXJyb3IpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKGVycm9yLmNvZGUpIHtcblx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlNlc3Npb25FeHBpcmVkOlxuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnc2Vzc2lvbiBleHBpcmVkJywgXCJTZXR0aW5ncyBzeW5jIHdhcyB0dXJuZWQgb2ZmIGJlY2F1c2UgY3VycmVudCBzZXNzaW9uIGlzIGV4cGlyZWQsIHBsZWFzZSBzaWduIGluIGFnYWluIHRvIHR1cm4gb24gc3luYy5cIiksXG5cdFx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogW3RvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0aWQ6ICd0dXJuIG9uIHN5bmMnLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3R1cm4gb24gc3luYycsIFwiVHVybiBvbiBTZXR0aW5ncyBTeW5jLi4uXCIpLFxuXHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMudHVybk9uKClcblx0XHRcdFx0XHRcdH0pXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVHVybmVkT2ZmOlxuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndHVybmVkIG9mZicsIFwiU2V0dGluZ3Mgc3luYyB3YXMgdHVybmVkIG9mZiBmcm9tIGFub3RoZXIgZGV2aWNlLCBwbGVhc2UgdHVybiBvbiBzeW5jIGFnYWluLlwiKSxcblx0XHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBbdG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRpZDogJ3R1cm4gb24gc3luYycsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndHVybiBvbiBzeW5jJywgXCJUdXJuIG9uIFNldHRpbmdzIFN5bmMuLi5cIiksXG5cdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy50dXJuT24oKVxuXHRcdFx0XHRcdFx0fSldXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ub29MYXJnZTpcblx0XHRcdFx0aWYgKGVycm9yLnJlc291cmNlID09PSBTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3MgfHwgZXJyb3IucmVzb3VyY2UgPT09IFN5bmNSZXNvdXJjZS5TZXR0aW5ncyB8fCBlcnJvci5yZXNvdXJjZSA9PT0gU3luY1Jlc291cmNlLlRhc2tzKSB7XG5cdFx0XHRcdFx0dGhpcy5kaXNhYmxlU3luYyhlcnJvci5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0Y29uc3Qgc291cmNlQXJlYSA9IGdldFN5bmNBcmVhTGFiZWwoZXJyb3IucmVzb3VyY2UpO1xuXHRcdFx0XHRcdHRoaXMuaGFuZGxlVG9vTGFyZ2VFcnJvcihlcnJvci5yZXNvdXJjZSwgbG9jYWxpemUoJ3RvbyBsYXJnZScsIFwiRGlzYWJsZWQgc3luY2luZyB7MH0gYmVjYXVzZSBzaXplIG9mIHRoZSB7MX0gZmlsZSB0byBzeW5jIGlzIGxhcmdlciB0aGFuIHsyfS4gUGxlYXNlIG9wZW4gdGhlIGZpbGUgYW5kIHJlZHVjZSB0aGUgc2l6ZSBhbmQgZW5hYmxlIHN5bmNcIiwgc291cmNlQXJlYS50b0xvd2VyQ2FzZSgpLCBzb3VyY2VBcmVhLnRvTG93ZXJDYXNlKCksICcxMDBrYicpLCBlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Mb2NhbFRvb01hbnlQcm9maWxlczpcblx0XHRcdFx0dGhpcy5kaXNhYmxlU3luYyhTeW5jUmVzb3VyY2UuUHJvZmlsZXMpO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3RvbyBtYW55IHByb2ZpbGVzJywgXCJEaXNhYmxlZCBzeW5jaW5nIHByb2ZpbGVzIGJlY2F1c2UgdGhlcmUgYXJlIHRvbyBtYW55IHByb2ZpbGVzIHRvIHN5bmMuIFNldHRpbmdzIFN5bmMgc3VwcG9ydHMgc3luY2luZyBtYXhpbXVtIDIwIHByb2ZpbGVzLiBQbGVhc2UgcmVkdWNlIHRoZSBudW1iZXIgb2YgcHJvZmlsZXMgYW5kIGVuYWJsZSBzeW5jXCIpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5JbmNvbXBhdGlibGVMb2NhbENvbnRlbnQ6XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Hb25lOlxuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVXBncmFkZVJlcXVpcmVkOiB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBsb2NhbGl6ZSgnZXJyb3IgdXBncmFkZSByZXF1aXJlZCcsIFwiU2V0dGluZ3Mgc3luYyBpcyBkaXNhYmxlZCBiZWNhdXNlIHRoZSBjdXJyZW50IHZlcnNpb24gKHswfSwgezF9KSBpcyBub3QgY29tcGF0aWJsZSB3aXRoIHRoZSBzeW5jIHNlcnZpY2UuIFBsZWFzZSB1cGRhdGUgYmVmb3JlIHR1cm5pbmcgb24gc3luYy5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdCk7XG5cdFx0XHRcdGNvbnN0IG9wZXJhdGlvbklkID0gZXJyb3Iub3BlcmF0aW9uSWQgPyBsb2NhbGl6ZSgnb3BlcmF0aW9uSWQnLCBcIk9wZXJhdGlvbiBJZDogezB9XCIsIGVycm9yLm9wZXJhdGlvbklkKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IG9wZXJhdGlvbklkID8gYCR7bWVzc2FnZX0gJHtvcGVyYXRpb25JZH1gIDogbWVzc2FnZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTWV0aG9kTm90Rm91bmQ6IHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKCdtZXRob2Qgbm90IGZvdW5kJywgXCJTZXR0aW5ncyBzeW5jIGlzIGRpc2FibGVkIGJlY2F1c2UgdGhlIGNsaWVudCBpcyBtYWtpbmcgaW52YWxpZCByZXF1ZXN0cy4gUGxlYXNlIHJlcG9ydCBhbiBpc3N1ZSB3aXRoIHRoZSBsb2dzLlwiKTtcblx0XHRcdFx0Y29uc3Qgb3BlcmF0aW9uSWQgPSBlcnJvci5vcGVyYXRpb25JZCA/IGxvY2FsaXplKCdvcGVyYXRpb25JZCcsIFwiT3BlcmF0aW9uIElkOiB7MH1cIiwgZXJyb3Iub3BlcmF0aW9uSWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0bWVzc2FnZTogb3BlcmF0aW9uSWQgPyBgJHttZXNzYWdlfSAke29wZXJhdGlvbklkfWAgOiBtZXNzYWdlLFxuXHRcdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IFtcblx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdGlkOiAnU2hvdyBTeW5jIExvZ3MnLFxuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2hvdyBzeW5jIGxvZ3MnLCBcIlNob3cgTG9nXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChTSE9XX1NZTkNfTE9HX0NPTU1BTkRfSUQpXG5cdFx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdFx0XHR0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6ICdSZXBvcnQgSXNzdWUnLFxuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVwb3J0IGlzc3VlJywgXCJSZXBvcnQgSXNzdWVcIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLndvcmtiZW5jaElzc3VlU2VydmljZS5vcGVuUmVwb3J0ZXIoKVxuXHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuSW5jb21wYXRpYmxlUmVtb3RlQ29udGVudDpcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdlcnJvciByZXNldCByZXF1aXJlZCcsIFwiU2V0dGluZ3Mgc3luYyBpcyBkaXNhYmxlZCBiZWNhdXNlIHlvdXIgZGF0YSBpbiB0aGUgY2xvdWQgaXMgb2xkZXIgdGhhbiB0aGF0IG9mIHRoZSBjbGllbnQuIFBsZWFzZSBjbGVhciB5b3VyIGRhdGEgaW4gdGhlIGNsb3VkIGJlZm9yZSB0dXJuaW5nIG9uIHN5bmMuXCIpLFxuXHRcdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IFtcblx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdGlkOiAncmVzZXQnLFxuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVzZXQnLCBcIkNsZWFyIERhdGEgaW4gQ2xvdWQuLi5cIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UucmVzZXRTeW5jZWREYXRhKClcblx0XHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XHRcdHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0XHRpZDogJ3Nob3cgc3luY2VkIGRhdGEnLFxuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2hvdyBzeW5jZWQgZGF0YSBhY3Rpb24nLCBcIlNob3cgU3luY2VkIERhdGFcIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2Uuc2hvd1N5bmNBY3Rpdml0eSgpXG5cdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5TZXJ2aWNlQ2hhbmdlZDpcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0bWVzc2FnZTogdGhpcy51c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlPy50eXBlID09PSAnaW5zaWRlcnMnID9cblx0XHRcdFx0XHRcdGxvY2FsaXplKCdzZXJ2aWNlIHN3aXRjaGVkIHRvIGluc2lkZXJzJywgXCJTZXR0aW5ncyBTeW5jIGhhcyBiZWVuIHN3aXRjaGVkIHRvIGluc2lkZXJzIHNlcnZpY2VcIikgOlxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3NlcnZpY2Ugc3dpdGNoZWQgdG8gc3RhYmxlJywgXCJTZXR0aW5ncyBTeW5jIGhhcyBiZWVuIHN3aXRjaGVkIHRvIHN0YWJsZSBzZXJ2aWNlXCIpLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkRlZmF1bHRTZXJ2aWNlQ2hhbmdlZDpcblx0XHRcdFx0Ly8gU2V0dGluZ3Mgc3luYyBpcyB1c2luZyBzZXBhcmF0ZSBzZXJ2aWNlXG5cdFx0XHRcdGlmICh0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd1c2luZyBzZXBhcmF0ZSBzZXJ2aWNlJywgXCJTZXR0aW5ncyBzeW5jIG5vdyB1c2VzIGEgc2VwYXJhdGUgc2VydmljZSwgbW9yZSBpbmZvcm1hdGlvbiBpcyBhdmFpbGFibGUgaW4gdGhlIFtTZXR0aW5ncyBTeW5jIERvY3VtZW50YXRpb25dKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1zZXR0aW5ncy1zeW5jLWhlbHAjX3N5bmNpbmctc3RhYmxlLXZlcnN1cy1pbnNpZGVycykuXCIpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgc2V0dGluZ3Mgc3luYyBnb3QgdHVybmVkIG9mZiB0aGVuIGFzayB1c2VyIHRvIHR1cm4gb24gc3luYyBhZ2Fpbi5cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdzZXJ2aWNlIGNoYW5nZWQgYW5kIHR1cm5lZCBvZmYnLCBcIlNldHRpbmdzIHN5bmMgd2FzIHR1cm5lZCBvZmYgYmVjYXVzZSB7MH0gbm93IHVzZXMgYSBzZXBhcmF0ZSBzZXJ2aWNlLiBQbGVhc2UgdHVybiBvbiBzeW5jIGFnYWluLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSxcblx0XHRcdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0cHJpbWFyeTogW3RvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0XHRpZDogJ3R1cm4gb24gc3luYycsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0dXJuIG9uIHN5bmMnLCBcIlR1cm4gb24gU2V0dGluZ3MgU3luYy4uLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMudHVybk9uKClcblx0XHRcdFx0XHRcdFx0fSldXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlVG9vTGFyZ2VFcnJvcihyZXNvdXJjZTogU3luY1Jlc291cmNlLCBtZXNzYWdlOiBzdHJpbmcsIGVycm9yOiBVc2VyRGF0YVN5bmNFcnJvcik6IHZvaWQge1xuXHRcdGNvbnN0IG9wZXJhdGlvbklkID0gZXJyb3Iub3BlcmF0aW9uSWQgPyBsb2NhbGl6ZSgnb3BlcmF0aW9uSWQnLCBcIk9wZXJhdGlvbiBJZDogezB9XCIsIGVycm9yLm9wZXJhdGlvbklkKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdG1lc3NhZ2U6IG9wZXJhdGlvbklkID8gYCR7bWVzc2FnZX0gJHtvcGVyYXRpb25JZH1gIDogbWVzc2FnZSxcblx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0cHJpbWFyeTogW3RvQWN0aW9uKHtcblx0XHRcdFx0XHRpZDogJ29wZW4gc3luYyBmaWxlJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ29wZW4gZmlsZScsIFwiT3BlbiB7MH0gRmlsZVwiLCBnZXRTeW5jQXJlYUxhYmVsKHJlc291cmNlKSksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiByZXNvdXJjZSA9PT0gU3luY1Jlc291cmNlLlNldHRpbmdzID8gdGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblVzZXJTZXR0aW5ncyh7IGpzb25FZGl0b3I6IHRydWUgfSkgOiB0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuR2xvYmFsS2V5YmluZGluZ1NldHRpbmdzKHRydWUpXG5cdFx0XHRcdH0pXVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBpbnZhbGlkQ29udGVudEVycm9yRGlzcG9zYWJsZXMgPSBuZXcgTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCk7XG5cdHByaXZhdGUgb25TeW5jaHJvbml6ZXJFcnJvcnMoZXJyb3JzOiBJVXNlckRhdGFTeW5jUmVzb3VyY2VFcnJvcltdKTogdm9pZCB7XG5cdFx0aWYgKGVycm9ycy5sZW5ndGgpIHtcblx0XHRcdGZvciAoY29uc3QgeyBwcm9maWxlLCBzeW5jUmVzb3VyY2U6IHJlc291cmNlLCBlcnJvciB9IG9mIGVycm9ycykge1xuXHRcdFx0XHRzd2l0Y2ggKGVycm9yLmNvZGUpIHtcblx0XHRcdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Mb2NhbEludmFsaWRDb250ZW50OlxuXHRcdFx0XHRcdFx0dGhpcy5oYW5kbGVJbnZhbGlkQ29udGVudEVycm9yKHsgcHJvZmlsZSwgc3luY1Jlc291cmNlOiByZXNvdXJjZSB9KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0XHRcdGNvbnN0IGtleSA9IGAke3Byb2ZpbGUuaWR9OiR7cmVzb3VyY2V9YDtcblx0XHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLmludmFsaWRDb250ZW50RXJyb3JEaXNwb3NhYmxlcy5nZXQoa2V5KTtcblx0XHRcdFx0XHRcdGlmIChkaXNwb3NhYmxlKSB7XG5cdFx0XHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmludmFsaWRDb250ZW50RXJyb3JEaXNwb3NhYmxlcy5kZWxldGUoa2V5KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbnZhbGlkQ29udGVudEVycm9yRGlzcG9zYWJsZXMuZm9yRWFjaChkaXNwb3NhYmxlID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblx0XHRcdHRoaXMuaW52YWxpZENvbnRlbnRFcnJvckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVJbnZhbGlkQ29udGVudEVycm9yKHsgcHJvZmlsZSwgc3luY1Jlc291cmNlOiBzb3VyY2UgfTogSVVzZXJEYXRhU3luY1Jlc291cmNlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pZCAhPT0gcHJvZmlsZS5pZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBrZXkgPSBgJHtwcm9maWxlLmlkfToke3NvdXJjZX1gO1xuXHRcdGlmICh0aGlzLmludmFsaWRDb250ZW50RXJyb3JEaXNwb3NhYmxlcy5oYXMoa2V5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc291cmNlICE9PSBTeW5jUmVzb3VyY2UuU2V0dGluZ3MgJiYgc291cmNlICE9PSBTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3MgJiYgc291cmNlICE9PSBTeW5jUmVzb3VyY2UuVGFza3MpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmhvc3RTZXJ2aWNlLmhhc0ZvY3VzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlc291cmNlID0gc291cmNlID09PSBTeW5jUmVzb3VyY2UuU2V0dGluZ3MgPyB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZVxuXHRcdFx0OiBzb3VyY2UgPT09IFN5bmNSZXNvdXJjZS5LZXliaW5kaW5ncyA/IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5rZXliaW5kaW5nc1Jlc291cmNlXG5cdFx0XHRcdDogdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cdFx0Y29uc3QgZWRpdG9yVXJpID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdGlmIChpc0VxdWFsKHJlc291cmNlLCBlZGl0b3JVcmkpKSB7XG5cdFx0XHQvLyBEbyBub3Qgc2hvdyBub3RpZmljYXRpb24gaWYgdGhlIGZpbGUgaW4gZXJyb3IgaXMgYWN0aXZlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVycm9yQXJlYSA9IGdldFN5bmNBcmVhTGFiZWwoc291cmNlKTtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdlcnJvckludmFsaWRDb25maWd1cmF0aW9uJywgXCJVbmFibGUgdG8gc3luYyB7MH0gYmVjYXVzZSB0aGUgY29udGVudCBpbiB0aGUgZmlsZSBpcyBub3QgdmFsaWQuIFBsZWFzZSBvcGVuIHRoZSBmaWxlIGFuZCBjb3JyZWN0IGl0LlwiLCBlcnJvckFyZWEudG9Mb3dlckNhc2UoKSksXG5cdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdHByaW1hcnk6IFt0b0FjdGlvbih7XG5cdFx0XHRcdFx0aWQ6ICdvcGVuIHN5bmMgZmlsZScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdvcGVuIGZpbGUnLCBcIk9wZW4gezB9IEZpbGVcIiwgZXJyb3JBcmVhKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHNvdXJjZSA9PT0gU3luY1Jlc291cmNlLlNldHRpbmdzID8gdGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblVzZXJTZXR0aW5ncyh7IGpzb25FZGl0b3I6IHRydWUgfSkgOiB0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuR2xvYmFsS2V5YmluZGluZ1NldHRpbmdzKHRydWUpXG5cdFx0XHRcdH0pXVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuaW52YWxpZENvbnRlbnRFcnJvckRpc3Bvc2FibGVzLnNldChrZXksIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHQvLyBjbG9zZSB0aGUgZXJyb3Igd2FybmluZyBub3RpZmljYXRpb25cblx0XHRcdGhhbmRsZS5jbG9zZSgpO1xuXHRcdFx0dGhpcy5pbnZhbGlkQ29udGVudEVycm9yRGlzcG9zYWJsZXMuZGVsZXRlKGtleSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb25mbGljdHNDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UuY29uZmxpY3RzLnJlZHVjZSgocmVzdWx0LCB7IGNvbmZsaWN0cyB9KSA9PiB7IHJldHVybiByZXN1bHQgKyBjb25mbGljdHMubGVuZ3RoOyB9LCAwKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlR2xvYmFsQWN0aXZpdHlCYWRnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmdsb2JhbEFjdGl2aXR5QmFkZ2VEaXNwb3NhYmxlLmNsZWFyKCk7XG5cblx0XHRsZXQgYmFkZ2U6IElCYWRnZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLmNvbmZsaWN0cy5sZW5ndGggJiYgdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0YmFkZ2UgPSBuZXcgTnVtYmVyQmFkZ2UodGhpcy5nZXRDb25mbGljdHNDb3VudCgpLCAoKSA9PiBsb2NhbGl6ZSgnaGFzIGNvbmZsaWN0cycsIFwiezB9OiBDb25mbGljdHMgRGV0ZWN0ZWRcIiwgU1lOQ19USVRMRS52YWx1ZSkpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy50dXJuaW5nT25TeW5jKSB7XG5cdFx0XHRiYWRnZSA9IG5ldyBQcm9ncmVzc0JhZGdlKCgpID0+IGxvY2FsaXplKCd0dXJuaW5nIG9uIHN5bmNpbmcnLCBcIlR1cm5pbmcgb24gU2V0dGluZ3MgU3luYy4uLlwiKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGJhZGdlKSB7XG5cdFx0XHR0aGlzLmdsb2JhbEFjdGl2aXR5QmFkZ2VEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5hY3Rpdml0eVNlcnZpY2Uuc2hvd0dsb2JhbEFjdGl2aXR5KHsgYmFkZ2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVBY2NvdW50QmFkZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5hY2NvdW50QmFkZ2VEaXNwb3NhYmxlLmNsZWFyKCk7XG5cblx0XHRsZXQgYmFkZ2U6IElCYWRnZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2Uuc3RhdHVzICE9PSBTeW5jU3RhdHVzLlVuaW5pdGlhbGl6ZWQgJiYgdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSAmJiB0aGlzLnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UuYWNjb3VudFN0YXR1cyA9PT0gQWNjb3VudFN0YXR1cy5VbmF2YWlsYWJsZSkge1xuXHRcdFx0YmFkZ2UgPSBuZXcgTnVtYmVyQmFkZ2UoMSwgKCkgPT4gbG9jYWxpemUoJ3NpZ24gaW4gdG8gc3luYycsIFwiU2lnbiBpbiB0byBTeW5jIFNldHRpbmdzXCIpKTtcblx0XHR9XG5cblx0XHRpZiAoYmFkZ2UpIHtcblx0XHRcdHRoaXMuYWNjb3VudEJhZGdlRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMuYWN0aXZpdHlTZXJ2aWNlLnNob3dBY2NvdW50c0FjdGl2aXR5KHsgYmFkZ2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0dXJuT24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdGhpcy51c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmxlbmd0aCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVycycsIFwiTm8gYXV0aGVudGljYXRpb24gcHJvdmlkZXJzIGFyZSBhdmFpbGFibGUuXCIpKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHR1cm5PbiA9IGF3YWl0IHRoaXMuYXNrVG9Db25maWd1cmUoKTtcblx0XHRcdGlmICghdHVybk9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UudXNlckRhdGFTeW5jU3RvcmU/LmNhblN3aXRjaCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnNlbGVjdFNldHRpbmdzU3luY1NlcnZpY2UodGhpcy51c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS50dXJuT24oKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY0Vycm9yKSB7XG5cdFx0XHRcdHN3aXRjaCAoZS5jb2RlKSB7XG5cdFx0XHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVG9vTGFyZ2U6XG5cdFx0XHRcdFx0XHRpZiAoZS5yZXNvdXJjZSA9PT0gU3luY1Jlc291cmNlLktleWJpbmRpbmdzIHx8IGUucmVzb3VyY2UgPT09IFN5bmNSZXNvdXJjZS5TZXR0aW5ncyB8fCBlLnJlc291cmNlID09PSBTeW5jUmVzb3VyY2UuVGFza3MpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5oYW5kbGVUb29MYXJnZUVycm9yKGUucmVzb3VyY2UsIGxvY2FsaXplKCd0b28gbGFyZ2Ugd2hpbGUgc3RhcnRpbmcgc3luYycsIFwiU2V0dGluZ3Mgc3luYyBjYW5ub3QgYmUgdHVybmVkIG9uIGJlY2F1c2Ugc2l6ZSBvZiB0aGUgezB9IGZpbGUgdG8gc3luYyBpcyBsYXJnZXIgdGhhbiB7MX0uIFBsZWFzZSBvcGVuIHRoZSBmaWxlIGFuZCByZWR1Y2UgdGhlIHNpemUgYW5kIHR1cm4gb24gc3luY1wiLCBnZXRTeW5jQXJlYUxhYmVsKGUucmVzb3VyY2UpLnRvTG93ZXJDYXNlKCksICcxMDBrYicpLCBlKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuSW5jb21wYXRpYmxlTG9jYWxDb250ZW50OlxuXHRcdFx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkdvbmU6XG5cdFx0XHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVXBncmFkZVJlcXVpcmVkOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoJ2Vycm9yIHVwZ3JhZGUgcmVxdWlyZWQgd2hpbGUgc3RhcnRpbmcgc3luYycsIFwiU2V0dGluZ3Mgc3luYyBjYW5ub3QgYmUgdHVybmVkIG9uIGJlY2F1c2UgdGhlIGN1cnJlbnQgdmVyc2lvbiAoezB9LCB7MX0pIGlzIG5vdCBjb21wYXRpYmxlIHdpdGggdGhlIHN5bmMgc2VydmljZS4gUGxlYXNlIHVwZGF0ZSBiZWZvcmUgdHVybmluZyBvbiBzeW5jLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIHRoaXMucHJvZHVjdFNlcnZpY2UuY29tbWl0KTtcblx0XHRcdFx0XHRcdGNvbnN0IG9wZXJhdGlvbklkID0gZS5vcGVyYXRpb25JZCA/IGxvY2FsaXplKCdvcGVyYXRpb25JZCcsIFwiT3BlcmF0aW9uIElkOiB7MH1cIiwgZS5vcGVyYXRpb25JZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBvcGVyYXRpb25JZCA/IGAke21lc3NhZ2V9ICR7b3BlcmF0aW9uSWR9YCA6IG1lc3NhZ2UsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuSW5jb21wYXRpYmxlUmVtb3RlQ29udGVudDpcblx0XHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdlcnJvciByZXNldCByZXF1aXJlZCB3aGlsZSBzdGFydGluZyBzeW5jJywgXCJTZXR0aW5ncyBzeW5jIGNhbm5vdCBiZSB0dXJuZWQgb24gYmVjYXVzZSB5b3VyIGRhdGEgaW4gdGhlIGNsb3VkIGlzIG9sZGVyIHRoYW4gdGhhdCBvZiB0aGUgY2xpZW50LiBQbGVhc2UgY2xlYXIgeW91ciBkYXRhIGluIHRoZSBjbG91ZCBiZWZvcmUgdHVybmluZyBvbiBzeW5jLlwiKSxcblx0XHRcdFx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRcdHByaW1hcnk6IFtcblx0XHRcdFx0XHRcdFx0XHRcdHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWQ6ICdyZXNldCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVzZXQnLCBcIkNsZWFyIERhdGEgaW4gQ2xvdWQuLi5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy51c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLnJlc2V0U3luY2VkRGF0YSgpXG5cdFx0XHRcdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRcdFx0XHRcdHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWQ6ICdzaG93IHN5bmNlZCBkYXRhJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaG93IHN5bmNlZCBkYXRhIGFjdGlvbicsIFwiU2hvdyBTeW5jZWQgRGF0YVwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2Uuc2hvd1N5bmNBY3Rpdml0eSgpXG5cdFx0XHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVW5hdXRob3JpemVkOlxuXHRcdFx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkZvcmJpZGRlbjpcblx0XHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnYXV0aCBmYWlsZWQnLCBcIkVycm9yIHdoaWxlIHR1cm5pbmcgb24gU2V0dGluZ3MgU3luYzogQXV0aGVudGljYXRpb24gZmFpbGVkLlwiKSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCd0dXJuIG9uIGZhaWxlZCB3aXRoIHVzZXIgZGF0YSBzeW5jIGVycm9yJywgXCJFcnJvciB3aGlsZSB0dXJuaW5nIG9uIFNldHRpbmdzIFN5bmMuIFBsZWFzZSBjaGVjayBbbG9nc10oezB9KSBmb3IgbW9yZSBkZXRhaWxzLlwiLCBgY29tbWFuZDoke1NIT1dfU1lOQ19MT0dfQ09NTUFORF9JRH1gKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoeyBrZXk6ICd0dXJuIG9uIGZhaWxlZCcsIGNvbW1lbnQ6IFsnU3Vic3RpdHV0aW9uIGlzIGZvciBlcnJvciByZWFzb24nXSB9LCBcIkVycm9yIHdoaWxlIHR1cm5pbmcgb24gU2V0dGluZ3MgU3luYy4gezB9XCIsIGdldEVycm9yTWVzc2FnZShlKSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXNrVG9Db25maWd1cmUoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPGJvb2xlYW4+KChjLCBlKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgcXVpY2tQaWNrID0gdGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8Q29uZmlndXJlU3luY1F1aWNrUGlja0l0ZW0+KCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrKTtcblx0XHRcdHF1aWNrUGljay50aXRsZSA9IFNZTkNfVElUTEUudmFsdWU7XG5cdFx0XHRxdWlja1BpY2sub2sgPSBmYWxzZTtcblx0XHRcdHF1aWNrUGljay5jdXN0b21CdXR0b24gPSB0cnVlO1xuXHRcdFx0cXVpY2tQaWNrLmN1c3RvbUxhYmVsID0gbG9jYWxpemUoJ3NpZ24gaW4gYW5kIHR1cm4gb24nLCBcIlNpZ24gaW5cIik7XG5cdFx0XHRxdWlja1BpY2suZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgnY29uZmlndXJlIGFuZCB0dXJuIG9uIHN5bmMgZGV0YWlsJywgXCJQbGVhc2Ugc2lnbiBpbiB0byBiYWNrdXAgYW5kIHN5bmMgeW91ciBkYXRhIGFjcm9zcyBkZXZpY2VzLlwiKTtcblx0XHRcdHF1aWNrUGljay5jYW5TZWxlY3RNYW55ID0gdHJ1ZTtcblx0XHRcdHF1aWNrUGljay5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0XHRxdWlja1BpY2suaGlkZUlucHV0ID0gdHJ1ZTtcblx0XHRcdHF1aWNrUGljay5oaWRlQ2hlY2tBbGwgPSB0cnVlO1xuXG5cdFx0XHRjb25zdCBpdGVtcyA9IHRoaXMuZ2V0Q29uZmlndXJlU3luY1F1aWNrUGlja0l0ZW1zKCk7XG5cdFx0XHRxdWlja1BpY2suaXRlbXMgPSBpdGVtcztcblx0XHRcdHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zID0gaXRlbXMuZmlsdGVyKGl0ZW0gPT4gdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc1Jlc291cmNlRW5hYmxlZChpdGVtLmlkLCB0cnVlKSk7XG5cdFx0XHRsZXQgYWNjZXB0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5hbnkocXVpY2tQaWNrLm9uRGlkQWNjZXB0LCBxdWlja1BpY2sub25EaWRDdXN0b20pKCgpID0+IHtcblx0XHRcdFx0YWNjZXB0ZWQgPSB0cnVlO1xuXHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmIChhY2NlcHRlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVDb25maWd1cmF0aW9uKGl0ZW1zLCBxdWlja1BpY2suc2VsZWN0ZWRJdGVtcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGMoYWNjZXB0ZWQpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGUoZXJyb3IpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uZmlndXJlU3luY1F1aWNrUGlja0l0ZW1zKCk6IENvbmZpZ3VyZVN5bmNRdWlja1BpY2tJdGVtW10ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IFt7XG5cdFx0XHRpZDogU3luY1Jlc291cmNlLlNldHRpbmdzLFxuXHRcdFx0bGFiZWw6IGdldFN5bmNBcmVhTGFiZWwoU3luY1Jlc291cmNlLlNldHRpbmdzKVxuXHRcdH0sIHtcblx0XHRcdGlkOiBTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3MsXG5cdFx0XHRsYWJlbDogZ2V0U3luY0FyZWFMYWJlbChTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3MpLFxuXHRcdH0sIHtcblx0XHRcdGlkOiBTeW5jUmVzb3VyY2UuU25pcHBldHMsXG5cdFx0XHRsYWJlbDogZ2V0U3luY0FyZWFMYWJlbChTeW5jUmVzb3VyY2UuU25pcHBldHMpXG5cdFx0fSwge1xuXHRcdFx0aWQ6IFN5bmNSZXNvdXJjZS5UYXNrcyxcblx0XHRcdGxhYmVsOiBnZXRTeW5jQXJlYUxhYmVsKFN5bmNSZXNvdXJjZS5UYXNrcylcblx0XHR9LCB7XG5cdFx0XHRpZDogU3luY1Jlc291cmNlLk1jcCxcblx0XHRcdGxhYmVsOiBnZXRTeW5jQXJlYUxhYmVsKFN5bmNSZXNvdXJjZS5NY3ApXG5cdFx0fSwge1xuXHRcdFx0aWQ6IFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZSxcblx0XHRcdGxhYmVsOiBnZXRTeW5jQXJlYUxhYmVsKFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZSksXG5cdFx0fSwge1xuXHRcdFx0aWQ6IFN5bmNSZXNvdXJjZS5FeHRlbnNpb25zLFxuXHRcdFx0bGFiZWw6IGdldFN5bmNBcmVhTGFiZWwoU3luY1Jlc291cmNlLkV4dGVuc2lvbnMpXG5cdFx0fSwge1xuXHRcdFx0aWQ6IFN5bmNSZXNvdXJjZS5Qcm9maWxlcyxcblx0XHRcdGxhYmVsOiBnZXRTeW5jQXJlYUxhYmVsKFN5bmNSZXNvdXJjZS5Qcm9maWxlcyksXG5cdFx0fSwge1xuXHRcdFx0aWQ6IFN5bmNSZXNvdXJjZS5Qcm9tcHRzLFxuXHRcdFx0bGFiZWw6IGdldFN5bmNBcmVhTGFiZWwoU3luY1Jlc291cmNlLlByb21wdHMpXG5cdFx0fV07XG5cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbmZpZ3VyYXRpb24oaXRlbXM6IENvbmZpZ3VyZVN5bmNRdWlja1BpY2tJdGVtW10sIHNlbGVjdGVkSXRlbXM6IFJlYWRvbmx5QXJyYXk8Q29uZmlndXJlU3luY1F1aWNrUGlja0l0ZW0+KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRjb25zdCB3YXNFbmFibGVkID0gdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc1Jlc291cmNlRW5hYmxlZChpdGVtLmlkKTtcblx0XHRcdGNvbnN0IGlzRW5hYmxlZCA9ICEhc2VsZWN0ZWRJdGVtcy5maWx0ZXIoc2VsZWN0ZWQgPT4gc2VsZWN0ZWQuaWQgPT09IGl0ZW0uaWQpWzBdO1xuXHRcdFx0aWYgKHdhc0VuYWJsZWQgIT09IGlzRW5hYmxlZCkge1xuXHRcdFx0XHR0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLnNldFJlc291cmNlRW5hYmxlbWVudChpdGVtLmlkLCBpc0VuYWJsZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29uZmlndXJlU3luY09wdGlvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChjLCBlKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgcXVpY2tQaWNrID0gdGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8Q29uZmlndXJlU3luY1F1aWNrUGlja0l0ZW0+KCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrKTtcblx0XHRcdHF1aWNrUGljay50aXRsZSA9IGxvY2FsaXplKCdjb25maWd1cmUgc3luYyB0aXRsZScsIFwiezB9OiBDb25maWd1cmUuLi5cIiwgU1lOQ19USVRMRS52YWx1ZSk7XG5cdFx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnY29uZmlndXJlIHN5bmMgcGxhY2Vob2xkZXInLCBcIkNob29zZSB3aGF0IHRvIHN5bmNcIik7XG5cdFx0XHRxdWlja1BpY2suY2FuU2VsZWN0TWFueSA9IHRydWU7XG5cdFx0XHRxdWlja1BpY2suaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdFx0cXVpY2tQaWNrLm9rID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRDb25maWd1cmVTeW5jUXVpY2tQaWNrSXRlbXMoKTtcblx0XHRcdHF1aWNrUGljay5pdGVtcyA9IGl0ZW1zO1xuXHRcdFx0cXVpY2tQaWNrLnNlbGVjdGVkSXRlbXMgPSBpdGVtcy5maWx0ZXIoaXRlbSA9PiB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzUmVzb3VyY2VFbmFibGVkKGl0ZW0uaWQpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAocXVpY2tQaWNrLnNlbGVjdGVkSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVDb25maWd1cmF0aW9uKGl0ZW1zLCBxdWlja1BpY2suc2VsZWN0ZWRJdGVtcyk7XG5cdFx0XHRcdFx0cXVpY2tQaWNrLmhpZGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdGMoKTtcblx0XHRcdH0pKTtcblx0XHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHR1cm5PZmYoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3R1cm4gb2ZmIHN5bmMgY29uZmlybWF0aW9uJywgXCJEbyB5b3Ugd2FudCB0byB0dXJuIG9mZiBzeW5jP1wiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3R1cm4gb2ZmIHN5bmMgZGV0YWlsJywgXCJZb3VyIHNldHRpbmdzLCBrZXliaW5kaW5ncywgZXh0ZW5zaW9ucywgc25pcHBldHMgYW5kIFVJIFN0YXRlIHdpbGwgbm8gbG9uZ2VyIGJlIHN5bmNlZC5cIiksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ3R1cm4gb2ZmJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmVHVybiBvZmZcIiksXG5cdFx0XHRjaGVja2JveDogdGhpcy51c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLmFjY291bnRTdGF0dXMgPT09IEFjY291bnRTdGF0dXMuQXZhaWxhYmxlID8ge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3R1cm4gb2ZmIHN5bmMgZXZlcnl3aGVyZScsIFwiVHVybiBvZmYgc3luYyBvbiBhbGwgeW91ciBkZXZpY2VzIGFuZCBjbGVhciB0aGUgZGF0YSBmcm9tIHRoZSBjbG91ZC5cIilcblx0XHRcdH0gOiB1bmRlZmluZWRcblx0XHR9KTtcblx0XHRpZiAocmVzdWx0LmNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS50dXJub2ZmKCEhcmVzdWx0LmNoZWNrYm94Q2hlY2tlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkaXNhYmxlU3luYyhzb3VyY2U6IFN5bmNSZXNvdXJjZSk6IHZvaWQge1xuXHRcdHN3aXRjaCAoc291cmNlKSB7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5TZXR0aW5nczogcmV0dXJuIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2Uuc2V0UmVzb3VyY2VFbmFibGVtZW50KFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgZmFsc2UpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3M6IHJldHVybiB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLnNldFJlc291cmNlRW5hYmxlbWVudChTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3MsIGZhbHNlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlNuaXBwZXRzOiByZXR1cm4gdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5zZXRSZXNvdXJjZUVuYWJsZW1lbnQoU3luY1Jlc291cmNlLlNuaXBwZXRzLCBmYWxzZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5UYXNrczogcmV0dXJuIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2Uuc2V0UmVzb3VyY2VFbmFibGVtZW50KFN5bmNSZXNvdXJjZS5UYXNrcywgZmFsc2UpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuRXh0ZW5zaW9uczogcmV0dXJuIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2Uuc2V0UmVzb3VyY2VFbmFibGVtZW50KFN5bmNSZXNvdXJjZS5FeHRlbnNpb25zLCBmYWxzZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZTogcmV0dXJuIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2Uuc2V0UmVzb3VyY2VFbmFibGVtZW50KFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZSwgZmFsc2UpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuUHJvZmlsZXM6IHJldHVybiB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLnNldFJlc291cmNlRW5hYmxlbWVudChTeW5jUmVzb3VyY2UuUHJvZmlsZXMsIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3dTeW5jQWN0aXZpdHkoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMub3V0cHV0U2VydmljZS5zaG93Q2hhbm5lbChVU0VSX0RBVEFfU1lOQ19MT0dfSUQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZWxlY3RTZXR0aW5nc1N5bmNTZXJ2aWNlKHVzZXJEYXRhU3luY1N0b3JlOiBJVXNlckRhdGFTeW5jU3RvcmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKGMsIGUpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBxdWlja1BpY2sgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8eyBpZDogVXNlckRhdGFTeW5jU3RvcmVUeXBlOyBsYWJlbDogc3RyaW5nOyBkZXNjcmlwdGlvbj86IHN0cmluZyB9PigpKTtcblx0XHRcdHF1aWNrUGljay50aXRsZSA9IGxvY2FsaXplKCdzd2l0Y2hTeW5jU2VydmljZS50aXRsZScsIFwiezB9OiBTZWxlY3QgU2VydmljZVwiLCBTWU5DX1RJVExFLnZhbHVlKTtcblx0XHRcdHF1aWNrUGljay5kZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdzd2l0Y2hTeW5jU2VydmljZS5kZXNjcmlwdGlvbicsIFwiRW5zdXJlIHlvdSBhcmUgdXNpbmcgdGhlIHNhbWUgc2V0dGluZ3Mgc3luYyBzZXJ2aWNlIHdoZW4gc3luY2luZyB3aXRoIG11bHRpcGxlIGVudmlyb25tZW50c1wiKTtcblx0XHRcdHF1aWNrUGljay5oaWRlSW5wdXQgPSB0cnVlO1xuXHRcdFx0cXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGdldERlc2NyaXB0aW9uID0gKHVybDogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0Y29uc3QgaXNEZWZhdWx0ID0gaXNFcXVhbCh1cmwsIHVzZXJEYXRhU3luY1N0b3JlLmRlZmF1bHRVcmwpO1xuXHRcdFx0XHRpZiAoaXNEZWZhdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdkZWZhdWx0JywgXCJEZWZhdWx0XCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9O1xuXHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdpbnNpZGVycycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpbnNpZGVycycsIFwiSW5zaWRlcnNcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGdldERlc2NyaXB0aW9uKHVzZXJEYXRhU3luY1N0b3JlLmluc2lkZXJzVXJsKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdzdGFibGUnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc3RhYmxlJywgXCJTdGFibGVcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGdldERlc2NyaXB0aW9uKHVzZXJEYXRhU3luY1N0b3JlLnN0YWJsZVVybClcblx0XHRcdFx0fVxuXHRcdFx0XTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS5zd2l0Y2gocXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0uaWQpO1xuXHRcdFx0XHRcdGMoKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRlKGVycm9yKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpKTtcblx0XHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQWN0aW9ucygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5jYW5Ub2dnbGVFbmFibGVtZW50KCkpIHtcblx0XHRcdHRoaXMucmVnaXN0ZXJUdXJuT25TeW5jQWN0aW9uKCk7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyVHVybk9mZlN5bmNBY3Rpb24oKTtcblx0XHR9XG5cdFx0dGhpcy5yZWdpc3RlclR1cm5pbmdPblN5bmNBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyQ2FuY2VsVHVybk9uU3luY0FjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJTaWduSW5BY3Rpb24oKTsgLy8gV2hlbiBTeW5jIGlzIHR1cm5lZCBvbiBmcm9tIENMSVxuXHRcdHRoaXMucmVnaXN0ZXJTaG93Q29uZmxpY3RzQWN0aW9uKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRW5hYmxlU3luY1ZpZXdzQWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3Rlck1hbmFnZVN5bmNBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyU3luY05vd0FjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJDb25maWd1cmVTeW5jQWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlclNob3dTZXR0aW5nc0FjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJIZWxwQWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlclNob3dMb2dBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyUmVzZXRTeW5jRGF0YUFjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJBY2NlcHRNZXJnZXNBY3Rpb24oKTtcblxuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0dGhpcy5yZWdpc3RlckRvd25sb2FkU3luY0FjdGl2aXR5QWN0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclR1cm5PblN5bmNBY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0Y29uc3Qgd2hlbiA9IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NZTkNfU1RBVEUubm90RXF1YWxzVG8oU3luY1N0YXR1cy5VbmluaXRpYWxpemVkKSwgQ09OVEVYVF9TWU5DX0VOQUJMRU1FTlQudG9OZWdhdGVkKCksIENPTlRFWFRfVFVSTklOR19PTl9TVEFURS5uZWdhdGUoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFR1cm5pbmdPblN5bmNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gudXNlckRhdGFTeW5jLmFjdGlvbnMudHVybk9uJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdnbG9iYWwgYWN0aXZpdHkgdHVybiBvbiBzeW5jJywgJ0JhY2t1cCBhbmQgU3luYyBTZXR0aW5ncy4uLicpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBTWU5DX1RJVExFLFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogd2hlbixcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0Z3JvdXA6ICczX2NvbmZpZ3VyYXRpb24nLFxuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5HbG9iYWxBY3Rpdml0eSxcblx0XHRcdFx0XHRcdHdoZW4sXG5cdFx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGdyb3VwOiAnM19jb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhclByZWZlcmVuY2VzTWVudSxcblx0XHRcdFx0XHRcdHdoZW4sXG5cdFx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGdyb3VwOiAnMV9zZXR0aW5ncycsXG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkFjY291bnRzQ29udGV4dCxcblx0XHRcdFx0XHRcdHdoZW4sXG5cdFx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC50dXJuT24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVHVybmluZ09uU3luY0FjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB3aGVuID0gQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU1lOQ19TVEFURS5ub3RFcXVhbHNUbyhTeW5jU3RhdHVzLlVuaW5pdGlhbGl6ZWQpLCBDT05URVhUX1NZTkNfRU5BQkxFTUVOVC50b05lZ2F0ZWQoKSwgQ09OVEVYVF9UVVJOSU5HX09OX1NUQVRFKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgVHVybmluZ09uU3luY0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC51c2VyRGF0YS5hY3Rpb25zLnR1cm5pbmdPbicsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd0dXJuaW5nIG9uIHN5bmMnLCBcIlR1cm5pbmcgb24gU2V0dGluZ3MgU3luYy4uLlwiKSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmZhbHNlKCksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGdyb3VwOiAnM19jb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuR2xvYmFsQWN0aXZpdHksXG5cdFx0XHRcdFx0XHR3aGVuLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRncm91cDogJzFfc2V0dGluZ3MnLFxuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5BY2NvdW50c0NvbnRleHQsXG5cdFx0XHRcdFx0XHR3aGVuLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNhbmNlbFR1cm5PblN5bmNBY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFR1cm5pbmdPblN5bmNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gudXNlckRhdGEuYWN0aW9ucy5jYW5jZWxUdXJuT24nLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2FuY2VsIHR1cm5pbmcgb24gc3luYycsIFwiQ2FuY2VsXCIpLFxuXHRcdFx0XHRcdGljb246IENvZGljb24uc3RvcENpcmNsZSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1RVUk5JTkdfT05fU1RBVEUsIENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsIFNZTkNfVklFV19DT05UQUlORVJfSUQpKSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHJldHVybiB0aGF0LnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UudHVybm9mZihmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNpZ25JbkFjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCBpZCA9ICd3b3JrYmVuY2gudXNlckRhdGEuYWN0aW9ucy5zaWduaW4nO1xuXHRcdGNvbnN0IHdoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TWU5DX1NUQVRFLm5vdEVxdWFsc1RvKFN5bmNTdGF0dXMuVW5pbml0aWFsaXplZCksIENPTlRFWFRfU1lOQ19FTkFCTEVNRU5ULCBDT05URVhUX0FDQ09VTlRfU1RBVEUuaXNFcXVhbFRvKEFjY291bnRTdGF0dXMuVW5hdmFpbGFibGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgU3RvcFN5bmNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gudXNlckRhdGEuYWN0aW9ucy5zaWduaW4nLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2lnbiBpbiBnbG9iYWwnLCBcIlNpZ24gaW4gdG8gU3luYyBTZXR0aW5nc1wiKSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRncm91cDogJzNfY29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkdsb2JhbEFjdGl2aXR5LFxuXHRcdFx0XHRcdFx0d2hlbixcblx0XHRcdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGF0LnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2Uuc2lnbkluKCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHR0aGF0Lm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5BY2NvdW50c0NvbnRleHQsIHtcblx0XHRcdGdyb3VwOiAnMV9zZXR0aW5ncycsXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NpZ24gaW4gYWNjb3VudHMnLCBcIlNpZ24gaW4gdG8gU3luYyBTZXR0aW5ncyAoMSlcIiksXG5cdFx0XHR9LFxuXHRcdFx0d2hlblxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2hvd0NvbmZsaWN0c1RpdGxlKCk6IElMb2NhbGl6ZWRTdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZTIoJ3Jlc29sdmVDb25mbGljdHNfZ2xvYmFsJywgXCJTaG93IENvbmZsaWN0cyAoezB9KVwiLCB0aGlzLmdldENvbmZsaWN0c0NvdW50KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb25mbGljdHNBY3Rpb25EaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlZ2lzdGVyU2hvd0NvbmZsaWN0c0FjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLmNvbmZsaWN0c0FjdGlvbkRpc3Bvc2FibGUudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5jb25mbGljdHNBY3Rpb25EaXNwb3NhYmxlLnZhbHVlID0gcmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFR1cm5pbmdPblN5bmNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IHNob3dDb25mbGljdHNDb21tYW5kSWQsXG5cdFx0XHRcdFx0Z2V0IHRpdGxlKCkgeyByZXR1cm4gdGhhdC5nZXRTaG93Q29uZmxpY3RzVGl0bGUoKTsgfSxcblx0XHRcdFx0XHRjYXRlZ29yeTogU1lOQ19USVRMRSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfSEFTX0NPTkZMSUNUUyxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0Z3JvdXA6ICczX2NvbmZpZ3VyYXRpb24nLFxuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5HbG9iYWxBY3Rpdml0eSxcblx0XHRcdFx0XHRcdHdoZW46IENPTlRFWFRfSEFTX0NPTkZMSUNUUyxcblx0XHRcdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0Z3JvdXA6ICczX2NvbmZpZ3VyYXRpb24nLFxuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyUHJlZmVyZW5jZXNNZW51LFxuXHRcdFx0XHRcdFx0d2hlbjogQ09OVEVYVF9IQVNfQ09ORkxJQ1RTLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0cmV0dXJuIHRoYXQudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5zaG93Q29uZmxpY3RzKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTWFuYWdlU3luY0FjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCB3aGVuID0gQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU1lOQ19FTkFCTEVNRU5ULCBDT05URVhUX0FDQ09VTlRfU1RBVEUubm90RXF1YWxzVG8oQWNjb3VudFN0YXR1cy5VbmF2YWlsYWJsZSksIENPTlRFWFRfU1lOQ19TVEFURS5ub3RFcXVhbHNUbyhTeW5jU3RhdHVzLlVuaW5pdGlhbGl6ZWQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgU3luY1N0YXR1c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC51c2VyRGF0YVN5bmMuYWN0aW9ucy5tYW5hZ2UnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3luYyBpcyBvbicsIFwiU2V0dGluZ3MgU3luYyBpcyBPblwiKSxcblx0XHRcdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5VHJ1ZUV4cHIuSU5TVEFOQ0UsXG5cdFx0XHRcdFx0bWVudTogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLkdsb2JhbEFjdGl2aXR5LFxuXHRcdFx0XHRcdFx0XHRncm91cDogJzNfY29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRcdHdoZW4sXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJQcmVmZXJlbmNlc01lbnUsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnM19jb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0d2hlbixcblx0XHRcdFx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLkFjY291bnRzQ29udGV4dCxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICcxX3NldHRpbmdzJyxcblx0XHRcdFx0XHRcdFx0d2hlbixcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHVua25vd24ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKGMsIGUpID0+IHtcblx0XHRcdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0Y29uc3QgcXVpY2tQaWNrID0gcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrKTtcblx0XHRcdFx0XHRjb25zdCBpdGVtczogQXJyYXk8UXVpY2tQaWNrSXRlbT4gPSBbXTtcblx0XHRcdFx0XHRpZiAodGhhdC51c2VyRGF0YVN5bmNTZXJ2aWNlLmNvbmZsaWN0cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGl0ZW1zLnB1c2goeyBpZDogc2hvd0NvbmZsaWN0c0NvbW1hbmRJZCwgbGFiZWw6IGAke1NZTkNfVElUTEUudmFsdWV9OiAke3RoYXQuZ2V0U2hvd0NvbmZsaWN0c1RpdGxlKCkub3JpZ2luYWx9YCB9KTtcblx0XHRcdFx0XHRcdGl0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aXRlbXMucHVzaCh7IGlkOiBjb25maWd1cmVTeW5jQ29tbWFuZC5pZCwgbGFiZWw6IGAke1NZTkNfVElUTEUudmFsdWV9OiAke2NvbmZpZ3VyZVN5bmNDb21tYW5kLnRpdGxlLm9yaWdpbmFsfWAgfSk7XG5cdFx0XHRcdFx0aXRlbXMucHVzaCh7IGlkOiBzaG93U3luY1NldHRpbmdzQ29tbWFuZC5pZCwgbGFiZWw6IGAke1NZTkNfVElUTEUudmFsdWV9OiAke3Nob3dTeW5jU2V0dGluZ3NDb21tYW5kLnRpdGxlLm9yaWdpbmFsfWAgfSk7XG5cdFx0XHRcdFx0aXRlbXMucHVzaCh7IGlkOiBzaG93U3luY2VkRGF0YUNvbW1hbmQuaWQsIGxhYmVsOiBgJHtTWU5DX1RJVExFLnZhbHVlfTogJHtzaG93U3luY2VkRGF0YUNvbW1hbmQudGl0bGUub3JpZ2luYWx9YCB9KTtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG5cdFx0XHRcdFx0aXRlbXMucHVzaCh7IGlkOiBzeW5jTm93Q29tbWFuZC5pZCwgbGFiZWw6IGAke1NZTkNfVElUTEUudmFsdWV9OiAke3N5bmNOb3dDb21tYW5kLnRpdGxlLm9yaWdpbmFsfWAsIGRlc2NyaXB0aW9uOiBzeW5jTm93Q29tbWFuZC5kZXNjcmlwdGlvbih0aGF0LnVzZXJEYXRhU3luY1NlcnZpY2UpIH0pO1xuXHRcdFx0XHRcdGlmICh0aGF0LnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmNhblRvZ2dsZUVuYWJsZW1lbnQoKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWNjb3VudCA9IHRoYXQudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5jdXJyZW50O1xuXHRcdFx0XHRcdFx0aXRlbXMucHVzaCh7IGlkOiB0dXJuT2ZmU3luY0NvbW1hbmQuaWQsIGxhYmVsOiBgJHtTWU5DX1RJVExFLnZhbHVlfTogJHt0dXJuT2ZmU3luY0NvbW1hbmQudGl0bGUub3JpZ2luYWx9YCwgZGVzY3JpcHRpb246IGFjY291bnQgPyBgJHthY2NvdW50LmFjY291bnROYW1lfSAoJHt0aGF0LmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcihhY2NvdW50LmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZCkubGFiZWx9KWAgOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHF1aWNrUGljay5pdGVtcyA9IGl0ZW1zO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdICYmIHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdLmlkKSB7XG5cdFx0XHRcdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdLmlkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdGMoKTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckVuYWJsZVN5bmNWaWV3c0FjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCB3aGVuID0gQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQUNDT1VOVF9TVEFURS5pc0VxdWFsVG8oQWNjb3VudFN0YXR1cy5BdmFpbGFibGUpLCBDT05URVhUX1NZTkNfU1RBVEUubm90RXF1YWxzVG8oU3luY1N0YXR1cy5VbmluaXRpYWxpemVkKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFN5bmNTdGF0dXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IHNob3dTeW5jZWREYXRhQ29tbWFuZC5pZCxcblx0XHRcdFx0XHR0aXRsZTogc2hvd1N5bmNlZERhdGFDb21tYW5kLnRpdGxlLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBTWU5DX1RJVExFLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogd2hlbixcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0cmV0dXJuIHRoYXQudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5zaG93U3luY0FjdGl2aXR5KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclN5bmNOb3dBY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFN5bmNOb3dBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IHN5bmNOb3dDb21tYW5kLmlkLFxuXHRcdFx0XHRcdHRpdGxlOiBzeW5jTm93Q29tbWFuZC50aXRsZSxcblx0XHRcdFx0XHRjYXRlZ29yeTogU1lOQ19USVRMRSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU1lOQ19FTkFCTEVNRU5ULCBDT05URVhUX0FDQ09VTlRfU1RBVEUuaXNFcXVhbFRvKEFjY291bnRTdGF0dXMuQXZhaWxhYmxlKSwgQ09OVEVYVF9TWU5DX1NUQVRFLm5vdEVxdWFsc1RvKFN5bmNTdGF0dXMuVW5pbml0aWFsaXplZCkpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC51c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLnN5bmNOb3coKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVHVybk9mZlN5bmNBY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFN0b3BTeW5jQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiB0dXJuT2ZmU3luY0NvbW1hbmQuaWQsXG5cdFx0XHRcdFx0dGl0bGU6IHR1cm5PZmZTeW5jQ29tbWFuZC50aXRsZSxcblx0XHRcdFx0XHRjYXRlZ29yeTogU1lOQ19USVRMRSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU1lOQ19TVEFURS5ub3RFcXVhbHNUbyhTeW5jU3RhdHVzLlVuaW5pdGlhbGl6ZWQpLCBDT05URVhUX1NZTkNfRU5BQkxFTUVOVCksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhhdC50dXJuT2ZmKCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0XHRcdHRoYXQubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgndHVybiBvZmYgZmFpbGVkJywgXCJFcnJvciB3aGlsZSB0dXJuaW5nIG9mZiBTZXR0aW5ncyBTeW5jLiBQbGVhc2UgY2hlY2sgW2xvZ3NdKHswfSkgZm9yIG1vcmUgZGV0YWlscy5cIiwgYGNvbW1hbmQ6JHtTSE9XX1NZTkNfTE9HX0NPTU1BTkRfSUR9YCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDb25maWd1cmVTeW5jQWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGNvbnN0IHdoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TWU5DX1NUQVRFLm5vdEVxdWFsc1RvKFN5bmNTdGF0dXMuVW5pbml0aWFsaXplZCksIENPTlRFWFRfU1lOQ19FTkFCTEVNRU5UKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29uZmlndXJlU3luY0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogY29uZmlndXJlU3luY0NvbW1hbmQuaWQsXG5cdFx0XHRcdFx0dGl0bGU6IGNvbmZpZ3VyZVN5bmNDb21tYW5kLnRpdGxlLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBTWU5DX1RJVExFLFxuXHRcdFx0XHRcdGljb246IENvZGljb24uc2V0dGluZ3NHZWFyLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjb25maWd1cmUnLCBcIkNvbmZpZ3VyZS4uLlwiKSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHRcdHdoZW5cblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NZTkNfRU5BQkxFTUVOVCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyJywgU1lOQ19WSUVXX0NPTlRBSU5FUl9JRCkpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oKTogdW5rbm93biB7IHJldHVybiB0aGF0LmNvbmZpZ3VyZVN5bmNPcHRpb25zKCk7IH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU2hvd0xvZ0FjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgU2hvd1N5bmNBY3Rpdml0eUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogU0hPV19TWU5DX0xPR19DT01NQU5EX0lELFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2hvdyBzeW5jIGxvZyB0aXRsZScsIFwiezB9OiBTaG93IExvZ1wiLCBTWU5DX1RJVExFLnZhbHVlKSxcblx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnc2hvdyBzeW5jIGxvZyB0b29scmlwJywgXCJTaG93IExvZ1wiKSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLm91dHB1dCxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NZTkNfU1RBVEUubm90RXF1YWxzVG8oU3luY1N0YXR1cy5VbmluaXRpYWxpemVkKSksXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCBTWU5DX1ZJRVdfQ09OVEFJTkVSX0lEKSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bigpOiB1bmtub3duIHsgcmV0dXJuIHRoYXQuc2hvd1N5bmNBY3Rpdml0eSgpOyB9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNob3dTZXR0aW5nc0FjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgU2hvd1N5bmNTZXR0aW5nc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogc2hvd1N5bmNTZXR0aW5nc0NvbW1hbmQuaWQsXG5cdFx0XHRcdFx0dGl0bGU6IHNob3dTeW5jU2V0dGluZ3NDb21tYW5kLnRpdGxlLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBTWU5DX1RJVExFLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TWU5DX1NUQVRFLm5vdEVxdWFsc1RvKFN5bmNTdGF0dXMuVW5pbml0aWFsaXplZCkpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRcdGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuVXNlclNldHRpbmdzKHsganNvbkVkaXRvcjogZmFsc2UsIHF1ZXJ5OiAnQHRhZzpzeW5jJyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVySGVscEFjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgSGVscEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC51c2VyRGF0YVN5bmMuYWN0aW9ucy5oZWxwJyxcblx0XHRcdFx0XHR0aXRsZTogU1lOQ19USVRMRSxcblx0XHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5IZWxwLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU1lOQ19TVEFURS5ub3RFcXVhbHNUbyhTeW5jU3RhdHVzLlVuaW5pdGlhbGl6ZWQpKSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oKTogdW5rbm93biB7IHJldHVybiB0aGF0Lm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS1zZXR0aW5ncy1zeW5jLWhlbHAnKSk7IH1cblx0XHR9KSk7XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gudXNlckRhdGFTeW5jLmFjdGlvbnMuaGVscCcsXG5cdFx0XHRcdHRpdGxlOiBDYXRlZ29yaWVzLkhlbHAudmFsdWVcblx0XHRcdH0sXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCBTWU5DX1ZJRVdfQ09OVEFJTkVSX0lEKSxcblx0XHRcdGdyb3VwOiAnMV9oZWxwJyxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJBY2NlcHRNZXJnZXNBY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEFjY2VwdE1lcmdlc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC51c2VyRGF0YVN5bmMuYWN0aW9ucy5hY2NlcHRNZXJnZXMnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29tcGxldGUgbWVyZ2VzIHRpdGxlJywgXCJDb21wbGV0ZSBNZXJnZVwiKSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZW50LFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGN0eElzTWVyZ2VSZXN1bHRFZGl0b3IsIENvbnRleHRLZXlFeHByLnJlZ2V4KGN0eE1lcmdlQmFzZVVyaS5rZXksIG5ldyBSZWdFeHAoYF4ke1VTRVJfREFUQV9TWU5DX1NDSEVNRX06YCkpKSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcHJldmlld1Jlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgdGV4dEZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0RmlsZVNlcnZpY2UpO1xuXHRcdFx0XHRhd2FpdCB0ZXh0RmlsZVNlcnZpY2Uuc2F2ZShwcmV2aWV3UmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGV4dEZpbGVTZXJ2aWNlLnJlYWQocHJldmlld1Jlc291cmNlKTtcblx0XHRcdFx0YXdhaXQgdGhhdC51c2VyRGF0YVN5bmNTZXJ2aWNlLmFjY2VwdCh0aGlzLmdldFN5bmNSZXNvdXJjZShwcmV2aWV3UmVzb3VyY2UpLCBwcmV2aWV3UmVzb3VyY2UsIGNvbnRlbnQudmFsdWUsIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRwcml2YXRlIGdldFN5bmNSZXNvdXJjZShwcmV2aWV3UmVzb3VyY2U6IFVSSSk6IElVc2VyRGF0YVN5bmNSZXNvdXJjZSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZsaWN0ID0gdGhhdC51c2VyRGF0YVN5bmNTZXJ2aWNlLmNvbmZsaWN0cy5maW5kKCh7IGNvbmZsaWN0cyB9KSA9PiBjb25mbGljdHMuc29tZShjb25mbGljdCA9PiBpc0VxdWFsKGNvbmZsaWN0LnByZXZpZXdSZXNvdXJjZSwgcHJldmlld1Jlc291cmNlKSkpO1xuXHRcdFx0XHRpZiAoY29uZmxpY3QpIHtcblx0XHRcdFx0XHRyZXR1cm4gY29uZmxpY3Q7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHJlc291cmNlOiAke3ByZXZpZXdSZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJEb3dubG9hZFN5bmNBY3Rpdml0eUFjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgRG93bmxvYWRTeW5jQWN0aXZpdHlBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcihET1dOTE9BRF9BQ1RJVklUWV9BQ1RJT05fREVTQ1JJUFRPUik7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgdXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBmb2xkZXIgPSBhd2FpdCB1c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLmRvd25sb2FkU3luY0FjdGl2aXR5KCk7XG5cdFx0XHRcdGlmIChmb2xkZXIpIHtcblx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ2Rvd25sb2FkIHN5bmMgYWN0aXZpdHkgY29tcGxldGUnLCBcIlN1Y2Nlc3NmdWxseSBkb3dubG9hZGVkIFNldHRpbmdzIFN5bmMgYWN0aXZpdHkuXCIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclZpZXdzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMucmVnaXN0ZXJWaWV3Q29udGFpbmVyKCk7XG5cdFx0dGhpcy5yZWdpc3RlckRhdGFWaWV3cyhjb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclZpZXdDb250YWluZXIoKTogVmlld0NvbnRhaW5lciB7XG5cdFx0cmV0dXJuIFJlZ2lzdHJ5LmFzPElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5PihFeHRlbnNpb25zLlZpZXdDb250YWluZXJzUmVnaXN0cnkpLnJlZ2lzdGVyVmlld0NvbnRhaW5lcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IFNZTkNfVklFV19DT05UQUlORVJfSUQsXG5cdFx0XHRcdHRpdGxlOiBTWU5DX1RJVExFLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFxuXHRcdFx0XHRcdFZpZXdQYW5lQ29udGFpbmVyLFxuXHRcdFx0XHRcdFtTWU5DX1ZJRVdfQ09OVEFJTkVSX0lELCB7IG1lcmdlVmlld1dpdGhDb250YWluZXJXaGVuU2luZ2xlVmlldzogdHJ1ZSB9XVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRpY29uOiBTWU5DX1ZJRVdfSUNPTixcblx0XHRcdFx0aGlkZUlmRW1wdHk6IHRydWUsXG5cdFx0XHR9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyUmVzZXRTeW5jRGF0YUFjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9ucy5zeW5jRGF0YS5yZXNldCcsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9ucy5zeW5jRGF0YS5yZXNldCcsIFwiQ2xlYXIgRGF0YSBpbiBDbG91ZC4uLlwiKSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCBTWU5DX1ZJRVdfQ09OVEFJTkVSX0lEKSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnMF9jb25maWd1cmUnLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bigpOiB1bmtub3duIHsgcmV0dXJuIHRoYXQudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5yZXNldFN5bmNlZERhdGEoKTsgfVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJEYXRhVmlld3MoY29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVN5bmNEYXRhVmlld3MsIGNvbnRhaW5lcikpO1xuXHR9XG5cbn1cblxuY2xhc3MgVXNlckRhdGFSZW1vdGVDb250ZW50UHJvdmlkZXIgaW1wbGVtZW50cyBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVzZXJEYXRhU3luY1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRwcm92aWRlVGV4dENvbnRlbnQodXJpOiBVUkkpOiBQcm9taXNlPElUZXh0TW9kZWw+IHwgbnVsbCB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09IFVTRVJfREFUQV9TWU5DX1NDSEVNRSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5yZXNvbHZlQ29udGVudCh1cmkpLnRoZW4oY29udGVudCA9PiB0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbChjb250ZW50IHx8ICcnLCB0aGlzLmxhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKCdqc29uYycpLCB1cmkpKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUIsMkJBQTJCO0FBQ3JELFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixvQkFBaUM7QUFDMUYsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUdwQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFvQyx5QkFBeUI7QUFDN0QsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFFBQVEsY0FBYyxpQkFBaUIsZUFBZTtBQUMvRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQixvQkFBaUMsb0JBQW9CLHFCQUFxQjtBQUNuRyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBd0IsMEJBQTBCO0FBQ2xELFNBQVMseUJBQXlCO0FBQ2xDO0FBQUEsRUFDQztBQUFBLEVBQTBCO0FBQUEsRUFBc0I7QUFBQSxFQUNoRDtBQUFBLEVBQWM7QUFBQSxFQUFZO0FBQUEsRUFBbUI7QUFBQSxFQUF1QjtBQUFBLEVBQXVCO0FBQUEsRUFDekU7QUFBQSxFQUFtSztBQUFBLE9BQy9LO0FBRVAsU0FBUyx3QkFBd0Isd0JBQXdCO0FBQ3pELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQTBCLGFBQWEscUJBQXFCO0FBQ3JFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUFnRCxrQkFBaUM7QUFDMUYsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywrQkFBK0Isa0JBQWtCLGVBQWUsb0JBQW9CLHlCQUF5Qix1QkFBdUIsMkJBQTJCLDBCQUEwQix3QkFBd0IsWUFBWSxnQkFBZ0IsdUJBQXVCLDJDQUEyQztBQUN4VCxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0IsdUJBQXVCO0FBQ3hELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsYUFBYTtBQVd0QixNQUFNLHFCQUFxQixFQUFFLElBQUksMENBQTBDLE9BQU8sVUFBVSxhQUFhLFVBQVUsRUFBRTtBQUNySCxNQUFNLHVCQUF1QixFQUFFLElBQUksMkJBQTJCLE9BQU8sVUFBVSxrQkFBa0IsY0FBYyxFQUFFO0FBQ2pILE1BQU0seUJBQXlCO0FBQy9CLE1BQU0saUJBQWlCO0FBQUEsRUFDdEIsSUFBSTtBQUFBLEVBQ0osT0FBTyxVQUFVLFlBQVksVUFBVTtBQUFBLEVBQ3ZDLFlBQVkscUJBQStEO0FBQzFFLFFBQUksb0JBQW9CLFdBQVcsV0FBVyxTQUFTO0FBQ3RELGFBQU8sU0FBUyxXQUFXLFNBQVM7QUFBQSxJQUNyQztBQUNBLFFBQUksb0JBQW9CLGNBQWM7QUFDckMsYUFBTyxTQUFTLG9CQUFvQixjQUFjLFFBQVEsb0JBQW9CLGNBQWMsSUFBSSxDQUFDO0FBQUEsSUFDbEc7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBQ0EsTUFBTSwwQkFBMEIsRUFBRSxJQUFJLDJDQUEyQyxPQUFPLFVBQVUsaUJBQWlCLGVBQWUsRUFBRztBQUNySSxNQUFNLHdCQUF3QixFQUFFLElBQUksaURBQWlELE9BQU8sVUFBVSxvQkFBb0Isa0JBQWtCLEVBQUc7QUFFL0ksTUFBTSwyQkFBMkIsSUFBSSxjQUFxQix5QkFBeUIsS0FBSztBQUVqRixJQUFNLG9DQUFOLGNBQWdELFdBQTZDO0FBQUEsRUFPbkcsWUFDa0QsK0JBQ1YscUJBQ1MsOEJBQzVCLG1CQUNlLGlCQUNJLHFCQUNOLGVBQ1Msd0JBQ1QsZUFDSSxtQkFDRyxzQkFDUCxlQUNQLHlCQUNQLDBCQUNtQixvQkFDRixrQkFDRixnQkFDRCxlQUNRLHVCQUNhLG9DQUN2QixhQUNHLGdCQUNPLHVCQUN4QztBQUNELFVBQU07QUF4QjJDO0FBQ1Y7QUFDUztBQUViO0FBQ0k7QUFDTjtBQUNTO0FBQ1Q7QUFDSTtBQUNHO0FBQ1A7QUFHSztBQUNGO0FBQ0Y7QUFDRDtBQUNRO0FBQ2E7QUFDdkI7QUFDRztBQUNPO0FBMUIxQyxTQUFpQixnQ0FBZ0MsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFDdkYsU0FBaUIseUJBQXlCLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBMEVoRixTQUFpQix1QkFBdUIsb0JBQUksSUFBeUI7QUE4TnJFLFNBQWlCLGlDQUFpQyxvQkFBSSxJQUF5QjtBQTZlL0UsU0FBaUIsNEJBQTRCLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBeHZCbEYsU0FBSyx1QkFBdUIseUJBQXlCLE9BQU8saUJBQWlCO0FBRTdFLFFBQUksNkJBQTZCLFNBQVM7QUFDekMsNEJBQXNCO0FBRXRCLFdBQUssbUJBQW1CO0FBQ3hCLFdBQUssMEJBQTBCO0FBQy9CLFdBQUsscUJBQXFCLEtBQUssb0JBQW9CLFNBQVM7QUFFNUQsV0FBSyxVQUFVLE1BQU07QUFBQSxRQUNwQixNQUFNLFNBQVMsb0JBQW9CLG1CQUFtQixNQUFNLFFBQVcsR0FBRztBQUFBLFFBQzFFLEtBQUssOEJBQThCO0FBQUEsUUFDbkMsS0FBSyw2QkFBNkI7QUFBQSxNQUNuQyxFQUFFLE1BQU07QUFDUCxhQUFLLG1CQUFtQjtBQUN4QixhQUFLLDBCQUEwQjtBQUFBLE1BQ2hDLENBQUMsQ0FBQztBQUNGLFdBQUssVUFBVSxvQkFBb0IscUJBQXFCLE1BQU0sS0FBSyxxQkFBcUIsS0FBSyxvQkFBb0IsU0FBUyxDQUFDLENBQUM7QUFDNUgsV0FBSyxVQUFVLDhCQUE4QixzQkFBc0IsTUFBTSxLQUFLLHFCQUFxQixLQUFLLG9CQUFvQixTQUFTLENBQUMsQ0FBQztBQUN2SSxXQUFLLFVBQVUsb0JBQW9CLGFBQWEsWUFBVSxLQUFLLHFCQUFxQixNQUFNLENBQUMsQ0FBQztBQUM1RixXQUFLLFVBQVUsd0JBQXdCLFFBQVEsV0FBUyxLQUFLLGdCQUFnQixLQUFLLENBQUMsQ0FBQztBQUVwRixXQUFLLGdCQUFnQjtBQUNyQixXQUFLLGNBQWM7QUFFbkIsK0JBQXlCLGlDQUFpQyx1QkFBdUIscUJBQXFCLGVBQWUsNkJBQTZCLENBQUM7QUFFbkosV0FBSyxVQUFVLE1BQU0sSUFBSSxvQkFBb0IsbUJBQW1CLDhCQUE4QixxQkFBcUIsRUFDakgsTUFBTSxLQUFLLGdCQUFnQixDQUFDLDhCQUE4QixVQUFVLEtBQUssb0JBQW9CLFdBQVcsV0FBVyxJQUFJLENBQUM7QUFBQSxJQUMzSDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQVksZ0JBQXlCO0FBQ3BDLFdBQU8sQ0FBQyxDQUFDLEtBQUsscUJBQXFCLElBQUk7QUFBQSxFQUN4QztBQUFBLEVBRUEsSUFBWSxjQUFjLFdBQW9CO0FBQzdDLFNBQUsscUJBQXFCLElBQUksU0FBUztBQUN2QyxTQUFLLDBCQUEwQjtBQUFBLEVBQ2hDO0FBQUEsRUFFUSxNQUFNLEVBQUUsY0FBYyxVQUFVLFFBQVEsR0FBa0M7QUFDakYsV0FBTyxHQUFHLFFBQVEsRUFBRSxJQUFJLFFBQVE7QUFBQSxFQUNqQztBQUFBLEVBR1EscUJBQXFCLFdBQTZDO0FBQ3pFLFNBQUssMEJBQTBCO0FBQy9CLFNBQUssNEJBQTRCO0FBQ2pDLFFBQUksQ0FBQyxLQUFLLDhCQUE4QixVQUFVLEdBQUc7QUFDcEQ7QUFBQSxJQUNEO0FBQ0EsUUFBSSxVQUFVLFFBQVE7QUFFckIsaUJBQVcsQ0FBQyxLQUFLLFVBQVUsS0FBSyxLQUFLLHFCQUFxQixRQUFRLEdBQUc7QUFDcEUsWUFBSSxDQUFDLFVBQVUsS0FBSyxjQUFZLEtBQUssTUFBTSxRQUFRLE1BQU0sR0FBRyxHQUFHO0FBQzlELHFCQUFXLFFBQVE7QUFDbkIsZUFBSyxxQkFBcUIsT0FBTyxHQUFHO0FBQUEsUUFDckM7QUFBQSxNQUNEO0FBRUEsaUJBQVcsWUFBWSxLQUFLLG9CQUFvQixXQUFXO0FBQzFELGNBQU0sTUFBTSxLQUFLLE1BQU0sUUFBUTtBQUUvQixZQUFJLENBQUMsS0FBSyxxQkFBcUIsSUFBSSxHQUFHLEdBQUc7QUFDeEMsZ0JBQU0sZ0JBQWdCLGlCQUFpQixTQUFTLFlBQVk7QUFDNUQsZ0JBQU0sU0FBUyxLQUFLLG9CQUFvQjtBQUFBLFlBQU8sU0FBUztBQUFBLFlBQVMsU0FBUyxzQkFBc0IsNEVBQTRFLGNBQWMsWUFBWSxDQUFDO0FBQUEsWUFDdE07QUFBQSxjQUNDO0FBQUEsZ0JBQ0MsT0FBTyxTQUFTLGtCQUFrQixnQkFBZ0I7QUFBQSxnQkFDbEQsS0FBSyxNQUFNO0FBQ1YsdUJBQUssWUFBWSxVQUFVLFNBQVMsVUFBVSxDQUFDLENBQUM7QUFBQSxnQkFDakQ7QUFBQSxjQUNEO0FBQUEsY0FDQTtBQUFBLGdCQUNDLE9BQU8sU0FBUyxpQkFBaUIsZUFBZTtBQUFBLGdCQUNoRCxLQUFLLE1BQU07QUFDVix1QkFBSyxhQUFhLFVBQVUsU0FBUyxVQUFVLENBQUMsQ0FBQztBQUFBLGdCQUNsRDtBQUFBLGNBQ0Q7QUFBQSxjQUNBO0FBQUEsZ0JBQ0MsT0FBTyxTQUFTLGtCQUFrQixnQkFBZ0I7QUFBQSxnQkFDbEQsS0FBSyxNQUFNO0FBQ1YsdUJBQUssaUJBQWlCLFdBQTZFLHNCQUFzQixFQUFFLFFBQVEsU0FBUyxhQUFhLENBQUM7QUFDMUosdUJBQUssNkJBQTZCLGNBQWMsU0FBUyxVQUFVLENBQUMsQ0FBQztBQUFBLGdCQUN0RTtBQUFBLGNBQ0Q7QUFBQSxZQUNEO0FBQUEsWUFDQTtBQUFBLGNBQ0MsUUFBUTtBQUFBLFlBQ1Q7QUFBQSxVQUNEO0FBQ0EsZUFBSyxxQkFBcUIsSUFBSSxLQUFLLGFBQWEsTUFBTTtBQUVyRCxtQkFBTyxNQUFNO0FBQ2IsaUJBQUsscUJBQXFCLE9BQU8sR0FBRztBQUFBLFVBQ3JDLENBQUMsQ0FBQztBQUFBLFFBQ0g7QUFBQSxNQUNEO0FBQUEsSUFDRCxPQUFPO0FBQ04sV0FBSyxxQkFBcUIsUUFBUSxnQkFBYyxXQUFXLFFBQVEsQ0FBQztBQUNwRSxXQUFLLHFCQUFxQixNQUFNO0FBQUEsSUFDakM7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGFBQWEsY0FBcUMsVUFBNEI7QUFDM0YsUUFBSTtBQUNILFlBQU0sS0FBSyxvQkFBb0IsT0FBTyxjQUFjLFNBQVMsZ0JBQWdCLFFBQVcsS0FBSyw4QkFBOEIsVUFBVSxDQUFDO0FBQUEsSUFDdkksU0FBUyxHQUFHO0FBQ1gsV0FBSyxvQkFBb0IsTUFBTSxTQUFTLGlCQUFpQiw2RUFBNkUsV0FBVyx3QkFBd0IsRUFBRSxDQUFDO0FBQUEsSUFDN0s7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLFlBQVksY0FBcUMsVUFBMkM7QUFDekcsUUFBSTtBQUNILFlBQU0sS0FBSyxvQkFBb0IsT0FBTyxjQUFjLFNBQVMsZUFBZSxRQUFXLEtBQUssOEJBQThCLFVBQVUsQ0FBQztBQUFBLElBQ3RJLFNBQVMsR0FBRztBQUNYLFdBQUssb0JBQW9CLE1BQU0sU0FBUyxpQkFBaUIsNkVBQTZFLFdBQVcsd0JBQXdCLEVBQUUsQ0FBQztBQUFBLElBQzdLO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQWdCLE9BQWdDO0FBQ3ZELFlBQVEsTUFBTSxNQUFNO0FBQUEsTUFDbkIsS0FBSyxzQkFBc0I7QUFDMUIsYUFBSyxvQkFBb0IsT0FBTztBQUFBLFVBQy9CLFVBQVUsU0FBUztBQUFBLFVBQ25CLFNBQVMsU0FBUyxtQkFBbUIsd0dBQXdHO0FBQUEsVUFDN0ksU0FBUztBQUFBLFlBQ1IsU0FBUyxDQUFDLFNBQVM7QUFBQSxjQUNsQixJQUFJO0FBQUEsY0FDSixPQUFPLFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUFBLGNBQzFELEtBQUssTUFBTSxLQUFLLE9BQU87QUFBQSxZQUN4QixDQUFDLENBQUM7QUFBQSxVQUNIO0FBQUEsUUFDRCxDQUFDO0FBQ0Q7QUFBQSxNQUNELEtBQUssc0JBQXNCO0FBQzFCLGFBQUssb0JBQW9CLE9BQU87QUFBQSxVQUMvQixVQUFVLFNBQVM7QUFBQSxVQUNuQixTQUFTLFNBQVMsY0FBYyw4RUFBOEU7QUFBQSxVQUM5RyxTQUFTO0FBQUEsWUFDUixTQUFTLENBQUMsU0FBUztBQUFBLGNBQ2xCLElBQUk7QUFBQSxjQUNKLE9BQU8sU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQUEsY0FDMUQsS0FBSyxNQUFNLEtBQUssT0FBTztBQUFBLFlBQ3hCLENBQUMsQ0FBQztBQUFBLFVBQ0g7QUFBQSxRQUNELENBQUM7QUFDRDtBQUFBLE1BQ0QsS0FBSyxzQkFBc0I7QUFDMUIsWUFBSSxNQUFNLGFBQWEsYUFBYSxlQUFlLE1BQU0sYUFBYSxhQUFhLFlBQVksTUFBTSxhQUFhLGFBQWEsT0FBTztBQUNySSxlQUFLLFlBQVksTUFBTSxRQUFRO0FBQy9CLGdCQUFNLGFBQWEsaUJBQWlCLE1BQU0sUUFBUTtBQUNsRCxlQUFLLG9CQUFvQixNQUFNLFVBQVUsU0FBUyxhQUFhLDBJQUEwSSxXQUFXLFlBQVksR0FBRyxXQUFXLFlBQVksR0FBRyxPQUFPLEdBQUcsS0FBSztBQUFBLFFBQzdRO0FBQ0E7QUFBQSxNQUNELEtBQUssc0JBQXNCO0FBQzFCLGFBQUssWUFBWSxhQUFhLFFBQVE7QUFDdEMsYUFBSyxvQkFBb0IsTUFBTSxTQUFTLHFCQUFxQixpTEFBaUwsQ0FBQztBQUMvTztBQUFBLE1BQ0QsS0FBSyxzQkFBc0I7QUFBQSxNQUMzQixLQUFLLHNCQUFzQjtBQUFBLE1BQzNCLEtBQUssc0JBQXNCLGlCQUFpQjtBQUMzQyxjQUFNLFVBQVUsU0FBUywwQkFBMEIsbUpBQW1KLEtBQUssZUFBZSxTQUFTLEtBQUssZUFBZSxNQUFNO0FBQzdQLGNBQU0sY0FBYyxNQUFNLGNBQWMsU0FBUyxlQUFlLHFCQUFxQixNQUFNLFdBQVcsSUFBSTtBQUMxRyxhQUFLLG9CQUFvQixPQUFPO0FBQUEsVUFDL0IsVUFBVSxTQUFTO0FBQUEsVUFDbkIsU0FBUyxjQUFjLEdBQUcsT0FBTyxJQUFJLFdBQVcsS0FBSztBQUFBLFFBQ3RELENBQUM7QUFDRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssc0JBQXNCLGdCQUFnQjtBQUMxQyxjQUFNLFVBQVUsU0FBUyxvQkFBb0IsZ0hBQWdIO0FBQzdKLGNBQU0sY0FBYyxNQUFNLGNBQWMsU0FBUyxlQUFlLHFCQUFxQixNQUFNLFdBQVcsSUFBSTtBQUMxRyxhQUFLLG9CQUFvQixPQUFPO0FBQUEsVUFDL0IsVUFBVSxTQUFTO0FBQUEsVUFDbkIsU0FBUyxjQUFjLEdBQUcsT0FBTyxJQUFJLFdBQVcsS0FBSztBQUFBLFVBQ3JELFNBQVM7QUFBQSxZQUNSLFNBQVM7QUFBQSxjQUNSLFNBQVM7QUFBQSxnQkFDUixJQUFJO0FBQUEsZ0JBQ0osT0FBTyxTQUFTLGtCQUFrQixVQUFVO0FBQUEsZ0JBQzVDLEtBQUssTUFBTSxLQUFLLGVBQWUsZUFBZSx3QkFBd0I7QUFBQSxjQUN2RSxDQUFDO0FBQUEsY0FDRCxTQUFTO0FBQUEsZ0JBQ1IsSUFBSTtBQUFBLGdCQUNKLE9BQU8sU0FBUyxnQkFBZ0IsY0FBYztBQUFBLGdCQUM5QyxLQUFLLE1BQU0sS0FBSyxzQkFBc0IsYUFBYTtBQUFBLGNBQ3BELENBQUM7QUFBQSxZQUNGO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUNEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxzQkFBc0I7QUFDMUIsYUFBSyxvQkFBb0IsT0FBTztBQUFBLFVBQy9CLFVBQVUsU0FBUztBQUFBLFVBQ25CLFNBQVMsU0FBUyx3QkFBd0Isd0pBQXdKO0FBQUEsVUFDbE0sU0FBUztBQUFBLFlBQ1IsU0FBUztBQUFBLGNBQ1IsU0FBUztBQUFBLGdCQUNSLElBQUk7QUFBQSxnQkFDSixPQUFPLFNBQVMsU0FBUyx3QkFBd0I7QUFBQSxnQkFDakQsS0FBSyxNQUFNLEtBQUssNkJBQTZCLGdCQUFnQjtBQUFBLGNBQzlELENBQUM7QUFBQSxjQUNELFNBQVM7QUFBQSxnQkFDUixJQUFJO0FBQUEsZ0JBQ0osT0FBTyxTQUFTLDJCQUEyQixrQkFBa0I7QUFBQSxnQkFDN0QsS0FBSyxNQUFNLEtBQUssNkJBQTZCLGlCQUFpQjtBQUFBLGNBQy9ELENBQUM7QUFBQSxZQUNGO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUNEO0FBQUEsTUFFRCxLQUFLLHNCQUFzQjtBQUMxQixhQUFLLG9CQUFvQixPQUFPO0FBQUEsVUFDL0IsVUFBVSxTQUFTO0FBQUEsVUFDbkIsU0FBUyxLQUFLLG1DQUFtQyxtQkFBbUIsU0FBUyxhQUM1RSxTQUFTLGdDQUFnQyxxREFBcUQsSUFDOUYsU0FBUyw4QkFBOEIsbURBQW1EO0FBQUEsUUFDNUYsQ0FBQztBQUVEO0FBQUEsTUFFRCxLQUFLLHNCQUFzQjtBQUUxQixZQUFJLEtBQUssOEJBQThCLFVBQVUsR0FBRztBQUNuRCxlQUFLLG9CQUFvQixPQUFPO0FBQUEsWUFDL0IsVUFBVSxTQUFTO0FBQUEsWUFDbkIsU0FBUyxTQUFTLDBCQUEwQiwwTEFBMEw7QUFBQSxVQUN2TyxDQUFDO0FBQUEsUUFDRixPQUdLO0FBQ0osZUFBSyxvQkFBb0IsT0FBTztBQUFBLFlBQy9CLFVBQVUsU0FBUztBQUFBLFlBQ25CLFNBQVMsU0FBUyxrQ0FBa0Msb0dBQW9HLEtBQUssZUFBZSxRQUFRO0FBQUEsWUFDcEwsU0FBUztBQUFBLGNBQ1IsU0FBUyxDQUFDLFNBQVM7QUFBQSxnQkFDbEIsSUFBSTtBQUFBLGdCQUNKLE9BQU8sU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQUEsZ0JBQzFELEtBQUssTUFBTSxLQUFLLE9BQU87QUFBQSxjQUN4QixDQUFDLENBQUM7QUFBQSxZQUNIO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG9CQUFvQixVQUF3QixTQUFpQixPQUFnQztBQUNwRyxVQUFNLGNBQWMsTUFBTSxjQUFjLFNBQVMsZUFBZSxxQkFBcUIsTUFBTSxXQUFXLElBQUk7QUFDMUcsU0FBSyxvQkFBb0IsT0FBTztBQUFBLE1BQy9CLFVBQVUsU0FBUztBQUFBLE1BQ25CLFNBQVMsY0FBYyxHQUFHLE9BQU8sSUFBSSxXQUFXLEtBQUs7QUFBQSxNQUNyRCxTQUFTO0FBQUEsUUFDUixTQUFTLENBQUMsU0FBUztBQUFBLFVBQ2xCLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxhQUFhLGlCQUFpQixpQkFBaUIsUUFBUSxDQUFDO0FBQUEsVUFDeEUsS0FBSyxNQUFNLGFBQWEsYUFBYSxXQUFXLEtBQUssbUJBQW1CLGlCQUFpQixFQUFFLFlBQVksS0FBSyxDQUFDLElBQUksS0FBSyxtQkFBbUIsNkJBQTZCLElBQUk7QUFBQSxRQUMzSyxDQUFDLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBR1EscUJBQXFCLFFBQTRDO0FBQ3hFLFFBQUksT0FBTyxRQUFRO0FBQ2xCLGlCQUFXLEVBQUUsU0FBUyxjQUFjLFVBQVUsTUFBTSxLQUFLLFFBQVE7QUFDaEUsZ0JBQVEsTUFBTSxNQUFNO0FBQUEsVUFDbkIsS0FBSyxzQkFBc0I7QUFDMUIsaUJBQUssMEJBQTBCLEVBQUUsU0FBUyxjQUFjLFNBQVMsQ0FBQztBQUNsRTtBQUFBLFVBQ0QsU0FBUztBQUNSLGtCQUFNLE1BQU0sR0FBRyxRQUFRLEVBQUUsSUFBSSxRQUFRO0FBQ3JDLGtCQUFNLGFBQWEsS0FBSywrQkFBK0IsSUFBSSxHQUFHO0FBQzlELGdCQUFJLFlBQVk7QUFDZix5QkFBVyxRQUFRO0FBQ25CLG1CQUFLLCtCQUErQixPQUFPLEdBQUc7QUFBQSxZQUMvQztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsT0FBTztBQUNOLFdBQUssK0JBQStCLFFBQVEsZ0JBQWMsV0FBVyxRQUFRLENBQUM7QUFDOUUsV0FBSywrQkFBK0IsTUFBTTtBQUFBLElBQzNDO0FBQUEsRUFDRDtBQUFBLEVBRVEsMEJBQTBCLEVBQUUsU0FBUyxjQUFjLE9BQU8sR0FBZ0M7QUFDakcsUUFBSSxLQUFLLHVCQUF1QixlQUFlLE9BQU8sUUFBUSxJQUFJO0FBQ2pFO0FBQUEsSUFDRDtBQUNBLFVBQU0sTUFBTSxHQUFHLFFBQVEsRUFBRSxJQUFJLE1BQU07QUFDbkMsUUFBSSxLQUFLLCtCQUErQixJQUFJLEdBQUcsR0FBRztBQUNqRDtBQUFBLElBQ0Q7QUFDQSxRQUFJLFdBQVcsYUFBYSxZQUFZLFdBQVcsYUFBYSxlQUFlLFdBQVcsYUFBYSxPQUFPO0FBQzdHO0FBQUEsSUFDRDtBQUNBLFFBQUksQ0FBQyxLQUFLLFlBQVksVUFBVTtBQUMvQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVcsV0FBVyxhQUFhLFdBQVcsS0FBSyx1QkFBdUIsZUFBZSxtQkFDNUYsV0FBVyxhQUFhLGNBQWMsS0FBSyx1QkFBdUIsZUFBZSxzQkFDaEYsS0FBSyx1QkFBdUIsZUFBZTtBQUMvQyxVQUFNLFlBQVksdUJBQXVCLGdCQUFnQixLQUFLLGNBQWMsY0FBYyxFQUFFLG1CQUFtQixpQkFBaUIsUUFBUSxDQUFDO0FBQ3pJLFFBQUksUUFBUSxVQUFVLFNBQVMsR0FBRztBQUVqQztBQUFBLElBQ0Q7QUFDQSxVQUFNLFlBQVksaUJBQWlCLE1BQU07QUFDekMsVUFBTSxTQUFTLEtBQUssb0JBQW9CLE9BQU87QUFBQSxNQUM5QyxVQUFVLFNBQVM7QUFBQSxNQUNuQixTQUFTLFNBQVMsNkJBQTZCLHlHQUF5RyxVQUFVLFlBQVksQ0FBQztBQUFBLE1BQy9LLFNBQVM7QUFBQSxRQUNSLFNBQVMsQ0FBQyxTQUFTO0FBQUEsVUFDbEIsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLGFBQWEsaUJBQWlCLFNBQVM7QUFBQSxVQUN2RCxLQUFLLE1BQU0sV0FBVyxhQUFhLFdBQVcsS0FBSyxtQkFBbUIsaUJBQWlCLEVBQUUsWUFBWSxLQUFLLENBQUMsSUFBSSxLQUFLLG1CQUFtQiw2QkFBNkIsSUFBSTtBQUFBLFFBQ3pLLENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNELENBQUM7QUFDRCxTQUFLLCtCQUErQixJQUFJLEtBQUssYUFBYSxNQUFNO0FBRS9ELGFBQU8sTUFBTTtBQUNiLFdBQUssK0JBQStCLE9BQU8sR0FBRztBQUFBLElBQy9DLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLG9CQUE0QjtBQUNuQyxXQUFPLEtBQUssb0JBQW9CLFVBQVUsT0FBTyxDQUFDLFFBQVEsRUFBRSxVQUFVLE1BQU07QUFBRSxhQUFPLFNBQVMsVUFBVTtBQUFBLElBQVEsR0FBRyxDQUFDO0FBQUEsRUFDckg7QUFBQSxFQUVBLE1BQWMsNEJBQTJDO0FBQ3hELFNBQUssOEJBQThCLE1BQU07QUFFekMsUUFBSSxRQUE0QjtBQUNoQyxRQUFJLEtBQUssb0JBQW9CLFVBQVUsVUFBVSxLQUFLLDhCQUE4QixVQUFVLEdBQUc7QUFDaEcsY0FBUSxJQUFJLFlBQVksS0FBSyxrQkFBa0IsR0FBRyxNQUFNLFNBQVMsaUJBQWlCLDJCQUEyQixXQUFXLEtBQUssQ0FBQztBQUFBLElBQy9ILFdBQVcsS0FBSyxlQUFlO0FBQzlCLGNBQVEsSUFBSSxjQUFjLE1BQU0sU0FBUyxzQkFBc0IsNkJBQTZCLENBQUM7QUFBQSxJQUM5RjtBQUVBLFFBQUksT0FBTztBQUNWLFdBQUssOEJBQThCLFFBQVEsS0FBSyxnQkFBZ0IsbUJBQW1CLEVBQUUsTUFBTSxDQUFDO0FBQUEsSUFDN0Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLHFCQUFvQztBQUNqRCxTQUFLLHVCQUF1QixNQUFNO0FBRWxDLFFBQUksUUFBNEI7QUFFaEMsUUFBSSxLQUFLLG9CQUFvQixXQUFXLFdBQVcsaUJBQWlCLEtBQUssOEJBQThCLFVBQVUsS0FBSyxLQUFLLDZCQUE2QixrQkFBa0IsY0FBYyxhQUFhO0FBQ3BNLGNBQVEsSUFBSSxZQUFZLEdBQUcsTUFBTSxTQUFTLG1CQUFtQiwwQkFBMEIsQ0FBQztBQUFBLElBQ3pGO0FBRUEsUUFBSSxPQUFPO0FBQ1YsV0FBSyx1QkFBdUIsUUFBUSxLQUFLLGdCQUFnQixxQkFBcUIsRUFBRSxNQUFNLENBQUM7QUFBQSxJQUN4RjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsU0FBd0I7QUFDckMsUUFBSTtBQUNILFVBQUksQ0FBQyxLQUFLLDZCQUE2Qix3QkFBd0IsUUFBUTtBQUN0RSxjQUFNLElBQUksTUFBTSxTQUFTLCtCQUErQiw0Q0FBNEMsQ0FBQztBQUFBLE1BQ3RHO0FBQ0EsWUFBTSxTQUFTLE1BQU0sS0FBSyxlQUFlO0FBQ3pDLFVBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxNQUNEO0FBQ0EsVUFBSSxLQUFLLG1DQUFtQyxtQkFBbUIsV0FBVztBQUN6RSxjQUFNLEtBQUssMEJBQTBCLEtBQUssbUNBQW1DLGlCQUFpQjtBQUFBLE1BQy9GO0FBQ0EsWUFBTSxLQUFLLDZCQUE2QixPQUFPO0FBQUEsSUFDaEQsU0FBUyxHQUFHO0FBQ1gsVUFBSSxvQkFBb0IsQ0FBQyxHQUFHO0FBQzNCO0FBQUEsTUFDRDtBQUNBLFVBQUksYUFBYSxtQkFBbUI7QUFDbkMsZ0JBQVEsRUFBRSxNQUFNO0FBQUEsVUFDZixLQUFLLHNCQUFzQjtBQUMxQixnQkFBSSxFQUFFLGFBQWEsYUFBYSxlQUFlLEVBQUUsYUFBYSxhQUFhLFlBQVksRUFBRSxhQUFhLGFBQWEsT0FBTztBQUN6SCxtQkFBSyxvQkFBb0IsRUFBRSxVQUFVLFNBQVMsaUNBQWlDLHdKQUF3SixpQkFBaUIsRUFBRSxRQUFRLEVBQUUsWUFBWSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzlSO0FBQUEsWUFDRDtBQUNBO0FBQUEsVUFDRCxLQUFLLHNCQUFzQjtBQUFBLFVBQzNCLEtBQUssc0JBQXNCO0FBQUEsVUFDM0IsS0FBSyxzQkFBc0IsaUJBQWlCO0FBQzNDLGtCQUFNLFVBQVUsU0FBUyw4Q0FBOEMsMkpBQTJKLEtBQUssZUFBZSxTQUFTLEtBQUssZUFBZSxNQUFNO0FBQ3pSLGtCQUFNLGNBQWMsRUFBRSxjQUFjLFNBQVMsZUFBZSxxQkFBcUIsRUFBRSxXQUFXLElBQUk7QUFDbEcsaUJBQUssb0JBQW9CLE9BQU87QUFBQSxjQUMvQixVQUFVLFNBQVM7QUFBQSxjQUNuQixTQUFTLGNBQWMsR0FBRyxPQUFPLElBQUksV0FBVyxLQUFLO0FBQUEsWUFDdEQsQ0FBQztBQUNEO0FBQUEsVUFDRDtBQUFBLFVBQ0EsS0FBSyxzQkFBc0I7QUFDMUIsaUJBQUssb0JBQW9CLE9BQU87QUFBQSxjQUMvQixVQUFVLFNBQVM7QUFBQSxjQUNuQixTQUFTLFNBQVMsNENBQTRDLGdLQUFnSztBQUFBLGNBQzlOLFNBQVM7QUFBQSxnQkFDUixTQUFTO0FBQUEsa0JBQ1IsU0FBUztBQUFBLG9CQUNSLElBQUk7QUFBQSxvQkFDSixPQUFPLFNBQVMsU0FBUyx3QkFBd0I7QUFBQSxvQkFDakQsS0FBSyxNQUFNLEtBQUssNkJBQTZCLGdCQUFnQjtBQUFBLGtCQUM5RCxDQUFDO0FBQUEsa0JBQ0QsU0FBUztBQUFBLG9CQUNSLElBQUk7QUFBQSxvQkFDSixPQUFPLFNBQVMsMkJBQTJCLGtCQUFrQjtBQUFBLG9CQUM3RCxLQUFLLE1BQU0sS0FBSyw2QkFBNkIsaUJBQWlCO0FBQUEsa0JBQy9ELENBQUM7QUFBQSxnQkFDRjtBQUFBLGNBQ0Q7QUFBQSxZQUNELENBQUM7QUFDRDtBQUFBLFVBQ0QsS0FBSyxzQkFBc0I7QUFBQSxVQUMzQixLQUFLLHNCQUFzQjtBQUMxQixpQkFBSyxvQkFBb0IsTUFBTSxTQUFTLGVBQWUsOERBQThELENBQUM7QUFDdEg7QUFBQSxRQUNGO0FBQ0EsYUFBSyxvQkFBb0IsTUFBTSxTQUFTLDRDQUE0QyxvRkFBb0YsV0FBVyx3QkFBd0IsRUFBRSxDQUFDO0FBQUEsTUFDL00sT0FBTztBQUNOLGFBQUssb0JBQW9CLE1BQU0sU0FBUyxFQUFFLEtBQUssa0JBQWtCLFNBQVMsQ0FBQyxrQ0FBa0MsRUFBRSxHQUFHLDZDQUE2QyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUNuTDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGlCQUFtQztBQUNoRCxXQUFPLElBQUksUUFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDckMsWUFBTSxjQUErQixJQUFJLGdCQUFnQjtBQUN6RCxZQUFNLFlBQVksS0FBSyxrQkFBa0IsZ0JBQTRDO0FBQ3JGLGtCQUFZLElBQUksU0FBUztBQUN6QixnQkFBVSxRQUFRLFdBQVc7QUFDN0IsZ0JBQVUsS0FBSztBQUNmLGdCQUFVLGVBQWU7QUFDekIsZ0JBQVUsY0FBYyxTQUFTLHVCQUF1QixTQUFTO0FBQ2pFLGdCQUFVLGNBQWMsU0FBUyxxQ0FBcUMsNkRBQTZEO0FBQ25JLGdCQUFVLGdCQUFnQjtBQUMxQixnQkFBVSxpQkFBaUI7QUFDM0IsZ0JBQVUsWUFBWTtBQUN0QixnQkFBVSxlQUFlO0FBRXpCLFlBQU0sUUFBUSxLQUFLLCtCQUErQjtBQUNsRCxnQkFBVSxRQUFRO0FBQ2xCLGdCQUFVLGdCQUFnQixNQUFNLE9BQU8sVUFBUSxLQUFLLDhCQUE4QixrQkFBa0IsS0FBSyxJQUFJLElBQUksQ0FBQztBQUNsSCxVQUFJLFdBQW9CO0FBQ3hCLGtCQUFZLElBQUksTUFBTSxJQUFJLFVBQVUsYUFBYSxVQUFVLFdBQVcsRUFBRSxNQUFNO0FBQzdFLG1CQUFXO0FBQ1gsa0JBQVUsS0FBSztBQUFBLE1BQ2hCLENBQUMsQ0FBQztBQUNGLGtCQUFZLElBQUksVUFBVSxVQUFVLE1BQU07QUFDekMsWUFBSTtBQUNILGNBQUksVUFBVTtBQUNiLGlCQUFLLG9CQUFvQixPQUFPLFVBQVUsYUFBYTtBQUFBLFVBQ3hEO0FBQ0EsWUFBRSxRQUFRO0FBQUEsUUFDWCxTQUFTLE9BQU87QUFDZixZQUFFLEtBQUs7QUFBQSxRQUNSLFVBQUU7QUFDRCxzQkFBWSxRQUFRO0FBQUEsUUFDckI7QUFBQSxNQUNELENBQUMsQ0FBQztBQUNGLGdCQUFVLEtBQUs7QUFBQSxJQUNoQixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsaUNBQStEO0FBQ3RFLFVBQU0sU0FBUyxDQUFDO0FBQUEsTUFDZixJQUFJLGFBQWE7QUFBQSxNQUNqQixPQUFPLGlCQUFpQixhQUFhLFFBQVE7QUFBQSxJQUM5QyxHQUFHO0FBQUEsTUFDRixJQUFJLGFBQWE7QUFBQSxNQUNqQixPQUFPLGlCQUFpQixhQUFhLFdBQVc7QUFBQSxJQUNqRCxHQUFHO0FBQUEsTUFDRixJQUFJLGFBQWE7QUFBQSxNQUNqQixPQUFPLGlCQUFpQixhQUFhLFFBQVE7QUFBQSxJQUM5QyxHQUFHO0FBQUEsTUFDRixJQUFJLGFBQWE7QUFBQSxNQUNqQixPQUFPLGlCQUFpQixhQUFhLEtBQUs7QUFBQSxJQUMzQyxHQUFHO0FBQUEsTUFDRixJQUFJLGFBQWE7QUFBQSxNQUNqQixPQUFPLGlCQUFpQixhQUFhLEdBQUc7QUFBQSxJQUN6QyxHQUFHO0FBQUEsTUFDRixJQUFJLGFBQWE7QUFBQSxNQUNqQixPQUFPLGlCQUFpQixhQUFhLFdBQVc7QUFBQSxJQUNqRCxHQUFHO0FBQUEsTUFDRixJQUFJLGFBQWE7QUFBQSxNQUNqQixPQUFPLGlCQUFpQixhQUFhLFVBQVU7QUFBQSxJQUNoRCxHQUFHO0FBQUEsTUFDRixJQUFJLGFBQWE7QUFBQSxNQUNqQixPQUFPLGlCQUFpQixhQUFhLFFBQVE7QUFBQSxJQUM5QyxHQUFHO0FBQUEsTUFDRixJQUFJLGFBQWE7QUFBQSxNQUNqQixPQUFPLGlCQUFpQixhQUFhLE9BQU87QUFBQSxJQUM3QyxDQUFDO0FBR0QsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLG9CQUFvQixPQUFxQyxlQUFnRTtBQUNoSSxlQUFXLFFBQVEsT0FBTztBQUN6QixZQUFNLGFBQWEsS0FBSyw4QkFBOEIsa0JBQWtCLEtBQUssRUFBRTtBQUMvRSxZQUFNLFlBQVksQ0FBQyxDQUFDLGNBQWMsT0FBTyxjQUFZLFNBQVMsT0FBTyxLQUFLLEVBQUUsRUFBRSxDQUFDO0FBQy9FLFVBQUksZUFBZSxXQUFXO0FBQzdCLGFBQUssOEJBQThCLHNCQUFzQixLQUFLLElBQUksU0FBUztBQUFBLE1BQzVFO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsdUJBQXNDO0FBQ25ELFdBQU8sSUFBSSxRQUFRLENBQUMsR0FBRyxNQUFNO0FBQzVCLFlBQU0sY0FBK0IsSUFBSSxnQkFBZ0I7QUFDekQsWUFBTSxZQUFZLEtBQUssa0JBQWtCLGdCQUE0QztBQUNyRixrQkFBWSxJQUFJLFNBQVM7QUFDekIsZ0JBQVUsUUFBUSxTQUFTLHdCQUF3QixxQkFBcUIsV0FBVyxLQUFLO0FBQ3hGLGdCQUFVLGNBQWMsU0FBUyw4QkFBOEIscUJBQXFCO0FBQ3BGLGdCQUFVLGdCQUFnQjtBQUMxQixnQkFBVSxpQkFBaUI7QUFDM0IsZ0JBQVUsS0FBSztBQUNmLFlBQU0sUUFBUSxLQUFLLCtCQUErQjtBQUNsRCxnQkFBVSxRQUFRO0FBQ2xCLGdCQUFVLGdCQUFnQixNQUFNLE9BQU8sVUFBUSxLQUFLLDhCQUE4QixrQkFBa0IsS0FBSyxFQUFFLENBQUM7QUFDNUcsa0JBQVksSUFBSSxVQUFVLFlBQVksWUFBWTtBQUNqRCxZQUFJLFVBQVUsY0FBYyxRQUFRO0FBQ25DLGVBQUssb0JBQW9CLE9BQU8sVUFBVSxhQUFhO0FBQ3ZELG9CQUFVLEtBQUs7QUFBQSxRQUNoQjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQ0Ysa0JBQVksSUFBSSxVQUFVLFVBQVUsTUFBTTtBQUN6QyxvQkFBWSxRQUFRO0FBQ3BCLFVBQUU7QUFBQSxNQUNILENBQUMsQ0FBQztBQUNGLGdCQUFVLEtBQUs7QUFBQSxJQUNoQixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyxVQUF5QjtBQUN0QyxVQUFNLFNBQVMsTUFBTSxLQUFLLGNBQWMsUUFBUTtBQUFBLE1BQy9DLFNBQVMsU0FBUyw4QkFBOEIsK0JBQStCO0FBQUEsTUFDL0UsUUFBUSxTQUFTLHdCQUF3Qix5RkFBeUY7QUFBQSxNQUNsSSxlQUFlLFNBQVMsRUFBRSxLQUFLLFlBQVksU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsWUFBWTtBQUFBLE1BQzdGLFVBQVUsS0FBSyw2QkFBNkIsa0JBQWtCLGNBQWMsWUFBWTtBQUFBLFFBQ3ZGLE9BQU8sU0FBUyw0QkFBNEIsc0VBQXNFO0FBQUEsTUFDbkgsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUNELFFBQUksT0FBTyxXQUFXO0FBQ3JCLGFBQU8sS0FBSyw2QkFBNkIsUUFBUSxDQUFDLENBQUMsT0FBTyxlQUFlO0FBQUEsSUFDMUU7QUFBQSxFQUNEO0FBQUEsRUFFUSxZQUFZLFFBQTRCO0FBQy9DLFlBQVEsUUFBUTtBQUFBLE1BQ2YsS0FBSyxhQUFhO0FBQVUsZUFBTyxLQUFLLDhCQUE4QixzQkFBc0IsYUFBYSxVQUFVLEtBQUs7QUFBQSxNQUN4SCxLQUFLLGFBQWE7QUFBYSxlQUFPLEtBQUssOEJBQThCLHNCQUFzQixhQUFhLGFBQWEsS0FBSztBQUFBLE1BQzlILEtBQUssYUFBYTtBQUFVLGVBQU8sS0FBSyw4QkFBOEIsc0JBQXNCLGFBQWEsVUFBVSxLQUFLO0FBQUEsTUFDeEgsS0FBSyxhQUFhO0FBQU8sZUFBTyxLQUFLLDhCQUE4QixzQkFBc0IsYUFBYSxPQUFPLEtBQUs7QUFBQSxNQUNsSCxLQUFLLGFBQWE7QUFBWSxlQUFPLEtBQUssOEJBQThCLHNCQUFzQixhQUFhLFlBQVksS0FBSztBQUFBLE1BQzVILEtBQUssYUFBYTtBQUFhLGVBQU8sS0FBSyw4QkFBOEIsc0JBQXNCLGFBQWEsYUFBYSxLQUFLO0FBQUEsTUFDOUgsS0FBSyxhQUFhO0FBQVUsZUFBTyxLQUFLLDhCQUE4QixzQkFBc0IsYUFBYSxVQUFVLEtBQUs7QUFBQSxJQUN6SDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG1CQUFrQztBQUN6QyxXQUFPLEtBQUssY0FBYyxZQUFZLHFCQUFxQjtBQUFBLEVBQzVEO0FBQUEsRUFFQSxNQUFjLDBCQUEwQixtQkFBc0Q7QUFDN0YsV0FBTyxJQUFJLFFBQWMsQ0FBQyxHQUFHLE1BQU07QUFDbEMsWUFBTSxjQUErQixJQUFJLGdCQUFnQjtBQUN6RCxZQUFNLFlBQVksWUFBWSxJQUFJLEtBQUssa0JBQWtCLGdCQUFvRixDQUFDO0FBQzlJLGdCQUFVLFFBQVEsU0FBUywyQkFBMkIsdUJBQXVCLFdBQVcsS0FBSztBQUM3RixnQkFBVSxjQUFjLFNBQVMsaUNBQWlDLDZGQUE2RjtBQUMvSixnQkFBVSxZQUFZO0FBQ3RCLGdCQUFVLGlCQUFpQjtBQUMzQixZQUFNLGlCQUFpQixDQUFDLFFBQWlDO0FBQ3hELGNBQU0sWUFBWSxRQUFRLEtBQUssa0JBQWtCLFVBQVU7QUFDM0QsWUFBSSxXQUFXO0FBQ2QsaUJBQU8sU0FBUyxXQUFXLFNBQVM7QUFBQSxRQUNyQztBQUNBLGVBQU87QUFBQSxNQUNSO0FBQ0EsZ0JBQVUsUUFBUTtBQUFBLFFBQ2pCO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsWUFBWSxVQUFVO0FBQUEsVUFDdEMsYUFBYSxlQUFlLGtCQUFrQixXQUFXO0FBQUEsUUFDMUQ7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsVUFBVSxRQUFRO0FBQUEsVUFDbEMsYUFBYSxlQUFlLGtCQUFrQixTQUFTO0FBQUEsUUFDeEQ7QUFBQSxNQUNEO0FBQ0Esa0JBQVksSUFBSSxVQUFVLFlBQVksWUFBWTtBQUNqRCxZQUFJO0FBQ0gsZ0JBQU0sS0FBSyxtQ0FBbUMsT0FBTyxVQUFVLGNBQWMsQ0FBQyxFQUFFLEVBQUU7QUFDbEYsWUFBRTtBQUFBLFFBQ0gsU0FBUyxPQUFPO0FBQ2YsWUFBRSxLQUFLO0FBQUEsUUFDUixVQUFFO0FBQ0Qsb0JBQVUsS0FBSztBQUFBLFFBQ2hCO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFDRixrQkFBWSxJQUFJLFVBQVUsVUFBVSxNQUFNLFlBQVksUUFBUSxDQUFDLENBQUM7QUFDaEUsZ0JBQVUsS0FBSztBQUFBLElBQ2hCLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxrQkFBd0I7QUFDL0IsUUFBSSxLQUFLLDhCQUE4QixvQkFBb0IsR0FBRztBQUM3RCxXQUFLLHlCQUF5QjtBQUM5QixXQUFLLDBCQUEwQjtBQUFBLElBQ2hDO0FBQ0EsU0FBSyw0QkFBNEI7QUFDakMsU0FBSywrQkFBK0I7QUFDcEMsU0FBSyxxQkFBcUI7QUFDMUIsU0FBSyw0QkFBNEI7QUFFakMsU0FBSyw4QkFBOEI7QUFDbkMsU0FBSyx5QkFBeUI7QUFDOUIsU0FBSyxzQkFBc0I7QUFDM0IsU0FBSyw0QkFBNEI7QUFDakMsU0FBSywyQkFBMkI7QUFDaEMsU0FBSyxtQkFBbUI7QUFDeEIsU0FBSyxzQkFBc0I7QUFDM0IsU0FBSyw0QkFBNEI7QUFDakMsU0FBSywyQkFBMkI7QUFFaEMsUUFBSSxPQUFPO0FBQ1YsV0FBSyxtQ0FBbUM7QUFBQSxJQUN6QztBQUFBLEVBQ0Q7QUFBQSxFQUVRLDJCQUFpQztBQUN4QyxVQUFNLE9BQU87QUFDYixVQUFNLE9BQU8sZUFBZSxJQUFJLG1CQUFtQixZQUFZLFdBQVcsYUFBYSxHQUFHLHdCQUF3QixVQUFVLEdBQUcseUJBQXlCLE9BQU8sQ0FBQztBQUNoSyxTQUFLLFVBQVUsZ0JBQWdCLE1BQU0sNEJBQTRCLFFBQVE7QUFBQSxNQUN4RSxjQUFjO0FBQ2IsY0FBTTtBQUFBLFVBQ0wsSUFBSTtBQUFBLFVBQ0osT0FBTyxVQUFVLGdDQUFnQyw2QkFBNkI7QUFBQSxVQUM5RSxVQUFVO0FBQUEsVUFDVixJQUFJO0FBQUEsVUFDSixjQUFjO0FBQUEsVUFDZCxNQUFNLENBQUM7QUFBQSxZQUNOLE9BQU87QUFBQSxZQUNQLElBQUksT0FBTztBQUFBLFlBQ1g7QUFBQSxZQUNBLE9BQU87QUFBQSxVQUNSLEdBQUc7QUFBQSxZQUNGLE9BQU87QUFBQSxZQUNQLElBQUksT0FBTztBQUFBLFlBQ1g7QUFBQSxZQUNBLE9BQU87QUFBQSxVQUNSLEdBQUc7QUFBQSxZQUNGLE9BQU87QUFBQSxZQUNQLElBQUksT0FBTztBQUFBLFlBQ1g7QUFBQSxZQUNBLE9BQU87QUFBQSxVQUNSLENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNGO0FBQUEsTUFDQSxNQUFNLE1BQXFCO0FBQzFCLGVBQU8sS0FBSyxPQUFPO0FBQUEsTUFDcEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLDhCQUFvQztBQUMzQyxVQUFNLE9BQU8sZUFBZSxJQUFJLG1CQUFtQixZQUFZLFdBQVcsYUFBYSxHQUFHLHdCQUF3QixVQUFVLEdBQUcsd0JBQXdCO0FBQ3ZKLFNBQUssVUFBVSxnQkFBZ0IsTUFBTSw0QkFBNEIsUUFBUTtBQUFBLE1BQ3hFLGNBQWM7QUFDYixjQUFNO0FBQUEsVUFDTCxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsbUJBQW1CLDZCQUE2QjtBQUFBLFVBQ2hFLGNBQWMsZUFBZSxNQUFNO0FBQUEsVUFDbkMsTUFBTSxDQUFDO0FBQUEsWUFDTixPQUFPO0FBQUEsWUFDUCxJQUFJLE9BQU87QUFBQSxZQUNYO0FBQUEsWUFDQSxPQUFPO0FBQUEsVUFDUixHQUFHO0FBQUEsWUFDRixPQUFPO0FBQUEsWUFDUCxJQUFJLE9BQU87QUFBQSxZQUNYO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRixDQUFDO0FBQUEsTUFDRjtBQUFBLE1BQ0EsTUFBTSxNQUFxQjtBQUFBLE1BQUU7QUFBQSxJQUM5QixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxpQ0FBdUM7QUFDOUMsVUFBTSxPQUFPO0FBQ2IsU0FBSyxVQUFVLGdCQUFnQixNQUFNLDRCQUE0QixRQUFRO0FBQUEsTUFDeEUsY0FBYztBQUNiLGNBQU07QUFBQSxVQUNMLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUywwQkFBMEIsUUFBUTtBQUFBLFVBQ2xELE1BQU0sUUFBUTtBQUFBLFVBQ2QsTUFBTTtBQUFBLFlBQ0wsSUFBSSxPQUFPO0FBQUEsWUFDWCxNQUFNLGVBQWUsSUFBSSwwQkFBMEIsZUFBZSxPQUFPLGlCQUFpQixzQkFBc0IsQ0FBQztBQUFBLFlBQ2pILE9BQU87QUFBQSxZQUNQLE9BQU87QUFBQSxVQUNSO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLE1BQ0EsTUFBTSxNQUFxQjtBQUMxQixlQUFPLEtBQUssNkJBQTZCLFFBQVEsS0FBSztBQUFBLE1BQ3ZEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSx1QkFBNkI7QUFDcEMsVUFBTSxPQUFPO0FBQ2IsVUFBTSxLQUFLO0FBQ1gsVUFBTSxPQUFPLGVBQWUsSUFBSSxtQkFBbUIsWUFBWSxXQUFXLGFBQWEsR0FBRyx5QkFBeUIsc0JBQXNCLFVBQVUsY0FBYyxXQUFXLENBQUM7QUFDN0ssU0FBSyxVQUFVLGdCQUFnQixNQUFNLHVCQUF1QixRQUFRO0FBQUEsTUFDbkUsY0FBYztBQUNiLGNBQU07QUFBQSxVQUNMLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxrQkFBa0IsMEJBQTBCO0FBQUEsVUFDNUQsTUFBTTtBQUFBLFlBQ0wsT0FBTztBQUFBLFlBQ1AsSUFBSSxPQUFPO0FBQUEsWUFDWDtBQUFBLFlBQ0EsT0FBTztBQUFBLFVBQ1I7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsTUFDQSxNQUFNLE1BQXFCO0FBQzFCLFlBQUk7QUFDSCxnQkFBTSxLQUFLLDZCQUE2QixPQUFPO0FBQUEsUUFDaEQsU0FBUyxHQUFHO0FBQ1gsZUFBSyxvQkFBb0IsTUFBTSxDQUFDO0FBQUEsUUFDakM7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsYUFBYSxlQUFlLE9BQU8saUJBQWlCO0FBQUEsTUFDbEUsT0FBTztBQUFBLE1BQ1AsU0FBUztBQUFBLFFBQ1I7QUFBQSxRQUNBLE9BQU8sU0FBUyxvQkFBb0IsOEJBQThCO0FBQUEsTUFDbkU7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSx3QkFBMEM7QUFDakQsV0FBTyxVQUFVLDJCQUEyQix3QkFBd0IsS0FBSyxrQkFBa0IsQ0FBQztBQUFBLEVBQzdGO0FBQUEsRUFHUSw4QkFBb0M7QUFDM0MsU0FBSywwQkFBMEIsUUFBUTtBQUN2QyxVQUFNLE9BQU87QUFDYixTQUFLLDBCQUEwQixRQUFRLGdCQUFnQixNQUFNLDRCQUE0QixRQUFRO0FBQUEsTUFDaEcsY0FBYztBQUNiLGNBQU07QUFBQSxVQUNMLElBQUk7QUFBQSxVQUNKLElBQUksUUFBUTtBQUFFLG1CQUFPLEtBQUssc0JBQXNCO0FBQUEsVUFBRztBQUFBLFVBQ25ELFVBQVU7QUFBQSxVQUNWLElBQUk7QUFBQSxVQUNKLGNBQWM7QUFBQSxVQUNkLE1BQU0sQ0FBQztBQUFBLFlBQ04sT0FBTztBQUFBLFlBQ1AsSUFBSSxPQUFPO0FBQUEsWUFDWCxNQUFNO0FBQUEsWUFDTixPQUFPO0FBQUEsVUFDUixHQUFHO0FBQUEsWUFDRixPQUFPO0FBQUEsWUFDUCxJQUFJLE9BQU87QUFBQSxZQUNYLE1BQU07QUFBQSxZQUNOLE9BQU87QUFBQSxVQUNSLENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNGO0FBQUEsTUFDQSxNQUFNLE1BQXFCO0FBQzFCLGVBQU8sS0FBSyw2QkFBNkIsY0FBYztBQUFBLE1BQ3hEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsMkJBQWlDO0FBQ3hDLFVBQU0sT0FBTztBQUNiLFVBQU0sT0FBTyxlQUFlLElBQUkseUJBQXlCLHNCQUFzQixZQUFZLGNBQWMsV0FBVyxHQUFHLG1CQUFtQixZQUFZLFdBQVcsYUFBYSxDQUFDO0FBQy9LLFNBQUssVUFBVSxnQkFBZ0IsTUFBTSx5QkFBeUIsUUFBUTtBQUFBLE1BQ3JFLGNBQWM7QUFDYixjQUFNO0FBQUEsVUFDTCxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsY0FBYyxxQkFBcUI7QUFBQSxVQUNuRCxTQUFTLG1CQUFtQjtBQUFBLFVBQzVCLE1BQU07QUFBQSxZQUNMO0FBQUEsY0FDQyxJQUFJLE9BQU87QUFBQSxjQUNYLE9BQU87QUFBQSxjQUNQO0FBQUEsY0FDQSxPQUFPO0FBQUEsWUFDUjtBQUFBLFlBQ0E7QUFBQSxjQUNDLElBQUksT0FBTztBQUFBLGNBQ1gsT0FBTztBQUFBLGNBQ1A7QUFBQSxjQUNBLE9BQU87QUFBQSxZQUNSO0FBQUEsWUFDQTtBQUFBLGNBQ0MsSUFBSSxPQUFPO0FBQUEsY0FDWCxPQUFPO0FBQUEsY0FDUDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLE1BQ0EsSUFBSSxVQUFxQztBQUN4QyxlQUFPLElBQUksUUFBYyxDQUFDLEdBQUcsTUFBTTtBQUNsQyxnQkFBTSxvQkFBb0IsU0FBUyxJQUFJLGtCQUFrQjtBQUN6RCxnQkFBTSxpQkFBaUIsU0FBUyxJQUFJLGVBQWU7QUFDbkQsZ0JBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxnQkFBTSxZQUFZLGtCQUFrQixnQkFBZ0IsRUFBRSxlQUFlLEtBQUssQ0FBQztBQUMzRSxzQkFBWSxJQUFJLFNBQVM7QUFDekIsZ0JBQU0sUUFBOEIsQ0FBQztBQUNyQyxjQUFJLEtBQUssb0JBQW9CLFVBQVUsUUFBUTtBQUM5QyxrQkFBTSxLQUFLLEVBQUUsSUFBSSx3QkFBd0IsT0FBTyxHQUFHLFdBQVcsS0FBSyxLQUFLLEtBQUssc0JBQXNCLEVBQUUsUUFBUSxHQUFHLENBQUM7QUFDakgsa0JBQU0sS0FBSyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQUEsVUFDakM7QUFDQSxnQkFBTSxLQUFLLEVBQUUsSUFBSSxxQkFBcUIsSUFBSSxPQUFPLEdBQUcsV0FBVyxLQUFLLEtBQUsscUJBQXFCLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFDaEgsZ0JBQU0sS0FBSyxFQUFFLElBQUksd0JBQXdCLElBQUksT0FBTyxHQUFHLFdBQVcsS0FBSyxLQUFLLHdCQUF3QixNQUFNLFFBQVEsR0FBRyxDQUFDO0FBQ3RILGdCQUFNLEtBQUssRUFBRSxJQUFJLHNCQUFzQixJQUFJLE9BQU8sR0FBRyxXQUFXLEtBQUssS0FBSyxzQkFBc0IsTUFBTSxRQUFRLEdBQUcsQ0FBQztBQUNsSCxnQkFBTSxLQUFLLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDaEMsZ0JBQU0sS0FBSyxFQUFFLElBQUksZUFBZSxJQUFJLE9BQU8sR0FBRyxXQUFXLEtBQUssS0FBSyxlQUFlLE1BQU0sUUFBUSxJQUFJLGFBQWEsZUFBZSxZQUFZLEtBQUssbUJBQW1CLEVBQUUsQ0FBQztBQUN2SyxjQUFJLEtBQUssOEJBQThCLG9CQUFvQixHQUFHO0FBQzdELGtCQUFNLFVBQVUsS0FBSyw2QkFBNkI7QUFDbEQsa0JBQU0sS0FBSyxFQUFFLElBQUksbUJBQW1CLElBQUksT0FBTyxHQUFHLFdBQVcsS0FBSyxLQUFLLG1CQUFtQixNQUFNLFFBQVEsSUFBSSxhQUFhLFVBQVUsR0FBRyxRQUFRLFdBQVcsS0FBSyxLQUFLLHNCQUFzQixZQUFZLFFBQVEsd0JBQXdCLEVBQUUsS0FBSyxNQUFNLE9BQVUsQ0FBQztBQUFBLFVBQzlQO0FBQ0Esb0JBQVUsUUFBUTtBQUNsQixzQkFBWSxJQUFJLFVBQVUsWUFBWSxNQUFNO0FBQzNDLGdCQUFJLFVBQVUsY0FBYyxDQUFDLEtBQUssVUFBVSxjQUFjLENBQUMsRUFBRSxJQUFJO0FBQ2hFLDZCQUFlLGVBQWUsVUFBVSxjQUFjLENBQUMsRUFBRSxFQUFFO0FBQUEsWUFDNUQ7QUFDQSxzQkFBVSxLQUFLO0FBQUEsVUFDaEIsQ0FBQyxDQUFDO0FBQ0Ysc0JBQVksSUFBSSxVQUFVLFVBQVUsTUFBTTtBQUN6Qyx3QkFBWSxRQUFRO0FBQ3BCLGNBQUU7QUFBQSxVQUNILENBQUMsQ0FBQztBQUNGLG9CQUFVLEtBQUs7QUFBQSxRQUNoQixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsZ0NBQXNDO0FBQzdDLFVBQU0sT0FBTztBQUNiLFVBQU0sT0FBTyxlQUFlLElBQUksc0JBQXNCLFVBQVUsY0FBYyxTQUFTLEdBQUcsbUJBQW1CLFlBQVksV0FBVyxhQUFhLENBQUM7QUFDbEosU0FBSyxVQUFVLGdCQUFnQixNQUFNLHlCQUF5QixRQUFRO0FBQUEsTUFDckUsY0FBYztBQUNiLGNBQU07QUFBQSxVQUNMLElBQUksc0JBQXNCO0FBQUEsVUFDMUIsT0FBTyxzQkFBc0I7QUFBQSxVQUM3QixVQUFVO0FBQUEsVUFDVixjQUFjO0FBQUEsVUFDZCxNQUFNO0FBQUEsWUFDTCxJQUFJLE9BQU87QUFBQSxZQUNYO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLElBQUksVUFBMkM7QUFDOUMsZUFBTyxLQUFLLDZCQUE2QixpQkFBaUI7QUFBQSxNQUMzRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsd0JBQThCO0FBQ3JDLFVBQU0sT0FBTztBQUNiLFNBQUssVUFBVSxnQkFBZ0IsTUFBTSxzQkFBc0IsUUFBUTtBQUFBLE1BQ2xFLGNBQWM7QUFDYixjQUFNO0FBQUEsVUFDTCxJQUFJLGVBQWU7QUFBQSxVQUNuQixPQUFPLGVBQWU7QUFBQSxVQUN0QixVQUFVO0FBQUEsVUFDVixNQUFNO0FBQUEsWUFDTCxJQUFJLE9BQU87QUFBQSxZQUNYLE1BQU0sZUFBZSxJQUFJLHlCQUF5QixzQkFBc0IsVUFBVSxjQUFjLFNBQVMsR0FBRyxtQkFBbUIsWUFBWSxXQUFXLGFBQWEsQ0FBQztBQUFBLFVBQ3JLO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLE1BQ0EsSUFBSSxVQUEyQztBQUM5QyxlQUFPLEtBQUssNkJBQTZCLFFBQVE7QUFBQSxNQUNsRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsNEJBQWtDO0FBQ3pDLFVBQU0sT0FBTztBQUNiLFNBQUssVUFBVSxnQkFBZ0IsTUFBTSx1QkFBdUIsUUFBUTtBQUFBLE1BQ25FLGNBQWM7QUFDYixjQUFNO0FBQUEsVUFDTCxJQUFJLG1CQUFtQjtBQUFBLFVBQ3ZCLE9BQU8sbUJBQW1CO0FBQUEsVUFDMUIsVUFBVTtBQUFBLFVBQ1YsTUFBTTtBQUFBLFlBQ0wsSUFBSSxPQUFPO0FBQUEsWUFDWCxNQUFNLGVBQWUsSUFBSSxtQkFBbUIsWUFBWSxXQUFXLGFBQWEsR0FBRyx1QkFBdUI7QUFBQSxVQUMzRztBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLE1BQU0sTUFBcUI7QUFDMUIsWUFBSTtBQUNILGdCQUFNLEtBQUssUUFBUTtBQUFBLFFBQ3BCLFNBQVMsR0FBRztBQUNYLGNBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHO0FBQzVCLGlCQUFLLG9CQUFvQixNQUFNLFNBQVMsbUJBQW1CLHFGQUFxRixXQUFXLHdCQUF3QixFQUFFLENBQUM7QUFBQSxVQUN2TDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSw4QkFBb0M7QUFDM0MsVUFBTSxPQUFPO0FBQ2IsVUFBTSxPQUFPLGVBQWUsSUFBSSxtQkFBbUIsWUFBWSxXQUFXLGFBQWEsR0FBRyx1QkFBdUI7QUFDakgsU0FBSyxVQUFVLGdCQUFnQixNQUFNLDRCQUE0QixRQUFRO0FBQUEsTUFDeEUsY0FBYztBQUNiLGNBQU07QUFBQSxVQUNMLElBQUkscUJBQXFCO0FBQUEsVUFDekIsT0FBTyxxQkFBcUI7QUFBQSxVQUM1QixVQUFVO0FBQUEsVUFDVixNQUFNLFFBQVE7QUFBQSxVQUNkLFNBQVMsU0FBUyxhQUFhLGNBQWM7QUFBQSxVQUM3QyxNQUFNLENBQUM7QUFBQSxZQUNOLElBQUksT0FBTztBQUFBLFlBQ1g7QUFBQSxVQUNELEdBQUc7QUFBQSxZQUNGLElBQUksT0FBTztBQUFBLFlBQ1gsTUFBTSxlQUFlLElBQUkseUJBQXlCLGVBQWUsT0FBTyxpQkFBaUIsc0JBQXNCLENBQUM7QUFBQSxZQUNoSCxPQUFPO0FBQUEsWUFDUCxPQUFPO0FBQUEsVUFDUixDQUFDO0FBQUEsUUFDRixDQUFDO0FBQUEsTUFDRjtBQUFBLE1BQ0EsTUFBZTtBQUFFLGVBQU8sS0FBSyxxQkFBcUI7QUFBQSxNQUFHO0FBQUEsSUFDdEQsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsd0JBQThCO0FBQ3JDLFVBQU0sT0FBTztBQUNiLFNBQUssVUFBVSxnQkFBZ0IsTUFBTSwrQkFBK0IsUUFBUTtBQUFBLE1BQzNFLGNBQWM7QUFDYixjQUFNO0FBQUEsVUFDTCxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsdUJBQXVCLGlCQUFpQixXQUFXLEtBQUs7QUFBQSxVQUN4RSxTQUFTLFNBQVMseUJBQXlCLFVBQVU7QUFBQSxVQUNyRCxNQUFNLFFBQVE7QUFBQSxVQUNkLE1BQU0sQ0FBQztBQUFBLFlBQ04sSUFBSSxPQUFPO0FBQUEsWUFDWCxNQUFNLGVBQWUsSUFBSSxtQkFBbUIsWUFBWSxXQUFXLGFBQWEsQ0FBQztBQUFBLFVBQ2xGLEdBQUc7QUFBQSxZQUNGLElBQUksT0FBTztBQUFBLFlBQ1gsTUFBTSxlQUFlLE9BQU8saUJBQWlCLHNCQUFzQjtBQUFBLFlBQ25FLE9BQU87QUFBQSxZQUNQLE9BQU87QUFBQSxVQUNSLENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNGO0FBQUEsTUFDQSxNQUFlO0FBQUUsZUFBTyxLQUFLLGlCQUFpQjtBQUFBLE1BQUc7QUFBQSxJQUNsRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSw2QkFBbUM7QUFDMUMsU0FBSyxVQUFVLGdCQUFnQixNQUFNLCtCQUErQixRQUFRO0FBQUEsTUFDM0UsY0FBYztBQUNiLGNBQU07QUFBQSxVQUNMLElBQUksd0JBQXdCO0FBQUEsVUFDNUIsT0FBTyx3QkFBd0I7QUFBQSxVQUMvQixVQUFVO0FBQUEsVUFDVixNQUFNO0FBQUEsWUFDTCxJQUFJLE9BQU87QUFBQSxZQUNYLE1BQU0sZUFBZSxJQUFJLG1CQUFtQixZQUFZLFdBQVcsYUFBYSxDQUFDO0FBQUEsVUFDbEY7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsTUFDQSxJQUFJLFVBQWtDO0FBQ3JDLGlCQUFTLElBQUksbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxPQUFPLE9BQU8sWUFBWSxDQUFDO0FBQUEsTUFDN0Y7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLHFCQUEyQjtBQUNsQyxVQUFNLE9BQU87QUFDYixTQUFLLFVBQVUsZ0JBQWdCLE1BQU0sbUJBQW1CLFFBQVE7QUFBQSxNQUMvRCxjQUFjO0FBQ2IsY0FBTTtBQUFBLFVBQ0wsSUFBSTtBQUFBLFVBQ0osT0FBTztBQUFBLFVBQ1AsVUFBVSxXQUFXO0FBQUEsVUFDckIsTUFBTSxDQUFDO0FBQUEsWUFDTixJQUFJLE9BQU87QUFBQSxZQUNYLE1BQU0sZUFBZSxJQUFJLG1CQUFtQixZQUFZLFdBQVcsYUFBYSxDQUFDO0FBQUEsVUFDbEYsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLE1BQWU7QUFBRSxlQUFPLEtBQUssY0FBYyxLQUFLLElBQUksTUFBTSwwQ0FBMEMsQ0FBQztBQUFBLE1BQUc7QUFBQSxJQUN6RyxDQUFDLENBQUM7QUFDRixpQkFBYSxlQUFlLE9BQU8sb0JBQW9CO0FBQUEsTUFDdEQsU0FBUztBQUFBLFFBQ1IsSUFBSTtBQUFBLFFBQ0osT0FBTyxXQUFXLEtBQUs7QUFBQSxNQUN4QjtBQUFBLE1BQ0EsTUFBTSxlQUFlLE9BQU8saUJBQWlCLHNCQUFzQjtBQUFBLE1BQ25FLE9BQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSw2QkFBbUM7QUFDMUMsVUFBTSxPQUFPO0FBQ2IsU0FBSyxVQUFVLGdCQUFnQixNQUFNLDJCQUEyQixRQUFRO0FBQUEsTUFDdkUsY0FBYztBQUNiLGNBQU07QUFBQSxVQUNMLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyx5QkFBeUIsZ0JBQWdCO0FBQUEsVUFDekQsTUFBTSxDQUFDO0FBQUEsWUFDTixJQUFJLE9BQU87QUFBQSxZQUNYLE1BQU0sZUFBZSxJQUFJLHdCQUF3QixlQUFlLE1BQU0sZ0JBQWdCLEtBQUssSUFBSSxPQUFPLElBQUkscUJBQXFCLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDckksQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUVBLE1BQU0sSUFBSSxVQUE0QixpQkFBcUM7QUFDMUUsY0FBTSxrQkFBa0IsU0FBUyxJQUFJLGdCQUFnQjtBQUNyRCxjQUFNLGdCQUFnQixLQUFLLGVBQWU7QUFDMUMsY0FBTSxVQUFVLE1BQU0sZ0JBQWdCLEtBQUssZUFBZTtBQUMxRCxjQUFNLEtBQUssb0JBQW9CLE9BQU8sS0FBSyxnQkFBZ0IsZUFBZSxHQUFHLGlCQUFpQixRQUFRLE9BQU8sSUFBSTtBQUFBLE1BQ2xIO0FBQUEsTUFFUSxnQkFBZ0IsaUJBQTZDO0FBQ3BFLGNBQU0sV0FBVyxLQUFLLG9CQUFvQixVQUFVLEtBQUssQ0FBQyxFQUFFLFVBQVUsTUFBTSxVQUFVLEtBQUssQ0FBQUEsY0FBWSxRQUFRQSxVQUFTLGlCQUFpQixlQUFlLENBQUMsQ0FBQztBQUMxSixZQUFJLFVBQVU7QUFDYixpQkFBTztBQUFBLFFBQ1I7QUFDQSxjQUFNLElBQUksTUFBTSxxQkFBcUIsZ0JBQWdCLFNBQVMsQ0FBQyxFQUFFO0FBQUEsTUFDbEU7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLHFDQUEyQztBQUNsRCxTQUFLLFVBQVUsZ0JBQWdCLE1BQU0sbUNBQW1DLFFBQVE7QUFBQSxNQUMvRSxjQUFjO0FBQ2IsY0FBTSxtQ0FBbUM7QUFBQSxNQUMxQztBQUFBLE1BQ0EsTUFBTSxJQUFJLFVBQTJDO0FBQ3BELGNBQU0sK0JBQStCLFNBQVMsSUFBSSw2QkFBNkI7QUFDL0UsY0FBTSxzQkFBc0IsU0FBUyxJQUFJLG9CQUFvQjtBQUM3RCxjQUFNLFNBQVMsTUFBTSw2QkFBNkIscUJBQXFCO0FBQ3ZFLFlBQUksUUFBUTtBQUNYLDhCQUFvQixLQUFLLFNBQVMsbUNBQW1DLGlEQUFpRCxDQUFDO0FBQUEsUUFDeEg7QUFBQSxNQUNEO0FBQUEsSUFFRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxnQkFBc0I7QUFDN0IsVUFBTSxZQUFZLEtBQUssc0JBQXNCO0FBQzdDLFNBQUssa0JBQWtCLFNBQVM7QUFBQSxFQUNqQztBQUFBLEVBRVEsd0JBQXVDO0FBQzlDLFdBQU8sU0FBUyxHQUE0QixXQUFXLHNCQUFzQixFQUFFO0FBQUEsTUFDOUU7QUFBQSxRQUNDLElBQUk7QUFBQSxRQUNKLE9BQU87QUFBQSxRQUNQLGdCQUFnQixJQUFJO0FBQUEsVUFDbkI7QUFBQSxVQUNBLENBQUMsd0JBQXdCLEVBQUUsc0NBQXNDLEtBQUssQ0FBQztBQUFBLFFBQ3hFO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsTUFDZDtBQUFBLE1BQUcsc0JBQXNCO0FBQUEsSUFBTztBQUFBLEVBQ2xDO0FBQUEsRUFFUSw4QkFBb0M7QUFDM0MsVUFBTSxPQUFPO0FBQ2IsU0FBSyxVQUFVLGdCQUFnQixjQUFjLFFBQVE7QUFBQSxNQUNwRCxjQUFjO0FBQ2IsY0FBTTtBQUFBLFVBQ0wsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLG9DQUFvQyx3QkFBd0I7QUFBQSxVQUM1RSxNQUFNLENBQUM7QUFBQSxZQUNOLElBQUksT0FBTztBQUFBLFlBQ1gsTUFBTSxlQUFlLE9BQU8saUJBQWlCLHNCQUFzQjtBQUFBLFlBQ25FLE9BQU87QUFBQSxVQUNSLENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNGO0FBQUEsTUFDQSxNQUFlO0FBQUUsZUFBTyxLQUFLLDZCQUE2QixnQkFBZ0I7QUFBQSxNQUFHO0FBQUEsSUFDOUUsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsa0JBQWtCLFdBQWdDO0FBQ3pELFNBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLHVCQUF1QixTQUFTLENBQUM7QUFBQSxFQUMxRjtBQUVEO0FBem5DYSxvQ0FBTjtBQUFBLEVBUUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0E5QlU7QUEybkNiLElBQU0sZ0NBQU4sTUFBeUU7QUFBQSxFQUV4RSxZQUN3QyxxQkFDUCxjQUNHLGlCQUNsQztBQUhzQztBQUNQO0FBQ0c7QUFBQSxFQUVwQztBQUFBLEVBRUEsbUJBQW1CLEtBQXNDO0FBQ3hELFFBQUksSUFBSSxXQUFXLHVCQUF1QjtBQUN6QyxhQUFPLEtBQUssb0JBQW9CLGVBQWUsR0FBRyxFQUFFLEtBQUssYUFBVyxLQUFLLGFBQWEsWUFBWSxXQUFXLElBQUksS0FBSyxnQkFBZ0IsV0FBVyxPQUFPLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDaEs7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBZk0sZ0NBQU47QUFBQSxFQUdHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQUxHOyIsCiAgIm5hbWVzIjogWyJjb25mbGljdCJdCn0K
