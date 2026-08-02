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
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { joinPath } from "../../../../base/common/resources.js";
import { isNumber, isObject, isString } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { INativeEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREFIX, CONFIGURATION_KEY_PREVENT_SLEEP, INACTIVE_TUNNEL_MODE, IRemoteTunnelService, LOGGER_NAME, LOG_ID } from "../../../../platform/remoteTunnel/common/remoteTunnel.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService, isUntitledWorkspace } from "../../../../platform/workspace/common/workspace.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IOutputService } from "../../../services/output/common/output.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
const REMOTE_TUNNEL_CATEGORY = localize2("remoteTunnel.category", "Remote Tunnels");
const REMOTE_TUNNEL_CONNECTION_STATE_KEY = "remoteTunnelConnection";
const REMOTE_TUNNEL_CONNECTION_STATE = new RawContextKey(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "disconnected");
const REMOTE_TUNNEL_USED_STORAGE_KEY = "remoteTunnelServiceUsed";
const REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY = "remoteTunnelServicePromptedPreview";
const REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY = "remoteTunnelExtensionRecommended";
const REMOTE_TUNNEL_HAS_USED_BEFORE = "remoteTunnelHasUsed";
const REMOTE_TUNNEL_EXTENSION_TIMEOUT = 4 * 60 * 1e3;
const INVALID_TOKEN_RETRIES = 2;
var RemoteTunnelCommandIds = /* @__PURE__ */ ((RemoteTunnelCommandIds2) => {
  RemoteTunnelCommandIds2["turnOn"] = "workbench.remoteTunnel.actions.turnOn";
  RemoteTunnelCommandIds2["turnOff"] = "workbench.remoteTunnel.actions.turnOff";
  RemoteTunnelCommandIds2["connecting"] = "workbench.remoteTunnel.actions.connecting";
  RemoteTunnelCommandIds2["manage"] = "workbench.remoteTunnel.actions.manage";
  RemoteTunnelCommandIds2["showLog"] = "workbench.remoteTunnel.actions.showLog";
  RemoteTunnelCommandIds2["configure"] = "workbench.remoteTunnel.actions.configure";
  RemoteTunnelCommandIds2["copyToClipboard"] = "workbench.remoteTunnel.actions.copyToClipboard";
  RemoteTunnelCommandIds2["learnMore"] = "workbench.remoteTunnel.actions.learnMore";
  return RemoteTunnelCommandIds2;
})(RemoteTunnelCommandIds || {});
var RemoteTunnelCommandLabels;
((RemoteTunnelCommandLabels2) => {
  RemoteTunnelCommandLabels2.turnOn = localize("remoteTunnel.actions.turnOn", "Turn on Remote Tunnel Access...");
  RemoteTunnelCommandLabels2.turnOff = localize("remoteTunnel.actions.turnOff", "Turn off Remote Tunnel Access...");
  RemoteTunnelCommandLabels2.showLog = localize("remoteTunnel.actions.showLog", "Show Remote Tunnel Service Log");
  RemoteTunnelCommandLabels2.configure = localize("remoteTunnel.actions.configure", "Configure Tunnel Name...");
  RemoteTunnelCommandLabels2.copyToClipboard = localize("remoteTunnel.actions.copyToClipboard", "Copy Browser URI to Clipboard");
  RemoteTunnelCommandLabels2.learnMore = localize("remoteTunnel.actions.learnMore", "Get Started with Tunnels");
})(RemoteTunnelCommandLabels || (RemoteTunnelCommandLabels = {}));
let RemoteTunnelWorkbenchContribution = class extends Disposable {
  constructor(authenticationService, dialogService, extensionService, contextKeyService, productService, storageService, loggerService, quickInputService, environmentService, remoteTunnelService, commandService, workspaceContextService, progressService, notificationService) {
    super();
    this.authenticationService = authenticationService;
    this.dialogService = dialogService;
    this.extensionService = extensionService;
    this.contextKeyService = contextKeyService;
    this.storageService = storageService;
    this.quickInputService = quickInputService;
    this.environmentService = environmentService;
    this.remoteTunnelService = remoteTunnelService;
    this.commandService = commandService;
    this.workspaceContextService = workspaceContextService;
    this.progressService = progressService;
    this.notificationService = notificationService;
    this.expiredSessions = /* @__PURE__ */ new Set();
    this.logger = this._register(loggerService.createLogger(joinPath(environmentService.logsHome, `${LOG_ID}.log`), { id: LOG_ID, name: LOGGER_NAME }));
    this.connectionStateContext = REMOTE_TUNNEL_CONNECTION_STATE.bindTo(this.contextKeyService);
    const serverConfiguration = productService.tunnelApplicationConfig;
    if (!serverConfiguration || !productService.tunnelApplicationName) {
      this.logger.error("Missing 'tunnelApplicationConfig' or 'tunnelApplicationName' in product.json. Remote tunneling is not available.");
      this.serverConfiguration = { authenticationProviders: {}, editorWebUrl: "", extension: { extensionId: "", friendlyName: "" } };
      return;
    }
    this.serverConfiguration = serverConfiguration;
    this._register(this.remoteTunnelService.onDidChangeTunnelStatus((s) => this.handleTunnelStatusUpdate(s)));
    this.registerCommands();
    this.initialize();
    this.recommendRemoteExtensionIfNeeded();
  }
  handleTunnelStatusUpdate(status) {
    this.connectionInfo = void 0;
    if (status.type === "disconnected") {
      if (status.onTokenFailed) {
        this.expiredSessions.add(status.onTokenFailed.sessionId);
      }
      this.connectionStateContext.set("disconnected");
    } else if (status.type === "connecting") {
      this.connectionStateContext.set("connecting");
    } else if (status.type === "connected") {
      this.connectionInfo = status.info;
      this.connectionStateContext.set("connected");
    }
  }
  async recommendRemoteExtensionIfNeeded() {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const remoteExtension = this.serverConfiguration.extension;
    const shouldRecommend = async () => {
      if (this.storageService.getBoolean(REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY, StorageScope.APPLICATION)) {
        return false;
      }
      if (await this.extensionService.getExtension(remoteExtension.extensionId)) {
        return false;
      }
      const usedOnHostMessage = this.storageService.get(REMOTE_TUNNEL_USED_STORAGE_KEY, StorageScope.APPLICATION);
      if (!usedOnHostMessage) {
        return false;
      }
      let usedTunnelName;
      try {
        const message = JSON.parse(usedOnHostMessage);
        if (!isObject(message)) {
          return false;
        }
        const { hostName, timeStamp } = message;
        if (!isString(hostName) || !isNumber(timeStamp) || (/* @__PURE__ */ new Date()).getTime() > timeStamp + REMOTE_TUNNEL_EXTENSION_TIMEOUT) {
          return false;
        }
        usedTunnelName = hostName;
      } catch (_) {
        return false;
      }
      const currentTunnelName = await this.remoteTunnelService.getTunnelName();
      if (!currentTunnelName || currentTunnelName === usedTunnelName) {
        return false;
      }
      return usedTunnelName;
    };
    const recommed = async () => {
      const usedOnHost = await shouldRecommend();
      if (!usedOnHost) {
        return false;
      }
      this.notificationService.notify({
        severity: Severity.Info,
        priority: NotificationPriority.OPTIONAL,
        message: localize(
          {
            key: "recommend.remoteExtension",
            comment: ["{0} will be a tunnel name, {1} will the link address to the web UI, {6} an extension name. [label](command:commandId) is a markdown link. Only translate the label, do not modify the format"]
          },
          "Tunnel '{0}' is avaiable for remote access. The {1} extension can be used to connect to it.",
          usedOnHost,
          remoteExtension.friendlyName
        ),
        actions: {
          primary: [
            toAction({
              id: "showExtension",
              label: localize("action.showExtension", "Show Extension"),
              run: () => {
                return this.commandService.executeCommand("workbench.extensions.action.showExtensionsWithIds", [remoteExtension.extensionId]);
              }
            }),
            toAction({
              id: "doNotShowAgain",
              label: localize("action.doNotShowAgain", "Do not show again"),
              run: () => {
                this.storageService.store(REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
              }
            })
          ]
        }
      });
      return true;
    };
    if (await shouldRecommend()) {
      const disposables = this._register(new DisposableStore());
      disposables.add(this.storageService.onDidChangeValue(StorageScope.APPLICATION, REMOTE_TUNNEL_USED_STORAGE_KEY, disposables)(async () => {
        const success = await recommed();
        if (success) {
          disposables.dispose();
        }
      }));
    }
  }
  async initialize() {
    const [mode, status] = await Promise.all([
      this.remoteTunnelService.getMode(),
      this.remoteTunnelService.getTunnelStatus()
    ]);
    this.handleTunnelStatusUpdate(status);
    if (mode.active && mode.session.token) {
      return;
    }
    const doInitialStateDiscovery = async (progress) => {
      const listener = progress && this.remoteTunnelService.onDidChangeTunnelStatus((status3) => {
        switch (status3.type) {
          case "connecting":
            if (status3.progress) {
              progress.report({ message: status3.progress });
            }
            break;
        }
      });
      let newSession;
      if (mode.active) {
        const token = await this.getSessionToken(mode.session);
        if (token) {
          newSession = { ...mode.session, token };
        }
      }
      const status2 = await this.remoteTunnelService.initialize(mode.active && newSession ? { ...mode, session: newSession } : INACTIVE_TUNNEL_MODE);
      listener?.dispose();
      if (status2.type === "connected") {
        this.connectionInfo = status2.info;
        this.connectionStateContext.set("connected");
        return;
      }
    };
    const hasUsed = this.storageService.getBoolean(REMOTE_TUNNEL_HAS_USED_BEFORE, StorageScope.APPLICATION, false);
    if (hasUsed) {
      await this.progressService.withProgress(
        {
          location: ProgressLocation.Window,
          title: localize({ key: "initialize.progress.title", comment: ["Only translate 'Looking for remote tunnel', do not change the format of the rest (markdown link format)"] }, "[Looking for remote tunnel](command:{0})", "workbench.remoteTunnel.actions.showLog" /* showLog */)
        },
        doInitialStateDiscovery
      );
    } else {
      doInitialStateDiscovery(void 0);
    }
  }
  getPreferredTokenFromSession(session) {
    return session.session.accessToken || session.session.idToken;
  }
  async startTunnel(asService) {
    if (this.connectionInfo) {
      return this.connectionInfo;
    }
    this.storageService.store(REMOTE_TUNNEL_HAS_USED_BEFORE, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
    let tokenProblems = false;
    for (let i = 0; i < INVALID_TOKEN_RETRIES; i++) {
      tokenProblems = false;
      const authenticationSession = await this.getAuthenticationSession();
      if (authenticationSession === void 0) {
        this.logger.info("No authentication session available, not starting tunnel");
        return void 0;
      }
      const result = await this.progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          title: localize({ key: "startTunnel.progress.title", comment: ["Only translate 'Starting remote tunnel', do not change the format of the rest (markdown link format)"] }, "[Starting remote tunnel](command:{0})", "workbench.remoteTunnel.actions.showLog" /* showLog */)
        },
        (progress) => {
          return new Promise((s, e) => {
            let completed = false;
            const listener = this.remoteTunnelService.onDidChangeTunnelStatus((status) => {
              switch (status.type) {
                case "connecting":
                  if (status.progress) {
                    progress.report({ message: status.progress });
                  }
                  break;
                case "connected":
                  listener.dispose();
                  completed = true;
                  s(status.info);
                  if (status.serviceInstallFailed) {
                    this.notificationService.notify({
                      severity: Severity.Warning,
                      message: localize(
                        {
                          key: "remoteTunnel.serviceInstallFailed",
                          comment: ['{Locked="](command:{0})"}']
                        },
                        "Installation as a service failed, and we fell back to running the tunnel for this session. See the [error log](command:{0}) for details.",
                        "workbench.remoteTunnel.actions.showLog" /* showLog */
                      )
                    });
                  }
                  break;
                case "disconnected":
                  listener.dispose();
                  completed = true;
                  tokenProblems = !!status.onTokenFailed;
                  s(void 0);
                  break;
              }
            });
            const token = this.getPreferredTokenFromSession(authenticationSession);
            const account = { sessionId: authenticationSession.session.id, token, providerId: authenticationSession.providerId, accountLabel: authenticationSession.session.account.label };
            this.remoteTunnelService.startTunnel({ active: true, asService, session: account }).then((status) => {
              if (!completed && (status.type === "connected" || status.type === "disconnected")) {
                listener.dispose();
                if (status.type === "connected") {
                  s(status.info);
                } else {
                  tokenProblems = !!status.onTokenFailed;
                  s(void 0);
                }
              }
            });
          });
        }
      );
      if (result || !tokenProblems) {
        return result;
      }
    }
    return void 0;
  }
  async getAuthenticationSession() {
    const sessions = await this.getAllSessions();
    const disposables = new DisposableStore();
    const quickpick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    quickpick.ok = false;
    quickpick.placeholder = localize("accountPreference.placeholder", "Sign in to an account to enable remote access");
    quickpick.ignoreFocusOut = true;
    quickpick.items = await this.createQuickpickItems(sessions);
    return new Promise((resolve, reject) => {
      disposables.add(quickpick.onDidHide((e) => {
        resolve(void 0);
        disposables.dispose();
      }));
      disposables.add(quickpick.onDidAccept(async (e) => {
        const selection = quickpick.selectedItems[0];
        if ("provider" in selection) {
          const session = await this.authenticationService.createSession(selection.provider.id, selection.provider.scopes);
          resolve(this.createExistingSessionItem(session, selection.provider.id));
        } else if ("session" in selection) {
          resolve(selection);
        } else {
          resolve(void 0);
        }
        quickpick.hide();
      }));
      quickpick.show();
    });
  }
  createExistingSessionItem(session, providerId) {
    return {
      label: session.account.label,
      description: this.authenticationService.getProvider(providerId).label,
      session,
      providerId
    };
  }
  async createQuickpickItems(sessions) {
    const options = [];
    if (sessions.length) {
      options.push({ type: "separator", label: localize("signed in", "Signed In") });
      options.push(...sessions);
      options.push({ type: "separator", label: localize("others", "Others") });
    }
    for (const authenticationProvider of await this.getAuthenticationProviders()) {
      const signedInForProvider = sessions.some((account) => account.providerId === authenticationProvider.id);
      const provider = this.authenticationService.getProvider(authenticationProvider.id);
      if (!signedInForProvider || provider.supportsMultipleAccounts) {
        options.push({ label: localize({ key: "sign in using account", comment: ["{0} will be a auth provider (e.g. Github)"] }, "Sign in with {0}", provider.label), provider: authenticationProvider });
      }
    }
    return options;
  }
  /**
   * Returns all authentication sessions available from {@link getAuthenticationProviders}.
   */
  async getAllSessions() {
    const authenticationProviders = await this.getAuthenticationProviders();
    const accounts = /* @__PURE__ */ new Map();
    const currentAccount = await this.remoteTunnelService.getMode();
    let currentSession;
    for (const provider of authenticationProviders) {
      const sessions = await this.authenticationService.getSessions(provider.id, provider.scopes);
      for (const session of sessions) {
        if (!this.expiredSessions.has(session.id)) {
          const item = this.createExistingSessionItem(session, provider.id);
          accounts.set(item.session.account.id, item);
          if (currentAccount.active && currentAccount.session.sessionId === session.id) {
            currentSession = item;
          }
        }
      }
    }
    if (currentSession !== void 0) {
      accounts.set(currentSession.session.account.id, currentSession);
    }
    return [...accounts.values()];
  }
  async getSessionToken(session) {
    if (session) {
      const sessionItem = (await this.getAllSessions()).find((s) => s.session.id === session.sessionId);
      if (sessionItem) {
        return this.getPreferredTokenFromSession(sessionItem);
      }
    }
    return void 0;
  }
  /**
   * Returns all authentication providers which can be used to authenticate
   * to the remote storage service, based on product.json configuration
   * and registered authentication providers.
   */
  async getAuthenticationProviders() {
    const authenticationProviders = this.serverConfiguration.authenticationProviders;
    const configuredAuthenticationProviders = Object.keys(authenticationProviders).reduce((result, id) => {
      result.push({ id, scopes: authenticationProviders[id].scopes });
      return result;
    }, []);
    const availableAuthenticationProviders = this.authenticationService.declaredProviders;
    return configuredAuthenticationProviders.filter(({ id }) => availableAuthenticationProviders.some((provider) => provider.id === id));
  }
  registerCommands() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.turnOn" /* turnOn */,
          title: RemoteTunnelCommandLabels.turnOn,
          category: REMOTE_TUNNEL_CATEGORY,
          precondition: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "disconnected"),
          menu: [
            {
              id: MenuId.CommandPalette
            },
            {
              id: MenuId.AccountsContext,
              group: "2_remoteTunnel",
              when: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "disconnected")
            }
          ]
        });
      }
      async run(accessor) {
        const notificationService = accessor.get(INotificationService);
        const clipboardService = accessor.get(IClipboardService);
        const commandService = accessor.get(ICommandService);
        const storageService = accessor.get(IStorageService);
        const dialogService = accessor.get(IDialogService);
        const quickInputService = accessor.get(IQuickInputService);
        const productService = accessor.get(IProductService);
        const didNotifyPreview = storageService.getBoolean(REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY, StorageScope.APPLICATION, false);
        if (!didNotifyPreview) {
          const { confirmed } = await dialogService.confirm({
            message: localize("tunnel.preview", 'Remote Tunnels is currently in preview. Please report any problems using the "Help: Report Issue" command.'),
            primaryButton: localize({ key: "enable", comment: ["&& denotes a mnemonic"] }, "&&Enable")
          });
          if (!confirmed) {
            return;
          }
          storageService.store(REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
        }
        const disposables = new DisposableStore();
        const quickPick = quickInputService.createQuickPick();
        quickPick.placeholder = localize("tunnel.enable.placeholder", "Select how you want to enable access");
        quickPick.items = [
          { service: false, label: localize("tunnel.enable.session", "Turn on for this session"), description: localize("tunnel.enable.session.description", "Run whenever {0} is open", productService.nameShort) },
          { service: true, label: localize("tunnel.enable.service", "Install as a service"), description: localize("tunnel.enable.service.description", "Run whenever you're logged in") }
        ];
        const asService = await new Promise((resolve) => {
          disposables.add(quickPick.onDidAccept(() => resolve(quickPick.selectedItems[0]?.service)));
          disposables.add(quickPick.onDidHide(() => resolve(void 0)));
          quickPick.show();
        });
        quickPick.dispose();
        if (asService === void 0) {
          return;
        }
        const connectionInfo = await that.startTunnel(
          /* installAsService= */
          asService
        );
        if (connectionInfo) {
          const linkToOpen = that.getLinkToOpen(connectionInfo);
          const remoteExtension = that.serverConfiguration.extension;
          const linkToOpenForMarkdown = linkToOpen.toString(false).replace(/\)/g, "%29");
          notificationService.notify({
            severity: Severity.Info,
            message: localize(
              {
                key: "progress.turnOn.final",
                comment: ["{0} will be the tunnel name, {1} will the link address to the web UI, {6} an extension name, {7} a link to the extension documentation. [label](command:commandId) is a markdown link. Only translate the label, do not modify the format"]
              },
              "You can now access this machine anywhere via the secure tunnel [{0}](command:{4}). To connect via a different machine, use the generated [{1}]({2}) link or use the [{6}]({7}) extension in the desktop or web. You can [configure](command:{3}) or [turn off](command:{5}) this access via the VS Code Accounts menu.",
              connectionInfo.tunnelName,
              connectionInfo.domain,
              linkToOpenForMarkdown,
              "workbench.remoteTunnel.actions.manage" /* manage */,
              "workbench.remoteTunnel.actions.configure" /* configure */,
              "workbench.remoteTunnel.actions.turnOff" /* turnOff */,
              remoteExtension.friendlyName,
              "https://code.visualstudio.com/docs/remote/tunnels"
            ),
            actions: {
              primary: [
                toAction({ id: "copyToClipboard", label: localize("action.copyToClipboard", "Copy Browser Link to Clipboard"), run: () => clipboardService.writeText(linkToOpen.toString(true)) }),
                toAction({
                  id: "showExtension",
                  label: localize("action.showExtension", "Show Extension"),
                  run: () => {
                    return commandService.executeCommand("workbench.extensions.action.showExtensionsWithIds", [remoteExtension.extensionId]);
                  }
                })
              ]
            }
          });
          const usedOnHostMessage = { hostName: connectionInfo.tunnelName, timeStamp: (/* @__PURE__ */ new Date()).getTime() };
          storageService.store(REMOTE_TUNNEL_USED_STORAGE_KEY, JSON.stringify(usedOnHostMessage), StorageScope.APPLICATION, StorageTarget.USER);
        } else {
          notificationService.notify({
            severity: Severity.Info,
            message: localize(
              "progress.turnOn.failed",
              "Unable to turn on the remote tunnel access. Check the Remote Tunnel Service log for details."
            )
          });
          await commandService.executeCommand("workbench.remoteTunnel.actions.showLog" /* showLog */);
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.manage" /* manage */,
          title: localize("remoteTunnel.actions.manage.on.v2", "Remote Tunnel Access is On"),
          category: REMOTE_TUNNEL_CATEGORY,
          menu: [{
            id: MenuId.AccountsContext,
            group: "2_remoteTunnel",
            when: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "connected")
          }]
        });
      }
      async run() {
        that.showManageOptions();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.connecting" /* connecting */,
          title: localize("remoteTunnel.actions.manage.connecting", "Remote Tunnel Access is Connecting"),
          category: REMOTE_TUNNEL_CATEGORY,
          menu: [{
            id: MenuId.AccountsContext,
            group: "2_remoteTunnel",
            when: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "connecting")
          }]
        });
      }
      async run() {
        that.showManageOptions();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.turnOff" /* turnOff */,
          title: RemoteTunnelCommandLabels.turnOff,
          category: REMOTE_TUNNEL_CATEGORY,
          precondition: ContextKeyExpr.notEquals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "disconnected"),
          menu: [{
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.notEquals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "")
          }]
        });
      }
      async run() {
        const message = that.connectionInfo?.isAttached ? localize("remoteTunnel.turnOffAttached.confirm", "Do you want to turn off Remote Tunnel Access? This will also stop the service that was started externally.") : localize("remoteTunnel.turnOff.confirm", "Do you want to turn off Remote Tunnel Access?");
        const { confirmed } = await that.dialogService.confirm({ message });
        if (confirmed) {
          that.remoteTunnelService.stopTunnel();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.showLog" /* showLog */,
          title: RemoteTunnelCommandLabels.showLog,
          category: REMOTE_TUNNEL_CATEGORY,
          menu: [{
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.notEquals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "")
          }]
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        outputService.showChannel(LOG_ID);
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.configure" /* configure */,
          title: RemoteTunnelCommandLabels.configure,
          category: REMOTE_TUNNEL_CATEGORY,
          menu: [{
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.notEquals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "")
          }]
        });
      }
      async run(accessor) {
        const preferencesService = accessor.get(IPreferencesService);
        preferencesService.openSettings({ query: CONFIGURATION_KEY_PREFIX });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.copyToClipboard" /* copyToClipboard */,
          title: RemoteTunnelCommandLabels.copyToClipboard,
          category: REMOTE_TUNNEL_CATEGORY,
          precondition: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "connected"),
          menu: [{
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "connected")
          }]
        });
      }
      async run(accessor) {
        const clipboardService = accessor.get(IClipboardService);
        if (that.connectionInfo) {
          const linkToOpen = that.getLinkToOpen(that.connectionInfo);
          clipboardService.writeText(linkToOpen.toString(true));
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.learnMore" /* learnMore */,
          title: RemoteTunnelCommandLabels.learnMore,
          category: REMOTE_TUNNEL_CATEGORY,
          menu: []
        });
      }
      async run(accessor) {
        const openerService = accessor.get(IOpenerService);
        await openerService.open("https://aka.ms/vscode-server-doc");
      }
    }));
  }
  getLinkToOpen(connectionInfo) {
    const workspace = this.workspaceContextService.getWorkspace();
    const folders = workspace.folders;
    let resource;
    if (folders.length === 1) {
      resource = folders[0].uri;
    } else if (workspace.configuration && !isUntitledWorkspace(workspace.configuration, this.environmentService)) {
      resource = workspace.configuration;
    }
    const link = URI.parse(connectionInfo.link);
    if (resource?.scheme === Schemas.file) {
      return joinPath(link, resource.path);
    }
    return joinPath(link, this.environmentService.userHome.path);
  }
  async showManageOptions() {
    const account = await this.remoteTunnelService.getMode();
    return new Promise((c, e) => {
      const disposables = new DisposableStore();
      const quickPick = this.quickInputService.createQuickPick({ useSeparators: true });
      quickPick.placeholder = localize("manage.placeholder", "Select a command to invoke");
      disposables.add(quickPick);
      const items = [];
      items.push({ id: "workbench.remoteTunnel.actions.learnMore" /* learnMore */, label: RemoteTunnelCommandLabels.learnMore });
      if (this.connectionInfo) {
        quickPick.title = this.connectionInfo.isAttached ? localize({ key: "manage.title.attached", comment: ["{0} is the tunnel name"] }, "Remote Tunnel Access enabled for {0} (launched externally)", this.connectionInfo.tunnelName) : localize({ key: "manage.title.orunning", comment: ["{0} is the tunnel name"] }, "Remote Tunnel Access enabled for {0}", this.connectionInfo.tunnelName);
        items.push({ id: "workbench.remoteTunnel.actions.copyToClipboard" /* copyToClipboard */, label: RemoteTunnelCommandLabels.copyToClipboard, description: this.connectionInfo.domain });
      } else {
        quickPick.title = localize("manage.title.off", "Remote Tunnel Access not enabled");
      }
      items.push({ id: "workbench.remoteTunnel.actions.showLog" /* showLog */, label: localize("manage.showLog", "Show Log") });
      items.push({ type: "separator" });
      items.push({ id: "workbench.remoteTunnel.actions.configure" /* configure */, label: localize("manage.tunnelName", "Change Tunnel Name"), description: this.connectionInfo?.tunnelName });
      items.push({ id: "workbench.remoteTunnel.actions.turnOff" /* turnOff */, label: RemoteTunnelCommandLabels.turnOff, description: account.active ? `${account.session.accountLabel} (${account.session.providerId})` : void 0 });
      quickPick.items = items;
      disposables.add(quickPick.onDidAccept(() => {
        if (quickPick.selectedItems[0] && quickPick.selectedItems[0].id) {
          this.commandService.executeCommand(quickPick.selectedItems[0].id);
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
};
RemoteTunnelWorkbenchContribution = __decorateClass([
  __decorateParam(0, IAuthenticationService),
  __decorateParam(1, IDialogService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, ILoggerService),
  __decorateParam(7, IQuickInputService),
  __decorateParam(8, INativeEnvironmentService),
  __decorateParam(9, IRemoteTunnelService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IWorkspaceContextService),
  __decorateParam(12, IProgressService),
  __decorateParam(13, INotificationService)
], RemoteTunnelWorkbenchContribution);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RemoteTunnelWorkbenchContribution, LifecyclePhase.Restored);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  type: "object",
  properties: {
    [CONFIGURATION_KEY_HOST_NAME]: {
      description: localize("remoteTunnelAccess.machineName", "The name under which the remote tunnel access is registered. If not set, the host name is used."),
      type: "string",
      scope: ConfigurationScope.APPLICATION,
      ignoreSync: true,
      pattern: "^(\\w[\\w-]*)?$",
      patternErrorMessage: localize("remoteTunnelAccess.machineNameRegex", "The name must only consist of letters, numbers, underscore and dash. It must not start with a dash."),
      maxLength: 20,
      default: ""
    },
    [CONFIGURATION_KEY_PREVENT_SLEEP]: {
      description: localize("remoteTunnelAccess.preventSleep", "Prevent this computer from sleeping when remote tunnel access is turned on."),
      type: "boolean",
      scope: ConfigurationScope.APPLICATION,
      default: false
    }
  }
});
export {
  REMOTE_TUNNEL_CATEGORY,
  REMOTE_TUNNEL_CONNECTION_STATE,
  REMOTE_TUNNEL_CONNECTION_STATE_KEY,
  RemoteTunnelWorkbenchContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZVR1bm5lbC9lbGVjdHJvbi1icm93c2VyL3JlbW90ZVR1bm5lbC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElUdW5uZWxBcHBsaWNhdGlvbkNvbmZpZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNOdW1iZXIsIGlzT2JqZWN0LCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgQ29uZmlndXJhdGlvblNjb3BlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyLCBJTG9nZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBOb3RpZmljYXRpb25Qcmlvcml0eSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9ncmVzcywgSVByb2dyZXNzU2VydmljZSwgSVByb2dyZXNzU3RlcCwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yLCBRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBDT05GSUdVUkFUSU9OX0tFWV9IT1NUX05BTUUsIENPTkZJR1VSQVRJT05fS0VZX1BSRUZJWCwgQ09ORklHVVJBVElPTl9LRVlfUFJFVkVOVF9TTEVFUCwgQ29ubmVjdGlvbkluZm8sIElOQUNUSVZFX1RVTk5FTF9NT0RFLCBJUmVtb3RlVHVubmVsU2VydmljZSwgSVJlbW90ZVR1bm5lbFNlc3Npb24sIExPR0dFUl9OQU1FLCBMT0dfSUQsIFR1bm5lbFN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZVR1bm5lbC9jb21tb24vcmVtb3RlVHVubmVsLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIGlzVW50aXRsZWRXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvblNlc3Npb24sIElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU91dHB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcblxuZXhwb3J0IGNvbnN0IFJFTU9URV9UVU5ORUxfQ0FURUdPUlkgPSBsb2NhbGl6ZTIoJ3JlbW90ZVR1bm5lbC5jYXRlZ29yeScsICdSZW1vdGUgVHVubmVscycpO1xuXG50eXBlIENPTlRFWFRfS0VZX1NUQVRFUyA9ICdjb25uZWN0ZWQnIHwgJ2Nvbm5lY3RpbmcnIHwgJ2Rpc2Nvbm5lY3RlZCc7XG5cbmV4cG9ydCBjb25zdCBSRU1PVEVfVFVOTkVMX0NPTk5FQ1RJT05fU1RBVEVfS0VZID0gJ3JlbW90ZVR1bm5lbENvbm5lY3Rpb24nO1xuZXhwb3J0IGNvbnN0IFJFTU9URV9UVU5ORUxfQ09OTkVDVElPTl9TVEFURSA9IG5ldyBSYXdDb250ZXh0S2V5PENPTlRFWFRfS0VZX1NUQVRFUz4oUkVNT1RFX1RVTk5FTF9DT05ORUNUSU9OX1NUQVRFX0tFWSwgJ2Rpc2Nvbm5lY3RlZCcpO1xuXG5jb25zdCBSRU1PVEVfVFVOTkVMX1VTRURfU1RPUkFHRV9LRVkgPSAncmVtb3RlVHVubmVsU2VydmljZVVzZWQnO1xuY29uc3QgUkVNT1RFX1RVTk5FTF9QUk9NUFRFRF9QUkVWSUVXX1NUT1JBR0VfS0VZID0gJ3JlbW90ZVR1bm5lbFNlcnZpY2VQcm9tcHRlZFByZXZpZXcnO1xuY29uc3QgUkVNT1RFX1RVTk5FTF9FWFRFTlNJT05fUkVDT01NRU5ERURfS0VZID0gJ3JlbW90ZVR1bm5lbEV4dGVuc2lvblJlY29tbWVuZGVkJztcbmNvbnN0IFJFTU9URV9UVU5ORUxfSEFTX1VTRURfQkVGT1JFID0gJ3JlbW90ZVR1bm5lbEhhc1VzZWQnO1xuY29uc3QgUkVNT1RFX1RVTk5FTF9FWFRFTlNJT05fVElNRU9VVCA9IDQgKiA2MCAqIDEwMDA7IC8vIHNob3cgdGhlIHJlY29tbWVuZGF0aW9uIHRoYXQgYSBtYWNoaW5lIHN0YXJ0ZWQgdXNpbmcgdHVubmVscyBpZiBpdCBqb2luZWQgbGVzcyB0aGFuIDQgbWludXRlcyBhZ29cblxuY29uc3QgSU5WQUxJRF9UT0tFTl9SRVRSSUVTID0gMjtcblxuaW50ZXJmYWNlIFVzZWRPbkhvc3RNZXNzYWdlIHsgaG9zdE5hbWU6IHN0cmluZzsgdGltZVN0YW1wOiBudW1iZXIgfVxuXG50eXBlIEV4aXN0aW5nU2Vzc2lvbkl0ZW0gPSB7IHNlc3Npb246IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbjsgcHJvdmlkZXJJZDogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBkZXNjcmlwdGlvbjogc3RyaW5nIH07XG50eXBlIElBdXRoZW50aWNhdGlvblByb3ZpZGVyID0geyBpZDogc3RyaW5nOyBzY29wZXM6IHN0cmluZ1tdIH07XG50eXBlIEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJPcHRpb24gPSBJUXVpY2tQaWNrSXRlbSAmIHsgcHJvdmlkZXI6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyIH07XG5cbmVudW0gUmVtb3RlVHVubmVsQ29tbWFuZElkcyB7XG5cdHR1cm5PbiA9ICd3b3JrYmVuY2gucmVtb3RlVHVubmVsLmFjdGlvbnMudHVybk9uJyxcblx0dHVybk9mZiA9ICd3b3JrYmVuY2gucmVtb3RlVHVubmVsLmFjdGlvbnMudHVybk9mZicsXG5cdGNvbm5lY3RpbmcgPSAnd29ya2JlbmNoLnJlbW90ZVR1bm5lbC5hY3Rpb25zLmNvbm5lY3RpbmcnLFxuXHRtYW5hZ2UgPSAnd29ya2JlbmNoLnJlbW90ZVR1bm5lbC5hY3Rpb25zLm1hbmFnZScsXG5cdHNob3dMb2cgPSAnd29ya2JlbmNoLnJlbW90ZVR1bm5lbC5hY3Rpb25zLnNob3dMb2cnLFxuXHRjb25maWd1cmUgPSAnd29ya2JlbmNoLnJlbW90ZVR1bm5lbC5hY3Rpb25zLmNvbmZpZ3VyZScsXG5cdGNvcHlUb0NsaXBib2FyZCA9ICd3b3JrYmVuY2gucmVtb3RlVHVubmVsLmFjdGlvbnMuY29weVRvQ2xpcGJvYXJkJyxcblx0bGVhcm5Nb3JlID0gJ3dvcmtiZW5jaC5yZW1vdGVUdW5uZWwuYWN0aW9ucy5sZWFybk1vcmUnLFxufVxuXG4vLyBuYW1lIHNob3duIGluIG5vZmljYXRpb25zXG5uYW1lc3BhY2UgUmVtb3RlVHVubmVsQ29tbWFuZExhYmVscyB7XG5cdGV4cG9ydCBjb25zdCB0dXJuT24gPSBsb2NhbGl6ZSgncmVtb3RlVHVubmVsLmFjdGlvbnMudHVybk9uJywgJ1R1cm4gb24gUmVtb3RlIFR1bm5lbCBBY2Nlc3MuLi4nKTtcblx0ZXhwb3J0IGNvbnN0IHR1cm5PZmYgPSBsb2NhbGl6ZSgncmVtb3RlVHVubmVsLmFjdGlvbnMudHVybk9mZicsICdUdXJuIG9mZiBSZW1vdGUgVHVubmVsIEFjY2Vzcy4uLicpO1xuXHRleHBvcnQgY29uc3Qgc2hvd0xvZyA9IGxvY2FsaXplKCdyZW1vdGVUdW5uZWwuYWN0aW9ucy5zaG93TG9nJywgJ1Nob3cgUmVtb3RlIFR1bm5lbCBTZXJ2aWNlIExvZycpO1xuXHRleHBvcnQgY29uc3QgY29uZmlndXJlID0gbG9jYWxpemUoJ3JlbW90ZVR1bm5lbC5hY3Rpb25zLmNvbmZpZ3VyZScsICdDb25maWd1cmUgVHVubmVsIE5hbWUuLi4nKTtcblx0ZXhwb3J0IGNvbnN0IGNvcHlUb0NsaXBib2FyZCA9IGxvY2FsaXplKCdyZW1vdGVUdW5uZWwuYWN0aW9ucy5jb3B5VG9DbGlwYm9hcmQnLCAnQ29weSBCcm93c2VyIFVSSSB0byBDbGlwYm9hcmQnKTtcblx0ZXhwb3J0IGNvbnN0IGxlYXJuTW9yZSA9IGxvY2FsaXplKCdyZW1vdGVUdW5uZWwuYWN0aW9ucy5sZWFybk1vcmUnLCAnR2V0IFN0YXJ0ZWQgd2l0aCBUdW5uZWxzJyk7XG59XG5cblxuZXhwb3J0IGNsYXNzIFJlbW90ZVR1bm5lbFdvcmtiZW5jaENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbm5lY3Rpb25TdGF0ZUNvbnRleHQ6IElDb250ZXh0S2V5PENPTlRFWFRfS0VZX1NUQVRFUz47XG5cblx0cHJpdmF0ZSByZWFkb25seSBzZXJ2ZXJDb25maWd1cmF0aW9uOiBJVHVubmVsQXBwbGljYXRpb25Db25maWc7XG5cblx0cHJpdmF0ZSBjb25uZWN0aW9uSW5mbzogQ29ubmVjdGlvbkluZm8gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2dnZXI6IElMb2dnZXI7XG5cblx0cHJpdmF0ZSBleHBpcmVkU2Vzc2lvbnM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxvZ2dlclNlcnZpY2UgbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSBlbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElSZW1vdGVUdW5uZWxTZXJ2aWNlIHByaXZhdGUgcmVtb3RlVHVubmVsU2VydmljZTogSVJlbW90ZVR1bm5lbFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMubG9nZ2VyID0gdGhpcy5fcmVnaXN0ZXIobG9nZ2VyU2VydmljZS5jcmVhdGVMb2dnZXIoam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLmxvZ3NIb21lLCBgJHtMT0dfSUR9LmxvZ2ApLCB7IGlkOiBMT0dfSUQsIG5hbWU6IExPR0dFUl9OQU1FIH0pKTtcblxuXHRcdHRoaXMuY29ubmVjdGlvblN0YXRlQ29udGV4dCA9IFJFTU9URV9UVU5ORUxfQ09OTkVDVElPTl9TVEFURS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBzZXJ2ZXJDb25maWd1cmF0aW9uID0gcHJvZHVjdFNlcnZpY2UudHVubmVsQXBwbGljYXRpb25Db25maWc7XG5cdFx0aWYgKCFzZXJ2ZXJDb25maWd1cmF0aW9uIHx8ICFwcm9kdWN0U2VydmljZS50dW5uZWxBcHBsaWNhdGlvbk5hbWUpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmVycm9yKCdNaXNzaW5nIFxcJ3R1bm5lbEFwcGxpY2F0aW9uQ29uZmlnXFwnIG9yIFxcJ3R1bm5lbEFwcGxpY2F0aW9uTmFtZVxcJyBpbiBwcm9kdWN0Lmpzb24uIFJlbW90ZSB0dW5uZWxpbmcgaXMgbm90IGF2YWlsYWJsZS4nKTtcblx0XHRcdHRoaXMuc2VydmVyQ29uZmlndXJhdGlvbiA9IHsgYXV0aGVudGljYXRpb25Qcm92aWRlcnM6IHt9LCBlZGl0b3JXZWJVcmw6ICcnLCBleHRlbnNpb246IHsgZXh0ZW5zaW9uSWQ6ICcnLCBmcmllbmRseU5hbWU6ICcnIH0gfTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zZXJ2ZXJDb25maWd1cmF0aW9uID0gc2VydmVyQ29uZmlndXJhdGlvbjtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVtb3RlVHVubmVsU2VydmljZS5vbkRpZENoYW5nZVR1bm5lbFN0YXR1cyhzID0+IHRoaXMuaGFuZGxlVHVubmVsU3RhdHVzVXBkYXRlKHMpKSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyQ29tbWFuZHMoKTtcblxuXHRcdHRoaXMuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0dGhpcy5yZWNvbW1lbmRSZW1vdGVFeHRlbnNpb25JZk5lZWRlZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVUdW5uZWxTdGF0dXNVcGRhdGUoc3RhdHVzOiBUdW5uZWxTdGF0dXMpIHtcblx0XHR0aGlzLmNvbm5lY3Rpb25JbmZvID0gdW5kZWZpbmVkO1xuXHRcdGlmIChzdGF0dXMudHlwZSA9PT0gJ2Rpc2Nvbm5lY3RlZCcpIHtcblx0XHRcdGlmIChzdGF0dXMub25Ub2tlbkZhaWxlZCkge1xuXHRcdFx0XHR0aGlzLmV4cGlyZWRTZXNzaW9ucy5hZGQoc3RhdHVzLm9uVG9rZW5GYWlsZWQuc2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuY29ubmVjdGlvblN0YXRlQ29udGV4dC5zZXQoJ2Rpc2Nvbm5lY3RlZCcpO1xuXHRcdH0gZWxzZSBpZiAoc3RhdHVzLnR5cGUgPT09ICdjb25uZWN0aW5nJykge1xuXHRcdFx0dGhpcy5jb25uZWN0aW9uU3RhdGVDb250ZXh0LnNldCgnY29ubmVjdGluZycpO1xuXHRcdH0gZWxzZSBpZiAoc3RhdHVzLnR5cGUgPT09ICdjb25uZWN0ZWQnKSB7XG5cdFx0XHR0aGlzLmNvbm5lY3Rpb25JbmZvID0gc3RhdHVzLmluZm87XG5cdFx0XHR0aGlzLmNvbm5lY3Rpb25TdGF0ZUNvbnRleHQuc2V0KCdjb25uZWN0ZWQnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlY29tbWVuZFJlbW90ZUV4dGVuc2lvbklmTmVlZGVkKCkge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblxuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbiA9IHRoaXMuc2VydmVyQ29uZmlndXJhdGlvbi5leHRlbnNpb247XG5cdFx0Y29uc3Qgc2hvdWxkUmVjb21tZW5kID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihSRU1PVEVfVFVOTkVMX0VYVEVOU0lPTl9SRUNPTU1FTkRFRF9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb24ocmVtb3RlRXh0ZW5zaW9uLmV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1c2VkT25Ib3N0TWVzc2FnZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFJFTU9URV9UVU5ORUxfVVNFRF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdGlmICghdXNlZE9uSG9zdE1lc3NhZ2UpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHVzZWRUdW5uZWxOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gSlNPTi5wYXJzZSh1c2VkT25Ib3N0TWVzc2FnZSk7XG5cdFx0XHRcdGlmICghaXNPYmplY3QobWVzc2FnZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgeyBob3N0TmFtZSwgdGltZVN0YW1wIH0gPSBtZXNzYWdlIGFzIFVzZWRPbkhvc3RNZXNzYWdlO1xuXHRcdFx0XHRpZiAoIWlzU3RyaW5nKGhvc3ROYW1lKSEgfHwgIWlzTnVtYmVyKHRpbWVTdGFtcCkgfHwgbmV3IERhdGUoKS5nZXRUaW1lKCkgPiB0aW1lU3RhbXAgKyBSRU1PVEVfVFVOTkVMX0VYVEVOU0lPTl9USU1FT1VUKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHVzZWRUdW5uZWxOYW1lID0gaG9zdE5hbWU7XG5cdFx0XHR9IGNhdGNoIChfKSB7XG5cdFx0XHRcdC8vIHByb2JsZW1zIHBhcnNpbmcgdGhlIG1lc3NhZ2UsIGxpa2x5IHRoZSBvbGQgbWVzc2FnZSBmb3JtYXRcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY3VycmVudFR1bm5lbE5hbWUgPSBhd2FpdCB0aGlzLnJlbW90ZVR1bm5lbFNlcnZpY2UuZ2V0VHVubmVsTmFtZSgpO1xuXHRcdFx0aWYgKCFjdXJyZW50VHVubmVsTmFtZSB8fCBjdXJyZW50VHVubmVsTmFtZSA9PT0gdXNlZFR1bm5lbE5hbWUpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVzZWRUdW5uZWxOYW1lO1xuXHRcdH07XG5cdFx0Y29uc3QgcmVjb21tZWQgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1c2VkT25Ib3N0ID0gYXdhaXQgc2hvdWxkUmVjb21tZW5kKCk7XG5cdFx0XHRpZiAoIXVzZWRPbkhvc3QpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuT1BUSU9OQUwsXG5cdFx0XHRcdG1lc3NhZ2U6XG5cdFx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGtleTogJ3JlY29tbWVuZC5yZW1vdGVFeHRlbnNpb24nLFxuXHRcdFx0XHRcdFx0XHRjb21tZW50OiBbJ3swfSB3aWxsIGJlIGEgdHVubmVsIG5hbWUsIHsxfSB3aWxsIHRoZSBsaW5rIGFkZHJlc3MgdG8gdGhlIHdlYiBVSSwgezZ9IGFuIGV4dGVuc2lvbiBuYW1lLiBbbGFiZWxdKGNvbW1hbmQ6Y29tbWFuZElkKSBpcyBhIG1hcmtkb3duIGxpbmsuIE9ubHkgdHJhbnNsYXRlIHRoZSBsYWJlbCwgZG8gbm90IG1vZGlmeSB0aGUgZm9ybWF0J11cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcIlR1bm5lbCAnezB9JyBpcyBhdmFpYWJsZSBmb3IgcmVtb3RlIGFjY2Vzcy4gVGhlIHsxfSBleHRlbnNpb24gY2FuIGJlIHVzZWQgdG8gY29ubmVjdCB0byBpdC5cIixcblx0XHRcdFx0XHRcdHVzZWRPbkhvc3QsIHJlbW90ZUV4dGVuc2lvbi5mcmllbmRseU5hbWVcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogW1xuXHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRpZDogJ3Nob3dFeHRlbnNpb24nLCBsYWJlbDogbG9jYWxpemUoJ2FjdGlvbi5zaG93RXh0ZW5zaW9uJywgXCJTaG93IEV4dGVuc2lvblwiKSwgcnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zaG93RXh0ZW5zaW9uc1dpdGhJZHMnLCBbcmVtb3RlRXh0ZW5zaW9uLmV4dGVuc2lvbklkXSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRpZDogJ2RvTm90U2hvd0FnYWluJywgbGFiZWw6IGxvY2FsaXplKCdhY3Rpb24uZG9Ob3RTaG93QWdhaW4nLCBcIkRvIG5vdCBzaG93IGFnYWluXCIpLCBydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFJFTU9URV9UVU5ORUxfRVhURU5TSU9OX1JFQ09NTUVOREVEX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fTtcblx0XHRpZiAoYXdhaXQgc2hvdWxkUmVjb21tZW5kKCkpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBSRU1PVEVfVFVOTkVMX1VTRURfU1RPUkFHRV9LRVksIGRpc3Bvc2FibGVzKShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCByZWNvbW1lZCgpO1xuXHRcdFx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBbbW9kZSwgc3RhdHVzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMucmVtb3RlVHVubmVsU2VydmljZS5nZXRNb2RlKCksXG5cdFx0XHR0aGlzLnJlbW90ZVR1bm5lbFNlcnZpY2UuZ2V0VHVubmVsU3RhdHVzKCksXG5cdFx0XSk7XG5cblx0XHR0aGlzLmhhbmRsZVR1bm5lbFN0YXR1c1VwZGF0ZShzdGF0dXMpO1xuXG5cdFx0aWYgKG1vZGUuYWN0aXZlICYmIG1vZGUuc2Vzc2lvbi50b2tlbikge1xuXHRcdFx0cmV0dXJuOyAvLyBhbHJlYWR5IGluaXRpYWxpemVkLCB0b2tlbiBhdmFpbGFibGVcblx0XHR9XG5cblx0XHRjb25zdCBkb0luaXRpYWxTdGF0ZURpc2NvdmVyeSA9IGFzeW5jIChwcm9ncmVzcz86IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPikgPT4ge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBwcm9ncmVzcyAmJiB0aGlzLnJlbW90ZVR1bm5lbFNlcnZpY2Uub25EaWRDaGFuZ2VUdW5uZWxTdGF0dXMoc3RhdHVzID0+IHtcblx0XHRcdFx0c3dpdGNoIChzdGF0dXMudHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgJ2Nvbm5lY3RpbmcnOlxuXHRcdFx0XHRcdFx0aWYgKHN0YXR1cy5wcm9ncmVzcykge1xuXHRcdFx0XHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBzdGF0dXMucHJvZ3Jlc3MgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRsZXQgbmV3U2Vzc2lvbjogSVJlbW90ZVR1bm5lbFNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAobW9kZS5hY3RpdmUpIHtcblx0XHRcdFx0Y29uc3QgdG9rZW4gPSBhd2FpdCB0aGlzLmdldFNlc3Npb25Ub2tlbihtb2RlLnNlc3Npb24pO1xuXHRcdFx0XHRpZiAodG9rZW4pIHtcblx0XHRcdFx0XHRuZXdTZXNzaW9uID0geyAuLi5tb2RlLnNlc3Npb24sIHRva2VuIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0YXR1cyA9IGF3YWl0IHRoaXMucmVtb3RlVHVubmVsU2VydmljZS5pbml0aWFsaXplKG1vZGUuYWN0aXZlICYmIG5ld1Nlc3Npb24gPyB7IC4uLm1vZGUsIHNlc3Npb246IG5ld1Nlc3Npb24gfSA6IElOQUNUSVZFX1RVTk5FTF9NT0RFKTtcblx0XHRcdGxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cblx0XHRcdGlmIChzdGF0dXMudHlwZSA9PT0gJ2Nvbm5lY3RlZCcpIHtcblx0XHRcdFx0dGhpcy5jb25uZWN0aW9uSW5mbyA9IHN0YXR1cy5pbmZvO1xuXHRcdFx0XHR0aGlzLmNvbm5lY3Rpb25TdGF0ZUNvbnRleHQuc2V0KCdjb25uZWN0ZWQnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH07XG5cblxuXHRcdGNvbnN0IGhhc1VzZWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oUkVNT1RFX1RVTk5FTF9IQVNfVVNFRF9CRUZPUkUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXG5cdFx0aWYgKGhhc1VzZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdpbml0aWFsaXplLnByb2dyZXNzLnRpdGxlJywgY29tbWVudDogWydPbmx5IHRyYW5zbGF0ZSBcXCdMb29raW5nIGZvciByZW1vdGUgdHVubmVsXFwnLCBkbyBub3QgY2hhbmdlIHRoZSBmb3JtYXQgb2YgdGhlIHJlc3QgKG1hcmtkb3duIGxpbmsgZm9ybWF0KSddIH0sIFwiW0xvb2tpbmcgZm9yIHJlbW90ZSB0dW5uZWxdKGNvbW1hbmQ6ezB9KVwiLCBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLnNob3dMb2cpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkb0luaXRpYWxTdGF0ZURpc2NvdmVyeVxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZG9Jbml0aWFsU3RhdGVEaXNjb3ZlcnkodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFByZWZlcnJlZFRva2VuRnJvbVNlc3Npb24oc2Vzc2lvbjogRXhpc3RpbmdTZXNzaW9uSXRlbSkge1xuXHRcdHJldHVybiBzZXNzaW9uLnNlc3Npb24uYWNjZXNzVG9rZW4gfHwgc2Vzc2lvbi5zZXNzaW9uLmlkVG9rZW47XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN0YXJ0VHVubmVsKGFzU2VydmljZTogYm9vbGVhbik6IFByb21pc2U8Q29ubmVjdGlvbkluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jb25uZWN0aW9uSW5mbykge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29ubmVjdGlvbkluZm87XG5cdFx0fVxuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShSRU1PVEVfVFVOTkVMX0hBU19VU0VEX0JFRk9SRSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0bGV0IHRva2VuUHJvYmxlbXMgPSBmYWxzZTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IElOVkFMSURfVE9LRU5fUkVUUklFUzsgaSsrKSB7XG5cdFx0XHR0b2tlblByb2JsZW1zID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbiA9IGF3YWl0IHRoaXMuZ2V0QXV0aGVudGljYXRpb25TZXNzaW9uKCk7XG5cdFx0XHRpZiAoYXV0aGVudGljYXRpb25TZXNzaW9uID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbygnTm8gYXV0aGVudGljYXRpb24gc2Vzc2lvbiBhdmFpbGFibGUsIG5vdCBzdGFydGluZyB0dW5uZWwnKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ3N0YXJ0VHVubmVsLnByb2dyZXNzLnRpdGxlJywgY29tbWVudDogWydPbmx5IHRyYW5zbGF0ZSBcXCdTdGFydGluZyByZW1vdGUgdHVubmVsXFwnLCBkbyBub3QgY2hhbmdlIHRoZSBmb3JtYXQgb2YgdGhlIHJlc3QgKG1hcmtkb3duIGxpbmsgZm9ybWF0KSddIH0sIFwiW1N0YXJ0aW5nIHJlbW90ZSB0dW5uZWxdKGNvbW1hbmQ6ezB9KVwiLCBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLnNob3dMb2cpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQocHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPikgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxDb25uZWN0aW9uSW5mbyB8IHVuZGVmaW5lZD4oKHMsIGUpID0+IHtcblx0XHRcdFx0XHRcdGxldCBjb21wbGV0ZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gdGhpcy5yZW1vdGVUdW5uZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlVHVubmVsU3RhdHVzKHN0YXR1cyA9PiB7XG5cdFx0XHRcdFx0XHRcdHN3aXRjaCAoc3RhdHVzLnR5cGUpIHtcblx0XHRcdFx0XHRcdFx0XHRjYXNlICdjb25uZWN0aW5nJzpcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChzdGF0dXMucHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogc3RhdHVzLnByb2dyZXNzIH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0Y2FzZSAnY29ubmVjdGVkJzpcblx0XHRcdFx0XHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbXBsZXRlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0XHRzKHN0YXR1cy5pbmZvKTtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChzdGF0dXMuc2VydmljZUluc3RhbGxGYWlsZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGtleTogJ3JlbW90ZVR1bm5lbC5zZXJ2aWNlSW5zdGFsbEZhaWxlZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbW1lbnQ6IFsne0xvY2tlZD1cIl0oY29tbWFuZDp7MH0pXCJ9J11cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcIkluc3RhbGxhdGlvbiBhcyBhIHNlcnZpY2UgZmFpbGVkLCBhbmQgd2UgZmVsbCBiYWNrIHRvIHJ1bm5pbmcgdGhlIHR1bm5lbCBmb3IgdGhpcyBzZXNzaW9uLiBTZWUgdGhlIFtlcnJvciBsb2ddKGNvbW1hbmQ6ezB9KSBmb3IgZGV0YWlscy5cIixcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFJlbW90ZVR1bm5lbENvbW1hbmRJZHMuc2hvd0xvZyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdGNhc2UgJ2Rpc2Nvbm5lY3RlZCc6XG5cdFx0XHRcdFx0XHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb21wbGV0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0dG9rZW5Qcm9ibGVtcyA9ICEhc3RhdHVzLm9uVG9rZW5GYWlsZWQ7XG5cdFx0XHRcdFx0XHRcdFx0XHRzKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRjb25zdCB0b2tlbiA9IHRoaXMuZ2V0UHJlZmVycmVkVG9rZW5Gcm9tU2Vzc2lvbihhdXRoZW50aWNhdGlvblNlc3Npb24pO1xuXHRcdFx0XHRcdFx0Y29uc3QgYWNjb3VudDogSVJlbW90ZVR1bm5lbFNlc3Npb24gPSB7IHNlc3Npb25JZDogYXV0aGVudGljYXRpb25TZXNzaW9uLnNlc3Npb24uaWQsIHRva2VuLCBwcm92aWRlcklkOiBhdXRoZW50aWNhdGlvblNlc3Npb24ucHJvdmlkZXJJZCwgYWNjb3VudExhYmVsOiBhdXRoZW50aWNhdGlvblNlc3Npb24uc2Vzc2lvbi5hY2NvdW50LmxhYmVsIH07XG5cdFx0XHRcdFx0XHR0aGlzLnJlbW90ZVR1bm5lbFNlcnZpY2Uuc3RhcnRUdW5uZWwoeyBhY3RpdmU6IHRydWUsIGFzU2VydmljZSwgc2Vzc2lvbjogYWNjb3VudCB9KS50aGVuKHN0YXR1cyA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmICghY29tcGxldGVkICYmIChzdGF0dXMudHlwZSA9PT0gJ2Nvbm5lY3RlZCcgfHwgc3RhdHVzLnR5cGUgPT09ICdkaXNjb25uZWN0ZWQnKSkge1xuXHRcdFx0XHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoc3RhdHVzLnR5cGUgPT09ICdjb25uZWN0ZWQnKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzKHN0YXR1cy5pbmZvKTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0dG9rZW5Qcm9ibGVtcyA9ICEhc3RhdHVzLm9uVG9rZW5GYWlsZWQ7XG5cdFx0XHRcdFx0XHRcdFx0XHRzKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHRcdGlmIChyZXN1bHQgfHwgIXRva2VuUHJvYmxlbXMpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0QXV0aGVudGljYXRpb25TZXNzaW9uKCk6IFByb21pc2U8RXhpc3RpbmdTZXNzaW9uSXRlbSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5nZXRBbGxTZXNzaW9ucygpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHF1aWNrcGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxFeGlzdGluZ1Nlc3Npb25JdGVtIHwgQXV0aGVudGljYXRpb25Qcm92aWRlck9wdGlvbiB8IElRdWlja1BpY2tJdGVtPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRcdHF1aWNrcGljay5vayA9IGZhbHNlO1xuXHRcdHF1aWNrcGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdhY2NvdW50UHJlZmVyZW5jZS5wbGFjZWhvbGRlcicsIFwiU2lnbiBpbiB0byBhbiBhY2NvdW50IHRvIGVuYWJsZSByZW1vdGUgYWNjZXNzXCIpO1xuXHRcdHF1aWNrcGljay5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0cXVpY2twaWNrLml0ZW1zID0gYXdhaXQgdGhpcy5jcmVhdGVRdWlja3BpY2tJdGVtcyhzZXNzaW9ucyk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrcGljay5vbkRpZEhpZGUoKGUpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRBY2NlcHQoYXN5bmMgKGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gcXVpY2twaWNrLnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRcdGlmICgncHJvdmlkZXInIGluIHNlbGVjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5jcmVhdGVTZXNzaW9uKHNlbGVjdGlvbi5wcm92aWRlci5pZCwgc2VsZWN0aW9uLnByb3ZpZGVyLnNjb3Blcyk7XG5cdFx0XHRcdFx0cmVzb2x2ZSh0aGlzLmNyZWF0ZUV4aXN0aW5nU2Vzc2lvbkl0ZW0oc2Vzc2lvbiwgc2VsZWN0aW9uLnByb3ZpZGVyLmlkKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoJ3Nlc3Npb24nIGluIHNlbGVjdGlvbikge1xuXHRcdFx0XHRcdHJlc29sdmUoc2VsZWN0aW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cXVpY2twaWNrLmhpZGUoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cXVpY2twaWNrLnNob3coKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRXhpc3RpbmdTZXNzaW9uSXRlbShzZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb24sIHByb3ZpZGVySWQ6IHN0cmluZyk6IEV4aXN0aW5nU2Vzc2lvbkl0ZW0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogc2Vzc2lvbi5hY2NvdW50LmxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVyKHByb3ZpZGVySWQpLmxhYmVsLFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdHByb3ZpZGVySWRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVRdWlja3BpY2tJdGVtcyhzZXNzaW9uczogRXhpc3RpbmdTZXNzaW9uSXRlbVtdKTogUHJvbWlzZTwoRXhpc3RpbmdTZXNzaW9uSXRlbSB8IEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJPcHRpb24gfCBJUXVpY2tQaWNrU2VwYXJhdG9yIHwgSVF1aWNrUGlja0l0ZW0gJiB7IGNhbmNlbGVkQXV0aGVudGljYXRpb246IGJvb2xlYW4gfSlbXT4ge1xuXHRcdGNvbnN0IG9wdGlvbnM6IChFeGlzdGluZ1Nlc3Npb25JdGVtIHwgQXV0aGVudGljYXRpb25Qcm92aWRlck9wdGlvbiB8IElRdWlja1BpY2tTZXBhcmF0b3IgfCBJUXVpY2tQaWNrSXRlbSAmIHsgY2FuY2VsZWRBdXRoZW50aWNhdGlvbjogYm9vbGVhbiB9KVtdID0gW107XG5cblx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRvcHRpb25zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdzaWduZWQgaW4nLCBcIlNpZ25lZCBJblwiKSB9KTtcblx0XHRcdG9wdGlvbnMucHVzaCguLi5zZXNzaW9ucyk7XG5cdFx0XHRvcHRpb25zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdvdGhlcnMnLCBcIk90aGVyc1wiKSB9KTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgb2YgKGF3YWl0IHRoaXMuZ2V0QXV0aGVudGljYXRpb25Qcm92aWRlcnMoKSkpIHtcblx0XHRcdGNvbnN0IHNpZ25lZEluRm9yUHJvdmlkZXIgPSBzZXNzaW9ucy5zb21lKGFjY291bnQgPT4gYWNjb3VudC5wcm92aWRlcklkID09PSBhdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIoYXV0aGVudGljYXRpb25Qcm92aWRlci5pZCk7XG5cdFx0XHRpZiAoIXNpZ25lZEluRm9yUHJvdmlkZXIgfHwgcHJvdmlkZXIuc3VwcG9ydHNNdWx0aXBsZUFjY291bnRzKSB7XG5cdFx0XHRcdG9wdGlvbnMucHVzaCh7IGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ3NpZ24gaW4gdXNpbmcgYWNjb3VudCcsIGNvbW1lbnQ6IFsnezB9IHdpbGwgYmUgYSBhdXRoIHByb3ZpZGVyIChlLmcuIEdpdGh1YiknXSB9LCBcIlNpZ24gaW4gd2l0aCB7MH1cIiwgcHJvdmlkZXIubGFiZWwpLCBwcm92aWRlcjogYXV0aGVudGljYXRpb25Qcm92aWRlciB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gb3B0aW9ucztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGFsbCBhdXRoZW50aWNhdGlvbiBzZXNzaW9ucyBhdmFpbGFibGUgZnJvbSB7QGxpbmsgZ2V0QXV0aGVudGljYXRpb25Qcm92aWRlcnN9LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBnZXRBbGxTZXNzaW9ucygpOiBQcm9taXNlPEV4aXN0aW5nU2Vzc2lvbkl0ZW1bXT4ge1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzID0gYXdhaXQgdGhpcy5nZXRBdXRoZW50aWNhdGlvblByb3ZpZGVycygpO1xuXHRcdGNvbnN0IGFjY291bnRzID0gbmV3IE1hcDxzdHJpbmcsIEV4aXN0aW5nU2Vzc2lvbkl0ZW0+KCk7XG5cdFx0Y29uc3QgY3VycmVudEFjY291bnQgPSBhd2FpdCB0aGlzLnJlbW90ZVR1bm5lbFNlcnZpY2UuZ2V0TW9kZSgpO1xuXHRcdGxldCBjdXJyZW50U2Vzc2lvbjogRXhpc3RpbmdTZXNzaW9uSXRlbSB8IHVuZGVmaW5lZDtcblxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgYXV0aGVudGljYXRpb25Qcm92aWRlcnMpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXIuaWQsIHByb3ZpZGVyLnNjb3Blcyk7XG5cblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0XHRpZiAoIXRoaXMuZXhwaXJlZFNlc3Npb25zLmhhcyhzZXNzaW9uLmlkKSkge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLmNyZWF0ZUV4aXN0aW5nU2Vzc2lvbkl0ZW0oc2Vzc2lvbiwgcHJvdmlkZXIuaWQpO1xuXHRcdFx0XHRcdGFjY291bnRzLnNldChpdGVtLnNlc3Npb24uYWNjb3VudC5pZCwgaXRlbSk7XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRBY2NvdW50LmFjdGl2ZSAmJiBjdXJyZW50QWNjb3VudC5zZXNzaW9uLnNlc3Npb25JZCA9PT0gc2Vzc2lvbi5pZCkge1xuXHRcdFx0XHRcdFx0Y3VycmVudFNlc3Npb24gPSBpdGVtO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjdXJyZW50U2Vzc2lvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRhY2NvdW50cy5zZXQoY3VycmVudFNlc3Npb24uc2Vzc2lvbi5hY2NvdW50LmlkLCBjdXJyZW50U2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi5hY2NvdW50cy52YWx1ZXMoKV07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFNlc3Npb25Ub2tlbihzZXNzaW9uOiBJUmVtb3RlVHVubmVsU2Vzc2lvbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdGNvbnN0IHNlc3Npb25JdGVtID0gKGF3YWl0IHRoaXMuZ2V0QWxsU2Vzc2lvbnMoKSkuZmluZChzID0+IHMuc2Vzc2lvbi5pZCA9PT0gc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0aWYgKHNlc3Npb25JdGVtKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFByZWZlcnJlZFRva2VuRnJvbVNlc3Npb24oc2Vzc2lvbkl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYWxsIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVycyB3aGljaCBjYW4gYmUgdXNlZCB0byBhdXRoZW50aWNhdGVcblx0ICogdG8gdGhlIHJlbW90ZSBzdG9yYWdlIHNlcnZpY2UsIGJhc2VkIG9uIHByb2R1Y3QuanNvbiBjb25maWd1cmF0aW9uXG5cdCAqIGFuZCByZWdpc3RlcmVkIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVycy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgZ2V0QXV0aGVudGljYXRpb25Qcm92aWRlcnMoKTogUHJvbWlzZTxJQXV0aGVudGljYXRpb25Qcm92aWRlcltdPiB7XG5cdFx0Ly8gR2V0IHRoZSBsaXN0IG9mIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVycyBjb25maWd1cmVkIGluIHByb2R1Y3QuanNvblxuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzID0gdGhpcy5zZXJ2ZXJDb25maWd1cmF0aW9uLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRBdXRoZW50aWNhdGlvblByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzKS5yZWR1Y2U8SUF1dGhlbnRpY2F0aW9uUHJvdmlkZXJbXT4oKHJlc3VsdCwgaWQpID0+IHtcblx0XHRcdHJlc3VsdC5wdXNoKHsgaWQsIHNjb3BlczogYXV0aGVudGljYXRpb25Qcm92aWRlcnNbaWRdLnNjb3BlcyB9KTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSwgW10pO1xuXG5cdFx0Ly8gRmlsdGVyIG91dCBhbnl0aGluZyB0aGF0IGlzbid0IGN1cnJlbnRseSBhdmFpbGFibGUgdGhyb3VnaCB0aGUgYXV0aGVudGljYXRpb25TZXJ2aWNlXG5cdFx0Y29uc3QgYXZhaWxhYmxlQXV0aGVudGljYXRpb25Qcm92aWRlcnMgPSB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5kZWNsYXJlZFByb3ZpZGVycztcblxuXHRcdHJldHVybiBjb25maWd1cmVkQXV0aGVudGljYXRpb25Qcm92aWRlcnMuZmlsdGVyKCh7IGlkIH0pID0+IGF2YWlsYWJsZUF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4gcHJvdmlkZXIuaWQgPT09IGlkKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQ29tbWFuZHMoKSB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFJlbW90ZVR1bm5lbENvbW1hbmRJZHMudHVybk9uLFxuXHRcdFx0XHRcdHRpdGxlOiBSZW1vdGVUdW5uZWxDb21tYW5kTGFiZWxzLnR1cm5Pbixcblx0XHRcdFx0XHRjYXRlZ29yeTogUkVNT1RFX1RVTk5FTF9DQVRFR09SWSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscyhSRU1PVEVfVFVOTkVMX0NPTk5FQ1RJT05fU1RBVEVfS0VZLCAnZGlzY29ubmVjdGVkJyksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkFjY291bnRzQ29udGV4dCxcblx0XHRcdFx0XHRcdGdyb3VwOiAnMl9yZW1vdGVUdW5uZWwnLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKFJFTU9URV9UVU5ORUxfQ09OTkVDVElPTl9TVEFURV9LRVksICdkaXNjb25uZWN0ZWQnKSxcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9kdWN0U2VydmljZSk7XG5cblx0XHRcdFx0Y29uc3QgZGlkTm90aWZ5UHJldmlldyA9IHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oUkVNT1RFX1RVTk5FTF9QUk9NUFRFRF9QUkVWSUVXX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKTtcblx0XHRcdFx0aWYgKCFkaWROb3RpZnlQcmV2aWV3KSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndHVubmVsLnByZXZpZXcnLCAnUmVtb3RlIFR1bm5lbHMgaXMgY3VycmVudGx5IGluIHByZXZpZXcuIFBsZWFzZSByZXBvcnQgYW55IHByb2JsZW1zIHVzaW5nIHRoZSBcIkhlbHA6IFJlcG9ydCBJc3N1ZVwiIGNvbW1hbmQuJyksXG5cdFx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ2VuYWJsZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgJyYmRW5hYmxlJylcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFJFTU9URV9UVU5ORUxfUFJPTVBURURfUFJFVklFV19TVE9SQUdFX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGNvbnN0IHF1aWNrUGljayA9IHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSAmIHsgc2VydmljZTogYm9vbGVhbiB9PigpO1xuXHRcdFx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgndHVubmVsLmVuYWJsZS5wbGFjZWhvbGRlcicsICdTZWxlY3QgaG93IHlvdSB3YW50IHRvIGVuYWJsZSBhY2Nlc3MnKTtcblx0XHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gW1xuXHRcdFx0XHRcdHsgc2VydmljZTogZmFsc2UsIGxhYmVsOiBsb2NhbGl6ZSgndHVubmVsLmVuYWJsZS5zZXNzaW9uJywgJ1R1cm4gb24gZm9yIHRoaXMgc2Vzc2lvbicpLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3R1bm5lbC5lbmFibGUuc2Vzc2lvbi5kZXNjcmlwdGlvbicsICdSdW4gd2hlbmV2ZXIgezB9IGlzIG9wZW4nLCBwcm9kdWN0U2VydmljZS5uYW1lU2hvcnQpIH0sXG5cdFx0XHRcdFx0eyBzZXJ2aWNlOiB0cnVlLCBsYWJlbDogbG9jYWxpemUoJ3R1bm5lbC5lbmFibGUuc2VydmljZScsICdJbnN0YWxsIGFzIGEgc2VydmljZScpLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3R1bm5lbC5lbmFibGUuc2VydmljZS5kZXNjcmlwdGlvbicsICdSdW4gd2hlbmV2ZXIgeW91XFwncmUgbG9nZ2VkIGluJykgfVxuXHRcdFx0XHRdO1xuXG5cdFx0XHRcdGNvbnN0IGFzU2VydmljZSA9IGF3YWl0IG5ldyBQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4gcmVzb2x2ZShxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXT8uc2VydmljZSkpKTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiByZXNvbHZlKHVuZGVmaW5lZCkpKTtcblx0XHRcdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRxdWlja1BpY2suZGlzcG9zZSgpO1xuXG5cdFx0XHRcdGlmIChhc1NlcnZpY2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gbm8tb3Bcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb25JbmZvID0gYXdhaXQgdGhhdC5zdGFydFR1bm5lbCgvKiBpbnN0YWxsQXNTZXJ2aWNlPSAqLyBhc1NlcnZpY2UpO1xuXG5cdFx0XHRcdGlmIChjb25uZWN0aW9uSW5mbykge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmtUb09wZW4gPSB0aGF0LmdldExpbmtUb09wZW4oY29ubmVjdGlvbkluZm8pO1xuXHRcdFx0XHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbiA9IHRoYXQuc2VydmVyQ29uZmlndXJhdGlvbi5leHRlbnNpb247XG5cdFx0XHRcdFx0Y29uc3QgbGlua1RvT3BlbkZvck1hcmtkb3duID0gbGlua1RvT3Blbi50b1N0cmluZyhmYWxzZSkucmVwbGFjZSgvXFwpL2csICclMjknKTtcblx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6XG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdGtleTogJ3Byb2dyZXNzLnR1cm5Pbi5maW5hbCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRjb21tZW50OiBbJ3swfSB3aWxsIGJlIHRoZSB0dW5uZWwgbmFtZSwgezF9IHdpbGwgdGhlIGxpbmsgYWRkcmVzcyB0byB0aGUgd2ViIFVJLCB7Nn0gYW4gZXh0ZW5zaW9uIG5hbWUsIHs3fSBhIGxpbmsgdG8gdGhlIGV4dGVuc2lvbiBkb2N1bWVudGF0aW9uLiBbbGFiZWxdKGNvbW1hbmQ6Y29tbWFuZElkKSBpcyBhIG1hcmtkb3duIGxpbmsuIE9ubHkgdHJhbnNsYXRlIHRoZSBsYWJlbCwgZG8gbm90IG1vZGlmeSB0aGUgZm9ybWF0J11cblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFwiWW91IGNhbiBub3cgYWNjZXNzIHRoaXMgbWFjaGluZSBhbnl3aGVyZSB2aWEgdGhlIHNlY3VyZSB0dW5uZWwgW3swfV0oY29tbWFuZDp7NH0pLiBUbyBjb25uZWN0IHZpYSBhIGRpZmZlcmVudCBtYWNoaW5lLCB1c2UgdGhlIGdlbmVyYXRlZCBbezF9XSh7Mn0pIGxpbmsgb3IgdXNlIHRoZSBbezZ9XSh7N30pIGV4dGVuc2lvbiBpbiB0aGUgZGVza3RvcCBvciB3ZWIuIFlvdSBjYW4gW2NvbmZpZ3VyZV0oY29tbWFuZDp7M30pIG9yIFt0dXJuIG9mZl0oY29tbWFuZDp7NX0pIHRoaXMgYWNjZXNzIHZpYSB0aGUgVlMgQ29kZSBBY2NvdW50cyBtZW51LlwiLFxuXHRcdFx0XHRcdFx0XHRcdGNvbm5lY3Rpb25JbmZvLnR1bm5lbE5hbWUsIGNvbm5lY3Rpb25JbmZvLmRvbWFpbiwgbGlua1RvT3BlbkZvck1hcmtkb3duLCBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLm1hbmFnZSwgUmVtb3RlVHVubmVsQ29tbWFuZElkcy5jb25maWd1cmUsIFJlbW90ZVR1bm5lbENvbW1hbmRJZHMudHVybk9mZiwgcmVtb3RlRXh0ZW5zaW9uLmZyaWVuZGx5TmFtZSwgJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvcmVtb3RlL3R1bm5lbHMnXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRcdHByaW1hcnk6IFtcblx0XHRcdFx0XHRcdFx0XHR0b0FjdGlvbih7IGlkOiAnY29weVRvQ2xpcGJvYXJkJywgbGFiZWw6IGxvY2FsaXplKCdhY3Rpb24uY29weVRvQ2xpcGJvYXJkJywgXCJDb3B5IEJyb3dzZXIgTGluayB0byBDbGlwYm9hcmRcIiksIHJ1bjogKCkgPT4gY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQobGlua1RvT3Blbi50b1N0cmluZyh0cnVlKSkgfSksXG5cdFx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdFx0aWQ6ICdzaG93RXh0ZW5zaW9uJywgbGFiZWw6IGxvY2FsaXplKCdhY3Rpb24uc2hvd0V4dGVuc2lvbicsIFwiU2hvdyBFeHRlbnNpb25cIiksIHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zaG93RXh0ZW5zaW9uc1dpdGhJZHMnLCBbcmVtb3RlRXh0ZW5zaW9uLmV4dGVuc2lvbklkXSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGNvbnN0IHVzZWRPbkhvc3RNZXNzYWdlOiBVc2VkT25Ib3N0TWVzc2FnZSA9IHsgaG9zdE5hbWU6IGNvbm5lY3Rpb25JbmZvLnR1bm5lbE5hbWUsIHRpbWVTdGFtcDogbmV3IERhdGUoKS5nZXRUaW1lKCkgfTtcblx0XHRcdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShSRU1PVEVfVFVOTkVMX1VTRURfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KHVzZWRPbkhvc3RNZXNzYWdlKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3Byb2dyZXNzLnR1cm5Pbi5mYWlsZWQnLFxuXHRcdFx0XHRcdFx0XHRcIlVuYWJsZSB0byB0dXJuIG9uIHRoZSByZW1vdGUgdHVubmVsIGFjY2Vzcy4gQ2hlY2sgdGhlIFJlbW90ZSBUdW5uZWwgU2VydmljZSBsb2cgZm9yIGRldGFpbHMuXCIpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFJlbW90ZVR1bm5lbENvbW1hbmRJZHMuc2hvd0xvZyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogUmVtb3RlVHVubmVsQ29tbWFuZElkcy5tYW5hZ2UsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdyZW1vdGVUdW5uZWwuYWN0aW9ucy5tYW5hZ2Uub24udjInLCAnUmVtb3RlIFR1bm5lbCBBY2Nlc3MgaXMgT24nKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogUkVNT1RFX1RVTk5FTF9DQVRFR09SWSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5BY2NvdW50c0NvbnRleHQsXG5cdFx0XHRcdFx0XHRncm91cDogJzJfcmVtb3RlVHVubmVsJyxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscyhSRU1PVEVfVFVOTkVMX0NPTk5FQ1RJT05fU1RBVEVfS0VZLCAnY29ubmVjdGVkJyksXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bigpIHtcblx0XHRcdFx0dGhhdC5zaG93TWFuYWdlT3B0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogUmVtb3RlVHVubmVsQ29tbWFuZElkcy5jb25uZWN0aW5nLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVtb3RlVHVubmVsLmFjdGlvbnMubWFuYWdlLmNvbm5lY3RpbmcnLCAnUmVtb3RlIFR1bm5lbCBBY2Nlc3MgaXMgQ29ubmVjdGluZycpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBSRU1PVEVfVFVOTkVMX0NBVEVHT1JZLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkFjY291bnRzQ29udGV4dCxcblx0XHRcdFx0XHRcdGdyb3VwOiAnMl9yZW1vdGVUdW5uZWwnLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKFJFTU9URV9UVU5ORUxfQ09OTkVDVElPTl9TVEFURV9LRVksICdjb25uZWN0aW5nJyksXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bigpIHtcblx0XHRcdFx0dGhhdC5zaG93TWFuYWdlT3B0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLnR1cm5PZmYsXG5cdFx0XHRcdFx0dGl0bGU6IFJlbW90ZVR1bm5lbENvbW1hbmRMYWJlbHMudHVybk9mZixcblx0XHRcdFx0XHRjYXRlZ29yeTogUkVNT1RFX1RVTk5FTF9DQVRFR09SWSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhSRU1PVEVfVFVOTkVMX0NPTk5FQ1RJT05fU1RBVEVfS0VZLCAnZGlzY29ubmVjdGVkJyksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoUkVNT1RFX1RVTk5FTF9DT05ORUNUSU9OX1NUQVRFX0tFWSwgJycpLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oKSB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPVxuXHRcdFx0XHRcdHRoYXQuY29ubmVjdGlvbkluZm8/LmlzQXR0YWNoZWQgP1xuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3JlbW90ZVR1bm5lbC50dXJuT2ZmQXR0YWNoZWQuY29uZmlybScsICdEbyB5b3Ugd2FudCB0byB0dXJuIG9mZiBSZW1vdGUgVHVubmVsIEFjY2Vzcz8gVGhpcyB3aWxsIGFsc28gc3RvcCB0aGUgc2VydmljZSB0aGF0IHdhcyBzdGFydGVkIGV4dGVybmFsbHkuJykgOlxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3JlbW90ZVR1bm5lbC50dXJuT2ZmLmNvbmZpcm0nLCAnRG8geW91IHdhbnQgdG8gdHVybiBvZmYgUmVtb3RlIFR1bm5lbCBBY2Nlc3M/Jyk7XG5cblx0XHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoYXQuZGlhbG9nU2VydmljZS5jb25maXJtKHsgbWVzc2FnZSB9KTtcblx0XHRcdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHRoYXQucmVtb3RlVHVubmVsU2VydmljZS5zdG9wVHVubmVsKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFJlbW90ZVR1bm5lbENvbW1hbmRJZHMuc2hvd0xvZyxcblx0XHRcdFx0XHR0aXRsZTogUmVtb3RlVHVubmVsQ29tbWFuZExhYmVscy5zaG93TG9nLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBSRU1PVEVfVFVOTkVMX0NBVEVHT1JZLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIubm90RXF1YWxzKFJFTU9URV9UVU5ORUxfQ09OTkVDVElPTl9TVEFURV9LRVksICcnKSxcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGNvbnN0IG91dHB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXHRcdFx0XHRvdXRwdXRTZXJ2aWNlLnNob3dDaGFubmVsKExPR19JRCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLmNvbmZpZ3VyZSxcblx0XHRcdFx0XHR0aXRsZTogUmVtb3RlVHVubmVsQ29tbWFuZExhYmVscy5jb25maWd1cmUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFJFTU9URV9UVU5ORUxfQ0FURUdPUlksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoUkVNT1RFX1RVTk5FTF9DT05ORUNUSU9OX1NUQVRFX0tFWSwgJycpLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0Y29uc3QgcHJlZmVyZW5jZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpO1xuXHRcdFx0XHRwcmVmZXJlbmNlc1NlcnZpY2Uub3BlblNldHRpbmdzKHsgcXVlcnk6IENPTkZJR1VSQVRJT05fS0VZX1BSRUZJWCB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFJlbW90ZVR1bm5lbENvbW1hbmRJZHMuY29weVRvQ2xpcGJvYXJkLFxuXHRcdFx0XHRcdHRpdGxlOiBSZW1vdGVUdW5uZWxDb21tYW5kTGFiZWxzLmNvcHlUb0NsaXBib2FyZCxcblx0XHRcdFx0XHRjYXRlZ29yeTogUkVNT1RFX1RVTk5FTF9DQVRFR09SWSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscyhSRU1PVEVfVFVOTkVMX0NPTk5FQ1RJT05fU1RBVEVfS0VZLCAnY29ubmVjdGVkJyksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoUkVNT1RFX1RVTk5FTF9DT05ORUNUSU9OX1NUQVRFX0tFWSwgJ2Nvbm5lY3RlZCcpLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0XHRcdGlmICh0aGF0LmNvbm5lY3Rpb25JbmZvKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGlua1RvT3BlbiA9IHRoYXQuZ2V0TGlua1RvT3Blbih0aGF0LmNvbm5lY3Rpb25JbmZvKTtcblx0XHRcdFx0XHRjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChsaW5rVG9PcGVuLnRvU3RyaW5nKHRydWUpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLmxlYXJuTW9yZSxcblx0XHRcdFx0XHR0aXRsZTogUmVtb3RlVHVubmVsQ29tbWFuZExhYmVscy5sZWFybk1vcmUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFJFTU9URV9UVU5ORUxfQ0FURUdPUlksXG5cdFx0XHRcdFx0bWVudTogW11cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyU2VydmljZS5vcGVuKCdodHRwczovL2FrYS5tcy92c2NvZGUtc2VydmVyLWRvYycpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TGlua1RvT3Blbihjb25uZWN0aW9uSW5mbzogQ29ubmVjdGlvbkluZm8pOiBVUkkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0Y29uc3QgZm9sZGVycyA9IHdvcmtzcGFjZS5mb2xkZXJzO1xuXHRcdGxldCByZXNvdXJjZTtcblx0XHRpZiAoZm9sZGVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJlc291cmNlID0gZm9sZGVyc1swXS51cmk7XG5cdFx0fSBlbHNlIGlmICh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiAmJiAhaXNVbnRpdGxlZFdvcmtzcGFjZSh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UpKSB7XG5cdFx0XHRyZXNvdXJjZSA9IHdvcmtzcGFjZS5jb25maWd1cmF0aW9uO1xuXHRcdH1cblx0XHRjb25zdCBsaW5rID0gVVJJLnBhcnNlKGNvbm5lY3Rpb25JbmZvLmxpbmspO1xuXHRcdGlmIChyZXNvdXJjZT8uc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdHJldHVybiBqb2luUGF0aChsaW5rLCByZXNvdXJjZS5wYXRoKTtcblx0XHR9XG5cdFx0cmV0dXJuIGpvaW5QYXRoKGxpbmssIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJIb21lLnBhdGgpO1xuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIHNob3dNYW5hZ2VPcHRpb25zKCkge1xuXHRcdGNvbnN0IGFjY291bnQgPSBhd2FpdCB0aGlzLnJlbW90ZVR1bm5lbFNlcnZpY2UuZ2V0TW9kZSgpO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChjLCBlKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IHF1aWNrUGljayA9IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdtYW5hZ2UucGxhY2Vob2xkZXInLCAnU2VsZWN0IGEgY29tbWFuZCB0byBpbnZva2UnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2spO1xuXHRcdFx0Y29uc3QgaXRlbXM6IEFycmF5PFF1aWNrUGlja0l0ZW0+ID0gW107XG5cdFx0XHRpdGVtcy5wdXNoKHsgaWQ6IFJlbW90ZVR1bm5lbENvbW1hbmRJZHMubGVhcm5Nb3JlLCBsYWJlbDogUmVtb3RlVHVubmVsQ29tbWFuZExhYmVscy5sZWFybk1vcmUgfSk7XG5cdFx0XHRpZiAodGhpcy5jb25uZWN0aW9uSW5mbykge1xuXHRcdFx0XHRxdWlja1BpY2sudGl0bGUgPVxuXHRcdFx0XHRcdHRoaXMuY29ubmVjdGlvbkluZm8uaXNBdHRhY2hlZCA/XG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ21hbmFnZS50aXRsZS5hdHRhY2hlZCcsIGNvbW1lbnQ6IFsnezB9IGlzIHRoZSB0dW5uZWwgbmFtZSddIH0sICdSZW1vdGUgVHVubmVsIEFjY2VzcyBlbmFibGVkIGZvciB7MH0gKGxhdW5jaGVkIGV4dGVybmFsbHkpJywgdGhpcy5jb25uZWN0aW9uSW5mby50dW5uZWxOYW1lKSA6XG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ21hbmFnZS50aXRsZS5vcnVubmluZycsIGNvbW1lbnQ6IFsnezB9IGlzIHRoZSB0dW5uZWwgbmFtZSddIH0sICdSZW1vdGUgVHVubmVsIEFjY2VzcyBlbmFibGVkIGZvciB7MH0nLCB0aGlzLmNvbm5lY3Rpb25JbmZvLnR1bm5lbE5hbWUpO1xuXG5cdFx0XHRcdGl0ZW1zLnB1c2goeyBpZDogUmVtb3RlVHVubmVsQ29tbWFuZElkcy5jb3B5VG9DbGlwYm9hcmQsIGxhYmVsOiBSZW1vdGVUdW5uZWxDb21tYW5kTGFiZWxzLmNvcHlUb0NsaXBib2FyZCwgZGVzY3JpcHRpb246IHRoaXMuY29ubmVjdGlvbkluZm8uZG9tYWluIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cXVpY2tQaWNrLnRpdGxlID0gbG9jYWxpemUoJ21hbmFnZS50aXRsZS5vZmYnLCAnUmVtb3RlIFR1bm5lbCBBY2Nlc3Mgbm90IGVuYWJsZWQnKTtcblx0XHRcdH1cblx0XHRcdGl0ZW1zLnB1c2goeyBpZDogUmVtb3RlVHVubmVsQ29tbWFuZElkcy5zaG93TG9nLCBsYWJlbDogbG9jYWxpemUoJ21hbmFnZS5zaG93TG9nJywgJ1Nob3cgTG9nJykgfSk7XG5cdFx0XHRpdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG5cdFx0XHRpdGVtcy5wdXNoKHsgaWQ6IFJlbW90ZVR1bm5lbENvbW1hbmRJZHMuY29uZmlndXJlLCBsYWJlbDogbG9jYWxpemUoJ21hbmFnZS50dW5uZWxOYW1lJywgJ0NoYW5nZSBUdW5uZWwgTmFtZScpLCBkZXNjcmlwdGlvbjogdGhpcy5jb25uZWN0aW9uSW5mbz8udHVubmVsTmFtZSB9KTtcblx0XHRcdGl0ZW1zLnB1c2goeyBpZDogUmVtb3RlVHVubmVsQ29tbWFuZElkcy50dXJuT2ZmLCBsYWJlbDogUmVtb3RlVHVubmVsQ29tbWFuZExhYmVscy50dXJuT2ZmLCBkZXNjcmlwdGlvbjogYWNjb3VudC5hY3RpdmUgPyBgJHthY2NvdW50LnNlc3Npb24uYWNjb3VudExhYmVsfSAoJHthY2NvdW50LnNlc3Npb24ucHJvdmlkZXJJZH0pYCA6IHVuZGVmaW5lZCB9KTtcblxuXHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gaXRlbXM7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0aWYgKHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdICYmIHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdLmlkKSB7XG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXS5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cXVpY2tQaWNrLmhpZGUoKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRjKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdH0pO1xuXHR9XG59XG5cblxuY29uc3Qgd29ya2JlbmNoUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihSZW1vdGVUdW5uZWxXb3JrYmVuY2hDb250cmlidXRpb24sIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRbQ09ORklHVVJBVElPTl9LRVlfSE9TVF9OQU1FXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGVUdW5uZWxBY2Nlc3MubWFjaGluZU5hbWUnLCBcIlRoZSBuYW1lIHVuZGVyIHdoaWNoIHRoZSByZW1vdGUgdHVubmVsIGFjY2VzcyBpcyByZWdpc3RlcmVkLiBJZiBub3Qgc2V0LCB0aGUgaG9zdCBuYW1lIGlzIHVzZWQuXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0aWdub3JlU3luYzogdHJ1ZSxcblx0XHRcdHBhdHRlcm46ICdeKFxcXFx3W1xcXFx3LV0qKT8kJyxcblx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IGxvY2FsaXplKCdyZW1vdGVUdW5uZWxBY2Nlc3MubWFjaGluZU5hbWVSZWdleCcsIFwiVGhlIG5hbWUgbXVzdCBvbmx5IGNvbnNpc3Qgb2YgbGV0dGVycywgbnVtYmVycywgdW5kZXJzY29yZSBhbmQgZGFzaC4gSXQgbXVzdCBub3Qgc3RhcnQgd2l0aCBhIGRhc2guXCIpLFxuXHRcdFx0bWF4TGVuZ3RoOiAyMCxcblx0XHRcdGRlZmF1bHQ6ICcnXG5cdFx0fSxcblx0XHRbQ09ORklHVVJBVElPTl9LRVlfUFJFVkVOVF9TTEVFUF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlVHVubmVsQWNjZXNzLnByZXZlbnRTbGVlcCcsIFwiUHJldmVudCB0aGlzIGNvbXB1dGVyIGZyb20gc2xlZXBpbmcgd2hlbiByZW1vdGUgdHVubmVsIGFjY2VzcyBpcyB0dXJuZWQgb24uXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxlQUFlO0FBRXhCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsVUFBVSxVQUFVLGdCQUFnQjtBQUM3QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxjQUFjLHlCQUF5QiwwQkFBa0Q7QUFDbEcsU0FBUyxnQkFBNkIsb0JBQW9CLHFCQUFxQjtBQUMvRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlDQUFpQztBQUUxQyxTQUFrQixzQkFBc0I7QUFDeEMsU0FBUyxzQkFBc0Isc0JBQXNCLGdCQUFnQjtBQUNyRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFvQixrQkFBaUMsd0JBQXdCO0FBQzdFLFNBQVMsMEJBQThFO0FBQ3ZGLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCLDBCQUEwQixpQ0FBaUQsc0JBQXNCLHNCQUE0QyxhQUFhLGNBQTRCO0FBQzVOLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsMEJBQTBCLDJCQUEyQjtBQUM5RCxTQUFrRSxjQUFjLDJCQUEyQjtBQUMzRyxTQUFnQyw4QkFBOEI7QUFDOUQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFFN0IsTUFBTSx5QkFBeUIsVUFBVSx5QkFBeUIsZ0JBQWdCO0FBSWxGLE1BQU0scUNBQXFDO0FBQzNDLE1BQU0saUNBQWlDLElBQUksY0FBa0Msb0NBQW9DLGNBQWM7QUFFdEksTUFBTSxp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UUFBUSxRQUFRLFlBQVksS0FBSyxRQUFRLFFBQVEsVUFBVSxNQUFNLE9BQVUsQ0FBQztBQUV4TSxnQkFBVSxRQUFRO0FBQ2xCLGtCQUFZLElBQUksVUFBVSxZQUFZLE1BQU07QUFDM0MsWUFBSSxVQUFVLGNBQWMsQ0FBQyxLQUFLLFVBQVUsY0FBYyxDQUFDLEVBQUUsSUFBSTtBQUNoRSxlQUFLLGVBQWUsZUFBZSxVQUFVLGNBQWMsQ0FBQyxFQUFFLEVBQUU7QUFBQSxRQUNqRTtBQUNBLGtCQUFVLEtBQUs7QUFBQSxNQUNoQixDQUFDLENBQUM7QUFDRixrQkFBWSxJQUFJLFVBQVUsVUFBVSxNQUFNO0FBQ3pDLG9CQUFZLFFBQVE7QUFDcEIsVUFBRTtBQUFBLE1BQ0gsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVUsS0FBSztBQUFBLElBQ2hCLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUF6c0JhLG9DQUFOO0FBQUEsRUFhSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTFCVTtBQTRzQmIsTUFBTSxvQkFBb0IsU0FBUyxHQUFvQyxvQkFBb0IsU0FBUztBQUNwRyxrQkFBa0IsOEJBQThCLG1DQUFtQyxlQUFlLFFBQVE7QUFFMUcsU0FBUyxHQUEyQix3QkFBd0IsYUFBYSxFQUFFLHNCQUFzQjtBQUFBLEVBQ2hHLE1BQU07QUFBQSxFQUNOLFlBQVk7QUFBQSxJQUNYLENBQUMsMkJBQTJCLEdBQUc7QUFBQSxNQUM5QixhQUFhLFNBQVMsa0NBQWtDLGlHQUFpRztBQUFBLE1BQ3pKLE1BQU07QUFBQSxNQUNOLE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIsWUFBWTtBQUFBLE1BQ1osU0FBUztBQUFBLE1BQ1QscUJBQXFCLFNBQVMsdUNBQXVDLHFHQUFxRztBQUFBLE1BQzFLLFdBQVc7QUFBQSxNQUNYLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLCtCQUErQixHQUFHO0FBQUEsTUFDbEMsYUFBYSxTQUFTLG1DQUFtQyw2RUFBNkU7QUFBQSxNQUN0SSxNQUFNO0FBQUEsTUFDTixPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLFNBQVM7QUFBQSxJQUNWO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbIlJlbW90ZVR1bm5lbENvbW1hbmRJZHMiLCAiUmVtb3RlVHVubmVsQ29tbWFuZExhYmVscyIsICJzdGF0dXMiXQp9Cg==
