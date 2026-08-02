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
import * as nls from "../../../../nls.js";
import { IRemoteAgentService, remoteConnectionLatencyMeasurer } from "../../../services/remote/common/remoteAgentService.js";
import { RunOnceScheduler, retry } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { MenuId, IMenuService, MenuItemAction, MenuRegistry, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { StatusbarAlignment, IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { Schemas } from "../../../../base/common/network.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { PersistentConnectionEventType } from "../../../../platform/remote/common/remoteAgentConnection.js";
import { IRemoteAuthorityResolverService } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { PlatformToString, isWeb, platform } from "../../../../base/common/platform.js";
import { truncate } from "../../../../base/common/strings.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { getRemoteName } from "../../../../platform/remote/common/remoteHosts.js";
import { getVirtualWorkspaceLocation } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { getCodiconAriaLabel } from "../../../../base/common/iconLabels.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ReloadWindowAction } from "../../../browser/actions/windowActions.js";
import { EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionGalleryService, IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IExtensionsWorkbenchService, LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID } from "../../extensions/common/extensions.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { IsSessionsWindowContext, RemoteNameContext, VirtualWorkspaceContext } from "../../../common/contextkeys.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { DomEmitter } from "../../../../base/browser/event.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { infoIcon } from "../../extensions/browser/extensionsIcons.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { URI } from "../../../../base/common/uri.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { workbenchConfigurationNodeBase } from "../../../common/configuration.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import Severity from "../../../../base/common/severity.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
let RemoteStatusIndicator = class extends Disposable {
  constructor(statusbarService, environmentService, labelService, contextKeyService, menuService, quickInputService, commandService, extensionService, remoteAgentService, remoteAuthorityResolverService, hostService, workspaceContextService, logService, extensionGalleryService, telemetryService, productService, extensionManagementService, extensionsWorkbenchService, dialogService, lifecycleService, openerService, configurationService) {
    super();
    this.statusbarService = statusbarService;
    this.environmentService = environmentService;
    this.labelService = labelService;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    this.quickInputService = quickInputService;
    this.commandService = commandService;
    this.extensionService = extensionService;
    this.remoteAgentService = remoteAgentService;
    this.remoteAuthorityResolverService = remoteAuthorityResolverService;
    this.hostService = hostService;
    this.workspaceContextService = workspaceContextService;
    this.logService = logService;
    this.extensionGalleryService = extensionGalleryService;
    this.telemetryService = telemetryService;
    this.productService = productService;
    this.extensionManagementService = extensionManagementService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.dialogService = dialogService;
    this.lifecycleService = lifecycleService;
    this.openerService = openerService;
    this.configurationService = configurationService;
    this.virtualWorkspaceLocation = void 0;
    this.connectionState = void 0;
    this.connectionToken = void 0;
    this.networkState = void 0;
    this.measureNetworkConnectionLatencyScheduler = void 0;
    this.loggedInvalidGroupNames = /* @__PURE__ */ Object.create(null);
    this._remoteExtensionMetadata = void 0;
    this.remoteMetadataInitialized = false;
    this._onDidChangeEntries = this._register(new Emitter());
    this.onDidChangeEntries = this._onDidChangeEntries.event;
    this.unrestrictedRemoteIndicatorMenu = this._register(this.menuService.createMenu(MenuId.StatusBarWindowIndicatorMenu, this.contextKeyService));
    this.remoteIndicatorMenu = this._register(this.menuService.createMenu(MenuId.StatusBarRemoteIndicatorMenu, this.contextKeyService));
    this.connectionStateContextKey = new RawContextKey("remoteConnectionState", "").bindTo(this.contextKeyService);
    if (this.remoteAuthority) {
      this.connectionState = "initializing";
      this.connectionStateContextKey.set(this.connectionState);
    } else {
      this.updateVirtualWorkspaceLocation();
    }
    this.registerActions();
    this.registerListeners();
    this.updateWhenInstalledExtensionsRegistered();
    this.updateRemoteStatusIndicator();
  }
  get remoteExtensionMetadata() {
    if (!this._remoteExtensionMetadata) {
      const remoteExtensionTips = { ...this.productService.remoteExtensionTips, ...this.productService.virtualWorkspaceExtensionTips };
      this._remoteExtensionMetadata = Object.values(remoteExtensionTips).filter((value) => value.startEntry !== void 0).map((value) => {
        return {
          id: value.extensionId,
          installed: false,
          friendlyName: value.friendlyName,
          isPlatformCompatible: false,
          dependencies: [],
          helpLink: value.startEntry?.helpLink ?? "",
          startConnectLabel: value.startEntry?.startConnectLabel ?? "",
          startCommand: value.startEntry?.startCommand ?? "",
          priority: value.startEntry?.priority ?? 10,
          supportedPlatforms: value.supportedPlatforms
        };
      });
      this.remoteExtensionMetadata.sort((ext1, ext2) => ext1.priority - ext2.priority);
    }
    return this._remoteExtensionMetadata;
  }
  get remoteAuthority() {
    return this.environmentService.remoteAuthority;
  }
  registerActions() {
    const category = nls.localize2("remote.category", "Remote");
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: RemoteStatusIndicator.REMOTE_ACTIONS_COMMAND_ID,
          category,
          title: nls.localize2("remote.showMenu", "Show Remote Menu"),
          f1: true,
          keybinding: {
            weight: KeybindingWeight.WorkbenchContrib,
            primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyO
          }
        });
        this.run = () => that.showRemoteMenu();
      }
    }));
    if (RemoteStatusIndicator.SHOW_CLOSE_REMOTE_COMMAND_ID) {
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
            category,
            title: nls.localize2("remote.close", "Close Remote Connection"),
            f1: true,
            precondition: ContextKeyExpr.and(ContextKeyExpr.or(RemoteNameContext, VirtualWorkspaceContext), IsSessionsWindowContext.negate())
          });
          this.run = () => that.hostService.openWindow({ forceReuseWindow: true, remoteAuthority: null });
        }
      }));
      if (this.remoteAuthority) {
        MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
          group: "6_close",
          command: {
            id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
            title: nls.localize({ key: "miCloseRemote", comment: ["&& denotes a mnemonic"] }, "Close Re&&mote Connection")
          },
          when: IsSessionsWindowContext.negate(),
          order: 3.5
        });
      }
    }
    if (this.extensionGalleryService.isEnabled()) {
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: RemoteStatusIndicator.INSTALL_REMOTE_EXTENSIONS_ID,
            category,
            title: nls.localize2("remote.install", "Install Remote Development Extensions"),
            f1: true
          });
          this.run = (accessor, input) => {
            const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
            return extensionsWorkbenchService.openSearch(`@recommended:remotes`);
          };
        }
      }));
    }
  }
  registerListeners() {
    const updateRemoteActions = () => {
      this.remoteMenuActionsGroups = void 0;
      this.updateRemoteStatusIndicator();
    };
    this._register(this.unrestrictedRemoteIndicatorMenu.onDidChange(updateRemoteActions));
    this._register(this.remoteIndicatorMenu.onDidChange(updateRemoteActions));
    this._register(this.labelService.onDidChangeFormatters(() => this.updateRemoteStatusIndicator()));
    const remoteIndicator = this.environmentService.options?.windowIndicator;
    if (remoteIndicator && remoteIndicator.onDidChange) {
      this._register(remoteIndicator.onDidChange(() => this.updateRemoteStatusIndicator()));
    }
    if (this.remoteAuthority) {
      const connection = this.remoteAgentService.getConnection();
      if (connection) {
        this._register(connection.onDidStateChange((e) => {
          switch (e.type) {
            case PersistentConnectionEventType.ConnectionLost:
            case PersistentConnectionEventType.ReconnectionRunning:
            case PersistentConnectionEventType.ReconnectionWait:
              this.setConnectionState("reconnecting");
              break;
            case PersistentConnectionEventType.ReconnectionPermanentFailure:
              this.setConnectionState("disconnected");
              break;
            case PersistentConnectionEventType.ConnectionGain:
              this.setConnectionState("connected");
              break;
          }
        }));
      }
    } else {
      this._register(this.workspaceContextService.onDidChangeWorkbenchState(() => {
        this.updateVirtualWorkspaceLocation();
        this.updateRemoteStatusIndicator();
      }));
    }
    if (isWeb) {
      this._register(Event.any(
        this._register(new DomEmitter(mainWindow, "online")).event,
        this._register(new DomEmitter(mainWindow, "offline")).event
      )(() => this.setNetworkState(navigator.onLine ? "online" : "offline")));
    }
    this._register(this.extensionService.onDidChangeExtensions(async (result) => {
      for (const ext of result.added) {
        const index = this.remoteExtensionMetadata.findIndex((value) => ExtensionIdentifier.equals(value.id, ext.identifier));
        if (index > -1) {
          this.remoteExtensionMetadata[index].installed = true;
        }
      }
    }));
    this._register(this.extensionManagementService.onDidUninstallExtension(async (result) => {
      const index = this.remoteExtensionMetadata.findIndex((value) => ExtensionIdentifier.equals(value.id, result.identifier.id));
      if (index > -1) {
        this.remoteExtensionMetadata[index].installed = false;
      }
    }));
  }
  async initializeRemoteMetadata() {
    if (this.remoteMetadataInitialized) {
      return;
    }
    const currentPlatform = PlatformToString(platform);
    for (let i = 0; i < this.remoteExtensionMetadata.length; i++) {
      const extensionId = this.remoteExtensionMetadata[i].id;
      const supportedPlatforms = this.remoteExtensionMetadata[i].supportedPlatforms;
      const isInstalled = (await this.extensionManagementService.getInstalled()).find((value) => ExtensionIdentifier.equals(value.identifier.id, extensionId)) ? true : false;
      this.remoteExtensionMetadata[i].installed = isInstalled;
      if (isInstalled) {
        this.remoteExtensionMetadata[i].isPlatformCompatible = true;
      } else if (supportedPlatforms && !supportedPlatforms.includes(currentPlatform)) {
        this.remoteExtensionMetadata[i].isPlatformCompatible = false;
      } else {
        this.remoteExtensionMetadata[i].isPlatformCompatible = true;
      }
    }
    this.remoteMetadataInitialized = true;
    this._onDidChangeEntries.fire();
    this.updateRemoteStatusIndicator();
  }
  updateVirtualWorkspaceLocation() {
    this.virtualWorkspaceLocation = getVirtualWorkspaceLocation(this.workspaceContextService.getWorkspace());
  }
  async updateWhenInstalledExtensionsRegistered() {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const remoteAuthority = this.remoteAuthority;
    if (remoteAuthority) {
      (async () => {
        try {
          const { authority } = await this.remoteAuthorityResolverService.resolveAuthority(remoteAuthority);
          this.connectionToken = authority.connectionToken;
          this.setConnectionState("connected");
        } catch (error) {
          this.setConnectionState("disconnected");
        }
      })();
    }
    this.updateRemoteStatusIndicator();
    this.initializeRemoteMetadata();
  }
  setConnectionState(newState) {
    if (this.connectionState !== newState) {
      this.connectionState = newState;
      if (this.connectionState === "reconnecting") {
        this.connectionStateContextKey.set("disconnected");
      } else {
        this.connectionStateContextKey.set(this.connectionState);
      }
      this.updateRemoteStatusIndicator();
      if (newState === "connected") {
        this.scheduleMeasureNetworkConnectionLatency();
      }
    }
  }
  scheduleMeasureNetworkConnectionLatency() {
    if (!this.remoteAuthority || // only when having a remote connection
    this.measureNetworkConnectionLatencyScheduler) {
      return;
    }
    this.measureNetworkConnectionLatencyScheduler = this._register(new RunOnceScheduler(() => this.measureNetworkConnectionLatency(), RemoteStatusIndicator.REMOTE_CONNECTION_LATENCY_SCHEDULER_DELAY));
    this.measureNetworkConnectionLatencyScheduler.schedule(RemoteStatusIndicator.REMOTE_CONNECTION_LATENCY_SCHEDULER_FIRST_RUN_DELAY);
  }
  async measureNetworkConnectionLatency() {
    if (this.hostService.hasFocus && this.networkState !== "offline") {
      const measurement = await remoteConnectionLatencyMeasurer.measure(this.remoteAgentService);
      if (measurement) {
        if (measurement.high) {
          this.setNetworkState("high-latency");
        } else if (this.networkState === "high-latency") {
          this.setNetworkState("online");
        }
      }
    }
    this.measureNetworkConnectionLatencyScheduler?.schedule();
  }
  setNetworkState(newState) {
    if (this.networkState !== newState) {
      const oldState = this.networkState;
      this.networkState = newState;
      if (newState === "high-latency") {
        this.logService.warn(`Remote network connection appears to have high latency (${remoteConnectionLatencyMeasurer.latency?.current?.toFixed(2)}ms last, ${remoteConnectionLatencyMeasurer.latency?.average?.toFixed(2)}ms average)`);
      }
      if (this.connectionToken) {
        if (newState === "online" && oldState === "high-latency") {
          this.logNetworkConnectionHealthTelemetry(this.connectionToken, "good");
        } else if (newState === "high-latency" && oldState === "online") {
          this.logNetworkConnectionHealthTelemetry(this.connectionToken, "poor");
        }
      }
      this.updateRemoteStatusIndicator();
    }
  }
  logNetworkConnectionHealthTelemetry(connectionToken, connectionHealth) {
    this.telemetryService.publicLog2("remoteConnectionHealth", {
      remoteName: getRemoteName(this.remoteAuthority),
      reconnectionToken: connectionToken,
      connectionHealth
    });
  }
  validatedGroup(group) {
    if (!group.match(/^(remote|virtualfs)_(\d\d)_(([a-z][a-z0-9+.-]*)_(.*))$/)) {
      if (!this.loggedInvalidGroupNames[group]) {
        this.loggedInvalidGroupNames[group] = true;
        this.logService.warn(`Invalid group name used in "statusBar/remoteIndicator" menu contribution: ${group}. Entries ignored. Expected format: 'remote_$ORDER_$REMOTENAME_$GROUPING or 'virtualfs_$ORDER_$FILESCHEME_$GROUPING.`);
      }
      return false;
    }
    return true;
  }
  getRemoteMenuActions(doNotUseCache) {
    if (!this.remoteMenuActionsGroups || doNotUseCache) {
      this.remoteMenuActionsGroups = this.remoteIndicatorMenu.getActions().filter((a) => this.validatedGroup(a[0])).concat(this.unrestrictedRemoteIndicatorMenu.getActions());
    }
    return this.remoteMenuActionsGroups;
  }
  updateRemoteStatusIndicator() {
    const remoteIndicator = this.environmentService.options?.windowIndicator;
    if (remoteIndicator) {
      let remoteIndicatorLabel = remoteIndicator.label.trim();
      if (!remoteIndicatorLabel.startsWith("$(")) {
        remoteIndicatorLabel = `$(remote) ${remoteIndicatorLabel}`;
      }
      this.renderRemoteStatusIndicator(truncate(remoteIndicatorLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH), remoteIndicator.tooltip, remoteIndicator.command);
      return;
    }
    if (this.remoteAuthority) {
      const hostLabel = this.labelService.getHostLabel(Schemas.vscodeRemote, this.remoteAuthority) || this.remoteAuthority;
      switch (this.connectionState) {
        case "initializing":
          this.renderRemoteStatusIndicator(
            nls.localize("host.open", "Opening Remote..."),
            nls.localize("host.open", "Opening Remote..."),
            void 0,
            true
            /* progress */
          );
          break;
        case "reconnecting":
          this.renderRemoteStatusIndicator(
            `${nls.localize("host.reconnecting", "Reconnecting to {0}...", truncate(hostLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH))}`,
            void 0,
            void 0,
            true
            /* progress */
          );
          break;
        case "disconnected":
          this.renderRemoteStatusIndicator(`$(alert) ${nls.localize("disconnectedFrom", "Disconnected from {0}", truncate(hostLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH))}`);
          break;
        default: {
          const tooltip = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
          const hostNameTooltip = this.labelService.getHostTooltip(Schemas.vscodeRemote, this.remoteAuthority);
          if (hostNameTooltip) {
            tooltip.appendMarkdown(hostNameTooltip);
          } else {
            tooltip.appendText(nls.localize({ key: "host.tooltip", comment: ["{0} is a remote host name, e.g. Dev Container"] }, "Editing on {0}", hostLabel));
          }
          this.renderRemoteStatusIndicator(`$(remote) ${truncate(hostLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH)}`, tooltip);
        }
      }
      return;
    }
    if (this.virtualWorkspaceLocation) {
      const workspaceLabel = this.labelService.getHostLabel(this.virtualWorkspaceLocation.scheme, this.virtualWorkspaceLocation.authority);
      if (workspaceLabel) {
        const tooltip = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
        const hostNameTooltip = this.labelService.getHostTooltip(this.virtualWorkspaceLocation.scheme, this.virtualWorkspaceLocation.authority);
        if (hostNameTooltip) {
          tooltip.appendMarkdown(hostNameTooltip);
        } else {
          tooltip.appendText(nls.localize({ key: "workspace.tooltip", comment: ["{0} is a remote workspace name, e.g. GitHub"] }, "Editing on {0}", workspaceLabel));
        }
        if (!isWeb || this.remoteAuthority) {
          tooltip.appendMarkdown("\n\n");
          tooltip.appendMarkdown(nls.localize(
            { key: "workspace.tooltip2", comment: ["[features are not available]({1}) is a link. Only translate `features are not available`. Do not change brackets and parentheses or {0}"] },
            "Some [features are not available]({0}) for resources located on a virtual file system.",
            `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`
          ));
        }
        this.renderRemoteStatusIndicator(`$(remote) ${truncate(workspaceLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH)}`, tooltip);
        return;
      }
    }
    this.renderRemoteStatusIndicator(RemoteStatusIndicator.DEFAULT_REMOTE_STATUS_LABEL, nls.localize("noHost.tooltip", "Open a Remote Window"));
    return;
  }
  renderRemoteStatusIndicator(initialText, initialTooltip, command, showProgress) {
    const { text, tooltip, ariaLabel } = this.withNetworkStatus(initialText, initialTooltip, showProgress);
    const properties = {
      name: nls.localize("remoteHost", "Remote Host"),
      kind: this.networkState === "offline" ? "offline" : text !== RemoteStatusIndicator.DEFAULT_REMOTE_STATUS_LABEL ? "remote" : void 0,
      // only emphasize when applicable
      ariaLabel,
      text,
      showProgress,
      tooltip,
      command: command ?? RemoteStatusIndicator.REMOTE_ACTIONS_COMMAND_ID
    };
    if (this.remoteStatusEntry) {
      this.remoteStatusEntry.update(properties);
    } else {
      this.remoteStatusEntry = this.statusbarService.addEntry(
        properties,
        "status.host",
        StatusbarAlignment.LEFT,
        Number.POSITIVE_INFINITY
        /* first entry */
      );
    }
  }
  withNetworkStatus(initialText, initialTooltip, showProgress) {
    let text = initialText;
    let tooltip = initialTooltip;
    let ariaLabel = getCodiconAriaLabel(text);
    function textWithAlert() {
      if (!showProgress && initialText.startsWith(RemoteStatusIndicator.DEFAULT_REMOTE_STATUS_LABEL)) {
        return initialText.replace(RemoteStatusIndicator.DEFAULT_REMOTE_STATUS_LABEL, "$(alert)");
      }
      return initialText;
    }
    switch (this.networkState) {
      case "offline": {
        const offlineMessage = nls.localize("networkStatusOfflineTooltip", "Network appears to be offline, certain features might be unavailable.");
        text = textWithAlert();
        tooltip = this.appendTooltipLine(tooltip, offlineMessage);
        ariaLabel = `${ariaLabel}, ${offlineMessage}`;
        break;
      }
      case "high-latency":
        text = textWithAlert();
        tooltip = this.appendTooltipLine(tooltip, nls.localize("networkStatusHighLatencyTooltip", "Network appears to have high latency ({0}ms last, {1}ms average), certain features may be slow to respond.", remoteConnectionLatencyMeasurer.latency?.current?.toFixed(2), remoteConnectionLatencyMeasurer.latency?.average?.toFixed(2)));
        break;
    }
    return { text, tooltip, ariaLabel };
  }
  appendTooltipLine(tooltip, line) {
    let markdownTooltip;
    if (typeof tooltip === "string") {
      markdownTooltip = new MarkdownString(tooltip, { isTrusted: true, supportThemeIcons: true });
    } else {
      markdownTooltip = tooltip ?? new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
    }
    if (markdownTooltip.value.length > 0) {
      markdownTooltip.appendMarkdown("\n\n");
    }
    markdownTooltip.appendMarkdown(line);
    return markdownTooltip;
  }
  async installExtension(extensionId, remoteLabel) {
    try {
      await this.extensionsWorkbenchService.install(extensionId, {
        isMachineScoped: false,
        donotIncludePackAndDependencies: false,
        context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true }
      });
    } catch (error) {
      if (!this.lifecycleService.willShutdown) {
        const { confirmed } = await this.dialogService.confirm({
          type: Severity.Error,
          message: nls.localize("unknownSetupError", "An error occurred while setting up {0}. Would you like to try again?", remoteLabel),
          detail: error && !isCancellationError(error) ? toErrorMessage(error) : void 0,
          primaryButton: nls.localize("retry", "Retry")
        });
        if (confirmed) {
          return this.installExtension(extensionId, remoteLabel);
        }
      }
      throw error;
    }
  }
  async runRemoteStartCommand(extensionId, startCommand) {
    await retry(async () => {
      const ext = await this.extensionService.getExtension(extensionId);
      if (!ext) {
        throw Error("Failed to find installed remote extension");
      }
      return ext;
    }, 300, 10);
    this.commandService.executeCommand(startCommand);
    this.telemetryService.publicLog2("workbenchActionExecuted", {
      id: "remoteInstallAndRun",
      detail: extensionId,
      from: "remote indicator"
    });
  }
  showRemoteMenu() {
    const getCategoryLabel = (action) => {
      if (action.item.category) {
        return typeof action.item.category === "string" ? action.item.category : action.item.category.value;
      }
      return void 0;
    };
    const matchCurrentRemote = () => {
      if (this.remoteAuthority) {
        return new RegExp(`^remote_\\d\\d_${getRemoteName(this.remoteAuthority)}_`);
      } else if (this.virtualWorkspaceLocation) {
        return new RegExp(`^virtualfs_\\d\\d_${this.virtualWorkspaceLocation.scheme}_`);
      }
      return void 0;
    };
    const computeItems = () => {
      let actionGroups = this.getRemoteMenuActions(true);
      const items = [];
      const currentRemoteMatcher = matchCurrentRemote();
      if (currentRemoteMatcher) {
        actionGroups = actionGroups.sort((g1, g2) => {
          const isCurrentRemote1 = currentRemoteMatcher.test(g1[0]);
          const isCurrentRemote2 = currentRemoteMatcher.test(g2[0]);
          if (isCurrentRemote1 !== isCurrentRemote2) {
            return isCurrentRemote1 ? -1 : 1;
          }
          if (g1[0] !== "" && g2[0] === "") {
            return -1;
          } else if (g1[0] === "" && g2[0] !== "") {
            return 1;
          }
          return g1[0].localeCompare(g2[0]);
        });
      }
      let lastCategoryName = void 0;
      for (const actionGroup of actionGroups) {
        let hasGroupCategory = false;
        for (const action of actionGroup[1]) {
          if (action instanceof MenuItemAction) {
            if (!hasGroupCategory) {
              const category = getCategoryLabel(action);
              if (category !== lastCategoryName) {
                items.push({ type: "separator", label: category });
                lastCategoryName = category;
              }
              hasGroupCategory = true;
            }
            const label = typeof action.item.title === "string" ? action.item.title : action.item.title.value;
            items.push({
              type: "item",
              id: action.item.id,
              label
            });
          }
        }
      }
      const showExtensionRecommendations = this.configurationService.getValue("workbench.remoteIndicator.showExtensionRecommendations");
      if (showExtensionRecommendations && this.extensionGalleryService.isEnabled() && this.remoteMetadataInitialized) {
        const notInstalledItems = [];
        for (const metadata of this.remoteExtensionMetadata) {
          if (!metadata.installed && metadata.isPlatformCompatible) {
            const label = metadata.startConnectLabel;
            const buttons = [{
              iconClass: ThemeIcon.asClassName(infoIcon),
              tooltip: nls.localize("remote.startActions.help", "Learn More")
            }];
            notInstalledItems.push({ type: "item", id: metadata.id, label, buttons });
          }
        }
        items.push({
          type: "separator",
          label: nls.localize("remote.startActions.install", "Install")
        });
        items.push(...notInstalledItems);
      }
      items.push({
        type: "separator"
      });
      const entriesBeforeConfig = items.length;
      if (RemoteStatusIndicator.SHOW_CLOSE_REMOTE_COMMAND_ID) {
        if (this.remoteAuthority) {
          items.push({
            type: "item",
            id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
            label: nls.localize("closeRemoteConnection.title", "Close Remote Connection")
          });
          if (this.connectionState === "disconnected") {
            items.push({
              type: "item",
              id: ReloadWindowAction.ID,
              label: nls.localize("reloadWindow", "Reload Window")
            });
          }
        } else if (this.virtualWorkspaceLocation) {
          items.push({
            type: "item",
            id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
            label: nls.localize("closeVirtualWorkspace.title", "Close Remote Workspace")
          });
        }
      }
      if (items.length === entriesBeforeConfig) {
        items.pop();
      }
      return items;
    };
    const disposables = new DisposableStore();
    const quickPick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    quickPick.placeholder = nls.localize("remoteActions", "Select an option to open a Remote Window");
    quickPick.items = computeItems();
    quickPick.sortByLabel = false;
    quickPick.canSelectMany = false;
    disposables.add(Event.once(quickPick.onDidAccept)((async (_) => {
      const selectedItems = quickPick.selectedItems;
      if (selectedItems.length === 1) {
        const commandId = selectedItems[0].id;
        const remoteExtension = this.remoteExtensionMetadata.find((value) => ExtensionIdentifier.equals(value.id, commandId));
        if (remoteExtension) {
          quickPick.items = [];
          quickPick.busy = true;
          quickPick.placeholder = nls.localize("remote.startActions.installingExtension", "Installing extension... ");
          try {
            await this.installExtension(remoteExtension.id, selectedItems[0].label);
          } catch (error) {
            return;
          } finally {
            quickPick.hide();
          }
          await this.runRemoteStartCommand(remoteExtension.id, remoteExtension.startCommand);
        } else {
          this.telemetryService.publicLog2("workbenchActionExecuted", {
            id: commandId,
            from: "remote indicator"
          });
          this.commandService.executeCommand(commandId);
          quickPick.hide();
        }
      }
    })));
    disposables.add(Event.once(quickPick.onDidTriggerItemButton)(async (e) => {
      const remoteExtension = this.remoteExtensionMetadata.find((value) => ExtensionIdentifier.equals(value.id, e.item.id));
      if (remoteExtension) {
        await this.openerService.open(URI.parse(remoteExtension.helpLink));
      }
    }));
    disposables.add(this.unrestrictedRemoteIndicatorMenu.onDidChange(() => quickPick.items = computeItems()));
    disposables.add(this.remoteIndicatorMenu.onDidChange(() => quickPick.items = computeItems()));
    disposables.add(quickPick.onDidHide(() => disposables.dispose()));
    if (!this.remoteMetadataInitialized) {
      quickPick.busy = true;
      disposables.add(this.onDidChangeEntries(() => {
        quickPick.busy = false;
        quickPick.items = computeItems();
      }));
    }
    quickPick.show();
  }
};
RemoteStatusIndicator.ID = "workbench.contrib.remoteStatusIndicator";
RemoteStatusIndicator.REMOTE_ACTIONS_COMMAND_ID = "workbench.action.remote.showMenu";
RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID = "workbench.action.remote.close";
RemoteStatusIndicator.SHOW_CLOSE_REMOTE_COMMAND_ID = !isWeb;
// web does not have a "Close Remote" command
RemoteStatusIndicator.INSTALL_REMOTE_EXTENSIONS_ID = "workbench.action.remote.extensions";
RemoteStatusIndicator.DEFAULT_REMOTE_STATUS_LABEL = "$(remote)";
RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH = 40;
RemoteStatusIndicator.REMOTE_CONNECTION_LATENCY_SCHEDULER_DELAY = 60 * 1e3;
RemoteStatusIndicator.REMOTE_CONNECTION_LATENCY_SCHEDULER_FIRST_RUN_DELAY = 10 * 1e3;
RemoteStatusIndicator = __decorateClass([
  __decorateParam(0, IStatusbarService),
  __decorateParam(1, IBrowserWorkbenchEnvironmentService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IQuickInputService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IRemoteAgentService),
  __decorateParam(9, IRemoteAuthorityResolverService),
  __decorateParam(10, IHostService),
  __decorateParam(11, IWorkspaceContextService),
  __decorateParam(12, ILogService),
  __decorateParam(13, IExtensionGalleryService),
  __decorateParam(14, ITelemetryService),
  __decorateParam(15, IProductService),
  __decorateParam(16, IExtensionManagementService),
  __decorateParam(17, IExtensionsWorkbenchService),
  __decorateParam(18, IDialogService),
  __decorateParam(19, ILifecycleService),
  __decorateParam(20, IOpenerService),
  __decorateParam(21, IConfigurationService)
], RemoteStatusIndicator);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...workbenchConfigurationNodeBase,
  properties: {
    "workbench.remoteIndicator.showExtensionRecommendations": {
      type: "boolean",
      markdownDescription: nls.localize("remote.showExtensionRecommendations", "When enabled, remote extensions recommendations will be shown in the Remote Indicator menu."),
      default: true
    }
  }
});
export {
  RemoteStatusIndicator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9icm93c2VyL3JlbW90ZUluZGljYXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSwgcmVtb3RlQ29ubmVjdGlvbkxhdGVuY3lNZWFzdXJlciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIsIHJldHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBJTWVudVNlcnZpY2UsIE1lbnVJdGVtQWN0aW9uLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiwgU3VibWVudUl0ZW1BY3Rpb24sIElNZW51IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgU3RhdHVzYmFyQWxpZ25tZW50LCBJU3RhdHVzYmFyU2VydmljZSwgSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IsIElTdGF0dXNiYXJFbnRyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFF1aWNrUGlja0l0ZW0sIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrSW5wdXRCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50Q29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBdXRob3JpdHlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBQbGF0Zm9ybU5hbWUsIFBsYXRmb3JtVG9TdHJpbmcsIGlzV2ViLCBwbGF0Zm9ybSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IHRydW5jYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBnZXRSZW1vdGVOYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVIb3N0cy5qcyc7XG5pbXBvcnQgeyBnZXRWaXJ0dWFsV29ya3NwYWNlTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3ZpcnR1YWxXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q29kaWNvbkFyaWFMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZWxvYWRXaW5kb3dBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd2luZG93QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1dBTEtUSFJPVUdIX0NPTlRFWFQsIElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIExJU1RfV09SS1NQQUNFX1VOU1VQUE9SVEVEX0VYVEVOU0lPTlNfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBSZW1vdGVOYW1lQ29udGV4dCwgVmlydHVhbFdvcmtzcGFjZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBEb21FbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2V2ZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpbmZvSWNvbiB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zSWNvbnMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hDb25maWd1cmF0aW9uTm9kZUJhc2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxudHlwZSBBY3Rpb25Hcm91cCA9IFtzdHJpbmcsIEFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XTtcblxuaW50ZXJmYWNlIFJlbW90ZUV4dGVuc2lvbk1ldGFkYXRhIHtcblx0aWQ6IHN0cmluZztcblx0aW5zdGFsbGVkOiBib29sZWFuO1xuXHRkZXBlbmRlbmNpZXM6IHN0cmluZ1tdO1xuXHRpc1BsYXRmb3JtQ29tcGF0aWJsZTogYm9vbGVhbjtcblx0aGVscExpbms6IHN0cmluZztcblx0c3RhcnRDb25uZWN0TGFiZWw6IHN0cmluZztcblx0c3RhcnRDb21tYW5kOiBzdHJpbmc7XG5cdHByaW9yaXR5OiBudW1iZXI7XG5cdHN1cHBvcnRlZFBsYXRmb3Jtcz86IFBsYXRmb3JtTmFtZVtdO1xufVxuXG5leHBvcnQgY2xhc3MgUmVtb3RlU3RhdHVzSW5kaWNhdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5yZW1vdGVTdGF0dXNJbmRpY2F0b3InO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFTU9URV9BQ1RJT05TX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5yZW1vdGUuc2hvd01lbnUnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDTE9TRV9SRU1PVEVfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLnJlbW90ZS5jbG9zZSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNIT1dfQ0xPU0VfUkVNT1RFX0NPTU1BTkRfSUQgPSAhaXNXZWI7IC8vIHdlYiBkb2VzIG5vdCBoYXZlIGEgXCJDbG9zZSBSZW1vdGVcIiBjb21tYW5kXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IElOU1RBTExfUkVNT1RFX0VYVEVOU0lPTlNfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5yZW1vdGUuZXh0ZW5zaW9ucyc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9SRU1PVEVfU1RBVFVTX0xBQkVMID0gJyQocmVtb3RlKSc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVNT1RFX1NUQVRVU19MQUJFTF9NQVhfTEVOR1RIID0gNDA7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVNT1RFX0NPTk5FQ1RJT05fTEFURU5DWV9TQ0hFRFVMRVJfREVMQVkgPSA2MCAqIDEwMDA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFTU9URV9DT05ORUNUSU9OX0xBVEVOQ1lfU0NIRURVTEVSX0ZJUlNUX1JVTl9ERUxBWSA9IDEwICogMTAwMDtcblxuXHRwcml2YXRlIHJlbW90ZVN0YXR1c0VudHJ5OiBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUluZGljYXRvck1lbnU6IElNZW51OyBcdFx0XHRcdC8vIGZpbHRlcnMgaXRzIGVudHJpZXMgYmFzZWQgb24gdGhlIGN1cnJlbnQgcmVtb3RlIG5hbWUgb2YgdGhlIHdpbmRvd1xuXHRwcml2YXRlIHJlYWRvbmx5IHVucmVzdHJpY3RlZFJlbW90ZUluZGljYXRvck1lbnU6IElNZW51OyBcdC8vIGRvZXMgbm90IGZpbHRlciBpdHMgZW50cmllcyBiYXNlZCBvbiB0aGUgY3VycmVudCByZW1vdGUgbmFtZSBvZiB0aGUgd2luZG93XG5cblx0cHJpdmF0ZSByZW1vdGVNZW51QWN0aW9uc0dyb3VwczogQWN0aW9uR3JvdXBbXSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbjogeyBzY2hlbWU6IHN0cmluZzsgYXV0aG9yaXR5OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGNvbm5lY3Rpb25TdGF0ZTogJ2luaXRpYWxpemluZycgfCAnY29ubmVjdGVkJyB8ICdyZWNvbm5lY3RpbmcnIHwgJ2Rpc2Nvbm5lY3RlZCcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29ubmVjdGlvblN0YXRlQ29udGV4dEtleTogSUNvbnRleHRLZXk8JycgfCAnaW5pdGlhbGl6aW5nJyB8ICdkaXNjb25uZWN0ZWQnIHwgJ2Nvbm5lY3RlZCc+O1xuXG5cdHByaXZhdGUgbmV0d29ya1N0YXRlOiAnb25saW5lJyB8ICdvZmZsaW5lJyB8ICdoaWdoLWxhdGVuY3knIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1lYXN1cmVOZXR3b3JrQ29ubmVjdGlvbkxhdGVuY3lTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBsb2dnZWRJbnZhbGlkR3JvdXBOYW1lczogeyBbZ3JvdXA6IHN0cmluZ106IGJvb2xlYW4gfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0cHJpdmF0ZSBfcmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGE6IFJlbW90ZUV4dGVuc2lvbk1ldGFkYXRhW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IHJlbW90ZUV4dGVuc2lvbk1ldGFkYXRhKCk6IFJlbW90ZUV4dGVuc2lvbk1ldGFkYXRhW10ge1xuXHRcdGlmICghdGhpcy5fcmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGEpIHtcblx0XHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvblRpcHMgPSB7IC4uLnRoaXMucHJvZHVjdFNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uVGlwcywgLi4udGhpcy5wcm9kdWN0U2VydmljZS52aXJ0dWFsV29ya3NwYWNlRXh0ZW5zaW9uVGlwcyB9O1xuXHRcdFx0dGhpcy5fcmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGEgPSBPYmplY3QudmFsdWVzKHJlbW90ZUV4dGVuc2lvblRpcHMpLmZpbHRlcih2YWx1ZSA9PiB2YWx1ZS5zdGFydEVudHJ5ICE9PSB1bmRlZmluZWQpLm1hcCh2YWx1ZSA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IHZhbHVlLmV4dGVuc2lvbklkLFxuXHRcdFx0XHRcdGluc3RhbGxlZDogZmFsc2UsXG5cdFx0XHRcdFx0ZnJpZW5kbHlOYW1lOiB2YWx1ZS5mcmllbmRseU5hbWUsXG5cdFx0XHRcdFx0aXNQbGF0Zm9ybUNvbXBhdGlibGU6IGZhbHNlLFxuXHRcdFx0XHRcdGRlcGVuZGVuY2llczogW10sXG5cdFx0XHRcdFx0aGVscExpbms6IHZhbHVlLnN0YXJ0RW50cnk/LmhlbHBMaW5rID8/ICcnLFxuXHRcdFx0XHRcdHN0YXJ0Q29ubmVjdExhYmVsOiB2YWx1ZS5zdGFydEVudHJ5Py5zdGFydENvbm5lY3RMYWJlbCA/PyAnJyxcblx0XHRcdFx0XHRzdGFydENvbW1hbmQ6IHZhbHVlLnN0YXJ0RW50cnk/LnN0YXJ0Q29tbWFuZCA/PyAnJyxcblx0XHRcdFx0XHRwcmlvcml0eTogdmFsdWUuc3RhcnRFbnRyeT8ucHJpb3JpdHkgPz8gMTAsXG5cdFx0XHRcdFx0c3VwcG9ydGVkUGxhdGZvcm1zOiB2YWx1ZS5zdXBwb3J0ZWRQbGF0Zm9ybXNcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLnJlbW90ZUV4dGVuc2lvbk1ldGFkYXRhLnNvcnQoKGV4dDEsIGV4dDIpID0+IGV4dDEucHJpb3JpdHkgLSBleHQyLnByaW9yaXR5KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGE7XG5cdH1cblxuXHRwcml2YXRlIGdldCByZW1vdGVBdXRob3JpdHkoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdGVNZXRhZGF0YUluaXRpYWxpemVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRW50cmllcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW50cmllczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUVudHJpZXMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdGF0dXNiYXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cdFx0QElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZTogSVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudW5yZXN0cmljdGVkUmVtb3RlSW5kaWNhdG9yTWVudSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuU3RhdHVzQmFyV2luZG93SW5kaWNhdG9yTWVudSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSkpOyAvLyB0byBiZSByZW1vdmVkIG9uY2UgbWlncmF0aW9uIGNvbXBsZXRlZFxuXHRcdHRoaXMucmVtb3RlSW5kaWNhdG9yTWVudSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuU3RhdHVzQmFyUmVtb3RlSW5kaWNhdG9yTWVudSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSkpO1xuXG5cdFx0dGhpcy5jb25uZWN0aW9uU3RhdGVDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8JycgfCAnaW5pdGlhbGl6aW5nJyB8ICdkaXNjb25uZWN0ZWQnIHwgJ2Nvbm5lY3RlZCc+KCdyZW1vdGVDb25uZWN0aW9uU3RhdGUnLCAnJykuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Ly8gU2V0IGluaXRpYWwgY29ubmVjdGlvbiBzdGF0ZVxuXHRcdGlmICh0aGlzLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0dGhpcy5jb25uZWN0aW9uU3RhdGUgPSAnaW5pdGlhbGl6aW5nJztcblx0XHRcdHRoaXMuY29ubmVjdGlvblN0YXRlQ29udGV4dEtleS5zZXQodGhpcy5jb25uZWN0aW9uU3RhdGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbigpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXG5cdFx0dGhpcy51cGRhdGVXaGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHR0aGlzLnVwZGF0ZVJlbW90ZVN0YXR1c0luZGljYXRvcigpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjdGlvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgY2F0ZWdvcnkgPSBubHMubG9jYWxpemUyKCdyZW1vdGUuY2F0ZWdvcnknLCBcIlJlbW90ZVwiKTtcblxuXHRcdC8vIFNob3cgUmVtb3RlIE1lbnVcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFJlbW90ZVN0YXR1c0luZGljYXRvci5SRU1PVEVfQUNUSU9OU19DT01NQU5EX0lELFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdyZW1vdGUuc2hvd01lbnUnLCBcIlNob3cgUmVtb3RlIE1lbnVcIiksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleU8sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1biA9ICgpID0+IHRoYXQuc2hvd1JlbW90ZU1lbnUoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBDbG9zZSBSZW1vdGUgQ29ubmVjdGlvblxuXHRcdGlmIChSZW1vdGVTdGF0dXNJbmRpY2F0b3IuU0hPV19DTE9TRV9SRU1PVEVfQ09NTUFORF9JRCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkOiBSZW1vdGVTdGF0dXNJbmRpY2F0b3IuQ0xPU0VfUkVNT1RFX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdyZW1vdGUuY2xvc2UnLCBcIkNsb3NlIFJlbW90ZSBDb25uZWN0aW9uXCIpLFxuXHRcdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihSZW1vdGVOYW1lQ29udGV4dCwgVmlydHVhbFdvcmtzcGFjZUNvbnRleHQpLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSlcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRydW4gPSAoKSA9PiB0aGF0Lmhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coeyBmb3JjZVJldXNlV2luZG93OiB0cnVlLCByZW1vdGVBdXRob3JpdHk6IG51bGwgfSk7XG5cdFx0XHR9KSk7XG5cdFx0XHRpZiAodGhpcy5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0XHRcdFx0XHRncm91cDogJzZfY2xvc2UnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBSZW1vdGVTdGF0dXNJbmRpY2F0b3IuQ0xPU0VfUkVNT1RFX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlDbG9zZVJlbW90ZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJDbG9zZSBSZSYmbW90ZSBDb25uZWN0aW9uXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0XHRvcmRlcjogMy41XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IFJlbW90ZVN0YXR1c0luZGljYXRvci5JTlNUQUxMX1JFTU9URV9FWFRFTlNJT05TX0lELFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMigncmVtb3RlLmluc3RhbGwnLCBcIkluc3RhbGwgUmVtb3RlIERldmVsb3BtZW50IEV4dGVuc2lvbnNcIiksXG5cdFx0XHRcdFx0XHRmMTogdHJ1ZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJ1biA9IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaW5wdXQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goYEByZWNvbW1lbmRlZDpyZW1vdGVzYCk7XG5cdFx0XHRcdH07XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIE1lbnUgY2hhbmdlc1xuXHRcdGNvbnN0IHVwZGF0ZVJlbW90ZUFjdGlvbnMgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLnJlbW90ZU1lbnVBY3Rpb25zR3JvdXBzID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy51cGRhdGVSZW1vdGVTdGF0dXNJbmRpY2F0b3IoKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51bnJlc3RyaWN0ZWRSZW1vdGVJbmRpY2F0b3JNZW51Lm9uRGlkQ2hhbmdlKHVwZGF0ZVJlbW90ZUFjdGlvbnMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbW90ZUluZGljYXRvck1lbnUub25EaWRDaGFuZ2UodXBkYXRlUmVtb3RlQWN0aW9ucykpO1xuXG5cdFx0Ly8gVXBkYXRlIGluZGljYXRvciB3aGVuIGZvcm1hdHRlciBjaGFuZ2VzIGFzIGl0IG1heSBoYXZlIGFuIGltcGFjdCBvbiB0aGUgcmVtb3RlIGxhYmVsXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYWJlbFNlcnZpY2Uub25EaWRDaGFuZ2VGb3JtYXR0ZXJzKCgpID0+IHRoaXMudXBkYXRlUmVtb3RlU3RhdHVzSW5kaWNhdG9yKCkpKTtcblxuXHRcdC8vIFVwZGF0ZSBiYXNlZCBvbiByZW1vdGUgaW5kaWNhdG9yIGNoYW5nZXMgaWYgYW55XG5cdFx0Y29uc3QgcmVtb3RlSW5kaWNhdG9yID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8ud2luZG93SW5kaWNhdG9yO1xuXHRcdGlmIChyZW1vdGVJbmRpY2F0b3IgJiYgcmVtb3RlSW5kaWNhdG9yLm9uRGlkQ2hhbmdlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZW1vdGVJbmRpY2F0b3Iub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVSZW1vdGVTdGF0dXNJbmRpY2F0b3IoKSkpO1xuXHRcdH1cblxuXHRcdC8vIExpc3RlbiB0byBjaGFuZ2VzIG9mIHRoZSBjb25uZWN0aW9uXG5cdFx0aWYgKHRoaXMucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpO1xuXHRcdFx0aWYgKGNvbm5lY3Rpb24pIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoY29ubmVjdGlvbi5vbkRpZFN0YXRlQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRcdFx0c3dpdGNoIChlLnR5cGUpIHtcblx0XHRcdFx0XHRcdGNhc2UgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUuQ29ubmVjdGlvbkxvc3Q6XG5cdFx0XHRcdFx0XHRjYXNlIFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlLlJlY29ubmVjdGlvblJ1bm5pbmc6XG5cdFx0XHRcdFx0XHRjYXNlIFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlLlJlY29ubmVjdGlvbldhaXQ6XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2V0Q29ubmVjdGlvblN0YXRlKCdyZWNvbm5lY3RpbmcnKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlLlJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmU6XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2V0Q29ubmVjdGlvblN0YXRlKCdkaXNjb25uZWN0ZWQnKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlLkNvbm5lY3Rpb25HYWluOlxuXHRcdFx0XHRcdFx0XHR0aGlzLnNldENvbm5lY3Rpb25TdGF0ZSgnY29ubmVjdGVkJyk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbigpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVJlbW90ZVN0YXR1c0luZGljYXRvcigpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIE9ubGluZSAvIE9mZmxpbmUgY2hhbmdlcyAod2ViIG9ubHkpXG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21FbWl0dGVyKG1haW5XaW5kb3csICdvbmxpbmUnKSkuZXZlbnQsXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21FbWl0dGVyKG1haW5XaW5kb3csICdvZmZsaW5lJykpLmV2ZW50XG5cdFx0XHQpKCgpID0+IHRoaXMuc2V0TmV0d29ya1N0YXRlKG5hdmlnYXRvci5vbkxpbmUgPyAnb25saW5lJyA6ICdvZmZsaW5lJykpKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zKGFzeW5jIChyZXN1bHQpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZXh0IG9mIHJlc3VsdC5hZGRlZCkge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMucmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGEuZmluZEluZGV4KHZhbHVlID0+IEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHZhbHVlLmlkLCBleHQuaWRlbnRpZmllcikpO1xuXHRcdFx0XHRpZiAoaW5kZXggPiAtMSkge1xuXHRcdFx0XHRcdHRoaXMucmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGFbaW5kZXhdLmluc3RhbGxlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uKGFzeW5jIChyZXN1bHQpID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5yZW1vdGVFeHRlbnNpb25NZXRhZGF0YS5maW5kSW5kZXgodmFsdWUgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHModmFsdWUuaWQsIHJlc3VsdC5pZGVudGlmaWVyLmlkKSk7XG5cdFx0XHRpZiAoaW5kZXggPiAtMSkge1xuXHRcdFx0XHR0aGlzLnJlbW90ZUV4dGVuc2lvbk1ldGFkYXRhW2luZGV4XS5pbnN0YWxsZWQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluaXRpYWxpemVSZW1vdGVNZXRhZGF0YSgpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGlmICh0aGlzLnJlbW90ZU1ldGFkYXRhSW5pdGlhbGl6ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50UGxhdGZvcm0gPSBQbGF0Zm9ybVRvU3RyaW5nKHBsYXRmb3JtKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGEubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gdGhpcy5yZW1vdGVFeHRlbnNpb25NZXRhZGF0YVtpXS5pZDtcblx0XHRcdGNvbnN0IHN1cHBvcnRlZFBsYXRmb3JtcyA9IHRoaXMucmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGFbaV0uc3VwcG9ydGVkUGxhdGZvcm1zO1xuXHRcdFx0Y29uc3QgaXNJbnN0YWxsZWQgPSAoYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoKSkuZmluZCh2YWx1ZSA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh2YWx1ZS5pZGVudGlmaWVyLmlkLCBleHRlbnNpb25JZCkpID8gdHJ1ZSA6IGZhbHNlO1xuXG5cdFx0XHR0aGlzLnJlbW90ZUV4dGVuc2lvbk1ldGFkYXRhW2ldLmluc3RhbGxlZCA9IGlzSW5zdGFsbGVkO1xuXHRcdFx0aWYgKGlzSW5zdGFsbGVkKSB7XG5cdFx0XHRcdHRoaXMucmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGFbaV0uaXNQbGF0Zm9ybUNvbXBhdGlibGUgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoc3VwcG9ydGVkUGxhdGZvcm1zICYmICFzdXBwb3J0ZWRQbGF0Zm9ybXMuaW5jbHVkZXMoY3VycmVudFBsYXRmb3JtKSkge1xuXHRcdFx0XHR0aGlzLnJlbW90ZUV4dGVuc2lvbk1ldGFkYXRhW2ldLmlzUGxhdGZvcm1Db21wYXRpYmxlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0dGhpcy5yZW1vdGVFeHRlbnNpb25NZXRhZGF0YVtpXS5pc1BsYXRmb3JtQ29tcGF0aWJsZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW1vdGVNZXRhZGF0YUluaXRpYWxpemVkID0gdHJ1ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUVudHJpZXMuZmlyZSgpO1xuXHRcdHRoaXMudXBkYXRlUmVtb3RlU3RhdHVzSW5kaWNhdG9yKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbigpIHtcblx0XHR0aGlzLnZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbiA9IGdldFZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbih0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlV2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblxuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHRoaXMucmVtb3RlQXV0aG9yaXR5O1xuXHRcdGlmIChyZW1vdGVBdXRob3JpdHkpIHtcblxuXHRcdFx0Ly8gVHJ5IHRvIHJlc29sdmUgdGhlIGF1dGhvcml0eSB0byBmaWd1cmUgb3V0IGNvbm5lY3Rpb24gc3RhdGVcblx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBhdXRob3JpdHkgfSA9IGF3YWl0IHRoaXMucmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVBdXRob3JpdHkocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRcdFx0XHR0aGlzLmNvbm5lY3Rpb25Ub2tlbiA9IGF1dGhvcml0eS5jb25uZWN0aW9uVG9rZW47XG5cblx0XHRcdFx0XHR0aGlzLnNldENvbm5lY3Rpb25TdGF0ZSgnY29ubmVjdGVkJyk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRDb25uZWN0aW9uU3RhdGUoJ2Rpc2Nvbm5lY3RlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSgpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlUmVtb3RlU3RhdHVzSW5kaWNhdG9yKCk7XG5cdFx0dGhpcy5pbml0aWFsaXplUmVtb3RlTWV0YWRhdGEoKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0Q29ubmVjdGlvblN0YXRlKG5ld1N0YXRlOiAnZGlzY29ubmVjdGVkJyB8ICdjb25uZWN0ZWQnIHwgJ3JlY29ubmVjdGluZycpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb25uZWN0aW9uU3RhdGUgIT09IG5ld1N0YXRlKSB7XG5cdFx0XHR0aGlzLmNvbm5lY3Rpb25TdGF0ZSA9IG5ld1N0YXRlO1xuXG5cdFx0XHQvLyBzaW1wbGlmeSBjb250ZXh0IGtleSB3aGljaCBkb2Vzbid0IHN1cHBvcnQgYGNvbm5lY3RpbmdgXG5cdFx0XHRpZiAodGhpcy5jb25uZWN0aW9uU3RhdGUgPT09ICdyZWNvbm5lY3RpbmcnKSB7XG5cdFx0XHRcdHRoaXMuY29ubmVjdGlvblN0YXRlQ29udGV4dEtleS5zZXQoJ2Rpc2Nvbm5lY3RlZCcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jb25uZWN0aW9uU3RhdGVDb250ZXh0S2V5LnNldCh0aGlzLmNvbm5lY3Rpb25TdGF0ZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGluZGljYXRlIHN0YXR1c1xuXHRcdFx0dGhpcy51cGRhdGVSZW1vdGVTdGF0dXNJbmRpY2F0b3IoKTtcblxuXHRcdFx0Ly8gc3RhcnQgbWVhc3VyaW5nIGNvbm5lY3Rpb24gbGF0ZW5jeSBvbmNlIGNvbm5lY3RlZFxuXHRcdFx0aWYgKG5ld1N0YXRlID09PSAnY29ubmVjdGVkJykge1xuXHRcdFx0XHR0aGlzLnNjaGVkdWxlTWVhc3VyZU5ldHdvcmtDb25uZWN0aW9uTGF0ZW5jeSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVNZWFzdXJlTmV0d29ya0Nvbm5lY3Rpb25MYXRlbmN5KCk6IHZvaWQge1xuXHRcdGlmIChcblx0XHRcdCF0aGlzLnJlbW90ZUF1dGhvcml0eSB8fFx0XHRcdFx0XHRcdC8vIG9ubHkgd2hlbiBoYXZpbmcgYSByZW1vdGUgY29ubmVjdGlvblxuXHRcdFx0dGhpcy5tZWFzdXJlTmV0d29ya0Nvbm5lY3Rpb25MYXRlbmN5U2NoZWR1bGVyXHQvLyBhbHJlYWR5IHNjaGVkdWxlZFxuXHRcdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubWVhc3VyZU5ldHdvcmtDb25uZWN0aW9uTGF0ZW5jeVNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMubWVhc3VyZU5ldHdvcmtDb25uZWN0aW9uTGF0ZW5jeSgpLCBSZW1vdGVTdGF0dXNJbmRpY2F0b3IuUkVNT1RFX0NPTk5FQ1RJT05fTEFURU5DWV9TQ0hFRFVMRVJfREVMQVkpKTtcblx0XHR0aGlzLm1lYXN1cmVOZXR3b3JrQ29ubmVjdGlvbkxhdGVuY3lTY2hlZHVsZXIuc2NoZWR1bGUoUmVtb3RlU3RhdHVzSW5kaWNhdG9yLlJFTU9URV9DT05ORUNUSU9OX0xBVEVOQ1lfU0NIRURVTEVSX0ZJUlNUX1JVTl9ERUxBWSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1lYXN1cmVOZXR3b3JrQ29ubmVjdGlvbkxhdGVuY3koKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBNZWFzdXJlIGxhdGVuY3kgaWYgd2UgYXJlIG9ubGluZVxuXHRcdC8vIGJ1dCBvbmx5IHdoZW4gdGhlIHdpbmRvdyBoYXMgZm9jdXMgdG8gcHJldmVudCBjb25zdGFudGx5XG5cdFx0Ly8gd2FraW5nIHVwIHRoZSBjb25uZWN0aW9uIHRvIHRoZSByZW1vdGVcblxuXHRcdGlmICh0aGlzLmhvc3RTZXJ2aWNlLmhhc0ZvY3VzICYmIHRoaXMubmV0d29ya1N0YXRlICE9PSAnb2ZmbGluZScpIHtcblx0XHRcdGNvbnN0IG1lYXN1cmVtZW50ID0gYXdhaXQgcmVtb3RlQ29ubmVjdGlvbkxhdGVuY3lNZWFzdXJlci5tZWFzdXJlKHRoaXMucmVtb3RlQWdlbnRTZXJ2aWNlKTtcblx0XHRcdGlmIChtZWFzdXJlbWVudCkge1xuXHRcdFx0XHRpZiAobWVhc3VyZW1lbnQuaGlnaCkge1xuXHRcdFx0XHRcdHRoaXMuc2V0TmV0d29ya1N0YXRlKCdoaWdoLWxhdGVuY3knKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLm5ldHdvcmtTdGF0ZSA9PT0gJ2hpZ2gtbGF0ZW5jeScpIHtcblx0XHRcdFx0XHR0aGlzLnNldE5ldHdvcmtTdGF0ZSgnb25saW5lJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLm1lYXN1cmVOZXR3b3JrQ29ubmVjdGlvbkxhdGVuY3lTY2hlZHVsZXI/LnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIHNldE5ldHdvcmtTdGF0ZShuZXdTdGF0ZTogJ29ubGluZScgfCAnb2ZmbGluZScgfCAnaGlnaC1sYXRlbmN5Jyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm5ldHdvcmtTdGF0ZSAhPT0gbmV3U3RhdGUpIHtcblx0XHRcdGNvbnN0IG9sZFN0YXRlID0gdGhpcy5uZXR3b3JrU3RhdGU7XG5cdFx0XHR0aGlzLm5ldHdvcmtTdGF0ZSA9IG5ld1N0YXRlO1xuXG5cdFx0XHRpZiAobmV3U3RhdGUgPT09ICdoaWdoLWxhdGVuY3knKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBSZW1vdGUgbmV0d29yayBjb25uZWN0aW9uIGFwcGVhcnMgdG8gaGF2ZSBoaWdoIGxhdGVuY3kgKCR7cmVtb3RlQ29ubmVjdGlvbkxhdGVuY3lNZWFzdXJlci5sYXRlbmN5Py5jdXJyZW50Py50b0ZpeGVkKDIpfW1zIGxhc3QsICR7cmVtb3RlQ29ubmVjdGlvbkxhdGVuY3lNZWFzdXJlci5sYXRlbmN5Py5hdmVyYWdlPy50b0ZpeGVkKDIpfW1zIGF2ZXJhZ2UpYCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmNvbm5lY3Rpb25Ub2tlbikge1xuXHRcdFx0XHRpZiAobmV3U3RhdGUgPT09ICdvbmxpbmUnICYmIG9sZFN0YXRlID09PSAnaGlnaC1sYXRlbmN5Jykge1xuXHRcdFx0XHRcdHRoaXMubG9nTmV0d29ya0Nvbm5lY3Rpb25IZWFsdGhUZWxlbWV0cnkodGhpcy5jb25uZWN0aW9uVG9rZW4sICdnb29kJyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV3U3RhdGUgPT09ICdoaWdoLWxhdGVuY3knICYmIG9sZFN0YXRlID09PSAnb25saW5lJykge1xuXHRcdFx0XHRcdHRoaXMubG9nTmV0d29ya0Nvbm5lY3Rpb25IZWFsdGhUZWxlbWV0cnkodGhpcy5jb25uZWN0aW9uVG9rZW4sICdwb29yJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gdXBkYXRlIHN0YXR1c1xuXHRcdFx0dGhpcy51cGRhdGVSZW1vdGVTdGF0dXNJbmRpY2F0b3IoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxvZ05ldHdvcmtDb25uZWN0aW9uSGVhbHRoVGVsZW1ldHJ5KGNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nLCBjb25uZWN0aW9uSGVhbHRoOiAnZ29vZCcgfCAncG9vcicpOiB2b2lkIHtcblx0XHR0eXBlIFJlbW90ZUNvbm5lY3Rpb25IZWFsdGhDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnYWxleGRpbWEnO1xuXHRcdFx0Y29tbWVudDogJ1RoZSByZW1vdGUgY29ubmVjdGlvbiBoZWFsdGggaGFzIGNoYW5nZWQgKHJvdW5kIHRyaXAgdGltZSknO1xuXHRcdFx0cmVtb3RlTmFtZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBuYW1lIG9mIHRoZSByZXNvbHZlci4nIH07XG5cdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBpZGVudGlmaWVyIG9mIHRoZSBjb25uZWN0aW9uLicgfTtcblx0XHRcdGNvbm5lY3Rpb25IZWFsdGg6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgaGVhbHRoIG9mIHRoZSBjb25uZWN0aW9uOiBnb29kIG9yIHBvb3IuJyB9O1xuXHRcdH07XG5cdFx0dHlwZSBSZW1vdGVDb25uZWN0aW9uSGVhbHRoRXZlbnQgPSB7XG5cdFx0XHRyZW1vdGVOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nO1xuXHRcdFx0Y29ubmVjdGlvbkhlYWx0aDogJ2dvb2QnIHwgJ3Bvb3InO1xuXHRcdH07XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UmVtb3RlQ29ubmVjdGlvbkhlYWx0aEV2ZW50LCBSZW1vdGVDb25uZWN0aW9uSGVhbHRoQ2xhc3NpZmljYXRpb24+KCdyZW1vdGVDb25uZWN0aW9uSGVhbHRoJywge1xuXHRcdFx0cmVtb3RlTmFtZTogZ2V0UmVtb3RlTmFtZSh0aGlzLnJlbW90ZUF1dGhvcml0eSksXG5cdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogY29ubmVjdGlvblRva2VuLFxuXHRcdFx0Y29ubmVjdGlvbkhlYWx0aFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZWRHcm91cChncm91cDogc3RyaW5nKSB7XG5cdFx0aWYgKCFncm91cC5tYXRjaCgvXihyZW1vdGV8dmlydHVhbGZzKV8oXFxkXFxkKV8oKFthLXpdW2EtejAtOSsuLV0qKV8oLiopKSQvKSkge1xuXHRcdFx0aWYgKCF0aGlzLmxvZ2dlZEludmFsaWRHcm91cE5hbWVzW2dyb3VwXSkge1xuXHRcdFx0XHR0aGlzLmxvZ2dlZEludmFsaWRHcm91cE5hbWVzW2dyb3VwXSA9IHRydWU7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBJbnZhbGlkIGdyb3VwIG5hbWUgdXNlZCBpbiBcInN0YXR1c0Jhci9yZW1vdGVJbmRpY2F0b3JcIiBtZW51IGNvbnRyaWJ1dGlvbjogJHtncm91cH0uIEVudHJpZXMgaWdub3JlZC4gRXhwZWN0ZWQgZm9ybWF0OiAncmVtb3RlXyRPUkRFUl8kUkVNT1RFTkFNRV8kR1JPVVBJTkcgb3IgJ3ZpcnR1YWxmc18kT1JERVJfJEZJTEVTQ0hFTUVfJEdST1VQSU5HLmApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVtb3RlTWVudUFjdGlvbnMoZG9Ob3RVc2VDYWNoZT86IGJvb2xlYW4pOiBBY3Rpb25Hcm91cFtdIHtcblx0XHRpZiAoIXRoaXMucmVtb3RlTWVudUFjdGlvbnNHcm91cHMgfHwgZG9Ob3RVc2VDYWNoZSkge1xuXHRcdFx0dGhpcy5yZW1vdGVNZW51QWN0aW9uc0dyb3VwcyA9IHRoaXMucmVtb3RlSW5kaWNhdG9yTWVudS5nZXRBY3Rpb25zKCkuZmlsdGVyKGEgPT4gdGhpcy52YWxpZGF0ZWRHcm91cChhWzBdKSkuY29uY2F0KHRoaXMudW5yZXN0cmljdGVkUmVtb3RlSW5kaWNhdG9yTWVudS5nZXRBY3Rpb25zKCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5yZW1vdGVNZW51QWN0aW9uc0dyb3Vwcztcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmVtb3RlU3RhdHVzSW5kaWNhdG9yKCk6IHZvaWQge1xuXG5cdFx0Ly8gUmVtb3RlIEluZGljYXRvcjogc2hvdyBpZiBwcm92aWRlZCB2aWEgb3B0aW9ucywgZS5nLiBieSB0aGUgd2ViIGVtYmVkZGVyIEFQSVxuXHRcdGNvbnN0IHJlbW90ZUluZGljYXRvciA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LndpbmRvd0luZGljYXRvcjtcblx0XHRpZiAocmVtb3RlSW5kaWNhdG9yKSB7XG5cdFx0XHRsZXQgcmVtb3RlSW5kaWNhdG9yTGFiZWwgPSByZW1vdGVJbmRpY2F0b3IubGFiZWwudHJpbSgpO1xuXHRcdFx0aWYgKCFyZW1vdGVJbmRpY2F0b3JMYWJlbC5zdGFydHNXaXRoKCckKCcpKSB7XG5cdFx0XHRcdHJlbW90ZUluZGljYXRvckxhYmVsID0gYCQocmVtb3RlKSAke3JlbW90ZUluZGljYXRvckxhYmVsfWA7IC8vIGVuc3VyZSB0aGUgaW5kaWNhdG9yIGhhcyBhIGNvZGljb25cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5yZW5kZXJSZW1vdGVTdGF0dXNJbmRpY2F0b3IodHJ1bmNhdGUocmVtb3RlSW5kaWNhdG9yTGFiZWwsIFJlbW90ZVN0YXR1c0luZGljYXRvci5SRU1PVEVfU1RBVFVTX0xBQkVMX01BWF9MRU5HVEgpLCByZW1vdGVJbmRpY2F0b3IudG9vbHRpcCwgcmVtb3RlSW5kaWNhdG9yLmNvbW1hbmQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgZm9yIHJlbW90ZSB3aW5kb3dzIG9uIHRoZSBkZXNrdG9wXG5cdFx0aWYgKHRoaXMucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRjb25zdCBob3N0TGFiZWwgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRIb3N0TGFiZWwoU2NoZW1hcy52c2NvZGVSZW1vdGUsIHRoaXMucmVtb3RlQXV0aG9yaXR5KSB8fCB0aGlzLnJlbW90ZUF1dGhvcml0eTtcblx0XHRcdHN3aXRjaCAodGhpcy5jb25uZWN0aW9uU3RhdGUpIHtcblx0XHRcdFx0Y2FzZSAnaW5pdGlhbGl6aW5nJzpcblx0XHRcdFx0XHR0aGlzLnJlbmRlclJlbW90ZVN0YXR1c0luZGljYXRvcihubHMubG9jYWxpemUoJ2hvc3Qub3BlbicsIFwiT3BlbmluZyBSZW1vdGUuLi5cIiksIG5scy5sb2NhbGl6ZSgnaG9zdC5vcGVuJywgXCJPcGVuaW5nIFJlbW90ZS4uLlwiKSwgdW5kZWZpbmVkLCB0cnVlIC8qIHByb2dyZXNzICovKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAncmVjb25uZWN0aW5nJzpcblx0XHRcdFx0XHR0aGlzLnJlbmRlclJlbW90ZVN0YXR1c0luZGljYXRvcihgJHtubHMubG9jYWxpemUoJ2hvc3QucmVjb25uZWN0aW5nJywgXCJSZWNvbm5lY3RpbmcgdG8gezB9Li4uXCIsIHRydW5jYXRlKGhvc3RMYWJlbCwgUmVtb3RlU3RhdHVzSW5kaWNhdG9yLlJFTU9URV9TVEFUVVNfTEFCRUxfTUFYX0xFTkdUSCkpfWAsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlIC8qIHByb2dyZXNzICovKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnZGlzY29ubmVjdGVkJzpcblx0XHRcdFx0XHR0aGlzLnJlbmRlclJlbW90ZVN0YXR1c0luZGljYXRvcihgJChhbGVydCkgJHtubHMubG9jYWxpemUoJ2Rpc2Nvbm5lY3RlZEZyb20nLCBcIkRpc2Nvbm5lY3RlZCBmcm9tIHswfVwiLCB0cnVuY2F0ZShob3N0TGFiZWwsIFJlbW90ZVN0YXR1c0luZGljYXRvci5SRU1PVEVfU1RBVFVTX0xBQkVMX01BWF9MRU5HVEgpKX1gKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdGNvbnN0IHRvb2x0aXAgPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHsgaXNUcnVzdGVkOiB0cnVlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRcdFx0XHRjb25zdCBob3N0TmFtZVRvb2x0aXAgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRIb3N0VG9vbHRpcChTY2hlbWFzLnZzY29kZVJlbW90ZSwgdGhpcy5yZW1vdGVBdXRob3JpdHkpO1xuXHRcdFx0XHRcdGlmIChob3N0TmFtZVRvb2x0aXApIHtcblx0XHRcdFx0XHRcdHRvb2x0aXAuYXBwZW5kTWFya2Rvd24oaG9zdE5hbWVUb29sdGlwKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dG9vbHRpcC5hcHBlbmRUZXh0KG5scy5sb2NhbGl6ZSh7IGtleTogJ2hvc3QudG9vbHRpcCcsIGNvbW1lbnQ6IFsnezB9IGlzIGEgcmVtb3RlIGhvc3QgbmFtZSwgZS5nLiBEZXYgQ29udGFpbmVyJ10gfSwgXCJFZGl0aW5nIG9uIHswfVwiLCBob3N0TGFiZWwpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJSZW1vdGVTdGF0dXNJbmRpY2F0b3IoYCQocmVtb3RlKSAke3RydW5jYXRlKGhvc3RMYWJlbCwgUmVtb3RlU3RhdHVzSW5kaWNhdG9yLlJFTU9URV9TVEFUVVNfTEFCRUxfTUFYX0xFTkdUSCl9YCwgdG9vbHRpcCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gU2hvdyB3aGVuIGluIGEgdmlydHVhbCB3b3Jrc3BhY2Vcblx0XHRpZiAodGhpcy52aXJ0dWFsV29ya3NwYWNlTG9jYXRpb24pIHtcblxuXHRcdFx0Ly8gV29ya3NwYWNlIHdpdGggbGFiZWw6IGluZGljYXRlIGVkaXRpbmcgc291cmNlXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VMYWJlbCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldEhvc3RMYWJlbCh0aGlzLnZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbi5zY2hlbWUsIHRoaXMudmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uLmF1dGhvcml0eSk7XG5cdFx0XHRpZiAod29ya3NwYWNlTGFiZWwpIHtcblx0XHRcdFx0Y29uc3QgdG9vbHRpcCA9IG5ldyBNYXJrZG93blN0cmluZygnJywgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdFx0XHRjb25zdCBob3N0TmFtZVRvb2x0aXAgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRIb3N0VG9vbHRpcCh0aGlzLnZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbi5zY2hlbWUsIHRoaXMudmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uLmF1dGhvcml0eSk7XG5cdFx0XHRcdGlmIChob3N0TmFtZVRvb2x0aXApIHtcblx0XHRcdFx0XHR0b29sdGlwLmFwcGVuZE1hcmtkb3duKGhvc3ROYW1lVG9vbHRpcCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dG9vbHRpcC5hcHBlbmRUZXh0KG5scy5sb2NhbGl6ZSh7IGtleTogJ3dvcmtzcGFjZS50b29sdGlwJywgY29tbWVudDogWyd7MH0gaXMgYSByZW1vdGUgd29ya3NwYWNlIG5hbWUsIGUuZy4gR2l0SHViJ10gfSwgXCJFZGl0aW5nIG9uIHswfVwiLCB3b3Jrc3BhY2VMYWJlbCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghaXNXZWIgfHwgdGhpcy5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0XHR0b29sdGlwLmFwcGVuZE1hcmtkb3duKCdcXG5cXG4nKTtcblx0XHRcdFx0XHR0b29sdGlwLmFwcGVuZE1hcmtkb3duKG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHRcdHsga2V5OiAnd29ya3NwYWNlLnRvb2x0aXAyJywgY29tbWVudDogWydbZmVhdHVyZXMgYXJlIG5vdCBhdmFpbGFibGVdKHsxfSkgaXMgYSBsaW5rLiBPbmx5IHRyYW5zbGF0ZSBgZmVhdHVyZXMgYXJlIG5vdCBhdmFpbGFibGVgLiBEbyBub3QgY2hhbmdlIGJyYWNrZXRzIGFuZCBwYXJlbnRoZXNlcyBvciB7MH0nXSB9LFxuXHRcdFx0XHRcdFx0XCJTb21lIFtmZWF0dXJlcyBhcmUgbm90IGF2YWlsYWJsZV0oezB9KSBmb3IgcmVzb3VyY2VzIGxvY2F0ZWQgb24gYSB2aXJ0dWFsIGZpbGUgc3lzdGVtLlwiLFxuXHRcdFx0XHRcdFx0YGNvbW1hbmQ6JHtMSVNUX1dPUktTUEFDRV9VTlNVUFBPUlRFRF9FWFRFTlNJT05TX0NPTU1BTkRfSUR9YFxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMucmVuZGVyUmVtb3RlU3RhdHVzSW5kaWNhdG9yKGAkKHJlbW90ZSkgJHt0cnVuY2F0ZSh3b3Jrc3BhY2VMYWJlbCwgUmVtb3RlU3RhdHVzSW5kaWNhdG9yLlJFTU9URV9TVEFUVVNfTEFCRUxfTUFYX0xFTkdUSCl9YCwgdG9vbHRpcCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlclJlbW90ZVN0YXR1c0luZGljYXRvcihSZW1vdGVTdGF0dXNJbmRpY2F0b3IuREVGQVVMVF9SRU1PVEVfU1RBVFVTX0xBQkVMLCBubHMubG9jYWxpemUoJ25vSG9zdC50b29sdGlwJywgXCJPcGVuIGEgUmVtb3RlIFdpbmRvd1wiKSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJSZW1vdGVTdGF0dXNJbmRpY2F0b3IoaW5pdGlhbFRleHQ6IHN0cmluZywgaW5pdGlhbFRvb2x0aXA/OiBzdHJpbmcgfCBNYXJrZG93blN0cmluZywgY29tbWFuZD86IHN0cmluZywgc2hvd1Byb2dyZXNzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHsgdGV4dCwgdG9vbHRpcCwgYXJpYUxhYmVsIH0gPSB0aGlzLndpdGhOZXR3b3JrU3RhdHVzKGluaXRpYWxUZXh0LCBpbml0aWFsVG9vbHRpcCwgc2hvd1Byb2dyZXNzKTtcblxuXHRcdGNvbnN0IHByb3BlcnRpZXM6IElTdGF0dXNiYXJFbnRyeSA9IHtcblx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZSgncmVtb3RlSG9zdCcsIFwiUmVtb3RlIEhvc3RcIiksXG5cdFx0XHRraW5kOiB0aGlzLm5ldHdvcmtTdGF0ZSA9PT0gJ29mZmxpbmUnID8gJ29mZmxpbmUnIDogdGV4dCAhPT0gUmVtb3RlU3RhdHVzSW5kaWNhdG9yLkRFRkFVTFRfUkVNT1RFX1NUQVRVU19MQUJFTCA/ICdyZW1vdGUnIDogdW5kZWZpbmVkLCAvLyBvbmx5IGVtcGhhc2l6ZSB3aGVuIGFwcGxpY2FibGVcblx0XHRcdGFyaWFMYWJlbCxcblx0XHRcdHRleHQsXG5cdFx0XHRzaG93UHJvZ3Jlc3MsXG5cdFx0XHR0b29sdGlwLFxuXHRcdFx0Y29tbWFuZDogY29tbWFuZCA/PyBSZW1vdGVTdGF0dXNJbmRpY2F0b3IuUkVNT1RFX0FDVElPTlNfQ09NTUFORF9JRFxuXHRcdH07XG5cblx0XHRpZiAodGhpcy5yZW1vdGVTdGF0dXNFbnRyeSkge1xuXHRcdFx0dGhpcy5yZW1vdGVTdGF0dXNFbnRyeS51cGRhdGUocHJvcGVydGllcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVtb3RlU3RhdHVzRW50cnkgPSB0aGlzLnN0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkocHJvcGVydGllcywgJ3N0YXR1cy5ob3N0JywgU3RhdHVzYmFyQWxpZ25tZW50LkxFRlQsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSAvKiBmaXJzdCBlbnRyeSAqLyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB3aXRoTmV0d29ya1N0YXR1cyhpbml0aWFsVGV4dDogc3RyaW5nLCBpbml0aWFsVG9vbHRpcD86IHN0cmluZyB8IE1hcmtkb3duU3RyaW5nLCBzaG93UHJvZ3Jlc3M/OiBib29sZWFuKTogeyB0ZXh0OiBzdHJpbmc7IHRvb2x0aXA6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDsgYXJpYUxhYmVsOiBzdHJpbmcgfSB7XG5cdFx0bGV0IHRleHQgPSBpbml0aWFsVGV4dDtcblx0XHRsZXQgdG9vbHRpcCA9IGluaXRpYWxUb29sdGlwO1xuXHRcdGxldCBhcmlhTGFiZWwgPSBnZXRDb2RpY29uQXJpYUxhYmVsKHRleHQpO1xuXG5cdFx0ZnVuY3Rpb24gdGV4dFdpdGhBbGVydCgpOiBzdHJpbmcge1xuXG5cdFx0XHQvLyBgaW5pdGlhbFRleHRgIGNhbiBoYXZlIGEgY29kaWNvbiBpbiB0aGUgYmVnaW5uaW5nIHRoYXQgYWxyZWFkeVxuXHRcdFx0Ly8gaW5kaWNhdGVzIHNvbWUga2luZCBvZiBzdGF0dXMsIG9yIHdlIG1heSBoYXZlIGJlZW4gYXNrZWQgdG9cblx0XHRcdC8vIHNob3cgcHJvZ3Jlc3MsIHdoZXJlIGEgc3Bpbm5pbmcgY29kaWNvbiBhcHBlYXJzLiB3ZSBvbmx5IHdhbnRcblx0XHRcdC8vIHRvIHJlcGxhY2Ugd2l0aCBhbiBhbGVydCBpY29uIGZvciB3aGVuIGEgbm9ybWFsIHJlbW90ZSBpbmRpY2F0b3Jcblx0XHRcdC8vIGlzIHNob3duLlxuXG5cdFx0XHRpZiAoIXNob3dQcm9ncmVzcyAmJiBpbml0aWFsVGV4dC5zdGFydHNXaXRoKFJlbW90ZVN0YXR1c0luZGljYXRvci5ERUZBVUxUX1JFTU9URV9TVEFUVVNfTEFCRUwpKSB7XG5cdFx0XHRcdHJldHVybiBpbml0aWFsVGV4dC5yZXBsYWNlKFJlbW90ZVN0YXR1c0luZGljYXRvci5ERUZBVUxUX1JFTU9URV9TVEFUVVNfTEFCRUwsICckKGFsZXJ0KScpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaW5pdGlhbFRleHQ7XG5cdFx0fVxuXG5cdFx0c3dpdGNoICh0aGlzLm5ldHdvcmtTdGF0ZSkge1xuXHRcdFx0Y2FzZSAnb2ZmbGluZSc6IHtcblx0XHRcdFx0Y29uc3Qgb2ZmbGluZU1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ25ldHdvcmtTdGF0dXNPZmZsaW5lVG9vbHRpcCcsIFwiTmV0d29yayBhcHBlYXJzIHRvIGJlIG9mZmxpbmUsIGNlcnRhaW4gZmVhdHVyZXMgbWlnaHQgYmUgdW5hdmFpbGFibGUuXCIpO1xuXG5cdFx0XHRcdHRleHQgPSB0ZXh0V2l0aEFsZXJ0KCk7XG5cdFx0XHRcdHRvb2x0aXAgPSB0aGlzLmFwcGVuZFRvb2x0aXBMaW5lKHRvb2x0aXAsIG9mZmxpbmVNZXNzYWdlKTtcblx0XHRcdFx0YXJpYUxhYmVsID0gYCR7YXJpYUxhYmVsfSwgJHtvZmZsaW5lTWVzc2FnZX1gO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2hpZ2gtbGF0ZW5jeSc6XG5cdFx0XHRcdHRleHQgPSB0ZXh0V2l0aEFsZXJ0KCk7XG5cdFx0XHRcdHRvb2x0aXAgPSB0aGlzLmFwcGVuZFRvb2x0aXBMaW5lKHRvb2x0aXAsIG5scy5sb2NhbGl6ZSgnbmV0d29ya1N0YXR1c0hpZ2hMYXRlbmN5VG9vbHRpcCcsIFwiTmV0d29yayBhcHBlYXJzIHRvIGhhdmUgaGlnaCBsYXRlbmN5ICh7MH1tcyBsYXN0LCB7MX1tcyBhdmVyYWdlKSwgY2VydGFpbiBmZWF0dXJlcyBtYXkgYmUgc2xvdyB0byByZXNwb25kLlwiLCByZW1vdGVDb25uZWN0aW9uTGF0ZW5jeU1lYXN1cmVyLmxhdGVuY3k/LmN1cnJlbnQ/LnRvRml4ZWQoMiksIHJlbW90ZUNvbm5lY3Rpb25MYXRlbmN5TWVhc3VyZXIubGF0ZW5jeT8uYXZlcmFnZT8udG9GaXhlZCgyKSkpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4geyB0ZXh0LCB0b29sdGlwLCBhcmlhTGFiZWwgfTtcblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kVG9vbHRpcExpbmUodG9vbHRpcDogc3RyaW5nIHwgTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQsIGxpbmU6IHN0cmluZyk6IE1hcmtkb3duU3RyaW5nIHtcblx0XHRsZXQgbWFya2Rvd25Ub29sdGlwOiBNYXJrZG93blN0cmluZztcblx0XHRpZiAodHlwZW9mIHRvb2x0aXAgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRtYXJrZG93blRvb2x0aXAgPSBuZXcgTWFya2Rvd25TdHJpbmcodG9vbHRpcCwgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtYXJrZG93blRvb2x0aXAgPSB0b29sdGlwID8/IG5ldyBNYXJrZG93blN0cmluZygnJywgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdGlmIChtYXJrZG93blRvb2x0aXAudmFsdWUubGVuZ3RoID4gMCkge1xuXHRcdFx0bWFya2Rvd25Ub29sdGlwLmFwcGVuZE1hcmtkb3duKCdcXG5cXG4nKTtcblx0XHR9XG5cblx0XHRtYXJrZG93blRvb2x0aXAuYXBwZW5kTWFya2Rvd24obGluZSk7XG5cblx0XHRyZXR1cm4gbWFya2Rvd25Ub29sdGlwO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbnN0YWxsRXh0ZW5zaW9uKGV4dGVuc2lvbklkOiBzdHJpbmcsIHJlbW90ZUxhYmVsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKGV4dGVuc2lvbklkLCB7XG5cdFx0XHRcdGlzTWFjaGluZVNjb3BlZDogZmFsc2UsXG5cdFx0XHRcdGRvbm90SW5jbHVkZVBhY2tBbmREZXBlbmRlbmNpZXM6IGZhbHNlLFxuXHRcdFx0XHRjb250ZXh0OiB7IFtFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1dBTEtUSFJPVUdIX0NPTlRFWFRdOiB0cnVlIH1cblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoIXRoaXMubGlmZWN5Y2xlU2VydmljZS53aWxsU2h1dGRvd24pIHtcblx0XHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3Vua25vd25TZXR1cEVycm9yJywgXCJBbiBlcnJvciBvY2N1cnJlZCB3aGlsZSBzZXR0aW5nIHVwIHswfS4gV291bGQgeW91IGxpa2UgdG8gdHJ5IGFnYWluP1wiLCByZW1vdGVMYWJlbCksXG5cdFx0XHRcdFx0ZGV0YWlsOiBlcnJvciAmJiAhaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikgPyB0b0Vycm9yTWVzc2FnZShlcnJvcikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKCdyZXRyeScsIFwiUmV0cnlcIilcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChjb25maXJtZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YWxsRXh0ZW5zaW9uKGV4dGVuc2lvbklkLCByZW1vdGVMYWJlbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcnVuUmVtb3RlU3RhcnRDb21tYW5kKGV4dGVuc2lvbklkOiBzdHJpbmcsIHN0YXJ0Q29tbWFuZDogc3RyaW5nKSB7XG5cblx0XHQvLyBjaGVjayB0byBlbnN1cmUgdGhlIGV4dGVuc2lvbiBpcyBpbnN0YWxsZWRcblx0XHRhd2FpdCByZXRyeShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBleHQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uKGV4dGVuc2lvbklkKTtcblx0XHRcdGlmICghZXh0KSB7XG5cdFx0XHRcdHRocm93IEVycm9yKCdGYWlsZWQgdG8gZmluZCBpbnN0YWxsZWQgcmVtb3RlIGV4dGVuc2lvbicpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGV4dDtcblx0XHR9LCAzMDAsIDEwKTtcblxuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoc3RhcnRDb21tYW5kKTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7XG5cdFx0XHRpZDogJ3JlbW90ZUluc3RhbGxBbmRSdW4nLFxuXHRcdFx0ZGV0YWlsOiBleHRlbnNpb25JZCxcblx0XHRcdGZyb206ICdyZW1vdGUgaW5kaWNhdG9yJ1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93UmVtb3RlTWVudSgpIHtcblx0XHRjb25zdCBnZXRDYXRlZ29yeUxhYmVsID0gKGFjdGlvbjogTWVudUl0ZW1BY3Rpb24pID0+IHtcblx0XHRcdGlmIChhY3Rpb24uaXRlbS5jYXRlZ29yeSkge1xuXHRcdFx0XHRyZXR1cm4gdHlwZW9mIGFjdGlvbi5pdGVtLmNhdGVnb3J5ID09PSAnc3RyaW5nJyA/IGFjdGlvbi5pdGVtLmNhdGVnb3J5IDogYWN0aW9uLml0ZW0uY2F0ZWdvcnkudmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHRjb25zdCBtYXRjaEN1cnJlbnRSZW1vdGUgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBSZWdFeHAoYF5yZW1vdGVfXFxcXGRcXFxcZF8ke2dldFJlbW90ZU5hbWUodGhpcy5yZW1vdGVBdXRob3JpdHkpfV9gKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy52aXJ0dWFsV29ya3NwYWNlTG9jYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBSZWdFeHAoYF52aXJ0dWFsZnNfXFxcXGRcXFxcZF8ke3RoaXMudmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uLnNjaGVtZX1fYCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHRjb25zdCBjb21wdXRlSXRlbXMgPSAoKSA9PiB7XG5cdFx0XHRsZXQgYWN0aW9uR3JvdXBzID0gdGhpcy5nZXRSZW1vdGVNZW51QWN0aW9ucyh0cnVlKTtcblxuXHRcdFx0Y29uc3QgaXRlbXM6IFF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBjdXJyZW50UmVtb3RlTWF0Y2hlciA9IG1hdGNoQ3VycmVudFJlbW90ZSgpO1xuXHRcdFx0aWYgKGN1cnJlbnRSZW1vdGVNYXRjaGVyKSB7XG5cdFx0XHRcdC8vIGNvbW1hbmRzIGZvciB0aGUgY3VycmVudCByZW1vdGUgZ28gZmlyc3Rcblx0XHRcdFx0YWN0aW9uR3JvdXBzID0gYWN0aW9uR3JvdXBzLnNvcnQoKGcxLCBnMikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGlzQ3VycmVudFJlbW90ZTEgPSBjdXJyZW50UmVtb3RlTWF0Y2hlci50ZXN0KGcxWzBdKTtcblx0XHRcdFx0XHRjb25zdCBpc0N1cnJlbnRSZW1vdGUyID0gY3VycmVudFJlbW90ZU1hdGNoZXIudGVzdChnMlswXSk7XG5cdFx0XHRcdFx0aWYgKGlzQ3VycmVudFJlbW90ZTEgIT09IGlzQ3VycmVudFJlbW90ZTIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBpc0N1cnJlbnRSZW1vdGUxID8gLTEgOiAxO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBsZWdhY3kgaW5kaWNhdG9yIGNvbW1hbmRzIGdvIGxhc3Rcblx0XHRcdFx0XHRpZiAoZzFbMF0gIT09ICcnICYmIGcyWzBdID09PSAnJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZzFbMF0gPT09ICcnICYmIGcyWzBdICE9PSAnJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBnMVswXS5sb2NhbGVDb21wYXJlKGcyWzBdKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBsYXN0Q2F0ZWdvcnlOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdGZvciAoY29uc3QgYWN0aW9uR3JvdXAgb2YgYWN0aW9uR3JvdXBzKSB7XG5cdFx0XHRcdGxldCBoYXNHcm91cENhdGVnb3J5ID0gZmFsc2U7XG5cdFx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbkdyb3VwWzFdKSB7XG5cdFx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRpZiAoIWhhc0dyb3VwQ2F0ZWdvcnkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2F0ZWdvcnkgPSBnZXRDYXRlZ29yeUxhYmVsKGFjdGlvbik7XG5cdFx0XHRcdFx0XHRcdGlmIChjYXRlZ29yeSAhPT0gbGFzdENhdGVnb3J5TmFtZSkge1xuXHRcdFx0XHRcdFx0XHRcdGl0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGNhdGVnb3J5IH0pO1xuXHRcdFx0XHRcdFx0XHRcdGxhc3RDYXRlZ29yeU5hbWUgPSBjYXRlZ29yeTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRoYXNHcm91cENhdGVnb3J5ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gdHlwZW9mIGFjdGlvbi5pdGVtLnRpdGxlID09PSAnc3RyaW5nJyA/IGFjdGlvbi5pdGVtLnRpdGxlIDogYWN0aW9uLml0ZW0udGl0bGUudmFsdWU7XG5cdFx0XHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2l0ZW0nLFxuXHRcdFx0XHRcdFx0XHRpZDogYWN0aW9uLml0ZW0uaWQsXG5cdFx0XHRcdFx0XHRcdGxhYmVsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2hvd0V4dGVuc2lvblJlY29tbWVuZGF0aW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3dvcmtiZW5jaC5yZW1vdGVJbmRpY2F0b3Iuc2hvd0V4dGVuc2lvblJlY29tbWVuZGF0aW9ucycpO1xuXHRcdFx0aWYgKHNob3dFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMgJiYgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5pc0VuYWJsZWQoKSAmJiB0aGlzLnJlbW90ZU1ldGFkYXRhSW5pdGlhbGl6ZWQpIHtcblxuXHRcdFx0XHRjb25zdCBub3RJbnN0YWxsZWRJdGVtczogUXVpY2tQaWNrSXRlbVtdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgbWV0YWRhdGEgb2YgdGhpcy5yZW1vdGVFeHRlbnNpb25NZXRhZGF0YSkge1xuXHRcdFx0XHRcdGlmICghbWV0YWRhdGEuaW5zdGFsbGVkICYmIG1ldGFkYXRhLmlzUGxhdGZvcm1Db21wYXRpYmxlKSB7XG5cdFx0XHRcdFx0XHQvLyBDcmVhdGUgSW5zdGFsbCBRdWlja1BpY2sgd2l0aCBhIGhlbHAgbGlua1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBtZXRhZGF0YS5zdGFydENvbm5lY3RMYWJlbDtcblx0XHRcdFx0XHRcdGNvbnN0IGJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbe1xuXHRcdFx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpbmZvSWNvbiksXG5cdFx0XHRcdFx0XHRcdHRvb2x0aXA6IG5scy5sb2NhbGl6ZSgncmVtb3RlLnN0YXJ0QWN0aW9ucy5oZWxwJywgXCJMZWFybiBNb3JlXCIpXG5cdFx0XHRcdFx0XHR9XTtcblx0XHRcdFx0XHRcdG5vdEluc3RhbGxlZEl0ZW1zLnB1c2goeyB0eXBlOiAnaXRlbScsIGlkOiBtZXRhZGF0YS5pZCwgbGFiZWw6IGxhYmVsLCBidXR0b25zOiBidXR0b25zIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbmxzLmxvY2FsaXplKCdyZW1vdGUuc3RhcnRBY3Rpb25zLmluc3RhbGwnLCAnSW5zdGFsbCcpXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpdGVtcy5wdXNoKC4uLm5vdEluc3RhbGxlZEl0ZW1zKTtcblx0XHRcdH1cblxuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdHR5cGU6ICdzZXBhcmF0b3InXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZW50cmllc0JlZm9yZUNvbmZpZyA9IGl0ZW1zLmxlbmd0aDtcblxuXHRcdFx0aWYgKFJlbW90ZVN0YXR1c0luZGljYXRvci5TSE9XX0NMT1NFX1JFTU9URV9DT01NQU5EX0lEKSB7XG5cdFx0XHRcdGlmICh0aGlzLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0dHlwZTogJ2l0ZW0nLFxuXHRcdFx0XHRcdFx0aWQ6IFJlbW90ZVN0YXR1c0luZGljYXRvci5DTE9TRV9SRU1PVEVfQ09NTUFORF9JRCxcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2Nsb3NlUmVtb3RlQ29ubmVjdGlvbi50aXRsZScsICdDbG9zZSBSZW1vdGUgQ29ubmVjdGlvbicpXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRpZiAodGhpcy5jb25uZWN0aW9uU3RhdGUgPT09ICdkaXNjb25uZWN0ZWQnKSB7XG5cdFx0XHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2l0ZW0nLFxuXHRcdFx0XHRcdFx0XHRpZDogUmVsb2FkV2luZG93QWN0aW9uLklELFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZWxvYWRXaW5kb3cnLCAnUmVsb2FkIFdpbmRvdycpXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy52aXJ0dWFsV29ya3NwYWNlTG9jYXRpb24pIHtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdHR5cGU6ICdpdGVtJyxcblx0XHRcdFx0XHRcdGlkOiBSZW1vdGVTdGF0dXNJbmRpY2F0b3IuQ0xPU0VfUkVNT1RFX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdjbG9zZVZpcnR1YWxXb3Jrc3BhY2UudGl0bGUnLCAnQ2xvc2UgUmVtb3RlIFdvcmtzcGFjZScpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gZW50cmllc0JlZm9yZUNvbmZpZykge1xuXHRcdFx0XHRpdGVtcy5wb3AoKTsgLy8gcmVtb3ZlIHRoZSBzZXBhcmF0b3IgYWdhaW5cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGl0ZW1zO1xuXHRcdH07XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxdWlja1BpY2sgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2soeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBubHMubG9jYWxpemUoJ3JlbW90ZUFjdGlvbnMnLCBcIlNlbGVjdCBhbiBvcHRpb24gdG8gb3BlbiBhIFJlbW90ZSBXaW5kb3dcIik7XG5cdFx0cXVpY2tQaWNrLml0ZW1zID0gY29tcHV0ZUl0ZW1zKCk7XG5cdFx0cXVpY2tQaWNrLnNvcnRCeUxhYmVsID0gZmFsc2U7XG5cdFx0cXVpY2tQaWNrLmNhblNlbGVjdE1hbnkgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQub25jZShxdWlja1BpY2sub25EaWRBY2NlcHQpKChhc3luYyBfID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkSXRlbXMgPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtcztcblx0XHRcdGlmIChzZWxlY3RlZEl0ZW1zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kSWQgPSBzZWxlY3RlZEl0ZW1zWzBdLmlkITtcblx0XHRcdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9uID0gdGhpcy5yZW1vdGVFeHRlbnNpb25NZXRhZGF0YS5maW5kKHZhbHVlID0+IEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHZhbHVlLmlkLCBjb21tYW5kSWQpKTtcblx0XHRcdFx0aWYgKHJlbW90ZUV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHF1aWNrUGljay5pdGVtcyA9IFtdO1xuXHRcdFx0XHRcdHF1aWNrUGljay5idXN5ID0gdHJ1ZTtcblx0XHRcdFx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBubHMubG9jYWxpemUoJ3JlbW90ZS5zdGFydEFjdGlvbnMuaW5zdGFsbGluZ0V4dGVuc2lvbicsICdJbnN0YWxsaW5nIGV4dGVuc2lvbi4uLiAnKTtcblxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbGxFeHRlbnNpb24ocmVtb3RlRXh0ZW5zaW9uLmlkLCBzZWxlY3RlZEl0ZW1zWzBdLmxhYmVsKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJ1blJlbW90ZVN0YXJ0Q29tbWFuZChyZW1vdGVFeHRlbnNpb24uaWQsIHJlbW90ZUV4dGVuc2lvbi5zdGFydENvbW1hbmQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHtcblx0XHRcdFx0XHRcdGlkOiBjb21tYW5kSWQsXG5cdFx0XHRcdFx0XHRmcm9tOiAncmVtb3RlIGluZGljYXRvcidcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZCk7XG5cdFx0XHRcdFx0cXVpY2tQaWNrLmhpZGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQub25jZShxdWlja1BpY2sub25EaWRUcmlnZ2VySXRlbUJ1dHRvbikoYXN5bmMgKGUpID0+IHtcblx0XHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbiA9IHRoaXMucmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGEuZmluZCh2YWx1ZSA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh2YWx1ZS5pZCwgZS5pdGVtLmlkKSk7XG5cdFx0XHRpZiAocmVtb3RlRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShyZW1vdGVFeHRlbnNpb24uaGVscExpbmspKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyByZWZyZXNoIHRoZSBpdGVtcyB3aGVuIGFjdGlvbnMgY2hhbmdlXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMudW5yZXN0cmljdGVkUmVtb3RlSW5kaWNhdG9yTWVudS5vbkRpZENoYW5nZSgoKSA9PiBxdWlja1BpY2suaXRlbXMgPSBjb21wdXRlSXRlbXMoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnJlbW90ZUluZGljYXRvck1lbnUub25EaWRDaGFuZ2UoKCkgPT4gcXVpY2tQaWNrLml0ZW1zID0gY29tcHV0ZUl0ZW1zKCkpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXG5cdFx0aWYgKCF0aGlzLnJlbW90ZU1ldGFkYXRhSW5pdGlhbGl6ZWQpIHtcblx0XHRcdHF1aWNrUGljay5idXN5ID0gdHJ1ZTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ2hhbmdlRW50cmllcygoKSA9PiB7XG5cdFx0XHRcdC8vIElmIHF1aWNrIHBpY2sgaXMgb3BlbiwgdXBkYXRlIHRoZSBxdWljayBwaWNrIGl0ZW1zIGFmdGVyIGluaXRpYWxpemF0aW9uLlxuXHRcdFx0XHRxdWlja1BpY2suYnVzeSA9IGZhbHNlO1xuXHRcdFx0XHRxdWlja1BpY2suaXRlbXMgPSBjb21wdXRlSXRlbXMoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRxdWlja1BpY2suc2hvdygpO1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdC4uLndvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHQnd29ya2JlbmNoLnJlbW90ZUluZGljYXRvci5zaG93RXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zJzoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncmVtb3RlLnNob3dFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMnLCBcIldoZW4gZW5hYmxlZCwgcmVtb3RlIGV4dGVuc2lvbnMgcmVjb21tZW5kYXRpb25zIHdpbGwgYmUgc2hvd24gaW4gdGhlIFJlbW90ZSBJbmRpY2F0b3IgbWVudS5cIiksXG5cdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdH0sXG5cdFx0fVxuXHR9KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMscUJBQXFCLHVDQUF1QztBQUNyRSxTQUFTLGtCQUFrQixhQUFhO0FBQ3hDLFNBQVMsU0FBUyxhQUFh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
