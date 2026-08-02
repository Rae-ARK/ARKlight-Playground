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
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { createSyncHeaders } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { EDIT_SESSIONS_SIGNED_IN, EDIT_SESSION_SYNC_CATEGORY, EDIT_SESSIONS_SIGNED_IN_KEY, IEditSessionsLogService, EDIT_SESSIONS_PENDING_KEY } from "../common/editSessions.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { getCurrentAuthenticationSessionInfo } from "../../../services/authentication/browser/authenticationService.js";
import { isWeb } from "../../../../base/common/platform.js";
import { UserDataSyncMachinesService } from "../../../../platform/userDataSync/common/userDataSyncMachines.js";
import { Emitter } from "../../../../base/common/event.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
let EditSessionsWorkbenchService = class extends Disposable {
  // TODO@joyceerhl lifecycle hack
  constructor(fileService, storageService, quickInputService, authenticationService, extensionService, environmentService, logService, productService, contextKeyService, dialogService, secretStorageService) {
    super();
    this.fileService = fileService;
    this.storageService = storageService;
    this.quickInputService = quickInputService;
    this.authenticationService = authenticationService;
    this.extensionService = extensionService;
    this.environmentService = environmentService;
    this.logService = logService;
    this.productService = productService;
    this.contextKeyService = contextKeyService;
    this.dialogService = dialogService;
    this.secretStorageService = secretStorageService;
    this.SIZE_LIMIT = Math.floor(1024 * 1024 * 1.9);
    this.initialized = false;
    this._didSignIn = this._register(new Emitter());
    this._didSignOut = this._register(new Emitter());
    this._lastWrittenResources = /* @__PURE__ */ new Map();
    this._lastReadResources = /* @__PURE__ */ new Map();
    this.serverConfiguration = this.productService["editSessions.store"];
    this._register(this.authenticationService.onDidChangeSessions((e) => this.onDidChangeSessions(e.event)));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY, this._store)(() => this.onDidChangeStorage()));
    this.registerSignInAction();
    this.registerResetAuthenticationAction();
    this.signedInContext = EDIT_SESSIONS_SIGNED_IN.bindTo(this.contextKeyService);
    this.signedInContext.set(this.existingSessionId !== void 0);
  }
  get isSignedIn() {
    return this.existingSessionId !== void 0;
  }
  get onDidSignIn() {
    return this._didSignIn.event;
  }
  get onDidSignOut() {
    return this._didSignOut.event;
  }
  get lastWrittenResources() {
    return this._lastWrittenResources;
  }
  get lastReadResources() {
    return this._lastReadResources;
  }
  /**
   * @param resource: The resource to retrieve content for.
   * @param content An object representing resource state to be restored.
   * @returns The ref of the stored state.
   */
  async write(resource, content) {
    await this.initialize("write", false);
    if (!this.initialized) {
      throw new Error("Please sign in to store your edit session.");
    }
    if (typeof content !== "string" && content.machine === void 0) {
      content.machine = await this.getOrCreateCurrentMachineId();
    }
    content = typeof content === "string" ? content : JSON.stringify(content);
    const ref = await this.storeClient.writeResource(resource, content, null, void 0, createSyncHeaders(generateUuid()));
    this._lastWrittenResources.set(resource, { ref, content });
    return ref;
  }
  /**
   * @param resource: The resource to retrieve content for.
   * @param ref: A specific content ref to retrieve content for, if it exists.
   * If undefined, this method will return the latest saved edit session, if any.
   *
   * @returns An object representing the requested or latest state, if any.
   */
  async read(resource, ref) {
    await this.initialize("read", false);
    if (!this.initialized) {
      throw new Error("Please sign in to apply your latest edit session.");
    }
    let content;
    const headers = createSyncHeaders(generateUuid());
    try {
      if (ref !== void 0) {
        content = await this.storeClient?.resolveResourceContent(resource, ref, void 0, headers);
      } else {
        const result = await this.storeClient?.readResource(resource, null, void 0, headers);
        content = result?.content;
        ref = result?.ref;
      }
    } catch (ex) {
      this.logService.error(ex);
    }
    if (content !== void 0 && content !== null && ref !== void 0) {
      this._lastReadResources.set(resource, { ref, content });
      return { ref, content };
    }
    return void 0;
  }
  async delete(resource, ref) {
    await this.initialize("write", false);
    if (!this.initialized) {
      throw new Error(`Unable to delete edit session with ref ${ref}.`);
    }
    try {
      await this.storeClient?.deleteResource(resource, ref);
    } catch (ex) {
      this.logService.error(ex);
    }
  }
  async list(resource) {
    await this.initialize("read", false);
    if (!this.initialized) {
      throw new Error(`Unable to list edit sessions.`);
    }
    try {
      return this.storeClient?.getAllResourceRefs(resource) ?? [];
    } catch (ex) {
      this.logService.error(ex);
    }
    return [];
  }
  async initialize(reason, silent = false) {
    if (this.initialized) {
      return true;
    }
    this.initialized = await this.doInitialize(reason, silent);
    this.signedInContext.set(this.initialized);
    if (this.initialized) {
      this._didSignIn.fire();
    }
    return this.initialized;
  }
  /**
   *
   * Ensures that the store client is initialized,
   * meaning that authentication is configured and it
   * can be used to communicate with the remote storage service
   */
  async doInitialize(reason, silent) {
    await this.extensionService.whenInstalledExtensionsRegistered();
    if (!this.serverConfiguration?.url) {
      throw new Error("Unable to initialize sessions sync as session sync preference is not configured in product.json.");
    }
    if (this.storeClient === void 0) {
      return false;
    }
    this._register(this.storeClient.onTokenFailed(() => {
      this.logService.info("Clearing edit sessions authentication preference because of successive token failures.");
      this.clearAuthenticationPreference();
    }));
    if (this.machineClient === void 0) {
      this.machineClient = new UserDataSyncMachinesService(this.environmentService, this.fileService, this.storageService, this.storeClient, this.logService, this.productService);
    }
    if (this.authenticationInfo !== void 0) {
      return true;
    }
    const authenticationSession = await this.getAuthenticationSession(reason, silent);
    if (authenticationSession !== void 0) {
      this.authenticationInfo = authenticationSession;
      this.storeClient.setAuthToken(authenticationSession.token, authenticationSession.providerId);
    }
    return authenticationSession !== void 0;
  }
  async getMachineById(machineId) {
    await this.initialize("read", false);
    if (!this.cachedMachines) {
      const machines = await this.machineClient.getMachines();
      this.cachedMachines = machines.reduce((map, machine) => map.set(machine.id, machine.name), /* @__PURE__ */ new Map());
    }
    return this.cachedMachines.get(machineId);
  }
  async getOrCreateCurrentMachineId() {
    const currentMachineId = await this.machineClient.getMachines().then((machines) => machines.find((m) => m.isCurrent)?.id);
    if (currentMachineId === void 0) {
      await this.machineClient.addCurrentMachine();
      return await this.machineClient.getMachines().then((machines) => machines.find((m) => m.isCurrent).id);
    }
    return currentMachineId;
  }
  async getAuthenticationSession(reason, silent) {
    if (this.existingSessionId) {
      this.logService.info(`Searching for existing authentication session with ID ${this.existingSessionId}`);
      const existingSession = await this.getExistingSession();
      if (existingSession) {
        this.logService.info(`Found existing authentication session with ID ${existingSession.session.id}`);
        return { sessionId: existingSession.session.id, token: existingSession.session.idToken ?? existingSession.session.accessToken, providerId: existingSession.session.providerId };
      } else {
        this._didSignOut.fire();
      }
    }
    if (this.shouldAttemptEditSessionInit()) {
      this.logService.info(`Reusing user data sync enablement`);
      const authenticationSessionInfo = await getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService);
      if (authenticationSessionInfo !== void 0) {
        this.logService.info(`Using current authentication session with ID ${authenticationSessionInfo.id}`);
        this.existingSessionId = authenticationSessionInfo.id;
        return { sessionId: authenticationSessionInfo.id, token: authenticationSessionInfo.accessToken, providerId: authenticationSessionInfo.providerId };
      }
    }
    if (silent) {
      return;
    }
    const authenticationSession = await this.getAccountPreference(reason);
    if (authenticationSession !== void 0) {
      this.existingSessionId = authenticationSession.id;
      return { sessionId: authenticationSession.id, token: authenticationSession.idToken ?? authenticationSession.accessToken, providerId: authenticationSession.providerId };
    }
    return void 0;
  }
  shouldAttemptEditSessionInit() {
    return isWeb && this.storageService.isNew(StorageScope.APPLICATION) && this.storageService.isNew(StorageScope.WORKSPACE);
  }
  /**
   *
   * Prompts the user to pick an authentication option for storing and getting edit sessions.
   */
  async getAccountPreference(reason) {
    const disposables = new DisposableStore();
    const quickpick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    quickpick.ok = false;
    quickpick.placeholder = reason === "read" ? localize("choose account read placeholder", "Select an account to restore your working changes from the cloud") : localize("choose account placeholder", "Select an account to store your working changes in the cloud");
    quickpick.ignoreFocusOut = true;
    quickpick.items = await this.createQuickpickItems();
    return new Promise((resolve, reject) => {
      disposables.add(quickpick.onDidHide((e) => {
        reject(new CancellationError());
        disposables.dispose();
      }));
      disposables.add(quickpick.onDidAccept(async (e) => {
        const selection = quickpick.selectedItems[0];
        const session = "provider" in selection ? { ...await this.authenticationService.createSession(selection.provider.id, selection.provider.scopes), providerId: selection.provider.id } : "session" in selection ? selection.session : void 0;
        resolve(session);
        quickpick.hide();
      }));
      quickpick.show();
    });
  }
  async createQuickpickItems() {
    const options = [];
    options.push({ type: "separator", label: localize("signed in", "Signed In") });
    const sessions = await this.getAllSessions();
    options.push(...sessions);
    options.push({ type: "separator", label: localize("others", "Others") });
    for (const authenticationProvider of await this.getAuthenticationProviders()) {
      const signedInForProvider = sessions.some((account) => account.session.providerId === authenticationProvider.id);
      if (!signedInForProvider || this.authenticationService.getProvider(authenticationProvider.id).supportsMultipleAccounts) {
        const providerName = this.authenticationService.getProvider(authenticationProvider.id).label;
        options.push({ label: localize("sign in using account", "Sign in with {0}", providerName), provider: authenticationProvider });
      }
    }
    return options;
  }
  /**
   *
   * Returns all authentication sessions available from {@link getAuthenticationProviders}.
   */
  async getAllSessions() {
    const authenticationProviders = await this.getAuthenticationProviders();
    const accounts = /* @__PURE__ */ new Map();
    let currentSession;
    for (const provider of authenticationProviders) {
      const sessions = await this.authenticationService.getSessions(provider.id, provider.scopes);
      for (const session of sessions) {
        const item = {
          label: session.account.label,
          description: this.authenticationService.getProvider(provider.id).label,
          session: { ...session, providerId: provider.id }
        };
        accounts.set(item.session.account.id, item);
        if (this.existingSessionId === session.id) {
          currentSession = item;
        }
      }
    }
    if (currentSession !== void 0) {
      accounts.set(currentSession.session.account.id, currentSession);
    }
    return [...accounts.values()].sort((a, b) => a.label.localeCompare(b.label));
  }
  /**
   *
   * Returns all authentication providers which can be used to authenticate
   * to the remote storage service, based on product.json configuration
   * and registered authentication providers.
   */
  async getAuthenticationProviders() {
    if (!this.serverConfiguration) {
      throw new Error("Unable to get configured authentication providers as session sync preference is not configured in product.json.");
    }
    const authenticationProviders = this.serverConfiguration.authenticationProviders;
    const configuredAuthenticationProviders = Object.keys(authenticationProviders).reduce((result, id) => {
      result.push({ id, scopes: authenticationProviders[id].scopes });
      return result;
    }, []);
    const availableAuthenticationProviders = this.authenticationService.declaredProviders;
    return configuredAuthenticationProviders.filter(({ id }) => availableAuthenticationProviders.some((provider) => provider.id === id));
  }
  get existingSessionId() {
    return this.storageService.get(EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY, StorageScope.APPLICATION);
  }
  set existingSessionId(sessionId) {
    this.logService.trace(`Saving authentication session preference for ID ${sessionId}.`);
    if (sessionId === void 0) {
      this.storageService.remove(EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY, StorageScope.APPLICATION);
    } else {
      this.storageService.store(EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY, sessionId, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
  }
  async getExistingSession() {
    const accounts = await this.getAllSessions();
    return accounts.find((account) => account.session.id === this.existingSessionId);
  }
  async onDidChangeStorage() {
    const newSessionId = this.existingSessionId;
    const previousSessionId = this.authenticationInfo?.sessionId;
    if (previousSessionId !== newSessionId) {
      this.logService.trace(`Resetting authentication state because authentication session ID preference changed from ${previousSessionId} to ${newSessionId}.`);
      this.authenticationInfo = void 0;
      this.initialized = false;
    }
  }
  clearAuthenticationPreference() {
    this.authenticationInfo = void 0;
    this.initialized = false;
    this.existingSessionId = void 0;
    this.signedInContext.set(false);
  }
  onDidChangeSessions(e) {
    if (this.authenticationInfo?.sessionId && e.removed?.find((session) => session.id === this.authenticationInfo?.sessionId)) {
      this.clearAuthenticationPreference();
    }
  }
  registerSignInAction() {
    if (!this.serverConfiguration?.url) {
      return;
    }
    const that = this;
    const id = "workbench.editSessions.actions.signIn";
    const when = ContextKeyExpr.and(ContextKeyExpr.equals(EDIT_SESSIONS_PENDING_KEY, false), ContextKeyExpr.equals(EDIT_SESSIONS_SIGNED_IN_KEY, false));
    this._register(registerAction2(class ResetEditSessionAuthenticationAction extends Action2 {
      constructor() {
        super({
          id,
          title: localize("sign in", "Turn on Cloud Changes..."),
          category: EDIT_SESSION_SYNC_CATEGORY,
          precondition: when,
          menu: [
            {
              id: MenuId.CommandPalette
            },
            {
              id: MenuId.AccountsContext,
              group: "2_editSessions",
              when
            }
          ]
        });
      }
      async run() {
        return await that.initialize("write", false);
      }
    }));
    this._register(MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
      group: "2_editSessions",
      command: {
        id,
        title: localize("sign in badge", "Turn on Cloud Changes... (1)")
      },
      when: ContextKeyExpr.and(ContextKeyExpr.equals(EDIT_SESSIONS_PENDING_KEY, true), ContextKeyExpr.equals(EDIT_SESSIONS_SIGNED_IN_KEY, false))
    }));
  }
  registerResetAuthenticationAction() {
    const that = this;
    this._register(registerAction2(class ResetEditSessionAuthenticationAction extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.resetAuth",
          title: localize("reset auth.v3", "Turn off Cloud Changes..."),
          category: EDIT_SESSION_SYNC_CATEGORY,
          precondition: ContextKeyExpr.equals(EDIT_SESSIONS_SIGNED_IN_KEY, true),
          menu: [
            {
              id: MenuId.CommandPalette
            },
            {
              id: MenuId.AccountsContext,
              group: "2_editSessions",
              when: ContextKeyExpr.equals(EDIT_SESSIONS_SIGNED_IN_KEY, true)
            }
          ]
        });
      }
      async run() {
        const result = await that.dialogService.confirm({
          message: localize("sign out of cloud changes clear data prompt", "Do you want to disable storing working changes in the cloud?"),
          checkbox: { label: localize("delete all cloud changes", "Delete all stored data from the cloud.") }
        });
        if (result.confirmed) {
          if (result.checkboxChecked) {
            that.storeClient?.deleteResource("editSessions", null);
          }
          that.clearAuthenticationPreference();
        }
      }
    }));
  }
};
EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY = "editSessionAccountPreference";
EditSessionsWorkbenchService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IAuthenticationService),
  __decorateParam(4, IExtensionService),
  __decorateParam(5, IEnvironmentService),
  __decorateParam(6, IEditSessionsLogService),
  __decorateParam(7, IProductService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IDialogService),
  __decorateParam(10, ISecretStorageService)
], EditSessionsWorkbenchService);
export {
  EditSessionsWorkbenchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRTZXNzaW9ucy9icm93c2VyL2VkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlU3luY0hlYWRlcnMsIElBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBJUmVzb3VyY2VSZWZIYW5kbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvblNlc3Npb24sIEF1dGhlbnRpY2F0aW9uU2Vzc2lvbnNDaGFuZ2VFdmVudCwgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRURJVF9TRVNTSU9OU19TSUdORURfSU4sIEVkaXRTZXNzaW9uLCBFRElUX1NFU1NJT05fU1lOQ19DQVRFR09SWSwgSUVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLCBFRElUX1NFU1NJT05TX1NJR05FRF9JTl9LRVksIElFZGl0U2Vzc2lvbnNMb2dTZXJ2aWNlLCBTeW5jUmVzb3VyY2UsIEVESVRfU0VTU0lPTlNfUEVORElOR19LRVkgfSBmcm9tICcuLi9jb21tb24vZWRpdFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGdldEN1cnJlbnRBdXRoZW50aWNhdGlvblNlc3Npb25JbmZvIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlLCBVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luY01hY2hpbmVzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFZGl0U2Vzc2lvbnNTdG9yZUNsaWVudCB9IGZyb20gJy4uL2NvbW1vbi9lZGl0U2Vzc2lvbnNTdG9yYWdlQ2xpZW50LmpzJztcbmltcG9ydCB7IElTZWNyZXRTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NlY3JldHMvY29tbW9uL3NlY3JldHMuanMnO1xuXG50eXBlIEV4aXN0aW5nU2Vzc2lvbiA9IElRdWlja1BpY2tJdGVtICYgeyBzZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb24gJiB7IHByb3ZpZGVySWQ6IHN0cmluZyB9IH07XG50eXBlIEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJPcHRpb24gPSBJUXVpY2tQaWNrSXRlbSAmIHsgcHJvdmlkZXI6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyIH07XG5cbmV4cG9ydCBjbGFzcyBFZGl0U2Vzc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZSB7XG5cblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IFNJWkVfTElNSVQgPSBNYXRoLmZsb29yKDEwMjQgKiAxMDI0ICogMS45KTsgLy8gMiBNQlxuXG5cdHByaXZhdGUgc2VydmVyQ29uZmlndXJhdGlvbjtcblx0cHJpdmF0ZSBtYWNoaW5lQ2xpZW50OiBJVXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgYXV0aGVudGljYXRpb25JbmZvOiB7IHNlc3Npb25JZDogc3RyaW5nOyB0b2tlbjogc3RyaW5nOyBwcm92aWRlcklkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGF0aWMgQ0FDSEVEX1NFU1NJT05fU1RPUkFHRV9LRVkgPSAnZWRpdFNlc3Npb25BY2NvdW50UHJlZmVyZW5jZSc7XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNpZ25lZEluQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Z2V0IGlzU2lnbmVkSW4oKSB7XG5cdFx0cmV0dXJuIHRoaXMuZXhpc3RpbmdTZXNzaW9uSWQgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2RpZFNpZ25JbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaWRTaWduSW4oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2RpZFNpZ25Jbi5ldmVudDtcblx0fVxuXG5cdHByaXZhdGUgX2RpZFNpZ25PdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkU2lnbk91dCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZGlkU2lnbk91dC5ldmVudDtcblx0fVxuXG5cdHByaXZhdGUgX2xhc3RXcml0dGVuUmVzb3VyY2VzID0gbmV3IE1hcDxTeW5jUmVzb3VyY2UsIHsgcmVmOiBzdHJpbmc7IGNvbnRlbnQ6IHN0cmluZyB9PigpO1xuXHRnZXQgbGFzdFdyaXR0ZW5SZXNvdXJjZXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhc3RXcml0dGVuUmVzb3VyY2VzO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGFzdFJlYWRSZXNvdXJjZXMgPSBuZXcgTWFwPFN5bmNSZXNvdXJjZSwgeyByZWY6IHN0cmluZzsgY29udGVudDogc3RyaW5nIH0+KCk7XG5cdGdldCBsYXN0UmVhZFJlc291cmNlcygpIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFzdFJlYWRSZXNvdXJjZXM7XG5cdH1cblxuXHRzdG9yZUNsaWVudDogRWRpdFNlc3Npb25zU3RvcmVDbGllbnQgfCB1bmRlZmluZWQ7IC8vIFRPRE9Aam95Y2VlcmhsIGxpZmVjeWNsZSBoYWNrXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElFZGl0U2Vzc2lvbnNMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUVkaXRTZXNzaW9uc0xvZ1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElTZWNyZXRTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlY3JldFN0b3JhZ2VTZXJ2aWNlOiBJU2VjcmV0U3RvcmFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnNlcnZlckNvbmZpZ3VyYXRpb24gPSB0aGlzLnByb2R1Y3RTZXJ2aWNlWydlZGl0U2Vzc2lvbnMuc3RvcmUnXTtcblx0XHQvLyBJZiB0aGUgdXNlciBzaWducyBvdXQgb2YgdGhlIGN1cnJlbnQgc2Vzc2lvbiwgcmVzZXQgb3VyIGNhY2hlZCBhdXRoIHN0YXRlIGluIG1lbW9yeSBhbmQgb24gZGlza1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKGUpID0+IHRoaXMub25EaWRDaGFuZ2VTZXNzaW9ucyhlLmV2ZW50KSkpO1xuXG5cdFx0Ly8gSWYgYW5vdGhlciB3aW5kb3cgY2hhbmdlcyB0aGUgcHJlZmVycmVkIHNlc3Npb24gc3RvcmFnZSwgcmVzZXQgb3VyIGNhY2hlZCBhdXRoIHN0YXRlIGluIG1lbW9yeVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIEVkaXRTZXNzaW9uc1dvcmtiZW5jaFNlcnZpY2UuQ0FDSEVEX1NFU1NJT05fU1RPUkFHRV9LRVksIHRoaXMuX3N0b3JlKSgoKSA9PiB0aGlzLm9uRGlkQ2hhbmdlU3RvcmFnZSgpKSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyU2lnbkluQWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlclJlc2V0QXV0aGVudGljYXRpb25BY3Rpb24oKTtcblxuXHRcdHRoaXMuc2lnbmVkSW5Db250ZXh0ID0gRURJVF9TRVNTSU9OU19TSUdORURfSU4uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2lnbmVkSW5Db250ZXh0LnNldCh0aGlzLmV4aXN0aW5nU2Vzc2lvbklkICE9PSB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSByZXNvdXJjZTogVGhlIHJlc291cmNlIHRvIHJldHJpZXZlIGNvbnRlbnQgZm9yLlxuXHQgKiBAcGFyYW0gY29udGVudCBBbiBvYmplY3QgcmVwcmVzZW50aW5nIHJlc291cmNlIHN0YXRlIHRvIGJlIHJlc3RvcmVkLlxuXHQgKiBAcmV0dXJucyBUaGUgcmVmIG9mIHRoZSBzdG9yZWQgc3RhdGUuXG5cdCAqL1xuXHRhc3luYyB3cml0ZShyZXNvdXJjZTogU3luY1Jlc291cmNlLCBjb250ZW50OiBzdHJpbmcgfCBFZGl0U2Vzc2lvbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0YXdhaXQgdGhpcy5pbml0aWFsaXplKCd3cml0ZScsIGZhbHNlKTtcblx0XHRpZiAoIXRoaXMuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUGxlYXNlIHNpZ24gaW4gdG8gc3RvcmUgeW91ciBlZGl0IHNlc3Npb24uJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBjb250ZW50ICE9PSAnc3RyaW5nJyAmJiBjb250ZW50Lm1hY2hpbmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29udGVudC5tYWNoaW5lID0gYXdhaXQgdGhpcy5nZXRPckNyZWF0ZUN1cnJlbnRNYWNoaW5lSWQoKTtcblx0XHR9XG5cblx0XHRjb250ZW50ID0gdHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnID8gY29udGVudCA6IEpTT04uc3RyaW5naWZ5KGNvbnRlbnQpO1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuc3RvcmVDbGllbnQhLndyaXRlUmVzb3VyY2UocmVzb3VyY2UsIGNvbnRlbnQsIG51bGwsIHVuZGVmaW5lZCwgY3JlYXRlU3luY0hlYWRlcnMoZ2VuZXJhdGVVdWlkKCkpKTtcblxuXHRcdHRoaXMuX2xhc3RXcml0dGVuUmVzb3VyY2VzLnNldChyZXNvdXJjZSwgeyByZWYsIGNvbnRlbnQgfSk7XG5cblx0XHRyZXR1cm4gcmVmO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSByZXNvdXJjZTogVGhlIHJlc291cmNlIHRvIHJldHJpZXZlIGNvbnRlbnQgZm9yLlxuXHQgKiBAcGFyYW0gcmVmOiBBIHNwZWNpZmljIGNvbnRlbnQgcmVmIHRvIHJldHJpZXZlIGNvbnRlbnQgZm9yLCBpZiBpdCBleGlzdHMuXG5cdCAqIElmIHVuZGVmaW5lZCwgdGhpcyBtZXRob2Qgd2lsbCByZXR1cm4gdGhlIGxhdGVzdCBzYXZlZCBlZGl0IHNlc3Npb24sIGlmIGFueS5cblx0ICpcblx0ICogQHJldHVybnMgQW4gb2JqZWN0IHJlcHJlc2VudGluZyB0aGUgcmVxdWVzdGVkIG9yIGxhdGVzdCBzdGF0ZSwgaWYgYW55LlxuXHQgKi9cblx0YXN5bmMgcmVhZChyZXNvdXJjZTogU3luY1Jlc291cmNlLCByZWY6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8eyByZWY6IHN0cmluZzsgY29udGVudDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRhd2FpdCB0aGlzLmluaXRpYWxpemUoJ3JlYWQnLCBmYWxzZSk7XG5cdFx0aWYgKCF0aGlzLmluaXRpYWxpemVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1BsZWFzZSBzaWduIGluIHRvIGFwcGx5IHlvdXIgbGF0ZXN0IGVkaXQgc2Vzc2lvbi4nKTtcblx0XHR9XG5cblx0XHRsZXQgY29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0XHRjb25zdCBoZWFkZXJzID0gY3JlYXRlU3luY0hlYWRlcnMoZ2VuZXJhdGVVdWlkKCkpO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAocmVmICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29udGVudCA9IGF3YWl0IHRoaXMuc3RvcmVDbGllbnQ/LnJlc29sdmVSZXNvdXJjZUNvbnRlbnQocmVzb3VyY2UsIHJlZiwgdW5kZWZpbmVkLCBoZWFkZXJzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc3RvcmVDbGllbnQ/LnJlYWRSZXNvdXJjZShyZXNvdXJjZSwgbnVsbCwgdW5kZWZpbmVkLCBoZWFkZXJzKTtcblx0XHRcdFx0Y29udGVudCA9IHJlc3VsdD8uY29udGVudDtcblx0XHRcdFx0cmVmID0gcmVzdWx0Py5yZWY7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXgpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihleCk7XG5cdFx0fVxuXG5cdFx0Ly8gVE9ET0Bqb3ljZWVyaGwgVmFsaWRhdGUgc2Vzc2lvbiBkYXRhLCBjaGVjayBzY2hlbWEgdmVyc2lvblxuXHRcdGlmIChjb250ZW50ICE9PSB1bmRlZmluZWQgJiYgY29udGVudCAhPT0gbnVsbCAmJiByZWYgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbGFzdFJlYWRSZXNvdXJjZXMuc2V0KHJlc291cmNlLCB7IHJlZiwgY29udGVudCB9KTtcblx0XHRcdHJldHVybiB7IHJlZiwgY29udGVudCB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlKHJlc291cmNlOiBTeW5jUmVzb3VyY2UsIHJlZjogc3RyaW5nIHwgbnVsbCkge1xuXHRcdGF3YWl0IHRoaXMuaW5pdGlhbGl6ZSgnd3JpdGUnLCBmYWxzZSk7XG5cdFx0aWYgKCF0aGlzLmluaXRpYWxpemVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBkZWxldGUgZWRpdCBzZXNzaW9uIHdpdGggcmVmICR7cmVmfS5gKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5zdG9yZUNsaWVudD8uZGVsZXRlUmVzb3VyY2UocmVzb3VyY2UsIHJlZik7XG5cdFx0fSBjYXRjaCAoZXgpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihleCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgbGlzdChyZXNvdXJjZTogU3luY1Jlc291cmNlKTogUHJvbWlzZTxJUmVzb3VyY2VSZWZIYW5kbGVbXT4ge1xuXHRcdGF3YWl0IHRoaXMuaW5pdGlhbGl6ZSgncmVhZCcsIGZhbHNlKTtcblx0XHRpZiAoIXRoaXMuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIGxpc3QgZWRpdCBzZXNzaW9ucy5gKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc3RvcmVDbGllbnQ/LmdldEFsbFJlc291cmNlUmVmcyhyZXNvdXJjZSkgPz8gW107XG5cdFx0fSBjYXRjaCAoZXgpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihleCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGluaXRpYWxpemUocmVhc29uOiAncmVhZCcgfCAnd3JpdGUnLCBzaWxlbnQ6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRcdGlmICh0aGlzLmluaXRpYWxpemVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0dGhpcy5pbml0aWFsaXplZCA9IGF3YWl0IHRoaXMuZG9Jbml0aWFsaXplKHJlYXNvbiwgc2lsZW50KTtcblx0XHR0aGlzLnNpZ25lZEluQ29udGV4dC5zZXQodGhpcy5pbml0aWFsaXplZCk7XG5cdFx0aWYgKHRoaXMuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdHRoaXMuX2RpZFNpZ25Jbi5maXJlKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmluaXRpYWxpemVkO1xuXG5cdH1cblxuXHQvKipcblx0ICpcblx0ICogRW5zdXJlcyB0aGF0IHRoZSBzdG9yZSBjbGllbnQgaXMgaW5pdGlhbGl6ZWQsXG5cdCAqIG1lYW5pbmcgdGhhdCBhdXRoZW50aWNhdGlvbiBpcyBjb25maWd1cmVkIGFuZCBpdFxuXHQgKiBjYW4gYmUgdXNlZCB0byBjb21tdW5pY2F0ZSB3aXRoIHRoZSByZW1vdGUgc3RvcmFnZSBzZXJ2aWNlXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGRvSW5pdGlhbGl6ZShyZWFzb246ICdyZWFkJyB8ICd3cml0ZScsIHNpbGVudDogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIFdhaXQgZm9yIGF1dGhlbnRpY2F0aW9uIGV4dGVuc2lvbnMgdG8gYmUgcmVnaXN0ZXJlZFxuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblxuXHRcdGlmICghdGhpcy5zZXJ2ZXJDb25maWd1cmF0aW9uPy51cmwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5hYmxlIHRvIGluaXRpYWxpemUgc2Vzc2lvbnMgc3luYyBhcyBzZXNzaW9uIHN5bmMgcHJlZmVyZW5jZSBpcyBub3QgY29uZmlndXJlZCBpbiBwcm9kdWN0Lmpzb24uJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3RvcmVDbGllbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmVDbGllbnQub25Ub2tlbkZhaWxlZCgoKSA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnQ2xlYXJpbmcgZWRpdCBzZXNzaW9ucyBhdXRoZW50aWNhdGlvbiBwcmVmZXJlbmNlIGJlY2F1c2Ugb2Ygc3VjY2Vzc2l2ZSB0b2tlbiBmYWlsdXJlcy4nKTtcblx0XHRcdHRoaXMuY2xlYXJBdXRoZW50aWNhdGlvblByZWZlcmVuY2UoKTtcblx0XHR9KSk7XG5cblx0XHRpZiAodGhpcy5tYWNoaW5lQ2xpZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubWFjaGluZUNsaWVudCA9IG5ldyBVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMuc3RvcmFnZVNlcnZpY2UsIHRoaXMuc3RvcmVDbGllbnQsIHRoaXMubG9nU2VydmljZSwgdGhpcy5wcm9kdWN0U2VydmljZSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgYWxyZWFkeSBoYXZlIGFuIGV4aXN0aW5nIGF1dGggc2Vzc2lvbiBpbiBtZW1vcnksIHVzZSB0aGF0XG5cdFx0aWYgKHRoaXMuYXV0aGVudGljYXRpb25JbmZvICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbiA9IGF3YWl0IHRoaXMuZ2V0QXV0aGVudGljYXRpb25TZXNzaW9uKHJlYXNvbiwgc2lsZW50KTtcblx0XHRpZiAoYXV0aGVudGljYXRpb25TZXNzaW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuYXV0aGVudGljYXRpb25JbmZvID0gYXV0aGVudGljYXRpb25TZXNzaW9uO1xuXHRcdFx0dGhpcy5zdG9yZUNsaWVudC5zZXRBdXRoVG9rZW4oYXV0aGVudGljYXRpb25TZXNzaW9uLnRva2VuLCBhdXRoZW50aWNhdGlvblNlc3Npb24ucHJvdmlkZXJJZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF1dGhlbnRpY2F0aW9uU2Vzc2lvbiAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBjYWNoZWRNYWNoaW5lczogTWFwPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZDtcblxuXHRhc3luYyBnZXRNYWNoaW5lQnlJZChtYWNoaW5lSWQ6IHN0cmluZykge1xuXHRcdGF3YWl0IHRoaXMuaW5pdGlhbGl6ZSgncmVhZCcsIGZhbHNlKTtcblxuXHRcdGlmICghdGhpcy5jYWNoZWRNYWNoaW5lcykge1xuXHRcdFx0Y29uc3QgbWFjaGluZXMgPSBhd2FpdCB0aGlzLm1hY2hpbmVDbGllbnQhLmdldE1hY2hpbmVzKCk7XG5cdFx0XHR0aGlzLmNhY2hlZE1hY2hpbmVzID0gbWFjaGluZXMucmVkdWNlKChtYXAsIG1hY2hpbmUpID0+IG1hcC5zZXQobWFjaGluZS5pZCwgbWFjaGluZS5uYW1lKSwgbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY2FjaGVkTWFjaGluZXMuZ2V0KG1hY2hpbmVJZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE9yQ3JlYXRlQ3VycmVudE1hY2hpbmVJZCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGN1cnJlbnRNYWNoaW5lSWQgPSBhd2FpdCB0aGlzLm1hY2hpbmVDbGllbnQhLmdldE1hY2hpbmVzKCkudGhlbigobWFjaGluZXMpID0+IG1hY2hpbmVzLmZpbmQoKG0pID0+IG0uaXNDdXJyZW50KT8uaWQpO1xuXG5cdFx0aWYgKGN1cnJlbnRNYWNoaW5lSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5tYWNoaW5lQ2xpZW50IS5hZGRDdXJyZW50TWFjaGluZSgpO1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMubWFjaGluZUNsaWVudCEuZ2V0TWFjaGluZXMoKS50aGVuKChtYWNoaW5lcykgPT4gbWFjaGluZXMuZmluZCgobSkgPT4gbS5pc0N1cnJlbnQpIS5pZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGN1cnJlbnRNYWNoaW5lSWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEF1dGhlbnRpY2F0aW9uU2Vzc2lvbihyZWFzb246ICdyZWFkJyB8ICd3cml0ZScsIHNpbGVudDogYm9vbGVhbikge1xuXHRcdC8vIElmIHRoZSB1c2VyIHNpZ25lZCBpbiBwcmV2aW91c2x5IGFuZCB0aGUgc2Vzc2lvbiBpcyBzdGlsbCBhdmFpbGFibGUsIHJldXNlIHRoYXQgd2l0aG91dCBwcm9tcHRpbmcgdGhlIHVzZXIgYWdhaW5cblx0XHRpZiAodGhpcy5leGlzdGluZ1Nlc3Npb25JZCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFNlYXJjaGluZyBmb3IgZXhpc3RpbmcgYXV0aGVudGljYXRpb24gc2Vzc2lvbiB3aXRoIElEICR7dGhpcy5leGlzdGluZ1Nlc3Npb25JZH1gKTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nU2Vzc2lvbiA9IGF3YWl0IHRoaXMuZ2V0RXhpc3RpbmdTZXNzaW9uKCk7XG5cdFx0XHRpZiAoZXhpc3RpbmdTZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBGb3VuZCBleGlzdGluZyBhdXRoZW50aWNhdGlvbiBzZXNzaW9uIHdpdGggSUQgJHtleGlzdGluZ1Nlc3Npb24uc2Vzc2lvbi5pZH1gKTtcblx0XHRcdFx0cmV0dXJuIHsgc2Vzc2lvbklkOiBleGlzdGluZ1Nlc3Npb24uc2Vzc2lvbi5pZCwgdG9rZW46IGV4aXN0aW5nU2Vzc2lvbi5zZXNzaW9uLmlkVG9rZW4gPz8gZXhpc3RpbmdTZXNzaW9uLnNlc3Npb24uYWNjZXNzVG9rZW4sIHByb3ZpZGVySWQ6IGV4aXN0aW5nU2Vzc2lvbi5zZXNzaW9uLnByb3ZpZGVySWQgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2RpZFNpZ25PdXQuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIHNldHRpbmdzIHN5bmMgaXMgYWxyZWFkeSBlbmFibGVkLCBhdm9pZCBhc2tpbmcgYWdhaW4gdG8gYXV0aGVudGljYXRlXG5cdFx0aWYgKHRoaXMuc2hvdWxkQXR0ZW1wdEVkaXRTZXNzaW9uSW5pdCgpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgUmV1c2luZyB1c2VyIGRhdGEgc3luYyBlbmFibGVtZW50YCk7XG5cdFx0XHRjb25zdCBhdXRoZW50aWNhdGlvblNlc3Npb25JbmZvID0gYXdhaXQgZ2V0Q3VycmVudEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8odGhpcy5zZWNyZXRTdG9yYWdlU2VydmljZSwgdGhpcy5wcm9kdWN0U2VydmljZSk7XG5cdFx0XHRpZiAoYXV0aGVudGljYXRpb25TZXNzaW9uSW5mbyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBVc2luZyBjdXJyZW50IGF1dGhlbnRpY2F0aW9uIHNlc3Npb24gd2l0aCBJRCAke2F1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8uaWR9YCk7XG5cdFx0XHRcdHRoaXMuZXhpc3RpbmdTZXNzaW9uSWQgPSBhdXRoZW50aWNhdGlvblNlc3Npb25JbmZvLmlkO1xuXHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uSWQ6IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8uaWQsIHRva2VuOiBhdXRoZW50aWNhdGlvblNlc3Npb25JbmZvLmFjY2Vzc1Rva2VuLCBwcm92aWRlcklkOiBhdXRoZW50aWNhdGlvblNlc3Npb25JbmZvLnByb3ZpZGVySWQgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBhcmVuJ3Qgc3VwcG9zZWQgdG8gcHJvbXB0IHRoZSB1c2VyIGJlY2F1c2Vcblx0XHQvLyB3ZSdyZSBpbiBhIHNpbGVudCBmbG93LCBqdXN0IHJldHVybiBoZXJlXG5cdFx0aWYgKHNpbGVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFzayB0aGUgdXNlciB0byBwaWNrIGEgcHJlZmVycmVkIGFjY291bnRcblx0XHRjb25zdCBhdXRoZW50aWNhdGlvblNlc3Npb24gPSBhd2FpdCB0aGlzLmdldEFjY291bnRQcmVmZXJlbmNlKHJlYXNvbik7XG5cdFx0aWYgKGF1dGhlbnRpY2F0aW9uU2Vzc2lvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmV4aXN0aW5nU2Vzc2lvbklkID0gYXV0aGVudGljYXRpb25TZXNzaW9uLmlkO1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvbklkOiBhdXRoZW50aWNhdGlvblNlc3Npb24uaWQsIHRva2VuOiBhdXRoZW50aWNhdGlvblNlc3Npb24uaWRUb2tlbiA/PyBhdXRoZW50aWNhdGlvblNlc3Npb24uYWNjZXNzVG9rZW4sIHByb3ZpZGVySWQ6IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbi5wcm92aWRlcklkIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkQXR0ZW1wdEVkaXRTZXNzaW9uSW5pdCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNXZWIgJiYgdGhpcy5zdG9yYWdlU2VydmljZS5pc05ldyhTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pICYmIHRoaXMuc3RvcmFnZVNlcnZpY2UuaXNOZXcoU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdH1cblxuXHQvKipcblx0ICpcblx0ICogUHJvbXB0cyB0aGUgdXNlciB0byBwaWNrIGFuIGF1dGhlbnRpY2F0aW9uIG9wdGlvbiBmb3Igc3RvcmluZyBhbmQgZ2V0dGluZyBlZGl0IHNlc3Npb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBnZXRBY2NvdW50UHJlZmVyZW5jZShyZWFzb246ICdyZWFkJyB8ICd3cml0ZScpOiBQcm9taXNlPEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiAmIHsgcHJvdmlkZXJJZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxdWlja3BpY2sgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8RXhpc3RpbmdTZXNzaW9uIHwgQXV0aGVudGljYXRpb25Qcm92aWRlck9wdGlvbiB8IElRdWlja1BpY2tJdGVtPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRcdHF1aWNrcGljay5vayA9IGZhbHNlO1xuXHRcdHF1aWNrcGljay5wbGFjZWhvbGRlciA9IHJlYXNvbiA9PT0gJ3JlYWQnID8gbG9jYWxpemUoJ2Nob29zZSBhY2NvdW50IHJlYWQgcGxhY2Vob2xkZXInLCBcIlNlbGVjdCBhbiBhY2NvdW50IHRvIHJlc3RvcmUgeW91ciB3b3JraW5nIGNoYW5nZXMgZnJvbSB0aGUgY2xvdWRcIikgOiBsb2NhbGl6ZSgnY2hvb3NlIGFjY291bnQgcGxhY2Vob2xkZXInLCBcIlNlbGVjdCBhbiBhY2NvdW50IHRvIHN0b3JlIHlvdXIgd29ya2luZyBjaGFuZ2VzIGluIHRoZSBjbG91ZFwiKTtcblx0XHRxdWlja3BpY2suaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdHF1aWNrcGljay5pdGVtcyA9IGF3YWl0IHRoaXMuY3JlYXRlUXVpY2twaWNrSXRlbXMoKTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2twaWNrLm9uRGlkSGlkZSgoZSkgPT4ge1xuXHRcdFx0XHRyZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRBY2NlcHQoYXN5bmMgKGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gcXVpY2twaWNrLnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSAncHJvdmlkZXInIGluIHNlbGVjdGlvbiA/IHsgLi4uYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuY3JlYXRlU2Vzc2lvbihzZWxlY3Rpb24ucHJvdmlkZXIuaWQsIHNlbGVjdGlvbi5wcm92aWRlci5zY29wZXMpLCBwcm92aWRlcklkOiBzZWxlY3Rpb24ucHJvdmlkZXIuaWQgfSA6ICgnc2Vzc2lvbicgaW4gc2VsZWN0aW9uID8gc2VsZWN0aW9uLnNlc3Npb24gOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRyZXNvbHZlKHNlc3Npb24pO1xuXHRcdFx0XHRxdWlja3BpY2suaGlkZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRxdWlja3BpY2suc2hvdygpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVRdWlja3BpY2tJdGVtcygpOiBQcm9taXNlPChFeGlzdGluZ1Nlc3Npb24gfCBBdXRoZW50aWNhdGlvblByb3ZpZGVyT3B0aW9uIHwgSVF1aWNrUGlja1NlcGFyYXRvciB8IElRdWlja1BpY2tJdGVtICYgeyBjYW5jZWxlZEF1dGhlbnRpY2F0aW9uOiBib29sZWFuIH0pW10+IHtcblx0XHRjb25zdCBvcHRpb25zOiAoRXhpc3RpbmdTZXNzaW9uIHwgQXV0aGVudGljYXRpb25Qcm92aWRlck9wdGlvbiB8IElRdWlja1BpY2tTZXBhcmF0b3IgfCBJUXVpY2tQaWNrSXRlbSAmIHsgY2FuY2VsZWRBdXRoZW50aWNhdGlvbjogYm9vbGVhbiB9KVtdID0gW107XG5cblx0XHRvcHRpb25zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdzaWduZWQgaW4nLCBcIlNpZ25lZCBJblwiKSB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5nZXRBbGxTZXNzaW9ucygpO1xuXHRcdG9wdGlvbnMucHVzaCguLi5zZXNzaW9ucyk7XG5cblx0XHRvcHRpb25zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdvdGhlcnMnLCBcIk90aGVyc1wiKSB9KTtcblxuXHRcdGZvciAoY29uc3QgYXV0aGVudGljYXRpb25Qcm92aWRlciBvZiAoYXdhaXQgdGhpcy5nZXRBdXRoZW50aWNhdGlvblByb3ZpZGVycygpKSkge1xuXHRcdFx0Y29uc3Qgc2lnbmVkSW5Gb3JQcm92aWRlciA9IHNlc3Npb25zLnNvbWUoYWNjb3VudCA9PiBhY2NvdW50LnNlc3Npb24ucHJvdmlkZXJJZCA9PT0gYXV0aGVudGljYXRpb25Qcm92aWRlci5pZCk7XG5cdFx0XHRpZiAoIXNpZ25lZEluRm9yUHJvdmlkZXIgfHwgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIoYXV0aGVudGljYXRpb25Qcm92aWRlci5pZCkuc3VwcG9ydHNNdWx0aXBsZUFjY291bnRzKSB7XG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVyTmFtZSA9IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVyKGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuaWQpLmxhYmVsO1xuXHRcdFx0XHRvcHRpb25zLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ3NpZ24gaW4gdXNpbmcgYWNjb3VudCcsIFwiU2lnbiBpbiB3aXRoIHswfVwiLCBwcm92aWRlck5hbWUpLCBwcm92aWRlcjogYXV0aGVudGljYXRpb25Qcm92aWRlciB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gb3B0aW9ucztcblx0fVxuXG5cdC8qKlxuXHQgKlxuXHQgKiBSZXR1cm5zIGFsbCBhdXRoZW50aWNhdGlvbiBzZXNzaW9ucyBhdmFpbGFibGUgZnJvbSB7QGxpbmsgZ2V0QXV0aGVudGljYXRpb25Qcm92aWRlcnN9LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBnZXRBbGxTZXNzaW9ucygpIHtcblx0XHRjb25zdCBhdXRoZW50aWNhdGlvblByb3ZpZGVycyA9IGF3YWl0IHRoaXMuZ2V0QXV0aGVudGljYXRpb25Qcm92aWRlcnMoKTtcblx0XHRjb25zdCBhY2NvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBFeGlzdGluZ1Nlc3Npb24+KCk7XG5cdFx0bGV0IGN1cnJlbnRTZXNzaW9uOiBFeGlzdGluZ1Nlc3Npb24gfCB1bmRlZmluZWQ7XG5cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKHByb3ZpZGVyLmlkLCBwcm92aWRlci5zY29wZXMpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IHtcblx0XHRcdFx0XHRsYWJlbDogc2Vzc2lvbi5hY2NvdW50LmxhYmVsLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlci5pZCkubGFiZWwsXG5cdFx0XHRcdFx0c2Vzc2lvbjogeyAuLi5zZXNzaW9uLCBwcm92aWRlcklkOiBwcm92aWRlci5pZCB9XG5cdFx0XHRcdH07XG5cdFx0XHRcdGFjY291bnRzLnNldChpdGVtLnNlc3Npb24uYWNjb3VudC5pZCwgaXRlbSk7XG5cdFx0XHRcdGlmICh0aGlzLmV4aXN0aW5nU2Vzc2lvbklkID09PSBzZXNzaW9uLmlkKSB7XG5cdFx0XHRcdFx0Y3VycmVudFNlc3Npb24gPSBpdGVtO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGN1cnJlbnRTZXNzaW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGFjY291bnRzLnNldChjdXJyZW50U2Vzc2lvbi5zZXNzaW9uLmFjY291bnQuaWQsIGN1cnJlbnRTZXNzaW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gWy4uLmFjY291bnRzLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqXG5cdCAqIFJldHVybnMgYWxsIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVycyB3aGljaCBjYW4gYmUgdXNlZCB0byBhdXRoZW50aWNhdGVcblx0ICogdG8gdGhlIHJlbW90ZSBzdG9yYWdlIHNlcnZpY2UsIGJhc2VkIG9uIHByb2R1Y3QuanNvbiBjb25maWd1cmF0aW9uXG5cdCAqIGFuZCByZWdpc3RlcmVkIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVycy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgZ2V0QXV0aGVudGljYXRpb25Qcm92aWRlcnMoKSB7XG5cdFx0aWYgKCF0aGlzLnNlcnZlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5hYmxlIHRvIGdldCBjb25maWd1cmVkIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVycyBhcyBzZXNzaW9uIHN5bmMgcHJlZmVyZW5jZSBpcyBub3QgY29uZmlndXJlZCBpbiBwcm9kdWN0Lmpzb24uJyk7XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IHRoZSBsaXN0IG9mIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVycyBjb25maWd1cmVkIGluIHByb2R1Y3QuanNvblxuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzID0gdGhpcy5zZXJ2ZXJDb25maWd1cmF0aW9uLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRBdXRoZW50aWNhdGlvblByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzKS5yZWR1Y2U8SUF1dGhlbnRpY2F0aW9uUHJvdmlkZXJbXT4oKHJlc3VsdCwgaWQpID0+IHtcblx0XHRcdHJlc3VsdC5wdXNoKHsgaWQsIHNjb3BlczogYXV0aGVudGljYXRpb25Qcm92aWRlcnNbaWRdLnNjb3BlcyB9KTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSwgW10pO1xuXG5cdFx0Ly8gRmlsdGVyIG91dCBhbnl0aGluZyB0aGF0IGlzbid0IGN1cnJlbnRseSBhdmFpbGFibGUgdGhyb3VnaCB0aGUgYXV0aGVudGljYXRpb25TZXJ2aWNlXG5cdFx0Y29uc3QgYXZhaWxhYmxlQXV0aGVudGljYXRpb25Qcm92aWRlcnMgPSB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5kZWNsYXJlZFByb3ZpZGVycztcblxuXHRcdHJldHVybiBjb25maWd1cmVkQXV0aGVudGljYXRpb25Qcm92aWRlcnMuZmlsdGVyKCh7IGlkIH0pID0+IGF2YWlsYWJsZUF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4gcHJvdmlkZXIuaWQgPT09IGlkKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBleGlzdGluZ1Nlc3Npb25JZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoRWRpdFNlc3Npb25zV29ya2JlbmNoU2VydmljZS5DQUNIRURfU0VTU0lPTl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0IGV4aXN0aW5nU2Vzc2lvbklkKHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBTYXZpbmcgYXV0aGVudGljYXRpb24gc2Vzc2lvbiBwcmVmZXJlbmNlIGZvciBJRCAke3Nlc3Npb25JZH0uYCk7XG5cdFx0aWYgKHNlc3Npb25JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShFZGl0U2Vzc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLkNBQ0hFRF9TRVNTSU9OX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEVkaXRTZXNzaW9uc1dvcmtiZW5jaFNlcnZpY2UuQ0FDSEVEX1NFU1NJT05fU1RPUkFHRV9LRVksIHNlc3Npb25JZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RXhpc3RpbmdTZXNzaW9uKCkge1xuXHRcdGNvbnN0IGFjY291bnRzID0gYXdhaXQgdGhpcy5nZXRBbGxTZXNzaW9ucygpO1xuXHRcdHJldHVybiBhY2NvdW50cy5maW5kKChhY2NvdW50KSA9PiBhY2NvdW50LnNlc3Npb24uaWQgPT09IHRoaXMuZXhpc3RpbmdTZXNzaW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZENoYW5nZVN0b3JhZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbklkID0gdGhpcy5leGlzdGluZ1Nlc3Npb25JZDtcblx0XHRjb25zdCBwcmV2aW91c1Nlc3Npb25JZCA9IHRoaXMuYXV0aGVudGljYXRpb25JbmZvPy5zZXNzaW9uSWQ7XG5cblx0XHRpZiAocHJldmlvdXNTZXNzaW9uSWQgIT09IG5ld1Nlc3Npb25JZCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBSZXNldHRpbmcgYXV0aGVudGljYXRpb24gc3RhdGUgYmVjYXVzZSBhdXRoZW50aWNhdGlvbiBzZXNzaW9uIElEIHByZWZlcmVuY2UgY2hhbmdlZCBmcm9tICR7cHJldmlvdXNTZXNzaW9uSWR9IHRvICR7bmV3U2Vzc2lvbklkfS5gKTtcblx0XHRcdHRoaXMuYXV0aGVudGljYXRpb25JbmZvID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5pbml0aWFsaXplZCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xlYXJBdXRoZW50aWNhdGlvblByZWZlcmVuY2UoKTogdm9pZCB7XG5cdFx0dGhpcy5hdXRoZW50aWNhdGlvbkluZm8gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5pbml0aWFsaXplZCA9IGZhbHNlO1xuXHRcdHRoaXMuZXhpc3RpbmdTZXNzaW9uSWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5zaWduZWRJbkNvbnRleHQuc2V0KGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VTZXNzaW9ucyhlOiBBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5hdXRoZW50aWNhdGlvbkluZm8/LnNlc3Npb25JZCAmJiBlLnJlbW92ZWQ/LmZpbmQoc2Vzc2lvbiA9PiBzZXNzaW9uLmlkID09PSB0aGlzLmF1dGhlbnRpY2F0aW9uSW5mbz8uc2Vzc2lvbklkKSkge1xuXHRcdFx0dGhpcy5jbGVhckF1dGhlbnRpY2F0aW9uUHJlZmVyZW5jZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJTaWduSW5BY3Rpb24oKSB7XG5cdFx0aWYgKCF0aGlzLnNlcnZlckNvbmZpZ3VyYXRpb24/LnVybCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCBpZCA9ICd3b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMuc2lnbkluJztcblx0XHRjb25zdCB3aGVuID0gQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscyhFRElUX1NFU1NJT05TX1BFTkRJTkdfS0VZLCBmYWxzZSksIENvbnRleHRLZXlFeHByLmVxdWFscyhFRElUX1NFU1NJT05TX1NJR05FRF9JTl9LRVksIGZhbHNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlc2V0RWRpdFNlc3Npb25BdXRoZW50aWNhdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NpZ24gaW4nLCAnVHVybiBvbiBDbG91ZCBDaGFuZ2VzLi4uJyksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IEVESVRfU0VTU0lPTl9TWU5DX0NBVEVHT1JZLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogd2hlbixcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQWNjb3VudHNDb250ZXh0LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcyX2VkaXRTZXNzaW9ucycsXG5cdFx0XHRcdFx0XHR3aGVuLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oKSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGF0LmluaXRpYWxpemUoJ3dyaXRlJywgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQWNjb3VudHNDb250ZXh0LCB7XG5cdFx0XHRncm91cDogJzJfZWRpdFNlc3Npb25zJyxcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2lnbiBpbiBiYWRnZScsICdUdXJuIG9uIENsb3VkIENoYW5nZXMuLi4gKDEpJyksXG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscyhFRElUX1NFU1NJT05TX1BFTkRJTkdfS0VZLCB0cnVlKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKEVESVRfU0VTU0lPTlNfU0lHTkVEX0lOX0tFWSwgZmFsc2UpKVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJSZXNldEF1dGhlbnRpY2F0aW9uQWN0aW9uKCkge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBSZXNldEVkaXRTZXNzaW9uQXV0aGVudGljYXRpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMucmVzZXRBdXRoJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Jlc2V0IGF1dGgudjMnLCAnVHVybiBvZmYgQ2xvdWQgQ2hhbmdlcy4uLicpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBFRElUX1NFU1NJT05fU1lOQ19DQVRFR09SWSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscyhFRElUX1NFU1NJT05TX1NJR05FRF9JTl9LRVksIHRydWUpLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5BY2NvdW50c0NvbnRleHQsXG5cdFx0XHRcdFx0XHRncm91cDogJzJfZWRpdFNlc3Npb25zJyxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscyhFRElUX1NFU1NJT05TX1NJR05FRF9JTl9LRVksIHRydWUpLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoYXQuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnc2lnbiBvdXQgb2YgY2xvdWQgY2hhbmdlcyBjbGVhciBkYXRhIHByb21wdCcsICdEbyB5b3Ugd2FudCB0byBkaXNhYmxlIHN0b3Jpbmcgd29ya2luZyBjaGFuZ2VzIGluIHRoZSBjbG91ZD8nKSxcblx0XHRcdFx0XHRjaGVja2JveDogeyBsYWJlbDogbG9jYWxpemUoJ2RlbGV0ZSBhbGwgY2xvdWQgY2hhbmdlcycsICdEZWxldGUgYWxsIHN0b3JlZCBkYXRhIGZyb20gdGhlIGNsb3VkLicpIH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0aWYgKHJlc3VsdC5jaGVja2JveENoZWNrZWQpIHtcblx0XHRcdFx0XHRcdHRoYXQuc3RvcmVDbGllbnQ/LmRlbGV0ZVJlc291cmNlKCdlZGl0U2Vzc2lvbnMnLCBudWxsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhhdC5jbGVhckF1dGhlbnRpY2F0aW9uUHJlZmVyZW5jZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLFFBQVEsY0FBYyx1QkFBdUI7QUFDL0QsU0FBUyxnQkFBNkIsMEJBQTBCO0FBQ2hFLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQStEO0FBQ3hFLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMseUJBQXNFO0FBQy9FLFNBQW1FLDhCQUE4QjtBQUNqRyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUFzQyw0QkFBeUQsNkJBQTZCLHlCQUF1QyxpQ0FBaUM7QUFDN00sU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyxhQUFhO0FBQ3RCLFNBQXVD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
