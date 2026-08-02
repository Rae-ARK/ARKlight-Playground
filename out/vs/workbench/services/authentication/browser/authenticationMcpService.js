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
import { IAuthenticationMcpAccessService } from "./authenticationMcpAccessService.js";
import { IAuthenticationMcpUsageService } from "./authenticationMcpUsageService.js";
import { IAuthenticationService } from "../common/authentication.js";
import { Emitter } from "../../../../base/common/event.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
const SCOPESLIST_SEPARATOR = " ";
const IAuthenticationMcpService = createDecorator("IAuthenticationMcpService");
let AuthenticationMcpService = class extends Disposable {
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
    this._register(this._authenticationService.onDidChangeSessions(async (e) => {
      if (e.event.added?.length) {
        await this.updateNewSessionRequests(e.providerId, e.event.added);
      }
      if (e.event.removed?.length) {
        await this.updateAccessRequests(e.providerId, e.event.removed);
      }
      this.updateBadgeCount();
    }));
    this._register(this._authenticationService.onDidUnregisterAuthenticationProvider((e) => {
      const accessRequests = this._sessionAccessRequestItems.get(e.id) || {};
      Object.keys(accessRequests).forEach((mcpServerId) => {
        this.removeAccessRequest(e.id, mcpServerId);
      });
    }));
  }
  async updateNewSessionRequests(providerId, addedSessions) {
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
      }
    });
  }
  async updateAccessRequests(providerId, removedSessions) {
    const providerRequests = this._sessionAccessRequestItems.get(providerId);
    if (providerRequests) {
      Object.keys(providerRequests).forEach((mcpServerId) => {
        removedSessions.forEach((removed) => {
          const indexOfSession = providerRequests[mcpServerId].possibleSessions.findIndex((session) => session.id === removed.id);
          if (indexOfSession) {
            providerRequests[mcpServerId].possibleSessions.splice(indexOfSession, 1);
          }
        });
        if (!providerRequests[mcpServerId].possibleSessions.length) {
          this.removeAccessRequest(providerId, mcpServerId);
        }
      });
    }
  }
  updateBadgeCount() {
    this._accountBadgeDisposable.clear();
    let numberOfRequests = 0;
    this._signInRequestItems.forEach((providerRequests) => {
      Object.keys(providerRequests).forEach((request) => {
        numberOfRequests += providerRequests[request].requestingMcpServerIds.length;
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
  removeAccessRequest(providerId, mcpServerId) {
    const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
    if (providerRequests[mcpServerId]) {
      dispose(providerRequests[mcpServerId].disposables);
      delete providerRequests[mcpServerId];
      this.updateBadgeCount();
    }
  }
  //#region Account/Session Preference
  updateAccountPreference(mcpServerId, providerId, account) {
    const parentMcpServerId = this._inheritAuthAccountPreferenceChildToParent[mcpServerId] ?? mcpServerId;
    const key = this._getKey(parentMcpServerId, providerId);
    this.storageService.store(key, account.label, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this.storageService.store(key, account.label, StorageScope.APPLICATION, StorageTarget.MACHINE);
    const childrenMcpServers = this._inheritAuthAccountPreferenceParentToChildren[parentMcpServerId];
    const mcpServerIds = childrenMcpServers ? [parentMcpServerId, ...childrenMcpServers] : [parentMcpServerId];
    this._onDidAccountPreferenceChange.fire({ mcpServerIds, providerId });
  }
  getAccountPreference(mcpServerId, providerId) {
    const key = this._getKey(this._inheritAuthAccountPreferenceChildToParent[mcpServerId] ?? mcpServerId, providerId);
    return this.storageService.get(key, StorageScope.WORKSPACE) ?? this.storageService.get(key, StorageScope.APPLICATION);
  }
  removeAccountPreference(mcpServerId, providerId) {
    const key = this._getKey(this._inheritAuthAccountPreferenceChildToParent[mcpServerId] ?? mcpServerId, providerId);
    this.storageService.remove(key, StorageScope.WORKSPACE);
    this.storageService.remove(key, StorageScope.APPLICATION);
  }
  _getKey(mcpServerId, providerId) {
    return `${mcpServerId}-${providerId}`;
  }
  // TODO@TylerLeonhardt: Remove all of this after a couple iterations
  updateSessionPreference(providerId, mcpServerId, session) {
    const key = `${mcpServerId}-${providerId}-${session.scopes.join(SCOPESLIST_SEPARATOR)}`;
    this.storageService.store(key, session.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this.storageService.store(key, session.id, StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  getSessionPreference(providerId, mcpServerId, scopes) {
    const key = `${mcpServerId}-${providerId}-${scopes.join(SCOPESLIST_SEPARATOR)}`;
    return this.storageService.get(key, StorageScope.WORKSPACE) ?? this.storageService.get(key, StorageScope.APPLICATION);
  }
  removeSessionPreference(providerId, mcpServerId, scopes) {
    const key = `${mcpServerId}-${providerId}-${scopes.join(SCOPESLIST_SEPARATOR)}`;
    this.storageService.remove(key, StorageScope.WORKSPACE);
    this.storageService.remove(key, StorageScope.APPLICATION);
  }
  _updateAccountAndSessionPreferences(providerId, mcpServerId, session) {
    this.updateAccountPreference(mcpServerId, providerId, session.account);
    this.updateSessionPreference(providerId, mcpServerId, session);
  }
  //#endregion
  async showGetSessionPrompt(provider, accountName, mcpServerId, mcpServerName) {
    let SessionPromptChoice;
    ((SessionPromptChoice2) => {
      SessionPromptChoice2[SessionPromptChoice2["Allow"] = 0] = "Allow";
      SessionPromptChoice2[SessionPromptChoice2["Deny"] = 1] = "Deny";
      SessionPromptChoice2[SessionPromptChoice2["Cancel"] = 2] = "Cancel";
    })(SessionPromptChoice || (SessionPromptChoice = {}));
    const { result } = await this.dialogService.prompt({
      type: Severity.Info,
      message: nls.localize("confirmAuthenticationAccess", "The MCP server '{0}' wants to access the {1} account '{2}'.", mcpServerName, provider.label, accountName),
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
      this._authenticationAccessService.updateAllowedMcpServers(provider.id, accountName, [{ id: mcpServerId, name: mcpServerName, allowed: result === 0 /* Allow */ }]);
      this.removeAccessRequest(provider.id, mcpServerId);
    }
    return result === 0 /* Allow */;
  }
  /**
   * This function should be used only when there are sessions to disambiguate.
   */
  async selectSession(providerId, mcpServerId, mcpServerName, scopes, availableSessions) {
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
        comment: ["The placeholder {0} is the name of a MCP server. {1} is the name of the type of account, such as Microsoft or GitHub."]
      },
      "The MCP server '{0}' wants to access a {1} account",
      mcpServerName,
      this._authenticationService.getProvider(providerId).label
    );
    quickPick.placeholder = nls.localize("getSessionPlateholder", "Select an account for '{0}' to use or Esc to cancel", mcpServerName);
    return await new Promise((resolve, reject) => {
      disposables.add(quickPick.onDidAccept(async (_) => {
        quickPick.dispose();
        let session = quickPick.selectedItems[0].session;
        if (!session) {
          const account = quickPick.selectedItems[0].account;
          try {
            session = await this._authenticationService.createSession(providerId, scopes, { account });
          } catch (e) {
            reject(e);
            return;
          }
        }
        const accountName = session.account.label;
        this._authenticationAccessService.updateAllowedMcpServers(providerId, accountName, [{ id: mcpServerId, name: mcpServerName, allowed: true }]);
        this._updateAccountAndSessionPreferences(providerId, mcpServerId, session);
        this.removeAccessRequest(providerId, mcpServerId);
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
  async completeSessionAccessRequest(provider, mcpServerId, mcpServerName, scopes) {
    const providerRequests = this._sessionAccessRequestItems.get(provider.id) || {};
    const existingRequest = providerRequests[mcpServerId];
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
        session = await this.selectSession(provider.id, mcpServerId, mcpServerName, scopes, possibleSessions);
      } catch (_) {
      }
    } else {
      const approved = await this.showGetSessionPrompt(provider, possibleSessions[0].account.label, mcpServerId, mcpServerName);
      if (approved) {
        session = possibleSessions[0];
      }
    }
    if (session) {
      this._authenticationUsageService.addAccountUsage(provider.id, session.account.label, session.scopes, mcpServerId, mcpServerName);
    }
  }
  requestSessionAccess(providerId, mcpServerId, mcpServerName, scopes, possibleSessions) {
    const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
    const hasExistingRequest = providerRequests[mcpServerId];
    if (hasExistingRequest) {
      return;
    }
    const provider = this._authenticationService.getProvider(providerId);
    const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
      group: "3_accessRequests",
      command: {
        id: `${providerId}${mcpServerId}Access`,
        title: nls.localize(
          {
            key: "accessRequest",
            comment: [`The placeholder {0} will be replaced with an authentication provider''s label. {1} will be replaced with a MCP server name. (1) is to indicate that this menu item contributes to a badge count`]
          },
          "Grant access to {0} for {1}... (1)",
          provider.label,
          mcpServerName
        )
      }
    });
    const accessCommand = CommandsRegistry.registerCommand({
      id: `${providerId}${mcpServerId}Access`,
      handler: async (accessor) => {
        this.completeSessionAccessRequest(provider, mcpServerId, mcpServerName, scopes);
      }
    });
    providerRequests[mcpServerId] = { possibleSessions, disposables: [menuItem, accessCommand] };
    this._sessionAccessRequestItems.set(providerId, providerRequests);
    this.updateBadgeCount();
  }
  async requestNewSession(providerId, scopes, mcpServerId, mcpServerName) {
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
    const scopesList = scopes.join(SCOPESLIST_SEPARATOR);
    const mcpServerHasExistingRequest = providerRequests && providerRequests[scopesList] && providerRequests[scopesList].requestingMcpServerIds.includes(mcpServerId);
    if (mcpServerHasExistingRequest) {
      return;
    }
    const commandId = `${providerId}:${mcpServerId}:signIn${Object.keys(providerRequests || []).length}`;
    const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
      group: "2_signInRequests",
      command: {
        id: commandId,
        title: nls.localize(
          {
            key: "signInRequest",
            comment: [`The placeholder {0} will be replaced with an authentication provider's label. {1} will be replaced with a MCP server name. (1) is to indicate that this menu item contributes to a badge count.`]
          },
          "Sign in with {0} to use {1} (1)",
          provider.label,
          mcpServerName
        )
      }
    });
    const signInCommand = CommandsRegistry.registerCommand({
      id: commandId,
      handler: async (accessor) => {
        const authenticationService = accessor.get(IAuthenticationService);
        const session = await authenticationService.createSession(providerId, scopes);
        this._authenticationAccessService.updateAllowedMcpServers(providerId, session.account.label, [{ id: mcpServerId, name: mcpServerName, allowed: true }]);
        this._updateAccountAndSessionPreferences(providerId, mcpServerId, session);
      }
    });
    if (providerRequests) {
      const existingRequest = providerRequests[scopesList] || { disposables: [], requestingMcpServerIds: [] };
      providerRequests[scopesList] = {
        disposables: [...existingRequest.disposables, menuItem, signInCommand],
        requestingMcpServerIds: [...existingRequest.requestingMcpServerIds, mcpServerId]
      };
      this._signInRequestItems.set(providerId, providerRequests);
    } else {
      this._signInRequestItems.set(providerId, {
        [scopesList]: {
          disposables: [menuItem, signInCommand],
          requestingMcpServerIds: [mcpServerId]
        }
      });
    }
    this.updateBadgeCount();
  }
};
AuthenticationMcpService = __decorateClass([
  __decorateParam(0, IActivityService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IAuthenticationService),
  __decorateParam(6, IAuthenticationMcpUsageService),
  __decorateParam(7, IAuthenticationMcpAccessService)
], AuthenticationMcpService);
registerSingleton(IAuthenticationMcpService, AuthenticationMcpService, InstantiationType.Delayed);
export {
  AuthenticationMcpService,
  IAuthenticationMcpService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uTWNwU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHNjb3Blc01hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2F1dGguanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElBY3Rpdml0eVNlcnZpY2UsIE51bWJlckJhZGdlIH0gZnJvbSAnLi4vLi4vYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UgfSBmcm9tICcuL2F1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UgfSBmcm9tICcuL2F1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiwgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIsIElBdXRoZW50aWNhdGlvblNlcnZpY2UsIEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQgfSBmcm9tICcuLi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcblxuLy8gT0F1dGgyIHNwZWMgcHJvaGliaXRzIHNwYWNlIGluIGEgc2NvcGUsIHNvIHVzZSB0aGF0IHRvIGpvaW4gdGhlbS5cbmNvbnN0IFNDT1BFU0xJU1RfU0VQQVJBVE9SID0gJyAnO1xuXG5pbnRlcmZhY2UgU2Vzc2lvblJlcXVlc3Qge1xuXHRkaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXTtcblx0cmVxdWVzdGluZ01jcFNlcnZlcklkczogc3RyaW5nW107XG59XG5cbmludGVyZmFjZSBTZXNzaW9uUmVxdWVzdEluZm8ge1xuXHRbc2NvcGVzTGlzdDogc3RyaW5nXTogU2Vzc2lvblJlcXVlc3Q7XG59XG5cbi8vIFRPRE86IE1vdmUgdGhpcyBpbnRvIE1haW5UaHJlYWRBdXRoZW50aWNhdGlvblxuZXhwb3J0IGNvbnN0IElBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZT4oJ0lBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UnKTtcbmV4cG9ydCBpbnRlcmZhY2UgSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogRmlyZXMgd2hlbiBhbiBhY2NvdW50IHByZWZlcmVuY2UgZm9yIGEgc3BlY2lmaWMgcHJvdmlkZXIgaGFzIGNoYW5nZWQgZm9yIHRoZSBzcGVjaWZpZWQgTUNQIHNlcnZlcnMuIERvZXMgbm90IGZpcmUgd2hlbjpcblx0ICogKiBBbiBhY2NvdW50IHByZWZlcmVuY2UgaXMgcmVtb3ZlZFxuXHQgKiAqIEEgc2Vzc2lvbiBwcmVmZXJlbmNlIGlzIGNoYW5nZWQgKGJlY2F1c2UgaXQncyBkZXByZWNhdGVkKVxuXHQgKiAqIEEgc2Vzc2lvbiBwcmVmZXJlbmNlIGlzIHJlbW92ZWQgKGJlY2F1c2UgaXQncyBkZXByZWNhdGVkKVxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY2NvdW50UHJlZmVyZW5jZTogRXZlbnQ8eyBtY3BTZXJ2ZXJJZHM6IHN0cmluZ1tdOyBwcm92aWRlcklkOiBzdHJpbmcgfT47XG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBhY2NvdW50TmFtZSAoYWxzbyBrbm93biBhcyBhY2NvdW50LmxhYmVsKSB0byBwYWlyIHdpdGggYElBdXRoZW50aWNhdGlvbk1DUFNlcnZlckFjY2Vzc1NlcnZpY2VgIHRvIGdldCB0aGUgYWNjb3VudCBwcmVmZXJlbmNlXG5cdCAqIEBwYXJhbSBwcm92aWRlcklkIFRoZSBhdXRoZW50aWNhdGlvbiBwcm92aWRlciBpZFxuXHQgKiBAcGFyYW0gbWNwU2VydmVySWQgVGhlIE1DUCBzZXJ2ZXIgaWQgdG8gZ2V0IHRoZSBwcmVmZXJlbmNlIGZvclxuXHQgKiBAcmV0dXJucyBUaGUgYWNjb3VudE5hbWUgb2YgdGhlIHByZWZlcmVuY2UsIG9yIHVuZGVmaW5lZCBpZiB0aGVyZSBpcyBubyBwcmVmZXJlbmNlIHNldFxuXHQgKi9cblx0Z2V0QWNjb3VudFByZWZlcmVuY2UobWNwU2VydmVySWQ6IHN0cmluZywgcHJvdmlkZXJJZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogU2V0cyB0aGUgYWNjb3VudCBwcmVmZXJlbmNlIGZvciB0aGUgZ2l2ZW4gcHJvdmlkZXIgYW5kIE1DUCBzZXJ2ZXJcblx0ICogQHBhcmFtIHByb3ZpZGVySWQgVGhlIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIGlkXG5cdCAqIEBwYXJhbSBtY3BTZXJ2ZXJJZCBUaGUgTUNQIHNlcnZlciBpZCB0byBzZXQgdGhlIHByZWZlcmVuY2UgZm9yXG5cdCAqIEBwYXJhbSBhY2NvdW50IFRoZSBhY2NvdW50IHRvIHNldCB0aGUgcHJlZmVyZW5jZSB0b1xuXHQgKi9cblx0dXBkYXRlQWNjb3VudFByZWZlcmVuY2UobWNwU2VydmVySWQ6IHN0cmluZywgcHJvdmlkZXJJZDogc3RyaW5nLCBhY2NvdW50OiBBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50KTogdm9pZDtcblx0LyoqXG5cdCAqIFJlbW92ZXMgdGhlIGFjY291bnQgcHJlZmVyZW5jZSBmb3IgdGhlIGdpdmVuIHByb3ZpZGVyIGFuZCBNQ1Agc2VydmVyXG5cdCAqIEBwYXJhbSBwcm92aWRlcklkIFRoZSBhdXRoZW50aWNhdGlvbiBwcm92aWRlciBpZFxuXHQgKiBAcGFyYW0gbWNwU2VydmVySWQgVGhlIE1DUCBzZXJ2ZXIgaWQgdG8gcmVtb3ZlIHRoZSBwcmVmZXJlbmNlIGZvclxuXHQgKi9cblx0cmVtb3ZlQWNjb3VudFByZWZlcmVuY2UobWNwU2VydmVySWQ6IHN0cmluZywgcHJvdmlkZXJJZDogc3RyaW5nKTogdm9pZDtcblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIFNldHMgdGhlIHNlc3Npb24gcHJlZmVyZW5jZSBmb3IgdGhlIGdpdmVuIHByb3ZpZGVyIGFuZCBNQ1Agc2VydmVyXG5cdCAqIEBwYXJhbSBwcm92aWRlcklkXG5cdCAqIEBwYXJhbSBtY3BTZXJ2ZXJJZFxuXHQgKiBAcGFyYW0gc2Vzc2lvblxuXHQgKi9cblx0dXBkYXRlU2Vzc2lvblByZWZlcmVuY2UocHJvdmlkZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJJZDogc3RyaW5nLCBzZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb24pOiB2b2lkO1xuXHQvKipcblx0ICogQGRlcHJlY2F0ZWQgR2V0cyB0aGUgc2Vzc2lvbiBwcmVmZXJlbmNlIGZvciB0aGUgZ2l2ZW4gcHJvdmlkZXIgYW5kIE1DUCBzZXJ2ZXJcblx0ICogQHBhcmFtIHByb3ZpZGVySWRcblx0ICogQHBhcmFtIG1jcFNlcnZlcklkXG5cdCAqIEBwYXJhbSBzY29wZXNcblx0ICovXG5cdGdldFNlc3Npb25QcmVmZXJlbmNlKHByb3ZpZGVySWQ6IHN0cmluZywgbWNwU2VydmVySWQ6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIFJlbW92ZXMgdGhlIHNlc3Npb24gcHJlZmVyZW5jZSBmb3IgdGhlIGdpdmVuIHByb3ZpZGVyIGFuZCBNQ1Agc2VydmVyXG5cdCAqIEBwYXJhbSBwcm92aWRlcklkXG5cdCAqIEBwYXJhbSBtY3BTZXJ2ZXJJZFxuXHQgKiBAcGFyYW0gc2NvcGVzXG5cdCAqL1xuXHRyZW1vdmVTZXNzaW9uUHJlZmVyZW5jZShwcm92aWRlcklkOiBzdHJpbmcsIG1jcFNlcnZlcklkOiBzdHJpbmcsIHNjb3Blczogc3RyaW5nW10pOiB2b2lkO1xuXHRzZWxlY3RTZXNzaW9uKHByb3ZpZGVySWQ6IHN0cmluZywgbWNwU2VydmVySWQ6IHN0cmluZywgbWNwU2VydmVyTmFtZTogc3RyaW5nLCBzY29wZXM6IHN0cmluZ1tdLCBwb3NzaWJsZVNlc3Npb25zOiByZWFkb25seSBBdXRoZW50aWNhdGlvblNlc3Npb25bXSk6IFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uPjtcblx0cmVxdWVzdFNlc3Npb25BY2Nlc3MocHJvdmlkZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJOYW1lOiBzdHJpbmcsIHNjb3Blczogc3RyaW5nW10sIHBvc3NpYmxlU2Vzc2lvbnM6IHJlYWRvbmx5IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdKTogdm9pZDtcblx0cmVxdWVzdE5ld1Nlc3Npb24ocHJvdmlkZXJJZDogc3RyaW5nLCBzY29wZXM6IHN0cmluZ1tdLCBtY3BTZXJ2ZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG4vLyBUT0RPQFR5bGVyTGVvbmhhcmR0OiBUaGlzIHNob3VsZCBhbGwgZ28gaW4gTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uXG5leHBvcnQgY2xhc3MgQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2lnbkluUmVxdWVzdEl0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIFNlc3Npb25SZXF1ZXN0SW5mbz4oKTtcblx0cHJpdmF0ZSBfc2Vzc2lvbkFjY2Vzc1JlcXVlc3RJdGVtcyA9IG5ldyBNYXA8c3RyaW5nLCB7IFttY3BTZXJ2ZXJJZDogc3RyaW5nXTogeyBkaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXTsgcG9zc2libGVTZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10gfSB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY2NvdW50QmFkZ2VEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgX29uRGlkQWNjb3VudFByZWZlcmVuY2VDaGFuZ2U6IEVtaXR0ZXI8eyBwcm92aWRlcklkOiBzdHJpbmc7IG1jcFNlcnZlcklkczogc3RyaW5nW10gfT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHByb3ZpZGVySWQ6IHN0cmluZzsgbWNwU2VydmVySWRzOiBzdHJpbmdbXSB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY2NvdW50UHJlZmVyZW5jZSA9IHRoaXMuX29uRGlkQWNjb3VudFByZWZlcmVuY2VDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfaW5oZXJpdEF1dGhBY2NvdW50UHJlZmVyZW5jZVBhcmVudFRvQ2hpbGRyZW46IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPjtcblx0cHJpdmF0ZSBfaW5oZXJpdEF1dGhBY2NvdW50UHJlZmVyZW5jZUNoaWxkVG9QYXJlbnQ6IHsgW21jcFNlcnZlcklkOiBzdHJpbmddOiBzdHJpbmcgfTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2U6IElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U6IElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlUGFyZW50VG9DaGlsZHJlbiA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmluaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2UgfHwge307XG5cdFx0dGhpcy5faW5oZXJpdEF1dGhBY2NvdW50UHJlZmVyZW5jZUNoaWxkVG9QYXJlbnQgPSBPYmplY3QuZW50cmllcyh0aGlzLl9pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlUGFyZW50VG9DaGlsZHJlbikucmVkdWNlPHsgW21jcFNlcnZlcklkOiBzdHJpbmddOiBzdHJpbmcgfT4oKGFjYywgW3BhcmVudCwgY2hpbGRyZW5dKSA9PiB7XG5cdFx0XHRjaGlsZHJlbi5mb3JFYWNoKChjaGlsZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGFjY1tjaGlsZF0gPSBwYXJlbnQ7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBhY2M7XG5cdFx0fSwge30pO1xuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoZS5ldmVudC5hZGRlZD8ubGVuZ3RoKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTmV3U2Vzc2lvblJlcXVlc3RzKGUucHJvdmlkZXJJZCwgZS5ldmVudC5hZGRlZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5ldmVudC5yZW1vdmVkPy5sZW5ndGgpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVBY2Nlc3NSZXF1ZXN0cyhlLnByb3ZpZGVySWQsIGUuZXZlbnQucmVtb3ZlZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZUJhZGdlQ291bnQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRVbnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihlID0+IHtcblx0XHRcdGNvbnN0IGFjY2Vzc1JlcXVlc3RzID0gdGhpcy5fc2Vzc2lvbkFjY2Vzc1JlcXVlc3RJdGVtcy5nZXQoZS5pZCkgfHwge307XG5cdFx0XHRPYmplY3Qua2V5cyhhY2Nlc3NSZXF1ZXN0cykuZm9yRWFjaChtY3BTZXJ2ZXJJZCA9PiB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlQWNjZXNzUmVxdWVzdChlLmlkLCBtY3BTZXJ2ZXJJZCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZU5ld1Nlc3Npb25SZXF1ZXN0cyhwcm92aWRlcklkOiBzdHJpbmcsIGFkZGVkU2Vzc2lvbnM6IHJlYWRvbmx5IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmdSZXF1ZXN0c0ZvclByb3ZpZGVyID0gdGhpcy5fc2lnbkluUmVxdWVzdEl0ZW1zLmdldChwcm92aWRlcklkKTtcblx0XHRpZiAoIWV4aXN0aW5nUmVxdWVzdHNGb3JQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdE9iamVjdC5rZXlzKGV4aXN0aW5nUmVxdWVzdHNGb3JQcm92aWRlcikuZm9yRWFjaChyZXF1ZXN0ZWRTY29wZXMgPT4ge1xuXHRcdFx0Ly8gUGFyc2UgdGhlIHJlcXVlc3RlZCBzY29wZXMgZnJvbSB0aGUgc3RvcmVkIGtleVxuXHRcdFx0Y29uc3QgcmVxdWVzdGVkU2NvcGVzQXJyYXkgPSByZXF1ZXN0ZWRTY29wZXMuc3BsaXQoU0NPUEVTTElTVF9TRVBBUkFUT1IpO1xuXG5cdFx0XHQvLyBDaGVjayBpZiBhbnkgYWRkZWQgc2Vzc2lvbiBoYXMgbWF0Y2hpbmcgc2NvcGVzIChvcmRlci1pbmRlcGVuZGVudClcblx0XHRcdGlmIChhZGRlZFNlc3Npb25zLnNvbWUoc2Vzc2lvbiA9PiBzY29wZXNNYXRjaChzZXNzaW9uLnNjb3BlcywgcmVxdWVzdGVkU2NvcGVzQXJyYXkpKSkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVxdWVzdCA9IGV4aXN0aW5nUmVxdWVzdHNGb3JQcm92aWRlcltyZXF1ZXN0ZWRTY29wZXNdO1xuXHRcdFx0XHRzZXNzaW9uUmVxdWVzdD8uZGlzcG9zYWJsZXMuZm9yRWFjaChpdGVtID0+IGl0ZW0uZGlzcG9zZSgpKTtcblxuXHRcdFx0XHRkZWxldGUgZXhpc3RpbmdSZXF1ZXN0c0ZvclByb3ZpZGVyW3JlcXVlc3RlZFNjb3Blc107XG5cdFx0XHRcdGlmIChPYmplY3Qua2V5cyhleGlzdGluZ1JlcXVlc3RzRm9yUHJvdmlkZXIpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX3NpZ25JblJlcXVlc3RJdGVtcy5kZWxldGUocHJvdmlkZXJJZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fc2lnbkluUmVxdWVzdEl0ZW1zLnNldChwcm92aWRlcklkLCBleGlzdGluZ1JlcXVlc3RzRm9yUHJvdmlkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUFjY2Vzc1JlcXVlc3RzKHByb3ZpZGVySWQ6IHN0cmluZywgcmVtb3ZlZFNlc3Npb25zOiByZWFkb25seSBBdXRoZW50aWNhdGlvblNlc3Npb25bXSkge1xuXHRcdGNvbnN0IHByb3ZpZGVyUmVxdWVzdHMgPSB0aGlzLl9zZXNzaW9uQWNjZXNzUmVxdWVzdEl0ZW1zLmdldChwcm92aWRlcklkKTtcblx0XHRpZiAocHJvdmlkZXJSZXF1ZXN0cykge1xuXHRcdFx0T2JqZWN0LmtleXMocHJvdmlkZXJSZXF1ZXN0cykuZm9yRWFjaChtY3BTZXJ2ZXJJZCA9PiB7XG5cdFx0XHRcdHJlbW92ZWRTZXNzaW9ucy5mb3JFYWNoKHJlbW92ZWQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4T2ZTZXNzaW9uID0gcHJvdmlkZXJSZXF1ZXN0c1ttY3BTZXJ2ZXJJZF0ucG9zc2libGVTZXNzaW9ucy5maW5kSW5kZXgoc2Vzc2lvbiA9PiBzZXNzaW9uLmlkID09PSByZW1vdmVkLmlkKTtcblx0XHRcdFx0XHRpZiAoaW5kZXhPZlNlc3Npb24pIHtcblx0XHRcdFx0XHRcdHByb3ZpZGVyUmVxdWVzdHNbbWNwU2VydmVySWRdLnBvc3NpYmxlU2Vzc2lvbnMuc3BsaWNlKGluZGV4T2ZTZXNzaW9uLCAxKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmICghcHJvdmlkZXJSZXF1ZXN0c1ttY3BTZXJ2ZXJJZF0ucG9zc2libGVTZXNzaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLnJlbW92ZUFjY2Vzc1JlcXVlc3QocHJvdmlkZXJJZCwgbWNwU2VydmVySWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUJhZGdlQ291bnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWNjb3VudEJhZGdlRGlzcG9zYWJsZS5jbGVhcigpO1xuXG5cdFx0bGV0IG51bWJlck9mUmVxdWVzdHMgPSAwO1xuXHRcdHRoaXMuX3NpZ25JblJlcXVlc3RJdGVtcy5mb3JFYWNoKHByb3ZpZGVyUmVxdWVzdHMgPT4ge1xuXHRcdFx0T2JqZWN0LmtleXMocHJvdmlkZXJSZXF1ZXN0cykuZm9yRWFjaChyZXF1ZXN0ID0+IHtcblx0XHRcdFx0bnVtYmVyT2ZSZXF1ZXN0cyArPSBwcm92aWRlclJlcXVlc3RzW3JlcXVlc3RdLnJlcXVlc3RpbmdNY3BTZXJ2ZXJJZHMubGVuZ3RoO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9zZXNzaW9uQWNjZXNzUmVxdWVzdEl0ZW1zLmZvckVhY2goYWNjZXNzUmVxdWVzdCA9PiB7XG5cdFx0XHRudW1iZXJPZlJlcXVlc3RzICs9IE9iamVjdC5rZXlzKGFjY2Vzc1JlcXVlc3QpLmxlbmd0aDtcblx0XHR9KTtcblxuXHRcdGlmIChudW1iZXJPZlJlcXVlc3RzID4gMCkge1xuXHRcdFx0Y29uc3QgYmFkZ2UgPSBuZXcgTnVtYmVyQmFkZ2UobnVtYmVyT2ZSZXF1ZXN0cywgKCkgPT4gbmxzLmxvY2FsaXplKCdzaWduIGluJywgXCJTaWduIGluIHJlcXVlc3RlZFwiKSk7XG5cdFx0XHR0aGlzLl9hY2NvdW50QmFkZ2VEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5hY3Rpdml0eVNlcnZpY2Uuc2hvd0FjY291bnRzQWN0aXZpdHkoeyBiYWRnZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUFjY2Vzc1JlcXVlc3QocHJvdmlkZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXJSZXF1ZXN0cyA9IHRoaXMuX3Nlc3Npb25BY2Nlc3NSZXF1ZXN0SXRlbXMuZ2V0KHByb3ZpZGVySWQpIHx8IHt9O1xuXHRcdGlmIChwcm92aWRlclJlcXVlc3RzW21jcFNlcnZlcklkXSkge1xuXHRcdFx0ZGlzcG9zZShwcm92aWRlclJlcXVlc3RzW21jcFNlcnZlcklkXS5kaXNwb3NhYmxlcyk7XG5cdFx0XHRkZWxldGUgcHJvdmlkZXJSZXF1ZXN0c1ttY3BTZXJ2ZXJJZF07XG5cdFx0XHR0aGlzLnVwZGF0ZUJhZGdlQ291bnQoKTtcblx0XHR9XG5cdH1cblxuXHQvLyNyZWdpb24gQWNjb3VudC9TZXNzaW9uIFByZWZlcmVuY2VcblxuXHR1cGRhdGVBY2NvdW50UHJlZmVyZW5jZShtY3BTZXJ2ZXJJZDogc3RyaW5nLCBwcm92aWRlcklkOiBzdHJpbmcsIGFjY291bnQ6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQpOiB2b2lkIHtcblx0XHRjb25zdCBwYXJlbnRNY3BTZXJ2ZXJJZCA9IHRoaXMuX2luaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2VDaGlsZFRvUGFyZW50W21jcFNlcnZlcklkXSA/PyBtY3BTZXJ2ZXJJZDtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9nZXRLZXkocGFyZW50TWNwU2VydmVySWQsIHByb3ZpZGVySWQpO1xuXG5cdFx0Ly8gU3RvcmUgdGhlIHByZWZlcmVuY2UgaW4gdGhlIHdvcmtzcGFjZSBhbmQgYXBwbGljYXRpb24gc3RvcmFnZS4gVGhpcyBhbGxvd3MgbmV3IHdvcmtzcGFjZXMgdG9cblx0XHQvLyBoYXZlIGEgcHJlZmVyZW5jZSBzZXQgYWxyZWFkeSB0byBsaW1pdCB0aGUgbnVtYmVyIG9mIHByb21wdHMgdGhhdCBhcmUgc2hvd24uLi4gYnV0IGFsc28gYWxsb3dzXG5cdFx0Ly8gYSBzcGVjaWZpYyB3b3Jrc3BhY2UgdG8gb3ZlcnJpZGUgdGhlIGdsb2JhbCBwcmVmZXJlbmNlLlxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoa2V5LCBhY2NvdW50LmxhYmVsLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoa2V5LCBhY2NvdW50LmxhYmVsLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRjb25zdCBjaGlsZHJlbk1jcFNlcnZlcnMgPSB0aGlzLl9pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlUGFyZW50VG9DaGlsZHJlbltwYXJlbnRNY3BTZXJ2ZXJJZF07XG5cdFx0Y29uc3QgbWNwU2VydmVySWRzID0gY2hpbGRyZW5NY3BTZXJ2ZXJzID8gW3BhcmVudE1jcFNlcnZlcklkLCAuLi5jaGlsZHJlbk1jcFNlcnZlcnNdIDogW3BhcmVudE1jcFNlcnZlcklkXTtcblx0XHR0aGlzLl9vbkRpZEFjY291bnRQcmVmZXJlbmNlQ2hhbmdlLmZpcmUoeyBtY3BTZXJ2ZXJJZHMsIHByb3ZpZGVySWQgfSk7XG5cdH1cblxuXHRnZXRBY2NvdW50UHJlZmVyZW5jZShtY3BTZXJ2ZXJJZDogc3RyaW5nLCBwcm92aWRlcklkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2dldEtleSh0aGlzLl9pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlQ2hpbGRUb1BhcmVudFttY3BTZXJ2ZXJJZF0gPz8gbWNwU2VydmVySWQsIHByb3ZpZGVySWQpO1xuXG5cdFx0Ly8gSWYgYSBwcmVmZXJlbmNlIGlzIHNldCBpbiB0aGUgd29ya3NwYWNlLCB1c2UgdGhhdC4gT3RoZXJ3aXNlLCB1c2UgdGhlIGdsb2JhbCBwcmVmZXJlbmNlLlxuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpID8/IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KGtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0fVxuXG5cdHJlbW92ZUFjY291bnRQcmVmZXJlbmNlKG1jcFNlcnZlcklkOiBzdHJpbmcsIHByb3ZpZGVySWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2dldEtleSh0aGlzLl9pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlQ2hpbGRUb1BhcmVudFttY3BTZXJ2ZXJJZF0gPz8gbWNwU2VydmVySWQsIHByb3ZpZGVySWQpO1xuXG5cdFx0Ly8gVGhpcyB3b24ndCBhZmZlY3QgYW55IG90aGVyIHdvcmtzcGFjZXMgdGhhdCBoYXZlIGEgcHJlZmVyZW5jZSBzZXQsIGJ1dCBpdCB3aWxsIHJlbW92ZSB0aGUgcHJlZmVyZW5jZVxuXHRcdC8vIGZvciB0aGlzIHdvcmtzcGFjZSBhbmQgdGhlIGdsb2JhbCBwcmVmZXJlbmNlLiBUaGlzIGlzIG9ubHkgcGFpcmVkIHdpdGggYSBjYWxsIHRvIHVwZGF0ZVNlc3Npb25QcmVmZXJlbmNlLi4uXG5cdFx0Ly8gc28gd2UgcmVhbGx5IGRvbid0IF9uZWVkXyB0byByZW1vdmUgdGhlbSBhcyB0aGV5IGFyZSBhYm91dCB0byBiZSBvdmVycmlkZGVuIGFueXdheS4uLiBidXQgaXQncyBtb3JlIGNvcnJlY3Rcblx0XHQvLyB0byByZW1vdmUgdGhlbSBmaXJzdC4uLiBhbmQgaW4gY2FzZSB0aGlzIGdldHMgY2FsbGVkIGZyb20gc29tZXdoZXJlIGVsc2UgaW4gdGhlIGZ1dHVyZS5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShrZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKGtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEtleShtY3BTZXJ2ZXJJZDogc3RyaW5nLCBwcm92aWRlcklkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHttY3BTZXJ2ZXJJZH0tJHtwcm92aWRlcklkfWA7XG5cdH1cblxuXHQvLyBUT0RPQFR5bGVyTGVvbmhhcmR0OiBSZW1vdmUgYWxsIG9mIHRoaXMgYWZ0ZXIgYSBjb3VwbGUgaXRlcmF0aW9uc1xuXG5cdHVwZGF0ZVNlc3Npb25QcmVmZXJlbmNlKHByb3ZpZGVySWQ6IHN0cmluZywgbWNwU2VydmVySWQ6IHN0cmluZywgc2Vzc2lvbjogQXV0aGVudGljYXRpb25TZXNzaW9uKTogdm9pZCB7XG5cdFx0Ly8gVGhlIDMgcGFydHMgb2YgdGhpcyBrZXkgYXJlIGltcG9ydGFudDpcblx0XHQvLyAqIE1DUCBzZXJ2ZXIgaWQ6IFRoZSBNQ1Agc2VydmVyIHRoYXQgaGFzIGEgcHJlZmVyZW5jZVxuXHRcdC8vICogUHJvdmlkZXIgaWQ6IFRoZSBwcm92aWRlciB0aGF0IHRoZSBwcmVmZXJlbmNlIGlzIGZvclxuXHRcdC8vICogVGhlIHNjb3BlczogVGhlIHN1YnNldCBvZiBzZXNzaW9ucyB0aGF0IHRoZSBwcmVmZXJlbmNlIGFwcGxpZXMgdG9cblx0XHRjb25zdCBrZXkgPSBgJHttY3BTZXJ2ZXJJZH0tJHtwcm92aWRlcklkfS0ke3Nlc3Npb24uc2NvcGVzLmpvaW4oU0NPUEVTTElTVF9TRVBBUkFUT1IpfWA7XG5cblx0XHQvLyBTdG9yZSB0aGUgcHJlZmVyZW5jZSBpbiB0aGUgd29ya3NwYWNlIGFuZCBhcHBsaWNhdGlvbiBzdG9yYWdlLiBUaGlzIGFsbG93cyBuZXcgd29ya3NwYWNlcyB0b1xuXHRcdC8vIGhhdmUgYSBwcmVmZXJlbmNlIHNldCBhbHJlYWR5IHRvIGxpbWl0IHRoZSBudW1iZXIgb2YgcHJvbXB0cyB0aGF0IGFyZSBzaG93bi4uLiBidXQgYWxzbyBhbGxvd3Ncblx0XHQvLyBhIHNwZWNpZmljIHdvcmtzcGFjZSB0byBvdmVycmlkZSB0aGUgZ2xvYmFsIHByZWZlcmVuY2UuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShrZXksIHNlc3Npb24uaWQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShrZXksIHNlc3Npb24uaWQsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdGdldFNlc3Npb25QcmVmZXJlbmNlKHByb3ZpZGVySWQ6IHN0cmluZywgbWNwU2VydmVySWQ6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gVGhlIDMgcGFydHMgb2YgdGhpcyBrZXkgYXJlIGltcG9ydGFudDpcblx0XHQvLyAqIE1DUCBzZXJ2ZXIgaWQ6IFRoZSBNQ1Agc2VydmVyIHRoYXQgaGFzIGEgcHJlZmVyZW5jZVxuXHRcdC8vICogUHJvdmlkZXIgaWQ6IFRoZSBwcm92aWRlciB0aGF0IHRoZSBwcmVmZXJlbmNlIGlzIGZvclxuXHRcdC8vICogVGhlIHNjb3BlczogVGhlIHN1YnNldCBvZiBzZXNzaW9ucyB0aGF0IHRoZSBwcmVmZXJlbmNlIGFwcGxpZXMgdG9cblx0XHRjb25zdCBrZXkgPSBgJHttY3BTZXJ2ZXJJZH0tJHtwcm92aWRlcklkfS0ke3Njb3Blcy5qb2luKFNDT1BFU0xJU1RfU0VQQVJBVE9SKX1gO1xuXG5cdFx0Ly8gSWYgYSBwcmVmZXJlbmNlIGlzIHNldCBpbiB0aGUgd29ya3NwYWNlLCB1c2UgdGhhdC4gT3RoZXJ3aXNlLCB1c2UgdGhlIGdsb2JhbCBwcmVmZXJlbmNlLlxuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpID8/IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KGtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0fVxuXG5cdHJlbW92ZVNlc3Npb25QcmVmZXJlbmNlKHByb3ZpZGVySWQ6IHN0cmluZywgbWNwU2VydmVySWQ6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdC8vIFRoZSAzIHBhcnRzIG9mIHRoaXMga2V5IGFyZSBpbXBvcnRhbnQ6XG5cdFx0Ly8gKiBNQ1Agc2VydmVyIGlkOiBUaGUgTUNQIHNlcnZlciB0aGF0IGhhcyBhIHByZWZlcmVuY2Vcblx0XHQvLyAqIFByb3ZpZGVyIGlkOiBUaGUgcHJvdmlkZXIgdGhhdCB0aGUgcHJlZmVyZW5jZSBpcyBmb3Jcblx0XHQvLyAqIFRoZSBzY29wZXM6IFRoZSBzdWJzZXQgb2Ygc2Vzc2lvbnMgdGhhdCB0aGUgcHJlZmVyZW5jZSBhcHBsaWVzIHRvXG5cdFx0Y29uc3Qga2V5ID0gYCR7bWNwU2VydmVySWR9LSR7cHJvdmlkZXJJZH0tJHtzY29wZXMuam9pbihTQ09QRVNMSVNUX1NFUEFSQVRPUil9YDtcblxuXHRcdC8vIFRoaXMgd29uJ3QgYWZmZWN0IGFueSBvdGhlciB3b3Jrc3BhY2VzIHRoYXQgaGF2ZSBhIHByZWZlcmVuY2Ugc2V0LCBidXQgaXQgd2lsbCByZW1vdmUgdGhlIHByZWZlcmVuY2Vcblx0XHQvLyBmb3IgdGhpcyB3b3Jrc3BhY2UgYW5kIHRoZSBnbG9iYWwgcHJlZmVyZW5jZS4gVGhpcyBpcyBvbmx5IHBhaXJlZCB3aXRoIGEgY2FsbCB0byB1cGRhdGVTZXNzaW9uUHJlZmVyZW5jZS4uLlxuXHRcdC8vIHNvIHdlIHJlYWxseSBkb24ndCBfbmVlZF8gdG8gcmVtb3ZlIHRoZW0gYXMgdGhleSBhcmUgYWJvdXQgdG8gYmUgb3ZlcnJpZGRlbiBhbnl3YXkuLi4gYnV0IGl0J3MgbW9yZSBjb3JyZWN0XG5cdFx0Ly8gdG8gcmVtb3ZlIHRoZW0gZmlyc3QuLi4gYW5kIGluIGNhc2UgdGhpcyBnZXRzIGNhbGxlZCBmcm9tIHNvbWV3aGVyZSBlbHNlIGluIHRoZSBmdXR1cmUuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoa2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVBY2NvdW50QW5kU2Vzc2lvblByZWZlcmVuY2VzKHByb3ZpZGVySWQ6IHN0cmluZywgbWNwU2VydmVySWQ6IHN0cmluZywgc2Vzc2lvbjogQXV0aGVudGljYXRpb25TZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVBY2NvdW50UHJlZmVyZW5jZShtY3BTZXJ2ZXJJZCwgcHJvdmlkZXJJZCwgc2Vzc2lvbi5hY2NvdW50KTtcblx0XHR0aGlzLnVwZGF0ZVNlc3Npb25QcmVmZXJlbmNlKHByb3ZpZGVySWQsIG1jcFNlcnZlcklkLCBzZXNzaW9uKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0dldFNlc3Npb25Qcm9tcHQocHJvdmlkZXI6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBhY2NvdW50TmFtZTogc3RyaW5nLCBtY3BTZXJ2ZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRlbnVtIFNlc3Npb25Qcm9tcHRDaG9pY2Uge1xuXHRcdFx0QWxsb3cgPSAwLFxuXHRcdFx0RGVueSA9IDEsXG5cdFx0XHRDYW5jZWwgPSAyXG5cdFx0fVxuXHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0PFNlc3Npb25Qcm9tcHRDaG9pY2U+KHtcblx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbmZpcm1BdXRoZW50aWNhdGlvbkFjY2VzcycsIFwiVGhlIE1DUCBzZXJ2ZXIgJ3swfScgd2FudHMgdG8gYWNjZXNzIHRoZSB7MX0gYWNjb3VudCAnezJ9Jy5cIiwgbWNwU2VydmVyTmFtZSwgcHJvdmlkZXIubGFiZWwsIGFjY291bnROYW1lKSxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoeyBrZXk6ICdhbGxvdycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkFsbG93XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gU2Vzc2lvblByb21wdENob2ljZS5BbGxvd1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSh7IGtleTogJ2RlbnknLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZEZW55XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gU2Vzc2lvblByb21wdENob2ljZS5EZW55XG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0cnVuOiAoKSA9PiBTZXNzaW9uUHJvbXB0Q2hvaWNlLkNhbmNlbFxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKHJlc3VsdCAhPT0gU2Vzc2lvblByb21wdENob2ljZS5DYW5jZWwpIHtcblx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycyhwcm92aWRlci5pZCwgYWNjb3VudE5hbWUsIFt7IGlkOiBtY3BTZXJ2ZXJJZCwgbmFtZTogbWNwU2VydmVyTmFtZSwgYWxsb3dlZDogcmVzdWx0ID09PSBTZXNzaW9uUHJvbXB0Q2hvaWNlLkFsbG93IH1dKTtcblx0XHRcdHRoaXMucmVtb3ZlQWNjZXNzUmVxdWVzdChwcm92aWRlci5pZCwgbWNwU2VydmVySWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQgPT09IFNlc3Npb25Qcm9tcHRDaG9pY2UuQWxsb3c7XG5cdH1cblxuXHQvKipcblx0ICogVGhpcyBmdW5jdGlvbiBzaG91bGQgYmUgdXNlZCBvbmx5IHdoZW4gdGhlcmUgYXJlIHNlc3Npb25zIHRvIGRpc2FtYmlndWF0ZS5cblx0ICovXG5cdGFzeW5jIHNlbGVjdFNlc3Npb24ocHJvdmlkZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJOYW1lOiBzdHJpbmcsIHNjb3Blczogc3RyaW5nW10sIGF2YWlsYWJsZVNlc3Npb25zOiBBdXRoZW50aWNhdGlvblNlc3Npb25bXSk6IFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uPiB7XG5cdFx0Y29uc3QgYWxsQWNjb3VudHMgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0QWNjb3VudHMocHJvdmlkZXJJZCk7XG5cdFx0aWYgKCFhbGxBY2NvdW50cy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gYWNjb3VudHMgYXZhaWxhYmxlJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHF1aWNrUGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazx7IGxhYmVsOiBzdHJpbmc7IHNlc3Npb24/OiBBdXRoZW50aWNhdGlvblNlc3Npb247IGFjY291bnQ/OiBBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50IH0+KCkpO1xuXHRcdHF1aWNrUGljay5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0Y29uc3QgYWNjb3VudHNXaXRoU2Vzc2lvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBpdGVtczogeyBsYWJlbDogc3RyaW5nOyBzZXNzaW9uPzogQXV0aGVudGljYXRpb25TZXNzaW9uOyBhY2NvdW50PzogQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCB9W10gPSBhdmFpbGFibGVTZXNzaW9uc1xuXHRcdFx0Ly8gT25seSBncmFiIHRoZSBmaXJzdCBhY2NvdW50XG5cdFx0XHQuZmlsdGVyKHNlc3Npb24gPT4gIWFjY291bnRzV2l0aFNlc3Npb25zLmhhcyhzZXNzaW9uLmFjY291bnQubGFiZWwpICYmIGFjY291bnRzV2l0aFNlc3Npb25zLmFkZChzZXNzaW9uLmFjY291bnQubGFiZWwpKVxuXHRcdFx0Lm1hcChzZXNzaW9uID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRsYWJlbDogc2Vzc2lvbi5hY2NvdW50LmxhYmVsLFxuXHRcdFx0XHRcdHNlc3Npb246IHNlc3Npb25cblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXG5cdFx0Ly8gQWRkIHRoZSBhZGRpdGlvbmFsIGFjY291bnRzIHRoYXQgaGF2ZSBiZWVuIGxvZ2dlZCBpbnRvIHRoZSBwcm92aWRlciBidXQgYXJlXG5cdFx0Ly8gZG9uJ3QgaGF2ZSBhIHNlc3Npb24geWV0LlxuXHRcdGFsbEFjY291bnRzLmZvckVhY2goYWNjb3VudCA9PiB7XG5cdFx0XHRpZiAoIWFjY291bnRzV2l0aFNlc3Npb25zLmhhcyhhY2NvdW50LmxhYmVsKSkge1xuXHRcdFx0XHRpdGVtcy5wdXNoKHsgbGFiZWw6IGFjY291bnQubGFiZWwsIGFjY291bnQgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aXRlbXMucHVzaCh7IGxhYmVsOiBubHMubG9jYWxpemUoJ3VzZU90aGVyQWNjb3VudCcsIFwiU2lnbiBpbiB0byBhbm90aGVyIGFjY291bnRcIikgfSk7XG5cdFx0cXVpY2tQaWNrLml0ZW1zID0gaXRlbXM7XG5cdFx0cXVpY2tQaWNrLnRpdGxlID0gbmxzLmxvY2FsaXplKFxuXHRcdFx0e1xuXHRcdFx0XHRrZXk6ICdzZWxlY3RBY2NvdW50Jyxcblx0XHRcdFx0Y29tbWVudDogWydUaGUgcGxhY2Vob2xkZXIgezB9IGlzIHRoZSBuYW1lIG9mIGEgTUNQIHNlcnZlci4gezF9IGlzIHRoZSBuYW1lIG9mIHRoZSB0eXBlIG9mIGFjY291bnQsIHN1Y2ggYXMgTWljcm9zb2Z0IG9yIEdpdEh1Yi4nXVxuXHRcdFx0fSxcblx0XHRcdFwiVGhlIE1DUCBzZXJ2ZXIgJ3swfScgd2FudHMgdG8gYWNjZXNzIGEgezF9IGFjY291bnRcIixcblx0XHRcdG1jcFNlcnZlck5hbWUsXG5cdFx0XHR0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIocHJvdmlkZXJJZCkubGFiZWxcblx0XHQpO1xuXHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IG5scy5sb2NhbGl6ZSgnZ2V0U2Vzc2lvblBsYXRlaG9sZGVyJywgXCJTZWxlY3QgYW4gYWNjb3VudCBmb3IgJ3swfScgdG8gdXNlIG9yIEVzYyB0byBjYW5jZWxcIiwgbWNwU2VydmVyTmFtZSk7XG5cblx0XHRyZXR1cm4gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdChhc3luYyBfID0+IHtcblx0XHRcdFx0cXVpY2tQaWNrLmRpc3Bvc2UoKTtcblx0XHRcdFx0bGV0IHNlc3Npb24gPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXS5zZXNzaW9uO1xuXHRcdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0XHRjb25zdCBhY2NvdW50ID0gcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0uYWNjb3VudDtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0c2Vzc2lvbiA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5jcmVhdGVTZXNzaW9uKHByb3ZpZGVySWQsIHNjb3BlcywgeyBhY2NvdW50IH0pO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdHJlamVjdChlKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWNjb3VudE5hbWUgPSBzZXNzaW9uLmFjY291bnQubGFiZWw7XG5cblx0XHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKHByb3ZpZGVySWQsIGFjY291bnROYW1lLCBbeyBpZDogbWNwU2VydmVySWQsIG5hbWU6IG1jcFNlcnZlck5hbWUsIGFsbG93ZWQ6IHRydWUgfV0pO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVBY2NvdW50QW5kU2Vzc2lvblByZWZlcmVuY2VzKHByb3ZpZGVySWQsIG1jcFNlcnZlcklkLCBzZXNzaW9uKTtcblx0XHRcdFx0dGhpcy5yZW1vdmVBY2Nlc3NSZXF1ZXN0KHByb3ZpZGVySWQsIG1jcFNlcnZlcklkKTtcblxuXHRcdFx0XHRyZXNvbHZlKHNlc3Npb24pO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZShfID0+IHtcblx0XHRcdFx0aWYgKCFxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXSkge1xuXHRcdFx0XHRcdHJlamVjdCgnVXNlciBkaWQgbm90IGNvbnNlbnQgdG8gYWNjb3VudCBhY2Nlc3MnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbXBsZXRlU2Vzc2lvbkFjY2Vzc1JlcXVlc3QocHJvdmlkZXI6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBtY3BTZXJ2ZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJOYW1lOiBzdHJpbmcsIHNjb3Blczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm92aWRlclJlcXVlc3RzID0gdGhpcy5fc2Vzc2lvbkFjY2Vzc1JlcXVlc3RJdGVtcy5nZXQocHJvdmlkZXIuaWQpIHx8IHt9O1xuXHRcdGNvbnN0IGV4aXN0aW5nUmVxdWVzdCA9IHByb3ZpZGVyUmVxdWVzdHNbbWNwU2VydmVySWRdO1xuXHRcdGlmICghZXhpc3RpbmdSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwb3NzaWJsZVNlc3Npb25zID0gZXhpc3RpbmdSZXF1ZXN0LnBvc3NpYmxlU2Vzc2lvbnM7XG5cblx0XHRsZXQgc2Vzc2lvbjogQXV0aGVudGljYXRpb25TZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChwcm92aWRlci5zdXBwb3J0c011bHRpcGxlQWNjb3VudHMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHNlc3Npb24gPSBhd2FpdCB0aGlzLnNlbGVjdFNlc3Npb24ocHJvdmlkZXIuaWQsIG1jcFNlcnZlcklkLCBtY3BTZXJ2ZXJOYW1lLCBzY29wZXMsIHBvc3NpYmxlU2Vzc2lvbnMpO1xuXHRcdFx0fSBjYXRjaCAoXykge1xuXHRcdFx0XHQvLyBpZ25vcmUgY2FuY2VsXG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGFwcHJvdmVkID0gYXdhaXQgdGhpcy5zaG93R2V0U2Vzc2lvblByb21wdChwcm92aWRlciwgcG9zc2libGVTZXNzaW9uc1swXS5hY2NvdW50LmxhYmVsLCBtY3BTZXJ2ZXJJZCwgbWNwU2VydmVyTmFtZSk7XG5cdFx0XHRpZiAoYXBwcm92ZWQpIHtcblx0XHRcdFx0c2Vzc2lvbiA9IHBvc3NpYmxlU2Vzc2lvbnNbMF07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLmFkZEFjY291bnRVc2FnZShwcm92aWRlci5pZCwgc2Vzc2lvbi5hY2NvdW50LmxhYmVsLCBzZXNzaW9uLnNjb3BlcywgbWNwU2VydmVySWQsIG1jcFNlcnZlck5hbWUpO1xuXHRcdH1cblx0fVxuXG5cdHJlcXVlc3RTZXNzaW9uQWNjZXNzKHByb3ZpZGVySWQ6IHN0cmluZywgbWNwU2VydmVySWQ6IHN0cmluZywgbWNwU2VydmVyTmFtZTogc3RyaW5nLCBzY29wZXM6IHN0cmluZ1tdLCBwb3NzaWJsZVNlc3Npb25zOiBBdXRoZW50aWNhdGlvblNlc3Npb25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyUmVxdWVzdHMgPSB0aGlzLl9zZXNzaW9uQWNjZXNzUmVxdWVzdEl0ZW1zLmdldChwcm92aWRlcklkKSB8fCB7fTtcblx0XHRjb25zdCBoYXNFeGlzdGluZ1JlcXVlc3QgPSBwcm92aWRlclJlcXVlc3RzW21jcFNlcnZlcklkXTtcblx0XHRpZiAoaGFzRXhpc3RpbmdSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIocHJvdmlkZXJJZCk7XG5cdFx0Y29uc3QgbWVudUl0ZW0gPSBNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkFjY291bnRzQ29udGV4dCwge1xuXHRcdFx0Z3JvdXA6ICczX2FjY2Vzc1JlcXVlc3RzJyxcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IGAke3Byb3ZpZGVySWR9JHttY3BTZXJ2ZXJJZH1BY2Nlc3NgLFxuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRrZXk6ICdhY2Nlc3NSZXF1ZXN0Jyxcblx0XHRcdFx0XHRjb21tZW50OiBbYFRoZSBwbGFjZWhvbGRlciB7MH0gd2lsbCBiZSByZXBsYWNlZCB3aXRoIGFuIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyJydzIGxhYmVsLiB7MX0gd2lsbCBiZSByZXBsYWNlZCB3aXRoIGEgTUNQIHNlcnZlciBuYW1lLiAoMSkgaXMgdG8gaW5kaWNhdGUgdGhhdCB0aGlzIG1lbnUgaXRlbSBjb250cmlidXRlcyB0byBhIGJhZGdlIGNvdW50YF1cblx0XHRcdFx0fSxcblx0XHRcdFx0XHRcIkdyYW50IGFjY2VzcyB0byB7MH0gZm9yIHsxfS4uLiAoMSlcIixcblx0XHRcdFx0XHRwcm92aWRlci5sYWJlbCxcblx0XHRcdFx0XHRtY3BTZXJ2ZXJOYW1lKVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWNjZXNzQ29tbWFuZCA9IENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0XHRcdGlkOiBgJHtwcm92aWRlcklkfSR7bWNwU2VydmVySWR9QWNjZXNzYCxcblx0XHRcdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHR0aGlzLmNvbXBsZXRlU2Vzc2lvbkFjY2Vzc1JlcXVlc3QocHJvdmlkZXIsIG1jcFNlcnZlcklkLCBtY3BTZXJ2ZXJOYW1lLCBzY29wZXMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cHJvdmlkZXJSZXF1ZXN0c1ttY3BTZXJ2ZXJJZF0gPSB7IHBvc3NpYmxlU2Vzc2lvbnMsIGRpc3Bvc2FibGVzOiBbbWVudUl0ZW0sIGFjY2Vzc0NvbW1hbmRdIH07XG5cdFx0dGhpcy5fc2Vzc2lvbkFjY2Vzc1JlcXVlc3RJdGVtcy5zZXQocHJvdmlkZXJJZCwgcHJvdmlkZXJSZXF1ZXN0cyk7XG5cdFx0dGhpcy51cGRhdGVCYWRnZUNvdW50KCk7XG5cdH1cblxuXHRhc3luYyByZXF1ZXN0TmV3U2Vzc2lvbihwcm92aWRlcklkOiBzdHJpbmcsIHNjb3Blczogc3RyaW5nW10sIG1jcFNlcnZlcklkOiBzdHJpbmcsIG1jcFNlcnZlck5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmlzQXV0aGVudGljYXRpb25Qcm92aWRlclJlZ2lzdGVyZWQocHJvdmlkZXJJZCkpIHtcblx0XHRcdC8vIEFjdGl2YXRlIGhhcyBhbHJlYWR5IGJlZW4gY2FsbGVkIGZvciB0aGUgYXV0aGVudGljYXRpb24gcHJvdmlkZXIsIGJ1dCBpdCBjYW5ub3QgYmxvY2sgb24gcmVnaXN0ZXJpbmcgaXRzZWxmXG5cdFx0XHQvLyBzaW5jZSB0aGlzIGlzIHN5bmMgYW5kIHJldHVybnMgYSBkaXNwb3NhYmxlLiBTbywgd2FpdCBmb3IgcmVnaXN0cmF0aW9uIGV2ZW50IHRvIGZpcmUgdGhhdCBpbmRpY2F0ZXMgdGhlXG5cdFx0XHQvLyBwcm92aWRlciBpcyBub3cgaW4gdGhlIG1hcC5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCBfKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2UgPSB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRSZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUuaWQgPT09IHByb3ZpZGVySWQpIHtcblx0XHRcdFx0XHRcdGRpc3Bvc2UuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRsZXQgcHJvdmlkZXI6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyO1xuXHRcdHRyeSB7XG5cdFx0XHRwcm92aWRlciA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHR9IGNhdGNoIChfZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyUmVxdWVzdHMgPSB0aGlzLl9zaWduSW5SZXF1ZXN0SXRlbXMuZ2V0KHByb3ZpZGVySWQpO1xuXHRcdGNvbnN0IHNjb3Blc0xpc3QgPSBzY29wZXMuam9pbihTQ09QRVNMSVNUX1NFUEFSQVRPUik7XG5cdFx0Y29uc3QgbWNwU2VydmVySGFzRXhpc3RpbmdSZXF1ZXN0ID0gcHJvdmlkZXJSZXF1ZXN0c1xuXHRcdFx0JiYgcHJvdmlkZXJSZXF1ZXN0c1tzY29wZXNMaXN0XVxuXHRcdFx0JiYgcHJvdmlkZXJSZXF1ZXN0c1tzY29wZXNMaXN0XS5yZXF1ZXN0aW5nTWNwU2VydmVySWRzLmluY2x1ZGVzKG1jcFNlcnZlcklkKTtcblxuXHRcdGlmIChtY3BTZXJ2ZXJIYXNFeGlzdGluZ1JlcXVlc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDb25zdHJ1Y3QgYSBjb21tYW5kSWQgdGhhdCB3b24ndCBjbGFzaCB3aXRoIG90aGVycyBnZW5lcmF0ZWQgaGVyZSwgbm9yIGxpa2VseSB3aXRoIGFuIE1DUCBzZXJ2ZXIncyBjb21tYW5kXG5cdFx0Y29uc3QgY29tbWFuZElkID0gYCR7cHJvdmlkZXJJZH06JHttY3BTZXJ2ZXJJZH06c2lnbkluJHtPYmplY3Qua2V5cyhwcm92aWRlclJlcXVlc3RzIHx8IFtdKS5sZW5ndGh9YDtcblx0XHRjb25zdCBtZW51SXRlbSA9IE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQWNjb3VudHNDb250ZXh0LCB7XG5cdFx0XHRncm91cDogJzJfc2lnbkluUmVxdWVzdHMnLFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogY29tbWFuZElkLFxuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRrZXk6ICdzaWduSW5SZXF1ZXN0Jyxcblx0XHRcdFx0XHRjb21tZW50OiBbYFRoZSBwbGFjZWhvbGRlciB7MH0gd2lsbCBiZSByZXBsYWNlZCB3aXRoIGFuIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyJ3MgbGFiZWwuIHsxfSB3aWxsIGJlIHJlcGxhY2VkIHdpdGggYSBNQ1Agc2VydmVyIG5hbWUuICgxKSBpcyB0byBpbmRpY2F0ZSB0aGF0IHRoaXMgbWVudSBpdGVtIGNvbnRyaWJ1dGVzIHRvIGEgYmFkZ2UgY291bnQuYF1cblx0XHRcdFx0fSxcblx0XHRcdFx0XHRcIlNpZ24gaW4gd2l0aCB7MH0gdG8gdXNlIHsxfSAoMSlcIixcblx0XHRcdFx0XHRwcm92aWRlci5sYWJlbCxcblx0XHRcdFx0XHRtY3BTZXJ2ZXJOYW1lKVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2lnbkluQ29tbWFuZCA9IENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0XHRcdGlkOiBjb21tYW5kSWQsXG5cdFx0XHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0Y29uc3QgYXV0aGVudGljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRoZW50aWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZVNlc3Npb24ocHJvdmlkZXJJZCwgc2NvcGVzKTtcblxuXHRcdFx0XHR0aGlzLl9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMocHJvdmlkZXJJZCwgc2Vzc2lvbi5hY2NvdW50LmxhYmVsLCBbeyBpZDogbWNwU2VydmVySWQsIG5hbWU6IG1jcFNlcnZlck5hbWUsIGFsbG93ZWQ6IHRydWUgfV0pO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVBY2NvdW50QW5kU2Vzc2lvblByZWZlcmVuY2VzKHByb3ZpZGVySWQsIG1jcFNlcnZlcklkLCBzZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXG5cdFx0aWYgKHByb3ZpZGVyUmVxdWVzdHMpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nUmVxdWVzdCA9IHByb3ZpZGVyUmVxdWVzdHNbc2NvcGVzTGlzdF0gfHwgeyBkaXNwb3NhYmxlczogW10sIHJlcXVlc3RpbmdNY3BTZXJ2ZXJJZHM6IFtdIH07XG5cblx0XHRcdHByb3ZpZGVyUmVxdWVzdHNbc2NvcGVzTGlzdF0gPSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzOiBbLi4uZXhpc3RpbmdSZXF1ZXN0LmRpc3Bvc2FibGVzLCBtZW51SXRlbSwgc2lnbkluQ29tbWFuZF0sXG5cdFx0XHRcdHJlcXVlc3RpbmdNY3BTZXJ2ZXJJZHM6IFsuLi5leGlzdGluZ1JlcXVlc3QucmVxdWVzdGluZ01jcFNlcnZlcklkcywgbWNwU2VydmVySWRdXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fc2lnbkluUmVxdWVzdEl0ZW1zLnNldChwcm92aWRlcklkLCBwcm92aWRlclJlcXVlc3RzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2lnbkluUmVxdWVzdEl0ZW1zLnNldChwcm92aWRlcklkLCB7XG5cdFx0XHRcdFtzY29wZXNMaXN0XToge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzOiBbbWVudUl0ZW0sIHNpZ25JbkNvbW1hbmRdLFxuXHRcdFx0XHRcdHJlcXVlc3RpbmdNY3BTZXJ2ZXJJZHM6IFttY3BTZXJ2ZXJJZF1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVCYWRnZUNvdW50KCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSwgQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLGlCQUFpQixTQUFzQix5QkFBeUI7QUFDckYsU0FBUyxtQkFBbUI7QUFDNUIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsUUFBUSxvQkFBb0I7QUFDckMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsa0JBQWtCLG1CQUFtQjtBQUM5QyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHNDQUFzQztBQUMvQyxTQUF5RCw4QkFBNEQ7QUFDckgsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUdoQyxNQUFNLHVCQUF1QjtBQVl0QixNQUFNLDRC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
