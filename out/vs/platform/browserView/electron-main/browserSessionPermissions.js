import { DeferredPromise } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { webContents as electronWebContents } from "electron";
import { localize } from "../../../nls.js";
import { StorageScope, StorageTarget } from "../../storage/common/storage.js";
import {
  BrowserPermissionStore,
  PermissionCategory,
  electronPermissionToCategories,
  isAlwaysAllowedPermission,
  toOriginKey
} from "../common/browserPermissions.js";
import { BrowserViewStorageScope } from "../common/browserView.js";
const PROMPT_TIMEOUT_MS = 3e4;
class BrowserSessionPermissions extends Disposable {
  constructor(session) {
    super();
    this._permissionStore = this._register(new BrowserPermissionStore());
    /** Fires on any change to the store (set, clear, hydrate). */
    this.onDidChange = this._permissionStore.onDidChange;
    this._persistable = false;
    /** While set, store changes are coalesced into a single deferred flush. */
    this._batching = false;
    this._batchDirty = false;
    this._onDidRequestPermission = this._register(new Emitter());
    this.onDidRequestPermission = this._onDidRequestPermission.event;
    this._onDidRequestDevice = this._register(new Emitter());
    this.onDidRequestDevice = this._onDidRequestDevice.event;
    this._pending = /* @__PURE__ */ new Set();
    this._pendingDevices = /* @__PURE__ */ new Map();
    this.storageKeys = session.storageScope === BrowserViewStorageScope.Ephemeral ? {} : { permissions: `browser.permissions.${session.id}` };
    this._register(this._permissionStore.onDidChange(() => {
      this._resolvePending();
      if (this._batching) {
        this._batchDirty = true;
        return;
      }
      if (this._persistable) {
        this._flushNow();
      }
    }));
    this._register(toDisposable(() => {
      for (const pending of this._pending) {
        pending.deferred.complete();
      }
      this._pending.clear();
      for (const device of [...this._pendingDevices.values()]) {
        device.settle(null);
      }
    }));
  }
  /**
   * Install the permission request / check / device handlers on the session.
   * Backed entirely by {@link BrowserPermissionStore}; unrecorded categories
   * are brokered to the owning browser view via {@link onDidRequestPermission}.
   */
  configure(electronSession) {
    electronSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      this._resolveRequest(webContents, permission, details).then(callback, () => callback(false));
    });
    electronSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
      if (isAlwaysAllowedPermission(permission)) {
        return true;
      }
      const origin = toOriginKey(details.requestingUrl || requestingOrigin);
      const categories = electronPermissionToCategories(permission, mediaKindsFromDetails(details));
      if (categories.length === 0) {
        return false;
      }
      return categories.every((category) => this._permissionStore.isAllowed(origin, category));
    });
    electronSession.on("select-usb-device", (event, details, callback) => {
      event.preventDefault();
      const target = this._frameTarget(details.frame);
      if (!target || !this._deviceAllowed(target.origin)) {
        callback();
        return;
      }
      this._beginDeviceRequest({
        webContents: target.webContents,
        origin: target.origin,
        deviceType: "usb",
        devices: details.deviceList.map(usbCandidate),
        invoke: (deviceId) => deviceId === null ? callback() : callback(deviceId)
      });
    });
    electronSession.on("usb-device-added", (_event, device, webContents) => {
      this._addDevice(webContents, "usb", usbCandidate(device));
    });
    electronSession.on("usb-device-removed", (_event, device, webContents) => {
      this._removeDevice(webContents, "usb", device.deviceId);
    });
    electronSession.on("select-serial-port", (event, portList, webContents, callback) => {
      event.preventDefault();
      const origin = toOriginKey(webContents.getURL());
      if (!this._deviceAllowed(origin)) {
        callback("");
        return;
      }
      this._beginDeviceRequest({
        webContents,
        origin,
        deviceType: "serial",
        devices: portList.map(serialCandidate),
        invoke: (deviceId) => callback(deviceId ?? "")
      });
    });
    electronSession.on("serial-port-added", (_event, port, webContents) => {
      this._addDevice(webContents, "serial", serialCandidate(port));
    });
    electronSession.on("serial-port-removed", (_event, port, webContents) => {
      this._removeDevice(webContents, "serial", port.portId);
    });
    electronSession.on("select-hid-device", (event, details, callback) => {
      event.preventDefault();
      const target = this._frameTarget(details.frame);
      if (!target || !this._deviceAllowed(target.origin)) {
        callback(null);
        return;
      }
      this._beginDeviceRequest({
        webContents: target.webContents,
        origin: target.origin,
        deviceType: "hid",
        devices: details.deviceList.map(hidCandidate),
        invoke: (deviceId) => callback(deviceId ?? null)
      });
    });
    electronSession.on("hid-device-added", (_event, details) => {
      const target = this._frameTarget(details.frame);
      if (target) {
        this._addDevice(target.webContents, "hid", hidCandidate(details.device));
      }
    });
    electronSession.on("hid-device-removed", (_event, details) => {
      const target = this._frameTarget(details.frame);
      if (target) {
        this._removeDevice(target.webContents, "hid", details.device.deviceId);
      }
    });
  }
  connectStorage(storage) {
    if (this._storage || !this.storageKeys.permissions) {
      return;
    }
    this._storage = storage;
    this._load();
    this._persistable = true;
  }
  serialize() {
    return this._permissionStore.serialize();
  }
  set(origin, grants) {
    const key = toOriginKey(origin);
    for (const grant of grants) {
      if (grant.state === null) {
        this._resolvePendingForCategory(key, grant.category);
      }
    }
    this._batching = true;
    this._batchDirty = false;
    try {
      this._permissionStore.setMany(origin, grants);
    } finally {
      this._batching = false;
    }
    if (this._batchDirty && this._persistable) {
      this._flushNow();
    }
  }
  _resolvePendingForCategory(origin, category) {
    if (!origin || this._pending.size === 0) {
      return;
    }
    for (const pending of [...this._pending]) {
      if (pending.origin === origin && pending.category === category) {
        pending.deferred.complete();
      }
    }
  }
  clear() {
    this._permissionStore.clear();
  }
  // -- Device choosers -------------------------------------------------
  beginBluetoothRequest(webContents, devices, callback) {
    const origin = toOriginKey(webContents.getURL());
    if (!this._deviceAllowed(origin)) {
      callback("");
      return;
    }
    const candidates = devices.map(bluetoothCandidate);
    const existing = this._findActiveDevice(webContents, "bluetooth");
    if (existing) {
      existing.devices = candidates;
      existing.invoke = (deviceId) => callback(deviceId ?? "");
      this._emitDeviceRequest(existing);
      return;
    }
    this._beginDeviceRequest({
      webContents,
      origin,
      deviceType: "bluetooth",
      devices: candidates,
      invoke: (deviceId) => callback(deviceId ?? "")
    });
  }
  resolveDevice(requestId, deviceId) {
    this._pendingDevices.get(requestId)?.settle(deviceId);
  }
  /** Begin a device chooser: register it, emit it, and cancel if unclaimed. */
  _beginDeviceRequest(params) {
    const requestId = generateUuid();
    const settle = (deviceId) => {
      if (pending.settled) {
        return;
      }
      pending.settled = true;
      params.webContents.off("destroyed", cancel);
      this._pendingDevices.delete(requestId);
      pending.invoke(deviceId);
    };
    const cancel = () => settle(null);
    const pending = {
      requestId,
      webContents: params.webContents,
      origin: params.origin,
      deviceType: params.deviceType,
      devices: params.devices,
      settled: false,
      invoke: params.invoke,
      settle
    };
    params.webContents.on("destroyed", cancel);
    this._pendingDevices.set(requestId, pending);
    if (!this._emitDeviceRequest(pending)) {
      cancel();
    }
  }
  _emitDeviceRequest(pending) {
    let claimed = false;
    this._onDidRequestDevice.fire({
      webContents: pending.webContents,
      origin: pending.origin,
      requestId: pending.requestId,
      deviceType: pending.deviceType,
      devices: pending.devices,
      claim: () => {
        claimed = true;
      }
    });
    return claimed;
  }
  _addDevice(webContents, deviceType, candidate) {
    const pending = this._findActiveDevice(webContents, deviceType);
    if (!pending || pending.devices.some((device) => device.deviceId === candidate.deviceId)) {
      return;
    }
    pending.devices = [...pending.devices, candidate];
    this._emitDeviceRequest(pending);
  }
  _removeDevice(webContents, deviceType, deviceId) {
    const pending = this._findActiveDevice(webContents, deviceType);
    if (!pending) {
      return;
    }
    const next = pending.devices.filter((device) => device.deviceId !== deviceId);
    if (next.length === pending.devices.length) {
      return;
    }
    pending.devices = next;
    this._emitDeviceRequest(pending);
  }
  _findActiveDevice(webContents, deviceType) {
    for (const pending of this._pendingDevices.values()) {
      if (!pending.settled && pending.webContents === webContents && pending.deviceType === deviceType) {
        return pending;
      }
    }
    return void 0;
  }
  /** Resolve the owning web contents and origin for a requesting frame. */
  _frameTarget(frame) {
    if (!frame) {
      return void 0;
    }
    const webContents = electronWebContents.fromFrame(frame);
    if (!webContents) {
      return void 0;
    }
    return { webContents, origin: toOriginKey(frame.url || webContents.getURL()) };
  }
  _deviceAllowed(origin) {
    return !!origin && this._permissionStore.isAllowed(origin, PermissionCategory.Devices);
  }
  async _resolveRequest(webContents, permission, details) {
    if (isAlwaysAllowedPermission(permission)) {
      return true;
    }
    const origin = toOriginKey(details?.requestingUrl ?? webContents?.getURL());
    const categories = electronPermissionToCategories(permission, mediaKindsFromDetails(details));
    if (categories.length === 0 || !origin) {
      return false;
    }
    if (categories.every((category) => this._permissionStore.isAllowed(origin, category))) {
      return true;
    }
    if (categories.some((category) => this._permissionStore.getDecision(origin, category) === "deny")) {
      return false;
    }
    for (const category of categories) {
      if (!this._permissionStore.getDecision(origin, category)) {
        await this._prompt(webContents, origin, category);
      }
    }
    return categories.every((category) => this._permissionStore.isAllowed(origin, category));
  }
  _prompt(webContents, origin, category) {
    if (!webContents) {
      return Promise.resolve();
    }
    let claimed = false;
    this._onDidRequestPermission.fire({
      webContents,
      request: { origin, category },
      claim: () => {
        claimed = true;
      }
    });
    if (!claimed) {
      return Promise.resolve();
    }
    const pending = { origin, category, deferred: new DeferredPromise() };
    this._pending.add(pending);
    const timer = setTimeout(() => pending.deferred.complete(), PROMPT_TIMEOUT_MS);
    return pending.deferred.p.finally(() => {
      clearTimeout(timer);
      this._pending.delete(pending);
    });
  }
  /** Resolve any pending request whose (origin, category) now has a decision. */
  _resolvePending() {
    if (this._pending.size === 0) {
      return;
    }
    for (const pending of [...this._pending]) {
      if (this._permissionStore.getDecision(pending.origin, pending.category)) {
        pending.deferred.complete();
      }
    }
  }
  _load() {
    const storage = this._storage;
    const key = this.storageKeys.permissions;
    if (!storage || !key) {
      return;
    }
    const snapshot = parseSnapshot(storage.get(key, StorageScope.APPLICATION));
    this._persistable = false;
    try {
      this._permissionStore.hydrate(snapshot);
    } finally {
      this._persistable = true;
    }
  }
  _flushNow() {
    const storage = this._storage;
    const key = this.storageKeys.permissions;
    if (!storage || !key) {
      return;
    }
    const snapshot = this._permissionStore.serialize();
    if (Object.keys(snapshot.origins).length === 0) {
      storage.remove(key, StorageScope.APPLICATION);
    } else {
      storage.store(key, JSON.stringify(snapshot), StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
  }
}
function parseSnapshot(raw) {
  if (!raw) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return void 0;
    }
    return parsed;
  } catch {
    return void 0;
  }
}
function mediaKindsFromDetails(details) {
  if (!details) {
    return void 0;
  }
  const kinds = /* @__PURE__ */ new Set();
  if ("mediaTypes" in details && details.mediaTypes) {
    for (const kind of details.mediaTypes) {
      kinds.add(kind);
    }
  }
  if ("mediaType" in details && (details.mediaType === "video" || details.mediaType === "audio")) {
    kinds.add(details.mediaType);
  }
  return kinds.size ? [...kinds] : void 0;
}
function vendorProductHex(vendorId, productId) {
  const hex = (value) => (value ?? 0).toString(16).padStart(4, "0");
  return `${hex(vendorId)}:${hex(productId)}`;
}
function usbCandidate(device) {
  const ids = vendorProductHex(device.vendorId, device.productId);
  return {
    deviceId: device.deviceId,
    label: device.productName || device.manufacturerName || localize("browser.device.usb", "USB Device {0}", ids),
    detail: device.serialNumber ? `${ids} \xB7 ${device.serialNumber}` : ids
  };
}
function serialCandidate(port) {
  const ids = port.vendorId && port.productId ? `${port.vendorId}:${port.productId}` : void 0;
  return {
    deviceId: port.portId,
    label: `${port.portName} (${port.displayName})`,
    detail: ids
  };
}
function hidCandidate(device) {
  const ids = vendorProductHex(device.vendorId, device.productId);
  return {
    deviceId: device.deviceId,
    label: device.name || localize("browser.device.hid", "HID Device {0}", ids),
    detail: device.serialNumber ? `${ids} \xB7 ${device.serialNumber}` : ids
  };
}
function bluetoothCandidate(device) {
  return {
    deviceId: device.deviceId,
    label: device.deviceName || device.deviceId,
    detail: device.deviceId
  };
}
export {
  BrowserSessionPermissions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLW1haW4vYnJvd3NlclNlc3Npb25QZXJtaXNzaW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgd2ViQ29udGVudHMgYXMgZWxlY3Ryb25XZWJDb250ZW50cyB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvZWxlY3Ryb24tbWFpbi9zdG9yYWdlTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQge1xuXHRCcm93c2VyRGV2aWNlVHlwZSxcblx0QnJvd3NlclBlcm1pc3Npb25TdG9yZSxcblx0SUJyb3dzZXJEZXZpY2VDYW5kaWRhdGUsXG5cdElQZXJtaXNzaW9uQ2F0ZWdvcnlTdGF0ZSxcblx0SVNlcmlhbGl6ZWRCcm93c2VyUGVybWlzc2lvbnNTbmFwc2hvdCxcblx0UGVybWlzc2lvbkNhdGVnb3J5LFxuXHRlbGVjdHJvblBlcm1pc3Npb25Ub0NhdGVnb3JpZXMsXG5cdGlzQWx3YXlzQWxsb3dlZFBlcm1pc3Npb24sXG5cdHRvT3JpZ2luS2V5LFxufSBmcm9tICcuLi9jb21tb24vYnJvd3NlclBlcm1pc3Npb25zLmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3U3RvcmFnZVNjb3BlLCBJQnJvd3NlclZpZXdQZXJtaXNzaW9uUmVxdWVzdEV2ZW50LCBJQnJvd3NlclZpZXdTdG9yYWdlS2V5cyB9IGZyb20gJy4uL2NvbW1vbi9icm93c2VyVmlldy5qcyc7XG5pbXBvcnQgdHlwZSB7IEJyb3dzZXJTZXNzaW9uIH0gZnJvbSAnLi9icm93c2VyU2Vzc2lvbi5qcyc7XG5cbi8qKiBUaW1lIHRoZSBtYWluIHByb2Nlc3Mgd2FpdHMgZm9yIGEgcHJvbXB0IGFuc3dlciBiZWZvcmUgYSBub24tcGVyc2lzdGVkIGRlbnkuICovXG5jb25zdCBQUk9NUFRfVElNRU9VVF9NUyA9IDMwXzAwMDtcblxuLyoqXG4gKiBGaXJlZCB3aGVuIGEgcGVybWlzc2lvbiByZXF1ZXN0IGZvciBhbiB1bmRlY2lkZWQgY2F0ZWdvcnkgbmVlZHMgVUkuIFRoZSB2aWV3XG4gKiB0aGF0IG93bnMge0BsaW5rIHdlYkNvbnRlbnRzfSBzaG91bGQge0BsaW5rIGNsYWltfSBpdCBhbmQgc3VyZmFjZSBhIHByb21wdDtcbiAqIGlmIG5vIGxpc3RlbmVyIGNsYWltcyBpdCwgdGhlIHJlcXVlc3QgaXMgbGVmdCB1bmRlY2lkZWQgKGVmZmVjdGl2ZSBkZW55KS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQnJvd3NlclNlc3Npb25QZXJtaXNzaW9uUmVxdWVzdCB7XG5cdC8qKiBUaGUgdG9wLWxldmVsIHdlYiBjb250ZW50cyB0aGUgcmVxdWVzdCBvcmlnaW5hdGVzIGZyb20uICovXG5cdHJlYWRvbmx5IHdlYkNvbnRlbnRzOiBFbGVjdHJvbi5XZWJDb250ZW50cztcblx0LyoqIFRoZSBvcmlnaW4gKyBjYXRlZ29yeSBiZWluZyByZXF1ZXN0ZWQuICovXG5cdHJlYWRvbmx5IHJlcXVlc3Q6IElCcm93c2VyVmlld1Blcm1pc3Npb25SZXF1ZXN0RXZlbnQ7XG5cdC8qKiBDYWxsZWQgYnkgdGhlIG93bmluZyB2aWV3IHRvIHRha2UgcmVzcG9uc2liaWxpdHkgZm9yIHByb21wdGluZy4gKi9cblx0Y2xhaW0oKTogdm9pZDtcbn1cblxuLyoqXG4gKiBGaXJlZCB3aGVuIGEgaGFyZHdhcmUtZGV2aWNlIGNob29zZXIgKHtAbGluayBQZXJtaXNzaW9uQ2F0ZWdvcnkuRGV2aWNlc30pIG5lZWRzXG4gKiBVSSwgYW5kIHJlLWZpcmVkIGFzIHRoZSBhdmFpbGFibGUgZGV2aWNlIGxpc3QgY2hhbmdlcy4gVGhlIG93bmluZyB2aWV3XG4gKiB7QGxpbmsgY2xhaW19cyBpdCBhbmQgc3VyZmFjZXMgYSBwaWNrZXI7IHRoZSB1c2VyJ3MgcGljayBpcyByZXBvcnRlZCBiYWNrIHZpYVxuICoge0BsaW5rIElCcm93c2VyU2Vzc2lvblBlcm1pc3Npb25zLnJlc29sdmVEZXZpY2V9LiBJZiB0aGUgb3JpZ2luYXRpbmdcbiAqIHdlYkNvbnRlbnRzIGlzIGRlc3Ryb3llZCBvciB0aGUgc2Vzc2lvbiBpcyBkaXNwb3NlZCwgdGhlIHBhZ2UgcHJvbWlzZSBpc1xuICogc2V0dGxlZCBhbmQgdGhlIHBlbmRpbmcgcmVxdWVzdCBpcyByZW1vdmVkOyBhIGxhdGVcbiAqIHtAbGluayBJQnJvd3NlclNlc3Npb25QZXJtaXNzaW9ucy5yZXNvbHZlRGV2aWNlfSBjYWxsIGlzIHRoZW4gYSBuby1vcC4gQW55XG4gKiBvcGVuIHBpY2tlciBvbiB0aGUgd29ya2JlbmNoIHNpZGUgaXMgbGVmdCBvcGVuIHVudGlsIHRoZSB1c2VyIGRpc21pc3NlcyBpdC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQnJvd3NlclNlc3Npb25EZXZpY2VSZXF1ZXN0IHtcblx0LyoqIFRoZSB0b3AtbGV2ZWwgd2ViIGNvbnRlbnRzIHRoZSByZXF1ZXN0IG9yaWdpbmF0ZXMgZnJvbS4gKi9cblx0cmVhZG9ubHkgd2ViQ29udGVudHM6IEVsZWN0cm9uLldlYkNvbnRlbnRzO1xuXHQvKiogVGhlIG9yaWdpbiByZXF1ZXN0aW5nIGEgZGV2aWNlLiAqL1xuXHRyZWFkb25seSBvcmlnaW46IHN0cmluZztcblx0LyoqIFN0YWJsZSBpZCBjb3JyZWxhdGluZyB0aGUgaW5pdGlhbCByZXF1ZXN0IHdpdGggaXRzIHVwZGF0ZXMuICovXG5cdHJlYWRvbmx5IHJlcXVlc3RJZDogc3RyaW5nO1xuXHQvKiogV2hpY2ggbmF0aXZlIGNob29zZXIgZmxvdyB0aGlzIGlzLiAqL1xuXHRyZWFkb25seSBkZXZpY2VUeXBlOiBCcm93c2VyRGV2aWNlVHlwZTtcblx0LyoqIFRoZSBkZXZpY2VzIGN1cnJlbnRseSBhdmFpbGFibGUgdG8gY2hvb3NlIGZyb20uICovXG5cdHJlYWRvbmx5IGRldmljZXM6IElCcm93c2VyRGV2aWNlQ2FuZGlkYXRlW107XG5cdC8qKiBDYWxsZWQgYnkgdGhlIG93bmluZyB2aWV3IHRvIHRha2UgcmVzcG9uc2liaWxpdHkgZm9yIHRoZSBjaG9vc2VyIFVJLiAqL1xuXHRjbGFpbSgpOiB2b2lkO1xufVxuXG4vKiogSW50ZXJuYWwgcmVjb3JkIG9mIGFuIGluLWZsaWdodCBkZXZpY2UgY2hvb3NlciBhd2FpdGluZyB0aGUgdXNlcidzIHBpY2suICovXG5pbnRlcmZhY2UgSVBlbmRpbmdEZXZpY2VSZXF1ZXN0IHtcblx0cmVhZG9ubHkgcmVxdWVzdElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHdlYkNvbnRlbnRzOiBFbGVjdHJvbi5XZWJDb250ZW50cztcblx0cmVhZG9ubHkgb3JpZ2luOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRldmljZVR5cGU6IEJyb3dzZXJEZXZpY2VUeXBlO1xuXHRkZXZpY2VzOiBJQnJvd3NlckRldmljZUNhbmRpZGF0ZVtdO1xuXHRzZXR0bGVkOiBib29sZWFuO1xuXHQvKiogVHlwZS1zcGVjaWZpYyBhZGFwdGVyIHRoYXQgY2FsbHMgdGhlIG5hdGl2ZSBFbGVjdHJvbiBjYWxsYmFjay4gKi9cblx0aW52b2tlOiAoZGV2aWNlSWQ6IHN0cmluZyB8IG51bGwpID0+IHZvaWQ7XG5cdC8qKiBSZXNvbHZlIHRoZSBjaG9vc2VyIHdpdGggYSBkZXZpY2UgaWQsIG9yIGBudWxsYCB0byBjYW5jZWwuICovXG5cdHNldHRsZShkZXZpY2VJZDogc3RyaW5nIHwgbnVsbCk6IHZvaWQ7XG59XG5cblxuZXhwb3J0IGludGVyZmFjZSBJQnJvd3NlclNlc3Npb25QZXJtaXNzaW9ucyB7XG5cdHJlYWRvbmx5IHN0b3JhZ2VLZXlzOiBJQnJvd3NlclZpZXdTdG9yYWdlS2V5cztcblx0LyoqXG5cdCAqIEZpcmVzIHdoZW4gYW4gdW5kZWNpZGVkIHBlcm1pc3Npb24gbmVlZHMgVUkuIEVhY2ggYnJvd3NlciB2aWV3IGxpc3RlbnMgYW5kXG5cdCAqIGNsYWltcyB0aGUgcmVxdWVzdHMgdGFyZ2V0aW5nIGl0cyBvd24gd2ViIGNvbnRlbnRzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0UGVybWlzc2lvbjogRXZlbnQ8SUJyb3dzZXJTZXNzaW9uUGVybWlzc2lvblJlcXVlc3Q+O1xuXHQvKiogRmlyZXMgd2hlbiBhIGhhcmR3YXJlLWRldmljZSBjaG9vc2VyIG5lZWRzIFVJLCBhbmQgYWdhaW4gYXMgaXRzIGRldmljZSBsaXN0IGNoYW5nZXMuICovXG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdERldmljZTogRXZlbnQ8SUJyb3dzZXJTZXNzaW9uRGV2aWNlUmVxdWVzdD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPjtcblx0LyoqIEN1cnJlbnQgc25hcHNob3Qgb2YgYWxsIHJlY29yZGVkIGRlY2lzaW9ucywgbWlycm9yZWQgdG8gdGhlIHdvcmtiZW5jaC4gKi9cblx0c2VyaWFsaXplKCk6IElTZXJpYWxpemVkQnJvd3NlclBlcm1pc3Npb25zU25hcHNob3Q7XG5cdC8qKiBSZWNvcmQgcGVybWlzc2lvbiBkZWNpc2lvbnMgZm9yIGFuIG9yaWdpbiBhbmQgcGVyc2lzdCBpbW1lZGlhdGVseS4gKi9cblx0c2V0KG9yaWdpbjogc3RyaW5nLCBncmFudHM6IHJlYWRvbmx5IElQZXJtaXNzaW9uQ2F0ZWdvcnlTdGF0ZVtdKTogdm9pZDtcblx0LyoqIENsZWFyIGFsbCByZWNvcmRlZCBwZXJtaXNzaW9uIHN0YXRlIGZvciB0aGlzIHNlc3Npb24uICovXG5cdGNsZWFyKCk6IHZvaWQ7XG5cdC8qKiBGdW5uZWwgYSBwZXItd2ViQ29udGVudHMgQmx1ZXRvb3RoIGNob29zZXIgaW50byB0aGUgdW5pZmllZCBkZXZpY2UgZmxvdy4gKi9cblx0YmVnaW5CbHVldG9vdGhSZXF1ZXN0KHdlYkNvbnRlbnRzOiBFbGVjdHJvbi5XZWJDb250ZW50cywgZGV2aWNlczogRWxlY3Ryb24uQmx1ZXRvb3RoRGV2aWNlW10sIGNhbGxiYWNrOiAoZGV2aWNlSWQ6IHN0cmluZykgPT4gdm9pZCk6IHZvaWQ7XG5cdC8qKiBBbnN3ZXIgYSBkZXZpY2UgY2hvb3NlciB3aXRoIHRoZSBjaG9zZW4gaWQsIG9yIGBudWxsYCB0byBjYW5jZWwuICovXG5cdHJlc29sdmVEZXZpY2UocmVxdWVzdElkOiBzdHJpbmcsIGRldmljZUlkOiBzdHJpbmcgfCBudWxsKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIElQZW5kaW5nUmVxdWVzdCB7XG5cdHJlYWRvbmx5IG9yaWdpbjogc3RyaW5nO1xuXHRyZWFkb25seSBjYXRlZ29yeTogUGVybWlzc2lvbkNhdGVnb3J5O1xuXHRyZWFkb25seSBkZWZlcnJlZDogRGVmZXJyZWRQcm9taXNlPHZvaWQ+O1xufVxuXG4vKipcbiAqIFBlci17QGxpbmsgQnJvd3NlclNlc3Npb259IHBlcm1pc3Npb24gc3RhdGUuIE93bnMgdGhlIGF1dGhvcml0YXRpdmVcbiAqIHtAbGluayBCcm93c2VyUGVybWlzc2lvblN0b3JlfSwgaW5zdGFsbHMgdGhlIEVsZWN0cm9uIHBlcm1pc3Npb24gaGFuZGxlcnMgdGhhdFxuICogY29uc3VsdCBpdCwgYW5kIGJyb2tlcnMgcHJvbXB0cyBmb3IgY2F0ZWdvcmllcyB0aGF0IGhhdmUgbm8gcmVjb3JkZWQgZGVjaXNpb24uXG4gKlxuICogRXZlcnkgY2hhbmdlIHRvIHRoZSBzdG9yZSBpcyBmbHVzaGVkIHRvIGFwcGxpY2F0aW9uIHN0b3JhZ2UgaW1tZWRpYXRlbHkgc29cbiAqIGRlY2lzaW9ucyBzdXJ2aXZlIGEgY3Jhc2ggcmlnaHQgYWZ0ZXIgdGhleSBhcmUgbWFkZS5cbiAqL1xuZXhwb3J0IGNsYXNzIEJyb3dzZXJTZXNzaW9uUGVybWlzc2lvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUJyb3dzZXJTZXNzaW9uUGVybWlzc2lvbnMge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Blcm1pc3Npb25TdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCcm93c2VyUGVybWlzc2lvblN0b3JlKCkpO1xuXG5cdC8qKiBGaXJlcyBvbiBhbnkgY2hhbmdlIHRvIHRoZSBzdG9yZSAoc2V0LCBjbGVhciwgaHlkcmF0ZSkuICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPiA9IHRoaXMuX3Blcm1pc3Npb25TdG9yZS5vbkRpZENoYW5nZTtcblxuXHRwcml2YXRlIF9zdG9yYWdlOiBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3BlcnNpc3RhYmxlID0gZmFsc2U7XG5cblx0LyoqIFdoaWxlIHNldCwgc3RvcmUgY2hhbmdlcyBhcmUgY29hbGVzY2VkIGludG8gYSBzaW5nbGUgZGVmZXJyZWQgZmx1c2guICovXG5cdHByaXZhdGUgX2JhdGNoaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX2JhdGNoRGlydHkgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RQZXJtaXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyb3dzZXJTZXNzaW9uUGVybWlzc2lvblJlcXVlc3Q+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RQZXJtaXNzaW9uID0gdGhpcy5fb25EaWRSZXF1ZXN0UGVybWlzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3REZXZpY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlclNlc3Npb25EZXZpY2VSZXF1ZXN0PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0RGV2aWNlID0gdGhpcy5fb25EaWRSZXF1ZXN0RGV2aWNlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmcgPSBuZXcgU2V0PElQZW5kaW5nUmVxdWVzdD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0RldmljZXMgPSBuZXcgTWFwPHN0cmluZywgSVBlbmRpbmdEZXZpY2VSZXF1ZXN0PigpO1xuXG5cdHJlYWRvbmx5IHN0b3JhZ2VLZXlzOiBJQnJvd3NlclZpZXdTdG9yYWdlS2V5cztcblxuXHRjb25zdHJ1Y3RvcihzZXNzaW9uOiBCcm93c2VyU2Vzc2lvbikge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnN0b3JhZ2VLZXlzID0gc2Vzc2lvbi5zdG9yYWdlU2NvcGUgPT09IEJyb3dzZXJWaWV3U3RvcmFnZVNjb3BlLkVwaGVtZXJhbFxuXHRcdFx0PyB7fVxuXHRcdFx0OiB7IHBlcm1pc3Npb25zOiBgYnJvd3Nlci5wZXJtaXNzaW9ucy4ke3Nlc3Npb24uaWR9YCB9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcGVybWlzc2lvblN0b3JlLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3Jlc29sdmVQZW5kaW5nKCk7XG5cdFx0XHQvLyBEdXJpbmcgYSBiYXRjaGVkIGBzZXQoKWAgZGVmZXIgdGhlIHdyaXRlIHNvIHNldmVyYWwgY2F0ZWdvcnlcblx0XHRcdC8vIGNoYW5nZXMgY29sbGFwc2UgaW50byBhIHNpbmdsZSBzdG9yYWdlIGZsdXNoLlxuXHRcdFx0aWYgKHRoaXMuX2JhdGNoaW5nKSB7XG5cdFx0XHRcdHRoaXMuX2JhdGNoRGlydHkgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fcGVyc2lzdGFibGUpIHtcblx0XHRcdFx0dGhpcy5fZmx1c2hOb3coKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBwZW5kaW5nIG9mIHRoaXMuX3BlbmRpbmcpIHtcblx0XHRcdFx0cGVuZGluZy5kZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcGVuZGluZy5jbGVhcigpO1xuXHRcdFx0Ly8gQ2FuY2VsIGFueSBpbi1mbGlnaHQgZGV2aWNlIGNob29zZXJzIHNvIHBhZ2VzIGFyZW4ndCBsZWZ0IGhhbmdpbmcuXG5cdFx0XHRmb3IgKGNvbnN0IGRldmljZSBvZiBbLi4udGhpcy5fcGVuZGluZ0RldmljZXMudmFsdWVzKCldKSB7XG5cdFx0XHRcdGRldmljZS5zZXR0bGUobnVsbCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEluc3RhbGwgdGhlIHBlcm1pc3Npb24gcmVxdWVzdCAvIGNoZWNrIC8gZGV2aWNlIGhhbmRsZXJzIG9uIHRoZSBzZXNzaW9uLlxuXHQgKiBCYWNrZWQgZW50aXJlbHkgYnkge0BsaW5rIEJyb3dzZXJQZXJtaXNzaW9uU3RvcmV9OyB1bnJlY29yZGVkIGNhdGVnb3JpZXNcblx0ICogYXJlIGJyb2tlcmVkIHRvIHRoZSBvd25pbmcgYnJvd3NlciB2aWV3IHZpYSB7QGxpbmsgb25EaWRSZXF1ZXN0UGVybWlzc2lvbn0uXG5cdCAqL1xuXHRjb25maWd1cmUoZWxlY3Ryb25TZXNzaW9uOiBFbGVjdHJvbi5TZXNzaW9uKTogdm9pZCB7XG5cdFx0ZWxlY3Ryb25TZXNzaW9uLnNldFBlcm1pc3Npb25SZXF1ZXN0SGFuZGxlcigod2ViQ29udGVudHMsIHBlcm1pc3Npb24sIGNhbGxiYWNrLCBkZXRhaWxzKSA9PiB7XG5cdFx0XHR0aGlzLl9yZXNvbHZlUmVxdWVzdCh3ZWJDb250ZW50cywgcGVybWlzc2lvbiwgZGV0YWlscykudGhlbihjYWxsYmFjaywgKCkgPT4gY2FsbGJhY2soZmFsc2UpKTtcblx0XHR9KTtcblx0XHRlbGVjdHJvblNlc3Npb24uc2V0UGVybWlzc2lvbkNoZWNrSGFuZGxlcigoX3dlYkNvbnRlbnRzLCBwZXJtaXNzaW9uLCByZXF1ZXN0aW5nT3JpZ2luLCBkZXRhaWxzKSA9PiB7XG5cdFx0XHRpZiAoaXNBbHdheXNBbGxvd2VkUGVybWlzc2lvbihwZXJtaXNzaW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdC8vIFByZWZlciB0aGUgZnVsbCByZXF1ZXN0aW5nIFVSTCBzbyBmaWxlOiBkb2N1bWVudHMga2V5IG9mZiB0aGVpclxuXHRcdFx0Ly8gcGF0aDsgYHJlcXVlc3RpbmdVcmxgIGlzIGFic2VudCBmb3IgY3Jvc3Mtb3JpZ2luIHN1YmZyYW1lcywgaW5cblx0XHRcdC8vIHdoaWNoIGNhc2UgRWxlY3Ryb24gb25seSBnaXZlcyB1cyB0aGUgYmFyZSBvcmlnaW4uXG5cdFx0XHRjb25zdCBvcmlnaW4gPSB0b09yaWdpbktleShkZXRhaWxzLnJlcXVlc3RpbmdVcmwgfHwgcmVxdWVzdGluZ09yaWdpbik7XG5cdFx0XHRjb25zdCBjYXRlZ29yaWVzID0gZWxlY3Ryb25QZXJtaXNzaW9uVG9DYXRlZ29yaWVzKHBlcm1pc3Npb24sIG1lZGlhS2luZHNGcm9tRGV0YWlscyhkZXRhaWxzKSk7XG5cdFx0XHRpZiAoY2F0ZWdvcmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU3luY2hyb25vdXMgZ2F0ZSB1c2VkIGJ5IEJsaW5rIHByZS1jaGVja3MgYW5kIGBwZXJtaXNzaW9ucy5xdWVyeWAuXG5cdFx0XHQvLyBDYXRlZ29yaWVzIHdpdGggbm8gcmVjb3JkZWQgZGVjaXNpb24gZmFsbCBiYWNrIHRvIHRoZWlyXG5cdFx0XHQvLyBgZGVmYXVsdFN0YXRlYCAoZS5nLiBMb2NhdGlvbiAvIENhbWVyYSBhcmUgZGVueS1ieS1kZWZhdWx0IHVudGlsXG5cdFx0XHQvLyBncmFudGVkLCB3aGlsZSBvdGhlcnMgbWF5IGFsbG93IGJ5IGRlZmF1bHQpLlxuXHRcdFx0cmV0dXJuIGNhdGVnb3JpZXMuZXZlcnkoY2F0ZWdvcnkgPT4gdGhpcy5fcGVybWlzc2lvblN0b3JlLmlzQWxsb3dlZChvcmlnaW4sIGNhdGVnb3J5KSk7XG5cdFx0fSk7XG5cblx0XHQvLyBIYXJkd2FyZS1kZXZpY2UgY2hvb3NlcnMuIFVTQiAvIFNlcmlhbCAvIEhJRCBhcmUgZ2F0ZWQgYnkgdGhlIGhhbmRsZXJzXG5cdFx0Ly8gYWJvdmUgKGEgYERldmljZXNgIGRlbnkgbWFrZXMgdGhlIGNoZWNrIGZhaWwsIHNvIENocm9taXVtIG5ldmVyIGZpcmVzXG5cdFx0Ly8gdGhlc2UpLiBXZSBzdGlsbCByZS1jaGVjayBoZXJlLCBkcml2ZSBzZWxlY3Rpb24gdGhyb3VnaCB0aGUgdW5pZmllZFxuXHRcdC8vIGRldmljZS1yZXF1ZXN0IGZsb3csIGFuZCBsaXN0ZW4gZm9yIGhvdC1wbHVnIGFkZC9yZW1vdmUgZXZlbnRzIHNvIGFuXG5cdFx0Ly8gb3BlbiBwaWNrZXIgc3RheXMgaW4gc3luYy4gQmx1ZXRvb3RoIGlzIGdhdGVkIGFuZCBmdW5uZWxlZCBzZXBhcmF0ZWx5XG5cdFx0Ly8gZnJvbSB0aGUgb3duaW5nIHZpZXcgKGl0IGlzIGEgcGVyLXdlYkNvbnRlbnRzIGV2ZW50KS5cblx0XHRlbGVjdHJvblNlc3Npb24ub24oJ3NlbGVjdC11c2ItZGV2aWNlJywgKGV2ZW50LCBkZXRhaWxzLCBjYWxsYmFjaykgPT4ge1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX2ZyYW1lVGFyZ2V0KGRldGFpbHMuZnJhbWUpO1xuXHRcdFx0aWYgKCF0YXJnZXQgfHwgIXRoaXMuX2RldmljZUFsbG93ZWQodGFyZ2V0Lm9yaWdpbikpIHtcblx0XHRcdFx0Y2FsbGJhY2soKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYmVnaW5EZXZpY2VSZXF1ZXN0KHtcblx0XHRcdFx0d2ViQ29udGVudHM6IHRhcmdldC53ZWJDb250ZW50cyxcblx0XHRcdFx0b3JpZ2luOiB0YXJnZXQub3JpZ2luLFxuXHRcdFx0XHRkZXZpY2VUeXBlOiAndXNiJyxcblx0XHRcdFx0ZGV2aWNlczogZGV0YWlscy5kZXZpY2VMaXN0Lm1hcCh1c2JDYW5kaWRhdGUpLFxuXHRcdFx0XHRpbnZva2U6IGRldmljZUlkID0+IGRldmljZUlkID09PSBudWxsID8gY2FsbGJhY2soKSA6IGNhbGxiYWNrKGRldmljZUlkKSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdGVsZWN0cm9uU2Vzc2lvbi5vbigndXNiLWRldmljZS1hZGRlZCcsIChfZXZlbnQsIGRldmljZSwgd2ViQ29udGVudHMpID0+IHtcblx0XHRcdHRoaXMuX2FkZERldmljZSh3ZWJDb250ZW50cywgJ3VzYicsIHVzYkNhbmRpZGF0ZShkZXZpY2UpKTtcblx0XHR9KTtcblx0XHRlbGVjdHJvblNlc3Npb24ub24oJ3VzYi1kZXZpY2UtcmVtb3ZlZCcsIChfZXZlbnQsIGRldmljZSwgd2ViQ29udGVudHMpID0+IHtcblx0XHRcdHRoaXMuX3JlbW92ZURldmljZSh3ZWJDb250ZW50cywgJ3VzYicsIGRldmljZS5kZXZpY2VJZCk7XG5cdFx0fSk7XG5cblx0XHRlbGVjdHJvblNlc3Npb24ub24oJ3NlbGVjdC1zZXJpYWwtcG9ydCcsIChldmVudCwgcG9ydExpc3QsIHdlYkNvbnRlbnRzLCBjYWxsYmFjaykgPT4ge1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGNvbnN0IG9yaWdpbiA9IHRvT3JpZ2luS2V5KHdlYkNvbnRlbnRzLmdldFVSTCgpKTtcblx0XHRcdGlmICghdGhpcy5fZGV2aWNlQWxsb3dlZChvcmlnaW4pKSB7XG5cdFx0XHRcdGNhbGxiYWNrKCcnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYmVnaW5EZXZpY2VSZXF1ZXN0KHtcblx0XHRcdFx0d2ViQ29udGVudHMsXG5cdFx0XHRcdG9yaWdpbixcblx0XHRcdFx0ZGV2aWNlVHlwZTogJ3NlcmlhbCcsXG5cdFx0XHRcdGRldmljZXM6IHBvcnRMaXN0Lm1hcChzZXJpYWxDYW5kaWRhdGUpLFxuXHRcdFx0XHRpbnZva2U6IGRldmljZUlkID0+IGNhbGxiYWNrKGRldmljZUlkID8/ICcnKSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdGVsZWN0cm9uU2Vzc2lvbi5vbignc2VyaWFsLXBvcnQtYWRkZWQnLCAoX2V2ZW50LCBwb3J0LCB3ZWJDb250ZW50cykgPT4ge1xuXHRcdFx0dGhpcy5fYWRkRGV2aWNlKHdlYkNvbnRlbnRzLCAnc2VyaWFsJywgc2VyaWFsQ2FuZGlkYXRlKHBvcnQpKTtcblx0XHR9KTtcblx0XHRlbGVjdHJvblNlc3Npb24ub24oJ3NlcmlhbC1wb3J0LXJlbW92ZWQnLCAoX2V2ZW50LCBwb3J0LCB3ZWJDb250ZW50cykgPT4ge1xuXHRcdFx0dGhpcy5fcmVtb3ZlRGV2aWNlKHdlYkNvbnRlbnRzLCAnc2VyaWFsJywgcG9ydC5wb3J0SWQpO1xuXHRcdH0pO1xuXG5cdFx0ZWxlY3Ryb25TZXNzaW9uLm9uKCdzZWxlY3QtaGlkLWRldmljZScsIChldmVudCwgZGV0YWlscywgY2FsbGJhY2spID0+IHtcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9mcmFtZVRhcmdldChkZXRhaWxzLmZyYW1lKTtcblx0XHRcdGlmICghdGFyZ2V0IHx8ICF0aGlzLl9kZXZpY2VBbGxvd2VkKHRhcmdldC5vcmlnaW4pKSB7XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9iZWdpbkRldmljZVJlcXVlc3Qoe1xuXHRcdFx0XHR3ZWJDb250ZW50czogdGFyZ2V0LndlYkNvbnRlbnRzLFxuXHRcdFx0XHRvcmlnaW46IHRhcmdldC5vcmlnaW4sXG5cdFx0XHRcdGRldmljZVR5cGU6ICdoaWQnLFxuXHRcdFx0XHRkZXZpY2VzOiBkZXRhaWxzLmRldmljZUxpc3QubWFwKGhpZENhbmRpZGF0ZSksXG5cdFx0XHRcdGludm9rZTogZGV2aWNlSWQgPT4gY2FsbGJhY2soZGV2aWNlSWQgPz8gbnVsbCksXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRlbGVjdHJvblNlc3Npb24ub24oJ2hpZC1kZXZpY2UtYWRkZWQnLCAoX2V2ZW50LCBkZXRhaWxzKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9mcmFtZVRhcmdldChkZXRhaWxzLmZyYW1lKTtcblx0XHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdFx0dGhpcy5fYWRkRGV2aWNlKHRhcmdldC53ZWJDb250ZW50cywgJ2hpZCcsIGhpZENhbmRpZGF0ZShkZXRhaWxzLmRldmljZSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGVsZWN0cm9uU2Vzc2lvbi5vbignaGlkLWRldmljZS1yZW1vdmVkJywgKF9ldmVudCwgZGV0YWlscykgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fZnJhbWVUYXJnZXQoZGV0YWlscy5mcmFtZSk7XG5cdFx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRcdHRoaXMuX3JlbW92ZURldmljZSh0YXJnZXQud2ViQ29udGVudHMsICdoaWQnLCBkZXRhaWxzLmRldmljZS5kZXZpY2VJZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRjb25uZWN0U3RvcmFnZShzdG9yYWdlOiBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmFnZSB8fCAhdGhpcy5zdG9yYWdlS2V5cy5wZXJtaXNzaW9ucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdG9yYWdlID0gc3RvcmFnZTtcblx0XHR0aGlzLl9sb2FkKCk7XG5cdFx0dGhpcy5fcGVyc2lzdGFibGUgPSB0cnVlO1xuXHR9XG5cblx0c2VyaWFsaXplKCk6IElTZXJpYWxpemVkQnJvd3NlclBlcm1pc3Npb25zU25hcHNob3Qge1xuXHRcdHJldHVybiB0aGlzLl9wZXJtaXNzaW9uU3RvcmUuc2VyaWFsaXplKCk7XG5cdH1cblxuXHRzZXQob3JpZ2luOiBzdHJpbmcsIGdyYW50czogcmVhZG9ubHkgSVBlcm1pc3Npb25DYXRlZ29yeVN0YXRlW10pOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSB0b09yaWdpbktleShvcmlnaW4pO1xuXHRcdGZvciAoY29uc3QgZ3JhbnQgb2YgZ3JhbnRzKSB7XG5cdFx0XHRpZiAoZ3JhbnQuc3RhdGUgPT09IG51bGwpIHtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZVBlbmRpbmdGb3JDYXRlZ29yeShrZXksIGdyYW50LmNhdGVnb3J5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDb2FsZXNjZSB0aGUgcGVyLWNhdGVnb3J5IG9uRGlkQ2hhbmdlIGZsdXNoZXMgaW50byBhIHNpbmdsZSB3cml0ZSBmb3Jcblx0XHQvLyB0aGUgd2hvbGUgYmF0Y2ggc28gcGVyc2lzdGluZyBmcm9tIHRoZSBtYW5hZ2VtZW50IFVJIGlzbid0IE4gd3JpdGVzLlxuXHRcdHRoaXMuX2JhdGNoaW5nID0gdHJ1ZTtcblx0XHR0aGlzLl9iYXRjaERpcnR5ID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX3Blcm1pc3Npb25TdG9yZS5zZXRNYW55KG9yaWdpbiwgZ3JhbnRzKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fYmF0Y2hpbmcgPSBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2JhdGNoRGlydHkgJiYgdGhpcy5fcGVyc2lzdGFibGUpIHtcblx0XHRcdHRoaXMuX2ZsdXNoTm93KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVBlbmRpbmdGb3JDYXRlZ29yeShvcmlnaW46IHN0cmluZywgY2F0ZWdvcnk6IFBlcm1pc3Npb25DYXRlZ29yeSk6IHZvaWQge1xuXHRcdGlmICghb3JpZ2luIHx8IHRoaXMuX3BlbmRpbmcuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHBlbmRpbmcgb2YgWy4uLnRoaXMuX3BlbmRpbmddKSB7XG5cdFx0XHRpZiAocGVuZGluZy5vcmlnaW4gPT09IG9yaWdpbiAmJiBwZW5kaW5nLmNhdGVnb3J5ID09PSBjYXRlZ29yeSkge1xuXHRcdFx0XHRwZW5kaW5nLmRlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVybWlzc2lvblN0b3JlLmNsZWFyKCk7XG5cdH1cblxuXHQvLyAtLSBEZXZpY2UgY2hvb3NlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGJlZ2luQmx1ZXRvb3RoUmVxdWVzdCh3ZWJDb250ZW50czogRWxlY3Ryb24uV2ViQ29udGVudHMsIGRldmljZXM6IEVsZWN0cm9uLkJsdWV0b290aERldmljZVtdLCBjYWxsYmFjazogKGRldmljZUlkOiBzdHJpbmcpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBvcmlnaW4gPSB0b09yaWdpbktleSh3ZWJDb250ZW50cy5nZXRVUkwoKSk7XG5cdFx0aWYgKCF0aGlzLl9kZXZpY2VBbGxvd2VkKG9yaWdpbikpIHtcblx0XHRcdGNhbGxiYWNrKCcnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IGRldmljZXMubWFwKGJsdWV0b290aENhbmRpZGF0ZSk7XG5cdFx0Ly8gRWxlY3Ryb24gcmUtZmlyZXMgYHNlbGVjdC1ibHVldG9vdGgtZGV2aWNlYCBmb3IgdGhlIHNhbWUgY2hvb3NlciBhc1xuXHRcdC8vIGRldmljZXMgYXJlIGRpc2NvdmVyZWQsIGVhY2ggdGltZSB3aXRoIGEgZnJlc2ggY2FsbGJhY2suIEZvbGQgdGhvc2Vcblx0XHQvLyBpbnRvIHRoZSBleGlzdGluZyByZXF1ZXN0OiByZWZyZXNoIGl0cyBsaXN0IGFuZCBzdXBlcnNlZGUgdGhlIGNhbGxiYWNrLlxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fZmluZEFjdGl2ZURldmljZSh3ZWJDb250ZW50cywgJ2JsdWV0b290aCcpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0ZXhpc3RpbmcuZGV2aWNlcyA9IGNhbmRpZGF0ZXM7XG5cdFx0XHRleGlzdGluZy5pbnZva2UgPSBkZXZpY2VJZCA9PiBjYWxsYmFjayhkZXZpY2VJZCA/PyAnJyk7XG5cdFx0XHR0aGlzLl9lbWl0RGV2aWNlUmVxdWVzdChleGlzdGluZyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2JlZ2luRGV2aWNlUmVxdWVzdCh7XG5cdFx0XHR3ZWJDb250ZW50cyxcblx0XHRcdG9yaWdpbixcblx0XHRcdGRldmljZVR5cGU6ICdibHVldG9vdGgnLFxuXHRcdFx0ZGV2aWNlczogY2FuZGlkYXRlcyxcblx0XHRcdGludm9rZTogZGV2aWNlSWQgPT4gY2FsbGJhY2soZGV2aWNlSWQgPz8gJycpLFxuXHRcdH0pO1xuXHR9XG5cblx0cmVzb2x2ZURldmljZShyZXF1ZXN0SWQ6IHN0cmluZywgZGV2aWNlSWQ6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nRGV2aWNlcy5nZXQocmVxdWVzdElkKT8uc2V0dGxlKGRldmljZUlkKTtcblx0fVxuXG5cdC8qKiBCZWdpbiBhIGRldmljZSBjaG9vc2VyOiByZWdpc3RlciBpdCwgZW1pdCBpdCwgYW5kIGNhbmNlbCBpZiB1bmNsYWltZWQuICovXG5cdHByaXZhdGUgX2JlZ2luRGV2aWNlUmVxdWVzdChwYXJhbXM6IHtcblx0XHRyZWFkb25seSB3ZWJDb250ZW50czogRWxlY3Ryb24uV2ViQ29udGVudHM7XG5cdFx0cmVhZG9ubHkgb3JpZ2luOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZGV2aWNlVHlwZTogQnJvd3NlckRldmljZVR5cGU7XG5cdFx0cmVhZG9ubHkgZGV2aWNlczogSUJyb3dzZXJEZXZpY2VDYW5kaWRhdGVbXTtcblx0XHRyZWFkb25seSBpbnZva2U6IChkZXZpY2VJZDogc3RyaW5nIHwgbnVsbCkgPT4gdm9pZDtcblx0fSk6IHZvaWQge1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHNldHRsZSA9IChkZXZpY2VJZDogc3RyaW5nIHwgbnVsbCkgPT4ge1xuXHRcdFx0aWYgKHBlbmRpbmcuc2V0dGxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRwZW5kaW5nLnNldHRsZWQgPSB0cnVlO1xuXHRcdFx0cGFyYW1zLndlYkNvbnRlbnRzLm9mZignZGVzdHJveWVkJywgY2FuY2VsKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdEZXZpY2VzLmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdFx0cGVuZGluZy5pbnZva2UoZGV2aWNlSWQpO1xuXHRcdH07XG5cdFx0Y29uc3QgY2FuY2VsID0gKCkgPT4gc2V0dGxlKG51bGwpO1xuXHRcdGNvbnN0IHBlbmRpbmc6IElQZW5kaW5nRGV2aWNlUmVxdWVzdCA9IHtcblx0XHRcdHJlcXVlc3RJZCxcblx0XHRcdHdlYkNvbnRlbnRzOiBwYXJhbXMud2ViQ29udGVudHMsXG5cdFx0XHRvcmlnaW46IHBhcmFtcy5vcmlnaW4sXG5cdFx0XHRkZXZpY2VUeXBlOiBwYXJhbXMuZGV2aWNlVHlwZSxcblx0XHRcdGRldmljZXM6IHBhcmFtcy5kZXZpY2VzLFxuXHRcdFx0c2V0dGxlZDogZmFsc2UsXG5cdFx0XHRpbnZva2U6IHBhcmFtcy5pbnZva2UsXG5cdFx0XHRzZXR0bGUsXG5cdFx0fTtcblx0XHRwYXJhbXMud2ViQ29udGVudHMub24oJ2Rlc3Ryb3llZCcsIGNhbmNlbCk7XG5cdFx0dGhpcy5fcGVuZGluZ0RldmljZXMuc2V0KHJlcXVlc3RJZCwgcGVuZGluZyk7XG5cdFx0aWYgKCF0aGlzLl9lbWl0RGV2aWNlUmVxdWVzdChwZW5kaW5nKSkge1xuXHRcdFx0Ly8gTm8gdmlldyBjbGFpbWVkIGl0IChlLmcuIGJhY2tncm91bmQgb3IgZGVzdHJveWVkIHZpZXcpOiBjYW5jZWwgc29cblx0XHRcdC8vIHRoZSBwYWdlJ3MgcmVxdWVzdERldmljZSgpIHByb21pc2UgcmVqZWN0cyByYXRoZXIgdGhhbiBoYW5ncy5cblx0XHRcdGNhbmNlbCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2VtaXREZXZpY2VSZXF1ZXN0KHBlbmRpbmc6IElQZW5kaW5nRGV2aWNlUmVxdWVzdCk6IGJvb2xlYW4ge1xuXHRcdGxldCBjbGFpbWVkID0gZmFsc2U7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0RGV2aWNlLmZpcmUoe1xuXHRcdFx0d2ViQ29udGVudHM6IHBlbmRpbmcud2ViQ29udGVudHMsXG5cdFx0XHRvcmlnaW46IHBlbmRpbmcub3JpZ2luLFxuXHRcdFx0cmVxdWVzdElkOiBwZW5kaW5nLnJlcXVlc3RJZCxcblx0XHRcdGRldmljZVR5cGU6IHBlbmRpbmcuZGV2aWNlVHlwZSxcblx0XHRcdGRldmljZXM6IHBlbmRpbmcuZGV2aWNlcyxcblx0XHRcdGNsYWltOiAoKSA9PiB7IGNsYWltZWQgPSB0cnVlOyB9LFxuXHRcdH0pO1xuXHRcdHJldHVybiBjbGFpbWVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkRGV2aWNlKHdlYkNvbnRlbnRzOiBFbGVjdHJvbi5XZWJDb250ZW50cywgZGV2aWNlVHlwZTogQnJvd3NlckRldmljZVR5cGUsIGNhbmRpZGF0ZTogSUJyb3dzZXJEZXZpY2VDYW5kaWRhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fZmluZEFjdGl2ZURldmljZSh3ZWJDb250ZW50cywgZGV2aWNlVHlwZSk7XG5cdFx0aWYgKCFwZW5kaW5nIHx8IHBlbmRpbmcuZGV2aWNlcy5zb21lKGRldmljZSA9PiBkZXZpY2UuZGV2aWNlSWQgPT09IGNhbmRpZGF0ZS5kZXZpY2VJZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cGVuZGluZy5kZXZpY2VzID0gWy4uLnBlbmRpbmcuZGV2aWNlcywgY2FuZGlkYXRlXTtcblx0XHR0aGlzLl9lbWl0RGV2aWNlUmVxdWVzdChwZW5kaW5nKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZURldmljZSh3ZWJDb250ZW50czogRWxlY3Ryb24uV2ViQ29udGVudHMsIGRldmljZVR5cGU6IEJyb3dzZXJEZXZpY2VUeXBlLCBkZXZpY2VJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX2ZpbmRBY3RpdmVEZXZpY2Uod2ViQ29udGVudHMsIGRldmljZVR5cGUpO1xuXHRcdGlmICghcGVuZGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBuZXh0ID0gcGVuZGluZy5kZXZpY2VzLmZpbHRlcihkZXZpY2UgPT4gZGV2aWNlLmRldmljZUlkICE9PSBkZXZpY2VJZCk7XG5cdFx0aWYgKG5leHQubGVuZ3RoID09PSBwZW5kaW5nLmRldmljZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHBlbmRpbmcuZGV2aWNlcyA9IG5leHQ7XG5cdFx0dGhpcy5fZW1pdERldmljZVJlcXVlc3QocGVuZGluZyk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kQWN0aXZlRGV2aWNlKHdlYkNvbnRlbnRzOiBFbGVjdHJvbi5XZWJDb250ZW50cywgZGV2aWNlVHlwZTogQnJvd3NlckRldmljZVR5cGUpOiBJUGVuZGluZ0RldmljZVJlcXVlc3QgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgcGVuZGluZyBvZiB0aGlzLl9wZW5kaW5nRGV2aWNlcy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKCFwZW5kaW5nLnNldHRsZWQgJiYgcGVuZGluZy53ZWJDb250ZW50cyA9PT0gd2ViQ29udGVudHMgJiYgcGVuZGluZy5kZXZpY2VUeXBlID09PSBkZXZpY2VUeXBlKSB7XG5cdFx0XHRcdHJldHVybiBwZW5kaW5nO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqIFJlc29sdmUgdGhlIG93bmluZyB3ZWIgY29udGVudHMgYW5kIG9yaWdpbiBmb3IgYSByZXF1ZXN0aW5nIGZyYW1lLiAqL1xuXHRwcml2YXRlIF9mcmFtZVRhcmdldChmcmFtZTogRWxlY3Ryb24uV2ViRnJhbWVNYWluIHwgbnVsbCk6IHsgd2ViQ29udGVudHM6IEVsZWN0cm9uLldlYkNvbnRlbnRzOyBvcmlnaW46IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWZyYW1lKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB3ZWJDb250ZW50cyA9IGVsZWN0cm9uV2ViQ29udGVudHMuZnJvbUZyYW1lKGZyYW1lKTtcblx0XHRpZiAoIXdlYkNvbnRlbnRzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyB3ZWJDb250ZW50cywgb3JpZ2luOiB0b09yaWdpbktleShmcmFtZS51cmwgfHwgd2ViQ29udGVudHMuZ2V0VVJMKCkpIH07XG5cdH1cblxuXHRwcml2YXRlIF9kZXZpY2VBbGxvd2VkKG9yaWdpbjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhb3JpZ2luICYmIHRoaXMuX3Blcm1pc3Npb25TdG9yZS5pc0FsbG93ZWQob3JpZ2luLCBQZXJtaXNzaW9uQ2F0ZWdvcnkuRGV2aWNlcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlUmVxdWVzdCh3ZWJDb250ZW50czogRWxlY3Ryb24uV2ViQ29udGVudHMgfCBudWxsLCBwZXJtaXNzaW9uOiBzdHJpbmcsIGRldGFpbHM6IFBlcm1pc3Npb25SZXF1ZXN0RGV0YWlscyB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChpc0Fsd2F5c0FsbG93ZWRQZXJtaXNzaW9uKHBlcm1pc3Npb24pKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3Qgb3JpZ2luID0gdG9PcmlnaW5LZXkoZGV0YWlscz8ucmVxdWVzdGluZ1VybCA/PyB3ZWJDb250ZW50cz8uZ2V0VVJMKCkpO1xuXHRcdGNvbnN0IGNhdGVnb3JpZXMgPSBlbGVjdHJvblBlcm1pc3Npb25Ub0NhdGVnb3JpZXMocGVybWlzc2lvbiwgbWVkaWFLaW5kc0Zyb21EZXRhaWxzKGRldGFpbHMpKTtcblx0XHRpZiAoY2F0ZWdvcmllcy5sZW5ndGggPT09IDAgfHwgIW9yaWdpbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIEZhc3QgcGF0aHMgdGhhdCBuZWVkIG5vIHByb21wdC4gQSBjYXRlZ29yeSB3aG9zZSBlZmZlY3RpdmUgZGVjaXNpb24gaXNcblx0XHQvLyBhbHJlYWR5ICdhbGxvdycgLS0gZWl0aGVyIGFuIGV4cGxpY2l0IHVzZXIgZ3JhbnQgb3IgYW4gYWxsb3ctYnktZGVmYXVsdFxuXHRcdC8vIGNhdGVnb3J5IC0tIGlzIGdyYW50ZWQgc2lsZW50bHkuIFRoaXMga2VlcHMgdGhlIGFzeW5jIHJlcXVlc3QgaGFuZGxlclxuXHRcdC8vIGNvbnNpc3RlbnQgd2l0aCB0aGUgc3luY2hyb25vdXMgY2hlY2sgaGFuZGxlciAoYm90aCB1c2UgYGlzQWxsb3dlZGApLlxuXHRcdC8vIEFuIGV4cGxpY2l0ICdkZW55JyBzaG9ydC1jaXJjdWl0cyB3aXRob3V0IHByb21wdGluZy5cblx0XHRpZiAoY2F0ZWdvcmllcy5ldmVyeShjYXRlZ29yeSA9PiB0aGlzLl9wZXJtaXNzaW9uU3RvcmUuaXNBbGxvd2VkKG9yaWdpbiwgY2F0ZWdvcnkpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChjYXRlZ29yaWVzLnNvbWUoY2F0ZWdvcnkgPT4gdGhpcy5fcGVybWlzc2lvblN0b3JlLmdldERlY2lzaW9uKG9yaWdpbiwgY2F0ZWdvcnkpID09PSAnZGVueScpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQXQgbGVhc3Qgb25lIGNhdGVnb3J5IGlzIHVuZGVjaWRlZDogcHJvbXB0IGZvciBlYWNoIHVuZGVjaWRlZCBvbmUuIERvXG5cdFx0Ly8gdGhpcyBzZXF1ZW50aWFsbHkgc28gd2UgbmV2ZXIgc3VyZmFjZSB0d28gbW9kYWwgcHJvbXB0cyBhdCBvbmNlIChlLmcuXG5cdFx0Ly8gYSBzaW5nbGUgYG1lZGlhYCByZXF1ZXN0IG1hcHMgdG8gYm90aCBDYW1lcmEgYW5kIE1pY3JvcGhvbmUpLlxuXHRcdGZvciAoY29uc3QgY2F0ZWdvcnkgb2YgY2F0ZWdvcmllcykge1xuXHRcdFx0aWYgKCF0aGlzLl9wZXJtaXNzaW9uU3RvcmUuZ2V0RGVjaXNpb24ob3JpZ2luLCBjYXRlZ29yeSkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcHJvbXB0KHdlYkNvbnRlbnRzLCBvcmlnaW4sIGNhdGVnb3J5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY2F0ZWdvcmllcy5ldmVyeShjYXRlZ29yeSA9PiB0aGlzLl9wZXJtaXNzaW9uU3RvcmUuaXNBbGxvd2VkKG9yaWdpbiwgY2F0ZWdvcnkpKTtcblx0fVxuXG5cdHByaXZhdGUgX3Byb21wdCh3ZWJDb250ZW50czogRWxlY3Ryb24uV2ViQ29udGVudHMgfCBudWxsLCBvcmlnaW46IHN0cmluZywgY2F0ZWdvcnk6IFBlcm1pc3Npb25DYXRlZ29yeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghd2ViQ29udGVudHMpIHtcblx0XHRcdC8vIE5vIHZpZXcgdG8gYXNrIC0tIGxlYXZlIHVuZGVjaWRlZCAoZWZmZWN0aXZlIGRlbnkgYnkgZGVmYXVsdCBzdGF0ZSkuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXHRcdC8vIEZpcmUgc3luY2hyb25vdXNseTogdGhlIG93bmluZyB2aWV3IGNsYWltcyB0aGUgcmVxdWVzdCBiZWZvcmUgZmlyZSgpXG5cdFx0Ly8gcmV0dXJucywgc28gd2Uga25vdyB3aGV0aGVyIGFueSBVSSB3aWxsIHN1cmZhY2UgYSBwcm9tcHQuXG5cdFx0bGV0IGNsYWltZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9vbkRpZFJlcXVlc3RQZXJtaXNzaW9uLmZpcmUoe1xuXHRcdFx0d2ViQ29udGVudHMsXG5cdFx0XHRyZXF1ZXN0OiB7IG9yaWdpbiwgY2F0ZWdvcnkgfSxcblx0XHRcdGNsYWltOiAoKSA9PiB7IGNsYWltZWQgPSB0cnVlOyB9LFxuXHRcdH0pO1xuXHRcdGlmICghY2xhaW1lZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlbmRpbmc6IElQZW5kaW5nUmVxdWVzdCA9IHsgb3JpZ2luLCBjYXRlZ29yeSwgZGVmZXJyZWQ6IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKSB9O1xuXHRcdHRoaXMuX3BlbmRpbmcuYWRkKHBlbmRpbmcpO1xuXG5cdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHBlbmRpbmcuZGVmZXJyZWQuY29tcGxldGUoKSwgUFJPTVBUX1RJTUVPVVRfTVMpO1xuXHRcdHJldHVybiBwZW5kaW5nLmRlZmVycmVkLnAuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0dGhpcy5fcGVuZGluZy5kZWxldGUocGVuZGluZyk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKiogUmVzb2x2ZSBhbnkgcGVuZGluZyByZXF1ZXN0IHdob3NlIChvcmlnaW4sIGNhdGVnb3J5KSBub3cgaGFzIGEgZGVjaXNpb24uICovXG5cdHByaXZhdGUgX3Jlc29sdmVQZW5kaW5nKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwZW5kaW5nIG9mIFsuLi50aGlzLl9wZW5kaW5nXSkge1xuXHRcdFx0aWYgKHRoaXMuX3Blcm1pc3Npb25TdG9yZS5nZXREZWNpc2lvbihwZW5kaW5nLm9yaWdpbiwgcGVuZGluZy5jYXRlZ29yeSkpIHtcblx0XHRcdFx0cGVuZGluZy5kZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xvYWQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRoaXMuX3N0b3JhZ2U7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5zdG9yYWdlS2V5cy5wZXJtaXNzaW9ucztcblx0XHRpZiAoIXN0b3JhZ2UgfHwgIWtleSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzbmFwc2hvdCA9IHBhcnNlU25hcHNob3Q8SVNlcmlhbGl6ZWRCcm93c2VyUGVybWlzc2lvbnNTbmFwc2hvdD4oc3RvcmFnZS5nZXQoa2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pKTtcblx0XHQvLyBIeWRyYXRpb24gZmlyZXMgb25EaWRDaGFuZ2U7IHN1cHByZXNzIGZsdXNoZXMgc28gd2UgZG9uJ3QgcmV3cml0ZSB3aGF0IHdlIGp1c3QgcmVhZC5cblx0XHR0aGlzLl9wZXJzaXN0YWJsZSA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9wZXJtaXNzaW9uU3RvcmUuaHlkcmF0ZShzbmFwc2hvdCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3BlcnNpc3RhYmxlID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9mbHVzaE5vdygpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGhpcy5fc3RvcmFnZTtcblx0XHRjb25zdCBrZXkgPSB0aGlzLnN0b3JhZ2VLZXlzLnBlcm1pc3Npb25zO1xuXHRcdGlmICghc3RvcmFnZSB8fCAha2V5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNuYXBzaG90ID0gdGhpcy5fcGVybWlzc2lvblN0b3JlLnNlcmlhbGl6ZSgpO1xuXHRcdGlmIChPYmplY3Qua2V5cyhzbmFwc2hvdC5vcmlnaW5zKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHN0b3JhZ2UucmVtb3ZlKGtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RvcmFnZS5zdG9yZShrZXksIEpTT04uc3RyaW5naWZ5KHNuYXBzaG90KSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBwYXJzZVNuYXBzaG90PFQ+KHJhdzogc3RyaW5nIHwgdW5kZWZpbmVkKTogVCB8IHVuZGVmaW5lZCB7XG5cdGlmICghcmF3KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHR0cnkge1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBUO1xuXHRcdGlmICghcGFyc2VkIHx8IHR5cGVvZiBwYXJzZWQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gcGFyc2VkO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogVGhlIEVsZWN0cm9uIGRldGFpbHMgdW5pb24gcGFzc2VkIHRvIGBzZXRQZXJtaXNzaW9uUmVxdWVzdEhhbmRsZXJgLiBBbGxcbiAqIHZhcmlhbnRzIGV4dGVuZCBgUGVybWlzc2lvblJlcXVlc3RgIChzbyBzaGFyZSBgcmVxdWVzdGluZ1VybGApOyBvbmx5XG4gKiBgTWVkaWFBY2Nlc3NQZXJtaXNzaW9uUmVxdWVzdGAgYWRkcyBgbWVkaWFUeXBlc2AuXG4gKi9cbnR5cGUgUGVybWlzc2lvblJlcXVlc3REZXRhaWxzID1cblx0fCBFbGVjdHJvbi5QZXJtaXNzaW9uUmVxdWVzdFxuXHR8IEVsZWN0cm9uLkZpbGVzeXN0ZW1QZXJtaXNzaW9uUmVxdWVzdFxuXHR8IEVsZWN0cm9uLk1lZGlhQWNjZXNzUGVybWlzc2lvblJlcXVlc3Rcblx0fCBFbGVjdHJvbi5PcGVuRXh0ZXJuYWxQZXJtaXNzaW9uUmVxdWVzdDtcblxuLyoqXG4gKiBOb3JtYWxpemUgdGhlIG1lZGlhIGhpbnQgZnJvbSBlaXRoZXIgcGVybWlzc2lvbiBoYW5kbGVyJ3MgRWxlY3Ryb24gZGV0YWlsc1xuICogaW50byBhIGAoJ3ZpZGVvJyB8ICdhdWRpbycpW11gLiBUaGUgcmVxdWVzdCBoYW5kbGVyIHN1cHBsaWVzIGBtZWRpYVR5cGVzYFxuICogKGFuIGFycmF5KTsgdGhlIGNoZWNrIGhhbmRsZXIgc3VwcGxpZXMgYSBzaW5nbGUgYG1lZGlhVHlwZWAuIFJldHVybnNcbiAqIGB1bmRlZmluZWRgIHdoZW4gdGhlcmUgaXMgbm8gdXNhYmxlIGhpbnQsIHNvIHRoZSBtYXBwZXIgY2FuIGFzc3VtZSBib3RoLlxuICovXG5mdW5jdGlvbiBtZWRpYUtpbmRzRnJvbURldGFpbHMoZGV0YWlsczogUGVybWlzc2lvblJlcXVlc3REZXRhaWxzIHwgRWxlY3Ryb24uUGVybWlzc2lvbkNoZWNrSGFuZGxlckhhbmRsZXJEZXRhaWxzIHwgdW5kZWZpbmVkKTogKCd2aWRlbycgfCAnYXVkaW8nKVtdIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFkZXRhaWxzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBraW5kcyA9IG5ldyBTZXQ8J3ZpZGVvJyB8ICdhdWRpbyc+KCk7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWluLW9wZXJhdG9yXG5cdGlmICgnbWVkaWFUeXBlcycgaW4gZGV0YWlscyAmJiBkZXRhaWxzLm1lZGlhVHlwZXMpIHtcblx0XHRmb3IgKGNvbnN0IGtpbmQgb2YgZGV0YWlscy5tZWRpYVR5cGVzKSB7XG5cdFx0XHRraW5kcy5hZGQoa2luZCk7XG5cdFx0fVxuXHR9XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWluLW9wZXJhdG9yXG5cdGlmICgnbWVkaWFUeXBlJyBpbiBkZXRhaWxzICYmIChkZXRhaWxzLm1lZGlhVHlwZSA9PT0gJ3ZpZGVvJyB8fCBkZXRhaWxzLm1lZGlhVHlwZSA9PT0gJ2F1ZGlvJykpIHtcblx0XHRraW5kcy5hZGQoZGV0YWlscy5tZWRpYVR5cGUpO1xuXHR9XG5cdHJldHVybiBraW5kcy5zaXplID8gWy4uLmtpbmRzXSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqIEZvcm1hdCBhIFVTQi9ISUQgdmVuZG9yOnByb2R1Y3QgcGFpciBhcyBhIGB2dnZ2OnBwcHBgIGhleCBzdHJpbmcuICovXG5mdW5jdGlvbiB2ZW5kb3JQcm9kdWN0SGV4KHZlbmRvcklkOiBudW1iZXIgfCB1bmRlZmluZWQsIHByb2R1Y3RJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0Y29uc3QgaGV4ID0gKHZhbHVlOiBudW1iZXIgfCB1bmRlZmluZWQpID0+ICh2YWx1ZSA/PyAwKS50b1N0cmluZygxNikucGFkU3RhcnQoNCwgJzAnKTtcblx0cmV0dXJuIGAke2hleCh2ZW5kb3JJZCl9OiR7aGV4KHByb2R1Y3RJZCl9YDtcbn1cblxuZnVuY3Rpb24gdXNiQ2FuZGlkYXRlKGRldmljZTogRWxlY3Ryb24uVVNCRGV2aWNlKTogSUJyb3dzZXJEZXZpY2VDYW5kaWRhdGUge1xuXHRjb25zdCBpZHMgPSB2ZW5kb3JQcm9kdWN0SGV4KGRldmljZS52ZW5kb3JJZCwgZGV2aWNlLnByb2R1Y3RJZCk7XG5cdHJldHVybiB7XG5cdFx0ZGV2aWNlSWQ6IGRldmljZS5kZXZpY2VJZCxcblx0XHRsYWJlbDogZGV2aWNlLnByb2R1Y3ROYW1lIHx8IGRldmljZS5tYW51ZmFjdHVyZXJOYW1lIHx8IGxvY2FsaXplKCdicm93c2VyLmRldmljZS51c2InLCBcIlVTQiBEZXZpY2UgezB9XCIsIGlkcyksXG5cdFx0ZGV0YWlsOiBkZXZpY2Uuc2VyaWFsTnVtYmVyID8gYCR7aWRzfSBcdTAwQjcgJHtkZXZpY2Uuc2VyaWFsTnVtYmVyfWAgOiBpZHMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHNlcmlhbENhbmRpZGF0ZShwb3J0OiBFbGVjdHJvbi5TZXJpYWxQb3J0KTogSUJyb3dzZXJEZXZpY2VDYW5kaWRhdGUge1xuXHRjb25zdCBpZHMgPSBwb3J0LnZlbmRvcklkICYmIHBvcnQucHJvZHVjdElkID8gYCR7cG9ydC52ZW5kb3JJZH06JHtwb3J0LnByb2R1Y3RJZH1gIDogdW5kZWZpbmVkO1xuXHRyZXR1cm4ge1xuXHRcdGRldmljZUlkOiBwb3J0LnBvcnRJZCxcblx0XHRsYWJlbDogYCR7cG9ydC5wb3J0TmFtZX0gKCR7cG9ydC5kaXNwbGF5TmFtZX0pYCxcblx0XHRkZXRhaWw6IGlkcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gaGlkQ2FuZGlkYXRlKGRldmljZTogRWxlY3Ryb24uSElERGV2aWNlKTogSUJyb3dzZXJEZXZpY2VDYW5kaWRhdGUge1xuXHRjb25zdCBpZHMgPSB2ZW5kb3JQcm9kdWN0SGV4KGRldmljZS52ZW5kb3JJZCwgZGV2aWNlLnByb2R1Y3RJZCk7XG5cdHJldHVybiB7XG5cdFx0ZGV2aWNlSWQ6IGRldmljZS5kZXZpY2VJZCxcblx0XHRsYWJlbDogZGV2aWNlLm5hbWUgfHwgbG9jYWxpemUoJ2Jyb3dzZXIuZGV2aWNlLmhpZCcsIFwiSElEIERldmljZSB7MH1cIiwgaWRzKSxcblx0XHRkZXRhaWw6IGRldmljZS5zZXJpYWxOdW1iZXIgPyBgJHtpZHN9IFx1MDBCNyAke2RldmljZS5zZXJpYWxOdW1iZXJ9YCA6IGlkcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gYmx1ZXRvb3RoQ2FuZGlkYXRlKGRldmljZTogRWxlY3Ryb24uQmx1ZXRvb3RoRGV2aWNlKTogSUJyb3dzZXJEZXZpY2VDYW5kaWRhdGUge1xuXHRyZXR1cm4ge1xuXHRcdGRldmljZUlkOiBkZXZpY2UuZGV2aWNlSWQsXG5cdFx0bGFiZWw6IGRldmljZS5kZXZpY2VOYW1lIHx8IGRldmljZS5kZXZpY2VJZCxcblx0XHRkZXRhaWw6IGRldmljZS5kZXZpY2VJZCxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQWUsMkJBQTJCO0FBQ25ELFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsY0FBYyxxQkFBcUI7QUFDNUM7QUFBQSxFQUVDO0FBQUEsRUFJQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFDUCxTQUFTLCtCQUE0RjtBQUlyRyxNQUFNLG9CQUFvQjtBQTRGbkIsTUFBTSxrQ0FBa0MsV0FBaUQ7QUFBQSxFQXlCL0YsWUFBWSxTQUF5QjtBQUNwQyxVQUFNO0FBeEJQLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSx1QkFBdUIsQ0FBQztBQUcvRTtBQUFBLFNBQVMsY0FBMkIsS0FBSyxpQkFBaUI7QUFHMUQsU0FBUSxlQUFlO0FBR3ZCO0FBQUEsU0FBUSxZQUFZO0FBQ3BCLFNBQVEsY0FBYztBQUV0QixTQUFpQiwwQkFBMEIsS0FBSyxVQUFVLElBQUksUUFBMEMsQ0FBQztBQUN6RyxTQUFTLHlCQUF5QixLQUFLLHdCQUF3QjtBQUUvRCxTQUFpQixzQkFBc0IsS0FBSyxVQUFVLElBQUksUUFBc0MsQ0FBQztBQUNq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
