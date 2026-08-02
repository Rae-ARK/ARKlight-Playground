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
import { Disposable } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import { ILogService } from "../../log/common/log.js";
let BrowserViewEmulator = class extends Disposable {
  constructor(browser, logService) {
    super();
    this.browser = browser;
    this.logService = logService;
    this._lastLayout = { containerWidth: 1024, containerHeight: 768, scale: 1, hostZoom: 1 };
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._defaultUserAgent = this.browser.webContents.getUserAgent();
    const onNavigate = () => {
      this._lastApplied = void 0;
      void this._reapply();
    };
    this.browser.webContents.on("did-navigate", onNavigate);
    this._register(this.browser.debugger.registerCommandInterceptor((method, params, session) => this._intercept(method, params, session)));
  }
  get device() {
    return this._device;
  }
  get emulatedScaleFactor() {
    if (!this._lastLayout) {
      return 1;
    }
    return this._lastLayout.scale * this._lastLayout.hostZoom;
  }
  async setDevice(device) {
    const prev = this._device;
    this._device = device;
    const nextUA = device?.userAgent;
    if (prev?.userAgent !== nextUA) {
      this.browser.webContents.setUserAgent(nextUA ?? this._defaultUserAgent);
    }
    if (prev && !device && this.isSafeToApplyEmulation()) {
      this.browser.webContents.disableDeviceEmulation();
      void this._applyTouchAndMedia();
    }
    this._lastApplied = void 0;
    if (device && this.isSafeToApplyEmulation()) {
      this._reapply();
    }
    this._onDidChange.fire(device);
  }
  /**
   * Update the cached layout (container size + scale + host zoom) and reapply
   * emulation. The emulated viewport is derived from the current device's
   * width / height; when those are undefined the viewport auto-fits to the
   * container at the given scale. `hostZoom` is the host window's
   * CSS-to-screen zoom factor — bounds in main are multiplied by it, so the
   * emulation scale must be too or the emulated viewport won't fill the
   * WebContentsView when the workbench is zoomed.
   */
  applyScreenEmulation(containerWidth, containerHeight, scale, hostZoom) {
    this._lastLayout = { containerWidth, containerHeight, scale, hostZoom };
    this._reapply();
  }
  _reapply() {
    if (!this._device || !this.isSafeToApplyEmulation()) {
      return;
    }
    const { containerWidth, containerHeight, scale, hostZoom } = this._lastLayout;
    const s = Math.max(0.01, scale);
    const z = Math.max(0.01, hostZoom);
    const w = Math.max(1, Math.round(this._device.width || containerWidth / s));
    const h = Math.max(1, Math.round(this._device.height || containerHeight / s));
    const mobile = !!this._device.mobile;
    const last = this._lastApplied;
    if (last && last.viewportWidth === w && last.viewportHeight === h && Math.abs(last.scale - s) < 1e-4 && Math.abs(last.hostZoom - z) < 1e-4 && last.mobile === mobile) {
      return;
    }
    this._lastApplied = { viewportWidth: w, viewportHeight: h, scale: s, hostZoom: z, mobile };
    const params = {
      screenPosition: mobile ? "mobile" : "desktop",
      screenSize: { width: w, height: h },
      viewSize: { width: w, height: h },
      deviceScaleFactor: this._device.deviceScaleFactor ?? 0,
      viewPosition: { x: 0, y: 0 },
      scale: s * z
    };
    if (mobile && !last) {
      this.browser.webContents.enableDeviceEmulation({
        ...params,
        screenPosition: "desktop"
      });
    }
    this.browser.webContents.enableDeviceEmulation(params);
    if (mobile !== last?.mobile) {
      void this._applyTouchAndMedia();
    }
  }
  isSafeToApplyEmulation() {
    return !this.browser.webContents.isDestroyed() && !!this.browser.webContents.getURL();
  }
  async _applyTouchAndMedia() {
    if (!this.isSafeToApplyEmulation()) {
      return;
    }
    const device = this._device;
    const mobile = !!this._device?.mobile;
    try {
      await this.browser.debugger.sendCommandRaw("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
      if (this.device !== device) {
        return;
      }
      await this.browser.debugger.sendCommandRaw("Emulation.setEmulatedMedia", { features: this._device ? [{ name: "pointer", value: mobile ? "coarse" : "fine" }] : [] });
      if (this.device !== device) {
        return;
      }
      await this.browser.debugger.sendCommandRaw("Emulation.setEmitTouchEventsForMouse", { enabled: mobile });
    } catch (err) {
      this.logService.error("[BrowserViewEmulator] _applyTouchAndMedia failed", err);
    }
  }
  /**
   * Intercept incoming CDP emulation commands and fold the ones that map onto
   * {@link IBrowserDeviceProfile} into the device. Anything we don't model
   * (geolocation, timezone, CPU throttling, locale, vision deficiency, …)
   * falls through to raw CDP. Only the root session is intercepted — worker
   * and iframe sub-sessions get pass-through behavior.
   */
  _intercept(method, params, session) {
    if (session && session.targetId !== this.browser.debugger.targetId) {
      return void 0;
    }
    switch (method) {
      case "Emulation.setDeviceMetricsOverride": {
        const p = params ?? {};
        const next = {
          ...this._device,
          // CDP uses 0 to disable the corresponding override.
          width: p.width || void 0,
          height: p.height || void 0,
          mobile: p.mobile ?? this._device?.mobile,
          deviceScaleFactor: p.deviceScaleFactor ?? this._device?.deviceScaleFactor
        };
        return this.setDevice(next).then(() => ({}));
      }
      case "Emulation.clearDeviceMetricsOverride": {
        if (!this._device) {
          return Promise.resolve({});
        }
        const { width, height, mobile, deviceScaleFactor, ...rest } = this._device;
        const hasRest = Object.values(rest).some((v) => v !== void 0);
        return this.setDevice(hasRest ? rest : void 0).then(() => ({}));
      }
      case "Emulation.setUserAgentOverride": {
        const p = params ?? {};
        if (p.acceptLanguage !== void 0 || p.platform !== void 0 || p.userAgentMetadata !== void 0) {
          return void 0;
        }
        const ua = p.userAgent || void 0;
        return this.setDevice({ ...this._device, userAgent: ua }).then(() => ({}));
      }
      case "Input.dispatchMouseEvent":
      case "Input.dispatchDragEvent":
      case "Input.synthesizeScrollGesture":
      case "Input.synthesizePinchGesture":
      case "Input.synthesizeTapGesture":
      case "Input.dispatchTouchEvent":
        this._scaleInputCoordinates(params);
        return void 0;
      // let the event pass through with the modified parameters
      default:
        return void 0;
    }
  }
  /**
   * Scale any coordinate-bearing fields on a CDP `Input.*` params object in
   * place so screen-space coordinates map onto the emulated viewport. Handles
   * point coordinates (`x` / `y`), mouse wheel deltas (`deltaX` / `deltaY`),
   * scroll distances (`xDistance` / `yDistance`) and touch points.
   */
  _scaleInputCoordinates(params) {
    const scale = this.emulatedScaleFactor;
    const p = params ?? {};
    if (p.x) {
      p.x *= scale;
    }
    if (p.y) {
      p.y *= scale;
    }
    if (p.deltaX) {
      p.deltaX *= scale;
    }
    if (p.deltaY) {
      p.deltaY *= scale;
    }
    if (p.xDistance) {
      p.xDistance *= scale;
    }
    if (p.yDistance) {
      p.yDistance *= scale;
    }
    if (Array.isArray(p.touchPoints)) {
      p.touchPoints = p.touchPoints.map((t) => ({
        ...t,
        x: t.x * scale,
        y: t.y * scale
      }));
    }
  }
};
BrowserViewEmulator = __decorateClass([
  __decorateParam(1, ILogService)
], BrowserViewEmulator);
export {
  BrowserViewEmulator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLW1haW4vYnJvd3NlclZpZXdFbXVsYXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlckRldmljZVByb2ZpbGUgfSBmcm9tICcuLi9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgdHlwZSB7IEJyb3dzZXJWaWV3IH0gZnJvbSAnLi9icm93c2VyVmlldy5qcyc7XG5pbXBvcnQgeyBJQ0RQQ29ubmVjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jZHAvdHlwZXMuanMnO1xuXG4vKipcbiAqIE1hbmFnZXMgZGV2aWNlIGVtdWxhdGlvbiBmb3IgYSBicm93c2VyIHZpZXcuIFRoZSByZW5kZXJlciBpcyBhdXRob3JpdGF0aXZlXG4gKiBmb3IgdGhlIG9uLXNjcmVlbiBjb250YWluZXIgc2l6ZSBhbmQgc2NhbGU7IHRoaXMgY2xhc3MgZGVyaXZlcyB0aGUgZW11bGF0ZWRcbiAqIHZpZXdwb3J0IGZyb20gdGhlIGN1cnJlbnQgZGV2aWNlIHByb2ZpbGUgKGZhbGxpbmcgYmFjayB0byBjb250YWluZXIgc2l6ZSAvXG4gKiBzY2FsZSB3aGVuIHdpZHRoL2hlaWdodCBhcmUgdW5zZXQpIGFuZCBmb3J3YXJkcyB2YWx1ZXMgdG9cbiAqIGB3ZWJDb250ZW50cy5lbmFibGVEZXZpY2VFbXVsYXRpb25gLiBJdCBhbHNvIG1hbmFnZXMgdGhlIHRvdWNoIC8gbWVkaWEgL1xuICogdXNlci1hZ2VudCBvdmVycmlkZXMgdGhhdCBoYXZlIG5vIG5hdGl2ZSBFbGVjdHJvbiBlcXVpdmFsZW50LlxuICovXG5leHBvcnQgY2xhc3MgQnJvd3NlclZpZXdFbXVsYXRvciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX2RldmljZTogSUJyb3dzZXJEZXZpY2VQcm9maWxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0VXNlckFnZW50OiBzdHJpbmc7XG5cdHByaXZhdGUgX2xhc3RMYXlvdXQgPSB7IGNvbnRhaW5lcldpZHRoOiAxMDI0LCBjb250YWluZXJIZWlnaHQ6IDc2OCwgc2NhbGU6IDEsIGhvc3Rab29tOiAxIH07XG5cdHByaXZhdGUgX2xhc3RBcHBsaWVkOiB7IHZpZXdwb3J0V2lkdGg6IG51bWJlcjsgdmlld3BvcnRIZWlnaHQ6IG51bWJlcjsgc2NhbGU6IG51bWJlcjsgaG9zdFpvb206IG51bWJlcjsgbW9iaWxlOiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlckRldmljZVByb2ZpbGUgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8SUJyb3dzZXJEZXZpY2VQcm9maWxlIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYnJvd3NlcjogQnJvd3NlclZpZXcsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZGVmYXVsdFVzZXJBZ2VudCA9IHRoaXMuYnJvd3Nlci53ZWJDb250ZW50cy5nZXRVc2VyQWdlbnQoKTtcblxuXHRcdC8vIENocm9taXVtIG1heSByZXNldCBlbXVsYXRpb24gb24gY3Jvc3MtcHJvY2VzcyBuYXZpZ2F0aW9uLlxuXHRcdGNvbnN0IG9uTmF2aWdhdGUgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl9sYXN0QXBwbGllZCA9IHVuZGVmaW5lZDtcblx0XHRcdHZvaWQgdGhpcy5fcmVhcHBseSgpO1xuXHRcdH07XG5cdFx0dGhpcy5icm93c2VyLndlYkNvbnRlbnRzLm9uKCdkaWQtbmF2aWdhdGUnLCBvbk5hdmlnYXRlKTtcblxuXHRcdC8vIEludGVyY2VwdCBleHRlcm5hbCBDRFAgZW11bGF0aW9uIGNvbW1hbmRzIGFuZCBmb2xkIHRoZW0gaW50byB0aGUgZGV2aWNlIHByb2ZpbGUgc28gdGhlcmUgaXMgYSBzaW5nbGUgc291cmNlIG9mIHRydXRoLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYnJvd3Nlci5kZWJ1Z2dlci5yZWdpc3RlckNvbW1hbmRJbnRlcmNlcHRvcigobWV0aG9kLCBwYXJhbXMsIHNlc3Npb24pID0+IHRoaXMuX2ludGVyY2VwdChtZXRob2QsIHBhcmFtcywgc2Vzc2lvbikpKTtcblx0fVxuXG5cdGdldCBkZXZpY2UoKTogSUJyb3dzZXJEZXZpY2VQcm9maWxlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZGV2aWNlO1xuXHR9XG5cblx0Z2V0IGVtdWxhdGVkU2NhbGVGYWN0b3IoKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX2xhc3RMYXlvdXQpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbGFzdExheW91dC5zY2FsZSAqIHRoaXMuX2xhc3RMYXlvdXQuaG9zdFpvb207XG5cdH1cblxuXHRhc3luYyBzZXREZXZpY2UoZGV2aWNlOiBJQnJvd3NlckRldmljZVByb2ZpbGUgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcmV2ID0gdGhpcy5fZGV2aWNlO1xuXHRcdHRoaXMuX2RldmljZSA9IGRldmljZTtcblxuXHRcdGNvbnN0IG5leHRVQSA9IGRldmljZT8udXNlckFnZW50O1xuXHRcdGlmIChwcmV2Py51c2VyQWdlbnQgIT09IG5leHRVQSkge1xuXHRcdFx0dGhpcy5icm93c2VyLndlYkNvbnRlbnRzLnNldFVzZXJBZ2VudChuZXh0VUEgPz8gdGhpcy5fZGVmYXVsdFVzZXJBZ2VudCk7XG5cdFx0fVxuXG5cdFx0aWYgKHByZXYgJiYgIWRldmljZSAmJiB0aGlzLmlzU2FmZVRvQXBwbHlFbXVsYXRpb24oKSkge1xuXHRcdFx0dGhpcy5icm93c2VyLndlYkNvbnRlbnRzLmRpc2FibGVEZXZpY2VFbXVsYXRpb24oKTtcblx0XHRcdHZvaWQgdGhpcy5fYXBwbHlUb3VjaEFuZE1lZGlhKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbGFzdEFwcGxpZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGRldmljZSAmJiB0aGlzLmlzU2FmZVRvQXBwbHlFbXVsYXRpb24oKSkge1xuXHRcdFx0dGhpcy5fcmVhcHBseSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZGV2aWNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgdGhlIGNhY2hlZCBsYXlvdXQgKGNvbnRhaW5lciBzaXplICsgc2NhbGUgKyBob3N0IHpvb20pIGFuZCByZWFwcGx5XG5cdCAqIGVtdWxhdGlvbi4gVGhlIGVtdWxhdGVkIHZpZXdwb3J0IGlzIGRlcml2ZWQgZnJvbSB0aGUgY3VycmVudCBkZXZpY2Unc1xuXHQgKiB3aWR0aCAvIGhlaWdodDsgd2hlbiB0aG9zZSBhcmUgdW5kZWZpbmVkIHRoZSB2aWV3cG9ydCBhdXRvLWZpdHMgdG8gdGhlXG5cdCAqIGNvbnRhaW5lciBhdCB0aGUgZ2l2ZW4gc2NhbGUuIGBob3N0Wm9vbWAgaXMgdGhlIGhvc3Qgd2luZG93J3Ncblx0ICogQ1NTLXRvLXNjcmVlbiB6b29tIGZhY3RvciBcdTIwMTQgYm91bmRzIGluIG1haW4gYXJlIG11bHRpcGxpZWQgYnkgaXQsIHNvIHRoZVxuXHQgKiBlbXVsYXRpb24gc2NhbGUgbXVzdCBiZSB0b28gb3IgdGhlIGVtdWxhdGVkIHZpZXdwb3J0IHdvbid0IGZpbGwgdGhlXG5cdCAqIFdlYkNvbnRlbnRzVmlldyB3aGVuIHRoZSB3b3JrYmVuY2ggaXMgem9vbWVkLlxuXHQgKi9cblx0YXBwbHlTY3JlZW5FbXVsYXRpb24oY29udGFpbmVyV2lkdGg6IG51bWJlciwgY29udGFpbmVySGVpZ2h0OiBudW1iZXIsIHNjYWxlOiBudW1iZXIsIGhvc3Rab29tOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXN0TGF5b3V0ID0geyBjb250YWluZXJXaWR0aCwgY29udGFpbmVySGVpZ2h0LCBzY2FsZSwgaG9zdFpvb20gfTtcblx0XHR0aGlzLl9yZWFwcGx5KCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWFwcGx5KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZGV2aWNlIHx8ICF0aGlzLmlzU2FmZVRvQXBwbHlFbXVsYXRpb24oKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB7IGNvbnRhaW5lcldpZHRoLCBjb250YWluZXJIZWlnaHQsIHNjYWxlLCBob3N0Wm9vbSB9ID0gdGhpcy5fbGFzdExheW91dDtcblx0XHRjb25zdCBzID0gTWF0aC5tYXgoMC4wMSwgc2NhbGUpO1xuXHRcdGNvbnN0IHogPSBNYXRoLm1heCgwLjAxLCBob3N0Wm9vbSk7XG5cdFx0Y29uc3QgdyA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQodGhpcy5fZGV2aWNlLndpZHRoIHx8IGNvbnRhaW5lcldpZHRoIC8gcykpO1xuXHRcdGNvbnN0IGggPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKHRoaXMuX2RldmljZS5oZWlnaHQgfHwgY29udGFpbmVySGVpZ2h0IC8gcykpO1xuXHRcdGNvbnN0IG1vYmlsZSA9ICEhdGhpcy5fZGV2aWNlLm1vYmlsZTtcblx0XHRjb25zdCBsYXN0ID0gdGhpcy5fbGFzdEFwcGxpZWQ7XG5cdFx0aWYgKGxhc3QgJiYgbGFzdC52aWV3cG9ydFdpZHRoID09PSB3ICYmIGxhc3Qudmlld3BvcnRIZWlnaHQgPT09IGhcblx0XHRcdCYmIE1hdGguYWJzKGxhc3Quc2NhbGUgLSBzKSA8IDAuMDAwMSAmJiBNYXRoLmFicyhsYXN0Lmhvc3Rab29tIC0geikgPCAwLjAwMDFcblx0XHRcdCYmIGxhc3QubW9iaWxlID09PSBtb2JpbGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdEFwcGxpZWQgPSB7IHZpZXdwb3J0V2lkdGg6IHcsIHZpZXdwb3J0SGVpZ2h0OiBoLCBzY2FsZTogcywgaG9zdFpvb206IHosIG1vYmlsZSB9O1xuXHRcdGNvbnN0IHBhcmFtczogRWxlY3Ryb24uUGFyYW1ldGVycyA9IHtcblx0XHRcdHNjcmVlblBvc2l0aW9uOiBtb2JpbGUgPyAnbW9iaWxlJyA6ICdkZXNrdG9wJyxcblx0XHRcdHNjcmVlblNpemU6IHsgd2lkdGg6IHcsIGhlaWdodDogaCB9LFxuXHRcdFx0dmlld1NpemU6IHsgd2lkdGg6IHcsIGhlaWdodDogaCB9LFxuXHRcdFx0ZGV2aWNlU2NhbGVGYWN0b3I6IHRoaXMuX2RldmljZS5kZXZpY2VTY2FsZUZhY3RvciA/PyAwLFxuXHRcdFx0dmlld1Bvc2l0aW9uOiB7IHg6IDAsIHk6IDAgfSxcblx0XHRcdHNjYWxlOiBzICogeixcblx0XHR9O1xuXG5cdFx0Ly8gVGhlcmUncyBhIGJ1ZyB3aGVyZSBgc2NyZWVuUG9zaXRpb246ICdtb2JpbGUnYCBkb2Vzbid0IGFwcGx5IHNjYWxpbmcgY29ycmVjdGx5IG9uIHRoZSBmaXJzdCBjYWxsIG9mIGVuYWJsaW5nIGVtdWxhdGlvbixcblx0XHQvLyBzbyB3ZSBoYXZlIHRvIGZpcnN0IGVuYWJsZSBlbXVsYXRpb24gaW4gZGVza3RvcCBtb2RlIGFuZCB0aGVuIHN3aXRjaCBpdCB0byBtb2JpbGUgYmVsb3cuXG5cdFx0aWYgKG1vYmlsZSAmJiAhbGFzdCkge1xuXHRcdFx0dGhpcy5icm93c2VyLndlYkNvbnRlbnRzLmVuYWJsZURldmljZUVtdWxhdGlvbih7XG5cdFx0XHRcdC4uLnBhcmFtcyxcblx0XHRcdFx0c2NyZWVuUG9zaXRpb246ICdkZXNrdG9wJyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuYnJvd3Nlci53ZWJDb250ZW50cy5lbmFibGVEZXZpY2VFbXVsYXRpb24ocGFyYW1zKTtcblxuXHRcdGlmIChtb2JpbGUgIT09IGxhc3Q/Lm1vYmlsZSkge1xuXHRcdFx0dm9pZCB0aGlzLl9hcHBseVRvdWNoQW5kTWVkaWEoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGlzU2FmZVRvQXBwbHlFbXVsYXRpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLmJyb3dzZXIud2ViQ29udGVudHMuaXNEZXN0cm95ZWQoKSAmJiAhIXRoaXMuYnJvd3Nlci53ZWJDb250ZW50cy5nZXRVUkwoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FwcGx5VG91Y2hBbmRNZWRpYSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaXNTYWZlVG9BcHBseUVtdWxhdGlvbigpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRldmljZSA9IHRoaXMuX2RldmljZTtcblx0XHRjb25zdCBtb2JpbGUgPSAhIXRoaXMuX2RldmljZT8ubW9iaWxlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmJyb3dzZXIuZGVidWdnZXIuc2VuZENvbW1hbmRSYXcoJ0VtdWxhdGlvbi5zZXRUb3VjaEVtdWxhdGlvbkVuYWJsZWQnLCB7IGVuYWJsZWQ6IG1vYmlsZSwgbWF4VG91Y2hQb2ludHM6IG1vYmlsZSA/IDUgOiAxIH0pO1xuXHRcdFx0aWYgKHRoaXMuZGV2aWNlICE9PSBkZXZpY2UpIHsgcmV0dXJuOyB9IC8vIEJhaWwgaWYgZGV2aWNlIGNoYW5nZWQgd2hpbGUgd2Ugd2VyZSBhd2FpdGluZ1xuXG5cdFx0XHRhd2FpdCB0aGlzLmJyb3dzZXIuZGVidWdnZXIuc2VuZENvbW1hbmRSYXcoJ0VtdWxhdGlvbi5zZXRFbXVsYXRlZE1lZGlhJywgeyBmZWF0dXJlczogdGhpcy5fZGV2aWNlID8gW3sgbmFtZTogJ3BvaW50ZXInLCB2YWx1ZTogbW9iaWxlID8gJ2NvYXJzZScgOiAnZmluZScgfV0gOiBbXSB9KTtcblx0XHRcdGlmICh0aGlzLmRldmljZSAhPT0gZGV2aWNlKSB7IHJldHVybjsgfSAvLyBCYWlsIGlmIGRldmljZSBjaGFuZ2VkIHdoaWxlIHdlIHdlcmUgYXdhaXRpbmdcblxuXHRcdFx0YXdhaXQgdGhpcy5icm93c2VyLmRlYnVnZ2VyLnNlbmRDb21tYW5kUmF3KCdFbXVsYXRpb24uc2V0RW1pdFRvdWNoRXZlbnRzRm9yTW91c2UnLCB7IGVuYWJsZWQ6IG1vYmlsZSB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0Jyb3dzZXJWaWV3RW11bGF0b3JdIF9hcHBseVRvdWNoQW5kTWVkaWEgZmFpbGVkJywgZXJyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSW50ZXJjZXB0IGluY29taW5nIENEUCBlbXVsYXRpb24gY29tbWFuZHMgYW5kIGZvbGQgdGhlIG9uZXMgdGhhdCBtYXAgb250b1xuXHQgKiB7QGxpbmsgSUJyb3dzZXJEZXZpY2VQcm9maWxlfSBpbnRvIHRoZSBkZXZpY2UuIEFueXRoaW5nIHdlIGRvbid0IG1vZGVsXG5cdCAqIChnZW9sb2NhdGlvbiwgdGltZXpvbmUsIENQVSB0aHJvdHRsaW5nLCBsb2NhbGUsIHZpc2lvbiBkZWZpY2llbmN5LCBcdTIwMjYpXG5cdCAqIGZhbGxzIHRocm91Z2ggdG8gcmF3IENEUC4gT25seSB0aGUgcm9vdCBzZXNzaW9uIGlzIGludGVyY2VwdGVkIFx1MjAxNCB3b3JrZXJcblx0ICogYW5kIGlmcmFtZSBzdWItc2Vzc2lvbnMgZ2V0IHBhc3MtdGhyb3VnaCBiZWhhdmlvci5cblx0ICovXG5cdHByaXZhdGUgX2ludGVyY2VwdChtZXRob2Q6IHN0cmluZywgcGFyYW1zOiB1bmtub3duLCBzZXNzaW9uOiBJQ0RQQ29ubmVjdGlvbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8dW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdGlmIChzZXNzaW9uICYmIHNlc3Npb24udGFyZ2V0SWQgIT09IHRoaXMuYnJvd3Nlci5kZWJ1Z2dlci50YXJnZXRJZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKG1ldGhvZCkge1xuXHRcdFx0Y2FzZSAnRW11bGF0aW9uLnNldERldmljZU1ldHJpY3NPdmVycmlkZSc6IHtcblx0XHRcdFx0Y29uc3QgcCA9IChwYXJhbXMgPz8ge30pIGFzIHsgd2lkdGg/OiBudW1iZXI7IGhlaWdodD86IG51bWJlcjsgbW9iaWxlPzogYm9vbGVhbjsgZGV2aWNlU2NhbGVGYWN0b3I/OiBudW1iZXIgfTtcblx0XHRcdFx0Y29uc3QgbmV4dDogSUJyb3dzZXJEZXZpY2VQcm9maWxlID0ge1xuXHRcdFx0XHRcdC4uLnRoaXMuX2RldmljZSxcblx0XHRcdFx0XHQvLyBDRFAgdXNlcyAwIHRvIGRpc2FibGUgdGhlIGNvcnJlc3BvbmRpbmcgb3ZlcnJpZGUuXG5cdFx0XHRcdFx0d2lkdGg6IHAud2lkdGggfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGhlaWdodDogcC5oZWlnaHQgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vYmlsZTogcC5tb2JpbGUgPz8gdGhpcy5fZGV2aWNlPy5tb2JpbGUsXG5cdFx0XHRcdFx0ZGV2aWNlU2NhbGVGYWN0b3I6IHAuZGV2aWNlU2NhbGVGYWN0b3IgPz8gdGhpcy5fZGV2aWNlPy5kZXZpY2VTY2FsZUZhY3Rvcixcblx0XHRcdFx0fTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2V0RGV2aWNlKG5leHQpLnRoZW4oKCkgPT4gKHt9KSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdFbXVsYXRpb24uY2xlYXJEZXZpY2VNZXRyaWNzT3ZlcnJpZGUnOiB7XG5cdFx0XHRcdGlmICghdGhpcy5fZGV2aWNlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgeyB3aWR0aCwgaGVpZ2h0LCBtb2JpbGUsIGRldmljZVNjYWxlRmFjdG9yLCAuLi5yZXN0IH0gPSB0aGlzLl9kZXZpY2U7XG5cdFx0XHRcdGNvbnN0IGhhc1Jlc3QgPSBPYmplY3QudmFsdWVzKHJlc3QpLnNvbWUodiA9PiB2ICE9PSB1bmRlZmluZWQpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXREZXZpY2UoaGFzUmVzdCA/IHJlc3QgOiB1bmRlZmluZWQpLnRoZW4oKCkgPT4gKHt9KSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdFbXVsYXRpb24uc2V0VXNlckFnZW50T3ZlcnJpZGUnOiB7XG5cdFx0XHRcdGNvbnN0IHAgPSAocGFyYW1zID8/IHt9KSBhcyB7IHVzZXJBZ2VudD86IHN0cmluZzsgYWNjZXB0TGFuZ3VhZ2U/OiBzdHJpbmc7IHBsYXRmb3JtPzogc3RyaW5nOyB1c2VyQWdlbnRNZXRhZGF0YT86IHVua25vd24gfTtcblx0XHRcdFx0Ly8gT25seSBmb2xkIHRoZSBiYXJlLXN0cmluZyBjYXNlOyByaWNoZXIgY2xpZW50LWhpbnQgcGFyYW1zIHdvdWxkXG5cdFx0XHRcdC8vIG5vdCByb3VuZC10cmlwIHRocm91Z2ggb3VyIG1vZGVsLCBzbyBsZXQgdGhlbSBnbyByYXcuXG5cdFx0XHRcdGlmIChwLmFjY2VwdExhbmd1YWdlICE9PSB1bmRlZmluZWQgfHwgcC5wbGF0Zm9ybSAhPT0gdW5kZWZpbmVkIHx8IHAudXNlckFnZW50TWV0YWRhdGEgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdWEgPSBwLnVzZXJBZ2VudCB8fCB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNldERldmljZSh7IC4uLnRoaXMuX2RldmljZSwgdXNlckFnZW50OiB1YSB9KS50aGVuKCgpID0+ICh7fSkpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnSW5wdXQuZGlzcGF0Y2hNb3VzZUV2ZW50Jzpcblx0XHRcdGNhc2UgJ0lucHV0LmRpc3BhdGNoRHJhZ0V2ZW50Jzpcblx0XHRcdGNhc2UgJ0lucHV0LnN5bnRoZXNpemVTY3JvbGxHZXN0dXJlJzpcblx0XHRcdGNhc2UgJ0lucHV0LnN5bnRoZXNpemVQaW5jaEdlc3R1cmUnOlxuXHRcdFx0Y2FzZSAnSW5wdXQuc3ludGhlc2l6ZVRhcEdlc3R1cmUnOlxuXHRcdFx0Y2FzZSAnSW5wdXQuZGlzcGF0Y2hUb3VjaEV2ZW50Jzpcblx0XHRcdFx0dGhpcy5fc2NhbGVJbnB1dENvb3JkaW5hdGVzKHBhcmFtcyk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIGxldCB0aGUgZXZlbnQgcGFzcyB0aHJvdWdoIHdpdGggdGhlIG1vZGlmaWVkIHBhcmFtZXRlcnNcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNjYWxlIGFueSBjb29yZGluYXRlLWJlYXJpbmcgZmllbGRzIG9uIGEgQ0RQIGBJbnB1dC4qYCBwYXJhbXMgb2JqZWN0IGluXG5cdCAqIHBsYWNlIHNvIHNjcmVlbi1zcGFjZSBjb29yZGluYXRlcyBtYXAgb250byB0aGUgZW11bGF0ZWQgdmlld3BvcnQuIEhhbmRsZXNcblx0ICogcG9pbnQgY29vcmRpbmF0ZXMgKGB4YCAvIGB5YCksIG1vdXNlIHdoZWVsIGRlbHRhcyAoYGRlbHRhWGAgLyBgZGVsdGFZYCksXG5cdCAqIHNjcm9sbCBkaXN0YW5jZXMgKGB4RGlzdGFuY2VgIC8gYHlEaXN0YW5jZWApIGFuZCB0b3VjaCBwb2ludHMuXG5cdCAqL1xuXHRwcml2YXRlIF9zY2FsZUlucHV0Q29vcmRpbmF0ZXMocGFyYW1zOiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2NhbGUgPSB0aGlzLmVtdWxhdGVkU2NhbGVGYWN0b3I7XG5cdFx0Y29uc3QgcCA9IChwYXJhbXMgPz8ge30pIGFzIHtcblx0XHRcdHg/OiBudW1iZXI7XG5cdFx0XHR5PzogbnVtYmVyO1xuXHRcdFx0ZGVsdGFYPzogbnVtYmVyO1xuXHRcdFx0ZGVsdGFZPzogbnVtYmVyO1xuXHRcdFx0eERpc3RhbmNlPzogbnVtYmVyO1xuXHRcdFx0eURpc3RhbmNlPzogbnVtYmVyO1xuXHRcdFx0dG91Y2hQb2ludHM/OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXTtcblx0XHR9O1xuXHRcdGlmIChwLngpIHtcblx0XHRcdHAueCAqPSBzY2FsZTtcblx0XHR9XG5cdFx0aWYgKHAueSkge1xuXHRcdFx0cC55ICo9IHNjYWxlO1xuXHRcdH1cblx0XHRpZiAocC5kZWx0YVgpIHtcblx0XHRcdHAuZGVsdGFYICo9IHNjYWxlO1xuXHRcdH1cblx0XHRpZiAocC5kZWx0YVkpIHtcblx0XHRcdHAuZGVsdGFZICo9IHNjYWxlO1xuXHRcdH1cblx0XHRpZiAocC54RGlzdGFuY2UpIHtcblx0XHRcdHAueERpc3RhbmNlICo9IHNjYWxlO1xuXHRcdH1cblx0XHRpZiAocC55RGlzdGFuY2UpIHtcblx0XHRcdHAueURpc3RhbmNlICo9IHNjYWxlO1xuXHRcdH1cblx0XHRpZiAoQXJyYXkuaXNBcnJheShwLnRvdWNoUG9pbnRzKSkge1xuXHRcdFx0cC50b3VjaFBvaW50cyA9IHAudG91Y2hQb2ludHMubWFwKCh0KSA9PiAoe1xuXHRcdFx0XHQuLi50LFxuXHRcdFx0XHR4OiB0LnggKiBzY2FsZSxcblx0XHRcdFx0eTogdC55ICogc2NhbGUsXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBc0I7QUFFL0IsU0FBUyxtQkFBbUI7QUFZckIsSUFBTSxzQkFBTixjQUFrQyxXQUFXO0FBQUEsRUFVbkQsWUFDa0IsU0FDYSxZQUM3QjtBQUNELFVBQU07QUFIVztBQUNhO0FBUi9CLFNBQVEsY0FBYyxFQUFFLGdCQUFnQixNQUFNLGlCQUFpQixLQUFLLE9BQU8sR0FBRyxVQUFVLEVBQUU7QUFHMUYsU0FBaUIsZUFBZSxLQUFLLFVBQVUsSUFBSSxRQUEyQyxDQUFDO0FBQy9GLFNBQVMsY0FBd0QsS0FBSyxhQUFhO0FBT2xGLFNBQUssb0JBQW9CLEtBQUssUUFBUSxZQUFZLGFBQWE7QUFHL0QsVUFBTSxhQUFhLE1BQU07QUFDeEIsV0FBSyxlQUFlO0FBQ3BCLFdBQUssS0FBSyxTQUFTO0FBQUEsSUFDcEI7QUFDQSxTQUFLLFFBQVEsWUFBWSxHQUFHLGdCQUFnQixVQUFVO0FBR3RELFNBQUssVUFBVSxLQUFLLFFBQVEsU0FBUywyQkFBMkIsQ0FBQyxRQUFRLFFBQVEsWUFBWSxLQUFLLFdBQVcsUUFBUSxRQUFRLE9BQU8sQ0FBQyxDQUFDO0FBQUEsRUFDdkk7QUFBQSxFQUVBLElBQUksU0FBNEM7QUFDL0MsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxzQkFBOEI7QUFDakMsUUFBSSxDQUFDLEtBQUssYUFBYTtBQUN0QixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyxZQUFZLFFBQVEsS0FBSyxZQUFZO0FBQUEsRUFDbEQ7QUFBQSxFQUVBLE1BQU0sVUFBVSxRQUEwRDtBQUN6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
