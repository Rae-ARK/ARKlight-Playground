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
import { IUserDataSyncService, isAuthenticationProvider, IUserDataAutoSyncService, IUserDataSyncStoreManagementService, SyncStatus, IUserDataSyncEnablementService, USER_DATA_SYNC_SCHEME, USER_DATA_SYNC_LOG_ID } from "../../../../platform/userDataSync/common/userDataSync.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IUserDataSyncWorkbenchService, AccountStatus, CONTEXT_SYNC_ENABLEMENT, CONTEXT_SYNC_STATE, CONTEXT_ACCOUNT_STATE, SHOW_SYNC_LOG_COMMAND_ID, CONTEXT_ENABLE_ACTIVITY_VIEWS, SYNC_VIEW_CONTAINER_ID, SYNC_TITLE, SYNC_CONFLICTS_VIEW_ID, CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW, CONTEXT_HAS_CONFLICTS, getSyncAreaLabel } from "../common/userDataSync.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { getCurrentAuthenticationSessionInfo } from "../../authentication/browser/authenticationService.js";
import { IAuthenticationService } from "../../authentication/common/authentication.js";
import { IUserDataSyncAccountService } from "../../../../platform/userDataSync/common/userDataSyncAccount.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { localize } from "../../../../nls.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { URI } from "../../../../base/common/uri.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IViewsService } from "../../views/common/viewsService.js";
import { ILifecycleService } from "../../lifecycle/common/lifecycle.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { UserDataSyncStoreClient } from "../../../../platform/userDataSync/common/userDataSyncStoreService.js";
import { UserDataSyncStoreTypeSynchronizer } from "../../../../platform/userDataSync/common/globalStateSync.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { raceCancellationError } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { isDiffEditorInput } from "../../../common/editor.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { IUserDataInitializationService } from "../../userData/browser/userDataInit.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
import { IUserDataSyncMachinesService } from "../../../../platform/userDataSync/common/userDataSyncMachines.js";
import { equals } from "../../../../base/common/arrays.js";
import { env } from "../../../../base/common/process.js";
class UserDataSyncAccount {
  constructor(authenticationProviderId, session) {
    this.authenticationProviderId = authenticationProviderId;
    this.session = session;
  }
  get sessionId() {
    return this.session.id;
  }
  get accountName() {
    return this.session.account.label;
  }
  get accountId() {
    return this.session.account.id;
  }
  get token() {
    return this.session.idToken || this.session.accessToken;
  }
}
function isMergeEditorInput(editor) {
  const candidate = editor;
  return URI.isUri(candidate?.base) && URI.isUri(candidate?.input1?.uri) && URI.isUri(candidate?.input2?.uri) && URI.isUri(candidate?.result);
}
let UserDataSyncWorkbenchService = class extends Disposable {
  constructor(userDataSyncService, uriIdentityService, authenticationService, userDataSyncAccountService, quickInputService, storageService, userDataSyncEnablementService, userDataAutoSyncService, logService, productService, extensionService, environmentService, secretStorageService, notificationService, progressService, dialogService, contextKeyService, viewsService, viewDescriptorService, userDataSyncStoreManagementService, lifecycleService, instantiationService, editorService, userDataInitializationService, fileService, fileDialogService, userDataSyncMachinesService) {
    super();
    this.userDataSyncService = userDataSyncService;
    this.uriIdentityService = uriIdentityService;
    this.authenticationService = authenticationService;
    this.userDataSyncAccountService = userDataSyncAccountService;
    this.quickInputService = quickInputService;
    this.storageService = storageService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.userDataAutoSyncService = userDataAutoSyncService;
    this.logService = logService;
    this.productService = productService;
    this.extensionService = extensionService;
    this.environmentService = environmentService;
    this.secretStorageService = secretStorageService;
    this.notificationService = notificationService;
    this.progressService = progressService;
    this.dialogService = dialogService;
    this.viewsService = viewsService;
    this.viewDescriptorService = viewDescriptorService;
    this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
    this.lifecycleService = lifecycleService;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.userDataInitializationService = userDataInitializationService;
    this.fileService = fileService;
    this.fileDialogService = fileDialogService;
    this.userDataSyncMachinesService = userDataSyncMachinesService;
    this._authenticationProviders = [];
    this._accountStatus = AccountStatus.Uninitialized;
    this._onDidChangeAccountStatus = this._register(new Emitter());
    this.onDidChangeAccountStatus = this._onDidChangeAccountStatus.event;
    this._onDidTurnOnSync = this._register(new Emitter());
    this.onDidTurnOnSync = this._onDidTurnOnSync.event;
    this.turnOnSyncCancellationToken = void 0;
    this._cachedCurrentAuthenticationProviderId = null;
    this._cachedCurrentSessionId = null;
    this.syncEnablementContext = CONTEXT_SYNC_ENABLEMENT.bindTo(contextKeyService);
    this.syncStatusContext = CONTEXT_SYNC_STATE.bindTo(contextKeyService);
    this.accountStatusContext = CONTEXT_ACCOUNT_STATE.bindTo(contextKeyService);
    this.activityViewsEnablementContext = CONTEXT_ENABLE_ACTIVITY_VIEWS.bindTo(contextKeyService);
    this.hasConflicts = CONTEXT_HAS_CONFLICTS.bindTo(contextKeyService);
    this.enableConflictsViewContext = CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW.bindTo(contextKeyService);
    if (this.userDataSyncStoreManagementService.userDataSyncStore) {
      this.syncStatusContext.set(this.userDataSyncService.status);
      this._register(userDataSyncService.onDidChangeStatus((status) => this.syncStatusContext.set(status)));
      this.syncEnablementContext.set(userDataSyncEnablementService.isEnabled());
      this._register(userDataSyncEnablementService.onDidChangeEnablement((enabled) => this.syncEnablementContext.set(enabled)));
      this.waitAndInitialize();
    }
  }
  get enabled() {
    return !!this.userDataSyncStoreManagementService.userDataSyncStore;
  }
  get authenticationProviders() {
    return this._authenticationProviders;
  }
  get accountStatus() {
    return this._accountStatus;
  }
  get current() {
    return this._current;
  }
  updateAuthenticationProviders() {
    const oldValue = this._authenticationProviders;
    this._authenticationProviders = (this.userDataSyncStoreManagementService.userDataSyncStore?.authenticationProviders || []).filter(({ id }) => this.authenticationService.declaredProviders.some((provider) => provider.id === id));
    this.logService.trace("Settings Sync: Authentication providers updated", this._authenticationProviders.map(({ id }) => id));
    return equals(oldValue, this._authenticationProviders, (a, b) => a.id === b.id);
  }
  isSupportedAuthenticationProviderId(authenticationProviderId) {
    return this.authenticationProviders.some(({ id }) => id === authenticationProviderId);
  }
  async waitAndInitialize() {
    try {
      await Promise.all([this.extensionService.whenInstalledExtensionsRegistered(), this.userDataInitializationService.whenInitializationFinished()]);
      await this.initialize();
    } catch (error) {
      if (!this.environmentService.extensionTestsLocationURI) {
        this.logService.error(error);
      }
    }
  }
  async initialize() {
    if (isWeb) {
      const authenticationSession = await getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService);
      if (this.currentSessionId === void 0 && authenticationSession?.id) {
        if (this.environmentService.options?.settingsSyncOptions?.authenticationProvider && this.environmentService.options.settingsSyncOptions.enabled) {
          this.currentSessionId = authenticationSession.id;
        } else if (this.useWorkbenchSessionId) {
          this.currentSessionId = authenticationSession.id;
        }
        this.useWorkbenchSessionId = false;
      }
    }
    const initPromise = this.update("initialize");
    this._register(this.authenticationService.onDidChangeDeclaredProviders(() => {
      if (this.updateAuthenticationProviders()) {
        initPromise.finally(() => this.update("declared authentication providers changed"));
      }
    }));
    await initPromise;
    this._register(Event.filter(
      Event.any(
        this.authenticationService.onDidRegisterAuthenticationProvider,
        this.authenticationService.onDidUnregisterAuthenticationProvider
      ),
      (info) => this.isSupportedAuthenticationProviderId(info.id)
    )(() => this.update("authentication provider change")));
    this._register(Event.filter(this.userDataSyncAccountService.onTokenFailed, (isSuccessive) => !isSuccessive)(() => this.update("token failure")));
    this._register(Event.filter(this.authenticationService.onDidChangeSessions, (e) => this.isSupportedAuthenticationProviderId(e.providerId))(({ event }) => this.onDidChangeSessions(event)));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, UserDataSyncWorkbenchService.CACHED_SESSION_STORAGE_KEY, this._store)(() => this.onDidChangeStorage()));
    this._register(Event.filter(this.userDataSyncAccountService.onTokenFailed, (bailout) => bailout)(() => this.onDidAuthFailure()));
    this.hasConflicts.set(this.userDataSyncService.conflicts.length > 0);
    this._register(this.userDataSyncService.onDidChangeConflicts((conflicts) => {
      this.hasConflicts.set(conflicts.length > 0);
      if (!conflicts.length) {
        this.enableConflictsViewContext.reset();
      }
      this.editorService.editors.filter((input) => {
        const remoteResource = isDiffEditorInput(input) ? input.original.resource : isMergeEditorInput(input) ? input.input1.uri : void 0;
        if (remoteResource?.scheme !== USER_DATA_SYNC_SCHEME) {
          return false;
        }
        return !this.userDataSyncService.conflicts.some(({ conflicts: conflicts2 }) => conflicts2.some(({ previewResource }) => this.uriIdentityService.extUri.isEqual(previewResource, input.resource)));
      }).forEach((input) => input.dispose());
    }));
  }
  async update(reason) {
    this.logService.trace(`Settings Sync: Updating due to ${reason}`);
    this.updateAuthenticationProviders();
    await this.updateCurrentAccount();
    if (this._current) {
      this.currentAuthenticationProviderId = this._current.authenticationProviderId;
    }
    await this.updateToken(this._current);
    this.updateAccountStatus(this._current ? AccountStatus.Available : AccountStatus.Unavailable);
  }
  async updateCurrentAccount() {
    this.logService.trace("Settings Sync: Updating the current account");
    const currentSessionId = this.currentSessionId;
    const currentAuthenticationProviderId = this.currentAuthenticationProviderId;
    if (currentSessionId) {
      const authenticationProviders = currentAuthenticationProviderId ? this.authenticationProviders.filter(({ id }) => id === currentAuthenticationProviderId) : this.authenticationProviders;
      for (const { id, scopes } of authenticationProviders) {
        const sessions = await this.authenticationService.getSessions(id, scopes) || [];
        for (const session of sessions) {
          if (session.id === currentSessionId) {
            this._current = new UserDataSyncAccount(id, session);
            this.logService.trace("Settings Sync: Updated the current account", this._current.accountName);
            return;
          }
        }
      }
    }
    this._current = void 0;
  }
  async updateToken(current) {
    let value = void 0;
    if (current) {
      try {
        const token = current.token;
        value = { token, authenticationProviderId: current.authenticationProviderId };
      } catch (e) {
        this.logService.error(e);
      }
    }
    await this.userDataSyncAccountService.updateAccount(value);
  }
  updateAccountStatus(accountStatus) {
    this.logService.trace(`Settings Sync: Updating the account status to ${accountStatus}`);
    if (this._accountStatus !== accountStatus) {
      const previous = this._accountStatus;
      const logMsg = `Settings Sync: Account status changed from ${previous} to ${accountStatus}`;
      if (env.VSCODE_DEV) {
        this.logService.trace(logMsg);
      } else {
        this.logService.info(logMsg);
      }
      this._accountStatus = accountStatus;
      this.accountStatusContext.set(accountStatus);
      this._onDidChangeAccountStatus.fire(accountStatus);
    }
  }
  async turnOn() {
    if (!this.authenticationProviders.length) {
      throw new Error(localize("no authentication providers", "Settings sync cannot be turned on because there are no authentication providers available."));
    }
    if (this.userDataSyncEnablementService.isEnabled()) {
      return;
    }
    if (this.userDataSyncService.status !== SyncStatus.Idle) {
      throw new Error("Cannot turn on sync while syncing");
    }
    const picked = await this.pick();
    if (!picked) {
      throw new CancellationError();
    }
    if (this.accountStatus !== AccountStatus.Available) {
      throw new Error(localize("no account", "No account available"));
    }
    const turnOnSyncCancellationToken = this.turnOnSyncCancellationToken = new CancellationTokenSource();
    const disposable = isWeb ? Disposable.None : this.lifecycleService.onBeforeShutdown((e) => e.veto((async () => {
      const { confirmed } = await this.dialogService.confirm({
        type: "warning",
        message: localize("sync in progress", "Settings Sync is being turned on. Would you like to cancel it?"),
        title: localize("settings sync", "Settings Sync"),
        primaryButton: localize({ key: "yes", comment: ["&& denotes a mnemonic"] }, "&&Yes"),
        cancelButton: localize("no", "No")
      });
      if (confirmed) {
        turnOnSyncCancellationToken.cancel();
      }
      return !confirmed;
    })(), "veto.settingsSync"));
    try {
      await this.doTurnOnSync(turnOnSyncCancellationToken.token);
    } finally {
      disposable.dispose();
      this.turnOnSyncCancellationToken = void 0;
    }
    await this.userDataAutoSyncService.turnOn();
    if (this.userDataSyncStoreManagementService.userDataSyncStore?.canSwitch) {
      await this.synchroniseUserDataSyncStoreType();
    }
    this.currentAuthenticationProviderId = this.current?.authenticationProviderId;
    if (this.environmentService.options?.settingsSyncOptions?.enablementHandler && this.currentAuthenticationProviderId) {
      this.environmentService.options.settingsSyncOptions.enablementHandler(true, this.currentAuthenticationProviderId);
    }
    this.notificationService.info(localize("sync turned on", "{0} is turned on", SYNC_TITLE.value));
    this._onDidTurnOnSync.fire();
  }
  async turnoff(everywhere) {
    if (this.userDataSyncEnablementService.isEnabled()) {
      await this.userDataAutoSyncService.turnOff(everywhere);
      if (this.environmentService.options?.settingsSyncOptions?.enablementHandler && this.currentAuthenticationProviderId) {
        this.environmentService.options.settingsSyncOptions.enablementHandler(false, this.currentAuthenticationProviderId);
      }
    }
    if (this.turnOnSyncCancellationToken) {
      this.turnOnSyncCancellationToken.cancel();
    }
  }
  async synchroniseUserDataSyncStoreType() {
    if (!this.userDataSyncAccountService.account) {
      throw new Error("Cannot update because you are signed out from settings sync. Please sign in and try again.");
    }
    if (!isWeb || !this.userDataSyncStoreManagementService.userDataSyncStore) {
      return;
    }
    const userDataSyncStoreUrl = this.userDataSyncStoreManagementService.userDataSyncStore.type === "insiders" ? this.userDataSyncStoreManagementService.userDataSyncStore.stableUrl : this.userDataSyncStoreManagementService.userDataSyncStore.insidersUrl;
    const userDataSyncStoreClient = this.instantiationService.createInstance(UserDataSyncStoreClient, userDataSyncStoreUrl);
    userDataSyncStoreClient.setAuthToken(this.userDataSyncAccountService.account.token, this.userDataSyncAccountService.account.authenticationProviderId);
    await this.instantiationService.createInstance(UserDataSyncStoreTypeSynchronizer, userDataSyncStoreClient).sync(this.userDataSyncStoreManagementService.userDataSyncStore.type);
  }
  syncNow() {
    return this.userDataAutoSyncService.triggerSync(["Sync Now"], { immediately: true, disableCache: true });
  }
  async doTurnOnSync(token) {
    const disposables = new DisposableStore();
    const manualSyncTask = await this.userDataSyncService.createManualSyncTask();
    try {
      await this.progressService.withProgress({
        location: ProgressLocation.Window,
        title: SYNC_TITLE.value,
        command: SHOW_SYNC_LOG_COMMAND_ID,
        delay: 500
      }, async (progress) => {
        progress.report({ message: localize("turning on", "Turning on...") });
        disposables.add(this.userDataSyncService.onDidChangeStatus((status) => {
          if (status === SyncStatus.HasConflicts) {
            progress.report({ message: localize("resolving conflicts", "Resolving conflicts...") });
          } else {
            progress.report({ message: localize("syncing...", "Turning on...") });
          }
        }));
        await manualSyncTask.merge();
        if (this.userDataSyncService.status === SyncStatus.HasConflicts) {
          await this.handleConflictsWhileTurningOn(token);
        }
        await manualSyncTask.apply();
      });
    } catch (error) {
      await manualSyncTask.stop();
      throw error;
    } finally {
      disposables.dispose();
    }
  }
  async handleConflictsWhileTurningOn(token) {
    const conflicts = this.userDataSyncService.conflicts;
    const andSeparator = localize("and", " and ");
    let conflictsText = "";
    for (let i = 0; i < conflicts.length; i++) {
      if (i === conflicts.length - 1 && i !== 0) {
        conflictsText += andSeparator;
      } else if (i !== 0) {
        conflictsText += ", ";
      }
      conflictsText += getSyncAreaLabel(conflicts[i].syncResource);
    }
    const singleConflictResource = conflicts.length === 1 ? getSyncAreaLabel(conflicts[0].syncResource) : void 0;
    await this.dialogService.prompt({
      type: Severity.Warning,
      message: localize("conflicts detected", "Conflicts Detected in {0}", conflictsText),
      detail: localize("resolve", "Please resolve conflicts to turn on..."),
      buttons: [
        {
          label: localize({ key: "show conflicts", comment: ["&& denotes a mnemonic"] }, "&&Show Conflicts"),
          run: async () => {
            const waitUntilConflictsAreResolvedPromise = raceCancellationError(Event.toPromise(Event.filter(this.userDataSyncService.onDidChangeConflicts, (conficts) => conficts.length === 0)), token);
            await this.showConflicts(this.userDataSyncService.conflicts[0]?.conflicts[0]);
            await waitUntilConflictsAreResolvedPromise;
          }
        },
        {
          label: singleConflictResource ? localize({ key: "replace local single", comment: ["&& denotes a mnemonic"] }, "Accept &&Remote {0}", singleConflictResource) : localize({ key: "replace local", comment: ["&& denotes a mnemonic"] }, "Accept &&Remote"),
          run: async () => this.replace(true)
        },
        {
          label: singleConflictResource ? localize({ key: "replace remote single", comment: ["&& denotes a mnemonic"] }, "Accept &&Local {0}", singleConflictResource) : localize({ key: "replace remote", comment: ["&& denotes a mnemonic"] }, "Accept &&Local"),
          run: () => this.replace(false)
        }
      ],
      cancelButton: {
        run: () => {
          throw new CancellationError();
        }
      }
    });
  }
  async replace(local) {
    for (const conflict of this.userDataSyncService.conflicts) {
      for (const preview of conflict.conflicts) {
        await this.accept({ syncResource: conflict.syncResource, profile: conflict.profile }, local ? preview.remoteResource : preview.localResource, void 0, { force: true });
      }
    }
  }
  async accept(resource, conflictResource, content, apply) {
    return this.userDataSyncService.accept(resource, conflictResource, content, apply);
  }
  async showConflicts(conflictToOpen) {
    if (!this.userDataSyncService.conflicts.length) {
      return;
    }
    this.enableConflictsViewContext.set(true);
    const view = await this.viewsService.openView(SYNC_CONFLICTS_VIEW_ID);
    if (view && conflictToOpen) {
      await view.open(conflictToOpen);
    }
  }
  async resetSyncedData() {
    const { confirmed } = await this.dialogService.confirm({
      type: "info",
      message: localize("reset", "This will clear your data in the cloud and stop sync on all your devices."),
      title: localize("reset title", "Clear"),
      primaryButton: localize({ key: "resetButton", comment: ["&& denotes a mnemonic"] }, "&&Reset")
    });
    if (confirmed) {
      await this.userDataSyncService.resetRemote();
    }
  }
  async getAllLogResources() {
    const logsFolders = [];
    const stat = await this.fileService.resolve(this.uriIdentityService.extUri.dirname(this.environmentService.logsHome));
    if (stat.children) {
      logsFolders.push(...stat.children.filter((stat2) => stat2.isDirectory && /^\d{8}T\d{6}$/.test(stat2.name)).sort().reverse().map((d) => d.resource));
    }
    const result = [];
    for (const logFolder of logsFolders) {
      const folderStat = await this.fileService.resolve(logFolder);
      const childStat = folderStat.children?.find((stat2) => this.uriIdentityService.extUri.basename(stat2.resource).startsWith(`${USER_DATA_SYNC_LOG_ID}.`));
      if (childStat) {
        result.push(childStat.resource);
      }
    }
    return result;
  }
  async showSyncActivity() {
    this.activityViewsEnablementContext.set(true);
    await this.waitForActiveSyncViews();
    await this.viewsService.openViewContainer(SYNC_VIEW_CONTAINER_ID);
  }
  async downloadSyncActivity() {
    const result = await this.fileDialogService.showOpenDialog({
      title: localize("download sync activity dialog title", "Select folder to download Settings Sync activity"),
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: localize("download sync activity dialog open label", "Save")
    });
    if (!result?.[0]) {
      return;
    }
    return this.progressService.withProgress({ location: ProgressLocation.Window }, async () => {
      const machines = await this.userDataSyncMachinesService.getMachines();
      const currentMachine = machines.find((m) => m.isCurrent);
      const name = (currentMachine ? currentMachine.name + " - " : "") + "Settings Sync Activity";
      const stat = await this.fileService.resolve(result[0]);
      const nameRegEx = new RegExp(`${escapeRegExpCharacters(name)}\\s(\\d+)`);
      const indexes = [];
      for (const child of stat.children ?? []) {
        if (child.name === name) {
          indexes.push(0);
        } else {
          const matches = nameRegEx.exec(child.name);
          if (matches) {
            indexes.push(parseInt(matches[1]));
          }
        }
      }
      indexes.sort((a, b) => a - b);
      const folder = this.uriIdentityService.extUri.joinPath(result[0], indexes[0] !== 0 ? name : `${name} ${indexes[indexes.length - 1] + 1}`);
      await Promise.all([
        this.userDataSyncService.saveRemoteActivityData(this.uriIdentityService.extUri.joinPath(folder, "remoteActivity.json")),
        (async () => {
          const logResources = await this.getAllLogResources();
          await Promise.all(logResources.map(async (logResource) => this.fileService.copy(logResource, this.uriIdentityService.extUri.joinPath(folder, "logs", `${this.uriIdentityService.extUri.basename(this.uriIdentityService.extUri.dirname(logResource))}.log`))));
        })(),
        this.fileService.copy(this.environmentService.userDataSyncHome, this.uriIdentityService.extUri.joinPath(folder, "localActivity"))
      ]);
      return folder;
    });
  }
  async waitForActiveSyncViews() {
    const viewContainer = this.viewDescriptorService.getViewContainerById(SYNC_VIEW_CONTAINER_ID);
    if (viewContainer) {
      const model = this.viewDescriptorService.getViewContainerModel(viewContainer);
      if (!model.activeViewDescriptors.length) {
        await Event.toPromise(Event.filter(model.onDidChangeActiveViewDescriptors, (e) => model.activeViewDescriptors.length > 0));
      }
    }
  }
  async signIn() {
    const currentAuthenticationProviderId = this.currentAuthenticationProviderId;
    const authenticationProvider = currentAuthenticationProviderId ? this.authenticationProviders.find((p) => p.id === currentAuthenticationProviderId) : void 0;
    if (authenticationProvider) {
      await this.doSignIn(authenticationProvider);
    } else {
      if (!this.authenticationProviders.length) {
        throw new Error(localize("no authentication providers during signin", "Cannot sign in because there are no authentication providers available."));
      }
      await this.pick();
    }
  }
  async pick() {
    const result = await this.doPick();
    if (!result) {
      return false;
    }
    await this.doSignIn(result);
    return true;
  }
  async doPick() {
    if (this.authenticationProviders.length === 0) {
      return void 0;
    }
    const authenticationProviders = [...this.authenticationProviders].sort(({ id }) => id === this.currentAuthenticationProviderId ? -1 : 1);
    const allAccounts = /* @__PURE__ */ new Map();
    if (authenticationProviders.length === 1) {
      const accounts = await this.getAccounts(authenticationProviders[0].id, authenticationProviders[0].scopes);
      if (accounts.length) {
        allAccounts.set(authenticationProviders[0].id, accounts);
      } else {
        return authenticationProviders[0];
      }
    }
    let result;
    const disposables = new DisposableStore();
    const quickPick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    const promise = new Promise((c) => {
      disposables.add(quickPick.onDidHide(() => {
        disposables.dispose();
        c(result);
      }));
    });
    quickPick.title = SYNC_TITLE.value;
    quickPick.ok = false;
    quickPick.ignoreFocusOut = true;
    quickPick.placeholder = localize("choose account placeholder", "Select an account to sign in");
    quickPick.show();
    if (authenticationProviders.length > 1) {
      quickPick.busy = true;
      for (const { id, scopes } of authenticationProviders) {
        const accounts = await this.getAccounts(id, scopes);
        if (accounts.length) {
          allAccounts.set(id, accounts);
        }
      }
      quickPick.busy = false;
    }
    quickPick.items = this.createQuickpickItems(authenticationProviders, allAccounts);
    disposables.add(quickPick.onDidAccept(() => {
      result = quickPick.selectedItems[0]?.account ? quickPick.selectedItems[0]?.account : quickPick.selectedItems[0]?.authenticationProvider;
      quickPick.hide();
    }));
    return promise;
  }
  async getAccounts(authenticationProviderId, scopes) {
    const accounts = /* @__PURE__ */ new Map();
    let currentAccount = null;
    const sessions = await this.authenticationService.getSessions(authenticationProviderId, scopes) || [];
    for (const session of sessions) {
      const account = new UserDataSyncAccount(authenticationProviderId, session);
      accounts.set(account.accountId, account);
      if (account.sessionId === this.currentSessionId) {
        currentAccount = account;
      }
    }
    if (currentAccount) {
      accounts.set(currentAccount.accountId, currentAccount);
    }
    return currentAccount ? [...accounts.values()] : [...accounts.values()].sort(({ sessionId }) => sessionId === this.currentSessionId ? -1 : 1);
  }
  createQuickpickItems(authenticationProviders, allAccounts) {
    const quickPickItems = [];
    if (allAccounts.size) {
      quickPickItems.push({ type: "separator", label: localize("signed in", "Signed in") });
      for (const authenticationProvider of authenticationProviders) {
        const accounts = (allAccounts.get(authenticationProvider.id) || []).sort(({ sessionId }) => sessionId === this.currentSessionId ? -1 : 1);
        const providerName = this.authenticationService.getProvider(authenticationProvider.id).label;
        for (const account of accounts) {
          quickPickItems.push({
            label: `${account.accountName} (${providerName})`,
            description: account.sessionId === this.current?.sessionId ? localize("last used", "Last Used with Sync") : void 0,
            account,
            authenticationProvider
          });
        }
      }
      quickPickItems.push({ type: "separator", label: localize("others", "Others") });
    }
    for (const authenticationProvider of authenticationProviders) {
      const provider = this.authenticationService.getProvider(authenticationProvider.id);
      if (!allAccounts.has(authenticationProvider.id) || provider.supportsMultipleAccounts) {
        const providerName = provider.label;
        quickPickItems.push({ label: localize("sign in using account", "Sign in with {0}", providerName), authenticationProvider });
      }
    }
    return quickPickItems;
  }
  async doSignIn(accountOrAuthProvider) {
    let sessionId;
    if (isAuthenticationProvider(accountOrAuthProvider)) {
      if (this.environmentService.options?.settingsSyncOptions?.authenticationProvider?.id === accountOrAuthProvider.id) {
        sessionId = await this.environmentService.options?.settingsSyncOptions?.authenticationProvider?.signIn();
      } else {
        sessionId = (await this.authenticationService.createSession(accountOrAuthProvider.id, accountOrAuthProvider.scopes)).id;
      }
      this.currentAuthenticationProviderId = accountOrAuthProvider.id;
    } else {
      if (this.environmentService.options?.settingsSyncOptions?.authenticationProvider?.id === accountOrAuthProvider.authenticationProviderId) {
        sessionId = await this.environmentService.options?.settingsSyncOptions?.authenticationProvider?.signIn();
      } else {
        sessionId = accountOrAuthProvider.sessionId;
      }
      this.currentAuthenticationProviderId = accountOrAuthProvider.authenticationProviderId;
    }
    this.currentSessionId = sessionId;
    await this.update("sign in");
  }
  async onDidAuthFailure() {
    this.currentSessionId = void 0;
    await this.update("auth failure");
  }
  onDidChangeSessions(e) {
    if (this.currentSessionId && e.removed?.find((session) => session.id === this.currentSessionId)) {
      this.currentSessionId = void 0;
    }
    this.update("change in sessions");
  }
  onDidChangeStorage() {
    if (this.currentSessionId !== this.getStoredCachedSessionId()) {
      this._cachedCurrentSessionId = null;
      this.update("change in storage");
    }
  }
  get currentAuthenticationProviderId() {
    if (this._cachedCurrentAuthenticationProviderId === null) {
      this._cachedCurrentAuthenticationProviderId = this.storageService.get(UserDataSyncWorkbenchService.CACHED_AUTHENTICATION_PROVIDER_KEY, StorageScope.APPLICATION);
    }
    return this._cachedCurrentAuthenticationProviderId;
  }
  set currentAuthenticationProviderId(currentAuthenticationProviderId) {
    if (this._cachedCurrentAuthenticationProviderId !== currentAuthenticationProviderId) {
      this._cachedCurrentAuthenticationProviderId = currentAuthenticationProviderId;
      if (currentAuthenticationProviderId === void 0) {
        this.storageService.remove(UserDataSyncWorkbenchService.CACHED_AUTHENTICATION_PROVIDER_KEY, StorageScope.APPLICATION);
      } else {
        this.storageService.store(UserDataSyncWorkbenchService.CACHED_AUTHENTICATION_PROVIDER_KEY, currentAuthenticationProviderId, StorageScope.APPLICATION, StorageTarget.MACHINE);
      }
    }
  }
  get currentSessionId() {
    if (this._cachedCurrentSessionId === null) {
      this._cachedCurrentSessionId = this.getStoredCachedSessionId();
    }
    return this._cachedCurrentSessionId;
  }
  set currentSessionId(cachedSessionId) {
    if (this._cachedCurrentSessionId !== cachedSessionId) {
      this._cachedCurrentSessionId = cachedSessionId;
      if (cachedSessionId === void 0) {
        this.logService.info("Settings Sync: Reset current session");
        this.storageService.remove(UserDataSyncWorkbenchService.CACHED_SESSION_STORAGE_KEY, StorageScope.APPLICATION);
      } else {
        this.logService.info("Settings Sync: Updated current session", cachedSessionId);
        this.storageService.store(UserDataSyncWorkbenchService.CACHED_SESSION_STORAGE_KEY, cachedSessionId, StorageScope.APPLICATION, StorageTarget.MACHINE);
      }
    }
  }
  getStoredCachedSessionId() {
    return this.storageService.get(UserDataSyncWorkbenchService.CACHED_SESSION_STORAGE_KEY, StorageScope.APPLICATION);
  }
  get useWorkbenchSessionId() {
    return !this.storageService.getBoolean(UserDataSyncWorkbenchService.DONOT_USE_WORKBENCH_SESSION_STORAGE_KEY, StorageScope.APPLICATION, false);
  }
  set useWorkbenchSessionId(useWorkbenchSession) {
    this.storageService.store(UserDataSyncWorkbenchService.DONOT_USE_WORKBENCH_SESSION_STORAGE_KEY, !useWorkbenchSession, StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
};
UserDataSyncWorkbenchService.DONOT_USE_WORKBENCH_SESSION_STORAGE_KEY = "userDataSyncAccount.donotUseWorkbenchSession";
UserDataSyncWorkbenchService.CACHED_AUTHENTICATION_PROVIDER_KEY = "userDataSyncAccountProvider";
UserDataSyncWorkbenchService.CACHED_SESSION_STORAGE_KEY = "userDataSyncAccountPreference";
UserDataSyncWorkbenchService = __decorateClass([
  __decorateParam(0, IUserDataSyncService),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, IAuthenticationService),
  __decorateParam(3, IUserDataSyncAccountService),
  __decorateParam(4, IQuickInputService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IUserDataSyncEnablementService),
  __decorateParam(7, IUserDataAutoSyncService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IExtensionService),
  __decorateParam(11, IBrowserWorkbenchEnvironmentService),
  __decorateParam(12, ISecretStorageService),
  __decorateParam(13, INotificationService),
  __decorateParam(14, IProgressService),
  __decorateParam(15, IDialogService),
  __decorateParam(16, IContextKeyService),
  __decorateParam(17, IViewsService),
  __decorateParam(18, IViewDescriptorService),
  __decorateParam(19, IUserDataSyncStoreManagementService),
  __decorateParam(20, ILifecycleService),
  __decorateParam(21, IInstantiationService),
  __decorateParam(22, IEditorService),
  __decorateParam(23, IUserDataInitializationService),
  __decorateParam(24, IFileService),
  __decorateParam(25, IFileDialogService),
  __decorateParam(26, IUserDataSyncMachinesService)
], UserDataSyncWorkbenchService);
registerSingleton(
  IUserDataSyncWorkbenchService,
  UserDataSyncWorkbenchService,
  InstantiationType.Eager
  /* Eager because it initializes settings sync accounts */
);
export {
  UserDataSyncWorkbenchService,
  isMergeEditorInput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVN5bmMvYnJvd3Nlci91c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVVzZXJEYXRhU3luY1NlcnZpY2UsIElBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBpc0F1dGhlbnRpY2F0aW9uUHJvdmlkZXIsIElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsIFN5bmNTdGF0dXMsIElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgSVVzZXJEYXRhU3luY1Jlc291cmNlLCBJUmVzb3VyY2VQcmV2aWV3LCBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIFVTRVJfREFUQV9TWU5DX0xPR19JRCwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLCBJVXNlckRhdGFTeW5jQWNjb3VudCwgQWNjb3VudFN0YXR1cywgQ09OVEVYVF9TWU5DX0VOQUJMRU1FTlQsIENPTlRFWFRfU1lOQ19TVEFURSwgQ09OVEVYVF9BQ0NPVU5UX1NUQVRFLCBTSE9XX1NZTkNfTE9HX0NPTU1BTkRfSUQsIENPTlRFWFRfRU5BQkxFX0FDVElWSVRZX1ZJRVdTLCBTWU5DX1ZJRVdfQ09OVEFJTkVSX0lELCBTWU5DX1RJVExFLCBTWU5DX0NPTkZMSUNUU19WSUVXX0lELCBDT05URVhUX0VOQUJMRV9TWU5DX0NPTkZMSUNUU19WSUVXLCBDT05URVhUX0hBU19DT05GTElDVFMsIElVc2VyRGF0YVN5bmNDb25mbGljdHNWaWV3LCBnZXRTeW5jQXJlYUxhYmVsIH0gZnJvbSAnLi4vY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBnZXRDdXJyZW50QXV0aGVudGljYXRpb25TZXNzaW9uSW5mbyB9IGZyb20gJy4uLy4uL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiwgQXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50LCBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jQWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhU3luY1N0b3JlQ2xpZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFTeW5jU3RvcmVUeXBlU3luY2hyb25pemVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi9nbG9iYWxTdGF0ZVN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgaXNEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGEvYnJvd3Nlci91c2VyRGF0YUluaXQuanMnO1xuaW1wb3J0IHsgSVNlY3JldFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc2VjcmV0cy9jb21tb24vc2VjcmV0cy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jTWFjaGluZXMuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGVudiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuXG50eXBlIEFjY291bnRRdWlja1BpY2tJdGVtID0geyBsYWJlbDogc3RyaW5nOyBhdXRoZW50aWNhdGlvblByb3ZpZGVyOiBJQXV0aGVudGljYXRpb25Qcm92aWRlcjsgYWNjb3VudD86IFVzZXJEYXRhU3luY0FjY291bnQ7IGRlc2NyaXB0aW9uPzogc3RyaW5nIH07XG5cbmNsYXNzIFVzZXJEYXRhU3luY0FjY291bnQgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jQWNjb3VudCB7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgYXV0aGVudGljYXRpb25Qcm92aWRlcklkOiBzdHJpbmcsIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbjogQXV0aGVudGljYXRpb25TZXNzaW9uKSB7IH1cblxuXHRnZXQgc2Vzc2lvbklkKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLnNlc3Npb24uaWQ7IH1cblx0Z2V0IGFjY291bnROYW1lKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLnNlc3Npb24uYWNjb3VudC5sYWJlbDsgfVxuXHRnZXQgYWNjb3VudElkKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLnNlc3Npb24uYWNjb3VudC5pZDsgfVxuXHRnZXQgdG9rZW4oKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuc2Vzc2lvbi5pZFRva2VuIHx8IHRoaXMuc2Vzc2lvbi5hY2Nlc3NUb2tlbjsgfVxufVxuXG50eXBlIE1lcmdlRWRpdG9ySW5wdXQgPSB7IGJhc2U6IFVSSTsgaW5wdXQxOiB7IHVyaTogVVJJIH07IGlucHV0MjogeyB1cmk6IFVSSSB9OyByZXN1bHQ6IFVSSSB9O1xuZXhwb3J0IGZ1bmN0aW9uIGlzTWVyZ2VFZGl0b3JJbnB1dChlZGl0b3I6IHVua25vd24pOiBlZGl0b3IgaXMgTWVyZ2VFZGl0b3JJbnB1dCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IGVkaXRvciBhcyBNZXJnZUVkaXRvcklucHV0O1xuXHRyZXR1cm4gVVJJLmlzVXJpKGNhbmRpZGF0ZT8uYmFzZSkgJiYgVVJJLmlzVXJpKGNhbmRpZGF0ZT8uaW5wdXQxPy51cmkpICYmIFVSSS5pc1VyaShjYW5kaWRhdGU/LmlucHV0Mj8udXJpKSAmJiBVUkkuaXNVcmkoY2FuZGlkYXRlPy5yZXN1bHQpO1xufVxuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSB7XG5cblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc3RhdGljIERPTk9UX1VTRV9XT1JLQkVOQ0hfU0VTU0lPTl9TVE9SQUdFX0tFWSA9ICd1c2VyRGF0YVN5bmNBY2NvdW50LmRvbm90VXNlV29ya2JlbmNoU2Vzc2lvbic7XG5cdHByaXZhdGUgc3RhdGljIENBQ0hFRF9BVVRIRU5USUNBVElPTl9QUk9WSURFUl9LRVkgPSAndXNlckRhdGFTeW5jQWNjb3VudFByb3ZpZGVyJztcblx0cHJpdmF0ZSBzdGF0aWMgQ0FDSEVEX1NFU1NJT05fU1RPUkFHRV9LRVkgPSAndXNlckRhdGFTeW5jQWNjb3VudFByZWZlcmVuY2UnO1xuXG5cdGdldCBlbmFibGVkKCkgeyByZXR1cm4gISF0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UudXNlckRhdGFTeW5jU3RvcmU7IH1cblxuXHRwcml2YXRlIF9hdXRoZW50aWNhdGlvblByb3ZpZGVyczogSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXJbXSA9IFtdO1xuXHRnZXQgYXV0aGVudGljYXRpb25Qcm92aWRlcnMoKSB7IHJldHVybiB0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVyczsgfVxuXG5cdHByaXZhdGUgX2FjY291bnRTdGF0dXM6IEFjY291bnRTdGF0dXMgPSBBY2NvdW50U3RhdHVzLlVuaW5pdGlhbGl6ZWQ7XG5cdGdldCBhY2NvdW50U3RhdHVzKCk6IEFjY291bnRTdGF0dXMgeyByZXR1cm4gdGhpcy5fYWNjb3VudFN0YXR1czsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjY291bnRTdGF0dXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxBY2NvdW50U3RhdHVzPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY2NvdW50U3RhdHVzID0gdGhpcy5fb25EaWRDaGFuZ2VBY2NvdW50U3RhdHVzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVHVybk9uU3luYyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFR1cm5PblN5bmMgPSB0aGlzLl9vbkRpZFR1cm5PblN5bmMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfY3VycmVudDogVXNlckRhdGFTeW5jQWNjb3VudCB8IHVuZGVmaW5lZDtcblx0Z2V0IGN1cnJlbnQoKTogVXNlckRhdGFTeW5jQWNjb3VudCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9jdXJyZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBzeW5jRW5hYmxlbWVudENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHN5bmNTdGF0dXNDb250ZXh0OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjY291bnRTdGF0dXNDb250ZXh0OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGVuYWJsZUNvbmZsaWN0c1ZpZXdDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBoYXNDb25mbGljdHM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5Vmlld3NFbmFibGVtZW50Q29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSB0dXJuT25TeW5jQ2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFTeW5jU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1NlcnZpY2U6IElVc2VyRGF0YVN5bmNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jQWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNBY2NvdW50U2VydmljZTogSVVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFBdXRvU3luY1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YUF1dG9TeW5jU2VydmljZTogSVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElTZWNyZXRTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlY3JldFN0b3JhZ2VTZXJ2aWNlOiBJU2VjcmV0U3RvcmFnZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFJbml0aWFsaXphdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZTogSVVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc3luY0VuYWJsZW1lbnRDb250ZXh0ID0gQ09OVEVYVF9TWU5DX0VOQUJMRU1FTlQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnN5bmNTdGF0dXNDb250ZXh0ID0gQ09OVEVYVF9TWU5DX1NUQVRFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5hY2NvdW50U3RhdHVzQ29udGV4dCA9IENPTlRFWFRfQUNDT1VOVF9TVEFURS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuYWN0aXZpdHlWaWV3c0VuYWJsZW1lbnRDb250ZXh0ID0gQ09OVEVYVF9FTkFCTEVfQUNUSVZJVFlfVklFV1MuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhhc0NvbmZsaWN0cyA9IENPTlRFWFRfSEFTX0NPTkZMSUNUUy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZW5hYmxlQ29uZmxpY3RzVmlld0NvbnRleHQgPSBDT05URVhUX0VOQUJMRV9TWU5DX0NPTkZMSUNUU19WSUVXLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRpZiAodGhpcy51c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlKSB7XG5cdFx0XHR0aGlzLnN5bmNTdGF0dXNDb250ZXh0LnNldCh0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2Uuc3RhdHVzKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhU3luY1NlcnZpY2Uub25EaWRDaGFuZ2VTdGF0dXMoc3RhdHVzID0+IHRoaXMuc3luY1N0YXR1c0NvbnRleHQuc2V0KHN0YXR1cykpKTtcblx0XHRcdHRoaXMuc3luY0VuYWJsZW1lbnRDb250ZXh0LnNldCh1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVuYWJsZW1lbnQoZW5hYmxlZCA9PiB0aGlzLnN5bmNFbmFibGVtZW50Q29udGV4dC5zZXQoZW5hYmxlZCkpKTtcblxuXHRcdFx0dGhpcy53YWl0QW5kSW5pdGlhbGl6ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQXV0aGVudGljYXRpb25Qcm92aWRlcnMoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgb2xkVmFsdWUgPSB0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycztcblx0XHR0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycyA9ICh0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UudXNlckRhdGFTeW5jU3RvcmU/LmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzIHx8IFtdKS5maWx0ZXIoKHsgaWQgfSkgPT4gdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZGVjbGFyZWRQcm92aWRlcnMuc29tZShwcm92aWRlciA9PiBwcm92aWRlci5pZCA9PT0gaWQpKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1NldHRpbmdzIFN5bmM6IEF1dGhlbnRpY2F0aW9uIHByb3ZpZGVycyB1cGRhdGVkJywgdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMubWFwKCh7IGlkIH0pID0+IGlkKSk7XG5cdFx0cmV0dXJuIGVxdWFscyhvbGRWYWx1ZSwgdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMsIChhLCBiKSA9PiBhLmlkID09PSBiLmlkKTtcblx0fVxuXG5cdHByaXZhdGUgaXNTdXBwb3J0ZWRBdXRoZW50aWNhdGlvblByb3ZpZGVySWQoYXV0aGVudGljYXRpb25Qcm92aWRlcklkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5hdXRoZW50aWNhdGlvblByb3ZpZGVycy5zb21lKCh7IGlkIH0pID0+IGlkID09PSBhdXRoZW50aWNhdGlvblByb3ZpZGVySWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3YWl0QW5kSW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Lyogd2FpdCAqL1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3RoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKSwgdGhpcy51c2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZS53aGVuSW5pdGlhbGl6YXRpb25GaW5pc2hlZCgpXSk7XG5cblx0XHRcdC8qIGluaXRpYWxpemUgKi9cblx0XHRcdGF3YWl0IHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBEbyBub3QgbG9nIGlmIHRoZSBjdXJyZW50IHdpbmRvdyBpcyBydW5uaW5nIGV4dGVuc2lvbiB0ZXN0c1xuXHRcdFx0aWYgKCF0aGlzLmVudmlyb25tZW50U2VydmljZS5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0Y29uc3QgYXV0aGVudGljYXRpb25TZXNzaW9uID0gYXdhaXQgZ2V0Q3VycmVudEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8odGhpcy5zZWNyZXRTdG9yYWdlU2VydmljZSwgdGhpcy5wcm9kdWN0U2VydmljZSk7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50U2Vzc2lvbklkID09PSB1bmRlZmluZWQgJiYgYXV0aGVudGljYXRpb25TZXNzaW9uPy5pZCkge1xuXHRcdFx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8uc2V0dGluZ3NTeW5jT3B0aW9ucz8uYXV0aGVudGljYXRpb25Qcm92aWRlciAmJiB0aGlzLmVudmlyb25tZW50U2VydmljZS5vcHRpb25zLnNldHRpbmdzU3luY09wdGlvbnMuZW5hYmxlZCkge1xuXHRcdFx0XHRcdHRoaXMuY3VycmVudFNlc3Npb25JZCA9IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbi5pZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEJhY2t3YXJkIGNvbXBhdGliaWxpdHlcblx0XHRcdFx0ZWxzZSBpZiAodGhpcy51c2VXb3JrYmVuY2hTZXNzaW9uSWQpIHtcblx0XHRcdFx0XHR0aGlzLmN1cnJlbnRTZXNzaW9uSWQgPSBhdXRoZW50aWNhdGlvblNlc3Npb24uaWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy51c2VXb3JrYmVuY2hTZXNzaW9uSWQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpbml0UHJvbWlzZSA9IHRoaXMudXBkYXRlKCdpbml0aWFsaXplJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VEZWNsYXJlZFByb3ZpZGVycygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy51cGRhdGVBdXRoZW50aWNhdGlvblByb3ZpZGVycygpKSB7XG5cdFx0XHRcdC8vIFRyaWdnZXIgdXBkYXRlIG9ubHkgYWZ0ZXIgdGhlIGluaXRpYWxpemF0aW9uIGlzIGRvbmVcblx0XHRcdFx0aW5pdFByb21pc2UuZmluYWxseSgoKSA9PiB0aGlzLnVwZGF0ZSgnZGVjbGFyZWQgYXV0aGVudGljYXRpb24gcHJvdmlkZXJzIGNoYW5nZWQnKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGF3YWl0IGluaXRQcm9taXNlO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKFxuXHRcdFx0RXZlbnQuYW55KFxuXHRcdFx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZFJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcixcblx0XHRcdFx0dGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRVbnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcixcblx0XHRcdCksIGluZm8gPT4gdGhpcy5pc1N1cHBvcnRlZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZChpbmZvLmlkKSkoKCkgPT4gdGhpcy51cGRhdGUoJ2F1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIGNoYW5nZScpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy51c2VyRGF0YVN5bmNBY2NvdW50U2VydmljZS5vblRva2VuRmFpbGVkLCBpc1N1Y2Nlc3NpdmUgPT4gIWlzU3VjY2Vzc2l2ZSkoKCkgPT4gdGhpcy51cGRhdGUoJ3Rva2VuIGZhaWx1cmUnKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMsIGUgPT4gdGhpcy5pc1N1cHBvcnRlZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZChlLnByb3ZpZGVySWQpKSgoeyBldmVudCB9KSA9PiB0aGlzLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZXZlbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5DQUNIRURfU0VTU0lPTl9TVE9SQUdFX0tFWSwgdGhpcy5fc3RvcmUpKCgpID0+IHRoaXMub25EaWRDaGFuZ2VTdG9yYWdlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy51c2VyRGF0YVN5bmNBY2NvdW50U2VydmljZS5vblRva2VuRmFpbGVkLCBiYWlsb3V0ID0+IGJhaWxvdXQpKCgpID0+IHRoaXMub25EaWRBdXRoRmFpbHVyZSgpKSk7XG5cdFx0dGhpcy5oYXNDb25mbGljdHMuc2V0KHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5jb25mbGljdHMubGVuZ3RoID4gMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmxpY3RzKGNvbmZsaWN0cyA9PiB7XG5cdFx0XHR0aGlzLmhhc0NvbmZsaWN0cy5zZXQoY29uZmxpY3RzLmxlbmd0aCA+IDApO1xuXHRcdFx0aWYgKCFjb25mbGljdHMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuZW5hYmxlQ29uZmxpY3RzVmlld0NvbnRleHQucmVzZXQoKTtcblx0XHRcdH1cblx0XHRcdC8vIENsb3NlIG1lcmdlIGVkaXRvcnMgd2l0aCBubyBjb25mbGljdHNcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5lZGl0b3JzLmZpbHRlcihpbnB1dCA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlbW90ZVJlc291cmNlID0gaXNEaWZmRWRpdG9ySW5wdXQoaW5wdXQpID8gaW5wdXQub3JpZ2luYWwucmVzb3VyY2UgOiBpc01lcmdlRWRpdG9ySW5wdXQoaW5wdXQpID8gaW5wdXQuaW5wdXQxLnVyaSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHJlbW90ZVJlc291cmNlPy5zY2hlbWUgIT09IFVTRVJfREFUQV9TWU5DX1NDSEVNRSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gIXRoaXMudXNlckRhdGFTeW5jU2VydmljZS5jb25mbGljdHMuc29tZSgoeyBjb25mbGljdHMgfSkgPT4gY29uZmxpY3RzLnNvbWUoKHsgcHJldmlld1Jlc291cmNlIH0pID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHByZXZpZXdSZXNvdXJjZSwgaW5wdXQucmVzb3VyY2UpKSk7XG5cdFx0XHR9KS5mb3JFYWNoKGlucHV0ID0+IGlucHV0LmRpc3Bvc2UoKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGUocmVhc29uOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFNldHRpbmdzIFN5bmM6IFVwZGF0aW5nIGR1ZSB0byAke3JlYXNvbn1gKTtcblxuXHRcdHRoaXMudXBkYXRlQXV0aGVudGljYXRpb25Qcm92aWRlcnMoKTtcblx0XHRhd2FpdCB0aGlzLnVwZGF0ZUN1cnJlbnRBY2NvdW50KCk7XG5cblx0XHRpZiAodGhpcy5fY3VycmVudCkge1xuXHRcdFx0dGhpcy5jdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkID0gdGhpcy5fY3VycmVudC5hdXRoZW50aWNhdGlvblByb3ZpZGVySWQ7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy51cGRhdGVUb2tlbih0aGlzLl9jdXJyZW50KTtcblx0XHR0aGlzLnVwZGF0ZUFjY291bnRTdGF0dXModGhpcy5fY3VycmVudCA/IEFjY291bnRTdGF0dXMuQXZhaWxhYmxlIDogQWNjb3VudFN0YXR1cy5VbmF2YWlsYWJsZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUN1cnJlbnRBY2NvdW50KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnU2V0dGluZ3MgU3luYzogVXBkYXRpbmcgdGhlIGN1cnJlbnQgYWNjb3VudCcpO1xuXHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uSWQgPSB0aGlzLmN1cnJlbnRTZXNzaW9uSWQ7XG5cdFx0Y29uc3QgY3VycmVudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZCA9IHRoaXMuY3VycmVudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZDtcblx0XHRpZiAoY3VycmVudFNlc3Npb25JZCkge1xuXHRcdFx0Y29uc3QgYXV0aGVudGljYXRpb25Qcm92aWRlcnMgPSBjdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkID8gdGhpcy5hdXRoZW50aWNhdGlvblByb3ZpZGVycy5maWx0ZXIoKHsgaWQgfSkgPT4gaWQgPT09IGN1cnJlbnRBdXRoZW50aWNhdGlvblByb3ZpZGVySWQpIDogdGhpcy5hdXRoZW50aWNhdGlvblByb3ZpZGVycztcblx0XHRcdGZvciAoY29uc3QgeyBpZCwgc2NvcGVzIH0gb2YgYXV0aGVudGljYXRpb25Qcm92aWRlcnMpIHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSAoYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMoaWQsIHNjb3BlcykpIHx8IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdFx0XHRpZiAoc2Vzc2lvbi5pZCA9PT0gY3VycmVudFNlc3Npb25JZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fY3VycmVudCA9IG5ldyBVc2VyRGF0YVN5bmNBY2NvdW50KGlkLCBzZXNzaW9uKTtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnU2V0dGluZ3MgU3luYzogVXBkYXRlZCB0aGUgY3VycmVudCBhY2NvdW50JywgdGhpcy5fY3VycmVudC5hY2NvdW50TmFtZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnJlbnQgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZVRva2VuKGN1cnJlbnQ6IFVzZXJEYXRhU3luY0FjY291bnQgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgdmFsdWU6IHsgdG9rZW46IHN0cmluZzsgYXV0aGVudGljYXRpb25Qcm92aWRlcklkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoY3VycmVudCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdG9rZW4gPSBjdXJyZW50LnRva2VuO1xuXHRcdFx0XHR2YWx1ZSA9IHsgdG9rZW4sIGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZDogY3VycmVudC5hdXRoZW50aWNhdGlvblByb3ZpZGVySWQgfTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlLnVwZGF0ZUFjY291bnQodmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBY2NvdW50U3RhdHVzKGFjY291bnRTdGF0dXM6IEFjY291bnRTdGF0dXMpOiB2b2lkIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFNldHRpbmdzIFN5bmM6IFVwZGF0aW5nIHRoZSBhY2NvdW50IHN0YXR1cyB0byAke2FjY291bnRTdGF0dXN9YCk7XG5cdFx0aWYgKHRoaXMuX2FjY291bnRTdGF0dXMgIT09IGFjY291bnRTdGF0dXMpIHtcblx0XHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5fYWNjb3VudFN0YXR1cztcblx0XHRcdGNvbnN0IGxvZ01zZyA9IGBTZXR0aW5ncyBTeW5jOiBBY2NvdW50IHN0YXR1cyBjaGFuZ2VkIGZyb20gJHtwcmV2aW91c30gdG8gJHthY2NvdW50U3RhdHVzfWA7XG5cdFx0XHRpZiAoZW52LlZTQ09ERV9ERVYpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGxvZ01zZyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhsb2dNc2cpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9hY2NvdW50U3RhdHVzID0gYWNjb3VudFN0YXR1cztcblx0XHRcdHRoaXMuYWNjb3VudFN0YXR1c0NvbnRleHQuc2V0KGFjY291bnRTdGF0dXMpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY2NvdW50U3RhdHVzLmZpcmUoYWNjb3VudFN0YXR1cyk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdHVybk9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5hdXRoZW50aWNhdGlvblByb3ZpZGVycy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm8gYXV0aGVudGljYXRpb24gcHJvdmlkZXJzJywgXCJTZXR0aW5ncyBzeW5jIGNhbm5vdCBiZSB0dXJuZWQgb24gYmVjYXVzZSB0aGVyZSBhcmUgbm8gYXV0aGVudGljYXRpb24gcHJvdmlkZXJzIGF2YWlsYWJsZS5cIikpO1xuXHRcdH1cblx0XHRpZiAodGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLnN0YXR1cyAhPT0gU3luY1N0YXR1cy5JZGxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB0dXJuIG9uIHN5bmMgd2hpbGUgc3luY2luZycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBpY2tlZCA9IGF3YWl0IHRoaXMucGljaygpO1xuXHRcdGlmICghcGlja2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHQvLyBVc2VyIGRpZCBub3QgcGljayBhbiBhY2NvdW50IG9yIGxvZ2luIGZhaWxlZFxuXHRcdGlmICh0aGlzLmFjY291bnRTdGF0dXMgIT09IEFjY291bnRTdGF0dXMuQXZhaWxhYmxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vIGFjY291bnQnLCBcIk5vIGFjY291bnQgYXZhaWxhYmxlXCIpKTtcblx0XHR9XG5cblx0XHRjb25zdCB0dXJuT25TeW5jQ2FuY2VsbGF0aW9uVG9rZW4gPSB0aGlzLnR1cm5PblN5bmNDYW5jZWxsYXRpb25Ub2tlbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBpc1dlYiA/IERpc3Bvc2FibGUuTm9uZSA6IHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbkJlZm9yZVNodXRkb3duKGUgPT4gZS52ZXRvKChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdzeW5jIGluIHByb2dyZXNzJywgXCJTZXR0aW5ncyBTeW5jIGlzIGJlaW5nIHR1cm5lZCBvbi4gV291bGQgeW91IGxpa2UgdG8gY2FuY2VsIGl0P1wiKSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZXR0aW5ncyBzeW5jJywgXCJTZXR0aW5ncyBTeW5jXCIpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ3llcycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlllc1wiKSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiBsb2NhbGl6ZSgnbm8nLCBcIk5vXCIpXG5cdFx0XHR9KTtcblx0XHRcdGlmIChjb25maXJtZWQpIHtcblx0XHRcdFx0dHVybk9uU3luY0NhbmNlbGxhdGlvblRva2VuLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICFjb25maXJtZWQ7XG5cdFx0fSkoKSwgJ3ZldG8uc2V0dGluZ3NTeW5jJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvVHVybk9uU3luYyh0dXJuT25TeW5jQ2FuY2VsbGF0aW9uVG9rZW4udG9rZW4pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMudHVybk9uU3luY0NhbmNlbGxhdGlvblRva2VuID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLnR1cm5PbigpO1xuXG5cdFx0aWYgKHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZT8uY2FuU3dpdGNoKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnN5bmNocm9uaXNlVXNlckRhdGFTeW5jU3RvcmVUeXBlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkID0gdGhpcy5jdXJyZW50Py5hdXRoZW50aWNhdGlvblByb3ZpZGVySWQ7XG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LnNldHRpbmdzU3luY09wdGlvbnM/LmVuYWJsZW1lbnRIYW5kbGVyICYmIHRoaXMuY3VycmVudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZCkge1xuXHRcdFx0dGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucy5zZXR0aW5nc1N5bmNPcHRpb25zLmVuYWJsZW1lbnRIYW5kbGVyKHRydWUsIHRoaXMuY3VycmVudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ3N5bmMgdHVybmVkIG9uJywgXCJ7MH0gaXMgdHVybmVkIG9uXCIsIFNZTkNfVElUTEUudmFsdWUpKTtcblx0XHR0aGlzLl9vbkRpZFR1cm5PblN5bmMuZmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgdHVybm9mZihldmVyeXdoZXJlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFBdXRvU3luY1NlcnZpY2UudHVybk9mZihldmVyeXdoZXJlKTtcblx0XHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy5zZXR0aW5nc1N5bmNPcHRpb25zPy5lbmFibGVtZW50SGFuZGxlciAmJiB0aGlzLmN1cnJlbnRBdXRoZW50aWNhdGlvblByb3ZpZGVySWQpIHtcblx0XHRcdFx0dGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucy5zZXR0aW5nc1N5bmNPcHRpb25zLmVuYWJsZW1lbnRIYW5kbGVyKGZhbHNlLCB0aGlzLmN1cnJlbnRBdXRoZW50aWNhdGlvblByb3ZpZGVySWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy50dXJuT25TeW5jQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdHRoaXMudHVybk9uU3luY0NhbmNlbGxhdGlvblRva2VuLmNhbmNlbCgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN5bmNocm9uaXNlVXNlckRhdGFTeW5jU3RvcmVUeXBlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy51c2VyRGF0YVN5bmNBY2NvdW50U2VydmljZS5hY2NvdW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1cGRhdGUgYmVjYXVzZSB5b3UgYXJlIHNpZ25lZCBvdXQgZnJvbSBzZXR0aW5ncyBzeW5jLiBQbGVhc2Ugc2lnbiBpbiBhbmQgdHJ5IGFnYWluLicpO1xuXHRcdH1cblx0XHRpZiAoIWlzV2ViIHx8ICF0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UudXNlckRhdGFTeW5jU3RvcmUpIHtcblx0XHRcdC8vIE5vdCBzdXBwb3J0ZWRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB1c2VyRGF0YVN5bmNTdG9yZVVybCA9IHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZS50eXBlID09PSAnaW5zaWRlcnMnID8gdGhpcy51c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlLnN0YWJsZVVybCA6IHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZS5pbnNpZGVyc1VybDtcblx0XHRjb25zdCB1c2VyRGF0YVN5bmNTdG9yZUNsaWVudCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlckRhdGFTeW5jU3RvcmVDbGllbnQsIHVzZXJEYXRhU3luY1N0b3JlVXJsKTtcblx0XHR1c2VyRGF0YVN5bmNTdG9yZUNsaWVudC5zZXRBdXRoVG9rZW4odGhpcy51c2VyRGF0YVN5bmNBY2NvdW50U2VydmljZS5hY2NvdW50LnRva2VuLCB0aGlzLnVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlLmFjY291bnQuYXV0aGVudGljYXRpb25Qcm92aWRlcklkKTtcblx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhU3luY1N0b3JlVHlwZVN5bmNocm9uaXplciwgdXNlckRhdGFTeW5jU3RvcmVDbGllbnQpLnN5bmModGhpcy51c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlLnR5cGUpO1xuXHR9XG5cblx0c3luY05vdygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YUF1dG9TeW5jU2VydmljZS50cmlnZ2VyU3luYyhbJ1N5bmMgTm93J10sIHsgaW1tZWRpYXRlbHk6IHRydWUsIGRpc2FibGVDYWNoZTogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9UdXJuT25TeW5jKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG1hbnVhbFN5bmNUYXNrID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLmNyZWF0ZU1hbnVhbFN5bmNUYXNrKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0XHRcdFx0dGl0bGU6IFNZTkNfVElUTEUudmFsdWUsXG5cdFx0XHRcdGNvbW1hbmQ6IFNIT1dfU1lOQ19MT0dfQ09NTUFORF9JRCxcblx0XHRcdFx0ZGVsYXk6IDUwMCxcblx0XHRcdH0sIGFzeW5jIHByb2dyZXNzID0+IHtcblx0XHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ3R1cm5pbmcgb24nLCBcIlR1cm5pbmcgb24uLi5cIikgfSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2Uub25EaWRDaGFuZ2VTdGF0dXMoc3RhdHVzID0+IHtcblx0XHRcdFx0XHRpZiAoc3RhdHVzID09PSBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cykge1xuXHRcdFx0XHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ3Jlc29sdmluZyBjb25mbGljdHMnLCBcIlJlc29sdmluZyBjb25mbGljdHMuLi5cIikgfSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdzeW5jaW5nLi4uJywgXCJUdXJuaW5nIG9uLi4uXCIpIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRhd2FpdCBtYW51YWxTeW5jVGFzay5tZXJnZSgpO1xuXHRcdFx0XHRpZiAodGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLnN0YXR1cyA9PT0gU3luY1N0YXR1cy5IYXNDb25mbGljdHMpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmhhbmRsZUNvbmZsaWN0c1doaWxlVHVybmluZ09uKHRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCBtYW51YWxTeW5jVGFzay5hcHBseSgpO1xuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGF3YWl0IG1hbnVhbFN5bmNUYXNrLnN0b3AoKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVDb25mbGljdHNXaGlsZVR1cm5pbmdPbih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25mbGljdHMgPSB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UuY29uZmxpY3RzO1xuXHRcdGNvbnN0IGFuZFNlcGFyYXRvciA9IGxvY2FsaXplKCdhbmQnLCAnIGFuZCAnKTtcblx0XHRsZXQgY29uZmxpY3RzVGV4dCA9ICcnO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY29uZmxpY3RzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoaSA9PT0gY29uZmxpY3RzLmxlbmd0aCAtIDEgJiYgaSAhPT0gMCkge1xuXHRcdFx0XHRjb25mbGljdHNUZXh0ICs9IGFuZFNlcGFyYXRvcjtcblx0XHRcdH0gZWxzZSBpZiAoaSAhPT0gMCkge1xuXHRcdFx0XHRjb25mbGljdHNUZXh0ICs9ICcsICc7XG5cdFx0XHR9XG5cdFx0XHRjb25mbGljdHNUZXh0ICs9IGdldFN5bmNBcmVhTGFiZWwoY29uZmxpY3RzW2ldLnN5bmNSZXNvdXJjZSk7XG5cdFx0fVxuXHRcdGNvbnN0IHNpbmdsZUNvbmZsaWN0UmVzb3VyY2UgPSBjb25mbGljdHMubGVuZ3RoID09PSAxID8gZ2V0U3luY0FyZWFMYWJlbChjb25mbGljdHNbMF0uc3luY1Jlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmxpY3RzIGRldGVjdGVkJywgXCJDb25mbGljdHMgRGV0ZWN0ZWQgaW4gezB9XCIsIGNvbmZsaWN0c1RleHQpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgncmVzb2x2ZScsIFwiUGxlYXNlIHJlc29sdmUgY29uZmxpY3RzIHRvIHR1cm4gb24uLi5cIiksXG5cdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdzaG93IGNvbmZsaWN0cycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlNob3cgQ29uZmxpY3RzXCIpLFxuXHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3Qgd2FpdFVudGlsQ29uZmxpY3RzQXJlUmVzb2x2ZWRQcm9taXNlID0gcmFjZUNhbmNlbGxhdGlvbkVycm9yKEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIodGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmxpY3RzLCBjb25maWN0cyA9PiBjb25maWN0cy5sZW5ndGggPT09IDApKSwgdG9rZW4pO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5zaG93Q29uZmxpY3RzKHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5jb25mbGljdHNbMF0/LmNvbmZsaWN0c1swXSk7XG5cdFx0XHRcdFx0XHRhd2FpdCB3YWl0VW50aWxDb25mbGljdHNBcmVSZXNvbHZlZFByb21pc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IHNpbmdsZUNvbmZsaWN0UmVzb3VyY2UgPyBsb2NhbGl6ZSh7IGtleTogJ3JlcGxhY2UgbG9jYWwgc2luZ2xlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkFjY2VwdCAmJlJlbW90ZSB7MH1cIiwgc2luZ2xlQ29uZmxpY3RSZXNvdXJjZSkgOiBsb2NhbGl6ZSh7IGtleTogJ3JlcGxhY2UgbG9jYWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiQWNjZXB0ICYmUmVtb3RlXCIpLFxuXHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4gdGhpcy5yZXBsYWNlKHRydWUpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogc2luZ2xlQ29uZmxpY3RSZXNvdXJjZSA/IGxvY2FsaXplKHsga2V5OiAncmVwbGFjZSByZW1vdGUgc2luZ2xlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkFjY2VwdCAmJkxvY2FsIHswfVwiLCBzaW5nbGVDb25mbGljdFJlc291cmNlKSA6IGxvY2FsaXplKHsga2V5OiAncmVwbGFjZSByZW1vdGUnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiQWNjZXB0ICYmTG9jYWxcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnJlcGxhY2UoZmFsc2UpXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlcGxhY2UobG9jYWw6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IGNvbmZsaWN0IG9mIHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5jb25mbGljdHMpIHtcblx0XHRcdGZvciAoY29uc3QgcHJldmlldyBvZiBjb25mbGljdC5jb25mbGljdHMpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5hY2NlcHQoeyBzeW5jUmVzb3VyY2U6IGNvbmZsaWN0LnN5bmNSZXNvdXJjZSwgcHJvZmlsZTogY29uZmxpY3QucHJvZmlsZSB9LCBsb2NhbCA/IHByZXZpZXcucmVtb3RlUmVzb3VyY2UgOiBwcmV2aWV3LmxvY2FsUmVzb3VyY2UsIHVuZGVmaW5lZCwgeyBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBhY2NlcHQocmVzb3VyY2U6IElVc2VyRGF0YVN5bmNSZXNvdXJjZSwgY29uZmxpY3RSZXNvdXJjZTogVVJJLCBjb250ZW50OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBhcHBseTogYm9vbGVhbiB8IHsgZm9yY2U6IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UuYWNjZXB0KHJlc291cmNlLCBjb25mbGljdFJlc291cmNlLCBjb250ZW50LCBhcHBseSk7XG5cdH1cblxuXHRhc3luYyBzaG93Q29uZmxpY3RzKGNvbmZsaWN0VG9PcGVuPzogSVJlc291cmNlUHJldmlldyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLmNvbmZsaWN0cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5lbmFibGVDb25mbGljdHNWaWV3Q29udGV4dC5zZXQodHJ1ZSk7XG5cdFx0Y29uc3QgdmlldyA9IGF3YWl0IHRoaXMudmlld3NTZXJ2aWNlLm9wZW5WaWV3PElVc2VyRGF0YVN5bmNDb25mbGljdHNWaWV3PihTWU5DX0NPTkZMSUNUU19WSUVXX0lEKTtcblx0XHRpZiAodmlldyAmJiBjb25mbGljdFRvT3Blbikge1xuXHRcdFx0YXdhaXQgdmlldy5vcGVuKGNvbmZsaWN0VG9PcGVuKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXNldFN5bmNlZERhdGEoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICdpbmZvJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdyZXNldCcsIFwiVGhpcyB3aWxsIGNsZWFyIHlvdXIgZGF0YSBpbiB0aGUgY2xvdWQgYW5kIHN0b3Agc3luYyBvbiBhbGwgeW91ciBkZXZpY2VzLlwiKSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVzZXQgdGl0bGUnLCBcIkNsZWFyXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdyZXNldEJ1dHRvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlc2V0XCIpLFxuXHRcdH0pO1xuXHRcdGlmIChjb25maXJtZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5yZXNldFJlbW90ZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldEFsbExvZ1Jlc291cmNlcygpOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0Y29uc3QgbG9nc0ZvbGRlcnM6IFVSSVtdID0gW107XG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZSh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZGlybmFtZSh0aGlzLmVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSkpO1xuXHRcdGlmIChzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRsb2dzRm9sZGVycy5wdXNoKC4uLnN0YXQuY2hpbGRyZW5cblx0XHRcdFx0LmZpbHRlcihzdGF0ID0+IHN0YXQuaXNEaXJlY3RvcnkgJiYgL15cXGR7OH1UXFxkezZ9JC8udGVzdChzdGF0Lm5hbWUpKVxuXHRcdFx0XHQuc29ydCgpXG5cdFx0XHRcdC5yZXZlcnNlKClcblx0XHRcdFx0Lm1hcChkID0+IGQucmVzb3VyY2UpKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBVUklbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgbG9nRm9sZGVyIG9mIGxvZ3NGb2xkZXJzKSB7XG5cdFx0XHRjb25zdCBmb2xkZXJTdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKGxvZ0ZvbGRlcik7XG5cdFx0XHRjb25zdCBjaGlsZFN0YXQgPSBmb2xkZXJTdGF0LmNoaWxkcmVuPy5maW5kKHN0YXQgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmJhc2VuYW1lKHN0YXQucmVzb3VyY2UpLnN0YXJ0c1dpdGgoYCR7VVNFUl9EQVRBX1NZTkNfTE9HX0lEfS5gKSk7XG5cdFx0XHRpZiAoY2hpbGRTdGF0KSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGNoaWxkU3RhdC5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBzaG93U3luY0FjdGl2aXR5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuYWN0aXZpdHlWaWV3c0VuYWJsZW1lbnRDb250ZXh0LnNldCh0cnVlKTtcblx0XHRhd2FpdCB0aGlzLndhaXRGb3JBY3RpdmVTeW5jVmlld3MoKTtcblx0XHRhd2FpdCB0aGlzLnZpZXdzU2VydmljZS5vcGVuVmlld0NvbnRhaW5lcihTWU5DX1ZJRVdfQ09OVEFJTkVSX0lEKTtcblx0fVxuXG5cdGFzeW5jIGRvd25sb2FkU3luY0FjdGl2aXR5KCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2Rvd25sb2FkIHN5bmMgYWN0aXZpdHkgZGlhbG9nIHRpdGxlJywgXCJTZWxlY3QgZm9sZGVyIHRvIGRvd25sb2FkIFNldHRpbmdzIFN5bmMgYWN0aXZpdHlcIiksXG5cdFx0XHRjYW5TZWxlY3RGaWxlczogZmFsc2UsXG5cdFx0XHRjYW5TZWxlY3RGb2xkZXJzOiB0cnVlLFxuXHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRvcGVuTGFiZWw6IGxvY2FsaXplKCdkb3dubG9hZCBzeW5jIGFjdGl2aXR5IGRpYWxvZyBvcGVuIGxhYmVsJywgXCJTYXZlXCIpLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXN1bHQ/LlswXSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3cgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFjaGluZXMgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZS5nZXRNYWNoaW5lcygpO1xuXHRcdFx0Y29uc3QgY3VycmVudE1hY2hpbmUgPSBtYWNoaW5lcy5maW5kKG0gPT4gbS5pc0N1cnJlbnQpO1xuXHRcdFx0Y29uc3QgbmFtZSA9IChjdXJyZW50TWFjaGluZSA/IGN1cnJlbnRNYWNoaW5lLm5hbWUgKyAnIC0gJyA6ICcnKSArICdTZXR0aW5ncyBTeW5jIEFjdGl2aXR5Jztcblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUocmVzdWx0WzBdKTtcblxuXHRcdFx0Y29uc3QgbmFtZVJlZ0V4ID0gbmV3IFJlZ0V4cChgJHtlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKG5hbWUpfVxcXFxzKFxcXFxkKylgKTtcblx0XHRcdGNvbnN0IGluZGV4ZXM6IG51bWJlcltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHN0YXQuY2hpbGRyZW4gPz8gW10pIHtcblx0XHRcdFx0aWYgKGNoaWxkLm5hbWUgPT09IG5hbWUpIHtcblx0XHRcdFx0XHRpbmRleGVzLnB1c2goMCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2hlcyA9IG5hbWVSZWdFeC5leGVjKGNoaWxkLm5hbWUpO1xuXHRcdFx0XHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRcdFx0XHRpbmRleGVzLnB1c2gocGFyc2VJbnQobWF0Y2hlc1sxXSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aW5kZXhlcy5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG5cblx0XHRcdGNvbnN0IGZvbGRlciA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aChyZXN1bHRbMF0sIGluZGV4ZXNbMF0gIT09IDAgPyBuYW1lIDogYCR7bmFtZX0gJHtpbmRleGVzW2luZGV4ZXMubGVuZ3RoIC0gMV0gKyAxfWApO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHR0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2Uuc2F2ZVJlbW90ZUFjdGl2aXR5RGF0YSh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgoZm9sZGVyLCAncmVtb3RlQWN0aXZpdHkuanNvbicpKSxcblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBsb2dSZXNvdXJjZXMgPSBhd2FpdCB0aGlzLmdldEFsbExvZ1Jlc291cmNlcygpO1xuXHRcdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGxvZ1Jlc291cmNlcy5tYXAoYXN5bmMgbG9nUmVzb3VyY2UgPT4gdGhpcy5maWxlU2VydmljZS5jb3B5KGxvZ1Jlc291cmNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgoZm9sZGVyLCAnbG9ncycsIGAke3RoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5iYXNlbmFtZSh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZGlybmFtZShsb2dSZXNvdXJjZSkpfS5sb2dgKSkpKTtcblx0XHRcdFx0fSkoKSxcblx0XHRcdFx0dGhpcy5maWxlU2VydmljZS5jb3B5KHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aChmb2xkZXIsICdsb2NhbEFjdGl2aXR5JykpLFxuXHRcdFx0XSk7XG5cdFx0XHRyZXR1cm4gZm9sZGVyO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3YWl0Rm9yQWN0aXZlU3luY1ZpZXdzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChTWU5DX1ZJRVdfQ09OVEFJTkVSX0lEKTtcblx0XHRpZiAodmlld0NvbnRhaW5lcikge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcik7XG5cdFx0XHRpZiAoIW1vZGVsLmFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgpIHtcblx0XHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcihtb2RlbC5vbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9ycywgZSA9PiBtb2RlbC5hY3RpdmVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoID4gMCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNpZ25JbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkID0gdGhpcy5jdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkO1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgPSBjdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkID8gdGhpcy5hdXRoZW50aWNhdGlvblByb3ZpZGVycy5maW5kKHAgPT4gcC5pZCA9PT0gY3VycmVudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIpIHtcblx0XHRcdGF3YWl0IHRoaXMuZG9TaWduSW4oYXV0aGVudGljYXRpb25Qcm92aWRlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICghdGhpcy5hdXRoZW50aWNhdGlvblByb3ZpZGVycy5sZW5ndGgpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdubyBhdXRoZW50aWNhdGlvbiBwcm92aWRlcnMgZHVyaW5nIHNpZ25pbicsIFwiQ2Fubm90IHNpZ24gaW4gYmVjYXVzZSB0aGVyZSBhcmUgbm8gYXV0aGVudGljYXRpb24gcHJvdmlkZXJzIGF2YWlsYWJsZS5cIikpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5waWNrKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwaWNrKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZG9QaWNrKCk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5kb1NpZ25JbihyZXN1bHQpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1BpY2soKTogUHJvbWlzZTxVc2VyRGF0YVN5bmNBY2NvdW50IHwgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5hdXRoZW50aWNhdGlvblByb3ZpZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV0aGVudGljYXRpb25Qcm92aWRlcnMgPSBbLi4udGhpcy5hdXRoZW50aWNhdGlvblByb3ZpZGVyc10uc29ydCgoeyBpZCB9KSA9PiBpZCA9PT0gdGhpcy5jdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkID8gLTEgOiAxKTtcblx0XHRjb25zdCBhbGxBY2NvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBVc2VyRGF0YVN5bmNBY2NvdW50W10+KCk7XG5cblx0XHRpZiAoYXV0aGVudGljYXRpb25Qcm92aWRlcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBhY2NvdW50cyA9IGF3YWl0IHRoaXMuZ2V0QWNjb3VudHMoYXV0aGVudGljYXRpb25Qcm92aWRlcnNbMF0uaWQsIGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzWzBdLnNjb3Blcyk7XG5cdFx0XHRpZiAoYWNjb3VudHMubGVuZ3RoKSB7XG5cdFx0XHRcdGFsbEFjY291bnRzLnNldChhdXRoZW50aWNhdGlvblByb3ZpZGVyc1swXS5pZCwgYWNjb3VudHMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gU2luZ2xlIGF1dGggcHJvdmlkZXIgYW5kIG5vIGFjY291bnRzXG5cdFx0XHRcdHJldHVybiBhdXRoZW50aWNhdGlvblByb3ZpZGVyc1swXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0OiBVc2VyRGF0YVN5bmNBY2NvdW50IHwgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxdWlja1BpY2sgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8QWNjb3VudFF1aWNrUGlja0l0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KSk7XG5cblx0XHRjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2U8VXNlckRhdGFTeW5jQWNjb3VudCB8IElBdXRoZW50aWNhdGlvblByb3ZpZGVyIHwgdW5kZWZpbmVkPihjID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRjKHJlc3VsdCk7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHRxdWlja1BpY2sudGl0bGUgPSBTWU5DX1RJVExFLnZhbHVlO1xuXHRcdHF1aWNrUGljay5vayA9IGZhbHNlO1xuXHRcdHF1aWNrUGljay5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2Nob29zZSBhY2NvdW50IHBsYWNlaG9sZGVyJywgXCJTZWxlY3QgYW4gYWNjb3VudCB0byBzaWduIGluXCIpO1xuXHRcdHF1aWNrUGljay5zaG93KCk7XG5cblx0XHRpZiAoYXV0aGVudGljYXRpb25Qcm92aWRlcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0cXVpY2tQaWNrLmJ1c3kgPSB0cnVlO1xuXHRcdFx0Zm9yIChjb25zdCB7IGlkLCBzY29wZXMgfSBvZiBhdXRoZW50aWNhdGlvblByb3ZpZGVycykge1xuXHRcdFx0XHRjb25zdCBhY2NvdW50cyA9IGF3YWl0IHRoaXMuZ2V0QWNjb3VudHMoaWQsIHNjb3Blcyk7XG5cdFx0XHRcdGlmIChhY2NvdW50cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRhbGxBY2NvdW50cy5zZXQoaWQsIGFjY291bnRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cXVpY2tQaWNrLmJ1c3kgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRxdWlja1BpY2suaXRlbXMgPSB0aGlzLmNyZWF0ZVF1aWNrcGlja0l0ZW1zKGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLCBhbGxBY2NvdW50cyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRyZXN1bHQgPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXT8uYWNjb3VudCA/IHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdPy5hY2NvdW50IDogcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0/LmF1dGhlbnRpY2F0aW9uUHJvdmlkZXI7XG5cdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRBY2NvdW50cyhhdXRoZW50aWNhdGlvblByb3ZpZGVySWQ6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSk6IFByb21pc2U8VXNlckRhdGFTeW5jQWNjb3VudFtdPiB7XG5cdFx0Y29uc3QgYWNjb3VudHM6IE1hcDxzdHJpbmcsIFVzZXJEYXRhU3luY0FjY291bnQ+ID0gbmV3IE1hcDxzdHJpbmcsIFVzZXJEYXRhU3luY0FjY291bnQ+KCk7XG5cdFx0bGV0IGN1cnJlbnRBY2NvdW50OiBVc2VyRGF0YVN5bmNBY2NvdW50IHwgbnVsbCA9IG51bGw7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZCwgc2NvcGVzKSB8fCBbXTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGNvbnN0IGFjY291bnQ6IFVzZXJEYXRhU3luY0FjY291bnQgPSBuZXcgVXNlckRhdGFTeW5jQWNjb3VudChhdXRoZW50aWNhdGlvblByb3ZpZGVySWQsIHNlc3Npb24pO1xuXHRcdFx0YWNjb3VudHMuc2V0KGFjY291bnQuYWNjb3VudElkLCBhY2NvdW50KTtcblx0XHRcdGlmIChhY2NvdW50LnNlc3Npb25JZCA9PT0gdGhpcy5jdXJyZW50U2Vzc2lvbklkKSB7XG5cdFx0XHRcdGN1cnJlbnRBY2NvdW50ID0gYWNjb3VudDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY3VycmVudEFjY291bnQpIHtcblx0XHRcdC8vIEFsd2F5cyB1c2UgY3VycmVudCBhY2NvdW50IGlmIGF2YWlsYWJsZVxuXHRcdFx0YWNjb3VudHMuc2V0KGN1cnJlbnRBY2NvdW50LmFjY291bnRJZCwgY3VycmVudEFjY291bnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjdXJyZW50QWNjb3VudCA/IFsuLi5hY2NvdW50cy52YWx1ZXMoKV0gOiBbLi4uYWNjb3VudHMudmFsdWVzKCldLnNvcnQoKHsgc2Vzc2lvbklkIH0pID0+IHNlc3Npb25JZCA9PT0gdGhpcy5jdXJyZW50U2Vzc2lvbklkID8gLTEgOiAxKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUXVpY2twaWNrSXRlbXMoYXV0aGVudGljYXRpb25Qcm92aWRlcnM6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyW10sIGFsbEFjY291bnRzOiBNYXA8c3RyaW5nLCBVc2VyRGF0YVN5bmNBY2NvdW50W10+KTogKEFjY291bnRRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSB7XG5cdFx0Y29uc3QgcXVpY2tQaWNrSXRlbXM6IChBY2NvdW50UXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBbXTtcblxuXHRcdC8vIFNpZ25lZCBpbiBBY2NvdW50c1xuXHRcdGlmIChhbGxBY2NvdW50cy5zaXplKSB7XG5cdFx0XHRxdWlja1BpY2tJdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnc2lnbmVkIGluJywgXCJTaWduZWQgaW5cIikgfSk7XG5cdFx0XHRmb3IgKGNvbnN0IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgb2YgYXV0aGVudGljYXRpb25Qcm92aWRlcnMpIHtcblx0XHRcdFx0Y29uc3QgYWNjb3VudHMgPSAoYWxsQWNjb3VudHMuZ2V0KGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuaWQpIHx8IFtdKS5zb3J0KCh7IHNlc3Npb25JZCB9KSA9PiBzZXNzaW9uSWQgPT09IHRoaXMuY3VycmVudFNlc3Npb25JZCA/IC0xIDogMSk7XG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVyTmFtZSA9IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVyKGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuaWQpLmxhYmVsO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGFjY291bnQgb2YgYWNjb3VudHMpIHtcblx0XHRcdFx0XHRxdWlja1BpY2tJdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdGxhYmVsOiBgJHthY2NvdW50LmFjY291bnROYW1lfSAoJHtwcm92aWRlck5hbWV9KWAsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogYWNjb3VudC5zZXNzaW9uSWQgPT09IHRoaXMuY3VycmVudD8uc2Vzc2lvbklkID8gbG9jYWxpemUoJ2xhc3QgdXNlZCcsIFwiTGFzdCBVc2VkIHdpdGggU3luY1wiKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGFjY291bnQsXG5cdFx0XHRcdFx0XHRhdXRoZW50aWNhdGlvblByb3ZpZGVyLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRxdWlja1BpY2tJdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnb3RoZXJzJywgXCJPdGhlcnNcIikgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWNjb3VudCBQcm92aWRlcnNcblx0XHRmb3IgKGNvbnN0IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgb2YgYXV0aGVudGljYXRpb25Qcm92aWRlcnMpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIoYXV0aGVudGljYXRpb25Qcm92aWRlci5pZCk7XG5cdFx0XHRpZiAoIWFsbEFjY291bnRzLmhhcyhhdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkKSB8fCBwcm92aWRlci5zdXBwb3J0c011bHRpcGxlQWNjb3VudHMpIHtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXJOYW1lID0gcHJvdmlkZXIubGFiZWw7XG5cdFx0XHRcdHF1aWNrUGlja0l0ZW1zLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ3NpZ24gaW4gdXNpbmcgYWNjb3VudCcsIFwiU2lnbiBpbiB3aXRoIHswfVwiLCBwcm92aWRlck5hbWUpLCBhdXRoZW50aWNhdGlvblByb3ZpZGVyIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBxdWlja1BpY2tJdGVtcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TaWduSW4oYWNjb3VudE9yQXV0aFByb3ZpZGVyOiBVc2VyRGF0YVN5bmNBY2NvdW50IHwgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdFx0aWYgKGlzQXV0aGVudGljYXRpb25Qcm92aWRlcihhY2NvdW50T3JBdXRoUHJvdmlkZXIpKSB7XG5cdFx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8uc2V0dGluZ3NTeW5jT3B0aW9ucz8uYXV0aGVudGljYXRpb25Qcm92aWRlcj8uaWQgPT09IGFjY291bnRPckF1dGhQcm92aWRlci5pZCkge1xuXHRcdFx0XHRzZXNzaW9uSWQgPSBhd2FpdCB0aGlzLmVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy5zZXR0aW5nc1N5bmNPcHRpb25zPy5hdXRoZW50aWNhdGlvblByb3ZpZGVyPy5zaWduSW4oKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlc3Npb25JZCA9IChhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5jcmVhdGVTZXNzaW9uKGFjY291bnRPckF1dGhQcm92aWRlci5pZCwgYWNjb3VudE9yQXV0aFByb3ZpZGVyLnNjb3BlcykpLmlkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkID0gYWNjb3VudE9yQXV0aFByb3ZpZGVyLmlkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8uc2V0dGluZ3NTeW5jT3B0aW9ucz8uYXV0aGVudGljYXRpb25Qcm92aWRlcj8uaWQgPT09IGFjY291bnRPckF1dGhQcm92aWRlci5hdXRoZW50aWNhdGlvblByb3ZpZGVySWQpIHtcblx0XHRcdFx0c2Vzc2lvbklkID0gYXdhaXQgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8uc2V0dGluZ3NTeW5jT3B0aW9ucz8uYXV0aGVudGljYXRpb25Qcm92aWRlcj8uc2lnbkluKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZXNzaW9uSWQgPSBhY2NvdW50T3JBdXRoUHJvdmlkZXIuc2Vzc2lvbklkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkID0gYWNjb3VudE9yQXV0aFByb3ZpZGVyLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZDtcblx0XHR9XG5cdFx0dGhpcy5jdXJyZW50U2Vzc2lvbklkID0gc2Vzc2lvbklkO1xuXHRcdGF3YWl0IHRoaXMudXBkYXRlKCdzaWduIGluJyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkQXV0aEZhaWx1cmUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jdXJyZW50U2Vzc2lvbklkID0gdW5kZWZpbmVkO1xuXHRcdGF3YWl0IHRoaXMudXBkYXRlKCdhdXRoIGZhaWx1cmUnKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VTZXNzaW9ucyhlOiBBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jdXJyZW50U2Vzc2lvbklkICYmIGUucmVtb3ZlZD8uZmluZChzZXNzaW9uID0+IHNlc3Npb24uaWQgPT09IHRoaXMuY3VycmVudFNlc3Npb25JZCkpIHtcblx0XHRcdHRoaXMuY3VycmVudFNlc3Npb25JZCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGUoJ2NoYW5nZSBpbiBzZXNzaW9ucycpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVN0b3JhZ2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY3VycmVudFNlc3Npb25JZCAhPT0gdGhpcy5nZXRTdG9yZWRDYWNoZWRTZXNzaW9uSWQoKSAvKiBUaGlzIGNoZWNrcyBpZiBjdXJyZW50IHdpbmRvdyBjaGFuZ2VkIHRoZSB2YWx1ZSBvciBub3QgKi8pIHtcblx0XHRcdHRoaXMuX2NhY2hlZEN1cnJlbnRTZXNzaW9uSWQgPSBudWxsO1xuXHRcdFx0dGhpcy51cGRhdGUoJ2NoYW5nZSBpbiBzdG9yYWdlJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2FjaGVkQ3VycmVudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgZ2V0IGN1cnJlbnRBdXRoZW50aWNhdGlvblByb3ZpZGVySWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fY2FjaGVkQ3VycmVudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZCA9PT0gbnVsbCkge1xuXHRcdFx0dGhpcy5fY2FjaGVkQ3VycmVudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UuQ0FDSEVEX0FVVEhFTlRJQ0FUSU9OX1BST1ZJREVSX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlZEN1cnJlbnRBdXRoZW50aWNhdGlvblByb3ZpZGVySWQ7XG5cdH1cblxuXHRwcml2YXRlIHNldCBjdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkKGN1cnJlbnRBdXRoZW50aWNhdGlvblByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9jYWNoZWRDdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkICE9PSBjdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkKSB7XG5cdFx0XHR0aGlzLl9jYWNoZWRDdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkID0gY3VycmVudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZDtcblx0XHRcdGlmIChjdXJyZW50QXV0aGVudGljYXRpb25Qcm92aWRlcklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5DQUNIRURfQVVUSEVOVElDQVRJT05fUFJPVklERVJfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLkNBQ0hFRF9BVVRIRU5USUNBVElPTl9QUk9WSURFUl9LRVksIGN1cnJlbnRBdXRoZW50aWNhdGlvblByb3ZpZGVySWQsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jYWNoZWRDdXJyZW50U2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBnZXQgY3VycmVudFNlc3Npb25JZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9jYWNoZWRDdXJyZW50U2Vzc2lvbklkID09PSBudWxsKSB7XG5cdFx0XHR0aGlzLl9jYWNoZWRDdXJyZW50U2Vzc2lvbklkID0gdGhpcy5nZXRTdG9yZWRDYWNoZWRTZXNzaW9uSWQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlZEN1cnJlbnRTZXNzaW9uSWQ7XG5cdH1cblxuXHRwcml2YXRlIHNldCBjdXJyZW50U2Vzc2lvbklkKGNhY2hlZFNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuX2NhY2hlZEN1cnJlbnRTZXNzaW9uSWQgIT09IGNhY2hlZFNlc3Npb25JZCkge1xuXHRcdFx0dGhpcy5fY2FjaGVkQ3VycmVudFNlc3Npb25JZCA9IGNhY2hlZFNlc3Npb25JZDtcblx0XHRcdGlmIChjYWNoZWRTZXNzaW9uSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnU2V0dGluZ3MgU3luYzogUmVzZXQgY3VycmVudCBzZXNzaW9uJyk7XG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UuQ0FDSEVEX1NFU1NJT05fU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnU2V0dGluZ3MgU3luYzogVXBkYXRlZCBjdXJyZW50IHNlc3Npb24nLCBjYWNoZWRTZXNzaW9uSWQpO1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UuQ0FDSEVEX1NFU1NJT05fU1RPUkFHRV9LRVksIGNhY2hlZFNlc3Npb25JZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RvcmVkQ2FjaGVkU2Vzc2lvbklkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UuQ0FDSEVEX1NFU1NJT05fU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdH1cblxuXHRwcml2YXRlIGdldCB1c2VXb3JrYmVuY2hTZXNzaW9uSWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5ET05PVF9VU0VfV09SS0JFTkNIX1NFU1NJT05fU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgdXNlV29ya2JlbmNoU2Vzc2lvbklkKHVzZVdvcmtiZW5jaFNlc3Npb246IGJvb2xlYW4pIHtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UuRE9OT1RfVVNFX1dPUktCRU5DSF9TRVNTSU9OX1NUT1JBR0VfS0VZLCAhdXNlV29ya2JlbmNoU2Vzc2lvbiwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UsIFVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyIC8qIEVhZ2VyIGJlY2F1c2UgaXQgaW5pdGlhbGl6ZXMgc2V0dGluZ3Mgc3luYyBhY2NvdW50cyAqLyk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsc0JBQStDLDBCQUEwQiwwQkFBMEIscUNBQXFDLFlBQVksZ0NBQXlFLHVCQUF1Qiw2QkFBOEI7QUFDM1IsU0FBUyxtQkFBbUIseUJBQXlC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QjtBQUFBLElBQzlEO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBWSxpQkFBaUIsaUJBQXFDO0FBQ2pFLFFBQUksS0FBSyw0QkFBNEIsaUJBQWlCO0FBQ3JELFdBQUssMEJBQTBCO0FBQy9CLFVBQUksb0JBQW9CLFFBQVc7QUFDbEMsYUFBSyxXQUFXLEtBQUssc0NBQXNDO0FBQzNELGFBQUssZUFBZSxPQUFPLDZCQUE2Qiw0QkFBNEIsYUFBYSxXQUFXO0FBQUEsTUFDN0csT0FBTztBQUNOLGFBQUssV0FBVyxLQUFLLDBDQUEwQyxlQUFlO0FBQzlFLGFBQUssZUFBZSxNQUFNLDZCQUE2Qiw0QkFBNEIsaUJBQWlCLGFBQWEsYUFBYSxjQUFjLE9BQU87QUFBQSxNQUNwSjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSwyQkFBK0M7QUFDdEQsV0FBTyxLQUFLLGVBQWUsSUFBSSw2QkFBNkIsNEJBQTRCLGFBQWEsV0FBVztBQUFBLEVBQ2pIO0FBQUEsRUFFQSxJQUFZLHdCQUFpQztBQUM1QyxXQUFPLENBQUMsS0FBSyxlQUFlLFdBQVcsNkJBQTZCLHlDQUF5QyxhQUFhLGFBQWEsS0FBSztBQUFBLEVBQzdJO0FBQUEsRUFFQSxJQUFZLHNCQUFzQixxQkFBOEI7QUFDL0QsU0FBSyxlQUFlLE1BQU0sNkJBQTZCLHlDQUF5QyxDQUFDLHFCQUFxQixhQUFhLGFBQWEsY0FBYyxPQUFPO0FBQUEsRUFDdEs7QUFFRDtBQXR0QmEsNkJBSUcsMENBQTBDO0FBSjdDLDZCQUtHLHFDQUFxQztBQUx4Qyw2QkFNRyw2QkFBNkI7QUFOaEMsK0JBQU47QUFBQSxFQWtDSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0E1RFU7QUF3dEJiO0FBQUEsRUFBa0I7QUFBQSxFQUErQjtBQUFBLEVBQThCLGtCQUFrQjtBQUFBO0FBQStEOyIsCiAgIm5hbWVzIjogWyJjb25mbGljdHMiLCAic3RhdCJdCn0K
