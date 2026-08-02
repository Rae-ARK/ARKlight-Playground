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
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { OperatingSystem } from "../../../base/common/platform.js";
import { URI } from "../../../base/common/uri.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
const ITunnelService = createDecorator("tunnelService");
const ISharedTunnelsService = createDecorator("sharedTunnelsService");
function isRemoteTunnel(something) {
  const asTunnel = something;
  return !!(asTunnel.tunnelRemotePort && asTunnel.tunnelRemoteHost && asTunnel.localAddress && asTunnel.privacy && asTunnel.dispose);
}
var TunnelProtocol = /* @__PURE__ */ ((TunnelProtocol2) => {
  TunnelProtocol2["Http"] = "http";
  TunnelProtocol2["Https"] = "https";
  return TunnelProtocol2;
})(TunnelProtocol || {});
var TunnelPrivacyId = /* @__PURE__ */ ((TunnelPrivacyId2) => {
  TunnelPrivacyId2["ConstantPrivate"] = "constantPrivate";
  TunnelPrivacyId2["Private"] = "private";
  TunnelPrivacyId2["Public"] = "public";
  return TunnelPrivacyId2;
})(TunnelPrivacyId || {});
function isTunnelProvider(addressOrTunnelProvider) {
  return !!addressOrTunnelProvider.forwardPort;
}
var ProvidedOnAutoForward = /* @__PURE__ */ ((ProvidedOnAutoForward2) => {
  ProvidedOnAutoForward2[ProvidedOnAutoForward2["Notify"] = 1] = "Notify";
  ProvidedOnAutoForward2[ProvidedOnAutoForward2["OpenBrowser"] = 2] = "OpenBrowser";
  ProvidedOnAutoForward2[ProvidedOnAutoForward2["OpenPreview"] = 3] = "OpenPreview";
  ProvidedOnAutoForward2[ProvidedOnAutoForward2["Silent"] = 4] = "Silent";
  ProvidedOnAutoForward2[ProvidedOnAutoForward2["Ignore"] = 5] = "Ignore";
  ProvidedOnAutoForward2[ProvidedOnAutoForward2["OpenBrowserOnce"] = 6] = "OpenBrowserOnce";
  return ProvidedOnAutoForward2;
})(ProvidedOnAutoForward || {});
function extractLocalHostUriMetaDataForPortMapping(uri) {
  if (uri.scheme !== "http" && uri.scheme !== "https") {
    return void 0;
  }
  const localhostMatch = /^(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)$/.exec(uri.authority);
  if (!localhostMatch) {
    return void 0;
  }
  return {
    address: localhostMatch[1],
    port: +localhostMatch[2]
  };
}
function extractQueryLocalHostUriMetaDataForPortMapping(uri) {
  if (uri.scheme !== "http" && uri.scheme !== "https" || !uri.query) {
    return void 0;
  }
  const keyvalues = uri.query.split("&");
  for (const keyvalue of keyvalues) {
    const value = keyvalue.split("=")[1];
    if (/^https?:/.exec(value)) {
      const result = extractLocalHostUriMetaDataForPortMapping(URI.parse(value));
      if (result) {
        return result;
      }
    }
  }
  return void 0;
}
const LOCALHOST_ADDRESSES = ["localhost", "127.0.0.1", "0:0:0:0:0:0:0:1", "::1"];
function isLocalhost(host) {
  return LOCALHOST_ADDRESSES.indexOf(host) >= 0;
}
const ALL_INTERFACES_ADDRESSES = ["0.0.0.0", "0:0:0:0:0:0:0:0", "::"];
function isAllInterfaces(host) {
  return ALL_INTERFACES_ADDRESSES.indexOf(host) >= 0;
}
function isPortPrivileged(port, host, os, osRelease) {
  if (os === OperatingSystem.Windows) {
    return false;
  }
  if (os === OperatingSystem.Macintosh) {
    if (isAllInterfaces(host)) {
      const osVersion = /(\d+)\.(\d+)\.(\d+)/g.exec(osRelease);
      if (osVersion?.length === 4) {
        const major = parseInt(osVersion[1]);
        if (major >= 18) {
          return false;
        }
      }
    }
  }
  return port < 1024;
}
class DisposableTunnel {
  constructor(remoteAddress, localAddress, _dispose) {
    this.remoteAddress = remoteAddress;
    this.localAddress = localAddress;
    this._dispose = _dispose;
    this._onDispose = new Emitter();
    this.onDidDispose = this._onDispose.event;
  }
  dispose() {
    this._onDispose.fire();
    this._onDispose.dispose();
    return this._dispose();
  }
}
let AbstractTunnelService = class extends Disposable {
  constructor(logService, configurationService) {
    super();
    this.logService = logService;
    this.configurationService = configurationService;
    this._onTunnelOpened = this._register(new Emitter());
    this.onTunnelOpened = this._onTunnelOpened.event;
    this._onTunnelClosed = this._register(new Emitter());
    this.onTunnelClosed = this._onTunnelClosed.event;
    this._onAddedTunnelProvider = this._register(new Emitter());
    this.onAddedTunnelProvider = this._onAddedTunnelProvider.event;
    this._tunnels = /* @__PURE__ */ new Map();
    this._canElevate = false;
    this._canChangeProtocol = true;
    this._privacyOptions = [];
    this._factoryInProgress = /* @__PURE__ */ new Set();
  }
  get hasTunnelProvider() {
    return !!this._tunnelProvider;
  }
  get defaultTunnelHost() {
    const settingValue = this.configurationService.getValue("remote.localPortHost");
    return !settingValue || settingValue === "localhost" ? "127.0.0.1" : "0.0.0.0";
  }
  setTunnelProvider(provider) {
    this._tunnelProvider = provider;
    if (!provider) {
      this._canElevate = false;
      this._privacyOptions = [];
      this._onAddedTunnelProvider.fire();
      return {
        dispose: () => {
        }
      };
    }
    this._onAddedTunnelProvider.fire();
    return {
      dispose: () => {
        this._tunnelProvider = void 0;
        this._canElevate = false;
        this._privacyOptions = [];
      }
    };
  }
  setTunnelFeatures(features) {
    this._canElevate = features.elevation;
    this._privacyOptions = features.privacyOptions;
    this._canChangeProtocol = features.protocol;
  }
  get canChangeProtocol() {
    return this._canChangeProtocol;
  }
  get canElevate() {
    return this._canElevate;
  }
  get canChangePrivacy() {
    return this._privacyOptions.length > 0;
  }
  get privacyOptions() {
    return this._privacyOptions;
  }
  get tunnels() {
    return this.getTunnels();
  }
  async getTunnels() {
    const tunnels = [];
    const tunnelArray = Array.from(this._tunnels.values());
    for (const portMap of tunnelArray) {
      const portArray = Array.from(portMap.values());
      for (const x of portArray) {
        const tunnelValue = await x.value;
        if (tunnelValue && typeof tunnelValue !== "string") {
          tunnels.push(tunnelValue);
        }
      }
    }
    return tunnels;
  }
  async dispose() {
    super.dispose();
    for (const portMap of this._tunnels.values()) {
      for (const { value } of portMap.values()) {
        await value.then((tunnel) => typeof tunnel !== "string" ? tunnel?.dispose() : void 0);
      }
      portMap.clear();
    }
    this._tunnels.clear();
  }
  setEnvironmentTunnel(remoteHost, remotePort, localAddress, privacy, protocol) {
    this.addTunnelToMap(remoteHost, remotePort, Promise.resolve({
      tunnelRemoteHost: remoteHost,
      tunnelRemotePort: remotePort,
      localAddress,
      privacy,
      protocol,
      dispose: () => Promise.resolve()
    }));
  }
  async getExistingTunnel(remoteHost, remotePort) {
    if (isAllInterfaces(remoteHost) || isLocalhost(remoteHost)) {
      remoteHost = LOCALHOST_ADDRESSES[0];
    }
    const existing = this.getTunnelFromMap(remoteHost, remotePort);
    if (existing) {
      ++existing.refcount;
      return existing.value;
    }
    return void 0;
  }
  openTunnel(addressProvider, remoteHost, remotePort, localHost, localPort, elevateIfNeeded = false, privacy, protocol) {
    this.logService.trace(`ForwardedPorts: (TunnelService) openTunnel request for ${remoteHost}:${remotePort} on local port ${localPort}.`);
    const addressOrTunnelProvider = this._tunnelProvider ?? addressProvider;
    if (!addressOrTunnelProvider) {
      return void 0;
    }
    if (!remoteHost) {
      remoteHost = "localhost";
    }
    if (!localHost) {
      localHost = this.defaultTunnelHost;
    }
    if (this._tunnelProvider && this._factoryInProgress.has(remotePort)) {
      this.logService.debug(`ForwardedPorts: (TunnelService) Another call to create a tunnel with the same address has occurred before the last one completed. This call will be ignored.`);
      return;
    }
    const resolvedTunnel = this.retainOrCreateTunnel(addressOrTunnelProvider, remoteHost, remotePort, localHost, localPort, elevateIfNeeded, privacy, protocol);
    if (!resolvedTunnel) {
      this.logService.trace(`ForwardedPorts: (TunnelService) Tunnel was not created.`);
      return resolvedTunnel;
    }
    return resolvedTunnel.then((tunnel) => {
      if (!tunnel) {
        this.logService.trace("ForwardedPorts: (TunnelService) New tunnel is undefined.");
        this.removeEmptyOrErrorTunnelFromMap(remoteHost, remotePort);
        return void 0;
      } else if (typeof tunnel === "string") {
        this.logService.trace("ForwardedPorts: (TunnelService) The tunnel provider returned an error when creating the tunnel.");
        this.removeEmptyOrErrorTunnelFromMap(remoteHost, remotePort);
        return tunnel;
      }
      this.logService.trace("ForwardedPorts: (TunnelService) New tunnel established.");
      const newTunnel = this.makeTunnel(tunnel);
      if (tunnel.tunnelRemoteHost !== remoteHost || tunnel.tunnelRemotePort !== remotePort) {
        this.logService.warn("ForwardedPorts: (TunnelService) Created tunnel does not match requirements of requested tunnel. Host or port mismatch.");
      }
      if (privacy && tunnel.privacy !== privacy) {
        this.logService.warn("ForwardedPorts: (TunnelService) Created tunnel does not match requirements of requested tunnel. Privacy mismatch.");
      }
      this._onTunnelOpened.fire(newTunnel);
      return newTunnel;
    });
  }
  makeTunnel(tunnel) {
    return {
      tunnelRemotePort: tunnel.tunnelRemotePort,
      tunnelRemoteHost: tunnel.tunnelRemoteHost,
      tunnelLocalPort: tunnel.tunnelLocalPort,
      localAddress: tunnel.localAddress,
      privacy: tunnel.privacy,
      protocol: tunnel.protocol,
      dispose: async () => {
        this.logService.trace(`ForwardedPorts: (TunnelService) dispose request for ${tunnel.tunnelRemoteHost}:${tunnel.tunnelRemotePort} `);
        const existingHost = this._tunnels.get(tunnel.tunnelRemoteHost);
        if (existingHost) {
          const existing = existingHost.get(tunnel.tunnelRemotePort);
          if (existing) {
            existing.refcount--;
            await this.tryDisposeTunnel(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort, existing);
          }
        }
      }
    };
  }
  async tryDisposeTunnel(remoteHost, remotePort, tunnel) {
    if (tunnel.refcount <= 0) {
      this.logService.trace(`ForwardedPorts: (TunnelService) Tunnel is being disposed ${remoteHost}:${remotePort}.`);
      const disposePromise = tunnel.value.then(async (tunnel2) => {
        if (tunnel2 && typeof tunnel2 !== "string") {
          await tunnel2.dispose(true);
          this._onTunnelClosed.fire({ host: tunnel2.tunnelRemoteHost, port: tunnel2.tunnelRemotePort });
        }
      });
      if (this._tunnels.has(remoteHost)) {
        this._tunnels.get(remoteHost).delete(remotePort);
      }
      return disposePromise;
    }
  }
  async closeTunnel(remoteHost, remotePort) {
    this.logService.trace(`ForwardedPorts: (TunnelService) close request for ${remoteHost}:${remotePort} `);
    const portMap = this._tunnels.get(remoteHost);
    if (portMap && portMap.has(remotePort)) {
      const value = portMap.get(remotePort);
      value.refcount = 0;
      await this.tryDisposeTunnel(remoteHost, remotePort, value);
    }
  }
  addTunnelToMap(remoteHost, remotePort, tunnel) {
    if (!this._tunnels.has(remoteHost)) {
      this._tunnels.set(remoteHost, /* @__PURE__ */ new Map());
    }
    this._tunnels.get(remoteHost).set(remotePort, { refcount: 1, value: tunnel });
  }
  async removeEmptyOrErrorTunnelFromMap(remoteHost, remotePort) {
    const hostMap = this._tunnels.get(remoteHost);
    if (hostMap) {
      const tunnel = hostMap.get(remotePort);
      const tunnelResult = tunnel ? await tunnel.value : void 0;
      if (!tunnelResult || typeof tunnelResult === "string") {
        hostMap.delete(remotePort);
      }
      if (hostMap.size === 0) {
        this._tunnels.delete(remoteHost);
      }
    }
  }
  getTunnelFromMap(remoteHost, remotePort) {
    const hosts = [remoteHost];
    if (isLocalhost(remoteHost)) {
      hosts.push(...LOCALHOST_ADDRESSES);
      hosts.push(...ALL_INTERFACES_ADDRESSES);
    } else if (isAllInterfaces(remoteHost)) {
      hosts.push(...ALL_INTERFACES_ADDRESSES);
    }
    const existingPortMaps = hosts.map((host) => this._tunnels.get(host));
    for (const map of existingPortMaps) {
      const existingTunnel = map?.get(remotePort);
      if (existingTunnel) {
        return existingTunnel;
      }
    }
    return void 0;
  }
  canTunnel(uri) {
    return !!extractLocalHostUriMetaDataForPortMapping(uri);
  }
  createWithProvider(tunnelProvider, remoteHost, remotePort, localPort, elevateIfNeeded, privacy, protocol) {
    this.logService.trace(`ForwardedPorts: (TunnelService) Creating tunnel with provider ${remoteHost}:${remotePort} on local port ${localPort}.`);
    const key = remotePort;
    this._factoryInProgress.add(key);
    const preferredLocalPort = localPort === void 0 ? remotePort : localPort;
    const creationInfo = { elevationRequired: elevateIfNeeded ? this.isPortPrivileged(preferredLocalPort) : false };
    const tunnelOptions = { remoteAddress: { host: remoteHost, port: remotePort }, localAddressPort: localPort, privacy, public: privacy ? privacy !== "private" /* Private */ : void 0, protocol };
    const tunnel = tunnelProvider.forwardPort(tunnelOptions, creationInfo);
    if (tunnel) {
      this.addTunnelToMap(remoteHost, remotePort, tunnel);
      tunnel.finally(() => {
        this.logService.trace("ForwardedPorts: (TunnelService) Tunnel created by provider.");
        this._factoryInProgress.delete(key);
      });
    } else {
      this._factoryInProgress.delete(key);
    }
    return tunnel;
  }
};
AbstractTunnelService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IConfigurationService)
], AbstractTunnelService);
export {
  ALL_INTERFACES_ADDRESSES,
  AbstractTunnelService,
  DisposableTunnel,
  ISharedTunnelsService,
  ITunnelService,
  LOCALHOST_ADDRESSES,
  ProvidedOnAutoForward,
  TunnelPrivacyId,
  TunnelProtocol,
  extractLocalHostUriMetaDataForPortMapping,
  extractQueryLocalHostUriMetaDataForPortMapping,
  isAllInterfaces,
  isLocalhost,
  isPortPrivileged,
  isRemoteTunnel,
  isTunnelProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3R1bm5lbC9jb21tb24vdHVubmVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFkZHJlc3NQcm92aWRlciB9IGZyb20gJy4uLy4uL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRDb25uZWN0aW9uLmpzJztcbmltcG9ydCB7IFR1bm5lbFByaXZhY3kgfSBmcm9tICcuLi8uLi9yZW1vdGUvY29tbW9uL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLmpzJztcblxuZXhwb3J0IGNvbnN0IElUdW5uZWxTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElUdW5uZWxTZXJ2aWNlPigndHVubmVsU2VydmljZScpO1xuZXhwb3J0IGNvbnN0IElTaGFyZWRUdW5uZWxzU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJU2hhcmVkVHVubmVsc1NlcnZpY2U+KCdzaGFyZWRUdW5uZWxzU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJlbW90ZVR1bm5lbCB7XG5cdHJlYWRvbmx5IHR1bm5lbFJlbW90ZVBvcnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgdHVubmVsUmVtb3RlSG9zdDogc3RyaW5nO1xuXHRyZWFkb25seSB0dW5uZWxMb2NhbFBvcnQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxvY2FsQWRkcmVzczogc3RyaW5nO1xuXHRyZWFkb25seSBwcml2YWN5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByb3RvY29sPzogc3RyaW5nO1xuXHRkaXNwb3NlKHNpbGVudD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNSZW1vdGVUdW5uZWwoc29tZXRoaW5nOiB1bmtub3duKTogc29tZXRoaW5nIGlzIFJlbW90ZVR1bm5lbCB7XG5cdGNvbnN0IGFzVHVubmVsOiBQYXJ0aWFsPFJlbW90ZVR1bm5lbD4gPSBzb21ldGhpbmcgYXMgUGFydGlhbDxSZW1vdGVUdW5uZWw+O1xuXHRyZXR1cm4gISEoYXNUdW5uZWwudHVubmVsUmVtb3RlUG9ydCAmJiBhc1R1bm5lbC50dW5uZWxSZW1vdGVIb3N0ICYmIGFzVHVubmVsLmxvY2FsQWRkcmVzcyAmJiBhc1R1bm5lbC5wcml2YWN5ICYmIGFzVHVubmVsLmRpc3Bvc2UpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFR1bm5lbE9wdGlvbnMge1xuXHRyZW1vdGVBZGRyZXNzOiB7IHBvcnQ6IG51bWJlcjsgaG9zdDogc3RyaW5nIH07XG5cdGxvY2FsQWRkcmVzc1BvcnQ/OiBudW1iZXI7XG5cdGxhYmVsPzogc3RyaW5nO1xuXHRwdWJsaWM/OiBib29sZWFuO1xuXHRwcml2YWN5Pzogc3RyaW5nO1xuXHRwcm90b2NvbD86IHN0cmluZztcbn1cblxuZXhwb3J0IGVudW0gVHVubmVsUHJvdG9jb2wge1xuXHRIdHRwID0gJ2h0dHAnLFxuXHRIdHRwcyA9ICdodHRwcydcbn1cblxuZXhwb3J0IGVudW0gVHVubmVsUHJpdmFjeUlkIHtcblx0Q29uc3RhbnRQcml2YXRlID0gJ2NvbnN0YW50UHJpdmF0ZScsIC8vIHByaXZhdGUsIGFuZCBjaGFuZ2luZyBpcyB1bnN1cHBvcnRlZFxuXHRQcml2YXRlID0gJ3ByaXZhdGUnLFxuXHRQdWJsaWMgPSAncHVibGljJ1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFR1bm5lbENyZWF0aW9uT3B0aW9ucyB7XG5cdGVsZXZhdGlvblJlcXVpcmVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUdW5uZWxQcm92aWRlckZlYXR1cmVzIHtcblx0ZWxldmF0aW9uOiBib29sZWFuO1xuXHQvKipcblx0ICogQGRlcHJlY2F0ZWRcblx0ICovXG5cdHB1YmxpYz86IGJvb2xlYW47XG5cdHByaXZhY3lPcHRpb25zOiBUdW5uZWxQcml2YWN5W107XG5cdHByb3RvY29sOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUdW5uZWxQcm92aWRlciB7XG5cdGZvcndhcmRQb3J0KHR1bm5lbE9wdGlvbnM6IFR1bm5lbE9wdGlvbnMsIHR1bm5lbENyZWF0aW9uT3B0aW9uczogVHVubmVsQ3JlYXRpb25PcHRpb25zKTogUHJvbWlzZTxSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNUdW5uZWxQcm92aWRlcihhZGRyZXNzT3JUdW5uZWxQcm92aWRlcjogSUFkZHJlc3NQcm92aWRlciB8IElUdW5uZWxQcm92aWRlcik6IGFkZHJlc3NPclR1bm5lbFByb3ZpZGVyIGlzIElUdW5uZWxQcm92aWRlciB7XG5cdHJldHVybiAhIShhZGRyZXNzT3JUdW5uZWxQcm92aWRlciBhcyBJVHVubmVsUHJvdmlkZXIpLmZvcndhcmRQb3J0O1xufVxuXG5leHBvcnQgZW51bSBQcm92aWRlZE9uQXV0b0ZvcndhcmQge1xuXHROb3RpZnkgPSAxLFxuXHRPcGVuQnJvd3NlciA9IDIsXG5cdE9wZW5QcmV2aWV3ID0gMyxcblx0U2lsZW50ID0gNCxcblx0SWdub3JlID0gNSxcblx0T3BlbkJyb3dzZXJPbmNlID0gNlxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb3ZpZGVkUG9ydEF0dHJpYnV0ZXMge1xuXHRwb3J0OiBudW1iZXI7XG5cdGF1dG9Gb3J3YXJkQWN0aW9uOiBQcm92aWRlZE9uQXV0b0ZvcndhcmQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUG9ydEF0dHJpYnV0ZXNQcm92aWRlciB7XG5cdHByb3ZpZGVQb3J0QXR0cmlidXRlcyhwb3J0czogbnVtYmVyW10sIHBpZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBjb21tYW5kTGluZTogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFByb3ZpZGVkUG9ydEF0dHJpYnV0ZXNbXT47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVR1bm5lbCB7XG5cdHJlbW90ZUFkZHJlc3M6IHsgcG9ydDogbnVtYmVyOyBob3N0OiBzdHJpbmcgfTtcblxuXHQvKipcblx0ICogVGhlIGNvbXBsZXRlIGxvY2FsIGFkZHJlc3MoZXguIGxvY2FsaG9zdDoxMjM0KVxuXHQgKi9cblx0bG9jYWxBZGRyZXNzOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIFVzZSBwcml2YWN5IGluc3RlYWRcblx0ICovXG5cdHB1YmxpYz86IGJvb2xlYW47XG5cblx0cHJpdmFjeT86IHN0cmluZztcblxuXHRwcm90b2NvbD86IHN0cmluZztcblxuXHQvKipcblx0ICogSW1wbGVtZW50ZXJzIG9mIFR1bm5lbCBzaG91bGQgZmlyZSBvbkRpZERpc3Bvc2Ugd2hlbiBkaXNwb3NlIGlzIGNhbGxlZC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZTogRXZlbnQ8dm9pZD47XG5cblx0ZGlzcG9zZSgpOiBQcm9taXNlPHZvaWQ+IHwgdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2hhcmVkVHVubmVsc1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0b3BlblR1bm5lbChhdXRob3JpdHk6IHN0cmluZywgYWRkcmVzc1Byb3ZpZGVyOiBJQWRkcmVzc1Byb3ZpZGVyIHwgdW5kZWZpbmVkLCByZW1vdGVIb3N0OiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlbW90ZVBvcnQ6IG51bWJlciwgbG9jYWxIb3N0OiBzdHJpbmcsIGxvY2FsUG9ydD86IG51bWJlciwgZWxldmF0ZUlmTmVlZGVkPzogYm9vbGVhbiwgcHJpdmFjeT86IHN0cmluZywgcHJvdG9jb2w/OiBzdHJpbmcpOiBQcm9taXNlPFJlbW90ZVR1bm5lbCB8IHN0cmluZyB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVR1bm5lbFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgdHVubmVsczogUHJvbWlzZTxyZWFkb25seSBSZW1vdGVUdW5uZWxbXT47XG5cdHJlYWRvbmx5IGNhbkNoYW5nZVByaXZhY3k6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHByaXZhY3lPcHRpb25zOiBUdW5uZWxQcml2YWN5W107XG5cdHJlYWRvbmx5IG9uVHVubmVsT3BlbmVkOiBFdmVudDxSZW1vdGVUdW5uZWw+O1xuXHRyZWFkb25seSBvblR1bm5lbENsb3NlZDogRXZlbnQ8eyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9Pjtcblx0cmVhZG9ubHkgY2FuRWxldmF0ZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2FuQ2hhbmdlUHJvdG9jb2w6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGhhc1R1bm5lbFByb3ZpZGVyOiBib29sZWFuO1xuXHRyZWFkb25seSBvbkFkZGVkVHVubmVsUHJvdmlkZXI6IEV2ZW50PHZvaWQ+O1xuXG5cdGNhblR1bm5lbCh1cmk6IFVSSSk6IGJvb2xlYW47XG5cdG9wZW5UdW5uZWwoYWRkcmVzc1Byb3ZpZGVyOiBJQWRkcmVzc1Byb3ZpZGVyIHwgdW5kZWZpbmVkLCByZW1vdGVIb3N0OiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlbW90ZVBvcnQ6IG51bWJlciwgbG9jYWxIb3N0Pzogc3RyaW5nLCBsb2NhbFBvcnQ/OiBudW1iZXIsIGVsZXZhdGVJZk5lZWRlZD86IGJvb2xlYW4sIHByaXZhY3k/OiBzdHJpbmcsIHByb3RvY29sPzogc3RyaW5nKTogUHJvbWlzZTxSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xuXHRnZXRFeGlzdGluZ1R1bm5lbChyZW1vdGVIb3N0OiBzdHJpbmcsIHJlbW90ZVBvcnQ6IG51bWJlcik6IFByb21pc2U8UmVtb3RlVHVubmVsIHwgc3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0c2V0RW52aXJvbm1lbnRUdW5uZWwocmVtb3RlSG9zdDogc3RyaW5nLCByZW1vdGVQb3J0OiBudW1iZXIsIGxvY2FsQWRkcmVzczogc3RyaW5nLCBwcml2YWN5OiBzdHJpbmcsIHByb3RvY29sOiBzdHJpbmcpOiB2b2lkO1xuXHRjbG9zZVR1bm5lbChyZW1vdGVIb3N0OiBzdHJpbmcsIHJlbW90ZVBvcnQ6IG51bWJlcik6IFByb21pc2U8dm9pZD47XG5cdHNldFR1bm5lbFByb3ZpZGVyKHByb3ZpZGVyOiBJVHVubmVsUHJvdmlkZXIgfCB1bmRlZmluZWQpOiBJRGlzcG9zYWJsZTtcblx0c2V0VHVubmVsRmVhdHVyZXMoZmVhdHVyZXM6IFR1bm5lbFByb3ZpZGVyRmVhdHVyZXMpOiB2b2lkO1xuXHRpc1BvcnRQcml2aWxlZ2VkKHBvcnQ6IG51bWJlcik6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0TG9jYWxIb3N0VXJpTWV0YURhdGFGb3JQb3J0TWFwcGluZyh1cmk6IFVSSSk6IHsgYWRkcmVzczogc3RyaW5nOyBwb3J0OiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdGlmICh1cmkuc2NoZW1lICE9PSAnaHR0cCcgJiYgdXJpLnNjaGVtZSAhPT0gJ2h0dHBzJykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgbG9jYWxob3N0TWF0Y2ggPSAvXihsb2NhbGhvc3R8MTI3XFwuMFxcLjBcXC4xfDBcXC4wXFwuMFxcLjApOihcXGQrKSQvLmV4ZWModXJpLmF1dGhvcml0eSk7XG5cdGlmICghbG9jYWxob3N0TWF0Y2gpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0YWRkcmVzczogbG9jYWxob3N0TWF0Y2hbMV0sXG5cdFx0cG9ydDogK2xvY2FsaG9zdE1hdGNoWzJdLFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFF1ZXJ5TG9jYWxIb3N0VXJpTWV0YURhdGFGb3JQb3J0TWFwcGluZyh1cmk6IFVSSSk6IHsgYWRkcmVzczogc3RyaW5nOyBwb3J0OiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdGlmICh1cmkuc2NoZW1lICE9PSAnaHR0cCcgJiYgdXJpLnNjaGVtZSAhPT0gJ2h0dHBzJyB8fCAhdXJpLnF1ZXJ5KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBrZXl2YWx1ZXMgPSB1cmkucXVlcnkuc3BsaXQoJyYnKTtcblx0Zm9yIChjb25zdCBrZXl2YWx1ZSBvZiBrZXl2YWx1ZXMpIHtcblx0XHRjb25zdCB2YWx1ZSA9IGtleXZhbHVlLnNwbGl0KCc9JylbMV07XG5cdFx0aWYgKC9eaHR0cHM/Oi8uZXhlYyh2YWx1ZSkpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RMb2NhbEhvc3RVcmlNZXRhRGF0YUZvclBvcnRNYXBwaW5nKFVSSS5wYXJzZSh2YWx1ZSkpO1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY29uc3QgTE9DQUxIT1NUX0FERFJFU1NFUyA9IFsnbG9jYWxob3N0JywgJzEyNy4wLjAuMScsICcwOjA6MDowOjA6MDowOjEnLCAnOjoxJ107XG5leHBvcnQgZnVuY3Rpb24gaXNMb2NhbGhvc3QoaG9zdDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBMT0NBTEhPU1RfQUREUkVTU0VTLmluZGV4T2YoaG9zdCkgPj0gMDtcbn1cblxuZXhwb3J0IGNvbnN0IEFMTF9JTlRFUkZBQ0VTX0FERFJFU1NFUyA9IFsnMC4wLjAuMCcsICcwOjA6MDowOjA6MDowOjAnLCAnOjonXTtcbmV4cG9ydCBmdW5jdGlvbiBpc0FsbEludGVyZmFjZXMoaG9zdDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBBTExfSU5URVJGQUNFU19BRERSRVNTRVMuaW5kZXhPZihob3N0KSA+PSAwO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNQb3J0UHJpdmlsZWdlZChwb3J0OiBudW1iZXIsIGhvc3Q6IHN0cmluZywgb3M6IE9wZXJhdGluZ1N5c3RlbSwgb3NSZWxlYXNlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpIHtcblx0XHRpZiAoaXNBbGxJbnRlcmZhY2VzKGhvc3QpKSB7XG5cdFx0XHRjb25zdCBvc1ZlcnNpb24gPSAoLyhcXGQrKVxcLihcXGQrKVxcLihcXGQrKS9nKS5leGVjKG9zUmVsZWFzZSk7XG5cdFx0XHRpZiAob3NWZXJzaW9uPy5sZW5ndGggPT09IDQpIHtcblx0XHRcdFx0Y29uc3QgbWFqb3IgPSBwYXJzZUludChvc1ZlcnNpb25bMV0pO1xuXHRcdFx0XHRpZiAobWFqb3IgPj0gMTggLyogc2luY2UgbWFjT1MgTW9qYXZlLCBkYXJ3aW4gdmVyc2lvbiAxOC4wLjAgKi8pIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHBvcnQgPCAxMDI0O1xufVxuXG5leHBvcnQgY2xhc3MgRGlzcG9zYWJsZVR1bm5lbCB7XG5cdHByaXZhdGUgX29uRGlzcG9zZTogRW1pdHRlcjx2b2lkPiA9IG5ldyBFbWl0dGVyKCk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpc3Bvc2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlbW90ZUFkZHJlc3M6IHsgcG9ydDogbnVtYmVyOyBob3N0OiBzdHJpbmcgfSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbG9jYWxBZGRyZXNzOiB7IHBvcnQ6IG51bWJlcjsgaG9zdDogc3RyaW5nIH0gfCBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zZTogKCkgPT4gUHJvbWlzZTx2b2lkPikgeyB9XG5cblx0ZGlzcG9zZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9vbkRpc3Bvc2UuZmlyZSgpO1xuXHRcdHRoaXMuX29uRGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2Rpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RUdW5uZWxTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUdW5uZWxTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfb25UdW5uZWxPcGVuZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxSZW1vdGVUdW5uZWw+KCkpO1xuXHRwdWJsaWMgb25UdW5uZWxPcGVuZWQ6IEV2ZW50PFJlbW90ZVR1bm5lbD4gPSB0aGlzLl9vblR1bm5lbE9wZW5lZC5ldmVudDtcblx0cHJpdmF0ZSBfb25UdW5uZWxDbG9zZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0+KCkpO1xuXHRwdWJsaWMgb25UdW5uZWxDbG9zZWQ6IEV2ZW50PHsgaG9zdDogc3RyaW5nOyBwb3J0OiBudW1iZXIgfT4gPSB0aGlzLl9vblR1bm5lbENsb3NlZC5ldmVudDtcblx0cHJpdmF0ZSBfb25BZGRlZFR1bm5lbFByb3ZpZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyBvbkFkZGVkVHVubmVsUHJvdmlkZXI6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25BZGRlZFR1bm5lbFByb3ZpZGVyLmV2ZW50O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3R1bm5lbHMgPSBuZXcgTWFwPC8qaG9zdCovIHN0cmluZywgTWFwPC8qIHBvcnQgKi8gbnVtYmVyLCB7IHJlZmNvdW50OiBudW1iZXI7IHJlYWRvbmx5IHZhbHVlOiBQcm9taXNlPFJlbW90ZVR1bm5lbCB8IHN0cmluZyB8IHVuZGVmaW5lZD4gfT4+KCk7XG5cdHByb3RlY3RlZCBfdHVubmVsUHJvdmlkZXI6IElUdW5uZWxQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIF9jYW5FbGV2YXRlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2NhbkNoYW5nZVByb3RvY29sOiBib29sZWFuID0gdHJ1ZTtcblx0cHJpdmF0ZSBfcHJpdmFjeU9wdGlvbnM6IFR1bm5lbFByaXZhY3lbXSA9IFtdO1xuXHRwcml2YXRlIF9mYWN0b3J5SW5Qcm9ncmVzczogU2V0PG51bWJlci8qcG9ydCovPiA9IG5ldyBTZXQoKTtcblxuXHRwdWJsaWMgY29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkgeyBzdXBlcigpOyB9XG5cblx0Z2V0IGhhc1R1bm5lbFByb3ZpZGVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX3R1bm5lbFByb3ZpZGVyO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldCBkZWZhdWx0VHVubmVsSG9zdCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHNldHRpbmdWYWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3JlbW90ZS5sb2NhbFBvcnRIb3N0Jyk7XG5cdFx0cmV0dXJuICghc2V0dGluZ1ZhbHVlIHx8IHNldHRpbmdWYWx1ZSA9PT0gJ2xvY2FsaG9zdCcpID8gJzEyNy4wLjAuMScgOiAnMC4wLjAuMCc7XG5cdH1cblxuXHRzZXRUdW5uZWxQcm92aWRlcihwcm92aWRlcjogSVR1bm5lbFByb3ZpZGVyIHwgdW5kZWZpbmVkKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX3R1bm5lbFByb3ZpZGVyID0gcHJvdmlkZXI7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0Ly8gY2xlYXIgZmVhdHVyZXNcblx0XHRcdHRoaXMuX2NhbkVsZXZhdGUgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3ByaXZhY3lPcHRpb25zID0gW107XG5cdFx0XHR0aGlzLl9vbkFkZGVkVHVubmVsUHJvdmlkZXIuZmlyZSgpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRoaXMuX29uQWRkZWRUdW5uZWxQcm92aWRlci5maXJlKCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fdHVubmVsUHJvdmlkZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2NhbkVsZXZhdGUgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fcHJpdmFjeU9wdGlvbnMgPSBbXTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0c2V0VHVubmVsRmVhdHVyZXMoZmVhdHVyZXM6IFR1bm5lbFByb3ZpZGVyRmVhdHVyZXMpOiB2b2lkIHtcblx0XHR0aGlzLl9jYW5FbGV2YXRlID0gZmVhdHVyZXMuZWxldmF0aW9uO1xuXHRcdHRoaXMuX3ByaXZhY3lPcHRpb25zID0gZmVhdHVyZXMucHJpdmFjeU9wdGlvbnM7XG5cdFx0dGhpcy5fY2FuQ2hhbmdlUHJvdG9jb2wgPSBmZWF0dXJlcy5wcm90b2NvbDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY2FuQ2hhbmdlUHJvdG9jb2woKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhbkNoYW5nZVByb3RvY29sO1xuXHR9XG5cblx0cHVibGljIGdldCBjYW5FbGV2YXRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jYW5FbGV2YXRlO1xuXHR9XG5cblx0cHVibGljIGdldCBjYW5DaGFuZ2VQcml2YWN5KCkge1xuXHRcdHJldHVybiB0aGlzLl9wcml2YWN5T3B0aW9ucy5sZW5ndGggPiAwO1xuXHR9XG5cblx0cHVibGljIGdldCBwcml2YWN5T3B0aW9ucygpIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJpdmFjeU9wdGlvbnM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHR1bm5lbHMoKTogUHJvbWlzZTxyZWFkb25seSBSZW1vdGVUdW5uZWxbXT4ge1xuXHRcdHJldHVybiB0aGlzLmdldFR1bm5lbHMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VHVubmVscygpOiBQcm9taXNlPHJlYWRvbmx5IFJlbW90ZVR1bm5lbFtdPiB7XG5cdFx0Y29uc3QgdHVubmVsczogUmVtb3RlVHVubmVsW10gPSBbXTtcblx0XHRjb25zdCB0dW5uZWxBcnJheSA9IEFycmF5LmZyb20odGhpcy5fdHVubmVscy52YWx1ZXMoKSk7XG5cdFx0Zm9yIChjb25zdCBwb3J0TWFwIG9mIHR1bm5lbEFycmF5KSB7XG5cdFx0XHRjb25zdCBwb3J0QXJyYXkgPSBBcnJheS5mcm9tKHBvcnRNYXAudmFsdWVzKCkpO1xuXHRcdFx0Zm9yIChjb25zdCB4IG9mIHBvcnRBcnJheSkge1xuXHRcdFx0XHRjb25zdCB0dW5uZWxWYWx1ZSA9IGF3YWl0IHgudmFsdWU7XG5cdFx0XHRcdGlmICh0dW5uZWxWYWx1ZSAmJiAodHlwZW9mIHR1bm5lbFZhbHVlICE9PSAnc3RyaW5nJykpIHtcblx0XHRcdFx0XHR0dW5uZWxzLnB1c2godHVubmVsVmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0dW5uZWxzO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZGlzcG9zZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0Zm9yIChjb25zdCBwb3J0TWFwIG9mIHRoaXMuX3R1bm5lbHMudmFsdWVzKCkpIHtcblx0XHRcdGZvciAoY29uc3QgeyB2YWx1ZSB9IG9mIHBvcnRNYXAudmFsdWVzKCkpIHtcblx0XHRcdFx0YXdhaXQgdmFsdWUudGhlbih0dW5uZWwgPT4gdHlwZW9mIHR1bm5lbCAhPT0gJ3N0cmluZycgPyB0dW5uZWw/LmRpc3Bvc2UoKSA6IHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHRwb3J0TWFwLmNsZWFyKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3R1bm5lbHMuY2xlYXIoKTtcblx0fVxuXG5cdHNldEVudmlyb25tZW50VHVubmVsKHJlbW90ZUhvc3Q6IHN0cmluZywgcmVtb3RlUG9ydDogbnVtYmVyLCBsb2NhbEFkZHJlc3M6IHN0cmluZywgcHJpdmFjeTogc3RyaW5nLCBwcm90b2NvbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5hZGRUdW5uZWxUb01hcChyZW1vdGVIb3N0LCByZW1vdGVQb3J0LCBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0dHVubmVsUmVtb3RlSG9zdDogcmVtb3RlSG9zdCxcblx0XHRcdHR1bm5lbFJlbW90ZVBvcnQ6IHJlbW90ZVBvcnQsXG5cdFx0XHRsb2NhbEFkZHJlc3MsXG5cdFx0XHRwcml2YWN5LFxuXHRcdFx0cHJvdG9jb2wsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoKVxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIGdldEV4aXN0aW5nVHVubmVsKHJlbW90ZUhvc3Q6IHN0cmluZywgcmVtb3RlUG9ydDogbnVtYmVyKTogUHJvbWlzZTxSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoaXNBbGxJbnRlcmZhY2VzKHJlbW90ZUhvc3QpIHx8IGlzTG9jYWxob3N0KHJlbW90ZUhvc3QpKSB7XG5cdFx0XHRyZW1vdGVIb3N0ID0gTE9DQUxIT1NUX0FERFJFU1NFU1swXTtcblx0XHR9XG5cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuZ2V0VHVubmVsRnJvbU1hcChyZW1vdGVIb3N0LCByZW1vdGVQb3J0KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdCsrZXhpc3RpbmcucmVmY291bnQ7XG5cdFx0XHRyZXR1cm4gZXhpc3RpbmcudmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvcGVuVHVubmVsKGFkZHJlc3NQcm92aWRlcjogSUFkZHJlc3NQcm92aWRlciB8IHVuZGVmaW5lZCwgcmVtb3RlSG9zdDogc3RyaW5nIHwgdW5kZWZpbmVkLCByZW1vdGVQb3J0OiBudW1iZXIsIGxvY2FsSG9zdD86IHN0cmluZywgbG9jYWxQb3J0PzogbnVtYmVyLCBlbGV2YXRlSWZOZWVkZWQ6IGJvb2xlYW4gPSBmYWxzZSwgcHJpdmFjeT86IHN0cmluZywgcHJvdG9jb2w/OiBzdHJpbmcpOiBQcm9taXNlPFJlbW90ZVR1bm5lbCB8IHN0cmluZyB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChUdW5uZWxTZXJ2aWNlKSBvcGVuVHVubmVsIHJlcXVlc3QgZm9yICR7cmVtb3RlSG9zdH06JHtyZW1vdGVQb3J0fSBvbiBsb2NhbCBwb3J0ICR7bG9jYWxQb3J0fS5gKTtcblx0XHRjb25zdCBhZGRyZXNzT3JUdW5uZWxQcm92aWRlciA9IHRoaXMuX3R1bm5lbFByb3ZpZGVyID8/IGFkZHJlc3NQcm92aWRlcjtcblx0XHRpZiAoIWFkZHJlc3NPclR1bm5lbFByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghcmVtb3RlSG9zdCkge1xuXHRcdFx0cmVtb3RlSG9zdCA9ICdsb2NhbGhvc3QnO1xuXHRcdH1cblx0XHRpZiAoIWxvY2FsSG9zdCkge1xuXHRcdFx0bG9jYWxIb3N0ID0gdGhpcy5kZWZhdWx0VHVubmVsSG9zdDtcblx0XHR9XG5cblx0XHQvLyBQcmV2ZW50IHR1bm5lbCBmYWN0b3JpZXMgZnJvbSBjYWxsaW5nIG9wZW5UdW5uZWwgZnJvbSB3aXRoaW4gdGhlIGZhY3Rvcnlcblx0XHRpZiAodGhpcy5fdHVubmVsUHJvdmlkZXIgJiYgdGhpcy5fZmFjdG9yeUluUHJvZ3Jlc3MuaGFzKHJlbW90ZVBvcnQpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYEZvcndhcmRlZFBvcnRzOiAoVHVubmVsU2VydmljZSkgQW5vdGhlciBjYWxsIHRvIGNyZWF0ZSBhIHR1bm5lbCB3aXRoIHRoZSBzYW1lIGFkZHJlc3MgaGFzIG9jY3VycmVkIGJlZm9yZSB0aGUgbGFzdCBvbmUgY29tcGxldGVkLiBUaGlzIGNhbGwgd2lsbCBiZSBpZ25vcmVkLmApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc29sdmVkVHVubmVsID0gdGhpcy5yZXRhaW5PckNyZWF0ZVR1bm5lbChhZGRyZXNzT3JUdW5uZWxQcm92aWRlciwgcmVtb3RlSG9zdCwgcmVtb3RlUG9ydCwgbG9jYWxIb3N0LCBsb2NhbFBvcnQsIGVsZXZhdGVJZk5lZWRlZCwgcHJpdmFjeSwgcHJvdG9jb2wpO1xuXHRcdGlmICghcmVzb2x2ZWRUdW5uZWwpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChUdW5uZWxTZXJ2aWNlKSBUdW5uZWwgd2FzIG5vdCBjcmVhdGVkLmApO1xuXHRcdFx0cmV0dXJuIHJlc29sdmVkVHVubmVsO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXNvbHZlZFR1bm5lbC50aGVuKHR1bm5lbCA9PiB7XG5cdFx0XHRpZiAoIXR1bm5lbCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0ZvcndhcmRlZFBvcnRzOiAoVHVubmVsU2VydmljZSkgTmV3IHR1bm5lbCBpcyB1bmRlZmluZWQuJyk7XG5cdFx0XHRcdHRoaXMucmVtb3ZlRW1wdHlPckVycm9yVHVubmVsRnJvbU1hcChyZW1vdGVIb3N0LCByZW1vdGVQb3J0KTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHR1bm5lbCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdGb3J3YXJkZWRQb3J0czogKFR1bm5lbFNlcnZpY2UpIFRoZSB0dW5uZWwgcHJvdmlkZXIgcmV0dXJuZWQgYW4gZXJyb3Igd2hlbiBjcmVhdGluZyB0aGUgdHVubmVsLicpO1xuXHRcdFx0XHR0aGlzLnJlbW92ZUVtcHR5T3JFcnJvclR1bm5lbEZyb21NYXAocmVtb3RlSG9zdCwgcmVtb3RlUG9ydCk7XG5cdFx0XHRcdHJldHVybiB0dW5uZWw7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0ZvcndhcmRlZFBvcnRzOiAoVHVubmVsU2VydmljZSkgTmV3IHR1bm5lbCBlc3RhYmxpc2hlZC4nKTtcblx0XHRcdGNvbnN0IG5ld1R1bm5lbCA9IHRoaXMubWFrZVR1bm5lbCh0dW5uZWwpO1xuXHRcdFx0aWYgKHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0ICE9PSByZW1vdGVIb3N0IHx8IHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0ICE9PSByZW1vdGVQb3J0KSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdGb3J3YXJkZWRQb3J0czogKFR1bm5lbFNlcnZpY2UpIENyZWF0ZWQgdHVubmVsIGRvZXMgbm90IG1hdGNoIHJlcXVpcmVtZW50cyBvZiByZXF1ZXN0ZWQgdHVubmVsLiBIb3N0IG9yIHBvcnQgbWlzbWF0Y2guJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJpdmFjeSAmJiB0dW5uZWwucHJpdmFjeSAhPT0gcHJpdmFjeSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignRm9yd2FyZGVkUG9ydHM6IChUdW5uZWxTZXJ2aWNlKSBDcmVhdGVkIHR1bm5lbCBkb2VzIG5vdCBtYXRjaCByZXF1aXJlbWVudHMgb2YgcmVxdWVzdGVkIHR1bm5lbC4gUHJpdmFjeSBtaXNtYXRjaC4nKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uVHVubmVsT3BlbmVkLmZpcmUobmV3VHVubmVsKTtcblx0XHRcdHJldHVybiBuZXdUdW5uZWw7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIG1ha2VUdW5uZWwodHVubmVsOiBSZW1vdGVUdW5uZWwpOiBSZW1vdGVUdW5uZWwge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0dW5uZWxSZW1vdGVQb3J0OiB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCxcblx0XHRcdHR1bm5lbFJlbW90ZUhvc3Q6IHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LFxuXHRcdFx0dHVubmVsTG9jYWxQb3J0OiB0dW5uZWwudHVubmVsTG9jYWxQb3J0LFxuXHRcdFx0bG9jYWxBZGRyZXNzOiB0dW5uZWwubG9jYWxBZGRyZXNzLFxuXHRcdFx0cHJpdmFjeTogdHVubmVsLnByaXZhY3ksXG5cdFx0XHRwcm90b2NvbDogdHVubmVsLnByb3RvY29sLFxuXHRcdFx0ZGlzcG9zZTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoVHVubmVsU2VydmljZSkgZGlzcG9zZSByZXF1ZXN0IGZvciAke3R1bm5lbC50dW5uZWxSZW1vdGVIb3N0fToke3R1bm5lbC50dW5uZWxSZW1vdGVQb3J0fSBgKTtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmdIb3N0ID0gdGhpcy5fdHVubmVscy5nZXQodHVubmVsLnR1bm5lbFJlbW90ZUhvc3QpO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmdIb3N0KSB7XG5cdFx0XHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBleGlzdGluZ0hvc3QuZ2V0KHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KTtcblx0XHRcdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0XHRcdGV4aXN0aW5nLnJlZmNvdW50LS07XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnRyeURpc3Bvc2VUdW5uZWwodHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsIHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0LCBleGlzdGluZyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJ5RGlzcG9zZVR1bm5lbChyZW1vdGVIb3N0OiBzdHJpbmcsIHJlbW90ZVBvcnQ6IG51bWJlciwgdHVubmVsOiB7IHJlZmNvdW50OiBudW1iZXI7IHJlYWRvbmx5IHZhbHVlOiBQcm9taXNlPFJlbW90ZVR1bm5lbCB8IHN0cmluZyB8IHVuZGVmaW5lZD4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0dW5uZWwucmVmY291bnQgPD0gMCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKFR1bm5lbFNlcnZpY2UpIFR1bm5lbCBpcyBiZWluZyBkaXNwb3NlZCAke3JlbW90ZUhvc3R9OiR7cmVtb3RlUG9ydH0uYCk7XG5cdFx0XHRjb25zdCBkaXNwb3NlUHJvbWlzZTogUHJvbWlzZTx2b2lkPiA9IHR1bm5lbC52YWx1ZS50aGVuKGFzeW5jICh0dW5uZWwpID0+IHtcblx0XHRcdFx0aWYgKHR1bm5lbCAmJiAodHlwZW9mIHR1bm5lbCAhPT0gJ3N0cmluZycpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdHVubmVsLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy5fb25UdW5uZWxDbG9zZWQuZmlyZSh7IGhvc3Q6IHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCBwb3J0OiB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAodGhpcy5fdHVubmVscy5oYXMocmVtb3RlSG9zdCkpIHtcblx0XHRcdFx0dGhpcy5fdHVubmVscy5nZXQocmVtb3RlSG9zdCkhLmRlbGV0ZShyZW1vdGVQb3J0KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBkaXNwb3NlUHJvbWlzZTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjbG9zZVR1bm5lbChyZW1vdGVIb3N0OiBzdHJpbmcsIHJlbW90ZVBvcnQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChUdW5uZWxTZXJ2aWNlKSBjbG9zZSByZXF1ZXN0IGZvciAke3JlbW90ZUhvc3R9OiR7cmVtb3RlUG9ydH0gYCk7XG5cdFx0Y29uc3QgcG9ydE1hcCA9IHRoaXMuX3R1bm5lbHMuZ2V0KHJlbW90ZUhvc3QpO1xuXHRcdGlmIChwb3J0TWFwICYmIHBvcnRNYXAuaGFzKHJlbW90ZVBvcnQpKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHBvcnRNYXAuZ2V0KHJlbW90ZVBvcnQpITtcblx0XHRcdHZhbHVlLnJlZmNvdW50ID0gMDtcblx0XHRcdGF3YWl0IHRoaXMudHJ5RGlzcG9zZVR1bm5lbChyZW1vdGVIb3N0LCByZW1vdGVQb3J0LCB2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFkZFR1bm5lbFRvTWFwKHJlbW90ZUhvc3Q6IHN0cmluZywgcmVtb3RlUG9ydDogbnVtYmVyLCB0dW5uZWw6IFByb21pc2U8UmVtb3RlVHVubmVsIHwgc3RyaW5nIHwgdW5kZWZpbmVkPikge1xuXHRcdGlmICghdGhpcy5fdHVubmVscy5oYXMocmVtb3RlSG9zdCkpIHtcblx0XHRcdHRoaXMuX3R1bm5lbHMuc2V0KHJlbW90ZUhvc3QsIG5ldyBNYXAoKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3R1bm5lbHMuZ2V0KHJlbW90ZUhvc3QpIS5zZXQocmVtb3RlUG9ydCwgeyByZWZjb3VudDogMSwgdmFsdWU6IHR1bm5lbCB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVtb3ZlRW1wdHlPckVycm9yVHVubmVsRnJvbU1hcChyZW1vdGVIb3N0OiBzdHJpbmcsIHJlbW90ZVBvcnQ6IG51bWJlcikge1xuXHRcdGNvbnN0IGhvc3RNYXAgPSB0aGlzLl90dW5uZWxzLmdldChyZW1vdGVIb3N0KTtcblx0XHRpZiAoaG9zdE1hcCkge1xuXHRcdFx0Y29uc3QgdHVubmVsID0gaG9zdE1hcC5nZXQocmVtb3RlUG9ydCk7XG5cdFx0XHRjb25zdCB0dW5uZWxSZXN1bHQgPSB0dW5uZWwgPyBhd2FpdCB0dW5uZWwudmFsdWUgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIXR1bm5lbFJlc3VsdCB8fCAodHlwZW9mIHR1bm5lbFJlc3VsdCA9PT0gJ3N0cmluZycpKSB7XG5cdFx0XHRcdGhvc3RNYXAuZGVsZXRlKHJlbW90ZVBvcnQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhvc3RNYXAuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl90dW5uZWxzLmRlbGV0ZShyZW1vdGVIb3N0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0VHVubmVsRnJvbU1hcChyZW1vdGVIb3N0OiBzdHJpbmcsIHJlbW90ZVBvcnQ6IG51bWJlcik6IHsgcmVmY291bnQ6IG51bWJlcjsgcmVhZG9ubHkgdmFsdWU6IFByb21pc2U8UmVtb3RlVHVubmVsIHwgc3RyaW5nIHwgdW5kZWZpbmVkPiB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBob3N0cyA9IFtyZW1vdGVIb3N0XTtcblx0XHQvLyBPcmRlciBtYXR0ZXJzLiBXZSB3YW50IHRoZSBvcmlnaW5hbCBob3N0IHRvIGJlIGZpcnN0LlxuXHRcdGlmIChpc0xvY2FsaG9zdChyZW1vdGVIb3N0KSkge1xuXHRcdFx0aG9zdHMucHVzaCguLi5MT0NBTEhPU1RfQUREUkVTU0VTKTtcblx0XHRcdC8vIEZvciBsb2NhbGhvc3QsIHdlIGFkZCB0aGUgYWxsIGludGVyZmFjZXMgaG9zdHMgYmVjYXVzZSBpZiB0aGUgdHVubmVsIGlzIGFscmVhZHkgYXZhaWxhYmxlIGF0IGFsbCBpbnRlcmZhY2VzLFxuXHRcdFx0Ly8gdGhlbiBvZiBjb3Vyc2UgaXQgaXMgYXZhaWxhYmxlIGF0IGxvY2FsaG9zdC5cblx0XHRcdGhvc3RzLnB1c2goLi4uQUxMX0lOVEVSRkFDRVNfQUREUkVTU0VTKTtcblx0XHR9IGVsc2UgaWYgKGlzQWxsSW50ZXJmYWNlcyhyZW1vdGVIb3N0KSkge1xuXHRcdFx0aG9zdHMucHVzaCguLi5BTExfSU5URVJGQUNFU19BRERSRVNTRVMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4aXN0aW5nUG9ydE1hcHMgPSBob3N0cy5tYXAoaG9zdCA9PiB0aGlzLl90dW5uZWxzLmdldChob3N0KSk7XG5cdFx0Zm9yIChjb25zdCBtYXAgb2YgZXhpc3RpbmdQb3J0TWFwcykge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdUdW5uZWwgPSBtYXA/LmdldChyZW1vdGVQb3J0KTtcblx0XHRcdGlmIChleGlzdGluZ1R1bm5lbCkge1xuXHRcdFx0XHRyZXR1cm4gZXhpc3RpbmdUdW5uZWw7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjYW5UdW5uZWwodXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFleHRyYWN0TG9jYWxIb3N0VXJpTWV0YURhdGFGb3JQb3J0TWFwcGluZyh1cmkpO1xuXHR9XG5cblx0cHVibGljIGFic3RyYWN0IGlzUG9ydFByaXZpbGVnZWQocG9ydDogbnVtYmVyKTogYm9vbGVhbjtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgcmV0YWluT3JDcmVhdGVUdW5uZWwoYWRkcmVzc1Byb3ZpZGVyOiBJQWRkcmVzc1Byb3ZpZGVyIHwgSVR1bm5lbFByb3ZpZGVyLCByZW1vdGVIb3N0OiBzdHJpbmcsIHJlbW90ZVBvcnQ6IG51bWJlciwgbG9jYWxIb3N0OiBzdHJpbmcsIGxvY2FsUG9ydDogbnVtYmVyIHwgdW5kZWZpbmVkLCBlbGV2YXRlSWZOZWVkZWQ6IGJvb2xlYW4sIHByaXZhY3k/OiBzdHJpbmcsIHByb3RvY29sPzogc3RyaW5nKTogUHJvbWlzZTxSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCBjcmVhdGVXaXRoUHJvdmlkZXIodHVubmVsUHJvdmlkZXI6IElUdW5uZWxQcm92aWRlciwgcmVtb3RlSG9zdDogc3RyaW5nLCByZW1vdGVQb3J0OiBudW1iZXIsIGxvY2FsUG9ydDogbnVtYmVyIHwgdW5kZWZpbmVkLCBlbGV2YXRlSWZOZWVkZWQ6IGJvb2xlYW4sIHByaXZhY3k/OiBzdHJpbmcsIHByb3RvY29sPzogc3RyaW5nKTogUHJvbWlzZTxSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoVHVubmVsU2VydmljZSkgQ3JlYXRpbmcgdHVubmVsIHdpdGggcHJvdmlkZXIgJHtyZW1vdGVIb3N0fToke3JlbW90ZVBvcnR9IG9uIGxvY2FsIHBvcnQgJHtsb2NhbFBvcnR9LmApO1xuXHRcdGNvbnN0IGtleSA9IHJlbW90ZVBvcnQ7XG5cdFx0dGhpcy5fZmFjdG9yeUluUHJvZ3Jlc3MuYWRkKGtleSk7XG5cdFx0Y29uc3QgcHJlZmVycmVkTG9jYWxQb3J0ID0gbG9jYWxQb3J0ID09PSB1bmRlZmluZWQgPyByZW1vdGVQb3J0IDogbG9jYWxQb3J0O1xuXHRcdGNvbnN0IGNyZWF0aW9uSW5mbyA9IHsgZWxldmF0aW9uUmVxdWlyZWQ6IGVsZXZhdGVJZk5lZWRlZCA/IHRoaXMuaXNQb3J0UHJpdmlsZWdlZChwcmVmZXJyZWRMb2NhbFBvcnQpIDogZmFsc2UgfTtcblx0XHRjb25zdCB0dW5uZWxPcHRpb25zOiBUdW5uZWxPcHRpb25zID0geyByZW1vdGVBZGRyZXNzOiB7IGhvc3Q6IHJlbW90ZUhvc3QsIHBvcnQ6IHJlbW90ZVBvcnQgfSwgbG9jYWxBZGRyZXNzUG9ydDogbG9jYWxQb3J0LCBwcml2YWN5LCBwdWJsaWM6IHByaXZhY3kgPyAocHJpdmFjeSAhPT0gVHVubmVsUHJpdmFjeUlkLlByaXZhdGUpIDogdW5kZWZpbmVkLCBwcm90b2NvbCB9O1xuXHRcdGNvbnN0IHR1bm5lbCA9IHR1bm5lbFByb3ZpZGVyLmZvcndhcmRQb3J0KHR1bm5lbE9wdGlvbnMsIGNyZWF0aW9uSW5mbyk7XG5cdFx0aWYgKHR1bm5lbCkge1xuXHRcdFx0dGhpcy5hZGRUdW5uZWxUb01hcChyZW1vdGVIb3N0LCByZW1vdGVQb3J0LCB0dW5uZWwpO1xuXHRcdFx0dHVubmVsLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0ZvcndhcmRlZFBvcnRzOiAoVHVubmVsU2VydmljZSkgVHVubmVsIGNyZWF0ZWQgYnkgcHJvdmlkZXIuJyk7XG5cdFx0XHRcdHRoaXMuX2ZhY3RvcnlJblByb2dyZXNzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2ZhY3RvcnlJblByb2dyZXNzLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHVubmVsO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBc0I7QUFDL0IsU0FBc0Isa0JBQWtCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUlyQixNQUFNLGlCQUFpQixnQkFBZ0MsZUFBZTtBQUN0RSxNQUFNLHdCQUF3QixnQkFBdUMsc0JBQXNCO0FBWTNGLFNBQVMsZUFBZSxXQUErQztBQUM3RSxRQUFNLFdBQWtDO0FBQ3hDLFNBQU8sQ0FBQyxFQUFFLFNBQVMsb0JBQW9CLFNBQVMsb0JBQW9CLFNBQVMsZ0JBQWdCLFNBQVMsV0FBVyxTQUFTO0FBQzNIO0FBV08sSUFBSyxpQkFBTCxrQkFBS0Esb0JBQUw7QUFDTixFQUFBQSxnQkFBQSxVQUFPO0FBQ1AsRUFBQUEsZ0JBQUEsV0FBUTtBQUZHLFNBQUFBO0FBQUEsR0FBQTtBQUtMLElBQUssa0JBQUwsa0JBQUtDLHFCQUFMO0FBQ04sRUFBQUEsaUJBQUEscUJBQWtCO0FBQ2xCLEVBQUFBLGlCQUFBLGFBQVU7QUFDVixFQUFBQSxpQkFBQSxZQUFTO0FBSEUsU0FBQUE7QUFBQSxHQUFBO0FBd0JMLFNBQVMsaUJBQWlCLHlCQUF5RztBQUN6SSxTQUFPLENBQUMsQ0FBRSx3QkFBNEM7QUFDdkQ7QUFFTyxJQUFLLHdCQUFMLGtCQUFLQywyQkFBTDtBQUNOLEVBQUFBLDhDQUFBLFlBQVMsS0FBVDtBQUNBLEVBQUFBLDhDQUFBLGlC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K0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxZQUFZLE1BQU0sV0FBVyxHQUFHLGtCQUFrQixXQUFXLFNBQVMsUUFBUSxVQUFXLFlBQVksMEJBQTJCLFFBQVcsU0FBUztBQUNsTixVQUFNLFNBQVMsZUFBZSxZQUFZLGVBQWUsWUFBWTtBQUNyRSxRQUFJLFFBQVE7QUFDWCxXQUFLLGVBQWUsWUFBWSxZQUFZLE1BQU07QUFDbEQsYUFBTyxRQUFRLE1BQU07QUFDcEIsYUFBSyxXQUFXLE1BQU0sNkRBQTZEO0FBQ25GLGFBQUssbUJBQW1CLE9BQU8sR0FBRztBQUFBLE1BQ25DLENBQUM7QUFBQSxJQUNGLE9BQU87QUFDTixXQUFLLG1CQUFtQixPQUFPLEdBQUc7QUFBQSxJQUNuQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUF2U3NCLHdCQUFmO0FBQUEsRUFpQko7QUFBQSxFQUNBO0FBQUEsR0FsQm1COyIsCiAgIm5hbWVzIjogWyJUdW5uZWxQcm90b2NvbCIsICJUdW5uZWxQcml2YWN5SWQiLCAiUHJvdmlkZWRPbkF1dG9Gb3J3YXJkIiwgInR1bm5lbCJdCn0K
