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
import { Disposable, DisposableStore, dispose, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { scopesMatch } from "../../../../base/common/oauth.js";
import * as nls from "../../../../nls.js";
import { MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { Severity } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IActivityService, NumberBadge } from "../../activity/common/activity.js";
import { IAuthenticationAccessService } from "./authenticationAccessService.js";
import { IAuthenticationUsageService } from "./authenticationUsageService.js";
import { IAuthenticationService, IAuthenticationExtensionsService, isAuthenticationWwwAuthenticateRequest } from "../common/authentication.js";
import { Emitter } from "../../../../base/common/event.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
const SCOPESLIST_SEPARATOR = " ";
let AuthenticationExtensionsService = class extends Disposable {
  constructor(activityService, storageService, dialogService, quickInputService, _productService, _authenticationService, _authenticationUsageService, _authenticationAccessService) {
    super();
    this.activityService = activityService;
    this.storageService = storageService;
    this.dialogService = dialogService;
    this.quickInputService = quickInputService;
    this._productService = _productService;
    this._authenticationService = _authenticationService;
    this._authenticationUsageService = _authenticationUsageService;
    this._authenticationAccessService = _authenticationAccessService;
    this._signInRequestItems = /* @__PURE__ */ new Map();
    this._sessionAccessRequestItems = /* @__PURE__ */ new Map();
    this._accountBadgeDisposable = this._register(new MutableDisposable());
    this._onDidAccountPreferenceChange = this._register(new Emitter());
    this.onDidChangeAccountPreference = this._onDidAccountPreferenceChange.event;
    this._inheritAuthAccountPreferenceParentToChildren = this._productService.inheritAuthAccountPreference || {};
    this._inheritAuthAccountPreferenceChildToParent = Object.entries(this._inheritAuthAccountPreferenceParentToChildren).reduce((acc, [parent, children]) => {
      children.forEach((child) => {
        acc[child] = parent;
      });
      return acc;
    }, {});
    this.registerListeners();
  }
  registerListeners() {
    this._register(this._authenticationService.onDidChangeSessions((e) => {
      if (e.event.added?.length) {
        this.updateNewSessionRequests(e.providerId, e.event.added);
      }
      if (e.event.removed?.length) {
        this.updateAccessRequests(e.providerId, e.event.removed);
      }
    }));
    this._register(this._authenticationService.onDidUnregisterAuthenticationProvider((e) => {
      const accessRequests = this._sessionAccessRequestItems.get(e.id) || {};
      Object.keys(accessRequests).forEach((extensionId) => {
        this.removeAccessRequest(e.id, extensionId);
      });
    }));
  }
  updateNewSessionRequests(providerId, addedSessions) {
    const existingRequestsForProvider = this._signInRequestItems.get(providerId);
    if (!existingRequestsForProvider) {
      return;
    }
    Object.keys(existingRequestsForProvider).forEach((requestedScopes) => {
      const requestedScopesArray = requestedScopes.split(SCOPESLIST_SEPARATOR);
      if (addedSessions.some((session) => scopesMatch(session.scopes, requestedScopesArray))) {
        const sessionRequest = existingRequestsForProvider[requestedScopes];
        sessionRequest?.disposables.forEach((item) => item.dispose());
        delete existingRequestsForProvider[requestedScopes];
        if (Object.keys(existingRequestsForProvider).length === 0) {
          this._signInRequestItems.delete(providerId);
        } else {
          this._signInRequestItems.set(providerId, existingRequestsForProvider);
        }
        this.updateBadgeCount();
      }
    });
  }
  updateAccessRequests(providerId, removedSessions) {
    const providerRequests = this._sessionAccessRequestItems.get(providerId);
    if (providerRequests) {
      Object.keys(providerRequests).forEach((extensionId) => {
        removedSessions.forEach((removed) => {
          const indexOfSession = providerRequests[extensionId].possibleSessions.findIndex((session) => session.id === removed.id);
          if (indexOfSession) {
            providerRequests[extensionId].possibleSessions.splice(indexOfSession, 1);
          }
        });
        if (!providerRequests[extensionId].possibleSessions.length) {
          this.removeAccessRequest(providerId, extensionId);
        }
      });
    }
  }
  updateBadgeCount() {
    this._accountBadgeDisposable.clear();
    let numberOfRequests = 0;
    this._signInRequestItems.forEach((providerRequests) => {
      Object.keys(providerRequests).forEach((request) => {
        numberOfRequests += providerRequests[request].requestingExtensionIds.length;
      });
    });
    this._sessionAccessRequestItems.forEach((accessRequest) => {
      numberOfRequests += Object.keys(accessRequest).length;
    });
    if (numberOfRequests > 0) {
      const badge = new NumberBadge(numberOfRequests, () => nls.localize("sign in", "Sign in requested"));
      this._accountBadgeDisposable.value = this.activityService.showAccountsActivity({ badge });
    }
  }
  removeAccessRequest(providerId, extensionId) {
    const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
    if (providerRequests[extensionId]) {
      dispose(providerRequests[extensionId].disposables);
      delete providerRequests[extensionId];
      this.updateBadgeCount();
    }
  }
  //#region Account/Session Preference
  updateAccountPreference(extensionId, providerId, account) {
    const realExtensionId = ExtensionIdentifier.toKey(extensionId);
    const parentExtensionId = this._inheritAuthAccountPreferenceChildToParent[realExtensionId] ?? realExtensionId;
    const key = this._getKey(parentExtensionId, providerId);
    this.storageService.store(key, account.label, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this.storageService.store(key, account.label, StorageScope.APPLICATION, StorageTarget.MACHINE);
    const childrenExtensions = this._inheritAuthAccountPreferenceParentToChildren[parentExtensionId];
    const extensionIds = childrenExtensions ? [parentExtensionId, ...childrenExtensions] : [parentExtensionId];
    this._onDidAccountPreferenceChange.fire({ extensionIds, providerId });
  }
  getAccountPreference(extensionId, providerId) {
    const realExtensionId = ExtensionIdentifier.toKey(extensionId);
    const key = this._getKey(this._inheritAuthAccountPreferenceChildToParent[realExtensionId] ?? realExtensionId, providerId);
    return this.storageService.get(key, StorageScope.WORKSPACE) ?? this.storageService.get(key, StorageScope.APPLICATION);
  }
  removeAccountPreference(extensionId, providerId) {
    const realExtensionId = ExtensionIdentifier.toKey(extensionId);
    const key = this._getKey(this._inheritAuthAccountPreferenceChildToParent[realExtensionId] ?? realExtensionId, providerId);
    this.storageService.remove(key, StorageScope.WORKSPACE);
    this.storageService.remove(key, StorageScope.APPLICATION);
  }
  _getKey(extensionId, providerId) {
    return `${extensionId}-${providerId}`;
  }
  // TODO@TylerLeonhardt: Remove all of this after a couple iterations
  updateSessionPreference(providerId, extensionId, session) {
    const realExtensionId = ExtensionIdentifier.toKey(extensionId);
    const key = `${realExtensionId}-${providerId}-${session.scopes.join(SCOPESLIST_SEPARATOR)}`;
    this.storageService.store(key, session.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this.storageService.store(key, session.id, StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  getSessionPreference(providerId, extensionId, scopes) {
    const realExtensionId = ExtensionIdentifier.toKey(extensionId);
    const key = `${realExtensionId}-${providerId}-${scopes.join(SCOPESLIST_SEPARATOR)}`;
    return this.storageService.get(key, StorageScope.WORKSPACE) ?? this.storageService.get(key, StorageScope.APPLICATION);
  }
  removeSessionPreference(providerId, extensionId, scopes) {
    const realExtensionId = ExtensionIdentifier.toKey(extensionId);
    const key = `${realExtensionId}-${providerId}-${scopes.join(SCOPESLIST_SEPARATOR)}`;
    this.storageService.remove(key, StorageScope.WORKSPACE);
    this.storageService.remove(key, StorageScope.APPLICATION);
  }
  _updateAccountAndSessionPreferences(providerId, extensionId, session) {
    this.updateAccountPreference(extensionId, providerId, session.account);
    this.updateSessionPreference(providerId, extensionId, session);
  }
  //#endregion
  async showGetSessionPrompt(provider, accountName, extensionId, extensionName) {
    let SessionPromptChoice;
    ((SessionPromptChoice2) => {
      SessionPromptChoice2[SessionPromptChoice2["Allow"] = 0] = "Allow";
      SessionPromptChoice2[SessionPromptChoice2["Deny"] = 1] = "Deny";
      SessionPromptChoice2[SessionPromptChoice2["Cancel"] = 2] = "Cancel";
    })(SessionPromptChoice || (SessionPromptChoice = {}));
    const { result } = await this.dialogService.prompt({
      type: Severity.Info,
      message: nls.localize("confirmAuthenticationAccess", "The extension '{0}' wants to access the {1} account '{2}'.", extensionName, provider.label, accountName),
      buttons: [
        {
          label: nls.localize({ key: "allow", comment: ["&& denotes a mnemonic"] }, "&&Allow"),
          run: () => 0 /* Allow */
        },
        {
          label: nls.localize({ key: "deny", comment: ["&& denotes a mnemonic"] }, "&&Deny"),
          run: () => 1 /* Deny */
        }
      ],
      cancelButton: {
        run: () => 2 /* Cancel */
      }
    });
    if (result !== 2 /* Cancel */) {
      this._authenticationAccessService.updateAllowedExtensions(provider.id, accountName, [{ id: extensionId, name: extensionName, allowed: result === 0 /* Allow */ }]);
      this.removeAccessRequest(provider.id, extensionId);
    }
    return result === 0 /* Allow */;
  }
  /**
   * This function should be used only when there are sessions to disambiguate.
   */
  async selectSession(providerId, extensionId, extensionName, scopeListOrRequest, availableSessions) {
    const allAccounts = await this._authenticationService.getAccounts(providerId);
    if (!allAccounts.length) {
      throw new Error("No accounts available");
    }
    const disposables = new DisposableStore();
    const quickPick = disposables.add(this.quickInputService.createQuickPick());
    quickPick.ignoreFocusOut = true;
    const accountsWithSessions = /* @__PURE__ */ new Set();
    const items = availableSessions.filter((session) => !accountsWithSessions.has(session.account.label) && accountsWithSessions.add(session.account.label)).map((session) => {
      return {
        label: session.account.label,
        session
      };
    });
    allAccounts.forEach((account) => {
      if (!accountsWithSessions.has(account.label)) {
        items.push({ label: account.label, account });
      }
    });
    items.push({ label: nls.localize("useOtherAccount", "Sign in to another account") });
    quickPick.items = items;
    quickPick.title = nls.localize(
      {
        key: "selectAccount",
        comment: ["The placeholder {0} is the name of an extension. {1} is the name of the type of account, such as Microsoft or GitHub."]
      },
      "The extension '{0}' wants to access a {1} account",
      extensionName,
      this._authenticationService.getProvider(providerId).label
    );
    quickPick.placeholder = nls.localize("getSessionPlateholder", "Select an account for '{0}' to use or Esc to cancel", extensionName);
    return await new Promise((resolve, reject) => {
      disposables.add(quickPick.onDidAccept(async (_) => {
        quickPick.dispose();
        let session = quickPick.selectedItems[0].session;
        if (!session) {
          const account = quickPick.selectedItems[0].account;
          try {
            session = await this._authenticationService.createSession(providerId, scopeListOrRequest, { account });
          } catch (e) {
            reject(e);
            return;
          }
        }
        const accountName = session.account.label;
        this._authenticationAccessService.updateAllowedExtensions(providerId, accountName, [{ id: extensionId, name: extensionName, allowed: true }]);
        this._updateAccountAndSessionPreferences(providerId, extensionId, session);
        this.removeAccessRequest(providerId, extensionId);
        resolve(session);
      }));
      disposables.add(quickPick.onDidHide((_) => {
        if (!quickPick.selectedItems[0]) {
          reject("User did not consent to account access");
        }
        disposables.dispose();
      }));
      quickPick.show();
    });
  }
  async completeSessionAccessRequest(provider, extensionId, extensionName, scopeListOrRequest) {
    const providerRequests = this._sessionAccessRequestItems.get(provider.id) || {};
    const existingRequest = providerRequests[extensionId];
    if (!existingRequest) {
      return;
    }
    if (!provider) {
      return;
    }
    const possibleSessions = existingRequest.possibleSessions;
    let session;
    if (provider.supportsMultipleAccounts) {
      try {
        session = await this.selectSession(provider.id, extensionId, extensionName, scopeListOrRequest, possibleSessions);
      } catch (_) {
      }
    } else {
      const approved = await this.showGetSessionPrompt(provider, possibleSessions[0].account.label, extensionId, extensionName);
      if (approved) {
        session = possibleSessions[0];
      }
    }
    if (session) {
      this._authenticationUsageService.addAccountUsage(provider.id, session.account.label, session.scopes, extensionId, extensionName);
    }
  }
  requestSessionAccess(providerId, extensionId, extensionName, scopeListOrRequest, possibleSessions) {
    const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
    const hasExistingRequest = providerRequests[extensionId];
    if (hasExistingRequest) {
      return;
    }
    const provider = this._authenticationService.getProvider(providerId);
    const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
      group: "3_accessRequests",
      command: {
        id: `${providerId}${extensionId}Access`,
        title: nls.localize(
          {
            key: "accessRequest",
            comment: [`The placeholder {0} will be replaced with an authentication provider''s label. {1} will be replaced with an extension name. (1) is to indicate that this menu item contributes to a badge count`]
          },
          "Grant access to {0} for {1}... (1)",
          provider.label,
          extensionName
        )
      }
    });
    const accessCommand = CommandsRegistry.registerCommand({
      id: `${providerId}${extensionId}Access`,
      handler: async (accessor) => {
        this.completeSessionAccessRequest(provider, extensionId, extensionName, scopeListOrRequest);
      }
    });
    providerRequests[extensionId] = { possibleSessions, disposables: [menuItem, accessCommand] };
    this._sessionAccessRequestItems.set(providerId, providerRequests);
    this.updateBadgeCount();
  }
  async requestNewSession(providerId, scopeListOrRequest, extensionId, extensionName) {
    if (!this._authenticationService.isAuthenticationProviderRegistered(providerId)) {
      await new Promise((resolve, _) => {
        const dispose2 = this._authenticationService.onDidRegisterAuthenticationProvider((e) => {
          if (e.id === providerId) {
            dispose2.dispose();
            resolve();
          }
        });
      });
    }
    let provider;
    try {
      provider = this._authenticationService.getProvider(providerId);
    } catch (_e) {
      return;
    }
    const providerRequests = this._signInRequestItems.get(providerId);
    const signInRequestKey = isAuthenticationWwwAuthenticateRequest(scopeListOrRequest) ? `${scopeListOrRequest.wwwAuthenticate}:${scopeListOrRequest.fallbackScopes?.join(SCOPESLIST_SEPARATOR) ?? ""}` : `${scopeListOrRequest.join(SCOPESLIST_SEPARATOR)}`;
    const extensionHasExistingRequest = providerRequests && providerRequests[signInRequestKey] && providerRequests[signInRequestKey].requestingExtensionIds.includes(extensionId);
    if (extensionHasExistingRequest) {
      return;
    }
    const commandId = `${providerId}:${extensionId}:signIn${Object.keys(providerRequests || []).length}`;
    const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
      group: "2_signInRequests",
      command: {
        id: commandId,
        title: nls.localize(
          {
            key: "signInRequest",
            comment: [`The placeholder {0} will be replaced with an authentication provider's label. {1} will be replaced with an extension name. (1) is to indicate that this menu item contributes to a badge count.`]
          },
          "Sign in with {0} to use {1} (1)",
          provider.label,
          extensionName
        )
      }
    });
    const signInCommand = CommandsRegistry.registerCommand({
      id: commandId,
      handler: async (accessor) => {
        const authenticationService = accessor.get(IAuthenticationService);
        const session = await authenticationService.createSession(providerId, scopeListOrRequest);
        this._authenticationAccessService.updateAllowedExtensions(providerId, session.account.label, [{ id: extensionId, name: extensionName, allowed: true }]);
        this._updateAccountAndSessionPreferences(providerId, extensionId, session);
      }
    });
    if (providerRequests) {
      const existingRequest = providerRequests[signInRequestKey] || { disposables: [], requestingExtensionIds: [] };
      providerRequests[signInRequestKey] = {
        disposables: [...existingRequest.disposables, menuItem, signInCommand],
        requestingExtensionIds: [...existingRequest.requestingExtensionIds, extensionId]
      };
      this._signInRequestItems.set(providerId, providerRequests);
    } else {
      this._signInRequestItems.set(providerId, {
        [signInRequestKey]: {
          disposables: [menuItem, signInCommand],
          requestingExtensionIds: [extensionId]
        }
      });
    }
    this.updateBadgeCount();
  }
};
AuthenticationExtensionsService = __decorateClass([
  __decorateParam(0, IActivityService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IAuthenticationService),
  __decorateParam(6, IAuthenticationUsageService),
  __decorateParam(7, IAuthenticationAccessService)
], AuthenticationExtensionsService);
registerSingleton(IAuthenticationExtensionsService, AuthenticationExtensionsService, InstantiationType.Delayed);
export {
  AuthenticationExtensionsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBzY29wZXNNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29hdXRoLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZpdHlTZXJ2aWNlLCBOdW1iZXJCYWRnZSB9IGZyb20gJy4uLy4uL2FjdGl2aXR5L2NvbW1vbi9hY3Rpdml0eS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlIH0gZnJvbSAnLi9hdXRoZW50aWNhdGlvblVzYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvblNlc3Npb24sIElBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBJQXV0aGVudGljYXRpb25TZXJ2aWNlLCBJQXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZSwgQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCwgSUF1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdCwgaXNBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3QgfSBmcm9tICcuLi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcblxuLy8gT0F1dGgyIHNwZWMgcHJvaGliaXRzIHNwYWNlIGluIGEgc2NvcGUsIHNvIHVzZSB0aGF0IHRvIGpvaW4gdGhlbS5cbmNvbnN0IFNDT1BFU0xJU1RfU0VQQVJBVE9SID0gJyAnO1xuXG5pbnRlcmZhY2UgU2Vzc2lvblJlcXVlc3Qge1xuXHRkaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXTtcblx0cmVxdWVzdGluZ0V4dGVuc2lvbklkczogc3RyaW5nW107XG59XG5cbmludGVyZmFjZSBTZXNzaW9uUmVxdWVzdEluZm8ge1xuXHRbc2NvcGVzTGlzdDogc3RyaW5nXTogU2Vzc2lvblJlcXVlc3Q7XG59XG5cbi8vIFRPRE9AVHlsZXJMZW9uaGFyZHQ6IFRoaXMgc2hvdWxkIGFsbCBnbyBpbiBNYWluVGhyZWFkQXV0aGVudGljYXRpb25cbmV4cG9ydCBjbGFzcyBBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NpZ25JblJlcXVlc3RJdGVtcyA9IG5ldyBNYXA8c3RyaW5nLCBTZXNzaW9uUmVxdWVzdEluZm8+KCk7XG5cdHByaXZhdGUgX3Nlc3Npb25BY2Nlc3NSZXF1ZXN0SXRlbXMgPSBuZXcgTWFwPHN0cmluZywgeyBbZXh0ZW5zaW9uSWQ6IHN0cmluZ106IHsgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW107IHBvc3NpYmxlU2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdIH0gfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWNjb3VudEJhZGdlRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIF9vbkRpZEFjY291bnRQcmVmZXJlbmNlQ2hhbmdlOiBFbWl0dGVyPHsgcHJvdmlkZXJJZDogc3RyaW5nOyBleHRlbnNpb25JZHM6IHN0cmluZ1tdIH0+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBwcm92aWRlcklkOiBzdHJpbmc7IGV4dGVuc2lvbklkczogc3RyaW5nW10gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWNjb3VudFByZWZlcmVuY2UgPSB0aGlzLl9vbkRpZEFjY291bnRQcmVmZXJlbmNlQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgX2luaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2VQYXJlbnRUb0NoaWxkcmVuOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmdbXT47XG5cdHByaXZhdGUgX2luaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2VDaGlsZFRvUGFyZW50OiB7IFtleHRlbnNpb25JZDogc3RyaW5nXTogc3RyaW5nIH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpdml0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5faW5oZXJpdEF1dGhBY2NvdW50UHJlZmVyZW5jZVBhcmVudFRvQ2hpbGRyZW4gPSB0aGlzLl9wcm9kdWN0U2VydmljZS5pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlIHx8IHt9O1xuXHRcdHRoaXMuX2luaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2VDaGlsZFRvUGFyZW50ID0gT2JqZWN0LmVudHJpZXModGhpcy5faW5oZXJpdEF1dGhBY2NvdW50UHJlZmVyZW5jZVBhcmVudFRvQ2hpbGRyZW4pLnJlZHVjZTx7IFtleHRlbnNpb25JZDogc3RyaW5nXTogc3RyaW5nIH0+KChhY2MsIFtwYXJlbnQsIGNoaWxkcmVuXSkgPT4ge1xuXHRcdFx0Y2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRhY2NbY2hpbGRdID0gcGFyZW50O1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gYWNjO1xuXHRcdH0sIHt9KTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4ge1xuXHRcdFx0aWYgKGUuZXZlbnQuYWRkZWQ/Lmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZU5ld1Nlc3Npb25SZXF1ZXN0cyhlLnByb3ZpZGVySWQsIGUuZXZlbnQuYWRkZWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuZXZlbnQucmVtb3ZlZD8ubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQWNjZXNzUmVxdWVzdHMoZS5wcm92aWRlcklkLCBlLmV2ZW50LnJlbW92ZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZFVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKGUgPT4ge1xuXHRcdFx0Y29uc3QgYWNjZXNzUmVxdWVzdHMgPSB0aGlzLl9zZXNzaW9uQWNjZXNzUmVxdWVzdEl0ZW1zLmdldChlLmlkKSB8fCB7fTtcblx0XHRcdE9iamVjdC5rZXlzKGFjY2Vzc1JlcXVlc3RzKS5mb3JFYWNoKGV4dGVuc2lvbklkID0+IHtcblx0XHRcdFx0dGhpcy5yZW1vdmVBY2Nlc3NSZXF1ZXN0KGUuaWQsIGV4dGVuc2lvbklkKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHVwZGF0ZU5ld1Nlc3Npb25SZXF1ZXN0cyhwcm92aWRlcklkOiBzdHJpbmcsIGFkZGVkU2Vzc2lvbnM6IHJlYWRvbmx5IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0Y29uc3QgZXhpc3RpbmdSZXF1ZXN0c0ZvclByb3ZpZGVyID0gdGhpcy5fc2lnbkluUmVxdWVzdEl0ZW1zLmdldChwcm92aWRlcklkKTtcblx0XHRpZiAoIWV4aXN0aW5nUmVxdWVzdHNGb3JQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdE9iamVjdC5rZXlzKGV4aXN0aW5nUmVxdWVzdHNGb3JQcm92aWRlcikuZm9yRWFjaChyZXF1ZXN0ZWRTY29wZXMgPT4ge1xuXHRcdFx0Ly8gUGFyc2UgdGhlIHJlcXVlc3RlZCBzY29wZXMgZnJvbSB0aGUgc3RvcmVkIGtleVxuXHRcdFx0Y29uc3QgcmVxdWVzdGVkU2NvcGVzQXJyYXkgPSByZXF1ZXN0ZWRTY29wZXMuc3BsaXQoU0NPUEVTTElTVF9TRVBBUkFUT1IpO1xuXG5cdFx0XHQvLyBDaGVjayBpZiBhbnkgYWRkZWQgc2Vzc2lvbiBoYXMgbWF0Y2hpbmcgc2NvcGVzIChvcmRlci1pbmRlcGVuZGVudClcblx0XHRcdGlmIChhZGRlZFNlc3Npb25zLnNvbWUoc2Vzc2lvbiA9PiBzY29wZXNNYXRjaChzZXNzaW9uLnNjb3BlcywgcmVxdWVzdGVkU2NvcGVzQXJyYXkpKSkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVxdWVzdCA9IGV4aXN0aW5nUmVxdWVzdHNGb3JQcm92aWRlcltyZXF1ZXN0ZWRTY29wZXNdO1xuXHRcdFx0XHRzZXNzaW9uUmVxdWVzdD8uZGlzcG9zYWJsZXMuZm9yRWFjaChpdGVtID0+IGl0ZW0uZGlzcG9zZSgpKTtcblxuXHRcdFx0XHRkZWxldGUgZXhpc3RpbmdSZXF1ZXN0c0ZvclByb3ZpZGVyW3JlcXVlc3RlZFNjb3Blc107XG5cdFx0XHRcdGlmIChPYmplY3Qua2V5cyhleGlzdGluZ1JlcXVlc3RzRm9yUHJvdmlkZXIpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX3NpZ25JblJlcXVlc3RJdGVtcy5kZWxldGUocHJvdmlkZXJJZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fc2lnbkluUmVxdWVzdEl0ZW1zLnNldChwcm92aWRlcklkLCBleGlzdGluZ1JlcXVlc3RzRm9yUHJvdmlkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMudXBkYXRlQmFkZ2VDb3VudCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBY2Nlc3NSZXF1ZXN0cyhwcm92aWRlcklkOiBzdHJpbmcsIHJlbW92ZWRTZXNzaW9uczogcmVhZG9ubHkgQXV0aGVudGljYXRpb25TZXNzaW9uW10pOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlclJlcXVlc3RzID0gdGhpcy5fc2Vzc2lvbkFjY2Vzc1JlcXVlc3RJdGVtcy5nZXQocHJvdmlkZXJJZCk7XG5cdFx0aWYgKHByb3ZpZGVyUmVxdWVzdHMpIHtcblx0XHRcdE9iamVjdC5rZXlzKHByb3ZpZGVyUmVxdWVzdHMpLmZvckVhY2goZXh0ZW5zaW9uSWQgPT4ge1xuXHRcdFx0XHRyZW1vdmVkU2Vzc2lvbnMuZm9yRWFjaChyZW1vdmVkID0+IHtcblx0XHRcdFx0XHRjb25zdCBpbmRleE9mU2Vzc2lvbiA9IHByb3ZpZGVyUmVxdWVzdHNbZXh0ZW5zaW9uSWRdLnBvc3NpYmxlU2Vzc2lvbnMuZmluZEluZGV4KHNlc3Npb24gPT4gc2Vzc2lvbi5pZCA9PT0gcmVtb3ZlZC5pZCk7XG5cdFx0XHRcdFx0aWYgKGluZGV4T2ZTZXNzaW9uKSB7XG5cdFx0XHRcdFx0XHRwcm92aWRlclJlcXVlc3RzW2V4dGVuc2lvbklkXS5wb3NzaWJsZVNlc3Npb25zLnNwbGljZShpbmRleE9mU2Vzc2lvbiwgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoIXByb3ZpZGVyUmVxdWVzdHNbZXh0ZW5zaW9uSWRdLnBvc3NpYmxlU2Vzc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW1vdmVBY2Nlc3NSZXF1ZXN0KHByb3ZpZGVySWQsIGV4dGVuc2lvbklkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVCYWRnZUNvdW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjY291bnRCYWRnZURpc3Bvc2FibGUuY2xlYXIoKTtcblxuXHRcdGxldCBudW1iZXJPZlJlcXVlc3RzID0gMDtcblx0XHR0aGlzLl9zaWduSW5SZXF1ZXN0SXRlbXMuZm9yRWFjaChwcm92aWRlclJlcXVlc3RzID0+IHtcblx0XHRcdE9iamVjdC5rZXlzKHByb3ZpZGVyUmVxdWVzdHMpLmZvckVhY2gocmVxdWVzdCA9PiB7XG5cdFx0XHRcdG51bWJlck9mUmVxdWVzdHMgKz0gcHJvdmlkZXJSZXF1ZXN0c1tyZXF1ZXN0XS5yZXF1ZXN0aW5nRXh0ZW5zaW9uSWRzLmxlbmd0aDtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fc2Vzc2lvbkFjY2Vzc1JlcXVlc3RJdGVtcy5mb3JFYWNoKGFjY2Vzc1JlcXVlc3QgPT4ge1xuXHRcdFx0bnVtYmVyT2ZSZXF1ZXN0cyArPSBPYmplY3Qua2V5cyhhY2Nlc3NSZXF1ZXN0KS5sZW5ndGg7XG5cdFx0fSk7XG5cblx0XHRpZiAobnVtYmVyT2ZSZXF1ZXN0cyA+IDApIHtcblx0XHRcdGNvbnN0IGJhZGdlID0gbmV3IE51bWJlckJhZGdlKG51bWJlck9mUmVxdWVzdHMsICgpID0+IG5scy5sb2NhbGl6ZSgnc2lnbiBpbicsIFwiU2lnbiBpbiByZXF1ZXN0ZWRcIikpO1xuXHRcdFx0dGhpcy5fYWNjb3VudEJhZGdlRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMuYWN0aXZpdHlTZXJ2aWNlLnNob3dBY2NvdW50c0FjdGl2aXR5KHsgYmFkZ2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVBY2Nlc3NSZXF1ZXN0KHByb3ZpZGVySWQ6IHN0cmluZywgZXh0ZW5zaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyUmVxdWVzdHMgPSB0aGlzLl9zZXNzaW9uQWNjZXNzUmVxdWVzdEl0ZW1zLmdldChwcm92aWRlcklkKSB8fCB7fTtcblx0XHRpZiAocHJvdmlkZXJSZXF1ZXN0c1tleHRlbnNpb25JZF0pIHtcblx0XHRcdGRpc3Bvc2UocHJvdmlkZXJSZXF1ZXN0c1tleHRlbnNpb25JZF0uZGlzcG9zYWJsZXMpO1xuXHRcdFx0ZGVsZXRlIHByb3ZpZGVyUmVxdWVzdHNbZXh0ZW5zaW9uSWRdO1xuXHRcdFx0dGhpcy51cGRhdGVCYWRnZUNvdW50KCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jcmVnaW9uIEFjY291bnQvU2Vzc2lvbiBQcmVmZXJlbmNlXG5cblx0dXBkYXRlQWNjb3VudFByZWZlcmVuY2UoZXh0ZW5zaW9uSWQ6IHN0cmluZywgcHJvdmlkZXJJZDogc3RyaW5nLCBhY2NvdW50OiBBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcmVhbEV4dGVuc2lvbklkID0gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb25JZCk7XG5cdFx0Y29uc3QgcGFyZW50RXh0ZW5zaW9uSWQgPSB0aGlzLl9pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlQ2hpbGRUb1BhcmVudFtyZWFsRXh0ZW5zaW9uSWRdID8/IHJlYWxFeHRlbnNpb25JZDtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9nZXRLZXkocGFyZW50RXh0ZW5zaW9uSWQsIHByb3ZpZGVySWQpO1xuXG5cdFx0Ly8gU3RvcmUgdGhlIHByZWZlcmVuY2UgaW4gdGhlIHdvcmtzcGFjZSBhbmQgYXBwbGljYXRpb24gc3RvcmFnZS4gVGhpcyBhbGxvd3MgbmV3IHdvcmtzcGFjZXMgdG9cblx0XHQvLyBoYXZlIGEgcHJlZmVyZW5jZSBzZXQgYWxyZWFkeSB0byBsaW1pdCB0aGUgbnVtYmVyIG9mIHByb21wdHMgdGhhdCBhcmUgc2hvd24uLi4gYnV0IGFsc28gYWxsb3dzXG5cdFx0Ly8gYSBzcGVjaWZpYyB3b3Jrc3BhY2UgdG8gb3ZlcnJpZGUgdGhlIGdsb2JhbCBwcmVmZXJlbmNlLlxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoa2V5LCBhY2NvdW50LmxhYmVsLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoa2V5LCBhY2NvdW50LmxhYmVsLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRjb25zdCBjaGlsZHJlbkV4dGVuc2lvbnMgPSB0aGlzLl9pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlUGFyZW50VG9DaGlsZHJlbltwYXJlbnRFeHRlbnNpb25JZF07XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWRzID0gY2hpbGRyZW5FeHRlbnNpb25zID8gW3BhcmVudEV4dGVuc2lvbklkLCAuLi5jaGlsZHJlbkV4dGVuc2lvbnNdIDogW3BhcmVudEV4dGVuc2lvbklkXTtcblx0XHR0aGlzLl9vbkRpZEFjY291bnRQcmVmZXJlbmNlQ2hhbmdlLmZpcmUoeyBleHRlbnNpb25JZHMsIHByb3ZpZGVySWQgfSk7XG5cdH1cblxuXHRnZXRBY2NvdW50UHJlZmVyZW5jZShleHRlbnNpb25JZDogc3RyaW5nLCBwcm92aWRlcklkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlYWxFeHRlbnNpb25JZCA9IEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uSWQpO1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2dldEtleSh0aGlzLl9pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlQ2hpbGRUb1BhcmVudFtyZWFsRXh0ZW5zaW9uSWRdID8/IHJlYWxFeHRlbnNpb25JZCwgcHJvdmlkZXJJZCk7XG5cblx0XHQvLyBJZiBhIHByZWZlcmVuY2UgaXMgc2V0IGluIHRoZSB3b3Jrc3BhY2UsIHVzZSB0aGF0LiBPdGhlcndpc2UsIHVzZSB0aGUgZ2xvYmFsIHByZWZlcmVuY2UuXG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KGtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSkgPz8gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoa2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG5cblx0cmVtb3ZlQWNjb3VudFByZWZlcmVuY2UoZXh0ZW5zaW9uSWQ6IHN0cmluZywgcHJvdmlkZXJJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVhbEV4dGVuc2lvbklkID0gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb25JZCk7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fZ2V0S2V5KHRoaXMuX2luaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2VDaGlsZFRvUGFyZW50W3JlYWxFeHRlbnNpb25JZF0gPz8gcmVhbEV4dGVuc2lvbklkLCBwcm92aWRlcklkKTtcblxuXHRcdC8vIFRoaXMgd29uJ3QgYWZmZWN0IGFueSBvdGhlciB3b3Jrc3BhY2VzIHRoYXQgaGF2ZSBhIHByZWZlcmVuY2Ugc2V0LCBidXQgaXQgd2lsbCByZW1vdmUgdGhlIHByZWZlcmVuY2Vcblx0XHQvLyBmb3IgdGhpcyB3b3Jrc3BhY2UgYW5kIHRoZSBnbG9iYWwgcHJlZmVyZW5jZS4gVGhpcyBpcyBvbmx5IHBhaXJlZCB3aXRoIGEgY2FsbCB0byB1cGRhdGVTZXNzaW9uUHJlZmVyZW5jZS4uLlxuXHRcdC8vIHNvIHdlIHJlYWxseSBkb24ndCBfbmVlZF8gdG8gcmVtb3ZlIHRoZW0gYXMgdGhleSBhcmUgYWJvdXQgdG8gYmUgb3ZlcnJpZGRlbiBhbnl3YXkuLi4gYnV0IGl0J3MgbW9yZSBjb3JyZWN0XG5cdFx0Ly8gdG8gcmVtb3ZlIHRoZW0gZmlyc3QuLi4gYW5kIGluIGNhc2UgdGhpcyBnZXRzIGNhbGxlZCBmcm9tIHNvbWV3aGVyZSBlbHNlIGluIHRoZSBmdXR1cmUuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoa2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRLZXkoZXh0ZW5zaW9uSWQ6IHN0cmluZywgcHJvdmlkZXJJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7ZXh0ZW5zaW9uSWR9LSR7cHJvdmlkZXJJZH1gO1xuXHR9XG5cblx0Ly8gVE9ET0BUeWxlckxlb25oYXJkdDogUmVtb3ZlIGFsbCBvZiB0aGlzIGFmdGVyIGEgY291cGxlIGl0ZXJhdGlvbnNcblxuXHR1cGRhdGVTZXNzaW9uUHJlZmVyZW5jZShwcm92aWRlcklkOiBzdHJpbmcsIGV4dGVuc2lvbklkOiBzdHJpbmcsIHNlc3Npb246IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IHJlYWxFeHRlbnNpb25JZCA9IEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uSWQpO1xuXHRcdC8vIFRoZSAzIHBhcnRzIG9mIHRoaXMga2V5IGFyZSBpbXBvcnRhbnQ6XG5cdFx0Ly8gKiBFeHRlbnNpb24gaWQ6IFRoZSBleHRlbnNpb24gdGhhdCBoYXMgYSBwcmVmZXJlbmNlXG5cdFx0Ly8gKiBQcm92aWRlciBpZDogVGhlIHByb3ZpZGVyIHRoYXQgdGhlIHByZWZlcmVuY2UgaXMgZm9yXG5cdFx0Ly8gKiBUaGUgc2NvcGVzOiBUaGUgc3Vic2V0IG9mIHNlc3Npb25zIHRoYXQgdGhlIHByZWZlcmVuY2UgYXBwbGllcyB0b1xuXHRcdGNvbnN0IGtleSA9IGAke3JlYWxFeHRlbnNpb25JZH0tJHtwcm92aWRlcklkfS0ke3Nlc3Npb24uc2NvcGVzLmpvaW4oU0NPUEVTTElTVF9TRVBBUkFUT1IpfWA7XG5cblx0XHQvLyBTdG9yZSB0aGUgcHJlZmVyZW5jZSBpbiB0aGUgd29ya3NwYWNlIGFuZCBhcHBsaWNhdGlvbiBzdG9yYWdlLiBUaGlzIGFsbG93cyBuZXcgd29ya3NwYWNlcyB0b1xuXHRcdC8vIGhhdmUgYSBwcmVmZXJlbmNlIHNldCBhbHJlYWR5IHRvIGxpbWl0IHRoZSBudW1iZXIgb2YgcHJvbXB0cyB0aGF0IGFyZSBzaG93bi4uLiBidXQgYWxzbyBhbGxvd3Ncblx0XHQvLyBhIHNwZWNpZmljIHdvcmtzcGFjZSB0byBvdmVycmlkZSB0aGUgZ2xvYmFsIHByZWZlcmVuY2UuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShrZXksIHNlc3Npb24uaWQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShrZXksIHNlc3Npb24uaWQsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdGdldFNlc3Npb25QcmVmZXJlbmNlKHByb3ZpZGVySWQ6IHN0cmluZywgZXh0ZW5zaW9uSWQ6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVhbEV4dGVuc2lvbklkID0gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb25JZCk7XG5cdFx0Ly8gVGhlIDMgcGFydHMgb2YgdGhpcyBrZXkgYXJlIGltcG9ydGFudDpcblx0XHQvLyAqIEV4dGVuc2lvbiBpZDogVGhlIGV4dGVuc2lvbiB0aGF0IGhhcyBhIHByZWZlcmVuY2Vcblx0XHQvLyAqIFByb3ZpZGVyIGlkOiBUaGUgcHJvdmlkZXIgdGhhdCB0aGUgcHJlZmVyZW5jZSBpcyBmb3Jcblx0XHQvLyAqIFRoZSBzY29wZXM6IFRoZSBzdWJzZXQgb2Ygc2Vzc2lvbnMgdGhhdCB0aGUgcHJlZmVyZW5jZSBhcHBsaWVzIHRvXG5cdFx0Y29uc3Qga2V5ID0gYCR7cmVhbEV4dGVuc2lvbklkfS0ke3Byb3ZpZGVySWR9LSR7c2NvcGVzLmpvaW4oU0NPUEVTTElTVF9TRVBBUkFUT1IpfWA7XG5cblx0XHQvLyBJZiBhIHByZWZlcmVuY2UgaXMgc2V0IGluIHRoZSB3b3Jrc3BhY2UsIHVzZSB0aGF0LiBPdGhlcndpc2UsIHVzZSB0aGUgZ2xvYmFsIHByZWZlcmVuY2UuXG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KGtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSkgPz8gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoa2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG5cblx0cmVtb3ZlU2Vzc2lvblByZWZlcmVuY2UocHJvdmlkZXJJZDogc3RyaW5nLCBleHRlbnNpb25JZDogc3RyaW5nLCBzY29wZXM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVhbEV4dGVuc2lvbklkID0gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb25JZCk7XG5cdFx0Ly8gVGhlIDMgcGFydHMgb2YgdGhpcyBrZXkgYXJlIGltcG9ydGFudDpcblx0XHQvLyAqIEV4dGVuc2lvbiBpZDogVGhlIGV4dGVuc2lvbiB0aGF0IGhhcyBhIHByZWZlcmVuY2Vcblx0XHQvLyAqIFByb3ZpZGVyIGlkOiBUaGUgcHJvdmlkZXIgdGhhdCB0aGUgcHJlZmVyZW5jZSBpcyBmb3Jcblx0XHQvLyAqIFRoZSBzY29wZXM6IFRoZSBzdWJzZXQgb2Ygc2Vzc2lvbnMgdGhhdCB0aGUgcHJlZmVyZW5jZSBhcHBsaWVzIHRvXG5cdFx0Y29uc3Qga2V5ID0gYCR7cmVhbEV4dGVuc2lvbklkfS0ke3Byb3ZpZGVySWR9LSR7c2NvcGVzLmpvaW4oU0NPUEVTTElTVF9TRVBBUkFUT1IpfWA7XG5cblx0XHQvLyBUaGlzIHdvbid0IGFmZmVjdCBhbnkgb3RoZXIgd29ya3NwYWNlcyB0aGF0IGhhdmUgYSBwcmVmZXJlbmNlIHNldCwgYnV0IGl0IHdpbGwgcmVtb3ZlIHRoZSBwcmVmZXJlbmNlXG5cdFx0Ly8gZm9yIHRoaXMgd29ya3NwYWNlIGFuZCB0aGUgZ2xvYmFsIHByZWZlcmVuY2UuIFRoaXMgaXMgb25seSBwYWlyZWQgd2l0aCBhIGNhbGwgdG8gdXBkYXRlU2Vzc2lvblByZWZlcmVuY2UuLi5cblx0XHQvLyBzbyB3ZSByZWFsbHkgZG9uJ3QgX25lZWRfIHRvIHJlbW92ZSB0aGVtIGFzIHRoZXkgYXJlIGFib3V0IHRvIGJlIG92ZXJyaWRkZW4gYW55d2F5Li4uIGJ1dCBpdCdzIG1vcmUgY29ycmVjdFxuXHRcdC8vIHRvIHJlbW92ZSB0aGVtIGZpcnN0Li4uIGFuZCBpbiBjYXNlIHRoaXMgZ2V0cyBjYWxsZWQgZnJvbSBzb21ld2hlcmUgZWxzZSBpbiB0aGUgZnV0dXJlLlxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKGtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoa2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQWNjb3VudEFuZFNlc3Npb25QcmVmZXJlbmNlcyhwcm92aWRlcklkOiBzdHJpbmcsIGV4dGVuc2lvbklkOiBzdHJpbmcsIHNlc3Npb246IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbik6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlQWNjb3VudFByZWZlcmVuY2UoZXh0ZW5zaW9uSWQsIHByb3ZpZGVySWQsIHNlc3Npb24uYWNjb3VudCk7XG5cdFx0dGhpcy51cGRhdGVTZXNzaW9uUHJlZmVyZW5jZShwcm92aWRlcklkLCBleHRlbnNpb25JZCwgc2Vzc2lvbik7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIGFzeW5jIHNob3dHZXRTZXNzaW9uUHJvbXB0KHByb3ZpZGVyOiBJQXV0aGVudGljYXRpb25Qcm92aWRlciwgYWNjb3VudE5hbWU6IHN0cmluZywgZXh0ZW5zaW9uSWQ6IHN0cmluZywgZXh0ZW5zaW9uTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0ZW51bSBTZXNzaW9uUHJvbXB0Q2hvaWNlIHtcblx0XHRcdEFsbG93ID0gMCxcblx0XHRcdERlbnkgPSAxLFxuXHRcdFx0Q2FuY2VsID0gMlxuXHRcdH1cblx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdDxTZXNzaW9uUHJvbXB0Q2hvaWNlPih7XG5cdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdjb25maXJtQXV0aGVudGljYXRpb25BY2Nlc3MnLCBcIlRoZSBleHRlbnNpb24gJ3swfScgd2FudHMgdG8gYWNjZXNzIHRoZSB7MX0gYWNjb3VudCAnezJ9Jy5cIiwgZXh0ZW5zaW9uTmFtZSwgcHJvdmlkZXIubGFiZWwsIGFjY291bnROYW1lKSxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoeyBrZXk6ICdhbGxvdycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkFsbG93XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gU2Vzc2lvblByb21wdENob2ljZS5BbGxvd1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSh7IGtleTogJ2RlbnknLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZEZW55XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gU2Vzc2lvblByb21wdENob2ljZS5EZW55XG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0cnVuOiAoKSA9PiBTZXNzaW9uUHJvbXB0Q2hvaWNlLkNhbmNlbFxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKHJlc3VsdCAhPT0gU2Vzc2lvblByb21wdENob2ljZS5DYW5jZWwpIHtcblx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucyhwcm92aWRlci5pZCwgYWNjb3VudE5hbWUsIFt7IGlkOiBleHRlbnNpb25JZCwgbmFtZTogZXh0ZW5zaW9uTmFtZSwgYWxsb3dlZDogcmVzdWx0ID09PSBTZXNzaW9uUHJvbXB0Q2hvaWNlLkFsbG93IH1dKTtcblx0XHRcdHRoaXMucmVtb3ZlQWNjZXNzUmVxdWVzdChwcm92aWRlci5pZCwgZXh0ZW5zaW9uSWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQgPT09IFNlc3Npb25Qcm9tcHRDaG9pY2UuQWxsb3c7XG5cdH1cblxuXHQvKipcblx0ICogVGhpcyBmdW5jdGlvbiBzaG91bGQgYmUgdXNlZCBvbmx5IHdoZW4gdGhlcmUgYXJlIHNlc3Npb25zIHRvIGRpc2FtYmlndWF0ZS5cblx0ICovXG5cdGFzeW5jIHNlbGVjdFNlc3Npb24ocHJvdmlkZXJJZDogc3RyaW5nLCBleHRlbnNpb25JZDogc3RyaW5nLCBleHRlbnNpb25OYW1lOiBzdHJpbmcsIHNjb3BlTGlzdE9yUmVxdWVzdDogUmVhZG9ubHlBcnJheTxzdHJpbmc+IHwgSUF1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdCwgYXZhaWxhYmxlU2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdKTogUHJvbWlzZTxBdXRoZW50aWNhdGlvblNlc3Npb24+IHtcblx0XHRjb25zdCBhbGxBY2NvdW50cyA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRBY2NvdW50cyhwcm92aWRlcklkKTtcblx0XHRpZiAoIWFsbEFjY291bnRzLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBhY2NvdW50cyBhdmFpbGFibGUnKTtcblx0XHR9XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPHsgbGFiZWw6IHN0cmluZzsgc2Vzc2lvbj86IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbjsgYWNjb3VudD86IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQgfT4oKSk7XG5cdFx0cXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRjb25zdCBhY2NvdW50c1dpdGhTZXNzaW9ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGl0ZW1zOiB7IGxhYmVsOiBzdHJpbmc7IHNlc3Npb24/OiBBdXRoZW50aWNhdGlvblNlc3Npb247IGFjY291bnQ/OiBBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50IH1bXSA9IGF2YWlsYWJsZVNlc3Npb25zXG5cdFx0XHQvLyBPbmx5IGdyYWIgdGhlIGZpcnN0IGFjY291bnRcblx0XHRcdC5maWx0ZXIoc2Vzc2lvbiA9PiAhYWNjb3VudHNXaXRoU2Vzc2lvbnMuaGFzKHNlc3Npb24uYWNjb3VudC5sYWJlbCkgJiYgYWNjb3VudHNXaXRoU2Vzc2lvbnMuYWRkKHNlc3Npb24uYWNjb3VudC5sYWJlbCkpXG5cdFx0XHQubWFwKHNlc3Npb24gPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiBzZXNzaW9uLmFjY291bnQubGFiZWwsXG5cdFx0XHRcdFx0c2Vzc2lvbjogc2Vzc2lvblxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cblx0XHQvLyBBZGQgdGhlIGFkZGl0aW9uYWwgYWNjb3VudHMgdGhhdCBoYXZlIGJlZW4gbG9nZ2VkIGludG8gdGhlIHByb3ZpZGVyIGJ1dCBhcmVcblx0XHQvLyBkb24ndCBoYXZlIGEgc2Vzc2lvbiB5ZXQuXG5cdFx0YWxsQWNjb3VudHMuZm9yRWFjaChhY2NvdW50ID0+IHtcblx0XHRcdGlmICghYWNjb3VudHNXaXRoU2Vzc2lvbnMuaGFzKGFjY291bnQubGFiZWwpKSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2goeyBsYWJlbDogYWNjb3VudC5sYWJlbCwgYWNjb3VudCB9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpdGVtcy5wdXNoKHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgndXNlT3RoZXJBY2NvdW50JywgXCJTaWduIGluIHRvIGFub3RoZXIgYWNjb3VudFwiKSB9KTtcblx0XHRxdWlja1BpY2suaXRlbXMgPSBpdGVtcztcblx0XHRxdWlja1BpY2sudGl0bGUgPSBubHMubG9jYWxpemUoXG5cdFx0XHR7XG5cdFx0XHRcdGtleTogJ3NlbGVjdEFjY291bnQnLFxuXHRcdFx0XHRjb21tZW50OiBbJ1RoZSBwbGFjZWhvbGRlciB7MH0gaXMgdGhlIG5hbWUgb2YgYW4gZXh0ZW5zaW9uLiB7MX0gaXMgdGhlIG5hbWUgb2YgdGhlIHR5cGUgb2YgYWNjb3VudCwgc3VjaCBhcyBNaWNyb3NvZnQgb3IgR2l0SHViLiddXG5cdFx0XHR9LFxuXHRcdFx0XCJUaGUgZXh0ZW5zaW9uICd7MH0nIHdhbnRzIHRvIGFjY2VzcyBhIHsxfSBhY2NvdW50XCIsXG5cdFx0XHRleHRlbnNpb25OYW1lLFxuXHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVyKHByb3ZpZGVySWQpLmxhYmVsXG5cdFx0KTtcblx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBubHMubG9jYWxpemUoJ2dldFNlc3Npb25QbGF0ZWhvbGRlcicsIFwiU2VsZWN0IGFuIGFjY291bnQgZm9yICd7MH0nIHRvIHVzZSBvciBFc2MgdG8gY2FuY2VsXCIsIGV4dGVuc2lvbk5hbWUpO1xuXG5cdFx0cmV0dXJuIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoYXN5bmMgXyA9PiB7XG5cdFx0XHRcdHF1aWNrUGljay5kaXNwb3NlKCk7XG5cdFx0XHRcdGxldCBzZXNzaW9uID0gcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0uc2Vzc2lvbjtcblx0XHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWNjb3VudCA9IHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdLmFjY291bnQ7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHNlc3Npb24gPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuY3JlYXRlU2Vzc2lvbihwcm92aWRlcklkLCBzY29wZUxpc3RPclJlcXVlc3QsIHsgYWNjb3VudCB9KTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRyZWplY3QoZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGFjY291bnROYW1lID0gc2Vzc2lvbi5hY2NvdW50LmxhYmVsO1xuXG5cdFx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucyhwcm92aWRlcklkLCBhY2NvdW50TmFtZSwgW3sgaWQ6IGV4dGVuc2lvbklkLCBuYW1lOiBleHRlbnNpb25OYW1lLCBhbGxvd2VkOiB0cnVlIH1dKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlQWNjb3VudEFuZFNlc3Npb25QcmVmZXJlbmNlcyhwcm92aWRlcklkLCBleHRlbnNpb25JZCwgc2Vzc2lvbik7XG5cdFx0XHRcdHRoaXMucmVtb3ZlQWNjZXNzUmVxdWVzdChwcm92aWRlcklkLCBleHRlbnNpb25JZCk7XG5cblx0XHRcdFx0cmVzb2x2ZShzZXNzaW9uKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoXyA9PiB7XG5cdFx0XHRcdGlmICghcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0pIHtcblx0XHRcdFx0XHRyZWplY3QoJ1VzZXIgZGlkIG5vdCBjb25zZW50IHRvIGFjY291bnQgYWNjZXNzJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb21wbGV0ZVNlc3Npb25BY2Nlc3NSZXF1ZXN0KHByb3ZpZGVyOiBJQXV0aGVudGljYXRpb25Qcm92aWRlciwgZXh0ZW5zaW9uSWQ6IHN0cmluZywgZXh0ZW5zaW9uTmFtZTogc3RyaW5nLCBzY29wZUxpc3RPclJlcXVlc3Q6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPiB8IElBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm92aWRlclJlcXVlc3RzID0gdGhpcy5fc2Vzc2lvbkFjY2Vzc1JlcXVlc3RJdGVtcy5nZXQocHJvdmlkZXIuaWQpIHx8IHt9O1xuXHRcdGNvbnN0IGV4aXN0aW5nUmVxdWVzdCA9IHByb3ZpZGVyUmVxdWVzdHNbZXh0ZW5zaW9uSWRdO1xuXHRcdGlmICghZXhpc3RpbmdSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwb3NzaWJsZVNlc3Npb25zID0gZXhpc3RpbmdSZXF1ZXN0LnBvc3NpYmxlU2Vzc2lvbnM7XG5cblx0XHRsZXQgc2Vzc2lvbjogQXV0aGVudGljYXRpb25TZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChwcm92aWRlci5zdXBwb3J0c011bHRpcGxlQWNjb3VudHMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHNlc3Npb24gPSBhd2FpdCB0aGlzLnNlbGVjdFNlc3Npb24ocHJvdmlkZXIuaWQsIGV4dGVuc2lvbklkLCBleHRlbnNpb25OYW1lLCBzY29wZUxpc3RPclJlcXVlc3QsIHBvc3NpYmxlU2Vzc2lvbnMpO1xuXHRcdFx0fSBjYXRjaCAoXykge1xuXHRcdFx0XHQvLyBpZ25vcmUgY2FuY2VsXG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGFwcHJvdmVkID0gYXdhaXQgdGhpcy5zaG93R2V0U2Vzc2lvblByb21wdChwcm92aWRlciwgcG9zc2libGVTZXNzaW9uc1swXS5hY2NvdW50LmxhYmVsLCBleHRlbnNpb25JZCwgZXh0ZW5zaW9uTmFtZSk7XG5cdFx0XHRpZiAoYXBwcm92ZWQpIHtcblx0XHRcdFx0c2Vzc2lvbiA9IHBvc3NpYmxlU2Vzc2lvbnNbMF07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLmFkZEFjY291bnRVc2FnZShwcm92aWRlci5pZCwgc2Vzc2lvbi5hY2NvdW50LmxhYmVsLCBzZXNzaW9uLnNjb3BlcywgZXh0ZW5zaW9uSWQsIGV4dGVuc2lvbk5hbWUpO1xuXHRcdH1cblx0fVxuXG5cdHJlcXVlc3RTZXNzaW9uQWNjZXNzKHByb3ZpZGVySWQ6IHN0cmluZywgZXh0ZW5zaW9uSWQ6IHN0cmluZywgZXh0ZW5zaW9uTmFtZTogc3RyaW5nLCBzY29wZUxpc3RPclJlcXVlc3Q6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPiB8IElBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3QsIHBvc3NpYmxlU2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXJSZXF1ZXN0cyA9IHRoaXMuX3Nlc3Npb25BY2Nlc3NSZXF1ZXN0SXRlbXMuZ2V0KHByb3ZpZGVySWQpIHx8IHt9O1xuXHRcdGNvbnN0IGhhc0V4aXN0aW5nUmVxdWVzdCA9IHByb3ZpZGVyUmVxdWVzdHNbZXh0ZW5zaW9uSWRdO1xuXHRcdGlmIChoYXNFeGlzdGluZ1JlcXVlc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRjb25zdCBtZW51SXRlbSA9IE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQWNjb3VudHNDb250ZXh0LCB7XG5cdFx0XHRncm91cDogJzNfYWNjZXNzUmVxdWVzdHMnLFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogYCR7cHJvdmlkZXJJZH0ke2V4dGVuc2lvbklkfUFjY2Vzc2AsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdGtleTogJ2FjY2Vzc1JlcXVlc3QnLFxuXHRcdFx0XHRcdGNvbW1lbnQ6IFtgVGhlIHBsYWNlaG9sZGVyIHswfSB3aWxsIGJlIHJlcGxhY2VkIHdpdGggYW4gYXV0aGVudGljYXRpb24gcHJvdmlkZXInJ3MgbGFiZWwuIHsxfSB3aWxsIGJlIHJlcGxhY2VkIHdpdGggYW4gZXh0ZW5zaW9uIG5hbWUuICgxKSBpcyB0byBpbmRpY2F0ZSB0aGF0IHRoaXMgbWVudSBpdGVtIGNvbnRyaWJ1dGVzIHRvIGEgYmFkZ2UgY291bnRgXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRcdFwiR3JhbnQgYWNjZXNzIHRvIHswfSBmb3IgezF9Li4uICgxKVwiLFxuXHRcdFx0XHRcdHByb3ZpZGVyLmxhYmVsLFxuXHRcdFx0XHRcdGV4dGVuc2lvbk5hbWUpXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhY2Nlc3NDb21tYW5kID0gQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdFx0aWQ6IGAke3Byb3ZpZGVySWR9JHtleHRlbnNpb25JZH1BY2Nlc3NgLFxuXHRcdFx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdHRoaXMuY29tcGxldGVTZXNzaW9uQWNjZXNzUmVxdWVzdChwcm92aWRlciwgZXh0ZW5zaW9uSWQsIGV4dGVuc2lvbk5hbWUsIHNjb3BlTGlzdE9yUmVxdWVzdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRwcm92aWRlclJlcXVlc3RzW2V4dGVuc2lvbklkXSA9IHsgcG9zc2libGVTZXNzaW9ucywgZGlzcG9zYWJsZXM6IFttZW51SXRlbSwgYWNjZXNzQ29tbWFuZF0gfTtcblx0XHR0aGlzLl9zZXNzaW9uQWNjZXNzUmVxdWVzdEl0ZW1zLnNldChwcm92aWRlcklkLCBwcm92aWRlclJlcXVlc3RzKTtcblx0XHR0aGlzLnVwZGF0ZUJhZGdlQ291bnQoKTtcblx0fVxuXG5cdGFzeW5jIHJlcXVlc3ROZXdTZXNzaW9uKHByb3ZpZGVySWQ6IHN0cmluZywgc2NvcGVMaXN0T3JSZXF1ZXN0OiBSZWFkb25seUFycmF5PHN0cmluZz4gfCBJQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0LCBleHRlbnNpb25JZDogc3RyaW5nLCBleHRlbnNpb25OYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5pc0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJSZWdpc3RlcmVkKHByb3ZpZGVySWQpKSB7XG5cdFx0XHQvLyBBY3RpdmF0ZSBoYXMgYWxyZWFkeSBiZWVuIGNhbGxlZCBmb3IgdGhlIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyLCBidXQgaXQgY2Fubm90IGJsb2NrIG9uIHJlZ2lzdGVyaW5nIGl0c2VsZlxuXHRcdFx0Ly8gc2luY2UgdGhpcyBpcyBzeW5jIGFuZCByZXR1cm5zIGEgZGlzcG9zYWJsZS4gU28sIHdhaXQgZm9yIHJlZ2lzdHJhdGlvbiBldmVudCB0byBmaXJlIHRoYXQgaW5kaWNhdGVzIHRoZVxuXHRcdFx0Ly8gcHJvdmlkZXIgaXMgbm93IGluIHRoZSBtYXAuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgXykgPT4ge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NlID0gdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkUmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLmlkID09PSBwcm92aWRlcklkKSB7XG5cdFx0XHRcdFx0XHRkaXNwb3NlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0bGV0IHByb3ZpZGVyOiBJQXV0aGVudGljYXRpb25Qcm92aWRlcjtcblx0XHR0cnkge1xuXHRcdFx0cHJvdmlkZXIgPSB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIocHJvdmlkZXJJZCk7XG5cdFx0fSBjYXRjaCAoX2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlclJlcXVlc3RzID0gdGhpcy5fc2lnbkluUmVxdWVzdEl0ZW1zLmdldChwcm92aWRlcklkKTtcblx0XHRjb25zdCBzaWduSW5SZXF1ZXN0S2V5ID0gaXNBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3Qoc2NvcGVMaXN0T3JSZXF1ZXN0KVxuXHRcdFx0PyBgJHtzY29wZUxpc3RPclJlcXVlc3Qud3d3QXV0aGVudGljYXRlfToke3Njb3BlTGlzdE9yUmVxdWVzdC5mYWxsYmFja1Njb3Blcz8uam9pbihTQ09QRVNMSVNUX1NFUEFSQVRPUikgPz8gJyd9YFxuXHRcdFx0OiBgJHtzY29wZUxpc3RPclJlcXVlc3Quam9pbihTQ09QRVNMSVNUX1NFUEFSQVRPUil9YDtcblx0XHRjb25zdCBleHRlbnNpb25IYXNFeGlzdGluZ1JlcXVlc3QgPSBwcm92aWRlclJlcXVlc3RzXG5cdFx0XHQmJiBwcm92aWRlclJlcXVlc3RzW3NpZ25JblJlcXVlc3RLZXldXG5cdFx0XHQmJiBwcm92aWRlclJlcXVlc3RzW3NpZ25JblJlcXVlc3RLZXldLnJlcXVlc3RpbmdFeHRlbnNpb25JZHMuaW5jbHVkZXMoZXh0ZW5zaW9uSWQpO1xuXG5cdFx0aWYgKGV4dGVuc2lvbkhhc0V4aXN0aW5nUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENvbnN0cnVjdCBhIGNvbW1hbmRJZCB0aGF0IHdvbid0IGNsYXNoIHdpdGggb3RoZXJzIGdlbmVyYXRlZCBoZXJlLCBub3IgbGlrZWx5IHdpdGggYW4gZXh0ZW5zaW9uJ3MgY29tbWFuZFxuXHRcdGNvbnN0IGNvbW1hbmRJZCA9IGAke3Byb3ZpZGVySWR9OiR7ZXh0ZW5zaW9uSWR9OnNpZ25JbiR7T2JqZWN0LmtleXMocHJvdmlkZXJSZXF1ZXN0cyB8fCBbXSkubGVuZ3RofWA7XG5cdFx0Y29uc3QgbWVudUl0ZW0gPSBNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkFjY291bnRzQ29udGV4dCwge1xuXHRcdFx0Z3JvdXA6ICcyX3NpZ25JblJlcXVlc3RzJyxcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IGNvbW1hbmRJZCxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0a2V5OiAnc2lnbkluUmVxdWVzdCcsXG5cdFx0XHRcdFx0Y29tbWVudDogW2BUaGUgcGxhY2Vob2xkZXIgezB9IHdpbGwgYmUgcmVwbGFjZWQgd2l0aCBhbiBhdXRoZW50aWNhdGlvbiBwcm92aWRlcidzIGxhYmVsLiB7MX0gd2lsbCBiZSByZXBsYWNlZCB3aXRoIGFuIGV4dGVuc2lvbiBuYW1lLiAoMSkgaXMgdG8gaW5kaWNhdGUgdGhhdCB0aGlzIG1lbnUgaXRlbSBjb250cmlidXRlcyB0byBhIGJhZGdlIGNvdW50LmBdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFx0XCJTaWduIGluIHdpdGggezB9IHRvIHVzZSB7MX0gKDEpXCIsXG5cdFx0XHRcdFx0cHJvdmlkZXIubGFiZWwsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uTmFtZSlcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHNpZ25JbkNvbW1hbmQgPSBDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdFx0XHRpZDogY29tbWFuZElkLFxuXHRcdFx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQXV0aGVudGljYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5jcmVhdGVTZXNzaW9uKHByb3ZpZGVySWQsIHNjb3BlTGlzdE9yUmVxdWVzdCk7XG5cblx0XHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRFeHRlbnNpb25zKHByb3ZpZGVySWQsIHNlc3Npb24uYWNjb3VudC5sYWJlbCwgW3sgaWQ6IGV4dGVuc2lvbklkLCBuYW1lOiBleHRlbnNpb25OYW1lLCBhbGxvd2VkOiB0cnVlIH1dKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlQWNjb3VudEFuZFNlc3Npb25QcmVmZXJlbmNlcyhwcm92aWRlcklkLCBleHRlbnNpb25JZCwgc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblxuXHRcdGlmIChwcm92aWRlclJlcXVlc3RzKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZ1JlcXVlc3QgPSBwcm92aWRlclJlcXVlc3RzW3NpZ25JblJlcXVlc3RLZXldIHx8IHsgZGlzcG9zYWJsZXM6IFtdLCByZXF1ZXN0aW5nRXh0ZW5zaW9uSWRzOiBbXSB9O1xuXG5cdFx0XHRwcm92aWRlclJlcXVlc3RzW3NpZ25JblJlcXVlc3RLZXldID0ge1xuXHRcdFx0XHRkaXNwb3NhYmxlczogWy4uLmV4aXN0aW5nUmVxdWVzdC5kaXNwb3NhYmxlcywgbWVudUl0ZW0sIHNpZ25JbkNvbW1hbmRdLFxuXHRcdFx0XHRyZXF1ZXN0aW5nRXh0ZW5zaW9uSWRzOiBbLi4uZXhpc3RpbmdSZXF1ZXN0LnJlcXVlc3RpbmdFeHRlbnNpb25JZHMsIGV4dGVuc2lvbklkXVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3NpZ25JblJlcXVlc3RJdGVtcy5zZXQocHJvdmlkZXJJZCwgcHJvdmlkZXJSZXF1ZXN0cyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3NpZ25JblJlcXVlc3RJdGVtcy5zZXQocHJvdmlkZXJJZCwge1xuXHRcdFx0XHRbc2lnbkluUmVxdWVzdEtleV06IHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlczogW21lbnVJdGVtLCBzaWduSW5Db21tYW5kXSxcblx0XHRcdFx0XHRyZXF1ZXN0aW5nRXh0ZW5zaW9uSWRzOiBbZXh0ZW5zaW9uSWRdXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlQmFkZ2VDb3VudCgpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLCBBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLGlCQUFpQixTQUFzQix5QkFBeUI7QUFDckYsU0FBUyxtQkFBbUI7QUFDNUIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsUUFBUSxvQkFBb0I7QUFDckMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsa0JBQWtCLG1CQUFtQjtBQUM5QyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLG1DQUFtQztBQUM1QyxTQUF5RCx3QkFBd0Isa0NBQXVHLDhDQUE4QztBQUN0TyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFHcEMsTUFBTSx1QkFBdUI7QUFZdEIsSUFBTSxrQ0FBTixjQUE4QyxXQUF1RDtBQUFBLEVBWTNHLFlBQ29DLGlCQUNELGdCQUNELGVBQ0ksbUJBQ0gsaUJBQ08sd0JBQ0ssNkJBQ0MsOEJBQzlDO0FBQ0QsVUFBTTtBQVQ2QjtBQUNEO0FBQ0Q7QUFDSTtBQUNIO0FBQ087QUFDSztBQUNDO0FBbEJoRCxTQUFRLHNCQUFzQixvQkFBSSxJQUFnQztBQUNsRSxTQUFRLDZCQUE2QixvQkFBSSxJQUFrSDtBQUMz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
