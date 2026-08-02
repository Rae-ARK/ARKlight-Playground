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
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { Emitter } from "../../../../base/common/event.js";
import { structuralEquals } from "../../../../base/common/equals.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { localize } from "../../../../nls.js";
import { IPlaywrightService } from "../../../../platform/browserView/common/playwrightService.js";
import {
  BrowserHistoryStore
} from "../../../../platform/browserView/common/browserHistory.js";
import {
  BrowserPermissionStore
} from "../../../../platform/browserView/common/browserPermissions.js";
import {
  BrowserViewStorageScope,
  browserZoomDefaultIndex,
  browserZoomFactors
} from "../../../../platform/browserView/common/browserView.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isLocalhostAuthority } from "../../../../platform/url/common/trustedDomains.js";
import { IAgentNetworkFilterService } from "../../../../platform/networkFilter/common/networkFilterService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IBrowserZoomService } from "./browserZoomService.js";
var BrowserViewSharingState = /* @__PURE__ */ ((BrowserViewSharingState2) => {
  BrowserViewSharingState2["Shared"] = "shared";
  BrowserViewSharingState2["NotShared"] = "notShared";
  BrowserViewSharingState2["Unavailable"] = "unavailable";
  return BrowserViewSharingState2;
})(BrowserViewSharingState || {});
function browserViewUrlMatches(candidateUrl, targetUrl, includeBlank = false) {
  const target = URL.parse(targetUrl);
  if (!target || target.protocol !== "file:" && !target.host) {
    return false;
  }
  if (includeBlank && (!candidateUrl || candidateUrl === "about:blank")) {
    return true;
  }
  const candidate = URL.parse(candidateUrl ?? "");
  return candidate?.host === target.host || target.protocol === "file:" && candidate?.protocol === "file:" || !!(candidate?.host && target.host && (candidate.host.endsWith("." + target.host) || target.host.endsWith("." + candidate.host)));
}
function parseZoomHost(url) {
  const parsed = URL.parse(url);
  if (!parsed?.host || parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return void 0;
  }
  return parsed.host;
}
function parseHistorySnapshot(raw) {
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
const IBrowserViewWorkbenchService = createDecorator("browserViewWorkbenchService");
const IBrowserViewCDPService = createDecorator("browserViewCDPService");
let BrowserViewModel = class extends Disposable {
  constructor(id, owner, initialState, browserViewService, browserViewWorkbenchService, telemetryService, playwrightService, dialogService, storageService, zoomService, agentNetworkFilterService, logService) {
    super();
    this.id = id;
    this.owner = owner;
    this.browserViewService = browserViewService;
    this.browserViewWorkbenchService = browserViewWorkbenchService;
    this.telemetryService = telemetryService;
    this.playwrightService = playwrightService;
    this.dialogService = dialogService;
    this.storageService = storageService;
    this.zoomService = zoomService;
    this.agentNetworkFilterService = agentNetworkFilterService;
    this.logService = logService;
    this._url = "";
    this._title = "";
    this._favicon = void 0;
    this._screenshot = void 0;
    this._loading = false;
    this._focused = false;
    this._visible = false;
    this._isDevToolsOpen = false;
    this._canGoBack = false;
    this._canGoForward = false;
    this._error = void 0;
    this._certificateError = void 0;
    this._storageScope = BrowserViewStorageScope.Ephemeral;
    this._isRemoteSession = false;
    this._isEphemeral = false;
    this._zoomHost = void 0;
    this._sharedWithAgent = false;
    this._browserZoomIndex = browserZoomDefaultIndex;
    this._elementSelectionState = { active: false, options: {} };
    this._isAreaSelectionActive = false;
    this.history = this._register(new BrowserHistoryStore());
    this.permissions = this._register(new BrowserPermissionStore());
    this._onDidChangeDevice = this._register(new Emitter());
    this.onDidChangeDevice = this._onDidChangeDevice.event;
    this._onDidChangeSharingState = this._register(new Emitter());
    this.onDidChangeSharingState = this._onDidChangeSharingState.event;
    this._onDidChangeZoom = this._register(new Emitter());
    this.onDidChangeZoom = this._onDidChangeZoom.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._onWillNavigate = this._register(new Emitter());
    this.onWillNavigate = this._onWillNavigate.event;
    this._url = initialState.url;
    this._title = initialState.title;
    this._loading = initialState.loading;
    this._focused = initialState.focused;
    this._visible = initialState.visible;
    this._isDevToolsOpen = initialState.isDevToolsOpen;
    this._canGoBack = initialState.canGoBack;
    this._canGoForward = initialState.canGoForward;
    this._screenshot = initialState.lastScreenshot;
    this._favicon = initialState.lastFavicon;
    this._error = initialState.lastError;
    this._certificateError = initialState.certificateError;
    this._storageScope = initialState.storageScope;
    this._isRemoteSession = initialState.isRemoteSession;
    this._browserZoomIndex = initialState.browserZoomIndex;
    this._elementSelectionState = initialState.elementSelectionState;
    this._isAreaSelectionActive = initialState.isAreaSelectionActive;
    this._device = initialState.device;
    this._isEphemeral = this._storageScope === BrowserViewStorageScope.Ephemeral;
    this._zoomHost = parseZoomHost(this._url);
    const { history: entriesKey, favicons: faviconsKey } = initialState.storageKeys;
    if (entriesKey) {
      this._reloadHistoryEntries(entriesKey);
      this._register(this.storageService.onDidChangeValue(
        StorageScope.APPLICATION,
        entriesKey,
        this._store
      )(() => this._reloadHistoryEntries(entriesKey)));
    }
    if (faviconsKey) {
      this._reloadHistoryFavicons(faviconsKey);
      this._register(this.storageService.onDidChangeValue(
        StorageScope.APPLICATION,
        faviconsKey,
        this._store
      )(() => this._reloadHistoryFavicons(faviconsKey)));
    }
    this.permissions.hydrate(initialState.permissions);
    this._register(this.browserViewService.onDynamicDidChangePermissions(this.id)(
      (snapshot) => this.permissions.hydrate(snapshot)
    ));
    const effectiveZoomIndex = this.zoomService.getEffectiveZoomIndex(this._zoomHost, this._isEphemeral);
    if (effectiveZoomIndex !== this._browserZoomIndex) {
      void this.setBrowserZoomIndex(effectiveZoomIndex).catch((e) => {
        this.logService.warn(`[BrowserViewModel] Failed to set initial zoom:`, e);
      });
    }
    void this.playwrightService.isPageTracked(this.id).then((shared) => this._setSharedWithAgent(shared)).catch((e) => {
      this.logService.warn(`[BrowserViewModel] Failed to check initial page tracking:`, e);
    });
    this._register(this.zoomService.onDidChangeZoom(({ host, isEphemeralChange }) => {
      if (isEphemeralChange && !this._isEphemeral) {
        return;
      }
      if (host === void 0 || host === this._zoomHost) {
        void this.setBrowserZoomIndex(
          this.zoomService.getEffectiveZoomIndex(this._zoomHost, this._isEphemeral)
        ).catch(() => {
        });
      }
    }));
    this._register(this.onDidNavigate((e) => {
      if (URL.parse(e.url)?.host !== URL.parse(this._url)?.host) {
        this._favicon = void 0;
      }
      this._zoomHost = parseZoomHost(e.url);
      this._url = e.url;
      this._title = e.title;
      this._canGoBack = e.canGoBack;
      this._canGoForward = e.canGoForward;
      this._certificateError = e.certificateError;
      void this.setBrowserZoomIndex(
        this.zoomService.getEffectiveZoomIndex(this._zoomHost, this._isEphemeral),
        true
      );
    }));
    this._register(this.onDidChangeLoadingState((e) => {
      this._loading = e.loading;
      this._error = e.error;
    }));
    this._register(this.onDidChangeDevToolsState((e) => {
      this._isDevToolsOpen = e.isDevToolsOpen;
    }));
    this._register(this.onDidChangeTitle((e) => {
      this._title = e.title;
    }));
    this._register(this.onDidChangeFavicon((e) => {
      this._favicon = e.favicon;
    }));
    this._register(this.onDidChangeFocus(({ focused }) => {
      this._focused = focused;
    }));
    this._register(this.onDidChangeVisibility(({ visible }) => {
      this._visible = visible;
    }));
    this._register(this.browserViewService.onDynamicDidChangeDeviceEmulation(this.id)((device) => {
      if (!structuralEquals(this._device, device)) {
        this._device = device;
        this._onDidChangeDevice.fire(device);
      }
    }));
    this._register(this.onDidChangeElementSelectionState((state) => {
      if (state.active && !this._elementSelectionState.active) {
        this.telemetryService.publicLog2("integratedBrowser.addElementToChat.start", {});
      }
      this._elementSelectionState = state;
    }));
    this._register(this.onDidChangeAreaSelectionActive((active) => {
      this._isAreaSelectionActive = active;
    }));
    this._register(this.playwrightService.onDidChangeTrackedPages((ids) => {
      this._setSharedWithAgent(ids.includes(this.id));
    }));
    this._register(this.browserViewWorkbenchService.onDidChangeSharingAvailable(() => {
      this._onDidChangeSharingState.fire(this.sharingState);
    }));
    this._register(this.onDidChangeRemoteStatus((isRemoteSession) => {
      this._isRemoteSession = isRemoteSession;
    }));
  }
  get url() {
    return this._url;
  }
  get title() {
    return this._title;
  }
  get favicon() {
    return this._favicon;
  }
  get loading() {
    return this._loading;
  }
  get focused() {
    return this._focused;
  }
  get visible() {
    return this._visible;
  }
  get isDevToolsOpen() {
    return this._isDevToolsOpen;
  }
  get canGoBack() {
    return this._canGoBack;
  }
  get canGoForward() {
    return this._canGoForward;
  }
  get screenshot() {
    return this._screenshot;
  }
  get error() {
    return this._error;
  }
  get certificateError() {
    return this._certificateError;
  }
  get storageScope() {
    return this._storageScope;
  }
  get isRemoteSession() {
    return this._isRemoteSession;
  }
  get sharingState() {
    if (!this.browserViewWorkbenchService.isSharingAvailable) {
      return "unavailable" /* Unavailable */;
    }
    return this._sharedWithAgent ? "shared" /* Shared */ : "notShared" /* NotShared */;
  }
  get zoomFactor() {
    return browserZoomFactors[this._browserZoomIndex];
  }
  get canZoomIn() {
    return this._browserZoomIndex < browserZoomFactors.length - 1;
  }
  get canZoomOut() {
    return this._browserZoomIndex > 0;
  }
  get elementSelectionState() {
    return this._elementSelectionState;
  }
  get isAreaSelectionActive() {
    return this._isAreaSelectionActive;
  }
  get device() {
    return this._device;
  }
  get onDidNavigate() {
    return this.browserViewService.onDynamicDidNavigate(this.id);
  }
  get onDidChangeLoadingState() {
    return this.browserViewService.onDynamicDidChangeLoadingState(this.id);
  }
  get onDidChangeFocus() {
    return this.browserViewService.onDynamicDidChangeFocus(this.id);
  }
  get onDidChangeDevToolsState() {
    return this.browserViewService.onDynamicDidChangeDevToolsState(this.id);
  }
  get onDidKeyCommand() {
    return this.browserViewService.onDynamicDidKeyCommand(this.id);
  }
  get onDidChangeTitle() {
    return this.browserViewService.onDynamicDidChangeTitle(this.id);
  }
  get onDidChangeFavicon() {
    return this.browserViewService.onDynamicDidChangeFavicon(this.id);
  }
  get onDidFindInPage() {
    return this.browserViewService.onDynamicDidFindInPage(this.id);
  }
  get onDidChangeVisibility() {
    return this.browserViewService.onDynamicDidChangeVisibility(this.id);
  }
  get onDidClose() {
    return this.browserViewService.onDynamicDidClose(this.id);
  }
  get onDidChangeRemoteStatus() {
    return this.browserViewService.onDynamicDidChangeRemoteStatus(this.id);
  }
  get onDidRequestPermission() {
    return this.browserViewService.onDynamicDidRequestPermission(this.id);
  }
  async layout(bounds) {
    return this.browserViewService.layout(this.id, bounds);
  }
  async setVisible(visible) {
    this._visible = visible;
    return this.browserViewService.setVisible(this.id, visible);
  }
  async loadURL(url, options) {
    this.logNavigationTelemetry(options?.source ?? "urlInput", url);
    this._onWillNavigate.fire(url);
    if (/^localhost(:|\/|$)/i.test(url)) {
      url = "http://" + url;
    } else if (!URL.parse(url)?.protocol) {
      url = "http://" + url;
    }
    return this.browserViewService.loadURL(this.id, url);
  }
  async goBack() {
    this.logNavigationTelemetry("goBack", this._url);
    return this.browserViewService.goBack(this.id);
  }
  async goForward() {
    this.logNavigationTelemetry("goForward", this._url);
    return this.browserViewService.goForward(this.id);
  }
  async reload(hard) {
    this.logNavigationTelemetry("reload", this._url);
    return this.browserViewService.reload(this.id, hard);
  }
  async toggleDevTools() {
    return this.browserViewService.toggleDevTools(this.id);
  }
  async captureScreenshot(options) {
    const result = await this.browserViewService.captureScreenshot(this.id, options);
    if (!options?.screenRect && !options?.pageRect && !options?.fullPage) {
      this._screenshot = result;
    }
    return result;
  }
  async focus(force) {
    return this.browserViewService.focus(this.id, force);
  }
  async findInPage(text, options) {
    return this.browserViewService.findInPage(this.id, text, options);
  }
  async stopFindInPage(keepSelection) {
    return this.browserViewService.stopFindInPage(this.id, keepSelection);
  }
  async getSelectedText() {
    return this.browserViewService.getSelectedText(this.id);
  }
  async clearStorage() {
    return this.browserViewService.clearStorage(this.id);
  }
  async trustCertificate(host, fingerprint) {
    return this.browserViewService.trustCertificate(this.id, host, fingerprint);
  }
  async untrustCertificate(host, fingerprint) {
    return this.browserViewService.untrustCertificate(this.id, host, fingerprint);
  }
  async deleteHistory(entryIds) {
    if (entryIds === void 0) {
      this.history.clear();
    } else {
      for (const id of entryIds) {
        this.history.entries.delete(id);
      }
    }
    return this.browserViewService.deleteBrowserHistory(this.id, entryIds);
  }
  async setPermissions(origin, grants) {
    this.permissions.setMany(origin, grants);
    return this.browserViewService.setPermissions(this.id, origin, grants);
  }
  async selectDevice(requestId, deviceId) {
    return this.browserViewService.selectDevice(this.id, requestId, deviceId);
  }
  /**
   * @param forceApply When true, the IPC call is made even if the local cached zoom index
   * already matches the requested value. Pass true after cross-document navigation because
   * Chromium resets the zoom to its per-origin default, making the cache stale.
   */
  async setBrowserZoomIndex(zoomIndex, forceApply = false) {
    const clamped = Math.max(0, Math.min(zoomIndex, browserZoomFactors.length - 1));
    if (!forceApply && clamped === this._browserZoomIndex) {
      return;
    }
    this._browserZoomIndex = clamped;
    await this.browserViewService.setBrowserZoomIndex(this.id, this._browserZoomIndex);
    this._onDidChangeZoom.fire();
  }
  async zoomIn() {
    if (!this.canZoomIn) {
      return;
    }
    await this.setBrowserZoomIndex(this._browserZoomIndex + 1);
    if (this._zoomHost) {
      this.zoomService.setHostZoomIndex(this._zoomHost, this._browserZoomIndex, this._isEphemeral);
    }
  }
  async zoomOut() {
    if (!this.canZoomOut) {
      return;
    }
    await this.setBrowserZoomIndex(this._browserZoomIndex - 1);
    if (this._zoomHost) {
      this.zoomService.setHostZoomIndex(this._zoomHost, this._browserZoomIndex, this._isEphemeral);
    }
  }
  async resetZoom() {
    const defaultIndex = this.zoomService.getEffectiveZoomIndex(void 0, false);
    await this.setBrowserZoomIndex(defaultIndex);
    if (this._zoomHost) {
      this.zoomService.setHostZoomIndex(this._zoomHost, defaultIndex, this._isEphemeral);
    }
  }
  async getConsoleLogs() {
    return this.browserViewService.getConsoleLogs(this.id);
  }
  async toggleElementSelection(enabled, options) {
    return this.browserViewService.toggleElementSelection(this.id, enabled, options);
  }
  async setElementComments(update) {
    return this.browserViewService.setElementComments(this.id, update);
  }
  async toggleAreaSelection(enabled) {
    return this.browserViewService.toggleAreaSelection(this.id, enabled);
  }
  get onDidSelectElement() {
    return this.browserViewService.onDynamicDidSelectElement(this.id);
  }
  get onDidRemoveElementComment() {
    return this.browserViewService.onDynamicDidRemoveElementComment(this.id);
  }
  get onDidChangeElementSelectionState() {
    return this.browserViewService.onDynamicDidChangeElementSelectionState(this.id);
  }
  get onDidPickArea() {
    return this.browserViewService.onDynamicDidPickArea(this.id);
  }
  get onDidChangeAreaSelectionActive() {
    return this.browserViewService.onDynamicDidChangeAreaSelectionActive(this.id);
  }
  async setDevice(device) {
    if (!structuralEquals(this._device, device)) {
      this._device = device;
      this._onDidChangeDevice.fire(device);
    }
    return this.browserViewService.setDeviceEmulation(this.id, device);
  }
  async setSharedWithAgent(shared) {
    if (shared) {
      if (this._url) {
        try {
          const uri = URI.parse(this._url);
          if (!this.agentNetworkFilterService.isUriAllowed(uri)) {
            await this.dialogService.info(
              localize("browserView.shareBlocked.title", "Cannot Share with Agent"),
              this.agentNetworkFilterService.formatError(uri)
            );
            return false;
          }
        } catch {
        }
      }
      const storedChoice = this.storageService.getBoolean(BrowserViewModel.SHARE_DONT_ASK_KEY, StorageScope.PROFILE);
      if (!storedChoice) {
        const result = await this.dialogService.confirm({
          type: "question",
          title: localize("browserView.shareWithAgent.title", "Share with Agent?"),
          message: localize("browserView.shareWithAgent.message", "Share this browser page with the agent?"),
          detail: localize(
            "browserView.shareWithAgent.detail",
            "The agent will be able to read and modify browser content and saved data, including cookies."
          ),
          primaryButton: localize("browserView.shareWithAgent.allow", "&&Allow"),
          cancelButton: localize("browserView.shareWithAgent.deny", "Deny"),
          checkbox: { label: localize("browserView.shareWithAgent.dontAskAgain", "Don't ask again"), checked: false }
        });
        if (result.confirmed && result.checkboxChecked) {
          this.storageService.store(BrowserViewModel.SHARE_DONT_ASK_KEY, result.confirmed, StorageScope.PROFILE, StorageTarget.USER);
        }
        this.telemetryService.publicLog2(
          "integratedBrowser.shareWithAgent",
          {
            shared: result.confirmed,
            dontAskAgain: result.checkboxChecked ?? false
          }
        );
        if (!result.confirmed) {
          return false;
        }
      } else {
        this.telemetryService.publicLog2(
          "integratedBrowser.shareWithAgent",
          {
            shared: true,
            dontAskAgain: true
          }
        );
      }
      await this.playwrightService.startTrackingPage(this.id);
      this._setSharedWithAgent(true);
    } else {
      await this.playwrightService.stopTrackingPage(this.id);
      this._setSharedWithAgent(false);
    }
    return true;
  }
  _setSharedWithAgent(isShared) {
    if (isShared !== this._sharedWithAgent) {
      this._sharedWithAgent = isShared;
      this._onDidChangeSharingState.fire(this.sharingState);
    }
  }
  _reloadHistoryEntries(key) {
    const raw = this.storageService.get(key, StorageScope.APPLICATION);
    this.history.entries.hydrate(parseHistorySnapshot(raw));
  }
  _reloadHistoryFavicons(key) {
    const raw = this.storageService.get(key, StorageScope.APPLICATION);
    this.history.favicons.hydrate(parseHistorySnapshot(raw));
  }
  /**
   * Log navigation telemetry event
   */
  logNavigationTelemetry(navigationType, url) {
    let localhost;
    try {
      localhost = isLocalhostAuthority(new URL(url).host);
    } catch {
      localhost = false;
    }
    this.telemetryService.publicLog2(
      "integratedBrowser.navigation",
      {
        navigationType,
        isLocalhost: localhost
      }
    );
  }
  dispose() {
    this._onWillDispose.fire();
    if (this._sharedWithAgent) {
      void this.playwrightService.stopTrackingPage(this.id);
    }
    void this.browserViewService.destroyBrowserView(this.id);
    super.dispose();
  }
};
BrowserViewModel.SHARE_DONT_ASK_KEY = "browserView.shareWithAgent.dontAskAgain";
BrowserViewModel = __decorateClass([
  __decorateParam(4, IBrowserViewWorkbenchService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, IPlaywrightService),
  __decorateParam(7, IDialogService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, IBrowserZoomService),
  __decorateParam(10, IAgentNetworkFilterService),
  __decorateParam(11, ILogService)
], BrowserViewModel);
export {
  BrowserViewModel,
  BrowserViewSharingState,
  IBrowserViewCDPService,
  IBrowserViewWorkbenchService,
  browserViewUrlMatches
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBzdHJ1Y3R1cmFsRXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDRFBFdmVudCwgQ0RQUmVxdWVzdCwgQ0RQUmVzcG9uc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vY2RwL3R5cGVzLmpzJztcbmltcG9ydCB7IElUdW5uZWxQcm94eUluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90dW5uZWwvY29tbW9uL3R1bm5lbFByb3h5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVBsYXl3cmlnaHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL3BsYXl3cmlnaHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7XG5cdEJyb3dzZXJIaXN0b3J5U3RvcmUsXG5cdElTZXJpYWxpemVkQnJvd3NlckZhdmljb25zU25hcHNob3QsXG5cdElTZXJpYWxpemVkQnJvd3Nlckhpc3RvcnlFbnRyaWVzU25hcHNob3QsXG59IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VySGlzdG9yeS5qcyc7XG5pbXBvcnQge1xuXHRCcm93c2VyUGVybWlzc2lvblN0b3JlLFxuXHRJUGVybWlzc2lvbkNhdGVnb3J5U3RhdGUsXG59IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyUGVybWlzc2lvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBCcm93c2VyRWRpdG9ySW5wdXQgfSBmcm9tICcuL2Jyb3dzZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgdHlwZSB7IFByZWZlcnJlZEdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7XG5cdElCcm93c2VyVmlld0JvdW5kcyxcblx0SUJyb3dzZXJWaWV3TmF2aWdhdGlvbkV2ZW50LFxuXHRJQnJvd3NlclZpZXdMb2FkaW5nRXZlbnQsXG5cdElCcm93c2VyVmlld0xvYWRFcnJvcixcblx0SUJyb3dzZXJWaWV3Rm9jdXNFdmVudCxcblx0SUJyb3dzZXJWaWV3S2V5RG93bkV2ZW50LFxuXHRJQnJvd3NlclZpZXdUaXRsZUNoYW5nZUV2ZW50LFxuXHRJQnJvd3NlclZpZXdGYXZpY29uQ2hhbmdlRXZlbnQsXG5cdElCcm93c2VyVmlld0RldlRvb2xzU3RhdGVFdmVudCxcblx0SUJyb3dzZXJWaWV3U2VydmljZSxcblx0QnJvd3NlclZpZXdTdG9yYWdlU2NvcGUsXG5cdElCcm93c2VyVmlld0NhcHR1cmVTY3JlZW5zaG90T3B0aW9ucyxcblx0SUJyb3dzZXJWaWV3RmluZEluUGFnZU9wdGlvbnMsXG5cdElCcm93c2VyVmlld0ZpbmRJblBhZ2VSZXN1bHQsXG5cdElCcm93c2VyVmlld1Zpc2liaWxpdHlFdmVudCxcblx0SUJyb3dzZXJWaWV3Q2VydGlmaWNhdGVFcnJvcixcblx0SUVsZW1lbnREYXRhLFxuXHRJQnJvd3NlckVsZW1lbnRDb21tZW50c1VwZGF0ZSxcblx0SUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucyxcblx0SUJyb3dzZXJWaWV3T3duZXIsXG5cdElCcm93c2VyVmlld09wZW5PcHRpb25zLFxuXHRJQnJvd3NlclZpZXdSZWN0LFxuXHRicm93c2VyWm9vbURlZmF1bHRJbmRleCxcblx0YnJvd3Nlclpvb21GYWN0b3JzLFxuXHRJQnJvd3NlclZpZXdTdGF0ZSxcblx0SUJyb3dzZXJEZXZpY2VQcm9maWxlLFxuXHRJQnJvd3NlclZpZXdQZXJtaXNzaW9uUmVxdWVzdEV2ZW50LFxuXHRJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25TdGF0ZSxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgaXNMb2NhbGhvc3RBdXRob3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3RydXN0ZWREb21haW5zLmpzJztcbmltcG9ydCB7IElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmV0d29ya0ZpbHRlci9jb21tb24vbmV0d29ya0ZpbHRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQnJvd3Nlclpvb21TZXJ2aWNlIH0gZnJvbSAnLi9icm93c2VyWm9vbVNlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZSB7XG5cdC8qKiBUb29scyBhcmUgYXZhaWxhYmxlIGFuZCB0aGUgcGFnZSBpcyBzaGFyZWQgd2l0aCB0aGUgYWdlbnQuICovXG5cdFNoYXJlZCA9ICdzaGFyZWQnLFxuXHQvKiogVG9vbHMgYXJlIGF2YWlsYWJsZSBidXQgdGhlIHBhZ2UgaXMgbm90IHNoYXJlZC4gKi9cblx0Tm90U2hhcmVkID0gJ25vdFNoYXJlZCcsXG5cdC8qKiBCcm93c2VyIHRvb2xzIGFyZSBkaXNhYmxlZCBcdTIwMTQgc2hhcmluZyBpcyBub3QgcG9zc2libGUuICovXG5cdFVuYXZhaWxhYmxlID0gJ3VuYXZhaWxhYmxlJyxcbn1cblxuLyoqIFdoZXRoZXIgYSBicm93c2VyIFVSTCBiZWxvbmdzIHRvIHRoZSBzYW1lIGRlc3RpbmF0aW9uIGhvc3QgYXMgdGhlIHRhcmdldCBVUkwuICovXG5leHBvcnQgZnVuY3Rpb24gYnJvd3NlclZpZXdVcmxNYXRjaGVzKGNhbmRpZGF0ZVVybDogc3RyaW5nIHwgdW5kZWZpbmVkLCB0YXJnZXRVcmw6IHN0cmluZywgaW5jbHVkZUJsYW5rID0gZmFsc2UpOiBib29sZWFuIHtcblx0Y29uc3QgdGFyZ2V0ID0gVVJMLnBhcnNlKHRhcmdldFVybCk7XG5cdGlmICghdGFyZ2V0IHx8ICh0YXJnZXQucHJvdG9jb2wgIT09ICdmaWxlOicgJiYgIXRhcmdldC5ob3N0KSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoaW5jbHVkZUJsYW5rICYmICghY2FuZGlkYXRlVXJsIHx8IGNhbmRpZGF0ZVVybCA9PT0gJ2Fib3V0OmJsYW5rJykpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGNvbnN0IGNhbmRpZGF0ZSA9IFVSTC5wYXJzZShjYW5kaWRhdGVVcmwgPz8gJycpO1xuXHRyZXR1cm4gY2FuZGlkYXRlPy5ob3N0ID09PSB0YXJnZXQuaG9zdCB8fFxuXHRcdCh0YXJnZXQucHJvdG9jb2wgPT09ICdmaWxlOicgJiYgY2FuZGlkYXRlPy5wcm90b2NvbCA9PT0gJ2ZpbGU6JykgfHxcblx0XHQhIShjYW5kaWRhdGU/Lmhvc3QgJiYgdGFyZ2V0Lmhvc3QgJiYgKFxuXHRcdFx0Y2FuZGlkYXRlLmhvc3QuZW5kc1dpdGgoJy4nICsgdGFyZ2V0Lmhvc3QpIHx8XG5cdFx0XHR0YXJnZXQuaG9zdC5lbmRzV2l0aCgnLicgKyBjYW5kaWRhdGUuaG9zdClcblx0XHQpKTtcbn1cblxuLyoqIEV4dHJhY3RzIHRoZSBob3N0IGZyb20gYSBVUkwgc3RyaW5nIGZvciB6b29tIHRyYWNraW5nIHB1cnBvc2VzLiAqL1xuZnVuY3Rpb24gcGFyc2Vab29tSG9zdCh1cmw6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHBhcnNlZCA9IFVSTC5wYXJzZSh1cmwpO1xuXHRpZiAoIXBhcnNlZD8uaG9zdCB8fCAocGFyc2VkLnByb3RvY29sICE9PSAnaHR0cDonICYmIHBhcnNlZC5wcm90b2NvbCAhPT0gJ2h0dHBzOicpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gcGFyc2VkLmhvc3Q7XG59XG5cbmZ1bmN0aW9uIHBhcnNlSGlzdG9yeVNuYXBzaG90PFQ+KHJhdzogc3RyaW5nIHwgdW5kZWZpbmVkKTogVCB8IHVuZGVmaW5lZCB7XG5cdGlmICghcmF3KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHR0cnkge1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBUO1xuXHRcdGlmICghcGFyc2VkIHx8IHR5cGVvZiBwYXJzZWQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gcGFyc2VkO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbnR5cGUgSW50ZWdyYXRlZEJyb3dzZXJOYXZpZ2F0aW9uRXZlbnQgPSB7XG5cdG5hdmlnYXRpb25UeXBlOiAndXJsSW5wdXQnIHwgJ3NlYXJjaElucHV0JyB8ICdnb0JhY2snIHwgJ2dvRm9yd2FyZCcgfCAncmVsb2FkJztcblx0aXNMb2NhbGhvc3Q6IGJvb2xlYW47XG59O1xuXG4vKipcbiAqIFRvIGJlIHVzZWQgaW4gdGVsZW1ldHJ5LiBUaGlzIGlzIHRoZSAgc291cmNlIGZvciBhbiBhZGRyZXNzLWJhci1pbml0aWF0ZWQgbmF2aWdhdGlvbjpcbiAqIHdoZXRoZXIgdGhlIHVzZXIgdHlwZWQgYSBVUkwgb3IgcmFuIGEgd2ViIHNlYXJjaC4gRGVmYXVsdHMgdG8gYCd1cmxJbnB1dCdgIHdoZW4gb21pdHRlZC5cbiAqL1xuZXhwb3J0IHR5cGUgQnJvd3Nlck5hdmlnYXRpb25Tb3VyY2UgPSAndXJsSW5wdXQnIHwgJ3NlYXJjaElucHV0JztcblxuLyoqXG4gKiBPcHRpb25zIGZvciBhIG5hdmlnYXRpb24gaW5pdGlhdGVkIHZpYSB7QGxpbmsgSUJyb3dzZXJWaWV3TW9kZWwubG9hZFVSTH1cbiAqIChhbmQge0BsaW5rIEJyb3dzZXJFZGl0b3JJbnB1dC5uYXZpZ2F0ZX0pLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElOYXZpZ2F0ZU9wdGlvbnMge1xuXHQvKipcblx0ICogU291cmNlIG9mIHRoZSBuYXZpZ2F0aW9uLCBmb3IgdGVsZW1ldHJ5IHB1cnBvc2VzLiBEZWZhdWx0cyB0byBgJ3VybElucHV0J2Agd2hlbiBvbWl0dGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgc291cmNlPzogQnJvd3Nlck5hdmlnYXRpb25Tb3VyY2U7XG59XG5cbnR5cGUgSW50ZWdyYXRlZEJyb3dzZXJOYXZpZ2F0aW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdG5hdmlnYXRpb25UeXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSG93IHRoZSBuYXZpZ2F0aW9uIHdhcyB0cmlnZ2VyZWQnIH07XG5cdGlzTG9jYWxob3N0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciB0aGUgVVJMIGlzIGEgbG9jYWxob3N0IGFkZHJlc3MnIH07XG5cdG93bmVyOiAna3ljdXRsZXInO1xuXHRjb21tZW50OiAnVHJhY2tzIG5hdmlnYXRpb24gcGF0dGVybnMgaW4gaW50ZWdyYXRlZCBicm93c2VyJztcbn07XG5cblxudHlwZSBJbnRlZ3JhdGVkQnJvd3NlclNoYXJlV2l0aEFnZW50RXZlbnQgPSB7XG5cdHNoYXJlZDogYm9vbGVhbjtcblx0ZG9udEFza0FnYWluOiBib29sZWFuO1xufTtcblxudHlwZSBJbnRlZ3JhdGVkQnJvd3NlclNoYXJlV2l0aEFnZW50Q2xhc3NpZmljYXRpb24gPSB7XG5cdHNoYXJlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGNvbnRlbnQgd2FzIHNoYXJlZCB3aXRoIHRoZSBhZ2VudCcgfTtcblx0ZG9udEFza0FnYWluOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciB0aGUgdXNlciBjaG9zZSB0byBub3QgYmUgYXNrZWQgYWdhaW4nIH07XG5cdG93bmVyOiAna3ljdXRsZXInO1xuXHRjb21tZW50OiAnVHJhY2tzIHVzZXIgY2hvaWNlcyBhcm91bmQgc2hhcmluZyBicm93c2VyIGNvbnRlbnQgd2l0aCBhZ2VudHMnO1xufTtcblxudHlwZSBJbnRlZ3JhdGVkQnJvd3NlckFkZEVsZW1lbnRUb0NoYXRTdGFydEV2ZW50ID0ge307XG5cbnR5cGUgSW50ZWdyYXRlZEJyb3dzZXJBZGRFbGVtZW50VG9DaGF0U3RhcnRDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdqcnVhbGVzJztcblx0Y29tbWVudDogJ1RoZSB1c2VyIGluaXRpYXRlZCBhbiBBZGQgRWxlbWVudCB0byBDaGF0IGFjdGlvbiBpbiBJbnRlZ3JhdGVkIEJyb3dzZXIuJztcbn07XG5cbi8qKlxuICogVmlldyBzdGF0ZSBzdG9yZWQgaW4gZWRpdG9yIG9wdGlvbnMgd2hlbiBvcGVuaW5nIGEgYnJvd3NlciB2aWV3LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElCcm93c2VyRWRpdG9yVmlld1N0YXRlIHtcblx0cmVhZG9ubHkgdXJsPzogc3RyaW5nO1xuXHRyZWFkb25seSB0aXRsZT86IHN0cmluZztcblx0cmVhZG9ubHkgZmF2aWNvbj86IHN0cmluZztcblxuXHQvKipcblx0ICogV2hlbiB0cnVlLCBpbmRpY2F0ZXMgdGhhdCB0aGlzIGJyb3dzZXIgdGFiIHdhcyBvcGVuZWQgdmlhIHRoZSBsb2NhbGhvc3Rcblx0ICogbGluayBvcGVuZXIgd2hpbGUgdGhlIHVzZXIgaGFzIG5vdCBleHBsaWNpdGx5IGNvbmZpZ3VyZWQgdGhlIHNldHRpbmdcblx0ICogKGkuZS4gdGhlIGRlZmF1bHQgdmFsdWUgd2FzIHVzZWQpLiBUaGlzIGlzIGEgdHJhbnNpZW50IGZsYWcgYW5kIGlzIG5vdFxuXHQgKiBzZXJpYWxpemVkLlxuXHQgKi9cblx0cmVhZG9ubHkgaXNEZWZhdWx0TGlua09wZW4/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY29uc3QgSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlPignYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlJyk7XG5cbi8qKlxuICogQSBmaWx0ZXIgdGhhdCBjb250ZXh0dWFsbHkgcmVzdHJpY3RzIHRoZSBicm93c2VyIHZpZXdzIHJldHVybmVkIGJ5XG4gKiB7QGxpbmsgSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZS5nZXRDb250ZXh0dWFsQnJvd3NlclZpZXdzfS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQnJvd3NlclZpZXdDb250ZXh0dWFsRmlsdGVyIHtcblx0LyoqXG5cdCAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBnaXZlbiBicm93c2VyIHZpZXcgc2hvdWxkIGJlIHBhcnQgb2YgdGhlXG5cdCAqIGNvbnRleHR1YWwgc2V0LlxuXHQgKi9cblx0aW5jbHVkZShpbnB1dDogQnJvd3NlckVkaXRvcklucHV0LCBjb250ZXh0OiBJQnJvd3NlclZpZXdGaWx0ZXJDb250ZXh0KTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogT3B0aW9uYWwgZXZlbnQgdGhhdCBmaXJlcyB3aGVuIHRoZSByZXN1bHQgb2Yge0BsaW5rIGluY2x1ZGV9IG1heSBoYXZlXG5cdCAqIGNoYW5nZWQgZm9yIG9uZSBvciBtb3JlIHZpZXdzIChlLmcuIHRoZSBhY3RpdmUgc2Vzc2lvbiBjaGFuZ2VkKS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlPzogRXZlbnQ8dm9pZD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJWaWV3RmlsdGVyQ29udGV4dCB7XG5cdC8qKlxuXHQgKiBUaGUgc2Vzc2lvbiAqcmVzb3VyY2UqIFVSSSBzdHJpbmcgKGBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKClgKSBvZiB0aGVcblx0ICogcmVsZXZhbnQgc2Vzc2lvbiwgaWYgYW55LiBUaGlzIGlzIHRoZSBzYW1lIHZhbHVlIHN0b3JlZCBpblxuXHQgKiB7QGxpbmsgSUJyb3dzZXJWaWV3T3duZXIuc2Vzc2lvbklkfSBcdTIwMTQgbm90IHRoZSBjb21wb3NpdGVcblx0ICogYElTZXNzaW9uLnNlc3Npb25JZGAgKGBwcm92aWRlcklkOnJlc291cmNlYCkuXG5cdCAqL1xuXHRhY3RpdmVTZXNzaW9uSWQ/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQSBoYW5kbGVyIHRoYXQgZGVjaWRlcyB3aGV0aGVyIGFuIGVkaXRvciBzaG91bGQgYmUgb3BlbmVkIGZvciBhIG5ld2x5XG4gKiBjcmVhdGVkIGJyb3dzZXIgdmlldy4gUmVnaXN0ZXJlZCB2aWFcbiAqIHtAbGluayBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLnJlZ2lzdGVyT3BlbkhhbmRsZXJ9LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElCcm93c2VyVmlld09wZW5IYW5kbGVyIHtcblx0LyoqXG5cdCAqIENhbGxlZCBiZWZvcmUgYW4gZWRpdG9yIGlzIG9wZW5lZCBmb3IgYSBuZXdseSBjcmVhdGVkIGJyb3dzZXIgdmlldy5cblx0ICogUmV0dXJuIGBmYWxzZWAgdG8gcHJldmVudCB0aGUgZWRpdG9yIGZyb20gYmVpbmcgb3BlbmVkLiBBIHZpZXcgaXMgb3BlbmVkXG5cdCAqIG9ubHkgd2hlbiBldmVyeSByZWdpc3RlcmVkIGhhbmRsZXIgYWxsb3dzIGl0LlxuXHQgKi9cblx0c2hvdWxkT3BlbkVkaXRvcihpbnB1dDogQnJvd3NlckVkaXRvcklucHV0LCBvd25lcjogSUJyb3dzZXJWaWV3T3duZXIsIG9wZW5PcHRpb25zOiBJQnJvd3NlclZpZXdPcGVuT3B0aW9ucyk6IGJvb2xlYW47XG59XG5cbi8qKlxuICogV29ya2JlbmNoLWxldmVsIHNlcnZpY2UgZm9yIGJyb3dzZXIgdmlld3MgdGhhdCBwcm92aWRlcyBtb2RlbC1iYXNlZCBhY2Nlc3MgdG8gYnJvd3NlciB2aWV3cy5cbiAqIFRoaXMgc2VydmljZSBtYW5hZ2VzIGJyb3dzZXIgdmlldyBtb2RlbHMgdGhhdCBwcm94eSB0byB0aGUgbWFpbiBwcm9jZXNzIGJyb3dzZXIgdmlldyBzZXJ2aWNlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqIFJldHVybnMgdHJ1ZSBpZiB0aGUgcmVtb3RlIHByb3h5IGlzIGVuYWJsZWQ7IGkuZS4gd2UgYXJlIGluIGEgcmVtb3RlIHdvcmtzcGFjZSBhbmQgdGhlIHNldHRpbmcgaXMgZW5hYmxlZC4gKi9cblx0d2lsbFVzZVJlbW90ZVByb3h5KCk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgdHVubmVsLXByb3h5IGNyZWRlbnRpYWxzIHJlc29sdmVkIGJ5IHRoZSB3aW5kb3cncyBsb2NhbCBub2RlXG5cdCAqIGV4dGVuc2lvbiBob3N0ICh3aGljaCBob3N0cyB0aGUgSFRUUFMgdHVubmVsIHByb3h5KSwgb3IgYHVuZGVmaW5lZGAgdG9cblx0ICogY2xlYXIgdGhlbS4gRm9sZGVkIGludG8gdGhlIHdpbmRvdyBjb25maWd1cmF0aW9uIHNlbnQgdG8gdGhlIG1haW5cblx0ICogcHJvY2VzcyBzbyB0aGlzIHdpbmRvdydzIHJlbW90ZSBicm93c2VyIHZpZXdzIChyZSlhcHBseSB0aGUgcHJveHkuXG5cdCAqL1xuXHRzZXRSZW1vdGVQcm94eUluZm8oaW5mbzogSVR1bm5lbFByb3h5SW5mbyB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW4gdGhlIHNldCBvZiBrbm93biBicm93c2VyIHZpZXdzIGNoYW5nZXMsIG9yIGEgbW9kZWwgaXMgY3JlYXRlZCBmb3IgYW4gZXhpc3RpbmcgaW5wdXQuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUJyb3dzZXJWaWV3czogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgc2hhcmluZyBicm93c2VyIHBhZ2VzIHdpdGggdGhlIGFnZW50IGlzIGN1cnJlbnRseSBhdmFpbGFibGVcblx0ICogKGNoYXQgZW5hYmxlZCwgYWdlbnQgbW9kZSBlbmFibGVkLCBicm93c2VyIHRvb2xzIHNldHRpbmcgZW5hYmxlZCwgZXRjLikuXG5cdCAqL1xuXHRyZWFkb25seSBpc1NoYXJpbmdBdmFpbGFibGU6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW4ge0BsaW5rIGlzU2hhcmluZ0F2YWlsYWJsZX0gY2hhbmdlcy5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2hhcmluZ0F2YWlsYWJsZTogRXZlbnQ8Ym9vbGVhbj47XG5cblx0LyoqXG5cdCAqIEdldCBhbGwga25vd24gYnJvd3NlciB2aWV3cy5cblx0ICovXG5cdGdldEtub3duQnJvd3NlclZpZXdzKCk6IE1hcDxzdHJpbmcsIEJyb3dzZXJFZGl0b3JJbnB1dD47XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVyIGEgY29udGV4dHVhbCBmaWx0ZXIgdGhhdCByZXN0cmljdHMgd2hpY2ggYnJvd3NlciB2aWV3cyBhcmVcblx0ICogcmV0dXJuZWQgYnkge0BsaW5rIGdldENvbnRleHR1YWxCcm93c2VyVmlld3N9LiBBIHZpZXcgaXMgcGFydCBvZiB0aGVcblx0ICogY29udGV4dHVhbCBzZXQgb25seSB3aGVuIGV2ZXJ5IHJlZ2lzdGVyZWQgZmlsdGVyIGluY2x1ZGVzIGl0LlxuXHQgKi9cblx0cmVnaXN0ZXJDb250ZXh0dWFsRmlsdGVyKGZpbHRlcjogSUJyb3dzZXJWaWV3Q29udGV4dHVhbEZpbHRlcik6IElEaXNwb3NhYmxlO1xuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGJyb3dzZXIgdmlld3MgdGhhdCBwYXNzIGFsbCByZWdpc3RlcmVkIGNvbnRleHR1YWwgZmlsdGVycy4gV2hlblxuXHQgKiBubyBmaWx0ZXJzIGFyZSByZWdpc3RlcmVkIHRoaXMgaXMgZXF1aXZhbGVudCB0byB7QGxpbmsgZ2V0S25vd25Ccm93c2VyVmlld3N9LlxuXHQgKlxuXHQgKiBAcGFyYW0gY29udGV4dCBUaGUgZmlsdGVyIGNvbnRleHQgdG8gdXNlIChvciBpbmZlcnJlZCBpZiBub3QgcHJvdmlkZWQpXG5cdCAqL1xuXHRnZXRDb250ZXh0dWFsQnJvd3NlclZpZXdzKGNvbnRleHQ/OiBJQnJvd3NlclZpZXdGaWx0ZXJDb250ZXh0KTogTWFwPHN0cmluZywgQnJvd3NlckVkaXRvcklucHV0PjtcblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgcHJlZmVycmVkIGVkaXRvciBncm91cCBmb3Igb3BlbmluZyBhbiBpbnRlZ3JhdGVkIGJyb3dzZXJcblx0ICogZWRpdG9yLiBIb25vcnMgdGhlIGB3b3JrYmVuY2guYnJvd3Nlci5uZXdUYWJQbGFjZW1lbnRgIHNldHRpbmcsIHJvdXRpbmcgbmV3XG5cdCAqIHRhYnMgaW50byBhIGRlZGljYXRlZCAobG9ja2VkKSBzaWRlIGdyb3VwIG9yIGF1eGlsaWFyeSB3aW5kb3cgd2hlblxuXHQgKiBjb25maWd1cmVkLiBXaGVuIHRoZSB3b3JrYmVuY2ggZm9yY2VzIGVkaXRvcnMgaW50byBhIG1vZGFsIHBhcnRcblx0ICogKGB3b3JrYmVuY2guZWRpdG9yLnVzZU1vZGFsOiAnYWxsJ2ApLCBicm93c2VyIG9wZW5zIHRoYXQgdGFyZ2V0IHRoZSBhY3RpdmVcblx0ICogZ3JvdXAgKG9yIGxlYXZlIGl0IHVuc3BlY2lmaWVkKSBhcmVcblx0ICogcmVkaXJlY3RlZCB0byB0aGUgbWFpbiBlZGl0b3IgYXJlYSBzbyB0aGUgYnJvd3NlciBkb2NrcyBpbnN0ZWFkIG9mIG9wZW5pbmdcblx0ICogYXMgYSBtb2RhbCBvdmVybGF5LiBFeHBsaWNpdCBwbGFjZW1lbnRzIChzaWRlIGdyb3VwLCBhdXhpbGlhcnkgd2luZG93LCBhXG5cdCAqIHNwZWNpZmljIGdyb3VwKSBhcmUgbGVmdCB1bnRvdWNoZWQuXG5cdCAqL1xuXHRnZXRQcmVmZXJyZWRHcm91cChwcmVmZXJyZWRHcm91cD86IFByZWZlcnJlZEdyb3VwKTogUHJvbWlzZTxQcmVmZXJyZWRHcm91cCB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVyIGEgaGFuZGxlciB0aGF0IGRlY2lkZXMgd2hldGhlciBhbiBlZGl0b3Igc2hvdWxkIGJlIG9wZW5lZCBmb3IgYVxuXHQgKiBuZXdseSBjcmVhdGVkIGJyb3dzZXIgdmlldy4gVGhlIGVkaXRvciBpcyBvcGVuZWQgb25seSB3aGVuIGV2ZXJ5XG5cdCAqIHJlZ2lzdGVyZWQgaGFuZGxlciBhbGxvd3MgaXQuXG5cdCAqL1xuXHRyZWdpc3Rlck9wZW5IYW5kbGVyKGhhbmRsZXI6IElCcm93c2VyVmlld09wZW5IYW5kbGVyKTogSURpc3Bvc2FibGU7XG5cblx0LyoqXG5cdCAqIEdldCBhbiBleGlzdGluZyBicm93c2VyIHZpZXcgZm9yIHRoZSBnaXZlbiBJRCwgb3IgY3JlYXRlIGEgbmV3IG9uZSBpZiBpdCBkb2Vzbid0IGV4aXN0LlxuXHQgKiBUaGUgdW5kZXJseWluZyBicm93c2VyIHZpZXcgaXMgbm90IGNyZWF0ZWQgdW50aWwgdGhlIGVkaXRvciBpcyBvcGVuZWQgb3IgdGhlIG1vZGVsIGlzIHJlc29sdmVkLlxuXHQgKi9cblx0Z2V0T3JDcmVhdGVMYXp5KGlkOiBzdHJpbmcsIGluaXRpYWxTdGF0ZT86IElCcm93c2VyRWRpdG9yVmlld1N0YXRlKTogQnJvd3NlckVkaXRvcklucHV0O1xuXG5cdC8qKlxuXHQgKiBDbGVhciBhbGwgc3RvcmFnZSBkYXRhIGZvciB0aGUgZ2xvYmFsIGJyb3dzZXIgc2Vzc2lvblxuXHQgKi9cblx0Y2xlYXJHbG9iYWxTdG9yYWdlKCk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIENsZWFyIGFsbCBzdG9yYWdlIGRhdGEgZm9yIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBicm93c2VyIHNlc3Npb25cblx0ICovXG5cdGNsZWFyV29ya3NwYWNlU3RvcmFnZSgpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgY29uc3QgSUJyb3dzZXJWaWV3Q0RQU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQnJvd3NlclZpZXdDRFBTZXJ2aWNlPignYnJvd3NlclZpZXdDRFBTZXJ2aWNlJyk7XG5cbi8qKlxuICogV29ya2JlbmNoLWxldmVsIHNlcnZpY2UgZm9yIG1hbmFnaW5nIENEUCAoQ2hyb21lIERldlRvb2xzIFByb3RvY29sKSBzZXNzaW9uc1xuICogYWdhaW5zdCBicm93c2VyIHZpZXdzLiBIYW5kbGVzIGdyb3VwIGxpZmVjeWNsZSBhbmQgd2luZG93IElEIHJlc29sdXRpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJWaWV3Q0RQU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IENEUCBncm91cCBmb3IgYSBicm93c2VyIHZpZXcuXG5cdCAqIFRoZSB3aW5kb3cgSUQgaXMgcmVzb2x2ZWQgZnJvbSB0aGUgZWRpdG9yIGdyb3VwIGNvbnRhaW5pbmcgdGhlIGJyb3dzZXIuXG5cdCAqIEBwYXJhbSBicm93c2VySWQgVGhlIGJyb3dzZXIgdmlldyBpZGVudGlmaWVyLlxuXHQgKiBAcmV0dXJucyBUaGUgSUQgb2YgdGhlIG5ld2x5IGNyZWF0ZWQgZ3JvdXAuXG5cdCAqL1xuXHRjcmVhdGVTZXNzaW9uR3JvdXAoYnJvd3NlcklkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz47XG5cblx0LyoqIERlc3Ryb3kgYSBDRFAgZ3JvdXAuICovXG5cdGRlc3Ryb3lTZXNzaW9uR3JvdXAoZ3JvdXBJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKiogU2VuZCBhIENEUCBtZXNzYWdlIHRvIGEgZ3JvdXAuICovXG5cdHNlbmRDRFBNZXNzYWdlKGdyb3VwSWQ6IHN0cmluZywgbWVzc2FnZTogQ0RQUmVxdWVzdCk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqIEZpcmVzIHdoZW4gYSBDRFAgbWVzc2FnZSBpcyByZWNlaXZlZC4gKi9cblx0b25DRFBNZXNzYWdlKGdyb3VwSWQ6IHN0cmluZyk6IEV2ZW50PENEUFJlc3BvbnNlIHwgQ0RQRXZlbnQ+O1xuXG5cdC8qKiBGaXJlcyB3aGVuIGEgQ0RQIGdyb3VwIGlzIGRlc3Ryb3llZC4gKi9cblx0b25EaWREZXN0cm95KGdyb3VwSWQ6IHN0cmluZyk6IEV2ZW50PHZvaWQ+O1xufVxuXG5cbi8qKlxuICogQSBicm93c2VyIHZpZXcgbW9kZWwgdGhhdCByZXByZXNlbnRzIGEgc2luZ2xlIGJyb3dzZXIgdmlldyBpbnN0YW5jZSBpbiB0aGUgd29ya2JlbmNoLlxuICogVGhpcyBtb2RlbCBwcm94aWVzIGNhbGxzIHRvIHRoZSBtYWluIHByb2Nlc3MgYnJvd3NlciB2aWV3IHNlcnZpY2UgdXNpbmcgaXRzIHVuaXF1ZSBJRC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQnJvd3NlclZpZXdNb2RlbCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgb3duZXI6IElCcm93c2VyVmlld093bmVyO1xuXHRyZWFkb25seSB1cmw6IHN0cmluZztcblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZztcblx0cmVhZG9ubHkgZmF2aWNvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzY3JlZW5zaG90OiBWU0J1ZmZlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbG9hZGluZzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZm9jdXNlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgdmlzaWJsZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2FuR29CYWNrOiBib29sZWFuO1xuXHRyZWFkb25seSBpc0RldlRvb2xzT3BlbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2FuR29Gb3J3YXJkOiBib29sZWFuO1xuXHRyZWFkb25seSBlcnJvcjogSUJyb3dzZXJWaWV3TG9hZEVycm9yIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjZXJ0aWZpY2F0ZUVycm9yOiBJQnJvd3NlclZpZXdDZXJ0aWZpY2F0ZUVycm9yIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzdG9yYWdlU2NvcGU6IEJyb3dzZXJWaWV3U3RvcmFnZVNjb3BlO1xuXHRyZWFkb25seSBoaXN0b3J5OiBCcm93c2VySGlzdG9yeVN0b3JlO1xuXHRyZWFkb25seSBwZXJtaXNzaW9uczogQnJvd3NlclBlcm1pc3Npb25TdG9yZTtcblx0cmVhZG9ubHkgc2hhcmluZ1N0YXRlOiBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZTtcblx0cmVhZG9ubHkgaXNSZW1vdGVTZXNzaW9uOiBib29sZWFuO1xuXHRyZWFkb25seSB6b29tRmFjdG9yOiBudW1iZXI7XG5cdHJlYWRvbmx5IGNhblpvb21JbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2FuWm9vbU91dDogYm9vbGVhbjtcblx0cmVhZG9ubHkgZWxlbWVudFNlbGVjdGlvblN0YXRlOiBJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25TdGF0ZTtcblx0cmVhZG9ubHkgaXNBcmVhU2VsZWN0aW9uQWN0aXZlOiBib29sZWFuO1xuXHRyZWFkb25seSBkZXZpY2U6IElCcm93c2VyRGV2aWNlUHJvZmlsZSB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVNoYXJpbmdTdGF0ZTogRXZlbnQ8QnJvd3NlclZpZXdTaGFyaW5nU3RhdGU+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVpvb206IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbldpbGxOYXZpZ2F0ZTogRXZlbnQ8c3RyaW5nPjtcblx0cmVhZG9ubHkgb25EaWROYXZpZ2F0ZTogRXZlbnQ8SUJyb3dzZXJWaWV3TmF2aWdhdGlvbkV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMb2FkaW5nU3RhdGU6IEV2ZW50PElCcm93c2VyVmlld0xvYWRpbmdFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRm9jdXM6IEV2ZW50PElCcm93c2VyVmlld0ZvY3VzRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURldlRvb2xzU3RhdGU6IEV2ZW50PElCcm93c2VyVmlld0RldlRvb2xzU3RhdGVFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkS2V5Q29tbWFuZDogRXZlbnQ8SUJyb3dzZXJWaWV3S2V5RG93bkV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUaXRsZTogRXZlbnQ8SUJyb3dzZXJWaWV3VGl0bGVDaGFuZ2VFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmF2aWNvbjogRXZlbnQ8SUJyb3dzZXJWaWV3RmF2aWNvbkNoYW5nZUV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRGaW5kSW5QYWdlOiBFdmVudDxJQnJvd3NlclZpZXdGaW5kSW5QYWdlUmVzdWx0Pjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudDxJQnJvd3NlclZpZXdWaXNpYmlsaXR5RXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZENsb3NlOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25XaWxsRGlzcG9zZTogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uRGlkU2VsZWN0RWxlbWVudDogRXZlbnQ8SUVsZW1lbnREYXRhPjtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmVFbGVtZW50Q29tbWVudDogRXZlbnQ8c3RyaW5nPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFbGVtZW50U2VsZWN0aW9uU3RhdGU6IEV2ZW50PElCcm93c2VyRWxlbWVudFNlbGVjdGlvblN0YXRlPjtcblx0cmVhZG9ubHkgb25EaWRQaWNrQXJlYTogRXZlbnQ8SUJyb3dzZXJWaWV3UmVjdCB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXJlYVNlbGVjdGlvbkFjdGl2ZTogRXZlbnQ8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGV2aWNlOiBFdmVudDxJQnJvd3NlckRldmljZVByb2ZpbGUgfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlbW90ZVN0YXR1czogRXZlbnQ8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdFBlcm1pc3Npb246IEV2ZW50PElCcm93c2VyVmlld1Blcm1pc3Npb25SZXF1ZXN0RXZlbnQ+O1xuXG5cdGxheW91dChib3VuZHM6IElCcm93c2VyVmlld0JvdW5kcyk6IFByb21pc2U8dm9pZD47XG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD47XG5cdGxvYWRVUkwodXJsOiBzdHJpbmcsIG9wdGlvbnM/OiBJTmF2aWdhdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0Z29CYWNrKCk6IFByb21pc2U8dm9pZD47XG5cdGdvRm9yd2FyZCgpOiBQcm9taXNlPHZvaWQ+O1xuXHRyZWxvYWQoaGFyZD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+O1xuXHR0b2dnbGVEZXZUb29scygpOiBQcm9taXNlPHZvaWQ+O1xuXHRjYXB0dXJlU2NyZWVuc2hvdChvcHRpb25zPzogSUJyb3dzZXJWaWV3Q2FwdHVyZVNjcmVlbnNob3RPcHRpb25zKTogUHJvbWlzZTxWU0J1ZmZlcj47XG5cdGZvY3VzKGZvcmNlPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD47XG5cdGZpbmRJblBhZ2UodGV4dDogc3RyaW5nLCBvcHRpb25zPzogSUJyb3dzZXJWaWV3RmluZEluUGFnZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRzdG9wRmluZEluUGFnZShrZWVwU2VsZWN0aW9uPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD47XG5cdGdldFNlbGVjdGVkVGV4dCgpOiBQcm9taXNlPHN0cmluZz47XG5cdGNsZWFyU3RvcmFnZSgpOiBQcm9taXNlPHZvaWQ+O1xuXHRzZXRTaGFyZWRXaXRoQWdlbnQoc2hhcmVkOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPjtcblx0dHJ1c3RDZXJ0aWZpY2F0ZShob3N0OiBzdHJpbmcsIGZpbmdlcnByaW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXHR1bnRydXN0Q2VydGlmaWNhdGUoaG9zdDogc3RyaW5nLCBmaW5nZXJwcmludDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblx0ZGVsZXRlSGlzdG9yeShlbnRyeUlkcz86IHJlYWRvbmx5IG51bWJlcltdKTogUHJvbWlzZTx2b2lkPjtcblx0c2V0UGVybWlzc2lvbnMob3JpZ2luOiBzdHJpbmcsIGdyYW50czogcmVhZG9ubHkgSVBlcm1pc3Npb25DYXRlZ29yeVN0YXRlW10pOiBQcm9taXNlPHZvaWQ+O1xuXHRzZWxlY3REZXZpY2UocmVxdWVzdElkOiBzdHJpbmcsIGRldmljZUlkOiBzdHJpbmcgfCBudWxsKTogUHJvbWlzZTx2b2lkPjtcblx0em9vbUluKCk6IFByb21pc2U8dm9pZD47XG5cdHpvb21PdXQoKTogUHJvbWlzZTx2b2lkPjtcblx0cmVzZXRab29tKCk6IFByb21pc2U8dm9pZD47XG5cdGdldENvbnNvbGVMb2dzKCk6IFByb21pc2U8c3RyaW5nPjtcblx0dG9nZ2xlRWxlbWVudFNlbGVjdGlvbihlbmFibGVkPzogYm9vbGVhbiwgb3B0aW9ucz86IElCcm93c2VyRWxlbWVudFNlbGVjdGlvbk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRzZXRFbGVtZW50Q29tbWVudHModXBkYXRlOiBJQnJvd3NlckVsZW1lbnRDb21tZW50c1VwZGF0ZSk6IFByb21pc2U8dm9pZD47XG5cdHRvZ2dsZUFyZWFTZWxlY3Rpb24oZW5hYmxlZD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+O1xuXHRzZXREZXZpY2UoZGV2aWNlOiBJQnJvd3NlckRldmljZVByb2ZpbGUgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgY2xhc3MgQnJvd3NlclZpZXdNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQnJvd3NlclZpZXdNb2RlbCB7XG5cdHByaXZhdGUgX3VybDogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgX3RpdGxlOiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBfZmF2aWNvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zY3JlZW5zaG90OiBWU0J1ZmZlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbG9hZGluZzogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9mb2N1c2VkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3Zpc2libGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfaXNEZXZUb29sc09wZW46IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfY2FuR29CYWNrOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2NhbkdvRm9yd2FyZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9lcnJvcjogSUJyb3dzZXJWaWV3TG9hZEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jZXJ0aWZpY2F0ZUVycm9yOiBJQnJvd3NlclZpZXdDZXJ0aWZpY2F0ZUVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zdG9yYWdlU2NvcGU6IEJyb3dzZXJWaWV3U3RvcmFnZVNjb3BlID0gQnJvd3NlclZpZXdTdG9yYWdlU2NvcGUuRXBoZW1lcmFsO1xuXHRwcml2YXRlIF9pc1JlbW90ZVNlc3Npb246IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfaXNFcGhlbWVyYWw6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfem9vbUhvc3Q6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2hhcmVkV2l0aEFnZW50OiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2Jyb3dzZXJab29tSW5kZXg6IG51bWJlciA9IGJyb3dzZXJab29tRGVmYXVsdEluZGV4O1xuXHRwcml2YXRlIF9lbGVtZW50U2VsZWN0aW9uU3RhdGU6IElCcm93c2VyRWxlbWVudFNlbGVjdGlvblN0YXRlID0geyBhY3RpdmU6IGZhbHNlLCBvcHRpb25zOiB7fSB9O1xuXHRwcml2YXRlIF9pc0FyZWFTZWxlY3Rpb25BY3RpdmU6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfZGV2aWNlOiBJQnJvd3NlckRldmljZVByb2ZpbGUgfCB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgaGlzdG9yeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCcm93c2VySGlzdG9yeVN0b3JlKCkpO1xuXHRyZWFkb25seSBwZXJtaXNzaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCcm93c2VyUGVybWlzc2lvblN0b3JlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGV2aWNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyb3dzZXJEZXZpY2VQcm9maWxlIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEZXZpY2U6IEV2ZW50PElCcm93c2VyRGV2aWNlUHJvZmlsZSB8IHVuZGVmaW5lZD4gPSB0aGlzLl9vbkRpZENoYW5nZURldmljZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNoYXJpbmdTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTaGFyaW5nU3RhdGU6IEV2ZW50PEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlPiA9IHRoaXMuX29uRGlkQ2hhbmdlU2hhcmluZ1N0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlWm9vbSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVpvb206IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2Vab29tLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25XaWxsRGlzcG9zZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbE5hdmlnYXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25XaWxsTmF2aWdhdGU6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbldpbGxOYXZpZ2F0ZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBpZDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IG93bmVyOiBJQnJvd3NlclZpZXdPd25lcixcblx0XHRpbml0aWFsU3RhdGU6IElCcm93c2VyVmlld1N0YXRlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYnJvd3NlclZpZXdTZXJ2aWNlOiBJQnJvd3NlclZpZXdTZXJ2aWNlLFxuXHRcdEBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlOiBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJUGxheXdyaWdodFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbGF5d3JpZ2h0U2VydmljZTogSVBsYXl3cmlnaHRTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQnJvd3Nlclpvb21TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgem9vbVNlcnZpY2U6IElCcm93c2VyWm9vbVNlcnZpY2UsXG5cdFx0QElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnROZXR3b3JrRmlsdGVyU2VydmljZTogSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBJbml0aWFsaXplIHN0YXRlXG5cdFx0dGhpcy5fdXJsID0gaW5pdGlhbFN0YXRlLnVybDtcblx0XHR0aGlzLl90aXRsZSA9IGluaXRpYWxTdGF0ZS50aXRsZTtcblx0XHR0aGlzLl9sb2FkaW5nID0gaW5pdGlhbFN0YXRlLmxvYWRpbmc7XG5cdFx0dGhpcy5fZm9jdXNlZCA9IGluaXRpYWxTdGF0ZS5mb2N1c2VkO1xuXHRcdHRoaXMuX3Zpc2libGUgPSBpbml0aWFsU3RhdGUudmlzaWJsZTtcblx0XHR0aGlzLl9pc0RldlRvb2xzT3BlbiA9IGluaXRpYWxTdGF0ZS5pc0RldlRvb2xzT3Blbjtcblx0XHR0aGlzLl9jYW5Hb0JhY2sgPSBpbml0aWFsU3RhdGUuY2FuR29CYWNrO1xuXHRcdHRoaXMuX2NhbkdvRm9yd2FyZCA9IGluaXRpYWxTdGF0ZS5jYW5Hb0ZvcndhcmQ7XG5cdFx0dGhpcy5fc2NyZWVuc2hvdCA9IGluaXRpYWxTdGF0ZS5sYXN0U2NyZWVuc2hvdDtcblx0XHR0aGlzLl9mYXZpY29uID0gaW5pdGlhbFN0YXRlLmxhc3RGYXZpY29uO1xuXHRcdHRoaXMuX2Vycm9yID0gaW5pdGlhbFN0YXRlLmxhc3RFcnJvcjtcblx0XHR0aGlzLl9jZXJ0aWZpY2F0ZUVycm9yID0gaW5pdGlhbFN0YXRlLmNlcnRpZmljYXRlRXJyb3I7XG5cdFx0dGhpcy5fc3RvcmFnZVNjb3BlID0gaW5pdGlhbFN0YXRlLnN0b3JhZ2VTY29wZTtcblx0XHR0aGlzLl9pc1JlbW90ZVNlc3Npb24gPSBpbml0aWFsU3RhdGUuaXNSZW1vdGVTZXNzaW9uO1xuXHRcdHRoaXMuX2Jyb3dzZXJab29tSW5kZXggPSBpbml0aWFsU3RhdGUuYnJvd3Nlclpvb21JbmRleDtcblx0XHR0aGlzLl9lbGVtZW50U2VsZWN0aW9uU3RhdGUgPSBpbml0aWFsU3RhdGUuZWxlbWVudFNlbGVjdGlvblN0YXRlO1xuXHRcdHRoaXMuX2lzQXJlYVNlbGVjdGlvbkFjdGl2ZSA9IGluaXRpYWxTdGF0ZS5pc0FyZWFTZWxlY3Rpb25BY3RpdmU7XG5cdFx0dGhpcy5fZGV2aWNlID0gaW5pdGlhbFN0YXRlLmRldmljZTtcblx0XHR0aGlzLl9pc0VwaGVtZXJhbCA9IHRoaXMuX3N0b3JhZ2VTY29wZSA9PT0gQnJvd3NlclZpZXdTdG9yYWdlU2NvcGUuRXBoZW1lcmFsO1xuXHRcdHRoaXMuX3pvb21Ib3N0ID0gcGFyc2Vab29tSG9zdCh0aGlzLl91cmwpO1xuXG5cdFx0Y29uc3QgeyBoaXN0b3J5OiBlbnRyaWVzS2V5LCBmYXZpY29uczogZmF2aWNvbnNLZXkgfSA9IGluaXRpYWxTdGF0ZS5zdG9yYWdlS2V5cztcblx0XHRpZiAoZW50cmllc0tleSkge1xuXHRcdFx0dGhpcy5fcmVsb2FkSGlzdG9yeUVudHJpZXMoZW50cmllc0tleSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoXG5cdFx0XHRcdFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZW50cmllc0tleSwgdGhpcy5fc3RvcmUsXG5cdFx0XHQpKCgpID0+IHRoaXMuX3JlbG9hZEhpc3RvcnlFbnRyaWVzKGVudHJpZXNLZXkpKSk7XG5cdFx0fVxuXHRcdGlmIChmYXZpY29uc0tleSkge1xuXHRcdFx0dGhpcy5fcmVsb2FkSGlzdG9yeUZhdmljb25zKGZhdmljb25zS2V5KTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShcblx0XHRcdFx0U3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYXZpY29uc0tleSwgdGhpcy5fc3RvcmUsXG5cdFx0XHQpKCgpID0+IHRoaXMuX3JlbG9hZEhpc3RvcnlGYXZpY29ucyhmYXZpY29uc0tleSkpKTtcblx0XHR9XG5cblx0XHQvLyBQZXJtaXNzaW9ucyBhcmUgc3luY2VkIHZpYSBicm93c2VyLXZpZXcgc3RhdGUgKyBhIGR5bmFtaWMgZXZlbnQgcmF0aGVyXG5cdFx0Ly8gdGhhbiBzdG9yYWdlLCBzbyB0aGV5IHdvcmsgZm9yIGVwaGVtZXJhbCBzZXNzaW9ucyAod2hpY2ggbmV2ZXIgcGVyc2lzdCkuXG5cdFx0dGhpcy5wZXJtaXNzaW9ucy5oeWRyYXRlKGluaXRpYWxTdGF0ZS5wZXJtaXNzaW9ucyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5icm93c2VyVmlld1NlcnZpY2Uub25EeW5hbWljRGlkQ2hhbmdlUGVybWlzc2lvbnModGhpcy5pZCkoXG5cdFx0XHRzbmFwc2hvdCA9PiB0aGlzLnBlcm1pc3Npb25zLmh5ZHJhdGUoc25hcHNob3QpKSk7XG5cblx0XHQvLyBTeW5jIGluaXRpYWwgem9vbSBhbmQgc2hhcmluZyBzdGF0ZSAoYXN5bmMsIGJ1dCBlbWl0cyBldmVudHMpXG5cdFx0Y29uc3QgZWZmZWN0aXZlWm9vbUluZGV4ID0gdGhpcy56b29tU2VydmljZS5nZXRFZmZlY3RpdmVab29tSW5kZXgodGhpcy5fem9vbUhvc3QsIHRoaXMuX2lzRXBoZW1lcmFsKTtcblx0XHRpZiAoZWZmZWN0aXZlWm9vbUluZGV4ICE9PSB0aGlzLl9icm93c2VyWm9vbUluZGV4KSB7XG5cdFx0XHR2b2lkIHRoaXMuc2V0QnJvd3Nlclpvb21JbmRleChlZmZlY3RpdmVab29tSW5kZXgpLmNhdGNoKGUgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0Jyb3dzZXJWaWV3TW9kZWxdIEZhaWxlZCB0byBzZXQgaW5pdGlhbCB6b29tOmAsIGUpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHZvaWQgdGhpcy5wbGF5d3JpZ2h0U2VydmljZS5pc1BhZ2VUcmFja2VkKHRoaXMuaWQpLnRoZW4oc2hhcmVkID0+IHRoaXMuX3NldFNoYXJlZFdpdGhBZ2VudChzaGFyZWQpKS5jYXRjaChlID0+IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbQnJvd3NlclZpZXdNb2RlbF0gRmFpbGVkIHRvIGNoZWNrIGluaXRpYWwgcGFnZSB0cmFja2luZzpgLCBlKTtcblx0XHR9KTtcblxuXHRcdC8vIFNldCB1cCBzdGF0ZSBzeW5jaHJvbml6YXRpb25cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuem9vbVNlcnZpY2Uub25EaWRDaGFuZ2Vab29tKCh7IGhvc3QsIGlzRXBoZW1lcmFsQ2hhbmdlIH0pID0+IHtcblx0XHRcdGlmIChpc0VwaGVtZXJhbENoYW5nZSAmJiAhdGhpcy5faXNFcGhlbWVyYWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhvc3QgPT09IHVuZGVmaW5lZCB8fCBob3N0ID09PSB0aGlzLl96b29tSG9zdCkge1xuXHRcdFx0XHR2b2lkIHRoaXMuc2V0QnJvd3Nlclpvb21JbmRleChcblx0XHRcdFx0XHR0aGlzLnpvb21TZXJ2aWNlLmdldEVmZmVjdGl2ZVpvb21JbmRleCh0aGlzLl96b29tSG9zdCwgdGhpcy5faXNFcGhlbWVyYWwpXG5cdFx0XHRcdCkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkTmF2aWdhdGUoZSA9PiB7XG5cdFx0XHQvLyBDbGVhciBmYXZpY29uIG9uIG5hdmlnYXRpb24gdG8gYSBkaWZmZXJlbnQgaG9zdFxuXHRcdFx0aWYgKFVSTC5wYXJzZShlLnVybCk/Lmhvc3QgIT09IFVSTC5wYXJzZSh0aGlzLl91cmwpPy5ob3N0KSB7XG5cdFx0XHRcdHRoaXMuX2Zhdmljb24gPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3pvb21Ib3N0ID0gcGFyc2Vab29tSG9zdChlLnVybCk7XG5cdFx0XHR0aGlzLl91cmwgPSBlLnVybDtcblx0XHRcdHRoaXMuX3RpdGxlID0gZS50aXRsZTtcblx0XHRcdHRoaXMuX2NhbkdvQmFjayA9IGUuY2FuR29CYWNrO1xuXHRcdFx0dGhpcy5fY2FuR29Gb3J3YXJkID0gZS5jYW5Hb0ZvcndhcmQ7XG5cdFx0XHR0aGlzLl9jZXJ0aWZpY2F0ZUVycm9yID0gZS5jZXJ0aWZpY2F0ZUVycm9yO1xuXG5cdFx0XHQvLyBBbHdheXMgZm9yY2VBcHBseSBiZWNhdXNlIENocm9taXVtIHJlc2V0cyB6b29tIG9uIGNyb3NzLW9yaWdpbiBuYXZpZ2F0aW9uLFxuXHRcdFx0Ly8gYW5kIGFuIG9yaWdpbiBjaGFuZ2UgbWF5IG5vdCBjb3JyZXNwb25kIHRvIGEgaG9zdCBjaGFuZ2UgKGUuZy4gaHR0cFx1MjE5Mmh0dHBzKS5cblx0XHRcdHZvaWQgdGhpcy5zZXRCcm93c2VyWm9vbUluZGV4KFxuXHRcdFx0XHR0aGlzLnpvb21TZXJ2aWNlLmdldEVmZmVjdGl2ZVpvb21JbmRleCh0aGlzLl96b29tSG9zdCwgdGhpcy5faXNFcGhlbWVyYWwpLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VMb2FkaW5nU3RhdGUoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2FkaW5nID0gZS5sb2FkaW5nO1xuXHRcdFx0dGhpcy5fZXJyb3IgPSBlLmVycm9yO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VEZXZUb29sc1N0YXRlKGUgPT4ge1xuXHRcdFx0dGhpcy5faXNEZXZUb29sc09wZW4gPSBlLmlzRGV2VG9vbHNPcGVuO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VUaXRsZShlID0+IHtcblx0XHRcdHRoaXMuX3RpdGxlID0gZS50aXRsZTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlRmF2aWNvbihlID0+IHtcblx0XHRcdHRoaXMuX2Zhdmljb24gPSBlLmZhdmljb247XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUZvY3VzKCh7IGZvY3VzZWQgfSkgPT4ge1xuXHRcdFx0dGhpcy5fZm9jdXNlZCA9IGZvY3VzZWQ7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZVZpc2liaWxpdHkoKHsgdmlzaWJsZSB9KSA9PiB7XG5cdFx0XHR0aGlzLl92aXNpYmxlID0gdmlzaWJsZTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5vbkR5bmFtaWNEaWRDaGFuZ2VEZXZpY2VFbXVsYXRpb24odGhpcy5pZCkoZGV2aWNlID0+IHtcblx0XHRcdGlmICghc3RydWN0dXJhbEVxdWFscyh0aGlzLl9kZXZpY2UsIGRldmljZSkpIHtcblx0XHRcdFx0dGhpcy5fZGV2aWNlID0gZGV2aWNlO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURldmljZS5maXJlKGRldmljZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUVsZW1lbnRTZWxlY3Rpb25TdGF0ZShzdGF0ZSA9PiB7XG5cdFx0XHRpZiAoc3RhdGUuYWN0aXZlICYmICF0aGlzLl9lbGVtZW50U2VsZWN0aW9uU3RhdGUuYWN0aXZlKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEludGVncmF0ZWRCcm93c2VyQWRkRWxlbWVudFRvQ2hhdFN0YXJ0RXZlbnQsIEludGVncmF0ZWRCcm93c2VyQWRkRWxlbWVudFRvQ2hhdFN0YXJ0Q2xhc3NpZmljYXRpb24+KCdpbnRlZ3JhdGVkQnJvd3Nlci5hZGRFbGVtZW50VG9DaGF0LnN0YXJ0Jywge30pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZWxlbWVudFNlbGVjdGlvblN0YXRlID0gc3RhdGU7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUFyZWFTZWxlY3Rpb25BY3RpdmUoYWN0aXZlID0+IHtcblx0XHRcdHRoaXMuX2lzQXJlYVNlbGVjdGlvbkFjdGl2ZSA9IGFjdGl2ZTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnBsYXl3cmlnaHRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJhY2tlZFBhZ2VzKGlkcyA9PiB7XG5cdFx0XHR0aGlzLl9zZXRTaGFyZWRXaXRoQWdlbnQoaWRzLmluY2x1ZGVzKHRoaXMuaWQpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZS5vbkRpZENoYW5nZVNoYXJpbmdBdmFpbGFibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTaGFyaW5nU3RhdGUuZmlyZSh0aGlzLnNoYXJpbmdTdGF0ZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZVJlbW90ZVN0YXR1cyhpc1JlbW90ZVNlc3Npb24gPT4ge1xuXHRcdFx0dGhpcy5faXNSZW1vdGVTZXNzaW9uID0gaXNSZW1vdGVTZXNzaW9uO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldCB1cmwoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX3VybDsgfVxuXHRnZXQgdGl0bGUoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX3RpdGxlOyB9XG5cdGdldCBmYXZpY29uKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9mYXZpY29uOyB9XG5cdGdldCBsb2FkaW5nKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fbG9hZGluZzsgfVxuXHRnZXQgZm9jdXNlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2ZvY3VzZWQ7IH1cblx0Z2V0IHZpc2libGUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl92aXNpYmxlOyB9XG5cdGdldCBpc0RldlRvb2xzT3BlbigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2lzRGV2VG9vbHNPcGVuOyB9XG5cdGdldCBjYW5Hb0JhY2soKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9jYW5Hb0JhY2s7IH1cblx0Z2V0IGNhbkdvRm9yd2FyZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2NhbkdvRm9yd2FyZDsgfVxuXHRnZXQgc2NyZWVuc2hvdCgpOiBWU0J1ZmZlciB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9zY3JlZW5zaG90OyB9XG5cdGdldCBlcnJvcigpOiBJQnJvd3NlclZpZXdMb2FkRXJyb3IgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZXJyb3I7IH1cblx0Z2V0IGNlcnRpZmljYXRlRXJyb3IoKTogSUJyb3dzZXJWaWV3Q2VydGlmaWNhdGVFcnJvciB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9jZXJ0aWZpY2F0ZUVycm9yOyB9XG5cdGdldCBzdG9yYWdlU2NvcGUoKTogQnJvd3NlclZpZXdTdG9yYWdlU2NvcGUgeyByZXR1cm4gdGhpcy5fc3RvcmFnZVNjb3BlOyB9XG5cdGdldCBpc1JlbW90ZVNlc3Npb24oKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9pc1JlbW90ZVNlc3Npb247IH1cblx0Z2V0IHNoYXJpbmdTdGF0ZSgpOiBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZSB7XG5cdFx0aWYgKCF0aGlzLmJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZS5pc1NoYXJpbmdBdmFpbGFibGUpIHtcblx0XHRcdHJldHVybiBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5VbmF2YWlsYWJsZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NoYXJlZFdpdGhBZ2VudCA/IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLlNoYXJlZCA6IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLk5vdFNoYXJlZDtcblx0fVxuXHRnZXQgem9vbUZhY3RvcigpOiBudW1iZXIgeyByZXR1cm4gYnJvd3Nlclpvb21GYWN0b3JzW3RoaXMuX2Jyb3dzZXJab29tSW5kZXhdOyB9XG5cdGdldCBjYW5ab29tSW4oKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9icm93c2VyWm9vbUluZGV4IDwgYnJvd3Nlclpvb21GYWN0b3JzLmxlbmd0aCAtIDE7IH1cblx0Z2V0IGNhblpvb21PdXQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9icm93c2VyWm9vbUluZGV4ID4gMDsgfVxuXHRnZXQgZWxlbWVudFNlbGVjdGlvblN0YXRlKCk6IElCcm93c2VyRWxlbWVudFNlbGVjdGlvblN0YXRlIHsgcmV0dXJuIHRoaXMuX2VsZW1lbnRTZWxlY3Rpb25TdGF0ZTsgfVxuXHRnZXQgaXNBcmVhU2VsZWN0aW9uQWN0aXZlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faXNBcmVhU2VsZWN0aW9uQWN0aXZlOyB9XG5cdGdldCBkZXZpY2UoKTogSUJyb3dzZXJEZXZpY2VQcm9maWxlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2RldmljZTsgfVxuXG5cdGdldCBvbkRpZE5hdmlnYXRlKCk6IEV2ZW50PElCcm93c2VyVmlld05hdmlnYXRpb25FdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5vbkR5bmFtaWNEaWROYXZpZ2F0ZSh0aGlzLmlkKTtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZUxvYWRpbmdTdGF0ZSgpOiBFdmVudDxJQnJvd3NlclZpZXdMb2FkaW5nRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uub25EeW5hbWljRGlkQ2hhbmdlTG9hZGluZ1N0YXRlKHRoaXMuaWQpO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlRm9jdXMoKTogRXZlbnQ8SUJyb3dzZXJWaWV3Rm9jdXNFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5vbkR5bmFtaWNEaWRDaGFuZ2VGb2N1cyh0aGlzLmlkKTtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZURldlRvb2xzU3RhdGUoKTogRXZlbnQ8SUJyb3dzZXJWaWV3RGV2VG9vbHNTdGF0ZUV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLm9uRHluYW1pY0RpZENoYW5nZURldlRvb2xzU3RhdGUodGhpcy5pZCk7XG5cdH1cblxuXHRnZXQgb25EaWRLZXlDb21tYW5kKCk6IEV2ZW50PElCcm93c2VyVmlld0tleURvd25FdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5vbkR5bmFtaWNEaWRLZXlDb21tYW5kKHRoaXMuaWQpO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlVGl0bGUoKTogRXZlbnQ8SUJyb3dzZXJWaWV3VGl0bGVDaGFuZ2VFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5vbkR5bmFtaWNEaWRDaGFuZ2VUaXRsZSh0aGlzLmlkKTtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZUZhdmljb24oKTogRXZlbnQ8SUJyb3dzZXJWaWV3RmF2aWNvbkNoYW5nZUV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLm9uRHluYW1pY0RpZENoYW5nZUZhdmljb24odGhpcy5pZCk7XG5cdH1cblxuXHRnZXQgb25EaWRGaW5kSW5QYWdlKCk6IEV2ZW50PElCcm93c2VyVmlld0ZpbmRJblBhZ2VSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uub25EeW5hbWljRGlkRmluZEluUGFnZSh0aGlzLmlkKTtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZVZpc2liaWxpdHkoKTogRXZlbnQ8SUJyb3dzZXJWaWV3VmlzaWJpbGl0eUV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLm9uRHluYW1pY0RpZENoYW5nZVZpc2liaWxpdHkodGhpcy5pZCk7XG5cdH1cblxuXHRnZXQgb25EaWRDbG9zZSgpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLm9uRHluYW1pY0RpZENsb3NlKHRoaXMuaWQpO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlUmVtb3RlU3RhdHVzKCk6IEV2ZW50PGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uub25EeW5hbWljRGlkQ2hhbmdlUmVtb3RlU3RhdHVzKHRoaXMuaWQpO1xuXHR9XG5cblx0Z2V0IG9uRGlkUmVxdWVzdFBlcm1pc3Npb24oKTogRXZlbnQ8SUJyb3dzZXJWaWV3UGVybWlzc2lvblJlcXVlc3RFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5vbkR5bmFtaWNEaWRSZXF1ZXN0UGVybWlzc2lvbih0aGlzLmlkKTtcblx0fVxuXG5cdGFzeW5jIGxheW91dChib3VuZHM6IElCcm93c2VyVmlld0JvdW5kcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5sYXlvdXQodGhpcy5pZCwgYm91bmRzKTtcblx0fVxuXG5cdGFzeW5jIHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlOyAvLyBTZXQgb3B0aW1pc3RpY2FsbHkgc28gbW9kZWwgaXMgaW4gc3luYyBpbW1lZGlhdGVseVxuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5zZXRWaXNpYmxlKHRoaXMuaWQsIHZpc2libGUpO1xuXHR9XG5cblx0YXN5bmMgbG9hZFVSTCh1cmw6IHN0cmluZywgb3B0aW9ucz86IElOYXZpZ2F0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ05hdmlnYXRpb25UZWxlbWV0cnkob3B0aW9ucz8uc291cmNlID8/ICd1cmxJbnB1dCcsIHVybCk7XG5cdFx0dGhpcy5fb25XaWxsTmF2aWdhdGUuZmlyZSh1cmwpO1xuXG5cdFx0Ly8gUHJlcGVuZCBodHRwOi8vIGZvciBiYXJlIGxvY2FsaG9zdCBhdXRob3JpdGllcyAoZS5nLiBcImxvY2FsaG9zdDozMDAwXCIpLlxuXHRcdGlmICgvXmxvY2FsaG9zdCg6fFxcL3wkKS9pLnRlc3QodXJsKSkge1xuXHRcdFx0dXJsID0gJ2h0dHA6Ly8nICsgdXJsO1xuXHRcdH0gZWxzZSBpZiAoIVVSTC5wYXJzZSh1cmwpPy5wcm90b2NvbCkge1xuXHRcdFx0Ly8gTm8gc2NoZW1lIFx1MjAxNCBkZWZhdWx0IHRvIGh0dHA6Ly87IHNpdGVzIHR5cGljYWxseSB1cGdyYWRlIHRvIGh0dHBzOi8vLlxuXHRcdFx0dXJsID0gJ2h0dHA6Ly8nICsgdXJsO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5sb2FkVVJMKHRoaXMuaWQsIHVybCk7XG5cdH1cblxuXHRhc3luYyBnb0JhY2soKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dOYXZpZ2F0aW9uVGVsZW1ldHJ5KCdnb0JhY2snLCB0aGlzLl91cmwpO1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5nb0JhY2sodGhpcy5pZCk7XG5cdH1cblxuXHRhc3luYyBnb0ZvcndhcmQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dOYXZpZ2F0aW9uVGVsZW1ldHJ5KCdnb0ZvcndhcmQnLCB0aGlzLl91cmwpO1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5nb0ZvcndhcmQodGhpcy5pZCk7XG5cdH1cblxuXHRhc3luYyByZWxvYWQoaGFyZD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ05hdmlnYXRpb25UZWxlbWV0cnkoJ3JlbG9hZCcsIHRoaXMuX3VybCk7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLnJlbG9hZCh0aGlzLmlkLCBoYXJkKTtcblx0fVxuXG5cdGFzeW5jIHRvZ2dsZURldlRvb2xzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS50b2dnbGVEZXZUb29scyh0aGlzLmlkKTtcblx0fVxuXG5cdGFzeW5jIGNhcHR1cmVTY3JlZW5zaG90KG9wdGlvbnM/OiBJQnJvd3NlclZpZXdDYXB0dXJlU2NyZWVuc2hvdE9wdGlvbnMpOiBQcm9taXNlPFZTQnVmZmVyPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5icm93c2VyVmlld1NlcnZpY2UuY2FwdHVyZVNjcmVlbnNob3QodGhpcy5pZCwgb3B0aW9ucyk7XG5cdFx0Ly8gU3RvcmUgZnVsbC1wYWdlIHNjcmVlbnNob3RzIGZvciBkaXNwbGF5IGluIFVJIGFzIHBsYWNlaG9sZGVyc1xuXHRcdGlmICghb3B0aW9ucz8uc2NyZWVuUmVjdCAmJiAhb3B0aW9ucz8ucGFnZVJlY3QgJiYgIW9wdGlvbnM/LmZ1bGxQYWdlKSB7XG5cdFx0XHR0aGlzLl9zY3JlZW5zaG90ID0gcmVzdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgZm9jdXMoZm9yY2U/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLmZvY3VzKHRoaXMuaWQsIGZvcmNlKTtcblx0fVxuXG5cdGFzeW5jIGZpbmRJblBhZ2UodGV4dDogc3RyaW5nLCBvcHRpb25zPzogSUJyb3dzZXJWaWV3RmluZEluUGFnZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2UuZmluZEluUGFnZSh0aGlzLmlkLCB0ZXh0LCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHN0b3BGaW5kSW5QYWdlKGtlZXBTZWxlY3Rpb24/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLnN0b3BGaW5kSW5QYWdlKHRoaXMuaWQsIGtlZXBTZWxlY3Rpb24pO1xuXHR9XG5cblx0YXN5bmMgZ2V0U2VsZWN0ZWRUZXh0KCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLmdldFNlbGVjdGVkVGV4dCh0aGlzLmlkKTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyU3RvcmFnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2UuY2xlYXJTdG9yYWdlKHRoaXMuaWQpO1xuXHR9XG5cblx0YXN5bmMgdHJ1c3RDZXJ0aWZpY2F0ZShob3N0OiBzdHJpbmcsIGZpbmdlcnByaW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2UudHJ1c3RDZXJ0aWZpY2F0ZSh0aGlzLmlkLCBob3N0LCBmaW5nZXJwcmludCk7XG5cdH1cblxuXHRhc3luYyB1bnRydXN0Q2VydGlmaWNhdGUoaG9zdDogc3RyaW5nLCBmaW5nZXJwcmludDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLnVudHJ1c3RDZXJ0aWZpY2F0ZSh0aGlzLmlkLCBob3N0LCBmaW5nZXJwcmludCk7XG5cdH1cblxuXHRhc3luYyBkZWxldGVIaXN0b3J5KGVudHJ5SWRzPzogcmVhZG9ubHkgbnVtYmVyW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBNaXJyb3IgbG9jYWxseSBzbyB0aGUgd29ya2JlbmNoIHVwZGF0ZXMgaW1tZWRpYXRlbHk7IHRoZSBldmVudHVhbFxuXHRcdC8vIHN0b3JhZ2UgY2hhbmdlIGV2ZW50IGZyb20gdGhlIG1haW4tcHJvY2VzcyBmbHVzaCB3aWxsIHJlLWh5ZHJhdGUgdG9cblx0XHQvLyB0aGUgc2FtZSBjb250ZW50LlxuXHRcdGlmIChlbnRyeUlkcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmhpc3RvcnkuY2xlYXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBlbnRyeUlkcykge1xuXHRcdFx0XHR0aGlzLmhpc3RvcnkuZW50cmllcy5kZWxldGUoaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2UuZGVsZXRlQnJvd3Nlckhpc3RvcnkodGhpcy5pZCwgZW50cnlJZHMpO1xuXHR9XG5cblx0YXN5bmMgc2V0UGVybWlzc2lvbnMob3JpZ2luOiBzdHJpbmcsIGdyYW50czogcmVhZG9ubHkgSVBlcm1pc3Npb25DYXRlZ29yeVN0YXRlW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBNaXJyb3IgbG9jYWxseSBzbyB0aGUgd29ya2JlbmNoIHJlZmxlY3RzIHRoZSBkZWNpc2lvbiBpbW1lZGlhdGVseVxuXHRcdHRoaXMucGVybWlzc2lvbnMuc2V0TWFueShvcmlnaW4sIGdyYW50cyk7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLnNldFBlcm1pc3Npb25zKHRoaXMuaWQsIG9yaWdpbiwgZ3JhbnRzKTtcblx0fVxuXG5cdGFzeW5jIHNlbGVjdERldmljZShyZXF1ZXN0SWQ6IHN0cmluZywgZGV2aWNlSWQ6IHN0cmluZyB8IG51bGwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uuc2VsZWN0RGV2aWNlKHRoaXMuaWQsIHJlcXVlc3RJZCwgZGV2aWNlSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSBmb3JjZUFwcGx5IFdoZW4gdHJ1ZSwgdGhlIElQQyBjYWxsIGlzIG1hZGUgZXZlbiBpZiB0aGUgbG9jYWwgY2FjaGVkIHpvb20gaW5kZXhcblx0ICogYWxyZWFkeSBtYXRjaGVzIHRoZSByZXF1ZXN0ZWQgdmFsdWUuIFBhc3MgdHJ1ZSBhZnRlciBjcm9zcy1kb2N1bWVudCBuYXZpZ2F0aW9uIGJlY2F1c2Vcblx0ICogQ2hyb21pdW0gcmVzZXRzIHRoZSB6b29tIHRvIGl0cyBwZXItb3JpZ2luIGRlZmF1bHQsIG1ha2luZyB0aGUgY2FjaGUgc3RhbGUuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIHNldEJyb3dzZXJab29tSW5kZXgoem9vbUluZGV4OiBudW1iZXIsIGZvcmNlQXBwbHkgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNsYW1wZWQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbih6b29tSW5kZXgsIGJyb3dzZXJab29tRmFjdG9ycy5sZW5ndGggLSAxKSk7XG5cdFx0aWYgKCFmb3JjZUFwcGx5ICYmIGNsYW1wZWQgPT09IHRoaXMuX2Jyb3dzZXJab29tSW5kZXgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYnJvd3Nlclpvb21JbmRleCA9IGNsYW1wZWQ7XG5cdFx0YXdhaXQgdGhpcy5icm93c2VyVmlld1NlcnZpY2Uuc2V0QnJvd3Nlclpvb21JbmRleCh0aGlzLmlkLCB0aGlzLl9icm93c2VyWm9vbUluZGV4KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVpvb20uZmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgem9vbUluKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5jYW5ab29tSW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5zZXRCcm93c2VyWm9vbUluZGV4KHRoaXMuX2Jyb3dzZXJab29tSW5kZXggKyAxKTtcblx0XHRpZiAodGhpcy5fem9vbUhvc3QpIHtcblx0XHRcdHRoaXMuem9vbVNlcnZpY2Uuc2V0SG9zdFpvb21JbmRleCh0aGlzLl96b29tSG9zdCwgdGhpcy5fYnJvd3Nlclpvb21JbmRleCwgdGhpcy5faXNFcGhlbWVyYWwpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHpvb21PdXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmNhblpvb21PdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5zZXRCcm93c2VyWm9vbUluZGV4KHRoaXMuX2Jyb3dzZXJab29tSW5kZXggLSAxKTtcblx0XHRpZiAodGhpcy5fem9vbUhvc3QpIHtcblx0XHRcdHRoaXMuem9vbVNlcnZpY2Uuc2V0SG9zdFpvb21JbmRleCh0aGlzLl96b29tSG9zdCwgdGhpcy5fYnJvd3Nlclpvb21JbmRleCwgdGhpcy5faXNFcGhlbWVyYWwpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc2V0Wm9vbSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWZhdWx0SW5kZXggPSB0aGlzLnpvb21TZXJ2aWNlLmdldEVmZmVjdGl2ZVpvb21JbmRleCh1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRhd2FpdCB0aGlzLnNldEJyb3dzZXJab29tSW5kZXgoZGVmYXVsdEluZGV4KTtcblx0XHRpZiAodGhpcy5fem9vbUhvc3QpIHtcblx0XHRcdHRoaXMuem9vbVNlcnZpY2Uuc2V0SG9zdFpvb21JbmRleCh0aGlzLl96b29tSG9zdCwgZGVmYXVsdEluZGV4LCB0aGlzLl9pc0VwaGVtZXJhbCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0Q29uc29sZUxvZ3MoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2UuZ2V0Q29uc29sZUxvZ3ModGhpcy5pZCk7XG5cdH1cblxuXHRhc3luYyB0b2dnbGVFbGVtZW50U2VsZWN0aW9uKGVuYWJsZWQ/OiBib29sZWFuLCBvcHRpb25zPzogSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS50b2dnbGVFbGVtZW50U2VsZWN0aW9uKHRoaXMuaWQsIGVuYWJsZWQsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgc2V0RWxlbWVudENvbW1lbnRzKHVwZGF0ZTogSUJyb3dzZXJFbGVtZW50Q29tbWVudHNVcGRhdGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uuc2V0RWxlbWVudENvbW1lbnRzKHRoaXMuaWQsIHVwZGF0ZSk7XG5cdH1cblxuXHRhc3luYyB0b2dnbGVBcmVhU2VsZWN0aW9uKGVuYWJsZWQ/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLnRvZ2dsZUFyZWFTZWxlY3Rpb24odGhpcy5pZCwgZW5hYmxlZCk7XG5cdH1cblxuXHRnZXQgb25EaWRTZWxlY3RFbGVtZW50KCk6IEV2ZW50PElFbGVtZW50RGF0YT4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5vbkR5bmFtaWNEaWRTZWxlY3RFbGVtZW50KHRoaXMuaWQpO1xuXHR9XG5cblx0Z2V0IG9uRGlkUmVtb3ZlRWxlbWVudENvbW1lbnQoKTogRXZlbnQ8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLm9uRHluYW1pY0RpZFJlbW92ZUVsZW1lbnRDb21tZW50KHRoaXMuaWQpO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlRWxlbWVudFNlbGVjdGlvblN0YXRlKCk6IEV2ZW50PElCcm93c2VyRWxlbWVudFNlbGVjdGlvblN0YXRlPiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLm9uRHluYW1pY0RpZENoYW5nZUVsZW1lbnRTZWxlY3Rpb25TdGF0ZSh0aGlzLmlkKTtcblx0fVxuXG5cdGdldCBvbkRpZFBpY2tBcmVhKCk6IEV2ZW50PElCcm93c2VyVmlld1JlY3QgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uub25EeW5hbWljRGlkUGlja0FyZWEodGhpcy5pZCk7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VBcmVhU2VsZWN0aW9uQWN0aXZlKCk6IEV2ZW50PGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uub25EeW5hbWljRGlkQ2hhbmdlQXJlYVNlbGVjdGlvbkFjdGl2ZSh0aGlzLmlkKTtcblx0fVxuXG5cdGFzeW5jIHNldERldmljZShkZXZpY2U6IElCcm93c2VyRGV2aWNlUHJvZmlsZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFVwZGF0ZSBtb2RlbCBzdGF0ZSBvcHRpbWlzdGljYWxseSBzbyBkZXBlbmRlbnQgVUkgcmVhY3RzIGltbWVkaWF0ZWx5O1xuXHRcdC8vIHRoZSBlY2hvIGZyb20gdGhlIG1haW4gcHJvY2VzcyBpcyBmaWx0ZXJlZCBieSBkZWVwIGNvbXBhcmlzb24uXG5cdFx0aWYgKCFzdHJ1Y3R1cmFsRXF1YWxzKHRoaXMuX2RldmljZSwgZGV2aWNlKSkge1xuXHRcdFx0dGhpcy5fZGV2aWNlID0gZGV2aWNlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZXZpY2UuZmlyZShkZXZpY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uuc2V0RGV2aWNlRW11bGF0aW9uKHRoaXMuaWQsIGRldmljZSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTSEFSRV9ET05UX0FTS19LRVkgPSAnYnJvd3NlclZpZXcuc2hhcmVXaXRoQWdlbnQuZG9udEFza0FnYWluJztcblxuXHRhc3luYyBzZXRTaGFyZWRXaXRoQWdlbnQoc2hhcmVkOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHNoYXJlZCkge1xuXHRcdFx0Ly8gQmxvY2sgc2hhcmluZyB3aGVuIHRoZSBjdXJyZW50IHBhZ2UgVVJMIGlzIGRlbmllZCBieSBuZXR3b3JrIHBvbGljeS5cblx0XHRcdGlmICh0aGlzLl91cmwpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UodGhpcy5fdXJsKTtcblx0XHRcdFx0XHRpZiAoIXRoaXMuYWdlbnROZXR3b3JrRmlsdGVyU2VydmljZS5pc1VyaUFsbG93ZWQodXJpKSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmluZm8oXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdicm93c2VyVmlldy5zaGFyZUJsb2NrZWQudGl0bGUnLCBcIkNhbm5vdCBTaGFyZSB3aXRoIEFnZW50XCIpLFxuXHRcdFx0XHRcdFx0XHR0aGlzLmFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UuZm9ybWF0RXJyb3IodXJpKSxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIHsgfVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdG9yZWRDaG9pY2UgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQnJvd3NlclZpZXdNb2RlbC5TSEFSRV9ET05UX0FTS19LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblxuXHRcdFx0aWYgKCFzdG9yZWRDaG9pY2UpIHtcblx0XHRcdFx0Ly8gRmlyc3QgdGltZSAob3Igbm8gc3RvcmVkIHByZWZlcmVuY2UpIC0tIGFzay5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdHR5cGU6ICdxdWVzdGlvbicsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdicm93c2VyVmlldy5zaGFyZVdpdGhBZ2VudC50aXRsZScsICdTaGFyZSB3aXRoIEFnZW50PycpLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdicm93c2VyVmlldy5zaGFyZVdpdGhBZ2VudC5tZXNzYWdlJywgJ1NoYXJlIHRoaXMgYnJvd3NlciBwYWdlIHdpdGggdGhlIGFnZW50PycpLFxuXHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoXG5cdFx0XHRcdFx0XHQnYnJvd3NlclZpZXcuc2hhcmVXaXRoQWdlbnQuZGV0YWlsJyxcblx0XHRcdFx0XHRcdCdUaGUgYWdlbnQgd2lsbCBiZSBhYmxlIHRvIHJlYWQgYW5kIG1vZGlmeSBicm93c2VyIGNvbnRlbnQgYW5kIHNhdmVkIGRhdGEsIGluY2x1ZGluZyBjb29raWVzLidcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdicm93c2VyVmlldy5zaGFyZVdpdGhBZ2VudC5hbGxvdycsICcmJkFsbG93JyksXG5cdFx0XHRcdFx0Y2FuY2VsQnV0dG9uOiBsb2NhbGl6ZSgnYnJvd3NlclZpZXcuc2hhcmVXaXRoQWdlbnQuZGVueScsICdEZW55JyksXG5cdFx0XHRcdFx0Y2hlY2tib3g6IHsgbGFiZWw6IGxvY2FsaXplKCdicm93c2VyVmlldy5zaGFyZVdpdGhBZ2VudC5kb250QXNrQWdhaW4nLCBcIkRvbid0IGFzayBhZ2FpblwiKSwgY2hlY2tlZDogZmFsc2UgfSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gT25seSBwZXJzaXN0IFwiZG9uJ3QgYXNrIGFnYWluXCIgaWYgdXNlciBhY2NlcHRlZCBzaGFyaW5nLCBzbyB0aGUgYnV0dG9uIGRvZXNuJ3QganVzdCBkbyBub3RoaW5nLlxuXHRcdFx0XHRpZiAocmVzdWx0LmNvbmZpcm1lZCAmJiByZXN1bHQuY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShCcm93c2VyVmlld01vZGVsLlNIQVJFX0RPTlRfQVNLX0tFWSwgcmVzdWx0LmNvbmZpcm1lZCwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnRlZ3JhdGVkQnJvd3NlclNoYXJlV2l0aEFnZW50RXZlbnQsIEludGVncmF0ZWRCcm93c2VyU2hhcmVXaXRoQWdlbnRDbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHRcdFx0J2ludGVncmF0ZWRCcm93c2VyLnNoYXJlV2l0aEFnZW50Jyxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzaGFyZWQ6IHJlc3VsdC5jb25maXJtZWQsXG5cdFx0XHRcdFx0XHRkb250QXNrQWdhaW46IHJlc3VsdC5jaGVja2JveENoZWNrZWQgPz8gZmFsc2Vcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnRlZ3JhdGVkQnJvd3NlclNoYXJlV2l0aEFnZW50RXZlbnQsIEludGVncmF0ZWRCcm93c2VyU2hhcmVXaXRoQWdlbnRDbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHRcdFx0J2ludGVncmF0ZWRCcm93c2VyLnNoYXJlV2l0aEFnZW50Jyxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzaGFyZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRkb250QXNrQWdhaW46IHRydWVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMucGxheXdyaWdodFNlcnZpY2Uuc3RhcnRUcmFja2luZ1BhZ2UodGhpcy5pZCk7XG5cdFx0XHR0aGlzLl9zZXRTaGFyZWRXaXRoQWdlbnQodHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMucGxheXdyaWdodFNlcnZpY2Uuc3RvcFRyYWNraW5nUGFnZSh0aGlzLmlkKTtcblx0XHRcdHRoaXMuX3NldFNoYXJlZFdpdGhBZ2VudChmYWxzZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTaGFyZWRXaXRoQWdlbnQoaXNTaGFyZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoaXNTaGFyZWQgIT09IHRoaXMuX3NoYXJlZFdpdGhBZ2VudCkge1xuXHRcdFx0dGhpcy5fc2hhcmVkV2l0aEFnZW50ID0gaXNTaGFyZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNoYXJpbmdTdGF0ZS5maXJlKHRoaXMuc2hhcmluZ1N0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWxvYWRIaXN0b3J5RW50cmllcyhrZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KGtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR0aGlzLmhpc3RvcnkuZW50cmllcy5oeWRyYXRlKHBhcnNlSGlzdG9yeVNuYXBzaG90PElTZXJpYWxpemVkQnJvd3Nlckhpc3RvcnlFbnRyaWVzU25hcHNob3Q+KHJhdykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVsb2FkSGlzdG9yeUZhdmljb25zKGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoa2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdHRoaXMuaGlzdG9yeS5mYXZpY29ucy5oeWRyYXRlKHBhcnNlSGlzdG9yeVNuYXBzaG90PElTZXJpYWxpemVkQnJvd3NlckZhdmljb25zU25hcHNob3Q+KHJhdykpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExvZyBuYXZpZ2F0aW9uIHRlbGVtZXRyeSBldmVudFxuXHQgKi9cblx0cHJpdmF0ZSBsb2dOYXZpZ2F0aW9uVGVsZW1ldHJ5KG5hdmlnYXRpb25UeXBlOiBJbnRlZ3JhdGVkQnJvd3Nlck5hdmlnYXRpb25FdmVudFsnbmF2aWdhdGlvblR5cGUnXSwgdXJsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRsZXQgbG9jYWxob3N0OiBib29sZWFuO1xuXHRcdHRyeSB7XG5cdFx0XHRsb2NhbGhvc3QgPSBpc0xvY2FsaG9zdEF1dGhvcml0eShuZXcgVVJMKHVybCkuaG9zdCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRsb2NhbGhvc3QgPSBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnRlZ3JhdGVkQnJvd3Nlck5hdmlnYXRpb25FdmVudCwgSW50ZWdyYXRlZEJyb3dzZXJOYXZpZ2F0aW9uQ2xhc3NpZmljYXRpb24+KFxuXHRcdFx0J2ludGVncmF0ZWRCcm93c2VyLm5hdmlnYXRpb24nLFxuXHRcdFx0e1xuXHRcdFx0XHRuYXZpZ2F0aW9uVHlwZSxcblx0XHRcdFx0aXNMb2NhbGhvc3Q6IGxvY2FsaG9zdFxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uV2lsbERpc3Bvc2UuZmlyZSgpO1xuXG5cdFx0Ly8gU3RvcCBzaGFyaW5nIHdpdGggdGhlIGFnZW50IGJlZm9yZSBkZXN0cm95aW5nIHRoZSB2aWV3IHNvIHRoZVxuXHRcdC8vIHRyYWNrZWQtcGFnZXMgc2V0IHN0YXlzIGluIHN5bmMgd2l0aCBsaXZlIHZpZXdzLlxuXHRcdGlmICh0aGlzLl9zaGFyZWRXaXRoQWdlbnQpIHtcblx0XHRcdHZvaWQgdGhpcy5wbGF5d3JpZ2h0U2VydmljZS5zdG9wVHJhY2tpbmdQYWdlKHRoaXMuaWQpO1xuXHRcdH1cblxuXHRcdC8vIENsZWFuIHVwIHRoZSBicm93c2VyIHZpZXcgd2hlbiB0aGUgbW9kZWwgaXMgZGlzcG9zZWRcblx0XHR2b2lkIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLmRlc3Ryb3lCcm93c2VyVmlldyh0aGlzLmlkKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1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
