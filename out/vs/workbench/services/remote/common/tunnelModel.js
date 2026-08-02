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
import { debounce } from "../../../../base/common/decorators.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { hash } from "../../../../base/common/hash.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IRemoteAuthorityResolverService } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITunnelService, TunnelProtocol, TunnelPrivacyId, LOCALHOST_ADDRESSES, isLocalhost, isAllInterfaces, ProvidedOnAutoForward, ALL_INTERFACES_ADDRESSES } from "../../../../platform/tunnel/common/tunnel.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { isNumber, isObject, isString } from "../../../../base/common/types.js";
import { deepClone } from "../../../../base/common/objects.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
const MISMATCH_LOCAL_PORT_COOLDOWN = 10 * 1e3;
const TUNNELS_TO_RESTORE = "remote.tunnels.toRestore";
const TUNNELS_TO_RESTORE_EXPIRATION = "remote.tunnels.toRestoreExpiration";
const RESTORE_EXPIRATION_TIME = 1e3 * 60 * 60 * 24 * 14;
const ACTIVATION_EVENT = "onTunnel";
const forwardedPortsFeaturesEnabled = new RawContextKey("forwardedPortsViewEnabled", false, nls.localize("tunnel.forwardedPortsViewEnabled", "Whether the Ports view is enabled."));
const forwardedPortsViewEnabled = new RawContextKey("forwardedPortsViewOnlyEnabled", false, nls.localize("tunnel.forwardedPortsViewEnabled", "Whether the Ports view is enabled."));
function parseAddress(address) {
  const matches = address.match(/^([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*:)?([0-9]+)$/);
  if (!matches) {
    return void 0;
  }
  return { host: matches[1]?.substring(0, matches[1].length - 1) || "localhost", port: Number(matches[2]) };
}
var TunnelCloseReason = /* @__PURE__ */ ((TunnelCloseReason2) => {
  TunnelCloseReason2["Other"] = "Other";
  TunnelCloseReason2["User"] = "User";
  TunnelCloseReason2["AutoForwardEnd"] = "AutoForwardEnd";
  return TunnelCloseReason2;
})(TunnelCloseReason || {});
var TunnelSource = /* @__PURE__ */ ((TunnelSource2) => {
  TunnelSource2[TunnelSource2["User"] = 0] = "User";
  TunnelSource2[TunnelSource2["Auto"] = 1] = "Auto";
  TunnelSource2[TunnelSource2["Extension"] = 2] = "Extension";
  return TunnelSource2;
})(TunnelSource || {});
const UserTunnelSource = {
  source: 0 /* User */,
  description: nls.localize("tunnel.source.user", "User Forwarded")
};
const AutoTunnelSource = {
  source: 1 /* Auto */,
  description: nls.localize("tunnel.source.auto", "Auto Forwarded")
};
function mapHasAddress(map, host, port) {
  const initialAddress = map.get(makeAddress(host, port));
  if (initialAddress) {
    return initialAddress;
  }
  if (isLocalhost(host)) {
    for (const testHost of LOCALHOST_ADDRESSES) {
      const testAddress = makeAddress(testHost, port);
      if (map.has(testAddress)) {
        return map.get(testAddress);
      }
    }
  } else if (isAllInterfaces(host)) {
    for (const testHost of ALL_INTERFACES_ADDRESSES) {
      const testAddress = makeAddress(testHost, port);
      if (map.has(testAddress)) {
        return map.get(testAddress);
      }
    }
  }
  return void 0;
}
function mapHasAddressLocalhostOrAllInterfaces(map, host, port) {
  const originalAddress = mapHasAddress(map, host, port);
  if (originalAddress) {
    return originalAddress;
  }
  const otherHost = isAllInterfaces(host) ? "localhost" : isLocalhost(host) ? "0.0.0.0" : void 0;
  if (otherHost) {
    return mapHasAddress(map, otherHost, port);
  }
  return void 0;
}
function makeAddress(host, port) {
  return host + ":" + port;
}
var OnPortForward = /* @__PURE__ */ ((OnPortForward2) => {
  OnPortForward2["Notify"] = "notify";
  OnPortForward2["OpenBrowser"] = "openBrowser";
  OnPortForward2["OpenBrowserOnce"] = "openBrowserOnce";
  OnPortForward2["OpenPreview"] = "openPreview";
  OnPortForward2["Silent"] = "silent";
  OnPortForward2["Ignore"] = "ignore";
  return OnPortForward2;
})(OnPortForward || {});
function isCandidatePort(candidate) {
  return candidate && "host" in candidate && typeof candidate.host === "string" && "port" in candidate && typeof candidate.port === "number" && (!("detail" in candidate) || typeof candidate.detail === "string") && (!("pid" in candidate) || typeof candidate.pid === "string");
}
const _PortsAttributes = class _PortsAttributes extends Disposable {
  constructor(configurationService) {
    super();
    this.configurationService = configurationService;
    this.portsAttributes = [];
    this._onDidChangeAttributes = this._register(new Emitter());
    this.onDidChangeAttributes = this._onDidChangeAttributes.event;
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(_PortsAttributes.SETTING) || e.affectsConfiguration(_PortsAttributes.DEFAULTS)) {
        this.updateAttributes();
      }
    }));
    this.updateAttributes();
  }
  updateAttributes() {
    this.portsAttributes = this.readSetting();
    this._onDidChangeAttributes.fire();
  }
  getAttributes(port, host, commandLine) {
    let index = this.findNextIndex(port, host, commandLine, this.portsAttributes, 0);
    const attributes = {
      label: void 0,
      onAutoForward: void 0,
      elevateIfNeeded: void 0,
      requireLocalPort: void 0,
      protocol: void 0
    };
    while (index >= 0) {
      const found = this.portsAttributes[index];
      if (found.key === port) {
        attributes.onAutoForward = found.onAutoForward ?? attributes.onAutoForward;
        attributes.elevateIfNeeded = found.elevateIfNeeded !== void 0 ? found.elevateIfNeeded : attributes.elevateIfNeeded;
        attributes.label = found.label ?? attributes.label;
        attributes.requireLocalPort = found.requireLocalPort;
        attributes.protocol = found.protocol;
      } else {
        attributes.onAutoForward = attributes.onAutoForward ?? found.onAutoForward;
        attributes.elevateIfNeeded = attributes.elevateIfNeeded !== void 0 ? attributes.elevateIfNeeded : found.elevateIfNeeded;
        attributes.label = attributes.label ?? found.label;
        attributes.requireLocalPort = attributes.requireLocalPort !== void 0 ? attributes.requireLocalPort : void 0;
        attributes.protocol = attributes.protocol ?? found.protocol;
      }
      index = this.findNextIndex(port, host, commandLine, this.portsAttributes, index + 1);
    }
    if (attributes.onAutoForward !== void 0 || attributes.elevateIfNeeded !== void 0 || attributes.label !== void 0 || attributes.requireLocalPort !== void 0 || attributes.protocol !== void 0) {
      return attributes;
    }
    return this.getOtherAttributes();
  }
  hasStartEnd(value) {
    return value.start !== void 0 && value.end !== void 0;
  }
  hasHostAndPort(value) {
    return value.host !== void 0 && value.port !== void 0 && isString(value.host) && isNumber(value.port);
  }
  findNextIndex(port, host, commandLine, attributes, fromIndex) {
    if (fromIndex >= attributes.length) {
      return -1;
    }
    const shouldUseHost = !isLocalhost(host) && !isAllInterfaces(host);
    const sliced = attributes.slice(fromIndex);
    const foundIndex = sliced.findIndex((value) => {
      if (isNumber(value.key)) {
        return shouldUseHost ? false : value.key === port;
      } else if (this.hasStartEnd(value.key)) {
        return shouldUseHost ? false : port >= value.key.start && port <= value.key.end;
      } else if (this.hasHostAndPort(value.key)) {
        return port === value.key.port && host === value.key.host;
      } else {
        return commandLine ? value.key.test(commandLine) : false;
      }
    });
    return foundIndex >= 0 ? foundIndex + fromIndex : -1;
  }
  readSetting() {
    const settingValue = this.configurationService.getValue(_PortsAttributes.SETTING);
    if (!settingValue || !isObject(settingValue)) {
      return [];
    }
    const attributes = [];
    for (const attributesKey in settingValue) {
      if (attributesKey === void 0) {
        continue;
      }
      const setting = settingValue[attributesKey];
      let key = void 0;
      if (Number(attributesKey)) {
        key = Number(attributesKey);
      } else if (isString(attributesKey)) {
        if (_PortsAttributes.RANGE.test(attributesKey)) {
          const match = attributesKey.match(_PortsAttributes.RANGE);
          key = { start: Number(match[1]), end: Number(match[2]) };
        } else if (_PortsAttributes.HOST_AND_PORT.test(attributesKey)) {
          const match = attributesKey.match(_PortsAttributes.HOST_AND_PORT);
          key = { host: match[1], port: Number(match[2]) };
        } else {
          let regTest = void 0;
          try {
            regTest = RegExp(attributesKey);
          } catch (e) {
          }
          if (regTest) {
            key = regTest;
          }
        }
      }
      if (!key) {
        continue;
      }
      attributes.push({
        key,
        elevateIfNeeded: setting.elevateIfNeeded,
        onAutoForward: setting.onAutoForward,
        label: setting.label,
        requireLocalPort: setting.requireLocalPort,
        protocol: setting.protocol
      });
    }
    const defaults = this.configurationService.getValue(_PortsAttributes.DEFAULTS);
    if (defaults) {
      this.defaultPortAttributes = {
        elevateIfNeeded: defaults.elevateIfNeeded,
        label: defaults.label,
        onAutoForward: defaults.onAutoForward,
        requireLocalPort: defaults.requireLocalPort,
        protocol: defaults.protocol
      };
    }
    return this.sortAttributes(attributes);
  }
  sortAttributes(attributes) {
    function getVal(item, thisRef) {
      if (isNumber(item.key)) {
        return item.key;
      } else if (thisRef.hasStartEnd(item.key)) {
        return item.key.start;
      } else if (thisRef.hasHostAndPort(item.key)) {
        return item.key.port;
      } else {
        return Number.MAX_VALUE;
      }
    }
    return attributes.sort((a, b) => {
      return getVal(a, this) - getVal(b, this);
    });
  }
  getOtherAttributes() {
    return this.defaultPortAttributes;
  }
  static providedActionToAction(providedAction) {
    switch (providedAction) {
      case ProvidedOnAutoForward.Notify:
        return "notify" /* Notify */;
      case ProvidedOnAutoForward.OpenBrowser:
        return "openBrowser" /* OpenBrowser */;
      case ProvidedOnAutoForward.OpenBrowserOnce:
        return "openBrowserOnce" /* OpenBrowserOnce */;
      case ProvidedOnAutoForward.OpenPreview:
        return "openPreview" /* OpenPreview */;
      case ProvidedOnAutoForward.Silent:
        return "silent" /* Silent */;
      case ProvidedOnAutoForward.Ignore:
        return "ignore" /* Ignore */;
      default:
        return void 0;
    }
  }
  async addAttributes(port, attributes, target) {
    const settingValue = this.configurationService.inspect(_PortsAttributes.SETTING);
    const remoteValue = settingValue.userRemoteValue;
    let newRemoteValue;
    if (!remoteValue || !isObject(remoteValue)) {
      newRemoteValue = {};
    } else {
      newRemoteValue = deepClone(remoteValue);
    }
    if (!newRemoteValue[`${port}`]) {
      newRemoteValue[`${port}`] = {};
    }
    for (const attribute in attributes) {
      newRemoteValue[`${port}`][attribute] = attributes[attribute];
    }
    return this.configurationService.updateValue(_PortsAttributes.SETTING, newRemoteValue, target);
  }
};
_PortsAttributes.SETTING = "remote.portsAttributes";
_PortsAttributes.DEFAULTS = "remote.otherPortsAttributes";
_PortsAttributes.RANGE = /^(\d+)\-(\d+)$/;
_PortsAttributes.HOST_AND_PORT = /^([a-z0-9\-]+):(\d{1,5})$/;
let PortsAttributes = _PortsAttributes;
let TunnelModel = class extends Disposable {
  constructor(tunnelService, storageService, configurationService, environmentService, remoteAuthorityResolverService, workspaceContextService, logService, dialogService, extensionService, contextKeyService) {
    super();
    this.tunnelService = tunnelService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.environmentService = environmentService;
    this.remoteAuthorityResolverService = remoteAuthorityResolverService;
    this.workspaceContextService = workspaceContextService;
    this.logService = logService;
    this.dialogService = dialogService;
    this.extensionService = extensionService;
    this.contextKeyService = contextKeyService;
    this.inProgress = /* @__PURE__ */ new Map();
    this._onForwardPort = this._register(new Emitter());
    this.onForwardPort = this._onForwardPort.event;
    this._onClosePort = this._register(new Emitter());
    this.onClosePort = this._onClosePort.event;
    this._onPortName = this._register(new Emitter());
    this.onPortName = this._onPortName.event;
    this._onCandidatesChanged = this._register(new Emitter());
    // onCandidateChanged returns the removed candidates
    this.onCandidatesChanged = this._onCandidatesChanged.event;
    this._onEnvironmentTunnelsSet = this._register(new Emitter());
    this.onEnvironmentTunnelsSet = this._onEnvironmentTunnelsSet.event;
    this._environmentTunnelsSet = false;
    this.restoreListener = void 0;
    this.restoreComplete = false;
    this.onRestoreComplete = this._register(new Emitter());
    this.unrestoredExtensionTunnels = /* @__PURE__ */ new Map();
    this.sessionCachedProperties = /* @__PURE__ */ new Map();
    this.portAttributesProviders = [];
    this.hasCheckedExtensionsOnTunnelOpened = false;
    this.mismatchCooldown = /* @__PURE__ */ new Date();
    this.configPortsAttributes = new PortsAttributes(configurationService);
    this.tunnelRestoreValue = this.getTunnelRestoreValue();
    this._register(this.configPortsAttributes.onDidChangeAttributes(this.updateAttributes, this));
    this.forwarded = /* @__PURE__ */ new Map();
    this.remoteTunnels = /* @__PURE__ */ new Map();
    this.tunnelService.tunnels.then(async (tunnels) => {
      const attributes = await this.getAttributes(tunnels.map((tunnel) => {
        return { port: tunnel.tunnelRemotePort, host: tunnel.tunnelRemoteHost };
      }));
      for (const tunnel of tunnels) {
        if (tunnel.localAddress) {
          const key = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
          const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? /* @__PURE__ */ new Map(), tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
          this.forwarded.set(key, {
            remotePort: tunnel.tunnelRemotePort,
            remoteHost: tunnel.tunnelRemoteHost,
            localAddress: tunnel.localAddress,
            protocol: attributes?.get(tunnel.tunnelRemotePort)?.protocol ?? TunnelProtocol.Http,
            localUri: await this.makeLocalUri(tunnel.localAddress, attributes?.get(tunnel.tunnelRemotePort)),
            localPort: tunnel.tunnelLocalPort,
            name: attributes?.get(tunnel.tunnelRemotePort)?.label,
            runningProcess: matchingCandidate?.detail,
            hasRunningProcess: !!matchingCandidate,
            pid: matchingCandidate?.pid,
            privacy: tunnel.privacy,
            source: UserTunnelSource
          });
          this.remoteTunnels.set(key, tunnel);
        }
      }
    });
    this.detected = /* @__PURE__ */ new Map();
    this._register(this.tunnelService.onTunnelOpened(async (tunnel) => {
      const key = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
      if (!mapHasAddressLocalhostOrAllInterfaces(this.forwarded, tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort) && !mapHasAddressLocalhostOrAllInterfaces(this.detected, tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort) && !mapHasAddressLocalhostOrAllInterfaces(this.inProgress, tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort) && tunnel.localAddress) {
        const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? /* @__PURE__ */ new Map(), tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
        const attributes = (await this.getAttributes([{ port: tunnel.tunnelRemotePort, host: tunnel.tunnelRemoteHost }]))?.get(tunnel.tunnelRemotePort);
        this.forwarded.set(key, {
          remoteHost: tunnel.tunnelRemoteHost,
          remotePort: tunnel.tunnelRemotePort,
          localAddress: tunnel.localAddress,
          protocol: attributes?.protocol ?? TunnelProtocol.Http,
          localUri: await this.makeLocalUri(tunnel.localAddress, attributes),
          localPort: tunnel.tunnelLocalPort,
          name: attributes?.label,
          closeable: true,
          runningProcess: matchingCandidate?.detail,
          hasRunningProcess: !!matchingCandidate,
          pid: matchingCandidate?.pid,
          privacy: tunnel.privacy,
          source: UserTunnelSource
        });
      }
      await this.storeForwarded();
      this.checkExtensionActivationEvents(true);
      this.remoteTunnels.set(key, tunnel);
      this._onForwardPort.fire(this.forwarded.get(key));
    }));
    this._register(this.tunnelService.onTunnelClosed((address) => {
      return this.onTunnelClosed(address, "Other" /* Other */);
    }));
    this.checkExtensionActivationEvents(false);
  }
  extensionHasActivationEvent() {
    if (this.extensionService.extensions.find((extension) => extension.activationEvents?.includes(ACTIVATION_EVENT))) {
      this.contextKeyService.createKey(forwardedPortsViewEnabled.key, true);
      return true;
    }
    return false;
  }
  checkExtensionActivationEvents(tunnelOpened) {
    if (this.hasCheckedExtensionsOnTunnelOpened) {
      return;
    }
    if (tunnelOpened) {
      this.hasCheckedExtensionsOnTunnelOpened = true;
    }
    const hasRemote = this.environmentService.remoteAuthority !== void 0;
    if (hasRemote && !tunnelOpened) {
      return;
    }
    if (this.extensionHasActivationEvent()) {
      return;
    }
    const activationDisposable = this._register(this.extensionService.onDidRegisterExtensions(() => {
      if (this.extensionHasActivationEvent()) {
        activationDisposable.dispose();
      }
    }));
  }
  async onTunnelClosed(address, reason) {
    const key = makeAddress(address.host, address.port);
    if (this.forwarded.delete(key)) {
      await this.storeForwarded();
      this._onClosePort.fire(address);
    }
  }
  makeLocalUri(localAddress, attributes) {
    if (localAddress.startsWith("http")) {
      return URI.parse(localAddress);
    }
    const protocol = attributes?.protocol ?? "http";
    return URI.parse(`${protocol}://${localAddress}`);
  }
  async addStorageKeyPostfix(prefix) {
    const workspace = this.workspaceContextService.getWorkspace();
    const workspaceHash = workspace.configuration ? hash(workspace.configuration.path) : workspace.folders.length > 0 ? hash(workspace.folders[0].uri.path) : void 0;
    if (workspaceHash === void 0) {
      this.logService.debug("Could not get workspace hash for forwarded ports storage key.");
      return void 0;
    }
    return `${prefix}.${this.environmentService.remoteAuthority}.${workspaceHash}`;
  }
  async getTunnelRestoreStorageKey() {
    return this.addStorageKeyPostfix(TUNNELS_TO_RESTORE);
  }
  async getRestoreExpirationStorageKey() {
    return this.addStorageKeyPostfix(TUNNELS_TO_RESTORE_EXPIRATION);
  }
  async getTunnelRestoreValue() {
    const deprecatedValue = this.storageService.get(TUNNELS_TO_RESTORE, StorageScope.WORKSPACE);
    if (deprecatedValue) {
      this.storageService.remove(TUNNELS_TO_RESTORE, StorageScope.WORKSPACE);
      await this.storeForwarded();
      return deprecatedValue;
    }
    const storageKey = await this.getTunnelRestoreStorageKey();
    if (!storageKey) {
      return void 0;
    }
    return this.storageService.get(storageKey, StorageScope.PROFILE);
  }
  async restoreForwarded() {
    this.cleanupExpiredTunnelsForRestore();
    if (this.configurationService.getValue("remote.restoreForwardedPorts")) {
      const tunnelRestoreValue = await this.tunnelRestoreValue;
      if (tunnelRestoreValue && tunnelRestoreValue !== this.knownPortsRestoreValue) {
        const tunnels = JSON.parse(tunnelRestoreValue) ?? [];
        this.logService.trace(`ForwardedPorts: (TunnelModel) restoring ports ${tunnels.map((tunnel) => tunnel.remotePort).join(", ")}`);
        for (const tunnel of tunnels) {
          const alreadyForwarded = mapHasAddressLocalhostOrAllInterfaces(this.detected, tunnel.remoteHost, tunnel.remotePort);
          if (tunnel.source.source !== 2 /* Extension */ && !alreadyForwarded || tunnel.source.source === 2 /* Extension */ && alreadyForwarded) {
            await this.doForward({
              remote: { host: tunnel.remoteHost, port: tunnel.remotePort },
              local: tunnel.localPort,
              name: tunnel.name,
              elevateIfNeeded: true,
              source: tunnel.source
            });
          } else if (tunnel.source.source === 2 /* Extension */ && !alreadyForwarded) {
            this.unrestoredExtensionTunnels.set(makeAddress(tunnel.remoteHost, tunnel.remotePort), tunnel);
          }
        }
      }
    }
    this.restoreComplete = true;
    this.onRestoreComplete.fire();
    if (!this.restoreListener) {
      const key = await this.getTunnelRestoreStorageKey();
      this.restoreListener = this._register(new DisposableStore());
      this.restoreListener.add(this.storageService.onDidChangeValue(StorageScope.PROFILE, void 0, this.restoreListener)(async (e) => {
        if (e.key === key) {
          this.tunnelRestoreValue = Promise.resolve(this.storageService.get(key, StorageScope.PROFILE));
          await this.restoreForwarded();
        }
      }));
    }
  }
  cleanupExpiredTunnelsForRestore() {
    const keys = this.storageService.keys(StorageScope.PROFILE, StorageTarget.USER).filter((key) => key.startsWith(TUNNELS_TO_RESTORE_EXPIRATION));
    for (const key of keys) {
      const expiration = this.storageService.getNumber(key, StorageScope.PROFILE);
      if (expiration && expiration < Date.now()) {
        this.tunnelRestoreValue = Promise.resolve(void 0);
        const storageKey = key.replace(TUNNELS_TO_RESTORE_EXPIRATION, TUNNELS_TO_RESTORE);
        this.storageService.remove(key, StorageScope.PROFILE);
        this.storageService.remove(storageKey, StorageScope.PROFILE);
      }
    }
  }
  async storeForwarded() {
    if (this.configurationService.getValue("remote.restoreForwardedPorts")) {
      const forwarded = Array.from(this.forwarded.values());
      const restorableTunnels = forwarded.map((tunnel) => {
        return {
          remoteHost: tunnel.remoteHost,
          remotePort: tunnel.remotePort,
          localPort: tunnel.localPort,
          name: tunnel.name,
          localAddress: tunnel.localAddress,
          localUri: tunnel.localUri,
          protocol: tunnel.protocol,
          source: tunnel.source
        };
      });
      let valueToStore;
      if (forwarded.length > 0) {
        valueToStore = JSON.stringify(restorableTunnels);
      }
      const key = await this.getTunnelRestoreStorageKey();
      const expirationKey = await this.getRestoreExpirationStorageKey();
      if (!valueToStore && key && expirationKey) {
        this.storageService.remove(key, StorageScope.PROFILE);
        this.storageService.remove(expirationKey, StorageScope.PROFILE);
      } else if (valueToStore !== this.knownPortsRestoreValue && key && expirationKey) {
        this.storageService.store(key, valueToStore, StorageScope.PROFILE, StorageTarget.USER);
        this.storageService.store(expirationKey, Date.now() + RESTORE_EXPIRATION_TIME, StorageScope.PROFILE, StorageTarget.USER);
      }
      this.knownPortsRestoreValue = valueToStore;
    }
  }
  async showPortMismatchModalIfNeeded(tunnel, expectedLocal, attributes) {
    if (!tunnel.tunnelLocalPort || !attributes?.requireLocalPort) {
      return;
    }
    if (tunnel.tunnelLocalPort === expectedLocal) {
      return;
    }
    const newCooldown = /* @__PURE__ */ new Date();
    if (this.mismatchCooldown.getTime() + MISMATCH_LOCAL_PORT_COOLDOWN > newCooldown.getTime()) {
      return;
    }
    this.mismatchCooldown = newCooldown;
    const mismatchString = nls.localize(
      "remote.localPortMismatch.single",
      "Local port {0} could not be used for forwarding to remote port {1}.\n\nThis usually happens when there is already another process using local port {0}.\n\nPort number {2} has been used instead.",
      expectedLocal,
      tunnel.tunnelRemotePort,
      tunnel.tunnelLocalPort
    );
    return this.dialogService.info(mismatchString);
  }
  async forward(tunnelProperties, attributes) {
    if (!this.restoreComplete && this.environmentService.remoteAuthority) {
      await Event.toPromise(this.onRestoreComplete.event);
    }
    return this.doForward(tunnelProperties, attributes);
  }
  async doForward(tunnelProperties, attributes) {
    await this.extensionService.activateByEvent(ACTIVATION_EVENT);
    const existingTunnel = mapHasAddressLocalhostOrAllInterfaces(this.forwarded, tunnelProperties.remote.host, tunnelProperties.remote.port);
    attributes = attributes ?? (attributes !== null ? (await this.getAttributes([tunnelProperties.remote]))?.get(tunnelProperties.remote.port) : void 0);
    const localPort = tunnelProperties.local !== void 0 ? tunnelProperties.local : tunnelProperties.remote.port;
    let noTunnelValue;
    if (!existingTunnel) {
      const authority = this.environmentService.remoteAuthority;
      const addressProvider = authority ? {
        getAddress: async () => {
          return (await this.remoteAuthorityResolverService.resolveAuthority(authority)).authority;
        }
      } : void 0;
      const key = makeAddress(tunnelProperties.remote.host, tunnelProperties.remote.port);
      this.inProgress.set(key, true);
      tunnelProperties = this.mergeCachedAndUnrestoredProperties(key, tunnelProperties);
      const tunnel = await this.tunnelService.openTunnel(addressProvider, tunnelProperties.remote.host, tunnelProperties.remote.port, void 0, localPort, !tunnelProperties.elevateIfNeeded ? attributes?.elevateIfNeeded : tunnelProperties.elevateIfNeeded, tunnelProperties.privacy, attributes?.protocol);
      if (typeof tunnel === "string") {
        noTunnelValue = tunnel;
      } else if (tunnel && tunnel.localAddress) {
        const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? /* @__PURE__ */ new Map(), tunnelProperties.remote.host, tunnelProperties.remote.port);
        const protocol = tunnel.protocol ? tunnel.protocol === TunnelProtocol.Https ? TunnelProtocol.Https : TunnelProtocol.Http : attributes?.protocol ?? TunnelProtocol.Http;
        const newForward = {
          remoteHost: tunnel.tunnelRemoteHost,
          remotePort: tunnel.tunnelRemotePort,
          localPort: tunnel.tunnelLocalPort,
          name: attributes?.label ?? tunnelProperties.name,
          closeable: true,
          localAddress: tunnel.localAddress,
          protocol,
          localUri: await this.makeLocalUri(tunnel.localAddress, attributes),
          runningProcess: matchingCandidate?.detail,
          hasRunningProcess: !!matchingCandidate,
          pid: matchingCandidate?.pid,
          source: tunnelProperties.source ?? UserTunnelSource,
          privacy: tunnel.privacy
        };
        this.forwarded.set(key, newForward);
        this.remoteTunnels.set(key, tunnel);
        this.inProgress.delete(key);
        await this.storeForwarded();
        await this.showPortMismatchModalIfNeeded(tunnel, localPort, attributes);
        this._onForwardPort.fire(newForward);
        return tunnel;
      }
      this.inProgress.delete(key);
    } else {
      return this.mergeAttributesIntoExistingTunnel(existingTunnel, tunnelProperties, attributes);
    }
    return noTunnelValue;
  }
  mergeCachedAndUnrestoredProperties(key, tunnelProperties) {
    const map = this.unrestoredExtensionTunnels.has(key) ? this.unrestoredExtensionTunnels : this.sessionCachedProperties.has(key) ? this.sessionCachedProperties : void 0;
    if (map) {
      const updateProps = map.get(key);
      map.delete(key);
      if (updateProps) {
        tunnelProperties.name = updateProps.name ?? tunnelProperties.name;
        tunnelProperties.local = ("local" in updateProps ? updateProps.local : "localPort" in updateProps ? updateProps.localPort : void 0) ?? tunnelProperties.local;
        tunnelProperties.privacy = tunnelProperties.privacy;
      }
    }
    return tunnelProperties;
  }
  async mergeAttributesIntoExistingTunnel(existingTunnel, tunnelProperties, attributes) {
    const newName = attributes?.label ?? tunnelProperties.name;
    let MergedAttributeAction;
    ((MergedAttributeAction2) => {
      MergedAttributeAction2[MergedAttributeAction2["None"] = 0] = "None";
      MergedAttributeAction2[MergedAttributeAction2["Fire"] = 1] = "Fire";
      MergedAttributeAction2[MergedAttributeAction2["Reopen"] = 2] = "Reopen";
    })(MergedAttributeAction || (MergedAttributeAction = {}));
    let mergedAction = 0 /* None */;
    if (newName !== existingTunnel.name) {
      existingTunnel.name = newName;
      mergedAction = 1 /* Fire */;
    }
    if ((attributes?.protocol || existingTunnel.protocol !== TunnelProtocol.Http) && attributes?.protocol !== existingTunnel.protocol) {
      tunnelProperties.source = existingTunnel.source;
      mergedAction = 2 /* Reopen */;
    }
    if (tunnelProperties.privacy && existingTunnel.privacy !== tunnelProperties.privacy) {
      mergedAction = 2 /* Reopen */;
    }
    switch (mergedAction) {
      case 1 /* Fire */: {
        this._onForwardPort.fire();
        break;
      }
      case 2 /* Reopen */: {
        await this.close(existingTunnel.remoteHost, existingTunnel.remotePort, "User" /* User */);
        await this.doForward(tunnelProperties, attributes);
      }
    }
    return mapHasAddressLocalhostOrAllInterfaces(this.remoteTunnels, tunnelProperties.remote.host, tunnelProperties.remote.port);
  }
  async name(host, port, name) {
    const existingForwarded = mapHasAddressLocalhostOrAllInterfaces(this.forwarded, host, port);
    const key = makeAddress(host, port);
    if (existingForwarded) {
      existingForwarded.name = name;
      await this.storeForwarded();
      this._onPortName.fire({ host, port });
      return;
    } else if (this.detected.has(key)) {
      this.detected.get(key).name = name;
      this._onPortName.fire({ host, port });
    }
  }
  async close(host, port, reason) {
    const key = makeAddress(host, port);
    const oldTunnel = this.forwarded.get(key);
    if (reason === "AutoForwardEnd" /* AutoForwardEnd */ && oldTunnel && oldTunnel.source.source === 1 /* Auto */) {
      this.sessionCachedProperties.set(key, {
        local: oldTunnel.localPort,
        name: oldTunnel.name,
        privacy: oldTunnel.privacy
      });
    }
    await this.tunnelService.closeTunnel(host, port);
    return this.onTunnelClosed({ host, port }, reason);
  }
  address(host, port) {
    const key = makeAddress(host, port);
    return (this.forwarded.get(key) || this.detected.get(key))?.localAddress;
  }
  get environmentTunnelsSet() {
    return this._environmentTunnelsSet;
  }
  addEnvironmentTunnels(tunnels) {
    if (tunnels) {
      for (const tunnel of tunnels) {
        const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? /* @__PURE__ */ new Map(), tunnel.remoteAddress.host, tunnel.remoteAddress.port);
        const localAddress = typeof tunnel.localAddress === "string" ? tunnel.localAddress : makeAddress(tunnel.localAddress.host, tunnel.localAddress.port);
        this.detected.set(makeAddress(tunnel.remoteAddress.host, tunnel.remoteAddress.port), {
          remoteHost: tunnel.remoteAddress.host,
          remotePort: tunnel.remoteAddress.port,
          localAddress,
          protocol: TunnelProtocol.Http,
          localUri: this.makeLocalUri(localAddress),
          closeable: false,
          runningProcess: matchingCandidate?.detail,
          hasRunningProcess: !!matchingCandidate,
          pid: matchingCandidate?.pid,
          privacy: TunnelPrivacyId.ConstantPrivate,
          source: {
            source: 2 /* Extension */,
            description: nls.localize("tunnel.staticallyForwarded", "Statically Forwarded")
          }
        });
        this.tunnelService.setEnvironmentTunnel(tunnel.remoteAddress.host, tunnel.remoteAddress.port, localAddress, TunnelPrivacyId.ConstantPrivate, TunnelProtocol.Http);
      }
    }
    this._environmentTunnelsSet = true;
    this._onEnvironmentTunnelsSet.fire();
    this._onForwardPort.fire();
  }
  setCandidateFilter(filter) {
    this._candidateFilter = filter;
  }
  async setCandidates(candidates) {
    let processedCandidates = candidates;
    if (this._candidateFilter) {
      processedCandidates = await this._candidateFilter(candidates);
    }
    const removedCandidates = this.updateInResponseToCandidates(processedCandidates);
    this.logService.trace(`ForwardedPorts: (TunnelModel) removed candidates ${Array.from(removedCandidates.values()).map((candidate) => candidate.port).join(", ")}`);
    this._onCandidatesChanged.fire(removedCandidates);
  }
  // Returns removed candidates
  updateInResponseToCandidates(candidates) {
    const removedCandidates = this._candidates ?? /* @__PURE__ */ new Map();
    const candidatesMap = /* @__PURE__ */ new Map();
    this._candidates = candidatesMap;
    candidates.forEach((value) => {
      const addressKey = makeAddress(value.host, value.port);
      candidatesMap.set(addressKey, {
        host: value.host,
        port: value.port,
        detail: value.detail,
        pid: value.pid
      });
      removedCandidates.delete(addressKey);
      const forwardedValue = mapHasAddressLocalhostOrAllInterfaces(this.forwarded, value.host, value.port);
      if (forwardedValue) {
        forwardedValue.runningProcess = value.detail;
        forwardedValue.hasRunningProcess = true;
        forwardedValue.pid = value.pid;
      }
    });
    removedCandidates.forEach((_value, key) => {
      const parsedAddress = parseAddress(key);
      if (!parsedAddress) {
        return;
      }
      const forwardedValue = mapHasAddressLocalhostOrAllInterfaces(this.forwarded, parsedAddress.host, parsedAddress.port);
      if (forwardedValue) {
        forwardedValue.runningProcess = void 0;
        forwardedValue.hasRunningProcess = false;
        forwardedValue.pid = void 0;
      }
      const detectedValue = mapHasAddressLocalhostOrAllInterfaces(this.detected, parsedAddress.host, parsedAddress.port);
      if (detectedValue) {
        detectedValue.runningProcess = void 0;
        detectedValue.hasRunningProcess = false;
        detectedValue.pid = void 0;
      }
    });
    return removedCandidates;
  }
  get candidates() {
    return this._candidates ? Array.from(this._candidates.values()) : [];
  }
  get candidatesOrUndefined() {
    return this._candidates ? this.candidates : void 0;
  }
  async updateAttributes() {
    const tunnels = Array.from(this.forwarded.values());
    const allAttributes = await this.getAttributes(tunnels.map((tunnel) => {
      return { port: tunnel.remotePort, host: tunnel.remoteHost };
    }), false);
    if (!allAttributes) {
      return;
    }
    for (const forwarded of tunnels) {
      const attributes = allAttributes.get(forwarded.remotePort);
      if ((attributes?.protocol || forwarded.protocol !== TunnelProtocol.Http) && attributes?.protocol !== forwarded.protocol) {
        await this.doForward({
          remote: { host: forwarded.remoteHost, port: forwarded.remotePort },
          local: forwarded.localPort,
          name: forwarded.name,
          source: forwarded.source
        }, attributes);
      }
      if (!attributes) {
        continue;
      }
      if (attributes.label && attributes.label !== forwarded.name) {
        await this.name(forwarded.remoteHost, forwarded.remotePort, attributes.label);
      }
    }
  }
  async getAttributes(forwardedPorts, checkProviders = true) {
    const matchingCandidates = /* @__PURE__ */ new Map();
    const pidToPortsMapping = /* @__PURE__ */ new Map();
    forwardedPorts.forEach((forwardedPort) => {
      const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? /* @__PURE__ */ new Map(), LOCALHOST_ADDRESSES[0], forwardedPort.port) ?? forwardedPort;
      if (matchingCandidate) {
        matchingCandidates.set(forwardedPort.port, matchingCandidate);
        const pid = isCandidatePort(matchingCandidate) ? matchingCandidate.pid : void 0;
        if (!pidToPortsMapping.has(pid)) {
          pidToPortsMapping.set(pid, []);
        }
        pidToPortsMapping.get(pid)?.push(forwardedPort.port);
      }
    });
    const configAttributes = /* @__PURE__ */ new Map();
    forwardedPorts.forEach((forwardedPort) => {
      const attributes = this.configPortsAttributes.getAttributes(forwardedPort.port, forwardedPort.host, matchingCandidates.get(forwardedPort.port)?.detail);
      if (attributes) {
        configAttributes.set(forwardedPort.port, attributes);
      }
    });
    if (this.portAttributesProviders.length === 0 || !checkProviders) {
      return configAttributes.size > 0 ? configAttributes : void 0;
    }
    const allProviderResults = await Promise.all(this.portAttributesProviders.flatMap((provider) => {
      return Array.from(pidToPortsMapping.entries()).map((entry) => {
        const portGroup = entry[1];
        const matchingCandidate = matchingCandidates.get(portGroup[0]);
        return provider.providePortAttributes(
          portGroup,
          matchingCandidate?.pid,
          matchingCandidate?.detail,
          CancellationToken.None
        );
      });
    }));
    const providedAttributes = /* @__PURE__ */ new Map();
    allProviderResults.forEach((attributes) => attributes.forEach((attribute) => {
      if (attribute) {
        providedAttributes.set(attribute.port, attribute);
      }
    }));
    if (!configAttributes && !providedAttributes) {
      return void 0;
    }
    const mergedAttributes = /* @__PURE__ */ new Map();
    forwardedPorts.forEach((forwardedPorts2) => {
      const config = configAttributes.get(forwardedPorts2.port);
      const provider = providedAttributes.get(forwardedPorts2.port);
      mergedAttributes.set(forwardedPorts2.port, {
        elevateIfNeeded: config?.elevateIfNeeded,
        label: config?.label,
        onAutoForward: config?.onAutoForward ?? PortsAttributes.providedActionToAction(provider?.autoForwardAction),
        requireLocalPort: config?.requireLocalPort,
        protocol: config?.protocol
      });
    });
    return mergedAttributes;
  }
  addAttributesProvider(provider) {
    this.portAttributesProviders.push(provider);
  }
};
__decorateClass([
  debounce(1e3)
], TunnelModel.prototype, "storeForwarded", 1);
TunnelModel = __decorateClass([
  __decorateParam(0, ITunnelService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IWorkbenchEnvironmentService),
  __decorateParam(4, IRemoteAuthorityResolverService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IDialogService),
  __decorateParam(8, IExtensionService),
  __decorateParam(9, IContextKeyService)
], TunnelModel);
export {
  ACTIVATION_EVENT,
  AutoTunnelSource,
  OnPortForward,
  PortsAttributes,
  TunnelCloseReason,
  TunnelModel,
  TunnelSource,
  UserTunnelSource,
  forwardedPortsFeaturesEnabled,
  forwardedPortsViewEnabled,
  isCandidatePort,
  makeAddress,
  mapHasAddress,
  mapHasAddressLocalhostOrAllInterfaces,
  parseAddress
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3R1bm5lbE1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBkZWJvdW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFkZHJlc3NQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRDb25uZWN0aW9uLmpzJztcbmltcG9ydCB7IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsIFR1bm5lbERlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBdXRob3JpdHlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgUmVtb3RlVHVubmVsLCBJVHVubmVsU2VydmljZSwgVHVubmVsUHJvdG9jb2wsIFR1bm5lbFByaXZhY3lJZCwgTE9DQUxIT1NUX0FERFJFU1NFUywgUHJvdmlkZWRQb3J0QXR0cmlidXRlcywgUG9ydEF0dHJpYnV0ZXNQcm92aWRlciwgaXNMb2NhbGhvc3QsIGlzQWxsSW50ZXJmYWNlcywgUHJvdmlkZWRPbkF1dG9Gb3J3YXJkLCBBTExfSU5URVJGQUNFU19BRERSRVNTRVMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90dW5uZWwvY29tbW9uL3R1bm5lbC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaXNOdW1iZXIsIGlzT2JqZWN0LCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5cbmNvbnN0IE1JU01BVENIX0xPQ0FMX1BPUlRfQ09PTERPV04gPSAxMCAqIDEwMDA7IC8vIDEwIHNlY29uZHNcbmNvbnN0IFRVTk5FTFNfVE9fUkVTVE9SRSA9ICdyZW1vdGUudHVubmVscy50b1Jlc3RvcmUnO1xuY29uc3QgVFVOTkVMU19UT19SRVNUT1JFX0VYUElSQVRJT04gPSAncmVtb3RlLnR1bm5lbHMudG9SZXN0b3JlRXhwaXJhdGlvbic7XG5jb25zdCBSRVNUT1JFX0VYUElSQVRJT05fVElNRSA9IDEwMDAgKiA2MCAqIDYwICogMjQgKiAxNDsgLy8gMiB3ZWVrc1xuZXhwb3J0IGNvbnN0IEFDVElWQVRJT05fRVZFTlQgPSAnb25UdW5uZWwnO1xuZXhwb3J0IGNvbnN0IGZvcndhcmRlZFBvcnRzRmVhdHVyZXNFbmFibGVkID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2ZvcndhcmRlZFBvcnRzVmlld0VuYWJsZWQnLCBmYWxzZSwgbmxzLmxvY2FsaXplKCd0dW5uZWwuZm9yd2FyZGVkUG9ydHNWaWV3RW5hYmxlZCcsIFwiV2hldGhlciB0aGUgUG9ydHMgdmlldyBpcyBlbmFibGVkLlwiKSk7XG5leHBvcnQgY29uc3QgZm9yd2FyZGVkUG9ydHNWaWV3RW5hYmxlZCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdmb3J3YXJkZWRQb3J0c1ZpZXdPbmx5RW5hYmxlZCcsIGZhbHNlLCBubHMubG9jYWxpemUoJ3R1bm5lbC5mb3J3YXJkZWRQb3J0c1ZpZXdFbmFibGVkJywgXCJXaGV0aGVyIHRoZSBQb3J0cyB2aWV3IGlzIGVuYWJsZWQuXCIpKTtcblxuZXhwb3J0IGludGVyZmFjZSBSZXN0b3JhYmxlVHVubmVsIHtcblx0cmVtb3RlSG9zdDogc3RyaW5nO1xuXHRyZW1vdGVQb3J0OiBudW1iZXI7XG5cdGxvY2FsQWRkcmVzczogc3RyaW5nO1xuXHRsb2NhbFVyaTogVVJJO1xuXHRwcm90b2NvbDogVHVubmVsUHJvdG9jb2w7XG5cdGxvY2FsUG9ydD86IG51bWJlcjtcblx0bmFtZT86IHN0cmluZztcblx0c291cmNlOiB7XG5cdFx0c291cmNlOiBUdW5uZWxTb3VyY2U7XG5cdFx0ZGVzY3JpcHRpb246IHN0cmluZztcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUdW5uZWwge1xuXHRyZW1vdGVIb3N0OiBzdHJpbmc7XG5cdHJlbW90ZVBvcnQ6IG51bWJlcjtcblx0bG9jYWxBZGRyZXNzOiBzdHJpbmc7XG5cdGxvY2FsVXJpOiBVUkk7XG5cdHByb3RvY29sOiBUdW5uZWxQcm90b2NvbDtcblx0bG9jYWxQb3J0PzogbnVtYmVyO1xuXHRuYW1lPzogc3RyaW5nO1xuXHRjbG9zZWFibGU/OiBib29sZWFuO1xuXHRwcml2YWN5OiBUdW5uZWxQcml2YWN5SWQgfCBzdHJpbmc7XG5cdHJ1bm5pbmdQcm9jZXNzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGhhc1J1bm5pbmdQcm9jZXNzPzogYm9vbGVhbjtcblx0cGlkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHNvdXJjZToge1xuXHRcdHNvdXJjZTogVHVubmVsU291cmNlO1xuXHRcdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUFkZHJlc3MoYWRkcmVzczogc3RyaW5nKTogeyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWF0Y2hlcyA9IGFkZHJlc3MubWF0Y2goL14oW2EtekEtWjAtOV8tXSsoPzpcXC5bYS16QS1aMC05Xy1dKykqOik/KFswLTldKykkLyk7XG5cdGlmICghbWF0Y2hlcykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgaG9zdDogbWF0Y2hlc1sxXT8uc3Vic3RyaW5nKDAsIG1hdGNoZXNbMV0ubGVuZ3RoIC0gMSkgfHwgJ2xvY2FsaG9zdCcsIHBvcnQ6IE51bWJlcihtYXRjaGVzWzJdKSB9O1xufVxuXG5leHBvcnQgZW51bSBUdW5uZWxDbG9zZVJlYXNvbiB7XG5cdE90aGVyID0gJ090aGVyJyxcblx0VXNlciA9ICdVc2VyJyxcblx0QXV0b0ZvcndhcmRFbmQgPSAnQXV0b0ZvcndhcmRFbmQnLFxufVxuXG5leHBvcnQgZW51bSBUdW5uZWxTb3VyY2Uge1xuXHRVc2VyLFxuXHRBdXRvLFxuXHRFeHRlbnNpb25cbn1cblxuZXhwb3J0IGNvbnN0IFVzZXJUdW5uZWxTb3VyY2UgPSB7XG5cdHNvdXJjZTogVHVubmVsU291cmNlLlVzZXIsXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3R1bm5lbC5zb3VyY2UudXNlcicsIFwiVXNlciBGb3J3YXJkZWRcIilcbn07XG5leHBvcnQgY29uc3QgQXV0b1R1bm5lbFNvdXJjZSA9IHtcblx0c291cmNlOiBUdW5uZWxTb3VyY2UuQXV0byxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndHVubmVsLnNvdXJjZS5hdXRvJywgXCJBdXRvIEZvcndhcmRlZFwiKVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIG1hcEhhc0FkZHJlc3M8VD4obWFwOiBNYXA8c3RyaW5nLCBUPiwgaG9zdDogc3RyaW5nLCBwb3J0OiBudW1iZXIpOiBUIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgaW5pdGlhbEFkZHJlc3MgPSBtYXAuZ2V0KG1ha2VBZGRyZXNzKGhvc3QsIHBvcnQpKTtcblx0aWYgKGluaXRpYWxBZGRyZXNzKSB7XG5cdFx0cmV0dXJuIGluaXRpYWxBZGRyZXNzO1xuXHR9XG5cblx0aWYgKGlzTG9jYWxob3N0KGhvc3QpKSB7XG5cdFx0Ly8gRG8gbG9jYWxob3N0IGNoZWNrc1xuXHRcdGZvciAoY29uc3QgdGVzdEhvc3Qgb2YgTE9DQUxIT1NUX0FERFJFU1NFUykge1xuXHRcdFx0Y29uc3QgdGVzdEFkZHJlc3MgPSBtYWtlQWRkcmVzcyh0ZXN0SG9zdCwgcG9ydCk7XG5cdFx0XHRpZiAobWFwLmhhcyh0ZXN0QWRkcmVzcykpIHtcblx0XHRcdFx0cmV0dXJuIG1hcC5nZXQodGVzdEFkZHJlc3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIGlmIChpc0FsbEludGVyZmFjZXMoaG9zdCkpIHtcblx0XHQvLyBEbyBhbGwgaW50ZXJmYWNlcyBjaGVja3Ncblx0XHRmb3IgKGNvbnN0IHRlc3RIb3N0IG9mIEFMTF9JTlRFUkZBQ0VTX0FERFJFU1NFUykge1xuXHRcdFx0Y29uc3QgdGVzdEFkZHJlc3MgPSBtYWtlQWRkcmVzcyh0ZXN0SG9zdCwgcG9ydCk7XG5cdFx0XHRpZiAobWFwLmhhcyh0ZXN0QWRkcmVzcykpIHtcblx0XHRcdFx0cmV0dXJuIG1hcC5nZXQodGVzdEFkZHJlc3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzPFQ+KG1hcDogTWFwPHN0cmluZywgVD4sIGhvc3Q6IHN0cmluZywgcG9ydDogbnVtYmVyKTogVCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG9yaWdpbmFsQWRkcmVzcyA9IG1hcEhhc0FkZHJlc3MobWFwLCBob3N0LCBwb3J0KTtcblx0aWYgKG9yaWdpbmFsQWRkcmVzcykge1xuXHRcdHJldHVybiBvcmlnaW5hbEFkZHJlc3M7XG5cdH1cblx0Y29uc3Qgb3RoZXJIb3N0ID0gaXNBbGxJbnRlcmZhY2VzKGhvc3QpID8gJ2xvY2FsaG9zdCcgOiAoaXNMb2NhbGhvc3QoaG9zdCkgPyAnMC4wLjAuMCcgOiB1bmRlZmluZWQpO1xuXHRpZiAob3RoZXJIb3N0KSB7XG5cdFx0cmV0dXJuIG1hcEhhc0FkZHJlc3MobWFwLCBvdGhlckhvc3QsIHBvcnQpO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VBZGRyZXNzKGhvc3Q6IHN0cmluZywgcG9ydDogbnVtYmVyKTogc3RyaW5nIHtcblx0cmV0dXJuIGhvc3QgKyAnOicgKyBwb3J0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFR1bm5lbFByb3BlcnRpZXMge1xuXHRyZW1vdGU6IHsgaG9zdDogc3RyaW5nOyBwb3J0OiBudW1iZXIgfTtcblx0bG9jYWw/OiBudW1iZXI7XG5cdG5hbWU/OiBzdHJpbmc7XG5cdHNvdXJjZT86IHtcblx0XHRzb3VyY2U6IFR1bm5lbFNvdXJjZTtcblx0XHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHR9O1xuXHRlbGV2YXRlSWZOZWVkZWQ/OiBib29sZWFuO1xuXHRwcml2YWN5Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhbmRpZGF0ZVBvcnQge1xuXHRob3N0OiBzdHJpbmc7XG5cdHBvcnQ6IG51bWJlcjtcblx0ZGV0YWlsPzogc3RyaW5nO1xuXHRwaWQ/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBQb3J0QXR0cmlidXRlcyBleHRlbmRzIEF0dHJpYnV0ZXMge1xuXHRrZXk6IG51bWJlciB8IFBvcnRSYW5nZSB8IFJlZ0V4cCB8IEhvc3RBbmRQb3J0O1xufVxuXG5leHBvcnQgZW51bSBPblBvcnRGb3J3YXJkIHtcblx0Tm90aWZ5ID0gJ25vdGlmeScsXG5cdE9wZW5Ccm93c2VyID0gJ29wZW5Ccm93c2VyJyxcblx0T3BlbkJyb3dzZXJPbmNlID0gJ29wZW5Ccm93c2VyT25jZScsXG5cdE9wZW5QcmV2aWV3ID0gJ29wZW5QcmV2aWV3Jyxcblx0U2lsZW50ID0gJ3NpbGVudCcsXG5cdElnbm9yZSA9ICdpZ25vcmUnXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXR0cmlidXRlcyB7XG5cdGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdG9uQXV0b0ZvcndhcmQ6IE9uUG9ydEZvcndhcmQgfCB1bmRlZmluZWQ7XG5cdGVsZXZhdGVJZk5lZWRlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cmVxdWlyZUxvY2FsUG9ydDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJvdG9jb2w6IFR1bm5lbFByb3RvY29sIHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgUG9ydFJhbmdlIHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXIgfVxuXG5pbnRlcmZhY2UgSG9zdEFuZFBvcnQgeyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0NhbmRpZGF0ZVBvcnQoY2FuZGlkYXRlOiBhbnkpOiBjYW5kaWRhdGUgaXMgQ2FuZGlkYXRlUG9ydCB7XG5cdHJldHVybiBjYW5kaWRhdGUgJiYgJ2hvc3QnIGluIGNhbmRpZGF0ZSAmJiB0eXBlb2YgY2FuZGlkYXRlLmhvc3QgPT09ICdzdHJpbmcnXG5cdFx0JiYgJ3BvcnQnIGluIGNhbmRpZGF0ZSAmJiB0eXBlb2YgY2FuZGlkYXRlLnBvcnQgPT09ICdudW1iZXInXG5cdFx0JiYgKCEoJ2RldGFpbCcgaW4gY2FuZGlkYXRlKSB8fCB0eXBlb2YgY2FuZGlkYXRlLmRldGFpbCA9PT0gJ3N0cmluZycpXG5cdFx0JiYgKCEoJ3BpZCcgaW4gY2FuZGlkYXRlKSB8fCB0eXBlb2YgY2FuZGlkYXRlLnBpZCA9PT0gJ3N0cmluZycpO1xufVxuXG5leHBvcnQgY2xhc3MgUG9ydHNBdHRyaWJ1dGVzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIFNFVFRJTkcgPSAncmVtb3RlLnBvcnRzQXR0cmlidXRlcyc7XG5cdHByaXZhdGUgc3RhdGljIERFRkFVTFRTID0gJ3JlbW90ZS5vdGhlclBvcnRzQXR0cmlidXRlcyc7XG5cdHByaXZhdGUgc3RhdGljIFJBTkdFID0gL14oXFxkKylcXC0oXFxkKykkLztcblx0cHJpdmF0ZSBzdGF0aWMgSE9TVF9BTkRfUE9SVCA9IC9eKFthLXowLTlcXC1dKyk6KFxcZHsxLDV9KSQvO1xuXHRwcml2YXRlIHBvcnRzQXR0cmlidXRlczogUG9ydEF0dHJpYnV0ZXNbXSA9IFtdO1xuXHRwcml2YXRlIGRlZmF1bHRQb3J0QXR0cmlidXRlczogQXR0cmlidXRlcyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VBdHRyaWJ1dGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUF0dHJpYnV0ZXMgPSB0aGlzLl9vbkRpZENoYW5nZUF0dHJpYnV0ZXMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihQb3J0c0F0dHJpYnV0ZXMuU0VUVElORykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihQb3J0c0F0dHJpYnV0ZXMuREVGQVVMVFMpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQXR0cmlidXRlcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnVwZGF0ZUF0dHJpYnV0ZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQXR0cmlidXRlcygpIHtcblx0XHR0aGlzLnBvcnRzQXR0cmlidXRlcyA9IHRoaXMucmVhZFNldHRpbmcoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUF0dHJpYnV0ZXMuZmlyZSgpO1xuXHR9XG5cblx0Z2V0QXR0cmlidXRlcyhwb3J0OiBudW1iZXIsIGhvc3Q6IHN0cmluZywgY29tbWFuZExpbmU/OiBzdHJpbmcpOiBBdHRyaWJ1dGVzIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgaW5kZXggPSB0aGlzLmZpbmROZXh0SW5kZXgocG9ydCwgaG9zdCwgY29tbWFuZExpbmUsIHRoaXMucG9ydHNBdHRyaWJ1dGVzLCAwKTtcblx0XHRjb25zdCBhdHRyaWJ1dGVzOiBBdHRyaWJ1dGVzID0ge1xuXHRcdFx0bGFiZWw6IHVuZGVmaW5lZCxcblx0XHRcdG9uQXV0b0ZvcndhcmQ6IHVuZGVmaW5lZCxcblx0XHRcdGVsZXZhdGVJZk5lZWRlZDogdW5kZWZpbmVkLFxuXHRcdFx0cmVxdWlyZUxvY2FsUG9ydDogdW5kZWZpbmVkLFxuXHRcdFx0cHJvdG9jb2w6IHVuZGVmaW5lZFxuXHRcdH07XG5cdFx0d2hpbGUgKGluZGV4ID49IDApIHtcblx0XHRcdGNvbnN0IGZvdW5kID0gdGhpcy5wb3J0c0F0dHJpYnV0ZXNbaW5kZXhdO1xuXHRcdFx0aWYgKGZvdW5kLmtleSA9PT0gcG9ydCkge1xuXHRcdFx0XHRhdHRyaWJ1dGVzLm9uQXV0b0ZvcndhcmQgPSBmb3VuZC5vbkF1dG9Gb3J3YXJkID8/IGF0dHJpYnV0ZXMub25BdXRvRm9yd2FyZDtcblx0XHRcdFx0YXR0cmlidXRlcy5lbGV2YXRlSWZOZWVkZWQgPSAoZm91bmQuZWxldmF0ZUlmTmVlZGVkICE9PSB1bmRlZmluZWQpID8gZm91bmQuZWxldmF0ZUlmTmVlZGVkIDogYXR0cmlidXRlcy5lbGV2YXRlSWZOZWVkZWQ7XG5cdFx0XHRcdGF0dHJpYnV0ZXMubGFiZWwgPSBmb3VuZC5sYWJlbCA/PyBhdHRyaWJ1dGVzLmxhYmVsO1xuXHRcdFx0XHRhdHRyaWJ1dGVzLnJlcXVpcmVMb2NhbFBvcnQgPSBmb3VuZC5yZXF1aXJlTG9jYWxQb3J0O1xuXHRcdFx0XHRhdHRyaWJ1dGVzLnByb3RvY29sID0gZm91bmQucHJvdG9jb2w7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBJdCdzIGEgcmFuZ2Ugb3IgcmVnZXgsIHdoaWNoIG1lYW5zIHRoYXQgaWYgdGhlIGF0dHJpYnV0ZSBpcyBhbHJlYWR5IHNldCwgd2Uga2VlcCBpdFxuXHRcdFx0XHRhdHRyaWJ1dGVzLm9uQXV0b0ZvcndhcmQgPSBhdHRyaWJ1dGVzLm9uQXV0b0ZvcndhcmQgPz8gZm91bmQub25BdXRvRm9yd2FyZDtcblx0XHRcdFx0YXR0cmlidXRlcy5lbGV2YXRlSWZOZWVkZWQgPSAoYXR0cmlidXRlcy5lbGV2YXRlSWZOZWVkZWQgIT09IHVuZGVmaW5lZCkgPyBhdHRyaWJ1dGVzLmVsZXZhdGVJZk5lZWRlZCA6IGZvdW5kLmVsZXZhdGVJZk5lZWRlZDtcblx0XHRcdFx0YXR0cmlidXRlcy5sYWJlbCA9IGF0dHJpYnV0ZXMubGFiZWwgPz8gZm91bmQubGFiZWw7XG5cdFx0XHRcdGF0dHJpYnV0ZXMucmVxdWlyZUxvY2FsUG9ydCA9IChhdHRyaWJ1dGVzLnJlcXVpcmVMb2NhbFBvcnQgIT09IHVuZGVmaW5lZCkgPyBhdHRyaWJ1dGVzLnJlcXVpcmVMb2NhbFBvcnQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGF0dHJpYnV0ZXMucHJvdG9jb2wgPSBhdHRyaWJ1dGVzLnByb3RvY29sID8/IGZvdW5kLnByb3RvY29sO1xuXHRcdFx0fVxuXHRcdFx0aW5kZXggPSB0aGlzLmZpbmROZXh0SW5kZXgocG9ydCwgaG9zdCwgY29tbWFuZExpbmUsIHRoaXMucG9ydHNBdHRyaWJ1dGVzLCBpbmRleCArIDEpO1xuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlcy5vbkF1dG9Gb3J3YXJkICE9PSB1bmRlZmluZWQgfHwgYXR0cmlidXRlcy5lbGV2YXRlSWZOZWVkZWQgIT09IHVuZGVmaW5lZFxuXHRcdFx0fHwgYXR0cmlidXRlcy5sYWJlbCAhPT0gdW5kZWZpbmVkIHx8IGF0dHJpYnV0ZXMucmVxdWlyZUxvY2FsUG9ydCAhPT0gdW5kZWZpbmVkXG5cdFx0XHR8fCBhdHRyaWJ1dGVzLnByb3RvY29sICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBhdHRyaWJ1dGVzO1xuXHRcdH1cblxuXHRcdC8vIElmIHdlIGZpbmQgbm8gbWF0Y2hlcywgdGhlbiB1c2UgdGhlIG90aGVyIHBvcnQgYXR0cmlidXRlcy5cblx0XHRyZXR1cm4gdGhpcy5nZXRPdGhlckF0dHJpYnV0ZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgaGFzU3RhcnRFbmQodmFsdWU6IG51bWJlciB8IFBvcnRSYW5nZSB8IFJlZ0V4cCB8IEhvc3RBbmRQb3J0KTogdmFsdWUgaXMgUG9ydFJhbmdlIHtcblx0XHRyZXR1cm4gKHZhbHVlIGFzIFBhcnRpYWw8UG9ydFJhbmdlPikuc3RhcnQgIT09IHVuZGVmaW5lZCAmJiAodmFsdWUgYXMgUGFydGlhbDxQb3J0UmFuZ2U+KS5lbmQgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgaGFzSG9zdEFuZFBvcnQodmFsdWU6IG51bWJlciB8IFBvcnRSYW5nZSB8IFJlZ0V4cCB8IEhvc3RBbmRQb3J0KTogdmFsdWUgaXMgSG9zdEFuZFBvcnQge1xuXHRcdHJldHVybiAoKHZhbHVlIGFzIFBhcnRpYWw8SG9zdEFuZFBvcnQ+KS5ob3N0ICE9PSB1bmRlZmluZWQpICYmICgodmFsdWUgYXMgUGFydGlhbDxIb3N0QW5kUG9ydD4pLnBvcnQgIT09IHVuZGVmaW5lZClcblx0XHRcdCYmIGlzU3RyaW5nKCh2YWx1ZSBhcyBQYXJ0aWFsPEhvc3RBbmRQb3J0PikuaG9zdCkgJiYgaXNOdW1iZXIoKHZhbHVlIGFzIFBhcnRpYWw8SG9zdEFuZFBvcnQ+KS5wb3J0KTtcblx0fVxuXG5cdHByaXZhdGUgZmluZE5leHRJbmRleChwb3J0OiBudW1iZXIsIGhvc3Q6IHN0cmluZywgY29tbWFuZExpbmU6IHN0cmluZyB8IHVuZGVmaW5lZCwgYXR0cmlidXRlczogUG9ydEF0dHJpYnV0ZXNbXSwgZnJvbUluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmIChmcm9tSW5kZXggPj0gYXR0cmlidXRlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0Y29uc3Qgc2hvdWxkVXNlSG9zdCA9ICFpc0xvY2FsaG9zdChob3N0KSAmJiAhaXNBbGxJbnRlcmZhY2VzKGhvc3QpO1xuXHRcdGNvbnN0IHNsaWNlZCA9IGF0dHJpYnV0ZXMuc2xpY2UoZnJvbUluZGV4KTtcblx0XHRjb25zdCBmb3VuZEluZGV4ID0gc2xpY2VkLmZpbmRJbmRleCgodmFsdWUpID0+IHtcblx0XHRcdGlmIChpc051bWJlcih2YWx1ZS5rZXkpKSB7XG5cdFx0XHRcdHJldHVybiBzaG91bGRVc2VIb3N0ID8gZmFsc2UgOiB2YWx1ZS5rZXkgPT09IHBvcnQ7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuaGFzU3RhcnRFbmQodmFsdWUua2V5KSkge1xuXHRcdFx0XHRyZXR1cm4gc2hvdWxkVXNlSG9zdCA/IGZhbHNlIDogKHBvcnQgPj0gdmFsdWUua2V5LnN0YXJ0ICYmIHBvcnQgPD0gdmFsdWUua2V5LmVuZCk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuaGFzSG9zdEFuZFBvcnQodmFsdWUua2V5KSkge1xuXHRcdFx0XHRyZXR1cm4gKHBvcnQgPT09IHZhbHVlLmtleS5wb3J0KSAmJiAoaG9zdCA9PT0gdmFsdWUua2V5Lmhvc3QpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRMaW5lID8gdmFsdWUua2V5LnRlc3QoY29tbWFuZExpbmUpIDogZmFsc2U7XG5cdFx0XHR9XG5cblx0XHR9KTtcblx0XHRyZXR1cm4gZm91bmRJbmRleCA+PSAwID8gZm91bmRJbmRleCArIGZyb21JbmRleCA6IC0xO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkU2V0dGluZygpOiBQb3J0QXR0cmlidXRlc1tdIHtcblx0XHRjb25zdCBzZXR0aW5nVmFsdWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFBvcnRzQXR0cmlidXRlcy5TRVRUSU5HKTtcblx0XHRpZiAoIXNldHRpbmdWYWx1ZSB8fCAhaXNPYmplY3Qoc2V0dGluZ1ZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF0dHJpYnV0ZXM6IFBvcnRBdHRyaWJ1dGVzW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGF0dHJpYnV0ZXNLZXkgaW4gc2V0dGluZ1ZhbHVlKSB7XG5cdFx0XHRpZiAoYXR0cmlidXRlc0tleSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2V0dGluZyA9IChzZXR0aW5nVmFsdWUgYXMgUmVjb3JkPHN0cmluZywgUG9ydEF0dHJpYnV0ZXM+KVthdHRyaWJ1dGVzS2V5XTtcblx0XHRcdGxldCBrZXk6IG51bWJlciB8IFBvcnRSYW5nZSB8IFJlZ0V4cCB8IEhvc3RBbmRQb3J0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKE51bWJlcihhdHRyaWJ1dGVzS2V5KSkge1xuXHRcdFx0XHRrZXkgPSBOdW1iZXIoYXR0cmlidXRlc0tleSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzU3RyaW5nKGF0dHJpYnV0ZXNLZXkpKSB7XG5cdFx0XHRcdGlmIChQb3J0c0F0dHJpYnV0ZXMuUkFOR0UudGVzdChhdHRyaWJ1dGVzS2V5KSkge1xuXHRcdFx0XHRcdGNvbnN0IG1hdGNoID0gYXR0cmlidXRlc0tleS5tYXRjaChQb3J0c0F0dHJpYnV0ZXMuUkFOR0UpO1xuXHRcdFx0XHRcdGtleSA9IHsgc3RhcnQ6IE51bWJlcihtYXRjaCFbMV0pLCBlbmQ6IE51bWJlcihtYXRjaCFbMl0pIH07XG5cdFx0XHRcdH0gZWxzZSBpZiAoUG9ydHNBdHRyaWJ1dGVzLkhPU1RfQU5EX1BPUlQudGVzdChhdHRyaWJ1dGVzS2V5KSkge1xuXHRcdFx0XHRcdGNvbnN0IG1hdGNoID0gYXR0cmlidXRlc0tleS5tYXRjaChQb3J0c0F0dHJpYnV0ZXMuSE9TVF9BTkRfUE9SVCk7XG5cdFx0XHRcdFx0a2V5ID0geyBob3N0OiBtYXRjaCFbMV0sIHBvcnQ6IE51bWJlcihtYXRjaCFbMl0pIH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGV0IHJlZ1Rlc3Q6IFJlZ0V4cCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0cmVnVGVzdCA9IFJlZ0V4cChhdHRyaWJ1dGVzS2V5KTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHQvLyBUaGUgdXNlciBlbnRlcmVkIGFuIGludmFsaWQgcmVndWxhciBleHByZXNzaW9uLlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocmVnVGVzdCkge1xuXHRcdFx0XHRcdFx0a2V5ID0gcmVnVGVzdDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICgha2V5KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0YXR0cmlidXRlcy5wdXNoKHtcblx0XHRcdFx0a2V5OiBrZXksXG5cdFx0XHRcdGVsZXZhdGVJZk5lZWRlZDogc2V0dGluZy5lbGV2YXRlSWZOZWVkZWQsXG5cdFx0XHRcdG9uQXV0b0ZvcndhcmQ6IHNldHRpbmcub25BdXRvRm9yd2FyZCxcblx0XHRcdFx0bGFiZWw6IHNldHRpbmcubGFiZWwsXG5cdFx0XHRcdHJlcXVpcmVMb2NhbFBvcnQ6IHNldHRpbmcucmVxdWlyZUxvY2FsUG9ydCxcblx0XHRcdFx0cHJvdG9jb2w6IHNldHRpbmcucHJvdG9jb2xcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmF1bHRzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShQb3J0c0F0dHJpYnV0ZXMuREVGQVVMVFMpIGFzIFBhcnRpYWw8QXR0cmlidXRlcz4gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGRlZmF1bHRzKSB7XG5cdFx0XHR0aGlzLmRlZmF1bHRQb3J0QXR0cmlidXRlcyA9IHtcblx0XHRcdFx0ZWxldmF0ZUlmTmVlZGVkOiBkZWZhdWx0cy5lbGV2YXRlSWZOZWVkZWQsXG5cdFx0XHRcdGxhYmVsOiBkZWZhdWx0cy5sYWJlbCxcblx0XHRcdFx0b25BdXRvRm9yd2FyZDogZGVmYXVsdHMub25BdXRvRm9yd2FyZCxcblx0XHRcdFx0cmVxdWlyZUxvY2FsUG9ydDogZGVmYXVsdHMucmVxdWlyZUxvY2FsUG9ydCxcblx0XHRcdFx0cHJvdG9jb2w6IGRlZmF1bHRzLnByb3RvY29sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnNvcnRBdHRyaWJ1dGVzKGF0dHJpYnV0ZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBzb3J0QXR0cmlidXRlcyhhdHRyaWJ1dGVzOiBQb3J0QXR0cmlidXRlc1tdKTogUG9ydEF0dHJpYnV0ZXNbXSB7XG5cdFx0ZnVuY3Rpb24gZ2V0VmFsKGl0ZW06IFBvcnRBdHRyaWJ1dGVzLCB0aGlzUmVmOiBQb3J0c0F0dHJpYnV0ZXMpIHtcblx0XHRcdGlmIChpc051bWJlcihpdGVtLmtleSkpIHtcblx0XHRcdFx0cmV0dXJuIGl0ZW0ua2V5O1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzUmVmLmhhc1N0YXJ0RW5kKGl0ZW0ua2V5KSkge1xuXHRcdFx0XHRyZXR1cm4gaXRlbS5rZXkuc3RhcnQ7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXNSZWYuaGFzSG9zdEFuZFBvcnQoaXRlbS5rZXkpKSB7XG5cdFx0XHRcdHJldHVybiBpdGVtLmtleS5wb3J0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIE51bWJlci5NQVhfVkFMVUU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF0dHJpYnV0ZXMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0cmV0dXJuIGdldFZhbChhLCB0aGlzKSAtIGdldFZhbChiLCB0aGlzKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0T3RoZXJBdHRyaWJ1dGVzKCkge1xuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRQb3J0QXR0cmlidXRlcztcblx0fVxuXG5cdHN0YXRpYyBwcm92aWRlZEFjdGlvblRvQWN0aW9uKHByb3ZpZGVkQWN0aW9uOiBQcm92aWRlZE9uQXV0b0ZvcndhcmQgfCB1bmRlZmluZWQpIHtcblx0XHRzd2l0Y2ggKHByb3ZpZGVkQWN0aW9uKSB7XG5cdFx0XHRjYXNlIFByb3ZpZGVkT25BdXRvRm9yd2FyZC5Ob3RpZnk6IHJldHVybiBPblBvcnRGb3J3YXJkLk5vdGlmeTtcblx0XHRcdGNhc2UgUHJvdmlkZWRPbkF1dG9Gb3J3YXJkLk9wZW5Ccm93c2VyOiByZXR1cm4gT25Qb3J0Rm9yd2FyZC5PcGVuQnJvd3Nlcjtcblx0XHRcdGNhc2UgUHJvdmlkZWRPbkF1dG9Gb3J3YXJkLk9wZW5Ccm93c2VyT25jZTogcmV0dXJuIE9uUG9ydEZvcndhcmQuT3BlbkJyb3dzZXJPbmNlO1xuXHRcdFx0Y2FzZSBQcm92aWRlZE9uQXV0b0ZvcndhcmQuT3BlblByZXZpZXc6IHJldHVybiBPblBvcnRGb3J3YXJkLk9wZW5QcmV2aWV3O1xuXHRcdFx0Y2FzZSBQcm92aWRlZE9uQXV0b0ZvcndhcmQuU2lsZW50OiByZXR1cm4gT25Qb3J0Rm9yd2FyZC5TaWxlbnQ7XG5cdFx0XHRjYXNlIFByb3ZpZGVkT25BdXRvRm9yd2FyZC5JZ25vcmU6IHJldHVybiBPblBvcnRGb3J3YXJkLklnbm9yZTtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGFkZEF0dHJpYnV0ZXMocG9ydDogbnVtYmVyLCBhdHRyaWJ1dGVzOiBQYXJ0aWFsPEF0dHJpYnV0ZXM+LCB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQpIHtcblx0XHRjb25zdCBzZXR0aW5nVmFsdWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoUG9ydHNBdHRyaWJ1dGVzLlNFVFRJTkcpO1xuXHRcdGNvbnN0IHJlbW90ZVZhbHVlOiBhbnkgPSBzZXR0aW5nVmFsdWUudXNlclJlbW90ZVZhbHVlO1xuXHRcdGxldCBuZXdSZW1vdGVWYWx1ZTogYW55O1xuXHRcdGlmICghcmVtb3RlVmFsdWUgfHwgIWlzT2JqZWN0KHJlbW90ZVZhbHVlKSkge1xuXHRcdFx0bmV3UmVtb3RlVmFsdWUgPSB7fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bmV3UmVtb3RlVmFsdWUgPSBkZWVwQ2xvbmUocmVtb3RlVmFsdWUpO1xuXHRcdH1cblxuXHRcdGlmICghbmV3UmVtb3RlVmFsdWVbYCR7cG9ydH1gXSkge1xuXHRcdFx0bmV3UmVtb3RlVmFsdWVbYCR7cG9ydH1gXSA9IHt9O1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGF0dHJpYnV0ZSBpbiBhdHRyaWJ1dGVzKSB7XG5cdFx0XHRuZXdSZW1vdGVWYWx1ZVtgJHtwb3J0fWBdW2F0dHJpYnV0ZV0gPSAoYXR0cmlidXRlcyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbYXR0cmlidXRlXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShQb3J0c0F0dHJpYnV0ZXMuU0VUVElORywgbmV3UmVtb3RlVmFsdWUsIHRhcmdldCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFR1bm5lbE1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGZvcndhcmRlZDogTWFwPHN0cmluZywgVHVubmVsPjtcblx0cHJpdmF0ZSByZWFkb25seSBpblByb2dyZXNzOiBNYXA8c3RyaW5nLCB0cnVlPiA9IG5ldyBNYXAoKTtcblx0cmVhZG9ubHkgZGV0ZWN0ZWQ6IE1hcDxzdHJpbmcsIFR1bm5lbD47XG5cdHByaXZhdGUgcmVtb3RlVHVubmVsczogTWFwPHN0cmluZywgUmVtb3RlVHVubmVsPjtcblx0cHJpdmF0ZSBfb25Gb3J3YXJkUG9ydCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFR1bm5lbCB8IHZvaWQ+KCkpO1xuXHRwdWJsaWMgb25Gb3J3YXJkUG9ydCA9IHRoaXMuX29uRm9yd2FyZFBvcnQuZXZlbnQ7XG5cdHByaXZhdGUgX29uQ2xvc2VQb3J0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9PigpKTtcblx0cHVibGljIG9uQ2xvc2VQb3J0ID0gdGhpcy5fb25DbG9zZVBvcnQuZXZlbnQ7XG5cdHByaXZhdGUgX29uUG9ydE5hbWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0+KCkpO1xuXHRwdWJsaWMgb25Qb3J0TmFtZSA9IHRoaXMuX29uUG9ydE5hbWUuZXZlbnQ7XG5cdHByaXZhdGUgX2NhbmRpZGF0ZXM6IE1hcDxzdHJpbmcsIENhbmRpZGF0ZVBvcnQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9vbkNhbmRpZGF0ZXNDaGFuZ2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TWFwPHN0cmluZywgeyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9Pj4oKSk7XG5cdC8vIG9uQ2FuZGlkYXRlQ2hhbmdlZCByZXR1cm5zIHRoZSByZW1vdmVkIGNhbmRpZGF0ZXNcblx0cHVibGljIG9uQ2FuZGlkYXRlc0NoYW5nZWQgPSB0aGlzLl9vbkNhbmRpZGF0ZXNDaGFuZ2VkLmV2ZW50O1xuXHRwcml2YXRlIF9jYW5kaWRhdGVGaWx0ZXI6ICgoY2FuZGlkYXRlczogQ2FuZGlkYXRlUG9ydFtdKSA9PiBQcm9taXNlPENhbmRpZGF0ZVBvcnRbXT4pIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHR1bm5lbFJlc3RvcmVWYWx1ZTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIF9vbkVudmlyb25tZW50VHVubmVsc1NldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgb25FbnZpcm9ubWVudFR1bm5lbHNTZXQgPSB0aGlzLl9vbkVudmlyb25tZW50VHVubmVsc1NldC5ldmVudDtcblx0cHJpdmF0ZSBfZW52aXJvbm1lbnRUdW5uZWxzU2V0OiBib29sZWFuID0gZmFsc2U7XG5cdHB1YmxpYyByZWFkb25seSBjb25maWdQb3J0c0F0dHJpYnV0ZXM6IFBvcnRzQXR0cmlidXRlcztcblx0cHJpdmF0ZSByZXN0b3JlTGlzdGVuZXI6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBrbm93blBvcnRzUmVzdG9yZVZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVzdG9yZUNvbXBsZXRlID0gZmFsc2U7XG5cdHByaXZhdGUgb25SZXN0b3JlQ29tcGxldGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSB1bnJlc3RvcmVkRXh0ZW5zaW9uVHVubmVsczogTWFwPHN0cmluZywgUmVzdG9yYWJsZVR1bm5lbD4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgc2Vzc2lvbkNhY2hlZFByb3BlcnRpZXM6IE1hcDxzdHJpbmcsIFBhcnRpYWw8VHVubmVsUHJvcGVydGllcz4+ID0gbmV3IE1hcCgpO1xuXG5cdHByaXZhdGUgcG9ydEF0dHJpYnV0ZXNQcm92aWRlcnM6IFBvcnRBdHRyaWJ1dGVzUHJvdmlkZXJbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVHVubmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHR1bm5lbFNlcnZpY2U6IElUdW5uZWxTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlOiBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5jb25maWdQb3J0c0F0dHJpYnV0ZXMgPSBuZXcgUG9ydHNBdHRyaWJ1dGVzKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLnR1bm5lbFJlc3RvcmVWYWx1ZSA9IHRoaXMuZ2V0VHVubmVsUmVzdG9yZVZhbHVlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWdQb3J0c0F0dHJpYnV0ZXMub25EaWRDaGFuZ2VBdHRyaWJ1dGVzKHRoaXMudXBkYXRlQXR0cmlidXRlcywgdGhpcykpO1xuXHRcdHRoaXMuZm9yd2FyZGVkID0gbmV3IE1hcCgpO1xuXHRcdHRoaXMucmVtb3RlVHVubmVscyA9IG5ldyBNYXAoKTtcblx0XHR0aGlzLnR1bm5lbFNlcnZpY2UudHVubmVscy50aGVuKGFzeW5jICh0dW5uZWxzKSA9PiB7XG5cdFx0XHRjb25zdCBhdHRyaWJ1dGVzID0gYXdhaXQgdGhpcy5nZXRBdHRyaWJ1dGVzKHR1bm5lbHMubWFwKHR1bm5lbCA9PiB7XG5cdFx0XHRcdHJldHVybiB7IHBvcnQ6IHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0LCBob3N0OiB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCB9O1xuXHRcdFx0fSkpO1xuXHRcdFx0Zm9yIChjb25zdCB0dW5uZWwgb2YgdHVubmVscykge1xuXHRcdFx0XHRpZiAodHVubmVsLmxvY2FsQWRkcmVzcykge1xuXHRcdFx0XHRcdGNvbnN0IGtleSA9IG1ha2VBZGRyZXNzKHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCk7XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2hpbmdDYW5kaWRhdGUgPSBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMuX2NhbmRpZGF0ZXMgPz8gbmV3IE1hcCgpLCB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCwgdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpO1xuXHRcdFx0XHRcdHRoaXMuZm9yd2FyZGVkLnNldChrZXksIHtcblx0XHRcdFx0XHRcdHJlbW90ZVBvcnQ6IHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0LFxuXHRcdFx0XHRcdFx0cmVtb3RlSG9zdDogdHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsXG5cdFx0XHRcdFx0XHRsb2NhbEFkZHJlc3M6IHR1bm5lbC5sb2NhbEFkZHJlc3MsXG5cdFx0XHRcdFx0XHRwcm90b2NvbDogYXR0cmlidXRlcz8uZ2V0KHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KT8ucHJvdG9jb2wgPz8gVHVubmVsUHJvdG9jb2wuSHR0cCxcblx0XHRcdFx0XHRcdGxvY2FsVXJpOiBhd2FpdCB0aGlzLm1ha2VMb2NhbFVyaSh0dW5uZWwubG9jYWxBZGRyZXNzLCBhdHRyaWJ1dGVzPy5nZXQodHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpKSxcblx0XHRcdFx0XHRcdGxvY2FsUG9ydDogdHVubmVsLnR1bm5lbExvY2FsUG9ydCxcblx0XHRcdFx0XHRcdG5hbWU6IGF0dHJpYnV0ZXM/LmdldCh0dW5uZWwudHVubmVsUmVtb3RlUG9ydCk/LmxhYmVsLFxuXHRcdFx0XHRcdFx0cnVubmluZ1Byb2Nlc3M6IG1hdGNoaW5nQ2FuZGlkYXRlPy5kZXRhaWwsXG5cdFx0XHRcdFx0XHRoYXNSdW5uaW5nUHJvY2VzczogISFtYXRjaGluZ0NhbmRpZGF0ZSxcblx0XHRcdFx0XHRcdHBpZDogbWF0Y2hpbmdDYW5kaWRhdGU/LnBpZCxcblx0XHRcdFx0XHRcdHByaXZhY3k6IHR1bm5lbC5wcml2YWN5LFxuXHRcdFx0XHRcdFx0c291cmNlOiBVc2VyVHVubmVsU291cmNlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRoaXMucmVtb3RlVHVubmVscy5zZXQoa2V5LCB0dW5uZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLmRldGVjdGVkID0gbmV3IE1hcCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHVubmVsU2VydmljZS5vblR1bm5lbE9wZW5lZChhc3luYyAodHVubmVsKSA9PiB7XG5cdFx0XHRjb25zdCBrZXkgPSBtYWtlQWRkcmVzcyh0dW5uZWwudHVubmVsUmVtb3RlSG9zdCwgdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpO1xuXHRcdFx0aWYgKCFtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMuZm9yd2FyZGVkLCB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCwgdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpXG5cdFx0XHRcdCYmICFtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMuZGV0ZWN0ZWQsIHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCB0dW5uZWwudHVubmVsUmVtb3RlUG9ydClcblx0XHRcdFx0JiYgIW1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXModGhpcy5pblByb2dyZXNzLCB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCwgdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpXG5cdFx0XHRcdCYmIHR1bm5lbC5sb2NhbEFkZHJlc3MpIHtcblx0XHRcdFx0Y29uc3QgbWF0Y2hpbmdDYW5kaWRhdGUgPSBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMuX2NhbmRpZGF0ZXMgPz8gbmV3IE1hcCgpLCB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCwgdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpO1xuXHRcdFx0XHRjb25zdCBhdHRyaWJ1dGVzID0gKGF3YWl0IHRoaXMuZ2V0QXR0cmlidXRlcyhbeyBwb3J0OiB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCwgaG9zdDogdHVubmVsLnR1bm5lbFJlbW90ZUhvc3QgfV0pKT8uZ2V0KHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KTtcblx0XHRcdFx0dGhpcy5mb3J3YXJkZWQuc2V0KGtleSwge1xuXHRcdFx0XHRcdHJlbW90ZUhvc3Q6IHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LFxuXHRcdFx0XHRcdHJlbW90ZVBvcnQ6IHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0LFxuXHRcdFx0XHRcdGxvY2FsQWRkcmVzczogdHVubmVsLmxvY2FsQWRkcmVzcyxcblx0XHRcdFx0XHRwcm90b2NvbDogYXR0cmlidXRlcz8ucHJvdG9jb2wgPz8gVHVubmVsUHJvdG9jb2wuSHR0cCxcblx0XHRcdFx0XHRsb2NhbFVyaTogYXdhaXQgdGhpcy5tYWtlTG9jYWxVcmkodHVubmVsLmxvY2FsQWRkcmVzcywgYXR0cmlidXRlcyksXG5cdFx0XHRcdFx0bG9jYWxQb3J0OiB0dW5uZWwudHVubmVsTG9jYWxQb3J0LFxuXHRcdFx0XHRcdG5hbWU6IGF0dHJpYnV0ZXM/LmxhYmVsLFxuXHRcdFx0XHRcdGNsb3NlYWJsZTogdHJ1ZSxcblx0XHRcdFx0XHRydW5uaW5nUHJvY2VzczogbWF0Y2hpbmdDYW5kaWRhdGU/LmRldGFpbCxcblx0XHRcdFx0XHRoYXNSdW5uaW5nUHJvY2VzczogISFtYXRjaGluZ0NhbmRpZGF0ZSxcblx0XHRcdFx0XHRwaWQ6IG1hdGNoaW5nQ2FuZGlkYXRlPy5waWQsXG5cdFx0XHRcdFx0cHJpdmFjeTogdHVubmVsLnByaXZhY3ksXG5cdFx0XHRcdFx0c291cmNlOiBVc2VyVHVubmVsU291cmNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuc3RvcmVGb3J3YXJkZWQoKTtcblx0XHRcdHRoaXMuY2hlY2tFeHRlbnNpb25BY3RpdmF0aW9uRXZlbnRzKHRydWUpO1xuXHRcdFx0dGhpcy5yZW1vdGVUdW5uZWxzLnNldChrZXksIHR1bm5lbCk7XG5cdFx0XHR0aGlzLl9vbkZvcndhcmRQb3J0LmZpcmUodGhpcy5mb3J3YXJkZWQuZ2V0KGtleSkhKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50dW5uZWxTZXJ2aWNlLm9uVHVubmVsQ2xvc2VkKGFkZHJlc3MgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMub25UdW5uZWxDbG9zZWQoYWRkcmVzcywgVHVubmVsQ2xvc2VSZWFzb24uT3RoZXIpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmNoZWNrRXh0ZW5zaW9uQWN0aXZhdGlvbkV2ZW50cyhmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGV4dGVuc2lvbkhhc0FjdGl2YXRpb25FdmVudCgpIHtcblx0XHRpZiAodGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuZmluZChleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHM/LmluY2x1ZGVzKEFDVElWQVRJT05fRVZFTlQpKSkge1xuXHRcdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoZm9yd2FyZGVkUG9ydHNWaWV3RW5hYmxlZC5rZXksIHRydWUpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgaGFzQ2hlY2tlZEV4dGVuc2lvbnNPblR1bm5lbE9wZW5lZCA9IGZhbHNlO1xuXHRwcml2YXRlIGNoZWNrRXh0ZW5zaW9uQWN0aXZhdGlvbkV2ZW50cyh0dW5uZWxPcGVuZWQ6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5oYXNDaGVja2VkRXh0ZW5zaW9uc09uVHVubmVsT3BlbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0dW5uZWxPcGVuZWQpIHtcblx0XHRcdHRoaXMuaGFzQ2hlY2tlZEV4dGVuc2lvbnNPblR1bm5lbE9wZW5lZCA9IHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGhhc1JlbW90ZSA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAhPT0gdW5kZWZpbmVkO1xuXHRcdGlmIChoYXNSZW1vdGUgJiYgIXR1bm5lbE9wZW5lZCkge1xuXHRcdFx0Ly8gV2UgZG9uJ3QgYWN0aXZhdGUgZXh0ZW5zaW9ucyBvbiBzdGFydHVwIGlmIHRoZXJlIGlzIGEgcmVtb3RlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbkhhc0FjdGl2YXRpb25FdmVudCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZhdGlvbkRpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvblNlcnZpY2Uub25EaWRSZWdpc3RlckV4dGVuc2lvbnMoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uSGFzQWN0aXZhdGlvbkV2ZW50KCkpIHtcblx0XHRcdFx0YWN0aXZhdGlvbkRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25UdW5uZWxDbG9zZWQoYWRkcmVzczogeyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9LCByZWFzb246IFR1bm5lbENsb3NlUmVhc29uKSB7XG5cdFx0Y29uc3Qga2V5ID0gbWFrZUFkZHJlc3MoYWRkcmVzcy5ob3N0LCBhZGRyZXNzLnBvcnQpO1xuXHRcdGlmICh0aGlzLmZvcndhcmRlZC5kZWxldGUoa2V5KSkge1xuXHRcdFx0YXdhaXQgdGhpcy5zdG9yZUZvcndhcmRlZCgpO1xuXHRcdFx0dGhpcy5fb25DbG9zZVBvcnQuZmlyZShhZGRyZXNzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG1ha2VMb2NhbFVyaShsb2NhbEFkZHJlc3M6IHN0cmluZywgYXR0cmlidXRlcz86IEF0dHJpYnV0ZXMpIHtcblx0XHRpZiAobG9jYWxBZGRyZXNzLnN0YXJ0c1dpdGgoJ2h0dHAnKSkge1xuXHRcdFx0cmV0dXJuIFVSSS5wYXJzZShsb2NhbEFkZHJlc3MpO1xuXHRcdH1cblx0XHRjb25zdCBwcm90b2NvbCA9IGF0dHJpYnV0ZXM/LnByb3RvY29sID8/ICdodHRwJztcblx0XHRyZXR1cm4gVVJJLnBhcnNlKGAke3Byb3RvY29sfTovLyR7bG9jYWxBZGRyZXNzfWApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhZGRTdG9yYWdlS2V5UG9zdGZpeChwcmVmaXg6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VIYXNoID0gd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gPyBoYXNoKHdvcmtzcGFjZS5jb25maWd1cmF0aW9uLnBhdGgpIDogKHdvcmtzcGFjZS5mb2xkZXJzLmxlbmd0aCA+IDAgPyBoYXNoKHdvcmtzcGFjZS5mb2xkZXJzWzBdLnVyaS5wYXRoKSA6IHVuZGVmaW5lZCk7XG5cdFx0aWYgKHdvcmtzcGFjZUhhc2ggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdDb3VsZCBub3QgZ2V0IHdvcmtzcGFjZSBoYXNoIGZvciBmb3J3YXJkZWQgcG9ydHMgc3RvcmFnZSBrZXkuJyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7cHJlZml4fS4ke3RoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eX0uJHt3b3Jrc3BhY2VIYXNofWA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFR1bm5lbFJlc3RvcmVTdG9yYWdlS2V5KCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuYWRkU3RvcmFnZUtleVBvc3RmaXgoVFVOTkVMU19UT19SRVNUT1JFKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0UmVzdG9yZUV4cGlyYXRpb25TdG9yYWdlS2V5KCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuYWRkU3RvcmFnZUtleVBvc3RmaXgoVFVOTkVMU19UT19SRVNUT1JFX0VYUElSQVRJT04pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRUdW5uZWxSZXN0b3JlVmFsdWUoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkZXByZWNhdGVkVmFsdWUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChUVU5ORUxTX1RPX1JFU1RPUkUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmIChkZXByZWNhdGVkVmFsdWUpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFRVTk5FTFNfVE9fUkVTVE9SRSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRhd2FpdCB0aGlzLnN0b3JlRm9yd2FyZGVkKCk7XG5cdFx0XHRyZXR1cm4gZGVwcmVjYXRlZFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBzdG9yYWdlS2V5ID0gYXdhaXQgdGhpcy5nZXRUdW5uZWxSZXN0b3JlU3RvcmFnZUtleSgpO1xuXHRcdGlmICghc3RvcmFnZUtleSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0fVxuXG5cdGFzeW5jIHJlc3RvcmVGb3J3YXJkZWQoKSB7XG5cdFx0dGhpcy5jbGVhbnVwRXhwaXJlZFR1bm5lbHNGb3JSZXN0b3JlKCk7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3JlbW90ZS5yZXN0b3JlRm9yd2FyZGVkUG9ydHMnKSkge1xuXHRcdFx0Y29uc3QgdHVubmVsUmVzdG9yZVZhbHVlID0gYXdhaXQgdGhpcy50dW5uZWxSZXN0b3JlVmFsdWU7XG5cdFx0XHRpZiAodHVubmVsUmVzdG9yZVZhbHVlICYmICh0dW5uZWxSZXN0b3JlVmFsdWUgIT09IHRoaXMua25vd25Qb3J0c1Jlc3RvcmVWYWx1ZSkpIHtcblx0XHRcdFx0Y29uc3QgdHVubmVscyA9IDxSZXN0b3JhYmxlVHVubmVsW10gfCB1bmRlZmluZWQ+SlNPTi5wYXJzZSh0dW5uZWxSZXN0b3JlVmFsdWUpID8/IFtdO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoVHVubmVsTW9kZWwpIHJlc3RvcmluZyBwb3J0cyAke3R1bm5lbHMubWFwKHR1bm5lbCA9PiB0dW5uZWwucmVtb3RlUG9ydCkuam9pbignLCAnKX1gKTtcblx0XHRcdFx0Zm9yIChjb25zdCB0dW5uZWwgb2YgdHVubmVscykge1xuXHRcdFx0XHRcdGNvbnN0IGFscmVhZHlGb3J3YXJkZWQgPSBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMuZGV0ZWN0ZWQsIHR1bm5lbC5yZW1vdGVIb3N0LCB0dW5uZWwucmVtb3RlUG9ydCk7XG5cdFx0XHRcdFx0Ly8gRXh0ZW5zaW9uIGZvcndhcmRlZCBwb3J0cyBzaG91bGQgb25seSBiZSB1cGRhdGVkLCBub3QgcmVzdG9yZWQuXG5cdFx0XHRcdFx0aWYgKCh0dW5uZWwuc291cmNlLnNvdXJjZSAhPT0gVHVubmVsU291cmNlLkV4dGVuc2lvbiAmJiAhYWxyZWFkeUZvcndhcmRlZCkgfHwgKHR1bm5lbC5zb3VyY2Uuc291cmNlID09PSBUdW5uZWxTb3VyY2UuRXh0ZW5zaW9uICYmIGFscmVhZHlGb3J3YXJkZWQpKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmRvRm9yd2FyZCh7XG5cdFx0XHRcdFx0XHRcdHJlbW90ZTogeyBob3N0OiB0dW5uZWwucmVtb3RlSG9zdCwgcG9ydDogdHVubmVsLnJlbW90ZVBvcnQgfSxcblx0XHRcdFx0XHRcdFx0bG9jYWw6IHR1bm5lbC5sb2NhbFBvcnQsXG5cdFx0XHRcdFx0XHRcdG5hbWU6IHR1bm5lbC5uYW1lLFxuXHRcdFx0XHRcdFx0XHRlbGV2YXRlSWZOZWVkZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdHNvdXJjZTogdHVubmVsLnNvdXJjZVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0dW5uZWwuc291cmNlLnNvdXJjZSA9PT0gVHVubmVsU291cmNlLkV4dGVuc2lvbiAmJiAhYWxyZWFkeUZvcndhcmRlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy51bnJlc3RvcmVkRXh0ZW5zaW9uVHVubmVscy5zZXQobWFrZUFkZHJlc3ModHVubmVsLnJlbW90ZUhvc3QsIHR1bm5lbC5yZW1vdGVQb3J0KSwgdHVubmVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnJlc3RvcmVDb21wbGV0ZSA9IHRydWU7XG5cdFx0dGhpcy5vblJlc3RvcmVDb21wbGV0ZS5maXJlKCk7XG5cblx0XHRpZiAoIXRoaXMucmVzdG9yZUxpc3RlbmVyKSB7XG5cdFx0XHQvLyBJdCdzIHBvc3NpYmxlIHRoYXQgYXQgcmVzdG9yZSB0aW1lIHRoZSB2YWx1ZSBoYXNuJ3Qgc3luY2VkLlxuXHRcdFx0Y29uc3Qga2V5ID0gYXdhaXQgdGhpcy5nZXRUdW5uZWxSZXN0b3JlU3RvcmFnZUtleSgpO1xuXHRcdFx0dGhpcy5yZXN0b3JlTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdFx0dGhpcy5yZXN0b3JlTGlzdGVuZXIuYWRkKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuUFJPRklMRSwgdW5kZWZpbmVkLCB0aGlzLnJlc3RvcmVMaXN0ZW5lcikoYXN5bmMgKGUpID0+IHtcblx0XHRcdFx0aWYgKGUua2V5ID09PSBrZXkpIHtcblx0XHRcdFx0XHR0aGlzLnR1bm5lbFJlc3RvcmVWYWx1ZSA9IFByb21pc2UucmVzb2x2ZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZXN0b3JlRm9yd2FyZGVkKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNsZWFudXBFeHBpcmVkVHVubmVsc0ZvclJlc3RvcmUoKSB7XG5cdFx0Y29uc3Qga2V5cyA9IHRoaXMuc3RvcmFnZVNlcnZpY2Uua2V5cyhTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKS5maWx0ZXIoa2V5ID0+IGtleS5zdGFydHNXaXRoKFRVTk5FTFNfVE9fUkVTVE9SRV9FWFBJUkFUSU9OKSk7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuXHRcdFx0Y29uc3QgZXhwaXJhdGlvbiA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKGtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdFx0aWYgKGV4cGlyYXRpb24gJiYgZXhwaXJhdGlvbiA8IERhdGUubm93KCkpIHtcblx0XHRcdFx0dGhpcy50dW5uZWxSZXN0b3JlVmFsdWUgPSBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0Y29uc3Qgc3RvcmFnZUtleSA9IGtleS5yZXBsYWNlKFRVTk5FTFNfVE9fUkVTVE9SRV9FWFBJUkFUSU9OLCBUVU5ORUxTX1RPX1JFU1RPUkUpO1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShrZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoc3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdEBkZWJvdW5jZSgxMDAwKVxuXHRwcml2YXRlIGFzeW5jIHN0b3JlRm9yd2FyZGVkKCkge1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdyZW1vdGUucmVzdG9yZUZvcndhcmRlZFBvcnRzJykpIHtcblx0XHRcdGNvbnN0IGZvcndhcmRlZCA9IEFycmF5LmZyb20odGhpcy5mb3J3YXJkZWQudmFsdWVzKCkpO1xuXHRcdFx0Y29uc3QgcmVzdG9yYWJsZVR1bm5lbHM6IFJlc3RvcmFibGVUdW5uZWxbXSA9IGZvcndhcmRlZC5tYXAodHVubmVsID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyZW1vdGVIb3N0OiB0dW5uZWwucmVtb3RlSG9zdCxcblx0XHRcdFx0XHRyZW1vdGVQb3J0OiB0dW5uZWwucmVtb3RlUG9ydCxcblx0XHRcdFx0XHRsb2NhbFBvcnQ6IHR1bm5lbC5sb2NhbFBvcnQsXG5cdFx0XHRcdFx0bmFtZTogdHVubmVsLm5hbWUsXG5cdFx0XHRcdFx0bG9jYWxBZGRyZXNzOiB0dW5uZWwubG9jYWxBZGRyZXNzLFxuXHRcdFx0XHRcdGxvY2FsVXJpOiB0dW5uZWwubG9jYWxVcmksXG5cdFx0XHRcdFx0cHJvdG9jb2w6IHR1bm5lbC5wcm90b2NvbCxcblx0XHRcdFx0XHRzb3VyY2U6IHR1bm5lbC5zb3VyY2UsXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHRcdGxldCB2YWx1ZVRvU3RvcmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChmb3J3YXJkZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR2YWx1ZVRvU3RvcmUgPSBKU09OLnN0cmluZ2lmeShyZXN0b3JhYmxlVHVubmVscyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGtleSA9IGF3YWl0IHRoaXMuZ2V0VHVubmVsUmVzdG9yZVN0b3JhZ2VLZXkoKTtcblx0XHRcdGNvbnN0IGV4cGlyYXRpb25LZXkgPSBhd2FpdCB0aGlzLmdldFJlc3RvcmVFeHBpcmF0aW9uU3RvcmFnZUtleSgpO1xuXHRcdFx0aWYgKCF2YWx1ZVRvU3RvcmUgJiYga2V5ICYmIGV4cGlyYXRpb25LZXkpIHtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoa2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKGV4cGlyYXRpb25LZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRcdH0gZWxzZSBpZiAoKHZhbHVlVG9TdG9yZSAhPT0gdGhpcy5rbm93blBvcnRzUmVzdG9yZVZhbHVlKSAmJiBrZXkgJiYgZXhwaXJhdGlvbktleSkge1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGtleSwgdmFsdWVUb1N0b3JlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShleHBpcmF0aW9uS2V5LCBEYXRlLm5vdygpICsgUkVTVE9SRV9FWFBJUkFUSU9OX1RJTUUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5rbm93blBvcnRzUmVzdG9yZVZhbHVlID0gdmFsdWVUb1N0b3JlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbWlzbWF0Y2hDb29sZG93biA9IG5ldyBEYXRlKCk7XG5cdHByaXZhdGUgYXN5bmMgc2hvd1BvcnRNaXNtYXRjaE1vZGFsSWZOZWVkZWQodHVubmVsOiBSZW1vdGVUdW5uZWwsIGV4cGVjdGVkTG9jYWw6IG51bWJlciwgYXR0cmlidXRlczogQXR0cmlidXRlcyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICghdHVubmVsLnR1bm5lbExvY2FsUG9ydCB8fCAhYXR0cmlidXRlcz8ucmVxdWlyZUxvY2FsUG9ydCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodHVubmVsLnR1bm5lbExvY2FsUG9ydCA9PT0gZXhwZWN0ZWRMb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld0Nvb2xkb3duID0gbmV3IERhdGUoKTtcblx0XHRpZiAoKHRoaXMubWlzbWF0Y2hDb29sZG93bi5nZXRUaW1lKCkgKyBNSVNNQVRDSF9MT0NBTF9QT1JUX0NPT0xET1dOKSA+IG5ld0Nvb2xkb3duLmdldFRpbWUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLm1pc21hdGNoQ29vbGRvd24gPSBuZXdDb29sZG93bjtcblx0XHRjb25zdCBtaXNtYXRjaFN0cmluZyA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLmxvY2FsUG9ydE1pc21hdGNoLnNpbmdsZScsIFwiTG9jYWwgcG9ydCB7MH0gY291bGQgbm90IGJlIHVzZWQgZm9yIGZvcndhcmRpbmcgdG8gcmVtb3RlIHBvcnQgezF9LlxcblxcblRoaXMgdXN1YWxseSBoYXBwZW5zIHdoZW4gdGhlcmUgaXMgYWxyZWFkeSBhbm90aGVyIHByb2Nlc3MgdXNpbmcgbG9jYWwgcG9ydCB7MH0uXFxuXFxuUG9ydCBudW1iZXIgezJ9IGhhcyBiZWVuIHVzZWQgaW5zdGVhZC5cIixcblx0XHRcdGV4cGVjdGVkTG9jYWwsIHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0LCB0dW5uZWwudHVubmVsTG9jYWxQb3J0KTtcblx0XHRyZXR1cm4gdGhpcy5kaWFsb2dTZXJ2aWNlLmluZm8obWlzbWF0Y2hTdHJpbmcpO1xuXHR9XG5cblx0YXN5bmMgZm9yd2FyZCh0dW5uZWxQcm9wZXJ0aWVzOiBUdW5uZWxQcm9wZXJ0aWVzLCBhdHRyaWJ1dGVzPzogQXR0cmlidXRlcyB8IG51bGwpOiBQcm9taXNlPFJlbW90ZVR1bm5lbCB8IHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5yZXN0b3JlQ29tcGxldGUgJiYgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UodGhpcy5vblJlc3RvcmVDb21wbGV0ZS5ldmVudCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmRvRm9yd2FyZCh0dW5uZWxQcm9wZXJ0aWVzLCBhdHRyaWJ1dGVzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Gb3J3YXJkKHR1bm5lbFByb3BlcnRpZXM6IFR1bm5lbFByb3BlcnRpZXMsIGF0dHJpYnV0ZXM/OiBBdHRyaWJ1dGVzIHwgbnVsbCk6IFByb21pc2U8UmVtb3RlVHVubmVsIHwgc3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChBQ1RJVkFUSU9OX0VWRU5UKTtcblxuXHRcdGNvbnN0IGV4aXN0aW5nVHVubmVsID0gbWFwSGFzQWRkcmVzc0xvY2FsaG9zdE9yQWxsSW50ZXJmYWNlcyh0aGlzLmZvcndhcmRlZCwgdHVubmVsUHJvcGVydGllcy5yZW1vdGUuaG9zdCwgdHVubmVsUHJvcGVydGllcy5yZW1vdGUucG9ydCk7XG5cdFx0YXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMgPz9cblx0XHRcdCgoYXR0cmlidXRlcyAhPT0gbnVsbClcblx0XHRcdFx0PyAoYXdhaXQgdGhpcy5nZXRBdHRyaWJ1dGVzKFt0dW5uZWxQcm9wZXJ0aWVzLnJlbW90ZV0pKT8uZ2V0KHR1bm5lbFByb3BlcnRpZXMucmVtb3RlLnBvcnQpXG5cdFx0XHRcdDogdW5kZWZpbmVkKTtcblx0XHRjb25zdCBsb2NhbFBvcnQgPSAodHVubmVsUHJvcGVydGllcy5sb2NhbCAhPT0gdW5kZWZpbmVkKSA/IHR1bm5lbFByb3BlcnRpZXMubG9jYWwgOiB0dW5uZWxQcm9wZXJ0aWVzLnJlbW90ZS5wb3J0O1xuXHRcdGxldCBub1R1bm5lbFZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFleGlzdGluZ1R1bm5lbCkge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXR5ID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdFx0Y29uc3QgYWRkcmVzc1Byb3ZpZGVyOiBJQWRkcmVzc1Byb3ZpZGVyIHwgdW5kZWZpbmVkID0gYXV0aG9yaXR5ID8ge1xuXHRcdFx0XHRnZXRBZGRyZXNzOiBhc3luYyAoKSA9PiB7IHJldHVybiAoYXdhaXQgdGhpcy5yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UucmVzb2x2ZUF1dGhvcml0eShhdXRob3JpdHkpKS5hdXRob3JpdHk7IH1cblx0XHRcdH0gOiB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGtleSA9IG1ha2VBZGRyZXNzKHR1bm5lbFByb3BlcnRpZXMucmVtb3RlLmhvc3QsIHR1bm5lbFByb3BlcnRpZXMucmVtb3RlLnBvcnQpO1xuXHRcdFx0dGhpcy5pblByb2dyZXNzLnNldChrZXksIHRydWUpO1xuXHRcdFx0dHVubmVsUHJvcGVydGllcyA9IHRoaXMubWVyZ2VDYWNoZWRBbmRVbnJlc3RvcmVkUHJvcGVydGllcyhrZXksIHR1bm5lbFByb3BlcnRpZXMpO1xuXG5cdFx0XHRjb25zdCB0dW5uZWwgPSBhd2FpdCB0aGlzLnR1bm5lbFNlcnZpY2Uub3BlblR1bm5lbChhZGRyZXNzUHJvdmlkZXIsIHR1bm5lbFByb3BlcnRpZXMucmVtb3RlLmhvc3QsIHR1bm5lbFByb3BlcnRpZXMucmVtb3RlLnBvcnQsIHVuZGVmaW5lZCwgbG9jYWxQb3J0LCAoIXR1bm5lbFByb3BlcnRpZXMuZWxldmF0ZUlmTmVlZGVkKSA/IGF0dHJpYnV0ZXM/LmVsZXZhdGVJZk5lZWRlZCA6IHR1bm5lbFByb3BlcnRpZXMuZWxldmF0ZUlmTmVlZGVkLCB0dW5uZWxQcm9wZXJ0aWVzLnByaXZhY3ksIGF0dHJpYnV0ZXM/LnByb3RvY29sKTtcblx0XHRcdGlmICh0eXBlb2YgdHVubmVsID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHQvLyBUaGVyZSB3YXMgYW4gZXJyb3IgIHdoaWxlIGNyZWF0aW5nIHRoZSB0dW5uZWwuXG5cdFx0XHRcdG5vVHVubmVsVmFsdWUgPSB0dW5uZWw7XG5cdFx0XHR9IGVsc2UgaWYgKHR1bm5lbCAmJiB0dW5uZWwubG9jYWxBZGRyZXNzKSB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoaW5nQ2FuZGlkYXRlID0gbWFwSGFzQWRkcmVzc0xvY2FsaG9zdE9yQWxsSW50ZXJmYWNlczxDYW5kaWRhdGVQb3J0Pih0aGlzLl9jYW5kaWRhdGVzID8/IG5ldyBNYXAoKSwgdHVubmVsUHJvcGVydGllcy5yZW1vdGUuaG9zdCwgdHVubmVsUHJvcGVydGllcy5yZW1vdGUucG9ydCk7XG5cdFx0XHRcdGNvbnN0IHByb3RvY29sID0gKHR1bm5lbC5wcm90b2NvbCA/XG5cdFx0XHRcdFx0KCh0dW5uZWwucHJvdG9jb2wgPT09IFR1bm5lbFByb3RvY29sLkh0dHBzKSA/IFR1bm5lbFByb3RvY29sLkh0dHBzIDogVHVubmVsUHJvdG9jb2wuSHR0cClcblx0XHRcdFx0XHQ6IChhdHRyaWJ1dGVzPy5wcm90b2NvbCA/PyBUdW5uZWxQcm90b2NvbC5IdHRwKSk7XG5cdFx0XHRcdGNvbnN0IG5ld0ZvcndhcmQ6IFR1bm5lbCA9IHtcblx0XHRcdFx0XHRyZW1vdGVIb3N0OiB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCxcblx0XHRcdFx0XHRyZW1vdGVQb3J0OiB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCxcblx0XHRcdFx0XHRsb2NhbFBvcnQ6IHR1bm5lbC50dW5uZWxMb2NhbFBvcnQsXG5cdFx0XHRcdFx0bmFtZTogYXR0cmlidXRlcz8ubGFiZWwgPz8gdHVubmVsUHJvcGVydGllcy5uYW1lLFxuXHRcdFx0XHRcdGNsb3NlYWJsZTogdHJ1ZSxcblx0XHRcdFx0XHRsb2NhbEFkZHJlc3M6IHR1bm5lbC5sb2NhbEFkZHJlc3MsXG5cdFx0XHRcdFx0cHJvdG9jb2wsXG5cdFx0XHRcdFx0bG9jYWxVcmk6IGF3YWl0IHRoaXMubWFrZUxvY2FsVXJpKHR1bm5lbC5sb2NhbEFkZHJlc3MsIGF0dHJpYnV0ZXMpLFxuXHRcdFx0XHRcdHJ1bm5pbmdQcm9jZXNzOiBtYXRjaGluZ0NhbmRpZGF0ZT8uZGV0YWlsLFxuXHRcdFx0XHRcdGhhc1J1bm5pbmdQcm9jZXNzOiAhIW1hdGNoaW5nQ2FuZGlkYXRlLFxuXHRcdFx0XHRcdHBpZDogbWF0Y2hpbmdDYW5kaWRhdGU/LnBpZCxcblx0XHRcdFx0XHRzb3VyY2U6IHR1bm5lbFByb3BlcnRpZXMuc291cmNlID8/IFVzZXJUdW5uZWxTb3VyY2UsXG5cdFx0XHRcdFx0cHJpdmFjeTogdHVubmVsLnByaXZhY3ksXG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMuZm9yd2FyZGVkLnNldChrZXksIG5ld0ZvcndhcmQpO1xuXHRcdFx0XHR0aGlzLnJlbW90ZVR1bm5lbHMuc2V0KGtleSwgdHVubmVsKTtcblx0XHRcdFx0dGhpcy5pblByb2dyZXNzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnN0b3JlRm9yd2FyZGVkKCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2hvd1BvcnRNaXNtYXRjaE1vZGFsSWZOZWVkZWQodHVubmVsLCBsb2NhbFBvcnQsIGF0dHJpYnV0ZXMpO1xuXHRcdFx0XHR0aGlzLl9vbkZvcndhcmRQb3J0LmZpcmUobmV3Rm9yd2FyZCk7XG5cdFx0XHRcdHJldHVybiB0dW5uZWw7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmluUHJvZ3Jlc3MuZGVsZXRlKGtleSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLm1lcmdlQXR0cmlidXRlc0ludG9FeGlzdGluZ1R1bm5lbChleGlzdGluZ1R1bm5lbCwgdHVubmVsUHJvcGVydGllcywgYXR0cmlidXRlcyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5vVHVubmVsVmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIG1lcmdlQ2FjaGVkQW5kVW5yZXN0b3JlZFByb3BlcnRpZXMoa2V5OiBzdHJpbmcsIHR1bm5lbFByb3BlcnRpZXM6IFR1bm5lbFByb3BlcnRpZXMpOiBUdW5uZWxQcm9wZXJ0aWVzIHtcblx0XHRjb25zdCBtYXAgPSB0aGlzLnVucmVzdG9yZWRFeHRlbnNpb25UdW5uZWxzLmhhcyhrZXkpID8gdGhpcy51bnJlc3RvcmVkRXh0ZW5zaW9uVHVubmVscyA6ICh0aGlzLnNlc3Npb25DYWNoZWRQcm9wZXJ0aWVzLmhhcyhrZXkpID8gdGhpcy5zZXNzaW9uQ2FjaGVkUHJvcGVydGllcyA6IHVuZGVmaW5lZCk7XG5cdFx0aWYgKG1hcCkge1xuXHRcdFx0Y29uc3QgdXBkYXRlUHJvcHMgPSBtYXAuZ2V0KGtleSkhO1xuXHRcdFx0bWFwLmRlbGV0ZShrZXkpO1xuXHRcdFx0aWYgKHVwZGF0ZVByb3BzKSB7XG5cdFx0XHRcdHR1bm5lbFByb3BlcnRpZXMubmFtZSA9IHVwZGF0ZVByb3BzLm5hbWUgPz8gdHVubmVsUHJvcGVydGllcy5uYW1lO1xuXHRcdFx0XHR0dW5uZWxQcm9wZXJ0aWVzLmxvY2FsID0gKCgnbG9jYWwnIGluIHVwZGF0ZVByb3BzKSA/IHVwZGF0ZVByb3BzLmxvY2FsIDogKCgnbG9jYWxQb3J0JyBpbiB1cGRhdGVQcm9wcykgPyB1cGRhdGVQcm9wcy5sb2NhbFBvcnQgOiB1bmRlZmluZWQpKSA/PyB0dW5uZWxQcm9wZXJ0aWVzLmxvY2FsO1xuXHRcdFx0XHR0dW5uZWxQcm9wZXJ0aWVzLnByaXZhY3kgPSB0dW5uZWxQcm9wZXJ0aWVzLnByaXZhY3k7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0dW5uZWxQcm9wZXJ0aWVzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBtZXJnZUF0dHJpYnV0ZXNJbnRvRXhpc3RpbmdUdW5uZWwoZXhpc3RpbmdUdW5uZWw6IFR1bm5lbCwgdHVubmVsUHJvcGVydGllczogVHVubmVsUHJvcGVydGllcywgYXR0cmlidXRlczogQXR0cmlidXRlcyB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IG5ld05hbWUgPSBhdHRyaWJ1dGVzPy5sYWJlbCA/PyB0dW5uZWxQcm9wZXJ0aWVzLm5hbWU7XG5cdFx0ZW51bSBNZXJnZWRBdHRyaWJ1dGVBY3Rpb24ge1xuXHRcdFx0Tm9uZSA9IDAsXG5cdFx0XHRGaXJlID0gMSxcblx0XHRcdFJlb3BlbiA9IDJcblx0XHR9XG5cdFx0bGV0IG1lcmdlZEFjdGlvbiA9IE1lcmdlZEF0dHJpYnV0ZUFjdGlvbi5Ob25lO1xuXHRcdGlmIChuZXdOYW1lICE9PSBleGlzdGluZ1R1bm5lbC5uYW1lKSB7XG5cdFx0XHRleGlzdGluZ1R1bm5lbC5uYW1lID0gbmV3TmFtZTtcblx0XHRcdG1lcmdlZEFjdGlvbiA9IE1lcmdlZEF0dHJpYnV0ZUFjdGlvbi5GaXJlO1xuXHRcdH1cblx0XHQvLyBTb3VyY2Ugb2YgZXhpc3RpbmcgdHVubmVsIHdpbnMgc28gdGhhdCBvcmlnaW5hbCBzb3VyY2UgaXMgbWFpbnRhaW5lZFxuXHRcdGlmICgoYXR0cmlidXRlcz8ucHJvdG9jb2wgfHwgKGV4aXN0aW5nVHVubmVsLnByb3RvY29sICE9PSBUdW5uZWxQcm90b2NvbC5IdHRwKSkgJiYgKGF0dHJpYnV0ZXM/LnByb3RvY29sICE9PSBleGlzdGluZ1R1bm5lbC5wcm90b2NvbCkpIHtcblx0XHRcdHR1bm5lbFByb3BlcnRpZXMuc291cmNlID0gZXhpc3RpbmdUdW5uZWwuc291cmNlO1xuXHRcdFx0bWVyZ2VkQWN0aW9uID0gTWVyZ2VkQXR0cmlidXRlQWN0aW9uLlJlb3Blbjtcblx0XHR9XG5cdFx0Ly8gTmV3IHByaXZhY3kgdmFsdWUgd2luc1xuXHRcdGlmICh0dW5uZWxQcm9wZXJ0aWVzLnByaXZhY3kgJiYgKGV4aXN0aW5nVHVubmVsLnByaXZhY3kgIT09IHR1bm5lbFByb3BlcnRpZXMucHJpdmFjeSkpIHtcblx0XHRcdG1lcmdlZEFjdGlvbiA9IE1lcmdlZEF0dHJpYnV0ZUFjdGlvbi5SZW9wZW47XG5cdFx0fVxuXHRcdHN3aXRjaCAobWVyZ2VkQWN0aW9uKSB7XG5cdFx0XHRjYXNlIE1lcmdlZEF0dHJpYnV0ZUFjdGlvbi5GaXJlOiB7XG5cdFx0XHRcdHRoaXMuX29uRm9yd2FyZFBvcnQuZmlyZSgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgTWVyZ2VkQXR0cmlidXRlQWN0aW9uLlJlb3Blbjoge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNsb3NlKGV4aXN0aW5nVHVubmVsLnJlbW90ZUhvc3QsIGV4aXN0aW5nVHVubmVsLnJlbW90ZVBvcnQsIFR1bm5lbENsb3NlUmVhc29uLlVzZXIpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvRm9yd2FyZCh0dW5uZWxQcm9wZXJ0aWVzLCBhdHRyaWJ1dGVzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbWFwSGFzQWRkcmVzc0xvY2FsaG9zdE9yQWxsSW50ZXJmYWNlcyh0aGlzLnJlbW90ZVR1bm5lbHMsIHR1bm5lbFByb3BlcnRpZXMucmVtb3RlLmhvc3QsIHR1bm5lbFByb3BlcnRpZXMucmVtb3RlLnBvcnQpO1xuXHR9XG5cblx0YXN5bmMgbmFtZShob3N0OiBzdHJpbmcsIHBvcnQ6IG51bWJlciwgbmFtZTogc3RyaW5nKSB7XG5cdFx0Y29uc3QgZXhpc3RpbmdGb3J3YXJkZWQgPSBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMuZm9yd2FyZGVkLCBob3N0LCBwb3J0KTtcblx0XHRjb25zdCBrZXkgPSBtYWtlQWRkcmVzcyhob3N0LCBwb3J0KTtcblx0XHRpZiAoZXhpc3RpbmdGb3J3YXJkZWQpIHtcblx0XHRcdGV4aXN0aW5nRm9yd2FyZGVkLm5hbWUgPSBuYW1lO1xuXHRcdFx0YXdhaXQgdGhpcy5zdG9yZUZvcndhcmRlZCgpO1xuXHRcdFx0dGhpcy5fb25Qb3J0TmFtZS5maXJlKHsgaG9zdCwgcG9ydCB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2UgaWYgKHRoaXMuZGV0ZWN0ZWQuaGFzKGtleSkpIHtcblx0XHRcdHRoaXMuZGV0ZWN0ZWQuZ2V0KGtleSkhLm5hbWUgPSBuYW1lO1xuXHRcdFx0dGhpcy5fb25Qb3J0TmFtZS5maXJlKHsgaG9zdCwgcG9ydCB9KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjbG9zZShob3N0OiBzdHJpbmcsIHBvcnQ6IG51bWJlciwgcmVhc29uOiBUdW5uZWxDbG9zZVJlYXNvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGtleSA9IG1ha2VBZGRyZXNzKGhvc3QsIHBvcnQpO1xuXHRcdGNvbnN0IG9sZFR1bm5lbCA9IHRoaXMuZm9yd2FyZGVkLmdldChrZXkpITtcblx0XHRpZiAoKHJlYXNvbiA9PT0gVHVubmVsQ2xvc2VSZWFzb24uQXV0b0ZvcndhcmRFbmQpICYmIG9sZFR1bm5lbCAmJiAob2xkVHVubmVsLnNvdXJjZS5zb3VyY2UgPT09IFR1bm5lbFNvdXJjZS5BdXRvKSkge1xuXHRcdFx0dGhpcy5zZXNzaW9uQ2FjaGVkUHJvcGVydGllcy5zZXQoa2V5LCB7XG5cdFx0XHRcdGxvY2FsOiBvbGRUdW5uZWwubG9jYWxQb3J0LFxuXHRcdFx0XHRuYW1lOiBvbGRUdW5uZWwubmFtZSxcblx0XHRcdFx0cHJpdmFjeTogb2xkVHVubmVsLnByaXZhY3ksXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy50dW5uZWxTZXJ2aWNlLmNsb3NlVHVubmVsKGhvc3QsIHBvcnQpO1xuXHRcdHJldHVybiB0aGlzLm9uVHVubmVsQ2xvc2VkKHsgaG9zdCwgcG9ydCB9LCByZWFzb24pO1xuXHR9XG5cblx0YWRkcmVzcyhob3N0OiBzdHJpbmcsIHBvcnQ6IG51bWJlcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qga2V5ID0gbWFrZUFkZHJlc3MoaG9zdCwgcG9ydCk7XG5cdFx0cmV0dXJuICh0aGlzLmZvcndhcmRlZC5nZXQoa2V5KSB8fCB0aGlzLmRldGVjdGVkLmdldChrZXkpKT8ubG9jYWxBZGRyZXNzO1xuXHR9XG5cblx0cHVibGljIGdldCBlbnZpcm9ubWVudFR1bm5lbHNTZXQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Vudmlyb25tZW50VHVubmVsc1NldDtcblx0fVxuXG5cdGFkZEVudmlyb25tZW50VHVubmVscyh0dW5uZWxzOiBUdW5uZWxEZXNjcmlwdGlvbltdIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHR1bm5lbHMpIHtcblx0XHRcdGZvciAoY29uc3QgdHVubmVsIG9mIHR1bm5lbHMpIHtcblx0XHRcdFx0Y29uc3QgbWF0Y2hpbmdDYW5kaWRhdGUgPSBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMuX2NhbmRpZGF0ZXMgPz8gbmV3IE1hcCgpLCB0dW5uZWwucmVtb3RlQWRkcmVzcy5ob3N0LCB0dW5uZWwucmVtb3RlQWRkcmVzcy5wb3J0KTtcblx0XHRcdFx0Y29uc3QgbG9jYWxBZGRyZXNzID0gdHlwZW9mIHR1bm5lbC5sb2NhbEFkZHJlc3MgPT09ICdzdHJpbmcnID8gdHVubmVsLmxvY2FsQWRkcmVzcyA6IG1ha2VBZGRyZXNzKHR1bm5lbC5sb2NhbEFkZHJlc3MuaG9zdCwgdHVubmVsLmxvY2FsQWRkcmVzcy5wb3J0KTtcblx0XHRcdFx0dGhpcy5kZXRlY3RlZC5zZXQobWFrZUFkZHJlc3ModHVubmVsLnJlbW90ZUFkZHJlc3MuaG9zdCwgdHVubmVsLnJlbW90ZUFkZHJlc3MucG9ydCksIHtcblx0XHRcdFx0XHRyZW1vdGVIb3N0OiB0dW5uZWwucmVtb3RlQWRkcmVzcy5ob3N0LFxuXHRcdFx0XHRcdHJlbW90ZVBvcnQ6IHR1bm5lbC5yZW1vdGVBZGRyZXNzLnBvcnQsXG5cdFx0XHRcdFx0bG9jYWxBZGRyZXNzOiBsb2NhbEFkZHJlc3MsXG5cdFx0XHRcdFx0cHJvdG9jb2w6IFR1bm5lbFByb3RvY29sLkh0dHAsXG5cdFx0XHRcdFx0bG9jYWxVcmk6IHRoaXMubWFrZUxvY2FsVXJpKGxvY2FsQWRkcmVzcyksXG5cdFx0XHRcdFx0Y2xvc2VhYmxlOiBmYWxzZSxcblx0XHRcdFx0XHRydW5uaW5nUHJvY2VzczogbWF0Y2hpbmdDYW5kaWRhdGU/LmRldGFpbCxcblx0XHRcdFx0XHRoYXNSdW5uaW5nUHJvY2VzczogISFtYXRjaGluZ0NhbmRpZGF0ZSxcblx0XHRcdFx0XHRwaWQ6IG1hdGNoaW5nQ2FuZGlkYXRlPy5waWQsXG5cdFx0XHRcdFx0cHJpdmFjeTogVHVubmVsUHJpdmFjeUlkLkNvbnN0YW50UHJpdmF0ZSxcblx0XHRcdFx0XHRzb3VyY2U6IHtcblx0XHRcdFx0XHRcdHNvdXJjZTogVHVubmVsU291cmNlLkV4dGVuc2lvbixcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3R1bm5lbC5zdGF0aWNhbGx5Rm9yd2FyZGVkJywgXCJTdGF0aWNhbGx5IEZvcndhcmRlZFwiKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMudHVubmVsU2VydmljZS5zZXRFbnZpcm9ubWVudFR1bm5lbCh0dW5uZWwucmVtb3RlQWRkcmVzcy5ob3N0LCB0dW5uZWwucmVtb3RlQWRkcmVzcy5wb3J0LCBsb2NhbEFkZHJlc3MsIFR1bm5lbFByaXZhY3lJZC5Db25zdGFudFByaXZhdGUsIFR1bm5lbFByb3RvY29sLkh0dHApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9lbnZpcm9ubWVudFR1bm5lbHNTZXQgPSB0cnVlO1xuXHRcdHRoaXMuX29uRW52aXJvbm1lbnRUdW5uZWxzU2V0LmZpcmUoKTtcblx0XHR0aGlzLl9vbkZvcndhcmRQb3J0LmZpcmUoKTtcblx0fVxuXG5cdHNldENhbmRpZGF0ZUZpbHRlcihmaWx0ZXI6ICgoY2FuZGlkYXRlczogQ2FuZGlkYXRlUG9ydFtdKSA9PiBQcm9taXNlPENhbmRpZGF0ZVBvcnRbXT4pIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FuZGlkYXRlRmlsdGVyID0gZmlsdGVyO1xuXHR9XG5cblx0YXN5bmMgc2V0Q2FuZGlkYXRlcyhjYW5kaWRhdGVzOiBDYW5kaWRhdGVQb3J0W10pIHtcblx0XHRsZXQgcHJvY2Vzc2VkQ2FuZGlkYXRlcyA9IGNhbmRpZGF0ZXM7XG5cdFx0aWYgKHRoaXMuX2NhbmRpZGF0ZUZpbHRlcikge1xuXHRcdFx0Ly8gV2hlbiBhbiBleHRlbnNpb24gcHJvdmlkZXMgYSBmaWx0ZXIsIHdlIGRvIHRoZSBmaWx0ZXJpbmcgb24gdGhlIGV4dGVuc2lvbiBob3N0IGJlZm9yZSB0aGUgY2FuZGlkYXRlcyBhcmUgc2V0IGhlcmUuXG5cdFx0XHQvLyBIb3dldmVyLCB3aGVuIHRoZSBmaWx0ZXIgZG9lc24ndCBjb21lIGZyb20gYW4gZXh0ZW5zaW9uIHdlIGZpbHRlciBoZXJlLlxuXHRcdFx0cHJvY2Vzc2VkQ2FuZGlkYXRlcyA9IGF3YWl0IHRoaXMuX2NhbmRpZGF0ZUZpbHRlcihjYW5kaWRhdGVzKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVtb3ZlZENhbmRpZGF0ZXMgPSB0aGlzLnVwZGF0ZUluUmVzcG9uc2VUb0NhbmRpZGF0ZXMocHJvY2Vzc2VkQ2FuZGlkYXRlcyk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKFR1bm5lbE1vZGVsKSByZW1vdmVkIGNhbmRpZGF0ZXMgJHtBcnJheS5mcm9tKHJlbW92ZWRDYW5kaWRhdGVzLnZhbHVlcygpKS5tYXAoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5wb3J0KS5qb2luKCcsICcpfWApO1xuXHRcdHRoaXMuX29uQ2FuZGlkYXRlc0NoYW5nZWQuZmlyZShyZW1vdmVkQ2FuZGlkYXRlcyk7XG5cdH1cblxuXHQvLyBSZXR1cm5zIHJlbW92ZWQgY2FuZGlkYXRlc1xuXHRwcml2YXRlIHVwZGF0ZUluUmVzcG9uc2VUb0NhbmRpZGF0ZXMoY2FuZGlkYXRlczogQ2FuZGlkYXRlUG9ydFtdKTogTWFwPHN0cmluZywgeyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9PiB7XG5cdFx0Y29uc3QgcmVtb3ZlZENhbmRpZGF0ZXMgPSB0aGlzLl9jYW5kaWRhdGVzID8/IG5ldyBNYXAoKTtcblx0XHRjb25zdCBjYW5kaWRhdGVzTWFwID0gbmV3IE1hcCgpO1xuXHRcdHRoaXMuX2NhbmRpZGF0ZXMgPSBjYW5kaWRhdGVzTWFwO1xuXHRcdGNhbmRpZGF0ZXMuZm9yRWFjaCh2YWx1ZSA9PiB7XG5cdFx0XHRjb25zdCBhZGRyZXNzS2V5ID0gbWFrZUFkZHJlc3ModmFsdWUuaG9zdCwgdmFsdWUucG9ydCk7XG5cdFx0XHRjYW5kaWRhdGVzTWFwLnNldChhZGRyZXNzS2V5LCB7XG5cdFx0XHRcdGhvc3Q6IHZhbHVlLmhvc3QsXG5cdFx0XHRcdHBvcnQ6IHZhbHVlLnBvcnQsXG5cdFx0XHRcdGRldGFpbDogdmFsdWUuZGV0YWlsLFxuXHRcdFx0XHRwaWQ6IHZhbHVlLnBpZFxuXHRcdFx0fSk7XG5cdFx0XHRyZW1vdmVkQ2FuZGlkYXRlcy5kZWxldGUoYWRkcmVzc0tleSk7XG5cdFx0XHRjb25zdCBmb3J3YXJkZWRWYWx1ZSA9IG1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXModGhpcy5mb3J3YXJkZWQsIHZhbHVlLmhvc3QsIHZhbHVlLnBvcnQpO1xuXHRcdFx0aWYgKGZvcndhcmRlZFZhbHVlKSB7XG5cdFx0XHRcdGZvcndhcmRlZFZhbHVlLnJ1bm5pbmdQcm9jZXNzID0gdmFsdWUuZGV0YWlsO1xuXHRcdFx0XHRmb3J3YXJkZWRWYWx1ZS5oYXNSdW5uaW5nUHJvY2VzcyA9IHRydWU7XG5cdFx0XHRcdGZvcndhcmRlZFZhbHVlLnBpZCA9IHZhbHVlLnBpZDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZW1vdmVkQ2FuZGlkYXRlcy5mb3JFYWNoKChfdmFsdWUsIGtleSkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyc2VkQWRkcmVzcyA9IHBhcnNlQWRkcmVzcyhrZXkpO1xuXHRcdFx0aWYgKCFwYXJzZWRBZGRyZXNzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZvcndhcmRlZFZhbHVlID0gbWFwSGFzQWRkcmVzc0xvY2FsaG9zdE9yQWxsSW50ZXJmYWNlcyh0aGlzLmZvcndhcmRlZCwgcGFyc2VkQWRkcmVzcy5ob3N0LCBwYXJzZWRBZGRyZXNzLnBvcnQpO1xuXHRcdFx0aWYgKGZvcndhcmRlZFZhbHVlKSB7XG5cdFx0XHRcdGZvcndhcmRlZFZhbHVlLnJ1bm5pbmdQcm9jZXNzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRmb3J3YXJkZWRWYWx1ZS5oYXNSdW5uaW5nUHJvY2VzcyA9IGZhbHNlO1xuXHRcdFx0XHRmb3J3YXJkZWRWYWx1ZS5waWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkZXRlY3RlZFZhbHVlID0gbWFwSGFzQWRkcmVzc0xvY2FsaG9zdE9yQWxsSW50ZXJmYWNlcyh0aGlzLmRldGVjdGVkLCBwYXJzZWRBZGRyZXNzLmhvc3QsIHBhcnNlZEFkZHJlc3MucG9ydCk7XG5cdFx0XHRpZiAoZGV0ZWN0ZWRWYWx1ZSkge1xuXHRcdFx0XHRkZXRlY3RlZFZhbHVlLnJ1bm5pbmdQcm9jZXNzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRkZXRlY3RlZFZhbHVlLmhhc1J1bm5pbmdQcm9jZXNzID0gZmFsc2U7XG5cdFx0XHRcdGRldGVjdGVkVmFsdWUucGlkID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiByZW1vdmVkQ2FuZGlkYXRlcztcblx0fVxuXG5cdGdldCBjYW5kaWRhdGVzKCk6IENhbmRpZGF0ZVBvcnRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhbmRpZGF0ZXMgPyBBcnJheS5mcm9tKHRoaXMuX2NhbmRpZGF0ZXMudmFsdWVzKCkpIDogW107XG5cdH1cblxuXHRnZXQgY2FuZGlkYXRlc09yVW5kZWZpbmVkKCk6IENhbmRpZGF0ZVBvcnRbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhbmRpZGF0ZXMgPyB0aGlzLmNhbmRpZGF0ZXMgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUF0dHJpYnV0ZXMoKSB7XG5cdFx0Ly8gSWYgdGhlIGxhYmVsIGNoYW5nZXMgaW4gdGhlIGF0dHJpYnV0ZXMsIHdlIHNob3VsZCB1cGRhdGUgaXQuXG5cdFx0Y29uc3QgdHVubmVscyA9IEFycmF5LmZyb20odGhpcy5mb3J3YXJkZWQudmFsdWVzKCkpO1xuXHRcdGNvbnN0IGFsbEF0dHJpYnV0ZXMgPSBhd2FpdCB0aGlzLmdldEF0dHJpYnV0ZXModHVubmVscy5tYXAodHVubmVsID0+IHtcblx0XHRcdHJldHVybiB7IHBvcnQ6IHR1bm5lbC5yZW1vdGVQb3J0LCBob3N0OiB0dW5uZWwucmVtb3RlSG9zdCB9O1xuXHRcdH0pLCBmYWxzZSk7XG5cdFx0aWYgKCFhbGxBdHRyaWJ1dGVzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZm9yd2FyZGVkIG9mIHR1bm5lbHMpIHtcblx0XHRcdGNvbnN0IGF0dHJpYnV0ZXMgPSBhbGxBdHRyaWJ1dGVzLmdldChmb3J3YXJkZWQucmVtb3RlUG9ydCk7XG5cdFx0XHRpZiAoKGF0dHJpYnV0ZXM/LnByb3RvY29sIHx8IChmb3J3YXJkZWQucHJvdG9jb2wgIT09IFR1bm5lbFByb3RvY29sLkh0dHApKSAmJiAoYXR0cmlidXRlcz8ucHJvdG9jb2wgIT09IGZvcndhcmRlZC5wcm90b2NvbCkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb0ZvcndhcmQoe1xuXHRcdFx0XHRcdHJlbW90ZTogeyBob3N0OiBmb3J3YXJkZWQucmVtb3RlSG9zdCwgcG9ydDogZm9yd2FyZGVkLnJlbW90ZVBvcnQgfSxcblx0XHRcdFx0XHRsb2NhbDogZm9yd2FyZGVkLmxvY2FsUG9ydCxcblx0XHRcdFx0XHRuYW1lOiBmb3J3YXJkZWQubmFtZSxcblx0XHRcdFx0XHRzb3VyY2U6IGZvcndhcmRlZC5zb3VyY2Vcblx0XHRcdFx0fSwgYXR0cmlidXRlcyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghYXR0cmlidXRlcykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChhdHRyaWJ1dGVzLmxhYmVsICYmIGF0dHJpYnV0ZXMubGFiZWwgIT09IGZvcndhcmRlZC5uYW1lKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMubmFtZShmb3J3YXJkZWQucmVtb3RlSG9zdCwgZm9yd2FyZGVkLnJlbW90ZVBvcnQsIGF0dHJpYnV0ZXMubGFiZWwpO1xuXHRcdFx0fVxuXG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0QXR0cmlidXRlcyhmb3J3YXJkZWRQb3J0czogeyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9W10sIGNoZWNrUHJvdmlkZXJzOiBib29sZWFuID0gdHJ1ZSk6IFByb21pc2U8TWFwPG51bWJlciwgQXR0cmlidXRlcz4gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBtYXRjaGluZ0NhbmRpZGF0ZXM6IE1hcDxudW1iZXIsIENhbmRpZGF0ZVBvcnQ+ID0gbmV3IE1hcCgpO1xuXHRcdGNvbnN0IHBpZFRvUG9ydHNNYXBwaW5nOiBNYXA8bnVtYmVyIHwgdW5kZWZpbmVkLCBudW1iZXJbXT4gPSBuZXcgTWFwKCk7XG5cdFx0Zm9yd2FyZGVkUG9ydHMuZm9yRWFjaChmb3J3YXJkZWRQb3J0ID0+IHtcblx0XHRcdGNvbnN0IG1hdGNoaW5nQ2FuZGlkYXRlID0gbWFwSGFzQWRkcmVzc0xvY2FsaG9zdE9yQWxsSW50ZXJmYWNlczxDYW5kaWRhdGVQb3J0Pih0aGlzLl9jYW5kaWRhdGVzID8/IG5ldyBNYXAoKSwgTE9DQUxIT1NUX0FERFJFU1NFU1swXSwgZm9yd2FyZGVkUG9ydC5wb3J0KSA/PyBmb3J3YXJkZWRQb3J0O1xuXHRcdFx0aWYgKG1hdGNoaW5nQ2FuZGlkYXRlKSB7XG5cdFx0XHRcdG1hdGNoaW5nQ2FuZGlkYXRlcy5zZXQoZm9yd2FyZGVkUG9ydC5wb3J0LCBtYXRjaGluZ0NhbmRpZGF0ZSk7XG5cdFx0XHRcdGNvbnN0IHBpZCA9IGlzQ2FuZGlkYXRlUG9ydChtYXRjaGluZ0NhbmRpZGF0ZSkgPyBtYXRjaGluZ0NhbmRpZGF0ZS5waWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICghcGlkVG9Qb3J0c01hcHBpbmcuaGFzKHBpZCkpIHtcblx0XHRcdFx0XHRwaWRUb1BvcnRzTWFwcGluZy5zZXQocGlkLCBbXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cGlkVG9Qb3J0c01hcHBpbmcuZ2V0KHBpZCk/LnB1c2goZm9yd2FyZGVkUG9ydC5wb3J0KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbmZpZ0F0dHJpYnV0ZXM6IE1hcDxudW1iZXIsIEF0dHJpYnV0ZXM+ID0gbmV3IE1hcCgpO1xuXHRcdGZvcndhcmRlZFBvcnRzLmZvckVhY2goZm9yd2FyZGVkUG9ydCA9PiB7XG5cdFx0XHRjb25zdCBhdHRyaWJ1dGVzID0gdGhpcy5jb25maWdQb3J0c0F0dHJpYnV0ZXMuZ2V0QXR0cmlidXRlcyhmb3J3YXJkZWRQb3J0LnBvcnQsIGZvcndhcmRlZFBvcnQuaG9zdCwgbWF0Y2hpbmdDYW5kaWRhdGVzLmdldChmb3J3YXJkZWRQb3J0LnBvcnQpPy5kZXRhaWwpO1xuXHRcdFx0aWYgKGF0dHJpYnV0ZXMpIHtcblx0XHRcdFx0Y29uZmlnQXR0cmlidXRlcy5zZXQoZm9yd2FyZGVkUG9ydC5wb3J0LCBhdHRyaWJ1dGVzKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpZiAoKHRoaXMucG9ydEF0dHJpYnV0ZXNQcm92aWRlcnMubGVuZ3RoID09PSAwKSB8fCAhY2hlY2tQcm92aWRlcnMpIHtcblx0XHRcdHJldHVybiAoY29uZmlnQXR0cmlidXRlcy5zaXplID4gMCkgPyBjb25maWdBdHRyaWJ1dGVzIDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEdyb3VwIGNhbGxzIHRvIHByb3ZpZGUgYXR0cmlidXRlcyBieSBwaWQuXG5cdFx0Y29uc3QgYWxsUHJvdmlkZXJSZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwodGhpcy5wb3J0QXR0cmlidXRlc1Byb3ZpZGVycy5mbGF0TWFwKHByb3ZpZGVyID0+IHtcblx0XHRcdHJldHVybiBBcnJheS5mcm9tKHBpZFRvUG9ydHNNYXBwaW5nLmVudHJpZXMoKSkubWFwKGVudHJ5ID0+IHtcblx0XHRcdFx0Y29uc3QgcG9ydEdyb3VwID0gZW50cnlbMV07XG5cdFx0XHRcdGNvbnN0IG1hdGNoaW5nQ2FuZGlkYXRlID0gbWF0Y2hpbmdDYW5kaWRhdGVzLmdldChwb3J0R3JvdXBbMF0pO1xuXHRcdFx0XHRyZXR1cm4gcHJvdmlkZXIucHJvdmlkZVBvcnRBdHRyaWJ1dGVzKHBvcnRHcm91cCxcblx0XHRcdFx0XHRtYXRjaGluZ0NhbmRpZGF0ZT8ucGlkLCBtYXRjaGluZ0NhbmRpZGF0ZT8uZGV0YWlsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHRjb25zdCBwcm92aWRlZEF0dHJpYnV0ZXM6IE1hcDxudW1iZXIsIFByb3ZpZGVkUG9ydEF0dHJpYnV0ZXM+ID0gbmV3IE1hcCgpO1xuXHRcdGFsbFByb3ZpZGVyUmVzdWx0cy5mb3JFYWNoKGF0dHJpYnV0ZXMgPT4gYXR0cmlidXRlcy5mb3JFYWNoKGF0dHJpYnV0ZSA9PiB7XG5cdFx0XHRpZiAoYXR0cmlidXRlKSB7XG5cdFx0XHRcdHByb3ZpZGVkQXR0cmlidXRlcy5zZXQoYXR0cmlidXRlLnBvcnQsIGF0dHJpYnV0ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKCFjb25maWdBdHRyaWJ1dGVzICYmICFwcm92aWRlZEF0dHJpYnV0ZXMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gTWVyZ2UuIFRoZSBjb25maWcgd2lucy5cblx0XHRjb25zdCBtZXJnZWRBdHRyaWJ1dGVzOiBNYXA8bnVtYmVyLCBBdHRyaWJ1dGVzPiA9IG5ldyBNYXAoKTtcblx0XHRmb3J3YXJkZWRQb3J0cy5mb3JFYWNoKGZvcndhcmRlZFBvcnRzID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IGNvbmZpZ0F0dHJpYnV0ZXMuZ2V0KGZvcndhcmRlZFBvcnRzLnBvcnQpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBwcm92aWRlZEF0dHJpYnV0ZXMuZ2V0KGZvcndhcmRlZFBvcnRzLnBvcnQpO1xuXHRcdFx0bWVyZ2VkQXR0cmlidXRlcy5zZXQoZm9yd2FyZGVkUG9ydHMucG9ydCwge1xuXHRcdFx0XHRlbGV2YXRlSWZOZWVkZWQ6IGNvbmZpZz8uZWxldmF0ZUlmTmVlZGVkLFxuXHRcdFx0XHRsYWJlbDogY29uZmlnPy5sYWJlbCxcblx0XHRcdFx0b25BdXRvRm9yd2FyZDogY29uZmlnPy5vbkF1dG9Gb3J3YXJkID8/IFBvcnRzQXR0cmlidXRlcy5wcm92aWRlZEFjdGlvblRvQWN0aW9uKHByb3ZpZGVyPy5hdXRvRm9yd2FyZEFjdGlvbiksXG5cdFx0XHRcdHJlcXVpcmVMb2NhbFBvcnQ6IGNvbmZpZz8ucmVxdWlyZUxvY2FsUG9ydCxcblx0XHRcdFx0cHJvdG9jb2w6IGNvbmZpZz8ucHJvdG9jb2xcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIG1lcmdlZEF0dHJpYnV0ZXM7XG5cdH1cblxuXHRhZGRBdHRyaWJ1dGVzUHJvdmlkZXIocHJvdmlkZXI6IFBvcnRBdHRyaWJ1dGVzUHJvdmlkZXIpIHtcblx0XHR0aGlzLnBvcnRBdHRyaWJ1dGVzUHJvdmlkZXJzLnB1c2gocHJvdmlkZXIpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVk7QUFDckIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLFdBQVc7QUFDcEIsU0FBOEIsNkJBQTZCO0FBQzNELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMs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QUEsSUFDRixDQUFDLENBQUM7QUFDRixVQUFNLHFCQUEwRCxvQkFBSSxJQUFJO0FBQ3hFLHVCQUFtQixRQUFRLGdCQUFjLFdBQVcsUUFBUSxlQUFhO0FBQ3hFLFVBQUksV0FBVztBQUNkLDJCQUFtQixJQUFJLFVBQVUsTUFBTSxTQUFTO0FBQUEsTUFDakQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFFBQUksQ0FBQyxvQkFBb0IsQ0FBQyxvQkFBb0I7QUFDN0MsYUFBTztBQUFBLElBQ1I7QUFHQSxVQUFNLG1CQUE0QyxvQkFBSSxJQUFJO0FBQzFELG1CQUFlLFFBQVEsQ0FBQUMsb0JBQWtCO0FBQ3hDLFlBQU0sU0FBUyxpQkFBaUIsSUFBSUEsZ0JBQWUsSUFBSTtBQUN2RCxZQUFNLFdBQVcsbUJBQW1CLElBQUlBLGdCQUFlLElBQUk7QUFDM0QsdUJBQWlCLElBQUlBLGdCQUFlLE1BQU07QUFBQSxRQUN6QyxpQkFBaUIsUUFBUTtBQUFBLFFBQ3pCLE9BQU8sUUFBUTtBQUFBLFFBQ2YsZUFBZSxRQUFRLGlCQUFpQixnQkFBZ0IsdUJBQXVCLFVBQVUsaUJBQWlCO0FBQUEsUUFDMUcsa0JBQWtCLFFBQVE7QUFBQSxRQUMxQixVQUFVLFFBQVE7QUFBQSxNQUNuQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLHNCQUFzQixVQUFrQztBQUN2RCxTQUFLLHdCQUF3QixLQUFLLFFBQVE7QUFBQSxFQUMzQztBQUNEO0FBNVllO0FBQUEsRUFEYixTQUFTLEdBQUk7QUFBQSxHQXJQRixZQXNQRTtBQXRQRixjQUFOO0FBQUEsRUErQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXhDVTsiLAogICJuYW1lcyI6IFsiVHVubmVsQ2xvc2VSZWFzb24iLCAiVHVubmVsU291cmNlIiwgIk9uUG9ydEZvcndhcmQiLCAiTWVyZ2VkQXR0cmlidXRlQWN0aW9uIiwgImZvcndhcmRlZFBvcnRzIl0KfQo=
