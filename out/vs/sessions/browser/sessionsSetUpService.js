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
import "./media/sessionsSetUp.css";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../base/common/lifecycle.js";
import { DeferredPromise, disposableTimeout } from "../../base/common/async.js";
import { createDecorator, IInstantiationService } from "../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../platform/storage/common/storage.js";
import { IUserDataProfileStorageService } from "../../platform/userDataProfile/common/userDataProfileStorageService.js";
import { IUserDataProfilesService } from "../../platform/userDataProfile/common/userDataProfile.js";
import { ServiceCollection } from "../../platform/instantiation/common/serviceCollection.js";
import { ChatEntitlementContext, IChatEntitlementService } from "../../workbench/services/chat/common/chatEntitlementService.js";
import { isWeb } from "../../base/common/platform.js";
import { GitHubPaths, IDefaultAccountService } from "../../platform/defaultAccount/common/defaultAccount.js";
import { IProductService } from "../../platform/product/common/productService.js";
import { IContextKeyService } from "../../platform/contextkey/common/contextkey.js";
import { IWorkbenchEnvironmentService } from "../../workbench/services/environment/common/environmentService.js";
import { IAuthenticationService } from "../../workbench/services/authentication/common/authentication.js";
import { ICommandService } from "../../platform/commands/common/commands.js";
import { IWorkbenchLayoutService } from "../../workbench/services/layout/browser/layoutService.js";
import { IKeybindingService } from "../../platform/keybinding/common/keybinding.js";
import { IHostService } from "../../workbench/services/host/browser/host.js";
import { IMarkdownRendererService } from "../../platform/markdown/browser/markdownRenderer.js";
import { WELCOME_COMPLETE_KEY } from "../common/welcome.js";
import { SessionsWelcomeVisibleContext } from "../common/contextkeys.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { Codicon } from "../../base/common/codicons.js";
import { $, append } from "../../base/browser/dom.js";
import { Dialog, DialogContentsAlignment } from "../../base/browser/ui/dialog/dialog.js";
import { createWorkbenchDialogOptions } from "../../workbench/browser/parts/dialogs/dialog.js";
import { MarkdownString } from "../../base/common/htmlContent.js";
import { localize } from "../../nls.js";
const AIDisabledConfig = "chat.disableAIFeatures";
const ISessionsSetUpService = createDecorator("sessionsSetUpService");
function shouldSkipSessionsWelcome(environmentService) {
  if (environmentService.enableSmokeTestDriver) {
    return true;
  }
  const envArgs = environmentService.args;
  if (envArgs?.["skip-sessions-welcome"]) {
    return true;
  }
  return typeof globalThis.location !== "undefined" && new URLSearchParams(globalThis.location.search).has("skip-sessions-welcome");
}
let SessionsSetUpWidget = class extends Disposable {
  // Non-service params must come before @-decorated service params
  constructor(onCompleted, serviceWhenSetupDone, serviceMarkDone, onInitialSignInDialogShown, defaultAccountService, productService, storageService, contextKeyService, environmentService, authenticationService, logService, commandService, configurationService, layoutService, keybindingService, hostService, markdownRendererService) {
    super();
    this.onCompleted = onCompleted;
    this.serviceWhenSetupDone = serviceWhenSetupDone;
    this.serviceMarkDone = serviceMarkDone;
    this.onInitialSignInDialogShown = onInitialSignInDialogShown;
    this.defaultAccountService = defaultAccountService;
    this.productService = productService;
    this.storageService = storageService;
    this.contextKeyService = contextKeyService;
    this.environmentService = environmentService;
    this.authenticationService = authenticationService;
    this.logService = logService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.layoutService = layoutService;
    this.keybindingService = keybindingService;
    this.hostService = hostService;
    this.markdownRendererService = markdownRendererService;
    this.dialogRef = this._register(new MutableDisposable());
    this.watcherRef = this._register(new MutableDisposable());
    this._initialSetupFlow = true;
    this._start();
  }
  _start() {
    if (!this.productService.defaultChatAgent?.chatExtensionId) {
      this.onCompleted();
      return;
    }
    if (shouldSkipSessionsWelcome(this.environmentService)) {
      this.onCompleted();
      return;
    }
    if (isWeb) {
      void this._checkWebAuth().finally(() => this._initialSetupFlow = false);
      this._watchWebAuth();
      return;
    }
    const isFirstLaunch = !this.storageService.getBoolean(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION, false);
    if (isFirstLaunch) {
      void this._showWelcome(true).finally(() => this._initialSetupFlow = false);
    } else {
      void this._watchSignInState().finally(() => this._initialSetupFlow = false);
    }
  }
  async _checkWebAuth() {
    try {
      const sessions = await this.authenticationService.getSessions("github");
      if (sessions.length > 0) {
        this.logService.info("[sessions welcome] GitHub session found on web, skipping welcome");
        this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
        this.onCompleted();
        return;
      }
    } catch {
    }
    this._showWelcome(false);
  }
  _watchWebAuth() {
    this._register(this.authenticationService.onDidChangeSessions(async (e) => {
      if (e.providerId !== "github" || !e.event.removed?.length) {
        return;
      }
      try {
        const remaining = await this.authenticationService.getSessions("github");
        if (remaining.length > 0) {
          return;
        }
      } catch {
      }
      this.logService.info("[sessions welcome] GitHub session removed on web, re-showing welcome");
      this.storageService.remove(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION);
      this._showWelcome(false);
    }));
  }
  async _watchSignInState() {
    const initialAccount = await this.defaultAccountService.getDefaultAccount();
    if (this.dialogRef.value) {
      return;
    }
    if (!initialAccount) {
      this._showWelcome(false);
      return;
    }
    await this._ensureAIFeaturesEnabled();
    this.onCompleted();
    this.watcherRef.value = this._watchActiveState(true);
  }
  _watchActiveState(signedIn) {
    const disposables = new DisposableStore();
    disposables.add(this.defaultAccountService.onDidChangeDefaultAccount((account) => {
      const nowSignedIn = account !== null;
      if (signedIn && !nowSignedIn) {
        this.storageService.remove(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION);
        this._showWelcome(false);
      }
      signedIn = nowSignedIn;
    }));
    disposables.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AIDisabledConfig)) {
        if (this.configurationService.getValue(AIDisabledConfig)) {
          this._showAIDisabledDialog();
        } else {
          this.dialogRef.clear();
        }
      }
    }));
    return disposables;
  }
  async _ensureAIFeaturesEnabled() {
    if (this.configurationService.getValue(AIDisabledConfig)) {
      this.logService.info("[sessions welcome] AI features disabled, enabling");
      await this.configurationService.updateValue(AIDisabledConfig, false);
    }
  }
  async _showAIDisabledDialog() {
    if (this.dialogRef.value) {
      return;
    }
    this.logService.info("[sessions welcome] AI features disabled, showing enable dialog");
    const disposables = new DisposableStore();
    this.dialogRef.value = disposables;
    const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(this.contextKeyService);
    welcomeVisibleKey.set(true);
    disposables.add(toDisposable(() => welcomeVisibleKey.reset()));
    const dialog = disposables.add(new Dialog(
      this.layoutService.activeContainer,
      "",
      [localize("sessions.aiDisabled.enable", "Enable AI Features")],
      createWorkbenchDialogOptions({
        type: "none",
        extraClasses: ["chat-setup-dialog", "sessions-welcome-dialog"],
        detail: localize("sessions.aiDisabled.detail", "Enable AI features to continue using Agents."),
        icon: Codicon.agent,
        alignment: DialogContentsAlignment.Vertical,
        cancelId: 1,
        disableCloseButton: true,
        disableCloseAction: true
      }, this.keybindingService, this.layoutService, this.hostService)
    ));
    const { button } = await dialog.show();
    disposables.dispose();
    this.dialogRef.clear();
    if (button === 0) {
      this.logService.info("[sessions welcome] User chose to enable AI features");
      await this.configurationService.updateValue(AIDisabledConfig, false);
    }
  }
  async _showWelcome(isFirstLaunch) {
    if (this.dialogRef.value) {
      return;
    }
    this.watcherRef.clear();
    this.dialogRef.value = new DisposableStore();
    const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(this.contextKeyService);
    welcomeVisibleKey.set(true);
    this.dialogRef.value.add(toDisposable(() => welcomeVisibleKey.reset()));
    if (isFirstLaunch) {
      const overlay = this._showLoadingOverlay();
      this.dialogRef.value.add(overlay);
      const account = await this.defaultAccountService.getDefaultAccount();
      if (this._store.isDisposed) {
        return;
      }
      overlay.element.classList.add("sessions-loading-dismissed");
      this.dialogRef.value.add(disposableTimeout(() => overlay.element.remove(), 200));
      if (account) {
        const setupDone = await this.serviceWhenSetupDone();
        if (this._store.isDisposed) {
          return;
        }
        if (setupDone) {
          this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
          this.dialogRef.clear();
          this._watchSignInState();
          return;
        }
        await this._showWelcomeDialog();
      } else {
        await this._showSignInDialog();
      }
    } else {
      await this._showSignInDialog();
    }
    this.dialogRef.clear();
    await this._ensureAIFeaturesEnabled();
    this._watchSignInState();
  }
  _showLoadingOverlay() {
    const overlay = append(this.layoutService.mainContainer, $("div.sessions-loading-overlay"));
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-busy", "true");
    overlay.setAttribute("aria-label", localize("loading", "Loading"));
    append(overlay, $("div.sessions-loading-icon.codicon.codicon-agent"));
    return { element: overlay, dispose: () => overlay.remove() };
  }
  async _showSignInDialog() {
    if (this._initialSetupFlow) {
      this.onInitialSignInDialogShown();
    }
    this.logService.info("[sessions welcome] Showing sign-in dialog");
    const signingInDialogRef = new MutableDisposable();
    const success = await this.commandService.executeCommand("workbench.action.chat.triggerSetup", void 0, {
      forceSignInDialog: true,
      dialogIcon: Codicon.agent,
      dialogTitle: localize("sessions.signIn", "Sign in to use Agents"),
      disableCloseButton: true,
      onSignInStarted: () => {
        const disposables = new DisposableStore();
        signingInDialogRef.value = disposables;
        const dialog = disposables.add(new Dialog(
          this.layoutService.activeContainer,
          localize("sessions.signingIn", "Signing in\u2026"),
          [],
          createWorkbenchDialogOptions({
            type: "none",
            extraClasses: ["chat-setup-dialog", "sessions-welcome-dialog"],
            detail: localize("sessions.signingIn.detail", "Please complete sign-in in the browser."),
            icon: Codicon.agent,
            alignment: DialogContentsAlignment.Vertical,
            cancelId: 0,
            disableCloseButton: true,
            disableDefaultAction: true
          }, this.keybindingService, this.layoutService, this.hostService)
        ));
        dialog.show();
      }
    });
    signingInDialogRef.dispose();
    if (success) {
      this.logService.info("[sessions welcome] Sign-in completed successfully");
      this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
      this.serviceMarkDone();
    } else {
      this.logService.info("[sessions welcome] Sign-in was canceled or failed");
    }
  }
  async _showWelcomeDialog() {
    this.logService.info("[sessions welcome] Showing welcome dialog");
    const disposables = new DisposableStore();
    const productName = localize("walkthrough.productName", "{0} - Agents", this.productService.nameLong);
    const dialog = disposables.add(new Dialog(
      this.layoutService.activeContainer,
      localize("sessions.welcome.title", "Welcome to {0}", productName),
      [localize("sessions.welcome.getStarted", "Get Started")],
      createWorkbenchDialogOptions({
        type: "none",
        extraClasses: ["chat-setup-dialog", "sessions-welcome-dialog", "sessions-main-welcome-dialog"],
        detail: localize("sessions.welcome.detail", "Your AI-powered coding experience where agents explore, build, and iterate with you."),
        icon: Codicon.agent,
        alignment: DialogContentsAlignment.Vertical,
        cancelId: 1,
        disableCloseButton: true,
        renderFooter: (footer) => footer.appendChild(this._createWelcomeFooter(disposables))
      }, this.keybindingService, this.layoutService, this.hostService)
    ));
    await dialog.show();
    disposables.dispose();
    this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
    this.serviceMarkDone();
  }
  _createWelcomeFooter(disposables) {
    const element = $(".chat-setup-dialog-footer");
    const defaultChatAgent = this.productService.defaultChatAgent;
    const providerName = defaultChatAgent?.provider?.default?.name ?? "GitHub";
    const termsUrl = defaultChatAgent?.termsStatementUrl ?? "";
    const privacyUrl = defaultChatAgent?.privacyStatementUrl ?? "";
    const publicCodeUrl = defaultChatAgent?.publicCodeMatchesUrl ?? "";
    const settingsUrl = this.defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings);
    const footer = localize(
      { key: "welcomeFooter", comment: ['{Locked="["}', '{Locked="]({1})"}', '{Locked="]({2})"}', '{Locked="]({4})"}', '{Locked="]({5})"}'] },
      "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}). {3} Copilot may show [public code]({4}) suggestions and use your data to improve the product. You can change these [settings]({5}) anytime.",
      providerName,
      termsUrl,
      privacyUrl,
      providerName,
      publicCodeUrl,
      settingsUrl
    );
    element.appendChild($("p", void 0, disposables.add(this.markdownRendererService.render(new MarkdownString(footer, { isTrusted: true }))).element));
    return element;
  }
};
SessionsSetUpWidget = __decorateClass([
  __decorateParam(4, IDefaultAccountService),
  __decorateParam(5, IProductService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IWorkbenchEnvironmentService),
  __decorateParam(9, IAuthenticationService),
  __decorateParam(10, ILogService),
  __decorateParam(11, ICommandService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IWorkbenchLayoutService),
  __decorateParam(14, IKeybindingService),
  __decorateParam(15, IHostService),
  __decorateParam(16, IMarkdownRendererService)
], SessionsSetUpWidget);
let SessionsSetUpService = class extends Disposable {
  constructor(instantiationService, userDataProfileStorageService, userDataProfilesService, chatEntitlementService, logService) {
    super();
    this.instantiationService = instantiationService;
    this.userDataProfileStorageService = userDataProfileStorageService;
    this.userDataProfilesService = userDataProfilesService;
    this.chatEntitlementService = chatEntitlementService;
    this.logService = logService;
    this._welcomeDoneDeferred = new DeferredPromise();
    this._initialSignInDialogShown = false;
    this._initPromise = this.initialize();
    this._register(this.instantiationService.createInstance(
      SessionsSetUpWidget,
      () => this._welcomeDoneDeferred.complete(),
      () => this.whenSetupDone(),
      () => this.markDone(),
      () => this._initialSignInDialogShown = true
    ));
  }
  get initialSignInDialogShown() {
    return this._initialSignInDialogShown;
  }
  async whenSetupDone() {
    await this._initPromise;
    return this.chatEntitlementService.sentiment.completed === true;
  }
  markDone() {
    this.chatEntitlementService.markSetupCompleted();
  }
  whenWelcomeDone() {
    return this._welcomeDoneDeferred.p;
  }
  async initialize() {
    if (this.chatEntitlementService.sentiment.completed) {
      return;
    }
    try {
      const defaultProfile = this.userDataProfilesService.defaultProfile;
      await this.userDataProfileStorageService.withProfileScopedStorageService(defaultProfile, async (storageService) => {
        const defaultContext = this.instantiationService.createChild(new ServiceCollection([IStorageService, storageService])).createInstance(ChatEntitlementContext);
        try {
          if (defaultContext.state.completed) {
            this.logService.info("[sessions welcome] Setup already completed in default profile, marking done locally");
            this.markDone();
          }
        } finally {
          defaultContext.dispose();
        }
      });
    } catch (error) {
      this.logService.error("[sessions welcome] Failed to read setup state from default profile:", error);
    }
  }
};
SessionsSetUpService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IUserDataProfileStorageService),
  __decorateParam(2, IUserDataProfilesService),
  __decorateParam(3, IChatEntitlementService),
  __decorateParam(4, ILogService)
], SessionsSetUpService);
export {
  ISessionsSetUpService,
  SessionsSetUpService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXRVcFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvc2Vzc2lvbnNTZXRVcC5jc3MnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnRDb250ZXh0LCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgR2l0SHViUGF0aHMsIElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFdFTENPTUVfQ09NUExFVEVfS0VZIH0gZnJvbSAnLi4vY29tbW9uL3dlbGNvbWUuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNXZWxjb21lVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuXG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyAkLCBhcHBlbmQgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERpYWxvZywgRGlhbG9nQ29udGVudHNBbGlnbm1lbnQgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZGlhbG9nL2RpYWxvZy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVXb3JrYmVuY2hEaWFsb2dPcHRpb25zIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZGlhbG9ncy9kaWFsb2cuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uL25scy5qcyc7XG5cbmNvbnN0IEFJRGlzYWJsZWRDb25maWcgPSAnY2hhdC5kaXNhYmxlQUlGZWF0dXJlcyc7XG5cbmV4cG9ydCBjb25zdCBJU2Vzc2lvbnNTZXRVcFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVNlc3Npb25zU2V0VXBTZXJ2aWNlPignc2Vzc2lvbnNTZXRVcFNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbnNTZXRVcFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGluaXRpYWxTaWduSW5EaWFsb2dTaG93bjogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFJlc29sdmVzIHdoZW4gdGhlIHdlbGNvbWUvc2V0dXAgZmxvdyBoYXMgY29tcGxldGVkIChvciBpbW1lZGlhdGVseVxuXHQgKiBpZiBpdCBpcyBub3QgY3VycmVudGx5IGFjdGl2ZSkuIFVzZSB0aGlzIHRvIGRlZmVyIHdvcmsgdW50aWwgYWZ0ZXJcblx0ICogdGhlIHVzZXIgaGFzIGZpbmlzaGVkIHRoZSBpbml0aWFsIHNpZ24taW4gb3Igc2V0dXAgZGlhbG9nLlxuXHQgKi9cblx0d2hlbldlbGNvbWVEb25lKCk6IFByb21pc2U8dm9pZD47XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gSW50ZXJuYWwgd2VsY29tZSB3aWRnZXQgXHUyMDE0IG93bnMgYWxsIHRoZSB3ZWxjb21lIFVJIGxvZ2ljLlxuLy8gUmVjZWl2ZXMgc2VydmljZSBjYWxsYmFja3MgYXMgY29uc3RydWN0b3IgcGFyYW1zIHRvIGF2b2lkIGNpcmN1bGFyIGluamVjdGlvbi5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBzaG91bGRTa2lwU2Vzc2lvbnNXZWxjb21lKGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSk6IGJvb2xlYW4ge1xuXHRpZiAoZW52aXJvbm1lbnRTZXJ2aWNlLmVuYWJsZVNtb2tlVGVzdERyaXZlcikge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGNvbnN0IGVudkFyZ3MgPSAoZW52aXJvbm1lbnRTZXJ2aWNlIGFzIElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgJiB7IGFyZ3M/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9KS5hcmdzO1xuXHRpZiAoZW52QXJncz8uWydza2lwLXNlc3Npb25zLXdlbGNvbWUnXSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiB0eXBlb2YgZ2xvYmFsVGhpcy5sb2NhdGlvbiAhPT0gJ3VuZGVmaW5lZCcgJiYgbmV3IFVSTFNlYXJjaFBhcmFtcyhnbG9iYWxUaGlzLmxvY2F0aW9uLnNlYXJjaCkuaGFzKCdza2lwLXNlc3Npb25zLXdlbGNvbWUnKTtcbn1cblxuY2xhc3MgU2Vzc2lvbnNTZXRVcFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nUmVmID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgd2F0Y2hlclJlZiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBfaW5pdGlhbFNldHVwRmxvdyA9IHRydWU7XG5cblx0Ly8gTm9uLXNlcnZpY2UgcGFyYW1zIG11c3QgY29tZSBiZWZvcmUgQC1kZWNvcmF0ZWQgc2VydmljZSBwYXJhbXNcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvbkNvbXBsZXRlZDogKCkgPT4gdm9pZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlcnZpY2VXaGVuU2V0dXBEb25lOiAoKSA9PiBQcm9taXNlPGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2VydmljZU1hcmtEb25lOiAoKSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb25Jbml0aWFsU2lnbkluRGlhbG9nU2hvd246ICgpID0+IHZvaWQsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc3RhcnQoKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py5jaGF0RXh0ZW5zaW9uSWQpIHtcblx0XHRcdHRoaXMub25Db21wbGV0ZWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc2hvdWxkU2tpcFNlc3Npb25zV2VsY29tZSh0aGlzLmVudmlyb25tZW50U2VydmljZSkpIHtcblx0XHRcdHRoaXMub25Db21wbGV0ZWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHZvaWQgdGhpcy5fY2hlY2tXZWJBdXRoKCkuZmluYWxseSgoKSA9PiB0aGlzLl9pbml0aWFsU2V0dXBGbG93ID0gZmFsc2UpO1xuXHRcdFx0dGhpcy5fd2F0Y2hXZWJBdXRoKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNGaXJzdExhdW5jaCA9ICF0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oV0VMQ09NRV9DT01QTEVURV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXG5cdFx0aWYgKGlzRmlyc3RMYXVuY2gpIHtcblx0XHRcdHZvaWQgdGhpcy5fc2hvd1dlbGNvbWUodHJ1ZSkuZmluYWxseSgoKSA9PiB0aGlzLl9pbml0aWFsU2V0dXBGbG93ID0gZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2b2lkIHRoaXMuX3dhdGNoU2lnbkluU3RhdGUoKS5maW5hbGx5KCgpID0+IHRoaXMuX2luaXRpYWxTZXR1cEZsb3cgPSBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2hlY2tXZWJBdXRoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKCdnaXRodWInKTtcblx0XHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbc2Vzc2lvbnMgd2VsY29tZV0gR2l0SHViIHNlc3Npb24gZm91bmQgb24gd2ViLCBza2lwcGluZyB3ZWxjb21lJyk7XG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoV0VMQ09NRV9DT01QTEVURV9LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdFx0dGhpcy5vbkNvbXBsZXRlZCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBQcm92aWRlciBub3QgYXZhaWxhYmxlIHlldCBcdTIwMTQgc2hvdyBkaWFsb2dcblx0XHR9XG5cdFx0dGhpcy5fc2hvd1dlbGNvbWUoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2F0Y2hXZWJBdXRoKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoZS5wcm92aWRlcklkICE9PSAnZ2l0aHViJyB8fCAhZS5ldmVudC5yZW1vdmVkPy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVtYWluaW5nID0gYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMoJ2dpdGh1YicpO1xuXHRcdFx0XHRpZiAocmVtYWluaW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBQcm92aWRlciBiZWNhbWUgdW5hdmFpbGFibGUgXHUyMDE0IHRyZWF0IGFzIHNpZ25lZCBvdXRcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbc2Vzc2lvbnMgd2VsY29tZV0gR2l0SHViIHNlc3Npb24gcmVtb3ZlZCBvbiB3ZWIsIHJlLXNob3dpbmcgd2VsY29tZScpO1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoV0VMQ09NRV9DT01QTEVURV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHR0aGlzLl9zaG93V2VsY29tZShmYWxzZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd2F0Y2hTaWduSW5TdGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbml0aWFsQWNjb3VudCA9IGF3YWl0IHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLmdldERlZmF1bHRBY2NvdW50KCk7XG5cdFx0aWYgKHRoaXMuZGlhbG9nUmVmLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghaW5pdGlhbEFjY291bnQpIHtcblx0XHRcdHRoaXMuX3Nob3dXZWxjb21lKGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZW5zdXJlQUlGZWF0dXJlc0VuYWJsZWQoKTtcblx0XHR0aGlzLm9uQ29tcGxldGVkKCk7XG5cdFx0dGhpcy53YXRjaGVyUmVmLnZhbHVlID0gdGhpcy5fd2F0Y2hBY3RpdmVTdGF0ZSh0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX3dhdGNoQWN0aXZlU3RhdGUoc2lnbmVkSW46IGJvb2xlYW4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2Uub25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudChhY2NvdW50ID0+IHtcblx0XHRcdGNvbnN0IG5vd1NpZ25lZEluID0gYWNjb3VudCAhPT0gbnVsbDtcblx0XHRcdGlmIChzaWduZWRJbiAmJiAhbm93U2lnbmVkSW4pIHtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoV0VMQ09NRV9DT01QTEVURV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRcdHRoaXMuX3Nob3dXZWxjb21lKGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdHNpZ25lZEluID0gbm93U2lnbmVkSW47XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQUlEaXNhYmxlZENvbmZpZykpIHtcblx0XHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQUlEaXNhYmxlZENvbmZpZykpIHtcblx0XHRcdFx0XHR0aGlzLl9zaG93QUlEaXNhYmxlZERpYWxvZygpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEFJIGZlYXR1cmVzIHJlLWVuYWJsZWQgXHUyMDE0IGRpc21pc3MgYW55IEFJIGRpc2FibGVkIGRpYWxvZ1xuXHRcdFx0XHRcdHRoaXMuZGlhbG9nUmVmLmNsZWFyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVBSUZlYXR1cmVzRW5hYmxlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBSURpc2FibGVkQ29uZmlnKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tzZXNzaW9ucyB3ZWxjb21lXSBBSSBmZWF0dXJlcyBkaXNhYmxlZCwgZW5hYmxpbmcnKTtcblx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQUlEaXNhYmxlZENvbmZpZywgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Nob3dBSURpc2FibGVkRGlhbG9nKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmRpYWxvZ1JlZi52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbc2Vzc2lvbnMgd2VsY29tZV0gQUkgZmVhdHVyZXMgZGlzYWJsZWQsIHNob3dpbmcgZW5hYmxlIGRpYWxvZycpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5kaWFsb2dSZWYudmFsdWUgPSBkaXNwb3NhYmxlcztcblxuXHRcdGNvbnN0IHdlbGNvbWVWaXNpYmxlS2V5ID0gU2Vzc2lvbnNXZWxjb21lVmlzaWJsZUNvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHdlbGNvbWVWaXNpYmxlS2V5LnNldCh0cnVlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHdlbGNvbWVWaXNpYmxlS2V5LnJlc2V0KCkpKTtcblxuXHRcdGNvbnN0IGRpYWxvZyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlhbG9nKFxuXHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcixcblx0XHRcdCcnLFxuXHRcdFx0W2xvY2FsaXplKCdzZXNzaW9ucy5haURpc2FibGVkLmVuYWJsZScsIFwiRW5hYmxlIEFJIEZlYXR1cmVzXCIpXSxcblx0XHRcdGNyZWF0ZVdvcmtiZW5jaERpYWxvZ09wdGlvbnMoe1xuXHRcdFx0XHR0eXBlOiAnbm9uZScsXG5cdFx0XHRcdGV4dHJhQ2xhc3NlczogWydjaGF0LXNldHVwLWRpYWxvZycsICdzZXNzaW9ucy13ZWxjb21lLWRpYWxvZyddLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdzZXNzaW9ucy5haURpc2FibGVkLmRldGFpbCcsIFwiRW5hYmxlIEFJIGZlYXR1cmVzIHRvIGNvbnRpbnVlIHVzaW5nIEFnZW50cy5cIiksXG5cdFx0XHRcdGljb246IENvZGljb24uYWdlbnQsXG5cdFx0XHRcdGFsaWdubWVudDogRGlhbG9nQ29udGVudHNBbGlnbm1lbnQuVmVydGljYWwsXG5cdFx0XHRcdGNhbmNlbElkOiAxLFxuXHRcdFx0XHRkaXNhYmxlQ2xvc2VCdXR0b246IHRydWUsXG5cdFx0XHRcdGRpc2FibGVDbG9zZUFjdGlvbjogdHJ1ZSxcblx0XHRcdH0sIHRoaXMua2V5YmluZGluZ1NlcnZpY2UsIHRoaXMubGF5b3V0U2VydmljZSwgdGhpcy5ob3N0U2VydmljZSlcblx0XHQpKTtcblxuXHRcdGNvbnN0IHsgYnV0dG9uIH0gPSBhd2FpdCBkaWFsb2cuc2hvdygpO1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRpYWxvZ1JlZi5jbGVhcigpO1xuXG5cdFx0aWYgKGJ1dHRvbiA9PT0gMCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tzZXNzaW9ucyB3ZWxjb21lXSBVc2VyIGNob3NlIHRvIGVuYWJsZSBBSSBmZWF0dXJlcycpO1xuXHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShBSURpc2FibGVkQ29uZmlnLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvd1dlbGNvbWUoaXNGaXJzdExhdW5jaDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmRpYWxvZ1JlZi52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMud2F0Y2hlclJlZi5jbGVhcigpO1xuXHRcdHRoaXMuZGlhbG9nUmVmLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3Qgd2VsY29tZVZpc2libGVLZXkgPSBTZXNzaW9uc1dlbGNvbWVWaXNpYmxlQ29udGV4dC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0d2VsY29tZVZpc2libGVLZXkuc2V0KHRydWUpO1xuXHRcdHRoaXMuZGlhbG9nUmVmLnZhbHVlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gd2VsY29tZVZpc2libGVLZXkucmVzZXQoKSkpO1xuXG5cdFx0aWYgKGlzRmlyc3RMYXVuY2gpIHtcblx0XHRcdGNvbnN0IG92ZXJsYXkgPSB0aGlzLl9zaG93TG9hZGluZ092ZXJsYXkoKTtcblx0XHRcdHRoaXMuZGlhbG9nUmVmLnZhbHVlLmFkZChvdmVybGF5KTtcblxuXHRcdFx0Y29uc3QgYWNjb3VudCA9IGF3YWl0IHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLmdldERlZmF1bHRBY2NvdW50KCk7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJsYXkuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzZXNzaW9ucy1sb2FkaW5nLWRpc21pc3NlZCcpO1xuXHRcdFx0dGhpcy5kaWFsb2dSZWYudmFsdWUuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IG92ZXJsYXkuZWxlbWVudC5yZW1vdmUoKSwgMjAwKSk7XG5cblx0XHRcdGlmIChhY2NvdW50KSB7XG5cdFx0XHRcdGNvbnN0IHNldHVwRG9uZSA9IGF3YWl0IHRoaXMuc2VydmljZVdoZW5TZXR1cERvbmUoKTtcblx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc2V0dXBEb25lKSB7XG5cdFx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShXRUxDT01FX0NPTVBMRVRFX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0XHRcdHRoaXMuZGlhbG9nUmVmLmNsZWFyKCk7XG5cdFx0XHRcdFx0dGhpcy5fd2F0Y2hTaWduSW5TdGF0ZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Nob3dXZWxjb21lRGlhbG9nKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zaG93U2lnbkluRGlhbG9nKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Nob3dTaWduSW5EaWFsb2coKTtcblx0XHR9XG5cblx0XHR0aGlzLmRpYWxvZ1JlZi5jbGVhcigpO1xuXHRcdGF3YWl0IHRoaXMuX2Vuc3VyZUFJRmVhdHVyZXNFbmFibGVkKCk7XG5cdFx0dGhpcy5fd2F0Y2hTaWduSW5TdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0xvYWRpbmdPdmVybGF5KCk6IHsgZWxlbWVudDogSFRNTEVsZW1lbnQgfSAmIElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBvdmVybGF5ID0gYXBwZW5kKHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLCAkKCdkaXYuc2Vzc2lvbnMtbG9hZGluZy1vdmVybGF5JykpO1xuXHRcdG92ZXJsYXkuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3N0YXR1cycpO1xuXHRcdG92ZXJsYXkuc2V0QXR0cmlidXRlKCdhcmlhLWJ1c3knLCAndHJ1ZScpO1xuXHRcdG92ZXJsYXkuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2xvYWRpbmcnLCBcIkxvYWRpbmdcIikpO1xuXHRcdGFwcGVuZChvdmVybGF5LCAkKCdkaXYuc2Vzc2lvbnMtbG9hZGluZy1pY29uLmNvZGljb24uY29kaWNvbi1hZ2VudCcpKTtcblx0XHRyZXR1cm4geyBlbGVtZW50OiBvdmVybGF5LCBkaXNwb3NlOiAoKSA9PiBvdmVybGF5LnJlbW92ZSgpIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaG93U2lnbkluRGlhbG9nKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9pbml0aWFsU2V0dXBGbG93KSB7XG5cdFx0XHR0aGlzLm9uSW5pdGlhbFNpZ25JbkRpYWxvZ1Nob3duKCk7XG5cdFx0fVxuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbc2Vzc2lvbnMgd2VsY29tZV0gU2hvd2luZyBzaWduLWluIGRpYWxvZycpO1xuXG5cdFx0Y29uc3Qgc2lnbmluZ0luRGlhbG9nUmVmID0gbmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKTtcblxuXHRcdGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPGJvb2xlYW4+KCd3b3JrYmVuY2guYWN0aW9uLmNoYXQudHJpZ2dlclNldHVwJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRmb3JjZVNpZ25JbkRpYWxvZzogdHJ1ZSxcblx0XHRcdGRpYWxvZ0ljb246IENvZGljb24uYWdlbnQsXG5cdFx0XHRkaWFsb2dUaXRsZTogbG9jYWxpemUoJ3Nlc3Npb25zLnNpZ25JbicsIFwiU2lnbiBpbiB0byB1c2UgQWdlbnRzXCIpLFxuXHRcdFx0ZGlzYWJsZUNsb3NlQnV0dG9uOiB0cnVlLFxuXHRcdFx0b25TaWduSW5TdGFydGVkOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRzaWduaW5nSW5EaWFsb2dSZWYudmFsdWUgPSBkaXNwb3NhYmxlcztcblx0XHRcdFx0Y29uc3QgZGlhbG9nID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaWFsb2coXG5cdFx0XHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcixcblx0XHRcdFx0XHRsb2NhbGl6ZSgnc2Vzc2lvbnMuc2lnbmluZ0luJywgXCJTaWduaW5nIGluXHUyMDI2XCIpLFxuXHRcdFx0XHRcdFtdLFxuXHRcdFx0XHRcdGNyZWF0ZVdvcmtiZW5jaERpYWxvZ09wdGlvbnMoe1xuXHRcdFx0XHRcdFx0dHlwZTogJ25vbmUnLFxuXHRcdFx0XHRcdFx0ZXh0cmFDbGFzc2VzOiBbJ2NoYXQtc2V0dXAtZGlhbG9nJywgJ3Nlc3Npb25zLXdlbGNvbWUtZGlhbG9nJ10sXG5cdFx0XHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdzZXNzaW9ucy5zaWduaW5nSW4uZGV0YWlsJywgXCJQbGVhc2UgY29tcGxldGUgc2lnbi1pbiBpbiB0aGUgYnJvd3Nlci5cIiksXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmFnZW50LFxuXHRcdFx0XHRcdFx0YWxpZ25tZW50OiBEaWFsb2dDb250ZW50c0FsaWdubWVudC5WZXJ0aWNhbCxcblx0XHRcdFx0XHRcdGNhbmNlbElkOiAwLFxuXHRcdFx0XHRcdFx0ZGlzYWJsZUNsb3NlQnV0dG9uOiB0cnVlLFxuXHRcdFx0XHRcdFx0ZGlzYWJsZURlZmF1bHRBY3Rpb246IHRydWUsXG5cdFx0XHRcdFx0fSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgdGhpcy5sYXlvdXRTZXJ2aWNlLCB0aGlzLmhvc3RTZXJ2aWNlKVxuXHRcdFx0XHQpKTtcblx0XHRcdFx0ZGlhbG9nLnNob3coKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHNpZ25pbmdJbkRpYWxvZ1JlZi5kaXNwb3NlKCk7XG5cblx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tzZXNzaW9ucyB3ZWxjb21lXSBTaWduLWluIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoV0VMQ09NRV9DT01QTEVURV9LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdHRoaXMuc2VydmljZU1hcmtEb25lKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbc2Vzc2lvbnMgd2VsY29tZV0gU2lnbi1pbiB3YXMgY2FuY2VsZWQgb3IgZmFpbGVkJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvd1dlbGNvbWVEaWFsb2coKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tzZXNzaW9ucyB3ZWxjb21lXSBTaG93aW5nIHdlbGNvbWUgZGlhbG9nJyk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwcm9kdWN0TmFtZSA9IGxvY2FsaXplKCd3YWxrdGhyb3VnaC5wcm9kdWN0TmFtZScsIFwiezB9IC0gQWdlbnRzXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpO1xuXG5cdFx0Y29uc3QgZGlhbG9nID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaWFsb2coXG5cdFx0XHR0aGlzLmxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyLFxuXHRcdFx0bG9jYWxpemUoJ3Nlc3Npb25zLndlbGNvbWUudGl0bGUnLCBcIldlbGNvbWUgdG8gezB9XCIsIHByb2R1Y3ROYW1lKSxcblx0XHRcdFtsb2NhbGl6ZSgnc2Vzc2lvbnMud2VsY29tZS5nZXRTdGFydGVkJywgXCJHZXQgU3RhcnRlZFwiKV0sXG5cdFx0XHRjcmVhdGVXb3JrYmVuY2hEaWFsb2dPcHRpb25zKHtcblx0XHRcdFx0dHlwZTogJ25vbmUnLFxuXHRcdFx0XHRleHRyYUNsYXNzZXM6IFsnY2hhdC1zZXR1cC1kaWFsb2cnLCAnc2Vzc2lvbnMtd2VsY29tZS1kaWFsb2cnLCAnc2Vzc2lvbnMtbWFpbi13ZWxjb21lLWRpYWxvZyddLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdzZXNzaW9ucy53ZWxjb21lLmRldGFpbCcsIFwiWW91ciBBSS1wb3dlcmVkIGNvZGluZyBleHBlcmllbmNlIHdoZXJlIGFnZW50cyBleHBsb3JlLCBidWlsZCwgYW5kIGl0ZXJhdGUgd2l0aCB5b3UuXCIpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmFnZW50LFxuXHRcdFx0XHRhbGlnbm1lbnQ6IERpYWxvZ0NvbnRlbnRzQWxpZ25tZW50LlZlcnRpY2FsLFxuXHRcdFx0XHRjYW5jZWxJZDogMSxcblx0XHRcdFx0ZGlzYWJsZUNsb3NlQnV0dG9uOiB0cnVlLFxuXHRcdFx0XHRyZW5kZXJGb290ZXI6IGZvb3RlciA9PiBmb290ZXIuYXBwZW5kQ2hpbGQodGhpcy5fY3JlYXRlV2VsY29tZUZvb3RlcihkaXNwb3NhYmxlcykpLFxuXHRcdFx0fSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgdGhpcy5sYXlvdXRTZXJ2aWNlLCB0aGlzLmhvc3RTZXJ2aWNlKVxuXHRcdCkpO1xuXG5cdFx0YXdhaXQgZGlhbG9nLnNob3coKTtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFdFTENPTUVfQ09NUExFVEVfS0VZLCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0dGhpcy5zZXJ2aWNlTWFya0RvbmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVdlbGNvbWVGb290ZXIoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBlbGVtZW50ID0gJCgnLmNoYXQtc2V0dXAtZGlhbG9nLWZvb3RlcicpO1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0QWdlbnQgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ7XG5cdFx0Y29uc3QgcHJvdmlkZXJOYW1lID0gZGVmYXVsdENoYXRBZ2VudD8ucHJvdmlkZXI/LmRlZmF1bHQ/Lm5hbWUgPz8gJ0dpdEh1Yic7XG5cdFx0Y29uc3QgdGVybXNVcmwgPSBkZWZhdWx0Q2hhdEFnZW50Py50ZXJtc1N0YXRlbWVudFVybCA/PyAnJztcblx0XHRjb25zdCBwcml2YWN5VXJsID0gZGVmYXVsdENoYXRBZ2VudD8ucHJpdmFjeVN0YXRlbWVudFVybCA/PyAnJztcblx0XHRjb25zdCBwdWJsaWNDb2RlVXJsID0gZGVmYXVsdENoYXRBZ2VudD8ucHVibGljQ29kZU1hdGNoZXNVcmwgPz8gJyc7XG5cdFx0Y29uc3Qgc2V0dGluZ3NVcmwgPSB0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5yZXNvbHZlR2l0SHViVXJsKEdpdEh1YlBhdGhzLmNvcGlsb3RTZXR0aW5ncyk7XG5cblx0XHRjb25zdCBmb290ZXIgPSBsb2NhbGl6ZShcblx0XHRcdHsga2V5OiAnd2VsY29tZUZvb3RlcicsIGNvbW1lbnQ6IFsne0xvY2tlZD1cIltcIn0nLCAne0xvY2tlZD1cIl0oezF9KVwifScsICd7TG9ja2VkPVwiXSh7Mn0pXCJ9JywgJ3tMb2NrZWQ9XCJdKHs0fSlcIn0nLCAne0xvY2tlZD1cIl0oezV9KVwifSddIH0sXG5cdFx0XHRcIkJ5IGNvbnRpbnVpbmcsIHlvdSBhZ3JlZSB0byB7MH0ncyBbVGVybXNdKHsxfSkgYW5kIFtQcml2YWN5IFN0YXRlbWVudF0oezJ9KS4gezN9IENvcGlsb3QgbWF5IHNob3cgW3B1YmxpYyBjb2RlXSh7NH0pIHN1Z2dlc3Rpb25zIGFuZCB1c2UgeW91ciBkYXRhIHRvIGltcHJvdmUgdGhlIHByb2R1Y3QuIFlvdSBjYW4gY2hhbmdlIHRoZXNlIFtzZXR0aW5nc10oezV9KSBhbnl0aW1lLlwiLFxuXHRcdFx0cHJvdmlkZXJOYW1lLCB0ZXJtc1VybCwgcHJpdmFjeVVybCwgcHJvdmlkZXJOYW1lLCBwdWJsaWNDb2RlVXJsLCBzZXR0aW5nc1VybFxuXHRcdCk7XG5cdFx0ZWxlbWVudC5hcHBlbmRDaGlsZCgkKCdwJywgdW5kZWZpbmVkLCBkaXNwb3NhYmxlcy5hZGQodGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIobmV3IE1hcmtkb3duU3RyaW5nKGZvb3RlciwgeyBpc1RydXN0ZWQ6IHRydWUgfSkpKS5lbGVtZW50KSk7XG5cblx0XHRyZXR1cm4gZWxlbWVudDtcblx0fVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFNlcnZpY2Vcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgY2xhc3MgU2Vzc2lvbnNTZXRVcFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNlc3Npb25zU2V0VXBTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbml0UHJvbWlzZTogUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfd2VsY29tZURvbmVEZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cHJpdmF0ZSBfaW5pdGlhbFNpZ25JbkRpYWxvZ1Nob3duID0gZmFsc2U7XG5cblx0Z2V0IGluaXRpYWxTaWduSW5EaWFsb2dTaG93bigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faW5pdGlhbFNpZ25JbkRpYWxvZ1Nob3duO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9pbml0UHJvbWlzZSA9IHRoaXMuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFNlc3Npb25zU2V0VXBXaWRnZXQsXG5cdFx0XHQoKSA9PiB0aGlzLl93ZWxjb21lRG9uZURlZmVycmVkLmNvbXBsZXRlKCksXG5cdFx0XHQoKSA9PiB0aGlzLndoZW5TZXR1cERvbmUoKSxcblx0XHRcdCgpID0+IHRoaXMubWFya0RvbmUoKSxcblx0XHRcdCgpID0+IHRoaXMuX2luaXRpYWxTaWduSW5EaWFsb2dTaG93biA9IHRydWVcblx0XHQpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2hlblNldHVwRG9uZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRhd2FpdCB0aGlzLl9pbml0UHJvbWlzZTtcblx0XHRyZXR1cm4gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5jb21wbGV0ZWQgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIG1hcmtEb25lKCk6IHZvaWQge1xuXHRcdHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5tYXJrU2V0dXBDb21wbGV0ZWQoKTtcblx0fVxuXG5cdHdoZW5XZWxjb21lRG9uZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2VsY29tZURvbmVEZWZlcnJlZC5wO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LmNvbXBsZXRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkZWZhdWx0UHJvZmlsZSA9IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGU7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLndpdGhQcm9maWxlU2NvcGVkU3RvcmFnZVNlcnZpY2UoZGVmYXVsdFByb2ZpbGUsIGFzeW5jIHN0b3JhZ2VTZXJ2aWNlID0+IHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdENvbnRleHQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdFx0XHRcdFx0LmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZV0pKVxuXHRcdFx0XHRcdC5jcmVhdGVJbnN0YW5jZShDaGF0RW50aXRsZW1lbnRDb250ZXh0KTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAoZGVmYXVsdENvbnRleHQuc3RhdGUuY29tcGxldGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW3Nlc3Npb25zIHdlbGNvbWVdIFNldHVwIGFscmVhZHkgY29tcGxldGVkIGluIGRlZmF1bHQgcHJvZmlsZSwgbWFya2luZyBkb25lIGxvY2FsbHknKTtcblx0XHRcdFx0XHRcdHRoaXMubWFya0RvbmUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0ZGVmYXVsdENvbnRleHQuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbc2Vzc2lvbnMgd2VsY29tZV0gRmFpbGVkIHRvIHJlYWQgc2V0dXAgc3RhdGUgZnJvbSBkZWZhdWx0IHByb2ZpbGU6JywgZXJyb3IpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxZQUFZLGlCQUE4QixtQkFBbUIsb0JBQW9CO0FBQzFGLFNBQVMsaUJBQWlCLHlCQUF5QjtBQUNuRCxTQUFTLGlCQUFpQiw2QkFBNkI7QUFDdkQsU0FBUyxtQkFBbUI7QUFDNUIsU0FB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
