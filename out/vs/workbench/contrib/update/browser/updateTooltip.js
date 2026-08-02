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
import * as dom from "../../../../base/browser/dom.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IMeteredConnectionService } from "../../../../platform/meteredConnection/common/meteredConnection.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { DisablementReason, StateType } from "../../../../platform/update/common/update.js";
import { ShowCurrentReleaseNotesActionId } from "../common/update.js";
import { computeDownloadSpeed, computeDownloadTimeRemaining, computeProgressPercent, formatBytes, formatDate, formatTimeRemaining, tryParseDate } from "../common/updateUtils.js";
import "./media/updateTooltip.css";
let UpdateTooltip = class extends Disposable {
  constructor(clipboardService, commandService, configurationService, hoverService, meteredConnectionService, productService) {
    super();
    this.clipboardService = clipboardService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.hoverService = hoverService;
    this.meteredConnectionService = meteredConnectionService;
    this.productService = productService;
    this.domNode = dom.$(".update-tooltip");
    const header = dom.append(this.domNode, dom.$(".header"));
    this.titleNode = dom.append(header, dom.$(".title"));
    this.productInfoNode = dom.append(this.domNode, dom.$(".product-info"));
    const logoContainer = dom.append(this.productInfoNode, dom.$(".product-logo"));
    logoContainer.setAttribute("role", "img");
    logoContainer.setAttribute("aria-label", this.productService.nameLong);
    const details = dom.append(this.productInfoNode, dom.$(".product-details"));
    this.productNameNode = dom.append(details, dom.$(".product-name"));
    this.productNameNode.textContent = this.productService.nameLong;
    const currentVersionRow = this.createVersionRow(details);
    this.currentVersionNode = currentVersionRow.label;
    this.currentVersionCopyValue = currentVersionRow.copyValue;
    const latestVersionRow = this.createVersionRow(details);
    this.latestVersionNode = latestVersionRow.label;
    this.latestVersionCopyValue = latestVersionRow.copyValue;
    this.releaseDateNode = dom.append(details, dom.$(".product-release-date"));
    this.progressContainer = dom.append(this.domNode, dom.$(".progress-container"));
    const progressBar = dom.append(this.progressContainer, dom.$(".progress-bar"));
    this.progressFill = dom.append(progressBar, dom.$(".progress-fill"));
    const progressText = dom.append(this.progressContainer, dom.$(".progress-text"));
    this.progressPercentNode = dom.append(progressText, dom.$("span"));
    this.progressSizeNode = dom.append(progressText, dom.$("span"));
    this.downloadStatsContainer = dom.append(this.progressContainer, dom.$(".download-stats"));
    this.timeRemainingNode = dom.append(this.downloadStatsContainer, dom.$(".time-remaining"));
    this.speedInfoNode = dom.append(this.downloadStatsContainer, dom.$(".speed-info"));
    this.messageNode = dom.append(this.domNode, dom.$(".state-message"));
    this.buttonBar = dom.append(this.domNode, dom.$(".button-bar"));
    this.releaseNotesButton = dom.append(this.buttonBar, dom.$("button.release-notes-button"));
    this.releaseNotesButton.textContent = localize("updateTooltip.viewReleaseNotes", "Release Notes");
    this._register(dom.addDisposableListener(this.releaseNotesButton, "click", () => {
      if (this.releaseNotesVersion) {
        this.runCommandAndClose(ShowCurrentReleaseNotesActionId, this.releaseNotesVersion);
      }
    }));
    this.actionButton = dom.append(this.buttonBar, dom.$("button.action-button"));
    this._register(dom.addDisposableListener(this.actionButton, "click", () => {
      const commandId = this.actionButton.dataset.commandId;
      if (commandId) {
        this.runCommandAndClose(commandId);
      }
    }));
    this.updateCurrentVersion();
  }
  updateCurrentVersion() {
    const productVersion = this.productService.version;
    if (productVersion) {
      const currentCommitId = this.productService.commit?.substring(0, 7);
      this.currentVersionNode.textContent = currentCommitId ? localize("updateTooltip.currentVersionLabelWithCommit", "Current Version: {0} ({1})", productVersion, currentCommitId) : localize("updateTooltip.currentVersionLabel", "Current Version: {0}", productVersion);
      this.currentVersionCopyValue.value = currentCommitId ? `${productVersion} (${this.productService.commit})` : productVersion;
      this.currentVersionNode.parentElement.style.display = "";
    } else {
      this.currentVersionNode.parentElement.style.display = "none";
    }
  }
  hideAll() {
    this.productInfoNode.style.display = "";
    this.progressContainer.style.display = "none";
    this.speedInfoNode.textContent = "";
    this.timeRemainingNode.textContent = "";
    this.messageNode.style.display = "none";
    this.actionButton.style.display = "none";
    this.actionButton.dataset.commandId = "";
    this.releaseNotesButton.style.marginRight = "";
  }
  renderState(state) {
    this.hideAll();
    switch (state.type) {
      case StateType.Uninitialized:
        this.renderUninitialized();
        break;
      case StateType.Disabled:
        this.renderDisabled(state);
        break;
      case StateType.Idle:
        this.renderIdle(state);
        break;
      case StateType.CheckingForUpdates:
        this.renderCheckingForUpdates();
        break;
      case StateType.AvailableForDownload:
        this.renderAvailableForDownload(state);
        break;
      case StateType.Downloading:
        this.renderDownloading(state);
        break;
      case StateType.Downloaded:
        this.renderDownloaded(state);
        break;
      case StateType.Updating:
        this.renderUpdating(state);
        break;
      case StateType.Ready:
        this.renderReady(state);
        break;
      case StateType.Overwriting:
        this.renderOverwriting(state);
        break;
      case StateType.Cancelling:
        this.renderCancelling();
        break;
      case StateType.Restarting:
        this.renderRestarting(state);
        break;
    }
  }
  renderUninitialized() {
    this.renderTitleAndInfo(localize("updateTooltip.initializingTitle", "Initializing"));
    this.renderMessage(localize("updateTooltip.initializingMessage", "Initializing update service..."));
  }
  renderDisabled({ reason }) {
    this.renderTitleAndInfo(localize("updateTooltip.updatesDisabledTitle", "Updates Disabled"));
    switch (reason) {
      case DisablementReason.NotBuilt:
        this.renderMessage(
          localize("updateTooltip.disabledNotBuilt", "Updates are not available for this build."),
          Codicon.info
        );
        break;
      case DisablementReason.DisabledByEnvironment:
        this.renderMessage(
          localize("updateTooltip.disabledByEnvironment", "Updates are disabled by the --disable-updates command line flag."),
          Codicon.warning
        );
        break;
      case DisablementReason.ManuallyDisabled:
        this.renderMessage(
          localize("updateTooltip.disabledManually", 'Updates are manually disabled. Change the "update.mode" setting to enable.'),
          Codicon.warning
        );
        break;
      case DisablementReason.Policy:
        this.renderMessage(
          localize("updateTooltip.disabledByPolicy", "Updates are disabled by organization policy."),
          Codicon.info
        );
        break;
      case DisablementReason.MissingConfiguration:
        this.renderMessage(
          localize("updateTooltip.disabledMissingConfig", "Updates are disabled because no update URL is configured."),
          Codicon.info
        );
        break;
      case DisablementReason.InvalidConfiguration:
        this.renderMessage(
          localize("updateTooltip.disabledInvalidConfig", "Updates are disabled because the update URL is invalid."),
          Codicon.error
        );
        break;
      case DisablementReason.RunningAsAdmin:
        this.renderMessage(
          localize(
            "updateTooltip.disabledRunningAsAdmin",
            "Updates are not available when running a user install of {0} as administrator.",
            this.productService.nameShort
          ),
          Codicon.warning
        );
        break;
      default:
        this.renderMessage(localize("updateTooltip.disabledGeneric", "Updates are disabled."), Codicon.warning);
        break;
    }
  }
  renderIdle({ error, notAvailable }) {
    if (error) {
      this.renderTitleAndInfo(localize("updateTooltip.updateErrorTitle", "Update Error"));
      this.renderMessage(error, Codicon.error);
      return;
    }
    if (notAvailable) {
      this.renderTitleAndInfo(localize("updateTooltip.noUpdateAvailableTitle", "No Update Available"));
      this.renderMessage(localize("updateTooltip.noUpdateAvailableMessage", "There are no updates currently available."), Codicon.info);
      return;
    }
    this.renderTitleAndInfo(localize("updateTooltip.upToDateTitle", "Up to Date"));
    switch (this.configurationService.getValue("update.mode")) {
      case "none":
        this.renderMessage(localize("updateTooltip.autoUpdateNone", "Automatic updates are disabled."), Codicon.warning);
        break;
      case "manual":
        this.renderMessage(localize("updateTooltip.autoUpdateManual", "Automatic updates will be checked but not installed automatically."));
        break;
      case "start":
        this.renderMessage(localize("updateTooltip.autoUpdateStart", "Updates will be applied on restart."));
        break;
      case "default":
        if (this.meteredConnectionService.isConnectionMetered) {
          this.renderMessage(
            localize("updateTooltip.meteredConnectionMessage", "Automatic updates are paused because the network connection is metered."),
            Codicon.radioTower
          );
        } else {
          this.renderMessage(
            localize("updateTooltip.autoUpdateDefault", "Automatic updates are enabled. Happy Coding!"),
            Codicon.smiley
          );
        }
        break;
    }
  }
  renderCheckingForUpdates() {
    this.renderTitleAndInfo(localize("updateTooltip.checkingForUpdatesTitle", "Checking for Updates"));
    this.renderMessage(localize("updateTooltip.checkingPleaseWait", "Checking for updates, please wait..."));
  }
  renderAvailableForDownload({ update }) {
    this.renderTitleAndInfo(localize("updateTooltip.updateAvailableTitle", "Update Available"), update);
    this.renderActionButton(localize("updateTooltip.downloadButton", "Download"), "update.downloadNow");
  }
  renderDownloading(state) {
    this.renderTitleAndInfo(localize("updateTooltip.downloadingUpdateTitle", "Downloading Update"), state.update);
    const { downloadedBytes, totalBytes } = state;
    if (downloadedBytes !== void 0 && totalBytes !== void 0 && totalBytes > 0) {
      const percentage = computeProgressPercent(downloadedBytes, totalBytes) ?? 0;
      this.progressFill.style.width = `${percentage}%`;
      this.progressPercentNode.textContent = `${percentage}%`;
      this.progressSizeNode.textContent = `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`;
      this.progressContainer.style.display = "";
      const speed = computeDownloadSpeed(state);
      if (speed !== void 0 && speed > 0) {
        this.speedInfoNode.textContent = localize("updateTooltip.downloadSpeed", "{0}/s", formatBytes(speed));
      }
      const timeRemaining = computeDownloadTimeRemaining(state);
      if (timeRemaining !== void 0 && timeRemaining > 0) {
        this.timeRemainingNode.textContent = `~${formatTimeRemaining(timeRemaining)} ${localize("updateTooltip.timeRemaining", "remaining")}`;
      }
      this.downloadStatsContainer.style.display = "";
    } else {
      this.renderMessage(localize("updateTooltip.downloadingPleaseWait", "Downloading update, please wait..."));
    }
  }
  renderDownloaded({ update }) {
    this.renderTitleAndInfo(localize("updateTooltip.updateReadyTitle", "Update is Ready to Install"), update);
    this.renderActionButton(localize("updateTooltip.installButton", "Install"), "update.install");
  }
  renderUpdating({ update, currentProgress, maxProgress }) {
    this.renderTitleAndInfo(localize("updateTooltip.installingUpdateTitle", "Installing Update"), update);
    const percentage = computeProgressPercent(currentProgress, maxProgress);
    if (percentage !== void 0) {
      this.progressFill.style.width = `${percentage}%`;
      this.progressPercentNode.textContent = `${percentage}%`;
      this.progressSizeNode.textContent = "";
      this.progressContainer.style.display = "";
    } else {
      this.renderMessage(localize("updateTooltip.installingPleaseWait", "Installing update, please wait..."));
    }
  }
  renderReady({ update }) {
    if (this.configurationService.getValue("update.mode") === "manual") {
      this.renderTitleAndInfo(localize("updateTooltip.updateInstalledTitle", "Update Installed"), update);
      this.renderActionButton(localize("updateTooltip.restartButton", "Restart"), "update.restart");
    } else {
      this.renderTitleAndInfo(localize("updateTooltip.restartToUpdateTitle", "Restart to Update"), update);
    }
  }
  renderOverwriting({ update }) {
    this.renderTitleAndInfo(localize("updateTooltip.downloadingNewerUpdateTitle", "Downloading Newer Update"), update);
    this.renderMessage(localize("updateTooltip.downloadingNewerPleaseWait", "A newer update was released. Downloading, please wait..."));
  }
  renderRestarting({ update }) {
    this.renderTitleAndInfo(localize("updateTooltip.restartingTitle", "Restarting {0}", this.productService.nameShort), update);
    this.renderMessage(localize("updateTooltip.restartingPleaseWait", "Restarting to update, please wait..."));
  }
  renderCancelling() {
    this.renderTitleAndInfo(localize("updateTooltip.cancellingTitle", "Cancelling Update"));
    this.renderMessage(localize("updateTooltip.cancellingPleaseWait", "Cancelling update, please wait..."));
  }
  renderTitleAndInfo(title, update) {
    this.titleNode.textContent = title;
    const version = update?.productVersion;
    if (version) {
      const updateCommitId = update.version?.substring(0, 7);
      this.latestVersionNode.textContent = updateCommitId ? localize("updateTooltip.latestVersionLabelWithCommit", "Latest Version: {0} ({1})", version, updateCommitId) : localize("updateTooltip.latestVersionLabel", "Latest Version: {0}", version);
      this.latestVersionCopyValue.value = updateCommitId ? `${version} (${update.version})` : version;
      this.latestVersionNode.parentElement.style.display = "";
    } else {
      this.latestVersionNode.parentElement.style.display = "none";
    }
    const releaseDate = update?.timestamp ?? tryParseDate(this.productService.date);
    if (typeof releaseDate === "number" && releaseDate > 0) {
      this.releaseDateNode.textContent = localize("updateTooltip.releasedLabel", "Released {0}", formatDate(releaseDate));
      this.releaseDateNode.style.display = "";
    } else {
      this.releaseDateNode.style.display = "none";
    }
    this.releaseNotesVersion = version ?? this.productService.version;
    this.releaseNotesButton.style.display = this.releaseNotesVersion ? "" : "none";
    this.releaseNotesButton.style.marginRight = this.releaseNotesVersion ? "auto" : "";
    this.buttonBar.style.display = this.releaseNotesVersion ? "" : "none";
  }
  renderActionButton(label, commandId) {
    this.actionButton.textContent = label;
    this.actionButton.dataset.commandId = commandId;
    this.actionButton.style.display = "";
  }
  renderMessage(message, icon) {
    dom.clearNode(this.messageNode);
    if (icon) {
      const iconNode = dom.append(this.messageNode, dom.$(".state-message-icon"));
      iconNode.classList.add(...ThemeIcon.asClassNameArray(icon));
    }
    dom.append(this.messageNode, document.createTextNode(message));
    this.messageNode.style.display = "";
  }
  createVersionRow(parent) {
    const row = dom.append(parent, dom.$(".product-version"));
    const label = dom.append(row, dom.$("span"));
    const copyValue = { value: "" };
    const copyButton = dom.append(row, dom.$("a.copy-version-button"));
    copyButton.setAttribute("role", "button");
    copyButton.setAttribute("tabindex", "0");
    const title = localize("updateTooltip.copyVersion", "Copy");
    copyButton.title = title;
    copyButton.setAttribute("aria-label", title);
    const copyIcon = dom.append(copyButton, dom.$(".copy-icon"));
    copyIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.copy));
    this._register(dom.addDisposableListener(copyButton, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (copyValue.value) {
        this.clipboardService.writeText(copyValue.value);
      }
    }));
    return { label, copyValue };
  }
  runCommandAndClose(command, ...args) {
    this.commandService.executeCommand(command, ...args);
    this.hoverService.hideHover(true);
  }
};
UpdateTooltip = __decorateClass([
  __decorateParam(0, IClipboardService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IMeteredConnectionService),
  __decorateParam(5, IProductService)
], UpdateTooltip);
export {
  UpdateTooltip
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VwZGF0ZS9icm93c2VyL3VwZGF0ZVRvb2x0aXAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21ldGVyZWRDb25uZWN0aW9uL2NvbW1vbi9tZXRlcmVkQ29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdmFpbGFibGVGb3JEb3dubG9hZCwgRGlzYWJsZWQsIERpc2FibGVtZW50UmVhc29uLCBEb3dubG9hZGVkLCBEb3dubG9hZGluZywgSWRsZSwgSVVwZGF0ZSwgT3ZlcndyaXRpbmcsIFJlYWR5LCBSZXN0YXJ0aW5nLCBTdGF0ZSwgU3RhdGVUeXBlLCBVcGRhdGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VwZGF0ZS9jb21tb24vdXBkYXRlLmpzJztcbmltcG9ydCB7IFNob3dDdXJyZW50UmVsZWFzZU5vdGVzQWN0aW9uSWQgfSBmcm9tICcuLi9jb21tb24vdXBkYXRlLmpzJztcbmltcG9ydCB7IGNvbXB1dGVEb3dubG9hZFNwZWVkLCBjb21wdXRlRG93bmxvYWRUaW1lUmVtYWluaW5nLCBjb21wdXRlUHJvZ3Jlc3NQZXJjZW50LCBmb3JtYXRCeXRlcywgZm9ybWF0RGF0ZSwgZm9ybWF0VGltZVJlbWFpbmluZywgdHJ5UGFyc2VEYXRlIH0gZnJvbSAnLi4vY29tbW9uL3VwZGF0ZVV0aWxzLmpzJztcbmltcG9ydCAnLi9tZWRpYS91cGRhdGVUb29sdGlwLmNzcyc7XG5cbi8qKlxuICogQSBzdGF0ZWZ1bCB0b29sdGlwIGNvbnRyb2wgZm9yIHRoZSB1cGRhdGUgc3RhdHVzLlxuICovXG5leHBvcnQgY2xhc3MgVXBkYXRlVG9vbHRpcCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Ly8gSGVhZGVyIHNlY3Rpb25cblx0cHJpdmF0ZSByZWFkb25seSB0aXRsZU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdC8vIFByb2R1Y3QgaW5mbyBzZWN0aW9uXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdEluZm9Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBwcm9kdWN0TmFtZU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGN1cnJlbnRWZXJzaW9uTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY3VycmVudFZlcnNpb25Db3B5VmFsdWU6IHsgdmFsdWU6IHN0cmluZyB9O1xuXHRwcml2YXRlIHJlYWRvbmx5IGxhdGVzdFZlcnNpb25Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBsYXRlc3RWZXJzaW9uQ29weVZhbHVlOiB7IHZhbHVlOiBzdHJpbmcgfTtcblx0cHJpdmF0ZSByZWFkb25seSByZWxlYXNlRGF0ZU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdC8vIFByb2dyZXNzIHNlY3Rpb25cblx0cHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NGaWxsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1BlcmNlbnROb2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NpemVOb2RlOiBIVE1MRWxlbWVudDtcblxuXHQvLyBFeHRyYSBkb3dubG9hZCBpbmZvXG5cdHByaXZhdGUgcmVhZG9ubHkgZG93bmxvYWRTdGF0c0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGltZVJlbWFpbmluZ05vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNwZWVkSW5mb05vZGU6IEhUTUxFbGVtZW50O1xuXG5cdC8vIFN0YXRlLXNwZWNpZmljIG1lc3NhZ2Vcblx0cHJpdmF0ZSByZWFkb25seSBtZXNzYWdlTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Ly8gQnV0dG9uIGJhclxuXHRwcml2YXRlIHJlYWRvbmx5IGJ1dHRvbkJhcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVsZWFzZU5vdGVzQnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBhY3Rpb25CdXR0b246IEhUTUxCdXR0b25FbGVtZW50O1xuXG5cdHByaXZhdGUgcmVsZWFzZU5vdGVzVmVyc2lvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlOiBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gZG9tLiQoJy51cGRhdGUtdG9vbHRpcCcpO1xuXG5cdFx0Ly8gSGVhZGVyIHNlY3Rpb25cblx0XHRjb25zdCBoZWFkZXIgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJy5oZWFkZXInKSk7XG5cdFx0dGhpcy50aXRsZU5vZGUgPSBkb20uYXBwZW5kKGhlYWRlciwgZG9tLiQoJy50aXRsZScpKTtcblxuXHRcdC8vIFByb2R1Y3QgaW5mbyBzZWN0aW9uXG5cdFx0dGhpcy5wcm9kdWN0SW5mb05vZGUgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJy5wcm9kdWN0LWluZm8nKSk7XG5cblx0XHRjb25zdCBsb2dvQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLnByb2R1Y3RJbmZvTm9kZSwgZG9tLiQoJy5wcm9kdWN0LWxvZ28nKSk7XG5cdFx0bG9nb0NvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnaW1nJyk7XG5cdFx0bG9nb0NvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKTtcblxuXHRcdGNvbnN0IGRldGFpbHMgPSBkb20uYXBwZW5kKHRoaXMucHJvZHVjdEluZm9Ob2RlLCBkb20uJCgnLnByb2R1Y3QtZGV0YWlscycpKTtcblxuXHRcdHRoaXMucHJvZHVjdE5hbWVOb2RlID0gZG9tLmFwcGVuZChkZXRhaWxzLCBkb20uJCgnLnByb2R1Y3QtbmFtZScpKTtcblx0XHR0aGlzLnByb2R1Y3ROYW1lTm9kZS50ZXh0Q29udGVudCA9IHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmc7XG5cblx0XHRjb25zdCBjdXJyZW50VmVyc2lvblJvdyA9IHRoaXMuY3JlYXRlVmVyc2lvblJvdyhkZXRhaWxzKTtcblx0XHR0aGlzLmN1cnJlbnRWZXJzaW9uTm9kZSA9IGN1cnJlbnRWZXJzaW9uUm93LmxhYmVsO1xuXHRcdHRoaXMuY3VycmVudFZlcnNpb25Db3B5VmFsdWUgPSBjdXJyZW50VmVyc2lvblJvdy5jb3B5VmFsdWU7XG5cblx0XHRjb25zdCBsYXRlc3RWZXJzaW9uUm93ID0gdGhpcy5jcmVhdGVWZXJzaW9uUm93KGRldGFpbHMpO1xuXHRcdHRoaXMubGF0ZXN0VmVyc2lvbk5vZGUgPSBsYXRlc3RWZXJzaW9uUm93LmxhYmVsO1xuXHRcdHRoaXMubGF0ZXN0VmVyc2lvbkNvcHlWYWx1ZSA9IGxhdGVzdFZlcnNpb25Sb3cuY29weVZhbHVlO1xuXG5cdFx0dGhpcy5yZWxlYXNlRGF0ZU5vZGUgPSBkb20uYXBwZW5kKGRldGFpbHMsIGRvbS4kKCcucHJvZHVjdC1yZWxlYXNlLWRhdGUnKSk7XG5cblx0XHQvLyBQcm9ncmVzcyBzZWN0aW9uXG5cdFx0dGhpcy5wcm9ncmVzc0NvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLnByb2dyZXNzLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBwcm9ncmVzc0JhciA9IGRvbS5hcHBlbmQodGhpcy5wcm9ncmVzc0NvbnRhaW5lciwgZG9tLiQoJy5wcm9ncmVzcy1iYXInKSk7XG5cdFx0dGhpcy5wcm9ncmVzc0ZpbGwgPSBkb20uYXBwZW5kKHByb2dyZXNzQmFyLCBkb20uJCgnLnByb2dyZXNzLWZpbGwnKSk7XG5cblx0XHRjb25zdCBwcm9ncmVzc1RleHQgPSBkb20uYXBwZW5kKHRoaXMucHJvZ3Jlc3NDb250YWluZXIsIGRvbS4kKCcucHJvZ3Jlc3MtdGV4dCcpKTtcblx0XHR0aGlzLnByb2dyZXNzUGVyY2VudE5vZGUgPSBkb20uYXBwZW5kKHByb2dyZXNzVGV4dCwgZG9tLiQoJ3NwYW4nKSk7XG5cdFx0dGhpcy5wcm9ncmVzc1NpemVOb2RlID0gZG9tLmFwcGVuZChwcm9ncmVzc1RleHQsIGRvbS4kKCdzcGFuJykpO1xuXG5cdFx0Ly8gRXh0cmEgZG93bmxvYWQgc3RhdHNcblx0XHR0aGlzLmRvd25sb2FkU3RhdHNDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMucHJvZ3Jlc3NDb250YWluZXIsIGRvbS4kKCcuZG93bmxvYWQtc3RhdHMnKSk7XG5cdFx0dGhpcy50aW1lUmVtYWluaW5nTm9kZSA9IGRvbS5hcHBlbmQodGhpcy5kb3dubG9hZFN0YXRzQ29udGFpbmVyLCBkb20uJCgnLnRpbWUtcmVtYWluaW5nJykpO1xuXHRcdHRoaXMuc3BlZWRJbmZvTm9kZSA9IGRvbS5hcHBlbmQodGhpcy5kb3dubG9hZFN0YXRzQ29udGFpbmVyLCBkb20uJCgnLnNwZWVkLWluZm8nKSk7XG5cblx0XHQvLyBTdGF0ZS1zcGVjaWZpYyBtZXNzYWdlXG5cdFx0dGhpcy5tZXNzYWdlTm9kZSA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLnN0YXRlLW1lc3NhZ2UnKSk7XG5cblx0XHQvLyBCdXR0b24gYmFyXG5cdFx0dGhpcy5idXR0b25CYXIgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJy5idXR0b24tYmFyJykpO1xuXG5cdFx0dGhpcy5yZWxlYXNlTm90ZXNCdXR0b24gPSBkb20uYXBwZW5kKHRoaXMuYnV0dG9uQmFyLCBkb20uJCgnYnV0dG9uLnJlbGVhc2Utbm90ZXMtYnV0dG9uJykpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdHRoaXMucmVsZWFzZU5vdGVzQnV0dG9uLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAudmlld1JlbGVhc2VOb3RlcycsIFwiUmVsZWFzZSBOb3Rlc1wiKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMucmVsZWFzZU5vdGVzQnV0dG9uLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5yZWxlYXNlTm90ZXNWZXJzaW9uKSB7XG5cdFx0XHRcdHRoaXMucnVuQ29tbWFuZEFuZENsb3NlKFNob3dDdXJyZW50UmVsZWFzZU5vdGVzQWN0aW9uSWQsIHRoaXMucmVsZWFzZU5vdGVzVmVyc2lvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5hY3Rpb25CdXR0b24gPSBkb20uYXBwZW5kKHRoaXMuYnV0dG9uQmFyLCBkb20uJCgnYnV0dG9uLmFjdGlvbi1idXR0b24nKSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmFjdGlvbkJ1dHRvbiwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZElkID0gdGhpcy5hY3Rpb25CdXR0b24uZGF0YXNldC5jb21tYW5kSWQ7XG5cdFx0XHRpZiAoY29tbWFuZElkKSB7XG5cdFx0XHRcdHRoaXMucnVuQ29tbWFuZEFuZENsb3NlKGNvbW1hbmRJZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUG9wdWxhdGUgc3RhdGljIHByb2R1Y3QgaW5mb1xuXHRcdHRoaXMudXBkYXRlQ3VycmVudFZlcnNpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ3VycmVudFZlcnNpb24oKSB7XG5cdFx0Y29uc3QgcHJvZHVjdFZlcnNpb24gPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb247XG5cdFx0aWYgKHByb2R1Y3RWZXJzaW9uKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50Q29tbWl0SWQgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdD8uc3Vic3RyaW5nKDAsIDcpO1xuXHRcdFx0dGhpcy5jdXJyZW50VmVyc2lvbk5vZGUudGV4dENvbnRlbnQgPSBjdXJyZW50Q29tbWl0SWRcblx0XHRcdFx0PyBsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5jdXJyZW50VmVyc2lvbkxhYmVsV2l0aENvbW1pdCcsIFwiQ3VycmVudCBWZXJzaW9uOiB7MH0gKHsxfSlcIiwgcHJvZHVjdFZlcnNpb24sIGN1cnJlbnRDb21taXRJZClcblx0XHRcdFx0OiBsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5jdXJyZW50VmVyc2lvbkxhYmVsJywgXCJDdXJyZW50IFZlcnNpb246IHswfVwiLCBwcm9kdWN0VmVyc2lvbik7XG5cdFx0XHR0aGlzLmN1cnJlbnRWZXJzaW9uQ29weVZhbHVlLnZhbHVlID0gY3VycmVudENvbW1pdElkID8gYCR7cHJvZHVjdFZlcnNpb259ICgke3RoaXMucHJvZHVjdFNlcnZpY2UuY29tbWl0fSlgIDogcHJvZHVjdFZlcnNpb247XG5cdFx0XHR0aGlzLmN1cnJlbnRWZXJzaW9uTm9kZS5wYXJlbnRFbGVtZW50IS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY3VycmVudFZlcnNpb25Ob2RlLnBhcmVudEVsZW1lbnQhLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoaWRlQWxsKCkge1xuXHRcdHRoaXMucHJvZHVjdEluZm9Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0aGlzLnByb2dyZXNzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5zcGVlZEluZm9Ob2RlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGhpcy50aW1lUmVtYWluaW5nTm9kZS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRoaXMubWVzc2FnZU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLmFjdGlvbkJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuYWN0aW9uQnV0dG9uLmRhdGFzZXQuY29tbWFuZElkID0gJyc7XG5cdFx0dGhpcy5yZWxlYXNlTm90ZXNCdXR0b24uc3R5bGUubWFyZ2luUmlnaHQgPSAnJztcblx0fVxuXG5cdHB1YmxpYyByZW5kZXJTdGF0ZShzdGF0ZTogU3RhdGUpIHtcblx0XHR0aGlzLmhpZGVBbGwoKTtcblx0XHRzd2l0Y2ggKHN0YXRlLnR5cGUpIHtcblx0XHRcdGNhc2UgU3RhdGVUeXBlLlVuaW5pdGlhbGl6ZWQ6XG5cdFx0XHRcdHRoaXMucmVuZGVyVW5pbml0aWFsaXplZCgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3RhdGVUeXBlLkRpc2FibGVkOlxuXHRcdFx0XHR0aGlzLnJlbmRlckRpc2FibGVkKHN0YXRlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5JZGxlOlxuXHRcdFx0XHR0aGlzLnJlbmRlcklkbGUoc3RhdGUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3RhdGVUeXBlLkNoZWNraW5nRm9yVXBkYXRlczpcblx0XHRcdFx0dGhpcy5yZW5kZXJDaGVja2luZ0ZvclVwZGF0ZXMoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5BdmFpbGFibGVGb3JEb3dubG9hZDpcblx0XHRcdFx0dGhpcy5yZW5kZXJBdmFpbGFibGVGb3JEb3dubG9hZChzdGF0ZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRG93bmxvYWRpbmc6XG5cdFx0XHRcdHRoaXMucmVuZGVyRG93bmxvYWRpbmcoc3RhdGUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3RhdGVUeXBlLkRvd25sb2FkZWQ6XG5cdFx0XHRcdHRoaXMucmVuZGVyRG93bmxvYWRlZChzdGF0ZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuVXBkYXRpbmc6XG5cdFx0XHRcdHRoaXMucmVuZGVyVXBkYXRpbmcoc3RhdGUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3RhdGVUeXBlLlJlYWR5OlxuXHRcdFx0XHR0aGlzLnJlbmRlclJlYWR5KHN0YXRlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5PdmVyd3JpdGluZzpcblx0XHRcdFx0dGhpcy5yZW5kZXJPdmVyd3JpdGluZyhzdGF0ZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuQ2FuY2VsbGluZzpcblx0XHRcdFx0dGhpcy5yZW5kZXJDYW5jZWxsaW5nKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuUmVzdGFydGluZzpcblx0XHRcdFx0dGhpcy5yZW5kZXJSZXN0YXJ0aW5nKHN0YXRlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJVbmluaXRpYWxpemVkKCkge1xuXHRcdHRoaXMucmVuZGVyVGl0bGVBbmRJbmZvKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmluaXRpYWxpemluZ1RpdGxlJywgXCJJbml0aWFsaXppbmdcIikpO1xuXHRcdHRoaXMucmVuZGVyTWVzc2FnZShsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5pbml0aWFsaXppbmdNZXNzYWdlJywgXCJJbml0aWFsaXppbmcgdXBkYXRlIHNlcnZpY2UuLi5cIikpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJEaXNhYmxlZCh7IHJlYXNvbiB9OiBEaXNhYmxlZCkge1xuXHRcdHRoaXMucmVuZGVyVGl0bGVBbmRJbmZvKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLnVwZGF0ZXNEaXNhYmxlZFRpdGxlJywgXCJVcGRhdGVzIERpc2FibGVkXCIpKTtcblx0XHRzd2l0Y2ggKHJlYXNvbikge1xuXHRcdFx0Y2FzZSBEaXNhYmxlbWVudFJlYXNvbi5Ob3RCdWlsdDpcblx0XHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKFxuXHRcdFx0XHRcdGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmRpc2FibGVkTm90QnVpbHQnLCBcIlVwZGF0ZXMgYXJlIG5vdCBhdmFpbGFibGUgZm9yIHRoaXMgYnVpbGQuXCIpLFxuXHRcdFx0XHRcdENvZGljb24uaW5mbyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBEaXNhYmxlbWVudFJlYXNvbi5EaXNhYmxlZEJ5RW52aXJvbm1lbnQ6XG5cdFx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShcblx0XHRcdFx0XHRsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5kaXNhYmxlZEJ5RW52aXJvbm1lbnQnLCBcIlVwZGF0ZXMgYXJlIGRpc2FibGVkIGJ5IHRoZSAtLWRpc2FibGUtdXBkYXRlcyBjb21tYW5kIGxpbmUgZmxhZy5cIiksXG5cdFx0XHRcdFx0Q29kaWNvbi53YXJuaW5nKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIERpc2FibGVtZW50UmVhc29uLk1hbnVhbGx5RGlzYWJsZWQ6XG5cdFx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShcblx0XHRcdFx0XHRsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5kaXNhYmxlZE1hbnVhbGx5JywgXCJVcGRhdGVzIGFyZSBtYW51YWxseSBkaXNhYmxlZC4gQ2hhbmdlIHRoZSBcXFwidXBkYXRlLm1vZGVcXFwiIHNldHRpbmcgdG8gZW5hYmxlLlwiKSxcblx0XHRcdFx0XHRDb2RpY29uLndhcm5pbmcpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRGlzYWJsZW1lbnRSZWFzb24uUG9saWN5OlxuXHRcdFx0XHR0aGlzLnJlbmRlck1lc3NhZ2UoXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuZGlzYWJsZWRCeVBvbGljeScsIFwiVXBkYXRlcyBhcmUgZGlzYWJsZWQgYnkgb3JnYW5pemF0aW9uIHBvbGljeS5cIiksXG5cdFx0XHRcdFx0Q29kaWNvbi5pbmZvKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIERpc2FibGVtZW50UmVhc29uLk1pc3NpbmdDb25maWd1cmF0aW9uOlxuXHRcdFx0XHR0aGlzLnJlbmRlck1lc3NhZ2UoXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuZGlzYWJsZWRNaXNzaW5nQ29uZmlnJywgXCJVcGRhdGVzIGFyZSBkaXNhYmxlZCBiZWNhdXNlIG5vIHVwZGF0ZSBVUkwgaXMgY29uZmlndXJlZC5cIiksXG5cdFx0XHRcdFx0Q29kaWNvbi5pbmZvKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIERpc2FibGVtZW50UmVhc29uLkludmFsaWRDb25maWd1cmF0aW9uOlxuXHRcdFx0XHR0aGlzLnJlbmRlck1lc3NhZ2UoXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuZGlzYWJsZWRJbnZhbGlkQ29uZmlnJywgXCJVcGRhdGVzIGFyZSBkaXNhYmxlZCBiZWNhdXNlIHRoZSB1cGRhdGUgVVJMIGlzIGludmFsaWQuXCIpLFxuXHRcdFx0XHRcdENvZGljb24uZXJyb3IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRGlzYWJsZW1lbnRSZWFzb24uUnVubmluZ0FzQWRtaW46XG5cdFx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShcblx0XHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHRcdCd1cGRhdGVUb29sdGlwLmRpc2FibGVkUnVubmluZ0FzQWRtaW4nLFxuXHRcdFx0XHRcdFx0XCJVcGRhdGVzIGFyZSBub3QgYXZhaWxhYmxlIHdoZW4gcnVubmluZyBhIHVzZXIgaW5zdGFsbCBvZiB7MH0gYXMgYWRtaW5pc3RyYXRvci5cIixcblx0XHRcdFx0XHRcdHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KSxcblx0XHRcdFx0XHRDb2RpY29uLndhcm5pbmcpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5kaXNhYmxlZEdlbmVyaWMnLCBcIlVwZGF0ZXMgYXJlIGRpc2FibGVkLlwiKSwgQ29kaWNvbi53YXJuaW5nKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJJZGxlKHsgZXJyb3IsIG5vdEF2YWlsYWJsZSB9OiBJZGxlKSB7XG5cdFx0aWYgKGVycm9yKSB7XG5cdFx0XHR0aGlzLnJlbmRlclRpdGxlQW5kSW5mbyhsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC51cGRhdGVFcnJvclRpdGxlJywgXCJVcGRhdGUgRXJyb3JcIikpO1xuXHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKGVycm9yLCBDb2RpY29uLmVycm9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAobm90QXZhaWxhYmxlKSB7XG5cdFx0XHR0aGlzLnJlbmRlclRpdGxlQW5kSW5mbyhsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5ub1VwZGF0ZUF2YWlsYWJsZVRpdGxlJywgXCJObyBVcGRhdGUgQXZhaWxhYmxlXCIpKTtcblx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5ub1VwZGF0ZUF2YWlsYWJsZU1lc3NhZ2UnLCBcIlRoZXJlIGFyZSBubyB1cGRhdGVzIGN1cnJlbnRseSBhdmFpbGFibGUuXCIpLCBDb2RpY29uLmluZm8pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyVGl0bGVBbmRJbmZvKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLnVwVG9EYXRlVGl0bGUnLCBcIlVwIHRvIERhdGVcIikpO1xuXHRcdHN3aXRjaCAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCd1cGRhdGUubW9kZScpKSB7XG5cdFx0XHRjYXNlICdub25lJzpcblx0XHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmF1dG9VcGRhdGVOb25lJywgXCJBdXRvbWF0aWMgdXBkYXRlcyBhcmUgZGlzYWJsZWQuXCIpLCBDb2RpY29uLndhcm5pbmcpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ21hbnVhbCc6XG5cdFx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5hdXRvVXBkYXRlTWFudWFsJywgXCJBdXRvbWF0aWMgdXBkYXRlcyB3aWxsIGJlIGNoZWNrZWQgYnV0IG5vdCBpbnN0YWxsZWQgYXV0b21hdGljYWxseS5cIikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3N0YXJ0Jzpcblx0XHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmF1dG9VcGRhdGVTdGFydCcsIFwiVXBkYXRlcyB3aWxsIGJlIGFwcGxpZWQgb24gcmVzdGFydC5cIikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2RlZmF1bHQnOlxuXHRcdFx0XHRpZiAodGhpcy5tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UuaXNDb25uZWN0aW9uTWV0ZXJlZCkge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShcblx0XHRcdFx0XHRcdGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLm1ldGVyZWRDb25uZWN0aW9uTWVzc2FnZScsIFwiQXV0b21hdGljIHVwZGF0ZXMgYXJlIHBhdXNlZCBiZWNhdXNlIHRoZSBuZXR3b3JrIGNvbm5lY3Rpb24gaXMgbWV0ZXJlZC5cIiksXG5cdFx0XHRcdFx0XHRDb2RpY29uLnJhZGlvVG93ZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShcblx0XHRcdFx0XHRcdGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmF1dG9VcGRhdGVEZWZhdWx0JywgXCJBdXRvbWF0aWMgdXBkYXRlcyBhcmUgZW5hYmxlZC4gSGFwcHkgQ29kaW5nIVwiKSxcblx0XHRcdFx0XHRcdENvZGljb24uc21pbGV5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNoZWNraW5nRm9yVXBkYXRlcygpIHtcblx0XHR0aGlzLnJlbmRlclRpdGxlQW5kSW5mbyhsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5jaGVja2luZ0ZvclVwZGF0ZXNUaXRsZScsIFwiQ2hlY2tpbmcgZm9yIFVwZGF0ZXNcIikpO1xuXHRcdHRoaXMucmVuZGVyTWVzc2FnZShsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5jaGVja2luZ1BsZWFzZVdhaXQnLCBcIkNoZWNraW5nIGZvciB1cGRhdGVzLCBwbGVhc2Ugd2FpdC4uLlwiKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckF2YWlsYWJsZUZvckRvd25sb2FkKHsgdXBkYXRlIH06IEF2YWlsYWJsZUZvckRvd25sb2FkKSB7XG5cdFx0dGhpcy5yZW5kZXJUaXRsZUFuZEluZm8obG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAudXBkYXRlQXZhaWxhYmxlVGl0bGUnLCBcIlVwZGF0ZSBBdmFpbGFibGVcIiksIHVwZGF0ZSk7XG5cdFx0dGhpcy5yZW5kZXJBY3Rpb25CdXR0b24obG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuZG93bmxvYWRCdXR0b24nLCBcIkRvd25sb2FkXCIpLCAndXBkYXRlLmRvd25sb2FkTm93Jyk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckRvd25sb2FkaW5nKHN0YXRlOiBEb3dubG9hZGluZykge1xuXHRcdHRoaXMucmVuZGVyVGl0bGVBbmRJbmZvKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmRvd25sb2FkaW5nVXBkYXRlVGl0bGUnLCBcIkRvd25sb2FkaW5nIFVwZGF0ZVwiKSwgc3RhdGUudXBkYXRlKTtcblxuXHRcdGNvbnN0IHsgZG93bmxvYWRlZEJ5dGVzLCB0b3RhbEJ5dGVzIH0gPSBzdGF0ZTtcblx0XHRpZiAoZG93bmxvYWRlZEJ5dGVzICE9PSB1bmRlZmluZWQgJiYgdG90YWxCeXRlcyAhPT0gdW5kZWZpbmVkICYmIHRvdGFsQnl0ZXMgPiAwKSB7XG5cdFx0XHRjb25zdCBwZXJjZW50YWdlID0gY29tcHV0ZVByb2dyZXNzUGVyY2VudChkb3dubG9hZGVkQnl0ZXMsIHRvdGFsQnl0ZXMpID8/IDA7XG5cdFx0XHR0aGlzLnByb2dyZXNzRmlsbC5zdHlsZS53aWR0aCA9IGAke3BlcmNlbnRhZ2V9JWA7XG5cdFx0XHR0aGlzLnByb2dyZXNzUGVyY2VudE5vZGUudGV4dENvbnRlbnQgPSBgJHtwZXJjZW50YWdlfSVgO1xuXHRcdFx0dGhpcy5wcm9ncmVzc1NpemVOb2RlLnRleHRDb250ZW50ID0gYCR7Zm9ybWF0Qnl0ZXMoZG93bmxvYWRlZEJ5dGVzKX0gLyAke2Zvcm1hdEJ5dGVzKHRvdGFsQnl0ZXMpfWA7XG5cdFx0XHR0aGlzLnByb2dyZXNzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblxuXHRcdFx0Y29uc3Qgc3BlZWQgPSBjb21wdXRlRG93bmxvYWRTcGVlZChzdGF0ZSk7XG5cdFx0XHRpZiAoc3BlZWQgIT09IHVuZGVmaW5lZCAmJiBzcGVlZCA+IDApIHtcblx0XHRcdFx0dGhpcy5zcGVlZEluZm9Ob2RlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuZG93bmxvYWRTcGVlZCcsICd7MH0vcycsIGZvcm1hdEJ5dGVzKHNwZWVkKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRpbWVSZW1haW5pbmcgPSBjb21wdXRlRG93bmxvYWRUaW1lUmVtYWluaW5nKHN0YXRlKTtcblx0XHRcdGlmICh0aW1lUmVtYWluaW5nICE9PSB1bmRlZmluZWQgJiYgdGltZVJlbWFpbmluZyA+IDApIHtcblx0XHRcdFx0dGhpcy50aW1lUmVtYWluaW5nTm9kZS50ZXh0Q29udGVudCA9IGB+JHtmb3JtYXRUaW1lUmVtYWluaW5nKHRpbWVSZW1haW5pbmcpfSAke2xvY2FsaXplKCd1cGRhdGVUb29sdGlwLnRpbWVSZW1haW5pbmcnLCBcInJlbWFpbmluZ1wiKX1gO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmRvd25sb2FkU3RhdHNDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlbmRlck1lc3NhZ2UobG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuZG93bmxvYWRpbmdQbGVhc2VXYWl0JywgXCJEb3dubG9hZGluZyB1cGRhdGUsIHBsZWFzZSB3YWl0Li4uXCIpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckRvd25sb2FkZWQoeyB1cGRhdGUgfTogRG93bmxvYWRlZCkge1xuXHRcdHRoaXMucmVuZGVyVGl0bGVBbmRJbmZvKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLnVwZGF0ZVJlYWR5VGl0bGUnLCBcIlVwZGF0ZSBpcyBSZWFkeSB0byBJbnN0YWxsXCIpLCB1cGRhdGUpO1xuXHRcdHRoaXMucmVuZGVyQWN0aW9uQnV0dG9uKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmluc3RhbGxCdXR0b24nLCBcIkluc3RhbGxcIiksICd1cGRhdGUuaW5zdGFsbCcpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJVcGRhdGluZyh7IHVwZGF0ZSwgY3VycmVudFByb2dyZXNzLCBtYXhQcm9ncmVzcyB9OiBVcGRhdGluZykge1xuXHRcdHRoaXMucmVuZGVyVGl0bGVBbmRJbmZvKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmluc3RhbGxpbmdVcGRhdGVUaXRsZScsIFwiSW5zdGFsbGluZyBVcGRhdGVcIiksIHVwZGF0ZSk7XG5cblx0XHRjb25zdCBwZXJjZW50YWdlID0gY29tcHV0ZVByb2dyZXNzUGVyY2VudChjdXJyZW50UHJvZ3Jlc3MsIG1heFByb2dyZXNzKTtcblx0XHRpZiAocGVyY2VudGFnZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnByb2dyZXNzRmlsbC5zdHlsZS53aWR0aCA9IGAke3BlcmNlbnRhZ2V9JWA7XG5cdFx0XHR0aGlzLnByb2dyZXNzUGVyY2VudE5vZGUudGV4dENvbnRlbnQgPSBgJHtwZXJjZW50YWdlfSVgO1xuXHRcdFx0dGhpcy5wcm9ncmVzc1NpemVOb2RlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0aGlzLnByb2dyZXNzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmluc3RhbGxpbmdQbGVhc2VXYWl0JywgXCJJbnN0YWxsaW5nIHVwZGF0ZSwgcGxlYXNlIHdhaXQuLi5cIikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUmVhZHkoeyB1cGRhdGUgfTogUmVhZHkpIHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCd1cGRhdGUubW9kZScpID09PSAnbWFudWFsJykge1xuXHRcdFx0dGhpcy5yZW5kZXJUaXRsZUFuZEluZm8obG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAudXBkYXRlSW5zdGFsbGVkVGl0bGUnLCBcIlVwZGF0ZSBJbnN0YWxsZWRcIiksIHVwZGF0ZSk7XG5cdFx0XHR0aGlzLnJlbmRlckFjdGlvbkJ1dHRvbihsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5yZXN0YXJ0QnV0dG9uJywgXCJSZXN0YXJ0XCIpLCAndXBkYXRlLnJlc3RhcnQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZW5kZXJUaXRsZUFuZEluZm8obG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAucmVzdGFydFRvVXBkYXRlVGl0bGUnLCBcIlJlc3RhcnQgdG8gVXBkYXRlXCIpLCB1cGRhdGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyT3ZlcndyaXRpbmcoeyB1cGRhdGUgfTogT3ZlcndyaXRpbmcpIHtcblx0XHR0aGlzLnJlbmRlclRpdGxlQW5kSW5mbyhsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5kb3dubG9hZGluZ05ld2VyVXBkYXRlVGl0bGUnLCBcIkRvd25sb2FkaW5nIE5ld2VyIFVwZGF0ZVwiKSwgdXBkYXRlKTtcblx0XHR0aGlzLnJlbmRlck1lc3NhZ2UobG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuZG93bmxvYWRpbmdOZXdlclBsZWFzZVdhaXQnLCBcIkEgbmV3ZXIgdXBkYXRlIHdhcyByZWxlYXNlZC4gRG93bmxvYWRpbmcsIHBsZWFzZSB3YWl0Li4uXCIpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUmVzdGFydGluZyh7IHVwZGF0ZSB9OiBSZXN0YXJ0aW5nKSB7XG5cdFx0dGhpcy5yZW5kZXJUaXRsZUFuZEluZm8obG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAucmVzdGFydGluZ1RpdGxlJywgXCJSZXN0YXJ0aW5nIHswfVwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCksIHVwZGF0ZSk7XG5cdFx0dGhpcy5yZW5kZXJNZXNzYWdlKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLnJlc3RhcnRpbmdQbGVhc2VXYWl0JywgXCJSZXN0YXJ0aW5nIHRvIHVwZGF0ZSwgcGxlYXNlIHdhaXQuLi5cIikpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDYW5jZWxsaW5nKCkge1xuXHRcdHRoaXMucmVuZGVyVGl0bGVBbmRJbmZvKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmNhbmNlbGxpbmdUaXRsZScsIFwiQ2FuY2VsbGluZyBVcGRhdGVcIikpO1xuXHRcdHRoaXMucmVuZGVyTWVzc2FnZShsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5jYW5jZWxsaW5nUGxlYXNlV2FpdCcsIFwiQ2FuY2VsbGluZyB1cGRhdGUsIHBsZWFzZSB3YWl0Li4uXCIpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVGl0bGVBbmRJbmZvKHRpdGxlOiBzdHJpbmcsIHVwZGF0ZT86IElVcGRhdGUpIHtcblx0XHR0aGlzLnRpdGxlTm9kZS50ZXh0Q29udGVudCA9IHRpdGxlO1xuXG5cdFx0Ly8gTGF0ZXN0IHZlcnNpb25cblx0XHRjb25zdCB2ZXJzaW9uID0gdXBkYXRlPy5wcm9kdWN0VmVyc2lvbjtcblx0XHRpZiAodmVyc2lvbikge1xuXHRcdFx0Y29uc3QgdXBkYXRlQ29tbWl0SWQgPSB1cGRhdGUudmVyc2lvbj8uc3Vic3RyaW5nKDAsIDcpO1xuXHRcdFx0dGhpcy5sYXRlc3RWZXJzaW9uTm9kZS50ZXh0Q29udGVudCA9IHVwZGF0ZUNvbW1pdElkXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAubGF0ZXN0VmVyc2lvbkxhYmVsV2l0aENvbW1pdCcsIFwiTGF0ZXN0IFZlcnNpb246IHswfSAoezF9KVwiLCB2ZXJzaW9uLCB1cGRhdGVDb21taXRJZClcblx0XHRcdFx0OiBsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5sYXRlc3RWZXJzaW9uTGFiZWwnLCBcIkxhdGVzdCBWZXJzaW9uOiB7MH1cIiwgdmVyc2lvbik7XG5cdFx0XHR0aGlzLmxhdGVzdFZlcnNpb25Db3B5VmFsdWUudmFsdWUgPSB1cGRhdGVDb21taXRJZCA/IGAke3ZlcnNpb259ICgke3VwZGF0ZS52ZXJzaW9ufSlgIDogdmVyc2lvbjtcblx0XHRcdHRoaXMubGF0ZXN0VmVyc2lvbk5vZGUucGFyZW50RWxlbWVudCEuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxhdGVzdFZlcnNpb25Ob2RlLnBhcmVudEVsZW1lbnQhLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0Ly8gUmVsZWFzZSBkYXRlXG5cdFx0Y29uc3QgcmVsZWFzZURhdGUgPSB1cGRhdGU/LnRpbWVzdGFtcCA/PyB0cnlQYXJzZURhdGUodGhpcy5wcm9kdWN0U2VydmljZS5kYXRlKTtcblx0XHRpZiAodHlwZW9mIHJlbGVhc2VEYXRlID09PSAnbnVtYmVyJyAmJiByZWxlYXNlRGF0ZSA+IDApIHtcblx0XHRcdHRoaXMucmVsZWFzZURhdGVOb2RlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAucmVsZWFzZWRMYWJlbCcsIFwiUmVsZWFzZWQgezB9XCIsIGZvcm1hdERhdGUocmVsZWFzZURhdGUpKTtcblx0XHRcdHRoaXMucmVsZWFzZURhdGVOb2RlLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZWxlYXNlRGF0ZU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHQvLyBSZWxlYXNlIG5vdGVzIGJ1dHRvblxuXHRcdHRoaXMucmVsZWFzZU5vdGVzVmVyc2lvbiA9IHZlcnNpb24gPz8gdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uO1xuXHRcdHRoaXMucmVsZWFzZU5vdGVzQnV0dG9uLnN0eWxlLmRpc3BsYXkgPSB0aGlzLnJlbGVhc2VOb3Rlc1ZlcnNpb24gPyAnJyA6ICdub25lJztcblx0XHR0aGlzLnJlbGVhc2VOb3Rlc0J1dHRvbi5zdHlsZS5tYXJnaW5SaWdodCA9IHRoaXMucmVsZWFzZU5vdGVzVmVyc2lvbiA/ICdhdXRvJyA6ICcnO1xuXHRcdHRoaXMuYnV0dG9uQmFyLnN0eWxlLmRpc3BsYXkgPSB0aGlzLnJlbGVhc2VOb3Rlc1ZlcnNpb24gPyAnJyA6ICdub25lJztcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQWN0aW9uQnV0dG9uKGxhYmVsOiBzdHJpbmcsIGNvbW1hbmRJZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5hY3Rpb25CdXR0b24udGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHR0aGlzLmFjdGlvbkJ1dHRvbi5kYXRhc2V0LmNvbW1hbmRJZCA9IGNvbW1hbmRJZDtcblx0XHR0aGlzLmFjdGlvbkJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1lc3NhZ2UobWVzc2FnZTogc3RyaW5nLCBpY29uPzogVGhlbWVJY29uKSB7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLm1lc3NhZ2VOb2RlKTtcblx0XHRpZiAoaWNvbikge1xuXHRcdFx0Y29uc3QgaWNvbk5vZGUgPSBkb20uYXBwZW5kKHRoaXMubWVzc2FnZU5vZGUsIGRvbS4kKCcuc3RhdGUtbWVzc2FnZS1pY29uJykpO1xuXHRcdFx0aWNvbk5vZGUuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpY29uKSk7XG5cdFx0fVxuXHRcdGRvbS5hcHBlbmQodGhpcy5tZXNzYWdlTm9kZSwgZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobWVzc2FnZSkpO1xuXHRcdHRoaXMubWVzc2FnZU5vZGUuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVWZXJzaW9uUm93KHBhcmVudDogSFRNTEVsZW1lbnQpOiB7IGxhYmVsOiBIVE1MRWxlbWVudDsgY29weVZhbHVlOiB7IHZhbHVlOiBzdHJpbmcgfSB9IHtcblx0XHRjb25zdCByb3cgPSBkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJy5wcm9kdWN0LXZlcnNpb24nKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJ3NwYW4nKSk7XG5cdFx0Y29uc3QgY29weVZhbHVlID0geyB2YWx1ZTogJycgfTtcblxuXHRcdGNvbnN0IGNvcHlCdXR0b24gPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJ2EuY29weS12ZXJzaW9uLWJ1dHRvbicpKTtcblx0XHRjb3B5QnV0dG9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRjb3B5QnV0dG9uLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdGNvbnN0IHRpdGxlID0gbG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuY29weVZlcnNpb24nLCBcIkNvcHlcIik7XG5cdFx0Y29weUJ1dHRvbi50aXRsZSA9IHRpdGxlO1xuXHRcdGNvcHlCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGl0bGUpO1xuXG5cdFx0Y29uc3QgY29weUljb24gPSBkb20uYXBwZW5kKGNvcHlCdXR0b24sIGRvbS4kKCcuY29weS1pY29uJykpO1xuXHRcdGNvcHlJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5jb3B5KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb3B5QnV0dG9uLCAnY2xpY2snLCBlID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRpZiAoY29weVZhbHVlLnZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoY29weVZhbHVlLnZhbHVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4geyBsYWJlbCwgY29weVZhbHVlIH07XG5cdH1cblxuXHRwcml2YXRlIHJ1bkNvbW1hbmRBbmRDbG9zZShjb21tYW5kOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZCwgLi4uYXJncyk7XG5cdFx0dGhpcy5ob3ZlclNlcnZpY2UuaGlkZUhvdmVyKHRydWUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBeUMsbUJBQWtHLGlCQUEyQjtBQUN0SyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHNCQUFzQiw4QkFBOEIsd0JBQXdCLGFBQWEsWUFBWSxxQkFBcUIsb0JBQW9CO0FBQ3ZKLE9BQU87QUFLQSxJQUFNLGdCQUFOLGNBQTRCLFdBQVc7QUFBQSxFQW9DN0MsWUFDcUMsa0JBQ0YsZ0JBQ00sc0JBQ1IsY0FDWSwwQkFDVixnQkFDakM7QUFDRCxVQUFNO0FBUDhCO0FBQ0Y7QUFDTTtBQUNSO0FBQ1k7QUFDVjtBQUlsQyxTQUFLLFVBQVUsSUFBSSxFQUFFLGlCQUFpQjtBQUd0QyxVQUFNLFNBQVMsSUFBSSxPQUFPLEtBQUssU0FBUyxJQUFJLEVBQUUsU0FBUyxDQUFDO0FBQ3hELFNBQUssWUFBWSxJQUFJLE9BQU8sUUFBUSxJQUFJLEVBQUUsUUFBUSxDQUFDO0FBR25ELFNBQUssa0JBQWtCLElBQUksT0FBTyxLQUFLLFNBQVMsSUFBSSxFQUFFLGVBQWUsQ0FBQztBQUV0RSxVQUFNLGdC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
