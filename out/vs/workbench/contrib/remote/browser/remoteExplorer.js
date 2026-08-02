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
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Extensions, ViewContainerLocation } from "../../../common/views.js";
import { IRemoteExplorerService, PORT_AUTO_FALLBACK_SETTING, PORT_AUTO_FORWARD_SETTING, PORT_AUTO_SOURCE_SETTING, PORT_AUTO_SOURCE_SETTING_HYBRID, PORT_AUTO_SOURCE_SETTING_OUTPUT, PORT_AUTO_SOURCE_SETTING_PROCESS, PortsEnablement, TUNNEL_VIEW_CONTAINER_ID, TUNNEL_VIEW_ID } from "../../../services/remote/common/remoteExplorerService.js";
import { AutoTunnelSource, forwardedPortsFeaturesEnabled, forwardedPortsViewEnabled, makeAddress, mapHasAddressLocalhostOrAllInterfaces, OnPortForward, TunnelCloseReason, TunnelSource } from "../../../services/remote/common/tunnelModel.js";
import { ForwardPortAction, OpenPortInBrowserAction, TunnelPanel, TunnelPanelDescriptor, TunnelViewModel, OpenPortInPreviewAction, openPreviewEnabledContext } from "./tunnelView.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
import { UrlFinder } from "./urlFinder.js";
import Severity from "../../../../base/common/severity.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ITerminalService } from "../../terminal/browser/terminal.js";
import { IDebugService } from "../../debug/common/debug.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { isWeb, OperatingSystem } from "../../../../base/common/platform.js";
import { isAllInterfaces, isLocalhost, ITunnelService, TunnelPrivacyId } from "../../../../platform/tunnel/common/tunnel.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { IActivityService, NumberBadge } from "../../../services/activity/common/activity.js";
import { portsViewIcon } from "./remoteIcons.js";
import { Event } from "../../../../base/common/event.js";
import { IExternalUriOpenerService } from "../../externalUriOpener/common/externalUriOpenerService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { toAction } from "../../../../base/common/actions.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
const VIEWLET_ID = "workbench.view.remote";
const TOGGLE_VIEW_ACTION_ID = "remoteExplorer.toggleForwardedPortsView";
function isCandidateRemappedTunnelLocalEndpoint(candidate, tunnels) {
  if (!isLocalhost(candidate.host) && !isAllInterfaces(candidate.host)) {
    return false;
  }
  for (const tunnel of tunnels) {
    if (tunnel.localPort === candidate.port && tunnel.remotePort !== candidate.port) {
      return true;
    }
  }
  return false;
}
let ForwardedPortsView = class extends Disposable {
  constructor(contextKeyService, environmentService, remoteExplorerService, tunnelService, activityService, statusbarService) {
    super();
    this.contextKeyService = contextKeyService;
    this.environmentService = environmentService;
    this.remoteExplorerService = remoteExplorerService;
    this.tunnelService = tunnelService;
    this.activityService = activityService;
    this.statusbarService = statusbarService;
    this.contextKeyListener = this._register(new MutableDisposable());
    this.activityBadge = this._register(new MutableDisposable());
    this.hasPortsInSession = false;
    this._register(Registry.as(Extensions.ViewsRegistry).registerViewWelcomeContent(TUNNEL_VIEW_ID, {
      content: this.environmentService.remoteAuthority ? nls.localize("remoteNoPorts", "No forwarded ports. Forward a port to access your running services locally.\n[Forward a Port]({0})", `command:${ForwardPortAction.INLINE_ID}`) : nls.localize("noRemoteNoPorts", "No forwarded ports. Forward a port to access your locally running services over the internet.\n[Forward a Port]({0})", `command:${ForwardPortAction.INLINE_ID}`)
    }));
    this.enableBadgeAndStatusBar();
    this.enableForwardedPortsFeatures();
    if (!this.environmentService.remoteAuthority) {
      this._register(Event.once(this.tunnelService.onTunnelOpened)(() => {
        this.hasPortsInSession = true;
      }));
    }
  }
  async getViewContainer() {
    return Registry.as(Extensions.ViewContainersRegistry).registerViewContainer({
      id: TUNNEL_VIEW_CONTAINER_ID,
      title: nls.localize2("ports", "Ports"),
      icon: portsViewIcon,
      ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [TUNNEL_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
      storageId: TUNNEL_VIEW_CONTAINER_ID,
      hideIfEmpty: true,
      order: 5
    }, ViewContainerLocation.Panel);
  }
  async enableForwardedPortsFeatures() {
    this.contextKeyListener.clear();
    const featuresEnabled = !!forwardedPortsFeaturesEnabled.getValue(this.contextKeyService);
    const viewEnabled = !!forwardedPortsViewEnabled.getValue(this.contextKeyService);
    if (featuresEnabled || viewEnabled) {
      if (!viewEnabled) {
        this.contextKeyService.createKey(forwardedPortsViewEnabled.key, true);
      }
      const viewContainer = await this.getViewContainer();
      const tunnelPanelDescriptor = new TunnelPanelDescriptor(new TunnelViewModel(this.remoteExplorerService, this.tunnelService), this.environmentService);
      const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
      if (viewContainer) {
        this.remoteExplorerService.enablePortsFeatures(!featuresEnabled);
        viewsRegistry.registerViews([tunnelPanelDescriptor], viewContainer);
      }
    } else {
      this.contextKeyListener.value = this.contextKeyService.onDidChangeContext((e) => {
        if (e.affectsSome(/* @__PURE__ */ new Set([...forwardedPortsFeaturesEnabled.keys(), ...forwardedPortsViewEnabled.keys()]))) {
          this.enableForwardedPortsFeatures();
        }
      });
    }
  }
  enableBadgeAndStatusBar() {
    const disposable = Registry.as(Extensions.ViewsRegistry).onViewsRegistered((e) => {
      if (e.find((view) => view.views.find((viewDescriptor) => viewDescriptor.id === TUNNEL_VIEW_ID))) {
        this._register(Event.debounce(this.remoteExplorerService.tunnelModel.onForwardPort, (_last, e2) => e2, 50)(() => {
          this.updateActivityBadge();
          this.updateStatusBar();
        }));
        this._register(Event.debounce(this.remoteExplorerService.tunnelModel.onClosePort, (_last, e2) => e2, 50)(() => {
          this.updateActivityBadge();
          this.updateStatusBar();
        }));
        this.updateActivityBadge();
        this.updateStatusBar();
        disposable.dispose();
      }
    });
  }
  async updateActivityBadge() {
    if (this.remoteExplorerService.tunnelModel.forwarded.size > 0) {
      this.activityBadge.value = this.activityService.showViewActivity(TUNNEL_VIEW_ID, {
        badge: new NumberBadge(this.remoteExplorerService.tunnelModel.forwarded.size, (n) => n === 1 ? nls.localize("1forwardedPort", "1 forwarded port") : nls.localize("nForwardedPorts", "{0} forwarded ports", n))
      });
    } else {
      this.activityBadge.clear();
    }
  }
  updateStatusBar() {
    if (!this.environmentService.remoteAuthority && !this.hasPortsInSession) {
      return;
    }
    if (!this.entryAccessor) {
      this._register(this.entryAccessor = this.statusbarService.addEntry(this.entry, "status.forwardedPorts", StatusbarAlignment.LEFT, 40));
    } else {
      this.entryAccessor.update(this.entry);
    }
  }
  get entry() {
    let tooltip;
    const count = this.remoteExplorerService.tunnelModel.forwarded.size + this.remoteExplorerService.tunnelModel.detected.size;
    const text = `${count}`;
    if (count === 0) {
      tooltip = nls.localize("remote.forwardedPorts.statusbarTextNone", "No Ports Forwarded");
    } else {
      const allTunnels = Array.from(this.remoteExplorerService.tunnelModel.forwarded.values());
      allTunnels.push(...Array.from(this.remoteExplorerService.tunnelModel.detected.values()));
      tooltip = nls.localize(
        "remote.forwardedPorts.statusbarTooltip",
        "Forwarded Ports: {0}",
        allTunnels.map((forwarded) => forwarded.remotePort).join(", ")
      );
    }
    return {
      name: nls.localize("status.forwardedPorts", "Forwarded Ports"),
      text: `$(radio-tower) ${text}`,
      ariaLabel: tooltip,
      tooltip,
      command: TOGGLE_VIEW_ACTION_ID
    };
  }
};
ForwardedPortsView = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IWorkbenchEnvironmentService),
  __decorateParam(2, IRemoteExplorerService),
  __decorateParam(3, ITunnelService),
  __decorateParam(4, IActivityService),
  __decorateParam(5, IStatusbarService)
], ForwardedPortsView);
let PortRestore = class {
  constructor(remoteExplorerService, logService) {
    this.remoteExplorerService = remoteExplorerService;
    this.logService = logService;
    if (!this.remoteExplorerService.tunnelModel.environmentTunnelsSet) {
      Event.once(this.remoteExplorerService.tunnelModel.onEnvironmentTunnelsSet)(async () => {
        await this.restore();
      });
    } else {
      this.restore();
    }
  }
  async restore() {
    this.logService.trace("ForwardedPorts: Doing first restore.");
    return this.remoteExplorerService.restore();
  }
};
PortRestore = __decorateClass([
  __decorateParam(0, IRemoteExplorerService),
  __decorateParam(1, ILogService)
], PortRestore);
let AutomaticPortForwarding = class extends Disposable {
  constructor(terminalService, notificationService, openerService, externalOpenerService, remoteExplorerService, environmentService, contextKeyService, configurationService, debugService, remoteAgentService, tunnelService, hostService, logService, storageService, preferencesService) {
    super();
    this.terminalService = terminalService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.externalOpenerService = externalOpenerService;
    this.remoteExplorerService = remoteExplorerService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.debugService = debugService;
    this.tunnelService = tunnelService;
    this.hostService = hostService;
    this.logService = logService;
    this.storageService = storageService;
    this.preferencesService = preferencesService;
    if (!environmentService.remoteAuthority) {
      return;
    }
    configurationService.whenRemoteConfigurationLoaded().then(() => remoteAgentService.getEnvironment()).then((environment) => {
      this.setup(environment);
      this._register(configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(PORT_AUTO_SOURCE_SETTING)) {
          this.setup(environment);
        } else if (e.affectsConfiguration(PORT_AUTO_FALLBACK_SETTING) && !this.portListener) {
          this.listenForPorts();
        }
      }));
    });
    if (!this.storageService.getBoolean("processPortForwardingFallback", StorageScope.WORKSPACE, true)) {
      this.configurationService.updateValue(PORT_AUTO_FALLBACK_SETTING, 0, ConfigurationTarget.WORKSPACE);
    }
  }
  getPortAutoFallbackNumber() {
    const fallbackAt = this.configurationService.inspect(PORT_AUTO_FALLBACK_SETTING);
    if (fallbackAt.value !== void 0 && (fallbackAt.value === 0 || fallbackAt.value !== fallbackAt.defaultValue)) {
      return fallbackAt.value;
    }
    const inspectSource = this.configurationService.inspect(PORT_AUTO_SOURCE_SETTING);
    if (inspectSource.applicationValue === PORT_AUTO_SOURCE_SETTING_PROCESS || inspectSource.userValue === PORT_AUTO_SOURCE_SETTING_PROCESS || inspectSource.userLocalValue === PORT_AUTO_SOURCE_SETTING_PROCESS || inspectSource.userRemoteValue === PORT_AUTO_SOURCE_SETTING_PROCESS || inspectSource.workspaceFolderValue === PORT_AUTO_SOURCE_SETTING_PROCESS || inspectSource.workspaceValue === PORT_AUTO_SOURCE_SETTING_PROCESS) {
      return 0;
    }
    return fallbackAt.value ?? 20;
  }
  listenForPorts() {
    let fallbackAt = this.getPortAutoFallbackNumber();
    if (fallbackAt === 0) {
      this.portListener?.dispose();
      return;
    }
    if (this.procForwarder && !this.portListener && this.configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_PROCESS) {
      this.portListener = this._register(this.remoteExplorerService.tunnelModel.onForwardPort(async () => {
        fallbackAt = this.getPortAutoFallbackNumber();
        if (fallbackAt === 0) {
          this.portListener?.dispose();
          return;
        }
        if (Array.from(this.remoteExplorerService.tunnelModel.forwarded.values()).filter((tunnel) => tunnel.source.source === TunnelSource.Auto).length > fallbackAt) {
          await this.configurationService.updateValue(PORT_AUTO_SOURCE_SETTING, PORT_AUTO_SOURCE_SETTING_HYBRID);
          this.notificationService.notify({
            message: nls.localize("remote.autoForwardPortsSource.fallback", "Over 20 ports have been automatically forwarded. The `process` based automatic port forwarding has been switched to `hybrid` in settings. Some ports may no longer be detected."),
            severity: Severity.Warning,
            actions: {
              primary: [
                toAction({
                  id: "switchBack",
                  label: nls.localize("remote.autoForwardPortsSource.fallback.switchBack", "Undo"),
                  run: async () => {
                    await this.configurationService.updateValue(PORT_AUTO_SOURCE_SETTING, PORT_AUTO_SOURCE_SETTING_PROCESS);
                    await this.configurationService.updateValue(PORT_AUTO_FALLBACK_SETTING, 0, ConfigurationTarget.WORKSPACE);
                    this.portListener?.dispose();
                    this.portListener = void 0;
                  }
                }),
                toAction({
                  id: "showPortSourceSetting",
                  label: nls.localize("remote.autoForwardPortsSource.fallback.showPortSourceSetting", "Show Setting"),
                  run: async () => {
                    await this.preferencesService.openSettings({
                      query: "remote.autoForwardPortsSource"
                    });
                  }
                })
              ]
            }
          });
        }
      }));
    } else {
      this.portListener?.dispose();
      this.portListener = void 0;
    }
  }
  setup(environment) {
    const alreadyForwarded = this.procForwarder?.forwarded;
    const isSwitch = this.outputForwarder || this.procForwarder;
    this.procForwarder?.dispose();
    this.procForwarder = void 0;
    this.outputForwarder?.dispose();
    this.outputForwarder = void 0;
    if (environment?.os !== OperatingSystem.Linux) {
      if (this.configurationService.inspect(PORT_AUTO_SOURCE_SETTING).default?.value !== PORT_AUTO_SOURCE_SETTING_OUTPUT) {
        Registry.as(ConfigurationExtensions.Configuration).registerDefaultConfigurations([{ overrides: { "remote.autoForwardPortsSource": PORT_AUTO_SOURCE_SETTING_OUTPUT } }]);
      }
      this.outputForwarder = this._register(new OutputAutomaticPortForwarding(
        this.terminalService,
        this.notificationService,
        this.openerService,
        this.externalOpenerService,
        this.remoteExplorerService,
        this.configurationService,
        this.debugService,
        this.tunnelService,
        this.hostService,
        this.logService,
        this.contextKeyService,
        () => false
      ));
    } else {
      const useProc = () => this.configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_PROCESS;
      if (useProc()) {
        this.procForwarder = this._register(new ProcAutomaticPortForwarding(
          false,
          alreadyForwarded,
          !isSwitch,
          this.configurationService,
          this.remoteExplorerService,
          this.notificationService,
          this.openerService,
          this.externalOpenerService,
          this.tunnelService,
          this.hostService,
          this.logService,
          this.contextKeyService
        ));
      } else if (this.configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_HYBRID) {
        this.procForwarder = this._register(new ProcAutomaticPortForwarding(
          true,
          alreadyForwarded,
          !isSwitch,
          this.configurationService,
          this.remoteExplorerService,
          this.notificationService,
          this.openerService,
          this.externalOpenerService,
          this.tunnelService,
          this.hostService,
          this.logService,
          this.contextKeyService
        ));
      }
      this.outputForwarder = this._register(new OutputAutomaticPortForwarding(
        this.terminalService,
        this.notificationService,
        this.openerService,
        this.externalOpenerService,
        this.remoteExplorerService,
        this.configurationService,
        this.debugService,
        this.tunnelService,
        this.hostService,
        this.logService,
        this.contextKeyService,
        useProc
      ));
    }
    this.listenForPorts();
  }
};
AutomaticPortForwarding = __decorateClass([
  __decorateParam(0, ITerminalService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, IExternalUriOpenerService),
  __decorateParam(4, IRemoteExplorerService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IWorkbenchConfigurationService),
  __decorateParam(8, IDebugService),
  __decorateParam(9, IRemoteAgentService),
  __decorateParam(10, ITunnelService),
  __decorateParam(11, IHostService),
  __decorateParam(12, ILogService),
  __decorateParam(13, IStorageService),
  __decorateParam(14, IPreferencesService)
], AutomaticPortForwarding);
const _OnAutoForwardedAction = class _OnAutoForwardedAction extends Disposable {
  constructor(notificationService, remoteExplorerService, openerService, externalOpenerService, tunnelService, hostService, logService, contextKeyService) {
    super();
    this.notificationService = notificationService;
    this.remoteExplorerService = remoteExplorerService;
    this.openerService = openerService;
    this.externalOpenerService = externalOpenerService;
    this.tunnelService = tunnelService;
    this.hostService = hostService;
    this.logService = logService;
    this.contextKeyService = contextKeyService;
    this.notificationDisposable = this._register(new MutableDisposable());
    this.alreadyOpenedOnce = /* @__PURE__ */ new Set();
    this.lastNotifyTime = /* @__PURE__ */ new Date();
    this.lastNotifyTime.setFullYear(this.lastNotifyTime.getFullYear() - 1);
  }
  async doAction(tunnels) {
    this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Starting action for ${tunnels[0]?.tunnelRemotePort}`);
    this.doActionTunnels = tunnels;
    const tunnel = await this.portNumberHeuristicDelay();
    this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Heuristic chose ${tunnel?.tunnelRemotePort}`);
    if (tunnel) {
      const allAttributes = await this.remoteExplorerService.tunnelModel.getAttributes([{ port: tunnel.tunnelRemotePort, host: tunnel.tunnelRemoteHost }]);
      const attributes = allAttributes?.get(tunnel.tunnelRemotePort)?.onAutoForward;
      this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) onAutoForward action is ${attributes}`);
      switch (attributes) {
        case OnPortForward.OpenBrowserOnce: {
          if (this.alreadyOpenedOnce.has(tunnel.localAddress)) {
            break;
          }
          this.alreadyOpenedOnce.add(tunnel.localAddress);
        }
        case OnPortForward.OpenBrowser: {
          const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
          await OpenPortInBrowserAction.run(this.remoteExplorerService.tunnelModel, this.openerService, address);
          break;
        }
        case OnPortForward.OpenPreview: {
          const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
          await OpenPortInPreviewAction.run(this.remoteExplorerService.tunnelModel, this.openerService, this.externalOpenerService, address);
          break;
        }
        case OnPortForward.Silent:
          break;
        default: {
          const elapsed = (/* @__PURE__ */ new Date()).getTime() - this.lastNotifyTime.getTime();
          this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) time elapsed since last notification ${elapsed} ms`);
          if (elapsed > _OnAutoForwardedAction.NOTIFY_COOL_DOWN) {
            await this.showNotification(tunnel);
          }
        }
      }
    }
  }
  hide(removedPorts) {
    if (this.doActionTunnels) {
      this.doActionTunnels = this.doActionTunnels.filter((value) => !removedPorts.includes(value.tunnelRemotePort));
    }
    if (this.lastShownPort && removedPorts.indexOf(this.lastShownPort) >= 0) {
      this.lastNotification?.close();
    }
  }
  async portNumberHeuristicDelay() {
    this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Starting heuristic delay`);
    if (!this.doActionTunnels || this.doActionTunnels.length === 0) {
      return;
    }
    this.doActionTunnels = this.doActionTunnels.sort((a, b) => a.tunnelRemotePort - b.tunnelRemotePort);
    const firstTunnel = this.doActionTunnels.shift();
    if (firstTunnel.tunnelRemotePort % 1e3 === 0) {
      this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Heuristic chose tunnel because % 1000: ${firstTunnel.tunnelRemotePort}`);
      this.newerTunnel = firstTunnel;
      return firstTunnel;
    } else if (firstTunnel.tunnelRemotePort < 1e4 && firstTunnel.tunnelRemotePort !== 9229) {
      this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Heuristic chose tunnel because < 10000: ${firstTunnel.tunnelRemotePort}`);
      this.newerTunnel = firstTunnel;
      return firstTunnel;
    }
    this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Waiting for "better" tunnel than ${firstTunnel.tunnelRemotePort}`);
    this.newerTunnel = void 0;
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.newerTunnel) {
          resolve(void 0);
        } else if (this.doActionTunnels?.includes(firstTunnel)) {
          resolve(firstTunnel);
        } else {
          resolve(void 0);
        }
      }, 3e3);
    });
  }
  async basicMessage(tunnel) {
    const properties = await this.remoteExplorerService.tunnelModel.getAttributes([{ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }], false);
    const label = properties?.get(tunnel.tunnelRemotePort)?.label;
    return nls.localize(
      "remote.tunnelsView.automaticForward",
      "Your application{0} running on port {1} is available.  ",
      label ? ` (${label})` : "",
      tunnel.tunnelRemotePort
    );
  }
  linkMessage() {
    return nls.localize(
      { key: "remote.tunnelsView.notificationLink2", comment: ["[See all forwarded ports]({0}) is a link. Only translate `See all forwarded ports`. Do not change brackets and parentheses or {0}"] },
      "[See all forwarded ports]({0})",
      `command:${TunnelPanel.ID}.focus`
    );
  }
  async showNotification(tunnel) {
    if (!await this.hostService.hadLastFocus()) {
      return;
    }
    this.lastNotification?.close();
    let message = await this.basicMessage(tunnel);
    const choices = [this.openBrowserChoice(tunnel)];
    if (!isWeb || openPreviewEnabledContext.getValue(this.contextKeyService)) {
      choices.push(this.openPreviewChoice(tunnel));
    }
    if (tunnel.tunnelLocalPort !== tunnel.tunnelRemotePort && this.tunnelService.canElevate && this.tunnelService.isPortPrivileged(tunnel.tunnelRemotePort)) {
      message += nls.localize("remote.tunnelsView.elevationMessage", "You'll need to run as superuser to use port {0} locally.  ", tunnel.tunnelRemotePort);
      choices.unshift(this.elevateChoice(tunnel));
    }
    if (tunnel.privacy === TunnelPrivacyId.Private && isWeb && this.tunnelService.canChangePrivacy) {
      choices.push(this.makePublicChoice(tunnel));
    }
    message += this.linkMessage();
    this.lastNotification = this.notificationService.prompt(Severity.Info, message, choices, { neverShowAgain: { id: "remote.tunnelsView.autoForwardNeverShow", isSecondary: true } });
    this.lastShownPort = tunnel.tunnelRemotePort;
    this.lastNotifyTime = /* @__PURE__ */ new Date();
    this.notificationDisposable.value = this.lastNotification.onDidClose(() => {
      this.lastNotification = void 0;
      this.lastShownPort = void 0;
    });
  }
  makePublicChoice(tunnel) {
    return {
      label: nls.localize("remote.tunnelsView.makePublic", "Make Public"),
      run: async () => {
        const oldTunnelDetails = mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.forwarded, tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
        await this.remoteExplorerService.close({ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }, TunnelCloseReason.Other);
        return this.remoteExplorerService.forward({
          remote: { host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort },
          local: tunnel.tunnelLocalPort,
          name: oldTunnelDetails?.name,
          elevateIfNeeded: true,
          privacy: TunnelPrivacyId.Public,
          source: oldTunnelDetails?.source
        });
      }
    };
  }
  openBrowserChoice(tunnel) {
    const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
    return {
      label: OpenPortInBrowserAction.LABEL,
      run: () => OpenPortInBrowserAction.run(this.remoteExplorerService.tunnelModel, this.openerService, address)
    };
  }
  openPreviewChoice(tunnel) {
    const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
    return {
      label: OpenPortInPreviewAction.LABEL,
      run: () => OpenPortInPreviewAction.run(this.remoteExplorerService.tunnelModel, this.openerService, this.externalOpenerService, address)
    };
  }
  elevateChoice(tunnel) {
    return {
      // Privileged ports are not on Windows, so it's ok to stick to just "sudo".
      label: nls.localize("remote.tunnelsView.elevationButton", "Use Port {0} as Sudo...", tunnel.tunnelRemotePort),
      run: async () => {
        await this.remoteExplorerService.close({ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }, TunnelCloseReason.Other);
        const newTunnel = await this.remoteExplorerService.forward({
          remote: { host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort },
          local: tunnel.tunnelRemotePort,
          elevateIfNeeded: true,
          source: AutoTunnelSource
        });
        if (!newTunnel || typeof newTunnel === "string") {
          return;
        }
        this.lastNotification?.close();
        this.lastShownPort = newTunnel.tunnelRemotePort;
        this.lastNotification = this.notificationService.prompt(
          Severity.Info,
          await this.basicMessage(newTunnel) + this.linkMessage(),
          [this.openBrowserChoice(newTunnel), this.openPreviewChoice(tunnel)],
          { neverShowAgain: { id: "remote.tunnelsView.autoForwardNeverShow", isSecondary: true } }
        );
        this.notificationDisposable.value = this.lastNotification.onDidClose(() => {
          this.lastNotification = void 0;
          this.lastShownPort = void 0;
        });
      }
    };
  }
};
_OnAutoForwardedAction.NOTIFY_COOL_DOWN = 5e3;
let OnAutoForwardedAction = _OnAutoForwardedAction;
class OutputAutomaticPortForwarding extends Disposable {
  constructor(terminalService, notificationService, openerService, externalOpenerService, remoteExplorerService, configurationService, debugService, tunnelService, hostService, logService, contextKeyService, privilegedOnly) {
    super();
    this.terminalService = terminalService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.externalOpenerService = externalOpenerService;
    this.remoteExplorerService = remoteExplorerService;
    this.configurationService = configurationService;
    this.debugService = debugService;
    this.tunnelService = tunnelService;
    this.hostService = hostService;
    this.logService = logService;
    this.contextKeyService = contextKeyService;
    this.privilegedOnly = privilegedOnly;
    this.notifier = new OnAutoForwardedAction(notificationService, remoteExplorerService, openerService, externalOpenerService, tunnelService, hostService, logService, contextKeyService);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(PORT_AUTO_FORWARD_SETTING)) {
        this.tryStartStopUrlFinder();
      }
    }));
    this.portsFeatures = this._register(this.remoteExplorerService.onEnabledPortsFeatures(() => {
      this.tryStartStopUrlFinder();
    }));
    this.tryStartStopUrlFinder();
    if (configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_HYBRID) {
      this._register(this.tunnelService.onTunnelClosed((tunnel) => this.notifier.hide([tunnel.port])));
    }
  }
  tryStartStopUrlFinder() {
    if (this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING)) {
      this.startUrlFinder();
    } else {
      this.stopUrlFinder();
    }
  }
  startUrlFinder() {
    if (!this.urlFinder && this.remoteExplorerService.portsFeaturesEnabled !== PortsEnablement.AdditionalFeatures) {
      return;
    }
    this.portsFeatures?.dispose();
    this.urlFinder = this._register(new UrlFinder(this.terminalService, this.debugService));
    this._register(this.urlFinder.onDidMatchLocalUrl(async (localUrl) => {
      if (mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.detected, localUrl.host, localUrl.port)) {
        return;
      }
      const attributes = (await this.remoteExplorerService.tunnelModel.getAttributes([localUrl]))?.get(localUrl.port);
      if (attributes?.onAutoForward === OnPortForward.Ignore) {
        return;
      }
      if (this.privilegedOnly() && !this.tunnelService.isPortPrivileged(localUrl.port)) {
        return;
      }
      const forwarded = await this.remoteExplorerService.forward({ remote: localUrl, source: AutoTunnelSource }, attributes ?? null);
      if (forwarded && typeof forwarded !== "string") {
        this.notifier.doAction([forwarded]);
      }
    }));
  }
  stopUrlFinder() {
    if (this.urlFinder) {
      this.urlFinder.dispose();
      this.urlFinder = void 0;
    }
  }
}
class ProcAutomaticPortForwarding extends Disposable {
  constructor(unforwardOnly, alreadyAutoForwarded, needsInitialCandidates, configurationService, remoteExplorerService, notificationService, openerService, externalOpenerService, tunnelService, hostService, logService, contextKeyService) {
    super();
    this.unforwardOnly = unforwardOnly;
    this.alreadyAutoForwarded = alreadyAutoForwarded;
    this.needsInitialCandidates = needsInitialCandidates;
    this.configurationService = configurationService;
    this.remoteExplorerService = remoteExplorerService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.externalOpenerService = externalOpenerService;
    this.tunnelService = tunnelService;
    this.hostService = hostService;
    this.logService = logService;
    this.contextKeyService = contextKeyService;
    this.autoForwarded = /* @__PURE__ */ new Set();
    this.notifiedOnly = /* @__PURE__ */ new Set();
    this.initialCandidates = /* @__PURE__ */ new Set();
    this.notifier = new OnAutoForwardedAction(notificationService, remoteExplorerService, openerService, externalOpenerService, tunnelService, hostService, logService, contextKeyService);
    alreadyAutoForwarded?.forEach((port) => this.autoForwarded.add(port));
    this.initialize();
  }
  get forwarded() {
    return this.autoForwarded;
  }
  async initialize() {
    if (!this.remoteExplorerService.tunnelModel.environmentTunnelsSet) {
      await new Promise((resolve) => this.remoteExplorerService.tunnelModel.onEnvironmentTunnelsSet(() => resolve()));
    }
    this._register(this.configurationService.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration(PORT_AUTO_FORWARD_SETTING)) {
        await this.startStopCandidateListener();
      }
    }));
    this.portsFeatures = this._register(this.remoteExplorerService.onEnabledPortsFeatures(async () => {
      await this.startStopCandidateListener();
    }));
    this.startStopCandidateListener();
  }
  async startStopCandidateListener() {
    if (this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING)) {
      await this.startCandidateListener();
    } else {
      this.stopCandidateListener();
    }
  }
  stopCandidateListener() {
    if (this.candidateListener) {
      this.candidateListener.dispose();
      this.candidateListener = void 0;
    }
  }
  async startCandidateListener() {
    if (this.candidateListener || this.remoteExplorerService.portsFeaturesEnabled !== PortsEnablement.AdditionalFeatures) {
      return;
    }
    this.portsFeatures?.dispose();
    await this.setInitialCandidates();
    if (this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING)) {
      this.candidateListener = this._register(this.remoteExplorerService.tunnelModel.onCandidatesChanged(this.handleCandidateUpdate, this));
    }
  }
  async setInitialCandidates() {
    if (!this.needsInitialCandidates) {
      this.logService.debug(`ForwardedPorts: (ProcForwarding) Not setting initial candidates`);
      return;
    }
    let startingCandidates = this.remoteExplorerService.tunnelModel.candidatesOrUndefined;
    if (!startingCandidates) {
      await new Promise((resolve) => this.remoteExplorerService.tunnelModel.onCandidatesChanged(() => resolve()));
      startingCandidates = this.remoteExplorerService.tunnelModel.candidates;
    }
    for (const value of startingCandidates) {
      this.initialCandidates.add(makeAddress(value.host, value.port));
    }
    this.logService.debug(`ForwardedPorts: (ProcForwarding) Initial candidates set to ${startingCandidates.map((candidate) => candidate.port).join(", ")}`);
  }
  async forwardCandidates() {
    let attributes;
    const allTunnels = [];
    this.logService.trace(`ForwardedPorts: (ProcForwarding) Attempting to forward ${this.remoteExplorerService.tunnelModel.candidates.length} candidates`);
    for (const value of this.remoteExplorerService.tunnelModel.candidates) {
      if (!value.detail) {
        this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} missing detail`);
        continue;
      }
      if (isCandidateRemappedTunnelLocalEndpoint(value, this.remoteExplorerService.tunnelModel.forwarded.values())) {
        this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} is the local port of a forwarded tunnel`);
        continue;
      }
      if (!attributes) {
        attributes = await this.remoteExplorerService.tunnelModel.getAttributes(this.remoteExplorerService.tunnelModel.candidates);
      }
      const portAttributes = attributes?.get(value.port);
      const address = makeAddress(value.host, value.port);
      if (this.initialCandidates.has(address) && portAttributes?.onAutoForward === void 0) {
        continue;
      }
      if (this.notifiedOnly.has(address) || this.autoForwarded.has(address)) {
        continue;
      }
      const alreadyForwarded = mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.forwarded, value.host, value.port);
      if (mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.detected, value.host, value.port)) {
        continue;
      }
      if (portAttributes?.onAutoForward === OnPortForward.Ignore) {
        this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} is ignored`);
        continue;
      }
      const forwarded = await this.remoteExplorerService.forward({ remote: value, source: AutoTunnelSource }, portAttributes ?? null);
      if (!alreadyForwarded && forwarded) {
        this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} has been forwarded`);
        this.autoForwarded.add(address);
      } else if (forwarded) {
        this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} has been notified`);
        this.notifiedOnly.add(address);
      }
      if (forwarded && typeof forwarded !== "string") {
        allTunnels.push(forwarded);
      }
    }
    this.logService.trace(`ForwardedPorts: (ProcForwarding) Forwarded ${allTunnels.length} candidates`);
    if (allTunnels.length === 0) {
      return void 0;
    }
    return allTunnels;
  }
  async handleCandidateUpdate(removed) {
    const removedPorts = [];
    let autoForwarded;
    if (this.unforwardOnly) {
      autoForwarded = /* @__PURE__ */ new Map();
      for (const entry of this.remoteExplorerService.tunnelModel.forwarded.entries()) {
        if (entry[1].source.source === TunnelSource.Auto) {
          autoForwarded.set(entry[0], entry[1]);
        }
      }
    } else {
      autoForwarded = new Map(this.autoForwarded.entries());
    }
    for (const removedPort of removed) {
      const key = removedPort[0];
      let value = removedPort[1];
      const forwardedValue = mapHasAddressLocalhostOrAllInterfaces(autoForwarded, value.host, value.port);
      if (forwardedValue) {
        if (typeof forwardedValue === "string") {
          this.autoForwarded.delete(key);
        } else {
          value = { host: forwardedValue.remoteHost, port: forwardedValue.remotePort };
        }
        await this.remoteExplorerService.close(value, TunnelCloseReason.AutoForwardEnd);
        removedPorts.push(value.port);
      } else if (this.notifiedOnly.delete(key)) {
        removedPorts.push(value.port);
      } else {
        this.initialCandidates.delete(key);
      }
    }
    if (this.unforwardOnly) {
      return;
    }
    if (removedPorts.length > 0) {
      await this.notifier.hide(removedPorts);
    }
    const tunnels = await this.forwardCandidates();
    if (tunnels) {
      await this.notifier.doAction(tunnels);
    }
  }
}
export {
  AutomaticPortForwarding,
  ForwardedPortsView,
  PortRestore,
  TOGGLE_VIEW_ACTION_ID,
  VIEWLET_ID,
  isCandidateRemappedTunnelLocalEndpoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9icm93c2VyL3JlbW90ZUV4cGxvcmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJVmlld0NvbnRhaW5lcnNSZWdpc3RyeSwgSVZpZXdzUmVnaXN0cnksIFZpZXdDb250YWluZXIsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCBQT1JUX0FVVE9fRkFMTEJBQ0tfU0VUVElORywgUE9SVF9BVVRPX0ZPUldBUkRfU0VUVElORywgUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HLCBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfSFlCUklELCBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfT1VUUFVULCBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfUFJPQ0VTUywgUG9ydHNFbmFibGVtZW50LCBUVU5ORUxfVklFV19DT05UQUlORVJfSUQsIFRVTk5FTF9WSUVXX0lEIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVFeHBsb3JlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXR0cmlidXRlcywgQXV0b1R1bm5lbFNvdXJjZSwgQ2FuZGlkYXRlUG9ydCwgZm9yd2FyZGVkUG9ydHNGZWF0dXJlc0VuYWJsZWQsIGZvcndhcmRlZFBvcnRzVmlld0VuYWJsZWQsIG1ha2VBZGRyZXNzLCBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzLCBPblBvcnRGb3J3YXJkLCBUdW5uZWwsIFR1bm5lbENsb3NlUmVhc29uLCBUdW5uZWxTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3R1bm5lbE1vZGVsLmpzJztcbmltcG9ydCB7IEZvcndhcmRQb3J0QWN0aW9uLCBPcGVuUG9ydEluQnJvd3NlckFjdGlvbiwgVHVubmVsUGFuZWwsIFR1bm5lbFBhbmVsRGVzY3JpcHRvciwgVHVubmVsVmlld01vZGVsLCBPcGVuUG9ydEluUHJldmlld0FjdGlvbiwgb3BlblByZXZpZXdFbmFibGVkQ29udGV4dCB9IGZyb20gJy4vdHVubmVsVmlldy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJFbnRyeSwgSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IsIElTdGF0dXNiYXJTZXJ2aWNlLCBTdGF0dXNiYXJBbGlnbm1lbnQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgVXJsRmluZGVyIH0gZnJvbSAnLi91cmxGaW5kZXIuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvbkhhbmRsZSwgSU5vdGlmaWNhdGlvblNlcnZpY2UsIElQcm9tcHRDaG9pY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElEZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi8uLi9kZWJ1Zy9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzV2ViLCBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpc0FsbEludGVyZmFjZXMsIGlzTG9jYWxob3N0LCBJVHVubmVsU2VydmljZSwgUmVtb3RlVHVubmVsLCBUdW5uZWxQcml2YWN5SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90dW5uZWwvY29tbW9uL3R1bm5lbC5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZUNvbnRhaW5lci5qcyc7XG5pbXBvcnQgeyBJQWN0aXZpdHlTZXJ2aWNlLCBOdW1iZXJCYWRnZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2FjdGl2aXR5L2NvbW1vbi9hY3Rpdml0eS5qcyc7XG5pbXBvcnQgeyBwb3J0c1ZpZXdJY29uIH0gZnJvbSAnLi9yZW1vdGVJY29ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElFeHRlcm5hbFVyaU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlcm5hbFVyaU9wZW5lci9jb21tb24vZXh0ZXJuYWxVcmlPcGVuZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEVudmlyb25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBWSUVXTEVUX0lEID0gJ3dvcmtiZW5jaC52aWV3LnJlbW90ZSc7XG5leHBvcnQgY29uc3QgVE9HR0xFX1ZJRVdfQUNUSU9OX0lEID0gJ3JlbW90ZUV4cGxvcmVyLnRvZ2dsZUZvcndhcmRlZFBvcnRzVmlldyc7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGEgcHJvY2VzcyBjYW5kaWRhdGUgaXMgdGhlIHJlbWFwcGVkIGxvY2FsIGVuZHBvaW50IG9mIGFuIGV4aXN0aW5nIHR1bm5lbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzQ2FuZGlkYXRlUmVtYXBwZWRUdW5uZWxMb2NhbEVuZHBvaW50KGNhbmRpZGF0ZTogQ2FuZGlkYXRlUG9ydCwgdHVubmVsczogSXRlcmFibGU8UGljazxUdW5uZWwsICdsb2NhbFBvcnQnIHwgJ3JlbW90ZVBvcnQnPj4pOiBib29sZWFuIHtcblx0aWYgKCFpc0xvY2FsaG9zdChjYW5kaWRhdGUuaG9zdCkgJiYgIWlzQWxsSW50ZXJmYWNlcyhjYW5kaWRhdGUuaG9zdCkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Zm9yIChjb25zdCB0dW5uZWwgb2YgdHVubmVscykge1xuXHRcdGlmICh0dW5uZWwubG9jYWxQb3J0ID09PSBjYW5kaWRhdGUucG9ydCAmJiB0dW5uZWwucmVtb3RlUG9ydCAhPT0gY2FuZGlkYXRlLnBvcnQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBjbGFzcyBGb3J3YXJkZWRQb3J0c1ZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eUJhZGdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSBlbnRyeUFjY2Vzc29yOiBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBoYXNQb3J0c0luU2Vzc2lvbjogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJVHVubmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHR1bm5lbFNlcnZpY2U6IElUdW5uZWxTZXJ2aWNlLFxuXHRcdEBJQWN0aXZpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWN0aXZpdHlTZXJ2aWNlOiBJQWN0aXZpdHlTZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXR1c2JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpLnJlZ2lzdGVyVmlld1dlbGNvbWVDb250ZW50KFRVTk5FTF9WSUVXX0lELCB7XG5cdFx0XHRjb250ZW50OiB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgPyBubHMubG9jYWxpemUoJ3JlbW90ZU5vUG9ydHMnLCBcIk5vIGZvcndhcmRlZCBwb3J0cy4gRm9yd2FyZCBhIHBvcnQgdG8gYWNjZXNzIHlvdXIgcnVubmluZyBzZXJ2aWNlcyBsb2NhbGx5LlxcbltGb3J3YXJkIGEgUG9ydF0oezB9KVwiLCBgY29tbWFuZDoke0ZvcndhcmRQb3J0QWN0aW9uLklOTElORV9JRH1gKVxuXHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnbm9SZW1vdGVOb1BvcnRzJywgXCJObyBmb3J3YXJkZWQgcG9ydHMuIEZvcndhcmQgYSBwb3J0IHRvIGFjY2VzcyB5b3VyIGxvY2FsbHkgcnVubmluZyBzZXJ2aWNlcyBvdmVyIHRoZSBpbnRlcm5ldC5cXG5bRm9yd2FyZCBhIFBvcnRdKHswfSlcIiwgYGNvbW1hbmQ6JHtGb3J3YXJkUG9ydEFjdGlvbi5JTkxJTkVfSUR9YCksXG5cdFx0fSkpO1xuXHRcdHRoaXMuZW5hYmxlQmFkZ2VBbmRTdGF0dXNCYXIoKTtcblx0XHR0aGlzLmVuYWJsZUZvcndhcmRlZFBvcnRzRmVhdHVyZXMoKTtcblx0XHRpZiAoIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQub25jZSh0aGlzLnR1bm5lbFNlcnZpY2Uub25UdW5uZWxPcGVuZWQpKCgpID0+IHtcblx0XHRcdFx0dGhpcy5oYXNQb3J0c0luU2Vzc2lvbiA9IHRydWU7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRWaWV3Q29udGFpbmVyKCk6IFByb21pc2U8Vmlld0NvbnRhaW5lciB8IG51bGw+IHtcblx0XHRyZXR1cm4gUmVnaXN0cnkuYXM8SVZpZXdDb250YWluZXJzUmVnaXN0cnk+KEV4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHtcblx0XHRcdGlkOiBUVU5ORUxfVklFV19DT05UQUlORVJfSUQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMigncG9ydHMnLCBcIlBvcnRzXCIpLFxuXHRcdFx0aWNvbjogcG9ydHNWaWV3SWNvbixcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoVmlld1BhbmVDb250YWluZXIsIFtUVU5ORUxfVklFV19DT05UQUlORVJfSUQsIHsgbWVyZ2VWaWV3V2l0aENvbnRhaW5lcldoZW5TaW5nbGVWaWV3OiB0cnVlIH1dKSxcblx0XHRcdHN0b3JhZ2VJZDogVFVOTkVMX1ZJRVdfQ09OVEFJTkVSX0lELFxuXHRcdFx0aGlkZUlmRW1wdHk6IHRydWUsXG5cdFx0XHRvcmRlcjogNVxuXHRcdH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGVuYWJsZUZvcndhcmRlZFBvcnRzRmVhdHVyZXMoKSB7XG5cdFx0dGhpcy5jb250ZXh0S2V5TGlzdGVuZXIuY2xlYXIoKTtcblxuXHRcdGNvbnN0IGZlYXR1cmVzRW5hYmxlZDogYm9vbGVhbiA9ICEhZm9yd2FyZGVkUG9ydHNGZWF0dXJlc0VuYWJsZWQuZ2V0VmFsdWUodGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3Qgdmlld0VuYWJsZWQ6IGJvb2xlYW4gPSAhIWZvcndhcmRlZFBvcnRzVmlld0VuYWJsZWQuZ2V0VmFsdWUodGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRpZiAoZmVhdHVyZXNFbmFibGVkIHx8IHZpZXdFbmFibGVkKSB7XG5cdFx0XHQvLyBBbHNvIGVuYWJsZSB0aGUgdmlldyBpZiBpdCBpc24ndCBhbHJlYWR5LlxuXHRcdFx0aWYgKCF2aWV3RW5hYmxlZCkge1xuXHRcdFx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShmb3J3YXJkZWRQb3J0c1ZpZXdFbmFibGVkLmtleSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gYXdhaXQgdGhpcy5nZXRWaWV3Q29udGFpbmVyKCk7XG5cdFx0XHRjb25zdCB0dW5uZWxQYW5lbERlc2NyaXB0b3IgPSBuZXcgVHVubmVsUGFuZWxEZXNjcmlwdG9yKG5ldyBUdW5uZWxWaWV3TW9kZWwodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UsIHRoaXMudHVubmVsU2VydmljZSksIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHZpZXdzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KTtcblx0XHRcdGlmICh2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmVuYWJsZVBvcnRzRmVhdHVyZXMoIWZlYXR1cmVzRW5hYmxlZCk7XG5cdFx0XHRcdHZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdHVubmVsUGFuZWxEZXNjcmlwdG9yXSwgdmlld0NvbnRhaW5lcik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29udGV4dEtleUxpc3RlbmVyLnZhbHVlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNTb21lKG5ldyBTZXQoWy4uLmZvcndhcmRlZFBvcnRzRmVhdHVyZXNFbmFibGVkLmtleXMoKSwgLi4uZm9yd2FyZGVkUG9ydHNWaWV3RW5hYmxlZC5rZXlzKCldKSkpIHtcblx0XHRcdFx0XHR0aGlzLmVuYWJsZUZvcndhcmRlZFBvcnRzRmVhdHVyZXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBlbmFibGVCYWRnZUFuZFN0YXR1c0JhcigpIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KEV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSkub25WaWV3c1JlZ2lzdGVyZWQoZSA9PiB7XG5cdFx0XHRpZiAoZS5maW5kKHZpZXcgPT4gdmlldy52aWV3cy5maW5kKHZpZXdEZXNjcmlwdG9yID0+IHZpZXdEZXNjcmlwdG9yLmlkID09PSBUVU5ORUxfVklFV19JRCkpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmRlYm91bmNlKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLm9uRm9yd2FyZFBvcnQsIChfbGFzdCwgZSkgPT4gZSwgNTApKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUFjdGl2aXR5QmFkZ2UoKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1c0JhcigpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmRlYm91bmNlKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLm9uQ2xvc2VQb3J0LCAoX2xhc3QsIGUpID0+IGUsIDUwKSgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVBY3Rpdml0eUJhZGdlKCk7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXNCYXIoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHRoaXMudXBkYXRlQWN0aXZpdHlCYWRnZSgpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1c0JhcigpO1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlQWN0aXZpdHlCYWRnZSgpIHtcblx0XHRpZiAodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZm9yd2FyZGVkLnNpemUgPiAwKSB7XG5cdFx0XHR0aGlzLmFjdGl2aXR5QmFkZ2UudmFsdWUgPSB0aGlzLmFjdGl2aXR5U2VydmljZS5zaG93Vmlld0FjdGl2aXR5KFRVTk5FTF9WSUVXX0lELCB7XG5cdFx0XHRcdGJhZGdlOiBuZXcgTnVtYmVyQmFkZ2UodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZm9yd2FyZGVkLnNpemUsIG4gPT4gbiA9PT0gMSA/IG5scy5sb2NhbGl6ZSgnMWZvcndhcmRlZFBvcnQnLCBcIjEgZm9yd2FyZGVkIHBvcnRcIikgOiBubHMubG9jYWxpemUoJ25Gb3J3YXJkZWRQb3J0cycsIFwiezB9IGZvcndhcmRlZCBwb3J0c1wiLCBuKSlcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFjdGl2aXR5QmFkZ2UuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0YXR1c0JhcigpIHtcblx0XHRpZiAoIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAmJiAhdGhpcy5oYXNQb3J0c0luU2Vzc2lvbikge1xuXHRcdFx0Ly8gV2Ugb25seSB3YW50IHRvIHNob3cgdGhlIHBvcnRzIHN0YXR1cyBiYXIgZW50cnkgd2hlbiB0aGUgdXNlciBoYXMgdGFrZW4gYW4gYWN0aW9uIHRoYXQgaW5kaWNhdGVzIHRoYXQgdGhleSBtaWdodCBjYXJlIGFib3V0IGl0LlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5lbnRyeUFjY2Vzc29yKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVudHJ5QWNjZXNzb3IgPSB0aGlzLnN0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkodGhpcy5lbnRyeSwgJ3N0YXR1cy5mb3J3YXJkZWRQb3J0cycsIFN0YXR1c2JhckFsaWdubWVudC5MRUZULCA0MCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVudHJ5QWNjZXNzb3IudXBkYXRlKHRoaXMuZW50cnkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0IGVudHJ5KCk6IElTdGF0dXNiYXJFbnRyeSB7XG5cdFx0bGV0IHRvb2x0aXA6IHN0cmluZztcblx0XHRjb25zdCBjb3VudCA9IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmZvcndhcmRlZC5zaXplICsgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZGV0ZWN0ZWQuc2l6ZTtcblx0XHRjb25zdCB0ZXh0ID0gYCR7Y291bnR9YDtcblx0XHRpZiAoY291bnQgPT09IDApIHtcblx0XHRcdHRvb2x0aXAgPSBubHMubG9jYWxpemUoJ3JlbW90ZS5mb3J3YXJkZWRQb3J0cy5zdGF0dXNiYXJUZXh0Tm9uZScsIFwiTm8gUG9ydHMgRm9yd2FyZGVkXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBhbGxUdW5uZWxzID0gQXJyYXkuZnJvbSh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQudmFsdWVzKCkpO1xuXHRcdFx0YWxsVHVubmVscy5wdXNoKC4uLkFycmF5LmZyb20odGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZGV0ZWN0ZWQudmFsdWVzKCkpKTtcblx0XHRcdHRvb2x0aXAgPSBubHMubG9jYWxpemUoJ3JlbW90ZS5mb3J3YXJkZWRQb3J0cy5zdGF0dXNiYXJUb29sdGlwJywgXCJGb3J3YXJkZWQgUG9ydHM6IHswfVwiLFxuXHRcdFx0XHRhbGxUdW5uZWxzLm1hcChmb3J3YXJkZWQgPT4gZm9yd2FyZGVkLnJlbW90ZVBvcnQpLmpvaW4oJywgJykpO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogbmxzLmxvY2FsaXplKCdzdGF0dXMuZm9yd2FyZGVkUG9ydHMnLCBcIkZvcndhcmRlZCBQb3J0c1wiKSxcblx0XHRcdHRleHQ6IGAkKHJhZGlvLXRvd2VyKSAke3RleHR9YCxcblx0XHRcdGFyaWFMYWJlbDogdG9vbHRpcCxcblx0XHRcdHRvb2x0aXAsXG5cdFx0XHRjb21tYW5kOiBUT0dHTEVfVklFV19BQ1RJT05fSURcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBQb3J0UmVzdG9yZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVJlbW90ZUV4cGxvcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRpZiAoIXRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmVudmlyb25tZW50VHVubmVsc1NldCkge1xuXHRcdFx0RXZlbnQub25jZSh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5vbkVudmlyb25tZW50VHVubmVsc1NldCkoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJlc3RvcmUoKTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlc3RvcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc3RvcmUoKSB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdGb3J3YXJkZWRQb3J0czogRG9pbmcgZmlyc3QgcmVzdG9yZS4nKTtcblx0XHRyZXR1cm4gdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UucmVzdG9yZSgpO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIEF1dG9tYXRpY1BvcnRGb3J3YXJkaW5nIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwcml2YXRlIHByb2NGb3J3YXJkZXI6IFByb2NBdXRvbWF0aWNQb3J0Rm9yd2FyZGluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBvdXRwdXRGb3J3YXJkZXI6IE91dHB1dEF1dG9tYXRpY1BvcnRGb3J3YXJkaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHBvcnRMaXN0ZW5lcjogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElFeHRlcm5hbFVyaU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlcm5hbE9wZW5lclNlcnZpY2U6IElFeHRlcm5hbFVyaU9wZW5lclNlcnZpY2UsXG5cdFx0QElSZW1vdGVFeHBsb3JlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVR1bm5lbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0dW5uZWxTZXJ2aWNlOiBJVHVubmVsU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRpZiAoIWVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25maWd1cmF0aW9uU2VydmljZS53aGVuUmVtb3RlQ29uZmlndXJhdGlvbkxvYWRlZCgpLnRoZW4oKCkgPT4gcmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCkpLnRoZW4oZW52aXJvbm1lbnQgPT4ge1xuXHRcdFx0dGhpcy5zZXR1cChlbnZpcm9ubWVudCk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFBPUlRfQVVUT19TT1VSQ0VfU0VUVElORykpIHtcblx0XHRcdFx0XHR0aGlzLnNldHVwKGVudmlyb25tZW50KTtcblx0XHRcdFx0fSBlbHNlIGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFBPUlRfQVVUT19GQUxMQkFDS19TRVRUSU5HKSAmJiAhdGhpcy5wb3J0TGlzdGVuZXIpIHtcblx0XHRcdFx0XHR0aGlzLmxpc3RlbkZvclBvcnRzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdGlmICghdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdwcm9jZXNzUG9ydEZvcndhcmRpbmdGYWxsYmFjaycsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHRydWUpKSB7XG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFBPUlRfQVVUT19GQUxMQkFDS19TRVRUSU5HLCAwLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRQb3J0QXV0b0ZhbGxiYWNrTnVtYmVyKCk6IG51bWJlciB7XG5cdFx0Y29uc3QgZmFsbGJhY2tBdCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxudW1iZXI+KFBPUlRfQVVUT19GQUxMQkFDS19TRVRUSU5HKTtcblx0XHRpZiAoKGZhbGxiYWNrQXQudmFsdWUgIT09IHVuZGVmaW5lZCkgJiYgKGZhbGxiYWNrQXQudmFsdWUgPT09IDAgfHwgKGZhbGxiYWNrQXQudmFsdWUgIT09IGZhbGxiYWNrQXQuZGVmYXVsdFZhbHVlKSkpIHtcblx0XHRcdHJldHVybiBmYWxsYmFja0F0LnZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnNwZWN0U291cmNlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KFBPUlRfQVVUT19TT1VSQ0VfU0VUVElORyk7XG5cdFx0aWYgKGluc3BlY3RTb3VyY2UuYXBwbGljYXRpb25WYWx1ZSA9PT0gUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HX1BST0NFU1MgfHxcblx0XHRcdGluc3BlY3RTb3VyY2UudXNlclZhbHVlID09PSBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfUFJPQ0VTUyB8fFxuXHRcdFx0aW5zcGVjdFNvdXJjZS51c2VyTG9jYWxWYWx1ZSA9PT0gUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HX1BST0NFU1MgfHxcblx0XHRcdGluc3BlY3RTb3VyY2UudXNlclJlbW90ZVZhbHVlID09PSBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfUFJPQ0VTUyB8fFxuXHRcdFx0aW5zcGVjdFNvdXJjZS53b3Jrc3BhY2VGb2xkZXJWYWx1ZSA9PT0gUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HX1BST0NFU1MgfHxcblx0XHRcdGluc3BlY3RTb3VyY2Uud29ya3NwYWNlVmFsdWUgPT09IFBPUlRfQVVUT19TT1VSQ0VfU0VUVElOR19QUk9DRVNTKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbGxiYWNrQXQudmFsdWUgPz8gMjA7XG5cdH1cblxuXHRwcml2YXRlIGxpc3RlbkZvclBvcnRzKCkge1xuXHRcdGxldCBmYWxsYmFja0F0ID0gdGhpcy5nZXRQb3J0QXV0b0ZhbGxiYWNrTnVtYmVyKCk7XG5cdFx0aWYgKGZhbGxiYWNrQXQgPT09IDApIHtcblx0XHRcdHRoaXMucG9ydExpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucHJvY0ZvcndhcmRlciAmJiAhdGhpcy5wb3J0TGlzdGVuZXIgJiYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HKSA9PT0gUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HX1BST0NFU1MpKSB7XG5cdFx0XHR0aGlzLnBvcnRMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLm9uRm9yd2FyZFBvcnQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRmYWxsYmFja0F0ID0gdGhpcy5nZXRQb3J0QXV0b0ZhbGxiYWNrTnVtYmVyKCk7XG5cdFx0XHRcdGlmIChmYWxsYmFja0F0ID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5wb3J0TGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKEFycmF5LmZyb20odGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZm9yd2FyZGVkLnZhbHVlcygpKS5maWx0ZXIodHVubmVsID0+IHR1bm5lbC5zb3VyY2Uuc291cmNlID09PSBUdW5uZWxTb3VyY2UuQXV0bykubGVuZ3RoID4gZmFsbGJhY2tBdCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HLCBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfSFlCUklEKTtcblx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgncmVtb3RlLmF1dG9Gb3J3YXJkUG9ydHNTb3VyY2UuZmFsbGJhY2snLCBcIk92ZXIgMjAgcG9ydHMgaGF2ZSBiZWVuIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGVkLiBUaGUgYHByb2Nlc3NgIGJhc2VkIGF1dG9tYXRpYyBwb3J0IGZvcndhcmRpbmcgaGFzIGJlZW4gc3dpdGNoZWQgdG8gYGh5YnJpZGAgaW4gc2V0dGluZ3MuIFNvbWUgcG9ydHMgbWF5IG5vIGxvbmdlciBiZSBkZXRlY3RlZC5cIiksXG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0cHJpbWFyeTogW1xuXHRcdFx0XHRcdFx0XHRcdHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0XHRcdGlkOiAnc3dpdGNoQmFjaycsXG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZW1vdGUuYXV0b0ZvcndhcmRQb3J0c1NvdXJjZS5mYWxsYmFjay5zd2l0Y2hCYWNrJywgXCJVbmRvXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HLCBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfUFJPQ0VTUyk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoUE9SVF9BVVRPX0ZBTExCQUNLX1NFVFRJTkcsIDAsIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5wb3J0TGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5wb3J0TGlzdGVuZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdFx0aWQ6ICdzaG93UG9ydFNvdXJjZVNldHRpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgncmVtb3RlLmF1dG9Gb3J3YXJkUG9ydHNTb3VyY2UuZmFsbGJhY2suc2hvd1BvcnRTb3VyY2VTZXR0aW5nJywgXCJTaG93IFNldHRpbmdcIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblNldHRpbmdzKHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRxdWVyeTogJ3JlbW90ZS5hdXRvRm9yd2FyZFBvcnRzU291cmNlJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5wb3J0TGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMucG9ydExpc3RlbmVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cblx0cHJpdmF0ZSBzZXR1cChlbnZpcm9ubWVudDogSVJlbW90ZUFnZW50RW52aXJvbm1lbnQgfCBudWxsKSB7XG5cdFx0Y29uc3QgYWxyZWFkeUZvcndhcmRlZCA9IHRoaXMucHJvY0ZvcndhcmRlcj8uZm9yd2FyZGVkO1xuXHRcdGNvbnN0IGlzU3dpdGNoID0gdGhpcy5vdXRwdXRGb3J3YXJkZXIgfHwgdGhpcy5wcm9jRm9yd2FyZGVyO1xuXHRcdHRoaXMucHJvY0ZvcndhcmRlcj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMucHJvY0ZvcndhcmRlciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLm91dHB1dEZvcndhcmRlcj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMub3V0cHV0Rm9yd2FyZGVyID0gdW5kZWZpbmVkO1xuXHRcdGlmIChlbnZpcm9ubWVudD8ub3MgIT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCkge1xuXHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxzdHJpbmc+KFBPUlRfQVVUT19TT1VSQ0VfU0VUVElORykuZGVmYXVsdD8udmFsdWUgIT09IFBPUlRfQVVUT19TT1VSQ0VfU0VUVElOR19PVVRQVVQpIHtcblx0XHRcdFx0UmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbilcblx0XHRcdFx0XHQucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW3sgb3ZlcnJpZGVzOiB7ICdyZW1vdGUuYXV0b0ZvcndhcmRQb3J0c1NvdXJjZSc6IFBPUlRfQVVUT19TT1VSQ0VfU0VUVElOR19PVVRQVVQgfSB9XSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm91dHB1dEZvcndhcmRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBPdXRwdXRBdXRvbWF0aWNQb3J0Rm9yd2FyZGluZyh0aGlzLnRlcm1pbmFsU2VydmljZSwgdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLCB0aGlzLm9wZW5lclNlcnZpY2UsIHRoaXMuZXh0ZXJuYWxPcGVuZXJTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5kZWJ1Z1NlcnZpY2UsIHRoaXMudHVubmVsU2VydmljZSwgdGhpcy5ob3N0U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCAoKSA9PiBmYWxzZSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB1c2VQcm9jID0gKCkgPT4gKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HKSA9PT0gUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HX1BST0NFU1MpO1xuXHRcdFx0aWYgKHVzZVByb2MoKSkge1xuXHRcdFx0XHR0aGlzLnByb2NGb3J3YXJkZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUHJvY0F1dG9tYXRpY1BvcnRGb3J3YXJkaW5nKGZhbHNlLCBhbHJlYWR5Rm9yd2FyZGVkLCAhaXNTd2l0Y2gsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLCB0aGlzLmV4dGVybmFsT3BlbmVyU2VydmljZSwgdGhpcy50dW5uZWxTZXJ2aWNlLCB0aGlzLmhvc3RTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkcpID09PSBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfSFlCUklEKSB7XG5cdFx0XHRcdHRoaXMucHJvY0ZvcndhcmRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQcm9jQXV0b21hdGljUG9ydEZvcndhcmRpbmcodHJ1ZSwgYWxyZWFkeUZvcndhcmRlZCwgIWlzU3dpdGNoLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZSwgdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZSwgdGhpcy5leHRlcm5hbE9wZW5lclNlcnZpY2UsIHRoaXMudHVubmVsU2VydmljZSwgdGhpcy5ob3N0U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm91dHB1dEZvcndhcmRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBPdXRwdXRBdXRvbWF0aWNQb3J0Rm9yd2FyZGluZyh0aGlzLnRlcm1pbmFsU2VydmljZSwgdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLCB0aGlzLm9wZW5lclNlcnZpY2UsIHRoaXMuZXh0ZXJuYWxPcGVuZXJTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5kZWJ1Z1NlcnZpY2UsIHRoaXMudHVubmVsU2VydmljZSwgdGhpcy5ob3N0U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB1c2VQcm9jKSk7XG5cdFx0fVxuXHRcdHRoaXMubGlzdGVuRm9yUG9ydHMoKTtcblx0fVxufVxuXG5jbGFzcyBPbkF1dG9Gb3J3YXJkZWRBY3Rpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBsYXN0Tm90aWZ5VGltZTogRGF0ZTtcblx0cHJpdmF0ZSBzdGF0aWMgTk9USUZZX0NPT0xfRE9XTiA9IDUwMDA7IC8vIG1pbGxpc2Vjb25kc1xuXHRwcml2YXRlIGxhc3ROb3RpZmljYXRpb246IElOb3RpZmljYXRpb25IYW5kbGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBsYXN0U2hvd25Qb3J0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZG9BY3Rpb25UdW5uZWxzOiBSZW1vdGVUdW5uZWxbXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhbHJlYWR5T3BlbmVkT25jZTogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZXJuYWxPcGVuZXJTZXJ2aWNlOiBJRXh0ZXJuYWxVcmlPcGVuZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdHVubmVsU2VydmljZTogSVR1bm5lbFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmxhc3ROb3RpZnlUaW1lID0gbmV3IERhdGUoKTtcblx0XHR0aGlzLmxhc3ROb3RpZnlUaW1lLnNldEZ1bGxZZWFyKHRoaXMubGFzdE5vdGlmeVRpbWUuZ2V0RnVsbFllYXIoKSAtIDEpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGRvQWN0aW9uKHR1bm5lbHM6IFJlbW90ZVR1bm5lbFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKE9uQXV0b0ZvcndhcmRlZEFjdGlvbikgU3RhcnRpbmcgYWN0aW9uIGZvciAke3R1bm5lbHNbMF0/LnR1bm5lbFJlbW90ZVBvcnR9YCk7XG5cdFx0dGhpcy5kb0FjdGlvblR1bm5lbHMgPSB0dW5uZWxzO1xuXHRcdGNvbnN0IHR1bm5lbCA9IGF3YWl0IHRoaXMucG9ydE51bWJlckhldXJpc3RpY0RlbGF5KCk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKE9uQXV0b0ZvcndhcmRlZEFjdGlvbikgSGV1cmlzdGljIGNob3NlICR7dHVubmVsPy50dW5uZWxSZW1vdGVQb3J0fWApO1xuXHRcdGlmICh0dW5uZWwpIHtcblx0XHRcdGNvbnN0IGFsbEF0dHJpYnV0ZXMgPSBhd2FpdCB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5nZXRBdHRyaWJ1dGVzKFt7IHBvcnQ6IHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0LCBob3N0OiB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCB9XSk7XG5cdFx0XHRjb25zdCBhdHRyaWJ1dGVzID0gYWxsQXR0cmlidXRlcz8uZ2V0KHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KT8ub25BdXRvRm9yd2FyZDtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChPbkF1dG9Gb3J3YXJkZWRBY3Rpb24pIG9uQXV0b0ZvcndhcmQgYWN0aW9uIGlzICR7YXR0cmlidXRlc31gKTtcblx0XHRcdHN3aXRjaCAoYXR0cmlidXRlcykge1xuXHRcdFx0XHRjYXNlIE9uUG9ydEZvcndhcmQuT3BlbkJyb3dzZXJPbmNlOiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuYWxyZWFkeU9wZW5lZE9uY2UuaGFzKHR1bm5lbC5sb2NhbEFkZHJlc3MpKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5hbHJlYWR5T3BlbmVkT25jZS5hZGQodHVubmVsLmxvY2FsQWRkcmVzcyk7XG5cdFx0XHRcdFx0Ly8gSW50ZW50aW9uYWxseSBkbyBub3QgYnJlYWsgc28gdGhhdCB0aGUgb3BlbiBicm93c2VyIHBhdGggY2FuIGJlIHJ1bi5cblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIE9uUG9ydEZvcndhcmQuT3BlbkJyb3dzZXI6IHtcblx0XHRcdFx0XHRjb25zdCBhZGRyZXNzID0gbWFrZUFkZHJlc3ModHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsIHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KTtcblx0XHRcdFx0XHRhd2FpdCBPcGVuUG9ydEluQnJvd3NlckFjdGlvbi5ydW4odGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwsIHRoaXMub3BlbmVyU2VydmljZSwgYWRkcmVzcyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBPblBvcnRGb3J3YXJkLk9wZW5QcmV2aWV3OiB7XG5cdFx0XHRcdFx0Y29uc3QgYWRkcmVzcyA9IG1ha2VBZGRyZXNzKHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCk7XG5cdFx0XHRcdFx0YXdhaXQgT3BlblBvcnRJblByZXZpZXdBY3Rpb24ucnVuKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLCB0aGlzLm9wZW5lclNlcnZpY2UsIHRoaXMuZXh0ZXJuYWxPcGVuZXJTZXJ2aWNlLCBhZGRyZXNzKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIE9uUG9ydEZvcndhcmQuU2lsZW50OiBicmVhaztcblx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdGNvbnN0IGVsYXBzZWQgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHRoaXMubGFzdE5vdGlmeVRpbWUuZ2V0VGltZSgpO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChPbkF1dG9Gb3J3YXJkZWRBY3Rpb24pIHRpbWUgZWxhcHNlZCBzaW5jZSBsYXN0IG5vdGlmaWNhdGlvbiAke2VsYXBzZWR9IG1zYCk7XG5cdFx0XHRcdFx0aWYgKGVsYXBzZWQgPiBPbkF1dG9Gb3J3YXJkZWRBY3Rpb24uTk9USUZZX0NPT0xfRE9XTikge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5zaG93Tm90aWZpY2F0aW9uKHR1bm5lbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGhpZGUocmVtb3ZlZFBvcnRzOiBudW1iZXJbXSkge1xuXHRcdGlmICh0aGlzLmRvQWN0aW9uVHVubmVscykge1xuXHRcdFx0dGhpcy5kb0FjdGlvblR1bm5lbHMgPSB0aGlzLmRvQWN0aW9uVHVubmVscy5maWx0ZXIodmFsdWUgPT4gIXJlbW92ZWRQb3J0cy5pbmNsdWRlcyh2YWx1ZS50dW5uZWxSZW1vdGVQb3J0KSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmxhc3RTaG93blBvcnQgJiYgcmVtb3ZlZFBvcnRzLmluZGV4T2YodGhpcy5sYXN0U2hvd25Qb3J0KSA+PSAwKSB7XG5cdFx0XHR0aGlzLmxhc3ROb3RpZmljYXRpb24/LmNsb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBuZXdlclR1bm5lbDogUmVtb3RlVHVubmVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFzeW5jIHBvcnROdW1iZXJIZXVyaXN0aWNEZWxheSgpOiBQcm9taXNlPFJlbW90ZVR1bm5lbCB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChPbkF1dG9Gb3J3YXJkZWRBY3Rpb24pIFN0YXJ0aW5nIGhldXJpc3RpYyBkZWxheWApO1xuXHRcdGlmICghdGhpcy5kb0FjdGlvblR1bm5lbHMgfHwgdGhpcy5kb0FjdGlvblR1bm5lbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZG9BY3Rpb25UdW5uZWxzID0gdGhpcy5kb0FjdGlvblR1bm5lbHMuc29ydCgoYSwgYikgPT4gYS50dW5uZWxSZW1vdGVQb3J0IC0gYi50dW5uZWxSZW1vdGVQb3J0KTtcblx0XHRjb25zdCBmaXJzdFR1bm5lbCA9IHRoaXMuZG9BY3Rpb25UdW5uZWxzLnNoaWZ0KCkhO1xuXHRcdC8vIEhldXJpc3RpYy5cblx0XHRpZiAoZmlyc3RUdW5uZWwudHVubmVsUmVtb3RlUG9ydCAlIDEwMDAgPT09IDApIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChPbkF1dG9Gb3J3YXJkZWRBY3Rpb24pIEhldXJpc3RpYyBjaG9zZSB0dW5uZWwgYmVjYXVzZSAlIDEwMDA6ICR7Zmlyc3RUdW5uZWwudHVubmVsUmVtb3RlUG9ydH1gKTtcblx0XHRcdHRoaXMubmV3ZXJUdW5uZWwgPSBmaXJzdFR1bm5lbDtcblx0XHRcdHJldHVybiBmaXJzdFR1bm5lbDtcblx0XHRcdC8vIDkyMjkgaXMgdGhlIG5vZGUgaW5zcGVjdCBwb3J0XG5cdFx0fSBlbHNlIGlmIChmaXJzdFR1bm5lbC50dW5uZWxSZW1vdGVQb3J0IDwgMTAwMDAgJiYgZmlyc3RUdW5uZWwudHVubmVsUmVtb3RlUG9ydCAhPT0gOTIyOSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKE9uQXV0b0ZvcndhcmRlZEFjdGlvbikgSGV1cmlzdGljIGNob3NlIHR1bm5lbCBiZWNhdXNlIDwgMTAwMDA6ICR7Zmlyc3RUdW5uZWwudHVubmVsUmVtb3RlUG9ydH1gKTtcblx0XHRcdHRoaXMubmV3ZXJUdW5uZWwgPSBmaXJzdFR1bm5lbDtcblx0XHRcdHJldHVybiBmaXJzdFR1bm5lbDtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoT25BdXRvRm9yd2FyZGVkQWN0aW9uKSBXYWl0aW5nIGZvciBcImJldHRlclwiIHR1bm5lbCB0aGFuICR7Zmlyc3RUdW5uZWwudHVubmVsUmVtb3RlUG9ydH1gKTtcblx0XHR0aGlzLm5ld2VyVHVubmVsID0gdW5kZWZpbmVkO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5uZXdlclR1bm5lbCkge1xuXHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLmRvQWN0aW9uVHVubmVscz8uaW5jbHVkZXMoZmlyc3RUdW5uZWwpKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZShmaXJzdFR1bm5lbCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAzMDAwKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYmFzaWNNZXNzYWdlKHR1bm5lbDogUmVtb3RlVHVubmVsKSB7XG5cdFx0Y29uc3QgcHJvcGVydGllcyA9IGF3YWl0IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmdldEF0dHJpYnV0ZXMoW3sgaG9zdDogdHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsIHBvcnQ6IHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0IH1dLCBmYWxzZSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBwcm9wZXJ0aWVzPy5nZXQodHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpPy5sYWJlbDtcblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsc1ZpZXcuYXV0b21hdGljRm9yd2FyZCcsIFwiWW91ciBhcHBsaWNhdGlvbnswfSBydW5uaW5nIG9uIHBvcnQgezF9IGlzIGF2YWlsYWJsZS4gIFwiLFxuXHRcdFx0bGFiZWwgPyBgICgke2xhYmVsfSlgIDogJycsXG5cdFx0XHR0dW5uZWwudHVubmVsUmVtb3RlUG9ydCk7XG5cdH1cblxuXHRwcml2YXRlIGxpbmtNZXNzYWdlKCkge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoXG5cdFx0XHR7IGtleTogJ3JlbW90ZS50dW5uZWxzVmlldy5ub3RpZmljYXRpb25MaW5rMicsIGNvbW1lbnQ6IFsnW1NlZSBhbGwgZm9yd2FyZGVkIHBvcnRzXSh7MH0pIGlzIGEgbGluay4gT25seSB0cmFuc2xhdGUgYFNlZSBhbGwgZm9yd2FyZGVkIHBvcnRzYC4gRG8gbm90IGNoYW5nZSBicmFja2V0cyBhbmQgcGFyZW50aGVzZXMgb3IgezB9J10gfSxcblx0XHRcdFwiW1NlZSBhbGwgZm9yd2FyZGVkIHBvcnRzXSh7MH0pXCIsIGBjb21tYW5kOiR7VHVubmVsUGFuZWwuSUR9LmZvY3VzYCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dOb3RpZmljYXRpb24odHVubmVsOiBSZW1vdGVUdW5uZWwpIHtcblx0XHRpZiAoIWF3YWl0IHRoaXMuaG9zdFNlcnZpY2UuaGFkTGFzdEZvY3VzKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxhc3ROb3RpZmljYXRpb24/LmNsb3NlKCk7XG5cdFx0bGV0IG1lc3NhZ2UgPSBhd2FpdCB0aGlzLmJhc2ljTWVzc2FnZSh0dW5uZWwpO1xuXHRcdGNvbnN0IGNob2ljZXMgPSBbdGhpcy5vcGVuQnJvd3NlckNob2ljZSh0dW5uZWwpXTtcblx0XHRpZiAoIWlzV2ViIHx8IG9wZW5QcmV2aWV3RW5hYmxlZENvbnRleHQuZ2V0VmFsdWUodGhpcy5jb250ZXh0S2V5U2VydmljZSkpIHtcblx0XHRcdGNob2ljZXMucHVzaCh0aGlzLm9wZW5QcmV2aWV3Q2hvaWNlKHR1bm5lbCkpO1xuXHRcdH1cblxuXHRcdGlmICgodHVubmVsLnR1bm5lbExvY2FsUG9ydCAhPT0gdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpICYmIHRoaXMudHVubmVsU2VydmljZS5jYW5FbGV2YXRlICYmIHRoaXMudHVubmVsU2VydmljZS5pc1BvcnRQcml2aWxlZ2VkKHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KSkge1xuXHRcdFx0Ly8gUHJpdmlsZWdlZCBwb3J0cyBhcmUgbm90IG9uIFdpbmRvd3MsIHNvIGl0J3Mgc2FmZSB0byB1c2UgXCJzdXBlcnVzZXJcIlxuXHRcdFx0bWVzc2FnZSArPSBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWxzVmlldy5lbGV2YXRpb25NZXNzYWdlJywgXCJZb3UnbGwgbmVlZCB0byBydW4gYXMgc3VwZXJ1c2VyIHRvIHVzZSBwb3J0IHswfSBsb2NhbGx5LiAgXCIsIHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KTtcblx0XHRcdGNob2ljZXMudW5zaGlmdCh0aGlzLmVsZXZhdGVDaG9pY2UodHVubmVsKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHR1bm5lbC5wcml2YWN5ID09PSBUdW5uZWxQcml2YWN5SWQuUHJpdmF0ZSAmJiBpc1dlYiAmJiB0aGlzLnR1bm5lbFNlcnZpY2UuY2FuQ2hhbmdlUHJpdmFjeSkge1xuXHRcdFx0Y2hvaWNlcy5wdXNoKHRoaXMubWFrZVB1YmxpY0Nob2ljZSh0dW5uZWwpKTtcblx0XHR9XG5cblx0XHRtZXNzYWdlICs9IHRoaXMubGlua01lc3NhZ2UoKTtcblxuXHRcdHRoaXMubGFzdE5vdGlmaWNhdGlvbiA9IHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuSW5mbywgbWVzc2FnZSwgY2hvaWNlcywgeyBuZXZlclNob3dBZ2FpbjogeyBpZDogJ3JlbW90ZS50dW5uZWxzVmlldy5hdXRvRm9yd2FyZE5ldmVyU2hvdycsIGlzU2Vjb25kYXJ5OiB0cnVlIH0gfSk7XG5cdFx0dGhpcy5sYXN0U2hvd25Qb3J0ID0gdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQ7XG5cdFx0dGhpcy5sYXN0Tm90aWZ5VGltZSA9IG5ldyBEYXRlKCk7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25EaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5sYXN0Tm90aWZpY2F0aW9uLm9uRGlkQ2xvc2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5sYXN0Tm90aWZpY2F0aW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5sYXN0U2hvd25Qb3J0ID0gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBtYWtlUHVibGljQ2hvaWNlKHR1bm5lbDogUmVtb3RlVHVubmVsKTogSVByb21wdENob2ljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWxzVmlldy5tYWtlUHVibGljJywgXCJNYWtlIFB1YmxpY1wiKSxcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBvbGRUdW5uZWxEZXRhaWxzID0gbWFwSGFzQWRkcmVzc0xvY2FsaG9zdE9yQWxsSW50ZXJmYWNlcyh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQsIHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmNsb3NlKHsgaG9zdDogdHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsIHBvcnQ6IHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0IH0sIFR1bm5lbENsb3NlUmVhc29uLk90aGVyKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmZvcndhcmQoe1xuXHRcdFx0XHRcdHJlbW90ZTogeyBob3N0OiB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCwgcG9ydDogdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQgfSxcblx0XHRcdFx0XHRsb2NhbDogdHVubmVsLnR1bm5lbExvY2FsUG9ydCxcblx0XHRcdFx0XHRuYW1lOiBvbGRUdW5uZWxEZXRhaWxzPy5uYW1lLFxuXHRcdFx0XHRcdGVsZXZhdGVJZk5lZWRlZDogdHJ1ZSxcblx0XHRcdFx0XHRwcml2YWN5OiBUdW5uZWxQcml2YWN5SWQuUHVibGljLFxuXHRcdFx0XHRcdHNvdXJjZTogb2xkVHVubmVsRGV0YWlscz8uc291cmNlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIG9wZW5Ccm93c2VyQ2hvaWNlKHR1bm5lbDogUmVtb3RlVHVubmVsKTogSVByb21wdENob2ljZSB7XG5cdFx0Y29uc3QgYWRkcmVzcyA9IG1ha2VBZGRyZXNzKHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiBPcGVuUG9ydEluQnJvd3NlckFjdGlvbi5MQUJFTCxcblx0XHRcdHJ1bjogKCkgPT4gT3BlblBvcnRJbkJyb3dzZXJBY3Rpb24ucnVuKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLCB0aGlzLm9wZW5lclNlcnZpY2UsIGFkZHJlc3MpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgb3BlblByZXZpZXdDaG9pY2UodHVubmVsOiBSZW1vdGVUdW5uZWwpOiBJUHJvbXB0Q2hvaWNlIHtcblx0XHRjb25zdCBhZGRyZXNzID0gbWFrZUFkZHJlc3ModHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsIHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IE9wZW5Qb3J0SW5QcmV2aWV3QWN0aW9uLkxBQkVMLFxuXHRcdFx0cnVuOiAoKSA9PiBPcGVuUG9ydEluUHJldmlld0FjdGlvbi5ydW4odGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwsIHRoaXMub3BlbmVyU2VydmljZSwgdGhpcy5leHRlcm5hbE9wZW5lclNlcnZpY2UsIGFkZHJlc3MpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZWxldmF0ZUNob2ljZSh0dW5uZWw6IFJlbW90ZVR1bm5lbCk6IElQcm9tcHRDaG9pY2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHQvLyBQcml2aWxlZ2VkIHBvcnRzIGFyZSBub3Qgb24gV2luZG93cywgc28gaXQncyBvayB0byBzdGljayB0byBqdXN0IFwic3Vkb1wiLlxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbHNWaWV3LmVsZXZhdGlvbkJ1dHRvbicsIFwiVXNlIFBvcnQgezB9IGFzIFN1ZG8uLi5cIiwgdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpLFxuXHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmNsb3NlKHsgaG9zdDogdHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsIHBvcnQ6IHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0IH0sIFR1bm5lbENsb3NlUmVhc29uLk90aGVyKTtcblx0XHRcdFx0Y29uc3QgbmV3VHVubmVsID0gYXdhaXQgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UuZm9yd2FyZCh7XG5cdFx0XHRcdFx0cmVtb3RlOiB7IGhvc3Q6IHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCBwb3J0OiB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCB9LFxuXHRcdFx0XHRcdGxvY2FsOiB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCxcblx0XHRcdFx0XHRlbGV2YXRlSWZOZWVkZWQ6IHRydWUsXG5cdFx0XHRcdFx0c291cmNlOiBBdXRvVHVubmVsU291cmNlXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoIW5ld1R1bm5lbCB8fCAodHlwZW9mIG5ld1R1bm5lbCA9PT0gJ3N0cmluZycpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMubGFzdE5vdGlmaWNhdGlvbj8uY2xvc2UoKTtcblx0XHRcdFx0dGhpcy5sYXN0U2hvd25Qb3J0ID0gbmV3VHVubmVsLnR1bm5lbFJlbW90ZVBvcnQ7XG5cdFx0XHRcdHRoaXMubGFzdE5vdGlmaWNhdGlvbiA9IHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmJhc2ljTWVzc2FnZShuZXdUdW5uZWwpICsgdGhpcy5saW5rTWVzc2FnZSgpLFxuXHRcdFx0XHRcdFt0aGlzLm9wZW5Ccm93c2VyQ2hvaWNlKG5ld1R1bm5lbCksIHRoaXMub3BlblByZXZpZXdDaG9pY2UodHVubmVsKV0sXG5cdFx0XHRcdFx0eyBuZXZlclNob3dBZ2FpbjogeyBpZDogJ3JlbW90ZS50dW5uZWxzVmlldy5hdXRvRm9yd2FyZE5ldmVyU2hvdycsIGlzU2Vjb25kYXJ5OiB0cnVlIH0gfSk7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMubGFzdE5vdGlmaWNhdGlvbi5vbkRpZENsb3NlKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmxhc3ROb3RpZmljYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5sYXN0U2hvd25Qb3J0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIE91dHB1dEF1dG9tYXRpY1BvcnRGb3J3YXJkaW5nIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcG9ydHNGZWF0dXJlcz86IElEaXNwb3NhYmxlO1xuXHRwcml2YXRlIHVybEZpbmRlcj86IFVybEZpbmRlcjtcblx0cHJpdmF0ZSBub3RpZmllcjogT25BdXRvRm9yd2FyZGVkQWN0aW9uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IGV4dGVybmFsT3BlbmVyU2VydmljZTogSUV4dGVybmFsVXJpT3BlbmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0cmVhZG9ubHkgdHVubmVsU2VydmljZTogSVR1bm5lbFNlcnZpY2UsXG5cdFx0cmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRyZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRyZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IHByaXZpbGVnZWRPbmx5OiAoKSA9PiBib29sZWFuXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5ub3RpZmllciA9IG5ldyBPbkF1dG9Gb3J3YXJkZWRBY3Rpb24obm90aWZpY2F0aW9uU2VydmljZSwgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBleHRlcm5hbE9wZW5lclNlcnZpY2UsIHR1bm5lbFNlcnZpY2UsIGhvc3RTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihQT1JUX0FVVE9fRk9SV0FSRF9TRVRUSU5HKSkge1xuXHRcdFx0XHR0aGlzLnRyeVN0YXJ0U3RvcFVybEZpbmRlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMucG9ydHNGZWF0dXJlcyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLm9uRW5hYmxlZFBvcnRzRmVhdHVyZXMoKCkgPT4ge1xuXHRcdFx0dGhpcy50cnlTdGFydFN0b3BVcmxGaW5kZXIoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy50cnlTdGFydFN0b3BVcmxGaW5kZXIoKTtcblxuXHRcdGlmIChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkcpID09PSBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfSFlCUklEKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnR1bm5lbFNlcnZpY2Uub25UdW5uZWxDbG9zZWQodHVubmVsID0+IHRoaXMubm90aWZpZXIuaGlkZShbdHVubmVsLnBvcnRdKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdHJ5U3RhcnRTdG9wVXJsRmluZGVyKCkge1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFBPUlRfQVVUT19GT1JXQVJEX1NFVFRJTkcpKSB7XG5cdFx0XHR0aGlzLnN0YXJ0VXJsRmluZGVyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcFVybEZpbmRlcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhcnRVcmxGaW5kZXIoKSB7XG5cdFx0aWYgKCF0aGlzLnVybEZpbmRlciAmJiAodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UucG9ydHNGZWF0dXJlc0VuYWJsZWQgIT09IFBvcnRzRW5hYmxlbWVudC5BZGRpdGlvbmFsRmVhdHVyZXMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucG9ydHNGZWF0dXJlcz8uZGlzcG9zZSgpO1xuXHRcdHRoaXMudXJsRmluZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFVybEZpbmRlcih0aGlzLnRlcm1pbmFsU2VydmljZSwgdGhpcy5kZWJ1Z1NlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnVybEZpbmRlci5vbkRpZE1hdGNoTG9jYWxVcmwoYXN5bmMgKGxvY2FsVXJsKSA9PiB7XG5cdFx0XHRpZiAobWFwSGFzQWRkcmVzc0xvY2FsaG9zdE9yQWxsSW50ZXJmYWNlcyh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5kZXRlY3RlZCwgbG9jYWxVcmwuaG9zdCwgbG9jYWxVcmwucG9ydCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXR0cmlidXRlcyA9IChhd2FpdCB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5nZXRBdHRyaWJ1dGVzKFtsb2NhbFVybF0pKT8uZ2V0KGxvY2FsVXJsLnBvcnQpO1xuXHRcdFx0aWYgKGF0dHJpYnV0ZXM/Lm9uQXV0b0ZvcndhcmQgPT09IE9uUG9ydEZvcndhcmQuSWdub3JlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnByaXZpbGVnZWRPbmx5KCkgJiYgIXRoaXMudHVubmVsU2VydmljZS5pc1BvcnRQcml2aWxlZ2VkKGxvY2FsVXJsLnBvcnQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZvcndhcmRlZCA9IGF3YWl0IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmZvcndhcmQoeyByZW1vdGU6IGxvY2FsVXJsLCBzb3VyY2U6IEF1dG9UdW5uZWxTb3VyY2UgfSwgYXR0cmlidXRlcyA/PyBudWxsKTtcblx0XHRcdGlmIChmb3J3YXJkZWQgJiYgKHR5cGVvZiBmb3J3YXJkZWQgIT09ICdzdHJpbmcnKSkge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWVyLmRvQWN0aW9uKFtmb3J3YXJkZWRdKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHN0b3BVcmxGaW5kZXIoKSB7XG5cdFx0aWYgKHRoaXMudXJsRmluZGVyKSB7XG5cdFx0XHR0aGlzLnVybEZpbmRlci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnVybEZpbmRlciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUHJvY0F1dG9tYXRpY1BvcnRGb3J3YXJkaW5nIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgY2FuZGlkYXRlTGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGF1dG9Gb3J3YXJkZWQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXHRwcml2YXRlIG5vdGlmaWVkT25seTogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdHByaXZhdGUgbm90aWZpZXI6IE9uQXV0b0ZvcndhcmRlZEFjdGlvbjtcblx0cHJpdmF0ZSBpbml0aWFsQ2FuZGlkYXRlczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdHByaXZhdGUgcG9ydHNGZWF0dXJlczogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1bmZvcndhcmRPbmx5OiBib29sZWFuLFxuXHRcdHJlYWRvbmx5IGFscmVhZHlBdXRvRm9yd2FyZGVkOiBTZXQ8c3RyaW5nPiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5lZWRzSW5pdGlhbENhbmRpZGF0ZXM6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRyZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRyZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRyZWFkb25seSBleHRlcm5hbE9wZW5lclNlcnZpY2U6IElFeHRlcm5hbFVyaU9wZW5lclNlcnZpY2UsXG5cdFx0cmVhZG9ubHkgdHVubmVsU2VydmljZTogSVR1bm5lbFNlcnZpY2UsXG5cdFx0cmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRyZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRyZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMubm90aWZpZXIgPSBuZXcgT25BdXRvRm9yd2FyZGVkQWN0aW9uKG5vdGlmaWNhdGlvblNlcnZpY2UsIHJlbW90ZUV4cGxvcmVyU2VydmljZSwgb3BlbmVyU2VydmljZSwgZXh0ZXJuYWxPcGVuZXJTZXJ2aWNlLCB0dW5uZWxTZXJ2aWNlLCBob3N0U2VydmljZSwgbG9nU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFscmVhZHlBdXRvRm9yd2FyZGVkPy5mb3JFYWNoKHBvcnQgPT4gdGhpcy5hdXRvRm9yd2FyZGVkLmFkZChwb3J0KSk7XG5cdFx0dGhpcy5pbml0aWFsaXplKCk7XG5cdH1cblxuXHRnZXQgZm9yd2FyZGVkKCk6IFNldDxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5hdXRvRm9yd2FyZGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplKCkge1xuXHRcdGlmICghdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZW52aXJvbm1lbnRUdW5uZWxzU2V0KSB7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLm9uRW52aXJvbm1lbnRUdW5uZWxzU2V0KCgpID0+IHJlc29sdmUoKSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihQT1JUX0FVVE9fRk9SV0FSRF9TRVRUSU5HKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnN0YXJ0U3RvcENhbmRpZGF0ZUxpc3RlbmVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5wb3J0c0ZlYXR1cmVzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2Uub25FbmFibGVkUG9ydHNGZWF0dXJlcyhhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnN0YXJ0U3RvcENhbmRpZGF0ZUxpc3RlbmVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zdGFydFN0b3BDYW5kaWRhdGVMaXN0ZW5lcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzdGFydFN0b3BDYW5kaWRhdGVMaXN0ZW5lcigpIHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShQT1JUX0FVVE9fRk9SV0FSRF9TRVRUSU5HKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5zdGFydENhbmRpZGF0ZUxpc3RlbmVyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcENhbmRpZGF0ZUxpc3RlbmVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdG9wQ2FuZGlkYXRlTGlzdGVuZXIoKSB7XG5cdFx0aWYgKHRoaXMuY2FuZGlkYXRlTGlzdGVuZXIpIHtcblx0XHRcdHRoaXMuY2FuZGlkYXRlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5jYW5kaWRhdGVMaXN0ZW5lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN0YXJ0Q2FuZGlkYXRlTGlzdGVuZXIoKSB7XG5cdFx0aWYgKHRoaXMuY2FuZGlkYXRlTGlzdGVuZXIgfHwgKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnBvcnRzRmVhdHVyZXNFbmFibGVkICE9PSBQb3J0c0VuYWJsZW1lbnQuQWRkaXRpb25hbEZlYXR1cmVzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnBvcnRzRmVhdHVyZXM/LmRpc3Bvc2UoKTtcblxuXHRcdC8vIENhcHR1cmUgbGlzdCBvZiBzdGFydGluZyBjYW5kaWRhdGVzIHNvIHdlIGRvbid0IGF1dG8gZm9yd2FyZCB0aGVtIGxhdGVyLlxuXHRcdGF3YWl0IHRoaXMuc2V0SW5pdGlhbENhbmRpZGF0ZXMoKTtcblxuXHRcdC8vIE5lZWQgdG8gY2hlY2sgdGhlIHNldHRpbmcgYWdhaW4sIHNpbmNlIGl0IG1heSBoYXZlIGNoYW5nZWQgd2hpbGUgd2Ugd2FpdGVkIGZvciB0aGUgaW5pdGlhbCBjYW5kaWRhdGVzIHRvIGJlIHNldC5cblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShQT1JUX0FVVE9fRk9SV0FSRF9TRVRUSU5HKSkge1xuXHRcdFx0dGhpcy5jYW5kaWRhdGVMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLm9uQ2FuZGlkYXRlc0NoYW5nZWQodGhpcy5oYW5kbGVDYW5kaWRhdGVVcGRhdGUsIHRoaXMpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNldEluaXRpYWxDYW5kaWRhdGVzKCkge1xuXHRcdGlmICghdGhpcy5uZWVkc0luaXRpYWxDYW5kaWRhdGVzKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYEZvcndhcmRlZFBvcnRzOiAoUHJvY0ZvcndhcmRpbmcpIE5vdCBzZXR0aW5nIGluaXRpYWwgY2FuZGlkYXRlc2ApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgc3RhcnRpbmdDYW5kaWRhdGVzID0gdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuY2FuZGlkYXRlc09yVW5kZWZpbmVkO1xuXHRcdGlmICghc3RhcnRpbmdDYW5kaWRhdGVzKSB7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLm9uQ2FuZGlkYXRlc0NoYW5nZWQoKCkgPT4gcmVzb2x2ZSgpKSk7XG5cdFx0XHRzdGFydGluZ0NhbmRpZGF0ZXMgPSB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5jYW5kaWRhdGVzO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgdmFsdWUgb2Ygc3RhcnRpbmdDYW5kaWRhdGVzKSB7XG5cdFx0XHR0aGlzLmluaXRpYWxDYW5kaWRhdGVzLmFkZChtYWtlQWRkcmVzcyh2YWx1ZS5ob3N0LCB2YWx1ZS5wb3J0KSk7XG5cdFx0fVxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgRm9yd2FyZGVkUG9ydHM6IChQcm9jRm9yd2FyZGluZykgSW5pdGlhbCBjYW5kaWRhdGVzIHNldCB0byAke3N0YXJ0aW5nQ2FuZGlkYXRlcy5tYXAoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5wb3J0KS5qb2luKCcsICcpfWApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBmb3J3YXJkQ2FuZGlkYXRlcygpOiBQcm9taXNlPFJlbW90ZVR1bm5lbFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IGF0dHJpYnV0ZXM6IE1hcDxudW1iZXIsIEF0dHJpYnV0ZXM+IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFsbFR1bm5lbHM6IFJlbW90ZVR1bm5lbFtdID0gW107XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKFByb2NGb3J3YXJkaW5nKSBBdHRlbXB0aW5nIHRvIGZvcndhcmQgJHt0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5jYW5kaWRhdGVzLmxlbmd0aH0gY2FuZGlkYXRlc2ApO1xuXHRcdGZvciAoY29uc3QgdmFsdWUgb2YgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuY2FuZGlkYXRlcykge1xuXHRcdFx0aWYgKCF2YWx1ZS5kZXRhaWwpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKFByb2NGb3J3YXJkaW5nKSBQb3J0ICR7dmFsdWUucG9ydH0gbWlzc2luZyBkZXRhaWxgKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNDYW5kaWRhdGVSZW1hcHBlZFR1bm5lbExvY2FsRW5kcG9pbnQodmFsdWUsIHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmZvcndhcmRlZC52YWx1ZXMoKSkpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKFByb2NGb3J3YXJkaW5nKSBQb3J0ICR7dmFsdWUucG9ydH0gaXMgdGhlIGxvY2FsIHBvcnQgb2YgYSBmb3J3YXJkZWQgdHVubmVsYCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWF0dHJpYnV0ZXMpIHtcblx0XHRcdFx0YXR0cmlidXRlcyA9IGF3YWl0IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmdldEF0dHJpYnV0ZXModGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuY2FuZGlkYXRlcyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBvcnRBdHRyaWJ1dGVzID0gYXR0cmlidXRlcz8uZ2V0KHZhbHVlLnBvcnQpO1xuXG5cdFx0XHRjb25zdCBhZGRyZXNzID0gbWFrZUFkZHJlc3ModmFsdWUuaG9zdCwgdmFsdWUucG9ydCk7XG5cdFx0XHRpZiAodGhpcy5pbml0aWFsQ2FuZGlkYXRlcy5oYXMoYWRkcmVzcykgJiYgKHBvcnRBdHRyaWJ1dGVzPy5vbkF1dG9Gb3J3YXJkID09PSB1bmRlZmluZWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMubm90aWZpZWRPbmx5LmhhcyhhZGRyZXNzKSB8fCB0aGlzLmF1dG9Gb3J3YXJkZWQuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWxyZWFkeUZvcndhcmRlZCA9IG1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXModGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZm9yd2FyZGVkLCB2YWx1ZS5ob3N0LCB2YWx1ZS5wb3J0KTtcblx0XHRcdGlmIChtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmRldGVjdGVkLCB2YWx1ZS5ob3N0LCB2YWx1ZS5wb3J0KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHBvcnRBdHRyaWJ1dGVzPy5vbkF1dG9Gb3J3YXJkID09PSBPblBvcnRGb3J3YXJkLklnbm9yZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoUHJvY0ZvcndhcmRpbmcpIFBvcnQgJHt2YWx1ZS5wb3J0fSBpcyBpZ25vcmVkYCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZm9yd2FyZGVkID0gYXdhaXQgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UuZm9yd2FyZCh7IHJlbW90ZTogdmFsdWUsIHNvdXJjZTogQXV0b1R1bm5lbFNvdXJjZSB9LCBwb3J0QXR0cmlidXRlcyA/PyBudWxsKTtcblx0XHRcdGlmICghYWxyZWFkeUZvcndhcmRlZCAmJiBmb3J3YXJkZWQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKFByb2NGb3J3YXJkaW5nKSBQb3J0ICR7dmFsdWUucG9ydH0gaGFzIGJlZW4gZm9yd2FyZGVkYCk7XG5cdFx0XHRcdHRoaXMuYXV0b0ZvcndhcmRlZC5hZGQoYWRkcmVzcyk7XG5cdFx0XHR9IGVsc2UgaWYgKGZvcndhcmRlZCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoUHJvY0ZvcndhcmRpbmcpIFBvcnQgJHt2YWx1ZS5wb3J0fSBoYXMgYmVlbiBub3RpZmllZGApO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWVkT25seS5hZGQoYWRkcmVzcyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZm9yd2FyZGVkICYmICh0eXBlb2YgZm9yd2FyZGVkICE9PSAnc3RyaW5nJykpIHtcblx0XHRcdFx0YWxsVHVubmVscy5wdXNoKGZvcndhcmRlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChQcm9jRm9yd2FyZGluZykgRm9yd2FyZGVkICR7YWxsVHVubmVscy5sZW5ndGh9IGNhbmRpZGF0ZXNgKTtcblx0XHRpZiAoYWxsVHVubmVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBhbGxUdW5uZWxzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVDYW5kaWRhdGVVcGRhdGUocmVtb3ZlZDogTWFwPHN0cmluZywgeyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9Pikge1xuXHRcdGNvbnN0IHJlbW92ZWRQb3J0czogbnVtYmVyW10gPSBbXTtcblx0XHRsZXQgYXV0b0ZvcndhcmRlZDogTWFwPHN0cmluZywgc3RyaW5nIHwgVHVubmVsPjtcblx0XHRpZiAodGhpcy51bmZvcndhcmRPbmx5KSB7XG5cdFx0XHRhdXRvRm9yd2FyZGVkID0gbmV3IE1hcCgpO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQuZW50cmllcygpKSB7XG5cdFx0XHRcdGlmIChlbnRyeVsxXS5zb3VyY2Uuc291cmNlID09PSBUdW5uZWxTb3VyY2UuQXV0bykge1xuXHRcdFx0XHRcdGF1dG9Gb3J3YXJkZWQuc2V0KGVudHJ5WzBdLCBlbnRyeVsxXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0YXV0b0ZvcndhcmRlZCA9IG5ldyBNYXAodGhpcy5hdXRvRm9yd2FyZGVkLmVudHJpZXMoKSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCByZW1vdmVkUG9ydCBvZiByZW1vdmVkKSB7XG5cdFx0XHRjb25zdCBrZXkgPSByZW1vdmVkUG9ydFswXTtcblx0XHRcdGxldCB2YWx1ZSA9IHJlbW92ZWRQb3J0WzFdO1xuXHRcdFx0Y29uc3QgZm9yd2FyZGVkVmFsdWUgPSBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKGF1dG9Gb3J3YXJkZWQsIHZhbHVlLmhvc3QsIHZhbHVlLnBvcnQpO1xuXHRcdFx0aWYgKGZvcndhcmRlZFZhbHVlKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgZm9yd2FyZGVkVmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dGhpcy5hdXRvRm9yd2FyZGVkLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHZhbHVlID0geyBob3N0OiBmb3J3YXJkZWRWYWx1ZS5yZW1vdGVIb3N0LCBwb3J0OiBmb3J3YXJkZWRWYWx1ZS5yZW1vdGVQb3J0IH07XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UuY2xvc2UodmFsdWUsIFR1bm5lbENsb3NlUmVhc29uLkF1dG9Gb3J3YXJkRW5kKTtcblx0XHRcdFx0cmVtb3ZlZFBvcnRzLnB1c2godmFsdWUucG9ydCk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMubm90aWZpZWRPbmx5LmRlbGV0ZShrZXkpKSB7XG5cdFx0XHRcdHJlbW92ZWRQb3J0cy5wdXNoKHZhbHVlLnBvcnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5pbml0aWFsQ2FuZGlkYXRlcy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy51bmZvcndhcmRPbmx5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHJlbW92ZWRQb3J0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm5vdGlmaWVyLmhpZGUocmVtb3ZlZFBvcnRzKTtcblx0XHR9XG5cblx0XHRjb25zdCB0dW5uZWxzID0gYXdhaXQgdGhpcy5mb3J3YXJkQ2FuZGlkYXRlcygpO1xuXHRcdGlmICh0dW5uZWxzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm5vdGlmaWVyLmRvQWN0aW9uKHR1bm5lbHMpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFJQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxZQUF5Qix5QkFBeUI7QUFFM0QsU0FBUyxZQUFvRSw2QkFBNkI7QUFDMUcsU0FBUyx3QkFBd0IsNEJBQTRCLDJCQUEyQiwwQkFBMEIsaUNBQWlDLGlDQUFpQyxrQ0FBa0MsaUJBQWlCLDBCQUEwQixzQkFBc0I7QUFDdlIsU0FB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
